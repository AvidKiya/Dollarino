import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CandlestickChart as CandleIcon,
  History,
  Layers,
  Send,
  ShieldCheck,
  Target,
  X,
  Zap,
} from 'lucide-react';
import type { Candle, Timeframe } from '@dollarino/core';
import { CandlestickChart, type ChartLevels, type ChartOverlays, type KbosChartOverlays } from '../components/CandlestickChart';
import { CoinIcon } from '../components/CoinIcon';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload } from '../lib/types';

interface OverviewResponse {
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
  candles: Candle[];
  indicators: {
    ema20: Array<{ time: number; value: number }>;
    ema50: Array<{ time: number; value: number }>;
    ema200: Array<{ time: number; value: number }>;
  };
  kbosOverlays?: KbosChartOverlays;
}

interface ChartAIResult {
  summary: string;
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rrRatio?: number;
  supports?: number[];
  resistances?: number[];
}

function fmtPx(v?: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export function TerminalPage({
  lang,
  symbol,
  setSymbol,
  data,
  markets,
  onRefresh,
}: {
  lang: Lang;
  symbol: string;
  setSymbol: (sym: string) => void;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [tf, setTf] = useState<Timeframe>('15m');
  const [rightIntel, setRightIntel] = useState<'ai' | 'book'>('ai');
  const [snap, setSnap] = useState<OverviewResponse | null>(null);

  // Order ticket state
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(10);
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');

  // Chart AI state
  const [prompt, setPrompt] = useState(
    isFa
      ? 'ساختار چارت، حمایت و مقاومت‌ها، و ستاپ ورود همراه با حد ضرر و ۳ تارگت را مشخص کن.'
      : 'Analyze trend structure, S/R zones, and draw Entry / SL / TP1-TP3 levels.'
  );
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; title: string; symbol: string; timeframe: string }>>([]);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [aiAnalysis, setAiAnalysis] = useState<ChartAIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const applyAutoLevels = (px: number, dir: 'LONG' | 'SHORT') => {
    if (!Number.isFinite(px) || px <= 0) return;
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    setStopLoss((dir === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec));
    setTp1((dir === 'LONG' ? px * 1.02 : px * 0.98).toFixed(dec));
    setTp2((dir === 'LONG' ? px * 1.035 : px * 0.965).toFixed(dec));
    setTp3((dir === 'LONG' ? px * 1.055 : px * 0.945).toFixed(dec));
  };

  const loadMarket = async (forceResetLevels = false) => {
    const [ov, chats] = await Promise.all([
      apiFetch<OverviewResponse>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`).catch(() => null),
      apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats').catch(() => ({
        chats: [],
      })),
    ]);
    if (ov) {
      setSnap(ov);
      const px = Number(ov.market24h.lastPrice || 0);
      if (forceResetLevels || !stopLoss) applyAutoLevels(px, side);
    }
    setChatHistory(chats.chats);
  };

  useEffect(() => {
    void loadMarket(true);
    const iv = setInterval(() => void loadMarket(false), 10_000);
    return () => clearInterval(iv);
  }, [symbol, tf]);

  const askChartAI = async (customPrompt?: string) => {
    const q = customPrompt ?? prompt;
    setAiLoading(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{
        chatId: string;
        analysis: ChartAIResult;
        messages: Array<{ role: string; content: string }>;
      }>('/api/chart-ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ chatId, symbol, timeframe: tf, prompt: q }),
      });
      setChatId(res.chatId);
      setAiAnalysis(res.analysis);
      setMessages(res.messages);
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : 'Chart AI error');
    } finally {
      setAiLoading(false);
    }
  };

  const copyAiLevelsToTicket = () => {
    if (!aiAnalysis) return;
    const dir = aiAnalysis.direction ?? (aiAnalysis.bias === 'SHORT' ? 'SHORT' : 'LONG');
    setSide(dir);
    if (aiAnalysis.stopLoss) setStopLoss(String(aiAnalysis.stopLoss));
    if (aiAnalysis.tp1) setTp1(String(aiAnalysis.tp1));
    if (aiAnalysis.tp2) setTp2(String(aiAnalysis.tp2));
    if (aiAnalysis.tp3) setTp3(String(aiAnalysis.tp3));
    setOrderMsg(isFa ? 'سطوح پیشنهادی چارت AI به فرم سفارش منتقل شد ✅' : 'AI levels copied to order ticket ✅');
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; error?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          direction: side,
          orderType,
          limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
          leverage: lev,
          marginMode,
          stopLoss,
          tp1,
          tp2: tp2 || undefined,
          tp3: tp3 || undefined,
        }),
      });
      setOrderMsg(
        res.ok
          ? res.pendingOrderId
            ? isFa ? 'سفارش لیمیت ثبت شد ✅' : 'Limit order queued ✅'
            : isFa ? 'معامله با موفقیت باز شد ✅' : 'Position opened ✅'
          : res.error || 'Rejected'
      );
      await onRefresh();
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closePosition = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    await onRefresh();
  };

  const lastPx = Number(snap?.market24h.lastPrice || 0);
  const chg24 = Number(snap?.market24h.changePct24h || 0);
  const freeCash = Number(data.balance.free || 0);
  const marginEst = (freeCash * Number(data.config.margin_pct || 5)) / 100;

  const chartOverlays: ChartOverlays | undefined = useMemo(() => {
    if (!snap?.indicators) return undefined;
    return snap.indicators;
  }, [snap?.indicators]);

  const chartLevels: ChartLevels = useMemo(() => {
    const pos = data.openTrades.find((p) => p.symbol === symbol);
    if (aiAnalysis && (aiAnalysis.entry || aiAnalysis.stopLoss || aiAnalysis.tp1)) {
      return {
        entry: aiAnalysis.entry,
        stopLoss: aiAnalysis.stopLoss,
        tp1: aiAnalysis.tp1,
        tp2: aiAnalysis.tp2,
        tp3: aiAnalysis.tp3,
        supports: aiAnalysis.supports,
        resistances: aiAnalysis.resistances,
      };
    }
    return {
      entry: pos ? Number(pos.entry_price) : undefined,
      stopLoss: pos ? Number(pos.current_stop_loss) : undefined,
      tp1: pos ? Number(pos.tp1) : undefined,
      tp2: pos?.tp2 ? Number(pos.tp2) : undefined,
      tp3: pos?.tp3 ? Number(pos.tp3) : undefined,
    };
  }, [aiAnalysis, data.openTrades, symbol]);

  return (
    <div className="space-y-4">
      {/* Header Bar (timetrade.live PRO TERMINAL style) */}
      <div className="panel rounded-[24px] px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SymbolPicker
            lang={lang}
            markets={markets}
            value={symbol}
            provider={data.activeExchange?.provider || 'paper'}
            onChange={(sym) => setSymbol(sym)}
          />

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSymbol(s)}
                className={`px-3 py-1 rounded-full text-xs font-black transition shrink-0 ${
                  symbol === s ? 'btn-gold' : 'btn-ghost text-dim'
                }`}
              >
                {s.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-dim block text-[10px]">{isFa ? 'قیمت لحظه‌ای' : 'Last Price'}</span>
            <span dir="ltr" className="font-num font-bold text-base text-main">${fmtPx(lastPx)}</span>
          </div>
          <div>
            <span className="text-dim block text-[10px]">{isFa ? 'تغییر ۲۴س' : '24h Change'}</span>
            <span dir="ltr" className={`font-num font-bold ${chg24 >= 0 ? 'text-jade' : 'text-loss'}`}>
              {chg24 >= 0 ? '+' : ''}{chg24.toFixed(2)}%
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="text-dim block text-[10px]">{isFa ? 'فاندینگ' : 'Funding'}</span>
            <span dir="ltr" className="font-num font-bold text-main">
              {snap?.market24h.fundingRate ?? '0.008%'}
            </span>
          </div>
          <div className="flex gap-1">
            {(['1m', '5m', '15m', '1h', '4h'] as Timeframe[]).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTf(x)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  tf === x ? 'btn-gold' : 'btn-ghost text-dim'
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 3-Column TimeTrade Pro Terminal Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left/Center Chart (6 cols on xl) */}
        <div className="xl:col-span-6 panel rounded-[26px] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CandleIcon className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <span className="font-bold text-main">{symbol} · Perpetual · {tf}</span>
            </div>
            <button
              type="button"
              onClick={() => void askChartAI()}
              disabled={aiLoading}
              className="btn-gold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1.5"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>{aiLoading ? '...' : isFa ? 'تحلیل فوری AI روی چارت' : 'AI Analyze Chart'}</span>
            </button>
          </div>

          {snap?.candles?.length ? (
            <CandlestickChart
              candles={snap.candles}
              overlays={chartOverlays}
              kbosOverlays={snap.kbosOverlays}
              levels={chartLevels}
              height={430}
            />
          ) : (
            <div className="h-[430px] grid place-items-center text-xs text-dim">
              {isFa ? 'در حال بارگذاری کندل‌های زنده...' : 'Loading live candlestick feed...'}
            </div>
          )}
        </div>

        {/* Middle Column: Switchable Chart AI vs Order Book (3 cols on xl) */}
        <div className="xl:col-span-3 panel rounded-[26px] p-4 flex flex-col gap-3 text-xs">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/25 border hairline">
            <button
              type="button"
              onClick={() => setRightIntel('ai')}
              className={`py-2 rounded-lg font-black transition flex items-center justify-center gap-1.5 ${
                rightIntel === 'ai' ? 'btn-gold' : 'text-dim hover:text-main'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>{isFa ? 'چارت AI' : 'Chart AI'}</span>
            </button>
            <button
              type="button"
              onClick={() => setRightIntel('book')}
              className={`py-2 rounded-lg font-black transition flex items-center justify-center gap-1.5 ${
                rightIntel === 'book' ? 'btn-gold' : 'text-dim hover:text-main'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isFa ? 'دفتر سفارش' : 'Order Book'}</span>
            </button>
          </div>

          {rightIntel === 'ai' ? (
            <div className="flex flex-col flex-1 gap-3">
              {aiAnalysis && (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`font-black ${aiAnalysis.direction === 'SHORT' || aiAnalysis.bias === 'SHORT' ? 'text-loss' : 'text-jade'}`}>
                      {aiAnalysis.direction ?? aiAnalysis.bias ?? 'NEUTRAL'} · {aiAnalysis.confidence ?? 0}%
                    </span>
                    {aiAnalysis.rrRatio && (
                      <span dir="ltr" className="font-num font-bold text-dim">R:R 1:{aiAnalysis.rrRatio}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-sub leading-relaxed">{aiAnalysis.summary}</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-num" dir="ltr">
                    <div className="surface-soft rounded-lg px-2 py-1">EN: ${fmtPx(aiAnalysis.entry)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1 text-loss">SL: ${fmtPx(aiAnalysis.stopLoss)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1 text-jade">TP1: ${fmtPx(aiAnalysis.tp1)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1 text-jade">TP2: ${fmtPx(aiAnalysis.tp2)}</div>
                  </div>
                  {(aiAnalysis.stopLoss || aiAnalysis.tp1) && (
                    <button
                      type="button"
                      onClick={copyAiLevelsToTicket}
                      className="btn-emerald w-full py-2 rounded-xl text-[11px] flex items-center justify-center gap-1"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انتقال سطوح به فرم سفارش' : 'Copy Levels to Ticket'}</span>
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {[
                  isFa ? 'ستاپ ورود + استاپ و ۳ تارگت' : 'Entry + SL + 3 TPs setup',
                  isFa ? 'نواحی حمایت و مقاومت کلیدی' : 'Key Support / Resistance',
                  isFa ? 'هم‌راستایی ۱۵دقیقه و ۴ساعته' : '15m & 4h trend alignment',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void askChartAI(q)}
                    className="text-[10px] px-2.5 py-1.5 rounded-xl btn-ghost font-semibold text-start"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-[120px] max-h-[200px] overflow-y-auto space-y-2">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-2.5 text-[11px] leading-relaxed ${
                      m.role === 'user' ? 'banner-cobalt-soft text-main' : 'surface-soft text-sub'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {messages.length === 0 && !aiAnalysis && (
                  <p className="text-[11px] text-dim text-center py-6">
                    {isFa
                      ? 'سوالی درباره این چارت بپرسید یا دکمه تحلیل فوری را بزنید.'
                      : 'Ask any question about this chart to draw levels & thesis.'}
                  </p>
                )}
              </div>

              {chatHistory.length > 0 && (
                <div className="text-[10px] text-dim flex items-center gap-1.5 truncate">
                  <History className="w-3 h-3 shrink-0" />
                  <span className="truncate">{chatHistory[0]?.title}</span>
                </div>
              )}

              <div className="flex gap-1.5 mt-auto">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void askChartAI()}
                  placeholder={isFa ? 'از چارت بپرس...' : 'Ask anything about this chart...'}
                  className="field text-xs py-2"
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void askChartAI()}
                  className="btn-gold px-3 rounded-xl shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              <div className="flex justify-between text-[11px] text-dim pb-1 border-b hairline">
                <span>{isFa ? `اسپرد: ${snap?.spreadPct ?? '0.02'}%` : `Spread: ${snap?.spreadPct ?? '0.02'}%`}</span>
                <span>{isFa ? `توازن: ${snap?.imbalancePct ?? '50'}%` : `Imb: ${snap?.imbalancePct ?? '50'}%`}</span>
              </div>
              <div className="space-y-1 font-num text-[11px]" dir="ltr">
                {(snap?.orderBook.asks ?? []).slice(0, 7).reverse().map(([p, s], idx) => (
                  <div key={`a-${idx}`} className="flex justify-between text-loss bg-rose-500/5 px-2 py-0.5 rounded">
                    <span>${fmtPx(p)}</span>
                    <span className="text-dim">{Number(s).toFixed(3)}</span>
                  </div>
                ))}
                <div className="text-center font-bold text-main py-1 border-y hairline">${fmtPx(lastPx)}</div>
                {(snap?.orderBook.bids ?? []).slice(0, 7).map(([p, s], idx) => (
                  <div key={`b-${idx}`} className="flex justify-between text-jade bg-jade/5 px-2 py-0.5 rounded">
                    <span>${fmtPx(p)}</span>
                    <span className="text-dim">{Number(s).toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Unified Order Ticket (3 cols on xl) */}
        <form onSubmit={placeOrder} className="xl:col-span-3 panel rounded-[26px] p-4 flex flex-col gap-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-base text-main">{isFa ? 'ثبت معامله' : 'Order Ticket'}</span>
            <span className="text-[10px] font-bold text-dim">{data.config.trading_mode}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/25 border hairline">
            {(['LONG', 'SHORT'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSide(s);
                  applyAutoLevels(lastPx, s);
                }}
                className={`py-2.5 rounded-lg font-black transition flex items-center justify-center gap-1 ${
                  side === s ? (s === 'LONG' ? 'bg-jade text-black' : 'bg-rose-500 text-white') : 'text-dim'
                }`}
              >
                {s === 'LONG' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <span>{s === 'LONG' ? (isFa ? 'خرید LONG' : 'LONG') : isFa ? 'فروش SHORT' : 'SHORT'}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(['MARKET', 'LIMIT'] as const).map((ot) => (
              <button
                key={ot}
                type="button"
                onClick={() => setOrderType(ot)}
                className={`py-2 rounded-xl font-bold ${orderType === ot ? 'btn-gold' : 'btn-ghost text-dim'}`}
              >
                {ot === 'MARKET' ? (isFa ? 'مارکت لحظه‌ای' : 'Market') : isFa ? 'لیمیت' : 'Limit'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(['ISOLATED', 'CROSS'] as const).map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => setMarginMode(mm)}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${
                  marginMode === mm ? 'banner-cobalt-soft text-main border border-[var(--gold)]' : 'btn-ghost text-dim'
                }`}
              >
                {mm}
              </button>
            ))}
          </div>

          {orderType === 'LIMIT' && (
            <input
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={isFa ? 'قیمت لیمیت (USDT)' : 'Limit Price'}
              className="field font-num text-xs"
            />
          )}

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-dim">{isFa ? 'اهرم معاملاتی' : 'Leverage'}</span>
              <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold)' }}>{lev}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={lev}
              onChange={(e) => setLev(Number(e.target.value))}
              className="w-full"
              style={{ ['--fill' as string]: `${((lev - 1) / 49) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-dim block mb-1">{isFa ? 'حد ضرر SL' : 'Stop Loss'}</label>
              <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="field font-num text-xs py-2" />
            </div>
            <div>
              <label className="text-[10px] text-dim block mb-1">{isFa ? 'تارگت ۱' : 'TP 1'}</label>
              <input value={tp1} onChange={(e) => setTp1(e.target.value)} className="field font-num text-xs py-2" />
            </div>
            <div>
              <label className="text-[10px] text-dim block mb-1">{isFa ? 'تارگت ۲' : 'TP 2'}</label>
              <input value={tp2} onChange={(e) => setTp2(e.target.value)} className="field font-num text-xs py-2" />
            </div>
            <div>
              <label className="text-[10px] text-dim block mb-1">{isFa ? 'تارگت ۳' : 'TP 3'}</label>
              <input value={tp3} onChange={(e) => setTp3(e.target.value)} className="field font-num text-xs py-2" />
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--soft)] border hairline p-3 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-dim">{isFa ? 'مارجین تخمینی' : 'Est. Margin'}</span>
              <span dir="ltr" className="font-num font-bold text-main">${marginEst.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">{isFa ? 'حجم پوزیشن' : 'Position Size'}</span>
              <span dir="ltr" className="font-num font-bold text-main">${(marginEst * lev).toFixed(0)}</span>
            </div>
          </div>

          {orderMsg && <div className="text-[11px] font-bold" style={{ color: 'var(--gold)' }}>{orderMsg}</div>}

          <button
            type="submit"
            disabled={submitting}
            className={`mt-auto w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 ${
              side === 'LONG' ? 'btn-gold' : 'bg-rose-500 text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{submitting ? '...' : `${isFa ? 'ثبت سفارش' : 'Place Order'} · ${symbol}`}</span>
          </button>

          <p className="text-[10px] text-dim flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-jade shrink-0" />
            <span>{isFa ? 'هیچ سفارشی بدون حد ضرر باز نمی‌شود.' : 'Protected by mandatory stop-loss guard.'}</span>
          </p>
        </form>
      </div>

      {/* Bottom: Active Positions & Pending Orders */}
      <div className="panel rounded-[26px] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-main">
            {isFa ? `پوزیشن‌های باز (${data.openTrades.length})` : `Open Positions (${data.openTrades.length})`}
          </h3>
          {data.pendingOrders && data.pendingOrders.length > 0 && (
            <span className="text-xs text-dim">
              {isFa ? `${data.pendingOrders.length} سفارش لیمیت در صف` : `${data.pendingOrders.length} pending limit`}
            </span>
          )}
        </div>

        {data.openTrades.length === 0 ? (
          <div className="py-6 text-center text-xs text-dim">
            {isFa ? 'پوزیشن بازی در این حساب ثبت نشده است.' : 'No open positions.'}
          </div>
        ) : (
          <div className="space-y-2">
            {data.openTrades.map((p) => {
              const u = Number(p.unrealized_pnl || 0);
              return (
                <div key={p.id} className="rounded-2xl bg-[var(--soft)] border hairline px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                      p.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'
                    }`}
                  >
                    {p.direction} {p.leverage}×
                  </span>
                  <button type="button" onClick={() => setSymbol(p.symbol)} className="font-bold text-main hover:underline">
                    {p.symbol}
                  </button>
                  <span dir="ltr" className="text-dim tabular">
                    Entry ${p.entry_price} → Now ${p.mark_price ?? p.entry_price}
                  </span>
                  <span dir="ltr" className="text-dim tabular">
                    SL ${p.current_stop_loss} · TP1 ${p.tp1}
                  </span>
                  <span dir="ltr" className={`ms-auto font-num font-bold ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {u >= 0 ? '+' : ''}${u.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void closePosition(p.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{isFa ? 'بستن' : 'Close'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
