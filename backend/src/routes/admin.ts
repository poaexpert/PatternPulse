/**
 * Admin API routes — protected by HMAC token.
 * Admin credentials: admin / PulseAdmin2025!
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { userStore } from '../data/userStore';
import { analyticsStore } from '../data/analyticsStore';
import { logError } from '../utils/logger';

const router = Router();

// ── Admin auth ────────────────────────────────────────────────────────────────

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'PulseAdmin2025!';
const ADMIN_SECRET   = 'pp-admin-hmac-2025-xK9qR';

function generateAdminToken(): string {
  return createHmac('sha256', ADMIN_SECRET)
    .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`)
    .digest('hex');
}

const VALID_TOKEN = generateAdminToken();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== VALID_TOKEN) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  next();
}

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: VALID_TOKEN });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', requireAdmin, (_req: Request, res: Response) => {
  try {
    const userStats = userStore.getStats();
    const analyticsSummary = analyticsStore.getSummary(7);
    return res.json({ success: true, users: userStats, analytics: analyticsSummary });
  } catch (err) {
    logError('Admin stats failed', err);
    return res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, users: userStore.getUsers() });
  } catch (err) {
    logError('Admin get users failed', err);
    return res.status(500).json({ success: false, message: 'Failed to get users' });
  }
});

router.get('/users/check', (req: Request, res: Response) => {
  // Public endpoint — lets a user check their own tier by email
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'email required' });
  const user = userStore.getUserByEmail(email);
  if (!user) return res.json({ success: true, found: false, tier: 'free' });
  userStore.touchUser(user.id);
  return res.json({ success: true, found: true, tier: user.tier, grantedFree: user.grantedFree, name: user.name });
});

router.post('/users', (req: Request, res: Response) => {
  // Semi-public: anyone can register (defaults to free). Admin can set tier via requireAdmin.
  const { email, name, tier } = req.body as { email?: string; name?: string; tier?: string };
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email required' });
  }
  // Check if already exists
  const existing = userStore.getUserByEmail(email);
  if (existing) {
    return res.json({ success: true, user: existing, created: false });
  }
  // Determine tier — admin can set any tier if authenticated; otherwise always free
  const auth = req.headers.authorization ?? '';
  const isAdmin = auth.startsWith('Bearer ') && auth.slice(7) === VALID_TOKEN;
  const finalTier = isAdmin && ['free','pro','elite'].includes(tier ?? '') ? (tier as 'free'|'pro'|'elite') : 'free';
  const user = userStore.createUser(email, name, finalTier);
  return res.json({ success: true, user, created: true });
});

router.patch('/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { tier, grantedFree, notes, name } = req.body as {
    tier?: string; grantedFree?: boolean; notes?: string; name?: string;
  };
  const updates: Record<string, unknown> = {};
  if (tier && ['free','pro','elite'].includes(tier)) updates.tier = tier;
  if (typeof grantedFree === 'boolean') updates.grantedFree = grantedFree;
  if (typeof notes === 'string') updates.notes = notes;
  if (typeof name  === 'string') updates.name  = name;
  const user = userStore.updateUser(id, updates as Parameters<typeof userStore.updateUser>[1]);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user });
});

router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = userStore.deleteUser(req.params.id);
  return res.json({ success: deleted, message: deleted ? 'Deleted' : 'User not found' });
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', requireAdmin, (_req: Request, res: Response) => {
  return res.json({ success: true, settings: userStore.getSettings() });
});

router.patch('/settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const settings = userStore.updateSettings(req.body);
    return res.json({ success: true, settings });
  } catch (err) {
    logError('Admin update settings failed', err);
    return res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/analytics/summary', requireAdmin, (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) ?? '7', 10) || 7;
  return res.json({ success: true, summary: analyticsStore.getSummary(days) });
});

router.get('/analytics/pages', requireAdmin, (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) ?? '7', 10) || 7;
  return res.json({ success: true, pages: analyticsStore.getPageStats(days) });
});

router.get('/analytics/countries', requireAdmin, (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) ?? '7', 10) || 7;
  return res.json({ success: true, countries: analyticsStore.getCountryStats(days) });
});

router.get('/analytics/daily', requireAdmin, (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) ?? '30', 10) || 30;
  return res.json({ success: true, daily: analyticsStore.getDailyStats(days) });
});

router.get('/analytics/sessions', requireAdmin, (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) ?? '100', 10) || 100;
  return res.json({ success: true, sessions: analyticsStore.getSessions(limit) });
});

router.get('/analytics/pageviews', requireAdmin, (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) ?? '200', 10) || 200;
  return res.json({ success: true, pageViews: analyticsStore.getRecentPageViews(limit) });
});

// ── Analytics tracking (called by frontend) ───────────────────────────────────

router.post('/analytics/track', (req: Request, res: Response) => {
  try {
    const {
      sessionId, userEmail, page, enteredAt, durationMs, userAgent, referrer, tier
    } = req.body as {
      sessionId?: string; userEmail?: string; page?: string; enteredAt?: string;
      durationMs?: number; userAgent?: string; referrer?: string; tier?: string;
    };

    if (!sessionId || !page) {
      return res.status(400).json({ success: false, message: 'sessionId and page required' });
    }

    // Get IP for geo-lookup
    const rawIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress ?? '';
    // Hash IP for privacy (one-way)
    const hashedIp = createHmac('sha256', 'pp-ip-hash').update(rawIp).digest('hex').slice(0, 12);

    // Simple geo from IP: use ip-api.com (free, no key, 45 req/min)
    // We do this asynchronously — don't block the response
    resolveGeo(rawIp).then(geo => {
      const pv = analyticsStore.trackPageView({
        sessionId,
        userEmail,
        page,
        enteredAt: enteredAt ?? new Date().toISOString(),
        durationMs,
        country: geo.country,
        city: geo.city,
        ip: hashedIp,
        userAgent,
        referrer,
        tier: (['free','pro','elite'].includes(tier ?? '') ? tier : 'free') as 'free'|'pro'|'elite',
      });
      // If durationMs provided, this is a leave event — update duration on existing record
    }).catch(() => {
      analyticsStore.trackPageView({
        sessionId, userEmail, page,
        enteredAt: enteredAt ?? new Date().toISOString(),
        durationMs, ip: hashedIp, userAgent, referrer,
        tier: (['free','pro','elite'].includes(tier ?? '') ? tier : 'free') as 'free'|'pro'|'elite',
      });
    });

    return res.json({ success: true });
  } catch (err) {
    logError('Analytics track failed', err);
    return res.status(500).json({ success: false, message: 'Tracking failed' });
  }
});

router.post('/analytics/duration', (req: Request, res: Response) => {
  const { pageViewId, durationMs } = req.body as { pageViewId?: string; durationMs?: number };
  if (!pageViewId || typeof durationMs !== 'number') {
    return res.status(400).json({ success: false, message: 'pageViewId and durationMs required' });
  }
  analyticsStore.updateDuration(pageViewId, durationMs);
  return res.json({ success: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const _geoCache = new Map<string, { country?: string; city?: string; ts: number }>();

async function resolveGeo(ip: string): Promise<{ country?: string; city?: string }> {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { country: 'Local', city: 'Localhost' };
  }
  const cached = _geoCache.get(ip);
  if (cached && Date.now() - cached.ts < 24 * 3600 * 1000) {
    return { country: cached.country, city: cached.city };
  }
  try {
    const { default: axios } = await import('axios');
    const res = await axios.get(`http://ip-api.com/json/${ip}?fields=country,city,status`, { timeout: 3000 });
    if (res.data.status === 'success') {
      const geo = { country: res.data.country, city: res.data.city, ts: Date.now() };
      _geoCache.set(ip, geo);
      return { country: geo.country, city: geo.city };
    }
  } catch { /* geo lookup failed — non-fatal */ }
  return {};
}

export default router;
