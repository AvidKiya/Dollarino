import { Flame, Rocket, ShieldCheck, Wallet } from 'lucide-react';
import { DexPortfolioPanel } from '../components/DexPortfolioPanel';
import { SniperWorkbench } from '../components/SniperWorkbench';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, NavTab } from '../lib/types';

export function SniperPage({
  lang,
  uiMode,
  data,
  onNavigate,
  onRefresh,
  onRequireOnboardingGate,
}: {
  lang: Lang;
  uiMode: 'simple' | 'pro';
  data: DashboardPayload;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
  onRequireOnboardingGate?: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const tradingMode = data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <section className="panel rounded-[28px] p-5 md:p-6 border border-amber-500/25 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-signal px-3 py-1 rounded-full text-[11px] font-black inline-flex items-center gap-1.5">
              <Rocket className="w-3.5 h-3.5" />
              <span>{isFa ? 'اسنایپر هوشمند لیستینگ و میم‌کوین‌های پرشتاب' : 'LISTING & MEME SNIPER HUB'}</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/15 text-jade inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isFa ? 'اسکن ضدراگ ۳ منبعی خودکار' : 'Auto 3-Source Anti-Rug'}</span>
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                tradingMode === 'LIVE' ? 'bg-emerald-500/20 text-jade' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {tradingMode === 'LIVE'
                ? isFa
                  ? 'حالت واقعی (Trust Wallet)'
                  : 'LIVE MODE'
                : isFa
                  ? 'حالت دمو (شبیه‌ساز)'
                  : 'DEMO MODE'}
            </span>
          </div>
          <h2 className="font-display font-black text-xl sm:text-2xl text-main">
            {isFa
              ? 'شکار لحظه‌ای ارزهای لیست‌شده جدید و توکن‌های داغ DEX'
              : 'Snipe New Exchange Listings & High-Momentum DEX Launches'}
          </h2>
          <p className="text-xs text-dim leading-relaxed">
            {isFa
              ? 'جفت‌ارزهای جدید در صرافی‌ها و استخرهای DEX را با فیلتر ایمنی ضدراگ، نقدینگی و حجم بررسی کنید و با یک کلیک در مود دمو یا واقعی خرید بزنید. همه موقعیت‌های باز بلافاصله در کیف‌پول و پورتفوی شما ثبت می‌شوند.'
              : 'Scan new listings and DEX pools with anti-rug safety filters, execute 1-click snipes in Demo or Live mode, and manage your positions directly below or in Wallet.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('portfolio')}
            className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
          >
            <Wallet className="w-4 h-4" />
            <span>{isFa ? 'کیف‌پول و پورتفو' : 'Open Wallet & Portfolio'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('copy')}
            className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Flame className="w-4 h-4 text-[var(--gold)]" />
            <span>{isFa ? 'رادار زنده DexScreener' : 'DexScreener Radar'}</span>
          </button>
        </div>
      </section>

      {/* Main Sniper Workbench */}
      <SniperWorkbench
        lang={lang}
        uiMode={uiMode}
        tradingMode={tradingMode}
        initialConfig={{
          enabled: Boolean(data.config.sniper_enabled),
          targetType: data.config.sniper_target_type || 'BOTH',
          budgetUsd: data.config.sniper_budget_usd ?? 25,
          minSafetyScore: data.config.sniper_min_safety_score ?? data.config.sniper_min_safety ?? 75,
          minLiquidityUsd: data.config.sniper_min_liquidity_usd ?? 25_000,
          maxPairAgeHours: data.config.sniper_max_pair_age_hours ?? 24,
          maxTaxPct: data.config.sniper_max_tax_pct ?? 5,
          tpPct: data.config.sniper_tp_pct ?? 35,
          slPct: data.config.sniper_sl_pct ?? 15,
          trailingEnabled: data.config.sniper_trailing_enabled !== 0,
          trailingPct: data.config.sniper_trailing_pct ?? 8,
          maxOpenPositions: data.config.sniper_max_open_positions ?? 3,
          autoExecute: data.config.sniper_auto_execute !== 0,
          slippagePct: data.config.sniper_slippage_pct ?? 3,
        }}
        onRefreshDashboard={onRefresh}
        onRequireOnboardingGate={onRequireOnboardingGate}
      />

      {/* Active Sniper & DEX Positions directly accessible below */}
      <DexPortfolioPanel
        lang={lang}
        tradingMode={tradingMode}
        initialTrades={data.dexTrades}
        onAfterChange={onRefresh}
      />
    </div>
  );
}
