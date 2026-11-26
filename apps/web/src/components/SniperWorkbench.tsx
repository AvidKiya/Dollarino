import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Filter,
  Radar,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import { formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import { buildTrustWalletDappOpenUrl } from '../lib/trustwallet';
import type { SniperAdvancedFilters, SniperCandidate, SniperSettings, SniperTargetType } from '../lib/types';
import { SmoothSlider } from './SmoothSlider';

interface SniperWorkbenchProps {
  lang: Lang;
  uiMode: 'simple' | 'pro';
  tradingMode: 'PAPER' | 'LIVE';
  initialConfig?: Partial<SniperSettings>;
  onRefreshDashboard: () => Promise<void> | void;
  onRequireOnboardingGate?: () => void;
}

const CHAIN_OPTIONS = [
  { id: 'solana', labelFa: 'سولانا (SOL)', labelEn: 'Solana', badgeColor: 'border-violet-500/40 bg-violet-500/10 text-violet-400' },
  { id: 'bsc', labelFa: 'بی‌ان‌بی چین (BSC)', labelEn: 'BSC', badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  { id: 'base', labelFa: 'بیس (Base)', labelEn: 'Base', badgeColor: 'border-sky-500/40 bg-sky-500/10 text-sky-400' },
  { id: 'eth', labelFa: 'اتریوم (ETH)', labelEn: 'Ethereum', badgeColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400' },
  { id: 'ton', labelFa: 'تون (TON)', labelEn: 'TON', badgeColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' },
  { id: 'arbitrum', labelFa: 'آربیتروم (ARB)', labelEn: 'Arbitrum', badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400' },
  { id: 'polygon', labelFa: 'پالیگان (MATIC)', labelEn: 'Polygon', badgeColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400' },
  { id: 'sui', labelFa: 'سویی (SUI)', labelEn: 'Sui', badgeColor: 'border-teal-500/40 bg-teal-500/10 text-teal-400' },
] as const;

const AGE_PILLS: Array<{ mins: number; labelFa: string; labelEn: string }> = [
  { mins: 1, labelFa: '۱ دقیقه', labelEn: '1m' },
  { mins: 5, labelFa: '۵ دقیقه ⚡', labelEn: '5m ⚡' },
  { mins: 15, labelFa: '۱۵ دقیقه', labelEn: '15m' },
  { mins: 30, labelFa: '۳۰ دقیقه', labelEn: '30m' },
  { mins: 60, labelFa: '۱ ساعت', labelEn: '1h' },
  { mins: 360, labelFa: '۶ ساعت', labelEn: '6h' },
  { mins: 1440, labelFa: '۲۴ ساعت', labelEn: '24h' },
  { mins: 4320, labelFa: '۷۲ ساعت', labelEn: '72h' },
];

const DEFAULT_ADV: SniperAdvancedFilters = {
  sortBy: 'SCORE',
  minVolume5mUsd: 0,
  minVolume1hUsd: 0,
  minBuySellRatio: 0,
  requireSocials: false,
  minChange5mPct: -100,
  maxMcapUsd: 0,
};

const DEFAULT_SETTINGS: SniperSettings = {
  enabled: false,
  targetType: 'BOTH',
  budgetUsd: 25,
  minSafetyScore: 70,
  minLiquidityUsd: 15_000,
  maxPairAgeHours: 24,
  maxPairAgeMinutes: 1440,
  maxTaxPct: 5,
  tpPct: 35,
  slPct: 15,
  trailingEnabled: true,
  trailingPct: 8,
  maxOpenPositions: 3,
  autoExecute: true,
  slippagePct: 3,
  networks: ['solana', 'bsc', 'base'],
  advancedFilters: DEFAULT_ADV,
};

interface SniperRecentRow {
  id: string;
  token_symbol?: string;
  symbol?: string;
  chain_id?: string;
  chain?: string;
  token_address?: string;
  status: string;
  amount_usd: string | number;
  entry_price_usd?: string | number;
  entry_price?: string | number;
  realized_pnl_usd?: string | number;
  pnl_usd?: string | number;
  opened_at: string;
}

function buildQuickSwapDappLink(chainId?: string, tokenAddress?: string): string {
  const ch = (chainId || 'solana').toLowerCase();
  const addr = encodeURIComponent(tokenAddress || '');
  let dexUrl = `https://dexscreener.com/${encodeURIComponent(ch)}/${addr}`;
  if (ch === 'solana' && addr) dexUrl = `https://jup.ag/swap/SOL-${addr}`;
  else if (ch === 'bsc' && addr) dexUrl = `https://pancakeswap.finance/swap?outputCurrency=${addr}`;
  else if ((ch === 'eth' || ch === 'ethereum') && addr) dexUrl = `https://app.uniswap.org/swap?outputCurrency=${addr}`;
  else if (ch === 'base' && addr) dexUrl = `https://app.uniswap.org/swap?chain=base&outputCurrency=${addr}`;
  else if (ch === 'arbitrum' && addr) dexUrl = `https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=${addr}`;
  else if (ch === 'ton' && addr) dexUrl = `https://app.ston.fi/swap?ft=TON&tt=${addr}`;
  return buildTrustWalletDappOpenUrl(dexUrl);
}

function formatAgeText(cand: SniperCandidate, isFa: boolean): string {
  const hrsVal = cand.ageHours ?? cand.pairAgeHours ?? null;
  const mins =
    cand.ageMinutes !== null && cand.ageMinutes !== undefined
      ? cand.ageMinutes
      : typeof hrsVal === 'number'
        ? Math.round(hrsVal * 60)
        : undefined;
  if (mins === undefined || !Number.isFinite(mins)) return isFa ? 'جدید' : 'New';
  if (mins < 60) return isFa ? `${Math.max(1, mins)} دقیقه` : `${Math.max(1, mins)}m`;
  const hrs = mins / 60;
  if (hrs < 48) return isFa ? `${hrs.toFixed(1)} ساعت` : `${hrs.toFixed(1)}h`;
  return isFa ? `${Math.round(hrs / 24)} روز` : `${Math.round(hrs / 24)}d`;
}

export function SniperWorkbench({
  lang,
  uiMode,
  tradingMode,
  initialConfig,
  onRefreshDashboard,
  onRequireOnboardingGate,
}: SniperWorkbenchProps) {
  const isFa = lang === 'fa';
  const [settings, setSettings] = useState<SniperSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...initialConfig,
    maxPairAgeMinutes:
      initialConfig?.maxPairAgeMinutes ??
      Math.round((initialConfig?.maxPairAgeHours ?? DEFAULT_SETTINGS.maxPairAgeHours) * 60),
    advancedFilters: { ...DEFAULT_ADV, ...(initialConfig?.advancedFilters || {}) },
  }));
  const [candidates, setCandidates] = useState<SniperCandidate[]>([]);
  const [recentSnipes, setRecentSnipes] = useState<SniperRecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [buyingAddr, setBuyingAddr] = useState<string | null>(null);
  const [confirmingTradeId, setConfirmingTradeId] = useState<string | null>(null);
  const [confirmTxHash, setConfirmTxHash] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const autoRefreshTimer = useRef<number | null>(null);

  const effectiveAgeMinutes = Math.max(
    1,
    settings.maxPairAgeMinutes ?? Math.round((settings.maxPairAgeHours || 24) * 60)
  );
  const adv = settings.advancedFilters ?? DEFAULT_ADV;

  const updateAgeMinutes = (mins: number) => {
    const clamped = Math.max(1, Math.min(4320, Math.round(mins)));
    setSettings((prev) => ({
      ...prev,
      maxPairAgeMinutes: clamped,
      maxPairAgeHours: Number((clamped / 60).toFixed(4)),
    }));
  };

  const updateAdv = (patch: Partial<SniperAdvancedFilters>) => {
    setSettings((prev) => ({
      ...prev,
      advancedFilters: { ...(prev.advancedFilters ?? DEFAULT_ADV), ...patch },
    }));
  };

  const loadSniperState = useCallback(async (preserveLocalFilters = false) => {
    try {
      const res = await apiFetch<{
        ok: boolean;
        settings: SniperSettings;
        candidates?: SniperCandidate[];
        recentSnipes?: SniperRecentRow[];
      }>('/api/trading/sniper');
      if (res.settings && !preserveLocalFilters) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...res.settings,
          maxPairAgeMinutes:
            res.settings.maxPairAgeMinutes ?? Math.round((res.settings.maxPairAgeHours || 24) * 60),
          advancedFilters: { ...DEFAULT_ADV, ...(res.settings.advancedFilters || {}) },
        });
      }
      if (Array.isArray(res.candidates) && !preserveLocalFilters) setCandidates(res.candidates);
      if (Array.isArray(res.recentSnipes)) setRecentSnipes(res.recentSnipes);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSniperState();
  }, [loadSniperState]);

  const handleConfirmPendingSnipe = async (tradeId: string) => {
    setActionBusyId(tradeId);
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${encodeURIComponent(tradeId)}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ txHash: confirmTxHash.trim() || undefined }),
      });
      setConfirmingTradeId(null);
      setConfirmTxHash('');
      pushFloatingToast(
        isFa ? 'شکار تایید و به پوزیشن‌های فعال منتقل شد!' : 'Sniper trade confirmed & active!',
        'success'
      );
      await loadSniperState();
      await onRefreshDashboard();
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'Confirm failed', 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCancelOrCloseSnipe = async (tradeId: string, isPending: boolean) => {
    setActionBusyId(tradeId);
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${encodeURIComponent(tradeId)}/close`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      pushFloatingToast(
        isPending
          ? isFa ? 'سفارش در انتظار امضا لغو شد' : 'Pending order cancelled'
          : isFa ? 'پوزیشن اسنایپر بسته شد' : 'Sniper position closed',
        'info'
      );
      await loadSniperState();
      await onRefreshDashboard();
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const toggleChain = (chainId: string) => {
    setSettings((prev) => {
      const exists = prev.networks.includes(chainId);
      const next = exists ? prev.networks.filter((c) => c !== chainId) : [...prev.networks, chainId];
      return { ...prev, networks: next.length > 0 ? next : [chainId] };
    });
  };

  const handleSaveSettings = async (override?: Partial<SniperSettings>, silentToast = false) => {
    const mergedAgeMins =
      override?.maxPairAgeMinutes ??
      (override?.maxPairAgeHours !== undefined ? Math.round(override.maxPairAgeHours * 60) : effectiveAgeMinutes);
    const payload: SniperSettings = {
      ...settings,
      ...override,
      maxPairAgeMinutes: mergedAgeMins,
      maxPairAgeHours: Number((mergedAgeMins / 60).toFixed(4)),
      advancedFilters: {
        ...DEFAULT_ADV,
        ...(settings.advancedFilters || {}),
        ...(override?.advancedFilters || {}),
      },
    };
    setSettings(payload);
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; settings: SniperSettings }>('/api/trading/sniper', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.settings) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...res.settings,
          maxPairAgeMinutes: res.settings.maxPairAgeMinutes ?? mergedAgeMins,
          advancedFilters: { ...DEFAULT_ADV, ...(res.settings.advancedFilters || {}) },
        });
      }
      if (!silentToast) {
        pushFloatingToast(
          isFa ? 'تنظیمات و فیلترهای اسنایپر ذخیره شد' : 'Sniper filters & risk rules saved',
          'success'
        );
      }
      await Promise.all([loadSniperState(), onRefreshDashboard()]);
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyPresetAndScan = async (presetId: '5M_DEGEN' | '1H_MOMENTUM' | 'SAFE_ANTIRUG' | 'CEX_EARLY') => {
    let patch: Partial<SniperSettings> = {};
    if (presetId === '5M_DEGEN') {
      patch = {
        targetType: 'DEX_BOOM_MEME',
        maxPairAgeMinutes: 5,
        minLiquidityUsd: 2000,
        minSafetyScore: 45,
        maxTaxPct: 10,
        slippagePct: 8,
        networks: ['solana', 'base', 'bsc', 'ton'],
        advancedFilters: {
          sortBy: 'NEWEST',
          minVolume5mUsd: 1000,
          minBuySellRatio: 1.0,
          minChange5mPct: 0,
          requireSocials: false,
        },
      };
    } else if (presetId === '1H_MOMENTUM') {
      patch = {
        targetType: 'DEX_BOOM_MEME',
        maxPairAgeMinutes: 60,
        minLiquidityUsd: 10_000,
        minSafetyScore: 60,
        maxTaxPct: 5,
        slippagePct: 4,
        networks: ['solana', 'bsc', 'base', 'eth'],
        advancedFilters: {
          sortBy: 'MOMENTUM_5M',
          minVolume5mUsd: 2500,
          minBuySellRatio: 1.25,
          minChange5mPct: 1,
          requireSocials: false,
        },
      };
    } else if (presetId === 'SAFE_ANTIRUG') {
      patch = {
        targetType: 'BOTH',
        maxPairAgeMinutes: 720,
        minLiquidityUsd: 35_000,
        minSafetyScore: 80,
        maxTaxPct: 3,
        slippagePct: 2,
        advancedFilters: {
          sortBy: 'SAFETY',
          minVolume5mUsd: 1000,
          minBuySellRatio: 1.1,
          minChange5mPct: -10,
          requireSocials: true,
        },
      };
    } else {
      patch = {
        targetType: 'CEX_NEW_LISTING',
        maxPairAgeMinutes: 1440,
        minLiquidityUsd: 25_000,
        minSafetyScore: 70,
        maxTaxPct: 2,
        slippagePct: 1.5,
        advancedFilters: {
          sortBy: 'LIQUIDITY',
          minVolume5mUsd: 0,
          minBuySellRatio: 0,
          minChange5mPct: -50,
          requireSocials: false,
        },
      };
    }

    await handleSaveSettings(patch, true);
    await handleScanNow(false, patch);
  };

  const handleScanNow = useCallback(async (executeTrades = false, overrideSettings?: Partial<SniperSettings>) => {
    setScanning(true);
    try {
      const merged = overrideSettings ? { ...settings, ...overrideSettings } : settings;
      const res = await apiFetch<{
        ok?: boolean;
        scannedCount?: number;
        boughtCount?: number;
        candidates?: SniperCandidate[];
        details?: string[];
      }>('/api/trading/sniper/scan-now', {
        method: 'POST',
        body: JSON.stringify({
          execute: executeTrades,
          maxPairAgeMinutes: merged.maxPairAgeMinutes ?? effectiveAgeMinutes,
          minLiquidityUsd: merged.minLiquidityUsd,
          minSafetyScore: merged.minSafetyScore,
          targetType: merged.targetType,
          networks: merged.networks,
          advancedFilters: merged.advancedFilters,
        }),
      });
      if (Array.isArray(res.candidates)) {
        setCandidates(res.candidates);
      }
      if (executeTrades && (res.boughtCount ?? 0) > 0) {
        pushFloatingToast(
          isFa
            ? `اسکن انجام شد: ${res.boughtCount} شکار جدید با موفقیت خریداری شد!`
            : `Scan complete: ${res.boughtCount} token(s) sniped!`,
          'success'
        );
      } else {
        pushFloatingToast(
          isFa
            ? `اسکن زنده تکمیل شد (${res.candidates?.length ?? res.scannedCount ?? 0} فرصت منطبق با فیلتر شما)`
            : `Live scan complete (${res.candidates?.length ?? res.scannedCount ?? 0} matched)`,
          'info'
        );
      }
      await Promise.all([loadSniperState(true), onRefreshDashboard()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onRequireOnboardingGate?.();
        window.dispatchEvent(new CustomEvent('dollarino:require-risk-terms'));
      }
      pushFloatingToast(err instanceof Error ? err.message : 'Scan failed', err instanceof ApiError && err.status === 403 ? 'warn' : 'error');
    } finally {
      setScanning(false);
    }
  }, [effectiveAgeMinutes, isFa, loadSniperState, onRefreshDashboard, onRequireOnboardingGate, settings]);

  useEffect(() => {
    if (autoRefreshTimer.current) {
      window.clearInterval(autoRefreshTimer.current);
      autoRefreshTimer.current = null;
    }
    if (autoRefresh) {
      autoRefreshTimer.current = window.setInterval(() => {
        void handleScanNow(false);
      }, 20_000);
    }
    return () => {
      if (autoRefreshTimer.current) window.clearInterval(autoRefreshTimer.current);
    };
  }, [autoRefresh, handleScanNow]);

  const handleBuyCandidate = async (cand: SniperCandidate) => {
    setBuyingAddr(cand.tokenAddress);
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; reason?: string }>('/api/trading/sniper/buy-candidate', {
        method: 'POST',
        body: JSON.stringify({ candidate: cand }),
      });
      if (res.ok) {
        pushFloatingToast(
          isFa
            ? `شکار ${cand.symbol} با مبلغ $${settings.budgetUsd} در حالت ${tradingMode === 'LIVE' ? 'واقعی' : 'دمو'} اجرا شد!`
            : `Sniped ${cand.symbol} ($${settings.budgetUsd})!`,
          'success'
        );
        await Promise.all([loadSniperState(), onRefreshDashboard()]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onRequireOnboardingGate?.();
        window.dispatchEvent(new CustomEvent('dollarino:require-risk-terms'));
      }
      pushFloatingToast(err instanceof Error ? err.message : 'Buy failed', err instanceof ApiError && err.status === 403 ? 'warn' : 'error');
    } finally {
      setBuyingAddr(null);
    }
  };

  return (
    <section
      id="sniper-workbench"
      className="panel-glass rounded-3xl p-4 sm:p-6 border border-amber-500/25 relative overflow-hidden space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b hairline pb-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/12 text-amber-500 flex items-center justify-center shrink-0">
            <Rocket className="w-6 h-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa ? 'شکارچی حرفه‌ای ارزهای جدید و میم‌کوین‌های زیر ۵ دقیقه' : 'Ultra-Fast 5m Degen & Listing Sniper'}
              </h3>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  settings.enabled
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : 'bg-slate-500/10 text-dim border-slate-500/20'
                }`}
              >
                {settings.enabled ? (isFa ? 'فعال و در حال رصد' : 'Active') : isFa ? 'آماده تنظیم' : 'Standby'}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                {effectiveAgeMinutes < 60
                  ? isFa ? `سقف سن: ${effectiveAgeMinutes} دقیقه` : `Max Age: ${effectiveAgeMinutes}m`
                  : isFa ? `سقف سن: ${(effectiveAgeMinutes / 60).toFixed(1)} ساعت` : `Max Age: ${(effectiveAgeMinutes / 60).toFixed(1)}h`}
              </span>
            </div>
            <p className="text-xs text-dim leading-relaxed">
              {isFa
                ? 'کشف لحظه‌ای استخرهای تازه‌لانچ DEX (از ۱ دقیقه به بالا) از GeckoTerminal & DexScreener و لیستینگ‌های CEX با فیلتر فشار خرید، حجم ۵ دقیقه و امنیت ضدراگ.'
                : 'Discover newly created 1m–72h DEX pools via GeckoTerminal & DexScreener plus CEX listings with 5m volume, buy/sell pressure, and anti-rug checks.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/35'
                : 'surface-soft text-dim hairline'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? (isFa ? 'اسکن خودکار ۲۰ث: روشن' : 'Auto 20s: ON') : isFa ? 'اسکن زنده هر ۲۰ث' : 'Auto 20s'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSaveSettings({ enabled: !settings.enabled })}
            disabled={saving}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1.5 ${
              settings.enabled
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 hover:bg-emerald-400'
                : 'surface-soft text-main border-amber-500/35 hover:border-amber-500'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{settings.enabled ? (isFa ? 'اسنایپر روشن' : 'Sniper ON') : isFa ? 'روشن کردن اسنایپر' : 'Enable Sniper'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleScanNow(false)}
            disabled={scanning}
            data-testid="sniper-scan-now-btn"
            className="px-3.5 py-2 rounded-xl text-xs font-bold btn-cobalt transition inline-flex items-center gap-1.5"
          >
            <Radar className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning...') : isFa ? 'اسکن زنده الان' : 'Scan Live'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSaveSettings()}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? '...' : isFa ? 'ذخیره فیلترها' : 'Save Filters'}</span>
          </button>
        </div>
      </div>

      {/* 4 1-Tap Pro Presets */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-black text-dim">
          {isFa ? 'پریست‌های سریع شکارچی (با یک کلیک فیلتر را تنظیم و اسکن زنده را اجرا می‌کند):' : 'Quick 1-Tap Hunter Presets (Applies filters & scans live immediately):'}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            {
              id: '5M_DEGEN' as const,
              icon: Zap,
              titleFa: 'شکار زیر ۵ دقیقه ⚡',
              titleEn: '5m Ultra-Fresh Degen',
              subFa: 'عمر ≤۵ دقیقه · نقدینگی $2k+ · سولانا/بیس/BSC/TON',
              subEn: 'Age ≤5m · Liq $2k+ · Fast DEX Launch',
              cls: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
            },
            {
              id: '1H_MOMENTUM' as const,
              icon: TrendingUp,
              titleFa: 'مومنتوم ۱ ساعته 🔥',
              titleEn: '1h Pump Momentum',
              subFa: 'عمر ≤۱ ساعت · نقدینگی $10k+ · فشار خرید >1.25x',
              subEn: 'Age ≤1h · Liq $10k+ · Buy/Sell >1.25x',
              cls: 'border-emerald-500/40 bg-emerald-500/10 text-jade',
            },
            {
              id: 'SAFE_ANTIRUG' as const,
              icon: ShieldCheck,
              titleFa: 'ایمن ضدراگ 🛡️',
              titleEn: 'Safe Anti-Rug',
              subFa: 'ایمنی ۸۰+ · نقدینگی $35k+ · فقط با سایت/سوشیال',
              subEn: 'Safety 80+ · Liq $35k+ · Verified Socials',
              cls: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
            },
            {
              id: 'CEX_EARLY' as const,
              icon: Sparkles,
              titleFa: 'لیستینگ صرافی‌ها 🏦',
              titleEn: 'CEX New Listings',
              subFa: 'ارزهای تازه لیست‌شده صرافی‌های متمرکز (24h)',
              subEn: 'Fresh CEX spot listings & early momentum',
              cls: 'border-violet-500/40 bg-violet-500/10 text-violet-400',
            },
          ].map((pr) => {
            const Icon = pr.icon;
            return (
              <button
                key={pr.id}
                type="button"
                data-testid={`sniper-preset-${pr.id}`}
                onClick={() => void applyPresetAndScan(pr.id)}
                className={`p-3 rounded-2xl border text-start transition hover:scale-[1.01] ${pr.cls}`}
              >
                <div className="flex items-center gap-1.5 font-black text-xs">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{isFa ? pr.titleFa : pr.titleEn}</span>
                </div>
                <p className="text-[10px] opacity-80 mt-1 leading-snug">{isFa ? pr.subFa : pr.subEn}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Minute-Level Pair Age Pills */}
      <div className="panel rounded-2xl p-3.5 border hairline space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black text-main flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{isFa ? 'حداکثر عمر جفت‌ارز (دقیقه‌ای تا چند روزه)' : 'Max Token / Pair Age Window'}</span>
          </span>
          <div className="flex items-center gap-1.5 text-[11px]" dir="ltr">
            <span className="text-dim">{isFa ? 'دقیقه سفارشی:' : 'Custom min:'}</span>
            <input
              type="number"
              min={1}
              max={4320}
              value={effectiveAgeMinutes}
              onChange={(e) => updateAgeMinutes(Number(e.target.value) || 5)}
              className="input-field w-20 rounded-lg px-2 py-1 text-xs font-bold font-num text-center"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AGE_PILLS.map((pill) => {
            const active = effectiveAgeMinutes === pill.mins;
            return (
              <button
                key={pill.mins}
                type="button"
                data-testid={`sniper-age-${pill.mins}m`}
                onClick={() => updateAgeMinutes(pill.mins)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'surface-soft text-dim hairline hover:text-main'
                }`}
              >
                {isFa ? pill.labelFa : pill.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode + Target + Primary Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3">
          <div className="panel rounded-2xl p-3.5 border hairline space-y-2.5">
            <p className="text-xs font-bold text-dim flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{isFa ? 'هدف شکارچی' : 'Target Radar'}</span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'BOTH', fa: 'ترکیبی (همه)', en: 'Both' },
                  { id: 'CEX_NEW_LISTING', fa: 'لیست صرافی‌ها', en: 'CEX Listings' },
                  { id: 'DEX_BOOM_MEME', fa: 'میم‌کوین DEX', en: 'DEX Memes' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, targetType: opt.id as SniperTargetType }))}
                  className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition text-center ${
                    settings.targetType === opt.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : 'surface-soft text-dim hairline hover:text-main'
                  }`}
                >
                  {isFa ? opt.fa : opt.en}
                </button>
              ))}
            </div>
          </div>

          <div className="panel rounded-2xl p-3.5 border hairline space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-dim flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-sky-400" />
                <span>{isFa ? 'نحوه اجرا' : 'Execution Mode'}</span>
              </span>
              <span className="text-[11px] font-bold text-amber-500">
                {tradingMode === 'LIVE' ? (isFa ? 'حساب واقعی' : 'LIVE') : isFa ? 'شبیه‌ساز دمو' : 'PAPER'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, autoExecute: true }))}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition ${
                  settings.autoExecute
                    ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40'
                    : 'surface-soft text-dim hairline'
                }`}
              >
                {isFa ? 'شکار خودکار ربات' : 'Auto-Snipe'}
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, autoExecute: false }))}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition ${
                  !settings.autoExecute
                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                    : 'surface-soft text-dim hairline'
                }`}
              >
                {isFa ? 'فقط هشدار و خرید دستی' : 'Alert + Manual'}
              </button>
            </div>
          </div>
        </div>

        {/* Budget, Safety & Networks */}
        <div className="lg:col-span-7 panel rounded-2xl p-4 border hairline space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-dim font-bold">{isFa ? 'بودجه هر شکار (دلار)' : 'Per-Snipe Budget'}</span>
                <span className="font-num font-bold text-main" dir="ltr">
                  ${settings.budgetUsd}{' '}
                  <span className="text-[10px] text-dim font-normal">({formatTomanEq(settings.budgetUsd)})</span>
                </span>
              </div>
              <SmoothSlider
                min={5}
                max={1000}
                step={5}
                value={settings.budgetUsd}
                onChange={(val) => setSettings((s) => ({ ...s, budgetUsd: val }))}
                accent="amber"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-dim font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{isFa ? 'حداقل امتیاز ایمنی ضدراگ' : 'Min Anti-Rug Score'}</span>
                </span>
                <span className="font-num font-bold text-emerald-500" dir="ltr">
                  {settings.minSafetyScore}/100
                </span>
              </div>
              <SmoothSlider
                min={30}
                max={95}
                step={5}
                value={settings.minSafetyScore}
                onChange={(val) => setSettings((s) => ({ ...s, minSafetyScore: val }))}
                accent="jade"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-dim font-bold">{isFa ? 'شبکه‌های هدف اسکن (۸ زنجیره)' : 'Target Networks (8 Chains)'}</span>
              <span className="text-[11px] text-dim">{settings.networks.length} {isFa ? 'فعال' : 'active'}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHAIN_OPTIONS.map((ch) => {
                const active = settings.networks.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChain(ch.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition ${
                      active ? ch.badgeColor : 'surface-soft text-dim border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    {isFa ? ch.labelFa : ch.labelEn}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pro & Advanced Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {showAdvancedFilters
                ? isFa ? 'بستن فیلترهای پیشرفته حجم و مدیریت ریسک ▴' : 'Hide Pro Volume & Risk Filters ▴'
                : isFa ? 'نمایش فیلترهای پیشرفته حجم ۵ دقیقه، فشار خرید و حد سود/ضرر ▾' : 'Show Pro 5m Volume & Risk Filters ▾'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleScanNow(true)}
            disabled={scanning}
            className="text-xs font-bold text-amber-500 hover:underline inline-flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isFa ? 'اسکن + شکار خودکار همین الان' : 'Scan & Auto-Snipe Now'}</span>
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'حداقل نقدینگی ($)' : 'Min Liquidity ($)'}</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settings.minLiquidityUsd}
                  onChange={(e) => setSettings((s) => ({ ...s, minLiquidityUsd: Math.max(1000, Number(e.target.value) || 1000) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'حداقل حجم ۵ دقیقه ($)' : 'Min 5m Volume ($)'}</label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={adv.minVolume5mUsd ?? 0}
                  onChange={(e) => updateAdv({ minVolume5mUsd: Math.max(0, Number(e.target.value) || 0) })}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'حداقل رشد ۵ دقیقه (%)' : 'Min 5m Pump %'}</label>
                <input
                  type="number"
                  min={-95}
                  max={5000}
                  step={1}
                  value={adv.minChange5mPct ?? -100}
                  onChange={(e) => updateAdv({ minChange5mPct: Number(e.target.value) || -100 })}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'نسبت خرید/فروش ۱h' : 'Min Buy/Sell Ratio'}</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={adv.minBuySellRatio ?? 0}
                  onChange={(e) => updateAdv({ minBuySellRatio: Math.max(0, Number(e.target.value) || 0) })}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'مرتب‌سازی نتایج' : 'Sort Candidates'}</label>
                <select
                  value={adv.sortBy ?? 'SCORE'}
                  onChange={(e) => updateAdv({ sortBy: e.target.value as SniperAdvancedFilters['sortBy'] })}
                  className="input-field w-full rounded-xl px-2 py-1.5 text-[11px] font-bold"
                >
                  <option value="SCORE">{isFa ? 'امتیاز هوشمند ترکیبی' : 'Smart Score'}</option>
                  <option value="NEWEST">{isFa ? 'تازه‌ترین لانچ (دقیقه‌ای)' : 'Newest Launch'}</option>
                  <option value="MOMENTUM_5M">{isFa ? 'سریع‌ترین پامپ ۵دقیقه' : 'Fastest 5m Pump'}</option>
                  <option value="VOLUME_1H">{isFa ? 'بیشترین حجم ۱ ساعته' : 'Highest 1h Volume'}</option>
                  <option value="SAFETY">{isFa ? 'بالاترین ایمنی' : 'Highest Safety'}</option>
                  <option value="LIQUIDITY">{isFa ? 'بیشترین نقدینگی' : 'Top Liquidity'}</option>
                </select>
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline flex flex-col justify-between space-y-1">
                <span className="text-[11px] text-dim font-bold">{isFa ? 'فقط سایت/تلگرام‌دار' : 'Require Socials'}</span>
                <button
                  type="button"
                  onClick={() => updateAdv({ requireSocials: !adv.requireSocials })}
                  className={`w-full py-1.5 rounded-xl text-xs font-bold border transition ${
                    adv.requireSocials
                      ? 'bg-emerald-500/15 text-jade border-emerald-500/35'
                      : 'surface-soft text-dim hairline'
                  }`}
                >
                  {adv.requireSocials ? (isFa ? 'بله (فعال)' : 'Required ✅') : isFa ? 'همه توکن‌ها' : 'Optional'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'سقف مالیات توکن (%)' : 'Max Tax %'}</label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  value={settings.maxTaxPct}
                  onChange={(e) => setSettings((s) => ({ ...s, maxTaxPct: Math.max(0, Number(e.target.value) || 0) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'حد سود TP (%)' : 'Take Profit %'}</label>
                <input
                  type="number"
                  min={5}
                  max={1000}
                  value={settings.tpPct}
                  onChange={(e) => setSettings((s) => ({ ...s, tpPct: Math.max(5, Number(e.target.value) || 35) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num text-jade"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'حد ضرر SL (%)' : 'Stop Loss %'}</label>
                <input
                  type="number"
                  min={3}
                  max={90}
                  value={settings.slPct}
                  onChange={(e) => setSettings((s) => ({ ...s, slPct: Math.max(3, Number(e.target.value) || 15) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num text-loss"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'اسلیپیج (%)' : 'Slippage %'}</label>
                <input
                  type="number"
                  min={0.5}
                  max={25}
                  step={0.5}
                  value={settings.slippagePct}
                  onChange={(e) => setSettings((s) => ({ ...s, slippagePct: Math.max(0.5, Number(e.target.value) || 3) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'سقف پوزیشن باز' : 'Max Open Slots'}</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxOpenPositions}
                  onChange={(e) => setSettings((s) => ({ ...s, maxOpenPositions: Math.max(1, Number(e.target.value) || 3) }))}
                  className="input-field w-full rounded-xl px-2.5 py-1.5 text-xs font-bold font-num"
                  dir="ltr"
                />
              </div>

              <div className="panel rounded-2xl p-2.5 border hairline space-y-1">
                <label className="text-[11px] text-dim font-bold block">{isFa ? 'تریلینگ استاپ (%)' : 'Trailing Stop %'}</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, trailingEnabled: !s.trailingEnabled }))}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                      settings.trailingEnabled
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/35'
                        : 'surface-soft text-dim border-transparent'
                    }`}
                  >
                    {settings.trailingEnabled ? (isFa ? 'روشن' : 'ON') : isFa ? 'خاموش' : 'OFF'}
                  </button>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    disabled={!settings.trailingEnabled}
                    value={settings.trailingPct}
                    onChange={(e) => setSettings((s) => ({ ...s, trailingPct: Math.max(2, Number(e.target.value) || 8) }))}
                    className="input-field w-full rounded-lg px-1.5 py-1 text-xs font-bold font-num"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Discovered Candidates */}
      <div className="space-y-2.5 pt-2 border-t hairline">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-bold text-main flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-flame" />
            <span>{isFa ? 'فرصت‌های زنده کشف‌شده مطابق فیلتر شما' : 'Live Matched Sniper Candidates'}</span>
          </h4>
          <span className="text-[11px] text-dim font-num">
            {loading ? '...' : `${candidates.length} ${isFa ? 'مورد' : 'found'}`}
          </span>
        </div>

        {candidates.length === 0 ? (
          <div className="panel rounded-2xl p-5 text-center text-xs text-dim border border-dashed hairline space-y-2">
            <p>
              {loading
                ? isFa
                  ? 'در حال دریافت فرصت‌های زنده از صرافی‌ها و دکس‌ها...'
                  : 'Loading live candidates...'
                : isFa
                  ? 'در این لحظه با فیلتر فعلی توکنی پیدا نشد. برای استخرهای زیر ۵ دقیقه از دکمه «شکار زیر ۵ دقیقه ⚡» بالا استفاده کنید یا «اسکن زنده الان» را بزنید.'
                  : 'No candidates matched current filters. Try the 5m Ultra-Fresh preset above or click Scan Live.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {candidates.slice(0, uiMode === 'pro' ? 18 : 10).map((cand) => {
              const shortAddr =
                cand.tokenAddress.length > 12
                  ? `${cand.tokenAddress.slice(0, 6)}...${cand.tokenAddress.slice(-4)}`
                  : cand.tokenAddress;
              const ageBadge = formatAgeText(cand, isFa);
              return (
                <div
                  key={`${cand.chainId}_${cand.tokenAddress}`}
                  className="panel rounded-2xl p-3.5 border hairline flex flex-col justify-between gap-2.5 hover:border-amber-500/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-display font-black text-sm text-main">{cand.symbol}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase">
                          {cand.chainId}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
                          {ageBadge}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            cand.safetyScore >= 80
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : cand.safetyScore >= 60
                                ? 'bg-sky-500/15 text-sky-400'
                                : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {isFa ? `ایمنی ${cand.safetyScore}` : `Safety ${cand.safetyScore}`}
                        </span>
                        {cand.hasSocials && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/12 text-jade">
                            Social ✓
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-dim font-num" dir="ltr">
                        <span className="text-main font-bold">
                          ${cand.priceUsd < 0.0001 ? cand.priceUsd.toExponential(2) : cand.priceUsd < 0.01 ? cand.priceUsd.toFixed(6) : cand.priceUsd.toFixed(4)}
                        </span>
                        <span>Liq: ${Math.round(cand.liquidityUsd).toLocaleString('en-US')}</span>
                        {(cand.volume5mUsd ?? 0) > 0 && <span>5m Vol: ${Math.round(cand.volume5mUsd!).toLocaleString('en-US')}</span>}
                        {typeof cand.change5mPct === 'number' && (
                          <span className={cand.change5mPct >= 0 ? 'text-jade font-bold' : 'text-loss font-bold'}>
                            5m: {cand.change5mPct >= 0 ? '+' : ''}{cand.change5mPct.toFixed(1)}%
                          </span>
                        )}
                        <span className={cand.change1hPct >= 0 ? 'text-jade font-bold' : 'text-loss font-bold'}>
                          1h: {cand.change1hPct >= 0 ? '+' : ''}{cand.change1hPct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-dim" dir="ltr">
                        <span className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/5">{cand.source}</span>
                        {(cand.buys5m !== undefined || cand.sells5m !== undefined) && (
                          <span>
                            5m Txns: <b className="text-jade">{cand.buys5m ?? 0}B</b> / <b className="text-loss">{cand.sells5m ?? 0}S</b>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(cand.tokenAddress).catch(() => {});
                            setCopiedAddr(cand.tokenAddress);
                            setTimeout(() => setCopiedAddr(null), 1500);
                          }}
                          className="inline-flex items-center gap-1 hover:text-main font-mono"
                          title={cand.tokenAddress}
                        >
                          <Copy className="w-2.5 h-2.5" />
                          <span>{copiedAddr === cand.tokenAddress ? 'Copied!' : shortAddr}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={buyingAddr === cand.tokenAddress}
                        onClick={() => void handleBuyCandidate(cand)}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:opacity-90 transition inline-flex items-center gap-1 shadow-sm"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>
                          {buyingAddr === cand.tokenAddress
                            ? isFa ? 'در حال خرید...' : 'Buying...'
                            : isFa ? `شکار ($${settings.budgetUsd})` : `Snipe ($${settings.budgetUsd})`}
                        </span>
                      </button>
                      {cand.tokenAddress && cand.chainId !== 'cex' && (
                        <a
                          href={`https://dexscreener.com/${encodeURIComponent(cand.chainId)}/${encodeURIComponent(cand.tokenAddress)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-brand hover:underline inline-flex items-center gap-1"
                        >
                          <span>DexScreener</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Snipes Summary */}
      {recentSnipes.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t hairline">
          <p className="text-xs font-bold text-dim flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-jade" />
            <span>{isFa ? 'آخرین شکارهای ثبت‌شده و در انتظار امضا' : 'Recent Sniper Trades'}</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recentSnipes.slice(0, 6).map((r) => {
              const sym = r.token_symbol || r.symbol || 'TOKEN';
              const ch = r.chain_id || r.chain || 'dex';
              const pnl = Number(r.realized_pnl_usd ?? r.pnl_usd ?? 0);
              const isPending = r.status === 'PENDING_SIGN';
              const isOpen = r.status === 'OPEN';
              const isCancelled = r.status === 'CANCELLED';
              const statusLabel = isPending
                ? isFa ? 'در انتظار امضای کیف‌پول' : 'Pending Wallet Sign'
                : isOpen
                  ? isFa ? 'فعال (تحت رصد)' : 'Open'
                  : isCancelled
                    ? isFa ? 'لغو شده' : 'Cancelled'
                    : isFa
                      ? `بسته‌شده (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`
                      : `Closed (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`;
              const statusClass = isPending
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                : isOpen
                  ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                  : isCancelled
                    ? 'surface-soft text-dim border-white/10'
                    : pnl >= 0
                      ? 'bg-emerald-500/15 text-jade border-emerald-500/30'
                      : 'bg-rose-500/15 text-loss border-rose-500/30';

              return (
                <div key={r.id} className="panel rounded-2xl p-3 text-xs border hairline space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-black text-main truncate">{sym}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10 text-dim uppercase font-bold">
                        {ch}
                      </span>
                      <span dir="ltr" className="font-num font-bold text-main">
                        ${Number(r.amount_usd).toFixed(0)}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {isPending && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.token_address && (
                          <a
                            href={buildQuickSwapDappLink(ch, r.token_address)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-jade border border-emerald-500/30 text-[10px] font-black inline-flex items-center gap-1 hover:bg-emerald-500/25"
                          >
                            <span>{isFa ? 'باز کردن در Trust Wallet' : 'Open in Trust Wallet'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmingTradeId((cur) => (cur === r.id ? null : r.id))}
                          className="px-2.5 py-1 rounded-xl btn-emerald text-[10px] font-black inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isFa ? 'تایید و ثبت امضا' : 'Confirm Signed'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusyId === r.id}
                          onClick={() => void handleCancelOrCloseSnipe(r.id, true)}
                          className="px-2.5 py-1 rounded-xl bg-rose-500/12 text-loss border border-rose-500/25 text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>{actionBusyId === r.id ? '...' : isFa ? 'لغو' : 'Cancel'}</span>
                        </button>
                      </div>

                      {confirmingTradeId === r.id && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={confirmTxHash}
                            onChange={(e) => setConfirmTxHash(e.target.value)}
                            placeholder={isFa ? 'هش تراکنش (TX Hash اختیاری)' : 'Optional TX hash'}
                            className="field text-[11px] font-mono-num flex-1 py-1.5"
                          />
                          <button
                            type="button"
                            disabled={actionBusyId === r.id}
                            onClick={() => void handleConfirmPendingSnipe(r.id)}
                            className="btn-gold px-3 py-1.5 rounded-xl text-[10px] font-black shrink-0"
                          >
                            {actionBusyId === r.id ? '...' : isFa ? 'ثبت نهایی' : 'Confirm'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={actionBusyId === r.id}
                        onClick={() => void handleCancelOrCloseSnipe(r.id, false)}
                        className="px-2.5 py-1 rounded-xl bg-rose-500/12 text-loss border border-rose-500/25 text-[10px] font-black"
                      >
                        {actionBusyId === r.id ? '...' : isFa ? 'بستن و خروج' : 'Close Position'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!settings.autoExecute && (
        <div className="rounded-2xl p-2.5 bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {isFa
              ? 'شکارچی روی حالت «فقط هشدار و خرید دستی» است؛ تا زمانی که دکمه شکار را نزنید هیچ خرید خودکاری باز نمی‌شود.'
              : 'Alert-only mode is active; no automated purchases will run until you tap Snipe.'}
          </span>
        </div>
      )}
    </section>
  );
}
