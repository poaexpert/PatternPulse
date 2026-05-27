import { useState, useEffect } from 'react';
import axios from 'axios';
import type { ChartAnalysis } from '../../types';
import CandlestickChart from '../Chart/CandlestickChart';

// ── News ──────────────────────────────────────────────────────────────────────

interface NewsItem { title: string; link: string; pubDate: string; source: string; summary: string; }

function NewsPanel({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get<{ news: NewsItem[] }>(`/api/stock/${encodeURIComponent(symbol)}/news`)
      .then(({ data }) => { setNews(data.news ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">News</h3>
      <p className="text-xs text-terminal-text-secondary animate-pulse">Loading headlines…</p>
    </div>
  );

  if (news.length === 0) return null;

  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">Latest News</h3>
      <div className="space-y-2">
        {news.map((item, i) => (
          <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
            className="block bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 hover:border-terminal-cyan/40 transition-colors group">
            <p className="text-xs font-medium text-terminal-text-primary group-hover:text-terminal-cyan transition-colors leading-snug">{item.title}</p>
            {item.summary && <p className="text-[10px] text-terminal-text-secondary mt-1 line-clamp-2">{item.summary}</p>}
            <p className="text-[10px] text-terminal-text-secondary/60 mt-1">{fmtDate(item.pubDate)} · {item.source}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Trading strategies ────────────────────────────────────────────────────────

function TradingStrategies({ analysis }: { analysis: ChartAnalysis }) {
  const { swingSetup, trend, indicators, patterns, signalStrength, topBottomSignal, keyLevels, currentPrice } = analysis;
  const dir = swingSetup.direction;
  const isLong = dir === 'LONG';

  type Strategy = { name: string; type: string; description: string; risk: string; riskColor: string };
  const strategies: Strategy[] = [];
  const fmt = (n: number | null | undefined) =>
    n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── 1. Primary Swing (always show if direction is set) ──────────────────
  if (dir !== 'NONE' && swingSetup.entry) {
    strategies.push({
      name: `${isLong ? '▲' : '▼'} Primary Swing`,
      type: dir,
      description: `${swingSetup.description} Entry: ${fmt(swingSetup.entry)} | Stop: ${fmt(swingSetup.stopLoss)} | T1: ${fmt(swingSetup.target1)} | T2: ${fmt(swingSetup.target2)} | R:R 1:${swingSetup.riskReward?.toFixed(1) ?? '?'}`,
      risk: swingSetup.riskReward && swingSetup.riskReward >= 2 ? 'Low Risk' : 'Medium Risk',
      riskColor: swingSetup.riskReward && swingSetup.riskReward >= 2 ? 'text-terminal-green' : 'text-terminal-yellow',
    });
  }

  // ── 2. RSI extreme strategies ──────────────────────────────────────────
  if (indicators.rsiSignal === 'OVERSOLD') {
    strategies.push({
      name: '📈 RSI Oversold Bounce',
      type: 'LONG',
      description: `RSI deeply oversold — high-probability reversal zone. Watch for a bullish reversal candle above ${keyLevels.support[0] ? fmt(keyLevels.support[0]) : 'nearest support'}. Enter on confirmation candle, stop below the swing low.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }
  if (indicators.rsiSignal === 'OVERBOUGHT') {
    strategies.push({
      name: '📉 RSI Overbought Fade',
      type: 'SHORT',
      description: `RSI overbought — momentum exhaustion near ${keyLevels.resistance[0] ? fmt(keyLevels.resistance[0]) : 'resistance'}. Fade the move or wait for a bearish candle. Stop above the swing high.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }

  // ── 3. RSI divergence strategies ──────────────────────────────────────
  if (indicators.rsiSignal === 'DIVERGENCE_BULLISH') {
    strategies.push({
      name: '📈 RSI Bullish Divergence',
      type: 'LONG',
      description: `RSI making higher lows while price makes lower lows — hidden buying pressure building. Enter long on the next swing low retest with stop just below. Target the prior high.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }
  if (indicators.rsiSignal === 'DIVERGENCE_BEARISH') {
    strategies.push({
      name: '📉 RSI Bearish Divergence',
      type: 'SHORT',
      description: `RSI making lower highs while price makes higher highs — momentum weakening at the top. Short the next bounce into resistance with stop above the swing high.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }

  // ── 4. MACD strategies (add if under 3 ideas so far) ──────────────────
  if (indicators.macdSignal === 'BULLISH' && strategies.length < 3) {
    strategies.push({
      name: '🟢 MACD Bullish Cross',
      type: 'LONG',
      description: `MACD histogram turned positive — buy pressure building. Enter long on pullback to EMA20, stop below EMA50. Scale out at prior resistance levels.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }
  if (indicators.macdSignal === 'BEARISH' && strategies.length < 3) {
    strategies.push({
      name: '🔴 MACD Bearish Cross',
      type: 'SHORT',
      description: `MACD histogram turned negative — sell pressure increasing. Short bounces to EMA20 with stop above EMA50.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }

  // ── 5. Pattern-based strategies ────────────────────────────────────────
  const bullP = patterns.find((p) => p.implication === 'BULLISH');
  if (bullP && !strategies.some((s) => s.type === 'LONG' && s.name.includes(bullP.name))) {
    strategies.push({
      name: `📊 ${bullP.name}`,
      type: 'LONG',
      description: `${bullP.completion} bullish pattern. ${bullP.target ? `Target: ${fmt(bullP.target)}.` : ''} Enter above the high, stop below the low.`,
      risk: bullP.completion === 'COMPLETE' ? 'Low Risk' : 'Medium Risk',
      riskColor: bullP.completion === 'COMPLETE' ? 'text-terminal-green' : 'text-terminal-yellow',
    });
  }
  const bearP = patterns.find((p) => p.implication === 'BEARISH');
  if (bearP && !strategies.some((s) => s.type === 'SHORT' && s.name.includes(bearP.name))) {
    strategies.push({
      name: `📊 ${bearP.name}`,
      type: 'SHORT',
      description: `${bearP.completion} bearish pattern. ${bearP.target ? `Target: ${fmt(bearP.target)}.` : ''} Short below the low, stop above the high.`,
      risk: bearP.completion === 'COMPLETE' ? 'Low Risk' : 'Medium Risk',
      riskColor: bearP.completion === 'COMPLETE' ? 'text-terminal-green' : 'text-terminal-yellow',
    });
  }

  // ── 6. Trend ride (lowered threshold) ─────────────────────────────────
  if ((trend.strength === 'STRONG' || trend.strength === 'MODERATE') && signalStrength >= 5 && trend.direction !== 'SIDEWAYS') {
    const tType = trend.direction === 'UP' ? 'LONG' : 'SHORT';
    if (!strategies.some((s) => s.name.includes('Trend Ride') || s.name.includes('Trend Pullback'))) {
      if (trend.strength === 'STRONG') {
        strategies.push({
          name: '🔥 Trend Ride',
          type: tType,
          description: `Strong ${trend.direction} trend (${signalStrength}/10). ${trend.direction === 'UP' ? 'Add longs on EMA20 pullbacks, stop below EMA50.' : 'Add shorts on EMA20 bounces, stop above EMA50.'} Trail your stop as it moves.`,
          risk: 'Low Risk',
          riskColor: 'text-terminal-green',
        });
      } else {
        strategies.push({
          name: '↗ Trend Pullback',
          type: tType,
          description: `Moderate ${trend.direction} trend. Trade pullbacks to the EMA20/EMA50 in trend direction. Tighten stops when momentum stalls.`,
          risk: 'Medium Risk',
          riskColor: 'text-terminal-yellow',
        });
      }
    }
  }

  // ── 7. Top / Bottom reversal (extended to MEDIUM confidence) ──────────
  if (topBottomSignal.type !== 'NONE' &&
      (topBottomSignal.confidence === 'HIGH' || topBottomSignal.confidence === 'MEDIUM')) {
    const revType = topBottomSignal.type === 'TOP' ? 'SHORT' : 'LONG';
    if (!strategies.some((s) => s.type === revType && (s.name.includes('Top') || s.name.includes('Bottom')))) {
      strategies.push({
        name: topBottomSignal.type === 'TOP'
          ? `⚠ ${topBottomSignal.confidence} Confidence Top`
          : `🔄 ${topBottomSignal.confidence} Confidence Bottom`,
        type: revType,
        description: `${topBottomSignal.reasoning} ${topBottomSignal.confidence === 'HIGH' ? 'High conviction — tight stop, aggressive target.' : 'Moderate confidence — use reduced size.'}`,
        risk: 'High Risk',
        riskColor: 'text-terminal-red',
      });
    }
  }

  // ── 8. Range trade for sideways markets ───────────────────────────────
  if (trend.direction === 'SIDEWAYS' && keyLevels.support.length > 0 && keyLevels.resistance.length > 0 && strategies.length < 2) {
    const nearestSupport = keyLevels.support[0];
    const nearestResistance = keyLevels.resistance[keyLevels.resistance.length - 1];
    strategies.push({
      name: '↔ Range Trade',
      type: 'LONG',
      description: `Sideways range — buy near support ${fmt(nearestSupport)}, target resistance ${fmt(nearestResistance)}. Tight stops just outside the range. Avoid chasing; wait for price to touch the level.`,
      risk: 'Medium Risk',
      riskColor: 'text-terminal-yellow',
    });
  }

  // ── Fallback with useful guidance (shouldn't happen often now) ─────────
  if (strategies.length === 0) {
    strategies.push({
      name: '⏳ No Edge Yet',
      type: 'NEUTRAL',
      description: `Signal strength ${signalStrength}/10 — mixed signals across timeframes. Mark these key levels: Support ${keyLevels.support.map(fmt).join(' / ')}, Resistance ${keyLevels.resistance.map(fmt).join(' / ')}. Wait for an RSI extreme, MACD cross, or volume surge before entering.`,
      risk: 'Low Risk',
      riskColor: 'text-terminal-green',
    });
  }

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <h3 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-widest mb-3">
        Trade Ideas · {strategies.length} setup{strategies.length !== 1 ? 's' : ''}
      </h3>
      <div className="space-y-2">
        {strategies.map((s, i) => (
          <div key={i} className={`rounded-lg px-3 py-3 border ${
            s.type === 'LONG' ? 'border-terminal-green/20 bg-terminal-green/5' :
            s.type === 'SHORT' ? 'border-terminal-red/20 bg-terminal-red/5' :
            'border-terminal-border bg-terminal-bg/50'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-terminal-text-primary">{s.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                  s.type === 'LONG' ? 'border-terminal-green/30 text-terminal-green bg-terminal-green/10' :
                  s.type === 'SHORT' ? 'border-terminal-red/30 text-terminal-red bg-terminal-red/10' :
                  'border-terminal-border text-terminal-text-secondary'
                }`}>{s.type}</span>
                <span className={`text-[10px] font-semibold ${s.riskColor}`}>{s.risk}</span>
              </div>
            </div>
            <p className="text-[11px] text-terminal-text-secondary leading-relaxed">{s.description}</p>
          </div>
        ))}
      </div>
      {currentPrice != null && (
        <p className="text-[10px] text-terminal-text-secondary/60 mt-2">
          Current: {fmt(currentPrice)} · Not financial advice · Use proper risk management
        </p>
      )}
    </div>
  );
}

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

      {/* 9. Trade Ideas */}
      <TradingStrategies analysis={analysis} />

      {/* 10. Side plays */}
      <SidePlays
        symbol={resolvedSymbol ?? symbol ?? ''}
        direction={swingSetup?.direction ?? 'NONE'}
      />

      {/* 11. News */}
      {(resolvedSymbol ?? symbol) && (
        <NewsPanel symbol={resolvedSymbol ?? symbol ?? ''} />
      )}

      {/* 12. Summary */}
      {summary && (
        <div className="rounded-lg border border-terminal-cyan/20 bg-terminal-cyan/5 px-4 py-3">
          <p className="text-[10px] font-semibold text-terminal-cyan uppercase tracking-widest mb-2">Summary</p>
          <p className="text-sm text-terminal-text-primary leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
