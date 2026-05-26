import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ScanResult,
  Alert,
  WatchlistItem,
  NotificationSettings,
  MarketStatus,
  ActiveView,
  Direction,
  ScanType,
  AlertHistoryItem,
  ChartAnalysis,
  JournalEntry,
} from '../types';

interface ScanFilter {
  direction: Direction | 'ALL';
  scanType: ScanType | 'ALL';
  minStrength: number;
  search: string;
  sortBy: 'strength' | 'changePercent' | 'volumeRatio' | 'symbol';
}

interface AppState {
  // Scanner
  scanResults: ScanResult[];
  scanInProgress: boolean;
  lastScanTime: Date | null;
  scanFilter: ScanFilter;

  // Market
  marketStatus: MarketStatus | null;

  // Alerts
  alerts: Alert[];
  alertHistory: AlertHistoryItem[];

  // Watchlist
  watchlist: WatchlistItem[];

  // Settings
  notificationSettings: NotificationSettings | null;

  // AI Analysis
  analysisHistory: ChartAnalysis[];

  // Trade Journal
  journal: JournalEntry[];

  // UI
  activeView: ActiveView;
  selectedSymbol: string | null;
  isInitialLoading: boolean;

  // Actions
  setScanResults: (results: ScanResult[]) => void;
  setScanInProgress: (v: boolean) => void;
  setLastScanTime: (t: Date) => void;
  setScanFilter: (f: Partial<ScanFilter>) => void;
  setMarketStatus: (s: MarketStatus) => void;
  setAlerts: (a: Alert[]) => void;
  addAlertHistory: (item: AlertHistoryItem) => void;
  setWatchlist: (w: WatchlistItem[]) => void;
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateWatchlistItem: (symbol: string, updates: Partial<WatchlistItem>) => void;
  setNotificationSettings: (s: NotificationSettings) => void;
  setAnalysisHistory: (history: ChartAnalysis[]) => void;
  addAnalysis: (analysis: ChartAnalysis) => void;
  setJournal: (entries: JournalEntry[]) => void;
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  removeJournalEntry: (id: string) => void;
  setActiveView: (v: ActiveView) => void;
  setSelectedSymbol: (s: string | null) => void;
  setIsInitialLoading: (v: boolean) => void;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  addAlert: (alert: Alert) => void;

  filteredResults: () => ScanResult[];
}

export const useStore = create<AppState>()(persist((set, get) => ({
  // Initial state
  scanResults: [],
  scanInProgress: false,
  lastScanTime: null,
  scanFilter: {
    direction: 'ALL',
    scanType: 'ALL',
    minStrength: 1,
    search: '',
    sortBy: 'strength',
  },
  marketStatus: null,
  alerts: [],
  alertHistory: [],
  watchlist: [],
  notificationSettings: null,
  analysisHistory: [],
  journal: [],
  activeView: 'dashboard',
  selectedSymbol: null,
  isInitialLoading: true,

  // Actions
  setScanResults: (results) => set({ scanResults: results }),

  setScanInProgress: (v) => set({ scanInProgress: v }),

  setLastScanTime: (t) => set({ lastScanTime: t }),

  setScanFilter: (f) =>
    set((state) => ({ scanFilter: { ...state.scanFilter, ...f } })),

  setMarketStatus: (s) => set({ marketStatus: s }),

  setAlerts: (a) => set({ alerts: a }),

  addAlertHistory: (item) =>
    set((state) => ({
      alertHistory: [item, ...state.alertHistory].slice(0, 100),
    })),

  setWatchlist: (w) => set({ watchlist: w }),

  addToWatchlist: (item) =>
    set((state) => {
      const exists = state.watchlist.some((w) => w.symbol === item.symbol);
      if (exists) return state;
      return { watchlist: [item, ...state.watchlist] };
    }),

  removeFromWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.filter((w) => w.symbol !== symbol),
    })),

  updateWatchlistItem: (symbol, updates) =>
    set((state) => ({
      watchlist: state.watchlist.map((w) =>
        w.symbol === symbol ? { ...w, ...updates } : w
      ),
    })),

  setNotificationSettings: (s) => set({ notificationSettings: s }),

  setAnalysisHistory: (history) => set({ analysisHistory: history }),

  addAnalysis: (analysis) =>
    set((state) => ({
      analysisHistory: [analysis, ...state.analysisHistory].slice(0, 50),
    })),

  setJournal: (entries) => set({ journal: entries }),

  addJournalEntry: (entry) =>
    set((state) => ({ journal: [entry, ...state.journal] })),

  updateJournalEntry: (id, updates) =>
    set((state) => ({
      journal: state.journal.map((e) => e.id === id ? { ...e, ...updates } : e),
    })),

  removeJournalEntry: (id) =>
    set((state) => ({ journal: state.journal.filter((e) => e.id !== id) })),

  setActiveView: (v) => set({ activeView: v }),

  setSelectedSymbol: (s) => set({ selectedSymbol: s }),

  setIsInitialLoading: (v) => set({ isInitialLoading: v }),

  toggleAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, active: !a.active } : a
      ),
    })),

  removeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),

  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts] })),

  filteredResults: () => {
    const { scanResults, scanFilter } = get();
    let results = [...scanResults];

    // Direction filter
    if (scanFilter.direction !== 'ALL') {
      results = results.filter((r) => r.direction === scanFilter.direction);
    }

    // Scan type filter
    if (scanFilter.scanType !== 'ALL') {
      results = results.filter((r) =>
        r.scanTypes.includes(scanFilter.scanType as ScanType)
      );
    }

    // Min strength filter
    if (scanFilter.minStrength > 1) {
      results = results.filter((r) => r.strength >= scanFilter.minStrength);
    }

    // Search filter
    if (scanFilter.search.trim()) {
      const q = scanFilter.search.trim().toUpperCase();
      results = results.filter(
        (r) =>
          r.symbol.includes(q) ||
          (r.name && r.name.toUpperCase().includes(q))
      );
    }

    // Sort
    results.sort((a, b) => {
      switch (scanFilter.sortBy) {
        case 'strength':
          return b.strength - a.strength;
        case 'changePercent':
          return Math.abs(b.changePercent) - Math.abs(a.changePercent);
        case 'volumeRatio':
          return b.volumeRatio - a.volumeRatio;
        case 'symbol':
          return a.symbol.localeCompare(b.symbol);
        default:
          return b.strength - a.strength;
      }
    });

    return results;
  },
}), {
  name: 'patternpulse-store',
  partialize: (state) => ({
    analysisHistory: state.analysisHistory,
    scanFilter: state.scanFilter,
  }),
}));
