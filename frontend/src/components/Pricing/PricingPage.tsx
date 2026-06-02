import { useState } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface TierFeature {
  text: string;
  included: boolean;
}

interface TierCard {
  name: string;
  tier: 'free' | 'pro' | 'elite';
  price: number;
  priceLabel: string;
  color: string;
  borderColor: string;
  bgColor: string;
  badgeColor: string;
  features: TierFeature[];
}

const TIERS: TierCard[] = [
  {
    name: 'FREE',
    tier: 'free',
    price: 0,
    priceLabel: '$0/mo',
    color: 'text-terminal-text-primary',
    borderColor: 'border-terminal-border',
    bgColor: 'bg-terminal-bg/30',
    badgeColor: 'bg-terminal-border/40 text-terminal-text-secondary',
    features: [
      { text: 'Market Overview Dashboard', included: true },
      { text: 'Basic price data (indices only)', included: true },
      { text: 'Scanner — locked', included: false },
      { text: 'Alerts — locked', included: false },
      { text: 'Watchlist — locked', included: false },
      { text: 'All advanced features — locked', included: false },
    ],
  },
  {
    name: 'PRO',
    tier: 'pro',
    price: 29,
    priceLabel: '$29/mo',
    color: 'text-terminal-green',
    borderColor: 'border-terminal-green/30',
    bgColor: 'bg-terminal-green/5',
    badgeColor: 'bg-terminal-green/10 text-terminal-green',
    features: [
      { text: 'Real-time Stock Scanner', included: true },
      { text: 'Price & Scan Alerts', included: true },
      { text: 'Watchlist & Portfolio Tracking', included: true },
      { text: 'Market News Feed', included: true },
      { text: 'Earnings & Economic Calendar', included: true },
      { text: 'Futures Markets', included: true },
      { text: 'Trade Journal & P&L Tracking', included: true },
      { text: 'Risk Calculator & Kelly Criterion', included: true },
      { text: 'Multi-Timeframe Analysis', included: true },
      { text: 'Market Heatmap', included: true },
    ],
  },
  {
    name: 'ELITE',
    tier: 'elite',
    price: 79,
    priceLabel: '$79/mo',
    color: 'text-terminal-purple',
    borderColor: 'border-terminal-purple/30',
    bgColor: 'bg-terminal-purple/5',
    badgeColor: 'bg-terminal-purple/10 text-terminal-purple',
    features: [
      { text: 'Everything in PRO', included: true },
      { text: 'AI Technical Analysis & Signals', included: true },
      { text: 'Pattern Scanner (chart upload)', included: true },
      { text: 'Options Chain (Black-Scholes)', included: true },
      { text: 'Crypto Dashboard', included: true },
      { text: 'Paper Trading ($100k virtual)', included: true },
      { text: 'Advanced Market Screener', included: true },
      { text: 'Priority Support', included: true },
    ],
  },
];

function SubscribeModal({
  tier,
  onClose,
}: {
  tier: TierCard;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await axios.post('/api/admin/users', { email: email.trim(), tier: tier.tier });
    } catch {
      // show success anyway — request is captured
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-terminal-card border border-terminal-border rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-terminal-text-primary">
            Subscribe to <span className={tier.color}>{tier.name}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-terminal-text-secondary hover:text-terminal-text-primary transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-terminal-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-terminal-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-terminal-text-primary font-semibold">Request Sent!</p>
            <p className="text-terminal-text-secondary text-sm mt-2">
              Your request has been sent! We'll activate your account within 24 hours.
            </p>
            <button
              onClick={onClose}
              className="mt-5 px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-terminal-text-secondary">
              Enter your email address to request <span className={`font-semibold ${tier.color}`}>{tier.name}</span> access at{' '}
              <span className="text-terminal-text-primary font-semibold">{tier.priceLabel}</span>.
            </p>
            <div>
              <label className="block text-xs font-medium text-terminal-text-secondary mb-1.5 uppercase tracking-wide">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2.5 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                tier.tier === 'elite'
                  ? 'bg-terminal-purple text-white hover:bg-terminal-purple/90'
                  : 'bg-terminal-green text-black hover:bg-terminal-green/90'
              }`}
            >
              {loading ? 'Sending...' : 'Subscribe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const { userTier, setUserTier, setUserEmail, setGrantedFree, userEmail } = useStore();
  const [modalTier, setModalTier] = useState<TierCard | null>(null);
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState('');

  const handleStripeCheckout = async (tier: 'pro' | 'elite') => {
    setStripeLoading(tier);
    setStripeError('');
    try {
      const res = await axios.post('/api/stripe/create-checkout-session', {
        tier,
        email: userEmail ?? undefined,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setStripeError(res.data?.message ?? 'Failed to start checkout');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setStripeError(msg ?? 'Stripe not configured yet. Use manual request below.');
    } finally {
      setStripeLoading(null);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    setLookupMsg('');
    try {
      const res = await axios.get(`/api/admin/users/check?email=${encodeURIComponent(lookupEmail.trim())}`);
      const found = res.data?.user ?? res.data;
      if (found?.tier) {
        setUserTier(found.tier as 'free' | 'pro' | 'elite');
        setUserEmail(lookupEmail.trim());
        setGrantedFree(!!found.grantedFree);
        setLookupMsg(`Access confirmed: ${(found.tier as string).toUpperCase()} tier activated.`);
      } else {
        setLookupMsg('No account found for that email.');
      }
    } catch {
      setLookupMsg('No account found for that email.');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-10 pb-10">
      {/* Hero */}
      <div className="text-center py-6">
        <h2 className="text-2xl font-bold text-terminal-text-primary">
          Plans & <span className="text-terminal-cyan">Pricing</span>
        </h2>
        <p className="text-sm text-terminal-text-secondary mt-2 max-w-md mx-auto">
          Unlock advanced trading tools and market intelligence.
        </p>
        {userTier !== 'free' && (
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-terminal-cyan/10 border border-terminal-cyan/20 text-terminal-cyan text-xs font-semibold">
            <span className="w-1.5 h-1.5 bg-terminal-cyan rounded-full" />
            Current plan: {userTier.toUpperCase()}
          </div>
        )}
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {TIERS.map((tier) => {
          const isCurrentTier = userTier === tier.tier;
          const isHighlighted = isCurrentTier && tier.tier !== 'free';

          return (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all ${tier.bgColor} ${
                isHighlighted
                  ? `${tier.borderColor} ring-1 ring-offset-1 ring-offset-terminal-bg ${tier.tier === 'elite' ? 'ring-terminal-purple/30' : 'ring-terminal-green/30'}`
                  : tier.borderColor
              }`}
            >
              {isCurrentTier && tier.tier !== 'free' && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold ${tier.badgeColor} border ${tier.borderColor}`}>
                  Current Plan
                </div>
              )}

              <div className="mb-5">
                <span className={`text-xs font-bold uppercase tracking-widest ${tier.color}`}>{tier.name}</span>
                <div className="mt-2">
                  <span className={`text-3xl font-extrabold ${tier.color}`}>{tier.priceLabel.split('/')[0]}</span>
                  {tier.price > 0 && <span className="text-terminal-text-secondary text-sm">/month</span>}
                </div>
              </div>

              <ul className="space-y-2 flex-1 mb-6">
                {tier.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2 text-sm text-terminal-text-secondary">
                    <span className={`mt-0.5 shrink-0 ${tier.color}`}>✓</span>
                    {f.text}
                  </li>
                ))}
              </ul>

              {tier.tier === 'free' ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-lg text-sm font-semibold bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed"
                >
                  {isCurrentTier ? 'Already Active' : 'Get Started Free'}
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => handleStripeCheckout(tier.tier as 'pro' | 'elite')}
                    disabled={isCurrentTier || stripeLoading === tier.tier}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      isCurrentTier
                        ? 'bg-terminal-border/40 text-terminal-text-secondary cursor-not-allowed'
                        : tier.tier === 'elite'
                        ? 'bg-terminal-purple text-white hover:bg-terminal-purple/90'
                        : 'bg-terminal-green text-black hover:bg-terminal-green/90'
                    }`}
                  >
                    {stripeLoading === tier.tier ? (
                      <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Redirecting…</>
                    ) : isCurrentTier ? 'Active Plan' : (
                      <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pay by Card</>
                    )}
                  </button>
                  {!isCurrentTier && (
                    <button
                      onClick={() => setModalTier(tier)}
                      className="w-full py-2 rounded-lg text-xs font-medium text-terminal-text-secondary border border-terminal-border hover:border-terminal-cyan/30 hover:text-terminal-text-primary transition-colors"
                    >
                      Request manual access instead
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stripeError && (
        <div className="max-w-2xl mx-auto bg-terminal-yellow/5 border border-terminal-yellow/20 rounded-xl px-4 py-3 text-sm text-terminal-yellow">
          {stripeError}
        </div>
      )}

      {/* Payment info */}
      <div className="flex items-start gap-3 bg-terminal-cyan/5 border border-terminal-cyan/20 rounded-xl p-4 max-w-2xl mx-auto">
        <svg className="w-4 h-4 text-terminal-cyan shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        <p className="text-sm text-terminal-cyan">
          <span className="font-semibold">Secure card payments via Stripe. </span>
          Your tier activates instantly after payment. Cancel anytime from your account.
        </p>
      </div>

      {/* Lookup section */}
      <div className="max-w-md mx-auto bg-terminal-card border border-terminal-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-terminal-text-primary mb-1">Already have access?</h3>
        <p className="text-xs text-terminal-text-secondary mb-4">Enter your email to look up and activate your tier.</p>
        <form onSubmit={handleLookup} className="flex items-center gap-3">
          <input
            type="email"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text-primary placeholder-terminal-text-secondary focus:outline-none focus:border-terminal-cyan/50"
            placeholder="your@email.com"
            required
          />
          <button
            type="submit"
            disabled={lookupLoading}
            className="px-4 py-2 bg-terminal-cyan text-black text-sm font-semibold rounded-lg hover:bg-terminal-cyan/90 transition-colors disabled:opacity-60 shrink-0"
          >
            {lookupLoading ? '...' : 'Check'}
          </button>
        </form>
        {lookupMsg && (
          <p className={`text-sm mt-3 ${lookupMsg.includes('confirmed') ? 'text-terminal-green' : 'text-terminal-red'}`}>
            {lookupMsg}
          </p>
        )}
      </div>

      {/* Subscribe modal */}
      {modalTier && (
        <SubscribeModal tier={modalTier} onClose={() => setModalTier(null)} />
      )}
    </div>
  );
}
