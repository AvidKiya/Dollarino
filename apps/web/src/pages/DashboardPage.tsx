import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { Candle, SignalMixerResult, Timeframe } from '@dollarino/core';
import { CandlestickChart, type ChartLevels, type ChartOverlays } from '../components/CandlestickChart';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import { dict, type Lang } from '../lib/i18n';

export interface DashboardPayload {
  config: {
    bot_state: string;
    trading_mode: 'PAPER' | 'LIVE';
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    margin_mode?: 'ISOLATED' | 'CROSS';
    symbol: string;
    strategy_key: string;
    entry_timeframe: Timeframe;
    higher_timeframe: Timeframe;
    margin_pct: number;
    max_leverage: number;
    tp1_close_pct: number;
    tp2_close_pct: number;
    tp3_close_pct: number;
    auto_breakeven_on_tp1: number;
    move_sl_to_tp1_on_tp2: number;
    daily_max_loss_pct: number;
    max_open_positions: number;
    block_weekends: number;
    macro_blackout: number;
    ai_gate_enabled: number;
    ai_min_confidence: number;
    mixer_threshold?: number;
    mixer_weights_json?: string;
    strategy_flow_json?: string;
    webhook_secret: string;
    paper_balance: string;
  };
  activeExchange: { provider: string; label: string };
  activeAI: { provider: string; model: string } | null;
  balance: { free: string; used: string; total: string; currency: string };
  openTrades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    mark_price?: string;
    unrealized_pnl?: string;
    liq_price_est?: string;
    remaining_quantity: string;
    leverage: number;
    margin_used: string;
    current_stop_loss: string;
    tp1: string;
    tp2: string | null;
    tp3: string | null;
    tp1_hit: number;
    tp2_hit: number;
    risk_free_active: number;
    realized_pnl: string;
    mode: string;
    exchange_provider: string;
  }>;
  pendingOrders: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    order_type: string;
    price: string;
    quantity: string;
    leverage: number;
    stop_loss: string;
    tp1: string;
    strategy_key: string;
  }>;
  closedTrades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    exit_price: string;
    realized_pnl: string;
    exit_reason: string;
    closed_at: string;
    leverage: number;
  }>;
  stats: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    todayPnl: number;
    profitFactor: number;
  };
  charts: {
    hourlyPnl: Array<{ bucket: string; pnl: number }>;
    dailyPnl: Array<{ bucket: string; pnl: number }>;
    weeklyResults: Array<{ day: string; count: number; wins: number; pnl: number }>;
  };
  mixerSnapshot: SignalMixerResult | null;
}

interface MarketOverview {
  candles: Candle[];
  market24h: {
    symbol: string;
    lastPrice: string;
    changePct24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    fundingRate: string;
    bestBid: string;
    bestAsk: string;
  };
  orderBook: { bids: [string, string][]; asks: [string, string][] };
  spreadPct: string;
  imbalancePct: string;
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  indicators: {
    ema20: Array<{ time: number; value: number }>;
    ema50: Array<{ time: number; value: number }>;
    ema200: Array<{ time: number; value: number }>;
    rsi14: number;
    atr14: number;
  };
  mixer: SignalMixerResult;
}

export function DashboardPage({
  lang,
  data,
  markets,
  onRefresh,
}: {
  lang: Lang;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onRefresh: () => void;
}) {
  const t = dict[lang];
  const [symbol, setSymbol] = useState(data.config.symbol || 'BTCUSDT');
  const [tf, setTf] = useState<Timeframe>(data.config.entry_timeframe || '15m');
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [showEma, setShowEma] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'open' | 'pending' | 'closed' | 'weekly'>('open');

  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(Math.min(10, data.config.max_leverage || 10));
  const [sl, setSl] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [orderMsg, setOrderMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingPos, setEditingPos] = useState<DashboardPayload['openTrades'][0] | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp1, setEditTp1] = useState('');
  const [editTp2, setEditTp2] = useState('');
  const [editTp3, setEditTp3] = useState('');

  const fillAtrLevels = (px: number, atrVal: number, dir: 'LONG' | 'SHORT') => {
    const dec = px >= 100 ? 2 : px >= 1 ? 4 : 6;
    const step = Math.max(atrVal * 1.5, px * 0.006);
    if (dir === 'LONG') {
      setSl((px - step).toFixed(dec));
      setTp1((px + step * 1.5).toFixed(dec));
      setTp2((px + step * 2.5).toFixed(dec));
      setTp3((px + step * 4).toFixed(dec));
    } else {
      setSl((px + step).toFixed(dec));
      setTp1((px - step * 1.5).toFixed(dec));
      setTp2((px - step * 2.5).toFixed(dec));
      setTp3((px - step * 4).toFixed(dec));
    }
  };

  const loadMarket = async (forceFill = false) => {
    const res = await apiFetch<MarketOverview>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`).catch(() => null);
    if (res) {
      setOverview(res);
      const px = Number(res.market24h.lastPrice);
      const atr = res.indicators.atr14 || px * 0.008;
      if (forceFill || !sl || !tp1) {
        fillAtrLevels(px, atr, side);
      }
    }
  };

  useEffect(() => {
    void loadMarket(true);
    const id = setInterval(() => void loadMarket(false), 12000);
    return () => clearInterval(id);
  }, [symbol, tf]);

  const activeLevels = useMemo<ChartLevels | undefined>(() => {
    const match = data.openTrades.find((p) => p.symbol === symbol);
    if (!match) return undefined;
    return {
      entry: Number(match.entry_price),
      stopLoss: Number(match.current_stop_loss),
      tp1: Number(match.tp1),
      tp2: match.tp2 ? Number(match.tp2) : undefined,
      tp3: match.tp3 ? Number(match.tp3) : undefined,
    };
  }, [data.openTrades, symbol]);

  const overlays = useMemo<ChartOverlays | undefined>(() => {
    if (!showEma || !overview) return undefined;
    return {
      ema20: overview.indicators.ema20,
      ema50: overview.indicators.ema50,
      ema200: overview.indicators.ema200,
    };
  }, [showEma, overview]);

  const submitManualOrder = async () => {
    setBusy(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{ ok?: boolean; error?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          direction: side,
          orderType,
          marginMode,
          limitPrice: orderType === 'LIMIT' ? limitPrice : overview?.market24h.lastPrice,
          leverage: lev,
          stopLoss: sl,
          tp1,
          tp2,
          tp3,
          timeframe: tf,
        }),
      });
      setOrderMsg(
        res.pendingOrderId
          ? `Limit order queued (${res.pendingOrderId})`
          : res.ok
            ? `Order filled successfully!`
            : res.error || 'Rejected by Risk Engine'
      );
      onRefresh();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    onRefresh();
  };

  const reconcilePositions = async () => {
    await apiFetch('/api/trading/positions/reconcile', { method: 'POST' });
    onRefresh();
  };

  const saveEditTpSl = async () => {
    if (!editingPos) return;
    await apiFetch(`/api/trading/positions/${editingPos.id}/tpsl`, {
      method: 'PATCH',
      body: JSON.stringify({
        stopLoss: editSl,
        tp1: editTp1,
        tp2: editTp2 || undefined,
        tp3: editTp3 || undefined,
      }),
    });
    setEditingPos(null);
    onRefresh();
  };

  const totalUnrealized = data.openTrades.reduce((s, p) => s + Number(p.unrealized_pnl ?? 0), 0);
  const lastPx = Number(overview?.market24h.lastPrice ?? 0);
  const chgPct = Number(overview?.market24h.changePct24h ?? 0);
  const freeBal = Number(data.balance.free || 0);
  const estMarginUsd = freeBal * (data.config.margin_pct / 100);
  const estNotionalUsd = estMarginUsd * lev;
  const entryRef = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : lastPx;
  const riskDist = Math.abs(entryRef - Number(sl || 0));
  const rewardDist = Math.abs(Number(tp1 || 0) - entryRef);
  const estRr = riskDist > 0 ? (rewardDist / riskDist).toFixed(2) : '—';

  return (
    <div className="space-y-4">
      {/* Live 24h Market Ticker Strip with Full Exchange Coin Search */}
      <div className="bg-[#0e131d] border border-slate-800/90 rounded-2xl px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SymbolPicker
            lang={lang}
            value={symbol}
            markets={markets}
            provider={data.activeExchange.provider}
            onChange={(sym) => {
              setSymbol(sym);
              setSl('');
              setTp1('');
            }}
          />

          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold font-mono-num text-white">
              ${lastPx ? (lastPx >= 1 ? lastPx.toLocaleString() : lastPx.toFixed(6)) : '—'}
            </span>
            <span className={`text-xs font-mono-num font-semibold ${chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {chgPct >= 0 ? '+' : ''}
              {chgPct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="hidden sm:block">
            <div className="text-[10px] text-slate-400">24h High / Low</div>
            <div className="font-mono-num text-slate-200">
              {overview?.market24h.high24h ?? '—'} / {overview?.market24h.low24h ?? '—'}
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] text-slate-400">24h Volume</div>
            <div className="font-mono-num text-slate-200">${overview?.market24h.volume24h ?? '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Funding</div>
            <div className="font-mono-num text-amber-300">{overview?.market24h.fundingRate ?? '0.0100'}%</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-slate-400">RSI(14) · HTF</div>
            <div className="font-mono-num text-cyan-300">
              {overview?.indicators.rsi14 ?? '—'} · {overview?.htfTrend ?? 'NEUTRAL'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {(['1m', '5m', '15m', '30m', '1h', '4h'] as Timeframe[]).map((item) => (
              <button
                key={item}
                onClick={() => setTf(item)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium ${
                  tf === item ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Strip + 8-Channel Signal Mixer Live Gauge */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="text-[11px] text-slate-400">{t.freeBalance}</div>
          <div className="text-base sm:text-lg font-bold font-mono-num text-emerald-400 mt-0.5">${freeBal.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500">{t.usedBalance}: ${Number(data.balance.used).toLocaleString()}</div>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="text-[11px] text-slate-400">{lang === 'fa' ? 'سود/ضرر باز' : 'Unrealized PnL'}</div>
          <div className={`text-base sm:text-lg font-bold font-mono-num mt-0.5 ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">{data.openTrades.length} {lang === 'fa' ? 'پوزیشن' : 'open'}</div>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="text-[11px] text-slate-400">{t.todayPnl}</div>
          <div className={`text-base sm:text-lg font-bold font-mono-num mt-0.5 ${data.stats.todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {data.stats.todayPnl >= 0 ? '+' : ''}${data.stats.todayPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">Cap: -{data.config.daily_max_loss_pct}%</div>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="text-[11px] text-slate-400">{t.totalPnl}</div>
          <div className={`text-base sm:text-lg font-bold font-mono-num mt-0.5 ${data.stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {data.stats.totalPnl >= 0 ? '+' : ''}${data.stats.totalPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">{data.stats.totalTrades} trades</div>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="text-[11px] text-slate-400">{t.winRate} / PF</div>
          <div className="text-base sm:text-lg font-bold font-mono-num text-blue-400 mt-0.5">
            {data.stats.winRate.toFixed(1)}% · {data.stats.profitFactor.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">3-TP [{data.config.tp1_close_pct}/{data.config.tp2_close_pct}/{data.config.tp3_close_pct}]</div>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{lang === 'fa' ? 'میکسر ۸ کاناله' : '8-Ch Mixer'}</span>
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-base sm:text-lg font-bold font-mono-num text-white">
              {overview?.mixer.confidence ?? data.mixerSnapshot?.confidence ?? 50}%
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                (overview?.mixer.direction ?? data.mixerSnapshot?.direction) === 'LONG'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : (overview?.mixer.direction ?? data.mixerSnapshot?.direction) === 'SHORT'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {overview?.mixer.direction ?? data.mixerSnapshot?.direction ?? 'NONE'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            Score: {overview?.mixer.compositeScore ?? data.mixerSnapshot?.compositeScore ?? 0}
          </div>
        </div>
      </div>

      {/* Main 12-Column Trading Cockpit */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left/Center: Chart + Positions Workspace */}
        <div className="xl:col-span-8 space-y-4">
          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-white">{symbol} · {tf}</span>
                <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)} />
                  <span>EMA 20/50/200</span>
                </label>
              </div>
              <button
                onClick={reconcilePositions}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{lang === 'fa' ? 'چک لحظه‌ای TP/SL' : 'Sync 3-TP / SL'}</span>
              </button>
            </div>
            <CandlestickChart candles={overview?.candles ?? []} levels={activeLevels} overlays={overlays} height={360} />
          </div>

          {/* Open / Pending / Closed / Weekly Tabs */}
          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-800 pb-2 text-xs">
              {[
                { id: 'open', label: `${lang === 'fa' ? 'پوزیشن باز' : 'Open'} (${data.openTrades.length})` },
                { id: 'pending', label: `${lang === 'fa' ? 'لیمیت' : 'Limit'} (${data.pendingOrders.length})` },
                { id: 'closed', label: `${lang === 'fa' ? 'بسته‌شده' : 'Closed'} (${data.closedTrades.length})` },
                { id: 'weekly', label: lang === 'fa' ? 'هفتگی' : 'Weekly' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg font-medium ${
                    activeSubTab === tab.id ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeSubTab === 'open' && (
              <>
                {data.openTrades.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    {lang === 'fa' ? 'هیچ پوزیشن بازی ندارید.' : 'No open positions.'}
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2.5 text-xs">
                      {data.openTrades.map((p) => {
                        const upnl = Number(p.unrealized_pnl ?? 0);
                        return (
                          <div key={p.id} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">{p.symbol}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                  {p.direction} {p.leverage}x
                                </span>
                                {p.risk_free_active === 1 && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                              </div>
                              <span className={`font-mono-num font-bold ${upnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {upnl >= 0 ? '+' : ''}${upnl.toFixed(2)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[11px] font-mono-num text-slate-300">
                              <div>Entry: {p.entry_price}</div>
                              <div className="text-cyan-300">Mark: {p.mark_price ?? p.entry_price}</div>
                              <div className="text-rose-400">SL: {p.current_stop_loss}</div>
                              <div className="text-emerald-400">TP1: {p.tp1}</div>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => {
                                  setEditingPos(p);
                                  setEditSl(p.current_stop_loss);
                                  setEditTp1(p.tp1);
                                  setEditTp2(p.tp2 || '');
                                  setEditTp3(p.tp3 || '');
                                }}
                                className="flex-1 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-medium"
                              >
                                Edit TP/SL
                              </button>
                              <button onClick={() => closePosition(p.id)} className="flex-1 py-1.5 rounded-lg bg-rose-600/25 text-rose-300 font-semibold">
                                Close
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-slate-400 border-b border-slate-800/80">
                          <tr>
                            <th className="py-2 px-2 text-start">Pair</th>
                            <th className="py-2 px-2 text-start">Entry / Mark / Liq</th>
                            <th className="py-2 px-2 text-start">SL / 3-TP</th>
                            <th className="py-2 px-2 text-start">uPnL</th>
                            <th className="py-2 px-2 text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 font-mono-num">
                          {data.openTrades.map((p) => {
                            const upnl = Number(p.unrealized_pnl ?? 0);
                            return (
                              <tr key={p.id}>
                                <td className="py-2.5 px-2">
                                  <div className="font-bold text-white">{p.symbol}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                                      {p.direction} {p.leverage}x
                                    </span>
                                    {p.risk_free_active === 1 && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300">
                                        <ShieldCheck className="w-3 h-3" /> RF
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-2">
                                  <div>Entry: {p.entry_price}</div>
                                  <div className="text-cyan-300">Mark: {p.mark_price ?? p.entry_price}</div>
                                  <div className="text-[10px] text-amber-400">Liq~ {p.liq_price_est}</div>
                                </td>
                                <td className="py-2.5 px-2 text-[11px]">
                                  <div className="text-rose-400">SL: {p.current_stop_loss}</div>
                                  <div className="text-emerald-400">
                                    {p.tp1_hit ? '✓' : ''}TP1: {p.tp1} {p.tp2 ? `· ${p.tp2_hit ? '✓' : ''}TP2: ${p.tp2}` : ''} {p.tp3 ? `· TP3: ${p.tp3}` : ''}
                                  </div>
                                </td>
                                <td className={`py-2.5 px-2 font-bold ${upnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {upnl >= 0 ? '+' : ''}${upnl.toFixed(2)}
                                </td>
                                <td className="py-2.5 px-2 text-end space-x-1 space-x-reverse">
                                  <button
                                    onClick={() => {
                                      setEditingPos(p);
                                      setEditSl(p.current_stop_loss);
                                      setEditTp1(p.tp1);
                                      setEditTp2(p.tp2 || '');
                                      setEditTp3(p.tp3 || '');
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>TP/SL</span>
                                  </button>
                                  <button
                                    onClick={() => closePosition(p.id)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>Close</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {activeSubTab === 'pending' && (
              <div className="space-y-2 text-xs">
                {data.pendingOrders.length === 0 ? (
                  <div className="py-6 text-center text-slate-500">No pending limit orders.</div>
                ) : (
                  data.pendingOrders.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 font-mono-num">
                      <div>
                        <span className="font-bold text-white">{o.symbol}</span> · {o.direction} {o.leverage}x @ {o.price}
                      </div>
                      <button
                        onClick={async () => {
                          await apiFetch(`/api/trading/pending/${o.id}`, { method: 'DELETE' });
                          onRefresh();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600/40"
                      >
                        Cancel
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeSubTab === 'closed' && (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 text-start">Pair</th>
                      <th className="py-2 text-start">Entry → Exit</th>
                      <th className="py-2 text-start">Reason</th>
                      <th className="py-2 text-end">PnL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono-num">
                    {data.closedTrades.map((c) => {
                      const pnl = Number(c.realized_pnl);
                      return (
                        <tr key={c.id}>
                          <td className="py-2 font-semibold">{c.symbol} · {c.direction} {c.leverage}x</td>
                          <td className="py-2 text-slate-300">{c.entry_price} → {c.exit_price}</td>
                          <td className="py-2 text-slate-400">{c.exit_reason}</td>
                          <td className={`py-2 text-end font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeSubTab === 'weekly' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs">
                {data.charts.weeklyResults.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-slate-500">No closed trades in last 7 days yet.</div>
                ) : (
                  data.charts.weeklyResults.map((w) => (
                    <div key={w.day} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                      <div className="text-[10px] text-slate-400">{w.day}</div>
                      <div className={`text-sm font-bold font-mono-num mt-1 ${w.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {w.pnl >= 0 ? '+' : ''}${w.pnl.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{w.wins}/{w.count} wins</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Ticket + Order Book Depth */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-white">{lang === 'fa' ? 'ثبت سریع سفارش (۳ تارگت)' : 'Quick 3-TP Order Ticket'}</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{data.activeExchange.provider.toUpperCase()}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSide('LONG');
                  if (overview) fillAtrLevels(Number(overview.market24h.lastPrice), overview.indicators.atr14, 'LONG');
                }}
                className={`py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 ${
                  side === 'LONG' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" /> LONG
              </button>
              <button
                onClick={() => {
                  setSide('SHORT');
                  if (overview) fillAtrLevels(Number(overview.market24h.lastPrice), overview.indicators.atr14, 'SHORT');
                }}
                className={`py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 ${
                  side === 'SHORT' ? 'bg-rose-500 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                <ArrowDownRight className="w-4 h-4" /> SHORT
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex rounded-xl bg-slate-950 border border-slate-800 p-0.5">
                {(['MARKET', 'LIMIT'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOrderType(m)}
                    className={`flex-1 py-1.5 rounded-lg font-medium ${orderType === m ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex rounded-xl bg-slate-950 border border-slate-800 p-0.5">
                {(['ISOLATED', 'CROSS'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarginMode(m)}
                    className={`flex-1 py-1.5 rounded-lg font-medium ${marginMode === m ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {orderType === 'LIMIT' && (
              <div>
                <label className="text-slate-400 block mb-1">Limit Entry Price</label>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={overview?.market24h.lastPrice}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Leverage</span>
                <span className="font-mono-num text-amber-300 font-bold">{lev}x</span>
              </div>
              <input type="range" min={1} max={data.config.max_leverage || 50} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-rose-400 block mb-1">Stop Loss</label>
                <input value={sl} onChange={(e) => setSl(e.target.value)} className="w-full bg-slate-950 border border-rose-500/30 rounded-xl px-2.5 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-emerald-400 block mb-1">TP1 ({data.config.tp1_close_pct}%)</label>
                <input value={tp1} onChange={(e) => setTp1(e.target.value)} className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl px-2.5 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-yellow-400 block mb-1">TP2 ({data.config.tp2_close_pct}%)</label>
                <input value={tp2} onChange={(e) => setTp2(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-orange-400 block mb-1">TP3 ({data.config.tp3_close_pct}%)</label>
                <input value={tp3} onChange={(e) => setTp3(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono-num" />
              </div>
            </div>

            <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800/80 font-mono-num text-[11px] text-slate-300">
              <span>Margin: ${estMarginUsd.toFixed(1)} · Size: ${estNotionalUsd.toFixed(0)}</span>
              <span className="text-cyan-300">R:R 1:{estRr}</span>
            </div>

            {orderMsg && <div className="text-[11px] px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300">{orderMsg}</div>}

            <button
              disabled={busy}
              onClick={submitManualOrder}
              className={`w-full py-2.5 rounded-xl font-bold text-sm transition ${
                side === 'LONG' ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' : 'bg-rose-500 hover:bg-rose-400 text-white'
              }`}
            >
              {busy ? '...' : `${side} ${symbol} (${orderType})`}
            </button>
          </div>

          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>{lang === 'fa' ? 'دفتر سفارش زنده' : 'Live Order Book'}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono-num">
                Sprd: {overview?.spreadPct ?? '0.01'}% · Imb: {overview?.imbalancePct ?? '0'}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 font-mono-num text-[11px]">
              <div className="space-y-1">
                <div className="text-emerald-400 font-semibold">Bids</div>
                {(overview?.orderBook.bids ?? []).slice(0, 6).map(([p, q], i) => (
                  <div key={i} className="flex justify-between px-1.5 py-0.5 rounded bg-emerald-500/10">
                    <span className="text-emerald-300">{p}</span>
                    <span className="text-slate-400">{Number(q).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-rose-400 font-semibold">Asks</div>
                {(overview?.orderBook.asks ?? []).slice(0, 6).map(([p, q], i) => (
                  <div key={i} className="flex justify-between px-1.5 py-0.5 rounded bg-rose-500/10">
                    <span className="text-rose-300">{p}</span>
                    <span className="text-slate-400">{Number(q).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'fa' ? 'نمودار سود/ضرر روزانه' : 'Daily PnL Curve'}</span>
            </div>
            <div className="flex items-end gap-1 h-16 pt-2">
              {(data.charts.dailyPnl.length ? data.charts.dailyPnl : [{ bucket: 'Today', pnl: 0 }]).map((d, i) => {
                const maxAbs = Math.max(10, ...data.charts.dailyPnl.map((x) => Math.abs(x.pnl)));
                const h = Math.max(12, Math.round((Math.abs(d.pnl) / maxAbs) * 56));
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.bucket}: $${d.pnl.toFixed(2)}`}>
                    <div style={{ height: `${h}px` }} className={`w-full rounded-t ${d.pnl >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editingPos && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0e131d] border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-3 text-xs">
            <div className="font-bold text-sm text-white">Edit SL / 3-TP — {editingPos.symbol}</div>
            <div>
              <label className="text-rose-400 block mb-1">Stop Loss</label>
              <input value={editSl} onChange={(e) => setEditSl(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-emerald-400 block mb-1">TP1</label>
              <input value={editTp1} onChange={(e) => setEditTp1(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">TP2</label>
                <input value={editTp2} onChange={(e) => setEditTp2(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">TP3</label>
                <input value={editTp3} onChange={(e) => setEditTp3(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditingPos(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">Cancel</button>
              <button onClick={saveEditTpSl} className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
