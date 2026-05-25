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
