import { useState } from 'react';

type Tab = 'sizer' | 'rr' | 'kelly';

const FUTURES_MULTIPLIERS: Record<string, { name: string; multiplier: number }> = {
  'ES=F':  { name: 'E-mini S&P 500', multiplier: 50 },
  'NQ=F':  { name: 'E-mini Nasdaq', multiplier: 20 },
  'YM=F':  { name: 'E-mini Dow', multiplier: 5 },
  'RTY=F': { name: 'E-mini Russell', multiplier: 10 },
  'MES=F': { name: 'Micro S&P 500', multiplier: 5 },
  'MNQ=F': { name: 'Micro Nasdaq', multiplier: 2 },
  'SI=F':  { name: 'Silver', multiplier: 5000 },
  'GC=F':  { name: 'Gold', multiplier: 100 },
  'CL=F':  { name: 'WTI Crude Oil', multiplier: 1000 },
};

function InputRow({ label, value, onChange, prefix = '', suffix = '', step = 1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">{label}</label>
      <div className="flex items-center bg-terminal-bg border border-terminal-border rounded-lg overflow-hidden">
        {prefix && <span className="px-2.5 text-terminal-text-secondary text-sm">{prefix}</span>}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent text-terminal-text-primary text-sm px-2.5 py-2 outline-none tabular-nums"
        />
        {suffix && <span className="px-2.5 text-terminal-text-secondary text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultRow({ label, value, color = 'text-terminal-text-primary', big = false }: {
  label: string; value: string; color?: string; big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-terminal-border/40 last:border-0">
      <span className="text-xs text-terminal-text-secondary">{label}</span>
      <span className={`font-bold tabular-nums ${color} ${big ? 'text-base' : 'text-sm'}`}>{value}</span>
    </div>
  );
}

function PositionSizer() {
  const [account, setAccount] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(98);
  const [target, setTarget] = useState(104);
  const [isFutures, setIsFutures] = useState(false);
  const [futuresSymbol, setFuturesSymbol] = useState('ES=F');

  const dollarRisk = account * (riskPct / 100);
  const stopDist = Math.abs(entry - stop);
  const futInfo = FUTURES_MULTIPLIERS[futuresSymbol];
  const contractValue = entry * (futInfo?.multiplier ?? 1);
  const dollarPerContract = stopDist * (futInfo?.multiplier ?? 1);

  const shares = stopDist > 0 ? Math.floor(dollarRisk / stopDist) : 0;
  const contracts = dollarPerContract > 0 ? Math.floor(dollarRisk / dollarPerContract) : 0;
  const positionValue = isFutures ? contracts * contractValue : shares * entry;
  const pctOfAccount = account > 0 ? (positionValue / account) * 100 : 0;
  const targetDist = Math.abs(target - entry);
  const rrRatio = stopDist > 0 ? targetDist / stopDist : 0;
  const breakEvenWinRate = rrRatio > 0 ? 100 / (1 + rrRatio) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Inputs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setIsFutures(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!isFutures ? 'bg-terminal-cyan text-black' : 'bg-terminal-border/40 text-terminal-text-secondary hover:bg-terminal-border/60'}`}>Stocks / ETFs</button>
          <button onClick={() => setIsFutures(true)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isFutures ? 'bg-terminal-cyan text-black' : 'bg-terminal-border/40 text-terminal-text-secondary hover:bg-terminal-border/60'}`}>Futures</button>
        </div>

        {isFutures && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">Contract</label>
            <select value={futuresSymbol} onChange={e => setFuturesSymbol(e.target.value)}
              className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary outline-none focus:border-terminal-cyan">
              {Object.entries(FUTURES_MULTIPLIERS).map(([sym, info]) => (
                <option key={sym} value={sym}>{sym} — {info.name}</option>
              ))}
            </select>
          </div>
        )}

        <InputRow label="Account Size" value={account} onChange={setAccount} prefix="$" step={1000} />

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">Risk % — {riskPct}%</label>
          <input type="range" min={0.25} max={5} step={0.25} value={riskPct} onChange={e => setRiskPct(parseFloat(e.target.value))}
            className="w-full accent-terminal-cyan" />
          <div className="flex justify-between text-[10px] text-terminal-text-secondary/50">
            <span>0.25%</span><span>2.5%</span><span>5%</span>
          </div>
        </div>

        <InputRow label="Entry Price" value={entry} onChange={setEntry} prefix="$" step={0.01} min={0.01} />
        <InputRow label="Stop Loss" value={stop} onChange={setStop} prefix="$" step={0.01} min={0.01} />
        <InputRow label="Price Target" value={target} onChange={setTarget} prefix="$" step={0.01} min={0.01} />
      </div>

      {/* Results */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl p-4 space-y-0">
        <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Calculation Results</p>

        <ResultRow label="Dollar Risk" value={`$${dollarRisk.toFixed(2)}`} color="text-terminal-red" />
        {isFutures ? (
          <>
            <ResultRow label="Contracts" value={`${contracts}`} color="text-terminal-cyan" big />
            <ResultRow label="Contract Size" value={`${futInfo?.multiplier ?? '—'} × $${entry.toFixed(2)}`} />
            <ResultRow label="Position Value" value={`$${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </>
        ) : (
          <>
            <ResultRow label="Shares" value={`${shares.toLocaleString()}`} color="text-terminal-cyan" big />
            <ResultRow label="Position Value" value={`$${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </>
        )}
        <ResultRow label="% of Account" value={`${pctOfAccount.toFixed(1)}%`} color={pctOfAccount > 20 ? 'text-terminal-red' : pctOfAccount > 10 ? 'text-terminal-yellow' : 'text-terminal-green'} />

        <div className="pt-2 mt-2 border-t border-terminal-border/40">
          <ResultRow label="Stop Distance" value={`$${stopDist.toFixed(2)} (${entry > 0 ? ((stopDist / entry) * 100).toFixed(1) : 0}%)`} />
          <ResultRow label="R:R Ratio" value={`1 : ${rrRatio.toFixed(2)}`} color={rrRatio >= 2 ? 'text-terminal-green' : rrRatio >= 1.5 ? 'text-terminal-yellow' : 'text-terminal-red'} />
          <ResultRow label="Break-even Win Rate" value={`${breakEvenWinRate.toFixed(1)}%`} />
        </div>

        {/* Quick visual R:R bar */}
        <div className="mt-4">
          <p className="text-[10px] text-terminal-text-secondary mb-2">Risk vs Reward</p>
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            <div className="bg-terminal-red/60 transition-all" style={{ width: `${Math.min(50, 100 / (1 + rrRatio))}%` }} title="Risk" />
            <div className="bg-terminal-green/60 transition-all" style={{ width: `${Math.min(80, rrRatio / (1 + rrRatio) * 100)}%` }} title="Reward" />
          </div>
          <div className="flex justify-between text-[10px] text-terminal-text-secondary mt-1">
            <span className="text-terminal-red">Risk 1R</span>
            <span className="text-terminal-green">Reward {rrRatio.toFixed(1)}R</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RRVisualizer() {
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(98);
  const [target, setTarget] = useState(106);

  const riskDist = Math.abs(entry - stop);
  const rewardDist = Math.abs(target - entry);
  const rrRatio = riskDist > 0 ? rewardDist / riskDist : 0;
  const breakEven = rrRatio > 0 ? 100 / (1 + rrRatio) : 0;

  const isLong = target > entry;
  const allPrices = [stop, entry, target].sort((a, b) => b - a);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;

  const toY = (p: number) => ((maxP - p) / range) * 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <InputRow label="Entry" value={entry} onChange={setEntry} prefix="$" step={0.01} />
        <InputRow label="Stop Loss" value={stop} onChange={setStop} prefix="$" step={0.01} />
        <InputRow label="Target" value={target} onChange={setTarget} prefix="$" step={0.01} />
      </div>

      {/* Visual price ruler */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl p-6 flex gap-6 items-stretch">
        {/* Price ruler */}
        <div className="relative flex-1" style={{ minHeight: 200 }}>
          {[stop, entry, target].map(p => {
            const y = toY(p);
            const isEntry = p === entry;
            const isStop = p === stop;
            const color = isEntry ? '#fbbf24' : isStop ? '#f87171' : '#4ade80';
            const label = isEntry ? 'ENTRY' : isStop ? 'STOP' : 'TARGET';
            return (
              <div key={p} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${y}%`, transform: 'translateY(-50%)' }}>
                <div className="w-full h-px" style={{ background: color }} />
                <span className="text-[10px] font-bold whitespace-nowrap" style={{ color }}>{label} ${p.toFixed(2)}</span>
              </div>
            );
          })}

          {/* Shaded zones */}
          <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
            {isLong ? (
              <>
                <div className="absolute left-0 right-12 bg-terminal-green/10"
                  style={{ top: `${toY(target)}%`, bottom: `${100 - toY(entry)}%` }} />
                <div className="absolute left-0 right-12 bg-terminal-red/10"
                  style={{ top: `${toY(entry)}%`, bottom: `${100 - toY(stop)}%` }} />
              </>
            ) : (
              <>
                <div className="absolute left-0 right-12 bg-terminal-green/10"
                  style={{ top: `${toY(entry)}%`, bottom: `${100 - toY(target)}%` }} />
                <div className="absolute left-0 right-12 bg-terminal-red/10"
                  style={{ top: `${toY(stop)}%`, bottom: `${100 - toY(entry)}%` }} />
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="w-36 space-y-3 shrink-0">
          <div>
            <p className="text-[10px] text-terminal-text-secondary">R:R Ratio</p>
            <p className={`text-2xl font-black tabular-nums ${rrRatio >= 2 ? 'text-terminal-green' : rrRatio >= 1.5 ? 'text-terminal-yellow' : 'text-terminal-red'}`}>
              1:{rrRatio.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-terminal-text-secondary">Break-even Win%</p>
            <p className="text-lg font-bold text-terminal-text-primary tabular-nums">{breakEven.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-terminal-text-secondary">Risk</p>
            <p className="text-sm font-bold text-terminal-red tabular-nums">${riskDist.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-terminal-text-secondary">Reward</p>
            <p className="text-sm font-bold text-terminal-green tabular-nums">${rewardDist.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KellyCriterion() {
  const [winRate, setWinRate] = useState(55);
  const [avgWinLoss, setAvgWinLoss] = useState(1.5);

  const p = winRate / 100;
  const q = 1 - p;
  const b = avgWinLoss;

  const kelly = b > 0 ? ((b * p - q) / b) * 100 : 0;
  const halfKelly = kelly / 2;
  const quarterKelly = kelly / 4;

  const expectancy = p * b - q;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest">Win Rate — {winRate}%</label>
            <input type="range" min={20} max={80} step={1} value={winRate} onChange={e => setWinRate(Number(e.target.value))}
              className="w-full accent-terminal-cyan" />
            <div className="flex justify-between text-[10px] text-terminal-text-secondary/50">
              <span>20%</span><span>50%</span><span>80%</span>
            </div>
          </div>

          <InputRow label="Avg Win / Avg Loss Ratio" value={avgWinLoss} onChange={setAvgWinLoss} step={0.1} min={0.1} />
        </div>

        <div className="bg-terminal-bg border border-terminal-border rounded-xl p-4 space-y-0">
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-3">Kelly Results</p>

          <div className="space-y-3">
            {[
              { label: 'Full Kelly %', value: kelly, sub: 'Theoretical maximum (aggressive)' },
              { label: 'Half Kelly %', value: halfKelly, sub: 'Recommended for most traders' },
              { label: 'Quarter Kelly %', value: quarterKelly, sub: 'Conservative, low drawdown' },
            ].map(({ label, value, sub }) => (
              <div key={label} className={`p-3 rounded-lg ${value <= 0 ? 'bg-terminal-red/10 border border-terminal-red/20' : 'bg-terminal-green/5 border border-terminal-green/10'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-terminal-text-primary">{label}</p>
                  <p className={`text-lg font-black tabular-nums ${value <= 0 ? 'text-terminal-red' : 'text-terminal-green'}`}>
                    {value <= 0 ? 'No Edge' : `${Math.max(0, value).toFixed(1)}%`}
                  </p>
                </div>
                <p className="text-[10px] text-terminal-text-secondary mt-0.5">{sub}</p>
              </div>
            ))}

            <div className="pt-2 border-t border-terminal-border/40">
              <div className="flex items-center justify-between">
                <p className="text-xs text-terminal-text-secondary">Expectancy per $1 risk</p>
                <p className={`text-sm font-bold tabular-nums ${expectancy > 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  ${expectancy.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {kelly > 0 && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
          <p className="text-[10px] font-bold text-terminal-text-secondary uppercase tracking-widest mb-2">Interpretation</p>
          <p className="text-sm text-terminal-text-primary">
            {kelly > 25
              ? 'Full Kelly suggests a very large position, but is rarely used in practice. Use Half or Quarter Kelly to reduce variance.'
              : kelly > 10
              ? 'This setup has a meaningful edge. Half Kelly of ' + halfKelly.toFixed(1) + '% per trade is a reasonable allocation.'
              : 'Edge is modest. Use Quarter Kelly of ' + quarterKelly.toFixed(1) + '% per trade to preserve capital.'}
          </p>
        </div>
      )}

      {kelly <= 0 && (
        <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-xl p-4">
          <p className="text-sm text-terminal-red font-semibold">No Statistical Edge</p>
          <p className="text-xs text-terminal-text-secondary mt-1">
            With {winRate}% win rate and {avgWinLoss}:1 reward ratio, this setup has negative expectancy. Kelly recommends no position.
          </p>
        </div>
      )}
    </div>
  );
}

export default function RiskCalculator() {
  const [tab, setTab] = useState<Tab>('sizer');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sizer', label: 'Position Sizer' },
    { id: 'rr', label: 'R:R Visualizer' },
    { id: 'kelly', label: 'Kelly Criterion' },
  ];

  return (
    <div className="max-w-4xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-terminal-yellow/10 rounded-lg border border-terminal-yellow/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-terminal-yellow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              <path d="M7 7h10M7 11h4"/>
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Risk Calculator</h2>
            <p className="text-xs text-terminal-text-secondary">Professional position sizing, R:R analysis & Kelly criterion</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-terminal-card border border-terminal-border rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/20' : 'text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-border/30'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        {tab === 'sizer' && <PositionSizer />}
        {tab === 'rr' && <RRVisualizer />}
        {tab === 'kelly' && <KellyCriterion />}
      </div>
    </div>
  );
}
