export type TpSlInputMode = 'PRICE' | 'PCT';

export function priceDecimalsFor(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 2;
  if (px >= 1000) return 2;
  if (px >= 1) return 4;
  if (px >= 0.01) return 6;
  return 8;
}

export function formatLevelPrice(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '';
  return px.toFixed(priceDecimalsFor(px));
}

export function calcPriceFromPct(params: {
  entryPrice: number;
  side: 'LONG' | 'SHORT';
  kind: 'TP' | 'SL';
  pct: number;
}): number | null {
  const { entryPrice, side, kind, pct } = params;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(pct) || pct <= 0) return null;

  const move = Math.min(99.9, Math.abs(pct)) / 100;
  let multiplier: number;
  if (kind === 'TP') {
    multiplier = side === 'LONG' ? 1 + move : Math.max(0.0001, 1 - move);
  } else {
    multiplier = side === 'LONG' ? Math.max(0.0001, 1 - move) : 1 + move;
  }
  const out = entryPrice * multiplier;
  return Number(out.toFixed(priceDecimalsFor(entryPrice)));
}

export function calcPctFromPrice(params: {
  entryPrice: number;
  side: 'LONG' | 'SHORT';
  kind: 'TP' | 'SL';
  targetPrice: number;
}): number | null {
  const { entryPrice, side, kind, targetPrice } = params;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return null;

  let pct: number;
  if (kind === 'TP') {
    pct = side === 'LONG' ? ((targetPrice - entryPrice) / entryPrice) * 100 : ((entryPrice - targetPrice) / entryPrice) * 100;
  } else {
    pct = side === 'LONG' ? ((entryPrice - targetPrice) / entryPrice) * 100 : ((targetPrice - entryPrice) / entryPrice) * 100;
  }
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Number(pct.toFixed(2));
}

export function calcRoePct(priceMovePct: number, leverage = 1): number {
  if (!Number.isFinite(priceMovePct) || !Number.isFinite(leverage)) return 0;
  return Number((priceMovePct * Math.max(1, leverage)).toFixed(1));
}
