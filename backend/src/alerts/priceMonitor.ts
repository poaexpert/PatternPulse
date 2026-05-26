import { store } from '../store';
import { fetchBatchQuotes } from '../data/market';
import { log, logError } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _io: any = null;

export function setPriceMonitorIO(io: unknown): void {
  _io = io;
}

// Cooldown: don't re-fire same alert within 5 minutes
const recentFires = new Map<string, number>(); // alertId -> timestamp
const COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Checks all active PRICE_ABOVE / PRICE_BELOW alerts by fetching live quotes.
 * Emits `alert_triggered` socket events when a threshold is crossed.
 * Runs independently of the scanner, so futures symbols work too.
 */
export async function checkPriceAlerts(): Promise<void> {
  const alerts = store
    .getAlerts()
    .filter(
      (a) => a.active && (a.conditionType === 'PRICE_ABOVE' || a.conditionType === 'PRICE_BELOW')
    );

  if (alerts.length === 0) return;

  // Collect unique symbols
  const symbols = [...new Set(alerts.map((a) => a.symbol))];

  let quotes;
  try {
    quotes = await fetchBatchQuotes(symbols);
  } catch (err) {
    logError('Price monitor: failed to fetch quotes', err);
    return;
  }

  const priceBySymbol = new Map<string, number>();
  for (const q of quotes) {
    priceBySymbol.set(q.symbol.toUpperCase(), q.price);
  }

  const now = Date.now();

  for (const alert of alerts) {
    const price = priceBySymbol.get(alert.symbol.toUpperCase());
    if (price == null) continue;

    const triggered =
      (alert.conditionType === 'PRICE_ABOVE' && price > alert.threshold) ||
      (alert.conditionType === 'PRICE_BELOW' && price < alert.threshold);

    if (!triggered) continue;

    // Cooldown check
    const lastFired = recentFires.get(alert.id) ?? 0;
    if (now - lastFired < COOLDOWN_MS) continue;

    recentFires.set(alert.id, now);

    const direction = alert.conditionType === 'PRICE_ABOVE' ? 'above' : 'below';
    const emoji = alert.conditionType === 'PRICE_ABOVE' ? '▲' : '▼';
    const message = alert.note
      ? `${emoji} ${alert.symbol} hit $${price.toFixed(2)} (${direction} $${alert.threshold}) — ${alert.note}`
      : `${emoji} ${alert.symbol} hit $${price.toFixed(2)} (${direction} $${alert.threshold})`;

    log(`Price alert fired: ${alert.symbol} ${direction} ${alert.threshold} @ ${price}`);

    // Emit socket event (triggers browser push notification in frontend)
    if (_io) {
      _io.emit('alert_triggered', {
        id: alert.id,
        symbol: alert.symbol,
        message,
        conditionType: alert.conditionType,
        price,
      });
    }

    // Store in alert history
    store.addAlertHistory(alert.symbol, message);
    store.triggerAlert(alert.id);
    store.updateAlert(alert.id, { lastPrice: price });
  }
}
