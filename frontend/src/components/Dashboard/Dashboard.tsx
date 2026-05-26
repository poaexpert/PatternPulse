import { useStore } from '../../store';
import MarketOverview from '../MarketOverview/MarketOverview';
import {
  formatPercent,
  formatVolume,
  formatPrice,
  getChangeColor,
  timeAgo,
  formatScanType,
  getStrengthColor,
} from '../../utils/formatters';
import type { ScanResult } from '../../types';

// ─── Stats Row ──────────────────────────────────────────────────────────────

function StatsRow() {
  const { scanResults, lastScanTime, alertHistory } = useStore();

  const longCount = scanResults.filter((r) => r.direction === 'LONG').length;
  const shortCount = scanResults.filter((r) => r.direction === 'SHORT').length;
  const avgStrength =
    scanResults.length > 0
      ? scanResults.reduce((sum, r) => sum + r.strength, 0) / scanResults.length
      : 0;

  const stats = [
    {
      label: 'Total Signals',
      value: scanResults.length,
      sub: lastScanTime ? `Updated ${timeAgo(lastScanTime)}` : 'No scan yet',
      color: 'text-terminal-cyan',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Long Signals',
      value: longCount,
      sub: `${scanResults.length > 0 ? Math.round((longCount / scanResults.length) * 100) : 0}% of results`,
      color: 'text-terminal-green',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Short Signals',
      value: shortCount,
      sub: `${scanResults.length > 0 ? Math.round((shortCount / scanResults.length) * 100) : 0}% of results`,
      color: 'text-terminal-red',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 17 22 17 22 11" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Avg Strength',
      value: avgStrength.toFixed(1),
      sub: `${alertHistory.length} alerts today`,
      color: getStrengthColor(avgStrength),
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-terminal-card border border-terminal-border rounded-lg p-4 flex items-start justify-between"
        >
          <div>
            <p className="text-xs text-terminal-text-secondary mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            <p className="text-[11px] text-terminal-text-secondary mt-1">{stat.sub}</p>
          </div>
          <div className={`p-2 rounded-lg bg-terminal-border/30 ${stat.color}`}>
            {stat.icon}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mini Stock Card ─────────────────────────────────────────────────────────

function MiniStockCard({ result, onClick }: { result: ScanResult; onClick: () => void }) {
  const isLong = result.direction === 'LONG';
  const borderColor = isLong ? 'border-terminal-green/30' : 'border-terminal-red/30';
  const changeColor = getChangeColor(result.changePercent);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-terminal-card border ${borderColor} rounded-lg p-3 hover:bg-terminal-border/20 transition-all active:scale-[0.99]`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-terminal-text-primary">{result.symbol}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red'}`}>
              {result.direction}
            </span>
          </div>
          <p className="text-xs text-terminal-text-secondary truncate max-w-[140px]">{result.name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold font-mono text-terminal-text-primary">{formatPrice(result.price)}</p>
          <p className={`text-xs font-mono ${changeColor}`}>{formatPercent(result.changePercent)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-terminal-text-secondary">Vol: <span className="text-terminal-text-primary">{formatVolume(result.volume)}</span></span>
        <span className={`font-semibold ${getStrengthColor(result.strength)}`}>Str: {result.strength}/10</span>
      </div>
      {result.scanTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {result.scanTypes.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-terminal-border/40 text-terminal-text-secondary rounded">
              {formatScanType(t)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Signal Section ───────────────────────────────────────────────────────────

function SignalSection({ title, direction, color }: { title: string; direction: 'LONG' | 'SHORT'; color: string }) {
  const { scanResults, setSelectedSymbol, setActiveView } = useStore();

  const topResults = scanResults
    .filter((r) => r.direction === direction)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-1 h-4 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold text-terminal-text-primary">{title}</h3>
        <span className="text-xs text-terminal-text-secondary ml-auto">{topResults.length} signals</span>
      </div>
      {topResults.length === 0 ? (
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-6 text-center">
          <p className="text-sm text-terminal-text-secondary">No {direction.toLowerCase()} signals yet</p>
          <p className="text-xs text-terminal-text-secondary/60 mt-1">Run a scan to find opportunities</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topResults.map((result) => (
            <MiniStockCard
              key={result.symbol}
              result={result}
              onClick={() => {
                setSelectedSymbol(result.symbol);
                setActiveView('ai-analysis');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sector Heatmap ───────────────────────────────────────────────────────────

const SECTORS = [
  { symbol: 'XLK', name: 'Technology', change: 1.24 },
  { symbol: 'XLF', name: 'Financials', change: -0.33 },
  { symbol: 'XLE', name: 'Energy', change: 2.15 },
  { symbol: 'XLV', name: 'Healthcare', change: 0.18 },
  { symbol: 'XLI', name: 'Industrials', change: 0.67 },
  { symbol: 'XLY', name: 'Consumer Disc.', change: -1.02 },
  { symbol: 'XLC', name: 'Comm. Svcs', change: 0.45 },
  { symbol: 'XLP', name: 'Consumer Stpl.', change: -0.22 },
  { symbol: 'XLRE', name: 'Real Estate', change: -0.88 },
  { symbol: 'XLU', name: 'Utilities', change: 0.11 },
  { symbol: 'XLB', name: 'Materials', change: 1.05 },
  { symbol: 'XBI', name: 'Biotech', change: -2.34 },
];

function SectorHeatmap() {
  const getHeatColor = (change: number): string => {
    if (change > 2) return 'bg-terminal-green text-black';
    if (change > 1) return 'bg-terminal-green/70 text-black';
    if (change > 0.5) return 'bg-terminal-green/40 text-terminal-green';
    if (change > 0) return 'bg-terminal-green/20 text-terminal-green';
    if (change > -0.5) return 'bg-terminal-red/20 text-terminal-red';
    if (change > -1) return 'bg-terminal-red/40 text-terminal-red';
    if (change > -2) return 'bg-terminal-red/70 text-white';
    return 'bg-terminal-red text-white';
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-terminal-text-primary mb-3 flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-terminal-purple" />
        Sector Heatmap
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {SECTORS.map((sector) => (
          <div
            key={sector.symbol}
            className={`rounded-lg p-2 text-center transition-transform hover:scale-105 cursor-default ${getHeatColor(sector.change)}`}
          >
            <div className="text-xs font-bold">{sector.symbol}</div>
            <div className="text-[10px] opacity-80 mt-0.5">{sector.change > 0 ? '+' : ''}{sector.change.toFixed(2)}%</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 justify-center">
        <span className="text-[10px] text-terminal-text-secondary">Bearish</span>
        <div className="flex gap-0.5">
          {['bg-terminal-red', 'bg-terminal-red/60', 'bg-terminal-red/20', 'bg-terminal-green/20', 'bg-terminal-green/60', 'bg-terminal-green'].map((bg, i) => (
            <div key={i} className={`w-4 h-2 rounded-sm ${bg}`} />
          ))}
        </div>
        <span className="text-[10px] text-terminal-text-secondary">Bullish</span>
      </div>
    </div>
  );
}

// ─── Recent Alerts ─────────────────────────────────────────────────────────

function RecentAlerts() {
  const { alertHistory } = useStore();
  const recent = alertHistory.slice(0, 8);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 rounded-full bg-terminal-yellow" />
        <h3 className="text-sm font-semibold text-terminal-text-primary">Recent Alerts</h3>
        <span className="text-xs text-terminal-text-secondary ml-auto">{alertHistory.length} total</span>
      </div>
      {recent.length === 0 ? (
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4 text-center">
          <p className="text-sm text-terminal-text-secondary">No alerts fired yet</p>
          <p className="text-xs text-terminal-text-secondary/60 mt-1">Set up alerts in the Alerts tab</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {recent.map((item) => (
            <div key={item.id} className="flex items-start gap-3 bg-terminal-card border border-terminal-border rounded-lg px-3 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-terminal-yellow mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-terminal-text-primary">{item.symbol}</span>
                  <span className="text-[10px] text-terminal-text-secondary truncate">{item.message}</span>
                </div>
                <span className="text-[10px] text-terminal-text-secondary">{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <div className="space-y-5 max-w-7xl">
      {/* Market Overview */}
      <section>
        <h2 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider mb-3">
          Market Overview
        </h2>
        <MarketOverview />
      </section>

      {/* Stats */}
      <section>
        <h2 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider mb-3">
          Today's Scan Summary
        </h2>
        <StatsRow />
      </section>

      {/* Top Signals */}
      <section>
        <h2 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wider mb-3">
          Top Signals
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SignalSection title="Top Long Signals" direction="LONG" color="bg-terminal-green" />
          <SignalSection title="Top Short Signals" direction="SHORT" color="bg-terminal-red" />
        </div>
      </section>

      {/* Bottom Row: Recent Alerts + Sector Heatmap */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <RecentAlerts />
        </div>
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <SectorHeatmap />
        </div>
      </section>
    </div>
  );
}
