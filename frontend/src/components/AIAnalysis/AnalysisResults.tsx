import type { ChartAnalysis } from '../../types';

interface AnalysisResultsProps {
  analysis: ChartAnalysis;
  imagePreview?: string;
}

function SignalStrengthBar({ strength }: { strength: number }) {
  const segments = 10;
  const color =
    strength >= 8
      ? 'bg-terminal-green'
      : strength >= 5
      ? 'bg-terminal-yellow'
      : 'bg-terminal-red';
  const textColor =
    strength >= 8
      ? 'text-terminal-green'
      : strength >= 5
      ? 'text-terminal-yellow'
      : 'text-terminal-red';

  return (
    <div className="flex items-center gap-3">
      <span className={`text-3xl font-bold tabular-nums ${textColor}`}>
        {strength}
        <span className="text-base text-terminal-text-secondary font-normal">/10</span>
      </span>
      <div className="flex gap-1 flex-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-3 flex-1 rounded-sm transition-colors ${
              i < strength ? color : 'bg-terminal-border'
            }`}
          />
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
  const styles = {
    COMPLETE: 'bg-terminal-green/15 text-terminal-green border-terminal-green/30',
    FORMING: 'bg-terminal-yellow/15 text-terminal-yellow border-terminal-yellow/30',
    PARTIAL: 'bg-terminal-cyan/15 text-terminal-cyan border-terminal-cyan/30',
  };
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
        styles[completion as keyof typeof styles] ?? 'bg-terminal-border text-terminal-text-secondary border-transparent'
      }`}
    >
      {completion}
    </span>
  );
}

function ImplicationChip({ implication }: { implication: string }) {
  const styles = {
    BULLISH: 'bg-terminal-green/15 text-terminal-green',
    BEARISH: 'bg-terminal-red/15 text-terminal-red',
    NEUTRAL: 'bg-terminal-text-secondary/15 text-terminal-text-secondary',
  };
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        styles[implication as keyof typeof styles] ?? 'bg-terminal-border text-terminal-text-secondary'
      }`}
    >
      {implication}
    </span>
  );
}

function formatPrice(price: number | null): string {
  if (price === null) return '—';
  return price >= 1000
    ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.toFixed(2)}`;
}

function pctFromEntry(price: number | null, entry: number | null): string {
  if (price === null || entry === null || entry === 0) return '';
  const pct = ((price - entry) / entry) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export default function AnalysisResults({ analysis }: AnalysisResultsProps) {
  const { trend, topBottomSignal, keyLevels, patterns, swingSetup, indicators, signalStrength, summary, warnings } = analysis;

  /* ── 1. Top/Bottom Signal Banner ─────────────────────────── */
  const bannerContent = () => {
    if (topBottomSignal.type === 'TOP') {
      return (
        <div className="rounded-lg p-4 bg-gradient-to-r from-terminal-red/20 to-terminal-red/5 border border-terminal-red/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-terminal-red font-bold text-base">⚠️ POTENTIAL TOP DETECTED</p>
              <p className="text-terminal-text-secondary text-xs mt-1 leading-relaxed">{topBottomSignal.reasoning}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded border ${
              topBottomSignal.confidence === 'HIGH'
                ? 'bg-terminal-red/20 text-terminal-red border-terminal-red/40'
                : topBottomSignal.confidence === 'MEDIUM'
                ? 'bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/40'
                : 'bg-terminal-border text-terminal-text-secondary border-transparent'
            }`}>
              {topBottomSignal.confidence} CONFIDENCE
            </span>
          </div>
        </div>
      );
    }
    if (topBottomSignal.type === 'BOTTOM') {
      return (
        <div className="rounded-lg p-4 bg-gradient-to-r from-terminal-green/20 to-terminal-green/5 border border-terminal-green/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-terminal-green font-bold text-base">📈 POTENTIAL BOTTOM DETECTED</p>
              <p className="text-terminal-text-secondary text-xs mt-1 leading-relaxed">{topBottomSignal.reasoning}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded border ${
              topBottomSignal.confidence === 'HIGH'
                ? 'bg-terminal-green/20 text-terminal-green border-terminal-green/40'
                : topBottomSignal.confidence === 'MEDIUM'
                ? 'bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/40'
                : 'bg-terminal-border text-terminal-text-secondary border-transparent'
            }`}>
              {topBottomSignal.confidence} CONFIDENCE
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg p-3 bg-terminal-border/30 border border-terminal-border">
        <p className="text-terminal-text-secondary text-sm font-medium">No Major Reversal Signal</p>
        {topBottomSignal.reasoning && (
          <p className="text-terminal-text-secondary/70 text-xs mt-1">{topBottomSignal.reasoning}</p>
        )}
      </div>
    );
  };

  /* ── 2. Swing Trade Setup ─────────────────────────────────── */
  const swingCard = swingSetup.exists && swingSetup.direction !== 'NONE' ? (
    <Card title="Swing Trade Setup">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            swingSetup.direction === 'LONG'
              ? 'bg-terminal-green/20 text-terminal-green'
              : 'bg-terminal-red/20 text-terminal-red'
          }`}>
            {swingSetup.direction}
          </span>
          {swingSetup.timeframe && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-terminal-bg border border-terminal-border text-terminal-text-secondary">
              {swingSetup.timeframe}
            </span>
          )}
          {swingSetup.riskReward !== null && (
            <span className="ml-auto text-xl font-bold text-terminal-cyan">
              R:R 1:{swingSetup.riskReward.toFixed(1)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Entry', price: swingSetup.entry, highlight: true },
            { label: 'Stop Loss', price: swingSetup.stopLoss, color: 'text-terminal-red' },
            { label: 'Target 1', price: swingSetup.target1, color: 'text-terminal-green' },
          ].map(({ label, price, highlight, color }) => (
            <div key={label} className={`rounded-lg p-2.5 text-center ${highlight ? 'bg-terminal-cyan/10 border border-terminal-cyan/20' : 'bg-terminal-bg border border-terminal-border'}`}>
              <p className="text-[10px] text-terminal-text-secondary mb-1">{label}</p>
              <p className={`text-sm font-bold tabular-nums ${color ?? 'text-terminal-text-primary'}`}>
                {formatPrice(price)}
              </p>
              {price !== null && swingSetup.entry !== null && price !== swingSetup.entry && (
                <p className={`text-[10px] mt-0.5 ${color ?? 'text-terminal-text-secondary'}`}>
                  {pctFromEntry(price, swingSetup.entry)}
                </p>
              )}
            </div>
          ))}
        </div>

        {swingSetup.target2 !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-terminal-text-secondary">Target 2:</span>
            <span className="text-terminal-green font-semibold">{formatPrice(swingSetup.target2)}</span>
            <span className="text-terminal-green/70">{pctFromEntry(swingSetup.target2, swingSetup.entry)}</span>
          </div>
        )}

        {swingSetup.description && (
          <p className="text-xs text-terminal-text-secondary leading-relaxed border-t border-terminal-border pt-2">
            {swingSetup.description}
          </p>
        )}
      </div>
    </Card>
  ) : null;

  /* ── 3. Trend ─────────────────────────────────────────────── */
  const directionArrow = trend.direction === 'UP' ? '↑' : trend.direction === 'DOWN' ? '↓' : '→';
  const directionColor =
    trend.direction === 'UP'
      ? 'text-terminal-green'
      : trend.direction === 'DOWN'
      ? 'text-terminal-red'
      : 'text-terminal-cyan';

  const strengthBadgeColor =
    trend.strength === 'STRONG'
      ? 'bg-terminal-green/15 text-terminal-green border-terminal-green/30'
      : trend.strength === 'MODERATE'
      ? 'bg-terminal-yellow/15 text-terminal-yellow border-terminal-yellow/30'
      : 'bg-terminal-border text-terminal-text-secondary border-transparent';

  /* ── Key level sort helpers ───────────────────────────────── */
  const sortedSupport = [...keyLevels.support].sort((a, b) => b - a);
  const sortedResistance = [...keyLevels.resistance].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {/* 1. Top/Bottom Banner */}
      {bannerContent()}

      {/* 2. Swing Setup */}
      {swingCard}

      {/* 3. Trend */}
      <Card title="Trend Analysis">
        <div className="flex items-start gap-4">
          <div className="text-center">
            <span className={`text-3xl font-bold ${directionColor}`}>{directionArrow}</span>
            <p className={`text-xs font-semibold mt-1 ${directionColor}`}>{trend.direction}</p>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-terminal-text-secondary">Strength:</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${strengthBadgeColor}`}>
                {trend.strength}
              </span>
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
              <span className="text-[10px] text-terminal-text-secondary">Key Level:</span>
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
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 bg-terminal-bg rounded-lg px-3 py-2">
              <span className="text-terminal-text-secondary text-sm w-4 text-center">{icon}</span>
              <span className="text-xs font-semibold text-terminal-text-secondary w-12">{label}</span>
              <span className="text-xs text-terminal-text-primary flex-1">{value}</span>
            </div>
          ))}
          {indicators.summary && (
            <p className="text-xs text-terminal-text-secondary leading-relaxed border-t border-terminal-border pt-2 mt-2">
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
            <span
              key={i}
              className="text-[11px] px-2.5 py-1 rounded-full bg-terminal-yellow/10 text-terminal-yellow border border-terminal-yellow/25 flex items-center gap-1.5"
            >
              <span>⚠</span>
              {w}
            </span>
          ))}
        </div>
      )}

      {/* 9. Summary */}
      {summary && (
        <div className="rounded-lg border border-terminal-cyan/20 bg-terminal-cyan/5 px-4 py-3">
          <p className="text-[10px] font-semibold text-terminal-cyan uppercase tracking-widest mb-2">Summary</p>
          <p className="text-sm text-terminal-text-primary leading-relaxed italic">"{summary}"</p>
        </div>
      )}
    </div>
  );
}
