import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
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

  const items = [...tickers, ...tickers];

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

function AccountMenu() {
  const { userTier, userEmail, setUserTier, setUserEmail, isAdminLoggedIn, logoutAdmin, setActiveView } = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'account' | 'admin'>('account');
  const menuRef = useRef<HTMLDivElement>(null);

  // Account activation state
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');

  // Admin login state
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const { setAdminToken } = useStore();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    setLookupMsg('');
    try {
      const res = await axios.get(`/api/admin/users/check?email=${encodeURIComponent(lookupEmail.trim())}`);
      const found = res.data?.user ?? res.data;
      if (found?.tier) {
        setUserTier(found.tier as 'free' | 'pro' | 'elite');
        setUserEmail(lookupEmail.trim());
        setLookupMsg(`✓ ${(found.tier as string).toUpperCase()} access activated!`);
      } else {
        setLookupMsg('No account found for that email.');
      }
    } catch {
      setLookupMsg('No account found for that email.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminLoading(true);
    try {
      const res = await axios.post('/api/admin/login', { username: adminUser, password: adminPass });
      if (res.data?.success && res.data?.token) {
        setAdminToken(res.data.token);
        setOpen(false);
        setActiveView('admin');
      } else {
        setAdminError('Invalid credentials');
      }
    } catch {
      setAdminError('Invalid credentials');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSignOut = () => {
    setUserTier('free');
    setUserEmail(null);
    setLookupMsg('');
    setLookupEmail('');
  };

  const tierColor = userTier === 'elite'
    ? 'text-terminal-purple border-terminal-purple/30 bg-terminal-purple/10'
    : userTier === 'pro'
    ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10'
    : 'text-terminal-text-secondary border-terminal-border bg-terminal-border/20';

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
          open ? 'bg-terminal-card border-terminal-border' : 'hover:bg-terminal-card border-transparent hover:border-terminal-border'
        } ${tierColor}`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span className="hidden sm:block">{userEmail ? userEmail.split('@')[0] : userTier.toUpperCase()}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-terminal-card border border-terminal-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-terminal-border">
            <button
              onClick={() => setTab('account')}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === 'account' ? 'text-terminal-cyan bg-terminal-cyan/5' : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}
            >
              My Account
            </button>
            <button
              onClick={() => setTab('admin')}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === 'admin' ? 'text-terminal-cyan bg-terminal-cyan/5' : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}
            >
              {isAdminLoggedIn ? '⚙ Admin Panel' : 'Admin Login'}
            </button>
          </div>

          <div className="p-4">
            {tab === 'account' && (
              <div className="space-y-4">
                {/* Current status */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-terminal-text-secondary">Current Plan</div>
                    <div className={`text-sm font-bold mt-0.5 ${
                      userTier === 'elite' ? 'text-terminal-purple' : userTier === 'pro' ? 'text-terminal-green' : 'text-terminal-text-primary'
                    }`}>{userTier.toUpperCase()}</div>
                    {userEmail && <div className="text-xs text-terminal-text-secondary mt-0.5 truncate max-w-[180px]">{userEmail}</div>}
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    {userTier === 'free' && (
                      <button
                        onClick={() => { setOpen(false); setActiveView('pricing'); }}
                        className="px-3 py-1.5 bg-terminal-cyan text-black text-xs font-bold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
                      >
                        Upgrade
                      </button>
                    )}
                    {userEmail && (
                      <button onClick={handleSignOut} className="text-[11px] text-terminal-text-secondary hover:text-terminal-red transition-colors">
                        Sign out
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-terminal-border pt-3">
                  <p className="text-xs text-terminal-text-secondary mb-2">Already have an account? Enter your email to activate access.</p>
                  <form onSubmit={handleLookup} className="space-y-2">
                    <input
                      type="email"
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                      placeholder="your@email.com"
                      required
                    />
                    <button
                      type="submit"
                      disabled={lookupLoading}
                      className="w-full py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
                    >
                      {lookupLoading ? 'Checking...' : 'Activate Account'}
                    </button>
                  </form>
                  {lookupMsg && (
                    <p className={`text-xs mt-2 ${lookupMsg.startsWith('✓') ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {lookupMsg}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => { setOpen(false); setActiveView('pricing'); }}
                  className="w-full py-2 border border-terminal-border rounded-lg text-xs text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-cyan/30 transition-colors"
                >
                  View Plans & Pricing
                </button>
              </div>
            )}

            {tab === 'admin' && (
              <div className="space-y-3">
                {isAdminLoggedIn ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-terminal-green font-medium">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      Logged in as Admin
                    </div>
                    <button
                      onClick={() => { setOpen(false); setActiveView('admin'); }}
                      className="w-full py-2.5 bg-terminal-cyan text-black text-sm font-bold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
                    >
                      Open Admin Dashboard
                    </button>
                    <button
                      onClick={() => { logoutAdmin(); setOpen(false); }}
                      className="w-full py-2 border border-terminal-red/30 text-terminal-red text-xs font-medium rounded-lg hover:bg-terminal-red/10 transition-colors"
                    >
                      Logout Admin
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-terminal-text-secondary">Admin access only. Enter credentials to manage users, pricing and settings.</p>
                    <form onSubmit={handleAdminLogin} className="space-y-2">
                      <input
                        type="text"
                        value={adminUser}
                        onChange={(e) => setAdminUser(e.target.value)}
                        className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                        placeholder="Username"
                        autoComplete="username"
                        required
                      />
                      <input
                        type="password"
                        value={adminPass}
                        onChange={(e) => setAdminPass(e.target.value)}
                        className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                        placeholder="Password"
                        autoComplete="current-password"
                        required
                      />
                      {adminError && (
                        <p className="text-xs text-terminal-red">{adminError}</p>
                      )}
                      <button
                        type="submit"
                        disabled={adminLoading}
                        className="w-full py-2.5 bg-terminal-cyan text-black text-sm font-bold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
                      >
                        {adminLoading ? 'Signing in...' : 'Sign In as Admin'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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

        {/* Account / Admin menu */}
        <AccountMenu />
      </div>
    </header>
  );
}
