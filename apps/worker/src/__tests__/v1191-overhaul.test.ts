import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureUserDefaults } from '../auth.js';
import { signJwt } from '../crypto.js';
import { normalizeDexChainId } from '../dex/screener.js';
import { closeCopyPositionV2, executeSmartCopySignalForRule, type CopyFollowRuleRow, type CopyPositionV2Row } from '../dex/smart-copy.js';
import type { Env } from '../env.js';
import worker from '../index.js';
import { computeUnifiedPortfolioAccounting, round2 } from '../services/portfolio-accounting.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { mainMenuKeyboard, welcomeMessage } from '../telegram/formatter.js';

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v1191-accounting',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_TOKEN_V1191',
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

describe('Dollarino V11.9.1 Overhaul: Accounting, Paper Copy Simulator, Sniper Caps, Site Maintenance, Popups & Fee Audit', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-v1191-overhaul-db' },
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

  it('1. Reconciles disjoint 5-mode accounting (Futures, Spot, DEX, Sniper, Copy) without double-counting', async () => {
    const env = makeEnv();
    const userId = 'usr_acct_5mode';
    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'acct5@test.local', 'acct5', 'x', 'user', 1)`)
      .bind(userId)
      .run();
    await ensureUserDefaults(db, userId);

    // 1) Open Futures trade ($200 margin, +$40 unrealized at mark 120 vs entry 100, qty=2)
    await db
      .prepare(
        `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, direction, status, market_type, strategy_key, entry_price, initial_quantity, remaining_quantity, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, leverage, client_id)
         VALUES ('tr_fut_1', ?, 'PAPER', 'paper', 'BTCUSDT', 'LONG', 'OPEN', 'FUTURES', 'ai_exclusive', '100', '2', '2', '200', '90', '90', '130', '0', 5, 'cli_fut_1')`
      )
      .bind(userId)
      .run();

    // 2) Closed Spot trade (+$55 realized)
    await db
      .prepare(
        `INSERT INTO trades (id, user_id, mode, exchange_provider, symbol, direction, status, market_type, strategy_key, entry_price, initial_quantity, remaining_quantity, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, leverage, client_id, closed_at)
         VALUES ('tr_spot_1', ?, 'PAPER', 'paper', 'ETHUSDT', 'LONG', 'CLOSED', 'SPOT', 'spot_momentum', '2000', '0.1', '0', '200', '1800', '1800', '2400', '55', 1, 'cli_spot_1', datetime('now'))`
      )
      .bind(userId)
      .run();

    // 3) Open Paper DEX direct swap ($100 locked, token price doubled 1 -> 2 => +$100 unrealized)
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, pair_address, token_address, token_symbol, direction, amount_usd, entry_price_usd, tx_hash, status, realized_pnl_usd, note)
         VALUES ('dex_paper_1', ?, 'solana', 'pair_dex_1', 'So11111111111111111111111111111111111111112', 'SOLMEME', 'BUY', 100, 1, 'paper_dex_1', 'OPEN', 0, 'Manual direct buy')`
      )
      .bind(userId)
      .run();

    // 4) Closed Paper Sniper trade (+$30 realized)
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, pair_address, token_address, token_symbol, direction, amount_usd, entry_price_usd, exit_price_usd, tx_hash, status, realized_pnl_usd, note, closed_at)
         VALUES ('dex_snip_1', ?, 'bsc', 'pair_snip_1', '0x1234567890abcdef1234567890abcdef12345678', 'SNIP', 'BUY', 50, 1, 1.6, 'paper_snip_1', 'CLOSED', 30, 'شکارچی اتوماتیک اسنایپر', datetime('now'))`
      )
      .bind(userId)
      .run();

    // 5) Open Paper Copy Position V2 ($150 margin, entry 10 -> current 12 => +$30 unrealized)
    await db
      .prepare(
        `INSERT INTO copy_positions_v2 (id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name, token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd, remaining_pct, pnl_usd, status, tx_hash)
         VALUES ('cp_paper_1', ?, 'rule_1', 'SMART_WALLET', 'tr_1', 'Smart Whale 1', 'PAPER_SIMULATOR', 'base', 'Aerodrome', '0xabcd', 'PEPEBASE', 'Pepe Base', 'LONG', 150, 10, 12, 100, 0, 'OPEN', 'paper_copy_1')`
      )
      .bind(userId)
      .run();

    const freeBal = 9500;
    const summary = await computeUnifiedPortfolioAccounting(env, userId, {
      tradingMode: 'PAPER',
      freeBalanceUsd: freeBal,
      livePrices: { BTCUSDT: 120 },
      dexPrices: {
        'solana:So11111111111111111111111111111111111111112': 2,
        'base:0xabcd': 12,
      },
      walletStartingUsd: 10000,
    });

    // Exact cent-level identity check
    expect(summary.freeBalanceUsd).toBe(9500);
    expect(summary.lockedMarginUsd).toBe(450); // 200 futures + 100 dex + 150 copy
    expect(summary.unrealizedPnlUsd).toBe(170); // 40 futures + 100 dex + 30 copy
    expect(summary.realizedPnlUsd).toBe(85); // 55 spot + 30 sniper
    expect(summary.totalEquityUsd).toBe(round2(summary.freeBalanceUsd + summary.lockedMarginUsd + summary.unrealizedPnlUsd));

    // Strictly disjoint buckets
    expect(summary.modes.futures.openCount).toBe(1);
    expect(summary.modes.futures.lockedMarginUsd).toBe(200);
    expect(summary.modes.futures.unrealizedPnlUsd).toBe(40);

    expect(summary.modes.spot.closedCount).toBe(1);
    expect(summary.modes.spot.realizedPnlUsd).toBe(55);

    expect(summary.modes.dex.openCount).toBe(1);
    expect(summary.modes.dex.lockedMarginUsd).toBe(100);
    expect(summary.modes.dex.unrealizedPnlUsd).toBe(100);

    expect(summary.modes.sniper.closedCount).toBe(1);
    expect(summary.modes.sniper.realizedPnlUsd).toBe(30);

    expect(summary.modes.copy.openCount).toBe(1);
    expect(summary.modes.copy.lockedMarginUsd).toBe(150);
    expect(summary.modes.copy.unrealizedPnlUsd).toBe(30);
    expect(summary.reconciliationOk).toBe(true);
  });

  it('2. Normalizes DEX chains consistently and enforces Sniper defaults (70/$15k/5) and non-admin cap (25)', async () => {
    expect(normalizeDexChainId('sol')).toBe('solana');
    expect(normalizeDexChainId('eth')).toBe('ethereum');
    expect(normalizeDexChainId('arb')).toBe('arbitrum');
    expect(normalizeDexChainId('bnb')).toBe('bsc');
    expect(normalizeDexChainId('matic')).toBe('polygon');
    expect(normalizeDexChainId('avax')).toBe('avalanche');
    expect(normalizeDexChainId('op')).toBe('optimism');

    const env = makeEnv();
    const userId = 'usr_sniper_caps';
    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'sniper@test.local', 'sniperc', 'x', 'user', 1)`)
      .bind(userId)
      .run();
    await ensureUserDefaults(db, userId);

    const jwt = await signJwt(
      { sub: userId, email: 'sniper@test.local', username: 'sniperc', role: 'user' },
      env.SESSION_JWT_SECRET
    );

    const getRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper', {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as { settings: { minSafetyScore: number; minLiquidityUsd: number; maxOpenPositions: number } };
    expect(getJson.settings.minSafetyScore).toBe(70);
    expect(getJson.settings.minLiquidityUsd).toBe(15000);
    expect(getJson.settings.maxOpenPositions).toBe(5);

    const postRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/sniper', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxOpenPositions: 100, chains: ['sol', 'bnb', 'arb'] }),
      }),
      env
    );
    expect(postRes.status).toBe(200);
    const postJson = (await postRes.json()) as { settings: { maxOpenPositions: number; networks: string[] } };
    expect(postJson.settings.maxOpenPositions).toBe(25);
    expect(postJson.settings.networks).toEqual(['solana', 'bsc', 'arbitrum']);
  });

  it('3. Executes Copy Trade PAPER_SIMULATOR open/close with paper_balance & wallet_ledger updates', async () => {
    const env = makeEnv();
    const userId = 'usr_copy_paper';
    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'copypaper@test.local', 'copypaper', 'x', 'user', 1)`)
      .bind(userId)
      .run();
    await ensureUserDefaults(db, userId);
    await db
      .prepare(`UPDATE bot_configs SET trading_mode = 'PAPER', paper_balance = '1000', daily_max_loss_pct = 50 WHERE user_id = ?`)
      .bind(userId)
      .run();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('dexscreener.com')) {
        return new Response(
          JSON.stringify({
            pairs: [
              {
                chainId: 'solana',
                dexId: 'raydium',
                pairAddress: 'pair_123',
                baseToken: { address: 'MintPaperTest111', symbol: 'PTEST', name: 'Paper Test' },
                quoteToken: { address: 'So111', symbol: 'SOL' },
                priceUsd: '2.0',
                liquidity: { usd: 250000 },
                volume: { h24: 180000 },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const rule: CopyFollowRuleRow = {
      id: 'rule_paper_1',
      user_id: userId,
      trader_kind: 'SMART_WALLET',
      trader_id: 'sw_1',
      trader_label: 'Whale Alpha',
      chain_id: 'solana',
      execution_mode: 'PAPER_SIMULATOR',
      allocated_margin_usd: 500,
      used_margin_usd: 0,
      sizing_mode: 'FIXED_USD',
      order_size_usd: 100,
      order_size_pct: 10,
      leverage: 1,
      tp1_pct: 20,
      tp1_sell_pct: 50,
      tp2_pct: 50,
      tp2_sell_pct: 50,
      tp3_pct: 100,
      moonbag_pct: 0,
      stop_loss_pct: 15,
      trailing_activate_pct: 15,
      trailing_drop_pct: 8,
      break_even_pct: 10,
      time_limit_hours: 72,
      min_safety_score: 0,
      max_slippage_pct: 3,
      min_liquidity_usd: 0,
      min_mcap_usd: 0,
      max_mcap_usd: 0,
      max_open_positions: 5,
      daily_max_loss_usd: 500,
      daily_loss_used_usd: 0,
      only_new_positions: 1,
      copy_sells: 1,
      dev_sell_auto_exit: 1,
      anti_mev: 1,
      ai_guard_enabled: 0,
      reverse_copy: 0,
      is_active: 1,
      updated_at: new Date().toISOString(),
    };

    await db
      .prepare(
        `INSERT INTO copy_follow_rules (id, user_id, trader_kind, trader_id, trader_label, chain_id, execution_mode, allocated_margin_usd, sizing_mode, order_size_usd)
         VALUES ('rule_paper_1', ?, 'SMART_WALLET', 'sw_1', 'Whale Alpha', 'solana', 'PAPER_SIMULATOR', 500, 'FIXED_USD', 100)`
      )
      .bind(userId)
      .run();

    const execRes = await executeSmartCopySignalForRule(env, rule, {
      chainId: 'sol',
      tokenAddress: 'MintPaperTest111',
      tokenSymbol: 'PTEST',
      side: 'BUY',
      traderSizeUsd: 1000,
    });
    expect(execRes.ok).toBe(true);
    expect(execRes.status).toBe('OPEN');
    expect(execRes.positionId).toBeTruthy();

    const afterOpenCfg = await db
      .prepare(`SELECT paper_balance FROM bot_configs WHERE user_id = ?`)
      .bind(userId)
      .first<{ paper_balance: string }>();
    expect(Number(afterOpenCfg?.paper_balance)).toBeCloseTo(900, 2);

    const openPos = await db
      .prepare(`SELECT * FROM copy_positions_v2 WHERE id = ?`)
      .bind(execRes.positionId!)
      .first<CopyPositionV2Row>();
    expect(openPos?.execution_mode).toBe('PAPER_SIMULATOR');
    expect(openPos?.chain_id).toBe('solana');

    await closeCopyPositionV2(env, openPos!, 3.0, 'TAKE_PROFIT_TEST'); // +50% on $100 => +$50 PnL

    const afterCloseCfg = await db
      .prepare(`SELECT paper_balance FROM bot_configs WHERE user_id = ?`)
      .bind(userId)
      .first<{ paper_balance: string }>();
    expect(Number(afterCloseCfg?.paper_balance)).toBeCloseTo(1050, 2);

    const ledgerEvents = await db
      .prepare(`SELECT event_type, amount_usd FROM wallet_ledger WHERE user_id = ? ORDER BY created_at ASC`)
      .bind(userId)
      .all<{ event_type: string; amount_usd: number }>();
    const types = ledgerEvents.results.map((r) => r.event_type);
    expect(types).toContain('COPY_OPEN');
    expect(types).toContain('COPY_CLOSE');
  });

  it('4. Enforces Site Maintenance Lock (503 for users, open for Admin), User Popups Ack, Trust Playbook & Admin 3% Fee Report', async () => {
    const env = makeEnv();
    const adminId = 'usr_admin_maint';
    const userId = 'usr_normal_maint';

    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'adminm@test.local', 'adminm', 'x', 'admin', 1)`)
      .bind(adminId)
      .run();
    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'userm@test.local', 'userm', 'x', 'user', 1)`)
      .bind(userId)
      .run();
    await ensureUserDefaults(db, adminId);
    await ensureUserDefaults(db, userId);

    const adminJwt = await signJwt(
      { sub: adminId, email: 'adminm@test.local', username: 'adminm', role: 'admin' },
      env.SESSION_JWT_SECRET
    );
    const userJwt = await signJwt(
      { sub: userId, email: 'userm@test.local', username: 'userm', role: 'user' },
      env.SESSION_JWT_SECRET
    );

    // Enable maintenance mode as Admin
    const maintPut = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/site-maintenance', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          titleFa: 'بروزرسانی هسته دلارینو',
          messageFa: 'تا ۱۵ دقیقه دیگر برمی‌گردیم.',
          eta: '15m',
        }),
      }),
      env
    );
    expect(maintPut.status).toBe(200);

    // Public site status reflects maintenance = true
    const statusRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/site-status'), env);
    const statusJson = (await statusRes.json()) as { maintenance: { enabled: boolean; eta: string } };
    expect(statusJson.maintenance.enabled).toBe(true);
    expect(statusJson.maintenance.eta).toBe('15m');

    // Regular user gets 503 SITE_MAINTENANCE on protected trading routes
    const blockedUserRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      env
    );
    expect(blockedUserRes.status).toBe(503);
    const blockedBody = (await blockedUserRes.json()) as { code: string };
    expect(blockedBody.code).toBe('SITE_MAINTENANCE');

    // Admin still has full access to /api/admin/* and /api/trading/*
    const adminOverview = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/overview', {
        headers: { Authorization: `Bearer ${adminJwt}` },
      }),
      env
    );
    expect(adminOverview.status).toBe(200);

    // Reopen site
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/site-maintenance', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      env
    );

    // Admin publishes targeted popup for userId
    const popCreate = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/popups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleFa: 'اطلاعیه مهم سیستم',
          bodyFa: 'کیف پول شما آماده معامله است.',
          severity: 'URGENT',
          targetUserId: userId,
          ctaLabelFa: 'مشاهده',
          ctaRoute: 'pricing',
        }),
      }),
      env
    );
    expect(popCreate.status).toBe(201);
    const { id: popupId } = (await popCreate.json()) as { id: string };

    // Dashboard returns pendingPopups and unified portfolioBreakdown
    const userDash = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      env
    );
    expect(userDash.status).toBe(200);
    const dashJson = (await userDash.json()) as {
      pendingPopups: Array<{ id: string; title_fa: string; severity: string }>;
      portfolioBreakdown: { totalEquityUsd: number; byMode: Record<string, unknown> };
    };
    expect(dashJson.pendingPopups.some((p) => p.id === popupId)).toBe(true);
    expect(dashJson.portfolioBreakdown).toBeTruthy();

    // User acknowledges popup -> cleared from pendingPopups
    const ackRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/trading/popups/${popupId}/ack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      env
    );
    expect(ackRes.status).toBe(200);

    const pendingAfterAck = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/popups/pending', {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      env
    );
    const pendingAfterJson = (await pendingAfterAck.json()) as { popups: Array<{ id: string }> };
    expect(pendingAfterJson.popups.some((p) => p.id === popupId)).toBe(false);

    // Trust Wallet 5-Mode Playbook endpoint
    const playbookRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/playbook', {
        headers: { Authorization: `Bearer ${userJwt}` },
      }),
      env
    );
    expect(playbookRes.status).toBe(200);
    const pbJson = (await playbookRes.json()) as { ok: boolean; modes: Array<{ key: string }> };
    expect(pbJson.ok).toBe(true);
    expect(pbJson.modes.length).toBeGreaterThanOrEqual(5);

    // Admin 3% fee report + manual ledger decide
    await db
      .prepare(
        `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, tx_hash, note)
         VALUES ('fee_pending_1', ?, 'settle_test_1', 'SETTLEMENT_ONCHAIN', 'USDT', 100, 3, 4.5, 'PENDING_VERIFY', '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'Pending manual check')`
      )
      .bind(userId)
      .run();

    const feeReportRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/fee-report', {
        headers: { Authorization: `Bearer ${adminJwt}` },
      }),
      env
    );
    expect(feeReportRes.status).toBe(200);
    const feeReportJson = (await feeReportRes.json()) as {
      totals: { totalPendingVerifyUsd: number };
      ledgerEntries: Array<{ id: string; status: string }>;
    };
    expect(feeReportJson.totals.totalPendingVerifyUsd).toBeGreaterThanOrEqual(4.5);

    const decideRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/fee-report/ledger/fee_pending_1/decide', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true, note: 'Verified manually' }),
      }),
      env
    );
    expect(decideRes.status).toBe(200);
    const ledgerAfter = await db
      .prepare(`SELECT status FROM server_fee_ledger WHERE id = 'fee_pending_1'`)
      .first<{ status: string }>();
    expect(ledgerAfter?.status).toBe('SETTLED_ONCHAIN');
  });

  it('5. Verifies Multi-Browser V11.9.1 Extensions (Chrome, Edge, Firefox), Fonts, SidePanel Auth & Copy-Trade PAPER_SIMULATOR API', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const extDir = path.join(repoRoot, 'apps/extension');
    const downloadsDir = path.join(repoRoot, 'apps/web/public/downloads');

    // Chrome manifest keeps version 11.7.2 for version-guard while declaring V11.9.1 in version_name
    const chromeManifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
    expect(chromeManifest.version).toBe('11.7.2');
    expect(chromeManifest.version_name).toBe('11.9.1');
    expect(chromeManifest.permissions).toContain('sidePanel');
    expect(chromeManifest.side_panel?.default_path).toBe('sidepanel.html');

    // Edge manifest
    const edgeManifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifests/manifest.edge.json'), 'utf8'));
    expect(edgeManifest.version).toBe('11.7.2');
    expect(edgeManifest.version_name).toBe('11.9.1');
    expect(edgeManifest.permissions).toContain('sidePanel');
    expect(edgeManifest.side_panel?.default_path).toBe('sidepanel.html');

    // Firefox MV3 manifest uses sidebar_action + background.scripts + gecko ID (and no sidePanel/version_name)
    const firefoxManifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifests/manifest.firefox.json'), 'utf8'));
    expect(firefoxManifest.version).toBe('11.7.2');
    expect(firefoxManifest.sidebar_action?.default_panel).toBe('sidepanel.html');
    expect(firefoxManifest.background?.scripts).toContain('background.js');
    expect(firefoxManifest.browser_specific_settings?.gecko?.id).toBe('dollarino@dollarino.app');
    expect(firefoxManifest.permissions).not.toContain('sidePanel');
    expect(firefoxManifest.version_name).toBeUndefined();

    // Font path bug fixed across sidepanel.css + popup.css
    const sideCss = fs.readFileSync(path.join(extDir, 'sidepanel.css'), 'utf8');
    expect(sideCss).toContain("fonts/Vazirmatn.woff2");
    expect(sideCss).not.toContain('vazirmatn-400');

    // Full V11.9.1 feature parity in shared extension app.js + HTML views
    const extAppJs = fs.readFileSync(path.join(extDir, 'app.js'), 'utf8');
    expect(extAppJs).toContain('/api/trustwallet/playbook');
    expect(extAppJs).toContain('PAPER_SIMULATOR');
    expect(extAppJs).toContain('/api/trading/popups/');
    expect(extAppJs).toContain('/api/trading/accept-risk-terms');
    expect(extAppJs).toContain('set-playbook-mode');
    expect(extAppJs).toContain('reconciliationOk');
    expect(extAppJs).toContain('تراز یکپارچه ۵ موتور سرمایه‌گذاری');

    // Built downloadable archives for all 3 browsers + web sidepanel embed direct auth
    for (const zipName of [
      'dollarino-extension.zip',
      'dollarino-extension-chrome.zip',
      'dollarino-extension-edge.zip',
      'dollarino-extension-firefox.zip',
    ]) {
      const zipPath = path.join(downloadsDir, zipName);
      expect(fs.existsSync(zipPath)).toBe(true);
      expect(fs.statSync(zipPath).size).toBeGreaterThan(20_000);
    }

    const webAppTsx = fs.readFileSync(path.join(repoRoot, 'apps/web/src/App.tsx'), 'utf8');
    expect(webAppTsx).toContain("qp.get('embed') === 'sidepanel'");

    // Copy-Trade rule API explicitly persists PAPER_SIMULATOR (instead of coercing to MANUAL_CONFIRM)
    const env = makeEnv();
    const uid = 'usr_copy_rule_v1191';
    await db
      .prepare(`INSERT INTO users (id, email, username, password_hash, role, profile_completed) VALUES (?, 'copyv1191@test.local', 'copyv1191', 'x', 'user', 1)`)
      .bind(uid)
      .run();
    await ensureUserDefaults(db, uid);
    const jwt = await signJwt({ sub: uid, email: 'copyv1191@test.local', username: 'copyv1191', role: 'user' }, env.SESSION_JWT_SECRET);

    const ruleTraderId = 'sw_v1191_test';
    await db
      .prepare(
        `INSERT OR IGNORE INTO smart_wallet_traders (id, chain_id, wallet_address, display_name, is_active)
         VALUES (?, 'solana', 'So11111111111111111111111111111111111111112', 'Solana Whale Paper', 1)`
      )
      .bind(ruleTraderId)
      .run();

    const ruleRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traderKind: 'SMART_WALLET',
          traderId: ruleTraderId,
          traderLabel: 'Solana Whale Paper',
          chainId: 'solana',
          executionMode: 'PAPER_SIMULATOR',
          allocatedMarginUsd: 100,
          orderSizeUsd: 25,
        }),
      }),
      env
    );
    expect(ruleRes.status).toBe(200);
    const savedRule = await db
      .prepare(`SELECT execution_mode FROM copy_follow_rules WHERE user_id = ? LIMIT 1`)
      .bind(uid)
      .first<{ execution_mode: string }>();
    expect(savedRule?.execution_mode).toBe('PAPER_SIMULATOR');
  });

  it('6. Telegram Bot V11.9.1 Simple Mode Site-Parity Dashboard, Mode/Demo Controls, 5-Bucket Positions & Multi-Browser Extensions', async () => {
    const env = makeEnv();
    const tgId = 88990011;
    const uid = 'usr_tg_simple_v1191';
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, phone_number, phone_verified, ui_mode, profile_completed)
         VALUES (?, 'tgsimple@test.local', 'tgsimple', 'x', 'user', ?, 'tgsimple', '+989121112233', 1, 'simple', 1)`
      )
      .bind(uid, String(tgId))
      .run();
    await ensureUserDefaults(db, uid);

    const kb = mainMenuKeyboard('https://dollarino.pages.dev', 'simple', false);
    const kbFlat = JSON.stringify(kb);
    expect(kbFlat).toContain('🏠 پنل ساده من');
    expect(kbFlat).toContain('🤖 شروع / توقف ربات');
    expect(kbFlat).toContain('🎛 ۵ موتور ترید');
    expect(kbFlat).toContain('💼 دمو / واقعی و بودجه');
    expect(kbFlat).toContain('📊 معاملات و تراز ۵ بخش');
    expect(kbFlat).toContain('🎯 اسنایپر زیر ۵ دقیقه');
    expect(kbFlat).toContain('کارت سود دلارینو 📊');
    expect(kbFlat).toContain('اعلان‌ها 🔔');
    expect(kbFlat).toContain('🛡 Trust Wallet');
    expect(kbFlat).toContain('🛠 ابزارها و پشتیبانی');
    expect(kbFlat).toContain('⚡ حالت حرفه‌ای');
    expect(welcomeMessage('سارا', 'simple', 'https://dollarino.pages.dev')).toContain('V11.9.1');

    const sent: Array<{ method: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org')) {
        const method = url.split('/').pop() || '';
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        sent.push({ method, body });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 500 + sent.length } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('api.tetherland.com') || url.includes('apiv2.nobitex.ir') || url.includes('api.nobitex.ir')) {
        return new Response(JSON.stringify({ data: { currencies: { USDT: { price: 82000 } } } }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      // /start in Simple Mode renders Site-Parity Home Sheet
      sent.length = 0;
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 901,
        message: {
          message_id: 1,
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          chat: { id: tgId, type: 'private' },
          text: '/start',
        },
      });
      const textsStart = sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text));
      expect(textsStart.some((t) => t.includes('پنل ساده دلارینو (V11.9.1 · همگام با سایت)'))).toBe(true);
      expect(textsStart.some((t) => t.includes('برد اول ۰٪ · سپس ۳٪ از سود'))).toBe(true);

      // Demo balance preset ($100,000) + manual execution mode via callbacks
      sent.length = 0;
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 902,
        callback_query: {
          id: 'cq_demo_100k',
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          message: { message_id: 501, chat: { id: tgId, type: 'private' } },
          data: 'tg_simple_set_demo:100000',
        },
      });
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 903,
        callback_query: {
          id: 'cq_exec_manual',
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          message: { message_id: 501, chat: { id: tgId, type: 'private' } },
          data: 'tg_simple_exec:MANUAL_CONFIRM',
        },
      });
      const cfgAfter = await db
        .prepare(`SELECT paper_balance, trade_execution_mode FROM bot_configs WHERE user_id = ?`)
        .bind(uid)
        .first<{ paper_balance: string; trade_execution_mode: string }>();
      expect(Number(cfgAfter?.paper_balance)).toBe(100000);
      expect(cfgAfter?.trade_execution_mode).toBe('MANUAL_CONFIRM');

      // 5-Bucket Positions & Accounting button + Trust Wallet Playbook + Multi-browser Extensions
      sent.length = 0;
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 904,
        message: {
          message_id: 2,
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          chat: { id: tgId, type: 'private' },
          text: '📊 معاملات و تراز ۵ بخش',
        },
      });
      expect(sent.some((s) => String(s.body.text || '').includes('تراز یکپارچه ۵ موتور'))).toBe(true);

      sent.length = 0;
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 905,
        callback_query: {
          id: 'cq_tw_pb',
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          message: { message_id: 502, chat: { id: tgId, type: 'private' } },
          data: 'tg_tw_playbook:DEX',
        },
      });
      expect(sent.some((s) => String(s.body.text || '').includes('راهنمای جامع ترید با Trust Wallet'))).toBe(true);

      sent.length = 0;
      await handleTelegramUpdate(env, env.TELEGRAM_BOT_TOKEN!, {
        update_id: 906,
        message: {
          message_id: 3,
          from: { id: tgId, first_name: 'سارا', username: 'tgsimple' },
          chat: { id: tgId, type: 'private' },
          text: '🧩 اکستنشن کروم/فایرفاکس/اج',
        },
      });
      const extOut = JSON.stringify(sent);
      expect(extOut).toContain('dollarino-extension.zip');
      expect(extOut).toContain('dollarino-extension-firefox.zip');
      expect(extOut).toContain('dollarino-extension-edge.zip');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
