import type { Direction, DollarinoSignal } from './types.js';

function cleanNumeric(raw: string): string {
  return raw.replace(/[,$\s%]/g, '').trim();
}

function calcLeveragedPct(entry: number, target: number, leverage: number): string {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(target)) return '0.00';
  const pct = ((target - entry) / entry) * 100 * leverage;
  return pct.toFixed(2);
}

/**
 * Parses both classic & extended Dollarino Telegram/TradingView signal text OR JSON webhook payloads.
 */
export function parseDollarinoSignal(input: string | Record<string, unknown>): DollarinoSignal | null {
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    const rawSide = String(obj.direction ?? obj.side ?? obj.action ?? '').toUpperCase();
    const direction: Direction | null =
      rawSide.includes('BUY') || rawSide.includes('LONG') ? 'LONG'
        : rawSide.includes('SELL') || rawSide.includes('SHORT') ? 'SHORT'
        : null;
    const symbol = String(obj.symbol ?? obj.ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const price = cleanNumeric(String(obj.price ?? obj.entry ?? obj.close ?? ''));
    const stopLoss = cleanNumeric(String(obj.stopLoss ?? obj.stop ?? obj.sl ?? ''));
    const tp1 = cleanNumeric(String(obj.tp1 ?? obj.TP1 ?? obj.takeProfit1 ?? ''));
    if (!direction || !symbol || !price || !stopLoss || !tp1) return null;

    const leverage = Math.max(1, Math.round(Number(obj.leverage ?? 1)));
    const tp2 = obj.tp2 || obj.TP2 ? cleanNumeric(String(obj.tp2 ?? obj.TP2)) : undefined;
    const tp3 = obj.tp3 || obj.TP3 ? cleanNumeric(String(obj.tp3 ?? obj.TP3)) : undefined;
    const timeframe = String(obj.timeframe ?? obj.interval ?? obj.tf ?? '15m').trim();
    const channelHandle = String(obj.channelHandle ?? '@Dollarinoofficial').trim();

    return enrichSignalPercentages({
      symbol,
      direction,
      timeframe,
      price,
      stopLoss,
      leverage,
      tp1,
      tp2,
      tp3,
      channelHandle,
      reason: obj.reason ? String(obj.reason) : undefined,
    });
  }

  const text = String(input).trim();
  if (!text) return null;

  // Try JSON string first
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parseDollarinoSignal(parsed);
    } catch {
      // fall through to text parser
    }
  }

  let direction: Direction | null = null;
  if (/buy\s*(?:\/\s*long)?\s*signal|🟢|\blong\b|\bbuy\b|خرید|لانگ/i.test(text)) {
    direction = 'LONG';
  }
  if (/sell\s*(?:\/\s*short)?\s*signal|🔴|\bshort\b|\bsell\b|فروش|شورت/i.test(text)) {
    // Only override if explicitly short/sell and not a header like "Buy / Long"
    if (!direction || !/buy\s*signal|🟢\s*buy/i.test(text)) {
      direction = 'SHORT';
    }
  }
  if (!direction) return null;

  // Match explicit `Symbol: BTCUSDT` OR `#BTCUSDT` OR `BTC/USDT`
  const symbolMatch =
    text.match(/symbol\s*[:：]\s*#?([A-Za-z0-9._/-]+)/i) ||
    text.match(/#([A-Za-z]{2,12}[/_-]?USDT?)\b/i) ||
    text.match(/\b([A-Za-z]{2,10}USDT)\b/i);

  const tfMatch =
    text.match(/time\s*frame\s*[:：]\s*([A-Za-z0-9]+)/i) ||
    text.match(/\|\s*([0-9]+[mhdw]?)\b/i);

  const priceMatch = text.match(/(?:^|\n)[^\n]*?(?:\bprice|\bentry(?:\s*price)?|نقطه\s*ورود|ورود)\s*[:：]\s*\$?([0-9.,]+|market|مارکت|لحظه‌ای|لحظه\s*ای)/i);
  const stopMatch = text.match(/(?:^|\n)[^\n]*?(?:\bstop(?:\s*loss)?|\bsl\b|حد\s*ضرر|استاپ)\s*[:：]\s*\$?([0-9.,]+)/i);
  const levMatch = text.match(/(?:\bleverage|\blev|اهرم)\s*[:：]?\s*(\d+)x?/i) || text.match(/(\d+)\s*x\b/i);
  const tp1Match = text.match(/(?:\btp\s*1|\btake\s*profit\s*1|تارگت\s*1)\s*[:：]\s*\$?([0-9.,]+)/i);
  const tp2Match = text.match(/(?:\btp\s*2|\btake\s*profit\s*2|تارگت\s*2)\s*[:：]\s*\$?([0-9.,]+)/i);
  const tp3Match = text.match(/(?:\btp\s*3|\btake\s*profit\s*3|تارگت\s*3)\s*[:：]\s*\$?([0-9.,]+)/i);
  const handleMatch = text.match(/(@[A-Za-z0-9_]+)/);

  if (!symbolMatch?.[1] || !stopMatch?.[1] || !tp1Match?.[1]) {
    return null;
  }

  let symbol = symbolMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!symbol.endsWith('USDT') && !symbol.endsWith('USD') && symbol.length <= 6) {
    symbol = `${symbol}USDT`;
  }

  const rawPrice = priceMatch?.[1] ?? '0';
  const normalizedPrice = /^(market|مارکت|لحظه‌ای|لحظه\s*ای)$/i.test(rawPrice) ? '0' : cleanNumeric(rawPrice);

  const signal: DollarinoSignal = {
    symbol,
    direction,
    timeframe: tfMatch?.[1]?.trim() ?? '15m',
    price: normalizedPrice,
    stopLoss: cleanNumeric(stopMatch[1]),
    leverage: Math.max(1, Number(levMatch?.[1] ?? '1')),
    tp1: cleanNumeric(tp1Match[1]),
    tp2: tp2Match?.[1] ? cleanNumeric(tp2Match[1]) : undefined,
    tp3: tp3Match?.[1] ? cleanNumeric(tp3Match[1]) : undefined,
    channelHandle: handleMatch?.[1] ?? '@Dollarino_official',
  };

  return enrichSignalPercentages(signal);
}

export function enrichSignalPercentages(signal: DollarinoSignal): DollarinoSignal {
  const entry = Number(signal.price);
  const sl = Number(signal.stopLoss);
  const tp1 = Number(signal.tp1);
  const lev = Math.max(1, signal.leverage);

  return {
    ...signal,
    slPct: signal.slPct ?? calcLeveragedPct(entry, sl, lev),
    tp1Pct: signal.tp1Pct ?? calcLeveragedPct(entry, tp1, lev),
    tp2Pct: signal.tp2Pct ?? (signal.tp2 ? calcLeveragedPct(entry, Number(signal.tp2), lev) : undefined),
    tp3Pct: signal.tp3Pct ?? (signal.tp3 ? calcLeveragedPct(entry, Number(signal.tp3), lev) : undefined),
    channelHandle: signal.channelHandle ?? '@Dollarino_official',
  };
}

/**
 * Formats a signal in the exact Dollarino Telegram/Channel specification.
 */
export function formatDollarinoSignal(rawSignal: DollarinoSignal): string {
  const sig = enrichSignalPercentages(rawSignal);
  const divider = '------------------------------------------------';
  const header = sig.direction === 'LONG' ? '🟢 Buy signal' : '🔴 Sell signal';

  const lines = [
    header,
    divider,
    `💲Symbol: ${sig.symbol}`,
    divider,
    `⌛️Time Frame: ${sig.timeframe}`,
    divider,
    `🔔 Price: ${sig.price === '0' ? 'Market' : sig.price}`,
    divider,
    `🔘 Leverage: ${sig.leverage}`,
    divider,
    `⛔️ Stop: ${sig.stopLoss}`,
    divider,
    `🟢Tp1: ${sig.tp1}`,
  ];

  if (sig.tp2) lines.push(`🟡Tp2: ${sig.tp2}`);
  if (sig.tp3) lines.push(`🟠Tp3: ${sig.tp3}`);

  lines.push(divider);
  lines.push(`🧨 SL: %${sig.slPct ?? '0.00'}`);
  lines.push(`🎯 TP1: %${sig.tp1Pct ?? '0.00'}`);
  if (sig.tp2 && sig.tp2Pct !== undefined) lines.push(`🎯 TP2: %${sig.tp2Pct}`);
  if (sig.tp3 && sig.tp3Pct !== undefined) lines.push(`🎯 TP3: %${sig.tp3Pct}`);
  lines.push(divider);
  lines.push(`🆔 ${sig.channelHandle ?? '@Dollarino_official'}`);

  return lines.join('\n');
}
