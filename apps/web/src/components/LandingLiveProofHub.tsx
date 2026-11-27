import { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  LineChart,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { CoinIcon } from './CoinIcon';
import { Sparkline } from './DollarinoViz';

export interface PublicStrategyBacktestItem {
  strategyKey: string;
  titleFa: string;
  titleEn: string;
  symbol: string;
  timeframe: string;
  candlesCount: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  profitFactor: number;
  netReturnUsd: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  sharpeEstimate: number;
  equityPoints: number[];
  computedAt: string;
}

export interface PublicChannelSignalPreview {
  id: string;
  symbol: string;
  direction: string;
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  status: string;
  engineSource: string;
  engineLabel: string;
  summary: string;
  closedCardId: string | null;
  createdAt: string;
}

export interface PublicWallet30dAuditRow {
  auditId: string;
  walletAddress: string;
  walletMasked: string;
  chain: 'EVM' | 'SOLANA' | 'TON' | 'TRON' | 'SIMULATOR';
  explorerUrl: string | null;
  mode: 'LIVE' | 'PAPER';
  tradesCount30d: number;
  wins30d: number;
  losses30d: number;
  winRate30d: number;
  netPnlUsd30d: number;
  totalMargin30d: number;
  roiPct30d: number;
  bestSymbol: string;
  equityPoints: number[];
  lastTradeAt: string;
}

export interface PublicVerifiedCardPreview {
  id: string;
  mode: 'LIVE' | 'PAPER';
  period: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  strategyName: string;
  symbol: string | null;
  issuedAt: string;
}

export interface PublicLiveProofPayload {
  ok: true;
  generatedAt: string;
  platformStats: {
    totalSignals: number;
    tpHitSignals: number;
    signalHitRatePct: number;
    closedTrades30d: number;
    liveClosedTrades30d: number;
    paperClosedTrades30d: number;
    liveWinRate30dPct: number;
    paperWinRate30dPct: number;
    verifiedCardsCount: number;
    connectedWalletsCount: number;
  };
  liveStrategyBacktests: PublicStrategyBacktestItem[];
  channelSignals: PublicChannelSignalPreview[];
  verifiedCards: PublicVerifiedCardPreview[];
  wallet30dLedger: PublicWallet30dAuditRow[];
}

interface WalletAuditLookupResponse {
  found: boolean;
  kind?: 'CARD' | 'WALLET_30D' | 'EXTERNAL_WALLET';
  error?: string;
  message?: string;
  registeredInDollarino?: boolean;
  auditId?: string;
  walletAddress?: string;
  walletMasked?: string;
  chain?: string;
  walletVerified?: boolean;
  explorerUrl?: string | null;
  mode?: 'LIVE' | 'PAPER';
  onChainTotalUsd?: number | null;
  onChainHoldings?: Array<{ symbol: string; base?: string; chain: string; balance: number; valueUsd: number }>;
  summary30d?: {
    tradesCount: number;
    liveTradesCount: number;
    paperTradesCount: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netPnlUsd: number;
    totalMarginUsd: number;
    roiPct: number;
    equityPoints: number[];
  };
  recentTrades?: Array<{
    id: string;
    mode: string;
    symbol: string;
    direction: string;
    leverage: number;
    marginUsd: number;
    pnlUsd: number;
    exitReason: string;
    closedAt: string;
  }>;
  verifiedSignature?: boolean;
  revoked?: boolean;
  card?: {
    id: string;
    mode: string;
    period: string;
    startDate: string;
    endDate: string;
    tradesCount: number;
    winRate: number;
    netPnlUsd: number;
    roiPct: number;
    profitFactor: number;
    strategyName: string;
    walletMasked?: string | null;
    issuedAt: string;
  };
}

function fmtPx(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  if (px >= 1000) return px.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(3);
  return px.toFixed(5);
}

export function LandingLiveProofHub({
  lang,
  onGoAuth,
  publicBotInfo,
}: {
  lang: Lang;
  onGoAuth: (mode: 'login' | 'register') => void;
  publicBotInfo: {
    botUsername: string;
    officialChannelInvite: string;
    signalsChannelInvite: string;
    resultsChannelInvite: string;
    communityGroupInvite: string;
    newsChannelInvite: string;
  };
}) {
  const isFa = lang === 'fa';
  const [proof, setProof] = useState<PublicLiveProofPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupInput, setLookupInput] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<WalletAuditLookupResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'LIVE' | 'PAPER'>('ALL');
  const [signalTab, setSignalTab] = useState<'SIGNALS' | 'RESULTS'>('SIGNALS');

  useEffect(() => {
    setLoading(true);
    apiFetch<PublicLiveProofPayload>('/api/public/live-proof')
      .then((res) => {
        setProof(res);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyVal = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const runLookup = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setLookupInput(q);
    setLookupBusy(true);
    try {
      const res = await apiFetch<WalletAuditLookupResponse>(
        `/api/public/verify-wallet?q=${encodeURIComponent(q)}`
      );
      setLookupResult(res);
    } catch (err) {
      setLookupResult({
        found: false,
        error: err instanceof Error ? err.message : 'Lookup failed',
      });
    } finally {
      setLookupBusy(false);
    }
  };

  const stats = proof?.platformStats;
  const backtests = proof?.liveStrategyBacktests ?? [];
  const signals = proof?.channelSignals ?? [];
  const cards = proof?.verifiedCards ?? [];
  const ledger = (proof?.wallet30dLedger ?? []).filter((row) =>
    ledgerFilter === 'ALL' ? true : row.mode === ledgerFilter
  );

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* SECTION A: Live Strategy Backtests + Digital 30-Day Wallet Audit Page */}
      <section id="digital-proof" className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
              <Activity className="w-3.5 h-3.5 text-jade" />
              <span>LIVE BACKTEST TELEMETRY · 30-DAY DIGITAL WALLET AUDIT</span>
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa
                ? 'صفحه دیجیتال زنده: بک‌تست لحظه‌ای، وین‌ریت و استعلام ۳۰ روزه ولت کاربران'
                : 'Live Digital Proof: Real-Time Backtests, Win Rate & 30-Day Wallet Audit'}
            </h2>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'هیچ عدد ساختگی وجود ندارد! بک‌تست زنده الگوریتم‌ها روی آخرین کندل‌های صرافی، خلاصه عملکرد ۳۰ روزه حساب‌ها به همراه آدرس ولت، و موتور استعلام فوری برای بررسی و راستی‌آزمایی پیش از ثبت‌نام.'
                : 'Zero synthetic numbers: live strategy backtests on exchange candles, transparent 30-day wallet summaries, and an instant public audit lookup for wallets and profit cards before signing up.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <img
              src="/logo-hd.webp"
              alt="Dollarino Audit Seal"
              className="w-11 h-11 rounded-2xl object-contain"
            />
            <div className="text-xs">
              <span className="block font-black text-main">
                {isFa ? 'تضمین استعلام دیجیتال زنده' : 'Live On-Server Audit'}
              </span>
              <span className="text-[11px] text-dim">
                {proof?.generatedAt
                  ? `${isFa ? 'بروزرسانی:' : 'Updated:'} ${new Date(proof.generatedAt).toLocaleTimeString(isFa ? 'fa-IR' : 'en-US')}`
                  : isFa
                    ? 'در حال همگام‌سازی...'
                    : 'Syncing...'}
              </span>
            </div>
          </div>
        </div>

        {/* Platform Transparent Real Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            {
              label: isFa ? 'سیگنال‌های ثبت‌شده' : 'Signals Logged',
              val: stats ? stats.totalSignals.toLocaleString('en-US') : '—',
              sub: isFa ? 'هوش مصنوعی و رادار' : 'AI & Radar Feed',
              color: 'text-main',
            },
            {
              label: isFa ? 'سیگنال‌های تارگت‌خورده' : 'TP-Hit Signals',
              val: stats ? stats.tpHitSignals.toLocaleString('en-US') : '—',
              sub: stats && stats.signalHitRatePct > 0 ? `${stats.signalHitRatePct}% Hit` : isFa ? 'نتایج ثبت‌شده' : 'Tracked Hits',
              color: 'text-jade',
            },
            {
              label: isFa ? 'تریدهای ۳۰ روزه' : '30d Closed Trades',
              val: stats ? stats.closedTrades30d.toLocaleString('en-US') : '—',
              sub: stats ? `LIVE ${stats.liveClosedTrades30d} · DEMO ${stats.paperClosedTrades30d}` : 'LIVE + DEMO',
              color: 'text-main',
            },
            {
              label: isFa ? 'وین‌ریت ۳۰ روزه LIVE' : '30d LIVE Win Rate',
              val: stats ? `${stats.liveWinRate30dPct}%` : '—',
              sub: isFa ? 'معاملات واقعی سرور' : 'Verified Real Mode',
              color: 'text-jade',
            },
            {
              label: isFa ? 'کارت‌های سود تاییدشده' : 'Verified PnL Cards',
              val: stats ? stats.verifiedCardsCount.toLocaleString('en-US') : '—',
              sub: 'HMAC-SHA256',
              color: 'text-[var(--gold)]',
            },
            {
              label: isFa ? 'ولت‌های متصل Trust' : 'Connected Wallets',
              val: stats ? stats.connectedWalletsCount.toLocaleString('en-US') : '—',
              sub: 'EVM · SOL · TON · TRX',
              color: 'text-brand',
            },
          ].map((k) => (
            <div key={k.label} className="panel rounded-2xl p-3.5 border hairline space-y-1">
              <span className="text-[10.5px] font-bold text-dim block truncate">{k.label}</span>
              <strong dir="ltr" className={`font-num font-black text-xl block ${k.color}`}>
                {k.val}
              </strong>
              <span dir="ltr" className="text-[10px] text-dim block truncate">
                {k.sub}
              </span>
            </div>
          ))}
        </div>

        {/* Live Candle Backtests Grid */}
        {backtests.length > 0 && (
          <div className="panel rounded-[28px] p-5 sm:p-6 border hairline space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-jade shrink-0" />
                <div>
                  <h3 className="font-display font-bold text-base sm:text-lg text-main">
                    {isFa
                      ? 'بک‌تست زنده روی کندل‌های واقعی صرافی (محاسبه لحظه‌ای توسط هسته استراتژی)'
                      : 'Live Strategy Backtests on Real Exchange Candles'}
                  </h3>
                  <p className="text-[11px] text-dim">
                    {isFa
                      ? 'اجرای موتور @dollarino/core روی ۲۶۰ کندل اخیر BTC، ETH و SOL با کارمزد و اسلیپیج واقعی و Risk-Free خودکار'
                      : 'Computed directly via @dollarino/core on the last 260 live candles with realistic fees, slippage & auto breakeven.'}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-jade text-[10px] font-black">
                LIVE CANDLE ENGINE
              </span>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {backtests.map((bt) => {
                const pos = bt.netReturnPct >= 0;
                return (
                  <div key={bt.strategyKey} className="surface-soft rounded-2xl p-4 border hairline space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CoinIcon symbol={bt.symbol} size={28} />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-main truncate">
                            {isFa ? bt.titleFa : bt.titleEn}
                          </p>
                          <p dir="ltr" className="text-[10px] font-bold text-dim">
                            {bt.symbol} · {bt.timeframe} · {bt.candlesCount} candles
                          </p>
                        </div>
                      </div>
                      <span
                        dir="ltr"
                        className={`px-2 py-0.5 rounded-full text-[11px] font-black shrink-0 ${
                          pos ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {bt.netReturnPct.toFixed(1)}%
                      </span>
                    </div>

                    {bt.equityPoints.length >= 2 && (
                      <div className="h-14">
                        <Sparkline values={bt.equityPoints} color={pos ? '#10d9a3' : '#f43f5e'} height={52} />
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                      <div className="panel rounded-xl py-1.5 px-1">
                        <strong dir="ltr" className="font-num font-black text-main block">
                          {bt.winRatePct}%
                        </strong>
                        <span className="text-[9.5px] text-dim">{isFa ? 'وین‌ریت' : 'Win'}</span>
                      </div>
                      <div className="panel rounded-xl py-1.5 px-1">
                        <strong dir="ltr" className="font-num font-black text-jade block">
                          {bt.profitFactor}
                        </strong>
                        <span className="text-[9.5px] text-dim">PF</span>
                      </div>
                      <div className="panel rounded-xl py-1.5 px-1">
                        <strong dir="ltr" className="font-num font-black text-main block">
                          {bt.totalTrades}
                        </strong>
                        <span className="text-[9.5px] text-dim">{isFa ? 'ترید' : 'Trades'}</span>
                      </div>
                      <div className="panel rounded-xl py-1.5 px-1">
                        <strong dir="ltr" className="font-num font-black text-loss block">
                          -{bt.maxDrawdownPct.toFixed(1)}%
                        </strong>
                        <span className="text-[9.5px] text-dim">DD</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Digital 30-Day Wallet Lookup + Audit Ledger Card */}
        <div className="panel glow-card-anim rounded-[30px] p-5 sm:p-7 border border-emerald-500/25 relative overflow-hidden space-y-6">
          {/* Subtle Low-Opacity Dollarino Logo Watermark */}
          <img
            src="/logo-hd.webp"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute -bottom-16 -left-12 w-72 h-72 object-contain opacity-[0.045]"
          />

          <div className="relative z-10 grid lg:grid-cols-[0.92fr_1.08fr] gap-6 items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-jade grid place-items-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-jade">
                    PUBLIC 30-DAY WALLET & CARD AUDIT PAGE
                  </span>
                  <h3 className="font-display font-black text-xl text-main">
                    {isFa
                      ? 'صفحه دیجیتال استعلام ۳۰ روزه آدرس ولت و کارت سود'
                      : 'Digital 30-Day Wallet & Profit-Card Lookup'}
                  </h3>
                </div>
              </div>

              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'آدرس کیف‌پول (EVM، Solana، TON یا TRON)، کد دیجیتال استعلام ۳۰ روزه (AUD-...) یا شناسه کارت سود (CRD_...) را وارد کنید تا خلاصه ۳۰ روزه حساب، وین‌ریت، سود دلاری، موجودی آن‌چین و تاریخچه معاملاتش را لحظه‌ای استعلام بگیرید.'
                  : 'Enter any wallet address (EVM, Solana, TON, TRON), 30-day audit code (AUD-...), or Profit Card ID (CRD_...) to verify 30-day PnL, win rate, recent trades, and live on-chain balance.'}
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runLookup(lookupInput);
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <div dir="ltr" className="relative flex-1">
                  <Search className="w-4 h-4 text-dim absolute top-1/2 -translate-y-1/2 left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    dir="ltr"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    placeholder="0x... / AUD-... / CRD_..."
                    className="w-full rounded-2xl surface-soft border hairline pl-10 pr-3.5 py-3 text-xs font-mono text-main focus:outline-none focus:border-[var(--gold)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={lookupBusy || !lookupInput.trim()}
                  className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black shrink-0 disabled:opacity-50"
                >
                  {lookupBusy
                    ? isFa
                      ? 'در حال استعلام...'
                      : 'Verifying...'
                    : isFa
                      ? 'استعلام دیجیتال ۳۰ روزه'
                      : 'Verify 30d Audit'}
                </button>
              </form>

              {proof?.wallet30dLedger?.length ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  <span className="text-dim font-bold">{isFa ? 'استعلام سریع نمونه:' : 'Quick Inspect:'}</span>
                  {proof.wallet30dLedger.slice(0, 3).map((w) => (
                    <button
                      key={w.auditId}
                      type="button"
                      dir="ltr"
                      onClick={() => void runLookup(w.walletAddress)}
                      className="px-2.5 py-1 rounded-full surface-soft border hairline hover:border-[var(--gold)] font-mono font-bold text-main transition"
                    >
                      {w.walletMasked} ({w.mode})
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="relative rounded-[24px] overflow-hidden border hairline shadow-xl">
              <img
                src="/images/landing-digital-audit-30d.webp"
                alt="Dollarino 30-Day Digital Wallet Audit"
                className="w-full h-60 sm:h-72 object-cover"
              />
              <div className="absolute top-3 start-3 inline-flex items-center gap-2 rounded-full bg-[#060d1f]/80 backdrop-blur-md px-3 py-1.5 border border-white/15">
                <img src="/logo-sm.webp" alt="Dollarino" className="w-5 h-5 object-contain" />
                <span className="text-[10.5px] font-black text-emerald-300">
                  {isFa ? 'تایید D1 + امضای HMAC + بلاکچین' : 'Server D1 + HMAC + On-Chain'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Lookup Result Sheet */}
          {lookupResult && (
            <div className="relative z-10 surface-soft rounded-[24px] p-5 border-2 border-[var(--gold)]/60 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BadgeCheck className={`w-5 h-5 ${lookupResult.found ? 'text-jade' : 'text-loss'}`} />
                  <strong className="text-sm font-black text-main">
                    {lookupResult.found
                      ? isFa
                        ? 'نتیجه استعلام دیجیتال ۳۰ روزه'
                        : 'Digital 30-Day Audit Sheet'
                      : isFa
                        ? 'موردی یافت نشد'
                        : 'Not Found'}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setLookupResult(null)}
                  className="w-7 h-7 rounded-full btn-ghost grid place-items-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!lookupResult.found ? (
                <p className="text-xs text-loss font-bold">{lookupResult.error}</p>
              ) : lookupResult.kind === 'CARD' && lookupResult.card ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="panel rounded-2xl p-3">
                    <span className="text-[10px] text-dim block">{isFa ? 'اصالت امضای سرور' : 'HMAC Signature'}</span>
                    <strong className={`text-sm font-black ${lookupResult.verifiedSignature ? 'text-jade' : 'text-loss'}`}>
                      {lookupResult.verifiedSignature ? (isFa ? 'معتبر و تاییدشده ✓' : 'Valid & Verified ✓') : isFa ? 'نامعتبر/ابطال‌شده' : 'Invalid / Revoked'}
                    </strong>
                  </div>
                  <div className="panel rounded-2xl p-3">
                    <span className="text-[10px] text-dim block">{isFa ? 'حالت و بازه' : 'Mode & Period'}</span>
                    <strong dir="ltr" className="font-black text-main">
                      {lookupResult.card.mode} · {lookupResult.card.period}
                    </strong>
                  </div>
                  <div className="panel rounded-2xl p-3">
                    <span className="text-[10px] text-dim block">{isFa ? 'سود خالص و ROI' : 'Net PnL & ROI'}</span>
                    <strong dir="ltr" className={`font-num font-black ${lookupResult.card.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {lookupResult.card.netPnlUsd >= 0 ? '+' : ''}${lookupResult.card.netPnlUsd.toFixed(2)} ({lookupResult.card.roiPct.toFixed(1)}%)
                    </strong>
                  </div>
                  <div className="panel rounded-2xl p-3">
                    <span className="text-[10px] text-dim block">{isFa ? 'وین‌ریت / تعداد ترید' : 'Win Rate / Trades'}</span>
                    <strong dir="ltr" className="font-num font-black text-main">
                      {lookupResult.card.winRate}% · {lookupResult.card.tradesCount}
                    </strong>
                  </div>
                </div>
              ) : lookupResult.kind === 'WALLET_30D' && lookupResult.summary30d ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-jade font-black text-[10px]">
                        {lookupResult.mode === 'LIVE' ? 'LIVE TRUST WALLET' : 'DEMO SIMULATOR (30D)'}
                      </span>
                      <span dir="ltr" className="font-mono font-bold text-main bg-[var(--panel)] px-3 py-1 rounded-xl border hairline">
                        {lookupResult.walletAddress}
                      </span>
                      {lookupResult.walletAddress && (
                        <button
                          type="button"
                          onClick={() => copyVal(lookupResult.walletAddress!, 'lookup_addr')}
                          className="btn-ghost px-2.5 py-1 rounded-xl text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          {copiedKey === 'lookup_addr' ? <Check className="w-3 h-3 text-jade" /> : <Copy className="w-3 h-3" />}
                          <span>{isFa ? 'کپی' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                    {lookupResult.explorerUrl && (
                      <a
                        href={lookupResult.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-[var(--gold)] hover:underline inline-flex items-center gap-1"
                      >
                        <span>{isFa ? 'بررسی در اکسپلورر بلاکچین' : 'View on Block Explorer'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                    <div className="panel rounded-2xl p-3">
                      <span className="text-[10px] text-dim block">{isFa ? 'معاملات ۳۰ روزه' : '30d Trades'}</span>
                      <strong dir="ltr" className="font-num font-black text-base text-main">
                        {lookupResult.summary30d.tradesCount}
                      </strong>
                    </div>
                    <div className="panel rounded-2xl p-3">
                      <span className="text-[10px] text-dim block">{isFa ? 'نرخ برد (Win Rate)' : 'Win Rate'}</span>
                      <strong dir="ltr" className="font-num font-black text-base text-jade">
                        {lookupResult.summary30d.winRatePct}%
                      </strong>
                    </div>
                    <div className="panel rounded-2xl p-3">
                      <span className="text-[10px] text-dim block">{isFa ? 'سود خالص ۳۰ روزه' : '30d Net PnL'}</span>
                      <strong
                        dir="ltr"
                        className={`font-num font-black text-base ${lookupResult.summary30d.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}
                      >
                        {lookupResult.summary30d.netPnlUsd >= 0 ? '+' : ''}${lookupResult.summary30d.netPnlUsd.toFixed(2)}
                      </strong>
                    </div>
                    <div className="panel rounded-2xl p-3">
                      <span className="text-[10px] text-dim block">{isFa ? 'بازده مارجین (ROI)' : 'Margin ROI'}</span>
                      <strong
                        dir="ltr"
                        className={`font-num font-black text-base ${lookupResult.summary30d.roiPct >= 0 ? 'text-jade' : 'text-loss'}`}
                      >
                        {lookupResult.summary30d.roiPct >= 0 ? '+' : ''}{lookupResult.summary30d.roiPct.toFixed(1)}%
                      </strong>
                    </div>
                    <div className="panel rounded-2xl p-3 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-dim block mb-1">{isFa ? 'روند ۳۰ روزه' : '30d Curve'}</span>
                      {lookupResult.summary30d.equityPoints.length >= 2 ? (
                        <Sparkline
                          values={lookupResult.summary30d.equityPoints}
                          color={lookupResult.summary30d.netPnlUsd >= 0 ? '#10d9a3' : '#f43f5e'}
                          height={28}
                        />
                      ) : (
                        <span className="text-[11px] text-dim">—</span>
                      )}
                    </div>
                  </div>

                  {lookupResult.recentTrades && lookupResult.recentTrades.length > 0 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                      {lookupResult.recentTrades.slice(0, 4).map((rt) => (
                        <div key={rt.id} className="panel rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div>
                            <span dir="ltr" className="font-black text-main block">
                              {rt.symbol} · {rt.direction}
                            </span>
                            <span className="text-[10px] text-dim">{rt.mode} · {rt.leverage}x · {rt.exitReason}</span>
                          </div>
                          <strong dir="ltr" className={`font-num font-black ${rt.pnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                            {rt.pnlUsd >= 0 ? '+' : ''}${rt.pnlUsd.toFixed(2)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-[var(--gold)] font-black text-[10px]">
                        {lookupResult.chain} ON-CHAIN WALLET
                      </span>
                      <span dir="ltr" className="font-mono font-bold text-main">{lookupResult.walletMasked}</span>
                    </div>
                    {lookupResult.explorerUrl && (
                      <a
                        href={lookupResult.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-[var(--gold)] hover:underline inline-flex items-center gap-1"
                      >
                        <span>{isFa ? 'اکسپلورر' : 'Explorer'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-dim">{lookupResult.message}</p>
                  {typeof lookupResult.onChainTotalUsd === 'number' && (
                    <div className="panel rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-main">
                        {isFa ? 'موجودی زنده استعلام‌شده آن‌چین:' : 'Live On-Chain Balance:'}
                      </span>
                      <strong dir="ltr" className="font-num font-black text-base text-jade">
                        ${lookupResult.onChainTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onGoAuth('register')}
                    className="btn-gold px-4 py-2 rounded-xl text-xs font-black"
                  >
                    {isFa ? 'ثبت ولت و شروع معامله روی همین آدرس' : 'Connect Wallet & Start Trading'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 30-Day Wallet Digital Ledger Table */}
          <div className="relative z-10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display font-bold text-sm sm:text-base text-main flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[var(--gold)]" />
                <span>
                  {isFa
                    ? 'خلاصه دیجیتال حساب و ولت کاربران در ۳۰ روز اخیر (کلیک جهت استعلام کامل)'
                    : '30-Day User Wallet Ledger (Click any row for full digital audit)'}
                </span>
              </h4>
              <div className="inline-flex rounded-xl surface-soft border hairline p-1 gap-1 text-[11px]">
                {(['ALL', 'LIVE', 'PAPER'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLedgerFilter(m)}
                    className={`px-2.5 py-1 rounded-lg font-black transition ${
                      ledgerFilter === m ? 'btn-gold' : 'text-dim hover:text-main'
                    }`}
                  >
                    {m === 'ALL' ? (isFa ? 'همه' : 'All') : m === 'LIVE' ? 'LIVE' : 'DEMO'}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
                {isFa ? 'در حال دریافت گزارش زنده ۳۰ روزه ولت‌ها از سرور...' : 'Loading 30-day wallet ledger...'}
              </div>
            ) : ledger.length === 0 ? (
              <div className="surface-soft rounded-2xl p-5 border border-dashed hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-black text-main">
                    {isFa
                      ? 'دفتر استعلام ۳۰ روزه آماده ثبت اولین معاملات واقعی و دمو است!'
                      : 'Digital 30-Day Wallet Ledger Ready for First Closed Trades'}
                  </p>
                  <p className="text-dim leading-relaxed">
                    {isFa
                      ? 'هیچ داده جعلی در سایت نمایش داده نمی‌شود. به‌محض بسته شدن معاملات کاربران (در حالت واقعی Trust Wallet یا دمو قابل تنظیم)، آدرس ولت، وین‌ریت، ROI و منحنی ۳۰ روزه آن‌‌ها به‌صورت خودکار و قابل استعلام اینجا منتشر می‌شود.'
                      : 'Zero fake entries are shown. As soon as users close live or demo trades, each wallet address, 30-day win rate, ROI, and audit code appear here automatically.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black shrink-0"
                >
                  {isFa ? 'شروع با دمو یا Trust Wallet' : 'Start Free Demo or Trust Wallet'}
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ledger.map((row) => {
                  const pos = row.netPnlUsd30d >= 0;
                  return (
                    <div
                      key={row.auditId}
                      onClick={() => void runLookup(row.walletAddress)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runLookup(row.walletAddress);
                      }}
                      className="surface-soft hover:border-[var(--gold)] cursor-pointer rounded-2xl p-4 border hairline space-y-3 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-black ${
                                row.mode === 'LIVE' ? 'bg-emerald-500/15 text-jade' : 'bg-blue-500/15 text-brand'
                              }`}
                            >
                              {row.mode === 'LIVE' ? 'LIVE TRUST' : 'DEMO'}
                            </span>
                            <span className="text-[10px] font-bold text-dim">{row.chain}</span>
                          </div>
                          <p dir="ltr" className="font-mono font-black text-xs text-main mt-1 truncate">
                            {row.walletMasked}
                          </p>
                        </div>
                        <div className="text-end shrink-0">
                          <strong dir="ltr" className={`font-num font-black text-sm block ${pos ? 'text-jade' : 'text-loss'}`}>
                            {pos ? '+' : ''}${row.netPnlUsd30d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                          <span dir="ltr" className={`text-[10.5px] font-bold ${pos ? 'text-jade' : 'text-loss'}`}>
                            {row.roiPct30d >= 0 ? '+' : ''}{row.roiPct30d.toFixed(1)}% ROI
                          </span>
                        </div>
                      </div>

                      {row.equityPoints.length >= 2 && (
                        <div className="h-10">
                          <Sparkline values={row.equityPoints} color={pos ? '#10d9a3' : '#f43f5e'} height={38} />
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10.5px] text-dim pt-1 border-t hairline">
                        <span>
                          {isFa ? `وین‌ریت ${row.winRate30d}% (${row.wins30d}/${row.tradesCount30d})` : `Win ${row.winRate30d}% (${row.wins30d}/${row.tradesCount30d})`}
                        </span>
                        <span className="font-bold text-[var(--gold)]">
                          {isFa ? 'استعلام کامل ←' : 'Audit →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION B: Public Signal Channel (01) & Results Channel (02) Pre-Signup Showcase */}
      <section id="signals-preview" className="space-y-6">
        <div className="panel rounded-[30px] p-5 sm:p-7 border hairline relative overflow-hidden space-y-6">
          {/* Subtle Dollarino Logo Watermark */}
          <img
            src="/logo-hd.webp"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute -top-14 -left-14 w-64 h-64 object-contain opacity-[0.04]"
          />

          <div className="relative z-10 grid lg:grid-cols-[1.08fr_0.92fr] gap-6 items-center">
            <div className="space-y-3.5">
              <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
                <Radio className="w-3.5 h-3.5 text-jade" />
                <span>PUBLIC SIGNAL &amp; RESULTS CHANNELS PREVIEW</span>
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-4xl text-main">
                {isFa
                  ? 'پیش‌نمایش زنده کانال سیگنال (01) و نتایج تاییدشده (02) — قبل از عضویت!'
                  : 'Preview Live Signals (01) & Verified Results (02) Before Signing Up'}
              </h2>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">
                {isFa
                  ? 'قبل از ساخت حساب می‌توانید آخرین سیگنال‌های صادرشده توسط هوش مصنوعی مرکزی، استراتژی‌ها و اسنایپر را همراه با نقطه ورود، حد ضرر، تارگت‌های ۱ تا ۳ و وضعیت برخورد به تارگت و کارت‌های سود PNG تاییدشده مستقیم ببینید یا به کانال‌های رسمی تلگرام ما سر بزنید.'
                  : 'Inspect real recent signals with Entry, SL, TP1–TP3, live target hits, and verified profit cards before creating an account — or join our public Telegram signal & results channels directly.'}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                {publicBotInfo.signalsChannelInvite && (
                  <a
                    href={publicBotInfo.signalsChannelInvite}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-emerald px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isFa ? 'کانال 01 · سیگنال‌های زنده' : '01. Live Signals Channel'}</span>
                  </a>
                )}
                {publicBotInfo.resultsChannelInvite && (
                  <a
                    href={publicBotInfo.resultsChannelInvite}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-gold px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>{isFa ? 'کانال 02 · نتایج و کارت سود' : '02. Signal Results Channel'}</span>
                  </a>
                )}
                {publicBotInfo.officialChannelInvite && (
                  <a
                    href={publicBotInfo.officialChannelInvite}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-jade" />
                    <span>{isFa ? 'چنل رسمی دلارینو' : 'Official Channel'}</span>
                  </a>
                )}
                {publicBotInfo.newsChannelInvite && (
                  <a
                    href={publicBotInfo.newsChannelInvite}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isFa ? 'کانال 07 · اخبار مهم بازار' : '07. Market News'}</span>
                  </a>
                )}
              </div>
            </div>

            <div className="relative rounded-[24px] overflow-hidden border hairline shadow-xl">
              <img
                src="/images/landing-signals-ecosystem.webp"
                alt="Dollarino Official Signals & Results Ecosystem"
                className="w-full h-56 sm:h-64 object-cover"
              />
            </div>
          </div>

          {/* Toggle between Channel 01 Signals & Channel 02 Verified Result Cards */}
          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline pb-3">
              <div className="inline-flex rounded-2xl surface-soft border hairline p-1 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSignalTab('SIGNALS')}
                  className={`px-4 py-2 rounded-xl font-black transition inline-flex items-center gap-1.5 ${
                    signalTab === 'SIGNALS' ? 'btn-emerald' : 'text-dim hover:text-main'
                  }`}
                >
                  <LineChart className="w-3.5 h-3.5" />
                  <span>{isFa ? `خوراک سیگنال‌ها (${signals.length})` : `Live Signal Feed (${signals.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSignalTab('RESULTS')}
                  className={`px-4 py-2 rounded-xl font-black transition inline-flex items-center gap-1.5 ${
                    signalTab === 'RESULTS' ? 'btn-gold' : 'text-dim hover:text-main'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>{isFa ? `کارت‌های نتایج تاییدشده (${cards.length})` : `Verified Result Cards (${cards.length})`}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="text-xs font-black text-[var(--gold)] hover:underline inline-flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isFa ? 'فیلتر هوشمند سیگنال به تفکیک موتور پس از ورود ←' : 'Customize per-engine signal delivery →'}</span>
              </button>
            </div>

            {signalTab === 'SIGNALS' ? (
              signals.length === 0 ? (
                <div className="surface-soft rounded-2xl p-5 text-xs text-dim flex flex-wrap items-center justify-between gap-3 border border-dashed hairline">
                  <span>
                    {isFa
                      ? 'رادار و هوش مصنوعی مرکزی هر ۱۵ دقیقه سیگنال‌های تاییدشده را در کانال 01 و پنل منتشر می‌کنند. هم‌اکنون می‌توانید مستقیم از دکمه‌های تلگرام بالا آرشیو را ببینید یا با حساب رایگان وارد رادار زنده شوید.'
                      : 'Signals publish automatically from AI & Radar every 15 minutes. Open the Telegram channels above or enter Radar freely.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onGoAuth('register')}
                    className="btn-cobalt px-4 py-2 rounded-xl font-black text-xs"
                  >
                    {isFa ? 'ورود به رادار زنده' : 'Open Live Radar'}
                  </button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {signals.map((sig) => {
                    const isLong = String(sig.direction).toUpperCase() === 'LONG';
                    const anyTp = sig.tp1Hit || sig.tp2Hit || sig.tp3Hit;
                    return (
                      <div key={sig.id} className="surface-soft rounded-2xl p-4 border hairline space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CoinIcon symbol={sig.symbol} size={24} />
                              <div className="min-w-0">
                                <span dir="ltr" className="font-black text-main block truncate">
                                  {sig.symbol}
                                </span>
                                <span dir="ltr" className="text-[10px] text-dim block">
                                  {sig.timeframe} · {sig.engineLabel}
                                </span>
                              </div>
                            </div>
                            <span
                              dir="ltr"
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                isLong ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'
                              }`}
                            >
                              {sig.direction}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 text-[10.5px] font-num" dir="ltr">
                            <div className="panel rounded-lg p-1.5 text-center">
                              <span className="text-[9px] text-dim block">ENTRY</span>
                              <strong className="text-main">{fmtPx(sig.entryPrice)}</strong>
                            </div>
                            <div className="panel rounded-lg p-1.5 text-center">
                              <span className="text-[9px] text-dim block">TP1</span>
                              <strong className="text-jade">{fmtPx(sig.tp1)}</strong>
                            </div>
                            <div className="panel rounded-lg p-1.5 text-center">
                              <span className="text-[9px] text-dim block">SL</span>
                              <strong className="text-loss">{fmtPx(sig.stopLoss)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t hairline text-[10px]">
                          <span className={`font-black inline-flex items-center gap-1 ${anyTp ? 'text-jade' : 'text-dim'}`}>
                            {anyTp ? <CheckCircle2 className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            <span>
                              {sig.tp3Hit
                                ? 'TP3 HIT ✓'
                                : sig.tp2Hit
                                  ? 'TP2 HIT ✓'
                                  : sig.tp1Hit
                                    ? 'TP1 HIT ✓'
                                    : sig.status}
                            </span>
                          </span>
                          {sig.closedCardId ? (
                            <button
                              type="button"
                              onClick={() => void runLookup(sig.closedCardId!)}
                              className="font-bold text-[var(--gold)] hover:underline"
                            >
                              {isFa ? 'استعلام کارت' : 'Audit Card'}
                            </button>
                          ) : (
                            <span dir="ltr" className="text-dim">
                              {new Date(sig.createdAt).toLocaleDateString(isFa ? 'fa-IR' : 'en-US')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : cards.length === 0 ? (
              <div className="surface-soft rounded-2xl p-5 text-xs text-dim border border-dashed hairline">
                {isFa
                  ? 'کارت‌های نتایج تاییدشده به صورت خودکار هنگام بسته شدن معاملات سودده روی کانال 02 منتشر و با کد HMAC در سرور ذخیره می‌شوند.'
                  : 'Verified result PNG cards are automatically issued upon trade close and published to Channel 02.'}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {cards.map((c) => {
                  const pos = c.netPnlUsd >= 0;
                  return (
                    <div key={c.id} className="surface-soft rounded-2xl p-4 border hairline space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9.5px] font-black ${
                              c.mode === 'LIVE' ? 'bg-emerald-500/15 text-jade' : 'bg-blue-500/15 text-brand'
                            }`}
                          >
                            {c.mode} · {c.period}
                          </span>
                          <p className="font-black text-main mt-1">
                            {c.symbol || c.strategyName}
                          </p>
                        </div>
                        <div className="text-end" dir="ltr">
                          <strong className={`font-num font-black text-base block ${pos ? 'text-jade' : 'text-loss'}`}>
                            {pos ? '+' : ''}${c.netPnlUsd.toFixed(2)}
                          </strong>
                          <span className={`text-[10.5px] font-bold ${pos ? 'text-jade' : 'text-loss'}`}>
                            {c.roiPct >= 0 ? '+' : ''}{c.roiPct.toFixed(1)}% · WR {c.winRate}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t hairline text-[10.5px]">
                        <span dir="ltr" className="font-mono text-dim truncate">{c.id}</span>
                        <button
                          type="button"
                          onClick={() => void runLookup(c.id)}
                          className="font-black text-[var(--gold)] hover:underline shrink-0"
                        >
                          {isFa ? 'تایید اصالت HMAC ←' : 'Verify HMAC →'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
