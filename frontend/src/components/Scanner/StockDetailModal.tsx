import { useEffect, useCallback, useState } from 'react';
import { useStore } from '../../store';
import StockChart from '../Charts/StockChart';
import {
  formatPrice,
  formatPercent,
  formatVolume,
  formatMarketCap,
  getChangeColor,
  getStrengthColor,
  formatScanType,
  timeAgo,
  getRsiColor,
  getMacdColor,
} from '../../utils/formatters';
import type { Alert } from '../../types';
import axios from 'axios';

interface StockDetailModalProps {
  symbol: string;
  onClose: () => void;
}

function IndicatorRow({ label, value, valueColor = 'text-terminal-text-primary', sub }: {
  label: string;
  value: string | number;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/40 last:border-0">
      <span className="text-xs text-terminal-text-secondary">{label}</span>
      <div className="text-right">
        <span className={`text-xs font-mono font-semibold ${valueColor}`}>{value}</span>
        {sub && <span className="text-[10px] text-terminal-text-secondary ml-1">{sub}</span>}
      </div>
    </div>
  );
}

export default function StockDetailModal({ symbol, onClose }: StockDetailModalProps) {
  const { scanResults, watchlist, addToWatchlist, setAlerts, alerts } = useStore();
  const result = scanResults.find((r) => r.symbol === symbol);

  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState('');
  const [alertCondition, setAlertCondition] = useState<Alert['conditionType']>('PRICE_ABOVE');
  const [alertSaving, setAlertSaving] = useState(false);

  const inWatchlist = watchlist.some((w) => w.symbol === symbol);
  const isLong = result?.direction === 'LONG';
  const isShort = result?.direction === 'SHORT';

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const handleAddToWatchlist = () => {
    if (!inWatchlist && result) {
      addToWatchlist({
        symbol: result.symbol,
        name: result.name,
        addedAt: new Date().toISOString(),
      });
    }
  };

  const handleCreateAlert = async () => {
    if (!alertThreshold || !result) return;
    setAlertSaving(true);
    try {
      const newAlert: Omit<Alert, 'id'> = {
        symbol: result.symbol,
        conditionType: alertCondition,
        threshold: parseFloat(alertThreshold),
        notifyMethods: ['browser'],
        active: true,
        triggerCount: 0,
        createdAt: new Date().toISOString(),
      };
      const res = await axios.post<Alert>('/api/alerts', newAlert);
      setAlerts([res.data, ...alerts]);
      setShowCreateAlert(false);
      setAlertThreshold('');
    } catch {
      // Optimistic add
      const localAlert: Alert = {
        id: `local-${Date.now()}`,
        symbol: result.symbol,
        conditionType: alertCondition,
        threshold: parseFloat(alertThreshold),
        notifyMethods: ['browser'],
        active: true,
        triggerCount: 0,
        createdAt: new Date().toISOString(),
      };
      setAlerts([localAlert, ...alerts]);
      setShowCreateAlert(false);
    } finally {
      setAlertSaving(false);
    }
  };

  if (!result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 modal-overlay" onClick={handleClose}>
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-8 modal-content" onClick={(e) => e.stopPropagation()}>
          <p className="text-terminal-text-secondary">Symbol not found in current scan results</p>
          <button onClick={handleClose} className="mt-4 px-4 py-2 bg-terminal-cyan text-black rounded-lg text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    );
  }

  const indicators = result.indicators;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 modal-overlay p-4"
      onClick={handleClose}
    >
      <div
        className="bg-terminal-card border border-terminal-border rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-terminal-border sticky top-0 bg-terminal-card z-10">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-terminal-text-primary">{result.symbol}</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                  isLong ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20'
                  : isShort ? 'bg-terminal-red/10 text-terminal-red border-terminal-red/20'
                  : 'bg-terminal-cyan/10 text-terminal-cyan border-terminal-cyan/20'
                }`}>
                  {result.direction}
                </span>
              </div>
              <p className="text-sm text-terminal-text-secondary">{result.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right mr-2">
              <p className="text-xl font-bold font-mono text-terminal-text-primary">{formatPrice(result.price)}</p>
              <p className={`text-sm font-mono font-semibold ${getChangeColor(result.changePercent)}`}>
                {result.changePercent >= 0 ? '▲' : '▼'} {formatPercent(result.changePercent)}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-terminal-border/40 text-terminal-text-secondary hover:bg-terminal-border hover:text-terminal-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Chart */}
          <StockChart symbol={symbol} height={280} showVolume showEMAs />

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAddToWatchlist}
              disabled={inWatchlist}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inWatchlist
                  ? 'bg-terminal-purple/10 text-terminal-purple border border-terminal-purple/20 cursor-default'
                  : 'bg-terminal-purple/20 text-terminal-purple hover:bg-terminal-purple/30 border border-terminal-purple/30'
              }`}
            >
              <span>{inWatchlist ? '★' : '☆'}</span>
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
            <button
              onClick={() => setShowCreateAlert(!showCreateAlert)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-terminal-yellow/10 text-terminal-yellow border border-terminal-yellow/20 hover:bg-terminal-yellow/20 transition-colors"
            >
              <span>🔔</span>
              Set Alert
            </button>
          </div>

          {/* Create Alert Form */}
          {showCreateAlert && (
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-terminal-text-primary">Create Alert for {symbol}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-terminal-text-secondary mb-1">Condition</label>
                  <select
                    value={alertCondition}
                    onChange={(e) => setAlertCondition(e.target.value as Alert['conditionType'])}
                    className="w-full bg-terminal-card border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
                  >
                    <option value="PRICE_ABOVE">Price Above</option>
                    <option value="PRICE_BELOW">Price Below</option>
                    <option value="PERCENT_CHANGE_UP">% Change Up</option>
                    <option value="PERCENT_CHANGE_DOWN">% Change Down</option>
                    <option value="VOLUME_SURGE">Volume Surge</option>
                    <option value="RSI_ABOVE">RSI Above</option>
                    <option value="RSI_BELOW">RSI Below</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-terminal-text-secondary mb-1">
                    Threshold {alertCondition.includes('PRICE') ? `(current: ${formatPrice(result.price)})` : ''}
                  </label>
                  <input
                    type="number"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    placeholder={alertCondition.includes('PERCENT') ? '5' : alertCondition.includes('RSI') ? '70' : result.price.toFixed(2)}
                    className="w-full bg-terminal-card border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateAlert}
                  disabled={alertSaving || !alertThreshold}
                  className="px-4 py-2 bg-terminal-yellow text-black text-sm font-semibold rounded-lg hover:bg-terminal-yellow/90 disabled:opacity-50 transition-colors"
                >
                  {alertSaving ? 'Creating...' : 'Create Alert'}
                </button>
                <button
                  onClick={() => setShowCreateAlert(false)}
                  className="px-4 py-2 bg-terminal-border/40 text-terminal-text-secondary text-sm rounded-lg hover:bg-terminal-border transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Two column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Indicators */}
            <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-terminal-text-primary mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-terminal-cyan inline-block" />
                Technical Indicators
              </h3>
              <div>
                {indicators.rsi14 !== undefined && (
                  <IndicatorRow
                    label="RSI (14)"
                    value={indicators.rsi14.toFixed(1)}
                    valueColor={getRsiColor(indicators.rsi14)}
                    sub={indicators.rsi14 >= 70 ? 'Overbought' : indicators.rsi14 <= 30 ? 'Oversold' : 'Neutral'}
                  />
                )}
                {indicators.macd && (
                  <>
                    <IndicatorRow label="MACD Value" value={indicators.macd.value.toFixed(3)} valueColor={getMacdColor(indicators.macd.histogram)} />
                    <IndicatorRow label="MACD Signal" value={indicators.macd.signal.toFixed(3)} />
                    <IndicatorRow
                      label="MACD Histogram"
                      value={indicators.macd.histogram.toFixed(3)}
                      valueColor={getMacdColor(indicators.macd.histogram)}
                      sub={indicators.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
                    />
                  </>
                )}
                {indicators.bb && (
                  <>
                    <IndicatorRow label="BB Upper" value={formatPrice(indicators.bb.upper)} />
                    <IndicatorRow label="BB Middle" value={formatPrice(indicators.bb.middle)} />
                    <IndicatorRow label="BB Lower" value={formatPrice(indicators.bb.lower)} />
                    <IndicatorRow label="BB Width" value={indicators.bb.width.toFixed(3)} />
                    <IndicatorRow
                      label="BB %B"
                      value={`${(indicators.bb.percentB * 100).toFixed(1)}%`}
                      valueColor={indicators.bb.percentB > 1 ? 'text-terminal-red' : indicators.bb.percentB < 0 ? 'text-terminal-green' : 'text-terminal-cyan'}
                    />
                  </>
                )}
                {indicators.vwap !== undefined && (
                  <IndicatorRow
                    label="VWAP"
                    value={formatPrice(indicators.vwap)}
                    valueColor={result.price >= indicators.vwap ? 'text-terminal-green' : 'text-terminal-red'}
                    sub={result.price >= indicators.vwap ? 'Above' : 'Below'}
                  />
                )}
                {indicators.ema9 !== undefined && <IndicatorRow label="EMA 9" value={formatPrice(indicators.ema9)} valueColor="text-terminal-cyan" />}
                {indicators.ema20 !== undefined && <IndicatorRow label="EMA 20" value={formatPrice(indicators.ema20)} valueColor="text-terminal-purple" />}
                {indicators.ema50 !== undefined && <IndicatorRow label="EMA 50" value={formatPrice(indicators.ema50)} valueColor="text-terminal-yellow" />}
                {indicators.ema200 !== undefined && <IndicatorRow label="EMA 200" value={formatPrice(indicators.ema200)} />}
                {indicators.atr !== undefined && <IndicatorRow label="ATR (14)" value={indicators.atr.toFixed(3)} />}
                <IndicatorRow label="Volume Ratio" value={`${result.volumeRatio.toFixed(1)}x`} valueColor={result.volumeRatio > 2 ? 'text-terminal-yellow' : 'text-terminal-text-primary'} />
              </div>
            </div>

            {/* Trade Setup + Stock Info */}
            <div className="space-y-4">
              {/* Trade Setup */}
              {(result.entry || result.stopLoss || result.target1) && (
                <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-terminal-text-primary mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-terminal-yellow inline-block" />
                    Trade Setup
                  </h3>
                  <div className="space-y-2">
                    {result.entry !== undefined && (
                      <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/40">
                        <span className="text-xs text-terminal-text-secondary flex items-center gap-1.5">
                          <span>🎯</span> Entry
                        </span>
                        <span className="text-xs font-mono font-semibold text-terminal-text-primary">{formatPrice(result.entry)}</span>
                      </div>
                    )}
                    {result.stopLoss !== undefined && (
                      <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/40">
                        <span className="text-xs text-terminal-text-secondary flex items-center gap-1.5">
                          <span>🛑</span> Stop Loss
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-mono font-semibold text-terminal-red">{formatPrice(result.stopLoss)}</span>
                          {result.entry && (
                            <span className="text-[10px] text-terminal-red/70 ml-1">
                              {formatPercent(((result.stopLoss - result.entry) / result.entry) * 100)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {result.target1 !== undefined && (
                      <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/40">
                        <span className="text-xs text-terminal-text-secondary flex items-center gap-1.5">
                          <span>✅</span> Target 1
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-mono font-semibold text-terminal-green">{formatPrice(result.target1)}</span>
                          {result.entry && (
                            <span className="text-[10px] text-terminal-green/70 ml-1">
                              {formatPercent(((result.target1 - result.entry) / result.entry) * 100)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {result.target2 !== undefined && (
                      <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/40">
                        <span className="text-xs text-terminal-text-secondary flex items-center gap-1.5">
                          <span>🏆</span> Target 2
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-mono font-semibold text-terminal-green">{formatPrice(result.target2)}</span>
                          {result.entry && (
                            <span className="text-[10px] text-terminal-green/70 ml-1">
                              {formatPercent(((result.target2 - result.entry) / result.entry) * 100)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {result.riskReward !== undefined && (
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-terminal-text-secondary">Risk/Reward</span>
                        <span className={`text-xs font-mono font-bold ${result.riskReward >= 2 ? 'text-terminal-green' : result.riskReward >= 1 ? 'text-terminal-yellow' : 'text-terminal-red'}`}>
                          {result.riskReward.toFixed(1)}:1
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stock info */}
              <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-terminal-text-primary mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-terminal-purple inline-block" />
                  Stock Info
                </h3>
                <div>
                  <IndicatorRow label="Volume" value={formatVolume(result.volume)} />
                  <IndicatorRow label="Avg Volume" value={formatVolume(result.avgVolume)} />
                  <IndicatorRow label="Volume Ratio" value={`${result.volumeRatio.toFixed(1)}x`} />
                  {result.marketCap && <IndicatorRow label="Market Cap" value={formatMarketCap(result.marketCap)} />}
                  {result.high52Week && <IndicatorRow label="52W High" value={formatPrice(result.high52Week)} />}
                  {result.low52Week && <IndicatorRow label="52W Low" value={formatPrice(result.low52Week)} />}
                  <IndicatorRow label="Signal Strength" value={`${result.strength}/10`} valueColor={getStrengthColor(result.strength)} />
                  <IndicatorRow label="Last Updated" value={timeAgo(result.timestamp)} />
                </div>
              </div>
            </div>
          </div>

          {/* Signals */}
          <div className="bg-terminal-bg border border-terminal-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-terminal-text-primary mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-terminal-green inline-block" />
              Active Signals ({result.signals.length})
            </h3>
            {result.signals.length === 0 ? (
              <p className="text-sm text-terminal-text-secondary">No active signals</p>
            ) : (
              <div className="space-y-2">
                {result.signals.map((signal, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-terminal-card border border-terminal-border/50 rounded-lg px-3 py-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      signal.direction === 'LONG' ? 'bg-terminal-green' : signal.direction === 'SHORT' ? 'bg-terminal-red' : 'bg-terminal-cyan'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-terminal-text-primary">{signal.type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          signal.direction === 'LONG' ? 'bg-terminal-green/10 text-terminal-green' : signal.direction === 'SHORT' ? 'bg-terminal-red/10 text-terminal-red' : 'bg-terminal-cyan/10 text-terminal-cyan'
                        }`}>
                          {signal.direction}
                        </span>
                        <span className={`text-[10px] ${getStrengthColor(signal.strength)}`}>Strength {signal.strength}/10</span>
                      </div>
                      <p className="text-xs text-terminal-text-secondary mt-0.5">{signal.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scan types */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.scanTypes.map((type) => (
                <span
                  key={type}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-terminal-border/60 text-terminal-text-secondary"
                >
                  {formatScanType(type)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
