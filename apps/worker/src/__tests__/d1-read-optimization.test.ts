import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signJwt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { invalidateLiveTicksCache } from '../routes/trading.js';
import { getBatchSystemSettings, invalidateSettingsCache } from '../services/settings-cache.js';
import { publishDatabaseReport } from '../telegram/publisher.js';
import { invalidateTelegramTokenCache, resolveTelegramBotToken } from '../telegram/token.js';

let mf: Miniflare;
let rawDb: D1Database;

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

/**
 * Wraps D1Database to count exact SQL statements & rows_read reported by D1/SQLite metadata.
 */
function createMeteredDb(inner: D1Database) {
  let prepareCount = 0;
  let rowsRead = 0;
  const sqlLog: string[] = [];

  function trackMeta(res: unknown) {
    if (res && typeof res === 'object' && 'meta' in res) {
      const meta = (res as { meta?: { rows_read?: number } }).meta;
      if (typeof meta?.rows_read === 'number') {
        rowsRead += meta.rows_read;
      }
    }
    return res;
  }

  function wrapStmt(stmt: D1PreparedStatement, sql: string): D1PreparedStatement {
    return new Proxy(stmt, {
      get(target, prop, receiver) {
        if (prop === 'bind') {
          return (...vals: unknown[]) => wrapStmt(target.bind(...vals), sql);
        }
        if (prop === 'first' || prop === 'all' || prop === 'run' || prop === 'raw') {
          return async (...args: unknown[]) => {
            sqlLog.push(sql);
            const fn = target[prop] as (...a: unknown[]) => Promise<unknown>;
            const res = await fn.apply(target, args);
            return trackMeta(res);
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  }

  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          prepareCount++;
          return wrapStmt(target.prepare(sql), sql);
        };
      }
      if (prop === 'batch') {
        return async (stmts: D1PreparedStatement[]) => {
          const res = await target.batch(stmts);
          for (const item of res) trackMeta(item);
          return res;
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

  return {
    db: proxy,
    reset() {
      prepareCount = 0;
      rowsRead = 0;
      sqlLog.length = 0;
    },
    stats() {
      return { prepareCount, rowsRead, sqlCount: sqlLog.length, sqlLog: [...sqlLog] };
    },
  };
}

function makeEnv(dbInstance: D1Database): Env {
  return {
    DB: dbInstance,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'd1-opt-test-jwt-secret-key-2026',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ALLOW_LIVE_TRADING: 'true',
    TELEGRAM_BOT_TOKEN: '888888:TEST_D1_OPT_TOKEN',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

describe('Cloudflare D1 Read Optimization & Quota Protection (0050 + Caches + Cron)', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'dollarino-d1-opt-db' },
    });
    rawDb = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await rawDb.prepare(stmt).run();
      }
    }

    // Seed 80 idle users + 1 active polling user + 60 closed trades + 10 open trades across users
    await rawDb
      .prepare(
        `INSERT INTO users (
          id, email, password_hash, username, display_name, role, telegram_id,
          phone_number, phone_verified, profile_completed, must_change_credentials, last_active_at
        ) VALUES (
          'usr_opt_active', 'opt-active@dollarino.test', 'hash', 'optactive', 'Opt Active', 'user', '123456789',
          '+989121112233', 1, 1, 0, datetime('now', '-2 days')
        )`
      )
      .run();

    for (let i = 1; i <= 80; i++) {
      await rawDb
        .prepare(
          `INSERT INTO users (
            id, email, password_hash, username, display_name, role, is_blocked, last_active_at
          ) VALUES (?, ?, 'hash', ?, ?, 'user', 0, datetime('now', '-10 days'))`
        )
        .bind(`usr_idle_${i}`, `idle${i}@dollarino.test`, `idle${i}`, `Idle ${i}`)
        .run();
    }

    await rawDb
      .prepare(
        `INSERT INTO bot_configs (user_id, webhook_secret, bot_state, trading_mode, trading_mode_selected, symbol, entry_timeframe)
         VALUES ('usr_opt_active', 'wh_opt_active_1', 'STOPPED', 'PAPER', 1, 'BTCUSDT', '15m')`
      )
      .run();

    for (let i = 1; i <= 60; i++) {
      const uid = `usr_idle_${((i - 1) % 20) + 1}`;
      await rawDb
        .prepare(
          `INSERT INTO trades (
            id, user_id, mode, market_type, exchange_provider, symbol, strategy_key, direction, status,
            entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used,
            current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id, closed_at
          ) VALUES (?, ?, 'LIVE', 'FUTURES', 'paper', 'BTCUSDT', 'dollarino_v01', 'LONG', 'CLOSED',
            '90000', '91000', '0.1', '0', 5, '1800', '88000', '88000', '92000', '100', ?, datetime('now', '-10 days'))`
        )
        .bind(`trd_opt_${i}`, uid, `cli_opt_${i}`)
        .run();
    }
  });

  beforeEach(() => {
    invalidateSettingsCache();
    invalidateTelegramTokenCache(rawDb);
    invalidateLiveTicksCache(rawDb);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }))
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf?.dispose();
  });

  it('1. Applies all 0050 indexes and avoids full-table scans in EXPLAIN QUERY PLAN', async () => {
    const indexes = await rawDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
      .all<{ name: string }>();
    const idxNames = new Set(indexes.results.map((r) => r.name));
    expect(idxNames.has('idx_users_active_last_seen')).toBe(true);
    expect(idxNames.has('idx_users_tg_notify')).toBe(true);
    expect(idxNames.has('idx_users_fee_enforcement_due')).toBe(true);
    expect(idxNames.has('idx_copy_traders_user_id')).toBe(true);
    expect(idxNames.has('idx_trades_closed_recent_user')).toBe(true);
    expect(idxNames.has('idx_dex_trades_closed_recent_user')).toBe(true);
    expect(idxNames.has('idx_copy_pos_v2_user_opened_desc')).toBe(true);
    expect(idxNames.has('idx_perp_dex_orders_user_created_desc')).toBe(true);
    expect(idxNames.has('idx_server_fee_ledger_status_user')).toBe(true);
    expect(idxNames.has('idx_bot_configs_sniper_running')).toBe(true);

    const queries = [
      `EXPLAIN QUERY PLAN SELECT id FROM users WHERE is_blocked = 0 AND last_active_at >= datetime('now', '-10 minutes')`,
      `EXPLAIN QUERY PLAN SELECT id FROM users WHERE telegram_id IS NOT NULL AND telegram_id != '' AND is_blocked = 0 AND last_active_at >= datetime('now', '-7 days')`,
      `EXPLAIN QUERY PLAN SELECT id FROM users WHERE fee_lock_status != 'ACTIVE' OR fee_penalty_usd > 0`,
      `EXPLAIN QUERY PLAN SELECT user_id, SUM(CAST(realized_pnl AS REAL)) FROM trades WHERE status = 'CLOSED' AND closed_at >= datetime('now', '-30 days') GROUP BY user_id`,
      `EXPLAIN QUERY PLAN SELECT user_id FROM server_fee_ledger WHERE status IN ('PENDING', 'OVERDUE') GROUP BY user_id`,
    ];

    for (const q of queries) {
      const plan = await rawDb.prepare(q).all<{ detail: string }>();
      const joined = plan.results.map((r) => r.detail).join(' | ');
      expect(joined).toMatch(/USING (?:COVERING )?INDEX/);
      expect(joined).not.toMatch(/\bSCAN\s+(users|trades|server_fee_ledger)\s*($|\|)/);
    }
  });

  it('2. Keeps idle 5-minute scheduled() cron D1 rows_read minimal and skips repeat intel checks', async () => {
    const metered = createMeteredDb(rawDb);
    const env = makeEnv(metered.db);
    const pendingBg: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        pendingBg.push(p);
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    metered.reset();
    await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() } as unknown as ScheduledEvent, env, ctx);
    await Promise.allSettled(pendingBg);
    const firstRun = metered.stats();
    // Cold isolate first run loads system_settings & checks activity gates; stays well below full multi-table scan
    expect(firstRun.rowsRead).toBeLessThan(350);

    // Second immediate scheduled() call benefits from in-isolate caches & cron intel cooldown gate
    pendingBg.length = 0;
    metered.reset();
    await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() + 300_000 } as unknown as ScheduledEvent, env, ctx);
    await Promise.allSettled(pendingBg);
    const secondRun = metered.stats();
    expect(secondRun.rowsRead).toBeLessThan(50);
  });

  it('3. Eliminates repeat D1 queries via getBatchSystemSettings, resolveTelegramBotToken, live-ticks?poll=1 & dashboard?lite=1 caches', async () => {
    const metered = createMeteredDb(rawDb);
    const env = makeEnv(metered.db);

    // 3a. Batch system settings + cache reuse
    metered.reset();
    const s1 = await getBatchSystemSettings(metered.db, ['bot_username', 'official_channel', 'intel_news_enabled']);
    expect(s1.size).toBeGreaterThanOrEqual(0);
    const firstSettingsReads = metered.stats().sqlCount;
    expect(firstSettingsReads).toBe(1);

    metered.reset();
    await getBatchSystemSettings(metered.db, ['bot_username', 'official_channel', 'intel_news_enabled']);
    expect(metered.stats().sqlCount).toBe(0);

    // 3b. Telegram token cache
    metered.reset();
    const tok1 = await resolveTelegramBotToken(env);
    expect(tok1).toBe('888888:TEST_D1_OPT_TOKEN');
    expect(metered.stats().sqlCount).toBe(1);
    metered.reset();
    const tok2 = await resolveTelegramBotToken(env);
    expect(tok2).toBe('888888:TEST_D1_OPT_TOKEN');
    expect(metered.stats().sqlCount).toBe(0);

    // 3c. Authenticated polling: ?poll=1 and ?lite=1 reuse auth + poll/lite caches
    const jwt = await signJwt(
      { sub: 'usr_opt_active', role: 'user', tv: 0, exp: Math.floor(Date.now() / 1000) + 3600 },
      env.SESSION_JWT_SECRET
    );

    // Prime live-ticks?poll=1
    const res1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/live-ticks?poll=1', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(res1.status).toBe(200);

    metered.reset();
    const res2 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/live-ticks?poll=1', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(res2.status).toBe(200);
    expect(metered.stats().sqlCount).toBe(0);

    // Prime dashboard?lite=1, then repeat call must reuse DASHBOARD_LITE_META_CACHE + auth cache
    const d1Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard?lite=1', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(d1Res.status).toBe(200);
    const firstDashCount = metered.stats().sqlCount;

    metered.reset();
    const d2Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard?lite=1', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(d2Res.status).toBe(200);
    // Repeat lite poll drops heavy historical stats/ledger/closed-trades/sniper/fee queries significantly
    expect(metered.stats().sqlCount).toBeLessThan(firstDashCount);
    expect(metered.stats().sqlCount).toBeLessThanOrEqual(12);
  });

  it('4. Uses MAX(rowid) instead of full COUNT(*) for table row estimates in PERIODIC_STATUS database report', async () => {
    await rawDb
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('database_channel_id', '-100555666777')`)
      .run();
    invalidateSettingsCache(rawDb);

    const metered = createMeteredDb(rawDb);
    const env = makeEnv(metered.db);

    // Warm settings/token caches (realistic steady-state cron execution), then measure report cost across 81 users + 60 trades
    await publishDatabaseReport(env, { eventType: 'PERIODIC_STATUS' });

    metered.reset();
    const res = await publishDatabaseReport(env, { eventType: 'PERIODIC_STATUS' });
    expect(res.ok).toBe(true);
    const st = metered.stats();
    // None of the 10 keyTables (users, trades, signals, audit_logs, ...) should run full COUNT(*) on PERIODIC_STATUS
    const tableCountScans = st.sqlLog.filter((s) => /SELECT COUNT\(\*\) as cnt FROM "/i.test(s));
    expect(tableCountScans.length).toBe(0);
    expect(st.sqlLog.some((s) => /SELECT COALESCE\(MAX\(rowid\), 0\)/i.test(s))).toBe(true);
    expect(st.rowsRead).toBeLessThan(35);
  });
});
