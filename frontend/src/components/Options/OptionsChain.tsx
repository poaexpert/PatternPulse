import { useState } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
  contractSymbol?: string;
}

interface OptionsData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  expirationDates: number[];
  calls: OptionContract[];
  puts: OptionContract[];
  maxPain: number;
  totalCallOI: number;
  totalPutOI: number;
  putCallRatio: number | null;
}

type Toggle = 'both' | 'calls' | 'puts';

function formatIV(iv: number | undefined): string {
  if (!iv || isNaN(iv)) return '—';
  return `${(iv * 100).toFixed(1)}%`;
}

function formatNum(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n as number)) return '—';
  if (n === 0) return '0';
  if ((n as number) >= 1_000_000) return `${((n as number) / 1_000_000).toFixed(1)}M`;
  if ((n as number) >= 1_000) return `${((n as number) / 1_000).toFixed(0)}K`;
  return String(n);
}

function OptionRow({
  opt,
  currentPrice,
  type,
}: {
  opt: OptionContract;
  currentPrice: number;
  type: 'CALL' | 'PUT';
}) {
  const itm = type === 'CALL' ? opt.strike < currentPrice : opt.strike > currentPrice;
  const isATM = Math.abs(opt.strike - currentPrice) / currentPrice < 0.015;
  const bgClass = isATM
    ? 'bg-terminal-yellow/10 border-b border-terminal-yellow/20'
    : itm
    ? type === 'CALL'
      ? 'bg-terminal-cyan/5'
      : 'bg-terminal-red/5'
    : '';

  return (
    <tr className={`text-xs ${bgClass} hover:bg-terminal-border/20 transition-colors`}>
      {type === 'CALL' && (
        <>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatNum(opt.openInterest)}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatNum(opt.volume)}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatIV(opt.impliedVolatility)}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{opt.bid?.toFixed(2) ?? '—'}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-green font-bold">{opt.lastPrice?.toFixed(2) ?? '—'}</td>
        </>
      )}
      <td className={`px-3 py-1.5 tabular-nums font-black text-center ${isATM ? 'text-terminal-yellow' : 'text-terminal-text-primary'}`}>
        ${opt.strike.toFixed(0)}
        {isATM && <span className="ml-1 text-[9px] text-terminal-yellow font-bold">ATM</span>}
      </td>
      {type === 'PUT' && (
        <>
          <td className="px-3 py-1.5 tabular-nums text-terminal-red font-bold">{opt.lastPrice?.toFixed(2) ?? '—'}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{opt.ask?.toFixed(2) ?? '—'}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatIV(opt.impliedVolatility)}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatNum(opt.volume)}</td>
          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{formatNum(opt.openInterest)}</td>
        </>
      )}
    </tr>
  );
}

export default function OptionsChain() {
  const { selectedSymbol, setSelectedSymbol, setActiveView } = useStore();
  const [inputSymbol, setInputSymbol] = useState(selectedSymbol ?? 'SPY');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OptionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<number | null>(null);
  const [toggle, setToggle] = useState<Toggle>('both');

  const fetchOptions = async (sym?: string) => {
    const s = (sym ?? inputSymbol).trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const url = selectedExpiry
        ? `/api/market/options/${s}?expiration=${selectedExpiry}`
        : `/api/market/options/${s}`;
      const { data: resp } = await axios.get<OptionsData>(url, { timeout: 15000 });
      if (resp.success) {
        setData(resp);
        if (!selectedExpiry && resp.expirationDates.length > 0) {
          setSelectedExpiry(resp.expirationDates[0]);
        }
      } else {
        setError('No options data available for this symbol.');
      }
    } catch {
      setError('Failed to fetch options chain. Yahoo Finance may be unavailable or the symbol does not have options.');
    } finally {
      setLoading(false);
    }
  };

  // Sort both chains by strike
  const calls = (data?.calls ?? []).slice().sort((a, b) => a.strike - b.strike);
  const puts = (data?.puts ?? []).slice().sort((a, b) => a.strike - b.strike);

  // Find strikes near ATM (within ±10%)
  const atmFilter = (c: OptionContract) =>
    data ? Math.abs(c.strike - data.currentPrice) / data.currentPrice < 0.12 : true;

  const visibleCalls = toggle !== 'puts' ? calls.filter(atmFilter) : [];
  const visiblePuts = toggle !== 'calls' ? puts.filter(atmFilter) : [];

  return (
    <div className="max-w-6xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-purple/10 rounded-lg border border-terminal-purple/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Options Chain</h2>
            <p className="text-xs text-terminal-text-secondary">Live options data via Yahoo Finance · ATM ±12% shown</p>
          </div>
        </div>
      </div>

      {/* Symbol input */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Symbol (e.g. SPY, AAPL, QQQ)"
          value={inputSymbol}
          onChange={e => setInputSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && fetchOptions()}
          className="flex-1 min-w-0 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:border-terminal-cyan outline-none"
        />
        <button onClick={() => fetchOptions()} disabled={loading}
          className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${loading ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed' : 'bg-terminal-purple text-white hover:bg-terminal-purple/90 active:scale-95'}`}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              Loading…
            </span>
          ) : 'Load Chain'}
        </button>
      </div>

      {error && <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg p-3 text-sm text-terminal-red">{error}</div>}

      {data && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Current Price', value: `$${data.currentPrice.toFixed(2)}`, color: 'text-terminal-cyan' },
              { label: 'Max Pain', value: `$${data.maxPain.toFixed(2)}`, color: 'text-terminal-yellow' },
              { label: 'Call OI / Put OI', value: `${formatNum(data.totalCallOI)} / ${formatNum(data.totalPutOI)}`, color: 'text-terminal-text-primary' },
              { label: 'P/C Ratio', value: data.putCallRatio !== null ? data.putCallRatio.toFixed(2) : '—', color: (data.putCallRatio ?? 0) > 1.2 ? 'text-terminal-red' : (data.putCallRatio ?? 0) < 0.8 ? 'text-terminal-green' : 'text-terminal-yellow' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-terminal-card border border-terminal-border rounded-xl p-3">
                <p className="text-[10px] text-terminal-text-secondary uppercase tracking-widest">{label}</p>
                <p className={`text-sm font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Expiry picker + toggle */}
          <div className="flex flex-wrap gap-2 items-center">
            {data.expirationDates.slice(0, 8).map(ts => {
              const d = new Date(ts * 1000);
              const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
              return (
                <button key={ts} onClick={() => { setSelectedExpiry(ts); fetchOptions(); }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${selectedExpiry === ts ? 'bg-terminal-purple text-white' : 'bg-terminal-border/40 text-terminal-text-secondary hover:bg-terminal-border/60'}`}>
                  {label}
                </button>
              );
            })}

            <div className="ml-auto flex gap-1 bg-terminal-bg border border-terminal-border rounded-lg p-1">
              {(['calls', 'both', 'puts'] as Toggle[]).map(t => (
                <button key={t} onClick={() => setToggle(t)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${toggle === t ? 'bg-terminal-cyan/15 text-terminal-cyan' : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Chain table */}
          <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-terminal-bg border-b border-terminal-border">
                  <tr>
                    {toggle !== 'puts' && <>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-cyan font-bold uppercase tracking-widest">OI</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-cyan font-bold uppercase tracking-widest">Vol</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-cyan font-bold uppercase tracking-widest">IV</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-cyan font-bold uppercase tracking-widest">Bid</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-cyan font-bold uppercase tracking-widest">Last</th>
                    </>}
                    <th className="px-3 py-2 text-center text-[10px] text-terminal-yellow font-bold uppercase tracking-widest">Strike</th>
                    {toggle !== 'calls' && <>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-red font-bold uppercase tracking-widest">Last</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-red font-bold uppercase tracking-widest">Ask</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-red font-bold uppercase tracking-widest">IV</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-red font-bold uppercase tracking-widest">Vol</th>
                      <th className="px-3 py-2 text-left text-[10px] text-terminal-red font-bold uppercase tracking-widest">OI</th>
                    </>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-terminal-border/20">
                  {/* Render calls and puts side by side by matching strikes */}
                  {(() => {
                    if (toggle === 'calls') {
                      return visibleCalls.map(c => <OptionRow key={c.strike + 'c'} opt={c} currentPrice={data.currentPrice} type="CALL" />);
                    }
                    if (toggle === 'puts') {
                      return visiblePuts.map(p => <OptionRow key={p.strike + 'p'} opt={p} currentPrice={data.currentPrice} type="PUT" />);
                    }
                    // Both: merge strikes
                    const allStrikes = [...new Set([...visibleCalls.map(c=>c.strike), ...visiblePuts.map(p=>p.strike)])].sort((a,b)=>a-b);
                    return allStrikes.map(strike => {
                      const call = visibleCalls.find(c => c.strike === strike);
                      const put = visiblePuts.find(p => p.strike === strike);
                      const isATM = Math.abs(strike - data.currentPrice) / data.currentPrice < 0.015;
                      return (
                        <tr key={strike} className={`text-xs ${isATM ? 'bg-terminal-yellow/10' : ''} hover:bg-terminal-border/20`}>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{call ? formatNum(call.openInterest) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{call ? formatNum(call.volume) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{call ? formatIV(call.impliedVolatility) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{call?.bid?.toFixed(2) ?? '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-green font-bold">{call?.lastPrice?.toFixed(2) ?? '—'}</td>
                          <td className={`px-3 py-1.5 text-center font-black ${isATM ? 'text-terminal-yellow' : 'text-terminal-text-primary'}`}>
                            ${strike.toFixed(0)}{isATM && <span className="ml-1 text-[9px] text-terminal-yellow">ATM</span>}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-red font-bold">{put?.lastPrice?.toFixed(2) ?? '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{put?.ask?.toFixed(2) ?? '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{put ? formatIV(put.impliedVolatility) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{put ? formatNum(put.volume) : '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-terminal-text-secondary">{put ? formatNum(put.openInterest) : '—'}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={() => { setSelectedSymbol(data.symbol); setActiveView('ai-analysis'); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-terminal-cyan text-black hover:bg-terminal-cyan/90 transition-all">
            Open Technical Analysis for {data.symbol}
          </button>
        </div>
      )}

      {!data && !loading && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-12 text-center">
          <svg className="w-16 h-16 text-terminal-text-secondary/20 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <p className="text-sm text-terminal-text-secondary">Enter a symbol to load its options chain</p>
          <p className="text-xs text-terminal-text-secondary/50 mt-1">Works with US stocks and ETFs (SPY, AAPL, QQQ, etc.)</p>
        </div>
      )}
    </div>
  );
}
