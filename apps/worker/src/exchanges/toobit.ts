import type { Candle, Direction, InstrumentSpec, Timeframe } from '@dollarino/core';
import { hmacSha256Hex } from '../crypto.js';
import type { ExchangePosition, FuturesBalance, IExchangeAdapter, Market24hStats, OrderResult, PlaceOrderParams } from './base.js';
import { findMarketSpec, normalizeCanonicalSymbol } from './markets.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook, fetchPublicTickerPrice } from './paper.js';

export interface ToobitCredentials {
  apiKey: string;
  apiSecret: string;
}

/**
 * Official Toobit USDT-M Futures REST API v1/v2 adapter (https://api.toobit.com).
 * Auth: header `X-BB-APIKEY` + lowercase hex HMAC-SHA256 over queryString.
 */
export class ToobitFuturesAdapter implements IExchangeAdapter {
  readonly provider = 'toobit' as const;
  private readonly baseUrl = 'https://api.toobit.com';

  constructor(private creds: ToobitCredentials) {}

  static toContractSymbol(symbol: string): string {
    if (symbol.toUpperCase().includes('-SWAP-')) return symbol.toUpperCase();
    const clean = normalizeCanonicalSymbol(symbol);
    if (clean.endsWith('USDT')) return `${clean.slice(0, -4)}-SWAP-USDT`;
    return `${clean}-SWAP-USDT`;
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<T> {
    const allParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') allParams[k] = String(v);
    }
    allParams.timestamp = String(Date.now());
    allParams.recvWindow = '5000';

    const queryString = new URLSearchParams(allParams).toString();
    const signature = await hmacSha256Hex(queryString, this.creds.apiSecret);
    const fullQuery = `${queryString}&signature=${signature}`;

    const url = method === 'GET' || method === 'DELETE'
      ? `${this.baseUrl}${path}?${fullQuery}`
      : `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'X-BB-APIKEY': this.creds.apiKey,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: method === 'POST' ? fullQuery : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Toobit HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const errObj = json as { msg?: string; code?: number };
      throw new Error(`Toobit API Error ${errObj.code ?? res.status}: ${errObj.msg ?? text.slice(0, 200)}`);
    }
    return json as T;
  }

  async testConnection() {
    try {
      const balance = await this.getBalance();
      return { ok: true, message: 'Connected to Toobit USDT-M Futures API', balance };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Toobit connection failed' };
    }
  }

  async getBalance(): Promise<FuturesBalance> {
    const rows = await this.signedRequest<
      Array<{
        asset?: string;
        coin?: string;
        availableBalance?: string;
        available?: string;
        balance?: string;
        total?: string;
        positionMargin?: string;
        orderMargin?: string;
      }>
    >('GET', '/api/v1/futures/balance');

    const list = Array.isArray(rows) ? rows : [];
    const usdt = list.find((r) => (r.asset ?? r.coin ?? '').toUpperCase() === 'USDT') ?? list[0];
    const free = Number(usdt?.availableBalance ?? usdt?.available ?? 0);
    const used = Number(usdt?.positionMargin ?? 0) + Number(usdt?.orderMargin ?? 0);
    const total = Number(usdt?.balance ?? usdt?.total ?? free + used);

    return {
      free: free.toFixed(2),
      used: used.toFixed(2),
      total: total.toFixed(2),
      currency: 'USDT',
    };
  }

  async getTickerPrice(symbol: string): Promise<string> {
    return fetchPublicTickerPrice(symbol);
  }

  async getMarket24h(symbol: string): Promise<Market24hStats> {
    return fetchPublicMarket24h(symbol);
  }

  async getKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    return fetchPublicKlines(symbol, timeframe, limit);
  }

  async getOrderBook(symbol: string, limit = 15): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return fetchPublicOrderBook(symbol, limit);
  }

  async getInstrumentSpec(symbol: string): Promise<InstrumentSpec> {
    const contract = ToobitFuturesAdapter.toContractSymbol(symbol);
    const live = await findMarketSpec('toobit', symbol).catch(() => undefined);
    if (live) {
      return {
        symbol: live.exchangeSymbol || contract,
        basePrecision: live.basePrecision,
        quotePrecision: live.quotePrecision,
        minTradeVolume: live.minTradeVolume,
        maxMarketVolume: '1000000',
        minLeverage: 1,
        maxLeverage: live.maxLeverage,
        contractMultiplier: '1',
        status: live.status === 'TRADING' || !live.status ? 'OPEN' : 'HALTED',
      };
    }
    return {
      symbol: contract,
      basePrecision: 3,
      quotePrecision: 2,
      minTradeVolume: '0.001',
      maxMarketVolume: '100',
      minLeverage: 1,
      maxLeverage: 50,
      status: 'OPEN',
    };
  }

  async getPositions(symbol?: string): Promise<ExchangePosition[]> {
    const rows = await this.signedRequest<
      Array<{
        symbol: string;
        side: 'LONG' | 'SHORT';
        position: string;
        avgPrice: string;
        markPrice?: string;
        unrealizedPnl?: string;
        leverage?: string | number;
      }>
    >('GET', '/api/v1/futures/positions', symbol ? { symbol: ToobitFuturesAdapter.toContractSymbol(symbol) } : {});

    return (Array.isArray(rows) ? rows : [])
      .filter((p) => Number(p.position ?? 0) > 0)
      .map((p) => ({
        symbol: p.symbol,
        direction: p.side,
        quantity: String(p.position),
        entryPrice: String(p.avgPrice),
        markPrice: String(p.markPrice ?? p.avgPrice),
        unrealizedPnl: String(p.unrealizedPnl ?? '0'),
        leverage: Number(p.leverage ?? 1),
      }));
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedRequest('POST', '/api/v1/futures/leverage', {
      symbol: ToobitFuturesAdapter.toContractSymbol(symbol),
      leverage: String(leverage),
    });
  }

  async placeMarketOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const contract = ToobitFuturesAdapter.toContractSymbol(params.symbol);
    await this.setLeverage(params.symbol, params.leverage);
    const side = params.direction === 'LONG' ? 'BUY_OPEN' : 'SELL_OPEN';

    const resp = await this.signedRequest<{
      orderId?: string | number;
      clientOrderId?: string;
      avgPrice?: string;
      executedQty?: string;
    }>('POST', '/api/v1/futures/order', {
      symbol: contract,
      side,
      type: params.type,
      priceType: params.type === 'MARKET' ? 'MARKET' : 'INPUT',
      quantity: params.quantity,
      price: params.type === 'LIMIT' ? params.price : undefined,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      newClientOrderId: params.clientOrderId,
    });

    const filledPrice = resp.avgPrice && Number(resp.avgPrice) > 0
      ? resp.avgPrice
      : await this.getTickerPrice(params.symbol);

    return {
      orderId: String(resp.orderId ?? `tb_${Date.now()}`),
      clientOrderId: resp.clientOrderId ?? params.clientOrderId,
      filledPrice,
      filledQty: resp.executedQty ?? params.quantity,
      fee: '0',
    };
  }

  async updatePositionStopLoss(symbol: string, direction: Direction, stopLoss: string, takeProfit?: string): Promise<void> {
    await this.signedRequest('POST', '/api/v1/futures/position/trading-stop', {
      symbol: ToobitFuturesAdapter.toContractSymbol(symbol),
      side: direction,
      stopLoss,
      takeProfit,
    });
  }

  async closePositionPartialOrFull(symbol: string, direction: Direction, quantity: string, clientOrderId: string): Promise<OrderResult> {
    const contract = ToobitFuturesAdapter.toContractSymbol(symbol);
    const side = direction === 'LONG' ? 'SELL_CLOSE' : 'BUY_CLOSE';
    const resp = await this.signedRequest<{ orderId?: string; avgPrice?: string; executedQty?: string }>(
      'POST',
      '/api/v1/futures/order',
      {
        symbol: contract,
        side,
        type: 'MARKET',
        priceType: 'MARKET',
        quantity,
        newClientOrderId: clientOrderId,
      }
    );
    return {
      orderId: String(resp.orderId ?? `tb_cls_${Date.now()}`),
      clientOrderId,
      filledPrice: resp.avgPrice ?? await this.getTickerPrice(symbol),
      filledQty: resp.executedQty ?? quantity,
      fee: '0',
    };
  }
}
