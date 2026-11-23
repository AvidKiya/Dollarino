import type { DollarinoSignal } from '@dollarino/core';
import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { hmacSha256Hex, randomId, sha256Hex, verifyPassword } from '../crypto.js';
import { fetchDexTrendingOverview, searchDexPairs } from '../dex/screener.js';
import {
  baselineWalletTxIfEmpty,
  closeCopyPositionV2,
  discoverTop10SmartTraders,
  ensureUserCopyVault,
  executeSmartCopySignalForRule,
  exportUserCopyVaultKeys,
  inspectAndAddCustomWallet,
  pollWatchedWalletsForNewTrades,
  reconcileCopyPositionsV2,
  runTokenRugAndSafetyScan,
  simulateWalletCopyBacktest,
  type CopyFollowRuleRow,
  type CopyPositionV2Row,
  type SmartWalletTraderRow,
} from '../dex/smart-copy.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import { activateExclusiveTradingEngine, getActiveEngineState } from '../engine/exclusive-engine.js';
import { executeSignalForUser, logAudit, notifyUserTelegram } from '../engine/executor.js';
import type { Env } from '../env.js';
import { requirePaidEntitlement } from './subscriptions.js';
import { buildVerifiedCardCanonicalPayload } from './trading.js';
import { fetchEvmNativeBalance, fetchSolanaBalance, fetchTronBalances } from './trustwallet.js';

export interface CopyTraderRow {
  id: string;
  user_id?: string | null;
  telegram_id?: string | null;
  auto_ask_publish?: number;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  bio_fa: string | null;
  bio_en: string | null;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  min_allocation_usd: number;
  risk_level: string;
  is_verified: number;
  is_active: number;
  created_at: string;
}

export interface CopyTraderTradeRow {
  id: string;
  trader_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  entry_price: string;
  exit_price: string | null;
  stop_loss: string | null;
  tp1: string | null;
  tp2?: string | null;
  tp3?: string | null;
  status: 'OPEN' | 'CLOSED';
  publish_status?: string;
  pnl_pct: number;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
}

export const copyTradeRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
copyTradeRoutes.use('*', requireAuth);

copyTradeRoutes.get('/traders', async (c) => {
  const user = c.get('user');

  const [tradersRes, tradesRes, mySubsRes, pendingOwnRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC, followers_count DESC`
    ).all<CopyTraderRow>().catch(() => ({ results: [] as CopyTraderRow[] })),
    c.env.DB.prepare(
      `SELECT * FROM copy_trader_trades WHERE COALESCE(publish_status, 'PUBLISHED') = 'PUBLISHED' ORDER BY opened_at DESC LIMIT 80`
    ).all<CopyTraderTradeRow>().catch(() => ({ results: [] as CopyTraderTradeRow[] })),
    c.env.DB.prepare(
      `SELECT * FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`
    ).bind(user.id).all<{
      id: string;
      trader_id: string;
      allocation_usd: number;
      risk_multiplier: number;
      auto_mirror: number;
      is_active: number;
    }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT ctt.*, ct.display_name AS trader_name
       FROM copy_trader_trades ctt
       JOIN copy_traders ct ON ct.id = ctt.trader_id
       WHERE ct.user_id = ? AND ctt.publish_status = 'PENDING_CONFIRM'
       ORDER BY ctt.opened_at DESC LIMIT 10`
    ).bind(user.id).all<CopyTraderTradeRow & { trader_name: string }>().catch(() => ({ results: [] })),
  ]);

  const tradesByTrader = new Map<string, CopyTraderTradeRow[]>();
  for (const t of tradesRes.results) {
    const arr = tradesByTrader.get(t.trader_id) ?? [];
    if (arr.length < 8) arr.push(t);
    tradesByTrader.set(t.trader_id, arr);
  }

  const subByTrader = new Map(mySubsRes.results.map((s) => [s.trader_id, s]));

  const traders = tradersRes.results.map((t) => {
    const mySub = subByTrader.get(t.id) ?? null;
    return {
      ...t,
      trades: tradesByTrader.get(t.id) ?? [],
      following: Boolean(mySub),
      mySubscription: mySub,
      isMe: t.user_id === user.id,
    };
  });

  const activeEngine = await getActiveEngineState(c.env.DB, user.id);

  return c.json({
    traders,
    pendingConfirmations: pendingOwnRes.results,
    activeEngine,
  });
});

copyTradeRoutes.post('/follow', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    traderId?: string;
    follow?: boolean;
    allocationUsd?: number;
    riskMultiplier?: number;
    autoMirror?: boolean;
  }>().catch(() => ({} as Record<string, unknown>));

  const traderId = String(body.traderId || '').trim();
  const follow = body.follow !== false;
  if (!traderId) return c.json({ error: 'شناسه تریدر الزامی است.' }, 400);

  const trader = await c.env.DB.prepare(
    `SELECT * FROM copy_traders WHERE id = ? AND is_active = 1 AND is_verified = 1 LIMIT 1`
  ).bind(traderId).first<CopyTraderRow>();
  if (!trader) return c.json({ error: 'تریدر تاییدشده یافت نشد.' }, 404);

  if (follow) {
    const gate = await requirePaidEntitlement(c.env.DB, user);
    if (!gate.ok) {
      return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
    }

    // Strict Single-Engine Mutual Exclusion: enabling Copy Trade automatically stops AI / Strategy bot & Personal AI
    const excl = await activateExclusiveTradingEngine(c.env.DB, user.id, 'COPY_TRADE', {
      auditSource: 'copy_trade_follow',
    });

    const alloc = Math.max(trader.min_allocation_usd || 20, Number(body.allocationUsd || 100));
    const mult = Math.max(0.2, Math.min(5, Number(body.riskMultiplier || 1)));
    const autoMirror = body.autoMirror !== false ? 1 : 0;

    const existing = await c.env.DB.prepare(
      `SELECT id, is_active FROM copy_subscriptions WHERE user_id = ? AND trader_id = ? LIMIT 1`
    ).bind(user.id, traderId).first<{ id: string; is_active: number }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE copy_subscriptions SET allocation_usd = ?, risk_multiplier = ?, auto_mirror = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?`
      ).bind(alloc, mult, autoMirror, existing.id).run();
      if (!existing.is_active) {
        await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
      }
    } else {
      await c.env.DB.prepare(
        `INSERT INTO copy_subscriptions (id, user_id, trader_id, allocation_usd, risk_multiplier, auto_mirror, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      ).bind(randomId('csub'), user.id, traderId, alloc, mult, autoMirror).run();
      await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
    }

    await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Subscribed to verified copy trader ${trader.display_name} ($${alloc})`);
    const activeEngine = await getActiveEngineState(c.env.DB, user.id);
    return c.json({
      ok: true,
      following: true,
      stoppedOtherEngines: excl.stoppedBot || excl.disabledMyAi,
      activeEngine,
    });
  } else {
    const existing = await c.env.DB.prepare(
      `SELECT id, is_active FROM copy_subscriptions WHERE user_id = ? AND trader_id = ? LIMIT 1`
    ).bind(user.id, traderId).first<{ id: string; is_active: number }>();

    if (existing && existing.is_active) {
      await c.env.DB.prepare(
        `UPDATE copy_subscriptions SET is_active = 0, updated_at = datetime('now') WHERE id = ?`
      ).bind(existing.id).run();
      await c.env.DB.prepare(`UPDATE copy_traders SET followers_count = MAX(0, followers_count - 1) WHERE id = ?`).bind(traderId).run();
    }
    const remRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`
    ).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
    if (Number(remRow?.cnt ?? 0) === 0) {
      await c.env.DB.prepare(
        `UPDATE bot_configs SET strategy_key = CASE WHEN strategy_key = 'copy_trade' THEN 'dollarino_v01' ELSE strategy_key END, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(user.id).run().catch(() => {});
    }
    const activeEngine = await getActiveEngineState(c.env.DB, user.id);
    return c.json({ ok: true, following: false, activeEngine });
  }
});

copyTradeRoutes.post('/trades/:tradeId/confirm-publish', async (c) => {
  const user = c.get('user');
  const tradeId = c.req.param('tradeId');
  const body = await c.req.json<{ approve?: boolean }>().catch(() => ({ approve: true }));

  const row = await c.env.DB.prepare(
    `SELECT ctt.id, ct.user_id AS trader_user_id
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? LIMIT 1`
  ).bind(tradeId).first<{ id: string; trader_user_id: string | null }>();

  if (!row) return c.json({ error: 'معامله یافت نشد.' }, 404);
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  if (!isAdmin && row.trader_user_id !== user.id) {
    return c.json({ error: 'شما مجاز به تایید انتشار این معامله نیستید.' }, 403);
  }

  const res = await confirmAndMirrorCopyTrade(c.env, tradeId, body.approve !== false);
  return c.json(res);
});

copyTradeRoutes.post('/copy-now/:tradeId', async (c) => {
  const user = c.get('user');
  const gate = await requirePaidEntitlement(c.env.DB, user);
  if (!gate.ok) {
    return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
  }

  const tradeId = c.req.param('tradeId');
  const trade = await c.env.DB.prepare(
    `SELECT ctt.*, ct.display_name
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? AND ct.is_active = 1 AND ct.is_verified = 1 LIMIT 1`
  ).bind(tradeId).first<CopyTraderTradeRow & { display_name: string }>();

  if (!trade) return c.json({ error: 'معامله تاییدشده یافت نشد.' }, 404);
  if (trade.status !== 'OPEN') return c.json({ error: 'این معامله بسته شده است؛ فقط معاملات باز قابل کپی فوری هستند.' }, 400);

  const entry = Number(trade.entry_price);
  const sl = Number(trade.stop_loss || (trade.direction === 'LONG' ? entry * 0.975 : entry * 1.025));
  const tp1 = Number(trade.tp1 || (trade.direction === 'LONG' ? entry * 1.03 : entry * 0.97));
  const dist = Math.max(entry * 0.015, Math.abs(tp1 - entry));
  const tp2 = trade.tp2 ? Number(trade.tp2) : (trade.direction === 'LONG' ? entry + dist * 1.7 : entry - dist * 1.7);
  const tp3 = trade.tp3 ? Number(trade.tp3) : (trade.direction === 'LONG' ? entry + dist * 2.5 : entry - dist * 2.5);

  const sig: DollarinoSignal = {
    symbol: trade.symbol,
    direction: trade.direction,
    timeframe: 'Copy',
    price: trade.entry_price,
    stopLoss: String(sl),
    leverage: Math.max(1, trade.leverage || 5),
    tp1: String(tp1),
    tp2: String(Number(tp2.toFixed(4))),
    tp3: String(Number(tp3.toFixed(4))),
    channelHandle: '@Dollarino_official',
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${trade.display_name}`,
    reason: `کپی معامله از تریدر تاییدشده ${trade.display_name}`,
  };

  const sigId = randomId('sig');
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status, engine_source, engine_label)
     VALUES (?, ?, 'copy_trader', ?, ?, 'Copy', ?, ?, ?, ?, ?, ?, ?, 'NEW', 'copy_trade', ?)`
  ).bind(
    sigId,
    user.id,
    sig.symbol,
    sig.direction,
    sig.price,
    sig.stopLoss,
    sig.leverage,
    sig.tp1,
    sig.tp2,
    sig.tp3,
    trade.note || sig.reason,
    sig.engineLabel
  ).run();

  const execRes = await executeSignalForUser(c.env, user.id, sig, {
    signalId: sigId,
    forceBypassState: true,
    strategyKey: 'copy_trade',
  });

  if (execRes.ok) {
    await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
    return c.json({ ok: true, tradeId: execRes.tradeId, message: `معامله ${trade.symbol} با موفقیت کپی شد!` });
  }
  return c.json({ ok: false, error: execRes.error || 'خطا در اجرای کپی‌ترید' }, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// Smart On-Chain & Multi-Chain Copy-Trading V2 (Top-10 + Custom Wallets + Rules)
// ═══════════════════════════════════════════════════════════════════════════

copyTradeRoutes.get('/smart-wallets', async (c) => {
  const user = c.get('user');
  const chainFilter = (c.req.query('chain') || 'ALL').trim();
  const forceRefresh = c.req.query('refresh') === '1';

  const [top10, customRes, rulesRes] = await Promise.all([
    discoverTop10SmartTraders(c.env, { forceRefresh, chainFilter }),
    c.env.DB.prepare(
      `SELECT * FROM smart_wallet_traders
       WHERE source_type = 'USER_CUSTOM' AND added_by_user_id = ? AND is_active = 1
       ORDER BY created_at DESC LIMIT 30`
    )
      .bind(user.id)
      .all<SmartWalletTraderRow>()
      .catch(() => ({ results: [] as SmartWalletTraderRow[] })),
    c.env.DB.prepare(
      `SELECT * FROM copy_follow_rules WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC`
    )
      .bind(user.id)
      .all<CopyFollowRuleRow>()
      .catch(() => ({ results: [] as CopyFollowRuleRow[] })),
  ]);

  const customFiltered =
    chainFilter && chainFilter !== 'ALL'
      ? customRes.results.filter((r) => r.chain_id.toLowerCase() === chainFilter.toLowerCase())
      : customRes.results;

  return c.json({
    ok: true,
    top10,
    customWallets: customFiltered,
    rules: rulesRes.results,
  });
});

copyTradeRoutes.post('/smart-wallets/refresh', async (c) => {
  const top10 = await discoverTop10SmartTraders(c.env, { forceRefresh: true });
  return c.json({ ok: true, top10 });
});

copyTradeRoutes.post('/smart-wallets/custom', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    walletAddress?: string;
    chainId?: string;
    displayName?: string;
  };
  if (!body.walletAddress?.trim()) {
    return c.json({ error: 'آدرس کیف‌پول الزامی است.' }, 400);
  }
  const res = await inspectAndAddCustomWallet(c.env, {
    userId: user.id,
    walletAddress: body.walletAddress,
    chainId: body.chainId,
    displayName: body.displayName,
  });
  if (!res.ok) {
    return c.json({ ok: false, error: res.error }, 400);
  }
  return c.json(res);
});

copyTradeRoutes.delete('/smart-wallets/custom/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `DELETE FROM smart_wallet_traders WHERE id = ? AND added_by_user_id = ? AND source_type = 'USER_CUSTOM'`
  )
    .bind(id, user.id)
    .run();
  await c.env.DB.prepare(`DELETE FROM copy_follow_rules WHERE trader_id = ? AND user_id = ?`)
    .bind(id, user.id)
    .run();
  return c.json({ ok: true });
});

copyTradeRoutes.post('/smart-wallets/:id/backtest', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trader = await c.env.DB.prepare(
    `SELECT * FROM smart_wallet_traders
     WHERE id = ? AND (source_type != 'USER_CUSTOM' OR added_by_user_id = ?) LIMIT 1`
  )
    .bind(id, user.id)
    .first<SmartWalletTraderRow>();
  if (!trader) return c.json({ error: 'کیف‌پول تریدر یافت نشد.' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as Partial<{
    orderSizeUsd: number;
    tp1Pct: number;
    tp2Pct: number;
    stopLossPct: number;
    trailingActivatePct: number;
    trailingDropPct: number;
    breakEvenPct: number;
    minSafetyScore: number;
    reverseCopy: boolean;
  }>;

  const report = simulateWalletCopyBacktest(trader, {
    orderSizeUsd: Number(body.orderSizeUsd ?? 25),
    tp1Pct: Number(body.tp1Pct ?? 30),
    tp2Pct: Number(body.tp2Pct ?? 75),
    stopLossPct: Number(body.stopLossPct ?? 20),
    trailingActivatePct: Number(body.trailingActivatePct ?? 25),
    trailingDropPct: Number(body.trailingDropPct ?? 10),
    breakEvenPct: Number(body.breakEvenPct ?? 18),
    minSafetyScore: Number(body.minSafetyScore ?? 60),
    reverseCopy: Boolean(body.reverseCopy),
  });

  return c.json({ ok: true, traderId: id, displayName: trader.display_name, report });
});

copyTradeRoutes.get('/rules', async (c) => {
  const user = c.get('user');
  const res = await c.env.DB.prepare(
    `SELECT * FROM copy_follow_rules WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC`
  )
    .bind(user.id)
    .all<CopyFollowRuleRow>();
  return c.json({ ok: true, rules: res.results });
});

copyTradeRoutes.post('/rules', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const traderKind = body.traderKind === 'SITE_TRADER' ? 'SITE_TRADER' : 'SMART_WALLET';
  const traderId = String(body.traderId || '').trim();
  if (!traderId) return c.json({ error: 'شناسه تریدر یا کیف‌پول الزامی است.' }, 400);

  const isActive = body.isActive === false ? 0 : 1;
  if (isActive) {
    const gate = await requirePaidEntitlement(c.env.DB, user);
    if (!gate.ok) {
      return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
    }
  }

  let traderLabel = String(body.traderLabel || '').trim();
  let chainId = String(body.chainId || 'solana').toLowerCase().trim();

  if (traderKind === 'SMART_WALLET') {
    const w = await c.env.DB.prepare(
      `SELECT display_name, chain_id FROM smart_wallet_traders WHERE id = ? LIMIT 1`
    )
      .bind(traderId)
      .first<{ display_name: string; chain_id: string }>();
    if (!w) return c.json({ error: 'کیف‌پول تریدر در دیتابیس یافت نشد.' }, 404);
    if (!traderLabel) traderLabel = w.display_name;
    if (!body.chainId) chainId = w.chain_id;
  } else {
    const st = await c.env.DB.prepare(`SELECT display_name FROM copy_traders WHERE id = ? LIMIT 1`)
      .bind(traderId)
      .first<{ display_name: string }>();
    if (!st) return c.json({ error: 'تریدر سایت یافت نشد.' }, 404);
    if (!traderLabel) traderLabel = st.display_name;
    if (!body.chainId) chainId = 'cex';
  }

  const executionMode =
    body.executionMode === 'AUTO_COPY_VAULT' || body.executionMode === 'AUTO_EVM_ALLOWANCE'
      ? body.executionMode
      : 'TRUST_ONE_CLICK';

  if (executionMode === 'AUTO_COPY_VAULT') {
    await ensureUserCopyVault(c.env, user.id);
  }

  const sizingMode =
    body.sizingMode === 'PCT_ALLOCATION' || body.sizingMode === 'PROPORTIONAL'
      ? body.sizingMode
      : 'FIXED_USD';

  const allocatedMargin = Math.max(10, Number(body.allocatedMarginUsd ?? 100));
  const orderSizeUsd = Math.max(5, Math.min(allocatedMargin, Number(body.orderSizeUsd ?? 25)));
  const orderSizePct = Math.max(1, Math.min(100, Number(body.orderSizePct ?? 15)));
  const leverage = Math.max(1, Math.min(50, Number(body.leverage ?? 5)));
  const tp1Pct = Math.max(2, Number(body.tp1Pct ?? 30));
  const tp1SellPct = Math.max(0, Math.min(100, Number(body.tp1SellPct ?? 40)));
  const tp2Pct = Math.max(tp1Pct + 1, Number(body.tp2Pct ?? 75));
  const tp2SellPct = Math.max(0, Math.min(100, Number(body.tp2SellPct ?? 40)));
  const tp3Pct = Math.max(tp2Pct + 1, Number(body.tp3Pct ?? 150));
  const moonbagPct = Math.max(0, Math.min(50, Number(body.moonbagPct ?? 20)));
  const stopLossPct = Math.max(2, Math.min(95, Number(body.stopLossPct ?? 20)));
  const trailingActivatePct = Math.max(3, Number(body.trailingActivatePct ?? 25));
  const trailingDropPct = Math.max(2, Math.min(50, Number(body.trailingDropPct ?? 10)));
  const breakEvenPct = Math.max(2, Number(body.breakEvenPct ?? 18));
  const timeLimitHours = Math.max(0, Math.min(720, Number(body.timeLimitHours ?? 48)));
  const minSafetyScore = Math.max(0, Math.min(95, Number(body.minSafetyScore ?? 60)));
  const maxSlippagePct = Math.max(0.5, Math.min(49, Number(body.maxSlippagePct ?? 15)));
  const minLiquidityUsd = Math.max(0, Number(body.minLiquidityUsd ?? 15000));
  const minMcapUsd = Math.max(0, Number(body.minMcapUsd ?? 25000));
  const maxMcapUsd = Math.max(minMcapUsd + 1000, Number(body.maxMcapUsd ?? 500000000));
  const maxOpenPositions = Math.max(1, Math.min(25, Number(body.maxOpenPositions ?? 4)));
  const dailyMaxLossUsd = Math.max(5, Number(body.dailyMaxLossUsd ?? 50));

  const onlyNewPositions = body.onlyNewPositions === false ? 0 : 1;
  const copySells = body.copySells === false ? 0 : 1;
  const devSellAutoExit = body.devSellAutoExit === false ? 0 : 1;
  const antiMev = body.antiMev === false ? 0 : 1;
  const aiGuardEnabled = body.aiGuardEnabled === true ? 1 : 0;
  const reverseCopy = body.reverseCopy === true ? 1 : 0;

  const existing = await c.env.DB.prepare(
    `SELECT id FROM copy_follow_rules WHERE user_id = ? AND trader_kind = ? AND trader_id = ? LIMIT 1`
  )
    .bind(user.id, traderKind, traderId)
    .first<{ id: string }>();

  const ruleId = existing?.id || randomId('crule');

  await c.env.DB.prepare(
    `INSERT INTO copy_follow_rules (
       id, user_id, trader_kind, trader_id, trader_label, chain_id, execution_mode,
       allocated_margin_usd, sizing_mode, order_size_usd, order_size_pct, leverage,
       tp1_pct, tp1_sell_pct, tp2_pct, tp2_sell_pct, tp3_pct, moonbag_pct,
       stop_loss_pct, trailing_activate_pct, trailing_drop_pct, break_even_pct, time_limit_hours,
       min_safety_score, max_slippage_pct, min_liquidity_usd, min_mcap_usd, max_mcap_usd,
       max_open_positions, daily_max_loss_usd, only_new_positions, copy_sells, dev_sell_auto_exit,
       anti_mev, ai_guard_enabled, reverse_copy, is_active, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, trader_kind, trader_id) DO UPDATE SET
       trader_label = excluded.trader_label,
       chain_id = excluded.chain_id,
       execution_mode = excluded.execution_mode,
       allocated_margin_usd = excluded.allocated_margin_usd,
       sizing_mode = excluded.sizing_mode,
       order_size_usd = excluded.order_size_usd,
       order_size_pct = excluded.order_size_pct,
       leverage = excluded.leverage,
       tp1_pct = excluded.tp1_pct,
       tp1_sell_pct = excluded.tp1_sell_pct,
       tp2_pct = excluded.tp2_pct,
       tp2_sell_pct = excluded.tp2_sell_pct,
       tp3_pct = excluded.tp3_pct,
       moonbag_pct = excluded.moonbag_pct,
       stop_loss_pct = excluded.stop_loss_pct,
       trailing_activate_pct = excluded.trailing_activate_pct,
       trailing_drop_pct = excluded.trailing_drop_pct,
       break_even_pct = excluded.break_even_pct,
       time_limit_hours = excluded.time_limit_hours,
       min_safety_score = excluded.min_safety_score,
       max_slippage_pct = excluded.max_slippage_pct,
       min_liquidity_usd = excluded.min_liquidity_usd,
       min_mcap_usd = excluded.min_mcap_usd,
       max_mcap_usd = excluded.max_mcap_usd,
       max_open_positions = excluded.max_open_positions,
       daily_max_loss_usd = excluded.daily_max_loss_usd,
       only_new_positions = excluded.only_new_positions,
       copy_sells = excluded.copy_sells,
       dev_sell_auto_exit = excluded.dev_sell_auto_exit,
       anti_mev = excluded.anti_mev,
       ai_guard_enabled = excluded.ai_guard_enabled,
       reverse_copy = excluded.reverse_copy,
       is_active = excluded.is_active,
       updated_at = datetime('now')`
  )
    .bind(
      ruleId,
      user.id,
      traderKind,
      traderId,
      traderLabel,
      chainId,
      executionMode,
      allocatedMargin,
      sizingMode,
      orderSizeUsd,
      orderSizePct,
      leverage,
      tp1Pct,
      tp1SellPct,
      tp2Pct,
      tp2SellPct,
      tp3Pct,
      moonbagPct,
      stopLossPct,
      trailingActivatePct,
      trailingDropPct,
      breakEvenPct,
      timeLimitHours,
      minSafetyScore,
      maxSlippagePct,
      minLiquidityUsd,
      minMcapUsd,
      maxMcapUsd,
      maxOpenPositions,
      dailyMaxLossUsd,
      onlyNewPositions,
      copySells,
      devSellAutoExit,
      antiMev,
      aiGuardEnabled,
      reverseCopy,
      isActive
    )
    .run();

  if (isActive && traderKind === 'SITE_TRADER') {
    await activateExclusiveTradingEngine(c.env.DB, user.id, 'COPY_TRADE', {
      auditSource: 'copy_follow_rule_v2',
    }).catch(() => {});
  } else if (isActive && traderKind === 'SMART_WALLET') {
    await baselineWalletTxIfEmpty(c.env, traderId).catch(() => {});
  }

  const saved = await c.env.DB.prepare(`SELECT * FROM copy_follow_rules WHERE id = ? LIMIT 1`)
    .bind(ruleId)
    .first<CopyFollowRuleRow>();

  return c.json({ ok: true, rule: saved });
});

copyTradeRoutes.delete('/rules/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM copy_follow_rules WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return c.json({ ok: true });
});

copyTradeRoutes.post('/rules/:id/test-signal', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const rule = await c.env.DB.prepare(`SELECT * FROM copy_follow_rules WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, user.id)
    .first<CopyFollowRuleRow>();
  if (!rule) return c.json({ error: 'قانون کپی‌ترید یافت نشد.' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    tokenAddress?: string;
    tokenSymbol?: string;
    side?: 'BUY' | 'SELL';
  };

  let chainId = body.chainId?.trim() || (rule.chain_id === 'cex' ? 'solana' : rule.chain_id);
  let tokenAddress = body.tokenAddress?.trim() || '';
  let tokenSymbol = body.tokenSymbol?.trim() || '';
  let tokenName = '';

  if (!tokenAddress) {
    const trending = await fetchDexTrendingOverview().catch(() => ({ pairs: [] }));
    const match = trending.pairs.find((p) => p.chainId.toLowerCase() === chainId.toLowerCase()) || trending.pairs[0];
    if (match) {
      chainId = match.chainId;
      tokenAddress = match.baseToken.address;
      tokenSymbol = match.baseToken.symbol;
      tokenName = match.baseToken.name;
    } else {
      const hits = await searchDexPairs('SOL').catch(() => []);
      if (hits[0]) {
        chainId = hits[0].chainId;
        tokenAddress = hits[0].baseToken.address;
        tokenSymbol = hits[0].baseToken.symbol;
        tokenName = hits[0].baseToken.name;
      }
    }
  }

  if (!tokenAddress) {
    return c.json({ error: 'توکن معتبری برای تست پیدا نشد؛ آدرس توکن را وارد کنید.' }, 400);
  }

  const result = await executeSmartCopySignalForRule(c.env, rule, {
    chainId,
    tokenAddress,
    tokenSymbol,
    tokenName,
    side: body.side || 'BUY',
  });

  return c.json(result, result.ok ? 200 : 400);
});

copyTradeRoutes.get('/vault', async (c) => {
  const user = c.get('user');
  const vault = await ensureUserCopyVault(c.env, user.id);

  const [bscBal, ethBal, baseBal, solBal, tronBal, twRow] = await Promise.all([
    fetchEvmNativeBalance('https://bsc-dataseed.binance.org', vault.evmAddress),
    fetchEvmNativeBalance('https://ethereum-rpc.publicnode.com', vault.evmAddress),
    fetchEvmNativeBalance('https://mainnet.base.org', vault.evmAddress),
    fetchSolanaBalance(vault.solanaAddress),
    vault.tronAddress ? fetchTronBalances(vault.tronAddress) : Promise.resolve(null),
    c.env.DB.prepare(
      `SELECT trust_wallet_address, trust_wallet_solana, trust_wallet_tron, has_custom_password, telegram_id FROM users WHERE id = ? LIMIT 1`
    )
      .bind(user.id)
      .first<{
        trust_wallet_address: string | null;
        trust_wallet_solana: string | null;
        trust_wallet_tron: string | null;
        has_custom_password: number;
        telegram_id: string | null;
      }>()
      .catch(() => null),
  ]);

  return c.json({
    ok: true,
    vault,
    balances: {
      bscBnb: bscBal ?? 0,
      eth: ethBal ?? 0,
      baseEth: baseBal ?? 0,
      solana: solBal ?? 0,
      tronTrx: tronBal?.trx ?? 0,
      tronUsdt: tronBal?.usdt ?? 0,
    },
    trustWalletTargets: {
      evm: twRow?.trust_wallet_address || null,
      solana: twRow?.trust_wallet_solana || null,
      tron: twRow?.trust_wallet_tron || null,
    },
    securityCaps: {
      hasCustomPassword: Boolean(twRow?.has_custom_password),
      hasTelegramLinked: Boolean(twRow?.telegram_id),
    },
  });
});

copyTradeRoutes.post('/vault/request-pin', async (c) => {
  const user = c.get('user');
  await ensureUserCopyVault(c.env, user.id);
  const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
  const pinHash = await sha256Hex(`${user.id}:${pin}`);
  await c.env.DB.prepare(
    `UPDATE user_copy_vaults SET vault_pin_hash = ?, vault_pin_expires_at = datetime('now', '+10 minutes') WHERE user_id = ?`
  )
    .bind(pinHash, user.id)
    .run();

  const uRow = await c.env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ? LIMIT 1`)
    .bind(user.id)
    .first<{ telegram_id: string | null }>()
    .catch(() => null);

  if (!uRow?.telegram_id) {
    return c.json({ ok: false, error: 'حساب شما به تلگرام متصل نیست. از رمز عبور حساب خود برای تایید استفاده کنید.' }, 400);
  }

  await notifyUserTelegram(
    c.env,
    user.id,
    `🔐 **کد تایید ۲ مرحله‌ای خزانه کپی‌ترید دلارینو**\n\n` +
      `کد یک‌بارمصرف شما: \`${pin}\`\n` +
      `اعتبار: ۱۰ دقیقه\n\n` +
      `⚠️ اگر خودتان درخواست مشاهده کلیدهای خزانه را نداده‌اید، این کد را در اختیار هیچ‌کس قرار ندهید.`
  );
  return c.json({ ok: true, sentToTelegram: true, expiresInMinutes: 10 });
});

copyTradeRoutes.post('/vault/settings', async (c) => {
  const user = c.get('user');
  await ensureUserCopyVault(c.env, user.id);
  const body = (await c.req.json().catch(() => ({}))) as {
    allowanceLimitUsd?: number;
    autoWithdrawToTrust?: boolean;
  };
  await c.env.DB.prepare(
    `UPDATE user_copy_vaults
     SET allowance_limit_usd = COALESCE(?, allowance_limit_usd),
         auto_withdraw_to_trust = COALESCE(?, auto_withdraw_to_trust)
     WHERE user_id = ?`
  )
    .bind(
      typeof body.allowanceLimitUsd === 'number' ? Math.max(10, body.allowanceLimitUsd) : null,
      typeof body.autoWithdrawToTrust === 'boolean' ? (body.autoWithdrawToTrust ? 1 : 0) : null,
      user.id
    )
    .run();
  return c.json({ ok: true });
});

copyTradeRoutes.get('/positions-v2', async (c) => {
  const user = c.get('user');
  if (c.req.query('reconcile') === '1') {
    await reconcileCopyPositionsV2(c.env, user.id).catch(() => {});
  }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM copy_positions_v2 WHERE user_id = ? ORDER BY opened_at DESC LIMIT 80`
  )
    .bind(user.id)
    .all<CopyPositionV2Row>()
    .catch(() => ({ results: [] as CopyPositionV2Row[] }));

  return c.json({ ok: true, positions: rows.results });
});

copyTradeRoutes.post('/positions-v2/:id/action', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    action?: 'CONFIRM' | 'CLOSE' | 'CLOSE_50' | 'DISMISS';
    txHash?: string;
  };
  const pos = await c.env.DB.prepare(`SELECT * FROM copy_positions_v2 WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, user.id)
    .first<CopyPositionV2Row>();
  if (!pos) return c.json({ error: 'پوزیشن یافت نشد.' }, 404);

  if (body.action === 'CONFIRM') {
    await c.env.DB.prepare(
      `UPDATE copy_positions_v2 SET status = 'OPEN', tx_hash = COALESCE(?, tx_hash) WHERE id = ?`
    )
      .bind(body.txHash?.trim() || null, id)
      .run();
    return c.json({ ok: true, status: 'OPEN', message: 'پوزیشن روی Trust Wallet تایید و فعال شد.' });
  }

  if (body.action === 'DISMISS') {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE copy_positions_v2 SET status = 'CLOSED', remaining_pct = 0, closed_at = datetime('now'), ai_guard_note = 'لغو توسط کاربر' WHERE id = ?`).bind(id),
      c.env.DB.prepare(`UPDATE copy_follow_rules SET used_margin_usd = MAX(0, used_margin_usd - ?) WHERE id = ?`).bind(pos.margin_usd, pos.rule_id),
    ]);
    return c.json({ ok: true, status: 'CLOSED', message: 'سیگنال لغو و مارجین به باکس تریدر برگشت.' });
  }

  if (body.action === 'CLOSE_50' && pos.status === 'OPEN') {
    const half = Math.max(0, Number(pos.remaining_pct) / 2);
    const partialUsd = (Number(pos.margin_usd) * (half / 100) * Number(pos.pnl_pct)) / 100;
    await c.env.DB.prepare(
      `UPDATE copy_positions_v2 SET remaining_pct = ?, pnl_usd = pnl_usd + ? WHERE id = ?`
    )
      .bind(Number(half.toFixed(1)), Number(partialUsd.toFixed(2)), id)
      .run();
    return c.json({ ok: true, message: '۵۰٪ حجم پوزیشن سیو سود شد.' });
  }

  await closeCopyPositionV2(c.env, pos, Number(pos.current_price_usd || pos.entry_price_usd), 'Manual Close');
  return c.json({ ok: true, status: 'CLOSED', message: 'پوزیشن بسته و مارجین آزاد شد.' });
});

copyTradeRoutes.get('/token-safety', async (c) => {
  const chainId = (c.req.query('chainId') || 'solana').trim();
  const tokenAddress = (c.req.query('tokenAddress') || '').trim();
  if (!tokenAddress) return c.json({ error: 'tokenAddress الزامی است.' }, 400);
  const report = await runTokenRugAndSafetyScan(c.env, chainId, tokenAddress);
  return c.json({ ok: true, report });
});

copyTradeRoutes.post('/vault/export-keys', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    password?: string;
    pinCode?: string;
    requireVerification?: boolean;
  };

  const [uSec, vSec] = await Promise.all([
    c.env.DB.prepare(`SELECT password_hash, has_custom_password FROM users WHERE id = ? LIMIT 1`)
      .bind(user.id)
      .first<{ password_hash: string; has_custom_password: number }>()
      .catch(() => null),
    c.env.DB.prepare(`SELECT vault_pin_hash, vault_pin_expires_at FROM user_copy_vaults WHERE user_id = ? LIMIT 1`)
      .bind(user.id)
      .first<{ vault_pin_hash: string | null; vault_pin_expires_at: string | null }>()
      .catch(() => null),
  ]);

  const pinActive = Boolean(
    vSec?.vault_pin_hash &&
      vSec?.vault_pin_expires_at &&
      Date.parse(`${vSec.vault_pin_expires_at.replace(' ', 'T')}Z`) > Date.now()
  );

  if (body.requireVerification || pinActive || body.password || body.pinCode) {
    let verified = false;
    if (body.pinCode && pinActive) {
      const candidateHash = await sha256Hex(`${user.id}:${String(body.pinCode).trim()}`);
      if (candidateHash === vSec?.vault_pin_hash) {
        verified = true;
        await c.env.DB.prepare(
          `UPDATE user_copy_vaults SET vault_pin_hash = NULL, vault_pin_expires_at = NULL WHERE user_id = ?`
        )
          .bind(user.id)
          .run()
          .catch(() => {});
      }
    }
    if (!verified && body.password && uSec?.has_custom_password && uSec.password_hash) {
      verified = await verifyPassword(String(body.password), uSec.password_hash).catch(() => false);
    }
    if (!verified) {
      return c.json(
        {
          ok: false,
          code: 'VAULT_2FA_REQUIRED',
          error: 'برای امنیت سرمایه، رمز عبور حساب یا کد تایید ۶ رقمی تلگرام الزامی و باید صحیح باشد.',
        },
        403
      );
    }
  }

  const keys = await exportUserCopyVaultKeys(c.env, user.id);
  await logAudit(c.env.DB, user.id, 'SECURITY', 'WARN', 'User exported isolated Copy-Vault private keys');
  await notifyUserTelegram(
    c.env,
    user.id,
    `🔐 **هشدار امنیتی خزانه ۲۴ ساعته دلارینو**\n` +
      `هم‌اکنون کلیدهای خصوصی خزانه اختصاصی شما در پنل وب نمایش/بک‌آپ گرفته شد.\n` +
      `اگر این اقدام توسط خودتان نبوده، دارایی خزانه را فوراً به Trust Wallet شخصی منتقل کرده و با پشتیبانی تماس بگیرید.`
  ).catch(() => {});
  return c.json({
    ok: true,
    keys,
    warning: 'کلیدها نمایش داده شد و هشدار امنیتی برای تلگرام شما ارسال گردید.',
  });
});

copyTradeRoutes.post('/poll-now', async (c) => {
  const res = await pollWatchedWalletsForNewTrades(c.env);
  const reconciled = await reconcileCopyPositionsV2(c.env, c.get('user').id).catch(() => 0);
  return c.json({ ok: true, ...res, reconciled });
});

copyTradeRoutes.post('/positions-v2/:id/profit-card', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const pos = await c.env.DB.prepare(`SELECT * FROM copy_positions_v2 WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, user.id)
    .first<CopyPositionV2Row>();
  if (!pos) return c.json({ error: 'پوزیشن یافت نشد.' }, 404);

  const cardId = `DLR-${randomId('').slice(0, 10).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const mode = pos.tx_hash ? 'LIVE' : 'PAPER';
  const startDate = pos.opened_at;
  const endDate = pos.closed_at || issuedAt;
  const pnlUsd = Number(Number(pos.pnl_usd || 0).toFixed(2));
  const roiPct = Number(Number(pos.pnl_pct || 0).toFixed(2));
  const winRate = pnlUsd >= 0 ? 100 : 0;
  const profitFactor = pnlUsd > 0 ? 99 : 0;
  const exchangeProvider = `${pos.chain_id.toUpperCase()} · ${pos.dex_name}`;
  const strategyName = `کپی‌ترید ${pos.trader_label}`;
  const tradesHash = await sha256Hex(`${pos.id}:${pnlUsd}:${endDate}`);
  const cardSecret = c.env.SESSION_JWT_SECRET || c.env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';

  const canonical = buildVerifiedCardCanonicalPayload({
    id: cardId,
    userId: user.id,
    mode,
    period: 'TRADE',
    startDate,
    endDate,
    tradesCount: 1,
    winRate,
    netPnlUsd: pnlUsd,
    roiPct,
    profitFactor,
    exchangeProvider,
    strategyName,
    tradesHash,
    issuedAt,
  });
  const hmacSignature = await hmacSha256Hex(canonical, cardSecret);

  const payloadSnapshot = JSON.stringify({
    cardStyle: 'gold',
    symbol: `${pos.token_symbol}/${pos.chain_id.toUpperCase()}`,
    direction: pos.direction,
    isVerifiedReal: Boolean(pos.tx_hash),
    txHash: pos.tx_hash || null,
    tradesHash,
  });

  await c.env.DB.prepare(
    `INSERT INTO verified_profit_cards (
       id, user_id, mode, period, start_date, end_date,
       trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor,
       exchange_provider, strategy_name, payload_json, hmac_signature, issued_at
     ) VALUES (?, ?, ?, 'TRADE', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      cardId,
      user.id,
      mode,
      startDate,
      endDate,
      winRate,
      pnlUsd,
      roiPct,
      profitFactor,
      exchangeProvider,
      strategyName,
      payloadSnapshot,
      hmacSignature,
      issuedAt
    )
    .run();

  const publicUrl = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  return c.json({
    ok: true,
    cardId,
    imageUrl: `/api/public/cards/${cardId}/image`,
    verifyUrl: `${publicUrl}/?verify=${cardId}`,
  });
});


