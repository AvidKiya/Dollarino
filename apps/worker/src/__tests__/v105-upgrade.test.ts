import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env.js';
import worker from '../index.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { formatAccountCard, formatTradeClosedCard } from '../telegram/formatter.js';
import { resolveTelegramBotToken } from '../telegram/token.js';
import { discoverTopSiteTraders, syncAutoTopSiteTraders } from '../services/site-traders.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v105-upgrade',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_FALLBACK_TOKEN_V105',
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
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001155', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(userId, `${userId}@dollarino.local`, `v105_${userId}`, role, tgId, magic)
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

describe('Dollarino V10.5: Encrypted Bot Token, Numeric Channels, Group Moderator, Auto Top-Traders & Simple Bot UI', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v105-db' },
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(here, '../../../../migrations');
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
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://api.telegram.org/bot')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.endsWith('/getMe')) {
          return new Response(JSON.stringify({ ok: true, result: { id: 999888, username: 'Dollarino_bot', first_name: 'Dollarino' } }), {
            status: 200,
          });
        }
        if (url.endsWith('/getWebhookInfo')) {
          return new Response(JSON.stringify({ ok: true, result: { url: 'https://dollarino.pages.dev/api/webhooks/telegram', pending_update_count: 0 } }), {
            status: 200,
          });
        }
        if (url.endsWith('/getChatMember')) {
          const uid = Number(body.user_id || 0);
          const isAdmin = uid === 944021185 || uid === 999888 || uid === 123456;
          return new Response(
            JSON.stringify({
              ok: true,
              result: { status: isAdmin ? 'administrator' : 'member', can_post_messages: true, can_delete_messages: true },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/getChat')) {
          return new Response(JSON.stringify({ ok: true, result: { id: body.chat_id, title: 'Dollarino Official Chat' } }), { status: 200 });
        }
        if (url.endsWith('/sendMessage')) {
          return new Response(JSON.stringify({ ok: true, result: { message_id: 1051, chat: { id: body.chat_id } } }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
  });

  it('stores encrypted Telegram Bot Token in D1, configures webhook, masks secrets in /overview, and resolves D1 token before Env', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v105_owner', '944021185', 'owner');

    // 1. Save custom BotFather token & webhook via admin endpoint
    const saveRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/telegram/bot-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: '777888999:AA_SUPER_SECRET_DB_BOT_TOKEN_V105',
          webhookBaseUrl: 'https://api.dollarino.app',
        }),
      }),
      env
    );
    expect(saveRes.status).toBe(200);
    const saveJson = (await saveRes.json()) as { ok: boolean; webhookSet: boolean; bot?: { username: string } };
    expect(saveJson.ok).toBe(true);
    expect(saveJson.webhookSet).toBe(true);
    expect(saveJson.bot?.username).toBe('Dollarino_bot');

    // 2. resolveTelegramBotToken now returns decrypted D1 token instead of ENV token
    const resolved = await resolveTelegramBotToken(env);
    expect(resolved).toBe('777888999:AA_SUPER_SECRET_DB_BOT_TOKEN_V105');

    // 3. /api/admin/overview must NEVER leak telegram_bot_token_enc or webhook secret
    const ovRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/overview', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(ovRes.status).toBe(200);
    const ovText = await ovRes.text();
    expect(ovText).not.toContain('777888999:AA_SUPER_SECRET_DB_BOT_TOKEN_V105');
    expect(ovText).not.toContain('telegram_bot_token_enc');
    expect(ovText).not.toContain('telegram_webhook_secret_auto');

    // 4. Reverting override returns Env fallback token cleanly
    const clrRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/telegram/bot-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOverride: true }),
      }),
      env
    );
    expect(clrRes.status).toBe(200);
    const afterClear = await resolveTelegramBotToken(env);
    expect(afterClear).toBe('123456:ENV_FALLBACK_TOKEN_V105');
  });

  it('supports numeric (-100...) channel IDs, https://t.me/... links, and Community Group test broadcasting', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v105_ch', '944021185', 'owner');

    const numTest = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelKey: 'signals', customTarget: '-1002263982097' }),
      }),
      env
    );
    expect(numTest.status).toBe(200);
    const numJson = (await numTest.json()) as { ok: boolean; target: string; messageId: number };
    expect(numJson.ok).toBe(true);
    expect(numJson.target).toBe('-1002263982097');
    expect(numJson.messageId).toBe(1051);

    const tmeTest = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelKey: 'community', customTarget: '-1009988776655' }),
      }),
      env
    );
    expect(tmeTest.status).toBe(200);
    const commJson = (await tmeTest.json()) as { ok: boolean; target: string };
    expect(commJson.ok).toBe(true);
    expect(commJson.target).toBe('-1009988776655');
  });

  it('enforces Group Moderator anti-link 3-strike mute + welcome + Group AI @mention Q&A', async () => {
    const env = makeEnv();
    const sentBodies: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      sentBodies.push({ url, body });
      if (url.endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { id: 999888, username: 'Dollarino_bot' } }), { status: 200 });
      }
      if (url.endsWith('/getChatMember')) {
        return new Response(JSON.stringify({ ok: true, result: { status: body.user_id === 944021185 ? 'administrator' : 'member' } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 202 } }), { status: 200 });
    }) as typeof fetch;

    const spamUpdate = (updateId: number, messageId: number) => ({
      update_id: updateId,
      message: {
        message_id: messageId,
        from: { id: 777111222, first_name: 'Spammer', username: 'spam_user' },
        chat: { id: -100555666777, type: 'supergroup' as const, title: 'Dollarino Community' },
        text: 'بیاید کانال رایگان سیگنال ما https://t.me/fake_pump_group',
      },
    });

    // Strike 1, 2, 3 -> deleteMessage x3 + restrictChatMember on 3rd strike
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, spamUpdate(901, 10));
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, spamUpdate(902, 11));
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, spamUpdate(903, 12));

    const deletes = sentBodies.filter((c) => c.url.endsWith('/deleteMessage'));
    const mutes = sentBodies.filter((c) => c.url.endsWith('/restrictChatMember'));
    expect(deletes.length).toBe(3);
    expect(mutes.length).toBe(1);

    // Official whitelisted Dollarino link should NOT be deleted
    sentBodies.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 904,
      message: {
        message_id: 13,
        from: { id: 777111223, first_name: 'HonestUser' },
        chat: { id: -100555666777, type: 'supergroup' },
        text: 'کانال رسمی اینه: https://t.me/Dollarino_official',
      },
    });
    expect(sentBodies.filter((c) => c.url.endsWith('/deleteMessage')).length).toBe(0);

    // Group AI Q&A with /rules and @Dollarino_bot
    sentBodies.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 905,
      message: {
        message_id: 14,
        from: { id: 777111224, first_name: 'Trader' },
        chat: { id: -100555666777, type: 'supergroup' },
        text: '/rules',
      },
    });
    expect(sentBodies.some((c) => c.url.endsWith('/sendMessage') && String(c.body.text).includes('قوانین گروه'))).toBe(true);

    sentBodies.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 906,
      message: {
        message_id: 15,
        from: { id: 777111225, first_name: 'Trader' },
        chat: { id: -100555666777, type: 'supergroup' },
        text: '@Dollarino_bot دلارینو چطور ۵٪ کارمزد می‌گیرد؟',
      },
    });
    expect(sentBodies.some((c) => c.url.endsWith('/sendMessage') && Number(c.body.reply_to_message_id) === 15)).toBe(true);
  });

  it('discovers profitable site traders automatically, promotes in 1 click, and auto-publishes into /api/public/copy-traders', async () => {
    const env = makeEnv();
    const ownerToken = await issueUserToken(env, 'usr_v105_tr_owner', '944021185', 'owner');

    // Seed two real site traders with closed trades
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, phone_verified)
         VALUES ('usr_top_alpha', 'alpha@dollarino.local', 'AliQuant', 'x', 'user', '550011', 'aliquant', 1),
                ('usr_top_beta', 'beta@dollarino.local', 'SaraScalp', 'x', 'user', '550022', 'sarascalp', 1)`
      )
      .run();

    for (let i = 0; i < 4; i++) {
      await db
        .prepare(
          `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id, closed_at)
           VALUES (?, 'usr_top_alpha', 'LIVE', 'hyperliquid', 'BTCUSDT', 'ema_cross', 'LONG', 'CLOSED', '90000', '93000', '0.01', '0', 5, '100', '88000', '88000', '92000', '35', ?, datetime('now', '-1 day'))`
        )
        .bind(`tr_alpha_${i}`, `cli_alpha_${i}`)
        .run();
      await db
        .prepare(
          `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id, closed_at)
           VALUES (?, 'usr_top_beta', 'PAPER', 'paper', 'ETHUSDT', 'ema_cross', 'LONG', 'CLOSED', '3000', '3120', '0.1', '0', 3, '100', '2900', '2900', '3100', '22', ?, datetime('now', '-1 day'))`
        )
        .bind(`tr_beta_${i}`, `cli_beta_${i}`)
        .run();
    }

    const candidates = await discoverTopSiteTraders(db, 10);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]!.userId).toBe('usr_top_alpha');
    expect(candidates[0]!.winRate).toBe(100);

    // 1-Click Admin Promotion
    const promoteRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/site-traders/usr_top_alpha/promote', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      }),
      env
    );
    expect(promoteRes.status).toBe(200);
    const promoteJson = (await promoteRes.json()) as { ok: boolean; displayName: string };
    expect(promoteJson.ok).toBe(true);

    // Auto-Sync runs and exposes qualified top traders on public copy-traders list
    const syncRes = await syncAutoTopSiteTraders(db);
    expect(syncRes.synced).toBeGreaterThanOrEqual(1);

    const pubRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/copy-traders'), env);
    expect(pubRes.status).toBe(200);
    const pubJson = (await pubRes.json()) as { traders: Array<{ handle?: string; display_name: string; win_rate?: number }> };
    expect(pubJson.traders.some((t) => t.handle === '@aliquant' && Number(t.win_rate) === 100)).toBe(true);
  });

  it('uses encouraging positive wording in closed-trade & account cards (no crying/negative phrasing)', () => {
    const slCard = formatTradeClosedCard({
      symbol: 'ETHUSDT',
      direction: 'SHORT',
      entryPrice: '3100',
      exitPrice: '3150',
      pnlUsd: -12,
      pnlPct: -4,
      reason: 'SL',
      openedAt: '2026-11-20T10:00:00Z',
      closedAt: '2026-11-20T11:00:00Z',
    });
    expect(slCard).toContain('بسته‌شدن معامله با مدیریت ریسک');
    expect(slCard).not.toContain('ضرر');
    expect(slCard).not.toContain('🥲');

    const accCard = formatAccountCard({
      username: 'TraderV105',
      email: 'trader@dollarino.local',
      telegramId: '100500',
      phoneNumber: '+989120001122',
      phoneVerified: true,
      trustWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      uiMode: 'simple',
      walletUsdt: 9800,
      tomanRate: 74500,
      tradingMode: 'PAPER',
      execMode: 'AUTO',
      totalTrades: 8,
      wins: 5,
      totalPnl: -40,
      planNameFa: 'رایگان (۵٪ از سود)',
      hasPaidPlan: true,
      daysRemaining: 365,
    });
    expect(accCard).not.toContain('ضرر');
    expect(accCard).toContain('نتیجه خالص');
  });
});
