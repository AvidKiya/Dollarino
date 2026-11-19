import { atr, bollingerBands, causalSwingLevels, ema, getCustomIndicator, rsi } from './indicators.js';
import { computeKbosV11Detailed } from './kiya-bot.js';
import type {
  Candle,
  DollarinoSignal,
  KbosParams,
  SignalMixerChannelScore,
  SignalMixerResult,
  SignalMixerWeights,
  StrategyKey,
  StrategySignalOutput,
  Timeframe,
} from './types.js';

export const DEFAULT_MIXER_WEIGHTS: SignalMixerWeights = {
  trend: 20,
  momentum: 15,
  liquiditySweep: 20,
  fvg: 15,
  volatility: 10,
  volume: 10,
  structure: 5,
  meanReversion: 5,
};

export function timeframeToMs(tf: Timeframe | string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '30': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };
  return map[tf] ?? 900_000;
}

export function selectClosedCandles(candles: Candle[], tf: Timeframe | string, nowMs = Date.now()): Candle[] {
  const duration = timeframeToMs(tf);
  return candles.filter((c) => c.timestamp + duration <= nowMs);
}

export function alignHigherTimeframeTrends(
  ltfCandles: Candle[],
  ltfMs: number,
  htfCandles: Candle[],
  htfMs: number
): Array<'BULLISH' | 'BEARISH' | 'NEUTRAL'> {
  const htfCloses = htfCandles.map((c) => c.close);
  const fast = ema(htfCloses, 50);
  const slow = ema(htfCloses, 200);
  const fast20 = ema(htfCloses, 20);

  let hIdx = -1;
  return ltfCandles.map((ltf) => {
    const ltfCloseTime = ltf.timestamp + ltfMs;
    while (hIdx + 1 < htfCandles.length && htfCandles[hIdx + 1]!.timestamp + htfMs <= ltfCloseTime) {
      hIdx++;
    }
    if (hIdx < 0) return 'NEUTRAL';
    const f = Number.isFinite(slow[hIdx]) ? fast[hIdx] : fast20[hIdx];
    const s = Number.isFinite(slow[hIdx]) ? slow[hIdx] : fast[hIdx];
    if (!Number.isFinite(f) || !Number.isFinite(s)) return 'NEUTRAL';
    if (f! > s!) return 'BULLISH';
    if (f! < s!) return 'BEARISH';
    return 'NEUTRAL';
  });
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function build3TpLevels(direction: 'LONG' | 'SHORT', entry: number, riskDist: number) {
  const risk = Math.max(riskDist, entry * 0.0035);
  if (direction === 'LONG') {
    return {
      stopLoss: entry - risk,
      tp1: entry + risk * 1.0,
      tp2: entry + risk * 2.0,
      tp3: entry + risk * 3.0,
    };
  }
  return {
    stopLoss: entry + risk,
    tp1: entry - risk * 1.0,
    tp2: entry - risk * 2.0,
    tp3: entry - risk * 3.0,
  };
}

/**
 * Computes TimeTrade's 8-channel Weighted Signal Mixer at the latest closed bar index.
 */
export function evaluateSignalMixerAtBar(
  candles: Candle[],
  idx: number,
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  weights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS,
  threshold = 65
): SignalMixerResult {
  if (idx < 25 || idx >= candles.length) {
    return { compositeScore: 0, confidence: 0, direction: 'NONE', channels: [] };
  }
  const slice = candles.slice(0, idx + 1);
  const closes = slice.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(slice, 14);
  const bb = bollingerBands(closes, 20, 2);
  const swings = causalSwingLevels(slice, 3, 2);

  const c = slice[idx]!;
  const prev = slice[idx - 1]!;
  const prev2 = slice[idx - 2]!;
  const e20 = ema20[idx] ?? c.close;
  const e50 = ema50[idx] ?? c.close;
  const r = rsiArr[idx] ?? 50;
  const a = atrArr[idx] ?? c.close * 0.006;

  // 1. Trend (-100..+100)
  const trendRaw =
    (htfTrend === 'BULLISH' ? 60 : htfTrend === 'BEARISH' ? -60 : 0) +
    (e20 > e50 ? 40 : e20 < e50 ? -40 : 0);

  // 2. Momentum
  const momentumRaw =
    r > 55 && r < 72 ? 80 : r < 45 && r > 28 ? -80 : c.close > prev.high ? 50 : c.close < prev.low ? -50 : 0;

  // 3. Liquidity Sweep
  const swLow = swings.confirmedLows[idx - 1];
  const swHigh = swings.confirmedHighs[idx - 1];
  let sweepRaw = 0;
  if (Number.isFinite(swLow) && c.low < swLow! && c.close > swLow!) sweepRaw = 95;
  else if (Number.isFinite(swHigh) && c.high > swHigh! && c.close < swHigh!) sweepRaw = -95;

  // 4. Fair Value Gap (3-candle FVG)
  let fvgRaw = 0;
  if (c.low > prev2.high && prev.close > prev.open) fvgRaw = 85;
  else if (c.high < prev2.low && prev.close < prev.open) fvgRaw = -85;

  // 5. Volatility Regime (ATR% within healthy 0.2% - 2.5%)
  const atrPct = (a / Math.max(1e-9, c.close)) * 100;
  const volRegimeRaw = atrPct >= 0.2 && atrPct <= 2.5 ? (c.close >= c.open ? 65 : -65) : 0;

  // 6. Volume Surge
  const recentVols = slice.slice(-20).map((x) => x.volume);
  const medVol = Math.max(1e-9, median(recentVols));
  const volRatio = c.volume / medVol;
  const volRaw = volRatio >= 1.25 ? (c.close >= c.open ? 80 : -80) : volRatio >= 0.9 ? (c.close >= c.open ? 35 : -35) : 0;

  // 7. Structure (Body Ratio & Close location)
  const range = Math.max(1e-9, c.high - c.low);
  const bodyRatio = Math.abs(c.close - c.open) / range;
  const structureRaw = bodyRatio >= 0.55 ? (c.close > c.open ? 75 : -75) : 0;

  // 8. Mean Reversion (Bollinger)
  const lower = bb.lower[idx];
  const upper = bb.upper[idx];
  let mrRaw = 0;
  if (Number.isFinite(lower) && c.close <= lower! * 1.002) mrRaw = 75;
  else if (Number.isFinite(upper) && c.close >= upper! * 0.998) mrRaw = -75;

  const channels: SignalMixerChannelScore[] = [
    { key: 'trend', label: 'HTF & EMA Trend', score: trendRaw, weight: weights.trend },
    { key: 'momentum', label: 'RSI & Breakout Momentum', score: momentumRaw, weight: weights.momentum },
    { key: 'liquiditySweep', label: 'Liquidity Sweep', score: sweepRaw, weight: weights.liquiditySweep },
    { key: 'fvg', label: 'Fair Value Gap (FVG)', score: fvgRaw, weight: weights.fvg },
    { key: 'volatility', label: 'ATR Volatility Regime', score: volRegimeRaw, weight: weights.volatility },
    { key: 'volume', label: 'Volume Surge', score: volRaw, weight: weights.volume },
    { key: 'structure', label: 'Candle Body Structure', score: structureRaw, weight: weights.structure },
    { key: 'meanReversion', label: 'Bollinger Mean Reversion', score: mrRaw, weight: weights.meanReversion },
  ];

  const totalWeight = Math.max(1, channels.reduce((s, ch) => s + ch.weight, 0));
  const compositeScore = channels.reduce((s, ch) => s + ch.score * ch.weight, 0) / totalWeight;
  const confidence = Math.min(100, Math.round(Math.abs(compositeScore)));
  const direction = confidence >= threshold ? (compositeScore > 0 ? 'LONG' : 'SHORT') : 'NONE';

  return { compositeScore, confidence, direction, channels };
}

export interface StrategyParams {
  kbosParams?: Partial<KbosParams>;
  [key: string]: number | Partial<KbosParams> | undefined;
}

export function computeStrategySignals(
  strategyKey: StrategyKey,
  ltfCandles: Candle[],
  htfCandles: Candle[] = [],
  timeframe: Timeframe = '15m',
  higherTimeframe: Timeframe = '1h',
  params: StrategyParams = {}
): StrategySignalOutput[] {
  if (ltfCandles.length < 30) return [];

  if (strategyKey === 'kbos_v11') {
    return computeKbosV11Detailed(ltfCandles, timeframe, params.kbosParams ?? params).outputs;
  }

  const custom = getCustomIndicator(strategyKey);
  if (custom) {
    return custom.compute(ltfCandles, params as Record<string, number>);
  }

  const closes = ltfCandles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema60 = ema(closes, 60);
  const ema200 = ema(closes, 200);
  const rsiVals = rsi(closes, Number(params.rsiPeriod ?? 14));
  const atrVals = atr(ltfCandles, Number(params.atrPeriod ?? 14));
  const swings = causalSwingLevels(ltfCandles, 3, 2);

  const ltfMs = timeframeToMs(timeframe);
  const htfMs = timeframeToMs(higherTimeframe);
  const htfTrend =
    htfCandles.length >= 25
      ? alignHigherTimeframeTrends(ltfCandles, ltfMs, htfCandles, htfMs)
      : ltfCandles.map((_, i) => {
          const f = ema20[i];
          const s = ema50[i];
          if (!Number.isFinite(f) || !Number.isFinite(s)) return 'NEUTRAL' as const;
          return f! > s! ? ('BULLISH' as const) : f! < s! ? ('BEARISH' as const) : ('NEUTRAL' as const);
        });

  const outputs: StrategySignalOutput[] = [];
  let testFired = false;

  for (let i = 0; i < ltfCandles.length; i++) {
    const c = ltfCandles[i]!;
    const prev = i > 0 ? ltfCandles[i - 1]! : c;
    const f20 = ema20[i] ?? c.close;
    const f50 = ema50[i] ?? c.close;
    const f60 = ema60[i] ?? f50;
    const f200 = ema200[i] ?? f50;
    const r = rsiVals[i] ?? 50;
    const a = Number.isFinite(atrVals[i]) ? atrVals[i]! : c.close * 0.008;
    const trend = htfTrend[i] ?? 'NEUTRAL';

    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    let reason = 'No setup';
    let riskDist = a * 1.6;
    let entryLegs: StrategySignalOutput['entryLegs'];

    if (strategyKey === 'test_strategy') {
      if (i >= 20 && !testFired) {
        signal = params.testDirection === -1 ? 'SHORT' : 'LONG';
        reason = 'TestStrategy diagnostic 1-shot verified signal';
        testFired = true;
      }
    } else if ((strategyKey === 'sp2l' || strategyKey === 'dollarino_tv_hybrid') && i >= 26) {
      // Causal SP2L Spike-2Leg: 3-candle monotonic low/high + breakout over 20-bar lookback + gap + pullback trigger
      const b1 = ltfCandles[i - 3]!;
      const b2 = ltfCandles[i - 2]!;
      const b3 = ltfCandles[i - 1]!;
      const pre = ltfCandles[i - 4]!;
      const lookbackHigh = Math.max(...ltfCandles.slice(Math.max(0, i - 24), i - 3).map((x) => x.high));
      const lookbackLow = Math.min(...ltfCandles.slice(Math.max(0, i - 24), i - 3).map((x) => x.low));
      const spikeBody = Math.abs(b2.close - b2.open) / Math.max(1e-9, b2.high - b2.low);

      const bullSpike =
        b1.low <= b2.low &&
        b2.low <= b3.low &&
        b3.high - b1.low >= a * 1.4 &&
        b2.close > lookbackHigh &&
        spikeBody >= 0.55 &&
        b2.low > pre.high; // pressure gap

      const bearSpike =
        b1.high >= b2.high &&
        b2.high >= b3.high &&
        b1.high - b3.low >= a * 1.4 &&
        b2.close < lookbackLow &&
        spikeBody >= 0.55 &&
        b2.high < pre.low;

      if (bullSpike && c.low < b3.low && c.close > b1.low && trend !== 'BEARISH') {
        signal = 'LONG';
        riskDist = Math.max(a * 0.8, c.close - (b1.low - a * 0.1));
        entryLegs = [
          { label: 'Entry 1 (Retest)', price: b3.low, weight: 1 },
          { label: 'Entry 2 (EMA60)', price: f60, weight: 2 },
        ];
        reason = 'SP2L Spike-2Leg bullish breakout + pressure gap + pullback trigger';
      } else if (bearSpike && c.high > b3.high && c.close < b1.high && trend !== 'BULLISH') {
        signal = 'SHORT';
        riskDist = Math.max(a * 0.8, b1.high + a * 0.1 - c.close);
        entryLegs = [
          { label: 'Entry 1 (Retest)', price: b3.high, weight: 1 },
          { label: 'Entry 2 (EMA60)', price: f60, weight: 2 },
        ];
        reason = 'SP2L Spike-2Leg bearish breakdown + pressure gap + pullback trigger';
      } else {
        // Fallback liquidity sweep if SP2L 3-leg gap absent
        const swLow = swings.confirmedLows[i - 1];
        const swHigh = swings.confirmedHighs[i - 1];
        if (trend === 'BULLISH' && Number.isFinite(swLow) && c.low < swLow! && c.close > swLow! && c.close > c.open && r < 68) {
          signal = 'LONG';
          reason = 'SP2L liquidity sweep & close reclaim';
        } else if (trend === 'BEARISH' && Number.isFinite(swHigh) && c.high > swHigh! && c.close < swHigh! && c.close < c.open && r > 32) {
          signal = 'SHORT';
          reason = 'SP2L liquidity sweep & close rejection';
        }
      }
    } else if (strategyKey === 'grid_strategy' && i >= 55) {
      // CodexBot Bounded ATR Pullback Grid: EMA50 vs EMA200 spread 0.5%-4%, ATR% 0.2%-3%, volume >= median, RSI pullback
      const emaSpreadPct = (Math.abs(f50 - f200) / Math.max(1e-9, c.close)) * 100;
      const atrPct = (a / Math.max(1e-9, c.close)) * 100;
      const medVol = median(ltfCandles.slice(i - 20, i).map((x) => x.volume));
      const prevRsi = rsiVals[i - 1] ?? 50;
      const slope50 = f50 - (ema50[i - 5] ?? f50);

      if (emaSpreadPct >= 0.4 && emaSpreadPct <= 4.0 && atrPct >= 0.2 && atrPct <= 3.0 && c.volume >= medVol * 0.9) {
        if (trend === 'BULLISH' && slope50 > 0 && prevRsi > 52 && r >= 40 && r <= 56) {
          signal = 'LONG';
          riskDist = a * 2.0;
          entryLegs = [
            { label: 'Grid Layer 1', price: c.close, weight: 1 },
            { label: 'Grid Layer 2 (-1 ATR)', price: c.close - a, weight: 1 },
          ];
          reason = 'GridStrategy bounded bullish trend-pullback (EMA50/200 + RSI + ATR)';
        } else if (trend === 'BEARISH' && slope50 < 0 && prevRsi < 48 && r >= 44 && r <= 60) {
          signal = 'SHORT';
          riskDist = a * 2.0;
          entryLegs = [
            { label: 'Grid Layer 1', price: c.close, weight: 1 },
            { label: 'Grid Layer 2 (+1 ATR)', price: c.close + a, weight: 1 },
          ];
          reason = 'GridStrategy bounded bearish trend-pullback (EMA50/200 + RSI + ATR)';
        }
      }
    } else if (strategyKey === 'ema_trend_pullback' && i >= 50) {
      if (trend === 'BULLISH' && f20 > f50 && prev.low <= f20 && c.close > f20 && r >= 38 && r <= 65) {
        signal = 'LONG';
        riskDist = a * 1.5;
        reason = 'EMA 20/50 trend pullback bullish bounce';
      } else if (trend === 'BEARISH' && f20 < f50 && prev.high >= f20 && c.close < f20 && r >= 35 && r <= 62) {
        signal = 'SHORT';
        riskDist = a * 1.5;
        reason = 'EMA 20/50 trend pullback bearish rejection';
      }
    } else if (strategyKey === 'vibe_4h_daily_breakout' && i >= 22) {
      const high20 = Math.max(...ltfCandles.slice(i - 20, i).map((x) => x.high));
      if (trend === 'BULLISH' && c.close > high20 && r >= 45 && r <= 72) {
        signal = 'LONG';
        riskDist = a * 2.0;
        reason = 'Vibe 4H/Daily long-only 20-bar breakout';
      }
    } else if (strategyKey === 'vibe_4h_candle_confirmation' && i >= 25) {
      const body = Math.abs(c.close - c.open);
      const range = Math.max(c.high - c.low, 1e-9);
      const medVol = median(ltfCandles.slice(i - 20, i).map((x) => x.volume));
      const high3 = Math.max(...ltfCandles.slice(i - 3, i).map((x) => x.high));
      const low3 = Math.min(...ltfCandles.slice(i - 3, i).map((x) => x.low));
      if (trend === 'BULLISH' && body >= a * 0.5 && c.close > high3 && c.volume >= medVol * 0.8 && (c.close - c.low) / range >= 0.6) {
        signal = 'LONG';
        reason = '4H momentum candle confirmation bullish';
      } else if (trend === 'BEARISH' && body >= a * 0.5 && c.close < low3 && c.volume >= medVol * 0.8 && (c.high - c.close) / range >= 0.6) {
        signal = 'SHORT';
        reason = '4H momentum candle confirmation bearish';
      }
    } else if (strategyKey === 'signal_mixer' && i >= 30) {
      const mix = evaluateSignalMixerAtBar(ltfCandles, i, trend, DEFAULT_MIXER_WEIGHTS, Number(params.mixerThreshold ?? 65));
      if (mix.direction !== 'NONE') {
        signal = mix.direction;
        reason = `Weighted Signal Mixer (${mix.confidence}% confidence)`;
      }
    }

    const levels = signal !== 'NONE' ? build3TpLevels(signal, c.close, riskDist) : undefined;
    outputs.push({
      timestamp: c.timestamp,
      closeTime: c.timestamp + ltfMs,
      trend,
      signal,
      reason,
      price: c.close,
      atr: a,
      rsi: r,
      stopLoss: levels?.stopLoss,
      tp1: levels?.tp1,
      tp2: levels?.tp2,
      tp3: levels?.tp3,
      entryLegs,
    });
  }

  return outputs;
}

export function strategyOutputToDollarinoSignal(
  symbol: string,
  timeframe: string,
  leverage: number,
  output: StrategySignalOutput,
  channelHandle = '@Dollarinoofficial'
): DollarinoSignal | null {
  if (output.signal === 'NONE' || !output.stopLoss || !output.tp1) return null;
  const decimals = output.price >= 1000 ? 2 : output.price >= 1 ? 4 : 6;
  return {
    symbol,
    direction: output.signal,
    timeframe,
    price: output.price.toFixed(decimals),
    stopLoss: output.stopLoss.toFixed(decimals),
    leverage,
    tp1: output.tp1.toFixed(decimals),
    tp2: output.tp2 ? output.tp2.toFixed(decimals) : undefined,
    tp3: output.tp3 ? output.tp3.toFixed(decimals) : undefined,
    channelHandle,
    reason: output.reason,
  };
}
