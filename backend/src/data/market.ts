import axios, { AxiosRequestConfig } from 'axios';
import { logError, log } from '../utils/logger';

// ── Yahoo Finance session (crumb + cookie) ────────────────────────────────────
// Yahoo Finance requires a crumb + cookie since late 2023 for chart/history API.
// We fetch them once and cache for 55 minutes.

let _yfCrumb = '';
let _yfCookie = '';
let _yfSessionAt = 0;
const YF_SESSION_TTL = 55 * 60 * 1000;

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

async function refreshYahooSession(): Promise<void> {
  if (_yfCrumb && Date.now() - _yfSessionAt < YF_SESSION_TTL) return;

  try {
    // Step 1 – get Yahoo cookie from their consent/auth endpoint
    const cookieRes = await axios.get('https://fc.yahoo.com/', {
      headers: BASE_HEADERS,
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });

    const setCookieHeaders: string[] = (cookieRes.headers['set-cookie'] ?? []) as string[];
    if (setCookieHeaders.length > 0) {
      _yfCookie = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    }

    // Step 2 – get crumb (requires the cookie above)
    const crumbRes = await axios.get(
      'https://query2.finance.yahoo.com/v1/test/getcrumb',
      {
        headers: { ...BASE_HEADERS, Cookie: _yfCookie },
        timeout: 10000,
        validateStatus: (s) => s < 500,
      }
    );

    const crumb = typeof crumbRes.data === 'string' ? crumbRes.data.trim() : '';
    if (crumb && crumb.length > 0 && !crumb.includes('<')) {
      _yfCrumb = crumb;
      _yfSessionAt = Date.now();
      log(`Yahoo Finance session refreshed (crumb: ${crumb.slice(0, 6)}...)`);
    } else {
      log('Yahoo Finance crumb fetch returned unexpected data — will try without crumb');
    }
  } catch (err) {
    logError('Yahoo Finance session refresh failed', err);
  }
}

function yfConfig(timeout = 15000): AxiosRequestConfig {
  return {
    headers: {
      ...BASE_HEADERS,
      ..._yfCookie ? { Cookie: _yfCookie } : {},
    },
    timeout,
    validateStatus: (s) => s < 500,
  };
}

function yfCrumbSuffix(): string {
  return _yfCrumb ? `&crumb=${encodeURIComponent(_yfCrumb)}` : '';
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
}

export interface OHLCVBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Quote mapping ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapQuote(q: any, fallbackSymbol: string): QuoteData {
  const price = q.regularMarketPrice ?? 0;
  const previousClose = q.regularMarketPreviousClose ?? price;
  return {
    symbol: q.symbol ?? fallbackSymbol,
    name: q.shortName ?? q.longName ?? fallbackSymbol,
    price,
    previousClose,
    change: q.regularMarketChange ?? price - previousClose,
    changePercent: q.regularMarketChangePercent ?? 0,
    volume: q.regularMarketVolume ?? 0,
    avgVolume: q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0,
    marketCap: q.marketCap,
    high52Week: q.fiftyTwoWeekHigh,
    low52Week: q.fiftyTwoWeekLow,
    preMarketPrice: q.preMarketPrice,
    preMarketChange: q.preMarketChange,
    preMarketChangePercent: q.preMarketChangePercent,
  };
}

// ── Quotes (real-time) ────────────────────────────────────────────────────────

async function fetchQuoteBatch(symbols: string[]): Promise<QuoteData[]> {
  await refreshYahooSession();
  const symbolsParam = symbols.map(encodeURIComponent).join(',');

  // Try query2 first (newer, more reliable with crumb)
  for (const base of [
    'https://query2.finance.yahoo.com/v7/finance/quote',
    'https://query1.finance.yahoo.com/v7/finance/quote',
  ]) {
    try {
      const url = `${base}?symbols=${symbolsParam}${yfCrumbSuffix()}`;
      const res = await axios.get(url, yfConfig(12000));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = res.data?.quoteResponse?.result ?? [];
      if (results.length > 0) {
        return results.map((q) => mapQuote(q, q.symbol));
      }
    } catch (err) {
      logError(`Quote batch attempt failed [${base}]`, err);
    }
    await sleep(300);
  }
  return [];
}

export async function fetchBatchQuotes(symbols: string[]): Promise<QuoteData[]> {
  const out: QuoteData[] = [];
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await fetchQuoteBatch(batch);
    out.push(...results);
    if (i + batchSize < symbols.length) await sleep(200);
  }
  return out;
}

// ── Historical OHLCV ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseYfChart(data: any): OHLCVBar[] {
  const chart = data?.chart?.result?.[0];
  if (!chart) return [];
  const timestamps: number[] = chart.timestamp ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = chart.indicators?.quote?.[0] ?? {};
  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000),
      open: q.open?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter((bar) => bar.close > 0);
}

export async function fetchHistoricalData(
  symbol: string,
  period: '1mo' | '3mo' | '6mo' | '1y' = '3mo'
): Promise<OHLCVBar[]> {
  await refreshYahooSession();
  const sym = encodeURIComponent(symbol);

  // Try both query2 and query1 subdomains with crumb
  for (const base of [
    'https://query2.finance.yahoo.com/v8/finance/chart',
    'https://query1.finance.yahoo.com/v8/finance/chart',
  ]) {
    try {
      const url = `${base}/${sym}?interval=1d&range=${period}${yfCrumbSuffix()}`;
      const res = await axios.get(url, yfConfig(15000));

      if (res.status === 403 || res.status === 401) {
        log(`Yahoo Finance returned ${res.status} for ${symbol} — refreshing session`);
        _yfCrumb = '';
        _yfCookie = '';
        _yfSessionAt = 0;
        await refreshYahooSession();
        continue;
      }

      const bars = parseYfChart(res.data);
      if (bars.length >= 20) {
        return bars;
      }
    } catch (err) {
      logError(`Historical data attempt failed [${base}] for ${symbol}`, err);
    }
    await sleep(400);
  }

  // Fallback: Alpha Vantage (if API key is configured)
  const avKey = process.env.ALPHA_VANTAGE_KEY;
  if (avKey) {
    try {
      const bars = await fetchAlphaVantage(symbol, avKey);
      if (bars.length >= 20) return bars;
    } catch (err) {
      logError(`Alpha Vantage fallback failed for ${symbol}`, err);
    }
  }

  logError(`No historical data source returned data for ${symbol}`, null);
  return [];
}

// ── Alpha Vantage fallback ────────────────────────────────────────────────────

async function fetchAlphaVantage(symbol: string, apiKey: string): Promise<OHLCVBar[]> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;
  const res = await axios.get(url, { timeout: 20000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts: Record<string, any> = res.data?.['Time Series (Daily)'] ?? {};
  const bars: OHLCVBar[] = Object.entries(ts)
    .map(([date, v]) => ({
      date: new Date(date),
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['5. adjusted close'] ?? v['4. close']),
      volume: parseInt(v['6. volume'], 10),
    }))
    .filter((b) => b.close > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // Return last ~90 trading days (~3 months)
  return bars.slice(-90);
}

// ── Market overview ───────────────────────────────────────────────────────────

export async function fetchMarketOverview(): Promise<
  { symbol: string; price: number; change: number; changePercent: number }[]
> {
  const symbols = ['SPY', 'QQQ', 'IWM', '^VIX'];
  try {
    const quotes = await fetchBatchQuotes(symbols);
    return quotes.map((q) => ({
      symbol: q.symbol === '^VIX' ? 'VIX' : q.symbol,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
    }));
  } catch (err) {
    logError('Market overview failed', err);
    return [];
  }
}
