import { useState } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface TFResult {
  timeframe: string;
  trend?: 'UP' | 'DOWN' | 'SIDEWAYS';
  signal?: 'BUY' | 'SELL' | 'HOLD';
  rsi?: number;
  support?: number;
  resistance?: number;
  strength?: number;
  summary?: string;
  sparkline?: number[];
  error?: string;
}

interface MultiTFResponse {
  success: boolean;
  symbol: string;
  timeframes: TFResult[];
  overallBias: string;
  buyCount: number;
  sellCount: number;
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = data[data.length - 1];
  const first = data[0];
  const isUp = last >= first;
  const color = isUp ? '#4ade80' : '#f87171';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none">
      <polyline points={pts} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TFCard({ tf }: { tf: TFResult }) {
  if (!tf) return null;

  const LABELS: Record<string, string> = {
    '15m': '15m — Scalp',
    '1h': '1h — Intraday',
    '4h': '4h — Swing',
    '1d': '1d — Position',
  };

  const signalCfg = tf.signal === 'BUY'
    ? { bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', text: 'text-terminal-green', dot: 'bg-terminal-green' }
    : tf.signal === 'SELL'
    ? { bg: 'bg-terminal-red/10', border: 'border-terminal-red/30', text: 'text-terminal-red', dot: 'bg-terminal-red' }
    : { bg: 'bg-terminal-border/20', border: 'border-terminal-border', text: 'text-terminal-text-secondary', dot: 'bg-terminal-text-secondary' };

  const trendIcon = tf.trend === 'UP' ? '▲' : tf.trend === 'DOWN' ? '▼' : '→';
  const trendColor = tf.trend === 'UP' ? 'text-terminal-green' : tf.trend === 'DOWN' ? 'text-terminal-red' : 'text-terminal-text-secondary';

  return (
    <div className={`rounded-xl border ${signalCfg.border} ${signalCfg.bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">{LABELS[tf.timeframe] ?? tf.timeframe}</span>
        {tf.signal && (
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${signalCfg.text} bg-terminal-bg/60 border ${signalCfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${signalCfg.dot}`}/>
            {tf.signal}
          </span>
        )}
      </div>

      {tf.error ? (
        <p className="text-xs text-terminal-text-secondary/60">{tf.error}</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xl font-black ${trendColor}`}>{trendIcon}</span>
              <div>
                <p className={`text-xs font-bold ${trendColor}`}>{tf.trend ?? 'UNKNOWN'}</p>
                <p className="text-[10px] text-terminal-text-secondary">Trend</p>
              </div>
            </div>
            {tf.sparkline && <Sparkline data={tf.sparkline} />}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-1">
            <div>
              <p className="text-[10px] text-terminal-text-secondary">RSI</p>
              <p className={`text-sm font-bold tabular-nums ${(tf.rsi ?? 50) > 70 ? 'text-terminal-red' : (tf.rsi ?? 50) < 30 ? 'text-terminal-green' : 'text-terminal-text-primary'}`}>
                {tf.rsi?.toFixed(1) ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-terminal-text-secondary">Support</p>
              <p className="text-sm font-bold tabular-nums text-terminal-green">{tf.support ? `$${tf.support.toFixed(2)}` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-terminal-text-secondary">Resistance</p>
              <p className="text-sm font-bold tabular-nums text-terminal-red">{tf.resistance ? `$${tf.resistance.toFixed(2)}` : '—'}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MultiTimeframeAnalysis() {
  const { selectedSymbol, setSelectedSymbol, setActiveView } = useStore();
  const [input, setInput] = useState(selectedSymbol ?? '');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MultiTFResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (sym?: string) => {
    const s = (sym ?? input).trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const { data: resp } = await axios.get<MultiTFResponse>(`/api/market/multi-tf/${s}`, { timeout: 30000 });
      setData(resp);
    } catch {
      setError('Failed to fetch multi-timeframe data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const biasColor = data
    ? data.buyCount >= 3 ? 'text-terminal-green bg-terminal-green/10 border-terminal-green/30'
    : data.sellCount >= 3 ? 'text-terminal-red bg-terminal-red/10 border-terminal-red/30'
    : 'text-terminal-yellow bg-terminal-yellow/10 border-terminal-yellow/30'
    : '';

  return (
    <div className="max-w-5xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-purple/10 rounded-lg border border-terminal-purple/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Multi-Timeframe Analysis</h2>
            <p className="text-xs text-terminal-text-secondary">Analyze any symbol across 15m, 1h, 4h, and daily simultaneously</p>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter symbol (e.g. SI=F, AAPL, GC=F)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:border-terminal-cyan outline-none"
        />
        <button onClick={() => analyze()} disabled={loading || !input.trim()}
          className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${loading || !input.trim() ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed' : 'bg-terminal-purple text-white hover:bg-terminal-purple/90 active:scale-95'}`}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              Analyzing…
            </span>
          ) : 'Analyze All TF'}
        </button>
      </div>

      {error && <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg p-3 text-sm text-terminal-red">{error}</div>}

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {/* Overall bias banner */}
          <div className={`rounded-xl border p-4 ${biasColor}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Overall Bias — {data.symbol}</p>
            <p className="text-xl font-black">{data.overallBias}</p>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-terminal-green">{data.buyCount} BUY signals</span>
              <span className="text-terminal-red">{data.sellCount} SELL signals</span>
              <span className="text-terminal-text-secondary">{4 - data.buyCount - data.sellCount} HOLD</span>
            </div>
          </div>

          {/* 2×2 Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.timeframes.map(tf => <TFCard key={tf.timeframe} tf={tf} />)}
          </div>

          {/* Quick navigate */}
          <div className="flex gap-2">
            <button onClick={() => { setSelectedSymbol(data.symbol); setActiveView('ai-analysis'); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-terminal-cyan text-black hover:bg-terminal-cyan/90 transition-all">
              Open Full Analysis
            </button>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-12 text-center">
          <svg className="w-16 h-16 text-terminal-text-secondary/20 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
          </svg>
          <p className="text-sm text-terminal-text-secondary">Enter a symbol to analyze across all timeframes</p>
          <p className="text-xs text-terminal-text-secondary/50 mt-1">Works with ETFs, stocks, and futures (SI=F, GC=F, ES=F…)</p>
        </div>
      )}
    </div>
  );
}
