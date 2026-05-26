import { Router, Request, Response } from 'express';
import { fetchBatchQuotes, fetchHistoricalData, fetchIntradayBars, fetchMarketOverview, fetchNews } from '../data/market';
import { store } from '../store';
import * as indicators from '../indicators';
import { logError } from '../utils/logger';

const router = Router();

/**
 * Determine market status based on current ET time.
 */
function getMarketStatus(): 'PRE_MARKET' | 'OPEN' | 'AFTER_HOURS' | 'CLOSED' {
  const now = new Date();
  const dayOfWeek = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });

  // Closed on weekends
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') return 'CLOSED';

  const etTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const preMarketOpen = 4 * 60;       // 4:00 AM ET
  const marketOpen = 9 * 60 + 30;     // 9:30 AM ET
  const marketClose = 16 * 60;        // 4:00 PM ET
  const afterHoursClose = 20 * 60;    // 8:00 PM ET

  if (totalMinutes < preMarketOpen) return 'CLOSED';
  if (totalMinutes < marketOpen) return 'PRE_MARKET';
  if (totalMinutes < marketClose) return 'OPEN';
  if (totalMinutes < afterHoursClose) return 'AFTER_HOURS';
  return 'CLOSED';
}

/**
 * GET /api/market/overview
 * Returns market overview: SPY, QQQ, IWM, VIX + top gainers/losers from scan results.
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const marketData = await fetchMarketOverview();

    const spy = marketData.find((d) => d.symbol === 'SPY');
    const qqq = marketData.find((d) => d.symbol === 'QQQ');
    const iwm = marketData.find((d) => d.symbol === 'IWM');
    const vix = marketData.find((d) => d.symbol === 'VIX');

    // Pull top gainers/losers from cached scan results
    const scanResults = store.getScanResults();
    const topGainers = [...scanResults]
      .filter((r) => r.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);
    const topLosers = [...scanResults]
      .filter((r) => r.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 10);
    const mostActive = [...scanResults]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    res.json({
      success: true,
      overview: {
        spyChange: spy?.changePercent ?? 0,
        qqqChange: qqq?.changePercent ?? 0,
        iwmChange: iwm?.changePercent ?? 0,
        vixLevel: vix?.price ?? 0,
        marketStatus: getMarketStatus(),
        topGainers,
        topLosers,
        mostActive,
        indices: marketData,
        lastUpdate: new Date(),
      },
    });
  } catch (err) {
    logError('Failed to fetch market overview', err);
    res.status(500).json({ success: false, message: 'Failed to fetch market data' });
  }
});

/**
 * GET /api/stock/:symbol/quote
 * Get current quote for a symbol.
 */
router.get('/stock/:symbol/quote', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  try {
    const quotes = await fetchBatchQuotes([symbol.toUpperCase()]);
    if (quotes.length === 0) {
      return res.status(404).json({ success: false, message: `Symbol ${symbol} not found` });
    }
    return res.json({ success: true, quote: quotes[0] });
  } catch (err) {
    logError(`Failed to fetch quote for ${symbol}`, err);
    return res.status(500).json({ success: false, message: 'Failed to fetch quote' });
  }
});

/**
 * GET /api/stock/:symbol/history
 * Get historical OHLCV bars for charting.
 * Query: period=1mo|3mo|6mo|1y (default: 3mo), interval=15m|h|4h (intraday)
 */
router.get('/stock/:symbol/history', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const period = (req.query.period as '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max') || '3mo';
  const interval = req.query.interval as string | undefined;

  const validPeriods = ['1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'];
  if (!interval && !validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      message: `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
    });
  }

  try {
    let bars;
    if (interval === '15m' || interval === 'h' || interval === '4h') {
      bars = await fetchIntradayBars(symbol.toUpperCase(), interval);
      if (bars.length < 5) bars = await fetchHistoricalData(symbol.toUpperCase(), '1mo');
    } else {
      bars = await fetchHistoricalData(symbol.toUpperCase(), period);
    }
    return res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period: interval ?? period,
      count: bars.length,
      bars,
    });
  } catch (err) {
    logError(`Failed to fetch history for ${symbol}`, err);
    return res.status(500).json({ success: false, message: 'Failed to fetch historical data' });
  }
});

/**
 * GET /api/stock/:symbol/indicators
 * Calculate and return all technical indicators for a symbol.
 */
router.get('/stock/:symbol/indicators', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const period = (req.query.period as '1mo' | '3mo' | '6mo' | '1y') || '3mo';

  try {
    const bars = await fetchHistoricalData(symbol.toUpperCase(), period);
    if (bars.length < 20) {
      return res.status(422).json({
        success: false,
        message: `Not enough data to calculate indicators (got ${bars.length} bars, need 20+)`,
      });
    }

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const volumes = bars.map((b) => b.volume);

    const rsiArr = indicators.calculateRSI(closes, 14);
    const macdArr = indicators.calculateMACD(closes);
    const bbArr = indicators.calculateBollingerBands(closes, 20, 2);
    const ema9Arr = indicators.calculateEMA(closes, 9);
    const ema20Arr = indicators.calculateEMA(closes, 20);
    const ema50Arr = indicators.calculateEMA(closes, 50);
    const ema200Arr = indicators.calculateEMA(closes, 200);
    const atrArr = indicators.calculateATR(highs, lows, closes, 14);
    const vwapArr = indicators.calculateVWAP(highs, lows, closes, volumes);
    const stochRSIArr = indicators.calculateStochRSI(closes);
    const squeeze = indicators.detectSqueeze(highs, lows, closes);
    const momentumScore = indicators.calculateMomentumScore(closes);

    // Swing high/low for fibonacci (last 20 bars)
    const recent = bars.slice(-20);
    const swingHigh = Math.max(...recent.map((b) => b.high));
    const swingLow = Math.min(...recent.map((b) => b.low));
    const fibLevels = indicators.calculateFibLevels(swingHigh, swingLow);

    const last = <T>(arr: T[]): T | null => (arr.length > 0 ? arr[arr.length - 1] : null);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      period,
      bars: bars.length,
      indicators: {
        rsi14: last(rsiArr) !== null ? round2(last(rsiArr)!) : null,
        macd: last(macdArr),
        bollingerBands: last(bbArr),
        ema9: last(ema9Arr) !== null ? round2(last(ema9Arr)!) : null,
        ema20: last(ema20Arr) !== null ? round2(last(ema20Arr)!) : null,
        ema50: last(ema50Arr) !== null ? round2(last(ema50Arr)!) : null,
        ema200: last(ema200Arr) !== null ? round2(last(ema200Arr)!) : null,
        atr: last(atrArr) !== null ? round2(last(atrArr)!) : null,
        vwap: last(vwapArr) !== null ? round2(last(vwapArr)!) : null,
        stochRSI: last(stochRSIArr),
        squeeze,
        momentumScore,
        fibLevels,
        swingHigh,
        swingLow,
      },
      // Full series for charting (last 60 data points)
      series: {
        rsi: rsiArr.slice(-60).map(round2),
        macd: macdArr.slice(-60),
        bb: bbArr.slice(-60),
        ema9: ema9Arr.slice(-60).map(round2),
        ema20: ema20Arr.slice(-60).map(round2),
        ema50: ema50Arr.slice(-60).map(round2),
        ema200: ema200Arr.slice(-60).map(round2),
        atr: atrArr.slice(-60).map(round2),
        vwap: vwapArr.slice(-60).map(round2),
      },
    });
  } catch (err) {
    logError(`Failed to calculate indicators for ${symbol}`, err);
    return res.status(500).json({ success: false, message: 'Failed to calculate indicators' });
  }
});

/**
 * GET /api/stock/:symbol/news
 * Fetch recent news headlines for a symbol.
 */
router.get('/stock/:symbol/news', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  try {
    const news = await fetchNews(symbol.toUpperCase());
    return res.json({ success: true, symbol: symbol.toUpperCase(), news });
  } catch (err) {
    logError(`Failed to fetch news for ${symbol}`, err);
    return res.status(500).json({ success: false, message: 'Failed to fetch news' });
  }
});

export default router;
