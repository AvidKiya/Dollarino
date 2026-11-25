// Lightweight per-D1-instance TTL settings cache to eliminate dozens of repeated SELECTs
// Using WeakMap<D1Database, ...> guarantees total isolation across Vitest suites & fresh Miniflare DBs.

const SETTINGS_CACHE = new WeakMap<
  object,
  {
    ts: number;
    map: Map<string, string>;
  }
>();

const PUBLIC_COPIES_CACHE = new WeakMap<
  object,
  {
    ts: number;
    traders: unknown[];
  }
>();

const DEFAULT_TTL_MS = 45_000;

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

export async function getCachedSystemSetting(
  db: D1Database,
  key: string,
  fallback = ''
): Promise<string> {
  if (key.startsWith('intel_last_') || key.endsWith('_last_at')) {
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

  const hit = SETTINGS_CACHE.get(db as unknown as object);
  if (hit) {
    hit.map.set(key, value);
    hit.ts = Date.now();
  }
}

export function getCachedPublicCopyTraders<T>(db: D1Database, ttlMs = 60_000): T[] | null {
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
  }
}
