import fs from 'fs';
import path from 'path';

export function isDbConnectionError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || '';
  const code = err.code || '';
  return (
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1003' ||
    err.name === 'PrismaClientInitializationError' ||
    msg.includes("Can't reach database server") ||
    msg.includes('connection refused') ||
    msg.includes('ECONNREFUSED')
  );
}

interface LocalStore {
  watchlists: Record<string, Array<{ id: string; symbol: string; exchange: string; notes?: string; added_at: string }>>;
  preferences: Record<string, any>;
  brokerConnections: Record<string, any>;
}

const STORE_PATH = path.join(process.cwd(), '.local_dev_store.json');

function readStore(): LocalStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore read errors
  }
  return {
    watchlists: {},
    preferences: {},
    brokerConnections: {},
  };
}

function writeStore(store: LocalStore): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore write errors in read-only environments
  }
}

// Watchlist fallback operations
export function getFallbackWatchlist(userId: string) {
  const store = readStore();
  if (!store.watchlists[userId]) {
    // Seed with standard starter watchlist for new user
    store.watchlists[userId] = [
      { id: 'wl-1', symbol: 'RELIANCE', exchange: 'NSE', added_at: new Date(Date.now() - 86400000 * 3).toISOString() },
      { id: 'wl-2', symbol: 'HDFCBANK', exchange: 'NSE', added_at: new Date(Date.now() - 86400000 * 2).toISOString() },
      { id: 'wl-3', symbol: 'TCS', exchange: 'NSE', added_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 'wl-4', symbol: 'INFY', exchange: 'NSE', added_at: new Date().toISOString() },
    ];
    writeStore(store);
  }
  return store.watchlists[userId];
}

export function addFallbackWatchlist(userId: string, symbol: string, exchange: string = 'NSE', notes?: string) {
  const store = readStore();
  const list = store.watchlists[userId] || [];
  const existing = list.find((item) => item.symbol === symbol);
  if (existing) {
    existing.exchange = exchange;
    if (notes !== undefined) existing.notes = notes;
    writeStore(store);
    return existing;
  }
  const newItem = {
    id: `wl-${Date.now()}`,
    symbol,
    exchange,
    notes,
    added_at: new Date().toISOString(),
  };
  list.unshift(newItem);
  store.watchlists[userId] = list;
  writeStore(store);
  return newItem;
}

export function removeFallbackWatchlist(userId: string, symbol: string) {
  const store = readStore();
  if (!store.watchlists[userId]) return;
  store.watchlists[userId] = store.watchlists[userId].filter((item) => item.symbol !== symbol);
  writeStore(store);
}

// Alert preferences fallback
export function getFallbackAlertPref(userId: string) {
  const store = readStore();
  if (!store.preferences[userId]) {
    store.preferences[userId] = {
      id: `pref-${userId}`,
      user_id: userId,
      channels_enabled: { web_push: true, telegram: false, whatsapp: false },
      telegram_chat_id: null,
      whatsapp_number: null,
      web_push_subscription: null,
      alert_types_subscribed: {
        new_signal: true,
        target_hit: true,
        sl_hit: true,
        breakout: true,
        risk_warning: true,
        watchlist_move: false,
      },
      quiet_hours: { enabled: false, start: '22:00', end: '07:00' },
      min_confidence_threshold: 70,
      updated_at: new Date().toISOString(),
    };
    writeStore(store);
  }
  return store.preferences[userId];
}

export function updateFallbackAlertPref(userId: string, updates: any) {
  const store = readStore();
  const existing = getFallbackAlertPref(userId);
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  store.preferences[userId] = updated;
  writeStore(store);
  return updated;
}

// Broker connection fallback
export function getFallbackBrokerConnection(userId: string) {
  const store = readStore();
  return store.brokerConnections[userId] || null;
}

export function setFallbackBrokerConnection(userId: string, conn: any) {
  const store = readStore();
  store.brokerConnections[userId] = conn;
  writeStore(store);
}
