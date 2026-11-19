import type { Candle, ExchangeProviderId, Timeframe } from '@dollarino/core';

export interface ExchangeMarketInfo {
  symbol: string; // Canonical e.g. BTCUSDT
  exchangeSymbol: string; // Native e.g. BTC-SWAP-USDT (Toobit), BTC_USDT (KCEX), BTCUSDT (Bitunix)
  base: string;
  quote: string;
  lastPrice: string;
  changePct24h: string;
  high24h: string;
  low24h: string;
  volume24h: number;
  maxLeverage: number;
  basePrecision: number;
  quotePrecision: number;
  minTradeVolume: string;
  status: string;
}

const MARKET_CACHE = new Map<string, { ts: number; data: ExchangeMarketInfo[] }>();
const CACHE_TTL_MS = 60_000;

function countDecimals(stepStr?: string): number {
  if (!stepStr || !stepStr.includes('.')) return 0;
  const trimmed = stepStr.replace(/0+$/, '');
  const parts = trimmed.split('.');
  return parts[1]?.length ?? 0;
}

export function normalizeCanonicalSymbol(raw: string): string {
  const s = raw.toUpperCase().trim();
  if (s.includes('-SWAP-')) return s.replace('-SWAP-', '');
  if (s.includes('_')) return s.replace(/_/g, '');
  return s.replace(/[^A-Z0-9]/g, '');
}

function isStandardUsdtPerp(nativeSym: string): boolean {
  // Exclude Toobit internal broker/demo prefix pairs like TBV_BTC-SWAP-TBV_USDT
  if (!nativeSym || nativeSym.startsWith('TBV_') || nativeSym.includes('TBV_')) return false;
  return nativeSym.endsWith('-SWAP-USDT') || nativeSym.endsWith('USDT');
}

async function fetchToobitUniverse(): Promise<ExchangeMarketInfo[]> {
  const [infoRes, tickRes] = await Promise.all([
    fetch('https://api.toobit.com/api/v1/exchangeInfo', { signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch('https://api.toobit.com/quote/v1/contract/ticker/24hr', { signal: AbortSignal.timeout(7000) }).catch(() => null),
  ]);

  type ToobitContract = {
    symbol: string;
    status?: string;
    baseAssetPrecision?: string;
    quoteAsset?: string;
    filters?: Array<{ filterType?: string; tickSize?: string; stepSize?: string; minQty?: string }>;
  };
  type ToobitTicker = {
    s?: string;
    si?: string;
    c?: string;
    h?: string;
    l?: string;
    qv?: string;
    pcp?: string;
  };

  const infoMap = new Map<string, ToobitContract>();
  if (infoRes?.ok) {
    const infoJson = (await infoRes.json()) as { contracts?: ToobitContract[] };
    for (const c of infoJson.contracts ?? []) {
      if (c.symbol) infoMap.set(c.symbol.toUpperCase(), c);
    }
  }

  const out: ExchangeMarketInfo[] = [];
  if (tickRes?.ok) {
    const tickers = (await tickRes.json()) as ToobitTicker[];
    if (Array.isArray(tickers)) {
      for (const t of tickers) {
        const nativeSym = (t.s || t.si || '').toUpperCase();
        if (!isStandardUsdtPerp(nativeSym)) continue;
        const meta = infoMap.get(nativeSym);
        const priceFilter = meta?.filters?.find((f) => f.filterType === 'PRICE_FILTER');
        const lotFilter = meta?.filters?.find((f) => f.filterType === 'LOT_SIZE');
        const canonical = normalizeCanonicalSymbol(nativeSym);
        const base = canonical.endsWith('USDT') ? canonical.slice(0, -4) : canonical;
        const pct = t.pcp ? (Number(t.pcp) * 100).toFixed(2) : '0.00';
        out.push({
          symbol: canonical,
          exchangeSymbol: nativeSym,
          base,
          quote: 'USDT',
          lastPrice: t.c ?? '0',
          changePct24h: pct,
          high24h: t.h ?? t.c ?? '0',
          low24h: t.l ?? t.c ?? '0',
          volume24h: Number(t.qv ?? 0),
          maxLeverage: base === 'BTC' || base === 'ETH' ? 100 : 50,
          basePrecision: Math.max(0, countDecimals(lotFilter?.stepSize ?? meta?.baseAssetPrecision ?? '0.001')),
          quotePrecision: Math.max(1, countDecimals(priceFilter?.tickSize ?? '0.01')),
          minTradeVolume: lotFilter?.minQty ?? '0.001',
          status: meta?.status ?? 'TRADING',
        });
      }
    }
  }

  // Add any contract from exchangeInfo missing from ticker snapshot
  if (out.length === 0 && infoMap.size > 0) {
    for (const [nativeSym, meta] of infoMap.entries()) {
      if (!isStandardUsdtPerp(nativeSym)) continue;
      const canonical = normalizeCanonicalSymbol(nativeSym);
      const base = canonical.endsWith('USDT') ? canonical.slice(0, -4) : canonical;
      out.push({
        symbol: canonical,
        exchangeSymbol: nativeSym,
        base,
        quote: 'USDT',
        lastPrice: '0',
        changePct24h: '0.00',
        high24h: '0',
        low24h: '0',
        volume24h: 0,
        maxLeverage: 50,
        basePrecision: countDecimals(meta.baseAssetPrecision ?? '0.001'),
        quotePrecision: 2,
        minTradeVolume: '0.001',
        status: meta.status ?? 'TRADING',
      });
    }
  }

  return out.sort((a, b) => b.volume24h - a.volume24h);
}

async function fetchBitunixUniverse(): Promise<ExchangeMarketInfo[]> {
  const [pairsRes, tickRes] = await Promise.all([
    fetch('https://fapi.bitunix.com/api/v1/futures/market/trading_pairs', { signal: AbortSignal.timeout(7000) }).catch(() => null),
    fetch('https://fapi.bitunix.com/api/v1/futures/market/tickers', { signal: AbortSignal.timeout(7000) }).catch(() => null),
  ]);

  type BitunixPair = {
    symbol: string;
    base: string;
    quote: string;
    minTradeVolume?: string;
    basePrecision?: number;
    quotePrecision?: number;
    maxLeverage?: number;
    symbolStatus?: string;
  };
  type BitunixTicker = {
    symbol: string;
    lastPrice?: string;
    last?: string;
    open?: string;
    quoteVol?: string;
    high?: string;
    low?: string;
  };

  const tickMap = new Map<string, BitunixTicker>();
  if (tickRes?.ok) {
    const tj = (await tickRes.json()) as { code?: number; data?: BitunixTicker[] };
    for (const t of tj.data ?? []) {
      if (t.symbol) tickMap.set(t.symbol.toUpperCase(), t);
    }
  }

  const out: ExchangeMarketInfo[] = [];
  if (pairsRes?.ok) {
    const pj = (await pairsRes.json()) as { code?: number; data?: BitunixPair[] };
    for (const p of pj.data ?? []) {
      const sym = p.symbol.toUpperCase();
      const t = tickMap.get(sym);
      const last = Number(t?.lastPrice ?? t?.last ?? 0);
      const open = Number(t?.open ?? last);
      const chg = open > 0 && last > 0 ? (((last - open) / open) * 100).toFixed(2) : '0.00';
      out.push({
        symbol: sym,
        exchangeSymbol: sym,
        base: p.base || sym.replace(/USDT$/, ''),
        quote: p.quote || 'USDT',
        lastPrice: String(t?.lastPrice ?? t?.last ?? '0'),
        changePct24h: chg,
        high24h: t?.high ?? '0',
        low24h: t?.low ?? '0',
        volume24h: Number(t?.quoteVol ?? 0),
        maxLeverage: p.maxLeverage ?? 100,
        basePrecision: p.basePrecision ?? 3,
        quotePrecision: p.quotePrecision ?? 2,
        minTradeVolume: p.minTradeVolume ?? '0.001',
        status: p.symbolStatus ?? 'OPEN',
      });
    }
  }

  return out.sort((a, b) => b.volume24h - a.volume24h);
}

const FALLBACK_MARKETS: ExchangeMarketInfo[] = [
  { symbol: 'BTCUSDT', exchangeSymbol: 'BTC-SWAP-USDT', base: 'BTC', quote: 'USDT', lastPrice: '63000', changePct24h: '0.00', high24h: '63500', low24h: '62200', volume24h: 1_000_000_000, maxLeverage: 100, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
  { symbol: 'ETHUSDT', exchangeSymbol: 'ETH-SWAP-USDT', base: 'ETH', quote: 'USDT', lastPrice: '1850', changePct24h: '0.00', high24h: '1890', low24h: '1810', volume24h: 500_000_000, maxLeverage: 100, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
  { symbol: 'SOLUSDT', exchangeSymbol: 'SOL-SWAP-USDT', base: 'SOL', quote: 'USDT', lastPrice: '145', changePct24h: '0.00', high24h: '150', low24h: '140', volume24h: 250_000_000, maxLeverage: 75, basePrecision: 2, quotePrecision: 2, minTradeVolume: '0.01', status: 'OPEN' },
  { symbol: 'BNBUSDT', exchangeSymbol: 'BNB-SWAP-USDT', base: 'BNB', quote: 'USDT', lastPrice: '580', changePct24h: '0.00', high24h: '590', low24h: '570', volume24h: 150_000_000, maxLeverage: 75, basePrecision: 2, quotePrecision: 2, minTradeVolume: '0.01', status: 'OPEN' },
  { symbol: 'XRPUSDT', exchangeSymbol: 'XRP-SWAP-USDT', base: 'XRP', quote: 'USDT', lastPrice: '0.58', changePct24h: '0.00', high24h: '0.60', low24h: '0.56', volume24h: 120_000_000, maxLeverage: 50, basePrecision: 1, quotePrecision: 4, minTradeVolume: '1', status: 'OPEN' },
  { symbol: 'TONUSDT', exchangeSymbol: 'TON-SWAP-USDT', base: 'TON', quote: 'USDT', lastPrice: '4.80', changePct24h: '0.00', high24h: '5.00', low24h: '4.60', volume24h: 80_000_000, maxLeverage: 50, basePrecision: 1, quotePrecision: 3, minTradeVolume: '1', status: 'OPEN' },
];

export async function getExchangeMarkets(provider: ExchangeProviderId): Promise<ExchangeMarketInfo[]> {
  const cached = MARKET_CACHE.get(provider);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.data.length > 0) {
    return cached.data;
  }

  let list: ExchangeMarketInfo[] = [];

  if (provider === 'toobit') {
    list = await fetchToobitUniverse();
    if (list.length === 0) list = await fetchBitunixUniverse();
  } else if (provider === 'bitunix') {
    list = await fetchBitunixUniverse();
    if (list.length === 0) list = await fetchToobitUniverse();
  } else {
    // KCEX Mirror & Paper Simulator: merge Toobit + Bitunix live USDT perpetual universes (~1,000+ coins)
    const [tList, bList] = await Promise.all([fetchToobitUniverse(), fetchBitunixUniverse()]);
    const merged = new Map<string, ExchangeMarketInfo>();
    for (const item of tList) merged.set(item.symbol, item);
    for (const item of bList) {
      if (!merged.has(item.symbol)) merged.set(item.symbol, item);
    }
    list = Array.from(merged.values()).map((item) => ({
      ...item,
      exchangeSymbol: provider === 'kcex' ? `${item.base}_${item.quote}` : item.symbol,
    }));
    list.sort((a, b) => b.volume24h - a.volume24h);
  }

  if (list.length === 0) list = FALLBACK_MARKETS;
  MARKET_CACHE.set(provider, { ts: Date.now(), data: list });
  return list;
}

export async function findMarketSpec(provider: ExchangeProviderId, symbol: string): Promise<ExchangeMarketInfo | undefined> {
  const canonical = normalizeCanonicalSymbol(symbol);
  const all = await getExchangeMarkets(provider);
  return all.find((m) => m.symbol === canonical || m.exchangeSymbol.toUpperCase() === symbol.toUpperCase());
}

export async function fetchBitunixKlinesFallback(symbol: string, tf: Timeframe, limit = 200): Promise<Candle[]> {
  const clean = normalizeCanonicalSymbol(symbol);
  try {
    const res = await fetch(
      `https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${clean}&interval=${tf}&limit=${limit}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        code?: number;
        data?: Array<{ time: string; open: string; high: string; low: string; close: string; baseVol?: string; quoteVol?: string }>;
      };
      if (Array.isArray(json.data) && json.data.length > 5) {
        return json.data
          .map((r) => ({
            timestamp: Number(r.time),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.quoteVol ?? r.baseVol ?? 0),
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
      }
    }
  } catch { /* ignore */ }
  return [];
}
