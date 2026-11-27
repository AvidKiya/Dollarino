import { sha256Hex } from './crypto.js';
import type { Env } from './env.js';

interface MemoryBucket {
  windowStart: number;
  hits: number;
}

// Fast isolate-level cache so read-heavy abuse drops before hitting D1
const localBuckets = new Map<string, MemoryBucket>();

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp && cfIp.length <= 64) return cfIp;
  const trueIp = request.headers.get('True-Client-IP')?.trim() || request.headers.get('X-Real-IP')?.trim();
  if (trueIp && trueIp.length <= 64) return trueIp;
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    const rightmost = parts[parts.length - 1];
    if (rightmost && rightmost.length <= 64) return rightmost;
  }
  return 'unknown';
}

/**
 * Constant-time equality over SHA-256 digests so lengths and prefixes never leak via timing.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  if (ha.length !== hb.length) return false;
  let diff = 0;
  for (let i = 0; i < ha.length; i++) {
    diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Strict SSRF firewall for user-supplied proxy/AI/webhook URLs.
 * Blocks loopback, RFC1918 private LANs, cloud metadata (169.254.x), link-local,
 * IPv6 ULA/loopback, credentials-in-URL, and internal hostnames.
 */
export function isSafeExternalHttpUrl(rawUrl: string): boolean {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed.length > 512) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    host === 'metadata.google.internal'
  ) {
    return false;
  }

  // Block integer/hex/octal obfuscated IPv4 hostnames (e.g. 2130706433 or 0x7f000001)
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false;

  // Check dotted IPv4 private / reserved ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = [Number(ipv4Match[1]), Number(ipv4Match[2]), Number(ipv4Match[3]), Number(ipv4Match[4])];
    if ([a, b, c, d].some((n) => n > 255)) return false;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // AWS/GCP/Cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // Multicast / reserved
  }

  // Block IPv6 loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10), v4-mapped
  if (host.includes(':')) {
    const cleanV6 = host.split('%')[0] || host;
    if (
      cleanV6 === '::' ||
      cleanV6 === '::1' ||
      cleanV6.startsWith('::ffff:') ||
      cleanV6.startsWith('fc') ||
      cleanV6.startsWith('fd') ||
      cleanV6.startsWith('fe8') ||
      cleanV6.startsWith('fe9') ||
      cleanV6.startsWith('fea') ||
      cleanV6.startsWith('feb')
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Strict CORS origin allowlist: prevents credentialed cross-origin requests from untrusted external domains
 * while seamlessly supporting Web Pages, Chrome/Firefox/Edge extensions, Capacitor/Android WebView, and local dev.
 */
export function resolveAllowedCorsOrigin(origin: string | undefined, env: Env): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const proto = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();

  // Browser Extensions & Native Mobile WebView app schemes
  if (
    proto === 'chrome-extension:' ||
    proto === 'moz-extension:' ||
    proto === 'safari-web-extension:' ||
    proto === 'extension:' ||
    proto === 'capacitor:' ||
    proto === 'ionic:'
  ) {
    return trimmed;
  }

  if (proto !== 'https:' && proto !== 'http:') return null;

  // Local dev & Android WebViewAssetLoader origins
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'appassets.dollarino.local' ||
    host === 'app.dollarino.local'
  ) {
    return trimmed;
  }

  if (proto === 'https:') {
    if (host === 'dollarino.pages.dev' || host.endsWith('.dollarino.pages.dev')) {
      return trimmed;
    }
    const configured = (env.PUBLIC_WEB_URL || '').trim();
    if (configured) {
      try {
        const cfgUrl = new URL(configured);
        if (cfgUrl.origin.toLowerCase() === trimmed.toLowerCase()) {
          return trimmed;
        }
      } catch {
        // ignore invalid configured URL
      }
    }
  }

  return null;
}

export function isValidSqlIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test((name || '').trim());
}

export async function buildClientFingerprints(request: Request, env: Env): Promise<{
  ipHash: string;
  uaHash: string;
}> {
  const salt = env.SESSION_JWT_SECRET || 'dollarino-fp-salt';
  const ip = getClientIp(request);
  const ua = (request.headers.get('User-Agent') || 'unknown').slice(0, 180);
  const [ipHash, uaHash] = await Promise.all([
    sha256Hex(`${salt}:ip:${ip}`),
    sha256Hex(`${salt}:ua:${ua}`),
  ]);
  return {
    ipHash: ipHash.slice(0, 32),
    uaHash: uaHash.slice(0, 32),
  };
}

/**
 * Dual-layer (in-memory + D1) sliding-window rate limiter to protect sensitive routes
 * against brute force, AI credit drain, and referral/payment abuse.
 */
export async function enforceRateLimit(
  env: Env,
  bucketKey: string,
  maxHits: number,
  windowSeconds: number,
  opts?: { bypass?: boolean }
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  if (opts?.bypass) {
    return { allowed: true, remaining: 999_999, retryAfterSec: 0 };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSeconds) * windowSeconds;
  const memKey = `${bucketKey}:${windowStart}`;

  const cached = localBuckets.get(memKey);
  if (cached && cached.hits >= maxHits) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, windowStart + windowSeconds - nowSec),
    };
  }

  try {
    await env.DB.prepare(
      `INSERT INTO rate_limits (k, window_start, hits)
       VALUES (?, ?, 1)
       ON CONFLICT(k) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.hits + 1 ELSE 1 END,
         window_start = excluded.window_start`
    )
      .bind(bucketKey, windowStart)
      .run();

    const row = await env.DB.prepare(`SELECT hits, window_start FROM rate_limits WHERE k = ?`)
      .bind(bucketKey)
      .first<{ hits: number; window_start: number }>();

    const hits = Number(row?.hits ?? 1);
    localBuckets.set(memKey, { windowStart, hits });
    if (localBuckets.size > 2000) {
      for (const [k, v] of localBuckets.entries()) {
        if (v.windowStart < windowStart - windowSeconds) localBuckets.delete(k);
      }
    }

    if (hits > maxHits) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, windowStart + windowSeconds - nowSec),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, maxHits - hits),
      retryAfterSec: 0,
    };
  } catch {
    // Fallback to memory-only counting if table is not yet migrated
    const nextHits = (cached?.hits ?? 0) + 1;
    localBuckets.set(memKey, { windowStart, hits: nextHits });
    return {
      allowed: nextHits <= maxHits,
      remaining: Math.max(0, maxHits - nextHits),
      retryAfterSec: nextHits <= maxHits ? 0 : Math.max(1, windowStart + windowSeconds - nowSec),
    };
  }
}

export function maskUsernameForReferral(name: string): string {
  const clean = (name || 'user').trim();
  if (clean.length <= 2) return `${clean[0] || '*'}*`;
  if (clean.length <= 5) return `${clean.slice(0, 2)}***`;
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}
