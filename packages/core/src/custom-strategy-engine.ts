import { atr, bollingerBands, ema, hma as coreHma, macd as coreMacd, rma as coreRma, rsi, sma, stochRsi as coreStochRsi, stochastic as coreStochastic, vwap as coreVwap } from './indicators.js';
import type { Candle, StrategySignalOutput, Timeframe } from './types.js';
import { timeframeToMs } from './strategies.js';

export type CustomStrategyLanguage = 'pine' | 'python' | 'visual';

export interface CustomPlotSeries {
  id?: string;
  title: string;
  color: string;
  overlay: boolean;
  linewidth?: number;
  style?: 'line' | 'stepline' | 'histogram' | 'columns' | 'circles' | 'area';
  points: Array<{ time: number; value: number; color?: string }>;
}

export interface CustomHLine {
  id?: string;
  title: string;
  price: number;
  color: string;
  linestyle?: 'solid' | 'dashed' | 'dotted';
  linewidth?: number;
  overlay?: boolean;
}

export interface CustomFillZone {
  id: string;
  color: string;
  overlay: boolean;
  points: Array<{ time: number; top: number; bottom: number }>;
}

export interface CustomBgBand {
  time: number;
  color: string;
}

export interface CustomBarColor {
  time: number;
  color: string;
}

export interface CustomChartLabel {
  time: number;
  price: number;
  text: string;
  color: string;
  textcolor: string;
  style?: 'label_up' | 'label_down' | 'label_left' | 'label_right' | 'label_center' | 'none';
  size?: 'tiny' | 'small' | 'normal' | 'large';
  yloc?: 'price' | 'abovebar' | 'belowbar';
  tooltip?: string;
}

export interface CustomChartLine {
  x1Time: number;
  y1: number;
  x2Time: number;
  y2: number;
  color: string;
  width?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  extend?: 'none' | 'right' | 'left' | 'both';
}

export interface CustomChartBox {
  leftTime: number;
  rightTime: number;
  top: number;
  bottom: number;
  borderColor: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  bgcolor: string;
  text?: string;
  textColor?: string;
  extend?: 'none' | 'right' | 'left' | 'both';
}

export interface CustomChartTableCell {
  row: number;
  col: number;
  text: string;
  bgcolor?: string;
  textColor?: string;
  textSize?: 'tiny' | 'small' | 'normal' | 'large';
}

export interface CustomChartTable {
  position:
    | 'top_right'
    | 'top_left'
    | 'bottom_right'
    | 'bottom_left'
    | 'middle_right'
    | 'middle_left'
    | 'top_center'
    | 'bottom_center';
  columns: number;
  rows: number;
  bgcolor: string;
  borderColor: string;
  borderWidth?: number;
  cells: CustomChartTableCell[];
}

export interface CustomChartMarker {
  time: number;
  position: 'belowBar' | 'aboveBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
}

export interface CustomStrategyEvalResult {
  valid: boolean;
  language: CustomStrategyLanguage;
  title: string;
  overlay: boolean;
  errors: string[];
  warnings: string[];
  signals: StrategySignalOutput[];
  plots: CustomPlotSeries[];
  markers: CustomChartMarker[];
  hlines?: CustomHLine[];
  fills?: CustomFillZone[];
  bgcolors?: CustomBgBand[];
  barcolors?: CustomBarColor[];
  labels?: CustomChartLabel[];
  lines?: CustomChartLine[];
  boxes?: CustomChartBox[];
  tables?: CustomChartTable[];
  latestSignal: StrategySignalOutput | null;
}

export interface VisualRuleCondition {
  id: string;
  kind:
    | 'EMA_CROSS_ABOVE'
    | 'EMA_CROSS_BELOW'
    | 'PRICE_ABOVE_EMA'
    | 'PRICE_BELOW_EMA'
    | 'RSI_BELOW'
    | 'RSI_ABOVE'
    | 'MACD_CROSS_UP'
    | 'MACD_CROSS_DOWN'
    | 'BB_LOWER_TOUCH'
    | 'BB_UPPER_TOUCH'
    | 'SUPERTREND_BULL'
    | 'SUPERTREND_BEAR'
    | 'VOLUME_SPIKE';
  param1: number;
  param2?: number;
}

export interface VisualStrategyDefinition {
  name: string;
  logic: 'ALL' | 'ANY';
  slAtrMult: number;
  tp1R: number;
  tp2R: number;
  tp3R: number;
  longRules: VisualRuleCondition[];
  shortRules: VisualRuleCondition[];
}

export interface SampleCustomStrategy {
  id: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  descriptionEn: string;
  language: CustomStrategyLanguage;
  category: string;
  code: string;
}

/* ============================================================================
 * Color Utilities (Full TradingView color.* Palette + RGBA / Transparency)
 * ============================================================================ */

const PINE_NAMED_COLORS: Record<string, string> = {
  'color.green': '#10d9a3',
  'color.lime': '#12e35d',
  'color.teal': '#14b8a6',
  'color.olive': '#84cc16',
  'color.red': '#ff4d6d',
  'color.maroon': '#be123c',
  'color.rose': '#fb7185',
  'color.blue': '#2b74ff',
  'color.navy': '#1e3a8a',
  'color.aqua': '#38e1ff',
  'color.cyan': '#38e1ff',
  'color.yellow': '#e8c15a',
  'color.orange': '#ff8a00',
  'color.purple': '#a855f7',
  'color.fuchsia': '#d946ef',
  'color.white': '#e2e8f0',
  'color.silver': '#cbd5e1',
  'color.gray': '#94a3b8',
  'color.black': '#0f172a',
  green: '#10d9a3',
  lime: '#12e35d',
  teal: '#14b8a6',
  red: '#ff4d6d',
  blue: '#2b74ff',
  cyan: '#38e1ff',
  aqua: '#38e1ff',
  gold: '#e8c15a',
  yellow: '#e8c15a',
  orange: '#ff8a00',
  purple: '#a855f7',
  white: '#e2e8f0',
  gray: '#94a3b8',
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return hex;
  const a = Math.max(0, Math.min(1, Number(alpha.toFixed(3))));
  return `rgba(${r},${g},${b},${a})`;
}

function applyTransparency(colorStr: string, transpPct: number): string {
  const alpha = Math.max(0, Math.min(1, 1 - transpPct / 100));
  if (colorStr.startsWith('#')) return hexToRgba(colorStr, alpha);
  const m = colorStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${Number(alpha.toFixed(3))})`;
  return colorStr;
}

function resolveColorToken(raw: string, fallback = '#2b74ff'): string {
  const t = raw.trim();
  if (!t || t === 'na') return '';
  if (t.startsWith('rgba(') || t.startsWith('rgb(')) return t;
  const unquoted = t.replace(/['"]/g, '').trim();
  if (unquoted.startsWith('#') && (unquoted.length === 4 || unquoted.length === 7 || unquoted.length === 9)) {
    return unquoted;
  }
  const low = unquoted.toLowerCase();
  if (PINE_NAMED_COLORS[low]) return PINE_NAMED_COLORS[low]!;
  return fallback;
}

/* ============================================================================
 * Shared Technical Math Helpers (Full TradingView ta.* Library)
 * ============================================================================ */

function rma(values: number[], period: number): number[] {
  return coreRma(values, period);
}

function wma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    let valid = true;
    for (let j = 0; j < period; j++) {
      const v = values[i - period + 1 + j];
      if (v === undefined || !Number.isFinite(v)) {
        valid = false;
        break;
      }
      acc += v * (j + 1);
    }
    out[i] = valid ? acc / denom : NaN;
  }
  return out;
}

function vwma(values: number[], volume: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let pv = 0;
    let vs = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? NaN;
      const vol = Math.max(0, volume[j] ?? 0);
      if (Number.isFinite(v)) {
        pv += v * vol;
        vs += vol;
      }
    }
    out[i] = vs > 0 ? pv / vs : values[i] ?? NaN;
  }
  return out;
}

function alma(values: number[], period = 9, offset = 0.85, sigma = 6): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const m = offset * (period - 1);
  const s = period / Math.max(0.1, sigma);
  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < period; i++) {
    const w = Math.exp(-((i - m) * (i - m)) / (2 * s * s));
    weights.push(w);
    wSum += w;
  }
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const val = values[i - period + 1 + j]!;
      if (!Number.isFinite(val)) {
        ok = false;
        break;
      }
      acc += val * weights[j]!;
    }
    out[i] = ok && wSum > 0 ? acc / wSum : NaN;
  }
  return out;
}

function dema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const start = e1.findIndex((x) => Number.isFinite(x));
  const e2 = new Array<number>(values.length).fill(NaN);
  if (start >= 0) {
    const t = ema(e1.slice(start), period);
    for (let i = 0; i < t.length; i++) e2[start + i] = t[i]!;
  }
  return e1.map((v, i) => (Number.isFinite(v) && Number.isFinite(e2[i]) ? 2 * v - e2[i]! : NaN));
}

function tema(values: number[], period: number): number[] {
  const e1 = ema(values, period);
  const s1 = e1.findIndex((x) => Number.isFinite(x));
  const e2 = new Array<number>(values.length).fill(NaN);
  if (s1 >= 0) {
    const t = ema(e1.slice(s1), period);
    for (let i = 0; i < t.length; i++) e2[s1 + i] = t[i]!;
  }
  const s2 = e2.findIndex((x) => Number.isFinite(x));
  const e3 = new Array<number>(values.length).fill(NaN);
  if (s2 >= 0) {
    const t = ema(e2.slice(s2), period);
    for (let i = 0; i < t.length; i++) e3[s2 + i] = t[i]!;
  }
  return e1.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(e2[i]) && Number.isFinite(e3[i]) ? 3 * v - 3 * e2[i]! + e3[i]! : NaN
  );
}

function linreg(values: number[], period: number, offset = 0): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 1) return [...values];
  for (let i = period - 1; i < values.length; i++) {
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const y = values[i - period + 1 + j]!;
      if (!Number.isFinite(y)) {
        ok = false;
        break;
      }
      sx += j;
      sy += y;
      sxx += j * j;
      sxy += j * y;
    }
    if (!ok) continue;
    const denom = period * sxx - sx * sx;
    if (denom === 0) continue;
    const slope = (period * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / period;
    out[i] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

function stdev(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const m = mean[i];
    if (m === undefined || !Number.isFinite(m)) continue;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = (values[j] ?? m) - m;
      sq += d * d;
    }
    out[i] = Math.sqrt(sq / period);
  }
  return out;
}

function variance(values: number[], period: number): number[] {
  return stdev(values, period).map((v) => (Number.isFinite(v) ? v * v : NaN));
}

function highest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mx = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? -Infinity;
      if (v > mx) mx = v;
    }
    out[i] = mx;
  }
  return out;
}

function lowest(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mn = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j] ?? Infinity;
      if (v < mn) mn = v;
    }
    out[i] = mn;
  }
  return out;
}

function highestBars(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mx = -Infinity;
    let offset = 0;
    for (let j = 0; j < period; j++) {
      const v = values[i - j] ?? -Infinity;
      if (v > mx) {
        mx = v;
        offset = -j;
      }
    }
    out[i] = offset;
  }
  return out;
}

function lowestBars(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mn = Infinity;
    let offset = 0;
    for (let j = 0; j < period; j++) {
      const v = values[i - j] ?? Infinity;
      if (v < mn) {
        mn = v;
        offset = -j;
      }
    }
    out[i] = offset;
  }
  return out;
}

function pivotHigh(values: number[], leftBars: number, rightBars: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const L = Math.max(1, leftBars);
  const R = Math.max(1, rightBars);
  for (let i = L + R; i < values.length; i++) {
    const pIdx = i - R;
    const pVal = values[pIdx]!;
    if (!Number.isFinite(pVal)) continue;
    let isPivot = true;
    for (let j = pIdx - L; j < pIdx; j++) {
      if ((values[j] ?? -Infinity) > pVal) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;
    for (let j = pIdx + 1; j <= pIdx + R; j++) {
      if ((values[j] ?? -Infinity) >= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out[i] = pVal;
  }
  return out;
}

function pivotLow(values: number[], leftBars: number, rightBars: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const L = Math.max(1, leftBars);
  const R = Math.max(1, rightBars);
  for (let i = L + R; i < values.length; i++) {
    const pIdx = i - R;
    const pVal = values[pIdx]!;
    if (!Number.isFinite(pVal)) continue;
    let isPivot = true;
    for (let j = pIdx - L; j < pIdx; j++) {
      if ((values[j] ?? Infinity) < pVal) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) continue;
    for (let j = pIdx + 1; j <= pIdx + R; j++) {
      if ((values[j] ?? Infinity) <= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out[i] = pVal;
  }
  return out;
}

function macdSeries(values: number[], fast = 12, slow = 26, sig = 9) {
  const m = coreMacd(values, fast, slow, sig);
  return { line: m.line, signalLine: m.signal, hist: m.histogram };
}

function supertrendSeries(candles: Candle[], factor = 3, atrLen = 10) {
  const atrArr = atr(candles, atrLen);
  const st = new Array<number>(candles.length).fill(NaN);
  const dir = new Array<number>(candles.length).fill(1);
  let finalUpper = 0;
  let finalLower = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const a = atrArr[i];
    if (!Number.isFinite(a)) continue;
    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + factor * a!;
    const basicLower = hl2 - factor * a!;

    if (i === 0 || !Number.isFinite(st[i - 1])) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      dir[i] = c.close >= hl2 ? 1 : -1;
      st[i] = dir[i] === 1 ? finalLower : finalUpper;
      continue;
    }

    const prevClose = candles[i - 1]!.close;
    finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

    const prevDir = dir[i - 1]!;
    if (prevDir === -1 && c.close > finalUpper) {
      dir[i] = 1;
    } else if (prevDir === 1 && c.close < finalLower) {
      dir[i] = -1;
    } else {
      dir[i] = prevDir;
    }
    st[i] = dir[i] === 1 ? finalLower : finalUpper;
  }
  return { st, dir };
}

function dmiSeries(candles: Candle[], diLen = 14, adxSmooth = 14) {
  const len = candles.length;
  const plusDi = new Array<number>(len).fill(NaN);
  const minusDi = new Array<number>(len).fill(NaN);
  const adx = new Array<number>(len).fill(NaN);
  if (len < diLen + 2) return { plusDi, minusDi, adx };

  const trArr = new Array<number>(len).fill(0);
  const plusDm = new Array<number>(len).fill(0);
  const minusDm = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    trArr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const sTr = rma(trArr, diLen);
  const sPlus = rma(plusDm, diLen);
  const sMinus = rma(minusDm, diLen);
  const dx = new Array<number>(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(sTr[i]) || sTr[i]! <= 0) continue;
    plusDi[i] = (100 * (sPlus[i] ?? 0)) / sTr[i]!;
    minusDi[i] = (100 * (sMinus[i] ?? 0)) / sTr[i]!;
    const sum = plusDi[i]! + minusDi[i]!;
    dx[i] = sum > 0 ? (100 * Math.abs(plusDi[i]! - minusDi[i]!)) / sum : 0;
  }
  const start = dx.findIndex((v) => Number.isFinite(v));
  if (start >= 0) {
    const smoothed = rma(dx.slice(start), adxSmooth);
    for (let i = 0; i < smoothed.length; i++) adx[start + i] = smoothed[i]!;
  }
  return { plusDi, minusDi, adx };
}

function cciSeries(candles: Candle[], period = 20): number[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const m = sma(tp, period);
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    const mean = m[i];
    if (!Number.isFinite(mean)) continue;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j]! - mean!);
    md /= period;
    out[i] = md > 0 ? (tp[i]! - mean!) / (0.015 * md) : 0;
  }
  return out;
}

function mfiSeries(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const pos = new Array<number>(candles.length).fill(0);
  const neg = new Array<number>(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const mf = tp[i]! * Math.max(candles[i]!.volume, 1e-6);
    if (tp[i]! > tp[i - 1]!) pos[i] = mf;
    else if (tp[i]! < tp[i - 1]!) neg[i] = mf;
  }
  for (let i = period; i < candles.length; i++) {
    let p = 0;
    let n = 0;
    for (let j = i - period + 1; j <= i; j++) {
      p += pos[j]!;
      n += neg[j]!;
    }
    out[i] = n === 0 ? 100 : 100 - 100 / (1 + p / n);
  }
  return out;
}

function psarSeries(candles: Candle[], start = 0.02, inc = 0.02, max = 0.2): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length < 3) return out;
  let bull = candles[1]!.close >= candles[0]!.close;
  let af = start;
  let ep = bull ? candles[1]!.high : candles[1]!.low;
  let sar = bull ? candles[0]!.low : candles[0]!.high;
  out[1] = sar;
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i]!;
    const p1 = candles[i - 1]!;
    const p2 = candles[i - 2]!;
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, p1.low, p2.low);
      if (c.low < sar) {
        bull = false;
        sar = ep;
        ep = c.low;
        af = start;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(max, af + inc);
      }
    } else {
      sar = Math.max(sar, p1.high, p2.high);
      if (c.high > sar) {
        bull = true;
        sar = ep;
        ep = c.high;
        af = start;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(max, af + inc);
      }
    }
    out[i] = sar;
  }
  return out;
}

function keltnerSeries(candles: Candle[], period = 20, mult = 1.5, atrLen = 10) {
  const basis = ema(candles.map((c) => c.close), period);
  const a = atr(candles, atrLen);
  return {
    mid: basis,
    upper: basis.map((m, i) => (Number.isFinite(m) && Number.isFinite(a[i]) ? m + mult * a[i]! : NaN)),
    lower: basis.map((m, i) => (Number.isFinite(m) && Number.isFinite(a[i]) ? m - mult * a[i]! : NaN)),
  };
}

function shiftSeries(arr: number[], offset: number): number[] {
  if (offset <= 0) return arr;
  return arr.map((_, i) => (i - offset >= 0 ? (arr[i - offset] ?? NaN) : NaN));
}

function crossoverSeries(a: number[], b: number[]): number[] {
  return a.map((_, i) => {
    if (i < 1) return 0;
    const a0 = a[i - 1]!;
    const a1 = a[i]!;
    const b0 = b[i - 1]!;
    const b1 = b[i]!;
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) return 0;
    return a0 <= b0 && a1 > b1 ? 1 : 0;
  });
}

function crossunderSeries(a: number[], b: number[]): number[] {
  return a.map((_, i) => {
    if (i < 1) return 0;
    const a0 = a[i - 1]!;
    const a1 = a[i]!;
    const b0 = b[i - 1]!;
    const b1 = b[i]!;
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) return 0;
    return a0 >= b0 && a1 < b1 ? 1 : 0;
  });
}

function barsSinceSeries(cond: number[]): number[] {
  const out = new Array<number>(cond.length).fill(NaN);
  let lastTrue = -1;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i] && Number.isFinite(cond[i])) {
      lastTrue = i;
      out[i] = 0;
    } else if (lastTrue >= 0) {
      out[i] = i - lastTrue;
    }
  }
  return out;
}

function valueWhenSeries(cond: number[], source: number[], occurrence = 0): number[] {
  const out = new Array<number>(cond.length).fill(NaN);
  const hits: number[] = [];
  for (let i = 0; i < cond.length; i++) {
    if (cond[i] && Number.isFinite(cond[i]) && Number.isFinite(source[i])) {
      hits.push(source[i]!);
    }
    const idx = hits.length - 1 - occurrence;
    out[i] = idx >= 0 ? hits[idx]! : NaN;
  }
  return out;
}

function resampleCandlesForTf(base: Candle[], tfRaw: string): { htf: Candle[]; mapIdx: number[] } {
  const clean = tfRaw.replace(/['"]/g, '').trim().toUpperCase();
  const tfMsMap: Record<string, number> = {
    '1': 60_000,
    '1M': 60_000,
    '3': 180_000,
    '3M': 180_000,
    '5': 300_000,
    '5M': 300_000,
    '15': 900_000,
    '15M': 900_000,
    '30': 1_800_000,
    '30M': 1_800_000,
    '60': 3_600_000,
    '1H': 3_600_000,
    '120': 7_200_000,
    '2H': 7_200_000,
    '240': 14_400_000,
    '4H': 14_400_000,
    '360': 21_600_000,
    '6H': 21_600_000,
    '720': 43_200_000,
    '12H': 43_200_000,
    'D': 86_400_000,
    '1D': 86_400_000,
    'W': 604_800_000,
    '1W': 604_800_000,
  };
  const bucketMs = tfMsMap[clean] ?? 3_600_000;
  const htf: Candle[] = [];
  const mapIdx = new Array<number>(base.length).fill(0);
  let curBucket = -1;
  for (let i = 0; i < base.length; i++) {
    const c = base[i]!;
    const b = Math.floor(c.timestamp / bucketMs) * bucketMs;
    if (b !== curBucket) {
      curBucket = b;
      htf.push({ timestamp: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      const last = htf[htf.length - 1]!;
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
    mapIdx[i] = Math.max(0, htf.length - 1);
  }
  return { htf, mapIdx };
}

/* ============================================================================
 * Runtime Environment, Drawing Objects, User Functions & AST-Free Evaluator
 * ============================================================================ */

interface DrawLabelObj {
  id: string;
  barIdx: number;
  price: number;
  text: string;
  color: string;
  textcolor: string;
  style: CustomChartLabel['style'];
  size: CustomChartLabel['size'];
  yloc: CustomChartLabel['yloc'];
  tooltip?: string;
  deleted?: boolean;
}

interface DrawLineObj {
  id: string;
  x1Bar: number;
  y1: number;
  x2Bar: number;
  y2: number;
  color: string;
  width: number;
  style: CustomChartLine['style'];
  extend: CustomChartLine['extend'];
  deleted?: boolean;
}

interface DrawBoxObj {
  id: string;
  leftBar: number;
  rightBar: number;
  top: number;
  bottom: number;
  borderColor: string;
  borderWidth: number;
  borderStyle: CustomChartBox['borderStyle'];
  bgcolor: string;
  text?: string;
  textColor?: string;
  extend: CustomChartBox['extend'];
  deleted?: boolean;
}

interface DrawTableObj {
  id: string;
  position: CustomChartTable['position'];
  columns: number;
  rows: number;
  bgcolor: string;
  borderColor: string;
  borderWidth: number;
  cells: Map<string, CustomChartTableCell>;
}

interface UserPineFn {
  params: Array<{ name: string; defaultExpr?: string }>;
  bodyLines: string[];
}

type Val = number[] | number | string | boolean | Val[] | { __objType: 'label' | 'line' | 'box' | 'table' | 'array'; id: string };

interface ExecEnv {
  candles: Candle[];
  timeframe: string;
  vars: Map<string, Val>;
  barLocals: Map<string, Val>;
  userFns: Map<string, UserPineFn>;
  plots: CustomPlotSeries[];
  plotSeriesById: Map<string, number[]>;
  hlines: CustomHLine[];
  hlinePriceById: Map<string, number>;
  fills: CustomFillZone[];
  bgcolors: CustomBgBand[];
  barcolors: CustomBarColor[];
  labels: Map<string, DrawLabelObj>;
  lines: Map<string, DrawLineObj>;
  boxes: Map<string, DrawBoxObj>;
  tables: Map<string, DrawTableObj>;
  arrays: Map<string, Val[]>;
  longFlags: number[];
  shortFlags: number[];
  closeFlags: number[];
  warnings: string[];
  barIdx: number | null;
  nextObjSeq: number;
}

function barTimeSec(candles: Candle[], barIdx: number): number {
  if (!candles.length) return 0;
  if (barIdx < 0) {
    const step = candles.length >= 2 ? Math.max(60, Math.floor((candles[1]!.timestamp - candles[0]!.timestamp) / 1000)) : 900;
    return Math.floor(candles[0]!.timestamp / 1000) + barIdx * step;
  }
  if (barIdx >= candles.length) {
    const step = candles.length >= 2 ? Math.max(60, Math.floor((candles[candles.length - 1]!.timestamp - candles[candles.length - 2]!.timestamp) / 1000)) : 900;
    return Math.floor(candles[candles.length - 1]!.timestamp / 1000) + (barIdx - candles.length + 1) * step;
  }
  return Math.floor(candles[barIdx]!.timestamp / 1000);
}

function toScalarAtBar(v: Val, barIdx: number): number | string {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const item = v[barIdx];
    if (item === undefined) return NaN;
    if (typeof item === 'number' || typeof item === 'string') return item;
    if (typeof item === 'boolean') return item ? 1 : 0;
    return NaN;
  }
  return NaN;
}

function toNumberAtBar(v: Val, barIdx: number, fallback = NaN): number {
  const s = toScalarAtBar(v, barIdx);
  if (typeof s === 'number') return Number.isFinite(s) ? s : fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function toSeries(v: Val, len: number): number[] {
  if (Array.isArray(v)) {
    if (v.length === len && (v.length === 0 || typeof v[0] === 'number')) return v as number[];
    return Array.from({ length: len }, (_, i) => Number(v[i] ?? NaN));
  }
  if (typeof v === 'boolean') return new Array<number>(len).fill(v ? 1 : 0);
  if (typeof v === 'number') return new Array<number>(len).fill(v);
  const n = Number(v);
  return new Array<number>(len).fill(Number.isFinite(n) ? n : NaN);
}

function toColorSeries(v: Val, len: number, fallback = ''): string[] {
  if (Array.isArray(v)) {
    return Array.from({ length: len }, (_, i) => {
      const item = v[i];
      if (typeof item === 'string') return resolveColorToken(item, fallback);
      if (typeof item === 'number' && Number.isFinite(item) && item !== 0) return fallback;
      return '';
    });
  }
  if (typeof v === 'string') {
    const c = resolveColorToken(v, fallback);
    return new Array<string>(len).fill(c);
  }
  return new Array<string>(len).fill(fallback);
}

function splitTopLevelArgs(argStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote && argStr[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function stripNamedArg(raw: string): { key?: string; expr: string } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote) {
      if (ch === quote && raw[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === '=' && depth === 0 && raw[i + 1] !== '=' && raw[i - 1] !== '!' && raw[i - 1] !== '<' && raw[i - 1] !== '>' && raw[i - 1] !== ':') {
      const left = raw.slice(0, i).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(left)) {
        return { key: left, expr: raw.slice(i + 1).trim() };
      }
    }
  }
  return { expr: raw };
}

function lookupVar(name: string, env: ExecEnv): Val | undefined {
  if (env.barIdx !== null && env.barLocals.has(name)) {
    const v = env.barLocals.get(name);
    if (v !== undefined) return v;
  }
  return env.vars.get(name);
}

function resolvePlotStyle(raw: string): CustomPlotSeries['style'] {
  const s = raw.toLowerCase();
  if (s.includes('stepline')) return 'stepline';
  if (s.includes('histogram')) return 'histogram';
  if (s.includes('columns')) return 'columns';
  if (s.includes('circles') || s.includes('cross')) return 'circles';
  if (s.includes('area')) return 'area';
  return 'line';
}

function resolveLineStyle(raw: string): CustomHLine['linestyle'] {
  const s = raw.toLowerCase();
  if (s.includes('dotted')) return 'dotted';
  if (s.includes('dashed')) return 'dashed';
  return 'solid';
}

function resolveExtend(raw: string): 'none' | 'right' | 'left' | 'both' {
  const s = raw.toLowerCase();
  if (s.includes('both')) return 'both';
  if (s.includes('right')) return 'right';
  if (s.includes('left')) return 'left';
  return 'none';
}

function resolveTablePosition(raw: string): CustomChartTable['position'] {
  const clean = raw.replace(/^position\./i, '').replace(/['"]/g, '').trim().toLowerCase();
  const valid: CustomChartTable['position'][] = [
    'top_right',
    'top_left',
    'bottom_right',
    'bottom_left',
    'middle_right',
    'middle_left',
    'top_center',
    'bottom_center',
  ];
  return (valid.find((p) => p === clean) ?? 'top_right') as CustomChartTable['position'];
}

function formatPineNum(n: number, fmt?: string): string {
  if (!Number.isFinite(n)) return 'na';
  if (fmt && fmt.includes('#')) {
    const dot = fmt.indexOf('.');
    const dec = dot >= 0 ? fmt.slice(dot + 1).replace(/[^#0]/g, '').length : 0;
    return n.toFixed(Math.min(8, dec));
  }
  if (fmt && fmt.toLowerCase().includes('percent')) return `${n.toFixed(2)}%`;
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) < 0.01 && n !== 0) return n.toPrecision(4);
  return Number(n.toFixed(4)).toString();
}

function callBuiltinFn(name: string, rawArgs: string[], env: ExecEnv): Val | Val[] {
  const n = name.toLowerCase();
  const len = env.candles.length;
  const bar = env.barIdx;
  const closeArr = env.vars.get('close') as number[];
  const highArr = env.vars.get('high') as number[];
  const lowArr = env.vars.get('low') as number[];
  const openArr = env.vars.get('open') as number[];
  const volArr = env.vars.get('volume') as number[];

  const getArgExpr = (key: string | null, idx: number): string | undefined => {
    if (key) {
      for (const r of rawArgs) {
        const parsed = stripNamedArg(r);
        if (parsed.key?.toLowerCase() === key.toLowerCase()) return parsed.expr;
      }
    }
    let posCount = 0;
    for (const r of rawArgs) {
      const parsed = stripNamedArg(r);
      if (!parsed.key) {
        if (posCount === idx) return parsed.expr;
        posCount++;
      }
    }
    return undefined;
  };

  const evalArg = (idx: number, defVal: Val = 0): Val => {
    const expr = getArgExpr(null, idx);
    return expr !== undefined ? evalExpr(expr, env) : defVal;
  };

  const namedOrIdx = (key: string, idx: number, defVal: Val = 0): Val => {
    const expr = getArgExpr(key, idx);
    return expr !== undefined ? evalExpr(expr, env) : defVal;
  };

  const numArg = (idx: number, def: number, key?: string): number => {
    const expr = getArgExpr(key ?? null, idx);
    if (expr === undefined) return def;
    const v = evalExpr(expr, env);
    const num = typeof v === 'number' ? v : Array.isArray(v) ? Number(v[bar ?? v.length - 1] ?? def) : Number(v);
    return Number.isFinite(num) ? Math.max(1, Math.round(num)) : def;
  };

  const floatArg = (idx: number, def: number, key?: string): number => {
    const expr = getArgExpr(key ?? null, idx);
    if (expr === undefined) return def;
    const v = evalExpr(expr, env);
    const num = typeof v === 'number' ? v : Array.isArray(v) ? Number(v[bar ?? v.length - 1] ?? def) : Number(v);
    return Number.isFinite(num) ? num : def;
  };

  const strArg = (idx: number, def = '', key?: string): string => {
    const expr = getArgExpr(key ?? null, idx);
    if (expr === undefined) return def;
    const v = evalExpr(expr, env);
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return formatPineNum(v);
    if (Array.isArray(v) && bar !== null) {
      const item = v[bar];
      return typeof item === 'string' ? item : typeof item === 'number' ? formatPineNum(item) : def;
    }
    return def;
  };

  // User-defined functions
  if (env.userFns.has(name)) {
    const fn = env.userFns.get(name)!;
    const savedLocals = new Map(env.barLocals);
    fn.params.forEach((p, idx) => {
      const argExpr = getArgExpr(p.name, idx);
      if (argExpr !== undefined) env.barLocals.set(p.name, evalExpr(argExpr, env));
      else if (p.defaultExpr !== undefined) env.barLocals.set(p.name, evalExpr(p.defaultExpr, env));
    });
    let lastVal: Val = NaN;
    for (const line of fn.bodyLines) {
      const t = line.trim();
      if (!t) continue;
      const mAssign = t.match(/^(?:(?:var|varip|int|float|bool|string|color)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|=)\s*(.+)$/);
      if (mAssign) {
        lastVal = evalExpr(mAssign[2]!, env);
        env.barLocals.set(mAssign[1]!, lastVal);
      } else {
        lastVal = evalExpr(t, env);
      }
    }
    env.barLocals = savedLocals;
    return lastVal;
  }

  // Inputs (all input.* variants)
  if (n === 'input' || n.startsWith('input.')) {
    const dv = namedOrIdx('defval', 0, n === 'input.bool' ? 1 : n === 'input.string' ? '' : 14);
    if (n === 'input.color') return resolveColorToken(String(dv), '#2b74ff');
    return dv;
  }

  // Color builders
  if (n === 'color.new') {
    const cRaw = getArgExpr('color', 0) ?? 'color.blue';
    const tr = floatArg(1, 0, 'transp');
    const evaled = evalExpr(cRaw, env);
    if (Array.isArray(evaled)) {
      return evaled.map((item) => {
        const col = resolveColorToken(String(item ?? ''), '');
        return col ? applyTransparency(col, tr) : '';
      }) as unknown as Val;
    }
    const base = resolveColorToken(typeof evaled === 'string' ? evaled : cRaw, '#2b74ff');
    return base ? applyTransparency(base, tr) : '';
  }
  if (n === 'color.rgb') {
    const r = Math.max(0, Math.min(255, Math.round(floatArg(0, 43))));
    const g = Math.max(0, Math.min(255, Math.round(floatArg(1, 116))));
    const b = Math.max(0, Math.min(255, Math.round(floatArg(2, 255))));
    const tr = Math.max(0, Math.min(100, floatArg(3, 0)));
    const a = Number((1 - tr / 100).toFixed(3));
    return `rgba(${r},${g},${b},${a})`;
  }
  if (n === 'color.from_gradient') {
    const val = floatArg(0, 50);
    const lo = floatArg(1, 0);
    const hi = floatArg(2, 100);
    const c1 = resolveColorToken(getArgExpr(null, 3) ?? '#ff4d6d', '#ff4d6d');
    const c2 = resolveColorToken(getArgExpr(null, 4) ?? '#10d9a3', '#10d9a3');
    return val >= (lo + hi) / 2 ? c2 : c1;
  }

  // Type cast helpers
  if (n === 'float' || n === 'int' || n === 'bool' || n === 'math.round_to_mintick') {
    const v = evalArg(0, 0);
    if (n === 'int') {
      return Array.isArray(v) ? (v as number[]).map((x) => Math.trunc(Number(x))) : Math.trunc(Number(v));
    }
    if (n === 'bool') {
      return Array.isArray(v) ? (v as number[]).map((x) => (x && Number.isFinite(x) ? 1 : 0)) : v ? 1 : 0;
    }
    return v;
  }

  // String library (str.*)
  if (n === 'str.tostring' || n === 'tostring') {
    const v = evalArg(0, '');
    const fmt = strArg(1, '');
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return formatPineNum(v, fmt);
    if (Array.isArray(v)) {
      const idx = bar ?? len - 1;
      const num = Number(v[idx] ?? NaN);
      return formatPineNum(num, fmt);
    }
    return String(v);
  }
  if (n === 'str.format') {
    let tmpl = strArg(0, '');
    for (let i = 1; i < rawArgs.length; i++) {
      const v = evalArg(i, '');
      const s = typeof v === 'number' ? formatPineNum(v) : Array.isArray(v) ? formatPineNum(Number(v[bar ?? len - 1] ?? NaN)) : String(v);
      tmpl = tmpl.replace(new RegExp(`\\{${i - 1}(?:,[^}]*)?\\}`, 'g'), s);
    }
    return tmpl;
  }
  if (n === 'str.length') return strArg(0, '').length;
  if (n === 'str.upper') return strArg(0, '').toUpperCase();
  if (n === 'str.lower') return strArg(0, '').toLowerCase();
  if (n === 'str.trim') return strArg(0, '').trim();
  if (n === 'str.contains') return strArg(0, '').includes(strArg(1, '')) ? 1 : 0;
  if (n === 'str.replace' || n === 'str.replace_all') {
    const src = strArg(0, '');
    const tgt = strArg(1, '');
    const rep = strArg(2, '');
    return n === 'str.replace_all' ? src.split(tgt).join(rep) : src.replace(tgt, rep);
  }
  if (n === 'str.substring') return strArg(0, '').slice(numArg(1, 0), rawArgs[2] ? numArg(2, 999) : undefined);
  if (n === 'str.tonumber') {
    const x = Number(strArg(0, 'NaN'));
    return Number.isFinite(x) ? x : NaN;
  }

  // Request Security (Multi-Timeframe Resampling)
  if (n === 'request.security' || n === 'security') {
    const tf = strArg(1, env.timeframe);
    const exprStr = getArgExpr('expression', 2) ?? 'close';
    const { htf, mapIdx } = resampleCandlesForTf(env.candles, tf);
    if (!htf.length) return new Array<number>(len).fill(NaN);
    const subEnv = makeBaseEnv(htf, tf);
    // Copy numeric scalar vars from parent
    for (const [k, v] of env.vars.entries()) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') subEnv.vars.set(k, v);
    }
    subEnv.userFns = env.userFns;
    const subVal = toSeries(evalExpr(exprStr, subEnv), htf.length);
    return mapIdx.map((hi) => subVal[hi] ?? NaN);
  }

  // Full TA Library (ta.*)
  if (n === 'ta.sma' || n === 'sma') return sma(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.ema' || n === 'ema') return ema(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.rma' || n === 'rma') return rma(toSeries(evalArg(0, closeArr), len), numArg(1, 14));
  if (n === 'ta.wma' || n === 'wma') return wma(toSeries(evalArg(0, closeArr), len), numArg(1, 14));
  if (n === 'ta.vwma' || n === 'vwma') return vwma(toSeries(evalArg(0, closeArr), len), volArr, numArg(1, 20));
  if (n === 'ta.hma' || n === 'hma') return coreHma(toSeries(evalArg(0, closeArr), len), numArg(1, 14));
  if (n === 'ta.alma' || n === 'alma') return alma(toSeries(evalArg(0, closeArr), len), numArg(1, 9), floatArg(2, 0.85), floatArg(3, 6));
  if (n === 'ta.dema' || n === 'dema') return dema(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.tema' || n === 'tema') return tema(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.linreg' || n === 'linreg') return linreg(toSeries(evalArg(0, closeArr), len), numArg(1, 20), Math.round(floatArg(2, 0)));
  if (n === 'ta.swma' || n === 'swma') {
    const s = toSeries(evalArg(0, closeArr), len);
    return s.map((_, i) => (i >= 3 ? (s[i - 3]! + 2 * s[i - 2]! + 2 * s[i - 1]! + s[i]!) / 6 : NaN));
  }
  if (n === 'ta.rsi' || n === 'rsi') {
    return rawArgs.length >= 2 ? rsi(toSeries(evalArg(0, closeArr), len), numArg(1, 14)) : rsi(closeArr, numArg(0, 14));
  }
  if (n === 'ta.atr' || n === 'atr') {
    const period = rawArgs.length >= 2 ? numArg(1, 14) : numArg(0, 14);
    return atr(env.candles, period);
  }
  if (n === 'ta.tr' || n === 'tr') {
    return env.candles.map((c, i) => {
      if (i === 0) return c.high - c.low;
      const pc = env.candles[i - 1]!.close;
      return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    });
  }
  if (n === 'ta.stdev' || n === 'stdev') return stdev(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.variance' || n === 'variance') return variance(toSeries(evalArg(0, closeArr), len), numArg(1, 20));
  if (n === 'ta.dev') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 20);
    const m = sma(src, p);
    return src.map((_, i) => {
      if (i < p - 1 || !Number.isFinite(m[i])) return NaN;
      let acc = 0;
      for (let j = i - p + 1; j <= i; j++) acc += Math.abs(src[j]! - m[i]!);
      return acc / p;
    });
  }
  if (n === 'ta.highest' || n === 'highest') {
    return rawArgs.length >= 2 ? highest(toSeries(evalArg(0, highArr), len), numArg(1, 20)) : highest(highArr, numArg(0, 20));
  }
  if (n === 'ta.lowest' || n === 'lowest') {
    return rawArgs.length >= 2 ? lowest(toSeries(evalArg(0, lowArr), len), numArg(1, 20)) : lowest(lowArr, numArg(0, 20));
  }
  if (n === 'ta.highestbars' || n === 'highestbars') {
    return rawArgs.length >= 2 ? highestBars(toSeries(evalArg(0, highArr), len), numArg(1, 20)) : highestBars(highArr, numArg(0, 20));
  }
  if (n === 'ta.lowestbars' || n === 'lowestbars') {
    return rawArgs.length >= 2 ? lowestBars(toSeries(evalArg(0, lowArr), len), numArg(1, 20)) : lowestBars(lowArr, numArg(0, 20));
  }
  if (n === 'ta.pivothigh' || n === 'pivothigh') {
    if (rawArgs.length >= 3) {
      return pivotHigh(toSeries(evalArg(0, highArr), len), numArg(1, 5), numArg(2, 5));
    }
    return pivotHigh(highArr, numArg(0, 5), numArg(1, 5));
  }
  if (n === 'ta.pivotlow' || n === 'pivotlow') {
    if (rawArgs.length >= 3) {
      return pivotLow(toSeries(evalArg(0, lowArr), len), numArg(1, 5), numArg(2, 5));
    }
    return pivotLow(lowArr, numArg(0, 5), numArg(1, 5));
  }
  if (n === 'ta.vwap' || n === 'vwap') return coreVwap(env.candles);
  if (n === 'ta.macd' || n === 'macd') {
    const src = toSeries(evalArg(0, closeArr), len);
    const m = macdSeries(src, numArg(1, 12), numArg(2, 26), numArg(3, 9));
    return [m.line, m.signalLine, m.hist];
  }
  if (n === 'ta.bb' || n === 'ta.bbands' || n === 'bb' || n === 'bbands') {
    const src = toSeries(evalArg(0, closeArr), len);
    const b = bollingerBands(src, numArg(1, 20), floatArg(2, 2));
    return [b.mid, b.upper, b.lower];
  }
  if (n === 'ta.bbw') {
    const src = toSeries(evalArg(0, closeArr), len);
    const b = bollingerBands(src, numArg(1, 20), floatArg(2, 2));
    return b.mid.map((m, i) => (Number.isFinite(m) && m !== 0 ? (b.upper[i]! - b.lower[i]!) / m : NaN));
  }
  if (n === 'ta.kc') {
    const k = keltnerSeries(env.candles, numArg(1, 20), floatArg(2, 1.5), numArg(3, 10));
    return [k.mid, k.upper, k.lower];
  }
  if (n === 'ta.supertrend' || n === 'supertrend') {
    const hasDf = rawArgs[0] && stripNamedArg(rawArgs[0]).expr.trim() === 'df';
    const factor = floatArg(hasDf ? 1 : 0, 3);
    const atrLen = numArg(hasDf ? 2 : 1, 10);
    const s = supertrendSeries(env.candles, factor, atrLen);
    return [s.st, s.dir];
  }
  if (n === 'ta.dmi') {
    const d = dmiSeries(env.candles, numArg(0, 14), numArg(1, 14));
    return [d.plusDi, d.minusDi, d.adx];
  }
  if (n === 'ta.adx') {
    return dmiSeries(env.candles, numArg(0, 14), numArg(1, 14)).adx;
  }
  if (n === 'ta.stoch' || n === 'stoch') {
    const kLen = numArg(rawArgs.length >= 4 ? 3 : 0, 14);
    const s = coreStochastic(env.candles, kLen, 3, 3);
    return [s.k, s.d];
  }
  if (n === 'ta.stochrsi') {
    const src = toSeries(evalArg(0, closeArr), len);
    const s = coreStochRsi(src, numArg(1, 14), numArg(2, 14), numArg(3, 3), numArg(4, 3));
    return [s.k, s.d];
  }
  if (n === 'ta.cci') return cciSeries(env.candles, numArg(1, rawArgs.length === 1 ? numArg(0, 20) : 20));
  if (n === 'ta.mfi') return mfiSeries(env.candles, numArg(1, rawArgs.length === 1 ? numArg(0, 14) : 14));
  if (n === 'ta.sar') return psarSeries(env.candles, floatArg(0, 0.02), floatArg(1, 0.02), floatArg(2, 0.2));
  if (n === 'ta.roc') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 12);
    return src.map((v, i) => (i >= p && Number.isFinite(src[i - p]) && src[i - p]! !== 0 ? ((v - src[i - p]!) / src[i - p]!) * 100 : NaN));
  }
  if (n === 'ta.mom') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 10);
    return src.map((v, i) => (i >= p ? v - (src[i - p] ?? NaN) : NaN));
  }
  if (n === 'ta.change') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 1);
    return src.map((v, i) => (i >= p ? v - (src[i - p] ?? NaN) : NaN));
  }
  if (n === 'ta.cmo') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 14);
    return src.map((_, i) => {
      if (i < p) return NaN;
      let up = 0;
      let dn = 0;
      for (let j = i - p + 1; j <= i; j++) {
        const d = src[j]! - src[j - 1]!;
        if (d > 0) up += d;
        else dn += Math.abs(d);
      }
      return up + dn > 0 ? ((up - dn) / (up + dn)) * 100 : 0;
    });
  }
  if (n === 'ta.wpr') {
    const p = numArg(0, 14);
    const hh = highest(highArr, p);
    const ll = lowest(lowArr, p);
    return closeArr.map((c, i) => {
      const span = hh[i]! - ll[i]!;
      return Number.isFinite(span) && span > 0 ? ((hh[i]! - c) / span) * -100 : -50;
    });
  }
  if (n === 'ta.cum') {
    const src = toSeries(evalArg(0, closeArr), len);
    let acc = 0;
    return src.map((v) => {
      if (Number.isFinite(v)) acc += v;
      return acc;
    });
  }
  if (n === 'ta.range') {
    const src = toSeries(evalArg(0, closeArr), len);
    const p = numArg(1, 14);
    const hh = highest(src, p);
    const ll = lowest(src, p);
    return hh.map((h, i) => h - ll[i]!);
  }
  if (n === 'ta.crossover' || n === 'crossover') {
    const saved = env.barIdx;
    env.barIdx = null;
    const s0 = toSeries(evalArg(0), len);
    const s1 = toSeries(evalArg(1), len);
    env.barIdx = saved;
    const res = crossoverSeries(s0, s1);
    return saved !== null ? (res[saved] ?? 0) : res;
  }
  if (n === 'ta.crossunder' || n === 'crossunder') {
    const saved = env.barIdx;
    env.barIdx = null;
    const s0 = toSeries(evalArg(0), len);
    const s1 = toSeries(evalArg(1), len);
    env.barIdx = saved;
    const res = crossunderSeries(s0, s1);
    return saved !== null ? (res[saved] ?? 0) : res;
  }
  if (n === 'ta.cross' || n === 'cross') {
    const saved = env.barIdx;
    env.barIdx = null;
    const a = toSeries(evalArg(0), len);
    const b = toSeries(evalArg(1), len);
    env.barIdx = saved;
    const up = crossoverSeries(a, b);
    const dn = crossunderSeries(a, b);
    const res = up.map((u, i) => (u || dn[i] ? 1 : 0));
    return saved !== null ? (res[saved] ?? 0) : res;
  }
  if (n === 'ta.rising' || n === 'rising') {
    const saved = env.barIdx;
    env.barIdx = null;
    const src = toSeries(evalArg(0), len);
    env.barIdx = saved;
    const p = numArg(1, 1);
    const res = src.map((_, i) => {
      if (i < p) return 0;
      for (let j = i - p + 1; j <= i; j++) if ((src[j] ?? -Infinity) <= (src[j - 1] ?? Infinity)) return 0;
      return 1;
    });
    return saved !== null ? (res[saved] ?? 0) : res;
  }
  if (n === 'ta.falling' || n === 'falling') {
    const saved = env.barIdx;
    env.barIdx = null;
    const src = toSeries(evalArg(0), len);
    env.barIdx = saved;
    const p = numArg(1, 1);
    const res = src.map((_, i) => {
      if (i < p) return 0;
      for (let j = i - p + 1; j <= i; j++) if ((src[j] ?? Infinity) >= (src[j - 1] ?? -Infinity)) return 0;
      return 1;
    });
    return saved !== null ? (res[saved] ?? 0) : res;
  }
  if (n === 'ta.barssince' || n === 'barssince') {
    const saved = env.barIdx;
    env.barIdx = null;
    const res = barsSinceSeries(toSeries(evalArg(0), len));
    env.barIdx = saved;
    return saved !== null ? (res[saved] ?? NaN) : res;
  }
  if (n === 'ta.valuewhen' || n === 'valuewhen') {
    const saved = env.barIdx;
    env.barIdx = null;
    const c = toSeries(evalArg(0), len);
    const s = toSeries(evalArg(1), len);
    env.barIdx = saved;
    const res = valueWhenSeries(c, s, Math.max(0, Math.round(floatArg(2, 0))));
    return saved !== null ? (res[saved] ?? NaN) : res;
  }
  if (n === 'ta.median') {
    const src = toSeries(evalArg(0), len);
    const p = numArg(1, 10);
    return src.map((_, i) => {
      if (i < p - 1) return NaN;
      const slice = src.slice(i - p + 1, i + 1).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
      return slice.length ? slice[Math.floor(slice.length / 2)]! : NaN;
    });
  }
  if (n === 'ta.correlation') {
    const a = toSeries(evalArg(0), len);
    const b = toSeries(evalArg(1), len);
    const p = numArg(2, 20);
    const ma = sma(a, p);
    const mb = sma(b, p);
    return a.map((_, i) => {
      if (i < p - 1 || !Number.isFinite(ma[i]) || !Number.isFinite(mb[i])) return NaN;
      let num = 0;
      let da = 0;
      let db = 0;
      for (let j = i - p + 1; j <= i; j++) {
        const xa = a[j]! - ma[i]!;
        const xb = b[j]! - mb[i]!;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
      }
      const den = Math.sqrt(da * db);
      return den > 0 ? num / den : 0;
    });
  }

  // Full Math Library (math.*)
  if (n === 'math.abs' || n === 'abs') return toSeries(evalArg(0), len).map((x) => Math.abs(x));
  if (n === 'math.sign' || n === 'sign') return toSeries(evalArg(0), len).map((x) => Math.sign(x));
  if (n === 'math.sqrt' || n === 'sqrt') return toSeries(evalArg(0), len).map((x) => Math.sqrt(x));
  if (n === 'math.round' || n === 'round') return toSeries(evalArg(0), len).map((x) => Math.round(x));
  if (n === 'math.floor' || n === 'floor') return toSeries(evalArg(0), len).map((x) => Math.floor(x));
  if (n === 'math.ceil' || n === 'ceil') return toSeries(evalArg(0), len).map((x) => Math.ceil(x));
  if (n === 'math.exp' || n === 'exp') return toSeries(evalArg(0), len).map((x) => Math.exp(x));
  if (n === 'math.log' || n === 'log') return toSeries(evalArg(0), len).map((x) => (x > 0 ? Math.log(x) : NaN));
  if (n === 'math.log10' || n === 'log10') return toSeries(evalArg(0), len).map((x) => (x > 0 ? Math.log10(x) : NaN));
  if (n === 'math.sin' || n === 'sin') return toSeries(evalArg(0), len).map((x) => Math.sin(x));
  if (n === 'math.cos' || n === 'cos') return toSeries(evalArg(0), len).map((x) => Math.cos(x));
  if (n === 'math.tan' || n === 'tan') return toSeries(evalArg(0), len).map((x) => Math.tan(x));
  if (n === 'math.pow' || n === 'pow') {
    const a = toSeries(evalArg(0), len);
    const b = toSeries(evalArg(1), len);
    return a.map((x, i) => Math.pow(x, b[i]!));
  }
  if (n === 'math.max' || n === 'max' || n === 'np.maximum') {
    const seriesList = rawArgs.map((r) => toSeries(evalExpr(stripNamedArg(r).expr, env), len));
    return closeArr.map((_, i) => Math.max(...seriesList.map((s) => s[i]!)));
  }
  if (n === 'math.min' || n === 'min' || n === 'np.minimum') {
    const seriesList = rawArgs.map((r) => toSeries(evalExpr(stripNamedArg(r).expr, env), len));
    return closeArr.map((_, i) => Math.min(...seriesList.map((s) => s[i]!)));
  }
  if (n === 'math.avg' || n === 'avg') {
    const seriesList = rawArgs.map((r) => toSeries(evalExpr(stripNamedArg(r).expr, env), len));
    return closeArr.map((_, i) => seriesList.reduce((acc, s) => acc + s[i]!, 0) / Math.max(1, seriesList.length));
  }
  if (n === 'math.sum' || n === 'sum') {
    const src = toSeries(evalArg(0), len);
    const p = numArg(1, 10);
    return src.map((_, i) => {
      if (i < p - 1) return NaN;
      let acc = 0;
      for (let j = i - p + 1; j <= i; j++) acc += src[j] ?? 0;
      return acc;
    });
  }
  if (n === 'nz') {
    const a = toSeries(evalArg(0), len);
    const d = floatArg(1, 0);
    return a.map((x) => (Number.isFinite(x) ? x : d));
  }
  if (n === 'na') {
    const v = evalArg(0, NaN);
    return Array.isArray(v) ? (v as number[]).map((x) => (Number.isFinite(x) ? 0 : 1)) : Number.isFinite(Number(v)) ? 0 : 1;
  }
  if (n === 'fixnan') {
    const src = toSeries(evalArg(0), len);
    let last = NaN;
    return src.map((v) => {
      if (Number.isFinite(v)) last = v;
      return last;
    });
  }
  if (n === 'np.where') {
    const cond = toSeries(evalArg(0), len);
    const a = toSeries(evalArg(1), len);
    const b = toSeries(evalArg(2), len);
    return cond.map((c, i) => (c && !Number.isNaN(c) ? a[i]! : b[i]!));
  }
  if (n === 'shift') return shiftSeries(toSeries(evalArg(0), len), numArg(1, 1));

  // Array Constructors & Methods
  if (n.startsWith('array.new')) {
    const id = `arr_${env.nextObjSeq++}`;
    const size = Math.max(0, Math.round(floatArg(0, 0)));
    const initVal = rawArgs[1] ? evalArg(1, NaN) : NaN;
    env.arrays.set(id, new Array<Val>(size).fill(initVal));
    return { __objType: 'array', id };
  }
  if (n === 'array.from') {
    const id = `arr_${env.nextObjSeq++}`;
    env.arrays.set(
      id,
      rawArgs.map((r) => evalExpr(stripNamedArg(r).expr, env))
    );
    return { __objType: 'array', id };
  }
  if (n.startsWith('array.')) {
    const arrRef = evalArg(0);
    const id = typeof arrRef === 'object' && arrRef && '__objType' in arrRef ? arrRef.id : '';
    const arr = env.arrays.get(id);
    if (!arr) return NaN;
    const sub = n.slice(6);
    if (sub === 'size') return arr.length;
    if (sub === 'push') {
      arr.push(evalArg(1, NaN));
      return arr.length;
    }
    if (sub === 'unshift') {
      arr.unshift(evalArg(1, NaN));
      return arr.length;
    }
    if (sub === 'pop') return arr.pop() ?? NaN;
    if (sub === 'shift') return arr.shift() ?? NaN;
    if (sub === 'clear') {
      arr.length = 0;
      return 0;
    }
    if (sub === 'get') {
      const idx = Math.round(floatArg(1, 0));
      return arr[idx] ?? NaN;
    }
    if (sub === 'set') {
      const idx = Math.round(floatArg(1, 0));
      const val = evalArg(2, NaN);
      if (idx >= 0 && idx < arr.length) arr[idx] = val;
      return val;
    }
    if (sub === 'remove') {
      const idx = Math.round(floatArg(1, 0));
      return arr.splice(idx, 1)[0] ?? NaN;
    }
    if (sub === 'sum' || sub === 'avg' || sub === 'max' || sub === 'min') {
      const nums = arr.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      if (!nums.length) return NaN;
      if (sub === 'sum') return nums.reduce((a, b) => a + b, 0);
      if (sub === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (sub === 'max') return Math.max(...nums);
      return Math.min(...nums);
    }
    return NaN;
  }

  // Drawing Primitives: label.new, line.new, box.new, table.new + setters
  if (n === 'label.new') {
    const curBar = bar ?? len - 1;
    const xRaw = getArgExpr('x', 0);
    const yRaw = getArgExpr('y', 1);
    const textVal = strArg(2, '', 'text');
    const xBar = xRaw !== undefined ? Math.round(toNumberAtBar(evalExpr(xRaw, env), curBar, curBar)) : curBar;
    const yLocStr = (getArgExpr('yloc', 4) ?? 'yloc.price').toLowerCase();
    const styleStr = (getArgExpr('style', 6) ?? 'label.style_label_down').toLowerCase();
    const yPx =
      yLocStr.includes('abovebar')
        ? (highArr[Math.min(len - 1, Math.max(0, xBar))] ?? closeArr[curBar]!)
        : yLocStr.includes('belowbar')
          ? (lowArr[Math.min(len - 1, Math.max(0, xBar))] ?? closeArr[curBar]!)
          : yRaw !== undefined
            ? toNumberAtBar(evalExpr(yRaw, env), curBar, closeArr[curBar] ?? 0)
            : (closeArr[curBar] ?? 0);
    const bgRaw = getArgExpr('color', 5);
    const bgEval = bgRaw ? evalExpr(bgRaw, env) : '#2b74ff';
    const bg = resolveColorToken(String(Array.isArray(bgEval) ? bgEval[curBar] ?? '#2b74ff' : bgEval), '#2b74ff') || '#2b74ff';
    const tcRaw = getArgExpr('textcolor', 7);
    const tc = resolveColorToken(tcRaw ? String(evalExpr(tcRaw, env)) : '#ffffff', '#ffffff') || '#ffffff';
    const tooltip = strArg(9, '', 'tooltip') || undefined;
    const style: CustomChartLabel['style'] = styleStr.includes('label_up')
      ? 'label_up'
      : styleStr.includes('label_left')
        ? 'label_left'
        : styleStr.includes('label_right')
          ? 'label_right'
          : styleStr.includes('label_center')
            ? 'label_center'
            : styleStr.includes('none')
              ? 'none'
              : 'label_down';
    const yloc: CustomChartLabel['yloc'] = yLocStr.includes('abovebar') ? 'abovebar' : yLocStr.includes('belowbar') ? 'belowbar' : 'price';
    const id = `lbl_${env.nextObjSeq++}`;
    env.labels.set(id, { id, barIdx: xBar, price: yPx, text: textVal, color: bg, textcolor: tc, style, size: 'small', yloc, tooltip });
    return { __objType: 'label', id };
  }
  if (n.startsWith('label.')) {
    const ref = evalArg(0);
    const id = typeof ref === 'object' && ref && '__objType' in ref ? ref.id : '';
    const lbl = env.labels.get(id);
    if (!lbl) return 0;
    if (n === 'label.delete') {
      lbl.deleted = true;
      env.labels.delete(id);
    } else if (n === 'label.set_text') lbl.text = strArg(1, lbl.text);
    else if (n === 'label.set_color') lbl.color = resolveColorToken(strArg(1, lbl.color), lbl.color) || lbl.color;
    else if (n === 'label.set_textcolor') lbl.textcolor = resolveColorToken(strArg(1, lbl.textcolor), lbl.textcolor) || lbl.textcolor;
    else if (n === 'label.set_x') lbl.barIdx = Math.round(floatArg(1, lbl.barIdx));
    else if (n === 'label.set_y') lbl.price = floatArg(1, lbl.price);
    else if (n === 'label.set_xy') {
      lbl.barIdx = Math.round(floatArg(1, lbl.barIdx));
      lbl.price = floatArg(2, lbl.price);
    }
    return 0;
  }

  if (n === 'line.new') {
    const curBar = bar ?? len - 1;
    const x1Bar = Math.round(toNumberAtBar(evalArg(0, curBar), curBar, curBar));
    const y1 = toNumberAtBar(evalArg(1, closeArr[curBar] ?? 0), curBar, closeArr[curBar] ?? 0);
    const x2Bar = Math.round(toNumberAtBar(evalArg(2, curBar + 5), curBar, curBar + 5));
    const y2 = toNumberAtBar(evalArg(3, y1), curBar, y1);
    const colRaw = getArgExpr('color', 6);
    const col = resolveColorToken(colRaw ? String(evalExpr(colRaw, env)) : '#38e1ff', '#38e1ff') || '#38e1ff';
    const stRaw = getArgExpr('style', 7) ?? 'line.style_solid';
    const extRaw = getArgExpr('extend', 5) ?? 'extend.none';
    const width = Math.max(1, Math.min(5, Math.round(floatArg(8, 2, 'width'))));
    const id = `ln_${env.nextObjSeq++}`;
    env.lines.set(id, {
      id,
      x1Bar,
      y1,
      x2Bar,
      y2,
      color: col,
      width,
      style: resolveLineStyle(stRaw),
      extend: resolveExtend(extRaw),
    });
    return { __objType: 'line', id };
  }
  if (n.startsWith('line.')) {
    const ref = evalArg(0);
    const id = typeof ref === 'object' && ref && '__objType' in ref ? ref.id : '';
    const ln = env.lines.get(id);
    if (!ln) return 0;
    if (n === 'line.delete') {
      ln.deleted = true;
      env.lines.delete(id);
    } else if (n === 'line.set_x1') ln.x1Bar = Math.round(floatArg(1, ln.x1Bar));
    else if (n === 'line.set_y1') ln.y1 = floatArg(1, ln.y1);
    else if (n === 'line.set_x2') ln.x2Bar = Math.round(floatArg(1, ln.x2Bar));
    else if (n === 'line.set_y2') ln.y2 = floatArg(1, ln.y2);
    else if (n === 'line.set_xy1') {
      ln.x1Bar = Math.round(floatArg(1, ln.x1Bar));
      ln.y1 = floatArg(2, ln.y1);
    } else if (n === 'line.set_xy2') {
      ln.x2Bar = Math.round(floatArg(1, ln.x2Bar));
      ln.y2 = floatArg(2, ln.y2);
    } else if (n === 'line.set_color') ln.color = resolveColorToken(strArg(1, ln.color), ln.color) || ln.color;
    else if (n === 'line.set_width') ln.width = Math.max(1, Math.min(5, Math.round(floatArg(1, ln.width))));
    else if (n === 'line.set_extend') ln.extend = resolveExtend(getArgExpr(null, 1) ?? 'none');
    return 0;
  }

  if (n === 'box.new') {
    const curBar = bar ?? len - 1;
    const leftBar = Math.round(toNumberAtBar(namedOrIdx('left', 0, curBar), curBar, curBar));
    const top = toNumberAtBar(namedOrIdx('top', 1, highArr[curBar] ?? 0), curBar, highArr[curBar] ?? 0);
    const rightBar = Math.round(toNumberAtBar(namedOrIdx('right', 2, curBar + 8), curBar, curBar + 8));
    const bottom = toNumberAtBar(namedOrIdx('bottom', 3, lowArr[curBar] ?? 0), curBar, lowArr[curBar] ?? 0);
    const bcRaw = getArgExpr('border_color', 4);
    const bc = resolveColorToken(bcRaw ? String(evalExpr(bcRaw, env)) : '#2b74ff', '#2b74ff') || '#2b74ff';
    const bgRaw = getArgExpr('bgcolor', 8);
    const bg = resolveColorToken(bgRaw ? String(evalExpr(bgRaw, env)) : 'rgba(43,116,255,0.16)', 'rgba(43,116,255,0.16)') || 'rgba(43,116,255,0.16)';
    const bw = Math.max(0, Math.min(4, Math.round(floatArg(5, 1, 'border_width'))));
    const bs = resolveLineStyle(getArgExpr('border_style', 6) ?? 'solid');
    const ext = resolveExtend(getArgExpr('extend', 7) ?? 'none');
    const text = strArg(9, '', 'text') || undefined;
    const tc = resolveColorToken(getArgExpr('text_color', 11) ? String(evalExpr(getArgExpr('text_color', 11)!, env)) : '#e2e8f0', '#e2e8f0');
    const id = `bx_${env.nextObjSeq++}`;
    env.boxes.set(id, {
      id,
      leftBar,
      rightBar,
      top: Math.max(top, bottom),
      bottom: Math.min(top, bottom),
      borderColor: bc,
      borderWidth: bw,
      borderStyle: bs,
      bgcolor: bg,
      text,
      textColor: tc,
      extend: ext,
    });
    return { __objType: 'box', id };
  }
  if (n.startsWith('box.')) {
    const ref = evalArg(0);
    const id = typeof ref === 'object' && ref && '__objType' in ref ? ref.id : '';
    const bx = env.boxes.get(id);
    if (!bx) return 0;
    if (n === 'box.delete') {
      bx.deleted = true;
      env.boxes.delete(id);
    } else if (n === 'box.set_left') bx.leftBar = Math.round(floatArg(1, bx.leftBar));
    else if (n === 'box.set_right') bx.rightBar = Math.round(floatArg(1, bx.rightBar));
    else if (n === 'box.set_top') bx.top = floatArg(1, bx.top);
    else if (n === 'box.set_bottom') bx.bottom = floatArg(1, bx.bottom);
    else if (n === 'box.set_bgcolor') bx.bgcolor = resolveColorToken(strArg(1, bx.bgcolor), bx.bgcolor) || bx.bgcolor;
    else if (n === 'box.set_border_color') bx.borderColor = resolveColorToken(strArg(1, bx.borderColor), bx.borderColor) || bx.borderColor;
    else if (n === 'box.set_text') bx.text = strArg(1, bx.text || '');
    else if (n === 'box.set_extend') bx.extend = resolveExtend(getArgExpr(null, 1) ?? 'none');
    else if (n === 'box.get_top') return bx.top;
    else if (n === 'box.get_bottom') return bx.bottom;
    else if (n === 'box.get_left') return bx.leftBar;
    else if (n === 'box.get_right') return bx.rightBar;
    return 0;
  }

  if (n === 'table.new') {
    const pos = resolveTablePosition(getArgExpr('position', 0) ?? 'top_right');
    const cols = Math.max(1, Math.min(8, Math.round(floatArg(1, 2, 'columns'))));
    const rows = Math.max(1, Math.min(12, Math.round(floatArg(2, 4, 'rows'))));
    const bgRaw = getArgExpr('bgcolor', 3);
    const bg = resolveColorToken(bgRaw ? String(evalExpr(bgRaw, env)) : 'rgba(15,23,42,0.88)', 'rgba(15,23,42,0.88)');
    const bcRaw = getArgExpr('border_color', 4);
    const bc = resolveColorToken(bcRaw ? String(evalExpr(bcRaw, env)) : 'rgba(148,163,184,0.28)', 'rgba(148,163,184,0.28)');
    const bw = Math.max(0, Math.min(3, Math.round(floatArg(5, 1, 'border_width'))));
    const id = `tbl_${env.nextObjSeq++}`;
    env.tables.set(id, { id, position: pos, columns: cols, rows, bgcolor: bg, borderColor: bc, borderWidth: bw, cells: new Map() });
    return { __objType: 'table', id };
  }
  if (n === 'table.cell') {
    const ref = evalArg(0);
    const id = typeof ref === 'object' && ref && '__objType' in ref ? ref.id : '';
    const tbl = env.tables.get(id);
    if (!tbl) return 0;
    const col = Math.max(0, Math.round(floatArg(1, 0, 'column')));
    const row = Math.max(0, Math.round(floatArg(2, 0, 'row')));
    const text = strArg(3, '', 'text');
    const tcRaw = getArgExpr('text_color', 5);
    const tc = resolveColorToken(tcRaw ? String(evalExpr(tcRaw, env)) : '#e2e8f0', '#e2e8f0');
    const bgRaw = getArgExpr('bgcolor', 7);
    const bg = bgRaw ? resolveColorToken(String(evalExpr(bgRaw, env)), 'transparent') : undefined;
    tbl.cells.set(`${row}:${col}`, { row, col, text, textColor: tc, bgcolor: bg, textSize: 'small' });
    return 0;
  }
  if (n.startsWith('table.')) return 0;

  // Fallback for openArr lookback safety
  void openArr;
  env.warnings.push(`Unsupported helper ${name}; defaulted safely.`);
  return new Array<number>(len).fill(NaN);
}

function evalExpr(exprRaw: string, env: ExecEnv): Val {
  const expr = exprRaw.trim();
  const len = env.candles.length;
  const bar = env.barIdx;
  if (!expr || expr === 'na') return NaN;
  if (expr === 'true' || expr === 'True') return 1;
  if (expr === 'false' || expr === 'False') return 0;
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (/^color\.[a-z_]+$/i.test(expr) && PINE_NAMED_COLORS[expr.toLowerCase()]) {
    return PINE_NAMED_COLORS[expr.toLowerCase()]!;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(expr)) return expr;

  // Dynamic Pine constants depending on current bar
  if (expr === 'barstate.islast' || expr === 'barstate.isconfirmed') {
    if (bar !== null) return expr === 'barstate.islast' ? (bar === len - 1 ? 1 : 0) : 1;
    if (expr === 'barstate.islast') return env.candles.map((_, i) => (i === len - 1 ? 1 : 0));
    return new Array<number>(len).fill(1);
  }
  if (expr === 'barstate.isfirst') {
    if (bar !== null) return bar === 0 ? 1 : 0;
    return env.candles.map((_, i) => (i === 0 ? 1 : 0));
  }
  if (expr === 'last_bar_index') return Math.max(0, len - 1);

  // Ternary operator: cond ? a : b
  {
    let depth = 0;
    let qPos = -1;
    let cPos = -1;
    let quote: string | null = null;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i]!;
      if (quote) {
        if (ch === quote && expr[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      if (depth === 0 && ch === '?' && qPos === -1) qPos = i;
      else if (depth === 0 && ch === ':' && qPos !== -1 && cPos === -1) {
        cPos = i;
        break;
      }
    }
    if (qPos !== -1 && cPos !== -1) {
      const condVal = evalExpr(expr.slice(0, qPos), env);
      if (bar !== null) {
        const cNum = toNumberAtBar(condVal, bar, 0);
        return cNum && !Number.isNaN(cNum) ? evalExpr(expr.slice(qPos + 1, cPos), env) : evalExpr(expr.slice(cPos + 1), env);
      }
      const cond = toSeries(condVal, len);
      const aVal = evalExpr(expr.slice(qPos + 1, cPos), env);
      const bVal = evalExpr(expr.slice(cPos + 1), env);
      if (typeof aVal === 'string' || typeof bVal === 'string') {
        const ca = typeof aVal === 'string' ? new Array<string>(len).fill(aVal) : toColorSeries(aVal, len);
        const cb = typeof bVal === 'string' ? new Array<string>(len).fill(bVal) : toColorSeries(bVal, len);
        return cond.map((c, i) => (c && !Number.isNaN(c) ? ca[i]! : cb[i]!)) as unknown as Val;
      }
      const a = toSeries(aVal, len);
      const b = toSeries(bVal, len);
      return cond.map((c, i) => (c && !Number.isNaN(c) ? a[i]! : b[i]!));
    }
  }

  // Binary operators ordered lowest -> highest precedence
  const opGroups: Array<Array<{ tok: string; isWord?: boolean }>> = [
    [{ tok: 'or', isWord: true }, { tok: '||', isWord: false }, { tok: '|', isWord: false }],
    [{ tok: 'and', isWord: true }, { tok: '&&', isWord: false }, { tok: '&', isWord: false }],
    [{ tok: '==', isWord: false }, { tok: '!=', isWord: false }, { tok: '>=', isWord: false }, { tok: '<=', isWord: false }, { tok: '>', isWord: false }, { tok: '<', isWord: false }],
    [{ tok: '+', isWord: false }, { tok: '-', isWord: false }],
    [{ tok: '*', isWord: false }, { tok: '/', isWord: false }, { tok: '%', isWord: false }],
  ];

  for (const ops of opGroups) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i]!;
      if (quote) {
        if (ch === quote && expr[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ')' || ch === ']') depth++;
      else if (ch === '(' || ch === '[') depth--;
      if (depth !== 0) continue;

      for (const op of ops) {
        const L = op.tok.length;
        const start = i - L + 1;
        if (start <= 0) continue;
        if (expr.slice(start, i + 1) !== op.tok) continue;
        if (op.isWord) {
          const prev = expr[start - 1] ?? ' ';
          const next = expr[i + 1] ?? ' ';
          if (!/\s|\)/.test(prev) || !/\s|\(/.test(next)) continue;
        }
        if (op.tok === '-' && /^[\s(*\/+\-><=!&|,%?]$/.test(expr[start - 1] ?? ' ')) continue;
        if ((op.tok === '>' || op.tok === '<') && (expr[start - 1] === '=' || expr[i + 1] === '=')) continue;
        if ((op.tok === '|' || op.tok === '&') && (expr[start - 1] === op.tok || expr[i + 1] === op.tok)) continue;

        const leftVal = evalExpr(expr.slice(0, start), env);
        const rightVal = evalExpr(expr.slice(i + 1), env);

        if (op.tok === '+' && (typeof leftVal === 'string' || typeof rightVal === 'string')) {
          const ls = typeof leftVal === 'string' ? leftVal : formatPineNum(toNumberAtBar(leftVal, bar ?? len - 1));
          const rs = typeof rightVal === 'string' ? rightVal : formatPineNum(toNumberAtBar(rightVal, bar ?? len - 1));
          return ls + rs;
        }
        if ((op.tok === '==' || op.tok === '!=') && (typeof leftVal === 'string' || typeof rightVal === 'string')) {
          const eq = String(leftVal) === String(rightVal);
          return op.tok === '==' ? (eq ? 1 : 0) : eq ? 0 : 1;
        }

        if (bar !== null) {
          const x = toNumberAtBar(leftVal, bar);
          const y = toNumberAtBar(rightVal, bar);
          switch (op.tok) {
            case 'or':
            case '||':
            case '|':
              return (x && !Number.isNaN(x)) || (y && !Number.isNaN(y)) ? 1 : 0;
            case 'and':
            case '&&':
            case '&':
              return x && !Number.isNaN(x) && y && !Number.isNaN(y) ? 1 : 0;
            case '==':
              return x === y ? 1 : 0;
            case '!=':
              return x !== y ? 1 : 0;
            case '>=':
              return x >= y ? 1 : 0;
            case '<=':
              return x <= y ? 1 : 0;
            case '>':
              return x > y ? 1 : 0;
            case '<':
              return x < y ? 1 : 0;
            case '+':
              return x + y;
            case '-':
              return x - y;
            case '*':
              return x * y;
            case '/':
              return y !== 0 ? x / y : NaN;
            case '%':
              return y !== 0 ? x % y : NaN;
          }
        }

        const a = toSeries(leftVal, len);
        const b = toSeries(rightVal, len);
        switch (op.tok) {
          case 'or':
          case '||':
          case '|':
            return a.map((x, idx) => ((x && !Number.isNaN(x)) || (b[idx] && !Number.isNaN(b[idx])) ? 1 : 0));
          case 'and':
          case '&&':
          case '&':
            return a.map((x, idx) => (x && !Number.isNaN(x) && b[idx] && !Number.isNaN(b[idx]) ? 1 : 0));
          case '==':
            return a.map((x, idx) => (x === b[idx] ? 1 : 0));
          case '!=':
            return a.map((x, idx) => (x !== b[idx] ? 1 : 0));
          case '>=':
            return a.map((x, idx) => (x >= b[idx]! ? 1 : 0));
          case '<=':
            return a.map((x, idx) => (x <= b[idx]! ? 1 : 0));
          case '>':
            return a.map((x, idx) => (x > b[idx]! ? 1 : 0));
          case '<':
            return a.map((x, idx) => (x < b[idx]! ? 1 : 0));
          case '+':
            return a.map((x, idx) => x + b[idx]!);
          case '-':
            return a.map((x, idx) => x - b[idx]!);
          case '*':
            return a.map((x, idx) => x * b[idx]!);
          case '/':
            return a.map((x, idx) => (b[idx] !== 0 ? x / b[idx]! : NaN));
          case '%':
            return a.map((x, idx) => (b[idx] !== 0 ? x % b[idx]! : NaN));
        }
      }
    }
  }

  // Unary not / ~
  if (/^(not\s+|!|~)/i.test(expr)) {
    const inner = expr.replace(/^(not\s+|!|~)/i, '').trim();
    const v = evalExpr(inner, env);
    if (bar !== null) {
      const n = toNumberAtBar(v, bar);
      return n && !Number.isNaN(n) ? 0 : 1;
    }
    return toSeries(v, len).map((x) => (x && !Number.isNaN(x) ? 0 : 1));
  }

  // Unary +/-
  if (/^[+-]/.test(expr)) {
    const sign = expr[0] === '-' ? -1 : 1;
    const v = evalExpr(expr.slice(1), env);
    if (bar !== null) return sign * toNumberAtBar(v, bar);
    return toSeries(v, len).map((x) => sign * x);
  }

  // Balanced outer parentheses
  if (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let balanced = true;
    let quote: string | null = null;
    for (let i = 0; i < expr.length - 1; i++) {
      const ch = expr[i]!;
      if (quote) {
        if (ch === quote && expr[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth === 0) {
        balanced = false;
        break;
      }
    }
    if (balanced) return evalExpr(expr.slice(1, -1), env);
  }

  // Pandas style chained methods
  const ewmMatch = expr.match(/^(.+)\.ewm\(\s*(?:span\s*=\s*)?(\d+)[^)]*\)\.mean\(\)$/);
  if (ewmMatch) return ema(toSeries(evalExpr(ewmMatch[1]!, env), len), Math.max(1, Number(ewmMatch[2]!)));
  const rollMatch = expr.match(/^(.+)\.rolling\(\s*(?:window\s*=\s*)?(\d+)[^)]*\)\.(mean|max|min|std)\(\)$/);
  if (rollMatch) {
    const src = toSeries(evalExpr(rollMatch[1]!, env), len);
    const p = Math.max(1, Number(rollMatch[2]!));
    if (rollMatch[3] === 'mean') return sma(src, p);
    if (rollMatch[3] === 'max') return highest(src, p);
    if (rollMatch[3] === 'min') return lowest(src, p);
    return stdev(src, p);
  }
  const shiftMatch = expr.match(/^(.+)\.shift\(\s*(\d+)\s*\)$/);
  if (shiftMatch) return shiftSeries(toSeries(evalExpr(shiftMatch[1]!, env), len), Number(shiftMatch[2]!));

  // Method call sugar: obj.method(args) -> namespace.method(obj, args) for array/label/line/box/table
  const methodMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(push|pop|shift|unshift|get|set|size|clear|sum|avg|max|min|remove|delete|set_text|set_color|set_textcolor|set_xy|set_xy1|set_xy2|set_x1|set_x2|set_y1|set_y2|set_left|set_right|set_top|set_bottom|set_bgcolor|set_border_color|get_top|get_bottom|get_left|get_right|cell)\(([\s\S]*)\)$/);
  if (methodMatch) {
    const objName = methodMatch[1]!;
    const method = methodMatch[2]!;
    const obj = lookupVar(objName, env);
    if (obj && typeof obj === 'object' && '__objType' in obj) {
      const ns = obj.__objType;
      const innerArgs = methodMatch[3]!.trim();
      const argsList = innerArgs ? [objName, ...splitTopLevelArgs(innerArgs)] : [objName];
      const r = callBuiltinFn(`${ns}.${method}`, argsList, env);
      return Array.isArray(r) ? (r[0] as Val) : r;
    }
  }

  // df['col'] or df.col
  const dfBracket = expr.match(/^df\[['"]([A-Za-z0-9_]+)['"]\]$/);
  if (dfBracket) return lookupVar(dfBracket[1]!, env) ?? new Array<number>(len).fill(NaN);
  const dfDot = expr.match(/^df\.([A-Za-z0-9_]+)$/);
  if (dfDot) return lookupVar(dfDot[1]!, env) ?? new Array<number>(len).fill(NaN);

  // Function call
  const fnMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
  if (fnMatch) {
    const res = callBuiltinFn(fnMatch[1]!, splitTopLevelArgs(fnMatch[2]!), env);
    return Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as number[]) : (res as Val);
  }

  // Historical lookback: series[k] or series[expr]
  const histMatch = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\[([^\]]+)\]$/);
  if (histMatch) {
    const s = lookupVar(histMatch[1]!, env);
    const kVal = evalExpr(histMatch[2]!, env);
    const k = Math.max(0, Math.round(typeof kVal === 'number' ? kVal : toNumberAtBar(kVal, bar ?? len - 1, 1)));
    if (s !== undefined) {
      if (bar !== null) {
        if (Array.isArray(s)) return Number(s[bar - k] ?? NaN);
        return typeof s === 'number' ? s : NaN;
      }
      return shiftSeries(toSeries(s, len), k);
    }
  }

  const found = lookupVar(expr, env);
  if (found !== undefined) {
    if (bar !== null && Array.isArray(found) && (found.length === len || typeof found[0] === 'number')) {
      return Number(found[bar] ?? NaN);
    }
    return found;
  }
  if (expr === 'ta.vwap') return coreVwap(env.candles);
  return NaN;
}

function makeBaseEnv(candles: Candle[], timeframe = '15m'): ExecEnv {
  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume);
  const hl2 = candles.map((c) => (c.high + c.low) / 2);
  const hlc3 = candles.map((c) => (c.high + c.low + c.close) / 3);
  const ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
  const hlcc4 = candles.map((c) => (c.high + c.low + c.close * 2) / 4);
  const timeArr = candles.map((c) => c.timestamp);
  const barIndex = candles.map((_, i) => i);

  const vars = new Map<string, Val>([
    ['open', open],
    ['high', high],
    ['low', low],
    ['close', close],
    ['volume', volume],
    ['hl2', hl2],
    ['hlc3', hlc3],
    ['ohlc4', ohlc4],
    ['hlcc4', hlcc4],
    ['time', timeArr],
    ['timenow', candles[candles.length - 1]?.timestamp ?? Date.now()],
    ['bar_index', barIndex],
    ['strategy.long', 1],
    ['strategy.short', -1],
    ['strategy.position_size', 0],
    ['math.pi', Math.PI],
    ['math.e', Math.E],
    ['math.phi', 1.618033988749895],
    ['syminfo.ticker', 'BTCUSDT'],
    ['syminfo.tickerid', 'BINANCE:BTCUSDT'],
    ['timeframe.period', timeframe],
    ['timeframe.isintraday', timeframe.includes('m') || timeframe.includes('h') ? 1 : 0],
    ['timeframe.isdaily', timeframe.toLowerCase().includes('d') ? 1 : 0],
  ]);

  return {
    candles,
    timeframe,
    vars,
    barLocals: new Map(),
    userFns: new Map(),
    plots: [],
    plotSeriesById: new Map(),
    hlines: [],
    hlinePriceById: new Map(),
    fills: [],
    bgcolors: [],
    barcolors: [],
    labels: new Map(),
    lines: new Map(),
    boxes: new Map(),
    tables: new Map(),
    arrays: new Map(),
    longFlags: new Array<number>(candles.length).fill(0),
    shortFlags: new Array<number>(candles.length).fill(0),
    closeFlags: new Array<number>(candles.length).fill(0),
    warnings: [],
    barIdx: null,
    nextObjSeq: 1,
  };
}

function finalizeCustomDrawings(env: ExecEnv) {
  const labels: CustomChartLabel[] = [...env.labels.values()]
    .filter((l) => !l.deleted && Number.isFinite(l.price))
    .slice(-120)
    .map((l) => ({
      time: barTimeSec(env.candles, l.barIdx),
      price: l.price,
      text: l.text,
      color: l.color,
      textcolor: l.textcolor,
      style: l.style,
      size: l.size,
      yloc: l.yloc,
      tooltip: l.tooltip,
    }));

  const lines: CustomChartLine[] = [...env.lines.values()]
    .filter((l) => !l.deleted && Number.isFinite(l.y1) && Number.isFinite(l.y2))
    .slice(-80)
    .map((l) => ({
      x1Time: barTimeSec(env.candles, l.x1Bar),
      y1: l.y1,
      x2Time: barTimeSec(env.candles, l.x2Bar),
      y2: l.y2,
      color: l.color,
      width: l.width,
      style: l.style,
      extend: l.extend,
    }));

  const boxes: CustomChartBox[] = [...env.boxes.values()]
    .filter((b) => !b.deleted && Number.isFinite(b.top) && Number.isFinite(b.bottom))
    .slice(-60)
    .map((b) => ({
      leftTime: barTimeSec(env.candles, b.leftBar),
      rightTime: barTimeSec(env.candles, b.rightBar),
      top: b.top,
      bottom: b.bottom,
      borderColor: b.borderColor,
      borderWidth: b.borderWidth,
      borderStyle: b.borderStyle,
      bgcolor: b.bgcolor,
      text: b.text,
      textColor: b.textColor,
      extend: b.extend,
    }));

  const tables: CustomChartTable[] = [...env.tables.values()]
    .slice(-4)
    .map((t) => ({
      position: t.position,
      columns: t.columns,
      rows: t.rows,
      bgcolor: t.bgcolor,
      borderColor: t.borderColor,
      borderWidth: t.borderWidth,
      cells: [...t.cells.values()],
    }))
    .filter((t) => t.cells.length > 0);

  return { labels, lines, boxes, tables };
}

function buildFinalSignalsAndMarkers(
  candles: Candle[],
  timeframe: Timeframe | string,
  env: ExecEnv,
  title: string,
  language: CustomStrategyLanguage,
  overlay: boolean,
  slAtrMult = 1.8,
  tp1R = 1.3,
  tp2R = 2.4,
  tp3R = 3.6,
  extraMarkers: CustomChartMarker[] = []
): CustomStrategyEvalResult {
  const tfMs = timeframeToMs(timeframe);
  const atrArr = atr(candles, 14);
  const rsiArr = rsi(candles.map((c) => c.close), 14);
  const signals: StrategySignalOutput[] = [];
  const markers: CustomChartMarker[] = [...extraMarkers];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const a = Number.isFinite(atrArr[i]) && atrArr[i]! > 0 ? atrArr[i]! : c.close * 0.012;
    const r = Number.isFinite(rsiArr[i]) ? rsiArr[i]! : 50;
    const isLong = env.longFlags[i] === 1;
    const isShort = env.shortFlags[i] === 1;

    let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (isLong && !isShort) signal = 'LONG';
    else if (isShort && !isLong) signal = 'SHORT';

    const slDist = a * slAtrMult;
    const stopLoss = signal === 'LONG' ? c.close - slDist : signal === 'SHORT' ? c.close + slDist : undefined;
    const tp1 = signal === 'LONG' ? c.close + slDist * tp1R : signal === 'SHORT' ? c.close - slDist * tp1R : undefined;
    const tp2 = signal === 'LONG' ? c.close + slDist * tp2R : signal === 'SHORT' ? c.close - slDist * tp2R : undefined;
    const tp3 = signal === 'LONG' ? c.close + slDist * tp3R : signal === 'SHORT' ? c.close - slDist * tp3R : undefined;

    signals.push({
      timestamp: c.timestamp,
      closeTime: c.timestamp + tfMs,
      trend: signal === 'LONG' ? 'BULLISH' : signal === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
      signal,
      reason: signal === 'NONE' ? title : `${title} (${language.toUpperCase()})`,
      price: c.close,
      atr: a,
      rsi: r,
      stopLoss,
      tp1,
      tp2,
      tp3,
    });

    if (signal !== 'NONE') {
      markers.push({
        time: Math.floor(c.timestamp / 1000),
        position: signal === 'LONG' ? 'belowBar' : 'aboveBar',
        color: signal === 'LONG' ? '#10d9a3' : '#ff4d6d',
        shape: signal === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: signal === 'LONG' ? 'LONG' : 'SHORT',
      });
    }
  }

  const drawings = finalizeCustomDrawings(env);

  return {
    valid: true,
    language,
    title,
    overlay,
    errors: [],
    warnings: env.warnings,
    signals,
    plots: env.plots,
    markers,
    hlines: env.hlines,
    fills: env.fills,
    bgcolors: env.bgcolors,
    barcolors: env.barcolors,
    labels: drawings.labels,
    lines: drawings.lines,
    boxes: drawings.boxes,
    tables: drawings.tables,
    latestSignal: signals[signals.length - 1] ?? null,
  };
}

/* ============================================================================
 * 1. Full Pine Script v4 / v5 / v6 Transpiler, Vectorized + Bar-by-Bar Runtime
 * ============================================================================ */

function stripPineComments(code: string): string {
  let out = '';
  let inBlock = false;
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    const nx = code[i + 1];
    if (inBlock) {
      if (ch === '*' && nx === '/') {
        inBlock = false;
        i++;
      } else if (ch === '\n') {
        out += '\n';
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && nx === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === '/' && nx === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      if (i < code.length) out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

function preprocessPineLogicalLines(code: string): Array<{ indent: number; text: string; lineNo: number }> {
  const rawLines = stripPineComments(code).split(/\r?\n/);
  const result: Array<{ indent: number; text: string; lineNo: number }> = [];

  const parenDelta = (s: string): number => {
    let d = 0;
    let q: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (q) {
        if (ch === q && s[i - 1] !== '\\') q = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q = ch;
        continue;
      }
      if (ch === '(' || ch === '[') d++;
      else if (ch === ')' || ch === ']') d--;
    }
    return d;
  };

  let curText = '';
  let curIndent = 0;
  let curLineNo = 1;
  let openDepth = 0;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx]!;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const indent = raw.search(/\S/);
    const contLead = /^[,)\].?:]|^(?:and|or)\s+/i.test(trimmed);

    if (curText && (openDepth > 0 || contLead || /[,?:+\-*/(]$/.test(curText))) {
      curText += ' ' + trimmed;
      openDepth += parenDelta(trimmed);
    } else {
      if (curText) result.push({ indent: curIndent, text: curText, lineNo: curLineNo });
      curText = trimmed;
      curIndent = indent;
      curLineNo = idx + 1;
      openDepth = parenDelta(trimmed);
    }
  }
  if (curText) result.push({ indent: curIndent, text: curText, lineNo: curLineNo });
  return result;
}

interface PineStatement {
  indent: number;
  text: string;
  lineNo: number;
  children?: PineStatement[];
}

function buildStatementTree(lines: Array<{ indent: number; text: string; lineNo: number }>): PineStatement[] {
  const root: PineStatement[] = [];
  const stack: Array<{ indent: number; list: PineStatement[] }> = [{ indent: -1, list: root }];

  for (const ln of lines) {
    while (stack.length > 1 && ln.indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }
    const stmt: PineStatement = { indent: ln.indent, text: ln.text, lineNo: ln.lineNo };
    stack[stack.length - 1]!.list.push(stmt);
    if (/^(?:if|else(?:\s+if)?|for|while|switch)\b/.test(ln.text) || /=>\s*$/.test(ln.text)) {
      stmt.children = [];
      stack.push({ indent: ln.indent, list: stmt.children });
    }
  }
  return root;
}

function requiresBarExecution(stmt: PineStatement, mutatedBarVars?: Set<string>): boolean {
  const txt = stmt.text;
  if (/^(?:var|varip)\b/.test(txt)) return true;
  if (/^(?:for|while|if|else)\b/.test(txt)) return true;
  if (/\b(?:label|line|box|table|array)\.(?:new|set_|delete|push|pop|shift|unshift|clear|remove|cell)\b/.test(txt)) return true;
  if (/\.(?:push|pop|shift|unshift|set|clear|remove|delete|set_|cell)\(/.test(txt)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*(?::=|\+=|-=|\*=|\/=)/.test(txt)) return true;
  if (mutatedBarVars && mutatedBarVars.size > 0) {
    const ids = txt.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    for (const id of ids) {
      if (mutatedBarVars.has(id)) return true;
    }
  }
  return Boolean(stmt.children?.some((ch) => requiresBarExecution(ch, mutatedBarVars)));
}

function collectMutatedVars(stmts: PineStatement[], out = new Set<string>()): Set<string> {
  for (const s of stmts) {
    const vDecl = s.text.match(/^(?:varip|var)\s+(?:(?:int|float|bool|string|color|label|line|box|table)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (vDecl?.[1]) out.add(vDecl[1]);
    const mut = s.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|\+=|-=|\*=|\/=)/);
    if (mut?.[1]) out.add(mut[1]);
    if (s.children) collectMutatedVars(s.children, out);
  }
  return out;
}

export function evaluatePineStrategy(
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  const env = makeBaseEnv(candles, String(timeframe));
  const len = candles.length;
  let title = 'Custom Pine Strategy';
  let overlay = true;
  const errors: string[] = [];
  const extraMarkers: CustomChartMarker[] = [];

  if (!code.trim()) {
    return {
      valid: false,
      language: 'pine',
      title,
      overlay,
      errors: ['Pine Script code cannot be empty.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const logicalLines = preprocessPineLogicalLines(code);
  const stmts = buildStatementTree(logicalLines);

  const execBarStmt = (stmt: PineStatement, barIdx: number, guardOk: boolean) => {
    const t = stmt.text;
    env.barIdx = barIdx;

    if (t.startsWith('if ')) {
      const condExpr = t.slice(3).trim();
      const passed = guardOk && Boolean(toNumberAtBar(evalExpr(condExpr, env), barIdx, 0));
      if (passed && stmt.children) {
        for (const ch of stmt.children) execBarStmt(ch, barIdx, true);
      }
      return passed;
    }

    if (t.startsWith('else if ')) {
      const condExpr = t.slice(8).trim();
      const passed = guardOk && Boolean(toNumberAtBar(evalExpr(condExpr, env), barIdx, 0));
      if (passed && stmt.children) {
        for (const ch of stmt.children) execBarStmt(ch, barIdx, true);
      }
      return passed;
    }

    if (t === 'else' || t.startsWith('else ')) {
      if (guardOk && stmt.children) {
        for (const ch of stmt.children) execBarStmt(ch, barIdx, true);
      }
      return guardOk;
    }

    if (!guardOk) return false;

    // for i = start to end [by step]
    const forRange = t.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+by\s+(.+))?$/);
    if (forRange && stmt.children) {
      const vName = forRange[1]!;
      const startN = Math.round(toNumberAtBar(evalExpr(forRange[2]!, env), barIdx, 0));
      const endN = Math.round(toNumberAtBar(evalExpr(forRange[3]!, env), barIdx, -1));
      const stepN = forRange[4] ? Math.round(toNumberAtBar(evalExpr(forRange[4]!, env), barIdx, 1)) : startN <= endN ? 1 : -1;
      const safeCap = 200;
      let iter = 0;
      if (stepN !== 0) {
        for (let k = startN; stepN > 0 ? k <= endN : k >= endN; k += stepN) {
          if (++iter > safeCap) break;
          env.barLocals.set(vName, k);
          for (const ch of stmt.children) execBarStmt(ch, barIdx, true);
        }
        env.barLocals.delete(vName);
      }
      return true;
    }

    // for item in arr
    const forIn = t.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z_][A-Za-z0-9_]*)$/);
    if (forIn && stmt.children) {
      const arrRef = lookupVar(forIn[2]!, env);
      const id = arrRef && typeof arrRef === 'object' && '__objType' in arrRef ? arrRef.id : '';
      const arr = env.arrays.get(id);
      if (arr) {
        for (const item of [...arr].slice(0, 200)) {
          env.barLocals.set(forIn[1]!, item);
          for (const ch of stmt.children) execBarStmt(ch, barIdx, true);
        }
        env.barLocals.delete(forIn[1]!);
      }
      return true;
    }

    // Tuple destructuring per bar
    const tupleM = t.match(/^\[([^\]]+)\]\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
    if (tupleM) {
      const names = tupleM[1]!.split(',').map((s) => s.trim());
      const out = callBuiltinFn(tupleM[2]!, splitTopLevelArgs(tupleM[3]!), env);
      if (Array.isArray(out)) {
        names.forEach((nm, idx) => {
          if (nm && nm !== '_') env.vars.set(nm, (out as Val[])[idx] ?? NaN);
        });
      }
      return true;
    }

    // Compound assignment += -= *= /=
    const compM = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
    if (compM) {
      const cur = toNumberAtBar(lookupVar(compM[1]!, env) ?? 0, barIdx, 0);
      const rhs = toNumberAtBar(evalExpr(compM[3]!, env), barIdx, 0);
      const next = compM[2] === '+=' ? cur + rhs : compM[2] === '-=' ? cur - rhs : compM[2] === '*=' ? cur * rhs : rhs !== 0 ? cur / rhs : NaN;
      env.vars.set(compM[1]!, next);
      return true;
    }

    // var / := / =
    const varDecl = t.match(/^(?:varip|var)\s+(?:(?:int|float|bool|string|color|label|line|box|table)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (varDecl) {
      if (barIdx === 0 || !env.vars.has(varDecl[1]!)) {
        env.vars.set(varDecl[1]!, evalExpr(varDecl[2]!, env));
      }
      return true;
    }

    const assignM = t.match(/^(?:(?:int|float|bool|string|color|label|line|box|table)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(:=|=)\s*(.+)$/);
    if (assignM) {
      env.vars.set(assignM[1]!, evalExpr(assignM[3]!, env));
      return true;
    }

    // strategy.entry inside bar block
    const entryM = t.match(/^strategy\.entry\(([\s\S]+)\)$/);
    if (entryM) {
      const args = splitTopLevelArgs(entryM[1]!);
      const dirExpr = stripNamedArg(args[1] ?? '').expr;
      const isShort = dirExpr.includes('short') || stripNamedArg(args[0] ?? '').expr.toLowerCase().includes('short');
      let whenOk = true;
      for (const a of args) {
        const parsed = stripNamedArg(a);
        if (parsed.key === 'when') whenOk = Boolean(toNumberAtBar(evalExpr(parsed.expr, env), barIdx, 0));
      }
      if (whenOk) {
        if (isShort) env.shortFlags[barIdx] = 1;
        else env.longFlags[barIdx] = 1;
      }
      return true;
    }

    if (t.startsWith('strategy.close') || t.startsWith('strategy.exit')) {
      env.closeFlags[barIdx] = 1;
      return true;
    }

    // Standalone expression / drawing / array mutation
    evalExpr(t, env);
    return true;
  };

  // Top-level pass: handle metadata, vectorized assignments, plots, hlines, fills, and collect bar-by-bar statements
  const mutatedBarVars = collectMutatedVars(stmts);
  const barStmts: PineStatement[] = [];
  const execTopStmt = (stmt: PineStatement) => {
    const trimmed = stmt.text;

    if (trimmed.startsWith('indicator(') || trimmed.startsWith('strategy(') || trimmed.startsWith('study(')) {
      const mTitle = trimmed.match(/["']([^"']+)["']/);
      if (mTitle?.[1]) title = mTitle[1];
      if (/overlay\s*=\s*false/i.test(trimmed)) overlay = false;
      return;
    }

    // User-defined function: fn(a, b = 10) => expr  OR multi-line block
    const fnSingle = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\s*=>\s*(.+)$/);
    if (fnSingle) {
      const params = splitTopLevelArgs(fnSingle[2]!).map((p) => {
        const [nm, def] = p.split('=').map((x) => x.trim());
        return { name: nm!.replace(/^(?:simple|series|int|float|bool|string|color)\s+/, ''), defaultExpr: def };
      });
      env.userFns.set(fnSingle[1]!, { params, bodyLines: [fnSingle[3]!] });
      return;
    }
    const fnHeader = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\s*=>\s*$/);
    if (fnHeader && stmt.children) {
      const params = splitTopLevelArgs(fnHeader[2]!).map((p) => {
        const [nm, def] = p.split('=').map((x) => x.trim());
        return { name: nm!.replace(/^(?:simple|series|int|float|bool|string|color)\s+/, ''), defaultExpr: def };
      });
      env.userFns.set(fnHeader[1]!, { params, bodyLines: stmt.children.map((c) => c.text) });
      return;
    }

    // Switch statement assigned or standalone
    const switchAssign = trimmed.match(/^(?:(?:var|int|float|bool|string|color)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*switch(?:\s+(.+))?$/);
    if (switchAssign && stmt.children?.length) {
      const targetVar = switchAssign[1]!;
      const switchSubject = switchAssign[2] ? evalExpr(switchAssign[2]!, env) : null;
      let resSeries: Val = NaN;
      // Evaluate cases cleanly (default case `=> expr` becomes fallback)
      const cases = stmt.children.map((c) => {
        const parts = c.text.split('=>');
        return { cond: parts[0]?.trim() || '', valExpr: parts.slice(1).join('=>').trim() };
      });
      const defCase = cases.find((c) => c.cond === '');
      resSeries = defCase ? evalExpr(defCase.valExpr, env) : NaN;
      for (const cs of [...cases].reverse()) {
        if (!cs.cond) continue;
        const cCond = switchSubject !== null ? toSeries(evalExpr(`${switchAssign[2]} == ${cs.cond}`, env), len) : toSeries(evalExpr(cs.cond, env), len);
        const cVal = evalExpr(cs.valExpr, env);
        if (typeof cVal === 'string' || typeof resSeries === 'string') {
          const curArr = toColorSeries(resSeries, len);
          const vStr = resolveColorToken(String(cVal), String(cVal));
          resSeries = cCond.map((f, i) => (f && !Number.isNaN(f) ? vStr : curArr[i]!)) as unknown as Val;
        } else {
          const curArr = toSeries(resSeries, len);
          const vArr = toSeries(cVal, len);
          resSeries = cCond.map((f, i) => (f && !Number.isNaN(f) ? vArr[i]! : curArr[i]!));
        }
      }
      env.vars.set(targetVar, resSeries);
      return;
    }

    // Route bar-level stateful logic & drawings to bar-by-bar pass (keeping dependency chain causal)
    if (requiresBarExecution(stmt, mutatedBarVars)) {
      const lhsM = trimmed.match(/^(?:(?:var|varip|int|float|bool|string|color|label|line|box|table)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|=)/);
      if (lhsM?.[1]) mutatedBarVars.add(lhsM[1]);
      barStmts.push(stmt);
      return;
    }

    // Tuple destructuring: [a, b, c] = ta.macd(...)
    const tupleMatch = trimmed.match(/^\[([^\]]+)\]\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
    if (tupleMatch) {
      const names = tupleMatch[1]!.split(',').map((s) => s.trim());
      const out = callBuiltinFn(tupleMatch[2]!, splitTopLevelArgs(tupleMatch[3]!), env);
      if (Array.isArray(out) && Array.isArray(out[0])) {
        names.forEach((nm, idx) => {
          if (nm && nm !== '_') env.vars.set(nm, (out as number[][])[idx] ?? new Array<number>(len).fill(NaN));
        });
      }
      return;
    }

    // Plot assignment (`p1 = plot(...)`) or hline assignment (`h1 = hline(...)`)
    const plotAssignMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(plot|hline)\(([\s\S]+)\)$/);
    const barePlotMatch = !plotAssignMatch ? trimmed.match(/^(plot|hline|plotcandle|plotbar)\(([\s\S]+)\)$/) : null;

    if (plotAssignMatch || barePlotMatch) {
      const assignVar = plotAssignMatch ? plotAssignMatch[1]! : undefined;
      const fnName = (plotAssignMatch ? plotAssignMatch[2]! : barePlotMatch![1]!).toLowerCase();
      const argsStr = plotAssignMatch ? plotAssignMatch[3]! : barePlotMatch![2]!;
      const args = splitTopLevelArgs(argsStr);

      if (fnName === 'hline') {
        const priceVal = toSeries(evalExpr(stripNamedArg(args[0] ?? '50').expr, env), len)[len - 1] ?? 50;
        let hTitle = `Level ${env.hlines.length + 1}`;
        let hColor = '#94a3b8';
        let linestyle: CustomHLine['linestyle'] = 'dashed';
        let linewidth = 1;
        for (let idx = 1; idx < args.length; idx++) {
          const p = stripNamedArg(args[idx]!);
          if (p.key === 'title' || (idx === 1 && !p.key)) hTitle = p.expr.replace(/['"]/g, '').trim() || hTitle;
          if (p.key === 'color' || (idx === 2 && !p.key)) {
            const cEval = evalExpr(p.expr, env);
            hColor = resolveColorToken(typeof cEval === 'string' ? cEval : p.expr, hColor) || hColor;
          }
          if (p.key === 'linestyle' || (idx === 3 && !p.key)) linestyle = resolveLineStyle(p.expr);
          if (p.key === 'linewidth') linewidth = Math.max(1, Math.min(4, Number(evalExpr(p.expr, env)) || 1));
        }
        const id = `hl_${env.nextObjSeq++}`;
        env.hlines.push({ id, title: hTitle, price: priceVal, color: hColor, linestyle, linewidth, overlay });
        env.hlinePriceById.set(id, priceVal);
        if (assignVar) env.vars.set(assignVar, id);
        return;
      }

      if (fnName === 'plot') {
        const series = toSeries(evalExpr(stripNamedArg(args[0] ?? 'close').expr, env), len);
        let pTitle = `Plot ${env.plots.length + 1}`;
        let pColorRaw = '#2b74ff';
        let pColorSeries: string[] | null = null;
        let linewidth = 2;
        let style: CustomPlotSeries['style'] = 'line';
        let plotOverlay = overlay;
        for (let idx = 1; idx < args.length; idx++) {
          const p = stripNamedArg(args[idx]!);
          if (p.key === 'title' || (idx === 1 && !p.key)) pTitle = p.expr.replace(/['"]/g, '').trim() || pTitle;
          if (p.key === 'color' || (idx === 2 && !p.key)) {
            const cEval = evalExpr(p.expr, env);
            if (Array.isArray(cEval)) pColorSeries = toColorSeries(cEval, len, '#2b74ff');
            else pColorRaw = resolveColorToken(typeof cEval === 'string' ? cEval : p.expr, pColorRaw) || pColorRaw;
          }
          if (p.key === 'linewidth' || (idx === 3 && !p.key)) linewidth = Math.max(1, Math.min(5, Number(evalExpr(p.expr, env)) || 2));
          if (p.key === 'style' || (idx === 4 && !p.key)) style = resolvePlotStyle(p.expr);
          if (p.key === 'overlay') plotOverlay = !/false/i.test(p.expr);
        }
        const points: CustomPlotSeries['points'] = [];
        for (let i = 0; i < len; i++) {
          if (Number.isFinite(series[i])) {
            points.push({
              time: Math.floor(candles[i]!.timestamp / 1000),
              value: series[i]!,
              ...(pColorSeries?.[i] ? { color: pColorSeries[i] } : {}),
            });
          }
        }
        const id = `pl_${env.nextObjSeq++}`;
        env.plots.push({ id, title: pTitle, color: pColorRaw, overlay: plotOverlay, linewidth, style, points });
        env.plotSeriesById.set(id, series);
        if (assignVar) env.vars.set(assignVar, id);
        return;
      }

      // plotcandle / plotbar
      const cSeries = toSeries(evalExpr(stripNamedArg(args[3] ?? 'close').expr, env), len);
      const id = `pl_${env.nextObjSeq++}`;
      env.plots.push({
        id,
        title: `${title} Candles`,
        color: '#38e1ff',
        overlay: true,
        linewidth: 1,
        style: 'line',
        points: cSeries.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v })).filter((p) => Number.isFinite(p.value)),
      });
      return;
    }

    // fill(p1, p2, color=...)
    const fillMatch = trimmed.match(/^fill\(([\s\S]+)\)$/);
    if (fillMatch) {
      const args = splitTopLevelArgs(fillMatch[1]!);
      const id1 = String(evalExpr(stripNamedArg(args[0] ?? '').expr, env));
      const id2 = String(evalExpr(stripNamedArg(args[1] ?? '').expr, env));
      let colRaw = 'rgba(43, 116, 255, 0.14)';
      for (let idx = 2; idx < args.length; idx++) {
        const p = stripNamedArg(args[idx]!);
        if (p.key === 'color' || (idx === 2 && !p.key)) {
          const ce = evalExpr(p.expr, env);
          colRaw = Array.isArray(ce) ? (toColorSeries(ce, len, colRaw)[len - 1] || colRaw) : resolveColorToken(String(ce), colRaw) || colRaw;
        }
      }
      const s1 = env.plotSeriesById.get(id1) ?? (env.hlinePriceById.has(id1) ? new Array<number>(len).fill(env.hlinePriceById.get(id1)!) : null);
      const s2 = env.plotSeriesById.get(id2) ?? (env.hlinePriceById.has(id2) ? new Array<number>(len).fill(env.hlinePriceById.get(id2)!) : null);
      if (s1 && s2) {
        const points: CustomFillZone['points'] = [];
        for (let i = 0; i < len; i++) {
          if (Number.isFinite(s1[i]) && Number.isFinite(s2[i])) {
            points.push({ time: Math.floor(candles[i]!.timestamp / 1000), top: Math.max(s1[i]!, s2[i]!), bottom: Math.min(s1[i]!, s2[i]!) });
          }
        }
        if (points.length) env.fills.push({ id: `fl_${env.nextObjSeq++}`, color: colRaw, overlay, points });
      }
      return;
    }

    // bgcolor(...) & barcolor(...)
    const bgMatch = trimmed.match(/^(bgcolor|barcolor)\(([\s\S]+)\)$/);
    if (bgMatch) {
      const fnName = bgMatch[1]!.toLowerCase();
      const args = splitTopLevelArgs(bgMatch[2]!);
      const cExpr = stripNamedArg(args[0] ?? 'na').expr;
      const colArr = toColorSeries(evalExpr(cExpr, env), len);
      for (let i = 0; i < len; i++) {
        if (!colArr[i]) continue;
        const time = Math.floor(candles[i]!.timestamp / 1000);
        if (fnName === 'bgcolor') env.bgcolors.push({ time, color: colArr[i]! });
        else env.barcolors.push({ time, color: colArr[i]! });
      }
      return;
    }

    // plotshape / plotchar / alertcondition
    const shapeMatch = trimmed.match(/^(plotshape|plotchar|alertcondition)\(([\s\S]+)\)$/);
    if (shapeMatch) {
      const fnName = shapeMatch[1]!.toLowerCase();
      const args = splitTopLevelArgs(shapeMatch[2]!);
      const condArr = toSeries(evalExpr(stripNamedArg(args[0] ?? 'false').expr, env), len);
      let sText = '';
      let sColor = '#38e1ff';
      let pos: CustomChartMarker['position'] = 'aboveBar';
      let shape: CustomChartMarker['shape'] = 'circle';
      for (let idx = 1; idx < args.length; idx++) {
        const p = stripNamedArg(args[idx]!);
        if (p.key === 'text' || p.key === 'char') sText = p.expr.replace(/['"]/g, '').trim();
        if (p.key === 'color') {
          const ce = evalExpr(p.expr, env);
          sColor = resolveColorToken(typeof ce === 'string' ? ce : p.expr, sColor) || sColor;
        }
        if (p.key === 'location') {
          pos = p.expr.toLowerCase().includes('belowbar') ? 'belowBar' : 'aboveBar';
        }
        if (p.key === 'style') {
          const st = p.expr.toLowerCase();
          if (st.includes('triangleup') || st.includes('labelup')) shape = 'arrowUp';
          else if (st.includes('triangledown') || st.includes('labeldown')) shape = 'arrowDown';
          else if (st.includes('square') || st.includes('diamond')) shape = 'square';
        }
      }
      const lower = trimmed.toLowerCase();
      const isShort = lower.includes('short') || lower.includes('sell') || lower.includes('location.abovebar') || shape === 'arrowDown';
      const isLong = !isShort && (lower.includes('long') || lower.includes('buy') || lower.includes('location.belowbar') || shape === 'arrowUp');
      for (let i = 0; i < len; i++) {
        if (condArr[i] && Number.isFinite(condArr[i])) {
          if (fnName === 'alertcondition') {
            if (isShort) env.shortFlags[i] = 1;
            else if (isLong) env.longFlags[i] = 1;
          } else {
            if (isShort) env.shortFlags[i] = 1;
            else if (isLong) env.longFlags[i] = 1;
            else {
              extraMarkers.push({
                time: Math.floor(candles[i]!.timestamp / 1000),
                position: pos,
                color: sColor,
                shape,
                text: sText || (fnName === 'plotchar' ? '★' : '●'),
              });
            }
          }
        }
      }
      return;
    }

    // strategy.entry(...)
    const entryMatch = trimmed.match(/^strategy\.entry\(([\s\S]+)\)$/);
    if (entryMatch) {
      const args = splitTopLevelArgs(entryMatch[1]!);
      const dirExpr = stripNamedArg(args[1] ?? '').expr;
      const isShort = dirExpr.includes('short') || stripNamedArg(args[0] ?? '').expr.toLowerCase().includes('short');
      let cond = new Array<number>(len).fill(1);
      for (const a of args) {
        const parsed = stripNamedArg(a);
        if (parsed.key === 'when') cond = toSeries(evalExpr(parsed.expr, env), len);
      }
      for (let i = 0; i < len; i++) {
        if (cond[i] && Number.isFinite(cond[i])) {
          if (isShort) env.shortFlags[i] = 1;
          else env.longFlags[i] = 1;
        }
      }
      return;
    }

    if (trimmed.startsWith('strategy.close(') || trimmed.startsWith('strategy.close_all(') || trimmed.startsWith('strategy.exit(')) {
      return;
    }

    // Variable assignment (vectorized)
    const assignMatch = trimmed.match(/^(?:(?:var|varip|int|float|bool|string|color|series|simple|const)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*(?::=|=)\s*(.+)$/);
    if (assignMatch) {
      try {
        env.vars.set(assignMatch[1]!, evalExpr(assignMatch[2]!, env));
      } catch (err) {
        errors.push(`Line ${stmt.lineNo}: ${err instanceof Error ? err.message : 'Expression error'}`);
      }
      return;
    }

    // Expression-only statement (e.g. table.cell)
    try {
      evalExpr(trimmed, env);
    } catch {
      // safe ignore non-critical top-level directives
    }
  };

  for (const s of stmts) execTopStmt(s);

  // Execute collected stateful / bar-by-bar drawing & array blocks cleanly across all candles
  if (barStmts.length > 0) {
    for (let i = 0; i < len; i++) {
      let lastIfPassed = false;
      for (const s of barStmts) {
        const isElse = s.text === 'else' || s.text.startsWith('else ') || s.text.startsWith('else if ');
        if (s.text.startsWith('if ')) {
          lastIfPassed = Boolean(execBarStmt(s, i, true));
        } else if (isElse) {
          if (!lastIfPassed) {
            lastIfPassed = Boolean(execBarStmt(s, i, true));
          }
        } else {
          lastIfPassed = false;
          execBarStmt(s, i, true);
        }
      }
    }
    env.barIdx = null;
  }

  if (errors.length) {
    return {
      valid: false,
      language: 'pine',
      title,
      overlay,
      errors,
      warnings: env.warnings,
      signals: [],
      plots: env.plots,
      markers: [],
      latestSignal: null,
    };
  }

  return buildFinalSignalsAndMarkers(candles, timeframe, env, title, 'pine', overlay, 1.8, 1.3, 2.4, 3.6, extraMarkers);
}

/* ============================================================================
 * 2. Python Algorithmic Strategy Sandbox Interpreter
 * ============================================================================ */

export function evaluatePythonStrategy(
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  const env = makeBaseEnv(candles, String(timeframe));
  const len = candles.length;
  let title = 'Custom Python Strategy';
  const errors: string[] = [];

  if (!code.trim()) {
    return {
      valid: false,
      language: 'python',
      title,
      overlay: true,
      errors: ['Python strategy code cannot be empty.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const lines = code.split(/\r?\n/);
  const palette = ['#2b74ff', '#10d9a3', '#e8c15a', '#38e1ff', '#a855f7'];
  const autoPlotKeys: Array<{ key: string; label: string }> = [];

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln]!;
    const commentMatch = raw.match(/#\s*title:\s*(.+)$/i);
    if (commentMatch?.[1]) title = commentMatch[1].trim();
    const cleaned = raw.replace(/#.*$/, '').trim();
    if (!cleaned) continue;
    if (
      cleaned.startsWith('import ') ||
      cleaned.startsWith('from ') ||
      cleaned.startsWith('def ') ||
      cleaned.startsWith('return ') ||
      cleaned === 'pass'
    ) {
      continue;
    }

    const pyTuple = cleaned.match(/^([A-Za-z_][A-Za-z0-9_,\s]*)\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)\(([\s\S]*)\)$/);
    if (pyTuple && pyTuple[1]!.includes(',')) {
      const names = pyTuple[1]!.split(',').map((s) => s.trim());
      const out = callBuiltinFn(pyTuple[2]!, splitTopLevelArgs(pyTuple[3]!), env);
      if (Array.isArray(out) && Array.isArray(out[0])) {
        names.forEach((nm, idx) => {
          if (nm && nm !== '_') {
            const s = (out as number[][])[idx] ?? new Array<number>(len).fill(NaN);
            env.vars.set(nm, s);
            autoPlotKeys.push({ key: nm, label: nm });
          }
        });
      }
      continue;
    }

    const plotCall = cleaned.match(/^plot\(([\s\S]+)\)$/);
    if (plotCall) {
      const args = splitTopLevelArgs(plotCall[1]!);
      const pTitle = stripNamedArg(args[0] ?? '').expr.replace(/['"]/g, '').trim() || `Py Plot ${env.plots.length + 1}`;
      const series = toSeries(evalExpr(stripNamedArg(args[1] ?? 'close').expr, env), len);
      const pColor = resolveColorToken(stripNamedArg(args[2] ?? '').expr, palette[env.plots.length % palette.length]!);
      const points: CustomPlotSeries['points'] = [];
      for (let i = 0; i < len; i++) {
        if (Number.isFinite(series[i])) points.push({ time: Math.floor(candles[i]!.timestamp / 1000), value: series[i]! });
      }
      env.plots.push({ title: pTitle, color: pColor, overlay: true, points });
      continue;
    }

    const locMatch = cleaned.match(/^df\.loc\[(.+),\s*['"]signal['"]\]\s*=\s*(.+)$/);
    if (locMatch) {
      const cond = toSeries(evalExpr(locMatch[1]!, env), len);
      const rhsRaw = locMatch[2]!.trim().toUpperCase();
      const isLong = rhsRaw === '1' || rhsRaw.includes('LONG') || rhsRaw.includes('BUY');
      const isShort = rhsRaw === '-1' || rhsRaw.includes('SHORT') || rhsRaw.includes('SELL');
      for (let i = 0; i < len; i++) {
        if (cond[i] && !Number.isNaN(cond[i])) {
          if (isLong) env.longFlags[i] = 1;
          if (isShort) env.shortFlags[i] = 1;
        }
      }
      continue;
    }

    const dfAssign = cleaned.match(/^df\[['"]([A-Za-z0-9_]+)['"]\]\s*=\s*(.+)$/);
    const varAssign = !dfAssign ? cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/) : null;
    if (dfAssign || varAssign) {
      const target = (dfAssign ? dfAssign[1] : varAssign![1])!;
      const rhs = (dfAssign ? dfAssign[2] : varAssign![2])!;
      try {
        const val = evalExpr(rhs, env);
        env.vars.set(target, val);
        if (target === 'signal') {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) {
            if (arr[i] === 1) env.longFlags[i] = 1;
            else if (arr[i] === -1) env.shortFlags[i] = 1;
          }
        } else if (/^(buy|long)/i.test(target)) {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) if (arr[i] && !Number.isNaN(arr[i])) env.longFlags[i] = 1;
        } else if (/^(sell|short)/i.test(target)) {
          const arr = toSeries(val, len);
          for (let i = 0; i < len; i++) if (arr[i] && !Number.isNaN(arr[i])) env.shortFlags[i] = 1;
        } else if (/^(ema|sma|bb|upper|lower|mid|supertrend|vwap|st)/i.test(target)) {
          autoPlotKeys.push({ key: target, label: target });
        }
      } catch (err) {
        errors.push(`Line ${ln + 1}: ${err instanceof Error ? err.message : 'Syntax error'}`);
      }
    }
  }

  if (env.plots.length === 0 && autoPlotKeys.length > 0) {
    const refPx = candles[candles.length - 1]?.close || 1;
    for (const item of autoPlotKeys.slice(0, 4)) {
      const s = env.vars.get(item.key);
      if (!Array.isArray(s)) continue;
      const lastFinite = [...s].reverse().find((x) => typeof x === 'number' && Number.isFinite(x)) as number | undefined;
      if (lastFinite === undefined) continue;
      if (lastFinite > refPx * 0.25 && lastFinite < refPx * 4) {
        const points: CustomPlotSeries['points'] = [];
        for (let i = 0; i < len; i++) {
          const val = Number(s[i]);
          if (Number.isFinite(val)) points.push({ time: Math.floor(candles[i]!.timestamp / 1000), value: val });
        }
        env.plots.push({
          title: item.label,
          color: palette[env.plots.length % palette.length]!,
          overlay: true,
          points,
        });
      }
    }
  }

  if (errors.length) {
    return {
      valid: false,
      language: 'python',
      title,
      overlay: true,
      errors,
      warnings: env.warnings,
      signals: [],
      plots: env.plots,
      markers: [],
      latestSignal: null,
    };
  }

  return buildFinalSignalsAndMarkers(candles, timeframe, env, title, 'python', true);
}

/* ============================================================================
 * 3. Visual No-Code Rule Builder Evaluator
 * ============================================================================ */

function evalVisualRule(rule: VisualRuleCondition, candles: Candle[], env: ExecEnv): boolean[] {
  const len = candles.length;
  const close = candles.map((c) => c.close);
  const vol = candles.map((c) => c.volume);
  const res = new Array<boolean>(len).fill(false);

  switch (rule.kind) {
    case 'EMA_CROSS_ABOVE':
    case 'EMA_CROSS_BELOW': {
      const p1 = Math.max(2, rule.param1 || 9);
      const p2 = Math.max(p1 + 1, rule.param2 || 21);
      const e1 = ema(close, p1);
      const e2 = ema(close, p2);
      const cross = rule.kind === 'EMA_CROSS_ABOVE' ? crossoverSeries(e1, e2) : crossunderSeries(e1, e2);
      if (env.plots.length < 4) {
        env.plots.push({
          title: `EMA ${p1}`,
          color: '#38e1ff',
          overlay: true,
          points: e1.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v })).filter((x) => Number.isFinite(x.value)),
        });
        env.plots.push({
          title: `EMA ${p2}`,
          color: '#e8c15a',
          overlay: true,
          points: e2.map((v, i) => ({ time: Math.floor(candles[i]!.timestamp / 1000), value: v })).filter((x) => Number.isFinite(x.value)),
        });
      }
      return cross.map((x) => x === 1);
    }
    case 'PRICE_ABOVE_EMA':
    case 'PRICE_BELOW_EMA': {
      const p = Math.max(5, rule.param1 || 50);
      const e = ema(close, p);
      return close.map((c, i) => Number.isFinite(e[i]) && (rule.kind === 'PRICE_ABOVE_EMA' ? c > e[i]! : c < e[i]!));
    }
    case 'RSI_BELOW':
    case 'RSI_ABOVE': {
      const r = rsi(close, 14);
      const thr = rule.param1 || (rule.kind === 'RSI_BELOW' ? 32 : 68);
      return r.map((v) => Number.isFinite(v) && (rule.kind === 'RSI_BELOW' ? v < thr : v > thr));
    }
    case 'MACD_CROSS_UP':
    case 'MACD_CROSS_DOWN': {
      const m = macdSeries(close, 12, 26, 9);
      const cross = rule.kind === 'MACD_CROSS_UP' ? crossoverSeries(m.line, m.signalLine) : crossunderSeries(m.line, m.signalLine);
      return cross.map((x) => x === 1);
    }
    case 'BB_LOWER_TOUCH':
    case 'BB_UPPER_TOUCH': {
      const b = bollingerBands(close, Math.max(5, rule.param1 || 20), rule.param2 || 2);
      return candles.map((c, i) =>
        rule.kind === 'BB_LOWER_TOUCH'
          ? Number.isFinite(b.lower[i]) && c.close <= b.lower[i]!
          : Number.isFinite(b.upper[i]) && c.close >= b.upper[i]!
      );
    }
    case 'SUPERTREND_BULL':
    case 'SUPERTREND_BEAR': {
      const s = supertrendSeries(candles, rule.param2 || 3, Math.max(5, rule.param1 || 10));
      return s.dir.map((d) => (rule.kind === 'SUPERTREND_BULL' ? d === 1 : d === -1));
    }
    case 'VOLUME_SPIKE': {
      const vAvg = sma(vol, 20);
      const mult = rule.param1 || 1.5;
      return vol.map((v, i) => Number.isFinite(vAvg[i]) && v >= vAvg[i]! * mult);
    }
  }
  return res;
}

export function evaluateVisualStrategy(
  codeOrDef: string | VisualStrategyDefinition,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  let def: VisualStrategyDefinition;
  try {
    def = typeof codeOrDef === 'string' ? (JSON.parse(codeOrDef) as VisualStrategyDefinition) : codeOrDef;
  } catch {
    return {
      valid: false,
      language: 'visual',
      title: 'Visual Strategy',
      overlay: true,
      errors: ['Invalid Visual Strategy JSON definition.'],
      warnings: [],
      signals: [],
      plots: [],
      markers: [],
      latestSignal: null,
    };
  }

  const env = makeBaseEnv(candles, String(timeframe));
  const len = candles.length;
  const combine = (rules: VisualRuleCondition[]) => {
    if (!rules.length) return new Array<boolean>(len).fill(false);
    const mats = rules.map((r) => evalVisualRule(r, candles, env));
    return candles.map((_, i) => (def.logic === 'ANY' ? mats.some((m) => m[i]) : mats.every((m) => m[i])));
  };

  const longs = combine(def.longRules || []);
  const shorts = combine(def.shortRules || []);
  for (let i = 0; i < len; i++) {
    if (longs[i]) env.longFlags[i] = 1;
    if (shorts[i]) env.shortFlags[i] = 1;
  }

  return buildFinalSignalsAndMarkers(
    candles,
    timeframe,
    env,
    def.name || 'Visual Strategy',
    'visual',
    true,
    def.slAtrMult || 1.8,
    def.tp1R || 1.3,
    def.tp2R || 2.4,
    def.tp3R || 3.6
  );
}

export function evaluateCustomStrategy(
  language: CustomStrategyLanguage,
  code: string,
  candles: Candle[],
  timeframe: Timeframe | string = '15m'
): CustomStrategyEvalResult {
  if (language === 'pine') return evaluatePineStrategy(code, candles, timeframe);
  if (language === 'python') return evaluatePythonStrategy(code, candles, timeframe);
  return evaluateVisualStrategy(code, candles, timeframe);
}

/* ============================================================================
 * 4. Built-in Sample Pine Script v5 & Python Strategy Library
 * ============================================================================ */

export const SAMPLE_CUSTOM_STRATEGIES: SampleCustomStrategy[] = [
  {
    id: 'pine_smc_orderblocks_hud',
    nameFa: 'Pine v5: اسمارت مانی (SMC Order Blocks + FVG + Box/Label/Line/Table)',
    nameEn: 'Pine v5: SMC Order Blocks + FVG + Full TV Graphics',
    descriptionFa: 'نمونه کامل Pine Script v5 با رسم باکس‌های Order Block و FVG، خطوط BOS، لیبل‌ها و جدول HUD زنده روی چارت.',
    descriptionEn: 'Full TradingView Pine v5 showcase using box.new, line.new, label.new, table.new, pivot structure & fill clouds.',
    language: 'pine',
    category: 'Smart Money v5',
    code: `//@version=5
strategy("SMC Order Blocks + FVG + TV HUD", overlay=true)

swingLen = input.int(5, title="Swing Pivot Length")
emaFast = ta.ema(close, 21)
emaSlow = ta.ema(close, 55)
rsiVal = ta.rsi(close, 14)
atrVal = ta.atr(14)

pFast = plot(emaFast, title="EMA 21", color=color.aqua, linewidth=2)
pSlow = plot(emaSlow, title="EMA 55", color=color.orange, linewidth=2)
fill(pFast, pSlow, color=emaFast >= emaSlow ? color.new(color.green, 84) : color.new(color.red, 84))

ph = ta.pivothigh(high, swingLen, swingLen)
pl = ta.pivotlow(low, swingLen, swingLen)

var float lastSwingHigh = na
var float lastSwingLow = na
var box bullOb = na
var box bearOb = na

if not na(ph)
    lastSwingHigh := ph
    label.new(bar_index - swingLen, ph, text="SH", style=label.style_label_down, color=color.new(color.red, 20), textcolor=color.white)

if not na(pl)
    lastSwingLow := pl
    label.new(bar_index - swingLen, pl, text="SL", style=label.style_label_up, color=color.new(color.green, 20), textcolor=color.white)

bullFvg = low > high[2] and (low - high[2]) > atrVal * 0.25
bearFvg = high < low[2] and (low[2] - high) > atrVal * 0.25

if bullFvg
    box.new(left=bar_index - 2, top=low, right=bar_index + 10, bottom=high[2], border_color=color.new(color.lime, 40), bgcolor=color.new(color.lime, 86), text="FVG+")

if bearFvg
    box.new(left=bar_index - 2, top=low[2], right=bar_index + 10, bottom=high, border_color=color.new(color.rose, 40), bgcolor=color.new(color.rose, 86), text="FVG-")

bosBull = not na(lastSwingHigh) and ta.crossover(close, lastSwingHigh)
bosBear = not na(lastSwingLow) and ta.crossunder(close, lastSwingLow)

if bosBull
    line.new(bar_index - 8, lastSwingHigh, bar_index + 2, lastSwingHigh, color=color.lime, style=line.style_dashed, width=2)
    label.new(bar_index, high + atrVal * 0.4, text="BOS ▲", style=label.style_label_down, color=color.lime, textcolor=color.black)
    bullOb := box.new(left=bar_index - 3, top=high[2], right=bar_index + 14, bottom=low[2], border_color=color.aqua, bgcolor=color.new(color.aqua, 84), text="Bull OB")

if bosBear
    line.new(bar_index - 8, lastSwingLow, bar_index + 2, lastSwingLow, color=color.red, style=line.style_dashed, width=2)
    label.new(bar_index, low - atrVal * 0.4, text="BOS ▼", style=label.style_label_up, color=color.red, textcolor=color.white)
    bearOb := box.new(left=bar_index - 3, top=high[2], right=bar_index + 14, bottom=low[2], border_color=color.orange, bgcolor=color.new(color.orange, 84), text="Bear OB")

var table hud = table.new(position.top_right, 2, 4, bgcolor=color.new(color.black, 20), border_color=color.new(color.aqua, 60))
if barstate.islast
    table.cell(hud, 0, 0, "Dollarino SMC v5", text_color=color.aqua, bgcolor=color.new(color.blue, 65))
    table.cell(hud, 1, 0, "LIVE", text_color=color.lime, bgcolor=color.new(color.green, 75))
    table.cell(hud, 0, 1, "Trend EMA", text_color=color.silver)
    table.cell(hud, 1, 1, emaFast >= emaSlow ? "BULLISH" : "BEARISH", text_color=emaFast >= emaSlow ? color.lime : color.red)
    table.cell(hud, 0, 2, "RSI (14)", text_color=color.silver)
    table.cell(hud, 1, 2, str.tostring(rsiVal, "#.##"), text_color=color.yellow)
    table.cell(hud, 0, 3, "ATR (14)", text_color=color.silver)
    table.cell(hud, 1, 3, str.tostring(atrVal, "#.##"), text_color=color.white)

longCond = bosBull or (ta.crossover(emaFast, emaSlow) and rsiVal > 45)
shortCond = bosBear or (ta.crossunder(emaFast, emaSlow) and rsiVal < 55)
strategy.entry("SMC Long", strategy.long, when=longCond)
strategy.entry("SMC Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'pine_ema_rsi_momentum',
    nameFa: 'Pine v5: تقاطع EMA 9/21 + ابر رنگی + RSI',
    nameEn: 'Pine v5: EMA 9/21 Cross + Cloud Fill + RSI',
    descriptionFa: 'اسکریپت استاندارد TradingView با رسم ابر EMA، رنگ پس‌زمینه روند و فیلتر مومنتوم RSI.',
    descriptionEn: 'TradingView Pine v5 script plotting dual EMAs with trend fill cloud and RSI momentum confirmation.',
    language: 'pine',
    category: 'Trend Momentum',
    code: `//@version=5
strategy("Dollarino EMA 9/21 + RSI Momentum", overlay=true)

fastLen = input.int(9, title="Fast EMA")
slowLen = input.int(21, title="Slow EMA")
rsiLen = input.int(14, title="RSI Length")

emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)
rsiVal = ta.rsi(close, rsiLen)

p1 = plot(emaFast, title="EMA 9", color=color.aqua, linewidth=2)
p2 = plot(emaSlow, title="EMA 21", color=color.yellow, linewidth=2)
fill(p1, p2, color=emaFast >= emaSlow ? color.new(color.aqua, 86) : color.new(color.red, 86))

longCond = ta.crossover(emaFast, emaSlow) and rsiVal > 48
shortCond = ta.crossunder(emaFast, emaSlow) and rsiVal < 52

bgcolor(longCond ? color.new(color.green, 82) : shortCond ? color.new(color.red, 82) : na)

strategy.entry("Long", strategy.long, when=longCond)
strategy.entry("Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'pine_bb_mean_reversion',
    nameFa: 'Pine v5: برگشت از باندهای بولینگر + پرکردن کانال',
    nameEn: 'Pine v5: Bollinger Mean Reversion + Channel Fill',
    descriptionFa: 'شناسایی اشباع خرید و فروش روی باند بولینگر ۲۰ با رنگ‌آمیزی کانال و فیلتر RSI.',
    descriptionEn: 'Mean-reversion entries at Bollinger Bands extremes with shaded band fill and RSI 14.',
    language: 'pine',
    category: 'Mean Reversion',
    code: `//@version=5
strategy("Bollinger + RSI Reversal", overlay=true)

len = input.int(20, title="BB Period")
mult = input.float(2.0, title="Multiplier")
[bbMid, bbUpper, bbLower] = ta.bb(close, len, mult)
rsiVal = ta.rsi(close, 14)

pU = plot(bbUpper, title="BB Upper", color=color.red)
pM = plot(bbMid, title="BB Basis", color=color.blue)
pL = plot(bbLower, title="BB Lower", color=color.green)
fill(pU, pL, color=color.new(color.blue, 90))

longCond = ta.crossover(close, bbLower) and rsiVal < 40
shortCond = ta.crossunder(close, bbUpper) and rsiVal > 60

strategy.entry("BB Long", strategy.long, when=longCond)
strategy.entry("BB Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'pine_supertrend_breakout',
    nameFa: 'Pine v5: سوپرترند ATR + فیلتر تایم‌فریم بالاتر (MTF)',
    nameEn: 'Pine v5: SuperTrend ATR + MTF EMA 200',
    descriptionFa: 'تشخیص تغییر روند قطعی با سوپرترند و همسو کردن معاملات با request.security روی تایم‌فریم ۱ ساعته.',
    descriptionEn: 'Captures SuperTrend flips filtered by higher-timeframe request.security EMA.',
    language: 'pine',
    category: 'Trend Following',
    code: `//@version=5
strategy("SuperTrend ATR + MTF EMA", overlay=true)

[stLine, stDir] = ta.supertrend(3.0, 10)
htfEma = request.security(syminfo.tickerid, "60", ta.ema(close, 50))

plot(stLine, title="SuperTrend", color=stDir > 0 ? color.lime : color.red, linewidth=2)
plot(htfEma, title="1H EMA 50", color=color.orange, linewidth=2)

longCond = stDir > 0 and stDir[1] < 0 and close > htfEma
shortCond = stDir < 0 and stDir[1] > 0 and close < htfEma

strategy.entry("ST Long", strategy.long, when=longCond)
strategy.entry("ST Short", strategy.short, when=shortCond)
`,
  },
  {
    id: 'py_dorna_ema_pullback',
    nameFa: 'Python: ربات روند EMA + ATR (سبک کوانت)',
    nameEn: 'Python: Quant EMA Pullback + Bollinger',
    descriptionFa: 'کد پایتون با ساختار Pandas-TA برای شکار پولبک روند و رسم خطوط روی چارت.',
    descriptionEn: 'Pandas-style Python strategy computing EMAs and RSI with live chart overlays.',
    language: 'python',
    category: 'Python Quant',
    code: `# title: Python Quant EMA Pullback
import pandas as pd

def generate_signals(df):
    df['ema_fast'] = df['close'].ewm(span=12).mean()
    df['ema_slow'] = df['close'].ewm(span=26).mean()
    df['ema_trend'] = df['close'].ewm(span=100).mean()
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("EMA 12", df['ema_fast'], "#38e1ff")
    plot("EMA 26", df['ema_slow'], "#e8c15a")
    plot("EMA 100", df['ema_trend'], "#a855f7")

    long_cond = crossover(df['ema_fast'], df['ema_slow']) & (df['close'] > df['ema_trend']) & (df['rsi'] > 45)
    short_cond = crossunder(df['ema_fast'], df['ema_slow']) & (df['close'] < df['ema_trend']) & (df['rsi'] < 55)

    df.loc[long_cond, 'signal'] = 1
    df.loc[short_cond, 'signal'] = -1
    return df
`,
  },
  {
    id: 'py_rsi_bb_scalper',
    nameFa: 'Python: اسکلپر بولینگر و RSI',
    nameEn: 'Python: Bollinger + RSI Scalper',
    descriptionFa: 'اسکریپت پایتون برای شکار بازگشت قیمت از لبه‌های بولینگر در تایم‌فریم‌های سریع.',
    descriptionEn: 'Fast Bollinger Band + RSI reversion Python bot.',
    language: 'python',
    category: 'Python Scalper',
    code: `# title: Python Bollinger & RSI Scalper
def generate_signals(df):
    bb_mid, bb_upper, bb_lower = ta.bbands(df['close'], 20, 2.0)
    df['rsi'] = ta.rsi(df['close'], 14)

    plot("BB Upper", bb_upper, "#ff4d6d")
    plot("BB Mid", bb_mid, "#2b74ff")
    plot("BB Lower", bb_lower, "#10d9a3")

    df.loc[(df['close'] < bb_lower) & (df['rsi'] < 35), 'signal'] = 1
    df.loc[(df['close'] > bb_upper) & (df['rsi'] > 65), 'signal'] = -1
    return df
`,
  },
  {
    id: 'py_donchian_breakout',
    nameFa: 'Python: شکست کانال دونچیان (Breakout)',
    nameEn: 'Python: Donchian Channel Breakout',
    descriptionFa: 'استراتژی شکست سقف و کف ۲۰ کندل اخیر برای موج‌سواری روندهای قدرتمند.',
    descriptionEn: 'Classic Turtle-style 20-bar Donchian high/low breakout Python strategy.',
    language: 'python',
    category: 'Breakout',
    code: `# title: Python Donchian Channel Breakout
def generate_signals(df):
    df['upper_ch'] = df['high'].rolling(20).max().shift(1)
    df['lower_ch'] = df['low'].rolling(20).min().shift(1)
    df['mid_ch'] = (df['upper_ch'] + df['lower_ch']) / 2

    plot("Donchian High", df['upper_ch'], "#10d9a3")
    plot("Donchian Low", df['lower_ch'], "#ff4d6d")

    df.loc[df['close'] > df['upper_ch'], 'signal'] = 1
    df.loc[df['close'] < df['lower_ch'], 'signal'] = -1
    return df
`,
  },
];
