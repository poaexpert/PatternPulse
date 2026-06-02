import { useState, useRef, useCallback } from 'react';
import axios from 'axios';

interface PatternAnalysis {
  pattern: string;
  patternType: 'BULLISH_REVERSAL' | 'BEARISH_REVERSAL' | 'CONTINUATION_BULLISH' | 'CONTINUATION_BEARISH' | 'NEUTRAL';
  confidence: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  probability: number;
  resistance?: number;
  support?: number;
  description: string;
  action: string;
  patternDiagram: string;
  entryPrice?: number;
  stopPrice?: number;
  target1?: number;
  target2?: number;
  riskReward?: number;
}

// ASCII diagram map for each pattern
const PATTERN_DIAGRAMS: Record<string, string> = {
  'head-shoulders':
    '  H\n /|\\\n/ | \\\nLS  RS\n  n  ',
  'inv-head-shoulders':
    '  n  \nLS  RS\n\\ | /\n \\|/\n  H  ',
  'double-top':
    ' T   T\n/ \\ / \\\n    V  ',
  'double-bottom':
    '    ^  \n\\ / \\ /\n  V   V',
  'ascending-triangle':
    '────────\n  /    /\n /    /\n/────/',
  'descending-triangle':
    '\\    \\\n  \\    \\\n   \\────',
  'symmetrical-triangle':
    ' /\\\n/  \\\n    \\/',
  'bull-flag':
    '   |\n  /|\n /  \\\n/    \\',
  'bear-flag':
    '\\    /\n \\  /\n  \\|\n   |',
  'falling-wedge':
    '\\\n \\\n  /',
  'rising-wedge':
    '  /\n /\n\\/',
  'cup-handle':
    '/    \\\n     \\\n      U',
  'no-pattern': '~ ~ ~ ~ ~',
};

const TYPE_CONFIG = {
  BULLISH_REVERSAL: { color: 'text-terminal-green', bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', label: 'Bullish Reversal' },
  BEARISH_REVERSAL: { color: 'text-terminal-red', bg: 'bg-terminal-red/10', border: 'border-terminal-red/30', label: 'Bearish Reversal' },
  CONTINUATION_BULLISH: { color: 'text-terminal-cyan', bg: 'bg-terminal-cyan/10', border: 'border-terminal-cyan/30', label: 'Bullish Continuation' },
  CONTINUATION_BEARISH: { color: 'text-terminal-yellow', bg: 'bg-terminal-yellow/10', border: 'border-terminal-yellow/30', label: 'Bearish Continuation' },
  NEUTRAL: { color: 'text-terminal-text-secondary', bg: 'bg-terminal-border/20', border: 'border-terminal-border', label: 'Neutral / No Pattern' },
};

export default function ChartPatternScanner() {
  const [dragging, setDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WebP)');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setAnalysis(null);
    setError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const analyze = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', imageFile);
      if (symbol.trim()) form.append('symbol', symbol.trim().toUpperCase());

      const { data } = await axios.post<{ success: boolean; analysis: PatternAnalysis }>('/api/market/pattern-scan', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        setError('Analysis failed. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImageUrl(null);
    setImageFile(null);
    setAnalysis(null);
    setError(null);
    setSymbol('');
  };

  const cfg = analysis ? TYPE_CONFIG[analysis.patternType] : null;

  return (
    <div className="max-w-4xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-cyan/10 rounded-lg border border-terminal-cyan/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Smart Pattern Scanner</h2>
            <p className="text-xs text-terminal-text-secondary">Upload a chart screenshot for algorithmic pattern detection</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Upload zone */}
        <div className="space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
              dragging ? 'border-terminal-cyan bg-terminal-cyan/10' : 'border-terminal-border hover:border-terminal-cyan/50 bg-terminal-card'
            }`}
            style={{ minHeight: imageUrl ? 'auto' : 200 }}
          >
            {imageUrl ? (
              <div className="relative">
                <img src={imageUrl} alt="Chart" className="w-full rounded-xl object-contain max-h-64" />
                <button onClick={e => { e.stopPropagation(); reset(); }} className="absolute top-2 right-2 bg-terminal-bg/80 text-terminal-text-primary rounded-full w-7 h-7 flex items-center justify-center hover:bg-terminal-red/20 hover:text-terminal-red transition-colors text-sm">✕</button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <svg className="w-12 h-12 text-terminal-text-secondary/40 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <p className="text-sm font-semibold text-terminal-text-secondary">Drop chart screenshot here</p>
                <p className="text-xs text-terminal-text-secondary/60 mt-1">or click to browse</p>
                <p className="text-[10px] text-terminal-text-secondary/40 mt-2">Supports PNG, JPG, WebP</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </div>

          {/* Optional symbol */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Optional: enter symbol (e.g. SI=F)"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:border-terminal-cyan outline-none"
            />
            <button
              onClick={analyze}
              disabled={!imageFile || loading}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                !imageFile || loading
                  ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed'
                  : 'bg-terminal-cyan text-black hover:bg-terminal-cyan/90 active:scale-95'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"/>
                  Analyzing…
                </span>
              ) : 'Analyze'}
            </button>
          </div>

          {error && (
            <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg p-3 text-sm text-terminal-red">{error}</div>
          )}
        </div>

        {/* Right: Results or placeholder */}
        {analysis && cfg ? (
          <div className="space-y-3">
            {/* Pattern name card */}
            <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1">Detected Pattern</p>
                  <p className={`text-xl font-black ${cfg.color}`}>{analysis.pattern}</p>
                  <p className={`text-xs font-semibold mt-1 ${cfg.color} opacity-80`}>{cfg.label}</p>
                </div>
                {/* ASCII diagram */}
                <pre className={`text-[10px] font-mono ${cfg.color} opacity-70 shrink-0 whitespace-pre leading-tight`}>
                  {PATTERN_DIAGRAMS[analysis.patternDiagram] ?? '~~~'}
                </pre>
              </div>
              <div className="mt-3 flex gap-4">
                <div>
                  <p className="text-[10px] text-terminal-text-secondary">Confidence</p>
                  <p className={`text-lg font-bold tabular-nums ${cfg.color}`}>{analysis.confidence}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-terminal-text-secondary">Probability</p>
                  <p className={`text-lg font-bold tabular-nums ${cfg.color}`}>{analysis.probability}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-terminal-text-secondary">Trend</p>
                  <p className={`text-sm font-bold ${
                    analysis.trend === 'BULLISH' ? 'text-terminal-green' :
                    analysis.trend === 'BEARISH' ? 'text-terminal-red' : 'text-terminal-text-secondary'
                  }`}>{analysis.trend}</p>
                </div>
              </div>
            </div>

            {/* Support & Resistance */}
            {(analysis.support || analysis.resistance) && (
              <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1">Support</p>
                  <p className="text-lg font-bold text-terminal-green tabular-nums">
                    {analysis.support ? `$${analysis.support.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1">Resistance</p>
                  <p className="text-lg font-bold text-terminal-red tabular-nums">
                    {analysis.resistance ? `$${analysis.resistance.toFixed(2)}` : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Confidence bar */}
            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-2">Success Probability</p>
              <div className="h-3 bg-terminal-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    analysis.probability >= 65 ? 'bg-terminal-green' :
                    analysis.probability >= 50 ? 'bg-terminal-yellow' : 'bg-terminal-red'
                  }`}
                  style={{ width: `${analysis.probability}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-terminal-text-secondary">
                <span>0%</span>
                <span className="font-bold">{analysis.probability}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-2">Pattern Analysis</p>
              <p className="text-sm text-terminal-text-primary leading-relaxed">{analysis.description}</p>
            </div>

            {/* Action */}
            <div className={`rounded-xl border ${cfg.border} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-terminal-yellow">What to Do</p>
              <p className="text-sm text-terminal-text-primary leading-relaxed">{analysis.action}</p>
            </div>

            {/* Trade Setup — only shown when a symbol was entered (price levels computed) */}
            {analysis.entryPrice ? (
              <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
                <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Trade Setup</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-terminal-bg rounded-lg p-2.5">
                    <p className="text-[10px] text-terminal-text-secondary mb-0.5">{analysis.patternType.includes('BULLISH') ? 'Buy Entry' : 'Short Entry'}</p>
                    <p className="text-sm font-black text-terminal-cyan tabular-nums">${analysis.entryPrice.toFixed(2)}</p>
                    <p className="text-[10px] text-terminal-text-secondary/60">{analysis.patternType.includes('BULLISH') ? 'On breakout above' : 'On breakdown below'}</p>
                  </div>
                  <div className="bg-terminal-bg rounded-lg p-2.5">
                    <p className="text-[10px] text-terminal-text-secondary mb-0.5">Stop Loss</p>
                    <p className="text-sm font-black text-terminal-red tabular-nums">${analysis.stopPrice?.toFixed(2) ?? '—'}</p>
                    <p className="text-[10px] text-terminal-text-secondary/60">
                      Max risk: {analysis.stopPrice && analysis.entryPrice
                        ? `$${Math.abs(analysis.entryPrice - analysis.stopPrice).toFixed(2)}`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-terminal-bg rounded-lg p-2.5">
                    <p className="text-[10px] text-terminal-text-secondary mb-0.5">Target 1</p>
                    <p className="text-sm font-bold text-terminal-green tabular-nums">${analysis.target1?.toFixed(2) ?? '—'}</p>
                    <p className="text-[10px] text-terminal-text-secondary/60">
                      {analysis.target1 && analysis.entryPrice
                        ? `+$${Math.abs(analysis.target1 - analysis.entryPrice).toFixed(2)}`
                        : ''}
                    </p>
                  </div>
                  <div className="bg-terminal-bg rounded-lg p-2.5">
                    <p className="text-[10px] text-terminal-text-secondary mb-0.5">Target 2</p>
                    <p className="text-sm font-bold text-terminal-green tabular-nums">${analysis.target2?.toFixed(2) ?? '—'}</p>
                    <p className="text-[10px] text-terminal-text-secondary/60">
                      {analysis.target2 && analysis.entryPrice
                        ? `+$${Math.abs(analysis.target2 - analysis.entryPrice).toFixed(2)}`
                        : ''}
                    </p>
                  </div>
                  <div className="bg-terminal-bg rounded-lg p-2.5 border border-terminal-yellow/20">
                    <p className="text-[10px] text-terminal-text-secondary mb-0.5">Risk:Reward</p>
                    <p className={`text-sm font-black tabular-nums ${(analysis.riskReward ?? 0) >= 2 ? 'text-terminal-green' : 'text-terminal-yellow'}`}>
                      {analysis.riskReward ? `${analysis.riskReward}:1` : '—'}
                    </p>
                    <p className="text-[10px] text-terminal-text-secondary/60">
                      {(analysis.riskReward ?? 0) >= 2 ? 'Excellent setup' : (analysis.riskReward ?? 0) >= 1.5 ? 'Good setup' : 'Fair setup'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-terminal-card border border-terminal-border/50 rounded-xl p-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-terminal-text-secondary/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <p className="text-xs text-terminal-text-secondary/60">Enter a ticker symbol above to see specific entry, stop & target prices</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3" style={{ minHeight: 300 }}>
            <svg className="w-16 h-16 text-terminal-text-secondary/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
              <path d="M3 3l18 18M9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0M6.343 6.343A8 8 0 1 0 17.657 17.657"/>
              <path d="M20.35 13.65A8 8 0 0 0 10.35 3.65"/>
            </svg>
            <p className="text-sm text-terminal-text-secondary">Upload a chart screenshot to detect patterns</p>
            <p className="text-xs text-terminal-text-secondary/50">Head & Shoulders, Double Top/Bottom, Triangles, Flags, Wedges & more</p>
          </div>
        )}
      </div>
    </div>
  );
}
