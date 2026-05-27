import { useState, useEffect } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface QuoteSnap {
  symbol: string;
  price: number;
  changePercent: number;
}

const OVERVIEW_SYMBOLS = ['SPY', 'QQQ', 'IWM', '^VIX'];

export default function MarketOverview() {
  const { marketStatus } = useStore();
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({});

  useEffect(() => {
    axios
      .get<{ quotes: QuoteSnap[] }>(`/api/market/quotes?symbols=${OVERVIEW_SYMBOLS.join(',')}`)
      .then(({ data }) => {
        const map: Record<string, QuoteSnap> = {};
        for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q;
        setQuotes(map);
      })
      .catch(() => {});
  }, []);

  const spy = quotes['SPY'];
  const qqq = quotes['QQQ'];
  const iwm = quotes['IWM'];
  const vix = quotes['^VIX'];

  // Fall back to socket-pushed marketStatus while quotes load
  const spyPct = spy?.changePercent ?? marketStatus?.spyChange ?? 0;
  const qqqPct = qqq?.changePercent ?? marketStatus?.qqqChange ?? 0;
  const iwmPct = iwm?.changePercent ?? marketStatus?.iwmChange ?? 0;
  const vixLvl = vix?.price ?? marketStatus?.vixLevel ?? 0;
  const vixPct = vix?.changePercent ?? 0;

  const items = [
    { label: 'SPY',  name: 'S&P 500',       price: spy?.price,  pct: spyPct, isVix: false },
    { label: 'QQQ',  name: 'Nasdaq 100',     price: qqq?.price,  pct: qqqPct, isVix: false },
    { label: 'IWM',  name: 'Russell 2000',   price: iwm?.price,  pct: iwmPct, isVix: false },
    { label: 'VIX',  name: 'Volatility Idx', price: vixLvl || undefined, pct: vixPct, isVix: true },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(({ label, name, price, pct, isVix }) => {
        const up = pct >= 0;
        const fearHigh = isVix && (price ?? 0) > 25;
        const color = isVix ? (fearHigh ? '#f87171' : '#4ade80') : up ? '#4ade80' : '#f87171';
        const textColor = isVix ? (fearHigh ? 'text-terminal-red' : 'text-terminal-green') : up ? 'text-terminal-green' : 'text-terminal-red';
        const border = isVix
          ? fearHigh ? 'border-terminal-red/30' : 'border-terminal-green/30'
          : up ? 'border-terminal-green/25' : 'border-terminal-red/25';

        return (
          <div key={label} className={`bg-terminal-card border ${border} rounded-lg p-4 flex items-center justify-between`}>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-terminal-text-primary">{label}</span>
                <span className="text-xs text-terminal-text-secondary truncate hidden sm:block">{name}</span>
              </div>
              {price != null && (
                <span className="text-lg font-bold tabular-nums text-terminal-text-primary">
                  {price >= 1000 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price.toFixed(2)}
                </span>
              )}
              <div className={`flex items-center gap-1 text-sm font-semibold ${textColor}`}>
                <span>{up ? '▲' : '▼'}</span>
                <span>{Math.abs(pct).toFixed(2)}%</span>
              </div>
            </div>
            {/* Mini line sparkline */}
            <svg viewBox="0 0 64 28" className="w-16 h-7 shrink-0 ml-2" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`mo-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {(() => {
                const pts: number[] = [];
                let cur = 100;
                const seed = Math.abs(pct * 1000) % 997;
                for (let i = 0; i < 24; i++) {
                  const noise = Math.sin(seed * (i + 1) * 0.7) * 0.4;
                  const trend = (pct / 100 / 24) * i * 2;
                  cur += noise + trend;
                  pts.push(cur);
                }
                pts.push(100 + pct * 0.25);
                const minY = Math.min(...pts);
                const maxY = Math.max(...pts);
                const range = maxY - minY || 1;
                const w = 64, h = 28;
                const d = pts.map((y, i) => {
                  const x = (i / (pts.length - 1)) * w;
                  const sy = h - ((y - minY) / range) * h;
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${sy.toFixed(1)}`;
                }).join(' ');
                const areaD = `${d} L${w},${h} L0,${h} Z`;
                return (
                  <>
                    <path d={areaD} fill={`url(#mo-${label})`}/>
                    <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </>
                );
              })()}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
