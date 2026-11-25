import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Radar,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api';
import { formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type { SniperCandidate, SniperSettings, SniperTargetType } from '../lib/types';

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
  { id: 'bsc', labelFa: 'بایننس اسمارت چین (BSC)', labelEn: 'BSC', badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  { id: 'base', labelFa: 'بیس (Base)', labelEn: 'Base', badgeColor: 'border-sky-500/40 bg-sky-500/10 text-sky-400' },
  { id: 'eth', labelFa: 'اتریوم (ETH)', labelEn: 'Ethereum', badgeColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400' },
  { id: 'ton', labelFa: 'تون (TON)', labelEn: 'TON', badgeColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' },
  { id: 'arbitrum', labelFa: 'آربیتروم (ARB)', labelEn: 'Arbitrum', badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400' },
] as const;

const DEFAULT_SETTINGS: SniperSettings = {
  enabled: false,
  targetType: 'BOTH',
  budgetUsd: 25,
  minSafetyScore: 75,
  minLiquidityUsd: 25_000,
  maxPairAgeHours: 24,
  maxTaxPct: 5,
  tpPct: 35,
  slPct: 15,
  trailingEnabled: true,
  trailingPct: 8,
  maxOpenPositions: 3,
  autoExecute: true,
  slippagePct: 3,
  networks: ['solana', 'bsc', 'base'],
};

interface SniperRecentRow {
  id: string;
  token_symbol?: string;
  symbol?: string;
  chain_id?: string;
  chain?: string;
  status: string;
  amount_usd: string | number;
  entry_price_usd?: string | number;
  entry_price?: string | number;
  realized_pnl_usd?: string | number;
  pnl_usd?: string | number;
  opened_at: string;
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
  }));
  const [candidates, setCandidates] = useState<SniperCandidate[]>([]);
  const [recentSnipes, setRecentSnipes] = useState<SniperRecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [buyingAddr, setBuyingAddr] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(uiMode === 'pro');

  useEffect(() => {
    if (uiMode === 'pro') setShowAdvancedFilters(true);
  }, [uiMode]);

  const loadSniperState = useCallback(async () => {
    try {
      const res = await apiFetch<{
        ok: boolean;
        settings: SniperSettings;
        candidates?: SniperCandidate[];
        recentSnipes?: SniperRecentRow[];
      }>('/api/trading/sniper');
      if (res.settings) setSettings(res.settings);
      if (Array.isArray(res.candidates)) setCandidates(res.candidates);
      if (Array.isArray(res.recentSnipes)) setRecentSnipes(res.recentSnipes);
    } catch {
      // keep existing local state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSniperState();
  }, [loadSniperState]);

  const toggleChain = (chainId: string) => {
    setSettings((prev) => {
      const exists = prev.networks.includes(chainId);
      const next = exists ? prev.networks.filter((c) => c !== chainId) : [...prev.networks, chainId];
      return { ...prev, networks: next.length > 0 ? next : [chainId] };
    });
  };

  const handleSaveSettings = async (override?: Partial<SniperSettings>) => {
    const payload = { ...settings, ...override };
    setSettings(payload);
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; settings: SniperSettings }>('/api/trading/sniper', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.settings) setSettings(res.settings);
      pushFloatingToast(
        isFa ? 'تنظیمات شکارچی ارزهای جدید و میم‌کوین با موفقیت ذخیره شد ✅' : 'Listing & Meme Sniper settings saved ✅',
        'success'
      );
      await Promise.all([loadSniperState(), onRefreshDashboard()]);
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleScanNow = async (executeTrades = false) => {
    setScanning(true);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        scannedCount?: number;
        boughtCount?: number;
        candidates?: SniperCandidate[];
        details?: string[];
      }>('/api/trading/sniper/scan-now', {
        method: 'POST',
        body: JSON.stringify({ execute: executeTrades }),
      });
      if (Array.isArray(res.candidates)) {
        setCandidates(res.candidates);
      }
      if (executeTrades && (res.boughtCount ?? 0) > 0) {
        pushFloatingToast(
          isFa
            ? `🚀 اسکن انجام شد: ${res.boughtCount} شکار جدید با موفقیت خریداری شد!`
            : `🚀 Scan complete: ${res.boughtCount} token(s) sniped!`,
          'success'
        );
      } else {
        pushFloatingToast(
          isFa
            ? `🔍 اسکن زنده تکمیل شد (${res.candidates?.length ?? res.scannedCount ?? 0} فرصت منطبق با فیلتر شما پیدا شد)`
            : `🔍 Live scan complete (${res.candidates?.length ?? res.scannedCount ?? 0} candidates matched)`,
          'info'
        );
      }
      await Promise.all([loadSniperState(), onRefreshDashboard()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onRequireOnboardingGate?.();
        window.dispatchEvent(new CustomEvent('dollarino:require-risk-terms'));
      }
      pushFloatingToast(err instanceof Error ? err.message : 'Scan failed', err instanceof ApiError && err.status === 403 ? 'warn' : 'error');
    } finally {
      setScanning(false);
    }
  };

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
            ? `⚡ شکار ${cand.symbol} با مبلغ $${settings.budgetUsd} در حالت ${tradingMode === 'LIVE' ? 'واقعی' : 'دمو'} اجرا شد!`
            : `⚡ Sniped ${cand.symbol} ($${settings.budgetUsd})!`,
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
      {/* Header with 3D Rocket Asset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b hairline pb-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-rose-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
            <img
              src="/images/transparent/sniper-rocket-3d.png"
              alt="Listing & Meme Sniper"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_8px_14px_rgba(245,158,11,0.35)]"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa ? 'شکارچی ارزهای جدید و میم‌کوین‌های پرشتاب' : 'New Listing & Booming Meme Sniper'}
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
            </div>
            <p className="text-xs text-dim leading-relaxed">
              {isFa
                ? 'کشف لحظه‌ای ارزهای تازه لیست‌شده صرافی‌ها و میم‌کوین‌های پامپی دکس‌ها با فیلتر ضداسکم، نقدینگی، مالیات توکن، حد سود/ضرر و امکان خرید خودکار یا دستی.'
                : 'Real-time discovery of CEX new listings & booming DEX meme tokens with anti-rug scoring, liquidity/tax filters, TP/SL & one-click manual or auto snipe.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveSettings({ enabled: !settings.enabled })}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition border inline-flex items-center gap-1.5 ${
              settings.enabled
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/35 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 text-amber-500 border-amber-500/35 hover:bg-amber-500/25'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span>
              {settings.enabled
                ? isFa
                  ? 'موتور شکارچی: روشن ✓'
                  : 'Sniper: ON ✓'
                : isFa
                  ? 'روشن کردن شکارچی'
                  : 'Enable Sniper'}
            </span>
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleScanNow(false)}
            className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Radar className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning...') : isFa ? 'اسکن زنده الان' : 'Scan Live Now'}</span>
          </button>
        </div>
      </div>

      {/* Target Type + Execution Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel rounded-2xl p-3.5 space-y-2.5 border hairline">
          <p className="text-xs font-bold text-main flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{isFa ? 'هدف شکار رادار' : 'Radar Target Type'}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'BOTH', fa: 'هر دو (لیستینگ + میم)', en: 'Both' },
                { id: 'CEX_NEW_LISTING', fa: 'لیستینگ‌های جدید', en: 'New Listings' },
                { id: 'DEX_BOOM_MEME', fa: 'میم‌کوین‌های پامپی', en: 'Meme Booms' },
              ] as Array<{ id: SniperTargetType; fa: string; en: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, targetType: opt.id }))}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border transition text-center ${
                  settings.targetType === opt.id
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-500 shadow-sm'
                    : 'border-transparent surface-soft text-dim hover:text-main'
                }`}
              >
                {isFa ? opt.fa : opt.en}
              </button>
            ))}
          </div>
        </div>

        <div className="panel rounded-2xl p-3.5 space-y-2.5 border hairline">
          <p className="text-xs font-bold text-main flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>{isFa ? 'نحوه اجرا هنگام کشف فرصت' : 'Execution Mode'}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, autoExecute: true }))}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition text-center ${
                settings.autoExecute
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                  : 'border-transparent surface-soft text-dim hover:text-main'
              }`}
            >
              {isFa ? '⚡ خرید خودکار طبق فیلترها' : '⚡ Auto Snipe'}
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, autoExecute: false }))}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition text-center ${
                !settings.autoExecute
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-400'
                  : 'border-transparent surface-soft text-dim hover:text-main'
              }`}
            >
              {isFa ? '🔔 فقط هشدار و خرید با تایید من' : '🔔 Alert & Manual Buy'}
            </button>
          </div>
        </div>
      </div>

      {/* Networks */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-main">
          {isFa ? 'شبکه‌های هدف برای شکار (DEX و لیستینگ‌ها)' : 'Target Blockchains'}
        </p>
        <div className="flex flex-wrap gap-2">
          {CHAIN_OPTIONS.map((ch) => {
            const active = settings.networks.includes(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => toggleChain(ch.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1.5 ${
                  active ? ch.badgeColor : 'surface-soft hairline text-dim opacity-70 hover:opacity-100'
                }`}
              >
                {active && <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{isFa ? ch.labelFa : ch.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Core Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="panel rounded-2xl p-3 space-y-1.5 border hairline block">
          <div className="flex items-center justify-between text-xs font-bold text-dim">
            <span>{isFa ? 'مبلغ هر شکار (دلار)' : 'Budget / Snipe ($)'}</span>
            <span dir="ltr" className="text-[11px] text-jade font-num">
              {formatTomanEq(settings.budgetUsd)}
            </span>
          </div>
          <input
            type="number"
            min={5}
            max={5000}
            value={settings.budgetUsd}
            onChange={(e) => setSettings((s) => ({ ...s, budgetUsd: Math.max(5, Number(e.target.value) || 25) }))}
            className="input-field w-full rounded-xl px-3 py-2 text-sm font-bold font-num"
            dir="ltr"
          />
        </label>

        <label className="panel rounded-2xl p-3 space-y-1.5 border hairline block">
          <div className="flex items-center justify-between text-xs font-bold text-dim">
            <span>{isFa ? 'حداقل امتیاز ایمنی' : 'Min Safety Score'}</span>
            <span dir="ltr" className="text-amber-500 font-num">
              {settings.minSafetyScore}/100
            </span>
          </div>
          <input
            type="range"
            min={40}
            max={98}
            value={settings.minSafetyScore}
            onChange={(e) => setSettings((s) => ({ ...s, minSafetyScore: Number(e.target.value) }))}
            className="w-full accent-amber-500"
          />
        </label>

        <label className="panel rounded-2xl p-3 space-y-1.5 border hairline block">
          <span className="text-xs font-bold text-dim block">{isFa ? 'حد سود هدف (%)' : 'Take Profit (%)'}</span>
          <input
            type="number"
            min={5}
            max={500}
            value={settings.tpPct}
            onChange={(e) => setSettings((s) => ({ ...s, tpPct: Math.max(5, Number(e.target.value) || 35) }))}
            className="input-field w-full rounded-xl px-3 py-2 text-sm font-bold text-jade font-num"
            dir="ltr"
          />
        </label>

        <label className="panel rounded-2xl p-3 space-y-1.5 border hairline block">
          <span className="text-xs font-bold text-dim block">{isFa ? 'حد ضرر محافظ (%)' : 'Stop Loss (%)'}</span>
          <input
            type="number"
            min={3}
            max={80}
            value={settings.slPct}
            onChange={(e) => setSettings((s) => ({ ...s, slPct: Math.max(3, Number(e.target.value) || 15) }))}
            className="input-field w-full rounded-xl px-3 py-2 text-sm font-bold text-loss font-num"
            dir="ltr"
          />
        </label>
      </div>

      {/* Expandable / Pro Risk & Filter Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className="text-xs font-bold text-goldsoft hover:underline inline-flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {showAdvancedFilters
                ? isFa
                  ? 'بستن فیلترهای پیشرفته نقدینگی، سن جفت‌ارز و تریلینگ'
                  : 'Hide Advanced Filters'
                : isFa
                  ? 'تنظیمات پیشرفته نقدینگی، مالیات توکن، تریلینگ و لغزش'
                  : 'Show Liquidity, Tax & Trailing Filters'}
            </span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveSettings()}
            className="btn-emerald px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره تنظیمات شکارچی' : 'Save Sniper Config'}</span>
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
            <label className="panel rounded-xl p-2.5 space-y-1 border hairline block">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'حداقل نقدینگی ($)' : 'Min Liquidity ($)'}</span>
              <input
                type="number"
                min={5000}
                step={5000}
                value={settings.minLiquidityUsd}
                onChange={(e) => setSettings((s) => ({ ...s, minLiquidityUsd: Math.max(5000, Number(e.target.value) || 25000) }))}
                className="input-field w-full rounded-lg px-2 py-1.5 text-xs font-bold font-num"
                dir="ltr"
              />
            </label>

            <label className="panel rounded-xl p-2.5 space-y-1 border hairline block">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'حداکثر سن (ساعت)' : 'Max Age (hrs)'}</span>
              <input
                type="number"
                min={1}
                max={720}
                value={settings.maxPairAgeHours}
                onChange={(e) => setSettings((s) => ({ ...s, maxPairAgeHours: Math.max(1, Number(e.target.value) || 24) }))}
                className="input-field w-full rounded-lg px-2 py-1.5 text-xs font-bold font-num"
                dir="ltr"
              />
            </label>

            <label className="panel rounded-xl p-2.5 space-y-1 border hairline block">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'سقف مالیات توکن (%)' : 'Max Tax (%)'}</span>
              <input
                type="number"
                min={0}
                max={25}
                value={settings.maxTaxPct}
                onChange={(e) => setSettings((s) => ({ ...s, maxTaxPct: Math.max(0, Math.min(25, Number(e.target.value) || 0)) }))}
                className="input-field w-full rounded-lg px-2 py-1.5 text-xs font-bold font-num"
                dir="ltr"
              />
            </label>

            <label className="panel rounded-xl p-2.5 space-y-1 border hairline block">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'لغزش مجاز (%)' : 'Slippage (%)'}</span>
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={settings.slippagePct}
                onChange={(e) => setSettings((s) => ({ ...s, slippagePct: Math.max(0.5, Number(e.target.value) || 3) }))}
                className="input-field w-full rounded-lg px-2 py-1.5 text-xs font-bold font-num"
                dir="ltr"
              />
            </label>

            <label className="panel rounded-xl p-2.5 space-y-1 border hairline block">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'سقف پوزیشن هم‌زمان' : 'Max Open'}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={settings.maxOpenPositions}
                onChange={(e) => setSettings((s) => ({ ...s, maxOpenPositions: Math.max(1, Math.min(12, Number(e.target.value) || 3)) }))}
                className="input-field w-full rounded-lg px-2 py-1.5 text-xs font-bold font-num"
                dir="ltr"
              />
            </label>

            <div className="panel rounded-xl p-2.5 space-y-1 border hairline">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'تریلینگ استاپ' : 'Trailing Stop'}</span>
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
          <div className="panel rounded-2xl p-4 text-center text-xs text-dim border border-dashed hairline">
            {loading
              ? isFa
                ? 'در حال دریافت فرصت‌های زنده از صرافی‌ها و دکس‌ها...'
                : 'Loading live candidates...'
              : isFa
                ? 'در این لحظه توکنی با سخت‌گیری فعلی یافت نشد؛ روی «اسکن زنده الان» بزنید یا امتیاز ایمنی/نقدینگی را متعادل‌تر کنید.'
                : 'No candidates matched current strict filters. Click Scan Live Now or relax filters.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {candidates.slice(0, 6).map((cand) => (
              <div
                key={`${cand.chainId}_${cand.tokenAddress}`}
                className="panel rounded-2xl p-3 border hairline flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display font-bold text-sm text-main">{cand.symbol}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 uppercase">
                      {cand.chainId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        cand.safetyScore >= 80
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-sky-500/15 text-sky-400'
                      }`}
                    >
                      {isFa ? `ایمنی ${cand.safetyScore}` : `Safety ${cand.safetyScore}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-dim font-num" dir="ltr">
                    <span>${cand.priceUsd < 0.01 ? cand.priceUsd.toFixed(6) : cand.priceUsd.toFixed(4)}</span>
                    <span>Liq: ${Math.round(cand.liquidityUsd).toLocaleString('en-US')}</span>
                    <span className={cand.change1hPct >= 0 ? 'text-jade font-bold' : 'text-loss font-bold'}>
                      1h: {cand.change1hPct >= 0 ? '+' : ''}
                      {cand.change1hPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={buyingAddr === cand.tokenAddress}
                  onClick={() => void handleBuyCandidate(cand)}
                  className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:opacity-90 transition inline-flex items-center gap-1 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    {buyingAddr === cand.tokenAddress
                      ? isFa
                        ? 'در حال خرید...'
                        : 'Buying...'
                      : isFa
                        ? `شکار ($${settings.budgetUsd})`
                        : `Snipe ($${settings.budgetUsd})`}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Snipes Summary */}
      {recentSnipes.length > 0 && (
        <div className="space-y-2 pt-2 border-t hairline">
          <p className="text-xs font-bold text-dim flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-jade" />
            <span>{isFa ? 'آخرین شکارهای ثبت‌شده' : 'Recent Sniper Trades'}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {recentSnipes.slice(0, 5).map((r) => {
              const sym = r.token_symbol || r.symbol || 'TOKEN';
              const ch = r.chain_id || r.chain || 'dex';
              const pnl = Number(r.realized_pnl_usd ?? r.pnl_usd ?? 0);
              return (
                <div key={r.id} className="panel rounded-xl px-3 py-1.5 text-[11px] flex items-center gap-2 border hairline">
                  <span className="font-bold text-main">{sym}</span>
                  <span className="text-dim uppercase">{ch}</span>
                  <span dir="ltr" className="font-num text-main">
                    ${Number(r.amount_usd).toFixed(0)}
                  </span>
                  <span className={`font-bold ${r.status === 'OPEN' ? 'text-amber-500' : pnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {r.status}
                  </span>
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
