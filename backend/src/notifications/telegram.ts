import axios from 'axios';
import { ScanResult } from '../types';
import { logError } from '../utils/logger';

let _botToken = '';

const BASE_URL = () => `https://api.telegram.org/bot${_botToken}`;

// Initialize the module with a bot token
export function initTelegram(token: string): void {
  _botToken = token;
}

// Returns true if a token has been set
export function isInitialized(): boolean {
  return _botToken.length > 0;
}

// Send a raw HTML message to a chat
export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  try {
    await axios.post(`${BASE_URL()}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
    return true;
  } catch (err) {
    logError('Telegram sendMessage failed', err);
    return false;
  }
}

// Send a test connection message
export async function testConnection(chatId: string): Promise<boolean> {
  return sendMessage(chatId, 'PatternPulse connected! Your alerts are now active.');
}

// Retrieve recent chat IDs from getUpdates
export async function getUpdates(): Promise<{ chatId: string; username: string }[]> {
  try {
    const res = await axios.get(`${BASE_URL()}/getUpdates`);
    const updates: Record<string, unknown>[] = res.data?.result ?? [];
    const seen = new Set<string>();
    const chats: { chatId: string; username: string }[] = [];
    for (const update of updates) {
      const message = (update.message ?? update.channel_post) as Record<string, unknown> | undefined;
      if (!message) continue;
      const chat = message.chat as Record<string, unknown> | undefined;
      if (!chat) continue;
      const chatId = String(chat.id);
      if (seen.has(chatId)) continue;
      seen.add(chatId);
      const username =
        (chat.username as string | undefined) ??
        (chat.first_name as string | undefined) ??
        chatId;
      chats.push({ chatId, username });
    }
    return chats;
  } catch (err) {
    logError('Telegram getUpdates failed', err);
    return [];
  }
}

// Format a ScanResult as an HTML alert string
export function formatScanAlert(result: ScanResult): string {
  const dir = result.direction === 'LONG' ? '🟢 LONG' : result.direction === 'SHORT' ? '🔴 SHORT' : '⚪ NEUTRAL';
  const changeSign = result.changePercent >= 0 ? '+' : '';
  const stars = '⭐'.repeat(Math.min(Math.round(result.strength), 5));
  const scanTypes = result.scanTypes.join(', ');

  let msg =
    `<b>${result.symbol}</b> — ${dir}\n` +
    `💲 Price: <b>$${result.price.toFixed(2)}</b>  (${changeSign}${result.changePercent.toFixed(2)}%)\n` +
    `📊 Strength: ${stars} (${result.strength.toFixed(1)}/10)\n` +
    `🔍 Signals: ${scanTypes}`;

  if (result.entry != null) {
    msg += `\n🎯 Entry: $${result.entry.toFixed(2)}`;
  }
  if (result.stopLoss != null) {
    msg += `  |  🛑 Stop: $${result.stopLoss.toFixed(2)}`;
  }
  if (result.target1 != null) {
    msg += `\n✅ T1: $${result.target1.toFixed(2)}`;
  }
  if (result.target2 != null) {
    msg += `  |  ✅ T2: $${result.target2.toFixed(2)}`;
  }

  return msg;
}

// Format and send a single scan alert
export async function sendScanAlert(chatId: string, result: ScanResult): Promise<boolean> {
  return sendMessage(chatId, formatScanAlert(result));
}

// Send a morning brief with the top 3 strongest results
export async function sendMarketOpenBrief(chatId: string, results: ScanResult[]): Promise<void> {
  const top = [...results]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  let msg = `<b>🌅 Market Open Brief</b>\nTop signals heading into today's session:\n\n`;

  if (top.length === 0) {
    msg += 'No strong signals detected at the open.';
  } else {
    msg += top.map((r, i) => `<b>${i + 1}.</b> ${formatScanAlert(r)}`).join('\n\n');
  }

  await sendMessage(chatId, msg);
}

// Send an end-of-day summary with signal counts and top plays
export async function sendMarketCloseSummary(chatId: string, results: ScanResult[]): Promise<void> {
  const longs = results.filter(r => r.direction === 'LONG').length;
  const shorts = results.filter(r => r.direction === 'SHORT').length;
  const top = [...results]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  let msg =
    `<b>🌆 Market Close Summary</b>\n` +
    `Total signals today: <b>${results.length}</b>  (🟢 ${longs} long / 🔴 ${shorts} short)\n\n`;

  if (top.length > 0) {
    msg += `<b>Top plays:</b>\n\n`;
    msg += top.map((r, i) => `<b>${i + 1}.</b> ${formatScanAlert(r)}`).join('\n\n');
  } else {
    msg += 'No notable signals to report.';
  }

  await sendMessage(chatId, msg);
}

// Send a detailed trade play / analysis alert
export async function sendAnalysisAlert(
  chatId: string,
  symbol: string,
  direction: 'LONG' | 'SHORT' | 'NEUTRAL',
  entry: number,
  stop: number,
  target1: number,
  target2: number,
  signalStrength: number,
  summary: string
): Promise<boolean> {
  const dir = direction === 'LONG' ? '🟢 LONG' : direction === 'SHORT' ? '🔴 SHORT' : '⚪ NEUTRAL';
  const stars = '⭐'.repeat(Math.min(Math.round(signalStrength), 5));
  const rr = stop !== entry ? Math.abs((target2 - entry) / (stop - entry)).toFixed(2) : 'N/A';

  const msg =
    `<b>📈 Trade Alert — ${symbol}</b>  ${dir}\n` +
    `${stars} Strength: ${signalStrength.toFixed(1)}/10\n\n` +
    `🎯 Entry:   <b>$${entry.toFixed(2)}</b>\n` +
    `🛑 Stop:    <b>$${stop.toFixed(2)}</b>\n` +
    `✅ Target1: <b>$${target1.toFixed(2)}</b>\n` +
    `✅ Target2: <b>$${target2.toFixed(2)}</b>\n` +
    `📐 R/R (to T2): ${rr}\n\n` +
    `<i>${summary}</i>`;

  return sendMessage(chatId, msg);
}
