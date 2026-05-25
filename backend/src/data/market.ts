// Market data via Yahoo Finance JSON API directly (axios) — no SDK, no ESM issues.
import axios from 'axios';
import { logError } from '../utils/logger';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

const QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function fetchQuoteBatch(symbols: string[]): Promise<QuoteData[]> {
  try {
    const url = `${QUOTE_URL}?symbols=${symbols.map(encodeURIComponent).join(',')}`;
    const res = await axios.get(url, { headers: YF_HEADERS, timeout: 12000 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = res.data?.quoteResponse?.result ?? [];
    return results.map((q) => mapQuote(q, q.symbol));
  } catch (err) {
    logError(`Quote batch failed for [${symbols.slice(0, 3).join(',')}...]`, err);
    return [];
  }
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

export async function fetchHistoricalData(
  symbol: string,
  period: '1mo' | '3mo' | '6mo' | '1y' = '3mo'
): Promise<OHLCVBar[]> {
  try {
    const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=${period}`;
    const res = await axios.get(url, { headers: YF_HEADERS, timeout: 15000 });
    const chart = res.data?.chart?.result?.[0];
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
  } catch (err) {
    logError(`Historical data failed for ${symbol}`, err);
    return [];
  }
}

export async function fetchMarketOverview(): Promise<
  { symbol: string; price: number; change: number; changePercent: number }[]
> {
  const symbols = ['SPY', 'QQQ', 'IWM', '^VIX'];
  try {
    const quotes = await fetchQuoteBatch(symbols);
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
