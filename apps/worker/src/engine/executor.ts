import {
  computeDynamicRecommendedSettings,
  evaluateRiskGates,
  quantizeDown,
  resolveEffectiveBotCapital,
  type BotConfig,
  type Direction,
  type DirectionMode,
  type DollarinoSignal,
  type ExecutionMode,
  type MarketType,
  type StrategyKey,
  type Timeframe,
  type TradingMode,
} from '@dollarino/core';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { decryptVaultJson, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { TelegramBotClient } from '../telegram/client.js';
import { resolveTelegramBotToken } from '../telegram/token.js';
import { formatTradeOpenedCard } from '../telegram/formatter.js';
import { maybePromptCopyTraderOnNewTrade, publishSignalClosedCard, publishSystemLogEvent, publishTransactionEvent } from '../telegram/publisher.js';
import { checkLiveFeeEnforcement, recordProfitShareServerFee } from '../services/server-fee.js';
import { checkPreTradeOnboardingGate } from './onboarding-gate.js';

export interface UserBotConfigRow {
  user_id: string;
  bot_state: 'STOPPED' | 'RUNNING_PAPER' | 'RUNNING_LIVE' | 'PAUSED_DAILY_LOSS';
  trading_mode: TradingMode;
  trading_mode_selected?: number;
  market_type?: MarketType;
  direction_mode?: DirectionMode;
  hedge_mode?: number;
  trade_execution_mode: ExecutionMode;
  notifications_enabled: number;
  symbol: string;
  strategy_key: StrategyKey;
  entry_timeframe: Timeframe;
  higher_timeframe: Timeframe;
  margin_pct: number;
  use_signal_leverage: number;
  max_leverage: number;
  tp1_close_pct: number;
  tp2_close_pct: number;
  tp3_close_pct: number;
  auto_breakeven_on_tp1: number;
  move_sl_to_tp1_on_tp2: number;
  daily_max_loss_pct: number;
  max_open_positions: number;
  block_weekends: number;
  macro_blackout: number;
  ai_gate_enabled: number;
  ai_min_confidence: number;
  webhook_secret: string;
  signal_channel_handle: string;
  paper_balance: string;
  kbos_params_json?: string;
  risk_profile_json?: string;
  mixer_weights_json?: string;
  mixer_threshold?: number;
  trailing_stop_enabled?: number;
  trailing_stop_pct?: number;
  trail_after_tp1?: number;
  auto_scan_top?: number;
  scan_scope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
  allow_auto_flip?: number;
  allow_pyramiding?: number;
  watchlist_json?: string;
  started_at?: string | null;
  active_custom_strategy_id?: string | null;
  active_engines_json?: string | null;
  custom_paper_balance?: number | null;
  sniper_enabled?: number;
  sniper_budget_usd?: number;
  sniper_min_safety_score?: number;
  sniper_networks_json?: string | null;
  sniper_target_type?: 'BOTH' | 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME';
  sniper_min_liquidity_usd?: number;
  sniper_max_pair_age_hours?: number;
  sniper_max_pair_age_minutes?: number;
  sniper_advanced_filters_json?: string | null;
  sniper_max_tax_pct?: number;
  sniper_tp_pct?: number;
  sniper_sl_pct?: number;
  sniper_trailing_enabled?: number;
  sniper_trailing_pct?: number;
  sniper_max_open_positions?: number;
  sniper_auto_execute?: number;
  sniper_slippage_pct?: number;
  bot_budget_mode?: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
  bot_budget_usd?: number;
  bot_budget_pct?: number;
  notification_prefs_json?: string;
  display_currency?: 'USD' | 'IRT';
}

export function rowToBotConfig(r: UserBotConfigRow): BotConfig {
  let kbosParams: BotConfig['kbosParams'];
  try {
    kbosParams = r.kbos_params_json ? JSON.parse(r.kbos_params_json) : undefined;
  } catch {
    kbosParams = undefined;
  }
  let mixerWeights: BotConfig['mixerWeights'];
  try {
    mixerWeights = r.mixer_weights_json ? JSON.parse(r.mixer_weights_json) : undefined;
  } catch {
    mixerWeights = undefined;
  }
  return {
    tradingMode: r.trading_mode,
    marketType: r.market_type ?? 'FUTURES',
    directionMode: r.direction_mode ?? 'BOTH',
    hedgeMode: Boolean(r.hedge_mode ?? 0),
    executionMode: r.trade_execution_mode,
    symbol: r.symbol,
    strategyKey: r.strategy_key,
    entryTimeframe: r.entry_timeframe,
    higherTimeframe: r.higher_timeframe,
    marginPct: r.margin_pct,
    useSignalLeverage: Boolean(r.use_signal_leverage),
    maxLeverage: r.max_leverage,
    tp1ClosePct: r.tp1_close_pct,
    tp2ClosePct: r.tp2_close_pct,
    tp3ClosePct: r.tp3_close_pct,
    autoBreakevenOnTp1: Boolean(r.auto_breakeven_on_tp1),
    moveSlToTp1OnTp2: Boolean(r.move_sl_to_tp1_on_tp2),
    trailingStopEnabled: Boolean(r.trailing_stop_enabled ?? 1),
    trailingStopPct: r.trailing_stop_pct ?? 1.2,
    trailAfterTp1: Boolean(r.trail_after_tp1 ?? 1),
    dailyMaxLossPct: r.daily_max_loss_pct,
    maxOpenPositions: r.max_open_positions,
    blockWeekends: Boolean(r.block_weekends),
    macroBlackout: Boolean(r.macro_blackout),
    aiGateEnabled: Boolean(r.ai_gate_enabled),
    aiMinConfidence: r.ai_min_confidence,
    signalChannelHandle: r.signal_channel_handle || '',
    mixerThreshold: r.mixer_threshold ?? 65,
    mixerWeights,
    kbosParams,
  };
}

export async function logAudit(
  db: D1Database,
  userId: string,
  category: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  symbol?: string,
  details?: unknown
) {
  await db.prepare(
    `INSERT INTO audit_logs (id, user_id, category, level, symbol, message, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    randomId('log'),
    userId,
    category,
    level,
    symbol ?? null,
    message,
    details ? JSON.stringify(details) : null
  ).run();
}

export async function notifyUserTelegram(
  env: Env,
  userId: string,
  text: string,
  inlineKeyboard?: Array<
    Array<{ text: string; callback_data?: string; url?: string; web_app?: { url: string }; style?: 'primary' | 'success' | 'danger' }>
  >,
  options?: { bypassNotificationsPref?: boolean }
) {
  try {
    const user = await env.DB.prepare('SELECT telegram_id FROM users WHERE id = ?')
      .bind(userId).first<{ telegram_id: string | null }>();
    if (!user?.telegram_id) return;

    if (!options?.bypassNotificationsPref) {
      const cfg = await env.DB.prepare('SELECT notifications_enabled FROM bot_configs WHERE user_id = ?')
        .bind(userId).first<{ notifications_enabled: number }>();
      if (cfg && !cfg.notifications_enabled) return;
    }

    // Prefer user's own active bot token; fallback to instance global bot
    const botRow = await env.DB.prepare(
      'SELECT encrypted_bot_token FROM telegram_bots WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).bind(userId).first<{ encrypted_bot_token: string }>();

    let token = '';
    if (botRow?.encrypted_bot_token) {
      const dec = await decryptVaultJson<{ botToken?: string }>(botRow.encrypted_bot_token, env.MASTER_ENCRYPTION_KEY);
      if (dec.botToken) token = dec.botToken;
    }
    if (!token) token = await resolveTelegramBotToken(env);
    if (!token) return;

    const client = new TelegramBotClient(token);
    await client.sendMessage(user.telegram_id, text, inlineKeyboard ? { inlineKeyboard } : undefined);
  } catch {
    // Non-fatal notification failure
  }
}

export async function pushNotification(
  db: D1Database,
  userId: string,
  category: 'TRADE' | 'TP_SL' | 'SUBSCRIPTION' | 'SECURITY' | 'SYSTEM',
  title: string,
  body: string
) {
  try {
    await db.prepare(
      `INSERT INTO notifications (id, user_id, category, title, body, is_read) VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(randomId('ntf'), userId, category, title, body).run();
  } catch {
    // Non-fatal if migration not yet applied
  }
}

export async function executeSignalForUser(
  env: Env,
  userId: string,
  signal: DollarinoSignal,
  options?: {
    signalId?: string;
    forceBypassState?: boolean;
    strategyKey?: string;
    aiConfidence?: number | null;
    aiReasoning?: string | null;
    marketType?: MarketType;
    orderType?: 'MARKET' | 'LIMIT';
    marginPctOverride?: number;
  }
): Promise<{ ok: boolean; tradeId?: string; error?: string }> {
  if (options?.signalId) {
    const dup = await env.DB.prepare(
      `SELECT id FROM trades WHERE user_id = ? AND signal_id = ? LIMIT 1`
    ).bind(userId, options.signalId).first<{ id: string }>();
    if (dup) {
      return { ok: false, error: 'Duplicate execution blocked: signal already executed for this account' };
    }
  }

  const cfgRow = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(userId).first<UserBotConfigRow>();
  if (!cfgRow) return { ok: false, error: 'Bot config not found for user' };

  const onboardingGate = await checkPreTradeOnboardingGate(env.DB, userId);
  if (!onboardingGate.ok) {
    return {
      ok: false,
      error: `${onboardingGate.code}: ${onboardingGate.error}`,
    };
  }

  const marketType: MarketType = options?.marketType ?? cfgRow.market_type ?? 'FUTURES';
  const forceProvider = cfgRow.trading_mode === 'PAPER' ? 'paper' : undefined;
  const { adapter, provider } = await resolveUserExchangeAdapter(env, userId, forceProvider);
  const effectiveMode: TradingMode = provider === 'paper' ? 'PAPER' : cfgRow.trading_mode;

  if (cfgRow.trading_mode === 'LIVE' && env.ALLOW_LIVE_TRADING !== 'true' && provider !== 'paper') {
    return {
      ok: false,
      error: 'LIVE trading is safety-locked by instance env (ALLOW_LIVE_TRADING != true). Switch to Paper Mode or enable ALLOW_LIVE_TRADING.',
    };
  }

  if (cfgRow.trading_mode === 'LIVE') {
    const feeCheck = await checkLiveFeeEnforcement(env.DB, userId);
    if (!feeCheck.allowed) {
      await publishTransactionEvent(env, {
        eventType: 'ACCOUNT_LOCKED',
        status: 'LOCKED',
        title: 'محدودیت موقت ورود معامله جدید (معوقات ۳٪)',
        amountUsd: Number(feeCheck.totalDueUsd || 0),
        userId,
        details: 'به دلیل عدم تسویه سررسید ۳٪ سود، ورود جدید LIVE مسدود شد (پوزیشن‌های باز همچنان مدیریت می‌شوند).',
      }).catch(() => {});
      return {
        ok: false,
        error:
          'FEE_SETTLEMENT_REQUIRED: باز کردن معامله جدید واقعی تا تسویه کارمزد ۳٪ سود متوقف است (پوزیشن‌های باز فعلی همچنان برای سود مدیریت می‌شوند).',
      };
    }
    // Never silently fall back to Paper simulation when user specifically runs LIVE mode without an active Agent/Exchange adapter
    if (provider === 'paper') {
      const base = signal.symbol.replace(/USDT$|USDC$|USD$/i, '') || 'BTC';
      const hlUrl = `https://app.hyperliquid.xyz/trade/${encodeURIComponent(base)}`;
      const twLink = `https://link.trustwallet.com/open_url?coin_id=10042161&url=${encodeURIComponent(hlUrl)}`;
      if (cfgRow.trade_execution_mode === 'MANUAL_CONFIRM' || options?.strategyKey === 'manual_terminal') {
        await pushNotification(
          env.DB,
          userId,
          'TRADE',
          `درخواست امضای معامله واقعی ${signal.direction} ${signal.symbol}`,
          `نقطه ورود $${signal.price} · حد ضرر $${signal.stopLoss} · برای تایید و امضای مستقیم در Trust Wallet کلیک کنید.`
        );
        await notifyUserTelegram(
          env,
          userId,
          `🛡 **فرصت ترید واقعی (نیاز به تایید Trust Wallet)**\n\n` +
            `📌 نماد: **${signal.symbol}** (${signal.direction} ${signal.leverage || 5}×)\n` +
            `💵 ورود پیشنهادی: \`$${signal.price}\` · SL: \`$${signal.stopLoss}\` · TP1: \`$${signal.tp1}\`\n` +
            `👇 برای تایید غیرحضانتی در Trust Wallet DApp لمس کنید (یا کلید Agent Wallet Hyperliquid را با ۱ کلیک در پنل تایید نمایید):`,
          [[{ text: 'امضا و اجرا در Trust Wallet 🛡', url: twLink }]]
        );
        return {
          ok: false,
          error: 'TRUST_WALLET_MANUAL_SIGN_SENT: در حالت واقعی بدون Agent Key، لینک امضای مستقیم Hyperliquid در Trust Wallet صادر و به اعلان‌ها ارسال شد.',
        };
      }
      const recentlyPrompted = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id = ? AND category = 'SYSTEM' AND title LIKE '%Hyperliquid Agent%' AND created_at >= datetime('now', '-6 hours') LIMIT 1`
      )
        .bind(userId)
        .first<{ id: string }>()
        .catch(() => null);
      if (!recentlyPrompted) {
        await pushNotification(
          env.DB,
          userId,
          'SYSTEM',
          'نیاز به فعال‌سازی ۱-کلیکی Hyperliquid Agent برای اتوترید ۲۴/۷',
          `سیگنال ${signal.direction} ${signal.symbol} صادر شد. برای اجرای خودکار ۲۴/۷ روی حساب واقعی، در تب کیف‌پول / DEX دکمه «⚡ فعال‌سازی خودکار Hyperliquid با ۱ کلیک» را امضا کنید (یا حالت اجرا را روی «تایید با ۱ کلیک Trust Wallet» بگذارید).`
        );
      }
      return {
        ok: false,
        error: 'AGENT_KEY_REQUIRED: برای اجرای کاملاً خودکار ۲۴/۷ در حالت واقعی (LIVE)، لطفاً در تب DEX / Trust Wallet دکمه «فعال‌سازی خودکار Hyperliquid با ۱ کلیک (ApproveAgent)» را تایید کنید.',
      };
    }
  }

  const [bal, spec, openStatsRow, todayPnlRow, livePrice] = await Promise.all([
    adapter.getBalance(marketType),
    adapter.getInstrumentSpec(signal.symbol, marketType),
    env.DB.prepare(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(CAST(margin_used AS REAL) * (CAST(remaining_quantity AS REAL) / MAX(1e-9, CAST(initial_quantity AS REAL)))), 0) as used_margin
       FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ?`
    ).bind(userId, effectiveMode).first<{ cnt: number; used_margin: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl FROM trades WHERE user_id = ? AND mode = ? AND date(opened_at) = date('now')`
    ).bind(userId, effectiveMode).first<{ pnl: number }>(),
    adapter.getTickerPrice(signal.symbol),
  ]);

  const usedBotMarginUsd = Math.max(0, Number(openStatsRow?.used_margin ?? 0));
  const walletFreeUsd = Math.max(0, Number(bal.free) || 0);
  const walletTotalUsd = Math.max(walletFreeUsd + usedBotMarginUsd, Number(bal.total) || 0);
  const capRes = resolveEffectiveBotCapital({
    walletBalanceUsd: walletTotalUsd,
    budgetMode: cfgRow.bot_budget_mode,
    budgetUsd: cfgRow.bot_budget_usd,
    budgetPct: cfgRow.bot_budget_pct,
  });

  const sigPxNum = Number(signal.price);
  const livePxNum = Number(livePrice);
  const useLivePx =
    Number.isFinite(livePxNum) &&
    livePxNum > 0 &&
    (!(Number.isFinite(sigPxNum) && sigPxNum > 0) || Math.abs(livePxNum - sigPxNum) / sigPxNum <= 0.35);

  const effectiveSignal: DollarinoSignal = {
    ...signal,
    price: useLivePx ? livePrice : signal.price,
  };

  const botConfig = rowToBotConfig(cfgRow);
  botConfig.marketType = marketType;
  if (options?.marginPctOverride && Number.isFinite(options.marginPctOverride)) {
    botConfig.marginPct = Math.max(0.5, Math.min(100, options.marginPctOverride));
  }
  const decision = evaluateRiskGates({
    botState: options?.forceBypassState ? 'RUNNING_PAPER' : cfgRow.bot_state,
    config: botConfig,
    signal: effectiveSignal,
    availableBalance: bal.free,
    equity: bal.total,
    todayRealizedPnl: String(todayPnlRow?.pnl ?? 0),
    openPositionsCount: openStatsRow?.cnt ?? 0,
    instrument: spec,
    effectiveCapitalUsd: capRes.effectiveCapitalUsd,
    usedBotMarginUsd,
  });

  if (!decision.approved) {
    await logAudit(env.DB, userId, 'RISK', 'WARN', `Signal rejected: ${decision.reasonMessage}`, signal.symbol, decision);
    return { ok: false, error: decision.reasonMessage };
  }

  let aiConfidence: number | null = options?.aiConfidence ?? null;
  let aiReasoning: string | null = options?.aiReasoning ?? null;
  if (botConfig.aiGateEnabled && aiConfidence === null) {
    const ensemble = await resolveAIEnsemble(env, userId).catch(() => ({ engines: [], source: 'PLATFORM' as const, consensusMode: 'SINGLE' as const, cacheTtlSec: 180 }));
    const ai = ensemble.engines[0];
    if (ai) {
      try {
        const resp = await callBYOAI(
          ai,
          'Reply ONLY with JSON {"decision":"APPROVE"|"REJECT","confidence":0-100,"reason":"short"}',
          `Evaluate ${effectiveSignal.direction} ${effectiveSignal.symbol} entry=${effectiveSignal.price} sl=${effectiveSignal.stopLoss} tp1=${effectiveSignal.tp1} lev=${decision.effectiveLeverage}x`
        );
        const match = resp.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { decision: string; confidence: number; reason: string };
          aiConfidence = Number(parsed.confidence ?? 0);
          aiReasoning = parsed.reason ?? '';
          if (parsed.decision !== 'APPROVE' || aiConfidence < botConfig.aiMinConfidence) {
            await logAudit(env.DB, userId, 'AI', 'WARN', `AI Gate rejected trade (${aiConfidence}%): ${aiReasoning}`, signal.symbol);
            return { ok: false, error: `AI Gate rejected (${aiConfidence}%): ${aiReasoning}` };
          }
        }
      } catch (err) {
        await logAudit(env.DB, userId, 'AI', 'ERROR', `AI Gate fail-safe skip: ${String(err)}`, signal.symbol);
        return { ok: false, error: 'AI Reasoning Gate unavailable (fail-safe skip)' };
      }
    }
  }

  const clientId = `dlr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const order = await adapter.placeMarketOrder({
    symbol: effectiveSignal.symbol,
    direction: effectiveSignal.direction,
    type: options?.orderType ?? 'MARKET',
    marketType,
    quantity: decision.quantity,
    price: effectiveSignal.price,
    leverage: decision.effectiveLeverage,
    stopLoss: effectiveSignal.stopLoss,
    takeProfit: effectiveSignal.tp3 ?? effectiveSignal.tp2 ?? effectiveSignal.tp1,
    clientOrderId: clientId,
  });

  const tradeId = randomId('trd');
  await env.DB.prepare(
    `INSERT INTO trades (
      id, user_id, signal_id, mode, market_type, exchange_provider, symbol, strategy_key, direction, status,
      entry_price, initial_quantity, remaining_quantity, leverage, margin_used,
      current_stop_loss, initial_stop_loss, tp1, tp2, tp3,
      highest_price, lowest_price, trailing_active,
      fees_paid, exchange_order_id, client_id, ai_confidence, ai_reasoning
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
  ).bind(
    tradeId,
    userId,
    options?.signalId ?? null,
    effectiveMode,
    marketType,
    provider,
    effectiveSignal.symbol,
    options?.strategyKey ?? cfgRow.strategy_key,
    effectiveSignal.direction,
    order.filledPrice,
    decision.quantity,
    decision.quantity,
    decision.effectiveLeverage,
    decision.marginUsed,
    effectiveSignal.stopLoss,
    effectiveSignal.stopLoss,
    effectiveSignal.tp1,
    effectiveSignal.tp2 ?? null,
    effectiveSignal.tp3 ?? null,
    order.filledPrice,
    order.filledPrice,
    order.fee,
    order.orderId,
    clientId,
    aiConfidence,
    aiReasoning
  ).run();

  if (effectiveMode === 'PAPER') {
    const newFree = Math.max(0, Number(cfgRow.paper_balance) - Number(decision.marginUsed) - Number(order.fee));
    await env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
      .bind(newFree.toFixed(2), userId).run();
  }

  await logAudit(
    env.DB,
    userId,
    'ORDER',
    'INFO',
    `Opened ${effectiveSignal.direction} ${effectiveSignal.symbol} qty=${decision.quantity} @ ${order.filledPrice} (${decision.effectiveLeverage}x)`,
    effectiveSignal.symbol,
    { tradeId, marginUsed: decision.marginUsed }
  );

  await pushNotification(
    env.DB,
    userId,
    'TRADE',
    `${marketType} ${effectiveSignal.direction} ${effectiveSignal.symbol} (${decision.effectiveLeverage}x)`,
    `Opened @ $${order.filledPrice} · Margin $${decision.marginUsed} · SL $${effectiveSignal.stopLoss}`
  );

  await notifyUserTelegram(
    env,
    userId,
    formatTradeOpenedCard({
      symbol: effectiveSignal.symbol,
      direction: effectiveSignal.direction,
      exchange: provider,
      entryPrice: order.filledPrice,
      leverage: decision.effectiveLeverage,
      marginUsed: decision.marginUsed,
      stopLoss: effectiveSignal.stopLoss,
      tp1: effectiveSignal.tp1,
      tp2: effectiveSignal.tp2,
      tp3: effectiveSignal.tp3,
      tp1Pct: cfgRow.tp1_close_pct,
      tp2Pct: cfgRow.tp2_close_pct,
      tp3Pct: cfgRow.tp3_close_pct,
      engineKey: options?.strategyKey ?? cfgRow.strategy_key,
      engineLabel: effectiveSignal.engineLabel,
    })
  );

  // If this user is a verified Copy Trader, ask for publish confirmation (unless already mirroring a copy trade)
  if (options?.strategyKey !== 'copy_trade') {
    await maybePromptCopyTraderOnNewTrade(env, userId, {
      sourceTradeId: tradeId,
      symbol: effectiveSignal.symbol,
      direction: effectiveSignal.direction,
      leverage: decision.effectiveLeverage,
      entryPrice: order.filledPrice,
      stopLoss: effectiveSignal.stopLoss,
      tp1: effectiveSignal.tp1,
      tp2: effectiveSignal.tp2,
      tp3: effectiveSignal.tp3,
    }).catch(() => {});
  }

  await publishSystemLogEvent(env, {
    category: 'BOT_ACTIVITY',
    level: 'INFO',
    source: `Executor:${provider}`,
    title: `باز شدن معامله ${effectiveSignal.direction} ${effectiveSignal.symbol} (${effectiveMode})`,
    userId,
    details: `ورود: $${order.filledPrice} | مارجین: $${decision.marginUsed} | اهرم: ${decision.effectiveLeverage}x | SL: $${effectiveSignal.stopLoss}`,
  }).catch(() => {});

  return { ok: true, tradeId };
}

interface OpenTradeRow {
  id: string;
  user_id: string;
  signal_id?: string | null;
  strategy_key?: string | null;
  mode: TradingMode;
  market_type?: MarketType;
  exchange_provider: string;
  symbol: string;
  direction: Direction;
  entry_price: string;
  initial_quantity: string;
  remaining_quantity: string;
  leverage: number;
  margin_used: string;
  current_stop_loss: string;
  initial_stop_loss?: string;
  opened_at?: string;
  tp1: string;
  tp2: string | null;
  tp3: string | null;
  tp1_hit: number;
  tp2_hit: number;
  tp3_hit: number;
  risk_free_active: number;
  highest_price?: string | null;
  lowest_price?: string | null;
  trailing_active?: number;
  realized_pnl: string;
  fees_paid: string;
}

/**
 * Monitors pending LIMIT orders and open trades against live market prices and executes exact 3-TP staged exits
 * with automatic Risk-Free (SL->Entry at TP1, SL->TP1 at TP2).
 */
export async function reconcileOpenPositionsForUser(
  env: Env,
  userId: string,
  opts?: { prefetchedCfg?: UserBotConfigRow | null; checkPendingOrders?: boolean }
): Promise<number> {
  const cfg =
    opts?.prefetchedCfg ??
    (await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(userId).first<UserBotConfigRow>());
  if (!cfg) return 0;

  let processed = 0;

  // 0. Check pending LIMIT orders matching the current trading mode (skip D1 query when caller knows none exist)
  if (opts?.checkPendingOrders !== false) {
    const pendingRows = await env.DB.prepare(
      `SELECT * FROM pending_orders WHERE user_id = ? AND status = 'PENDING' AND mode = ?`
    ).bind(userId, cfg.trading_mode).all<{
      id: string;
      symbol: string;
      direction: Direction;
      price: string;
      leverage: number;
      stop_loss: string;
      tp1: string;
      tp2: string | null;
      tp3: string | null;
      strategy_key: string;
    }>();

    for (const po of pendingRows.results) {
      const { adapter } = await resolveUserExchangeAdapter(env, userId, cfg.trading_mode === 'PAPER' ? 'paper' : undefined);
      const livePx = Number(await adapter.getTickerPrice(po.symbol));
      const target = Number(po.price);
      const filled = po.direction === 'LONG' ? livePx <= target : livePx >= target;
      if (filled) {
        await env.DB.prepare(`UPDATE pending_orders SET status = 'FILLED' WHERE id = ?`).bind(po.id).run();
        await executeSignalForUser(
          env,
          userId,
          {
            symbol: po.symbol,
            direction: po.direction,
            timeframe: cfg.entry_timeframe,
            price: po.price,
            stopLoss: po.stop_loss,
            leverage: po.leverage,
            tp1: po.tp1,
            tp2: po.tp2 ?? undefined,
            tp3: po.tp3 ?? undefined,
          },
          { forceBypassState: true, strategyKey: po.strategy_key, marketType: cfg.market_type ?? 'FUTURES' }
        );
        processed++;
      }
    }
  }

  const openTrades = await env.DB.prepare(
    `SELECT * FROM trades WHERE user_id = ? AND status = 'OPEN'`
  ).bind(userId).all<OpenTradeRow>();

  if (!openTrades.results.length) return processed;

  for (const t of openTrades.results) {
    const tradeMarketType: MarketType = t.market_type ?? 'FUTURES';
    const forceProvider = t.mode === 'PAPER' ? 'paper' : undefined;
    const { adapter } = await resolveUserExchangeAdapter(env, userId, forceProvider);
    const markStr = await adapter.getTickerPrice(t.symbol);
    const mark = Number(markStr);
    if (!Number.isFinite(mark) || mark <= 0) continue;

    const isLong = t.direction === 'LONG';
    const sl = Number(t.current_stop_loss);
    const tp1 = Number(t.tp1);
    const tp2 = t.tp2 ? Number(t.tp2) : null;
    const tp3 = t.tp3 ? Number(t.tp3) : null;
    const entry = Number(t.entry_price);

    const spec = await adapter.getInstrumentSpec(t.symbol, tradeMarketType);

    const closeChunk = async (qtyToClose: string, reason: string, finalClose: boolean) => {
      const q = Math.min(Number(qtyToClose), Number(t.remaining_quantity));
      if (q <= 0) return;
      const qStr = quantizeDown(q.toFixed(spec.basePrecision + 2), spec.basePrecision);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, qStr, `dlr_cls_${Date.now()}`, tradeMarketType);
      const fill = Number(cls.filledPrice);
      const grossPnl = isLong ? (fill - entry) * q : (entry - fill) * q;
      const fee = Number(cls.fee);
      const newRealized = Number(t.realized_pnl) + grossPnl - fee;
      const newFees = Number(t.fees_paid) + fee;
      const newRem = Math.max(0, Number(t.remaining_quantity) - q);
      const marginShare = Number(t.margin_used) * (q / Math.max(1e-9, Number(t.initial_quantity)));

      if (t.mode === 'PAPER') {
        const latestCfg = await env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
          .bind(userId).first<{ paper_balance: string }>();
        const updatedBal = Number(latestCfg?.paper_balance ?? 0) + marginShare + grossPnl - fee;
        await env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
          .bind(updatedBal.toFixed(2), userId).run();
      }

      if (finalClose || newRem <= Number(spec.minTradeVolume) * 0.5) {
        await env.DB.prepare(
          `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, fees_paid = ?, exit_reason = ?, closed_at = datetime('now')
           WHERE id = ?`
        ).bind(cls.filledPrice, newRealized.toFixed(4), newFees.toFixed(4), reason, t.id).run();

        const pnlPct = Number(t.margin_used) > 0 ? (newRealized / Number(t.margin_used)) * 100 : 0;
        await pushNotification(
          env.DB,
          userId,
          reason.includes('SL') ? 'TP_SL' : 'TRADE',
          `${newRealized >= 0 ? 'WIN' : 'LOSS'} · ${t.symbol} Closed (${reason})`,
          `PnL: ${newRealized >= 0 ? '+' : ''}$${newRealized.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`
        );
        await publishSignalClosedCard(env, {
          tradeId: t.id,
          userId,
          signalId: t.signal_id,
          symbol: t.symbol,
          direction: t.direction,
          leverage: t.leverage,
          mode: t.mode,
          strategyKey: t.strategy_key,
          entryPrice: t.entry_price,
          exitPrice: cls.filledPrice,
          stopLoss: t.initial_stop_loss ?? t.current_stop_loss,
          tp1: t.tp1,
          tp1Hit: Boolean(t.tp1_hit || reason.includes('TP1') || reason.includes('TP2') || reason.includes('TP3')),
          tp2Hit: Boolean(t.tp2_hit || reason.includes('TP2') || reason.includes('TP3')),
          tp3Hit: Boolean(t.tp3_hit || reason === 'TP3'),
          trailingActive: Boolean(t.trailing_active || t.risk_free_active),
          trailingSl: t.current_stop_loss,
          pnlUsd: newRealized,
          pnlPct,
          reason,
          openedAt: t.opened_at,
          closedAt: new Date().toISOString(),
        }).catch(() => {});

        const feeRes = await recordProfitShareServerFee(env.DB, {
          userId,
          tradeId: t.id,
          source: 'PERP_LIVE',
          symbol: t.symbol,
          mode: t.mode,
          realizedPnlUsd: newRealized,
          tradeAmountUsd: Number(t.initial_quantity || 0) * Number(t.entry_price || mark || 0),
        }).catch(() => null);
        if (feeRes && feeRes.feeUsd > 0) {
          await publishTransactionEvent(env, {
            eventType: 'SERVER_FEE',
            status: 'DUE',
            title: `ثبت کارمزد ۳٪ معامله سودده ${t.symbol}`,
            amountUsd: feeRes.feeUsd,
            userId,
            invoiceNo: t.id,
            details: `سود محقق‌شده: $${Number(newRealized || 0).toFixed(2)} · سهم ۳٪ سرور: $${feeRes.feeUsd.toFixed(4)}`,
          }).catch(() => {});
        }
      } else {
        await env.DB.prepare(
          `UPDATE trades SET remaining_quantity = ?, realized_pnl = ?, fees_paid = ? WHERE id = ?`
        ).bind(quantizeDown(newRem.toFixed(8), spec.basePrecision), newRealized.toFixed(4), newFees.toFixed(4), t.id).run();
      }
      t.remaining_quantity = String(newRem);
      t.realized_pnl = String(newRealized);
      processed++;
    };

    // 1. Stop Loss Check
    const slHit = isLong ? mark <= sl : mark >= sl;
    if (slHit) {
      const slReason = t.trailing_active ? 'TRAILING_SL' : t.risk_free_active ? 'RISK_FREE_SL' : 'SL';
      await closeChunk(t.remaining_quantity, slReason, true);
      await logAudit(env.DB, userId, 'ORDER', 'INFO', `${slReason} triggered for ${t.symbol} @ ${mark}`, t.symbol);
      continue;
    }

    // 1B. Smart Danger Alert (Near Stop-Loss / High Margin Risk)
    if (!t.risk_free_active && !t.tp1_hit && sl > 0) {
      const totalRiskDist = Math.abs(entry - sl);
      const adverseDist = isLong ? entry - mark : mark - entry;
      if (totalRiskDist > 0 && adverseDist / totalRiskDist >= 0.72) {
        const warnTag = `NEAR_SL_WARN:${t.id}`;
        const existingWarn = await env.DB.prepare(
          `SELECT id FROM audit_logs WHERE user_id = ? AND category = 'RISK_ALERT' AND details_json = ? LIMIT 1`
        )
          .bind(userId, warnTag)
          .first<{ id: string }>()
          .catch(() => null);
        if (!existingWarn) {
          await logAudit(
            env.DB,
            userId,
            'RISK_ALERT',
            'WARN',
            `⚠️ هشدار محافظت سرمایه (${t.symbol}): معامله به حدود ۷۲٪ مسیر حد ضرر ($${t.current_stop_loss}) نزدیک شده است.`,
            t.symbol,
            warnTag
          );
          await pushNotification(
            env.DB,
            userId,
            'TP_SL',
            `⚠️ Danger Alert · ${t.symbol}`,
            `Position moved ~72% toward Stop-Loss ($${t.current_stop_loss}). Check margin & risk!`
          );
          await notifyUserTelegram(
            env,
            userId,
            `⚠️ **هشدار محافظت سرمایه (${t.symbol})**\n` +
              `معامله ${t.direction} اهرم ${t.leverage}x به حدود **۷۲٪ مسیر حد ضرر** (SL: $${t.current_stop_loss} | مارک: $${mark}) نزدیک شده است.`
          ).catch(() => {});
        }
      }
    }

    // Track extreme price for dynamic Trailing SL
    const prevHigh = Number(t.highest_price || entry);
    const prevLow = Number(t.lowest_price || entry);
    const nextHigh = Math.max(prevHigh, mark);
    const nextLow = Math.min(prevLow, mark);
    if (nextHigh !== prevHigh || nextLow !== prevLow) {
      await env.DB.prepare(
        `UPDATE trades SET highest_price = ?, lowest_price = ? WHERE id = ?`
      ).bind(String(nextHigh), String(nextLow), t.id).run();
    }

    // 2. TP1 Check (Close tp1_close_pct% + Move SL to Entry = Risk-Free)
    if (!t.tp1_hit && (isLong ? mark >= tp1 : mark <= tp1)) {
      const q1 = (Number(t.initial_quantity) * (cfg.tp1_close_pct / 100)).toFixed(spec.basePrecision + 2);
      const noMoreTps = !tp2 && !tp3;
      await closeChunk(q1, 'TP1_PARTIAL', noMoreTps);
      let newSl = t.current_stop_loss;
      let rf = t.risk_free_active;
      if (!noMoreTps && cfg.auto_breakeven_on_tp1) {
        newSl = t.entry_price;
        rf = 1;
        if (tradeMarketType === 'FUTURES') {
          await adapter.updatePositionStopLoss(t.symbol, t.direction, newSl).catch(() => {});
        }
      }
      t.tp1_hit = 1;
      t.current_stop_loss = newSl;
      await env.DB.prepare(
        `UPDATE trades SET tp1_hit = 1, current_stop_loss = ?, risk_free_active = ? WHERE id = ?`
      ).bind(newSl, rf, t.id).run();
      await logAudit(env.DB, userId, 'ORDER', 'INFO', `TP1 hit for ${t.symbol}! Closed ${cfg.tp1_close_pct}% & Risk-Free active`, t.symbol);
      await pushNotification(env.DB, userId, 'TP_SL', `TP1 Hit · ${t.symbol}`, `Closed ${cfg.tp1_close_pct}%${rf ? ' · SL moved to Entry (Risk-Free)' : ''}`);
      if (rf) {
        await notifyUserTelegram(env, userId, `🟢 تارگت ۱ (${t.symbol}) تاچ شد! ${cfg.tp1_close_pct}% بسته شد و استاپ به نقطه ورود (${newSl}) منتقل گردید (ریسک‌فری ✅)`);
      }
    }

    // 3. TP2 Check (Close tp2_close_pct% + Move SL to TP1)
    if (tp2 && !t.tp2_hit && (isLong ? mark >= tp2 : mark <= tp2)) {
      const q2 = (Number(t.initial_quantity) * (cfg.tp2_close_pct / 100)).toFixed(spec.basePrecision + 2);
      const finalHere = !tp3;
      await closeChunk(q2, 'TP2_PARTIAL', finalHere);
      let newSl = t.current_stop_loss;
      if (!finalHere && cfg.move_sl_to_tp1_on_tp2) {
        newSl = t.tp1;
        if (tradeMarketType === 'FUTURES') {
          await adapter.updatePositionStopLoss(t.symbol, t.direction, newSl).catch(() => {});
        }
      }
      t.tp2_hit = 1;
      t.current_stop_loss = newSl;
      await env.DB.prepare(
        `UPDATE trades SET tp2_hit = 1, current_stop_loss = ? WHERE id = ?`
      ).bind(newSl, t.id).run();
      await logAudit(env.DB, userId, 'ORDER', 'INFO', `TP2 hit for ${t.symbol}! Closed ${cfg.tp2_close_pct}% & SL moved to TP1`, t.symbol);
    }

    // 4. Dynamic Trailing Stop Reconciliation (KBOs v11 / TimeTrade)
    if ((cfg.trailing_stop_enabled ?? 1) && (cfg.trailing_stop_pct ?? 0) > 0 && Number(t.remaining_quantity) > 0) {
      const canTrail = Boolean(t.tp1_hit) || !Boolean(cfg.trail_after_tp1 ?? 1);
      if (canTrail) {
        const pct = (cfg.trailing_stop_pct ?? 2.0) / 100;
        const candidateSl = isLong ? nextHigh * (1 - pct) : nextLow * (1 + pct);
        const curSlNum = Number(t.current_stop_loss);
        const tightened = isLong ? candidateSl > curSlNum : candidateSl < curSlNum;
        if (tightened) {
          const slStr = candidateSl.toFixed(spec.quotePrecision);
          if (tradeMarketType === 'FUTURES') {
            await adapter.updatePositionStopLoss(t.symbol, t.direction, slStr).catch(() => {});
          }
          await env.DB.prepare(
            `UPDATE trades SET current_stop_loss = ?, trailing_active = 1 WHERE id = ?`
          ).bind(slStr, t.id).run();
        }
      }
    }

    // 5. TP3 Check (Close remaining)
    if (tp3 && !t.tp3_hit && (isLong ? mark >= tp3 : mark <= tp3)) {
      await env.DB.prepare(`UPDATE trades SET tp3_hit = 1 WHERE id = ?`).bind(t.id).run();
      await closeChunk(t.remaining_quantity, 'TP3', true);
      await logAudit(env.DB, userId, 'ORDER', 'INFO', `TP3 final target hit for ${t.symbol}!`, t.symbol);
    }
  }

  return processed;
}

export interface UserCapitalSummary {
  walletTotalUsd: number;
  walletFreeUsd: number;
  budgetMode: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
  budgetUsd: number;
  budgetPct: number;
  effectiveCapitalUsd: number;
  usedMarginUsd: number;
  remainingBudgetUsd: number;
  isCapped: boolean;
  recommended: ReturnType<typeof computeDynamicRecommendedSettings>;
}

export async function resolveUserCapitalSummary(
  db: D1Database,
  userId: string,
  cfg: Pick<UserBotConfigRow, 'trading_mode' | 'bot_budget_mode' | 'bot_budget_usd' | 'bot_budget_pct' | 'paper_balance' | 'risk_profile_json'> | null,
  balance?: { free?: string | number; total?: string | number } | null,
  prefetched?: { usedTradesMarginUsd?: number; usedSniperUsd?: number }
): Promise<UserCapitalSummary> {
  const mode = cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
  let usedTrades = prefetched?.usedTradesMarginUsd;
  let usedSniper = prefetched?.usedSniperUsd;

  if (usedTrades === undefined || (mode === 'PAPER' && usedSniper === undefined)) {
    const [openMarginRow, openSniperRow] = await Promise.all([
      usedTrades === undefined
        ? db
            .prepare(
              `SELECT COALESCE(SUM(CAST(margin_used AS REAL) * (CAST(remaining_quantity AS REAL) / MAX(1e-9, CAST(initial_quantity AS REAL)))), 0) AS used_margin
               FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ?`
            )
            .bind(userId, mode)
            .first<{ used_margin: number }>()
            .catch(() => ({ used_margin: 0 }))
        : Promise.resolve({ used_margin: usedTrades }),
      mode === 'PAPER' && usedSniper === undefined
        ? db
            .prepare(
              `SELECT COALESCE(SUM(CAST(amount_usd AS REAL)), 0) AS sniper_used
               FROM dex_trades WHERE user_id = ? AND status = 'OPEN' AND note LIKE '%شکارچی دمو%'`
            )
            .bind(userId)
            .first<{ sniper_used: number }>()
            .catch(() => ({ sniper_used: 0 }))
        : Promise.resolve({ sniper_used: usedSniper ?? 0 }),
    ]);
    usedTrades = Math.max(0, Number(openMarginRow?.used_margin ?? 0));
    usedSniper = mode === 'PAPER' ? Math.max(0, Number(openSniperRow?.sniper_used ?? 0)) : 0;
  }

  const usedMarginUsd = Math.round((Math.max(0, usedTrades) + (mode === 'PAPER' ? Math.max(0, usedSniper ?? 0) : 0)) * 100) / 100;

  const fallbackFree = mode === 'LIVE' ? 0 : (Number(cfg?.paper_balance ?? 10000) || 10000);
  const hasExplicitFree = balance?.free !== undefined && balance?.free !== null;
  const walletFreeUsd = Math.max(0, Number(hasExplicitFree ? balance!.free : fallbackFree) || 0);
  const walletTotalUsd = Math.round(Math.max(walletFreeUsd + usedMarginUsd, Number(balance?.total ?? walletFreeUsd + usedMarginUsd) || 0) * 100) / 100;

  const cap = resolveEffectiveBotCapital({
    walletBalanceUsd: walletTotalUsd,
    budgetMode: cfg?.bot_budget_mode,
    budgetUsd: cfg?.bot_budget_usd,
    budgetPct: cfg?.bot_budget_pct,
  });

  let preset: 'conservative' | 'balanced' | 'aggressive' = 'balanced';
  try {
    if (cfg?.risk_profile_json) {
      const rp = JSON.parse(cfg.risk_profile_json) as { preset?: string };
      if (rp.preset === 'conservative' || rp.preset === 'aggressive') preset = rp.preset;
    }
  } catch { /* balanced */ }

  const remainingBudgetUsd = Math.max(0, Math.round((cap.effectiveCapitalUsd - usedMarginUsd) * 100) / 100);

  return {
    walletTotalUsd,
    walletFreeUsd: Math.round(walletFreeUsd * 100) / 100,
    budgetMode: cap.budgetMode,
    budgetUsd: Math.max(0, Number(cfg?.bot_budget_usd ?? 0)),
    budgetPct: Math.max(5, Math.min(100, Number(cfg?.bot_budget_pct ?? 100))),
    effectiveCapitalUsd: cap.effectiveCapitalUsd,
    usedMarginUsd,
    remainingBudgetUsd,
    isCapped: cap.isCapped,
    recommended: computeDynamicRecommendedSettings(cap.effectiveCapitalUsd, preset),
  };
}
