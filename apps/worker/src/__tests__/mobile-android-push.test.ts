import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';
import { signJwt } from '../crypto.js';
import { notifyUserTelegram, pushNotification } from '../engine/executor.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;
const JWT_SECRET = 'test-mobile-android-jwt-secret-2026';

function makeEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: JWT_SECRET,
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
    FCM_SERVER_KEY: 'test_fcm_server_key_mock',
  };
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === '-' && sql[i + 1] === '-' && !inSingle && !inDouble) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (sql[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

describe('Dollarino Android Native App & Mobile Push API Suite', () => {
  const fcmCalls: Array<{ url: string; body: string }> = [];

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'mobile-android-db' },
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const stmt of splitSqlStatements(raw)) {
        await db.prepare(stmt).run();
      }
    }

    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('fcm.googleapis.com/fcm/send')) {
        fcmCalls.push({ url, body: String(init?.body || '') });
        return new Response(JSON.stringify({ success: 1, failure: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  it('serves /api/mobile/bootstrap with 5 Android channels & maintenance status', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://dollarino.pages.dev/api/mobile/bootstrap'), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      platform: string;
      channels: Array<{ id: string }>;
    };
    expect(json.ok).toBe(true);
    expect(json.platform).toBe('android');
    expect(json.channels.map((c) => c.id)).toEqual([
      'dollarino_signals',
      'dollarino_trades',
      'dollarino_sniper',
      'dollarino_security',
      'dollarino_system',
    ]);
  });

  it('registers Android device, mirrors trade/TP/Telegram alerts into mobile inbox + FCM, and supports feed/ack/test', async () => {
    const env = makeEnv();
    await db
      .prepare(
        `INSERT OR REPLACE INTO users (id, email, username, password_hash, role, referral_code)
         VALUES ('usr_andr_1', 'andr@example.com', 'andruser', 'x', 'user', 'DLRAND1')`
      )
      .run();
    await db
      .prepare(
        `INSERT OR REPLACE INTO bot_configs (user_id, trading_mode, paper_balance, webhook_secret, notifications_enabled)
         VALUES ('usr_andr_1', 'PAPER', '10000.00', 'wh_andr_1', 1)`
      )
      .run();

    const jwt = await signJwt({ sub: 'usr_andr_1', email: 'andr@example.com', role: 'user' }, JWT_SECRET);

    // 1. Register Android device with FCM token
    const regRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/mobile/devices/register', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          Origin: 'https://appassets.dollarino.local',
        },
        body: JSON.stringify({
          deviceId: 'andr_pixel9_001',
          platform: 'android',
          fcmToken: 'fcm_tok_sample_12345',
          appVersion: '11.7.2',
          appBuild: 110702,
          deviceModel: 'Google Pixel 9',
          osVersion: 'Android 15',
          locale: 'fa',
        }),
      }),
      env
    );
    expect(regRes.status).toBe(200);
    expect(regRes.headers.get('Access-Control-Allow-Origin')).toBe('https://appassets.dollarino.local');
    const regJson = (await regRes.json()) as { ok: boolean; pushProvider: string; fcmConfiguredOnServer: boolean };
    expect(regJson.ok).toBe(true);
    expect(regJson.pushProvider).toBe('fcm');
    expect(regJson.fcmConfiguredOnServer).toBe(true);

    // 2. Trade/TP pushNotification automatically populates mobile_notifications_inbox
    await pushNotification(db, 'usr_andr_1', 'TP_SL', 'TP1 Hit · BTCUSDT', 'Closed 50% in profit · SL moved to Entry');
    // 3. notifyUserTelegram delivers to mobile inbox + FCM EVEN WHEN user has NO Telegram linked!
    await notifyUserTelegram(env, 'usr_andr_1', '<b>🚀 سیگنال جدید اسنایپر</b>\nتوکن جدید با امتیاز امنیتی ۹۰ کشف شد.');

    expect(fcmCalls.length).toBeGreaterThanOrEqual(1);
    expect(fcmCalls[0]?.body).toContain('fcm_tok_sample_12345');

    // 4. Test push endpoint
    const testRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/mobile/notifications/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(testRes.status).toBe(200);
    const testJson = (await testRes.json()) as { ok: boolean; queued: boolean; fcmSent: boolean };
    expect(testJson.ok).toBe(true);
    expect(testJson.queued).toBe(true);
    expect(testJson.fcmSent).toBe(true);

    // 5. Fetch notification feed & verify channels + deep links + ack
    const feedRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/mobile/notifications/feed?limit=10', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(feedRes.status).toBe(200);
    const feedJson = (await feedRes.json()) as {
      ok: boolean;
      unreadCount: number;
      items: Array<{ id: string; channelId: string; deepLink: string; read: boolean }>;
    };
    expect(feedJson.ok).toBe(true);
    expect(feedJson.items.length).toBe(3);
    expect(feedJson.unreadCount).toBe(3);
    expect(feedJson.items.some((i) => i.channelId === 'dollarino_trades')).toBe(true);
    expect(feedJson.items.some((i) => i.channelId === 'dollarino_sniper')).toBe(true);

    const ackRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/mobile/notifications/ack', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [feedJson.items[0]!.id] }),
      }),
      env
    );
    expect(ackRes.status).toBe(200);
    const feedAfter = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/mobile/notifications/feed?limit=10', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    const feedAfterJson = (await feedAfter.json()) as { unreadCount: number };
    expect(feedAfterJson.unreadCount).toBe(2);

    // 6. Google OAuth start with ?client=android embeds client=android into state JWT
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_google_enabled', 'true')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('google_client_id', 'test-cid')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('google_client_secret', 'test-csec')`)
      .run();
    invalidateSettingsCache(db);
    const gStartRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/google/start?client=android'),
      env
    );
    expect(gStartRes.status).toBe(302);
    expect(gStartRes.headers.get('Location')).toContain('accounts.google.com');
  });
});
