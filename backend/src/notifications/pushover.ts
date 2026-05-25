import axios from 'axios';
import { ScanResult } from '../types';
import { log, logError } from '../utils/logger';

const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

export interface PushoverSettings {
  userKey: string;
  appToken: string;
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Send a scan result alert via Pushover.
 * Uses priority 1 (high) for strength >= 8, otherwise 0 (normal).
 */
export async function sendPushoverAlert(
  settings: PushoverSettings,
  result: ScanResult
): Promise<boolean> {
  const { userKey, appToken } = settings;
  if (!userKey || !appToken) {
    logError('Pushover: missing userKey or appToken');
    return false;
  }

  const priority = result.strength >= 8 ? 1 : 0;
  const dir = result.direction === 'LONG' ? '📈 LONG' : result.direction === 'SHORT' ? '📉 SHORT' : '↔️';
  const changeSign = result.changePercent >= 0 ? '+' : '';

  const title = `PatternPulse: ${result.symbol} ${result.scanTypes[0] ?? ''}`;

  const messageParts = [
    `${dir} | ${formatPrice(result.price)} (${changeSign}${result.changePercent.toFixed(2)}%)`,
    `Vol: ${result.volumeRatio.toFixed(1)}x | Strength: ${result.strength}/10`,
  ];

  if (result.entry && result.stopLoss && result.target1) {
    messageParts.push(
      `Entry: ${formatPrice(result.entry)} | Stop: ${formatPrice(result.stopLoss)} | T1: ${formatPrice(result.target1)}`
    );
    if (result.riskReward) {
      messageParts.push(`R:R 1:${result.riskReward.toFixed(1)}`);
    }
  }

  if (result.indicators.rsi14 !== undefined) {
    messageParts.push(`RSI: ${result.indicators.rsi14.toFixed(1)}`);
  }

  messageParts.push(`Signals: ${result.scanTypes.slice(0, 3).join(', ')}`);

  return sendPushoverMessage(settings, title, messageParts.join('\n'), priority);
}

/**
 * Send a custom Pushover message.
 * Priority: -2 lowest, -1 low, 0 normal, 1 high, 2 emergency
 */
export async function sendPushoverMessage(
  settings: PushoverSettings,
  title: string,
  message: string,
  priority = 0
): Promise<boolean> {
  const { userKey, appToken } = settings;
  if (!userKey || !appToken) {
    logError('Pushover: missing userKey or appToken');
    return false;
  }

  // Emergency priority requires retry/expire params
  const params: Record<string, string | number> = {
    token: appToken,
    user: userKey,
    title,
    message,
    priority,
    sound: priority >= 1 ? 'siren' : 'pushover',
  };

  if (priority === 2) {
    params.retry = 60;    // retry every 60 seconds
    params.expire = 3600; // expire after 1 hour
  }

  try {
    const response = await axios.post(PUSHOVER_API_URL, params, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (response.data?.status === 1) {
      log(`Pushover: message sent — "${title}"`);
      return true;
    } else {
      logError(`Pushover: unexpected response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (err) {
    logError('Pushover: failed to send message', err);
    return false;
  }
}

/**
 * Test the Pushover connection.
 */
export async function testPushover(settings: PushoverSettings): Promise<boolean> {
  return sendPushoverMessage(
    settings,
    'PatternPulse — Test',
    '✅ Pushover connection test successful! You will receive stock scan alerts here.',
    0
  );
}
