import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  BrainCircuit,
  CandlestickChart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Globe,
  KeyRound,
  Layers,
  LayoutGrid,
  PauseCircle,
  PlusCircle,
  Power,
  Radar,
  RefreshCw,
  Rocket,
  RotateCcw,
  Scale,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  WandSparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Timeframe } from '@dollarino/core';
import { apiFetch, setStoredToken } from '../lib/api';
import { coinDisplayName, formatTomanEq, formatUsdPrice } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo, DashboardPayload, NavTab, OpenTradeRow } from '../lib/types';
import { DollarinoBrandMark, ModeGraphicAI, ModeGraphicCodex, ModeGraphicTelegram } from '../components/BrandGraphics';
import { CoinIcon } from '../components/CoinIcon';
import { ConfirmTradeSheet, type PendingTradeConfirmation } from '../components/ConfirmTradeSheet';
import { AnimatedNumber, AreaChart, ConsensusGauge, LiveDot, Sparkline } from '../components/DollarinoViz';
import { SetupWizardModal } from '../components/SetupWizardModal';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';

const RISK_PRESETS = [
  {
    id: 'conservative' as const,
    titleFa: 'کم‌ریسک (محافظ سرمایه)',
    titleEn: 'Conservative',
    descFa: '۲٪ مارجین · اهرم ۳x · سقف ضرر روزانه ۳٪',
    descEn: '2% margin · 3x lev · 3% daily cap',
    marginPct: 2,
    maxLev: 3,
    dailyLoss: 3,
    maxOpen: 4,
    color: '#10d9a3',
  },
  {
    id: 'balanced' as const,
    titleFa: 'متعادل (پیشنهاد دلارینو)',
    titleEn: 'Balanced (Recommended)',
    descFa: '۵٪ مارجین · اهرم ۱۰x · تا ۸ ارز همزمان',
    descEn: '5% margin · 10x lev · up to 8 coins',
    marginPct: 5,
    maxLev: 10,
    dailyLoss: 6,
    maxOpen: 8,
    color: '#2b74ff',
  },
  {
    id: 'aggressive' as const,
    titleFa: 'پُرقدرت (آزادی کامل تریدر)',
    titleEn: 'Aggressive Pro',
    descFa: '۱۰٪ مارجین · اهرم ۲۰x · تا ۲۰ ارز همزمان',
    descEn: '10% margin · 20x lev · up to 20 coins',
    marginPct: 10,
    maxLev: 20,
    dailyLoss: 12,
    maxOpen: 20,
    color: '#e8c15a',
  },
];

const ALL_STRATEGIES = [
  { key: 'dollarino_v01', labelFa: 'دُرنا V1 (منتخب دلارینو)', labelEn: 'Dorna V1 Select' },
  { key: 'ai_autonomous_agent', labelFa: 'هوش مصنوعی دُرّبین (Multi-AI)', labelEn: 'Dorrbin Multi-AI' },
  { key: 'kbos_v11', labelFa: 'KBOS Super v11', labelEn: 'KBOS Super v11' },
  { key: 'sp2l', labelFa: 'شکار نقدینگی (SP2L)', labelEn: 'Liquidity Sweep (SP2L)' },
  { key: 'ema_trend_pullback', labelFa: 'مومنتوم روند EMA', labelEn: 'EMA Momentum Pullback' },
  { key: 'signal_mixer', labelFa: 'میکسر ۸ کاناله (Quant + AI)', labelEn: '8-Ch Signal Mixer' },
] as const;

export function OverviewPage({
  lang,
  uiMode = 'simple',
  onToggleUiMode,
  user,
  data,
  markets,
  onNavigate,
  onSelectTerminalSymbol,
  onRefresh,
  onUpgradeUser,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  onToggleUiMode?: (m: 'simple' | 'pro') => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onNavigate: (tab: NavTab) => void;
  onSelectTerminalSymbol: (sym: string) => void;
  onRefresh: () => Promise<void>;
  onUpgradeUser: (u: AuthUserInfo) => void;
}) {
  const isFa = lang === 'fa';
  const isRunning = data.config.bot_state.startsWith('RUNNING');
  const isGuestDemo = user.email.endsWith('@dollarino.app');

  const [hideBal, setHideBal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(2500);
  const [saveGuestOpen, setSaveGuestOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ email: '', username: '', password: '' });
  const [saveErr, setSaveErr] = useState('');

  // Inline Edit TP/SL state
  const [editPos, setEditPos] = useState<OpenTradeRow | null>(null);
  const [editForm, setEditForm] = useState({ stopLoss: '', tp1: '', tp2: '', tp3: '' });

  // Simple Mode Guided 4-Step Launcher (TimeTrade parity)
  const [watchlistTab, setWatchlistTab] = useState<'popular' | 'favs' | 'gainers' | 'active'>('popular');
  const [homePanel, setHomePanel] = useState<'bot' | 'trade' | 'positions'>('bot');
  const [simpleWizTab, setSimpleWizTab] = useState<'bot' | 'exchange'>('bot');
  const [simpleStep, setSimpleStep] = useState(0);
  const [simpleCapital, setSimpleCapital] = useState<number>(Math.max(10, Math.round(Number(data.balance.free || 10000) * 0.25)));
  const [simpleRiskPreset, setSimpleRiskPreset] = useState<'low' | 'medium' | 'high'>('medium');
  const [simpleStrategy, setSimpleStrategy] = useState<
    'dollarino_v01' | 'ai_autonomous_agent' | 'kbos_v11' | 'sp2l' | 'ema_trend_pullback' | 'signal_mixer'
  >('dollarino_v01');
  const [simpleExProvider, setSimpleExProvider] = useState<'toobit' | 'kcex'>('toobit');
  const [simpleExKey, setSimpleExKey] = useState('');
  const [simpleExSecret, setSimpleExSecret] = useState('');
  const [simpleExProxy, setSimpleExProxy] = useState('');
  const [simpleExSession, setSimpleExSession] = useState('');
  const [simpleTradesTab, setSimpleTradesTab] = useState<'open' | 'closed'>('open');

  // Simple Mode (10-to-80yo Effortless 3-Tap Trading)
  const [simpleCoin, setSimpleCoin] = useState('BTCUSDT');
  const [simpleSide, setSimpleSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [simpleComfort, setSimpleComfort] = useState<'safe' | 'balanced' | 'fast'>('safe');
  const [simpleAmount, setSimpleAmount] = useState(50);
  const [simpleConfirmOrder, setSimpleConfirmOrder] = useState<PendingTradeConfirmation | null>(null);

  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total || freeBal + usedBal);
  const unrealized = data.openTrades.reduce((s, t) => s + Number(t.unrealized_pnl || 0), 0);
  const todayPnl = Number(data.stats.todayPnl ?? data.stats.totalPnl ?? 0) + unrealized;
  const activeStrategy = data.config.strategy_key || 'dollarino_v01';
  const scanScope = data.config.scan_scope || 'ALL_MARKET';

  const currentPresetId = useMemo(() => {
    try {
      const rp = data.config.risk_profile_json ? (JSON.parse(data.config.risk_profile_json) as { preset?: string }) : {};
      if (rp.preset === 'conservative' || rp.preset === 'balanced' || rp.preset === 'aggressive') return rp.preset;
    } catch {
      /* ignore */
    }
    if (data.config.margin_pct <= 3) return 'conservative';
    if (data.config.margin_pct >= 8) return 'aggressive';
    return 'balanced';
  }, [data.config.risk_profile_json, data.config.margin_pct]);

  const equitySeries = useMemo(() => {
    const raw = data.charts.equityCurve || [];
    if (raw.length >= 4) return raw.slice(-24).map((p) => Number(p.equity || 0));
    const base = Math.max(1000, totalEq);
    return [base * 0.94, base * 0.955, base * 0.95, base * 0.97, base * 0.985, base * 0.992, base];
  }, [data.charts.equityCurve, totalEq]);

  const btc = markets.find((m) => m.symbol === 'BTCUSDT');
  const longSigCount = data.recentSignals.filter((s) => String(s.direction).toUpperCase().includes('LONG')).length;
  const consensusPct = data.recentSignals.length ? Math.round((longSigCount / data.recentSignals.length) * 100) : 64;

  const toastMsg = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setNotice(null);
    } else {
      setNotice(msg);
      setErrorMsg(null);
    }
    setTimeout(() => {
      setNotice(null);
      setErrorMsg(null);
    }, 5000);
  };

  const patchConfig = async (payload: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ config?: unknown; error?: string }>('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.error) toastMsg(res.error, true);
      else if (okMsg) toastMsg(okMsg);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleStartStop = async () => {
    if (isRunning) {
      setStopConfirmOpen(true);
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({ scanScope }),
      });
      toastMsg(isFa ? 'ربات با موفقیت روشن شد و اسکن زنده آغاز گردید' : 'Bot started — scanning markets');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Start failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmStop = async (settleOpen: boolean) => {
    setStopConfirmOpen(false);
    setBusy(true);
    try {
      const res = await apiFetch<{ tradesClosed?: number; settlement?: { tradesClosed?: number; netSessionPnl?: number } }>(
        '/api/trading/bot/stop',
        { method: 'POST', body: JSON.stringify({ settleOpen }) }
      );
      const closedCnt = res.settlement?.tradesClosed ?? res.tradesClosed ?? 0;
      toastMsg(
        settleOpen
          ? isFa
            ? `ربات متوقف شد · ${closedCnt} معامله تسویه گردید`
            : `Stopped · ${closedCnt} trades settled`
          : isFa
            ? 'ربات متوقف شد'
            : 'Bot paused'
      );
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Stop failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (tradeId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/positions/${tradeId}/close`, { method: 'POST' });
      toastMsg(isFa ? 'معامله بسته و سود/زیان تسویه شد' : 'Position closed');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
    } finally {
      setBusy(false);
    }
  };

  const cancelPendingOrder = async (orderId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/pending/${orderId}`, { method: 'DELETE' });
      toastMsg(isFa ? 'سفارش لیمیت لغو شد' : 'Pending order canceled');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Cancel failed', true);
    } finally {
      setBusy(false);
    }
  };

  const reconcilePositions = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/positions/reconcile', { method: 'POST' });
      toastMsg(isFa ? 'همگام‌سازی پوزیشن‌ها با صرافی انجام شد' : 'Positions reconciled');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reconcile failed', true);
    } finally {
      setBusy(false);
    }
  };

  const resetDemoWallet = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/wallet/reset', { method: 'POST' });
      toastMsg(isFa ? 'حساب دمو به $۱۰,۰۰۰ بازنشانی شد' : 'Paper balance reset to $10,000');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reset failed', true);
    } finally {
      setBusy(false);
    }
  };

  const saveEditTpSl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPos) return;
    setBusy(true);
    try {
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
      toastMsg(isFa ? 'حد ضرر و تارگت‌های پوزیشن بروزرسانی شد' : 'Position TP/SL updated');
      await onRefresh();
    } catch (err) {
      toastMsg(err instanceof Error ? err.message : 'TP/SL update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ balanceAfter: number }>('/api/trading/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amountUsd: topupAmount }),
      });
      toastMsg(isFa ? `موجودی دمو: $${res.balanceAfter.toLocaleString()}` : `New Balance: $${res.balanceAfter.toLocaleString()}`);
      setTopupOpen(false);
      await onRefresh();
    } catch (err) {
      toastMsg(err instanceof Error ? err.message : 'Topup failed', true);
    }
  };

  const handleSaveGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr('');
    try {
      const res = await apiFetch<{ token: string; user: AuthUserInfo }>('/api/auth/upgrade-demo', {
        method: 'POST',
        body: JSON.stringify(saveForm),
      });
      setStoredToken(res.token);
      onUpgradeUser(res.user);
      setSaveGuestOpen(false);
      toastMsg(isFa ? 'حساب کاربری با ایمیل شخصی شما ثبت دائمی شد' : 'Account saved permanently');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error');
    }
  };

  const SIMPLE_COINS = [
    { symbol: 'BTCUSDT', fa: 'بیت‌کوین', en: 'Bitcoin' },
    { symbol: 'ETHUSDT', fa: 'اتریوم', en: 'Ethereum' },
    { symbol: 'SOLUSDT', fa: 'سولانا', en: 'Solana' },
    { symbol: 'BNBUSDT', fa: 'بایننس کوین', en: 'BNB' },
    { symbol: 'TONUSDT', fa: 'تون‌کوین', en: 'Toncoin' },
    { symbol: 'DOGEUSDT', fa: 'دوج‌کوین', en: 'Dogecoin' },
  ];

  const simpleLevMap = { safe: 3, balanced: 5, fast: 10 } as const;

  const prepareSimpleTrade = () => {
    tgHaptic('medium');
    const isSpot = data.config.market_type === 'SPOT';
    const effectiveSimpleSide = isSpot ? 'LONG' : simpleSide;
    const mkt = markets.find((m) => m.symbol === simpleCoin);
    const px = Number(mkt?.lastPrice || 65000);
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    const isLong = effectiveSimpleSide === 'LONG';
    const slDist = simpleComfort === 'safe' ? 0.025 : simpleComfort === 'balanced' ? 0.02 : 0.015;
    const tpDist = simpleComfort === 'safe' ? 0.035 : simpleComfort === 'balanced' ? 0.03 : 0.025;
    setSimpleConfirmOrder({
      symbol: simpleCoin,
      direction: effectiveSimpleSide,
      orderType: 'MARKET',
      marketType: isSpot ? 'SPOT' : 'FUTURES',
      entryPrice: px.toFixed(dec),
      leverage: isSpot ? 1 : simpleLevMap[simpleComfort],
      amountUsd: simpleAmount,
      stopLoss: (isLong ? px * (1 - slDist) : px * (1 + slDist)).toFixed(dec),
      tp1: (isLong ? px * (1 + tpDist) : px * (1 - tpDist)).toFixed(dec),
      tp2: (isLong ? px * (1 + tpDist * 1.8) : px * (1 - tpDist * 1.8)).toFixed(dec),
      tp3: (isLong ? px * (1 + tpDist * 2.6) : px * (1 - tpDist * 2.6)).toFixed(dec),
      tradingMode: data.config.trading_mode,
    });
  };

  const confirmSimpleTrade = async () => {
    if (!simpleConfirmOrder) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol: simpleConfirmOrder.symbol,
          direction: simpleConfirmOrder.direction,
          orderType: 'MARKET',
          marketType: simpleConfirmOrder.marketType || data.config.market_type || 'FUTURES',
          leverage: simpleConfirmOrder.leverage,
          marginMode: 'ISOLATED',
          marginPct: Math.max(1, Math.min(25, Math.round(((simpleConfirmOrder.amountUsd ?? simpleAmount) / Math.max(freeBal, 100)) * 100))),
          stopLoss: simpleConfirmOrder.stopLoss,
          tp1: simpleConfirmOrder.tp1,
          tp2: simpleConfirmOrder.tp2,
          tp3: simpleConfirmOrder.tp3,
        }),
      });
      setSimpleConfirmOrder(null);
      if (!res.ok) {
        tgNotifyHaptic('error');
        toastMsg(res.error || 'Rejected', true);
      } else {
        tgNotifyHaptic('success');
        toastMsg(isFa ? 'معامله شما با سپر محافظت خودکار باز شد' : 'Trade opened safely with auto-protection');
        await onRefresh();
      }
    } catch (e) {
      setSimpleConfirmOrder(null);
      tgNotifyHaptic('error');
      toastMsg(e instanceof Error ? e.message : 'Trade failed', true);
    } finally {
      setBusy(false);
    }
  };

  const renderSharedModals = () => (
    <>
      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          availableBalance={freeBal}
          onClose={() => setWizardOpen(false)}
          onCompleted={onRefresh}
        />
      )}

      <ConfirmTradeSheet
        open={Boolean(simpleConfirmOrder)}
        lang={lang}
        order={simpleConfirmOrder}
        busy={busy}
        onConfirm={confirmSimpleTrade}
        onCancel={() => setSimpleConfirmOrder(null)}
      />

      {editPos && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditPos(null)}>
          <form onSubmit={saveEditTpSl} className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main">
                {isFa ? `ویرایش TP/SL · ${editPos.symbol}` : `Edit TP/SL · ${editPos.symbol}`}
              </h3>
              <button type="button" onClick={() => setEditPos(null)}><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-dim block mb-1">Stop Loss</label>
              <input value={editForm.stopLoss} onChange={(e) => setEditForm((f) => ({ ...f, stopLoss: e.target.value }))} className="field font-num" required />
            </div>
            <div>
              <label className="text-dim block mb-1">TP 1</label>
              <input value={editForm.tp1} onChange={(e) => setEditForm((f) => ({ ...f, tp1: e.target.value }))} className="field font-num" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-dim block mb-1">TP 2</label>
                <input value={editForm.tp2} onChange={(e) => setEditForm((f) => ({ ...f, tp2: e.target.value }))} className="field font-num" />
              </div>
              <div>
                <label className="text-dim block mb-1">TP 3</label>
                <input value={editForm.tp3} onChange={(e) => setEditForm((f) => ({ ...f, tp3: e.target.value }))} className="field font-num" />
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-gold w-full py-3 rounded-xl font-black">
              {isFa ? 'ذخیره تغییرات TP/SL' : 'Save TP/SL'}
            </button>
          </form>
        </div>
      )}

      {stopConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setStopConfirmOpen(false)}>
          <div className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <Flame className="w-5 h-5 text-flame" />
              <span>{isFa ? 'توقف ربات' : 'Stop Bot'}</span>
            </h3>
            <p className="text-xs text-dim leading-relaxed">
              {isFa
                ? 'آیا معاملات باز فعلی با حد ضرر خودشان ادامه پیدا کنند یا همین الان همگی بسته و تسویه شوند؟'
                : 'Pause scanning only or close all open positions now?'}
            </p>
            <div className="space-y-2">
              <button type="button" onClick={() => void handleConfirmStop(false)} className="btn-gold w-full py-3 rounded-xl text-xs">
                {isFa ? 'توقف اسکن جدید (بازها بمانند)' : 'Pause Bot Only'}
              </button>
              {data.openTrades.length > 0 && (
                <button type="button" onClick={() => void handleConfirmStop(true)} className="w-full py-3 rounded-xl bg-rose-500 text-white text-xs font-black">
                  {isFa ? 'توقف و بستن همه معاملات باز' : 'Stop & Close Open Positions'}
                </button>
              )}
              <button type="button" onClick={() => setStopConfirmOpen(false)} className="btn-ghost w-full py-2.5 rounded-xl text-xs font-bold">
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {topupOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setTopupOpen(false)}>
          <form onSubmit={handleTopup} className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main">{isFa ? 'افزایش موجودی دمو' : 'Add Paper Credit'}</h3>
              <button type="button" onClick={() => setTopupOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input type="number" min={100} max={1000000} value={topupAmount} onChange={(e) => setTopupAmount(Number(e.target.value))} className="field font-num font-bold text-lg" />
            <div className="flex gap-2">
              {[1000, 2500, 10000].map((v) => (
                <button key={v} type="button" onClick={() => setTopupAmount(v)} className="flex-1 py-2 rounded-xl btn-ghost text-xs font-bold">
                  +${v.toLocaleString()}
                </button>
              ))}
            </div>
            <button type="submit" className="btn-emerald w-full py-3 rounded-xl text-xs">
              {isFa ? 'افزودن اعتبار رایگان' : 'Add Paper Credit'}
            </button>
          </form>
        </div>
      )}

      {saveGuestOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setSaveGuestOpen(false)}>
          <form onSubmit={handleSaveGuest} className="pop-in panel rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main">{isFa ? 'ذخیره دائمی حساب' : 'Save Account'}</h3>
              <button type="button" onClick={() => setSaveGuestOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <input
              type="email"
              required
              value={saveForm.email}
              onChange={(e) => setSaveForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={isFa ? 'ایمیل شخصی شما' : 'Your email'}
              className="field text-xs"
            />
            <input
              type="text"
              value={saveForm.username}
              onChange={(e) => setSaveForm((f) => ({ ...f, username: e.target.value }))}
              placeholder={isFa ? 'نام نمایشی (اختیاری)' : 'Display name'}
              className="field text-xs"
            />
            <input
              type="password"
              required
              minLength={6}
              value={saveForm.password}
              onChange={(e) => setSaveForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={isFa ? 'رمز عبور (حداقل ۶ حرف)' : 'Password (min 6 chars)'}
              className="field text-xs"
            />
            {saveErr && <p className="text-xs text-loss font-bold">{saveErr}</p>}
            <button type="submit" className="btn-gold w-full py-3 rounded-xl text-xs">
              {isFa ? 'ثبت و ذخیره حساب' : 'Save Permanently'}
            </button>
          </form>
        </div>
      )}
    </>
  );

  if (uiMode === 'simple') {
    const selectedCoinInfo = SIMPLE_COINS.find((c) => c.symbol === simpleCoin) ?? SIMPLE_COINS[0]!;
    const selectedMkt = markets.find((m) => m.symbol === simpleCoin);
    const livePx = Number(selectedMkt?.lastPrice || 0);
    const ch24 = Number(selectedMkt?.changePct24h || 0);

    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        {isGuestDemo && (
          <div className="panel rounded-3xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Sparkles className="w-4 h-4 shrink-0 text-[#F59E0B]" />
              <span className="text-main font-bold">
                {isFa
                  ? 'حساب دمو رایگان ($۱۰,۰۰۰) فعال است. برای ذخیره دائمی حساب خود، ایمیل ثبت کنید.'
                  : 'Free $10,000 Paper Demo active. Save an email anytime to keep your history.'}
              </span>
            </div>
            <button type="button" onClick={() => setSaveGuestOpen(true)} className="btn-cobalt px-4 py-1.5 rounded-2xl text-xs">
              {isFa ? 'ذخیره حساب' : 'Save Account'}
            </button>
          </div>
        )}

        {notice && (
          <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</span>
            <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-extrabold text-loss flex items-center justify-between">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* 1. Open Balance Hero matching Screenshot 2 */}
        <section className="pt-2 pb-1 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2 text-xs text-dim font-bold">
            <span>{isFa ? 'مجموع دارایی' : 'Total Balance'}</span>
            <button
              type="button"
              onClick={() => setHideBal((v) => !v)}
              className="p-1 rounded-full hover:bg-[var(--soft)] text-dim transition"
              aria-label="Toggle balance"
            >
              {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                isRunning ? 'bg-[#10B981]/12 text-[#0D9455]' : 'bg-[var(--soft)] text-sub'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-[#0D9455] live-dot' : 'bg-[#F59E0B]'}`} />
              <span>{isRunning ? (isFa ? 'ربات فعال' : 'Bot Live') : isFa ? 'آماده شروع' : 'Ready'}</span>
            </span>
          </div>

          <div className="flex items-baseline justify-center gap-1.5">
            <span dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-main tracking-tight font-num">
              {hideBal ? '••••••' : `$${totalEq.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </span>
            <span className="text-xs font-bold text-dim">USD</span>
          </div>

          {!hideBal && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {isFa && (
                <span className="text-dim font-semibold">
                  معادل {formatTomanEq(totalEq)} تومان
                </span>
              )}
              <span
                dir="ltr"
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tabular ${
                  todayPnl >= 0 ? 'bg-[#10B981]/12 text-[#0D9455]' : 'bg-rose-500/12 text-loss'
                }`}
              >
                {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)} {isFa ? 'امروز' : 'today'}
              </span>
            </div>
          )}
        </section>

        {/* 2. Unified Kifpool-style 3x2 Divided Action Card matching image-5.png */}
        <section className="panel rounded-[26px] overflow-hidden grid grid-cols-3">
          {[
            {
              id: 'bot',
              icon: Bot,
              label: isRunning ? (isFa ? 'توقف ربات' : 'Pause Bot') : isFa ? 'شروع ربات' : 'Start Bot',
              accent: isRunning,
              onClick: () => void handleStartStop(),
              borderCls: 'border-b border-e hairline',
            },
            {
              id: 'trade',
              icon: ArrowUpDown,
              label: isFa ? 'معامله آسان' : 'Easy Trade',
              accent: false,
              onClick: () => onNavigate('terminal'),
              borderCls: 'border-b border-e hairline',
            },
            {
              id: 'exchange',
              icon: KeyRound,
              label: isFa ? 'اتصال صرافی' : 'Exchanges',
              accent: false,
              onClick: () => onNavigate('copy'),
              borderCls: 'border-b hairline',
            },
            {
              id: 'history',
              icon: Activity,
              label: isFa ? 'تاریخچه فعالیت‌ها' : 'Activity',
              accent: false,
              onClick: () => onNavigate('portfolio'),
              borderCls: 'border-e hairline',
            },
            {
              id: 'pro',
              icon: CandlestickChart,
              label: isFa ? 'معاملات حرفه‌ای' : 'Pro Trade',
              accent: false,
              onClick: () => {
                onToggleUiMode?.('pro');
                onNavigate('terminal');
              },
              borderCls: 'border-e hairline',
            },
            {
              id: 'services',
              icon: LayoutGrid,
              label: isFa ? 'بیشتر' : 'More',
              accent: false,
              onClick: () => onNavigate('services'),
              borderCls: '',
            },
          ].map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => {
                  tgHaptic('light');
                  tile.onClick();
                }}
                className={`py-4 px-2 flex flex-col items-center justify-center gap-2 text-center hover:bg-[var(--soft)] transition ${tile.borderCls}`}
              >
                <Icon
                  className={`w-5 h-5 ${tile.accent ? 'text-[#0D9455]' : 'text-main'}`}
                  strokeWidth={1.9}
                />
                <span className={`text-[11px] font-bold leading-tight ${tile.accent ? 'text-[#0D9455]' : 'text-main'}`}>
                  {tile.label}
                </span>
              </button>
            );
          })}
        </section>

        {/* 3. Custom Artwork Cobalt Promotional Banner matching image-5.png */}
        <div className="space-y-2">
          <section
            className="rounded-[24px] relative overflow-hidden text-white shadow-lg min-h-[126px] flex items-center"
            style={{ background: '#0E49DF' }}
          >
            <img
              src="/assets/banner-bot-gold.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover object-left pointer-events-none select-none"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isFa
                  ? 'linear-gradient(90deg, rgba(14,73,223,0.12) 0%, rgba(14,73,223,0.78) 46%, rgba(11,55,180,0.96) 100%)'
                  : 'linear-gradient(270deg, rgba(14,73,223,0.12) 0%, rgba(14,73,223,0.78) 46%, rgba(11,55,180,0.96) 100%)',
              }}
            />

            <div className="relative z-10 w-full px-5 py-4 flex items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-[66%]">
                <h2 className="font-display font-extrabold text-sm sm:text-base leading-snug">
                  {isFa ? 'ربات معامله‌گر خودکار در دلارینو' : 'Dollarino Autonomous 24/7 Bot'}
                </h2>
                <p className="text-[11px] text-white/85 leading-relaxed">
                  {isFa ? 'ارز، فیوچرز، اسپات، اسکن هوشمند کل بازار، هر لحظه و هرجا' : 'Spot, Futures & AI market scanner anytime'}
                </p>
                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="px-3.5 py-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-[11px] font-black inline-flex items-center gap-1 transition"
                  >
                    <span>{isFa ? 'تنظیم ربات' : 'Setup Bot'}</span>
                    {isFa ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1652F0]/25" />
            <span className="h-1.5 w-4 rounded-full bg-[#1652F0]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#1652F0]/25" />
          </div>
        </div>

        {/* 4. Kifpool-style Tabbed Market Watchlist Card matching image-5.png */}
        <section className="panel rounded-[26px] overflow-hidden">
          <div className="px-4 pt-3.5 border-b hairline flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-4 text-xs font-bold shrink-0">
              {[
                { id: 'favs' as const, lbl: isFa ? 'علاقه‌مندی‌ها' : 'Favorites' },
                { id: 'popular' as const, lbl: isFa ? 'محبوب‌ترین‌ها' : 'Popular' },
                { id: 'active' as const, lbl: isFa ? 'ارزهای من' : 'My Coins' },
                { id: 'gainers' as const, lbl: isFa ? 'بیشترین سود' : 'Top Gainers' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWatchlistTab(t.id)}
                  className={`pb-2.5 whitespace-nowrap border-b-2 transition ${
                    watchlistTab === t.id
                      ? 'border-[#0F172A] dark:border-white text-main font-black'
                      : 'border-transparent text-dim hover:text-main'
                  }`}
                >
                  {t.lbl}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('markets')}
              className="pb-2.5 text-[11px] font-black text-[#1652F0] shrink-0 inline-flex items-center gap-0.5"
            >
              <span>{isFa ? 'همه' : 'All'}</span>
              {isFa ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="px-4 py-2 flex items-center justify-between text-[11px] font-bold text-dim border-b hairline">
            <span>{isFa ? 'نام ارز' : 'Coin'}</span>
            <span>{isFa ? 'قیمت لحظه‌ای' : 'Live Price'}</span>
            <span>24h</span>
          </div>

          <div className="divide-y hairline px-2">
            {(() => {
              const basePool: Array<{ symbol: string; base?: string; lastPrice: string | number; changePct24h?: string | number }> = markets.length
                ? markets
                : SIMPLE_COINS.map((c) => ({ symbol: c.symbol, base: c.symbol.replace('USDT', ''), lastPrice: 0, changePct24h: 0 }));
              let filtered = basePool;
              if (watchlistTab === 'gainers') {
                filtered = [...basePool].sort((a, b) => Number(b.changePct24h || 0) - Number(a.changePct24h || 0));
              } else if (watchlistTab === 'active' && data.openTrades.length > 0) {
                const openSyms = new Set(data.openTrades.map((p) => p.symbol));
                const matched = basePool.filter((m) => openSyms.has(m.symbol));
                if (matched.length > 0) filtered = matched;
              } else if (watchlistTab === 'favs') {
                const favSyms = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT']);
                const matched = basePool.filter((m) => favSyms.has(m.symbol));
                if (matched.length > 0) filtered = matched;
              }
              return filtered.slice(0, 6);
            })().map((c) => {
              const px = Number(c.lastPrice || 0);
              const ch = Number(c.changePct24h || 0);
              const up = ch >= 0;
              const base = c.base || c.symbol.replace('USDT', '');
              return (
                <button
                  key={c.symbol}
                  type="button"
                  onClick={() => {
                    setSimpleCoin(c.symbol);
                    onSelectTerminalSymbol(c.symbol);
                  }}
                  className="w-full py-3 flex items-center justify-between gap-3 text-start hover:bg-[var(--soft)] rounded-xl px-2 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CoinIcon symbol={c.symbol} size={34} />
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm text-main truncate">{base}</p>
                      <p className="text-[11px] font-medium text-dim truncate">{coinDisplayName(base, isFa)}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p dir="ltr" className="font-num font-bold text-xs sm:text-sm text-main">
                      ${formatUsdPrice(px)}
                    </p>
                    {isFa && <p className="text-[10px] text-dim tabular">{formatTomanEq(px)} تومان</p>}
                  </div>
                  <span dir="ltr" className={`font-num font-black text-xs tabular min-w-[54px] text-end ${up ? 'text-jade' : 'text-loss'}`}>
                    {up ? '+' : ''}
                    {ch.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. Clean Tabbed Control Hub: 4-Step Bot Launcher | 3-Tap Quick Trade | Open & Settled Trades */}
        <section className="panel rounded-[28px] p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="ios-segmented p-1">
              {[
                { id: 'bot' as const, lbl: isFa ? 'تنظیم ربات ۲۴/۷' : '24/7 Bot Setup' },
                { id: 'trade' as const, lbl: isFa ? 'معامله ۳ مرحله‌ای' : '3-Tap Trade' },
                { id: 'positions' as const, lbl: isFa ? `معاملات (${data.openTrades.length})` : `Trades (${data.openTrades.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setHomePanel(t.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${
                    homePanel === t.id ? 'ios-pill-active' : 'text-dim hover:text-main'
                  }`}
                >
                  {t.lbl}
                </button>
              ))}
            </div>

            {data.config.trading_mode === 'PAPER' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTopupOpen(true)}
                  className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#1652F0]" />
                  <span>{isFa ? 'شارژ دمو' : 'Top Up'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void resetDemoWallet()}
                  className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ریست $۱۰K' : 'Reset $10K'}</span>
                </button>
              </div>
            )}
          </div>

          {homePanel === 'bot' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <DollarinoBrandMark size={34} />
                  <div>
                    <h3 className="font-display font-bold text-base text-main">
                      {isFa ? 'راه‌اندازی گام‌به‌گام ربات دلارینو' : 'Dollarino Guided Auto-Bot Setup'}
                    </h3>
                    <p className="text-[11px] text-dim">
                      {isFa ? 'تنظیم سریع سرمایه، ریسک، استراتژی و اتصال صرافی واقعی.' : 'Set capital, risk, strategy & live exchange API.'}
                    </p>
                  </div>
                </div>

                <div className="ios-segmented p-1">
                  <button
                    type="button"
                    onClick={() => setSimpleWizTab('bot')}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-black inline-flex items-center gap-1 ${
                      simpleWizTab === 'bot' ? 'ios-pill-active' : 'text-dim'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>{isFa ? 'تنظیم ربات' : 'Bot'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimpleWizTab('exchange')}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-black inline-flex items-center gap-1 ${
                      simpleWizTab === 'exchange' ? 'ios-pill-active' : 'text-dim'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isFa ? 'اتصال صرافی' : 'Exchange'}</span>
                  </button>
                </div>
              </div>

              {simpleWizTab === 'bot' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      isFa ? 'مبلغ سرمایه' : 'Capital',
                      isFa ? 'سطح ریسک' : 'Risk Level',
                      isFa ? 'استراتژی' : 'Strategy',
                      isFa ? 'تأیید و شروع' : 'Launch Bot',
                    ].map((lbl, idx) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setSimpleStep(idx)}
                        className={`py-2 px-3 rounded-2xl text-xs font-black transition text-center ${
                          simpleStep === idx ? 'btn-cobalt' : idx < simpleStep ? 'badge-signal' : 'surface-soft text-dim hover:text-main'
                        }`}
                      >
                        {idx + 1}. {lbl}
                      </button>
                    ))}
                  </div>

                  {simpleStep === 0 && (
                    <div className="surface-soft rounded-2xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-main flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-[#F59E0B]" />
                          <span>{isFa ? 'چه مقدار سرمایه به ربات می‌سپارید؟' : 'Bot Capital Allocation'}</span>
                        </span>
                        <span dir="ltr" className="font-num font-black text-base text-jade">
                          ${simpleCapital.toLocaleString()} ({Math.min(100, Math.max(2, Math.round((simpleCapital / Math.max(100, totalEq)) * 100)))}%)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={Math.max(100, Math.round(totalEq))}
                        step={10}
                        value={Math.min(Math.max(100, Math.round(totalEq)), simpleCapital)}
                        onChange={(e) => setSimpleCapital(Number(e.target.value))}
                        className="w-full"
                        style={{ ['--fill' as string]: `${Math.min(100, Math.round((simpleCapital / Math.max(100, totalEq)) * 100))}%` }}
                      />
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[100, 500, 1000, Math.round(totalEq * 0.25), Math.round(totalEq * 0.5), Math.round(totalEq)].map((amt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSimpleCapital(Math.max(10, amt))}
                            className={`py-2 rounded-xl text-xs font-num font-black transition ${
                              simpleCapital === Math.max(10, amt) ? 'btn-emerald' : 'btn-ghost text-dim'
                            }`}
                          >
                            ${Math.max(10, amt).toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {simpleStep === 1 && (
                    <div className="grid sm:grid-cols-3 gap-2.5">
                      {[
                        { id: 'low' as const, title: isFa ? 'کم‌ریسک (محافظه‌کار)' : 'Conservative', detail: isFa ? 'اهرم ۳× · سقف ضرر ۳٪' : '3x Lev · 3% Daily Cap', icon: ShieldCheck, cls: 'text-jade' },
                        { id: 'medium' as const, title: isFa ? 'متعادل (پیشنهادی)' : 'Balanced', detail: isFa ? 'اهرم ۱۰× · تریلینگ ۲٪' : '10x Lev · 2% Trail', icon: Scale, cls: 'text-brand' },
                        { id: 'high' as const, title: isFa ? 'پُرقدرت (سود سریع)' : 'Aggressive', detail: isFa ? 'اهرم ۲۰× · تا ۲۰ پوزیشن' : '20x Lev · 20 parallel', icon: Zap, cls: 'text-flame' },
                      ].map((r) => {
                        const Icon = r.icon;
                        const active = simpleRiskPreset === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSimpleRiskPreset(r.id)}
                            className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                              active ? 'border-[#1652F0] bg-[#1652F0]/8' : 'surface-soft'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <Icon className={`w-4 h-4 ${r.cls}`} />
                              {active && <CheckCircle2 className="w-4 h-4 text-jade" />}
                            </div>
                            <p className={`text-xs font-black ${r.cls}`}>{r.title}</p>
                            <p className="text-[11px] text-dim">{r.detail}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {simpleStep === 2 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {[
                        { id: 'dollarino_v01' as const, badge: 'دُرنا V1', t: isFa ? 'رشد پایدار (دُرنا V1)' : 'Steady Growth (Dorna V1)', d: isFa ? 'استراتژی غیرریپینت اسکن کل بازار' : 'Flagship non-repaint scanner' },
                        { id: 'ai_autonomous_agent' as const, badge: 'Multi-AI', t: isFa ? 'هوش مصنوعی دُرّبین' : 'Dorrbin Multi-AI', d: isFa ? 'تصمیم خودکار چند مدل AI' : 'Multi-model AI consensus' },
                        { id: 'kbos_v11' as const, badge: 'ALMA+ATR', t: 'KBOs Super v11', d: isFa ? '۳ تارگت و تریلینگ خودکار' : 'HTF ribbon + 3-TP trail' },
                        { id: 'sp2l' as const, badge: '3-TP', t: isFa ? 'شکار نقدینگی (SP2L)' : 'Liquidity Sweep', d: isFa ? 'شکست جعلی + ریسک‌فری' : 'Sweep + auto Break-Even' },
                        { id: 'ema_trend_pullback' as const, badge: 'Momentum', t: isFa ? 'مومنتوم روند EMA' : 'EMA Momentum', d: isFa ? 'پولبک هم‌جهت روند' : 'HTF trend pullback' },
                        { id: 'signal_mixer' as const, badge: '8-Ch', t: isFa ? 'میکسر ۸ کاناله' : '8-Ch Quant Mixer', d: isFa ? '۸ اندیکاتور همزمان' : 'Weighted 8-factor mixer' },
                      ].map((s) => {
                        const active = simpleStrategy === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSimpleStrategy(s.id)}
                            className={`p-3 rounded-2xl border text-start transition space-y-1 ${
                              active ? 'border-[#1652F0] bg-[#1652F0]/8' : 'surface-soft'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-main">{s.t}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full badge-signal font-bold">{s.badge}</span>
                            </div>
                            <p className="text-[11px] text-dim">{s.d}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {simpleStep === 3 && (
                    <div className="surface-soft rounded-2xl p-4 grid sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-dim block">{isFa ? 'سرمایه:' : 'Capital:'}</span>
                        <span dir="ltr" className="font-num font-black text-base text-main">${simpleCapital.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-dim block">{isFa ? 'ریسک:' : 'Risk:'}</span>
                        <span className="font-black text-base text-jade">
                          {simpleRiskPreset === 'low' ? (isFa ? 'کم‌ریسک (3×)' : 'Conservative') : simpleRiskPreset === 'high' ? (isFa ? 'پُرقدرت (20×)' : 'Aggressive') : (isFa ? 'متعادل (10×)' : 'Balanced')}
                        </span>
                      </div>
                      <div>
                        <span className="text-dim block">{isFa ? 'موتور:' : 'Engine:'}</span>
                        <span className="font-black text-base text-brand">{simpleStrategy}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={simpleStep === 0}
                      onClick={() => setSimpleStep((s) => Math.max(0, s - 1))}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      <ArrowLeft className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                      <span>{isFa ? 'قبلی' : 'Back'}</span>
                    </button>

                    {simpleStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => setSimpleStep((s) => Math.min(3, s + 1))}
                        className="btn-cobalt px-5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5"
                      >
                        <span>{isFa ? 'مرحله بعد' : 'Next'}</span>
                        <ArrowRight className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const lev = simpleRiskPreset === 'low' ? 3 : simpleRiskPreset === 'high' ? 20 : 10;
                            const dailyLoss = simpleRiskPreset === 'low' ? 3 : simpleRiskPreset === 'high' ? 10 : 5;
                            const trailPct = simpleRiskPreset === 'low' ? 1.5 : simpleRiskPreset === 'high' ? 2.8 : 2.0;
                            const marginPct = Math.min(100, Math.max(2, Math.round((simpleCapital / Math.max(100, totalEq)) * 100)));
                            await apiFetch('/api/trading/config', {
                              method: 'PATCH',
                              body: JSON.stringify({
                                strategy_key: simpleStrategy,
                                margin_pct: marginPct,
                                max_leverage: lev,
                                daily_max_loss_pct: dailyLoss,
                                trailing_stop_enabled: 1,
                                trailing_stop_pct: trailPct,
                                auto_scan_top: 1,
                                scan_scope: 'ALL_MARKET',
                                risk_profile_json: { preset: simpleRiskPreset === 'low' ? 'conservative' : simpleRiskPreset === 'high' ? 'aggressive' : 'balanced', allocatedAmount: simpleCapital },
                              }),
                            });
                            await apiFetch('/api/trading/bot/start', {
                              method: 'POST',
                              body: JSON.stringify({ marginPct, strategyKey: simpleStrategy, maxLeverage: lev, allocatedAmount: simpleCapital, scanScope: 'ALL_MARKET' }),
                            });
                            tgNotifyHaptic('success');
                            toastMsg(isFa ? 'ربات با تنظیمات شما روشن شد!' : 'Auto-Bot launched!');
                            await onRefresh();
                          } catch (err) {
                            toastMsg(err instanceof Error ? err.message : 'Start failed', true);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="btn-emerald px-6 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5 shadow-lg"
                      >
                        <Rocket className="w-4 h-4" />
                        <span>{busy ? '...' : isFa ? 'ذخیره و شروع ربات ۲۴/۷' : 'Launch 24/7 Bot'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    {(['toobit', 'kcex'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSimpleExProvider(p)}
                        className={`py-2.5 rounded-xl font-black uppercase ${simpleExProvider === p ? 'btn-cobalt' : 'btn-ghost text-dim'}`}
                      >
                        {p === 'toobit' ? 'Toobit Futures' : 'KCEX Futures'}
                      </button>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <input value={simpleExKey} onChange={(e) => setSimpleExKey(e.target.value)} dir="ltr" placeholder="API Key" className="field font-mono text-xs" />
                    <input type="password" value={simpleExSecret} onChange={(e) => setSimpleExSecret(e.target.value)} dir="ltr" placeholder="API Secret" className="field font-mono text-xs" />
                  </div>
                  {simpleExProvider === 'kcex' ? (
                    <input value={simpleExSession} onChange={(e) => setSimpleExSession(e.target.value)} dir="ltr" placeholder="KCEX Web Session Token (optional)" className="field font-mono text-xs" />
                  ) : (
                    <input value={simpleExProxy} onChange={(e) => setSimpleExProxy(e.target.value)} dir="ltr" placeholder="Relay Proxy URL (optional)" className="field font-mono text-xs" />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-dim flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
                      <span>{isFa ? 'رمزنگاری AES-256-GCM · فقط مجوز معامله.' : 'AES-256-GCM encrypted · Trade-only.'}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await apiFetch<{ test?: { message?: string } }>('/api/connections/exchanges', {
                            method: 'POST',
                            body: JSON.stringify({
                              provider: simpleExProvider,
                              apiKey: simpleExKey,
                              apiSecret: simpleExSecret,
                              proxyUrl: simpleExProvider === 'toobit' && simpleExProxy.trim() ? simpleExProxy.trim() : undefined,
                              webSessionToken: simpleExProvider === 'kcex' ? simpleExSession : undefined,
                            }),
                          });
                          toastMsg(r.test?.message || (isFa ? 'صرافی متصل شد' : 'Exchange connected'));
                          await onRefresh();
                        } catch (err) {
                          toastMsg(err instanceof Error ? err.message : 'Exchange error', true);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="btn-emerald px-5 py-2.5 rounded-xl font-black"
                    >
                      {isFa ? 'اتصال صرافی واقعی' : 'Connect Exchange'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {homePanel === 'trade' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-main">
                  {isFa ? 'معامله سریع محافظت‌شده در ۳ لمس' : 'Protected Trade in 3 Taps'}
                </h3>
                {livePx > 0 && (
                  <div className="surface-soft rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
                    <CoinIcon symbol={simpleCoin} size={20} />
                    <span className="font-bold text-main">{isFa ? selectedCoinInfo.fa : selectedCoinInfo.en}</span>
                    <span dir="ltr" className="font-num font-black text-main">${livePx.toLocaleString()}</span>
                    <span dir="ltr" className={`font-num font-bold ${ch24 >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {ch24 >= 0 ? '+' : ''}{ch24.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SIMPLE_COINS.map((c) => {
                  const on = simpleCoin === c.symbol;
                  return (
                    <button
                      key={c.symbol}
                      type="button"
                      onClick={() => {
                        tgHaptic('light');
                        setSimpleCoin(c.symbol);
                      }}
                      className={`rounded-2xl p-2.5 flex flex-col items-center gap-1 transition ${
                        on ? 'ios-pill-active' : 'surface-soft text-sub'
                      }`}
                    >
                      <CoinIcon symbol={c.symbol} size={24} />
                      <span className="text-[11px] font-black">{isFa ? c.fa : c.en}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSimpleSide('LONG')}
                    className={`rounded-2xl p-3 border-2 text-start transition ${
                      simpleSide === 'LONG' ? 'bg-[#0D9455]/10 border-[#0D9455]' : 'surface-soft border-transparent'
                    }`}
                  >
                    <p className="font-bold text-xs text-jade">{isFa ? 'خرید / صعودی' : 'LONG (Up)'}</p>
                    <p className="text-[10px] text-dim mt-0.5">{isFa ? 'سود از رشد قیمت' : 'Profit on rise'}</p>
                  </button>
                  {data.config.market_type !== 'SPOT' && (
                    <button
                      type="button"
                      onClick={() => setSimpleSide('SHORT')}
                      className={`rounded-2xl p-3 border-2 text-start transition ${
                        simpleSide === 'SHORT' ? 'bg-rose-500/10 border-rose-500' : 'surface-soft border-transparent'
                      }`}
                    >
                      <p className="font-bold text-xs text-loss">{isFa ? 'فروش / نزولی' : 'SHORT (Down)'}</p>
                      <p className="text-[10px] text-dim mt-0.5">{isFa ? 'سود از ریزش قیمت' : 'Profit on drop'}</p>
                    </button>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {[25, 50, 100, 250].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setSimpleAmount(amt)}
                        className={`flex-1 py-2 rounded-xl text-xs font-num font-black transition ${
                          simpleAmount === amt ? 'btn-emerald' : 'surface-soft text-dim'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={prepareSimpleTrade}
                    className="btn-emerald w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>{isFa ? 'اجرای معامله محافظت‌شده' : 'Execute Protected Trade'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {homePanel === 'positions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="ios-segmented p-1">
                  <button
                    type="button"
                    onClick={() => setSimpleTradesTab('open')}
                    className={`px-3 py-1 rounded-full text-[11px] font-black ${simpleTradesTab === 'open' ? 'ios-pill-active' : 'text-dim'}`}
                  >
                    {isFa ? `باز (${data.openTrades.length})` : `Open (${data.openTrades.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimpleTradesTab('closed')}
                    className={`px-3 py-1 rounded-full text-[11px] font-black ${simpleTradesTab === 'closed' ? 'ios-pill-active' : 'text-dim'}`}
                  >
                    {isFa ? `تسویه‌شده (${data.closedTrades.length})` : `Settled (${data.closedTrades.length})`}
                  </button>
                </div>
                <button type="button" onClick={() => onNavigate('portfolio')} className="text-xs font-black text-[#1652F0]">
                  {isFa ? 'جزئیات کیف پول' : 'Wallet Details'}
                </button>
              </div>

              {simpleTradesTab === 'closed' ? (
                data.closedTrades.length === 0 ? (
                  <p className="text-center py-6 text-xs text-dim">{isFa ? 'هنوز معامله تسویه‌شده‌ای نیست.' : 'No settled trades yet.'}</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {data.closedTrades.slice(0, 6).map((t) => {
                      const pnl = Number(t.realized_pnl || 0);
                      const win = pnl >= 0;
                      return (
                        <div key={t.id} className="surface-soft rounded-2xl p-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <CoinIcon symbol={t.symbol} size={30} />
                            <div>
                              <p className="font-bold text-xs text-main">{t.symbol.replace('USDT', '')} · {t.direction}</p>
                              <p className="text-[10px] text-dim">{new Date(t.closed_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                            </div>
                          </div>
                          <span dir="ltr" className={`font-num font-black text-xs ${win ? 'text-jade' : 'text-loss'}`}>
                            {win ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : data.openTrades.length === 0 ? (
                <p className="text-center py-6 text-xs text-dim">
                  {isFa ? 'الان معامله بازی ندارید.' : 'No open positions right now.'}
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {data.openTrades.map((pos) => {
                    const pnl = Number(pos.unrealized_pnl || 0);
                    const isProfit = pnl >= 0;
                    return (
                      <div key={pos.id} className="surface-soft rounded-2xl p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <CoinIcon symbol={pos.symbol} size={32} />
                          <div>
                            <p className="font-bold text-xs text-main">{pos.symbol.replace('USDT', '')} · {pos.direction}</p>
                            <p className={`text-[11px] font-black ${isProfit ? 'text-jade' : 'text-loss'}`}>
                              {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void closePosition(pos.id)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black ${isProfit ? 'btn-emerald' : 'bg-rose-500 text-white'}`}
                        >
                          {isProfit ? (isFa ? 'برداشت' : 'Collect') : isFa ? 'بستن' : 'Close'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 6. Compact Performance Summary + Pro Mode Toggle */}
        <section className="grid sm:grid-cols-2 gap-3">
          <div className="panel rounded-[24px] p-4 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-dim">{isFa ? 'نرخ برد ربات · کل معاملات' : 'Win Rate · Total Trades'}</p>
              <p dir="ltr" className="font-num font-black text-base text-jade">
                {data.stats.winRate.toFixed(1)}% <span className="text-dim font-bold text-xs">({data.stats.totalTrades})</span>
              </p>
            </div>
            <button type="button" onClick={() => onNavigate('card')} className="btn-gold px-3.5 py-2 rounded-xl text-[11px] font-black">
              {isFa ? 'کارت سود تاییدشده' : 'Profit Card'}
            </button>
          </div>

          {onToggleUiMode && (
            <button
              type="button"
              onClick={() => {
                tgHaptic('medium');
                onToggleUiMode('pro');
              }}
              className="panel panel-hover rounded-[24px] p-4 flex items-center justify-between gap-3 text-start"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-main">{isFa ? 'ورود به حالت حرفه‌ای (Pro)' : 'Open Pro Quant Mode'}</p>
                  <p className="text-[11px] text-dim">{isFa ? 'چارت کندلی · IDE کاستوم · رادار کل بازار' : 'Candlestick · Pine/Py IDE · Full Radar'}</p>
                </div>
              </div>
              {isFa ? <ChevronLeft className="w-4 h-4 text-dim" /> : <ChevronRight className="w-4 h-4 text-dim" />}
            </button>
          )}
        </section>

        {renderSharedModals()}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Guest Quick-Demo Conversion Banner */}
      {isGuestDemo && (
        <div className="panel rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--gold)]/35">
          <div className="flex items-center gap-2.5 text-xs">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} />
            <span className="text-main font-semibold">
              {isFa
                ? 'شما با حساب دمو مهمان ($۱۰,۰۰۰ رایگان) وارد شده‌اید. برای ذخیره دائمی معاملات و ارتقا، ایمیل خود را ثبت کنید.'
                : 'You are in an instant Guest Demo ($10,000). Bind an email to save your progress permanently.'}
            </span>
          </div>
          <button type="button" onClick={() => setSaveGuestOpen(true)} className="btn-gold px-4 py-2 rounded-xl text-xs">
            {isFa ? 'ذخیره دائمی حساب' : 'Save Account'}
          </button>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-extrabold text-loss flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 1. Signature Overview Hero + Live Equity Card */}
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 panel rounded-full px-4 py-1.5 text-[10px] font-black tracking-[0.12em] mb-4" style={{ color: 'var(--gold-soft)' }}>
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'live-gold bg-gold'}`} />
            <span>
              {isRunning
                ? isFa
                  ? `ربات فعال · اسکن ${scanScope === 'ALL_MARKET' ? `کل بازار (${markets.length || '500+'})` : data.config.symbol}`
                  : `BOT LIVE · SCANNING ${scanScope === 'ALL_MARKET' ? `ALL ${markets.length || '500+'} PAIRS` : scanScope}`
                : isFa
                  ? 'میز آماده معامله خودکار · دمو و واقعی'
                  : 'AUTONOMOUS EXCHANGE DESK · READY'}
            </span>
          </div>

          <h1 className="font-display font-semibold tracking-tight leading-[1.1] text-3xl sm:text-5xl text-main">
            {isFa ? (
              <>
                همه بازارها را
                <br />
                <span className="text-gold-grad">خودکار معامله کن.</span>
              </>
            ) : (
              <>
                Trade every market.
                <br />
                <em className="text-gold-grad italic">Automatically.</em>
              </>
            )}
          </h1>

          <p className="mt-4 text-dim text-sm leading-relaxed max-w-lg">
            {isFa
              ? '۳ موتور هوشمند دُرّبین، دُرنا V1/KBOS و کپی‌ترید به‌صورت همزمان تا ۲۰ پوزیشن را با حد ضرر و ۳ تارگت خودکار مدیریت می‌کنند.'
              : 'Deploy autonomous strategies, analyze charts with AI, and manage up to 20 simultaneous futures positions with automated risk protection.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStartStop()}
              className={`inline-flex items-center gap-2 font-black px-6 py-3.5 rounded-2xl text-xs sm:text-sm transition ${
                isRunning ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white' : 'btn-gold'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isRunning ? (isFa ? 'توقف ربات' : 'Stop Bot') : isFa ? 'شروع خودکار ربات' : 'Start Auto-Trading'}</span>
            </button>

            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="btn-emerald inline-flex items-center gap-2 font-black px-5 py-3.5 rounded-2xl text-xs sm:text-sm"
            >
              <WandSparkles className="w-4 h-4" />
              <span>{isFa ? 'راه‌اندازی ۴ مرحله‌ای (Wizard)' : 'Setup Wizard'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terminal')}
              className="btn-ghost inline-flex items-center gap-2 font-bold px-5 py-3.5 rounded-2xl text-xs sm:text-sm"
            >
              <span>{isFa ? 'پایانه و چارت AI' : 'Pro Terminal'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="mt-7 grid grid-cols-4 gap-2 max-w-lg">
            {[
              { v: `${markets.length || '800+'}`, l: isFa ? 'جفت‌ارز زنده' : 'Pairs' },
              { v: String(data.openTrades.length), l: isFa ? 'معامله باز' : 'Open Now' },
              { v: `${data.stats.winRate.toFixed(0)}%`, l: isFa ? 'وین‌ریت' : 'Win Rate' },
              { v: `${data.config.max_leverage}×`, l: isFa ? 'سقف اهرم' : 'Max Lev' },
            ].map((s) => (
              <div key={s.l} className="panel rounded-2xl px-2 py-3 text-center">
                <p dir="ltr" className="font-display font-bold text-lg sm:text-xl tabular" style={{ color: 'var(--gold-soft)' }}>
                  {s.v}
                </p>
                <p className="text-[10px] text-dim font-semibold mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Live Wallet & Equity Card */}
        <div className="relative">
          <div className="panel rounded-[28px] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-dim">
                <LiveDot size={7} color={isRunning ? '#10d9a3' : '#e8c15a'} />
                <span>{data.config.trading_mode === 'PAPER' ? (isFa ? 'حساب دمو' : 'PAPER DESK') : 'LIVE EXCHANGE'}</span>
              </div>

              <div className="inline-flex p-0.5 rounded-xl bg-black/25 border hairline text-[11px] font-bold">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ trading_mode: 'PAPER' }, isFa ? 'حساب دمو فعال شد' : 'Paper mode active')}
                  className={`px-3 py-1 rounded-lg transition ${
                    data.config.trading_mode === 'PAPER' ? 'btn-gold' : 'text-dim hover:text-main'
                  }`}
                >
                  {isFa ? 'دمو رایگان' : 'Paper'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ trading_mode: 'LIVE' }, isFa ? 'حساب واقعی فعال شد' : 'Live mode active')}
                  className={`px-3 py-1 rounded-lg transition ${
                    data.config.trading_mode === 'LIVE' ? 'btn-emerald' : 'text-dim hover:text-main'
                  }`}
                >
                  {isFa ? 'حساب واقعی' : 'Live'}
                </button>
              </div>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2.5 text-xs text-dim font-semibold flex-wrap">
                  <span>{isFa ? 'ارزش کل حساب (Equity)' : 'Total Equity'}</span>
                  <button type="button" onClick={() => setHideBal((v) => !v)} className="text-dim hover:text-main">
                    {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {data.config.trading_mode === 'PAPER' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTopupOpen(true)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline"
                        style={{ color: 'var(--gold)' }}
                      >
                        <PlusCircle className="w-3 h-3" />
                        {isFa ? 'شارژ دمو' : 'Top Up'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetDemoWallet()}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-dim hover:text-main"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {isFa ? 'ریست $۱۰K' : 'Reset'}
                      </button>
                    </>
                  )}
                </div>
                <div dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-main mt-1 font-num">
                  {hideBal ? '••••••' : <AnimatedNumber value={totalEq} format={(n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />}
                </div>
              </div>

              <span
                dir="ltr"
                className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-full tabular ${
                  todayPnl >= 0 ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
              </span>
            </div>

            <div className="h-40 rounded-2xl bg-black/20 border hairline p-2">
              <AreaChart values={equitySeries} height={144} />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: Wallet, l: isFa ? 'موجودی آزاد' : 'Free Cash', v: hideBal ? '•••' : `$${freeBal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, cls: 'text-jade' },
                { icon: Trophy, l: isFa ? 'سود کل' : 'Total PnL', v: `${data.stats.totalPnl >= 0 ? '+' : ''}$${data.stats.totalPnl.toFixed(0)}`, cls: 'text-goldsoft' },
                { icon: ShieldCheck, l: isFa ? 'اهرم فعلی' : 'Max Lev', v: `${data.config.max_leverage}×`, cls: 'text-brand' },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.l} className="rounded-2xl bg-[var(--soft)] border hairline p-3">
                    <Icon className={`w-4 h-4 mb-1 ${c.cls}`} />
                    <p dir="ltr" className="font-num font-bold text-sm tabular text-main">{c.v}</p>
                    <p className="text-[10px] text-dim font-semibold mt-0.5">{c.l}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {btc && (
            <button
              type="button"
              onClick={() => {
                onSelectTerminalSymbol('BTCUSDT');
                onNavigate('terminal');
              }}
              className="hidden sm:flex items-center gap-3 panel rounded-2xl px-4 py-2.5 shadow-xl animate-floaty absolute -top-4 -end-3"
            >
              <CoinIcon symbol="BTCUSDT" size={28} />
              <div className="text-start">
                <p className="text-[10px] text-dim font-bold">BTC/USDT</p>
                <p dir="ltr" className="font-num font-bold text-xs tabular text-main">
                  ${Number(btc.lastPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* 2. Kifpool-inspired Quick Services Grid */}
      <section className="panel rounded-[26px] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black text-main flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <span>{isFa ? 'دسترسی سریع ابزارهای پلتفرم' : 'Quick Desk Shortcuts'}</span>
          </p>
          <span className="text-[11px] text-dim">{data.activeExchange?.label || 'Paper Desk'}</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center text-[11px] font-bold">
          {[
            { icon: CandlestickChart, label: isFa ? 'پایانه و AI' : 'Terminal', onClick: () => onNavigate('terminal'), color: '#2b74ff' },
            { icon: WandSparkles, label: isFa ? 'راه‌اندازی ۴م' : 'Wizard', onClick: () => setWizardOpen(true), color: '#e8c15a' },
            { icon: Radar, label: isFa ? 'رادار زنده' : 'AI Radar', onClick: () => onNavigate('radar'), color: '#10d9a3' },
            { icon: BarChart3, label: isFa ? 'بک‌تست' : 'Backtest', onClick: () => onNavigate('radar'), color: '#38e1ff' },
            { icon: Bot, label: isFa ? 'کپی‌ترید' : 'Copy Trade', onClick: () => onNavigate('copy'), color: '#ff8a00' },
            { icon: KeyRound, label: isFa ? 'صرافی واقعی' : 'Exchanges', onClick: () => onNavigate('copy'), color: '#a855f7' },
            { icon: Wallet, label: isFa ? 'پورتفوی' : 'Portfolio', onClick: () => onNavigate('portfolio'), color: '#10d9a3' },
            { icon: Layers, label: isFa ? 'کارت هفته' : 'Card PNG', onClick: () => onNavigate('card'), color: '#e8c15a' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="surface-soft rounded-2xl py-3 px-1.5 flex flex-col items-center gap-1.5 hover:border-[var(--gold)] transition"
              >
                <span className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: `${item.color}1a`, color: item.color }}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-main truncate w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Autonomous Trading Team + Full Strategy & Timeframe Selector */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              {isFa ? 'موتورها و استراتژی‌های معاملاتی' : 'AUTONOMOUS TRADING TEAM'}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main mt-1">
              {isFa ? '۱. انتخاب موتور و استراتژی فعال' : '1. Engine & Strategy Selection'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={activeStrategy}
              disabled={busy}
              onChange={(e) =>
                void patchConfig(
                  { strategy_key: e.target.value, ai_gate_enabled: e.target.value === 'ai_autonomous_agent' ? 1 : 0 },
                  isFa ? 'استراتژی فعال تغییر کرد' : 'Strategy updated'
                )
              }
              className="field py-2 px-3 text-xs font-bold w-auto"
            >
              {ALL_STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {isFa ? s.labelFa : s.labelEn}
                </option>
              ))}
            </select>

            <select
              value={data.config.entry_timeframe || '15m'}
              disabled={busy}
              onChange={(e) =>
                void patchConfig({ entry_timeframe: e.target.value as Timeframe }, isFa ? `تایم‌فریم روی ${e.target.value} تنظیم شد` : 'Timeframe updated')
              }
              className="field py-2 px-3 text-xs font-bold w-auto"
            >
              {(['1m', '5m', '15m', '1h', '4h'] as Timeframe[]).map((tf) => (
                <option key={tf} value={tf}>
                  TF: {tf}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3.5">
          {[
            {
              id: 'ai' as const,
              active: activeStrategy === 'ai_autonomous_agent',
              art: <ModeGraphicAI />,
              code: 'DORR-BIN',
              title: isFa ? 'هوش مصنوعی دُرّبین' : 'Dorrbin Multi-AI',
              desc: isFa ? 'اجماع چند مدل هوش مصنوعی روی ساختار بازار بدون نیاز به کلید API شخصی.' : 'Consensus Multi-LLM engine managed centrally by Dollarino.',
              win: 74,
              color: '#e8c15a',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'ai_autonomous_agent', ai_gate_enabled: 1 },
                  isFa ? 'هوش مصنوعی دُرّبین فعال شد' : 'Dorrbin AI activated'
                ),
            },
            {
              id: 'dorna' as const,
              active: activeStrategy !== 'ai_autonomous_agent',
              art: <ModeGraphicCodex />,
              code: 'DORNA V1 / KBOS',
              title: isFa ? 'استراتژی دُرنا V1 و KBOS' : 'Dorna V1 & KBOS',
              desc: isFa ? 'شکار نقدینگی، روند و ریبون غیرریپینت؛ کاملاً رایگان در دمو و واقعی.' : 'Non-repaint trend & liquidity sweep strategy free for all accounts.',
              win: 68,
              color: '#10d9a3',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'dollarino_v01', ai_gate_enabled: 0 },
                  isFa ? 'استراتژی دُرنا V1 فعال شد' : 'Dorna V1 activated'
                ),
            },
            {
              id: 'copy' as const,
              active: false,
              art: <ModeGraphicTelegram />,
              code: 'MIRROR',
              title: isFa ? 'کپی‌ترید تلگرام' : 'Telegram Copy-Trade',
              desc: isFa ? 'اجرای خودکار سیگنال‌های کانال رسمی یا کانال شخصی و TradingView.' : 'Instant sub-second mirroring of Telegram & TradingView webhooks.',
              win: 79,
              color: '#38e1ff',
              onClick: () => onNavigate('copy'),
            },
          ].map((e) => (
            <div
              key={e.id}
              onClick={e.onClick}
              className={`cursor-pointer panel panel-hover rounded-[26px] p-5 space-y-3 relative overflow-hidden ${
                e.active ? 'ring-2 ring-[var(--gold)]' : ''
              }`}
            >
              {e.art}
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main">{e.title}</h3>
                <span dir="ltr" className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${e.color}20`, color: e.color }}>
                  {e.code}
                </span>
              </div>
              <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
              <div className="flex items-center justify-between text-xs font-black pt-1" style={{ color: e.color }}>
                <span className="inline-flex items-center gap-1">
                  {e.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{e.active ? (isFa ? 'انتخاب‌شده و فعال' : 'Active Engine') : isFa ? 'انتخاب این موتور' : 'Activate'}</span>
                </span>
                <span>{e.win}% WR</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Risk Shield Preset + Market Scope */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? '۲. میزان ریسک و اهرم' : '2. Risk Shield Preset'}
            </h3>
            <button type="button" onClick={() => onNavigate('copy')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
              {isFa ? 'تنظیمات دقیق ریسک ←' : 'Fine-tune Risk →'}
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {RISK_PRESETS.map((p) => {
              const on = currentPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void patchConfig(
                      {
                        margin_pct: p.marginPct,
                        max_leverage: p.maxLev,
                        daily_max_loss_pct: p.dailyLoss,
                        max_open_positions: p.maxOpen,
                        risk_profile_json: JSON.stringify({ preset: p.id }),
                      },
                      isFa ? `ریسک «${p.titleFa}» ذخیره شد` : `${p.titleEn} saved`
                    )
                  }
                  className={`p-3.5 rounded-2xl border text-start transition ${
                    on ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft hover:border-[var(--gold)]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    {on && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
                  </div>
                  <div className="text-xs font-black text-main mt-2">{isFa ? p.titleFa : p.titleEn}</div>
                  <div className="text-[11px] text-dim mt-1 leading-relaxed">{isFa ? p.descFa : p.descEn}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel rounded-[26px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? '۳. ارزها، نوع بازار و جهت ربات' : '3. Market Scope & Direction'}
            </h3>
            <SymbolPicker
              lang={lang}
              markets={markets}
              value={data.config.symbol}
              provider={data.activeExchange?.provider || 'paper'}
              marketType={data.config.market_type || 'FUTURES'}
              onChange={(sym) => void patchConfig({ scan_scope: 'SINGLE', symbol: sym }, isFa ? `نماد تک‌ارز روی ${sym} تنظیم شد` : `Symbol set to ${sym}`)}
              compact
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'ALL_MARKET' as const, icon: Globe, title: isFa ? `کل بازار (${markets.length || '500+'})` : `All Markets (${markets.length || '500+'})`, sub: isFa ? 'اسکن بدون محدودیت' : 'Uncapped rotation' },
              { id: 'TOP_COINS' as const, icon: Star, title: isFa ? 'ارزهای برتر' : 'Top Coins', sub: isFa ? 'نقدینگی بالا' : 'High volume' },
              { id: 'SINGLE' as const, icon: Crosshair, title: isFa ? 'تک‌ارز' : 'Single Coin', sub: data.config.symbol },
            ].map((s) => {
              const on = scanScope === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void patchConfig({ scan_scope: s.id }, isFa ? 'محدوده اسکن ربات بروزرسانی شد' : 'Scope updated')}
                  className={`p-3 rounded-2xl border text-start transition ${
                    on ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft hover:border-[var(--gold)]/50'
                  }`}
                >
                  <div className="text-xs font-black text-main inline-flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="text-[11px] text-dim mt-1 truncate">{s.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Spot vs Futures + Direction Mode (BOTH / LONG_ONLY / SHORT_ONLY) + Hedge Mode */}
          <div className="pt-2 border-t hairline grid sm:grid-cols-3 gap-2.5 text-xs">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-dim uppercase">{isFa ? 'نوع بازار' : 'Market Type'}</p>
              <div className="ios-segmented w-full flex">
                {(['FUTURES', 'SPOT'] as const).map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    disabled={busy}
                    onClick={() => void patchConfig({ market_type: mt }, isFa ? `نوع بازار روی ${mt === 'SPOT' ? 'اسپات' : 'فیوچرز'} تنظیم شد` : `Market set to ${mt}`)}
                    className={`flex-1 py-1.5 rounded-full text-[11px] font-black transition ${(data.config.market_type || 'FUTURES') === mt ? 'ios-pill-active' : 'text-dim'}`}
                  >
                    {mt === 'FUTURES' ? (isFa ? 'فیوچرز' : 'Futures') : isFa ? 'اسپات' : 'Spot'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-dim uppercase">{isFa ? 'جهت معاملات ربات' : 'Bot Direction Mode'}</p>
                {(data.config.market_type || 'FUTURES') === 'FUTURES' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void patchConfig(
                        { hedge_mode: data.config.hedge_mode ? 0 : 1 },
                        data.config.hedge_mode
                          ? isFa ? 'حالت تک‌جهت (One-Way) فعال شد' : 'One-Way mode active'
                          : isFa ? 'حالت هج دوطرفه همزمان (Hedge Mode) فعال شد' : 'Hedge Mode active'
                      )
                    }
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition inline-flex items-center gap-1 ${
                      data.config.hedge_mode ? 'badge-signal' : 'btn-ghost text-dim'
                    }`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>{isFa ? (data.config.hedge_mode ? 'Hedge فعال' : 'One-Way') : data.config.hedge_mode ? 'Hedge ON' : 'One-Way'}</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'BOTH' as const, label: isFa ? 'دوطرفه (L+S)' : 'Both (L+S)' },
                  { id: 'LONG_ONLY' as const, label: isFa ? 'فقط لانگ' : 'Long Only' },
                  { id: 'SHORT_ONLY' as const, label: isFa ? 'فقط شورت' : 'Short Only' },
                ]).map((dm) => {
                  const disabledSpotShort = (data.config.market_type || 'FUTURES') === 'SPOT' && dm.id === 'SHORT_ONLY';
                  const activeDir = (data.config.direction_mode || 'BOTH') === dm.id;
                  return (
                    <button
                      key={dm.id}
                      type="button"
                      disabled={busy || disabledSpotShort}
                      onClick={() => void patchConfig({ direction_mode: dm.id }, isFa ? 'جهت معاملات ربات ذخیره شد' : 'Direction mode updated')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition ${
                        activeDir ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                      } disabled:opacity-40`}
                    >
                      {dm.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Open Positions (with Inline Edit TP/SL & Reconcile) + Pending Limit Orders + Consensus */}
      <section className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div className="panel rounded-[26px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <Zap className="w-4 h-4 text-jade" />
              <span>{isFa ? `معاملات باز (${data.openTrades.length})` : `Open Positions (${data.openTrades.length})`}</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void reconcilePositions()}
                className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'همگام‌سازی' : 'Reconcile'}</span>
              </button>
              <button type="button" onClick={() => onNavigate('portfolio')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
                {isFa ? 'گزارش کامل ←' : 'Full Portfolio →'}
              </button>
            </div>
          </div>

          {data.openTrades.length === 0 ? (
            <div className="rounded-2xl border border-dashed hairline py-10 text-center text-xs text-dim space-y-2">
              <p className="font-bold text-main">
                {isRunning
                  ? isFa
                    ? `ربات در حال اسکن زنده کل بازار (${markets.length || '500+'} ارز) برای شکار بهترین نقطه ورود است...`
                    : `Bot is scanning all ${markets.length || '500+'} pairs for the next clean setup...`
                  : isFa
                    ? 'هنوز معامله بازی وجود ندارد.'
                    : 'No open positions yet.'}
              </p>
              <p>{isFa ? 'ویزارد ۴ مرحله‌ای را باز کنید یا از پایانه معامله دستی ثبت کنید.' : 'Launch the Setup Wizard or place a trade from Terminal.'}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.openTrades.map((pos) => {
                const uPnl = Number(pos.unrealized_pnl || 0);
                const up = uPnl >= 0;
                return (
                  <div key={pos.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <CoinIcon symbol={pos.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { onSelectTerminalSymbol(pos.symbol); onNavigate('terminal'); }} className="font-bold text-sm text-main hover:underline">
                          {pos.symbol}
                        </button>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black ${pos.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                          {pos.direction} {pos.leverage}×
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Entry ${pos.entry_price} · SL ${pos.current_stop_loss} · TP1 ${pos.tp1}
                      </p>
                    </div>

                    {pos.sparkline && pos.sparkline.length >= 2 && (
                      <div className="w-16 h-6 hidden sm:block ms-auto">
                        <Sparkline values={pos.sparkline} height={24} color={up ? '#10d9a3' : '#ff4d6d'} />
                      </div>
                    )}

                    <div className="ms-auto text-end">
                      <p dir="ltr" className={`font-num font-bold text-sm tabular ${up ? 'text-jade' : 'text-loss'}`}>
                        {up ? '+' : ''}${uPnl.toFixed(2)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditPos(pos);
                        setEditForm({
                          stopLoss: pos.current_stop_loss || '',
                          tp1: pos.tp1 || '',
                          tp2: pos.tp2 || '',
                          tp3: pos.tp3 || '',
                        });
                      }}
                      className="px-2.5 py-1.5 rounded-xl btn-ghost text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>TP/SL</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(pos.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-black transition inline-flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {data.pendingOrders && data.pendingOrders.length > 0 && (
            <div className="pt-3 border-t hairline space-y-2">
              <p className="text-xs font-black text-dim">{isFa ? `سفارش‌های لیمیت در انتظار (${data.pendingOrders.length})` : `Pending Limit Orders (${data.pendingOrders.length})`}</p>
              {data.pendingOrders.map((po) => (
                <div key={po.id} className="surface-soft rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <span>
                    <strong className="text-main">{po.symbol}</strong> · {po.direction} @ ${po.limit_price}
                  </span>
                  <button type="button" onClick={() => void cancelPendingOrder(po.id)} className="text-loss font-bold hover:underline">
                    {isFa ? 'لغو سفارش' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel rounded-[26px] p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-lg text-main mb-3">
              {isFa ? 'اجماع سیگنال‌های بازار' : 'Market Consensus'}
            </h3>
            <ConsensusGauge
              value={consensusPct}
              longLabel={isFa ? 'خرید' : 'Long'}
              shortLabel={isFa ? 'فروش' : 'Short'}
            />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('card')}
            className="btn-ghost w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"
          >
            <Layers className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <span>{isFa ? 'ساخت کارت هفتگی (PNG)' : 'Weekly Card Studio'}</span>
          </button>
        </div>
      </section>

      {renderSharedModals()}
    </div>
  );
}
