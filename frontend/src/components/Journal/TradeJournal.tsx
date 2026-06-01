import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Gap Fill', 'EMA Bounce',
  'Support Test', 'Resistance Fade', 'Momentum', 'Pattern', 'News Play', 'Other'];

function calcPnl(e: JournalEntry) {
  if (e.entryPrice && e.exitPrice && e.size) {
    const raw = e.direction === 'LONG'
      ? (e.exitPrice - e.entryPrice) * e.size
      : (e.entryPrice - e.exitPrice) * e.size;
    const pct = e.direction === 'LONG'
      ? ((e.exitPrice - e.entryPrice) / e.entryPrice) * 100
      : ((e.entryPrice - e.exitPrice) / e.entryPrice) * 100;
    return { pnl: raw, pct };
  }
  if (e.pnl != null) return { pnl: e.pnl, pct: e.pnlPercent };
  return null;
}

const fp = (n: number | null) =>
  n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) =>
  n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const num = (s: string) => (s.trim() === '' ? null : parseFloat(s));

// ── Quick-close modal (for OPEN trades) ──────────────────────────────────────

function CloseModal({ entry, onClose, onSave }: {
  entry: JournalEntry;
  onClose: () => void;
  onSave: (exitPrice: number, exitDate: string, notes: string) => Promise<void>;
}) {
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [saving, setSaving] = useState(false);

  const ep = num(exitPrice);
  const preview = ep && entry.entryPrice && entry.size
    ? (entry.direction === 'LONG'
        ? (ep - entry.entryPrice) * entry.size
        : (entry.entryPrice - ep) * entry.size)
    : null;
  const previewPct = ep && entry.entryPrice
    ? (entry.direction === 'LONG'
        ? ((ep - entry.entryPrice) / entry.entryPrice) * 100
        : ((entry.entryPrice - ep) / entry.entryPrice) * 100)
    : null;

  const handleSave = async () => {
    if (!ep) return;
    setSaving(true);
    await onSave(ep, exitDate, notes);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-terminal-card border border-terminal-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Close Trade</h2>
            <p className={`text-xs font-semibold ${entry.direction === 'LONG' ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {entry.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'} {entry.symbol} @ {fp(entry.entryPrice)}
              {entry.size && ` × ${entry.size}`}
            </p>
          </div>
          <button onClick={onClose} className="text-terminal-text-secondary hover:text-terminal-text-primary text-lg">✕</button>
        </div>

        {/* Exit price */}
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1.5">Exit Price *</label>
          <input
            type="number"
            autoFocus
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ep && handleSave()}
            placeholder="0.00"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-4 py-3 text-xl font-bold text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/60 transition-colors"
          />
        </div>

        {/* Live P&L preview */}
        {preview != null && (
          <div className={`rounded-xl p-4 border-2 text-center ${
            preview >= 0
              ? 'bg-terminal-green/10 border-terminal-green/40'
              : 'bg-terminal-red/10 border-terminal-red/40'
          }`}>
            <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1">Realised P&L</p>
            <p className={`text-3xl font-black tabular-nums ${preview >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {preview >= 0 ? '+' : ''}${Math.abs(preview).toFixed(2)}
            </p>
            <p className={`text-sm font-semibold mt-0.5 ${preview >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {pct(previewPct)}
            </p>
          </div>
        )}

        {/* Exit date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Exit Date</label>
            <input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Stop was</label>
            <input type="text" readOnly value={fp(entry.stopLoss)}
              className="w-full bg-terminal-bg/50 border border-terminal-border/50 rounded-lg px-3 py-1.5 text-sm text-terminal-text-secondary font-mono" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Trade Notes / Lessons</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="What worked, what didn't, lessons learned…"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/40 resize-none focus:outline-none focus:border-terminal-cyan/50" />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-terminal-border text-sm text-terminal-text-secondary hover:text-terminal-text-primary transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !ep}
            className="flex-1 py-2.5 rounded-lg bg-terminal-cyan text-terminal-bg font-bold text-sm disabled:opacity-40 hover:bg-terminal-cyan/90 transition-colors">
            {saving ? 'Saving…' : 'Close Trade ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit drawer (slide-in from right) ────────────────────────────────────────

function EditDrawer({ entry, onClose, onSave }: {
  entry: JournalEntry;
  onClose: () => void;
  onSave: (data: Partial<JournalEntry>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    symbol: entry.symbol ?? '',
    direction: entry.direction ?? 'LONG',
    status: entry.status ?? 'OPEN',
    entryPrice: entry.entryPrice?.toString() ?? '',
    exitPrice: entry.exitPrice?.toString() ?? '',
    stopLoss: entry.stopLoss?.toString() ?? '',
    target: entry.target?.toString() ?? '',
    size: entry.size?.toString() ?? '',
    entryDate: entry.entryDate?.slice(0, 10) ?? '',
    exitDate: entry.exitDate?.slice(0, 10) ?? '',
    setup: entry.setup ?? '',
    notes: entry.notes ?? '',
    tags: (entry.tags ?? []).join(', '),
  });
  const [saving, setSaving] = useState(false);

  const f = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={form[key] as string}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/40 focus:outline-none focus:border-terminal-cyan/50 font-mono" />
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    const ep = num(form.entryPrice), xp = num(form.exitPrice), sz = num(form.size);
    let pnlVal = null, pctVal = null;
    if (ep && xp && sz) {
      pnlVal = form.direction === 'LONG' ? (xp - ep) * sz : (ep - xp) * sz;
      pctVal = form.direction === 'LONG' ? ((xp - ep) / ep) * 100 : ((ep - xp) / ep) * 100;
    }
    await onSave({
      symbol: form.symbol.toUpperCase(),
      direction: form.direction as 'LONG' | 'SHORT',
      status: form.status as JournalEntry['status'],
      entryPrice: ep, exitPrice: xp,
      stopLoss: num(form.stopLoss), target: num(form.target), size: sz,
      entryDate: form.entryDate, exitDate: form.exitDate || null,
      pnl: pnlVal, pnlPercent: pctVal,
      setup: form.setup, notes: form.notes,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-terminal-card border-l border-terminal-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-terminal-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-terminal-text-primary">Edit Trade</h2>
            <p className="text-xs text-terminal-text-secondary font-mono">{entry.symbol} · logged {entry.createdAt?.slice(0, 10)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-terminal-border text-terminal-text-secondary hover:text-terminal-text-primary hover:border-terminal-cyan/40 transition-colors">✕</button>
        </div>

        {/* Form (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Symbol + Direction */}
          <div className="grid grid-cols-2 gap-3">
            {f('Symbol', 'symbol')}
            <div>
              <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Direction</label>
              <div className="flex gap-1.5">
                {(['LONG', 'SHORT'] as const).map((d) => (
                  <button key={d} onClick={() => setForm((p) => ({ ...p, direction: d }))}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      form.direction === d
                        ? d === 'LONG' ? 'bg-terminal-green/20 border-terminal-green/50 text-terminal-green' : 'bg-terminal-red/20 border-terminal-red/50 text-terminal-red'
                        : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
                    }`}>{d === 'LONG' ? '▲ Long' : '▼ Short'}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Status</label>
            <div className="flex gap-1.5">
              {(['OPEN', 'CLOSED', 'CANCELLED'] as const).map((s) => (
                <button key={s} onClick={() => setForm((p) => ({ ...p, status: s }))}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    form.status === s
                      ? s === 'OPEN' ? 'bg-terminal-cyan/20 border-terminal-cyan/50 text-terminal-cyan'
                        : s === 'CLOSED' ? 'bg-terminal-green/20 border-terminal-green/50 text-terminal-green'
                        : 'bg-terminal-border text-terminal-text-secondary border-terminal-border'
                      : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            {f('Entry $', 'entryPrice', 'number', '0.00')}
            {f('Exit $', 'exitPrice', 'number', '0.00')}
            {f('Size', 'size', 'number', '1')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {f('Stop Loss', 'stopLoss', 'number', '0.00')}
            {f('Target', 'target', 'number', '0.00')}
          </div>

          {/* Live P&L preview */}
          {(() => {
            const ep = num(form.entryPrice), xp = num(form.exitPrice), sz = num(form.size);
            if (!ep || !xp || !sz) return null;
            const p = form.direction === 'LONG' ? (xp - ep) * sz : (ep - xp) * sz;
            const pc = form.direction === 'LONG' ? ((xp - ep) / ep) * 100 : ((ep - xp) / ep) * 100;
            return (
              <div className={`rounded-lg p-3 border text-center ${p >= 0 ? 'bg-terminal-green/10 border-terminal-green/30' : 'bg-terminal-red/10 border-terminal-red/30'}`}>
                <p className="text-[10px] text-terminal-text-secondary mb-0.5">P&L Preview</p>
                <p className={`text-xl font-bold tabular-nums ${p >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  {p >= 0 ? '+' : ''}${Math.abs(p).toFixed(2)} <span className="text-sm">({pct(pc)})</span>
                </p>
              </div>
            );
          })()}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {f('Entry Date', 'entryDate', 'date')}
            {f('Exit Date', 'exitDate', 'date')}
          </div>

          {/* Setup */}
          <div>
            <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Setup</label>
            <select value={form.setup} onChange={(e) => setForm((p) => ({ ...p, setup: e.target.value }))}
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50">
              <option value="">— Select —</option>
              {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider mb-1">Notes / Thesis / Lessons</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={4}
              placeholder="Why you took the trade, what you saw, what you'd do differently…"
              className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary/40 resize-none focus:outline-none focus:border-terminal-cyan/50" />
          </div>

          {f('Tags (comma separated)', 'tags', 'text', 'silver, morning, breakout')}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-terminal-border flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-terminal-border text-sm text-terminal-text-secondary hover:text-terminal-text-primary transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-terminal-cyan text-terminal-bg font-bold text-sm disabled:opacity-40 hover:bg-terminal-cyan/90 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function Stats({ entries }: { entries: JournalEntry[] }) {
  const closed = entries.filter((e) => e.status === 'CLOSED');
  const open = entries.filter((e) => e.status === 'OPEN');
  const wins = closed.filter((e) => (calcPnl(e)?.pnl ?? 0) > 0);
  const losses = closed.filter((e) => (calcPnl(e)?.pnl ?? 0) <= 0);
  const totalPnl = closed.reduce((a, e) => a + (calcPnl(e)?.pnl ?? 0), 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWinDollar = wins.length > 0 ? wins.reduce((a, e) => a + (calcPnl(e)?.pnl ?? 0), 0) / wins.length : 0;
  const avgLossDollar = losses.length > 0 ? Math.abs(losses.reduce((a, e) => a + (calcPnl(e)?.pnl ?? 0), 0) / losses.length) : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, e) => a + (calcPnl(e)?.pct ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, e) => a + (calcPnl(e)?.pct ?? 0), 0) / losses.length : 0;
  const grossWin = wins.reduce((a, e) => a + (calcPnl(e)?.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, e) => a + (calcPnl(e)?.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : wins.length > 0 ? Infinity : 0;
  const allPnls = closed.map(e => calcPnl(e)?.pnl ?? 0);
  const bestTrade = allPnls.length > 0 ? Math.max(...allPnls) : 0;
  const worstTrade = allPnls.length > 0 ? Math.min(...allPnls) : 0;

  const stat = (label: string, value: string, color: string, sub?: string) => (
    <div className="bg-terminal-bg border border-terminal-border rounded-lg px-3 py-3 text-center">
      <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-terminal-text-secondary mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {stat('Total Trades', String(closed.length + open.length), 'text-terminal-cyan', `${open.length} open`)}
        {stat('Win Rate', `${winRate}%`, winRate >= 55 ? 'text-terminal-green' : winRate >= 40 ? 'text-terminal-yellow' : 'text-terminal-red', `${wins.length}W / ${losses.length}L`)}
        {stat('Avg Win $', `$${avgWinDollar.toFixed(0)}`, 'text-terminal-green', `${avgWin.toFixed(1)}%`)}
        {stat('Avg Loss $', `$${avgLossDollar.toFixed(0)}`, 'text-terminal-red', `${avgLoss.toFixed(1)}%`)}
        {stat('Profit Factor', isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞', profitFactor >= 1.5 ? 'text-terminal-green' : profitFactor >= 1 ? 'text-terminal-yellow' : 'text-terminal-red')}
        {stat('Total P&L', `$${totalPnl.toFixed(0)}`, totalPnl >= 0 ? 'text-terminal-green' : 'text-terminal-red')}
      </div>
      {allPnls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {stat('Best Trade', `$${bestTrade.toFixed(0)}`, 'text-terminal-green')}
          {stat('Worst Trade', `$${worstTrade.toFixed(0)}`, 'text-terminal-red')}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ entry, onEdit, onClose, onDelete }: {
  entry: JournalEntry;
  onEdit: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const pnlData = calcPnl(entry);
  const isWin = (pnlData?.pnl ?? 0) > 0;
  const isOpen = entry.status === 'OPEN';

  return (
    <tr className="border-b border-terminal-border/40 hover:bg-terminal-border/10 transition-colors group">
      <td className="px-3 py-2.5">
        <p className="text-sm font-bold font-mono text-terminal-text-primary">{entry.symbol}</p>
        <p className="text-[10px] text-terminal-text-secondary">{entry.entryDate}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${entry.direction === 'LONG' ? 'text-terminal-green bg-terminal-green/10 border-terminal-green/25' : 'text-terminal-red bg-terminal-red/10 border-terminal-red/25'}`}>
          {entry.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-sm text-terminal-text-primary tabular-nums">{fp(entry.entryPrice)}</td>
      <td className="px-3 py-2.5 font-mono text-sm text-terminal-text-secondary tabular-nums">
        {isOpen ? <span className="text-terminal-cyan/60 text-[10px]">live…</span> : fp(entry.exitPrice)}
      </td>
      <td className="px-3 py-2.5 font-mono text-sm tabular-nums">
        {pnlData ? (
          <span className={pnlData.pnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}>
            {pnlData.pnl >= 0 ? '+' : ''}${Math.abs(pnlData.pnl).toFixed(0)}
            <span className="text-[10px] ml-1 opacity-70">({pct(pnlData.pct)})</span>
          </span>
        ) : isOpen ? <span className="text-terminal-text-secondary/40 text-[10px]">open</span> : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-terminal-text-secondary hidden sm:table-cell">{entry.setup || '—'}</td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
          isOpen ? 'text-terminal-cyan bg-terminal-cyan/10 border-terminal-cyan/25 animate-pulse' :
          entry.status === 'CANCELLED' ? 'text-terminal-text-secondary bg-terminal-border/30 border-transparent' :
          isWin ? 'text-terminal-green bg-terminal-green/10 border-terminal-green/25' : 'text-terminal-red bg-terminal-red/10 border-terminal-red/25'
        }`}>{entry.status}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          {/* Close button — only for OPEN trades */}
          {isOpen && (
            <button onClick={onClose}
              className="text-[10px] px-2 py-1 rounded border border-terminal-green/40 bg-terminal-green/10 text-terminal-green hover:bg-terminal-green/20 font-semibold transition-colors whitespace-nowrap">
              ✓ Close
            </button>
          )}
          <button onClick={onEdit}
            className="text-[10px] px-2 py-1 rounded border border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/50 hover:text-terminal-cyan transition-colors">
            Edit
          </button>
          <button onClick={onDelete}
            className="text-[10px] px-2 py-1 rounded border border-terminal-border text-terminal-text-secondary hover:border-terminal-red/40 hover:text-terminal-red transition-colors">
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── New trade form (inline, compact) ─────────────────────────────────────────

function NewTradeForm({ onSave, onCancel }: {
  onSave: (data: Omit<JournalEntry, 'id' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    symbol: '', direction: 'LONG' as 'LONG' | 'SHORT',
    entryPrice: '', stopLoss: '', target: '', size: '',
    entryDate: new Date().toISOString().slice(0, 10),
    setup: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.symbol.trim()) return;
    setSaving(true);
    await onSave({
      symbol: form.symbol.toUpperCase(),
      direction: form.direction,
      status: 'OPEN',
      entryPrice: num(form.entryPrice),
      exitPrice: null, exitDate: null,
      stopLoss: num(form.stopLoss),
      target: num(form.target),
      size: num(form.size),
      entryDate: form.entryDate,
      pnl: null, pnlPercent: null,
      setup: form.setup, notes: form.notes, tags: [],
    });
    setSaving(false);
  };

  return (
    <div className="bg-terminal-card border border-terminal-cyan/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-terminal-cyan animate-pulse" />
        <h3 className="text-sm font-bold text-terminal-text-primary">Log New Trade</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-1">
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Symbol</label>
          <input type="text" autoFocus value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))}
            placeholder="SI=F, AAPL…"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/50 uppercase" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Direction</label>
          <div className="flex gap-1">
            {(['LONG', 'SHORT'] as const).map((d) => (
              <button key={d} onClick={() => setForm((p) => ({ ...p, direction: d }))}
                className={`flex-1 py-1.5 rounded border text-[11px] font-bold transition-colors ${
                  form.direction === d
                    ? d === 'LONG' ? 'bg-terminal-green/20 border-terminal-green/50 text-terminal-green' : 'bg-terminal-red/20 border-terminal-red/50 text-terminal-red'
                    : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary'
                }`}>{d === 'LONG' ? '▲ L' : '▼ S'}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Entry $</label>
          <input type="number" value={form.entryPrice} onChange={(e) => setForm((p) => ({ ...p, entryPrice: e.target.value }))} placeholder="0.00"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/50" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Size</label>
          <input type="number" value={form.size} onChange={(e) => setForm((p) => ({ ...p, size: e.target.value }))} placeholder="1"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/50" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Stop Loss</label>
          <input type="number" value={form.stopLoss} onChange={(e) => setForm((p) => ({ ...p, stopLoss: e.target.value }))} placeholder="0.00"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/50" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Target</label>
          <input type="number" value={form.target} onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))} placeholder="0.00"
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary font-mono focus:outline-none focus:border-terminal-cyan/50" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Entry Date</label>
          <input type="date" value={form.entryDate} onChange={(e) => setForm((p) => ({ ...p, entryDate: e.target.value }))}
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-terminal-text-secondary uppercase mb-1">Setup</label>
          <select value={form.setup} onChange={(e) => setForm((p) => ({ ...p, setup: e.target.value }))}
            className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1.5 text-sm text-terminal-text-primary focus:outline-none focus:border-terminal-cyan/50">
            <option value="">— Type —</option>
            {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-terminal-border text-sm text-terminal-text-secondary hover:text-terminal-text-primary transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || !form.symbol.trim()}
          className="px-5 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-bold text-sm disabled:opacity-40 hover:bg-terminal-cyan/90 transition-colors">
          {saving ? 'Logging…' : '+ Log Trade'}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TradeJournal() {
  const { journal, setJournal, addJournalEntry, updateJournalEntry, removeJournalEntry } = useStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [closeEntry, setCloseEntry] = useState<JournalEntry | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get<{ journal: JournalEntry[] }>('/api/journal');
      setJournal(res.data.journal ?? []);
    } catch { /* fallback to local */ }
  }, [setJournal]);

  useEffect(() => { load(); }, [load]);

  const persist = async (id: string, updates: Partial<JournalEntry>) => {
    try {
      const res = await axios.put<{ entry: JournalEntry }>(`/api/journal/${id}`, updates);
      updateJournalEntry(id, res.data.entry);
    } catch {
      updateJournalEntry(id, updates);
    }
  };

  const handleNew = async (data: Omit<JournalEntry, 'id' | 'createdAt'>) => {
    try {
      const res = await axios.post<{ entry: JournalEntry }>('/api/journal', data);
      addJournalEntry(res.data.entry);
    } catch {
      addJournalEntry({ ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    }
    setShowNewForm(false);
  };

  const handleEdit = async (updates: Partial<JournalEntry>) => {
    if (!editEntry) return;
    await persist(editEntry.id, updates);
    setEditEntry(null);
  };

  const handleClose = async (exitPrice: number, exitDate: string, notes: string) => {
    if (!closeEntry) return;
    const ep = closeEntry.entryPrice;
    const sz = closeEntry.size;
    const pnlVal = ep && sz
      ? (closeEntry.direction === 'LONG' ? (exitPrice - ep) * sz : (ep - exitPrice) * sz)
      : null;
    const pctVal = ep
      ? (closeEntry.direction === 'LONG' ? ((exitPrice - ep) / ep) * 100 : ((ep - exitPrice) / ep) * 100)
      : null;
    await persist(closeEntry.id, {
      exitPrice, exitDate, status: 'CLOSED', notes, pnl: pnlVal, pnlPercent: pctVal,
    });
    setCloseEntry(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trade entry?')) return;
    try { await axios.delete(`/api/journal/${id}`); } catch { /* ok */ }
    removeJournalEntry(id);
  };

  const displayed = journal
    .filter((e) => filter === 'ALL' || e.status === filter)
    .filter((e) => !search
      || e.symbol.includes(search.toUpperCase())
      || (e.setup ?? '').toLowerCase().includes(search.toLowerCase())
      || (e.notes ?? '').toLowerCase().includes(search.toLowerCase()));

  const openCount = journal.filter((e) => e.status === 'OPEN').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-terminal-text-primary flex items-center gap-2">
            Trade Journal
            {openCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-terminal-cyan/15 text-terminal-cyan border border-terminal-cyan/25 animate-pulse">
                {openCount} live
              </span>
            )}
          </h1>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Log entries & exits — track every trade</p>
        </div>
        {!showNewForm && (
          <button onClick={() => setShowNewForm(true)}
            className="px-4 py-2 rounded-lg bg-terminal-cyan text-terminal-bg font-bold text-sm hover:bg-terminal-cyan/90 transition-colors">
            + Log Trade
          </button>
        )}
      </div>

      {/* Stats */}
      {journal.length > 0 && <Stats entries={journal} />}

      {/* New trade form */}
      {showNewForm && <NewTradeForm onSave={handleNew} onCancel={() => setShowNewForm(false)} />}

      {/* Filters + search */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {(['ALL', 'OPEN', 'CLOSED'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded border font-semibold transition-colors ${
                filter === f
                  ? 'bg-terminal-cyan/20 border-terminal-cyan/50 text-terminal-cyan'
                  : 'bg-terminal-bg border-terminal-border text-terminal-text-secondary hover:border-terminal-cyan/30'
              }`}>
              {f}
              {f === 'OPEN' && openCount > 0 && <span className="ml-1 text-terminal-cyan">({openCount})</span>}
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol, setup, notes…"
          className="ml-auto bg-terminal-bg border border-terminal-border rounded-lg px-3 py-1 text-xs text-terminal-text-primary placeholder-terminal-text-secondary/50 focus:outline-none focus:border-terminal-cyan/50 w-52" />
      </div>

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="bg-terminal-card border border-terminal-border rounded-xl p-16 text-center space-y-3">
          <p className="text-3xl">📒</p>
          <p className="text-terminal-text-primary font-semibold">No trades yet</p>
          <p className="text-terminal-text-secondary text-sm">Click <strong className="text-terminal-cyan">+ Log Trade</strong> to start tracking your entries and exits.</p>
        </div>
      ) : (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-terminal-border bg-terminal-bg/50">
                  {['Symbol', 'Dir', 'Entry', 'Exit', 'P&L', 'Setup', 'Status', 'Actions'].map((h) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold text-terminal-text-secondary uppercase tracking-wider ${h === 'Setup' ? 'hidden sm:table-cell' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((e) => (
                  <Row key={e.id} entry={e}
                    onEdit={() => setEditEntry(e)}
                    onClose={() => setCloseEntry(e)}
                    onDelete={() => handleDelete(e.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit drawer */}
      {editEntry && (
        <EditDrawer entry={editEntry} onClose={() => setEditEntry(null)} onSave={handleEdit} />
      )}

      {/* Quick-close modal */}
      {closeEntry && (
        <CloseModal entry={closeEntry} onClose={() => setCloseEntry(null)} onSave={handleClose} />
      )}
    </div>
  );
}
