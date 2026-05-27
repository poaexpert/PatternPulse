import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import {
  formatPercent,
  formatVolume,
  formatPrice,
  getChangeColor,
  timeAgo,
  formatScanType,
  getStrengthColor,
} from '../../utils/formatters';
import type { ScanResult } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuoteSnap {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

// ── Live quotes hook ────────────────────────────────────────────────────────

function useLiveQuotes(symbols: string[], intervalMs = 60_000) {
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const doFetch = useCallback(async () => {
    try {
      const { data } = await axios.get<{ quotes: QuoteSnap[] }>(
        `/api/market/quotes?symbols=${symbols.join(',')}`
      );
      const map: Record<string, QuoteSnap> = {};
      for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q;
      setQuotes(map);
      setLastUpdate(new Date());
    } catch {/* silent */} finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    doFetch();
    const t = setInterval(doFetch, intervalMs);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { quotes, loading, lastUpdate };
}

// ── Sparkline (simulated from % change) ────────────────────────────────────

function Sparkline({ change, w = 64, h = 28 }: { change: number; w?: number; h?: number }) {
  const pts: number[] = [];
  let cur = 100;
  const n = 24;
  // deterministic based on change value so it doesn't flicker
  const seed = Math.abs(change * 1000) % 997;
  for (let i = 0; i < n; i++) {
    const pseudo = Math.sin(seed * (i + 1) * 0.7) * 0.4;
    const trend = (change / 100 / n) * i * 2;
    cur += pseudo + trend;
    pts.push(cur);
  }
  pts.push(100 + change * 0.25);

  const minY = Math.min(...pts);
  const maxY = Math.max(...pts);
  const range = maxY - minY || 1;

  const pathD = pts.map((y, i) => {
    const x = (i / (pts.length - 1)) * w;
    const sy = h - ((y - minY) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');

  const color = change >= 0 ? '#4ade80' : '#f87171';
  const areaD = `${pathD} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${Math.abs(Math.round(change * 100))}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${Math.abs(Math.round(change * 100))})`}/>
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Sector list (used by multiple components) ─────────────────────────────

const SECTORS = [
  { symbol: 'XLK',  name: 'Technology',    weight: 31 },
  { symbol: 'XLF',  name: 'Financials',    weight: 13 },
  { symbol: 'XLV',  name: 'Healthcare',    weight: 12 },
  { symbol: 'XLY',  name: 'Consumer Disc', weight: 10 },
  { symbol: 'XLC',  name: 'Comm Services', weight: 9 },
  { symbol: 'XLI',  name: 'Industrials',   weight: 9 },
  { symbol: 'XLP',  name: 'Staples',       weight: 6 },
  { symbol: 'XLE',  name: 'Energy',        weight: 4 },
  { symbol: 'XLB',  name: 'Materials',     weight: 3 },
  { symbol: 'XLRE', name: 'Real Estate',   weight: 3 },
  { symbol: 'XLU',  name: 'Utilities',     weight: 3 },
];

// ── Section 0: Market Pulse (instant UP/DOWN/NEUTRAL) ────────────────────────

interface PulseQuotes { spy?: QuoteSnap; qqq?: QuoteSnap; vix?: QuoteSnap; sectors: number[] }

function computePulse({ spy, qqq, vix, sectors }: PulseQuotes): {
  signal: 'BULL' | 'BEAR' | 'NEUTRAL';
  score: number; // -10 to +10
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  const spyPct = spy?.changePercent ?? 0;
  const qqqPct = qqq?.changePercent ?? 0;
  const vixPx  = vix?.price ?? 0;
  const vixPct = vix?.changePercent ?? 0;

  // SPY direction (±3 pts)
  if (spyPct > 0.5) { score += 3; reasons.push(`SPY +${spyPct.toFixed(2)}% (bullish)`); }
  else if (spyPct > 0) { score += 1; reasons.push(`SPY +${spyPct.toFixed(2)}% (slightly up)`); }
  else if (spyPct < -0.5) { score -= 3; reasons.push(`SPY ${spyPct.toFixed(2)}% (bearish)`); }
  else { score -= 1; reasons.push(`SPY ${spyPct.toFixed(2)}% (slightly down)`); }

  // QQQ / tech leadership (±2 pts)
  if (qqqPct > spyPct + 0.3) { score += 2; reasons.push(`QQQ leading (+${qqqPct.toFixed(2)}%) — tech bullish`); }
  else if (qqqPct < spyPct - 0.3) { score -= 2; reasons.push(`QQQ lagging (${qqqPct.toFixed(2)}%) — tech weakness`); }

  // VIX (±2 pts)
  if (vixPx > 0) {
    if (vixPx < 15 && vixPct < 0) { score += 2; reasons.push(`VIX ${vixPx.toFixed(1)} & falling — low fear`); }
    else if (vixPx > 25) { score -= 3; reasons.push(`VIX ${vixPx.toFixed(1)} — HIGH FEAR, elevated risk`); }
    else if (vixPx > 20) { score -= 1; reasons.push(`VIX ${vixPx.toFixed(1)} — moderate fear`); }
    else if (vixPct < -2) { score += 1; reasons.push(`VIX falling ${vixPct.toFixed(1)}% — fear subsiding`); }
    else if (vixPct > 5) { score -= 2; reasons.push(`VIX surging +${vixPct.toFixed(1)}% — fear rising`); }
  }

  // Sector breadth (±2 pts)
  const bullSectors = sectors.filter(p => p > 0).length;
  const bearSectors = sectors.filter(p => p < 0).length;
  if (bullSectors >= 9) { score += 2; reasons.push(`${bullSectors}/11 sectors green — strong breadth`); }
  else if (bullSectors >= 7) { score += 1; reasons.push(`${bullSectors}/11 sectors green — broad buying`); }
  else if (bearSectors >= 9) { score -= 2; reasons.push(`${bearSectors}/11 sectors red — broad selling`); }
  else if (bearSectors >= 7) { score -= 1; reasons.push(`${bearSectors}/11 sectors red — weak breadth`); }

  // Clamp
  score = Math.max(-10, Math.min(10, score));

  const signal: 'BULL' | 'BEAR' | 'NEUTRAL' =
    score >= 3 ? 'BULL' : score <= -3 ? 'BEAR' : 'NEUTRAL';

  return { signal, score, reasons };
}

function MarketPulse({ quotes, loading }: { quotes: Record<string, QuoteSnap>; loading: boolean }) {
  const sectors = SECTORS.map(s => quotes[s.symbol]?.changePercent ?? 0);
  const { signal, score, reasons } = computePulse({
    spy: quotes['SPY'],
    qqq: quotes['QQQ'],
    vix: quotes['^VIX'],
    sectors,
  });

  const isBull = signal === 'BULL';
  const isBear = signal === 'BEAR';

  const signalCfg = {
    BULL: {
      border: 'border-terminal-green/50',
      bg: 'from-terminal-green/15 to-terminal-green/5',
      text: 'text-terminal-green',
      label: '⬆ MARKET UP',
      sub: 'Bullish conditions detected',
      barColor: 'bg-terminal-green',
    },
    BEAR: {
      border: 'border-terminal-red/50',
      bg: 'from-terminal-red/15 to-terminal-red/5',
      text: 'text-terminal-red',
      label: '⬇ MARKET DOWN',
      sub: 'Bearish conditions detected',
      barColor: 'bg-terminal-red',
    },
    NEUTRAL: {
      border: 'border-terminal-cyan/30',
      bg: 'from-terminal-cyan/10 to-transparent',
      text: 'text-terminal-cyan',
      label: '→ MIXED / NEUTRAL',
      sub: 'No clear directional bias',
      barColor: 'bg-terminal-cyan',
    },
  }[signal];

  // Score bar: -10..+10 mapped to 0..100%
  const barPct = ((score + 10) / 20) * 100;

  return (
    <div className={`rounded-xl border-2 ${signalCfg.border} bg-gradient-to-br ${signalCfg.bg} p-4`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Big signal */}
        <div className="flex items-center gap-4">
          <div>
            <p className={`text-2xl font-black tracking-tight ${signalCfg.text}`}>
              {loading ? '· · ·' : signalCfg.label}
            </p>
            <p className="text-[11px] text-terminal-text-secondary mt-0.5">{signalCfg.sub}</p>
          </div>

          {/* Score gauge */}
          {!loading && (
            <div className="hidden sm:block">
              <p className="text-[9px] text-terminal-text-secondary uppercase tracking-widest mb-1 text-center">
                Pulse Score
              </p>
              <p className={`text-3xl font-black tabular-nums text-center ${signalCfg.text}`}>
                {score > 0 ? '+' : ''}{score}
              </p>
              <p className="text-[9px] text-terminal-text-secondary text-center">/ ±10</p>
            </div>
          )}
        </div>

        {/* Reasons */}
        {!loading && reasons.length > 0 && (
          <div className="flex flex-col gap-1 flex-1 min-w-0 max-w-lg">
            {reasons.slice(0, 3).map((r, i) => (
              <p key={i} className="text-[11px] text-terminal-text-secondary flex items-center gap-1.5">
                <span className={signalCfg.text}>{'•'}</span>
                {r}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Bullish/Bearish bar */}
      {!loading && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[9px] text-terminal-red font-bold w-8">BEAR</span>
          <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden relative">
            <div
              className={`absolute top-0 h-full rounded-full ${signalCfg.barColor} transition-all duration-700`}
              style={{ width: `${barPct}%` }}
            />
            {/* Midpoint marker */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-terminal-text-secondary/40" />
          </div>
          <span className="text-[9px] text-terminal-green font-bold w-8 text-right">BULL</span>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPx = (p: number) =>
  p >= 1000
    ? `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${p.toFixed(2)}`;

function ChangeChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

function LoadDots() {
  return (
    <div className="flex gap-1">
      {[0,1,2].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full bg-terminal-text-secondary/30 animate-pulse" style={{ animationDelay: `${i*0.2}s` }}/>
      ))}
    </div>
  );
}

// ── Section 1: US Markets ─────────────────────────────────────────────────

const US_MARKETS = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'DIA', label: 'Dow Jones' },
  { symbol: 'IWM', label: 'Russell 2000' },
  { symbol: '^VIX', label: 'VIX', isVix: true },
];

function USMarketsRow({ quotes, loading }: { quotes: Record<string, QuoteSnap>; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {US_MARKETS.map(({ symbol, label, isVix }) => {
        const q = quotes[symbol];
        const pct = q?.changePercent ?? 0;
        const isHigh = isVix && (q?.price ?? 0) > 25;
        const borderCls = isVix
          ? isHigh ? 'border-terminal-red/40' : 'border-terminal-green/30'
          : pct >= 0 ? 'border-terminal-green/25' : 'border-terminal-red/25';
        return (
          <div key={symbol} className={`bg-terminal-card border ${borderCls} rounded-xl p-3 flex flex-col gap-1`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-terminal-text-secondary uppercase tracking-widest">{label}</span>
              {isVix ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isHigh ? 'bg-terminal-red/15 text-terminal-red' : 'bg-terminal-green/15 text-terminal-green'}`}>
                  {isHigh ? 'HIGH FEAR' : 'LOW FEAR'}
                </span>
              ) : null}
            </div>
            {loading && !q ? (
              <LoadDots />
            ) : q ? (
              <>
                <p className="text-xl font-bold tabular-nums text-terminal-text-primary">{fmtPx(q.price)}</p>
                <div className="flex items-center justify-between">
                  <ChangeChip pct={q.changePercent} />
                  <Sparkline change={q.changePercent} w={56} h={22} />
                </div>
              </>
            ) : (
              <p className="text-xs text-terminal-text-secondary/50">—</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Section 2: Sector Heatmap ─────────────────────────────────────────────

function heatColor(pct: number): string {
  if (pct >  2.5) return 'bg-terminal-green text-black border-terminal-green/0';
  if (pct >  1.5) return 'bg-terminal-green/80 text-black border-terminal-green/0';
  if (pct >  0.5) return 'bg-terminal-green/50 text-terminal-green border-terminal-green/30';
  if (pct >  0.1) return 'bg-terminal-green/20 text-terminal-green border-terminal-green/20';
  if (pct > -0.1) return 'bg-terminal-border/30 text-terminal-text-secondary border-terminal-border';
  if (pct > -0.5) return 'bg-terminal-red/20 text-terminal-red border-terminal-red/20';
  if (pct > -1.5) return 'bg-terminal-red/45 text-terminal-red border-terminal-red/30';
  if (pct > -2.5) return 'bg-terminal-red/75 text-white border-terminal-red/0';
  return 'bg-terminal-red text-white border-terminal-red/0';
}

function SectorHeatmap({ quotes, loading }: { quotes: Record<string, QuoteSnap>; loading: boolean }) {
  const winners = SECTORS.filter(s => (quotes[s.symbol]?.changePercent ?? 0) > 0).length;
  const losers = SECTORS.filter(s => (quotes[s.symbol]?.changePercent ?? 0) < 0).length;

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-terminal-purple rounded-full"/>
          <h3 className="text-sm font-semibold text-terminal-text-primary">Sector Performance</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-terminal-green font-semibold">{winners}▲</span>
          <span className="text-terminal-red font-semibold">{losers}▼</span>
          <div className="flex items-center gap-1 text-terminal-text-secondary/60">
            <div className="flex gap-px">
              {['bg-terminal-red','bg-terminal-red/50','bg-terminal-red/20','bg-terminal-green/20','bg-terminal-green/50','bg-terminal-green'].map((c,i) => (
                <div key={i} className={`w-3 h-2 rounded-sm ${c}`}/>
              ))}
            </div>
            <span>↑</span>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
        {SECTORS.map(({ symbol, name, weight }) => {
          const q = quotes[symbol];
          const pct = q?.changePercent ?? 0;
          return (
            <div
              key={symbol}
              title={`${name}: ${q ? fmtPx(q.price) : '—'}`}
              className={`rounded-lg border p-2 text-center cursor-default hover:scale-105 transition-transform ${heatColor(pct)}`}
              style={{ fontSize: weight > 15 ? '11px' : '10px' }}
            >
              <div className="font-bold tracking-tight">{symbol}</div>
              <div className="opacity-90 mt-0.5 font-semibold tabular-nums">
                {loading && !q ? '…' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
              </div>
              <div className="opacity-60 mt-0.5 truncate hidden sm:block" style={{ fontSize: '9px' }}>{name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section 3: Global Markets ─────────────────────────────────────────────

const GLOBAL_REGIONS: { region: string; markets: { symbol: string; name: string; flag: string }[] }[] = [
  {
    region: 'Americas',
    markets: [
      { symbol: 'EWC',  name: 'Canada',      flag: '🇨🇦' },
      { symbol: 'EWZ',  name: 'Brazil',      flag: '🇧🇷' },
      { symbol: 'EWW',  name: 'Mexico',      flag: '🇲🇽' },
    ],
  },
  {
    region: 'Europe',
    markets: [
      { symbol: 'EWG',  name: 'Germany',     flag: '🇩🇪' },
      { symbol: 'EWU',  name: 'UK',          flag: '🇬🇧' },
      { symbol: 'EWQ',  name: 'France',      flag: '🇫🇷' },
      { symbol: 'EWI',  name: 'Italy',       flag: '🇮🇹' },
      { symbol: 'EWP',  name: 'Spain',       flag: '🇪🇸' },
    ],
  },
  {
    region: 'Asia Pacific',
    markets: [
      { symbol: 'EWJ',  name: 'Japan',       flag: '🇯🇵' },
      { symbol: 'FXI',  name: 'China',       flag: '🇨🇳' },
      { symbol: 'EWY',  name: 'Korea',       flag: '🇰🇷' },
      { symbol: 'EWA',  name: 'Australia',   flag: '🇦🇺' },
      { symbol: 'INDA', name: 'India',       flag: '🇮🇳' },
    ],
  },
];

function GlobalMarketsPanel({ quotes, loading }: { quotes: Record<string, QuoteSnap>; loading: boolean }) {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-terminal-cyan rounded-full"/>
        <h3 className="text-sm font-semibold text-terminal-text-primary">Global Markets</h3>
      </div>
      <div className="space-y-3">
        {GLOBAL_REGIONS.map(({ region, markets }) => (
          <div key={region}>
            <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1.5">{region}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {markets.map(({ symbol, name, flag }) => {
                const q = quotes[symbol];
                const pct = q?.changePercent ?? 0;
                const up = pct >= 0;
                return (
                  <div key={symbol} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-terminal-bg border ${up ? 'border-terminal-green/15' : 'border-terminal-red/15'}`}>
                    <span className="text-base">{flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-terminal-text-primary leading-none">{name}</p>
                      <p className="text-[10px] text-terminal-text-secondary">{symbol}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {loading && !q ? <LoadDots /> : q ? (
                        <>
                          <p className="text-xs font-bold tabular-nums text-terminal-text-primary">{fmtPx(q.price)}</p>
                          <ChangeChip pct={q.changePercent} />
                        </>
                      ) : <span className="text-xs text-terminal-text-secondary/40">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section 4: Commodities & Futures ─────────────────────────────────────

const COMMODITIES = [
  { symbol: 'GC=F', name: 'Gold',      unit: '/oz', icon: '🥇' },
  { symbol: 'SI=F', name: 'Silver',    unit: '/oz', icon: '🥈' },
  { symbol: 'CL=F', name: 'WTI Crude', unit: '/bbl',icon: '🛢' },
  { symbol: 'BZ=F', name: 'Brent',     unit: '/bbl',icon: '⛽' },
  { symbol: 'NG=F', name: 'Nat Gas',   unit: '/mbtu',icon:'🔥' },
  { symbol: 'HG=F', name: 'Copper',    unit: '/lb', icon: '🟤' },
];

const INDEX_FUTURES = [
  { symbol: 'ES=F', name: 'S&P 500',   label: 'ES' },
  { symbol: 'NQ=F', name: 'Nasdaq',    label: 'NQ' },
  { symbol: 'YM=F', name: 'Dow',       label: 'YM' },
  { symbol: 'RTY=F',name: 'Russell',   label: 'RTY' },
];

const BONDS = [
  { symbol: 'TLT',  name: '20Y Bond',  label: 'TLT' },
  { symbol: 'HYG',  name: 'High Yield',label: 'HYG' },
];

function CommoditiesPanel({ quotes, loading }: { quotes: Record<string, QuoteSnap>; loading: boolean }) {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-terminal-yellow rounded-full"/>
        <h3 className="text-sm font-semibold text-terminal-text-primary">Commodities & Futures</h3>
      </div>

      {/* Commodities */}
      <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1.5">Spot Commodities</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {COMMODITIES.map(({ symbol, name, unit, icon }) => {
          const q = quotes[symbol];
          const pct = q?.changePercent ?? 0;
          const up = pct >= 0;
          return (
            <div key={symbol} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-terminal-bg border ${up ? 'border-terminal-green/15' : 'border-terminal-red/15'}`}>
              <span className="text-base">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-terminal-text-primary leading-none">{name}</p>
                <p className="text-[10px] text-terminal-text-secondary">{unit}</p>
              </div>
              <div className="text-right shrink-0">
                {loading && !q ? <LoadDots /> : q ? (
                  <>
                    <p className="text-xs font-bold tabular-nums text-terminal-text-primary">{fmtPx(q.price)}</p>
                    <ChangeChip pct={q.changePercent} />
                  </>
                ) : <span className="text-xs text-terminal-text-secondary/40">—</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Index Futures */}
      <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1.5">Index Futures</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {INDEX_FUTURES.map(({ symbol, name, label }) => {
          const q = quotes[symbol];
          const pct = q?.changePercent ?? 0;
          const up = pct >= 0;
          return (
            <div key={symbol} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-terminal-bg border ${up ? 'border-terminal-green/15' : 'border-terminal-red/15'}`}>
              <span className="text-[10px] font-bold text-terminal-cyan w-7">{label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-terminal-text-primary leading-none">{name}</p>
              </div>
              <div className="text-right shrink-0">
                {loading && !q ? <LoadDots /> : q ? (
                  <>
                    <p className="text-xs font-bold tabular-nums text-terminal-text-primary">
                      {q.price >= 1000 ? q.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : q.price.toFixed(2)}
                    </p>
                    <ChangeChip pct={q.changePercent} />
                  </>
                ) : <span className="text-xs text-terminal-text-secondary/40">—</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bonds */}
      <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-1.5">Bonds / Credit</p>
      <div className="grid grid-cols-2 gap-1.5">
        {BONDS.map(({ symbol, name, label }) => {
          const q = quotes[symbol];
          const pct = q?.changePercent ?? 0;
          const up = pct >= 0;
          return (
            <div key={symbol} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-terminal-bg border ${up ? 'border-terminal-green/15' : 'border-terminal-red/15'}`}>
              <span className="text-[10px] font-bold text-terminal-yellow w-7">{label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-terminal-text-primary">{name}</p>
              </div>
              <div className="text-right shrink-0">
                {loading && !q ? <LoadDots /> : q ? (
                  <>
                    <p className="text-xs font-bold tabular-nums text-terminal-text-primary">{fmtPx(q.price)}</p>
                    <ChangeChip pct={q.changePercent} />
                  </>
                ) : <span className="text-xs text-terminal-text-secondary/40">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section 5: Market Breadth ─────────────────────────────────────────────

function MarketBreadth() {
  const { scanResults } = useStore();
  const total = scanResults.length;
  const longs = scanResults.filter(r => r.direction === 'LONG').length;
  const shorts = scanResults.filter(r => r.direction === 'SHORT').length;
  const neutral = total - longs - shorts;
  const longPct = total > 0 ? (longs / total) * 100 : 0;
  const shortPct = total > 0 ? (shorts / total) * 100 : 0;
  const sentiment = longPct > 60 ? 'BULLISH' : shortPct > 60 ? 'BEARISH' : 'MIXED';
  const sentColor = sentiment === 'BULLISH' ? 'text-terminal-green' : sentiment === 'BEARISH' ? 'text-terminal-red' : 'text-terminal-yellow';

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-terminal-green rounded-full"/>
        <h3 className="text-sm font-semibold text-terminal-text-primary">Scan Breadth</h3>
        {total > 0 && <span className={`ml-auto text-xs font-bold ${sentColor}`}>{sentiment}</span>}
      </div>

      {total === 0 ? (
        <p className="text-xs text-terminal-text-secondary text-center py-4">Run a scan to see breadth data</p>
      ) : (
        <>
          {/* Breadth bar */}
          <div className="flex rounded-full overflow-hidden h-3 mb-3 gap-px">
            {longs > 0 && (
              <div className="bg-terminal-green/70 transition-all" style={{ width: `${longPct}%` }} title={`LONG: ${longs}`}/>
            )}
            {neutral > 0 && (
              <div className="bg-terminal-border/60 transition-all" style={{ width: `${(neutral/total)*100}%` }}/>
            )}
            {shorts > 0 && (
              <div className="bg-terminal-red/70 transition-all" style={{ width: `${shortPct}%` }} title={`SHORT: ${shorts}`}/>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Long', count: longs,   pct: longPct,  cls: 'text-terminal-green' },
              { label: 'Neutral', count: neutral, pct: (neutral/total)*100, cls: 'text-terminal-text-secondary' },
              { label: 'Short', count: shorts,  pct: shortPct, cls: 'text-terminal-red' },
            ].map(({ label, count, pct, cls }) => (
              <div key={label}>
                <p className={`text-lg font-bold tabular-nums ${cls}`}>{count}</p>
                <p className="text-[10px] text-terminal-text-secondary">{label}</p>
                <p className={`text-[10px] font-semibold ${cls}`}>{pct.toFixed(0)}%</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Section 6: Top Signals ────────────────────────────────────────────────

function MiniStockCard({ result, onClick }: { result: ScanResult; onClick: () => void }) {
  const isLong = result.direction === 'LONG';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-terminal-bg border ${isLong ? 'border-terminal-green/25' : 'border-terminal-red/25'} rounded-lg p-3 hover:bg-terminal-border/20 transition-all`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-terminal-text-primary">{result.symbol}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red'}`}>
              {result.direction}
            </span>
          </div>
          <p className="text-[10px] text-terminal-text-secondary truncate max-w-[120px]">{result.name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-terminal-text-primary">{formatPrice(result.price)}</p>
          <p className={`text-[11px] tabular-nums ${getChangeColor(result.changePercent)}`}>{formatPercent(result.changePercent)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-terminal-text-secondary">Vol <span className="text-terminal-text-primary">{formatVolume(result.volume)}</span></span>
        <span className={`font-bold ${getStrengthColor(result.strength)}`}>{result.strength}/10</span>
      </div>
      {result.scanTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {result.scanTypes.slice(0, 2).map(t => (
            <span key={t} className="text-[9px] px-1 py-0.5 bg-terminal-border/40 text-terminal-text-secondary rounded">
              {formatScanType(t)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function TopSignals() {
  const { scanResults, setSelectedSymbol, setActiveView } = useStore();
  const top = scanResults.slice().sort((a, b) => b.strength - a.strength).slice(0, 6);
  const topLong = top.filter(r => r.direction === 'LONG').slice(0, 3);
  const topShort = top.filter(r => r.direction === 'SHORT').slice(0, 3);

  const empty = (dir: string) => (
    <div className="bg-terminal-bg border border-terminal-border rounded-lg p-5 text-center">
      <p className="text-xs text-terminal-text-secondary">No {dir.toLowerCase()} signals yet</p>
      <p className="text-[10px] text-terminal-text-secondary/50 mt-0.5">Run a scan to find opportunities</p>
    </div>
  );

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-terminal-cyan rounded-full"/>
        <h3 className="text-sm font-semibold text-terminal-text-primary">Top Signals</h3>
        <span className="ml-auto text-[10px] text-terminal-text-secondary">{scanResults.length} total scanned</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold text-terminal-green uppercase tracking-widest mb-2">▲ Long</p>
          <div className="space-y-2">
            {topLong.length ? topLong.map(r => (
              <MiniStockCard key={r.symbol} result={r} onClick={() => { setSelectedSymbol(r.symbol); setActiveView('ai-analysis'); }}/>
            )) : empty('Long')}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-terminal-red uppercase tracking-widest mb-2">▼ Short</p>
          <div className="space-y-2">
            {topShort.length ? topShort.map(r => (
              <MiniStockCard key={r.symbol} result={r} onClick={() => { setSelectedSymbol(r.symbol); setActiveView('ai-analysis'); }}/>
            )) : empty('Short')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section 7: Stats + Alerts row ─────────────────────────────────────────

function StatsRow() {
  const { scanResults, lastScanTime, alertHistory } = useStore();
  const longs = scanResults.filter(r => r.direction === 'LONG').length;
  const shorts = scanResults.filter(r => r.direction === 'SHORT').length;
  const avgStr = scanResults.length > 0
    ? scanResults.reduce((s, r) => s + r.strength, 0) / scanResults.length
    : 0;

  const items = [
    { label: 'Total Signals', value: scanResults.length, sub: lastScanTime ? `Updated ${timeAgo(lastScanTime)}` : 'No scan yet', color: 'text-terminal-cyan' },
    { label: 'Long',  value: longs,  sub: `${scanResults.length > 0 ? Math.round((longs/scanResults.length)*100) : 0}% bullish`, color: 'text-terminal-green' },
    { label: 'Short', value: shorts, sub: `${scanResults.length > 0 ? Math.round((shorts/scanResults.length)*100) : 0}% bearish`, color: 'text-terminal-red' },
    { label: 'Avg Strength', value: avgStr.toFixed(1), sub: `${alertHistory.length} alerts fired`, color: getStrengthColor(avgStr) },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {items.map(({ label, value, sub, color }) => (
        <div key={label} className="bg-terminal-card border border-terminal-border rounded-xl p-3">
          <p className="text-[10px] text-terminal-text-secondary uppercase tracking-widest">{label}</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
          <p className="text-[10px] text-terminal-text-secondary mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function RecentAlerts() {
  const { alertHistory } = useStore();
  const recent = alertHistory.slice(0, 6);

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-terminal-yellow rounded-full"/>
        <h3 className="text-sm font-semibold text-terminal-text-primary">Recent Alerts</h3>
        <span className="ml-auto text-[10px] text-terminal-text-secondary">{alertHistory.length} total</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-xs text-terminal-text-secondary text-center py-4">No alerts fired yet</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map(item => (
            <div key={item.id} className="flex items-start gap-2 bg-terminal-bg border border-terminal-border rounded-lg px-2.5 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-yellow mt-1.5 shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-terminal-text-primary">{item.symbol}</span>
                  <span className="text-[10px] text-terminal-text-secondary truncate">{item.message}</span>
                </div>
                <p className="text-[10px] text-terminal-text-secondary/60">{timeAgo(item.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── All symbols for batch fetch ────────────────────────────────────────────

const ALL_SYMBOLS = [
  'SPY', 'QQQ', 'DIA', 'IWM', '^VIX',
  ...SECTORS.map(s => s.symbol),
  ...GLOBAL_REGIONS.flatMap(r => r.markets.map(m => m.symbol)),
  ...COMMODITIES.map(c => c.symbol),
  ...INDEX_FUTURES.map(f => f.symbol),
  ...BONDS.map(b => b.symbol),
];

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { quotes, loading, lastUpdate } = useLiveQuotes(ALL_SYMBOLS, 60_000);

  return (
    <div className="space-y-4 max-w-7xl pb-6">

      {/* Live data freshness indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider">
          US Markets
        </h2>
        <div className="flex items-center gap-1.5 text-[10px] text-terminal-text-secondary/60">
          <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-terminal-yellow animate-pulse' : 'bg-terminal-green'}`}/>
          {lastUpdate ? `Live · Updated ${timeAgo(lastUpdate)}` : 'Loading live data…'}
          <span className="text-terminal-text-secondary/40">· auto-refreshes 60s</span>
        </div>
      </div>

      {/* Market Pulse — instant UP/DOWN signal */}
      <MarketPulse quotes={quotes} loading={loading} />

      {/* US Indices */}
      <USMarketsRow quotes={quotes} loading={loading} />

      {/* Sector Heatmap */}
      <SectorHeatmap quotes={quotes} loading={loading} />

      {/* Global + Commodities two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlobalMarketsPanel quotes={quotes} loading={loading} />
        <CommoditiesPanel quotes={quotes} loading={loading} />
      </div>

      {/* Top Signals */}
      <TopSignals />

      {/* Bottom row: Stats + Breadth + Alerts */}
      <div>
        <h2 className="text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-2">
          Scan Summary
        </h2>
        <StatsRow />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketBreadth />
        <RecentAlerts />
      </div>
    </div>
  );
}
