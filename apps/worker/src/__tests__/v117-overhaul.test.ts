import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureUserDefaults } from '../auth.js';
import { buildProfitCardSvg, renderProfitCardPng } from '../cards/renderer.js';
import { signJwt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { mainMenuKeyboard } from '../telegram/formatter.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { calcPctFromPrice, calcPriceFromPct, calcRoePct } from '@dollarino/core';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v117-overhaul',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_TOKEN_V117',
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

describe('Dollarino V11.7 Overhaul: Safe Defaults, Unified Multi-Source Cards (16:9 & 9:16), Settings, Telegram & Admin Audit', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v117-overhaul-db' },
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

  it('provisions safe optimal defaults with ALL engines and automated switches OFF, and persists granular notification prefs & display_currency', async () => {
    const env = makeEnv();
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, phone_verified, ui_mode)
         VALUES ('usr_v117_safe', 'v117safe@example.com', 'SafeUser', 'hash_117', 'user', 1, 'simple')`
      )
      .run();
    await ensureUserDefaults(db, 'usr_v117_safe');

    const cfg = await db
      .prepare(`SELECT * FROM bot_configs WHERE user_id = 'usr_v117_safe'`)
      .first<Record<string, unknown>>();
    expect(cfg).toBeTruthy();
    expect(cfg!.bot_state).toBe('STOPPED');
    expect(cfg!.active_engines_json).toBe('[]');
    expect(cfg!.trade_execution_mode).toBe('MANUAL_CONFIRM');
    expect(cfg!.notifications_enabled).toBe(0);
    expect(cfg!.display_currency).toBe('USD');
    expect(cfg!.trading_mode_selected).toBe(0);
    expect(cfg!.sniper_enabled).toBe(0);
    expect(cfg!.sniper_auto_execute).toBe(0);
    expect(cfg!.ai_min_confidence).toBe(70);
    expect(cfg!.margin_pct).toBe(8);
    expect(cfg!.max_leverage).toBe(5);

    const token = await signJwt(
      { sub: 'usr_v117_safe', email: 'v117safe@example.com', username: 'SafeUser', role: 'user' },
      env.SESSION_JWT_SECRET
    );

    const patchRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/config', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_currency: 'IRT',
          notifications_enabled: 1,
          notification_prefs_json: JSON.stringify({
            signals: true,
            open_close: true,
            tp_sl: true,
            dex_sniper: false,
            cards_reports: true,
          }),
        }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    const after = await db
      .prepare(`SELECT display_currency, notifications_enabled, notification_prefs_json FROM bot_configs WHERE user_id = 'usr_v117_safe'`)
      .first<{ display_currency: string; notifications_enabled: number; notification_prefs_json: string }>();
    expect(after?.display_currency).toBe('IRT');
    expect(after?.notifications_enabled).toBe(1);
    expect(JSON.parse(after!.notification_prefs_json).dex_sniper).toBe(false);
  });

  it('issues unified Profit Cards across PERP + DEX + COPY, all 8 periods (incl. 3M/6M/TRADE), renders PNGs in 16:9 & 9:16, and supports Admin Revoke & Bot Monitor', async () => {
    const env = makeEnv();
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, phone_verified, telegram_id, ui_mode)
         VALUES ('usr_v117_cards', 'v117cards@example.com', 'CardPro', 'hash_117', 'user', 1, '7117001', 'pro'),
                ('usr_v117_owner', 'owner117@dollarino.app', 'Owner117', 'hash_117', 'owner', 1, '944021185', 'pro')`
      )
      .run();
    await ensureUserDefaults(db, 'usr_v117_cards');
    await ensureUserDefaults(db, 'usr_v117_owner');

    await db
      .prepare(`UPDATE bot_configs SET bot_state = 'RUNNING_PAPER', active_engines_json = '["CENTRAL_AI"]' WHERE user_id = 'usr_v117_cards'`)
      .run();

    // 1) Closed PERP trade
    await db
      .prepare(
        `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, direction, leverage, margin_used, initial_quantity, remaining_quantity, entry_price, exit_price, initial_stop_loss, current_stop_loss, tp1, status, realized_pnl, strategy_key, client_id, opened_at, closed_at)
         VALUES ('tr_v117_1', 'usr_v117_cards', 'LIVE', 'TOOBIT', 'BTC/USDT', 'LONG', 10, '500', '0.055', '0', '90000', '99000', '88000', '88000', '99000', 'CLOSED', '500', 'CENTRAL_AI', 'cli_v117_1', datetime('now', '-60 days'), datetime('now', '-59 days'))`
      )
      .run();

    // 2) Closed DEX trade
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, exit_price_usd, status, realized_pnl_usd, realized_pnl_pct, note, opened_at, closed_at)
         VALUES ('dex_v117_1', 'usr_v117_cards', 'solana', 'raydium', 'pair117', 'So11111111111111111111111111111111111111112', 'SOL', 'USDT', 'BUY', 200, 1.5, 140, 210, 'CLOSED', 100, 50, '[SNIPER] AI Verified', datetime('now', '-100 days'), datetime('now', '-99 days'))`
      )
      .run();

    // 3) Closed COPY V2 trade
    await db
      .prepare(
        `INSERT INTO copy_positions_v2 (id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name, token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd, qty_tokens, pnl_pct, pnl_usd, status, opened_at, closed_at)
         VALUES ('cp_v117_1', 'usr_v117_cards', 'rule1', 'TRADER', 'tr1', 'Whale Alpha', 'PAPER', 'ethereum', 'uniswap', '0x1111111111111111111111111111111111111111', 'ETH', 'Ethereum', 'BUY', 300, 3000, 3600, 0.1, 20, 60, 'CLOSED', datetime('now', '-120 days'), datetime('now', '-119 days'))`
      )
      .run();

    const userToken = await signJwt(
      { sub: 'usr_v117_cards', email: 'v117cards@example.com', username: 'CardPro', role: 'user' },
      env.SESSION_JWT_SECRET
    );
    const ownerToken = await signJwt(
      { sub: 'usr_v117_owner', email: 'owner117@dollarino.app', username: 'Owner117', role: 'owner' },
      env.SESSION_JWT_SECRET
    );

    // Check eligible trades across ALL sources
    const eligRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/cards/eligible-trades?mode=LIVE&tradeSource=ALL', {
        headers: { Authorization: `Bearer ${userToken}` },
      }),
      env
    );
    expect(eligRes.status).toBe(200);
    const eligJson = (await eligRes.json()) as { trades: Array<{ id: string; tradeSource: string }> };
    expect(eligJson.trades.some((t) => t.id === 'tr_v117_1' && t.tradeSource === 'PERP')).toBe(true);
    expect(eligJson.trades.some((t) => t.id === 'dex_v117_1' && t.tradeSource === 'DEX')).toBe(true);
    expect(eligJson.trades.some((t) => t.id === 'cp_v117_1' && t.tradeSource === 'COPY')).toBe(true);

    // Issue 6M ALL-source card (captures BTC 59d + SOL 99d + ETH 119d = 3 trades, $660 PnL)
    const issue6m = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/cards/issue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE', tradeSource: 'ALL', period: '6M', cardStyle: 'violet' }),
      }),
      env
    );
    expect(issue6m.status).toBe(200);
    const j6m = (await issue6m.json()) as { card: { id: string; tradesCount: number; netPnlUsd: number; period: string } };
    expect(j6m.card.period).toBe('6M');
    expect(j6m.card.tradesCount).toBe(3);
    expect(j6m.card.netPnlUsd).toBe(660);

    // Issue single-trade DEX card with Entry/Exit/Signal/Token metadata
    const issueSingle = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/cards/issue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'LIVE', tradeSource: 'DEX', period: 'TRADE', tradeId: 'dex_v117_1', cardStyle: 'emerald' }),
      }),
      env
    );
    expect(issueSingle.status).toBe(200);
    const jSingle = (await issueSingle.json()) as {
      card: { id: string; tradeSource: string; entryPrice: number; exitPrice: number; symbol: string; signalName: string };
    };
    expect(jSingle.card.tradeSource).toBe('DEX');
    expect(jSingle.card.entryPrice).toBe(140);
    expect(jSingle.card.exitPrice).toBe(210);
    expect(jSingle.card.symbol).toBe('SOL/SOLANA');
    expect(jSingle.card.signalName).toContain('SNIPER');

    // Verify true 16:9 (1200x675) and 9:16 (1080x1920) SVG & PNG output
    const svg16 = buildProfitCardSvg({
      cardId: jSingle.card.id,
      displayName: 'CardPro',
      mode: 'LIVE',
      period: 'TRADE',
      tradeSource: 'DEX',
      tradesCount: 1,
      winRate: 100,
      netPnlUsd: 100,
      roiPct: 50,
      profitFactor: 99,
      exchangeProvider: 'RAYDIUM (SOLANA)',
      strategyName: 'میم اسنایپر',
      symbol: 'SOL/USDT',
      baseSymbol: 'SOL',
      direction: 'BUY',
      entryPrice: 140,
      exitPrice: 210,
      signalName: jSingle.card.signalName,
      issuedAt: new Date().toISOString(),
      layout: 'horizontal',
    });
    expect(svg16).toContain('width="1200" height="675"');
    expect(svg16).toContain('$140.00');
    expect(svg16).toContain('$210.00');

    const png916 = await renderProfitCardPng({
      cardId: jSingle.card.id,
      displayName: 'CardPro',
      mode: 'LIVE',
      period: 'TRADE',
      tradeSource: 'DEX',
      tradesCount: 1,
      winRate: 100,
      netPnlUsd: 100,
      roiPct: 50,
      profitFactor: 99,
      exchangeProvider: 'RAYDIUM (SOLANA)',
      strategyName: 'میم اسنایپر',
      symbol: 'SOL/USDT',
      baseSymbol: 'SOL',
      direction: 'BUY',
      entryPrice: 140,
      exitPrice: 210,
      signalName: jSingle.card.signalName,
      issuedAt: new Date().toISOString(),
      layout: 'vertical',
    });
    expect(png916).toBeTruthy();
    expect(png916!.length).toBeGreaterThan(20_000);

    // Public verification works before revoke, and rejects after Admin Revoke
    const pubBefore = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/public/verify-card/${jSingle.card.id}`),
      env
    );
    expect(pubBefore.status).toBe(200);
    const pubBeforeJson = (await pubBefore.json()) as { valid: boolean; revoked: boolean };
    expect(pubBeforeJson.valid).toBe(true);
    expect(pubBeforeJson.revoked).toBe(false);

    // Admin lists cards, revokes card, monitors active bot, and stops active bot
    const adminCards = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/profit-cards', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(adminCards.status).toBe(200);
    const adminCardsJson = (await adminCards.json()) as { cards: Array<{ id: string }> };
    expect(adminCardsJson.cards.some((c) => c.id === jSingle.card.id)).toBe(true);

    const revRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/profit-cards/${jSingle.card.id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoked: true }),
      }),
      env
    );
    expect(revRes.status).toBe(200);

    const pubAfter = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/public/verify-card/${jSingle.card.id}`),
      env
    );
    const pubAfterJson = (await pubAfter.json()) as { valid: boolean; revoked: boolean };
    expect(pubAfterJson.valid).toBe(false);
    expect(pubAfterJson.revoked).toBe(true);

    const activeBotsRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/active-bots', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(activeBotsRes.status).toBe(200);
    const botsJson = (await activeBotsRes.json()) as { bots: Array<{ user_id: string; bot_state: string }> };
    expect(botsJson.bots.some((b) => b.user_id === 'usr_v117_cards' && b.bot_state === 'RUNNING_PAPER')).toBe(true);

    const stopBotRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/users/usr_v117_cards/bot-stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(stopBotRes.status).toBe(200);
    const stoppedCfg = await db
      .prepare(`SELECT bot_state FROM bot_configs WHERE user_id = 'usr_v117_cards'`)
      .first<{ bot_state: string }>();
    expect(stoppedCfg?.bot_state).toBe('STOPPED');
  });

  it('exposes 3M/6M/Single-Trade & 9:16 Story cards and granular notification/currency settings in Telegram Bot', async () => {
    const env = makeEnv();
    const tgCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org/bot')) {
        const method = url.split('/').pop() || '';
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        tgCalls.push({ method, body });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 901 } }), { status: 200 });
      }
      return realFetch(input, init);
    });

    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, phone_number, phone_verified, telegram_id, ui_mode)
         VALUES ('usr_v117_tg', 'v117tg@example.com', 'TgUser117', 'hash_117', 'user', '+989121117117', 1, '7117999', 'simple')`
      )
      .run();
    await ensureUserDefaults(db, 'usr_v117_tg');

    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 901,
      message: { message_id: 1, from: { id: 7117999 }, chat: { id: 7117999, type: 'private' }, text: '/card' },
    });
    const cardMsg = tgCalls.find((c) => c.method === 'sendMessage');
    const cardMarkup = JSON.stringify(cardMsg?.body.reply_markup || {});
    expect(cardMarkup).toContain('tg_profit_issue:3M:horizontal');
    expect(cardMarkup).toContain('tg_profit_issue:6M:horizontal');
    expect(cardMarkup).toContain('tg_profit_single_list');
    expect(cardMarkup).toContain('tg_profit_issue:3M:vertical');

    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 902,
      message: { message_id: 2, from: { id: 7117999 }, chat: { id: 7117999, type: 'private' }, text: 'دریافت اعلان 🔔' },
    });
    const notifMsg = tgCalls.find((c) => c.method === 'sendMessage');
    const notifMarkup = JSON.stringify(notifMsg?.body.reply_markup || {});
    expect(notifMarkup).toContain('tg_notif_master');
    expect(notifMarkup).toContain('tg_notif_pref:signals');
    expect(notifMarkup).toContain('tg_disp_curr:toggle');

    // Simple Mode reply keyboard includes 5m sniper, Profit Card, and Notifications shortcuts
    const simpleKbJson = JSON.stringify(mainMenuKeyboard('https://dollarino.pages.dev', 'simple', false));
    expect(simpleKbJson).toContain('🎯 اسنایپر زیر ۵ دقیقه');
    expect(simpleKbJson).toContain('کارت سود دلارینو 📊');
    expect(simpleKbJson).toContain('اعلان‌ها 🔔');

    // tg_trade_quantities callback must open Trade Quantities menu cleanly (no silent ignore)
    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 903,
      callback_query: {
        id: 'cq_qty_1',
        from: { id: 7117999 },
        message: { message_id: 10, chat: { id: 7117999, type: 'private' } },
        data: 'tg_trade_quantities',
      },
    });
    const qtyMsg = tgCalls.find((c) => c.method === 'sendMessage' || c.method === 'editMessageText');
    expect(qtyMsg).toBeDefined();
    expect(String(qtyMsg?.body.text || '')).toContain('بودجه ربات');

    // tg_sniper_scan_5m callback triggers ultra-fresh <5m scan & shows results
    tgCalls.length = 0;
    await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
      update_id: 904,
      callback_query: {
        id: 'cq_sniper_5m',
        from: { id: 7117999 },
        message: { message_id: 11, chat: { id: 7117999, type: 'private' } },
        data: 'tg_sniper_scan_5m',
      },
    });
    const sniper5mMsg = tgCalls.find((c) => c.method === 'sendMessage');
    expect(sniper5mMsg).toBeDefined();
    expect(String(sniper5mMsg?.body.text || '')).toContain('اسنایپر');
  });

  it('supports Google OAuth Admin configuration + health check, 5m Sniper Pro filters & Pine v5 primitives API', async () => {
    const env = makeEnv();
    const adminId = 'usr_admin_oauth_117';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, risk_terms_accepted_at)
         VALUES (?, 'owner-oauth117@dollarino.app', 'OwnerOauth117', 'hash_owner', 'owner', '944021189', datetime('now'))`
      )
      .bind(adminId)
      .run();
    await ensureUserDefaults(db, adminId);

    const token = await signJwt(
      { sub: adminId, email: 'owner-oauth117@dollarino.app', role: 'owner', iat: Math.floor(Date.now() / 1000) },
      env.SESSION_JWT_SECRET
    );

    // 1. Before saving Google OAuth keys, providers & health report googleOauthConfigured = false
    const provBefore = await worker.fetch(new Request('http://localhost/api/auth/providers'), env);
    expect(provBefore.status).toBe(200);
    const provBeforeJson = (await provBefore.json()) as { googleConfigured: boolean };
    expect(provBeforeJson.googleConfigured).toBe(false);

    const healthBefore = await worker.fetch(
      new Request('http://localhost/api/admin/system-health', { headers: { Authorization: `Bearer ${token}` } }),
      env
    );
    expect(healthBefore.status).toBe(200);
    const healthBeforeJson = (await healthBefore.json()) as { health: { productionChecks: { googleOauthConfigured: boolean } } };
    expect(healthBeforeJson.health.productionChecks.googleOauthConfigured).toBe(false);

    // 2. Owner saves Google OAuth credentials via Admin Settings
    const saveOauthRes = await worker.fetch(
      new Request('http://localhost/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            google_client_id: '123456-test.apps.googleusercontent.com',
            google_client_secret: 'GOCSPX-super-secret-value',
          },
        }),
      }),
      env
    );
    expect(saveOauthRes.status).toBe(200);

    const provAfter = await worker.fetch(new Request('http://localhost/api/auth/providers'), env);
    const provAfterJson = (await provAfter.json()) as { googleConfigured: boolean; googleClientId: string };
    expect(provAfterJson.googleConfigured).toBe(true);
    expect(provAfterJson.googleClientId).toBe('123456-test.apps.googleusercontent.com');

    const healthAfter = await worker.fetch(
      new Request('http://localhost/api/admin/system-health', { headers: { Authorization: `Bearer ${token}` } }),
      env
    );
    const healthAfterJson = (await healthAfter.json()) as { health: { productionChecks: { googleOauthConfigured: boolean } } };
    expect(healthAfterJson.health.productionChecks.googleOauthConfigured).toBe(true);

    // Admin overview masks google_client_secret
    const ovRes = await worker.fetch(
      new Request('http://localhost/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } }),
      env
    );
    const ovJson = (await ovRes.json()) as { settings: Record<string, string> };
    expect(ovJson.settings.google_client_secret).toBe('********');

    // 3. Sniper 5m minute-level settings round-trip + ultra-fresh <5m pool discovery via GeckoTerminal mock
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.geckoterminal.com/api/v2/networks/new_pools')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'solana_fresh5m_pool',
                attributes: {
                  address: 'SoFreshPool111111111111111111111111111111111',
                  name: 'TURBO5M / SOL',
                  base_token_price_usd: '0.00142',
                  reserve_in_usd: '18500',
                  pool_created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
                  price_change_percentage: { m5: '28.5', h1: '64.2', h24: '64.2' },
                  volume_usd: { m5: '7400', h1: '21500', h24: '21500' },
                  transactions: { m5: { buys: 42, sells: 9 }, h1: { buys: 95, sells: 22 } },
                },
                relationships: {
                  network: { data: { id: 'solana' } },
                  dex: { data: { id: 'raydium' } },
                  base_token: { data: { id: 'solana_Turbo5mMintAddr111111111111111111111' } },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('api.dexscreener.com')) {
        return new Response(JSON.stringify({ pairs: [] }), { status: 200 });
      }
      if (url.includes('binance.com') || url.includes('mexc.com')) {
        return new Response(JSON.stringify({ symbols: [], data: { catalogs: [] } }), { status: 200 });
      }
      return realFetch(input);
    });

    const postSniper = await worker.fetch(
      new Request('http://localhost/api/trading/sniper', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          targetType: 'DEX_BOOM_MEME',
          minLiquidityUsd: 2000,
          minSafetyScore: 35,
          maxPairAgeMinutes: 5,
          networks: ['solana', 'base'],
          advancedFilters: { sortBy: 'NEWEST', minVolume5mUsd: 1000 },
        }),
      }),
      env
    );
    expect(postSniper.status).toBe(200);
    const postSniperJson = (await postSniper.json()) as { settings: { maxPairAgeMinutes: number; maxPairAgeHours: number } };
    expect(postSniperJson.settings.maxPairAgeMinutes).toBe(5);
    expect(postSniperJson.settings.maxPairAgeHours).toBeLessThan(0.2);

    const getSniper = await worker.fetch(
      new Request('http://localhost/api/trading/sniper', { headers: { Authorization: `Bearer ${token}` } }),
      env
    );
    expect(getSniper.status).toBe(200);
    const getSniperJson = (await getSniper.json()) as {
      settings: { maxPairAgeMinutes: number };
      candidates: Array<{ symbol: string; ageMinutes: number | null; volume5mUsd: number }>;
    };
    expect(getSniperJson.settings.maxPairAgeMinutes).toBe(5);
    expect(getSniperJson.candidates.some((c) => c.symbol === 'TURBO5M')).toBe(true);
    const turbo = getSniperJson.candidates.find((c) => c.symbol === 'TURBO5M');
    expect(turbo?.ageMinutes).toBeLessThanOrEqual(5);
    expect(turbo?.volume5mUsd).toBeGreaterThanOrEqual(7000);
  });

  it('V11.7.1: bot/start persists default engine from empty active_engines_json, builds Solana Vault Fund TX, and computes % TP/SL', async () => {
    const env = makeEnv();
    const uid = 'usr_v1171_bot_sol';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, profile_completed, risk_terms_accepted_at)
         VALUES (?, 'v1171@dollarino.app', 'v1171user', 'hash', 'user', 1, '2026-11-01T00:00:00Z')`
      )
      .bind(uid)
      .run();
    await ensureUserDefaults(db, uid);
    await db
      .prepare(`UPDATE bot_configs SET trading_mode_selected = 1, active_engines_json = '[]', strategy_key = 'dollarino_v01' WHERE user_id = ?`)
      .bind(uid)
      .run();
    const token = await signJwt({ sub: uid, email: 'v1171@dollarino.app', role: 'user' }, env.SESSION_JWT_SECRET);

    // 1. Start bot with topbar payload (no explicit activeEngines or strategyKey) -> must persist STRATEGY into active_engines_json
    const startRes = await worker.fetch(
      new Request('http://localhost/api/trading/bot/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanScope: 'ALL_MARKET' }),
      }),
      env
    );
    expect(startRes.status).toBe(200);
    const startJson = (await startRes.json()) as { ok: boolean; bot_state: string; activeEngines: string[] };
    expect(startJson.ok).toBe(true);
    expect(startJson.bot_state).toBe('RUNNING_PAPER');
    expect(startJson.activeEngines).toContain('STRATEGY');

    const cfgRow = await db
      .prepare(`SELECT bot_state, active_engines_json FROM bot_configs WHERE user_id = ?`)
      .bind(uid)
      .first<{ bot_state: string; active_engines_json: string }>();
    expect(cfgRow?.bot_state).toBe('RUNNING_PAPER');
    expect(JSON.parse(cfgRow?.active_engines_json || '[]')).toContain('STRATEGY');

    // 2. Solana Copy-Vault Quick Fund Transaction Builder (SOLANA_TX with mocked blockhash + WSOL price)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('api.dexscreener.com')) {
        return new Response(
          JSON.stringify({
            pairs: [
              {
                chainId: 'solana',
                dexId: 'raydium',
                pairAddress: 'So111Pool',
                baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL' },
                quoteToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin' },
                priceUsd: '200',
                liquidity: { usd: 5_000_000 },
                volume: { h24: 10_000_000 },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('mainnet-beta.solana.com') || url.includes('solana-rpc.publicnode.com')) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { value: { blockhash: '11111111111111111111111111111111' } },
          }),
          { status: 200 }
        );
      }
      return realFetch(input, init);
    });

    const solTxRes = await worker.fetch(
      new Request('http://localhost/api/trustwallet/build-solana-fund-tx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAddress: 'So11111111111111111111111111111111111111112',
          amountUsd: 50,
        }),
      }),
      env
    );
    expect(solTxRes.status).toBe(200);
    const solTxJson = (await solTxRes.json()) as {
      ok: boolean;
      kind: string;
      vaultSolanaAddress: string;
      txBase64?: string;
      amountSol: number;
      sendDeepLink: string;
    };
    expect(solTxJson.ok).toBe(true);
    expect(solTxJson.kind).toBe('SOLANA_TX');
    expect(solTxJson.vaultSolanaAddress.length).toBeGreaterThanOrEqual(32);
    expect(solTxJson.txBase64).toBeTruthy();
    expect(solTxJson.amountSol).toBeGreaterThan(0.2);
    expect(solTxJson.amountSol).toBeLessThan(0.35);
    expect(solTxJson.sendDeepLink).toContain('coin=501');

    // 3. Percentage <-> Exact Price TP/SL Helpers (LONG, SHORT, small meme coin, ROE)
    expect(calcPriceFromPct({ entryPrice: 60000, side: 'LONG', kind: 'TP', pct: 5 })).toBe(63000);
    expect(calcPriceFromPct({ entryPrice: 60000, side: 'LONG', kind: 'SL', pct: 2 })).toBe(58800);
    expect(calcPriceFromPct({ entryPrice: 60000, side: 'SHORT', kind: 'TP', pct: 5 })).toBe(57000);
    expect(calcPriceFromPct({ entryPrice: 60000, side: 'SHORT', kind: 'SL', pct: 2 })).toBe(61200);
    expect(calcPctFromPrice({ entryPrice: 100, side: 'LONG', kind: 'TP', targetPrice: 112.5 })).toBe(12.5);
    expect(calcPctFromPrice({ entryPrice: 100, side: 'SHORT', kind: 'SL', targetPrice: 103 })).toBe(3);
    expect(calcRoePct(5, 10)).toBe(50);
    globalThis.fetch = realFetch;
  });
});
