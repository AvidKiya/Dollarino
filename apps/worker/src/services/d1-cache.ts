import type { Context } from 'hono';
import type { Env } from '../env.js';

// Cloudflare D1 Quota Protection Layer
// Combines per-D1-instance WeakMap TTL caches (isolated per test DB / Miniflare instance)
// and optional Cloudflare Cache API (`caches.default`) for public endpoints so repeat reads hit 0 D1 rows.

type CacheEntry<T> = { ts: number; data: T };

const PUBLIC_MEM_CACHE = new WeakMap<object, Map<string, CacheEntry<unknown>>>();
const USER_DASH_CACHE = new WeakMap<object, Map<string, CacheEntry<unknown>>>();

function getDbScopedMap(
  wm: WeakMap<object, Map<string, CacheEntry<unknown>>>,
  db: D1Database
): Map<string, CacheEntry<unknown>> {
  let m = wm.get(db as unknown as object);
  if (!m) {
    m = new Map();
    wm.set(db as unknown as object, m);
  }
  return m;
}

export async function getOrComputeDbCached<T>(
  db: D1Database,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>
): Promise<{ data: T; hit: boolean }> {
  const m = getDbScopedMap(PUBLIC_MEM_CACHE, db);
  const now = Date.now();
  const prev = m.get(key);
  if (prev && now - prev.ts < ttlMs) {
    return { data: prev.data as T, hit: true };
  }
  const data = await compute();
  m.set(key, { ts: now, data });
  return { data, hit: false };
}

export function invalidateDbPublicCache(db: D1Database, keyPrefix?: string): void {
  const m = PUBLIC_MEM_CACHE.get(db as unknown as object);
  if (!m) return;
  if (!keyPrefix) {
    m.clear();
    return;
  }
  for (const k of m.keys()) {
    if (k.startsWith(keyPrefix)) m.delete(k);
  }
}

export function getCachedUserDashboard<T>(db: D1Database, userId: string, cacheKey: string, ttlMs: number): T | null {
  const m = USER_DASH_CACHE.get(db as unknown as object);
  const hit = m?.get(`${userId}:${cacheKey}`);
  if (hit && Date.now() - hit.ts < ttlMs) {
    return hit.data as T;
  }
  return null;
}

export function setCachedUserDashboard<T>(db: D1Database, userId: string, cacheKey: string, data: T): void {
  const m = getDbScopedMap(USER_DASH_CACHE, db);
  m.set(`${userId}:${cacheKey}`, { ts: Date.now(), data });
  if (m.size > 400) {
    const oldestKey = m.keys().next().value;
    if (oldestKey) m.delete(oldestKey);
  }
}

export function invalidateUserDashboardCache(db: D1Database, userId?: string): void {
  const m = USER_DASH_CACHE.get(db as unknown as object);
  if (!m) return;
  if (!userId) {
    m.clear();
    return;
  }
  const prefix = `${userId}:`;
  for (const k of m.keys()) {
    if (k.startsWith(prefix)) m.delete(k);
  }
}

/**
 * Serves a public JSON GET response through Cloudflare Edge Cache (`caches.default`) when running on a real host,
 * backed by per-DB in-memory TTL cache so repeated guest/browser polls consume zero D1 row reads.
 */
export async function serveWithEdgeAndDbCache<T, E extends { Bindings: Env; Variables?: any } = { Bindings: Env; Variables?: any }>(
  c: Context<E, any, any>,
  opts: {
    edgeCacheKey: string;
    dbKey: string;
    ttlSeconds: number;
  },
  compute: () => Promise<T>
): Promise<Response> {
  const ttlMs = Math.max(1000, opts.ttlSeconds * 1000);
  const db = c.env.DB;
  const mem = getDbScopedMap(PUBLIC_MEM_CACHE, db);
  const now = Date.now();
  const memHit = mem.get(opts.dbKey);
  if (memHit && now - memHit.ts < ttlMs) {
    return c.json(memHit.data as T, 200, {
      'Cache-Control': `public, max-age=${opts.ttlSeconds}, s-maxage=${opts.ttlSeconds}`,
      'X-Dollarino-Cache': 'MEM_HIT',
    });
  }

  // Only engage Cloudflare global caches.default when not inside a local/test .local host
  const isLocalHost = c.req.url.includes('.local') || c.req.url.includes('127.0.0.1') || c.req.url.includes('localhost');
  const cfCaches = !isLocalHost ? (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default : undefined;
  const edgeReq = cfCaches ? new Request(opts.edgeCacheKey, { method: 'GET' }) : null;
  if (cfCaches && edgeReq) {
    try {
      const matched = await cfCaches.match(edgeReq);
      if (matched) {
        const parsed = (await matched.json()) as T;
        mem.set(opts.dbKey, { ts: now, data: parsed });
        return c.json(parsed, 200, {
          'Cache-Control': `public, max-age=${opts.ttlSeconds}, s-maxage=${opts.ttlSeconds}`,
          'X-Dollarino-Cache': 'EDGE_HIT',
        });
      }
    } catch {
      // Ignore cache API errors in local/test runtimes
    }
  }

  const data = await compute();
  mem.set(opts.dbKey, { ts: now, data });

  if (cfCaches && edgeReq) {
    try {
      const resp = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${opts.ttlSeconds}, s-maxage=${opts.ttlSeconds}`,
        },
      });
      await cfCaches.put(edgeReq, resp);
    } catch {
      // Ignore put failure
    }
  }

  return c.json(data, 200, {
    'Cache-Control': `public, max-age=${opts.ttlSeconds}, s-maxage=${opts.ttlSeconds}`,
    'X-Dollarino-Cache': 'MISS',
  });
}
