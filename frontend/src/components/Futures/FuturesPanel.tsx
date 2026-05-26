import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import type { FuturesQuote } from '../../types';

// ── Futures definitions ───────────────────────────────────────────────────────

interface FuturesDef {
  symbol: string;       // Yahoo Finance symbol (=F continuous)
  displaySymbol: string; // Clean display name
  name: string;
  category: FuturesQuote['category'];
  unit?: string;        // price unit hint
}

const FUTURES_LIST: FuturesDef[] = [
  // ── Precious Metals (user's primary focus) ────────────────────────────────
  { symbol: 'SI=F',  displaySymbol: 'SI',  name: 'Silver',         category: 'COMMODITY', unit: '$/oz' },
  { symbol: 'GC=F',  displaySymbol: 'GC',  name: 'Gold',           category: 'COMMODITY', unit: '$/oz' },
  { symbol: 'PL=F',  displaySymbol: 'PL',  name: 'Platinum',       category: 'COMMODITY', unit: '$/oz' },
  { symbol: 'PA=F',  displaySymbol: 'PA',  name: 'Palladium',      category: 'COMMODITY', unit: '$/oz' },
  { symbol: 'HG=F',  displaySymbol: 'HG',  name: 'Copper',         category: 'COMMODITY', unit: '$/lb' },
  // ── Energy ───────────────────────────────────────────────────────────────
  { symbol: 'CL=F',  displaySymbol: 'CL',  name: 'Crude Oil (WTI)',category: 'COMMODITY', unit: '$/bbl' },
  { symbol: 'BZ=F',  displaySymbol: 'BZ',  name: 'Brent Crude',    category: 'COMMODITY', unit: '$/bbl' },
  { symbol: 'NG=F',  displaySymbol: 'NG',  name: 'Natural Gas',    category: 'COMMODITY', unit: '$/MMBtu' },
  // ── Equity Index ─────────────────────────────────────────────────────────
  { symbol: 'ES=F',  displaySymbol: 'ES',  name: 'S&P 500 E-mini', category: 'INDEX' },
  { symbol: 'NQ=F',  displaySymbol: 'NQ',  name: 'Nasdaq E-mini',  category: 'INDEX' },
  { symbol: 'YM=F',  displaySymbol: 'YM',  name: 'Dow Jones',      category: 'INDEX' },
  { symbol: 'RTY=F', displaySymbol: 'RTY', name: 'Russell 2000',   category: 'INDEX' },
  // ── Bonds ────────────────────────────────────────────────────────────────
  { symbol: 'ZN=F',  displaySymbol: 'ZN',  name: '10-Yr T-Note',  category: 'BOND' },
  { symbol: 'ZB=F',  displaySymbol: 'ZB',  name: '30-Yr T-Bond',  category: 'BOND' },
  { symbol: 'ZT=F',  displaySymbol: 'ZT',  name: '2-Yr T-Note',   category: 'BOND' },
  // ── Currencies ───────────────────────────────────────────────────────────
  { symbol: '6E=F',  displaySymbol: '6E',  name: 'Euro',           category: 'CURRENCY' },
  { symbol: '6J=F',  displaySymbol: '6J',  name: 'Yen',            category: 'CURRENCY' },
  { symbol: '6B=F',  displaySymbol: '6B',  name: 'British Pound',  category: 'CURRENCY' },
  { symbol: '6C=F',  displaySymbol: '6C',  name: 'Canadian Dollar',category: 'CURRENCY' },
  // ── Crypto ───────────────────────────────────────────────────────────────
  { symbol: 'BTC=F', displaySymbol: 'BTC', name: 'Bitcoin',        category: 'CRYPTO' },
  { symbol: 'ETH=F', displaySymbol: 'ETH', name: 'Ethereum',       category: 'CRYPTO' },
  // ── Volatility ───────────────────────────────────────────────────────────
  { symbol: 'VX=F',  displaySymbol: 'VX',  name: 'VIX',            category: 'VOLATILITY' },
];

const CATEGORY_LABELS: { id: FuturesQuote['category'] | 'ALL'; label: string; emoji: string }[] = [
  { id: 'ALL',        label: 'All',        emoji: '⊞' },
  { id: 'COMMODITY',  label: 'Metals & Energy', emoji: '🥇' },
  { id: 'INDEX',      label: 'Indices',    emoji: '📈' },
  { id: 'BOND',       label: 'Bonds',      emoji: '🏦' },
  { id: 'CURRENCY',   label: 'FX',         emoji: '💱' },
  { id: 'CRYPTO',     label: 'Crypto',     emoji: '₿' },
  { id: 'VOLATILITY', label: 'VIX',        emoji: '⚡' },
];

const CATEGORY_BADGE_STYLES: Record<FuturesQuote['category'], string> = {
  COMMODITY:  'bg-terminal-yellow/15 text-terminal-yellow',
  INDEX:      'bg-terminal-cyan/15 text-terminal-cyan',
  BOND:       'bg-terminal-purple/15 text-terminal-purple',
  CURRENCY:   'bg-terminal-green/15 text-terminal-green',
  CRYPTO:     'bg-terminal-red/15 text-terminal-red',
  VOLATILITY: 'bg-terminal-border text-terminal-text-secondary',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RawQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

async function loadQuoteBatch(symbols: FuturesDef[]): Promise<Map<string, RawQuote>> {
  const settled = await Promise.allSettled(
    symbols.map((d) =>
      axios.get<{ success: boolean; quote: RawQuote }>(
        `/api/stock/${encodeURIComponent(d.symbol)}/quote`
      )
    )
  );
  const map = new Map<string, RawQuote>();
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const q = r.value.data?.quote;
      if (q) map.set(symbols[i].symbol, q);
    }
  });
  return map;
}

async function loadAllQuotes(): Promise<Map<string, RawQuote>> {
  const combined = new Map<string, RawQuote>();
  const BATCH = 5;
  for (let i = 0; i < FUTURES_LIST.length; i += BATCH) {
    const partial = await loadQuoteBatch(FUTURES_LIST.slice(i, i + BATCH));
    partial.forEach((v, k) => combined.set(k, v));
  }
  return combined;
}

function fmtPrice(price: number, unit?: string): string {
  if (!price) return '—';
  const fmt =
    price >= 10000
      ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price >= 100
      ? price.toFixed(2)
      : price.toFixed(4);
  return unit ? `$${fmt}` : `$${fmt}`;
}

function fmtVol(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── FuturesCard ───────────────────────────────────────────────────────────────

interface CardProps {
  def: FuturesDef;
  quote: RawQuote | null;
  loading: boolean;
  onAnalyze: (symbol: string) => void;
  onWatch: (symbol: string, name: string) => void;
  inWatchlist: boolean;
}

function FuturesCard({ def, quote, loading, onAnalyze, onWatch, inWatchlist }: CardProps) {
  const up = (quote?.change ?? 0) >= 0;
  const priceColor = up ? 'text-terminal-green' : 'text-terminal-red';
  const changeBg = up
    ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20'
    : 'bg-terminal-red/10 text-terminal-red border-terminal-red/20';

  const arrowIcon = up ? '▲' : '▼';

  return (
    <div className={`bg-terminal-card border rounded-xl p-4 flex flex-col gap-3 transition-colors hover:border-terminal-border/80 ${
      def.category === 'COMMODITY' && (def.displaySymbol === 'SI' || def.displaySymbol === 'GC' || def.displaySymbol === 'PL')
        ? 'border-terminal-yellow/30'
        : 'border-terminal-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-terminal-text-primary font-mono">{def.displaySymbol}</p>
            {(def.displaySymbol === 'SI' || def.displaySymbol === 'GC') && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-terminal-yellow/20 text-terminal-yellow border border-terminal-yellow/30 font-bold">
                {def.displaySymbol === 'SI' ? '🥈' : '🥇'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-terminal-text-secondary truncate mt-0.5">{def.name}</p>
          {def.unit && <p className="text-[10px] text-terminal-text-secondary/60">{def.unit}</p>}
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_BADGE_STYLES[def.category]}`}>
          {def.category}
        </span>
      </div>

      {/* Price */}
      <div>
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-7 w-32 bg-terminal-border/40 rounded animate-pulse" />
            <div className="h-4 w-24 bg-terminal-border/30 rounded animate-pulse" />
          </div>
        ) : quote && quote.price > 0 ? (
          <>
            <p className={`text-2xl font-bold tabular-nums font-mono ${priceColor}`}>
              {fmtPrice(quote.price, def.unit)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded border ${changeBg}`}>
                {arrowIcon} {Math.abs(quote.change).toFixed(2)} ({up ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </span>
            </div>
            {quote.volume > 0 && (
              <p className="text-[11px] text-terminal-text-secondary mt-1">Vol {fmtVol(quote.volume)}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-terminal-text-secondary italic">Fetching…</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-terminal-border/40">
        <button
          onClick={() => onAnalyze(def.symbol)}
          className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/25 hover:bg-terminal-cyan/20 transition-colors"
        >
          📊 Analyze
        </button>
        <button
          onClick={() => onWatch(def.symbol, def.name)}
          disabled={inWatchlist}
          className={`flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition-colors ${
            inWatchlist
              ? 'bg-terminal-purple/10 text-terminal-purple border-terminal-purple/20 cursor-default'
              : 'bg-terminal-border/30 text-terminal-text-secondary border-terminal-border hover:bg-terminal-border/60 hover:text-terminal-text-primary'
          }`}
        >
          {inWatchlist ? '✓ Watching' : '+ Watch'}
        </button>
      </div>
    </div>
  );
}

// ── Symbol input for custom contracts ────────────────────────────────────────

function CustomSymbolInput({ onAnalyze }: { onAnalyze: (sym: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <p className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider mb-2">
        Analyze any futures symbol
      </p>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onAnalyze(val.trim()); setVal(''); } }}
          placeholder="SI=F, GC=F, SICN26, SIN26.CMX…"
          className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 font-mono uppercase"
        />
        <button
          onClick={() => { if (val.trim()) { onAnalyze(val.trim()); setVal(''); } }}
          disabled={!val.trim()}
          className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm hover:bg-terminal-cyan/90 disabled:opacity-40"
        >
          Analyze
        </button>
      </div>
      <p className="text-[10px] text-terminal-text-secondary mt-1.5">
        Supports: continuous (SI=F, GC=F), broker format (SICN26 → SIN26.CMX), specific month (SIN26.CMX)
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FuturesPanel() {
  const { addToWatchlist, watchlist, setActiveView, setSelectedSymbol } = useStore();

  const [activeCategory, setActiveCategory] = useState<FuturesQuote['category'] | 'ALL'>('COMMODITY');
  const [quotes, setQuotes] = useState<Map<string, RawQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await loadAllQuotes();
      setQuotes(data);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refresh]);

  const handleAnalyze = useCallback((symbol: string) => {
    // Store in Zustand so AIAnalysisPanel can pre-fill it
    setSelectedSymbol(symbol);
    setActiveView('ai-analysis');
  }, [setActiveView, setSelectedSymbol]);

  const handleWatch = useCallback((symbol: string, name: string) => {
    addToWatchlist({ symbol, name, addedAt: new Date().toISOString() });
  }, [addToWatchlist]);

  const watchlistSet = new Set(watchlist.map((w) => w.symbol));

  const filtered =
    activeCategory === 'ALL'
      ? FUTURES_LIST
      : FUTURES_LIST.filter((f) => f.category === activeCategory);

  // Metals snapshot for the top bar
  const metals = ['SI=F', 'GC=F', 'PL=F', 'HG=F'];
  const metalQuotes = metals
    .map((s) => ({ def: FUTURES_LIST.find((f) => f.symbol === s)!, quote: quotes.get(s) ?? null }))
    .filter((x) => x.def);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary">Futures Markets</h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            {loading
              ? 'Loading quotes…'
              : lastUpdated
              ? `Updated ${timeAgo(lastUpdated)} · auto-refreshes every 60s`
              : 'Live futures quotes'}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); refresh(); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-terminal-border bg-terminal-card text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-cyan/40 transition-colors disabled:opacity-40"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Precious Metals Top Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metalQuotes.map(({ def, quote }) => {
          const up = (quote?.change ?? 0) >= 0;
          return (
            <button
              key={def.symbol}
              onClick={() => handleAnalyze(def.symbol)}
              className="bg-terminal-card border border-terminal-yellow/20 rounded-lg px-3 py-2.5 text-left hover:border-terminal-yellow/50 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-terminal-yellow font-mono">{def.displaySymbol}</span>
                <span className="text-[10px] text-terminal-text-secondary group-hover:text-terminal-cyan">Analyze →</span>
              </div>
              <p className={`text-base font-bold tabular-nums font-mono mt-0.5 ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {quote ? fmtPrice(quote.price) : loading ? '…' : '—'}
              </p>
              <p className={`text-[11px] tabular-nums ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {quote ? `${up ? '▲' : '▼'} ${Math.abs(quote.changePercent).toFixed(2)}%` : ''}
              </p>
            </button>
          );
        })}
      </div>

      {/* Custom symbol input */}
      <CustomSymbolInput onAnalyze={handleAnalyze} />

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_LABELS.map(({ id, label, emoji }) => (
          <button
            key={id}
            onClick={() => setActiveCategory(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeCategory === id
                ? 'bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25'
                : 'bg-terminal-card border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary'
            }`}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((def) => (
          <FuturesCard
            key={def.symbol}
            def={def}
            quote={quotes.get(def.symbol) ?? null}
            loading={loading && !quotes.has(def.symbol)}
            onAnalyze={handleAnalyze}
            onWatch={handleWatch}
            inWatchlist={watchlistSet.has(def.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
