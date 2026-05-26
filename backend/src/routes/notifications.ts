import { Router, Request, Response } from 'express';
import { store } from '../store';
import * as telegramService from '../notifications/telegram';
import * as pushoverService from '../notifications/pushover';
import { log } from '../utils/logger';

const router = Router();

/**
 * GET /api/notifications/settings
 * Returns current notification settings.
 * Masks sensitive tokens in the response.
 */
router.get('/settings', (req: Request, res: Response) => {
  const settings = store.getNotificationSettings();

  // Mask tokens for security
  const masked = {
    ...settings,
    telegram: {
      ...settings.telegram,
      botToken: settings.telegram.botToken
        ? `${settings.telegram.botToken.slice(0, 6)}...`
        : '',
    },
    pushover: {
      ...settings.pushover,
      userKey: settings.pushover.userKey
        ? `${settings.pushover.userKey.slice(0, 4)}...`
        : '',
      appToken: settings.pushover.appToken
        ? `${settings.pushover.appToken.slice(0, 4)}...`
        : '',
    },
  };

  res.json({ success: true, settings: masked });
});

/**
 * PUT /api/notifications/settings
 * Update notification settings.
 * Re-initializes Telegram bot if token changes.
 */
router.put('/settings', (req: Request, res: Response) => {
  const current = store.getNotificationSettings();
  const updates = req.body;

  const updated = store.updateNotificationSettings(updates);

  // Re-init Telegram if token changed and not masked
  const newToken = updated.telegram.botToken;
  if (
    newToken &&
    !newToken.includes('...') &&
    newToken !== current.telegram.botToken
  ) {
    log('Telegram bot token updated — reinitializing');
    telegramService.initTelegram(newToken);
  }

  res.json({ success: true, settings: updated });
});

/**
 * POST /api/notifications/test/telegram
 * Send a test Telegram message.
 */
router.post('/test/telegram', async (req: Request, res: Response) => {
  const settings = store.getNotificationSettings();

  const botToken = req.body?.botToken || settings.telegram.botToken;
  const chatId = req.body?.chatId || settings.telegram.chatId;

  if (!botToken || botToken.includes('...')) {
    return res.status(400).json({
      success: false,
      message: 'Telegram bot token not configured or is masked. Update settings first.',
    });
  }
  if (!chatId) {
    return res.status(400).json({
      success: false,
      message: 'Telegram chat ID not configured',
    });
  }

  // Initialize (or re-init) with the provided token
  if (!telegramService.isInitialized()) {
    telegramService.initTelegram(botToken);
  }

  try {
    const ok = await telegramService.testConnection(chatId);
    return res.json({
      success: ok,
      message: ok ? 'Test message sent successfully' : 'Failed to send test message',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Test failed: ${err}` });
  }
});

/**
 * POST /api/notifications/test/pushover
 * Send a test Pushover notification.
 */
router.post('/test/pushover', async (req: Request, res: Response) => {
  const settings = store.getNotificationSettings();

  const userKey = req.body?.userKey || settings.pushover.userKey;
  const appToken = req.body?.appToken || settings.pushover.appToken;

  if (!userKey || userKey.includes('...') || !appToken || appToken.includes('...')) {
    return res.status(400).json({
      success: false,
      message: 'Pushover credentials not configured or are masked. Update settings first.',
    });
  }

  try {
    const ok = await pushoverService.testPushover({ userKey, appToken });
    return res.json({
      success: ok,
      message: ok ? 'Test notification sent successfully' : 'Failed to send test notification',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Test failed: ${err}` });
  }
});

/**
 * GET /api/notifications/telegram/detect-chat
 * Auto-detect the chat ID from recent bot messages (user must have messaged the bot first).
 */
router.get('/telegram/detect-chat', async (_req: Request, res: Response) => {
  try {
    const chats = await telegramService.getUpdates();
    if (chats.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No messages found. Open Telegram, find your PatternPulse bot, and send it /start — then try again.',
      });
    }
    // Auto-save the first chat ID found
    const { chatId, username } = chats[0];
    const curTg = store.getNotificationSettings().telegram;
    store.updateNotificationSettings({ telegram: { ...curTg, chatId } });
    log(`Telegram chat ID auto-detected: ${chatId} (${username})`);
    return res.json({ success: true, chatId, username });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Failed to detect chat: ${err}` });
  }
});

/**
 * GET /api/notifications/history
 * Returns recent alert history (last 100 entries).
 */
router.get('/history', (req: Request, res: Response) => {
  const history = store.getAlertHistory().slice(0, 100);
  res.json({ success: true, count: history.length, history });
});

export default router;
