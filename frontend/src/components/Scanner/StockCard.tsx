import { useState } from 'react';
import { useStore } from '../../store';
import {
  formatPrice,
  formatPercent,
  formatVolume,
  getChangeColor,
  getStrengthColor,
  formatScanType,
  formatStrengthBar,
  timeAgo,
} from '../../utils/formatters';
import type { ScanResult } from '../../types';

interface StockCardProps {
  result: ScanResult;
  onOpenDetail: (symbol: string) => void;
}

export default function StockCard({ result, onOpenDetail }: StockCardProps) {
  const { watchlist, addToWatchlist } = useStore();
  const [isAdded, setIsAdded] = useState(false);

  const isLong = result.direction === 'LONG';
  const isShort = result.direction === 'SHORT';
  const inWatchlist = watchlist.some((w) => w.symbol === result.symbol);

  const borderColor = isLong
    ? 'border-terminal-green/25 hover:border-terminal-green/50'
    : isShort
    ? 'border-terminal-red/25 hover:border-terminal-red/50'
    : 'border-terminal-border hover:border-terminal-border-light';

  const directionBadge = isLong
    ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20'
    : isShort
    ? 'bg-terminal-red/10 text-terminal-red border-terminal-red/20'
    : 'bg-terminal-cyan/10 text-terminal-cyan border-terminal-cyan/20';

  const changeColor = getChangeColor(result.changePercent);
  const strengthColor = getStrengthColor(result.strength);

  const handleAddToWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inWatchlist) {
      addToWatchlist({
        symbol: result.symbol,
        name: result.name,
        addedAt: new Date().toISOString(),
      });
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
    }
  };

  const rsiValue = result.indicators.rsi14;
  const macdHist = result.indicators.macd?.histogram;
  const vwap = result.indicators.vwap;

  const rsiColor =
    rsiValue !== undefined
      ? rsiValue >= 70
        ? 'text-terminal-red'
        : rsiValue <= 30
        ? 'text-terminal-green'
        : 'text-terminal-cyan'
      : 'text-terminal-text-secondary';

  const riskRewardText =
    result.riskReward !== undefined
      ? `${result.riskReward.toFixed(1)}:1`
      : null;

  return (
    <div
      className={`
        bg-terminal-card border rounded-lg overflow-hidden cursor-pointer transition-all
        ${isLong ? 'new-signal-long' : isShort ? 'new-signal-short' : ''}
        ${borderColor}
        hover:bg-terminal-border/10 active:scale-[0.99]
      `}
      onClick={() => onOpenDetail(result.symbol)}
    >
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-2.5 flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-bold text-terminal-text-primary tracking-tight">{result.symbol}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${directionBadge}`}>
              {result.direction}
            </span>
            {result.direction !== 'NEUTRAL' && (
              <span className="text-lg leading-none">
                {isLong ? '📈' : '📉'}
              </span>
            )}
          </div>
          <p className="text-xs text-terminal-text-secondary truncate">{result.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold font-mono text-terminal-text-primary">{formatPrice(result.price)}</p>
          <p className={`text-xs font-mono font-semibold ${changeColor}`}>
            {result.changePercent >= 0 ? '▲' : '▼'} {formatPercent(result.changePercent)}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-terminal-border mx-3.5" />

      {/* Volume + Strength */}
      <div className="px-3.5 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-terminal-text-secondary">
            Vol: <span className="text-terminal-text-primary font-mono">{formatVolume(result.volume)}</span>
            <span className="text-terminal-text-secondary"> ({result.volumeRatio.toFixed(1)}x avg)</span>
          </span>
          {vwap !== undefined && (
            <span className="text-terminal-text-secondary text-[11px]">
              VWAP: <span className="text-terminal-cyan font-mono">${vwap.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Strength bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-terminal-text-secondary w-14 shrink-0">Strength:</span>
            <span className={`text-xs font-mono strength-bar ${strengthColor}`}>
              {formatStrengthBar(result.strength)}
            </span>
          </div>
          <span className={`text-xs font-bold font-mono ${strengthColor} ml-2 shrink-0`}>
            {result.strength}/10
          </span>
        </div>

        {/* Indicators row */}
        <div className="flex items-center gap-3 text-[11px]">
          {rsiValue !== undefined && (
            <span className="text-terminal-text-secondary">
              RSI: <span className={`font-mono font-semibold ${rsiColor}`}>{rsiValue.toFixed(1)}</span>
            </span>
          )}
          {macdHist !== undefined && (
            <span className="text-terminal-text-secondary">
              MACD: <span className={`font-semibold ${macdHist >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {macdHist >= 0 ? '▲' : '▼'} {Math.abs(macdHist).toFixed(3)}
              </span>
            </span>
          )}
          {result.indicators.bb && (
            <span className="text-terminal-text-secondary">
              BB%: <span className="text-terminal-purple font-mono">
                {(result.indicators.bb.percentB * 100).toFixed(0)}%
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-terminal-border mx-3.5" />

      {/* Trade levels */}
      {(result.entry || result.stopLoss || result.target1) && (
        <div className="px-3.5 py-2 grid grid-cols-3 gap-1 text-[11px]">
          {result.entry !== undefined && (
            <div>
              <span className="text-terminal-text-secondary block">Entry</span>
              <span className="font-mono text-terminal-text-primary">{formatPrice(result.entry)}</span>
            </div>
          )}
          {result.stopLoss !== undefined && (
            <div>
              <span className="text-terminal-text-secondary block">Stop</span>
              <span className="font-mono text-terminal-red">{formatPrice(result.stopLoss)}</span>
              {result.entry && (
                <span className="text-terminal-red/70 text-[10px]">
                  {formatPercent(((result.stopLoss - result.entry) / result.entry) * 100)}
                </span>
              )}
            </div>
          )}
          {result.target1 !== undefined && (
            <div>
              <span className="text-terminal-text-secondary block">Target</span>
              <span className="font-mono text-terminal-green">{formatPrice(result.target1)}</span>
              {riskRewardText && (
                <span className="text-terminal-green/70 text-[10px]">R/R {riskRewardText}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-terminal-border mx-3.5" />

      {/* Footer: scan type tags + timestamp + watchlist */}
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {result.scanTypes.slice(0, 3).map((type) => (
            <span
              key={type}
              className="text-[10px] px-1.5 py-0.5 rounded bg-terminal-border/50 text-terminal-text-secondary"
            >
              {formatScanType(type)}
            </span>
          ))}
          {result.scanTypes.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-terminal-border/50 text-terminal-text-secondary">
              +{result.scanTypes.length - 3}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-terminal-text-secondary">{timeAgo(result.timestamp)}</span>
          <button
            onClick={handleAddToWatchlist}
            className={`
              text-[10px] px-2 py-1 rounded transition-all
              ${inWatchlist || isAdded
                ? 'bg-terminal-purple/10 text-terminal-purple border border-terminal-purple/20'
                : 'bg-terminal-border/40 text-terminal-text-secondary hover:bg-terminal-cyan/10 hover:text-terminal-cyan border border-transparent'
              }
            `}
          >
            {inWatchlist || isAdded ? '★ Watching' : '+ Watch'}
          </button>
        </div>
      </div>
    </div>
  );
}
