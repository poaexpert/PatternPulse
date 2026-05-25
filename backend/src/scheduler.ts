import * as cron from 'node-cron';
import { runFullScan } from './scanners';
import { checkAlerts, broadcastStrongSignals } from './alerts/checker';
import { sendMarketOpenBrief, sendMarketCloseSummary } from './notifications/telegram';
import { store } from './store';
import { config } from './config';
import { log, logError } from './utils/logger';

// Socket.io instance (set by server.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let io: any = null;

export function setSocketIO(socketIO: unknown): void {
  io = socketIO;
}

/**
 * Returns true if the market is currently open (9:30 AM - 4:00 PM ET, Mon-Fri).
 */
export function isMarketHours(): boolean {
  const now = new Date();
  const dayStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  if (dayStr === 'Sat' || dayStr === 'Sun') return false;

  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = etNow.getHours();
  const m = etNow.getMinutes();
  const total = h * 60 + m;
  return total >= 9 * 60 + 30 && total < 16 * 60;
}

/**
 * Returns true if we're in pre-market hours (4:00 AM - 9:30 AM ET, Mon-Fri).
 */
export function isPreMarket(): boolean {
  const now = new Date();
  const dayStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  if (dayStr === 'Sat' || dayStr === 'Sun') return false;

  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = etNow.getHours();
  const m = etNow.getMinutes();
  const total = h * 60 + m;
  return total >= 4 * 60 && total < 9 * 60 + 30;
}

/**
 * Run a full scan and emit results via Socket.io, then check alerts.
 */
async function runScanAndNotify(): Promise<void> {
  if (store.isScanInProgress()) {
    log('Scheduler: scan already in progress, skipping');
    return;
  }

  store.setScanInProgress(true);

  if (io) {
    io.emit('scan_started', { timestamp: new Date() });
  }

  try {
    log('Scheduler: starting scan...');
    const results = await runFullScan();
    store.setScanResults(results);
    store.setLastScanTime(new Date());

    log(`Scheduler: scan complete — ${results.length} signals`);

    // Emit results via Socket.io
    if (io) {
      io.emit('scan_results', results);
      io.emit('scan_complete', {
        count: results.length,
        timestamp: new Date(),
      });
    }

    // Check per-stock alerts
    await checkAlerts(results);

    // Broadcast strong signals via notification channels
    await broadcastStrongSignals(results);
  } catch (err) {
    logError('Scheduler: scan failed', err);
    if (io) {
      io.emit('scan_error', { message: String(err), timestamp: new Date() });
    }
  } finally {
    store.setScanInProgress(false);
  }
}

/**
 * Start all scheduled jobs.
 */
export function startScheduler(): void {
  const intervalMinutes = config.SCAN_INTERVAL_MINUTES;

  log(`Scheduler starting — scan interval: ${intervalMinutes} minutes`);

  // ── Main scan job ────────────────────────────────────────────────────────
  // During market hours + pre-market: every N minutes (default 5)
  // Use cron expression based on interval
  // For intervals 1-59 minutes, we build a cron pattern
  const buildIntervalCron = (minutes: number): string => {
    if (minutes <= 0 || minutes > 59) return `*/5 * * * *`; // fallback
    return `*/${minutes} * * * *`;
  };

  const marketCron = buildIntervalCron(intervalMinutes);

  cron.schedule(marketCron, async () => {
    if (isMarketHours() || isPreMarket()) {
      await runScanAndNotify();
    }
  });

  // After-hours scan every 15 minutes (light monitoring)
  cron.schedule('*/15 * * * *', async () => {
    if (!isMarketHours() && !isPreMarket()) {
      log('Scheduler: after-hours scan (reduced frequency)');
      await runScanAndNotify();
    }
  });

  // ── Market Open Alert — 9:30 AM ET Monday-Friday ────────────────────────
  cron.schedule('30 9 * * 1-5', async () => {
    log('Scheduler: market open — triggering scan + morning brief');
    await runScanAndNotify();

    const settings = store.getNotificationSettings();
    if (settings.telegram.enabled && settings.telegram.chatId) {
      const results = store.getScanResults();
      await sendMarketOpenBrief(settings.telegram.chatId, results);
    }
  }, {
    timezone: 'America/New_York',
  });

  // ── Market Close Summary — 4:05 PM ET Monday-Friday ────────────────────
  cron.schedule('5 16 * * 1-5', async () => {
    log('Scheduler: market close — sending summary');
    const settings = store.getNotificationSettings();
    if (settings.telegram.enabled && settings.telegram.chatId) {
      const results = store.getScanResults();
      await sendMarketCloseSummary(settings.telegram.chatId, results);
    }
  }, {
    timezone: 'America/New_York',
  });

  // ── Initial scan on startup (after 10-second delay) ────────────────────
  setTimeout(() => {
    log('Scheduler: running initial startup scan');
    runScanAndNotify().catch((err) => logError('Startup scan failed', err));
  }, 10_000);

  log('Scheduler started. Jobs registered:');
  log(`  • Market scan: ${marketCron} (during market/pre-market hours)`);
  log('  • After-hours scan: every 15 minutes');
  log('  • Market open brief: 9:30 AM ET weekdays');
  log('  • Market close summary: 4:05 PM ET weekdays');
  log('  • Startup scan: in 10 seconds');
}
