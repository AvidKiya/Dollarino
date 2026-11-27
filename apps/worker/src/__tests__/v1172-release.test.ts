import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureUserDefaults, normalizePhoneInput, resolveEffectiveReferralCode } from '../auth.js';
import { signJwt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { enforceRateLimit } from '../security.js';
import { evaluateUserFeeStanding, recordProfitShareServerFee } from '../services/server-fee.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

let mf: Miniflare;
let db: D1Database;

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v1172-release',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_TOKEN_V1172',
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
      cur += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

describe('Dollarino V11.7.2 Release — Admin Reset/Exemption, Auto Admin Referral, Phone Gate & Chrome Side Panel', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v1172-db' },
    });
    db = await mf.getD1Database('DB');

    const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await db.prepare(stmt).run().catch(() => {});
      }
    }
  }, 60_000);

  afterAll(async () => {
    await mf.dispose();
  });

  it('1. Admin/Owner account delete resets all data/balances/wallets to 0 while preserving account, credentials & admin role', async () => {
    const env = makeEnv();
    const ownerId = 'usr_v1172_owner';
    await db
      .prepare(
        `INSERT INTO users (
           id, email, username, display_name, password_hash, role,
           referral_code, wallet_balance_usdt, fee_prepaid_credit_usd, fee_penalty_usd,
           fee_lock_status, trust_wallet_address, trust_wallet_verified, extension_api_key,
           profile_completed, ui_mode, telegram_id
         ) VALUES (
           ?, 'owner@dollarino.app', 'owner_v1172', 'Platform Owner', 'hash', 'owner',
           'DLROWNER72', 5400, 125, 30,
           'WARNING', '0x1111111111111111111111111111111111111111', 1, 'dlr_ext_owner_secret',
           1, 'pro', '944021185'
         )`
      )
      .bind(ownerId)
      .run();
    await ensureUserDefaults(db, ownerId);
    await db
      .prepare(`UPDATE bot_configs SET bot_state = 'RUNNING_LIVE', paper_balance = '77777', trading_mode = 'LIVE' WHERE user_id = ?`)
      .bind(ownerId)
      .run();
    await db
      .prepare(
        `INSERT INTO trades (
           id, user_id, mode, exchange_provider, symbol, strategy_key, direction, status,
           entry_price, initial_quantity, remaining_quantity, leverage, margin_used,
           current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id
         ) VALUES (
           'trd_own_1', ?, 'LIVE', 'trustwallet', 'BTCUSDT', 'dollarino_v01', 'LONG', 'CLOSED',
           '95000', '0.1', '0', 5, '1900', '93000', '93000', '97500', '250', 'cli_trd_own_1'
         )`
      )
      .bind(ownerId)
      .run();
    await db
      .prepare(`INSERT INTO notifications (id, user_id, title, body, category, is_read) VALUES ('notif_own_1', ?, 'Test', 'Body', 'SYSTEM', 0)`)
      .bind(ownerId)
      .run();

    const ownerToken = await signJwt({ sub: ownerId, email: 'owner@dollarino.app', role: 'owner' }, env.SESSION_JWT_SECRET);

    // Self-delete on Services -> must reset to 0 without deleting account or logging out
    const delSelfRes = await worker.fetch(
      new Request('http://localhost/api/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: 'DELETE' }),
      }),
      env
    );
    expect(delSelfRes.status).toBe(200);
    const delSelfJson = (await delSelfRes.json()) as {
      ok: boolean;
      deleted: boolean;
      resetAdminAccount?: boolean;
      role?: string;
    };
    expect(delSelfJson.ok).toBe(true);
    expect(delSelfJson.deleted).toBe(false);
    expect(delSelfJson.resetAdminAccount).toBe(true);
    expect(delSelfJson.role).toBe('owner');

    const ownerAfter = await db
      .prepare(
        `SELECT id, role, referral_code, wallet_balance_usdt, fee_prepaid_credit_usd, fee_penalty_usd,
                trust_wallet_address, extension_api_key, ui_mode, profile_completed
         FROM users WHERE id = ?`
      )
      .bind(ownerId)
      .first<{
        id: string;
        role: string;
        referral_code: string;
        wallet_balance_usdt: number;
        fee_prepaid_credit_usd: number;
        fee_penalty_usd: number;
        trust_wallet_address: string | null;
        extension_api_key: string | null;
        ui_mode: string;
        profile_completed: number;
      }>();
    expect(ownerAfter?.id).toBe(ownerId);
    expect(ownerAfter?.role).toBe('owner');
    expect(ownerAfter?.referral_code).toBe('DLROWNER72');
    expect(ownerAfter?.wallet_balance_usdt).toBe(0);
    expect(ownerAfter?.fee_prepaid_credit_usd).toBe(0);
    expect(ownerAfter?.fee_penalty_usd).toBe(0);
    expect(ownerAfter?.trust_wallet_address).toBeNull();
    expect(ownerAfter?.extension_api_key).toBeNull();
    expect(ownerAfter?.ui_mode).toBe('simple');
    expect(ownerAfter?.profile_completed).toBe(1);

    const cfgAfter = await db
      .prepare(`SELECT bot_state, paper_balance, trading_mode FROM bot_configs WHERE user_id = ?`)
      .bind(ownerId)
      .first<{ bot_state: string; paper_balance: string; trading_mode: string }>();
    expect(cfgAfter?.bot_state).toBe('STOPPED');
    expect(cfgAfter?.paper_balance).toBe('10000');
    expect(cfgAfter?.trading_mode).toBe('PAPER');

    const tradesLeft = await db.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ?`).bind(ownerId).first<{ cnt: number }>();
    const notifsLeft = await db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ?`).bind(ownerId).first<{ cnt: number }>();
    expect(tradesLeft?.cnt).toBe(0);
    expect(notifsLeft?.cnt).toBe(0);

    // Owner still passes Admin API authorization after reset
    const adminRes = await worker.fetch(
      new Request('http://localhost/api/admin/overview', { headers: { Authorization: `Bearer ${ownerToken}` } }),
      env
    );
    expect(adminRes.status).toBe(200);

    // Admin DELETE /api/admin/users/:id for an admin target also resets to 0 while keeping admin role
    const adminId = 'usr_v1172_subadmin';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, wallet_balance_usdt, profile_completed)
         VALUES (?, 'subadmin@dollarino.app', 'subadmin72', 'hash', 'admin', 900, 1)`
      )
      .bind(adminId)
      .run();
    await ensureUserDefaults(db, adminId);

    const resetSubAdmin = await worker.fetch(
      new Request(`http://localhost/api/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(resetSubAdmin.status).toBe(200);
    const resetSubJson = (await resetSubAdmin.json()) as { ok: boolean; resetToFresh?: boolean; preservedRole?: string };
    expect(resetSubJson.ok).toBe(true);
    expect(resetSubJson.resetToFresh).toBe(true);
    expect(resetSubJson.preservedRole).toBe('admin');

    // Explicit POST /api/admin/users/:id/reset-account works identically
    await db.prepare(`UPDATE users SET wallet_balance_usdt = 350 WHERE id = ?`).bind(adminId).run();
    const explicitResetRes = await worker.fetch(
      new Request(`http://localhost/api/admin/users/${adminId}/reset-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(explicitResetRes.status).toBe(200);
    const explicitResetJson = (await explicitResetRes.json()) as { ok: boolean; resetToFresh?: boolean; preservedRole?: string };
    expect(explicitResetJson.ok).toBe(true);
    expect(explicitResetJson.resetToFresh).toBe(true);
    expect(explicitResetJson.preservedRole).toBe('admin');

    const subAfter = await db
      .prepare(`SELECT role, wallet_balance_usdt FROM users WHERE id = ?`)
      .bind(adminId)
      .first<{ role: string; wallet_balance_usdt: number }>();
    expect(subAfter?.role).toBe('admin');
    expect(subAfter?.wallet_balance_usdt).toBe(0);
  });

  it('2. Admin/Owner accounts have zero fees, zero rate limits, and bypass $10 live minimum', async () => {
    const env = makeEnv();
    const adminId = 'usr_v1172_subadmin';

    const feeStanding = await evaluateUserFeeStanding(db, adminId);
    expect(feeStanding.allowed).toBe(true);
    expect(feeStanding.feeExempt).toBe(true);
    expect(feeStanding.freeTradesRemaining).toBe(999999);

    const feeRes = await recordProfitShareServerFee(db, {
      userId: adminId,
      tradeId: 'trd_admin_profit_1',
      source: 'PERP_LIVE',
      symbol: 'ETHUSDT',
      realizedPnlUsd: 2500,
      mode: 'LIVE',
    });
    expect(feeRes.recorded).toBe(false);
    expect(feeRes.feeUsd).toBe(0);
    expect(feeRes.feePct).toBe(0);

    // Rate-limit bypass works cleanly even after exceeding limit
    for (let i = 0; i < 4; i++) {
      const blocked = await enforceRateLimit(env, 'test_v1172_bucket', 2, 60);
      if (i >= 2) expect(blocked.allowed).toBe(false);
    }
    const bypassed = await enforceRateLimit(env, 'test_v1172_bucket', 2, 60, { bypass: true });
    expect(bypassed.allowed).toBe(true);

    // Admin can start LIVE bot even with $0 Trust Wallet balance
    await db
      .prepare(`UPDATE users SET risk_terms_accepted_at = '2026-11-19T00:00:00Z', trust_wallet_address = '0x2222222222222222222222222222222222222222' WHERE id = ?`)
      .bind(adminId)
      .run();
    await db
      .prepare(`UPDATE bot_configs SET trading_mode = 'LIVE', trading_mode_selected = 1 WHERE user_id = ?`)
      .bind(adminId)
      .run();
    const adminToken = await signJwt({ sub: adminId, email: 'subadmin@dollarino.app', role: 'admin' }, env.SESSION_JWT_SECRET);

    const startLiveRes = await worker.fetch(
      new Request('http://localhost/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanScope: 'ALL_MARKET' }),
      }),
      env
    );
    expect(startLiveRes.status).toBe(200);
    const startLiveJson = (await startLiveRes.json()) as { ok: boolean; bot_state: string };
    expect(startLiveJson.ok).toBe(true);
    expect(startLiveJson.bot_state).toBe('RUNNING_LIVE');
  });

  it('3. Automatically assigns Owner/Admin referral code when signing up without referral code (Telegram + Providers + Helper)', async () => {
    const env = makeEnv();

    // Providers endpoint advertises defaultAdminReferralCode
    const provRes = await worker.fetch(new Request('http://localhost/api/auth/providers'), env);
    expect(provRes.status).toBe(200);
    const provJson = (await provRes.json()) as { defaultAdminReferralCode?: string | null };
    expect(provJson.defaultAdminReferralCode).toBe('DLROWNER72');

    // Direct helper resolves DLROWNER72 when blank and honors explicit code when supplied
    expect(await resolveEffectiveReferralCode(db, '', 'usr_brand_new')).toBe('DLROWNER72');
    expect(await resolveEffectiveReferralCode(db, 'dlrfriend', 'usr_brand_new')).toBe('DLRFRIEND');

    // Telegram /start without REF_ provisions user with profile_completed=0 and attaches owner referral once Telegram auth is enabled
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })) as typeof fetch;
    try {
      // While auth_telegram_enabled='false', unknown users are NOT provisioned via bot /start
      await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_telegram_enabled', 'false')`).run();
      invalidateSettingsCache(db);
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 900,
        message: {
          message_id: 900,
          chat: { id: 55667788, type: 'private' },
          from: { id: 55667788, username: 'fresh_tg_user', first_name: 'FreshTG' },
          text: '/start',
        },
      });
      const blockedTgUser = await db
        .prepare(`SELECT id FROM users WHERE telegram_id = '55667788'`)
        .first<{ id: string }>();
      expect(blockedTgUser).toBeNull();

      await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_telegram_enabled', 'true')`).run();
      invalidateSettingsCache(db);
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 901,
        message: {
          message_id: 901,
          chat: { id: 55667788, type: 'private' },
          from: { id: 55667788, username: 'fresh_tg_user', first_name: 'FreshTG' },
          text: '/start',
        },
      });
    } finally {
      globalThis.fetch = origFetch;
    }

    const tgUser = await db
      .prepare(`SELECT id, referred_by, profile_completed, auth_provider FROM users WHERE telegram_id = '55667788'`)
      .first<{ id: string; referred_by: string | null; profile_completed: number; auth_provider: string }>();
    expect(tgUser).toBeTruthy();
    expect(tgUser?.auth_provider).toBe('telegram');
    expect(tgUser?.profile_completed).toBe(0);
    expect(tgUser?.referred_by).toBe('DLROWNER72');

    const refRow = await db
      .prepare(`SELECT referrer_user_id, referral_code FROM referrals WHERE referred_user_id = ?`)
      .bind(tgUser!.id)
      .first<{ referrer_user_id: string; referral_code: string }>();
    expect(refRow?.referrer_user_id).toBe('usr_v1172_owner');
    expect(refRow?.referral_code).toBe('DLROWNER72');
  });

  it('4. Complete-profile validates & stores Persian/Latin phone numbers cleanly alongside nickname, username & password', async () => {
    const env = makeEnv();
    expect(normalizePhoneInput('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('09123456789');
    expect(normalizePhoneInput('+98 912-345-6789')).toBe('+989123456789');
    expect(normalizePhoneInput('123')).toBe('');

    const tgUser = await db
      .prepare(`SELECT id, email FROM users WHERE telegram_id = '55667788'`)
      .first<{ id: string; email: string }>();
    const token = await signJwt({ sub: tgUser!.id, email: tgUser!.email, role: 'user' }, env.SESSION_JWT_SECRET);

    const badPhoneRes = await worker.fetch(
      new Request('http://localhost/api/auth/complete-profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'نیما معامله‌گر',
          phoneNumber: '12',
          username: 'nima_trader_72',
          password: 'StrongPassword72',
        }),
      }),
      env
    );
    expect(badPhoneRes.status).toBe(400);

    const okRes = await worker.fetch(
      new Request('http://localhost/api/auth/complete-profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'نیما معامله‌گر',
          phoneNumber: '۰۹۱۲۳۴۵۶۷۸۹',
          username: 'nima_trader_72',
          password: 'StrongPassword72',
        }),
      }),
      env
    );
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as { ok: boolean; user: { phone_number?: string; profile_completed: number; username: string } };
    expect(okJson.ok).toBe(true);
    expect(okJson.user.profile_completed).toBe(1);
    expect(okJson.user.username).toBe('nima_trader_72');
    expect(okJson.user.phone_number).toBe('09123456789');
  });

  it('5. Chrome Extension uses native Side Panel in Simple Mode and Worker sets zero X-Frame-Options blocking headers', async () => {
    const env = makeEnv();
    const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/extension');
    const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8')) as {
      version: string;
      permissions: string[];
      side_panel?: { default_path: string };
      action?: { default_popup?: string };
    };
    expect(manifest.version).toBe('11.7.2');
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
    expect(manifest.action?.default_popup).toBeUndefined();

    const bgJs = fs.readFileSync(path.join(extDir, 'background.js'), 'utf8');
    expect(bgJs).toContain('openPanelOnActionClick: true');

    const spJs = fs.readFileSync(path.join(extDir, 'sidepanel.js'), 'utf8');
    expect(spJs).toContain("'ui_mode', 'simple'");
    expect(spJs).toContain("'embed', 'sidepanel'");

    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('X-Frame-Options')).toBeNull();
    const healthJson = (await healthRes.json()) as { version: string };
    expect(healthJson.version).toBe('11.7.2');
  });
});
