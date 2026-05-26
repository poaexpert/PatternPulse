export type ScanType =
  | 'MOMENTUM' | 'VOLUME_SURGE' | 'GAP_UP' | 'GAP_DOWN'
  | 'BREAKOUT' | 'BREAKDOWN' | 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT'
  | 'MACD_BULLISH' | 'MACD_BEARISH' | 'BB_SQUEEZE' | 'SHORT_SQUEEZE'
  | 'EMA_CROSS_BULLISH' | 'EMA_CROSS_BEARISH' | 'VWAP_RECLAIM'
  | 'RELATIVE_STRENGTH' | 'HALT_RESUME' | 'PREMARKET_MOVER';

export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface Signal {
  type: string;
  description: string;
  strength: number;
  direction: Direction;
}

export interface IndicatorValues {
  rsi14?: number;
  macd?: { value: number; signal: number; histogram: number };
  bb?: { upper: number; middle: number; lower: number; width: number; percentB: number };
  ema9?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  vwap?: number;
  atr?: number;
  volumeRatio?: number;
}

export interface ScanResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  signals: Signal[];
  indicators: IndicatorValues;
  scanTypes: ScanType[];
  strength: number;
  direction: Direction;
  entry?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  riskReward?: number;
  timestamp: Date | string;
}

export interface Alert {
  id: string;
  symbol: string;
  conditionType:
    | 'PRICE_ABOVE'
    | 'PRICE_BELOW'
    | 'PERCENT_CHANGE_UP'
    | 'PERCENT_CHANGE_DOWN'
    | 'VOLUME_SURGE'
    | 'RSI_ABOVE'
    | 'RSI_BELOW'
    | 'SCAN_MATCH';
  threshold: number;
  notifyMethods: ('telegram' | 'pushover' | 'browser')[];
  active: boolean;
  triggered?: string;
  triggerCount: number;
  lastPrice?: number;
  createdAt: string;
  note?: string;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  addedAt: string;
  notes?: string;
  alertPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
}

export interface NotificationSettings {
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
  pushover: {
    enabled: boolean;
    userKey: string;
    appToken: string;
  };
  filters: {
    minStrength: number;
    scanTypes: ScanType[];
    minVolumeRatio: number;
    minPrice: number;
    maxPrice: number;
    notifyLong: boolean;
    notifyShort: boolean;
  };
  maxAlertsPerHour: number;
  quietHours: { start: string; end: string } | null;
}

export interface MarketStatus {
  status: 'PRE_MARKET' | 'OPEN' | 'AFTER_HOURS' | 'CLOSED';
  spyChange: number;
  qqqChange: number;
  iwmChange: number;
  vixLevel: number;
}

export type ActiveView = 'dashboard' | 'scanner' | 'alerts' | 'watchlist' | 'settings' | 'ai-analysis' | 'futures';

export interface ChartAnalysis {
  currentPrice?: number;
  trend: {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    structure: string;
  };
  topBottomSignal: {
    type: 'TOP' | 'BOTTOM' | 'NONE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
  };
  keyLevels: {
    support: number[];
    resistance: number[];
    keyLevel: number | null;
  };
  patterns: {
    name: string;
    implication: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    completion: 'COMPLETE' | 'FORMING' | 'PARTIAL';
    target: number | null;
  }[];
  swingSetup: {
    exists: boolean;
    direction: 'LONG' | 'SHORT' | 'NONE';
    entry: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    riskReward: number | null;
    timeframe: string;
    description: string;
  };
  indicators: {
    rsiSignal: string;
    macdSignal: string;
    volumeSignal: string;
    summary: string;
  };
  signalStrength: number;
  summary: string;
  warnings: string[];
  analysedAt: string;
  source: 'image' | 'data';
  symbol?: string;
  resolvedSymbol?: string;
  id?: string;
}

export interface FuturesQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: 'INDEX' | 'COMMODITY' | 'BOND' | 'CURRENCY' | 'CRYPTO' | 'VOLATILITY';
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AlertHistoryItem {
  id: string;
  symbol: string;
  message: string;
  timestamp: Date;
  conditionType?: string;
  price?: number;
}

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  bid?: number;
  ask?: number;
  dayHigh?: number;
  dayLow?: number;
}
