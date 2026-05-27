import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface QuoteSnap {
  symbol: string;
  price: number;
  changePercent: number;
}

// Sector definitions with approximate S&P 500 weight
const SECTORS = [
  { symbol: 'XLK',  name: 'Technology',       weight: 31, detail: 'AAPL MSFT NVDA' },
  { symbol: 'XLF',  name: 'Financials',        weight: 13, detail: 'JPM BAC WFC' },
  { symbol: 'XLV',  name: 'Healthcare',        weight: 12, detail: 'UNH JNJ ABBV' },
  { symbol: 'XLY',  name: 'Consumer Disc.',    weight: 10, detail: 'AMZN TSLA MCD' },
  { symbol: 'XLC',  name: 'Comm Services',     weight:  9, detail: 'GOOG META NFLX' },
  { symbol: 'XLI',  name: 'Industrials',       weight:  9, detail: 'GE RTX HON' },
  { symbol: 'XLP',  name: 'Consumer Staples',  weight:  6, detail: 'PG KO WMT' },
  { symbol: 'XLE',  name: 'Energy',            weight:  4, detail: 'XOM CVX SLB' },
  { symbol: 'XLB',  name: 'Materials',         weight:  3, detail: 'LIN APD FCX' },
  { symbol: 'XLRE', name: 'Real Estate',       weight:  3, detail: 'AMT PLD EQIX' },
  { symbol: 'XLU',  name: 'Utilities',         weight:  3, detail: 'NEE DUK SO' },
];

const ASSET_CLASSES = [
  { symbol: 'SPY',  name: 'US Stocks',   icon: '📈' },
  { symbol: 'EFA',  name: 'Intl Stocks', icon: '🌍' },
  { symbol: 'TLT',  name: 'Bonds (20Y)', icon: '📉' },
  { symbol: 'GLD',  name: 'Gold',        icon: '🥇' },
  { symbol: 'USO',  name: 'Oil',         icon: '🛢' },
  { symbol: 'BTC=F',name: 'BTC Futures', icon: '₿' },
];

const ALL_SYMBOLS = [...SECTORS.map(s => s.symbol), ...ASSET_CLASSES.map(a => a.symbol)];

function heatBg(pct: number): string {
  if (pct >  3)   return '#16a34a';
  if (pct >  2)   return '#22c55e';
  if (pct >  1)   return '#4ade80';
  if (pct >  0.3) return '#86efac55';
  if (pct > -0.3) return '#374151';
  if (pct > -1)   return '#fca5a555';
  if (pct > -2)   return '#f87171';
  if (pct > -3)   return '#ef4444';
  return '#b91c1c';
}

function heatText(pct: number): string {
  if (Math.abs(pct) > 1.5) return '#fff';
  if (pct > 0.3) return '#4ade80';
  if (pct < -0.3) return '#f87171';
  return '#8892a4';
}

export default function MarketHeatmap() {
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const { data } = await axios.get<{ quotes: QuoteSnap[] }>(
        `/api/market/quotes?symbols=${ALL_SYMBOLS.join(',')}`
      );
      const map: Record<string, QuoteSnap> = {};
      for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q;
      setQuotes(map);
      setLastUpdate(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const t = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(t);
  }, [fetchQuotes]);

  const winners = SECTORS.filter(s => (quotes[s.symbol]?.changePercent ?? 0) > 0).length;
  const losers  = SECTORS.filter(s => (quotes[s.symbol]?.changePercent ?? 0) < 0).length;
  const avgPct  = SECTORS.reduce((sum, s) => sum + (quotes[s.symbol]?.changePercent ?? 0), 0) / SECTORS.length;

  return (
    <div className="space-y-4 max-w-6xl pb-6">

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-terminal-green font-bold">{winners} ▲ Up</span>
          <span className="text-terminal-red font-bold">{losers} ▼ Down</span>
          <span className={`font-bold ${avgPct >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
            Avg {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-terminal-text-secondary/60">
          <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-terminal-yellow animate-pulse' : 'bg-terminal-green'}`}/>
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Loading…'}
          <button onClick={fetchQuotes} className="text-terminal-cyan hover:underline">Refresh</button>
        </div>
      </div>

      {/* S&P 500 Sector Heatmap */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">
          S&P 500 Sectors — tile size = market cap weight
        </h3>

        {/* Proportional grid using flex wrap + flex-grow */}
        <div className="flex flex-wrap gap-1.5">
          {SECTORS.map(({ symbol, name, weight, detail }) => {
            const q = quotes[symbol];
            const pct = q?.changePercent ?? 0;
            const bg = heatBg(pct);
            const tc = heatText(pct);
            // min-width based on weight
            const minW = weight >= 20 ? '180px' : weight >= 10 ? '130px' : weight >= 6 ? '100px' : '80px';
            const minH = weight >= 20 ? '90px' : weight >= 10 ? '76px' : '64px';

            return (
              <div
                key={symbol}
                className="rounded-xl border border-white/5 flex flex-col items-center justify-center p-2 cursor-default hover:scale-105 transition-transform"
                style={{ background: bg, color: tc, minWidth: minW, minHeight: minH, flexGrow: weight }}
                title={`${name} (${symbol}) — ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
              >
                <div className="font-black text-sm tracking-tight">{symbol}</div>
                <div className="font-bold text-xs mt-0.5">
                  {loading && !q ? '…' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                </div>
                {q && (
                  <div style={{ fontSize: '10px', opacity: 0.75 }} className="mt-0.5">
                    ${q.price.toFixed(2)}
                  </div>
                )}
                <div style={{ fontSize: '9px', opacity: 0.5 }} className="mt-0.5 hidden sm:block">{name}</div>
                <div style={{ fontSize: '8px', opacity: 0.4 }} className="hidden lg:block">{detail}</div>
              </div>
            );
          })}
        </div>

        {/* Color legend */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] text-terminal-text-secondary">−3%+</span>
          <div className="flex gap-0.5 flex-1 h-2 rounded overflow-hidden">
            {['#b91c1c','#ef4444','#f87171','#374151','#86efac','#4ade80','#22c55e','#16a34a'].map((c,i) => (
              <div key={i} className="flex-1" style={{ background: c }}/>
            ))}
          </div>
          <span className="text-[10px] text-terminal-text-secondary">+3%+</span>
        </div>
      </div>

      {/* Asset Class Performance */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">
          Asset Class Performance
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {ASSET_CLASSES.map(({ symbol, name, icon }) => {
            const q = quotes[symbol];
            const pct = q?.changePercent ?? 0;
            const bg = heatBg(pct);
            const tc = heatText(pct);
            return (
              <div
                key={symbol}
                className="rounded-xl border border-white/5 flex flex-col items-center justify-center p-3 gap-1 text-center"
                style={{ background: bg, color: tc, minHeight: '80px' }}
              >
                <span className="text-xl">{icon}</span>
                <div className="font-bold text-xs">{name}</div>
                <div className="font-black text-sm">
                  {loading && !q ? '…' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sector detail table */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border">
          <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest">Sector Detail</h3>
        </div>
        <div className="divide-y divide-terminal-border/50">
          {[...SECTORS].sort((a, b) => (quotes[b.symbol]?.changePercent ?? 0) - (quotes[a.symbol]?.changePercent ?? 0)).map(({ symbol, name, weight }) => {
            const q = quotes[symbol];
            const pct = q?.changePercent ?? 0;
            const up = pct >= 0;
            const barW = Math.min(100, Math.abs(pct) * 20);
            return (
              <div key={symbol} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-terminal-text-primary w-12 shrink-0 font-mono">{symbol}</span>
                <span className="text-xs text-terminal-text-secondary flex-1 hidden sm:block">{name}</span>
                {/* Bar */}
                <div className="flex-1 hidden md:flex items-center gap-1">
                  {up
                    ? <><div className="w-12 flex-shrink-0"/><div className="h-1.5 rounded-full bg-terminal-green/70" style={{ width: `${barW}%`, maxWidth: '100px' }}/></>
                    : <><div className="h-1.5 rounded-full bg-terminal-red/70 ml-auto" style={{ width: `${barW}%`, maxWidth: '100px' }}/><div className="w-12 flex-shrink-0"/></>
                  }
                </div>
                <span className={`text-xs font-bold tabular-nums w-16 text-right ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  {loading && !q ? '…' : `${up ? '+' : ''}${pct.toFixed(2)}%`}
                </span>
                {q && <span className="text-xs text-terminal-text-primary tabular-nums w-16 text-right hidden lg:block">${q.price.toFixed(2)}</span>}
                <span className="text-[10px] text-terminal-text-secondary/50 w-12 text-right hidden xl:block">{weight}% wt</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
