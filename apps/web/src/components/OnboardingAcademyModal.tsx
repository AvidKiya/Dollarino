import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  Hand,
  Rocket,
  ShieldCheck,
  Sparkles,
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
  const [tradingMode, setTradingMode] = useState<'PAPER' | 'LIVE'>('PAPER');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const totalSteps = 6;
  const pct = Math.round(((step + 1) / totalSteps) * 100);

  const stepMeta = [
    {
      titleFa: 'سلام! دلارینو دقیقاً چیه؟ (خیلی ساده)',
      titleEn: 'Hi! What is Dollarino? (Super Simple)',
      subtitleFa: 'فرض کن یک دستیار هوشمند کنار توست که ۲۴ ساعته بازار ارز دیجیتال را رصد می‌کند تا وقتت هدر نرود.',
      subtitleEn: 'Think of Dollarino as a friendly smart helper watching crypto markets 24/7 for you.',
      img: '/images/transparent/mascot-astronaut.png',
    },
    {
      titleFa: 'قدم اول: کیف پول چیه و چرا Trust Wallet؟',
      titleEn: 'Step 1: What is a Wallet? Why Trust Wallet?',
      subtitleFa: 'کیف پول مثل قلک امن شخصی خودت است؛ کلید و رمزش فقط دست خودت است و دلارینو هیچ‌وقت نمی‌تواند پولت را بردارد!',
      subtitleEn: 'Trust Wallet is your own private digital piggy bank—only you hold the keys. Dollarino can never take your money.',
      img: '/images/transparent/piggy-wallet-3d.png',
    },
    {
      titleFa: 'قدم دوم: اتصال Trust Wallet (یا تست رایگان ۱۰,۰۰۰ دلاری)',
      titleEn: 'Step 2: Connect Trust Wallet (or Free $10,000 Demo)',
      subtitleFa: 'برای ترید واقعی حداقل ۱۰ دلار داخل تراست‌ولت لازم است؛ اگر هنوز نداری یا می‌خواهی تمرین کنی، شبیه‌ساز ۱۰,۰۰۰ دلاری کاملاً رایگان است!',
      subtitleEn: 'Real trading requires at least $10 in Trust Wallet; want to practice first? Our $10,000 Simulator is 100% free!',
      img: '/images/transparent/trust-shield-3d.png',
    },
    {
      titleFa: 'قدم سوم: دستی یا تمام‌خودکار ۲۴/۷؟',
      titleEn: 'Step 3: Manual Confirm or 24/7 Auto-Pilot?',
      subtitleFa: 'دوست داری قبل از هر معامله اول از تو اجازه بگیرد (دستی) یا ربات خودش خودکار معامله را باز و مدیریت کند (اتوترید ۲۴/۷)؟',
      subtitleEn: 'Should Dollarino ask you with 1 click before every trade, or manage trades automatically 24/7?',
      img: '/images/transparent/ai-brain-3d.png',
    },
    {
      titleFa: 'قدم چهارم: اشتراک صفر تومان · مدیریت ریسک و اعتبار رفرال',
      titleEn: 'Step 4: $0 Sub · Risk Management & Fee-Credit Referrals',
      subtitleFa: 'در هر معامله فقط ۱٪ تا ۳٪ سرمایه ریسک کنید، همیشه استاپ‌لاس بگذارید و با دعوت دوستان واقعی (دارای ≥$۱۰ و ترید واقعی) اعتبار کارمزد ۵٪ رایگان بگیرید!',
      subtitleEn: 'Risk only 1–3% per trade with Stop-Loss, keep 95% of real profits (5% fee), and earn non-withdrawable fee credits by inviting active traders ($10+ live trade).',
      img: '/images/referral-invite-banner.png?v=105',
    },
    {
      titleFa: 'قدم پنجم: آماده شروع؟ بریم سراغ سود هوشمند!',
      titleEn: 'Step 5: Ready to Launch Smart Trading!',
      subtitleFa: 'همه‌چیز برای شروع آماده است! همیشه می‌توانید از صفحه «راهنما و آموزش»، «چت AI» یا «پشتیبانی آنلاین» کمک بگیرید.',
      subtitleEn: 'You are all set! You can always open the Training Guide, Floating AI Chat, or Online Support anytime.',
      img: '/images/transparent/rocket-profit-3d.png',
    },
  ][step]!;

  const handleConnectTrustInStep = async () => {
    setErr('');
    setMsg('');
    if (!twAddress.trim() && !twSolana.trim()) {
      setErr(isFa ? 'آدرس EVM (مثلاً 0x...) یا Solana تراست‌ولت را وارد کن یا از گزینه شبیه‌ساز ۱۰,۰۰۰ دلاری استفاده کن.' : 'Enter an EVM (0x...) or Solana Trust Wallet address, or pick the free Demo Simulator.');
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
      setMsg(isFa ? 'آفرین! کیف‌پول Trust Wallet با موفقیت به حسابت وصل شد ✅' : 'Awesome! Trust Wallet is now connected ✅');
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePreferencesAndFinish = async (startBotNow: boolean) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await apiFetch('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          executionMode: execMode,
          tradingMode,
          syncCopyRules: true,
        }),
      });
      if (startBotNow) {
        await apiFetch('/api/trading/bot/start', {
          method: 'POST',
          body: JSON.stringify({
            tradeExecutionMode: execMode,
            strategyKey: 'dollarino_v01',
          }),
        });
      }
      localStorage.setItem(`dollarino_academy_done_${user.id}`, '1');
      tgNotifyHaptic('success');
      await onDone();
      onClose();
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Failed to save';
      setErr(text);
      if (tradingMode === 'LIVE' && /10/i.test(text)) {
        setTradingMode('PAPER');
      }
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
        className="w-full max-w-2xl rounded-[30px] border hairline bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Progress Header */}
        <div className="px-5 py-4 border-b hairline flex items-center justify-between gap-3 bg-[var(--soft)]">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-2xl bg-[#0D47A1] text-white grid place-items-center text-xs font-black">
              {step + 1}/{totalSteps}
            </span>
            <div>
              <p className="text-xs font-black text-main">
                {isFa ? 'آموزش انیمیشنی و راه‌اندازی حساب دلارینو' : 'Dollarino Interactive Step-by-Step Academy'}
              </p>
              <div className="w-36 sm:w-52 h-1.5 rounded-full bg-black/10 dark:bg-white/10 mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0D47A1] to-[#10B981] transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(`dollarino_academy_done_${user.id}`, '1');
              onClose();
            }}
            className="h-8 w-8 rounded-full surface-soft grid place-items-center text-dim hover:text-main transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          <div className="flex flex-col sm:flex-row items-center gap-5 rounded-3xl p-4 sm:p-5 surface-soft border hairline">
            <div className="relative h-32 w-32 sm:h-36 sm:w-36 shrink-0 flex items-center justify-center">
              <div
                aria-hidden
                className="absolute inset-2 rounded-full blur-xl opacity-35 animate-pulse"
                style={{ background: 'radial-gradient(circle, #3B82F6 0%, #F59E0B 70%, transparent 100%)' }}
              />
              <img
                src={stepMeta.img}
                alt={isFa ? stepMeta.titleFa : stepMeta.titleEn}
                className="relative z-10 h-32 w-32 sm:h-36 sm:w-36 object-contain drop-shadow-[0_12px_24px_rgba(13,71,161,0.3)] animate-float"
              />
            </div>

            <div className="text-center sm:text-start space-y-2 flex-1">
              <h2 className="text-lg sm:text-xl font-black text-main leading-snug">
                {isFa ? stepMeta.titleFa : stepMeta.titleEn}
              </h2>
              <p className="text-xs sm:text-sm text-sub leading-relaxed">
                {isFa ? stepMeta.subtitleFa : stepMeta.subtitleEn}
              </p>
            </div>
          </div>

          {step === 0 && (
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-1">
                <p className="font-black text-main">۱. بدون نیاز به دانش قبلی</p>
                <p className="text-dim leading-relaxed">حتی اگر تابه‌حال ترید نکردی، ربات با دُرنا V1 و هوش مصنوعی قدم‌به‌قدم راهنمایی‌ت می‌کند.</p>
              </div>
              <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-1">
                <p className="font-black text-main">۲. فقط با Trust Wallet</p>
                <p className="text-dim leading-relaxed">دیگر نیازی به صرافی‌های پیچیده و تحریمی نیست؛ همه‌چیز با یک تراست‌ولت ساده کار می‌کند.</p>
              </div>
              <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-1">
                <p className="font-black text-main">۳. تست ۱۰,۰۰۰ دلاری مجانی</p>
                <p className="text-dim leading-relaxed">اول با پول آزمایشی ۱۰٬۰۰۰ دلاری تمرین کن تا کامل یاد بگیری، بعد هر وقت آماده بودی واقعی ترید کن.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2">
                <p className="font-black text-main flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  <span>چرا دارایی در Trust Wallet صددرصد امن است؟</span>
                </p>
                <ul className="space-y-1.5 text-sub list-disc ps-5">
                  <li>۱۲ کلمه بازیابی تراست‌ولت فقط نزد خودتان است — دلارینو هیچ‌وقت دسترسی برداشت از کیف‌پول شما ندارد.</li>
                  <li>اگر هنوز Trust Wallet نصب نکرده‌اید، از لینک رسمی زیر رایگان نصب کنید:</li>
                </ul>
                <div className="pt-1 flex flex-wrap gap-2">
                  <a
                    href="https://trustwallet.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D47A1] text-white font-bold"
                  >
                    <span>دانلود رسمی Trust Wallet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
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
                    <span>{isFa ? 'شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری (رایگان)' : 'Free $10,000 Demo Simulator'}</span>
                  </p>
                  <p className={`text-[11px] mt-1 ${tradingMode === 'PAPER' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa ? 'بدون نیاز به پول واقعی؛ با قیمت واقعی بازار یاد بگیر!' : 'Zero real risk, live market prices.'}
                  </p>
                </button>

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
                    <span>{isFa ? 'حساب واقعی Trust Wallet (حداقل ۱۰ دلار)' : 'Real Trust Wallet ($10+ Min)'}</span>
                  </p>
                  <p className={`text-[11px] mt-1 ${tradingMode === 'LIVE' ? 'text-white/90' : 'text-dim'}`}>
                    {isFa ? 'نیازمند اتصال آدرس و حداقل $10 موجودی واقعی.' : 'Requires connected wallet with >= $10 USD.'}
                  </p>
                </button>
              </div>

              <div className="rounded-2xl p-4 surface-soft border hairline space-y-2.5">
                <p className="text-xs font-black text-main">
                  {isFa ? 'آدرس کیف‌پول Trust Wallet خود را اینجا وارد کنید (اختیاری برای دمو):' : 'Paste your Trust Wallet address (optional for Demo):'}
                </p>
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
                        } catch { /* ignore */ }
                      }}
                      className="px-3 py-2 rounded-xl surface-soft border hairline text-xs font-bold text-main"
                    >
                      {isFa ? 'اتصال با افزونه Trust Wallet' : 'Auto-Detect Browser Wallet'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
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
                  {isFa ? 'ربات فرصت‌ها را پیدا می‌کند و به تلگرام می‌فرستد؛ فقط وقتی «تایید» بزنی معامله باز می‌شود.' : 'Sends you a Telegram button; opens only after you tap Confirm.'}
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
                  {isFa ? 'شبانه‌روزی معامله‌ها را با ۳ تارگت سود و حد ضرر خودکار باز و مدیریت می‌کند.' : 'Automatically enters, sets SL & 3 take-profit targets 24/7.'}
                </p>
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-1.5">
                <p className="font-black text-main flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  <span>{isFa ? 'اصول طلایی امنیت و ریسک' : 'Golden Risk & Security Rules'}</span>
                </p>
                <ul className="space-y-1 text-sub list-disc ps-4">
                  <li>{isFa ? 'هرگز ۱۲ کلمه Trust Wallet را در هیچ سایتی وارد نکنید.' : 'Never share your 12-word recovery phrase anywhere.'}</li>
                  <li>{isFa ? 'در فیوچرز اهرم منطقی (۲x تا ۵x برای شروع) و استاپ‌لاس فعال بگذارید.' : 'Use conservative leverage (2x–5x) and Stop-Loss.'}</li>
                  <li>{isFa ? 'فقط وقتی آماده بودید با حداقل $۱۰ وارد حالت LIVE شوید.' : 'Switch to LIVE only when ready with >= $10.'}</li>
                </ul>
              </div>
              <div className="rounded-2xl p-4 surface-soft border hairline space-y-1.5">
                <p className="font-black text-main flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                  <span>{isFa ? 'سیستم رفرال کارمزد رایگان' : 'Anti-Fraud Fee Credit Referrals'}</span>
                </p>
                <ul className="space-y-1 text-sub list-disc ps-4">
                  <li>{isFa ? 'با دعوت دوستان واقعی، +۲ دلار اعتبار کارمزد ۵٪ برای شما و +۱ دلار برای دوستتان ثبت می‌شود.' : 'Earn +$2 fee credit (+$1 for your friend) when they start live trading.'}</li>
                  <li>{isFa ? 'پاداش رفرال نقدی و قابل برداشت نیست؛ فقط برای پرداخت کارمزد ۵٪ سود استفاده می‌شود.' : 'Strictly non-withdrawable—usable solely for your 5% profit fees.'}</li>
                  <li>{isFa ? 'آزادسازی مشروط به ≥۱۰$ موجودی واقعی و ترید واقعی است.' : 'Unlocks only after >= $10 real balance + real trade.'}</li>
                </ul>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="rounded-2xl p-4 surface-soft border hairline space-y-2 text-xs">
              <div className="flex items-center gap-2 font-black text-main">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>{isFa ? 'تنظیمات انتخابی شما آماده است:' : 'Your chosen setup is ready:'}</span>
              </div>
              <p className="text-sub">
                • {isFa ? 'حالت حساب:' : 'Account:'}{' '}
                <strong className="text-main">{tradingMode === 'LIVE' ? (isFa ? 'کیف‌پول واقعی Trust Wallet (حداقل ۱۰ دلار)' : 'Real Trust Wallet ($10+ min)') : (isFa ? 'شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری رایگان' : 'Free $10,000 Demo Simulator')}</strong>
              </p>
              <p className="text-sub">
                • {isFa ? 'روش اجرا:' : 'Execution:'}{' '}
                <strong className="text-main">{execMode === 'AUTO' ? (isFa ? 'تمام‌اتوترید خودکار ۲۴/۷' : 'Full 24/7 Auto-Pilot') : (isFa ? 'تایید دستی ۱-کلیکی' : 'Manual 1-Click Confirm')}</strong>
              </p>
              <p className="text-sub">
                • {isFa ? 'هزینه اشتراک:' : 'Subscription Fee:'}{' '}
                <strong className="text-[#10B981]">{isFa ? 'صفر تومان (رایگان) — ۹۵٪ سود برای شما (کارمزد ۵٪ فقط از سود واقعی)' : '$0 (Free) — Keep 95% of Real Profits (5% Fee)'}</strong>
              </p>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSavePreferencesAndFinish(false)}
                className="px-4 py-2.5 rounded-xl surface-soft border hairline text-xs font-bold text-main"
              >
                {isFa ? 'ذخیره تنظیمات' : 'Save Setup'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSavePreferencesAndFinish(true)}
                className="px-5 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black inline-flex items-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>{busy ? '...' : isFa ? 'ذخیره و شروع ربات!' : 'Save & Launch Bot!'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
