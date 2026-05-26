import axios from 'axios';
import { logError, log } from '../utils/logger';

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

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Stooq (PRIMARY — free, no auth, works on Railway/cloud) ──────────────────

const STOOQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,text/csv,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Maps Yahoo Finance-style symbols → Stooq symbols
const STOOQ_MAP: Record<string, string> = {
  // Precious metals (COMEX)
  'SI=F': 'si.f', 'GC=F': 'gc.f', 'PL=F': 'pl.f', 'PA=F': 'pa.f', 'HG=F': 'hg.f',
  'MGC=F': 'mgc.f', 'SIL=F': 'sil.f',
  // Energy (NYMEX)
  'CL=F': 'cl.f', 'NG=F': 'ng.f', 'BZ=F': 'bz.f', 'QM=F': 'qm.f', 'RB=F': 'rb.f', 'HO=F': 'ho.f',
  // Equity indices (CME)
  'ES=F': 'es.f', 'NQ=F': 'nq.f', 'YM=F': 'ym.f', 'RTY=F': 'rty.f',
  'MES=F': 'mes.f', 'MNQ=F': 'mnq.f', 'MYM=F': 'mym.f', 'M2K=F': 'm2k.f',
  // Bonds (CBOT)
  'ZN=F': 'zn.f', 'ZB=F': 'zb.f', 'ZT=F': 'zt.f', 'ZF=F': 'zf.f',
  // Currencies (CME)
  '6E=F': '6e.f', '6B=F': '6b.f', '6J=F': '6j.f', '6C=F': '6c.f',
  '6A=F': '6a.f', '6S=F': '6s.f', '6N=F': '6n.f',
  // Agriculture (CBOT)
  'ZC=F': 'zc.f', 'ZS=F': 'zs.f', 'ZW=F': 'zw.f', 'ZM=F': 'zm.f', 'ZL=F': 'zl.f',
  // Softs (ICE)
  'KC=F': 'kc.f', 'CT=F': 'ct.f', 'SB=F': 'sb.f', 'CC=F': 'cc.f', 'OJ=F': 'oj.f',
  // Livestock (CME)
  'LE=F': 'le.f', 'GF=F': 'gf.f', 'HE=F': 'he.f',
  // Crypto (CME)
  'BTC=F': 'btc.f', 'ETH=F': 'eth.f', 'MBT=F': 'mbt.f', 'MET=F': 'met.f',
  // Volatility
  'VX=F': 'vx.f',
  // Common ETFs/indices mapped to US stocks on Stooq
  'SPY': 'spy.us', 'QQQ': 'qqq.us', 'IWM': 'iwm.us', 'DIA': 'dia.us',
  'GLD': 'gld.us', 'SLV': 'slv.us', 'USO': 'uso.us', 'TLT': 'tlt.us',
  '^VIX': '^vix', '^GSPC': '^spx', '^DJI': '^dji', '^IXIC': '^ndq',
};

const MONTH_CODES = 'FGHJKMNQUVXZ';

function toStooqSymbol(symbol: string): string | null {
  if (STOOQ_MAP[symbol]) return STOOQ_MAP[symbol];

  // Specific futures contract with exchange suffix: SIN26.CMX → root continuous
  const contractDotMatch = symbol.match(/^([A-Z]{2,4})[A-Z]\d{2}\./);
  if (contractDotMatch) {
    const root = `${contractDotMatch[1]}=F`;
    if (STOOQ_MAP[root]) return STOOQ_MAP[root];
  }

  // Broker-format futures: SICN26 / GCM26 / ESH25 / MNQH25 (no dot, ends with letter+2 digits)
  // Root may optionally have 'C' for continuous before the month code
  const brokerRe = new RegExp(`^([A-Z]{2,4})C?[${MONTH_CODES}]\\d{2}$`);
  const brokerMatch = symbol.match(brokerRe);
  if (brokerMatch) {
    const root = `${brokerMatch[1]}=F`;
    if (STOOQ_MAP[root]) return STOOQ_MAP[root];
  }

  // US stock ticker (1-5 uppercase letters only, no digits)
  if (/^[A-Z]{1,5}$/.test(symbol)) return `${symbol.toLowerCase()}.us`;

  return null;
}

// Parse Stooq CSV response (format: Symbol,Date,Time,Open,High,Low,Close,Volume,Name)
function parseStooqCSV(csv: string, originalSymbol: string): QuoteData[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const results: QuoteData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((s) => s.trim());
    // Stooq may return "No data" for unknown symbols
    // Format with f=sd2t2ohlcpvn: sym, date, time, open, high, low, close, prevClose, volume, name
    if (parts.length < 7 || parts[6] === 'N/D' || parts[0] === 'No') continue;

    const [sym, , , openStr, highStr, lowStr, closeStr, prevCloseStr, volStr, ...nameParts] = parts;
    const price = parseFloat(closeStr);
    if (!price || isNaN(price)) continue;

    const prevClose = prevCloseStr && prevCloseStr !== 'N/D' && prevCloseStr !== ''
      ? parseFloat(prevCloseStr)
      : parseFloat(openStr) || price;
    const name = nameParts.join(',') || sym || originalSymbol;

    results.push({
      symbol: sym || originalSymbol,
      name,
      price,
      previousClose: prevClose,
      change: price - prevClose,
      changePercent: prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      volume: parseInt(volStr ?? '0', 10) || 0,
      avgVolume: 0,
      high52Week: parseFloat(highStr) || undefined,
      low52Week: parseFloat(lowStr) || undefined,
    });
  }
  return results;
}

// Fetch multiple quotes from Stooq in a single request
async function fetchStooqBatchQuotes(symbols: string[]): Promise<QuoteData[]> {
  const stooqSyms = symbols
    .map((s) => ({ orig: s, stooq: toStooqSymbol(s) }))
    .filter((x): x is { orig: string; stooq: string } => x.stooq !== null);

  if (stooqSyms.length === 0) return [];

  // Stooq supports comma-separated symbols
  const symParam = stooqSyms.map((x) => encodeURIComponent(x.stooq)).join('%2C');
  const url = `https://stooq.com/q/l/?s=${symParam}&f=sd2t2ohlcpvn`;

  try {
    const res = await axios.get(url, {
      headers: STOOQ_HEADERS,
      timeout: 8000,
      responseType: 'text',
      validateStatus: (s) => s < 500,
    });

    if (typeof res.data !== 'string' || res.data.includes('No data')) return [];

    const parsed = parseStooqCSV(res.data, '');

    // Re-map Stooq symbols back to original symbols
    return parsed
      .map((q) => {
        const match = stooqSyms.find(
          (x) => x.stooq.toLowerCase() === q.symbol.toLowerCase()
        );
        return match ? { ...q, symbol: match.orig } : q;
      })
      .filter((q) => q.price > 0);
  } catch (err) {
    logError('Stooq batch quotes failed', err);
    return [];
  }
}

// Fetch historical bars from Stooq
async function fetchStooqBars(symbol: string, period: '1mo' | '3mo' | '6mo' | '1y'): Promise<OHLCVBar[]> {
  const stooqSym = toStooqSymbol(symbol);
  if (!stooqSym) return [];

  const days = period === '1mo' ? 35 : period === '3mo' ? 95 : period === '6mo' ? 185 : 370;
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${fmt(from)}&d2=${fmt(to)}&i=d`;

  try {
    const res = await axios.get(url, {
      headers: STOOQ_HEADERS,
      timeout: 12000,
      responseType: 'text',
      validateStatus: (s) => s < 500,
    });

    if (typeof res.data !== 'string') return [];
    const text = res.data.trim();
    if (text.startsWith('No data') || text === '') return [];

    const lines = text.split('\n').slice(1); // skip header row
    const bars: OHLCVBar[] = lines
      .map((line: string) => {
        const [date, open, high, low, close, volume] = line.split(',');
        if (!date || !close) return null;
        const c = parseFloat(close.trim());
        if (!c || isNaN(c) || c <= 0) return null;
        return {
          date: new Date(date.trim()),
          open: parseFloat(open?.trim() ?? '0') || c,
          high: parseFloat(high?.trim() ?? '0') || c,
          low: parseFloat(low?.trim() ?? '0') || c,
          close: c,
          volume: parseInt(volume?.trim() ?? '0', 10) || 0,
        } as OHLCVBar;
      })
      .filter((b): b is OHLCVBar => b !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return bars;
  } catch (err) {
    logError(`Stooq historical bars failed for ${symbol}`, err);
    return [];
  }
}

// Resample OHLCV bars (e.g. hourly → 4h by grouping every N bars)
function resampleBars(bars: OHLCVBar[], n: number): OHLCVBar[] {
  const out: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i += n) {
    const g = bars.slice(i, i + n);
    if (g.length === 0) continue;
    out.push({
      date: g[0].date,
      open: g[0].open,
      high: Math.max(...g.map((b) => b.high)),
      low: Math.min(...g.map((b) => b.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}

// Fetch intraday bars from Stooq: interval = 'h' | '15m' | '4h' (4h = hourly resampled ×4)
export async function fetchIntradayBars(symbol: string, interval: 'h' | '15m' | '4h'): Promise<OHLCVBar[]> {
  const stooqSym = toStooqSymbol(symbol);
  if (!stooqSym) return [];

  const stooqInterval = interval === '4h' ? 'h' : interval;
  const days = interval === '15m' ? 6 : interval === 'h' ? 14 : 30;
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${fmt(from)}&d2=${fmt(to)}&i=${stooqInterval}`;

  try {
    const res = await axios.get(url, {
      headers: STOOQ_HEADERS,
      timeout: 14000,
      responseType: 'text',
      validateStatus: (s) => s < 500,
    });

    if (typeof res.data !== 'string') return [];
    const text = res.data.trim();
    if (text.startsWith('No data') || text === '') return [];

    const lines = text.split('\n');
    // Detect if header has a "Time" column (intraday) or not (daily fallback)
    const header = lines[0]?.toLowerCase() ?? '';
    const hasTime = header.includes('time');
    const oIdx = hasTime ? 2 : 1;
    const hIdx = hasTime ? 3 : 2;
    const lIdx = hasTime ? 4 : 3;
    const cIdx = hasTime ? 5 : 4;
    const vIdx = hasTime ? 6 : 5;

    const bars: OHLCVBar[] = lines
      .slice(1)
      .map((line: string) => {
        const cols = line.split(',');
        const c = parseFloat(cols[cIdx]?.trim() ?? '');
        if (!c || isNaN(c) || c <= 0) return null;
        const dateStr = hasTime
          ? `${cols[0].trim()}T${cols[1].trim()}`
          : cols[0].trim();
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return {
          date: d,
          open: parseFloat(cols[oIdx]?.trim() ?? '') || c,
          high: parseFloat(cols[hIdx]?.trim() ?? '') || c,
          low: parseFloat(cols[lIdx]?.trim() ?? '') || c,
          close: c,
          volume: parseInt(cols[vIdx]?.trim() ?? '0', 10) || 0,
        } as OHLCVBar;
      })
      .filter((b): b is OHLCVBar => b !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (bars.length < 10) {
      log(`Stooq intraday returned only ${bars.length} bars for ${symbol} (${interval}), falling back to daily`);
      return [];
    }

    log(`Stooq intraday (${interval}): ${symbol} → ${bars.length} bars`);
    return interval === '4h' ? resampleBars(bars, 4) : bars;
  } catch (err) {
    logError(`Stooq intraday bars failed for ${symbol} (${interval})`, err);
    return [];
  }
}

// ── Yahoo Finance session (secondary fallback) ────────────────────────────────

let _yfCrumb = '';
let _yfCookie = '';
let _yfSessionAt = 0;
const YF_SESSION_TTL = 55 * 60 * 1000;

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

async function refreshYahooSession(): Promise<void> {
  if (_yfCrumb && Date.now() - _yfSessionAt < YF_SESSION_TTL) return;
  try {
    const cookieRes = await axios.get('https://fc.yahoo.com/', {
      headers: YF_HEADERS, timeout: 8000, maxRedirects: 5, validateStatus: (s) => s < 500,
    });
    const setCookieHeaders: string[] = (cookieRes.headers['set-cookie'] ?? []) as string[];
    if (setCookieHeaders.length > 0) {
      _yfCookie = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');
    }
    const crumbRes = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...YF_HEADERS, Cookie: _yfCookie }, timeout: 8000, validateStatus: (s) => s < 500,
    });
    const crumb = typeof crumbRes.data === 'string' ? crumbRes.data.trim() : '';
    if (crumb && crumb.length > 0 && !crumb.includes('<')) {
      _yfCrumb = crumb;
      _yfSessionAt = Date.now();
    }
  } catch (err) {
    logError('Yahoo Finance session refresh failed', err);
  }
}

function yfCrumbSuffix(): string {
  return _yfCrumb ? `&crumb=${encodeURIComponent(_yfCrumb)}` : '';
}

function yfHeaders(): Record<string, string> {
  return { ...YF_HEADERS, ..._yfCookie ? { Cookie: _yfCookie } : {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapYFQuote(q: any, fallbackSymbol: string): QuoteData {
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

async function fetchYahooQuoteBatch(symbols: string[]): Promise<QuoteData[]> {
  await refreshYahooSession();
  const symbolsParam = symbols.map(encodeURIComponent).join(',');
  for (const base of [
    'https://query2.finance.yahoo.com/v7/finance/quote',
    'https://query1.finance.yahoo.com/v7/finance/quote',
  ]) {
    try {
      const url = `${base}?symbols=${symbolsParam}${yfCrumbSuffix()}`;
      const res = await axios.get(url, {
        headers: yfHeaders(), timeout: 8000, validateStatus: (s) => s < 500,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = res.data?.quoteResponse?.result ?? [];
      if (results.length > 0) return results.map((q) => mapYFQuote(q, q.symbol));
    } catch (err) {
      logError(`Yahoo Finance quote batch failed [${base}]`, err);
    }
    await sleep(200);
  }
  return [];
}

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

async function fetchYahooBars(symbol: string, period: string): Promise<OHLCVBar[]> {
  await refreshYahooSession();
  const sym = encodeURIComponent(symbol);
  for (const base of [
    'https://query2.finance.yahoo.com/v8/finance/chart',
    'https://query1.finance.yahoo.com/v8/finance/chart',
  ]) {
    try {
      const url = `${base}/${sym}?interval=1d&range=${period}${yfCrumbSuffix()}`;
      const res = await axios.get(url, { headers: yfHeaders(), timeout: 10000, validateStatus: (s) => s < 500 });
      if (res.status === 403 || res.status === 401) {
        _yfCrumb = ''; _yfCookie = ''; _yfSessionAt = 0;
        continue;
      }
      const bars = parseYfChart(res.data);
      if (bars.length >= 20) return bars;
    } catch (err) {
      logError(`Yahoo Finance bars failed [${base}] for ${symbol}`, err);
    }
    await sleep(300);
  }
  return [];
}

// ── Alpha Vantage (tertiary, free API key) ────────────────────────────────────

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
  return bars.slice(-90);
}

// ── Symbol search ─────────────────────────────────────────────────────────────

export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  const results: SymbolSearchResult[] = [];

  // 1. Try Yahoo Finance search (usually not blocked unlike chart API)
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=0&enableFuzzyQuery=true&enableCb=false`;
    const res = await axios.get(url, {
      headers: YF_HEADERS,
      timeout: 6000,
      validateStatus: (s) => s < 500,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = res.data?.finance?.result?.[0]?.quotes ?? res.data?.quotes ?? [];
    for (const q of quotes.slice(0, 20)) {
      if (!q.symbol) continue;
      results.push({
        symbol: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchDisp ?? q.exchange ?? '',
        type: q.typeDisp ?? q.quoteType ?? 'EQUITY',
      });
    }
    if (results.length > 0) return results;
  } catch (err) {
    logError('Yahoo Finance search failed', err);
  }

  // 2. Fallback: match from known futures list
  const KNOWN_FUTURES: SymbolSearchResult[] = [
    { symbol: 'SI=F',  name: 'Silver Futures',            exchange: 'COMEX', type: 'FUTURE' },
    { symbol: 'GC=F',  name: 'Gold Futures',              exchange: 'COMEX', type: 'FUTURE' },
    { symbol: 'MGC=F', name: 'Micro Gold Futures',        exchange: 'COMEX', type: 'FUTURE' },
    { symbol: 'SIL=F', name: 'Micro Silver Futures',      exchange: 'COMEX', type: 'FUTURE' },
    { symbol: 'PL=F',  name: 'Platinum Futures',          exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'PA=F',  name: 'Palladium Futures',         exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'HG=F',  name: 'Copper Futures',            exchange: 'COMEX', type: 'FUTURE' },
    { symbol: 'CL=F',  name: 'Crude Oil WTI Futures',     exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'QM=F',  name: 'Mini Crude Oil Futures',    exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'NG=F',  name: 'Natural Gas Futures',       exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'BZ=F',  name: 'Brent Crude Oil Futures',   exchange: 'NYMEX', type: 'FUTURE' },
    { symbol: 'ES=F',  name: 'S&P 500 E-mini Futures',    exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'NQ=F',  name: 'Nasdaq-100 E-mini Futures', exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'YM=F',  name: 'Dow Jones E-mini Futures',  exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'RTY=F', name: 'Russell 2000 E-mini',       exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'MES=F', name: 'Micro S&P 500 Futures',     exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'MNQ=F', name: 'Micro Nasdaq-100 Futures',  exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'MYM=F', name: 'Micro Dow Jones Futures',   exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'M2K=F', name: 'Micro Russell 2000',        exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'ZN=F',  name: '10-Year T-Note Futures',    exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'ZB=F',  name: '30-Year T-Bond Futures',    exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'ZT=F',  name: '2-Year T-Note Futures',     exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'ZF=F',  name: '5-Year T-Note Futures',     exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: '6E=F',  name: 'Euro FX Futures',           exchange: 'CME',   type: 'FUTURE' },
    { symbol: '6B=F',  name: 'British Pound Futures',     exchange: 'CME',   type: 'FUTURE' },
    { symbol: '6J=F',  name: 'Japanese Yen Futures',      exchange: 'CME',   type: 'FUTURE' },
    { symbol: '6C=F',  name: 'Canadian Dollar Futures',   exchange: 'CME',   type: 'FUTURE' },
    { symbol: '6A=F',  name: 'Australian Dollar Futures', exchange: 'CME',   type: 'FUTURE' },
    { symbol: '6S=F',  name: 'Swiss Franc Futures',       exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'ZC=F',  name: 'Corn Futures',              exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'ZS=F',  name: 'Soybeans Futures',          exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'ZW=F',  name: 'Wheat Futures',             exchange: 'CBOT',  type: 'FUTURE' },
    { symbol: 'KC=F',  name: 'Coffee Futures',            exchange: 'ICE',   type: 'FUTURE' },
    { symbol: 'CT=F',  name: 'Cotton Futures',            exchange: 'ICE',   type: 'FUTURE' },
    { symbol: 'SB=F',  name: 'Sugar No.11 Futures',       exchange: 'ICE',   type: 'FUTURE' },
    { symbol: 'LE=F',  name: 'Live Cattle Futures',       exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'HE=F',  name: 'Lean Hogs Futures',         exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'BTC=F', name: 'Bitcoin CME Futures',       exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'ETH=F', name: 'Ethereum CME Futures',      exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'MBT=F', name: 'Micro Bitcoin Futures',     exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'MET=F', name: 'Micro Ether Futures',       exchange: 'CME',   type: 'FUTURE' },
    { symbol: 'VX=F',  name: 'CBOE VIX Futures',          exchange: 'CFE',   type: 'FUTURE' },
  ];

  const q = query.toUpperCase();
  const matched = KNOWN_FUTURES.filter(
    (f) =>
      f.symbol.toUpperCase().includes(q) ||
      f.name.toUpperCase().includes(q) ||
      f.exchange.toUpperCase().includes(q)
  );
  return matched.slice(0, 15);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchBatchQuotes(symbols: string[]): Promise<QuoteData[]> {
  if (symbols.length === 0) return [];

  // 1. Stooq batch (fast, no auth, works on Railway)
  const stooqResults = await fetchStooqBatchQuotes(symbols);
  const foundByStooq = new Set(stooqResults.map((q) => q.symbol.toUpperCase()));
  log(`Stooq quotes: ${stooqResults.length}/${symbols.length} symbols`);

  // 2. Yahoo Finance for any symbols Stooq didn't return
  const missing = symbols.filter((s) => !foundByStooq.has(s.toUpperCase()));
  let yahooResults: QuoteData[] = [];
  if (missing.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const r = await fetchYahooQuoteBatch(batch);
      yahooResults = yahooResults.concat(r);
      if (i + batchSize < missing.length) await sleep(150);
    }
  }

  return [...stooqResults, ...yahooResults];
}

export async function fetchHistoricalData(
  symbol: string,
  period: '1mo' | '3mo' | '6mo' | '1y' = '3mo'
): Promise<OHLCVBar[]> {
  // 1. Stooq (primary — works on cloud)
  try {
    const bars = await fetchStooqBars(symbol, period);
    if (bars.length >= 20) {
      log(`Stooq OHLCV: ${symbol} → ${bars.length} bars`);
      return bars;
    }
  } catch (err) {
    logError(`Stooq OHLCV failed for ${symbol}`, err);
  }

  // 2. Yahoo Finance (may be blocked on Railway)
  try {
    const bars = await fetchYahooBars(symbol, period);
    if (bars.length >= 20) {
      log(`Yahoo OHLCV: ${symbol} → ${bars.length} bars`);
      return bars;
    }
  } catch (err) {
    logError(`Yahoo OHLCV failed for ${symbol}`, err);
  }

  // 3. Alpha Vantage (optional free key — 25 calls/day)
  const avKey = process.env.ALPHA_VANTAGE_KEY;
  if (avKey) {
    try {
      const bars = await fetchAlphaVantage(symbol, avKey);
      if (bars.length >= 20) {
        log(`AlphaVantage OHLCV: ${symbol} → ${bars.length} bars`);
        return bars;
      }
    } catch (err) {
      logError(`Alpha Vantage OHLCV failed for ${symbol}`, err);
    }
  }

  logError(`All data sources failed for ${symbol}`, null);
  return [];
}

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
