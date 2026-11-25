import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import worker from '../index.js';
import { getCachedPublicCopyTraders, getCachedSystemSetting } from '../services/settings-cache.js';
import { publishSignalBroadcast } from '../telegram/publisher.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v115-upgrade',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_FALLBACK_TOKEN_V115',
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
      .bind(userId, `${userId}@dollarino.local`, `v115_${userId}`, role, tgId, magic)
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

describe('Dollarino V11.5 Upgrade Suite: Zero Subscriptions, Signal Controls, D1 Backup/Restore/Wipe & Optimization', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'dollarino-test-v115' },
    });
    db = await mf.getD1Database('DB');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(__dirname, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        try {
          await db.prepare(stmt).run();
        } catch {
          // Ignore idempotent duplicate ALTER/CREATE in clean test run
        }
      }
    }
  });

  afterAll(async () => {
    vi.stubGlobal('fetch', realFetch);
    await mf.dispose();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', realFetch);
  });

  it('eliminates 402 subscription locks and provides lightweight ?lite=1 dashboard fast path', async () => {
    const env = makeEnv();
    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { version: string; paidSubscriptions: boolean };
    expect(healthJson.version).toBe('11.5.0');
    expect(healthJson.paidSubscriptions).toBe(false);

    const userToken = await issueUserToken(env, 'usr_v115_free', '11500001', 'user');

    // No subscription row at all -> status says subscriptionRequired: false
    const subStatusRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/me', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(subStatusRes.status).toBe(200);
    const subJson = (await subStatusRes.json()) as {
      entitlement?: {
        hasPaidPlan: boolean;
        subscriptionRequired: boolean;
      };
    };
    expect(subJson.entitlement?.hasPaidPlan).toBe(true);
    expect(subJson.entitlement?.subscriptionRequired).toBe(false);

    // Full dashboard returns charts; ?lite=1 omits heavy charts/mixerSnapshot while returning stats & signals
    const fullDashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(fullDashRes.status).toBe(200);
    const fullDash = (await fullDashRes.json()) as {
      charts?: { equityCurve: unknown[] };
      entitlement?: { subscriptionRequired: boolean };
    };
    expect(fullDash.entitlement?.subscriptionRequired).toBe(false);
    expect(Array.isArray(fullDash.charts?.equityCurve)).toBe(true);

    const liteDashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard?lite=1', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(liteDashRes.status).toBe(200);
    const liteDash = (await liteDashRes.json()) as {
      lite?: boolean;
      charts?: { equityCurve: unknown[] };
      mixerSnapshot?: unknown;
      stats: Record<string, unknown>;
    };
    expect(liteDash.lite).toBe(true);
    expect(liteDash.charts?.equityCurve).toEqual([]);
    expect(liteDash.mixerSnapshot).toBeNull();
    expect(liteDash.stats).toBeTruthy();

    // Free user can create a paper exchange connection without 402
    const connRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/connections/exchanges', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'paper', label: 'V115 Free Paper', activate: true }),
      }),
      env
    );
    expect(connRes.status).toBe(200);
    const connJson = (await connRes.json()) as { requiresSubscription: boolean };
    expect(connJson.requiresSubscription).toBe(false);
  });

  it('controls signal publishing independently between Telegram channels and Bot Users with instant cache invalidation', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v115_owner_sig', '944021185', 'owner');
    const botUserToken = await issueUserToken(env, 'usr_v115_bot_sub', '11500002', 'user');
    expect(botUserToken).toBeTruthy();
    await db.prepare(`UPDATE bot_configs SET bot_state = 'RUNNING_PAPER' WHERE user_id = 'usr_v115_bot_sub'`).run();

    // Configure channel handle + track outbound Telegram Bot API calls
    await db
      .prepare(
        `INSERT INTO system_settings (key, value) VALUES ('telegram_signal_channel', '@Dollarino_official')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run();

    const tgCalls: Array<{ method: string; chatId: string }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org/bot')) {
        const method = url.split('/').pop() || '';
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        tgCalls.push({ method, chatId: String(body.chat_id || '') });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 700 + tgCalls.length } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    });

    // 1) Turn Channel OFF, Bot Users ON
    const ctrl1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/signal-controls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishSignalsToChannels: false, publishSignalsToBotUsers: true }),
      }),
      env
    );
    expect(ctrl1.status).toBe(200);
    expect(await getCachedSystemSetting(db, 'publish_signals_to_channels')).toBe('false');
    expect(await getCachedSystemSetting(db, 'publish_signals_to_bot_users')).toBe('true');

    tgCalls.length = 0;
    const res1 = await publishSignalBroadcast(env, {
      signal: { symbol: 'BTCUSDT', direction: 'LONG', timeframe: '15m', price: '95000', stopLoss: '94000', leverage: 5, tp1: '96500' },
      source: 'v115_test_1',
      publishToChannel: true,
      notifySubscribers: true,
    });
    expect(res1.channelMessageId).toBeUndefined();
    expect(tgCalls.some((c) => c.chatId === '@Dollarino_official')).toBe(false);
    expect(tgCalls.some((c) => c.chatId === '11500002')).toBe(true);

    // 2) Turn Channel ON, Bot Users OFF
    const ctrl2 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/signal-controls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishSignalsToChannels: true, publishSignalsToBotUsers: false }),
      }),
      env
    );
    expect(ctrl2.status).toBe(200);

    tgCalls.length = 0;
    const res2 = await publishSignalBroadcast(env, {
      signal: { symbol: 'ETHUSDT', direction: 'SHORT', timeframe: '15m', price: '3300', stopLoss: '3380', leverage: 5, tp1: '3200' },
      source: 'v115_test_2',
      publishToChannel: true,
      notifySubscribers: true,
    });
    expect(res2.channelMessageId).toBeGreaterThan(0);
    expect(tgCalls.some((c) => c.chatId === '@Dollarino_official')).toBe(true);
    expect(tgCalls.some((c) => c.chatId === '11500002')).toBe(false);

    // 3) Reset both ON and verify public copy-traders cache invalidates on admin mutation
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/signal-controls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishSignalsToChannels: true, publishSignalsToBotUsers: true }),
      }),
      env
    );

    const pubCopy1 = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/copy-traders'), env);
    expect(pubCopy1.status).toBe(200);
    expect(getCachedPublicCopyTraders(db)).not.toBeNull();

    const addCt = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/copy-traders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: 'V115 Pro Leader', roi_30d_pct: 88 }),
      }),
      env
    );
    expect(addCt.status).toBe(201);
    expect(getCachedPublicCopyTraders(db)).toBeNull();
  });

  it('enforces strict Owner-only guards for D1 database management, fee credits, backup, restore, and wipe', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v115_owner', '944021185', 'owner');
    const adminToken = await issueUserToken(env, 'usr_v115_admin', '11500099', 'admin');
    const targetToken = await issueUserToken(env, 'usr_v115_victim', '11500088', 'user');
    expect(targetToken).toBeTruthy();

    // Seed operational data + secret setting to test excludeSecrets & restore
    await db
      .prepare(
        `INSERT INTO system_settings (key, value) VALUES ('telegram_bot_token_enc', 'SECRET_ENC_BLOB')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id)
         VALUES ('tr_v115_1', 'usr_v115_victim', 'PAPER', 'paper', 'BTCUSDT', 'ai_auto', 'LONG', 'CLOSED', '90000', '91000', '0.01', '0', 5, '100', '89000', '89000', '91000', '25', 'cid_v115_1')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status)
         VALUES ('sfl_v115_1', 'usr_v115_victim', 'tr_v115_1', 'CEX_LIVE', 'BTCUSDT', 100, 3, 3, 'ACCRUED')`
      )
      .run();

    // Non-owner admin MUST get 403 on Owner-only D1 & user fee endpoints
    for (const req of [
      new Request('https://dollarino.pages.dev/api/admin/database/backup', { headers: { Authorization: `Bearer ${adminToken}` } }),
      new Request('https://dollarino.pages.dev/api/admin/database/wipe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'OPERATIONAL_RESET', confirmPhrase: 'RESET_OPERATIONAL_DATA' }),
      }),
      new Request('https://dollarino.pages.dev/api/admin/users/usr_v115_victim/fee-credit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: 5 }),
      }),
      new Request('https://dollarino.pages.dev/api/admin/users/usr_v115_victim', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    ]) {
      const denied = await worker.fetch(req, env);
      expect(denied.status).toBe(403);
    }

    // Owner stats + fee credit + reset fee debt
    const statsRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/stats', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(statsRes.status).toBe(200);
    const statsJson = (await statsRes.json()) as { tableCount: number; indexCount: number; totalRows: number };
    expect(statsJson.tableCount).toBeGreaterThanOrEqual(45);
    expect(statsJson.indexCount).toBeGreaterThanOrEqual(15);

    const creditRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/users/usr_v115_victim/fee-credit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: 5 }),
      }),
      env
    );
    expect(creditRes.status).toBe(200);
    const victimAfterCredit = await db.prepare(`SELECT fee_prepaid_credit_usd FROM users WHERE id = 'usr_v115_victim'`).first<{ fee_prepaid_credit_usd: number }>();
    expect(victimAfterCredit?.fee_prepaid_credit_usd).toBe(5);

    const waiveRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/users/usr_v115_victim/reset-fee-debt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(waiveRes.status).toBe(200);
    const ledgerAfterWaive = await db.prepare(`SELECT status FROM server_fee_ledger WHERE id = 'sfl_v115_1'`).first<{ status: string }>();
    expect(ledgerAfterWaive?.status).toBe('WAIVED');

    // Owner Backup export (?excludeSecrets=1 must omit telegram_bot_token_enc)
    const backupRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/backup?excludeSecrets=1', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(backupRes.status).toBe(200);
    const backupJson = (await backupRes.json()) as {
      format: string;
      tables: Record<string, Array<Record<string, unknown>>>;
      totalRows: number;
    };
    expect(backupJson.format).toBe('dollarino-d1-backup-v1');
    expect(backupJson.tables.trades?.some((t) => t.id === 'tr_v115_1')).toBe(true);
    expect(backupJson.tables.system_settings?.some((s) => s.key === 'telegram_bot_token_enc')).toBe(false);

    // Wrong confirm phrase must be rejected
    const badWipe = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/wipe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'OPERATIONAL_RESET', confirmPhrase: 'WRONG_PHRASE' }),
      }),
      env
    );
    expect(badWipe.status).toBe(400);

    // Operational Reset clears trades & fee ledger while preserving users & system_settings
    const opResetRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/wipe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'OPERATIONAL_RESET', confirmPhrase: 'RESET_OPERATIONAL_DATA' }),
      }),
      env
    );
    expect(opResetRes.status).toBe(200);
    const tradeAfterReset = await db.prepare(`SELECT COUNT(*) as cnt FROM trades`).first<{ cnt: number }>();
    const victimAfterReset = await db.prepare(`SELECT id FROM users WHERE id = 'usr_v115_victim'`).first<{ id: string }>();
    expect(tradeAfterReset?.cnt).toBe(0);
    expect(victimAfterReset?.id).toBe('usr_v115_victim');

    // Restore MERGE brings back wiped trade
    const restoreRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'MERGE', backup: backupJson }),
      }),
      env
    );
    expect(restoreRes.status).toBe(200);
    const tradeAfterRestore = await db.prepare(`SELECT id FROM trades WHERE id = 'tr_v115_1'`).first<{ id: string }>();
    expect(tradeAfterRestore?.id).toBe('tr_v115_1');

    // Full Factory Wipe with preserveOwnerAndSettings=true deletes non-owner users while keeping Owner
    const factoryWipeRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/database/wipe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'FULL_FACTORY_WIPE',
          preserveOwnerAndSettings: true,
          confirmPhrase: 'DELETE_ALL_DATA',
        }),
      }),
      env
    );
    expect(factoryWipeRes.status).toBe(200);
    const remainingUsers = await db.prepare(`SELECT id, role, telegram_id FROM users`).all<{ id: string; role: string; telegram_id: string | null }>();
    expect(remainingUsers.results.some((u) => u.role === 'owner' && u.telegram_id === '944021185')).toBe(true);
    expect(remainingUsers.results.some((u) => u.id === 'usr_v115_victim')).toBe(false);
  });
});
