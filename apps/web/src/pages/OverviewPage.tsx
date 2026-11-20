import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  Layers,
  PlusCircle,
  Power,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { AnimatedNumber, AreaChart, ConsensusGauge, LiveDot, Sparkline } from '../components/DollarinoViz';
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

export function OverviewPage({
  lang,
  user,
  data,
  markets,
  onNavigate,
  onSelectTerminalSymbol,
  onRefresh,
  onUpgradeUser,
}: {
  lang: Lang;
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
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(2500);
  const [saveGuestOpen, setSaveGuestOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ email: '', username: '', password: '' });
  const [saveErr, setSaveErr] = useState('');

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

  const toggleTradingMode = async (mode: 'PAPER' | 'LIVE') => {
    if (mode === data.config.trading_mode) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/config', {
        method: 'PUT',
        body: JSON.stringify({ trading_mode: mode }),
      });
      if (!res.ok && res.error) toastMsg(res.error, true);
      else toastMsg(mode === 'PAPER' ? (isFa ? 'حساب دمو فعال شد' : 'Paper mode active') : isFa ? 'حساب واقعی فعال شد' : 'Live mode active');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Mode switch failed', true);
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
        body: JSON.stringify({ scanScope: scanScope }),
      });
      toastMsg(isFa ? 'ربات با موفقیت روشن شد و اسکن زنده آغاز گردید 🚀' : 'Bot started — scanning markets 🚀');
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
      const res = await apiFetch<{ tradesClosed?: number; settlement?: { tradesClosed?: number; netSessionPnl?: number } }>('/api/trading/bot/stop', {
        method: 'POST',
        body: JSON.stringify({ settleOpen }),
      });
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

  const selectEngine = async (engine: 'ai' | 'dorna') => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/config', {
        method: 'PUT',
        body: JSON.stringify({
          strategy_key: engine === 'ai' ? 'ai_autonomous_agent' : 'dollarino_v01',
          ai_gate_enabled: engine === 'ai' ? 1 : 0,
        }),
      });
      if (!res.ok && res.error) toastMsg(res.error, true);
      else toastMsg(engine === 'ai' ? (isFa ? 'هوش مصنوعی دُرّبین فعال شد' : 'Dorrbin AI activated') : isFa ? 'استراتژی دُرنا V1 فعال شد' : 'Dorna V1 activated');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const selectRiskPreset = async (preset: (typeof RISK_PRESETS)[number]) => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PUT',
        body: JSON.stringify({
          margin_pct: preset.marginPct,
          max_leverage: preset.maxLev,
          daily_max_loss_pct: preset.dailyLoss,
          max_open_positions: preset.maxOpen,
          risk_profile_json: JSON.stringify({ preset: preset.id }),
        }),
      });
      toastMsg(isFa ? `ریسک «${preset.titleFa}» ذخیره شد` : `${preset.titleEn} saved`);
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Risk update failed', true);
    } finally {
      setBusy(false);
    }
  };

  const updateScanScope = async (scope: 'ALL_MARKET' | 'TOP_COINS' | 'SINGLE', sym?: string) => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PUT',
        body: JSON.stringify({ scan_scope: scope, ...(sym ? { symbol: sym } : {}) }),
      });
      toastMsg(isFa ? 'محدوده اسکن ربات بروزرسانی شد' : 'Market scope updated');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Failed', true);
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (tradeId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/positions/${tradeId}/close`, { method: 'POST' });
      toastMsg(isFa ? 'معامله بسته و سود/زیان تسویه شد ✅' : 'Position closed ✅');
      await onRefresh();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : 'Close failed', true);
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
      toastMsg(isFa ? 'حساب کاربری با ایمیل شخصی شما ثبت دائمی شد ✅' : 'Account saved permanently ✅');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Guest Quick-Demo Conversion Banner */}
      {isGuestDemo && (
        <div className="panel rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--gold)]/35">
          <div className="flex items-center gap-2.5 text-xs">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} />
            <span className="text-main font-semibold">
              {isFa
                ? 'شما با حساب دمو مهمان ($۱۰,۰۰۰ رایگان) وارد شده‌اید. برای ذخیره همیشگی معاملات و ارتقا، ایمیل خود را ثبت کنید.'
                : 'You are in an instant Guest Demo ($10,000). Bind an email to save your progress permanently.'}
            </span>
          </div>
          <button type="button" onClick={() => setSaveGuestOpen(true)} className="btn-gold px-4 py-2 rounded-xl text-xs">
            {isFa ? 'ذخیره دائمی حساب' : 'Save Account'}
          </button>
        </div>
      )}

      {/* Alerts */}
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

      {/* 1. Signature Overview Hero + Live Equity Card (02.zip Overview.tsx + timetrade.live controls) */}
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 panel rounded-full px-4 py-1.5 text-[10px] font-black tracking-[0.12em] mb-4" style={{ color: 'var(--gold-soft)' }}>
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'live-gold bg-gold'}`} />
            <span>
              {isRunning
                ? isFa
                  ? `ربات فعال · اسکن ${scanScope === 'ALL_MARKET' ? '۳۰+ بازار' : data.config.symbol}`
                  : `BOT LIVE · SCANNING ${scanScope}`
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
              ? '۳ موتور هوشمند دُرّبین، دُرنا V1 و کپی‌ترید به‌صورت همزمان تا ۲۰ پوزیشن را با حد ضرر و ۳ تارگت خودکار مدیریت می‌کنند.'
              : 'Deploy autonomous strategies, analyze charts with AI, and manage up to 20 simultaneous futures positions with automated risk protection.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
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
              onClick={() => onNavigate('terminal')}
              className="btn-ghost inline-flex items-center gap-2 font-bold px-5 py-3.5 rounded-2xl text-xs sm:text-sm"
            >
              <span>{isFa ? 'باز کردن پایانه و چارت AI' : 'Open Pro Terminal & Chart AI'}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="mt-7 grid grid-cols-4 gap-2 max-w-lg">
            {[
              { v: '30+', l: isFa ? 'ارز تحت اسکن' : 'Markets' },
              { v: String(data.openTrades.length), l: isFa ? 'معامله باز' : 'Open Now' },
              { v: `${data.stats.winRate.toFixed(0)}%`, l: isFa ? 'وین‌ریت' : 'Win Rate' },
              { v: `${data.config.max_leverage}×`, l: isFa ? 'سقف اهرم' : 'Max Lev' },
            ].map((s) => (
              <div key={s.l} className="panel rounded-2xl px-2 py-3 text-center">
                <p dir="ltr" className="font-display font-bold text-lg sm:text-2xl tabular" style={{ color: 'var(--gold-soft)' }}>
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
                  onClick={() => void toggleTradingMode('PAPER')}
                  className={`px-3 py-1 rounded-lg transition ${
                    data.config.trading_mode === 'PAPER' ? 'btn-gold' : 'text-dim hover:text-main'
                  }`}
                >
                  {isFa ? 'دمو رایگان' : 'Paper'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleTradingMode('LIVE')}
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
                <div className="flex items-center gap-2 text-xs text-dim font-semibold">
                  <span>{isFa ? 'ارزش کل حساب (Equity)' : 'Total Equity'}</span>
                  <button type="button" onClick={() => setHideBal((v) => !v)} className="text-dim hover:text-main">
                    {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  {data.config.trading_mode === 'PAPER' && (
                    <button
                      type="button"
                      onClick={() => setTopupOpen(true)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline"
                      style={{ color: 'var(--gold)' }}
                    >
                      <PlusCircle className="w-3 h-3" />
                      {isFa ? 'افزایش موجودی' : 'Top Up'}
                    </button>
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

      {/* Connected Venues Ribbon */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
        {['Paper Demo', 'Toobit Futures', 'KCEX Futures'].map((x) => (
          <span key={x} className="inline-flex items-center gap-1.5 panel rounded-full px-4 py-1.5 text-xs font-bold text-main">
            <BadgeCheck className="w-3.5 h-3.5 text-jade" />
            <span>{x}</span>
          </span>
        ))}
      </div>

      {/* 2. Autonomous Trading Team (3 Engines — 1-click activate) */}
      <section className="space-y-4 border-t hairline pt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              {isFa ? 'تیم موتورهای خودکار' : 'AUTONOMOUS TRADING TEAM'}
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main mt-1">
              {isFa ? '۱. انتخاب موتور معامله‌گر' : '1. Choose Your Active Engine'}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-jade border border-jade/25 bg-jade/10 rounded-full px-3 py-1.5">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-jade" />
            <span>ALL SYSTEMS ONLINE</span>
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3.5">
          {[
            {
              id: 'ai' as const,
              active: activeStrategy === 'ai_autonomous_agent',
              code: 'DORR-BIN',
              title: isFa ? 'هوش مصنوعی دُرّبین' : 'Dorrbin Multi-AI',
              desc: isFa ? 'اجماع چند مدل هوش مصنوعی روی ساختار بازار بدون نیاز به کلید API شخصی.' : 'Consensus Multi-LLM engine managed centrally by Dollarino.',
              win: 74,
              color: '#e8c15a',
              icon: BrainCircuit,
              onClick: () => void selectEngine('ai'),
            },
            {
              id: 'dorna' as const,
              active: activeStrategy !== 'ai_autonomous_agent',
              code: 'DORNA V1',
              title: isFa ? 'استراتژی دُرنا V1' : 'Dorna V1 Strategy',
              desc: isFa ? 'شکار نقدینگی، روند و ریبون غیرریپینت؛ کاملاً رایگان در دمو و واقعی.' : 'Non-repaint trend & liquidity sweep strategy free for all accounts.',
              win: 68,
              color: '#10d9a3',
              icon: Crosshair,
              onClick: () => void selectEngine('dorna'),
            },
            {
              id: 'copy' as const,
              active: false,
              code: 'MIRROR',
              title: isFa ? 'کپی‌ترید تلگرام' : 'Telegram Copy-Trade',
              desc: isFa ? 'اجرای خودکار سیگنال‌های کانال رسمی یا کانال شخصی و TradingView.' : 'Instant sub-second mirroring of Telegram & TradingView webhooks.',
              win: 79,
              color: '#38e1ff',
              icon: Bot,
              onClick: () => onNavigate('copy'),
            },
          ].map((e) => {
            const Icon = e.icon;
            return (
              <div
                key={e.id}
                onClick={e.onClick}
                className={`cursor-pointer panel panel-hover rounded-[26px] p-5 relative overflow-hidden ${
                  e.active ? 'ring-2 ring-[var(--gold)]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="h-11 w-11 rounded-2xl grid place-items-center"
                    style={{ background: `${e.color}20`, color: e.color, border: `1px solid ${e.color}44` }}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span
                    dir="ltr"
                    className="text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full"
                    style={{ background: `${e.color}20`, color: e.color }}
                  >
                    {e.code}
                  </span>
                </div>
                <h3 className="font-display font-bold text-lg text-main">{e.title}</h3>
                <p className="text-xs text-dim mt-1.5 leading-relaxed min-h-[44px]">{e.desc}</p>
                <div className="flex items-center justify-between text-xs font-bold mt-4 mb-1.5">
                  <span className="text-dim">{isFa ? 'وین‌ریت برآوردی' : 'Est. Win Rate'}</span>
                  <span dir="ltr" className="tabular" style={{ color: e.color }}>{e.win}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${e.win}%`, background: e.color }} />
                </div>
                <div className="mt-4 text-xs font-black flex items-center justify-between" style={{ color: e.color }}>
                  <span>{e.active ? (isFa ? '✓ انتخاب‌شده و فعال' : '✓ Active Engine') : isFa ? 'انتخاب این موتور' : 'Activate'}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Simple 2-Card Risk & Market Scope */}
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
                  onClick={() => void selectRiskPreset(p)}
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

        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? '۳. ارزهای تحت معامله' : '3. Market Scan Scope'}
            </h3>
            <SymbolPicker
              lang={lang}
              markets={markets}
              value={data.config.symbol}
              provider={data.activeExchange?.provider || 'paper'}
              onChange={(sym) => void updateScanScope('SINGLE', sym)}
              compact
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'ALL_MARKET' as const, title: isFa ? '🌐 کل بازار (۳۰+)' : '🌐 All Markets', sub: isFa ? 'اسکن خودکار کامل' : 'Full scan' },
              { id: 'TOP_COINS' as const, title: isFa ? '⭐ ۱۰ ارز برتر' : '⭐ Top 10', sub: isFa ? 'نقدینگی بالا' : 'High volume' },
              { id: 'SINGLE' as const, title: isFa ? '🎯 تک‌ارز' : '🎯 Single Coin', sub: data.config.symbol },
            ].map((s) => {
              const on = scanScope === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void updateScanScope(s.id)}
                  className={`p-3.5 rounded-2xl border text-start transition ${
                    on ? 'border-[var(--gold)] bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)]' : 'surface-soft hover:border-[var(--gold)]/50'
                  }`}
                >
                  <div className="text-xs font-black text-main">{s.title}</div>
                  <div className="text-[11px] text-dim mt-1 truncate">{s.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Open Positions & Live Consensus Snapshot */}
      <section className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div className="panel rounded-[26px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <Zap className="w-4 h-4 text-jade" />
              <span>{isFa ? `معاملات باز (${data.openTrades.length})` : `Open Positions (${data.openTrades.length})`}</span>
            </h3>
            <button type="button" onClick={() => onNavigate('portfolio')} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
              {isFa ? 'گزارش کامل ←' : 'Full Portfolio →'}
            </button>
          </div>

          {data.openTrades.length === 0 ? (
            <div className="rounded-2xl border border-dashed hairline py-10 text-center text-xs text-dim space-y-2">
              <p className="font-bold text-main">
                {isRunning
                  ? isFa
                    ? 'ربات در حال اسکن زنده ۳۰+ ارز برای شکار بهترین نقطه ورود است...'
                    : 'Bot is scanning 30+ pairs for the next clean setup...'
                  : isFa
                    ? 'هنوز معامله بازی وجود ندارد.'
                    : 'No open positions yet.'}
              </p>
              <p>
                {isFa
                  ? 'دکمه «شروع خودکار ربات» را بزنید یا از پایانه معامله دستی ثبت کنید.'
                  : 'Click Start Auto-Trading above or place a trade from Terminal.'}
              </p>
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
                        <span className="font-bold text-sm text-main">{pos.symbol}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-black ${
                            pos.direction === 'LONG' ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'
                          }`}
                        >
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

      {/* Modals */}
      {stopConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setStopConfirmOpen(false)}>
          <div className="pop-in panel !bg-[var(--panel)] rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
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
          <form onSubmit={handleTopup} className="pop-in panel !bg-[var(--panel)] rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
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
          <form onSubmit={handleSaveGuest} className="pop-in panel !bg-[var(--panel)] rounded-[26px] w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}
