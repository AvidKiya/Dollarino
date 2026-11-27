import { invalidateDbPublicCache } from './d1-cache.js';

// Lightweight per-D1-instance TTL settings cache to eliminate dozens of repeated SELECTs
// Using WeakMap<D1Database, ...> guarantees total isolation across Vitest suites & fresh Miniflare DBs.

let SETTINGS_CACHE = new WeakMap<
  object,
  {
    ts: number;
    map: Map<string, string>;
  }
>();

let KEY_SETTINGS_CACHE = new WeakMap<
  object,
  Map<string, { ts: number; val: string }>
>();

let PUBLIC_COPIES_CACHE = new WeakMap<
  object,
  {
    ts: number;
    traders: unknown[];
  }
>();

const DEFAULT_TTL_MS = 300_000;

function isUncachedTimestampKey(key: string): boolean {
  return key.startsWith('intel_last_') || key.startsWith('intel_sig_last_') || key.endsWith('_last_at');
}

export async function getAllCachedSystemSettings(db: D1Database, ttlMs = DEFAULT_TTL_MS): Promise<Map<string, string>> {
  const now = Date.now();
  const hit = SETTINGS_CACHE.get(db as unknown as object);
  if (hit && now - hit.ts < ttlMs) {
    return hit.map;
  }

  const rows = await db
    .prepare(
      `SELECT key, value FROM system_settings
       WHERE key NOT IN ('telegram_bot_token_enc', 'telegram_webhook_secret_auto', 'treasury_encrypted_mnemonic')`
    )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] as Array<{ key: string; value: string }> }));

  const map = new Map<string, string>();
  for (const r of rows.results ?? []) {
    map.set(r.key, r.value);
  }
  SETTINGS_CACHE.set(db as unknown as object, { ts: now, map });
  return map;
}

export async function getBatchSystemSettings(
  db: D1Database,
  keys: string[],
  ttlMs = DEFAULT_TTL_MS
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!keys.length) return out;

  const now = Date.now();
  const fullHit = SETTINGS_CACHE.get(db as unknown as object);
  const fullValid = Boolean(fullHit && now - fullHit.ts < ttlMs);
  let keyMap = KEY_SETTINGS_CACHE.get(db as unknown as object);

  const missingKeys: string[] = [];
  for (const k of keys) {
    if (!isUncachedTimestampKey(k)) {
      if (fullValid) {
        const v = fullHit!.map.get(k);
        if (v !== undefined) out.set(k, v);
        continue;
      }
      const kh = keyMap?.get(k);
      if (kh && now - kh.ts < ttlMs) {
        if (kh.val !== '') out.set(k, kh.val);
        continue;
      }
    }
    missingKeys.push(k);
  }

  if (missingKeys.length === 0) return out;

  const placeholders = missingKeys.map(() => '?').join(', ');
  const rows = await db
    .prepare(`SELECT key, value FROM system_settings WHERE key IN (${placeholders})`)
    .bind(...missingKeys)
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] as Array<{ key: string; value: string }> }));

  if (!keyMap) {
    keyMap = new Map();
    KEY_SETTINGS_CACHE.set(db as unknown as object, keyMap);
  }

  const returned = new Map<string, string>();
  for (const r of rows.results ?? []) {
    returned.set(r.key, r.value);
    out.set(r.key, r.value);
  }

  // Negative-cache missing non-timestamp keys too so repeated lookups don't re-query D1
  for (const k of missingKeys) {
    if (!isUncachedTimestampKey(k)) {
      keyMap.set(k, { ts: now, val: returned.get(k) ?? '' });
    }
  }

  return out;
}

export async function getCachedSystemSetting(
  db: D1Database,
  key: string,
  fallback = ''
): Promise<string> {
  if (isUncachedTimestampKey(key)) {
    const row = await db
      .prepare(`SELECT value FROM system_settings WHERE key = ?`)
      .bind(key)
      .first<{ value: string }>()
      .catch(() => null);
    return row?.value !== undefined && row.value !== '' ? row.value : fallback;
  }
  const map = await getAllCachedSystemSettings(db);
  const val = map.get(key);
  return val !== undefined && val !== '' ? val : fallback;
}

export function invalidateSettingsCache(db?: D1Database): void {
  if (db) {
    SETTINGS_CACHE.delete(db as unknown as object);
    KEY_SETTINGS_CACHE.delete(db as unknown as object);
  } else {
    SETTINGS_CACHE = new WeakMap();
    KEY_SETTINGS_CACHE = new WeakMap();
  }
}

export async function setCachedSystemSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run()
    .catch(() => {});

  const now = Date.now();
  const hit = SETTINGS_CACHE.get(db as unknown as object);
  if (hit) {
    hit.map.set(key, value);
    hit.ts = now;
  }
  const keyMap = KEY_SETTINGS_CACHE.get(db as unknown as object);
  if (keyMap && !isUncachedTimestampKey(key)) {
    keyMap.set(key, { ts: now, val: value });
  }
}

export function getCachedPublicCopyTraders<T>(db: D1Database, ttlMs = 180_000): T[] | null {
  const hit = PUBLIC_COPIES_CACHE.get(db as unknown as object);
  if (hit && Date.now() - hit.ts < ttlMs) {
    return hit.traders as T[];
  }
  return null;
}

export function setCachedPublicCopyTraders(db: D1Database, traders: unknown[]): void {
  PUBLIC_COPIES_CACHE.set(db as unknown as object, { ts: Date.now(), traders });
}

export function invalidatePublicCopyTradersCache(db?: D1Database): void {
  if (db) {
    PUBLIC_COPIES_CACHE.delete(db as unknown as object);
    invalidateDbPublicCache(db, 'public:copy-traders');
  } else {
    PUBLIC_COPIES_CACHE = new WeakMap();
  }
}
