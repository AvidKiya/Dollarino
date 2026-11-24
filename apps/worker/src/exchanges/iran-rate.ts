export interface IranUsdtRate {
  usdtIrr: number;
  usdtIrt: number;
  source: 'nobitex' | 'wallex' | 'cached_fallback';
  updatedAt: string;
}

let cachedRate: { data: IranUsdtRate; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SAFE_FALLBACK_IRT = 74_500;

/**
 * Fetches live USDT -> IRR / IRT rate from real Iranian crypto exchanges (Nobitex primary, Wallex fallback).
 * Nobitex reports prices in Rials (RLS = IRR); 1 Toman (IRT) = 10 Rials (IRR).
 */
export async function fetchIranUsdtRate(forceRefresh = false): Promise<IranUsdtRate> {
  const now = Date.now();
  if (!forceRefresh && cachedRate && cachedRate.expiresAt > now) {
    return cachedRate.data;
  }

  // 1. Primary: Nobitex public market stats API
  try {
    const res = await fetch('https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/10.0' },
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        status?: string;
        stats?: { 'usdt-rls'?: { latest?: string | number; bestSell?: string | number; bestBuy?: string | number } };
      };
      const row = json.stats?.['usdt-rls'];
      const rawRls = Number(row?.latest || row?.bestSell || row?.bestBuy || 0);
      if (Number.isFinite(rawRls) && rawRls > 100_000) {
        const usdtIrr = Math.round(rawRls);
        const usdtIrt = Math.round(usdtIrr / 10);
        const data: IranUsdtRate = {
          usdtIrr,
          usdtIrt,
          source: 'nobitex',
          updatedAt: new Date().toISOString(),
        };
        cachedRate = { data, expiresAt: now + CACHE_TTL_MS };
        return data;
      }
    }
  } catch {
    // fallback to Wallex
  }

  // 2. Fallback: Wallex public markets API
  try {
    const res = await fetch('https://api.wallex.ir/v1/markets', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/10.0' },
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        result?: { symbols?: { USDTTMN?: { stats?: { lastPrice?: string | number; askPrice?: string | number } } } };
      };
      const tmn = Number(
        json.result?.symbols?.USDTTMN?.stats?.lastPrice ||
        json.result?.symbols?.USDTTMN?.stats?.askPrice ||
        0
      );
      if (Number.isFinite(tmn) && tmn > 10_000) {
        const usdtIrt = Math.round(tmn);
        const usdtIrr = usdtIrt * 10;
        const data: IranUsdtRate = {
          usdtIrr,
          usdtIrt,
          source: 'wallex',
          updatedAt: new Date().toISOString(),
        };
        cachedRate = { data, expiresAt: now + CACHE_TTL_MS };
        return data;
      }
    }
  } catch {
    // use safe cached fallback
  }

  if (cachedRate) {
    return { ...cachedRate.data, source: 'cached_fallback' };
  }

  const fallback: IranUsdtRate = {
    usdtIrr: SAFE_FALLBACK_IRT * 10,
    usdtIrt: SAFE_FALLBACK_IRT,
    source: 'cached_fallback',
    updatedAt: new Date().toISOString(),
  };
  cachedRate = { data: fallback, expiresAt: now + 60_000 };
  return fallback;
}
