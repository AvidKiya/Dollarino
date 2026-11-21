import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';
import { renderProfitCardPng, renderSignalClosedCardPng } from '../cards/renderer.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import { formatTradeClosedCard } from '../telegram/formatter.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { publishSignalBroadcast } from '../telegram/publisher.js';

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
    HILINKUP_API_KEY: 'test-hilinkup-key',
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

describe('Dollarino Telegram Bot Full Spec, Trust Wallet, DexScreener & Extension Suite', () => {
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
      if (url.startsWith('https://api.telegram.org/file/bot')) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      if (url.startsWith('https://api.telegram.org/bot')) {
        const method = url.split('/').pop()?.split('?')[0] || 'unknown';
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
        if (method === 'getUserProfilePhotos') {
          return new Response(
            JSON.stringify({
              ok: true,
              result: {
                total_count: 1,
                photos: [[{ file_id: 'tg_photo_file_123', width: 160, height: 160 }]],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (method === 'getFile') {
          return new Response(
            JSON.stringify({ ok: true, result: { file_id: 'tg_photo_file_123', file_path: 'photos/file_123.jpg' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        tgCalls.push({ method, body });
        return new Response(JSON.stringify({ ok: true, result: { message_id: tgCalls.length } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('api.dexscreener.com')) {
        if (url.includes('/token-boosts/')) {
          return new Response(
            JSON.stringify([{ chainId: 'bsc', tokenAddress: '0x1111111111111111111111111111111111111111', amount: 100 }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/token-profiles/')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('/metas/trending')) {
          return new Response(JSON.stringify([{ name: 'AI Agents', volume: 5500000 }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const pairSample = {
          chainId: 'bsc',
          dexId: 'pancakeswap',
          url: 'https://dexscreener.com/bsc/0xpair1',
          pairAddress: '0xpair1',
          baseToken: { address: '0x1111111111111111111111111111111111111111', name: 'DollarinoGem', symbol: 'DGEM' },
          quoteToken: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', name: 'WBNB', symbol: 'WBNB' },
          priceUsd: '0.0254',
          liquidity: { usd: 280000 },
          volume: { h24: 1450000, h1: 210000 },
          priceChange: { h24: 42.5, h1: 6.2 },
          txns: { h24: { buys: 1850, sells: 720 } },
          fdv: 2540000,
          boosts: { active: 120 },
        };
        if (url.includes('/latest/dex/search') || url.includes('/latest/dex/tokens')) {
          return new Response(JSON.stringify({ pairs: [pairSample] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([pairSample]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('bsc-dataseed.binance.org') || url.includes('llamarpc.com') || url.includes('mainnet.base.org')) {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0de0b6b3a7640000' }), // 1.0 native / token
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('hilinkup.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    score: 82,
                    verdict: 'STRONG_BUY',
                    riskLevel: 'MEDIUM',
                    summaryFa: 'نقدینگی مناسب و فشار خرید قوی روی PancakeSwap دیده می‌شود.',
                    catalysts: ['رشد حجم ۲۴ ساعته', 'برتری خریداران'],
                    warnings: ['نوسان میم‌کوین را با حد ضرر مدیریت کنید'],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('bitunix.com') || url.includes('toobit.com') || url.includes('binance.com') || url.includes('kcex.com')) {
        if (url.includes('klines') || url.includes('kline')) {
          const now = Date.now();
          const bars = Array.from({ length: 120 }, (_, i) => {
            const t = now - (120 - i) * 3600_000;
            const p = 90000 + Math.sin(i / 6) * 1200 + i * 25;
            return [t, String(p - 80), String(p + 180), String(p - 150), String(p + 100), '1400'];
          });
          return new Response(JSON.stringify(bars), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('market/tickers')) {
          return new Response(
            JSON.stringify({ code: 0, data: [{ symbol: 'BTCUSDT', lastPrice: '92000', last: '92000' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('ticker/price') || url.includes('ticker/24hr') || url.includes('quote/v1/ticker')) {
          return new Response(
            JSON.stringify({ symbol: 'BTCUSDT', price: '92000', c: '92000', lastPrice: '92000', p: '92000' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

  it('enforces pre-auth phone KYC gate, rejects third-party contacts, unlocks menus after own-contact verification, and issues web magic login', async () => {
    const env = makeEnv();

    // 1. Unverified user gets educational intro + contact verification keyboard (NO main menus yet)
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        text: '/start',
      },
    });

    const introCall = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('دلارینو چیست'));
    expect(introCall).toBeTruthy();
    expect(JSON.stringify(introCall!.body.reply_markup)).toContain('pre_info:engines');

    const kycKbCall = tgCalls.find((c) => c.method === 'sendMessage' && JSON.stringify(c.body.reply_markup).includes('request_contact'));
    expect(kycKbCall).toBeTruthy();

    // Attempting menu text before verification stays gated
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        text: 'تنظیمات ⚙️',
      },
    });
    expect(tgCalls.some((c) => JSON.stringify(c.body.reply_markup).includes('request_contact'))).toBe(true);
    expect(tgCalls.some((c) => String(c.body.text).includes('مدیریت ابزارها'))).toBe(false);

    // 2. Submitting another person's contact (different user_id) is rejected
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 3,
      message: {
        message_id: 12,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        contact: { phone_number: '+989120000000', first_name: 'Stranger', user_id: 999888777 },
      },
    });
    expect(tgCalls[0]?.body.text).toContain('فقط شماره تماس **اکانت تلگرام خودتان**');

    // 3. Sharing own contact verifies KYC & unlocks Simple Mode + main keyboards
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 4,
      message: {
        message_id: 13,
        from: { id: 1001001, first_name: 'علی', username: 'ali_trader' },
        chat: { id: 1001001, type: 'private' },
        contact: { phone_number: '00989123456789', first_name: 'علی', user_id: 1001001 },
      },
    });

    const verifiedRow = await db.prepare('SELECT phone_number, phone_verified FROM users WHERE telegram_id = ?')
      .bind('1001001').first<{ phone_number: string; phone_verified: number }>();
    expect(verifiedRow?.phone_verified).toBe(1);
    expect(verifiedRow?.phone_number).toBe('+989123456789');

    const welcomeCall = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('سلام خوش اومدی علی 🌹'));
    expect(welcomeCall).toBeTruthy();
    const kbText = JSON.stringify(welcomeCall!.body.reply_markup);
    expect(kbText).toContain('اتصال به صرافی 🔗');
    expect(kbText).toContain('Trust Wallet و DEX');
    expect(kbText).toContain('راهنما 📚');

    // 4. Verified user can switch to Pro Mode & trigger /weblogin
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 5,
      message: {
        message_id: 14,
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

  it('links web account via /start LINK-CODE after phone KYC and configures KCEX + Trade Quantities', async () => {
    const env = makeEnv();
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_link_code, telegram_link_expires_at)
       VALUES ('usr_web_link_1', 'ali@example.com', 'AliWeb', 'hash', 'user', 'LINK-ABC999', datetime('now', '+15 minutes'))`
    ).run();
    await db.prepare(`INSERT INTO bot_configs (user_id, webhook_secret) VALUES ('usr_web_link_1', 'wh_1')`).run();

    // User 1002009 clicks /start LINK-ABC999 -> gated until contact is shared -> auto-links upon contact verification!
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 10,
      message: {
        message_id: 20,
        from: { id: 1002009, first_name: 'رضا', username: 'reza_fx' },
        chat: { id: 1002009, type: 'private' },
        text: '/start LINK-ABC999',
      },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 11,
      message: {
        message_id: 21,
        from: { id: 1002009, first_name: 'رضا', username: 'reza_fx' },
        chat: { id: 1002009, type: 'private' },
        contact: { phone_number: '+989351112233', first_name: 'رضا', user_id: 1002009 },
      },
    });

    const linked = await db.prepare('SELECT id, telegram_id, phone_verified FROM users WHERE id = ?')
      .bind('usr_web_link_1').first<{ id: string; telegram_id: string; phone_verified: number }>();
    expect(linked?.telegram_id).toBe('1002009');
    expect(linked?.phone_verified).toBe(1);

    // Give user an active subscription so KCEX live connection activates & prints Free/Used/Total balance card
    await db.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, started_at, expires_at)
       VALUES ('sub_live_1', 'usr_web_link_1', 'pro_monthly', 'ACTIVE', datetime('now'), datetime('now', '+30 days'))`
    ).run();

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 12,
      message: { message_id: 22, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: 'KCEX (کی‌سی‌ای‌ایکس - ۰٪ کارمزد) 🔵' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 13,
      message: { message_id: 23, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: 'kcex_key_123456' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 14,
      message: { message_id: 24, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: 'kcex_secret_7890' },
    });

    const kcexOk = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.text).includes('اتصال به KCEX') && String(c.body.text).includes('Free:'));
    expect(kcexOk).toBeTruthy();

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 15,
      callback_query: { id: 'cq_tp', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 25 }, data: 'cfg_tp_set:40:30:30' },
    });
    const cfg = await db.prepare('SELECT tp1_close_pct, tp2_close_pct, tp3_close_pct FROM bot_configs WHERE user_id = ?')
      .bind('usr_web_link_1').first<{ tp1_close_pct: number; tp2_close_pct: number; tp3_close_pct: number }>();
    expect(cfg).toEqual({ tp1_close_pct: 40, tp2_close_pct: 30, tp3_close_pct: 30 });
  });

  it('supports Simple/Pro UI mode, 4-step Wizard, Trust Wallet address registration & DexScreener live search via Telegram', async () => {
    const env = makeEnv();

    // Switch 1002009 to Pro mode via inline callback & verify DB persistence
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 20,
      callback_query: { id: 'cq_pro', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 26 }, data: 'tg_toggle_ui_mode' },
    });
    const proRow = await db.prepare(`SELECT ui_mode FROM users WHERE id = 'usr_web_link_1'`).first<{ ui_mode: string }>();
    expect(proRow?.ui_mode).toBe('pro');

    // Run 4-step Wizard via callbacks
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 21,
      callback_query: { id: 'cq_w1', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 27 }, data: 'tg_simple_wizard:1' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 22,
      callback_query: { id: 'cq_w2', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 27 }, data: 'tg_wiz_m:10' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 23,
      callback_query: { id: 'cq_w3', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 27 }, data: 'tg_wiz_l:10' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 24,
      callback_query: { id: 'cq_w4', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 27 }, data: 'tg_wiz_e:ai_autonomous_agent' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 25,
      callback_query: { id: 'cq_w5', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 27 }, data: 'tg_wiz_go:paper' },
    });
    const wizCfg = await db.prepare(`SELECT bot_state, strategy_key, margin_pct, max_leverage FROM bot_configs WHERE user_id = 'usr_web_link_1'`)
      .first<{ bot_state: string; strategy_key: string; margin_pct: number; max_leverage: number }>();
    expect(wizCfg?.bot_state).toBe('RUNNING_PAPER');
    expect(wizCfg?.strategy_key).toBe('ai_autonomous_agent');
    expect(wizCfg?.margin_pct).toBe(10);
    expect(wizCfg?.max_leverage).toBe(10);

    // Register Trust Wallet EVM address via Telegram flow
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 26,
      callback_query: { id: 'cq_tw_add', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 28 }, data: 'tg_tw_set:evm' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 27,
      message: { message_id: 29, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
    });
    const twRow = await db.prepare(`SELECT trust_wallet_address FROM users WHERE id = 'usr_web_link_1'`).first<{ trust_wallet_address: string }>();
    expect(twRow?.trust_wallet_address).toBe('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
    expect(tgCalls[0]?.body.text).toContain('ثبت و تایید شد');

    // DexScreener Trending & Search via Telegram
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 28,
      callback_query: { id: 'cq_dex', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 30 }, data: 'tg_dex_trending' },
    });
    expect(tgCalls.some((c) => String(c.body.text).includes('DGEM') && JSON.stringify(c.body.reply_markup).includes('Trust Wallet'))).toBe(true);
  });

  it('supports Subscription TRC20 invoice, TXID verify, Super Admin 944021185 panel, CSV/JSON reports & admin permissions', async () => {
    const env = makeEnv();

    // Non-admin cannot add admin or open admin callbacks
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 30,
      message: { message_id: 40, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: 'افزودن مدیر 🔑' },
    });
    expect(tgCalls[0]?.body.text).toContain('فقط مدیر اصلی سیستم (944021185)');

    // User buys pro_monthly plan -> verify -> submits TXID
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 31,
      callback_query: { id: 'cq_buy', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 41 }, data: 'sub_buy:pro_monthly' },
    });
    const subRow = await db.prepare(`SELECT id FROM user_subscriptions WHERE user_id = 'usr_web_link_1' AND status = 'PENDING_REVIEW' ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    expect(subRow?.id).toBeTruthy();

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 32,
      callback_query: { id: 'cq_ver', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 41 }, data: `sub_verify:${subRow!.id}` },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 33,
      message: { message_id: 42, from: { id: 1002009 }, chat: { id: 1002009, type: 'private' }, text: 'TRC20_HASH_998877' },
    });
    expect(tgCalls.some((c) => String(c.body.chat_id) === '944021185' && String(c.body.text).includes('TRC20_HASH_998877'))).toBe(true);

    // Super Admin (944021185) enters Admin Panel & tests Dashboard, Toggle Phone KYC, Approve TX, CSV/JSON Reports, Admin Management
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 34,
      message: { message_id: 50, from: { id: 944021185, first_name: 'Owner' }, chat: { id: 944021185, type: 'private' }, text: 'پنل مدیریت 💼' },
    });
    expect(tgCalls[0]?.body.text).toContain('پنل مدیریت جامع دلارینو');

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 35,
      callback_query: { id: 'cq_dash', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: 'adm:dash' },
    });
    expect(tgCalls.some((c) => String(c.body.text).includes('داشبورد مالی و آمار لحظه‌ای دلارینو') && String(c.body.text).includes('احراز تلفن:'))).toBe(true);

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 36,
      callback_query: { id: 'cq_app', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: `adm:tx_approve:${subRow!.id}` },
    });
    const approved = await db.prepare('SELECT status FROM user_subscriptions WHERE id = ?').bind(subRow!.id).first<{ status: string }>();
    expect(approved?.status).toBe('ACTIVE');

    // Reports: Excel/CSV + JSON via sendDocument
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 37,
      callback_query: { id: 'cq_csv', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: 'adm:rep:month:csv' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 38,
      callback_query: { id: 'cq_json', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: 'adm:rep:month:json' },
    });
    expect(tgCalls.some((c) => c.method === 'sendDocument' && JSON.stringify(c.body).includes('dollarino-report-month.csv'))).toBe(true);
    expect(tgCalls.some((c) => c.method === 'sendDocument' && JSON.stringify(c.body).includes('dollarino-report-month.json'))).toBe(true);

    // Super Admin promotes 1002009 to admin, confirms delegated admin cannot access adm:admins
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 39,
      callback_query: { id: 'cq_aa', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: 'adm:adm_add' },
    });
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 40,
      message: { message_id: 52, from: { id: 944021185 }, chat: { id: 944021185, type: 'private' }, text: '1002009' },
    });
    const promoted = await db.prepare('SELECT role FROM users WHERE telegram_id = ?').bind('1002009').first<{ role: string }>();
    expect(promoted?.role).toBe('admin');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 41,
      callback_query: { id: 'cq_blocked', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 53 }, data: 'adm:admins' },
    });
    expect(tgCalls[0]?.body.text).toContain('فقط مدیر اصلی (944021185)');

    // Test 15-min admin idle session expiration
    await db.prepare(`UPDATE users SET admin_panel_last_active_at = datetime('now', '-20 minutes') WHERE telegram_id = '944021185'`).run();
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 42,
      callback_query: { id: 'cq_exp', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 51 }, data: 'adm:dash' },
    });
    expect(tgCalls[0]?.body.text).toContain('منقضی شد');
  });

  it('handles @Dollarino_official (-1002263982097) signal routing + manual two-step confirmation + Win/Loss card format', async () => {
    const env = makeEnv();
    await db.prepare(`UPDATE bot_configs SET trade_execution_mode = 'MANUAL_CONFIRM' WHERE user_id = 'usr_web_link_1'`).run();

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 50,
      channel_post: {
        message_id: 901,
        chat: { id: -1002263982097, username: 'Dollarino_official' },
        text: `🟢 Buy signal\n💲Symbol: BTCUSDT\n⌛️Time Frame: 15m\n🔔 Price: 90000\n🔘 Leverage: 10\n⛔️ Stop: 88000\n🟢Tp1: 92000\n🟡Tp2: 94000\n🟠Tp3: 96000\n🆔 : @Dollarino_official`,
      },
    });

    const manualPrompt = tgCalls.find((c) => String(c.body.chat_id) === '1002009' && JSON.stringify(c.body.reply_markup).includes('دلارینو ترید کن برام'));
    expect(manualPrompt).toBeTruthy();

    const sigRow = await db.prepare(`SELECT id FROM signals ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 51,
      callback_query: { id: 'cq_m1', from: { id: 1002009 }, message: { chat: { id: 1002009 }, message_id: 60 }, data: `manual_trade:${sigRow!.id}` },
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

    // Verify Sara (2002002) via own contact first
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 60,
      message: {
        message_id: 70,
        from: { id: 2002002, first_name: 'سارا' },
        chat: { id: 2002002, type: 'private' },
        contact: { phone_number: '+989127778899', first_name: 'سارا', user_id: 2002002 },
      },
    });
    expect(JSON.stringify(tgCalls.find((c) => c.body.reply_markup && JSON.stringify(c.body.reply_markup).includes('"style":"primary"'))?.body.reply_markup)).toContain('"style":"primary"');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 61,
      callback_query: { id: 'cq_acc', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 71 }, data: 'tg_acc:ai' },
    });
    const accEdit = tgCalls.find((c) => c.method === 'editMessageText');
    expect(JSON.stringify(accEdit?.body.reply_markup)).toContain('آموزش به هوش مصنوعی من');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 62,
      callback_query: { id: 'cq_gate', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 71 }, data: 'tg_mode_simple_ai' },
    });
    expect(tgCalls.some((c) => String(c.body.text).includes('تعرفه‌های فعال'))).toBe(true);

    // Train Personal Raw AI ("هوش مصنوعی من")
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 63,
      callback_query: { id: 'cq_myai', from: { id: 2002002 }, message: { chat: { id: 2002002 }, message_id: 71 }, data: 'tg_myai_train' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 64,
      message: { message_id: 72, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: 'تایم 15m با RSI زیر 35 و EMA 9/21 فقط BTC و ETH حد ضرر 2% حد سود 5%' },
    });
    expect(tgCalls[0]?.body.text).toContain('یاد گرفتم');
    const aiRow = await db.prepare(`SELECT system_rules_json FROM user_ai_agents uaa JOIN users u ON u.id = uaa.user_id WHERE u.telegram_id = '2002002'`).first<{ system_rules_json: string }>();
    expect(aiRow?.system_rules_json).toContain('"BTCUSDT"');

    // Online Support -> Admin reply synced back
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 65,
      message: { message_id: 73, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: '💬 پشتیبانی آنلاین' },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 66,
      message: { message_id: 74, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: 'سلام اشتراک ماهانه چطور فعال کنم؟' },
    });
    const tkt = await db.prepare(`SELECT id FROM support_tickets ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>();
    expect(tkt?.id).toBeTruthy();

    // Ensure admin 944021185 session is active
    await db.prepare(`UPDATE users SET admin_panel_last_active_at = datetime('now') WHERE telegram_id = '944021185'`).run();
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 67,
      callback_query: { id: 'cq_sup_rep', from: { id: 944021185 }, message: { chat: { id: 944021185 }, message_id: 80 }, data: `adm:sup_reply:${tkt!.id}` },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 68,
      message: { message_id: 81, from: { id: 944021185 }, chat: { id: 944021185, type: 'private' }, text: 'از منوی خرید اشتراک پلن را انتخاب کنید.' },
    });
    expect(tgCalls.some((c) => String(c.body.chat_id) === '2002002' && String(c.body.text).includes('پاسخ پشتیبانی آنلاین'))).toBe(true);
  });

  it('verifies HTTP Worker APIs for Extension Key Auth, UI Preferences, DexScreener AI/Trades, Trust Wallet & Admin Overview', async () => {
    const env = makeEnv();

    // 1. Register user via HTTP API
    const regRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'extuser@dollarino.test', username: 'ExtTrader', password: 'password123' }),
      }),
      env
    );
    expect(regRes.status).toBe(201);
    const regJson = (await regRes.json()) as { token: string; user: { id: string } };
    expect(regJson.token).toBeTruthy();

    // 2. Generate Extension API Key & authenticate via X-Dollarino-Extension-Key
    const extKeyRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/extension-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regJson.token}` },
      }),
      env
    );
    expect(extKeyRes.status).toBe(200);
    const { extensionApiKey } = (await extKeyRes.json()) as { extensionApiKey: string };
    expect(extensionApiKey).toMatch(/^dlr_ext_/);

    const dashViaExt = await worker.fetch(
      new Request('https://dollarino.test/api/trading/dashboard', {
        headers: { 'X-Dollarino-Extension-Key': extensionApiKey },
      }),
      env
    );
    expect(dashViaExt.status).toBe(200);

    // 3. Update UI Mode & Mobile Widgets
    const uiPrefRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/ui-preferences', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${regJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiMode: 'pro', mobileWidgets: ['dex_radar', 'bot_toggle', 'live_report'] }),
      }),
      env
    );
    expect(uiPrefRes.status).toBe(200);

    // 4. Register Trust Wallet EVM address & fetch live balances
    const twRes = await worker.fetch(
      new Request('https://dollarino.test/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ evmAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' }),
      }),
      env
    );
    expect(twRes.status).toBe(200);

    const balRes = await worker.fetch(
      new Request('https://dollarino.test/api/trustwallet/balance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regJson.token}` },
      }),
      env
    );
    expect(balRes.status).toBe(200);
    const balJson = (await balRes.json()) as { balances: { bnb: string } };
    expect(Number(balJson.balances.bnb)).toBeGreaterThan(0);

    // 5. DexScreener Trending, AI Analysis, and Trade Execution
    const dexTrend = await worker.fetch(
      new Request('https://dollarino.test/api/dex/trending', {
        headers: { Authorization: `Bearer ${regJson.token}` },
      }),
      env
    );
    expect(dexTrend.status).toBe(200);
    const trendJson = (await dexTrend.json()) as { pairs: Array<{ baseToken: { symbol: string } }> };
    expect(trendJson.pairs.some((p) => p.baseToken.symbol === 'DGEM')).toBe(true);

    const dexAi = await worker.fetch(
      new Request('https://dollarino.test/api/dex/ai-analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: 'bsc', tokenAddress: '0x1111111111111111111111111111111111111111' }),
      }),
      env
    );
    expect(dexAi.status).toBe(200);
    const dexAiJson = (await dexAi.json()) as {
      analysis: string;
      pair: { safetyScore: number };
      suggestedLevels: { entryUsd: number; stopLossUsd: number; tp1Usd: number };
    };
    expect(typeof dexAiJson.analysis).toBe('string');
    expect(dexAiJson.analysis.length).toBeGreaterThan(10);
    expect(dexAiJson.pair.safetyScore).toBeGreaterThan(0);
    expect(dexAiJson.suggestedLevels.tp1Usd).toBeGreaterThan(dexAiJson.suggestedLevels.entryUsd);

    const dexTrade = await worker.fetch(
      new Request('https://dollarino.test/api/trustwallet/dex-trades', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'bsc',
          tokenSymbol: 'DGEM',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          amountUsd: 150,
          entryPriceUsd: 0.0254,
        }),
      }),
      env
    );
    expect(dexTrade.status).toBe(200);

    // 6. Verify Owner Admin Overview & DEX Trades Endpoint
    await db.prepare(`UPDATE users SET role = 'owner' WHERE id = ?`).bind(regJson.user.id).run();
    const [adminOv, adminDex] = await Promise.all([
      worker.fetch(
        new Request('https://dollarino.test/api/admin/overview', {
          headers: { Authorization: `Bearer ${regJson.token}` },
        }),
        env
      ),
      worker.fetch(
        new Request('https://dollarino.test/api/admin/dex-trades', {
          headers: { Authorization: `Bearer ${regJson.token}` },
        }),
        env
      ),
    ]);
    expect(adminOv.status).toBe(200);
    expect(adminDex.status).toBe(200);
    const ovJson = (await adminOv.json()) as { stats: { phoneVerifiedCount: number; trustWalletConnectedCount: number; dexTradesTotal: number } };
    expect(ovJson.stats.phoneVerifiedCount).toBeGreaterThanOrEqual(3);
    expect(ovJson.stats.trustWalletConnectedCount).toBeGreaterThanOrEqual(2);
    expect(ovJson.stats.dexTradesTotal).toBeGreaterThanOrEqual(1);
  });

  it('renders RTL watermarked Profit & Signal Closed PNG cards, handles channel signals, copy-trader confirmation & anti-scam policy', async () => {
    const env = makeEnv();

    const profitH = await renderProfitCardPng({
      cardId: 'card_test_h1',
      displayName: 'کیارش',
      mode: 'LIVE',
      period: '1Y',
      netPnlUsd: 2450.75,
      roiPct: 148.5,
      tradesCount: 42,
      winRate: 78.6,
      profitFactor: 2.85,
      exchangeProvider: 'TOOBIT',
      strategyName: 'dollarino_v01',
      issuedAt: '2026-11-21T12:00:00Z',
      layout: 'horizontal',
    });
    expect(profitH).toBeTruthy();
    expect(profitH!.length).toBeGreaterThan(20_000);
    expect(profitH![0]).toBe(0x89);
    expect(profitH![1]).toBe(0x50);

    const closedV = await renderSignalClosedCardPng({
      cardId: 'SIG-TESTV1',
      symbol: 'ETHUSDT',
      direction: 'LONG',
      leverage: 15,
      engineLabel: '🎯 استراتژی شکار (دُرنا V1)',
      mode: 'LIVE',
      entryPrice: '3100',
      exitPrice: '3286',
      pnlUsd: 450,
      pnlPct: 90.0,
      tp1Hit: true,
      tp2Hit: true,
      tp3Hit: false,
      trailingActive: true,
      trailingSlPrice: '3220',
      closeReason: 'TP2',
      openedAt: '2026-11-21T08:00:00Z',
      closedAt: '2026-11-21T12:00:00Z',
      layout: 'vertical',
    });
    expect(closedV).toBeTruthy();
    expect(closedV!.length).toBeGreaterThan(20_000);

    tgCalls = [];
    const pubSig = await publishSignalBroadcast(env, {
      source: 'admin_channel',
      engineKey: 'dollarino_v01',
      publishToChannel: true,
      signal: {
        symbol: 'SOLUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '240',
        stopLoss: '232',
        tp1: '248',
        tp2: '256',
        tp3: '264',
        leverage: 10,
        engineKey: 'dollarino_v01',
        reason: 'Breakout confirmed',
      },
    });
    expect(pubSig.signalId).toBeTruthy();
    expect(pubSig.channelMessageId).toBeTruthy();
    const chanPost = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '@Dollarino_official');
    expect(chanPost).toBeTruthy();
    expect(JSON.stringify(chanPost?.body.reply_markup)).toContain(`sig_${pubSig.signalId}`);

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 80,
      message: { message_id: 90, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: '/support' },
    });
    const supMsg = String(tgCalls[0]?.body.text || '');
    expect(supMsg).not.toContain('Dollarino_admin');
    expect(supMsg).toContain('@Dollarino_bot');
    expect(supMsg).toContain('هیچ اکانت پیوی شخصی');

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 81,
      message: { message_id: 91, from: { id: 2002002 }, chat: { id: 2002002, type: 'private' }, text: '/card' },
    });
    expect(JSON.stringify(tgCalls[0]?.body.reply_markup)).toContain('tg_profit_issue:1Y:horizontal');

    const followerRow = await db.prepare(`SELECT id FROM users WHERE telegram_id = '2002002'`).first<{ id: string }>();
    await db.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, expires_at) VALUES ('sub_f1', ?, 'pro_monthly', 'ACTIVE', datetime('now', '+30 days'))`
    ).bind(followerRow!.id).run();
    await db.prepare(
      `INSERT INTO copy_traders (id, display_name, handle, specialty, win_rate, roi_30d_pct, max_drawdown_pct, followers_count, risk_level, is_verified, is_active, auto_ask_publish)
       VALUES ('ct_test1', 'استاد آریا', '@arya_pro', 'BTC/ETH', 82, 45, 4.5, 1, 'LOW', 1, 1, 1)`
    ).run();
    await db.prepare(
      `INSERT INTO copy_subscriptions (id, user_id, trader_id, allocation_usd, is_active) VALUES ('cs_1', ?, 'ct_test1', 150, 1)`
    ).bind(followerRow!.id).run();
    await db.prepare(
      `INSERT INTO copy_trader_trades (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, status, publish_status)
       VALUES ('ctt_phase2_1', 'ct_test1', 'BTCUSDT', 'LONG', 10, '92000', '90000', '96000', 'OPEN', 'PENDING_CONFIRM')`
    ).run();

    const mirrorRes = await confirmAndMirrorCopyTrade(env, 'ctt_phase2_1', true);
    expect(mirrorRes.ok).toBe(true);
    expect(mirrorRes.published).toBe(true);
    expect(mirrorRes.mirroredCount).toBe(1);

    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 82,
      callback_query: {
        id: 'cq_adm_chan',
        from: { id: 944021185, username: 'owner' },
        message: { chat: { id: 944021185 }, message_id: 92 },
        data: 'adm:channel',
      },
    });
    const chanMenu = tgCalls.find((c) => c.method === 'editMessageText');
    expect(String(chanMenu?.body.text || '')).toContain('@Dollarino_official');

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 83,
      callback_query: {
        id: 'cq_adm_news',
        from: { id: 944021185, username: 'owner' },
        message: { chat: { id: 944021185 }, message_id: 92 },
        data: 'adm:chan_news:NEWS',
      },
    });
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 84,
      message: {
        message_id: 93,
        from: { id: 944021185, username: 'owner' },
        chat: { id: 944021185, type: 'private' },
        text: 'گزارش هفتگی بازار\nبیت‌کوین سقف کلیدی را شکست و موتور دُرنا V1 فعال است.',
      },
    });
    const newsPost = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '@Dollarino_official');
    expect(newsPost).toBeTruthy();
    expect(String(newsPost?.body.text || '')).toContain('گزارش هفتگی بازار');
  });

  it('supports v9.5 Telegram avatar proxy, instant AI scan-now fallback, price alerts CRUD, and AI->Human support escalation', async () => {
    const env = makeEnv();

    // 1. Register & login a web user with telegram_id + avatar proxy check
    const reg = await worker.fetch(
      new Request('https://dollarino.local/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'v95@dollarino.local',
          password: 'Password123!',
          username: 'v95trader',
        }),
      }),
      env
    );
    expect(reg.status).toBe(201);
    const regData = (await reg.json()) as { token: string; user: { id: string } };
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${regData.token}`,
    };

    // Simulate Telegram link & photo sync
    await db
      .prepare(`UPDATE users SET telegram_id = '99887766', telegram_avatar_file_id = 'tg_photo_file_123', avatar_url = ? WHERE id = ?`)
      .bind(`/api/auth/avatar/${regData.user.id}`, regData.user.id)
      .run();

    const avatarRes = await worker.fetch(new Request(`https://dollarino.local/api/auth/avatar/${regData.user.id}`), env);
    expect(avatarRes.status).toBe(200);
    expect(avatarRes.headers.get('Content-Type')).toContain('image/jpeg');

    const toggleAvatar = await worker.fetch(
      new Request('https://dollarino.local/api/auth/profile', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ useTelegramAvatar: true }),
      }),
      env
    );
    expect(toggleAvatar.status).toBe(200);
    const toggleBody = (await toggleAvatar.json()) as { ok: boolean; user: { avatar_url: string; avatar_custom: number } };
    expect(toggleBody.ok).toBe(true);
    expect(toggleBody.user.avatar_url).toBe(`/api/auth/avatar/${regData.user.id}`);
    expect(toggleBody.user.avatar_custom).toBe(0);

    // 2. Price Alerts CRUD
    const createAlert = await worker.fetch(
      new Request('https://dollarino.local/api/trading/alerts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ symbol: 'BTCUSDT', condition: 'ABOVE', targetPrice: 98500, note: 'Breakout level' }),
      }),
      env
    );
    expect([200, 201]).toContain(createAlert.status);
    const createdAlertJson = (await createAlert.json()) as { ok: boolean; alert: { id: string; symbol: string } };
    expect(createdAlertJson.ok).toBe(true);
    expect(createdAlertJson.alert.symbol).toBe('BTCUSDT');

    const listAlerts = await worker.fetch(
      new Request('https://dollarino.local/api/trading/alerts', { headers: authHeaders }),
      env
    );
    const listAlertsJson = (await listAlerts.json()) as { alerts: Array<{ id: string }> };
    expect(listAlertsJson.alerts.some((a) => a.id === createdAlertJson.alert.id)).toBe(true);

    const delAlert = await worker.fetch(
      new Request(`https://dollarino.local/api/trading/alerts/${createdAlertJson.alert.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
      env
    );
    expect(delAlert.status).toBe(200);

    // 3. AI Scan Now (even when external LLM response is unavailable or mocked -> Hybrid Quant-AI succeeds)
    const scanRes = await worker.fetch(
      new Request('https://dollarino.local/api/trading/ai-scan-now', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h', autoExecute: false }),
      }),
      env
    );
    expect(scanRes.status).toBe(200);
    const scanJson = (await scanRes.json()) as {
      ok: boolean;
      results: Array<{ symbol: string; confidence: number; action: string }>;
    };
    expect(scanJson.ok).toBe(true);
    expect(scanJson.results[0]?.symbol).toBe('BTCUSDT');
    expect(scanJson.results[0]?.confidence).toBeGreaterThan(0);

    // 4. Smart Support: AI Assistant instant answer -> Escalate to Human -> Switch back to AI
    const supMsgRes = await worker.fetch(
      new Request('https://dollarino.local/api/support/message', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ message: 'چرا ربات هنوز معامله باز نکرده؟', mode: 'AI' }),
      }),
      env
    );
    expect([200, 201]).toContain(supMsgRes.status);
    const supMsgJson = (await supMsgRes.json()) as {
      ok: boolean;
      ticketId: string;
      supportMode: string;
      aiReply: { id: string; sender_role: string; sender_name: string; message: string } | null;
    };
    expect(supMsgJson.ok).toBe(true);
    expect(supMsgJson.supportMode).toBe('AI_ASSISTANT');
    expect(typeof supMsgJson.aiReply?.message).toBe('string');
    expect((supMsgJson.aiReply?.message || '').length).toBeGreaterThan(10);

    const escRes = await worker.fetch(
      new Request('https://dollarino.local/api/support/escalate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ticketId: supMsgJson.ticketId, reason: 'Need admin review' }),
      }),
      env
    );
    expect(escRes.status).toBe(200);
    const escJson = (await escRes.json()) as { ok: boolean; supportMode: string };
    expect(escJson.supportMode).toBe('HUMAN_ADMIN');

    const backAiRes = await worker.fetch(
      new Request('https://dollarino.local/api/support/switch-ai', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ticketId: supMsgJson.ticketId }),
      }),
      env
    );
    expect(backAiRes.status).toBe(200);
    const backAiJson = (await backAiRes.json()) as { ok: boolean; supportMode: string };
    expect(backAiJson.supportMode).toBe('AI_ASSISTANT');
  });
});
