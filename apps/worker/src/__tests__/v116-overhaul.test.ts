import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { annotateRoutesWithLivePools, buildMultiDappRoutes } from '../dex/screener.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v116-overhaul',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_TOKEN_OVERHAUL',
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

describe('Dollarino V11.6 Overhaul: DEX AI Verdict, Direct Buy, Live Pool Routes, Smart Copy V2 & Telegram Bot', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v116-overhaul-db' },
    });
    db = await mf.getD1Database('DB');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(dir, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await db.prepare(stmt).run();
      }
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await mf?.dispose();
  });

  it('annotates Trust Wallet DApp routes against live pools (DIRECT_POOL / AGGREGATOR / NOT_LISTED)', () => {
    const rawRoutes = buildMultiDappRoutes('solana', 'So11111111111111111111111111111111111111112', 'SOL');
    const annotated = annotateRoutesWithLivePools(rawRoutes, [
      { dexId: 'raydium', liquidity: { usd: 420000 }, url: 'https://raydium.io/swap/?inputMint=sol' },
      { dexId: 'orca', liquidity: { usd: 85000 } },
    ] as unknown as Parameters<typeof annotateRoutesWithLivePools>[1]);
    const ray = annotated.find((r) => r.id === 'raydium');
    const jup = annotated.find((r) => r.id === 'jupiter');
    const pump = annotated.find((r) => r.id === 'pumpfun');
    expect(ray?.isListed).toBe(true);
    expect(ray?.listedStatus).toBe('DIRECT_POOL');
    expect(ray?.poolLiquidityUsd).toBe(420000);
    expect(jup?.isListed).toBe(true);
    expect(jup?.listedStatus).toBe('AGGREGATOR');
    expect(pump?.isListed).toBe(false);
    expect(pump?.listedStatus).toBe('NOT_LISTED');
  });

  it('returns quantitative AI verdict, executes PAPER direct-buy with Sniper settings & restores balance', async () => {
    const env = makeEnv();
    const magic = `tglm_overhaul_${Date.now()}`;
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, risk_terms_accepted_at, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES ('u_ovh1', 'ovh1@dollarino.local', 'ovh_user1', 'x', 'user', '77880011', '+989123334455', 1, datetime('now'), ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(magic)
      .run();

    const loginRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magic }),
      }),
      env
    );
    const { token } = (await loginRes.json()) as { token: string };

    // 1. AI Analyze quantitative verdict (deterministic DexScreener pool stub)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        if (u.includes('api.dexscreener.com')) {
          return new Response(
            JSON.stringify({
              pairs: [
                {
                  chainId: 'solana',
                  dexId: 'raydium',
                  pairAddress: 'pair1',
                  url: 'https://dexscreener.com/solana/pair1',
                  baseToken: { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'Bonk', symbol: 'BONK' },
                  quoteToken: { symbol: 'SOL' },
                  priceUsd: '0.000028',
                  liquidity: { usd: 450000 },
                  volume: { h24: 1200000 },
                  priceChange: { h1: 4.2, h24: 18.5 },
                  txns: { h1: { buys: 320, sells: 140 } },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return realFetch(input, init);
      })
    );
    const aiRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chainId: 'solana',
          tokenAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          symbol: 'BONK',
          priceUsd: 0.000028,
          liquidityUsd: 450000,
          volume24hUsd: 1200000,
          priceChange24h: 18.5,
          safetyScore: 88,
        }),
      }),
      env
    );
    expect(aiRes.status).toBe(200);
    const aiJson = (await aiRes.json()) as { verdict: string; verdictLabel: string; confidencePct: number; reasons: string[] };
    expect(['STRONG_BUY', 'BUY']).toContain(aiJson.verdict);
    expect(aiJson.confidencePct).toBeGreaterThanOrEqual(60);
    expect(aiJson.reasons.length).toBeGreaterThan(0);

    // 1b. AI Analyze snapshot fallback when DexScreener & GeckoTerminal return 404/empty
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const snapRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chainId: 'solana',
          tokenAddress: 'offline_snap_token_addr',
          lang: 'fa',
          tokenSnapshot: {
            chainId: 'solana',
            dexId: 'raydium',
            pairAddress: 'offline_snap_pair',
            baseToken: { address: 'offline_snap_token_addr', name: 'Pepe', symbol: 'PEPE' },
            quoteToken: { address: '', name: 'SOL', symbol: 'SOL' },
            priceUsd: '0.000012',
            liquidity: { usd: 320000 },
            volume: { h24: 850000 },
            priceChange: { h1: 6.4, h24: 19.2 },
            txns: { h1: { buys: 240, sells: 110 } },
            safetyScore: 86,
          },
        }),
      }),
      env
    );
    expect(snapRes.status).toBe(200);
    const snapJson = (await snapRes.json()) as { ok: boolean; verdict: string; confidencePct: number; suggestedLevels: { entryUsd: number } };
    expect(snapJson.ok).toBe(true);
    expect(['STRONG_BUY', 'BUY']).toContain(snapJson.verdict);
    expect(snapJson.suggestedLevels.entryUsd).toBeGreaterThan(0);
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        if (u.includes('api.dexscreener.com')) {
          return new Response(
            JSON.stringify({
              pairs: [
                {
                  chainId: 'solana',
                  dexId: 'raydium',
                  pairAddress: 'pair1',
                  url: 'https://dexscreener.com/solana/pair1',
                  baseToken: { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'Bonk', symbol: 'BONK' },
                  quoteToken: { symbol: 'SOL' },
                  priceUsd: '0.000028',
                  liquidity: { usd: 450000 },
                  volume: { h24: 1200000 },
                  priceChange: { h1: 4.2, h24: 18.5 },
                  txns: { h1: { buys: 320, sells: 140 } },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return realFetch(input, init);
      })
    );

    // 2. Direct buy inside site (PAPER mode defaults)
    const buyRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/direct-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chainId: 'solana',
          tokenAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          symbol: 'BONK',
          priceUsd: 0.000028,
          amountUsd: 50,
        }),
      }),
      env
    );
    expect(buyRes.status).toBe(200);
    const buyJson = (await buyRes.json()) as { ok: boolean; mode: string; amountUsd: number; tradeId: string };
    expect(buyJson.ok).toBe(true);
    expect(buyJson.mode).toBe('PAPER');
    expect(buyJson.amountUsd).toBe(50);

    const cfgRow = await db.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?').bind('u_ovh1').first<{ paper_balance: number }>();
    expect(Number(cfgRow?.paper_balance)).toBe(9950);

    // 3. Smart Copy V2 returns 18+ profitable traders with category, 24h ROI & wallet holdings
    const scRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/smart-wallets', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(scRes.status).toBe(200);
    const scJson = (await scRes.json()) as {
      top10: Array<{
        roi_24h_pct: number;
        trader_category: string;
        wallet_holdings: Array<{ symbol: string; sharePct: number }>;
      }>;
    };
    expect(scJson.top10.length).toBeGreaterThanOrEqual(18);
    expect(typeof scJson.top10[0]?.roi_24h_pct).toBe('number');
    expect(['HOLDER', 'SCALPER', 'SWING', 'SNIPER']).toContain(scJson.top10[0]?.trader_category);
    expect(scJson.top10[0]?.wallet_holdings?.length).toBeGreaterThan(0);
    expect(scJson.top10[0]?.wallet_holdings[0]?.sharePct).toBeGreaterThan(0);

    // 4. Telegram Bot V11.6 commands: toggle bot, Smart Copy V2 filter, DEX AI & Direct Buy
    const tgCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('https://api.telegram.org/')) {
          const method = url.split('/').pop() || '';
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          tgCalls.push({ method, body });
          return new Response(JSON.stringify({ ok: true, result: { message_id: 500 + tgCalls.length } }), { status: 200 });
        }
        if (url.includes('dexscreener.com') || url.includes('geckoterminal.com')) {
          return new Response(
            JSON.stringify({
              pairs: [
                {
                  chainId: 'solana',
                  dexId: 'raydium',
                  pairAddress: 'pair_bonk_sol',
                  url: 'https://dexscreener.com/solana/pair_bonk_sol',
                  baseToken: { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', name: 'Bonk', symbol: 'BONK' },
                  quoteToken: { symbol: 'SOL' },
                  priceUsd: '0.000028',
                  liquidity: { usd: 450000 },
                  volume: { h24: 1200000 },
                  priceChange: { h1: 4.2, h24: 18.5 },
                  txns: { h1: { buys: 320, sells: 140 } },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return realFetch(input, init);
      })
    );

    // Bot start/stop toggle button
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 9001,
      message: {
        message_id: 501,
        from: { id: 77880011, first_name: 'کاربر', username: 'ovh_user1' },
        chat: { id: 77880011, type: 'private' },
        text: '🤖 شروع / توقف ربات',
      },
    });
    const toggleMsg = tgCalls.find((c) => c.method === 'sendMessage');
    expect(toggleMsg).toBeTruthy();

    // Smart Copy V2 callback
    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 9002,
      callback_query: {
        id: 'cq_sc_v2',
        from: { id: 77880011, first_name: 'کاربر', username: 'ovh_user1' },
        message: { message_id: 510, chat: { id: 77880011, type: 'private' } },
        data: 'tg_copy_smart_filter:HOLDER',
      },
    });
    expect(
      tgCalls.some(
        (c) =>
          (c.method === 'editMessageText' || c.method === 'sendMessage') &&
          String(c.body.text).includes('تریدرهای هوشمند و سبد ولت‌ها')
      )
    ).toBe(true);

    // DEX AI callback
    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 9003,
      callback_query: {
        id: 'cq_dex_ai',
        from: { id: 77880011, first_name: 'کاربر', username: 'ovh_user1' },
        message: { message_id: 511, chat: { id: 77880011, type: 'private' } },
        data: 'tg_dex_ai:solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      },
    });
    expect(tgCalls.some((c) => c.method === 'sendMessage' && String(c.body.text).includes('تحلیل'))).toBe(true);

    // DEX direct buy callback
    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 9004,
      callback_query: {
        id: 'cq_dex_buy',
        from: { id: 77880011, first_name: 'کاربر', username: 'ovh_user1' },
        message: { message_id: 512, chat: { id: 77880011, type: 'private' } },
        data: 'tg_dex_buy:solana:DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      },
    });
    expect(tgCalls.some((c) => c.method === 'sendMessage' && String(c.body.text).includes('خرید مستقیم'))).toBe(true);
  });
});
