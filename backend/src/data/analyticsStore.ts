/**
 * Analytics store — tracks page views, session durations, and visitor data.
 * Stored in data/analytics.json with rolling 90-day retention.
 */

import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger';

export interface PageView {
  id: string;
  sessionId: string;
  userEmail?: string;
  page: string;          // e.g. 'dashboard', 'options', 'pattern-scanner'
  enteredAt: string;     // ISO timestamp
  durationMs?: number;   // filled when user navigates away
  country?: string;      // resolved from IP
  city?: string;
  ip?: string;           // hashed for privacy
  userAgent?: string;
  referrer?: string;
  tier: 'free' | 'pro' | 'elite';
}

export interface Session {
  id: string;
  startedAt: string;
  lastActivity: string;
  country?: string;
  city?: string;
  ip?: string;
  userAgent?: string;
  userEmail?: string;
  tier: 'free' | 'pro' | 'elite';
  pageCount: number;
  totalDurationMs: number;
  pages: string[];
}

interface AnalyticsData {
  pageViews: PageView[];
  sessions: Session[];
  lastPruned: string;
}

const DATA_DIR  = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'analytics.json');
const MAX_ENTRIES = 50_000; // cap to prevent unbounded growth
const RETENTION_DAYS = 90;

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData(): AnalyticsData {
  try {
    ensureDir();
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as AnalyticsData;
    }
  } catch {
    log('Warning: analyticsStore load failed, starting fresh');
  }
  return { pageViews: [], sessions: [], lastPruned: new Date().toISOString() };
}

function saveData(data: AnalyticsData): void {
  try {
    ensureDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch {
    log('Warning: analyticsStore save failed');
  }
}

function pruneOld(data: AnalyticsData): void {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  data.pageViews = data.pageViews.filter(p => new Date(p.enteredAt).getTime() > cutoff).slice(-MAX_ENTRIES);
  data.sessions  = data.sessions.filter(s => new Date(s.startedAt).getTime() > cutoff).slice(-MAX_ENTRIES);
  data.lastPruned = new Date().toISOString();
}

let _data = loadData();

// Prune on startup
pruneOld(_data);
saveData(_data);

// Prune daily
setInterval(() => { pruneOld(_data); saveData(_data); }, 24 * 60 * 60 * 1000);

export const analyticsStore = {
  /* ── Track a page view ───────────────────────────────────────────────── */
  trackPageView: (pv: Omit<PageView, 'id'>): PageView => {
    const entry: PageView = { id: `pv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...pv };
    _data.pageViews.push(entry);
    // Update or create session
    const sess = _data.sessions.find(s => s.id === pv.sessionId);
    if (sess) {
      sess.lastActivity = new Date().toISOString();
      sess.pageCount++;
      if (!sess.pages.includes(pv.page)) sess.pages.push(pv.page);
      if (pv.userEmail && !sess.userEmail) sess.userEmail = pv.userEmail;
    } else {
      _data.sessions.push({
        id: pv.sessionId,
        startedAt: pv.enteredAt,
        lastActivity: pv.enteredAt,
        country: pv.country,
        city: pv.city,
        ip: pv.ip,
        userAgent: pv.userAgent,
        userEmail: pv.userEmail,
        tier: pv.tier,
        pageCount: 1,
        totalDurationMs: 0,
        pages: [pv.page],
      });
    }
    saveData(_data);
    return entry;
  },

  /* ── Update duration when user leaves a page ─────────────────────────── */
  updateDuration: (pageViewId: string, durationMs: number): void => {
    const pv = _data.pageViews.find(p => p.id === pageViewId);
    if (pv) {
      pv.durationMs = durationMs;
      const sess = _data.sessions.find(s => s.id === pv.sessionId);
      if (sess) sess.totalDurationMs += durationMs;
      saveData(_data);
    }
  },

  /* ── Queries ─────────────────────────────────────────────────────────── */
  getRecentPageViews: (limit = 500): PageView[] =>
    _data.pageViews.slice(-limit).reverse(),

  getSessions: (limit = 200): Session[] =>
    _data.sessions.slice(-limit).reverse(),

  getPageStats: (days = 7) => {
    const cutoff = Date.now() - days * 86_400_000;
    const recent = _data.pageViews.filter(p => new Date(p.enteredAt).getTime() > cutoff);
    const byPage: Record<string, { views: number; avgDurationMs: number; uniqueSessions: Set<string> }> = {};
    for (const pv of recent) {
      if (!byPage[pv.page]) byPage[pv.page] = { views: 0, avgDurationMs: 0, uniqueSessions: new Set() };
      byPage[pv.page].views++;
      byPage[pv.page].uniqueSessions.add(pv.sessionId);
      if (pv.durationMs) byPage[pv.page].avgDurationMs += pv.durationMs;
    }
    return Object.entries(byPage).map(([page, stats]) => ({
      page,
      views: stats.views,
      uniqueVisitors: stats.uniqueSessions.size,
      avgDurationSec: stats.views > 0 ? Math.round(stats.avgDurationMs / stats.views / 1000) : 0,
    })).sort((a, b) => b.views - a.views);
  },

  getCountryStats: (days = 7) => {
    const cutoff = Date.now() - days * 86_400_000;
    const recent = _data.pageViews.filter(p => new Date(p.enteredAt).getTime() > cutoff && p.country);
    const byCountry: Record<string, number> = {};
    for (const pv of recent) {
      const c = pv.country ?? 'Unknown';
      byCountry[c] = (byCountry[c] ?? 0) + 1;
    }
    return Object.entries(byCountry).map(([country, views]) => ({ country, views }))
      .sort((a, b) => b.views - a.views);
  },

  getDailyStats: (days = 30) => {
    const result: { date: string; views: number; sessions: number; users: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const dateStr = d.toISOString().split('T')[0];
      const dayViews = _data.pageViews.filter(p => p.enteredAt.startsWith(dateStr));
      result.push({
        date: dateStr,
        views: dayViews.length,
        sessions: new Set(dayViews.map(p => p.sessionId)).size,
        users: new Set(dayViews.filter(p => p.userEmail).map(p => p.userEmail!)).size,
      });
    }
    return result;
  },

  getSummary: (days = 7) => {
    const cutoff = Date.now() - days * 86_400_000;
    const recent = _data.pageViews.filter(p => new Date(p.enteredAt).getTime() > cutoff);
    const prevCutoff = cutoff - days * 86_400_000;
    const prev = _data.pageViews.filter(p => {
      const t = new Date(p.enteredAt).getTime();
      return t > prevCutoff && t <= cutoff;
    });
    const uniqueSessions = new Set(recent.map(p => p.sessionId)).size;
    const prevSessions  = new Set(prev.map(p => p.sessionId)).size;
    const avgDuration = recent.filter(p => p.durationMs).reduce((s, p) => s + p.durationMs!, 0)
      / (recent.filter(p => p.durationMs).length || 1);
    return {
      totalViews: recent.length,
      prevTotalViews: prev.length,
      uniqueSessions,
      prevUniqueSessions: prevSessions,
      uniqueUsers: new Set(recent.filter(p => p.userEmail).map(p => p.userEmail!)).size,
      avgSessionDurationSec: Math.round(avgDuration / 1000),
    };
  },
};
