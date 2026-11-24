import { wma as kiyaWma } from './kiya-bot.js';
import type { Candle, CustomIndicatorDefinition } from './types.js';

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i] ?? 0;
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const val = values[i] ?? prev;
    prev = (val - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

/** TradingView ta.rma (Wilder's Moving Average: alpha = 1 / period) */
export function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const alpha = 1 / period;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    const v = values[i] ?? prev;
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** TradingView ta.hma (Hull Moving Average: WMA(2*WMA(n/2) - WMA(n), sqrt(n))) */
export function hma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period < 2 || values.length < period) return out;
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtLen = Math.max(1, Math.round(Math.sqrt(period)));
  const wHalf = kiyaWma(values, half);
  const wFull = kiyaWma(values, period);
  const diff = values.map((_, i) =>
    Number.isFinite(wHalf[i]) && Number.isFinite(wFull[i]) ? 2 * wHalf[i]! - wFull[i]! : NaN
  );
  const validStart = diff.findIndex((x) => Number.isFinite(x));
  if (validStart < 0) return out;
  const tail = kiyaWma(diff.slice(validStart), sqrtLen);
  for (let i = 0; i < tail.length; i++) {
    out[validStart + i] = tail[i]!;
  }
  return out;
}

/** TradingView Session VWAP (resets at UTC day boundary) */
export function vwap(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  let cumPV = 0;
  let cumVol = 0;
  let currentDay = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const day = Math.floor(c.timestamp / 86_400_000);
    if (day !== currentDay) {
      currentDay = day;
      cumPV = 0;
      cumVol = 0;
    }
    const hlc3 = (c.high + c.low + c.close) / 3;
    const vol = Math.max(0.0001, c.volume);
    cumPV += hlc3 * vol;
    cumVol += vol;
    out[i] = cumVol > 0 ? cumPV / cumVol : hlc3;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (delta >= 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** TradingView ta.macd */
export function macd(values: number[], fast = 12, slow = 26, signalLen = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = values.map((_, i) =>
    Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i]) ? fastEma[i]! - slowEma[i]! : NaN
  );
  const validStart = line.findIndex((x) => Number.isFinite(x));
  const signal = new Array<number>(values.length).fill(NaN);
  const histogram = new Array<number>(values.length).fill(NaN);
  if (validStart >= 0) {
    const sigTail = ema(line.slice(validStart), signalLen);
    for (let i = 0; i < sigTail.length; i++) {
      const idx = validStart + i;
      signal[idx] = sigTail[i]!;
      if (Number.isFinite(signal[idx]) && Number.isFinite(line[idx])) {
        histogram[idx] = line[idx]! - signal[idx]!;
      }
    }
  }
  return { line, signal, histogram };
}

/** TradingView ta.stoch + %D smoothing */
export function stochastic(candles: Candle[], kLen = 14, smoothK = 3, dLen = 3) {
  const rawK = new Array<number>(candles.length).fill(NaN);
  for (let i = kLen - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const span = hh - ll;
    rawK[i] = span > 0 ? ((candles[i]!.close - ll) / span) * 100 : 50;
  }
  const start = rawK.findIndex((x) => Number.isFinite(x));
  const k = new Array<number>(candles.length).fill(NaN);
  const d = new Array<number>(candles.length).fill(NaN);
  if (start >= 0) {
    const kTail = sma(rawK.slice(start), smoothK);
    for (let i = 0; i < kTail.length; i++) k[start + i] = kTail[i]!;
    const dStart = k.findIndex((x) => Number.isFinite(x));
    if (dStart >= 0) {
      const dTail = sma(k.slice(dStart), dLen);
      for (let i = 0; i < dTail.length; i++) d[dStart + i] = dTail[i]!;
    }
  }
  return { k, d };
}

/** TradingView Stochastic RSI */
export function stochRsi(values: number[], rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3) {
  const r = rsi(values, rsiLen);
  const rawK = new Array<number>(values.length).fill(NaN);
  for (let i = stochLen - 1; i < values.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = i - stochLen + 1; j <= i; j++) {
      if (!Number.isFinite(r[j])) {
        ok = false;
        break;
      }
      hh = Math.max(hh, r[j]!);
      ll = Math.min(ll, r[j]!);
    }
    if (ok) {
      const span = hh - ll;
      rawK[i] = span > 0 ? ((r[i]! - ll) / span) * 100 : 50;
    }
  }
  const start = rawK.findIndex((x) => Number.isFinite(x));
  const k = new Array<number>(values.length).fill(NaN);
  const d = new Array<number>(values.length).fill(NaN);
  if (start >= 0) {
    const kTail = sma(rawK.slice(start), smoothK);
    for (let i = 0; i < kTail.length; i++) k[start + i] = kTail[i]!;
    const dStart = k.findIndex((x) => Number.isFinite(x));
    if (dStart >= 0) {
      const dTail = sma(k.slice(dStart), smoothD);
      for (let i = 0; i < dTail.length; i++) d[dStart + i] = dTail[i]!;
    }
  }
  return { k, d };
}

export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;

  const tr = new Array<number>(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      tr[i] = c.high - c.low;
    } else {
      const prevClose = candles[i - 1]!.close;
      tr[i] = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      );
    }
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i] ?? 0;
  let prev = sum / period;
  out[period] = prev;

  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + (tr[i] ?? 0)) / period;
    out[i] = prev;
  }
  return out;
}

/** TradingView ta.dmi (ADX, +DI, -DI) */
export function adx(candles: Candle[], diLen = 14, adxSmooth = 14) {
  const len = candles.length;
  const plusDI = new Array<number>(len).fill(NaN);
  const minusDI = new Array<number>(len).fill(NaN);
  const adxOut = new Array<number>(len).fill(NaN);
  if (len <= diLen * 2) return { adx: adxOut, plusDI, minusDI };

  const trArr = new Array<number>(len).fill(0);
  const dmPlus = new Array<number>(len).fill(0);
  const dmMinus = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    trArr[i] = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    const up = cur.high - prev.high;
    const dn = prev.low - cur.low;
    dmPlus[i] = up > dn && up > 0 ? up : 0;
    dmMinus[i] = dn > up && dn > 0 ? dn : 0;
  }

  const trRma = rma(trArr.slice(1), diLen);
  const pRma = rma(dmPlus.slice(1), diLen);
  const mRma = rma(dmMinus.slice(1), diLen);
  const dx = new Array<number>(len).fill(NaN);

  for (let i = 1; i < len; i++) {
    const t = trRma[i - 1];
    const p = pRma[i - 1];
    const m = mRma[i - 1];
    if (Number.isFinite(t) && t! > 0 && Number.isFinite(p) && Number.isFinite(m)) {
      const pdi = (100 * p!) / t!;
      const mdi = (100 * m!) / t!;
      plusDI[i] = pdi;
      minusDI[i] = mdi;
      const sum = pdi + mdi;
      dx[i] = sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0;
    }
  }

  const start = dx.findIndex((x) => Number.isFinite(x));
  if (start >= 0) {
    const adxTail = rma(dx.slice(start), adxSmooth);
    for (let i = 0; i < adxTail.length; i++) adxOut[start + i] = adxTail[i]!;
  }
  return { adx: adxOut, plusDI, minusDI };
}

export function bollingerBands(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i]!;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = (values[j] ?? m) - m;
      variance += diff * diff;
    }
    const std = Math.sqrt(variance / period);
    upper[i] = m + mult * std;
    lower[i] = m - mult * std;
  }
  return { upper, mid, lower };
}

/** TradingView Keltner Channels (EMA +/- mult * ATR) */
export function keltnerChannels(candles: Candle[], period = 20, mult = 1.5, atrPeriod = 10) {
  const closes = candles.map((c) => c.close);
  const mid = ema(closes, period);
  const a = atr(candles, atrPeriod);
  const upper = candles.map((_, i) =>
    Number.isFinite(mid[i]) && Number.isFinite(a[i]) ? mid[i]! + mult * a[i]! : NaN
  );
  const lower = candles.map((_, i) =>
    Number.isFinite(mid[i]) && Number.isFinite(a[i]) ? mid[i]! - mult * a[i]! : NaN
  );
  return { upper, mid, lower };
}

/** TradingView Donchian Channels */
export function donchianChannels(candles: Candle[], period = 20) {
  const upper = new Array<number>(candles.length).fill(NaN);
  const lower = new Array<number>(candles.length).fill(NaN);
  const mid = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    upper[i] = hh;
    lower[i] = ll;
    mid[i] = (hh + ll) / 2;
  }
  return { upper, mid, lower };
}

/** TradingView SuperTrend (ta.supertrend) */
export function supertrend(candles: Candle[], factor = 3, atrPeriod = 10) {
  const len = candles.length;
  const line = new Array<number>(len).fill(NaN);
  const direction = new Array<1 | -1>(len).fill(1); // 1 = bullish, -1 = bearish
  const a = atr(candles, atrPeriod);
  let upperBand = NaN;
  let lowerBand = NaN;
  let dir: 1 | -1 = 1;

  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(a[i])) continue;
    const c = candles[i]!;
    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + factor * a[i]!;
    const basicLower = hl2 - factor * a[i]!;

    if (!Number.isFinite(upperBand) || !Number.isFinite(lowerBand)) {
      upperBand = basicUpper;
      lowerBand = basicLower;
      dir = c.close >= hl2 ? 1 : -1;
    } else {
      const prevClose = candles[i - 1]!.close;
      lowerBand = basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;
      upperBand = basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
      if (dir === 1 && c.close < lowerBand) dir = -1;
      else if (dir === -1 && c.close > upperBand) dir = 1;
    }
    direction[i] = dir;
    line[i] = dir === 1 ? lowerBand : upperBand;
  }
  return { line, direction };
}

/** TradingView Ichimoku Cloud (Tenkan 9, Kijun 26, Senkou B 52) */
export function ichimoku(candles: Candle[], tenkanLen = 9, kijunLen = 26, senkouBLen = 52) {
  const midpoint = (idx: number, len: number) => {
    if (idx < len - 1) return NaN;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = idx - len + 1; j <= idx; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    return (hh + ll) / 2;
  };
  const tenkan = candles.map((_, i) => midpoint(i, tenkanLen));
  const kijun = candles.map((_, i) => midpoint(i, kijunLen));
  const spanA = candles.map((_, i) =>
    Number.isFinite(tenkan[i]) && Number.isFinite(kijun[i]) ? (tenkan[i]! + kijun[i]!) / 2 : NaN
  );
  const spanB = candles.map((_, i) => midpoint(i, senkouBLen));
  return { tenkan, kijun, spanA, spanB };
}

/** TradingView Commodity Channel Index (ta.cci) */
export function cci(candles: Candle[], period = 20): number[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const ma = sma(tp, period);
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    const m = ma[i]!;
    let devSum = 0;
    for (let j = i - period + 1; j <= i; j++) devSum += Math.abs(tp[j]! - m);
    const meanDev = devSum / period;
    out[i] = meanDev > 0 ? (tp[i]! - m) / (0.015 * meanDev) : 0;
  }
  return out;
}

/** TradingView Money Flow Index (ta.mfi) */
export function mfi(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tp[j]! * Math.max(0.0001, candles[j]!.volume);
      if (tp[j]! > tp[j - 1]!) pos += flow;
      else if (tp[j]! < tp[j - 1]!) neg += flow;
    }
    if (neg === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** TradingView On-Balance Volume (ta.obv) */
export function obv(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    if (cur.close > prev.close) out[i] = out[i - 1]! + cur.volume;
    else if (cur.close < prev.close) out[i] = out[i - 1]! - cur.volume;
    else out[i] = out[i - 1]!;
  }
  return out;
}

/** TradingView Parabolic SAR (ta.sar) */
export function parabolicSar(candles: Candle[], step = 0.02, maxStep = 0.2): number[] {
  const len = candles.length;
  const out = new Array<number>(len).fill(NaN);
  if (len < 3) return out;

  let isLong = candles[1]!.close >= candles[0]!.close;
  let af = step;
  let ep = isLong ? candles[1]!.high : candles[1]!.low;
  let sar = isLong ? candles[0]!.low : candles[0]!.high;
  out[1] = sar;

  for (let i = 2; i < len; i++) {
    const c = candles[i]!;
    sar = sar + af * (ep - sar);
    if (isLong) {
      sar = Math.min(sar, candles[i - 1]!.low, candles[i - 2]!.low);
      if (c.low < sar) {
        isLong = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(maxStep, af + step);
      }
    } else {
      sar = Math.max(sar, candles[i - 1]!.high, candles[i - 2]!.high);
      if (c.high > sar) {
        isLong = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(maxStep, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

/** TradingView Williams %R (ta.wpr) */
export function williamsR(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const span = hh - ll;
    out[i] = span > 0 ? ((hh - candles[i]!.close) / span) * -100 : -50;
  }
  return out;
}

/** TradingView Rate of Change (ta.roc) */
export function roc(values: number[], period = 9): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    const base = values[i - period] ?? 0;
    out[i] = base !== 0 ? (((values[i] ?? 0) - base) / base) * 100 : 0;
  }
  return out;
}

/** Classic Floor Pivot Points from previous period H/L/C */
export function pivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Strictly causal pivot detection: pivot at bar `i - rightBars` is ONLY confirmed
 * once bar `i` closes (never lookahead!).
 */
export function causalSwingLevels(candles: Candle[], leftBars = 3, rightBars = 2) {
  const confirmedHighs = new Array<number>(candles.length).fill(NaN);
  const confirmedLows = new Array<number>(candles.length).fill(NaN);
  let lastHigh = NaN;
  let lastLow = NaN;

  for (let i = leftBars + rightBars; i < candles.length; i++) {
    const pivotIdx = i - rightBars;
    const pivot = candles[pivotIdx]!;
    let isHigh = true;
    let isLow = true;
    for (let j = pivotIdx - leftBars; j <= i; j++) {
      if (j === pivotIdx) continue;
      if ((candles[j]?.high ?? -Infinity) >= pivot.high) isHigh = false;
      if ((candles[j]?.low ?? Infinity) <= pivot.low) isLow = false;
    }
    if (isHigh) lastHigh = pivot.high;
    if (isLow) lastLow = pivot.low;
    confirmedHighs[i] = lastHigh;
    confirmedLows[i] = lastLow;
  }

  return { confirmedHighs, confirmedLows };
}

export interface TradingViewIndicatorMeta {
  id: string;
  nameFa: string;
  nameEn: string;
  category: 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME';
  pineRef: string;
  defaultParams: Record<string, number>;
}

export const TRADINGVIEW_INDICATOR_CATALOG: TradingViewIndicatorMeta[] = [
  { id: 'EMA', nameFa: 'میانگین متحرک نمایی (EMA)', nameEn: 'Exponential Moving Average', category: 'TREND', pineRef: 'ta.ema', defaultParams: { fast: 9, slow: 21 } },
  { id: 'SMA', nameFa: 'میانگین متحرک ساده (SMA)', nameEn: 'Simple Moving Average', category: 'TREND', pineRef: 'ta.sma', defaultParams: { period: 50 } },
  { id: 'HMA', nameFa: 'میانگین متحرک هال (HMA)', nameEn: 'Hull Moving Average', category: 'TREND', pineRef: 'ta.hma', defaultParams: { period: 21 } },
  { id: 'RMA', nameFa: 'میانگین وایلدر تریدینگ‌ویو (RMA)', nameEn: 'Wilder Moving Average', category: 'TREND', pineRef: 'ta.rma', defaultParams: { period: 14 } },
  { id: 'ALMA', nameFa: 'میانگین گائوسی ALMA', nameEn: 'Arnaud Legoux MA', category: 'TREND', pineRef: 'ta.alma', defaultParams: { period: 14, offset: 0.85, sigma: 6 } },
  { id: 'VWMA', nameFa: 'میانگین وزنی حجم (VWMA)', nameEn: 'Volume Weighted MA', category: 'VOLUME', pineRef: 'ta.vwma', defaultParams: { period: 20 } },
  { id: 'VWAP', nameFa: 'خط میانگین حجم سشن (VWAP)', nameEn: 'Session VWAP', category: 'VOLUME', pineRef: 'ta.vwap', defaultParams: {} },
  { id: 'SUPERTREND', nameFa: 'سوپرترند دقیق (SuperTrend)', nameEn: 'SuperTrend', category: 'TREND', pineRef: 'ta.supertrend', defaultParams: { factor: 3, atrPeriod: 10 } },
  { id: 'ICHIMOKU', nameFa: 'ابر ایچیموکو (Ichimoku)', nameEn: 'Ichimoku Cloud', category: 'TREND', pineRef: 'Ichimoku', defaultParams: { tenkan: 9, kijun: 26, senkouB: 52 } },
  { id: 'ADX', nameFa: 'شاخص قدرت روند ADX / DMI', nameEn: 'ADX & +DI/-DI', category: 'TREND', pineRef: 'ta.dmi', defaultParams: { diLen: 14, adxSmooth: 14 } },
  { id: 'PSAR', nameFa: 'پارابولیک سار (Parabolic SAR)', nameEn: 'Parabolic SAR', category: 'TREND', pineRef: 'ta.sar', defaultParams: { step: 0.02, maxStep: 0.2 } },
  { id: 'RSI', nameFa: 'شاخص قدرت نسبی (RSI)', nameEn: 'Relative Strength Index', category: 'MOMENTUM', pineRef: 'ta.rsi', defaultParams: { period: 14, oversold: 30, overbought: 70 } },
  { id: 'MACD', nameFa: 'مکدی (MACD)', nameEn: 'MACD (12, 26, 9)', category: 'MOMENTUM', pineRef: 'ta.macd', defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { id: 'STOCH', nameFa: 'استوکاستیک (Stochastic)', nameEn: 'Stochastic %K/%D', category: 'MOMENTUM', pineRef: 'ta.stoch', defaultParams: { kLen: 14, smoothK: 3, dLen: 3 } },
  { id: 'STOCH_RSI', nameFa: 'استوکاستیک RSI', nameEn: 'Stochastic RSI', category: 'MOMENTUM', pineRef: 'StochRSI', defaultParams: { rsiLen: 14, stochLen: 14 } },
  { id: 'CCI', nameFa: 'کانال کالا (CCI)', nameEn: 'Commodity Channel Index', category: 'MOMENTUM', pineRef: 'ta.cci', defaultParams: { period: 20 } },
  { id: 'WILLIAMS_R', nameFa: 'ویلیامز درصد (%R)', nameEn: 'Williams %R', category: 'MOMENTUM', pineRef: 'ta.wpr', defaultParams: { period: 14 } },
  { id: 'ROC', nameFa: 'نرخ تغییر (ROC)', nameEn: 'Rate of Change', category: 'MOMENTUM', pineRef: 'ta.roc', defaultParams: { period: 9 } },
  { id: 'BB', nameFa: 'باند بولینگر (Bollinger Bands)', nameEn: 'Bollinger Bands', category: 'VOLATILITY', pineRef: 'ta.bb', defaultParams: { period: 20, mult: 2 } },
  { id: 'KELTNER', nameFa: 'کانال کلتنر (Keltner)', nameEn: 'Keltner Channels', category: 'VOLATILITY', pineRef: 'ta.kc', defaultParams: { period: 20, mult: 1.5 } },
  { id: 'DONCHIAN', nameFa: 'کانال دونچین (Donchian)', nameEn: 'Donchian Channels', category: 'VOLATILITY', pineRef: 'Donchian', defaultParams: { period: 20 } },
  { id: 'ATR', nameFa: 'میانگین نوسان واقعی (ATR)', nameEn: 'Average True Range', category: 'VOLATILITY', pineRef: 'ta.atr', defaultParams: { period: 14 } },
  { id: 'MFI', nameFa: 'جریان پول هوشمند (MFI)', nameEn: 'Money Flow Index', category: 'VOLUME', pineRef: 'ta.mfi', defaultParams: { period: 14 } },
  { id: 'OBV', nameFa: 'حجم تعادلی (OBV)', nameEn: 'On-Balance Volume', category: 'VOLUME', pineRef: 'ta.obv', defaultParams: {} },
  { id: 'PIVOTS', nameFa: 'نقاط پیوت کلاسیک (Pivots)', nameEn: 'Floor Pivot Points', category: 'TREND', pineRef: 'PivotPoints', defaultParams: {} },
];

/**
 * Extensible Registry for user-ported TradingView Pine Script indicators.
 */
const customIndicators = new Map<string, CustomIndicatorDefinition>();

export function registerCustomIndicator(def: CustomIndicatorDefinition): void {
  customIndicators.set(def.id, def);
}

export function listCustomIndicators(): CustomIndicatorDefinition[] {
  return Array.from(customIndicators.values());
}

export function getCustomIndicator(id: string): CustomIndicatorDefinition | undefined {
  return customIndicators.get(id);
}
