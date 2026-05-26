import { OHLCVBar } from '../data/market';
import { ChartAnalysis } from './claude';
import * as indicators from '../indicators';
import { analyzeSwings } from './swingDetector';

export async function analyzeSymbolWithTA(
  symbol: string,
  bars: OHLCVBar[]
): Promise<ChartAnalysis> {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

  const currentPrice = closes[closes.length - 1];

  // ── Compute all indicator arrays ──────────────────────────────────────────
  const rsiArr = indicators.calculateRSI(closes, 14);
  const macdArr = indicators.calculateMACD(closes);
  const bbArr = indicators.calculateBollingerBands(closes, 20, 2);
  const ema9Arr = indicators.calculateEMA(closes, 9);
  const ema20Arr = indicators.calculateEMA(closes, 20);
  const ema50Arr = indicators.calculateEMA(closes, 50);
  const ema200Arr = indicators.calculateEMA(closes, 200);
  const atrArr = indicators.calculateATR(highs, lows, closes, 14);

  // ── Last values ───────────────────────────────────────────────────────────
  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
  const macd = macdArr.length > 0 ? macdArr[macdArr.length - 1] : null;
  const prevMacd = macdArr.length > 1 ? macdArr[macdArr.length - 2] : null;
  const bb = bbArr.length > 0 ? bbArr[bbArr.length - 1] : null;
  const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : null;
  const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : null;
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : null;
  const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : null;
  const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : currentPrice * 0.015;

  // Volume ratio vs 20-day avg
  const volSma = indicators.calculateSMA(volumes, 20);
  const avgVol = volSma.length > 0 ? volSma[volSma.length - 1] : 1;
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const volRatio = avgVol > 0 ? lastVol / avgVol : 1;

  // Momentum score and squeeze
  const momentumScore = indicators.calculateMomentumScore(closes);
  const squeeze = indicators.detectSqueeze(highs, lows, closes);

  // ── Swing analysis ────────────────────────────────────────────────────────
  const swingAnalysis = analyzeSwings(bars, rsiArr, currentPrice);
  const { lastSwingHigh, lastSwingLow, potentialTop, potentialBottom, topConfidence, bottomConfidence, rsiDivergences, fibLevels } = swingAnalysis;

  // ── Trend detection ───────────────────────────────────────────────────────
  let trendDir: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';

  const emaStack =
    ema9 !== null && ema20 !== null && ema50 !== null
      ? ema9 > ema20 && ema20 > ema50
        ? 'UP'
        : ema9 < ema20 && ema20 < ema50
        ? 'DOWN'
        : 'SIDEWAYS'
      : 'SIDEWAYS';

  if (emaStack === 'UP' || swingAnalysis.currentTrend === 'UP') {
    trendDir = 'UP';
  } else if (emaStack === 'DOWN' || swingAnalysis.currentTrend === 'DOWN') {
    trendDir = 'DOWN';
  }

  // EMA separation % (use ema9 vs ema50 spread)
  const emaSeparation =
    ema9 !== null && ema50 !== null && ema50 !== 0
      ? (Math.abs(ema9 - ema50) / ema50) * 100
      : 0;

  let trendStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  if (emaSeparation > 3 && Math.abs(momentumScore) > 5) {
    trendStrength = 'STRONG';
  } else if (emaSeparation > 1.5) {
    trendStrength = 'MODERATE';
  } else {
    trendStrength = 'WEAK';
  }

  // Trend structure description
  let trendStructure: string;
  if (trendDir === 'UP') {
    trendStructure = `Bullish EMA alignment (9>${ema20 !== null ? '20' : ''}>${ema50 !== null ? '50' : ''}). ${swingAnalysis.currentTrend === 'UP' ? 'Higher highs and higher lows confirmed.' : 'Momentum positive.'}`;
  } else if (trendDir === 'DOWN') {
    trendStructure = `Bearish EMA alignment. ${swingAnalysis.currentTrend === 'DOWN' ? 'Lower highs and lower lows confirmed.' : 'Momentum negative.'}`;
  } else {
    trendStructure = 'EMAs compressed — price in consolidation phase.';
  }

  // ── Top / Bottom signal ───────────────────────────────────────────────────
  let topBottomType: 'TOP' | 'BOTTOM' | 'NONE' = 'NONE';
  let topBottomConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const topBottomReasons: string[] = [];

  if (potentialTop) {
    topBottomType = 'TOP';
    if (topConfidence > 70) topBottomConfidence = 'HIGH';
    else if (topConfidence > 40) topBottomConfidence = 'MEDIUM';
    else topBottomConfidence = 'LOW';

    if (rsi > 70) topBottomReasons.push(`RSI overbought (${rsi.toFixed(1)})`);
    const bearishDiv = rsiDivergences.find((d) => d.type === 'BEARISH');
    if (bearishDiv) topBottomReasons.push('Bearish RSI divergence');
    if (swingAnalysis.nearSwingHigh) topBottomReasons.push('Near prior swing high');
    if (bb && closes[closes.length - 1] >= bb.upper * 0.995) topBottomReasons.push('Price touching BB upper');
  } else if (potentialBottom) {
    topBottomType = 'BOTTOM';
    if (bottomConfidence > 70) topBottomConfidence = 'HIGH';
    else if (bottomConfidence > 40) topBottomConfidence = 'MEDIUM';
    else topBottomConfidence = 'LOW';

    if (rsi < 30) topBottomReasons.push(`RSI oversold (${rsi.toFixed(1)})`);
    const bullishDiv = rsiDivergences.find((d) => d.type === 'BULLISH');
    if (bullishDiv) topBottomReasons.push('Bullish RSI divergence');
    if (swingAnalysis.nearSwingLow) topBottomReasons.push('Near prior swing low');
    if (bb && closes[closes.length - 1] <= bb.lower * 1.005) topBottomReasons.push('Price touching BB lower');
  }

  const topBottomReasoning =
    topBottomReasons.length > 0
      ? topBottomReasons.join('. ') + '.'
      : topBottomType === 'NONE'
      ? 'No significant reversal signal detected at current price level.'
      : 'Reversal conditions forming.';

  // ── Key levels ────────────────────────────────────────────────────────────
  const supportLevels: number[] = [];
  const resistanceLevels: number[] = [];

  if (lastSwingLow) supportLevels.push(lastSwingLow.price);
  if (bb) supportLevels.push(bb.lower);
  if (ema50 !== null) supportLevels.push(ema50);

  if (lastSwingHigh) resistanceLevels.push(lastSwingHigh.price);
  if (bb) resistanceLevels.push(bb.upper);
  if (ema20 !== null) resistanceLevels.push(ema20);

  // Dedup to 2 decimal places and sort
  const dedup = (arr: number[]) =>
    [...new Set(arr.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  const support = dedup(supportLevels);
  const resistance = dedup(resistanceLevels);

  // Key level: 50% Fibonacci
  const fibFifty = fibLevels.find((f) => f.level === 0.5);
  const keyLevel = fibFifty ? Math.round(fibFifty.price * 100) / 100 : null;

  // ── Pattern detection ─────────────────────────────────────────────────────
  const patterns: ChartAnalysis['patterns'] = [];

  // BB Squeeze
  if (squeeze) {
    patterns.push({
      name: 'Bollinger Band Squeeze',
      implication: trendDir === 'UP' ? 'BULLISH' : trendDir === 'DOWN' ? 'BEARISH' : 'NEUTRAL',
      completion: 'FORMING',
      target: null,
    });
  }

  // MACD bullish crossover: prev histogram < 0, current > 0
  if (macd && prevMacd && prevMacd.histogram < 0 && macd.histogram > 0) {
    patterns.push({
      name: 'MACD Bullish Crossover',
      implication: 'BULLISH',
      completion: 'COMPLETE',
      target: null,
    });
  }

  // MACD bearish crossover: prev histogram > 0, current < 0
  if (macd && prevMacd && prevMacd.histogram > 0 && macd.histogram < 0) {
    patterns.push({
      name: 'MACD Bearish Crossover',
      implication: 'BEARISH',
      completion: 'COMPLETE',
      target: null,
    });
  }

  // Bullish EMA stack
  if (ema9 !== null && ema20 !== null && ema50 !== null && ema9 > ema20 && ema20 > ema50 && momentumScore > 3) {
    patterns.push({
      name: 'Bullish EMA Stack',
      implication: 'BULLISH',
      completion: 'COMPLETE',
      target: null,
    });
  }

  // Bearish EMA stack
  if (ema9 !== null && ema20 !== null && ema50 !== null && ema9 < ema20 && ema20 < ema50 && momentumScore < -3) {
    patterns.push({
      name: 'Bearish EMA Stack',
      implication: 'BEARISH',
      completion: 'COMPLETE',
      target: null,
    });
  }

  // RSI divergences
  for (const div of rsiDivergences) {
    const isBullish = div.type === 'BULLISH' || div.type === 'HIDDEN_BULLISH';
    const name =
      div.type === 'BULLISH'
        ? 'Bullish RSI Divergence'
        : div.type === 'HIDDEN_BULLISH'
        ? 'Hidden Bullish RSI Divergence'
        : div.type === 'BEARISH'
        ? 'Bearish RSI Divergence'
        : 'Hidden Bearish RSI Divergence';

    patterns.push({
      name,
      implication: isBullish ? 'BULLISH' : 'BEARISH',
      completion: 'COMPLETE',
      target: null,
    });
  }

  // ── Swing setup ───────────────────────────────────────────────────────────
  const longSetup = trendDir === 'UP' || (potentialBottom && topBottomConfidence !== 'LOW') || rsi < 35;
  const shortSetup = trendDir === 'DOWN' || (potentialTop && topBottomConfidence !== 'LOW') || rsi > 65;

  const setupExists = longSetup || shortSetup;

  // Prefer long unless strong downtrend
  let setupDir: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
  if (longSetup && shortSetup) {
    setupDir = trendDir === 'DOWN' && trendStrength === 'STRONG' ? 'SHORT' : 'LONG';
  } else if (longSetup) {
    setupDir = 'LONG';
  } else if (shortSetup) {
    setupDir = 'SHORT';
  }

  let entry: number | null = null;
  let stopLoss: number | null = null;
  let target1: number | null = null;
  let target2: number | null = null;
  let riskReward: number | null = null;
  let setupDescription = 'No clear swing setup at this time.';

  if (setupDir === 'LONG') {
    entry = currentPrice;
    stopLoss = Math.round((entry - atr * 1.5) * 100) / 100;
    const risk = entry - stopLoss;
    target1 = Math.round((entry + risk * 2) * 100) / 100;
    target2 = Math.round((entry + risk * 3) * 100) / 100;
    riskReward = 2;
    setupDescription = `Long setup near ${entry.toFixed(2)}. Stop below ${stopLoss.toFixed(2)} (1.5x ATR). Target 1: ${target1.toFixed(2)} (2:1 R/R), Target 2: ${target2.toFixed(2)} (3:1 R/R).`;
  } else if (setupDir === 'SHORT') {
    entry = currentPrice;
    stopLoss = Math.round((entry + atr * 1.5) * 100) / 100;
    const risk = stopLoss - entry;
    target1 = Math.round((entry - risk * 2) * 100) / 100;
    target2 = Math.round((entry - risk * 3) * 100) / 100;
    riskReward = 2;
    setupDescription = `Short setup near ${entry.toFixed(2)}. Stop above ${stopLoss.toFixed(2)} (1.5x ATR). Target 1: ${target1.toFixed(2)} (2:1 R/R), Target 2: ${target2.toFixed(2)} (3:1 R/R).`;
  }

  // ── Signal strength (1-10) ────────────────────────────────────────────────
  let signalStrength = 3;
  if (trendStrength === 'STRONG') signalStrength += 2;
  else if (trendStrength === 'MODERATE') signalStrength += 1;
  if (topBottomConfidence === 'HIGH') signalStrength += 2;
  else if (topBottomConfidence === 'MEDIUM') signalStrength += 1;
  signalStrength += Math.min(2, rsiDivergences.length);
  if (squeeze) signalStrength += 1;
  if (volRatio > 2.0) signalStrength += 1;
  signalStrength = Math.min(10, Math.max(1, signalStrength));

  // ── Indicator signals ─────────────────────────────────────────────────────
  let rsiSignal: ChartAnalysis['indicators']['rsiSignal'] = 'NEUTRAL';
  if (rsi < 30) {
    rsiSignal = 'OVERSOLD';
  } else if (rsi > 70) {
    rsiSignal = 'OVERBOUGHT';
  } else {
    const hasBullishDiv = rsiDivergences.some((d) => d.type === 'BULLISH' || d.type === 'HIDDEN_BULLISH');
    const hasBearishDiv = rsiDivergences.some((d) => d.type === 'BEARISH' || d.type === 'HIDDEN_BEARISH');
    if (hasBullishDiv) rsiSignal = 'DIVERGENCE_BULLISH';
    else if (hasBearishDiv) rsiSignal = 'DIVERGENCE_BEARISH';
  }

  let macdSignal: ChartAnalysis['indicators']['macdSignal'] = 'NEUTRAL';
  if (macd) {
    if (macd.histogram > 0 && macd.value > macd.signal) macdSignal = 'BULLISH';
    else if (macd.histogram < 0) macdSignal = 'BEARISH';
  }

  let volumeSignal: ChartAnalysis['indicators']['volumeSignal'] = 'NORMAL';
  if (volRatio > 2.5) volumeSignal = 'SURGE';
  else if (volRatio < 0.7) volumeSignal = 'DECLINING';

  // EMA alignment text
  const emaAlignText =
    ema9 !== null && ema20 !== null && ema50 !== null
      ? ema9 > ema20 && ema20 > ema50
        ? 'EMA9>20>50 bullish stack'
        : ema9 < ema20 && ema20 < ema50
        ? 'EMA9<20<50 bearish stack'
        : 'EMAs mixed'
      : 'EMAs insufficient data';

  const indicatorSummary = [
    `RSI(14): ${rsi.toFixed(1)}`,
    macd ? `MACD histogram: ${macd.histogram > 0 ? '+' : ''}${macd.histogram.toFixed(3)}` : null,
    emaAlignText,
    atr ? `ATR: ${atr.toFixed(2)}` : null,
    `Volume: ${volRatio.toFixed(1)}x avg`,
  ]
    .filter(Boolean)
    .join(' | ');

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (volRatio < 0.8) warnings.push('Low volume — signals less reliable');
  if (bb && bb.width * 100 < 5) warnings.push('Tight Bollinger Bands — big move expected soon');
  if (rsi > 65 && trendDir === 'UP') warnings.push('RSI elevated in uptrend — watch for exhaustion');
  if (rsi < 35 && trendDir === 'DOWN') warnings.push('RSI depressed in downtrend — watch for dead-cat bounce');

  // ── 3-sentence summary ────────────────────────────────────────────────────
  const sentenceTrend =
    `${symbol} is in a ${trendStrength.toLowerCase()} ${trendDir.toLowerCase()} trend` +
    (topBottomType !== 'NONE'
      ? ` with a ${topBottomConfidence.toLowerCase()}-confidence potential ${topBottomType.toLowerCase()} signal`
      : '');

  const sentenceSetup =
    setupDir !== 'NONE'
      ? `${setupDir === 'LONG' ? 'Long' : 'Short'} swing setup: entry ${entry?.toFixed(2)}, stop ${stopLoss?.toFixed(2)}, targets ${target1?.toFixed(2)} / ${target2?.toFixed(2)}.`
      : 'No clear swing setup at this time.';

  const sentenceQuality =
    signalStrength >= 7
      ? `Signal quality is high (${signalStrength}/10) — multiple confirming factors align.`
      : signalStrength >= 4
      ? `Signal quality is moderate (${signalStrength}/10) — proceed with caution and confirm on lower timeframe.`
      : `Signal quality is low (${signalStrength}/10) — wait for clearer setup before risking capital.`;

  const summary = `${sentenceTrend}. ${sentenceSetup} ${sentenceQuality}`;

  return {
    currentPrice,
    trend: {
      direction: trendDir,
      strength: trendStrength,
      structure: trendStructure,
    },
    topBottomSignal: {
      type: topBottomType,
      confidence: topBottomConfidence,
      reasoning: topBottomReasoning,
    },
    keyLevels: {
      support,
      resistance,
      keyLevel,
    },
    patterns,
    swingSetup: {
      exists: setupExists && setupDir !== 'NONE',
      direction: setupDir,
      entry,
      stopLoss,
      target1,
      target2,
      riskReward,
      timeframe: 'Daily',
      description: setupDescription,
    },
    indicators: {
      rsiSignal,
      macdSignal,
      volumeSignal,
      summary: indicatorSummary,
    },
    signalStrength,
    summary,
    warnings,
    analysedAt: new Date(),
    source: 'data',
  };
}
