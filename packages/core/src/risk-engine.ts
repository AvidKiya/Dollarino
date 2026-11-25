import { decimalCmp, decimalDiv, decimalMul, quantizeDown } from './decimal.js';
import type { BotConfig, Direction, DollarinoSignal, InstrumentSpec } from './types.js';

export type BotBudgetMode = 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
export type CapitalPresetId = 'conservative' | 'balanced' | 'aggressive';

export interface EffectiveBotCapitalResult {
  walletBalanceUsd: number;
  budgetMode: BotBudgetMode;
  effectiveCapitalUsd: number;
  isCapped: boolean;
}

export interface DynamicRecommendedSettings {
  effectiveCapitalUsd: number;
  preset: CapitalPresetId;
  marginPct: number;
  perTradeUsd: number;
  maxOpenPositions: number;
  maxLeverage: number;
  dailyMaxLossPct: number;
  trailingStopPct: number;
  tp1ClosePct: number;
  tp2ClosePct: number;
  tp3ClosePct: number;
  summaryFa: string;
  summaryEn: string;
}

export function resolveEffectiveBotCapital(input: {
  walletBalanceUsd: number;
  budgetMode?: string | null;
  budgetUsd?: number | null;
  budgetPct?: number | null;
}): EffectiveBotCapitalResult {
  const wallet = Math.max(0, Number(input.walletBalanceUsd || 0));
  const modeRaw = String(input.budgetMode || 'FULL_BALANCE').toUpperCase();
  const budgetMode: BotBudgetMode =
    modeRaw === 'FIXED_USD' || modeRaw === 'PERCENT_OF_BALANCE' ? modeRaw : 'FULL_BALANCE';

  if (budgetMode === 'FIXED_USD') {
    const fixed = Math.max(0, Number(input.budgetUsd || 0));
    if (fixed > 0) {
      const cap = Math.round(Math.min(wallet, Math.max(10, fixed)) * 100) / 100;
      return {
        walletBalanceUsd: Math.round(wallet * 100) / 100,
        budgetMode,
        effectiveCapitalUsd: cap,
        isCapped: cap < wallet - 0.01,
      };
    }
  }

  if (budgetMode === 'PERCENT_OF_BALANCE') {
    const pct = Math.max(5, Math.min(100, Number(input.budgetPct || 100)));
    const cap = Math.round(wallet * (pct / 100) * 100) / 100;
    return {
      walletBalanceUsd: Math.round(wallet * 100) / 100,
      budgetMode,
      effectiveCapitalUsd: cap,
      isCapped: pct < 100,
    };
  }

  return {
    walletBalanceUsd: Math.round(wallet * 100) / 100,
    budgetMode: 'FULL_BALANCE',
    effectiveCapitalUsd: Math.round(wallet * 100) / 100,
    isCapped: false,
  };
}

/**
 * Computes completely dynamic, capital-aware recommended risk & sizing settings
 * based on the effective capital allocated to the bot (whether $50, $100, $1,000 or $100,000).
 */
export function computeDynamicRecommendedSettings(
  effectiveCapitalUsd: number,
  preset: CapitalPresetId = 'balanced'
): DynamicRecommendedSettings {
  const cap = Math.max(10, Number(effectiveCapitalUsd || 0));
  let maxOpenPositions = 4;
  let totalDeployPct = 85;
  let maxLeverage = 5;
  let dailyMaxLossPct = 5;
  let trailingStopPct = 1.8;

  if (cap <= 40) {
    maxOpenPositions = preset === 'aggressive' ? 1 : 2;
    totalDeployPct = preset === 'conservative' ? 60 : preset === 'balanced' ? 80 : 100;
    maxLeverage = preset === 'conservative' ? 3 : preset === 'balanced' ? 4 : 6;
  } else if (cap <= 140) {
    // Example: $100 effective budget -> Balanced: 4 x $25 = $100 | Conservative: 5 x $15 = $75 | Aggressive: 2 x $50 = $100
    maxOpenPositions =
      preset === 'conservative'
        ? Math.max(2, Math.min(5, Math.floor(cap / 20)))
        : preset === 'balanced'
          ? Math.max(2, Math.min(4, Math.floor(cap / 25) || 2))
          : 2;
    totalDeployPct = preset === 'conservative' ? 75 : preset === 'balanced' ? 100 : 100;
    maxLeverage = preset === 'conservative' ? 3 : preset === 'balanced' ? 5 : 8;
  } else if (cap <= 600) {
    maxOpenPositions = preset === 'conservative' ? 5 : preset === 'balanced' ? 5 : 4;
    totalDeployPct = preset === 'conservative' ? 70 : preset === 'balanced' ? 90 : 100;
    maxLeverage = preset === 'conservative' ? 4 : preset === 'balanced' ? 6 : 10;
  } else if (cap <= 3000) {
    maxOpenPositions = preset === 'conservative' ? 6 : preset === 'balanced' ? 6 : 5;
    totalDeployPct = preset === 'conservative' ? 60 : preset === 'balanced' ? 90 : 100;
    maxLeverage = preset === 'conservative' ? 4 : preset === 'balanced' ? 8 : 12;
  } else {
    maxOpenPositions = preset === 'conservative' ? 8 : preset === 'balanced' ? 8 : 6;
    totalDeployPct = preset === 'conservative' ? 64 : preset === 'balanced' ? 80 : 90;
    maxLeverage = preset === 'conservative' ? 5 : preset === 'balanced' ? 10 : 15;
  }

  dailyMaxLossPct = preset === 'conservative' ? 3 : preset === 'balanced' ? 5 : 8;
  trailingStopPct = preset === 'conservative' ? 1.2 : preset === 'balanced' ? 1.8 : 2.5;

  const rawMarginPct = totalDeployPct / Math.max(1, maxOpenPositions);
  const marginPct = Math.max(2, Math.min(100, Math.round(rawMarginPct * 10) / 10));
  const perTradeUsd = Math.round(cap * (marginPct / 100) * 100) / 100;

  return {
    effectiveCapitalUsd: Math.round(cap * 100) / 100,
    preset,
    marginPct,
    perTradeUsd,
    maxOpenPositions,
    maxLeverage,
    dailyMaxLossPct,
    trailingStopPct,
    tp1ClosePct: 50,
    tp2ClosePct: 25,
    tp3ClosePct: 25,
    summaryFa: `متناسب با سرمایه $${Math.round(cap).toLocaleString('en-US')}: حداکثر ${maxOpenPositions} معامله همزمان × $${perTradeUsd.toFixed(perTradeUsd < 10 ? 1 : 0)} (${marginPct}%) · اهرم ${maxLeverage}×`,
    summaryEn: `Tailored for $${Math.round(cap).toLocaleString('en-US')}: max ${maxOpenPositions} concurrent trades × $${perTradeUsd.toFixed(perTradeUsd < 10 ? 1 : 0)} (${marginPct}%) · ${maxLeverage}x max lev`,
  };
}

export interface RiskGateInput {
  botState: 'STOPPED' | 'RUNNING_PAPER' | 'RUNNING_LIVE' | 'PAUSED_DAILY_LOSS';
  config: BotConfig;
  signal: DollarinoSignal;
  availableBalance: string;
  equity: string;
  todayRealizedPnl: string;
  openPositionsCount: number;
  instrument: InstrumentSpec;
  effectiveCapitalUsd?: string | number;
  usedBotMarginUsd?: string | number;
  nowUtc?: Date;
}

export interface RiskGateDecision {
  approved: boolean;
  reasonCode: string;
  reasonMessage: string;
  effectiveLeverage: number;
  marginUsed: string;
  notionalValue: string;
  quantity: string;
  tp1Quantity: string;
  tp2Quantity: string;
  tp3Quantity: string;
}

export function validateSignalDirectionLevels(
  direction: Direction,
  entry: number,
  stopLoss: number,
  tp1: number,
  tp2?: number,
  tp3?: number
): { valid: boolean; error?: string } {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0 || !Number.isFinite(tp1) || tp1 <= 0) {
    return { valid: false, error: 'Entry, Stop Loss, and TP1 must be positive numbers' };
  }
  if (direction === 'LONG') {
    if (stopLoss >= entry) return { valid: false, error: 'LONG Stop Loss must be below entry price' };
    if (tp1 <= entry) return { valid: false, error: 'LONG TP1 must be above entry price' };
    if (tp2 !== undefined && tp2 <= tp1) return { valid: false, error: 'LONG TP2 must be above TP1' };
    if (tp3 !== undefined && tp2 !== undefined && tp3 <= tp2) return { valid: false, error: 'LONG TP3 must be above TP2' };
  } else {
    if (stopLoss <= entry) return { valid: false, error: 'SHORT Stop Loss must be above entry price' };
    if (tp1 >= entry) return { valid: false, error: 'SHORT TP1 must be below entry price' };
    if (tp2 !== undefined && tp2 >= tp1) return { valid: false, error: 'SHORT TP2 must be below TP1' };
    if (tp3 !== undefined && tp2 !== undefined && tp3 >= tp2) return { valid: false, error: 'SHORT TP3 must be below TP2' };
  }
  return { valid: true };
}

export function evaluateRiskGates(input: RiskGateInput): RiskGateDecision {
  const emptyReject = (code: string, msg: string): RiskGateDecision => ({
    approved: false,
    reasonCode: code,
    reasonMessage: msg,
    effectiveLeverage: 1,
    marginUsed: '0',
    notionalValue: '0',
    quantity: '0',
    tp1Quantity: '0',
    tp2Quantity: '0',
    tp3Quantity: '0',
  });

  if (input.botState === 'PAUSED_DAILY_LOSS') {
    return emptyReject('PAUSED_DAILY_LOSS', 'Bot is paused due to hitting daily max loss limit');
  }

  const now = input.nowUtc ?? new Date();
  if (input.config.blockWeekends) {
    const day = now.getUTCDay();
    if (day === 0 || day === 6) {
      return emptyReject('WEEKEND_BLACKOUT', 'Weekend trading blackout is enabled');
    }
  }
  if (input.config.macroBlackout) {
    return emptyReject('MACRO_BLACKOUT', 'Macro news blackout switch is active');
  }

  if (input.openPositionsCount >= input.config.maxOpenPositions) {
    return emptyReject('MAX_OPEN_POSITIONS', `Max open positions (${input.config.maxOpenPositions}) reached`);
  }

  const equityNum = Number(input.equity);
  const pnlNum = Number(input.todayRealizedPnl);
  if (equityNum > 0 && pnlNum < 0 && input.config.dailyMaxLossPct > 0 && input.config.dailyMaxLossPct < 100) {
    const lossPct = (Math.abs(pnlNum) / equityNum) * 100;
    if (lossPct >= input.config.dailyMaxLossPct) {
      return emptyReject('DAILY_MAX_LOSS', `Daily loss ${lossPct.toFixed(2)}% reached limit ${input.config.dailyMaxLossPct}%`);
    }
  }

  const entry = Number(input.signal.price);
  const sl = Number(input.signal.stopLoss);
  const tp1 = Number(input.signal.tp1);
  const tp2 = input.signal.tp2 ? Number(input.signal.tp2) : undefined;
  const tp3 = input.signal.tp3 ? Number(input.signal.tp3) : undefined;
  const levelCheck = validateSignalDirectionLevels(input.signal.direction, entry, sl, tp1, tp2, tp3);
  if (!levelCheck.valid) {
    return emptyReject('INVALID_LEVELS', levelCheck.error ?? 'Invalid price levels');
  }

  if (input.instrument.status !== 'OPEN') {
    return emptyReject('SYMBOL_HALTED', `Instrument ${input.instrument.symbol} is not open for trading`);
  }

  const marketType = input.config.marketType ?? 'FUTURES';
  const directionMode = input.config.directionMode ?? 'BOTH';

  if (directionMode === 'LONG_ONLY' && input.signal.direction === 'SHORT') {
    return emptyReject('DIRECTION_FILTERED', 'Bot direction mode is set to LONG_ONLY');
  }
  if (directionMode === 'SHORT_ONLY' && input.signal.direction === 'LONG') {
    return emptyReject('DIRECTION_FILTERED', 'Bot direction mode is set to SHORT_ONLY');
  }
  if (marketType === 'SPOT' && input.signal.direction === 'SHORT') {
    return emptyReject('SPOT_NO_MARGIN_SHORT', 'Spot market only opens BUY (LONG) positions and sells held inventory on TP/SL');
  }

  const requestedLev = input.config.useSignalLeverage ? input.signal.leverage : input.config.maxLeverage;
  const effectiveLeverage = marketType === 'SPOT'
    ? 1
    : Math.max(
        input.instrument.minLeverage,
        Math.min(requestedLev, input.config.maxLeverage, input.instrument.maxLeverage)
      );

  // Margin allocation: enforce aggregate Bot Capital Cap across all open positions (1 or 10 trades never exceed effectiveCapitalUsd)
  const walletAvailNum = Math.max(0, Number(input.availableBalance) || 0);
  const effectiveCapNum = Number(input.effectiveCapitalUsd ?? 0);
  const usedBotMarginNum = Math.max(0, Number(input.usedBotMarginUsd ?? 0) || 0);
  const hasExplicitBudgetCap = Number.isFinite(effectiveCapNum) && effectiveCapNum > 0;

  let sizingBaseNum = walletAvailNum;
  let remainingBudgetNum = walletAvailNum;
  if (hasExplicitBudgetCap) {
    sizingBaseNum = effectiveCapNum;
    remainingBudgetNum = Math.max(0, effectiveCapNum - usedBotMarginNum);
    if (remainingBudgetNum < 1) {
      return emptyReject(
        'BOT_BUDGET_CAP_REACHED',
        `Bot allocated budget ($${effectiveCapNum.toFixed(2)}) is fully utilized by open trades ($${usedBotMarginNum.toFixed(2)} used)`
      );
    }
  }

  const marginPctDecimal = Math.max(0.5, Math.min(100, input.config.marginPct)) / 100;
  const desiredMarginNum = sizingBaseNum * marginPctDecimal;
  const cappedMarginNum = Math.min(desiredMarginNum, remainingBudgetNum, walletAvailNum);
  const marginUsed = quantizeDown(cappedMarginNum.toFixed(6), input.instrument.quotePrecision);

  if (decimalCmp(marginUsed, '1') < 0) {
    return emptyReject('INSUFFICIENT_MARGIN', `Allocated margin (${marginUsed} USDT) is below minimum 1 USDT`);
  }

  const notionalValue = decimalMul(marginUsed, effectiveLeverage, input.instrument.quotePrecision);
  if (input.instrument.minNotional && decimalCmp(notionalValue, input.instrument.minNotional) < 0) {
    return emptyReject('MIN_NOTIONAL', `Notional ${notionalValue} is below exchange minimum ${input.instrument.minNotional}`);
  }

  const rawQty = decimalDiv(notionalValue, input.signal.price, input.instrument.basePrecision);
  const quantity = quantizeDown(rawQty, input.instrument.basePrecision);

  if (decimalCmp(quantity, input.instrument.minTradeVolume) < 0) {
    return emptyReject(
      'MIN_QUANTITY',
      `Calculated quantity (${quantity}) is below minimum trade size (${input.instrument.minTradeVolume})`
    );
  }

  const tp1Pct = input.config.tp1ClosePct / 100;
  const tp2Pct = input.signal.tp2 ? input.config.tp2ClosePct / 100 : 0;

  const tp1Quantity = quantizeDown(decimalMul(quantity, tp1Pct.toFixed(4), 8), input.instrument.basePrecision);
  const tp2Quantity = tp2Pct > 0
    ? quantizeDown(decimalMul(quantity, tp2Pct.toFixed(4), 8), input.instrument.basePrecision)
    : '0';

  const usedSoFar = Number(tp1Quantity) + Number(tp2Quantity);
  const rem = Math.max(0, Number(quantity) - usedSoFar);
  const tp3Quantity = quantizeDown(rem.toFixed(input.instrument.basePrecision + 2), input.instrument.basePrecision);

  return {
    approved: true,
    reasonCode: 'APPROVED',
    reasonMessage: 'All Dollarino risk gates passed',
    effectiveLeverage,
    marginUsed,
    notionalValue,
    quantity,
    tp1Quantity,
    tp2Quantity,
    tp3Quantity,
  };
}
