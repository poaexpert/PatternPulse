import TelegramBot from 'node-telegram-bot-api';
import { ScanResult } from '../types';
import { log, logError } from '../utils/logger';

let bot: TelegramBot | null = null;

export function initTelegram(botToken: string): void {
  if (!botToken) {
    log('Telegram: no bot token provided, skipping init');
    return;
  }
  try {
    bot = new TelegramBot(botToken, { polling: false });
    log('Telegram bot initialized');
  } catch (err) {
    logError('Failed to initialize Telegram bot', err);
  }
}

export function isInitialized(): boolean {
  return bot !== null;
}

// Build a strength bar like: ████████░░ for 8/10
function strengthBar(strength: number, total = 10): string {
  const filled = Math.round(Math.max(0, Math.min(total, strength)));
  const empty = total - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// Format a number as a dollar amount
function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toFixed(2)}`;
  if (price >= 100) return `$${price.toFixed(2)}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

// Format volume nicely
function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

// Direction emoji
function dirEmoji(direction: string): string {
  if (direction === 'LONG') return '📈';
  if (direction === 'SHORT') return '📉';
  return '↔️';
}

// Current time formatted in EST
function timeNowEST(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a scan result into a rich Telegram HTML message.
 */
export function formatScanAlert(result: ScanResult): string {
  const changeSign = result.changePercent >= 0 ? '+' : '';
  const dir = result.direction;
  const bar = strengthBar(result.strength);

  // Top-level signal badges
  const signalBadges = result.scanTypes.slice(0, 4).join(', ');

  // Indicator lines
  const rsiLine =
    result.indicators.rsi14 !== undefined
      ? `📊 RSI(14): <b>${result.indicators.rsi14.toFixed(1)}</b>`
      : '';

  const macdLine =
    result.indicators.macd !== undefined
      ? `📉 MACD: <b>${result.indicators.macd.histogram >= 0 ? 'Bullish' : 'Bearish'}</b> (hist: ${result.indicators.macd.histogram.toFixed(3)})`
      : '';

  const bbLine =
    result.indicators.bb !== undefined
      ? `🎯 BB %B: <b>${(result.indicators.bb.percentB * 100).toFixed(0)}%</b>`
      : '';

  const vwapLine =
    result.indicators.vwap !== undefined
      ? `💹 VWAP: <b>${formatPrice(result.indicators.vwap)}</b>`
      : '';

  const indicatorLines = [rsiLine, macdLine, bbLine, vwapLine]
    .filter(Boolean)
    .join('\n');

  // Trade levels
  const entryLine = result.entry ? `🎯 Entry: <b>${formatPrice(result.entry)}</b>` : '';
  const stopLine = result.stopLoss ? `🛑 Stop: <b>${formatPrice(result.stopLoss)}</b>` : '';
  const t1Line = result.target1
    ? `✅ Target 1: <b>${formatPrice(result.target1)}</b>${result.riskReward ? ` (R:R 1:${result.riskReward.toFixed(1)})` : ''}`
    : '';
  const t2Line = result.target2 ? `✅ Target 2: <b>${formatPrice(result.target2)}</b>` : '';

  const tradeLevels = [entryLine, stopLine, t1Line, t2Line].filter(Boolean).join('\n');

  const header = `🚨 <b>${result.symbol}</b> — ${signalBadges}`;

  const body = [
    '',
    `${dirEmoji(dir)} Direction: <b>${dir}</b>`,
    `💰 Price: <b>${formatPrice(result.price)}</b> (${changeSign}${result.changePercent.toFixed(2)}%)`,
    `📊 Volume: <b>${result.volumeRatio.toFixed(1)}x avg</b> (${formatVolume(result.volume)})`,
    `🎯 Strength: <b>${result.strength}/10</b> ${bar}`,
    '',
    indicatorLines,
    indicatorLines ? '' : '',
    tradeLevels,
    '',
    `🔔 Signals: <code>${result.scanTypes.join(', ')}</code>`,
    `⏰ ${timeNowEST()} EST`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return `${header}\n${body}`;
}

/**
 * Send a scan alert notification to a Telegram chat.
 */
export async function sendScanAlert(chatId: string, result: ScanResult): Promise<boolean> {
  if (!bot) {
    logError('Telegram bot not initialized');
    return false;
  }
  try {
    const message = formatScanAlert(result);
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    log(`Telegram: sent alert for ${result.symbol} to ${chatId}`);
    return true;
  } catch (err) {
    logError(`Telegram: failed to send alert for ${result.symbol}`, err);
    return false;
  }
}

/**
 * Send a plain text message to a Telegram chat.
 */
export async function sendMessage(chatId: string, message: string): Promise<boolean> {
  if (!bot) {
    logError('Telegram bot not initialized');
    return false;
  }
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    logError('Telegram: failed to send message', err);
    return false;
  }
}

/**
 * Send a market-open brief with top picks.
 */
export async function sendMarketOpenBrief(
  chatId: string,
  topResults: ScanResult[]
): Promise<void> {
  if (!bot) return;

  const top = topResults.slice(0, 5);
  const lines = [
    '🔔 <b>Market Open — PatternPulse Top Picks</b>',
    `🕤 ${timeNowEST()} EST`,
    '',
    ...top.map(
      (r, i) =>
        `${i + 1}. <b>${r.symbol}</b> ${dirEmoji(r.direction)} ${formatPrice(r.price)} (${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%) | Strength: ${r.strength}/10 | ${r.scanTypes.slice(0, 2).join(', ')}`
    ),
    '',
    `Scanning <b>${topResults.length}</b> total signals. Good luck today! 🚀`,
  ];

  try {
    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
    log('Telegram: sent market open brief');
  } catch (err) {
    logError('Telegram: failed to send market open brief', err);
  }
}

/**
 * Send a market-close summary.
 */
export async function sendMarketCloseSummary(
  chatId: string,
  results: ScanResult[]
): Promise<void> {
  if (!bot) return;

  const longs = results.filter((r) => r.direction === 'LONG').length;
  const shorts = results.filter((r) => r.direction === 'SHORT').length;
  const topGainers = [...results]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3);
  const topLosers = [...results]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 3);

  const lines = [
    '📊 <b>Market Close — PatternPulse Summary</b>',
    `🕔 ${timeNowEST()} EST`,
    '',
    `📈 Long signals: <b>${longs}</b>   📉 Short signals: <b>${shorts}</b>`,
    `🔔 Total scanned: <b>${results.length}</b>`,
    '',
    '<b>Top Gainers:</b>',
    ...topGainers.map(
      (r) => `  • ${r.symbol}: <b>+${r.changePercent.toFixed(2)}%</b> @ ${formatPrice(r.price)}`
    ),
    '',
    '<b>Top Losers:</b>',
    ...topLosers.map(
      (r) => `  • ${r.symbol}: <b>${r.changePercent.toFixed(2)}%</b> @ ${formatPrice(r.price)}`
    ),
    '',
    'See you tomorrow! 🌙',
  ];

  try {
    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
    log('Telegram: sent market close summary');
  } catch (err) {
    logError('Telegram: failed to send market close summary', err);
  }
}

/**
 * Test the Telegram connection by sending a test message.
 */
export async function testConnection(chatId: string): Promise<boolean> {
  if (!bot) return false;
  try {
    await bot.sendMessage(
      chatId,
      '✅ <b>PatternPulse</b> — Telegram connection test successful!\n\nYou will receive stock scan alerts here.',
      { parse_mode: 'HTML' }
    );
    log(`Telegram: test connection successful for chat ${chatId}`);
    return true;
  } catch (err) {
    logError('Telegram: test connection failed', err);
    return false;
  }
}
