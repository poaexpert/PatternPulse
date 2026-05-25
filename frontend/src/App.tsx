import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSocket } from './hooks/useSocket';
import { useStore } from './store';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Dashboard from './components/Dashboard/Dashboard';
import ScannerPanel from './components/Scanner/ScannerPanel';
import AlertPanel from './components/Alerts/AlertPanel';
import WatchlistPanel from './components/Watchlist/WatchlistPanel';
import NotificationSettings from './components/Settings/NotificationSettings';
import type { ScanResult, Alert, WatchlistItem, NotificationSettings as NS, MarketStatus } from './types';

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-terminal-bg flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <svg className="w-10 h-10 text-terminal-cyan" viewBox="0 0 24 24" fill="none">
            <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M6 12l3 3 3-6 3 4 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-2xl font-bold text-terminal-text-primary tracking-tight">
            Pattern<span className="text-terminal-cyan">Pulse</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-terminal-text-secondary text-sm">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          <span>Initializing trading terminal...</span>
        </div>
        <div className="w-48 h-1 bg-terminal-card rounded-full overflow-hidden">
          <div className="h-full bg-terminal-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useSocket();

  const {
    activeView,
    setScanResults,
    setAlerts,
    setWatchlist,
    setNotificationSettings,
    setMarketStatus,
    isInitialLoading,
    setIsInitialLoading,
  } = useStore();

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    // Fetch all initial data in parallel
    const fetchInitialData = async () => {
      try {
        const [
          scanRes,
          alertsRes,
          watchlistRes,
          settingsRes,
          marketRes,
        ] = await Promise.allSettled([
          axios.get<ScanResult[]>('/api/scanner/results'),
          axios.get<Alert[]>('/api/alerts'),
          axios.get<WatchlistItem[]>('/api/watchlist'),
          axios.get<NS>('/api/notifications/settings'),
          axios.get<MarketStatus>('/api/market/overview'),
        ]);

        if (scanRes.status === 'fulfilled') {
          setScanResults(
            scanRes.value.data.map((r) => ({
              ...r,
              timestamp: new Date(r.timestamp),
            }))
          );
        }

        if (alertsRes.status === 'fulfilled') {
          setAlerts(alertsRes.value.data);
        }

        if (watchlistRes.status === 'fulfilled') {
          setWatchlist(watchlistRes.value.data);
        }

        if (settingsRes.status === 'fulfilled') {
          setNotificationSettings(settingsRes.value.data);
        }

        if (marketRes.status === 'fulfilled') {
          setMarketStatus(marketRes.value.data);
        }
      } catch (err) {
        setLoadError('Failed to connect to backend. Running in offline mode.');
        console.warn('[App] Initial data fetch failed:', err);
      } finally {
        setIsInitialLoading(false);
      }
    };

    fetchInitialData();
  }, [setScanResults, setAlerts, setWatchlist, setNotificationSettings, setMarketStatus, setIsInitialLoading]);

  if (isInitialLoading) {
    return <LoadingScreen />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'scanner': return <ScannerPanel />;
      case 'alerts': return <AlertPanel />;
      case 'watchlist': return <WatchlistPanel />;
      case 'settings': return <NotificationSettings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-terminal-bg overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        {loadError && (
          <div className="bg-terminal-yellow/10 border-b border-terminal-yellow/30 px-4 py-2 text-terminal-yellow text-xs flex items-center justify-between">
            <span>{loadError}</span>
            <button
              onClick={() => setLoadError(null)}
              className="text-terminal-yellow/60 hover:text-terminal-yellow ml-4"
            >
              ✕
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="animate-[fadeIn_0.3s_ease-in-out]">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
