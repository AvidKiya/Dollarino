import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signJwt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import {
  publishChannelNews,
  publishDatabaseReport,
  publishOfficialAnnouncement,
  publishSignalBroadcast,
  publishSignalClosedCard,
  publishSystemLogEvent,
  publishTransactionEvent,
} from '../telegram/publisher.js';

let mf: Miniflare;
let db: D1Database;
let tgCalls: Array<{ method: string; body: Record<string, unknown> }> = [];

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
    SESSION_JWT_SECRET: 'ecosystem-171-test-jwt-secret-key-2026',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ALLOW_LIVE_TRADING: 'true',
    TELEGRAM_BOT_TOKEN: '999999:TEST_TOKEN_171_ECOSYSTEM',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

describe('Official DOLLARINO 1+7+1 Ecosystem (Bot + Main + 7 Channels/Group)', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'dollarino-official-171-db' },
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await db.prepare(stmt).run();
      }
    }

    // Seed an owner account & verified user
    await db
      .prepare(
        `INSERT OR REPLACE INTO users (
          id, email, password_hash, username, display_name, role, telegram_id, telegram_username,
          phone_number, phone_verified, profile_completed, must_change_credentials
        ) VALUES
        ('usr_owner_171', 'owner@dollarino.test', 'test-hash-owner-171', 'owner171', 'Owner 171', 'owner', '944021185', 'owner171', '+989120000001', 1, 1, 0),
        ('usr_trader_171', 'trader@dollarino.test', 'test-hash-trader-171', 'trader171', 'Trader 171', 'user', '777888999', 'trader171', '+989120000002', 1, 1, 0)`
      )
      .run();

    // Configure full 1+7+1 ecosystem settings
    for (const [k, v] of [
      ['bot_username', 'DollarinoOfficialBot'],
      ['official_channel', '@Dollarino_Official'],
      ['official_channel_invite', 'https://t.me/Dollarino_Official'],
      ['signals_channel_id', '-1001110000001'],
      ['signals_channel_invite', 'https://t.me/Dollarino_Signals'],
      ['results_channel_id', '-1001110000002'],
      ['results_channel_invite', 'https://t.me/Dollarino_Results'],
      ['community_group_id', '-1001110000003'],
      ['community_group_invite', 'https://t.me/+DollarinoGroupInvite'],
      ['logs_channel_id', '-1009990000004'],
      ['database_channel_id', '-1009990000005'],
      ['transactions_channel_id', '-1009990000006'],
      ['news_channel_id', '@Dollarino_News'],
      ['news_channel_invite', 'https://t.me/Dollarino_News'],
      ['channel_official_enabled', 'true'],
      ['channel_signals_enabled', 'true'],
      ['channel_results_enabled', 'true'],
      ['channel_community_enabled', 'true'],
      ['channel_logs_enabled', 'true'],
      ['channel_database_enabled', 'true'],
      ['channel_transactions_enabled', 'true'],
      ['channel_news_enabled', 'true'],
      ['signals_also_official', 'false'],
      ['database_report_interval_hours', '6'],
    ]) {
      await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`).bind(k, v).run();
    }
    invalidateSettingsCache(db);

    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
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
        tgCalls.push({ method, body });

        if (method === 'getMe') {
          return Response.json({ ok: true, result: { id: 999999, is_bot: true, username: 'DollarinoOfficialBot' } });
        }
        if (method === 'getChat') {
          return Response.json({ ok: true, result: { id: body.chat_id, title: `Chat ${String(body.chat_id)}`, type: 'channel' } });
        }
        if (method === 'getChatMember') {
          return Response.json({ ok: true, result: { status: 'administrator', can_post_messages: true } });
        }
        return Response.json({
          ok: true,
          result: { message_id: 950 + tgCalls.length, chat: { id: body.chat_id ?? 1, type: 'channel' } },
        });
      }
      return new Response('Not Found', { status: 404 });
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf?.dispose();
  });

  beforeEach(() => {
    tgCalls = [];
    invalidateSettingsCache(db);
  });

  it('1. Exposes only public 1+7 links on /api/auth/providers & bot /channels, strictly hiding private 04/05/06 channels', async () => {
    const env = makeEnv();

    const provRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/auth/providers'), env);
    expect(provRes.status).toBe(200);
    const provText = await provRes.text();
    const prov = JSON.parse(provText) as Record<string, unknown>;

    // Public 1+7 + Bot ARE exposed
    expect(prov.telegramBotUsername).toBe('DollarinoOfficialBot');
    expect(prov.officialChannel).toBe('@Dollarino_Official');
    expect(prov.officialChannelInvite).toBe('https://t.me/Dollarino_Official');
    expect(prov.signalsChannelInvite).toBe('https://t.me/Dollarino_Signals');
    expect(prov.resultsChannelInvite).toBe('https://t.me/Dollarino_Results');
    expect(prov.communityGroupInvite).toBe('https://t.me/+DollarinoGroupInvite');
    expect(prov.newsChannelInvite).toBe('https://t.me/Dollarino_News');

    // Private 04 Logs, 05 Database, 06 Transactions MUST NEVER leak publicly
    expect(provText).not.toContain('-1009990000004');
    expect(provText).not.toContain('-1009990000005');
    expect(provText).not.toContain('-1009990000006');
    expect(prov.logsChannelId).toBeUndefined();
    expect(prov.databaseChannelId).toBeUndefined();
    expect(prov.transactionsChannelId).toBeUndefined();

    // Telegram /channels command for regular user shows public links only, hides private channels
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 101,
      message: { message_id: 1, from: { id: 777888999 }, chat: { id: 777888999, type: 'private' }, text: '/channels' },
    });
    const chanReply = tgCalls.find((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '777888999');
    expect(chanReply).toBeTruthy();
    const replyDump = JSON.stringify(chanReply);
    expect(replyDump).toContain('Dollarino_Official');
    expect(replyDump).toContain('Dollarino_Signals');
    expect(replyDump).toContain('Dollarino_Results');
    expect(replyDump).toContain('DollarinoGroupInvite');
    expect(replyDump).toContain('Dollarino_News');
    expect(replyDump).not.toContain('-1009990000004');
    expect(replyDump).not.toContain('-1009990000005');
    expect(replyDump).not.toContain('-1009990000006');
  });

  it('2. Strictly separates 01 Signals, 02 Results, 07 News, and Official Main Channel routing', async () => {
    const env = makeEnv();

    // 01. Signal goes ONLY to signals_channel_id (-1001110000001) when signals_also_official=false
    const sigRes = await publishSignalBroadcast(env, {
      source: 'AI_ENSEMBLE',
      engineKey: 'dollarino_v01',
      publishToChannel: true,
      notifySubscribers: false,
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '95000',
        stopLoss: '93500',
        tp1: '96500',
        tp2: '98000',
        tp3: '99500',
        leverage: 5,
        engineKey: 'dollarino_v01',
        reason: 'Clean separation test',
      },
    });
    expect(sigRes.channelMessageId).toBeTruthy();
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1001110000001')).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(false);

    // 02. Closed Result Card goes ONLY to results_channel_id (-1001110000002)
    tgCalls = [];
    await publishSignalClosedCard(env, {
      tradeId: 'trd_171_test_1',
      userId: 'usr_trader_171',
      signalId: sigRes.signalId,
      symbol: 'BTCUSDT',
      direction: 'LONG',
      leverage: 5,
      mode: 'LIVE',
      strategyKey: 'dollarino_v01',
      entryPrice: '95000',
      exitPrice: '98000',
      stopLoss: '93500',
      tp1: '96500',
      tp1Hit: true,
      tp2Hit: true,
      tp3Hit: false,
      trailingActive: false,
      pnlUsd: 150,
      pnlPct: 15.79,
      reason: 'TP2',
      openedAt: new Date(Date.now() - 3600_000).toISOString(),
      closedAt: new Date().toISOString(),
    });
    expect(tgCalls.some((c) => c.method === 'sendPhoto' && String(c.body.chat_id) === '-1001110000002')).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(false);

    // 07. News (NEWS/ANALYSIS) goes ONLY to news_channel_id (@Dollarino_News)
    tgCalls = [];
    const newsRes = await publishChannelNews(env, {
      category: 'NEWS',
      title: 'آپدیت تورم آمریکا و واکنش بیت‌کوین',
      body: 'گزارش CPI مطابق پیش‌بینی منتشر شد و جریان ورودی ETF افزایش یافت.',
      notifyBotUsers: false,
      createdBy: 'usr_owner_171',
    });
    expect(newsRes.channelMessageId).toBeTruthy();
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_News')).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(false);

    // Official Main Channel (PROMO/LOTTERY/ADVICE/ANNOUNCEMENT) goes ONLY to @Dollarino_Official
    tgCalls = [];
    const officialRes = await publishChannelNews(env, {
      category: 'LOTTERY',
      title: 'قرعه‌کشی بزرگ کاربران فعال دلارینو',
      body: 'جوایز نقدی ویژه تریدرهای تاییدشده این هفته اعلام شد.',
      notifyBotUsers: false,
      createdBy: 'usr_owner_171',
    });
    expect(officialRes.channelMessageId).toBeTruthy();
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_News')).toBe(false);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1001110000001')).toBe(false);
  });

  it('3. Dispatches private 04 Logs, 05 Database (report + JSON backup), and 06 Transactions events & Admin APIs', async () => {
    const env = makeEnv();
    const ownerToken = await signJwt({ sub: 'usr_owner_171', email: 'owner@dollarino.test', role: 'owner' }, env.SESSION_JWT_SECRET);

    // Verify all 8 channels/group via Admin API
    const verRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/verify-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(verRes.status).toBe(200);
    const verJson = (await verRes.json()) as { ok: boolean; results: Array<{ key: string; ok: boolean; configured: boolean }> };
    expect(verJson.ok).toBe(true);
    expect(verJson.results.length).toBe(8);
    expect(verJson.results.every((r) => r.configured && r.ok)).toBe(true);

    // 04. Logs event
    tgCalls = [];
    const logRes = await publishSystemLogEvent(env, {
      category: 'AI_DECISION',
      level: 'INFO',
      source: 'MarketIntel',
      title: 'سیگنال BTCUSDT تایید شد',
      details: 'اطمینان 84% · ریسک/ریوارد 1:2.4',
    });
    expect(logRes.ok).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1009990000004')).toBe(true);

    // 05. Database report + JSON backup attachment via Admin API
    tgCalls = [];
    const dbRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/send-db-report', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachBackupJson: true }),
      }),
      env
    );
    expect(dbRes.status).toBe(200);
    const dbJson = (await dbRes.json()) as { ok: boolean; sizeKb: number };
    expect(dbJson.ok).toBe(true);
    expect(dbJson.sizeKb).toBeGreaterThan(0);
    expect(tgCalls.some((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '-1009990000005')).toBe(true);
    expect(tgCalls.some((c) => c.method === 'sendDocument' && String(c.body.chat_id) === '-1009990000005')).toBe(true);

    // 06. Transactions event & settlement digest via Admin API
    tgCalls = [];
    const txRes = await publishTransactionEvent(env, {
      eventType: 'TREASURY_DEPOSIT',
      status: 'CONFIRMED',
      title: 'واریز خزانه کاربر تایید شد',
      amountUsd: 250,
      network: 'BSC',
      asset: 'USDT',
      userId: 'usr_trader_171',
    });
    expect(txRes.ok).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1009990000006')).toBe(true);

    tgCalls = [];
    const digRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channels/send-settlement-digest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(digRes.status).toBe(200);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1009990000006')).toBe(true);

    // Direct Official Main Channel publish endpoint
    tgCalls = [];
    const offPubRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/channel/publish-official', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'PROJECT_UPDATE',
          title: 'انتشار ساختار رسمی اکوسیستم ۱+۷+۱',
          body: 'تمامی کانال‌های عمومی و خصوصی با تفکیک کامل فعال شدند.',
          notifyBotUsers: false,
        }),
      }),
      env
    );
    expect(offPubRes.status).toBe(200);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(true);
  });

  it('4. Telegram Admin Menu (adm:channel, adm:chan_db_report, adm:chan_tx_digest) & my_chat_member auto-bind work cleanly', async () => {
    const env = makeEnv();

    // Super Admin opens adm:channel menu
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 201,
      callback_query: {
        id: 'cb_adm_ch_1',
        from: { id: 944021185, username: 'owner171' },
        message: { message_id: 50, chat: { id: 944021185, type: 'private' } },
        data: 'adm:channel',
      },
    });
    const menuDump = JSON.stringify(tgCalls);
    expect(menuDump).toContain('01. سیگنال');
    expect(menuDump).toContain('04. لاگ');
    expect(menuDump).toContain('05. دیتابیس');
    expect(menuDump).toContain('06. تراکنش');
    expect(menuDump).toContain('adm:chan_db_report');
    expect(menuDump).toContain('adm:chan_tx_digest');

    // Direct publishDatabaseReport works
    tgCalls = [];
    const dbRep = await publishDatabaseReport(env, { eventType: 'PERIODIC_STATUS', attachBackupJson: false });
    expect(dbRep.ok).toBe(true);
    expect(tgCalls.some((c) => String(c.body.chat_id) === '-1009990000005')).toBe(true);

    // Direct publishOfficialAnnouncement works
    tgCalls = [];
    const offAnn = await publishOfficialAnnouncement(env, {
      kind: 'ADVICE',
      title: 'مدیریت ریسک پیش از اخبار فدرال رزرو',
      body: 'توصیه رسمی: اهرم بالا پیش از سخنرانی پاول کاهش یابد.',
      notifyBotUsers: false,
    });
    expect(offAnn.channelMessageId).toBeTruthy();
    expect(tgCalls.some((c) => String(c.body.chat_id) === '@Dollarino_Official')).toBe(true);

    // my_chat_member offers all 8 roles including 04/05/06/Official
    tgCalls = [];
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 202,
      my_chat_member: {
        chat: { id: -100888777666, title: 'Dollarino Private Logs Test', type: 'channel' },
        from: { id: 944021185 },
        new_chat_member: { status: 'administrator', can_post_messages: true },
      },
    });
    const bindPrompt = JSON.stringify(tgCalls);
    expect(bindPrompt).toContain('adm_bind_ch:official:-100888777666');
    expect(bindPrompt).toContain('adm_bind_ch:logs:-100888777666');
    expect(bindPrompt).toContain('adm_bind_ch:database:-100888777666');
    expect(bindPrompt).toContain('adm_bind_ch:transactions:-100888777666');
  });
});
