/**
 * Analytics hook — automatically tracks page views and session duration.
 * Sends data to /api/admin/analytics/track on every page change.
 */

import { useEffect, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store';

function getSessionId(): string {
  let id = sessionStorage.getItem('pp_session_id');
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('pp_session_id', id);
  }
  return id;
}

const SESSION_ID = getSessionId();

export function useAnalytics() {
  const { activeView, userEmail, userTier, isAdminLoggedIn } = useStore();
  const enteredAtRef  = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const enteredAt = new Date().toISOString();
    enteredAtRef.current = enteredAt;

    // Show 'admin' tier in analytics when logged in as admin
    const effectiveTier = isAdminLoggedIn ? 'admin' : userTier;

    const payload = {
      sessionId:  SESSION_ID,
      userEmail:  userEmail ?? undefined,
      page:       activeView,
      enteredAt,
      userAgent:  navigator.userAgent,
      referrer:   document.referrer || undefined,
      tier:       effectiveTier,
    };

    axios.post('/api/admin/analytics/track', payload, { timeout: 5000 })
      .catch(() => { /* non-fatal */ });

    return () => {
      const durationMs = Date.now() - new Date(enteredAtRef.current).getTime();
      if (durationMs > 1000) {
        const body = JSON.stringify({ sessionId: SESSION_ID, userEmail, page: activeView, enteredAt: enteredAtRef.current, durationMs, tier: effectiveTier });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/admin/analytics/track', new Blob([body], { type: 'application/json' }));
        }
      }
    };
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps
}
