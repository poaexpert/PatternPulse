import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store';
import { useSocketEmit } from '../../hooks/useSocket';
import { getChangeColor } from '../../utils/formatters';
import type { ActiveView } from '../../types';

interface ViewMeta {
  title: string;
  subtitle: string;
}

const VIEW_META: Record<ActiveView, ViewMeta> = {
  dashboard: { title: 'Dashboard', subtitle: 'Market overview & top signals' },
  scanner: { title: 'Scanner', subtitle: 'Real-time stock pattern scanning' },
  alerts: { title: 'Alerts', subtitle: 'Price & scan alerts management' },
  watchlist: { title: 'Watchlist', subtitle: 'Tracked symbols & positions' },
  settings: { title: 'Settings', subtitle: 'Notifications & configuration' },
  'ai-analysis': { title: 'Technical Analysis', subtitle: 'Real-time technical analysis & trading signals' },
  futures: { title: 'Futures Markets', subtitle: 'Live futures quotes & monitoring' },
  journal:  { title: 'Trade Journal',      subtitle: 'Log entries, exits, and track performance' },
  news:     { title: 'Market News',        subtitle: 'Latest headlines from all markets' },
  earnings: { title: 'Earnings Calendar',  subtitle: 'Upcoming & recent earnings reports' },
  calendar: { title: 'Economic Calendar',  subtitle: 'Key macro events & Fed schedule' },
  heatmap:         { title: 'Market Heatmap',      subtitle: 'Sector & asset performance at a glance' },
  'pattern-scanner': { title: 'Pattern Scanner',   subtitle: 'Upload a chart screenshot for pattern detection' },
  'risk-calc':       { title: 'Risk Calculator',   subtitle: 'Position sizing, R:R analysis & Kelly criterion' },
  'multi-tf':        { title: 'Multi-Timeframe',   subtitle: 'Simultaneous analysis across 4 timeframes' },
  'crypto':          { title: 'Crypto Dashboard',  subtitle: 'Bitcoin, Ethereum and crypto futures markets' },
  'paper-trade':     { title: 'Paper Trading',     subtitle: 'Virtual portfolio with $100k starting capital' },
  'screener':        { title: 'Market Screener',   subtitle: 'Filter stocks & ETFs by price, change, volume' },
  'options':         { title: 'Options Chain',     subtitle: 'Live options chains, OI, IV & max pain' },
  'admin':           { title: 'Admin Panel',       subtitle: 'Site management & user control' },
  'pricing':         { title: 'Plans & Pricing',   subtitle: 'Upgrade your access level' },
  'analytics':       { title: 'Analytics',         subtitle: 'Detailed visitor & engagement tracking' },
};

function TickerTape() {
  const { scanResults } = useStore();

  const tickers = scanResults.length > 0
    ? scanResults.slice(0, 20)
    : [
        { symbol: 'SPY', changePercent: 0.42 },
        { symbol: 'QQQ', changePercent: -0.18 },
        { symbol: 'AAPL', changePercent: 1.23 },
        { symbol: 'TSLA', changePercent: -2.15 },
        { symbol: 'NVDA', changePercent: 3.47 },
        { symbol: 'MSFT', changePercent: 0.89 },
        { symbol: 'AMZN', changePercent: -0.56 },
        { symbol: 'META', changePercent: 2.11 },
        { symbol: 'GOOG', changePercent: 0.34 },
        { symbol: 'AMD', changePercent: -1.78 },
      ];

  const items = [...tickers, ...tickers]; // duplicate for seamless loop

  return (
    <div className="flex-1 overflow-hidden mx-4 relative">
      <div className="absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-terminal-bg to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-terminal-bg to-transparent pointer-events-none" />
      <div className="overflow-hidden">
        <div className="ticker-tape flex items-center gap-6 py-1 whitespace-nowrap">
          {items.map((item, idx) => {
            const pct = 'changePercent' in item ? item.changePercent : 0;
            const colorClass = getChangeColor(pct);
            return (
              <div key={idx} className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-semibold text-terminal-text-primary">{item.symbol}</span>
                <span className={`text-xs font-mono ${colorClass}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
                <span className="text-terminal-border text-xs">|</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClockDisplay() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatted = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });

  return (
    <div className="flex flex-col items-end">
      <span className="text-xs font-mono text-terminal-text-primary tracking-tight">{formatted}</span>
      <span className="text-[10px] text-terminal-text-secondary">ET</span>
    </div>
  );
}

function MarketStatusChip() {
  const { marketStatus } = useStore();

  if (!marketStatus) return null;

  const config = {
    OPEN: { label: 'MARKET OPEN', cls: 'bg-terminal-green/10 text-terminal-green border-terminal-green/30', dot: 'bg-terminal-green animate-pulse' },
    PRE_MARKET: { label: 'PRE-MARKET', cls: 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30', dot: 'bg-terminal-yellow' },
    AFTER_HOURS: { label: 'AFTER HOURS', cls: 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30', dot: 'bg-terminal-yellow' },
    CLOSED: { label: 'MARKET CLOSED', cls: 'bg-terminal-red/10 text-terminal-red border-terminal-red/30', dot: 'bg-terminal-red' },
  }[marketStatus.status];

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wide ${config.cls}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}

export default function Header() {
  const { activeView, scanInProgress, lastScanTime } = useStore();
  const emit = useSocketEmit();
  const meta = VIEW_META[activeView];
  const [scanCooldown, setScanCooldown] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScanNow = () => {
    if (scanInProgress || scanCooldown) return;
    emit('trigger_scan');
    setScanCooldown(true);
    cooldownRef.current = setTimeout(() => setScanCooldown(false), 5000);
  };

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);

  return (
    <header className="bg-terminal-bg border-b border-terminal-border px-4 py-2.5 flex items-center gap-3 shrink-0">
      {/* Title */}
      <div className="min-w-[160px]">
        <h1 className="text-sm font-bold text-terminal-text-primary leading-none">{meta.title}</h1>
        <p className="text-[11px] text-terminal-text-secondary mt-0.5">{meta.subtitle}</p>
      </div>

      {/* Ticker Tape */}
      <TickerTape />

      {/* Right controls */}
      <div className="flex items-center gap-3 shrink-0">
        <MarketStatusChip />
        <ClockDisplay />

        {/* Scan progress / Scan button */}
        {scanInProgress ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-terminal-cyan/10 border border-terminal-cyan/20">
            <div className="w-3.5 h-3.5 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-terminal-cyan font-medium">Scanning...</span>
          </div>
        ) : (
          <button
            onClick={handleScanNow}
            disabled={scanCooldown}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${scanCooldown
                ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed'
                : 'bg-terminal-cyan text-black hover:bg-terminal-cyan/90 active:scale-95'
              }
            `}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            {scanCooldown ? 'Queued' : 'Scan Now'}
          </button>
        )}

        {lastScanTime && !scanInProgress && (
          <div className="hidden xl:flex flex-col items-end">
            <span className="text-[10px] text-terminal-text-secondary">Last scan</span>
            <span className="text-[11px] text-terminal-text-primary font-mono">
              {lastScanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
