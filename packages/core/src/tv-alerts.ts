import {
  adx,
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
  rsi,
  stochRsi,
  supertrend,
  vwap,
} from './indicators.js';
import type { Candle, Direction, DollarinoSignal, Timeframe } from './types.js';

export type TradingViewAlertRuleId =
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'EMA_CROSS_UP'
  | 'EMA_CROSS_DOWN'
  | 'MACD_CROSS_UP'
  | 'MACD_CROSS_DOWN'
  | 'SUPERTREND_FLIP_BULL'
  | 'SUPERTREND_FLIP_BEAR'
  | 'BB_BREAK_UP'
  | 'BB_BREAK_DOWN'
  | 'STOCH_RSI_BULL'
  | 'ICHIMOKU_TK_BULL'
  | 'VWAP_RECLAIM'
  | 'ADX_TREND_LONG'
  | 'KELTNER_BREAK_UP'
  | 'DONCHIAN_BREAK_UP'
  | 'CCI_REVERSAL_BULL'
  | 'MFI_OVERSOLD'
  | 'HMA_CROSS_UP';

export interface TradingViewAlertEvaluation {
  triggered: boolean;
  direction: Direction;
  reasonFa: string;
  reasonEn: string;
  indicatorValue?: number;
  signal: DollarinoSignal | null;
}

export const FREE_TV_ALERT_TEMPLATES: Array<{
  id: TradingViewAlertRuleId;
  nameFa: string;
  nameEn: string;
  direction: Direction;
  defaultParams: Record<string, number>;
}> = [
  { id: 'RSI_OVERSOLD', nameFa: 'آلرت اشباع فروش RSI (< ۳۰)', nameEn: 'RSI Oversold Cross (< 30)', direction: 'LONG', defaultParams: { period: 14, level: 30 } },
  { id: 'RSI_OVERBOUGHT', nameFa: 'آلرت اشباع خرید RSI (> ۷۰)', nameEn: 'RSI Overbought Cross (> 70)', direction: 'SHORT', defaultParams: { period: 14, level: 70 } },
  { id: 'EMA_CROSS_UP', nameFa: 'تقاطع صعودی EMA (۹ × ۲۱)', nameEn: 'EMA Golden Cross (9 / 21)', direction: 'LONG', defaultParams: { fast: 9, slow: 21 } },
  { id: 'EMA_CROSS_DOWN', nameFa: 'تقاطع نزولی EMA (۹ × ۲۱)', nameEn: 'EMA Death Cross (9 / 21)', direction: 'SHORT', defaultParams: { fast: 9, slow: 21 } },
  { id: 'MACD_CROSS_UP', nameFa: 'تقاطع صعودی مکدی (MACD)', nameEn: 'MACD Bullish Cross', direction: 'LONG', defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { id: 'MACD_CROSS_DOWN', nameFa: 'تقاطع نزولی مکدی (MACD)', nameEn: 'MACD Bearish Cross', direction: 'SHORT', defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { id: 'SUPERTREND_FLIP_BULL', nameFa: 'تغییر روند صعودی SuperTrend', nameEn: 'SuperTrend Flip Bullish', direction: 'LONG', defaultParams: { factor: 3, atrPeriod: 10 } },
  { id: 'SUPERTREND_FLIP_BEAR', nameFa: 'تغییر روند نزولی SuperTrend', nameEn: 'SuperTrend Flip Bearish', direction: 'SHORT', defaultParams: { factor: 3, atrPeriod: 10 } },
  { id: 'BB_BREAK_UP', nameFa: 'شکست سقف باند بولینگر', nameEn: 'Bollinger Upper Breakout', direction: 'LONG', defaultParams: { period: 20, mult: 2 } },
  { id: 'BB_BREAK_DOWN', nameFa: 'شکست کف باند بولینگر', nameEn: 'Bollinger Lower Breakdown', direction: 'SHORT', defaultParams: { period: 20, mult: 2 } },
  { id: 'STOCH_RSI_BULL', nameFa: 'تقاطع صعودی StochRSI زیر ۲۰', nameEn: 'StochRSI Bullish Cross (< 20)', direction: 'LONG', defaultParams: { rsiLen: 14, stochLen: 14 } },
  { id: 'ICHIMOKU_TK_BULL', nameFa: 'تقاطع تنکانسن بالای کیجونسن (ایچیموکو)', nameEn: 'Ichimoku Tenkan/Kijun Bull Cross', direction: 'LONG', defaultParams: { tenkan: 9, kijun: 26 } },
  { id: 'VWAP_RECLAIM', nameFa: 'بازگشت قیمت بالای VWAP', nameEn: 'Session VWAP Reclaim', direction: 'LONG', defaultParams: {} },
  { id: 'ADX_TREND_LONG', nameFa: 'قدرت روند صعودی ADX > ۲۵', nameEn: 'ADX Strong Trend Long (+DI > -DI)', direction: 'LONG', defaultParams: { diLen: 14, threshold: 25 } },
  { id: 'KELTNER_BREAK_UP', nameFa: 'شکست کانال کلتنر به بالا', nameEn: 'Keltner Upper Breakout', direction: 'LONG', defaultParams: { period: 20, mult: 1.5 } },
  { id: 'DONCHIAN_BREAK_UP', nameFa: 'شکست سقف ۲۰ کندل Donchian', nameEn: 'Donchian 20-Bar High Breakout', direction: 'LONG', defaultParams: { period: 20 } },
  { id: 'CCI_REVERSAL_BULL', nameFa: 'برگشت صعودی CCI از ۱۰۰-', nameEn: 'CCI Bullish Reversal (-100)', direction: 'LONG', defaultParams: { period: 20 } },
  { id: 'MFI_OVERSOLD', nameFa: 'ورود پول هوشمند MFI < ۲۰', nameEn: 'Money Flow Oversold (< 20)', direction: 'LONG', defaultParams: { period: 14 } },
  { id: 'HMA_CROSS_UP', nameFa: 'عبور قیمت بالای میانگین هال (HMA)', nameEn: 'Price Cross Above HMA', direction: 'LONG', defaultParams: { period: 21 } },
];

export function evaluateIndicatorAlertRule(input: {
  ruleId: TradingViewAlertRuleId | string;
  candles: Candle[];
  symbol: string;
  timeframe: Timeframe | string;
  params?: Record<string, number>;
  leverage?: number;
  directionOverride?: 'AUTO' | 'LONG' | 'SHORT';
}): TradingViewAlertEvaluation {
  const { candles, symbol, timeframe, params = {}, leverage = 10 } = input;
  if (candles.length < 35) {
    return {
      triggered: false,
      direction: 'LONG',
      reasonFa: 'تعداد کندل‌ها برای ارزیابی اندیکاتور کافی نیست',
      reasonEn: 'Not enough candles to evaluate indicator rule',
      signal: null,
    };
  }

  const closes = candles.map((c) => c.close);
  const idx = candles.length - 1;
  const prev = idx - 1;
  const curClose = closes[idx]!;
  const prevClose = closes[prev]!;
  const atrArr = atr(candles, 14);
  const curAtr = Number.isFinite(atrArr[idx]) ? atrArr[idx]! : curClose * 0.012;

  let triggered = false;
  let direction: Direction = 'LONG';
  let reasonFa = '';
  let reasonEn = '';
  let indicatorValue: number | undefined;

  switch (input.ruleId) {
    case 'RSI_OVERSOLD': {
      const p = Number(params.period || 14);
      const lvl = Number(params.level || 30);
      const r = rsi(closes, p);
      indicatorValue = r[idx];
      if (Number.isFinite(r[idx]) && Number.isFinite(r[prev]) && r[prev]! <= lvl && r[idx]! > lvl) {
        triggered = true;
        direction = 'LONG';
        reasonFa = `RSI(${p}) از کف ${lvl} به بالا عبور کرد (${r[idx]!.toFixed(1)})`;
        reasonEn = `RSI(${p}) crossed up above ${lvl} (${r[idx]!.toFixed(1)})`;
      }
      break;
    }
    case 'RSI_OVERBOUGHT': {
      const p = Number(params.period || 14);
      const lvl = Number(params.level || 70);
      const r = rsi(closes, p);
      indicatorValue = r[idx];
      if (Number.isFinite(r[idx]) && Number.isFinite(r[prev]) && r[prev]! >= lvl && r[idx]! < lvl) {
        triggered = true;
        direction = 'SHORT';
        reasonFa = `RSI(${p}) از سقف ${lvl} به پایین برگشت (${r[idx]!.toFixed(1)})`;
        reasonEn = `RSI(${p}) crossed down below ${lvl} (${r[idx]!.toFixed(1)})`;
      }
      break;
    }
    case 'EMA_CROSS_UP':
    case 'EMA_CROSS_DOWN': {
      const f = Number(params.fast || 9);
      const s = Number(params.slow || 21);
      const ef = ema(closes, f);
      const es = ema(closes, s);
      indicatorValue = ef[idx];
      if (input.ruleId === 'EMA_CROSS_UP' && Number.isFinite(ef[prev]) && Number.isFinite(es[prev]) && ef[prev]! <= es[prev]! && ef[idx]! > es[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = `تقاطع طلایی EMA(${f}) بالای EMA(${s})`;
        reasonEn = `EMA(${f}) crossed above EMA(${s})`;
      } else if (input.ruleId === 'EMA_CROSS_DOWN' && Number.isFinite(ef[prev]) && Number.isFinite(es[prev]) && ef[prev]! >= es[prev]! && ef[idx]! < es[idx]!) {
        triggered = true;
        direction = 'SHORT';
        reasonFa = `تقاطع نزولی EMA(${f}) زیر EMA(${s})`;
        reasonEn = `EMA(${f}) crossed below EMA(${s})`;
      }
      break;
    }
    case 'MACD_CROSS_UP':
    case 'MACD_CROSS_DOWN': {
      const m = macd(closes, Number(params.fast || 12), Number(params.slow || 26), Number(params.signal || 9));
      indicatorValue = m.histogram[idx];
      if (input.ruleId === 'MACD_CROSS_UP' && Number.isFinite(m.line[prev]) && Number.isFinite(m.signal[prev]) && m.line[prev]! <= m.signal[prev]! && m.line[idx]! > m.signal[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'تقاطع صعودی خط MACD بالای Signal';
        reasonEn = 'MACD line crossed above signal line';
      } else if (input.ruleId === 'MACD_CROSS_DOWN' && Number.isFinite(m.line[prev]) && Number.isFinite(m.signal[prev]) && m.line[prev]! >= m.signal[prev]! && m.line[idx]! < m.signal[idx]!) {
        triggered = true;
        direction = 'SHORT';
        reasonFa = 'تقاطع نزولی خط MACD زیر Signal';
        reasonEn = 'MACD line crossed below signal line';
      }
      break;
    }
    case 'SUPERTREND_FLIP_BULL':
    case 'SUPERTREND_FLIP_BEAR': {
      const st = supertrend(candles, Number(params.factor || 3), Number(params.atrPeriod || 10));
      indicatorValue = st.line[idx];
      if (input.ruleId === 'SUPERTREND_FLIP_BULL' && st.direction[prev] === -1 && st.direction[idx] === 1) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'تغییر روند SuperTrend به صعودی';
        reasonEn = 'SuperTrend flipped bullish';
      } else if (input.ruleId === 'SUPERTREND_FLIP_BEAR' && st.direction[prev] === 1 && st.direction[idx] === -1) {
        triggered = true;
        direction = 'SHORT';
        reasonFa = 'تغییر روند SuperTrend به نزولی';
        reasonEn = 'SuperTrend flipped bearish';
      }
      break;
    }
    case 'BB_BREAK_UP':
    case 'BB_BREAK_DOWN': {
      const bb = bollingerBands(closes, Number(params.period || 20), Number(params.mult || 2));
      indicatorValue = bb.mid[idx];
      if (input.ruleId === 'BB_BREAK_UP' && Number.isFinite(bb.upper[idx]) && prevClose <= bb.upper[prev]! && curClose > bb.upper[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'شکست سقف باند بولینگر به بالا';
        reasonEn = 'Price closed above Upper Bollinger Band';
      } else if (input.ruleId === 'BB_BREAK_DOWN' && Number.isFinite(bb.lower[idx]) && prevClose >= bb.lower[prev]! && curClose < bb.lower[idx]!) {
        triggered = true;
        direction = 'SHORT';
        reasonFa = 'شکست کف باند بولینگر به پایین';
        reasonEn = 'Price closed below Lower Bollinger Band';
      }
      break;
    }
    case 'STOCH_RSI_BULL': {
      const sr = stochRsi(closes, Number(params.rsiLen || 14), Number(params.stochLen || 14));
      indicatorValue = sr.k[idx];
      if (Number.isFinite(sr.k[prev]) && Number.isFinite(sr.d[prev]) && sr.k[idx]! < 25 && sr.k[prev]! <= sr.d[prev]! && sr.k[idx]! > sr.d[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'تقاطع صعودی StochRSI در ناحیه اشباع فروش';
        reasonEn = 'StochRSI bullish cross in oversold zone';
      }
      break;
    }
    case 'ICHIMOKU_TK_BULL': {
      const ich = ichimoku(candles, Number(params.tenkan || 9), Number(params.kijun || 26));
      indicatorValue = ich.tenkan[idx];
      if (Number.isFinite(ich.tenkan[prev]) && Number.isFinite(ich.kijun[prev]) && ich.tenkan[prev]! <= ich.kijun[prev]! && ich.tenkan[idx]! > ich.kijun[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'تقاطع تنکانسن بالای کیجونسن (ایچیموکو)';
        reasonEn = 'Ichimoku Tenkan crossed above Kijun';
      }
      break;
    }
    case 'VWAP_RECLAIM': {
      const vw = vwap(candles);
      indicatorValue = vw[idx];
      if (Number.isFinite(vw[prev]) && prevClose <= vw[prev]! && curClose > vw[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'بازپس‌گیری خط VWAP سشن به بالا';
        reasonEn = 'Price reclaimed Session VWAP';
      }
      break;
    }
    case 'ADX_TREND_LONG': {
      const th = Number(params.threshold || 25);
      const d = adx(candles, Number(params.diLen || 14));
      indicatorValue = d.adx[idx];
      if (Number.isFinite(d.adx[idx]) && d.adx[idx]! >= th && d.plusDI[idx]! > d.minusDI[idx]! && d.plusDI[prev]! <= d.minusDI[prev]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = `قدرت روند صعودی ADX=${d.adx[idx]!.toFixed(1)} (+DI > -DI)`;
        reasonEn = `ADX strong trend (${d.adx[idx]!.toFixed(1)}) with +DI cross`;
      }
      break;
    }
    case 'KELTNER_BREAK_UP': {
      const kc = keltnerChannels(candles, Number(params.period || 20), Number(params.mult || 1.5));
      indicatorValue = kc.upper[idx];
      if (Number.isFinite(kc.upper[prev]) && prevClose <= kc.upper[prev]! && curClose > kc.upper[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'شکست صعودی کانال کلتنر';
        reasonEn = 'Keltner upper channel breakout';
      }
      break;
    }
    case 'DONCHIAN_BREAK_UP': {
      const dc = donchianChannels(candles, Number(params.period || 20));
      indicatorValue = dc.upper[prev];
      if (Number.isFinite(dc.upper[prev]) && curClose > dc.upper[prev]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'شکست سقف کانال دونچین';
        reasonEn = 'Donchian high channel breakout';
      }
      break;
    }
    case 'CCI_REVERSAL_BULL': {
      const c = cci(candles, Number(params.period || 20));
      indicatorValue = c[idx];
      if (Number.isFinite(c[prev]) && c[prev]! <= -100 && c[idx]! > -100) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'برگشت صعودی CCI از ۱۰۰-';
        reasonEn = 'CCI crossed back above -100';
      }
      break;
    }
    case 'MFI_OVERSOLD': {
      const m = mfi(candles, Number(params.period || 14));
      indicatorValue = m[idx];
      if (Number.isFinite(m[prev]) && m[prev]! <= 20 && m[idx]! > 20) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'ورود پول هوشمند MFI از ناحیه ۲۰';
        reasonEn = 'MFI crossed up above 20';
      }
      break;
    }
    case 'HMA_CROSS_UP': {
      const h = hma(closes, Number(params.period || 21));
      indicatorValue = h[idx];
      if (Number.isFinite(h[prev]) && prevClose <= h[prev]! && curClose > h[idx]!) {
        triggered = true;
        direction = 'LONG';
        reasonFa = 'عبور صعودی قیمت بالای میانگین هال (HMA)';
        reasonEn = 'Price crossed above Hull Moving Average';
      }
      break;
    }
  }

  if (input.directionOverride === 'LONG' || input.directionOverride === 'SHORT') {
    direction = input.directionOverride;
  }

  if (!triggered) {
    return { triggered: false, direction, reasonFa, reasonEn, indicatorValue, signal: null };
  }

  const slDist = Math.max(curAtr * 1.5, curClose * 0.006);
  const tpDist1 = slDist * 1.5;
  const tpDist2 = slDist * 2.8;
  const tpDist3 = slDist * 4.5;

  const stopLoss = direction === 'LONG' ? curClose - slDist : curClose + slDist;
  const tp1 = direction === 'LONG' ? curClose + tpDist1 : curClose - tpDist1;
  const tp2 = direction === 'LONG' ? curClose + tpDist2 : curClose - tpDist2;
  const tp3 = direction === 'LONG' ? curClose + tpDist3 : curClose - tpDist3;

  return {
    triggered: true,
    direction,
    reasonFa,
    reasonEn,
    indicatorValue,
    signal: {
      symbol,
      direction,
      timeframe: String(timeframe),
      price: curClose.toFixed(curClose > 100 ? 2 : 4),
      stopLoss: stopLoss.toFixed(curClose > 100 ? 2 : 4),
      leverage,
      tp1: tp1.toFixed(curClose > 100 ? 2 : 4),
      tp2: tp2.toFixed(curClose > 100 ? 2 : 4),
      tp3: tp3.toFixed(curClose > 100 ? 2 : 4),
      channelHandle: '@Dollarino_official',
      engineLabel: `TradingView Alert (${input.ruleId})`,
    },
  };
}
