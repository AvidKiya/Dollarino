import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BrainCircuit,
  CheckCircle2,
  Flame,
  Rocket,
  Save,
  Scale,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { DexScreenerRadarPanel } from '../components/DexScreenerRadarPanel';
import { ProDropdown } from '../components/ProDropdown';
import { SmartCopyProHub } from '../components/SmartCopyProHub';
import { SmoothSlider } from '../components/SmoothSlider';
import { SniperWorkbench } from '../components/SniperWorkbench';
import { TrustWalletConnectInline } from '../components/TrustWalletConnectInline';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type { DashboardPayload, EntitlementSummary, NavTab } from '../lib/types';

interface PlatformAISummary {
  configured: boolean;
  activeCount: number;
  consensusMode: string;
  effectiveModeLabelFa: string;
  effectiveModeLabelEn: string;
  engines: Array<{
    id: string;
    slot_order: number;
    provider: string;
    label: string;
    model: string;
    is_active: number;
  }>;
}

interface VerifiedCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  avatar_url?: string | null;
  bio_fa?: string | null;
  bio_en?: string | null;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  min_allocation_usd?: number;
  risk_level: string;
  following: boolean;
  mySubscription?: { allocation_usd: number } | null;
  trades: Array<{
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    entry_price: string;
    stop_loss: string | null;
    tp1: string | null;
    leverage: number;
    pnl_pct: number;
    status: 'OPEN' | 'CLOSED';
    note: string | null;
    opened_at: string;
  }>;
}

export function CopyConnectPage({
  lang,
  uiMode = 'pro',
  isAdmin = false,
  data,
  entitlement,
  onNavigate,
  onRefresh,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  isAdmin?: boolean;
  data: DashboardPayload;
  entitlement?: EntitlementSummary | null;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
}) {
  void isAdmin;
  void entitlement;
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<'radar' | 'sniper' | 'copy' | 'risk'>(() => {
    if (typeof window === 'undefined') return 'copy';
    const requested = sessionStorage.getItem('dollarino_copy_subtab');
    if (requested === 'radar' || requested === 'sniper' || requested === 'copy' || requested === 'risk') {
      return requested;
    }
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'sniper') return 'sniper';
    return 'copy';
  });

  useEffect(() => {
    const requested = sessionStorage.getItem('dollarino_copy_subtab');
    if (requested === 'radar' || requested === 'sniper' || requested === 'copy' || requested === 'risk') {
      setTab(requested);
      sessionStorage.removeItem('dollarino_copy_subtab');
    }
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail === 'radar' || detail === 'sniper' || detail === 'copy' || detail === 'risk') {
        sessionStorage.removeItem('dollarino_copy_subtab');
        setTab(detail);
      }
    };
    window.addEventListener('dollarino:copy-subtab', handler);
    return () => window.removeEventListener('dollarino:copy-subtab', handler);
  }, []);
  const [traders, setTraders] = useState<VerifiedCopyTrader[]>([]);
  const [pendingConfirmTrades, setPendingConfirmTrades] = useState<
    Array<{ id: string; trader_id: string; trader_name?: string; symbol: string; direction: string; entry_price: string; leverage: number }>
  >([]);
  const [loadingTraders, setLoadingTraders] = useState(true);
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});
  const [copyingTradeId, setCopyingTradeId] = useState<string | null>(null);
  const [testingTraderId, setTestingTraderId] = useState<string | null>(null);
  const [proSiteTrader, setProSiteTrader] = useState<{ id: string; display_name: string } | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const [platformAI, setPlatformAI] = useState<PlatformAISummary | null>(null);

  const [riskForm, setRiskForm] = useState({
    margin_pct: Number(data.config.margin_pct ?? 10),
    max_leverage: Number(data.config.max_leverage ?? 10),
    max_open_positions: Number(data.config.max_open_positions ?? 6),
    daily_max_loss_pct: Number(data.config.daily_max_loss_pct ?? 5),
    tp1_close_pct: Number(data.config.tp1_close_pct ?? 50),
    tp2_close_pct: Number(data.config.tp2_close_pct ?? 25),
    tp3_close_pct: Number(data.config.tp3_close_pct ?? 25),
    trailing_stop_enabled: Boolean(data.config.trailing_stop_enabled ?? 1),
    trailing_stop_pct: Number(data.config.trailing_stop_pct ?? 2),
    trail_after_tp1: Boolean(data.config.trail_after_tp1 ?? 1),
    auto_breakeven_on_tp1: Boolean(data.config.auto_breakeven_on_tp1 ?? 1),
    move_sl_to_tp1_on_tp2: Boolean(data.config.move_sl_to_tp1_on_tp2 ?? 1),
    use_signal_leverage: Boolean(data.config.use_signal_leverage ?? 0),
    allow_auto_flip: Boolean(data.config.allow_auto_flip ?? 1),
    block_weekends: Boolean(data.config.block_weekends ?? 0),
    macro_blackout: Boolean(data.config.macro_blackout ?? 0),
  });

  const loadConnections = async () => {
    setLoadingTraders(true);
    const [ai, ct] = await Promise.all([
      apiFetch<{ platformAI: PlatformAISummary }>('/api/connections/platform-ai').catch(() => ({ platformAI: null })),
      apiFetch<{
        traders: VerifiedCopyTrader[];
        pendingConfirmTrades?: Array<{
          id: string;
          trader_id: string;
          trader_name?: string;
          symbol: string;
          direction: string;
          entry_price: string;
          leverage: number;
        }>;
      }>('/api/copy-trade/traders').catch(() => ({ traders: [], pendingConfirmTrades: [] })),
    ]);
    setPlatformAI(ai.platformAI);
    setTraders(ct.traders || []);
    setPendingConfirmTrades(ct.pendingConfirmTrades || []);
    setAllocMap((prev) => {
      const next = { ...prev };
      for (const tr of ct.traders || []) {
        if (next[tr.id] === undefined) next[tr.id] = tr.mySubscription?.allocation_usd || tr.min_allocation_usd || 100;
      }
      return next;
    });
    setLoadingTraders(false);
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const flash = (text: string, err = false) => {
    pushFloatingToast(text, err ? 'error' : 'success');
  };

  const toggleFollowTrader = async (t: VerifiedCopyTrader) => {
    try {
      const res = await apiFetch<{
        ok: boolean;
        following: boolean;
        stoppedOtherEngines?: boolean;
      }>('/api/copy-trade/follow', {
        method: 'POST',
        body: JSON.stringify({
          traderId: t.id,
          follow: !t.following,
          allocationUsd: allocMap[t.id] ?? 100,
        }),
      });
      flash(
        res.following
          ? isFa
            ? `کپی‌ترید خودکار از ${t.display_name} فعال شد!`
            : `Auto-copy enabled for ${t.display_name}`
          : isFa
            ? `کپی‌ترید ${t.display_name} متوقف شد.`
            : `Unfollowed ${t.display_name}`
      );
      await Promise.all([loadConnections(), onRefresh()]);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed', true);
    }
  };

  const copySingleTrade = async (tradeId: string) => {
    setCopyingTradeId(tradeId);
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string }>(`/api/copy-trade/copy-now/${tradeId}`, {
        method: 'POST',
      });
      flash(isFa ? `معامله با موفقیت کپی شد! (${res.tradeId ?? ''})` : `Trade mirrored (${res.tradeId ?? ''})!`);
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to mirror trade', true);
    } finally {
      setCopyingTradeId(null);
    }
  };

  const handleTestVerifiedTraderSignal = async (tr: VerifiedCopyTrader) => {
    setTestingTraderId(tr.id);
    try {
      const latestTrade = tr.trades[0];
      if (latestTrade) {
        const res = await apiFetch<{ ok: boolean; tradeId?: string }>(`/api/copy-trade/copy-now/${latestTrade.id}`, {
          method: 'POST',
        });
        flash(
          isFa
            ? `سیگنال آزمایشی ${latestTrade.symbol} از ${tr.display_name} با موفقیت اجرا شد (${res.tradeId ?? ''})`
            : `Test signal ${latestTrade.symbol} executed (${res.tradeId ?? ''})`
        );
        await onRefresh();
      } else {
        setProSiteTrader({ id: tr.id, display_name: tr.display_name });
        flash(
          isFa
            ? `قانون اختصاصی برای ${tr.display_name} آماده شد — پس از ذخیره می‌توانید «تست سیگنال» بزنید.`
            : `Configure rule for ${tr.display_name} to run test signal.`
        );
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Test signal failed', true);
    } finally {
      setTestingTraderId(null);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };
  const comparedVerified = compareIds
    .map((id) => traders.find((t) => t.id === id))
    .filter((t): t is VerifiedCopyTrader => Boolean(t));

  const saveRisk = async () => {
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ...riskForm,
          trailing_stop_enabled: riskForm.trailing_stop_enabled ? 1 : 0,
          trail_after_tp1: riskForm.trail_after_tp1 ? 1 : 0,
          auto_breakeven_on_tp1: riskForm.auto_breakeven_on_tp1 ? 1 : 0,
          move_sl_to_tp1_on_tp2: riskForm.move_sl_to_tp1_on_tp2 ? 1 : 0,
          use_signal_leverage: riskForm.use_signal_leverage ? 1 : 0,
          allow_auto_flip: riskForm.allow_auto_flip ? 1 : 0,
          block_weekends: riskForm.block_weekends ? 1 : 0,
          macro_blackout: riskForm.macro_blackout ? 1 : 0,
        }),
      });
      flash(isFa ? 'تمام قوانین سپر ریسک و تارگت‌ها ذخیره شد' : 'Risk & 3-TP settings saved');
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed', true);
    }
  };

  const tradingMode = data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--gold)' }}>
            DEX RADAR · SNIPER · SMART COPY · RISK SHIELD
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
            {isFa ? 'رادار DEX، اسنایپر، کپی‌ترید و سپر ریسک' : 'DEX Radar, Sniper, Copy-Trade & Risk Shield'}
          </h2>
        </div>

        {/* 4 Clean Tabs (flex-wrap so long labels never clip or overlap adjacent buttons) */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--soft)] border hairline w-fit max-w-full">
          {[
            { id: 'radar' as const, icon: Flame, l: isFa ? 'رادار زنده DexScreener' : 'DexScreener Radar' },
            { id: 'sniper' as const, icon: Rocket, l: isFa ? 'اسنایپر لیستینگ و میم‌کوین' : 'Listing & Meme Sniper' },
            { id: 'copy' as const, icon: Users, l: isFa ? 'کپی‌ترید' : 'Copy Trade' },
            { id: 'risk' as const, icon: Sliders, l: isFa ? 'سپر ریسک معاملات' : 'Risk Shield' },
          ].map((x) => {
            const Icon = x.icon;
            const active = tab === x.id;
            return (
              <button
                key={x.id}
                type="button"
                data-copy-subtab={x.id}
                onClick={() => setTab(x.id)}
                className={`px-3.5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-black inline-flex items-center justify-center gap-2 transition whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#0D47A1] text-white shadow-md'
                    : 'text-dim hover:text-main hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>{x.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: DexScreener Live Radar */}
      {tab === 'radar' && (
        <div className="tab-enter">
          <DexScreenerRadarPanel lang={lang} onTradeRecorded={onRefresh} />
        </div>
      )}

      {/* TAB 2: Listing & Meme Sniper */}
      {tab === 'sniper' && (
        <div className="tab-enter">
          <SniperWorkbench
            lang={lang}
            uiMode={uiMode}
            tradingMode={tradingMode}
            onRefreshDashboard={onRefresh}
          />
        </div>
      )}

      {/* TAB 3: Unified Copy-Trade (Verified + Smart Top-10 + Custom Wallets + Vault) */}
      {tab === 'copy' && (
        <div className="space-y-5 tab-enter">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[11px] font-bold text-sub flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {isFa
                  ? 'حالت چندموتوره همزمان: فالو کردن تریدرها فقط لیست انتخابی شما را ذخیره می‌کند و ربات را خودکار روشن یا موتورهای دیگر را قطع نمی‌کند.'
                  : 'Multi-Engine Mode: Following traders saves your list without auto-starting your bot or stopping other engines.'}
              </span>
            </div>
            <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0">
              {isFa ? 'Trust Wallet + ولت‌های آن‌چین V2' : 'Trust Wallet + Smart Wallets V2'}
            </span>
          </div>

          {pendingConfirmTrades.length > 0 && (
            <div className="panel rounded-[26px] p-5 border border-amber-400/45 bg-amber-500/10 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <Sparkles className="w-4 h-4" />
                <span>
                  {isFa
                    ? 'درخواست تایید انتشار معامله کپی‌ترید شما برای دنبال‌کننده‌ها'
                    : 'Confirm Copy-Trade Publication to Followers'}
                </span>
              </div>
              <div className="space-y-2">
                {pendingConfirmTrades.map((pt) => (
                  <div key={pt.id} className="surface-soft rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-black text-main">
                        <span dir="ltr">{pt.symbol}</span> · {pt.direction} ({pt.leverage}×) @ ${pt.entry_price}
                      </p>
                      <p className="text-[11px] text-dim mt-0.5">
                        {isFa ? 'آیا مایلید این معامله برای دنبال‌کننده‌های شما منتشر شود؟' : 'Publish this trade to followers?'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await apiFetch<{ ok?: boolean; mirroredCount?: number }>(`/api/copy-trade/confirm-publish/${pt.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ publish: true }),
                          });
                          flash(isFa ? `منتشر و برای ${r.mirroredCount ?? 0} دنبال‌کننده کپی شد.` : `Published to ${r.mirroredCount ?? 0} followers.`);
                          await loadConnections();
                        }}
                        className="btn-emerald px-3.5 py-2 rounded-xl font-black text-[11px] inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بله، منتشر و کپی شود' : 'Yes, Publish'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/copy-trade/confirm-publish/${pt.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ publish: false }),
                          });
                          flash(isFa ? 'این معامله فقط شخصی باقی ماند.' : 'Kept private.');
                          await loadConnections();
                        }}
                        className="btn-ghost px-3.5 py-2 rounded-xl font-bold text-[11px] text-loss"
                      >
                        {isFa ? 'خیر، فقط شخصی' : 'Private Only'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unified Verified Site Traders + Top-10 Smart Copy Hub */}
          <div className="panel rounded-[28px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/12 text-amber-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl text-main">
                    {isFa ? 'تریدرهای تاییدشده و برترین تریدرهای سایت' : 'Verified & Top Platform Traders'}
                  </h3>
                  <p className="text-xs text-dim mt-1">
                    {isFa
                      ? 'فقط تریدرهای واقعی ثبت‌شده توسط مدیریت یا رنکینگ فعال سایت در این بخش نمایش داده می‌شوند. روی هر کارت می‌توانید فالو، ویرایش قوانین مارجین، تست سیگنال و مقایسه انجام دهید.'
                      : 'Real admin-verified and auto-ranked traders with Follow, Rule/Margin Editor, Signal Test & Side-by-Side Compare.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="badge-signal px-3.5 py-2 rounded-xl text-[11px] font-black shrink-0 hover:opacity-90 transition"
              >
                {isFa ? '۳ معامله اول ۰٪ · ۹۷٪ سود برای شما ←' : 'First 3 Free · Keep 97% Profit →'}
              </button>
            </div>

            {comparedVerified.length > 0 && (
              <div className="surface-soft rounded-2xl px-4 py-2.5 border border-[#1652f0]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Scale className="w-4 h-4 text-brand shrink-0" />
                  <span className="font-black text-main">
                    {isFa ? `مقایسه تریدرها (${comparedVerified.length}/3):` : `Compare (${comparedVerified.length}/3):`}
                  </span>
                  {comparedVerified.map((t) => (
                    <span key={t.id} className="px-2.5 py-1 rounded-xl panel text-[11px] font-bold text-main inline-flex items-center gap-1.5">
                      <span>{t.display_name}</span>
                      <button type="button" onClick={() => toggleCompare(t.id)} className="text-dim hover:text-loss">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={comparedVerified.length < 2}
                    onClick={() => setCompareOpen(true)}
                    className="btn-cobalt px-3.5 py-1.5 rounded-xl text-[11px] font-black disabled:opacity-45"
                  >
                    {isFa ? 'نمایش جدول مقایسه' : 'Show Comparison'}
                  </button>
                  <button type="button" onClick={() => setCompareIds([])} className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px]">
                    {isFa ? 'پاک کردن' : 'Clear'}
                  </button>
                </div>
              </div>
            )}

            {loadingTraders ? (
              <div className="p-6 text-center text-xs text-dim">{isFa ? 'در حال دریافت لیست تریدرهای تاییدشده...' : 'Loading traders...'}</div>
            ) : traders.length === 0 ? (
              <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim space-y-1">
                <p className="font-bold text-main">
                  {isFa
                    ? 'در حال حاضر تریدر تاییدشده اختصاصی از طرف مدیریت منتشر نشده است.'
                    : 'No admin-curated copy traders published yet.'}
                </p>
                <p>
                  {isFa
                    ? 'در کادر پایین می‌توانید مستقیماً ۱۰ تریدر برتر آن‌چین (Top-10) را رصد کنید یا آدرس کیف‌پول تریدر دلخواه خود را برای کپی خودکار ثبت نمایید.'
                    : 'Use the Top-10 Smart Money leaderboard or add any custom trader wallet below.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {traders.map((tr) => (
                  <div key={tr.id} className={`surface-soft rounded-[24px] p-4 border flex flex-col justify-between gap-4 min-w-0 overflow-hidden ${tr.following ? 'border-emerald-500/45' : 'hairline'}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-display font-bold text-base text-main">{tr.display_name}</h4>
                            <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                          </div>
                          <p className="text-[11px] text-dim mt-0.5">
                            {tr.specialty} · <span dir="ltr">{tr.handle}</span>
                          </p>
                        </div>
                        <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0">{tr.risk_level}</span>
                      </div>

                      <p className="text-[11px] text-sub leading-relaxed">{isFa ? tr.bio_fa || '' : tr.bio_en || ''}</p>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-jade">+{tr.roi_30d_pct}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'بازده ۳۰ روزه' : '30d ROI'}</p>
                        </div>
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-main">{tr.win_rate}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
                        </div>
                        <div className="panel rounded-xl p-2">
                          <p dir="ltr" className="font-num font-black text-amber-400">-{tr.max_drawdown_pct}%</p>
                          <p className="text-[10px] text-dim">{isFa ? 'حداکثر افت' : 'Max DD'}</p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t hairline">
                        <p className="text-[11px] font-black text-dim">{isFa ? 'آخرین معاملات:' : 'Recent Trades:'}</p>
                        {tr.trades.length === 0 ? (
                          <p className="text-[11px] text-dim">{isFa ? 'معامله فعالی ثبت نشده است.' : 'No trades logged yet.'}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {tr.trades.slice(0, 3).map((td) => (
                              <div key={td.id} className="panel rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-bold text-main">
                                    <span dir="ltr">{td.symbol}</span>
                                    <span className={td.direction === 'LONG' ? 'text-jade' : 'text-loss'}>{td.direction}</span>
                                    <span dir="ltr" className="text-dim">{td.leverage}×</span>
                                  </div>
                                  <p className="text-[10px] text-dim truncate" dir="ltr">
                                    @${td.entry_price} · {td.status} ({td.pnl_pct >= 0 ? '+' : ''}{td.pnl_pct}%)
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={copyingTradeId === td.id}
                                  onClick={() => void copySingleTrade(td.id)}
                                  className="btn-emerald px-2.5 py-1.5 rounded-lg text-[10px] font-black shrink-0"
                                >
                                  {copyingTradeId === td.id ? '...' : isFa ? 'کپی معامله' : 'Copy'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t hairline">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-dim">{isFa ? 'مارجین تخصیصی ($):' : 'Margin ($):'}</span>
                        <ProDropdown
                          value={String(allocMap[tr.id] ?? 100)}
                          onChange={(v) => setAllocMap((prev) => ({ ...prev, [tr.id]: Number(v) }))}
                          align="end"
                          menuMinWidthClass="min-w-[110px]"
                          className="w-28"
                          options={[50, 100, 250, 500, 1000].map((v) => ({ value: String(v), label: `$${v}` }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void toggleFollowTrader(tr)}
                          className={`py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 ${
                            tr.following ? 'bg-[#059669] text-white' : 'btn-gold'
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>{tr.following ? (isFa ? 'فالو ✓' : 'Following') : isFa ? 'فالو' : 'Follow'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProSiteTrader({ id: tr.id, display_name: tr.display_name })}
                          className="btn-cobalt py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ویرایش مارجین و قوانین' : 'Edit Rules'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={testingTraderId === tr.id}
                          onClick={() => void handleTestVerifiedTraderSignal(tr)}
                          className="btn-ghost py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
                        >
                          <Zap className="w-3.5 h-3.5 text-brand" />
                          <span>{testingTraderId === tr.id ? '...' : isFa ? 'تست سیگنال' : 'Test Signal'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCompare(tr.id)}
                          className={`py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 ${
                            compareIds.includes(tr.id) ? 'btn-cobalt' : 'btn-ghost'
                          }`}
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span>{compareIds.includes(tr.id) ? (isFa ? 'انتخاب شد' : 'Picked') : isFa ? 'مقایسه' : 'Compare'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unified Smart Wallets Top-10, Custom Wallets, 24/7 Copy-Vault & Live Positions */}
          <SmartCopyProHub
            lang={lang}
            onMsg={flash}
            externalSiteTrader={proSiteTrader}
            onClearExternalTrader={() => setProSiteTrader(null)}
          />
        </div>
      )}

      {/* TAB 4: Risk Shield + AI Engine & Trust Wallet Execution */}
      {tab === 'risk' && (
        <div className="space-y-5 tab-enter">
          <div className="panel rounded-[26px] p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'قوانین سپر ریسک معاملات و تقسیم سود ۳ مرحله‌ای' : 'Risk Shield & 3-TP Split Rules'}</span>
                </h3>
                <p className="text-xs text-dim mt-0.5">
                  {isFa
                    ? 'کنترل‌های قطعی برای جلوگیری از ضرر سنگین و مدیریت هوشمند سود در تمام موتورهای معاملاتی.'
                    : 'Hard exposure rules enforced on every autonomous, copy-trade, and manual order.'}
                </p>
              </div>
              <button type="button" onClick={() => void saveRisk()} className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                <span>{isFa ? 'ذخیره قوانین سپر ریسک' : 'Save Risk Shield'}</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {[
                { id: 'margin_pct', l: isFa ? `حجم هر معامله: ${riskForm.margin_pct}%` : `Margin/Trade: ${riskForm.margin_pct}%`, min: 1, max: 50, val: riskForm.margin_pct, set: (v: number) => setRiskForm((f) => ({ ...f, margin_pct: v })) },
                { id: 'max_leverage', l: isFa ? `سقف اهرم: ${riskForm.max_leverage}×` : `Max Leverage: ${riskForm.max_leverage}×`, min: 1, max: 50, val: riskForm.max_leverage, set: (v: number) => setRiskForm((f) => ({ ...f, max_leverage: v })) },
                { id: 'max_open_positions', l: isFa ? `معاملات همزمان: ${riskForm.max_open_positions}` : `Max Open: ${riskForm.max_open_positions}`, min: 1, max: 20, val: riskForm.max_open_positions, set: (v: number) => setRiskForm((f) => ({ ...f, max_open_positions: v })) },
                { id: 'daily_max_loss_pct', l: isFa ? `سقف ضرر روزانه: ${riskForm.daily_max_loss_pct}%` : `Daily Max Loss: ${riskForm.daily_max_loss_pct}%`, min: 1, max: 25, val: riskForm.daily_max_loss_pct, set: (v: number) => setRiskForm((f) => ({ ...f, daily_max_loss_pct: v })) },
              ].map((s) => (
                <div key={s.id} className="surface-soft rounded-2xl p-4 space-y-2.5">
                  <p className="font-bold text-main">{s.l}</p>
                  <SmoothSlider min={s.min} max={s.max} value={s.val} onChange={s.set} dir="ltr" ariaLabel={s.l} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="surface-soft rounded-2xl p-3">
                <label className="text-dim block mb-1">{isFa ? 'خروج در TP1 (%)' : 'TP1 Close %'}</label>
                <input type="number" min={0} max={100} value={riskForm.tp1_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp1_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <label className="text-dim block mb-1">{isFa ? 'خروج در TP2 (%)' : 'TP2 Close %'}</label>
                <input type="number" min={0} max={100} value={riskForm.tp2_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp2_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <label className="text-dim block mb-1">{isFa ? 'خروج در TP3 (%)' : 'TP3 Close %'}</label>
                <input type="number" min={0} max={100} value={riskForm.tp3_close_pct} onChange={(e) => setRiskForm((f) => ({ ...f, tp3_close_pct: Number(e.target.value) }))} className="field py-2 font-num" />
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <label className="text-dim block mb-1">{isFa ? 'فاصله تریلینگ (%)' : 'Trailing Distance %'}</label>
                <input type="number" step="0.2" min={0.2} max={10} value={riskForm.trailing_stop_pct} onChange={(e) => setRiskForm((f) => ({ ...f, trailing_stop_pct: Number(e.target.value) }))} className="field py-2 font-num" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                { k: 'trailing_stop_enabled' as const, l: isFa ? 'تریلینگ استاپ فعال' : 'Trailing Stop Enabled' },
                { k: 'trail_after_tp1' as const, l: isFa ? 'شروع تریلینگ بعد از TP1' : 'Trail Only After TP1' },
                { k: 'auto_breakeven_on_tp1' as const, l: isFa ? 'ریسک‌فری خودکار در TP1' : 'Auto Break-Even on TP1' },
                { k: 'move_sl_to_tp1_on_tp2' as const, l: isFa ? 'انتقال SL به TP1 در TP2' : 'Move SL → TP1 on TP2' },
                { k: 'use_signal_leverage' as const, l: isFa ? 'استفاده از اهرم سیگنال' : 'Use Signal Leverage' },
                { k: 'allow_auto_flip' as const, l: isFa ? 'چرخش خودکار در تغییر روند' : 'Auto-Flip on Reversal' },
                { k: 'block_weekends' as const, l: isFa ? 'توقف ترید آخر هفته' : 'Block Weekends' },
                { k: 'macro_blackout' as const, l: isFa ? 'توقف هنگام اخبار CPI/FOMC' : 'Macro Blackout' },
              ].map((tog) => (
                <label key={tog.k} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 cursor-pointer">
                  <span className="font-bold text-main flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--gold)' }} />
                    {tog.l}
                  </span>
                  <input
                    type="checkbox"
                    checked={riskForm[tog.k]}
                    onChange={(e) => setRiskForm((f) => ({ ...f, [tog.k]: e.target.checked }))}
                    className="w-4 h-4 accent-[#10d9a3]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="panel rounded-[26px] p-5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-jade" />
                <span>{isFa ? 'هوش مصنوعی مرکزی دلارینو (دُرّبین)' : 'Platform Central Multi-AI'}</span>
              </h3>
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                {platformAI?.configured ? (isFa ? 'فعال و مدیریت‌شده' : 'MANAGED ONLINE') : 'READY'}
              </span>
            </div>
            <p className="text-dim">
              {platformAI
                ? isFa
                  ? platformAI.effectiveModeLabelFa
                  : platformAI.effectiveModeLabelEn
                : isFa
                  ? 'تمام کلیدهای هوش مصنوعی توسط پلتفرم مدیریت می‌شوند؛ نیازی به تهیه کلید شخصی نیست.'
                  : 'Zero personal LLM keys needed — consensus engines run centrally.'}
            </p>
          </div>

          <div className="panel rounded-[26px] p-5">
            <TrustWalletConnectInline lang={lang} onMsg={flash} onRefresh={onRefresh} />
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison Modal for Verified Traders */}
      {compareOpen &&
        comparedVerified.length >= 2 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[210] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto" onClick={() => setCompareOpen(false)}>
            <div className="panel rounded-[28px] max-w-2xl w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Scale className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'مقایسه عملکرد تریدرها' : 'Trader Performance Comparison'}</span>
                </h3>
                <button type="button" onClick={() => setCompareOpen(false)} className="btn-ghost p-1.5 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b hairline text-dim">
                      <th className="py-2 text-start">{isFa ? 'شاخص' : 'Metric'}</th>
                      {comparedVerified.map((tr) => (
                        <th key={tr.id} className="py-2 text-center font-black text-main">{tr.display_name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    <tr>
                      <td className="py-2.5 text-dim">{isFa ? 'بازده ۳۰ روزه' : '30d ROI'}</td>
                      {comparedVerified.map((tr) => (
                        <td key={tr.id} dir="ltr" className="py-2.5 text-center font-num font-black text-jade">+{tr.roi_30d_pct}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</td>
                      {comparedVerified.map((tr) => (
                        <td key={tr.id} dir="ltr" className="py-2.5 text-center font-num font-bold text-main">{tr.win_rate}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 text-dim">{isFa ? 'حداکثر افت' : 'Max Drawdown'}</td>
                      {comparedVerified.map((tr) => (
                        <td key={tr.id} dir="ltr" className="py-2.5 text-center font-num font-bold text-amber-400">-{tr.max_drawdown_pct}%</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 text-dim">{isFa ? 'سطح ریسک' : 'Risk Level'}</td>
                      {comparedVerified.map((tr) => (
                        <td key={tr.id} className="py-2.5 text-center font-bold">{tr.risk_level}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2.5 text-dim">{isFa ? 'تخصص' : 'Specialty'}</td>
                      {comparedVerified.map((tr) => (
                        <td key={tr.id} className="py-2.5 text-center text-sub">{tr.specialty}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
