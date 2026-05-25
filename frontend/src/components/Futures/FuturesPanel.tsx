import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import type { FuturesQuote } from '../../types';

// ── Static futures definitions ───────────────────────────────────────────────

interface FuturesDef {
  symbol: string;
  name: string;
  category: FuturesQuote['category'];
}

const FUTURES_LIST: FuturesDef[] = [
  // Indices
  { symbol: 'ES=F', name: 'S&P 500 Futures', category: 'INDEX' },
  { symbol: 'NQ=F', name: 'Nasdaq 100 Futures', category: 'INDEX' },
  { symbol: 'YM=F', name: 'Dow Jones Futures', category: 'INDEX' },
  { symbol: 'RTY=F', name: 'Russell 2000 Futures', category: 'INDEX' },
  // Commodities
  { symbol: 'CL=F', name: 'Crude Oil Futures', category: 'COMMODITY' },
  { symbol: 'GC=F', name: 'Gold Futures', category: 'COMMODITY' },
  { symbol: 'SI=F', name: 'Silver Futures', category: 'COMMODITY' },
  { symbol: 'NG=F', name: 'Natural Gas Futures', category: 'COMMODITY' },
  { symbol: 'HG=F', name: 'Copper Futures', category: 'COMMODITY' },
  { symbol: 'BZ=F', name: 'Brent Crude Futures', category: 'COMMODITY' },
  // Bonds
  { symbol: 'ZN=F', name: '10-Year T-Note Futures', category: 'BOND' },
  { symbol: 'ZB=F', name: '30-Year T-Bond Futures', category: 'BOND' },
  // Currencies
  { symbol: '6E=F', name: 'Euro Futures', category: 'CURRENCY' },
  { symbol: '6J=F', name: 'Japanese Yen Futures', category: 'CURRENCY' },
  // Crypto
  { symbol: 'BTC=F', name: 'Bitcoin Futures', category: 'CRYPTO' },
  { symbol: 'ETH=F', name: 'Ethereum Futures', category: 'CRYPTO' },
  // Volatility
  { symbol: 'VX=F', name: 'VIX Futures', category: 'VOLATILITY' },
];

const CATEGORY_LABELS: { id: FuturesQuote['category'] | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'INDEX', label: 'Indices' },
  { id: 'COMMODITY', label: 'Commodities' },
  { id: 'BOND', label: 'Bonds' },
  { id: 'CURRENCY', label: 'Currencies' },
  { id: 'CRYPTO', label: 'Crypto' },
  { id: 'VOLATILITY', label: 'VIX' },
];

const CATEGORY_BADGE_STYLES: Record<FuturesQuote['category'], string> = {
  INDEX: 'bg-terminal-cyan/15 text-terminal-cyan',
  COMMODITY: 'bg-terminal-yellow/15 text-terminal-yellow',
  BOND: 'bg-terminal-purple/15 text-terminal-purple',
  CURRENCY: 'bg-terminal-green/15 text-terminal-green',
  CRYPTO: 'bg-terminal-red/15 text-terminal-red',
  VOLATILITY: 'bg-terminal-border text-terminal-text-secondary',
};

// ── Quote fetch helpers ───────────────────────────────────────────────────────

interface RawQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

async function fetchBatch(symbols: FuturesDef[]): Promise<Map<string, RawQuote>> {
  const results = await Promise.allSettled(
    symbols.map((def) =>
      axios.get<RawQuote>(`/api/stock/${encodeURIComponent(def.symbol)}/quote`)
    )
  );
  const map = new Map<string, RawQuote>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      map.set(symbols[i].symbol, r.value.data);
    }
  });
  return map;
}

async function fetchAllFutures(): Promise<Map<string, RawQuote>> {
  const BATCH = 5;
  const combined = new Map<string, RawQuote>();
  for (let i = 0; i < FUTURES_LIST.length; i += BATCH) {
    const batch = FUTURES_LIST.slice(i, i + BATCH);
    const partial = await fetchBatch(batch);
    partial.forEach((v, k) => combined.set(k, v));
  }
  return combined;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

function formatPrice(price: number): string {
  if (price === 0) return '—';
  if (price >= 10000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toFixed(2);
  return price.toFixed(4);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FuturesCardProps {
  def: FuturesDef;
  quote: RawQuote | null;
  loading: boolean;
  onAnalyze: (symbol: string) => void;
  onWatch: (symbol: string, name: string) => void;
  inWatchlist: boolean;
}

function FuturesCard({ def, quote, loading, onAnalyze, onWatch, inWatchlist }: FuturesCardProps) {
  const positive = (quote?.change ?? 0) >= 0;
  const priceColor = positive ? 'text-terminal-green' : 'text-terminal-red';
  const changeBg = positive ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red';

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 flex flex-col gap-3 hover:border-terminal-border/80 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-terminal-text-primary font-mono truncate">{def.symbol}</p>
          <p className="text-[11px] text-terminal-text-secondary truncate mt-0.5">{def.name}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_BADGE_STYLES[def.category]}`}>
          {def.category}
        </span>
      </div>

      {/* Price row */}
      <div>
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-6 w-28 bg-terminal-border/40 rounded animate-pulse" />
            <div className="h-4 w-20 bg-terminal-border/30 rounded animate-pulse" />
          </div>
        ) : quote ? (
          <>
            <p className={`text-xl font-bold tabular-nums ${priceColor}`}>
              ${formatPrice(quote.price)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${changeBg}`}>
                {positive ? '+' : ''}{quote.change.toFixed(2)} ({positive ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </span>
            </div>
            {quote.volume > 0 && (
              <p className="text-[11px] text-terminal-text-secondary mt-1">
                Vol: {formatVolume(quote.volume)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-terminal-text-secondary">No data</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto pt-1 border-t border-terminal-border/50">
        <button
          onClick={() => onAnalyze(def.symbol)}
          className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20 hover:bg-terminal-cyan/20 transition-colors"
        >
          Analyze
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function FuturesPanel() {
  const { addToWatchlist, watchlist, setActiveView } = useStore();

  const [activeCategory, setActiveCategory] = useState<FuturesQuote['category'] | 'ALL'>('ALL');
  const [quotes, setQuotes] = useState<Map<string, RawQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadQuotes = useCallback(async () => {
    try {
      const data = await fetchAllFutures();
      setQuotes(data);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Failed to fetch futures data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    intervalRef.current = setInterval(loadQuotes, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadQuotes]);

  const handleAnalyze = useCallback(
    (symbol: string) => {
      // Switch to AI Analysis and pre-fill symbol
      // We store it in localStorage so AIAnalysisPanel can pick it up if needed
      localStorage.setItem('pp_analyze_symbol', symbol);
      setActiveView('ai-analysis');
    },
    [setActiveView]
  );

  const handleWatch = useCallback(
    (symbol: string, name: string) => {
      addToWatchlist({
        symbol,
        name,
        addedAt: new Date().toISOString(),
      });
    },
    [addToWatchlist]
  );

  const watchlistSymbols = new Set(watchlist.map((w) => w.symbol));

  const filteredFutures =
    activeCategory === 'ALL'
      ? FUTURES_LIST
      : FUTURES_LIST.filter((f) => f.category === activeCategory);

  const totalLoaded = quotes.size;

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
              ? `Updated ${lastUpdated.toLocaleTimeString()} · ${totalLoaded}/${FUTURES_LIST.length} loaded · auto-refreshes every 60s`
              : 'Live futures quotes'}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); loadQuotes(); }}
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

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-terminal-yellow/10 border border-terminal-yellow/25 px-3 py-2 text-sm text-terminal-yellow flex items-center gap-2">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveCategory(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeCategory === id
                ? 'bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25'
                : 'bg-terminal-card border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-border/80'
            }`}
          >
            {label}
            <span className="ml-1.5 text-[10px] opacity-70">
              {id === 'ALL'
                ? FUTURES_LIST.length
                : FUTURES_LIST.filter((f) => f.category === id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Futures Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredFutures.map((def) => (
          <FuturesCard
            key={def.symbol}
            def={def}
            quote={quotes.get(def.symbol) ?? null}
            loading={loading && !quotes.has(def.symbol)}
            onAnalyze={handleAnalyze}
            onWatch={handleWatch}
            inWatchlist={watchlistSymbols.has(def.symbol)}
          />
        ))}
      </div>

      {filteredFutures.length === 0 && (
        <div className="text-center py-12 text-terminal-text-secondary text-sm">
          No futures in this category.
        </div>
      )}
    </div>
  );
}
