import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import {
  formatPrice,
  formatPercent,
  formatVolume,
  getChangeColor,
  timeAgo,
} from '../../utils/formatters';
import type { WatchlistItem, QuoteData } from '../../types';

// ─── Add Symbol Input ─────────────────────────────────────────────────────────

function AddSymbolInput() {
  const { addToWatchlist, watchlist } = useStore();
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const sym = value.trim().toUpperCase();
    if (!sym) return;
    if (watchlist.some((w) => w.symbol === sym)) {
      setError(`${sym} is already in your watchlist`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await axios.post(`/api/watchlist/${sym}`);
    } catch { /* optimistic */ }
    addToWatchlist({
      symbol: sym,
      addedAt: new Date().toISOString(),
    });
    setValue('');
    setAdding(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setValue(''); setError(null); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={handleKey}
            placeholder="Add symbol (e.g. NVDA)..."
            className="w-full pl-9 pr-3 py-2.5 bg-terminal-card border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none uppercase"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !value.trim()}
          className="px-4 py-2.5 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 disabled:opacity-50 transition-all active:scale-95"
        >
          {adding ? '...' : 'Add'}
        </button>
      </div>
      {error && <p className="text-xs text-terminal-red">{error}</p>}
    </div>
  );
}

// ─── Watchlist Row ──────────────────────────────────────────────────────────

function WatchlistRow({
  item,
  quote,
  onRemove,
  onUpdate,
  onAnalyze,
}: {
  item: WatchlistItem;
  quote: QuoteData | null;
  onRemove: (symbol: string) => void;
  onUpdate: (symbol: string, updates: Partial<WatchlistItem>) => void;
  onAnalyze?: (symbol: string) => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(item.notes || '');
  const [alertPrice, setAlertPrice] = useState(item.alertPrice?.toString() || '');
  const [stopLoss, setStopLoss] = useState(item.stopLoss?.toString() || '');
  const [targetPrice, setTargetPrice] = useState(item.targetPrice?.toString() || '');
  const [expanded, setExpanded] = useState(false);

  const handleRowClick = () => {
    if (onAnalyze) { onAnalyze(item.symbol); }
    else setExpanded(!expanded);
  };

  const price = quote?.price ?? null;
  const change = quote?.changePercent ?? null;
  const volume = quote?.volume ?? null;
  const changeColor = change !== null ? getChangeColor(change) : 'text-terminal-text-secondary';

  const isNearAlert =
    price !== null && item.alertPrice !== undefined
      ? Math.abs((price - item.alertPrice) / item.alertPrice) < 0.01
      : false;

  const isNearStop =
    price !== null && item.stopLoss !== undefined
      ? Math.abs((price - item.stopLoss) / item.stopLoss) < 0.01
      : false;

  const saveNotes = () => {
    onUpdate(item.symbol, { notes: notes || undefined });
    setEditingNotes(false);
  };

  const saveLevels = () => {
    onUpdate(item.symbol, {
      alertPrice: alertPrice ? parseFloat(alertPrice) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
    });
  };

  return (
    <>
      <tr
        className={`border-b border-terminal-border/50 hover:bg-terminal-border/10 transition-colors cursor-pointer
          ${isNearAlert ? 'bg-terminal-yellow/5' : ''}
          ${isNearStop ? 'bg-terminal-red/5' : ''}
        `}
        onClick={handleRowClick}
      >
        {/* Symbol */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-terminal-text-primary">{item.symbol}</span>
            {isNearAlert && <span className="text-[10px] bg-terminal-yellow/10 text-terminal-yellow px-1.5 py-0.5 rounded">Near Alert</span>}
            {isNearStop && <span className="text-[10px] bg-terminal-red/10 text-terminal-red px-1.5 py-0.5 rounded">Near Stop</span>}
          </div>
          {item.name && <p className="text-[10px] text-terminal-text-secondary mt-0.5">{item.name}</p>}
        </td>

        {/* Price */}
        <td className="px-4 py-3">
          {price !== null ? (
            <span className="text-sm font-mono font-semibold text-terminal-text-primary">{formatPrice(price)}</span>
          ) : (
            <span className="text-sm text-terminal-text-secondary">—</span>
          )}
        </td>

        {/* Change */}
        <td className="px-4 py-3">
          {change !== null ? (
            <span className={`text-sm font-mono font-semibold ${changeColor}`}>
              {change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(change))}
            </span>
          ) : (
            <span className="text-sm text-terminal-text-secondary">—</span>
          )}
        </td>

        {/* Volume */}
        <td className="px-4 py-3">
          <span className="text-xs font-mono text-terminal-text-secondary">
            {volume !== null ? formatVolume(volume) : '—'}
          </span>
        </td>

        {/* Alert Price */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            value={alertPrice}
            onChange={(e) => setAlertPrice(e.target.value)}
            onBlur={saveLevels}
            placeholder="—"
            className="w-20 bg-transparent border border-transparent hover:border-terminal-border focus:border-terminal-yellow focus:bg-terminal-card rounded px-1.5 py-0.5 text-xs font-mono text-terminal-yellow placeholder-terminal-text-secondary focus:outline-none transition-all"
            step="0.01"
          />
        </td>

        {/* Stop Loss */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            onBlur={saveLevels}
            placeholder="—"
            className="w-20 bg-transparent border border-transparent hover:border-terminal-border focus:border-terminal-red focus:bg-terminal-card rounded px-1.5 py-0.5 text-xs font-mono text-terminal-red placeholder-terminal-text-secondary focus:outline-none transition-all"
            step="0.01"
          />
        </td>

        {/* Target */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            onBlur={saveLevels}
            placeholder="—"
            className="w-20 bg-transparent border border-transparent hover:border-terminal-border focus:border-terminal-green focus:bg-terminal-card rounded px-1.5 py-0.5 text-xs font-mono text-terminal-green placeholder-terminal-text-secondary focus:outline-none transition-all"
            step="0.01"
          />
        </td>

        {/* Added */}
        <td className="px-4 py-3">
          <span className="text-[10px] text-terminal-text-secondary">{timeAgo(item.addedAt)}</span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {onAnalyze && (
              <button onClick={() => onAnalyze(item.symbol)}
                className="px-2 py-1 rounded text-[10px] font-semibold bg-terminal-cyan/10 text-terminal-cyan hover:bg-terminal-cyan/20 transition-colors">
                Analyze
              </button>
            )}
            <button
              onClick={() => onRemove(item.symbol)}
              className="w-7 h-7 flex items-center justify-center rounded bg-terminal-red/10 text-terminal-red hover:bg-terminal-red/20 transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded notes row */}
      {expanded && (
        <tr className="bg-terminal-bg/50 border-b border-terminal-border/50">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="text-xs text-terminal-text-secondary mt-1 shrink-0">Notes:</span>
              {editingNotes ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="flex-1 bg-terminal-card border border-terminal-cyan rounded px-2 py-1 text-xs text-terminal-text-primary focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditingNotes(false); }}
                  />
                  <button onClick={saveNotes} className="px-2 py-1 bg-terminal-cyan text-black text-xs rounded font-semibold">Save</button>
                  <button onClick={() => setEditingNotes(false)} className="px-2 py-1 bg-terminal-border/40 text-terminal-text-secondary text-xs rounded">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="text-xs text-terminal-text-secondary hover:text-terminal-text-primary italic"
                >
                  {notes || 'Click to add notes...'}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Watchlist Panel ─────────────────────────────────────────────────────

export default function WatchlistPanel() {
  const { watchlist, removeFromWatchlist, updateWatchlistItem, setSelectedSymbol, setActiveView } = useStore();
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [sortBy, setSortBy] = useState<'symbol' | 'change' | 'price' | 'added'>('added');

  const fetchQuotes = useCallback(async () => {
    if (watchlist.length === 0) return;
    setLoadingQuotes(true);
    try {
      const symbols = watchlist.map((w) => w.symbol).join(',');
      const res = await axios.get<Record<string, QuoteData>>(`/api/quotes?symbols=${symbols}`);
      setQuotes(res.data);
    } catch {
      // silently fail - quotes unavailable
    } finally {
      setLoadingQuotes(false);
    }
  }, [watchlist]);

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  const handleRemove = useCallback(async (symbol: string) => {
    removeFromWatchlist(symbol);
    try {
      await axios.delete(`/api/watchlist/${symbol}`);
    } catch { /* optimistic */ }
  }, [removeFromWatchlist]);

  const handleUpdate = useCallback(async (symbol: string, updates: Partial<WatchlistItem>) => {
    updateWatchlistItem(symbol, updates);
    try {
      await axios.patch(`/api/watchlist/${symbol}`, updates);
    } catch { /* optimistic */ }
  }, [updateWatchlistItem]);

  const sortedWatchlist = [...watchlist].sort((a, b) => {
    switch (sortBy) {
      case 'symbol': return a.symbol.localeCompare(b.symbol);
      case 'change': {
        const ca = quotes[a.symbol]?.changePercent ?? 0;
        const cb = quotes[b.symbol]?.changePercent ?? 0;
        return Math.abs(cb) - Math.abs(ca);
      }
      case 'price': {
        const pa = quotes[a.symbol]?.price ?? 0;
        const pb = quotes[b.symbol]?.price ?? 0;
        return pb - pa;
      }
      case 'added':
      default:
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    }
  });

  const gainers = watchlist.filter((w) => (quotes[w.symbol]?.changePercent ?? 0) > 0).length;
  const losers = watchlist.filter((w) => (quotes[w.symbol]?.changePercent ?? 0) < 0).length;

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header + Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Watchlist</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            {watchlist.length} symbols ·
            <span className="text-terminal-green ml-1">{gainers} up</span> ·
            <span className="text-terminal-red ml-1">{losers} down</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadingQuotes && (
            <div className="w-3 h-3 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          )}
          <button
            onClick={fetchQuotes}
            className="px-3 py-1.5 bg-terminal-border/40 text-terminal-text-secondary text-xs rounded-lg hover:bg-terminal-border transition-colors"
          >
            Refresh Quotes
          </button>
        </div>
      </div>

      <AddSymbolInput />

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-terminal-card border border-terminal-border rounded-xl">
          <div className="w-12 h-12 bg-terminal-bg border border-terminal-border rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-terminal-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-terminal-text-primary">Your watchlist is empty</p>
          <p className="text-xs text-terminal-text-secondary mt-1">Add symbols to track prices and set alerts</p>
        </div>
      ) : (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-terminal-border flex items-center gap-4">
            <span className="text-xs text-terminal-text-secondary">Sort:</span>
            {[
              { v: 'added', l: 'Date Added' },
              { v: 'symbol', l: 'Symbol' },
              { v: 'change', l: '% Change' },
              { v: 'price', l: 'Price' },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setSortBy(opt.v as typeof sortBy)}
                className={`text-xs transition-colors ${sortBy === opt.v ? 'text-terminal-cyan font-semibold' : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full data-table min-w-[900px]">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-bg/60">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Symbol</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Price</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Day Change</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Volume</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-yellow">Alert $</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-red">Stop $</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-green">Target $</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Added</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Remove</th>
                </tr>
              </thead>
              <tbody>
                {sortedWatchlist.map((item) => (
                  <WatchlistRow
                    key={item.symbol}
                    item={item}
                    quote={quotes[item.symbol] ?? null}
                    onRemove={handleRemove}
                    onUpdate={handleUpdate}
                    onAnalyze={(sym) => { setSelectedSymbol(sym); setActiveView('ai-analysis'); }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick stats */}
      {watchlist.length > 0 && Object.keys(quotes).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Gainers', value: gainers, color: 'text-terminal-green' },
            { label: 'Losers', value: losers, color: 'text-terminal-red' },
            { label: 'Unchanged', value: watchlist.length - gainers - losers, color: 'text-terminal-text-secondary' },
            { label: 'Symbols', value: watchlist.length, color: 'text-terminal-cyan' },
          ].map((stat) => (
            <div key={stat.label} className="bg-terminal-card border border-terminal-border rounded-lg p-3 text-center">
              <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-terminal-text-secondary mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
