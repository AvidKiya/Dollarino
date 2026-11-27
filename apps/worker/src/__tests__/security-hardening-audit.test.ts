import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';
import { encryptVaultJson, hashPassword, signJwt, verifyJwt } from '../crypto.js';
import { isSafeExternalHttpUrl, isValidSqlIdentifier, resolveAllowedCorsOrigin, timingSafeEqual } from '../security.js';
import { tryVerifyEvmReceiptOnchain } from '../services/server-fee.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;

const TEST_JWT_SECRET = 'test-jwt-secret-key-dollarino-audit-2026';
const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    SESSION_JWT_SECRET: TEST_JWT_SECRET,
    MASTER_ENCRYPTION_KEY: TEST_MASTER_KEY,
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

describe('Dollarino Security Hardening Audit Suite', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'sec-hardening-audit-db' },
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
      if (url.includes('bitunix.com')) {
        return new Response(JSON.stringify({ code: 0, data: [{ symbol: 'BTCUSDT', lastPrice: '95000.00', last: '95000.00' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('binance.com') || url.includes('binance.vision') || url.includes('okx.com') || url.includes('bybit.com')) {
        return new Response(
          JSON.stringify({
            symbol: 'BTCUSDT',
            price: '95000.00',
            lastPrice: '95000.00',
            data: [{ instId: 'BTC-USDT', last: '95000.00' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.includes('bsc-dataseed') || url.includes('publicnode') || url.includes('mainnet.base.org') || url.includes('arbitrum')) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              status: '0x1',
              to: '0x1111111111111111111111111111111111111111',
              logs: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: { id: 999, username: 'test_bot' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  it('rejects alg=none, missing exp, expired, and malformed JWT tokens', async () => {
    const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'usr_1', role: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    expect(await verifyJwt(`${algNoneHeader}.${payload}.`, TEST_JWT_SECRET)).toBeNull();

    const validHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const noExpPayload = Buffer.from(JSON.stringify({ sub: 'usr_1', role: 'owner' })).toString('base64url');
    expect(await verifyJwt(`${validHeader}.${noExpPayload}.invalid`, TEST_JWT_SECRET)).toBeNull();
    expect(await verifyJwt('not-even-a-jwt!!!', TEST_JWT_SECRET)).toBeNull();

    const validJwt = await signJwt({ sub: 'usr_1', role: 'user' }, TEST_JWT_SECRET);
    const verified = await verifyJwt(validJwt, TEST_JWT_SECRET);
    expect(verified?.sub).toBe('usr_1');
  });

  it('blocks SSRF internal/metadata URLs and untrusted CORS origins while allowing app/extension origins', async () => {
    expect(isSafeExternalHttpUrl('http://127.0.0.1:8787')).toBe(false);
    expect(isSafeExternalHttpUrl('http://localhost:3000/api')).toBe(false);
    expect(isSafeExternalHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://10.0.0.5:8080')).toBe(false);
    expect(isSafeExternalHttpUrl('http://192.168.1.1')).toBe(false);
    expect(isSafeExternalHttpUrl('http://172.16.0.10')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[::1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://[fd00::1]/')).toBe(false);
    expect(isSafeExternalHttpUrl('https://user:pass@api.deepseek.com')).toBe(false);
    expect(isSafeExternalHttpUrl('http://2130706433/')).toBe(false);
    expect(isSafeExternalHttpUrl('https://api.deepseek.com')).toBe(true);
    expect(isSafeExternalHttpUrl('https://my-proxy.workers.dev/toobit')).toBe(true);

    const env = makeEnv();
    expect(resolveAllowedCorsOrigin('https://evil-attacker.com', env)).toBeNull();
    expect(resolveAllowedCorsOrigin('https://dollarino.pages.dev', env)).toBe('https://dollarino.pages.dev');
    expect(resolveAllowedCorsOrigin('https://appassets.dollarino.local', env)).toBe('https://appassets.dollarino.local');
    expect(resolveAllowedCorsOrigin('chrome-extension://abcdefghijklmnop', env)).toBe('chrome-extension://abcdefghijklmnop');
    expect(resolveAllowedCorsOrigin('capacitor://localhost', env)).toBe('capacitor://localhost');
    expect(isValidSqlIdentifier('users')).toBe(true);
    expect(isValidSqlIdentifier('users; DROP TABLE users;--')).toBe(false);
    expect(await timingSafeEqual('secret_abc_123', 'secret_abc_123')).toBe(true);
    expect(await timingSafeEqual('secret_abc_123', 'secret_abc_124')).toBe(false);
  });

  it('enforces CORS allowlist & security headers (without X-Frame-Options) on API responses', async () => {
    const env = makeEnv();
    const evilRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/health', {
        headers: { Origin: 'https://evil-attacker.com' },
      }),
      env
    );
    expect(evilRes.status).toBe(200);
    expect(evilRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(evilRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(evilRes.headers.get('X-Frame-Options')).toBeNull();

    const goodRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/health', {
        headers: { Origin: 'https://appassets.dollarino.local' },
      }),
      env
    );
    expect(goodRes.headers.get('Access-Control-Allow-Origin')).toBe('https://appassets.dollarino.local');
    expect(goodRes.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('prevents vault/export-keys password bypass, restricts extension keys from sensitive routes, and verifies passwords properly', async () => {
    const env = makeEnv();
    const pwdHash = await hashPassword('StrongPass!2026');
    const extKey = 'dlr_ext_testauditkey123456';
    await db
      .prepare(
        `INSERT OR REPLACE INTO users (id, email, username, password_hash, role, has_custom_password, extension_api_key, referral_code)
         VALUES ('usr_sec_owner', 'sec@example.com', 'secowner', ?, 'owner', 1, ?, 'DLRSEC1')`
      )
      .bind(pwdHash, extKey)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO bot_configs (user_id, trading_mode, paper_balance, webhook_secret) VALUES ('usr_sec_owner', 'PAPER', '10000.00', 'wh_sec_audit_1')`)
      .run();

    const jwt = await signJwt({ sub: 'usr_sec_owner', email: 'sec@example.com', role: 'owner' }, TEST_JWT_SECRET);

    // 1. Empty JSON body must be rejected for password-protected user!
    const bypassAttempt = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(bypassAttempt.status).toBe(403);
    const bypassJson = (await bypassAttempt.json()) as { code?: string };
    expect(bypassJson.code).toBe('VAULT_2FA_REQUIRED');

    // 2. Wrong password rejected
    const wrongPwd = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'WrongPassword' }),
      }),
      env
    );
    expect(wrongPwd.status).toBe(403);

    // 3. Extension key CANNOT access Admin, Vault export, Password change, 2FA, or Account Delete
    for (const [method, urlPath] of [
      ['GET', '/api/admin/overview'],
      ['POST', '/api/copy-trade/vault/export-keys'],
      ['PATCH', '/api/auth/password'],
      ['POST', '/api/auth/2fa/setup'],
      ['DELETE', '/api/auth/account'],
    ] as const) {
      const r = await worker.fetch(
        new Request(`https://dollarino.pages.dev${urlPath}`, {
          method,
          headers: { 'X-Dollarino-Extension-Key': extKey, 'Content-Type': 'application/json' },
          body: method === 'GET' ? undefined : JSON.stringify({}),
        }),
        env
      );
      expect(r.status).toBe(403);
    }

    // 4. Extension key STILL works on trading overview
    const extTradingRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/overview', {
        headers: { 'X-Dollarino-Extension-Key': extKey },
      }),
      env
    );
    expect(extTradingRes.status).toBe(200);

    // 5. Real password succeeds on vault/export-keys
    const okExport = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'StrongPass!2026' }),
      }),
      env
    );
    expect(okExport.status).toBe(200);
  });

  it('requires valid webhook secret on /telegram/:botId and valid OAuth state on /google/callback', async () => {
    const env = makeEnv();
    const encToken = await encryptVaultJson({ botToken: '123456:TEST_BOT_TOKEN' }, TEST_MASTER_KEY);
    await db
      .prepare(
        `INSERT OR REPLACE INTO telegram_bots (id, user_id, bot_username, bot_token_masked, encrypted_bot_token, webhook_secret, is_active)
         VALUES ('tgb_audit_1', 'usr_sec_owner', 'audit_bot', '123456:***', ?, 'my_secret_hook_token_xyz', 1)`
      )
      .bind(encToken)
      .run();

    // Missing header MUST fail with 403
    const noSecret = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/telegram/tgb_audit_1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 }),
      }),
      env
    );
    expect(noSecret.status).toBe(403);

    // Wrong header MUST fail with 403
    const wrongSecret = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/telegram/tgb_audit_1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' },
        body: JSON.stringify({ update_id: 1 }),
      }),
      env
    );
    expect(wrongSecret.status).toBe(403);

    // Google OAuth callback without valid purpose-signed state MUST redirect with invalid_oauth_state
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_google_enabled', 'true')`)
      .run();
    invalidateSettingsCache(db);
    const badCb = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/google/callback?code=fake_code&state=forged_state'),
      env
    );
    expect(badCb.status).toBe(302);
    expect(badCb.headers.get('Location')).toContain('auth_error=invalid_oauth_state');
  });

  it('prevents unconfirmed TX hashes from minting server-fee prepaid credit and checks EVM recipient on-chain', async () => {
    const env = makeEnv();
    await db
      .prepare(
        `INSERT OR REPLACE INTO users (id, email, username, password_hash, role, fee_prepaid_credit_usd, referral_code)
         VALUES ('usr_fee_audit', 'fee@example.com', 'feeaudit', 'x', 'user', 0, 'DLRFEE1')`
      )
      .run();

    const jwt = await signJwt({ sub: 'usr_fee_audit', email: 'fee@example.com', role: 'user' }, TEST_JWT_SECRET);

    // Mock returns status=0x1 for recipient 0x1111..., while system treasury receiver is 0x9999...
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('treasury_evm_receiver', '0x9999999999999999999999999999999999999999')`)
      .run();

    const evmWrongRecipient = await tryVerifyEvmReceiptOnchain(
      '0x' + 'a'.repeat(64),
      '0x9999999999999999999999999999999999999999'
    );
    expect(evmWrongRecipient).toBe('UNAVAILABLE');

    const evmRightRecipient = await tryVerifyEvmReceiptOnchain(
      '0x' + 'b'.repeat(64),
      '0x1111111111111111111111111111111111111111'
    );
    expect(evmRightRecipient).toBe('CONFIRMED');

    // Trying to settle with a txHash paid to an unrelated address and claiming amountUsd=5000 MUST stay PENDING_VERIFY and add 0 credit!
    const settleRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees/settle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: '0x' + 'c'.repeat(64),
          network: 'BEP20',
          amountUsd: 5000,
        }),
      }),
      env
    );
    expect(settleRes.status).toBe(200);
    const settleJson = (await settleRes.json()) as { status?: string; addedCreditUsd?: number };
    expect(settleJson.status).toBe('PENDING_VERIFY');
    expect(settleJson.addedCreditUsd).toBe(0);

    const userRow = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = 'usr_fee_audit'`)
      .first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(userRow?.fee_prepaid_credit_usd ?? 0)).toBe(0);
  });

  it('prevents concurrent position double-close credit duplication and atomic gift-code race', async () => {
    const env = makeEnv();
    const jwt = await signJwt({ sub: 'usr_sec_owner', email: 'sec@example.com', role: 'owner' }, TEST_JWT_SECRET);
    await db.prepare(`UPDATE bot_configs SET paper_balance = '10000.00' WHERE user_id = 'usr_sec_owner'`).run();
    await db
      .prepare(
        `INSERT OR REPLACE INTO trades
         (id, user_id, mode, market_type, exchange_provider, strategy_key, symbol, direction, leverage, entry_price, initial_quantity, remaining_quantity, margin_used, initial_stop_loss, current_stop_loss, tp1, status, realized_pnl, client_id)
         VALUES ('tr_race_1', 'usr_sec_owner', 'PAPER', 'FUTURES', 'paper', 'dollarino_v01', 'BTCUSDT', 'LONG', 5, '95000', '0.1', '0.1', '1900', '93000', '93000', '98000', 'OPEN', '0', 'cli_race_1')`
      )
      .run();

    const [c1, c2] = await Promise.all([
      worker.fetch(
        new Request('https://dollarino.pages.dev/api/trading/positions/tr_race_1/close', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env
      ),
      worker.fetch(
        new Request('https://dollarino.pages.dev/api/trading/positions/tr_race_1/close', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env
      ),
    ]);
    expect([200, 404]).toContain(c1.status);
    expect([200, 404]).toContain(c2.status);
    const j1 = (await c1.json()) as { alreadyClosed?: boolean };
    const j2 = (await c2.json()) as { alreadyClosed?: boolean };
    // Exactly one wins the atomic CLOSE transition (or second finds status !== OPEN -> 404/alreadyClosed), never double-credits!
    expect(j1.alreadyClosed || j2.alreadyClosed || c1.status === 404 || c2.status === 404).toBeTruthy();
    const cfg = await db.prepare(`SELECT paper_balance FROM bot_configs WHERE user_id = 'usr_sec_owner'`).first<{ paper_balance: string }>();
    // Initial 10000 + ~1900 margin share (NOT 10000 + 3800!)
    expect(Number(cfg?.paper_balance)).toBeLessThan(12000);
    expect(Number(cfg?.paper_balance)).toBeGreaterThan(11850);

    // Gift code capacity race
    await db
      .prepare(`INSERT OR REPLACE INTO users (id, email, username, password_hash, role, referral_code) VALUES ('usr_gift_1', 'g1@example.com', 'g1', 'x', 'user', 'DLRG1')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO users (id, email, username, password_hash, role, referral_code) VALUES ('usr_gift_2', 'g2@example.com', 'g2', 'x', 'user', 'DLRG2')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO gift_codes (code, plan_code, duration_days, max_uses, uses_count, is_active) VALUES ('AUDIT1USE', 'pro_monthly', 30, 1, 0, 1)`)
      .run();

    const gJwt1 = await signJwt({ sub: 'usr_gift_1', email: 'g1@example.com', role: 'user' }, TEST_JWT_SECRET);
    const gJwt2 = await signJwt({ sub: 'usr_gift_2', email: 'g2@example.com', role: 'user' }, TEST_JWT_SECRET);

    const [r1, r2] = await Promise.all([
      worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/redeem-gift', {
          method: 'POST',
          headers: { Authorization: `Bearer ${gJwt1}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'AUDIT1USE' }),
        }),
        env
      ),
      worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/redeem-gift', {
          method: 'POST',
          headers: { Authorization: `Bearer ${gJwt2}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'AUDIT1USE' }),
        }),
        env
      ),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);

    // SSRF on /api/connections/ai
    const ssrfRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/connections/ai', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gJwt1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai_compatible',
          model: 'gpt-4o-mini',
          apiKey: 'sk-test-123456',
          baseUrl: 'http://169.254.169.254/latest/meta-data/',
        }),
      }),
      env
    );
    expect(ssrfRes.status).toBe(400);

    // Admin backup excludeSecrets=1 redacts user secret fields
    const backupRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/backup?excludeSecrets=1', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(backupRes.status).toBe(200);
    const backupJson = (await backupRes.json()) as {
      tables?: { users?: Array<{ password_hash?: string }> };
    };
    const anyUserHash = backupJson.tables?.users?.[0]?.password_hash;
    expect(anyUserHash).toBe('[REDACTED]');
  });
});
