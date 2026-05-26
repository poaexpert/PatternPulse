import { useState, useEffect } from 'react';
import axios from 'axios';
import type { ChartAnalysis } from '../../types';
import CandlestickChart from '../Chart/CandlestickChart';

interface AnalysisResultsProps {
  analysis: ChartAnalysis;
  timeframe?: string;
}

// ── Correlated side plays ────────────────────────────────────────────────────

interface SidePlay {
  symbol: string;
  name: string;
  relation: string;
  inverse?: boolean;
}

const SIDE_PLAYS: Record<string, SidePlay[]> = {
  'SI=F': [
    { symbol: 'GC=F',  name: 'Gold',          relation: 'Precious metals — same direction' },
    { symbol: 'SIL=F', name: 'Micro Silver',   relation: 'Same trade · 1/5 size' },
    { symbol: 'HG=F',  name: 'Copper',         relation: 'Industrial metals signal' },
    { symbol: 'MGC=F', name: 'Micro Gold',     relation: 'Same direction · smaller' },
  ],
  'GC=F': [
    { symbol: 'SI=F',  name: 'Silver',         relation: 'Amplified precious-metals move' },
    { symbol: 'MGC=F', name: 'Micro Gold',     relation: 'Same trade · 1/10 size' },
    { symbol: 'PL=F',  name: 'Platinum',       relation: 'Precious metals group' },
    { symbol: 'SIL=F', name: 'Micro Silver',   relation: 'Smaller precious metal play' },
  ],
  'MGC=F': [
    { symbol: 'GC=F',  name: 'Full Gold',      relation: 'Same asset, full size' },
    { symbol: 'SI=F',  name: 'Silver',         relation: 'Precious metals companion' },
    { symbol: 'SIL=F', name: 'Micro Silver',   relation: 'Micro precious metals' },
  ],
  'SIL=F': [
    { symbol: 'SI=F',  name: 'Full Silver',    relation: 'Same asset, full size' },
    { symbol: 'GC=F',  name: 'Gold',           relation: 'Leading precious metals indicator' },
    { symbol: 'MGC=F', name: 'Micro Gold',     relation: 'Micro precious metals' },
  ],
  'ES=F': [
    { symbol: 'NQ=F',  name: 'Nasdaq-100',     relation: 'High-beta confirmation' },
    { symbol: 'MES=F', name: 'Micro S&P',      relation: 'Same trade · 1/10 size' },
    { symbol: 'RTY=F', name: 'Russell 2000',   relation: 'Risk-on breadth signal' },
    { symbol: 'VX=F',  name: 'VIX Futures',    relation: 'Fear gauge — inverse', inverse: true },
  ],
  'NQ=F': [
    { symbol: 'ES=F',  name: 'S&P 500',        relation: 'Broad market confirmation' },
    { symbol: 'MNQ=F', name: 'Micro Nasdaq',   relation: 'Same trade · 1/10 size' },
    { symbol: 'RTY=F', name: 'Russell 2000',   relation: 'Risk appetite signal' },
    { symbol: 'VX=F',  name: 'VIX Futures',    relation: 'Fear gauge — inverse', inverse: true },
  ],
  'MES=F': [
    { symbol: 'ES=F',  name: 'Full S&P',       relation: 'Same asset, full size' },
    { symbol: 'MNQ=F', name: 'Micro Nasdaq',   relation: 'Tech-heavy companion' },
  ],
  'MNQ=F': [
    { symbol: 'NQ=F',  name: 'Full Nasdaq',    relation: 'Same asset, full size' },
    { symbol: 'MES=F', name: 'Micro S&P',      relation: 'Broader market companion' },
  ],
  'CL=F': [
    { symbol: 'BZ=F',  name: 'Brent Crude',    relation: 'Global oil benchmark' },
    { symbol: 'QM=F',  name: 'Mini Crude',     relation: 'Same trade · half size' },
    { symbol: 'NG=F',  name: 'Natural Gas',    relation: 'Energy complex' },
  ],
  'NG=F': [
    { symbol: 'CL=F',  name: 'Crude Oil WTI',  relation: 'Energy complex correlation' },
    { symbol: 'BZ=F',  name: 'Brent Crude',    relation: 'Energy complex' },
  ],
  'HG=F': [
    { symbol: 'SI=F',  name: 'Silver',         relation: 'Industrial metals link' },
    { symbol: 'GC=F',  name: 'Gold',           relation: 'Precious/industrial overlap' },
  ],
  'ZN=F': [
    { symbol: 'ZB=F',  name: '30-Year T-Bond', relation: 'Same direction, higher duration' },
    { symbol: 'ZF=F',  name: '5-Year T-Note',  relation: 'Treasury curve play' },
  ],
  'ZB=F': [
    { symbol: 'ZN=F',  name: '10-Year T-Note', relation: 'Treasury companion' },
    { symbol: 'ES=F',  name: 'S&P 500',        relation: 'Rate/equity inverse', inverse: true },
  ],
};

interface QuoteSnap {
  price: number;
  changePercent: number;
}

function SidePlays({ symbol, direction }: { symbol: string; direction: string }) {
  const rootSym = symbol.replace(/[A-Z]\d{2}.*$/, '=F').toUpperCase();
  const plays = SIDE_PLAYS[rootSym] ?? SIDE_PLAYS[symbol] ?? [];
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({});

  useEffect(() => {
    if (plays.length === 0) return;
    plays.forEach(({ symbol: s }) => {
      axios.get<{ quote: QuoteSnap }>(`/api/stock/${encodeURIComponent(s)}/quote`)
        .then(({ data }) => {
          if (data.quote) {
            setQuotes((prev) => ({ ...prev, [s]: data.quote }));
          }
        })
        .catch(() => {});
    });
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (plays.length === 0) return null;

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">
        Related Side Plays
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {plays.map(({ symbol: s, name, relation, inverse }) => {
          const q = quotes[s];
          const confirming = q
            ? inverse
              ? (direction === 'LONG' ? q.changePercent < 0 : q.changePercent > 0)
              : (direction === 'LONG' ? q.changePercent > 0 : q.changePercent < 0)
            : null;
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <div key={s} className={`flex items-center gap-3 rounded-lg px-3 py-2 bg-terminal-bg border ${
              confirming === true ? 'border-terminal-green/25' :
              confirming === false ? 'border-terminal-red/20' :
              'border-terminal-border'
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-terminal-text-primary font-mono">{s.replace('=F', '')}</span>
                  {inverse && <span className="text-[9px] px-1 py-0.5 rounded bg-terminal-red/10 text-terminal-red border border-terminal-red/20">INVERSE</span>}
                  {confirming === true && <span className="text-[9px] text-terminal-green">✓ confirming</span>}
                  {confirming === false && <span className="text-[9px] text-terminal-red/70">✗ diverging</span>}
                </div>
                <p className="text-[10px] text-terminal-text-secondary truncate">{name} — {relation}</p>
              </div>
              <div className="text-right shrink-0">
                {q ? (
                  <>
                    <p className="text-xs font-bold tabular-nums text-terminal-text-primary">
                      {q.price >= 1000 ? `$${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${q.price.toFixed(2)}`}
                    </p>
                    <p className={`text-[10px] tabular-nums ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {up ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                    </p>
                  </>
                ) : (
                  <span className="text-[10px] text-terminal-text-secondary">…</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-terminal-text-secondary/60 mt-2">
        Confirming = moving in same direction as your primary trade{direction !== 'NONE' ? ` (${direction})` : ''}
      </p>
    </div>
  );
}

function SignalStrengthBar({ strength }: { strength: number }) {
  const color =
    strength >= 8 ? 'bg-terminal-green' : strength >= 5 ? 'bg-terminal-yellow' : 'bg-terminal-red';
  const textColor =
    strength >= 8 ? 'text-terminal-green' : strength >= 5 ? 'text-terminal-yellow' : 'text-terminal-red';
  return (
    <div className="flex items-center gap-3">
      <span className={`text-3xl font-bold tabular-nums ${textColor}`}>
        {strength}
        <span className="text-base text-terminal-text-secondary font-normal">/10</span>
      </span>
      <div className="flex gap-1 flex-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`h-3 flex-1 rounded-sm ${i < strength ? color : 'bg-terminal-border'}`} />
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      {title && (
        <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function CompletionBadge({ completion }: { completion: string }) {
  const styles: Record<string, string> = {
    COMPLETE: 'bg-terminal-green/15 text-terminal-green border-terminal-green/30',
    FORMING: 'bg-terminal-yellow/15 text-terminal-yellow border-terminal-yellow/30',
    PARTIAL: 'bg-terminal-cyan/15 text-terminal-cyan border-terminal-cyan/30',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${styles[completion] ?? 'bg-terminal-border text-terminal-text-secondary border-transparent'}`}>
      {completion}
    </span>
  );
}

function ImplicationChip({ implication }: { implication: string }) {
  const styles: Record<string, string> = {
    BULLISH: 'bg-terminal-green/15 text-terminal-green',
    BEARISH: 'bg-terminal-red/15 text-terminal-red',
    NEUTRAL: 'bg-terminal-text-secondary/15 text-terminal-text-secondary',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles[implication] ?? 'bg-terminal-border text-terminal-text-secondary'}`}>
      {implication}
    </span>
  );
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  return price >= 1000
    ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.toFixed(2)}`;
}

function pctFromEntry(price: number | null, entry: number | null): string {
  if (price === null || entry === null || entry === 0) return '';
  const pct = ((price - entry) / entry) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export default function AnalysisResults({ analysis, timeframe = '1d' }: AnalysisResultsProps) {
  const { trend, topBottomSignal, keyLevels, patterns, swingSetup, indicators, signalStrength, summary, warnings, currentPrice, symbol, resolvedSymbol } = analysis;

  const resolvedDiffers = resolvedSymbol && symbol && resolvedSymbol !== symbol;

  /* ── 1. Direction Banner (GO LONG / GO SHORT) ────────────────── */
  const dir = swingSetup.direction;
  const isLong = dir === 'LONG';
  const isShort = dir === 'SHORT';

  const directionBanner = (isLong || isShort) ? (
    <div className={`rounded-xl p-5 border-2 ${isLong
      ? 'bg-gradient-to-r from-terminal-green/25 to-terminal-green/5 border-terminal-green/50'
      : 'bg-gradient-to-r from-terminal-red/25 to-terminal-red/5 border-terminal-red/50'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`text-2xl font-black tracking-tight ${isLong ? 'text-terminal-green' : 'text-terminal-red'}`}>
            {isLong ? '▲ GO LONG' : '▼ GO SHORT'}
          </p>
          <p className="text-terminal-text-secondary text-xs mt-1 leading-relaxed">
            {swingSetup.description}
          </p>
        </div>
        {currentPrice != null && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Price</p>
            <p className="text-2xl font-bold tabular-nums text-terminal-text-primary">{formatPrice(currentPrice)}</p>
          </div>
        )}
      </div>

      {/* Entry / Stop / Target grid */}
      {swingSetup.exists && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: 'Entry', price: swingSetup.entry, cls: 'border-terminal-cyan/30 bg-terminal-cyan/10', tcls: 'text-terminal-cyan' },
            { label: 'Stop Loss', price: swingSetup.stopLoss, cls: 'border-terminal-red/30 bg-terminal-red/10', tcls: 'text-terminal-red' },
            { label: 'Target 1', price: swingSetup.target1, cls: 'border-terminal-green/30 bg-terminal-green/10', tcls: 'text-terminal-green' },
          ].map(({ label, price, cls, tcls }) => (
            <div key={label} className={`rounded-lg p-2.5 text-center border ${cls}`}>
              <p className="text-[10px] text-terminal-text-secondary mb-1">{label}</p>
              <p className={`text-sm font-bold tabular-nums ${tcls}`}>{formatPrice(price)}</p>
              {price !== null && swingSetup.entry !== null && price !== swingSetup.entry && (
                <p className={`text-[10px] mt-0.5 ${tcls}`}>{pctFromEntry(price, swingSetup.entry)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {swingSetup.target2 !== null && (
        <div className="flex items-center gap-2 text-xs mt-2">
          <span className="text-terminal-text-secondary">Target 2:</span>
          <span className="text-terminal-green font-semibold">{formatPrice(swingSetup.target2)}</span>
          <span className="text-terminal-green/70">{pctFromEntry(swingSetup.target2, swingSetup.entry)}</span>
          {swingSetup.riskReward !== null && (
            <span className="ml-auto text-terminal-cyan font-bold">R:R 1:{swingSetup.riskReward.toFixed(1)}</span>
          )}
        </div>
      )}
    </div>
  ) : (
    /* No clear direction — show neutral card with price */
    <div className="rounded-xl p-4 border border-terminal-border bg-terminal-card/50">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-terminal-text-secondary font-semibold text-sm">→ No Clear Direction</p>
          <p className="text-terminal-text-secondary/70 text-xs mt-0.5">Wait for a clearer setup before entering</p>
        </div>
        {currentPrice != null && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Price</p>
            <p className="text-xl font-bold tabular-nums text-terminal-text-primary">{formatPrice(currentPrice)}</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ── 2. Symbol / resolved info ───────────────────────────────── */
  const symbolBadge = resolvedDiffers ? (
    <div className="flex items-center gap-2 text-[11px] text-terminal-text-secondary">
      <span className="font-mono text-terminal-text-primary">{symbol}</span>
      <span>→ resolved to</span>
      <span className="font-mono text-terminal-cyan">{resolvedSymbol}</span>
    </div>
  ) : null;

  /* ── 3. Top/Bottom reversal signal ───────────────────────────── */
  const reversalBanner = topBottomSignal.type !== 'NONE' ? (
    <div className={`rounded-lg p-3 border ${topBottomSignal.type === 'TOP'
      ? 'bg-terminal-red/10 border-terminal-red/30'
      : 'bg-terminal-green/10 border-terminal-green/30'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-bold text-sm ${topBottomSignal.type === 'TOP' ? 'text-terminal-red' : 'text-terminal-green'}`}>
            {topBottomSignal.type === 'TOP' ? '⚠ POTENTIAL TOP' : '📈 POTENTIAL BOTTOM'}
          </p>
          <p className="text-terminal-text-secondary text-xs mt-0.5 leading-relaxed">{topBottomSignal.reasoning}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${
          topBottomSignal.confidence === 'HIGH' ? 'bg-terminal-red/20 text-terminal-red border-terminal-red/40' :
          topBottomSignal.confidence === 'MEDIUM' ? 'bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/40' :
          'bg-terminal-border text-terminal-text-secondary border-transparent'
        }`}>
          {topBottomSignal.confidence}
        </span>
      </div>
    </div>
  ) : null;

  /* ── 4. Trend ─────────────────────────────────────────────────── */
  const directionColor =
    trend.direction === 'UP' ? 'text-terminal-green' :
    trend.direction === 'DOWN' ? 'text-terminal-red' : 'text-terminal-cyan';
  const dirArrow = trend.direction === 'UP' ? '↑' : trend.direction === 'DOWN' ? '↓' : '→';

  const sortedSupport = [...keyLevels.support].sort((a, b) => b - a);
  const sortedResistance = [...keyLevels.resistance].sort((a, b) => a - b);

  return (
    <div className="space-y-3">

      {/* Symbol badge */}
      {symbolBadge}

      {/* 1. GO LONG / GO SHORT direction banner */}
      {directionBanner}

      {/* 2. Candlestick chart */}
      <CandlestickChart
        symbol={resolvedSymbol ?? symbol ?? ''}
        timeframe={timeframe}
        swingSetup={swingSetup}
        height={270}
      />

      {/* 3. Reversal signal (if any) */}
      {reversalBanner}

      {/* 3. Trend */}
      <Card title="Trend">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <span className={`text-3xl font-bold ${directionColor}`}>{dirArrow}</span>
            <p className={`text-xs font-semibold mt-0.5 ${directionColor}`}>{trend.direction}</p>
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-terminal-text-secondary">Strength:</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                trend.strength === 'STRONG' ? 'bg-terminal-green/15 text-terminal-green border-terminal-green/30' :
                trend.strength === 'MODERATE' ? 'bg-terminal-yellow/15 text-terminal-yellow border-terminal-yellow/30' :
                'bg-terminal-border text-terminal-text-secondary border-transparent'
              }`}>{trend.strength}</span>
            </div>
            {trend.structure && (
              <p className="text-xs text-terminal-text-secondary leading-relaxed">{trend.structure}</p>
            )}
          </div>
        </div>
      </Card>

      {/* 4. Key Levels */}
      {(sortedResistance.length > 0 || sortedSupport.length > 0 || keyLevels.keyLevel !== null) && (
        <Card title="Key Levels">
          <div className="grid grid-cols-2 gap-3">
            {sortedResistance.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-terminal-red uppercase tracking-wider mb-2">Resistance</p>
                <div className="space-y-1">
                  {sortedResistance.map((lvl) => (
                    <div key={lvl} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-terminal-red shrink-0" />
                      <span className="text-sm tabular-nums text-terminal-text-primary">{formatPrice(lvl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sortedSupport.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-terminal-green uppercase tracking-wider mb-2">Support</p>
                <div className="space-y-1">
                  {sortedSupport.map((lvl) => (
                    <div key={lvl} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-terminal-green shrink-0" />
                      <span className="text-sm tabular-nums text-terminal-text-primary">{formatPrice(lvl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {keyLevels.keyLevel !== null && (
            <div className="mt-3 pt-3 border-t border-terminal-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-terminal-cyan shrink-0" />
              <span className="text-[10px] text-terminal-text-secondary">50% Fib:</span>
              <span className="text-sm font-bold text-terminal-cyan tabular-nums">{formatPrice(keyLevels.keyLevel)}</span>
            </div>
          )}
        </Card>
      )}

      {/* 5. Patterns */}
      {patterns.length > 0 && (
        <Card title="Chart Patterns">
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2 bg-terminal-bg rounded-lg px-3 py-2">
                <span className="text-sm text-terminal-text-primary font-medium">{p.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CompletionBadge completion={p.completion} />
                  <ImplicationChip implication={p.implication} />
                  {p.target !== null && (
                    <span className="text-[10px] text-terminal-text-secondary">→ {formatPrice(p.target)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 6. Indicators */}
      <Card title="Indicators">
        <div className="space-y-2">
          {[
            { label: 'RSI', value: indicators.rsiSignal, icon: '〜' },
            { label: 'MACD', value: indicators.macdSignal, icon: '⊞' },
            { label: 'Volume', value: indicators.volumeSignal, icon: '▌' },
          ].map(({ label, value, icon }) => {
            const isPositive = value === 'BULLISH' || value === 'OVERSOLD' || value === 'DIVERGENCE_BULLISH' || value === 'SURGE';
            const isNegative = value === 'BEARISH' || value === 'OVERBOUGHT' || value === 'DIVERGENCE_BEARISH' || value === 'DECLINING';
            return (
              <div key={label} className="flex items-center gap-3 bg-terminal-bg rounded-lg px-3 py-2">
                <span className="text-terminal-text-secondary text-sm w-4 text-center">{icon}</span>
                <span className="text-xs font-semibold text-terminal-text-secondary w-14">{label}</span>
                <span className={`text-xs font-medium flex-1 ${isPositive ? 'text-terminal-green' : isNegative ? 'text-terminal-red' : 'text-terminal-text-primary'}`}>
                  {value}
                </span>
              </div>
            );
          })}
          {indicators.summary && (
            <p className="text-[11px] text-terminal-text-secondary leading-relaxed border-t border-terminal-border pt-2 mt-1 font-mono">
              {indicators.summary}
            </p>
          )}
        </div>
      </Card>

      {/* 7. Signal Strength */}
      <Card title="Signal Strength">
        <SignalStrengthBar strength={signalStrength} />
      </Card>

      {/* 8. Warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warnings.map((w, i) => (
            <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-terminal-yellow/10 text-terminal-yellow border border-terminal-yellow/25 flex items-center gap-1.5">
              <span>⚠</span>{w}
            </span>
          ))}
        </div>
      )}

      {/* 9. Side plays */}
      <SidePlays
        symbol={resolvedSymbol ?? symbol ?? ''}
        direction={swingSetup?.direction ?? 'NONE'}
      />

      {/* 10. Summary */}
      {summary && (
        <div className="rounded-lg border border-terminal-cyan/20 bg-terminal-cyan/5 px-4 py-3">
          <p className="text-[10px] font-semibold text-terminal-cyan uppercase tracking-widest mb-2">Summary</p>
          <p className="text-sm text-terminal-text-primary leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
