import { useState, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import {
  formatPrice,
  timeAgo,
  getConditionLabel,
} from '../../utils/formatters';
import type { Alert } from '../../types';

// ─── Create Alert Form ────────────────────────────────────────────────────────

function CreateAlertForm({ onClose }: { onClose: () => void }) {
  const { watchlist, alerts, setAlerts } = useStore();
  const [symbol, setSymbol] = useState('');
  const [conditionType, setConditionType] = useState<Alert['conditionType']>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [notifyBrowser, setNotifyBrowser] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(false);
  const [notifyPushover, setNotifyPushover] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [symbolSuggestions, setSymbolSuggestions] = useState<string[]>([]);

  const handleSymbolChange = (val: string) => {
    setSymbol(val.toUpperCase());
    if (val.length > 0) {
      const matches = watchlist
        .filter((w) => w.symbol.startsWith(val.toUpperCase()))
        .map((w) => w.symbol)
        .slice(0, 5);
      setSymbolSuggestions(matches);
    } else {
      setSymbolSuggestions([]);
    }
  };

  const getThresholdLabel = () => {
    switch (conditionType) {
      case 'PRICE_ABOVE': return 'Price ($)';
      case 'PRICE_BELOW': return 'Price ($)';
      case 'PERCENT_CHANGE_UP': return 'Change % (e.g. 5)';
      case 'PERCENT_CHANGE_DOWN': return 'Change % (e.g. 3)';
      case 'VOLUME_SURGE': return 'Volume Ratio (e.g. 3)';
      case 'RSI_ABOVE': return 'RSI Level (0-100)';
      case 'RSI_BELOW': return 'RSI Level (0-100)';
      case 'SCAN_MATCH': return 'Min Strength (1-10)';
      default: return 'Threshold';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !threshold) return;
    setError(null);
    setSaving(true);

    const notifyMethods: Alert['notifyMethods'] = [];
    if (notifyBrowser) notifyMethods.push('browser');
    if (notifyTelegram) notifyMethods.push('telegram');
    if (notifyPushover) notifyMethods.push('pushover');

    const newAlert: Omit<Alert, 'id'> = {
      symbol: symbol.trim().toUpperCase(),
      conditionType,
      threshold: parseFloat(threshold),
      notifyMethods,
      active: true,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
      note: note || undefined,
    };

    try {
      const res = await axios.post<Alert>('/api/alerts', newAlert);
      setAlerts([res.data, ...alerts]);
      onClose();
    } catch {
      // Optimistic add
      const localAlert: Alert = {
        id: `local-${Date.now()}`,
        ...newAlert,
      };
      setAlerts([localAlert, ...alerts]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-terminal-bg border border-terminal-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-terminal-text-primary">Create New Alert</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Symbol */}
        <div className="relative">
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Symbol *</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            placeholder="e.g. AAPL"
            required
            className="w-full px-3 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none uppercase"
          />
          {symbolSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-terminal-card border border-terminal-border rounded-lg z-10 overflow-hidden">
              {symbolSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSymbol(s); setSymbolSuggestions([]); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-terminal-text-primary hover:bg-terminal-border/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Condition */}
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Condition *</label>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as Alert['conditionType'])}
            className="w-full px-3 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
          >
            <option value="PRICE_ABOVE">Price Above</option>
            <option value="PRICE_BELOW">Price Below</option>
            <option value="PERCENT_CHANGE_UP">% Change Up</option>
            <option value="PERCENT_CHANGE_DOWN">% Change Down</option>
            <option value="VOLUME_SURGE">Volume Surge (x avg)</option>
            <option value="RSI_ABOVE">RSI Above</option>
            <option value="RSI_BELOW">RSI Below</option>
            <option value="SCAN_MATCH">Scan Match</option>
          </select>
        </div>

        {/* Threshold */}
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">{getThresholdLabel()} *</label>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="0"
            required
            step="any"
            className="w-full px-3 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none"
          />
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reminder note..."
            className="w-full px-3 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none"
          />
        </div>
      </div>

      {/* Notify Via */}
      <div>
        <label className="block text-xs text-terminal-text-secondary mb-2">Notify via</label>
        <div className="flex gap-3 flex-wrap">
          {[
            { id: 'browser', label: 'Browser', state: notifyBrowser, setState: setNotifyBrowser, color: 'text-terminal-cyan' },
            { id: 'telegram', label: 'Telegram', state: notifyTelegram, setState: setNotifyTelegram, color: 'text-terminal-blue' },
            { id: 'pushover', label: 'Pushover', state: notifyPushover, setState: setNotifyPushover, color: 'text-terminal-purple' },
          ].map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer group">
              <div
                onClick={() => opt.setState(!opt.state)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer
                  ${opt.state ? 'bg-terminal-cyan border-terminal-cyan' : 'border-terminal-border hover:border-terminal-cyan/50'}`}
              >
                {opt.state && (
                  <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span className="text-xs text-terminal-text-secondary group-hover:text-terminal-text-primary transition-colors">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-terminal-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !symbol || !threshold}
          className="px-5 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 disabled:opacity-50 transition-all"
        >
          {saving ? 'Creating...' : 'Create Alert'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-terminal-border/40 text-terminal-text-secondary text-sm rounded-lg hover:bg-terminal-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({ alert, onToggle, onDelete }: {
  alert: Alert;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const conditionLabel = getConditionLabel(alert.conditionType);
  const notifyIcons = {
    browser: '🔔',
    telegram: '✈️',
    pushover: '📲',
  };

  const isActive = alert.active;

  return (
    <tr className={`border-b border-terminal-border/50 hover:bg-terminal-border/10 transition-colors ${!isActive ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <span className="text-sm font-bold text-terminal-text-primary">{alert.symbol}</span>
        {alert.note && (
          <div className="text-[10px] text-terminal-text-secondary mt-0.5">{alert.note}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="text-xs text-terminal-text-primary">{conditionLabel}</div>
        <div className="text-xs font-mono text-terminal-cyan mt-0.5">
          {alert.conditionType.includes('PRICE') ? formatPrice(alert.threshold) :
           alert.conditionType.includes('PERCENT') ? `${alert.threshold}%` :
           alert.conditionType === 'VOLUME_SURGE' ? `${alert.threshold}x` :
           alert.threshold}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
          isActive
            ? 'bg-terminal-green/10 text-terminal-green'
            : 'bg-terminal-border/40 text-terminal-text-secondary'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-terminal-green animate-pulse' : 'bg-terminal-text-secondary'}`} />
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {alert.notifyMethods.map((m) => (
            <span key={m} className="text-sm" title={m}>
              {notifyIcons[m]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        {alert.triggered ? (
          <div>
            <div className="text-[11px] text-terminal-yellow">✓ Triggered</div>
            <div className="text-[10px] text-terminal-text-secondary">{timeAgo(alert.triggered)}</div>
          </div>
        ) : (
          <span className="text-[11px] text-terminal-text-secondary">
            {alert.triggerCount > 0 ? `${alert.triggerCount}x` : 'Never'}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Toggle */}
          <button
            onClick={() => onToggle(alert.id)}
            className={`relative w-8 h-4 rounded-full transition-colors ${isActive ? 'bg-terminal-cyan' : 'bg-terminal-border'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          {/* Delete */}
          <button
            onClick={() => onDelete(alert.id)}
            className="w-7 h-7 flex items-center justify-center rounded bg-terminal-red/10 text-terminal-red hover:bg-terminal-red/20 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Alert History Timeline ────────────────────────────────────────────────

function AlertTimeline() {
  const { alertHistory } = useStore();

  if (alertHistory.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-terminal-text-secondary">No alerts have fired yet</p>
        <p className="text-xs text-terminal-text-secondary/60 mt-1">Triggered alerts will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {alertHistory.slice(0, 20).map((item) => (
        <div key={item.id} className="flex items-start gap-3 px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg">
          <div className="w-2 h-2 rounded-full bg-terminal-yellow mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-terminal-text-primary">{item.symbol}</span>
              {item.conditionType && (
                <span className="text-[10px] px-1.5 py-0.5 bg-terminal-yellow/10 text-terminal-yellow rounded">
                  {getConditionLabel(item.conditionType)}
                </span>
              )}
              {item.price !== undefined && (
                <span className="text-[11px] font-mono text-terminal-cyan">{formatPrice(item.price)}</span>
              )}
            </div>
            <p className="text-xs text-terminal-text-secondary mt-0.5">{item.message}</p>
          </div>
          <span className="text-[10px] text-terminal-text-secondary shrink-0">{timeAgo(item.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Alert Panel ─────────────────────────────────────────────────────────

export default function AlertPanel() {
  const { alerts, toggleAlert, removeAlert } = useStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [, setDeleteId] = useState<string | null>(null);

  const activeAlerts = alerts.filter((a) => a.active);
  const inactiveAlerts = alerts.filter((a) => !a.active);

  const handleToggle = useCallback(async (id: string) => {
    toggleAlert(id);
    const alert = alerts.find((a) => a.id === id);
    if (alert) {
      try {
        await axios.patch(`/api/alerts/${id}`, { active: !alert.active });
      } catch { /* Optimistic update already applied */ }
    }
  }, [alerts, toggleAlert]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleteId(id);
    removeAlert(id);
    try {
      await axios.delete(`/api/alerts/${id}`);
    } catch { /* Optimistic delete already applied */ }
    setDeleteId(null);
  }, [removeAlert]);

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Price Alerts</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            {activeAlerts.length} active · {alerts.length} total
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-all active:scale-95"
        >
          <span className="text-base leading-none">+</span>
          New Alert
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateAlertForm onClose={() => setShowCreateForm(false)} />
      )}

      {/* Active Alerts Table */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
          <h3 className="text-sm font-semibold text-terminal-text-primary">Active Alerts</h3>
          <span className="text-xs text-terminal-text-secondary ml-1">({activeAlerts.length})</span>
        </div>
        {alerts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-terminal-bg border border-terminal-border rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-terminal-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </div>
            <p className="text-sm text-terminal-text-secondary">No alerts configured</p>
            <p className="text-xs text-terminal-text-secondary/60 mt-1">Create an alert to get notified on price movements</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-4 px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
            >
              Create First Alert
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr className="border-b border-terminal-border">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Symbol</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Condition</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Notify Via</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Triggered</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-terminal-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...activeAlerts, ...inactiveAlerts].map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alert History */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-terminal-yellow" />
          <h3 className="text-sm font-semibold text-terminal-text-primary">Alert History</h3>
        </div>
        <div className="p-4">
          <AlertTimeline />
        </div>
      </div>
    </div>
  );
}
