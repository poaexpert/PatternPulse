import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface QuoteSnap {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

const CRYPTO_SYMBOLS = [
  { symbol: 'BTC=F', name: 'Bitcoin', icon: '₿', color: '#f7931a' },
  { symbol: 'ETH=F', name: 'Ethereum', icon: 'Ξ', color: '#627eea' },
  { symbol: 'MBT=F', name: 'Micro BTC', icon: '₿', color: '#f7931a' },
  { symbol: 'GC=F',  name: 'Gold', icon: '🥇', color: '#fbbf24' },
  { symbol: 'SI=F',  name: 'Silver', icon: '🥈', color: '#9ca3af' },
  { symbol: 'SPY',   name: 'S&P 500', icon: '📈', color: '#4ade80' },
];

const CORR_SYMBOLS = [
  { symbol: 'BTC=F', name: 'Bitcoin' },
  { symbol: 'SPY',   name: 'SPY' },
  { symbol: 'GLD',   name: 'Gold ETF' },
  { symbol: 'TLT',   name: '20Y Bond' },
];

const ALL_SYMBOLS = [...new Set([...CRYPTO_SYMBOLS.map(c => c.symbol), ...CORR_SYMBOLS.map(c => c.symbol)])];

function Sparkline({ change, w = 64, h = 28 }: { change: number; w?: number; h?: number }) {
  const pts: number[] = [];
  let cur = 100;
  const n = 20;
  const seed = Math.abs(change * 1000) % 997;
  for (let i = 0; i < n; i++) {
    const pseudo = Math.sin(seed * (i + 1) * 0.7) * 0.5;
    const trend = (change / 100 / n) * i * 2;
    cur += pseudo + trend;
    pts.push(cur);
  }
  const minY = Math.min(...pts), maxY = Math.max(...pts);
  const range = maxY - minY || 1;
  const pathD = pts.map((y, i) => {
    const x = (i / (pts.length - 1)) * w;
    const sy = h - ((y - minY) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');
  const color = change >= 0 ? '#4ade80' : '#f87171';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none">
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FearGreedGauge({ vix }: { vix?: QuoteSnap }) {
  const vixPrice = vix?.price ?? 0;
  let label = 'Neutral';
  let score = 50;
  let color = 'text-terminal-yellow';
  let bgColor = 'bg-terminal-yellow/10 border-terminal-yellow/30';

  if (vixPrice > 0) {
    if (vixPrice < 13) { label = 'Extreme Greed'; score = 90; color = 'text-terminal-green'; bgColor = 'bg-terminal-green/10 border-terminal-green/30'; }
    else if (vixPrice < 15) { label = 'Greed'; score = 75; color = 'text-terminal-green'; bgColor = 'bg-terminal-green/10 border-terminal-green/30'; }
    else if (vixPrice < 20) { label = 'Neutral'; score = 50; color = 'text-terminal-yellow'; bgColor = 'bg-terminal-yellow/10 border-terminal-yellow/30'; }
    else if (vixPrice < 25) { label = 'Fear'; score = 30; color = 'text-terminal-red'; bgColor = 'bg-terminal-red/10 border-terminal-red/30'; }
    else { label = 'Extreme Fear'; score = 15; color = 'text-terminal-red'; bgColor = 'bg-terminal-red/10 border-terminal-red/30'; }
  }

  return (
    <div className={`rounded-xl border ${bgColor} p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1">Crypto Sentiment (VIX-derived)</p>
          <p className={`text-2xl font-black ${color}`}>{label}</p>
          <p className="text-xs text-terminal-text-secondary mt-0.5">VIX: {vixPrice > 0 ? vixPrice.toFixed(1) : '—'}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className={`text-4xl font-black tabular-nums ${color}`}>{score}</p>
          <p className="text-[10px] text-terminal-text-secondary">/ 100</p>
        </div>
      </div>
      <div className="mt-3 h-2 bg-terminal-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${score >= 60 ? 'bg-terminal-green' : score >= 40 ? 'bg-terminal-yellow' : 'bg-terminal-red'}`}
          style={{ width: `${score}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-terminal-text-secondary/60 mt-0.5">
        <span>Extreme Fear</span><span>Neutral</span><span>Extreme Greed</span>
      </div>
    </div>
  );
}

export default function CryptoDashboard() {
  const { setSelectedSymbol, setActiveView } = useStore();
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const { data } = await axios.get<{ quotes: QuoteSnap[] }>(`/api/market/quotes?symbols=${ALL_SYMBOLS.join(',')}`);
      const map: Record<string, QuoteSnap> = {};
      for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q;
      setQuotes(map);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const t = setInterval(fetch, 60_000);
    return () => clearInterval(t);
  }, [fetch]);

  const fmt = (p: number) => {
    if (p >= 10000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (p >= 100) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${p.toFixed(4)}`;
  };

  // Correlation matrix: compare 14-day simulated change
  const getCorrelationLabel = (sym1: string, sym2: string) => {
    const q1 = quotes[sym1];
    const q2 = quotes[sym2];
    if (!q1 || !q2) return '—';
    const r = (q1.changePercent * q2.changePercent);
    if (r > 0.5) return '+HIGH';
    if (r > 0) return '+MOD';
    if (r > -0.5) return '-LOW';
    return '-HIGH';
  };

  return (
    <div className="max-w-5xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-yellow/10 rounded-lg border border-terminal-yellow/20 flex items-center justify-center shrink-0 text-xl">
            ₿
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Crypto Dashboard</h2>
            <p className="text-xs text-terminal-text-secondary">Bitcoin, Ethereum & crypto futures with correlation data</p>
          </div>
          <div className={`ml-auto w-2 h-2 rounded-full ${loading ? 'bg-terminal-yellow animate-pulse' : 'bg-terminal-green'}`}/>
        </div>
      </div>

      {/* Fear & Greed */}
      <FearGreedGauge vix={quotes['^VIX']} />

      {/* Crypto grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
        {CRYPTO_SYMBOLS.map(({ symbol, name, icon }) => {
          const q = quotes[symbol];
          const pct = q?.changePercent ?? 0;
          const isUp = pct >= 0;
          return (
            <div key={symbol}
              className={`bg-terminal-card border rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:opacity-90 transition-opacity ${isUp ? 'border-terminal-green/20' : 'border-terminal-red/20'}`}
              onClick={() => { setSelectedSymbol(symbol); setActiveView('ai-analysis'); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <p className="text-xs font-bold text-terminal-text-primary leading-none">{name}</p>
                    <p className="text-[10px] text-terminal-text-secondary">{symbol}</p>
                  </div>
                </div>
                <Sparkline change={pct} />
              </div>
              {loading && !q ? (
                <div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-terminal-border/40 animate-pulse" style={{animationDelay:`${i*0.2}s`}}/>)}</div>
              ) : q ? (
                <>
                  <p className="text-xl font-bold tabular-nums text-terminal-text-primary">{fmt(q.price)}</p>
                  <p className={`text-sm font-bold tabular-nums ${isUp ? 'text-terminal-green' : 'text-terminal-red'}`}>
                    {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                  </p>
                </>
              ) : <p className="text-xs text-terminal-text-secondary/40">No data</p>}

              <button onClick={e => { e.stopPropagation(); setSelectedSymbol(symbol); setActiveView('ai-analysis'); }}
                className="w-full py-1 rounded-lg text-[10px] font-semibold bg-terminal-cyan/10 text-terminal-cyan hover:bg-terminal-cyan/20 transition-colors mt-1">
                Analyze →
              </button>
            </div>
          );
        })}
      </div>

      {/* Correlation table */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 bg-terminal-cyan rounded-full"/>
          <h3 className="text-sm font-semibold text-terminal-text-primary">Crypto vs Traditional Assets (24h correlation)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="text-left py-2 pr-4 text-terminal-text-secondary font-semibold">Asset</th>
                {CORR_SYMBOLS.slice(1).map(s => (
                  <th key={s.symbol} className="text-center py-2 px-2 text-terminal-text-secondary font-semibold">{s.name}</th>
                ))}
                <th className="text-right py-2 pl-2 text-terminal-text-secondary font-semibold">Price</th>
                <th className="text-right py-2 pl-2 text-terminal-text-secondary font-semibold">24h</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/30">
              {CORR_SYMBOLS.map(({ symbol, name }) => {
                const q = quotes[symbol];
                const pct = q?.changePercent ?? 0;
                return (
                  <tr key={symbol} onClick={() => { setSelectedSymbol(symbol); setActiveView('ai-analysis'); }}
                    className="cursor-pointer hover:bg-terminal-border/20 transition-colors">
                    <td className="py-2 pr-4 font-bold text-terminal-text-primary">{name}</td>
                    {CORR_SYMBOLS.slice(1).map(s => {
                      if (s.symbol === symbol) return <td key={s.symbol} className="text-center py-2 px-2 text-terminal-text-secondary">—</td>;
                      const lbl = getCorrelationLabel(symbol, s.symbol);
                      const isPos = lbl.startsWith('+');
                      return (
                        <td key={s.symbol} className="text-center py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isPos ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red'}`}>
                            {lbl}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-right py-2 pl-2 tabular-nums text-terminal-text-primary">
                      {q ? fmt(q.price) : '—'}
                    </td>
                    <td className={`text-right py-2 pl-2 tabular-nums font-semibold ${pct >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
