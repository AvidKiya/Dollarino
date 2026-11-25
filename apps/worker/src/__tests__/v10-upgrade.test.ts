import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateIndicatorAlertRule, TRADINGVIEW_INDICATOR_CATALOG } from '@dollarino/core';
import type { Env } from '../env.js';
import worker from '../index.js';
import { recordProfitShareServerFee } from '../services/server-fee.js';
import { evaluateTradingViewFreeAlerts } from '../routes/webhooks.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v10-upgrade',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:TEST_V10_BOT_TOKEN',
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

async function issueUserToken(env: Env, userId: string, tgId: string, role: 'owner' | 'user' = 'user'): Promise<string> {
  const magic = `tglm_${userId}_${Date.now()}_${Math.random()}`;
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE users SET role = ?, web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`
      )
      .bind(role, magic, userId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001199', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(userId, `${userId}@dollarino.local`, `v10_${userId}`, role, tgId, magic)
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
  const json = (await res.json()) as { token: string };
  return json.token;
}

describe('Dollarino V10: Zero Sub, 5% Profit Fee, $10 Live Min, 25+ Free TV Alerts & 5 Channels', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'dollarino-v10-test-db' },
    });
    db = await mf.getD1Database('DB');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(__dirname, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
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
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('nobitex.ir')) {
        return new Response(JSON.stringify({ status: 'ok', stats: { 'usdt-rls': { latest: '765000' } } }), { status: 200 });
      }
      if (url.includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 901, status: 'administrator', can_post_messages: true } }), { status: 200 });
      }
      if (url.includes('bsc-dataseed')) {
        // Low balance ($3.00 USDT / 0.004 BNB) or high balance ($25 USDT) controlled per address
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }), { status: 200 });
      }
      if (url.includes('klines')) {
        const candles = Array.from({ length: 120 }, (_, i) => [
          Date.now() - (120 - i) * 900_000,
          '90000',
          '91200',
          '89500',
          String(90000 - i * 40),
          '150',
          0,
          '1000',
        ]);
        return new Response(JSON.stringify(candles), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  });

  it('serves V10 /api/health, live USDT/IRR/IRT rate, and zero paid subscriptions', async () => {
    const env = makeEnv();
    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as {
      version: string;
      paidSubscriptions: boolean;
      profitShareFeePct: number;
      trustWalletOnly: boolean;
      minLiveBalanceUsd: number;
      demoSimulatorUsd: number;
      freeTradingViewAlerts: boolean;
    };
    expect(health.version).toBe('11.0.0');
    expect(health.paidSubscriptions).toBe(false);
    expect(health.profitShareFeePct).toBe(3);
    expect(health.trustWalletOnly).toBe(true);
    expect(health.minLiveBalanceUsd).toBe(10);
    expect(health.demoSimulatorUsd).toBe(10000);
    expect(health.freeTradingViewAlerts).toBe(true);

    const rateRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/usdt-irt-rate'), env);
    expect(rateRes.status).toBe(200);
    const rate = (await rateRes.json()) as { usdtIrr: number; usdtIrt: number };
    expect(rate.usdtIrt).toBeGreaterThan(10000);
    expect(rate.usdtIrr).toBe(rate.usdtIrt * 10);
  });

  it('charges 0% on PAPER & LIVE losses and records exact 5% server fee strictly on LIVE profit', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v10_fee', '9001001');

    // 1. PAPER profit -> $0 fee
    const rPaper = await recordProfitShareServerFee(db, {
      userId: 'usr_v10_fee',
      tradeId: 'trd_paper_1',
      mode: 'PAPER',
      source: 'PERP_LIVE',
      symbol: 'BTCUSDT',
      realizedPnlUsd: 250,
    });
    expect(rPaper.recorded).toBe(false);
    expect(rPaper.feeUsd).toBe(0);

    // 2. LIVE loss -> $0 fee
    const rLoss = await recordProfitShareServerFee(db, {
      userId: 'usr_v10_fee',
      tradeId: 'trd_live_loss_1',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: -80,
    });
    expect(rLoss.recorded).toBe(false);
    expect(rLoss.feeUsd).toBe(0);

    // 3. First 3 LIVE profitable trades are 0% FREE TRIAL; 4th LIVE profit (+$125) -> 3% = $3.75 fee accrued!
    for (let i = 1; i <= 3; i++) {
      const freeWin = await recordProfitShareServerFee(db, {
        userId: 'usr_v10_fee',
        tradeId: `trd_live_free_${i}`,
        mode: 'LIVE',
        source: 'PERP_LIVE',
        symbol: 'BTCUSDT',
        realizedPnlUsd: 25,
      });
      expect(freeWin.freeTrialUsed).toBe(true);
      expect(freeWin.feeUsd).toBe(0);
    }

    const rWin = await recordProfitShareServerFee(db, {
      userId: 'usr_v10_fee',
      tradeId: 'trd_live_win_1',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'SOLUSDT',
      realizedPnlUsd: 125,
    });
    expect(rWin.recorded).toBe(true);
    expect(rWin.feeUsd).toBeCloseTo(3.75, 4);

    // 4. Ledger endpoint + settlement
    const ledgerRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(ledgerRes.status).toBe(200);
    const ledger = (await ledgerRes.json()) as {
      feePct: number;
      accruedFeeUsd: number;
      entries: Array<{ id: string; status: string }>;
    };
    expect(ledger.feePct).toBe(3);
    expect(ledger.accruedFeeUsd).toBeCloseTo(3.75, 2);
    expect(ledger.entries.length).toBe(4); // 3 FREE_TRIAL + 1 ACCRUED

    const settleRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees/settle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' }),
      }),
      env
    );
    expect(settleRes.status).toBe(200);
    const settleJson = (await settleRes.json()) as { ok: boolean; settledCount: number };
    expect(settleJson.ok).toBe(true);
    expect(settleJson.settledCount).toBe(1);
  });

  it('enforces $10 USD minimum live Trust Wallet balance while keeping $10,000 Demo Simulator free', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v10_min10', '9001002');

    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }),
      }),
      env
    );

    // RPC mock returns 0 balance -> switching view to LIVE is allowed with readyToTrade=false & warningCode=MIN_BALANCE_10_USD,
    // and starting the bot in LIVE mode enforces 400 MIN_BALANCE_10_USD
    const liveAttempt = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'LIVE', executionMode: 'AUTO' }),
      }),
      env
    );
    expect(liveAttempt.status).toBe(200);
    const modeJson = (await liveAttempt.json()) as { ok: boolean; liveReady: boolean; warningCode: string; minRequiredUsd: number };
    expect(modeJson.ok).toBe(true);
    expect(modeJson.liveReady).toBe(false);
    expect(modeJson.warningCode).toBe('MIN_BALANCE_10_USD');
    expect(modeJson.minRequiredUsd).toBe(10);

    const startLiveAttempt = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyKey: 'dollarino_ai' }),
      }),
      env
    );
    expect(startLiveAttempt.status).toBe(400);
    const errJson = (await startLiveAttempt.json()) as { code: string; minRequiredUsd: number };
    expect(errJson.code).toBe('MIN_BALANCE_10_USD');
    expect(errJson.minRequiredUsd).toBe(10);

    // Switching to PAPER ($10,000 Demo Simulator) succeeds freely
    const demoAttempt = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'PAPER', executionMode: 'AUTO' }),
      }),
      env
    );
    expect(demoAttempt.status).toBe(200);
  });

  it('ships 25+ free TradingView indicators, free alert CRUD, webhook ingestion & config reset-defaults', async () => {
    expect(TRADINGVIEW_INDICATOR_CATALOG.length).toBeGreaterThanOrEqual(25);
    const candles = Array.from({ length: 120 }, (_, i) => ({
      timestamp: Date.now() - (120 - i) * 60_000,
      open: 100,
      high: 102,
      low: 98,
      close: 120 - i * 0.5, // falling prices trigger oversold RSI
      volume: 1000,
    }));
    const evalRsi = evaluateIndicatorAlertRule({
      ruleId: 'RSI_OVERSOLD',
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
    });
    expect(typeof evalRsi.triggered).toBe('boolean');

    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v10_tv', '9001003');

    const indRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/indicators', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(indRes.status).toBe(200);
    const indJson = (await indRes.json()) as { indicators: unknown[]; alertTemplates: unknown[] };
    expect(indJson.indicators.length).toBeGreaterThanOrEqual(25);
    expect(indJson.alertTemplates.length).toBeGreaterThan(10);

    // Create a free TV indicator alert
    const createRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/alerts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '15m', indicatorId: 'RSI_OVERSOLD', autoTrade: false }),
      }),
      env
    );
    expect(createRes.status).toBe(201);

    const evalStats = await evaluateTradingViewFreeAlerts(env);
    expect(evalStats.checked).toBeGreaterThanOrEqual(1);

    // Reset defaults endpoint works cleanly
    const resetRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config/reset-defaults', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(resetRes.status).toBe(200);
    const resetJson = (await resetRes.json()) as { ok: boolean; config: { trading_mode: string; max_leverage: number } };
    expect(resetJson.ok).toBe(true);
    expect(resetJson.config.trading_mode).toBe('PAPER');
  });

  it('supports 5-channel Telegram admin status & live channel test broadcast', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v10_owner', '944021185', 'owner');

    const chStatus = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/telegram/channel-status', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(chStatus.status).toBe(200);
    const stJson = (await chStatus.json()) as { ok: boolean; channels: Record<string, { target: string; enabled: boolean }> };
    expect(Object.keys(stJson.channels).length).toBe(6);
    expect(stJson.channels.community).toBeTruthy();

    const chTest = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelKey: 'alerts' }),
      }),
      env
    );
    expect(chTest.status).toBe(200);
    const testJson = (await chTest.json()) as { ok: boolean; messageId: number };
    expect(testJson.ok).toBe(true);
    expect(testJson.messageId).toBe(901);
  });

  it('enforces 5% profit-fee grace limit, late penalty, LIVE lock & prepaid credit auto-deduct', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_v10_enforce', '9001099');
    const ownerToken = await issueUserToken(env, 'usr_v10_owner_enf', '944021199', 'owner');

    // Connect wallet
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }),
      }),
      env
    );

    // Reject junk TX hash (anti-cheat format validation)
    const badTx = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees/settle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: 'fake_junk_hash_123456' }),
      }),
      env
    );
    expect(badTx.status).toBe(400);

    // Consume the 3 free profitable LIVE trial trades first, then record large LIVE profit -> $18.00 fee at 3% (>2.5x $2 grace cap -> immediate LOCKED + 25% late penalty = $4.50)
    for (let i = 1; i <= 3; i++) {
      await recordProfitShareServerFee(db, {
        userId: 'usr_v10_enforce',
        tradeId: `trd_enf_free_${i}`,
        mode: 'LIVE',
        source: 'PERP_LIVE',
        symbol: 'BTCUSDT',
        realizedPnlUsd: 20,
      });
    }
    await recordProfitShareServerFee(db, {
      userId: 'usr_v10_enforce',
      tradeId: 'trd_big_win_lock',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'BTCUSDT',
      realizedPnlUsd: 600,
    });

    // Attempting to enter LIVE mode now MUST fail with 402 FEE_SETTLEMENT_REQUIRED
    const blockedLive = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'LIVE', executionMode: 'AUTO' }),
      }),
      env
    );
    expect(blockedLive.status).toBe(402);
    const blockedJson = (await blockedLive.json()) as { code: string; enforcement: { penaltyUsd: number; totalDueUsd: number; lockStatus: string } };
    expect(blockedJson.code).toBe('FEE_SETTLEMENT_REQUIRED');
    expect(blockedJson.enforcement.lockStatus).toBe('LOCKED');
    expect(blockedJson.enforcement.penaltyUsd).toBeCloseTo(4.5, 2);

    // Demo Simulator ($10K) remains completely unlocked!
    const demoOk = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'PAPER', executionMode: 'AUTO' }),
      }),
      env
    );
    expect(demoOk.status).toBe(200);

    // Submit real formatted TX while locked -> enters PENDING_VERIFY, then Admin approves + unlocks
    const validSettle = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees/settle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      }),
      env
    );
    expect(validSettle.status).toBe(200);
    const settleData = (await settleDataJson(validSettle)) as { status: string };
    expect(settleData.status).toBe('PENDING_VERIFY');

    // Admin approves settlement & grants $5 prepaid credit
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/admin/server-fees/usr_v10_enforce/action', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE_SETTLEMENT' }),
      }),
      env
    );
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/admin/server-fees/usr_v10_enforce/action', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GRANT_CREDIT', amountUsd: 5 }),
      }),
      env
    );

    // Next LIVE winning trade (+$80 -> 3% = $2.40) auto-deducts directly from $5 prepaid credit!
    const prepaidFee = await recordProfitShareServerFee(db, {
      userId: 'usr_v10_enforce',
      tradeId: 'trd_prepaid_win',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: 80,
    });
    expect(prepaidFee.paidFromCredit).toBe(true);
    expect(prepaidFee.feeUsd).toBeCloseTo(2.4, 2);
  });

  it('supports fresh owner bootstrap, real chronological dashboard equityCurve, Hyperliquid agent routing, and production readiness checks', async () => {
    const env = makeEnv();
    await db.prepare('DELETE FROM users').run();

    // 1. Fresh DB enforces Telegram-only signup on /register while allowing secure /bootstrap-owner with instance secret
    const directReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'founder@dollarino.io', username: 'founder', password: 'Password123!' }),
      }),
      env
    );
    expect(directReg.status).toBe(403);

    const firstReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/bootstrap-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'founder@dollarino.io',
          username: 'founder',
          password: 'Password123!',
          bootstrapSecret: env.SESSION_JWT_SECRET,
        }),
      }),
      env
    );
    expect(firstReg.status).toBe(201);
    const firstJson = (await firstReg.json()) as { token: string; user: { id: string; role: string } };
    expect(firstJson.user.role).toBe('owner');

    const secondBootstrap = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/bootstrap-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'second@dollarino.io',
          username: 'second',
          password: 'Password123!',
          bootstrapSecret: env.SESSION_JWT_SECRET,
        }),
      }),
      env
    );
    expect(secondBootstrap.status).toBe(403);

    // 2. Insert real closed trades & confirm GET /api/trading/dashboard emits chronological equityCurve (no dummy zigzag)
    await db
      .prepare(
        `INSERT INTO trades (id, user_id, client_id, mode, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, opened_at, closed_at)
         VALUES (?, ?, 'cid_eq_1', 'PAPER', 'paper', 'BTCUSDT', 'dollarino_v01', 'LONG', 'CLOSED', '90000', '92000', '0.1', '0', 10, '900', '88000', '88000', '92000', '200.00', '2026-11-18 10:00:00', '2026-11-18 12:00:00')`
      )
      .bind('trd_eq_1', firstJson.user.id)
      .run();

    const dashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${firstJson.token}` },
      }),
      env
    );
    expect(dashRes.status).toBe(200);
    const dash = (await dashRes.json()) as {
      charts: { equityCurve?: Array<{ time: number; label: string; equity: number }> };
    };
    expect(Array.isArray(dash.charts.equityCurve)).toBe(true);
    expect((dash.charts.equityCurve?.length ?? 0) >= 3).toBe(true);

    // 3. Admin system-health detects placeholder TRC20 wallet, then flips to green once real wallet configured
    const h1Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/system-health', {
        headers: { Authorization: `Bearer ${firstJson.token}` },
      }),
      env
    );
    expect(h1Res.status).toBe(200);
    const h1 = (await h1Res.json()) as {
      health: { productionChecks?: { feeReceiverWalletConfigured: boolean; jwtSecretOk: boolean; allowLiveTrading: boolean } };
    };
    expect(h1.health.productionChecks?.jwtSecretOk).toBe(true);
    expect(h1.health.productionChecks?.allowLiveTrading).toBe(true);
    expect(h1.health.productionChecks?.feeReceiverWalletConfigured).toBe(false);

    // Real wallet configured + check /api/subscriptions/server-fees strips placeholder
    const feeList1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/server-fees', {
        headers: { Authorization: `Bearer ${firstJson.token}` },
      }),
      env
    );
    const feeListJson1 = (await feeList1.json()) as { receivers: Record<string, string> };
    expect(feeListJson1.receivers.usdt_trc20_wallet).toBeUndefined();

    await db
      .prepare(`UPDATE system_settings SET value = 'TXYZ123456789012345678901234567890' WHERE key = 'usdt_trc20_wallet'`)
      .run();

    const h2Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/system-health', {
        headers: { Authorization: `Bearer ${firstJson.token}` },
      }),
      env
    );
    const h2 = (await h2Res.json()) as {
      health: { productionChecks?: { feeReceiverWalletConfigured: boolean } };
    };
    expect(h2.health.productionChecks?.feeReceiverWalletConfigured).toBe(true);

    // 4. Hyperliquid Agent Wallet auto-routes LIVE adapter to HyperliquidPerpAdapter instead of PaperExchangeAdapter
    const { encryptVaultJson } = await import('../crypto.js');
    const encSecret = await encryptVaultJson(
      { agentPrivateKey: '1111111111111111111111111111111111111111111111111111111111111111' },
      env.MASTER_ENCRYPTION_KEY
    );
    await db
      .prepare(
        `INSERT INTO perp_dex_connections (id, user_id, venue, master_address, agent_address, encrypted_agent_secret, is_active)
         VALUES ('perp_hl_1', ?, 'hyperliquid', '0x1234567890123456789012345678901234567890', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ?, 1)`
      )
      .bind(firstJson.user.id, encSecret)
      .run();

    const { resolveUserExchangeAdapter } = await import('../exchanges/factory.js');
    const resolved = await resolveUserExchangeAdapter(env, firstJson.user.id);
    expect(resolved.provider).toBe('hyperliquid');
  });

  it('V10.2 enforces non-withdrawable referral fee-credits gated by unique wallet, >=$10 balance, and real LIVE trading', async () => {
    const env = makeEnv();
    await db.exec(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('telegram_only_signup', 'false'), ('allow_direct_email_signup', 'true');`);

    // 1. Register Referrer & connect Trust Wallet A
    const refReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.10',
          'User-Agent': 'ReferrerPhone/1.0',
        },
        body: JSON.stringify({
          email: 'referrer_v102@dollarino.test',
          username: 'RefMaster',
          password: 'password123',
        }),
      }),
      env
    );
    expect(refReg.status).toBe(201);
    const refData = (await refReg.json()) as { token: string; user: { id: string; referral_code: string } };
    const sharedWallet = '0x9999999999999999999999999999999999999999';
    await db.prepare(`UPDATE users SET phone_verified = 1 WHERE id = ?`).bind(refData.user.id).run();

    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${refData.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: sharedWallet }),
      }),
      env
    );

    const refInfo = (await (
      await worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/referrals', {
          headers: { Authorization: `Bearer ${refData.token}` },
        }),
        env
      )
    ).json()) as { referralCode: string; nonWithdrawable: boolean; minFriendBalanceUsd: number };
    expect(refInfo.nonWithdrawable).toBe(true);
    expect(refInfo.minFriendBalanceUsd).toBe(10);
    expect(refInfo.referralCode).toMatch(/^DLR[A-Z]{5}$/);

    // 2. Fake alt account registers from DIFFERENT IP/UA, then tries connecting SAME Trust Wallet -> flagged!
    const fakeReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.77',
          'User-Agent': 'AltDevice/2.0',
        },
        body: JSON.stringify({
          email: 'altwallet@dollarino.test',
          username: 'AltWallet',
          password: 'password123',
          referralCode: refInfo.referralCode,
        }),
      }),
      env
    );
    expect(fakeReg.status).toBe(201);
    const fakeData = (await fakeReg.json()) as { token: string; user: { id: string } };

    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${fakeData.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: sharedWallet }),
      }),
      env
    );

    const fakeRow = await db
      .prepare(`SELECT status, fraud_flag, fraud_reason FROM referrals WHERE referred_user_id = ?`)
      .bind(fakeData.user.id)
      .first<{ status: string; fraud_flag: number; fraud_reason: string }>();
    expect(fakeRow?.status).toBe('FLAGGED_DUPLICATE');
    expect(fakeRow?.fraud_flag).toBe(1);
    expect(fakeRow?.fraud_reason).toBe('SHARED_TRUST_WALLET_SELF_REFERRAL');

    // Even if fake wallet tries recording LIVE profit, flagged referral NEVER unlocks credits
    await db
      .prepare(`UPDATE users SET wallet_balance_usdt = 50 WHERE id = ?`)
      .bind(fakeData.user.id)
      .run();
    await recordProfitShareServerFee(db, {
      userId: fakeData.user.id,
      tradeId: 'trd_fake_1',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'BTCUSDT',
      realizedPnlUsd: 20,
      tradeAmountUsd: 30,
    });
    const refAfterFake = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = ?`)
      .bind(refData.user.id)
      .first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(refAfterFake?.fee_prepaid_credit_usd ?? 0)).toBe(0);

    // 3. Legitimate friend (different IP/UA/wallet)
    const legReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.88',
          'User-Agent': 'RealFriend/9.0',
        },
        body: JSON.stringify({
          email: 'realfriend@dollarino.test',
          username: 'RealFriend',
          password: 'password123',
          referralCode: refInfo.referralCode,
        }),
      }),
      env
    );
    expect(legReg.status).toBe(201);
    const legData = (await legReg.json()) as { token: string; user: { id: string } };
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${legData.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: '0x7777777777777777777777777777777777777777' }),
      }),
      env
    );

    // 3a. Friend has only $4 balance (< $10) -> does NOT unlock referral fee credit
    await db.prepare(`UPDATE users SET wallet_balance_usdt = 4 WHERE id = ?`).bind(legData.user.id).run();
    await recordProfitShareServerFee(db, {
      userId: legData.user.id,
      tradeId: 'trd_leg_small',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: 5,
      tradeAmountUsd: 5,
    });
    const refAfterSmall = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = ?`)
      .bind(refData.user.id)
      .first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(refAfterSmall?.fee_prepaid_credit_usd ?? 0)).toBe(0);

    // 3b. Note: trd_leg_small (at $4 balance) already consumed free-trial slot #1!
    // Deposit >= $10 ($25), close slots #2 and #3 (0% fee), then slot #4 (+$15 profit -> 3% = $0.45 fee)
    await db.prepare(`UPDATE users SET wallet_balance_usdt = 25 WHERE id = ?`).bind(legData.user.id).run();
    for (let i = 1; i <= 2; i++) {
      await recordProfitShareServerFee(db, {
        userId: legData.user.id,
        tradeId: `trd_leg_free_${i}`,
        mode: 'LIVE',
        source: 'PERP_LIVE',
        symbol: 'BTCUSDT',
        realizedPnlUsd: 10,
        tradeAmountUsd: 15,
      });
    }
    await recordProfitShareServerFee(db, {
      userId: legData.user.id,
      tradeId: 'trd_leg_real',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'BTCUSDT',
      realizedPnlUsd: 15,
      tradeAmountUsd: 15,
    });

    const refFinal = await db
      .prepare(`SELECT fee_prepaid_credit_usd, referral_balance_usd FROM users WHERE id = ?`)
      .bind(refData.user.id)
      .first<{ fee_prepaid_credit_usd: number; referral_balance_usd: number }>();
    const legFinal = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = ?`)
      .bind(legData.user.id)
      .first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(refFinal?.fee_prepaid_credit_usd ?? 0)).toBeCloseTo(2.09, 2); // $2.00 unlock + $0.09 (20% of $0.45)
    expect(Number(refFinal?.referral_balance_usd ?? 0)).toBe(0); // NEVER cash-withdrawable!
    expect(Number(legFinal?.fee_prepaid_credit_usd ?? 0)).toBeCloseTo(0.55, 2); // $1.00 welcome unlocked on free trade 1 - $0.45 deducted on trade 4!

    // 3c. Next LIVE winning trade (+$15 -> 3% = $0.45) auto-deducts from friend's remaining $0.55 welcome credit!
    const secondTrade = await recordProfitShareServerFee(db, {
      userId: legData.user.id,
      tradeId: 'trd_leg_real_2',
      mode: 'LIVE',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: 15,
      tradeAmountUsd: 15,
    });
    expect(secondTrade.paidFromCredit).toBe(true);
    expect(secondTrade.feeUsd).toBeCloseTo(0.45, 2);

    const refAfterSecond = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = ?`)
      .bind(refData.user.id)
      .first<{ fee_prepaid_credit_usd: number }>();
    const legAfterSecond = await db
      .prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = ?`)
      .bind(legData.user.id)
      .first<{ fee_prepaid_credit_usd: number }>();
    expect(Number(refAfterSecond?.fee_prepaid_credit_usd ?? 0)).toBeCloseTo(2.18, 2); // +$0.09 (20% of $0.45)
    expect(Number(legAfterSecond?.fee_prepaid_credit_usd ?? 0)).toBeCloseTo(0.10, 2); // $0.55 - $0.45 = $0.10 left

    // 4. Attempting cash withdrawal of fee credits is blocked with NON_WITHDRAWABLE_FEE_CREDIT
    const wdBlocked = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        headers: { Authorization: `Bearer ${refData.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: 10,
          network: 'BEP20',
          walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        }),
      }),
      env
    );
    expect(wdBlocked.status).toBe(400);
    const wdBody = (await wdBlocked.json()) as { code?: string };
    expect(wdBody.code).toBe('NON_WITHDRAWABLE_FEE_CREDIT');
  });

  it('V10.4 serves pre-signup founder transparency profile and allows owner identity & photo updates via admin API', async () => {
    const env = makeEnv();
    const pubBefore = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/creator'), env);
    expect(pubBefore.status).toBe(200);
    const pubJsonBefore = (await pubBefore.json()) as {
      creator: { nameEn: string };
      founderProfile: { fullNameEn: string; telegram: string; showPublic: boolean };
    };
    expect(pubJsonBefore.founderProfile.fullNameEn).toBe('Avid Kiya');
    expect(pubJsonBefore.founderProfile.telegram).toBe('@avidkiya');
    expect(pubJsonBefore.founderProfile.showPublic).toBe(true);

    const userToken = await issueUserToken(env, 'usr_v104_std', '9001040', 'user');
    const denied = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/founder-profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hacker@evil.com' }),
      }),
      env
    );
    expect(denied.status).toBe(403);

    const ownerToken = await issueUserToken(env, 'usr_v104_owner', '944021185', 'owner');
    const badPhoto = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/founder-profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: 'javascript:alert(1)' }),
      }),
      env
    );
    expect(badPhoto.status).toBe(400);

    const validSave = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/founder-profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'avid.verified@gmail.com',
          phone: '+98 912 111 2233',
          addressFa: 'تهران، دفتر فنی دلارینو',
          photoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
          showPublic: true,
        }),
      }),
      env
    );
    expect(validSave.status).toBe(200);

    const pubAfter = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/founder-profile'), env);
    expect(pubAfter.status).toBe(200);
    const afterJson = (await pubAfter.json()) as {
      founderProfile: { email: string; phone: string; addressFa: string; photoUrl: string };
    };
    expect(afterJson.founderProfile.email).toBe('avid.verified@gmail.com');
    expect(afterJson.founderProfile.phone).toBe('+98 912 111 2233');
    expect(afterJson.founderProfile.addressFa).toBe('تهران، دفتر فنی دلارینو');
    expect(afterJson.founderProfile.photoUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});

async function settleDataJson(res: Response) {
  return res.json();
}
