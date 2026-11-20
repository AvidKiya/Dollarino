import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Gift,
  Image,
  KeyRound,
  Link2,
  LogOut,
  Moon,
  Radar,
  Send,
  Shield,
  Sparkles,
  Sun,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import type { LookId } from '../components/AppearanceModal';
import type { UiMode } from '../components/Layout';

export function ServicesPage({
  lang,
  uiMode,
  onToggleUiMode,
  currentLook,
  onToggleDaylight,
  user,
  data,
  onNavigate,
  onLogout,
}: {
  lang: Lang;
  uiMode: UiMode;
  onToggleUiMode: (mode: UiMode) => void;
  currentLook: LookId;
  onToggleDaylight: () => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  onNavigate: (tab: NavTab) => void;
  onLogout: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const Arrow = isFa ? ChevronLeft : ChevronRight;
  const BackArrow = isFa ? ArrowRight : ArrowLeft;
  const isTelegramPseudo = user.email.endsWith('@telegram.dollarino.local');
  const [accountView, setAccountView] = useState(false);
  const [mergeCode, setMergeCode] = useState('');
  const [linkCmd, setLinkCmd] = useState('');
  const [deepLinkUrl, setDeepLinkUrl] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const handleGenerateLinkCode = async () => {
    setLinkBusy(true);
    setLinkStatus('');
    try {
      const r = await apiFetch<{ code: string; command: string; deepLinkUrl?: string }>('/api/auth/telegram-link-code', { method: 'POST' });
      setLinkCmd(r.command);
      setDeepLinkUrl(r.deepLinkUrl || `https://t.me/Dollarino_bot?start=${r.code}`);
      setLinkStatus(isFa ? `کد اتصال ساخته شد: ${r.code} (روی دکمه باز کردن ربات بزنید تا خودکار متصل شود)` : `Code created: ${r.code}`);
    } catch (e) {
      setLinkStatus(e instanceof Error ? e.message : 'Error');
    } finally {
      setLinkBusy(false);
    }
  };

  const handleMergeTelegramToWeb = async () => {
    if (!mergeCode.trim()) return;
    setLinkBusy(true);
    setLinkStatus('');
    try {
      const res = await apiFetch<{ ok: boolean; token: string; user: AuthUserInfo }>('/api/auth/telegram/merge-code', {
        method: 'POST',
        body: JSON.stringify({ code: mergeCode.trim() }),
      });
      if (res.token) setStoredToken(res.token);
      setLinkStatus(isFa ? 'حساب مینی‌اپ با موفقیت به اکانت وب متصل شد! صفحه در حال همگام‌سازی...' : 'Account merged! Reloading...');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setLinkStatus(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setLinkBusy(false);
    }
  };

  const activePlanLabel = data.entitlement?.hasPaidPlan
    ? isFa
      ? data.entitlement.planNameFa
      : data.entitlement.planNameEn
    : isFa
      ? 'نسخه رایگان ($۱۰K دمو)'
      : 'Free Paper ($10K)';

  /* Dedicated Account Details Sub-View matching Screenshot 5 (image-5.jpeg) */
  if (accountView) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAccountView(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl panel text-xs font-black text-main hover:bg-[var(--soft)] transition"
          >
            <BackArrow className="w-4 h-4" />
            <span>{isFa ? 'بازگشت به سرویس‌ها' : 'Back to Services'}</span>
          </button>
          <span className="text-xs font-extrabold text-dim">{isFa ? 'حساب کاربری و امنیت' : 'Account & Security'}</span>
        </div>

        {/* Centered Verified Profile Hero Card matching Screenshot 5 */}
        <div className="panel rounded-[28px] p-6 text-center space-y-3">
          <div className="relative inline-flex mx-auto">
            <div className="w-20 h-20 rounded-full p-1 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6]">
              <div className="w-full h-full rounded-full bg-[var(--panel)] grid place-items-center font-display font-black text-2xl text-[#1652F0]">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
            </div>
            <span className="absolute -bottom-0.5 -end-0.5 w-6 h-6 rounded-full bg-[#0D9455] text-white grid place-items-center border-2 border-[var(--panel)]">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <h2 className="font-display font-bold text-lg text-main">{user.username}</h2>
            <p className="text-xs text-dim mt-0.5">{user.email}</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="px-3 py-1 rounded-full bg-[#0D9455]/12 text-[#0D9455] text-[11px] font-black">
              {activePlanLabel}
            </span>
            {user.telegram_id && (
              <span className="px-3 py-1 rounded-full bg-[#1652F0]/10 text-[#1652F0] text-[11px] font-black">
                {isFa ? 'متصل به تلگرام' : 'Telegram Synced'}
              </span>
            )}
          </div>
        </div>

        {/* Clean Key-Value Account Rows matching Screenshot 5 */}
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          {[
            { lbl: isFa ? 'نام کاربری' : 'Username', val: user.username },
            { lbl: isFa ? 'ایمیل حساب' : 'Email', val: user.email },
            { lbl: isFa ? 'اشتراک فعال' : 'Active Plan', val: activePlanLabel },
            {
              lbl: isFa ? 'صرافی متصل' : 'Exchange Vault',
              val: data.activeExchange?.provider
                ? data.activeExchange.provider.toUpperCase()
                : isFa
                  ? 'حالت دمو ($۱۰,۰۰۰)'
                  : 'Paper Demo ($10K)',
            },
          ].map((row) => (
            <div key={row.lbl} className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-dim">{row.lbl}</span>
              <span dir="ltr" className="font-extrabold text-main truncate max-w-[60%]">
                {row.val}
              </span>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onNavigate('copy')}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
          >
            <span className="inline-flex items-center gap-2 font-bold text-main">
              <KeyRound className="w-4 h-4 text-[#1652F0]" />
              <span>{isFa ? 'مدیریت کلید API صرافی‌ها (Toobit / KCEX)' : 'Manage Exchange API Keys'}</span>
            </span>
            <Arrow className="w-4 h-4 text-dim" />
          </button>
        </div>

        {/* Telegram Mini App <-> Web Account Sync Card */}
        <div className="panel rounded-[26px] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#1652F0]" />
              <span className="text-xs font-black text-main">
                {isFa ? 'اتصال همگام حساب وب و مینی‌اپ تلگرام' : 'Sync Web & Telegram Mini App Account'}
              </span>
            </div>
            {user.telegram_id && !isTelegramPseudo && (
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                {isFa ? 'متصل به تلگرام' : 'Telegram Linked'}
              </span>
            )}
          </div>

          {isTelegramPseudo ? (
            <div className="space-y-2">
              <p className="text-[11px] text-sub leading-relaxed">
                {isFa
                  ? 'شما با اکانت تلگرام وارد مینی‌اپ شده‌اید. اگر از قبل در سایت دلارینو اکانت وب ساخته‌اید، کد اتصال (LINK-...) را از پنل وب گرفته و این‌جا وارد کنید:'
                  : 'Opened via Telegram. Paste your web account LINK code below to merge both accounts:'}
              </p>
              <div className="flex gap-2">
                <input
                  value={mergeCode}
                  onChange={(e) => setMergeCode(e.target.value.toUpperCase())}
                  placeholder="LINK-ABC123"
                  dir="ltr"
                  className="field text-xs font-mono-num flex-1"
                />
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void handleMergeTelegramToWeb()}
                  className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black shrink-0"
                >
                  {linkBusy ? '...' : isFa ? 'اتصال به وب' : 'Link Web'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-sub leading-relaxed">
                {isFa
                  ? 'برای اتصال ربات و مینی‌اپ تلگرام به همین اکانت وب (انتقال خودکار اشتراک و صرافی)، روی دکمه زیر بزنید:'
                  : 'Generate a one-time deep link and tap to connect @Dollarino_bot automatically:'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void handleGenerateLinkCode()}
                  className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{linkBusy ? '...' : isFa ? 'اتصال ۱-کلیکی به @Dollarino_bot' : '1-Click Connect @Dollarino_bot'}</span>
                </button>
                {deepLinkUrl && (
                  <a
                    href={deepLinkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-emerald px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isFa ? 'باز کردن تلگرام و اتصال خودکار' : 'Open Telegram & Auto-Link'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {linkCmd && (
                  <code dir="ltr" className="px-3 py-1.5 rounded-xl surface-soft font-mono-num text-xs font-black text-jade">
                    {linkCmd}
                  </code>
                )}
              </div>
            </div>
          )}
          {linkStatus && <p className="text-[11px] font-bold text-jade">{linkStatus}</p>}
        </div>

        {/* Display Preferences */}
        <div className="panel rounded-[26px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-main">{isFa ? 'ظاهر صفحه' : 'Appearance'}</span>
            <button
              type="button"
              onClick={onToggleDaylight}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-soft text-xs font-bold text-main"
            >
              {currentLook === 'paper' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#1652F0]" />
                  <span>{isFa ? 'حالت شب' : 'Night'}</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>{isFa ? 'حالت روز' : 'Day'}</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2 border-t hairline">
            <span className="text-xs font-bold text-main">{isFa ? 'سطح محیط کاربری' : 'Interface Level'}</span>
            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => onToggleUiMode('simple')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${uiMode === 'simple' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'ساده' : 'Easy'}
              </button>
              <button
                type="button"
                onClick={() => onToggleUiMode('pro')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${uiMode === 'pro' ? 'ios-pill-active' : 'text-dim'}`}
              >
                {isFa ? 'حرفه‌ای' : 'Pro'}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="w-full panel rounded-[22px] py-3.5 px-5 flex items-center justify-center gap-2 text-xs font-black text-loss hover:bg-rose-500/10 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{isFa ? 'خروج از حساب کاربری' : 'Sign Out'}</span>
        </button>
      </div>
    );
  }

  /* Main Services Hub matching Screenshot 7 (image-7.jpeg) */
  const doubleRingShortcuts: Array<{
    tab: NavTab;
    title: string;
    icon: typeof Bot;
    ring: string;
    color: string;
  }> = [
    {
      tab: 'terminal',
      title: isFa ? 'معامله سریع' : 'Easy Trade',
      icon: Zap,
      ring: 'from-[#1652F0]/25 to-[#3B82F6]/10',
      color: '#1652F0',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار AI' : 'AI Radar',
      icon: Radar,
      ring: 'from-[#0D9455]/25 to-[#10B981]/10',
      color: '#0D9455',
    },
    {
      tab: 'copy',
      title: isFa ? 'کپی‌ترید و API' : 'Copy & API',
      icon: Users,
      ring: 'from-[#0EA5E9]/25 to-[#38BDF8]/10',
      color: '#0EA5E9',
    },
    {
      tab: 'pricing',
      title: isFa ? 'کد هدیه' : 'Gift & Plan',
      icon: Gift,
      ring: 'from-[#F59E0B]/25 to-[#FBBF24]/10',
      color: '#D97706',
    },
  ];

  const tradingServices: Array<{
    tab: NavTab;
    title: string;
    subtitle: string;
    icon: typeof Bot;
    badge?: string;
  }> = [
    {
      tab: 'overview',
      title: isFa ? 'ربات معامله‌گر هوشمند ۲۴/۷' : '24/7 Autonomous AI Bot',
      subtitle: isFa ? 'اسکن کل بازار با استاپ، تریلینگ و TP1-TP3 خودکار' : 'Automated TP1-TP3, breakeven & AI filtering',
      icon: Bot,
      badge: data.config.bot_state.startsWith('RUNNING') ? (isFa ? 'روشن' : 'LIVE') : isFa ? 'آماده' : 'READY',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار شکار فرصت و IDE کاستوم' : 'Market Radar & Strategy IDE',
      subtitle: isFa ? 'اسکن ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی و ادیتور Pine/Python' : '807 pairs radar, 900-candle backtest & Pine/Py IDE',
      icon: Sparkles,
    },
    {
      tab: 'copy',
      title: isFa ? 'اتصال Toobit / KCEX و کپی‌ترید' : 'Toobit / KCEX API & Copy Trade',
      subtitle: isFa ? 'اتصال امن AES-256 بدون دسترسی برداشت' : 'AES-256 trade-only exchange vault',
      icon: Users,
    },
    {
      tab: 'card',
      title: isFa ? 'کارت سود هفتگی تاییدشده' : 'Verified Profit Card',
      subtitle: isFa ? 'ساخت کارت عملکرد تاییدشده با امضای دیجیتال سرور' : 'Generate HMAC signed profit share card',
      icon: Image,
    },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* 1. Compact Profile Pill Card matching Screenshot 7 (click opens Screenshot 5 Account View!) */}
      <button
        type="button"
        onClick={() => setAccountView(true)}
        className="w-full panel panel-hover rounded-[22px] p-3.5 flex items-center justify-between gap-3 text-start"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6] shrink-0">
            <div className="w-full h-full rounded-full bg-[var(--panel)] grid place-items-center font-display font-black text-sm text-[#1652F0]">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display font-bold text-sm text-main truncate">{user.username}</h2>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9455] shrink-0" />
            </div>
            <p className="text-[11px] text-dim truncate">{activePlanLabel} · {isFa ? 'مشاهده و تنظیمات حساب' : 'Account Details'}</p>
          </div>
        </div>
        <Arrow className="w-4 h-4 text-dim shrink-0" />
      </button>

      {/* 2. Screenshot 7 Horizontal Circular Double-Ring Shortcuts */}
      <div className="grid grid-cols-4 gap-2 text-center py-1">
        {doubleRingShortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className={`w-14 h-14 rounded-full p-1 bg-gradient-to-tr ${item.ring} transition group-hover:scale-105`}>
                <span className="w-full h-full rounded-full panel grid place-items-center">
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </span>
              </span>
              <span className="text-[11px] font-extrabold text-main leading-tight">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Screenshot 7 Gradient Banner — 1-Click @Dollarino_bot & Referral */}
      <div
        className="rounded-[24px] p-4 sm:p-5 text-white relative overflow-hidden shadow-md flex flex-wrap items-center justify-between gap-3"
        style={{ background: 'linear-gradient(125deg, #1652F0 0%, #3B82F6 100%)' }}
      >
        <div className="pointer-events-none absolute -end-8 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
        <div className="relative z-10 space-y-1 max-w-sm">
          <p className="text-xs sm:text-sm font-black">
            {isFa ? 'اتصال ۱-کلیکی به ربات تلگرام دلارینو' : '1-Click @Dollarino_bot Telegram Sync'}
          </p>
          <p className="text-[11px] text-white/85">
            {isFa
              ? 'اشتراک و سابقه خود را فوری به @Dollarino_bot وصل کنید و با دعوت دوستان ۷ روز اشتراک هدیه بگیرید.'
              : 'Sync trades to @Dollarino_bot and earn 7 free days per friend.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAccountView(true)}
          className="relative z-10 px-4 py-2 rounded-xl bg-white text-[#1652F0] text-xs font-black shadow-sm hover:bg-white/95 transition"
        >
          {isFa ? 'اتصال و همگام‌سازی' : 'Connect Now'}
        </button>
      </div>

      {/* 4. Screenshot 7 Grouped White Service Cards */}
      <div className="space-y-2">
        <p className="text-xs font-black text-dim px-1">{isFa ? 'سرویس‌های معامله و هوش مصنوعی' : 'Trading & AI Services'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          {tradingServices.map((srv) => {
            const Icon = srv.icon;
            return (
              <button
                key={srv.tab}
                type="button"
                onClick={() => onNavigate(srv.tab)}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
              >
                <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/10 text-[#1652F0] grid place-items-center shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-main truncate">{srv.title}</span>
                    {srv.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#0D9455]/12 text-[#0D9455]">
                        {srv.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-dim mt-0.5 line-clamp-1">{srv.subtitle}</p>
                </div>
                <Arrow className="w-4 h-4 text-dim shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black text-dim px-1">{isFa ? 'حساب، اشتراک و پشتیبانی' : 'Account, Plans & Support'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          <button
            type="button"
            onClick={() => setAccountView(true)}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/10 text-[#1652F0] grid place-items-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'مشخصات حساب و اتصال تلگرام' : 'Account Info & Telegram Link'}</span>
              <span className="text-[11px] text-dim block">{isFa ? 'کد اتصال وب و تلگرام · نمایش شب/روز · سطح ساده/حرفه‌ای' : 'Web/TG link · Day/Night · Easy/Pro'}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/12 text-[#D97706] grid place-items-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'اشتراک، کد هدیه و دعوت دوستان' : 'Plans, Gift Codes & Referrals'}</span>
              <span className="text-[11px] text-dim block">{activePlanLabel}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('faq')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#0D9455]/10 text-[#0D9455] grid place-items-center shrink-0">
              <CircleHelp className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'راهنمای کامل و امنیت حساب' : 'User Guide & Security'}</span>
              <span className="text-[11px] text-dim block">{isFa ? 'آموزش گام‌به‌گام و پشتیبانی' : 'Step-by-step guide & help'}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
            >
              <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B] grid place-items-center shrink-0">
                <Shield className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'پنل مدیریت کل دلارینو' : 'Super Admin Console'}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#F59E0B]/15 text-[#D97706]">
                    {user.role.toUpperCase()}
                  </span>
                </div>
                <span className="text-[11px] text-dim block">{isFa ? 'کاربران، اشتراک‌ها، کدهای هدیه و AI' : 'Users, plans, gift codes & AI'}</span>
              </div>
              <Arrow className="w-4 h-4 text-dim shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Quick Theme / Mode Strip + Logout */}
      <div className="panel rounded-[22px] p-3.5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggleDaylight}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-soft text-xs font-bold text-main"
        >
          {currentLook === 'paper' ? (
            <>
              <Moon className="w-4 h-4 text-[#1652F0]" />
              <span>{isFa ? 'حالت شب' : 'Night'}</span>
            </>
          ) : (
            <>
              <Sun className="w-4 h-4 text-[#F59E0B]" />
              <span>{isFa ? 'حالت روز' : 'Day'}</span>
            </>
          )}
        </button>

        <div className="ios-segmented">
          <button
            type="button"
            onClick={() => onToggleUiMode('simple')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${uiMode === 'simple' ? 'ios-pill-active' : 'text-dim'}`}
          >
            {isFa ? 'ساده' : 'Easy'}
          </button>
          <button
            type="button"
            onClick={() => onToggleUiMode('pro')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${uiMode === 'pro' ? 'ios-pill-active' : 'text-dim'}`}
          >
            {isFa ? 'حرفه‌ای' : 'Pro'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-loss hover:bg-rose-500/10 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{isFa ? 'خروج' : 'Logout'}</span>
        </button>
      </div>
    </div>
  );
}
