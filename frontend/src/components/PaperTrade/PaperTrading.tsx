import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STORAGE_KEY = 'patternpulse-paper-trading';
const STARTING_CASH = 100_000;

interface Position {
  symbol: string;
  shares: number;
  entry: number;
  entryDate: string;
}

interface TradeRecord {
  id: string;
  symbol: string;
  entry: number;
  exit: number;
  shares: number;
  pnl: number;
  date: string;
  direction: 'LONG' | 'SHORT';
}

interface Portfolio {
  cash: number;
  positions: Position[];
  history: TradeRecord[];
}

function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Portfolio;
  } catch { /* ignore */ }
  return { cash: STARTING_CASH, positions: [], history: [] };
}

function savePortfolio(p: Portfolio) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function fmt(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export default function PaperTrading() {
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
  const [tradeSymbol, setTradeSymbol] = useState('');
  const [tradeQty, setTradeQty] = useState(1);
  const [tradeDir, setTradeDir] = useState<'BUY' | 'SELL'>('BUY');
  const [tradePrice, setTradePrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Persist on change
  useEffect(() => { savePortfolio(portfolio); }, [portfolio]);

  // Fetch live prices for open positions
  const fetchPrices = useCallback(async () => {
    const syms = portfolio.positions.map(p => p.symbol);
    if (syms.length === 0) return;
    try {
      const { data } = await axios.get<{ quotes: Array<{ symbol: string; price: number }> }>(
        `/api/market/quotes?symbols=${syms.join(',')}`
      );
      const map: Record<string, number> = {};
      for (const q of data.quotes ?? []) map[q.symbol.toUpperCase()] = q.price;
      setLiveQuotes(map);
    } catch { /* silent */ }
  }, [portfolio.positions]);

  useEffect(() => {
    fetchPrices();
    const t = setInterval(fetchPrices, 30_000);
    return () => clearInterval(t);
  }, [fetchPrices]);

  // Fetch price for trade symbol
  const lookupPrice = async () => {
    if (!tradeSymbol.trim()) return;
    setFetchingPrice(true);
    try {
      const { data } = await axios.get<{ quotes: Array<{ symbol: string; price: number }> }>(
        `/api/market/quotes?symbols=${tradeSymbol.trim().toUpperCase()}`
      );
      const q = data.quotes?.[0];
      if (q) setTradePrice(q.price);
      else setTradePrice(null);
    } catch { setTradePrice(null); } finally { setFetchingPrice(false); }
  };

  const executeTrade = () => {
    if (!tradePrice || !tradeSymbol.trim()) return;
    const sym = tradeSymbol.trim().toUpperCase();
    const qty = Math.max(1, tradeQty);
    const total = qty * tradePrice;
    const newPort = { ...portfolio, positions: [...portfolio.positions], history: [...portfolio.history] };

    if (tradeDir === 'BUY') {
      if (total > newPort.cash) {
        setMsg({ type: 'error', text: `Insufficient cash. Need ${fmt(total)}, have ${fmt(newPort.cash)}` });
        return;
      }
      newPort.cash -= total;
      const existing = newPort.positions.find(p => p.symbol === sym);
      if (existing) {
        // Average up/down
        const newTotal = existing.shares * existing.entry + qty * tradePrice;
        const newShares = existing.shares + qty;
        existing.entry = newTotal / newShares;
        existing.shares = newShares;
      } else {
        newPort.positions.push({ symbol: sym, shares: qty, entry: tradePrice, entryDate: new Date().toISOString() });
      }
      setMsg({ type: 'success', text: `Bought ${qty} × ${sym} @ ${fmt(tradePrice)}` });
    } else {
      const pos = newPort.positions.find(p => p.symbol === sym);
      if (!pos) { setMsg({ type: 'error', text: `No position in ${sym}` }); return; }
      if (qty > pos.shares) { setMsg({ type: 'error', text: `Only ${pos.shares} shares held` }); return; }
      const pnl = (tradePrice - pos.entry) * qty;
      newPort.cash += qty * tradePrice;
      newPort.history.unshift({
        id: Date.now().toString(),
        symbol: sym, entry: pos.entry, exit: tradePrice,
        shares: qty, pnl, date: new Date().toISOString(), direction: 'LONG',
      });
      if (qty >= pos.shares) {
        newPort.positions = newPort.positions.filter(p => p.symbol !== sym);
      } else {
        pos.shares -= qty;
      }
      setMsg({ type: 'success', text: `Sold ${qty} × ${sym} @ ${fmt(tradePrice)} | P&L: ${fmt(pnl)}` });
    }

    setPortfolio(newPort);
    setTradeSymbol('');
    setTradeQty(1);
    setTradePrice(null);
    setTimeout(() => setMsg(null), 4000);
  };

  // Portfolio stats
  const positionsValue = portfolio.positions.reduce((sum, p) => {
    const price = liveQuotes[p.symbol] ?? p.entry;
    return sum + p.shares * price;
  }, 0);
  const totalValue = portfolio.cash + positionsValue;
  const totalPnL = totalValue - STARTING_CASH;
  const returnPct = (totalPnL / STARTING_CASH) * 100;

  // Performance metrics
  const closedTrades = portfolio.history;
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (wins.reduce((s,t)=>s+t.pnl,0)) / Math.abs(losses.reduce((s,t)=>s+t.pnl,0)) : wins.length > 0 ? Infinity : 0;
  const bestTrade = closedTrades.reduce((best, t) => t.pnl > best ? t.pnl : best, -Infinity);
  const worstTrade = closedTrades.reduce((worst, t) => t.pnl < worst ? t.pnl : worst, Infinity);

  const reset = () => {
    if (!confirm('Reset portfolio to $100,000? All trades will be lost.')) return;
    const fresh: Portfolio = { cash: STARTING_CASH, positions: [], history: [] };
    setPortfolio(fresh);
    setLiveQuotes({});
  };

  return (
    <div className="max-w-5xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-green/10 rounded-lg border border-terminal-green/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Paper Trading Portfolio</h2>
            <p className="text-xs text-terminal-text-secondary">Virtual trading · $100k starting capital · localStorage</p>
          </div>
        </div>
        <button onClick={reset} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-terminal-red/10 text-terminal-red border border-terminal-red/20 hover:bg-terminal-red/20 transition-colors">
          Reset Portfolio
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Value', value: fmt(totalValue), color: 'text-terminal-cyan' },
          { label: 'Cash Available', value: fmt(portfolio.cash), color: 'text-terminal-text-primary' },
          { label: 'Total P&L', value: fmt(totalPnL), color: totalPnL >= 0 ? 'text-terminal-green' : 'text-terminal-red' },
          { label: 'Return', value: fmtPct(returnPct), color: returnPct >= 0 ? 'text-terminal-green' : 'text-terminal-red' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-terminal-card border border-terminal-border rounded-xl p-3">
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Performance metrics */}
      {closedTrades.length > 0 && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Performance Statistics</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: 'Total Trades', value: String(closedTrades.length), color: 'text-terminal-cyan' },
              { label: 'Win Rate', value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? 'text-terminal-green' : 'text-terminal-red' },
              { label: 'Avg Win', value: fmt(avgWin), color: 'text-terminal-green' },
              { label: 'Avg Loss', value: fmt(avgLoss), color: 'text-terminal-red' },
              { label: 'Profit Factor', value: isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞', color: profitFactor >= 1.5 ? 'text-terminal-green' : 'text-terminal-yellow' },
              { label: 'Best / Worst', value: `${fmt(bestTrade)} / ${fmt(worstTrade)}`, color: 'text-terminal-text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className="text-[9px] text-terminal-text-secondary uppercase tracking-widest mb-1">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trade Entry */}
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">Execute Trade</p>

          {msg && (
            <div className={`rounded-lg p-2.5 text-xs font-semibold ${msg.type === 'success' ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/20' : 'bg-terminal-red/10 text-terminal-red border border-terminal-red/20'}`}>
              {msg.text}
            </div>
          )}

          <div className="flex gap-1 bg-terminal-bg rounded-lg p-1">
            {(['BUY', 'SELL'] as const).map(d => (
              <button key={d} onClick={() => setTradeDir(d)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${tradeDir === d ? (d === 'BUY' ? 'bg-terminal-green text-black' : 'bg-terminal-red text-white') : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}>
                {d}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input type="text" placeholder="Symbol (e.g. SI=F)" value={tradeSymbol}
              onChange={e => { setTradeSymbol(e.target.value.toUpperCase()); setTradePrice(null); }}
              className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/50 outline-none focus:border-terminal-cyan" />
            <button onClick={lookupPrice} disabled={fetchingPrice || !tradeSymbol.trim()}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20 hover:bg-terminal-cyan/20 transition-colors disabled:opacity-50">
              {fetchingPrice ? '…' : 'Quote'}
            </button>
          </div>

          {tradePrice !== null && (
            <div className="flex items-center gap-2 px-3 py-2 bg-terminal-bg border border-terminal-green/20 rounded-lg">
              <span className="text-xs text-terminal-text-secondary">Live Price:</span>
              <span className="text-sm font-bold text-terminal-green tabular-nums">${tradePrice.toFixed(4)}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-terminal-text-secondary w-16 shrink-0">Quantity</label>
            <input type="number" value={tradeQty} min={1} step={1}
              onChange={e => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary outline-none focus:border-terminal-cyan" />
          </div>

          {tradePrice !== null && (
            <p className="text-xs text-terminal-text-secondary">
              Trade value: <span className="text-terminal-text-primary font-bold">${(tradePrice * tradeQty).toFixed(2)}</span>
            </p>
          )}

          <button onClick={executeTrade} disabled={!tradePrice || !tradeSymbol.trim()}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${!tradePrice ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed' : tradeDir === 'BUY' ? 'bg-terminal-green text-black hover:bg-terminal-green/90' : 'bg-terminal-red text-white hover:bg-terminal-red/90'}`}>
            Execute {tradeDir}
          </button>
        </div>

        {/* Open Positions */}
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Open Positions ({portfolio.positions.length})</p>
          {portfolio.positions.length === 0 ? (
            <p className="text-xs text-terminal-text-secondary text-center py-6">No open positions</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-64">
              {portfolio.positions.map(pos => {
                const current = liveQuotes[pos.symbol] ?? pos.entry;
                const pnl = (current - pos.entry) * pos.shares;
                const pnlPct = ((current - pos.entry) / pos.entry) * 100;
                return (
                  <div key={pos.symbol} className="flex items-center gap-2 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2">
                    <span className="text-xs font-bold text-terminal-text-primary w-14 shrink-0">{pos.symbol}</span>
                    <div className="flex-1 min-w-0 text-xs text-terminal-text-secondary">
                      {pos.shares} × ${pos.entry.toFixed(2)}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-terminal-text-primary tabular-nums">${current.toFixed(2)}</p>
                      <p className={`text-[10px] font-bold tabular-nums ${pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                        {pnl >= 0 ? '+' : ''}{fmt(pnl)} ({fmtPct(pnlPct)})
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trade History */}
      {portfolio.history.length > 0 && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-terminal-border">
            <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">Trade History</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-terminal-bg">
                <tr className="border-b border-terminal-border">
                  {['Symbol', 'Shares', 'Entry', 'Exit', 'P&L', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-terminal-text-secondary font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border/30">
                {portfolio.history.slice(0, 20).map(t => (
                  <tr key={t.id} className="hover:bg-terminal-border/20 transition-colors">
                    <td className="px-4 py-2 font-bold text-terminal-text-primary">{t.symbol}</td>
                    <td className="px-4 py-2 tabular-nums text-terminal-text-secondary">{t.shares}</td>
                    <td className="px-4 py-2 tabular-nums text-terminal-text-secondary">${t.entry.toFixed(2)}</td>
                    <td className="px-4 py-2 tabular-nums text-terminal-text-secondary">${t.exit.toFixed(2)}</td>
                    <td className={`px-4 py-2 tabular-nums font-bold ${t.pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}
                    </td>
                    <td className="px-4 py-2 text-terminal-text-secondary/60">
                      {new Date(t.date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
