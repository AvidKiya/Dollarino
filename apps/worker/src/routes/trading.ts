import { Hono } from 'hono';
import {
  atr,
  computeDynamicRecommendedSettings,
  computeKbosV11Detailed,
  computeStrategySignals,
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  ema,
  evaluateCustomStrategy,
  evaluateSignalMixerAtBar,
  formatDollarinoSignal,
  mergeKbosParams,
  parseDollarinoSignal,
  resolveEffectiveBotCapital,
  resolveEngineDisplayLabel,
  rsi,
  runBacktest,
  SAMPLE_CUSTOM_STRATEGIES,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type CapitalPresetId,
  type CustomStrategyLanguage,
  type Direction,
  type DirectionMode,
  type MarginMode,
  type MarketType,
  type SignalMixerWeights,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import { requireAuth, type AppVariables } from '../auth.js';
import { getPlatformAISummary, resolveAIEnsemble, runAutonomousAITrader } from '../ai/providers.js';
import { buildProfitCardSvg, renderProfitCardPng } from '../cards/renderer.js';
import { decryptVaultJson, hmacSha256Hex, randomId, sha256Hex } from '../crypto.js';
import { enforceRateLimit } from '../security.js';
import {
  getActiveEngineState,
  normalizeEngineArray,
  setActiveTradingEngines,
  toggleTradingEngine,
  type TradingEngineChoice,
} from '../engine/exclusive-engine.js';
import {
  discoverListingAndBoomCandidates,
  executeSniperBuyForCandidate,
  runNewListingAndMemeSniperForUser,
  type SniperCandidate,
  type SniperTargetType,
} from '../engine/listing-sniper.js';
import { checkPreTradeOnboardingGate } from '../engine/onboarding-gate.js';
import { resolveUserEntitlement } from './subscriptions.js';
import {
  executeSignalForUser,
  logAudit,
  reconcileOpenPositionsForUser,
  resolveUserCapitalSummary,
  type UserBotConfigRow,
} from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { getExchangeMarkets, MAJOR_LIQUID_COINS, normalizeCanonicalSymbol } from '../exchanges/markets.js';
import { publishProfitCardToTelegram, publishSignalClosedCard } from '../telegram/publisher.js';
import { fetchIranUsdtRate } from '../exchanges/iran-rate.js';
import { checkLiveFeeEnforcement, getUserServerFeeSummary } from '../services/server-fee.js';
import { getTrustWalletLiveTotalUsd } from './trustwallet.js';
import type { ExchangeProviderId } from '@dollarino/core';

export const tradingRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
tradingRoutes.use('*', requireAuth);

async function resolveModeAwareWalletAndBalance(
  env: Env,
  userId: string,
  cfg: Pick<UserBotConfigRow, 'trading_mode' | 'market_type' | 'paper_balance'> | null,
  activeProvider: ExchangeProviderId | undefined
) {
  const effectiveMode: 'PAPER' | 'LIVE' = cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
  const effectiveProvider: ExchangeProviderId | undefined =
    activeProvider === 'kcex'
      ? 'kcex'
      : effectiveMode === 'PAPER'
        ? 'paper'
        : activeProvider && activeProvider !== 'paper'
          ? activeProvider
          : undefined;

  const { adapter, provider, label } = await resolveUserExchangeAdapter(env, userId, effectiveProvider);

  const [demoCfgBal, openLiveMarginRow, openPaperMarginRow, liveReadiness] = await Promise.all([
    Promise.resolve(Number(cfg?.paper_balance ?? 10000) || 0),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CAST(margin_used AS REAL) * (CAST(remaining_quantity AS REAL) / MAX(1e-9, CAST(initial_quantity AS REAL)))), 0) AS used
       FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = 'LIVE'`
    ).bind(userId).first<{ used: number }>().catch(() => ({ used: 0 })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CAST(margin_used AS REAL) * (CAST(remaining_quantity AS REAL) / MAX(1e-9, CAST(initial_quantity AS REAL)))), 0) AS used
       FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = 'PAPER'`
    ).bind(userId).first<{ used: number }>().catch(() => ({ used: 0 })),
    getTrustWalletLiveTotalUsd(env.DB, userId).catch(() => ({
      hasWallet: false,
      totalUsd: 0,
      rpcReachable: false,
      meetsMinimum: false,
      minRequiredUsd: 10,
      breakdown: {} as Record<string, number>,
    })),
  ]);

  let balance: { free: string; used: string; total: string; currency: string };
  let displayProvider = provider;
  let displayLabel = label;

  if (effectiveMode === 'LIVE' && provider === 'paper') {
    // Non-custodial Trust Wallet LIVE mode without CEX/Hyperliquid keys:
    // NEVER return Demo/Paper balance here — always reflect real Trust Wallet balance!
    const usedLive = Math.max(0, Number(openLiveMarginRow?.used || 0));
    const liveTotal = Math.max(0, Number(liveReadiness.totalUsd || 0));
    const freeLive = Math.max(0, liveTotal - usedLive);
    balance = {
      free: freeLive.toFixed(2),
      used: usedLive.toFixed(2),
      total: Math.max(liveTotal, freeLive + usedLive).toFixed(2),
      currency: 'USDT',
    };
    displayProvider = 'trustwallet';
    displayLabel = liveReadiness.hasWallet
      ? 'Trust Wallet (حساب واقعی)'
      : 'Trust Wallet (متصل نشده)';
  } else {
    balance = await adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => ({
      free: effectiveMode === 'LIVE' ? '0.00' : demoCfgBal.toFixed(2),
      used: '0.00',
      total: effectiveMode === 'LIVE' ? '0.00' : demoCfgBal.toFixed(2),
      currency: 'USDT',
    }));
  }

  const usedPaper = Math.max(0, Number(openPaperMarginRow?.used || 0));
  const demoTotalUsd = Math.max(0, demoCfgBal + usedPaper);
  const liveBalanceUsd =
    effectiveMode === 'LIVE' && provider !== 'paper'
      ? Math.max(0, Number(balance.total || 0))
      : Math.max(0, Number(liveReadiness.totalUsd || 0));

  return {
    effectiveMode,
    adapter,
    provider: displayProvider,
    label: displayLabel,
    balance,
    walletSummary: {
      activeMode: effectiveMode,
      demoBalanceUsd: Number(demoTotalUsd.toFixed(2)),
      liveBalanceUsd: Number(liveBalanceUsd.toFixed(2)),
      liveHasWallet: liveReadiness.hasWallet || (effectiveMode === 'LIVE' && provider !== 'paper'),
      liveMeetsMinimum: liveReadiness.meetsMinimum || (effectiveMode === 'LIVE' && provider !== 'paper' && liveBalanceUsd >= 10),
      minLiveUsd: liveReadiness.minRequiredUsd,
    },
  };
}

tradingRoutes.get('/overview', async (c) => {
  const user = c.get('user');
  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string }>();

  const { effectiveMode, adapter, provider, label, balance, walletSummary } =
    await resolveModeAwareWalletAndBalance(c.env, user.id, cfg ?? null, activeRow?.provider);

  const [openTradesRaw, unreadNotifications, stats] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ? ORDER BY opened_at DESC LIMIT 25`).bind(user.id, effectiveMode).all<{
      id: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      remaining_quantity: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
      realized_pnl: string;
      mode: string;
      opened_at: string;
    }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total_trades,
              SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END) as winning_trades,
              SUM(CAST(realized_pnl AS REAL)) as total_realized_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND mode = ?`
    ).bind(user.id, effectiveMode).first<{ total_trades: number; winning_trades: number | null; total_realized_pnl: number | null }>(),
  ]);

  const openTrades = [];
  for (const pos of openTradesRaw.results) {
    const rawMark = await adapter.getTickerPrice(pos.symbol).catch(() => null);
    const mark = rawMark ? Number(rawMark) : Number(pos.entry_price);
    const entry = Number(pos.entry_price);
    const qty = Number(pos.remaining_quantity);
    const uPnl = pos.direction === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
    openTrades.push({
      ...pos,
      mark_price: mark.toFixed(mark >= 100 ? 2 : 4),
      unrealized_pnl: uPnl.toFixed(2),
    });
  }

  const totalClosed = Number(stats?.total_trades || 0);
  const wins = Number(stats?.winning_trades || 0);
  const [iranRate, serverFeeSummary, capitalSummary] = await Promise.all([
    fetchIranUsdtRate().catch(() => null),
    getUserServerFeeSummary(c.env.DB, user.id).catch(() => null),
    resolveUserCapitalSummary(c.env.DB, user.id, cfg ?? null, balance).catch(() => null),
  ]);
  return c.json({
    config: cfg,
    activeExchange: { provider, label },
    balance,
    walletSummary,
    capitalSummary,
    openTrades,
    unreadNotifications: Number(unreadNotifications?.cnt || 0),
    iranRate,
    serverFeeSummary,
    stats: {
      totalTrades: totalClosed,
      winRatePct: totalClosed > 0 ? Number(((wins / totalClosed) * 100).toFixed(1)) : 0,
      totalRealizedPnlUsd: Number((stats?.total_realized_pnl || 0).toFixed(2)),
    },
  });
});

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

  if (cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE') {
    const doId = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
    const doStub = c.env.TRADING_BOT_DO.get(doId);
    const keepTick = doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});
    try {
      c.executionCtx.waitUntil(keepTick);
    } catch {
      void keepTick;
    }
  }

  const activeRow = await c.env.DB.prepare(
    `SELECT provider, label FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(user.id).first<{ provider: ExchangeProviderId; label: string }>();

  const { effectiveMode, adapter, provider, label, balance, walletSummary } =
    await resolveModeAwareWalletAndBalance(c.env, user.id, cfg ?? null, activeRow?.provider);

  const isLitePoll = c.req.query('lite') === '1';

  const [
    openTradesRaw,
    pendingOrders,
    closedTrades,
    recentSignals,
    stats,
    closedSeriesRaw,
    walletRow,
    ledgerRows,
    aiRow,
    recentAiDecisions,
    entitlement,
    platformAI,
    activeEngine,
  ] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ? ORDER BY opened_at DESC`).bind(user.id, effectiveMode).all<{
      id: string;
      symbol: string;
      direction: Direction;
      market_type?: MarketType;
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
    c.env.DB.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'CLOSED' AND mode = ? ORDER BY closed_at DESC LIMIT 60`).bind(user.id, effectiveMode).all(),
    c.env.DB.prepare(
      `SELECT * FROM (
         SELECT * FROM signals WHERE user_id = ? ORDER BY created_at DESC LIMIT 24
       )
       UNION ALL
       SELECT * FROM (
         SELECT * FROM signals WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 24
       )
       ORDER BY created_at DESC LIMIT 24`
    ).bind(user.id).all(),
    c.env.DB.prepare(
      `SELECT
        COUNT(*) as total_trades,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as gross_wins,
        COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) < 0 THEN ABS(CAST(realized_pnl AS REAL)) ELSE 0 END), 0) as gross_losses,
        COALESCE(SUM(CASE WHEN date(closed_at) = date('now') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as today_pnl,
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-24 hours') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_24h_pnl,
        COALESCE(SUM(CASE WHEN closed_at >= datetime('now', '-7 days') THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as last_7d_pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED' AND mode = ?`
    ).bind(user.id, effectiveMode).first<{
      total_trades: number;
      wins: number;
      total_pnl: number;
      gross_wins: number;
      gross_losses: number;
      today_pnl: number;
      last_24h_pnl: number;
      last_7d_pnl: number;
    }>(),
    isLitePoll
      ? Promise.resolve({ results: [] as Array<{ symbol: string; realized_pnl: string; closed_at: string }> })
      : c.env.DB.prepare(
          `SELECT symbol, realized_pnl, closed_at
           FROM trades
           WHERE user_id = ? AND status = 'CLOSED' AND mode = ? AND closed_at IS NOT NULL
           ORDER BY closed_at DESC LIMIT 240`
        ).bind(user.id, effectiveMode).all<{ symbol: string; realized_pnl: string; closed_at: string }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN event_type IN ('DEPOSIT','TOPUP') THEN amount_usd ELSE 0 END), 0) as deposited
       FROM wallet_ledger WHERE user_id = ? AND mode = ?`
    ).bind(user.id, effectiveMode).first<{ deposited: number }>().catch(() => ({ deposited: 0 })),
    c.env.DB.prepare(
      `SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT provider, model FROM ai_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
      .bind(user.id).first<{ provider: string; model: string }>(),
    c.env.DB.prepare(
      `SELECT id, level, symbol, message, details_json, created_at FROM audit_logs WHERE user_id = ? AND category IN ('AI_AGENT', 'SIGNAL', 'ORDER', 'SYSTEM') ORDER BY created_at DESC LIMIT 12`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    resolveUserEntitlement(c.env.DB, user),
    getPlatformAISummary(c.env),
    getActiveEngineState(c.env.DB, user.id),
  ]);

  const rawTotalEq = Math.max(0, Number(balance.total ?? 0));
  const totalEq = effectiveMode === 'LIVE' ? rawTotalEq : (rawTotalEq || Number(cfg?.paper_balance ?? 10000));
  const totalEqDenom = Math.max(1, totalEq);

  // Enrich open positions with live mark price, ROE %, sparkline, and unrealized PnL
  const priceCache = new Map<string, number>();
  const sparkCache = new Map<string, number[]>();
  const openTrades = [];
  let totalUnrealizedPnl = 0;

  for (const pos of openTradesRaw.results) {
    let mark = priceCache.get(pos.symbol);
    let spark = sparkCache.get(pos.symbol);
    if (mark === undefined) {
      const k = isLitePoll ? [] : await adapter.getKlines(pos.symbol, '5m', 24).catch(() => []);
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
    const capitalPct = (margin / totalEqDenom) * 100;
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

  // Derive hourly, 30d daily, 7d weekly, & chronological Equity Curve in-memory from single closedSeriesRaw scan
  const seriesSource = isLitePoll
    ? []
    : closedSeriesRaw.results.length > 0
      ? closedSeriesRaw.results
      : (closedTrades.results as Array<{ symbol: string; realized_pnl: string; closed_at: string | null }>).filter((r) => Boolean(r.closed_at));

  const closedAsc = [...seriesSource].reverse();
  const hourlyMap = new Map<string, { pnl: number; trades: number }>();
  const dailyMap = new Map<string, number>();
  const weeklyMap = new Map<string, { count: number; wins: number; pnl: number }>();
  const cutoff30dIso = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const cutoff7dIso = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  for (const r of closedAsc) {
    if (!r.closed_at) continue;
    const pnl = Number(r.realized_pnl || 0);
    const hourKey = `${r.closed_at.slice(0, 13)}:00`;
    const hPrev = hourlyMap.get(hourKey) ?? { pnl: 0, trades: 0 };
    hourlyMap.set(hourKey, { pnl: hPrev.pnl + pnl, trades: hPrev.trades + 1 });

    const dayKey = r.closed_at.slice(0, 10);
    if (dayKey >= cutoff30dIso) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + pnl);
    }
    if (dayKey >= cutoff7dIso) {
      const wPrev = weeklyMap.get(dayKey) ?? { count: 0, wins: 0, pnl: 0 };
      weeklyMap.set(dayKey, { count: wPrev.count + 1, wins: wPrev.wins + (pnl > 0 ? 1 : 0), pnl: wPrev.pnl + pnl });
    }
  }

  const hourlyPnl = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([bucket, v]) => ({ bucket, pnl: Number(v.pnl.toFixed(2)), trades: v.trades }));

  const dailyPnl = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, pnl]) => ({ bucket, pnl: Number(pnl.toFixed(2)) }));

  const weeklyResults = Array.from(weeklyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, count: v.count, wins: v.wins, pnl: Number(v.pnl.toFixed(2)) }));

  let runningCum = 0;
  const cumulative30d = dailyPnl.map((d) => {
    runningCum += Number(d.pnl || 0);
    return { date: d.bucket, dailyPnl: Number(d.pnl || 0), cumulativePnl: Number(runningCum.toFixed(2)) };
  });

  const closedSum = closedAsc.reduce((s, r) => s + Number(r.realized_pnl || 0), 0);
  const currentEqTotal = Math.max(0, Number(balance.total || 0) + totalUnrealizedPnl);
  const totalDepositedEst =
    (walletRow?.deposited ?? 0) > 0
      ? Number(walletRow!.deposited)
      : Math.max(effectiveMode === 'LIVE' ? 0 : 10, currentEqTotal - closedSum - totalUnrealizedPnl);
  const curveStartEq = Math.max(effectiveMode === 'LIVE' ? 0 : 10, Number((totalEq - closedSum).toFixed(2)));
  const startUnix = closedAsc[0]?.closed_at
    ? Math.floor(Date.parse(closedAsc[0].closed_at.replace(' ', 'T') + 'Z') / 1000) - 3600
    : Math.floor(Date.now() / 1000) - 7200;

  const equityCurve: Array<{ time: number; label: string; equity: number; pnl: number }> = [
    {
      time: Number.isFinite(startUnix) && startUnix > 0 ? startUnix : Math.floor(Date.now() / 1000) - 7200,
      label: 'Start',
      equity: Number(curveStartEq.toFixed(2)),
      pnl: 0,
    },
  ];
  let runEq = curveStartEq;
  let runRealized = 0;
  let lastTs = equityCurve[0]!.time;
  for (const row of closedAsc) {
    if (!row.closed_at) continue;
    const p = Number(row.realized_pnl || 0);
    runEq += p;
    runRealized += p;
    const rawTs = Math.floor(Date.parse(row.closed_at.replace(' ', 'T') + 'Z') / 1000);
    const ts = Number.isFinite(rawTs) && rawTs > lastTs ? rawTs : lastTs + 60;
    lastTs = ts;
    equityCurve.push({
      time: ts,
      label: `${row.symbol} (${row.closed_at.slice(5, 16)})`,
      equity: Number(Math.max(0, runEq).toFixed(2)),
      pnl: Number(runRealized.toFixed(2)),
    });
  }
  const nowTs = Math.max(lastTs + 60, Math.floor(Date.now() / 1000));
  const livePointEq = Math.max(0, Number((totalEq + totalUnrealizedPnl).toFixed(2)));
  if (equityCurve.length === 1) {
    const midTs = Math.floor((equityCurve[0]!.time + nowTs) / 2);
    equityCurve.push({
      time: midTs > equityCurve[0]!.time ? midTs : equityCurve[0]!.time + 30,
      label: 'Active',
      equity: Number(((equityCurve[0]!.equity + livePointEq) / 2).toFixed(2)),
      pnl: Number((totalUnrealizedPnl / 2).toFixed(2)),
    });
  }
  equityCurve.push({
    time: nowTs,
    label: 'Live Now',
    equity: livePointEq,
    pnl: Number((runRealized + totalUnrealizedPnl).toFixed(2)),
  });
  void totalDepositedEst;

  // Live 8-channel Signal Mixer snapshot on active symbol using real HTF trend
  let mixerSnapshot = null;
  if (cfg && !isLitePoll) {
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

  const totalDeposited = (walletRow?.deposited ?? 0) > 0 ? walletRow!.deposited : (effectiveMode === 'LIVE' ? totalEq : 10000);
  const totalPnl = stats?.total_pnl ?? 0;
  const tfSecs: Record<string, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400 };
  const cyclePeriod = tfSecs[cfg?.entry_timeframe ?? '15m'] ?? 900;
  const nextCycleInSec = cyclePeriod - (Math.floor(Date.now() / 1000) % cyclePeriod);

  const [iranRate, serverFeeSummary, uRiskRow, sniperEventsRows, capitalSummary] = await Promise.all([
    fetchIranUsdtRate().catch(() => null),
    getUserServerFeeSummary(c.env.DB, user.id).catch(() => null),
    c.env.DB.prepare(`SELECT risk_terms_accepted_at FROM users WHERE id = ?`).bind(user.id).first<{ risk_terms_accepted_at: string | null }>().catch(() => null),
    c.env.DB.prepare(`SELECT * FROM new_listing_events ORDER BY created_at DESC LIMIT 12`).all().catch(() => ({ results: [] })),
    resolveUserCapitalSummary(c.env.DB, user.id, cfg ?? null, balance).catch(() => null),
  ]);

  if (capitalSummary) {
    riskProfile.allocatedAmount = Math.round(
      capitalSummary.effectiveCapitalUsd * ((cfg?.margin_pct ?? capitalSummary.recommended.marginPct) / 100)
    );
  }

  return c.json({
    lite: isLitePoll,
    config: cfg,
    activeEngine,
    riskTermsAcceptedAt: uRiskRow?.risk_terms_accepted_at ?? null,
    tradingModeSelected: Number(cfg?.trading_mode_selected ?? 0) === 1,
    sniperEvents: sniperEventsRows.results,
    kbosParams,
    riskProfile,
    capitalSummary,
    activeExchange: { provider, label },
    activeAI: aiRow || null,
    platformAI,
    entitlement,
    balance,
    walletSummary,
    iranRate,
    serverFeeSummary,
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
      last24hPnl: stats?.last_24h_pnl ?? 0,
      last7dPnl: stats?.last_7d_pnl ?? 0,
      unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      allTimePct: totalDeposited > 0 ? Number(((totalPnl / totalDeposited) * 100).toFixed(2)) : 0,
      totalDeposited,
      profitFactor,
    },
    charts: isLitePoll
      ? {
          hourlyPnl: [],
          dailyPnl: [],
          cumulative30d: [],
          weeklyResults: [],
          equityCurve: [],
        }
      : {
          hourlyPnl,
          dailyPnl,
          cumulative30d,
          weeklyResults,
          equityCurve,
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
  ).bind(randomId('wl'), user.id, cfg?.trading_mode ?? 'PAPER', amount, nextBal, body.note ?? 'Instant Simulation Credit Top-Up').run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Wallet topped up +$${amount.toFixed(2)} (Balance: $${nextBal.toFixed(2)})`);
  return c.json({ ok: true, balanceAfter: nextBal });
});

tradingRoutes.post('/accept-risk-terms', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ tradingMode?: 'PAPER' | 'LIVE' }>().catch(() => ({} as { tradingMode?: 'PAPER' | 'LIVE' }));
  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(`UPDATE users SET risk_terms_accepted_at = COALESCE(risk_terms_accepted_at, ?) WHERE id = ?`)
    .bind(nowIso, user.id)
    .run();

  if (body.tradingMode === 'PAPER' || body.tradingMode === 'LIVE') {
    await c.env.DB.prepare(
      `UPDATE bot_configs SET trading_mode = ?, trading_mode_selected = 1, updated_at = datetime('now') WHERE user_id = ?`
    )
      .bind(body.tradingMode, user.id)
      .run()
      .catch(() => {});
  }

  const cfgRow = await c.env.DB.prepare(`SELECT COALESCE(trading_mode_selected, 0) AS sel, trading_mode FROM bot_configs WHERE user_id = ?`)
    .bind(user.id)
    .first<{ sel: number; trading_mode: string }>()
    .catch(() => null);

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', 'کاربر متن پذیرش ریسک و قوانین معاملات را تایید کرد.');
  return c.json({
    ok: true,
    riskTermsAcceptedAt: nowIso,
    tradingModeSelected: Number(cfgRow?.sel ?? 0) === 1,
    onboardingReady: Number(cfgRow?.sel ?? 0) === 1,
    tradingMode: cfgRow?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER',
  });
});

tradingRoutes.post('/engines', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ engines?: unknown; strategyKey?: string; customStrategyId?: string | null }>().catch(() => ({} as Record<string, unknown>));
  const list = normalizeEngineArray(body.engines);
  const state = await setActiveTradingEngines(c.env.DB, user.id, list, {
    strategyKey: typeof body.strategyKey === 'string' ? body.strategyKey : undefined,
    customStrategyId: typeof body.customStrategyId === 'string' ? body.customStrategyId : null,
    auditSource: 'multi_engine_selector',
  });
  return c.json({ ok: true, activeEngine: state });
});

tradingRoutes.post('/engines/toggle', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ engine?: string; enabled?: boolean; strategyKey?: string }>().catch(() => ({} as Record<string, unknown>));
  const eng = normalizeEngineArray([body.engine])[0];
  if (!eng) return c.json({ error: 'موتور معاملاتی نامعتبر است.' }, 400);
  const state = await toggleTradingEngine(c.env.DB, user.id, eng, Boolean(body.enabled), {
    strategyKey: typeof body.strategyKey === 'string' ? body.strategyKey : undefined,
    auditSource: 'engine_toggle',
  });
  return c.json({ ok: true, activeEngine: state });
});

const ALLOWED_SNIPER_CHAINS = new Set(['solana', 'bsc', 'base', 'ethereum', 'ton', 'arbitrum']);

function parseSniperRow(cfg: Partial<UserBotConfigRow> | null) {
  let networks: string[] = ['solana', 'bsc', 'base'];
  try {
    const parsed = JSON.parse(cfg?.sniper_networks_json || '["solana","bsc","base"]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      networks = parsed.map((x) => String(x).toLowerCase()).filter((x) => ALLOWED_SNIPER_CHAINS.has(x));
    }
  } catch { /* ignore */ }
  if (networks.length === 0) networks = ['solana', 'bsc', 'base'];
  return {
    enabled: Boolean(cfg?.sniper_enabled),
    targetType: (cfg?.sniper_target_type === 'CEX_NEW_LISTING' || cfg?.sniper_target_type === 'DEX_BOOM_MEME'
      ? cfg.sniper_target_type
      : 'BOTH') as SniperTargetType,
    budgetUsd: Number(cfg?.sniper_budget_usd ?? 25),
    minSafetyScore: Number(cfg?.sniper_min_safety_score ?? 75),
    minLiquidityUsd: Number(cfg?.sniper_min_liquidity_usd ?? 25000),
    maxPairAgeHours: Number(cfg?.sniper_max_pair_age_hours ?? 24),
    maxTaxPct: Number(cfg?.sniper_max_tax_pct ?? 5),
    tpPct: Number(cfg?.sniper_tp_pct ?? 35),
    slPct: Number(cfg?.sniper_sl_pct ?? 15),
    trailingEnabled: cfg?.sniper_trailing_enabled === undefined ? true : Boolean(cfg.sniper_trailing_enabled),
    trailingPct: Number(cfg?.sniper_trailing_pct ?? 8),
    maxOpenPositions: Number(cfg?.sniper_max_open_positions ?? 3),
    autoExecute: cfg?.sniper_auto_execute === undefined ? true : Boolean(cfg.sniper_auto_execute),
    slippagePct: Number(cfg?.sniper_slippage_pct ?? 3),
    networks,
  };
}

tradingRoutes.get('/sniper', async (c) => {
  const user = c.get('user');
  const [cfg, events, dexTrades] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COALESCE(sniper_enabled, 0) AS sniper_enabled,
              COALESCE(sniper_budget_usd, 25) AS sniper_budget_usd,
              COALESCE(sniper_min_safety_score, 75) AS sniper_min_safety_score,
              COALESCE(sniper_networks_json, '["solana","bsc","base"]') AS sniper_networks_json,
              COALESCE(sniper_target_type, 'BOTH') AS sniper_target_type,
              COALESCE(sniper_min_liquidity_usd, 25000) AS sniper_min_liquidity_usd,
              COALESCE(sniper_max_pair_age_hours, 24) AS sniper_max_pair_age_hours,
              COALESCE(sniper_max_tax_pct, 5) AS sniper_max_tax_pct,
              COALESCE(sniper_tp_pct, 35) AS sniper_tp_pct,
              COALESCE(sniper_sl_pct, 15) AS sniper_sl_pct,
              COALESCE(sniper_trailing_enabled, 1) AS sniper_trailing_enabled,
              COALESCE(sniper_trailing_pct, 8) AS sniper_trailing_pct,
              COALESCE(sniper_max_open_positions, 3) AS sniper_max_open_positions,
              COALESCE(sniper_auto_execute, 1) AS sniper_auto_execute,
              COALESCE(sniper_slippage_pct, 3) AS sniper_slippage_pct
       FROM bot_configs WHERE user_id = ?`
    )
      .bind(user.id)
      .first<Partial<UserBotConfigRow>>()
      .catch(() => null),
    c.env.DB.prepare(`SELECT * FROM new_listing_events ORDER BY created_at DESC LIMIT 20`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT * FROM dex_trades WHERE user_id = ? ORDER BY opened_at DESC LIMIT 15`).bind(user.id).all().catch(() => ({ results: [] })),
  ]);
  const settings = parseSniperRow(cfg);
  const candidates = await discoverListingAndBoomCandidates({
    allowedChains: settings.networks,
    minSafetyScore: Math.min(85, settings.minSafetyScore),
    minLiquidityUsd: Math.min(50_000, settings.minLiquidityUsd),
    maxPairAgeHours: Math.max(24, settings.maxPairAgeHours),
    targetType: settings.targetType,
  }).catch(() => []);
  return c.json({
    ok: true,
    settings,
    events: events.results,
    recentSnipes: dexTrades.results,
    candidates,
  });
});

tradingRoutes.post('/sniper', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    enabled?: boolean;
    targetType?: SniperTargetType;
    budgetUsd?: number;
    minSafety?: number;
    minSafetyScore?: number;
    minLiquidityUsd?: number;
    maxPairAgeHours?: number;
    maxTaxPct?: number;
    tpPct?: number;
    slPct?: number;
    trailingEnabled?: boolean;
    trailingPct?: number;
    maxOpenPositions?: number;
    autoExecute?: boolean;
    slippagePct?: number;
    networks?: string[];
  }>().catch(() => ({} as Record<string, unknown>));

  const cur = await c.env.DB.prepare(`SELECT * FROM bot_configs WHERE user_id = ?`).bind(user.id).first<Partial<UserBotConfigRow>>().catch(() => null);
  const prev = parseSniperRow(cur);

  const nextEnabled = body.enabled !== undefined ? Boolean(body.enabled) : prev.enabled;
  const nextTarget: SniperTargetType =
    body.targetType === 'CEX_NEW_LISTING' || body.targetType === 'DEX_BOOM_MEME' || body.targetType === 'BOTH'
      ? body.targetType
      : prev.targetType;
  const nextBudget = Math.max(5, Math.min(5000, Number(body.budgetUsd ?? prev.budgetUsd) || 25));
  const rawSafety = body.minSafetyScore ?? body.minSafety ?? prev.minSafetyScore;
  const nextSafety = Math.max(40, Math.min(98, Math.round(Number(rawSafety) || 75)));
  const nextLiq = Math.max(5000, Math.min(10_000_000, Math.round(Number(body.minLiquidityUsd ?? prev.minLiquidityUsd) || 25000)));
  const nextAge = Math.max(1, Math.min(720, Number(body.maxPairAgeHours ?? prev.maxPairAgeHours) || 24));
  const nextTax = Math.max(0, Math.min(25, Number(body.maxTaxPct ?? prev.maxTaxPct) ?? 5));
  const nextTp = Math.max(5, Math.min(500, Number(body.tpPct ?? prev.tpPct) || 35));
  const nextSl = Math.max(3, Math.min(80, Number(body.slPct ?? prev.slPct) || 15));
  const nextTrailEn = body.trailingEnabled !== undefined ? Boolean(body.trailingEnabled) : prev.trailingEnabled;
  const nextTrailPct = Math.max(2, Math.min(50, Number(body.trailingPct ?? prev.trailingPct) || 8));
  const nextMaxPos = Math.max(1, Math.min(12, Math.round(Number(body.maxOpenPositions ?? prev.maxOpenPositions) || 3)));
  const nextAutoExec = body.autoExecute !== undefined ? Boolean(body.autoExecute) : prev.autoExecute;
  const nextSlip = Math.max(0.5, Math.min(25, Number(body.slippagePct ?? prev.slippagePct) || 3));
  const nextNets = Array.isArray(body.networks)
    ? body.networks.map((x) => String(x).toLowerCase()).filter((x) => ALLOWED_SNIPER_CHAINS.has(x))
    : prev.networks;
  const safeNets = nextNets.length > 0 ? nextNets : ['solana', 'bsc', 'base'];

  await c.env.DB.prepare(
    `UPDATE bot_configs
     SET sniper_enabled = ?,
         sniper_target_type = ?,
         sniper_budget_usd = ?,
         sniper_min_safety_score = ?,
         sniper_min_liquidity_usd = ?,
         sniper_max_pair_age_hours = ?,
         sniper_max_tax_pct = ?,
         sniper_tp_pct = ?,
         sniper_sl_pct = ?,
         sniper_trailing_enabled = ?,
         sniper_trailing_pct = ?,
         sniper_max_open_positions = ?,
         sniper_auto_execute = ?,
         sniper_slippage_pct = ?,
         sniper_networks_json = ?,
         updated_at = datetime('now')
     WHERE user_id = ?`
  )
    .bind(
      nextEnabled ? 1 : 0,
      nextTarget,
      nextBudget,
      nextSafety,
      nextLiq,
      nextAge,
      nextTax,
      nextTp,
      nextSl,
      nextTrailEn ? 1 : 0,
      nextTrailPct,
      nextMaxPos,
      nextAutoExec ? 1 : 0,
      nextSlip,
      JSON.stringify(safeNets),
      user.id
    )
    .run();

  if (body.enabled !== undefined) {
    await toggleTradingEngine(c.env.DB, user.id, 'LISTING_SNIPER', nextEnabled, { auditSource: 'sniper_settings' }).catch(() => {});
  }

  return c.json({
    ok: true,
    settings: {
      enabled: nextEnabled,
      targetType: nextTarget,
      budgetUsd: nextBudget,
      minSafetyScore: nextSafety,
      minLiquidityUsd: nextLiq,
      maxPairAgeHours: nextAge,
      maxTaxPct: nextTax,
      tpPct: nextTp,
      slPct: nextSl,
      trailingEnabled: nextTrailEn,
      trailingPct: nextTrailPct,
      maxOpenPositions: nextMaxPos,
      autoExecute: nextAutoExec,
      slippagePct: nextSlip,
      networks: safeNets,
    },
  });
});

tradingRoutes.post('/sniper/scan-now', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ execute?: boolean }>().catch(() => ({ execute: true }));
  const shouldExecute = body.execute !== false;

  const cfg = await c.env.DB.prepare(`SELECT * FROM bot_configs WHERE user_id = ?`).bind(user.id).first<UserBotConfigRow>();
  if (!cfg) return c.json({ error: 'Bot config not found' }, 404);

  const settings = parseSniperRow(cfg);

  if (shouldExecute && (cfg.bot_state === 'RUNNING_PAPER' || cfg.bot_state === 'RUNNING_LIVE')) {
    const gate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
    if (!gate.ok) {
      return c.json({ error: gate.error, code: gate.code, boughtCount: 0, scannedCount: 0, candidates: [] }, 403);
    }
    const res = await runNewListingAndMemeSniperForUser(c.env, user.id, cfg);
    return c.json(res);
  }

  const candidates = await discoverListingAndBoomCandidates({
    allowedChains: settings.networks,
    minSafetyScore: Math.max(40, settings.minSafetyScore),
    minLiquidityUsd: settings.minLiquidityUsd,
    maxPairAgeHours: settings.maxPairAgeHours,
    targetType: settings.targetType,
  }).catch(() => []);

  for (const cand of candidates.slice(0, 5)) {
    await c.env.DB.prepare(
      `INSERT INTO new_listing_events (id, symbol, token_address, chain_id, source, safety_score, liquidity_usd, price_usd, change_1h_pct, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        randomId('nle'),
        cand.symbol,
        cand.tokenAddress,
        cand.chainId,
        cand.source,
        cand.safetyScore,
        cand.liquidityUsd,
        cand.priceUsd,
        cand.change1hPct,
        `${cand.name} (${cand.dexId})`
      )
      .run()
      .catch(() => {});
  }

  return c.json({
    ok: true,
    boughtCount: 0,
    scannedCount: candidates.length,
    candidates,
    note:
      shouldExecute
        ? 'ربات خاموش است؛ فقط لیست ارزهای تازه لیست‌شده و میم‌کوین‌های امن نمایش داده شد. برای خرید خودکار، ربات را روشن کنید یا روی خرید مستقیم بزنید.'
        : 'اسکن زنده لیستینگ‌های جدید و میم‌کوین‌های امن با موفقیت انجام شد.',
  });
});

tradingRoutes.post('/sniper/buy-candidate', async (c) => {
  const user = c.get('user');
  const gate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
  if (!gate.ok) {
    return c.json({ error: gate.error, code: gate.code }, 403);
  }

  const body = await c.req.json<{ candidate?: SniperCandidate }>().catch(() => ({} as { candidate?: SniperCandidate }));
  if (!body.candidate || !body.candidate.tokenAddress || !body.candidate.symbol || !(Number(body.candidate.priceUsd) > 0)) {
    return c.json({ error: 'اطلاعات توکن نامعتبر است.' }, 400);
  }
  const cfg = await c.env.DB.prepare(`SELECT * FROM bot_configs WHERE user_id = ?`).bind(user.id).first<UserBotConfigRow>();
  if (!cfg) return c.json({ error: 'Bot config not found' }, 404);

  const res = await executeSniperBuyForCandidate({
    env: c.env,
    userId: user.id,
    cfg,
    pick: body.candidate,
    bypassDedupe: true,
  });
  if (!res.ok) {
    return c.json({ error: res.reason || 'Snipe failed' }, 400);
  }
  return c.json(res);
});

tradingRoutes.post('/wallet/reset', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ balance?: number }>().catch(() => ({} as { balance?: number }));
  let targetBal = Number(body.balance);
  if (!Number.isFinite(targetBal) || targetBal <= 0) {
    const curRow = await c.env.DB.prepare(`SELECT COALESCE(custom_paper_balance, 10000) AS bal FROM bot_configs WHERE user_id = ?`)
      .bind(user.id).first<{ bal: number }>().catch(() => null);
    targetBal = Number(curRow?.bal ?? 10000);
  }
  targetBal = Math.max(50, Math.min(10_000_000, Math.round(targetBal * 100) / 100));
  await c.env.DB.prepare(
    `UPDATE bot_configs SET paper_balance = ?, custom_paper_balance = ?, updated_at = datetime('now') WHERE user_id = ?`
  )
    .bind(targetBal.toFixed(2), targetBal, user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
     VALUES (?, ?, 'PAPER', 'TOPUP', ?, ?, ?)`
  ).bind(randomId('wl'), user.id, targetBal, targetBal, `Set Custom Demo Balance to $${targetBal.toLocaleString('en-US')}`).run().catch(() => {});
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Simulation balance configured to $${targetBal.toFixed(2)}`);
  return c.json({
    ok: true,
    balance: targetBal,
    balanceAfter: targetBal,
    customPaperBalance: targetBal,
  });
});

tradingRoutes.on(['PATCH', 'PUT'], '/config', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>();

  const allowedFields: Record<string, string> = {
    trading_mode: 'trading_mode',
    market_type: 'market_type',
    direction_mode: 'direction_mode',
    hedge_mode: 'hedge_mode',
    trade_execution_mode: 'trade_execution_mode',
    margin_mode: 'margin_mode',
    notifications_enabled: 'notifications_enabled',
    symbol: 'symbol',
    auto_scan_top: 'auto_scan_top',
    scan_scope: 'scan_scope',
    allow_auto_flip: 'allow_auto_flip',
    allow_pyramiding: 'allow_pyramiding',
    watchlist_json: 'watchlist_json',
    strategy_key: 'strategy_key',
    active_custom_strategy_id: 'active_custom_strategy_id',
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
    active_engines_json: 'active_engines_json',
    custom_paper_balance: 'custom_paper_balance',
    sniper_enabled: 'sniper_enabled',
    sniper_budget_usd: 'sniper_budget_usd',
    sniper_min_safety_score: 'sniper_min_safety_score',
    sniper_networks_json: 'sniper_networks_json',
    sniper_target_type: 'sniper_target_type',
    sniper_min_liquidity_usd: 'sniper_min_liquidity_usd',
    sniper_max_pair_age_hours: 'sniper_max_pair_age_hours',
    sniper_max_tax_pct: 'sniper_max_tax_pct',
    sniper_tp_pct: 'sniper_tp_pct',
    sniper_sl_pct: 'sniper_sl_pct',
    sniper_trailing_enabled: 'sniper_trailing_enabled',
    sniper_trailing_pct: 'sniper_trailing_pct',
    sniper_max_open_positions: 'sniper_max_open_positions',
    sniper_auto_execute: 'sniper_auto_execute',
    sniper_slippage_pct: 'sniper_slippage_pct',
    bot_budget_mode: 'bot_budget_mode',
    bot_budget_usd: 'bot_budget_usd',
    bot_budget_pct: 'bot_budget_pct',
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.trading_mode === 'PAPER' || body.trading_mode === 'LIVE') {
    sets.push(`trading_mode_selected = 1`);
  }
  if (body.trading_mode === 'LIVE') {
    const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
    if (!feeCheck.allowed) {
      return c.json({
        error: feeCheck.reasonFa || 'برای فعال‌سازی حساب واقعی، ابتدا کارمزد معوق ۳٪ سودهای قبلی را تسویه کنید.',
        code: 'FEE_SETTLEMENT_REQUIRED',
        enforcement: feeCheck,
      }, 402);
    }
    const [uWallet, perpConn, copyVault, liveEx] = await Promise.all([
      c.env.DB.prepare(
        `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton FROM users WHERE id = ?`
      ).bind(user.id).first<{
        trust_wallet_address: string | null;
        trust_wallet_tron: string | null;
        trust_wallet_solana: string | null;
        trust_wallet_ton: string | null;
      }>(),
      c.env.DB.prepare(`SELECT id FROM perp_dex_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`).bind(user.id).first().catch(() => null),
      c.env.DB.prepare(`SELECT id FROM user_copy_vaults WHERE user_id = ? LIMIT 1`).bind(user.id).first().catch(() => null),
      c.env.DB.prepare(
        `SELECT id FROM exchange_connections WHERE user_id = ? AND provider IN ('toobit', 'bitunix', 'kcex') LIMIT 1`
      ).bind(user.id).first(),
    ]);
    const hasTrustWallet = Boolean(
      uWallet?.trust_wallet_address || uWallet?.trust_wallet_tron || uWallet?.trust_wallet_solana || uWallet?.trust_wallet_ton || perpConn || copyVault || liveEx
    );
    if (!hasTrustWallet) {
      return c.json({
        error: 'ابتدا در بخش «اتصال Trust Wallet» آدرس کیف‌پول تراست‌ولت خود را متصل کنید تا معاملات واقعی فعال شود.',
        code: 'NO_TRUST_WALLET',
      }, 400);
    }
  }
  for (const [k, col] of Object.entries(allowedFields)) {
    if (body[k] !== undefined) {
      // Point #9: Only Admin/Owner may customize platform signal broadcast channel handles
      if (k === 'signal_channel_handle' && user.role !== 'owner' && user.role !== 'admin') {
        continue;
      }
      let val = typeof body[k] === 'object' && body[k] !== null ? JSON.stringify(body[k]) : body[k];
      if (k === 'hedge_mode' || k === 'sniper_enabled' || k === 'sniper_trailing_enabled' || k === 'sniper_auto_execute') val = body[k] ? 1 : 0;
      if (k === 'market_type') val = String(body[k]).toUpperCase() === 'SPOT' ? 'SPOT' : 'FUTURES';
      if (k === 'direction_mode') {
        const d = String(body[k]).toUpperCase();
        val = d === 'LONG_ONLY' || d === 'SHORT_ONLY' ? d : 'BOTH';
      }
      if (k === 'sniper_budget_usd') {
        val = Math.max(5, Math.min(5000, Number(body[k]) || 25));
      }
      if (k === 'sniper_min_safety_score') {
        val = Math.max(40, Math.min(98, Math.round(Number(body[k]) || 75)));
      }
      if (k === 'sniper_target_type') {
        const t = String(body[k]).toUpperCase();
        val = t === 'CEX_NEW_LISTING' || t === 'DEX_BOOM_MEME' ? t : 'BOTH';
      }
      if (k === 'sniper_min_liquidity_usd') {
        val = Math.max(5000, Math.min(10_000_000, Math.round(Number(body[k]) || 25000)));
      }
      if (k === 'sniper_max_pair_age_hours') {
        val = Math.max(1, Math.min(720, Number(body[k]) || 24));
      }
      if (k === 'sniper_max_tax_pct') {
        val = Math.max(0, Math.min(25, Number(body[k]) ?? 5));
      }
      if (k === 'sniper_tp_pct') {
        val = Math.max(5, Math.min(500, Number(body[k]) || 35));
      }
      if (k === 'sniper_sl_pct') {
        val = Math.max(3, Math.min(80, Number(body[k]) || 15));
      }
      if (k === 'sniper_trailing_pct') {
        val = Math.max(2, Math.min(50, Number(body[k]) || 8));
      }
      if (k === 'sniper_max_open_positions') {
        val = Math.max(1, Math.min(12, Math.round(Number(body[k]) || 3)));
      }
      if (k === 'sniper_slippage_pct') {
        val = Math.max(0.5, Math.min(25, Number(body[k]) || 3));
      }
      if (k === 'custom_paper_balance') {
        val = Math.max(50, Math.min(10_000_000, Number(body[k]) || 10000));
      }
      if (k === 'bot_budget_mode') {
        const m = String(body[k]).toUpperCase();
        val = m === 'FIXED_USD' || m === 'PERCENT_OF_BALANCE' ? m : 'FULL_BALANCE';
      }
      if (k === 'bot_budget_usd') {
        const num = Number(body[k] ?? 0);
        val = num > 0 ? Math.max(10, Math.min(10_000_000, Math.round(num * 100) / 100)) : 0;
      }
      if (k === 'bot_budget_pct') {
        val = Math.max(5, Math.min(100, Math.round((Number(body[k]) || 100) * 10) / 10));
      }
      sets.push(`${col} = ?`);
      vals.push(val);
    }
  }
  if (body.market_type === 'SPOT') {
    sets.push(`max_leverage = 1`, `hedge_mode = 0`);
    if (body.direction_mode === 'SHORT_ONLY') {
      return c.json({ error: 'اسپات از معاملات Short مارجین پشتیبانی نمی‌کند. جهت اسپات باید LONG_ONLY یا BOTH باشد.' }, 400);
    }
  }

  if (!sets.length) return c.json({ error: 'No fields to update' }, 400);
  sets.push(`updated_at = datetime('now')`);
  vals.push(user.id);

  let engineSwitchResult: Awaited<ReturnType<typeof toggleTradingEngine>> | null = null;
  if (Array.isArray(body.activeEngines)) {
    engineSwitchResult = await setActiveTradingEngines(c.env.DB, user.id, normalizeEngineArray(body.activeEngines), {
      strategyKey: typeof body.strategy_key === 'string' ? body.strategy_key : undefined,
      auditSource: 'config_update_multi',
    });
  } else if (typeof body.strategy_key === 'string' && body.strategy_key.trim()) {
    const sk = body.strategy_key.trim();
    const targetChoice: Exclude<TradingEngineChoice, 'LISTING_SNIPER'> =
      sk === 'ai_autonomous_agent'
        ? 'CENTRAL_AI'
        : sk === 'my_custom_ai'
          ? 'MY_AI'
          : sk === 'copy_trade'
            ? 'COPY_TRADE'
            : 'STRATEGY';
    engineSwitchResult = await toggleTradingEngine(c.env.DB, user.id, targetChoice, true, {
      strategyKey: sk,
      auditSource: 'config_update',
    });
  }

  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();
  const [updated, activeEngine] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first<UserBotConfigRow>(),
    getActiveEngineState(c.env.DB, user.id),
  ]);
  const capitalSummary = await resolveUserCapitalSummary(c.env.DB, user.id, updated ?? null).catch(() => null);
  return c.json({ ok: true, config: updated, activeEngine, capitalSummary, switchedFrom: engineSwitchResult });
});

tradingRoutes.post('/bot/start', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    marginPct?: number;
    strategyKey?: StrategyKey;
    symbol?: string;
    marketType?: MarketType;
    directionMode?: DirectionMode;
    hedgeMode?: boolean;
    autoScanTop?: boolean;
    scanScope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
    maxOpenPositions?: number;
    allowAutoFlip?: boolean;
    riskPreset?: string;
    maxLeverage?: number;
    dailyMaxLossPct?: number;
    trailingStopEnabled?: boolean;
    trailingStopPct?: number;
    allocatedAmount?: number;
    customStrategyId?: string;
    tradeExecutionMode?: 'AUTO' | 'MANUAL_CONFIRM';
    tradingMode?: 'PAPER' | 'LIVE';
    acceptRiskTerms?: boolean;
  }>().catch(() => ({} as Record<string, unknown>));

  if (body.tradingMode === 'PAPER' || body.tradingMode === 'LIVE') {
    await c.env.DB.prepare(
      `UPDATE bot_configs SET trading_mode = ?, trading_mode_selected = 1, updated_at = datetime('now') WHERE user_id = ?`
    )
      .bind(body.tradingMode, user.id)
      .run()
      .catch(() => {});
  }
  if (body.acceptRiskTerms === true) {
    await c.env.DB.prepare(`UPDATE users SET risk_terms_accepted_at = COALESCE(risk_terms_accepted_at, ?) WHERE id = ?`)
      .bind(new Date().toISOString(), user.id)
      .run()
      .catch(() => {});
  }

  const onboardingGate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
  if (!onboardingGate.ok) {
    return c.json(
      {
        error: onboardingGate.error,
        code: onboardingGate.code,
        hasSelectedMode: onboardingGate.hasSelectedMode,
        hasAcceptedRisk: onboardingGate.hasAcceptedRisk,
      },
      403
    );
  }

  const [cfg, ensemble, entitlement, twUser] = await Promise.all([
    c.env.DB.prepare('SELECT trading_mode, trade_execution_mode, market_type, strategy_key, active_engines_json, risk_profile_json FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; trade_execution_mode?: string; market_type?: MarketType; strategy_key: string; active_engines_json?: string | null; risk_profile_json?: string }>(),
    resolveAIEnsemble(c.env, user.id),
    resolveUserEntitlement(c.env.DB, user),
    c.env.DB.prepare(
      `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton FROM users WHERE id = ?`
    ).bind(user.id).first<{
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
    }>(),
  ]);

  let nonCentralEngines: string[] = [];
  try {
    const parsed = cfg?.active_engines_json ? JSON.parse(cfg.active_engines_json) : [];
    if (Array.isArray(parsed)) {
      nonCentralEngines = parsed.filter((e) => typeof e === 'string' && e !== 'CENTRAL_AI');
    }
  } catch { /* ignore */ }

  const targetStrategy = typeof body.strategyKey === 'string' ? body.strategyKey : (cfg?.strategy_key || 'dollarino_v01');
  void entitlement;
  const allowPaperFallback = (cfg?.trading_mode ?? 'PAPER') === 'PAPER' && !ensemble.capExceeded;
  if (targetStrategy === 'ai_autonomous_agent' && ensemble.engines.length === 0 && nonCentralEngines.length === 0 && !allowPaperFallback) {
    return c.json({
      error: ensemble.capExceeded
        ? 'سقف درخواست روزانه موتور «هوش مصنوعی دلارینو» پر شده است. لطفاً در پنل مدیریت سقف روزانه موتور را افزایش دهید.'
        : 'موتور «هوش مصنوعی دلارینو» هنوز توسط مدیریت فعال نشده است. تا فعال‌سازی می‌توانید از «هوش مصنوعی من» یا استراتژی‌های کوانت استفاده کنید.',
      code: ensemble.capExceeded ? 'AI_DAILY_CAP_REACHED' : 'NO_ACTIVE_AI_KEY',
    }, 400);
  }

  const { provider: activeExProvider } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );
  const hasTrustConnected = Boolean(
    twUser?.trust_wallet_address || twUser?.trust_wallet_tron || twUser?.trust_wallet_solana || twUser?.trust_wallet_ton
  );

  if (cfg?.trading_mode === 'LIVE') {
    const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
    if (!feeCheck.allowed) {
      return c.json({
        error: feeCheck.reasonFa || 'حساب ترید واقعی تا زمان تسویه کارمزد معوق ۳٪ قفل است.',
        code: 'FEE_SETTLEMENT_REQUIRED',
        enforcement: feeCheck,
      }, 402);
    }
    if (!hasTrustConnected && activeExProvider === 'paper') {
      return c.json({
        error: 'برای شروع ربات روی حساب واقعی، ابتدا کیف‌پول Trust Wallet خود را متصل کنید (یا به حالت کیف‌پول دمو سوییچ کنید).',
        code: 'NO_TRUST_WALLET',
      }, 400);
    }
    if (hasTrustConnected) {
      const readiness = await getTrustWalletLiveTotalUsd(c.env.DB, user.id);
      if (!readiness.meetsMinimum) {
        return c.json({
          error: `برای اجرای ربات روی کیف‌پول واقعی، حداقل ${readiness.minRequiredUsd} دلار موجودی در Trust Wallet نیاز است (موجودی فعلی: $${readiness.totalUsd.toFixed(2)}). می‌توانید همین الان با کیف‌پول دمو قابل تنظیم رایگان ($50 تا $10M) شروع کنید.`,
          code: 'MIN_BALANCE_10_USD',
          currentUsd: readiness.totalUsd,
          minRequiredUsd: readiness.minRequiredUsd,
        }, 400);
      }
    }
  }

  const nextState = cfg?.trading_mode === 'LIVE' && (hasTrustConnected || activeExProvider !== 'paper') ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
  const resolvedExecMode =
    body.tradeExecutionMode === 'MANUAL_CONFIRM'
      ? 'MANUAL_CONFIRM'
      : body.tradeExecutionMode === 'AUTO'
        ? 'AUTO'
        : cfg?.trade_execution_mode === 'MANUAL_CONFIRM'
          ? 'MANUAL_CONFIRM'
          : 'AUTO';

  const sets = [
    `bot_state = ?`,
    `trade_execution_mode = ?`,
    `started_at = datetime('now')`,
    `updated_at = datetime('now')`,
  ];
  const vals: unknown[] = [nextState, resolvedExecMode];

  if (typeof body.marginPct === 'number') {
    sets.push(`margin_pct = ?`);
    vals.push(body.marginPct);
  }
  if (typeof body.strategyKey === 'string') {
    sets.push(`strategy_key = ?`);
    vals.push(body.strategyKey);
  }
  if (typeof body.customStrategyId === 'string') {
    sets.push(`active_custom_strategy_id = ?`);
    vals.push(body.customStrategyId || null);
  }
  if (typeof body.symbol === 'string' && body.symbol.trim()) {
    sets.push(`symbol = ?`);
    vals.push(normalizeCanonicalSymbol(body.symbol));
  }
  const resolvedMarketType: MarketType = body.marketType === 'SPOT' ? 'SPOT' : body.marketType === 'FUTURES' ? 'FUTURES' : (cfg?.market_type ?? 'FUTURES');
  if (body.marketType === 'SPOT' || body.marketType === 'FUTURES') {
    sets.push(`market_type = ?`);
    vals.push(resolvedMarketType);
  }
  if (body.directionMode === 'BOTH' || body.directionMode === 'LONG_ONLY' || body.directionMode === 'SHORT_ONLY') {
    if (resolvedMarketType === 'SPOT' && body.directionMode === 'SHORT_ONLY') {
      return c.json({ error: 'اسپات تنها از خرید (Long) پشتیبانی می‌کند.' }, 400);
    }
    sets.push(`direction_mode = ?`);
    vals.push(body.directionMode);
  }
  if (typeof body.hedgeMode === 'boolean') {
    sets.push(`hedge_mode = ?`);
    vals.push(resolvedMarketType === 'SPOT' ? 0 : body.hedgeMode ? 1 : 0);
  }
  if (resolvedMarketType === 'SPOT') {
    sets.push(`max_leverage = 1`, `hedge_mode = 0`);
  }
  if (typeof body.autoScanTop === 'boolean') {
    sets.push(`auto_scan_top = ?`);
    vals.push(body.autoScanTop ? 1 : 0);
  }
  if (body.scanScope === 'SINGLE' || body.scanScope === 'TOP_COINS' || body.scanScope === 'ALL_MARKET') {
    sets.push(`scan_scope = ?`, `auto_scan_top = ?`);
    vals.push(body.scanScope, body.scanScope === 'SINGLE' ? 0 : 1);
  }
  if (typeof body.maxOpenPositions === 'number') {
    sets.push(`max_open_positions = ?`);
    vals.push(Math.max(1, Math.min(20, Math.round(body.maxOpenPositions))));
  }
  if (typeof body.allowAutoFlip === 'boolean') {
    sets.push(`allow_auto_flip = ?`);
    vals.push(body.allowAutoFlip ? 1 : 0);
  }
  if (typeof body.maxLeverage === 'number' && resolvedMarketType !== 'SPOT') {
    sets.push(`max_leverage = ?`);
    vals.push(Math.max(1, Math.min(50, Math.round(body.maxLeverage))));
  }
  if (typeof body.dailyMaxLossPct === 'number') {
    sets.push(`daily_max_loss_pct = ?`);
    vals.push(body.dailyMaxLossPct);
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
  if ((body as { acceptRiskTerms?: boolean }).acceptRiskTerms === true) {
    await c.env.DB.prepare(`UPDATE users SET risk_terms_accepted_at = COALESCE(risk_terms_accepted_at, ?) WHERE id = ?`)
      .bind(new Date().toISOString(), user.id)
      .run()
      .catch(() => {});
  }

  const explicitEngines = normalizeEngineArray((body as { activeEngines?: unknown }).activeEngines);
  let resolvedEngines: TradingEngineChoice[];
  if (explicitEngines.length > 0) {
    const st = await setActiveTradingEngines(c.env.DB, user.id, explicitEngines, {
      strategyKey: targetStrategy,
      customStrategyId: typeof body.customStrategyId === 'string' ? (body.customStrategyId || null) : undefined,
      auditSource: 'bot_start_multi',
    });
    resolvedEngines = st.activeEngines;
  } else if (typeof body.strategyKey === 'string' && body.strategyKey.trim()) {
    const startChoice: Exclude<TradingEngineChoice, 'LISTING_SNIPER'> =
      targetStrategy === 'ai_autonomous_agent'
        ? 'CENTRAL_AI'
        : targetStrategy === 'my_custom_ai'
          ? 'MY_AI'
          : targetStrategy === 'copy_trade'
            ? 'COPY_TRADE'
            : 'STRATEGY';
    const st = await toggleTradingEngine(c.env.DB, user.id, startChoice, true, {
      strategyKey: targetStrategy,
      customStrategyId: typeof body.customStrategyId === 'string' ? (body.customStrategyId || null) : undefined,
      auditSource: 'bot_start',
    });
    resolvedEngines = st.activeEngines;
  } else {
    const st = await getActiveEngineState(c.env.DB, user.id);
    resolvedEngines = st.activeEngines.length > 0 ? st.activeEngines : ['CENTRAL_AI'];
  }

  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();

  if (resolvedEngines.includes('COPY_TRADE')) {
    await c.env.DB.prepare(`UPDATE copy_subscriptions SET auto_mirror = 1, updated_at = datetime('now') WHERE user_id = ? AND is_active = 1`)
      .bind(user.id)
      .run()
      .catch(() => {});
  }

  await logAudit(
    c.env.DB,
    user.id,
    'SYSTEM',
    'INFO',
    `ربات اتوترید روشن شد · موتورهای فعال: [${resolvedEngines.join(', ')}]`
  );

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
  await Promise.race([runTick, new Promise((resolve) => setTimeout(resolve, 4500))]);

  return c.json({
    ok: true,
    bot_state: nextState,
    strategy_key: targetStrategy,
    activeExchangeProvider: activeExProvider,
  });
});

tradingRoutes.get('/config/recommended-preview', async (c) => {
  const user = c.get('user');
  const presetRaw = String(c.req.query('preset') || 'balanced').toLowerCase();
  const preset: CapitalPresetId =
    presetRaw === 'conservative' || presetRaw === 'aggressive' ? presetRaw : 'balanced';

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();

  const queryWalletUsd = Number(c.req.query('walletUsd') || 0);
  let walletBalanceUsd = Number.isFinite(queryWalletUsd) && queryWalletUsd > 0 ? queryWalletUsd : 0;
  if (walletBalanceUsd <= 0) {
    if (cfg?.trading_mode === 'LIVE') {
      const activeRow = await c.env.DB.prepare(
        `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
      ).bind(user.id).first<{ provider: ExchangeProviderId }>().catch(() => null);
      const { balance } = await resolveModeAwareWalletAndBalance(c.env, user.id, cfg, activeRow?.provider);
      walletBalanceUsd = Math.max(0, Number(balance.total || 0));
    } else {
      walletBalanceUsd = Number(cfg?.paper_balance ?? 10000) || 10000;
    }
  }

  const capRes = resolveEffectiveBotCapital({
    walletBalanceUsd,
    budgetMode: c.req.query('budgetMode') || cfg?.bot_budget_mode || 'FULL_BALANCE',
    budgetUsd: c.req.query('budgetUsd') !== undefined ? Number(c.req.query('budgetUsd')) : cfg?.bot_budget_usd,
    budgetPct: c.req.query('budgetPct') !== undefined ? Number(c.req.query('budgetPct')) : cfg?.bot_budget_pct,
  });

  const recommended = computeDynamicRecommendedSettings(capRes.effectiveCapitalUsd, preset);
  return c.json({ ok: true, capital: capRes, recommended });
});

tradingRoutes.post('/config/reset-defaults', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ preset?: CapitalPresetId; budgetMode?: string; budgetUsd?: number; budgetPct?: number }>()
    .catch(() => ({} as { preset?: CapitalPresetId; budgetMode?: string; budgetUsd?: number; budgetPct?: number }));
  const preset: CapitalPresetId =
    body.preset === 'conservative' || body.preset === 'aggressive' ? body.preset : 'balanced';

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO bot_configs (user_id, webhook_secret) VALUES (?, ?)`
  ).bind(user.id, randomId('wh')).run().catch(() => {});

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();

  let liveBalance: { free?: string; total?: string } | null = null;
  if (cfg?.trading_mode === 'LIVE') {
    const activeRow = await c.env.DB.prepare(
      `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    ).bind(user.id).first<{ provider: ExchangeProviderId }>().catch(() => null);
    const { balance } = await resolveModeAwareWalletAndBalance(c.env, user.id, cfg, activeRow?.provider);
    liveBalance = balance;
  }

  const effectiveCfg = cfg
    ? {
        ...cfg,
        bot_budget_mode: (body.budgetMode as UserBotConfigRow['bot_budget_mode']) || cfg.bot_budget_mode,
        bot_budget_usd: body.budgetUsd !== undefined ? Number(body.budgetUsd) : cfg.bot_budget_usd,
        bot_budget_pct: body.budgetPct !== undefined ? Number(body.budgetPct) : cfg.bot_budget_pct,
      }
    : null;

  const capitalSummary = await resolveUserCapitalSummary(c.env.DB, user.id, effectiveCfg, liveBalance);
  const rec = computeDynamicRecommendedSettings(capitalSummary.effectiveCapitalUsd, preset);

  const dynamicRiskProfile = JSON.stringify({
    preset: rec.preset,
    marketBias: 'neutral',
    preferredSession: 'automatic',
    entryStyle: rec.preset,
    maxSpread: 0.5,
    cooldownMinutes: rec.effectiveCapitalUsd <= 150 ? 15 : 10,
    trailingStop: true,
    trailingDistance: rec.trailingStopPct,
    allocatedAmount: rec.perTradeUsd,
  });

  await c.env.DB.prepare(
    `UPDATE bot_configs SET
       strategy_key = 'dollarino_v01',
       symbol = 'BTCUSDT',
       entry_timeframe = '15m',
       higher_timeframe = '1h',
       margin_pct = ?,
       max_leverage = ?,
       daily_max_loss_pct = ?,
       market_type = 'FUTURES',
       direction_mode = 'BOTH',
       hedge_mode = 0,
       scan_scope = 'TOP_COINS',
       auto_scan_top = 1,
       max_open_positions = ?,
       tp1_close_pct = ?,
       tp2_close_pct = ?,
       tp3_close_pct = ?,
       auto_breakeven_on_tp1 = 1,
       move_sl_to_tp1_on_tp2 = 1,
       trailing_stop_enabled = 1,
       trailing_stop_pct = ?,
       trail_after_tp1 = 1,
       kbos_params_json = ?,
       risk_profile_json = ?,
       updated_at = datetime('now')
     WHERE user_id = ?`
  )
    .bind(
      rec.marginPct,
      rec.maxLeverage,
      rec.dailyMaxLossPct,
      rec.maxOpenPositions,
      rec.tp1ClosePct,
      rec.tp2ClosePct,
      rec.tp3ClosePct,
      rec.trailingStopPct,
      JSON.stringify(DEFAULT_KBOS_PARAMS),
      dynamicRiskProfile,
      user.id
    )
    .run();

  await logAudit(c.env.DB, user.id, 'BOT', 'INFO', `تنظیمات پیش‌فرض مدیریت سرمایه اعمال شد: ${rec.summaryFa}`);
  const updated = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first<UserBotConfigRow>();
  const nextCapitalSummary = await resolveUserCapitalSummary(c.env.DB, user.id, updated ?? null, liveBalance).catch(() => capitalSummary);
  return c.json({
    ok: true,
    config: updated,
    recommended: rec,
    capitalSummary: nextCapitalSummary,
    message: `تنظیمات خودکار مدیریت سرمایه برای $${Math.round(rec.effectiveCapitalUsd).toLocaleString('en-US')} اعمال شد: ${rec.summaryFa} ✅`,
  });
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
      `SELECT id, mode, market_type, symbol, direction, entry_price, initial_quantity, remaining_quantity, margin_used, realized_pnl, leverage, signal_id, strategy_key, current_stop_loss, tp1, tp1_hit, tp2_hit, tp3_hit, risk_free_active, opened_at FROM trades WHERE user_id = ? AND status = 'OPEN'`
    ).bind(user.id).all<{
      id: string;
      mode: string;
      market_type?: MarketType;
      symbol: string;
      direction: Direction;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
      leverage?: number;
      signal_id?: string | null;
      strategy_key?: string | null;
      current_stop_loss?: string;
      tp1?: string;
      tp1_hit?: number;
      tp2_hit?: number;
      tp3_hit?: number;
      risk_free_active?: number;
      opened_at?: string;
    }>();

    for (const t of openTrades.results) {
      const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `stop_settle_${Date.now()}`, t.market_type ?? 'FUTURES');
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
      if (t.signal_id) {
        const roePct = (totalRealized / Math.max(0.01, Number(t.margin_used || 1))) * 100;
        await publishSignalClosedCard(c.env, {
          tradeId: t.id,
          userId: user.id,
          signalId: t.signal_id,
          symbol: t.symbol,
          direction: t.direction,
          leverage: Number(t.leverage || 10),
          mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
          strategyKey: t.strategy_key,
          entryPrice: t.entry_price,
          exitPrice: cls.filledPrice,
          stopLoss: t.current_stop_loss || '0',
          tp1: t.tp1 || '0',
          tp1Hit: Boolean(t.tp1_hit),
          tp2Hit: Boolean(t.tp2_hit),
          tp3Hit: Boolean(t.tp3_hit),
          trailingActive: Boolean(t.risk_free_active),
          pnlUsd: totalRealized,
          pnlPct: roePct,
          reason: 'BOT_STOP_SETTLE',
          openedAt: t.opened_at,
        }).catch(() => {});
      }
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

  const startedIso = cfg?.started_at ? (cfg.started_at.includes('T') ? cfg.started_at : cfg.started_at.replace(' ', 'T')) + 'Z' : '';
  const durationSec = startedIso ? Math.max(0, Math.floor((Date.now() - Date.parse(startedIso)) / 1000)) : 0;

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
    leverage?: number;
    signal_id?: string | null;
    strategy_key?: string | null;
    current_stop_loss?: string;
    tp1?: string;
    tp1_hit?: number;
    tp2_hit?: number;
    tp3_hit?: number;
    risk_free_active?: number;
    opened_at?: string;
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
    if (t.signal_id) {
      const roePct = (totalRealized / Math.max(0.01, Number(t.margin_used || 1))) * 100;
      await publishSignalClosedCard(c.env, {
        tradeId: t.id,
        userId: user.id,
        signalId: t.signal_id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: Number(t.leverage || 10),
        mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
        strategyKey: t.strategy_key,
        entryPrice: t.entry_price,
        exitPrice: cls.filledPrice,
        stopLoss: t.current_stop_loss || '0',
        tp1: t.tp1 || '0',
        tp1Hit: Boolean(t.tp1_hit),
        tp2Hit: Boolean(t.tp2_hit),
        tp3Hit: Boolean(t.tp3_hit),
        trailingActive: Boolean(t.risk_free_active),
        pnlUsd: totalRealized,
        pnlPct: roePct,
        reason: 'KILL_SWITCH',
        openedAt: t.opened_at,
      }).catch(() => {});
    }
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
    .bind(id, user.id).first<{ id: string; mode: string; market_type?: MarketType; symbol: string; direction: Direction; current_stop_loss: string; tp1: string }>();
  if (!row) return c.json({ error: 'Open trade not found' }, 404);

  const nextSl = body.stopLoss || row.current_stop_loss;
  const nextTp1 = body.tp1 || row.tp1;

  if (row.mode === 'LIVE' && (row.market_type ?? 'FUTURES') === 'FUTURES') {
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
      signal_id?: string | null;
      strategy_key?: string | null;
      mode: string;
      market_type?: MarketType;
      symbol: string;
      direction: Direction;
      leverage: number;
      entry_price: string;
      initial_quantity: string;
      remaining_quantity: string;
      margin_used: string;
      current_stop_loss: string;
      initial_stop_loss?: string;
      tp1: string;
      tp1_hit?: number;
      tp2_hit?: number;
      tp3_hit?: number;
      trailing_active?: number;
      risk_free_active?: number;
      opened_at?: string;
      realized_pnl: string;
    }>();
  if (!t) return c.json({ error: 'Open position not found' }, 404);

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
  const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `man_cls_${Date.now()}`, t.market_type ?? 'FUTURES');
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

  const pnlPct = Number(t.margin_used) > 0 ? (totalRealized / Number(t.margin_used)) * 100 : 0;
  await publishSignalClosedCard(c.env, {
    tradeId: t.id,
    userId: user.id,
    signalId: t.signal_id,
    symbol: t.symbol,
    direction: t.direction,
    leverage: t.leverage ?? 1,
    mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
    strategyKey: t.strategy_key,
    entryPrice: t.entry_price,
    exitPrice: cls.filledPrice,
    stopLoss: t.initial_stop_loss ?? t.current_stop_loss,
    tp1: t.tp1,
    tp1Hit: Boolean(t.tp1_hit || totalRealized > 0),
    tp2Hit: Boolean(t.tp2_hit),
    tp3Hit: Boolean(t.tp3_hit),
    trailingActive: Boolean(t.trailing_active || t.risk_free_active),
    trailingSl: t.current_stop_loss,
    pnlUsd: totalRealized,
    pnlPct,
    reason: 'MANUAL',
    openedAt: t.opened_at,
    closedAt: new Date().toISOString(),
  }).catch(() => {});

  await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Manual close ${t.symbol} @ ${cls.filledPrice} (PnL ${totalRealized.toFixed(2)})`, t.symbol);
  return c.json({ ok: true, exitPrice: cls.filledPrice, realizedPnl: totalRealized });
});

tradingRoutes.post('/orders/manual', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `order:${user.id}`, 30, 60);
  if (!rl.allowed) {
    return c.json({ ok: false, error: `تعداد سفارش‌ها زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const onboardingGate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
  if (!onboardingGate.ok) {
    return c.json({ ok: false, error: onboardingGate.error, code: onboardingGate.code }, 403);
  }
  const body = await c.req.json<{
    symbol: string;
    direction: Direction;
    orderType: 'MARKET' | 'LIMIT';
    marketType?: MarketType;
    marginMode?: MarginMode;
    marginPct?: number;
    limitPrice?: string;
    leverage: number;
    stopLoss: string;
    tp1: string;
    tp2?: string;
    tp3?: string;
    timeframe?: string;
  }>();

  const cfgRow = await c.env.DB.prepare('SELECT trading_mode, market_type, margin_pct, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ trading_mode: string; market_type?: MarketType; margin_pct: number; paper_balance: string }>();
  const marketType: MarketType = body.marketType ?? cfgRow?.market_type ?? 'FUTURES';
  const effectiveLeverage = marketType === 'SPOT' ? 1 : Math.max(1, Number(body.leverage || 1));

  if (marketType === 'SPOT' && body.direction === 'SHORT') {
    return c.json({ ok: false, error: 'در بازار اسپات امکان باز کردن پوزیشن Short مارجین وجود ندارد؛ فقط خرید (Buy / Long) یا بستن موجودی مجاز است.' }, 400);
  }

  if (body.orderType === 'LIMIT' && body.limitPrice && Number(body.limitPrice) > 0) {
    const activeRow = await c.env.DB.prepare(
      `SELECT provider FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    ).bind(user.id).first<{ provider: ExchangeProviderId }>();
    const bal = Number(cfgRow?.paper_balance ?? 10000);
    const pct = body.marginPct && Number.isFinite(body.marginPct) ? body.marginPct : (cfgRow?.margin_pct ?? 10);
    const rawQty = ((bal * (pct / 100)) * effectiveLeverage) / Number(body.limitPrice);
    const qty = rawQty >= 100 ? rawQty.toFixed(1) : rawQty >= 1 ? rawQty.toFixed(3) : rawQty.toFixed(5);
    const exProvider = cfgRow?.trading_mode === 'PAPER' ? 'paper' : (activeRow?.provider || 'paper');
    const id = randomId('ord');
    await c.env.DB.prepare(
      `INSERT INTO pending_orders (id, user_id, mode, exchange_provider, symbol, strategy_key, direction, order_type, price, quantity, leverage, stop_loss, tp1, tp2, tp3)
       VALUES (?, ?, ?, ?, ?, 'manual_limit', ?, 'LIMIT', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      cfgRow?.trading_mode ?? 'PAPER',
      exProvider,
      body.symbol.toUpperCase(),
      body.direction,
      body.limitPrice,
      qty,
      effectiveLeverage,
      body.stopLoss,
      body.tp1,
      body.tp2 ?? null,
      body.tp3 ?? null
    ).run();
    await logAudit(c.env.DB, user.id, 'ORDER', 'INFO', `Queued ${marketType} LIMIT ${body.direction} ${body.symbol} @ ${body.limitPrice}`, body.symbol);
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
      leverage: effectiveLeverage,
      tp1: body.tp1,
      tp2: body.tp2,
      tp3: body.tp3,
    },
    {
      forceBypassState: true,
      strategyKey: 'manual_terminal',
      marketType,
      orderType: body.orderType === 'LIMIT' ? 'LIMIT' : 'MARKET',
      marginPctOverride: body.marginPct,
    }
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
  const onboardingGate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
  if (!onboardingGate.ok) {
    return c.json({ error: onboardingGate.error, code: onboardingGate.code }, 403);
  }
  const body = await c.req.json<{ rawText?: string; signal?: Record<string, unknown>; executeNow?: boolean; source?: 'copytrade' | 'scanner' }>();
  const parsed = parseDollarinoSignal(body.signal ?? body.rawText ?? '');
  if (!parsed) return c.json({ error: 'Could not parse valid Dollarino signal' }, 400);

  const formatted = formatDollarinoSignal(parsed);
  const sigId = randomId('sig');
  const sigSource = body.source === 'scanner' ? 'strategy_scanner' : 'manual_test';
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
  ).bind(
    sigId,
    user.id,
    sigSource,
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

  const execRes = await executeSignalForUser(c.env, user.id, parsed, {
    signalId: sigId,
    forceBypassState: true,
    strategyKey: body.source === 'scanner' ? 'scanner_signal' : 'manual_signal',
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
    c.env.DB.prepare('SELECT mixer_weights_json, mixer_threshold, kbos_params_json, strategy_key, active_custom_strategy_id FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ mixer_weights_json?: string; mixer_threshold?: number; kbos_params_json?: string; strategy_key?: string; active_custom_strategy_id?: string | null }>(),
  ]);

  let customOverlays: {
    id: string;
    title: string;
    language: CustomStrategyLanguage;
    plots: Array<{ title: string; color: string; overlay: boolean; points: Array<{ time: number; value: number }> }>;
    markers: Array<{ time: number; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }>;
    latestSignal: unknown;
  } | null = null;

  const requestedCustomId = c.req.query('customStrategyId') || cfg?.active_custom_strategy_id;
  if (requestedCustomId) {
    const customRow = await c.env.DB.prepare(
      `SELECT id, name, language, code FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(requestedCustomId, user.id).first<{ id: string; name: string; language: CustomStrategyLanguage; code: string }>();
    if (customRow?.code) {
      const ev = evaluateCustomStrategy(customRow.language, customRow.code, candles, timeframe);
      if (ev.valid) {
        customOverlays = {
          id: customRow.id,
          title: customRow.name || ev.title,
          language: customRow.language,
          plots: ev.plots,
          markers: ev.markers,
          latestSignal: ev.latestSignal,
        };
      }
    }
  }

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
    customOverlays,
    mixer,
  });
});

tradingRoutes.get('/markets', async (c) => {
  const user = c.get('user');
  const requestedProvider = c.req.query('provider') as ExchangeProviderId | undefined;
  const requestedMarketType = (c.req.query('marketType') || 'FUTURES').toUpperCase() === 'SPOT' ? 'SPOT' : 'FUTURES';
  const q = (c.req.query('q') || '').trim().toUpperCase();
  const sort = c.req.query('sort') || 'volume';
  const offset = Math.max(0, Number(c.req.query('offset') || 0) || 0);
  const limitParam = c.req.query('limit');
  const limit = limitParam && Number(limitParam) > 0 ? Math.min(2000, Number(limitParam)) : 0;

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
  let markets = await getExchangeMarkets(provider, proxyConfig, requestedMarketType);

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

  const totalCount = markets.length;
  const sliced = limit > 0 ? markets.slice(offset, offset + limit) : markets;

  return c.json({
    provider,
    marketType: requestedMarketType,
    label: activeRow?.label || provider.toUpperCase(),
    totalCount,
    markets: sliced,
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
    const count = Math.min(20, Math.max(6, body.limit ?? 14));
    const orderedPool = Array.from(new Set([...MAJOR_LIQUID_COINS, ...allMarkets.map((m) => m.symbol)]));
    symbols = orderedPool.slice(0, count);
  }

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const now = Date.now();

  const results = await Promise.all(
    symbols.map(async (sym) => {
      const [candlesRaw, htfRaw] = await Promise.all([
        adapter.getKlines(sym, tf, 360),
        adapter.getKlines(sym, htfTf, 140),
      ]);
      const candles = selectClosedCandles(candlesRaw, tf, now);
      const htfCandles = selectClosedCandles(htfRaw, htfTf, now);
      const evalLtf = candles.length >= 40 ? candles : candlesRaw;
      const evalHtf = htfCandles.length >= 25 ? htfCandles : htfRaw;

      const outputs = computeStrategySignals(
        strategyKey,
        evalLtf,
        evalHtf,
        tf,
        htfTf,
        { kbosParams, mixerWeights, mixerThreshold }
      );
      const currentClose = evalLtf[evalLtf.length - 1]?.close ?? 0;
      let chosen = outputs[outputs.length - 1];
      let barsAgo = 0;

      if ((!chosen || chosen.signal === 'NONE') && outputs.length >= 6) {
        for (let lb = 2; lb <= 6; lb++) {
          const cand = outputs[outputs.length - lb];
          if (cand && cand.signal !== 'NONE' && cand.price > 0 && currentClose > 0 && cand.stopLoss && cand.tp1) {
            const driftPct = Math.abs(currentClose - cand.price) / cand.price;
            const slValid = cand.signal === 'LONG' ? currentClose > cand.stopLoss : currentClose < cand.stopLoss;
            const tp1NotHit = cand.signal === 'LONG' ? currentClose < cand.tp1 : currentClose > cand.tp1;
            if (driftPct <= 0.015 && slValid && tp1NotHit) {
              chosen = cand;
              barsAgo = lb - 1;
              break;
            }
          }
        }
      }

      let realHtfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = chosen?.trend ?? 'NEUTRAL';
      if (evalHtf.length >= 25) {
        const hc = evalHtf.map((k) => k.close);
        const h20 = ema(hc, 20);
        const h50 = ema(hc, 50);
        const f = h20[evalHtf.length - 1];
        const s = h50[evalHtf.length - 1];
        if (Number.isFinite(f) && Number.isFinite(s)) {
          realHtfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
        }
      }
      const mix = evaluateSignalMixerAtBar(evalLtf, evalLtf.length - 1, realHtfTrend, mixerWeights, mixerThreshold);
      const signalCard = chosen && chosen.signal !== 'NONE'
        ? strategyOutputToDollarinoSignal(sym, tf, Math.max(1, cfgRow?.max_leverage ?? 5), chosen)
        : null;
      return {
        symbol: sym,
        price: currentClose,
        trend: realHtfTrend,
        rsi: Number((chosen?.rsi ?? 50).toFixed(1)),
        mixerConfidence: mix.confidence,
        mixerDirection: mix.direction,
        barsAgo: signalCard ? barsAgo : null,
        signal: signalCard,
        formatted: signalCard ? formatDollarinoSignal(signalCard) : null,
      };
    })
  );

  return c.json({ provider, strategyKey, timeframe: tf, results });
});

tradingRoutes.post('/ai-agent/run', async (c) => {
  const user = c.get('user');
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

tradingRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(user.id).all().catch(() => ({ results: [] }));
  const unread = rows.results.filter((n) => (n as { is_read: number }).is_read === 0).length;
  return c.json({ notifications: rows.results, unread });
});

tradingRoutes.post('/notifications/read', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).bind(user.id).run().catch(() => {});
  return c.json({ ok: true });
});

tradingRoutes.get('/events/snapshot', async (c) => {
  const user = c.get('user');
  const [cfg, openCount, unreadNtf, latestSig] = await Promise.all([
    c.env.DB.prepare(`SELECT bot_state, trading_mode, paper_balance FROM bot_configs WHERE user_id = ?`).bind(user.id).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT id, symbol, direction, created_at FROM signals ORDER BY created_at DESC LIMIT 1`).first(),
  ]);
  return c.json({
    events: [
      { type: 'balance.updated', data: { paperBalance: (cfg as { paper_balance?: string } | null)?.paper_balance ?? '0' } },
      { type: 'position.updated', data: { openCount: openCount?.cnt ?? 0 } },
      { type: 'notification.created', data: { unread: unreadNtf?.cnt ?? 0 } },
      ...(latestSig ? [{ type: 'signal.received', data: latestSig }] : []),
    ],
    timestamp: new Date().toISOString(),
  });
});

// =========================================================================
// Tamper-Proof Server-Signed Profit Cards (backed strictly by settled D1 trades)
// =========================================================================

export function buildVerifiedCardCanonicalPayload(card: {
  id: string;
  userId: string;
  mode: string;
  period: string;
  startDate: string;
  endDate: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  exchangeProvider: string;
  strategyName: string;
  tradesHash: string;
  issuedAt: string;
}): string {
  return [
    card.id,
    card.userId,
    card.mode,
    card.period,
    card.startDate,
    card.endDate,
    String(card.tradesCount),
    card.winRate.toFixed(2),
    card.netPnlUsd.toFixed(2),
    card.roiPct.toFixed(2),
    card.profitFactor.toFixed(2),
    card.exchangeProvider,
    card.strategyName,
    card.tradesHash,
    card.issuedAt,
  ].join('|');
}

tradingRoutes.get('/cards', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM verified_profit_cards WHERE user_id = ? ORDER BY issued_at DESC LIMIT 20`
  ).bind(user.id).all();
  return c.json({ cards: rows.results });
});

tradingRoutes.post('/cards/issue', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    mode?: 'LIVE' | 'PAPER';
    period?: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE';
    tradeId?: string;
    cardStyle?: 'dark' | 'gold' | 'emerald';
  }>().catch(() => ({} as { mode?: 'LIVE' | 'PAPER'; period?: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE'; tradeId?: string; cardStyle?: 'dark' | 'gold' | 'emerald' }));

  const requestedMode = body.mode === 'PAPER' ? 'PAPER' : 'LIVE';
  const period = body.period && ['24H', '7D', '30D', '1Y', 'ALL', 'TRADE'].includes(body.period) ? body.period : '7D';

  const whereClause = [`user_id = ?`, `status = 'CLOSED'`, `mode = ?`];
  const binds: unknown[] = [user.id, requestedMode];

  if (period === 'TRADE') {
    if (!body.tradeId) {
      return c.json({ error: 'شناسه معامله برای صدور کارت تک‌معامله الزامی است.' }, 400);
    }
    whereClause.push(`id = ?`);
    binds.push(body.tradeId);
  } else if (period === '24H') {
    whereClause.push(`closed_at >= datetime('now', '-24 hours')`);
  } else if (period === '7D') {
    whereClause.push(`closed_at >= datetime('now', '-7 days')`);
  } else if (period === '30D') {
    whereClause.push(`closed_at >= datetime('now', '-30 days')`);
  } else if (period === '1Y') {
    whereClause.push(`closed_at >= datetime('now', '-365 days')`);
  }

  const tradesRes = await c.env.DB.prepare(
    `SELECT id, symbol, direction, exchange_provider, strategy_key, realized_pnl, margin_used, closed_at
     FROM trades WHERE ${whereClause.join(' AND ')} ORDER BY closed_at ASC`
  ).bind(...binds).all<{
    id: string;
    symbol: string;
    direction: string;
    exchange_provider: string;
    strategy_key: string | null;
    realized_pnl: string;
    margin_used: string;
    closed_at: string;
  }>();

  const trades = tradesRes.results;
  if (!trades.length) {
    return c.json({
      error:
        requestedMode === 'LIVE'
          ? 'هنوز هیچ معامله واقعی (Live) بسته شده‌ای در این بازه زمانی برای حساب شما ثبت نشده است. کارت سود تاییدشده فقط بر اساس معاملات واقعی تسویه‌شده صادر می‌شود.'
          : 'هیچ معامله شبیه‌ساز بسته شده‌ای در این بازه زمانی ثبت نشده است.',
      code: 'NO_SETTLED_TRADES',
    }, 400);
  }

  let netPnlUsd = 0;
  let wins = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let totalMarginUsed = 0;
  const providerCounts = new Map<string, number>();
  const strategyCounts = new Map<string, number>();

  for (const t of trades) {
    const pnl = Number(t.realized_pnl || 0);
    const margin = Math.max(0, Number(t.margin_used || 0));
    netPnlUsd += pnl;
    totalMarginUsed += margin;
    if (pnl > 0) {
      wins++;
      grossWins += pnl;
    } else if (pnl < 0) {
      grossLosses += Math.abs(pnl);
    }
    const prov = (t.exchange_provider || 'TOOBIT').toUpperCase();
    providerCounts.set(prov, (providerCounts.get(prov) ?? 0) + 1);
    const strat = t.strategy_key || 'dollarino_v01';
    strategyCounts.set(strat, (strategyCounts.get(strat) ?? 0) + 1);
  }

  const tradesCount = trades.length;
  const winRate = Number(((wins / tradesCount) * 100).toFixed(2));
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 99 : 0;

  let baseCapital = totalMarginUsed;
  if (requestedMode === 'PAPER') {
    const cfgRow = await c.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ paper_balance: string }>();
    const currentPaper = Number(cfgRow?.paper_balance ?? 10000);
    baseCapital = Math.max(totalMarginUsed, Math.max(100, currentPaper - netPnlUsd));
  } else {
    const avgMargin = totalMarginUsed / Math.max(1, tradesCount);
    baseCapital = Math.max(avgMargin, totalMarginUsed);
  }
  const roiPct = baseCapital > 0 ? Number(((netPnlUsd / baseCapital) * 100).toFixed(2)) : 0;

  const topProvider = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'TOOBIT';
  const topStrategyRaw = Array.from(strategyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'dollarino_v01';
  const topStrategy = resolveEngineDisplayLabel(topStrategyRaw);
  const startDate = trades[0]!.closed_at;
  const endDate = trades[trades.length - 1]!.closed_at;

  const tradesDigestInput = trades.map((t) => `${t.id}:${t.realized_pnl}:${t.closed_at}`).join(';');
  const tradesHash = await sha256Hex(tradesDigestInput);

  const cardId = `DLR-${randomId('').slice(0, 10).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const cardSecret = c.env.SESSION_JWT_SECRET || c.env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';

  const canonical = buildVerifiedCardCanonicalPayload({
    id: cardId,
    userId: user.id,
    mode: requestedMode,
    period,
    startDate,
    endDate,
    tradesCount,
    winRate,
    netPnlUsd: Number(netPnlUsd.toFixed(2)),
    roiPct,
    profitFactor,
    exchangeProvider: topProvider,
    strategyName: topStrategy,
    tradesHash,
    issuedAt,
  });
  const hmacSignature = await hmacSha256Hex(canonical, cardSecret);

  const payloadSnapshot = JSON.stringify({
    cardStyle: body.cardStyle || 'dark',
    symbol: period === 'TRADE' ? trades[0]!.symbol : undefined,
    direction: period === 'TRADE' ? trades[0]!.direction : undefined,
    isVerifiedReal: requestedMode === 'LIVE',
    grossWins: Number(grossWins.toFixed(2)),
    grossLosses: Number(grossLosses.toFixed(2)),
    tradesHash,
  });

  await c.env.DB.prepare(
    `INSERT INTO verified_profit_cards (
      id, user_id, mode, period, start_date, end_date,
      trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor,
      exchange_provider, strategy_name, payload_json, hmac_signature, issued_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    cardId,
    user.id,
    requestedMode,
    period,
    startDate,
    endDate,
    tradesCount,
    winRate,
    Number(netPnlUsd.toFixed(2)),
    roiPct,
    profitFactor,
    topProvider,
    topStrategy,
    payloadSnapshot,
    hmacSignature,
    issuedAt
  ).run();

  return c.json({
    ok: true,
    card: {
      id: cardId,
      userId: user.id,
      displayName: user.username,
      mode: requestedMode,
      isVerifiedReal: requestedMode === 'LIVE',
      period,
      startDate,
      endDate,
      tradesCount,
      winRate,
      netPnlUsd: Number(netPnlUsd.toFixed(2)),
      roiPct,
      profitFactor,
      exchangeProvider: topProvider,
      strategyName: topStrategy,
      cardStyle: body.cardStyle || 'dark',
      symbol: period === 'TRADE' ? trades[0]!.symbol : undefined,
      direction: period === 'TRADE' ? trades[0]!.direction : undefined,
      hmacSignature,
      verifyPath: `/verify-card/${cardId}`,
      issuedAt,
    },
  });
});

tradingRoutes.get('/cards/:id/image', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const layout = c.req.query('layout') === 'vertical' ? 'vertical' : 'horizontal';
  const format = c.req.query('format') === 'svg' ? 'svg' : 'png';

  const row = await c.env.DB.prepare(
    `SELECT vpc.*, u.username FROM verified_profit_cards vpc JOIN users u ON u.id = vpc.user_id WHERE vpc.id = ? AND vpc.user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{
    id: string;
    username: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    issued_at: string;
  }>();

  if (!row) return c.json({ error: 'Profit card not found' }, 404);

  const renderInput = {
    cardId: row.id,
    displayName: row.username || 'Dollarino Trader',
    mode: row.mode,
    period: row.period,
    tradesCount: row.trades_count,
    winRate: row.win_rate,
    netPnlUsd: row.net_pnl_usd,
    roiPct: row.roi_pct,
    profitFactor: row.profit_factor,
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    issuedAt: row.issued_at,
    layout,
  } as const;

  if (format === 'png') {
    const png = await renderProfitCardPng(renderInput);
    if (png) {
      return new Response(png as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="dollarino-profit-${row.id}-${layout}.png"`,
          'Cache-Control': 'private, max-age=300',
        },
      });
    }
  }

  const svg = buildProfitCardSvg(renderInput);
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
});

tradingRoutes.post('/cards/:id/send-telegram', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ layout?: 'horizontal' | 'vertical' }>().catch(() => ({ layout: 'horizontal' as const }));
  if (!user.telegramId) {
    return c.json({ error: 'حساب شما هنوز به تلگرام متصل نیست.' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT vpc.*, u.username FROM verified_profit_cards vpc JOIN users u ON u.id = vpc.user_id WHERE vpc.id = ? AND vpc.user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{
    id: string;
    username: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    issued_at: string;
  }>();

  if (!row) return c.json({ error: 'Card not found' }, 404);
  const ok = await publishProfitCardToTelegram(
    c.env,
    user.telegramId,
    {
      id: row.id,
      displayName: row.username || 'Dollarino Trader',
      mode: row.mode,
      period: row.period,
      tradesCount: row.trades_count,
      winRate: row.win_rate,
      netPnlUsd: row.net_pnl_usd,
      roiPct: row.roi_pct,
      profitFactor: row.profit_factor,
      exchangeProvider: row.exchange_provider,
      strategyName: row.strategy_name,
      issuedAt: row.issued_at,
    },
    body.layout === 'vertical' ? 'vertical' : 'horizontal'
  );
  return c.json({ ok });
});

// =========================================================================
// Pro Quant Strategy IDE: Pine Script, Python & Visual Strategy Endpoints
// =========================================================================

tradingRoutes.get('/strategies', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM user_strategies WHERE user_id = ? ORDER BY updated_at DESC`
  ).bind(user.id).all<{
    id: string;
    user_id: string;
    name: string;
    description: string;
    language: CustomStrategyLanguage;
    code: string;
    timeframe: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>().catch(() => ({ results: [] }));

  return c.json({
    samples: SAMPLE_CUSTOM_STRATEGIES,
    userStrategies: rows.results,
  });
});

tradingRoutes.post('/strategies/evaluate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    language?: CustomStrategyLanguage;
    code?: string;
    symbol?: string;
    timeframe?: Timeframe;
  }>().catch(() => ({} as { language?: CustomStrategyLanguage; code?: string; symbol?: string; timeframe?: Timeframe }));

  const langMode: CustomStrategyLanguage =
    body.language === 'python' || body.language === 'visual' ? body.language : 'pine';
  const code = String(body.code || '');
  const symbol = normalizeCanonicalSymbol(body.symbol || 'BTCUSDT');
  const tf = (body.timeframe || '15m') as Timeframe;

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const candles = await adapter.getKlines(symbol, tf, 360);
  const res = evaluateCustomStrategy(langMode, code, candles, tf);

  let backtestSummary = null;
  if (res.valid && candles.length >= 40) {
    const bt = runBacktest(candles, [], {
      symbol,
      strategyKey: langMode === 'pine' ? 'custom_pine' : langMode === 'python' ? 'custom_python' : 'custom_visual',
      timeframe: tf,
      initialBalance: 10000,
      marginPct: 10,
      leverage: 5,
      tp1ClosePct: 40,
      tp2ClosePct: 30,
      tp3ClosePct: 30,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: true,
      customSignals: res.signals,
    });
    backtestSummary = {
      metrics: bt.metrics,
      equityCurve: bt.equityCurve,
      trades: bt.trades.slice(0, 40),
    };
  }

  return c.json({
    valid: res.valid,
    title: res.title,
    language: res.language,
    errors: res.errors,
    warnings: res.warnings,
    plots: res.plots,
    markers: res.markers,
    latestSignal: res.latestSignal,
    candles,
    backtestSummary,
  });
});

tradingRoutes.post('/strategies', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    id?: string;
    name?: string;
    description?: string;
    language?: CustomStrategyLanguage;
    code?: string;
    timeframe?: Timeframe;
  }>().catch(() => ({} as { id?: string; name?: string; description?: string; language?: CustomStrategyLanguage; code?: string; timeframe?: Timeframe }));

  const langMode: CustomStrategyLanguage =
    body.language === 'python' || body.language === 'visual' ? body.language : 'pine';
  const name = String(body.name || 'Custom Strategy').trim().slice(0, 80);
  const description = String(body.description || '').trim().slice(0, 240);
  const code = String(body.code || '');
  const tf = String(body.timeframe || '15m');

  if (!code.trim()) {
    return c.json({ error: 'کد استراتژی نمی‌تواند خالی باشد.' }, 400);
  }

  if (body.id) {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(body.id, user.id).first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE user_strategies SET name = ?, description = ?, language = ?, code = ?, timeframe = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).bind(name, description, langMode, code, tf, existing.id, user.id).run();
      const row = await c.env.DB.prepare(`SELECT * FROM user_strategies WHERE id = ?`).bind(existing.id).first();
      return c.json({ ok: true, strategy: row });
    }
  }

  const id = randomId('strat');
  await c.env.DB.prepare(
    `INSERT INTO user_strategies (id, user_id, name, description, language, code, timeframe, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, user.id, name, description, langMode, code, tf).run();

  const row = await c.env.DB.prepare(`SELECT * FROM user_strategies WHERE id = ?`).bind(id).first();
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Saved custom ${langMode.toUpperCase()} strategy: ${name}`);
  return c.json({ ok: true, strategy: row });
});

tradingRoutes.delete('/strategies/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM user_strategies WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  await c.env.DB.prepare(
    `UPDATE bot_configs SET active_custom_strategy_id = NULL, strategy_key = CASE WHEN active_custom_strategy_id = ? THEN 'dollarino_v01' ELSE strategy_key END WHERE user_id = ?`
  ).bind(id, user.id).run();
  return c.json({ ok: true });
});

tradingRoutes.post('/strategies/:id/activate', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, name, language, timeframe FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(id, user.id).first<{ id: string; name: string; language: CustomStrategyLanguage; timeframe: string }>();
  if (!row) return c.json({ error: 'Custom strategy not found' }, 404);

  const strategyKey = row.language === 'pine' ? 'custom_pine' : row.language === 'python' ? 'custom_python' : 'custom_visual';
  await toggleTradingEngine(c.env.DB, user.id, 'STRATEGY', true, {
    strategyKey,
    customStrategyId: row.id,
    auditSource: 'custom_strategy_activate',
  });
  await c.env.DB.prepare(
    `UPDATE bot_configs SET strategy_key = ?, active_custom_strategy_id = ?, entry_timeframe = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).bind(strategyKey, row.id, row.timeframe || '15m', user.id).run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Activated custom ${row.language.toUpperCase()} strategy "${row.name}" for autonomous execution`);
  return c.json({ ok: true, strategyKey, activeCustomStrategyId: row.id, name: row.name });
});

// =========================================================================
// Live AI Signal Scanner & Instant Autonomous Trigger
// =========================================================================
tradingRoutes.post('/ai-scan-now', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `aiscan:${user.id}`, 10, 180);
  if (!rl.allowed) {
    return c.json({ ok: false, error: `لطفاً برای اسکن مجدد هوشمند ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = await c.req.json<{
    symbol?: string;
    symbols?: string[];
    timeframe?: Timeframe;
    autoExecute?: boolean;
  }>().catch(() => ({} as { symbol?: string; symbols?: string[]; timeframe?: Timeframe; autoExecute?: boolean }));

  const cfg = await c.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<UserBotConfigRow>();

  const tf: Timeframe = (body.timeframe || cfg?.entry_timeframe || '15m') as Timeframe;
  const htf: Timeframe = cfg?.higher_timeframe || (tf === '5m' ? '15m' : tf === '15m' ? '1h' : '4h');
  const requestedList = Array.isArray(body.symbols) && body.symbols.length
    ? body.symbols.map((s) => normalizeCanonicalSymbol(s)).slice(0, 6)
    : body.symbol
      ? [normalizeCanonicalSymbol(body.symbol)]
      : [cfg?.symbol || 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

  const uniqueSymbols = Array.from(new Set(requestedList));
  const { adapter } = await resolveUserExchangeAdapter(
    c.env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  let canExecute = false;
  if (body.autoExecute) {
    const onboardingGate = await checkPreTradeOnboardingGate(c.env.DB, user.id);
    if (!onboardingGate.ok) {
      return c.json({ ok: false, error: onboardingGate.error, code: onboardingGate.code }, 403);
    }
    canExecute = true;
  }

  const results = await Promise.all(
    uniqueSymbols.map(async (sym) => {
      try {
        const [ltfRaw, htfRaw] = await Promise.all([
          adapter.getKlines(sym, tf, 180),
          adapter.getKlines(sym, htf, 90).catch(() => []),
        ]);
        const ltfClosed = selectClosedCandles(ltfRaw, tf);
        const htfClosed = selectClosedCandles(htfRaw, htf);
        const decision = await runAutonomousAITrader(c.env, user.id, {
          symbol: sym,
          timeframe: tf,
          higherTimeframe: htf,
          candles: ltfClosed.length >= 35 ? ltfClosed : ltfRaw,
          htfCandles: htfClosed.length >= 25 ? htfClosed : htfRaw,
          maxLeverage: cfg?.market_type === 'SPOT' ? 1 : Math.max(1, cfg?.max_leverage ?? 10),
          minConfidence: cfg?.ai_min_confidence ?? 60,
          bypassCache: true,
        });

        let signalId: string | null = null;
        let executed = false;
        let executeNote = '';

        if (decision.ok && (decision.action === 'LONG' || decision.action === 'SHORT')) {
          signalId = randomId('sig');
          const sigObj = {
            symbol: sym,
            direction: decision.action as Direction,
            timeframe: tf,
            price: String(decision.entry),
            stopLoss: String(decision.stopLoss),
            leverage: cfg?.market_type === 'SPOT' ? 1 : decision.leverage,
            tp1: String(decision.tp1),
            tp2: String(decision.tp2),
            tp3: String(decision.tp3),
            channelHandle: '@Dollarino_official',
            engineKey: 'ai_autonomous_agent',
            engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
            reason: decision.thesis,
          };
          await c.env.DB.prepare(
            `INSERT INTO signals (id, user_id, symbol, direction, timeframe, price, stop_loss, tp1, tp2, tp3, leverage, raw_text, source, engine_source, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_agent', 'ai_autonomous_agent', 'NEW')`
          ).bind(
            signalId,
            user.id,
            sym,
            sigObj.direction,
            tf,
            sigObj.price,
            sigObj.stopLoss,
            sigObj.tp1,
            sigObj.tp2,
            sigObj.tp3,
            sigObj.leverage,
            formatDollarinoSignal(sigObj)
          ).run().catch(() => {});

          if (canExecute && decision.confidence >= (cfg?.ai_min_confidence ?? 60)) {
            const execRes = await executeSignalForUser(c.env, user.id, sigObj, {
              signalId,
              strategyKey: 'ai_autonomous_agent',
              aiConfidence: decision.confidence,
              aiReasoning: decision.thesis,
              marketType: cfg?.market_type ?? 'FUTURES',
            }).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'Execution skipped' }));
            executed = Boolean(execRes.ok);
            executeNote = ('error' in execRes ? execRes.error : '') || ('tradeId' in execRes && execRes.tradeId ? `Trade #${execRes.tradeId}` : '');
            if (executed) {
              await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(signalId).run().catch(() => {});
            }
          }
        }

        await logAudit(
          c.env.DB,
          user.id,
          'AI_AGENT',
          decision.ok ? 'INFO' : 'WARN',
          `[اسکن فوری AI] ${sym} (${tf}): ${decision.action} (${decision.confidence}%) — ${decision.thesis}`,
          sym,
          decision
        ).catch(() => {});

        return {
          symbol: sym,
          timeframe: tf,
          signalId,
          executed,
          executeNote,
          ...decision,
        };
      } catch (err) {
        return {
          symbol: sym,
          timeframe: tf,
          ok: false,
          action: 'HOLD' as const,
          confidence: 0,
          entry: 0,
          stopLoss: 0,
          tp1: 0,
          tp2: 0,
          tp3: 0,
          leverage: 1,
          rrRatio: 0,
          thesis: err instanceof Error ? err.message : 'Scan failed',
          invalidation: 'Retry',
          executed: false,
        };
      }
    })
  );

  return c.json({ ok: true, results });
});

// =========================================================================
// Live Price Alerts (Web + Telegram Trigger via TradingBotCoordinator)
// =========================================================================
tradingRoutes.get('/alerts', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM price_alerts WHERE user_id = ? ORDER BY is_active DESC, created_at DESC LIMIT 40`
  ).bind(user.id).all().catch(() => ({ results: [] }));
  return c.json({ alerts: rows.results });
});

tradingRoutes.post('/alerts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    symbol?: string;
    condition?: 'ABOVE' | 'BELOW';
    targetPrice?: number;
    note?: string;
  }>().catch(() => ({} as { symbol?: string; condition?: 'ABOVE' | 'BELOW'; targetPrice?: number; note?: string }));

  const symbol = normalizeCanonicalSymbol(body.symbol || 'BTCUSDT');
  const targetPrice = Number(body.targetPrice);
  const condition = body.condition === 'BELOW' ? 'BELOW' : 'ABOVE';
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return c.json({ error: 'قیمت هدف معتبر نیست' }, 400);
  }

  const id = randomId('alrt');
  await c.env.DB.prepare(
    `INSERT INTO price_alerts (id, user_id, symbol, condition, target_price, note, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, user.id, symbol, condition, targetPrice, (body.note || '').trim().slice(0, 140) || null).run();

  const doId = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
  await c.env.TRADING_BOT_DO.get(doId).fetch('https://do/start').catch(() => {});

  const row = await c.env.DB.prepare(`SELECT * FROM price_alerts WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, alert: row }, 201);
});

tradingRoutes.delete('/alerts/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM price_alerts WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return c.json({ ok: true });
});

// =========================================================================
// V11.2 Personal Account Notes & AI Actionable Suggestions (Portfolio Journal)
// =========================================================================
async function ensureAccountNotesTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS account_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'NOTE',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run()
    .catch(() => {});
}

tradingRoutes.get('/notes', async (c) => {
  const user = c.get('user');
  await ensureAccountNotesTable(c.env.DB);
  const rows = await c.env.DB.prepare(
    `SELECT id, title, content, category, created_at FROM account_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`
  )
    .bind(user.id)
    .all<{ id: string; title: string; content: string; category: string; created_at: string }>()
    .catch(() => ({ results: [] }));
  return c.json({ ok: true, notes: rows.results });
});

tradingRoutes.post('/notes', async (c) => {
  const user = c.get('user');
  await ensureAccountNotesTable(c.env.DB);
  const body = await c.req
    .json<{ title?: string; content?: string; category?: string }>()
    .catch(() => ({} as { title?: string; content?: string; category?: string }));
  const content = String(body.content || '').trim().slice(0, 1500);
  if (!content) return c.json({ error: 'متن یادداشت نمی‌تواند خالی باشد.' }, 400);
  const title = String(body.title || '').trim().slice(0, 120);
  const category = ['NOTE', 'STRATEGY', 'AI_ADVICE'].includes(String(body.category || '').toUpperCase())
    ? String(body.category).toUpperCase()
    : 'NOTE';
  const id = randomId('note');
  await c.env.DB.prepare(
    `INSERT INTO account_notes (id, user_id, title, content, category) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, user.id, title, content, category)
    .run();
  const note = await c.env.DB.prepare(`SELECT id, title, content, category, created_at FROM account_notes WHERE id = ?`)
    .bind(id)
    .first();
  return c.json({ ok: true, note }, 201);
});

tradingRoutes.delete('/notes/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await ensureAccountNotesTable(c.env.DB);
  await c.env.DB.prepare(`DELETE FROM account_notes WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return c.json({ ok: true });
});


