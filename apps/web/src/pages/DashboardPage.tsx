import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Bot,
  Clock,
  Edit3,
  Gauge,
  Layers,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import type { Candle, KbosParams, SignalMixerResult, Timeframe } from '@dollarino/core';
import { CandlestickChart, type ChartLevels, type ChartOverlays, type KbosChartOverlays } from '../components/CandlestickChart';
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

function classifyMarket(sym: string): 'crypto' | 'forex' | 'metal' | 'energy' | 'index' | 'equity' {
  const s = sym.toUpperCase();
  if (s.includes('XAU') || s.includes('XAG')) return 'metal';
  if (s.includes('WTI') || s.includes('BRENT')) return 'energy';
  if (s.includes('EURUSD') || s.includes('GBPUSD') || s.includes('USDJPY')) return 'forex';
  if (s.includes('SPX') || s.includes('NAS100') || s.includes('US30')) return 'index';
  return 'crypto';
}

function SparklineSvg({ values, isProfit }: { values: number[]; isProfit: boolean }) {
  const pts = values.length >= 2 ? values : [1, 1];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 180;
  const h = 36;
  const coords = pts.map((v, idx) => {
    const x = (idx / Math.max(1, pts.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = isProfit ? '#27cd86' : '#eb493d';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9 overflow-visible">
      <polyline fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={coords.join(' ')} />
    </svg>
  );
}

function HourlyBarChartSvg({ data }: { data: Array<{ bucket: string; pnl: number }> }) {
  if (!data.length) {
    return (
      <div className="h-[160px] flex items-center justify-center text-xs text-[#6c7689]">
        No hourly executions yet. Start AI Agent or open a trade to track hourly PnL.
      </div>
    );
  }
  const maxAbs = Math.max(10, ...data.map((d) => Math.abs(d.pnl)));
  const midY = 75;
  const barW = Math.max(8, Math.min(22, Math.floor(380 / Math.max(1, data.length)) - 4));
  const totalW = Math.max(420, data.length * (barW + 6));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} 160`} className="w-full h-[160px]">
        <line x1="0" y1={midY} x2={totalW} y2={midY} stroke="#1c2028" strokeDasharray="3 3" />
        {data.map((d, idx) => {
          const x = 10 + idx * (barW + 6);
          const h = Math.max(3, (Math.abs(d.pnl) / maxAbs) * 62);
          const y = d.pnl >= 0 ? midY - h : midY;
          const color = d.pnl >= 0 ? '#27cd86' : '#eb493d';
          return (
            <g key={`${d.bucket}-${idx}`}>
              <rect x={x} y={y} width={barW} height={h} rx="3" fill={color} opacity={0.9}>
                <title>{`${d.bucket}: ${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(2)}`}</title>
              </rect>
              {idx % 3 === 0 && (
                <text x={x + barW / 2} y="154" textAnchor="middle" fill="#6c7689" fontSize="9" fontFamily="JetBrains Mono, monospace">
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
      <div className="h-[195px] flex items-center justify-center text-xs text-[#6c7689]">
        No earnings yet. Top up or execute trades to view 30-day cumulative curve.
      </div>
    );
  }
  const w = 520;
  const h = 195;
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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[195px]">
      <defs>
        <linearGradient id="earnAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#27cd86" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#27cd86" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <line x1="16" y1={h - 22} x2={w - 16} y2={h - 22} stroke="#1c2028" />
      <path d={areaPath} fill="url(#earnAreaGrad)" />
      <path d={linePath} fill="none" stroke="#27cd86" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#27cd86" opacity={0.7}>
          <title>{`${p.d.date}: ${p.d.cumulativePnl >= 0 ? '+' : ''}$${p.d.cumulativePnl.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

const STRAT_LABELS: Record<string, string> = {
  kbos_v11: 'KIYA BOT v11 (KBOs)',
  sp2l: 'Steady Growth (SP2L)',
  ema_trend_pullback: 'Momentum (EMA)',
  signal_mixer: 'AI Managed (8-Ch)',
  grid_strategy: 'Grid Mean Reversion',
  vibe_4h_daily_breakout: '4H Daily Breakout',
  vibe_4h_candle_confirmation: '4H Confirmation',
  dollarino_tv_hybrid: 'Dollarino TV Hybrid',
};

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
  const [activeSubTab, setActiveSubTab] = useState<'closed' | 'chart' | 'pending' | 'weekly'>('closed');
  const [marketFilter, setMarketFilter] = useState<'all' | 'crypto' | 'forex' | 'metal' | 'energy' | 'index' | 'equity'>('all');

  // Interactive modals matching timetrade.live
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [topupModalOpen, setTopupModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [topupMsg, setTopupMsg] = useState('');
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [settleReport, setSettleReport] = useState<{
    durationSec: number;
    tradesClosed: number;
    positionsSettledOnStop: number;
    netSessionPnl: number;
    finalBalance: number;
  } | null>(null);

  // Countdown for NEXT CYCLE IN
  const [cycleSec, setCycleSec] = useState(data.nextCycleInSec ?? 420);
  useEffect(() => {
    setCycleSec(data.nextCycleInSec ?? 420);
  }, [data.nextCycleInSec]);
  useEffect(() => {
    const id = setInterval(() => setCycleSec((s) => (s > 1 ? s - 1 : 900)), 1000);
    return () => clearInterval(id);
  }, []);

  // Quick manual ticket inside Chart sub-tab
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSS'>(data.config.margin_mode || 'ISOLATED');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(Math.min(10, data.config.max_leverage || 10));
  const [slInput, setSlInput] = useState('');
  const [tp1Input, setTp1Input] = useState('');
  const [tp2Input, setTp2Input] = useState('');
  const [tp3Input, setTp3Input] = useState('');
  const [orderMsg, setOrderMsg] = useState<string | null>(null);

  // Edit SL/TP Modal
  const [editingPos, setEditingPos] = useState<DashboardPayload['openTrades'][0] | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp1, setEditTp1] = useState('');
  const [editTp2, setEditTp2] = useState('');
  const [editTp3, setEditTp3] = useState('');

  const loadMarket = async (forceResetLevels = false) => {
    const res = await apiFetch<MarketOverview>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`).catch(() => null);
    if (res) {
      setOverview(res);
      const px = Number(res.market24h.lastPrice);
      const dec = px >= 100 ? 2 : px >= 1 ? 4 : 6;
      if (forceResetLevels || !slInput) {
        setSlInput((side === 'LONG' ? px * 0.99 : px * 1.01).toFixed(dec));
        setTp1Input((side === 'LONG' ? px * 1.015 : px * 0.985).toFixed(dec));
        setTp2Input((side === 'LONG' ? px * 1.03 : px * 0.97).toFixed(dec));
        setTp3Input((side === 'LONG' ? px * 1.045 : px * 0.955).toFixed(dec));
      }
    }
  };

  useEffect(() => {
    void loadMarket(true);
    const timer = setInterval(() => void loadMarket(false), 12_000);
    return () => clearInterval(timer);
  }, [symbol, tf]);

  const isRunning = data.config.bot_state.startsWith('RUNNING');
  const isPaper = data.config.trading_mode === 'PAPER';
  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const unrealized = data.stats.unrealizedPnl ?? data.openTrades.reduce((s, p) => s + Number(p.unrealized_pnl ?? 0), 0);
  const totalEquity = Number(data.balance.total || freeBal + usedBal) + unrealized;
  const protectedCredit = Math.max(0, data.stats.todayPnl);

  const filteredOpenTrades = useMemo(() => {
    if (marketFilter === 'all') return data.openTrades;
    return data.openTrades.filter((p) => classifyMarket(p.symbol) === marketFilter);
  }, [data.openTrades, marketFilter]);

  const filteredClosedTrades = useMemo(() => {
    if (marketFilter === 'all') return data.closedTrades;
    return data.closedTrades.filter((p) => classifyMarket(p.symbol) === marketFilter);
  }, [data.closedTrades, marketFilter]);

  const weeklyCardMetrics: WeeklyCardMetrics = useMemo(() => {
    const last7 = data.stats.last7dPnl ?? data.charts.weeklyResults.reduce((s, w) => s + Number(w.pnl || 0), 0);
    const baseEq = Math.max(100, totalEquity - last7);
    const pct = (last7 / baseEq) * 100;
    const bySym = new Map<string, number>();
    for (const ct of data.closedTrades) {
      bySym.set(ct.symbol, (bySym.get(ct.symbol) ?? 0) + Number(ct.realized_pnl || 0));
    }
    const top = [...bySym.entries()].sort((a, b) => b[1] - a[1])[0];
    const now = new Date();
    const wkAgo = new Date(Date.now() - 6 * 86400_000);
    const periodLabel = `${wkAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return {
      totalBalance: totalEquity,
      todayProtectedCredit: protectedCredit,
      last7Days: last7,
      totalProfit: data.stats.totalPnl,
      pnlPercentage: Number.isFinite(pct) ? pct : 0,
      mostProfitableAsset: top?.[0] ?? data.config.symbol,
      mostProfitableAssetPnl: top?.[1] ?? 0,
      winRate: data.stats.winRate,
      profitFactor: data.stats.profitFactor,
      periodLabel,
    };
  }, [data, totalEquity, protectedCredit]);

  const switchAccountMode = async (mode: 'PAPER' | 'LIVE') => {
    if (mode === data.config.trading_mode) return;
    await apiFetch('/api/trading/config', {
      method: 'PATCH',
      body: JSON.stringify({ trading_mode: mode }),
    });
    onRefresh();
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupMsg('');
    const res = await apiFetch<{ ok: boolean; balanceAfter: number }>('/api/trading/wallet/topup', {
      method: 'POST',
      body: JSON.stringify({ amountUsd: topupAmount }),
    });
    setTopupMsg(`Credited +$${topupAmount.toLocaleString()} (New Balance: $${res.balanceAfter.toLocaleString()})`);
    onRefresh();
  };

  const handleStopConfirmed = async (settleOpen: boolean) => {
    setStopConfirmOpen(false);
    const res = await apiFetch<{ settlement?: typeof settleReport }>('/api/trading/bot/stop', {
      method: 'POST',
      body: JSON.stringify({ settleOpen }),
    });
    if (res.settlement) setSettleReport(res.settlement);
    onRefresh();
  };

  const placeManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderMsg(null);
    const res = await apiFetch<{ ok?: boolean; error?: string; tradeId?: string; pendingOrderId?: string }>('/api/trading/orders/manual', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        direction: side,
        orderType,
        marginMode,
        limitPrice: orderType === 'LIMIT' ? limitPrice : overview?.market24h.lastPrice,
        leverage: lev,
        stopLoss: slInput,
        tp1: tp1Input,
        tp2: tp2Input || undefined,
        tp3: tp3Input || undefined,
        timeframe: tf,
      }),
    });
    setOrderMsg(
      res.pendingOrderId
        ? `Limit order queued (${res.pendingOrderId})`
        : res.ok
          ? `Opened ${side} ${symbol} (${res.tradeId})`
          : res.error || 'Rejected'
    );
    onRefresh();
  };

  const saveEditPos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPos) return;
    await apiFetch(`/api/trading/positions/${editingPos.id}/tpsl`, {
      method: 'PATCH',
      body: JSON.stringify({ stopLoss: editSl, tp1: editTp1, tp2: editTp2 || undefined, tp3: editTp3 || undefined }),
    });
    setEditingPos(null);
    onRefresh();
  };

  const activePos = data.openTrades[0];
  const chartLevels: ChartLevels | undefined = useMemo(() => {
    if (activePos && activePos.symbol === symbol) {
      return {
        entry: Number(activePos.entry_price),
        stopLoss: Number(activePos.current_stop_loss),
        tp1: Number(activePos.tp1),
        tp2: activePos.tp2 ? Number(activePos.tp2) : undefined,
        tp3: activePos.tp3 ? Number(activePos.tp3) : undefined,
      };
    }
    return undefined;
  }, [activePos, symbol]);

  const chartOverlays: ChartOverlays | undefined = overview
    ? {
        ema20: overview.indicators.ema20,
        ema50: overview.indicators.ema50,
        ema200: overview.indicators.ema200,
      }
    : undefined;

  const mm = String(Math.floor(cycleSec / 60)).padStart(2, '0');
  const ss = String(cycleSec % 60).padStart(2, '0');

  return (
    <div className="space-y-5">
      {/* 1. TimeTrade Header: AI Agent Trading + Live/Paper Toggle + Add Balance + Start/Stop */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#4b73f5]" />
              <span>{t.nav.dashboard}</span>
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                isRunning
                  ? 'bg-[#27cd86]/15 text-[#27cd86] border-[#27cd86]/35'
                  : 'bg-[#1a1e26] text-[#6c7689] border-[#262b36]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#27cd86] animate-pulse' : 'bg-[#6c7689]'}`} />
              <span>{isRunning ? (lang === 'fa' ? 'فعال' : 'Active') : lang === 'fa' ? 'متوقف' : 'Standby'}</span>
            </span>
          </div>
          <p className="text-xs text-[#6c7689]">
            {lang === 'fa'
              ? 'موتور معاملاتی غیرریپینت KBOs v11 · میکسر ۸ کاناله · خروج ۳ تارگت و تریلینگ استاپ'
              : 'Non-repainting KIYA BOT v11 engine · 8-Channel Mixer · 3-TP Risk-Free & Trailing SL'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Live Account | Demo Paper Segmented Switch */}
          <div className="inline-flex rounded-lg bg-[#0f1218] border border-[#1c2028] p-0.5 text-xs">
            <button
              onClick={() => void switchAccountMode('LIVE')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                !isPaper ? 'bg-[#4b73f5] text-white' : 'text-[#6c7689] hover:text-white'
              }`}
            >
              {t.liveMode}
            </button>
            <button
              onClick={() => void switchAccountMode('PAPER')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                isPaper ? 'bg-[#4b73f5] text-white' : 'text-[#6c7689] hover:text-white'
              }`}
            >
              {t.paperMode}
            </button>
          </div>

          <button
            onClick={() => {
              setTopupMsg('');
              setTopupModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1e26] hover:bg-[#222733] border border-[#262b36] text-xs font-semibold text-white transition"
          >
            <Plus className="w-3.5 h-3.5 text-[#27cd86]" />
            <span>{t.addBalance}</span>
          </button>

          {isRunning ? (
            <button
              onClick={() => setStopConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#eb493d]/15 hover:bg-[#eb493d] border border-[#eb493d]/40 text-[#eb493d] hover:text-white text-xs font-bold transition"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{t.stopBot}</span>
            </button>
          ) : (
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4b73f5] hover:bg-[#3d63e0] text-white text-xs font-bold glow-primary transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.startBot}</span>
            </button>
          )}
        </div>
      </div>

      {/* Post-Stop Settlement Summary Card (when user stops bot) */}
      {settleReport && (
        <div className="card-tt p-4 border-[#4b73f5]/40 bg-[#4b73f5]/5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#27cd86]" />
              <span>{lang === 'fa' ? 'گزارش تسویه پایان نشست معاملاتی' : 'Session Stop Settlement Summary'}</span>
            </div>
            <p className="text-[11px] text-[#9aa5b5]">
              Duration: <span className="font-mono-num text-white">{Math.floor(settleReport.durationSec / 60)}m</span> ·
              Closed: <span className="font-mono-num text-white">{settleReport.tradesClosed}</span> ·
              Net PnL:{' '}
              <span className={`font-mono-num font-bold ${settleReport.netSessionPnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                {settleReport.netSessionPnl >= 0 ? '+' : ''}${settleReport.netSessionPnl.toFixed(2)}
              </span> · Final Equity: <span className="font-mono-num text-white">${settleReport.finalBalance.toLocaleString()}</span>
            </p>
          </div>
          <button onClick={() => setSettleReport(null)} className="p-1.5 rounded-lg bg-[#1a1e26] text-[#9aa5b5] hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Summary KPI Section (Cl) */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 min-[520px]:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="card-tt-subtle p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span className="text-[10px] text-[#6c7689]">{t.totalEquity}</span>
            </div>
            <p className="text-base sm:text-xl font-bold font-mono-num text-white">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-[#6c7689] mt-1 font-mono-num">
              {t.freeBalance}: ${freeBal.toLocaleString()} · {t.usedBalance}: ${usedBal.toLocaleString()}
            </p>
          </div>

          <div className="card-tt-subtle p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className={`w-3.5 h-3.5 ${protectedCredit > 0 ? 'text-[#27cd86]' : 'text-[#6c7689]'}`} />
              <span className="text-[10px] text-[#6c7689]">{t.protectedCredit}</span>
            </div>
            <p className={`text-base sm:text-xl font-bold font-mono-num ${protectedCredit > 0 ? 'text-[#27cd86]' : 'text-[#9aa5b5]'}`}>
              {protectedCredit > 0 ? '+' : ''}${protectedCredit.toFixed(2)}
            </p>
            <p className="text-[10px] text-[#6c7689] mt-1">
              UTC-day rule · 24h: {(data.stats.last24hPnl ?? data.stats.todayPnl) >= 0 ? '+' : ''}$
              {(data.stats.last24hPnl ?? data.stats.todayPnl).toFixed(2)}
            </p>
          </div>

          <div className="card-tt-subtle p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Award className={`w-3.5 h-3.5 ${data.stats.totalPnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`} />
              <span className="text-[10px] text-[#6c7689]">{t.realizedProfit}</span>
            </div>
            <p className={`text-base sm:text-xl font-bold font-mono-num ${data.stats.totalPnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
              {data.stats.totalPnl >= 0 ? '+' : '-'}${Math.abs(data.stats.totalPnl).toFixed(2)}
            </p>
            <p className="text-[10px] text-[#6c7689] mt-1 font-mono-num">
              All-time: {(data.stats.allTimePct ?? 0) >= 0 ? '+' : ''}{(data.stats.allTimePct ?? 0).toFixed(2)}% · WR {data.stats.winRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Active Configuration Status Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="rounded-[10px] border border-[#4b73f5]/25 bg-[#4b73f5]/5 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#6c7689]">
              <Activity className="w-3.5 h-3.5 text-[#27cd86]" />
              <span>{lang === 'fa' ? 'وضعیت موتور' : 'Status'}</span>
            </div>
            <p className={`text-sm font-bold ${isRunning ? 'text-[#27cd86]' : 'text-[#9aa5b5]'}`}>
              {isRunning ? (lang === 'fa' ? 'در حال معامله' : 'Active') : lang === 'fa' ? 'آماده اجرا' : 'Paused'}
            </p>
          </div>

          <div className="rounded-[10px] border border-[#4b73f5]/25 bg-[#4b73f5]/5 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#6c7689]">
              <Wallet className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'سرمایه تخصیصی' : 'Allocated'}</span>
            </div>
            <p className="text-sm font-bold font-mono-num text-[#4b73f5]">
              ${(data.riskProfile?.allocatedAmount ?? Math.round(totalEquity * (data.config.margin_pct / 100))).toLocaleString()} ({data.config.margin_pct}%)
            </p>
          </div>

          <div className="rounded-[10px] border border-[#4b73f5]/25 bg-[#4b73f5]/5 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#6c7689]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#f59f14]" />
              <span>{lang === 'fa' ? 'سطح ریسک' : 'Risk Level'}</span>
            </div>
            <p className="text-sm font-bold text-[#f59f14] capitalize">
              {data.riskProfile?.preset || 'Balanced'} ({data.config.max_leverage}x)
            </p>
          </div>

          <div className="rounded-[10px] border border-[#4b73f5]/25 bg-[#4b73f5]/5 p-3 sm:p-3.5">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#6c7689]">
              <Layers className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'استراتژی فعال' : 'Strategy'}</span>
            </div>
            <p className="text-sm font-bold text-[#4b73f5] truncate">
              {STRAT_LABELS[data.config.strategy_key] ?? data.config.strategy_key}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Dual Analytics Charts (Sl): Hourly Trading Activity + Earn-System Result · 30d */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card-tt p-4 sm:p-5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'فعالیت ساعتی معاملات' : 'Hourly Trading Activity'}</span>
            </h2>
            <span className={`text-xs font-mono-num ${protectedCredit > 0 ? 'text-[#27cd86]' : 'text-[#6c7689]'}`}>
              Protected credit: {protectedCredit > 0 ? '+' : ''}${protectedCredit.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-[#6c7689]">
            Individual hourly outcomes can be positive or negative. They are netted at UTC day close; positive net credits Profit Wallet without debiting principal.
          </p>
          <HourlyBarChartSvg data={data.charts.hourlyPnl} />
        </div>

        <div className="card-tt p-4 sm:p-5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'بازده تجمعی سیستم · ۳۰ روز' : 'Earn-System Result · 30d'}</span>
            </h2>
            <span className="text-xs font-mono-num text-[#27cd86]">
              Total: {data.stats.totalPnl >= 0 ? '+' : '-'}${Math.abs(data.stats.totalPnl).toFixed(2)}
            </span>
          </div>
          <CumulativeAreaSvg
            data={
              data.charts.cumulative30d?.length
                ? data.charts.cumulative30d
                : data.charts.dailyPnl.map((d, i) => ({
                    date: d.bucket,
                    cumulativePnl: data.charts.dailyPnl.slice(0, i + 1).reduce((s, r) => s + Number(r.pnl || 0), 0),
                  }))
            }
          />
        </div>
      </div>

      {/* 4. Trading Activity Results (sc) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${isRunning ? 'animate-pulse bg-[#27cd86]' : 'bg-[#6c7689]'}`} />
            <h2 className="text-sm font-semibold text-white truncate">
              {lang === 'fa' ? 'نتایج فعالیت معاملاتی' : 'Trading Activity Results'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCardModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#262b36] bg-[#0f1218] hover:border-[#4b73f5]/50 text-[11px] font-medium text-white transition"
            >
              <Award className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{t.showTradingCard}</span>
            </button>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 text-[11px] text-[#6c7689] hover:text-white px-2 py-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">{lang === 'fa' ? 'به‌روزرسانی' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 4-Card Sub-KPI Strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            {
              label: lang === 'fa' ? 'موجودی تسویه‌شده حساب' : 'Settled account balance',
              value: `$${freeBal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
              helper: 'Free margin available',
              color: 'text-white',
            },
            {
              label: lang === 'fa' ? 'سرمایه درگیر ترید' : 'Trading capital',
              value: `$${usedBal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
              helper: isRunning ? 'Currently allocated' : 'Ready for deployment',
              color: usedBal > 0 ? 'text-[#4b73f5]' : 'text-[#9aa5b5]',
            },
            {
              label: lang === 'fa' ? 'اعتبار محافظت‌شده امروز' : "Today's protected credit",
              value: `${protectedCredit > 0 ? '+' : ''}$${protectedCredit.toFixed(2)}`,
              helper: 'Positive net credited daily',
              color: protectedCredit > 0 ? 'text-[#27cd86]' : 'text-[#9aa5b5]',
            },
            {
              label: lang === 'fa' ? 'سود محقق‌شده' : 'Realized profit',
              value: `${data.stats.totalPnl >= 0 ? '+' : '-'}$${Math.abs(data.stats.totalPnl).toFixed(2)}`,
              helper: `${data.stats.winRate.toFixed(1)}% win rate · PF ${data.stats.profitFactor.toFixed(2)}`,
              color: data.stats.totalPnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]',
            },
          ].map((k) => (
            <div key={k.label} className="card-tt-subtle p-3 sm:p-4">
              <div className="text-[10px] text-[#6c7689] truncate">{k.label}</div>
              <p className={`mt-1 text-sm sm:text-base font-bold font-mono-num truncate ${k.color}`}>{k.value}</p>
              <p className="mt-1 text-[9px] text-[#6c7689] truncate">{k.helper}</p>
            </div>
          ))}
        </div>

        {/* Market Category Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All markets' },
            { id: 'crypto', label: 'Crypto' },
            { id: 'forex', label: 'Forex' },
            { id: 'metal', label: 'Metals' },
            { id: 'energy', label: 'Energy' },
            { id: 'index', label: 'Indices' },
            { id: 'equity', label: 'Stocks' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setMarketFilter(f.id as typeof marketFilter)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${
                marketFilter === f.id
                  ? 'border-[#4b73f5]/60 bg-[#4b73f5]/15 text-[#4b73f5]'
                  : 'border-[#1c2028] bg-[#11151c] text-[#6c7689] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 5. Open Positions Grid (Xl) with NEXT CYCLE IN countdown & 24-pt Sparklines */}
        <div className="card-tt overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1c2028] flex flex-wrap items-center gap-2">
            <span className="relative flex h-2 w-2">
              {isRunning && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#27cd86] opacity-50" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isRunning ? 'bg-[#27cd86]' : 'bg-[#6c7689]'}`} />
            </span>
            <span className="text-xs font-semibold text-[#d5dce6]">{t.openPositions}</span>

            <span className="ms-auto inline-flex items-center gap-1 font-mono-num text-[10px] text-[#4b73f5]">
              <Clock className="w-3 h-3" />
              <span>NEXT CYCLE IN {mm}:{ss}</span>
            </span>
            <span className="font-mono-num text-[10px] text-[#6c7689]">{filteredOpenTrades.length} active</span>

            {data.openTrades.length > 0 && (
              <button
                onClick={async () => {
                  await apiFetch('/api/trading/positions/reconcile', { method: 'POST' });
                  onRefresh();
                }}
                className="px-2.5 py-1 rounded-md bg-[#1a1e26] hover:bg-[#232833] text-[10px] font-medium text-[#d5dce6] border border-[#262b36]"
              >
                {lang === 'fa' ? 'بررسی TP/SL/Trailing' : 'Reconcile 3-TP / Trail'}
              </button>
            )}
          </div>

          <div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filteredOpenTrades.length === 0 ? (
              <div className="col-span-full flex h-28 flex-col items-center justify-center gap-1 text-center">
                <p className="text-xs font-medium text-white">{lang === 'fa' ? 'پوزیشن بازی وجود ندارد' : 'No open positions'}</p>
                <p className="text-[10px] text-[#6c7689]">
                  {isRunning
                    ? 'AI Agent is scanning non-repainting KBOs v11 closed bars on the scheduled cycle.'
                    : 'Click Start Trading or open a manual setup in the Live Chart tab below.'}
                </p>
              </div>
            ) : (
              filteredOpenTrades.map((p) => {
                const u = Number(p.unrealized_pnl ?? 0);
                const isProfit = u >= 0;
                const roe = p.roe_pct ?? ((u / Math.max(0.01, Number(p.margin_used))) * 100);
                const notional = Number(p.entry_price) * Number(p.remaining_quantity);
                const capUsed = p.capital_pct ?? ((Number(p.margin_used) / Math.max(1, totalEquity)) * 100);

                return (
                  <div key={p.id} className="rounded-xl border border-[#1c2028] bg-[#11151c] p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-white">{p.symbol}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              p.direction === 'LONG'
                                ? 'border-[#27cd86]/35 bg-[#27cd86]/10 text-[#27cd86]'
                                : 'border-[#eb493d]/35 bg-[#eb493d]/10 text-[#eb493d]'
                            }`}
                          >
                            {p.direction} {p.leverage}x
                          </span>
                          {p.risk_free_active === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#27cd86]/15 text-[#27cd86]">
                              {t.riskFreeBadge}
                            </span>
                          )}
                          {p.trailing_active === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#4b73f5]/15 text-[#4b73f5]">
                              {t.trailingBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#6c7689] mt-0.5 truncate">
                          {STRAT_LABELS[p.strategy_key || ''] || p.strategy_key || 'KBOs v11'} · {p.exchange_provider.toUpperCase()} ({p.mode})
                        </p>
                      </div>

                      <div className="text-end shrink-0">
                        <p className={`font-mono-num text-sm font-bold ${isProfit ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(u).toFixed(2)}
                        </p>
                        <p className={`font-mono-num text-[10px] ${isProfit ? 'text-[#27cd86]/80' : 'text-[#eb493d]/80'}`}>
                          {roe >= 0 ? '+' : ''}{roe.toFixed(2)}% ROE
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-[#1c2028] pt-2.5 text-[10px]">
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-[#6c7689]">Entry price</p>
                        <p className="font-mono-num text-white mt-0.5">${p.entry_price}</p>
                      </div>
                      <div>
                        <p className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-[#6c7689]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#27cd86] animate-pulse" />
                          <span>Live mark</span>
                        </p>
                        <p className="font-mono-num text-white mt-0.5">${p.mark_price ?? p.entry_price}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-[#6c7689]">Margin / size</p>
                        <p className="font-mono-num text-white mt-0.5">
                          ${Number(p.margin_used).toFixed(0)} / ${notional.toFixed(0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-[#6c7689]">Capital used</p>
                        <p className="font-mono-num text-white mt-0.5">{capUsed.toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Sparkline & Funding / Quote Status */}
                    <div className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-lg border border-[#1c2028] bg-[#0a0d13] px-2.5 py-1.5">
                      <SparklineSvg values={p.sparkline ?? [Number(p.entry_price), Number(p.mark_price ?? p.entry_price)]} isProfit={isProfit} />
                      <div className="text-end text-[9px] font-mono-num">
                        <p className="text-[#6c7689] uppercase">Funding / 8h</p>
                        <p className="text-[#27cd86]">REAL QUOTE</p>
                        <p className="text-[#9aa5b5]">{(p.funding_usd ?? 0).toFixed(3)} USDT</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] pt-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#9aa5b5] font-mono-num">
                        <span>SL <span className="text-[#eb493d]">${p.current_stop_loss}</span></span>
                        <span>TP1 <span className={p.tp1_hit ? 'text-[#27cd86] font-bold' : 'text-white'}>${p.tp1}</span></span>
                        {p.tp2 && <span>TP2 <span className={p.tp2_hit ? 'text-[#27cd86] font-bold' : 'text-white'}>${p.tp2}</span></span>}
                        {p.tp3 && <span>TP3 <span className="text-white">${p.tp3}</span></span>}
                        <span>Liq. ${p.liq_price_est ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingPos(p);
                            setEditSl(p.current_stop_loss);
                            setEditTp1(p.tp1);
                            setEditTp2(p.tp2 || '');
                            setEditTp3(p.tp3 || '');
                          }}
                          className="p-1.5 rounded-md bg-[#1a1e26] hover:bg-[#262b36] text-[#9aa5b5] hover:text-white"
                          title="Edit SL/TP"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/trading/positions/${p.id}/close`, { method: 'POST' });
                            onRefresh();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#eb493d]/15 hover:bg-[#eb493d] text-[#eb493d] hover:text-white font-semibold transition"
                        >
                          <XCircle className="w-3 h-3" /> Close
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 6. Closed Trades / Live KBOs Chart & Ticket / Pending Orders / 7d Summary */}
        <div className="card-tt overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1c2028] flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: 'closed', label: `${t.closedTrades} (${filteredClosedTrades.length})` },
              { id: 'chart', label: lang === 'fa' ? 'چارت زنده KBOs v11 و ثبت دستی' : 'Live KBOs v11 Chart & Order Ticket' },
              { id: 'pending', label: `${lang === 'fa' ? 'سفارشات لیمیت' : 'Pending Orders'} (${data.pendingOrders.length})` },
              { id: 'weekly', label: lang === 'fa' ? 'عملکرد ۷ روزه' : '7-Day Breakdown' },
            ].map((tb) => (
              <button
                key={tb.id}
                onClick={() => setActiveSubTab(tb.id as typeof activeSubTab)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  activeSubTab === tb.id ? 'bg-[#4b73f5]/15 text-[#4b73f5] border border-[#4b73f5]/35' : 'text-[#6c7689] hover:text-white'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {activeSubTab === 'closed' && (
            <div className="p-3 space-y-1.5 max-h-[460px] overflow-y-auto">
              <div className="hidden xl:grid grid-cols-[0.8fr_1.2fr_0.7fr_0.65fr] gap-3 px-3 py-1 text-[9px] uppercase tracking-wider text-[#6c7689]">
                <span>Trade</span>
                <span>Execution & position</span>
                <span className="text-end">Exit & Leverage</span>
                <span className="text-end">Account impact</span>
              </div>
              {filteredClosedTrades.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#6c7689]">
                  {lang === 'fa' ? 'هنوز معامله بسته‌شده‌ای ثبت نشده است.' : 'No closed trades yet. Completed trades will appear here.'}
                </div>
              ) : (
                filteredClosedTrades.map((ct) => {
                  const pnl = Number(ct.realized_pnl);
                  return (
                    <div
                      key={ct.id}
                      className="rounded-lg border border-[#1c2028] bg-[#11151c]/70 px-3 py-2.5 grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr_0.7fr_0.65fr] gap-2 items-center text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{ct.symbol}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            ct.direction === 'LONG' ? 'bg-[#27cd86]/15 text-[#27cd86]' : 'bg-[#eb493d]/15 text-[#eb493d]'
                          }`}
                        >
                          {ct.direction}
                        </span>
                      </div>
                      <div className="font-mono-num text-[11px] text-[#9aa5b5]">
                        Entry ${ct.entry_price} → Exit ${ct.exit_price} · <span className="text-white">{ct.exit_reason}</span>
                      </div>
                      <div className="xl:text-end font-mono-num text-[11px] text-[#6c7689]">
                        {ct.leverage}x · {ct.closed_at.slice(0, 16).replace('T', ' ')}
                      </div>
                      <div className={`xl:text-end font-mono-num font-bold ${pnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                        {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeSubTab === 'chart' && (
            <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <SymbolPicker
                      lang={lang}
                      value={symbol}
                      markets={markets}
                      provider={data.activeExchange.provider}
                      onChange={(sym) => {
                        setSymbol(sym);
                        setSlInput('');
                      }}
                      compact
                    />
                    {(['1m', '5m', '15m', '30m', '1h', '4h'] as Timeframe[]).map((x) => (
                      <button
                        key={x}
                        onClick={() => setTf(x)}
                        className={`px-2 py-1 rounded-md font-medium ${tf === x ? 'bg-[#4b73f5] text-white' : 'bg-[#11151c] text-[#6c7689]'}`}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  {overview && (
                    <div className="flex items-center gap-3 font-mono-num">
                      <span className="font-bold text-white">${overview.market24h.lastPrice}</span>
                      <span className={Number(overview.market24h.changePct24h) >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}>
                        {Number(overview.market24h.changePct24h) >= 0 ? '+' : ''}{overview.market24h.changePct24h}%
                      </span>
                      <span className="text-[11px] text-[#6c7689]">RSI {overview.indicators.rsi14}</span>
                    </div>
                  )}
                </div>

                <CandlestickChart
                  candles={overview?.candles ?? []}
                  levels={chartLevels}
                  overlays={chartOverlays}
                  kbosOverlays={overview?.kbosOverlays}
                  height={440}
                />
              </div>

              {/* Order Book + 8-Ch Mixer + Quick Order Ticket */}
              <div className="xl:col-span-4 space-y-3 text-xs">
                {overview && (
                  <div className="rounded-xl border border-[#1c2028] bg-[#11151c] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-[#27cd86]" /> 8-Channel Mixer
                      </span>
                      <span className="font-mono-num font-bold text-[#27cd86]">
                        {overview.mixer.confidence}% {overview.mixer.direction}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      {overview.mixer.channels.map((ch) => (
                        <div key={ch.key} className="flex justify-between px-2 py-1 rounded bg-[#080a0e]">
                          <span className="text-[#6c7689] truncate">{ch.label}</span>
                          <span className={`font-mono-num ${ch.score > 0 ? 'text-[#27cd86]' : ch.score < 0 ? 'text-[#eb493d]' : 'text-[#6c7689]'}`}>
                            {ch.score > 0 ? '+' : ''}{ch.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={placeManualOrder} className="rounded-xl border border-[#1c2028] bg-[#11151c] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{lang === 'fa' ? 'ثبت سریع معامله' : 'Manual 3-TP Ticket'}</span>
                    <select
                      value={marginMode}
                      onChange={(e) => setMarginMode(e.target.value as 'ISOLATED' | 'CROSS')}
                      className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-0.5 text-[11px]"
                    >
                      <option value="ISOLATED">ISOLATED</option>
                      <option value="CROSS">CROSS</option>
                    </select>
                  </div>
                  {orderMsg && <div className="p-2 rounded bg-[#4b73f5]/15 text-[#9eb7ff] text-[11px]">{orderMsg}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSide('LONG')}
                      className={`py-2 rounded-lg font-bold inline-flex items-center justify-center gap-1 ${
                        side === 'LONG' ? 'bg-[#27cd86] text-[#080a0e]' : 'bg-[#080a0e] text-[#6c7689]'
                      }`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" /> LONG
                    </button>
                    <button
                      type="button"
                      onClick={() => setSide('SHORT')}
                      className={`py-2 rounded-lg font-bold inline-flex items-center justify-center gap-1 ${
                        side === 'SHORT' ? 'bg-[#eb493d] text-white' : 'bg-[#080a0e] text-[#6c7689]'
                      }`}
                    >
                      <ArrowDownRight className="w-3.5 h-3.5" /> SHORT
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')} className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5">
                      <option value="MARKET">MARKET</option>
                      <option value="LIMIT">LIMIT</option>
                    </select>
                    <input type="number" min={1} max={100} value={lev} onChange={(e) => setLev(Number(e.target.value))} className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num" placeholder="Lev" />
                    <input
                      value={orderType === 'LIMIT' ? limitPrice : overview?.market24h.lastPrice ?? ''}
                      disabled={orderType === 'MARKET'}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num"
                      placeholder="Price"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input value={slInput} onChange={(e) => setSlInput(e.target.value)} placeholder="Stop Loss" required className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num" />
                    <input value={tp1Input} onChange={(e) => setTp1Input(e.target.value)} placeholder="TP1" required className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num" />
                    <input value={tp2Input} onChange={(e) => setTp2Input(e.target.value)} placeholder="TP2" className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num" />
                    <input value={tp3Input} onChange={(e) => setTp3Input(e.target.value)} placeholder="TP3" className="bg-[#080a0e] border border-[#262b36] rounded px-2 py-1.5 font-mono-num" />
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-lg bg-[#4b73f5] hover:bg-[#3d63e0] text-white font-bold">
                    Execute {orderType} {side}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeSubTab === 'pending' && (
            <div className="p-4 text-xs">
              {data.pendingOrders.length === 0 ? (
                <div className="py-8 text-center text-[#6c7689]">No pending limit orders.</div>
              ) : (
                <div className="space-y-2">
                  {data.pendingOrders.map((po) => (
                    <div key={po.id} className="flex items-center justify-between p-3 rounded-lg bg-[#11151c] border border-[#1c2028]">
                      <span>
                        <strong className="text-white">{po.symbol}</strong> · {po.direction} {po.leverage}x @ <span className="font-mono-num">${po.price}</span>
                      </span>
                      <button
                        onClick={async () => {
                          await apiFetch(`/api/trading/pending/${po.id}`, { method: 'DELETE' });
                          onRefresh();
                        }}
                        className="px-2.5 py-1 rounded bg-[#eb493d]/15 text-[#eb493d] font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'weekly' && (
            <div className="p-4 text-xs">
              {data.charts.weeklyResults.length === 0 ? (
                <div className="py-8 text-center text-[#6c7689]">No closed trades in the last 7 days yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {data.charts.weeklyResults.map((w) => (
                    <div key={w.day} className="p-3 rounded-lg bg-[#11151c] border border-[#1c2028] flex justify-between items-center">
                      <div>
                        <div className="font-mono-num font-bold text-white">{w.day}</div>
                        <div className="text-[10px] text-[#6c7689]">{w.count} trades · {w.wins} wins</div>
                      </div>
                      <div className={`font-mono-num font-bold ${w.pnl >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                        {w.pnl >= 0 ? '+' : ''}${w.pnl.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Modals */}
      <WeeklyTradingCardModal
        lang={lang}
        metrics={weeklyCardMetrics}
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
      />

      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          availableBalance={freeBal}
          onClose={() => setWizardOpen(false)}
          onCompleted={onRefresh}
        />
      )}

      {/* Add Balance / Wallet Top-Up Modal */}
      {topupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-[#0f1218] border border-[#1c2028] rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#27cd86]" />
                <span>{t.addBalance} ({isPaper ? 'Demo Paper' : 'Wallet Ledger'})</span>
              </h3>
              <button onClick={() => setTopupModalOpen(false)} className="p-1.5 rounded-lg bg-[#1a1e26] text-[#9aa5b5]">
                <X className="w-4 h-4" />
              </button>
            </div>
            {topupMsg && <div className="p-2.5 rounded-lg bg-[#27cd86]/15 border border-[#27cd86]/35 text-[#27cd86] text-xs">{topupMsg}</div>}
            <form onSubmit={handleTopup} className="space-y-3 text-xs">
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 5000, 10000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-2 rounded-lg border font-mono-num font-bold ${
                      topupAmount === amt ? 'border-[#4b73f5] bg-[#4b73f5]/15 text-white' : 'border-[#1c2028] bg-[#11151c] text-[#9aa5b5]'
                    }`}
                  >
                    +${amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={1000000}
                value={topupAmount}
                onChange={(e) => setTopupAmount(Number(e.target.value))}
                className="w-full bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2.5 font-mono-num text-sm font-bold text-white"
              />
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-bold">
                {lang === 'fa' ? 'افزایش فوری موجودی' : 'Credit Paper Balance Instantly'}
              </button>
            </form>
            {data.walletLedger && data.walletLedger.length > 0 && (
              <div className="pt-2 border-t border-[#1c2028] space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
                <p className="text-[#6c7689] font-semibold">Recent Ledger Events</p>
                {data.walletLedger.slice(0, 6).map((w) => (
                  <div key={w.id} className="flex justify-between font-mono-num text-[#9aa5b5]">
                    <span>{w.event_type} · {w.note}</span>
                    <span className={w.amount_usd >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}>
                      {w.amount_usd >= 0 ? '+' : ''}${w.amount_usd.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stop Trading Confirmation & Settlement Choice Modal */}
      {stopConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-[#0f1218] border border-[#1c2028] rounded-2xl w-full max-w-md p-5 space-y-4 text-xs">
            <h3 className="font-bold text-sm text-white">
              {lang === 'fa' ? 'توقف ربات هوش مصنوعی و تسویه' : 'Stop AI Agent Trading'}
            </h3>
            <p className="text-[#9aa5b5] leading-relaxed">
              {lang === 'fa'
                ? 'آیا می‌خواهید تنها ربات متوقف شود (پوزیشن‌های باز با استاپ فعلی بمانند) یا همه پوزیشن‌های باز نیز به قیمت بازار بسته و تسویه شوند؟'
                : 'Choose whether to pause new AI entries while keeping open trades protected, or settle all open positions at current market mark.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => void handleStopConfirmed(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#1a1e26] hover:bg-[#232833] text-white font-semibold border border-[#262b36]"
              >
                {lang === 'fa' ? 'توقف اسکن (حفظ پوزیشن‌ها)' : 'Stop Agent Only'}
              </button>
              <button
                onClick={() => void handleStopConfirmed(true)}
                className="flex-1 py-2.5 rounded-xl bg-[#eb493d] hover:bg-[#d93d32] text-white font-bold"
              >
                {lang === 'fa' ? 'توقف و تسویه کل پوزیشن‌ها' : 'Stop & Settle Open Trades'}
              </button>
            </div>
            <button onClick={() => setStopConfirmOpen(false)} className="w-full py-1.5 text-[#6c7689] hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit SL/TP Modal */}
      {editingPos && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <form onSubmit={saveEditPos} className="bg-[#0f1218] border border-[#1c2028] rounded-2xl p-5 w-full max-w-md space-y-3 text-xs">
            <h3 className="font-bold text-sm text-white">Edit SL / TP — {editingPos.symbol}</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[#6c7689] block mb-1">Stop Loss</label>
                <input value={editSl} onChange={(e) => setEditSl(e.target.value)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2 font-mono-num" />
              </div>
              <div>
                <label className="text-[#6c7689] block mb-1">TP1</label>
                <input value={editTp1} onChange={(e) => setEditTp1(e.target.value)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2 font-mono-num" />
              </div>
              <div>
                <label className="text-[#6c7689] block mb-1">TP2</label>
                <input value={editTp2} onChange={(e) => setEditTp2(e.target.value)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2 font-mono-num" />
              </div>
              <div>
                <label className="text-[#6c7689] block mb-1">TP3</label>
                <input value={editTp3} onChange={(e) => setEditTp3(e.target.value)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2 font-mono-num" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setEditingPos(null)} className="px-4 py-2 rounded-lg bg-[#1a1e26]">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#27cd86] text-[#080a0e] font-bold">Save SL/TP</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
