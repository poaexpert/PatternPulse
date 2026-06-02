import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  tier: 'free' | 'pro' | 'elite';
  grantedFree: boolean;
  notes?: string;
  createdAt: string;
  lastSeen?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeStatus?: string;
}

interface AdminSettings {
  pricing: { pro: number; elite: number };
  maintenanceMode: boolean;
  welcomeMessage: string;
}

interface StripeConfig {
  configured: boolean;
  hasProPrice: boolean;
  hasElitePrice: boolean;
  hasWebhookSecret: boolean;
  liveMode: boolean;
}

interface StripeRevenue {
  configured: boolean;
  mrr: number;
  subscriptions: StripeSubscription[];
  recentPayments: StripePayment[];
}

interface StripeSubscription {
  id: string;
  email: string;
  plan: string;
  amount: number;
  status: string;
  created: string;
  renewsAt: string;
}

interface StripePayment {
  id: string;
  amount: number;
  currency: string;
  email: string;
  status: string;
  created: string;
}

interface AnalyticsSummary {
  totalViews: number;
  uniqueSessions: number;
  avgDurationMs: number;
  topPage: string;
}

interface PageStat {
  page: string;
  views: number;
  uniqueSessions: number;
  avgDurationMs: number;
}

interface CountryStat {
  country: string;
  views: number;
  sessions: number;
}

interface SessionRecord {
  sessionId: string;
  userEmail?: string;
  country?: string;
  city?: string;
  tier: string;
  pageCount: number;
  totalDurationMs: number;
  startedAt: string;
  lastSeen: string;
}

type AdminTab = 'overview' | 'users' | 'revenue' | 'analytics' | 'settings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function fmtDuration(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TierBadge({ tier }: { tier: string }) {
  const cls = tier === 'elite'
    ? 'bg-terminal-purple/10 text-terminal-purple border-terminal-purple/20'
    : tier === 'pro'
    ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20'
    : 'bg-terminal-border/30 text-terminal-text-secondary border-terminal-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      {tier.toUpperCase()}
    </span>
  );
}

function StatCard({ label, value, sub, color = 'text-terminal-cyan' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-terminal-bg border border-terminal-border rounded-xl p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-terminal-text-secondary mt-1">{label}</div>
      {sub && <div className="text-[10px] text-terminal-text-secondary/60 mt-0.5">{sub}</div>}
    </div>
  );
}

function MiniBar({ pct, color = 'bg-terminal-cyan' }: { pct: number; color?: string }) {
  return (
    <div className="w-24 h-1.5 bg-terminal-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function LoginForm() {
  const { setAdminToken } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/admin/login', { username, password });
      if (res.data?.success && res.data?.token) {
        setAdminToken(res.data.token);
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-terminal-cyan/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-terminal-cyan/20">
            <svg className="w-7 h-7 text-terminal-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-terminal-text-primary">Admin Portal</h2>
          <p className="text-sm text-terminal-text-secondary mt-1">Sign in to manage PatternPulse</p>
        </div>
        <div className="bg-terminal-card border border-terminal-border rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-1.5">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50"
                placeholder="admin" required autoComplete="username" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50"
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg px-3 py-2 text-sm text-terminal-red">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-terminal-cyan text-black font-bold py-2.5 rounded-lg text-sm hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ token }: { token: string }) {
  const [stats, setStats] = useState<{ total: number; free: number; pro: number; elite: number } | null>(null);
  const [revenue, setRevenue] = useState<{ mrr: number; configured: boolean } | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const h = authHeader(token);

  useEffect(() => {
    const fetch = async () => {
      const [statsRes, revenueRes, analyticsRes, usersRes] = await Promise.allSettled([
        axios.get('/api/admin/stats', { headers: h }),
        axios.get('/api/stripe/revenue', { headers: h }),
        axios.get('/api/admin/analytics/summary?days=7', { headers: h }),
        axios.get('/api/admin/users', { headers: h }),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data?.users ?? null);
      if (revenueRes.status === 'fulfilled') setRevenue({ mrr: revenueRes.value.data?.mrr ?? 0, configured: revenueRes.value.data?.configured ?? false });
      if (analyticsRes.status === 'fulfilled') setAnalyticsSummary(analyticsRes.value.data?.summary ?? null);
      if (usersRes.status === 'fulfilled') {
        const all: AdminUser[] = usersRes.value.data?.users ?? [];
        setRecentUsers([...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5));
      }
    };
    fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const { setActiveView } = useStore();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.total ?? '—'} color="text-terminal-cyan" />
        <StatCard label="PRO Subscribers" value={stats?.pro ?? '—'} color="text-terminal-green" />
        <StatCard label="ELITE Subscribers" value={stats?.elite ?? '—'} color="text-terminal-purple" />
        <StatCard label="Monthly Revenue" value={revenue?.configured ? `$${(revenue.mrr).toFixed(0)}` : '—'} sub={revenue?.configured ? 'MRR (Stripe)' : 'Configure Stripe'} color="text-terminal-yellow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard label="Page Views (7d)" value={analyticsSummary?.totalViews ?? '—'} color="text-terminal-cyan" />
        <StatCard label="Unique Sessions (7d)" value={analyticsSummary?.uniqueSessions ?? '—'} color="text-terminal-text-primary" />
        <StatCard label="Avg Session" value={analyticsSummary ? fmtDuration(analyticsSummary.avgDurationMs) : '—'} color="text-terminal-text-primary" />
      </div>

      {/* Recent users */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
          <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Recent Signups</span>
          <button onClick={() => {}} className="text-xs text-terminal-cyan hover:underline">View all users →</button>
        </div>
        <div className="divide-y divide-terminal-border">
          {recentUsers.length === 0 && <div className="px-4 py-6 text-sm text-terminal-text-secondary text-center">No users yet</div>}
          {recentUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-terminal-text-primary font-medium">{u.email}</div>
                <div className="text-xs text-terminal-text-secondary">{fmtDate(u.createdAt)}</div>
              </div>
              <TierBadge tier={u.tier} />
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Manage Users', icon: '👥', tab: 'users' as AdminTab },
          { label: 'View Revenue', icon: '💳', tab: 'revenue' as AdminTab },
          { label: 'Analytics', icon: '📊', tab: 'analytics' as AdminTab },
          { label: 'Site Settings', icon: '⚙️', tab: 'settings' as AdminTab },
        ].map(q => (
          <button key={q.label} onClick={() => setActiveView('admin')} className="flex items-center gap-2 px-4 py-3 bg-terminal-card border border-terminal-border rounded-xl text-sm text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-cyan/30 transition-all">
            <span>{q.icon}</span>
            <span>{q.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ token }: { token: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [edits, setEdits] = useState<Record<string, Partial<AdminUser>>>({});
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState<'free' | 'pro' | 'elite'>('pro');
  const [adding, setAdding] = useState(false);
  const h = authHeader(token);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/users', { headers: h });
      setUsers(res.data?.users ?? []);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === 'all' || u.tier === filterTier;
    return matchSearch && matchTier;
  });

  const setEdit = (id: string, field: keyof AdminUser, value: unknown) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveUser = async (user: AdminUser) => {
    const patch = edits[user.id] ?? {};
    try {
      await axios.patch(`/api/admin/users/${user.id}`, {
        tier: patch.tier ?? user.tier,
        grantedFree: patch.grantedFree ?? user.grantedFree,
        notes: patch.notes ?? user.notes ?? '',
        name: patch.name ?? user.name ?? '',
      }, { headers: h });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...patch } : u));
      setEdits(prev => { const n = { ...prev }; delete n[user.id]; return n; });
      setSaveMsg(prev => ({ ...prev, [user.id]: '✓ Saved' }));
      setTimeout(() => setSaveMsg(prev => { const n = { ...prev }; delete n[user.id]; return n; }), 2000);
    } catch {
      setSaveMsg(prev => ({ ...prev, [user.id]: 'Error' }));
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/admin/users/${id}`, { headers: h });
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch { /* ignore */ }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const res = await axios.post('/api/admin/users', { email: newEmail.trim(), tier: newTier }, { headers: h });
      const created: AdminUser = res.data?.user ?? { id: Date.now().toString(), email: newEmail.trim(), tier: newTier, grantedFree: false, createdAt: new Date().toISOString() };
      setUsers(prev => [created, ...prev]);
      setNewEmail('');
    } finally {
      setAdding(false);
    }
  };

  const tierCls = (tier: string) => tier === 'elite'
    ? 'bg-terminal-purple/10 text-terminal-purple'
    : tier === 'pro'
    ? 'bg-terminal-green/10 text-terminal-green'
    : 'bg-terminal-border/30 text-terminal-text-secondary';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
          placeholder="Search by email or name…" />
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none">
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="elite">Elite</option>
        </select>
        <span className="text-xs text-terminal-text-secondary">{filtered.length} of {users.length}</span>
        <button onClick={load} className="px-3 py-2 bg-terminal-border/30 text-terminal-text-secondary text-xs rounded-lg hover:bg-terminal-border/50 transition-colors">Refresh</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-terminal-text-secondary text-sm justify-center">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Loading users…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-terminal-border">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-terminal-border bg-terminal-bg/60">
                {['Email', 'Name', 'Tier', 'Free Grant', 'Stripe', 'Joined', 'Last Seen', 'Notes', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {filtered.map(user => {
                const edit = edits[user.id] ?? {};
                const tier = (edit.tier ?? user.tier) as 'free' | 'pro' | 'elite';
                const granted = edit.grantedFree ?? user.grantedFree;
                return (
                  <tr key={user.id} className="hover:bg-terminal-bg/30 transition-colors group">
                    <td className="px-3 py-2.5 font-mono text-xs text-terminal-text-primary max-w-[160px] truncate">{user.email}</td>
                    <td className="px-3 py-2.5">
                      <input type="text" defaultValue={user.name ?? ''} onChange={e => setEdit(user.id, 'name', e.target.value)}
                        className="w-24 bg-transparent border-0 text-xs text-terminal-text-secondary focus:outline-none focus:bg-terminal-bg focus:border focus:border-terminal-border rounded px-1" placeholder="—" />
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={tier} onChange={e => setEdit(user.id, 'tier', e.target.value)}
                        className={`text-[11px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none ${tierCls(tier)}`}>
                        <option value="free">FREE</option>
                        <option value="pro">PRO</option>
                        <option value="elite">ELITE</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setEdit(user.id, 'grantedFree', !granted)}
                        className={`w-8 h-5 rounded-full transition-colors relative shrink-0 ${granted ? 'bg-terminal-green' : 'bg-terminal-border'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${granted ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {user.stripeSubscriptionId
                        ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${user.stripeStatus === 'active' ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-yellow/10 text-terminal-yellow'}`}>{user.stripeStatus ?? 'active'}</span>
                        : <span className="text-[10px] text-terminal-text-secondary/50">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-terminal-text-secondary whitespace-nowrap">{fmtDate(user.createdAt)}</td>
                    <td className="px-3 py-2.5 text-[10px] text-terminal-text-secondary whitespace-nowrap">{user.lastSeen ? fmtDate(user.lastSeen) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <input type="text" defaultValue={user.notes ?? ''} onChange={e => setEdit(user.id, 'notes', e.target.value)}
                        className="w-32 bg-transparent border-0 text-xs text-terminal-text-secondary focus:outline-none focus:bg-terminal-bg focus:border focus:border-terminal-border rounded px-1" placeholder="Notes…" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {saveMsg[user.id] && <span className={`text-[10px] ${saveMsg[user.id].startsWith('✓') ? 'text-terminal-green' : 'text-terminal-red'}`}>{saveMsg[user.id]}</span>}
                        <button onClick={() => saveUser(user)} className="px-2 py-1 bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20 rounded text-[10px] font-semibold hover:bg-terminal-cyan/20 transition-colors">Save</button>
                        <button onClick={() => deleteUser(user.id)} className="px-2 py-1 bg-terminal-red/10 text-terminal-red border border-terminal-red/20 rounded text-[10px] hover:bg-terminal-red/20 transition-colors">Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-terminal-text-secondary text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add user */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <h4 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-3">Add User Manually</h4>
        <form onSubmit={addUser} className="flex items-center gap-3 flex-wrap">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className="flex-1 min-w-48 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50"
            placeholder="user@example.com" required />
          <select value={newTier} onChange={e => setNewTier(e.target.value as 'free'|'pro'|'elite')}
            className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </select>
          <button type="submit" disabled={adding}
            className="px-4 py-2 bg-terminal-cyan text-black text-sm font-bold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60">
            {adding ? 'Adding…' : '+ Add User'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Revenue Tab ──────────────────────────────────────────────────────────────

function RevenueTab({ token }: { token: string }) {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [revenue, setRevenue] = useState<StripeRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const h = authHeader(token);

  useEffect(() => {
    const fetch = async () => {
      const [cfgRes, revRes] = await Promise.allSettled([
        axios.get('/api/stripe/config-status', { headers: h }),
        axios.get('/api/stripe/revenue', { headers: h }),
      ]);
      if (cfgRes.status === 'fulfilled') setConfig(cfgRes.value.data);
      if (revRes.status === 'fulfilled') setRevenue(revRes.value.data);
      setLoading(false);
    };
    fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-terminal-text-secondary text-sm justify-center">
      <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
      Loading revenue data…
    </div>
  );

  if (!config?.configured) {
    return (
      <div className="space-y-6">
        <div className="bg-terminal-yellow/5 border border-terminal-yellow/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-terminal-yellow shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <div className="text-sm font-semibold text-terminal-yellow">Stripe Not Connected</div>
              <p className="text-xs text-terminal-yellow/80 mt-1">Add these environment variables in your Railway dashboard to accept credit card payments.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { key: 'STRIPE_SECRET_KEY', desc: 'Your Stripe secret key (sk_live_... or sk_test_...)' },
            { key: 'STRIPE_PRO_PRICE_ID', desc: 'Price ID for PRO monthly subscription (price_...)' },
            { key: 'STRIPE_ELITE_PRICE_ID', desc: 'Price ID for ELITE monthly subscription (price_...)' },
            { key: 'STRIPE_WEBHOOK_SECRET', desc: 'Webhook signing secret from Stripe dashboard (whsec_...)' },
            { key: 'APP_URL', desc: 'Your public Railway URL (e.g. https://patternpulse.up.railway.app)' },
          ].map(v => (
            <div key={v.key} className="bg-terminal-bg border border-terminal-border rounded-lg p-3">
              <div className="font-mono text-sm text-terminal-cyan">{v.key}</div>
              <div className="text-xs text-terminal-text-secondary mt-0.5">{v.desc}</div>
            </div>
          ))}
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-terminal-text-primary mb-3">Setup Steps</h4>
          <ol className="space-y-2 text-sm text-terminal-text-secondary list-decimal list-inside">
            <li>Create a free account at <span className="text-terminal-cyan">stripe.com</span></li>
            <li>In Stripe: go to Products → Create two recurring products (PRO $29/mo, ELITE $79/mo)</li>
            <li>Copy each product's Price ID (starts with <span className="font-mono text-terminal-text-primary">price_</span>)</li>
            <li>In Railway: Settings → Variables → add all the env vars above</li>
            <li>In Stripe Webhooks: add endpoint <span className="font-mono text-xs text-terminal-text-primary">/api/stripe/webhook</span>, copy the signing secret</li>
            <li>Deploy — users can now pay by card and tiers activate automatically</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Config status chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Stripe Connected', ok: config.configured },
          { label: config.liveMode ? 'Live Mode' : 'Test Mode', ok: config.liveMode, warn: !config.liveMode },
          { label: 'PRO Price', ok: config.hasProPrice },
          { label: 'ELITE Price', ok: config.hasElitePrice },
          { label: 'Webhook Secret', ok: config.hasWebhookSecret },
        ].map(s => (
          <span key={s.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.ok ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/20' : 'bg-terminal-red/10 text-terminal-red border-terminal-red/20'}`}>
            {s.ok ? '✓' : '✗'} {s.label}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard label="Monthly Recurring Revenue" value={`$${(revenue?.mrr ?? 0).toFixed(2)}`} color="text-terminal-green" sub="Active subscriptions only" />
        <StatCard label="Active Subscriptions" value={revenue?.subscriptions?.length ?? 0} color="text-terminal-cyan" />
        <StatCard label="Recent Payments (25)" value={revenue?.recentPayments?.length ?? 0} color="text-terminal-text-primary" />
      </div>

      {/* Subscriptions */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Active Subscriptions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-terminal-border">
                {['Email', 'Plan', 'Amount', 'Status', 'Started', 'Renews'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {(revenue?.subscriptions ?? []).map(sub => (
                <tr key={sub.id} className="hover:bg-terminal-card/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-terminal-text-primary">{sub.email}</td>
                  <td className="px-4 py-3"><TierBadge tier={sub.plan} /></td>
                  <td className="px-4 py-3 text-terminal-green font-semibold text-xs">${sub.amount}/mo</td>
                  <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-terminal-green/10 text-terminal-green font-semibold">{sub.status}</span></td>
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary">{fmtDate(sub.created)}</td>
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary">{fmtDate(sub.renewsAt)}</td>
                </tr>
              ))}
              {(revenue?.subscriptions ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-terminal-text-secondary text-sm">No active subscriptions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent payments */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Recent Payments</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-terminal-border">
                {['Email', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {(revenue?.recentPayments ?? []).map(p => (
                <tr key={p.id} className="hover:bg-terminal-card/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-terminal-text-primary">{p.email}</td>
                  <td className="px-4 py-3 text-terminal-green font-semibold text-xs">${p.amount.toFixed(2)} {p.currency}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.status === 'succeeded' ? 'bg-terminal-green/10 text-terminal-green' : 'bg-terminal-red/10 text-terminal-red'}`}>{p.status}</span></td>
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary">{fmtTime(p.created)}</td>
                </tr>
              ))}
              {(revenue?.recentPayments ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-terminal-text-secondary text-sm">No recent payments</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ token }: { token: string }) {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [pages, setPages] = useState<PageStat[]>([]);
  const [countries, setCountries] = useState<CountryStat[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const h = authHeader(token);

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, pagesRes, countriesRes, sessionsRes] = await Promise.allSettled([
      axios.get(`/api/admin/analytics/summary?days=${days}`, { headers: h }),
      axios.get(`/api/admin/analytics/pages?days=${days}`, { headers: h }),
      axios.get(`/api/admin/analytics/countries?days=${days}`, { headers: h }),
      axios.get('/api/admin/analytics/sessions?limit=50', { headers: h }),
    ]);
    if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data?.summary ?? null);
    if (pagesRes.status === 'fulfilled') setPages(pagesRes.value.data?.pages ?? []);
    if (countriesRes.status === 'fulfilled') setCountries(countriesRes.value.data?.countries ?? []);
    if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data?.sessions ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, days]);

  useEffect(() => { load(); }, [load]);

  const maxPageViews = Math.max(...pages.map(p => p.views), 1);
  const maxCountryViews = Math.max(...countries.map(c => c.views), 1);

  return (
    <div className="space-y-5">
      {/* Day filter */}
      <div className="flex items-center gap-2">
        {[7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${days === d ? 'bg-terminal-cyan text-black' : 'bg-terminal-border/30 text-terminal-text-secondary hover:text-terminal-text-primary'}`}>
            {d}d
          </button>
        ))}
        {loading && <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin ml-2" />}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Views" value={summary?.totalViews ?? '—'} color="text-terminal-cyan" />
        <StatCard label="Unique Sessions" value={summary?.uniqueSessions ?? '—'} color="text-terminal-text-primary" />
        <StatCard label="Avg Session" value={summary ? fmtDuration(summary.avgDurationMs) : '—'} color="text-terminal-text-primary" />
        <StatCard label="Top Page" value={summary?.topPage ?? '—'} color="text-terminal-purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Pages */}
        <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-terminal-border">
            <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Top Pages</span>
          </div>
          <div className="divide-y divide-terminal-border">
            {pages.slice(0, 10).map(p => (
              <div key={p.page} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-terminal-text-primary truncate">{p.page}</div>
                  <div className="text-[10px] text-terminal-text-secondary">{p.uniqueSessions} sessions · {fmtDuration(p.avgDurationMs)} avg</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <MiniBar pct={(p.views / maxPageViews) * 100} color="bg-terminal-cyan" />
                  <span className="text-xs text-terminal-text-primary font-semibold w-8 text-right">{p.views}</span>
                </div>
              </div>
            ))}
            {pages.length === 0 && <div className="px-4 py-6 text-center text-sm text-terminal-text-secondary">No data yet</div>}
          </div>
        </div>

        {/* Countries */}
        <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-terminal-border">
            <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Countries</span>
          </div>
          <div className="divide-y divide-terminal-border">
            {countries.slice(0, 10).map(c => (
              <div key={c.country} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-terminal-text-primary truncate">{c.country ?? 'Unknown'}</div>
                  <div className="text-[10px] text-terminal-text-secondary">{c.sessions} sessions</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <MiniBar pct={(c.views / maxCountryViews) * 100} color="bg-terminal-purple" />
                  <span className="text-xs text-terminal-text-primary font-semibold w-8 text-right">{c.views}</span>
                </div>
              </div>
            ))}
            {countries.length === 0 && <div className="px-4 py-6 text-center text-sm text-terminal-text-secondary">No data yet</div>}
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <span className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Recent Sessions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-terminal-border">
                {['Started', 'User', 'Location', 'Tier', 'Pages', 'Duration'].map(hd => (
                  <th key={hd} className="text-left px-4 py-2.5 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wide">{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {sessions.map(s => (
                <tr key={s.sessionId} className="hover:bg-terminal-card/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary whitespace-nowrap">{fmtTime(s.startedAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-terminal-text-primary truncate max-w-[140px]">{s.userEmail ?? <span className="text-terminal-text-secondary/50">Anonymous</span>}</td>
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary">{s.city && s.country ? `${s.city}, ${s.country}` : s.country ?? '—'}</td>
                  <td className="px-4 py-3"><TierBadge tier={s.tier} /></td>
                  <td className="px-4 py-3 text-xs text-terminal-text-primary">{s.pageCount}</td>
                  <td className="px-4 py-3 text-xs text-terminal-text-secondary">{fmtDuration(s.totalDurationMs)}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-terminal-text-secondary text-sm">No sessions recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ token }: { token: string }) {
  const [settings, setSettings] = useState<AdminSettings>({ pricing: { pro: 29, elite: 79 }, maintenanceMode: false, welcomeMessage: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const h = authHeader(token);

  useEffect(() => {
    axios.get('/api/admin/settings', { headers: h })
      .then(r => setSettings(r.data?.settings ?? settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await axios.patch('/api/admin/settings', settings, { headers: h });
      setMsg('✓ Settings saved');
    } catch {
      setMsg('Error saving');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-12 text-terminal-text-secondary text-sm justify-center">
      <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Maintenance mode */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-terminal-text-primary">Maintenance Mode</div>
            <div className="text-xs text-terminal-text-secondary mt-0.5">Takes the site offline for all non-admin users</div>
          </div>
          <button onClick={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.maintenanceMode ? 'bg-terminal-red' : 'bg-terminal-border'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.maintenanceMode ? 'translate-x-5.5' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Welcome / Banner message */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-5">
        <label className="block text-sm font-semibold text-terminal-text-primary mb-1">Site Banner Message</label>
        <p className="text-xs text-terminal-text-secondary mb-3">Shown as a banner at the top of every page. Leave blank to hide.</p>
        <textarea value={settings.welcomeMessage} onChange={e => setSettings(s => ({ ...s, welcomeMessage: e.target.value }))}
          rows={3} className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50 resize-none"
          placeholder="e.g. 🎉 New feature launched! Check out the Pattern Scanner..." />
      </div>

      {/* Pricing */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-5">
        <div className="text-sm font-semibold text-terminal-text-primary mb-4">Subscription Pricing</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-terminal-green uppercase tracking-wide mb-2">PRO ($/month)</label>
            <div className="flex items-center gap-2">
              <span className="text-terminal-text-secondary">$</span>
              <input type="number" value={settings.pricing.pro} min={0}
                onChange={e => setSettings(s => ({ ...s, pricing: { ...s.pricing, pro: Number(e.target.value) } }))}
                className="w-24 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-green font-mono focus:outline-none focus:border-terminal-cyan/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-terminal-purple uppercase tracking-wide mb-2">ELITE ($/month)</label>
            <div className="flex items-center gap-2">
              <span className="text-terminal-text-secondary">$</span>
              <input type="number" value={settings.pricing.elite} min={0}
                onChange={e => setSettings(s => ({ ...s, pricing: { ...s.pricing, elite: Number(e.target.value) } }))}
                className="w-24 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-purple font-mono focus:outline-none focus:border-terminal-cyan/50" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 bg-terminal-cyan text-black text-sm font-bold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith('✓') ? 'text-terminal-green' : 'text-terminal-red'}`}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { isAdminLoggedIn, adminToken, logoutAdmin } = useStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  if (!isAdminLoggedIn || !adminToken) {
    return <LoginForm />;
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'overview',   label: 'Overview',   icon: '📊' },
    { id: 'users',      label: 'Users',      icon: '👥' },
    { id: 'revenue',    label: 'Revenue',    icon: '💳' },
    { id: 'analytics',  label: 'Analytics',  icon: '📈' },
    { id: 'settings',   label: 'Settings',   icon: '⚙️' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Admin Portal</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Full control over users, payments, analytics and settings</p>
        </div>
        <button onClick={logoutAdmin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-red/10 text-terminal-red border border-terminal-red/20 rounded-lg text-xs font-medium hover:bg-terminal-red/20 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-terminal-card border border-terminal-border rounded-xl p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20'
                : 'text-terminal-text-secondary hover:text-terminal-text-primary'
            }`}>
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-5">
        {activeTab === 'overview'  && <OverviewTab  token={adminToken} />}
        {activeTab === 'users'     && <UsersTab     token={adminToken} />}
        {activeTab === 'revenue'   && <RevenueTab   token={adminToken} />}
        {activeTab === 'analytics' && <AnalyticsTab token={adminToken} />}
        {activeTab === 'settings'  && <SettingsTab  token={adminToken} />}
      </div>
    </div>
  );
}
