import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  BrainCircuit,
  Calculator,
  CandlestickChart as CandleIcon,
  CheckCircle2,
  Code2,
  Edit3,
  History,
  Layers,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  Candle,
  CustomStrategyLanguage,
  SampleCustomStrategy,
  Timeframe,
} from '@dollarino/core';
import {
  CandlestickChart,
  type ChartLevels,
  type ChartOverlays,
  type CustomStrategyChartOverlay,
  type KbosChartOverlays,
} from '../components/CandlestickChart';
import { MultiChartGrid } from '../components/tv/MultiChartGrid';
import { PineEditorDock } from '../components/tv/PineEditorDock';
import { TvSuperChart } from '../components/tv/TvSuperChart';
import { CoinIcon } from '../components/CoinIcon';
import { SmoothSlider } from '../components/SmoothSlider';
import { ConfirmTradeSheet, type PendingTradeConfirmation } from '../components/ConfirmTradeSheet';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { TpSlModeSwitch } from '../components/TpSlModeSwitch';
import { TrustWalletTradePlaybook } from '../components/TrustWalletTradePlaybook';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import { calcPctFromPrice, calcPriceFromPct, calcRoePct, formatLevelPrice, type TpSlInputMode } from '../lib/tpsl';
import type { DashboardPayload, OpenTradeRow, TerminalTradeOverlay } from '../lib/types';

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
  customOverlays?: CustomStrategyChartOverlay | null;
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

interface PriceAlertItem {
  id: string;
  symbol: string;
  condition: 'ABOVE' | 'BELOW';
  target_price: number;
  note?: string | null;
  is_active: number;
  triggered_at?: string | null;
  created_at: string;
}

function fmtPx(v?: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '$0';
  return '$' + Math.round(v).toLocaleString('en-US');
}

export function TerminalPage({
  lang,
  uiMode = 'pro',
  onToggleUiMode,
  symbol,
  setSymbol,
  tradeOverlay,
  onClearTradeOverlay,
  marketType = 'FUTURES',
  onChangeMarketType,
  data,
  markets,
  onRefresh,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  onToggleUiMode?: (m: 'simple' | 'pro') => void;
  symbol: string;
  setSymbol: (sym: string) => void;
  tradeOverlay?: TerminalTradeOverlay | null;
  onClearTradeOverlay?: () => void;
  marketType?: 'SPOT' | 'FUTURES';
  onChangeMarketType?: (next: 'SPOT' | 'FUTURES') => Promise<void>;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [tf, setTf] = useState<Timeframe>(() => tradeOverlay?.timeframe || '15m');
  const [showSimpleChart, setShowSimpleChart] = useState(false);
  const [rightIntel, setRightIntel] = useState<'positions' | 'ai' | 'book' | 'script' | 'tools'>('ai');
  const [snap, setSnap] = useState<OverviewResponse | null>(null);
  const [loadingSymbol, setLoadingSymbol] = useState(false);
  const [showEma] = useState(false);
  const [showKbos, setShowKbos] = useState(false);
  const [showOverlaySignalText, setShowOverlaySignalText] = useState(false);

  useEffect(() => {
    if (tradeOverlay?.timeframe) {
      setTf(tradeOverlay.timeframe);
    }
  }, [tradeOverlay?.id, tradeOverlay?.symbol, tradeOverlay?.timeframe]);
  const [layoutMode, setLayoutMode] = useState<'1x1' | '2x1' | '2x2'>('1x1');
  const [pineDockOpen, setPineDockOpen] = useState(false);
  const [pendingPineSample, setPendingPineSample] = useState<{
    name: string;
    language: CustomStrategyLanguage;
    code: string;
  } | null>(null);
  const [customChartOverlay, setCustomChartOverlay] = useState<CustomStrategyChartOverlay | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingTradeConfirmation | null>(null);

  // Price Alerts state
  const [alerts, setAlerts] = useState<PriceAlertItem[]>([]);
  const [alertTarget, setAlertTarget] = useState('');
  const [alertCond, setAlertCond] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [alertNote, setAlertNote] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);

  // Order ticket state
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const effectiveSide: 'LONG' | 'SHORT' = marketType === 'SPOT' ? 'LONG' : side;
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(10);
  const effectiveLev = marketType === 'SPOT' ? 1 : lev;
  const [marginPct, setMarginPct] = useState<number>(Math.max(1, Math.min(100, Number(data.config.margin_pct || 10))));
  const [stopLoss, setStopLoss] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [tpslMode, setTpslMode] = useState<TpSlInputMode>('PRICE');
  const [tpslPcts, setTpslPcts] = useState({ stopLoss: '1.5', tp1: '2', tp2: '3.5', tp3: '5.5' });
  const [submitting, setSubmitting] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');

  // Inline Edit TP/SL modal
  const [editPos, setEditPos] = useState<OpenTradeRow | null>(null);
  const [editForm, setEditForm] = useState({ stopLoss: '', tp1: '', tp2: '', tp3: '' });
  const [editTpSlMode, setEditTpSlMode] = useState<TpSlInputMode>('PRICE');
  const [editPcts, setEditPcts] = useState({ stopLoss: '1.5', tp1: '2', tp2: '', tp3: '' });

  // Chart AI state + persistent saved chat loader
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

  const applyAutoLevels = (px: number, dir: 'LONG' | 'SHORT', alsoResetLimit = false) => {
    if (!Number.isFinite(px) || px <= 0) return;
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    if (alsoResetLimit) {
      setLimitPrice(px.toFixed(dec));
    }
    setStopLoss((dir === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec));
    setTp1((dir === 'LONG' ? px * 1.02 : px * 0.98).toFixed(dec));
    setTp2((dir === 'LONG' ? px * 1.035 : px * 0.965).toFixed(dec));
    setTp3((dir === 'LONG' ? px * 1.055 : px * 0.945).toFixed(dec));
    setTpslPcts({ stopLoss: '1.5', tp1: '2', tp2: '3.5', tp3: '5.5' });
  };

  const switchTicketTpSlMode = (nextMode: TpSlInputMode) => {
    if (nextMode === tpslMode) return;
    const entryPx = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : Number(snap?.market24h.lastPrice || 0);
    if (nextMode === 'PCT' && entryPx > 0) {
      const pSl = calcPctFromPrice({ entryPrice: entryPx, side: effectiveSide, kind: 'SL', targetPrice: Number(stopLoss) });
      const p1 = calcPctFromPrice({ entryPrice: entryPx, side: effectiveSide, kind: 'TP', targetPrice: Number(tp1) });
      const p2 = calcPctFromPrice({ entryPrice: entryPx, side: effectiveSide, kind: 'TP', targetPrice: Number(tp2) });
      const p3 = calcPctFromPrice({ entryPrice: entryPx, side: effectiveSide, kind: 'TP', targetPrice: Number(tp3) });
      setTpslPcts({
        stopLoss: pSl !== null ? String(pSl) : '1.5',
        tp1: p1 !== null ? String(p1) : '2',
        tp2: p2 !== null ? String(p2) : '',
        tp3: p3 !== null ? String(p3) : '',
      });
    }
    setTpslMode(nextMode);
  };

  const updateTicketPct = (field: 'stopLoss' | 'tp1' | 'tp2' | 'tp3', rawPct: string) => {
    setTpslPcts((prev) => ({ ...prev, [field]: rawPct }));
    const entryPx = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : Number(snap?.market24h.lastPrice || 0);
    const num = Number(rawPct);
    const kind = field === 'stopLoss' ? 'SL' : 'TP';
    const px = Number.isFinite(num) && num > 0 && entryPx > 0
      ? calcPriceFromPct({ entryPrice: entryPx, side: effectiveSide, kind, pct: num })
      : null;
    const formatted = px !== null ? formatLevelPrice(px) : '';
    if (field === 'stopLoss') setStopLoss(formatted);
    else if (field === 'tp1') setTp1(formatted);
    else if (field === 'tp2') setTp2(formatted);
    else setTp3(formatted);
  };

  const openEditTpSlModal = (p: OpenTradeRow) => {
    const entryPx = Number(p.entry_price || 0);
    setEditPos(p);
    setEditForm({
      stopLoss: p.current_stop_loss || '',
      tp1: p.tp1 || '',
      tp2: p.tp2 || '',
      tp3: p.tp3 || '',
    });
    const pSl = calcPctFromPrice({ entryPrice: entryPx, side: p.direction, kind: 'SL', targetPrice: Number(p.current_stop_loss) });
    const p1 = calcPctFromPrice({ entryPrice: entryPx, side: p.direction, kind: 'TP', targetPrice: Number(p.tp1) });
    const p2 = calcPctFromPrice({ entryPrice: entryPx, side: p.direction, kind: 'TP', targetPrice: Number(p.tp2) });
    const p3 = calcPctFromPrice({ entryPrice: entryPx, side: p.direction, kind: 'TP', targetPrice: Number(p.tp3) });
    setEditPcts({
      stopLoss: pSl !== null ? String(pSl) : '1.5',
      tp1: p1 !== null ? String(p1) : '2',
      tp2: p2 !== null ? String(p2) : '',
      tp3: p3 !== null ? String(p3) : '',
    });
    setEditTpSlMode('PRICE');
  };

  const updateEditPct = (field: 'stopLoss' | 'tp1' | 'tp2' | 'tp3', rawPct: string) => {
    setEditPcts((prev) => ({ ...prev, [field]: rawPct }));
    if (!editPos) return;
    const entryPx = Number(editPos.entry_price || 0);
    const num = Number(rawPct);
    const kind = field === 'stopLoss' ? 'SL' : 'TP';
    const px = Number.isFinite(num) && num > 0 && entryPx > 0
      ? calcPriceFromPct({ entryPrice: entryPx, side: editPos.direction, kind, pct: num })
      : null;
    setEditForm((prev) => ({ ...prev, [field]: px !== null ? formatLevelPrice(px) : '' }));
  };

  const loadAlerts = async () => {
    const res = await apiFetch<{ alerts: PriceAlertItem[] }>('/api/trading/alerts').catch(() => ({ alerts: [] }));
    setAlerts(res.alerts || []);
  };

  const loadMarket = async (forceResetLevels = false, targetSym = symbol, targetTf = tf, targetSide = effectiveSide) => {
    const [ov, chats] = await Promise.all([
      apiFetch<OverviewResponse>(`/api/trading/market/overview?symbol=${targetSym}&timeframe=${targetTf}`).catch(() => null),
      apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats').catch(() => ({
        chats: [],
      })),
    ]);
    if (ov && ov.market24h?.symbol === targetSym) {
      setSnap(ov);
      setLoadingSymbol(false);
      const px = Number(ov.market24h.lastPrice || 0);
      if (forceResetLevels && px > 0) {
        applyAutoLevels(px, targetSide, true);
        setAlertTarget((px * 1.01).toFixed(px >= 1000 ? 2 : px >= 1 ? 4 : 6));
      }
    }
    setChatHistory(chats.chats);
  };

  // Strict reset on symbol switch so stale BTC/SOL prices, SL, TP, or AI never bleed into the new market
  useEffect(() => {
    let active = true;
    setLoadingSymbol(true);
    setSnap(null);
    setStopLoss('');
    setTp1('');
    setTp2('');
    setTp3('');
    setLimitPrice('');
    setAiAnalysis(null);
    setChatId(undefined);
    setMessages([]);
    setCustomChartOverlay(null);
    setOrderMsg('');

    const run = async (resetLevels: boolean) => {
      const ov = await apiFetch<OverviewResponse>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`).catch(() => null);
      if (!active) return;
      if (ov) {
        setSnap(ov);
        const px = Number(ov.market24h.lastPrice || 0);
        if (resetLevels && px > 0) {
          applyAutoLevels(px, effectiveSide, true);
          setAlertTarget((px * 1.01).toFixed(px >= 1000 ? 2 : px >= 1 ? 4 : 6));
        }
      }
      setLoadingSymbol(false);
    };

    void run(true);
    void loadAlerts();
    void apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats')
      .then((c) => { if (active) setChatHistory(c.chats || []); })
      .catch(() => {});

    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void run(false);
    }, 30_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [symbol, tf]);

  const createPriceAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const tPx = Number(alertTarget);
    if (!Number.isFinite(tPx) || tPx <= 0) return;
    setAlertBusy(true);
    try {
      await apiFetch('/api/trading/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          condition: alertCond,
          targetPrice: tPx,
          note: alertNote.trim() || undefined,
        }),
      });
      setAlertNote('');
      await loadAlerts();
    } finally {
      setAlertBusy(false);
    }
  };

  const deletePriceAlert = async (id: string) => {
    await apiFetch(`/api/trading/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    await loadAlerts();
  };

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
      await loadMarket(false);
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : 'Chart AI error');
    } finally {
      setAiLoading(false);
    }
  };

  const loadSavedChat = async (id: string) => {
    try {
      const d = await apiFetch<{
        chat: { id: string; symbol: string; timeframe: Timeframe; messages_json: string; annotations_json: string };
      }>(`/api/chart-ai/chats/${id}`);
      setChatId(d.chat.id);
      if (d.chat.symbol) setSymbol(d.chat.symbol);
      if (d.chat.timeframe) setTf(d.chat.timeframe);
      try {
        setMessages(JSON.parse(d.chat.messages_json || '[]') as Array<{ role: string; content: string }>);
      } catch {
        setMessages([]);
      }
      try {
        const ann = JSON.parse(d.chat.annotations_json || 'null') as ChartAIResult | null;
        if (ann) setAiAnalysis(ann);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  };

  const copyAiLevelsToTicket = () => {
    if (!aiAnalysis) return;
    const dir = marketType === 'SPOT' ? 'LONG' : aiAnalysis.direction ?? (aiAnalysis.bias === 'SHORT' ? 'SHORT' : 'LONG');
    setSide(dir);
    if (aiAnalysis.stopLoss) setStopLoss(String(aiAnalysis.stopLoss));
    if (aiAnalysis.tp1) setTp1(String(aiAnalysis.tp1));
    if (aiAnalysis.tp2) setTp2(String(aiAnalysis.tp2));
    if (aiAnalysis.tp3) setTp3(String(aiAnalysis.tp3));
    setOrderMsg(isFa ? 'سطوح پیشنهادی چارت AI به فرم سفارش منتقل شد' : 'AI levels copied to order ticket');
  };

  const prepareOrderConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    tgHaptic('medium');
    setOrderMsg('');
    setPendingConfirm({
      symbol,
      direction: effectiveSide,
      orderType,
      entryPrice: orderType === 'LIMIT' ? limitPrice : snap?.market24h.lastPrice,
      leverage: effectiveLev,
      amountUsd: marginEst,
      stopLoss,
      tp1,
      tp2: tp2 || undefined,
      tp3: tp3 || undefined,
      tradingMode: data.config.trading_mode,
    });
  };

  const placeOrder = async () => {
    setSubmitting(true);
    setOrderMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; error?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          direction: effectiveSide,
          orderType,
          marketType,
          marginPct,
          limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
          leverage: effectiveLev,
          marginMode,
          stopLoss,
          tp1,
          tp2: tp2 || undefined,
          tp3: tp3 || undefined,
        }),
      });
      setPendingConfirm(null);
      if (res.ok) tgNotifyHaptic('success');
      else tgNotifyHaptic('error');
      setOrderMsg(
        res.ok
          ? res.pendingOrderId
            ? isFa ? 'سفارش لیمیت ثبت شد' : 'Limit order queued'
            : isFa ? 'معامله با موفقیت باز شد' : 'Position opened'
          : res.error || 'Rejected'
      );
      await onRefresh();
    } catch (err) {
      setPendingConfirm(null);
      tgNotifyHaptic('error');
      setOrderMsg(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closePosition = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    await onRefresh();
  };

  const cancelPending = async (id: string) => {
    await apiFetch(`/api/trading/pending/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const saveEditTpSl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPos) return;
    await apiFetch(`/api/trading/positions/${editPos.id}/tpsl`, {
      method: 'PATCH',
      body: JSON.stringify({
        stopLoss: editForm.stopLoss,
        tp1: editForm.tp1,
        tp2: editForm.tp2 || undefined,
        tp3: editForm.tp3 || undefined,
      }),
    });
    setEditPos(null);
    await onRefresh();
  };

  const lastPx = Number(snap?.market24h.lastPrice || 0);
  const chg24 = Number(snap?.market24h.changePct24h || 0);
  const freeCash = Number(data.balance.free || 0);
  const marginEst = (freeCash * marginPct) / 100;

  const chartOverlays: ChartOverlays | undefined = useMemo(() => {
    if (!showEma || !snap?.indicators) return undefined;
    return snap.indicators;
  }, [snap?.indicators, showEma]);

  const chartLevels: ChartLevels = useMemo(() => {
    const pos = data.openTrades.find((p) => p.symbol === symbol);
    const activeOv = tradeOverlay && tradeOverlay.symbol === symbol ? tradeOverlay : null;
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
    if (activeOv) {
      return {
        entry: activeOv.entryPrice ?? (pos ? Number(pos.entry_price) : undefined),
        stopLoss: activeOv.stopLoss ?? (pos ? Number(pos.current_stop_loss) : undefined),
        tp1: activeOv.tp1 ?? (pos ? Number(pos.tp1) : undefined),
        tp2: activeOv.tp2 ?? (pos?.tp2 ? Number(pos.tp2) : undefined),
        tp3: activeOv.tp3 ?? (pos?.tp3 ? Number(pos.tp3) : undefined),
      };
    }
    return {
      entry: pos ? Number(pos.entry_price) : undefined,
      stopLoss: pos ? Number(pos.current_stop_loss) : undefined,
      tp1: pos ? Number(pos.tp1) : undefined,
      tp2: pos?.tp2 ? Number(pos.tp2) : undefined,
      tp3: pos?.tp3 ? Number(pos.tp3) : undefined,
    };
  }, [aiAnalysis, data.openTrades, symbol, tradeOverlay]);

  const runPineSampleImmediate = async (sample: SampleCustomStrategy) => {
    const sName = isFa ? sample.nameFa : sample.nameEn;
    setPendingPineSample({ name: sName, language: sample.language, code: sample.code });
    setPineDockOpen(true);
    try {
      const ev = await apiFetch<
        CustomStrategyChartOverlay & { valid: boolean; errors?: string[] }
      >('/api/trading/strategies/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          language: sample.language,
          code: sample.code,
          symbol,
          timeframe: tf,
          limit: 500,
        }),
      });
      if (ev.valid) {
        setCustomChartOverlay({
          title: ev.title || sName,
          language: sample.language,
          pineVersion: ev.pineVersion,
          scriptKind: ev.scriptKind,
          overlay: ev.overlay,
          plots: ev.plots,
          markers: ev.markers,
          hlines: ev.hlines,
          fills: ev.fills,
          bgcolors: ev.bgcolors,
          barcolors: ev.barcolors,
          labels: ev.labels,
          lines: ev.lines,
          boxes: ev.boxes,
          tables: ev.tables,
          polylines: ev.polylines,
          logs: ev.logs,
          inputs: ev.inputs,
          alertsTriggered: ev.alertsTriggered,
        });
      }
    } catch {
      /* handled inside PineEditorDock */
    }
  };

  if (uiMode === 'simple') {
    const coinBase = symbol.replace('USDT', '');
    const coinFaTitle = coinDisplayName(coinBase, isFa);
    const usdAmountStr = marginEst > 0 ? marginEst.toFixed(0) : '0';
    const tomanAmountStr = marginEst > 0 ? Math.round(marginEst * 70000).toLocaleString('en-US') : '0';

    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* 1. Screenshot 4 Top Segmented Switch: معامله آسان | معامله حرفه‌ای */}
        {onToggleUiMode && (
          <div className="flex justify-center">
            <div className="panel rounded-full p-1 inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleUiMode('simple')}
                className="px-5 py-2 rounded-full text-xs font-black bg-[#1E293B] text-white shadow-sm transition"
              >
                {isFa ? 'معامله آسان' : 'Easy Trade'}
              </button>
              <button
                type="button"
                onClick={() => onToggleUiMode('pro')}
                className="px-5 py-2 rounded-full text-xs font-bold text-dim hover:text-main transition"
              >
                {isFa ? 'معامله حرفه‌ای' : 'Pro Trade'}
              </button>
            </div>
          </div>
        )}

        {/* 2. Kifpool image-3.png Clean Open Coin Strip + Live Price + Candle Toggle */}
        <div className="px-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SymbolPicker
              lang={lang}
              compact
              value={symbol}
              markets={markets}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={marketType}
              onChangeMarketType={(m) => void onChangeMarketType?.(m)}
              onChange={(sym) => setSymbol(sym)}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-end leading-tight">
              <span className="block text-[10px] font-bold text-dim">{isFa ? 'قیمت لحظه‌ای' : 'Live Price'}</span>
              <span dir="ltr" className="font-num font-black text-sm text-[#0D9455]">
                ${fmtPx(lastPx)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSimpleChart((v) => !v)}
              className={`p-2 rounded-xl transition inline-flex items-center gap-1 text-xs font-bold ${
                showSimpleChart ? 'bg-[#1652F0] text-white' : 'panel text-main'
              }`}
              title={isFa ? 'نمودار کندلی' : 'Candlestick Chart'}
            >
              <CandleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {onChangeMarketType && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-dim">{isFa ? 'نوع بازار معامله:' : 'Market Type:'}</span>
            <div className="ios-segmented p-0.5">
              <button
                type="button"
                onClick={() => void onChangeMarketType('FUTURES')}
                className={`px-3 py-1 rounded-full text-[10px] font-black transition ${marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'فیوچرز' : 'Futures'}
              </button>
              <button
                type="button"
                onClick={() => void onChangeMarketType('SPOT')}
                className={`px-3 py-1 rounded-full text-[10px] font-black transition ${marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'اسپات' : 'Spot'}
              </button>
            </div>
          </div>
        )}

        {/* Expandable Interactive Candlestick Chart */}
        {showSimpleChart && (
          <div className="panel rounded-[22px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-main">{coinFaTitle}</span>
                <span dir="ltr" className="font-num font-bold text-sm text-main">${fmtPx(lastPx)}</span>
              </div>
              <div className="flex gap-1">
                {(['15m', '1h', '4h', '1d', '1w'] as Timeframe[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTf(t)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${tf === t ? 'ios-pill-active' : 'surface-soft text-dim'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <CandlestickChart candles={snap?.candles ?? []} height={260} />
          </div>
        )}

        {/* 3. Kifpool image-3.png Open-Canvas Buy / Sell Form */}
        <form onSubmit={prepareOrderConfirmation} className="space-y-3">
          {/* Full-Width Emerald/White Buy & Sell Pills */}
          <div className={marketType === 'SPOT' ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2.5'}>
            <button
              type="button"
              onClick={() => {
                setSide('LONG');
                if (lastPx > 0) applyAutoLevels(lastPx, 'LONG');
              }}
              className={`py-3 rounded-[16px] text-sm font-black transition shadow-xs ${
                effectiveSide === 'LONG'
                  ? 'bg-[#0D9455] text-white shadow-sm'
                  : 'panel text-main hover:bg-[var(--soft)]'
              }`}
            >
              {marketType === 'SPOT' ? (isFa ? `خرید ${coinFaTitle}` : `Buy ${coinBase}`) : isFa ? 'خرید' : 'Buy'}
            </button>
            {marketType === 'FUTURES' && (
              <button
                type="button"
                onClick={() => {
                  setSide('SHORT');
                  if (lastPx > 0) applyAutoLevels(lastPx, 'SHORT');
                }}
                className={`py-3 rounded-[16px] text-sm font-black transition shadow-xs ${
                  effectiveSide === 'SHORT'
                    ? 'bg-[#EF4444] text-white shadow-sm'
                    : 'panel text-main hover:bg-[var(--soft)]'
                }`}
              >
                {isFa ? 'فروش' : 'Sell'}
              </button>
            )}
          </div>

          {/* Twin Clean White Input Boxes matching image-3.png */}
          <div className="space-y-2.5">
            <div className="panel rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 border hairline focus-within:border-[#1652F0]">
              <div className="flex items-center gap-2 shrink-0 border-e hairline pe-3">
                <span className="text-xs font-black text-main">USD</span>
              </div>
              <input
                type="number"
                min={1}
                max={Math.max(10, freeCash)}
                value={Math.round(marginEst)}
                onChange={(e) => {
                  const usd = Math.max(1, Number(e.target.value) || 0);
                  const pct = Math.min(100, Math.max(1, Math.round((usd / Math.max(1, freeCash)) * 100)));
                  setMarginPct(pct);
                }}
                dir="ltr"
                className="bg-transparent text-end font-num font-black text-base text-main outline-none flex-1 min-w-0"
              />
            </div>

            {isFa && (
              <div className="panel rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 border hairline">
                <span className="text-xs font-bold text-main shrink-0 border-e hairline pe-3">تومان</span>
                <span dir="ltr" className="font-num font-bold text-sm text-main flex-1 text-end">
                  {tomanAmountStr}
                </span>
              </div>
            )}
          </div>

          {/* 4 Dashed Percentage Chips matching image-3.png */}
          <div className="grid grid-cols-4 gap-2 pt-0.5">
            {[10, 25, 50, 100].map((pct) => {
              const active = Math.abs(marginPct - pct) <= 2;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setMarginPct(pct)}
                  className={`py-2 rounded-full text-xs font-num font-black border border-dashed transition ${
                    active
                      ? 'border-[#0D9455] bg-[#0D9455]/10 text-[#0D9455]'
                      : 'border-[var(--line-strong)] bg-[var(--panel)] text-sub hover:text-main'
                  }`}
                >
                  {pct}%
                </button>
              );
            })}
          </div>

          {/* Futures Comfort Leverage Pills */}
          {marketType === 'FUTURES' && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-bold text-dim">{isFa ? 'اهرم محافظت‌شده:' : 'Leverage:'}</span>
              <div className="flex gap-1.5">
                {[
                  { v: 3, l: isFa ? 'امن ۳×' : '3×' },
                  { v: 5, l: isFa ? 'متعادل ۵×' : '5×' },
                  { v: 10, l: isFa ? 'سریع ۱۰×' : '10×' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setLev(opt.v)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-black transition ${
                      lev === opt.v ? 'ios-pill-active' : 'panel text-dim'
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {orderMsg && <div className="p-3 rounded-2xl badge-signal text-xs font-bold">{orderMsg}</div>}

          {/* Full-Width Emerald / Rose Execution CTA */}
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3.5 rounded-[16px] text-sm font-black text-white shadow-md transition inline-flex items-center justify-center gap-2 ${
              effectiveSide === 'LONG' ? 'bg-[#0D9455] hover:bg-[#059669]' : 'bg-[#EF4444] hover:bg-[#DC2626]'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              {submitting ? (
                '...'
              ) : effectiveSide === 'LONG' ? (
                <>
                  {isFa ? `خرید ${coinFaTitle}` : `Buy ${coinBase}`} <span dir="ltr" className="font-num">(${usdAmountStr})</span>
                </>
              ) : (
                <>
                  {isFa ? `فروش ${coinFaTitle}` : `Sell ${coinBase}`} <span dir="ltr" className="font-num">(${usdAmountStr})</span>
                </>
              )}
            </span>
          </button>

          {/* Meta Row Right Under CTA matching image-3.png */}
          <div className="flex items-center justify-between text-[11px] px-1 pt-0.5">
            <button
              type="button"
              onClick={() => setMarginPct(100)}
              className="text-dim font-bold hover:text-[#1652F0] transition inline-flex items-center gap-1"
            >
              <span>{isFa ? 'موجودی در دسترس:' : 'Available:'}</span>
              <strong dir="ltr" className="text-[#F59E0B] font-num">${freeCash.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
            </button>
            <span className="text-dim font-bold">
              {isFa ? 'حدضرر / تارگت:' : 'SL / TP1:'}{' '}
              <strong dir="ltr" className="text-main font-num">${stopLoss || '—'} / ${tp1 || '—'}</strong>
            </span>
          </div>
        </form>

        {/* 4. Kifpool image-3.png Outlined 4-Row Market Info Card */}
        <div className="rounded-[20px] border hairline bg-[var(--panel)]/65 px-4 py-2 divide-y hairline text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'قیمت تومانی' : 'Price (IRT)'}</span>
            <span dir="ltr" className="font-num font-bold text-main">
              {isFa ? `${formatTomanEq(lastPx)} تومان` : `$${fmtPx(lastPx)}`}
            </span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'بالاترین قیمت روز' : '24h High'}</span>
            <span dir="ltr" className="font-num font-bold text-main">${fmtPx(snap?.market24h.high24h)}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'پایین‌ترین قیمت روز' : '24h Low'}</span>
            <span dir="ltr" className="font-num font-bold text-main">${fmtPx(snap?.market24h.low24h)}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-dim font-semibold">{isFa ? 'تغییرات ۲۴ ساعت' : '24h Change'}</span>
            <span dir="ltr" className={`font-num font-black ${chg24 >= 0 ? 'text-jade' : 'text-loss'}`}>
              {chg24 >= 0 ? '+' : ''}
              {chg24.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 5. Outlined Safety Notice Box matching image-3.png + Exchange vs Perp DEX Mini Guide */}
        <div className="rounded-[18px] border hairline bg-[var(--panel)]/50 px-4 py-3 space-y-1.5 text-[11px] text-sub leading-relaxed">
          <div className="flex items-center justify-center gap-2 text-center">
            <ShieldCheck className="w-4 h-4 text-[#0D9455] shrink-0" />
            <span>
              {isFa
                ? 'تمامی معاملات دلارینو با سپر حدضرر و تارگت سود خودکار محافظت می‌شوند.'
                : 'All Dollarino trades are protected by automated Stop-Loss & TP1 risk guard.'}
            </span>
          </div>
          <p className="text-[10.5px] text-dim text-center">
            {isFa ? (
              <>
                نکته: این پایانه روی شبیه‌ساز دمو قابل تنظیم (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>) یا مسیر Perp DEX تراست‌ولت اجرا می‌شود. برای سوآپ توکن‌ها و فیوچرز آنچین بدون KYC به تب «DEX و تراست‌ولت» بروید.
              </>
            ) : (
              'Tip: Executes on Custom Demo ($50–$10M) or Trust Wallet Perp DEX. For multi-chain DEX swaps & No-KYC perps, visit DEX & Trust Wallet.'
            )}
          </p>
        </div>

        <ConfirmTradeSheet
          open={Boolean(pendingConfirm)}
          lang={lang}
          order={pendingConfirm}
          busy={submitting}
          onConfirm={placeOrder}
          onCancel={() => setPendingConfirm(null)}
        />
      </div>
    );
  }

  // Computed Risk / Reward & Liquidation metrics for the Order Ticket
  const refEntry = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : lastPx;
  const slNum = Number(stopLoss);
  const tp1Num = Number(tp1);
  const tp2Num = Number(tp2);
  const slConflict =
    refEntry > 0 &&
    Number.isFinite(slNum) &&
    slNum > 0 &&
    ((effectiveSide === 'LONG' && slNum >= refEntry) || (effectiveSide === 'SHORT' && slNum <= refEntry));
  const riskDistPct = refEntry > 0 && slNum > 0 ? Math.abs(refEntry - slNum) / refEntry : 0;
  const riskUsdEst = marginEst * effectiveLev * riskDistPct;
  const rewardRef = tp2Num > 0 ? tp2Num : tp1Num;
  const rewardDistPct = refEntry > 0 && rewardRef > 0 ? Math.abs(rewardRef - refEntry) / refEntry : 0;
  const rrPreview = riskDistPct > 0 && rewardDistPct > 0 ? (rewardDistPct / riskDistPct).toFixed(2) : '—';
  const estLiqPx =
    refEntry > 0 && marketType === 'FUTURES'
      ? effectiveSide === 'LONG'
        ? refEntry * (1 - 0.9 / Math.max(1, effectiveLev))
        : refEntry * (1 + 0.9 / Math.max(1, effectiveLev))
      : 0;

  const bestBidPx = snap?.orderBook.bids?.[0]?.[0];
  const bestAskPx = snap?.orderBook.asks?.[0]?.[0];
  const imbalanceVal = Number(snap?.imbalancePct ?? 50);

  return (
    <div className="space-y-4">
      {/* Compact Pro Exchange Ticker Strip (Single cohesive bar, zero dead whitespace) */}
      <div className="panel rounded-[22px] px-3.5 sm:px-5 py-2.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Pair + Market Switch + Live Mark Price */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5">
            <SymbolPicker
              lang={lang}
              markets={markets}
              value={symbol}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={marketType}
              onChangeMarketType={(m) => void onChangeMarketType?.(m)}
              onChange={(sym) => setSymbol(sym)}
              compact
            />

            {onChangeMarketType && (
              <div className="ios-segmented p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void onChangeMarketType('FUTURES')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? 'فیوچرز' : 'Futures'}
                </button>
                <button
                  type="button"
                  onClick={() => void onChangeMarketType('SPOT')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-black transition ${marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? 'اسپات' : 'Spot'}
                </button>
              </div>
            )}

            <div className="flex items-baseline gap-2 ps-1">
              <span dir="ltr" className={`font-num font-black text-lg sm:text-xl leading-none ${chg24 >= 0 ? 'text-jade' : 'text-loss'}`}>
                {loadingSymbol && !lastPx ? '...' : `$${fmtPx(lastPx)}`}
              </span>
              <span
                dir="ltr"
                className={`font-num text-[11px] font-black px-2 py-0.5 rounded-lg ${
                  chg24 >= 0 ? 'bg-[#0D9455]/15 text-jade' : 'bg-rose-500/15 text-loss'
                }`}
              >
                {chg24 >= 0 ? '+' : ''}
                {chg24.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 24h Metrics + Quick Chips + Alerts */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
            <div className="hidden md:flex items-center gap-4 text-[11px] border-e hairline pe-3">
              <div>
                <span className="text-dim block text-[9.5px]">{isFa ? 'سقف / کف ۲۴س' : '24h High / Low'}</span>
                <span dir="ltr" className="font-num font-bold text-main">
                  ${fmtPx(snap?.market24h.high24h)} / ${fmtPx(snap?.market24h.low24h)}
                </span>
              </div>
              <div>
                <span className="text-dim block text-[9.5px]">{isFa ? 'فاندینگ ریت' : 'Funding'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{snap?.market24h.fundingRate ?? '0.008%'}</span>
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-1">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TONUSDT'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSymbol(s)}
                  className={`px-2 py-1 rounded-lg text-[10.5px] font-black transition inline-flex items-center gap-1 shrink-0 ${
                    symbol === s ? 'btn-gold shadow-sm' : 'surface-soft text-dim hover:text-main'
                  }`}
                >
                  <CoinIcon symbol={s} size={13} />
                  <span>{s.replace('USDT', '')}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRightIntel('tools')}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition ${
                rightIntel === 'tools' ? 'btn-gold' : 'surface-soft text-sub hover:text-main'
              }`}
              title={isFa ? 'هشدار قیمت و ماشین‌حساب R:R' : 'Price Alerts & R:R Calculator'}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{isFa ? `هشدار (${alerts.filter((a) => a.is_active).length})` : `Alerts (${alerts.filter((a) => a.is_active).length})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Trade & Signal Overlay Banner when jumped from an Active Position */}
      {tradeOverlay && tradeOverlay.symbol === symbol && (
        <div className="panel rounded-2xl px-4 py-3 border border-sky-500/35 bg-sky-500/8 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-brand font-black text-[10px]">
                {tradeOverlay.sourceLabel || (isFa ? 'معامله فعال' : 'Active Trade')}
              </span>
              <strong className="text-main">{tradeOverlay.symbol}</strong>
              {tradeOverlay.direction && (
                <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${tradeOverlay.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                  {tradeOverlay.direction}
                </span>
              )}
              {tradeOverlay.timeframe && (
                <span dir="ltr" className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-black text-[10px]">
                  TF: {tradeOverlay.timeframe}
                </span>
              )}
              <span dir="ltr" className="font-num text-[11px] text-dim">
                Entry ${fmtPx(tradeOverlay.entryPrice)} · SL ${fmtPx(tradeOverlay.stopLoss)} · TP1 ${fmtPx(tradeOverlay.tp1)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {tradeOverlay.signalText && (
                <button
                  type="button"
                  onClick={() => setShowOverlaySignalText((v) => !v)}
                  className="px-2.5 py-1 rounded-lg surface-soft border hairline text-[10.5px] font-bold text-main hover:border-[var(--gold)]"
                >
                  {showOverlaySignalText
                    ? isFa ? 'بستن متن سیگنال' : 'Hide Signal'
                    : isFa ? 'متن و دلیل سیگنال' : 'Signal Thesis'}
                </button>
              )}
              {onClearTradeOverlay && (
                <button
                  type="button"
                  onClick={onClearTradeOverlay}
                  className="p-1 rounded-lg btn-ghost text-dim hover:text-main"
                  title={isFa ? 'بستن راهنمای معامله' : 'Dismiss'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {showOverlaySignalText && tradeOverlay.signalText && (
            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-sub bg-[var(--soft)] rounded-xl p-3 border hairline max-h-48 overflow-y-auto">
              {tradeOverlay.signalText}
            </pre>
          )}
        </div>
      )}

      {/* Main Equal-Height Pro Grid: 8 Columns TradingView Superchart + Pine Dock | 4 Columns Order Ticket */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left 8 Columns: TradingView Superchart / Multi-Chart Grid + Pine Dock + Live Bid/Ask Pulse */}
        <div className="xl:col-span-8 panel rounded-[26px] p-3 sm:p-4 flex flex-col justify-between gap-3">
          {layoutMode !== '1x1' ? (
            <MultiChartGrid
              lang={lang}
              primarySymbol={symbol}
              primaryTimeframe={tf}
              layoutMode={layoutMode}
              markets={markets}
              onSelectSymbol={(sym) => setSymbol(sym)}
              onChangeLayoutMode={setLayoutMode}
            />
          ) : snap?.candles?.length ? (
            <TvSuperChart
              lang={lang}
              symbol={symbol}
              timeframe={tf}
              candles={snap.candles}
              markets={markets}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={marketType}
              levels={chartLevels}
              overlays={chartOverlays}
              kbosOverlays={snap.kbosOverlays}
              customOverlays={customChartOverlay ?? snap.customOverlays}
              layoutMode={layoutMode}
              showKbos={showKbos}
              pineDockOpen={pineDockOpen}
              aiLoading={aiLoading}
              onChangeSymbol={(sym) => setSymbol(sym)}
              onChangeTimeframe={(nextTf) => setTf(nextTf)}
              onChangeMarketType={(m) => void onChangeMarketType?.(m)}
              onToggleKbos={() => setShowKbos((v) => !v)}
              onChangeLayoutMode={setLayoutMode}
              onTogglePineDock={() => setPineDockOpen((v) => !v)}
              onRunPineSample={(sample) => void runPineSampleImmediate(sample)}
              onRunAiAnalyze={() => {
                setRightIntel('ai');
                void askChartAI();
              }}
              onClearCustomOverlay={() => setCustomChartOverlay(null)}
              height={460}
            />
          ) : (
            <div className="h-[480px] grid place-items-center text-xs text-dim">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[var(--gold)]" />
                <span>{isFa ? `در حال دریافت کندل‌های زنده ${symbol}...` : `Loading live ${symbol} chart...`}</span>
              </div>
            </div>
          )}

          {/* TradingView Bottom Pine Script v5/v6 Dock Editor directly under Chart */}
          {pineDockOpen && (
            <PineEditorDock
              lang={lang}
              symbol={symbol}
              timeframe={tf}
              initialScript={pendingPineSample}
              onAppliedToChart={(overlayObj) => setCustomChartOverlay(overlayObj)}
              onClearFromChart={() => setCustomChartOverlay(null)}
              onActivatedOnBot={onRefresh}
              onClose={() => setPineDockOpen(false)}
            />
          )}

          {/* Live Orderbook Micro-Pulse & Quick Limit Fill Strip (keeps Chart column aligned with Order Ticket) */}
          <div className="rounded-2xl surface-soft border hairline px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (bestBidPx) {
                    setOrderType('LIMIT');
                    setLimitPrice(bestBidPx);
                  }
                }}
                className="inline-flex items-center gap-1.5 hover:underline"
                title={isFa ? 'کلیک برای پر کردن قیمت لیمیت خرید' : 'Click to fill Buy Limit'}
              >
                <span className="text-dim">{isFa ? 'بهترین خرید:' : 'Best Bid:'}</span>
                <span dir="ltr" className="font-num font-black text-jade">${fmtPx(bestBidPx)}</span>
              </button>
              <span className="text-dim">·</span>
              <button
                type="button"
                onClick={() => {
                  if (bestAskPx) {
                    setOrderType('LIMIT');
                    setLimitPrice(bestAskPx);
                  }
                }}
                className="inline-flex items-center gap-1.5 hover:underline"
                title={isFa ? 'کلیک برای پر کردن قیمت لیمیت فروش' : 'Click to fill Sell Limit'}
              >
                <span className="text-dim">{isFa ? 'بهترین فروش:' : 'Best Ask:'}</span>
                <span dir="ltr" className="font-num font-black text-loss">${fmtPx(bestAskPx)}</span>
              </button>
              <span className="hidden sm:inline text-dim">
                · {isFa ? 'اسپرد:' : 'Spread:'}{' '}
                <strong dir="ltr" className="font-num text-main">{snap?.spreadPct ?? '0.02'}%</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-[190px] flex-1 max-w-xs">
              <span dir="ltr" className="font-num font-black text-[10px] text-jade">{imbalanceVal.toFixed(0)}%</span>
              <div className="flex-1 h-2 rounded-full bg-rose-500/30 overflow-hidden flex">
                <div
                  className="h-full bg-[#0D9455] transition-all duration-300"
                  style={{ width: `${Math.max(8, Math.min(92, imbalanceVal))}%` }}
                />
              </div>
              <span dir="ltr" className="font-num font-black text-[10px] text-loss">{(100 - imbalanceVal).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Clean, Equal-Height Pro Order Ticket */}
        <form onSubmit={prepareOrderConfirmation} className="xl:col-span-4 panel rounded-[26px] p-4 sm:p-5 flex flex-col justify-between gap-3 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CoinIcon symbol={symbol} size={22} />
                <span className="font-display font-bold text-base text-main">{isFa ? `معامله ${symbol.replace('USDT', '')}` : `Trade ${symbol}`}</span>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full badge-signal">
                {data.config.trading_mode} · {marketType}
              </span>
            </div>

            <div className={marketType === 'SPOT' ? 'grid grid-cols-1 p-1 rounded-xl bg-black/15 dark:bg-black/30 border hairline' : 'grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/15 dark:bg-black/30 border hairline'}>
              {(['LONG', ...(marketType === 'FUTURES' ? (['SHORT'] as const) : [])] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSide(s);
                    const entryPx = orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : lastPx;
                    if (tpslMode === 'PCT' && entryPx > 0) {
                      const slPx = calcPriceFromPct({ entryPrice: entryPx, side: s, kind: 'SL', pct: Number(tpslPcts.stopLoss) });
                      const p1Px = calcPriceFromPct({ entryPrice: entryPx, side: s, kind: 'TP', pct: Number(tpslPcts.tp1) });
                      const p2Px = calcPriceFromPct({ entryPrice: entryPx, side: s, kind: 'TP', pct: Number(tpslPcts.tp2) });
                      const p3Px = calcPriceFromPct({ entryPrice: entryPx, side: s, kind: 'TP', pct: Number(tpslPcts.tp3) });
                      if (slPx !== null) setStopLoss(formatLevelPrice(slPx));
                      if (p1Px !== null) setTp1(formatLevelPrice(p1Px));
                      if (p2Px !== null) setTp2(formatLevelPrice(p2Px));
                      if (p3Px !== null) setTp3(formatLevelPrice(p3Px));
                    } else {
                      applyAutoLevels(lastPx, s, orderType === 'LIMIT');
                    }
                  }}
                  className={`py-2.5 rounded-lg font-black transition flex items-center justify-center gap-1.5 ${
                    effectiveSide === s ? (s === 'LONG' ? 'bg-jade text-black shadow-sm' : 'bg-rose-500 text-white shadow-sm') : 'text-dim hover:text-main'
                  }`}
                >
                  {s === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{marketType === 'SPOT' ? (isFa ? 'خرید اسپات SPOT' : 'SPOT BUY') : s === 'LONG' ? (isFa ? 'خرید LONG' : 'LONG') : isFa ? 'فروش SHORT' : 'SHORT'}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['MARKET', 'LIMIT'] as const).map((ot) => (
                <button
                  key={ot}
                  type="button"
                  onClick={() => {
                    setOrderType(ot);
                    if (ot === 'LIMIT' && !limitPrice && lastPx > 0) {
                      const dec = lastPx >= 1000 ? 2 : lastPx >= 1 ? 4 : 6;
                      setLimitPrice(lastPx.toFixed(dec));
                    }
                  }}
                  className={`py-2 rounded-xl font-bold ${orderType === ot ? 'btn-gold' : 'btn-ghost text-dim'}`}
                >
                  {ot === 'MARKET' ? (isFa ? 'مارکت لحظه‌ای' : 'Market') : isFa ? 'سفارش لیمیت' : 'Limit'}
                </button>
              ))}
            </div>

            {marketType === 'FUTURES' && (
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
            )}

            {orderType === 'LIMIT' && (
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? `قیمت ورود لیمیت (${symbol})` : 'Limit Entry Price'}</label>
                <input
                  value={limitPrice}
                  onChange={(e) => {
                    const nextLimit = e.target.value;
                    setLimitPrice(nextLimit);
                    const px = Number(nextLimit);
                    if (tpslMode === 'PCT' && Number.isFinite(px) && px > 0) {
                      const slPx = calcPriceFromPct({ entryPrice: px, side: effectiveSide, kind: 'SL', pct: Number(tpslPcts.stopLoss) });
                      const p1Px = calcPriceFromPct({ entryPrice: px, side: effectiveSide, kind: 'TP', pct: Number(tpslPcts.tp1) });
                      const p2Px = calcPriceFromPct({ entryPrice: px, side: effectiveSide, kind: 'TP', pct: Number(tpslPcts.tp2) });
                      const p3Px = calcPriceFromPct({ entryPrice: px, side: effectiveSide, kind: 'TP', pct: Number(tpslPcts.tp3) });
                      if (slPx !== null) setStopLoss(formatLevelPrice(slPx));
                      if (p1Px !== null) setTp1(formatLevelPrice(p1Px));
                      if (p2Px !== null) setTp2(formatLevelPrice(p2Px));
                      if (p3Px !== null) setTp3(formatLevelPrice(p3Px));
                    }
                  }}
                  placeholder={lastPx ? fmtPx(lastPx) : 'USDT'}
                  className="field font-num text-xs py-2"
                />
              </div>
            )}

            {/* Margin % Quick Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-dim">{isFa ? 'درصد سرمایه درگیر' : 'Margin Allocation'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{marginPct}% ({fmtUsd(marginEst)})</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[5, 10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMarginPct(pct)}
                    className={`py-1.5 rounded-lg text-[10px] font-black transition ${
                      marginPct === pct ? 'btn-gold' : 'btn-ghost text-dim'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {marketType === 'FUTURES' && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-dim">{isFa ? 'اهرم معاملاتی' : 'Leverage'}</span>
                  <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold)' }}>{lev}×</span>
                </div>
                <SmoothSlider min={1} max={50} value={lev} onChange={setLev} dir="ltr" />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-bold text-sub">{isFa ? 'حد ضرر و تارگت‌های سود' : 'Stop Loss & Take Profits'}</span>
                <div className="flex items-center gap-1.5">
                  <TpSlModeSwitch mode={tpslMode} onChange={switchTicketTpSlMode} isFa={isFa} compact />
                  <button
                    type="button"
                    onClick={() => applyAutoLevels(lastPx, effectiveSide, orderType === 'LIMIT')}
                    className="text-[10px] font-bold text-[var(--gold)] hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{isFa ? 'خودکار' : 'Reset'}</span>
                  </button>
                </div>
              </div>

              {tpslMode === 'PRICE' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'حد ضرر SL ($)' : 'Stop Loss ($)'}</label>
                    <input
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      className={`field font-num text-xs py-1.5 ${slConflict ? '!border-rose-500' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۱ ($)' : 'TP 1 ($)'}</label>
                    <input value={tp1} onChange={(e) => setTp1(e.target.value)} className="field font-num text-xs py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۲ ($)' : 'TP 2 ($)'}</label>
                    <input value={tp2} onChange={(e) => setTp2(e.target.value)} className="field font-num text-xs py-1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-0.5">{isFa ? 'تارگت ۳ ($)' : 'TP 3 ($)'}</label>
                    <input value={tp3} onChange={(e) => setTp3(e.target.value)} className="field font-num text-xs py-1.5" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-loss font-bold">{isFa ? 'حد ضرر SL (%)' : 'SL (%)'}</label>
                        {stopLoss && (
                          <span dir="ltr" className="text-[9.5px] font-num text-dim">
                            ≈ ${stopLoss}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="any"
                        min={0.05}
                        max={95}
                        dir="ltr"
                        value={tpslPcts.stopLoss}
                        onChange={(e) => updateTicketPct('stopLoss', e.target.value)}
                        placeholder="1.5"
                        className="field font-num text-xs py-1.5"
                      />
                      <div className="flex gap-1 mt-1" dir="ltr">
                        {['1', '2', '3', '5'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateTicketPct('stopLoss', p)}
                            className={`flex-1 py-0.5 rounded text-[9px] font-num font-bold ${
                              tpslPcts.stopLoss === p ? 'bg-rose-500 text-white' : 'bg-[var(--soft)] text-dim hover:text-main'
                            }`}
                          >
                            -{p}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-jade font-bold">{isFa ? 'تارگت ۱ (%)' : 'TP 1 (%)'}</label>
                        {tp1 && (
                          <span dir="ltr" className="text-[9.5px] font-num text-dim">
                            ≈ ${tp1}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="any"
                        min={0.05}
                        max={500}
                        dir="ltr"
                        value={tpslPcts.tp1}
                        onChange={(e) => updateTicketPct('tp1', e.target.value)}
                        placeholder="2"
                        className="field font-num text-xs py-1.5"
                      />
                      <div className="flex gap-1 mt-1" dir="ltr">
                        {['2', '5', '10', '15'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateTicketPct('tp1', p)}
                            className={`flex-1 py-0.5 rounded text-[9px] font-num font-bold ${
                              tpslPcts.tp1 === p ? 'bg-jade text-slate-950' : 'bg-[var(--soft)] text-dim hover:text-main'
                            }`}
                          >
                            +{p}%
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-dim">{isFa ? 'تارگت ۲ (%)' : 'TP 2 (%)'}</label>
                        {tp2 && (
                          <span dir="ltr" className="text-[9.5px] font-num text-dim">
                            ≈ ${tp2}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="any"
                        min={0.05}
                        max={500}
                        dir="ltr"
                        value={tpslPcts.tp2}
                        onChange={(e) => updateTicketPct('tp2', e.target.value)}
                        placeholder="3.5"
                        className="field font-num text-xs py-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] text-dim">{isFa ? 'تارگت ۳ (%)' : 'TP 3 (%)'}</label>
                        {tp3 && (
                          <span dir="ltr" className="text-[9.5px] font-num text-dim">
                            ≈ ${tp3}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="any"
                        min={0.05}
                        max={500}
                        dir="ltr"
                        value={tpslPcts.tp3}
                        onChange={(e) => updateTicketPct('tp3', e.target.value)}
                        placeholder="5.5"
                        className="field font-num text-xs py-1.5"
                      />
                    </div>
                  </div>
                  {effectiveLev > 1 && Number(tpslPcts.tp1) > 0 && (
                    <div dir="ltr" className="text-[10px] text-dim flex items-center justify-between px-1">
                      <span className="text-loss">SL ROE: -{calcRoePct(Number(tpslPcts.stopLoss || 0), effectiveLev)}%</span>
                      <span className="text-jade font-bold">TP1 ROE: +{calcRoePct(Number(tpslPcts.tp1 || 0), effectiveLev)}%</span>
                    </div>
                  )}
                </div>
              )}

              {slConflict && (
                <div className="text-[10px] text-loss font-bold flex items-center justify-between bg-rose-500/10 rounded-lg px-2.5 py-1.5">
                  <span>
                    {isFa
                      ? `حد ضرر با جهت ${effectiveSide} هم‌خوانی ندارد!`
                      : `SL is on the wrong side for ${effectiveSide}!`}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyAutoLevels(lastPx, effectiveSide, false)}
                    className="underline font-black"
                  >
                    {isFa ? 'اصلاح فوری' : 'Fix'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="rounded-2xl bg-[var(--soft)] border hairline p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'مارجین تخمینی' : 'Est. Margin'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{fmtUsd(marginEst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'حجم کل پوزیشن' : 'Position Notional'}</span>
                <span dir="ltr" className="font-num font-bold text-main">{fmtUsd(marginEst * effectiveLev)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim inline-flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> {isFa ? 'نسبت ریسک به ریوارد' : 'Risk : Reward'}
                </span>
                <span dir="ltr" className="font-num font-bold text-jade">
                  {rrPreview !== '—' ? `1 : ${rrPreview}` : '—'} {riskUsdEst > 0 ? `(Risk ${fmtUsd(riskUsdEst)})` : ''}
                </span>
              </div>
              {estLiqPx > 0 && (
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'لیکویید شدن تقریبی' : 'Est. Liq Price'}</span>
                  <span dir="ltr" className="font-num font-bold text-amber-400">${fmtPx(estLiqPx)}</span>
                </div>
              )}
            </div>

            {orderMsg && (
              <div className="text-[11px] font-bold inline-flex items-center gap-1" style={{ color: 'var(--gold)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{orderMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 ${
                effectiveSide === 'LONG' ? 'btn-gold' : 'bg-rose-500 text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{submitting ? '...' : isFa ? 'دلارینو ترید کن برام' : 'Execute Protected Trade'}</span>
            </button>

            <p className="text-[10px] text-dim flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-jade shrink-0" />
              <span>{isFa ? 'هیچ سفارشی بدون حد ضرر باز نمی‌شود.' : 'Protected by mandatory stop-loss guard.'}</span>
            </p>
          </div>
        </form>
      </div>

      {/* Full-Width 12-Column Unified Pro Workbench: Positions | Order Book | Chart AI | Pine/Py | Alerts & R:R */}
      <div className="panel rounded-[26px] p-4 sm:p-5 space-y-4 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 rounded-2xl bg-[var(--soft)] border hairline">
          <button
            type="button"
            onClick={() => setRightIntel('positions')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'positions' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isFa
                ? `پوزیشن‌ها و سفارش‌ها (${data.openTrades.length + (data.pendingOrders?.length || 0)})`
                : `Positions (${data.openTrades.length})`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('book')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'book' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'دفتر سفارش‌ها و عمق' : 'Order Book'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('ai')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'ai' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'چارت AI و ستاپ' : 'Chart AI'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('script')}
            className={`py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'script' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? 'اسکریپت Pine/Py' : 'Pine / Python'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRightIntel('tools')}
            className={`col-span-2 sm:col-span-1 py-2.5 px-2 rounded-xl font-black transition flex items-center justify-center gap-1.5 text-[11px] ${
              rightIntel === 'tools' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>{isFa ? `هشدار قیمت (${alerts.filter((a) => a.is_active).length})` : 'Alerts & R:R'}</span>
          </button>
        </div>

        {rightIntel === 'positions' ? (
          <div className="space-y-3">
            {data.openTrades.length === 0 ? (
              <div className="py-8 text-center text-xs text-dim surface-soft rounded-2xl">
                {isFa ? 'پوزیشن بازی در این حساب ثبت نشده است.' : 'No open positions.'}
              </div>
            ) : (
              <div className="space-y-2">
                {data.openTrades.map((p) => {
                  const u = Number(p.unrealized_pnl || 0);
                  return (
                    <div key={p.id} className="rounded-2xl bg-[var(--soft)] border hairline px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${p.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
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
                        {u >= 0 ? `+$${u.toFixed(2)}` : `-$${Math.abs(u).toFixed(2)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditTpSlModal(p)}
                        className="btn-ghost px-2.5 py-1.5 rounded-xl font-bold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> TP/SL
                      </button>
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

            {data.pendingOrders && data.pendingOrders.length > 0 && (
              <div className="pt-2 border-t hairline space-y-1.5">
                {data.pendingOrders.map((po) => (
                  <div key={po.id} className="surface-soft rounded-xl px-3.5 py-2 flex items-center justify-between text-xs">
                    <span><strong>{po.symbol}</strong> · {po.direction} Limit @ ${po.limit_price}</span>
                    <button type="button" onClick={() => void cancelPending(po.id)} className="text-loss font-bold hover:underline">
                      {isFa ? 'لغو' : 'Cancel'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : rightIntel === 'ai' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-3">
              {aiAnalysis ? (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-sm ${aiAnalysis.direction === 'SHORT' || aiAnalysis.bias === 'SHORT' ? 'text-loss' : 'text-jade'}`}>
                      {aiAnalysis.direction ?? aiAnalysis.bias ?? 'NEUTRAL'} · {aiAnalysis.confidence ?? 0}%
                    </span>
                    {aiAnalysis.rrRatio && (
                      <span dir="ltr" className="font-num font-bold text-dim">R:R 1:{aiAnalysis.rrRatio}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-sub leading-relaxed whitespace-pre-wrap">{aiAnalysis.summary}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-num" dir="ltr">
                    <div className="surface-soft rounded-lg px-2 py-1.5">EN: ${fmtPx(aiAnalysis.entry)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-loss">SL: ${fmtPx(aiAnalysis.stopLoss)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-jade">TP1: ${fmtPx(aiAnalysis.tp1)}</div>
                    <div className="surface-soft rounded-lg px-2 py-1.5 text-jade">TP2: ${fmtPx(aiAnalysis.tp2)}</div>
                  </div>
                  {(aiAnalysis.stopLoss || aiAnalysis.tp1) && (
                    <button
                      type="button"
                      onClick={copyAiLevelsToTicket}
                      className="btn-emerald w-full py-2 rounded-xl text-[11px] flex items-center justify-center gap-1.5"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انتقال دقیق سطوح AI به فرم سفارش' : 'Copy AI Levels to Ticket'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-4 text-center space-y-2">
                  <Sparkles className="w-5 h-5 text-[var(--gold)] mx-auto" />
                  <p className="text-[11px] text-sub">
                    {isFa
                      ? `روی «تحلیل هوشمند AI» کلیک کنید تا سطوح ورود، حد ضرر و اهداف سود برای ${symbol} روی چارت رسم شوند.`
                      : `Click "AI Analyze" to draw smart Entry, SL, and TP levels for ${symbol} directly on the chart.`}
                  </p>
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
            </div>

            <div className="lg:col-span-5 flex flex-col gap-2.5">
              <div className="min-h-[120px] max-h-[200px] overflow-y-auto space-y-2 rounded-2xl bg-[var(--soft)] border hairline p-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-xl p-2 text-[11px] leading-relaxed ${
                      m.role === 'user' ? 'banner-cobalt-soft text-main' : 'surface-soft text-sub'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-[11px] text-dim text-center py-6">
                    {isFa ? 'گفتگوی زنده با دستیار چارت آماده است.' : 'Ask any question about this chart.'}
                  </p>
                )}
              </div>

              {chatHistory.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <History className="w-3.5 h-3.5 text-dim shrink-0" />
                  {chatHistory.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void loadSavedChat(c.id)}
                      className="px-2 py-1 rounded-lg surface-soft text-[10px] font-bold shrink-0 hover:border-[var(--gold)]"
                    >
                      {c.symbol} · {c.timeframe}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void askChartAI()}
                  placeholder={isFa ? 'سوال از چارت...' : 'Ask chart AI...'}
                  className="field text-xs py-2"
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => void askChartAI()}
                  className="btn-gold px-3.5 rounded-xl shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : rightIntel === 'book' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim pb-2 border-b hairline">
              <span>{isFa ? `اسپرد لحظه‌ای: ${snap?.spreadPct ?? '0.02'}%` : `Spread: ${snap?.spreadPct ?? '0.02'}%`}</span>
              <span>{isFa ? `نسبت فشار خریداران: ${snap?.imbalancePct ?? '50'}%` : `Bid Imbalance: ${snap?.imbalancePct ?? '50'}%`}</span>
              <span className="text-[10px]">{isFa ? 'کلیک روی هر ردیف قیمت را در سفارش لیمیت قرار می‌دهد' : 'Click any level to fill Limit Price'}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-num text-[11px]" dir="ltr">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-jade uppercase pb-1 px-2">
                  <span>Bid Price (USD)</span>
                  <span>Qty</span>
                </div>
                {(() => {
                  const rows = (snap?.orderBook.bids ?? []).slice(0, 10);
                  const maxQ = Math.max(0.001, ...rows.map((r) => Number(r[1] || 0)));
                  return rows.map(([p, s], idx) => {
                    const w = Math.min(100, Math.round((Number(s) / maxQ) * 100));
                    return (
                      <button
                        type="button"
                        key={`b-${idx}`}
                        onClick={() => {
                          setOrderType('LIMIT');
                          setLimitPrice(p);
                        }}
                        className="relative w-full overflow-hidden flex justify-between text-jade bg-jade/5 hover:bg-jade/15 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <span className="absolute inset-y-0 right-0 bg-jade/12 pointer-events-none" style={{ width: `${w}%` }} />
                        <span className="relative font-bold">${fmtPx(p)}</span>
                        <span className="relative text-dim">{Number(s).toFixed(3)}</span>
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-loss uppercase pb-1 px-2">
                  <span>Ask Price (USD)</span>
                  <span>Qty</span>
                </div>
                {(() => {
                  const rows = (snap?.orderBook.asks ?? []).slice(0, 10);
                  const maxQ = Math.max(0.001, ...rows.map((r) => Number(r[1] || 0)));
                  return rows.map(([p, s], idx) => {
                    const w = Math.min(100, Math.round((Number(s) / maxQ) * 100));
                    return (
                      <button
                        type="button"
                        key={`a-${idx}`}
                        onClick={() => {
                          setOrderType('LIMIT');
                          setLimitPrice(p);
                        }}
                        className="relative w-full overflow-hidden flex justify-between text-loss bg-rose-500/5 hover:bg-rose-500/15 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <span className="absolute inset-y-0 left-0 bg-rose-500/12 pointer-events-none" style={{ width: `${w}%` }} />
                        <span className="relative font-bold">${fmtPx(p)}</span>
                        <span className="relative text-dim">{Number(s).toFixed(3)}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        ) : rightIntel === 'script' ? (
          <PineEditorDock
            lang={lang}
            symbol={symbol}
            timeframe={tf}
            initialScript={pendingPineSample}
            onAppliedToChart={(overlayObj) => setCustomChartOverlay(overlayObj)}
            onClearFromChart={() => setCustomChartOverlay(null)}
            onActivatedOnBot={onRefresh}
          />
        ) : (
          /* Clean 12-Col Spacious Live Price Alerts + R:R Summary */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <form onSubmit={createPriceAlert} className="lg:col-span-6 surface-soft rounded-2xl p-4 space-y-3 border hairline">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-main flex items-center gap-1.5 text-xs">
                  <BellRing className="w-4 h-4 text-[var(--gold)]" />
                  <span>{isFa ? `ثبت هشدار قیمت زنده برای ${symbol}` : `Live Price Alert · ${symbol}`}</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full badge-signal font-bold">
                  {isFa ? 'اطلاع فوری در وب و تلگرام' : 'Web + Telegram'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'شرط عبور قیمت' : 'Condition'}</label>
                  <select
                    value={alertCond}
                    onChange={(e) => setAlertCond(e.target.value as 'ABOVE' | 'BELOW')}
                    className="field w-full text-xs h-10 px-3"
                  >
                    <option value="ABOVE">{isFa ? 'بالاتر از (≥)' : 'Crosses Above (≥)'}</option>
                    <option value="BELOW">{isFa ? 'پایین‌تر از (≤)' : 'Drops Below (≤)'}</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'قیمت هدف (USDT)' : 'Target Price ($)'}</label>
                  <input
                    value={alertTarget}
                    onChange={(e) => setAlertTarget(e.target.value)}
                    placeholder={lastPx ? fmtPx(lastPx) : 'Target $'}
                    className="field w-full font-num text-xs h-10 px-3"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] text-dim font-bold block mb-1">{isFa ? 'یادداشت اختیاری' : 'Optional Note'}</label>
                  <input
                    value={alertNote}
                    onChange={(e) => setAlertNote(e.target.value)}
                    placeholder={isFa ? 'مثلاً: شکست مقاومت کلیدی یا نقطه ورود...' : 'e.g. Breakout level...'}
                    className="field w-full text-xs h-10 px-3"
                  />
                </div>
                <button type="submit" disabled={alertBusy} className="btn-gold h-10 px-5 rounded-xl text-xs font-black shrink-0">
                  {alertBusy ? '...' : isFa ? 'ثبت هشدار' : 'Set Alert'}
                </button>
              </div>
            </form>

            <div className="lg:col-span-6 space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-main">{isFa ? `هشدارهای ثبت‌شده (${alerts.length})` : `Active & Recent Alerts (${alerts.length})`}</span>
                <span className="text-[10px] text-dim">{isFa ? 'پایش لحظه‌ای قیمت ۲۴/۷' : '24/7 Live Watch'}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim border hairline">
                    {isFa
                      ? 'هنوز هشدار قیمتی ثبت نکرده‌اید. به محض رسیدن قیمت به هدف، در تلگرام و پنل به شما اطلاع می‌دهیم.'
                      : 'No price alerts set yet. Alerts notify you on Web & Telegram.'}
                  </div>
                ) : (
                  alerts.map((al) => (
                    <div key={al.id} className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs border hairline">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={al.symbol} size={20} />
                        <div>
                          <div className="font-bold text-main font-num">
                            {al.symbol} {al.condition === 'ABOVE' ? '≥' : '≤'} ${al.target_price}
                          </div>
                          {al.note && <div className="text-[10px] text-dim">{al.note}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${al.is_active ? 'bg-jade/15 text-jade' : 'bg-[var(--soft)] border hairline text-dim'}`}>
                          {al.is_active ? (isFa ? 'فعال' : 'Active') : isFa ? 'عمل‌کرده' : 'Triggered'}
                        </span>
                        <button type="button" onClick={() => void deletePriceAlert(al.id)} className="text-dim hover:text-loss">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Summary Bar for Open Positions when viewing other Workbench tabs */}
      {rightIntel !== 'positions' && data.openTrades.length > 0 && (
        <div className="panel rounded-[22px] p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-main">
            <span className="h-2 w-2 rounded-full bg-jade live-dot" />
            <span>
              {isFa
                ? `${data.openTrades.length} پوزیشن باز فعال در حساب دارید`
                : `You have ${data.openTrades.length} active open position(s)`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRightIntel('positions')}
            className="btn-gold px-3.5 py-1.5 rounded-xl text-[11px] font-black"
          >
            {isFa ? 'مشاهده و مدیریت پوزیشن‌ها' : 'Manage Positions'}
          </button>
        </div>
      )}

      {editPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4"
            onClick={() => setEditPos(null)}
          >
            <form onSubmit={saveEditTpSl} className="pop-in panel !bg-[var(--panel)] rounded-[26px] w-full max-w-sm p-6 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-base text-main">{isFa ? `ویرایش TP/SL · ${editPos.symbol}` : `Edit TP/SL · ${editPos.symbol}`}</h3>
                  <p dir="ltr" className="text-[10px] text-dim font-num">
                    {editPos.direction} · Entry ${editPos.entry_price} · {editPos.leverage}×
                  </p>
                </div>
                <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sub">{isFa ? 'نحوه ورود:' : 'Input Mode:'}</span>
                <TpSlModeSwitch
                  mode={editTpSlMode}
                  onChange={(next) => {
                    if (next === 'PCT') {
                      const entryPx = Number(editPos.entry_price || 0);
                      const pSl = calcPctFromPrice({ entryPrice: entryPx, side: editPos.direction, kind: 'SL', targetPrice: Number(editForm.stopLoss) });
                      const p1 = calcPctFromPrice({ entryPrice: entryPx, side: editPos.direction, kind: 'TP', targetPrice: Number(editForm.tp1) });
                      const p2 = calcPctFromPrice({ entryPrice: entryPx, side: editPos.direction, kind: 'TP', targetPrice: Number(editForm.tp2) });
                      const p3 = calcPctFromPrice({ entryPrice: entryPx, side: editPos.direction, kind: 'TP', targetPrice: Number(editForm.tp3) });
                      setEditPcts({
                        stopLoss: pSl !== null ? String(pSl) : '1.5',
                        tp1: p1 !== null ? String(p1) : '2',
                        tp2: p2 !== null ? String(p2) : '',
                        tp3: p3 !== null ? String(p3) : '',
                      });
                    }
                    setEditTpSlMode(next);
                  }}
                  isFa={isFa}
                  compact
                />
              </div>

              {editTpSlMode === 'PRICE' ? (
                <>
                  <input value={editForm.stopLoss} onChange={(e) => setEditForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="Stop Loss ($)" className="field font-num" required />
                  <input value={editForm.tp1} onChange={(e) => setEditForm((f) => ({ ...f, tp1: e.target.value }))} placeholder="TP1 ($)" className="field font-num" required />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editForm.tp2} onChange={(e) => setEditForm((f) => ({ ...f, tp2: e.target.value }))} placeholder="TP2 ($)" className="field font-num" />
                    <input value={editForm.tp3} onChange={(e) => setEditForm((f) => ({ ...f, tp3: e.target.value }))} placeholder="TP3 ($)" className="field font-num" />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-loss font-bold">{isFa ? 'حد ضرر SL (%)' : 'Stop Loss (%)'}</span>
                      <span dir="ltr" className="font-num text-dim">≈ ${editForm.stopLoss || '—'}</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min={0.05}
                      max={95}
                      dir="ltr"
                      value={editPcts.stopLoss}
                      onChange={(e) => updateEditPct('stopLoss', e.target.value)}
                      placeholder="SL %"
                      className="field font-num"
                      required
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-jade font-bold">{isFa ? 'تارگت ۱ TP1 (%)' : 'TP 1 (%)'}</span>
                      <span dir="ltr" className="font-num text-dim">≈ ${editForm.tp1 || '—'}</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min={0.05}
                      max={500}
                      dir="ltr"
                      value={editPcts.tp1}
                      onChange={(e) => updateEditPct('tp1', e.target.value)}
                      placeholder="TP1 %"
                      className="field font-num"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-dim">TP2 (%)</span>
                        {editForm.tp2 && <span dir="ltr" className="font-num text-dim">≈ ${editForm.tp2}</span>}
                      </div>
                      <input type="number" step="any" min={0.05} max={500} dir="ltr" value={editPcts.tp2} onChange={(e) => updateEditPct('tp2', e.target.value)} placeholder="TP2 %" className="field font-num" />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-dim">TP3 (%)</span>
                        {editForm.tp3 && <span dir="ltr" className="font-num text-dim">≈ ${editForm.tp3}</span>}
                      </div>
                      <input type="number" step="any" min={0.05} max={500} dir="ltr" value={editPcts.tp3} onChange={(e) => updateEditPct('tp3', e.target.value)} placeholder="TP3 %" className="field font-num" />
                    </div>
                  </div>
                </div>
              )}
              <button type="submit" className="btn-gold w-full py-3 rounded-xl font-black">{isFa ? 'ذخیره TP/SL' : 'Save TP/SL'}</button>
            </form>
          </div>,
          document.body
        )}

      <ConfirmTradeSheet
        open={Boolean(pendingConfirm)}
        lang={lang}
        order={pendingConfirm}
        busy={submitting}
        onConfirm={placeOrder}
        onCancel={() => setPendingConfirm(null)}
      />

      <TrustWalletTradePlaybook lang={lang} focusMode="FUTURES" compact />
    </div>
  );
}
