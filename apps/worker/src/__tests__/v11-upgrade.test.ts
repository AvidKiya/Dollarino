import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { extractTomanFromHtml } from '../exchanges/iran-rate.js';
import worker from '../index.js';
import { checkLiveFeeEnforcement, recordProfitShareServerFee } from '../services/server-fee.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v11-upgrade',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_FALLBACK_TOKEN_V11',
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
  userId: string,
  tgId: string,
  role: 'owner' | 'admin' | 'user' = 'user'
): Promise<string> {
  const magic = `tglm_${userId}_${Date.now()}_${Math.random()}`;
  const existing = await db.prepare('SELECT id FROM users WHERE id = ? OR telegram_id = ?').bind(userId, tgId).first<{ id: string }>();
  if (existing) {
    await db
      .prepare(`UPDATE users SET role = ?, web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`)
      .bind(role, magic, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001199', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(userId, `${userId}@dollarino.local`, `v11_${userId}`, role, tgId, magic)
      .run();
  }

  const res = await worker.fetch(
    new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magic }),
    }),
    env
  );
  const data = (await res.json()) as { token: string };
  return data.token;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'test-dollarino-v11' },
  });
  db = await mf.getD1Database('DB');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migDir = path.resolve(__dirname, '../../../../migrations');
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
    for (const stmt of splitSqlStatements(sql)) {
      await db.prepare(stmt).run();
    }
  }
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mf.dispose();
});

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('api.telegram.org')) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { id: 777000, username: 'MockDollarinoBot', first_name: 'MockBot', message_id: 950 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.nobitex.ir/market/stats')) {
      return new Response(
        JSON.stringify({ stats: { 'usdt-rls': { latest: '1155000', bestSell: '1156000' } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('binance.com/bapi/composite/v1/public/cms/article/list/query')) {
      return new Response(
        JSON.stringify({
          data: {
            catalogs: [
              {
                articles: [
                  {
                    id: 112233,
                    code: 'new-listing-v11',
                    title: 'Binance Will List ZENTRA (ZENTRA) with Seed Tag Applied',
                    releaseDate: Date.now() - 10 * 60_000,
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.dexscreener.com/token-boosts/latest/v1')) {
      return new Response(
        JSON.stringify([
          { chainId: 'solana', tokenAddress: 'So11111111111111111111111111111111111111112' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.dexscreener.com/latest/dex/tokens/')) {
      return new Response(
        JSON.stringify({
          pairs: [
            {
              chainId: 'solana',
              dexId: 'raydium',
              pairAddress: 'PairBoom111',
              url: 'https://dexscreener.com/solana/PairBoom111',
              baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'BOOMV11', name: 'Boom V11' },
              quoteToken: { symbol: 'SOL' },
              priceUsd: '0.024',
              liquidity: { usd: 145000 },
              volume: { h24: 380000, h1: 85000 },
              priceChange: { h1: 24, h24: 95 },
              txns: { h1: { buys: 310, sells: 110 } },
              pairCreatedAt: Date.now() - 2 * 3600_000,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.dexscreener.com/latest/dex/search')) {
      return new Response(
        JSON.stringify({
          pairs: [
            {
              chainId: 'bsc',
              dexId: 'pancakeswap',
              pairAddress: 'PairZentra111',
              baseToken: { address: '0x1111111111111111111111111111111111111111', symbol: 'ZENTRA', name: 'Zentra' },
              quoteToken: { symbol: 'USDT' },
              priceUsd: '1.15',
              liquidity: { usd: 210000 },
              volume: { h24: 490000, h1: 92000 },
              priceChange: { h1: 18, h24: 60 },
              txns: { h1: { buys: 240, sells: 80 } },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('api.gopluslabs.io') || url.includes('api.honeypot.is') || url.includes('api.rugcheck.xyz')) {
      return new Response(JSON.stringify({ result: {}, token: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('binance.com/fapi/v1/klines') || url.includes('binance.com/api/v3/klines')) {
      const now = Date.now();
      const klines = Array.from({ length: 60 }, (_, idx) => [
        now - (60 - idx) * 900_000,
        '95000',
        '95400',
        '94800',
        '95200',
        '120',
      ]);
      return new Response(JSON.stringify(klines), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (init?.method === 'POST' && url.includes('bsc-dataseed')) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});

describe('Dollarino V11.0 Upgrade Suite', () => {
  it('serves V11.0 health flags, 3% + 3 free live trades pricing, and force-refreshable USDT/IRT rate', async () => {
    const env = makeEnv();
    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as {
      version: string;
      profitShareFeePct: number;
      freeProfitableLiveTrades: number;
      multiEngineSimultaneous: boolean;
      listingAndMemeSniper: boolean;
      capabilities: Record<string, boolean>;
    };
    expect(health.version).toMatch(/^11\./);
    expect(health.profitShareFeePct).toBe(3);
    expect(health.freeProfitableLiveTrades).toBe(3);
    expect(health.multiEngineSimultaneous).toBe(true);
    expect(health.listingAndMemeSniper).toBe(true);
    expect(health.capabilities.simultaneousMultiEngine).toBe(true);
    expect(health.capabilities.customizablePaperBalance).toBe(true);
    expect(health.capabilities.centralTreasury).toBe(true);
    expect(health.capabilities.listingAndMemeSniper).toBe(true);
    expect(health.capabilities.riskTermsGate).toBe(true);

    const rateRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/usdt-irt-rate?refresh=1'), env);
    expect(rateRes.status).toBe(200);
    const rate = (await rateRes.json()) as { usdtIrt: number; usdtIrr: number; source: string };
    expect(rate.usdtIrt).toBe(115500);
    expect(rate.usdtIrr).toBe(1155000);
    expect(rate.source).toBe('nobitex');
  });

  it('persists Risk Terms Acceptance, allows customizable $50-$10M Paper Wallet, and isolates Copy Follow from multi-engine execution', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v11_multi', '9110001', 'user');

    // 1. Risk Terms Acceptance
    const dashBefore = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    const djBefore = (await dashBefore.json()) as { riskTermsAcceptedAt: string | null };
    expect(djBefore.riskTermsAcceptedAt).toBeNull();

    const acceptRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/accept-risk-terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(acceptRes.status).toBe(200);
    const acceptJson = (await acceptRes.json()) as { ok: boolean; riskTermsAcceptedAt: string };
    expect(acceptJson.riskTermsAcceptedAt).toBeTruthy();

    const meRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    const meJson = (await meRes.json()) as { user: { risk_terms_accepted_at: string | null } };
    expect(meJson.user.risk_terms_accepted_at).toBeTruthy();

    // 2. Customizable Paper Wallet ($50 .. $10,000,000)
    const set250 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/wallet/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 250 }),
      }),
      env
    );
    expect(set250.status).toBe(200);
    const j250 = (await set250.json()) as { balanceAfter: number; customPaperBalance: number };
    expect(j250.balanceAfter).toBe(250);
    expect(j250.customPaperBalance).toBe(250);

    const clampLow = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/wallet/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 5 }),
      }),
      env
    );
    expect(((await clampLow.json()) as { balanceAfter: number }).balanceAfter).toBe(50);

    const set5M = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/wallet/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 5000000 }),
      }),
      env
    );
    expect(((await set5M.json()) as { balanceAfter: number }).balanceAfter).toBe(5000000);

    // 3. Simultaneous 5-Engine Execution + Copy Follow Isolation
    await db
      .prepare(
        `INSERT OR IGNORE INTO copy_traders (id, display_name, specialty, win_rate, roi_30d_pct, min_allocation_usd, is_verified, is_active)
         VALUES ('ct_v11_multi', 'V11 Quant', 'BTC/SOL', 80, 50, 50, 1, 1)`
      )
      .run();

    // Follow trader while bot is STOPPED -> bot stays STOPPED, auto_mirror stays 0
    const followOnly = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/follow', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ traderId: 'ct_v11_multi', follow: true, allocationUsd: 100 }),
      }),
      env
    );
    expect(followOnly.status).toBe(200);
    const fJson = (await followOnly.json()) as { following: boolean; botStarted: boolean; activeEngine: { isBotRunning: boolean } };
    expect(fJson.following).toBe(true);
    expect(fJson.botStarted).toBe(false);
    expect(fJson.activeEngine.isBotRunning).toBe(false);

    // Enable ALL 5 engines simultaneously
    const all5Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/engines', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engines: ['CENTRAL_AI', 'MY_AI', 'STRATEGY', 'COPY_TRADE', 'LISTING_SNIPER'],
          strategyKey: 'dollarino_v01',
        }),
      }),
      env
    );
    expect(all5Res.status).toBe(200);
    const all5Json = (await all5Res.json()) as { activeEngine: { activeEngines: string[]; activeEngine: string; myAiActive: boolean; sniperEnabled: boolean } };
    expect(all5Json.activeEngine.activeEngines).toEqual(
      expect.arrayContaining(['CENTRAL_AI', 'MY_AI', 'STRATEGY', 'COPY_TRADE', 'LISTING_SNIPER'])
    );
    expect(all5Json.activeEngine.activeEngine).toBe('MULTI');
    expect(all5Json.activeEngine.myAiActive).toBe(true);
    expect(all5Json.activeEngine.sniperEnabled).toBe(true);

    // Turning OFF MY_AI leaves the remaining 4 active!
    const toggleOff = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/engines/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'MY_AI', enabled: false }),
      }),
      env
    );
    const toggleJson = (await toggleOff.json()) as { activeEngine: { activeEngines: string[] } };
    expect(toggleJson.activeEngine.activeEngines).not.toContain('MY_AI');
    expect(toggleJson.activeEngine.activeEngines).toEqual(expect.arrayContaining(['CENTRAL_AI', 'STRATEGY', 'COPY_TRADE', 'LISTING_SNIPER']));
  });

  it('grants 3 free profitable LIVE trades (0%), charges 3% thereafter, and keeps open LIVE trades manageable even when locked', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v11_3pct', '9110002', 'user');

    for (let i = 1; i <= 3; i++) {
      const r = await recordProfitShareServerFee(db, {
        userId: 'usr_v11_3pct',
        tradeId: `trd_v11_free_${i}`,
        mode: 'LIVE',
        source: 'PERP_LIVE',
        symbol: 'BTCUSDT',
        realizedPnlUsd: 100,
      });
      expect(r.freeTrialUsed).toBe(true);
      expect(r.feeUsd).toBe(0);
    }

    // 4th profitable trade (+$200) -> exact 3% = $6.00 (exceeds $2 grace -> LOCKED)
    const r4 = await recordProfitShareServerFee(db, {
      userId: 'usr_v11_3pct',
      tradeId: 'trd_v11_paid_4',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: 200,
    });
    expect(r4.freeTrialUsed).toBe(false);
    expect(r4.feeUsd).toBeCloseTo(6.0, 4);

    // Enforcement blocks NEW LIVE positions but explicitly guarantees OPEN trades stay managed
    const enf = await checkLiveFeeEnforcement(db, 'usr_v11_3pct');
    expect(enf.allowed).toBe(false);
    expect(enf.canManageOpenPositions).toBe(true);
    expect(enf.freeTradesUsed).toBe(3);
    expect(enf.freeTradesRemaining).toBe(0);

    // Verify ledger metadata + open trade closing remains functional while locked
    await db
      .prepare(
        `INSERT INTO trades (id, client_id, user_id, strategy_key, exchange_provider, mode, market_type, symbol, direction, leverage, entry_price, initial_quantity, remaining_quantity, margin_used, initial_stop_loss, current_stop_loss, tp1, status)
         VALUES ('trd_open_live_1', 'cli_open_live_1', 'usr_v11_3pct', 'dollarino_v01', 'paper', 'LIVE', 'FUTURES', 'BTCUSDT', 'LONG', 5, '95000', '0.01', '0.01', '190', '93000', '93000', '98000', 'OPEN')`
      )
      .run();

    const closeRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/positions/trd_open_live_1/close', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(closeRes.status).toBe(200);
    const closedRow = await db.prepare(`SELECT status FROM trades WHERE id = 'trd_open_live_1'`).first<{ status: string }>();
    expect(closedRow?.status).toBe('CLOSED');
  });

  it('restricts TradingView Webhooks & signal broadcast channels strictly to Admins/Owner while allowing PM personal bots for regular users', async () => {
    const env = makeEnv();
    const userToken = await issueUserToken(env, 'usr_v11_reg', '9110003', 'user');
    const ownerToken = await issueUserToken(env, 'usr_v11_own', '944021185', 'owner');

    // Regular user sees webhookUrl: null and webhookAdminOnly: true
    const alertsUser = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/alerts', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(alertsUser.status).toBe(200);
    const ajUser = (await alertsUser.json()) as { webhookUrl: string | null; webhookAdminOnly: boolean };
    expect(ajUser.webhookUrl).toBeNull();
    expect(ajUser.webhookAdminOnly).toBe(true);

    // Regular user's webhook secret returns 403 on /api/webhook/tv/:secret
    const userCfg = await db.prepare(`SELECT webhook_secret FROM bot_configs WHERE user_id = 'usr_v11_reg'`).first<{ webhook_secret: string }>();
    const tvDenied = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/webhook/tv/${userCfg!.webhook_secret}`, {
        method: 'POST',
        body: 'LONG BTCUSDT @ 95000 SL 93000 TP 98000',
      }),
      env
    );
    expect(tvDenied.status).toBe(403);

    // Regular user tries passing signalChannelId on /telegram-bots -> stripped to NULL (PM only)
    const addPmBot = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/connections/telegram-bots', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: '12345678:AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPP',
          signalChannelId: '@FakeUserChannel',
        }),
      }),
      env
    );
    expect(addPmBot.status).toBe(200);
    const savedBot = await db.prepare(`SELECT signal_channel_id FROM telegram_bots WHERE user_id = 'usr_v11_reg'`).first<{ signal_channel_id: string | null }>();
    expect(savedBot?.signal_channel_id).toBeNull();

    // Regular user cannot override signal_channel_handle in bot config
    const cfgBefore = await db.prepare(`SELECT signal_channel_handle FROM bot_configs WHERE user_id = 'usr_v11_reg'`).first<{ signal_channel_handle: string }>();
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_channel_handle: '@UnauthorizedChannel', margin_pct: 12 }),
      }),
      env
    );
    const cfgAfter = await db.prepare(`SELECT signal_channel_handle, margin_pct FROM bot_configs WHERE user_id = 'usr_v11_reg'`).first<{ signal_channel_handle: string; margin_pct: number }>();
    expect(cfgAfter?.margin_pct).toBe(12);
    expect(cfgAfter?.signal_channel_handle).toBe(cfgBefore?.signal_channel_handle);
    expect(cfgAfter?.signal_channel_handle).not.toBe('@UnauthorizedChannel');

    // Owner gets real TradingView webhook URL
    const alertsOwner = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/alerts', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    const ajOwner = (await alertsOwner.json()) as { webhookUrl: string | null; webhookAdminOnly: boolean };
    expect(ajOwner.webhookAdminOnly).toBe(false);
    expect(ajOwner.webhookUrl).toContain('/api/webhook/tv/');
  });

  it('runs Central Treasury Bank Wallet (BIP39 Mnemonic Vault, Trust Wallet Connect, $10+ deposits & Admin approval)', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v11_t_own', '944021186', 'owner');
    const userToken = await issueUserToken(env, 'usr_v11_t_usr', '9110004', 'user');

    // 1. Admin imports standard BIP39 12-word mnemonic -> deterministic EVM & TRON derivation + AES-GCM encrypted
    const importRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/treasury/import-mnemonic', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        }),
      }),
      env
    );
    expect(importRes.status).toBe(200);
    const impJson = (await importRes.json()) as {
      ok: boolean;
      receivers: { evm: string; tron: string };
      summary: { mnemonicConfigured: boolean; bankMode: string };
    };
    expect(impJson.receivers.evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(impJson.receivers.tron).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(impJson.summary.mnemonicConfigured).toBe(true);
    expect(impJson.summary.bankMode).toBe('MNEMONIC_VAULT');

    // 2. User fetches Treasury deposit options
    const optRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/treasury/options', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(optRes.status).toBe(200);
    const optJson = (await optRes.json()) as {
      minDepositUsd: number;
      networks: Array<{ network: string; address: string | null }>;
    };
    expect(optJson.minDepositUsd).toBeGreaterThanOrEqual(10);
    const bep20Opt = optJson.networks.find((n) => n.network === 'BEP20');
    const trc20Opt = optJson.networks.find((n) => n.network === 'TRC20');
    expect(bep20Opt?.address).toBe(impJson.receivers.evm);
    expect(trc20Opt?.address).toBe(impJson.receivers.tron);

    // 3. Reject deposit < $10
    const underMin = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/treasury/deposit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'BEP20',
          asset: 'USDT',
          amountUsd: 5,
          txHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        }),
      }),
      env
    );
    expect(underMin.status).toBe(400);

    // 4. Submit $25 deposit -> PENDING_VERIFY -> Duplicate TX rejected (409) -> Admin confirms -> +$25 prepaid credit!
    const validDep = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/treasury/deposit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'BEP20',
          asset: 'USDT',
          amountUsd: 25,
          category: 'CREDIT_TOPUP',
          txHash: '0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff',
        }),
      }),
      env
    );
    expect(validDep.status).toBe(201);
    const depJson = (await validDep.json()) as { id: string; status: string };
    expect(depJson.status).toBe('PENDING_VERIFY');

    const dupDep = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/treasury/deposit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'BEP20',
          asset: 'USDT',
          amountUsd: 25,
          txHash: '0x9999888877776666555544443333222211110000aaaabbbbccccddddeeeeffff',
        }),
      }),
      env
    );
    expect(dupDep.status).toBe(409);

    const approveRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/treasury/deposits/${depJson.id}/decide`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true }),
      }),
      env
    );
    expect(approveRes.status).toBe(200);

    const uCred = await db.prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = 'usr_v11_t_usr'`).first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(uCred?.fee_prepaid_credit_usd ?? 0)).toBeCloseTo(25, 2);
  });

  it('discovers New Listings & Booming Meme Coins via LISTING_SNIPER and deduplicates events over 24h', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v11_sniper', '9110005', 'user');

    // Enable LISTING_SNIPER & start bot in PAPER mode
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sniper_enabled: true,
          sniper_budget_usd: 40,
          sniper_min_safety_score: 65,
        }),
      }),
      env
    );
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeEngines: ['LISTING_SNIPER'],
          tradingMode: 'PAPER',
          acceptRiskTerms: true,
        }),
      }),
      env
    );

    const scan1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper/scan-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(scan1.status).toBe(200);
    const s1 = (await scan1.json()) as { scannedCount: number; boughtCount: number; events: unknown[] };
    expect(s1.scannedCount).toBeGreaterThan(0);
    expect(s1.boughtCount).toBeGreaterThan(0);

    // Second immediate scan deduplicates already-sniped tokens over 24h
    const scan2 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper/scan-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    const s2 = (await scan2.json()) as { boughtCount: number };
    expect(s2.boughtCount).toBe(0);

    const sniperStateRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(sniperStateRes.status).toBe(200);
    const sniperJson = (await sniperStateRes.json()) as { settings: { enabled: boolean; budgetUsd: number }; events: unknown[] };
    expect(sniperJson.settings.enabled).toBe(true);
    expect(sniperJson.settings.budgetUsd).toBe(40);
    expect(sniperJson.events.length).toBeGreaterThan(0);
  });

  it('parses live ArzDigital & AlanChand Persian-numeral USDT/IRT pages and computes dynamic capital-capped settings', async () => {
    const arzHtml = `<div><span>نرخ تتر: ۲۹۰,۶۲۲ تومان</span><p>قیمت امروز تتر در ایران ۲۹۰,۰۰۵ تومان</p></div>`;
    const alanHtml = `<div><p>هر تتر (USDT) در بازار ایران ۲۹۰,۹۹۷ تومان است</p><span>قیمت تومانی۲۹۰,۹۹۷ تومان</span></div>`;
    expect(extractTomanFromHtml(arzHtml, 'arzdigital')).toBe(290005);
    expect(extractTomanFromHtml(alanHtml, 'alanchand')).toBe(290997);

    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v11_cap', '9110099', 'user');

    const resetBal = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/wallet/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 1000 }),
      }),
      env
    );
    expect(resetBal.status).toBe(200);

    const patchCap = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_budget_mode: 'FIXED_USD',
          bot_budget_usd: 100,
        }),
      }),
      env
    );
    expect(patchCap.status).toBe(200);
    const capRes = (await patchCap.json()) as {
      capitalSummary: {
        walletTotalUsd: number;
        effectiveCapitalUsd: number;
        isCapped: boolean;
        recommended: { maxOpenPositions: number; marginPct: number; perTradeUsd: number };
      };
    };
    expect(capRes.capitalSummary.walletTotalUsd).toBe(1000);
    expect(capRes.capitalSummary.effectiveCapitalUsd).toBe(100);
    expect(capRes.capitalSummary.isCapped).toBe(true);
    expect(capRes.capitalSummary.recommended.maxOpenPositions).toBe(4);
    expect(capRes.capitalSummary.recommended.perTradeUsd).toBe(25);

    const dynReset = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config/reset-defaults', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: 'balanced' }),
      }),
      env
    );
    expect(dynReset.status).toBe(200);
    const dynJson = (await dynReset.json()) as {
      ok: boolean;
      config: { margin_pct: number; max_open_positions: number; max_leverage: number };
      recommended: { effectiveCapitalUsd: number; perTradeUsd: number };
    };
    expect(dynJson.ok).toBe(true);
    expect(dynJson.recommended.effectiveCapitalUsd).toBe(100);
    expect(dynJson.config.max_open_positions).toBe(4);
    expect(dynJson.config.margin_pct).toBe(25);
    expect(dynJson.config.max_leverage).toBe(5);
  });

  it('V11.3 strictly isolates PAPER vs LIVE wallet balances, trades, stats, and rejects unready LIVE bot start', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v113_iso', '9113001', 'user');

    // Seed one closed PAPER trade and one open PAPER trade
    await db
      .prepare(
        `INSERT INTO trades (id, client_id, user_id, strategy_key, exchange_provider, mode, market_type, symbol, direction, leverage, entry_price, exit_price, initial_quantity, remaining_quantity, margin_used, initial_stop_loss, current_stop_loss, tp1, status, realized_pnl, opened_at, closed_at)
         VALUES ('tr_iso_p_1', 'cli_iso_p_1', 'usr_v113_iso', 'dollarino_v01', 'paper', 'PAPER', 'FUTURES', 'BTCUSDT', 'LONG', 5, '90000', '91800', '0.01', '0', '180', '88000', '88000', '93000', 'CLOSED', '100', datetime('now', '-1 hour'), datetime('now'))`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO trades (id, client_id, user_id, strategy_key, exchange_provider, mode, market_type, symbol, direction, leverage, entry_price, initial_quantity, remaining_quantity, margin_used, initial_stop_loss, current_stop_loss, tp1, status)
         VALUES ('tr_iso_p_2', 'cli_iso_p_2', 'usr_v113_iso', 'dollarino_v01', 'paper', 'PAPER', 'FUTURES', 'ETHUSDT', 'LONG', 5, '3200', '0.1', '0.1', '64', '3000', '3000', '3500', 'OPEN')`
      )
      .run();

    // PAPER dashboard sees $10,100 paper balance ($10,000 + $100 realized PnL) and the 2 PAPER trades
    const paperOv = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(paperOv.status).toBe(200);
    const paperJson = (await paperOv.json()) as {
      balance: { free: string; used: string; total: string };
      walletSummary: { demoBalanceUsd: number; liveBalanceUsd: number; liveHasWallet: boolean; liveMeetsMinimum: boolean; activeMode: string };
      stats: { totalTrades: number; totalPnl: number };
      openTrades: Array<{ id: string }>;
      closedTrades: Array<{ id: string }>;
    };
    expect(paperJson.walletSummary.activeMode).toBe('PAPER');
    expect(paperJson.walletSummary.demoBalanceUsd).toBeGreaterThanOrEqual(10000);
    expect(paperJson.walletSummary.liveBalanceUsd).toBe(0);
    expect(paperJson.walletSummary.liveHasWallet).toBe(false);
    expect(paperJson.walletSummary.liveMeetsMinimum).toBe(false);
    expect(Number(paperJson.balance.total)).toBeGreaterThanOrEqual(10000);
    expect(paperJson.stats.totalTrades).toBe(1);
    expect(paperJson.stats.totalPnl).toBe(100);
    expect(paperJson.openTrades).toHaveLength(1);
    expect(paperJson.closedTrades).toHaveLength(1);

    // Switch mode view to LIVE without Trust Wallet -> succeeds (200) with warningCode=NO_TRUST_WALLET
    const switchLive = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'LIVE', executionMode: 'AUTO' }),
      }),
      env
    );
    expect(switchLive.status).toBe(200);
    const switchJson = (await switchLive.json()) as { ok: boolean; liveReady: boolean; warningCode: string };
    expect(switchJson.ok).toBe(true);
    expect(switchJson.liveReady).toBe(false);
    expect(switchJson.warningCode).toBe('NO_TRUST_WALLET');

    // LIVE dashboard MUST show $0.00 real balance and 0 trades (no bleed from PAPER $10,000!)
    const liveOv = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(liveOv.status).toBe(200);
    const liveJson = (await liveOv.json()) as {
      balance: { free: string; used: string; total: string };
      walletSummary: { demoBalanceUsd: number; liveBalanceUsd: number; liveHasWallet: boolean; liveMeetsMinimum: boolean; activeMode: string };
      stats: { totalTrades: number; totalPnl: number };
      openTrades: Array<{ id: string }>;
      closedTrades: Array<{ id: string }>;
    };
    expect(liveJson.walletSummary.activeMode).toBe('LIVE');
    expect(liveJson.walletSummary.demoBalanceUsd).toBeGreaterThanOrEqual(10000);
    expect(liveJson.walletSummary.liveBalanceUsd).toBe(0);
    expect(Number(liveJson.balance.total)).toBe(0);
    expect(liveJson.stats.totalTrades).toBe(0);
    expect(liveJson.stats.totalPnl).toBe(0);
    expect(liveJson.openTrades).toHaveLength(0);
    expect(liveJson.closedTrades).toHaveLength(0);

    // LIVE /bot/start MUST fail cleanly with 400 NO_TRUST_WALLET and never start PAPER simulator
    const startLive = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey: 'dollarino_ai', acceptRiskTerms: true }),
      }),
      env
    );
    expect(startLive.status).toBe(400);
    const startErr = (await startLive.json()) as { code: string };
    expect(startErr.code).toBe('NO_TRUST_WALLET');
  });

  it('V11.4 enforces strict pre-trade onboarding gate (mode + risk terms), full sniper workbench settings, and ArzDigital Tether rate priority', async () => {
    const env = makeEnv();
    const userId = 'usr_v114_gate_1';
    const token = await issueUserToken(env, userId, '77114001');

    // Fresh user starts with riskTermsAccepted=false and tradingModeSelected=false
    const dash1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(dash1.status).toBe(200);
    const dashJson1 = (await dash1.json()) as {
      riskTermsAcceptedAt: string | null;
      tradingModeSelected: boolean;
      config: { trading_mode_selected: number };
    };
    expect(dashJson1.riskTermsAcceptedAt).toBeNull();
    expect(dashJson1.tradingModeSelected).toBe(false);
    expect(dashJson1.config.trading_mode_selected).toBe(0);

    // 1. Blocked before BOTH mode selection AND risk acceptance (even PAPER demo!)
    const blockedStart = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey: 'dollarino_ai' }),
      }),
      env
    );
    expect(blockedStart.status).toBe(403);
    const blockedStartJson = (await blockedStart.json()) as { code: string };
    expect(blockedStartJson.code).toBe('ONBOARDING_GATE_REQUIRED');

    const blockedManual = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/orders/manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'BTCUSDT', direction: 'LONG', marketType: 'SPOT', marginUsd: 25 }),
      }),
      env
    );
    expect(blockedManual.status).toBe(403);

    const blockedSniperBuy = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper/buy-candidate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: { symbol: 'MEMETEST', tokenAddress: 'So11111111111111111111111111111111111111112', chainId: 'solana', priceUsd: '0.01' },
        }),
      }),
      env
    );
    expect(blockedSniperBuy.status).toBe(403);

    // 2. Accepting risk terms WITHOUT choosing trading mode still blocks trading!
    const acceptOnlyRisk = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/accept-risk-terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(acceptOnlyRisk.status).toBe(200);
    const acceptOnlyJson = (await acceptOnlyRisk.json()) as {
      onboardingReady: boolean;
      tradingModeSelected: boolean;
    };
    expect(acceptOnlyJson.onboardingReady).toBe(false);
    expect(acceptOnlyJson.tradingModeSelected).toBe(false);

    const stillBlockedStart = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey: 'dollarino_ai' }),
      }),
      env
    );
    expect(stillBlockedStart.status).toBe(403);
    const stillBlockedJson = (await stillBlockedStart.json()) as { code: string };
    expect(stillBlockedJson.code).toBe('TRADING_MODE_SELECTION_REQUIRED');

    // 3. Complete onboarding by selecting PAPER mode via /api/trading/accept-risk-terms
    const completeGate = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/accept-risk-terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'PAPER' }),
      }),
      env
    );
    expect(completeGate.status).toBe(200);
    const completeGateJson = (await completeGate.json()) as {
      onboardingReady: boolean;
      tradingModeSelected: boolean;
      tradingMode: string;
    };
    expect(completeGateJson.onboardingReady).toBe(true);
    expect(completeGateJson.tradingModeSelected).toBe(true);
    expect(completeGateJson.tradingMode).toBe('PAPER');

    // Now /bot/start succeeds
    const unblockedStart = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey: 'dollarino_ai' }),
      }),
      env
    );
    expect(unblockedStart.status).toBe(200);

    // 4. Full Sniper Workbench config persistence + alert-only scan
    const saveSniper = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          targetType: 'BOTH',
          budgetUsd: 55,
          minSafetyScore: 68,
          minLiquidityUsd: 35000,
          maxPairAgeHours: 12,
          maxTaxPct: 4,
          tpPct: 45,
          slPct: 14,
          trailingEnabled: true,
          trailingPct: 6,
          maxOpenPositions: 4,
          autoExecute: false,
          slippagePct: 2.5,
          networks: ['solana', 'base'],
        }),
      }),
      env
    );
    expect(saveSniper.status).toBe(200);
    const saveSniperJson = (await saveSniper.json()) as {
      ok: boolean;
      settings: {
        budgetUsd: number;
        minSafetyScore: number;
        networks: string[];
        autoExecute: boolean;
        tpPct: number;
        slPct: number;
        slippagePct: number;
        targetType: string;
        maxPairAgeHours: number;
        maxOpenPositions: number;
      };
    };
    expect(saveSniperJson.ok).toBe(true);
    expect(saveSniperJson.settings.budgetUsd).toBe(55);
    expect(saveSniperJson.settings.minSafetyScore).toBe(68);
    expect(saveSniperJson.settings.networks).toEqual(['solana', 'base']);
    expect(saveSniperJson.settings.autoExecute).toBe(false);
    expect(saveSniperJson.settings.tpPct).toBe(45);
    expect(saveSniperJson.settings.slPct).toBe(14);
    expect(saveSniperJson.settings.slippagePct).toBe(2.5);
    expect(saveSniperJson.settings.targetType).toBe('BOTH');
    expect(saveSniperJson.settings.maxPairAgeHours).toBe(12);
    expect(saveSniperJson.settings.maxOpenPositions).toBe(4);

    // 5. Verify ArzDigital parser and rate prioritizer
    const { extractTomanFromHtml, fetchIranUsdtRate } = await import('../exchanges/iran-rate.js');
    expect(
      extractTomanFromHtml(
        '<div class="arz-coin-page-data__coin-toman-price-value"><span>161,724</span> تومان</div>',
        'arzdigital'
      )
    ).toBe(161724);

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('arzdigital.com/coins/tether')) {
        return new Response(
          '<div class="arz-coin-page-data__coin-toman-price-value">161,850 تومان</div>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

    try {
      const rateRes = await fetchIranUsdtRate(true);
      expect(rateRes.source).toBe('arzdigital');
      expect(rateRes.usdtIrt).toBe(161850);
      expect(rateRes.usdtIrr).toBe(1618500);
    } finally {
      globalThis.fetch = origFetch;
    }

    // Silence unused userId lint
    expect(userId).toBeTruthy();
  });
});
