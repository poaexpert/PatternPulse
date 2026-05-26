export type ScanType =
  | 'MOMENTUM'
  | 'VOLUME_SURGE'
  | 'GAP_UP'
  | 'GAP_DOWN'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'MACD_BULLISH'
  | 'MACD_BEARISH'
  | 'BB_SQUEEZE'
  | 'SHORT_SQUEEZE'
  | 'EMA_CROSS_BULLISH'
  | 'EMA_CROSS_BEARISH'
  | 'VWAP_RECLAIM'
  | 'RELATIVE_STRENGTH'
  | 'HALT_RESUME'
  | 'PREMARKET_MOVER';

export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface Signal {
  type: string;
  description: string;
  strength: number; // 1-10
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
  strength: number; // composite 1-10
  direction: Direction;
  entry?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  riskReward?: number;
  timestamp: Date;
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
  triggered?: Date;
  triggerCount: number;
  lastPrice?: number;
  createdAt: Date;
  note?: string;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  addedAt: Date;
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

export interface MarketOverview {
  spyChange: number;
  qqqChange: number;
  iwmChange: number;
  vixLevel: number;
  marketStatus: 'PRE_MARKET' | 'OPEN' | 'AFTER_HOURS' | 'CLOSED';
  topGainers: ScanResult[];
  topLosers: ScanResult[];
  mostActive: ScanResult[];
}

export interface JournalEntry {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  target: number | null;
  size: number | null;
  entryDate: string;
  exitDate: string | null;
  pnl: number | null;
  pnlPercent: number | null;
  setup: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

export interface StoreData {
  scanResults: ScanResult[];
  alerts: Alert[];
  watchlist: WatchlistItem[];
  notificationSettings: NotificationSettings;
  lastScanTime: Date | null;
  scanInProgress: boolean;
  alertHistory: { id: string; symbol: string; message: string; timestamp: Date }[];
  analysisHistory: (Record<string, unknown> & { id: string })[];
  journal: JournalEntry[];
}
