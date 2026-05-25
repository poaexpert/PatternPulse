import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';
import type { ScanResult, MarketStatus, AlertHistoryItem } from '../types';

let socketInstance: Socket | null = null;

export function useSocket(): void {
  const socketRef = useRef<Socket | null>(null);
  const {
    setScanResults,
    setScanInProgress,
    setLastScanTime,
    addAlertHistory,
    setMarketStatus,
    alertHistory,
  } = useStore();

  useEffect(() => {
    if (socketInstance) {
      socketRef.current = socketInstance;
      return;
    }

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketInstance = socket;
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    socket.on('scan_results', (data: ScanResult[]) => {
      setScanResults(
        data.map((r) => ({ ...r, timestamp: new Date(r.timestamp) }))
      );
    });

    socket.on('scan_started', () => {
      setScanInProgress(true);
    });

    socket.on('scan_complete', (data?: { results?: ScanResult[] }) => {
      setScanInProgress(false);
      setLastScanTime(new Date());
      if (data?.results) {
        setScanResults(
          data.results.map((r) => ({ ...r, timestamp: new Date(r.timestamp) }))
        );
      }
    });

    socket.on(
      'alert_triggered',
      (data: {
        id: string;
        symbol: string;
        message: string;
        conditionType?: string;
        price?: number;
      }) => {
        const historyItem: AlertHistoryItem = {
          id: data.id || `alert-${Date.now()}`,
          symbol: data.symbol,
          message: data.message,
          timestamp: new Date(),
          conditionType: data.conditionType,
          price: data.price,
        };
        addAlertHistory(historyItem);

        // Browser notification
        if (
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(`PatternPulse Alert: ${data.symbol}`, {
            body: data.message,
            icon: '/favicon.svg',
          });
        }
      }
    );

    socket.on('market_update', (data: MarketStatus) => {
      setMarketStatus(data);
    });

    return () => {
      // Don't disconnect on component unmount — keep persistent
    };
  }, [setScanResults, setScanInProgress, setLastScanTime, addAlertHistory, setMarketStatus]);
}

export function useSocketEmit() {
  const emit = useCallback(
    (event: string, data?: unknown) => {
      if (socketInstance && socketInstance.connected) {
        socketInstance.emit(event, data);
      } else {
        console.warn('[Socket] Cannot emit, not connected');
      }
    },
    []
  );

  return emit;
}

export function triggerScan() {
  if (socketInstance && socketInstance.connected) {
    socketInstance.emit('trigger_scan');
  }
}
