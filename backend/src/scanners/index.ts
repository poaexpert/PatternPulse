import { ScanResult, Signal, ScanType, Direction, IndicatorValues } from '../types';
import { fetchBatchQuotes, fetchHistoricalData, QuoteData } from '../data/market';
import { SCAN_UNIVERSE } from '../data/universe';
import * as indicators from '../indicators';
import { log, logError } from '../utils/logger';

// SPY change cache (refreshed each scan) for relative strength calculation
let spyChangePercent = 0;

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Round to 2 decimal places
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Analyze a single stock and generate scan results.
 */
async function analyzeStock(
  symbol: string,
  quoteData: QuoteData
): Promise<ScanResult | null> {
  try {
    // Fetch 90 days of historical data
    const bars = await fetchHistoricalData(symbol, '3mo');
    if (bars.length < 20) return null; // not enough history

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const volumes = bars.map((b) => b.volume);
    const opens = bars.map((b) => b.open);

    // ── Calculate all indicators ──────────────────────────────────────────
    const rsiArr = indicators.calculateRSI(closes, 14);
    const macdArr = indicators.calculateMACD(closes);
    const bbArr = indicators.calculateBollingerBands(closes, 20, 2);
    const ema9Arr = indicators.calculateEMA(closes, 9);
    const ema20Arr = indicators.calculateEMA(closes, 20);
    const ema50Arr = indicators.calculateEMA(closes, 50);
    const ema200Arr = indicators.calculateEMA(closes, 200);
    const atrArr = indicators.calculateATR(highs, lows, closes, 14);
    const vwapArr = indicators.calculateVWAP(highs, lows, closes, volumes);

    // Latest values (last element)
    const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : undefined;
    const macd = macdArr.length > 0 ? macdArr[macdArr.length - 1] : undefined;
    const macdPrev = macdArr.length > 1 ? macdArr[macdArr.length - 2] : undefined;
    const bb = bbArr.length > 0 ? bbArr[bbArr.length - 1] : undefined;
    const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : undefined;
    const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : undefined;
    const ema9Prev = ema9Arr.length > 1 ? ema9Arr[ema9Arr.length - 2] : undefined;
    const ema20Prev = ema20Arr.length > 1 ? ema20Arr[ema20Arr.length - 2] : undefined;
    const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : undefined;
    const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : undefined;
    const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : undefined;
    const vwap = vwapArr.length > 0 ? vwapArr[vwapArr.length - 1] : undefined;

    const currentPrice = quoteData.price;
    const currentVolume = quoteData.volume;
    const avgVolume = quoteData.avgVolume || 1;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Today's open: use last bar's open as proxy (or quoteData if available)
    const todayOpen = opens.length > 0 ? opens[opens.length - 1] : currentPrice;
    const prevClose = closes.length > 1 ? closes[closes.length - 2] : quoteData.previousClose;

    // ── Detect Signals ────────────────────────────────────────────────────
    const signals: Signal[] = [];
    const scanTypes: ScanType[] = [];

    // MOMENTUM: price up >2% with volume >1.5x avg
    if (quoteData.changePercent > 2 && volumeRatio > 1.5) {
      signals.push({
        type: 'MOMENTUM',
        description: `Up ${quoteData.changePercent.toFixed(1)}% on ${volumeRatio.toFixed(1)}x avg volume`,
        strength: Math.min(10, Math.round(quoteData.changePercent + volumeRatio)),
        direction: 'LONG',
      });
      scanTypes.push('MOMENTUM');
    }

    // VOLUME_SURGE: volume >3x average
    if (volumeRatio > 3) {
      const sigStrength = Math.min(10, Math.round(volumeRatio));
      signals.push({
        type: 'VOLUME_SURGE',
        description: `Volume ${volumeRatio.toFixed(1)}x above average (${formatVolume(currentVolume)})`,
        strength: sigStrength,
        direction: quoteData.changePercent >= 0 ? 'LONG' : 'SHORT',
      });
      scanTypes.push('VOLUME_SURGE');
    }

    // GAP_UP: today's open >2% above previous close
    if (prevClose > 0 && todayOpen > 0) {
      const gapPct = ((todayOpen - prevClose) / prevClose) * 100;
      if (gapPct > 2) {
        signals.push({
          type: 'GAP_UP',
          description: `Gapped up ${gapPct.toFixed(1)}% from previous close`,
          strength: Math.min(10, Math.round(3 + gapPct / 2)),
          direction: 'LONG',
        });
        scanTypes.push('GAP_UP');
      }

      // GAP_DOWN: today's open >2% below previous close
      if (gapPct < -2) {
        signals.push({
          type: 'GAP_DOWN',
          description: `Gapped down ${Math.abs(gapPct).toFixed(1)}% from previous close`,
          strength: Math.min(10, Math.round(3 + Math.abs(gapPct) / 2)),
          direction: 'SHORT',
        });
        scanTypes.push('GAP_DOWN');
      }
    }

    // BREAKOUT: price within 1% of 52-week high with volume surge
    const high52 = quoteData.high52Week;
    const low52 = quoteData.low52Week;

    if (high52 && high52 > 0) {
      const pctFrom52High = ((high52 - currentPrice) / high52) * 100;
      if (pctFrom52High <= 1 && volumeRatio > 1.5) {
        signals.push({
          type: 'BREAKOUT',
          description: `Near 52-week high ($${high52.toFixed(2)}) with ${volumeRatio.toFixed(1)}x volume`,
          strength: Math.min(10, Math.round(5 + volumeRatio)),
          direction: 'LONG',
        });
        scanTypes.push('BREAKOUT');
      }
    }

    // BREAKDOWN: price within 1% of 52-week low
    if (low52 && low52 > 0) {
      const pctFrom52Low = ((currentPrice - low52) / low52) * 100;
      if (pctFrom52Low <= 1) {
        signals.push({
          type: 'BREAKDOWN',
          description: `Near 52-week low ($${low52.toFixed(2)})`,
          strength: 6,
          direction: 'SHORT',
        });
        scanTypes.push('BREAKDOWN');
      }
    }

    // RSI_OVERSOLD: RSI < 30
    if (rsi !== undefined && rsi < 30) {
      signals.push({
        type: 'RSI_OVERSOLD',
        description: `RSI at ${rsi.toFixed(1)} — oversold territory`,
        strength: Math.min(10, Math.round(10 - rsi / 3)),
        direction: 'LONG',
      });
      scanTypes.push('RSI_OVERSOLD');
    }

    // RSI_OVERBOUGHT: RSI > 70
    if (rsi !== undefined && rsi > 70) {
      signals.push({
        type: 'RSI_OVERBOUGHT',
        description: `RSI at ${rsi.toFixed(1)} — overbought territory`,
        strength: Math.min(10, Math.round(rsi / 10)),
        direction: 'SHORT',
      });
      scanTypes.push('RSI_OVERBOUGHT');
    }

    // MACD_BULLISH: MACD line crossed above signal line in last 2 bars
    if (
      macd !== undefined &&
      macdPrev !== undefined &&
      macd.value > macd.signal &&
      macdPrev.value <= macdPrev.signal
    ) {
      signals.push({
        type: 'MACD_BULLISH',
        description: `MACD bullish crossover (hist: +${macd.histogram.toFixed(3)})`,
        strength: 6,
        direction: 'LONG',
      });
      scanTypes.push('MACD_BULLISH');
    }

    // MACD_BEARISH: MACD crossed below signal line in last 2 bars
    if (
      macd !== undefined &&
      macdPrev !== undefined &&
      macd.value < macd.signal &&
      macdPrev.value >= macdPrev.signal
    ) {
      signals.push({
        type: 'MACD_BEARISH',
        description: `MACD bearish crossover (hist: ${macd.histogram.toFixed(3)})`,
        strength: 6,
        direction: 'SHORT',
      });
      scanTypes.push('MACD_BEARISH');
    }

    // BB_SQUEEZE: Bollinger bandwidth < 10% (tight consolidation)
    if (bb && bb.width < 0.10) {
      const sqz = indicators.detectSqueeze(highs, lows, closes);
      signals.push({
        type: 'BB_SQUEEZE',
        description: `Bollinger Band squeeze — BW ${(bb.width * 100).toFixed(1)}%${sqz ? ' (confirmed squeeze)' : ''}`,
        strength: sqz ? 7 : 5,
        direction: 'NEUTRAL',
      });
      scanTypes.push('BB_SQUEEZE');
    }

    // EMA_CROSS_BULLISH: EMA9 crossed above EMA20 in last 2 bars
    if (
      ema9 !== undefined && ema20 !== undefined &&
      ema9Prev !== undefined && ema20Prev !== undefined &&
      ema9 > ema20 && ema9Prev <= ema20Prev
    ) {
      signals.push({
        type: 'EMA_CROSS_BULLISH',
        description: `EMA9 crossed above EMA20 (bullish golden cross)`,
        strength: 7,
        direction: 'LONG',
      });
      scanTypes.push('EMA_CROSS_BULLISH');
    }

    // EMA_CROSS_BEARISH: EMA9 crossed below EMA20
    if (
      ema9 !== undefined && ema20 !== undefined &&
      ema9Prev !== undefined && ema20Prev !== undefined &&
      ema9 < ema20 && ema9Prev >= ema20Prev
    ) {
      signals.push({
        type: 'EMA_CROSS_BEARISH',
        description: `EMA9 crossed below EMA20 (bearish death cross)`,
        strength: 7,
        direction: 'SHORT',
      });
      scanTypes.push('EMA_CROSS_BEARISH');
    }

    // RELATIVE_STRENGTH: stock up >2x SPY change today
    if (spyChangePercent !== 0 && quoteData.changePercent > 0 && spyChangePercent > 0) {
      if (quoteData.changePercent > spyChangePercent * 2) {
        signals.push({
          type: 'RELATIVE_STRENGTH',
          description: `${quoteData.changePercent.toFixed(1)}% vs SPY ${spyChangePercent.toFixed(1)}% — outperforming 2x`,
          strength: Math.min(10, Math.round(5 + quoteData.changePercent / spyChangePercent)),
          direction: 'LONG',
        });
        scanTypes.push('RELATIVE_STRENGTH');
      }
    }

    // PREMARKET_MOVER: significant pre-market activity
    if (quoteData.preMarketChangePercent !== undefined && Math.abs(quoteData.preMarketChangePercent) > 3) {
      const dir: Direction = quoteData.preMarketChangePercent > 0 ? 'LONG' : 'SHORT';
      signals.push({
        type: 'PREMARKET_MOVER',
        description: `Pre-market ${quoteData.preMarketChangePercent > 0 ? '+' : ''}${quoteData.preMarketChangePercent.toFixed(1)}% move`,
        strength: Math.min(10, Math.round(3 + Math.abs(quoteData.preMarketChangePercent) / 2)),
        direction: dir,
      });
      scanTypes.push('PREMARKET_MOVER');
    }

    // ── Filter: must have at least 1 signal ───────────────────────────────
    if (signals.length === 0) return null;

    // ── Composite strength (1-10) ─────────────────────────────────────────
    // Weighted average of signal strengths, bonus for multiple signals
    const avgSigStrength = signals.reduce((s, sig) => s + sig.strength, 0) / signals.length;
    const multiBonus = Math.min(2, (signals.length - 1) * 0.5);
    const rawStrength = Math.min(10, avgSigStrength + multiBonus);
    const compositeStrength = Math.max(1, Math.round(rawStrength));

    // Filter: minimum strength of 3
    if (compositeStrength < 3) return null;

    // ── Direction: vote by signal directions ──────────────────────────────
    let longVotes = 0;
    let shortVotes = 0;
    for (const sig of signals) {
      if (sig.direction === 'LONG') longVotes += sig.strength;
      else if (sig.direction === 'SHORT') shortVotes += sig.strength;
    }
    const direction: Direction =
      longVotes > shortVotes ? 'LONG' : shortVotes > longVotes ? 'SHORT' : 'NEUTRAL';

    // ── Trade levels using ATR ────────────────────────────────────────────
    let entry: number | undefined;
    let stopLoss: number | undefined;
    let target1: number | undefined;
    let target2: number | undefined;
    let riskReward: number | undefined;

    if (atr && atr > 0 && currentPrice > 0) {
      entry = r2(currentPrice);
      if (direction === 'LONG') {
        stopLoss = r2(entry - 1.5 * atr);
        target1 = r2(entry + 2 * atr);
        target2 = r2(entry + 3 * atr);
      } else if (direction === 'SHORT') {
        stopLoss = r2(entry + 1.5 * atr);
        target1 = r2(entry - 2 * atr);
        target2 = r2(entry - 3 * atr);
      }
      if (stopLoss !== undefined && target1 !== undefined) {
        const risk = Math.abs(entry - stopLoss);
        const reward = Math.abs(target1 - entry);
        riskReward = risk > 0 ? r2(reward / risk) : undefined;
      }
    }

    // ── Build indicator values object ─────────────────────────────────────
    const indicatorValues: IndicatorValues = {
      rsi14: rsi !== undefined ? r2(rsi) : undefined,
      macd: macd
        ? { value: r2(macd.value), signal: r2(macd.signal), histogram: r2(macd.histogram) }
        : undefined,
      bb: bb
        ? {
            upper: r2(bb.upper),
            middle: r2(bb.middle),
            lower: r2(bb.lower),
            width: r2(bb.width),
            percentB: r2(bb.percentB),
          }
        : undefined,
      ema9: ema9 !== undefined ? r2(ema9) : undefined,
      ema20: ema20 !== undefined ? r2(ema20) : undefined,
      ema50: ema50 !== undefined ? r2(ema50) : undefined,
      ema200: ema200 !== undefined ? r2(ema200) : undefined,
      vwap: vwap !== undefined ? r2(vwap) : undefined,
      atr: atr !== undefined ? r2(atr) : undefined,
      volumeRatio: r2(volumeRatio),
    };

    return {
      symbol,
      name: quoteData.name,
      price: r2(currentPrice),
      change: r2(quoteData.change),
      changePercent: r2(quoteData.changePercent),
      volume: currentVolume,
      avgVolume,
      volumeRatio: r2(volumeRatio),
      marketCap: quoteData.marketCap,
      high52Week: high52,
      low52Week: low52,
      signals,
      indicators: indicatorValues,
      scanTypes: [...new Set(scanTypes)],
      strength: compositeStrength,
      direction,
      entry,
      stopLoss,
      target1,
      target2,
      riskReward,
      timestamp: new Date(),
    };
  } catch (err) {
    logError(`analyzeStock failed for ${symbol}`, err);
    return null;
  }
}

// Volume formatter helper
function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

/**
 * Run a full scan across the entire stock universe.
 */
export async function runFullScan(): Promise<ScanResult[]> {
  log(`Starting full scan of ${SCAN_UNIVERSE.length} symbols...`);

  // 1. Fetch all quotes first
  const allQuotes = await fetchBatchQuotes(SCAN_UNIVERSE);
  log(`Fetched ${allQuotes.length} quotes`);

  // 2. Cache SPY change for relative-strength calculations
  const spyQuote = allQuotes.find((q) => q.symbol === 'SPY');
  if (spyQuote) {
    spyChangePercent = spyQuote.changePercent;
  }

  // 3. Filter out penny stocks and illiquid names
  const eligible = allQuotes.filter(
    (q) => q.price >= 1 && q.volume >= 100_000
  );
  log(`${eligible.length} symbols pass price/volume filter`);

  // 4. Process in parallel batches of 20
  const batchSize = 20;
  const results: ScanResult[] = [];

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((q) => analyzeStock(q.symbol, q))
    );
    for (const r of batchResults) {
      if (r !== null) results.push(r);
    }
    // Small delay between batches to avoid rate-limiting Yahoo Finance
    if (i + batchSize < eligible.length) {
      await sleep(300);
    }
  }

  // 5. Sort by composite strength descending
  results.sort((a, b) => b.strength - a.strength);

  log(`Full scan complete: ${results.length} signals found`);
  return results;
}

/**
 * Run a targeted scan on a specific set of symbols (e.g. watchlist).
 */
export async function runWatchlistScan(symbols: string[]): Promise<ScanResult[]> {
  if (symbols.length === 0) return [];
  log(`Running watchlist scan for ${symbols.length} symbols`);

  const quotes = await fetchBatchQuotes(symbols);
  const results: ScanResult[] = [];

  // Refresh SPY if we have it in results
  const spyQuote = quotes.find((q) => q.symbol === 'SPY');
  if (spyQuote) spyChangePercent = spyQuote.changePercent;

  for (const q of quotes) {
    const r = await analyzeStock(q.symbol, q);
    if (r) results.push(r);
    await sleep(100);
  }

  results.sort((a, b) => b.strength - a.strength);
  log(`Watchlist scan complete: ${results.length} signals found`);
  return results;
}

/**
 * Analyze a single stock by symbol (for on-demand requests).
 */
export async function analyzeSingleStock(symbol: string): Promise<ScanResult | null> {
  try {
    const quotes = await fetchBatchQuotes([symbol]);
    if (quotes.length === 0) return null;
    return analyzeStock(symbol, quotes[0]);
  } catch (err) {
    logError(`analyzeSingleStock failed for ${symbol}`, err);
    return null;
  }
}
