/**
 * JSON-file-backed user store for PatternPulse.
 * Stores users, their tiers, and site settings.
 */

import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger';

export type UserTier = 'free' | 'pro' | 'elite';

export interface User {
  id: string;
  email: string;
  name?: string;
  tier: UserTier;
  grantedFree: boolean; // admin can give any user free access to all features
  createdAt: string;
  lastSeen?: string;
  notes?: string;
}

export interface SiteSettings {
  pricing: { pro: number; elite: number };
  proFeatures: string[];
  eliteFeatures: string[];
  maintenanceMode: boolean;
  welcomeMessage: string;
}

interface StoreData {
  users: User[];
  settings: SiteSettings;
}

const DEFAULT_SETTINGS: SiteSettings = {
  pricing: { pro: 29, elite: 79 },
  proFeatures: ['scanner', 'alerts', 'watchlist', 'news', 'earnings', 'calendar', 'futures', 'journal', 'risk-calc', 'multi-tf', 'heatmap'],
  eliteFeatures: ['ai-analysis', 'pattern-scanner', 'options', 'crypto', 'paper-trade', 'screener'],
  maintenanceMode: false,
  welcomeMessage: '',
};

// Data directory: prefer /data at project root, fallback to cwd/data
const DATA_DIR  = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData(): StoreData {
  try {
    ensureDir();
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as StoreData;
    }
  } catch {
    log('Warning: userStore load failed, using defaults');
  }
  return { users: [], settings: { ...DEFAULT_SETTINGS } };
}

function saveData(data: StoreData): void {
  try {
    ensureDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch {
    log('Warning: userStore save failed');
  }
}

let _data = loadData();

export const userStore = {
  /* ── Reads ───────────────────────────────────────────────────────────── */
  getUsers:   ()  => _data.users,
  getSettings: () => ({ ...DEFAULT_SETTINGS, ..._data.settings }) as SiteSettings,

  getUserById:    (id: string)    => _data.users.find(u => u.id === id),
  getUserByEmail: (email: string) => _data.users.find(u => u.email.toLowerCase() === email.toLowerCase()),

  getStats: () => ({
    total:  _data.users.length,
    free:   _data.users.filter(u => u.tier === 'free').length,
    pro:    _data.users.filter(u => u.tier === 'pro').length,
    elite:  _data.users.filter(u => u.tier === 'elite').length,
  }),

  /* ── Writes ──────────────────────────────────────────────────────────── */
  createUser: (email: string, name?: string, tier: UserTier = 'free'): User => {
    const user: User = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      email: email.toLowerCase().trim(),
      name,
      tier,
      grantedFree: false,
      createdAt: new Date().toISOString(),
    };
    _data.users.push(user);
    saveData(_data);
    return user;
  },

  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): User | null => {
    const idx = _data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    _data.users[idx] = { ..._data.users[idx], ...updates };
    saveData(_data);
    return _data.users[idx];
  },

  deleteUser: (id: string): boolean => {
    const before = _data.users.length;
    _data.users = _data.users.filter(u => u.id !== id);
    if (_data.users.length < before) { saveData(_data); return true; }
    return false;
  },

  touchUser: (id: string): void => {
    const u = _data.users.find(u => u.id === id);
    if (u) { u.lastSeen = new Date().toISOString(); saveData(_data); }
  },

  updateSettings: (updates: Partial<SiteSettings>): SiteSettings => {
    _data.settings = { ...DEFAULT_SETTINGS, ..._data.settings, ...updates };
    saveData(_data);
    return _data.settings;
  },
};
