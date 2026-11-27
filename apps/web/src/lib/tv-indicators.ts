import {
  adx,
  alma,
  atr,
  bollingerBands,
  cci,
  donchianChannels,
  ema,
  hma,
  ichimoku,
  keltnerChannels,
  macd,
  mfi,
  obv,
  parabolicSar,
  pivotPoints,
  rma,
  roc,
  rsi,
  sma,
  stochastic,
  stochRsi,
  supertrend,
  vwap,
  williamsR,
  wma,
  type Candle,
  type CustomFillZone,
  type CustomHLine,
  type CustomPlotSeries,
} from '@dollarino/core';

export type ChartSeriesType = 'candles' | 'hollow' | 'heikin_ashi' | 'line' | 'area' | 'baseline';

export type DrawingToolType =
  | 'cursor'
  | 'trendline'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'rect'
  | 'fib'
  | 'long_pos'
  | 'short_pos'
  | 'measure'
  | 'text';

export interface ChartDrawingPoint {
  time: number; // UTC unix seconds
  price: number;
}

export interface ChartDrawing {
  id: string;
  tool: Exclude<DrawingToolType, 'cursor'>;
  p1: ChartDrawingPoint;
  p2?: ChartDrawingPoint;
  color: string;
  text?: string;
}

export interface TvIndicatorDef {
  id: string;
  nameFa: string;
  nameEn: string;
  shortName: string;
  category: 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME';
  overlay: boolean;
  pineRef: string;
  defaultColor: string;
  defaultParams: Record<string, number>;
  paramLabels?: Record<string, { fa: string; en: string; min?: number; max?: number; step?: number }>;
  descriptionFa: string;
  descriptionEn: string;
}

export interface ActiveTvIndicator {
  uid: string;
  id: string;
  params: Record<string, number>;
  visible: boolean;
  color?: string;
}

export interface TvSubPaneSpec {
  uid: string;
  id: string;
  title: string;
  plots: CustomPlotSeries[];
  hlines: CustomHLine[];
  fills: CustomFillZone[];
  lastSummary: string;
}

export interface TvLegendItem {
  uid: string;
  id: string;
  title: string;
  visible: boolean;
  overlay: boolean;
  values: Array<{ label: string; value: string; color: string }>;
}

export interface ComputedTvIndicators {
  mainPlots: CustomPlotSeries[];
  mainFills: CustomFillZone[];
  mainHlines: CustomHLine[];
  subPanes: TvSubPaneSpec[];
  legends: TvLegendItem[];
}

export const TV_INDICATOR_CATALOG: TvIndicatorDef[] = [
  {
    id: 'EMA',
    nameFa: 'میانگین متحرک نمایی (EMA)',
    nameEn: 'Exponential Moving Average',
    shortName: 'EMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.ema(close, length)',
    defaultColor: '#38bdf8',
    defaultParams: { length: 20 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 2, max: 500, step: 1 } },
    descriptionFa: 'میانگین متحرک نمایی پرسرعت برای تشخیص روند و پولبک.',
    descriptionEn: 'Fast exponential moving average reacting quickly to recent prices.',
  },
  {
    id: 'EMA_RIBBON',
    nameFa: 'ربان ۳تایی EMA (9 / 21 / 55)',
    nameEn: 'EMA Ribbon (9 / 21 / 55)',
    shortName: 'EMA Ribbon',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.ema(9/21/55)',
    defaultColor: '#2b74ff',
    defaultParams: { fast: 9, mid: 21, slow: 55 },
    paramLabels: {
      fast: { fa: 'سریع', en: 'Fast', min: 2, max: 100, step: 1 },
      mid: { fa: 'میانی', en: 'Mid', min: 5, max: 200, step: 1 },
      slow: { fa: 'کند', en: 'Slow', min: 10, max: 400, step: 1 },
    },
    descriptionFa: 'نمایش همزمان سه EMA کلیدی برای شکار مومنتوم و کراس‌اوور.',
    descriptionEn: 'Triple EMA ribbon for trend alignment and crossover entries.',
  },
  {
    id: 'SMA',
    nameFa: 'میانگین متحرک ساده (SMA)',
    nameEn: 'Simple Moving Average',
    shortName: 'SMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.sma(close, length)',
    defaultColor: '#f59e0b',
    defaultParams: { length: 50 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 2, max: 500, step: 1 } },
    descriptionFa: 'میانگین کلاسیک ساده برای حمایت و مقاومت‌های داینامیک.',
    descriptionEn: 'Classic simple moving average for institutional support/resistance.',
  },
  {
    id: 'WMA',
    nameFa: 'میانگین متحرک وزنی (WMA)',
    nameEn: 'Weighted Moving Average',
    shortName: 'WMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.wma(close, length)',
    defaultColor: '#ec4899',
    defaultParams: { length: 21 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 2, max: 300, step: 1 } },
    descriptionFa: 'وزن خطی بیشتر به کندل‌های جدیدتر.',
    descriptionEn: 'Linearly weighted moving average favoring newer bars.',
  },
  {
    id: 'HMA',
    nameFa: 'میانگین متحرک هال (HMA)',
    nameEn: 'Hull Moving Average',
    shortName: 'HMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.hma(close, length)',
    defaultColor: '#22d3ee',
    defaultParams: { length: 21 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 3, max: 250, step: 1 } },
    descriptionFa: 'کاهش شدید تاخیر (Lag) در عین حفظ نرمی خط روند.',
    descriptionEn: 'Near-zero lag smooth trend indicator by Alan Hull.',
  },
  {
    id: 'RMA',
    nameFa: 'میانگین وایلدر تریدینگ‌ویو (RMA)',
    nameEn: 'Wilder Moving Average (RMA)',
    shortName: 'RMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.rma(close, length)',
    defaultColor: '#a855f7',
    defaultParams: { length: 14 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 2, max: 250, step: 1 } },
    descriptionFa: 'میانگین نمایی مورد استفاده در RSI و ATR استاندارد.',
    descriptionEn: 'Wilder smoothing used internally by RSI and ATR.',
  },
  {
    id: 'ALMA',
    nameFa: 'میانگین گائوسی ALMA',
    nameEn: 'Arnaud Legoux MA (ALMA)',
    shortName: 'ALMA',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.alma(close, length, offset, sigma)',
    defaultColor: '#14b8a6',
    defaultParams: { length: 20, offset: 0.85, sigma: 6 },
    paramLabels: {
      length: { fa: 'دوره', en: 'Length', min: 3, max: 200, step: 1 },
      offset: { fa: 'افست', en: 'Offset', min: 0.1, max: 0.99, step: 0.05 },
      sigma: { fa: 'سیگما', en: 'Sigma', min: 1, max: 12, step: 1 },
    },
    descriptionFa: 'فیلتر گائوسی با کمترین نویز بازار.',
    descriptionEn: 'Gaussian-weighted moving average minimizing market noise.',
  },
  {
    id: 'SUPERTREND',
    nameFa: 'سوپرترند (SuperTrend)',
    nameEn: 'SuperTrend',
    shortName: 'SuperTrend',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.supertrend(factor, atrPeriod)',
    defaultColor: '#10d9a3',
    defaultParams: { factor: 3, atrPeriod: 10 },
    paramLabels: {
      factor: { fa: 'ضریب ATR', en: 'Factor', min: 0.5, max: 10, step: 0.25 },
      atrPeriod: { fa: 'دوره ATR', en: 'ATR Period', min: 3, max: 50, step: 1 },
    },
    descriptionFa: 'خط روند سبز/قرمز پویا بر پایه ATR برای تشخیص تغییر روند.',
    descriptionEn: 'ATR-based dynamic bullish/bearish trend follower.',
  },
  {
    id: 'ICHIMOKU',
    nameFa: 'ابر ایچیموکو (Ichimoku Cloud)',
    nameEn: 'Ichimoku Cloud',
    shortName: 'Ichimoku',
    category: 'TREND',
    overlay: true,
    pineRef: 'Ichimoku(9, 26, 52)',
    defaultColor: '#10d9a3',
    defaultParams: { tenkan: 9, kijun: 26, senkouB: 52 },
    paramLabels: {
      tenkan: { fa: 'تنکان‌سن', en: 'Tenkan', min: 3, max: 50, step: 1 },
      kijun: { fa: 'کیجون‌سن', en: 'Kijun', min: 10, max: 100, step: 1 },
      senkouB: { fa: 'سنکو B', en: 'Senkou B', min: 20, max: 200, step: 1 },
    },
    descriptionFa: 'سیستم کامل ایچیموکو شامل تنکان، کیجون و ابر کوموی رنگی.',
    descriptionEn: 'Full Ichimoku system with Tenkan, Kijun, and shaded Kumo cloud.',
  },
  {
    id: 'PSAR',
    nameFa: 'پارابولیک سار (Parabolic SAR)',
    nameEn: 'Parabolic SAR',
    shortName: 'PSAR',
    category: 'TREND',
    overlay: true,
    pineRef: 'ta.sar(0.02, 0.02, 0.2)',
    defaultColor: '#fbbf24',
    defaultParams: { step: 0.02, maxStep: 0.2 },
    paramLabels: {
      step: { fa: 'گام', en: 'Step', min: 0.005, max: 0.1, step: 0.005 },
      maxStep: { fa: 'حداکثر گام', en: 'Max Step', min: 0.05, max: 0.5, step: 0.05 },
    },
    descriptionFa: 'نقاط تریلینگ استاپ سهموی بالا یا پایین کندل‌ها.',
    descriptionEn: 'Parabolic Stop and Reverse dots for trailing stop guidance.',
  },
  {
    id: 'PIVOTS',
    nameFa: 'نقاط پیوت کلاسیک (Floor Pivots)',
    nameEn: 'Pivot Points Standard (PP/R1-R3/S1-S3)',
    shortName: 'Pivots',
    category: 'TREND',
    overlay: true,
    pineRef: 'PivotPoints',
    defaultColor: '#38bdf8',
    defaultParams: { lookback: 24 },
    paramLabels: { lookback: { fa: 'کندل مبنا', en: 'Period Bars', min: 6, max: 200, step: 1 } },
    descriptionFa: 'رسم خودکار خطوط PP، R1/R2 و S1/S2 روی چارت.',
    descriptionEn: 'Classic floor pivot support and resistance levels on price chart.',
  },
  {
    id: 'VWAP',
    nameFa: 'خط میانگین حجم سشن (VWAP)',
    nameEn: 'Session VWAP',
    shortName: 'VWAP',
    category: 'VOLUME',
    overlay: true,
    pineRef: 'ta.vwap(hlc3)',
    defaultColor: '#eab308',
    defaultParams: {},
    descriptionFa: 'خط مرجع نقدینگی نهادی که هر روز UTC ریست می‌شود.',
    descriptionEn: 'Volume-Weighted Average Price anchored to UTC daily sessions.',
  },
  {
    id: 'BB',
    nameFa: 'باندهای بولینگر (Bollinger Bands)',
    nameEn: 'Bollinger Bands',
    shortName: 'BB',
    category: 'VOLATILITY',
    overlay: true,
    pineRef: 'ta.bb(close, length, mult)',
    defaultColor: '#3b82f6',
    defaultParams: { length: 20, mult: 2 },
    paramLabels: {
      length: { fa: 'دوره', en: 'Length', min: 5, max: 200, step: 1 },
      mult: { fa: 'ضریب انحراف', en: 'StdDev', min: 0.5, max: 5, step: 0.1 },
    },
    descriptionFa: 'کانال نوسان استاندارد همراه با ابر نیمه‌شفاف میان باندها.',
    descriptionEn: 'Volatility bands with shaded upper/lower standard deviation envelope.',
  },
  {
    id: 'KELTNER',
    nameFa: 'کانال کلتنر (Keltner Channels)',
    nameEn: 'Keltner Channels',
    shortName: 'KC',
    category: 'VOLATILITY',
    overlay: true,
    pineRef: 'ta.kc(close, length, mult)',
    defaultColor: '#06b6d4',
    defaultParams: { length: 20, mult: 1.5, atrPeriod: 10 },
    paramLabels: {
      length: { fa: 'دوره EMA', en: 'EMA Length', min: 5, max: 150, step: 1 },
      mult: { fa: 'ضریب ATR', en: 'Multiplier', min: 0.5, max: 5, step: 0.1 },
      atrPeriod: { fa: 'دوره ATR', en: 'ATR Len', min: 3, max: 50, step: 1 },
    },
    descriptionFa: 'کانال بر پایه EMA و ATR برای تشخیص فشردگی و شکست (Squeeze).',
    descriptionEn: 'ATR envelope around EMA — pair with Bollinger Bands for TTM Squeeze.',
  },
  {
    id: 'DONCHIAN',
    nameFa: 'کانال دونچیان (Donchian Channels)',
    nameEn: 'Donchian Channels',
    shortName: 'DC',
    category: 'VOLATILITY',
    overlay: true,
    pineRef: 'Donchian(length)',
    defaultColor: '#14b8a6',
    defaultParams: { length: 20 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 5, max: 200, step: 1 } },
    descriptionFa: 'سقف و کف N کندل اخیر + خط میانی برای ترید شکست (Turtle Breakout).',
    descriptionEn: 'Highest high / lowest low breakout channel with shaded fill.',
  },
  {
    id: 'RSI',
    nameFa: 'شاخص قدرت نسبی (RSI)',
    nameEn: 'Relative Strength Index (RSI)',
    shortName: 'RSI',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.rsi(close, length)',
    defaultColor: '#a855f7',
    defaultParams: { length: 14, overbought: 70, oversold: 30 },
    paramLabels: {
      length: { fa: 'دوره', en: 'Length', min: 2, max: 100, step: 1 },
      overbought: { fa: 'اشباع خرید', en: 'Overbought', min: 55, max: 95, step: 1 },
      oversold: { fa: 'اشباع فروش', en: 'Oversold', min: 5, max: 45, step: 1 },
    },
    descriptionFa: 'اسیلاتور کلاسیک مومنتوم در پنل مجزا همراه با خط ۷۰ و ۳۰.',
    descriptionEn: 'Classic momentum oscillator in a dedicated sub-pane with 70/30 levels.',
  },
  {
    id: 'MACD',
    nameFa: 'مکدی (MACD 12, 26, 9)',
    nameEn: 'MACD',
    shortName: 'MACD',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.macd(close, fast, slow, signal)',
    defaultColor: '#38bdf8',
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    paramLabels: {
      fast: { fa: 'سریع', en: 'Fast', min: 2, max: 50, step: 1 },
      slow: { fa: 'کند', en: 'Slow', min: 5, max: 100, step: 1 },
      signal: { fa: 'سیگنال', en: 'Signal', min: 2, max: 50, step: 1 },
    },
    descriptionFa: 'خط مکدی، خط سیگنال و هیستوگرام دو رنگ سبز/قرمز در پنل جدا.',
    descriptionEn: 'MACD line, signal line, and colored histogram in sub-pane.',
  },
  {
    id: 'STOCH',
    nameFa: 'استوکاستیک (%K / %D)',
    nameEn: 'Stochastic Oscillator',
    shortName: 'Stoch',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.stoch(close, high, low, kLen)',
    defaultColor: '#3b82f6',
    defaultParams: { kLen: 14, smoothK: 3, dLen: 3 },
    paramLabels: {
      kLen: { fa: 'دوره K', en: 'K Length', min: 3, max: 60, step: 1 },
      smoothK: { fa: 'نرم‌سازی K', en: 'Smooth K', min: 1, max: 20, step: 1 },
      dLen: { fa: 'دوره D', en: 'D Length', min: 1, max: 20, step: 1 },
    },
    descriptionFa: 'اسیلاتور سرعت قیمت با سطوح ۸۰ و ۲۰.',
    descriptionEn: 'Fast %K and %D stochastic oscillator with 80/20 thresholds.',
  },
  {
    id: 'STOCH_RSI',
    nameFa: 'استوکاستیک RSI',
    nameEn: 'Stochastic RSI',
    shortName: 'StochRSI',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'StochRSI(14, 14, 3, 3)',
    defaultColor: '#06b6d4',
    defaultParams: { rsiLen: 14, stochLen: 14, smoothK: 3, smoothD: 3 },
    paramLabels: {
      rsiLen: { fa: 'دوره RSI', en: 'RSI Len', min: 3, max: 50, step: 1 },
      stochLen: { fa: 'دوره Stoch', en: 'Stoch Len', min: 3, max: 50, step: 1 },
    },
    descriptionFa: 'نسخه حساس‌تر RSI برای نقاط چرخش دقیق.',
    descriptionEn: 'Sensitive RSI oscillator for faster reversal timing.',
  },
  {
    id: 'ADX',
    nameFa: 'قدرت روند ADX / +DI / -DI',
    nameEn: 'ADX & DMI (+DI / -DI)',
    shortName: 'ADX',
    category: 'TREND',
    overlay: false,
    pineRef: 'ta.dmi(diLen, adxSmooth)',
    defaultColor: '#f59e0b',
    defaultParams: { diLen: 14, adxSmooth: 14 },
    paramLabels: {
      diLen: { fa: 'دوره DI', en: 'DI Length', min: 3, max: 50, step: 1 },
      adxSmooth: { fa: 'نرم‌سازی ADX', en: 'Smoothing', min: 3, max: 50, step: 1 },
    },
    descriptionFa: 'سنجش قدرت روند (خط زرد بالای ۲۵ = روند قوی) همراه با +DI و -DI.',
    descriptionEn: 'Measures trend strength (ADX > 25 = trending) alongside +DI and -DI.',
  },
  {
    id: 'ATR',
    nameFa: 'نوسان واقعی (ATR)',
    nameEn: 'Average True Range (ATR)',
    shortName: 'ATR',
    category: 'VOLATILITY',
    overlay: false,
    pineRef: 'ta.atr(length)',
    defaultColor: '#f97316',
    defaultParams: { length: 14 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 2, max: 100, step: 1 } },
    descriptionFa: 'نمایش میزان نوسان دلاری بازار برای تنظیم حد ضرر.',
    descriptionEn: 'Market volatility gauge useful for dynamic stop-loss sizing.',
  },
  {
    id: 'CCI',
    nameFa: 'کانال کالا (CCI)',
    nameEn: 'Commodity Channel Index (CCI)',
    shortName: 'CCI',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.cci(hlc3, length)',
    defaultColor: '#22c55e',
    defaultParams: { length: 20 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 5, max: 100, step: 1 } },
    descriptionFa: 'سنجش فاصله قیمت از میانگین آماری با باندهای +100 و -100.',
    descriptionEn: 'Statistical price deviation oscillator with ±100 thresholds.',
  },
  {
    id: 'WILLIAMS_R',
    nameFa: 'ویلیامز درصد (%R)',
    nameEn: 'Williams %R',
    shortName: 'W%R',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.wpr(length)',
    defaultColor: '#ec4899',
    defaultParams: { length: 14 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 3, max: 100, step: 1 } },
    descriptionFa: 'اسیلاتور اشباع خرید/فروش بین 0 تا -100.',
    descriptionEn: 'Momentum oscillator scaled between 0 and -100 (-20/-80 bands).',
  },
  {
    id: 'ROC',
    nameFa: 'نرخ تغییر قیمت (ROC %)',
    nameEn: 'Rate of Change (ROC)',
    shortName: 'ROC',
    category: 'MOMENTUM',
    overlay: false,
    pineRef: 'ta.roc(close, length)',
    defaultColor: '#38bdf8',
    defaultParams: { length: 9 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 1, max: 100, step: 1 } },
    descriptionFa: 'درصد تغییر قیمت نسبت به N کندل قبل.',
    descriptionEn: 'Percentage price velocity relative to N bars ago.',
  },
  {
    id: 'MFI',
    nameFa: 'جریان پول هوشمند (MFI)',
    nameEn: 'Money Flow Index (MFI)',
    shortName: 'MFI',
    category: 'VOLUME',
    overlay: false,
    pineRef: 'ta.mfi(hlc3, length)',
    defaultColor: '#10d9a3',
    defaultParams: { length: 14 },
    paramLabels: { length: { fa: 'دوره', en: 'Length', min: 3, max: 100, step: 1 } },
    descriptionFa: 'RSI وزنی بر اساس حجم معاملات (سطوح ۸۰ و ۲۰).',
    descriptionEn: 'Volume-weighted RSI measuring money inflow/outflow.',
  },
  {
    id: 'OBV',
    nameFa: 'حجم تعادلی (OBV)',
    nameEn: 'On-Balance Volume (OBV)',
    shortName: 'OBV',
    category: 'VOLUME',
    overlay: false,
    pineRef: 'ta.obv',
    defaultColor: '#60a5fa',
    defaultParams: {},
    descriptionFa: 'تجمیع حجم کندل‌های صعودی منهای نزولی برای کشف واگرایی اسمارت‌مانی.',
    descriptionEn: 'Cumulative volume flow for detecting accumulation & distribution.',
  },
];

export function getTvIndicatorDef(id: string): TvIndicatorDef | undefined {
  return TV_INDICATOR_CATALOG.find((x) => x.id === id);
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function toPlotPoints(candles: Candle[], arr: number[], colorArr?: string[]): CustomPlotSeries['points'] {
  const pts: CustomPlotSeries['points'] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = arr[i];
    if (v !== undefined && Number.isFinite(v)) {
      pts.push({
        time: Math.floor(candles[i]!.timestamp / 1000),
        value: v,
        ...(colorArr?.[i] ? { color: colorArr[i] } : {}),
      });
    }
  }
  return pts;
}

function lastFinite(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i]!;
  }
  return NaN;
}

export function computeActiveTvIndicators(candles: Candle[], active: ActiveTvIndicator[]): ComputedTvIndicators {
  const mainPlots: CustomPlotSeries[] = [];
  const mainFills: CustomFillZone[] = [];
  const mainHlines: CustomHLine[] = [];
  const subPanes: TvSubPaneSpec[] = [];
  const legends: TvLegendItem[] = [];

  if (!candles.length) return { mainPlots, mainFills, mainHlines, subPanes, legends };

  const closes = candles.map((c) => c.close);

  for (const ind of active) {
    const def = getTvIndicatorDef(ind.id);
    if (!def) continue;
    const p = { ...def.defaultParams, ...ind.params };
    const col = ind.color || def.defaultColor;

    if (ind.id === 'EMA' || ind.id === 'SMA' || ind.id === 'WMA' || ind.id === 'HMA' || ind.id === 'RMA' || ind.id === 'ALMA') {
      const len = Math.max(2, Math.round(p.length ?? 20));
      const arr =
        ind.id === 'EMA'
          ? ema(closes, len)
          : ind.id === 'SMA'
            ? sma(closes, len)
            : ind.id === 'WMA'
              ? wma(closes, len)
              : ind.id === 'HMA'
                ? hma(closes, len)
                : ind.id === 'RMA'
                  ? rma(closes, len)
                  : alma(closes, len, p.offset ?? 0.85, p.sigma ?? 6);
      const last = lastFinite(arr);
      const title = `${def.shortName} (${len})`;
      legends.push({ uid: ind.uid, id: ind.id, title, visible: ind.visible, overlay: true, values: [{ label: '', value: fmtNum(last), color: col }] });
      if (ind.visible) {
        mainPlots.push({ id: `${ind.uid}_0`, title, color: col, overlay: true, linewidth: 2, style: 'line', points: toPlotPoints(candles, arr) });
      }
      continue;
    }

    if (ind.id === 'EMA_RIBBON') {
      const f = Math.max(2, Math.round(p.fast ?? 9));
      const m = Math.max(f + 1, Math.round(p.mid ?? 21));
      const s = Math.max(m + 1, Math.round(p.slow ?? 55));
      const ef = ema(closes, f);
      const em = ema(closes, m);
      const es = ema(closes, s);
      const title = `EMA (${f}/${m}/${s})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: true,
        values: [
          { label: `${f}`, value: fmtNum(lastFinite(ef)), color: '#38bdf8' },
          { label: `${m}`, value: fmtNum(lastFinite(em)), color: '#f59e0b' },
          { label: `${s}`, value: fmtNum(lastFinite(es)), color: '#a855f7' },
        ],
      });
      if (ind.visible) {
        mainPlots.push(
          { id: `${ind.uid}_f`, title: `EMA ${f}`, color: '#38bdf8', overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ef) },
          { id: `${ind.uid}_m`, title: `EMA ${m}`, color: '#f59e0b', overlay: true, linewidth: 2, style: 'line', points: toPlotPoints(candles, em) },
          { id: `${ind.uid}_s`, title: `EMA ${s}`, color: '#a855f7', overlay: true, linewidth: 2, style: 'line', points: toPlotPoints(candles, es) }
        );
      }
      continue;
    }

    if (ind.id === 'VWAP') {
      const v = vwap(candles);
      const last = lastFinite(v);
      legends.push({ uid: ind.uid, id: ind.id, title: 'VWAP', visible: ind.visible, overlay: true, values: [{ label: '', value: fmtNum(last), color: col }] });
      if (ind.visible) {
        mainPlots.push({ id: `${ind.uid}_v`, title: 'VWAP', color: col, overlay: true, linewidth: 2, style: 'line', points: toPlotPoints(candles, v) });
      }
      continue;
    }

    if (ind.id === 'SUPERTREND') {
      const factor = p.factor ?? 3;
      const atrPeriod = Math.max(3, Math.round(p.atrPeriod ?? 10));
      const st = supertrend(candles, factor, atrPeriod);
      const colArr = st.direction.map((d) => (d === 1 ? '#10d9a3' : '#f43f5e'));
      const last = lastFinite(st.line);
      const lastDir = st.direction[st.direction.length - 1] === 1;
      const title = `SuperTrend (${factor}, ${atrPeriod})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: true,
        values: [{ label: lastDir ? 'UP' : 'DN', value: fmtNum(last), color: lastDir ? '#10d9a3' : '#f43f5e' }],
      });
      if (ind.visible) {
        mainPlots.push({
          id: `${ind.uid}_st`,
          title,
          color: lastDir ? '#10d9a3' : '#f43f5e',
          overlay: true,
          linewidth: 2,
          style: 'line',
          points: toPlotPoints(candles, st.line, colArr),
        });
      }
      continue;
    }

    if (ind.id === 'ICHIMOKU') {
      const tLen = Math.max(2, Math.round(p.tenkan ?? 9));
      const kLen = Math.max(5, Math.round(p.kijun ?? 26));
      const bLen = Math.max(10, Math.round(p.senkouB ?? 52));
      const ich = ichimoku(candles, tLen, kLen, bLen);
      const title = `Ichimoku (${tLen},${kLen},${bLen})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: true,
        values: [
          { label: 'T', value: fmtNum(lastFinite(ich.tenkan)), color: '#38bdf8' },
          { label: 'K', value: fmtNum(lastFinite(ich.kijun)), color: '#f97316' },
        ],
      });
      if (ind.visible) {
        mainPlots.push(
          { id: `${ind.uid}_t`, title: 'Tenkan', color: '#38bdf8', overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ich.tenkan) },
          { id: `${ind.uid}_k`, title: 'Kijun', color: '#f97316', overlay: true, linewidth: 2, style: 'line', points: toPlotPoints(candles, ich.kijun) },
          { id: `${ind.uid}_a`, title: 'Span A', color: 'rgba(16,217,163,0.7)', overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ich.spanA) },
          { id: `${ind.uid}_b`, title: 'Span B', color: 'rgba(244,63,94,0.7)', overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ich.spanB) }
        );
        const bullPts: CustomFillZone['points'] = [];
        const bearPts: CustomFillZone['points'] = [];
        for (let i = 0; i < candles.length; i++) {
          const sa = ich.spanA[i];
          const sb = ich.spanB[i];
          if (sa !== undefined && sb !== undefined && Number.isFinite(sa) && Number.isFinite(sb)) {
            const pt = { time: Math.floor(candles[i]!.timestamp / 1000), top: Math.max(sa, sb), bottom: Math.min(sa, sb) };
            if (sa >= sb) bullPts.push(pt);
            else bearPts.push(pt);
          }
        }
        if (bullPts.length >= 2) mainFills.push({ id: `${ind.uid}_kbull`, color: 'rgba(16, 217, 163, 0.14)', overlay: true, points: bullPts });
        if (bearPts.length >= 2) mainFills.push({ id: `${ind.uid}_kbear`, color: 'rgba(244, 63, 94, 0.14)', overlay: true, points: bearPts });
      }
      continue;
    }

    if (ind.id === 'PSAR') {
      const ps = parabolicSar(candles, p.step ?? 0.02, p.maxStep ?? 0.2);
      const colArr = ps.map((v, i) => (Number.isFinite(v) && candles[i]!.close >= v ? '#10d9a3' : '#f43f5e'));
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title: `PSAR (${p.step ?? 0.02})`,
        visible: ind.visible,
        overlay: true,
        values: [{ label: '', value: fmtNum(lastFinite(ps)), color: col }],
      });
      if (ind.visible) {
        mainPlots.push({ id: `${ind.uid}_ps`, title: 'PSAR', color: col, overlay: true, linewidth: 2, style: 'circles', points: toPlotPoints(candles, ps, colArr) });
      }
      continue;
    }

    if (ind.id === 'PIVOTS') {
      const lb = Math.min(candles.length, Math.max(6, Math.round(p.lookback ?? 24)));
      const slice = candles.slice(-lb);
      let hh = -Infinity;
      let ll = Infinity;
      for (const c of slice) {
        hh = Math.max(hh, c.high);
        ll = Math.min(ll, c.low);
      }
      const pv = pivotPoints(hh, ll, slice[slice.length - 1]!.close);
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title: `Pivots (${lb})`,
        visible: ind.visible,
        overlay: true,
        values: [
          { label: 'PP', value: fmtNum(pv.pp), color: '#38bdf8' },
          { label: 'R1', value: fmtNum(pv.r1), color: '#f43f5e' },
          { label: 'S1', value: fmtNum(pv.s1), color: '#10d9a3' },
        ],
      });
      if (ind.visible) {
        mainHlines.push(
          { id: `${ind.uid}_pp`, title: 'PP', price: pv.pp, color: '#38bdf8', linestyle: 'dashed', linewidth: 1, overlay: true },
          { id: `${ind.uid}_r1`, title: 'R1', price: pv.r1, color: '#f43f5e', linestyle: 'dotted', linewidth: 1, overlay: true },
          { id: `${ind.uid}_r2`, title: 'R2', price: pv.r2, color: '#fb7185', linestyle: 'dotted', linewidth: 1, overlay: true },
          { id: `${ind.uid}_s1`, title: 'S1', price: pv.s1, color: '#10d9a3', linestyle: 'dotted', linewidth: 1, overlay: true },
          { id: `${ind.uid}_s2`, title: 'S2', price: pv.s2, color: '#34d399', linestyle: 'dotted', linewidth: 1, overlay: true }
        );
      }
      continue;
    }

    if (ind.id === 'BB' || ind.id === 'KELTNER' || ind.id === 'DONCHIAN') {
      const len = Math.max(5, Math.round(p.length ?? 20));
      const ch =
        ind.id === 'BB'
          ? bollingerBands(closes, len, p.mult ?? 2)
          : ind.id === 'KELTNER'
            ? keltnerChannels(candles, len, p.mult ?? 1.5, Math.max(3, Math.round(p.atrPeriod ?? 10)))
            : donchianChannels(candles, len);
      const title = ind.id === 'BB' ? `BB (${len}, ${p.mult ?? 2})` : ind.id === 'KELTNER' ? `KC (${len}, ${p.mult ?? 1.5})` : `DC (${len})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: true,
        values: [
          { label: 'U', value: fmtNum(lastFinite(ch.upper)), color: col },
          { label: 'M', value: fmtNum(lastFinite(ch.mid)), color: '#f59e0b' },
          { label: 'L', value: fmtNum(lastFinite(ch.lower)), color: col },
        ],
      });
      if (ind.visible) {
        mainPlots.push(
          { id: `${ind.uid}_u`, title: `${def.shortName} Upper`, color: col, overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ch.upper) },
          { id: `${ind.uid}_m`, title: `${def.shortName} Basis`, color: '#f59e0b', overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ch.mid) },
          { id: `${ind.uid}_l`, title: `${def.shortName} Lower`, color: col, overlay: true, linewidth: 1, style: 'line', points: toPlotPoints(candles, ch.lower) }
        );
        const fPts: CustomFillZone['points'] = [];
        for (let i = 0; i < candles.length; i++) {
          if (Number.isFinite(ch.upper[i]) && Number.isFinite(ch.lower[i])) {
            fPts.push({ time: Math.floor(candles[i]!.timestamp / 1000), top: ch.upper[i]!, bottom: ch.lower[i]! });
          }
        }
        if (fPts.length >= 2) {
          mainFills.push({ id: `${ind.uid}_fl`, color: ind.id === 'BB' ? 'rgba(59,130,246,0.10)' : 'rgba(6,182,212,0.10)', overlay: true, points: fPts });
        }
      }
      continue;
    }

    // Sub-pane Oscillators & Volume Indicators
    if (ind.id === 'RSI') {
      const len = Math.max(2, Math.round(p.length ?? 14));
      const ob = p.overbought ?? 70;
      const os = p.oversold ?? 30;
      const r = rsi(closes, len);
      const last = lastFinite(r);
      const title = `RSI (${len})`;
      legends.push({ uid: ind.uid, id: ind.id, title, visible: ind.visible, overlay: false, values: [{ label: '', value: fmtNum(last), color: col }] });
      if (ind.visible) {
        subPanes.push({
          uid: ind.uid,
          id: ind.id,
          title,
          plots: [{ id: `${ind.uid}_r`, title, color: col, overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, r) }],
          hlines: [
            { id: `${ind.uid}_ob`, title: `${ob}`, price: ob, color: 'rgba(244,63,94,0.65)', linestyle: 'dashed', linewidth: 1, overlay: false },
            { id: `${ind.uid}_mid`, title: '50', price: 50, color: 'rgba(148,163,184,0.35)', linestyle: 'dotted', linewidth: 1, overlay: false },
            { id: `${ind.uid}_os`, title: `${os}`, price: os, color: 'rgba(16,217,163,0.65)', linestyle: 'dashed', linewidth: 1, overlay: false },
          ],
          fills: [],
          lastSummary: fmtNum(last),
        });
      }
      continue;
    }

    if (ind.id === 'MACD') {
      const f = Math.max(2, Math.round(p.fast ?? 12));
      const s = Math.max(f + 1, Math.round(p.slow ?? 26));
      const sig = Math.max(2, Math.round(p.signal ?? 9));
      const m = macd(closes, f, s, sig);
      const histColors = m.histogram.map((v, i) => {
        if (!Number.isFinite(v)) return '#10d9a3';
        const prev = m.histogram[i - 1] ?? 0;
        return v >= 0 ? (v >= prev ? '#10d9a3' : 'rgba(16,217,163,0.45)') : v <= prev ? '#f43f5e' : 'rgba(244,63,94,0.45)';
      });
      const title = `MACD (${f},${s},${sig})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: false,
        values: [
          { label: 'M', value: fmtNum(lastFinite(m.line)), color: '#38bdf8' },
          { label: 'S', value: fmtNum(lastFinite(m.signal)), color: '#f97316' },
          { label: 'H', value: fmtNum(lastFinite(m.histogram)), color: lastFinite(m.histogram) >= 0 ? '#10d9a3' : '#f43f5e' },
        ],
      });
      if (ind.visible) {
        subPanes.push({
          uid: ind.uid,
          id: ind.id,
          title,
          plots: [
            { id: `${ind.uid}_h`, title: 'Hist', color: '#10d9a3', overlay: false, linewidth: 2, style: 'histogram', points: toPlotPoints(candles, m.histogram, histColors) },
            { id: `${ind.uid}_l`, title: 'MACD', color: '#38bdf8', overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, m.line) },
            { id: `${ind.uid}_s`, title: 'Signal', color: '#f97316', overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, m.signal) },
          ],
          hlines: [{ id: `${ind.uid}_z`, title: '0', price: 0, color: 'rgba(148,163,184,0.45)', linestyle: 'dashed', linewidth: 1, overlay: false }],
          fills: [],
          lastSummary: fmtNum(lastFinite(m.histogram)),
        });
      }
      continue;
    }

    if (ind.id === 'STOCH' || ind.id === 'STOCH_RSI') {
      const st =
        ind.id === 'STOCH'
          ? stochastic(candles, Math.round(p.kLen ?? 14), Math.round(p.smoothK ?? 3), Math.round(p.dLen ?? 3))
          : stochRsi(closes, Math.round(p.rsiLen ?? 14), Math.round(p.stochLen ?? 14), Math.round(p.smoothK ?? 3), Math.round(p.smoothD ?? 3));
      const title = ind.id === 'STOCH' ? `Stoch (${p.kLen ?? 14},${p.smoothK ?? 3})` : `StochRSI (${p.rsiLen ?? 14})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: false,
        values: [
          { label: '%K', value: fmtNum(lastFinite(st.k)), color: '#38bdf8' },
          { label: '%D', value: fmtNum(lastFinite(st.d)), color: '#f97316' },
        ],
      });
      if (ind.visible) {
        subPanes.push({
          uid: ind.uid,
          id: ind.id,
          title,
          plots: [
            { id: `${ind.uid}_k`, title: '%K', color: '#38bdf8', overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, st.k) },
            { id: `${ind.uid}_d`, title: '%D', color: '#f97316', overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, st.d) },
          ],
          hlines: [
            { id: `${ind.uid}_80`, title: '80', price: 80, color: 'rgba(244,63,94,0.6)', linestyle: 'dashed', linewidth: 1, overlay: false },
            { id: `${ind.uid}_20`, title: '20', price: 20, color: 'rgba(16,217,163,0.6)', linestyle: 'dashed', linewidth: 1, overlay: false },
          ],
          fills: [],
          lastSummary: `${fmtNum(lastFinite(st.k))} / ${fmtNum(lastFinite(st.d))}`,
        });
      }
      continue;
    }

    if (ind.id === 'ADX') {
      const d = adx(candles, Math.round(p.diLen ?? 14), Math.round(p.adxSmooth ?? 14));
      const title = `ADX / DMI (${p.diLen ?? 14})`;
      legends.push({
        uid: ind.uid,
        id: ind.id,
        title,
        visible: ind.visible,
        overlay: false,
        values: [
          { label: 'ADX', value: fmtNum(lastFinite(d.adx)), color: '#f59e0b' },
          { label: '+DI', value: fmtNum(lastFinite(d.plusDI)), color: '#10d9a3' },
          { label: '-DI', value: fmtNum(lastFinite(d.minusDI)), color: '#f43f5e' },
        ],
      });
      if (ind.visible) {
        subPanes.push({
          uid: ind.uid,
          id: ind.id,
          title,
          plots: [
            { id: `${ind.uid}_adx`, title: 'ADX', color: '#f59e0b', overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, d.adx) },
            { id: `${ind.uid}_pdi`, title: '+DI', color: '#10d9a3', overlay: false, linewidth: 1, style: 'line', points: toPlotPoints(candles, d.plusDI) },
            { id: `${ind.uid}_mdi`, title: '-DI', color: '#f43f5e', overlay: false, linewidth: 1, style: 'line', points: toPlotPoints(candles, d.minusDI) },
          ],
          hlines: [{ id: `${ind.uid}_25`, title: '25', price: 25, color: 'rgba(245,158,11,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false }],
          fills: [],
          lastSummary: fmtNum(lastFinite(d.adx)),
        });
      }
      continue;
    }

    if (ind.id === 'ATR' || ind.id === 'CCI' || ind.id === 'WILLIAMS_R' || ind.id === 'ROC' || ind.id === 'MFI' || ind.id === 'OBV') {
      const len = Math.max(1, Math.round(p.length ?? 14));
      const arr =
        ind.id === 'ATR'
          ? atr(candles, len)
          : ind.id === 'CCI'
            ? cci(candles, len)
            : ind.id === 'WILLIAMS_R'
              ? williamsR(candles, len)
              : ind.id === 'ROC'
                ? roc(closes, len)
                : ind.id === 'MFI'
                  ? mfi(candles, len)
                  : obv(candles);
      const last = lastFinite(arr);
      const title = ind.id === 'OBV' ? 'OBV' : `${def.shortName} (${len})`;
      const hlines: CustomHLine[] =
        ind.id === 'CCI'
          ? [
              { id: `${ind.uid}_p100`, title: '+100', price: 100, color: 'rgba(244,63,94,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
              { id: `${ind.uid}_m100`, title: '-100', price: -100, color: 'rgba(16,217,163,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
            ]
          : ind.id === 'WILLIAMS_R'
            ? [
                { id: `${ind.uid}_20`, title: '-20', price: -20, color: 'rgba(244,63,94,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
                { id: `${ind.uid}_80`, title: '-80', price: -80, color: 'rgba(16,217,163,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
              ]
            : ind.id === 'MFI'
              ? [
                  { id: `${ind.uid}_80`, title: '80', price: 80, color: 'rgba(244,63,94,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
                  { id: `${ind.uid}_20`, title: '20', price: 20, color: 'rgba(16,217,163,0.55)', linestyle: 'dashed', linewidth: 1, overlay: false },
                ]
              : ind.id === 'ROC'
                ? [{ id: `${ind.uid}_0`, title: '0', price: 0, color: 'rgba(148,163,184,0.45)', linestyle: 'dashed', linewidth: 1, overlay: false }]
                : [];
      legends.push({ uid: ind.uid, id: ind.id, title, visible: ind.visible, overlay: false, values: [{ label: '', value: fmtNum(last), color: col }] });
      if (ind.visible) {
        subPanes.push({
          uid: ind.uid,
          id: ind.id,
          title,
          plots: [{ id: `${ind.uid}_0`, title, color: col, overlay: false, linewidth: 2, style: 'line', points: toPlotPoints(candles, arr) }],
          hlines,
          fills: [],
          lastSummary: fmtNum(last),
        });
      }
    }
  }

  return { mainPlots, mainFills, mainHlines, subPanes, legends };
}

export function toHeikinAshiCandles(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevHaOpen = candles[0]?.open ?? 0;
  let prevHaClose = candles[0]?.close ?? 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({
      ...c,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return out;
}

const ACTIVE_INDICATORS_KEY = 'dollarino_tv_indicators_v2';
const CHART_TYPE_KEY = 'dollarino_tv_chart_type_v1';

export function loadSavedIndicators(): ActiveTvIndicator[] {
  try {
    const raw = localStorage.getItem(ACTIVE_INDICATORS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveTvIndicator[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  // Start with a clean TradingView Superchart canvas (no default clutter indicators)
  return [];
}

export function saveActiveIndicators(list: ActiveTvIndicator[]): void {
  try {
    localStorage.setItem(ACTIVE_INDICATORS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function loadSavedChartType(): ChartSeriesType {
  try {
    const raw = localStorage.getItem(CHART_TYPE_KEY) as ChartSeriesType | null;
    if (raw === 'candles' || raw === 'hollow' || raw === 'heikin_ashi' || raw === 'line' || raw === 'area' || raw === 'baseline') {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'candles';
}

export function saveChartType(t: ChartSeriesType): void {
  try {
    localStorage.setItem(CHART_TYPE_KEY, t);
  } catch {
    /* ignore */
  }
}

export function loadDrawingsForSymbol(symbol: string): ChartDrawing[] {
  try {
    const raw = localStorage.getItem(`dollarino_tv_drawings_v1:${symbol.toUpperCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw) as ChartDrawing[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveDrawingsForSymbol(symbol: string, drawings: ChartDrawing[]): void {
  try {
    localStorage.setItem(`dollarino_tv_drawings_v1:${symbol.toUpperCase()}`, JSON.stringify(drawings));
  } catch {
    /* ignore */
  }
}
