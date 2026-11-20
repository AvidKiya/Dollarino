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
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Globe,
  KeyRound,
  Layers,
  PauseCircle,
  PlusCircle,
  Power,
  Radar,
  RefreshCw,
  Rocket,
  RotateCcw,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  WandSparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Timeframe } from '@dollarino/core';
import { apiFetch, setStoredToken } from '../lib/api';
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
      <div className="space-y-6">
        {isGuestDemo && (
          <div className="panel rounded-3xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--gold-soft)' }} />
              <span className="text-main font-bold">
                {isFa
                  ? 'شما با حساب دمو رایگان ($۱۰,۰۰۰) وارد شده‌اید. اگر خواستید می‌توانید ایمیل خودتان را هم ذخیره کنید.'
                  : 'You are using Free $10,000 Paper Demo. Save an email anytime to keep your history.'}
              </span>
            </div>
            <button type="button" onClick={() => setSaveGuestOpen(true)} className="btn-cobalt px-4 py-2 rounded-2xl text-xs">
              {isFa ? 'ذخیره حساب من' : 'Save Account'}
            </button>
          </div>
        )}

        {notice && (
          <div className="p-4 rounded-2xl badge-signal text-xs sm:text-sm font-extrabold flex items-center justify-between">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</span>
            <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs sm:text-sm font-extrabold text-loss flex items-center justify-between">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* 1. Apple Wallet Hero Card (Exact Logo Cobalt-Sapphire) */}
        <section className="ios-wallet-card rounded-[32px] p-6 sm:p-8 relative overflow-hidden">
          <div className="relative z-10 grid lg:grid-cols-[1.2fr_1fr] gap-6 items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <DollarinoBrandMark size={48} glow />
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[11px] font-bold">
                    <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-[#12E35D] live-dot' : 'bg-[#4AD8FF]'}`} />
                    {isRunning
                      ? isFa ? 'ربات هوشمند روشن است' : 'Auto Bot Running'
                      : isFa ? 'حساب آماده شروع است' : 'Ready to Start'}
                  </span>
                  <h1 className="font-display font-bold text-xl sm:text-2xl mt-1.5">
                    {isFa ? `سلام ${user.username} عزیز!` : `Welcome, ${user.username}!`}
                  </h1>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs text-white/75">
                  <span>{isFa ? 'موجودی حساب شما' : 'Your Account Balance'}</span>
                  <button type="button" onClick={() => setHideBal((v) => !v)} className="opacity-80 hover:opacity-100">
                    {hideBal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap items-baseline gap-3 mt-1">
                  <span dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-white">
                    {hideBal ? '••••••' : `$${totalEq.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  </span>
                  <span
                    dir="ltr"
                    className={`px-3 py-1 rounded-full text-xs font-black tabular inline-flex items-center gap-1 ${
                      todayPnl >= 0 ? 'bg-[#12E35D]/25 text-[#8EFFB6]' : 'bg-rose-500/25 text-rose-200'
                    }`}
                  >
                    {todayPnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)} {isFa ? 'امروز' : 'today'}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    tgHaptic('medium');
                    void handleStartStop();
                  }}
                  className={`px-6 py-3.5 rounded-2xl text-sm font-black inline-flex items-center gap-2 transition ${
                    isRunning ? 'bg-[#FF8200] hover:bg-[#eb7700] text-white' : 'btn-lime'
                  }`}
                >
                  {isRunning ? <PauseCircle className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                  <span>
                    {isRunning
                      ? isFa ? 'توقف ربات خودکار' : 'Pause Auto Bot'
                      : isFa ? 'ربات هوشمند رو روشن کن' : 'Turn ON Smart Auto Bot'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="px-4 py-3.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <WandSparkles className="w-4 h-4" />
                  <span>{isFa ? 'راهنمای ۱ دقیقه‌ای' : '1-Min Guide'}</span>
                </button>

                {data.config.trading_mode === 'PAPER' && (
                  <button
                    type="button"
                    onClick={() => void resetDemoWallet()}
                    className="px-4 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isFa ? 'ریست به $۱۰,۰۰۰' : 'Reset $10k'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3 Simple Presets Right Inside Hero */}
            <div className="grid gap-2.5">
              {[
                {
                  active: activeStrategy === 'ai_autonomous_agent',
                  icon: BrainCircuit,
                  title: isFa ? '۱. معامله با هوش مصنوعی' : '1. AI Smart Trading',
                  desc: isFa ? 'هوش مصنوعی بازار را می‌بیند و خودکار معامله می‌کند' : 'AI reads market and trades for you',
                  onClick: () => void patchConfig({ strategy_key: 'ai_autonomous_agent', auto_scan_top: 1, scan_scope: 'ALL_MARKET' }, isFa ? 'حالت هوش مصنوعی فعال شد' : 'AI Auto enabled'),
                },
                {
                  active: currentPresetId === 'conservative',
                  icon: ShieldCheck,
                  title: isFa ? '۲. حالت خیلی کم‌ریسک و امن' : '2. Extra Safe Shield',
                  desc: isFa ? 'حجم کم و حد ضرر خودکار برای آرامش خاطر' : 'Small size & tight auto stop-loss',
                  onClick: () =>
                    void patchConfig(
                      { margin_pct: 2, max_leverage: 3, daily_max_loss_pct: 3, max_open_positions: 4, risk_profile_json: JSON.stringify({ preset: 'conservative' }) },
                      isFa ? 'سپر کم‌ریسک و امن فعال شد' : 'Safe Shield enabled'
                    ),
                },
                {
                  active: false,
                  icon: Wallet,
                  title: isFa ? '۳. شارژ رایگان پول آزمایشی' : '3. Add Free Demo Money',
                  desc: isFa ? 'هر وقت خواستید اعتبار دمو اضافه کنید' : 'Top up paper practice money anytime',
                  onClick: () => setTopupOpen(true),
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={card.onClick}
                    className={`rounded-2xl p-3.5 text-start flex items-center gap-3 transition ${
                      card.active ? 'bg-white text-[#06247a] shadow-lg' : 'bg-white/12 hover:bg-white/20 text-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${card.active ? 'bg-[#0A4CE8] text-white' : 'bg-white/15'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-xs sm:text-sm truncate">{card.title}</p>
                      <p className={`text-[11px] truncate ${card.active ? 'text-[#06247a]/75' : 'text-white/75'}`}>{card.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2. Embedded TimeTrade-Parity 4-Step Autonomous Bot Launcher (Simple Mode) */}
        <section className="panel rounded-[30px] p-5 sm:p-7 space-y-5 border border-[var(--line-strong)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DollarinoBrandMark size={42} glow />
              <div>
                <h2 className="font-display font-bold text-lg sm:text-xl text-main">
                  {isFa ? 'راه‌اندازی گام‌به‌گام ربات دلارینو' : 'Dollarino Guided Auto-Bot Setup'}
                </h2>
                <p className="text-xs text-dim mt-0.5">
                  {isFa
                    ? 'تنظیم سریع سرمایه، ریسک، استراتژی و اتصال صرافی — ربات پس از شروع به‌صورت ۲۴/۷ خودکار سود می‌سازد.'
                    : 'Set capital, risk, strategy & exchange — your bot scans and earns 24/7 automatically.'}
                </p>
              </div>
            </div>

            <div className="ios-segmented p-1">
              <button
                type="button"
                onClick={() => setSimpleWizTab('bot')}
                className={`px-4 py-2 rounded-full text-xs font-black inline-flex items-center gap-1.5 transition ${
                  simpleWizTab === 'bot' ? 'ios-pill-active' : 'text-dim hover:text-main'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>{isFa ? 'تنظیم ربات معاملاتی' : 'Trading Bot Setup'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSimpleWizTab('exchange')}
                className={`px-4 py-2 rounded-full text-xs font-black inline-flex items-center gap-1.5 transition ${
                  simpleWizTab === 'exchange' ? 'ios-pill-active' : 'text-dim hover:text-main'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isFa ? 'اتصال صرافی واقعی' : 'Connect Exchange'}</span>
              </button>
            </div>
          </div>

          {simpleWizTab === 'bot' ? (
            <div className="space-y-4">
              {/* 4 Step Pills */}
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
                    className={`py-2.5 px-3 rounded-2xl text-xs font-black transition text-center ${
                      simpleStep === idx ? 'btn-cobalt' : idx < simpleStep ? 'badge-signal' : 'surface-soft text-dim hover:text-main'
                    }`}
                  >
                    {idx + 1}. {lbl}
                  </button>
                ))}
              </div>

              {simpleStep === 0 && (
                <div className="surface-soft rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-main flex items-center gap-1.5">
                      <Wallet className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                      <span>{isFa ? 'چه مقدار سرمایه به ربات می‌سپارید؟ (حداقل $۱۰)' : 'How much capital should the bot allocate? (min $10)'}</span>
                    </span>
                    <span dir="ltr" className="font-num font-black text-lg text-jade">
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
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'low' as const,
                      title: isFa ? 'کم‌ریسک (محافظه‌کار)' : 'Conservative',
                      detail: isFa ? 'اهرم ۳× · تریلینگ ۱.۵٪ · سقف ضرر روزانه ۳٪' : '3x Lev · 1.5% Trail · 3% Daily Cap',
                      icon: ShieldCheck,
                      cls: 'text-jade',
                    },
                    {
                      id: 'medium' as const,
                      title: isFa ? 'متعادل (پیشنهادی)' : 'Balanced (Recommended)',
                      detail: isFa ? 'اهرم ۱۰× · تریلینگ ۲٪ + ریسک‌فری TP1' : '10x Lev · 2% Trail + Auto Risk-Free',
                      icon: Scale,
                      cls: 'text-brand',
                    },
                    {
                      id: 'high' as const,
                      title: isFa ? 'پُرقدرت (سود سریع)' : 'Aggressive Alpha',
                      detail: isFa ? 'اهرم ۲۰× · تا ۲۰ پوزیشن همزمان در کل بازار' : '20x Lev · Up to 20 parallel trades',
                      icon: Zap,
                      cls: 'text-flame',
                    },
                  ].map((r) => {
                    const Icon = r.icon;
                    const active = simpleRiskPreset === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSimpleRiskPreset(r.id)}
                        className={`p-4 rounded-2xl border text-start transition space-y-1.5 ${
                          active ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)] shadow-lg' : 'surface-soft'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon className={`w-5 h-5 ${r.cls}`} />
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
                    { id: 'dollarino_v01' as const, badge: 'دُرنا V1', t: isFa ? 'رشد پایدار (دُرنا V1)' : 'Steady Growth (Dorna V1)', d: isFa ? 'برترین استراتژی غیرریپینت با اسکن کل بازار' : 'Flagship non-repaint full market scanner' },
                    { id: 'ai_autonomous_agent' as const, badge: 'Multi-AI', t: isFa ? 'هوش مصنوعی دُرّبین' : 'Dorrbin Multi-AI', d: isFa ? 'تصمیم‌گیری خودکار چند مدل AI روی بازار زنده' : 'Autonomous multi-model AI consensus' },
                    { id: 'kbos_v11' as const, badge: 'ALMA+ATR', t: 'KBOs Super v11', d: isFa ? 'موج‌سواری روند همراه با ۳ تارگت و تریلینگ' : 'HTF trend ribbon with 3-TP trailing SL' },
                    { id: 'sp2l' as const, badge: '3-TP', t: isFa ? 'شکار نقدینگی (SP2L)' : 'Liquidity Sweep (SP2L)', d: isFa ? 'ورود روی جمع‌آوری نقدینگی و شکست جعلی' : 'Sweep reversal + Break-Even on TP1' },
                    { id: 'ema_trend_pullback' as const, badge: 'Momentum', t: isFa ? 'مومنتوم روند EMA' : 'EMA Momentum', d: isFa ? 'ورود در پولبک‌های تمیز هم‌جهت روند اصلی' : 'Clean pullback in dominant HTF trend' },
                    { id: 'signal_mixer' as const, badge: '8-Ch', t: isFa ? 'میکسر ۸ کاناله کوانت' : '8-Channel Quant Mixer', d: isFa ? 'ترکیب وزن‌دار ۸ اندیکاتور و حجم بازار' : 'Weighted 8-factor market score' },
                  ].map((s) => {
                    const active = simpleStrategy === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSimpleStrategy(s.id)}
                        className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                          active ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft'
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
                <div className="surface-soft rounded-2xl p-4 sm:p-5 grid sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-dim block">{isFa ? 'سرمایه درگیر:' : 'Allocated Capital:'}</span>
                    <span dir="ltr" className="font-num font-black text-base text-main">${simpleCapital.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-dim block">{isFa ? 'سطح حفاظت ریسک:' : 'Risk Profile:'}</span>
                    <span className="font-black text-base text-jade">
                      {simpleRiskPreset === 'low' ? (isFa ? 'کم‌ریسک (3×)' : 'Conservative (3×)') : simpleRiskPreset === 'high' ? (isFa ? 'پُرقدرت (20×)' : 'Aggressive (20×)') : (isFa ? 'متعادل (10×)' : 'Balanced (10×)')}
                    </span>
                  </div>
                  <div>
                    <span className="text-dim block">{isFa ? 'موتور انتخابی:' : 'Active Strategy:'}</span>
                    <span className="font-black text-base text-brand">{simpleStrategy}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={simpleStep === 0}
                  onClick={() => setSimpleStep((s) => Math.max(0, s - 1))}
                  className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ArrowLeft className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
                  <span>{isFa ? 'مرحله قبلی' : 'Back'}</span>
                </button>

                {simpleStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setSimpleStep((s) => Math.min(3, s + 1))}
                    className="btn-cobalt px-6 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"
                  >
                    <span>{isFa ? 'تأیید و مرحله بعد' : 'Next Step'}</span>
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
                        toastMsg(isFa ? 'ربات با تنظیمات شما روشن شد و به صورت ۲۴/۷ معامله می‌کند!' : 'Auto-Bot launched! Scanning & trading 24/7.');
                        await onRefresh();
                      } catch (err) {
                        toastMsg(err instanceof Error ? err.message : 'Start failed', true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="btn-lime px-7 py-3 rounded-2xl text-xs sm:text-sm font-black inline-flex items-center gap-2 shadow-xl"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>{busy ? '...' : isFa ? 'ذخیره و شروع خودکار ربات (کسب سود ۲۴/۷)' : 'Launch 24/7 Autonomous Bot'}</span>
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
                  <span>{isFa ? 'رمزنگاری AES-256-GCM · فقط مجوز معامله، بدون مجوز برداشت.' : 'AES-256-GCM encrypted · Trade-only API scope.'}</span>
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
                      toastMsg(r.test?.message || (isFa ? 'صرافی با موفقیت متصل شد' : 'Exchange connected'));
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
        </section>

        {/* 2B. Live Performance Activity Curve + Settled / Active Summary */}
        <section className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="panel rounded-[28px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-main flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'روند رشد سرمایه و فعالیت ساعتی' : 'Hourly Trading Activity & Equity Curve'}</span>
                </h3>
                <p className="text-[11px] text-dim">
                  {isFa ? 'نمای تجمعی عملکرد ربات طی ۳۰ روز اخیر' : '30-day cumulative automated equity'}
                </p>
              </div>
              <span dir="ltr" className={`text-xs font-num font-black ${todayPnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                {todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}
              </span>
            </div>
            <div className="h-36 rounded-2xl surface-soft p-3">
              <AreaChart values={equitySeries} height={116} />
            </div>
          </div>

          <div className="panel rounded-[28px] p-5 flex flex-col justify-between gap-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="surface-soft rounded-2xl p-3">
                <p dir="ltr" className="font-num font-bold text-base text-main">{data.stats.totalTrades}</p>
                <p className="text-[10px] text-dim mt-0.5">{isFa ? 'کل معاملات' : 'Trades'}</p>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <p dir="ltr" className="font-num font-bold text-base text-jade">{data.stats.winRate.toFixed(1)}%</p>
                <p className="text-[10px] text-dim mt-0.5">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <p dir="ltr" className="font-num font-bold text-base text-brand">${usedBal.toFixed(0)}</p>
                <p className="text-[10px] text-dim mt-0.5">{isFa ? 'درگیر در معامله' : 'Allocated'}</p>
              </div>
            </div>
            <div className="surface-soft rounded-2xl p-3.5 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-main">{isFa ? 'کارت سود هفتگی تاییدشده' : 'Verified Weekly Profit Card'}</p>
                <p className="text-[10px] text-dim">{isFa ? 'امضای دیجیتال HMAC سرور برای اشتراک‌گذاری' : 'Server HMAC signed report card'}</p>
              </div>
              <button type="button" onClick={() => onNavigate('card')} className="btn-gold px-3.5 py-2 rounded-xl text-[11px] font-black">
                {isFa ? 'مشاهده کارت' : 'Open Card'}
              </button>
            </div>
          </div>
        </section>

        {/* 3. Easy 3-Step Manual Trade Card (Designed for 10 to 80 years old!) */}
        <section className="panel rounded-[30px] p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--gold-soft)' }}>
                {isFa ? 'ساده‌ترین راه معامله در دنیا' : '3-TAP SIMPLE TRADE'}
              </p>
              <h2 className="font-display font-bold text-2xl text-main">
                {isFa ? 'خودت در ۳ قدم معامله باز کن' : 'Open a Protected Trade in 3 Taps'}
              </h2>
            </div>
            {livePx > 0 && (
              <div className="surface-soft rounded-2xl px-4 py-2 flex items-center gap-2.5 text-xs">
                <CoinIcon symbol={simpleCoin} size={24} />
                <div className="flex items-center gap-2">
                  <span className="font-bold text-main">{isFa ? selectedCoinInfo.fa : selectedCoinInfo.en}</span>
                  <span dir="ltr" className="font-num font-black text-main">${livePx.toLocaleString()}</span>
                  <span dir="ltr" className={`font-num font-bold inline-flex items-center gap-0.5 ${ch24 >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {ch24 >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{Math.abs(ch24).toFixed(2)}%</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Step 1: Choose Coin */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-sub">
              {isFa ? 'قدم اول: روی کدام ارز می‌خواهی معامله کنی؟' : 'Step 1: Which coin do you want?'}
            </p>
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
                    className={`rounded-2xl p-3 flex flex-col items-center gap-1.5 transition text-center ${
                      on ? 'ios-pill-active shadow-lg' : 'surface-soft hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <CoinIcon symbol={c.symbol} size={28} />
                    <span className="text-xs font-black">{isFa ? c.fa : c.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 & Step 3 */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-sub">
                {isFa ? 'قدم دوم: فکر می‌کنی قیمت به کدام سمت می‌رود؟' : 'Step 2: Which way will the price move?'}
              </p>
              <div className="ios-segmented">
                {(['FUTURES', 'SPOT'] as const).map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    disabled={busy}
                    onClick={() => void patchConfig({ market_type: mt }, isFa ? `بازار ${mt === 'SPOT' ? 'اسپات' : 'فیوچرز'} انتخاب شد` : `${mt} mode active`)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition ${(data.config.market_type || 'FUTURES') === mt ? 'ios-pill-active' : 'text-dim'}`}
                  >
                    {mt === 'FUTURES' ? (isFa ? 'فیوچرز' : 'Futures') : isFa ? 'اسپات' : 'Spot'}
                  </button>
                ))}
              </div>
            </div>
              <div className={data.config.market_type === 'SPOT' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setSimpleSide('LONG');
                  }}
                  className={`rounded-3xl p-4 sm:p-5 text-start transition border-2 flex flex-col justify-between gap-2 ${
                    simpleSide === 'LONG' || data.config.market_type === 'SPOT'
                      ? 'bg-[#12E35D]/15 border-[#12E35D] text-main shadow-lg'
                      : 'surface-soft border-transparent text-dim hover:text-main'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="h-10 w-10 rounded-2xl bg-[#12E35D] text-black grid place-items-center">
                      <ArrowUpRight className="w-6 h-6" />
                    </span>
                    {(simpleSide === 'LONG' || data.config.market_type === 'SPOT') && <CheckCircle2 className="w-5 h-5 text-jade" />}
                  </div>
                  <div>
                    <p className="font-display font-bold text-base text-main inline-flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-jade" />
                      <span>{data.config.market_type === 'SPOT' ? (isFa ? 'خرید اسپات (بدون اهرم)' : 'Spot Buy (1x)') : isFa ? 'بالا میره' : 'Going UP'}</span>
                    </p>
                    <p className="text-[11px] text-sub mt-0.5">{isFa ? 'اگر قیمت رشد کند سود می‌بری' : 'Profit when price rises'}</p>
                  </div>
                </button>

                {data.config.market_type !== 'SPOT' && (
                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setSimpleSide('SHORT');
                  }}
                  className={`rounded-3xl p-4 sm:p-5 text-start transition border-2 flex flex-col justify-between gap-2 ${
                    simpleSide === 'SHORT'
                      ? 'bg-rose-500/15 border-rose-500 text-main shadow-lg'
                      : 'surface-soft border-transparent text-dim hover:text-main'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="h-10 w-10 rounded-2xl bg-rose-500 text-white grid place-items-center">
                      <ArrowDownRight className="w-6 h-6" />
                    </span>
                    {simpleSide === 'SHORT' && <CheckCircle2 className="w-5 h-5 text-loss" />}
                  </div>
                  <div>
                    <p className="font-display font-bold text-base text-main inline-flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4 text-loss" />
                      <span>{isFa ? 'پایین میاد' : 'Going DOWN'}</span>
                    </p>
                    <p className="text-[11px] text-sub mt-0.5">{isFa ? 'اگر قیمت بریزد سود می‌بری' : 'Profit when price drops'}</p>
                  </div>
                </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5 flex flex-col justify-between">
              <p className="text-xs font-extrabold text-sub">
                {isFa ? 'قدم سوم: میزان ریسک و تایید نهایی' : 'Step 3: Safety level & confirm'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'safe' as const, icon: Shield, l: isFa ? 'خیلی امن' : 'Very Safe', s: isFa ? '۳ برابر' : '3×' },
                  { id: 'balanced' as const, icon: Scale, l: isFa ? 'متعادل' : 'Balanced', s: isFa ? '۵ برابر' : '5×' },
                  { id: 'fast' as const, icon: Zap, l: isFa ? 'سریع' : 'Fast', s: isFa ? '۱۰ برابر' : '10×' },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSimpleComfort(c.id)}
                      className={`rounded-2xl p-3 text-center transition ${
                        simpleComfort === c.id ? 'ios-pill-active' : 'surface-soft text-sub'
                      }`}
                    >
                      <p className="text-xs font-black inline-flex items-center justify-center gap-1">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{c.l}</span>
                      </p>
                      <p className="text-[10px] opacity-80 mt-0.5">{c.s}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {[25, 50, 100, 250].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSimpleAmount(amt)}
                    className={`flex-1 py-2 rounded-xl text-xs font-num font-black transition ${
                      simpleAmount === amt ? 'btn-emerald' : 'surface-soft text-dim hover:text-main'
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
                className="btn-cobalt w-full py-4 rounded-2xl text-sm sm:text-base font-black flex items-center justify-center gap-2 shadow-xl"
              >
                <Rocket className="w-4 h-4" />
                <span>{isFa ? 'دلارینو ترید کن برام' : 'Execute Protected Trade'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3. Plain-Language Open & Settled Trades */}
        <section className="panel rounded-[30px] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-xl text-main">
                {simpleTradesTab === 'open'
                  ? isFa ? 'معاملات باز شما الان چطورن؟' : 'Your Active Trades Right Now'
                  : isFa ? 'معاملات تسویه‌شده و سودهای ثبت‌شده' : 'Settled Trades & Realized Results'}
              </h2>
              <p className="text-xs text-dim mt-0.5">
                {simpleTradesTab === 'open'
                  ? isFa ? 'هر زمان که سود را دوست داشتید، فقط با یک دکمه ببندید.' : 'Tap Close & Collect Profit anytime you like.'
                  : isFa ? 'تمام معاملات بسته‌شده ربات با جزئیات دقیق سود و زیان.' : 'Recent settled positions executed by your bot.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="ios-segmented p-1">
                <button
                  type="button"
                  onClick={() => setSimpleTradesTab('open')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${simpleTradesTab === 'open' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? `باز (${data.openTrades.length})` : `Open (${data.openTrades.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setSimpleTradesTab('closed')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${simpleTradesTab === 'closed' ? 'ios-pill-active' : 'text-dim'}`}
                >
                  {isFa ? `تسویه‌شده (${data.closedTrades.length})` : `Settled (${data.closedTrades.length})`}
                </button>
              </div>
              <button type="button" onClick={() => onNavigate('portfolio')} className="btn-ghost px-3.5 py-2 rounded-2xl text-xs font-bold">
                {isFa ? 'همه' : 'All'}
              </button>
            </div>
          </div>

          {simpleTradesTab === 'closed' ? (
            data.closedTrades.length === 0 ? (
              <div className="rounded-3xl surface-soft p-8 text-center text-xs text-dim">
                {isFa ? 'هنوز معامله تسویه‌شده‌ای ثبت نشده است.' : 'No settled trades yet.'}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {data.closedTrades.slice(0, 6).map((t) => {
                  const pnl = Number(t.realized_pnl || 0);
                  const win = pnl >= 0;
                  return (
                    <div key={t.id} className="rounded-3xl surface-soft p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CoinIcon symbol={t.symbol} size={36} />
                        <div>
                          <p className="font-black text-sm text-main">{t.symbol.replace('USDT', '')} · {t.direction}</p>
                          <p className="text-[10px] text-dim">{new Date(t.closed_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                        </div>
                      </div>
                      <span dir="ltr" className={`font-num font-black text-sm ${win ? 'text-jade' : 'text-loss'}`}>
                        {win ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : data.openTrades.length === 0 ? (
            <div className="rounded-3xl surface-soft p-8 text-center space-y-2">
              <p className="text-sm font-bold text-main">
                {isFa ? 'الان هیچ معامله بازی ندارید' : 'No open trades right now'}
              </p>
              <p className="text-xs text-dim">
                {isFa
                  ? 'دکمه سبز «ربات هوشمند رو روشن کن» را بزنید یا از کادر بالا خودتان یک معامله ساده باز کنید.'
                  : 'Turn ON the Smart Auto Bot above or open an Easy 3-Tap trade.'}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {data.openTrades.map((pos) => {
                const pnl = Number(pos.unrealized_pnl || 0);
                const isProfit = pnl >= 0;
                return (
                  <div key={pos.id} className="rounded-3xl surface-soft p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CoinIcon symbol={pos.symbol} size={40} />
                      <div>
                        <p className="font-black text-sm text-main flex items-center gap-1.5">
                          <span>{pos.symbol.replace('USDT', '')}</span>
                          <span className="text-xs font-bold text-dim inline-flex items-center gap-1">
                            {pos.direction === 'LONG' ? <TrendingUp className="w-3.5 h-3.5 text-jade" /> : <TrendingDown className="w-3.5 h-3.5 text-loss" />}
                            {pos.direction === 'LONG' ? (isFa ? 'بالا میره' : 'UP') : isFa ? 'پایین میاد' : 'DOWN'}
                          </span>
                        </p>
                        <p className={`text-xs font-black mt-0.5 ${isProfit ? 'text-jade' : 'text-loss'}`}>
                          {isProfit
                            ? isFa ? `در حال سود: +$${pnl.toFixed(2)}` : `Profit: +$${pnl.toFixed(2)}`
                            : isFa ? `در نوسان: -$${Math.abs(pnl).toFixed(2)}` : `-${Math.abs(pnl).toFixed(2)} USD`}
                        </p>
                        <p className="text-[10px] text-dim mt-0.5 inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-jade" />
                          <span>{pos.risk_free_active ? (isFa ? 'بدون ریسک شد (Risk-Free)' : 'Risk-Free Protected') : isFa ? 'سپر ضرر فعال' : 'Stop-Loss Protected'}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(pos.id)}
                      className={`px-4 py-2.5 rounded-2xl text-xs font-black shrink-0 inline-flex items-center gap-1.5 ${isProfit ? 'btn-emerald' : 'bg-rose-500 text-white'}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isProfit ? (isFa ? 'برداشت سود' : 'Collect') : isFa ? 'بستن معامله' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. Pro Mode Upgrade Invitation */}
        {onToggleUiMode && (
          <section className="panel rounded-[28px] p-5 flex flex-wrap items-center justify-between gap-4 border border-[var(--line-strong)]">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-main">
                  {isFa ? 'معامله‌گر حرفه‌ای هستی؟' : 'Want Full Pro Quant Controls?'}
                </h3>
                <p className="text-xs text-sub mt-0.5">
                  {isFa
                    ? 'چارت کندلی حرفه‌ای، چارت AI، ۶ استراتژی، رادار کل بازار، بک‌تستر ۹۰۰ کندلی و اتصال صرافی Toobit/KCEX را باز کن!'
                    : 'Unlock Pro Candlestick Terminal, Chart AI, 6 Strategies, Market Radar, 900-Candle Backtester & Live APIs!'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                tgHaptic('medium');
                onToggleUiMode('pro');
              }}
              className="btn-cobalt px-5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isFa ? 'باز کردن حالت حرفه‌ای' : 'Switch to Pro Mode'}</span>
            </button>
          </section>
        )}

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
                <div dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-main mt-1">
                  {hideBal ? '••••••' : <AnimatedNumber value={totalEq} format={(n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />}
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
                { icon: Wallet, l: isFa ? 'موجودی آزاد' : 'Free Cash', v: hideBal ? '•••' : `$${freeBal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, cls: 'text-jade' },
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
                  ${Number(btc.lastPrice).toLocaleString()}
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
