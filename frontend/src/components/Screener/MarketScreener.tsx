import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

const SCREEN_SYMBOLS = [
  // ETFs
  { symbol: 'SPY',  name: 'S&P 500 ETF' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF' },
  { symbol: 'IWM',  name: 'Russell 2000 ETF' },
  { symbol: 'GLD',  name: 'Gold ETF' },
  { symbol: 'SLV',  name: 'Silver ETF' },
  { symbol: 'GDX',  name: 'Gold Miners ETF' },
  // Sector ETFs
  { symbol: 'XLK',  name: 'Technology' },
  { symbol: 'XLF',  name: 'Financials' },
  { symbol: 'XLV',  name: 'Healthcare' },
  { symbol: 'XLY',  name: 'Consumer Disc' },
  { symbol: 'XLC',  name: 'Comm Services' },
  { symbol: 'XLI',  name: 'Industrials' },
  { symbol: 'XLP',  name: 'Staples' },
  { symbol: 'XLE',  name: 'Energy' },
  { symbol: 'XLB',  name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLU',  name: 'Utilities' },
  // Futures
  { symbol: 'SI=F', name: 'Silver Futures' },
  { symbol: 'GC=F', name: 'Gold Futures' },
  { symbol: 'ES=F', name: 'S&P 500 Fut' },
  { symbol: 'NQ=F', name: 'Nasdaq Fut' },
  { symbol: 'CL=F', name: 'WTI Crude' },
  // Mega caps
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'GOOG', name: 'Alphabet' },
];

const NAME_MAP: Record<string, string> = Object.fromEntries(SCREEN_SYMBOLS.map(s => [s.symbol, s.name]));

interface QuoteRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume';
type SortDir = 'asc' | 'desc';

export default function MarketScreener() {
  const { setSelectedSymbol, setActiveView } = useStore();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Filters
  const [filterChangePctMin, setFilterChangePctMin] = useState('');
  const [filterChangePctMax, setFilterChangePctMax] = useState('');
  const [filterPriceMin, setFilterPriceMin] = useState('');
  const [filterPriceMax, setFilterPriceMax] = useState('');
  const [filterDir, setFilterDir] = useState<'any' | 'up' | 'down'>('any');
  const [filterVolumeMin, setFilterVolumeMin] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchAll = useCallback(async () => {
    try {
      const syms = SCREEN_SYMBOLS.map(s => s.symbol);
      const { data } = await axios.get<{ quotes: QuoteRow[] }>(`/api/market/quotes?symbols=${syms.join(',')}`);
      const rows = (data.quotes ?? []).map(q => ({
        ...q,
        name: NAME_MAP[q.symbol.toUpperCase()] ?? q.name ?? q.symbol,
      }));
      setQuotes(rows);
      setLastUpdate(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 60_000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const pctMinN = filterChangePctMin ? parseFloat(filterChangePctMin) : -Infinity;
  const pctMaxN = filterChangePctMax ? parseFloat(filterChangePctMax) : Infinity;
  const priceMinN = filterPriceMin ? parseFloat(filterPriceMin) : -Infinity;
  const priceMaxN = filterPriceMax ? parseFloat(filterPriceMax) : Infinity;
  const volMinN = filterVolumeMin ? parseFloat(filterVolumeMin) : -Infinity;

  const filtered = quotes.filter(q => {
    if (q.changePercent < pctMinN || q.changePercent > pctMaxN) return false;
    if (q.price < priceMinN || q.price > priceMaxN) return false;
    if (filterDir === 'up' && q.changePercent <= 0) return false;
    if (filterDir === 'down' && q.changePercent >= 0) return false;
    if (q.volume < volMinN) return false;
    return true;
  }).sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-terminal-text-secondary/30">↕</span>;
    return <span className="text-terminal-cyan">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const fmtVol = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div className="max-w-5xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-cyan/10 rounded-lg border border-terminal-cyan/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Market Screener</h2>
            <p className="text-xs text-terminal-text-secondary">{SCREEN_SYMBOLS.length} symbols · Sector ETFs, Futures & Mega caps</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-terminal-text-secondary/60">
          <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-terminal-yellow animate-pulse' : 'bg-terminal-green'}`}/>
          {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Loading…'}
          <button onClick={fetchAll} className="text-terminal-cyan hover:underline ml-1">Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Filters</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] text-terminal-text-secondary">Change % Range</label>
            <div className="flex gap-1.5 items-center">
              <input type="number" placeholder="-5" value={filterChangePctMin} onChange={e => setFilterChangePctMin(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan" />
              <span className="text-terminal-text-secondary text-xs">to</span>
              <input type="number" placeholder="+5" value={filterChangePctMax} onChange={e => setFilterChangePctMax(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan" />
            </div>
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] text-terminal-text-secondary">Price Range ($)</label>
            <div className="flex gap-1.5 items-center">
              <input type="number" placeholder="0" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan" />
              <span className="text-terminal-text-secondary text-xs">to</span>
              <input type="number" placeholder="∞" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-terminal-text-secondary">Direction</label>
            <select value={filterDir} onChange={e => setFilterDir(e.target.value as 'any' | 'up' | 'down')}
              className="bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan">
              <option value="any">Any</option>
              <option value="up">Up only</option>
              <option value="down">Down only</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-terminal-text-secondary">Min Volume</label>
            <input type="number" placeholder="0" value={filterVolumeMin} onChange={e => setFilterVolumeMin(e.target.value)}
              className="bg-terminal-bg border border-terminal-border rounded-lg px-2 py-1.5 text-xs text-terminal-text-primary outline-none focus:border-terminal-cyan" />
          </div>
        </div>

        <p className="text-[10px] text-terminal-text-secondary mt-2">{filtered.length} of {quotes.length} symbols match filters</p>
      </div>

      {/* Results table */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-terminal-bg border-b border-terminal-border">
              <tr>
                {[
                  { key: 'symbol' as SortKey, label: 'Symbol' },
                  { key: null, label: 'Name' },
                  { key: 'price' as SortKey, label: 'Price' },
                  { key: 'changePercent' as SortKey, label: 'Change %' },
                  { key: 'volume' as SortKey, label: 'Volume' },
                  { key: null, label: 'Direction' },
                ].map(({ key, label }) => (
                  <th key={label}
                    onClick={() => key && changeSort(key)}
                    className={`px-4 py-2.5 text-left text-terminal-text-secondary font-semibold whitespace-nowrap ${key ? 'cursor-pointer hover:text-terminal-text-primary' : ''}`}>
                    {label} {key && <SortIcon k={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/30">
              {filtered.map(q => {
                const isUp = q.changePercent >= 0;
                return (
                  <tr key={q.symbol}
                    onClick={() => { setSelectedSymbol(q.symbol); setActiveView('ai-analysis'); }}
                    className="cursor-pointer hover:bg-terminal-border/20 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-terminal-text-primary">{q.symbol}</td>
                    <td className="px-4 py-2.5 text-terminal-text-secondary max-w-[150px] truncate">{q.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-terminal-text-primary font-semibold">
                      {q.price >= 1000
                        ? `$${q.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : `$${q.price.toFixed(2)}`}
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums font-bold ${isUp ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {isUp ? '+' : ''}{q.changePercent.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-terminal-text-secondary">{fmtVol(q.volume)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isUp ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red'}`}>
                        {isUp ? '▲ UP' : '▼ DOWN'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-terminal-text-secondary">No symbols match the current filters</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs text-terminal-text-secondary">
                      <div className="w-3 h-3 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin"/>
                      Loading market data…
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
