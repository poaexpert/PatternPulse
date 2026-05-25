// yahoo-finance2 v2.x is ESM-only — must use dynamic import() from CommonJS.
// Lazy-load and cache the module on first use.
let _yahooFinance: any = null;

async function getYahooFinance(): Promise<any> {
  if (!_yahooFinance) {
    const mod = await import('yahoo-finance2');
    _yahooFinance = mod.default ?? mod;
  }
  return _yahooFinance;
}

import { log } from '../utils/logger';
import type { HistoricalResult } from 'yahoo-finance2';

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

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch a single quote safely
async function fetchSingleQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.quote(symbol);
    if (!result) return null;

    const price = result.regularMarketPrice ?? 0;
    const previousClose = result.regularMarketPreviousClose ?? price;
    const change = result.regularMarketChange ?? price - previousClose;
    const changePercent = result.regularMarketChangePercent ?? 0;

    return {
      symbol: result.symbol || symbol,
      name: result.longName || result.shortName || symbol,
      price,
      previousClose,
      change,
      changePercent,
      volume: result.regularMarketVolume ?? 0,
      avgVolume: result.averageDailyVolume3Month ?? result.averageDailyVolume10Day ?? 0,
      marketCap: result.marketCap,
      high52Week: result.fiftyTwoWeekHigh,
      low52Week: result.fiftyTwoWeekLow,
      preMarketPrice: result.preMarketPrice,
      preMarketChange: result.preMarketChange,
      preMarketChangePercent: result.preMarketChangePercent,
    };
  } catch (err) {
    // Suppress per-symbol errors to avoid log spam
    return null;
  }
}

/**
 * Fetch batch quotes for multiple symbols.
 * Processes in batches of 10 with 200ms delay between batches.
 */
export async function fetchBatchQuotes(symbols: string[]): Promise<QuoteData[]> {
  const results: QuoteData[] = [];
  const batchSize = 10;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((sym) => fetchSingleQuote(sym)));

    for (const result of batchResults) {
      if (result !== null) {
        results.push(result);
      }
    }

    // Delay between batches to respect rate limits
    if (i + batchSize < symbols.length) {
      await sleep(200);
    }
  }

  return results;
}

/**
 * Fetch historical OHLCV data (default 90 days of daily bars).
 */
export async function fetchHistoricalData(
  symbol: string,
  period: '1mo' | '3mo' | '6mo' | '1y' = '3mo'
): Promise<OHLCVBar[]> {
  try {
    const periodDays: Record<string, number> = {
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
    };

    const daysBack = periodDays[period] ?? 90;
    const period1 = new Date();
    period1.setDate(period1.getDate() - daysBack);
    const period2 = new Date();

    const yf = await getYahooFinance();
    const result = await yf.historical(symbol, {
      period1,
      period2,
      interval: '1d',
    });

    if (!result || result.length === 0) return [];

    return result
      .filter(
        (bar: HistoricalResult) =>
          bar.open !== undefined &&
          bar.high !== undefined &&
          bar.low !== undefined &&
          bar.close !== undefined &&
          bar.volume !== undefined
      )
      .map((bar: HistoricalResult) => ({
        date: bar.date,
        open: bar.open as number,
        high: bar.high as number,
        low: bar.low as number,
        close: bar.close as number,
        volume: bar.volume as number,
      }));
  } catch (err) {
    log(`Failed to fetch historical data for ${symbol}: ${err}`);
    return [];
  }
}

/**
 * Get market overview data for major indices and VIX.
 */
export async function fetchMarketOverview(): Promise<
  { symbol: string; price: number; change: number; changePercent: number }[]
> {
  const symbols = ['SPY', 'QQQ', 'IWM', '^VIX'];
  const results: { symbol: string; price: number; change: number; changePercent: number }[] = [];

  for (const symbol of symbols) {
    try {
      const yf = await getYahooFinance();
      const quote = await yf.quote(symbol);
      if (quote) {
        results.push({
          symbol: symbol === '^VIX' ? 'VIX' : quote.symbol || symbol,
          price: quote.regularMarketPrice ?? 0,
          change: quote.regularMarketChange ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
        });
      }
    } catch (err) {
      log(`Failed to fetch market overview for ${symbol}: ${err}`);
    }
    await sleep(100);
  }

  return results;
}
