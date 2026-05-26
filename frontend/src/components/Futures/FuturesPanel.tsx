import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import type { FuturesQuote } from '../../types';

// ── All futures available on Robinhood ───────────────────────────────────────

interface FuturesDef {
  symbol: string;
  displaySymbol: string;
  name: string;
  category: FuturesQuote['category'];
  unit?: string;
  tickValue?: string; // e.g. "$25/tick"
  contractSize?: string;
  robinhood?: boolean; // explicitly available on Robinhood
}

const FUTURES_LIST: FuturesDef[] = [
  // ── Precious Metals ───────────────────────────────────────────────────────
  { symbol: 'SI=F',  displaySymbol: 'SI',  name: 'Silver (Full)',       category: 'COMMODITY', unit: '$/oz',    tickValue: '$25/tick',  contractSize: '5,000 oz',  robinhood: true },
  { symbol: 'GC=F',  displaySymbol: 'GC',  name: 'Gold (Full)',         category: 'COMMODITY', unit: '$/oz',    tickValue: '$10/tick',  contractSize: '100 oz',    robinhood: true },
  { symbol: 'MGC=F', displaySymbol: 'MGC', name: 'Micro Gold',          category: 'COMMODITY', unit: '$/oz',    tickValue: '$1/tick',   contractSize: '10 oz',     robinhood: true },
  { symbol: 'SIL=F', displaySymbol: 'SIL', name: 'Micro Silver',        category: 'COMMODITY', unit: '$/oz',    tickValue: '$5/tick',   contractSize: '1,000 oz',  robinhood: true },
  { symbol: 'PL=F',  displaySymbol: 'PL',  name: 'Platinum',            category: 'COMMODITY', unit: '$/oz',    tickValue: '$5/tick',   contractSize: '50 oz',     robinhood: true },
  { symbol: 'PA=F',  displaySymbol: 'PA',  name: 'Palladium',           category: 'COMMODITY', unit: '$/oz',    tickValue: '$5/tick',   contractSize: '100 oz',    robinhood: true },
  { symbol: 'HG=F',  displaySymbol: 'HG',  name: 'Copper',              category: 'COMMODITY', unit: '$/lb',    tickValue: '$12.50/tick', contractSize: '25,000 lb', robinhood: true },
  // ── Energy ────────────────────────────────────────────────────────────────
  { symbol: 'CL=F',  displaySymbol: 'CL',  name: 'Crude Oil WTI',       category: 'COMMODITY', unit: '$/bbl',   tickValue: '$10/tick',  contractSize: '1,000 bbl', robinhood: true },
  { symbol: 'QM=F',  displaySymbol: 'QM',  name: 'Mini Crude Oil',      category: 'COMMODITY', unit: '$/bbl',   tickValue: '$5/tick',   contractSize: '500 bbl',   robinhood: true },
  { symbol: 'NG=F',  displaySymbol: 'NG',  name: 'Natural Gas',         category: 'COMMODITY', unit: '$/MMBtu', tickValue: '$10/tick',  contractSize: '10,000 MMBtu', robinhood: true },
  { symbol: 'BZ=F',  displaySymbol: 'BZ',  name: 'Brent Crude Oil',     category: 'COMMODITY', unit: '$/bbl',   tickValue: '$10/tick',  contractSize: '1,000 bbl', robinhood: false },
  // ── Equity Indices ────────────────────────────────────────────────────────
  { symbol: 'ES=F',  displaySymbol: 'ES',  name: 'S&P 500 E-mini',      category: 'INDEX',     tickValue: '$12.50/tick', contractSize: '$50 × Index', robinhood: true },
  { symbol: 'NQ=F',  displaySymbol: 'NQ',  name: 'Nasdaq-100 E-mini',   category: 'INDEX',     tickValue: '$5/tick',   contractSize: '$20 × Index', robinhood: true },
  { symbol: 'YM=F',  displaySymbol: 'YM',  name: 'Dow Jones E-mini',    category: 'INDEX',     tickValue: '$5/tick',   contractSize: '$5 × Index',  robinhood: true },
  { symbol: 'RTY=F', displaySymbol: 'RTY', name: 'Russell 2000 E-mini', category: 'INDEX',     tickValue: '$5/tick',   contractSize: '$50 × Index', robinhood: true },
  { symbol: 'MES=F', displaySymbol: 'MES', name: 'Micro S&P 500',       category: 'INDEX',     tickValue: '$1.25/tick', contractSize: '$5 × Index',  robinhood: true },
  { symbol: 'MNQ=F', displaySymbol: 'MNQ', name: 'Micro Nasdaq-100',    category: 'INDEX',     tickValue: '$0.50/tick', contractSize: '$2 × Index',  robinhood: true },
  { symbol: 'MYM=F', displaySymbol: 'MYM', name: 'Micro Dow Jones',     category: 'INDEX',     tickValue: '$0.50/tick', contractSize: '$0.50 × Index', robinhood: true },
  { symbol: 'M2K=F', displaySymbol: 'M2K', name: 'Micro Russell 2000',  category: 'INDEX',     tickValue: '$0.50/tick', contractSize: '$5 × Index',  robinhood: true },
  // ── Interest Rates / Bonds ────────────────────────────────────────────────
  { symbol: 'ZN=F',  displaySymbol: 'ZN',  name: '10-Year T-Note',      category: 'BOND',      tickValue: '$15.625/tick', robinhood: true },
  { symbol: 'ZB=F',  displaySymbol: 'ZB',  name: '30-Year T-Bond',      category: 'BOND',      tickValue: '$31.25/tick',  robinhood: true },
  { symbol: 'ZT=F',  displaySymbol: 'ZT',  name: '2-Year T-Note',       category: 'BOND',      tickValue: '$15.625/tick', robinhood: true },
  { symbol: 'ZF=F',  displaySymbol: 'ZF',  name: '5-Year T-Note',       category: 'BOND',      tickValue: '$15.625/tick', robinhood: true },
  // ── Currencies ────────────────────────────────────────────────────────────
  { symbol: '6E=F',  displaySymbol: '6E',  name: 'Euro FX',             category: 'CURRENCY',  contractSize: '€125,000', robinhood: true },
  { symbol: '6B=F',  displaySymbol: '6B',  name: 'British Pound',       category: 'CURRENCY',  contractSize: '£62,500',  robinhood: true },
  { symbol: '6J=F',  displaySymbol: '6J',  name: 'Japanese Yen',        category: 'CURRENCY',  contractSize: '¥12.5M',   robinhood: true },
  { symbol: '6C=F',  displaySymbol: '6C',  name: 'Canadian Dollar',     category: 'CURRENCY',  contractSize: 'C$100,000', robinhood: true },
  { symbol: '6A=F',  displaySymbol: '6A',  name: 'Australian Dollar',   category: 'CURRENCY',  contractSize: 'A$100,000', robinhood: true },
  { symbol: '6S=F',  displaySymbol: '6S',  name: 'Swiss Franc',         category: 'CURRENCY',  contractSize: 'CHF 125,000', robinhood: true },
  // ── Agriculture ───────────────────────────────────────────────────────────
  { symbol: 'ZC=F',  displaySymbol: 'ZC',  name: 'Corn',                category: 'COMMODITY', unit: '¢/bu',   contractSize: '5,000 bu',  robinhood: true },
  { symbol: 'ZS=F',  displaySymbol: 'ZS',  name: 'Soybeans',            category: 'COMMODITY', unit: '¢/bu',   contractSize: '5,000 bu',  robinhood: true },
  { symbol: 'ZW=F',  displaySymbol: 'ZW',  name: 'Wheat',               category: 'COMMODITY', unit: '¢/bu',   contractSize: '5,000 bu',  robinhood: true },
  { symbol: 'ZM=F',  displaySymbol: 'ZM',  name: 'Soybean Meal',        category: 'COMMODITY', unit: '$/ton',  contractSize: '100 tons',  robinhood: true },
  { symbol: 'ZL=F',  displaySymbol: 'ZL',  name: 'Soybean Oil',         category: 'COMMODITY', unit: '¢/lb',   contractSize: '60,000 lb', robinhood: true },
  // ── Softs ─────────────────────────────────────────────────────────────────
  { symbol: 'KC=F',  displaySymbol: 'KC',  name: 'Coffee',              category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  { symbol: 'CT=F',  displaySymbol: 'CT',  name: 'Cotton',              category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  { symbol: 'SB=F',  displaySymbol: 'SB',  name: 'Sugar No. 11',        category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  { symbol: 'CC=F',  displaySymbol: 'CC',  name: 'Cocoa',               category: 'COMMODITY', unit: '$/ton', robinhood: false },
  { symbol: 'OJ=F',  displaySymbol: 'OJ',  name: 'Orange Juice',        category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  // ── Livestock ─────────────────────────────────────────────────────────────
  { symbol: 'LE=F',  displaySymbol: 'LE',  name: 'Live Cattle',         category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  { symbol: 'GF=F',  displaySymbol: 'GF',  name: 'Feeder Cattle',       category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  { symbol: 'HE=F',  displaySymbol: 'HE',  name: 'Lean Hogs',           category: 'COMMODITY', unit: '¢/lb',  robinhood: false },
  // ── Crypto ────────────────────────────────────────────────────────────────
  { symbol: 'BTC=F', displaySymbol: 'BTC', name: 'Bitcoin (CME)',        category: 'CRYPTO',    tickValue: '$25/tick',  contractSize: '5 BTC',      robinhood: true },
  { symbol: 'ETH=F', displaySymbol: 'ETH', name: 'Ethereum (CME)',       category: 'CRYPTO',    tickValue: '$5/tick',   contractSize: '50 ETH',     robinhood: true },
  { symbol: 'MBT=F', displaySymbol: 'MBT', name: 'Micro Bitcoin',        category: 'CRYPTO',    tickValue: '$0.50/tick', contractSize: '0.1 BTC',   robinhood: true },
  { symbol: 'MET=F', displaySymbol: 'MET', name: 'Micro Ether',          category: 'CRYPTO',    tickValue: '$0.10/tick', contractSize: '0.1 ETH',   robinhood: true },
  // ── Volatility ────────────────────────────────────────────────────────────
  { symbol: 'VX=F',  displaySymbol: 'VX',  name: 'CBOE VIX',            category: 'VOLATILITY', robinhood: false },
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const FAVORITES_KEY = 'patternpulse_futures_favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: { id: FuturesQuote['category'] | 'ALL' | 'FAVORITES' | 'ROBINHOOD'; label: string }[] = [
  { id: 'FAVORITES', label: '★ Favorites' },
  { id: 'ROBINHOOD', label: 'Robinhood' },
  { id: 'ALL',       label: 'All' },
  { id: 'COMMODITY', label: 'Metals & Energy' },
  { id: 'INDEX',     label: 'Indices' },
  { id: 'BOND',      label: 'Bonds' },
  { id: 'CURRENCY',  label: 'FX' },
  { id: 'CRYPTO',    label: 'Crypto' },
];

const CATEGORY_BADGE: Record<FuturesQuote['category'], string> = {
  COMMODITY:  'bg-terminal-yellow/15 text-terminal-yellow',
  INDEX:      'bg-terminal-cyan/15 text-terminal-cyan',
  BOND:       'bg-purple-500/15 text-purple-400',
  CURRENCY:   'bg-terminal-green/15 text-terminal-green',
  CRYPTO:     'bg-terminal-red/15 text-terminal-red',
  VOLATILITY: 'bg-terminal-border text-terminal-text-secondary',
};

interface RawQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

async function loadQuoteBatch(defs: FuturesDef[]): Promise<Map<string, RawQuote>> {
  const settled = await Promise.allSettled(
    defs.map((d) => axios.get<{ success: boolean; quote: RawQuote }>(`/api/stock/${encodeURIComponent(d.symbol)}/quote`))
  );
  const map = new Map<string, RawQuote>();
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const q = r.value.data?.quote;
      if (q) map.set(defs[i].symbol, q);
    }
  });
  return map;
}

function fmtPrice(price: number): string {
  if (!price) return '—';
  return price >= 10000
    ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : price >= 100
    ? `$${price.toFixed(2)}`
    : `$${price.toFixed(4)}`;
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
  isFavorite: boolean;
  inWatchlist: boolean;
  onAnalyze: (symbol: string) => void;
  onToggleFavorite: (symbol: string) => void;
  onWatch: (symbol: string, name: string) => void;
  onSetAlert: (def: FuturesDef, quote: RawQuote) => void;
}

function FuturesCard({ def, quote, loading, isFavorite, inWatchlist, onAnalyze, onToggleFavorite, onWatch, onSetAlert }: CardProps) {
  const up = (quote?.change ?? 0) >= 0;
  const priceColor = up ? 'text-terminal-green' : 'text-terminal-red';
  const changeBg = up
    ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20'
    : 'bg-terminal-red/10 text-terminal-red border-terminal-red/20';

  const isMetals = def.displaySymbol === 'SI' || def.displaySymbol === 'GC' || def.displaySymbol === 'SIL' || def.displaySymbol === 'MGC';

  return (
    <div className={`bg-terminal-card border rounded-xl p-3.5 flex flex-col gap-2.5 transition-colors hover:border-terminal-border/80 ${
      isMetals ? 'border-terminal-yellow/30' : 'border-terminal-border'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-terminal-text-primary font-mono">{def.displaySymbol}</p>
            {def.robinhood && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-terminal-green/15 text-terminal-green border border-terminal-green/25 font-bold">RH</span>
            )}
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${CATEGORY_BADGE[def.category]}`}>
              {def.category === 'COMMODITY' ? (isMetals ? 'METAL' : 'ENERGY/AG') : def.category}
            </span>
          </div>
          <p className="text-[11px] text-terminal-text-secondary truncate mt-0.5">{def.name}</p>
          {def.tickValue && <p className="text-[9px] text-terminal-text-secondary/60">{def.tickValue} · {def.contractSize}</p>}
        </div>
        {/* Favorite star */}
        <button
          onClick={() => onToggleFavorite(def.symbol)}
          className={`shrink-0 text-lg leading-none transition-colors ${isFavorite ? 'text-terminal-yellow' : 'text-terminal-border hover:text-terminal-yellow'}`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>

      {/* Price */}
      <div>
        {loading ? (
          <div className="space-y-1">
            <div className="h-6 w-28 bg-terminal-border/40 rounded animate-pulse" />
            <div className="h-3.5 w-20 bg-terminal-border/30 rounded animate-pulse" />
          </div>
        ) : quote && quote.price > 0 ? (
          <>
            <p className={`text-xl font-bold tabular-nums font-mono ${priceColor}`}>{fmtPrice(quote.price)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded border ${changeBg}`}>
                {up ? '▲' : '▼'} {Math.abs(quote.change).toFixed(2)} ({up ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </span>
            </div>
            {quote.volume > 0 && <p className="text-[10px] text-terminal-text-secondary mt-0.5">Vol {fmtVol(quote.volume)}</p>}
          </>
        ) : (
          <p className="text-sm text-terminal-text-secondary italic">No data</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-1.5 mt-auto pt-2 border-t border-terminal-border/40">
        <button
          onClick={() => onAnalyze(def.symbol)}
          className="text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/25 hover:bg-terminal-cyan/20 transition-colors"
        >
          Analyze
        </button>
        {quote && quote.price > 0 ? (
          <button
            onClick={() => onSetAlert(def, quote)}
            className="text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-terminal-yellow/10 text-terminal-yellow border border-terminal-yellow/25 hover:bg-terminal-yellow/20 transition-colors"
          >
            Set Alert
          </button>
        ) : (
          <button
            onClick={() => onWatch(def.symbol, def.name)}
            disabled={inWatchlist}
            className={`text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition-colors ${
              inWatchlist
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 cursor-default'
                : 'bg-terminal-border/30 text-terminal-text-secondary border-terminal-border hover:bg-terminal-border/60'
            }`}
          >
            {inWatchlist ? '✓ Watching' : '+ Watch'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Alert modal ───────────────────────────────────────────────────────────────

interface AlertModalProps {
  def: FuturesDef;
  quote: RawQuote;
  onClose: () => void;
}

function AlertModal({ def, quote, onClose }: AlertModalProps) {
  const [alertPrice, setAlertPrice] = useState(quote.price.toFixed(2));
  const [condition, setCondition] = useState<'PRICE_ABOVE' | 'PRICE_BELOW'>('PRICE_ABOVE');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await axios.post('/api/alerts', {
        symbol: def.symbol,
        conditionType: condition,
        threshold: parseFloat(alertPrice),
        notifyMethods: ['browser'],
        note: note || undefined,
      });
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-terminal-card border border-terminal-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-terminal-text-primary">Set Price Alert — <span className="font-mono text-terminal-cyan">{def.displaySymbol}</span></h3>
          <button onClick={onClose} className="text-terminal-text-secondary hover:text-terminal-text-primary text-lg">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1">Current Price</p>
            <p className="text-lg font-bold font-mono text-terminal-text-primary">{fmtPrice(quote.price)}</p>
          </div>

          <div>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1.5">Condition</p>
            <div className="grid grid-cols-2 gap-2">
              {(['PRICE_ABOVE', 'PRICE_BELOW'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    condition === c
                      ? c === 'PRICE_ABOVE'
                        ? 'bg-terminal-green/20 border-terminal-green/40 text-terminal-green'
                        : 'bg-terminal-red/20 border-terminal-red/40 text-terminal-red'
                      : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
                  }`}
                >
                  {c === 'PRICE_ABOVE' ? '▲ Above' : '▼ Below'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1.5">Alert Price</p>
            <input
              type="number"
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              step="0.01"
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50 font-mono"
            />
          </div>

          <div>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1.5">Note (optional)</p>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Exit long, take profit…"
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50"
            />
          </div>

          <button
            onClick={save}
            disabled={saving || saved}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
              saved
                ? 'bg-terminal-green/20 text-terminal-green border border-terminal-green/40'
                : 'bg-terminal-cyan text-terminal-bg hover:bg-terminal-cyan/90 disabled:opacity-50'
            }`}
          >
            {saved ? '✓ Alert Set!' : saving ? 'Saving…' : 'Set Alert'}
          </button>
          <p className="text-[10px] text-terminal-text-secondary text-center">
            Browser + Telegram notification when triggered
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Custom symbol input ───────────────────────────────────────────────────────

function CustomSymbolInput({ onAnalyze }: { onAnalyze: (sym: string) => void }) {
  const [val, setVal] = useState('');
  const submit = () => { if (val.trim()) { onAnalyze(val.trim()); setVal(''); } };
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <p className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider mb-2">
        Analyze any futures symbol
      </p>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="SI=F, GC=F, SICN26, SIN26.CMX…"
          className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 font-mono uppercase"
        />
        <button
          onClick={submit}
          disabled={!val.trim()}
          className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm hover:bg-terminal-cyan/90 disabled:opacity-40"
        >
          Analyze
        </button>
      </div>
      <p className="text-[10px] text-terminal-text-secondary mt-1.5">
        Supports: SI=F · GC=F · SICN26 (broker format) · SIN26.CMX (specific contract)
      </p>
    </div>
  );
}

// ── Telegram connect banner ───────────────────────────────────────────────────

function TelegramBanner() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [chatId, setChatId] = useState<string | null>(null);

  const connect = async () => {
    setStatus('loading');
    try {
      const res = await axios.get<{ success: boolean; chatId: string; username: string }>('/api/notifications/telegram/detect-chat');
      if (res.data.success) {
        setChatId(res.data.chatId);
        setStatus('connected');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2 bg-terminal-green/10 border border-terminal-green/25 rounded-lg px-3 py-2">
        <span className="text-terminal-green">✓</span>
        <p className="text-[11px] text-terminal-green font-semibold">Telegram connected! Chat ID: {chatId}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-terminal-card border border-terminal-border rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-terminal-text-primary">Connect Telegram Alerts</p>
        <p className="text-[11px] text-terminal-text-secondary mt-0.5">
          Message your bot @PatternPulseBot → then click Connect
        </p>
        {status === 'error' && (
          <p className="text-[11px] text-terminal-red mt-0.5">
            Could not detect chat. Message the bot /start and retry.
          </p>
        )}
      </div>
      <button
        onClick={connect}
        disabled={status === 'loading'}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25 text-xs font-semibold hover:bg-terminal-cyan/25 disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? '…' : 'Connect'}
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type ActiveTab = FuturesQuote['category'] | 'ALL' | 'FAVORITES' | 'ROBINHOOD';

export default function FuturesPanel() {
  const { addToWatchlist, watchlist, setActiveView, setSelectedSymbol } = useStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>('FAVORITES');
  const [quotes, setQuotes] = useState<Map<string, RawQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [alertModal, setAlertModal] = useState<{ def: FuturesDef; quote: RawQuote } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const combined = new Map<string, RawQuote>();
      const BATCH = 6;
      for (let i = 0; i < FUTURES_LIST.length; i += BATCH) {
        const partial = await loadQuoteBatch(FUTURES_LIST.slice(i, i + BATCH));
        partial.forEach((v, k) => combined.set(k, v));
      }
      setQuotes(combined);
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

  // Sync existing favorites to backend watchlist on first load
  useEffect(() => {
    const favs = loadFavorites();
    favs.forEach((symbol) => {
      const def = FUTURES_LIST.find((f) => f.symbol === symbol);
      axios.post('/api/watchlist', { symbol, name: def?.name ?? symbol }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavorite = useCallback((symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const adding = !prev.has(symbol);
      if (adding) {
        next.add(symbol);
        const def = FUTURES_LIST.find((f) => f.symbol === symbol);
        axios.post('/api/watchlist', { symbol, name: def?.name ?? symbol }).catch(() => {});
      } else {
        next.delete(symbol);
        axios.delete(`/api/watchlist/${encodeURIComponent(symbol)}`).catch(() => {});
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveView('ai-analysis');
  }, [setActiveView, setSelectedSymbol]);

  const handleWatch = useCallback((symbol: string, name: string) => {
    addToWatchlist({ symbol, name, addedAt: new Date().toISOString() });
  }, [addToWatchlist]);

  const watchlistSet = new Set(watchlist.map((w) => w.symbol));

  const filtered = (() => {
    if (activeTab === 'FAVORITES') return FUTURES_LIST.filter((f) => favorites.has(f.symbol));
    if (activeTab === 'ROBINHOOD') return FUTURES_LIST.filter((f) => f.robinhood);
    if (activeTab === 'ALL') return FUTURES_LIST;
    return FUTURES_LIST.filter((f) => f.category === activeTab);
  })();

  // Precious metals top bar (user's main focus)
  const metals = ['SI=F', 'GC=F', 'SIL=F', 'MGC=F'];
  const metalDefs = metals.map((s) => FUTURES_LIST.find((f) => f.symbol === s)!).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary">Futures Markets</h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            {loading ? 'Loading…' : lastUpdated ? `Updated ${timeAgo(lastUpdated)} · auto-refreshes every 60s` : 'Live quotes'}
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

      {/* Telegram connect banner */}
      <TelegramBanner />

      {/* Precious Metals top bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metalDefs.map((def) => {
          const quote = quotes.get(def.symbol);
          const up = (quote?.change ?? 0) >= 0;
          const isFav = favorites.has(def.symbol);
          return (
            <div key={def.symbol} className="bg-terminal-card border border-terminal-yellow/20 rounded-lg px-3 py-2.5 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-terminal-yellow font-mono">{def.displaySymbol}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleFavorite(def.symbol)} className={`text-sm ${isFav ? 'text-terminal-yellow' : 'text-terminal-border hover:text-terminal-yellow'}`}>
                    {isFav ? '★' : '☆'}
                  </button>
                  <button onClick={() => handleAnalyze(def.symbol)} className="text-[10px] text-terminal-text-secondary hover:text-terminal-cyan">Analyze →</button>
                </div>
              </div>
              <p className={`text-base font-bold tabular-nums font-mono mt-0.5 ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {quote ? fmtPrice(quote.price) : loading ? '…' : '—'}
              </p>
              <p className={`text-[11px] tabular-nums ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {quote ? `${up ? '▲' : '▼'} ${Math.abs(quote.changePercent).toFixed(2)}%` : ''}
              </p>
              <p className="text-[9px] text-terminal-text-secondary/60 mt-0.5">{def.tickValue} · {def.contractSize}</p>
            </div>
          );
        })}
      </div>

      {/* Custom symbol input */}
      <CustomSymbolInput onAnalyze={handleAnalyze} />

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as ActiveTab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === id
                ? 'bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25'
                : 'bg-terminal-card border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary'
            }`}
          >
            {label}
            {id === 'FAVORITES' && favorites.size > 0 && (
              <span className="ml-1 text-terminal-yellow">({favorites.size})</span>
            )}
          </button>
        ))}
      </div>

      {/* Empty favorites state */}
      {activeTab === 'FAVORITES' && filtered.length === 0 && (
        <div className="text-center py-12 text-terminal-text-secondary">
          <p className="text-2xl mb-2">☆</p>
          <p className="text-sm font-semibold">No favorites yet</p>
          <p className="text-xs mt-1">Click ☆ on any contract to add it to favorites</p>
        </div>
      )}

      {/* Futures grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((def) => (
            <FuturesCard
              key={def.symbol}
              def={def}
              quote={quotes.get(def.symbol) ?? null}
              loading={loading && !quotes.has(def.symbol)}
              isFavorite={favorites.has(def.symbol)}
              inWatchlist={watchlistSet.has(def.symbol)}
              onAnalyze={handleAnalyze}
              onToggleFavorite={toggleFavorite}
              onWatch={handleWatch}
              onSetAlert={(d, q) => setAlertModal({ def: d, quote: q })}
            />
          ))}
        </div>
      )}

      {/* Alert modal */}
      {alertModal && (
        <AlertModal
          def={alertModal.def}
          quote={alertModal.quote}
          onClose={() => setAlertModal(null)}
        />
      )}
    </div>
  );
}
