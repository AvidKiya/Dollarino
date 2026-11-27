import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureUserDefaults } from '../auth.js';
import { signJwt } from '../crypto.js';
import { runAlwaysOnAiIntel } from '../engine/market-intel.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { shouldDeliverEngineSignalToUser } from '../telegram/publisher.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v119-overhaul',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_TOKEN_V119',
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

describe('Dollarino V11.9 Overhaul: Default-OFF Engines, Importance News Filter, Trust Wallet Scanner & Per-Engine Delivery', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v119-overhaul-db' },
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
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  it('starts fresh users with all trading engines OFF by default and rejects empty activeEngines on /bot/start', async () => {
    const env = makeEnv();
    const uid = 'usr_v119_defaults';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, risk_terms_accepted_at)
         VALUES (?, 'defaults@dollarino.test', 'v119_user', 'hash_test_v119', 'user', datetime('now'))`
      )
      .bind(uid)
      .run();

    await ensureUserDefaults(db, uid);

    const cfg = await db
      .prepare(
        `SELECT bot_state, active_engines_json, ai_gate_enabled, sniper_enabled, trading_mode_selected
         FROM bot_configs WHERE user_id = ?`
      )
      .bind(uid)
      .first<{
        bot_state: string;
        active_engines_json: string;
        ai_gate_enabled: number;
        sniper_enabled: number;
        trading_mode_selected: number;
      }>();

    expect(cfg).toBeTruthy();
    expect(cfg!.bot_state).toBe('STOPPED');
    expect(JSON.parse(cfg!.active_engines_json)).toEqual([]);
    expect(cfg!.ai_gate_enabled).toBe(0);
    expect(cfg!.sniper_enabled).toBe(0);

    const token = await signJwt({ sub: uid, role: 'user', email: 'defaults@dollarino.test' }, env.SESSION_JWT_SECRET);
    await db.prepare(`UPDATE bot_configs SET trading_mode_selected = 1 WHERE user_id = ?`).bind(uid).run();

    // Reject explicit empty engines list
    const badStart = await worker.fetch(
      new Request('https://dollarino.local/api/trading/bot/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tradingMode: 'PAPER', acceptRiskTerms: true, activeEngines: [] }),
      }),
      env
    );
    expect(badStart.status).toBe(400);
    const badJson = (await badStart.json()) as { code?: string };
    expect(badJson.code).toBe('NO_ACTIVE_ENGINE');

    // Allow explicit user selection of a single engine & record guide seen
    const guideRes = await worker.fetch(
      new Request('https://dollarino.local/api/trading/engines/guide-seen', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ engine: 'STRATEGY' }),
      }),
      env
    );
    expect(guideRes.status).toBe(200);
    const guideJson = (await guideRes.json()) as { ok: boolean; seenEngineGuides: string[] };
    expect(guideJson.ok).toBe(true);
    expect(guideJson.seenEngineGuides).toContain('STRATEGY');

    const goodStart = await worker.fetch(
      new Request('https://dollarino.local/api/trading/bot/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tradingMode: 'PAPER', acceptRiskTerms: true, activeEngines: ['STRATEGY'] }),
      }),
      env
    );
    expect(goodStart.status).toBe(200);

    const updatedCfg = await db
      .prepare(`SELECT active_engines_json, bot_state FROM bot_configs WHERE user_id = ?`)
      .bind(uid)
      .first<{ active_engines_json: string; bot_state: string }>();
    expect(updatedCfg!.bot_state).toBe('RUNNING_PAPER');
    expect(JSON.parse(updatedCfg!.active_engines_json)).toEqual(['STRATEGY']);
  });

  it('filters out low-impact routine crypto chatter in runAlwaysOnAiIntel unless high-impact keywords match', async () => {
    const env = makeEnv();
    const nowIso = new Date().toISOString();
    const oldNewsIso = new Date(Date.now() - 300 * 60_000).toISOString();

    for (const [k, v] of [
      ['always_on_ai_broadcast_enabled', 'true'],
      ['intel_last_ai_check_at', oldNewsIso],
      ['intel_last_alert_at', nowIso],
      ['intel_last_news_at', oldNewsIso],
      ['intel_last_analysis_at', nowIso],
      ['intel_last_edu_at', nowIso],
      ['intel_last_promo_at', nowIso],
      ['intel_last_news_titles', '[]'],
    ]) {
      await db
        .prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`)
        .bind(k, v)
        .run();
    }

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('cryptocompare.com')) {
        return new Response(
          JSON.stringify({
            Data: [
              { title: 'Altcoins drift slightly sideways in quiet Tuesday afternoon trading', source: 'RoutineNews' },
              { title: 'Developers publish minor UI theme tweak on community forum', source: 'ChatterWire' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('binance.com') && url.includes('ticker/24hr')) {
        return new Response(
          JSON.stringify([{ symbol: 'BTCUSDT', lastPrice: '92500', priceChangePercent: '1.10', highPrice: '93000', lowPrice: '91000', quoteVolume: '2500000000' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('klines')) {
        const candles = Array.from({ length: 80 }, (_, idx) => [
          1700000000000 + idx * 3600_000,
          '92000',
          '92600',
          '91800',
          String(92000 + (idx % 5) * 30),
          '150',
        ]);
        return new Response(JSON.stringify(candles), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const skipped = await runAlwaysOnAiIntel(env);
    expect(skipped.published).toBe(false);
    expect(skipped.reason).toBe('no_important_news');
  });

  it('returns Trust Wallet aligned markets, paginated Trust Wallet /scanner batches, and Trust Wallet portfolio summary', async () => {
    const env = makeEnv();
    const uid = 'usr_v119_scanner';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, trust_wallet_address)
         VALUES (?, 'scanner@dollarino.test', 'v119_scanner', 'hash_test_v119', 'user', '0x1111111111111111111111111111111111111111')`
      )
      .bind(uid)
      .run();
    await ensureUserDefaults(db, uid);
    const token = await signJwt({ sub: uid, role: 'user', email: 'scanner@dollarino.test' }, env.SESSION_JWT_SECRET);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('coingecko.com')) {
        return new Response(
          JSON.stringify([
            { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 92500, price_change_percentage_24h: 2.1, high_24h: 93200, low_24h: 90800, total_volume: 35000000000, market_cap: 1820000000000 },
            { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3350, price_change_percentage_24h: 1.8, high_24h: 3400, low_24h: 3280, total_volume: 18000000000, market_cap: 403000000000 },
            { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 215, price_change_percentage_24h: 4.3, high_24h: 220, low_24h: 204, total_volume: 6500000000, market_cap: 102000000000 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('klines')) {
        const candles = Array.from({ length: 120 }, (_, i) => [
          1700000000000 + i * 900_000,
          '100',
          '102',
          '99',
          String(100 + Math.sin(i / 6) * 2),
          '1000',
        ]);
        return new Response(JSON.stringify(candles), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('ticker/24hr')) {
        return new Response(
          JSON.stringify([
            { symbol: 'BTCUSDT', lastPrice: '92500', priceChangePercent: '2.1', highPrice: '93200', lowPrice: '90800', quoteVolume: '1000000000' },
            { symbol: 'ETHUSDT', lastPrice: '3350', priceChangePercent: '1.8', highPrice: '3400', lowPrice: '3280', quoteVolume: '800000000' },
            { symbol: 'SOLUSDT', lastPrice: '215', priceChangePercent: '4.3', highPrice: '220', lowPrice: '204', quoteVolume: '500000000' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('eth_getBalance') || url.includes('rpc') || url.includes('llamarpc') || url.includes('publicnode')) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    const mktsRes = await worker.fetch(
      new Request('https://dollarino.local/api/trading/markets', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(mktsRes.status).toBe(200);
    const mktsJson = (await mktsRes.json()) as { markets: Array<{ symbol: string; category?: string; chains?: string[] }> };
    expect(mktsJson.markets.length).toBeGreaterThan(20);
    const btcMkt = mktsJson.markets.find((m) => m.symbol === 'BTCUSDT');
    expect(btcMkt?.category).toBeTruthy();

    // Paginated Trust Wallet Scanner
    const scan1 = await worker.fetch(
      new Request('https://dollarino.local/api/trading/scanner', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offset: 0, limit: 6, category: 'MEME' }),
      }),
      env
    );
    expect(scan1.status).toBe(200);
    const scanJson = (await scan1.json()) as {
      totalMarkets: number;
      hasMore: boolean;
      results: Array<{ symbol: string; category?: string }>;
    };
    expect(scanJson.totalMarkets).toBeGreaterThanOrEqual(scanJson.results.length);
    expect(scanJson.results.length).toBeGreaterThan(0);
    expect(scanJson.results.every((r) => r.category === 'MEME')).toBe(true);

    // Trust Wallet live portfolio endpoint
    const pfRes = await worker.fetch(
      new Request('https://dollarino.local/api/trustwallet/portfolio', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(pfRes.status).toBe(200);
    const pfJson = (await pfRes.json()) as { ok: boolean; connected: boolean; totalUsd: number; holdings: unknown[] };
    expect(pfJson.ok).toBe(true);
    expect(pfJson.connected).toBe(true);
    expect(Array.isArray(pfJson.holdings)).toBe(true);
  });

  it('enforces per-engine, confidence, sniper safety, and direction filters in shouldDeliverEngineSignalToUser', () => {
    const prefs = JSON.stringify({
      signals: true,
      dex_sniper: true,
      signalDelivery: {
        signalEngines: {
          CENTRAL_AI: true,
          MY_AI: false,
          STRATEGY: true,
          COPY_TRADE: false,
          LISTING_SNIPER: true,
        },
        channels: { telegramBot: true, inApp: true, channelSignals: true },
        minConfidence: 75,
        minSniperSafety: 80,
        directionFilter: 'LONG_ONLY',
        quietHoursEnabled: false,
      },
    });

    // Allowed: CENTRAL_AI LONG with confidence 82%
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'CENTRAL_AI',
        direction: 'LONG',
        confidence: 82,
      })
    ).toBe(true);

    // Blocked: Direction SHORT when LONG_ONLY
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'CENTRAL_AI',
        direction: 'SHORT',
        confidence: 88,
      })
    ).toBe(false);

    // Blocked: Engine COPY_TRADE disabled
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'COPY_TRADE',
        direction: 'LONG',
        confidence: 92,
      })
    ).toBe(false);

    // Blocked: Confidence below 75%
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'STRATEGY',
        direction: 'LONG',
        confidence: 65,
      })
    ).toBe(false);

    // Blocked: Sniper safety below 80
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'LISTING_SNIPER',
        direction: 'LONG',
        confidence: 90,
        safetyScore: 72,
      })
    ).toBe(false);

    // Allowed: Sniper safety >= 80
    expect(
      shouldDeliverEngineSignalToUser(prefs, {
        engine: 'LISTING_SNIPER',
        direction: 'LONG',
        confidence: 88,
        safetyScore: 86,
      })
    ).toBe(true);
  });

  it('serves live-proof backtests, 30-day wallet ledger, channel signal previews, and public wallet audit lookup', async () => {
    const env = makeEnv();
    const uid = 'usr_v119_audit30d';
    const wallet = '0x8f3a1234567890abcdef1234567890abcd7b4e9c';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, trust_wallet_address, trust_wallet_verified)
         VALUES (?, 'audit_secret@dollarino.test', 'audit_hidden', 'hash_test_v119', 'user', ?, 1)`
      )
      .bind(uid, wallet)
      .run();
    await ensureUserDefaults(db, uid);

    await db
      .prepare(
        `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, tp1_hit, status, engine_source, engine_label, raw_text)
         VALUES ('sig_pub_1', ?, 'AI', 'BTCUSDT', 'LONG', '4h', '92450', '90900', 10, '94200', '95800', '97500', 1, 'EXECUTED', 'CENTRAL_AI', 'هوش مصنوعی', 'Breakout confirmed')`
      )
      .bind(uid)
      .run();

    await db
      .prepare(
        `INSERT INTO trades (id, user_id, signal_id, mode, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, fees_paid, exit_reason, client_id, opened_at, closed_at)
         VALUES ('trd_pub_win', ?, 'sig_pub_1', 'LIVE', 'trustwallet', 'BTCUSDT', 'ai_autonomous_agent', 'LONG', 'CLOSED', '92000', '94200', '0.1', '0', 10, '920', '92000', '90500', '94200', '220.5', '1.8', 'TP1', 'cl_pub_1', datetime('now', '-2 days'), datetime('now', '-1 days'))`
      )
      .bind(uid)
      .run();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('klines')) {
        const candles = Array.from({ length: 260 }, (_, i) => [
          1700000000000 + i * 900_000,
          '100',
          '103',
          '98.5',
          String(100 + Math.sin(i / 5) * 4 + i * 0.02),
          '1500',
        ]);
        return new Response(JSON.stringify(candles), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    const proofRes = await worker.fetch(new Request('https://dollarino.local/api/public/live-proof'), env);
    expect(proofRes.status).toBe(200);
    const proofText = await proofRes.text();
    // Must NEVER leak private email or username
    expect(proofText).not.toContain('audit_secret@dollarino.test');
    expect(proofText).not.toContain('audit_hidden');

    const proofJson = JSON.parse(proofText) as {
      ok: boolean;
      platformStats: { totalSignals: number; liveClosedTrades30d: number; liveWinRate30dPct: number };
      liveStrategyBacktests: Array<{ strategyKey: string; winRatePct: number; totalTrades: number }>;
      channelSignals: Array<{ id: string; symbol: string; tp1Hit: boolean }>;
      wallet30dLedger: Array<{ auditId: string; walletAddress: string; winRate30d: number; netPnlUsd30d: number }>;
    };
    expect(proofJson.ok).toBe(true);
    expect(proofJson.platformStats.totalSignals).toBeGreaterThanOrEqual(1);
    expect(proofJson.platformStats.liveClosedTrades30d).toBe(1);
    expect(proofJson.platformStats.liveWinRate30dPct).toBe(100);
    expect(proofJson.liveStrategyBacktests.length).toBeGreaterThanOrEqual(1);
    expect(proofJson.channelSignals.some((s) => s.id === 'sig_pub_1' && s.tp1Hit)).toBe(true);
    const ledgerRow = proofJson.wallet30dLedger.find((w) => w.walletAddress === wallet);
    expect(ledgerRow).toBeTruthy();
    expect(ledgerRow!.netPnlUsd30d).toBe(220.5);

    // Public lookup by wallet address
    const lookupRes = await worker.fetch(
      new Request(`https://dollarino.local/api/public/verify-wallet?q=${wallet}`),
      env
    );
    expect(lookupRes.status).toBe(200);
    const lookupJson = (await lookupRes.json()) as {
      found: boolean;
      kind: string;
      mode: string;
      summary30d: { tradesCount: number; winRatePct: number; netPnlUsd: number };
      recentTrades: Array<{ id: string; pnlUsd: number }>;
    };
    expect(lookupJson.found).toBe(true);
    expect(lookupJson.kind).toBe('WALLET_30D');
    expect(lookupJson.mode).toBe('LIVE');
    expect(lookupJson.summary30d.tradesCount).toBe(1);
    expect(lookupJson.summary30d.winRatePct).toBe(100);
    expect(lookupJson.summary30d.netPnlUsd).toBe(220.5);
    expect(lookupJson.recentTrades[0]?.id).toBe('trd_pub_win');
  });
});
