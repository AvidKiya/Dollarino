export type IranRateSource =
  | 'arzdigital'
  | 'alanchand'
  | 'nobitex'
  | 'wallex'
  | 'tetherland'
  | 'ramzinex'
  | 'cached_fallback';

export interface IranUsdtRate {
  usdtIrr: number;
  usdtIrt: number;
  source: IranRateSource;
  sourceUrl?: string;
  updatedAt: string;
}

let cachedRate: { data: IranUsdtRate; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 1000;
const FALLBACK_CACHE_TTL_MS = 10 * 1000;
const SAFE_FALLBACK_IRT = 290_000;

export function faDigitsToEn(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function acceptIrtRate(toman: number): { usdtIrr: number; usdtIrt: number } | null {
  if (!Number.isFinite(toman) || toman < 30_000 || toman > 2_500_000) return null;
  const usdtIrt = Math.round(toman);
  return { usdtIrt, usdtIrr: usdtIrt * 10 };
}

export function extractTomanFromHtml(html: string, source: 'arzdigital' | 'alanchand' = 'arzdigital'): number | null {
  if (source === 'arzdigital') {
    const rawEn = faDigitsToEn(html);
    const rawStructuredPatterns = [
      /"toman[_-]?price"\s*[:=]\s*"?([\d,]{5,9})(?:\.\d+)?"?/i,
      /data-toman-price\s*=\s*["']([\d,]{5,9})/i,
      /arz-coin-page-data__coin-toman-price[^>]*>[\s\S]{0,120}?([\d,]{5,9})/i,
      /arz-toman-price[^>]*>[\s\S]{0,80}?([\d,]{5,9})/i,
    ];
    for (const rx of rawStructuredPatterns) {
      const m = rawEn.match(rx);
      if (m?.[1]) {
        const val = Number(m[1].replace(/,/g, ''));
        if (acceptIrtRate(val)) return val;
      }
    }
  }

  const normalized = faDigitsToEn(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  const patterns =
    source === 'arzdigital'
      ? [
          /قیمت\s+امروز\s+تتر\s+در\s+ایران\s*([\d,]{5,9})\s*تومان/i,
          /نرخ\s+تتر\s*[:：]?\s*([\d,]{5,9})\s*تومان/i,
          /تتر\s*\(?USDT\)?[^\d]{0,40}([\d,]{5,9})\s*تومان/i,
          /تتر[^\d]{0,25}([\d,]{5,9})\s*تومان/i,
        ]
      : [
          /هر\s+تتر\s*\(?USDT\)?\s*در\s+بازار\s+ایران\s*([\d,]{5,9})\s*تومان/i,
          /هم[‌\s]*اکنون\s+تتر\s+به\s+قیمت\s*([\d,]{5,9})\s*تومان/i,
          /قیمت\s+تومانی\s*[:：]?\s*([\d,]{5,9})\s*تومان/i,
        ];

  for (const rx of patterns) {
    const m = normalized.match(rx);
    if (m?.[1]) {
      const val = Number(m[1].replace(/,/g, ''));
      if (acceptIrtRate(val)) return val;
    }
  }
  return null;
}

/**
 * Fetches live USD/USDT -> IRR / IRT rate prioritizing https://arzdigital.com/coins/tether/
 * with a short 10s cache for real-time updates, falling back cleanly to Iranian exchanges
 * only if ArzDigital is temporarily unreachable.
 * 1 Toman (IRT) = 10 Rials (IRR).
 */
export async function fetchIranUsdtRate(forceRefresh = false): Promise<IranUsdtRate> {
  const now = Date.now();
  if (!forceRefresh && cachedRate && cachedRate.expiresAt > now) {
    return cachedRate.data;
  }

  const probeArzdigital = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://arzdigital.com/coins/tether/', {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error('arzdigital');
    const html = await res.text();
    const toman = extractTomanFromHtml(html, 'arzdigital');
    const norm = toman ? acceptIrtRate(toman) : null;
    if (!norm) throw new Error('arzdigital_invalid');
    return {
      ...norm,
      source: 'arzdigital',
      sourceUrl: 'https://arzdigital.com/coins/tether/',
      updatedAt: new Date().toISOString(),
    };
  };

  // Primary live source: ArzDigital Tether page
  try {
    const primary = await probeArzdigital();
    cachedRate = { data: primary, expiresAt: now + CACHE_TTL_MS };
    return primary;
  } catch {
    // Fallback to other reputable live Iranian sources if ArzDigital fails
  }

  const probeAlanchand = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://alanchand.com/crypto-price/usdt', {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; Dollarino/11.4; +https://dollarino.ai)',
      },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) throw new Error('alanchand');
    const html = await res.text();
    const toman = extractTomanFromHtml(html, 'alanchand');
    const norm = toman ? acceptIrtRate(toman) : null;
    if (!norm) throw new Error('alanchand_invalid');
    return { ...norm, source: 'alanchand', updatedAt: new Date().toISOString() };
  };

  const probeNobitex = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.4' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error('nobitex');
    const json = (await res.json()) as {
      stats?: { 'usdt-rls'?: { latest?: string | number; bestSell?: string | number; bestBuy?: string | number } };
    };
    const row = json.stats?.['usdt-rls'];
    const rawRls = Number(row?.latest || row?.bestSell || row?.bestBuy || 0);
    const norm = acceptIrtRate(rawRls / 10);
    if (!norm) throw new Error('nobitex_invalid');
    return { ...norm, source: 'nobitex', updatedAt: new Date().toISOString() };
  };

  const probeWallex = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://api.wallex.ir/v1/markets', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.4' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error('wallex');
    const json = (await res.json()) as {
      result?: { symbols?: { USDTTMN?: { stats?: { lastPrice?: string | number; askPrice?: string | number } } } };
    };
    const tmn = Number(
      json.result?.symbols?.USDTTMN?.stats?.lastPrice ||
      json.result?.symbols?.USDTTMN?.stats?.askPrice ||
      0
    );
    const norm = acceptIrtRate(tmn);
    if (!norm) throw new Error('wallex_invalid');
    return { ...norm, source: 'wallex', updatedAt: new Date().toISOString() };
  };

  const probeTetherland = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://api.tetherland.com/currencies', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.4' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error('tetherland');
    const json = (await res.json()) as {
      data?: { currencies?: { USDT?: { price?: string | number } } };
    };
    const tmn = Number(json.data?.currencies?.USDT?.price || 0);
    const norm = acceptIrtRate(tmn);
    if (!norm) throw new Error('tetherland_invalid');
    return { ...norm, source: 'tetherland', updatedAt: new Date().toISOString() };
  };

  const probeRamzinex = async (): Promise<IranUsdtRate> => {
    const res = await fetch('https://publicapi.ramzinex.com/exchange/api/v1.0/exchange/orderbooks/11/market_sell_price', {
      headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.4' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) throw new Error('ramzinex');
    const json = (await res.json()) as { data?: number | string };
    const rawIrr = Number(json.data || 0);
    const norm = acceptIrtRate(rawIrr > 5_000_000 ? rawIrr / 10 : rawIrr > 300_000 ? rawIrr / 10 : rawIrr);
    if (!norm) throw new Error('ramzinex_invalid');
    return { ...norm, source: 'ramzinex', updatedAt: new Date().toISOString() };
  };

  try {
    const data = await Promise.any([
      probeAlanchand(),
      probeNobitex(),
      probeWallex(),
      probeTetherland(),
      probeRamzinex(),
    ]);
    cachedRate = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  } catch {
    // use last known live cache or safe baseline
  }

  if (cachedRate && cachedRate.data.source !== 'cached_fallback') {
    return { ...cachedRate.data, source: 'cached_fallback' };
  }

  const fallback: IranUsdtRate = {
    usdtIrr: SAFE_FALLBACK_IRT * 10,
    usdtIrt: SAFE_FALLBACK_IRT,
    source: 'cached_fallback',
    sourceUrl: 'https://arzdigital.com/coins/tether/',
    updatedAt: new Date().toISOString(),
  };
  cachedRate = { data: fallback, expiresAt: now + FALLBACK_CACHE_TTL_MS };
  return fallback;
}
