import { StoreData, Alert, WatchlistItem, NotificationSettings, ScanResult, ScanType, JournalEntry } from './types';
import { ChartAnalysis } from './analysis/claude';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log, logError } from './utils/logger';

const STORE_FILE = path.join(__dirname, '../data/store.json');

const ALL_SCAN_TYPES: ScanType[] = [
  'MOMENTUM', 'VOLUME_SURGE', 'GAP_UP', 'GAP_DOWN',
  'BREAKOUT', 'BREAKDOWN', 'RSI_OVERSOLD', 'RSI_OVERBOUGHT',
  'MACD_BULLISH', 'MACD_BEARISH', 'BB_SQUEEZE', 'SHORT_SQUEEZE',
  'EMA_CROSS_BULLISH', 'EMA_CROSS_BEARISH', 'VWAP_RECLAIM',
  'RELATIVE_STRENGTH', 'HALT_RESUME', 'PREMARKET_MOVER',
];

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
  },
  pushover: {
    enabled: false,
    userKey: '',
    appToken: '',
  },
  filters: {
    minStrength: 6,
    scanTypes: [...ALL_SCAN_TYPES],
    minVolumeRatio: 1.5,
    minPrice: 2,
    maxPrice: 10000,
    notifyLong: true,
    notifyShort: true,
  },
  maxAlertsPerHour: 20,
  quietHours: null,
};

const DEFAULT_STORE: StoreData = {
  scanResults: [],
  alerts: [],
  watchlist: [],
  notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  lastScanTime: null,
  scanInProgress: false,
  alertHistory: [],
  analysisHistory: [],
  journal: [],
};

class Store {
  private data: StoreData;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = { ...DEFAULT_STORE, notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS } };
    this.load();
  }

  private load(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(STORE_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<StoreData>;

        // Merge parsed data over defaults (protects against new fields added)
        this.data = {
          ...DEFAULT_STORE,
          ...parsed,
          // Parse dates back from JSON strings
          lastScanTime: parsed.lastScanTime ? new Date(parsed.lastScanTime) : null,
          scanInProgress: false, // always reset on restart
          scanResults: (parsed.scanResults ?? []).map((r) => ({
            ...r,
            timestamp: new Date(r.timestamp),
          })),
          alerts: (parsed.alerts ?? []).map((a) => ({
            ...a,
            createdAt: new Date(a.createdAt),
            triggered: a.triggered ? new Date(a.triggered) : undefined,
          })),
          watchlist: (parsed.watchlist ?? []).map((w) => ({
            ...w,
            addedAt: new Date(w.addedAt),
          })),
          alertHistory: (parsed.alertHistory ?? []).map((h) => ({
            ...h,
            timestamp: new Date(h.timestamp),
          })),
          notificationSettings: {
            ...DEFAULT_NOTIFICATION_SETTINGS,
            ...(parsed.notificationSettings ?? {}),
            filters: {
              ...DEFAULT_NOTIFICATION_SETTINGS.filters,
              ...(parsed.notificationSettings?.filters ?? {}),
            },
            telegram: {
              ...DEFAULT_NOTIFICATION_SETTINGS.telegram,
              ...(parsed.notificationSettings?.telegram ?? {}),
            },
            pushover: {
              ...DEFAULT_NOTIFICATION_SETTINGS.pushover,
              ...(parsed.notificationSettings?.pushover ?? {}),
            },
          },
        };

        log('Store loaded from disk');
      } else {
        log('No store file found, starting fresh');
        this.data = {
          ...DEFAULT_STORE,
          notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
        };
      }
    } catch (err) {
      logError('Failed to load store from disk, starting fresh', err);
      this.data = {
        ...DEFAULT_STORE,
        notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
      };
    }
  }

  // Debounced save (max once per 5 seconds)
  save(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        const dataDir = path.dirname(STORE_FILE);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        // Don't persist scan results (they're large and re-fetched on start)
        const toSave = {
          ...this.data,
          scanResults: [],    // skip persisting large results
          scanInProgress: false,
        };
        fs.writeFileSync(STORE_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
      } catch (err) {
        logError('Failed to save store to disk', err);
      }
    }, 5000);
  }

  // ─── Scan Results ────────────────────────────────────────────────────────
  getScanResults(): ScanResult[] {
    return this.data.scanResults;
  }

  setScanResults(results: ScanResult[]): void {
    this.data.scanResults = results;
    this.data.lastScanTime = new Date();
    // Don't save scan results to disk - too large, re-fetched on demand
  }

  // ─── Alerts ──────────────────────────────────────────────────────────────
  getAlerts(): Alert[] {
    return this.data.alerts;
  }

  addAlert(alert: Omit<Alert, 'id' | 'createdAt' | 'triggerCount'>): Alert {
    const newAlert: Alert = {
      ...alert,
      id: uuidv4(),
      createdAt: new Date(),
      triggerCount: 0,
    };
    this.data.alerts.push(newAlert);
    this.save();
    return newAlert;
  }

  updateAlert(id: string, updates: Partial<Alert>): Alert | null {
    const idx = this.data.alerts.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    this.data.alerts[idx] = { ...this.data.alerts[idx], ...updates };
    this.save();
    return this.data.alerts[idx];
  }

  deleteAlert(id: string): boolean {
    const before = this.data.alerts.length;
    this.data.alerts = this.data.alerts.filter((a) => a.id !== id);
    if (this.data.alerts.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  triggerAlert(id: string): void {
    const idx = this.data.alerts.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.data.alerts[idx].triggered = new Date();
      this.data.alerts[idx].triggerCount = (this.data.alerts[idx].triggerCount || 0) + 1;
      this.save();
    }
  }

  // ─── Watchlist ───────────────────────────────────────────────────────────
  getWatchlist(): WatchlistItem[] {
    return this.data.watchlist;
  }

  addToWatchlist(item: Omit<WatchlistItem, 'addedAt'>): WatchlistItem {
    // Prevent duplicates
    const existing = this.data.watchlist.find(
      (w) => w.symbol.toUpperCase() === item.symbol.toUpperCase()
    );
    if (existing) return existing;

    const newItem: WatchlistItem = {
      ...item,
      symbol: item.symbol.toUpperCase(),
      addedAt: new Date(),
    };
    this.data.watchlist.push(newItem);
    this.save();
    return newItem;
  }

  removeFromWatchlist(symbol: string): boolean {
    const before = this.data.watchlist.length;
    this.data.watchlist = this.data.watchlist.filter(
      (w) => w.symbol.toUpperCase() !== symbol.toUpperCase()
    );
    if (this.data.watchlist.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  updateWatchlistItem(symbol: string, updates: Partial<WatchlistItem>): WatchlistItem | null {
    const idx = this.data.watchlist.findIndex(
      (w) => w.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (idx === -1) return null;
    this.data.watchlist[idx] = { ...this.data.watchlist[idx], ...updates };
    this.save();
    return this.data.watchlist[idx];
  }

  // ─── Notification Settings ───────────────────────────────────────────────
  getNotificationSettings(): NotificationSettings {
    return this.data.notificationSettings;
  }

  updateNotificationSettings(settings: Partial<NotificationSettings>): NotificationSettings {
    this.data.notificationSettings = {
      ...this.data.notificationSettings,
      ...settings,
      // Deep merge nested objects
      telegram: {
        ...this.data.notificationSettings.telegram,
        ...(settings.telegram ?? {}),
      },
      pushover: {
        ...this.data.notificationSettings.pushover,
        ...(settings.pushover ?? {}),
      },
      filters: {
        ...this.data.notificationSettings.filters,
        ...(settings.filters ?? {}),
      },
    };
    this.save();
    return this.data.notificationSettings;
  }

  // ─── Scan State ──────────────────────────────────────────────────────────
  setScanInProgress(inProgress: boolean): void {
    this.data.scanInProgress = inProgress;
  }

  setLastScanTime(time: Date): void {
    this.data.lastScanTime = time;
    this.save();
  }

  isScanInProgress(): boolean {
    return this.data.scanInProgress;
  }

  getLastScanTime(): Date | null {
    return this.data.lastScanTime;
  }

  // ─── Alert History ───────────────────────────────────────────────────────
  addAlertHistory(symbol: string, message: string): void {
    const entry = { id: uuidv4(), symbol, message, timestamp: new Date() };
    this.data.alertHistory.unshift(entry);
    // Keep only last 500 entries
    if (this.data.alertHistory.length > 500) {
      this.data.alertHistory = this.data.alertHistory.slice(0, 500);
    }
    this.save();
  }

  getAlertHistory(): { id: string; symbol: string; message: string; timestamp: Date }[] {
    return this.data.alertHistory;
  }

  // ─── Analysis History ────────────────────────────────────────────────────
  addAnalysis(analysis: ChartAnalysis & { symbol?: string }): void {
    const entry = { ...analysis, id: uuidv4() } as Record<string, unknown> & { id: string };
    this.data.analysisHistory.unshift(entry);
    if (this.data.analysisHistory.length > 50) {
      this.data.analysisHistory = this.data.analysisHistory.slice(0, 50);
    }
    this.save();
  }

  getAnalysisHistory(): (ChartAnalysis & { symbol?: string; id: string })[] {
    return this.data.analysisHistory as unknown as (ChartAnalysis & { symbol?: string; id: string })[];
  }

  clearAnalysisHistory(): void {
    this.data.analysisHistory = [];
  }

  // ─── Trade Journal ───────────────────────────────────────────────────────
  getJournal(): JournalEntry[] {
    return this.data.journal ?? [];
  }

  addJournalEntry(entry: Omit<JournalEntry, 'id' | 'createdAt'>): JournalEntry {
    const newEntry: JournalEntry = { ...entry, id: uuidv4(), createdAt: new Date().toISOString() };
    if (!this.data.journal) this.data.journal = [];
    this.data.journal.unshift(newEntry);
    this.save();
    return newEntry;
  }

  updateJournalEntry(id: string, updates: Partial<JournalEntry>): JournalEntry | null {
    const idx = (this.data.journal ?? []).findIndex((e) => e.id === id);
    if (idx === -1) return null;
    this.data.journal[idx] = { ...this.data.journal[idx], ...updates };
    this.save();
    return this.data.journal[idx];
  }

  deleteJournalEntry(id: string): boolean {
    const before = (this.data.journal ?? []).length;
    this.data.journal = (this.data.journal ?? []).filter((e) => e.id !== id);
    if (this.data.journal.length !== before) { this.save(); return true; }
    return false;
  }
}

export const store = new Store();
