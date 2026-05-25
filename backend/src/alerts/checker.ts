import { Alert, ScanResult } from '../types';
import { store } from '../store';
import * as telegram from '../notifications/telegram';
import * as pushover from '../notifications/pushover';
import { log, logError } from '../utils/logger';

// Rate limiting: track how many alerts sent this hour
let alertsSentThisHour = 0;
let hourResetTime = new Date();

// Prevent duplicate alerts for the same stock within 1 hour
const recentAlerts = new Map<string, Date>(); // `${alertId}:${symbol}` -> last sent time

// Helper: get the current ET hour string (0-23)
function currentETHour(): number {
  const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  return parseInt(etStr, 10);
}

// Helper: parse "HH:MM" string to hour integer
function parseHour(timeStr: string): number {
  return parseInt(timeStr.split(':')[0], 10);
}

/**
 * Check if current time is within the configured quiet hours.
 */
function isQuietHours(): boolean {
  const settings = store.getNotificationSettings();
  if (!settings.quietHours) return false;

  const { start, end } = settings.quietHours;
  const currentHour = currentETHour();
  const startHour = parseHour(start);
  const endHour = parseHour(end);

  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  // Overnight quiet hours (e.g. 22:00 - 06:00)
  return currentHour >= startHour || currentHour < endHour;
}

/**
 * Check if a scan result meets the conditions for a given alert.
 */
function meetsCondition(alert: Alert, result: ScanResult): boolean {
  switch (alert.conditionType) {
    case 'PRICE_ABOVE':
      return result.price > alert.threshold;
    case 'PRICE_BELOW':
      return result.price < alert.threshold;
    case 'PERCENT_CHANGE_UP':
      return result.changePercent >= alert.threshold;
    case 'PERCENT_CHANGE_DOWN':
      return result.changePercent <= -alert.threshold;
    case 'VOLUME_SURGE':
      return result.volumeRatio >= alert.threshold;
    case 'RSI_ABOVE':
      return result.indicators.rsi14 !== undefined && result.indicators.rsi14 > alert.threshold;
    case 'RSI_BELOW':
      return result.indicators.rsi14 !== undefined && result.indicators.rsi14 < alert.threshold;
    case 'SCAN_MATCH':
      // threshold here represents the minimum strength
      return result.strength >= alert.threshold && result.scanTypes.length > 0;
    default:
      return false;
  }
}

/**
 * Build a concise alert notification message.
 */
function buildAlertMessage(alert: Alert, result: ScanResult): string {
  const sign = result.changePercent >= 0 ? '+' : '';
  return (
    `🚨 Alert: <b>${result.symbol}</b>\n` +
    `Condition: ${alert.conditionType} (threshold: ${alert.threshold})\n` +
    `Price: <b>$${result.price.toFixed(2)}</b> (${sign}${result.changePercent.toFixed(2)}%)\n` +
    `Volume: ${result.volumeRatio.toFixed(1)}x avg | Strength: ${result.strength}/10\n` +
    (alert.note ? `Note: ${alert.note}` : '')
  );
}

/**
 * Send a notification through all enabled channels for an alert.
 */
async function sendNotification(
  alert: Alert,
  result: ScanResult,
  message: string
): Promise<void> {
  const settings = store.getNotificationSettings();

  for (const method of alert.notifyMethods) {
    try {
      if (method === 'telegram') {
        if (settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId) {
          await telegram.sendMessage(settings.telegram.chatId, message);
        }
      } else if (method === 'pushover') {
        if (settings.pushover.enabled && settings.pushover.userKey && settings.pushover.appToken) {
          await pushover.sendPushoverAlert(
            { userKey: settings.pushover.userKey, appToken: settings.pushover.appToken },
            result
          );
        }
      }
      // 'browser' notifications are handled client-side via Socket.io
    } catch (err) {
      logError(`Failed to send ${method} notification for alert ${alert.id}`, err);
    }
  }
}

/**
 * Check all active alerts against the current set of scan results.
 * This is called after every scan run.
 */
export async function checkAlerts(scanResults: ScanResult[]): Promise<void> {
  // Reset hourly counter if needed
  const now = new Date();
  if (now.getTime() - hourResetTime.getTime() >= 3600_000) {
    alertsSentThisHour = 0;
    hourResetTime = now;
    // Clean old entries from recentAlerts
    for (const [key, lastSent] of recentAlerts.entries()) {
      if (now.getTime() - lastSent.getTime() >= 3600_000) {
        recentAlerts.delete(key);
      }
    }
  }

  if (isQuietHours()) {
    log('Quiet hours active — skipping alert notifications');
    return;
  }

  const settings = store.getNotificationSettings();
  const maxPerHour = settings.maxAlertsPerHour ?? 20;

  const alerts = store.getAlerts().filter((a) => a.active);
  if (alerts.length === 0) return;

  // Build a quick lookup: symbol -> ScanResult
  const resultBySymbol = new Map<string, ScanResult>();
  for (const r of scanResults) {
    resultBySymbol.set(r.symbol, r);
  }

  for (const alert of alerts) {
    if (alertsSentThisHour >= maxPerHour) {
      log(`Alert rate limit reached (${maxPerHour}/hour) — skipping remaining alerts`);
      break;
    }

    const result = resultBySymbol.get(alert.symbol);
    if (!result) continue;

    // Check cooldown (1 alert per symbol per alert per hour)
    const cooldownKey = `${alert.id}:${alert.symbol}`;
    const lastSent = recentAlerts.get(cooldownKey);
    if (lastSent && now.getTime() - lastSent.getTime() < 3600_000) {
      continue; // Already notified within the last hour
    }

    if (meetsCondition(alert, result)) {
      const message = buildAlertMessage(alert, result);
      log(`Alert triggered: ${alert.id} for ${alert.symbol} (${alert.conditionType})`);

      try {
        await sendNotification(alert, result, message);
        alertsSentThisHour++;
        recentAlerts.set(cooldownKey, now);

        // Update alert record
        store.triggerAlert(alert.id);
        store.updateAlert(alert.id, { lastPrice: result.price });
        store.addAlertHistory(alert.symbol, message.replace(/<[^>]+>/g, '')); // strip HTML for history
      } catch (err) {
        logError(`Error processing alert ${alert.id}`, err);
      }
    }
  }
}

/**
 * Manually trigger a test notification for a specific alert.
 */
export async function testAlert(alertId: string): Promise<boolean> {
  const alert = store.getAlerts().find((a) => a.id === alertId);
  if (!alert) return false;

  const testResult: ScanResult = {
    symbol: alert.symbol,
    name: `${alert.symbol} (Test)`,
    price: alert.threshold,
    change: 1.5,
    changePercent: 1.5,
    volume: 5_000_000,
    avgVolume: 2_000_000,
    volumeRatio: 2.5,
    signals: [{ type: 'TEST', description: 'Test alert signal', strength: 7, direction: 'LONG' }],
    indicators: { rsi14: 55 },
    scanTypes: ['MOMENTUM'],
    strength: 7,
    direction: 'LONG',
    timestamp: new Date(),
  };

  const message = `🧪 TEST ALERT\n${buildAlertMessage(alert, testResult)}`;
  await sendNotification(alert, testResult, message);
  store.addAlertHistory(alert.symbol, `TEST: ${alert.conditionType} alert`);
  return true;
}

/**
 * Check scan results against notification settings filters and send broadcasts.
 * Called separately from per-alert checking — this handles auto-broadcast of strong signals.
 */
export async function broadcastStrongSignals(scanResults: ScanResult[]): Promise<void> {
  const settings = store.getNotificationSettings();
  const filters = settings.filters;

  if (!settings.telegram.enabled && !settings.pushover.enabled) return;
  if (isQuietHours()) return;

  const now = new Date();
  if (now.getTime() - hourResetTime.getTime() >= 3600_000) {
    alertsSentThisHour = 0;
    hourResetTime = now;
  }

  const maxPerHour = settings.maxAlertsPerHour ?? 20;

  const matching = scanResults.filter((r) => {
    if (r.strength < filters.minStrength) return false;
    if (r.volumeRatio < filters.minVolumeRatio) return false;
    if (r.price < filters.minPrice || r.price > filters.maxPrice) return false;
    if (!filters.notifyLong && r.direction === 'LONG') return false;
    if (!filters.notifyShort && r.direction === 'SHORT') return false;
    if (
      filters.scanTypes.length > 0 &&
      !r.scanTypes.some((st) => filters.scanTypes.includes(st))
    )
      return false;
    return true;
  });

  log(`Broadcasting ${Math.min(matching.length, maxPerHour - alertsSentThisHour)} strong signals`);

  for (const result of matching) {
    if (alertsSentThisHour >= maxPerHour) break;

    const broadcastKey = `broadcast:${result.symbol}`;
    const lastSent = recentAlerts.get(broadcastKey);
    if (lastSent && now.getTime() - lastSent.getTime() < 3600_000) continue;

    try {
      if (settings.telegram.enabled && settings.telegram.chatId) {
        await telegram.sendScanAlert(settings.telegram.chatId, result);
        alertsSentThisHour++;
        recentAlerts.set(broadcastKey, now);
        store.addAlertHistory(result.symbol, `Broadcast: ${result.scanTypes.join(', ')}`);
      }
    } catch (err) {
      logError(`Failed to broadcast signal for ${result.symbol}`, err);
    }
  }
}
