import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null, decimals = 2) {
  if (n == null) return '—';
  return n >= 0 ? `+${n.toFixed(decimals)}` : n.toFixed(decimals);
}

function fmtPrice(n: number | null) {
  if (n == null) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcPnl(entry: JournalEntry) {
  if (entry.entryPrice && entry.exitPrice && entry.size) {
    const raw = entry.direction === 'LONG'
      ? (entry.exitPrice - entry.entryPrice) * entry.size
      : (entry.entryPrice - entry.exitPrice) * entry.size;
    const pct = entry.direction === 'LONG'
      ? ((entry.exitPrice - entry.entryPrice) / entry.entryPrice) * 100
      : ((entry.entryPrice - entry.exitPrice) / entry.entryPrice) * 100;
    return { pnl: raw, pct };
  }
  if (entry.pnl != null) return { pnl: entry.pnl, pct: entry.pnlPercent };
  return null;
}

const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Gap Fill', 'EMA Bounce', 'Support Test', 'Resistance Fade', 'Momentum', 'Pattern', 'Other'];

// ── Entry form ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  symbol: '', direction: 'LONG' as 'LONG' | 'SHORT', status: 'OPEN' as JournalEntry['status'],
  entryPrice: '', exitPrice: '', stopLoss: '', target: '', size: '',
  entryDate: new Date().toISOString().slice(0, 10), exitDate: '',
  setup: '', notes: '', tags: '',
};

function EntryForm({ initial, onSave, onCancel }: {
  initial?: Partial<JournalEntry>;
  onSave: (data: Omit<JournalEntry, 'id' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(initial ? {
      symbol: initial.symbol ?? '',
      direction: initial.direction ?? 'LONG',
      status: initial.status ?? 'OPEN',
      entryPrice: initial.entryPrice?.toString() ?? '',
      exitPrice: initial.exitPrice?.toString() ?? '',
      stopLoss: initial.stopLoss?.toString() ?? '',
      target: initial.target?.toString() ?? '',
      size: initial.size?.toString() ?? '',
      entryDate: initial.entryDate?.slice(0, 10) ?? EMPTY_FORM.entryDate,
      exitDate: initial.exitDate?.slice(0, 10) ?? '',
      setup: initial.setup ?? '',
      notes: initial.notes ?? '',
      tags: (initial.tags ?? []).join(', '),
    } : {}),
  });
  const [saving, setSaving] = useState(false);

  const n = (v: string) => v.trim() === '' ? null : parseFloat(v);

  const handleSave = async () => {
    if (!form.symbol.trim()) return;
    setSaving(true);
    const ep = n(form.entryPrice);
    const xp = n(form.exitPrice);
    const sz = n(form.size);
    let pnl = null, pct = null;
    if (ep && xp && sz) {
      pnl = form.direction === 'LONG' ? (xp - ep) * sz : (ep - xp) * sz;
      pct = form.direction === 'LONG' ? ((xp - ep) / ep) * 100 : ((ep - xp) / ep) * 100;
    }
    await onSave({
      symbol: form.symbol.toUpperCase(),
      direction: form.direction,
      status: form.status,
      entryPrice: ep,
      exitPrice: xp,
      stopLoss: n(form.stopLoss),
      target: n(form.target),
      size: sz,
      entryDate: form.entryDate,
      exitDate: form.exitDate || null,
      pnl, pnlPercent: pct,
      setup: form.setup,
      notes: form.notes,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
  };

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/40 focus:outline-none focus:border-terminal-cyan/50 font-mono"
      />
    </div>
  );

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-terminal-text-primary">{initial ? 'Edit Trade' : 'Log New Trade'}</h3>

      <div className="grid grid-cols-2 gap-3">
        {field('Symbol', 'symbol', 'text', 'SI=F, AAPL…')}
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Direction</label>
          <div className="flex gap-2">
            {(['LONG', 'SHORT'] as const).map((d) => (
              <button key={d} onClick={() => setForm((f) => ({ ...f, direction: d }))}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                  form.direction === d
                    ? d === 'LONG' ? 'bg-terminal-green/20 border-terminal-green/50 text-terminal-green' : 'bg-terminal-red/20 border-terminal-red/50 text-terminal-red'
                    : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
                }`}>{d === 'LONG' ? '▲ Long' : '▼ Short'}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {field('Entry Price', 'entryPrice', 'number', '0.00')}
        {field('Exit Price', 'exitPrice', 'number', '0.00')}
        {field('Size / Qty', 'size', 'number', '1')}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {field('Stop Loss', 'stopLoss', 'number', '0.00')}
        {field('Target', 'target', 'number', '0.00')}
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as JournalEntry['status'] }))}
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50">
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('Entry Date', 'entryDate', 'date')}
        {field('Exit Date', 'exitDate', 'date')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Setup</label>
          <select value={form.setup} onChange={(e) => setForm((f) => ({ ...f, setup: e.target.value }))}
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50">
            <option value="">— Select setup —</option>
            {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {field('Tags (comma separated)', 'tags', 'text', 'silver, breakout, morning')}
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Notes / Thesis</label>
        <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3} placeholder="Why you took this trade, what you saw, lessons learned…"
          className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/40 resize-none focus:outline-none focus:border-terminal-cyan/50" />
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-terminal-border text-sm text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-cyan/30 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.symbol.trim()}
          className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm disabled:opacity-40 hover:bg-terminal-cyan/90 transition-colors">
          {saving ? 'Saving…' : 'Save Trade'}
        </button>
      </div>
    </div>
  );
}

// ── Stats row ─────────────────────────────────────────────────────────────────

function Stats({ entries }: { entries: JournalEntry[] }) {
  const closed = entries.filter((e) => e.status === 'CLOSED');
  const wins = closed.filter((e) => (calcPnl(e)?.pnl ?? 0) > 0);
  const totalPnl = closed.reduce((acc, e) => acc + (calcPnl(e)?.pnl ?? 0), 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, e) => a + (calcPnl(e)?.pct ?? 0), 0) / wins.length : 0;
  const losses = closed.filter((e) => (calcPnl(e)?.pnl ?? 0) <= 0);
  const avgLoss = losses.length > 0 ? losses.reduce((a, e) => a + (calcPnl(e)?.pct ?? 0), 0) / losses.length : 0;

  const stat = (label: string, value: string, color: string) => (
    <div className="bg-terminal-bg border border-terminal-border rounded-lg px-4 py-3 text-center">
      <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {stat('Total Trades', String(closed.length), 'text-terminal-text-primary')}
      {stat('Win Rate', `${winRate}%`, winRate >= 55 ? 'text-terminal-green' : winRate >= 40 ? 'text-terminal-yellow' : 'text-terminal-red')}
      {stat('Total P&L', `$${totalPnl.toFixed(0)}`, totalPnl >= 0 ? 'text-terminal-green' : 'text-terminal-red')}
      {stat('Avg Win', `${avgWin.toFixed(1)}%`, 'text-terminal-green')}
      {stat('Avg Loss', `${avgLoss.toFixed(1)}%`, 'text-terminal-red')}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ entry, onEdit, onDelete }: { entry: JournalEntry; onEdit: () => void; onDelete: () => void }) {
  const pnlData = calcPnl(entry);
  const isWin = (pnlData?.pnl ?? 0) > 0;
  const statusColor = entry.status === 'OPEN' ? 'text-terminal-cyan bg-terminal-cyan/10 border-terminal-cyan/25' :
    entry.status === 'CANCELLED' ? 'text-terminal-text-secondary bg-terminal-border/30 border-transparent' :
    isWin ? 'text-terminal-green bg-terminal-green/10 border-terminal-green/25' : 'text-terminal-red bg-terminal-red/10 border-terminal-red/25';

  return (
    <tr className="border-b border-terminal-border/40 hover:bg-terminal-border/10 transition-colors">
      <td className="px-3 py-2.5">
        <p className="text-sm font-bold font-mono text-terminal-text-primary">{entry.symbol}</p>
        <p className="text-[10px] text-terminal-text-secondary">{entry.entryDate}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${entry.direction === 'LONG' ? 'text-terminal-green bg-terminal-green/10 border-terminal-green/25' : 'text-terminal-red bg-terminal-red/10 border-terminal-red/25'}`}>
          {entry.direction === 'LONG' ? '▲ L' : '▼ S'}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-sm text-terminal-text-primary tabular-nums">{fmtPrice(entry.entryPrice)}</td>
      <td className="px-3 py-2.5 font-mono text-sm text-terminal-text-secondary tabular-nums">{fmtPrice(entry.exitPrice)}</td>
      <td className="px-3 py-2.5 font-mono text-sm tabular-nums">
        {pnlData ? (
          <span className={pnlData.pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>
            {fmt(pnlData.pnl, 0)} ({fmt(pnlData.pct, 1)}%)
          </span>
        ) : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-terminal-text-secondary">{entry.setup || '—'}</td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusColor}`}>{entry.status}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-[10px] px-2 py-1 rounded border border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/50 hover:text-terminal-cyan transition-colors">Edit</button>
          <button onClick={onDelete} className="text-[10px] px-2 py-1 rounded border border-terminal-border text-terminal-text-secondary hover:border-terminal-red/40 hover:text-terminal-red transition-colors">Del</button>
        </div>
      </td>
    </tr>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TradeJournal() {
  const { journal, setJournal, addJournalEntry, updateJournalEntry, removeJournalEntry } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get<{ journal: JournalEntry[] }>('/api/journal');
      setJournal(res.data.journal ?? []);
    } catch { /* use local state */ }
  }, [setJournal]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Omit<JournalEntry, 'id' | 'createdAt'>) => {
    if (editEntry) {
      try {
        const res = await axios.put<{ entry: JournalEntry }>(`/api/journal/${editEntry.id}`, data);
        updateJournalEntry(editEntry.id, res.data.entry);
      } catch { updateJournalEntry(editEntry.id, { ...editEntry, ...data }); }
      setEditEntry(null);
    } else {
      try {
        const res = await axios.post<{ entry: JournalEntry }>('/api/journal', data);
        addJournalEntry(res.data.entry);
      } catch { addJournalEntry({ ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() }); }
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trade?')) return;
    try { await axios.delete(`/api/journal/${id}`); } catch { /* ok */ }
    removeJournalEntry(id);
  };

  const displayed = journal
    .filter((e) => filter === 'ALL' || e.status === filter)
    .filter((e) => !search || e.symbol.includes(search.toUpperCase()) || e.setup?.toLowerCase().includes(search.toLowerCase()) || e.notes?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary">Trade Journal</h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Log your entries, exits, and track performance</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditEntry(null); }}
          className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-semibold text-sm hover:bg-terminal-cyan/90 transition-colors">
          + Log Trade
        </button>
      </div>

      {/* Stats */}
      {journal.length > 0 && <Stats entries={journal} />}

      {/* Form */}
      {(showForm || editEntry) && (
        <EntryForm
          initial={editEntry ?? undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="flex gap-1">
          {(['ALL', 'OPEN', 'CLOSED'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded border font-semibold transition-colors ${
                filter === f ? 'bg-terminal-cyan/20 border-terminal-cyan/50 text-terminal-cyan' : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
              }`}>{f}</button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol, setup…"
          className="ml-auto bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1 text-xs text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 w-48" />
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-12 text-center">
          <p className="text-terminal-text-secondary text-sm">No trades yet. Click <strong className="text-terminal-cyan">+ Log Trade</strong> to start tracking.</p>
        </div>
      ) : (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-bg/50">
                  {['Symbol', 'Dir', 'Entry', 'Exit', 'P&L', 'Setup', 'Status', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((e) => (
                  <Row key={e.id} entry={e} onEdit={() => { setEditEntry(e); setShowForm(false); }} onDelete={() => handleDelete(e.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
