import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureUserDefaults } from '../auth.js';
import { fetchPublicKlines } from '../exchanges/paper.js';
import { HyperliquidPerpAdapter } from '../exchanges/hyperliquid.js';
import { reconcilePerpDexOrders } from '../dex/perp-dex.js';
import { reconcileOpenPositionsForUser } from '../engine/executor.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { encryptVaultJson } from '../crypto.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v1193',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

describe('V11.9.3 End-to-End Verification: Auth Origin, No Synthetic Candles, Hyperliquid k-Prefix & Reduce-Only Close, Sniper Trailing SL', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v1193-db' },
    });
    db = await mf.getD1Database('DB');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(dir, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      for (const stmt of sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
        await db.prepare(stmt).run();
      }
    }
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  it('1. Never generates synthetic sine-wave candles when exchanges have no data for an unknown symbol', async () => {
    globalThis.fetch = (async () => new Response('[]', { status: 404 })) as typeof fetch;
    try {
      const candles = await fetchPublicKlines('NONEXISTENTTOKENUSDT', '15m', 100);
      expect(candles).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('2. Maps 1000PEPEUSDT -> kPEPE on Hyperliquid and closes LIVE perp order with signed r:true reduce-only', async () => {
    const env = makeEnv();
    const userId = 'usr_hl_v1193';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'hl@test.io', 'hluser', 'x', 'user', 1)`
      )
      .bind(userId)
      .run();
    await ensureUserDefaults(db, userId);

    const encAgent = await encryptVaultJson(
      { agentPrivateKey: '0x' + '11'.repeat(32) },
      env.MASTER_ENCRYPTION_KEY
    );
    await db
      .prepare(
        `INSERT INTO perp_dex_connections (id, user_id, venue, master_address, agent_address, encrypted_agent_secret, is_active)
         VALUES ('perp_1', ?, 'hyperliquid', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', ?, 1)`
      )
      .bind(userId, encAgent)
      .run();

    await db
      .prepare(
        `INSERT INTO perp_dex_orders (id, user_id, venue, symbol, side, leverage, margin_usd, entry_price, tp_price, sl_price, execution_kind, external_order_id, status)
         VALUES ('ord_hl_tp', ?, 'hyperliquid', '1000PEPEUSDT', 'LONG', 10, 100, 0.015, 0.020, 0.012, 'HYPERLIQUID_AGENT_LIVE', '888111', 'FILLED')`
      )
      .bind(userId)
      .run();

    let capturedReduceOnly: boolean | null = null;
    let capturedAssetIdx: number | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('api.hyperliquid.xyz/info')) {
        const body = JSON.parse(String(init?.body || '{}')) as { type?: string };
        if (body.type === 'clearinghouseState') {
          return Response.json({
            marginSummary: { accountValue: '500' },
            withdrawable: '400',
            assetPositions: [{ position: { coin: 'kPEPE', szi: '50000', entryPx: '0.015', unrealizedPnl: '250', leverage: { value: 10 } } }],
          });
        }
        return Response.json([
          { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }, { name: 'kPEPE', szDecimals: 0, maxLeverage: 20 }] },
          [{ markPx: '95000', volume24h: '10000000' }, { markPx: '0.022', dayNtlVlm: '50000000', funding: '0.0001', openInterest: '1000000' }],
        ]);
      }
      if (url.includes('api.hyperliquid.xyz/exchange')) {
        const payload = JSON.parse(String(init?.body || '{}')) as {
          action?: { orders?: Array<{ a?: number; r?: boolean; b?: boolean }> };
        };
        capturedAssetIdx = payload.action?.orders?.[0]?.a ?? null;
        capturedReduceOnly = payload.action?.orders?.[0]?.r ?? null;
        return Response.json({
          status: 'ok',
          response: { type: 'order', data: { statuses: [{ filled: { oid: 999222, totalSz: '50000', avgPx: '0.022' } }] } },
        });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    try {
      const hlAdapter = new HyperliquidPerpAdapter({
        masterAddress: '0x1111111111111111111111111111111111111111',
        agentPrivateKeyHex: '0x' + '11'.repeat(32),
      });
      const px = await hlAdapter.getTickerPrice('1000PEPEUSDT');
      expect(Number(px)).toBeCloseTo(0.022, 6);

      const closed = await reconcilePerpDexOrders(env, userId);
      expect(closed).toBe(1);
      expect(capturedAssetIdx).toBe(1);
      expect(capturedReduceOnly).toBe(true);

      const row = await db.prepare(`SELECT status, note FROM perp_dex_orders WHERE id = 'ord_hl_tp'`).first<{ status: string; note: string }>();
      expect(row?.status).toBe('CLOSED');
      expect(row?.note).toContain('999222');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('3. Ratchets dex_trades stop_loss_usd via sniper_trailing_enabled and closes on trailing pull-back', async () => {
    const env = makeEnv();
    const userId = 'usr_sniper_trail';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'sniper@test.io', 'snipertrail', 'x', 'user', 1)`
      )
      .bind(userId)
      .run();
    await ensureUserDefaults(db, userId);
    await db
      .prepare(
        `UPDATE bot_configs SET trading_mode = 'PAPER', sniper_trailing_enabled = 1, sniper_trailing_pct = 10, paper_balance = '1000' WHERE user_id = ?`
      )
      .bind(userId)
      .run();
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, tx_hash, status)
         VALUES ('dtr_trail_1', ?, 'solana', 'raydium', 'pair_1', 'So11111111111111111111111111111111111111112', 'TRAIL', 'BUY', 100, 100, 1.0, 0.85, 2.5, 'PAPER_SNIPER_1', 'OPEN')`
      )
      .bind(userId)
      .run();

    let mockDexPrice = '1.50';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('dexscreener.com')) {
        const pairObj = {
          chainId: 'solana',
          dexId: 'raydium',
          pairAddress: 'pair_1',
          baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'TRAIL', name: 'Trail Token' },
          quoteToken: { symbol: 'SOL' },
          priceUsd: mockDexPrice,
          liquidity: { usd: 150000 },
          volume: { h24: 250000 },
        };
        if (url.includes('/token-pairs/v1/')) {
          return Response.json([pairObj]);
        }
        return Response.json({ pairs: [pairObj] });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    try {
      // Price surges to $1.50 -> trailing SL ratchets to $1.35 (1.50 * 0.9)
      await reconcileOpenPositionsForUser(env, userId);
      const midRow = await db.prepare(`SELECT status, stop_loss_usd FROM dex_trades WHERE id = 'dtr_trail_1'`).first<{ status: string; stop_loss_usd: number }>();
      expect(midRow?.status).toBe('OPEN');
      expect(midRow?.stop_loss_usd).toBeCloseTo(1.35, 3);

      // Price pulls back to $1.34 -> trailing SL closes cleanly in profit (+34%)!
      mockDexPrice = '1.34';
      await reconcileOpenPositionsForUser(env, userId);
      const closedRow = await db
        .prepare(`SELECT status, realized_pnl_usd, note FROM dex_trades WHERE id = 'dtr_trail_1'`)
        .first<{ status: string; realized_pnl_usd: number; note: string }>();
      expect(closedRow?.status).toBe('CLOSED');
      expect(closedRow?.realized_pnl_usd).toBeCloseTo(34, 1);
      expect(closedRow?.note).toContain('Trailing SL');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('4. Google OAuth /start honors X-Forwarded-Host and web_origin safely', async () => {
    const env = makeEnv();
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('google_client_id', 'test-client-id-123')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('google_client_secret', 'test-secret-456')`)
      .run();
    await db
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_google_enabled', 'true')`)
      .run();
    invalidateSettingsCache(db);

    const res = await worker.fetch(
      new Request('https://worker-internal.workers.dev/api/auth/google/start?web_origin=https://my.customdomain.org', {
        headers: {
          'X-Forwarded-Host': 'my.customdomain.org',
          'X-Forwarded-Proto': 'https',
        },
      }),
      env
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('Location') || '';
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain(encodeURIComponent('https://my.customdomain.org/api/auth/google/callback'));
  });
});
