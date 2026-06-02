import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface PageStat {
  page: string; views: number; uniqueVisitors: number; avgDurationSec: number;
}
interface CountryStat { country: string; views: number; }
interface DailyStat { date: string; views: number; sessions: number; users: number; }
interface Session {
  id: string; startedAt: string; lastActivity: string; country?: string; city?: string;
  userEmail?: string; tier: string; pageCount: number; totalDurationMs: number; pages: string[];
}
interface Summary {
  totalViews: number; prevTotalViews: number;
  uniqueSessions: number; prevUniqueSessions: number;
  uniqueUsers: number; avgSessionDurationSec: number;
}

const PAGE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', scanner: 'Scanner', alerts: 'Alerts', watchlist: 'Watchlist',
  settings: 'Settings', 'ai-analysis': 'AI Analysis', futures: 'Futures', journal: 'Trade Journal',
  news: 'News Feed', earnings: 'Earnings', calendar: 'Economic Cal.', heatmap: 'Heatmap',
  'pattern-scanner': 'Pattern Scanner', 'risk-calc': 'Risk Calc', 'multi-tf': 'Multi-TF',
  crypto: 'Crypto', 'paper-trade': 'Paper Trade', screener: 'Screener', options: 'Options',
  pricing: 'Pricing', admin: 'Admin', analytics: 'Analytics',
};

function pct(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function StatCard({ label, value, prev, suffix = '' }: { label: string; value: number; prev?: number; suffix?: string }) {
  const delta = prev !== undefined ? pct(value, prev) : null;
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
      <p className="text-[10px] text-terminal-text-secondary uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-terminal-text-primary tabular-nums">{value.toLocaleString()}{suffix}</p>
      {delta !== null && (
        <p className={`text-xs font-semibold mt-1 ${delta >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs prev period
        </p>
      )}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

type Tab = 'overview' | 'pages' | 'countries' | 'sessions';

export default function AnalyticsPage() {
  const { adminToken, isAdminLoggedIn, setActiveView } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary]     = useState<Summary | null>(null);
  const [pages, setPages]         = useState<PageStat[]>([]);
  const [countries, setCountries] = useState<CountryStat[]>([]);
  const [daily, setDaily]         = useState<DailyStat[]>([]);
  const [sessions, setSessions]   = useState<Session[]>([]);

  const headers = { Authorization: `Bearer ${adminToken}` };

  const fetchAll = useCallback(async () => {
    if (!isAdminLoggedIn) return;
    setLoading(true);
    try {
      const [sumRes, pagesRes, countryRes, dailyRes, sessRes] = await Promise.allSettled([
        axios.get(`/api/admin/analytics/summary?days=${days}`, { headers }),
        axios.get(`/api/admin/analytics/pages?days=${days}`, { headers }),
        axios.get(`/api/admin/analytics/countries?days=${days}`, { headers }),
        axios.get(`/api/admin/analytics/daily?days=${days}`, { headers }),
        axios.get('/api/admin/analytics/sessions?limit=100', { headers }),
      ]);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data.summary);
      if (pagesRes.status === 'fulfilled') setPages(pagesRes.value.data.pages ?? []);
      if (countryRes.status === 'fulfilled') setCountries(countryRes.value.data.countries ?? []);
      if (dailyRes.status === 'fulfilled') setDaily(dailyRes.value.data.daily ?? []);
      if (sessRes.status === 'fulfilled') setSessions(sessRes.value.data.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, [adminToken, isAdminLoggedIn, days]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!isAdminLoggedIn) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-terminal-text-secondary mb-3">Admin access required</p>
          <button onClick={() => setActiveView('admin')} className="px-4 py-2 bg-terminal-cyan text-black rounded-lg text-sm font-semibold">Go to Admin Login</button>
        </div>
      </div>
    );
  }

  const maxPageViews  = Math.max(...pages.map(p => p.views), 1);
  const maxCountryViews = Math.max(...countries.map(c => c.views), 1);
  const maxDaily = Math.max(...daily.map(d => d.views), 1);

  return (
    <div className="max-w-6xl space-y-4 pb-8">
      {/* Header */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-terminal-purple/10 rounded-lg border border-terminal-purple/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-terminal-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-terminal-text-primary">Analytics</h2>
              <p className="text-xs text-terminal-text-secondary">Detailed visitor & engagement data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {([7, 14, 30] as const).map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${days === d ? 'bg-terminal-cyan text-black' : 'bg-terminal-border/40 text-terminal-text-secondary hover:text-terminal-text-primary'}`}>
                {d}d
              </button>
            ))}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-terminal-border/40 text-terminal-text-secondary hover:text-terminal-text-primary transition-all">
              {loading ? '↻' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Page Views" value={summary.totalViews} prev={summary.prevTotalViews} />
          <StatCard label="Sessions" value={summary.uniqueSessions} prev={summary.prevUniqueSessions} />
          <StatCard label="Unique Users" value={summary.uniqueUsers} />
          <StatCard label="Avg Session" value={summary.avgSessionDurationSec} suffix="s" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-terminal-bg border border-terminal-border rounded-lg p-1 w-fit">
        {(['overview', 'pages', 'countries', 'sessions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-terminal-cyan/15 text-terminal-cyan' : 'text-terminal-text-secondary hover:text-terminal-text-primary'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview: daily chart */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-terminal-text-primary mb-4">Daily Traffic ({days}d)</h3>
            <div className="flex items-end gap-1 h-40">
              {daily.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-[10px] text-terminal-text-primary whitespace-nowrap z-10">
                    <p className="font-bold">{d.date}</p>
                    <p>Views: {d.views}</p>
                    <p>Sessions: {d.sessions}</p>
                    <p>Users: {d.users}</p>
                  </div>
                  <div className="w-full bg-terminal-cyan/70 rounded-sm"
                    style={{ height: `${Math.round((d.views / maxDaily) * 140)}px`, minHeight: d.views > 0 ? 2 : 0 }} />
                  <span className="text-[8px] text-terminal-text-secondary/50 rotate-90 origin-center mt-1 hidden md:block">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick page & country side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-terminal-text-primary mb-3">Top Pages</h3>
              <div className="space-y-2">
                {pages.slice(0, 8).map(p => (
                  <div key={p.page} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-terminal-text-primary font-medium">{PAGE_LABELS[p.page] ?? p.page}</span>
                      <span className="text-terminal-text-secondary tabular-nums">{p.views} views · {fmtDur(p.avgDurationSec)}</span>
                    </div>
                    <MiniBar value={p.views} max={maxPageViews} color="bg-terminal-cyan" />
                  </div>
                ))}
                {pages.length === 0 && <p className="text-xs text-terminal-text-secondary/50 py-4 text-center">No data yet</p>}
              </div>
            </div>
            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-terminal-text-primary mb-3">Top Countries</h3>
              <div className="space-y-2">
                {countries.slice(0, 8).map(c => (
                  <div key={c.country} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-terminal-text-primary font-medium">{c.country}</span>
                      <span className="text-terminal-text-secondary tabular-nums">{c.views} views</span>
                    </div>
                    <MiniBar value={c.views} max={maxCountryViews} color="bg-terminal-purple" />
                  </div>
                ))}
                {countries.length === 0 && <p className="text-xs text-terminal-text-secondary/50 py-4 text-center">No data yet — geo resolves after first real visitor</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pages tab */}
      {tab === 'pages' && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-terminal-bg border-b border-terminal-border">
              <tr>
                {['Page', 'Views', 'Unique Visitors', 'Avg Time'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] text-terminal-text-secondary uppercase tracking-widest font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/20">
              {pages.map(p => (
                <tr key={p.page} className="hover:bg-terminal-border/10 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-terminal-text-primary">{PAGE_LABELS[p.page] ?? p.page}</p>
                      <p className="text-[10px] text-terminal-text-secondary">{p.page}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold tabular-nums text-terminal-cyan">{p.views.toLocaleString()}</p>
                      <MiniBar value={p.views} max={maxPageViews} color="bg-terminal-cyan" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-terminal-text-primary">{p.uniqueVisitors.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-terminal-text-primary">{fmtDur(p.avgDurationSec)}</td>
                </tr>
              ))}
              {pages.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-terminal-text-secondary text-sm">No page view data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Countries tab */}
      {tab === 'countries' && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-terminal-bg border-b border-terminal-border">
              <tr>
                {['Rank', 'Country', 'Page Views', 'Share'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] text-terminal-text-secondary uppercase tracking-widest font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/20">
              {countries.map((c, i) => {
                const total = countries.reduce((s, x) => s + x.views, 0);
                const share = total > 0 ? Math.round((c.views / total) * 100) : 0;
                return (
                  <tr key={c.country} className="hover:bg-terminal-border/10 transition-colors">
                    <td className="px-4 py-3 text-sm text-terminal-text-secondary">#{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-terminal-text-primary">{c.country}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-bold tabular-nums text-terminal-purple">{c.views.toLocaleString()}</p>
                        <MiniBar value={c.views} max={maxCountryViews} color="bg-terminal-purple" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-terminal-text-secondary">{share}%</td>
                  </tr>
                );
              })}
              {countries.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-terminal-text-secondary text-sm">No country data yet — geo resolves from real visitor IPs</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sessions tab */}
      {tab === 'sessions' && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-terminal-bg border-b border-terminal-border">
              <tr>
                {['Started', 'User / Email', 'Country', 'Tier', 'Pages', 'Duration', 'Page Path'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] text-terminal-text-secondary uppercase tracking-widest font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/20">
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-terminal-border/10 transition-colors">
                  <td className="px-3 py-2.5 text-terminal-text-secondary whitespace-nowrap">
                    {new Date(s.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.userEmail
                      ? <span className="text-terminal-cyan font-semibold">{s.userEmail}</span>
                      : <span className="text-terminal-text-secondary/50">Anonymous</span>}
                  </td>
                  <td className="px-3 py-2.5 text-terminal-text-primary">{s.country ?? '—'}{s.city ? `, ${s.city}` : ''}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.tier === 'elite' ? 'bg-terminal-yellow/20 text-terminal-yellow' : s.tier === 'pro' ? 'bg-terminal-cyan/20 text-terminal-cyan' : 'bg-terminal-border/40 text-terminal-text-secondary'}`}>
                      {s.tier.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-terminal-text-primary">{s.pageCount}</td>
                  <td className="px-3 py-2.5 tabular-nums text-terminal-text-secondary">{fmtDur(Math.round(s.totalDurationMs / 1000))}</td>
                  <td className="px-3 py-2.5 text-terminal-text-secondary max-w-[180px] truncate" title={s.pages.join(' → ')}>
                    {s.pages.map(p => PAGE_LABELS[p] ?? p).join(' → ')}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-terminal-text-secondary text-sm">No sessions recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
