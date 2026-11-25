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
  CreditCard,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Globe,
  GraduationCap,
  Hand,
  KeyRound,
  Layers,
  Lock,
  Power,
  Radar,
  RefreshCw,
  Scale,
  Settings2,
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
import {
  computeDynamicRecommendedSettings,
  resolveEffectiveBotCapital,
  type BotBudgetMode,
  type CapitalPresetId,
  type Timeframe,
} from '@dollarino/core';
import { ApiError, apiFetch } from '../lib/api';
import { formatTomanEq, getLiveUsdtIrt } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import { pushFloatingToast } from '../lib/toast';
import type { AuthUserInfo, DashboardPayload, NavTab, OpenTradeRow, TradingEngineChoice } from '../lib/types';
import { ChainLogo, WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { AnimatedNumber, AreaChart, ConsensusGauge, LiveDot, Sparkline } from '../components/DollarinoViz';
import { QuickWidgetsBar } from '../components/QuickWidgetsBar';
import { ProDropdown, SlidingSwitch } from '../components/ProDropdown';
import { PromoBannerCarousel } from '../components/PromoBannerCarousel';
import { SetupWizardModal } from '../components/SetupWizardModal';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { TrustWalletConnectInline } from '../components/TrustWalletConnectInline';
import { WeeklyCardPage } from './WeeklyCardPage';

const RISK_PRESET_META = [
  {
    id: 'conservative' as const,
    titleFa: 'کم‌ریسک (محافظ سرمایه)',
    titleEn: 'Conservative',
    color: '#10d9a3',
  },
  {
    id: 'balanced' as const,
    titleFa: 'متعادل (پیشنهادی دلارینو)',
    titleEn: 'Balanced (Recommended)',
    color: '#2b74ff',
  },
  {
    id: 'aggressive' as const,
    titleFa: 'پُرقدرت (آزادی کامل تریدر)',
    titleEn: 'Aggressive Pro',
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

  const [hideBal, setHideBal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  // V11.0 / V11.4: Unified Pre-Trade Onboarding Gate (Mode + Risk Terms), Custom Paper Balance, Multi-Engine & Sniper Workbench
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);
  const [gateTradingMode, setGateTradingMode] = useState<'PAPER' | 'LIVE'>(() =>
    data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER'
  );
  const [pendingStartAction, setPendingStartAction] = useState<(() => Promise<void>) | null>(null);
  const [paperResetOpen, setPaperResetOpen] = useState(false);
  const [customPaperInput, setCustomPaperInput] = useState(() =>
    String(Math.round(Number(data.config.custom_paper_balance || data.config.paper_balance || 10000)))
  );

  // V11.1: Bot Capital Cap & Dynamic Capital-Aware Settings
  const [budgetDrawerOpen, setBudgetDrawerOpen] = useState(false);
  const [budgetModeInput, setBudgetModeInput] = useState<BotBudgetMode>(
    () => (data.config.bot_budget_mode as BotBudgetMode) || 'FULL_BALANCE'
  );
  const [budgetUsdInput, setBudgetUsdInput] = useState(() =>
    String(Math.round(Number(data.config.bot_budget_usd || 100)))
  );
  const [budgetPctInput, setBudgetPctInput] = useState(() =>
    String(Math.round(Number(data.config.bot_budget_pct || 25)))
  );
  const [manualLevInput, setManualLevInput] = useState(() =>
    String(Math.max(1, Math.min(100, Math.round(Number(data.config.max_leverage || 10)))))
  );
  useEffect(() => {
    setBudgetModeInput((data.config.bot_budget_mode as BotBudgetMode) || 'FULL_BALANCE');
    if ((data.config.bot_budget_usd ?? 0) > 0) setBudgetUsdInput(String(Math.round(Number(data.config.bot_budget_usd))));
    if (data.config.max_leverage) setManualLevInput(String(Math.max(1, Math.min(100, Math.round(Number(data.config.max_leverage))))));
    if ((data.config.bot_budget_pct ?? 0) > 0) setBudgetPctInput(String(Math.round(Number(data.config.bot_budget_pct))));
  }, [data.config.bot_budget_mode, data.config.bot_budget_usd, data.config.bot_budget_pct]);

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
    if (autoExecute && !onboardingGateComplete) {
      runWithRiskCheck(async () => {
        await runAiInstantScan(true);
      });
      return;
    }
    setAiScanBusy(true);
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
      toastMsg(
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
      if (e instanceof ApiError && e.status === 403) {
        runWithRiskCheck(async () => {
          await runAiInstantScan(autoExecute);
        });
        return;
      }
      toastMsg(e instanceof Error ? e.message : 'AI Scan Error', true);
    } finally {
      setAiScanBusy(false);
    }
  };

  const freeBal = Number(data.balance.free || 0);
  const usedBal = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total ?? freeBal + usedBal);
  const demoBalDisplay = Number(
    data.walletSummary?.demoBalanceUsd ??
      (data.config.trading_mode === 'PAPER' ? totalEq : Number(data.config.custom_paper_balance || data.config.paper_balance || 10000))
  );
  const liveBalDisplay = Number(
    data.walletSummary?.liveBalanceUsd ??
      (data.config.trading_mode === 'LIVE' ? totalEq : 0)
  );
  const liveIranIrt = data.iranRate?.usdtIrt || getLiveUsdtIrt() || 290_000;
  const liveIranSource = data.iranRate?.source || 'arzdigital';
  const iranSourceLabel = (() => {
    if (!isFa) return liveIranSource.toUpperCase();
    switch (liveIranSource) {
      case 'arzdigital':
        return 'ارزدیجیتال';
      case 'alanchand':
        return 'الان‌چند';
      case 'nobitex':
        return 'نوبیتکس';
      case 'wallex':
        return 'والکس';
      case 'tetherland':
        return 'تترلند';
      case 'ramzinex':
        return 'رمزینکس';
      default:
        return 'نرخ پایه';
    }
  })();

  const serverCap = data.capitalSummary;
  const activeCapitalRes = useMemo(
    () =>
      serverCap
        ? {
            walletTotalUsd: serverCap.walletTotalUsd,
            effectiveCapitalUsd: serverCap.effectiveCapitalUsd,
            usedMarginUsd: serverCap.usedMarginUsd,
            remainingBudgetUsd: serverCap.remainingBudgetUsd,
            isCapped: serverCap.isCapped,
            budgetMode: serverCap.budgetMode,
          }
        : {
            ...resolveEffectiveBotCapital({
              walletBalanceUsd: totalEq,
              budgetMode: data.config.bot_budget_mode,
              budgetUsd: data.config.bot_budget_usd,
              budgetPct: data.config.bot_budget_pct,
            }),
            walletTotalUsd: totalEq,
            usedMarginUsd: usedBal,
            remainingBudgetUsd: Math.max(0, totalEq - usedBal),
          },
    [serverCap, totalEq, usedBal, data.config.bot_budget_mode, data.config.bot_budget_usd, data.config.bot_budget_pct]
  );

  const previewDraftCap = useMemo(
    () =>
      resolveEffectiveBotCapital({
        walletBalanceUsd: activeCapitalRes.walletTotalUsd || totalEq,
        budgetMode: budgetModeInput,
        budgetUsd: Number(budgetUsdInput || 0),
        budgetPct: Number(budgetPctInput || 100),
      }),
    [activeCapitalRes.walletTotalUsd, totalEq, budgetModeInput, budgetUsdInput, budgetPctInput]
  );

  const previewDraftRec = useMemo(
    () => computeDynamicRecommendedSettings(previewDraftCap.effectiveCapitalUsd, 'balanced'),
    [previewDraftCap.effectiveCapitalUsd]
  );

  const dynamicRiskPresets = useMemo(
    () =>
      RISK_PRESET_META.map((meta) => {
        const rec = computeDynamicRecommendedSettings(activeCapitalRes.effectiveCapitalUsd, meta.id);
        return {
          ...meta,
          rec,
          descFa: `هر ترید \u2066$${rec.perTradeUsd.toFixed(rec.perTradeUsd < 10 ? 1 : 0)}\u2069 (${rec.marginPct}%) · تا ${rec.maxOpenPositions} معامله · اهرم ${rec.maxLeverage}×`,
          descEn: `$${rec.perTradeUsd.toFixed(rec.perTradeUsd < 10 ? 1 : 0)}/trade (${rec.marginPct}%) · max ${rec.maxOpenPositions} pos · ${rec.maxLeverage}× lev`,
        };
      }),
    [activeCapitalRes.effectiveCapitalUsd]
  );
  const openDexTrades = useMemo(
    () => (data.dexTrades || []).filter((t) => t.status === 'OPEN' || t.status === 'PENDING_SIGN'),
    [data.dexTrades]
  );
  const openSmartCopy = useMemo(
    () => (data.smartCopyPositions || []).filter((p) => p.status === 'OPEN' || p.status === 'PENDING_TRUST_SIGN'),
    [data.smartCopyPositions]
  );
  const openPerpOrders = useMemo(
    () => (data.perpOrders || []).filter((o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED'),
    [data.perpOrders]
  );
  const totalOpenPositionsCount =
    data.openTrades.length + openDexTrades.length + openSmartCopy.length + openPerpOrders.length;

  const openPnlBreakdown = useMemo(() => {
    let profitableCount = 0;
    let losingCount = 0;
    let totalUnrealized = 0;
    for (const t of data.openTrades) {
      const p = Number(t.unrealized_pnl || 0);
      totalUnrealized += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const d of openDexTrades) {
      if (d.status !== 'OPEN') continue;
      const p = Number(d.unrealized_pnl_usd || 0);
      totalUnrealized += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const cp of openSmartCopy) {
      if (cp.status !== 'OPEN') continue;
      const p = Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
      totalUnrealized += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const po of openPerpOrders) {
      const p = Number(po.unrealized_pnl_usd || 0);
      totalUnrealized += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    return { profitableCount, losingCount, totalUnrealized };
  }, [data.openTrades, openDexTrades, openSmartCopy, openPerpOrders]);

  const unrealized = data.stats.unrealizedPnl ?? openPnlBreakdown.totalUnrealized;
  const todayPnl = Number(data.stats.todayPnl ?? data.stats.totalPnl ?? 0) + unrealized;
  const activeStrategy = data.config.strategy_key || 'dollarino_v01';
  const scanScope = data.config.scan_scope || 'ALL_MARKET';
  const execMode = data.config.trade_execution_mode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO';
  const activeEngines: TradingEngineChoice[] = useMemo(() => {
    if (data.activeEngine?.activeEngines?.length) return data.activeEngine.activeEngines;
    const list: TradingEngineChoice[] = [];
    if (activeStrategy === 'ai_autonomous_agent') list.push('CENTRAL_AI');
    else if (activeStrategy === 'my_custom_ai') list.push('MY_AI');
    else if (activeStrategy === 'copy_trade') list.push('COPY_TRADE');
    else list.push('STRATEGY');
    if (data.config.sniper_enabled) list.push('LISTING_SNIPER');
    return list;
  }, [data.activeEngine?.activeEngines, activeStrategy, data.config.sniper_enabled]);
  const hasSelectedMode =
    data.tradingModeSelected === true || Number(data.config.trading_mode_selected ?? 0) === 1;
  const hasAcceptedRisk = Boolean(data.riskTermsAcceptedAt || user.risk_terms_accepted_at);
  const onboardingGateComplete = hasSelectedMode && hasAcceptedRisk;
  const freeTradesRem = data.serverFeeSummary?.freeTradesRemaining ?? 3;
  const freeTradesLim = data.serverFeeSummary?.freeTradesLimit ?? 3;

  const completePreTradeOnboarding = async (modeToSave: 'PAPER' | 'LIVE') => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/accept-risk-terms', {
        method: 'POST',
        body: JSON.stringify({ tradingMode: modeToSave }),
      });
      setRiskModalOpen(false);
      toastMsg(
        isFa
          ? `حالت ${modeToSave === 'LIVE' ? 'واقعی (Trust Wallet)' : 'دمو آزمایشی'} و قوانین ریسک تایید شدند.`
          : `${modeToSave} mode and risk terms confirmed.`
      );
      const fn = pendingStartAction;
      setPendingStartAction(null);
      if (fn) await fn();
      else await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Onboarding save failed', true);
    } finally {
      setBusy(false);
    }
  };

  const toggleEngineChoice = async (engine: TradingEngineChoice, forceNext?: boolean) => {
    const currentlyOn = activeEngines.includes(engine);
    const nextOn = forceNext !== undefined ? forceNext : !currentlyOn;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; activeEngine?: { activeEngines: TradingEngineChoice[] } }>(
        '/api/trading/engines/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ engine, enabled: nextOn }),
        }
      );
      const count = res.activeEngine?.activeEngines?.length ?? 0;
      toastMsg(
        isFa
          ? `${nextOn ? 'موتور فعال شد' : 'موتور غیرفعال شد'} (${count} موتور آماده/فعال همزمان)`
          : `${nextOn ? 'Engine enabled' : 'Engine disabled'} (${count} active)`
      );
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Engine toggle failed', true);
    } finally {
      setBusy(false);
    }
  };

  const applyCustomPaperBalance = async (targetBal: number) => {
    const clean = Math.max(50, Math.min(10_000_000, Math.round(targetBal * 100) / 100));
    setBusy(true);
    try {
      const res = await apiFetch<{
        balance?: number;
        balanceAfter?: number;
        customPaperBalance?: number;
        message?: string;
      }>('/api/trading/wallet/reset', {
        method: 'POST',
        body: JSON.stringify({ balance: clean }),
      });
      const finalBal = Number(res.balance ?? res.balanceAfter ?? res.customPaperBalance ?? clean);
      setCustomPaperInput(String(finalBal));
      setPaperResetOpen(false);
      toastMsg(
        res.message ||
          (isFa
            ? `موجودی کیف‌پول دمو روی $${finalBal.toLocaleString('en-US')} تنظیم شد`
            : `Demo balance set to $${finalBal.toLocaleString('en-US')}`)
      );
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Demo reset failed', true);
    } finally {
      setBusy(false);
    }
  };

  const runWithRiskCheck = (startAction: () => Promise<void>) => {
    if (onboardingGateComplete) {
      void startAction();
      return;
    }
    setGateTradingMode(data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER');
    setRiskChecked(hasAcceptedRisk);
    setPendingStartAction(() => startAction);
    setRiskModalOpen(true);
  };

  useEffect(() => {
    const onReqRisk = () => {
      runWithRiskCheck(async () => {
        await apiFetch('/api/trading/bot/start', {
          method: 'POST',
          body: JSON.stringify({ scanScope: data.config.scan_scope || 'ALL_MARKET' }),
        });
        await onRefresh();
      });
    };
    window.addEventListener('dollarino:require-risk-terms', onReqRisk);
    return () => window.removeEventListener('dollarino:require-risk-terms', onReqRisk);
  });

  const resetConfigToDefaults = async (preset: CapitalPresetId = 'balanced') => {
    setBusy(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/trading/config/reset-defaults', {
        method: 'POST',
        body: JSON.stringify({ preset }),
      });
      toastMsg(res.message || (isFa ? 'تنظیمات مدیریت سرمایه اعمال شد' : 'Capital management defaults applied'));
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Reset failed', true);
    } finally {
      setBusy(false);
    }
  };

  const saveBotBudgetCap = async (applyRecommended = false) => {
    setBusy(true);
    try {
      const cleanUsd = budgetModeInput === 'FIXED_USD' ? Math.max(10, Number(budgetUsdInput || 100)) : 0;
      const cleanPct = budgetModeInput === 'PERCENT_OF_BALANCE' ? Math.max(5, Math.min(100, Number(budgetPctInput || 25))) : 100;
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          bot_budget_mode: budgetModeInput,
          bot_budget_usd: cleanUsd,
          bot_budget_pct: cleanPct,
        }),
      });
      if (applyRecommended) {
        const res = await apiFetch<{ message?: string }>('/api/trading/config/reset-defaults', {
          method: 'POST',
          body: JSON.stringify({ preset: 'balanced', budgetMode: budgetModeInput, budgetUsd: cleanUsd, budgetPct: cleanPct }),
        });
        toastMsg(res.message || (isFa ? 'سقف سرمایه و تنظیمات پویای مدیریت سرمایه اعمال شد' : 'Capital cap & dynamic defaults applied'));
      } else {
        toastMsg(
          isFa
            ? `سقف سرمایه ربات روی $${previewDraftCap.effectiveCapitalUsd.toLocaleString('en-US')} ذخیره شد`
            : `Bot capital cap saved ($${previewDraftCap.effectiveCapitalUsd.toLocaleString('en-US')})`
        );
      }
      setBudgetDrawerOpen(false);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Capital cap save failed', true);
    } finally {
      setBusy(false);
    }
  };

  const switchTrustExecution = async (next: { executionMode?: 'AUTO' | 'MANUAL_CONFIRM'; tradingMode?: 'PAPER' | 'LIVE' }) => {
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        warningCode?: 'NO_TRUST_WALLET' | 'MIN_BALANCE_10_USD';
      }>('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          executionMode: next.executionMode ?? execMode,
          tradingMode: next.tradingMode ?? data.config.trading_mode,
          syncCopyRules: true,
        }),
      });
      if (res.warningCode) {
        pushFloatingToast(res.message, 'warn', 5500, {
          label: isFa ? 'اتصال Trust Wallet' : 'Connect Wallet',
          onClick: () => setTrustDrawerOpen(true),
        });
      } else {
        toastMsg(res.message);
      }
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
    if (!onboardingGateComplete) {
      runWithRiskCheck(async () => {
        await executeScanSetupInline(item);
      });
      return;
    }
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
      if (e instanceof ApiError && e.status === 403) {
        runWithRiskCheck(async () => {
          await executeScanSetupInline(item);
        });
        return;
      }
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
    pushFloatingToast(msg, isErr ? 'error' : 'success');
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
    runWithRiskCheck(async () => {
      setBusy(true);
      try {
        await apiFetch('/api/trading/bot/start', {
          method: 'POST',
          body: JSON.stringify({
            scanScope,
            activeEngines: activeEngines.length > 0 ? activeEngines : ['CENTRAL_AI'],
            acceptRiskTerms: true,
          }),
        });
        toastMsg(isFa ? 'ربات با موفقیت روشن شد و اسکن زنده آغاز گردید' : 'Bot started — scanning markets');
        await onRefresh();
      } catch (e) {
        toastMsg(e instanceof Error ? e.message : 'Start failed', true);
      } finally {
        setBusy(false);
      }
    });
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

  const closeDexPosition = async (tradeId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${tradeId}/close`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toastMsg(isFa ? 'پوزیشن DEX/اسنایپر بسته و به موجودی بازگشت' : 'DEX/Sniper position closed');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closeSmartCopyPosition = async (posId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/copy-trade/positions-v2/${posId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: 'CLOSE' }),
      });
      toastMsg(isFa ? 'پوزیشن کپی‌ترید بسته و تسویه شد' : 'Copy-Trade position closed');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closePerpOrderPosition = async (orderId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/dex/perp-orders/${orderId}/close`, {
        method: 'POST',
      });
      toastMsg(isFa ? 'پوزیشن فیوچرز DEX بسته شد' : 'Perp DEX order closed');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closeBatchPositions = async (scope: 'ALL_PROFITABLE' | 'ALL_LOSING') => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; closedCount: number; realizedTotalUsd: number }>(
        '/api/trading/positions/close-batch',
        {
          method: 'POST',
          body: JSON.stringify({ scope }),
        }
      );
      if (res.closedCount === 0) {
        toastMsg(
          scope === 'ALL_PROFITABLE'
            ? isFa
              ? 'معامله سوددهی برای بستن وجود ندارد.'
              : 'No profitable positions to close.'
            : isFa
              ? 'معامله ضررده‌ای برای بستن وجود ندارد.'
              : 'No losing positions to close.'
        );
      } else {
        toastMsg(
          scope === 'ALL_PROFITABLE'
            ? isFa
              ? `${res.closedCount} معامله سودده با مجموع +$${res.realizedTotalUsd.toFixed(2)} برداشت شدند.`
              : `Closed ${res.closedCount} profitable positions (+$${res.realizedTotalUsd.toFixed(2)}).`
            : isFa
              ? `${res.closedCount} معامله ضررده برای حفظ سرمایه بسته شدند.`
              : `Closed ${res.closedCount} losing positions.`
        );
      }
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Batch close failed', true);
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

  const renderBotBudgetCard = (variant: 'glass' | 'panel') => {
    const capTotal = Math.max(0, activeCapitalRes.effectiveCapitalUsd);
    const used = Math.max(0, activeCapitalRes.usedMarginUsd);
    const rem = Math.max(0, activeCapitalRes.remainingBudgetUsd);
    const pctUsed = capTotal > 0 ? Math.min(100, Math.round((used / capTotal) * 100)) : 0;
    const isGlass = variant === 'glass';

    return (
      <div
        className={`rounded-2xl p-3.5 space-y-2.5 ${
          isGlass
            ? 'bg-black/30 backdrop-blur-md border border-white/20 text-white'
            : 'surface-soft border hairline text-main'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/images/transparent/capital-vault-3d.png?v=1165" alt="Bot Budget" className="w-10 h-10 object-contain shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-black">
                <span>
                  {isFa ? 'بودجه مجاز ربات:' : 'Bot Budget Cap:'}{' '}
                  <span dir="ltr" className={isGlass ? 'text-emerald-300 font-num' : 'text-[#059669] dark:text-[#34D399] font-num'}>
                    ${capTotal.toLocaleString('en-US')}
                  </span>
                </span>
                {activeCapitalRes.isCapped && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isGlass ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-500/15 text-[#D97706]'}`}>
                    {isFa ? (
                      <>
                        از کل <span dir="ltr" className="inline-block font-num" style={{ unicodeBidi: 'isolate' }}>${activeCapitalRes.walletTotalUsd.toLocaleString('en-US')}</span>
                      </>
                    ) : (
                      `of $${activeCapitalRes.walletTotalUsd.toLocaleString('en-US')}`
                    )}
                  </span>
                )}
              </div>
              <p className={`text-[10.5px] font-num ${isGlass ? 'text-white/75' : 'text-dim'}`}>
                {isFa ? (
                  <>
                    درگیر: <span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${used.toFixed(0)}</span> · باقی‌مانده مجاز:{' '}
                    <span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${rem.toFixed(0)}</span>
                  </>
                ) : (
                  `In Use: $${used.toFixed(0)} · Remaining: $${rem.toFixed(0)}`
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setBudgetDrawerOpen((v) => !v)}
              className={`h-8 px-3 rounded-xl text-[11px] font-black inline-flex items-center gap-1 transition ${
                isGlass ? 'ios-glass-btn' : 'btn-ghost border hairline'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 text-amber-300" />
              <span>{isFa ? 'تنظیم سقف سرمایه' : 'Set Cap'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resetConfigToDefaults(currentPresetId)}
              className={`h-8 px-3 rounded-xl text-[11px] font-black inline-flex items-center gap-1 transition ${
                isGlass ? 'ios-glass-emerald-btn' : 'bg-[#059669] hover:bg-[#047857] text-white'
              }`}
              title={isFa ? 'تنظیم خودکار مارجین، اهرم و تعداد معاملات با فرمول مدیریت سرمایه' : 'Apply capital management defaults'}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isFa ? 'تنظیم مدیریت سرمایه' : 'Capital Management'}</span>
            </button>
          </div>
        </div>

        <div className={`h-1.5 w-full rounded-full overflow-hidden ${isGlass ? 'bg-white/15' : 'bg-slate-500/15'}`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-300 transition-all duration-300"
            style={{ width: `${Math.max(activeCapitalRes.isCapped ? 6 : 3, pctUsed)}%` }}
          />
        </div>

        {budgetDrawerOpen && (
          <div className={`pt-2.5 mt-1 border-t space-y-2.5 ${isGlass ? 'border-white/15' : 'hairline'}`}>
            <p className={`text-[11px] font-bold ${isGlass ? 'text-white/85' : 'text-sub'}`}>
              {isFa
                ? 'مشخص کنید ربات در مجموع (چه ۱ ترید چه ۱۰ ترید) حداکثر با چقدر از پول کیف‌پول کار کند:'
                : 'Limit total capital the bot may deploy across all open trades combined:'}
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-black">
              {(
                [
                  { id: 'FULL_BALANCE' as const, labelFa: 'کل موجودی', labelEn: 'Full Wallet' },
                  { id: 'FIXED_USD' as const, labelFa: 'سقف دلاری ($)', labelEn: 'Fixed USD ($)' },
                  { id: 'PERCENT_OF_BALANCE' as const, labelFa: 'درصد از کل (%)', labelEn: 'Percent (%)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBudgetModeInput(m.id)}
                  className={`py-2 px-2 rounded-xl border transition ${
                    budgetModeInput === m.id
                      ? isGlass
                        ? 'ios-glass-gold-btn border-amber-300/60'
                        : 'bg-[#0D47A1] text-white border-[#0D47A1]'
                      : isGlass
                        ? 'bg-black/30 text-white/75 border-white/15 hover:text-white'
                        : 'surface-card text-dim border-[var(--line-strong)]'
                  }`}
                >
                  {isFa ? m.labelFa : m.labelEn}
                </button>
              ))}
            </div>

            {budgetModeInput === 'FIXED_USD' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
                  {[50, 100, 250, 500, 1000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBudgetUsdInput(String(v))}
                      className={`px-2.5 py-1 rounded-lg border ${
                        Number(budgetUsdInput) === v
                          ? 'bg-emerald-500 text-white border-emerald-400'
                          : isGlass
                            ? 'bg-black/30 text-white/80 border-white/15'
                            : 'surface-card text-dim border-[var(--line-strong)]'
                      }`}
                    >
                      ${v.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={10000000}
                    dir="ltr"
                    value={budgetUsdInput}
                    onChange={(e) => setBudgetUsdInput(e.target.value)}
                    placeholder="100"
                    className={`w-32 px-3 py-1.5 rounded-xl text-xs font-num font-bold ${
                      isGlass ? 'bg-black/45 border border-white/25 text-white' : 'input-pro'
                    }`}
                  />
                  <span className={`text-[11px] ${isGlass ? 'text-white/75' : 'text-dim'}`}>
                    {isFa ? 'دلار سقف مجموع کل تریدهای باز' : 'USD aggregate max across all open trades'}
                  </span>
                </div>
              </div>
            )}

            {budgetModeInput === 'PERCENT_OF_BALANCE' && (
              <div className="flex items-center gap-2 flex-wrap">
                {[10, 25, 50, 75].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBudgetPctInput(String(p))}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${
                      Number(budgetPctInput) === p
                        ? 'bg-emerald-500 text-white border-emerald-400'
                        : isGlass
                          ? 'bg-black/30 text-white/80 border-white/15'
                          : 'surface-card text-dim border-[var(--line-strong)]'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
                <input
                  type="number"
                  min={5}
                  max={100}
                  dir="ltr"
                  value={budgetPctInput}
                  onChange={(e) => setBudgetPctInput(e.target.value)}
                  className={`w-20 px-2.5 py-1.5 rounded-xl text-xs font-num font-bold ${
                    isGlass ? 'bg-black/45 border border-white/25 text-white' : 'input-pro'
                  }`}
                />
              </div>
            )}

            <div className={`rounded-xl p-2.5 text-[11px] font-bold flex items-start gap-1.5 ${isGlass ? 'bg-emerald-400/15 text-emerald-100 border border-emerald-300/25' : 'bg-emerald-500/10 text-[#059669] dark:text-[#34D399] border border-emerald-500/25'}`}>
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{isFa ? previewDraftRec.summaryFa : previewDraftRec.summaryEn}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveBotBudgetCap(false)}
                className={`py-2 px-3 rounded-xl text-xs font-black ${
                  isGlass ? 'ios-glass-btn' : 'btn-ghost border hairline'
                }`}
              >
                {isFa ? 'ذخیره سقف سرمایه' : 'Save Cap Only'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveBotBudgetCap(true)}
                className={`py-2 px-3 rounded-xl text-xs font-black ${
                  isGlass ? 'ios-glass-emerald-btn' : 'bg-[#059669] hover:bg-[#047857] text-white'
                }`}
              >
                {isFa ? 'ذخیره + مدیریت سرمایه هوشمند' : 'Save + Capital Defaults'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLeverageControl = () => {
    const isAutoLev = Boolean(data.config.use_signal_leverage);
    const suggestedLev = previewDraftRec.maxLeverage;
    const applyManualLev = async (levVal: number) => {
      const clamped = Math.max(1, Math.min(100, Math.round(levVal || 5)));
      setManualLevInput(String(clamped));
      await patchConfig(
        { max_leverage: clamped, use_signal_leverage: false },
        isFa ? `اهرم دستی روی ${clamped}× ذخیره شد` : `Manual leverage set to ${clamped}×`
      );
    };
    const applySuggestedLev = async () => {
      setManualLevInput(String(suggestedLev));
      await patchConfig(
        { max_leverage: suggestedLev, use_signal_leverage: true },
        isFa ? `اهرم پیشنهادی (${suggestedLev}× مطابق مدیریت سرمایه) فعال شد` : `Capital-suggested leverage (${suggestedLev}×) enabled`
      );
    };

    return (
      <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-main">
              {isFa ? 'تنظیم اهرم معاملات (پیشنهادی یا دستی)' : 'Trade Leverage (Suggested or Manual)'}
            </p>
            <p className="text-[11px] text-dim">
              {isAutoLev
                ? isFa
                  ? `حالت فعلی: پیشنهادی مدیریت سرمایه و هوش مصنوعی (تا سقف ${data.config.max_leverage}×)`
                  : `Active: Suggested by Capital Management & AI (up to ${data.config.max_leverage}×)`
                : isFa
                  ? `حالت فعلی: اهرم دستی ثابت ${data.config.max_leverage}× برای تمام معاملات`
                  : `Active: Fixed Manual ${data.config.max_leverage}× for trades`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void applySuggestedLev()}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition border ${
                isAutoLev
                  ? 'bg-[#059669] text-white border-[#059669]'
                  : 'surface-card text-main border-[var(--line-strong)] hover:border-emerald-500/40'
              }`}
            >
              {isFa ? `پیشنهادی (${suggestedLev}×)` : `Suggested (${suggestedLev}×)`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyManualLev(Number(manualLevInput) || data.config.max_leverage || 5)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition border ${
                !isAutoLev
                  ? 'bg-[#0D47A1] text-white border-[#0D47A1]'
                  : 'surface-card text-main border-[var(--line-strong)] hover:border-blue-500/40'
              }`}
            >
              {isFa ? 'دستی' : 'Manual'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[2, 3, 5, 10, 20, 50].map((lv) => (
            <button
              key={lv}
              type="button"
              disabled={busy}
              onClick={() => void applyManualLev(lv)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black font-num border transition ${
                !isAutoLev && Number(data.config.max_leverage) === lv
                  ? 'bg-[#0D47A1] text-white border-[#0D47A1]'
                  : 'surface-card text-dim border-[var(--line-strong)] hover:text-main'
              }`}
            >
              {lv}×
            </button>
          ))}
          <div className="flex items-center gap-1.5 ms-auto">
            <input
              type="number"
              min={1}
              max={100}
              dir="ltr"
              aria-label={isFa ? 'عدد اهرم دستی' : 'Manual leverage'}
              value={manualLevInput}
              onChange={(e) => setManualLevInput(e.target.value)}
              className="input-pro w-16 px-2 py-1 rounded-lg text-xs font-num font-bold text-center"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyManualLev(Number(manualLevInput) || 5)}
              className="px-2.5 py-1 rounded-lg bg-[#0D47A1] text-white text-[11px] font-black"
            >
              {isFa ? 'ثبت دستی' : 'Set'}
            </button>
          </div>
        </div>
      </div>
    );
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

      {riskModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm grid place-items-center p-4" onClick={() => setRiskModalOpen(false)}>
            <div className="pop-in panel rounded-[28px] w-full max-w-lg p-6 space-y-4 border border-amber-500/40 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#F59E0B]" />
                  <span>{isFa ? 'گام الزامی پیش از اولین معامله' : 'Mandatory Pre-Trade Onboarding'}</span>
                </h3>
                <button type="button" onClick={() => setRiskModalOpen(false)} className="btn-ghost p-1.5 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Step 1: Choose Mode (Demo vs Real Trust Wallet) */}
              <div className="space-y-2">
                <p className="text-xs font-black text-main">
                  {isFa ? '۱. انتخاب کنید ربات با کدام حساب معامله کند:' : '1. Choose Trading Account Mode:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGateTradingMode('PAPER')}
                    className={`p-3 rounded-2xl border text-start transition space-y-1 ${
                      gateTradingMode === 'PAPER'
                        ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40'
                        : 'surface-soft hairline hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <p className="text-xs font-black text-main flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{isFa ? 'حساب دمو آزمایشی (رایگان)' : 'Free Demo Simulator'}</span>
                    </p>
                    <p className="text-[11px] text-dim leading-relaxed">
                      {isFa ? (
                        <>
                          <span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>
                            ${Math.round(demoBalDisplay).toLocaleString('en-US')}
                          </span>{' '}
                          اعتبار شبیه‌سازی با قیمت واقعی بازار — بدون نیاز به پول واقعی.
                        </>
                      ) : (
                        `$${Math.round(demoBalDisplay).toLocaleString('en-US')} virtual capital on live prices — zero real risk.`
                      )}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGateTradingMode('LIVE')}
                    className={`p-3 rounded-2xl border text-start transition space-y-1 ${
                      gateTradingMode === 'LIVE'
                        ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40'
                        : 'surface-soft hairline hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <p className="text-xs font-black text-main flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
                      <span>{isFa ? 'حساب واقعی (Trust Wallet)' : 'Real Mode (Trust Wallet)'}</span>
                    </p>
                    <p className="text-[11px] text-dim leading-relaxed">
                      {isFa ? (
                        <>
                          اتصال غیرامانی به کیف‌پول شما (حداقل{' '}
                          <span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>$10</span>
                          ) · {freeTradesLim} معامله سودده اول ۰٪ کارمزد.
                        </>
                      ) : (
                        `Non-custodial Trust Wallet ($10+ min) · first ${freeTradesLim} wins 0% fee.`
                      )}
                    </p>
                  </button>
                </div>
              </div>

              {/* Step 2: Risk Terms */}
              <div className="space-y-2">
                <p className="text-xs font-black text-main">
                  {isFa ? '۲. تایید قوانین و پذیرش ریسک معاملات:' : '2. Risk & Transparency Terms:'}
                </p>
                <div className="surface-soft rounded-2xl p-3.5 text-xs text-sub leading-relaxed space-y-2 border hairline">
                  <p>
                    {isFa
                      ? '۱. بازارهای ارز دیجیتال دارای نوسانات بالا و ریسک ذاتی هستند و هیچ سامانه هوش مصنوعی سود قطعی یا تضمینی ارائه نمی‌دهد.'
                      : '1. Crypto markets carry inherent volatility and risk; no AI or strategy guarantees profits.'}
                  </p>
                  <p>
                    {isFa
                      ? '۲. دلارینو یک دستیار تحلیل و اتوماسیون غیرامانی است؛ تمامی تصمیمات، انتخاب اهرم، استراتژی‌ها و مدیریت سرمایه با مسئولیت شخصی شما انجام می‌شود.'
                      : '2. Dollarino is strictly a non-custodial automation tool; all trade choices, leverage, and risk are your sole responsibility.'}
                  </p>
                  <p>
                    {isFa
                      ? `۳. ${freeTradesLim} معامله سودده اول واقعی ۰٪ کارمزد است و پس از آن فقط ۳٪ از سود خالص معاملات موفق (در حالت لایو) به‌عنوان هزینه سرور محاسبه می‌شود. برخلاف پلتفرم‌های اشتراکی که پول را از اول می‌گیرند و سود یا ضرر شما برایشان مهم نیست، دلارینو تمام تلاشش را می‌کند که شما بیشترین سود را ببرید چون درآمد ما هم تنها از موفقیت واقعی شماست.`
                      : `3. Your first ${freeTradesLim} profitable LIVE trades are 0% fee; afterwards only 3% of net live profits apply. Unlike subscription platforms that charge upfront regardless of losses, Dollarino earns $0 subscription and fights hardest for your profits.`}
                  </p>
                </div>
                <label className="flex items-start gap-2.5 text-xs font-bold text-main cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={riskChecked}
                    onChange={(e) => setRiskChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#059669]"
                  />
                  <span>
                    {isFa
                      ? 'حالت حساب را انتخاب کردم، متن بالا را خواندم و تمام مسئولیت ریسک معاملات را می‌پذیرم.'
                      : 'I selected my account mode and accept full responsibility for my trading risks.'}
                  </span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!riskChecked || busy}
                  onClick={() => void completePreTradeOnboarding(gateTradingMode)}
                  className="btn-emerald flex-1 py-3 rounded-xl text-xs font-black disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isFa ? 'تایید قوانین، ثبت حالت و ادامه' : 'Confirm Mode & Risk Terms'}</span>
                </button>
                <button type="button" onClick={() => setRiskModalOpen(false)} className="btn-ghost px-4 py-3 rounded-xl text-xs font-bold">
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </div>
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

  const renderPreTradeOnboardingBanner = () => {
    if (onboardingGateComplete) return null;
    return (
      <section className="panel-glass rounded-[28px] p-4 sm:p-6 border-2 border-amber-500/45 bg-gradient-to-br from-amber-500/12 via-transparent to-emerald-500/10 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <img
              src="/images/transparent/risk-referral-3d.png"
              alt="Onboarding Gate"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                  {isFa ? 'گام الزامی پیش از اولین معامله' : 'Required Before First Trade'}
                </span>
                {!hasSelectedMode && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400">
                    {isFa ? 'انتخاب حساب دمو / واقعی' : 'Select Demo / Live'}
                  </span>
                )}
                {!hasAcceptedRisk && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
                    {isFa ? 'تایید قوانین ریسک' : 'Risk Terms'}
                  </span>
                )}
              </div>
              <h2 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa
                  ? 'پیش از شروع معامله (حتی آزمایشی)، حساب خود را انتخاب و قوانین ریسک را تایید کنید'
                  : 'Select Your Account Mode & Accept Risk Terms Before Your First Trade'}
              </h2>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'برای حفظ شفافیت و امنیت سرمایه شما، تا زمانی که این دو مورد را تایید نکنید هیچ سفارش یا رباتی معامله باز نمی‌کند.'
                  : 'For your safety and transparency, no bot or manual order can open until both steps are confirmed.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setGateTradingMode('PAPER')}
            className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
              gateTradingMode === 'PAPER'
                ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40'
                : 'surface-soft hairline hover:border-[var(--line-strong)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-main inline-flex items-center gap-1.5">
                <Gamepad2 className="w-4 h-4 text-amber-400" />
                <span>{isFa ? 'حساب دمو آزمایشی (رایگان)' : 'Free Demo Simulator'}</span>
              </span>
              {gateTradingMode === 'PAPER' && <CheckCircle2 className="w-4 h-4 text-amber-500" />}
            </div>
            <p className="text-[11px] text-dim">
              {isFa
                ? `$${Math.round(demoBalDisplay).toLocaleString('en-US')} اعتبار شبیه‌سازی با قیمت واقعی بازار — بدون ریسک مالی.`
                : `$${Math.round(demoBalDisplay).toLocaleString('en-US')} virtual capital on real market prices.`}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setGateTradingMode('LIVE')}
            className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
              gateTradingMode === 'LIVE'
                ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40'
                : 'surface-soft hairline hover:border-[var(--line-strong)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-main inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-jade" />
                <span>{isFa ? 'حساب واقعی (Trust Wallet)' : 'Real Mode (Trust Wallet)'}</span>
              </span>
              {gateTradingMode === 'LIVE' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            </div>
            <p className="text-[11px] text-dim">
              {isFa
                ? `اتصال غیرامانی با حداقل $10 موجودی · ${freeTradesLim} معامله سودده اول ۰٪ کارمزد.`
                : `Non-custodial Trust Wallet ($10+ min) · first ${freeTradesLim} wins 0% fee.`}
            </p>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <label className="flex items-start gap-2.5 text-xs font-bold text-main cursor-pointer select-none">
            <input
              type="checkbox"
              checked={riskChecked || hasAcceptedRisk}
              onChange={(e) => setRiskChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#059669]"
            />
            <span>
              {isFa
                ? 'قوانین پلتفرم دلارینو، غیرامانی بودن کیف‌پول و مسئولیت کامل ریسک معاملات را مطالعه کردم و می‌پذیرم.'
                : 'I read and accept Dollarino non-custodial rules and full trading risk responsibility.'}
            </span>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRiskChecked(hasAcceptedRisk);
                setRiskModalOpen(true);
              }}
              className="btn-ghost px-3 py-2.5 rounded-xl text-[11px] font-bold"
            >
              {isFa ? 'مشاهده متن قوانین' : 'Read Terms'}
            </button>
            <button
              type="button"
              disabled={busy || (!riskChecked && !hasAcceptedRisk)}
              onClick={() => void completePreTradeOnboarding(gateTradingMode)}
              className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black disabled:opacity-45 inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFa ? 'تایید حالت و قوانین ریسک' : 'Confirm Mode & Terms'}</span>
            </button>
          </div>
        </div>
      </section>
    );
  };

  if (uiMode === 'simple') {
    const activeExLabel =
      data.config.trading_mode === 'LIVE' ? (
        isFa ? 'پول واقعی (Trust Wallet)' : 'Real Money (Trust Wallet)'
      ) : isFa ? (
        <>
          پول آزمایشی قابل تنظیم (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>)
        </>
      ) : (
        'Custom Demo ($50–$10M)'
      );

    const feeEnf = data.serverFeeSummary?.enforcement;

    return (
      <div className="space-y-5 max-w-5xl mx-auto">
        {renderPreTradeOnboardingBanner()}

        {/* Fee Warning Banner (Non-blocking on open positions: 3% server fee after 3 free live profit trades) */}
        {feeEnf && (feeEnf.lockStatus === 'LOCKED' || feeEnf.lockStatus === 'WARNING') && (
          <div
            className={`rounded-3xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
              feeEnf.lockStatus === 'LOCKED'
                ? 'bg-rose-500/15 border-rose-500/40'
                : 'bg-amber-500/15 border-amber-500/40'
            }`}
          >
            <div className="space-y-0.5">
              <p className="font-black text-main flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {feeEnf.lockStatus === 'LOCKED'
                    ? isFa
                      ? `ورود جدید واقعی تا تسویه کارمزد ۳٪ ($${feeEnf.totalDueUsd.toFixed(2)}) متوقف است`
                      : `New LIVE entries paused until $${feeEnf.totalDueUsd.toFixed(2)} (3% fee) settlement`
                    : isFa
                      ? `مهلت تسویه کارمزد ۳٪: ${feeEnf.hoursRemaining ?? 72} ساعت فرصت دارید ($${feeEnf.totalDueUsd.toFixed(2)})`
                      : `3% fee settlement deadline: ${feeEnf.hoursRemaining ?? 72}h left ($${feeEnf.totalDueUsd.toFixed(2)})`}
                </span>
              </p>
              <p className="text-sub">
                {isFa
                  ? 'پوزیشن‌های باز فعلی همچنان تا رسیدن به حد سود/ضرر مدیریت می‌شوند و کیف‌پول دمو رایگان همیشه باز است.'
                  : 'Existing open positions continue to be managed until close; free demo simulation remains open.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-black shrink-0 inline-flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isFa ? 'تسویه سریع کارمزد' : 'Settle Fee'}</span>
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

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setHideBal((v) => !v)}
                className="ios-glass-btn h-8 w-8 rounded-full grid place-items-center"
                aria-label="Toggle balance"
              >
                {hideBal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {onOpenAcademy && (
                <button
                  type="button"
                  onClick={onOpenAcademy}
                  className="ios-glass-btn h-8 px-3 rounded-full text-[11px] font-black inline-flex items-center gap-1"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{isFa ? 'آموزش ساده' : 'Guide'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-5 items-end">
            <div className="lg:col-span-7 space-y-3">
              <p className="text-xs font-bold text-white/80">
                {data.config.trading_mode === 'LIVE'
                  ? isFa
                    ? 'موجودی حساب واقعی (Trust Wallet)'
                    : 'Your Real Trust Wallet Balance'
                  : isFa
                    ? 'موجودی کیف‌پول دمو (آزمایشی)'
                    : 'Your Demo Account Balance'}
              </p>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-white tracking-tight font-num drop-shadow">
                  {hideBal
                    ? '••••••'
                    : `$${totalEq.toLocaleString('en-US', {
                        minimumFractionDigits: data.config.trading_mode === 'LIVE' && totalEq < 100 ? 2 : 0,
                        maximumFractionDigits: 2,
                      })}`}
                </span>
                {!hideBal && isFa && (
                  <span className="text-base sm:text-lg font-black text-amber-200">
                    ({formatTomanEq(totalEq, liveIranIrt)} تومان)
                  </span>
                )}
              </div>
              {!hideBal && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/90 font-semibold leading-relaxed">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>
                      {isFa
                        ? `نرخ لحظه‌ای تتر (${iranSourceLabel}): ${Math.round(liveIranIrt).toLocaleString('en-US')} ت · ${freeTradesRem > 0 ? `${freeTradesRem}/${freeTradesLim} معامله اول رایگان · ` : ''}فقط ۳٪ از سود واقعی`
                        : `Live USDT/IRT (${iranSourceLabel}): ${Math.round(liveIranIrt).toLocaleString('en-US')} · ${freeTradesRem}/${freeTradesLim} Free Live Wins · 3% Profit Fee`}
                    </span>
                  </span>
                  {data.config.trading_mode === 'PAPER' && (
                    <button
                      type="button"
                      onClick={() => setPaperResetOpen((v) => !v)}
                      className="ios-glass-btn h-6 px-2.5 rounded-full text-[10px] font-black inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3 text-amber-300" />
                      <span>{isFa ? 'تغییر موجودی دمو' : 'Edit Demo $'}</span>
                    </button>
                  )}
                </div>
              )}

              {renderBotBudgetCard('glass')}

              {paperResetOpen && data.config.trading_mode === 'PAPER' && (
                <div className="rounded-2xl bg-black/35 border border-white/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
                    {[100, 1000, 10000, 100000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={busy}
                        onClick={() => void applyCustomPaperBalance(preset)}
                        className="ios-glass-btn px-2.5 py-1 rounded-lg"
                      >
                        ${preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={10000000}
                      value={customPaperInput}
                      onChange={(e) => setCustomPaperInput(e.target.value)}
                      placeholder="10000"
                      dir="ltr"
                      className="w-32 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/25 text-white text-xs font-num"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyCustomPaperBalance(Number(customPaperInput || 10000))}
                      className="ios-glass-emerald-btn px-3 py-1.5 rounded-xl text-[11px] font-black"
                    >
                      {isFa ? 'اعمال موجودی دمو' : 'Apply'}
                    </button>
                  </div>
                </div>
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
                    {isFa ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Gamepad2 className="w-3.5 h-3.5" />
                        <span>کیف‌پول دمو (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${Math.round(demoBalDisplay).toLocaleString('en-US')}</span>)</span>
                      </span>
                    ) : (
                      `Demo ($${Math.round(demoBalDisplay).toLocaleString('en-US')})`
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'LIVE' })}
                    className={`px-3.5 py-1.5 rounded-xl transition ${
                      data.config.trading_mode === 'LIVE' ? 'ios-glass-emerald-btn' : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {isFa ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>پول واقعی (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${liveBalDisplay.toLocaleString('en-US', { minimumFractionDigits: liveBalDisplay < 10 ? 2 : 0, maximumFractionDigits: 2 })}</span>)</span>
                      </span>
                    ) : (
                      `Real Trust ($${liveBalDisplay.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
                    )}
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
                onClick={() => {
                  tgHaptic('medium');
                  if (isRunning) {
                    setStopConfirmOpen(true);
                    return;
                  }
                  runWithRiskCheck(async () => {
                    setBusy(true);
                    try {
                      const nextEngines: TradingEngineChoice[] =
                        activeEngines.length > 0 ? activeEngines : ['CENTRAL_AI'];
                      await apiFetch('/api/trading/bot/start', {
                        method: 'POST',
                        body: JSON.stringify({
                          activeEngines: nextEngines,
                          scanScope: 'ALL_MARKET',
                          tradeExecutionMode: execMode,
                          acceptRiskTerms: true,
                        }),
                      });
                      tgNotifyHaptic('success');
                      toastMsg(isFa ? `عالی! ربات با ${nextEngines.length} موتور فعال روشن شد` : 'Bot started');
                      await onRefresh();
                    } catch (e) {
                      toastMsg(e instanceof Error ? e.message : 'Start failed', true);
                    } finally {
                      setBusy(false);
                    }
                  });
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

        {/* 2. STEP 1: CLEAN UNIFIED 5-ENGINE SELECTOR (CONCURRENT) */}
        <section className="panel rounded-[28px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa ? 'قدم ۱: انتخاب موتورهای ربات (قابل اجرا به‌صورت همزمان)' : 'Step 1: Choose Bot Engines (Run Simultaneously)'}
              </h2>
              <p className="text-xs text-dim mt-0.5">
                {isFa
                  ? 'روی هر کارت بزنید تا روشن یا خاموش شود — می‌توانید همزمان هوش مصنوعی، استراتژی، کپی‌ترید و اسنایپر را با هم فعال کنید.'
                  : 'Tap any engine card to toggle ON/OFF — combine AI, Strategy, Copy Trade, and Sniper freely.'}
              </p>
            </div>
            <span className="text-[11px] font-black px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399]">
              {isFa ? `${activeEngines.length} موتور فعال` : `${activeEngines.length} Active`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                engine: 'CENTRAL_AI' as TradingEngineChoice,
                img: '/images/transparent/ai-brain-3d.png',
                badge: isFa ? 'پیشنهادی' : 'SMART AI',
                title: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino Smart AI',
                desc: isFa ? 'تحلیل خودکار کل بازار ۲۴ ساعته و شکار امن‌ترین موقعیت‌ها.' : 'Watches the full market 24/7 and picks high-probability entries.',
                actionLabel: isFa ? 'تنظیمات مدل ←' : 'Model Settings →',
                onAction: () => {
                  setSimpleModel('ai');
                  if (!activeEngines.includes('CENTRAL_AI')) void toggleEngineChoice('CENTRAL_AI', true);
                },
              },
              {
                engine: 'STRATEGY' as TradingEngineChoice,
                img: '/images/transparent/mascot-astronaut.png',
                badge: isFa ? 'آماده و سریع' : 'STRATEGY',
                title: isFa ? 'استراتژی شکار دُرنا' : 'Dorna Hunter Plan',
                desc: isFa ? 'بهترین استراتژی‌های تاییدشده دلارینو یا کد شخصی شما.' : 'Pre-tuned Dollarino hunter rules or your custom script.',
                actionLabel: isFa ? 'بررسی استراتژی ←' : 'View Strategy →',
                onAction: () => {
                  setSimpleModel('hunting');
                  if (!activeEngines.includes('STRATEGY')) void toggleEngineChoice('STRATEGY', true);
                },
              },
              {
                engine: 'MY_AI' as TradingEngineChoice,
                img: '/images/transparent/my-ai-brain-3d.png?v=1165',
                badge: isFa ? 'قابل آموزش' : 'PERSONAL AI',
                title: isFa ? 'هوش مصنوعی شخصی من' : 'My Personal AI',
                desc: isFa ? 'با قوانین و سبک معامله خودت به ربات آموزش بده.' : 'Trades exclusively according to rules you teach in chat.',
                actionLabel: isFa ? 'آموزش هوش من ←' : 'Train My AI →',
                onAction: () => onNavigate('myai'),
              },
              {
                engine: 'COPY_TRADE' as TradingEngineChoice,
                img: '/images/transparent/trophy-copy-3d.png',
                badge: isFa ? 'کپی‌ترید' : 'COPY PROS',
                title: isFa ? 'کپی از حرفه‌ای‌ها' : 'Verified Copy-Trade',
                desc: isFa ? 'آینه‌سازی لحظه‌ای معاملات تریدرهای برتر تاییدشده.' : 'Automatically mirror verified top-performing traders.',
                actionLabel: isFa ? 'تریدرهای برتر ←' : 'Pick Traders →',
                onAction: () => {
                  setSimpleModel('copy');
                  if (!activeEngines.includes('COPY_TRADE')) void toggleEngineChoice('COPY_TRADE', true);
                  sessionStorage.setItem('dollarino_copy_subtab', 'copy');
                  window.dispatchEvent(new CustomEvent('dollarino:copy-subtab', { detail: 'copy' }));
                  onNavigate('copy');
                },
              },
              {
                engine: 'LISTING_SNIPER' as TradingEngineChoice,
                img: '/images/transparent/sniper-rocket-3d.png?v=1165',
                badge: isFa ? 'لیستینگ و میم‌کوین' : 'SNIPER',
                title: isFa ? 'اسنایپر لیستینگ و میم‌کوین' : 'Listing & Meme Sniper',
                desc: isFa ? 'رصد لحظه‌ای لیستینگ‌های جدید و میم‌کوین‌های ایمن.' : 'Snipes fresh exchange listings & high-safety DEX gems.',
                actionLabel: isFa ? 'میز تنظیم و شکار ←' : 'Sniper Hub →',
                onAction: () => {
                  if (!activeEngines.includes('LISTING_SNIPER')) void toggleEngineChoice('LISTING_SNIPER', true);
                  sessionStorage.setItem('dollarino_copy_subtab', 'sniper');
                  window.dispatchEvent(new CustomEvent('dollarino:copy-subtab', { detail: 'sniper' }));
                  onNavigate('copy');
                },
              },
            ].map((item) => {
              const on = activeEngines.includes(item.engine);
              return (
                <div
                  key={item.engine}
                  onClick={() => void toggleEngineChoice(item.engine)}
                  className={`cursor-pointer p-4 rounded-3xl border text-start transition flex flex-col justify-between gap-3 h-full ${
                    on
                      ? 'border-[#059669] bg-emerald-500/10 ring-1 ring-[#059669]/35 shadow-sm'
                      : 'surface-soft border-[var(--line)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="space-y-2.5 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <img src={item.img} alt={item.title} className="w-12 h-12 object-contain shrink-0" />
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/15 text-[#0D47A1] dark:text-[#60A5FA] shrink-0">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-sm font-black text-main leading-snug">{item.title}</p>
                    <p className="text-[11.5px] text-dim leading-relaxed">{item.desc}</p>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div onClick={(ev) => ev.stopPropagation()}>
                      <button
                        type="button"
                        onClick={item.onAction}
                        className="w-full px-3 py-1.5 rounded-xl bg-sky-500/12 hover:bg-sky-500/20 text-[#0D47A1] dark:text-[#60A5FA] text-[11px] font-black transition text-center"
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                    <div
                      className="flex items-center justify-between gap-2 pt-2 border-t hairline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <span className={`text-[11px] font-black ${on ? 'text-[#059669] dark:text-[#34D399]' : 'text-dim'}`}>
                        {on ? (isFa ? 'فعال (هم‌زمان)' : 'Active') : isFa ? 'خاموش' : 'Off'}
                      </span>
                      <SlidingSwitch
                        checked={on}
                        size="sm"
                        accent="emerald"
                        disabled={busy}
                        ariaLabel={item.title}
                        onChange={() => void toggleEngineChoice(item.engine)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Simple Controls for the Chosen Mode */}
          <div className="pt-4 border-t hairline space-y-4">
            {simpleModel === 'copy' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-black text-main">
                    {isFa ? 'تریدرهای برتر تاییدشده (فالو کنید؛ ربات فقط با استارت دستی شما روشن می‌شود):' : 'Top Verified Traders (Follow without auto-starting bot):'}
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
                        <p className="text-xs font-black text-main truncate flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-jade shrink-0" />
                          <span className="truncate">{t.display_name}</span>
                        </p>
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
                            toastMsg(isFa ? `وضعیت فالو برای ${t.display_name} بروزرسانی شد` : `Updated ${t.display_name}`);
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
                        {t.is_following ? (isFa ? 'فالو شده ✓' : 'Following ✓') : isFa ? 'فالو' : 'Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-main">
                    {isFa ? (
                      <>
                        قدم ۲: مدیریت سرمایه هوشمند (<span dir="ltr" className="inline-block font-num" style={{ unicodeBidi: 'isolate' }}>${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')}</span>)
                      </>
                    ) : (
                      `Step 2: Capital Management ($${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')} Cap)`
                    )}
                  </p>
                  <span className="text-[11px] text-dim font-bold">
                    {isFa ? (
                      <>
                        اعداد زیر خودکار طبق سرمایه <span dir="ltr" className="inline-block font-num" style={{ unicodeBidi: 'isolate' }}>${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')}</span> محاسبه شده‌اند
                      </>
                    ) : (
                      `Auto-scaled for $${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')}`
                    )}
                  </span>
                </div>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {dynamicRiskPresets.map((p) => {
                    const active = currentPresetId === p.id;
                    const friendlyTitle =
                      p.id === 'conservative'
                        ? isFa ? 'خیلی ایمن و آروم' : 'Super Safe'
                        : p.id === 'balanced'
                          ? isFa ? 'متعادل (پیشنهادی)' : 'Balanced (Best)'
                          : isFa ? 'پرسرعت و جسور' : 'Aggressive';
                    const PresetIcon = p.id === 'conservative' ? ShieldCheck : p.id === 'balanced' ? Scale : Zap;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void patchConfig(
                            {
                              margin_pct: p.rec.marginPct,
                              max_leverage: p.rec.maxLeverage,
                              daily_max_loss_pct: p.rec.dailyMaxLossPct,
                              max_open_positions: p.rec.maxOpenPositions,
                              trailing_stop_pct: p.rec.trailingStopPct,
                              risk_profile_json: { preset: p.id },
                            },
                            isFa ? `تنظیم مدیریت سرمایه «${friendlyTitle}» اعمال شد: ${p.descFa}` : `${p.titleEn} saved`
                          )
                        }
                        className={`p-3.5 rounded-2xl border text-start transition space-y-1 ${
                          active ? 'border-[#059669] bg-emerald-500/12 ring-1 ring-[#059669]/30' : 'surface-soft border-transparent hover:border-[var(--line-strong)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-main inline-flex items-center gap-1.5">
                            <PresetIcon className="w-3.5 h-3.5 text-[var(--gold)]" />
                            <span>{friendlyTitle}</span>
                          </span>
                          {active && <CheckCircle2 className="w-4 h-4 text-[#059669]" />}
                        </div>
                        <p className="text-[11px] text-dim font-num">{isFa ? p.descFa : p.descEn}</p>
                      </button>
                    );
                  })}
                </div>
                {renderLeverageControl()}
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
                {isFa
                  ? `معاملات فعال الان (${totalOpenPositionsCount})`
                  : `Active Now (${totalOpenPositionsCount})`}
              </button>
              <button
                type="button"
                onClick={() => setSimpleTradesTab('closed')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black ${simpleTradesTab === 'closed' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? `معاملات قبلی (${data.closedTrades.length})` : `History (${data.closedTrades.length})`}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {simpleTradesTab === 'open' && openPnlBreakdown.profitableCount > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeBatchPositions('ALL_PROFITABLE')}
                  className="px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs"
                >
                  <span>{isFa ? `برداشت همه سودها (${openPnlBreakdown.profitableCount})` : `Take All Profit (${openPnlBreakdown.profitableCount})`}</span>
                </button>
              )}
              {simpleTradesTab === 'open' && openPnlBreakdown.losingCount > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeBatchPositions('ALL_LOSING')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white border border-rose-500/30 text-[11px] font-black inline-flex items-center gap-1"
                >
                  <span>{isFa ? `بستن همه ضررها (${openPnlBreakdown.losingCount})` : `Close All Losing (${openPnlBreakdown.losingCount})`}</span>
                </button>
              )}
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
          ) : totalOpenPositionsCount === 0 ? (
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
                const srcLabel = isFa ? pos.source_label_fa || 'ربات خودکار' : pos.source_label_en || 'Auto Bot';
                return (
                  <div key={pos.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CoinIcon symbol={pos.symbol} size={34} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-black text-xs text-main truncate">
                            {pos.symbol.replace('USDT', '')} · {pos.direction === 'LONG' ? (isFa ? 'خرید' : 'Long') : isFa ? 'فروش' : 'Short'}
                          </p>
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/12 text-brand text-[9.5px] font-bold shrink-0">
                            {srcLabel}
                          </span>
                        </div>
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

              {openDexTrades.map((d) => {
                const pnl = Number(d.unrealized_pnl_usd || 0);
                const isProfit = pnl >= 0;
                const srcLabel = isFa ? d.source_label_fa || 'اسنایپر / DEX' : d.source_label_en || 'DEX / Sniper';
                return (
                  <div key={d.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChainLogo chain={d.chain_id} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-black text-xs text-main truncate">
                            {d.token_symbol} · <span className="uppercase text-[10px] text-amber-500">{d.chain_id}</span>
                          </p>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[9.5px] font-bold shrink-0">
                            {srcLabel}
                          </span>
                        </div>
                        <p dir="ltr" className={`text-xs font-black font-num ${isProfit ? 'text-[#059669] dark:text-[#34D399]' : 'text-loss'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}{' '}
                          <span className="text-[10px] text-dim font-normal">({formatTomanEq(Math.abs(pnl), liveIranIrt)} ت)</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeDexPosition(d.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 ${
                        d.status === 'PENDING_SIGN'
                          ? 'bg-amber-500/15 text-amber-500'
                          : isProfit
                            ? 'bg-[#059669] hover:bg-[#047857] text-white'
                            : 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                      }`}
                    >
                      {d.status === 'PENDING_SIGN'
                        ? isFa
                          ? 'لغو انتظار'
                          : 'Cancel'
                        : isProfit
                          ? isFa
                            ? 'برداشت سود'
                            : 'Take Profit'
                          : isFa
                            ? 'بستن معامله'
                            : 'Close'}
                    </button>
                  </div>
                );
              })}

              {openSmartCopy.map((cp) => {
                const pnl = Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
                const isProfit = pnl >= 0;
                return (
                  <div key={cp.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChainLogo chain={cp.chain_id} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-black text-xs text-main truncate">{cp.token_symbol}</p>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-jade text-[9.5px] font-bold shrink-0">
                            {isFa ? cp.source_label_fa || `کپی ${cp.trader_label}` : cp.source_label_en || `Copy ${cp.trader_label}`}
                          </span>
                        </div>
                        <p dir="ltr" className={`text-xs font-black font-num ${isProfit ? 'text-[#059669] dark:text-[#34D399]' : 'text-loss'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}{' '}
                          <span className="text-[10px] text-dim font-normal">({formatTomanEq(Math.abs(pnl), liveIranIrt)} ت)</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeSmartCopyPosition(cp.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black shrink-0 ${
                        isProfit ? 'bg-[#059669] hover:bg-[#047857] text-white' : 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                      }`}
                    >
                      {isProfit ? (isFa ? 'برداشت سود' : 'Take Profit') : isFa ? 'بستن معامله' : 'Close'}
                    </button>
                  </div>
                );
              })}

              {openPerpOrders.map((po) => {
                const pnl = Number(po.unrealized_pnl_usd || 0);
                const isProfit = pnl >= 0;
                return (
                  <div key={po.id} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CoinIcon symbol={po.symbol} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-black text-xs text-main truncate">
                            {po.symbol} {po.leverage}×
                          </p>
                          <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 text-[9.5px] font-bold shrink-0">
                            {isFa ? po.source_label_fa || `Perp (${po.venue})` : po.source_label_en || `Perp (${po.venue})`}
                          </span>
                        </div>
                        <p dir="ltr" className={`text-xs font-black font-num ${isProfit ? 'text-[#059669] dark:text-[#34D399]' : 'text-loss'}`}>
                          {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}{' '}
                          <span className="text-[10px] text-dim font-normal">({formatTomanEq(Math.abs(pnl), liveIranIrt)} ت)</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePerpOrderPosition(po.id)}
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
      {renderPreTradeOnboardingBanner()}

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
              ? `اتصال انحصاری به Trust Wallet + کیف‌پول دمو قابل تنظیم: هر ۵ موتور (AI مرکزی، AI شخصی، دُرنا، کپی‌ترید و اسنایپر لیستینگ/میم) همزمان و بدون تداخل کار می‌کنند. ${freeTradesLim} معامله سودده اول ۰٪ کارمزد!`
              : `Exclusive Trust Wallet + Customizable Demo desk: run all 5 engines simultaneously without mutual exclusion. First ${freeTradesLim} profitable live trades 0% fee!`}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStartStop()}
              className={`h-11 inline-flex items-center gap-2 font-black px-5 rounded-2xl text-xs sm:text-sm transition ${
                isRunning ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white' : 'btn-gold'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isRunning ? (isFa ? 'توقف ربات' : 'Stop Bot') : isFa ? 'شروع خودکار ربات' : 'Start Auto-Trading'}</span>
            </button>

            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="btn-emerald h-11 inline-flex items-center gap-2 font-black px-5 rounded-2xl text-xs sm:text-sm"
            >
              <WandSparkles className="w-4 h-4" />
              <span>{isFa ? 'راه‌اندازی ۴ مرحله‌ای' : 'Setup Wizard'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terminal')}
              className="btn-ghost h-11 inline-flex items-center gap-2 font-bold px-4 rounded-2xl text-xs sm:text-sm"
            >
              <span>{isFa ? 'پایانه و چارت AI' : 'Pro Terminal'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void resetConfigToDefaults(currentPresetId)}
              className="btn-ghost h-11 inline-flex items-center gap-1.5 font-bold px-4 rounded-2xl text-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {isFa
                  ? `تنظیم مدیریت سرمایه ($${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')})`
                  : `Capital Management ($${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')})`}
              </span>
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
                    {isFa ? (
                      <>
                        دمو (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${Math.round(demoBalDisplay).toLocaleString('en-US')}</span>)
                      </>
                    ) : (
                      `Demo ($${Math.round(demoBalDisplay).toLocaleString('en-US')})`
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void switchTrustExecution({ tradingMode: 'LIVE' })}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      data.config.trading_mode === 'LIVE' ? 'ios-glass-emerald-btn' : 'text-white/75 hover:text-white'
                    }`}
                  >
                    {isFa ? (
                      <>
                        تراست‌ولت واقعی (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${liveBalDisplay.toLocaleString('en-US', { minimumFractionDigits: liveBalDisplay < 10 ? 2 : 0, maximumFractionDigits: 2 })}</span>)
                      </>
                    ) : (
                      `Trust Live ($${liveBalDisplay.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
                    )}
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
                  {data.config.trading_mode === 'PAPER' && (
                    <button
                      type="button"
                      onClick={() => setPaperResetOpen((v) => !v)}
                      className="ios-glass-btn px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3 text-amber-300" />
                      <span>{isFa ? 'تنظیم موجودی دمو' : 'Set Demo $'}</span>
                    </button>
                  )}
                  <span className="ios-glass-btn px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{Math.round(liveIranIrt).toLocaleString('en-US')} ت ({iranSourceLabel})</span>
                  </span>
                </div>
                <div dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-white mt-1 font-num">
                  {hideBal ? '••••••' : <AnimatedNumber value={totalEq} format={(n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />}
                </div>
                {paperResetOpen && data.config.trading_mode === 'PAPER' && (
                  <div className="mt-2 rounded-2xl bg-black/45 border border-white/25 p-2.5 space-y-2">
                    <div className="flex flex-wrap gap-1 text-[10px] font-black">
                      {[100, 1000, 10000, 100000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={busy}
                          onClick={() => void applyCustomPaperBalance(preset)}
                          className="ios-glass-btn px-2 py-0.5 rounded-lg"
                        >
                          ${preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={50}
                        max={10000000}
                        value={customPaperInput}
                        onChange={(e) => setCustomPaperInput(e.target.value)}
                        dir="ltr"
                        className="w-28 px-2 py-1 rounded-lg bg-black/50 border border-white/25 text-white text-xs font-num"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void applyCustomPaperBalance(Number(customPaperInput || 10000))}
                        className="ios-glass-emerald-btn px-2.5 py-1 rounded-lg text-[10px] font-black"
                      >
                        {isFa ? 'اعمال' : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
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

            {renderBotBudgetCard('glass')}

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
            <ProDropdown
              value={activeStrategy}
              disabled={busy}
              align="end"
              menuMinWidthClass="min-w-[240px]"
              options={ALL_STRATEGIES.map((s) => ({
                value: s.key,
                label: isFa ? s.labelFa : s.labelEn,
              }))}
              onChange={(nextKey) =>
                void patchConfig(
                  {
                    strategy_key: nextKey,
                    ai_gate_enabled:
                      nextKey === 'ai_autonomous_agent' || nextKey === 'my_custom_ai' ? 1 : 0,
                  },
                  isFa ? 'استراتژی فعال تغییر کرد' : 'Strategy updated'
                )
              }
            />

            <ProDropdown
              value={(data.config.entry_timeframe || '15m') as Timeframe}
              disabled={busy}
              align="end"
              menuMinWidthClass="min-w-[130px]"
              options={(['1m', '5m', '15m', '1h', '4h'] as Timeframe[]).map((tf) => ({
                value: tf,
                label: `TF: ${tf}`,
              }))}
              onChange={(nextTf) =>
                void patchConfig({ entry_timeframe: nextTf }, isFa ? `تایم‌فریم روی ${nextTf} تنظیم شد` : 'Timeframe updated')
              }
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {[
            {
              id: 'ai' as const,
              engine: 'CENTRAL_AI' as const,
              active: activeEngines.includes('CENTRAL_AI'),
              img: '/images/transparent/ai-brain-3d.png',
              roundedImg: false,
              code: isFa ? 'هوش مرکزی' : 'DOLLARINO AI',
              title: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI',
              desc: isFa ? 'اجماع چند مدل هوش مصنوعی روی ساختار بازار بدون نیاز به کلید API شخصی.' : 'Consensus Multi-LLM engine managed centrally by Dollarino.',
              win: 74,
              color: '#e8c15a',
              onClick: () => void toggleEngineChoice('CENTRAL_AI'),
            },
            {
              id: 'myai' as const,
              engine: 'MY_AI' as const,
              active: activeEngines.includes('MY_AI'),
              img: '/images/transparent/my-ai-brain-3d.png?v=1165',
              roundedImg: false,
              code: isFa ? 'هوش شخصی' : 'PERSONAL AI',
              title: isFa ? 'هوش مصنوعی شخصی من' : 'Raw Personal AI',
              desc: isFa ? 'به زبان فارسی به ربات یاد بده چطور معامله کند و همزمان با بقیه اجرا شود.' : 'Teach your personal AI rules in chat and run concurrently 24/7.',
              win: 76,
              color: '#a855f7',
              onClick: () => void toggleEngineChoice('MY_AI'),
            },
            {
              id: 'dorna' as const,
              engine: 'STRATEGY' as const,
              active: activeEngines.includes('STRATEGY'),
              img: '/images/transparent/mascot-astronaut.png',
              roundedImg: false,
              code: isFa ? 'شکار · ۲ بخش' : 'STRATEGY',
              title: isFa ? 'استراتژی شکار' : 'Hunting Strategy',
              desc: isFa
                ? 'دارای ۲ بخش: ۱) استراتژی‌های آماده (دُرنا V1، KBOS، SP2L) و ۲) استراتژی شخصی شما.'
                : '2 sub-modes: Our preset hunters (Dorna V1, KBOS, SP2L) OR your custom Pine/Python strategy.',
              win: 68,
              color: '#10d9a3',
              onClick: () => void toggleEngineChoice('STRATEGY'),
            },
            {
              id: 'copy' as const,
              engine: 'COPY_TRADE' as const,
              active: activeEngines.includes('COPY_TRADE'),
              img: '/images/transparent/trophy-copy-3d.png',
              roundedImg: false,
              code: isFa ? 'کپی‌ترید' : 'COPY TRADE',
              title: isFa ? 'کپی‌ترید تاییدشده دلارینو' : 'Verified Copy-Trade',
              desc: isFa ? 'آینه‌سازی معاملات تریدرهای فالو‌شده (با روشن کردن این موتور و زدن شروع اجرا می‌شود).' : 'Mirror followed traders & smart wallets when this engine & bot are active.',
              win: 79,
              color: '#38e1ff',
              onClick: () => void toggleEngineChoice('COPY_TRADE'),
            },
            {
              id: 'sniper' as const,
              engine: 'LISTING_SNIPER' as const,
              active: activeEngines.includes('LISTING_SNIPER'),
              img: '/images/transparent/sniper-rocket-3d.png?v=1165',
              roundedImg: false,
              code: isFa ? 'شکار لیستینگ' : 'SNIPER',
              title: isFa ? 'اسنایپر لیستینگ و میم‌کوین' : 'New Listing & Meme Sniper',
              desc: isFa ? 'شکار خودکار ارزهای تازه‌لیست‌شده صرافی‌ها و میم‌کوین‌های انفجاری ایمن DEX.' : 'Auto-snipes fresh CEX listings & safe booming DEX meme tokens.',
              win: 81,
              color: '#f97316',
              onClick: () => void toggleEngineChoice('LISTING_SNIPER'),
            },
          ].map((e) => (
            <div
              key={e.id}
              onClick={e.onClick}
              className={`cursor-pointer panel panel-hover rounded-[24px] p-4 sm:p-5 flex flex-col justify-between gap-3 relative transition ${
                e.active ? 'border-[#059669]/60 ring-1 ring-[#059669]/35 bg-emerald-500/[0.06] shadow-sm' : ''
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  {e.roundedImg ? (
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#07152e] ring-1 ring-white/15 shrink-0">
                      <img src={e.img} alt={e.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <img src={e.img} alt={e.title} className="w-12 h-12 object-contain shrink-0" />
                  )}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full" style={{ background: `${e.color}1c`, color: e.color }}>
                      {e.code}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full surface-soft border hairline text-dim font-num">
                      {isFa ? `نرخ برد ${e.win}%` : `${e.win}% WR`}
                    </span>
                  </div>
                </div>
                <h3 className="font-display font-bold text-sm sm:text-base text-main">{e.title}</h3>
                <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
              </div>
              <div className="space-y-2.5">
                {e.id === 'myai' && (
                  <div className="flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onNavigate('myai')}
                      className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand text-[10px] font-black hover:opacity-85"
                    >
                      {isFa ? 'آموزش و تنظیمات AI من' : 'Configure My AI'}
                    </button>
                  </div>
                )}
                {e.id === 'copy' && (
                  <div className="flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onNavigate('copy')}
                      className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand text-[10px] font-black hover:opacity-85"
                    >
                      {isFa ? 'لیست تریدرها و نهنگ‌ها' : 'Browse Traders'}
                    </button>
                  </div>
                )}
                {e.id === 'sniper' && (
                  <div className="flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem('dollarino_copy_subtab', 'sniper');
                        window.dispatchEvent(new CustomEvent('dollarino:copy-subtab', { detail: 'sniper' }));
                        onNavigate('copy');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-[#F97316] text-[10px] font-black hover:bg-amber-500/25"
                    >
                      {isFa ? 'ورود به میز اسنایپر ↗' : 'Open Sniper Hub ↗'}
                    </button>
                  </div>
                )}
                {e.id === 'dorna' && (
                  <div className="flex flex-wrap gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => void patchConfig({ strategy_key: 'dollarino_v01' }, isFa ? 'استراتژی آماده دُرنا V1 انتخاب شد' : 'Dorna V1 selected')}
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
                <div
                  className="flex items-center justify-between gap-2 pt-2.5 border-t hairline"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <span className={`text-[11px] font-black ${e.active ? 'text-[#059669] dark:text-[#34D399]' : 'text-dim'}`}>
                    {e.active ? (isFa ? 'فعال (هم‌زمان)' : 'Active (Concurrent)') : isFa ? 'خاموش' : 'Off'}
                  </span>
                  <SlidingSwitch
                    checked={e.active}
                    size="md"
                    accent="emerald"
                    disabled={busy}
                    ariaLabel={e.title}
                    onChange={() => e.onClick()}
                  />
                </div>
              </div>
            </div>
          ))}
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

      {/* 4. Dynamic Capital-Aware Risk Shield Preset + Market Scope */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="panel rounded-[26px] p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-lg text-main">
                {isFa ? '۲. تنظیمات مدیریت سرمایه و اهرم' : '2. Capital Management & Leverage'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa
                  ? `محاسبه‌شده برای سقف سرمایه مؤثر $${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')} ربات (باقی‌مانده: $${activeCapitalRes.remainingBudgetUsd.toLocaleString('en-US')})`
                  : `Auto-scaled to $${activeCapitalRes.effectiveCapitalUsd.toLocaleString('en-US')} bot cap ($${activeCapitalRes.remainingBudgetUsd.toLocaleString('en-US')} left)`}
              </p>
            </div>
            <button type="button" onClick={() => onNavigate('copy')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
              {isFa ? 'تنظیمات دقیق ریسک ←' : 'Fine-tune Risk →'}
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {dynamicRiskPresets.map((p) => {
              const on = currentPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void patchConfig(
                      {
                        margin_pct: p.rec.marginPct,
                        max_leverage: p.rec.maxLeverage,
                        daily_max_loss_pct: p.rec.dailyMaxLossPct,
                        max_open_positions: p.rec.maxOpenPositions,
                        trailing_stop_pct: p.rec.trailingStopPct,
                        risk_profile_json: JSON.stringify({ preset: p.id }),
                      },
                      isFa ? `پیش‌فرض بودجه «${p.titleFa}» برای $${activeCapitalRes.effectiveCapitalUsd} ذخیره شد` : `${p.titleEn} saved`
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
                  <div className="text-[11px] text-dim mt-1 leading-relaxed font-num">{isFa ? p.descFa : p.descEn}</div>
                </button>
              );
            })}
          </div>
          {renderLeverageControl()}
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
              <span>{isFa ? `معاملات باز (${totalOpenPositionsCount})` : `Open Positions (${totalOpenPositionsCount})`}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {openPnlBreakdown.profitableCount > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeBatchPositions('ALL_PROFITABLE')}
                  className="px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs"
                >
                  <span>{isFa ? `برداشت همه سودها (${openPnlBreakdown.profitableCount})` : `Take All Profit (${openPnlBreakdown.profitableCount})`}</span>
                </button>
              )}
              {openPnlBreakdown.losingCount > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeBatchPositions('ALL_LOSING')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white border border-rose-500/30 text-[11px] font-black inline-flex items-center gap-1"
                >
                  <span>{isFa ? `بستن همه ضررها (${openPnlBreakdown.losingCount})` : `Close All Losing (${openPnlBreakdown.losingCount})`}</span>
                </button>
              )}
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

          {totalOpenPositionsCount === 0 ? (
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
                const srcLabel = isFa ? pos.source_label_fa || 'ربات استراتژی' : pos.source_label_en || 'Strategy Bot';
                return (
                  <div key={pos.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <CoinIcon symbol={pos.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => { onSelectTerminalSymbol(pos.symbol); onNavigate('terminal'); }} className="font-bold text-sm text-main hover:underline">
                          {pos.symbol}
                        </button>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black ${pos.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                          {pos.direction} {pos.leverage}×
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-sky-500/12 text-brand">
                          {srcLabel}
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

              {openDexTrades.map((d) => {
                const uPnl = Number(d.unrealized_pnl_usd || 0);
                const up = uPnl >= 0;
                const srcLabel = isFa ? d.source_label_fa || 'DEX / اسنایپر' : d.source_label_en || 'DEX / Sniper';
                return (
                  <div key={d.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <ChainLogo chain={d.chain_id} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem('dollarino_copy_subtab', 'sniper');
                            window.dispatchEvent(new CustomEvent('dollarino:copy-subtab', { detail: 'sniper' }));
                            onNavigate('copy');
                          }}
                          className="font-bold text-sm text-main hover:underline"
                        >
                          {d.token_symbol}
                        </button>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-amber-500/15 text-amber-400 uppercase">
                          {d.chain_id} · {srcLabel}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Size ${Number(d.amount_usd).toFixed(2)} · Entry ${Number(d.entry_price_usd).toPrecision(4)} · Live ${Number(d.live_price_usd).toPrecision(4)}
                      </p>
                    </div>

                    <div className="ms-auto text-end">
                      <p dir="ltr" className={`font-num font-bold text-sm tabular ${up ? 'text-jade' : 'text-loss'}`}>
                        {up ? `+$${uPnl.toFixed(2)}` : `-$${Math.abs(uPnl).toFixed(2)}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeDexPosition(d.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-black transition inline-flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{d.status === 'PENDING_SIGN' ? (isFa ? 'لغو' : 'Cancel') : isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}

              {openSmartCopy.map((cp) => {
                const uPnl = Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
                const up = uPnl >= 0;
                return (
                  <div key={cp.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <ChainLogo chain={cp.chain_id} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => onNavigate('copy')} className="font-bold text-sm text-main hover:underline">
                          {cp.token_symbol}
                        </button>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-emerald-500/15 text-jade">
                          {isFa ? cp.source_label_fa || `کپی‌ترید (${cp.trader_label})` : cp.source_label_en || `Copy (${cp.trader_label})`}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Size ${Number(cp.margin_usd).toFixed(2)} · Entry ${Number(cp.entry_price_usd).toPrecision(4)} · Live ${Number(cp.live_price_usd ?? cp.current_price_usd).toPrecision(4)}
                      </p>
                    </div>

                    <div className="ms-auto text-end">
                      <p dir="ltr" className={`font-num font-bold text-sm tabular ${up ? 'text-jade' : 'text-loss'}`}>
                        {up ? `+$${uPnl.toFixed(2)}` : `-$${Math.abs(uPnl).toFixed(2)}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeSmartCopyPosition(cp.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-black transition inline-flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}

              {openPerpOrders.map((po) => {
                const uPnl = Number(po.unrealized_pnl_usd || 0);
                const up = uPnl >= 0;
                return (
                  <div key={po.id} className="rounded-2xl border hairline bg-[var(--soft)] p-3.5 flex flex-wrap items-center gap-3">
                    <CoinIcon symbol={po.symbol} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => onNavigate('markets')} className="font-bold text-sm text-main hover:underline">
                          {po.symbol}
                        </button>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-black ${/SELL|SHORT/i.test(po.side) ? 'bg-rose-500/15 text-loss' : 'bg-jade/15 text-jade'}`}>
                          {po.side} {po.leverage}×
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-violet-500/15 text-violet-400">
                          {isFa ? po.source_label_fa || `Perp DEX (${po.venue})` : po.source_label_en || `Perp DEX (${po.venue})`}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Margin ${Number(po.margin_usd).toFixed(2)} · Entry ${Number(po.entry_price).toFixed(2)}
                      </p>
                    </div>

                    <div className="ms-auto text-end">
                      <p dir="ltr" className={`font-num font-bold text-sm tabular ${up ? 'text-jade' : 'text-loss'}`}>
                        {up ? `+$${uPnl.toFixed(2)}` : `-$${Math.abs(uPnl).toFixed(2)}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePerpOrderPosition(po.id)}
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
