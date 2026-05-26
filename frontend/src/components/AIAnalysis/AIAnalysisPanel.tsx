import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import AnalysisResults from './AnalysisResults';
import { useStore } from '../../store';
import type { ChartAnalysis } from '../../types';

function friendlyApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'Analysis failed. Please try again.';
  const body = err.response?.data;
  const msg: string = body?.message ?? err.message ?? 'Unknown error';
  return msg || 'Analysis failed. Please try again.';
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-terminal-cyan animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-terminal-cyan/10 border border-terminal-cyan/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-terminal-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.54A3 3 0 0 1 4.6 9.16a2.5 2.5 0 0 1 .3-4.67A2.5 2.5 0 0 1 9.5 2z"/>
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.54A3 3 0 0 0 19.4 9.16a2.5 2.5 0 0 0-.3-4.67A2.5 2.5 0 0 0 14.5 2z"/>
        </svg>
      </div>
      <p className="text-terminal-text-primary font-semibold mb-1">Technical Analysis</p>
      <p className="text-terminal-text-secondary text-sm leading-relaxed max-w-xs">
        Enter a ticker symbol or futures contract to get free technical analysis
      </p>
      <p className="text-terminal-text-secondary/60 text-xs mt-3">
        Examples: SI=F · GC=F · ES=F · AAPL · SICN26
      </p>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface HistoryCardProps {
  item: ChartAnalysis;
  onClick: () => void;
}

function HistoryCard({ item, onClick }: HistoryCardProps) {
  const signalColor =
    item.topBottomSignal.type === 'TOP' ? 'text-terminal-red bg-terminal-red/10' :
    item.topBottomSignal.type === 'BOTTOM' ? 'text-terminal-green bg-terminal-green/10' :
    'text-terminal-text-secondary bg-terminal-border/30';

  const dirColor =
    item.swingSetup?.direction === 'LONG' ? 'text-terminal-green' :
    item.swingSetup?.direction === 'SHORT' ? 'text-terminal-red' :
    item.trend.direction === 'UP' ? 'text-terminal-green' :
    item.trend.direction === 'DOWN' ? 'text-terminal-red' :
    'text-terminal-cyan';

  const dirLabel =
    item.swingSetup?.direction === 'LONG' ? '▲ LONG' :
    item.swingSetup?.direction === 'SHORT' ? '▼ SHORT' :
    item.trend.direction === 'UP' ? '↑' : item.trend.direction === 'DOWN' ? '↓' : '→';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-terminal-bg hover:bg-terminal-border/20 border border-terminal-border rounded-lg px-3 py-2.5 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-terminal-cyan/15 text-terminal-cyan shrink-0">DATA</span>
          {item.symbol && <span className="text-xs font-semibold text-terminal-text-primary truncate">{item.symbol}</span>}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${signalColor}`}>{item.topBottomSignal.type}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold ${dirColor}`}>{dirLabel}</span>
          <span className="text-[10px] text-terminal-text-secondary">{timeAgo(item.analysedAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-terminal-text-secondary">{item.trend.strength}</span>
        <span className="text-[10px] text-terminal-text-secondary">·</span>
        <span className="text-[10px] text-terminal-text-secondary">Strength {item.signalStrength}/10</span>
        {item.currentPrice != null && (
          <>
            <span className="text-[10px] text-terminal-text-secondary">·</span>
            <span className="text-[10px] text-terminal-cyan font-mono">${item.currentPrice.toFixed(2)}</span>
          </>
        )}
      </div>
    </button>
  );
}

const REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '5m', value: 5 * 60 * 1000 },
  { label: '15m', value: 15 * 60 * 1000 },
  { label: '30m', value: 30 * 60 * 1000 },
];

const TIMEFRAMES = [
  { label: '15m', value: '15m', hint: 'Scalp' },
  { label: '1h',  value: '1h',  hint: 'Intraday' },
  { label: '4h',  value: '4h',  hint: 'Short swing' },
  { label: '1d',  value: '1d',  hint: 'Daily' },
];

export default function AIAnalysisPanel() {
  const { analysisHistory, addAnalysis, setAnalysisHistory, selectedSymbol, setSelectedSymbol } = useStore();

  const [context, setContext] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<ChartAnalysis | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [timeframe, setTimeframe] = useState('1d');
  const [alertsSet, setAlertsSet] = useState(false);
  const [settingAlerts, setSettingAlerts] = useState(false);

  const historyFetchedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSymbolRef = useRef('');

  const fetchHistory = useCallback(async () => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    try {
      const res = await axios.get<{ history: ChartAnalysis[] }>('/api/analysis/history');
      setAnalysisHistory((res.data?.history ?? []).slice(0, 10));
    } catch {
      // history is optional
    } finally {
      setHistoryLoaded(true);
    }
  }, [setAnalysisHistory]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Pre-fill symbol from FuturesPanel navigation
  useEffect(() => {
    if (selectedSymbol && !symbolInput) {
      setSymbolInput(selectedSymbol);
      setSelectedSymbol(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  const runAnalysis = useCallback(async (sym: string, tf?: string) => {
    if (!sym) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const useTf = tf ?? timeframe;
      const res = await axios.post<{ success: boolean; analysis: ChartAnalysis }>(
        `/api/analysis/chart/${sym}?timeframe=${useTf}`,
        { context: context.trim() || undefined }
      );
      const analysis = res.data?.analysis ?? res.data;
      setCurrentAnalysis(analysis as ChartAnalysis);
      addAnalysis(analysis as ChartAnalysis);
      setLastRefreshed(new Date());
      setAlertsSet(false);
    } catch (err: unknown) {
      setError(friendlyApiError(err));
    } finally {
      setIsAnalyzing(false);
    }
  }, [context, addAnalysis, timeframe]);

  const analyzeSymbol = async () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) { setError('Please enter a symbol.'); return; }
    activeSymbolRef.current = sym;
    setAlertsSet(false);
    await runAnalysis(sym);
  };

  const setExitAlerts = async (analysis: ChartAnalysis) => {
    const { swingSetup, symbol, resolvedSymbol } = analysis;
    if (!swingSetup.exists || swingSetup.direction === 'NONE') return;
    const sym = resolvedSymbol ?? symbol ?? activeSymbolRef.current;
    if (!sym) return;

    const isLong = swingSetup.direction === 'LONG';
    setSettingAlerts(true);
    try {
      const promises = [];
      if (swingSetup.target1 != null) {
        promises.push(axios.post('/api/alerts', {
          symbol: sym,
          conditionType: isLong ? 'PRICE_ABOVE' : 'PRICE_BELOW',
          threshold: swingSetup.target1,
          notifyMethods: ['browser'],
          note: `EXIT ${swingSetup.direction} — Target 1 hit`,
        }));
      }
      if (swingSetup.stopLoss != null) {
        promises.push(axios.post('/api/alerts', {
          symbol: sym,
          conditionType: isLong ? 'PRICE_BELOW' : 'PRICE_ABOVE',
          threshold: swingSetup.stopLoss,
          notifyMethods: ['browser'],
          note: `STOP HIT — Exit ${swingSetup.direction} immediately`,
        }));
      }
      if (swingSetup.target2 != null) {
        promises.push(axios.post('/api/alerts', {
          symbol: sym,
          conditionType: isLong ? 'PRICE_ABOVE' : 'PRICE_BELOW',
          threshold: swingSetup.target2,
          notifyMethods: ['browser'],
          note: `EXIT ${swingSetup.direction} — Target 2 hit`,
        }));
      }
      await Promise.all(promises);
      setAlertsSet(true);
    } catch {
      setError('Failed to set exit alerts. Check the Alerts panel.');
    } finally {
      setSettingAlerts(false);
    }
  };

  // Auto-refresh timer
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (refreshInterval > 0 && activeSymbolRef.current) {
      refreshTimerRef.current = setInterval(() => {
        if (activeSymbolRef.current && !isAnalyzing) {
          runAnalysis(activeSymbolRef.current);
        }
      }, refreshInterval);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [refreshInterval, runAnalysis, isAnalyzing]);

  const displayHistory = analysisHistory.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary">Technical Analysis</h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Free · Stooq + multi-source · No API key</p>
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25">
          15m · 1h · 4h · 1d
        </span>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left — Input Panel */}
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-terminal-text-primary">Analyze Symbol</h2>

          {/* Symbol input + button */}
          <div className="flex gap-2">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && analyzeSymbol()}
              placeholder="SI=F, GC=F, ES=F, AAPL, SICN26…"
              className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 transition-colors font-mono uppercase"
            />
            <button
              onClick={analyzeSymbol}
              disabled={isAnalyzing || !symbolInput.trim()}
              className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm transition-all hover:bg-terminal-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isAnalyzing ? <span className="flex items-center gap-1">Analyzing<TypingDots /></span> : 'Analyze'}
            </button>
          </div>

          {/* Timeframe selector */}
          <div>
            <p className="text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1.5">Timeframe</p>
            <div className="flex gap-1.5">
              {TIMEFRAMES.map(({ label, value, hint }) => (
                <button
                  key={value}
                  onClick={() => setTimeframe(value)}
                  title={hint}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors font-bold ${
                    timeframe === value
                      ? 'bg-terminal-cyan/20 border-terminal-cyan/50 text-terminal-cyan'
                      : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30 hover:text-terminal-text-primary'
                  }`}
                >
                  {label}
                  <span className="block text-[9px] font-normal opacity-70 leading-tight">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick picks for futures */}
          <div>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1.5">Quick Pick</p>
            <div className="flex flex-wrap gap-1.5">
              {['SI=F', 'GC=F', 'ES=F', 'NQ=F', 'CL=F', 'GC=F'].filter((v, i, a) => a.indexOf(v) === i).map((sym) => (
                <button
                  key={sym}
                  onClick={() => { setSymbolInput(sym); activeSymbolRef.current = sym; }}
                  className="text-[11px] px-2.5 py-1 rounded bg-terminal-bg border border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/50 hover:text-terminal-cyan transition-colors font-mono"
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Context textarea */}
          <div>
            <label className="text-[11px] font-semibold text-terminal-text-secondary uppercase tracking-wider block mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Timeframe, what you're watching for…"
              rows={2}
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 resize-none focus:outline-none focus:border-terminal-cyan/50 transition-colors"
            />
          </div>

          {/* Auto-refresh */}
          <div>
            <p className="text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1.5">
              Auto-Refresh
              {refreshInterval > 0 && lastRefreshed && (
                <span className="ml-2 normal-case font-normal text-terminal-cyan">
                  · last: {timeAgo(lastRefreshed.toISOString())}
                </span>
              )}
            </p>
            <div className="flex gap-1.5">
              {REFRESH_INTERVALS.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setRefreshInterval(value)}
                  className={`text-[11px] px-3 py-1 rounded border transition-colors font-semibold ${
                    refreshInterval === value
                      ? 'bg-terminal-cyan/20 border-terminal-cyan/50 text-terminal-cyan'
                      : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {refreshInterval > 0 && (
              <p className="text-[10px] text-terminal-text-secondary/70 mt-1">
                Analysis refreshes every {REFRESH_INTERVALS.find((r) => r.value === refreshInterval)?.label} automatically
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-terminal-red/10 border border-terminal-red/25 px-3 py-2.5 text-sm text-terminal-red flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right — Results Panel */}
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 min-h-64 overflow-y-auto max-h-[70vh]">
          {currentAnalysis ? (
            <div className="space-y-3">
              <AnalysisResults analysis={currentAnalysis} timeframe={timeframe} />
              {/* Exit alerts button — shown when a swing setup exists */}
              {currentAnalysis.swingSetup.exists && currentAnalysis.swingSetup.direction !== 'NONE' && (
                <button
                  onClick={() => setExitAlerts(currentAnalysis)}
                  disabled={settingAlerts || alertsSet}
                  className={`w-full py-2.5 rounded-lg border font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    alertsSet
                      ? 'bg-terminal-green/15 border-terminal-green/40 text-terminal-green cursor-default'
                      : 'bg-terminal-yellow/10 border-terminal-yellow/30 text-terminal-yellow hover:bg-terminal-yellow/20 disabled:opacity-50'
                  }`}
                >
                  {alertsSet ? (
                    <><span>✓</span> Exit Alerts Active — Check Alerts Panel</>
                  ) : settingAlerts ? (
                    <><span className="animate-spin">⟳</span> Setting Alerts…</>
                  ) : (
                    <><span>🔔</span> Set Exit Alerts (Target + Stop Loss)</>
                  )}
                </button>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Analysis History */}
      {(displayHistory.length > 0 || historyLoaded) && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-terminal-text-primary mb-3">
            Recent Analyses
            {displayHistory.length > 0 && (
              <span className="ml-2 text-[10px] font-normal text-terminal-text-secondary">({displayHistory.length})</span>
            )}
          </h2>
          {displayHistory.length === 0 ? (
            <p className="text-sm text-terminal-text-secondary">No previous analyses yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {displayHistory.map((item, i) => (
                <HistoryCard
                  key={item.id ?? `${item.analysedAt}-${i}`}
                  item={item}
                  onClick={() => setCurrentAnalysis(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
