import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  CandlestickChart,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  Hand,
  KeyRound,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo } from '../lib/types';

export function OnboardingAcademyModal({
  open,
  lang,
  user,
  onClose,
  onDone,
}: {
  open: boolean;
  lang: Lang;
  user: AuthUserInfo;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [step, setStep] = useState(0);
  const [twAddress, setTwAddress] = useState(user.trust_wallet_address || '');
  const [twSolana, setTwSolana] = useState(user.trust_wallet_solana || '');
  const [execMode, setExecMode] = useState<'AUTO' | 'MANUAL_CONFIRM'>('AUTO');
  const [tradingMode, setTradingMode] = useState<'PAPER' | 'LIVE'>(
    user.trust_wallet_address || user.trust_wallet_solana ? 'LIVE' : 'LIVE'
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const stepsMeta = [
    {
      badgeFa: 'نمای کلی',
      badgeEn: 'Overview',
      titleFa: 'سلام به دلارینو! دستیار ترید ۲۴/۷ و ربات دُرنا V1',
      titleEn: 'Welcome to Dollarino! Your 24/7 Smart Trading Desk',
      subtitleFa:
        'داشبورد نمای کلی هم نمای «ساده» (مبتدی) دارد و هم نمای «حرفه‌ای». ربات هوشمند با تحلیل زنده و ۳ تارگت سود کار می‌کند و کنترل همه معاملات با یک نگاه در دست شماست.',
      subtitleEn:
        'Switch between Simple and Pro Dashboard anytime. The AI Engine monitors markets 24/7 with 3 take-profit targets and real-time PnL tracking.',
      img: '/images/transparent/mascot-astronaut.png',
    },
    {
      badgeFa: 'کیف‌پول Trust',
      badgeEn: 'Trust Wallet',
      titleFa: 'قدم ۱: اتصال Trust Wallet (حقیقی یا شبیه‌ساز دمو)',
      titleEn: 'Step 1: Connect Trust Wallet (Live or Free Custom Demo)',
      subtitleFa:
        'پول شما همیشه ۱۰۰٪ داخل کیف‌پول Trust Wallet شخصی خودتان می‌ماند (غیرامانی). آدرس EVM/Solana خود را متصل کنید تا ۳ معامله سودده اول را با کارمزد ۰٪ شروع کنید — یا با دمو ($50 تا $10M) رایگان تمرین کنید!',
      subtitleEn:
        'Your funds stay 100% in your non-custodial Trust Wallet across EVM, Solana, TON & TRON. Get 0% fees on your first 3 profitable LIVE trades or practice free in Custom Demo.',
      img: '/images/transparent/trust-shield-3d.png',
    },
    {
      badgeFa: 'اسنایپر و رادار',
      badgeEn: 'Radar & Sniper',
      titleFa: 'قدم ۲: رادار DexScreener و اسنایپر میم‌کوین',
      titleEn: 'Step 2: DexScreener Radar & Meme Sniper Workbench',
      subtitleFa:
        'در تب «رادار و اسنایپر»، توکن‌های جدید زنجیره‌های Solana، BSC، Base، ETH و TON لحظه‌به‌لحظه با نمره ایمنی (Trust Score) فیلتر می‌شوند و با ۱ کلیک خرید مستقیم یا سوآپ Trust Wallet انجام می‌شود.',
      subtitleEn:
        'Inside Radar & Sniper, tokens on Solana, BSC, Base, ETH & TON are screened by live Trust Score with 1-click direct buy and Trust Wallet DApp status.',
      img: '/images/transparent/sniper-rocket-3d.png?v=1165',
    },
    {
      badgeFa: 'کپی‌ترید و پرپ',
      badgeEn: 'Copy & Perp DEX',
      titleFa: 'قدم ۳: کپی‌ترید هوشمند و معاملات Perp DEX تا ۱۰۰x',
      titleEn: 'Step 3: Smart Copy-Trading & 100x Perp DEX Futures',
      subtitleFa:
        'تریدرهای حرفه‌ای دلخواهتان را با فیلتر هولدر/اسکلپر، مشاهده سبد ارزهای کیف‌پول و بودجه مشخص دنبال کنید یا در پنل Perp DEX معاملات اهرم‌دار باز کنید.',
      subtitleEn:
        'Mirror top verified traders with wallet holdings & style filters, or trade up to 100x on Hyperliquid / dYdX / GMX directly with 24/7 execution.',
      img: '/images/transparent/trophy-copy-3d.png',
    },
    {
      badgeFa: 'ترمینال و AI',
      badgeEn: 'Terminal & AI',
      titleFa: 'قدم ۴: ترمینال حرفه‌ای، کندل‌های زنده و تحلیل‌گر AI',
      titleEn: 'Step 4: Pro Candlestick Terminal & Live AI Analyst',
      subtitleFa:
        'در صفحه «ترمینال»، چارت لحظه‌ای تمام رمزارزها، سفارش‌گذاری دستی با انتخاب اهرم/تارگت و تحلیل هوشمند روند بازار را یکجا در اختیار دارید.',
      subtitleEn:
        'Inspect live candlestick charts, place custom Long/Short orders with TP/SL, and consult the AI Market Analyst inside the Terminal tab.',
      img: '/images/transparent/tv-chart-3d.png',
    },
    {
      badgeFa: 'پورتفوی یکپارچه',
      badgeEn: 'Unified Wallet',
      titleFa: 'قدم ۵: کیف‌پول و پورتفوی یکپارچه (همه معاملات یکجا)',
      titleEn: 'Step 5: Unified Portfolio & 1-Click Batch Profit Take',
      subtitleFa:
        'در بخش «کیف‌پول و معاملات باز»، همه موقعیت‌های CEX، DEX/اسنایپر، کپی‌ترید و Perp با برچسب منبع و سود ثانیه‌ای کنار هم نمایش داده می‌شوند — همراه با دکمه‌های «برداشت همه سودها» و «بستن همه ضررها» و مشاور هوشمند AI.',
      subtitleEn:
        'View all open CEX, DEX/Sniper, Copy-Trade & Perp positions side-by-side with live 1.5s PnL ticks, AI Coach proposals, and 1-click Take All Profit / Close All Losing buttons.',
      img: '/images/transparent/piggy-wallet-3d.png',
    },
    {
      badgeFa: 'امنیت و ۳٪ کارمزد',
      badgeEn: '2FA & 3% Model',
      titleFa: 'قدم ۶: امنیت دو‌مرحله‌ای (2FA) و مدل منصفانه ۳٪ سود',
      titleEn: 'Step 6: Google 2FA Security & Transparent 3% Profit-Share',
      subtitleFa:
        'در صفحه «پروفایل و خدمات» می‌توانید ورود دومرحله‌ای Google Authenticator (2FA) را فعال کنید. اشتراک ماهانه در دلارینو صفر است؛ ۳ معامله سودده اول رایگان و پس از آن فقط ۳٪ از سود واقعی (با امکان پیش‌پرداخت و تسویه خودکار بدهی)!',
      subtitleEn:
        'Protect your account with Google Authenticator 2FA in Services. $0 monthly subscription: first 3 live winning trades are 0% fee, then just 3% of real net profits.',
      img: '/images/transparent/capital-vault-3d.png?v=1165',
    },
    {
      badgeFa: 'آماده شروع',
      badgeEn: 'Final Setup',
      titleFa: 'قدم آخر: انتخاب حالت اجرا (دستی یا تمام‌خودکار ۲۴/۷)',
      titleEn: 'Final Step: Choose Execution Style & Save Setup',
      subtitleFa:
        'مشخص کنید ربات به صورت تمام‌خودکار ۲۴/۷ کار کند یا قبل از هر معامله تایید دستی بگیرد. پس از ذخیره، ربات فعلاً متوقف می‌ماند تا خودتان با اطمینان استارت بزنید.',
      subtitleEn:
        'Pick Full 24/7 Auto-Pilot or 1-Click Manual Confirmation. Your bot stays paused until you review rules and press Start on the dashboard.',
      img: '/images/transparent/rocket-profit-3d.png',
    },
  ];

  const totalSteps = stepsMeta.length;
  const pct = Math.round(((step + 1) / totalSteps) * 100);
  const stepMeta = stepsMeta[step]!;

  const handleConnectTrustInStep = async () => {
    setErr('');
    setMsg('');
    if (!twAddress.trim() && !twSolana.trim()) {
      setErr(
        isFa
          ? 'آدرس EVM (مثلاً 0x...) یا Solana تراست‌ولت را وارد کن یا شبیه‌ساز دمو را انتخاب کن.'
          : 'Enter an EVM (0x...) or Solana Trust Wallet address, or pick the free Custom Demo.'
      );
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/trustwallet/connect', {
        method: 'POST',
        body: JSON.stringify({
          evmAddress: twAddress.trim() || undefined,
          solanaAddress: twSolana.trim() || undefined,
        }),
      });
      tgNotifyHaptic('success');
      setMsg(isFa ? 'آفرین! کیف‌پول Trust Wallet با موفقیت به حسابت وصل شد' : 'Trust Wallet connected');
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePreferencesAndFinish = async () => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      let targetTradingMode = tradingMode;
      if (
        targetTradingMode === 'LIVE' &&
        !twAddress.trim() &&
        !twSolana.trim() &&
        !user.trust_wallet_address &&
        !user.trust_wallet_solana
      ) {
        targetTradingMode = 'PAPER';
      }
      await apiFetch('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          executionMode: execMode,
          tradingMode: targetTradingMode,
          syncCopyRules: true,
        }),
      }).catch(async (errMode) => {
        const text = errMode instanceof Error ? errMode.message : '';
        if (targetTradingMode === 'LIVE' && (/10/i.test(text) || /wallet|trust/i.test(text))) {
          await apiFetch('/api/trustwallet/execution-mode', {
            method: 'POST',
            body: JSON.stringify({
              executionMode: execMode,
              tradingMode: 'PAPER',
              syncCopyRules: true,
            }),
          });
        } else {
          throw errMode;
        }
      });
      localStorage.setItem(`dollarino_academy_done_${user.id}`, '1');
      tgNotifyHaptic('success');
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      onClick={() => {
        localStorage.setItem(`dollarino_academy_done_${user.id}`, '1');
        onClose();
      }}
    >
      <div
        className="w-full max-w-3xl rounded-[30px] border hairline bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Progress Header with Interactive Step Chips */}
        <div className="px-5 py-4 border-b hairline space-y-3 bg-[var(--soft)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 px-2.5 rounded-2xl bg-[#0D47A1] text-white grid place-items-center text-xs font-black shrink-0">
                {step + 1}/{totalSteps}
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-black text-main truncate">
                  {isFa ? 'آکادمی تعاملی و انیمیشنی دلارینو — راهنمای کامل تمام بخش‌ها' : 'Dollarino Interactive Walkthrough — Complete App Tour'}
                </p>
                <div className="w-40 sm:w-64 h-1.5 rounded-full bg-black/10 dark:bg-white/10 mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0D47A1] via-[#38BDF8] to-[#10B981] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="academy-close-btn"
              aria-label={isFa ? 'بستن آموزش' : 'Close Academy'}
              onClick={() => {
                localStorage.setItem(`dollarino_academy_done_${user.id}`, '1');
                onClose();
              }}
              className="h-8 w-8 rounded-full surface-soft border hairline grid place-items-center text-dim hover:text-main transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {stepsMeta.map((m, idx) => (
              <button
                key={m.badgeEn}
                type="button"
                onClick={() => {
                  tgHaptic('light');
                  setErr('');
                  setMsg('');
                  setStep(idx);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-black whitespace-nowrap transition ${
                  idx === step
                    ? 'bg-[#0D47A1] text-white shadow'
                    : idx < step
                      ? 'bg-emerald-500/15 text-jade border border-emerald-500/25'
                      : 'surface-soft text-dim hover:text-main border hairline'
                }`}
              >
                {idx + 1}. {isFa ? m.badgeFa : m.badgeEn}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div key={step} className="p-5 sm:p-6 overflow-y-auto space-y-5 academy-step-enter">
          <div className="flex flex-col sm:flex-row items-center gap-5 rounded-3xl p-4 sm:p-5 surface-soft border hairline relative overflow-hidden">
            <div className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0 flex items-center justify-center">
              <div
                aria-hidden
                className="absolute inset-2 rounded-full blur-xl opacity-20 animate-pulse"
                style={{ background: 'radial-gradient(circle, #38BDF8 0%, #1652F0 55%, #F59E0B 100%)' }}
              />
              <img
                src={stepMeta.img}
                alt={isFa ? stepMeta.titleFa : stepMeta.titleEn}
                className="relative z-10 h-28 w-28 sm:h-32 sm:w-32 object-contain drop-shadow-[0_10px_18px_rgba(13,71,161,0.2)] animate-float"
              />
              <div
                title="Dollarino"
                className="absolute bottom-0 end-0 z-20 w-9 h-9 rounded-full bg-[var(--bg-surface)]/95 border border-sky-400/50 shadow-lg flex items-center justify-center p-1"
              >
                <img src="/logo.png" alt="Dollarino" className="w-full h-full object-contain rounded-full" />
              </div>
            </div>

            <div className="text-center sm:text-start space-y-2 flex-1">
              <h2 className="text-base sm:text-xl font-black text-main leading-snug">
                {isFa ? stepMeta.titleFa : stepMeta.titleEn}
              </h2>
              <p className="text-xs sm:text-sm text-sub leading-relaxed">
                {isFa ? stepMeta.subtitleFa : stepMeta.subtitleEn}
              </p>
            </div>
          </div>

          {/* Step 0: Overview + Animated Live Bot & PnL Preview */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 bg-gradient-to-br from-[#06122B] to-[#0D2558] text-white border border-sky-400/25 relative overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
                  <div className="flex items-center gap-2.5">
                    <span className="h-3 w-3 rounded-full bg-emerald-400 academy-pulse-dot" />
                    <span className="text-xs font-black">
                      {isFa ? 'پیش‌نمایش زنده داشبورد نمای کلی (Dorina V1 AI)' : 'Live Overview Simulation (Dorina V1 AI)'}
                    </span>
                  </div>
                  <div dir="ltr" className="flex items-center gap-2 font-num text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/25 text-emerald-300 font-black">+$148.40 (LIVE PnL)</span>
                    <span className="px-2.5 py-1 rounded-full bg-white/15 font-bold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                      <span>TP1 · TP2</span>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] relative z-10">
                  <div className="rounded-xl bg-white/10 p-2.5">
                    <span className="text-white/70 block">{isFa ? 'نمای ساده و حرفه‌ای' : 'Simple & Pro Views'}</span>
                    <strong className="text-white">{isFa ? 'تغییر با ۱ کلیک در بالا' : '1-Click Header Toggle'}</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 p-2.5">
                    <span className="text-white/70 block">{isFa ? 'ربات دُرنا V1' : 'Dorina V1 Engine'}</span>
                    <strong className="text-emerald-300">{isFa ? 'مدیریت ۲۴ ساعته خودکار' : '24/7 Risk Managed'}</strong>
                  </div>
                  <div className="rounded-xl bg-white/10 p-2.5">
                    <span className="text-white/70 block">{isFa ? 'شروع با اطمینان' : 'Safe Controls'}</span>
                    <strong className="text-amber-300">{isFa ? 'دکمه توقف آنی ربات' : 'Instant Pause Anytime'}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Trust Wallet + Live / Custom Demo Setup */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="rounded-2xl p-3.5 surface-soft border hairline flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
                  <span className="font-bold text-main">
                    {isFa ? 'جریان غیرحضانتی:' : 'Non-Custodial Flow:'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-black">
                  <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-brand">Trust Wallet</span>
                  <span className="text-jade academy-pulse-dot">⇄</span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-jade">
                    {isFa ? 'امضای امن بدون کلید خصوصی' : 'Signed Without Seed Phrase'}
                  </span>
                  <span className="text-jade academy-pulse-dot">⇄</span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-500">97% Profit Yours</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setTradingMode('LIVE');
                  }}
                  className={`rounded-2xl p-3.5 text-start border transition ${
                    tradingMode === 'LIVE'
                      ? 'bg-[#0D47A1] text-white border-[#0D47A1]'
                      : 'surface-soft text-main hairline'
                  }`}
                >
                  <p className="font-black text-xs flex items-center gap-1.5">
                    <Wallet className="w-4 h-4" />
                    <span>{isFa ? 'حساب واقعی Trust Wallet (حداقل $۱۰)' : 'Real Trust Wallet ($10+ Min)'}</span>
                  </p>
                  <p className={`text-[11px] mt-1 ${tradingMode === 'LIVE' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa ? '۳ معامله سودده اول با کارمزد ۰٪ · کنترل ۱۰۰٪ دارایی دست خودتان.' : 'First 3 profitable LIVE trades 0% fee · 100% self-custody.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setTradingMode('PAPER');
                  }}
                  className={`rounded-2xl p-3.5 text-start border transition ${
                    tradingMode === 'PAPER'
                      ? 'bg-[#059669] text-white border-[#059669]'
                      : 'surface-soft text-main hairline'
                  }`}
                >
                  <p className="font-black text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>{isFa ? 'شبیه‌ساز دمو رایگان ($50–$10M)' : 'Free Custom Demo ($50–$10M)'}</span>
                  </p>
                  <p className={`text-[11px] mt-1 ${tradingMode === 'PAPER' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa ? 'با قیمت لحظه‌ای واقعی بازار بدون ریسک تمرین کن!' : 'Practice risk-free with real live prices.'}
                  </p>
                </button>
              </div>

              <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black text-main">
                    {isFa ? 'آدرس Trust Wallet خود را متصل کنید (اختیاری در حالت دمو):' : 'Connect Trust Wallet address (optional for Demo):'}
                  </p>
                  <a
                    href="https://trustwallet.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-black text-brand inline-flex items-center gap-1 hover:underline"
                  >
                    <span>{isFa ? 'نصب Trust Wallet' : 'Get Trust Wallet'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    dir="ltr"
                    value={twAddress}
                    onChange={(e) => setTwAddress(e.target.value)}
                    placeholder="EVM (0x...) — BSC / ETH / Arbitrum"
                    className="input-pro rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <input
                    dir="ltr"
                    value={twSolana}
                    onChange={(e) => setTwSolana(e.target.value)}
                    placeholder="Solana Address (اختیاری)"
                    className="input-pro rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConnectTrustInStep()}
                    className="px-4 py-2 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white text-xs font-black transition disabled:opacity-50"
                  >
                    {isFa ? 'ذخیره و اتصال Trust Wallet' : 'Connect Trust Wallet'}
                  </button>
                  {typeof (window as unknown as { ethereum?: unknown }).ethereum !== 'undefined' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const eth = (window as unknown as { ethereum: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
                          const accounts = await eth.request({ method: 'eth_requestAccounts' });
                          if (accounts?.[0]) setTwAddress(accounts[0]);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="px-3 py-2 rounded-xl surface-soft border hairline text-xs font-bold text-main"
                    >
                      {isFa ? 'تشخیص خودکار افزونه ولت' : 'Auto-Detect Browser Wallet'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Radar & Meme Sniper */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 surface-soft border hairline relative overflow-hidden space-y-3">
                <div
                  aria-hidden
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent academy-scan-beam pointer-events-none"
                />
                <div className="flex items-center justify-between gap-2 text-xs font-black">
                  <span className="inline-flex items-center gap-1.5 text-amber-500">
                    <Crosshair className="w-4 h-4" />
                    <span>{isFa ? 'اسکنر زنده میم‌کوین (داخل بخش کپی‌ترید ← اسنایپر)' : 'Live Meme Scanner (Copy & Wallet → Sniper)'}</span>
                  </span>
                  <span dir="ltr" className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-jade text-[10px]">
                    Trust Score 89/100 ✓
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-dim" dir="ltr">
                    <span>Min Safety: 40</span>
                    <span className="text-main">Recommended: 70+</span>
                    <span>98</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" />
                  </div>
                </div>
                <p className="text-[11px] text-sub leading-relaxed">
                  {isFa
                    ? 'می‌توانید فیلتر حداقل امتیاز ایمنی (۴۰ تا ۹۸) و حجم دلخواه را تنظیم کنید تا اسنایپر توکن‌های مطمئن را پیدا کرده و لینک خرید مستقیم در Trust Wallet یا ثبت دمو بسازد.'
                    : 'Set your min safety score (40–98) and USD budget. Every snipe tracks live DexScreener price and gives a 1-click Trust Wallet swap link.'}
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Copy-Trading & 100x Perp DEX */}
          {step === 3 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2">
                <p className="font-black text-main flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#059669]" />
                  <span>{isFa ? 'کپی‌ترید هوشمند ۲۴/۷' : '24/7 Smart Copy-Trading'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'آدرس کیف‌پول هر تریدر موفق را اضافه کنید تا همگام با حرکات آن‌چین او و با بودجه محدود‌شده خودتان معامله باز شود.'
                    : 'Add top on-chain wallets or pick curated traders and automatically mirror entries inside your capped Copy-Vault budget.'}
                </p>
              </div>
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2">
                <p className="font-black text-main flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-violet-400" />
                  <span>{isFa ? 'معاملات فیوچرز Perp DEX (تا ۱۰۰x)' : 'Perp DEX Futures (Up to 100x)'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'سفارش لانگ و شورت بدون تحریم روی Hyperliquid، GMX و dYdX با کلید Agent بدون حق برداشت!'
                    : 'Trade Long/Short futures on Hyperliquid, GMX & dYdX with trade-only Agent keys.'}
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Terminal & AI Analyst */}
          {step === 4 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2">
                <p className="font-black text-main flex items-center gap-1.5">
                  <CandlestickChart className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'نمودار کندلی و سفارش‌گذاری' : 'Live Chart & Order Entry'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'نمودار لحظه‌ای ارزها، تایم‌فریم‌های مختلف، عمق بازار و ثبت معامله دستی با اهرم، حد سود و حد ضرر دلخواه.'
                    : 'Full TradingView-style candles, order book depth, and manual Long/Short tickets with custom TP/SL.'}
                </p>
              </div>
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2">
                <p className="font-black text-main flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'تحلیل‌گر هوشمند و دُرنا V1' : 'AI Market Analyst'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'با یک کلیک تحلیل دقیق نقاط ورود، حمایت/مقاومت و ریسک هر ارز را به زبان فارسی ساده دریافت کنید.'
                    : 'Get instant technical & risk breakdowns for any coin in clear language.'}
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Unified Portfolio & 1-Click Batch Close */}
          {step === 5 && (
            <div className="space-y-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-main inline-flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'نمایش یکپارچه کل معاملات باز + دکمه‌های ۱-کلیکی:' : 'All Open Trades Unified + Batch Controls:'}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-[#059669] text-white text-[10px] font-black">
                      {isFa ? 'برداشت همه سودها' : 'Take All Profit'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss border border-rose-500/30 text-[10px] font-black">
                      {isFa ? 'بستن همه ضررها' : 'Close All Losing'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-black text-center">
                  <div className="rounded-xl p-2 bg-sky-500/10 text-brand">CEX / Dorina V1</div>
                  <div className="rounded-xl p-2 bg-amber-500/10 text-amber-500">DEX / Sniper</div>
                  <div className="rounded-xl p-2 bg-emerald-500/10 text-jade">Smart Copy V2</div>
                  <div className="rounded-xl p-2 bg-violet-500/10 text-violet-400">Perp DEX</div>
                </div>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'تمامی دارایی‌ها و معاملات باز از هر ۴ منبع، هر ۱.۵ ثانیه در کیف‌پول و نمای کلی آپدیت می‌شوند تا هیچ سودی از دست نرود.'
                    : 'All 4 position sources sync every 1.5s across Overview & Wallet so you can monitor and take profits with 1 click.'}
                </p>
              </div>
            </div>
          )}

          {/* Step 6: 2FA Security + 3% Model + Referrals */}
          {step === 6 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-1.5">
                <p className="font-black text-main flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'احراز دومرحله‌ای (Google 2FA)' : 'Google Authenticator 2FA'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? 'در «پروفایل و خدمات» می‌توانید با اسکن QR کد در Google Authenticator امنیت ورود حسابتان را ۲ برابری کنید.'
                    : 'Enable TOTP 2FA QR protection inside Profile & Services for bank-grade login safety.'}
                </p>
              </div>
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-1.5">
                <p className="font-black text-main flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                  <span>{isFa ? 'کارمزد ۳٪ و پاداش دعوت دوستان' : '3% Profit Fee & Referral Credits'}</span>
                </p>
                <p className="text-sub leading-relaxed">
                  {isFa
                    ? '۳ معامله سودده اول ۰٪ کارمزد! پس از آن ۳٪ فقط از سود واقعی (در صورت داشتن بدهی و شارژ بیشتر، ابتدا بدهی تسویه و مازاد پیش‌پرداخت کارمزد می‌شود).'
                    : 'First 3 live wins are 0% fee. Thereafter 3% on net profits only — deposits automatically settle any due fee first and credit the remainder.'}
                </p>
              </div>
            </div>
          )}

          {/* Step 7: Execution Style Choice */}
          {step === 7 && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setExecMode('MANUAL_CONFIRM');
                  }}
                  className={`rounded-2xl p-4 text-start border transition space-y-1.5 ${
                    execMode === 'MANUAL_CONFIRM'
                      ? 'bg-[#D97706] text-white border-[#D97706]'
                      : 'surface-soft text-main hairline'
                  }`}
                >
                  <p className="font-black text-sm flex items-center gap-1.5">
                    <Hand className="w-4 h-4" />
                    <span>{isFa ? 'تایید دستی ۱-کلیکی' : '1-Click Manual Confirm'}</span>
                  </p>
                  <p className={`text-xs leading-relaxed ${execMode === 'MANUAL_CONFIRM' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa
                      ? 'ربات فرصت‌ها را شکار و پیشنهاد می‌دهد؛ فقط با تایید خودتان معامله باز می‌شود.'
                      : 'Bot spots setups and awaits your 1-click confirmation before execution.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('light');
                    setExecMode('AUTO');
                  }}
                  className={`rounded-2xl p-4 text-start border transition space-y-1.5 ${
                    execMode === 'AUTO'
                      ? 'bg-[#059669] text-white border-[#059669]'
                      : 'surface-soft text-main hairline'
                  }`}
                >
                  <p className="font-black text-sm flex items-center gap-1.5">
                    <Bot className="w-4 h-4" />
                    <span>{isFa ? 'تمام‌اتوترید خودکار ۲۴/۷' : 'Full 24/7 Auto-Pilot'}</span>
                  </p>
                  <p className={`text-xs leading-relaxed ${execMode === 'AUTO' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa
                      ? 'ربات به‌صورت خودکار وارد معامله شده و ۳ تارگت سود و حد ضرر را ۲۴/۷ مدیریت می‌کند.'
                      : 'Automatically opens, manages SL, and captures 3 take-profit levels 24/7.'}
                  </p>
                </button>
              </div>

              <div className="rounded-2xl p-3.5 surface-soft border hairline text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-black text-main">
                  <CheckCircle2 className="w-4 h-4 text-jade" />
                  <span>
                    {isFa ? 'حالت انتخابی:' : 'Selected:'}{' '}
                    {tradingMode === 'LIVE' ? (isFa ? 'Trust Wallet واقعی' : 'Live Trust Wallet') : isFa ? 'دمو رایگان' : 'Free Demo'} ·{' '}
                    {execMode === 'AUTO' ? (isFa ? 'اتوترید ۲۴/۷' : '24/7 Auto') : isFa ? 'تایید دستی' : 'Manual'}
                  </span>
                </div>
                <span className="text-[11px] text-jade font-bold">
                  {isFa ? 'اشتراک: $0 · ۳ معامله سودده اول: ۰٪' : '$0 Sub · First 3 Wins 0%'}
                </span>
              </div>
            </div>
          )}

          {msg && (
            <div className="rounded-2xl px-4 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-main">
              {msg}
            </div>
          )}
          {err && (
            <div className="rounded-2xl px-4 py-2.5 bg-rose-500/15 border border-rose-500/30 text-xs font-bold text-loss">
              {err}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-4 border-t hairline bg-[var(--soft)] flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => {
              setErr('');
              setMsg('');
              setStep((s) => Math.max(0, s - 1));
            }}
            className="px-4 py-2 rounded-xl surface-soft border hairline text-xs font-bold text-main disabled:opacity-40 inline-flex items-center gap-1"
          >
            {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span>{isFa ? 'مرحله قبل' : 'Back'}</span>
          </button>

          {step < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => {
                tgHaptic('light');
                setErr('');
                setMsg('');
                setStep((s) => Math.min(totalSteps - 1, s + 1));
              }}
              className="px-5 py-2.5 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white text-xs font-black inline-flex items-center gap-1.5 transition"
            >
              <span>{isFa ? 'مرحله بعد' : 'Next Step'}</span>
              {isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSavePreferencesAndFinish()}
              className="px-6 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-lg transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'ذخیره تنظیمات و شروع کار' : 'Save Setup & Enter App'}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
