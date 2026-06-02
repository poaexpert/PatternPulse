/**
 * Stripe integration routes for PatternPulse.
 * Handles checkout sessions, webhooks, and revenue reporting.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY      — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET  — whsec_... (from Stripe dashboard webhook settings)
 *   STRIPE_PRO_PRICE_ID    — price_... for PRO monthly subscription
 *   STRIPE_ELITE_PRICE_ID  — price_... for ELITE monthly subscription
 *   APP_URL                — https://your-domain.up.railway.app
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { userStore } from '../data/userStore';
import { logError } from '../utils/logger';

const router = Router();

// Lazy-load stripe so the app boots even if stripe package is absent
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2025-04-30.basil' });
}

const STRIPE_WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET ?? '';
const STRIPE_PRO_PRICE     = () => process.env.STRIPE_PRO_PRICE_ID ?? '';
const STRIPE_ELITE_PRICE   = () => process.env.STRIPE_ELITE_PRICE_ID ?? '';
const APP_URL              = () => process.env.APP_URL ?? 'http://localhost:5173';

// ── Admin auth (same token as admin.ts) ───────────────────────────────────────

const ADMIN_TOKEN = createHmac('sha256', 'pp-admin-hmac-2025-xK9qR')
  .update('admin:PulseAdmin2025!')
  .digest('hex');

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_TOKEN) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  next();
}

// ── POST /api/stripe/create-checkout-session ──────────────────────────────────

router.post('/create-checkout-session', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ success: false, message: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });
    return;
  }
  const { tier, email } = req.body as { tier?: string; email?: string };
  if (!tier || !['pro', 'elite'].includes(tier)) {
    res.status(400).json({ success: false, message: 'Invalid tier. Must be pro or elite.' });
    return;
  }
  const priceId = tier === 'pro' ? STRIPE_PRO_PRICE() : STRIPE_ELITE_PRICE();
  if (!priceId) {
    res.status(503).json({ success: false, message: `STRIPE_${tier.toUpperCase()}_PRICE_ID not configured.` });
    return;
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      metadata: { tier },
      success_url: `${APP_URL()}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL()}/?payment=cancelled`,
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    logError('Stripe checkout session failed', err);
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// ── POST /api/stripe/webhook ──────────────────────────────────────────────────
// NOTE: This route is registered in server.ts BEFORE express.json() so it
// receives the raw body needed for Stripe signature verification.

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const stripe = getStripe();
  const webhookSecret = STRIPE_WEBHOOK_SECRET();

  if (!stripe || !webhookSecret) {
    res.status(200).send('OK'); // silently ignore if not configured
    return;
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logError('Stripe webhook signature failed', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        customer_email?: string;
        customer_details?: { email?: string };
        customer?: string;
        subscription?: string;
        metadata?: { tier?: string };
      };
      const email = session.customer_email ?? session.customer_details?.email;
      const tier = session.metadata?.tier as 'pro' | 'elite' | undefined;
      if (email && tier) {
        let user = userStore.getUserByEmail(email);
        if (user) {
          userStore.updateUser(user.id, {
            tier,
            stripeCustomerId: session.customer ?? user.stripeCustomerId,
            stripeSubscriptionId: session.subscription ?? user.stripeSubscriptionId,
            stripeStatus: 'active',
          });
        } else {
          user = userStore.createUser(email, undefined, tier);
          userStore.updateUser(user.id, {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            stripeStatus: 'active',
          });
        }
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as { id: string; status: string; metadata?: { tier?: string } };
      const users = userStore.getUsers();
      const user = users.find(u => u.stripeSubscriptionId === sub.id);
      if (user) {
        userStore.updateUser(user.id, { stripeStatus: sub.status });
        if (sub.status === 'past_due' || sub.status === 'unpaid') {
          userStore.updateUser(user.id, { tier: 'free' });
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as { id: string };
      const users = userStore.getUsers();
      const user = users.find(u => u.stripeSubscriptionId === sub.id);
      if (user) {
        userStore.updateUser(user.id, { tier: 'free', stripeStatus: 'canceled' });
      }
    }
  } catch (err) {
    logError('Stripe webhook processing error', err);
  }

  res.json({ received: true });
}

// ── POST /api/stripe/portal ───────────────────────────────────────────────────

router.post('/portal', async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ success: false, message: 'Stripe not configured' });
    return;
  }
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ success: false, message: 'Email required' });
    return;
  }
  const user = userStore.getUserByEmail(email);
  if (!user?.stripeCustomerId) {
    res.status(404).json({ success: false, message: 'No Stripe subscription found for this email' });
    return;
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: APP_URL(),
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    logError('Stripe portal session failed', err);
    res.status(500).json({ success: false, message: 'Failed to create portal session' });
  }
});

// ── GET /api/stripe/config-status (admin) ─────────────────────────────────────

router.get('/config-status', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    success: true,
    configured: !!process.env.STRIPE_SECRET_KEY,
    hasProPrice: !!STRIPE_PRO_PRICE(),
    hasElitePrice: !!STRIPE_ELITE_PRICE(),
    hasWebhookSecret: !!STRIPE_WEBHOOK_SECRET(),
    liveMode: (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_'),
  });
});

// ── GET /api/stripe/revenue (admin) ───────────────────────────────────────────

router.get('/revenue', requireAdmin, async (_req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.json({ success: true, configured: false, mrr: 0, subscriptions: [], recentPayments: [] });
    return;
  }
  try {
    const [subsResp, chargesResp] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.customer'] }),
      stripe.charges.list({ limit: 25 }),
    ]);

    let mrr = 0;
    const subscriptions = subsResp.data.map((sub: {
      id: string; status: string; created: number; current_period_end: number;
      metadata: { tier?: string }; customer: { email?: string };
      items: { data: Array<{ price: { unit_amount?: number; nickname?: string } }> };
    }) => {
      const amount = (sub.items.data[0]?.price.unit_amount ?? 0) / 100;
      mrr += amount;
      return {
        id: sub.id,
        email: (sub.customer as { email?: string })?.email ?? '—',
        plan: sub.metadata?.tier ?? sub.items.data[0]?.price.nickname ?? '—',
        amount,
        status: sub.status,
        created: new Date(sub.created * 1000).toISOString(),
        renewsAt: new Date(sub.current_period_end * 1000).toISOString(),
      };
    });

    const recentPayments = chargesResp.data.map((ch: {
      id: string; amount: number; currency: string;
      billing_details: { email?: string }; status: string; created: number;
    }) => ({
      id: ch.id,
      amount: ch.amount / 100,
      currency: ch.currency.toUpperCase(),
      email: ch.billing_details?.email ?? '—',
      status: ch.status,
      created: new Date(ch.created * 1000).toISOString(),
    }));

    res.json({ success: true, configured: true, mrr, subscriptions, recentPayments });
  } catch (err) {
    logError('Stripe revenue fetch failed', err);
    res.status(500).json({ success: false, message: 'Failed to fetch Stripe data' });
  }
});

export default router;
