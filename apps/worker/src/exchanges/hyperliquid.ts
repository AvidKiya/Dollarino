import type { Candle, Direction, InstrumentSpec, MarketType, Timeframe } from '@dollarino/core';
import { signHyperliquidL1Action } from '../dex/evm-tx.js';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook, fetchPublicTickerPrice } from './paper.js';

export interface HyperliquidAgentCreds {
  masterAddress: string;
  agentPrivateKeyHex: string;
}

/**
 * Real Non-Custodial Hyperliquid L1 Perp Adapter.
 * Executes authenticated EIP-712 Agent-Wallet orders directly on https://api.hyperliquid.xyz/exchange
 * while reading real USDC balances & open positions from clearinghouseState.
 */
export class HyperliquidPerpAdapter implements IExchangeAdapter {
  readonly provider = 'hyperliquid' as const;
  private readonly apiUrl = 'https://api.hyperliquid.xyz';

  constructor(private creds: HyperliquidAgentCreds) {}

  private static toCoin(symbol: string): string {
    return normalizeCanonicalSymbol(symbol).replace(/USDT$|USDC$|USD$/i, '') || 'BTC';
  }

  private async fetchMetaAndCtxs(): Promise<{
    universe: Array<{ name: string; szDecimals?: number; maxLeverage?: number }>;
    ctxs: Array<{ markPx?: string; funding?: string; dayNtlVlm?: string; oraclePx?: string }>;
  }> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Hyperliquid info API error: ${res.status}`);
    const [meta, ctxs] = (await res.json()) as [
      { universe?: Array<{ name: string; szDecimals?: number; maxLeverage?: number }> },
      Array<{ markPx?: string; funding?: string; dayNtlVlm?: string; oraclePx?: string }>,
    ];
    return { universe: meta?.universe ?? [], ctxs: ctxs ?? [] };
  }

  private async postExchangeAction(action: Record<string, unknown>) {
    const cleanPriv = this.creds.agentPrivateKeyHex.trim().replace(/^0x/i, '');
    if (!/^[a-fA-F0-9]{64}$/.test(cleanPriv)) {
      throw new Error('کلید Agent Wallet هایپرلیکویید نامعتبر است.');
    }
    const nonce = Date.now();
    const signed = signHyperliquidL1Action({
      agentPrivateKeyHex: cleanPriv,
      action,
      nonce,
      isMainnet: true,
    });
    const res = await fetch(`${this.apiUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature: signed.signature }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      response?: {
        type?: string;
        data?: {
          statuses?: Array<{
            filled?: { oid?: number; totalSz?: string; avgPx?: string };
            resting?: { oid?: number };
            error?: string;
          }>;
        };
      };
    };
    if (!res.ok || json.status !== 'ok') {
      const errMsg = json.response?.data?.statuses?.[0]?.error || json.status || `HTTP ${res.status}`;
      throw new Error(`Hyperliquid order failed: ${errMsg}`);
    }
    return json;
  }

  async testConnection(): Promise<{ ok: boolean; message: string; balance?: FuturesBalance }> {
    try {
      const bal = await this.getBalance();
      return { ok: true, message: `Connected to Hyperliquid L1 (${this.creds.masterAddress.slice(0, 8)}...)`, balance: bal };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Hyperliquid connection failed' };
    }
  }

  async getBalance(): Promise<FuturesBalance> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: this.creds.masterAddress }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Hyperliquid state error: ${res.status}`);
    const data = (await res.json()) as {
      marginSummary?: { accountValue?: string; totalMarginUsed?: string };
      withdrawable?: string;
    };
    const total = Number(data.marginSummary?.accountValue || 0);
    const free = Number(data.withdrawable ?? total);
    const used = Math.max(0, Number(data.marginSummary?.totalMarginUsed ?? total - free));
    return {
      free: free.toFixed(2),
      used: used.toFixed(2),
      total: total.toFixed(2),
      currency: 'USDT',
    };
  }

  async getTickerPrice(symbol: string): Promise<string> {
    const coin = HyperliquidPerpAdapter.toCoin(symbol);
    try {
      const { universe, ctxs } = await this.fetchMetaAndCtxs();
      const idx = universe.findIndex((u) => u.name.toUpperCase() === coin);
      const px = idx >= 0 ? Number(ctxs[idx]?.markPx || 0) : 0;
      if (px > 0) return String(px);
    } catch { /* fallback below */ }
    return fetchPublicTickerPrice(symbol);
  }

  async getMarket24h(symbol: string): Promise<Market24hStats> {
    const base = await fetchPublicMarket24h(symbol);
    const coin = HyperliquidPerpAdapter.toCoin(symbol);
    try {
      const { universe, ctxs } = await this.fetchMetaAndCtxs();
      const idx = universe.findIndex((u) => u.name.toUpperCase() === coin);
      if (idx >= 0 && ctxs[idx]?.markPx) {
        return {
          ...base,
          lastPrice: String(ctxs[idx]!.markPx),
          fundingRate: ctxs[idx]?.funding ? (Number(ctxs[idx]!.funding) * 100).toFixed(4) : base.fundingRate,
          volume24h: ctxs[idx]?.dayNtlVlm ? Math.round(Number(ctxs[idx]!.dayNtlVlm)).toLocaleString() : base.volume24h,
        };
      }
    } catch { /* fallback */ }
    return base;
  }

  async getKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    return fetchPublicKlines(symbol, timeframe, limit);
  }

  async getOrderBook(symbol: string, limit = 15): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return fetchPublicOrderBook(symbol, limit);
  }

  async getInstrumentSpec(symbol: string): Promise<InstrumentSpec> {
    const canonical = normalizeCanonicalSymbol(symbol);
    const coin = HyperliquidPerpAdapter.toCoin(canonical);
    try {
      const { universe } = await this.fetchMetaAndCtxs();
      const u = universe.find((x) => x.name.toUpperCase() === coin);
      if (u) {
        return {
          symbol: canonical,
          basePrecision: Number(u.szDecimals ?? 3),
          quotePrecision: 4,
          minTradeVolume: String(10 ** -Math.min(4, Number(u.szDecimals ?? 3))),
          maxMarketVolume: '1000000',
          minLeverage: 1,
          maxLeverage: Number(u.maxLeverage ?? 50),
          status: 'OPEN',
        };
      }
    } catch { /* fallback */ }
    const spec = await findMarketSpec('paper', canonical).catch(() => undefined);
    return {
      symbol: canonical,
      basePrecision: spec?.basePrecision ?? 3,
      quotePrecision: spec?.quotePrecision ?? 2,
      minTradeVolume: spec?.minTradeVolume ?? '0.001',
      maxMarketVolume: '1000000',
      minLeverage: 1,
      maxLeverage: spec?.maxLeverage ?? 50,
      status: 'OPEN',
    };
  }

  async getPositions(symbol?: string): Promise<ExchangePosition[]> {
    const res = await fetch(`${this.apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: this.creds.masterAddress }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      assetPositions?: Array<{
        position?: {
          coin?: string;
          szi?: string;
          entryPx?: string;
          positionValue?: string;
          unrealizedPnl?: string;
          leverage?: { value?: number };
        };
      }>;
    };
    const targetCoin = symbol ? HyperliquidPerpAdapter.toCoin(symbol) : null;
    const out: ExchangePosition[] = [];
    for (const ap of data.assetPositions ?? []) {
      const p = ap.position;
      if (!p || !p.coin) continue;
      const sz = Number(p.szi || 0);
      if (sz === 0) continue;
      if (targetCoin && p.coin.toUpperCase() !== targetCoin) continue;
      const mark = Math.abs(sz) > 0 && p.positionValue ? Math.abs(Number(p.positionValue) / sz) : Number(p.entryPx || 0);
      out.push({
        symbol: `${p.coin.toUpperCase()}USDT`,
        direction: sz > 0 ? 'LONG' : 'SHORT',
        quantity: Math.abs(sz).toString(),
        entryPrice: String(p.entryPx || '0'),
        markPrice: mark.toFixed(4),
        unrealizedPnl: String(p.unrealizedPnl || '0'),
        leverage: Number(p.leverage?.value || 1),
      });
    }
    return out;
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const coin = HyperliquidPerpAdapter.toCoin(symbol);
    const { universe } = await this.fetchMetaAndCtxs();
    const assetIdx = universe.findIndex((u) => u.name.toUpperCase() === coin);
    if (assetIdx < 0) return;
    await this.postExchangeAction({
      type: 'updateLeverage',
      asset: assetIdx,
      isCross: true,
      leverage: Math.max(1, Math.min(50, Math.round(leverage))),
    }).catch(() => {});
  }

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const coin = HyperliquidPerpAdapter.toCoin(params.symbol);
    const { universe, ctxs } = await this.fetchMetaAndCtxs();
    const assetIdx = universe.findIndex((u) => u.name.toUpperCase() === coin);
    if (assetIdx < 0) {
      throw new Error(`Symbol ${coin} not listed on Hyperliquid Perps`);
    }
    const szDec = Number(universe[assetIdx]?.szDecimals ?? 3);
    const markPx = Number(ctxs[assetIdx]?.markPx || params.price || 0);
    if (!Number.isFinite(markPx) || markPx <= 0) {
      throw new Error(`Unable to fetch Hyperliquid mark price for ${coin}`);
    }

    await this.setLeverage(params.symbol, params.leverage);

    const isBuy = params.direction === 'LONG';
    const limitPx =
      params.type === 'LIMIT' && params.price && Number(params.price) > 0
        ? Number(params.price)
        : markPx * (isBuy ? 1.012 : 0.988);
    const pxStr = Number(limitPx.toPrecision(5)).toString();
    const szStr = Number(params.quantity).toFixed(Math.max(0, Math.min(6, szDec)));
    if (Number(szStr) <= 0) {
      throw new Error(`Order size too small for ${coin}`);
    }

    const res = await this.postExchangeAction({
      type: 'order',
      orders: [
        {
          a: assetIdx,
          b: isBuy,
          p: pxStr,
          s: szStr,
          r: false,
          t: { limit: { tif: params.type === 'LIMIT' ? 'Gtc' : 'Ioc' } },
        },
      ],
      grouping: 'na',
    });

    const st = res.response?.data?.statuses?.[0];
    if (st?.error) throw new Error(`Hyperliquid rejected: ${st.error}`);
    const filled = st?.filled;
    const resting = st?.resting;
    const oid = String(filled?.oid ?? resting?.oid ?? Date.now());
    const filledPx = filled?.avgPx ?? pxStr;
    const filledQty = filled?.totalSz ?? szStr;
    const feeEst = (Number(filledPx) * Number(filledQty) * 0.00035).toFixed(4);
    return {
      orderId: oid,
      clientOrderId: params.clientOrderId,
      filledPrice: filledPx,
      filledQty,
      fee: feeEst,
    };
  }

  async updatePositionStopLoss(): Promise<void> {
    // Reconciler tracks dynamic TP/SL/Trailing on Hyperliquid positions safely via reduce-only close orders
  }

  async closePositionPartialOrFull(
    symbol: string,
    direction: Direction,
    quantity: string,
    clientOrderId: string,
    _marketType?: MarketType
  ): Promise<OrderResult> {
    const coin = HyperliquidPerpAdapter.toCoin(symbol);
    const { universe, ctxs } = await this.fetchMetaAndCtxs();
    const assetIdx = universe.findIndex((u) => u.name.toUpperCase() === coin);
    if (assetIdx < 0) throw new Error(`Symbol ${coin} not listed on Hyperliquid`);
    const szDec = Number(universe[assetIdx]?.szDecimals ?? 3);
    const markPx = Number(ctxs[assetIdx]?.markPx || 0);
    if (markPx <= 0) throw new Error(`No mark price for ${coin}`);

    // Closing a LONG means SELL (isBuy = false); closing a SHORT means BUY (isBuy = true)
    const isBuy = direction === 'SHORT';
    const slippedPx = markPx * (isBuy ? 1.015 : 0.985);
    const pxStr = Number(slippedPx.toPrecision(5)).toString();
    const szStr = Number(quantity).toFixed(Math.max(0, Math.min(6, szDec)));

    const res = await this.postExchangeAction({
      type: 'order',
      orders: [
        {
          a: assetIdx,
          b: isBuy,
          p: pxStr,
          s: szStr,
          r: true,
          t: { limit: { tif: 'Ioc' } },
        },
      ],
      grouping: 'na',
    });

    const st = res.response?.data?.statuses?.[0];
    if (st?.error) throw new Error(`Hyperliquid close error: ${st.error}`);
    const filled = st?.filled;
    const filledPx = filled?.avgPx ?? pxStr;
    const filledQty = filled?.totalSz ?? szStr;
    return {
      orderId: String(filled?.oid ?? Date.now()),
      clientOrderId,
      filledPrice: filledPx,
      filledQty,
      fee: (Number(filledPx) * Number(filledQty) * 0.00035).toFixed(4),
    };
  }
}
