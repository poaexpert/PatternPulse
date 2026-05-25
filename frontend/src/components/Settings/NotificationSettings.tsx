import { useState, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';
import { formatScanType } from '../../utils/formatters';
import type { NotificationSettings as NS, ScanType } from '../../types';

const ALL_SCAN_TYPES: ScanType[] = [
  'MOMENTUM', 'VOLUME_SURGE', 'GAP_UP', 'GAP_DOWN',
  'BREAKOUT', 'BREAKDOWN', 'RSI_OVERSOLD', 'RSI_OVERBOUGHT',
  'MACD_BULLISH', 'MACD_BEARISH', 'BB_SQUEEZE', 'SHORT_SQUEEZE',
  'EMA_CROSS_BULLISH', 'EMA_CROSS_BEARISH', 'VWAP_RECLAIM',
  'RELATIVE_STRENGTH', 'HALT_RESUME', 'PREMARKET_MOVER',
];

// ─── Toggle Component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${checked ? 'bg-terminal-cyan' : 'bg-terminal-border'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-terminal-border flex items-center gap-2">
        <div className={`w-1 h-4 rounded-full ${accent}`} />
        <h3 className="text-sm font-semibold text-terminal-text-primary">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Collapsible ─────────────────────────────────────────────────────────────

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-terminal-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-terminal-text-secondary hover:text-terminal-text-primary hover:bg-terminal-border/20 transition-colors"
      >
        <span>{title}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-terminal-text-secondary space-y-1.5 border-t border-terminal-border bg-terminal-bg/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Telegram Setup ───────────────────────────────────────────────────────────

function TelegramSetup({ settings, onSave }: { settings: NS; onSave: (s: NS) => void }) {
  const [enabled, setEnabled] = useState(settings.telegram.enabled);
  const [botToken, setBotToken] = useState(settings.telegram.botToken);
  const [chatId, setChatId] = useState(settings.telegram.chatId);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showToken, setShowToken] = useState(false);

  const handleSave = () => {
    onSave({
      ...settings,
      telegram: { enabled, botToken, chatId },
    });
  };

  const handleTest = async () => {
    if (!botToken || !chatId) return;
    setTesting(true);
    setTestResult(null);
    try {
      await axios.post('/api/notifications/test/telegram', { botToken, chatId });
      setTestResult({ success: true, message: 'Test message sent successfully!' });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to send test message'
        : 'Failed to send test message';
      setTestResult({ success: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-terminal-text-primary">Telegram Notifications</p>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Get alerts via Telegram bot</p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <Collapsible title="How to set up Telegram notifications">
        <p className="pt-2">1. Open Telegram and search for <strong className="text-terminal-cyan">@BotFather</strong></p>
        <p>2. Send <code className="bg-terminal-border px-1 rounded">/newbot</code> and follow the prompts to name your bot</p>
        <p>3. BotFather will give you a <strong className="text-terminal-cyan">bot token</strong> — copy it below</p>
        <p>4. Send any message to your new bot to start a chat</p>
        <p>5. Open <strong className="text-terminal-cyan">@userinfobot</strong> and send <code className="bg-terminal-border px-1 rounded">/start</code> to get your Chat ID</p>
        <p>6. Paste both values below and click "Test Connection"</p>
      </Collapsible>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Bot Token</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="1234567890:ABCDefgh..."
              disabled={!enabled}
              className="w-full pr-10 pl-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none disabled:opacity-50 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-terminal-text-secondary hover:text-terminal-text-primary text-xs"
            >
              {showToken ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="123456789"
            disabled={!enabled}
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none disabled:opacity-50 font-mono"
          />
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${testResult.success ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/20' : 'bg-terminal-red/10 text-terminal-red border border-terminal-red/20'}`}>
          <span>{testResult.success ? '✓' : '✕'}</span>
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !botToken || !chatId}
          className="px-4 py-2 bg-terminal-border/40 text-terminal-text-primary text-xs rounded-lg hover:bg-terminal-border disabled:opacity-50 transition-colors"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-terminal-cyan text-black text-xs font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
        >
          Save
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${enabled && botToken && chatId ? 'bg-terminal-green animate-pulse' : 'bg-terminal-border'}`} />
        <span className="text-[11px] text-terminal-text-secondary">
          {enabled && botToken && chatId ? 'Configured' : 'Not configured'}
        </span>
      </div>
    </div>
  );
}

// ─── Pushover Setup ───────────────────────────────────────────────────────────

function PushoverSetup({ settings, onSave }: { settings: NS; onSave: (s: NS) => void }) {
  const [enabled, setEnabled] = useState(settings.pushover.enabled);
  const [userKey, setUserKey] = useState(settings.pushover.userKey);
  const [appToken, setAppToken] = useState(settings.pushover.appToken);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    onSave({
      ...settings,
      pushover: { enabled, userKey, appToken },
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await axios.post('/api/notifications/test/pushover', { userKey, appToken });
      setTestResult({ success: true, message: 'Test notification sent!' });
    } catch {
      setTestResult({ success: false, message: 'Failed. Check your keys.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-terminal-text-primary">Pushover Notifications</p>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Push notifications to any device</p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <div className="text-xs text-terminal-text-secondary bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2">
        Create an account at{' '}
        <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-terminal-cyan underline">
          pushover.net
        </a>{' '}
        to get your User Key and Application Token.
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">User Key</label>
          <input
            type="password"
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            placeholder="Your Pushover user key..."
            disabled={!enabled}
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm font-mono text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">App Token</label>
          <input
            type="password"
            value={appToken}
            onChange={(e) => setAppToken(e.target.value)}
            placeholder="Your app token..."
            disabled={!enabled}
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm font-mono text-terminal-text-primary placeholder-terminal-text-secondary focus:border-terminal-cyan focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${testResult.success ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/20' : 'bg-terminal-red/10 text-terminal-red border border-terminal-red/20'}`}>
          <span>{testResult.success ? '✓' : '✕'}</span>
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !userKey || !appToken}
          className="px-4 py-2 bg-terminal-border/40 text-terminal-text-primary text-xs rounded-lg hover:bg-terminal-border disabled:opacity-50 transition-colors"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-terminal-cyan text-black text-xs font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Alert Filters ────────────────────────────────────────────────────────────

function AlertFiltersCard({ settings, onSave }: { settings: NS; onSave: (s: NS) => void }) {
  const [filters, setFilters] = useState(settings.filters);
  const [maxAlerts, setMaxAlerts] = useState(settings.maxAlertsPerHour);
  const [quietHours, setQuietHours] = useState(settings.quietHours !== null);
  const [quietStart, setQuietStart] = useState(settings.quietHours?.start || '22:00');
  const [quietEnd, setQuietEnd] = useState(settings.quietHours?.end || '09:00');

  const handleSave = () => {
    onSave({
      ...settings,
      filters,
      maxAlertsPerHour: maxAlerts,
      quietHours: quietHours ? { start: quietStart, end: quietEnd } : null,
    });
  };

  return (
    <div className="space-y-5">
      {/* Min Strength */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-terminal-text-secondary">Min Signal Strength</label>
          <span className="text-sm font-mono text-terminal-cyan font-bold">{filters.minStrength}/10</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          value={filters.minStrength}
          onChange={(e) => setFilters({ ...filters, minStrength: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Min Volume Ratio */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-terminal-text-secondary">Min Volume Ratio</label>
          <span className="text-sm font-mono text-terminal-cyan font-bold">{filters.minVolumeRatio.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          value={filters.minVolumeRatio}
          onChange={(e) => setFilters({ ...filters, minVolumeRatio: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Min Price ($)</label>
          <input
            type="number"
            value={filters.minPrice}
            onChange={(e) => setFilters({ ...filters, minPrice: parseFloat(e.target.value) || 0 })}
            min="0"
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-terminal-text-secondary mb-1.5">Max Price ($)</label>
          <input
            type="number"
            value={filters.maxPrice}
            onChange={(e) => setFilters({ ...filters, maxPrice: parseFloat(e.target.value) || 0 })}
            min="0"
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
          />
        </div>
      </div>

      {/* Direction toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Toggle checked={filters.notifyLong} onChange={(v) => setFilters({ ...filters, notifyLong: v })} />
          <span className="text-xs text-terminal-green">Notify Long Signals</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Toggle checked={filters.notifyShort} onChange={(v) => setFilters({ ...filters, notifyShort: v })} />
          <span className="text-xs text-terminal-red">Notify Short Signals</span>
        </label>
      </div>

      {/* Max Alerts Per Hour */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-terminal-text-secondary">Max Alerts Per Hour</label>
        <input
          type="number"
          value={maxAlerts}
          onChange={(e) => setMaxAlerts(parseInt(e.target.value) || 1)}
          min="1"
          max="100"
          className="w-16 px-2 py-1 bg-terminal-bg border border-terminal-border rounded-lg text-sm text-terminal-text-primary text-center focus:border-terminal-cyan focus:outline-none"
        />
      </div>

      {/* Quiet Hours */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-terminal-text-primary">Quiet Hours</p>
            <p className="text-[11px] text-terminal-text-secondary">Suppress alerts during this window</p>
          </div>
          <Toggle checked={quietHours} onChange={setQuietHours} />
        </div>
        {quietHours && (
          <div className="flex items-center gap-3 pl-2">
            <div>
              <label className="block text-[11px] text-terminal-text-secondary mb-1">From</label>
              <input
                type="time"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="px-2 py-1.5 bg-terminal-bg border border-terminal-border rounded-lg text-xs text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
              />
            </div>
            <span className="text-terminal-text-secondary text-xs mt-4">to</span>
            <div>
              <label className="block text-[11px] text-terminal-text-secondary mb-1">Until</label>
              <input
                type="time"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="px-2 py-1.5 bg-terminal-bg border border-terminal-border rounded-lg text-xs text-terminal-text-primary focus:border-terminal-cyan focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
      >
        Save Filter Settings
      </button>
    </div>
  );
}

// ─── Scan Types Filter ────────────────────────────────────────────────────────

function ScanTypesFilter({ settings, onSave }: { settings: NS; onSave: (s: NS) => void }) {
  const [selected, setSelected] = useState<Set<ScanType>>(new Set(settings.filters.scanTypes));

  const toggle = (type: ScanType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      ...settings,
      filters: { ...settings.filters, scanTypes: Array.from(selected) },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelected(new Set(ALL_SCAN_TYPES))}
          className="text-xs text-terminal-cyan hover:underline"
        >
          Select All
        </button>
        <span className="text-terminal-border">|</span>
        <button
          onClick={() => setSelected(new Set())}
          className="text-xs text-terminal-text-secondary hover:text-terminal-text-primary"
        >
          Select None
        </button>
        <span className="text-[11px] text-terminal-text-secondary ml-auto">
          {selected.size}/{ALL_SCAN_TYPES.length} selected
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {ALL_SCAN_TYPES.map((type) => {
          const isSelected = selected.has(type);
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all ${
                isSelected
                  ? 'bg-terminal-cyan/10 text-terminal-cyan border border-terminal-cyan/30'
                  : 'bg-terminal-bg text-terminal-text-secondary border border-terminal-border hover:border-terminal-border-light'
              }`}
            >
              {formatScanType(type)}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        className="w-full py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
      >
        Save Scan Types
      </button>
    </div>
  );
}

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: NS = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  pushover: { enabled: false, userKey: '', appToken: '' },
  filters: {
    minStrength: 6,
    scanTypes: ALL_SCAN_TYPES,
    minVolumeRatio: 1.5,
    minPrice: 1,
    maxPrice: 10000,
    notifyLong: true,
    notifyShort: true,
  },
  maxAlertsPerHour: 20,
  quietHours: null,
};

// ─── Main Settings Panel ──────────────────────────────────────────────────────

export default function NotificationSettings() {
  const { notificationSettings, setNotificationSettings } = useStore();
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const settings = notificationSettings || DEFAULT_SETTINGS;

  const handleSave = useCallback(async (updated: NS) => {
    setSaving(true);
    try {
      await axios.post('/api/notifications/settings', updated);
      setNotificationSettings(updated);
      setSavedMessage('Settings saved successfully!');
      setTimeout(() => setSavedMessage(null), 3000);
    } catch {
      // Optimistic
      setNotificationSettings(updated);
      setSavedMessage('Saved locally (backend offline)');
      setTimeout(() => setSavedMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [setNotificationSettings]);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Notification Settings</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">Configure how and when you receive trading alerts</p>
        </div>
        {savedMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-terminal-green/10 text-terminal-green border border-terminal-green/20 rounded-lg text-xs">
            <span>✓</span>
            {savedMessage}
          </div>
        )}
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-xs text-terminal-text-secondary">
          <div className="w-3 h-3 border-2 border-terminal-cyan border-t-transparent rounded-full animate-spin" />
          Saving...
        </div>
      )}

      {/* Telegram */}
      <SectionCard title="Telegram Setup" accent="bg-terminal-cyan">
        <TelegramSetup settings={settings} onSave={handleSave} />
      </SectionCard>

      {/* Pushover */}
      <SectionCard title="Pushover Setup" accent="bg-terminal-purple">
        <PushoverSetup settings={settings} onSave={handleSave} />
      </SectionCard>

      {/* Alert Filters */}
      <SectionCard title="Alert Filters" accent="bg-terminal-yellow">
        <AlertFiltersCard settings={settings} onSave={handleSave} />
      </SectionCard>

      {/* Scan Types */}
      <SectionCard title="Active Scan Types" accent="bg-terminal-green">
        <ScanTypesFilter settings={settings} onSave={handleSave} />
      </SectionCard>

      {/* Browser Notifications */}
      <SectionCard title="Browser Notifications" accent="bg-terminal-cyan">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-terminal-text-primary">Desktop Notifications</p>
            <p className="text-xs text-terminal-text-secondary mt-0.5">
              {typeof Notification !== 'undefined'
                ? Notification.permission === 'granted'
                  ? 'Browser notifications are enabled'
                  : Notification.permission === 'denied'
                  ? 'Notifications blocked — check browser settings'
                  : 'Click to enable browser notifications'
                : 'Notifications not supported in this browser'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-[11px] ${
              typeof Notification !== 'undefined' && Notification.permission === 'granted'
                ? 'text-terminal-green'
                : 'text-terminal-text-secondary'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                typeof Notification !== 'undefined' && Notification.permission === 'granted'
                  ? 'bg-terminal-green animate-pulse'
                  : 'bg-terminal-border'
              }`} />
              {typeof Notification !== 'undefined'
                ? Notification.permission === 'granted' ? 'Enabled' : Notification.permission === 'denied' ? 'Blocked' : 'Not enabled'
                : 'Unsupported'}
            </div>
            {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && Notification.permission !== 'denied' && (
              <button
                onClick={() => Notification.requestPermission()}
                className="px-3 py-1.5 bg-terminal-cyan text-black text-xs font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
              >
                Enable
              </button>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
