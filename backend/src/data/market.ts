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

  // Try Yahoo Finance in batches first
  const yahooResults: QuoteData[] = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await fetchQuoteBatch(batch);
    yahooResults.push(...results);
    if (i + batchSize < symbols.length) await sleep(200);
  }

  const foundByYahoo = new Set(yahooResults.map((q) => q.symbol.toUpperCase()));

  // For any symbol not found by Yahoo, try Stooq
  const missing = symbols.filter((s) => !foundByYahoo.has(s.toUpperCase()));
  const stooqResults: QuoteData[] = [];
  for (const sym of missing) {
    try {
      const q = await fetchStooqQuote(sym);
      if (q && q.price > 0) stooqResults.push({ ...q, symbol: sym });
    } catch {
      // skip
    }
  }

  out.push(...yahooResults, ...stooqResults);
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

  // ── 1. Stooq (no API key, works on cloud servers) ─────────────────────────
  try {
    const bars = await fetchStooq(symbol, period);
    if (bars.length >= 20) {
      log(`Stooq data for ${symbol}: ${bars.length} bars`);
      return bars;
    }
  } catch (err) {
    logError(`Stooq failed for ${symbol}`, err);
  }

  // ── 2. Yahoo Finance (may be blocked on Railway) ───────────────────────────
  await refreshYahooSession();
  const sym = encodeURIComponent(symbol);
  for (const base of [
    'https://query2.finance.yahoo.com/v8/finance/chart',
    'https://query1.finance.yahoo.com/v8/finance/chart',
  ]) {
    try {
      const url = `${base}/${sym}?interval=1d&range=${period}${yfCrumbSuffix()}`;
      const res = await axios.get(url, yfConfig(15000));
      if (res.status === 403 || res.status === 401) {
        _yfCrumb = ''; _yfCookie = ''; _yfSessionAt = 0;
        await refreshYahooSession();
        continue;
      }
      const bars = parseYfChart(res.data);
      if (bars.length >= 20) return bars;
    } catch (err) {
      logError(`Yahoo Finance [${base}] failed for ${symbol}`, err);
    }
    await sleep(400);
  }

  // ── 3. Alpha Vantage (free API key, 25 calls/day) ────────────────────────
  const avKey = process.env.ALPHA_VANTAGE_KEY;
  if (avKey) {
    try {
      const bars = await fetchAlphaVantage(symbol, avKey);
      if (bars.length >= 20) return bars;
    } catch (err) {
      logError(`Alpha Vantage fallback failed for ${symbol}`, err);
    }
  }

  logError(`All data sources failed for ${symbol}`, null);
  return [];
}

// ── Stooq (free, no auth, works on cloud) ────────────────────────────────────
// Maps Yahoo Finance-style symbols to Stooq symbols

const STOOQ_MAP: Record<string, string> = {
  // Precious metals
  'SI=F': 'si.f', 'GC=F': 'gc.f', 'PL=F': 'pl.f', 'PA=F': 'pa.f', 'HG=F': 'hg.f',
  'MGC=F': 'mgc.f', 'SIL=F': 'sil.f',
  // Energy
  'CL=F': 'cl.f', 'NG=F': 'ng.f', 'BZ=F': 'bz.f', 'QM=F': 'qm.f',
  // Indices
  'ES=F': 'es.f', 'NQ=F': 'nq.f', 'YM=F': 'ym.f', 'RTY=F': 'rty.f',
  'MES=F': 'mes.f', 'MNQ=F': 'mnq.f', 'MYM=F': 'mym.f', 'M2K=F': 'm2k.f',
  // Bonds
  'ZN=F': 'zt.f', 'ZB=F': 'zb.f', 'ZT=F': 'zt.f', 'ZF=F': 'zf.f',
  // Currencies
  '6E=F': '6e.f', '6B=F': '6b.f', '6J=F': '6j.f', '6C=F': '6c.f', '6A=F': '6a.f', '6S=F': '6s.f',
  // Agriculture
  'ZC=F': 'zc.f', 'ZS=F': 'zs.f', 'ZW=F': 'zw.f', 'ZM=F': 'zm.f', 'ZL=F': 'zl.f',
  // Softs/livestock
  'KC=F': 'kc.f', 'CT=F': 'ct.f', 'SB=F': 'sb.f', 'CC=F': 'cc.f',
  'LE=F': 'le.f', 'GF=F': 'gf.f', 'HE=F': 'he.f',
  // Crypto
  'BTC=F': 'btc.f', 'ETH=F': 'eth.f',
  // Volatility
  'VX=F': 'vx.f',
  // Common stocks/ETFs
  'SPY': 'spy.us', 'QQQ': 'qqq.us', 'IWM': 'iwm.us', '^VIX': '^vix',
};

function toStooqSymbol(symbol: string): string | null {
  if (STOOQ_MAP[symbol]) return STOOQ_MAP[symbol];
  // Specific contract like SIN26.CMX — try root mapping
  const rootMatch = symbol.match(/^([A-Z]{2,4})[A-Z]\d{2}/);
  if (rootMatch) {
    const rootYahoo = `${rootMatch[1]}=F`;
    if (STOOQ_MAP[rootYahoo]) return STOOQ_MAP[rootYahoo];
  }
  // Regular stock: append .us
  if (/^[A-Z]{1,5}$/.test(symbol)) return `${symbol.toLowerCase()}.us`;
  return null;
}

async function fetchStooq(symbol: string, period: '1mo' | '3mo' | '6mo' | '1y'): Promise<OHLCVBar[]> {
  const stooqSym = toStooqSymbol(symbol);
  if (!stooqSym) return [];

  const days = period === '1mo' ? 35 : period === '3mo' ? 95 : period === '6mo' ? 185 : 370;
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${fmt(from)}&d2=${fmt(to)}&i=d`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,text/csv,*/*',
    },
    timeout: 15000,
    responseType: 'text',
    validateStatus: (s) => s < 500,
  });

  if (typeof res.data !== 'string' || res.data.trim().startsWith('No data')) return [];

  const lines = res.data.trim().split('\n').slice(1); // skip header
  const bars: OHLCVBar[] = lines
    .map((line: string) => {
      const [date, open, high, low, close, volume] = line.split(',');
      if (!date || !close || close.trim() === 'null') return null;
      const c = parseFloat(close.trim());
      if (!c || isNaN(c)) return null;
      return {
        date: new Date(date.trim()),
        open: parseFloat(open?.trim() ?? '0') || c,
        high: parseFloat(high?.trim() ?? '0') || c,
        low: parseFloat(low?.trim() ?? '0') || c,
        close: c,
        volume: parseInt(volume?.trim() ?? '0', 10) || 0,
      } as OHLCVBar;
    })
    .filter((b): b is OHLCVBar => b !== null && b.close > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return bars;
}

// Stooq real-time quote (uses their l/ endpoint)
async function fetchStooqQuote(symbol: string): Promise<QuoteData | null> {
  const stooqSym = toStooqSymbol(symbol);
  if (!stooqSym) return null;

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000,
    responseType: 'text',
    validateStatus: (s) => s < 500,
  });

  if (typeof res.data !== 'string') return null;
  const lines = res.data.trim().split('\n');
  if (lines.length < 2) return null;
  const [sym, , , open, high, low, close, volume, name] = lines[1].split(',').map((s: string) => s.trim());
  const price = parseFloat(close);
  if (!price || isNaN(price)) return null;
  const openN = parseFloat(open) || price;
  return {
    symbol: sym || symbol,
    name: name || symbol,
    price,
    previousClose: openN,
    change: price - openN,
    changePercent: openN !== 0 ? ((price - openN) / openN) * 100 : 0,
    volume: parseInt(volume ?? '0', 10) || 0,
    avgVolume: 0,
    high52Week: parseFloat(high) || undefined,
    low52Week: parseFloat(low) || undefined,
  };
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
