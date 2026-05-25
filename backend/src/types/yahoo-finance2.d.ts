/**
 * Minimal type declarations for yahoo-finance2 to work with commonjs moduleResolution.
 * The actual package only ships ESM, so we declare its shape here for TypeScript.
 */
declare module 'yahoo-finance2' {
  export interface QuoteResult {
    symbol: string;
    longName?: string;
    shortName?: string;
    regularMarketPrice?: number;
    regularMarketPreviousClose?: number;
    regularMarketChange?: number;
    regularMarketChangePercent?: number;
    regularMarketVolume?: number;
    averageDailyVolume3Month?: number;
    averageDailyVolume10Day?: number;
    marketCap?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    preMarketPrice?: number;
    preMarketChange?: number;
    preMarketChangePercent?: number;
    marketState?: string;
    [key: string]: unknown;
  }

  export interface HistoricalResult {
    date: Date;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    adjClose?: number;
    volume?: number;
  }

  export interface YahooFinance {
    quote(symbol: string, queryOptions?: Record<string, unknown>): Promise<QuoteResult>;
    historical(
      symbol: string,
      queryOptions: {
        period1: Date | string;
        period2?: Date | string;
        interval?: '1d' | '1wk' | '1mo';
      }
    ): Promise<HistoricalResult[]>;
  }

  const yahooFinance: YahooFinance;
  export default yahooFinance;
}
