import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Hand,
  KeyRound,
  Layers,
  Power,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Wallet,
  WandSparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { type Timeframe } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import { formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo, DashboardPayload, NavTab, OpenTradeRow } from '../lib/types';
import { WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { AnimatedNumber, AreaChart, ConsensusGauge, LiveDot, Sparkline } from '../components/DollarinoViz';
import { QuickWidgetsBar } from '../components/QuickWidgetsBar';
import { PromoBannerCarousel } from '../components/PromoBannerCarousel';
import { SetupWizardModal } from '../components/SetupWizardModal';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { TrustWalletConnectInline } from '../components/TrustWalletConnectInline';
import { WeeklyCardPage } from './WeeklyCardPage';

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
  { key: 'ai_autonomous_agent', labelFa: 'هوش مصنوعی دلارینو (Multi-AI)', labelEn: 'Dollarino Multi-AI' },
  { key: 'my_custom_ai', labelFa: 'هوش مصنوعی شخصی (قابل آموزش)', labelEn: 'Raw Personal AI (Trainable)' },
  { key: 'dollarino_v01', labelFa: 'استراتژی شکار · دُرنا V1 (آماده)', labelEn: 'Hunting · Dorna V1 (Preset)' },
  { key: 'kbos_v11', labelFa: 'استراتژی شکار · KBOS Super v11', labelEn: 'Hunting · KBOS Super v11 (Preset)' },
  { key: 'sp2l', labelFa: 'استراتژی شکار · شکار نقدینگی SP2L', labelEn: 'Hunting · SP2L (Preset)' },
  { key: 'ema_trend_pullback', labelFa: 'استراتژی شکار · مومنتوم روند EMA', labelEn: 'Hunting · EMA Momentum' },
  { key: 'signal_mixer', labelFa: 'استراتژی شکار · میکسر ۸ کاناله', labelEn: 'Hunting · 8-Ch Mixer' },
  { key: 'copy_trade', labelFa: 'کپی‌ترید تاییدشده دلارینو', labelEn: 'Verified Copy Trade' },
] as const;

interface AiScanResultItem {
  symbol: string;
  timeframe: string;
  ok: boolean;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confidence: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  rrRatio: number;
  thesis: string;
  executed?: boolean;
  executeNote?: string;
}

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
  onOpenAcademy,
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
  onOpenAcademy?: () => void;
  onUpgradeUser?: (u: AuthUserInfo) => void;
}) {
  const isFa = lang === 'fa';
  const isRunning = data.config.bot_state.startsWith('RUNNING');
  void user;

  const [hideBal, setHideBal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  // Inline Edit TP/SL state
  const [editPos, setEditPos] = useState<OpenTradeRow | null>(null);
  const [editForm, setEditForm] = useState({ stopLoss: '', tp1: '', tp2: '', tp3: '' });

  const [simpleTradesTab, setSimpleTradesTab] = useState<'open' | 'closed'>('open');
  const [aiScanBusy, setAiScanBusy] = useState(false);
  const [aiScanResults, setAiScanResults] = useState<AiScanResultItem[]>([]);

  // Single-page Simple Mode states (zero jumping away!)
  const deriveModelFromStrategy = (sk: string): 'ai' | 'myai' | 'hunting' | 'copy' => {
    if (sk === 'ai_autonomous_agent') return 'ai';
    if (sk === 'my_custom_ai') return 'myai';
    if (sk === 'copy_trade') return 'copy';
    return 'hunting';
  };
  const [simpleModel, setSimpleModel] = useState<'ai' | 'myai' | 'hunting' | 'copy'>(() =>
    deriveModelFromStrategy(data.config.strategy_key || 'ai_autonomous_agent')
  );
  useEffect(() => {
    setSimpleModel(deriveModelFromStrategy(data.config.strategy_key || 'ai_autonomous_agent'));
  }, [data.config.strategy_key]);
  const [trustDrawerOpen, setTrustDrawerOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [siteTraders, setSiteTraders] = useState<Array<{
    id: string;
    display_name: string;
    specialty: string;
    win_rate: number;
    roi_30d_pct: number;
    followers_count: number;
    is_following?: boolean;
  }>>([]);

  useEffect(() => {
    if (simpleModel === 'copy' && siteTraders.length === 0) {
      apiFetch<{ traders: typeof siteTraders }>('/api/copy-trade/traders')
        .then((res) => setSiteTraders(res.traders || []))
        .catch(() => {});
    }
  }, [simpleModel, siteTraders.length]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('dollarino_onboarding_dismissed_v1') === '1';
    } catch {
      return false;
    }
  });
  const dismissOnboarding = () => {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem('dollarino_onboarding_dismissed_v1', '1');
    } catch {
      /* ignore */
    }
  };

  const runAiInstantScan = async (autoExecute = false) => {
    setAiScanBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; results: AiScanResultItem[] }>('/api/trading/ai-scan-now', {
        method: 'POST',
        body: JSON.stringify({
          timeframe: data.config.entry_timeframe || '15m',
          autoExecute,
        }),
      });
      setAiScanResults(res.results || []);
      const executedCount = (res.results || []).filter((r) => r.executed).length;
      const actionable = (res.results || []).filter((r) => r.action === 'LONG' || r.action === 'SHORT').length;
      setNotice(
        autoExecute && executedCount > 0
          ? isFa
            ? `${executedCount} معامله هوشمند با AI هم‌اکنون باز شد.`
            : `${executedCount} AI trade(s) executed live.`
          : isFa
            ? `اسکن هوش مصنوعی روی ۵ نماد اصلی انجام شد (${actionable} سیگنال فعال کشف شد).`
            : `AI scan finished across 5 top pairs (${actionable} actionable setups).`
      );
      if (autoExecute && executedCount > 0) await onRefresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'AI Scan Error');
    } finally {
      setAiScanBusy(false);
    }
  };

  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total || freeBal + usedBal);
  const liveIranIrt = data.iranRate?.usdtIrt || 74500;
  const unrealized = data.openTrades.reduce((s, t) => s + Number(t.unrealized_pnl || 0), 0);
  const todayPnl = Number(data.stats.todayPnl ?? data.stats.totalPnl ?? 0) + unrealized;
  const activeStrategy = data.config.strategy_key || 'dollarino_v01';
  const scanScope = data.config.scan_scope || 'ALL_MARKET';
  const execMode = data.config.trade_execution_mode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO';

  const resetConfigToDefaults = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/trading/config/reset-defaults', {
        method: 'POST',
      });
      toastMsg(res.message || (isFa ? 'تنظیمات به حالت پیش‌فرض دلارینو بازگشت ✅' : 'Restored Dollarino defaults ✅'));
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reset failed', true);
    } finally {
      setBusy(false);
    }
  };

  const switchTrustExecution = async (next: { executionMode?: 'AUTO' | 'MANUAL_CONFIRM'; tradingMode?: 'PAPER' | 'LIVE' }) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          executionMode: next.executionMode ?? execMode,
          tradingMode: next.tradingMode ?? data.config.trading_mode,
          syncCopyRules: true,
        }),
      });
      toastMsg(res.message);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Mode update failed', true);
      if (e instanceof Error && e.message.includes('Trust Wallet')) {
        setTrustDrawerOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const executeScanSetupInline = async (item: AiScanResultItem) => {
    if (item.action !== 'LONG' && item.action !== 'SHORT') return;
    setBusy(true);
    try {
      await apiFetch('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol: item.symbol,
          direction: item.action,
          orderType: 'MARKET',
          marketType: data.config.market_type || 'FUTURES',
          leverage: Math.min(data.config.max_leverage || 10, item.leverage || 5),
          marginPct: data.config.margin_pct || 5,
          stopLoss: String(item.stopLoss),
          tp1: String(item.tp1),
          tp2: String(item.tp2),
          tp3: String(item.tp3),
          timeframe: item.timeframe || data.config.entry_timeframe || '15m',
        }),
      });
      toastMsg(isFa ? `پوزیشن ${item.symbol} (${item.action}) با موفقیت باز شد!` : `${item.symbol} ${item.action} opened!`);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Order failed', true);
    } finally {
      setBusy(false);
    }
  };

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

  const equityPoints = useMemo(() => {
    const raw = data.charts.equityCurve || [];
    const pts =
      raw.length >= 2
        ? raw.map((p) => ({
            time: p.time,
            label: p.label,
            equity: Number(p.equity || 0),
          }))
        : [
            { time: Math.floor(Date.now() / 1000) - 3600, label: 'Start', equity: totalEq },
            { time: Math.floor(Date.now() / 1000), label: 'Now', equity: totalEq },
          ];
    return pts.slice(-24);
  }, [data.charts.equityCurve, totalEq]);

  const equitySeries = useMemo(() => equityPoints.map((p) => p.equity), [equityPoints]);

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
      const res = await apiFetch<{
        config?: unknown;
        switchedFrom?: { cancelledCopyCount?: number; stoppedBot?: boolean; disabledMyAi?: boolean } | null;
        error?: string;
      }>('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.error) toastMsg(res.error, true);
      else if (okMsg) {
        const extra =
          (res.switchedFrom?.cancelledCopyCount ?? 0) > 0
            ? isFa
              ? ' (کپی‌ترید قبلی برای جلوگیری از تداخل متوقف شد)'
              : ' (previous copy-trade stopped)'
            : '';
        toastMsg(`${okMsg}${extra}`);
      }
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

  const handleKillSwitch = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/bot/kill-switch', { method: 'POST' });
      toastMsg(isFa ? 'توقف اضطراری (Kill Switch) اجرا و ربات متوقف شد' : 'Kill Switch activated');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Kill switch failed', true);
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
      toastMsg(isFa ? 'همگام‌سازی پوزیشن‌ها با Trust Wallet انجام شد' : 'Positions reconciled with Trust Wallet');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reconcile failed', true);
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

      {cardModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm overflow-y-auto p-3 sm:p-6" onClick={() => setCardModalOpen(false)}>
            <div className="max-w-5xl mx-auto panel rounded-[28px] p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b hairline pb-3">
                <h3 className="font-display font-bold text-base sm:text-lg text-main">
                  {isFa ? 'صدور کارت سود تاییدشده دلارینو (بدون خروج از صفحه)' : 'Dollarino Verified Profit Card'}
                </h3>
                <button type="button" onClick={() => setCardModalOpen(false)} className="btn-ghost p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <WeeklyCardPage lang={lang} username={user.username} data={data} />
            </div>
          </div>,
          document.body
        )}

      {editPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditPos(null)}>
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
          </div>,
          document.body
        )}

      {stopConfirmOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setStopConfirmOpen(false)}>
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
          </div>,
          document.body
        )}
    </>
  );

  if (uiMode === 'simple') {
    const activeExLabel =
      data.config.trading_mode === 'LIVE'
        ? isFa
          ? 'پول واقعی (Trust Wallet)'
          : 'Real Money (Trust Wallet)'
        : isFa
          ? 'پول آزمایشی رایگان ($10K)'
          : 'Free Practice ($10K)';

    const feeEnf = data.serverFeeSummary?.enforcement;
    const isCustomProMode =
      activeStrategy === 'my_custom_ai' ||
      (activeStrategy !== 'ai_autonomous_agent' && activeStrategy !== 'dollarino_v01' && activeStrategy !== 'copy_trade');

    const beginnerOptions = [
      {
        id: 'ai' as const,
        img: '/images/transparent/ai-brain-3d.png',
        badge: isFa ? 'پیشنهادی' : 'RECOMMENDED',
        title: isFa ? '۱. هوش مصنوعی هوشمند' : '1. Smart AI Autopilot',
        desc: isFa
          ? 'خودش ۲۴ ساعته قیمت ارزها را می‌بیند و بهترین موقعیت را می‌خرد.'
          : 'Watches all coins 24/7 and picks clean trades automatically.',
        active: simpleModel === 'ai',
        onSelect: () => {
          setSimpleModel('ai');
          void patchConfig({ strategy_key: 'ai_autonomous_agent', ai_gate_enabled: 1 }, isFa ? 'ربات روی هوش مصنوعی هوشمند قرار گرفت' : 'Smart AI selected');
        },
      },
      {
        id: 'hunting' as const,
        img: '/images/transparent/mascot-astronaut.png',
        badge: isFa ? 'آماده و تست‌شده' : 'READY PRESET',
        title: isFa ? '۲. روش آماده دلارینو' : '2. Dollarino Ready Plan',
        desc: isFa
          ? 'بهترین تنظیمات آماده تیم دلارینو؛ مناسب شروع سریع بدون هیچ دانش قبلی.'
          : 'Pre-tuned strategy built by Dollarino — zero knowledge needed.',
        active: simpleModel === 'hunting' || simpleModel === 'myai',
        onSelect: () => {
          setSimpleModel('hunting');
          if (activeStrategy === 'ai_autonomous_agent' || activeStrategy === 'copy_trade') {
            void patchConfig({ strategy_key: 'dollarino_v01', ai_gate_enabled: 0 }, isFa ? 'روش آماده دلارینو انتخاب شد' : 'Ready Plan selected');
          }
        },
      },
      {
        id: 'copy' as const,
        img: '/images/transparent/trophy-copy-3d.png',
        badge: isFa ? 'کپی از برترین‌ها' : 'COPY PROS',
        title: isFa ? '۳. کپی از حرفه‌ای‌ها' : '3. Copy Top Traders',
        desc: isFa
          ? 'حرفه‌ای‌های تاییدشده هرچه خریدند، دقیقاً همان برای تو کپی شود.'
          : 'Automatically mirror verified top-performing traders.',
        active: simpleModel === 'copy',
        onSelect: () => {
          setSimpleModel('copy');
        },
      },
    ];

    return (
      <div className="space-y-5 max-w-5xl mx-auto">
        {notice && (
          <div className="p-3.5 rounded-2xl badge-signal text-xs font-extrabold flex items-center justify-between">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</span>
            <button type="button" onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs font-extrabold text-loss flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Fee Lock / Warning Banner (Visible when user approaches or hits 5% server fee deadline) */}
        {feeEnf && (feeEnf.lockStatus === 'LOCKED' || feeEnf.lockStatus === 'WARNING') && (
          <div
            className={`rounded-3xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
              feeEnf.lockStatus === 'LOCKED'
                ? 'bg-rose-500/15 border-rose-500/40'
                : 'bg-amber-500/15 border-amber-500/40'
            }`}
          >
            <div className="space-y-0.5">
              <p className="font-black text-main">
                {feeEnf.lockStatus === 'LOCKED'
                  ? isFa
                    ? `🔒 ترید واقعی تا تسویه کارمزد ۵٪ ($${feeEnf.totalDueUsd.toFixed(2)}) متوقف شد`
                    : `🔒 Live trading locked until $${feeEnf.totalDueUsd.toFixed(2)} fee settlement`
                  : isFa
                    ? `⏳ مهلت تسویه کارمزد ۵٪: ${feeEnf.hoursRemaining ?? 72} ساعت فرصت دارید ($${feeEnf.totalDueUsd.toFixed(2)})`
                    : `⏳ Settlement deadline: ${feeEnf.hoursRemaining ?? 72}h left ($${feeEnf.totalDueUsd.toFixed(2)})`}
              </p>
              <p className="text-sub">
                {isFa
                  ? 'پول آزمایشی $10,000 همیشه رایگان فعال است. برای ادامه ترید واقعی، کارمزد را تسویه کنید.'
                  : 'Free $10,000 practice remains open. Settle via Trust Wallet to keep LIVE trading active.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-black shrink-0"
            >
              {isFa ? '💳 تسویه سریع کارمزد' : '💳 Settle Fee'}
            </button>
          </div>
        )}

        {/* 1. SUPER SIMPLE HERO BALANCE CARD (ZERO JARGON!) */}
        <section className="ios-wallet-card rounded-[30px] p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1.5 backdrop-blur-md ${
                  isRunning
                    ? 'bg-emerald-400/25 text-emerald-100 border border-emerald-300/35'
                    : 'bg-white/15 text-white border border-white/25'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isRunning ? 'bg-emerald-300 live-dot' : 'bg-amber-300'}`} />
                <span>{isRunning ? (isFa ? 'ربات روشن است و کار می‌کند' : 'Bot is Active') : isFa ? 'آماده شروع' : 'Ready to Start'}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-extrabold text-white border border-white/25 inline-flex items-center gap-1.5">
                <WalletLogo wallet="trustwallet" size={16} />
                <span>{activeExLabel}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHideBal((v) => !v)}
                className="ios-glass-btn p-2 rounded-full"
                aria-label="Toggle balance"
              >
                {hideBal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {onOpenAcademy && (
                <button
                  type="button"
                  onClick={onOpenAcademy}
                  className="ios-glass-btn px-3 py-1.5 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                >
                  <span>🎓 {isFa ? 'آموزش تصویری (خیلی ساده)' : 'Easy Guide'}</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetConfigToDefaults()}
                className="ios-glass-btn px-3 py-1.5 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                title={isFa ? 'بازگشت به بهترین تنظیمات پیشنهادی دلارینو' : 'Reset to Dollarino Defaults'}
              >
                <span>🔄 {isFa ? 'تنظیمات پیشنهادی' : 'Best Defaults'}</span>
              </button>
              {onToggleUiMode && (
                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('medium');
                    onToggleUiMode('pro');
                  }}
                  className="ios-glass-btn px-3 py-1.5 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isFa ? 'حالت حرفه‌ای' : 'Pro Mode'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-5 items-end">
            <div className="lg:col-span-7 space-y-3">
              <p className="text-xs font-bold text-white/80">
                {isFa ? 'موجودی حساب شما' : 'Your Account Balance'}
              </p>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-white tracking-tight font-num drop-shadow">
                  {hideBal ? '••••••' : `$${totalEq.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                </span>
                {!hideBal && isFa && (
                  <span className="text-base sm:text-lg font-black text-amber-200">
                    ({formatTomanEq(totalEq, liveIranIrt)} تومان)
                  </span>
                )}
              </div>
              {!hideBal && (
                <p className="text-xs text-white/85 font-semibold leading-relaxed">
                  {isFa
                    ? `نرخ تتر امروز: ${liveIranIrt.toLocaleString('en-US')} تومان · بدون اشتراک ماهانه (۹۵٪ سود برای شما · فقط ۵٪ کارمزد سرور)`
                    : `Live rate: ${liveIranIrt.toLocaleString('en-US')} Toman · 100% Free (5% fee only on real profit)`}
                </p>
              )}

              {/* Simple 2-Choice Money Switch + Auto/Ask Switch */}
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="inline-flex p-1 rounded-2xl bg-black/30 backdrop-blur-md border border-white/20 text-[11px] font-black">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'PAPER' })}
                    className={`px-3.5 py-1.5 rounded-xl transition ${
                      data.config.trading_mode === 'PAPER' ? 'ios-glass-gold-btn' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {isFa ? '🎮 پول آزمایشی ($10,000 رایگان)' : '🎮 Free Practice ($10K)'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'LIVE' })}
                    className={`px-3.5 py-1.5 rounded-xl transition ${
                      data.config.trading_mode === 'LIVE' ? 'ios-glass-emerald-btn' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {isFa ? '🛡 پول واقعی (Trust Wallet)' : '🛡 Real Trust Wallet'}
                  </button>
                </div>

                <div className="inline-flex p-1 rounded-2xl bg-black/30 backdrop-blur-md border border-white/20 text-[11px] font-black">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ executionMode: 'AUTO' })}
                    className={`px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1 ${
                      execMode === 'AUTO' ? 'ios-glass-emerald-btn' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>{isFa ? 'خودکار ۲۴ ساعته' : 'Auto 24/7'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ executionMode: 'MANUAL_CONFIRM' })}
                    className={`px-3 py-1.5 rounded-xl transition inline-flex items-center gap-1 ${
                      execMode === 'MANUAL_CONFIRM' ? 'ios-glass-gold-btn' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Hand className="w-3 h-3" />
                    <span>{isFa ? 'قبلش بپرسه' : 'Ask First'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="ios-glass-stat rounded-2xl p-3 text-center">
                  <p className="text-[11px] text-white/75 font-bold">{isFa ? 'معاملات در حال انجام' : 'Active Trades'}</p>
                  <p dir="ltr" className="font-num font-black text-base text-white mt-0.5">{data.openTrades.length}</p>
                </div>
                <div className="ios-glass-stat rounded-2xl p-3 text-center">
                  <p className="text-[11px] text-white/75 font-bold">{isFa ? 'سود امروز' : 'Today'}</p>
                  <p dir="ltr" className={`font-num font-black text-base mt-0.5 ${todayPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {todayPnl >= 0 ? `+$${todayPnl.toFixed(2)}` : `-$${Math.abs(todayPnl).toFixed(2)}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  tgHaptic('medium');
                  if (isRunning) {
                    setStopConfirmOpen(true);
                    return;
                  }
                  setBusy(true);
                  try {
                    const targetStrategy =
                      activeStrategy === 'copy_trade' || !activeStrategy
                        ? 'ai_autonomous_agent'
                        : activeStrategy;
                    await apiFetch('/api/trading/config', {
                      method: 'PATCH',
                      body: JSON.stringify({
                        strategy_key: targetStrategy,
                        ai_gate_enabled: targetStrategy === 'ai_autonomous_agent' || targetStrategy === 'my_custom_ai' ? 1 : 0,
                        auto_scan_top: 1,
                        scan_scope: 'ALL_MARKET',
                      }),
                    });
                    await apiFetch('/api/trading/bot/start', {
                      method: 'POST',
                      body: JSON.stringify({
                        strategyKey: targetStrategy,
                        scanScope: 'ALL_MARKET',
                        tradeExecutionMode: execMode,
                      }),
                    });
                    tgNotifyHaptic('success');
                    toastMsg(isFa ? 'عالی! ربات با موفقیت روشن شد ✅' : 'Awesome! Bot started ✅');
                    await onRefresh();
                  } catch (e) {
                    toastMsg(e instanceof Error ? e.message : 'Start failed', true);
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`w-full py-4 px-4 rounded-2xl text-sm inline-flex items-center justify-center gap-2 font-black ${
                  isRunning ? 'bg-rose-500/95 hover:bg-rose-600 text-white border border-rose-300/40' : 'ios-glass-emerald-btn'
                }`}
              >
                <Power className="w-5 h-5 shrink-0" />
                <span>
                  {busy
                    ? '...'
                    : isRunning
                      ? isFa ? 'خاموش کردن ربات' : 'Stop Bot'
                      : isFa ? 'روشن کردن ربات خودکار' : 'Start Auto Bot'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTrustDrawerOpen((v) => !v)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 ${
                    trustDrawerOpen ? 'ios-glass-gold-btn' : 'ios-glass-btn'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اتصال کیف‌پول Trust' : 'Connect Wallet'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCardModalOpen(true)}
                  className="ios-glass-btn py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isFa ? 'ساخت کارت سود' : 'Profit Card'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Expandable Inline Trust Wallet Drawer */}
        {trustDrawerOpen && (
          <section className="panel rounded-[26px] p-4 sm:p-5 border border-sky-500/30 space-y-3 tab-enter">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-sm sm:text-base text-main flex items-center gap-2">
                <WalletLogo wallet="trustwallet" size={22} />
                <span>{isFa ? 'اتصال ساده کیف‌پول Trust Wallet (برای ترید واقعی)' : 'Simple Trust Wallet Setup'}</span>
              </h2>
              <button type="button" onClick={() => setTrustDrawerOpen(false)} className="btn-ghost p-1.5 rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>
            <TrustWalletConnectInline lang={lang} onMsg={toastMsg} onRefresh={onRefresh} />
          </section>
        )}

        {/* 2. STEP 1: HOW SHOULD THE BOT TRADE FOR YOU? (3 CRYSTAL-CLEAR VISUAL CARDS) */}
        <section className="panel rounded-[28px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa ? 'قدم ۱: انتخاب کن ربات چطور معامله کند' : 'Step 1: Choose How the Bot Trades'}
              </h2>
              <p className="text-xs text-dim mt-0.5">
                {isFa
                  ? 'اگر تازه‌کار هستی، همان گزینه اول (هوش مصنوعی هوشمند) بهترین انتخاب است!'
                  : 'New to trading? Option 1 (Smart AI) is pre-tuned for beginners!'}
              </p>
            </div>
            {isCustomProMode && (
              <span className="text-[11px] font-black px-3 py-1 rounded-full bg-amber-500/15 text-[#D97706] dark:text-[#FBBF24]">
                {isFa ? '✓ تنظیمات دلخواه حالت حرفه‌ای شما حفظ شده است' : '✓ Custom Pro selection preserved'}
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3.5">
            {beginnerOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={opt.onSelect}
                className={`p-4 rounded-3xl border text-start transition flex items-start gap-3.5 ${
                  opt.active
                    ? 'border-[#059669] bg-emerald-500/10 ring-1 ring-[#059669]/40'
                    : 'surface-soft border-transparent hover:border-[var(--line-strong)]'
                }`}
              >
                <img src={opt.img} alt={opt.title} className="w-14 h-14 object-contain shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/15 text-[#0D47A1] dark:text-[#60A5FA]">
                      {opt.badge}
                    </span>
                    {opt.active && <CheckCircle2 className="w-4 h-4 text-[#059669] dark:text-[#34D399] shrink-0" />}
                  </div>
                  <p className="text-sm font-black text-main">{opt.title}</p>
                  <p className="text-xs text-dim leading-relaxed">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Simple Controls for the Chosen Mode */}
          <div className="pt-4 border-t hairline space-y-4">
            {simpleModel === 'copy' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-black text-main">
                    {isFa ? 'تریدرهای برتر تاییدشده (فقط دکمه کپی کن را بزن):' : 'Top Verified Traders (Click Copy):'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('copy')}
                    className="text-xs font-black text-[#0D47A1] dark:text-[#60A5FA] hover:underline"
                  >
                    {isFa ? 'مشاهده ولت‌های نهنگ و تنظیمات بیشتر →' : 'Explore Whale Wallets →'}
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {siteTraders.slice(0, 6).map((t) => (
                    <div key={t.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-main truncate">✅ {t.display_name}</p>
                        <p className="text-[11px] text-dim truncate">
                          {isFa ? `موفقیت ${t.win_rate}% · سود ماهانه +${t.roi_30d_pct}%` : `WR ${t.win_rate}% · +${t.roi_30d_pct}%`}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await apiFetch('/api/copy-trade/follow', {
                              method: 'POST',
                              body: JSON.stringify({ traderId: t.id }),
                            });
                            setSiteTraders((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_following: !x.is_following } : x)));
                            toastMsg(isFa ? `کپی برای ${t.display_name} تغییر کرد ✅` : `Updated ${t.display_name}`);
                            await onRefresh();
                          } catch (e) {
                            toastMsg(e instanceof Error ? e.message : 'Follow failed', true);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 ${
                          t.is_following ? 'bg-[#059669] text-white' : 'bg-[#0D47A1] text-white'
                        }`}
                      >
                        {t.is_following ? (isFa ? 'در حال کپی ✓' : 'Copying ✓') : isFa ? 'کپی کن' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-black text-main">
                  {isFa ? 'قدم ۲: چقدر محتاط یا سریع معامله کند؟' : 'Step 2: Choose Safety & Speed Level:'}
                </p>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {RISK_PRESETS.map((p) => {
                    const active = currentPresetId === p.id;
                    const friendlyTitle =
                      p.id === 'conservative'
                        ? isFa ? '🛡 خیلی ایمن و آروم (مناسب مبتدی)' : '🛡 Super Safe'
                        : p.id === 'balanced'
                          ? isFa ? '⚖️ متعادل و استاندارد (پیشنهادی)' : '⚖️ Balanced'
                          : isFa ? '⚡ پرسرعت و جسور' : '⚡ Fast';
                    const friendlyDesc =
                      p.id === 'conservative'
                        ? isFa ? 'معامله با ۲٪ پول، محافظت حداکثری سرمایه' : '2% per trade, maximum safety'
                        : p.id === 'balanced'
                          ? isFa ? 'تعادل عالی بین سود و امنیت (بهترین گزینه)' : 'Best balance of growth and safety'
                          : isFa ? 'معاملات بزرگ‌تر و سریع‌تر برای حرفه‌ای‌ترها' : 'Larger size for faster moves';
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
                              risk_profile_json: { preset: p.id },
                            },
                            isFa ? `سطح سرعت/امنیت ذخیره شد ✅` : `${p.titleEn} saved`
                          )
                        }
                        className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                          active ? 'border-[#059669] bg-emerald-500/12' : 'surface-soft border-transparent hover:border-[var(--line-strong)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-main">{friendlyTitle}</span>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#059669]" />}
                        </div>
                        <p className="text-[11px] text-dim">{friendlyDesc}</p>
                      </button>
                    );
                  })}
                </div>
                {data.config.last_ai_reason && (
                  <div className="rounded-2xl p-3.5 surface-soft border hairline text-xs text-sub flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-[#0D47A1] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black text-main">{isFa ? 'گزارش ساده ربات: ' : 'Bot Note: '}</span>
                      <span>
                        {isFa
                          ? data.config.last_ai_reason
                              .replace(/\[[^\]]*\]/g, '')
                              .replace(/\b(?:KBOS|SP2L|EMA|RSI|ATR|LONG|SHORT)\b/gi, '')
                              .replace(/\s{2,}/g, ' ')
                              .trim() || 'هوش مصنوعی بازار را بررسی کرد و آماده انتخاب بهترین موقعیت است.'
                          : data.config.last_ai_reason.replace(/\[[^\]]*\]/g, '').trim()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 3. ULTRA-CLEAN OPEN TRADES & HISTORY (PLAIN LANGUAGE WITH TOMAN!) */}
        <section className="panel rounded-[26px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="ios-segmented p-1">
              <button
                type="button"
                onClick={() => setSimpleTradesTab('open')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black ${simpleTradesTab === 'open' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? `معاملات فعال الان (${data.openTrades.length})` : `Active Now (${data.openTrades.length})`}
              </button>
              <button
                type="button"
                onClick={() => setSimpleTradesTab('closed')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black ${simpleTradesTab === 'closed' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? `معاملات قبلی (${data.closedTrades.length})` : `History (${data.closedTrades.length})`}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void reconcilePositions()} disabled={busy} className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بروزرسانی' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {simpleTradesTab === 'closed' ? (
            data.closedTrades.length === 0 ? (
              <p className="text-center py-6 text-xs text-dim">{isFa ? 'هنوز معامله‌ای بسته نشده است.' : 'No finished trades yet.'}</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.closedTrades.slice(0, 9).map((t) => {
                  const pnl = Number(t.realized_pnl || 0);
                  const win = pnl >= 0;
                  return (
                    <div key={t.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoinIcon symbol={t.symbol} size={32} />
                        <div className="min-w-0">
                          <p className="font-black text-xs text-main truncate">
                            {t.symbol.replace('USDT', '')} · {win ? (isFa ? 'سود' : 'Win') : isFa ? 'بسته‌شده' : 'Closed'}
                          </p>
                          <p className="text-[10.5px] text-dim">{new Date(t.closed_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <p dir="ltr" className={`font-num font-black text-xs ${win ? 'text-[#059669] dark:text-[#34D399]' : 'text-loss'}`}>
                          {win ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                        </p>
                        <p className="text-[10px] text-dim">{formatTomanEq(Math.abs(pnl), liveIranIrt)} ت</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : data.openTrades.length === 0 ? (
            <div className="surface-soft rounded-3xl p-6 text-center flex flex-col items-center gap-3 border hairline">
              <img src="/images/transparent/piggy-wallet-3d.png" alt="Ready" className="w-16 h-16 object-contain" />
              <p className="text-xs sm:text-sm font-black text-main">
                {isRunning
                  ? isFa
                    ? 'ربات روشن است و دارد بهترین ارزها را برای خرید بررسی می‌کند...'
                    : 'Bot is scanning coins for the safest entry...'
                  : isFa
                    ? 'همه‌چیز آماده است! فقط دکمه سبز «روشن کردن ربات خودکار» را در بالای صفحه بزن.'
                    : 'All ready! Tap the green Start button above to launch.'}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {data.openTrades.map((pos) => {
                const pnl = Number(pos.unrealized_pnl || 0);
                const isProfit = pnl >= 0;
                return (
                  <div key={pos.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CoinIcon symbol={pos.symbol} size={34} />
                      <div className="min-w-0">
                        <p className="font-black text-xs text-main truncate">
                          {pos.symbol.replace('USDT', '')} · {pos.direction === 'LONG' ? (isFa ? 'خرید خودکار' : 'Auto Buy') : isFa ? 'فروش خودکار' : 'Auto Sell'}
                        </p>
                        <p dir="ltr" className={`text-xs font-black font-num ${isProfit ? 'text-[#059669] dark:text-[#34D399]' : 'text-loss'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}{' '}
                          <span className="text-[10px] text-dim font-normal">({formatTomanEq(Math.abs(pnl), liveIranIrt)} ت)</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePosition(pos.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 ${
                        isProfit ? 'bg-[#059669] hover:bg-[#047857] text-white' : 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                      }`}
                    >
                      {isProfit ? (isFa ? 'برداشت سود' : 'Take Profit') : isFa ? 'بستن معامله' : 'Close'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. PROMO BANNERS & QUICK UPGRADE TO PRO */}
        <PromoBannerCarousel lang={lang} placement="DASHBOARD" onNavigateTab={onNavigate} />

        {onToggleUiMode && (
          <button
            type="button"
            onClick={() => {
              tgHaptic('medium');
              onToggleUiMode('pro');
            }}
            className="w-full panel hover:bg-[var(--soft)] rounded-2xl p-4 border hairline flex items-center justify-between gap-3 text-start transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0D47A1] text-white grid place-items-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="font-display font-bold text-sm text-main">{isFa ? 'ورود به میز حرفه‌ای (Pro Desk)' : 'Open Pro Workspace'}</p>
                <p className="text-xs text-dim">
                  {isFa ? 'چارت زنده، اندیکاتورها و آلرت رایگان TradingView، کپی‌ترید نهنگ‌ها و کدنویسی استراتژی' : 'Live Charts, Free TradingView Alerts, Whale Copy & IDE'}
                </p>
              </div>
            </div>
            {isFa ? <ChevronLeft className="w-5 h-5 text-dim shrink-0" /> : <ChevronRight className="w-5 h-5 text-dim shrink-0" />}
          </button>
        )}

        {renderSharedModals()}
      </div>
    );
  }

  return (
    <div className="space-y-6 tab-enter">
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

      {/* 1. Signature Overview Hero + Live Royal Blue & Gold 3D Glass Equity Card */}
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
                  ? 'میز آماده Trust Wallet و شبیه‌ساز دمو · ۲۴ ساعته'
                  : 'TRUST WALLET & SIMULATOR DESK · READY'}
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
              ? 'اتصال انحصاری به Trust Wallet + شبیه‌ساز دمو ۱۰k: هر ۴ موتور هوشمند با انتخاب «تایید دستی» یا «تمام‌اتوترید ۲۴/۷» تا ۲۰ پوزیشن را همزمان مدیریت می‌کنند.'
              : 'Exclusive Trust Wallet + $10k Simulator desk: deploy 4 engines with Manual 1-Click Approval or Full 24/7 Autonomous Auto-Trade.'}
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

            <button
              type="button"
              disabled={busy}
              onClick={() => void resetConfigToDefaults()}
              className="btn-ghost inline-flex items-center gap-1.5 font-bold px-4 py-3.5 rounded-2xl text-xs"
            >
              <span>🔄 {isFa ? 'بازگشت به پیش‌فرض (همگام با ساده)' : 'Reset Defaults (Synced)'}</span>
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

        {/* Live Royal Blue & Gold 3D Glass Wallet & Equity Card */}
        <div className="relative">
          <div className="ios-wallet-card rounded-[28px] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-white/85">
                <LiveDot size={7} color={isRunning ? '#10d9a3' : '#fbbf24'} />
                <WalletLogo wallet="trustwallet" size={16} />
                <span>{data.config.trading_mode === 'PAPER' ? (isFa ? 'شبیه‌ساز دمو تراست‌ولت' : 'TRUST WALLET SIM') : 'TRUST WALLET LIVE'}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex p-0.5 rounded-xl bg-black/30 backdrop-blur-md border border-white/20 text-[10px] font-black">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'PAPER' })}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      data.config.trading_mode === 'PAPER' ? 'ios-glass-gold-btn' : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {isFa ? 'شبیه‌ساز $10k' : 'Sim'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'LIVE' })}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      data.config.trading_mode === 'LIVE' ? 'ios-glass-emerald-btn' : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {isFa ? 'تراست‌ولت واقعی' : 'Trust Live'}
                  </button>
                </div>

                <div className="inline-flex p-0.5 rounded-xl bg-black/30 backdrop-blur-md border border-white/20 text-[10px] font-black">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ executionMode: 'MANUAL_CONFIRM' })}
                    className={`px-2 py-1 rounded-lg transition ${
                      execMode === 'MANUAL_CONFIRM' ? 'ios-glass-gold-btn' : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {isFa ? 'تایید دستی' : 'Manual'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ executionMode: 'AUTO' })}
                    className={`px-2 py-1 rounded-lg transition ${
                      execMode === 'AUTO' ? 'ios-glass-emerald-btn' : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {isFa ? 'اتوترید ۲۴/۷' : '24/7 Auto'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-2.5 text-xs text-white/80 font-semibold flex-wrap">
                  <span>{isFa ? 'ارزش کل حساب (Equity)' : 'Total Equity'}</span>
                  <button type="button" onClick={() => setHideBal((v) => !v)} className="text-white/80 hover:text-white">
                    {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-white mt-1 font-num">
                  {hideBal ? '••••••' : <AnimatedNumber value={totalEq} format={(n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />}
                </div>
              </div>

              <span
                dir="ltr"
                className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-full tabular backdrop-blur-md ${
                  todayPnl >= 0 ? 'bg-emerald-400/25 text-emerald-100 border border-emerald-300/35' : 'bg-rose-500/30 text-rose-100 border border-rose-300/35'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {todayPnl >= 0 ? `+$${todayPnl.toFixed(2)}` : `-$${Math.abs(todayPnl).toFixed(2)}`}
              </span>
            </div>

            <div className="h-48 rounded-2xl bg-black/35 backdrop-blur-md border border-white/15 p-2.5">
              <AreaChart
                values={equitySeries}
                points={equityPoints}
                baseline={equityPoints[0]?.equity ?? totalEq}
                tone="dark"
                height={172}
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: Wallet, l: isFa ? 'موجودی آزاد' : 'Free Cash', v: hideBal ? '•••' : `$${freeBal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, cls: 'text-emerald-300' },
                { icon: Trophy, l: isFa ? 'سود کل' : 'Total PnL', v: data.stats.totalPnl >= 0 ? `+$${data.stats.totalPnl.toFixed(0)}` : `-$${Math.abs(data.stats.totalPnl).toFixed(0)}`, cls: 'text-amber-300' },
                { icon: ShieldCheck, l: isFa ? 'اهرم فعلی' : 'Max Lev', v: `${data.config.max_leverage}×`, cls: 'text-sky-300' },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.l} className="ios-glass-stat rounded-2xl p-3">
                    <Icon className={`w-4 h-4 mb-1 ${c.cls}`} />
                    <p dir="ltr" className="font-num font-bold text-sm tabular text-white">{c.v}</p>
                    <p className="text-[10px] text-white/75 font-semibold mt-0.5">{c.l}</p>
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
              className="hidden sm:flex items-center gap-3 panel rounded-2xl px-3.5 py-2 shadow-lg animate-floaty absolute -top-5 end-3 z-10"
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

      {/* Promotional Banners strictly BELOW Hero Balance Card */}
      <PromoBannerCarousel lang={lang} placement="DASHBOARD" onNavigateTab={onNavigate} />

      {/* 2. Autonomous Trading Team + Full Strategy & Timeframe Selector */}
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
                  {
                    strategy_key: e.target.value,
                    ai_gate_enabled:
                      e.target.value === 'ai_autonomous_agent' || e.target.value === 'my_custom_ai' ? 1 : 0,
                  },
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            {
              id: 'ai' as const,
              active: activeStrategy === 'ai_autonomous_agent',
              icon: BrainCircuit,
              code: 'DOLLARINO AI',
              title: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI',
              desc: isFa ? 'اجماع چند مدل هوش مصنوعی روی ساختار بازار بدون نیاز به کلید API شخصی.' : 'Consensus Multi-LLM engine managed centrally by Dollarino.',
              win: 74,
              color: '#e8c15a',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'ai_autonomous_agent', ai_gate_enabled: 1 },
                  isFa ? 'هوش مصنوعی دلارینو فعال شد' : 'Dollarino AI activated'
                ),
            },
            {
              id: 'myai' as const,
              active: activeStrategy === 'my_custom_ai',
              icon: Bot,
              code: 'RAW PERSONAL AI',
              title: isFa ? 'هوش مصنوعی خام (شخصی)' : 'Raw Personal AI',
              desc: isFa ? 'به زبان فارسی به ربات یاد بده چطور معامله کند و مستقیم روی چارت اجرا شود.' : 'Teach your personal AI rules in chat and execute 24/7.',
              win: 76,
              color: '#a855f7',
              onClick: () => onNavigate('myai'),
            },
            {
              id: 'dorna' as const,
              active: activeStrategy !== 'ai_autonomous_agent' && activeStrategy !== 'my_custom_ai' && activeStrategy !== 'copy_trade',
              icon: Crosshair,
              code: 'HUNTING · ۲ بخش',
              title: isFa ? 'استراتژی شکار' : 'Hunting Strategy',
              desc: isFa
                ? 'دارای ۲ بخش: ۱) استراتژی‌های آماده ما (دُرنا V1، KBOS، SP2L) و ۲) استراتژی شخصی شما.'
                : '2 sub-modes: Our preset hunters (Dorna V1, KBOS, SP2L) OR your custom Pine/Python strategy.',
              win: 68,
              color: '#10d9a3',
              onClick: () =>
                void patchConfig(
                  { strategy_key: 'dollarino_v01', ai_gate_enabled: 0 },
                  isFa ? 'استراتژی شکار (دُرنا V1) فعال شد' : 'Hunting Strategy activated'
                ),
            },
            {
              id: 'copy' as const,
              active: activeStrategy === 'copy_trade',
              icon: Trophy,
              code: 'COPY TRADE',
              title: isFa ? 'کپی‌ترید تاییدشده دلارینو' : 'Verified Copy-Trade',
              desc: isFa ? 'کپی خودکار معاملات تریدرهای تاییدشده، ولت‌های نهنگ و سیگنال‌های @Dollarino_official.' : 'Instant sub-second mirroring of verified traders & @Dollarino_official.',
              win: 79,
              color: '#38e1ff',
              onClick: () => onNavigate('copy'),
            },
          ].map((e) => {
            const Icon = e.icon;
            return (
            <div
              key={e.id}
              onClick={e.onClick}
              className={`cursor-pointer panel panel-hover rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-3 relative ${
                e.active ? 'ring-2 ring-[var(--gold)]' : ''
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${e.color}1e`, color: e.color }}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span dir="ltr" className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full shrink-0" style={{ background: `${e.color}1c`, color: e.color }}>
                    {e.code}
                  </span>
                </div>
                <h3 className="font-display font-bold text-sm sm:text-base text-main">{e.title}</h3>
                <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
              </div>
              <div className="space-y-2">
                {e.id === 'dorna' && (
                  <div className="flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => void patchConfig({ strategy_key: 'dollarino_v01', ai_gate_enabled: 0 }, isFa ? 'استراتژی آماده دُرنا V1 انتخاب شد' : 'Dorna V1 selected')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-jade text-[10px] font-black hover:bg-emerald-500/25"
                    >
                      {isFa ? 'آماده (دُرنا)' : 'Presets'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('radar')}
                      className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand text-[10px] font-black hover:opacity-85"
                    >
                      {isFa ? 'کد شخصی (IDE)' : 'Custom IDE'}
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs font-black pt-2 border-t hairline" style={{ color: e.color }}>
                  <span className="inline-flex items-center gap-1">
                    {e.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{e.active ? (isFa ? 'فعال' : 'Active') : isFa ? 'انتخاب' : 'Select'}</span>
                  </span>
                  <span>{e.win}% WR</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Compact Live AI Core Bar & Instant Market Scan */}
        <div className="panel rounded-[22px] p-4 border border-blue-500/20 bg-gradient-to-br from-blue-600/8 via-transparent to-emerald-500/8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl btn-cobalt grid place-items-center shrink-0">
                <BrainCircuit className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black text-jade">
                    <span className="h-2 w-2 rounded-full bg-jade live-dot" />
                    {isFa ? 'اسکن لحظه‌ای و اجماع زنده AI' : 'Live AI Market Scan & Auto-Execute'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-bold">
                    {isFa ? data.platformAI?.effectiveModeLabelFa || 'هوش مصنوعی دلارینو' : data.platformAI?.effectiveModeLabelEn || 'Dollarino AI'}
                  </span>
                </div>
                <p className="text-[11px] text-dim truncate">
                  {data.config.last_ai_reason
                    ? data.config.last_ai_reason
                    : isFa
                      ? 'بررسی آنی بهترین فرصت‌های خرید و فروش کل بازار با حد ضرر خودکار'
                      : 'Scan top market pairs instantly with automated SL & 3-TP planning.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={aiScanBusy}
                onClick={() => void runAiInstantScan(false)}
                className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Radar className="w-3.5 h-3.5" />
                <span>{aiScanBusy ? '...' : isFa ? 'اسکن لحظه‌ای کل بازار' : 'Instant AI Scan'}</span>
              </button>
              <button
                type="button"
                disabled={aiScanBusy}
                onClick={() => void runAiInstantScan(true)}
                className="btn-emerald px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isFa ? 'شکار و اجرای فوری AI' : 'Scan & Execute'}</span>
              </button>
            </div>
          </div>

          {aiScanResults.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t hairline">
              {aiScanResults.map((r) => (
                <div key={r.symbol} className="surface-soft rounded-xl p-3 text-[11px] space-y-1.5 border hairline">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-black text-main">
                      <CoinIcon symbol={r.symbol} size={18} />
                      <span>{r.symbol.replace('USDT', '')}</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      r.action === 'LONG' ? 'bg-jade/15 text-jade' : r.action === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'bg-white/10 text-dim'
                    }`}>
                      {r.action} · {r.confidence}%
                    </span>
                  </div>
                  <p className="text-[10px] text-dim line-clamp-2">{r.thesis}</p>
                  {(r.action === 'LONG' || r.action === 'SHORT') && (
                    <div className="flex items-center justify-between pt-1 text-[10px] font-num" dir="ltr">
                      <span className="text-main">EN ${r.entry} · SL ${r.stopLoss}</span>
                      <button
                        type="button"
                        onClick={() => onSelectTerminalSymbol(r.symbol)}
                        className="text-[var(--gold)] font-black hover:underline"
                      >
                        {isFa ? 'پایانه' : 'Trade'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
                        {up ? `+$${uPnl.toFixed(2)}` : `-$${Math.abs(uPnl).toFixed(2)}`}
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
            <span>{isFa ? 'ساخت کارت سود دلارینو (PNG)' : 'Dollarino Profit Card (PNG)'}</span>
          </button>
        </div>
      </section>

      <QuickWidgetsBar
        lang={lang}
        uiMode={uiMode}
        user={user}
        dashboard={data}
        onToggleBot={handleStartStop}
        onKillSwitch={handleKillSwitch}
        onToggleUiMode={onToggleUiMode}
        onNavigate={onNavigate}
        onUserUpdated={onRefresh}
      />

      {renderSharedModals()}
    </div>
  );
}
