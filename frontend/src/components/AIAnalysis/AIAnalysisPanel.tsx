import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import ImageUpload from './ImageUpload';
import AnalysisResults from './AnalysisResults';
import { useStore } from '../../store';
import type { ChartAnalysis } from '../../types';

function friendlyApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) return 'Analysis failed. Please try again.';
  const body = err.response?.data;
  const raw: string = body?.error?.message ?? body?.message ?? err.message ?? '';
  if (raw.toLowerCase().includes('credit') || raw.toLowerCase().includes('balance') || err.response?.status === 400) {
    return '💳 Your Anthropic account has no credits. Go to console.anthropic.com → Billing → Add credits (≈$5 = hundreds of analyses).';
  }
  if (err.response?.status === 503) {
    return '⚙️ AI analysis is not configured. Add ANTHROPIC_API_KEY to your Railway environment variables.';
  }
  return raw || 'Analysis failed. Please try again.';
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-terminal-cyan animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
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
      <p className="text-terminal-text-primary font-semibold mb-1">AI Chart Analysis</p>
      <p className="text-terminal-text-secondary text-sm leading-relaxed max-w-xs">
        Upload a chart screenshot or enter a symbol to get AI-powered technical analysis
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
    item.topBottomSignal.type === 'TOP'
      ? 'text-terminal-red bg-terminal-red/10'
      : item.topBottomSignal.type === 'BOTTOM'
      ? 'text-terminal-green bg-terminal-green/10'
      : 'text-terminal-text-secondary bg-terminal-border/30';

  const directionColor =
    item.trend.direction === 'UP'
      ? 'text-terminal-green'
      : item.trend.direction === 'DOWN'
      ? 'text-terminal-red'
      : 'text-terminal-cyan';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-terminal-bg hover:bg-terminal-border/20 border border-terminal-border rounded-lg px-3 py-2.5 transition-colors group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${item.source === 'image' ? 'bg-terminal-purple/15 text-terminal-purple' : 'bg-terminal-cyan/15 text-terminal-cyan'}`}>
            {item.source === 'image' ? 'IMAGE' : 'DATA'}
          </span>
          {item.symbol && (
            <span className="text-xs font-semibold text-terminal-text-primary truncate">{item.symbol}</span>
          )}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${signalColor}`}>
            {item.topBottomSignal.type}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold ${directionColor}`}>
            {item.trend.direction === 'UP' ? '↑' : item.trend.direction === 'DOWN' ? '↓' : '→'}
          </span>
          <span className="text-[10px] text-terminal-text-secondary">{timeAgo(item.analysedAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-terminal-text-secondary">{item.trend.strength}</span>
        <span className="text-[10px] text-terminal-text-secondary">·</span>
        <span className="text-[10px] text-terminal-text-secondary">Strength {item.signalStrength}/10</span>
      </div>
    </button>
  );
}

export default function AIAnalysisPanel() {
  const { analysisHistory, addAnalysis, setAnalysisHistory } = useStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [context, setContext] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<ChartAnalysis | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const historyFetchedRef = useRef(false);

  // Fetch history once
  const fetchHistory = useCallback(async () => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    try {
      const res = await axios.get<ChartAnalysis[]>('/api/analysis/history');
      setAnalysisHistory(res.data.slice(0, 10));
    } catch {
      // history is optional — don't show error
    } finally {
      setHistoryLoaded(true);
    }
  }, [setAnalysisHistory]);

  // Fetch history on mount
  useState(() => {
    fetchHistory();
  });

  const handleImageSelect = useCallback((file: File, preview: string) => {
    setSelectedFile(file);
    setImagePreview(preview);
    setError(null);
  }, []);

  const analyzeImage = async () => {
    if (!selectedFile) {
      setError('Please upload a chart image first.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      if (context.trim()) formData.append('context', context.trim());

      const res = await axios.post<ChartAnalysis>('/api/analysis/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCurrentAnalysis(res.data);
      addAnalysis(res.data);
    } catch (err: unknown) {
      setError(friendlyApiError(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeSymbol = async () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) {
      setError('Please enter a symbol.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await axios.post<ChartAnalysis>(`/api/analysis/chart/${sym}`, {
        context: context.trim() || undefined,
      });
      setCurrentAnalysis(res.data);
      addAnalysis(res.data);
    } catch (err: unknown) {
      setError(friendlyApiError(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const displayHistory = analysisHistory.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary">AI Chart Analysis</h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Technical analysis powered by Claude</p>
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-terminal-purple/15 text-terminal-purple border border-terminal-purple/25">
          Powered by Claude claude-opus-4-7
        </span>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left — Upload Panel */}
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-semibold text-terminal-text-primary">Upload Chart</h2>

          <ImageUpload onImageSelect={handleImageSelect} isAnalyzing={isAnalyzing} />

          {/* Context textarea */}
          <div>
            <label className="text-[11px] font-semibold text-terminal-text-secondary uppercase tracking-wider block mb-1.5">
              Context (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Symbol, timeframe, what you're watching for…"
              rows={2}
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 resize-none focus:outline-none focus:border-terminal-cyan/50 transition-colors"
            />
          </div>

          {/* Analyze screenshot button */}
          <button
            onClick={analyzeImage}
            disabled={isAnalyzing || !selectedFile}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm transition-all hover:bg-terminal-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <span>Claude is analyzing your chart</span>
                <TypingDots />
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Analyze Screenshot
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-terminal-border" />
            <span className="text-[11px] text-terminal-text-secondary">or analyze by symbol</span>
            <div className="flex-1 h-px bg-terminal-border" />
          </div>

          {/* Symbol input + button */}
          <div className="flex gap-2">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && analyzeSymbol()}
              placeholder="AAPL, TSLA, ES=F…"
              className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 transition-colors font-mono uppercase"
            />
            <button
              onClick={analyzeSymbol}
              disabled={isAnalyzing || !symbolInput.trim()}
              className="px-4 py-2 rounded-lg bg-terminal-purple text-white font-semibold text-sm transition-all hover:bg-terminal-purple/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Analyze Symbol
            </button>
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
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 min-h-64">
          {currentAnalysis ? (
            <AnalysisResults analysis={currentAnalysis} imagePreview={imagePreview} />
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
              <span className="ml-2 text-[10px] font-normal text-terminal-text-secondary">
                ({displayHistory.length})
              </span>
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
