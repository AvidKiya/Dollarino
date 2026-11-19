import { Hono } from 'hono';
import {
  atr,
  computeKbosV11Detailed,
  computeStrategySignals,
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  ema,
  evaluateSignalMixerAtBar,
  formatDollarinoSignal,
  mergeKbosParams,
  parseDollarinoSignal,
  rsi,
  strategyOutputToDollarinoSignal,
  type Direction,
  type MarginMode,
  type SignalMixerWeights,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import { requireAuth, type AppVariables } from '../auth.js';
import { runAutonomousAITrader } from '../ai/providers.js';
import { decryptVaultJson, randomId } from '../crypto.js';
import { resolveUserEntitlement } from './subscriptions.js';
import {
  executeSignalForUser,
  logAudit,
  reconcileOpenPositionsForUser,
  type UserBotConfigRow,
} from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { getExchangeMarkets, normalizeCanonicalSymbol } from '../exchanges/markets.js';
import type { ExchangeProviderId } from '@dollarino/core';

export const tradingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
tradingRoutes.use('*', requireAuth);

tradingRoutes.get('/dashboard', async (c) => {
  const user = c.get('user');
  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow & {
      margin_mode?: string;
      mixer_threshold?: number;
      mixer_weights_json?: string;
      strategy_flow_json?: string;
      kbos_params_json?: string;
      risk_profile_json?: string;
      trailing_stop_enabled?: number;
      trailing_stop_pct?: number;
      trail_after_tp1?: number;
      started_at?: string | null;
    }>();

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string }>();

  const effectiveProvider: ExchangeProviderId =
    activeRow?.provider === 'kcex'
      ? 'kcex'
      : cfg?.trading_mode === 'PAPER'
        ? 'paper'
        : activeRow?.provider ?? 'paper';

  const { adapter, provider, label } = await resolveUserExchangeAdapter(c.env, user.id, effectiveProvider);

  const [balance, openTradesRaw, pendingOrders, closedTrades, recentSignals, stats, periodStats, walletRow, ledgerRows, aiRow, recentAiDecisions, entitlement] = await Promise.all([
    adapter.getBalance().catch(() => ({ free: '0.00', used: '0.00', total: '0.00', currency: 'USDT' })),
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC`).bind(user.id).all<{
      id: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      remaining_quantity: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
      tp2: string | null;
      tp3: string | null;
      tp1_hit: number;
      tp2_hit: number;
      risk_free_active: number;
      trailing_active?: number;
      realized_pnl: string;
      mode: string;
      exchange_provider: string;
      opened_at: string;
    }>(),
    c.env.DB.prepare(`SELECT * FROM pending_orders WHERE user_id = ? AND status = 'PENDING' ORDER BY created_at DESC`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 60`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT * FROM signals WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 24`).bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT
        COUNT(*) as total_trades,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as gross_wins,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) < 0 THEN ABS(CAST(realized_pnl AS REAL)) ELSE 0 END), 0) as gross_losses,
        COALESCE(SUM(CASE WHEN date(closed_at) = date('now') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as today_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{
      total_trades: number;
      wins: number;
      total_pnl: number;
      gross_wins: number;
      gross_losses: number;
      today_pnl: number;
    }>(),
    c.env.DB.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-24 hours') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_24h_pnl,
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-7 days') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_7d_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ last_24h_pnl: number; last_7d_pnl: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN event_type IN ('DEPOSIT','TOPUP') THEN amount_usd ELSE 0 END), 0) as deposited
       FROM wallet_ledger WHERE user_id = ? AND mode = ?`
    ).bind(user.id, cfg?.trading_mode ?? 'PAPER').first<{ deposited: number }>().catch(() => ({ deposited: 0 })),
    c.env.DB.prepare(
      `SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT provider, model FROM ai_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
      .bind(user.id).first<{ provider: string; model: string }>(),
    c.env.DB.prepare(
      `SELECT id, level, symbol, message, details_json, created_at FROM audit_logs WHERE user_id = ? AND category = 'AI_AGENT' ORDER BY created_at DESC LIMIT 12`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    resolveUserEntitlement(c.env.DB, user),
  ]);

  const totalEq = Math.max(1, Number(balance.total) || Number(cfg?.paper_balance ?? 10000));

  // Enrich open positions with live mark price, ROE %, sparkline, and unrealized PnL
  const priceCache = new Map<string, number>();
  const sparkCache = new Map<string, number[]>();
  const openTrades = [];
  let totalUnrealizedPnl = 0;

  for (const pos of openTradesRaw.results) {
    let mark = priceCache.get(pos.symbol);
    let spark = sparkCache.get(pos.symbol);
    if (mark === undefined) {
      const k = await adapter.getKlines(pos.symbol, '5m', 24).catch(() => []);
      mark = k.length ? k[k.length - 1]!.close : Number(await adapter.getTickerPrice(pos.symbol).catch(() => pos.entry_price));
      spark = k.length ? k.map((c) => c.close) : [Number(pos.entry_price), mark];
      priceCache.set(pos.symbol, mark);
      sparkCache.set(pos.symbol, spark);
    }
    const entry = Number(pos.entry_price);
    const qty = Number(pos.remaining_quantity);
    const margin = Math.max(0.01, Number(pos.margin_used));
    const uPnl = pos.direction === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
    totalUnrealizedPnl += uPnl;
    const roePct = (uPnl / margin) * 100;
    const capitalPct = (margin / totalEq) * 100;
    const liqEst = pos.direction === 'LONG'
      ? entry * (1 - 0.9 / Math.max(1, pos.leverage))
      : entry * (1 + 0.9 / Math.max(1, pos.leverage));
    openTrades.push({
      ...pos,
      mark_price: mark.toFixed(mark >= 100 ? 2 : 4),
      unrealized_pnl: uPnl.toFixed(2),
      roe_pct: Number(roePct.toFixed(2)),
      capital_pct: Number(capitalPct.toFixed(1)),
      funding_usd: Number((-(margin * pos.leverage * 0.0001)).toFixed(3)),
      liq_price_est: liqEst.toFixed(liqEst >= 100 ? 2 : 4),
      sparkline: spark ?? [entry, mark],
    });
  }

  // Hourly, Daily (30d cumulative), & 7-day weekly breakdown
  const [hourlyAgg, dailyAgg, weeklyAgg] = await Promise.all([
    c.env.DB.prepare(
      `SELECT substr(closed_at, 1, 13) || ':00' as bucket, SUM(CAST(realized_pnl AS REAL)) as pnl, COUNT(*) as trades
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at IS NOT NULL
       GROUP BY bucket ORDER BY bucket DESC LIMIT 24`
    ).bind(user.id).all<{ bucket: string; pnl: number; trades: number }>(),
    c.env.DB.prepare(
      `SELECT date(closed_at) as bucket, SUM(CAST(realized_pnl AS REAL)) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= date('now', '-30 days') AND closed_at IS NOT NULL
       GROUP BY bucket ORDER BY bucket ASC`
    ).bind(user.id).all<{ bucket: string; pnl: number }>(),
    c.env.DB.prepare(
      `SELECT date(closed_at) as day, COUNT(*) as count,
              SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END) as wins,
              SUM(CAST(realized_pnl AS REAL)) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= date('now', '-7 days')
       GROUP BY day ORDER BY day ASC`
    ).bind(user.id).all<{ day: string; count: number; wins: number; pnl: number }>(),
  ]);

  let runningCum = 0;
  const cumulative30d = dailyAgg.results.map((d) => {
    runningCum += Number(d.pnl || 0);
    return { date: d.bucket, dailyPnl: Number(d.pnl || 0), cumulativePnl: Number(runningCum.toFixed(2)) };
  });

  // Live 8-channel Signal Mixer snapshot on active symbol using real HTF trend
  let mixerSnapshot = null;
  if (cfg) {
    const [klines, htfKlines] = await Promise.all([
      adapter.getKlines(cfg.symbol, cfg.entry_timeframe, 240).catch(() => []),
      adapter.getKlines(cfg.symbol, cfg.higher_timeframe || '1h', 120).catch(() => []),
    ]);
    if (klines.length >= 35) {
      let realHtfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (htfKlines.length >= 25) {
        const hc = htfKlines.map((k) => k.close);
        const h20 = ema(hc, 20);
        const h50 = ema(hc, 50);
        const f = h20[htfKlines.length - 1];
        const s = h50[htfKlines.length - 1];
        if (Number.isFinite(f) && Number.isFinite(s)) {
          realHtfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
        }
      }
      const weights: SignalMixerWeights = cfg.mixer_weights_json
        ? (JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights)
        : DEFAULT_MIXER_WEIGHTS;
      mixerSnapshot = evaluateSignalMixerAtBar(klines, klines.length - 1, realHtfTrend, weights, cfg.mixer_threshold ?? 65);
    }
  }

  const profitFactor =
    stats && stats.gross_losses > 0
      ? stats.gross_wins / stats.gross_losses
      : stats && stats.gross_wins > 0
        ? 99
        : 0;

  let kbosParams = DEFAULT_KBOS_PARAMS;
  try {
    if (cfg?.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfg.kbos_params_json));
  } catch { /* default */ }

  let riskProfile: Record<string, unknown> = {
    preset: 'balanced',
    marketBias: 'neutral',
    preferredSession: 'automatic',
    entryStyle: 'balanced',
    maxSpread: 0.5,
    cooldownMinutes: 10,
    trailingStop: true,
    trailingDistance: 2.0,
    allocatedAmount: Math.round(totalEq * ((cfg?.margin_pct ?? 50) / 100)),
  };
  try {
    if (cfg?.risk_profile_json) riskProfile = { ...riskProfile, ...JSON.parse(cfg.risk_profile_json) };
  } catch { /* default */ }

  const totalDeposited = (walletRow?.deposited ?? 0) > 0 ? walletRow!.deposited : 10000;
  const totalPnl = stats?.total_pnl ?? 0;
  const tfSecs: Record<string, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400 };
  const cyclePeriod = tfSecs[cfg?.entry_timeframe ?? '15m'] ?? 900;
  const nextCycleInSec = cyclePeriod - (Math.floor(Date.now() / 1000) % cyclePeriod);

  return c.json({
    config: cfg,
    kbosParams,
    riskProfile,
    activeExchange: { provider, label },
    activeAI: aiRow || null,
    entitlement,
    balance,
    openTrades,
    pendingOrders: pendingOrders.results,
    closedTrades: closedTrades.results,
    recentSignals: recentSignals.results,
    recentAiDecisions: recentAiDecisions.results,
    walletLedger: ledgerRows.results,
    nextCycleInSec,
    stats: {
      totalTrades: stats?.total_trades ?? 0,
      winRate: stats?.total_trades ? (stats.wins / stats.total_trades) * 100 : 0,
      totalPnl,
      todayPnl: stats?.today_pnl ?? 0,
      last24hPnl: periodStats?.last_24h_pnl ?? 0,
      last7dPnl: periodStats?.last_7d_pnl ?? 0,
      unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      allTimePct: totalDeposited > 0 ? Number(((totalPnl / totalDeposited) * 100).toFixed(2)) : 0,
      totalDeposited,
      profitFactor,
    },
    charts: {
      hourlyPnl: [...hourlyAgg.results].reverse(),
      dailyPnl: [...dailyAgg.results],
      cumulative30d,
      weeklyResults: weeklyAgg.results,
    },
    mixerSnapshot,
  });
});

tradingRoutes.get('/wallet/ledger', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(user.id).all();
  return c.json({ ledger: rows.results });
});

tradingRoutes.post('/wallet/topup', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ amountUsd?: number; note?: string }>();
  const amount = Number(body.amountUsd ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return c.json({ error: 'Amount must be between $1 and $1,000,000' }, 400);
  }
  const cfg = await c.env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ trading_mode: string; paper_balance: string }>();

  const nextBal = Number(cfg?.paper_balance ?? 10000) + amount;
  await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
    .bind(nextBal.toFixed(2), user.id).run();

  await c.env.DB.prepare(
    `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
     VALUES (?, ?, ?, 'TOPUP', ?, ?, ?)`
  ).bind(randomId('wl'), user.id, cfg?.trading_mode ?? 'PAPER', amount, nextBal, body.note ?? 'Instant Paper Credit Top-Up').run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Wallet topped up +$${amount.toFixed(2)} (Balance: $${nextBal.toFixed(2)})`);
  return c.json({ ok: true, balanceAfter: nextBal });
});

tradingRoutes.patch('/config', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>();

  const allowedFields: Record<string, string> = {
    trading_mode: 'trading_mode',
    trade_execution_mode: 'trade_execution_mode',
    margin_mode: 'margin_mode',
    notifications_enabled: 'notifications_enabled',
    symbol: 'symbol',
    strategy_key: 'strategy_key',
    entry_timeframe: 'entry_timeframe',
    higher_timeframe: 'higher_timeframe',
    margin_pct: 'margin_pct',
    use_signal_leverage: 'use_signal_leverage',
    max_leverage: 'max_leverage',
    tp1_close_pct: 'tp1_close_pct',
    tp2_close_pct: 'tp2_close_pct',
    tp3_close_pct: 'tp3_close_pct',
    auto_breakeven_on_tp1: 'auto_breakeven_on_tp1',
    move_sl_to_tp1_on_tp2: 'move_sl_to_tp1_on_tp2',
    daily_max_loss_pct: 'daily_max_loss_pct',
    max_open_positions: 'max_open_positions',
    block_weekends: 'block_weekends',
    macro_blackout: 'macro_blackout',
    ai_gate_enabled: 'ai_gate_enabled',
    ai_min_confidence: 'ai_min_confidence',
    signal_channel_handle: 'signal_channel_handle',
    mixer_threshold: 'mixer_threshold',
    mixer_weights_json: 'mixer_weights_json',
    strategy_flow_json: 'strategy_flow_json',
    kbos_params_json: 'kbos_params_json',
    risk_profile_json: 'risk_profile_json',
    trailing_stop_enabled: 'trailing_stop_enabled',
    trailing_stop_pct: 'trailing_stop_pct',
    trail_after_tp1: 'trail_after_tp1',
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.trading_mode === 'LIVE') {
    const ent = await resolveUserEntitlement(c.env.DB, user);
    if (!ent.allowLiveTrading) {
      return c.json({
        error: 'Active paid subscription required to switch to Live Trading (Toobit / KCEX). Paper Demo remains free.',
        code: 'SUBSCRIPTION_REQUIRED',
      }, 402);
    }
  }
  for (const [k, col] of Object.entries(allowedFields)) {
    if (body[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k]);
    }
  }

  if (!sets.length) return c.json({ error: 'No fields to update' }, 400);
  sets.push(`updated_at = datetime('now')`);
  vals.push(user.id);

  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();
  const updated = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first();
  return c.json({ config: updated });
});

tradingRoutes.post('/bot/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    marginPct?: number;
    strategyKey?: StrategyKey;
    riskPreset?: string;
    maxLeverage?: number;
    trailingStopEnabled?: boolean;
    trailingStopPct?: number;
    allocatedAmount?: number;
  }>().catch(() => ({} as Record<string, unknown>));

  const [cfg, activeAI, entitlement] = await Promise.all([
    c.env.DB.prepare('SELECT trading_mode, strategy_key, risk_profile_json FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; strategy_key: string; risk_profile_json?: string }>(),
    c.env.DB.prepare('SELECT id, provider, model FROM ai_connections WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(user.id).first<{ id: string; provider: string; model: string }>(),
    resolveUserEntitlement(c.env.DB, user),
  ]);

  const targetStrategy = typeof body.strategyKey === 'string' ? body.strategyKey : (cfg?.strategy_key || 'ai_autonomous_agent');
  if (cfg?.trading_mode === 'LIVE' && !entitlement.allowLiveTrading) {
    return c.json({
      error: 'Active paid subscription required for Live Trading (Toobit / KCEX). Please upgrade or test in Paper Demo.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  if (targetStrategy === 'ai_autonomous_agent' && !entitlement.allowAiTrading) {
    return c.json({
      error: 'Active Pro or VIP subscription required for Autonomous AI Trading. You can test CodexBot strategies in Paper Demo or upgrade your plan.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  if (targetStrategy === 'ai_autonomous_agent' && !activeAI) {
    return c.json({
      error: 'No active AI API key found. Connect DeepSeek, Claude, OpenAI, or Gemini in Connections -> AI Engine first.',
      code: 'NO_ACTIVE_AI_KEY',
    }, 400);
  }

  const nextState = cfg?.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';

  const sets = [`bot_state = ?`, `started_at = datetime('now')`, `updated_at = datetime('now')`];
  const vals: unknown[] = [nextState];

  if (typeof body.marginPct === 'number') {
    sets.push(`margin_pct = ?`);
    vals.push(body.marginPct);
  }
  if (typeof body.strategyKey === 'string') {
    sets.push(`strategy_key = ?`);
    vals.push(body.strategyKey);
  }
  if (typeof body.maxLeverage === 'number') {
    sets.push(`max_leverage = ?`);
    vals.push(body.maxLeverage);
  }
  if (typeof body.trailingStopEnabled === 'boolean') {
    sets.push(`trailing_stop_enabled = ?`);
    vals.push(body.trailingStopEnabled ? 1 : 0);
  }
  if (typeof body.trailingStopPct === 'number') {
    sets.push(`trailing_stop_pct = ?`);
    vals.push(body.trailingStopPct);
  }
  if (body.riskPreset || body.allocatedAmount) {
    let rp: Record<string, unknown> = {};
    try { rp = cfg?.risk_profile_json ? JSON.parse(cfg.risk_profile_json) : {}; } catch { rp = {}; }
    if (body.riskPreset) rp.preset = body.riskPreset;
    if (body.allocatedAmount) rp.allocatedAmount = body.allocatedAmount;
    sets.push(`risk_profile_json = ?`);
    vals.push(JSON.stringify(rp));
  }

  vals.push(user.id);
  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();

  const id = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
  const stub = c.env.TRADING_BOT_DO.get(id);
  const runTick = Promise.all([
    stub.fetch('https://do/start').catch(() => {}),
    stub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {}),
  ]);
  try {
    c.executionCtx.waitUntil(runTick);
  } catch {
    void runTick;
  }

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Bot started in ${nextState} mode (${targetStrategy})`);
  return c.json({ ok: true, bot_state: nextState, strategy_key: targetStrategy });
});

tradingRoutes.post('/bot/stop', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ settleOpen?: boolean }>().catch(() => ({ settleOpen: false }));
  const cfg = await c.env.DB.prepare('SELECT started_at, paper_balance, trading_mode FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ started_at: string | null; paper_balance: string; trading_mode: string }>();

  let closedOnStop = 0;
  let stopPnl = 0;
  if (body.settleOpen) {
    const openTrades = await c.env.DB.prepare(
      `SELECT id, mode, symbol, direction, entry_price, initial_quantity, remaining_quantity, margin_used, realized_pnl FROM trades WHERE user_id = ? AND status = 'OPEN'`
    ).bind(user.id).all<{
      id: string;
      mode: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
    }>();

    for (const t of openTrades.results) {
      const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `stop_settle_${Date.now()}`);
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(t.entry_price);
      const qty = Number(t.remaining_quantity);
      const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);
      stopPnl += pnl - Number(cls.fee);

      if (t.mode === 'PAPER') {
        const curCfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ paper_balance: string }>();
        const remMargin = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
        const restored = Number(curCfg?.paper_balance ?? 0) + remMargin + pnl - Number(cls.fee);
        await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
          .bind(restored.toFixed(2), user.id).run();
      }
      await c.env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'BOT_STOP_SETTLE', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();
      closedOnStop++;
    }
  }

  const sessionStats = cfg?.started_at
    ? await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl FROM trades WHERE user_id = ? AND status = 'CLOSED' AND closed_at >= ?`
      ).bind(user.id, cfg.started_at).first<{ cnt: number; pnl: number }>()
    : { cnt: closedOnStop, pnl: stopPnl };

  const afterCfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ paper_balance: string }>();

  await c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`)
    .bind(user.id).run();

  const durationSec = cfg?.started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(cfg.started_at + 'Z')) / 1000)) : 0;

  if (closedOnStop > 0 || (sessionStats?.pnl ?? 0) !== 0) {
    await c.env.DB.prepare(
      `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
       VALUES (?, ?, ?, 'STOP_SETTLE', ?, ?, ?)`
    ).bind(
      randomId('wl'),
      user.id,
      cfg?.trading_mode ?? 'PAPER',
      sessionStats?.pnl ?? stopPnl,
      Number(afterCfg?.paper_balance ?? 0),
      `Session stop settlement (${closedOnStop} settled)`
    ).run().catch(() => {});
  }

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', 'Bot stopped by user');
  return c.json({
    ok: true,
    bot_state: 'STOPPED',
    settlement: {
      durationSec,
      tradesClosed: sessionStats?.cnt ?? closedOnStop,
      positionsSettledOnStop: closedOnStop,
      netSessionPnl: Number((sessionStats?.pnl ?? stopPnl).toFixed(2)),
      finalBalance: Number(afterCfg?.paper_balance ?? 0),
    },
  });
});

tradingRoutes.post('/bot/kill-switch', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ?`).bind(user.id).run();
  await c.env.DB.prepare(`UPDATE pending_orders SET status = 'CANCELLED' WHERE user_id = ? AND status = 'PENDING'`)
    .bind(user.id).run();

  const openTrades = await c.env.DB.prepare(
    `SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN'`
  ).bind(user.id).all<{
    id: string;
    mode: string;
    symbol: string;
    direction: Direction;
    entry_price: string;
    remaining_quantity: string;
    margin_used: string;
    realized_pnl: string;
  }>();

  let closedCount = 0;
  for (const t of openTrades.results) {
    const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
    const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `kill_${Date.now()}`);
    const exitPx = Number(cls.filledPrice);
    const entryPx = Number(t.entry_price);
    const qty = Number(t.remaining_quantity);
    const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
    const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

    if (t.mode === 'PAPER') {
      const cfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ paper_balance: string }>();
      const restored = Number(cfg?.paper_balance ?? 0) + Number(t.margin_used) + pnl - Number(cls.fee);
      await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
        .bind(restored.toFixed(2), user.id).run();
    }

    await c.env.DB.prepare(
      `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'KILL_SWITCH', closed_at = datetime('now') WHERE id = ?`
    ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();
    closedCount++;
  }

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'WARN', `EMERGENCY KILL SWITCH activated — closed ${closedCount} positions`);
  return c.json({ ok: true, closedCount });
});

tradingRoutes.post('/positions/reconcile', async (c) => {
  const user = c.get('user');
  const updates = await reconcileOpenPositionsForUser(c.env, user.id);
  return c.json({ ok: true, updates });
});

tradingRoutes.patch('/positions/:id/tpsl', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ stopLoss?: string; tp1?: string; tp2?: string; tp3?: string }>();
  const row = await c.env.DB.prepare(`SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`)
    .bind(id, user.id).first<{ id: string; mode: string; symbol: string; direction: Direction; current_stop_loss: string; tp1: string }>();
  if (!row) return c.json({ error: 'Open trade not found' }, 404);

  const nextSl = body.stopLoss || row.current_stop_loss;
  const nextTp1 = body.tp1 || row.tp1;

  if (row.mode === 'LIVE') {
    const { adapter } = await resolveUserExchangeAdapter(c.env, user.id);
    await adapter.updatePositionStopLoss(row.symbol, row.direction, nextSl, nextTp1).catch(() => {});
  }

  await c.env.DB.prepare(
    `UPDATE trades SET current_stop_loss = ?, tp1 = ?, tp2 = COALESCE(?, tp2), tp3 = COALESCE(?, tp3) WHERE id = ?`
  ).bind(nextSl, nextTp1, body.tp2 ?? null, body.tp3 ?? null, id).run();

  await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Updated SL/TP for ${row.symbol} (SL=${nextSl}, TP1=${nextTp1})`, row.symbol);
  return c.json({ ok: true });
});

tradingRoutes.post('/positions/:id/close', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const t = await c.env.DB.prepare(`SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`)
    .bind(id, user.id).first<{
      id: string;
      mode: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
    }>();
  if (!t) return c.json({ error: 'Open position not found' }, 404);

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
  const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `man_cls_${Date.now()}`);
  const exitPx = Number(cls.filledPrice);
  const entryPx = Number(t.entry_price);
  const qty = Number(t.remaining_quantity);
  const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
  const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

  if (t.mode === 'PAPER') {
    const cfg = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ paper_balance: string }>();
    const remMarginShare = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
    const nextBal = Number(cfg?.paper_balance ?? 0) + remMarginShare + pnl - Number(cls.fee);
    await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
      .bind(nextBal.toFixed(2), user.id).run();
  }

  await c.env.DB.prepare(
    `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'MANUAL', closed_at = datetime('now') WHERE id = ?`
  ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();

  await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Manual close ${t.symbol} @ ${cls.filledPrice} (PnL ${totalRealized.toFixed(2)})`, t.symbol);
  return c.json({ ok: true, exitPrice: cls.filledPrice, realizedPnl: totalRealized });
});

tradingRoutes.post('/orders/manual', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    symbol: string;
    direction: Direction;
    orderType: 'MARKET' | 'LIMIT';
    marginMode?: MarginMode;
    limitPrice?: string;
    leverage: number;
    stopLoss: string;
    tp1: string;
    tp2?: string;
    tp3?: string;
    timeframe?: string;
  }>();

  if (body.orderType === 'LIMIT' && body.limitPrice && Number(body.limitPrice) > 0) {
    const cfg = await c.env.DB.prepare('SELECT trading_mode, margin_pct, paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; margin_pct: number; paper_balance: string }>();
    const bal = Number(cfg?.paper_balance ?? 10000);
    const qty = (((bal * ((cfg?.margin_pct ?? 10) / 100)) * body.leverage) / Number(body.limitPrice)).toFixed(4);
    const id = randomId('ord');
    await c.env.DB.prepare(
      `INSERT INTO pending_orders (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, order_type, price, quantity, leverage, stop_loss, tp1, tp2, tp3)
       VALUES (?, ?, ?, 'paper', ?, 'manual_limit', ?, 'LIMIT', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      cfg?.trading_mode ?? 'PAPER',
      body.symbol.toUpperCase(),
      body.direction,
      body.limitPrice,
      qty,
      body.leverage,
      body.stopLoss,
      body.tp1,
      body.tp2 ?? null,
      body.tp3 ?? null
    ).run();
    await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Queued LIMIT ${body.direction} ${body.symbol} @ ${body.limitPrice}`, body.symbol);
    return c.json({ ok: true, pendingOrderId: id });
  }

  const execRes = await executeSignalForUser(
    c.env,
    user.id,
    {
      symbol: body.symbol.toUpperCase(),
      direction: body.direction,
      timeframe: body.timeframe || '15m',
      price: body.limitPrice || '0',
      stopLoss: body.stopLoss,
      leverage: body.leverage,
      tp1: body.tp1,
      tp2: body.tp2,
      tp3: body.tp3,
    },
    { forceBypassState: true, strategyKey: 'manual_terminal' }
  );
  return c.json(execRes);
});

tradingRoutes.delete('/pending/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE pending_orders SET status = 'CANCELLED' WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

tradingRoutes.post('/signals/execute', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ rawText?: string; signal?: Record<string, unknown>; executeNow?: boolean }>();
  const parsed = parseDollarinoSignal(body.signal ?? body.rawText ?? '');
  if (!parsed) return c.json({ error: 'Could not parse valid Dollarino signal' }, 400);

  const formatted = formatDollarinoSignal(parsed);
  const sigId = randomId('sig');
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
     VALUES (?, ?, 'manual_test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
  ).bind(
    sigId,
    user.id,
    parsed.symbol,
    parsed.direction,
    parsed.timeframe,
    parsed.price,
    parsed.stopLoss,
    parsed.leverage,
    parsed.tp1,
    parsed.tp2 ?? null,
    parsed.tp3 ?? null,
    parsed.slPct ?? null,
    parsed.tp1Pct ?? null,
    parsed.tp2Pct ?? null,
    parsed.tp3Pct ?? null,
    formatted
  ).run();

  if (body.executeNow === false) {
    return c.json({ ok: true, signalId: sigId, parsed, formatted });
  }

  const ent = await resolveUserEntitlement(c.env.DB, user);
  if (!ent.allowCopyTrade) {
    return c.json(
      {
        error: 'Active Pro or VIP subscription required to execute Telegram Copy-Trade signals.',
        code: 'SUBSCRIPTION_REQUIRED',
      },
      402
    );
  }

  const execRes = await executeSignalForUser(c.env, user.id, parsed, {
    signalId: sigId,
    forceBypassState: true,
    strategyKey: 'manual_signal',
  });

  if (execRes.ok) {
    await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
  }
  return c.json({ ok: execRes.ok, signalId: sigId, tradeId: execRes.tradeId, error: execRes.error, formatted });
});

tradingRoutes.get('/market/klines', async (c) => {
  const user = c.get('user');
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = (c.req.query('timeframe') || '15m') as Timeframe;
  const limit = Math.min(1200, Math.max(30, Number(c.req.query('limit') || 200)));
  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const [candles, ticker, orderBook] = await Promise.all([
    adapter.getKlines(symbol, timeframe, limit),
    adapter.getTickerPrice(symbol),
    adapter.getOrderBook(symbol, 15),
  ]);
  return c.json({ symbol, timeframe, ticker, candles, orderBook });
});

tradingRoutes.get('/market/overview', async (c) => {
  const user = c.get('user');
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = (c.req.query('timeframe') || '15m') as Timeframe;
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const htfTf = htfMap[timeframe] ?? '4h';
  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');

  const [candles, candles4h, market24h, orderBook, cfg] = await Promise.all([
    adapter.getKlines(symbol, timeframe, 450),
    adapter.getKlines(symbol, htfTf, 200),
    adapter.getMarket24h(symbol),
    adapter.getOrderBook(symbol, 15),
    c.env.DB.prepare('SELECT mixer_weights_json, mixer_threshold, kbos_params_json FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ mixer_weights_json?: string; mixer_threshold?: number; kbos_params_json?: string }>(),
  ]);

  let parsedKbos = DEFAULT_KBOS_PARAMS;
  try {
    if (cfg?.kbos_params_json) parsedKbos = mergeKbosParams(JSON.parse(cfg.kbos_params_json));
  } catch { /* default */ }
  const kbosDetailed = computeKbosV11Detailed(candles, timeframe, parsedKbos);

  const closes = candles.map((x) => x.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r14 = rsi(closes, 14);
  const a14 = atr(candles, 14);
  const lastIdx = candles.length - 1;

  const htfCloses = candles4h.map((x) => x.close);
  const htfE20 = ema(htfCloses, 20);
  const htfE50 = ema(htfCloses, 50);
  const htfTrend =
    (htfE20[candles4h.length - 1] ?? 0) > (htfE50[candles4h.length - 1] ?? 0)
      ? 'BULLISH'
      : (htfE20[candles4h.length - 1] ?? 0) < (htfE50[candles4h.length - 1] ?? 0)
        ? 'BEARISH'
        : 'NEUTRAL';

  const weights: SignalMixerWeights = cfg?.mixer_weights_json
    ? (JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights)
    : DEFAULT_MIXER_WEIGHTS;
  const mixer = evaluateSignalMixerAtBar(candles, lastIdx, htfTrend, weights, cfg?.mixer_threshold ?? 65);

  const bidVol = orderBook.bids.reduce((s, [, q]) => s + Number(q), 0);
  const askVol = orderBook.asks.reduce((s, [, q]) => s + Number(q), 0);
  const imbalancePct = bidVol + askVol > 0 ? (((bidVol - askVol) / (bidVol + askVol)) * 100).toFixed(1) : '0.0';
  const bestBid = Number(orderBook.bids[0]?.[0] ?? market24h.bestBid);
  const bestAsk = Number(orderBook.asks[0]?.[0] ?? market24h.bestAsk);
  const spreadPct = bestBid > 0 ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(4) : '0.0000';

  return c.json({
    symbol,
    timeframe,
    candles,
    market24h,
    orderBook,
    spreadPct,
    imbalancePct,
    htfTrend,
    indicators: {
      ema20: e20.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      ema50: e50.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      ema200: e200.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: Number.isFinite(v) ? v : null })).filter((x) => x.value !== null),
      rsi14: Number((r14[lastIdx] ?? 50).toFixed(2)),
      atr14: Number((a14[lastIdx] ?? 0).toFixed(4)),
    },
    kbosOverlays: {
      closeSeriesAlt: kbosDetailed.closeSeriesAlt,
      openSeriesAlt: kbosDetailed.openSeriesAlt,
      demaAtr: kbosDetailed.demaAtr,
      almaRibbon: kbosDetailed.almaRibbon,
      markers: kbosDetailed.markers,
      latestSignal: kbosDetailed.outputs[kbosDetailed.outputs.length - 1] ?? null,
    },
    mixer,
  });
});

tradingRoutes.get('/markets', async (c) => {
  const user = c.get('user');
  const requestedProvider = c.req.query('provider') as ExchangeProviderId | undefined;
  const q = (c.req.query('q') || '').trim().toUpperCase();
  const sort = c.req.query('sort') || 'volume';

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label, encrypted_credentials FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string; encrypted_credentials?: string }>();

  const provider: ExchangeProviderId = requestedProvider || activeRow?.provider || 'paper';
  let proxyConfig = c.env.TOOBIT_PROXY_URL
    ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
    : undefined;
  if (!proxyConfig && provider === 'toobit') {
    const tbRow = activeRow?.provider === 'toobit'
      ? activeRow
      : await c.env.DB.prepare(
          `SELECT encrypted_credentials FROM exchange_connections WHERE user_id = ? AND provider = 'toobit' ORDER BY updated_at DESC LIMIT 1`
        ).bind(user.id).first<{ encrypted_credentials?: string }>();
    if (tbRow?.encrypted_credentials) {
      const creds = await decryptVaultJson<{ proxyUrl?: string; proxySecret?: string }>(
        tbRow.encrypted_credentials,
        c.env.MASTER_ENCRYPTION_KEY
      ).catch(() => ({ proxyUrl: undefined, proxySecret: undefined }));
      if (creds.proxyUrl) {
        proxyConfig = { proxyUrl: creds.proxyUrl, proxySecret: creds.proxySecret || c.env.EXCHANGE_PROXY_SECRET };
      }
    }
  }
  let markets = await getExchangeMarkets(provider, proxyConfig);

  if (q) {
    markets = markets.filter(
      (m) =>
        m.symbol.includes(q) ||
        m.base.includes(q) ||
        m.exchangeSymbol.toUpperCase().includes(q)
    );
  }

  if (sort === 'gainers') {
    markets = [...markets].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
  } else if (sort === 'losers') {
    markets = [...markets].sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
  }

  return c.json({
    provider,
    label: activeRow?.label || provider.toUpperCase(),
    totalCount: markets.length,
    markets,
  });
});

tradingRoutes.post('/scanner', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    strategyKey?: StrategyKey;
    timeframe?: Timeframe;
    symbols?: string[];
    limit?: number;
  }>().catch(() => ({} as { strategyKey?: StrategyKey; timeframe?: Timeframe; symbols?: string[]; limit?: number }));
  const strategyKey = body.strategyKey === 'ai_autonomous_agent' ? 'signal_mixer' : (body.strategyKey || 'signal_mixer');
  const tf = body.timeframe || '15m';
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const htfTf = htfMap[tf] ?? '1h';

  const [activeRow, cfgRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    ).bind(user.id).first<{ provider: ExchangeProviderId }>(),
    c.env.DB.prepare('SELECT kbos_params_json, mixer_weights_json, mixer_threshold, max_leverage FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ kbos_params_json?: string; mixer_weights_json?: string; mixer_threshold?: number; max_leverage?: number }>(),
  ]);
  const provider = activeRow?.provider || 'paper';

  let kbosParams = DEFAULT_KBOS_PARAMS;
  try {
    if (cfgRow?.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfgRow.kbos_params_json));
  } catch { /* default */ }

  let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
  try {
    if (cfgRow?.mixer_weights_json) mixerWeights = JSON.parse(cfgRow.mixer_weights_json) as SignalMixerWeights;
  } catch { /* default */ }
  const mixerThreshold = cfgRow?.mixer_threshold ?? 65;

  let symbols = body.symbols?.length ? body.symbols.map(normalizeCanonicalSymbol) : [];
  if (!symbols.length) {
    const proxyConfig = c.env.TOOBIT_PROXY_URL
      ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
      : undefined;
    const allMarkets = await getExchangeMarkets(provider, proxyConfig);
    const count = Math.min(18, Math.max(6, body.limit ?? 12));
    symbols = allMarkets.slice(0, count).map((m) => m.symbol);
  }

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');

  const results = await Promise.all(
    symbols.map(async (sym) => {
      const [candles, htfCandles] = await Promise.all([
        adapter.getKlines(sym, tf, 360),
        adapter.getKlines(sym, htfTf, 140),
      ]);
      const outputs = computeStrategySignals(
        strategyKey,
        candles,
        htfCandles,
        tf,
        htfTf,
        { kbosParams, mixerWeights, mixerThreshold }
      );
      const latest = outputs[outputs.length - 1];
      let realHtfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = latest?.trend ?? 'NEUTRAL';
      if (htfCandles.length >= 25) {
        const hc = htfCandles.map((k) => k.close);
        const h20 = ema(hc, 20);
        const h50 = ema(hc, 50);
        const f = h20[htfCandles.length - 1];
        const s = h50[htfCandles.length - 1];
        if (Number.isFinite(f) && Number.isFinite(s)) {
          realHtfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
        }
      }
      const mix = evaluateSignalMixerAtBar(candles, candles.length - 1, realHtfTrend, mixerWeights, mixerThreshold);
      const signalCard = latest && latest.signal !== 'NONE'
        ? strategyOutputToDollarinoSignal(sym, tf, Math.max(1, cfgRow?.max_leverage ?? 5), latest)
        : null;
      return {
        symbol: sym,
        price: candles[candles.length - 1]?.close ?? 0,
        trend: realHtfTrend,
        rsi: Number((latest?.rsi ?? 50).toFixed(1)),
        mixerConfidence: mix.confidence,
        mixerDirection: mix.direction,
        signal: signalCard,
        formatted: signalCard ? formatDollarinoSignal(signalCard) : null,
      };
    })
  );

  return c.json({ provider, strategyKey, timeframe: tf, results });
});

tradingRoutes.post('/ai-agent/run', async (c) => {
  const user = c.get('user');
  const entitlement = await resolveUserEntitlement(c.env.DB, user);
  if (!entitlement.allowAiTrading) {
    return c.json({
      ok: false,
      error: 'Active Pro or VIP subscription required for Autonomous AI Trading.',
      code: 'SUBSCRIPTION_REQUIRED',
    }, 402);
  }
  const body = await c.req.json<{
    symbol?: string;
    timeframe?: Timeframe;
    executeIfSignal?: boolean;
  }>().catch(() => ({} as { symbol?: string; timeframe?: Timeframe; executeIfSignal?: boolean }));

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow>();
  if (!cfg) return c.json({ error: 'Bot config not found' }, 404);

  const symbol = normalizeCanonicalSymbol(body.symbol || cfg.symbol);
  const timeframe = (body.timeframe || cfg.entry_timeframe || '15m') as Timeframe;
  const htfMap: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
  const higherTimeframe = htfMap[timeframe] ?? '1h';

  const { adapter } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  const [candles, htfCandles, orderBook, market24h, openOnSymbol] = await Promise.all([
    adapter.getKlines(symbol, timeframe, 300),
    adapter.getKlines(symbol, higherTimeframe, 140),
    adapter.getOrderBook(symbol, 15).catch(() => ({ bids: [], asks: [] })),
    adapter.getMarket24h(symbol).catch(() => null),
    c.env.DB.prepare(
      `SELECT id, direction, entry_price, current_stop_loss, tp1, remaining_quantity, margin_used, realized_pnl, mode FROM trades WHERE user_id = ? AND symbol = ? AND status = 'OPEN' LIMIT 1`
    ).bind(user.id, symbol).first<{
      id: string;
      direction: Direction;
      entry_price: string;
      current_stop_loss: string;
      tp1: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
      mode: string;
    }>(),
  ]);

  const bidVol = orderBook.bids.reduce((s, [, q]) => s + Number(q), 0);
  const askVol = orderBook.asks.reduce((s, [, q]) => s + Number(q), 0);
  const imbalancePct = bidVol + askVol > 0 ? (((bidVol - askVol) / (bidVol + askVol)) * 100).toFixed(1) : '0.0';
  const bestBid = Number(orderBook.bids[0]?.[0] ?? 0);
  const bestAsk = Number(orderBook.asks[0]?.[0] ?? 0);
  const spreadPct = bestBid > 0 ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(4) : '0.01';

  let kbosParams = mergeKbosParams();
  try { if (cfg.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfg.kbos_params_json)); } catch { /* fallback */ }
  let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
  try { if (cfg.mixer_weights_json) mixerWeights = JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights; } catch { /* fallback */ }
  let riskPreset = 'balanced';
  try { if (cfg.risk_profile_json) riskPreset = (JSON.parse(cfg.risk_profile_json) as { preset?: string }).preset || 'balanced'; } catch { /* fallback */ }

  let decision;
  try {
    decision = await runAutonomousAITrader(c.env, user.id, {
      symbol,
      timeframe,
      higherTimeframe,
      candles,
      htfCandles,
      maxLeverage: Math.max(1, cfg.max_leverage),
      minConfidence: cfg.ai_min_confidence ?? 65,
      orderBookImbalancePct: imbalancePct,
      spreadPct,
      fundingRate: market24h?.fundingRate,
      openPosition: openOnSymbol
        ? {
            direction: openOnSymbol.direction,
            entryPrice: openOnSymbol.entry_price,
            currentStopLoss: openOnSymbol.current_stop_loss,
            tp1: openOnSymbol.tp1,
          }
        : null,
      riskPreset,
      kbosParams,
      mixerWeights,
      mixerThreshold: cfg.mixer_threshold ?? 65,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'AI Trader failed';
    await logAudit(c.env.DB, user.id, 'AI_AGENT', 'ERROR', `AI Trader error on ${symbol}: ${errMsg}`, symbol);
    return c.json({ ok: false, error: errMsg }, 400);
  }

  if (!decision.ok) {
    return c.json({ ok: false, error: decision.error || decision.thesis, decision }, 400);
  }

  await logAudit(
    c.env.DB,
    user.id,
    'AI_AGENT',
    'INFO',
    `[${(decision.provider || 'AI').toUpperCase()} · ${decision.model || ''}] ${decision.action} ${symbol} (${decision.confidence}% conf) — ${decision.thesis}`,
    symbol,
    decision
  );

  let executed: { ok: boolean; tradeId?: string; error?: string; closed?: boolean } | null = null;
  if (body.executeIfSignal) {
    if (decision.action === 'CLOSE' && openOnSymbol) {
      const cls = await adapter.closePositionPartialOrFull(symbol, openOnSymbol.direction, openOnSymbol.remaining_quantity, `ai_manual_exit_${Date.now()}`);
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(openOnSymbol.entry_price);
      const qty = Number(openOnSymbol.remaining_quantity);
      const pnl = openOnSymbol.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(openOnSymbol.realized_pnl) + pnl - Number(cls.fee);
      if (openOnSymbol.mode === 'PAPER') {
        const restored = Number(cfg.paper_balance) + Number(openOnSymbol.margin_used) + pnl - Number(cls.fee);
        await c.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?').bind(restored.toFixed(2), user.id).run();
      }
      await c.env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'AI_EXIT', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), openOnSymbol.id).run();
      executed = { ok: true, tradeId: openOnSymbol.id, closed: true };
    } else if ((decision.action === 'LONG' || decision.action === 'SHORT') && decision.confidence >= (cfg.ai_min_confidence ?? 65)) {
      const sig = {
        symbol,
        direction: decision.action,
        timeframe,
        price: String(decision.entry),
        stopLoss: String(decision.stopLoss),
        leverage: decision.leverage,
        tp1: String(decision.tp1),
        tp2: String(decision.tp2),
        tp3: String(decision.tp3),
        channelHandle: cfg.signal_channel_handle,
        reason: decision.thesis,
      };
      const sigId = randomId('sig');
      await c.env.DB.prepare(
        `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
         VALUES (?, ?, 'ai_agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
      ).bind(sigId, user.id, sig.symbol, sig.direction, sig.timeframe, sig.price, sig.stopLoss, sig.leverage, sig.tp1, sig.tp2, sig.tp3, formatDollarinoSignal(sig)).run();

      executed = await executeSignalForUser(c.env, user.id, sig, {
        signalId: sigId,
        forceBypassState: true,
        strategyKey: 'ai_autonomous_agent',
        aiConfidence: decision.confidence,
        aiReasoning: decision.thesis,
      });
      if (executed.ok) {
        await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
      }
    }
  }

  return c.json({ ok: true, decision, executed });
});

tradingRoutes.get('/logs', async (c) => {
  const user = c.get('user');
  const category = c.req.query('category');
  const rows = category
    ? await c.env.DB.prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? AND category = ? ORDER BY created_at DESC LIMIT 150`
      ).bind(user.id, category).all()
    : await c.env.DB.prepare(
        `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 150`
      ).bind(user.id).all();
  return c.json({ logs: rows.results });
});
