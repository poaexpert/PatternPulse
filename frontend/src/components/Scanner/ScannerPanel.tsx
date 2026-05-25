import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { useSocketEmit } from '../../hooks/useSocket';
import StockCard from './StockCard';
import StockDetailModal from './StockDetailModal';
import {
  formatScanType,
  timeAgo,
} from '../../utils/formatters';
import type { Direction, ScanType } from '../../types';

const SCAN_TYPES: ScanType[] = [
  'MOMENTUM', 'VOLUME_SURGE', 'GAP_UP', 'GAP_DOWN',
  'BREAKOUT', 'BREAKDOWN', 'RSI_OVERSOLD', 'RSI_OVERBOUGHT',
  'MACD_BULLISH', 'MACD_BEARISH', 'BB_SQUEEZE', 'SHORT_SQUEEZE',
  'EMA_CROSS_BULLISH', 'EMA_CROSS_BEARISH', 'VWAP_RECLAIM',
  'RELATIVE_STRENGTH', 'HALT_RESUME', 'PREMARKET_MOVER',
];

const DIRECTIONS: { label: string; value: Direction | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Long', value: 'LONG' },
  { label: 'Short', value: 'SHORT' },
  { label: 'Neutral', value: 'NEUTRAL' },
];

const SORT_OPTIONS = [
  { label: 'Strength', value: 'strength' },
  { label: '% Change', value: 'changePercent' },
  { label: 'Vol Ratio', value: 'volumeRatio' },
  { label: 'Symbol', value: 'symbol' },
] as const;

function SkeletonCard() {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-3.5 space-y-2.5">
      <div className="flex justify-between">
        <div className="space-y-1.5">
          <div className="skeleton w-16 h-4 rounded" />
          <div className="skeleton w-28 h-3 rounded" />
        </div>
        <div className="space-y-1.5 items-end flex flex-col">
          <div className="skeleton w-16 h-4 rounded" />
          <div className="skeleton w-12 h-3 rounded" />
        </div>
      </div>
      <div className="skeleton w-full h-3 rounded" />
      <div className="skeleton w-3/4 h-3 rounded" />
      <div className="flex gap-1">
        <div className="skeleton w-16 h-5 rounded" />
        <div className="skeleton w-16 h-5 rounded" />
      </div>
    </div>
  );
}

export default function ScannerPanel() {
  const {
    scanResults,
    scanInProgress,
    lastScanTime,
    scanFilter,
    setScanFilter,
    filteredResults,
    selectedSymbol,
    setSelectedSymbol,
  } = useStore();

  const emit = useSocketEmit();
  const [showScanTypeDropdown, setShowScanTypeDropdown] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(selectedSymbol);

  const results = useMemo(() => filteredResults(), [
    scanResults,
    scanFilter.direction,
    scanFilter.scanType,
    scanFilter.minStrength,
    scanFilter.search,
    scanFilter.sortBy,
  ]);

  const handleScanNow = () => {
    if (!scanInProgress) {
      emit('trigger_scan');
    }
  };

  const handleOpenDetail = (symbol: string) => {
    setDetailSymbol(symbol);
    setSelectedSymbol(symbol);
  };

  const handleCloseDetail = () => {
    setDetailSymbol(null);
    setSelectedSymbol(null);
  };

  const selectedScanType = scanFilter.scanType;

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Filter Bar */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Direction Filter */}
          <div className="flex items-center gap-1 bg-terminal-bg border border-terminal-border rounded-lg p-0.5">
            {DIRECTIONS.map((dir) => (
              <button
                key={dir.value}
                onClick={() => setScanFilter({ direction: dir.value })}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  scanFilter.direction === dir.value
                    ? dir.value === 'LONG'
                      ? 'bg-terminal-green/20 text-terminal-green'
                      : dir.value === 'SHORT'
                      ? 'bg-terminal-red/20 text-terminal-red'
                      : 'bg-terminal-cyan/20 text-terminal-cyan'
                    : 'text-terminal-text-secondary hover:text-terminal-text-primary'
                }`}
              >
                {dir.label}
              </button>
            ))}
          </div>

          {/* Scan Type Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowScanTypeDropdown(!showScanTypeDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-xs text-terminal-text-primary hover:border-terminal-border-light transition-colors"
            >
              <span>{selectedScanType === 'ALL' ? 'All Scan Types' : formatScanType(selectedScanType)}</span>
              <svg className={`w-3 h-3 transition-transform ${showScanTypeDropdown ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showScanTypeDropdown && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-terminal-card border border-terminal-border rounded-lg shadow-xl p-2 w-56 max-h-64 overflow-y-auto">
                <button
                  onClick={() => { setScanFilter({ scanType: 'ALL' }); setShowScanTypeDropdown(false); }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-terminal-border/40 transition-colors ${selectedScanType === 'ALL' ? 'text-terminal-cyan' : 'text-terminal-text-secondary'}`}
                >
                  All Types
                </button>
                {SCAN_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => { setScanFilter({ scanType: type }); setShowScanTypeDropdown(false); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-terminal-border/40 transition-colors ${selectedScanType === type ? 'text-terminal-cyan' : 'text-terminal-text-secondary'}`}
                  >
                    {formatScanType(type)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort */}
          <select
            value={scanFilter.sortBy}
            onChange={(e) => setScanFilter({ sortBy: e.target.value as typeof scanFilter.sortBy })}
            className="px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-xs text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
            ))}
          </select>

          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={scanFilter.search}
                onChange={(e) => setScanFilter({ search: e.target.value })}
                placeholder="Search symbol or name..."
                className="w-full pl-8 pr-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-xs text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none"
              />
              {scanFilter.search && (
                <button
                  onClick={() => setScanFilter({ search: '' })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-terminal-text-secondary hover:text-terminal-text-primary"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Scan Now button */}
          <button
            onClick={handleScanNow}
            disabled={scanInProgress}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              scanInProgress
                ? 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20 cursor-not-allowed'
                : 'bg-terminal-cyan text-black hover:bg-terminal-cyan/90 active:scale-95'
            }`}
          >
            {scanInProgress ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Scan Now
              </>
            )}
          </button>
        </div>

        {/* Min Strength Slider */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-terminal-text-secondary w-20 shrink-0">Min Strength:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={scanFilter.minStrength}
            onChange={(e) => setScanFilter({ minStrength: parseInt(e.target.value) })}
            className="flex-1"
          />
          <span className="text-xs font-mono text-terminal-cyan w-6 text-center">{scanFilter.minStrength}</span>
          <span className="text-[10px] text-terminal-text-secondary">/10</span>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-terminal-text-primary">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
          {scanResults.length > 0 && results.length !== scanResults.length && (
            <span className="text-xs text-terminal-text-secondary">
              (filtered from {scanResults.length} total)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastScanTime && (
            <span className="text-xs text-terminal-text-secondary">
              Last scan: {timeAgo(lastScanTime)}
            </span>
          )}
          {(scanFilter.direction !== 'ALL' || scanFilter.scanType !== 'ALL' || scanFilter.minStrength > 1 || scanFilter.search) && (
            <button
              onClick={() => setScanFilter({ direction: 'ALL', scanType: 'ALL', minStrength: 1, search: '' })}
              className="text-xs text-terminal-cyan hover:text-terminal-cyan/80 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results Grid */}
      {scanInProgress && scanResults.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-terminal-card border border-terminal-border rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-terminal-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <p className="text-base font-semibold text-terminal-text-primary mb-1">
            {scanResults.length === 0 ? 'No scan results yet' : 'No results match filters'}
          </p>
          <p className="text-sm text-terminal-text-secondary mb-4">
            {scanResults.length === 0
              ? 'Click "Scan Now" to run the pattern scanner'
              : 'Try adjusting your filters or lowering the minimum strength'}
          </p>
          {scanResults.length === 0 ? (
            <button
              onClick={handleScanNow}
              disabled={scanInProgress}
              className="px-6 py-2.5 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
            >
              Run Scanner
            </button>
          ) : (
            <button
              onClick={() => setScanFilter({ direction: 'ALL', scanType: 'ALL', minStrength: 1, search: '' })}
              className="px-6 py-2.5 bg-terminal-border/40 text-terminal-text-primary text-sm rounded-lg hover:bg-terminal-border transition-colors"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((result) => (
            <StockCard
              key={result.symbol}
              result={result}
              onOpenDetail={handleOpenDetail}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detailSymbol && (
        <StockDetailModal
          symbol={detailSymbol}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
