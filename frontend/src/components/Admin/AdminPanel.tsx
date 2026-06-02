import { useState, useEffect } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface AdminStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  eliteUsers: number;
}

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  tier: 'free' | 'pro' | 'elite';
  grantedFree: boolean;
  notes?: string;
}

interface AdminSettings {
  pricing: { pro: number; elite: number };
  maintenanceMode: boolean;
  welcomeMessage: string;
}

type AdminTab = 'stats' | 'users' | 'pricing' | 'settings';

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
    <div className="flex items-center justify-center min-h-full py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="w-10 h-10 bg-terminal-cyan/10 rounded-xl flex items-center justify-center border border-terminal-cyan/20">
              <svg className="w-5 h-5 text-terminal-cyan" viewBox="0 0 24 24" fill="none">
                <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 12l3 3 3-6 3 4 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-terminal-text-primary">
              Pattern<span className="text-terminal-cyan">Pulse</span>
            </span>
          </div>
          <h2 className="text-lg font-semibold text-terminal-text-primary">Admin Panel</h2>
          <p className="text-sm text-terminal-text-secondary mt-1">Sign in to manage users and settings</p>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-terminal-text-secondary mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-terminal-text-secondary mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg px-3 py-2 text-sm text-terminal-red">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-terminal-cyan text-black font-semibold py-2.5 rounded-lg text-sm hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatsTab({ adminToken }: { adminToken: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  useEffect(() => {
    axios.get('/api/admin/stats', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => setStats(r.data?.stats ?? r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminToken]);

  const runScan = async () => {
    setScanning(true);
    setScanMsg('');
    try {
      await axios.get('/api/health', { headers: { Authorization: `Bearer ${adminToken}` } });
      setScanMsg('Health check passed.');
    } catch {
      setScanMsg('Health check failed.');
    } finally {
      setScanning(false);
    }
  };

  const cards = [
    { label: 'Total Users', value: stats?.totalUsers ?? '—', color: 'text-terminal-cyan', border: 'border-terminal-cyan/20' },
    { label: 'Free Tier', value: stats?.freeUsers ?? '—', color: 'text-terminal-text-primary', border: 'border-terminal-border' },
    { label: 'Pro Tier', value: stats?.proUsers ?? '—', color: 'text-terminal-green', border: 'border-terminal-green/20' },
    { label: 'Elite Tier', value: stats?.eliteUsers ?? '—', color: 'text-terminal-purple', border: 'border-terminal-purple/20' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-terminal-text-primary uppercase tracking-wide">Site Statistics</h3>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-cyan text-black text-xs font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          {scanning ? 'Running...' : 'Run Scan Now'}
        </button>
      </div>

      {scanMsg && (
        <div className="bg-terminal-green/10 border border-terminal-green/30 rounded-lg px-4 py-2 text-sm text-terminal-green">
          {scanMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-terminal-text-secondary text-sm">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Loading stats...
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className={`bg-terminal-bg border ${card.border} rounded-xl p-4`}>
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-terminal-text-secondary mt-1">{card.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab({ adminToken }: { adminToken: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Partial<AdminUser>>>({});
  const [newEmail, setNewEmail] = useState('');
  const [newTier, setNewTier] = useState<'free' | 'pro' | 'elite'>('free');
  const [adding, setAdding] = useState(false);
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});

  const headers = { Authorization: `Bearer ${adminToken}` };

  useEffect(() => {
    axios.get('/api/admin/users', { headers })
      .then((r) => setUsers(r.data?.users ?? r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const setEdit = (id: string, field: keyof AdminUser, value: string | boolean) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveUser = async (user: AdminUser) => {
    const patch = edits[user.id] ?? {};
    try {
      await axios.patch(`/api/admin/users/${user.id}`, {
        tier: patch.tier ?? user.tier,
        grantedFree: patch.grantedFree ?? user.grantedFree,
        notes: patch.notes ?? user.notes,
      }, { headers });
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, ...patch } : u));
      setEdits((prev) => { const n = { ...prev }; delete n[user.id]; return n; });
      setSaveMsg((prev) => ({ ...prev, [user.id]: 'Saved!' }));
      setTimeout(() => setSaveMsg((prev) => { const n = { ...prev }; delete n[user.id]; return n; }), 2000);
    } catch {
      setSaveMsg((prev) => ({ ...prev, [user.id]: 'Error saving' }));
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await axios.delete(`/api/admin/users/${id}`, { headers });
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch { /* ignore */ }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const res = await axios.post('/api/admin/users', { email: newEmail.trim(), tier: newTier }, { headers });
      const created: AdminUser = res.data?.user ?? { id: Date.now().toString(), email: newEmail.trim(), tier: newTier, grantedFree: false };
      setUsers((prev) => [created, ...prev]);
      setNewEmail('');
      setNewTier('free');
    } catch { /* ignore */ } finally {
      setAdding(false);
    }
  };

  const tierBadge = (tier: string) => {
    const map: Record<string, string> = {
      free: 'bg-terminal-border/40 text-terminal-text-secondary',
      pro: 'bg-terminal-green/10 text-terminal-green',
      elite: 'bg-terminal-purple/10 text-terminal-purple',
    };
    return map[tier] ?? map.free;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-terminal-text-primary uppercase tracking-wide">User Management</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-terminal-text-secondary text-sm">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Loading users...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-terminal-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-terminal-border bg-terminal-bg/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Free?</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Notes</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {users.map((user) => {
                const edit = edits[user.id] ?? {};
                const currentTier = (edit.tier ?? user.tier) as 'free' | 'pro' | 'elite';
                const currentGranted = edit.grantedFree ?? user.grantedFree;
                const currentNotes = edit.notes ?? user.notes ?? '';
                return (
                  <tr key={user.id} className="hover:bg-terminal-bg/30 transition-colors">
                    <td className="px-4 py-3 text-terminal-text-primary font-mono text-xs">{user.email}</td>
                    <td className="px-4 py-3 text-terminal-text-secondary text-xs">{user.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={currentTier}
                        onChange={(e) => setEdit(user.id, 'tier', e.target.value)}
                        className={`text-xs rounded-full px-2 py-1 font-semibold border-0 outline-none cursor-pointer ${tierBadge(currentTier)}`}
                      >
                        <option value="free">FREE</option>
                        <option value="pro">PRO</option>
                        <option value="elite">ELITE</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEdit(user.id, 'grantedFree', !currentGranted)}
                        className={`w-8 h-5 rounded-full transition-colors relative ${currentGranted ? 'bg-terminal-green' : 'bg-terminal-border'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${currentGranted ? 'translate-x-3' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={currentNotes}
                        onChange={(e) => setEdit(user.id, 'notes', e.target.value)}
                        className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-xs text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50"
                        placeholder="Notes..."
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {saveMsg[user.id] && (
                          <span className={`text-xs ${saveMsg[user.id] === 'Saved!' ? 'text-terminal-green' : 'text-terminal-red'}`}>
                            {saveMsg[user.id]}
                          </span>
                        )}
                        <button
                          onClick={() => saveUser(user)}
                          className="px-2.5 py-1 bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20 rounded text-xs font-medium hover:bg-terminal-cyan/20 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="px-2.5 py-1 bg-terminal-red/10 text-terminal-red border border-terminal-red/20 rounded text-xs font-medium hover:bg-terminal-red/20 transition-colors"
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-terminal-text-secondary text-sm">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
        <h4 className="text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-3">Add User</h4>
        <form onSubmit={addUser} className="flex items-center gap-3 flex-wrap">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 min-w-48 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50"
            placeholder="user@example.com"
            required
          />
          <select
            value={newTier}
            onChange={(e) => setNewTier(e.target.value as 'free' | 'pro' | 'elite')}
            className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none"
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </select>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
          >
            {adding ? 'Adding...' : 'Add User'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PricingTab({ adminToken }: { adminToken: string }) {
  const [proPrince, setProPrice] = useState(29);
  const [elitePrice, setElitePrice] = useState(79);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${adminToken}` };

  useEffect(() => {
    axios.get('/api/admin/settings', { headers })
      .then((r) => {
        const s: AdminSettings = r.data?.settings ?? r.data;
        if (s?.pricing?.pro) setProPrice(s.pricing.pro);
        if (s?.pricing?.elite) setElitePrice(s.pricing.elite);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const savePricing = async () => {
    setSaving(true);
    setMsg('');
    try {
      await axios.patch('/api/admin/settings', { pricing: { pro: proPrince, elite: elitePrice } }, { headers });
      setMsg('Pricing saved!');
    } catch {
      setMsg('Error saving pricing');
    } finally {
      setSaving(false);
    }
  };

  const tiers = [
    {
      name: 'FREE',
      color: 'text-terminal-text-primary',
      features: ['Dashboard & Scanner', 'Price Alerts', 'Watchlist', 'Market News', 'Earnings Calendar', 'Economic Calendar'],
    },
    {
      name: 'PRO',
      color: 'text-terminal-green',
      features: ['Everything in Free', 'AI Technical Analysis', 'Pattern Scanner', 'Options Chain', 'Risk Calculator', 'Multi-Timeframe Analysis', 'Futures Markets', 'Trade Journal', 'Market Heatmap'],
    },
    {
      name: 'ELITE',
      color: 'text-terminal-purple',
      features: ['Everything in Pro', 'Crypto Dashboard', 'Paper Trading', 'Market Screener', 'Priority Support'],
    },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-terminal-text-primary uppercase tracking-wide">Pricing Configuration</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-terminal-text-secondary text-sm">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Loading settings...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <label className="block text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-2">Pro Price ($/mo)</label>
              <div className="flex items-center gap-2">
                <span className="text-terminal-text-secondary text-sm">$</span>
                <input
                  type="number"
                  value={proPrince}
                  onChange={(e) => setProPrice(Number(e.target.value))}
                  className="w-24 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-green font-mono focus:outline-none focus:border-terminal-cyan/50"
                  min={0}
                />
                <span className="text-terminal-text-secondary text-xs">per month</span>
              </div>
            </div>

            <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
              <label className="block text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-2">Elite Price ($/mo)</label>
              <div className="flex items-center gap-2">
                <span className="text-terminal-text-secondary text-sm">$</span>
                <input
                  type="number"
                  value={elitePrice}
                  onChange={(e) => setElitePrice(Number(e.target.value))}
                  className="w-24 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-purple font-mono focus:outline-none focus:border-terminal-cyan/50"
                  min={0}
                />
                <span className="text-terminal-text-secondary text-xs">per month</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={savePricing}
              disabled={saving}
              className="px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Pricing'}
            </button>
            {msg && (
              <span className={`text-sm ${msg.includes('Error') ? 'text-terminal-red' : 'text-terminal-green'}`}>{msg}</span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {tiers.map((tier) => (
              <div key={tier.name} className="bg-terminal-bg border border-terminal-border rounded-xl p-4">
                <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${tier.color}`}>{tier.name}</div>
                <ul className="space-y-1.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-terminal-text-secondary">
                      <span className={`mt-0.5 ${tier.color}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsTab({ adminToken }: { adminToken: string }) {
  const [maintenance, setMaintenance] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${adminToken}` };

  useEffect(() => {
    axios.get('/api/admin/settings', { headers })
      .then((r) => {
        const s: AdminSettings = r.data?.settings ?? r.data;
        if (typeof s?.maintenanceMode === 'boolean') setMaintenance(s.maintenanceMode);
        if (s?.welcomeMessage) setWelcomeMsg(s.welcomeMessage);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const saveSettings = async () => {
    setSaving(true);
    setMsg('');
    try {
      await axios.patch('/api/admin/settings', { maintenanceMode: maintenance, welcomeMessage: welcomeMsg }, { headers });
      setMsg('Settings saved!');
    } catch {
      setMsg('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-terminal-text-primary uppercase tracking-wide">Site Settings</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-terminal-text-secondary text-sm">
          <div className="w-4 h-4 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-4 max-w-lg">
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-terminal-text-primary">Maintenance Mode</div>
                <div className="text-xs text-terminal-text-secondary mt-0.5">Disable public access to the terminal</div>
              </div>
              <button
                onClick={() => setMaintenance((v) => !v)}
                className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${maintenance ? 'bg-terminal-red' : 'bg-terminal-border'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${maintenance ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="bg-terminal-card border border-terminal-border rounded-xl p-4">
            <label className="block text-xs font-semibold text-terminal-text-secondary uppercase tracking-wide mb-2">Welcome Message</label>
            <textarea
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              rows={4}
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50 resize-none"
              placeholder="Welcome message shown to users on first visit..."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {msg && (
              <span className={`text-sm ${msg.includes('Error') ? 'text-terminal-red' : 'text-terminal-green'}`}>{msg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { isAdminLoggedIn, adminToken, logoutAdmin } = useStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('stats');

  if (!isAdminLoggedIn || !adminToken) {
    return <LoginForm />;
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'stats', label: 'Stats' },
    { id: 'users', label: 'Users' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Admin Dashboard</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Manage users, pricing, and site settings</p>
        </div>
        <button
          onClick={logoutAdmin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-terminal-red/10 text-terminal-red border border-terminal-red/20 rounded-lg text-xs font-medium hover:bg-terminal-red/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-terminal-card border border-terminal-border rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/20'
                : 'text-terminal-text-secondary hover:text-terminal-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-6">
        {activeTab === 'stats' && <StatsTab adminToken={adminToken} />}
        {activeTab === 'users' && <UsersTab adminToken={adminToken} />}
        {activeTab === 'pricing' && <PricingTab adminToken={adminToken} />}
        {activeTab === 'settings' && <SettingsTab adminToken={adminToken} />}
      </div>
    </div>
  );
}
