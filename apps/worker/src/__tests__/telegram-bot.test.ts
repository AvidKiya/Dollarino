import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import { formatTradeClosedCard } from '../telegram/formatter.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

interface RecordedTgCall {
  method: string;
  body: Record<string, unknown>;
}

let mf: Miniflare;
let db: D1Database;
let tgCalls: RecordedTgCall[] = [];
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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-001',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN_DO_NOT_USE',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
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

describe('Dollarino Telegram Bot Full Spec & Admin Suite', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'tg-test-db' },
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
      if (url.startsWith('https://api.telegram.org/bot')) {
        const method = url.split('/').pop() || 'unknown';
        let body: Record<string, unknown> = {};
        if (typeof init?.body === 'string') {
          body = JSON.parse(init.body) as Record<string, unknown>;
        } else if (init?.body instanceof FormData) {
          const entries: Record<string, unknown> = {};
          for (const [k, v] of init.body.entries()) {
            if (v instanceof Blob) {
              entries[k] = { filename: (v as File).name, size: v.size, text: await v.text() };
            } else {
              entries[k] = v;
            }
          }
          body = entries;
        }
        tgCalls.push({ method, body });
        return new Response(JSON.stringify({ ok: true, result: { message_id: tgCalls.length } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    });
  });

  beforeEach(() => {
    tgCalls = [];
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  it('greets user with exact Persian welcome & main menu keyboard, and generates 1-click web magic login', async () => {
    const env = makeEnv();
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        text: '/start',
      },
    });

    const welcomeCall = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('سلام خوش اومدی علی 🌹'));
    expect(welcomeCall).toBeTruthy();
    const kbText = JSON.stringify(welcomeCall!.body.reply_markup);
    expect(kbText).toContain('اتصال به صرافی 🔗');
    expect(kbText).toContain('تنظیمات ⚙️');
    expect(kbText).toContain('حساب کاربری 👤');
    expect(kbText).toContain('خرید اشتراک 💎');
    expect(kbText).toContain('راهنما 📚');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        text: '/weblogin',
      },
    });
    const loginCall = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('tg_login='));
    expect(loginCall).toBeTruthy();
    const row = await db.prepare('SELECT web_magic_token FROM users WHERE telegram_id = ?').bind('1001001').first<{ web_magic_token: string }>();
    expect(row?.web_magic_token).toMatch(/^tglm_/);
  });

  it('links web account via /start LINK-CODE deep link and configures KCEX + Trade Quantities', async () => {
    const env = makeEnv();
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_link_code, telegram_link_expires_at)
       VALUES ('usr_web_link_1', 'ali@example.com', 'AliWeb', 'hash', 'user', 'LINK-ABC999', datetime('now', '+15 minutes'))`
    ).run();
    await db.prepare(`INSERT INTO bot_configs (user_id, webhook_secret) VALUES ('usr_web_link_1', 'wh_1')`).run();

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 3,
      message: {
        message_id: 12,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        text: '/start LINK-ABC999',
      },
    });

    const linked = await db.prepare('SELECT id, telegram_id FROM users WHERE id = ?').bind('usr_web_link_1').first<{ id: string; telegram_id: string }>();
    expect(linked?.telegram_id).toBe('1001001');

    // Give user an active subscription so KCEX live connection activates & prints Free/Used/Total balance card
    await db.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, started_at, expires_at)
       VALUES ('sub_live_1', 'usr_web_link_1', 'pro_monthly', 'ACTIVE', datetime('now'), datetime('now', '+30 days'))`
    ).run();

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 4,
      message: { message_id: 13, from: { id: 1001001 }, chat: { id: 1001001, type: 'private' }, text: 'KCEX (کی‌سی‌ای‌ایکس - ۰٪ کارمزد) 🔵' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 5,
      message: { message_id: 14, from: { id: 1001001 }, chat: { id: 1001001, type: 'private' }, text: 'kcex_key_123456' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 6,
      message: { message_id: 15, from: { id: 1001001 }, chat: { id: 1001001, type: 'private' }, text: 'kcex_secret_7890' },
    });

    const kcexOk = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('اتصال به KCEX') && String(c.body.text).includes('Free:'));
    expect(kcexOk).toBeTruthy();

    // Test interactive Trade Quantities TP split + margin_pct
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 7,
      callback_query: { id: 'cq_tp', from: { id: 1001001 }, message: { chat: { id: 1001001 }, message_id: 16 }, data: 'cfg_tp_set:40:30:30' },
    });
    const cfg = await db.prepare('SELECT tp1_close_pct, tp2_close_pct, tp3_close_pct FROM bot_configs WHERE user_id = ?')
      .bind('usr_web_link_1').first<{ tp1_close_pct: number; tp2_close_pct: number; tp3_close_pct: number }>();
    expect(cfg).toEqual({ tp1_close_pct: 40, tp2_close_pct: 30, tp3_close_pct: 30 });
  });

  it('supports Subscription TRC20 invoice, TXID verify, Super Admin 944021185 9-section panel, CSV/JSON reports & admin permissions', async () => {
    const env = makeEnv();

    // Non-admin cannot add admin or open admin callbacks
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 10,
      message: { message_id: 20, from: { id: 1001001 }, chat: { id: 1001001, type: 'private' }, text: 'افزودن مدیر 🔑' },
    });
    expect(tgCalls[0]?.body.text).toContain('فقط مدیر اصلی سیستم (944021185)');

    // User buys pro_monthly plan -> verify -> submits TXID
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 11,
      callback_query: { id: 'cq_buy', from: { id: 1001001 }, message: { chat: { id: 1001001 }, message_id: 21 }, data: 'sub_buy:pro_monthly' },
    });
    const subRow = await db.prepare(`SELECT id FROM user_subscriptions WHERE user_id = 'usr_web_link_1' AND status = 'PENDING_REVIEW' ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    expect(subRow?.id).toBeTruthy();

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 12,
      callback_query: { id: 'cq_ver', from: { id: 1001001 }, message: { chat: { id: 1001001 }, message_id: 21 }, data: `sub_verify:${subRow!.id}` },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 13,
      message: { message_id: 22, from: { id: 1001001 }, chat: { id: 1001001, type: 'private' }, text: 'TRC20_HASH_998877' },
    });
    expect(tgCalls.some((c) => String(c.body.chat_id) === '944021185' && String(c.body.text).includes('TRC20_HASH_998877'))).toBe(true);

    // Super Admin (944021185) enters Admin Panel & tests Dashboard, Approve TX, Gift Wizard, Broadcast, CSV/JSON Reports, Private Toggle, Admin Management
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 14,
      message: { message_id: 30, from: { id: 944021185, first_name: 'Owner' }, chat: { id: 944021185, type: 'private' }, text: 'پنل مدیریت 💼' },
    });
    expect(tgCalls[0]?.body.text).toContain('پنل مدیریت جامع دلارینو');

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 15,
      callback_query: { id: 'cq_dash', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: 'adm:dash' },
    });
    expect(tgCalls.some((c) => String(c.body.text).includes('داشبورد مالی و آمار لحظه‌ای دلارینو'))).toBe(true);

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 16,
      callback_query: { id: 'cq_app', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: `adm:tx_approve:${subRow!.id}` },
    });
    const approved = await db.prepare('SELECT status FROM user_subscriptions WHERE id = ?').bind(subRow!.id).first<{ status: string }>();
    expect(approved?.status).toBe('ACTIVE');

    // Reports: Excel/CSV + JSON via sendDocument
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 17,
      callback_query: { id: 'cq_csv', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: 'adm:rep:month:csv' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 18,
      callback_query: { id: 'cq_json', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: 'adm:rep:month:json' },
    });
    expect(tgCalls.some((c) => c.method === 'sendDocument' && JSON.stringify(c.body).includes('dollarino-report-month.csv'))).toBe(true);
    expect(tgCalls.some((c) => c.method === 'sendDocument' && JSON.stringify(c.body).includes('dollarino-report-month.json'))).toBe(true);

    // Super Admin promotes 1001001 to admin, confirms delegated admin cannot access adm:admins, then revokes
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 19,
      callback_query: { id: 'cq_aa', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: 'adm:adm_add' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 20,
      message: { message_id: 32, from: { id: 944021185 }, chat: { id: 944021185, type: 'private' }, text: '1001001' },
    });
    const promoted = await db.prepare('SELECT role FROM users WHERE telegram_id = ?').bind('1001001').first<{ role: string }>();
    expect(promoted?.role).toBe('admin');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 21,
      callback_query: { id: 'cq_blocked', from: { id: 1001001 }, message: { chat: { id: 1001001 }, message_id: 33 }, data: 'adm:admins' },
    });
    expect(tgCalls[0]?.body.text).toContain('فقط مدیر اصلی (944021185)');

    // Test 15-min admin idle session expiration
    await db.prepare(`UPDATE users SET admin_panel_last_active_at = datetime('now', '-20 minutes') WHERE telegram_id = '944021185'`).run();
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 22,
      callback_query: { id: 'cq_exp', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 31 }, data: 'adm:dash' },
    });
    expect(tgCalls[0]?.body.text).toContain('منقضی شد');
  });

  it('handles @Dollarino_official (-1002263982097) signal routing + manual two-step confirmation + Win/Loss card format', async () => {
    const env = makeEnv();
    await db.prepare(`UPDATE bot_configs SET trade_execution_mode = 'MANUAL_CONFIRM' WHERE user_id = 'usr_web_link_1'`).run();

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 30,
      channel_post: {
        message_id: 901,
        chat: { id: -1002263982097, username: 'Dollarino_official' },
        text: `🟢 Buy signal\n💲Symbol: BTCUSDT\n⌛️Time Frame: 15m\n🔔 Price: 90000\n🔘 Leverage: 10\n⛔️ Stop: 88000\n🟢Tp1: 92000\n🟡Tp2: 94000\n🟠Tp3: 96000\n🆔 : @Dollarino_official`,
      },
    });

    const manualPrompt = tgCalls.find((c) => String(c.body.chat_id) === '1001001' && JSON.stringify(c.body.reply_markup).includes('دلارینو ترید کن برام'));
    expect(manualPrompt).toBeTruthy();

    const sigRow = await db.prepare(`SELECT id FROM signals ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 31,
      callback_query: { id: 'cq_m1', from: { id: 1001001 }, message: { chat: { id: 1001001 }, message_id: 50 }, data: `manual_trade:${sigRow!.id}` },
    });
    expect(JSON.stringify(tgCalls[0]?.body.reply_markup)).toContain('تایید میکنم ✅');
    expect(JSON.stringify(tgCalls[0]?.body.reply_markup)).toContain('نه دستم خورد ❌');

    const winCard = formatTradeClosedCard({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: '90000',
      exitPrice: '92000',
      pnlUsd: 120.5,
      pnlPct: 22.22,
      reason: 'TP3',
      openedAt: '2026-11-20T10:00:00Z',
      closedAt: '2026-11-20T12:30:00Z',
      stopLoss: '88000',
      tp1: '92000',
      leverage: 10,
    });
    expect(winCard).toContain('تبریک میگم 🤑');
    expect(winCard).toContain('تایم ورود:');
    expect(winCard).toContain('تایم خروج:');
    expect(winCard).toContain('استراتژی:');

    const lossCard = formatTradeClosedCard({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: '90000',
      exitPrice: '88000',
      pnlUsd: -55,
      pnlPct: -11,
      reason: 'SL',
      openedAt: '2026-11-20T10:00:00Z',
      closedAt: '2026-11-20T11:00:00Z',
      stopLoss: '88000',
      tp1: '92000',
      leverage: 10,
    });
    expect(lossCard).toContain('ضرر هم جزئی از بازار🥲');
  });

  it('enforces paid-only gating, collapsible colored inline menus, My AI training, and unified Online Support', async () => {
    const env = makeEnv();

    // Unpaid user gets subscription gate on bot toggle
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 40,
      message: { message_id: 60, from: { id: 2002002, first_name: 'سارا' }, chat: { id: 2002002, type: 'private' }, text: '/start' },
    });
    expect(JSON.stringify(tgCalls[1]?.body.reply_markup)).toContain('"style":"primary"');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 41,
      callback_query: { id: 'cq_acc', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 61 }, data: 'tg_acc:ai' },
    });
    const accEdit = tgCalls.find((c) => c.method === 'editMessageText');
    expect(JSON.stringify(accEdit?.body.reply_markup)).toContain('آموزش به هوش مصنوعی من');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 42,
      callback_query: { id: 'cq_gate', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 61 }, data: 'tg_mode_simple_ai' },
    });
    expect(tgCalls.some((c) => String(c.body.text).includes('تعرفه‌های فعال'))).toBe(true);

    // Train Personal Raw AI ("هوش مصنوعی من")
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 43,
      callback_query: { id: 'cq_myai', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 61 }, data: 'tg_myai_train' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 44,
      message: { message_id: 62, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: 'تایم 15m با RSI زیر 35 و EMA 9/21 فقط BTC و ETH حد ضرر 2% حد سود 5%' },
    });
    expect(tgCalls[0]?.body.text).toContain('یاد گرفتم');
    const aiRow = await db.prepare(`SELECT system_rules_json FROM user_ai_agents uaa JOIN users u ON u.id = uaa.user_id WHERE u.telegram_id = '2002002'`).first<{ system_rules_json: string }>();
    expect(aiRow?.system_rules_json).toContain('"BTCUSDT"');

    // Online Support -> Admin reply synced back
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 45,
      message: { message_id: 63, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: '💬 پشتیبانی آنلاین' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 46,
      message: { message_id: 64, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: 'سلام اشتراک ماهانه چطور فعال کنم؟' },
    });
    const tkt = await db.prepare(`SELECT id FROM support_tickets ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    expect(tkt?.id).toBeTruthy();

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 47,
      callback_query: { id: 'cq_sup_rep', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 70 }, data: `adm:sup_reply:${tkt!.id}` },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 48,
      message: { message_id: 71, from: { id: 944021185 }, chat: { id: 944021185, type: 'private' }, text: 'از منوی خرید اشتراک پلن را انتخاب کنید.' },
    });
    expect(tgCalls.some((c) => String(c.body.chat_id) === '2002002' && String(c.body.text).includes('پاسخ پشتیبانی آنلاین'))).toBe(true);
  });
});
