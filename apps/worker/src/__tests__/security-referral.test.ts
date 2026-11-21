import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-96',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
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

describe('Dollarino v9.6 Security, Rate-Limiting, Anti-Fraud Referral & DEX Fallbacks', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'sec-ref-test-db' },
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
      if (url.includes('api.dexscreener.com')) {
        // Simulate upstream 503 outage to verify GeckoTerminal fallback automatically triggers
        return new Response('Service Unavailable', { status: 503 });
      }
      if (url.includes('api.geckoterminal.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'bsc_0xaaaa',
                type: 'pool',
                attributes: {
                  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  name: 'PEPE / WBNB',
                  base_token_price_usd: '0.0000142',
                  reserve_in_usd: '450000',
                  volume_usd: { h24: '920000' },
                  price_change_percentage: { h24: '14.2', h1: '2.1', m5: '0.4' },
                  transactions: { m5: { buys: 19, sells: 7 } },
                },
                relationships: {
                  base_token: { data: { id: 'bsc_0x1234' } },
                  quote_token: { data: { id: 'bsc_0xwbnb' } },
                  network: { data: { id: 'bsc' } },
                  dex: { data: { id: 'pancakeswap-v3' } },
                },
              },
            ],
            included: [
              {
                id: 'bsc_0x1234',
                type: 'token',
                attributes: {
                  address: '0x1234567890abcdef1234567890abcdef12345678',
                  name: 'PepeBSC',
                  symbol: 'PEPE',
                  image_url: 'https://assets.geckoterminal.com/pepe.png',
                },
              },
              {
                id: 'bsc_0xwbnb',
                type: 'token',
                attributes: { address: '0xwbnb', name: 'Wrapped BNB', symbol: 'WBNB' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return realFetch(input, init);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM rate_limits; DELETE FROM referral_withdrawals; DELETE FROM referrals; DELETE FROM user_subscriptions; DELETE FROM gift_redemptions; DELETE FROM gift_codes; DELETE FROM users; INSERT OR REPLACE INTO system_settings (key, value) VALUES ('telegram_only_signup', 'true');");
  });

  it('blocks direct web email signup by default, verifies Telegram Login Widget, and lets user edit profile while locking verified phone', async () => {
    const env = makeEnv();

    // 1. Direct email registration is blocked by default (403 TELEGRAM_SIGNUP_REQUIRED)
    const blockedReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fake@gmail.com', username: 'FakeUser', password: 'password123' }),
      }),
      env
    );
    expect(blockedReg.status).toBe(403);
    const blockedJson = (await blockedReg.json()) as { code: string; botUrl: string };
    expect(blockedJson.code).toBe('TELEGRAM_SIGNUP_REQUIRED');
    expect(blockedJson.botUrl).toContain('t.me/Dollarino_bot');

    // 2. Provision a Telegram-registered & phone-verified user + issue magic login
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
       VALUES ('usr_tg_prof_1', 'tg_555001@telegram.dollarino.local', 'RezaQuant', 'x', 'user', '555001', 'reza_q', '+989121112233', 1, 'tglm_test_prof_1', datetime('now', '+10 minutes'), 0)`
    ).run();

    const magicRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'tglm_test_prof_1' }),
      }),
      env
    );
    expect(magicRes.status).toBe(200);
    const magicJson = (await magicRes.json()) as { token: string; user: { id: string } };
    expect(magicJson.user.id).toBe('usr_tg_prof_1');

    // 3. Attempting to alter phone_number via PATCH /api/auth/profile must be rejected with 403
    const phoneTamperRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({ phoneNumber: '+989999999999' }),
      }),
      env
    );
    expect(phoneTamperRes.status).toBe(403);

    // 4. Editing username, real email, displayBio & setting first password succeeds
    const editRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({
          username: 'RezaUpdated',
          email: 'reza.real@example.com',
          displayBio: 'Futures & Gold trader',
          newPassword: 'StrongPassword99',
        }),
      }),
      env
    );
    expect(editRes.status).toBe(200);
    const editJson = (await editRes.json()) as {
      ok: boolean;
      user: { username: string; email: string; display_bio: string; phone_number: string; has_custom_password: number };
    };
    expect(editJson.ok).toBe(true);
    expect(editJson.user.username).toBe('RezaUpdated');
    expect(editJson.user.email).toBe('reza.real@example.com');
    expect(editJson.user.display_bio).toBe('Futures & Gold trader');
    expect(editJson.user.phone_number).toBe('+989121112233');
    expect(editJson.user.has_custom_password).toBe(1);

    // 5. User can now sign in with the real email & custom password they set
    const loginRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reza.real@example.com', password: 'StrongPassword99' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
  });

  it('serves v9.7.0 health with security headers and falls back cleanly to GeckoTerminal when DexScreener fails', async () => {
    const env = makeEnv();
    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const health = (await healthRes.json()) as { version: string; capabilities: Record<string, boolean> };
    expect(health.version).toBe('9.7.0');
    expect(health.capabilities.antiAbuseReferralSystem).toBe(true);
    expect(health.capabilities.telegramFirstRegistration).toBe(true);

    const dexRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/dex/trending'), env);
    expect(dexRes.status).toBe(200);
    const dex = (await dexRes.json()) as { trending: Array<{ baseToken: { symbol: string } }>; pairs: unknown[] };
    expect(dex.trending.length).toBeGreaterThan(0);
    expect(dex.pairs.length).toBe(dex.trending.length);
    expect(dex.trending[0]!.baseToken.symbol).toBe('PEPE');
  });

  it('prevents self-referral IP farming, blocks $0 gift commission unlock, and processes legitimate tiered payout + refund', async () => {
    const env = makeEnv();
    // Temporarily disable telegram_only_signup inside this anti-fraud unit test to exercise IP/UA duplicate registration checks directly
    await db.exec(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('telegram_only_signup', 'false');`);

    // 1. Register Referrer (first user becomes owner/admin automatically)
    const reg1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'User-Agent': 'Mozilla/5.0 ReferrerBrowser',
        },
        body: JSON.stringify({ email: 'alice@dollarino.test', username: 'AliceQuant', password: 'password123' }),
      }),
      env
    );
    expect(reg1.status).toBe(201);
    const u1 = (await reg1.json()) as { token: string; user: { id: string } };
    const refCode = `DLR-${u1.user.id.slice(-6).toUpperCase()}`;

    // 2. Register Duplicate Abuser from SAME IP + SAME User-Agent
    const regAbuse = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'User-Agent': 'Mozilla/5.0 ReferrerBrowser',
        },
        body: JSON.stringify({
          email: 'alt@dollarino.test',
          username: 'AltAccount',
          password: 'password123',
          referralCode: refCode,
        }),
      }),
      env
    );
    expect(regAbuse.status).toBe(201);
    const uAbuse = (await regAbuse.json()) as { token: string; user: { id: string } };

    const flaggedRow = await db
      .prepare('SELECT status, fraud_flag FROM referrals WHERE referred_user_id = ?')
      .bind(uAbuse.user.id)
      .first<{ status: string; fraud_flag: number }>();
    expect(flaggedRow?.status).toBe('FLAGGED_DUPLICATE');
    expect(flaggedRow?.fraud_flag).toBe(1);

    // 3. Register Legitimate Friend from a DIFFERENT IP + UA
    const regFriend = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.42',
          'User-Agent': 'Mozilla/5.0 FriendPhone',
        },
        body: JSON.stringify({
          email: 'bob@dollarino.test',
          username: 'BobTrader',
          password: 'password123',
          referralCode: refCode,
        }),
      }),
      env
    );
    expect(regFriend.status).toBe(201);
    const uFriend = (await regFriend.json()) as { token: string; user: { id: string } };

    // 4. Friend redeems a $0 gift code -> must NOT credit referral USD balance!
    await db
      .prepare(`INSERT INTO gift_codes (code, plan_code, duration_days, max_uses, is_active) VALUES ('FREE30', 'pro_monthly', 30, 5, 1)`)
      .run();
    const giftRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/redeem-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uFriend.token}` },
        body: JSON.stringify({ code: 'FREE30' }),
      }),
      env
    );
    expect(giftRes.status).toBe(200);

    const refStatsPre = (await (
      await worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/referrals', {
          headers: { Authorization: `Bearer ${u1.token}` },
        }),
        env
      )
    ).json()) as { balanceUsd: number; referrals: Array<{ username: string }> };
    expect(refStatsPre.balanceUsd).toBe(0);
    // Username privacy masking
    expect(refStatsPre.referrals.some((r) => r.username.includes('***'))).toBe(true);

    // 5. Friend submits a paid $100 plan order and Admin approves it -> unlocks 15% ($15.00) + 7 Pro days
    const chkRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uFriend.token}` },
        body: JSON.stringify({
          planCode: 'pro_semiannual',
          paymentMethod: 'CARD_TO_CARD',
          paymentReference: 'REF-BANK-99887766',
        }),
      }),
      env
    );
    expect(chkRes.status).toBe(201);
    const chkJson = (await chkRes.json()) as { orderId: string };

    const reviewRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/subscriptions/admin/orders/${chkJson.orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ decision: 'APPROVE', adminNote: 'Paid verified' }),
      }),
      env
    );
    expect(reviewRes.status).toBe(200);

    const refStatsPost = (await (
      await worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/referrals', {
          headers: { Authorization: `Bearer ${u1.token}` },
        }),
        env
      )
    ).json()) as { balanceUsd: number; qualifiedReferred: number; rewardDaysEarned: number };
    expect(refStatsPost.balanceUsd).toBeGreaterThan(10);
    expect(refStatsPost.qualifiedReferred).toBe(1);
    expect(refStatsPost.rewardDaysEarned).toBe(7);

    // 6. Attempt USDT payout WITHOUT phone KYC -> must fail with 403
    const wdNoKyc = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({
          amountUsd: 10,
          network: 'BEP20',
          walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        }),
      }),
      env
    );
    expect(wdNoKyc.status).toBe(403);

    // 7. Verify phone KYC -> withdraw $10 -> Admin rejects -> $10 refunded cleanly
    await db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').bind(u1.user.id).run();
    const wdOk = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({
          amountUsd: 10,
          network: 'BEP20',
          walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        }),
      }),
      env
    );
    expect(wdOk.status).toBe(201);
    const { withdrawalId } = (await wdOk.json()) as { withdrawalId: string };

    const adminRef = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/referrals', {
        headers: { Authorization: `Bearer ${u1.token}` },
      }),
      env
    );
    expect(adminRef.status).toBe(200);

    const rejectRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/referrals/withdrawals/${withdrawalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ decision: 'REJECT', adminNote: 'Test refund' }),
      }),
      env
    );
    expect(rejectRes.status).toBe(200);

    const balAfterRefund = await db
      .prepare('SELECT referral_balance_usd FROM users WHERE id = ?')
      .bind(u1.user.id)
      .first<{ referral_balance_usd: number }>();
    expect(balAfterRefund?.referral_balance_usd).toBe(refStatsPost.balanceUsd);

    // 8. Extension key generation & authentication works end-to-end
    const extGen = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/extension-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ rotate: false }),
      }),
      env
    );
    expect(extGen.status).toBe(200);
    const { extensionApiKey } = (await extGen.json()) as { extensionApiKey: string };
    expect(extensionApiKey.startsWith('dlr_ext_')).toBe(true);

    const extSess = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/session', {
        headers: { 'X-Dollarino-Extension-Key': extensionApiKey },
      }),
      env
    );
    expect(extSess.status).toBe(200);
    const extSessJson = (await extSess.json()) as { authenticated: boolean; user: { id: string } | null };
    expect(extSessJson.authenticated).toBe(true);
    expect(extSessJson.user?.id).toBe(u1.user.id);

    const extOv = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/overview', {
        headers: { 'X-Dollarino-Extension-Key': extensionApiKey },
      }),
      env
    );
    expect(extOv.status).toBe(200);
    const extOvJson = (await extOv.json()) as { balance: { total: string }; openTrades: unknown[] };
    expect(extOvJson.balance).toBeTruthy();
    expect(Array.isArray(extOvJson.openTrades)).toBe(true);
  });
});
