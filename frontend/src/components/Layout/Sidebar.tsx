import { useStore } from '../../store';
import type { ActiveView } from '../../types';

interface NavItem {
  id: ActiveView;
  label: string;
  icon: React.ReactNode;
}

function DashboardIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h3M3 12h3M3 17h3M18 7h3M18 12h3M18 17h3"/>
      <rect x="6" y="4" width="12" height="16" rx="2"/>
      <path d="M9 9l2 2 4-4"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.54A3 3 0 0 1 4.6 9.16a2.5 2.5 0 0 1 .3-4.67A2.5 2.5 0 0 1 9.5 2z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.54A3 3 0 0 0 19.4 9.16a2.5 2.5 0 0 0-.3-4.67A2.5 2.5 0 0 0 14.5 2z"/>
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}

export default function Sidebar() {
  const { activeView, setActiveView, alerts, watchlist, marketStatus } = useStore();

  const activeAlertCount = alerts.filter((a) => a.active).length;
  const watchlistCount = watchlist.length;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'scanner', label: 'Scanner', icon: <ScannerIcon /> },
    { id: 'alerts', label: 'Alerts', icon: <BellIcon /> },
    { id: 'watchlist', label: 'Watchlist', icon: <StarIcon /> },
    { id: 'ai-analysis', label: 'Analysis', icon: <BrainIcon /> },
    { id: 'futures', label: 'Futures', icon: <TrendingUpIcon /> },
    { id: 'journal', label: 'Journal', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    )},
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  const getMarketStatusColor = () => {
    if (!marketStatus) return 'bg-terminal-text-secondary';
    switch (marketStatus.status) {
      case 'OPEN': return 'bg-terminal-green';
      case 'PRE_MARKET':
      case 'AFTER_HOURS': return 'bg-terminal-yellow';
      case 'CLOSED': return 'bg-terminal-red';
      default: return 'bg-terminal-text-secondary';
    }
  };

  const getMarketStatusLabel = () => {
    if (!marketStatus) return 'Unknown';
    switch (marketStatus.status) {
      case 'OPEN': return 'Market Open';
      case 'PRE_MARKET': return 'Pre-Market';
      case 'AFTER_HOURS': return 'After Hours';
      case 'CLOSED': return 'Market Closed';
      default: return 'Unknown';
    }
  };

  const getMarketStatusTextColor = () => {
    if (!marketStatus) return 'text-terminal-text-secondary';
    switch (marketStatus.status) {
      case 'OPEN': return 'text-terminal-green';
      case 'PRE_MARKET':
      case 'AFTER_HOURS': return 'text-terminal-yellow';
      case 'CLOSED': return 'text-terminal-red';
      default: return 'text-terminal-text-secondary';
    }
  };

  return (
    <aside className="w-16 lg:w-56 bg-terminal-card border-r border-terminal-border flex flex-col shrink-0 z-20">
      {/* Logo */}
      <div className="px-3 lg:px-4 py-4 border-b border-terminal-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-terminal-cyan/10 rounded-lg flex items-center justify-center shrink-0 border border-terminal-cyan/20">
            <svg className="w-4 h-4 text-terminal-cyan" viewBox="0 0 24 24" fill="none">
              <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M6 12l3 3 3-6 3 4 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="hidden lg:block min-w-0">
            <div className="text-sm font-bold text-terminal-text-primary tracking-tight leading-none">
              Pattern<span className="text-terminal-cyan">Pulse</span>
            </div>
            <div className="text-xs text-terminal-text-secondary mt-0.5 truncate">Stock Scanner</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const badge =
              item.id === 'alerts' && activeAlertCount > 0
                ? activeAlertCount
                : item.id === 'watchlist' && watchlistCount > 0
                ? watchlistCount
                : null;

            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveView(item.id)}
                  className={`
                    nav-item w-full flex items-center gap-3 px-2.5 lg:px-3 py-2.5 rounded-lg text-left group relative
                    ${isActive
                      ? 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20'
                      : 'text-terminal-text-secondary hover:bg-terminal-border/40 hover:text-terminal-text-primary border border-transparent'
                    }
                  `}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="hidden lg:block text-sm font-medium flex-1 min-w-0 truncate">{item.label}</span>
                  {badge !== null && (
                    <span className={`
                      hidden lg:flex shrink-0 min-w-[18px] h-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1
                      ${item.id === 'alerts' ? 'bg-terminal-red/20 text-terminal-red' : 'bg-terminal-purple/20 text-terminal-purple'}
                    `}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {/* Mobile tooltip */}
                  <span className="lg:hidden absolute left-full ml-2 bg-terminal-card border border-terminal-border text-terminal-text-primary text-xs py-1 px-2 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    {item.label}
                    {badge !== null && ` (${badge})`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Market Status */}
      <div className="px-2 py-3 border-t border-terminal-border">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-terminal-bg/60">
          <div className={`w-2 h-2 rounded-full shrink-0 ${getMarketStatusColor()} ${marketStatus?.status === 'OPEN' ? 'animate-pulse' : ''}`} />
          <div className="hidden lg:block min-w-0">
            <div className={`text-xs font-medium ${getMarketStatusTextColor()} truncate`}>
              {getMarketStatusLabel()}
            </div>
            {marketStatus && (
              <div className="text-[10px] text-terminal-text-secondary truncate">
                VIX {marketStatus.vixLevel.toFixed(1)}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
