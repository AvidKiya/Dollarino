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
const telegramCalls: Array<{ url: string; body: string }> = [];

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-wave4',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:TEST_BOT_TOKEN',
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

async function issueUserToken(
  env: Env,
  opts: { id: string; role: 'OWNER' | 'user'; telegramId: string; username: string }
): Promise<string> {
  const magic = `tglm_${opts.id}_${Date.now()}`;
  const existing = await db
    .prepare(`SELECT id FROM users WHERE telegram_id = ? LIMIT 1`)
    .bind(opts.telegramId)
    .first<{ id: string }>();

  let targetUserId = opts.id;
  if (existing) {
    targetUserId = existing.id;
    await db
      .prepare(
        `UPDATE users SET role = ?, web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`
      )
      .bind(opts.role, magic, targetUserId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001122', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(opts.id, `${opts.id}@dollarino.local`, opts.username, opts.role, opts.telegramId, magic)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO bot_configs (user_id, webhook_secret, last_ai_reason, last_ai_decision_at)
       VALUES (?, ?, 'BTCUSDT در تایم ۱۵ دقیقه با RSI سالم و روند صعودی EMA تایید شد.', datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         last_ai_reason = excluded.last_ai_reason,
         last_ai_decision_at = excluded.last_ai_decision_at`
    )
    .bind(targetUserId, `wh_${targetUserId}`)
    .run();

  const res = await worker.fetch(
    new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magic }),
    }),
    env
  );
  const json = (await res.json()) as { token: string };
  return json.token;
}

describe('Dollarino Wave 1-4 Completion: Banners, Admin Health, Perp DEX, AI Converter & Vault Security', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'wave4-polish-db' },
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

      if (url.includes('api.hyperliquid.xyz/info')) {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        if (bodyStr.includes('metaAndAssetCtxs')) {
          return new Response(
            JSON.stringify([
              {
                universe: [
                  { name: 'BTC', maxLeverage: 50 },
                  { name: 'SOL', maxLeverage: 20 },
                ],
              },
              [
                { markPx: '61500.5', funding: '0.0001', openInterest: '12000', dayNtlVlm: '3500000000' },
                { markPx: '142.25', funding: '0.00015', openInterest: '800000', dayNtlVlm: '900000000' },
              ],
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (bodyStr.includes('clearinghouseState')) {
          return new Response(
            JSON.stringify({
              marginSummary: { accountValue: '2500.75' },
              withdrawable: '2050.25',
              assetPositions: [
                {
                  position: {
                    coin: 'BTC',
                    szi: '0.05',
                    entryPx: '60100.0',
                    unrealizedPnl: '70.02',
                    leverage: { value: 10 },
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (url.includes('api.telegram.org')) {
        telegramCalls.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return realFetch(input, init);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  beforeEach(() => {
    telegramCalls.length = 0;
  });

  it('serves animated promo banners publicly and supports full Admin banner CRUD & placement filtering', async () => {
    const env = makeEnv();
    const adminToken = await issueUserToken(env, {
      id: 'usr_owner_w4',
      role: 'OWNER',
      telegramId: '944021185',
      username: 'AvidOwner',
    });

    // Public seeded banners exist with valid NavTab cta_target ('myai', 'copy', 'dex')
    const pub1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/public/banners?placement=LANDING'),
      env
    );
    expect(pub1.status).toBe(200);
    const pubJson = (await pub1.json()) as {
      banners: Array<{ id: string; cta_target: string; placement: string }>;
    };
    expect(pubJson.banners.length).toBeGreaterThanOrEqual(3);
    expect(pubJson.banners.find((b) => b.id === 'banner_ai_vision')?.cta_target).toBe('myai');

    // Admin adds a dashboard-only promo banner
    const addRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/banners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          badge_fa: 'مسابقه',
          title_fa: 'بنر اختصاصی داشبورد',
          subtitle_fa: 'پاداش ویژه کپی‌ترید V2',
          cta_label_fa: 'ورود به کپی‌ترید',
          cta_target: 'copy',
          placement: 'DASHBOARD',
          accent_theme: 'emerald',
          sort_order: 10,
        }),
      }),
      env
    );
    expect(addRes.status).toBe(200);
    const addJson = (await addRes.json()) as { banners: Array<{ id: string; title_fa: string; placement: string }> };
    const created = addJson.banners.find((b) => b.title_fa === 'بنر اختصاصی داشبورد');
    expect(created).toBeTruthy();

    // Dashboard sees it, Landing filters it out
    const dashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/public/banners?placement=DASHBOARD'),
      env
    );
    const dashJson = (await dashRes.json()) as { banners: Array<{ id: string }> };
    expect(dashJson.banners.some((b) => b.id === created!.id)).toBe(true);

    const landRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/public/banners?placement=LANDING'),
      env
    );
    const landJson = (await landRes.json()) as { banners: Array<{ id: string }> };
    expect(landJson.banners.some((b) => b.id === created!.id)).toBe(false);

    // Disable & delete
    const patchRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/banners/${created!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ is_active: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    const delRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/banners/${created!.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env
    );
    expect(delRes.status).toBe(200);
  });

  it('reports system health metrics and prunes D1 audit_logs older than 5 days', async () => {
    const env = makeEnv();
    const adminToken = await issueUserToken(env, {
      id: 'usr_owner_health',
      role: 'OWNER',
      telegramId: '944021185',
      username: 'AvidOwnerHealth',
    });

    await db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, category, level, message, created_at)
         VALUES ('aud_old_1', 'usr_owner_health', 'SYSTEM', 'INFO', 'Stale 10-day log', datetime('now', '-10 days')),
                ('aud_fresh_1', 'usr_owner_health', 'SYSTEM', 'INFO', 'Fresh log today', datetime('now'))`
      )
      .run();

    const healthRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/system-health', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env
    );
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { ok: boolean; health: { auditLogsTotal: number } };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.health.auditLogsTotal).toBeGreaterThanOrEqual(2);

    const pruneRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/prune-logs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env
    );
    expect(pruneRes.status).toBe(200);
    const pruneJson = (await pruneRes.json()) as { ok: boolean; deletedRows: number };
    expect(pruneJson.ok).toBe(true);
    expect(pruneJson.deletedRows).toBeGreaterThanOrEqual(1);

    const oldStillExists = await db.prepare(`SELECT id FROM audit_logs WHERE id = 'aud_old_1'`).first();
    const freshExists = await db.prepare(`SELECT id FROM audit_logs WHERE id = 'aud_fresh_1'`).first();
    expect(oldStillExists).toBeNull();
    expect(freshExists).toBeTruthy();
  });

  it('provides live Hyperliquid/Jupiter/GMX/dYdX markets, Agent Wallet encrypted connect, Perp orders & live positions', async () => {
    const env = makeEnv();
    const userToken = await issueUserToken(env, {
      id: 'usr_perp_1',
      role: 'user',
      telegramId: '777888999',
      username: 'PerpTrader',
    });

    // 1. Public markets + 4 Trust Wallet DApp links
    const mkRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/dex/perp-markets'), env);
    expect(mkRes.status).toBe(200);
    const mkJson = (await mkRes.json()) as {
      markets: Array<{ symbol: string; markPrice: number }>;
      dapps: Array<{ venue: string; maxLeverage: number; trustWalletDappUrl: string }>;
    };
    expect(mkJson.markets[0]!.symbol).toBe('BTC');
    expect(mkJson.markets[0]!.markPrice).toBe(61500.5);
    expect(mkJson.dapps.map((d) => d.venue)).toEqual(['hyperliquid', 'jupiter_perps', 'gmx', 'dydx']);

    // 2. Connect main wallet + encrypted Hyperliquid trade-only agent key
    const connRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          provider: 'HYPERLIQUID',
          walletAddress: '0x1111111111111111111111111111111111111111',
          agentAddress: '0x2222222222222222222222222222222222222222',
          agentPrivateKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      }),
      env
    );
    expect(connRes.status).toBe(200);
    const connJson = (await connRes.json()) as { connected: boolean; mode: string; liveAccount: { accountValueUsd: number } };
    expect(connJson.connected).toBe(true);
    expect(connJson.mode).toBe('AGENT_WALLET');
    expect(connJson.liveAccount.accountValueUsd).toBe(2500.75);

    // 3. Record leveraged Perp order & verify auto-fetched entry price + liquidation estimate
    const ordRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          provider: 'HYPERLIQUID',
          symbol: 'BTC',
          side: 'LONG',
          sizeUsd: 250,
          leverage: 10,
        }),
      }),
      env
    );
    expect(ordRes.status).toBe(200);
    const ordJson = (await ordRes.json()) as {
      ok: boolean;
      orderId: string;
      liquidationEstUsd: number;
      dappRedirectUrl: string;
    };
    expect(ordJson.ok).toBe(true);
    expect(ordJson.liquidationEstUsd).toBeGreaterThan(50000);
    expect(ordJson.dappRedirectUrl).toContain('link.trustwallet.com/open_url');

    // 4. Account endpoint returns live positions & order history with size_usd
    const accRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-account', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(accRes.status).toBe(200);
    const accJson = (await accRes.json()) as {
      liveAccount: { positions: Array<{ symbol: string; side: string }> };
      orders: Array<{ id: string; size_usd: number }>;
    };
    expect(accJson.liveAccount.positions[0]!.symbol).toBe('BTC');
    expect(accJson.liveAccount.positions[0]!.side).toBe('LONG');
    expect(accJson.orders[0]!.size_usd).toBe(250);
  });

  it('converts natural ideas to Pine/Python strategies, exposes last_ai_reason, and alerts Telegram on Copy-Vault key export', async () => {
    const env = makeEnv();
    const userToken = await issueUserToken(env, {
      id: 'usr_ai_vault_1',
      role: 'user',
      telegramId: '888111222',
      username: 'VaultUser',
    });

    // 1. AI Strategy Converter fallback generates valid Pine & Python without crashing
    const pineRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/my-ai/convert-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          prompt: 'اسکلپ ۱۵ دقیقه با EMA 9/21 و RSI اشباع فروش',
          targetLanguage: 'pine',
        }),
      }),
      env
    );
    expect(pineRes.status).toBe(200);
    const pineJson = (await pineRes.json()) as { ok: boolean; code: string; language: string };
    expect(pineJson.ok).toBe(true);
    expect(pineJson.language).toBe('pine');
    expect(pineJson.code).toContain('strategy(');

    const pyRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/my-ai/convert-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          prompt: 'RSI + EMA crossover python strategy',
          targetLanguage: 'python',
        }),
      }),
      env
    );
    expect(pyRes.status).toBe(200);
    const pyJson = (await pyRes.json()) as { ok: boolean; code: string; language: string };
    expect(pyJson.code).toContain('def generate_signal');

    const visRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/my-ai/convert-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          prompt: 'EMA 9/21 + RSI strategy',
          targetLanguage: 'visual',
        }),
      }),
      env
    );
    expect(visRes.status).toBe(200);
    const visJson = (await visRes.json()) as { ok: boolean; visualDef: { longRules: unknown[] } };
    expect(Array.isArray(visJson.visualDef.longRules)).toBe(true);

    // 2. Dashboard config exposes last_ai_reason for Simple Mode
    const dashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(dashRes.status).toBe(200);
    const dashJson = (await dashRes.json()) as { config: { last_ai_reason?: string } };
    expect(dashJson.config.last_ai_reason).toContain('BTCUSDT');

    // 3. Copy-Vault key export dispatches instant Telegram security alert
    const expRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(expRes.status).toBe(200);
    const expJson = (await expRes.json()) as { ok: boolean; keys: { evmPrivateKeyHex: string }; warning: string };
    expect(expJson.ok).toBe(true);
    expect(expJson.keys.evmPrivateKeyHex).toMatch(/^[a-f0-9]{64}$/);
    expect(telegramCalls.some((c) => c.body.includes('888111222'))).toBe(true);

    // 4. Copy-Vault 2FA PIN flow: request PIN via Telegram, reject invalid PIN, accept exact PIN
    const pinReqRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/request-pin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(pinReqRes.status).toBe(200);
    const pinCalls = telegramCalls.filter((c) => c.body.includes('888111222') && c.body.includes('<code>'));
    const latestPinBody = pinCalls[pinCalls.length - 1]?.body || '';
    const pinMatch = latestPinBody.match(/<code>(\d{6})<\/code>/);
    expect(pinMatch?.[1]).toMatch(/^\d{6}$/);

    const badExp = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ pinCode: '000000', requireVerification: true }),
      }),
      env
    );
    expect(badExp.status).toBe(403);

    const goodExp = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault/export-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ pinCode: pinMatch![1], requireVerification: true }),
      }),
      env
    );
    expect(goodExp.status).toBe(200);
  });

  it('supports Scheduled Broadcast Center (Telegram + In-App Notifications) and cancellation', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, {
      id: 'owner_bcast',
      role: 'OWNER',
      telegramId: '944021185',
      username: 'AvidOwner',
    });

    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const schedRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          title: 'اطلاعیه تست زمان‌بندی‌شده',
          message: 'نسخه جدید اسکنر ۱۰ کوین فعال شد!',
          deliverTelegram: true,
          deliverInApp: true,
          scheduledAt: futureIso,
        }),
      }),
      env
    );
    expect(schedRes.status).toBe(200);
    const schedJson = (await schedRes.json()) as { ok: boolean; scheduled: boolean; id: string };
    expect(schedJson.scheduled).toBe(true);

    const listRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/broadcasts', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { broadcasts: Array<{ id: string; status: string }> };
    expect(listJson.broadcasts.some((b) => b.id === schedJson.id && b.status === 'SCHEDULED')).toBe(true);

    const cancelRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/broadcasts/${schedJson.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(cancelRes.status).toBe(200);

    // Immediate In-App + Telegram broadcast creates notification rows
    const immRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          title: 'اطلاعیه فوری',
          message: 'سرور کپی‌ترید بروزرسانی شد',
          deliverTelegram: true,
          deliverInApp: true,
        }),
      }),
      env
    );
    expect(immRes.status).toBe(200);
    const immJson = (await immRes.json()) as { ok: boolean; deliveredInApp: number };
    expect(immJson.deliveredInApp).toBeGreaterThanOrEqual(1);
  });
});
