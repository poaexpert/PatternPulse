/**
 * Analytics hook — automatically tracks page views and session duration.
 * Sends data to /api/admin/analytics/track on every page change.
 */

import { useEffect, useRef } from 'react';
import axios from 'axios';
import { useStore } from '../store';

// Stable session ID for this browser tab (survives re-renders, not page reloads)
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
  const { activeView, userEmail, userTier } = useStore();
  const enteredAtRef  = useRef<string>(new Date().toISOString());
  const pageViewIdRef = useRef<string | null>(null);

  useEffect(() => {
    const enteredAt = new Date().toISOString();
    enteredAtRef.current = enteredAt;

    const payload = {
      sessionId:  SESSION_ID,
      userEmail:  userEmail ?? undefined,
      page:       activeView,
      enteredAt,
      userAgent:  navigator.userAgent,
      referrer:   document.referrer || undefined,
      tier:       userTier,
    };

    // Fire and forget — don't block the UI
    axios.post('/api/admin/analytics/track', payload, { timeout: 5000 })
      .then(res => {
        if (res.data?.pageViewId) pageViewIdRef.current = res.data.pageViewId;
      })
      .catch(() => { /* analytics errors are non-fatal */ });

    // On cleanup (page change), record duration
    return () => {
      const durationMs = Date.now() - new Date(enteredAtRef.current).getTime();
      if (durationMs > 1000) {
        // Best-effort beacon on navigate-away
        const body = JSON.stringify({ sessionId: SESSION_ID, userEmail, page: activeView, enteredAt: enteredAtRef.current, durationMs, tier: userTier });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/admin/analytics/track', new Blob([body], { type: 'application/json' }));
        }
      }
    };
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps
}
