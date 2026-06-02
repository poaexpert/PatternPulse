import { Router, Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { fetchBatchQuotes, fetchHistoricalData, fetchIntradayBars, fetchMarketOverview, fetchNews, type NewsItem } from '../data/market';
import { analyzeChartImage } from '../analysis/patternScanner';
import { analyzeSymbolWithTA } from '../analysis/technicalAnalysis';
import { store } from '../store';
import * as indicators from '../indicators';
import { logError } from '../utils/logger';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
 * GET /api/market/quotes
 * Batch quote fetch for multiple symbols.
 * Query: symbols=SPY,QQQ,XLK,...  (comma-separated, max 60)
 */
router.get('/quotes', async (req: Request, res: Response) => {
  const symbolsParam = req.query.symbols as string;
  if (!symbolsParam || !symbolsParam.trim()) {
    return res.status(400).json({ success: false, message: 'symbols query param required' });
  }
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 60);
  try {
    const quotes = await fetchBatchQuotes(symbols);
    return res.json({ success: true, quotes, count: quotes.length });
  } catch (err) {
    logError('Batch quotes failed', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch quotes' });
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

/**
 * GET /api/market/news?symbols=AAPL,TSLA,...
 * Fetch news for multiple symbols, merged, deduplicated, sorted by date.
 */
router.get('/news', async (req: Request, res: Response) => {
  const symbolsParam = req.query.symbols as string;
  if (!symbolsParam || !symbolsParam.trim()) {
    return res.status(400).json({ success: false, message: 'symbols query param required' });
  }
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10);

  try {
    const newsArrays = await Promise.allSettled(
      symbols.map(async (sym) => {
        const items = await fetchNews(sym);
        return items.map((item: NewsItem) => ({ ...item, symbol: sym }));
      })
    );

    const allNews: (NewsItem & { symbol: string })[] = [];
    for (const result of newsArrays) {
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
      }
    }

    // Deduplicate by title
    const seen = new Set<string>();
    const deduped = allNews.filter((item) => {
      const title = String(item.title ?? '').toLowerCase().trim();
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    });

    // Sort by pubDate desc
    deduped.sort((a, b) => {
      const da = new Date(String(a.pubDate ?? 0)).getTime();
      const db = new Date(String(b.pubDate ?? 0)).getTime();
      return db - da;
    });

    return res.json({ success: true, news: deduped.slice(0, 30) });
  } catch (err) {
    logError('Failed to fetch multi-symbol news', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch news' });
  }
});

/**
 * GET /api/market/earnings
 * Fetch upcoming earnings from FMP demo API.
 */
router.get('/earnings', async (req: Request, res: Response) => {
  try {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 14);

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fmt(from)}&to=${fmt(to)}&apikey=demo`;

    let earnings: Record<string, unknown>[] = [];
    try {
      const response = await axios.get(url, { timeout: 8000 });
      const data = response.data;
      if (Array.isArray(data)) {
        earnings = data.map((item: Record<string, unknown>) => ({
          symbol: item.symbol ?? '',
          name: item.name ?? item.symbol ?? '',
          date: item.date ?? '',
          epsEstimate: item.epsEstimated ?? null,
          epsActual: item.eps ?? null,
          revenueEstimate: item.revenueEstimated ?? null,
          revenueActual: item.revenue ?? null,
          time: (item.time as string)?.toLowerCase()?.includes('bmo') ? 'BMO' : 'AMC',
        }));
      }
    } catch {
      // FMP failed — return empty array
    }

    return res.json({ success: true, earnings });
  } catch (err) {
    logError('Failed to fetch earnings', err);
    return res.json({ success: true, earnings: [] });
  }
});

/**
 * GET /api/market/economic
 * Return hardcoded major US economic events for the next ~60 days.
 */
router.get('/economic', async (_req: Request, res: Response) => {
  const events = [
    // May 2026
    { date: '2026-05-27', name: 'Consumer Confidence (May)', impact: 'MEDIUM', category: 'SPENDING', description: 'Conference Board consumer confidence survey — forward-looking indicator of consumer spending.' },
    { date: '2026-05-28', name: 'PCE Inflation (April)', impact: 'HIGH', category: 'INFLATION', description: 'Personal Consumption Expenditures Price Index — the Fed\'s preferred inflation measure.' },
    { date: '2026-06-03', name: 'ISM Manufacturing PMI (May)', impact: 'MEDIUM', category: 'GROWTH', description: 'Manufacturing sector activity survey — expansion above 50.' },
    { date: '2026-06-05', name: 'Non-Farm Payrolls (May)', impact: 'HIGH', category: 'JOBS', description: 'Monthly employment report — key indicator for Fed policy decisions.' },
    { date: '2026-06-05', name: 'Unemployment Rate (May)', impact: 'HIGH', category: 'JOBS', description: 'Monthly unemployment rate — coincident indicator of labor market health.' },
    { date: '2026-06-10', name: 'CPI (May)', impact: 'HIGH', category: 'INFLATION', description: 'Consumer Price Index — key inflation gauge. Core CPI ex-food/energy watched closely.' },
    { date: '2026-06-11', name: 'PPI (May)', impact: 'MEDIUM', category: 'INFLATION', description: 'Producer Price Index — upstream inflation pipeline indicator.' },
    { date: '2026-06-16', name: 'FOMC Meeting (Day 1)', impact: 'HIGH', category: 'FED', description: 'Federal Open Market Committee two-day meeting — rate decision on Day 2.' },
    { date: '2026-06-17', name: 'FOMC Rate Decision', impact: 'HIGH', category: 'FED', description: 'Fed announces interest rate decision + press conference with Chair Powell.' },
    { date: '2026-06-19', name: 'Retail Sales (May)', impact: 'MEDIUM', category: 'SPENDING', description: 'Monthly retail sales data — key consumer spending gauge.' },
    { date: '2026-06-25', name: 'GDP Q1 Final', impact: 'MEDIUM', category: 'GROWTH', description: 'Final estimate of Q1 2026 GDP — third and final revision.' },
    { date: '2026-06-26', name: 'PCE Inflation (May)', impact: 'HIGH', category: 'INFLATION', description: 'Personal Consumption Expenditures — Fed\'s preferred inflation gauge.' },
    { date: '2026-07-02', name: 'Non-Farm Payrolls (June)', impact: 'HIGH', category: 'JOBS', description: 'Monthly jobs report — released Thursday ahead of July 4th holiday.' },
    { date: '2026-07-09', name: 'CPI (June)', impact: 'HIGH', category: 'INFLATION', description: 'Consumer Price Index — mid-summer inflation reading.' },
    { date: '2026-07-14', name: 'Retail Sales (June)', impact: 'MEDIUM', category: 'SPENDING', description: 'June consumer spending report.' },
    { date: '2026-07-28', name: 'FOMC Meeting (Day 1)', impact: 'HIGH', category: 'FED', description: 'July FOMC two-day meeting begins.' },
    { date: '2026-07-29', name: 'GDP Q2 Advance + FOMC Day 2', impact: 'HIGH', category: 'GROWTH', description: 'First estimate of Q2 2026 GDP AND FOMC rate decision — massive double catalyst day.' },
    { date: '2026-07-31', name: 'PCE Inflation (June)', impact: 'HIGH', category: 'INFLATION', description: 'June PCE inflation — Fed\'s preferred gauge, day after FOMC.' },
    { date: '2026-08-07', name: 'Non-Farm Payrolls (July)', impact: 'HIGH', category: 'JOBS', description: 'July jobs report — first major economic read after July FOMC.' },
    { date: '2026-08-12', name: 'CPI (July)', impact: 'HIGH', category: 'INFLATION', description: 'July Consumer Price Index — key summer inflation reading.' },
    { date: '2026-08-13', name: 'PPI (July)', impact: 'MEDIUM', category: 'INFLATION', description: 'Producer Price Index — upstream inflation pipeline indicator.' },
    { date: '2026-08-15', name: 'Retail Sales (July)', impact: 'MEDIUM', category: 'SPENDING', description: 'July consumer spending report.' },
    { date: '2026-08-26', name: 'PCE Inflation (July)', impact: 'HIGH', category: 'INFLATION', description: 'July PCE inflation — key read before September FOMC.' },
    { date: '2026-09-04', name: 'Non-Farm Payrolls (August)', impact: 'HIGH', category: 'JOBS', description: 'August jobs report — released day after Labor Day.' },
  ];

  // Sort by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return res.json({ success: true, events });
});

/**
 * POST /api/market/pattern-scan
 * Analyze an uploaded chart screenshot for patterns.
 */
router.post('/pattern-scan', upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const symbol = (req.body.symbol as string | undefined)?.trim().toUpperCase();
    let currentPrice: number | undefined;

    if (symbol) {
      try {
        const quotes = await fetchBatchQuotes([symbol]);
        if (quotes.length > 0 && quotes[0].price > 0) currentPrice = quotes[0].price;
      } catch { /* ignore */ }
    }

    const analysis = await analyzeChartImage(req.file.buffer, symbol, currentPrice);
    return res.json({ success: true, analysis });
  } catch (err) {
    logError('Pattern scan failed', err);
    return res.status(500).json({ success: false, message: 'Pattern analysis failed' });
  }
});

// ── Black-Scholes helpers for synthetic options chain ──────────────────────

function normalCDF(x: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const phi = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const poly = phi * t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return x >= 0 ? 1 - poly : poly;
}

function computeBS(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqT);
  const d2 = d1 - sigma * sqT;
  const price = type === 'call'
    ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
    : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  return Math.max(0, price);
}

function getNextFridays(count: number, from: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(from);
  d.setHours(16, 0, 0, 0);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 5) dates.push(new Date(d));
  }
  return dates;
}

function getThirdFridays(months: number, from: Date): Date[] {
  const dates: Date[] = [];
  for (let m = 1; m <= months; m++) {
    const d = new Date(from.getFullYear(), from.getMonth() + m, 1, 16, 0, 0, 0);
    let count = 0;
    while (count < 3) {
      if (d.getDay() === 5) count++;
      if (count < 3) d.setDate(d.getDate() + 1);
    }
    dates.push(new Date(d));
  }
  return dates;
}

/**
 * GET /api/market/options/:symbol
 * Generates a synthetic options chain using Black-Scholes pricing.
 * Current price is fetched from Stooq — no external options data provider needed.
 */
router.get('/options/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const sym = symbol.toUpperCase();

  try {
    const quotes = await fetchBatchQuotes([sym]);
    if (quotes.length === 0 || quotes[0].price <= 0) {
      return res.status(404).json({ success: false, message: `Price unavailable for ${sym}` });
    }
    const S = quotes[0].price;
    const absMove = Math.abs(quotes[0].changePercent ?? 0);

    // Base implied volatility by asset class
    let baseIV = 0.25;
    if (['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI'].includes(sym)) baseIV = 0.18;
    else if (sym === 'VIX') baseIV = 0.90;
    else if (['TSLA', 'NVDA', 'AMD', 'GME', 'PLTR', 'MSTR', 'COIN'].includes(sym)) baseIV = 0.60;
    else if (['AAPL', 'MSFT', 'AMZN', 'GOOG', 'GOOGL', 'META', 'NFLX'].includes(sym)) baseIV = 0.28;
    else if (['GLD', 'SLV', 'GC=F', 'SI=F', 'USO'].includes(sym)) baseIV = 0.20;
    baseIV = Math.min(1.5, baseIV + absMove * 0.01);

    const now = new Date();
    const r = 0.053;

    // Expiration dates: 4 weekly + 3 monthly (3rd Friday)
    const weeklies = getNextFridays(4, now);
    const monthlies = getThirdFridays(3, now);
    const seen = new Set<number>();
    const expirationDates = [...weeklies, ...monthlies]
      .map(d => Math.floor(d.getTime() / 1000))
      .filter(ts => { if (seen.has(ts)) return false; seen.add(ts); return true; })
      .sort((a, b) => a - b);

    // Select expiry from query param or use first available
    const expParam = req.query.expiration as string | undefined;
    const selectedTs = expParam ? parseInt(expParam, 10) : expirationDates[0];
    const T = Math.max(1 / 365, (selectedTs * 1000 - now.getTime()) / (1000 * 60 * 60 * 24 * 365));

    // Strike range: ±15% from ATM
    const step = S >= 500 ? 10 : S >= 200 ? 5 : S >= 50 ? 2.5 : S >= 10 ? 1 : 0.5;
    const atmK = Math.round(S / step) * step;
    const nStrikes = Math.ceil(S * 0.15 / step);
    const strikes: number[] = [];
    for (let i = -nStrikes; i <= nStrikes; i++) {
      const K = Math.round((atmK + i * step) * 100) / 100;
      if (K > 0) strikes.push(K);
    }

    type OptionRow = {
      strike: number; lastPrice: number; bid: number; ask: number;
      volume: number; openInterest: number; impliedVolatility: number; inTheMoney: boolean;
    };
    const calls: OptionRow[] = [];
    const puts: OptionRow[] = [];

    const round2 = (n: number) => Math.max(0.01, Math.round(n * 100) / 100);

    for (const K of strikes) {
      const m = Math.log(K / S);
      // IV smile with put skew (steeper for OTM puts)
      const callIV = Math.min(2.0, Math.max(0.05, baseIV * (1 + 3 * m * m)));
      const putIV  = Math.min(2.0, Math.max(0.05, baseIV * (1 + 3 * m * m + 0.04 * Math.max(0, -m))));

      const callMid = computeBS(S, K, T, r, callIV, 'call');
      const putMid  = computeBS(S, K, T, r, putIV,  'put');
      const sp = Math.min(0.12, Math.max(0.005, 0.008 + Math.abs(m) * 0.22));

      // Deterministic OI/volume based on moneyness (no random — consistent per request)
      const oiWeight = Math.exp(-Math.abs(m) * 10);
      const jitter = Math.abs(Math.sin(K * 31.7 + S * 0.97)) * 0.4 + 0.8;
      const oi  = Math.max(100, Math.round(60000 * oiWeight * jitter));
      const vol = Math.max(10,  Math.round(oi * 0.15 * jitter));

      calls.push({ strike: K, lastPrice: round2(callMid), bid: round2(callMid*(1-sp)), ask: round2(callMid*(1+sp)), volume: vol, openInterest: oi, impliedVolatility: Math.round(callIV*1000)/1000, inTheMoney: K < S });
      puts.push({  strike: K, lastPrice: round2(putMid),  bid: round2(putMid*(1-sp)),  ask: round2(putMid*(1+sp)),  volume: vol, openInterest: oi, impliedVolatility: Math.round(putIV*1000)/1000,  inTheMoney: K > S });
    }

    // Max pain: strike where total options value is minimised
    let maxPainStrike = S, minPain = Infinity;
    for (const testK of strikes) {
      let pain = 0;
      for (const c of calls) pain += c.openInterest * Math.max(0, testK - c.strike);
      for (const p of puts)  pain += p.openInterest * Math.max(0, p.strike  - testK);
      if (pain < minPain) { minPain = pain; maxPainStrike = testK; }
    }

    const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
    const totalPutOI  = puts.reduce((s, p)  => s + p.openInterest, 0);

    return res.json({
      success: true, symbol: sym,
      currentPrice: Math.round(S * 100) / 100,
      expirationDates, calls, puts,
      maxPain: Math.round(maxPainStrike * 100) / 100,
      totalCallOI, totalPutOI,
      putCallRatio: totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : null,
    });
  } catch (err) {
    logError(`Options generation failed for ${sym}`, err);
    return res.status(500).json({ success: false, message: 'Failed to generate options data' });
  }
});

/**
 * GET /api/market/multi-tf/:symbol
 * Returns analysis for 4 timeframes simultaneously.
 */
router.get('/multi-tf/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const sym = symbol.toUpperCase();

  try {
    const [bars15m, bars1h, bars4h, bars1d] = await Promise.allSettled([
      fetchIntradayBars(sym, '15m').catch(() => fetchHistoricalData(sym, '1mo')),
      fetchIntradayBars(sym, 'h').catch(() => fetchHistoricalData(sym, '3mo')),
      fetchIntradayBars(sym, '4h').catch(() => fetchHistoricalData(sym, '3mo')),
      fetchHistoricalData(sym, '6mo'),
    ]);

    const analyzeOrNull = async (barsResult: PromiseSettledResult<unknown[]>, label: string) => {
      if (barsResult.status !== 'fulfilled' || barsResult.value.length < 20) {
        return { timeframe: label, error: 'Insufficient data', signal: 'HOLD' as const };
      }
      try {
        const bars = barsResult.value as import('../data/market').OHLCVBar[];
        const analysis = await analyzeSymbolWithTA(sym, bars.slice(-50));
        const closes = bars.map(b => b.close);
        const rsiArr = indicators.calculateRSI(closes, 14);
        const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
        const atrArr = indicators.calculateATR(bars.map(b=>b.high), bars.map(b=>b.low), closes, 14);
        const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;

        let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        if (analysis.swingSetup.exists && analysis.swingSetup.direction === 'LONG') signal = 'BUY';
        else if (analysis.swingSetup.exists && analysis.swingSetup.direction === 'SHORT') signal = 'SELL';
        else if (analysis.trend.direction === 'UP' && rsi < 70) signal = 'BUY';
        else if (analysis.trend.direction === 'DOWN' && rsi > 30) signal = 'SELL';

        const lastClose = closes[closes.length - 1];
        const support = analysis.keyLevels.support[0] ?? (lastClose - atr * 2);
        const resistance = analysis.keyLevels.resistance[0] ?? (lastClose + atr * 2);

        return {
          timeframe: label,
          trend: analysis.trend.direction,
          signal,
          rsi: Math.round(rsi * 10) / 10,
          support: Math.round(support * 100) / 100,
          resistance: Math.round(resistance * 100) / 100,
          strength: analysis.signalStrength,
          summary: analysis.indicators.summary,
          sparkline: closes.slice(-20),
        };
      } catch {
        return { timeframe: label, error: 'Analysis failed', signal: 'HOLD' as const };
      }
    };

    const [tf15m, tf1h, tf4h, tf1d] = await Promise.all([
      analyzeOrNull(bars15m, '15m'),
      analyzeOrNull(bars1h, '1h'),
      analyzeOrNull(bars4h, '4h'),
      analyzeOrNull(bars1d, '1d'),
    ]);

    const timeframes = [tf15m, tf1h, tf4h, tf1d];
    const buyCount = timeframes.filter(t => t.signal === 'BUY').length;
    const sellCount = timeframes.filter(t => t.signal === 'SELL').length;

    let overallBias = 'Mixed Signals';
    if (buyCount === 4) overallBias = '4/4 BULLISH — Strong Long';
    else if (buyCount === 3) overallBias = '3/4 BULLISH — Lean Long';
    else if (sellCount === 4) overallBias = '4/4 BEARISH — Strong Short';
    else if (sellCount === 3) overallBias = '3/4 BEARISH — Lean Short';
    else if (buyCount === sellCount) overallBias = '2/2 Split — Mixed Signals — Wait';

    return res.json({ success: true, symbol: sym, timeframes, overallBias, buyCount, sellCount });
  } catch (err) {
    logError(`Multi-TF analysis failed for ${symbol}`, err);
    return res.status(500).json({ success: false, message: 'Multi-timeframe analysis failed' });
  }
});

export default router;
