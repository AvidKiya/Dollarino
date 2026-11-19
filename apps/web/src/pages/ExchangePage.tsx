import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Play, Search, ShieldCheck } from 'lucide-react';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface MarketSnapshot {
  market24h: {
    symbol: string;
    lastPrice: string;
    changePct24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    fundingRate: string;
  };
  orderBook: { bids: [string, string][]; asks: [string, string][] };
  spreadPct: string;
  imbalancePct: string;
}

export function ExchangePage({
  lang,
  activeExchange,
  markets,
  onExecuted,
}: {
  lang: Lang;
  activeExchange: { provider: string; label: string };
  markets: ExchangeMarket[];
  onExecuted: () => Promise<void>;
}) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>('ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [leverage, setLeverage] = useState(10);
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [snap, setSnap] = useState<MarketSnapshot | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState('');
  const [marketSort, setMarketSort] = useState<'volume' | 'gainers' | 'losers'>('volume');

  const loadBook = async (forceReset = false) => {
    const res = await apiFetch<MarketSnapshot>(`/api/trading/market/overview?symbol=${symbol}&timeframe=15m`).catch(() => null);
    if (res) {
      setSnap(res);
      const px = Number(res.market24h.lastPrice);
      const dec = px >= 100 ? 2 : px >= 1 ? 4 : 6;
      if (forceReset || !stopLoss) {
        setStopLoss((direction === 'LONG' ? px * 0.99 : px * 1.01).toFixed(dec));
        setTp1((direction === 'LONG' ? px * 1.012 : px * 0.988).toFixed(dec));
        setTp2((direction === 'LONG' ? px * 1.022 : px * 0.978).toFixed(dec));
        setTp3((direction === 'LONG' ? px * 1.035 : px * 0.965).toFixed(dec));
      }
    }
  };

  useEffect(() => {
    void loadBook(true);
    const t = setInterval(() => void loadBook(false), 9000);
    return () => clearInterval(t);
  }, [symbol]);

  const filteredMarkets = useMemo(() => {
    const q = marketFilter.trim().toUpperCase();
    let list = markets;
    if (q) {
      list = list.filter((m) => m.symbol.includes(q) || m.base.includes(q) || m.exchangeSymbol.toUpperCase().includes(q));
    }
    if (marketSort === 'gainers') list = [...list].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    else if (marketSort === 'losers') list = [...list].sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    return list.slice(0, 60);
  }, [markets, marketFilter, marketSort]);

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await apiFetch<{ ok?: boolean; error?: string; tradeId?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        direction,
        orderType,
        marginMode,
        limitPrice: orderType === 'LIMIT' ? limitPrice : snap?.market24h.lastPrice,
        leverage,
        stopLoss,
        tp1,
        tp2: tp2 || undefined,
        tp3: tp3 || undefined,
        timeframe: '15m',
      }),
    });
    setMsg(
      res.pendingOrderId
        ? `Limit Order queued (${res.pendingOrderId})`
        : res.ok
          ? `Executed on ${activeExchange.provider.toUpperCase()} (${res.tradeId})`
          : res.error || 'Rejected'
    );
    await onExecuted();
  };

  const kcexPair = symbol.endsWith('USDT') ? `${symbol.slice(0, -4)}_USDT` : `${symbol}_USDT`;
  const toobitPair = symbol.endsWith('USDT') ? `${symbol.slice(0, -4)}-SWAP-USDT` : symbol;

  return (
    <div className="space-y-5">
      {/* Exchange Matrix Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {[
          {
            name: 'Toobit Futures',
            badge: 'LIVE REST + HMAC-SHA256',
            pair: toobitPair,
            fee: 'Maker 0.02% / Taker 0.05%',
            active: activeExchange.provider === 'toobit',
            href: `https://www.toobit.com/futures/${toobitPair}`,
          },
          {
            name: 'KCEX Futures',
            badge: '0% MAKER MIRROR + DEEP-LINK',
            pair: kcexPair,
            fee: 'Maker 0.00% / Taker 0.01%',
            active: activeExchange.provider === 'kcex',
            href: `https://www.kcex.com/futures/exchange/${kcexPair}`,
          },
          {
            name: 'Bitunix Futures',
            badge: 'CODEXBOT LIVE REST',
            pair: symbol,
            fee: 'Maker 0.02% / Taker 0.06%',
            active: activeExchange.provider === 'bitunix',
            href: `https://www.bitunix.com/contract-trade/${symbol}`,
          },
          {
            name: 'Paper Simulator',
            badge: 'LIVE QUOTES UNIVERSE',
            pair: symbol,
            fee: '0.05% Simulated Fee',
            active: activeExchange.provider === 'paper',
            href: '',
          },
        ].map((ex) => (
          <div
            key={ex.name}
            className={`p-4 rounded-2xl border ${
              ex.active ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-[#0e131d]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">{ex.name}</span>
              {ex.active && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="text-[10px] text-cyan-300 mt-1 font-mono-num">{ex.badge}</div>
            <div className="text-[11px] text-slate-400 mt-1">{ex.fee} · {ex.pair}</div>
            {ex.href && (
              <a href={ex.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] text-blue-300 hover:underline">
                <span>{lang === 'fa' ? 'باز کردن ترمینال وب' : 'Open Web Terminal'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* All Exchange Markets Live Screener */}
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              {lang === 'fa'
                ? `لیست کامل ارزهای صرافی ${activeExchange.provider.toUpperCase()} (${markets.length} جفت‌ارز زنده)`
                : `All ${activeExchange.provider.toUpperCase()} Perpetual Contracts (${markets.length} live pairs)`}
            </h3>
            <p className="text-[11px] text-slate-400">
              {lang === 'fa' ? 'روی هر ارز کلیک کنید تا دفتر سفارش و پنل ثبت معامله آن باز شود.' : 'Click any contract to load its live order book and 3-TP trade ticket.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute start-2.5 top-2.5" />
              <input
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
                placeholder={lang === 'fa' ? 'جستجو ارز...' : 'Search coin...'}
                className="bg-slate-950 border border-slate-800 rounded-xl ps-8 pe-3 py-1.5 w-44"
              />
            </div>
            {(['volume', 'gainers', 'losers'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setMarketSort(s)}
                className={`px-2.5 py-1.5 rounded-lg capitalize ${
                  marketSort === s ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto">
          {filteredMarkets.map((m) => {
            const pct = Number(m.changePct24h);
            const selected = m.symbol === symbol;
            return (
              <button
                key={m.symbol}
                onClick={() => {
                  setSymbol(m.symbol);
                  setStopLoss('');
                }}
                className={`p-2.5 rounded-xl border text-start transition ${
                  selected ? 'bg-emerald-500/15 border-emerald-500/50' : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-white truncate">{m.base}</span>
                  <span className="text-[10px] font-mono-num text-slate-400">{m.maxLeverage}x</span>
                </div>
                <div className="font-mono-num text-[11px] text-slate-200 mt-1">${m.lastPrice}</div>
                <div className={`font-mono-num text-[10px] ${pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Order Ticket + Order Book */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form onSubmit={submitOrder} className="lg:col-span-5 bg-[#0e131d] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              {lang === 'fa' ? 'ثبت دستی سفارش (Market / Limit)' : 'Manual Futures Order Ticket'}
            </h3>
            <span className="font-mono-num text-emerald-400 font-bold">${snap?.market24h.lastPrice ?? '—'}</span>
          </div>

          {msg && <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-200">{msg}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <SymbolPicker
              lang={lang}
              value={symbol}
              markets={markets}
              provider={activeExchange.provider}
              onChange={(sym) => {
                setSymbol(sym);
                setStopLoss('');
              }}
              compact
            />
            <select
              value={marginMode}
              onChange={(e) => setMarginMode(e.target.value as 'ISOLATED' | 'CROSS')}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5"
            >
              <option value="ISOLATED">ISOLATED</option>
              <option value="CROSS">CROSS</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('LONG')}
              className={`py-2 rounded-xl font-bold inline-flex items-center justify-center gap-1 ${
                direction === 'LONG' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" /> LONG
            </button>
            <button
              type="button"
              onClick={() => setDirection('SHORT')}
              className={`py-2 rounded-xl font-bold inline-flex items-center justify-center gap-1 ${
                direction === 'SHORT' ? 'bg-rose-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" /> SHORT
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')} className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
              <option value="MARKET">MARKET</option>
              <option value="LIMIT">LIMIT</option>
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num"
            />
            <input
              value={limitPrice}
              disabled={orderType === 'MARKET'}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={orderType === 'MARKET' ? 'Market' : 'Limit Px'}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num disabled:opacity-40"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-rose-400 block mb-1">Stop Loss</label>
              <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-emerald-400 block mb-1">TP1 (50%)</label>
              <input value={tp1} onChange={(e) => setTp1(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-amber-400 block mb-1">TP2 (25%)</label>
              <input value={tp2} onChange={(e) => setTp2(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-orange-400 block mb-1">TP3 (25%)</label>
              <input value={tp3} onChange={(e) => setTp3(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num" />
            </div>
          </div>

          <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold inline-flex items-center justify-center gap-1.5">
            <Play className="w-4 h-4" />
            <span>{lang === 'fa' ? 'اجرای سفارش در صرافی فعال' : 'Submit Order to Exchange'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-[#0e131d] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <h3 className="text-sm font-bold text-white">
                {lang === 'fa' ? `عمق بازار زنده (${symbol})` : `Live Order Book Depth (${symbol})`}
              </h3>
              <p className="text-slate-400 mt-0.5">
                Funding: {snap?.market24h.fundingRate ?? '0.01'}% · Spread: {snap?.spreadPct ?? '0.01'}% · Imbalance: {snap?.imbalancePct ?? '0'}%
              </p>
            </div>
            <span className="font-mono-num text-base font-bold text-emerald-400">${snap?.market24h.lastPrice ?? '—'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs font-mono-num">
            <div>
              <div className="text-emerald-400 font-semibold mb-2">Bids (Buy)</div>
              <div className="space-y-1">
                {(snap?.orderBook.bids ?? []).slice(0, 12).map(([p, q], i) => (
                  <div key={i} className="flex justify-between px-2 py-1 rounded-lg bg-emerald-500/10">
                    <span className="text-emerald-300">{p}</span>
                    <span className="text-slate-400">{Number(q).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-rose-400 font-semibold mb-2">Asks (Sell)</div>
              <div className="space-y-1">
                {(snap?.orderBook.asks ?? []).slice(0, 12).map(([p, q], i) => (
                  <div key={i} className="flex justify-between px-2 py-1 rounded-lg bg-rose-500/10">
                    <span className="text-rose-300">{p}</span>
                    <span className="text-slate-400">{Number(q).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
