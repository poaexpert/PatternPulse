// Stock universe for PatternPulse scanning
// ~200 symbols covering mega/large cap, ETFs, momentum plays, and sector leaders

export const SCAN_UNIVERSE: string[] = [
  // Mega Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA',
  'AVGO', 'ORCL', 'ADBE', 'CRM', 'INTC', 'QCOM', 'TXN', 'NOW', 'INTU', 'IBM',
  'AMD', 'NFLX',

  // Financial
  'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'C', 'WFC', 'USB',
  'BLK', 'SCHW', 'AXP',

  // Healthcare / Pharma
  'UNH', 'JNJ', 'ABBV', 'MRK', 'PFE', 'MRNA', 'BNTX', 'GILD', 'BIIB',
  'REGN', 'VRTX', 'BMY', 'ABT', 'MDT', 'ZBH', 'LLY',

  // Consumer Staples / Discretionary
  'PG', 'WMT', 'COST', 'HD', 'NKE', 'SBUX', 'MCD', 'YUM', 'DPZ', 'CMG',
  'LULU', 'RH', 'TGT', 'TJX', 'LOW', 'ETSY',

  // Energy
  'XOM', 'CVX', 'COP', 'OXY', 'SLB', 'HAL', 'MPC', 'PSX',

  // Industrial / Other Large Cap
  'UNH', 'RTX', 'HON', 'UPS', 'DE', 'CAT', 'MMM', 'GE', 'BA',

  // Ride-share / Travel / Booking
  'UBER', 'LYFT', 'ABNB', 'BKNG', 'EXPE',

  // Social / Entertainment
  'SNAP', 'PINS', 'SPOT', 'RBLX', 'EA', 'ATVI',

  // Fintech / Payments
  'SQ', 'PYPL', 'SOFI', 'AFRM', 'UPST', 'HOOD',

  // SaaS / Cloud
  'TWLO', 'ZM', 'PLTR', 'NET', 'DDOG', 'SNOW', 'U', 'OKTA', 'MDB',
  'HUBS', 'BILL', 'GTLB',

  // Meme / High Volatility
  'GME', 'AMC', 'BB', 'NOK',

  // EV / Auto
  'LCID', 'RIVN', 'NIO', 'XPEV', 'LI', 'F', 'GM',

  // Crypto-related
  'MARA', 'RIOT', 'COIN', 'MSTR',

  // E-commerce / Retail Tech
  'SHOP', 'SE', 'RDFN', 'OPEN', 'Z',

  // Biotech
  'TDOC', 'SKLZ', 'BEAM', 'CRSP', 'NTLA',

  // Healthcare tech
  'VEEV', 'DOCS', 'PHR',

  // Semiconductors
  'AMAT', 'LRCX', 'KLAC', 'MU', 'MRVL', 'ON', 'SWKS', 'MPWR',

  // ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI',
  'XLY', 'XLC', 'ARKK', 'ARKG', 'GLD', 'SLV', 'TLT', 'HYG', 'VXX',
  'SOXL', 'TQQQ', 'SPXL', 'LABU',

  // Additional momentum favorites
  'ROKU', 'TLRY', 'SNDL', 'CLOV', 'SPCE', 'WKHS', 'NKLA', 'HYLN',
  'FCEL', 'PLUG', 'BLNK', 'CHPT',

  // REITs
  'AMT', 'PLD', 'EQIX', 'O', 'SPG',

  // Telecom
  'T', 'VZ', 'TMUS',

  // Media / Streaming
  'DIS', 'CMCSA', 'PARA', 'WBD', 'FOXA',
];

// Remove duplicates
const uniqueUniverse = [...new Set(SCAN_UNIVERSE)];
export const MARKET_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'VXX'];

// Re-export deduplicated universe
export { uniqueUniverse as UNIVERSE };

// ─── Futures Universe ─────────────────────────────────────────────────────────
export const FUTURES_UNIVERSE: string[] = [
  // US Equity Index Futures
  'ES=F',   // S&P 500 E-mini
  'NQ=F',   // NASDAQ 100 E-mini
  'YM=F',   // Dow Jones E-mini
  'RTY=F',  // Russell 2000 E-mini

  // Commodities
  'CL=F',   // Crude Oil WTI
  'BZ=F',   // Brent Crude Oil
  'GC=F',   // Gold
  'SI=F',   // Silver
  'HG=F',   // Copper
  'NG=F',   // Natural Gas
  'ZC=F',   // Corn
  'ZW=F',   // Wheat
  'ZS=F',   // Soybeans

  // Fixed Income
  'ZN=F',   // 10-Year T-Note
  'ZB=F',   // 30-Year T-Bond
  'ZT=F',   // 2-Year T-Note

  // Currencies (FX Futures)
  '6E=F',   // Euro FX
  '6J=F',   // Japanese Yen
  '6B=F',   // British Pound
  '6C=F',   // Canadian Dollar

  // Crypto Futures (CME)
  'BTC=F',  // Bitcoin CME
  'ETH=F',  // Ethereum CME

  // VIX
  'VX=F',   // VIX Futures
];

// Human-readable names for futures
export const FUTURES_NAMES: Record<string, string> = {
  'ES=F': 'S&P 500 Futures',
  'NQ=F': 'NASDAQ Futures',
  'YM=F': 'Dow Futures',
  'RTY=F': 'Russell 2000 Futures',
  'CL=F': 'Crude Oil WTI',
  'BZ=F': 'Brent Crude',
  'GC=F': 'Gold',
  'SI=F': 'Silver',
  'HG=F': 'Copper',
  'NG=F': 'Natural Gas',
  'ZC=F': 'Corn',
  'ZW=F': 'Wheat',
  'ZS=F': 'Soybeans',
  'ZN=F': '10-Year T-Note',
  'ZB=F': '30-Year T-Bond',
  'ZT=F': '2-Year T-Note',
  '6E=F': 'Euro/USD Futures',
  '6J=F': 'Yen/USD Futures',
  '6B=F': 'GBP/USD Futures',
  '6C=F': 'CAD/USD Futures',
  'BTC=F': 'Bitcoin Futures (CME)',
  'ETH=F': 'Ethereum Futures (CME)',
  'VX=F': 'VIX Futures',
};

// ─── Crypto Universe ──────────────────────────────────────────────────────────
export const CRYPTO_UNIVERSE: string[] = [
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'BNB-USD',
  'XRP-USD',
  'DOGE-USD',
  'ADA-USD',
  'AVAX-USD',
  'MATIC-USD',
  'LINK-USD',
];

// ─── Combined Universe ────────────────────────────────────────────────────────
export const ALL_UNIVERSE: string[] = [
  ...new Set([...SCAN_UNIVERSE, ...FUTURES_UNIVERSE, ...CRYPTO_UNIVERSE]),
];
