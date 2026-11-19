import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  Globe2,
  Layers,
  Link2,
  PlusCircle,
  Power,
  RefreshCw,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import type { Candle, SignalMixerResult, Timeframe } from '@dollarino/core';
import { ModeGraphicAI, ModeGraphicCodex, ModeGraphicTelegram } from '../components/BrandGraphics';
import { CandlestickChart, type ChartLevels, type ChartOverlays, type KbosChartOverlays } from '../components/CandlestickChart';
import { CoinIcon } from '../components/CoinIcon';
import type { EntitlementSummary, NavTab } from '../components/Layout';
import { SetupWizardModal } from '../components/SetupWizardModal';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { WeeklyTradingCardModal, type WeeklyCardMetrics } from '../components/WeeklyTradingCardModal';
import { apiFetch } from '../lib/api';
import { dict, type Lang } from '../lib/i18n';

export interface DashboardPayload {
  config: {
    bot_state: string;
    trading_mode: 'PAPER' | 'LIVE';
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    margin_mode: 'ISOLATED' | 'CROSS';
    symbol: string;
    strategy_key: string;
    entry_timeframe: Timeframe;
    higher_timeframe: Timeframe;
    margin_pct: number;
    max_leverage: number;
    max_open_positions: number;
    daily_max_loss_pct: number;
    ai_gate_enabled: number;
    ai_min_confidence: number;
    webhook_secret: string;
    signal_channel_handle: string;
    paper_balance: string;
    mixer_threshold?: number;
    mixer_weights_json?: string;
    strategy_flow_json?: string;
    kbos_params_json?: string;
    risk_profile_json?: string;
    trailing_stop_enabled?: number;
    trailing_stop_pct?: number;
    trail_after_tp1?: number;
    auto_scan_top?: number;
    scan_scope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
    allow_auto_flip?: number;
    allow_pyramiding?: number;
    watchlist_json?: string;
  };
  balance: { free: string; used: string; total: string; currency: string };
  activeExchange: { provider: string; label: string };
  activeAI: { provider: string; model: string } | null;
  platformAI?: {
    configured: boolean;
    activeCount: number;
    totalCount: number;
    consensusMode: string;
    effectiveModeLabelFa: string;
    effectiveModeLabelEn: string;
    engines: Array<{
      id: string;
      slot_order: number;
      provider: string;
      label: string;
      model: string;
      weight: number;
      is_active: number;
    }>;
    latestSignals: Array<{
      id: string;
      symbol: string;
      timeframe: string;
      action: string;
      confidence: number;
      model_count: number;
      consensus_mode: string;
      thesis: string;
      created_at: string;
    }>;
  };
  entitlement?: EntitlementSummary;
  stats: {
    totalTrades: number;
    wins: number;
    winRate: number;
    totalPnl: number;
    todayPnl: number;
    unrealizedPnl: number;
    last24hPnl?: number;
    last7dPnl?: number;
    totalDeposited?: number;
    profitFactor: number;
  };
  charts: {
    dailyPnl: Array<{ day: string; pnl: number }>;
    weeklyResults?: Array<{ day: string; pnl: number; count: number; wins: number }>;
    monthlyPnl?: Array<{ month: string; pnl: number }>;
    equityCurve?: Array<{ time: string; equity: number }>;
  };
  openTrades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    mark_price?: string;
    unrealized_pnl?: string;
    roe_pct?: string;
    capital_pct?: string;
    liquidation_est?: string;
    sparkline?: number[];
    initial_quantity: string;
    remaining_quantity: string;
    margin_used: string;
    leverage: number;
    current_stop_loss: string;
    tp1: string;
    tp2: string | null;
    tp3: string | null;
    tp1_hit: number;
    tp2_hit: number;
    risk_free_active: number;
    realized_pnl: string;
    ai_confidence?: number | null;
    ai_reasoning?: string | null;
    strategy_key: string;
    opened_at: string;
  }>;
  pendingOrders?: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    order_type: string;
    price: string;
    quantity: string;
    leverage: number;
    stop_loss: string;
    tp1: string;
    created_at: string;
  }>;
  closedTrades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    exit_price: string | null;
    realized_pnl: string;
    exit_reason: string | null;
    closed_at: string | null;
  }>;
  recentSignals: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    price: string;
    stop_loss: string;
    tp1: string;
    tp2?: string | null;
    tp3?: string | null;
    leverage: number;
    status: string;
    source: string;
    created_at: string;
  }>;
  recentAiDecisions?: Array<{
    id: string;
    level: string;
    symbol: string | null;
    message: string;
    details_json: string | null;
    created_at: string;
  }>;
  mixerSnapshot?: SignalMixerResult | null;
  riskProfile?: {
    preset?: string;
    marketBias?: string;
    preferredSession?: string;
    entryStyle?: string;
    trailingStop?: boolean;
    trailingDistance?: number;
  };
}

interface MarketOverview {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  market24h: {
    lastPrice: string;
    changePct24h: string;
    high24h: string;
    low24h: string;
    volume24hUsd: string;
    fundingRate: string;
    bestBid: string;
    bestAsk: string;
  };
  orderBook: { bids: Array<[string, string]>; asks: Array<[string, string]> };
  spreadPct: string;
  imbalancePct: string;
  htfTrend: string;
  indicators: {
    ema20: Array<{ time: number; value: number }>;
    ema50: Array<{ time: number; value: number }>;
    ema200: Array<{ time: number; value: number }>;
    rsi14: number;
    atr14: number;
  };
  kbosOverlays?: KbosChartOverlays;
}

const COIN_NAMES_FA: Record<string, string> = {
  BTCUSDT: 'بیت‌کوین',
  ETHUSDT: 'اتریوم',
  SOLUSDT: 'سولانا',
  BNBUSDT: 'بایننس کوین',
  XRPUSDT: 'ریپل',
  DOGEUSDT: 'دوج‌کوین',
  AVAXUSDT: 'آوالانچ',
  SUIUSDT: 'سویی',
  TONUSDT: 'تون‌کوین',
  LINKUSDT: 'چین‌لینک',
  ADAUSDT: 'کاردانو',
  TRXUSDT: 'ترون',
  NEARUSDT: 'نیر پروتکل',
  PEPEUSDT: 'پپه',
  ARBUSDT: 'آربیتروم',
  OPUSDT: 'اپتیمیزم',
  LTCUSDT: 'لایت‌کوین',
};

const RISK_PRESETS = [
  {
    id: 'calm',
    icon: '🛡️',
    titleFa: 'آرام و مطمئن',
    titleEn: 'Calm & Safe',
    descFa: 'ورود با ۳٪ سرمایه و اهرم پایین (۳x) · مناسب شروع بی‌دغدغه',
    descEn: '3% margin · 3x max leverage · Ultra-conservative shield',
    marginPct: 3,
    maxLev: 3,
    dailyLoss: 4,
    trailingPct: 1.5,
  },
  {
    id: 'balanced',
    icon: '⚖️',
    titleFa: 'متعادل (پیشنهادی)',
    titleEn: 'Balanced (Default)',
    descFa: 'ورود با ۵٪ سرمایه و اهرم ۵x · بهترین تعادل سود و امنیت',
    descEn: '5% margin · 5x max leverage · Optimal growth & safety',
    marginPct: 5,
    maxLev: 5,
    dailyLoss: 6,
    trailingPct: 2.0,
  },
  {
    id: 'bold',
    icon: '⚡',
    titleFa: 'پرقدرت و آزاد',
    titleEn: 'Bold & Free',
    descFa: 'ورود با ۱۰٪ سرمایه و اهرم تا ۱۵x · بیشترین شکار فرصت‌ها',
    descEn: '10% margin · up to 15x leverage · Maximum opportunity capture',
    marginPct: 10,
    maxLev: 15,
    dailyLoss: 12,
    trailingPct: 2.5,
  },
];

function fmtPx(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  if (px >= 1000) return px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(2);
  if (px >= 0.01) return px.toFixed(4);
  return px.toFixed(6);
}

export function DashboardPage({
  lang,
  data,
  markets,
  onRefresh,
  onOpenConnections,
  onOpenTab,
}: {
  lang: Lang;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onRefresh: () => void;
  onOpenConnections?: () => void;
  onOpenTab?: (tab: NavTab) => void;
}) {
  const t = dict[lang];
  const isFa = lang === 'fa';

  const [symbol, setSymbol] = useState(data.config.symbol || 'BTCUSDT');
  const [tf, setTf] = useState<Timeframe>('15m');
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [proMode, setProMode] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  // Live Market Explorer (Kifpool Screenshots #1 & #2)
  const [marketSearch, setMarketSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState<'all' | 'gainers' | 'losers' | 'watchlist'>('all');

  // Trader Freedom Controls
  const [traderFreedomOpen, setTraderFreedomOpen] = useState(false);

  const [busyAction, setBusyAction] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [topupModalOpen, setTopupModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(5000);
  const [topupMsg, setTopupMsg] = useState('');
  const [settleReport, setSettleReport] = useState<{
    durationSec: number;
    tradesClosed: number;
    netSessionPnl: number;
    finalBalance: number;
  } | null>(null);

  // Pro Mode state
  const [aiRunning, setAiRunning] = useState(false);
  const [aiRunOutput, setAiRunOutput] = useState<{
    action: string;
    confidence: number;
    entry: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    thesis: string;
    modelCount?: number;
    executed?: boolean;
    error?: string;
  } | null>(null);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(data.config.max_leverage || 5);
  const [slInput, setSlInput] = useState('');
  const [tp1Input, setTp1Input] = useState('');
  const [tp2Input, setTp2Input] = useState('');
  const [tp3Input, setTp3Input] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketMsg, setTicketMsg] = useState<string | null>(null);

  const [editPos, setEditPos] = useState<DashboardPayload['openTrades'][number] | null>(null);
  const [editSlVal, setEditSlVal] = useState('');
  const [editTp1Val, setEditTp1Val] = useState('');

  // Silent auto-refresh every 15s while bot is running or trades are open
  useEffect(() => {
    const isRunningNow = data.config.bot_state.startsWith('RUNNING');
    if (!isRunningNow && data.openTrades.length === 0) return;
    const timer = setInterval(() => onRefresh(), 15_000);
    return () => clearInterval(timer);
  }, [data.config.bot_state, data.openTrades.length, onRefresh]);

  useEffect(() => {
    setSymbol(data.config.symbol || 'BTCUSDT');
  }, [data.config.symbol]);

  const loadMarket = async () => {
    try {
      const m = await apiFetch<MarketOverview>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`);
      setOverview(m);
    } catch {
      /* ignore transient fetch */
    }
  };

  useEffect(() => {
    if (proMode) void loadMarket();
  }, [symbol, tf, proMode]);

  const isRunning = data.config.bot_state.startsWith('RUNNING');
  const isPaid = Boolean(data.entitlement?.hasPaidPlan);
  const activeStrategy = data.config.strategy_key || 'dollarino_v01';
  const scanScope = data.config.scan_scope || (data.config.auto_scan_top ? 'ALL_MARKET' : 'SINGLE');
  const maxOpenPos = data.config.max_open_positions || 6;
  const allowFlip = Boolean(data.config.allow_auto_flip ?? 1);

  const currentPresetId = useMemo(() => {
    if (data.riskProfile?.preset === 'calm' || data.config.margin_pct <= 3) return 'calm';
    if (data.riskProfile?.preset === 'bold' || data.config.margin_pct >= 9) return 'bold';
    return 'balanced';
  }, [data.riskProfile?.preset, data.config.margin_pct]);

  const totalEq = Number(data.balance.total || 0);
  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const freePct = totalEq > 0 ? Math.min(100, Math.round((freeBal / totalEq) * 100)) : 100;
  const todayPnl = Number(data.stats.todayPnl || 0);
  const totalPnl = Number(data.stats.totalPnl || 0);
  const unrealized = Number(data.stats.unrealizedPnl || 0);
  const platformAiConfigured = Boolean(data.platformAI?.configured || data.activeAI);

  const showToast = (msg: string, isErr = false) => {
    if (isErr) {
      setModeError(msg);
      setNotice(null);
    } else {
      setNotice(msg);
      setModeError(null);
      setTimeout(() => setNotice(null), 3500);
    }
  };

  const selectTradingMode = async (mode: 'ai' | 'dorna') => {
    setModeError(null);
    const key = mode === 'ai' ? 'ai_autonomous_agent' : 'dollarino_v01';
    if (mode === 'ai' && !isPaid) {
      setModeError(
        isFa
          ? 'برای فعال‌سازی «هوش مصنوعی دلارینو»، اشتراک Pro یا VIP لازم است. همین الان می‌توانید با «استراتژی منتخب دلارینو» در دمو رایگان معامله کنید!'
          : 'Dollarino AI requires Pro or VIP. Try Dollarino Select (Dorna V1) free in Paper Demo!'
      );
      return;
    }
    if (mode === 'ai' && !platformAiConfigured) {
      setModeError(
        isFa
          ? '«هوش مصنوعی دلارینو» در حال تنظیم توسط مدیریت است. فعلاً می‌توانید با «استراتژی منتخب دلارینو» شروع کنید!'
          : 'Dollarino AI is awaiting admin activation. Use Dollarino Select for now!'
      );
      return;
    }
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          strategy_key: key,
          ai_gate_enabled: mode === 'ai' ? 1 : 0,
        }),
      });
      showToast(
        mode === 'ai'
          ? isFa ? 'حالت «هوش مصنوعی دلارینو» انتخاب شد ✨' : 'Switched to Dollarino AI ✨'
          : isFa ? '«استراتژی منتخب دلارینو (موتور دُرنا)» انتخاب شد 🚀' : 'Switched to Dollarino Select (Dorna V1) 🚀'
      );
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', true);
    } finally {
      setBusyAction(false);
    }
  };

  const selectRiskPreset = async (preset: (typeof RISK_PRESETS)[number]) => {
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          margin_pct: preset.marginPct,
          max_leverage: preset.maxLev,
          daily_max_loss_pct: preset.dailyLoss,
          trailing_stop_enabled: 1,
          trailing_stop_pct: preset.trailingPct,
          risk_profile_json: {
            preset: preset.id,
            trailingStop: true,
            trailingDistance: preset.trailingPct,
          },
        }),
      });
      showToast(isFa ? `تنظیمات ریسک روی «${preset.titleFa}» قرار گرفت ✅` : `Risk preset set to ${preset.titleEn}`);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', true);
    } finally {
      setBusyAction(false);
    }
  };

  const updateScanScope = async (nextScope: 'ALL_MARKET' | 'TOP_COINS' | 'SINGLE', nextSymbol = symbol) => {
    setSymbol(nextSymbol);
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          symbol: nextSymbol,
          scan_scope: nextScope,
          auto_scan_top: nextScope === 'SINGLE' ? 0 : 1,
        }),
      });
      showToast(
        nextScope === 'ALL_MARKET'
          ? isFa ? 'اسکن آزاد کل بازار (۳۰+ ارز همزمان) فعال شد 🌐' : 'Full-Market Scanner (30+ coins) enabled 🌐'
          : nextScope === 'TOP_COINS'
            ? isFa ? 'اسکن ۱۰ ارز برتر بازار فعال شد ⭐' : 'Top 10 Coins Scanner enabled ⭐'
            : isFa ? `تمرکز ربات روی ${nextSymbol.replace('USDT', '')} تنظیم شد 🎯` : `Focused on ${nextSymbol}`
      );
      onRefresh();
    } finally {
      setBusyAction(false);
    }
  };

  const updateTraderFreedom = async (patch: Record<string, unknown>, msgFa: string, msgEn: string) => {
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      showToast(isFa ? msgFa : msgEn);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', true);
    } finally {
      setBusyAction(false);
    }
  };

  const toggleAccountMode = async (nextMode: 'PAPER' | 'LIVE') => {
    if (nextMode === data.config.trading_mode) return;
    setModeError(null);
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({ trading_mode: nextMode }),
      });
      showToast(
        nextMode === 'LIVE'
          ? isFa ? 'حساب واقعی صرافی فعال شد 🟢' : 'Live Exchange Mode active'
          : isFa ? 'حساب دمو رایگان فعال شد 🧪' : 'Paper Demo active'
      );
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Switch failed';
      setModeError(msg);
      if (msg.includes('صرافی') && onOpenConnections) {
        setTimeout(() => onOpenConnections(), 900);
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handlePrimaryStartStop = async () => {
    if (isRunning) {
      setStopConfirmOpen(true);
      return;
    }
    setBusyAction(true);
    setModeError(null);
    try {
      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({
          strategyKey: activeStrategy,
          symbol,
          scanScope,
          maxOpenPositions: maxOpenPos,
          allowAutoFlip: allowFlip,
        }),
      });
      showToast(
        isFa
          ? 'ربات دلارینو روشن شد! به‌صورت خودکار کل بازار را زیر نظر می‌گیرد 🚀'
          : 'Dollarino Bot is LIVE and scanning markets automatically 🚀'
      );
      onRefresh();
    } catch (err) {
      setModeError(err instanceof Error ? err.message : 'Start failed');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmStop = async (settleOpen: boolean) => {
    setStopConfirmOpen(false);
    setBusyAction(true);
    try {
      const res = await apiFetch<{
        settlement?: { durationSec: number; tradesClosed: number; netSessionPnl: number; finalBalance: number };
      }>('/api/trading/bot/stop', {
        method: 'POST',
        body: JSON.stringify({ settleOpen }),
      });
      if (res.settlement) setSettleReport(res.settlement);
      showToast(isFa ? 'ربات با خیال راحت متوقف شد.' : 'Bot stopped safely.');
      onRefresh();
    } finally {
      setBusyAction(false);
    }
  };

  const handleResetDemo = async () => {
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/wallet/reset', { method: 'POST' });
      showToast(isFa ? 'موجودی دمو به ۱۰,۰۰۰ دلار بازنشانی شد ✨' : 'Demo balance reset to $10,000');
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', true);
    } finally {
      setBusyAction(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupMsg('');
    try {
      const res = await apiFetch<{ balanceAfter: number }>('/api/trading/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amountUsd: topupAmount }),
      });
      setTopupMsg(isFa ? `موجودی جدید: $${res.balanceAfter.toLocaleString()}` : `New Balance: $${res.balanceAfter.toLocaleString()}`);
      onRefresh();
      setTimeout(() => {
        setTopupModalOpen(false);
        setTopupMsg('');
      }, 900);
    } catch (err) {
      setTopupMsg(err instanceof Error ? err.message : 'Top-up failed');
    }
  };

  const closePosition = async (tradeId: string) => {
    setBusyAction(true);
    try {
      await apiFetch(`/api/trading/positions/${tradeId}/close`, { method: 'POST' });
      showToast(isFa ? 'معامله بسته شد و نتیجه به حساب نشست ✅' : 'Trade closed & settled.');
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Close failed', true);
    } finally {
      setBusyAction(false);
    }
  };

  const runAiNow = async (executeIfSignal: boolean) => {
    setAiRunning(true);
    setAiRunOutput(null);
    setModeError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        decision?: {
          action: string;
          confidence: number;
          entry: number;
          stopLoss: number;
          tp1: number;
          tp2: number;
          thesis: string;
          modelCount?: number;
        };
        executed?: { ok: boolean; error?: string } | null;
      }>('/api/trading/ai-agent/run', {
        method: 'POST',
        body: JSON.stringify({ symbol, timeframe: tf, executeIfSignal }),
      });
      if (res.decision) {
        setAiRunOutput({
          ...res.decision,
          executed: Boolean(res.executed?.ok),
          error: res.executed?.ok === false ? res.executed.error : res.error,
        });
      } else if (res.error) {
        setModeError(res.error);
      }
      onRefresh();
    } catch (err) {
      setModeError(err instanceof Error ? err.message : 'AI run failed');
    } finally {
      setAiRunning(false);
    }
  };

  const saveSlTp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPos) return;
    await apiFetch(`/api/trading/positions/${editPos.id}/tpsl`, {
      method: 'PATCH',
      body: JSON.stringify({ stopLoss: editSlVal, tp1: editTp1Val }),
    });
    setEditPos(null);
    onRefresh();
  };

  const placeManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTicketMsg(null);
    try {
      const refPrice = orderType === 'LIMIT' && limitPrice ? Number(limitPrice) : Number(overview?.market24h.lastPrice ?? 0);
      const sl = slInput || (refPrice > 0 ? (side === 'LONG' ? refPrice * 0.985 : refPrice * 1.015).toFixed(2) : '');
      const tp1 = tp1Input || (refPrice > 0 ? (side === 'LONG' ? refPrice * 1.02 : refPrice * 0.98).toFixed(2) : '');
      const res = await apiFetch<{ ok: boolean; error?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          direction: side,
          orderType,
          limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
          leverage: lev,
          marginMode: data.config.margin_mode,
          stopLoss: sl,
          tp1,
          tp2: tp2Input || undefined,
          tp3: tp3Input || undefined,
        }),
      });
      setTicketMsg(
        res.ok
          ? res.pendingOrderId
            ? isFa ? 'سفارش لیمیت ثبت شد ✅' : 'Limit order queued ✅'
            : isFa ? 'معامله باز شد ✅' : 'Order opened ✅'
          : res.error || (isFa ? 'خطا در ثبت سفارش' : 'Order rejected')
      );
      onRefresh();
    } catch (err) {
      setTicketMsg(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const lastPriceNum = Number(overview?.market24h.lastPrice ?? 0);
  const priceChangePct = Number(overview?.market24h.changePct24h ?? 0);

  const chartOverlays: ChartOverlays | undefined = useMemo(() => {
    if (!overview) return undefined;
    return {
      ema20: overview.indicators.ema20,
      ema50: overview.indicators.ema50,
      ema200: overview.indicators.ema200,
      kbos: overview.kbosOverlays,
    };
  }, [overview]);

  const chartLevels: ChartLevels = useMemo(() => {
    const pos = data.openTrades.find((p) => p.symbol === symbol);
    return {
      entry: pos ? Number(pos.entry_price) : undefined,
      stopLoss: pos ? Number(pos.current_stop_loss) : undefined,
      tp1: pos ? Number(pos.tp1) : undefined,
      tp2: pos?.tp2 ? Number(pos.tp2) : undefined,
      tp3: pos?.tp3 ? Number(pos.tp3) : undefined,
    };
  }, [data.openTrades, symbol]);

  const weeklyCardMetrics: WeeklyCardMetrics = useMemo(() => {
    const days = data.charts.weeklyResults || [];
    const last7DaysPnl = days.reduce((s, d) => s + Number(d.pnl || 0), 0);
    const totalCount = days.reduce((s, d) => s + Number(d.count || 0), 0);
    const totalWins = days.reduce((s, d) => s + Number(d.wins || 0), 0);
    const pnlSum = totalCount ? last7DaysPnl : data.stats.totalPnl;
    const baseBal = totalEq > 0 ? totalEq : Number(data.balance.total || 10000);
    const pnlPct = baseBal > 0 ? (pnlSum / baseBal) * 100 : 0;
    const bySym = new Map<string, number>();
    for (const c of data.closedTrades) {
      bySym.set(c.symbol, (bySym.get(c.symbol) ?? 0) + Number(c.realized_pnl || 0));
    }
    let bestAsset: string | null = null;
    let bestAssetPnl = 0;
    for (const [s, v] of bySym.entries()) {
      if (bestAsset === null || v > bestAssetPnl) {
        bestAsset = s;
        bestAssetPnl = v;
      }
    }
    return {
      totalBalance: baseBal,
      todayProtectedCredit: Math.max(0, freeBal),
      last7Days: pnlSum,
      totalProfit: data.stats.totalPnl,
      pnlPercentage: pnlPct,
      mostProfitableAsset: bestAsset,
      mostProfitableAssetPnl: bestAssetPnl,
      winRate: totalCount ? (totalWins / totalCount) * 100 : data.stats.winRate,
      profitFactor: data.stats.profitFactor,
      periodLabel: isFa ? 'گزارش عملکرد ۷ روزه' : '7-DAY PERFORMANCE',
    };
  }, [data, totalEq, freeBal, isFa]);

  const friendlyActivity = useMemo(() => {
    const items: Array<{ id: string; text: string; time: string; ok: boolean }> = [];
    for (const c of data.closedTrades.slice(0, 4)) {
      const p = Number(c.realized_pnl || 0);
      const coin = c.symbol.replace('USDT', '');
      items.push({
        id: `tr-${c.id}`,
        text: isFa
          ? `معامله ${coin} بسته شد: ${p >= 0 ? `+${p.toFixed(2)}$ سود ✅` : `${p.toFixed(2)}$ زیان`}`
          : `${coin} trade closed: ${p >= 0 ? `+$${p.toFixed(2)} profit` : `$${p.toFixed(2)} loss`}`,
        time: (c.closed_at || '').slice(11, 16) || '—',
        ok: p >= 0,
      });
    }
    for (const d of (data.recentAiDecisions || []).slice(0, 4)) {
      let msg = d.message.replace(/\[.*?\]\s*/, '');
      if (isFa) {
        if (msg.startsWith('Bot started')) msg = 'ربات روشن شد و اسکن همزمان بازار آغاز گردید 🚀';
        else if (msg.startsWith('Bot stopped')) msg = 'ربات با خیال راحت متوقف شد ⏸️';
        else if (msg.includes('emitted')) msg = `سیگنال جدید برای ${d.symbol || 'بازار'} صادر و بررسی شد ⚡`;
      } else {
        if (/[\u0600-\u06FF]/.test(msg)) {
          if (msg.includes('پایش زنده')) msg = `Live multi-coin scan completed (${d.symbol || 'ALL_MARKET'})`;
          else if (msg.includes('روشن شد')) msg = 'Bot started and scanning all eligible markets 🚀';
          else msg = `Market scan update (${d.symbol || 'ALL'})`;
        }
      }
      items.push({
        id: `ai-${d.id}`,
        text: msg.slice(0, 125),
        time: (d.created_at || '').slice(11, 16) || '—',
        ok: d.level === 'INFO',
      });
    }
    return items.slice(0, 6);
  }, [data.closedTrades, data.recentAiDecisions, isFa]);

  // Live Market Explorer Filtered Coins
  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim().toUpperCase();
    let list: ExchangeMarket[] = markets.length
      ? [...markets]
      : [
          { symbol: 'BTCUSDT', exchangeSymbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', lastPrice: '61500', changePct24h: '1.8', high24h: '62500', low24h: '60100', volume24h: 1800000000, maxLeverage: 50, basePrecision: 3, quotePrecision: 2 },
          { symbol: 'ETHUSDT', exchangeSymbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', lastPrice: '3120', changePct24h: '2.1', high24h: '3180', low24h: '3050', volume24h: 920000000, maxLeverage: 50, basePrecision: 3, quotePrecision: 2 },
          { symbol: 'SOLUSDT', exchangeSymbol: 'SOLUSDT', base: 'SOL', quote: 'USDT', lastPrice: '198', changePct24h: '4.3', high24h: '204', low24h: '188', volume24h: 540000000, maxLeverage: 50, basePrecision: 2, quotePrecision: 2 },
          { symbol: 'BNBUSDT', exchangeSymbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', lastPrice: '642', changePct24h: '0.9', high24h: '650', low24h: '632', volume24h: 220000000, maxLeverage: 50, basePrecision: 2, quotePrecision: 2 },
          { symbol: 'XRPUSDT', exchangeSymbol: 'XRPUSDT', base: 'XRP', quote: 'USDT', lastPrice: '1.48', changePct24h: '-0.6', high24h: '1.52', low24h: '1.44', volume24h: 390000000, maxLeverage: 50, basePrecision: 1, quotePrecision: 4 },
          { symbol: 'DOGEUSDT', exchangeSymbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', lastPrice: '0.24', changePct24h: '5.2', high24h: '0.25', low24h: '0.22', volume24h: 310000000, maxLeverage: 50, basePrecision: 0, quotePrecision: 5 },
        ];

    if (q) {
      list = list.filter(
        (m) =>
          m.symbol.includes(q) ||
          m.base.includes(q) ||
          (COIN_NAMES_FA[m.symbol] && COIN_NAMES_FA[m.symbol]!.includes(marketSearch.trim()))
      );
    } else if (marketFilter === 'gainers') {
      list = [...list].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    } else if (marketFilter === 'losers') {
      list = [...list].sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    } else if (marketFilter === 'watchlist') {
      const watch = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'SUIUSDT', 'TONUSDT', 'AVAXUSDT', 'LINKUSDT']);
      list = list.filter((m) => watch.has(m.symbol));
    }
    return list.slice(0, 10);
  }, [markets, marketSearch, marketFilter]);

  return (
    <div className="space-y-5">
      {/* Feedback Alerts */}
      {notice && (
        <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {modeError && (
        <div className="p-3.5 rounded-2xl bg-[#FF8A00]/15 border border-[#FF8A00]/45 text-xs font-extrabold text-flame flex flex-wrap items-center justify-between gap-2">
          <span>{modeError}</span>
          <div className="flex items-center gap-2">
            {onOpenTab && (
              <button
                type="button"
                onClick={() => onOpenTab('subscription')}
                className="px-3 py-1 rounded-xl btn-cobalt text-[11px] font-black"
              >
                {isFa ? 'مشاهده اشتراک‌ها' : 'Plans'}
              </button>
            )}
            <button type="button" onClick={() => setModeError(null)}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Kifpool / iOS Top Wallet Card (Eye toggle + Green status dot + Account mode + Start CTA) */}
      <section className="hero-cobalt rounded-[28px] p-5 sm:p-7 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Light Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-xs font-extrabold text-white">
            <span className={`w-2.5 h-2.5 ${isRunning ? 'dot-signal animate-pulse' : 'rounded-full bg-white/60'}`} />
            <span>
              {isRunning
                ? isFa
                  ? `ربات فعال · اسکن ${scanScope === 'ALL_MARKET' ? 'کل بازار (۳۰+ ارز)' : scanScope === 'TOP_COINS' ? '۱۰ ارز برتر' : symbol.replace('USDT', '')}`
                  : `Bot LIVE · Scanning ${scanScope === 'ALL_MARKET' ? 'All Markets (30+)' : scanScope}`
                : isFa
                  ? 'ربات آماده شروع است'
                  : 'Ready to Trade'}
            </span>
          </div>

          {/* Paper / Live Switcher */}
          <div className="inline-flex p-1 rounded-2xl bg-black/25 border border-white/15 text-xs font-bold">
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void toggleAccountMode('PAPER')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                data.config.trading_mode === 'PAPER' ? 'bg-white text-[#07277a] font-black shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              {isFa ? '🧪 حساب دمو رایگان' : '🧪 Paper Demo'}
            </button>
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void toggleAccountMode('LIVE')}
              className={`px-3.5 py-1.5 rounded-xl transition ${
                data.config.trading_mode === 'LIVE' ? 'bg-[#059669] text-white font-black shadow' : 'text-white/80 hover:text-white'
              }`}
            >
              {isFa ? '🟢 حساب واقعی' : '🟢 Live'}
            </button>
          </div>
        </div>

        {/* Center / Hero Balance + Eye Toggle + Big Green Action */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white/80">
              <span>{t.totalEquity}</span>
              <button
                type="button"
                onClick={() => setHideBalance((v) => !v)}
                aria-label="Hide or show balance"
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                {hideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span dir="ltr" className="text-4xl sm:text-5xl font-black font-mono-num tracking-tight text-white">
                {hideBalance ? '••••••' : `$${totalEq.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              </span>
              <span
                dir="ltr"
                className={`px-3 py-1 rounded-full text-xs font-mono-num font-black ${
                  totalPnl >= 0 ? 'bg-[#059669] text-white shadow' : 'bg-rose-500 text-white'
                }`}
              >
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} {isFa ? 'سود کل' : 'Total PnL'}
              </span>
            </div>

            {/* Balance Allocation Bar (inspired by Kifpool Image #3) */}
            <div className="pt-1 space-y-1.5 max-w-md">
              <div className="h-2 rounded-full bg-white/15 overflow-hidden flex">
                <div className="bg-[#34d399] h-full transition-all" style={{ width: `${freePct}%` }} />
                <div className="bg-[#fbbf24] h-full transition-all" style={{ width: `${100 - freePct}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#34d399]" />
                  <span>{t.freeBalance}: {hideBalance ? '•••' : `$${freeBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#fbbf24]" />
                  <span>{t.usedBalance}: {hideBalance ? '•••' : `$${usedBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-3">
            {/* Compact Stats Row */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-2.5">
                <div className="text-[11px] text-white/75">{t.todayPnl}</div>
                <div dir="ltr" className="text-sm sm:text-base font-black font-mono-num text-[#6ee7b7]">
                  {todayPnl + unrealized >= 0 ? '+' : ''}${(todayPnl + unrealized).toFixed(2)}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-2.5">
                <div className="text-[11px] text-white/75">{t.winRate}</div>
                <div dir="ltr" className="text-sm sm:text-base font-black font-mono-num text-white">
                  {data.stats.winRate.toFixed(0)}%
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl px-3 py-2.5">
                <div className="text-[11px] text-white/75">{t.openPositions}</div>
                <div dir="ltr" className="text-sm sm:text-base font-black font-mono-num text-white">
                  {data.openTrades.length}/{maxOpenPos}
                </div>
              </div>
            </div>

            {/* Big One-Tap Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handlePrimaryStartStop()}
                className={`flex-1 py-4 px-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition ${
                  isRunning
                    ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white'
                    : 'bg-[#059669] hover:bg-[#047857] text-white border border-white/25'
                }`}
              >
                <Power className="w-5 h-5" />
                <span>
                  {isRunning
                    ? isFa ? 'توقف ربات' : 'Stop Robot'
                    : isFa ? '🚀 شروع خودکار ربات دلارینو' : '🚀 Start Auto-Trading'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setProMode((v) => !v)}
                className={`px-4 py-4 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border ${
                  proMode
                    ? 'bg-white text-[#07277a] border-white'
                    : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>{proMode ? (isFa ? 'بستن پنل حرفه‌ای' : 'Close Pro Desk') : isFa ? 'حالت حرفه‌ای تریدرها' : 'Pro Trader Mode'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Kifpool Screenshot #1 Style Quick-Action Squircle Grid */}
      <section className="surface-card p-3 sm:p-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {[
            {
              label: isFa ? 'همه ارزهای بازار' : 'All Markets',
              sub: scanScope === 'ALL_MARKET' ? (isFa ? 'فعال' : 'ON') : '',
              icon: Globe2,
              onClick: () => void updateScanScope('ALL_MARKET'),
              active: scanScope === 'ALL_MARKET',
            },
            {
              label: isFa ? 'کپی ترید دلارینو' : 'Copy-Trade',
              icon: Bot,
              onClick: () => onOpenTab?.('copytrade'),
            },
            {
              label: isFa ? 'نمودار و ترید دستی' : 'Pro Chart',
              icon: BarChart3,
              onClick: () => setProMode((v) => !v),
              active: proMode,
            },
            {
              label: isFa ? 'اتصال صرافی' : 'Exchanges',
              icon: Link2,
              onClick: () => onOpenConnections?.(),
            },
            {
              label: isFa ? 'کارت نتایج هفتگی' : 'Weekly Card',
              icon: Award,
              onClick: () => setCardModalOpen(true),
            },
            data.config.trading_mode === 'PAPER'
              ? {
                  label: isFa ? 'شارژ / ریست دمو' : 'Reset Demo',
                  icon: RotateCcw,
                  onClick: () => void handleResetDemo(),
                }
              : {
                  label: isFa ? 'اشتراک حرفه‌ای' : 'Plans',
                  icon: Crown,
                  onClick: () => onOpenTab?.('subscription'),
                },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={item.onClick}
                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition border ${
                  item.active ? 'banner-cobalt-soft border-[#1464F6]' : 'hover:surface-soft border-transparent'
                }`}
              >
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.active ? 'btn-cobalt' : 'surface-soft text-brand'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-extrabold text-main leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 1: 3 Exact Branded Trading Modes */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-black text-main">
            {isFa ? '۱. انتخاب هوش یا استراتژی ربات' : '1. Choose Your Trading Engine'}
          </h2>
          {data.config.trading_mode === 'PAPER' && (
            <button
              type="button"
              onClick={() => setTopupModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl surface-card text-xs font-extrabold text-brand hover:border-brand transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{t.addBalance}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: هوش مصنوعی دلارینو */}
          <div
            onClick={() => void selectTradingMode('ai')}
            className={`cursor-pointer surface-card rounded-[26px] p-4 sm:p-5 transition border-2 flex flex-col justify-between gap-3 ${
              activeStrategy === 'ai_autonomous_agent'
                ? 'border-[#1464F6] ring-2 ring-[#1464F6]/20'
                : 'hover:border-[#1464F6]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full banner-cobalt-soft text-[10px] font-black text-brand">
                  <BrainCircuit className="w-3 h-3" />
                  <span>{isFa ? 'موتور هوشمند دُرّبین' : 'Dorrbin Multi-AI'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'هوش مصنوعی دلارینو بدون نیاز به کلید API، بازار را تحلیل و بهترین نقاط ورود و خروج را انتخاب می‌کند.'
                    : 'Central multi-model Dollarino AI analyzes markets and trades autonomously with zero API setup.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicAI />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className={`font-bold flex items-center gap-1.5 ${platformAiConfigured ? 'text-signal' : 'text-flame'}`}>
                <span className={`w-2 h-2 ${platformAiConfigured ? 'dot-signal' : 'rounded-full bg-[#FF8A00]'}`} />
                <span>
                  {platformAiConfigured
                    ? isFa
                      ? data.platformAI?.effectiveModeLabelFa || 'متصل و آماده'
                      : data.platformAI?.effectiveModeLabelEn || 'Online'
                    : isFa
                      ? 'در انتظار تنظیم مدیریت'
                      : 'Admin Setup Pending'}
                </span>
              </span>
              {activeStrategy === 'ai_autonomous_agent' && (
                <span className="px-2.5 py-0.5 rounded-full btn-cobalt text-[10px] font-black">
                  {isFa ? 'انتخاب‌شده' : 'Active'}
                </span>
              )}
            </div>
          </div>

          {/* Card 2: استراتژی منتخب دلارینو (Dorna V1) */}
          <div
            onClick={() => void selectTradingMode('dorna')}
            className={`cursor-pointer surface-card rounded-[26px] p-4 sm:p-5 transition border-2 flex flex-col justify-between gap-3 ${
              activeStrategy !== 'ai_autonomous_agent'
                ? 'border-[#059669] ring-2 ring-[#059669]/20'
                : 'hover:border-[#059669]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full badge-signal text-[10px] font-black">
                  <Sparkles className="w-3 h-3" />
                  <span>{isFa ? 'موتور اختصاصی دُرنا V1' : 'Dorna V1 Engine'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'استراتژی منتخب دلارینو' : 'Dollarino Select'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'برگزیده‌ترین ترکیب استراتژی‌های دلارینو؛ شکار روند، شکست و نقدینگی در کل بازار با حفظ سود خودکار.'
                    : 'Flagship Dorna V1 strategy unifying trend, liquidity sweep & momentum with automatic profit lock.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicCodex />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className="text-signal font-extrabold inline-flex items-center gap-1.5">
                <span className="w-2 h-2 dot-signal" />
                <span>{isFa ? 'رایگان در دمو و حساب واقعی' : 'Free in Demo & Live'}</span>
              </span>
              {activeStrategy !== 'ai_autonomous_agent' && (
                <span className="px-2.5 py-0.5 rounded-full badge-signal text-[10px] font-black">
                  {isFa ? 'انتخاب‌شده' : 'Active'}
                </span>
              )}
            </div>
          </div>

          {/* Card 3: کپی ترید دلارینو */}
          <div
            onClick={() => onOpenTab?.('copytrade')}
            className="cursor-pointer surface-card rounded-[26px] p-4 sm:p-5 transition border-2 hover:border-[#FF8A00]/60 flex flex-col justify-between gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF8A00]/15 text-[10px] font-black text-flame">
                  <Bot className="w-3 h-3" />
                  <span>{isFa ? 'همگام با تلگرام' : 'Telegram Sync'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'کپی ترید دلارینو' : 'Dollarino Copy-Trade'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'تمام معاملات کانال رسمی دلارینو به‌صورت خودکار و همزمان در حساب شما کپی می‌شوند.'
                    : 'Automatically mirror official Telegram signals directly into your account.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicTelegram />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className="text-sub font-bold">{isFa ? 'مدیریت خودکار ۳ حد سود' : 'Auto 3-TP & Stop'}</span>
              <span className="text-brand font-black">{isFa ? 'ورود به کپی‌ترید ←' : 'Open Copy-Trade →'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2 & Step 3: Risk Shield + Multi-Coin Full Market Freedom */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Risk Presets + Full Trader Freedom Controls */}
        <div className="lg:col-span-6 surface-card rounded-[26px] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-main">
              {isFa ? '۲. میزان ریسک و آزادی ربات' : '2. Risk & Trader Freedom'}
            </h2>
            <button
              type="button"
              onClick={() => setTraderFreedomOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl surface-soft text-[11px] font-extrabold text-brand"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isFa ? 'تنظیمات آزاد تریدر' : 'Trader Freedom'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {RISK_PRESETS.map((p) => {
              const active = currentPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busyAction}
                  onClick={() => void selectRiskPreset(p)}
                  className={`text-start p-3.5 rounded-2xl border-2 transition ${
                    active ? 'border-[#1464F6] banner-cobalt-soft' : 'surface-soft hover:border-[#1464F6]/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">{p.icon}</span>
                    {active && <CheckCircle2 className="w-4 h-4 text-brand" />}
                  </div>
                  <div className="text-xs font-black text-main">{isFa ? p.titleFa : p.titleEn}</div>
                  <p className="text-[11px] text-sub mt-1 leading-relaxed">{isFa ? p.descFa : p.descEn}</p>
                </button>
              );
            })}
          </div>

          {/* Open Trader Freedom Drawer — multi-position cap, auto-flip, custom leverage */}
          {traderFreedomOpen && (
            <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-main">
                  {isFa ? `تعداد معاملات همزمان روی ارزهای مختلف: ${maxOpenPos} ارز` : `Max Simultaneous Coins: ${maxOpenPos}`}
                </span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={maxOpenPos}
                  onChange={(e) =>
                    void updateTraderFreedom(
                      { max_open_positions: Number(e.target.value) },
                      `حداکثر معاملات همزمان روی ${e.target.value} ارز تنظیم شد`,
                      `Max simultaneous positions set to ${e.target.value}`
                    )
                  }
                  className="w-40 accent-[#1464F6]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-main">
                  {isFa ? `حداکثر اهرم آزاد ربات: ${data.config.max_leverage}x` : `Max Bot Leverage: ${data.config.max_leverage}x`}
                </span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={data.config.max_leverage}
                  onChange={(e) =>
                    void updateTraderFreedom(
                      { max_leverage: Number(e.target.value) },
                      `حداکثر اهرم روی ${e.target.value}x تنظیم شد`,
                      `Max leverage set to ${e.target.value}x`
                    )
                  }
                  className="w-40 accent-[#1464F6]"
                />
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                <span className="font-bold text-main">
                  {isFa ? 'چرخش خودکار تریدر (بستن و معکوس هنگام تغییر روند)' : 'Auto-Flip Position on Trend Reversal'}
                </span>
                <input
                  type="checkbox"
                  checked={allowFlip}
                  onChange={(e) =>
                    void updateTraderFreedom(
                      { allow_auto_flip: e.target.checked ? 1 : 0 },
                      e.target.checked ? 'چرخش خودکار تریدر فعال شد ✅' : 'چرخش خودکار غیرفعال شد',
                      e.target.checked ? 'Auto-Flip enabled' : 'Auto-Flip disabled'
                    )
                  }
                  className="w-4 h-4 accent-[#059669]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Right: Multi-Coin Full Market Scope Selector */}
        <div className="lg:col-span-6 surface-card rounded-[26px] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-main">
              {isFa ? '۳. ارزهای تحت معامله ربات' : '3. Market Scope & Coins'}
            </h2>
            <span className="px-2.5 py-1 rounded-full badge-signal text-[10px] font-black">
              {isFa ? `تا ${maxOpenPos} ارز همزمان` : `Up to ${maxOpenPos} concurrent`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'ALL_MARKET' as const,
                title: isFa ? '🌐 کل بازار (۳۰+ ارز)' : '🌐 All Markets (30+)',
                sub: isFa ? 'همه‌چیز خودکار و آزاد' : 'Full autonomous scan',
              },
              {
                id: 'TOP_COINS' as const,
                title: isFa ? '⭐ ۱۰ ارز برتر' : '⭐ Top 10 Coins',
                sub: isFa ? 'پرحجم‌ترین‌های بازار' : 'High liquidity majors',
              },
              {
                id: 'SINGLE' as const,
                title: isFa ? '🎯 تک‌ارز انتخابی' : '🎯 Single Coin',
                sub: symbol.replace('USDT', ''),
              },
            ].map((sc) => {
              const active = scanScope === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  disabled={busyAction}
                  onClick={() => void updateScanScope(sc.id)}
                  className={`p-3 rounded-2xl border-2 text-start transition ${
                    active ? 'border-[#1464F6] banner-cobalt-soft' : 'surface-soft hover:border-[#1464F6]/40'
                  }`}
                >
                  <div className="text-xs font-black text-main">{sc.title}</div>
                  <div className="text-[10px] text-dim mt-0.5 truncate">{sc.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Quick Coin Picker Strip */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((c) => {
              const active = symbol === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => void updateScanScope(scanScope, c)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-extrabold transition ${
                    active ? 'btn-cobalt border-transparent' : 'surface-soft text-main hover:border-brand'
                  }`}
                >
                  <CoinIcon symbol={c} size={18} />
                  <span>{isFa ? COIN_NAMES_FA[c] || c.replace('USDT', '') : c.replace('USDT', '')}</span>
                </button>
              );
            })}
            <SymbolPicker
              markets={markets}
              provider={data.activeExchange.provider}
              value={symbol}
              onChange={(s) => void updateScanScope(scanScope, s)}
              lang={lang}
              compact
            />
          </div>
          <p className="text-[11px] text-dim leading-relaxed">
            {scanScope === 'ALL_MARKET'
              ? isFa
                ? 'ربات به صورت ۲۴ ساعته تمام ارزهای پرنقدینگی بازار (بیت‌کوین، اتریوم، سولانا، دوج، سویی، میم‌کوین‌ها و دیفای) را اسکن کرده و همزمان روی چند ارز فرصت‌ساز معامله باز می‌کند.'
                : 'Continuously scans 30+ top liquid markets across L1, DeFi & Memes and manages simultaneous multi-coin positions.'
              : scanScope === 'TOP_COINS'
                ? isFa
                  ? 'ربات به‌صورت همزمان ۱۰ ارز بزرگ و پرحجم بازار را بررسی و بهترین سیگنال‌ها را شکار می‌کند.'
                  : 'Simultaneously monitors top 10 liquid assets for high-probability setups.'
                : isFa
                  ? `ربات فقط روی ارز ${symbol.replace('USDT', '')} تمرکز می‌کند.`
                  : `Bot focuses exclusively on ${symbol}.`}
          </p>
        </div>
      </section>

      {/* Kifpool Screenshot #1 & #2 Inspired Live Market Pulse Explorer */}
      <section className="surface-card rounded-[26px] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-signal" />
            <h2 className="text-sm sm:text-base font-black text-main">
              {isFa ? 'نبض زنده بازار ارزهای دیجیتال' : 'Live Crypto Market Pulse'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-dim absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder={isFa ? 'جستجوی ارز...' : 'Search coin...'}
                className="surface-input rounded-2xl ps-8 pe-3 py-1.5 text-xs w-40 sm:w-52"
              />
            </div>

            <div className="flex gap-1 text-[11px] font-extrabold overflow-x-auto">
              {[
                { id: 'all' as const, label: isFa ? 'همه ارزها' : 'All' },
                { id: 'watchlist' as const, label: isFa ? 'محبوب‌ها' : 'Top Watch' },
                { id: 'gainers' as const, label: isFa ? 'بیشترین رشد' : 'Gainers' },
                { id: 'losers' as const, label: isFa ? 'افت قیمت' : 'Losers' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMarketFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    marketFilter === tab.id ? 'btn-cobalt' : 'surface-soft text-sub hover:text-main'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {filteredMarkets.map((m) => {
            const chg = Number(m.changePct24h || 0);
            const up = chg >= 0;
            const active = symbol === m.symbol;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => {
                  setSymbol(m.symbol);
                  setProMode(true);
                  setTimeout(() => {
                    document.getElementById('pro-desk-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 120);
                }}
                className={`p-3 rounded-2xl border text-start flex items-center justify-between gap-2 transition ${
                  active ? 'border-[#1464F6] banner-cobalt-soft' : 'surface-soft hover:border-brand'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CoinIcon symbol={m.symbol} size={32} />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-main truncate">
                      {isFa ? COIN_NAMES_FA[m.symbol] || m.base : m.base}
                    </div>
                    <div className="text-[10px] font-mono-num text-dim">{m.base}</div>
                  </div>
                </div>
                <div className="text-end font-mono-num shrink-0">
                  <div dir="ltr" className="text-xs font-black text-main">${fmtPx(Number(m.lastPrice))}</div>
                  <div
                    dir="ltr"
                    className={`text-[10px] font-extrabold ${up ? 'text-signal' : 'text-loss'}`}
                  >
                    {up ? '+' : ''}
                    {chg.toFixed(1)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Open Positions & History — 100% Localized iOS Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 surface-card rounded-[26px] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-signal" />
              <span>{t.openPositions} ({data.openTrades.length})</span>
            </h2>
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-xl surface-soft text-sub hover:text-main"
              title={isFa ? 'بروزرسانی' : 'Refresh'}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.openTrades.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6 text-center space-y-2">
              <div className="text-sm font-bold text-main">
                {isRunning
                  ? isFa
                    ? 'ربات در حال بررسی همزمان ارزهای بازار برای بهترین نقطه ورود سودآور است...'
                    : 'Bot is scanning multiple coins for high-probability entries...'
                  : isFa
                    ? 'هنوز معامله بازی ندارید'
                    : 'No open trades yet'}
              </div>
              <p className="text-xs text-dim">
                {isRunning
                  ? isFa
                    ? 'به محض پیدا شدن فرصت مطمئن روی هر ارز، معامله با حد ضرر خودکار باز می‌شود.'
                    : 'Trades open automatically once a valid setup forms on any scanned coin.'
                  : isFa
                    ? 'دکمه سبز «شروع خودکار ربات دلارینو» در بالا را بزنید تا معامله‌گری شروع شود.'
                    : 'Tap Start Auto-Trading above to begin.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.openTrades.map((pos) => {
                const uPnl = Number(pos.unrealized_pnl || 0);
                const roe = Number(pos.roe_pct || 0);
                const inProfit = uPnl >= 0;
                return (
                  <div key={pos.id} className="surface-soft rounded-2xl p-4 space-y-3 border">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={pos.symbol} size={34} />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black text-sm text-main">
                              {isFa ? COIN_NAMES_FA[pos.symbol] || pos.symbol.replace('USDT', '') : pos.symbol.replace('USDT', '')}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                pos.direction === 'LONG' ? 'badge-signal' : 'bg-rose-500/15 text-loss'
                              }`}
                            >
                              {pos.direction === 'LONG' ? (isFa ? 'خرید (سود از رشد)' : 'BUY LONG') : isFa ? 'فروش (سود از ریزش)' : 'SELL SHORT'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full surface-card font-mono-num font-bold text-sub">
                              {pos.leverage}x
                            </span>
                            {pos.risk_free_active === 1 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full banner-cobalt-soft text-brand font-bold">
                                🛡️ {t.riskFreeBadge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-dim font-mono-num mt-0.5">
                            {isFa ? 'ورود:' : 'Entry:'} ${pos.entry_price} · {isFa ? 'قیمت فعلی:' : 'Now:'} ${pos.mark_price ?? pos.entry_price}
                          </div>
                        </div>
                      </div>

                      <div className="text-end">
                        <div dir="ltr" className={`text-base font-black font-mono-num ${inProfit ? 'text-signal' : 'text-loss'}`}>
                          {inProfit ? '+' : ''}${uPnl.toFixed(2)}
                        </div>
                        <div dir="ltr" className={`text-[11px] font-bold font-mono-num ${inProfit ? 'text-signal' : 'text-loss'}`}>
                          {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'حد ضرر امن' : 'Auto Stop'}</div>
                        <div dir="ltr" className="font-mono-num font-bold text-main">${pos.current_stop_loss}</div>
                      </div>
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'هدف سود ۱' : 'Target 1'}</div>
                        <div dir="ltr" className="font-mono-num font-bold text-signal">${pos.tp1}</div>
                      </div>
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'سرمایه درگیر' : 'Margin'}</div>
                        <div dir="ltr" className="font-mono-num font-bold text-main">${pos.margin_used}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {proMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditPos(pos);
                            setEditSlVal(pos.current_stop_loss);
                            setEditTp1Val(pos.tp1);
                          }}
                          className="px-3 py-1.5 rounded-xl surface-card text-xs font-bold text-sub hover:text-main inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ویرایش حد سود و ضرر' : 'Edit SL/TP'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void closePosition(pos.id)}
                        className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white text-xs font-extrabold transition inline-flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بستن معامله و تسویه سود' : 'Close & Settle'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Friendly Activity & History Column */}
        <div className="lg:col-span-5 surface-card rounded-[26px] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand" />
              <span>{isFa ? 'خلاصه فعالیت و نتایج' : 'Recent Activity & History'}</span>
            </h2>
            <button
              type="button"
              onClick={() => setCardModalOpen(true)}
              className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1"
            >
              <Award className="w-3.5 h-3.5" />
              <span>{t.showTradingCard}</span>
            </button>
          </div>

          {friendlyActivity.length === 0 ? (
            <div className="surface-soft rounded-2xl p-5 text-center text-xs text-dim">
              {isFa
                ? 'هنوز فعالیتی ثبت نشده است. با روشن کردن ربات، تمام گزارش‌ها به زبان ساده اینجا نمایش داده می‌شوند.'
                : 'No activity yet. Start the bot to see plain-language updates here.'}
            </div>
          ) : (
            <div className="space-y-2">
              {friendlyActivity.map((item) => (
                <div key={item.id} className="surface-soft rounded-2xl px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs">
                  <span className={`font-semibold leading-relaxed ${item.ok ? 'text-main' : 'text-loss'}`}>{item.text}</span>
                  <span className="text-[11px] font-mono-num text-dim shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          )}

          {data.closedTrades.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <div className="text-xs font-extrabold text-sub">{t.closedTrades}</div>
              <div className="space-y-1.5 max-h-[210px] overflow-y-auto">
                {data.closedTrades.slice(0, 6).map((tr) => {
                  const p = Number(tr.realized_pnl || 0);
                  return (
                    <div key={tr.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-2xl surface-soft">
                      <div className="flex items-center gap-2">
                        <CoinIcon symbol={tr.symbol} size={20} />
                        <span className="font-bold text-main">
                          {isFa ? COIN_NAMES_FA[tr.symbol] || tr.symbol.replace('USDT', '') : tr.symbol.replace('USDT', '')}
                        </span>
                      </div>
                      <span dir="ltr" className={`font-mono-num font-black ${p >= 0 ? 'text-signal' : 'text-loss'}`}>
                        {p >= 0 ? '+' : ''}${p.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Optional Pro Mode Drawer: Full Candlestick Chart + AI Run + Manual Ticket */}
      {proMode && (
        <section id="pro-desk-chart" className="space-y-4 pt-4 border-t">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand" />
              <span>{isFa ? 'پنل تخصصی تریدرها (نمودار، تحلیل فوری هوش مصنوعی دلارینو و معامله دستی)' : 'Pro Trader Desk'}</span>
            </h2>
            <div className="flex items-center gap-1.5">
              {(['5m', '15m', '1h', '4h'] as Timeframe[]).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setTf(x)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono-num font-bold ${
                    tf === x ? 'btn-cobalt' : 'surface-soft text-sub'
                  }`}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Chart */}
            <div className="xl:col-span-8 surface-card rounded-[26px] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <CoinIcon symbol={symbol} size={26} />
                  <span className="font-black text-sm text-main">
                    {isFa ? `${COIN_NAMES_FA[symbol] || symbol} (${symbol})` : symbol} · {tf}
                  </span>
                  {lastPriceNum > 0 && (
                    <span dir="ltr" className="font-mono-num font-black text-main">${fmtPx(lastPriceNum)}</span>
                  )}
                  <span dir="ltr" className={`font-mono-num font-bold ${priceChangePct >= 0 ? 'text-signal' : 'text-loss'}`}>
                    {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={aiRunning}
                    onClick={() => void runAiNow(false)}
                    className="px-3 py-1.5 rounded-xl btn-cobalt text-[11px] font-extrabold inline-flex items-center gap-1"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>{aiRunning ? '...' : isFa ? 'تحلیل با هوش مصنوعی دلارینو' : 'Analyze with Dollarino AI'}</span>
                  </button>
                </div>
              </div>

              {aiRunOutput && (
                <div className="banner-cobalt-soft rounded-2xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-black">
                    <span className="text-brand">
                      {aiRunOutput.action} ({aiRunOutput.confidence}%)
                      {aiRunOutput.modelCount && aiRunOutput.modelCount > 1
                        ? ` · ${isFa ? `اجماع ${aiRunOutput.modelCount} مدل` : `${aiRunOutput.modelCount} models`}`
                        : ''}
                    </span>
                    <span dir="ltr" className="font-mono-num text-main">
                      {isFa ? 'ورود' : 'Entry'}: {aiRunOutput.entry} | {isFa ? 'حدضرر' : 'SL'}: {aiRunOutput.stopLoss} | {isFa ? 'تارگت' : 'TP1'}: {aiRunOutput.tp1}
                    </span>
                  </div>
                  <p className="text-sub">{aiRunOutput.thesis}</p>
                </div>
              )}

              {overview?.candles?.length ? (
                <CandlestickChart
                  candles={overview.candles}
                  overlays={chartOverlays}
                  levels={chartLevels}
                  height={380}
                />
              ) : (
                <div className="h-[340px] flex items-center justify-center text-xs text-dim">
                  {isFa ? 'در حال بارگذاری نمودار...' : 'Loading chart...'}
                </div>
              )}
            </div>

            {/* Pro Manual Ticket */}
            <div className="xl:col-span-4 surface-card rounded-[26px] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'ثبت معامله دستی تریدر' : 'Manual Trade Ticket'}</span>
                </h3>
              </div>

              <form onSubmit={placeManualOrder} className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSide('LONG')}
                    className={`py-2.5 rounded-xl font-black ${side === 'LONG' ? 'btn-emerald' : 'surface-soft text-sub'}`}
                  >
                    {isFa ? 'خرید (لانگ)' : 'BUY / LONG'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('SHORT')}
                    className={`py-2.5 rounded-xl font-black ${side === 'SHORT' ? 'bg-rose-500 text-white' : 'surface-soft text-sub'}`}
                  >
                    {isFa ? 'فروش (شورت)' : 'SELL / SHORT'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOrderType('MARKET')}
                    className={`py-2 rounded-xl font-bold ${orderType === 'MARKET' ? 'btn-cobalt' : 'surface-soft text-sub'}`}
                  >
                    {isFa ? 'قیمت لحظه‌ای (مارکت)' : 'Market'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('LIMIT')}
                    className={`py-2 rounded-xl font-bold ${orderType === 'LIMIT' ? 'btn-cobalt' : 'surface-soft text-sub'}`}
                  >
                    {isFa ? 'سفارش محدود (لیمیت)' : 'Limit'}
                  </button>
                </div>

                {orderType === 'LIMIT' && (
                  <input
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder={isFa ? 'قیمت ورود دلخواه (USDT)' : 'Limit Price'}
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                )}

                <div>
                  <label className="text-dim block mb-1">{isFa ? `اهرم معاملاتی: ${lev}x` : `Leverage: ${lev}x`}</label>
                  <input type="range" min={1} max={50} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="w-full accent-[#1464F6]" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={slInput}
                    onChange={(e) => setSlInput(e.target.value)}
                    placeholder={isFa ? 'حد ضرر (خودکار)' : 'SL (auto)'}
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    value={tp1Input}
                    onChange={(e) => setTp1Input(e.target.value)}
                    placeholder={isFa ? 'حد سود ۱ (خودکار)' : 'TP1 (auto)'}
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    value={tp2Input}
                    onChange={(e) => setTp2Input(e.target.value)}
                    placeholder={isFa ? 'حد سود ۲ (اختیاری)' : 'TP2 (optional)'}
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    value={tp3Input}
                    onChange={(e) => setTp3Input(e.target.value)}
                    placeholder={isFa ? 'حد سود ۳ (اختیاری)' : 'TP3 (optional)'}
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>

                {ticketMsg && <div className="text-xs font-bold text-brand">{ticketMsg}</div>}

                <button
                  disabled={submitting}
                  type="submit"
                  className="w-full py-3 rounded-2xl btn-cobalt font-black flex items-center justify-center gap-1.5"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{submitting ? '...' : isFa ? 'ثبت معامله' : 'Place Order'}</span>
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Modals (100% Bilingual!) */}
      {topupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleTopup} className="surface-card rounded-[26px] w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Wallet className="w-4 h-4 text-signal" />
                <span>{t.addBalance}</span>
              </h3>
              <button type="button" onClick={() => setTopupModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input
              type="number"
              min={1}
              max={1000000}
              value={topupAmount}
              onChange={(e) => setTopupAmount(Number(e.target.value))}
              className="w-full surface-input rounded-2xl px-3 py-2.5 text-sm font-mono-num"
            />
            {topupMsg && <div className="text-xs text-signal font-bold">{topupMsg}</div>}
            <button type="submit" className="w-full py-3 rounded-2xl btn-emerald text-xs font-black">
              {isFa ? 'افزودن به موجودی دمو' : 'Add Demo Credit'}
            </button>
          </form>
        </div>
      )}

      {stopConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="surface-card rounded-[26px] w-full max-w-sm p-6 space-y-4">
            <h3 className="font-black text-base text-main">{isFa ? 'توقف ربات' : 'Stop Robot'}</h3>
            <p className="text-xs text-sub leading-relaxed">
              {isFa
                ? 'آیا می‌خواهید فقط ربات متوقف شود (معاملات باز با حد ضرر فعلی بمانند) یا معاملات باز هم همین الان بسته شوند؟'
                : 'Pause scanning only or close open trades now?'}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleConfirmStop(false)}
                className="w-full py-3 rounded-2xl btn-cobalt text-xs font-black"
              >
                {isFa ? 'توقف جستجوی جدید (معاملات باز بمانند)' : 'Pause Bot Only'}
              </button>
              {data.openTrades.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleConfirmStop(true)}
                  className="w-full py-3 rounded-2xl bg-rose-500 text-white text-xs font-black"
                >
                  {isFa ? 'توقف ربات و بستن همه معاملات باز' : 'Stop & Close Open Trades'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStopConfirmOpen(false)}
                className="w-full py-2.5 rounded-2xl surface-soft text-xs font-bold text-sub"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settleReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="surface-card rounded-[26px] w-full max-w-sm p-6 space-y-4 text-center">
            <ShieldCheck className="w-10 h-10 text-signal mx-auto" />
            <h3 className="font-black text-base text-main">{isFa ? 'گزارش پایان فعالیت ربات' : 'Session Summary'}</h3>
            <div className="surface-soft rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'معاملات بسته‌شده' : 'Trades Closed'}</span>
                <span className="font-mono-num font-black text-main">{settleReport.tradesClosed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'سود/زیان خالص' : 'Net PnL'}</span>
                <span dir="ltr" className={`font-mono-num font-black ${settleReport.netSessionPnl >= 0 ? 'text-signal' : 'text-loss'}`}>
                  {settleReport.netSessionPnl >= 0 ? '+' : ''}${settleReport.netSessionPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'موجودی نهایی' : 'Final Balance'}</span>
                <span dir="ltr" className="font-mono-num font-black text-main">${settleReport.finalBalance.toLocaleString()}</span>
              </div>
            </div>
            <button onClick={() => setSettleReport(null)} className="w-full py-3 rounded-2xl btn-cobalt text-xs font-black">
              {isFa ? 'تایید' : 'Done'}
            </button>
          </div>
        </div>
      )}

      {editPos && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveSlTp} className="surface-card rounded-[26px] w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-sm text-main">
                {isFa ? `ویرایش حد سود و ضرر — ${editPos.symbol}` : `Edit SL/TP — ${editPos.symbol}`}
              </h3>
              <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-xs text-sub block mb-1">{isFa ? 'حد ضرر (Stop Loss)' : 'Stop Loss'}</label>
              <input value={editSlVal} onChange={(e) => setEditSlVal(e.target.value)} className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num" />
            </div>
            <div>
              <label className="text-xs text-sub block mb-1">{isFa ? 'حد سود اول (TP1)' : 'Target 1 (TP1)'}</label>
              <input value={editTp1Val} onChange={(e) => setEditTp1Val(e.target.value)} className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt text-xs font-black">
              {isFa ? 'ذخیره تغییرات' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          availableBalance={totalEq}
          onClose={() => setWizardOpen(false)}
          onCompleted={() => {
            setWizardOpen(false);
            onRefresh();
          }}
        />
      )}

      <WeeklyTradingCardModal
        lang={lang}
        metrics={weeklyCardMetrics}
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
      />
    </div>
  );
}
