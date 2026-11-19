import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import type { Candle, KbosParams, SignalMixerResult, Timeframe } from '@dollarino/core';
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
    margin_mode?: 'ISOLATED' | 'CROSS';
    symbol: string;
    auto_scan_top?: number;
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
    trailing_stop_enabled?: number;
    trailing_stop_pct?: number;
    trail_after_tp1?: number;
    daily_max_loss_pct: number;
    max_open_positions: number;
    block_weekends: number;
    macro_blackout: number;
    ai_gate_enabled: number;
    ai_min_confidence: number;
    signal_channel_handle?: string;
    mixer_threshold?: number;
    mixer_weights_json?: string;
    strategy_flow_json?: string;
    kbos_params_json?: string;
    risk_profile_json?: string;
    webhook_secret: string;
    paper_balance: string;
    started_at?: string | null;
  };
  kbosParams?: Partial<KbosParams>;
  riskProfile?: {
    preset?: string;
    allocatedAmount?: number;
    trailingStop?: boolean;
    trailingDistance?: number;
  };
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
      thesis: string;
      created_at: string;
    }>;
  };
  balance: { free: string; used: string; total: string; currency: string };
  nextCycleInSec?: number;
  openTrades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    mark_price?: string;
    unrealized_pnl?: string;
    roe_pct?: number;
    capital_pct?: number;
    funding_usd?: number;
    liq_price_est?: string;
    sparkline?: number[];
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
    trailing_active?: number;
    realized_pnl: string;
    mode: string;
    exchange_provider: string;
    strategy_key?: string;
    opened_at?: string;
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
    margin_used?: string;
    exit_reason: string;
    closed_at: string;
    leverage: number;
    strategy_key?: string;
  }>;
  walletLedger?: Array<{
    id: string;
    event_type: string;
    amount_usd: number;
    balance_after: number;
    note: string;
    created_at: string;
  }>;
  recentSignals: Array<{
    id: string;
    source: string;
    symbol: string;
    direction: string;
    price: string;
    status: string;
    raw_text: string;
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
  stats: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    todayPnl: number;
    last24hPnl?: number;
    last7dPnl?: number;
    unrealizedPnl?: number;
    allTimePct?: number;
    totalDeposited?: number;
    profitFactor: number;
  };
  charts: {
    hourlyPnl: Array<{ bucket: string; pnl: number; trades?: number }>;
    dailyPnl: Array<{ bucket: string; pnl: number }>;
    cumulative30d?: Array<{ date: string; dailyPnl: number; cumulativePnl: number }>;
    weeklyResults: Array<{ day: string; count: number; wins: number; pnl: number }>;
  };
  mixerSnapshot: SignalMixerResult | null;
  entitlement?: EntitlementSummary | null;
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
  kbosOverlays?: KbosChartOverlays;
  mixer: SignalMixerResult;
}

const SIMPLE_COINS = [
  { symbol: 'BTCUSDT', nameFa: 'بیت‌کوین', short: 'BTC' },
  { symbol: 'ETHUSDT', nameFa: 'اتریوم', short: 'ETH' },
  { symbol: 'SOLUSDT', nameFa: 'سولانا', short: 'SOL' },
  { symbol: 'BNBUSDT', nameFa: 'بایننس', short: 'BNB' },
  { symbol: 'XRPUSDT', nameFa: 'ریپل', short: 'XRP' },
];

const RISK_PRESETS = [
  {
    id: 'calm',
    icon: '🛡️',
    titleFa: 'آرام و کم‌ریسک',
    titleEn: 'Safe & Calm',
    descFa: 'کمترین نوسان · محافظت حداکثری از سرمایه',
    descEn: 'Low volatility · maximum safety',
    marginPct: 3,
    maxLeverage: 3,
    dailyMaxLossPct: 3,
    trailingStopPct: 1.5,
  },
  {
    id: 'balanced',
    icon: '⚖️',
    titleFa: 'متعادل (پیشنهاد ما)',
    titleEn: 'Balanced (Recommended)',
    descFa: 'بهترین تعادل بین سود مستمر و امنیت حساب',
    descEn: 'Best balance of growth & safety',
    marginPct: 5,
    maxLeverage: 5,
    dailyMaxLossPct: 5,
    trailingStopPct: 2.0,
  },
  {
    id: 'bold',
    icon: '🚀',
    titleFa: 'پرسود و پرریسک',
    titleEn: 'Aggressive',
    descFa: 'اهرم بالاتر برای شکار حرکت‌های بزرگ',
    descEn: 'Higher leverage · larger swings',
    marginPct: 10,
    maxLeverage: 10,
    dailyMaxLossPct: 8,
    trailingStopPct: 2.5,
  },
] as const;

function HourlyBarChartSvg({ data }: { data: Array<{ bucket: string; pnl: number }> }) {
  if (!data.length) {
    return (
      <div className="h-[155px] flex items-center justify-center text-xs text-dim">
        هنوز معامله بسته‌ای در ساعات اخیر ثبت نشده است.
      </div>
    );
  }
  const maxAbs = Math.max(10, ...data.map((d) => Math.abs(d.pnl)));
  const midY = 75;
  const barW = Math.max(8, Math.min(22, Math.floor(380 / Math.max(1, data.length)) - 4));
  const totalW = Math.max(420, data.length * (barW + 6));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} 160`} className="w-full h-[155px]">
        <line x1="0" y1={midY} x2={totalW} y2={midY} stroke="rgba(128,150,200,0.22)" strokeDasharray="3 3" />
        {data.map((d, idx) => {
          const x = 10 + idx * (barW + 6);
          const h = Math.max(4, (Math.abs(d.pnl) / maxAbs) * 62);
          const y = d.pnl >= 0 ? midY - h : midY;
          const color = d.pnl >= 0 ? '#10D856' : '#f43f5e';
          return (
            <g key={`${d.bucket}-${idx}`}>
              <rect x={x} y={y} width={barW} height={h} rx="4" fill={color} opacity={0.9}>
                <title>{`${d.bucket}: ${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(2)}`}</title>
              </rect>
              {idx % 3 === 0 && (
                <text x={x + barW / 2} y="154" textAnchor="middle" fill="#7c91ba" fontSize="9" fontFamily="JetBrains Mono, monospace">
                  {d.bucket.slice(-5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CumulativeAreaSvg({ data }: { data: Array<{ date: string; cumulativePnl: number }> }) {
  if (!data.length) {
    return (
      <div className="h-[155px] flex items-center justify-center text-xs text-dim">
        هنوز نمودار ۳۰ روزه تکمیل نشده است.
      </div>
    );
  }
  const w = 520;
  const h = 155;
  const vals = data.map((d) => d.cumulativePnl);
  const min = Math.min(0, ...vals);
  const max = Math.max(10, ...vals);
  const span = max - min || 1;
  const pts = data.map((d, idx) => {
    const x = 16 + (idx / Math.max(1, data.length - 1)) * (w - 32);
    const y = h - 22 - ((d.cumulativePnl - min) / span) * (h - 40);
    return { x, y, d };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1]!.x.toFixed(1)} ${h - 22} L ${pts[0]!.x.toFixed(1)} ${h - 22} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[155px]">
      <defs>
        <linearGradient id="cobaltAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10D856" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#1464F6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1="16" y1={h - 22} x2={w - 16} y2={h - 22} stroke="rgba(128,150,200,0.22)" />
      <path d={areaPath} fill="url(#cobaltAreaGrad)" />
      <path d={linePath} fill="none" stroke="#10D856" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const [proMode, setProMode] = useState(false);
  const [symbol, setSymbol] = useState(data.config.symbol || 'BTCUSDT');
  const [tf, setTf] = useState<Timeframe>(data.config.entry_timeframe || '15m');
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'closed' | 'chart' | 'pending' | 'weekly'>('closed');
  const [modeError, setModeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiRunOutput, setAiRunOutput] = useState<{
    action: string;
    confidence: number;
    entry?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    thesis: string;
    modelCount?: number;
    executed?: boolean;
    error?: string;
  } | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [topupModalOpen, setTopupModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [topupMsg, setTopupMsg] = useState('');
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [settleReport, setSettleReport] = useState<{
    durationSec: number;
    tradesClosed: number;
    netSessionPnl: number;
    finalBalance: number;
  } | null>(null);

  // Manual ticket states (visible only in Pro Mode)
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(Math.min(10, data.config.max_leverage || 5));
  const [slInput, setSlInput] = useState('');
  const [tp1Input, setTp1Input] = useState('');
  const [tp2Input, setTp2Input] = useState('');
  const [tp3Input, setTp3Input] = useState('');
  const [ticketMsg, setTicketMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const currentPresetId = useMemo(() => {
    if (data.riskProfile?.preset === 'calm' || data.config.margin_pct <= 3) return 'calm';
    if (data.riskProfile?.preset === 'bold' || data.config.margin_pct >= 9) return 'bold';
    return 'balanced';
  }, [data.riskProfile?.preset, data.config.margin_pct]);

  const totalEq = Number(data.balance.total || 0);
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
      setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4500);
    }
  };

  const selectStrategy = async (key: 'ai_autonomous_agent' | 'dollarino_v01') => {
    setModeError(null);
    if (key === 'ai_autonomous_agent' && !isPaid && data.entitlement && !data.entitlement.hasPaidPlan) {
      // Check if subscription is strictly required (server also verifies on start)
    }
    setBusyAction(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({ strategy_key: key }),
      });
      showToast(
        key === 'ai_autonomous_agent'
          ? isFa ? 'حالت هوش مصنوعی مرکزی انتخاب شد 🤖' : 'Central AI Engine selected'
          : isFa ? 'استراتژی اختصاصی دلارینو V0.1 انتخاب شد ✨' : 'Dollarino V0.1 selected'
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
          max_leverage: preset.maxLeverage,
          daily_max_loss_pct: preset.dailyMaxLossPct,
          trailing_stop_enabled: 1,
          trailing_stop_pct: preset.trailingStopPct,
          risk_profile_json: { preset: preset.id, trailingStop: true, trailingDistance: preset.trailingStopPct },
        }),
      });
      showToast(isFa ? `سطح ریسک روی «${preset.titleFa}» تنظیم شد` : `Risk preset set to ${preset.titleEn}`);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', true);
    } finally {
      setBusyAction(false);
    }
  };

  const selectSymbolSimple = async (sym: string, autoTop = false) => {
    setSymbol(sym);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({ symbol: sym, auto_scan_top: autoTop ? 1 : 0 }),
      });
      showToast(
        autoTop
          ? isFa ? 'حالت اسکن هوشمند برترین ارزها (BTC/ETH/SOL) فعال شد' : 'Auto top-coins scan enabled'
          : isFa ? `ارز معاملاتی روی ${sym.replace('USDT', '')} تنظیم شد` : `Coin set to ${sym}`
      );
      onRefresh();
    } catch { /* ignore */ }
  };

  const switchTradingMode = async (mode: 'PAPER' | 'LIVE') => {
    setModeError(null);
    if (mode === 'LIVE' && !isPaid) {
      showToast(
        isFa
          ? 'برای معامله با پول واقعی در صرافی، ابتدا اشتراک Pro یا VIP را فعال کنید. حساب دمو رایگان است!'
          : 'Pro or VIP plan required for Live Exchange trading.',
        true
      );
      return;
    }
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({ trading_mode: mode }),
      });
      showToast(mode === 'PAPER' ? (isFa ? 'حساب دمو رایگان فعال شد 🧪' : 'Paper Demo active') : (isFa ? 'حالت معامله واقعی فعال شد 💎' : 'Live Mode active'));
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Switch failed', true);
    }
  };

  const handlePrimaryStartStop = async () => {
    setModeError(null);
    if (isRunning) {
      setStopConfirmOpen(true);
      return;
    }
    setBusyAction(true);
    try {
      const preset = RISK_PRESETS.find((p) => p.id === currentPresetId) ?? RISK_PRESETS[1];
      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({
          strategyKey: activeStrategy,
          symbol,
          autoScanTop: Boolean(data.config.auto_scan_top),
          marginPct: preset.marginPct,
          maxLeverage: preset.maxLeverage,
          dailyMaxLossPct: preset.dailyMaxLossPct,
          riskPreset: preset.id,
        }),
      });
      showToast(isFa ? '🚀 ربات با موفقیت روشن شد و در حال بررسی بازار است!' : 'Bot started successfully!');
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Start failed', true);
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
      showToast(isFa ? 'معامله بسته شد و سود/زیان به حساب نشست ✅' : 'Trade closed & settled.');
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
          marginMode,
          stopLoss: sl,
          tp1,
          tp2: tp2Input || undefined,
          tp3: tp3Input || undefined,
        }),
      });
      setTicketMsg(res.ok ? (res.pendingOrderId ? 'سفارش لیمیت ثبت شد' : 'معامله باز شد!') : res.error || 'خطا');
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
      todayProtectedCredit: Math.max(0, Number(data.balance.free || 0)),
      last7Days: pnlSum,
      totalProfit: data.stats.totalPnl,
      pnlPercentage: pnlPct,
      mostProfitableAsset: bestAsset,
      mostProfitableAssetPnl: bestAssetPnl,
      winRate: totalCount ? (totalWins / totalCount) * 100 : data.stats.winRate,
      profitFactor: data.stats.profitFactor,
      periodLabel: isFa ? 'گزارش ۷ روزه' : '7-DAY SNAPSHOT',
    };
  }, [data, totalEq, isFa]);

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
    for (const d of (data.recentAiDecisions || []).slice(0, 3)) {
      items.push({
        id: `ai-${d.id}`,
        text: d.message.replace(/\[.*?\]\s*/, '').slice(0, 120),
        time: (d.created_at || '').slice(11, 16) || '—',
        ok: d.level === 'INFO',
      });
    }
    return items.slice(0, 5);
  }, [data.closedTrades, data.recentAiDecisions, isFa]);

  return (
    <div className="space-y-5">
      {/* Feedback Alerts */}
      {notice && (
        <div className="p-3.5 rounded-2xl bg-[#10D856]/15 border border-[#10D856]/40 text-xs font-extrabold text-signal flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {modeError && (
        <div className="p-3.5 rounded-2xl bg-[#FF8A00]/15 border border-[#FF8A00]/45 text-xs font-extrabold text-flame flex flex-wrap items-center justify-between gap-2">
          <span>{modeError}</span>
          <div className="flex items-center gap-2">
            {onOpenTab && (
              <button
                onClick={() => onOpenTab('subscription')}
                className="px-3 py-1 rounded-xl btn-cobalt text-[11px] font-black"
              >
                {isFa ? 'مشاهده اشتراک‌ها' : 'Plans'}
              </button>
            )}
            <button onClick={() => setModeError(null)}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Kifpool-Luxury Top Wallet & One-Tap Start Hero */}
      <section className="hero-cobalt rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold text-white">
                <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-[#10D856] animate-pulse' : 'bg-white/60'}`} />
                {isRunning
                  ? isFa ? 'ربات روشنه و داره کار می‌کنه' : 'Bot is Active & Scanning'
                  : isFa ? 'ربات فعلاً خاموشه' : 'Bot is Standby'}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-bold text-white/90">
                {activeStrategy === 'ai_autonomous_agent'
                  ? isFa ? 'هوش مصنوعی دلارینو' : 'Central AI'
                  : isFa ? 'استراتژی دلارینو V0.1' : 'Dollarino V0.1'}
              </span>
            </div>

            <div className="pt-1">
              <div className="text-xs text-white/75 font-bold">{t.totalEquity}</div>
              <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
                <span className="text-3xl sm:text-4xl font-black font-mono-num text-white tracking-tight">
                  ${totalEq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-xs sm:text-sm font-black px-2.5 py-1 rounded-xl ${
                  totalPnl + unrealized >= 0 ? 'bg-[#10D856]/25 text-[#86efac]' : 'bg-rose-500/25 text-rose-200'
                }`}>
                  {totalPnl + unrealized >= 0 ? '+' : ''}${(totalPnl + unrealized).toFixed(2)} {isFa ? 'سود کل' : 'Total'}
                </span>
              </div>
            </div>
          </div>

          {/* Paper Demo vs Live Toggle + Demo Credit Actions */}
          <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <div className="inline-flex p-1 rounded-2xl bg-black/25 backdrop-blur">
              <button
                type="button"
                onClick={() => void switchTradingMode('PAPER')}
                className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                  data.config.trading_mode === 'PAPER' ? 'bg-white text-[#0A256E]' : 'text-white/80 hover:text-white'
                }`}
              >
                {isFa ? '🧪 حساب دمو رایگان' : '🧪 Paper Demo'}
              </button>
              <button
                type="button"
                onClick={() => void switchTradingMode('LIVE')}
                className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                  data.config.trading_mode === 'LIVE' ? 'bg-[#10D856] text-[#04120a]' : 'text-white/80 hover:text-white'
                }`}
              >
                {isFa ? '💎 حساب واقعی' : '💎 Live Account'}
              </button>
            </div>

            {data.config.trading_mode === 'PAPER' && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTopupModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'شارژ دمو' : 'Top Up'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetDemo()}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 font-bold inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'شروع مجدد ۱۰,۰۰۰$' : 'Reset $10k'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Simple Stats Strip + ONE BIG ACTION BUTTON */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center pt-2 border-t border-white/15">
          <div className="lg:col-span-7 grid grid-cols-3 gap-2.5 text-center sm:text-start">
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <div className="text-[11px] text-white/75">{t.todayPnl}</div>
              <div className={`text-sm sm:text-base font-black font-mono-num ${todayPnl >= 0 ? 'text-[#86efac]' : 'text-rose-200'}`}>
                {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
              </div>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <div className="text-[11px] text-white/75">{t.winRate}</div>
              <div className="text-sm sm:text-base font-black font-mono-num text-white">
                {data.stats.winRate.toFixed(0)}%
              </div>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <div className="text-[11px] text-white/75">{t.openPositions}</div>
              <div className="text-sm sm:text-base font-black font-mono-num text-white">
                {data.openTrades.length}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handlePrimaryStartStop()}
              className={`flex-1 py-4 px-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition ${
                isRunning
                  ? 'bg-[#FF8A00] hover:bg-[#fb923c] text-white'
                  : 'bg-[#10D856] hover:bg-[#22e568] text-[#03160a]'
              }`}
            >
              <Power className="w-5 h-5" />
              <span>
                {isRunning
                  ? isFa ? 'توقف ربات' : 'Stop Robot'
                  : isFa ? '🚀 شروع خودکار ربات' : '🚀 Start Auto-Trading'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Step 1: 3 Simple Trading Mode Cards */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-black text-main">
            {isFa ? '۱. روش کار ربات را انتخاب کنید' : '1. Choose How Dollarino Trades for You'}
          </h2>
          <button
            type="button"
            onClick={() => setProMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              proMode ? 'btn-cobalt' : 'surface-card text-sub hover:text-main'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{proMode ? (isFa ? 'بازگشت به نمای ساده' : 'Simple View') : (isFa ? 'نمای حرفه‌ای تریدرها' : 'Pro View')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Centralized Multi-AI */}
          <div
            onClick={() => void selectStrategy('ai_autonomous_agent')}
            className={`cursor-pointer surface-card rounded-3xl p-4 sm:p-5 transition border-2 flex flex-col justify-between gap-3 ${
              activeStrategy === 'ai_autonomous_agent'
                ? 'border-[#1464F6] ring-2 ring-[#1464F6]/25'
                : 'hover:border-[#1464F6]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full banner-cobalt-soft text-[10px] font-black text-brand">
                  <BrainCircuit className="w-3 h-3" />
                  <span>{isFa ? 'هوش مصنوعی مرکزی' : 'Central AI'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino Central AI'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'تصمیم‌گیری توسط موتور مرکزی پلتفرم — بدون نیاز به خرید API یا تنظیمات توسط شما.'
                    : 'Powered by our central multi-AI brain — zero API key setup needed.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicAI />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className={platformAiConfigured ? 'text-signal font-extrabold' : 'text-flame font-bold'}>
                {platformAiConfigured
                  ? isFa
                    ? `● فعال (${data.platformAI?.activeCount || 1} مدل ترکیبی)`
                    : `● Ready (${data.platformAI?.activeCount || 1}x Ensemble)`
                  : isFa
                    ? '● در حال آماده‌سازی توسط مدیر'
                    : '● Pending Admin setup'}
              </span>
              {activeStrategy === 'ai_autonomous_agent' && (
                <span className="px-2.5 py-0.5 rounded-full btn-cobalt text-[10px] font-black">
                  {isFa ? 'انتخاب‌شده' : 'Selected'}
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Dollarino V0.1 Proprietary Master Strategy */}
          <div
            onClick={() => void selectStrategy('dollarino_v01')}
            className={`cursor-pointer surface-card rounded-3xl p-4 sm:p-5 transition border-2 flex flex-col justify-between gap-3 ${
              activeStrategy === 'dollarino_v01'
                ? 'border-[#10D856] ring-2 ring-[#10D856]/25'
                : 'hover:border-[#10D856]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#10D856]/15 text-[10px] font-black text-signal">
                  <Sparkles className="w-3 h-3" />
                  <span>{isFa ? 'استراتژی اختصاصی' : 'Flagship Engine'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'دلارینو V0.1' : 'Dollarino V0.1'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'بهترین و کامل‌ترین استراتژی اختصاصی دلارینو — ترکیب هوشمند تمام اندیکاتورها برای شکار سود با کمترین خطا.'
                    : 'Our unified master strategy combining all proven trend, sweep & momentum filters.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicCodex />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className="text-signal font-extrabold">
                {isFa ? '● رایگان در دمو و حساب واقعی' : '● Free in Demo & Live'}
              </span>
              {activeStrategy === 'dollarino_v01' && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#10D856] text-[#03160a] text-[10px] font-black">
                  {isFa ? 'انتخاب‌شده' : 'Selected'}
                </span>
              )}
            </div>
          </div>

          {/* Card 3: کپی‌ترید */}
          <div
            onClick={() => onOpenTab?.('copytrade')}
            className="cursor-pointer surface-card rounded-3xl p-4 sm:p-5 transition border-2 hover:border-[#FF8A00]/60 flex flex-col justify-between gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF8A00]/15 text-[10px] font-black text-flame">
                  <Bot className="w-3 h-3" />
                  <span>{isFa ? 'خودکار از تلگرام' : 'Telegram Sync'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-main pt-1">
                  {isFa ? 'کپی‌ترید' : 'Copy-Trade'}
                </h3>
                <p className="text-xs text-sub leading-relaxed">
                  {isFa
                    ? 'تمام معاملات کانال رسمی دلارینو به‌صورت خودکار و همزمان در حساب شما کپی می‌شوند.'
                    : 'Automatically mirror official Telegram signals straight into your account.'}
                </p>
              </div>
              <div className="shrink-0 w-14 h-14 flex items-center justify-center">
                <ModeGraphicTelegram />
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]">
              <span className="text-sub font-bold">{isFa ? 'مدیریت خودکار ۳ حد سود' : 'Auto 3-TP & Stop-Loss'}</span>
              <span className="text-brand font-black">{isFa ? 'ورود به کپی‌ترید ←' : 'Open Copy-Trade →'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2 & Step 3: Risk Shield + Simple Coin Picker */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 surface-card rounded-3xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-black text-main">
            {isFa ? '۲. میزان ریسک را انتخاب کنید' : '2. Pick Your Comfort Level'}
          </h2>
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
        </div>

        <div className="lg:col-span-5 surface-card rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-main">
              {isFa ? '۳. ارز دیجیتال مورد نظر' : '3. Target Coin'}
            </h2>
            <button
              type="button"
              onClick={() => void selectSymbolSimple(symbol, !data.config.auto_scan_top)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition ${
                data.config.auto_scan_top ? 'btn-emerald border-transparent' : 'surface-soft text-sub'
              }`}
            >
              {isFa ? '✨ خودکار (۳ ارز برتر)' : '✨ Auto Top 3'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SIMPLE_COINS.map((c) => {
              const active = symbol === c.symbol && !data.config.auto_scan_top;
              return (
                <button
                  key={c.symbol}
                  type="button"
                  onClick={() => void selectSymbolSimple(c.symbol, false)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-extrabold transition ${
                    active ? 'btn-cobalt border-transparent' : 'surface-soft text-main hover:border-brand'
                  }`}
                >
                  <CoinIcon symbol={c.symbol} size={20} />
                  <span>{isFa ? c.nameFa : c.short}</span>
                </button>
              );
            })}
            <SymbolPicker
              markets={markets}
              provider={data.activeExchange.provider}
              value={symbol}
              onChange={(s) => void selectSymbolSimple(s, false)}
              lang={lang}
              compact
            />
          </div>
          <p className="text-[11px] text-dim">
            {data.config.auto_scan_top
              ? isFa
                ? 'ربات به‌طور همزمان بیت‌کوین، اتریوم و سولانا را برای بهترین فرصت بررسی می‌کند.'
                : 'Scanning BTC, ETH & SOL simultaneously for the strongest setup.'
              : isFa
                ? `تمرکز ربات روی ${symbol.replace('USDT', '')} با حفظ خودکار سود و حد ضرر هوشمند.`
                : `Focused on ${symbol} with automatic trailing stop & 3 profit targets.`}
          </p>
        </div>
      </section>

      {/* Open Positions & History — Plain-Language Kifpool Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 surface-card rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-signal" />
              <span>{t.openPositions} ({data.openTrades.length})</span>
            </h2>
            <button onClick={onRefresh} className="p-2 rounded-xl surface-soft text-sub hover:text-main" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.openTrades.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6 text-center space-y-2">
              <div className="text-sm font-bold text-main">
                {isRunning
                  ? isFa ? 'ربات در حال جستجوی بهترین نقطه ورود سودآور است...' : 'Bot is waiting for a high-probability entry...'
                  : isFa ? 'فعلاً معامله بازی ندارید' : 'No open trades yet'}
              </div>
              <p className="text-xs text-dim">
                {isFa
                  ? 'کافیست دکمه سبز «شروع خودکار ربات» را بزنید تا ربات به‌صورت خودکار وارد معامله شود.'
                  : 'Tap Start Auto-Trading above and Dollarino will handle entries, targets & stop-loss automatically.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.openTrades.map((pos) => {
                const uPnl = Number(pos.unrealized_pnl ?? 0);
                const roe = Number(pos.roe_pct ?? 0);
                const inProfit = uPnl >= 0;
                return (
                  <div key={pos.id} className="surface-soft rounded-2xl p-4 space-y-3 border">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={pos.symbol} size={32} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-main">{pos.symbol.replace('USDT', '')}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                              pos.direction === 'LONG' ? 'bg-[#10D856]/15 text-signal' : 'bg-rose-500/15 text-rose-500'
                            }`}>
                              {pos.direction === 'LONG' ? (isFa ? 'سود از رشد' : 'BUY') : (isFa ? 'سود از ریزش' : 'SELL')}
                            </span>
                            {pos.risk_free_active === 1 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full banner-cobalt-soft text-brand font-bold">
                                🛡️ {t.riskFreeBadge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-dim font-mono-num">
                            {isFa ? 'ورود:' : 'Entry:'} ${pos.entry_price} · {isFa ? 'فعلی:' : 'Now:'} ${pos.mark_price ?? pos.entry_price}
                          </div>
                        </div>
                      </div>

                      <div className="text-end">
                        <div className={`text-base font-black font-mono-num ${inProfit ? 'text-signal' : 'text-loss'}`}>
                          {inProfit ? '+' : ''}${uPnl.toFixed(2)}
                        </div>
                        <div className={`text-[11px] font-bold font-mono-num ${inProfit ? 'text-signal' : 'text-loss'}`}>
                          {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'حد ضرر امن' : 'Auto Stop'}</div>
                        <div className="font-mono-num font-bold text-main">${pos.current_stop_loss}</div>
                      </div>
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'هدف اول' : 'Target 1'}</div>
                        <div className="font-mono-num font-bold text-signal">${pos.tp1}</div>
                      </div>
                      <div className="surface-card rounded-xl py-1.5 px-2">
                        <div className="text-dim">{isFa ? 'سرمایه درگیر' : 'Margin'}</div>
                        <div className="font-mono-num font-bold text-main">${pos.margin_used}</div>
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
                          <span>SL/TP</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void closePosition(pos.id)}
                        className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white text-xs font-extrabold transition inline-flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بستن معامله و برداشت نتیجه' : 'Close & Settle'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Friendly Activity & History Column */}
        <div className="lg:col-span-5 surface-card rounded-3xl p-4 sm:p-5 space-y-4">
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
              {isFa ? 'هنوز فعالیتی ثبت نشده است. با روشن کردن ربات، تمام گزارش‌ها به زبان ساده اینجا نمایش داده می‌شوند.' : 'No activity yet.'}
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
                    <div key={tr.id} className="flex items-center justify-between text-xs px-2.5 py-2 rounded-xl surface-soft">
                      <div className="flex items-center gap-2">
                        <CoinIcon symbol={tr.symbol} size={18} />
                        <span className="font-bold text-main">{tr.symbol.replace('USDT', '')}</span>
                      </div>
                      <span className={`font-mono-num font-black ${p >= 0 ? 'text-signal' : 'text-loss'}`}>
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

      {/* Optional Pro Mode Drawer: Full Candlestick Chart + AI Run + Manual Ticket + 30d Analytics */}
      {proMode && (
        <section className="space-y-4 pt-3 border-t">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand" />
              <span>{isFa ? 'پنل تخصصی تریدرها (نمودار، تحلیل فوری AI و معامله دستی)' : 'Pro Trader Desk'}</span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={aiRunning}
                onClick={() => void runAiNow(false)}
                className="px-3 py-2 rounded-xl surface-card text-xs font-bold text-main hover:border-brand"
              >
                {aiRunning ? '...' : isFa ? 'تست نظر هوش مصنوعی' : 'Ask Central AI'}
              </button>
              <button
                type="button"
                disabled={aiRunning}
                onClick={() => void runAiNow(true)}
                className="px-3 py-2 rounded-xl btn-emerald text-xs font-extrabold"
              >
                {aiRunning ? '...' : isFa ? 'اجرای فوری معامله AI' : 'Run & Execute AI'}
              </button>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="px-3 py-2 rounded-xl surface-card text-xs font-bold text-brand"
              >
                {t.wizard}
              </button>
            </div>
          </div>

          {aiRunOutput && (
            <div className="surface-card rounded-2xl p-4 text-xs space-y-1.5 border-[#1464F6]/40">
              <div className="flex items-center justify-between font-black">
                <span className="text-main">
                  {aiRunOutput.action} {symbol} ({aiRunOutput.confidence}%)
                  {aiRunOutput.modelCount ? ` · ${aiRunOutput.modelCount}x Model Consensus` : ''}
                </span>
                {aiRunOutput.executed && <span className="text-signal">Executed ✅</span>}
              </div>
              <p className="text-sub leading-relaxed">{aiRunOutput.thesis}</p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 surface-card rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CoinIcon symbol={symbol} size={24} />
                  <span className="font-black text-main">{symbol}</span>
                  <span className="font-mono-num font-bold text-sm text-main">
                    ${lastPriceNum > 0 ? lastPriceNum.toLocaleString() : '—'}
                  </span>
                  <span className={`text-xs font-bold ${priceChangePct >= 0 ? 'text-signal' : 'text-loss'}`}>
                    {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex gap-1">
                  {(['5m', '15m', '30m', '1h', '4h'] as Timeframe[]).map((tfOpt) => (
                    <button
                      key={tfOpt}
                      onClick={() => setTf(tfOpt)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        tf === tfOpt ? 'btn-cobalt' : 'surface-soft text-sub'
                      }`}
                    >
                      {tfOpt}
                    </button>
                  ))}
                </div>
              </div>

              {overview?.candles ? (
                <CandlestickChart candles={overview.candles} levels={chartLevels} overlays={chartOverlays} />
              ) : (
                <div className="h-[340px] flex items-center justify-center text-xs text-dim">
                  در حال بارگذاری نمودار...
                </div>
              )}
            </div>

            <form onSubmit={placeManualOrder} className="xl:col-span-4 surface-card rounded-3xl p-4 space-y-3">
              <h3 className="text-sm font-black text-main">{isFa ? 'ثبت معامله دستی سریع' : 'Manual Order Ticket'}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSide('LONG')}
                  className={`py-2 rounded-xl text-xs font-black ${side === 'LONG' ? 'bg-[#10D856] text-[#03160a]' : 'surface-soft text-sub'}`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SHORT')}
                  className={`py-2 rounded-xl text-xs font-black ${side === 'SHORT' ? 'bg-rose-500 text-white' : 'surface-soft text-sub'}`}
                >
                  SHORT
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-dim block mb-1">Order Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}
                    className="w-full surface-input rounded-xl px-2.5 py-2 text-xs"
                  >
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-dim block mb-1">Leverage ({lev}x)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={lev}
                    onChange={(e) => setLev(Number(e.target.value))}
                    className="w-full surface-input rounded-xl px-2.5 py-2 text-xs font-mono-num"
                  />
                </div>
              </div>
              {orderType === 'LIMIT' && (
                <input
                  type="text"
                  placeholder="Limit Price"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Stop Loss (optional)"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  className="w-full surface-input rounded-xl px-2.5 py-2 text-xs font-mono-num"
                />
                <input
                  type="text"
                  placeholder="TP1 (optional)"
                  value={tp1Input}
                  onChange={(e) => setTp1Input(e.target.value)}
                  className="w-full surface-input rounded-xl px-2.5 py-2 text-xs font-mono-num"
                />
              </div>
              {ticketMsg && <div className="text-xs font-bold text-brand">{ticketMsg}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl btn-cobalt text-xs font-black"
              >
                {submitting ? '...' : `Execute ${orderType} ${side}`}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="surface-card rounded-3xl p-4">
              <div className="text-xs font-bold text-sub mb-2">{isFa ? 'عملکرد ساعتی' : 'Hourly Execution PnL'}</div>
              <HourlyBarChartSvg data={data.charts.hourlyPnl} />
            </div>
            <div className="surface-card rounded-3xl p-4">
              <div className="text-xs font-bold text-sub mb-2">{isFa ? 'رشد سرمایه ۳۰ روزه' : '30-Day Cumulative Equity'}</div>
              <CumulativeAreaSvg data={data.charts.cumulative30d || []} />
            </div>
          </div>
        </section>
      )}

      {/* Modals */}
      {topupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleTopup} className="surface-card rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-main">{t.addBalance}</h3>
              <button type="button" onClick={() => setTopupModalOpen(false)} className="text-sub"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 5000, 10000].map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setTopupAmount(v)}
                  className={`py-2 rounded-xl text-xs font-mono-num font-black ${
                    topupAmount === v ? 'btn-cobalt' : 'surface-soft text-sub'
                  }`}
                >
                  ${v}
                </button>
              ))}
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
          <div className="surface-card rounded-3xl w-full max-w-sm p-6 space-y-4">
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
          <div className="surface-card rounded-3xl w-full max-w-sm p-6 space-y-4 text-center">
            <ShieldCheck className="w-10 h-10 text-signal mx-auto" />
            <h3 className="font-black text-base text-main">{isFa ? 'گزارش پایان فعالیت ربات' : 'Session Summary'}</h3>
            <div className="surface-soft rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'معاملات بسته‌شده' : 'Trades Closed'}</span>
                <span className="font-mono-num font-black text-main">{settleReport.tradesClosed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'سود/زیان خالص' : 'Net PnL'}</span>
                <span className={`font-mono-num font-black ${settleReport.netSessionPnl >= 0 ? 'text-signal' : 'text-loss'}`}>
                  {settleReport.netSessionPnl >= 0 ? '+' : ''}${settleReport.netSessionPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{isFa ? 'موجودی نهایی' : 'Final Balance'}</span>
                <span className="font-mono-num font-black text-main">${settleReport.finalBalance.toLocaleString()}</span>
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
          <form onSubmit={saveSlTp} className="surface-card rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-sm text-main">Edit SL/TP — {editPos.symbol}</h3>
              <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-xs text-sub block mb-1">Stop Loss</label>
              <input value={editSlVal} onChange={(e) => setEditSlVal(e.target.value)} className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num" />
            </div>
            <div>
              <label className="text-xs text-sub block mb-1">TP1</label>
              <input value={editTp1Val} onChange={(e) => setEditTp1Val(e.target.value)} className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt text-xs font-black">Save</button>
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
