import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Gift,
  Headphones,
  Image,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  Moon,
  Radar,
  Send,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  User,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import type { LookId } from '../components/AppearanceModal';
import type { UiMode } from '../components/Layout';

async function compressImageToAvatarDataUrl(file: File): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image file'));
      el.src = bitmapUrl;
    });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function ServicesPage({
  lang,
  uiMode,
  onToggleUiMode,
  currentLook,
  onToggleDaylight,
  user,
  data,
  onNavigate,
  onUpdateUser,
  onOpenSupport,
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
  onUpdateUser?: (next: AuthUserInfo) => void;
  onOpenSupport?: () => void;
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState('');

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const dataUrl = await compressImageToAvatarDataUrl(file);
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل با موفقیت ذخیره شد' : 'Profile photo updated');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : isFa ? 'خطا در آپلود تصویر' : 'Upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل حذف شد' : 'Profile photo removed');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : 'Error');
    } finally {
      setAvatarBusy(false);
    }
  };

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
      ? 'بدون اشتراک فعال (نیازمند خرید اشتراک)'
      : 'No Active Plan (Subscription Required)';

  /* Dedicated Account Management View matching image-2.png + Real Profile Photo Upload */
  if (accountView) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarSelected}
          className="hidden"
        />

        {/* Header matching image-2.png */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAccountView(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl panel text-xs font-black text-main hover:bg-[var(--soft)] transition"
          >
            <BackArrow className="w-4 h-4" />
            <span>{isFa ? 'مدیریت حساب' : 'Account'}</span>
          </button>
          <span className="text-[11px] font-bold text-dim">{isFa ? 'حساب کاربری دلارینو' : 'Dollarino Profile'}</span>
        </div>

        {/* Centered Profile Photo Upload Avatar matching image-2.png */}
        <div className="pt-2 pb-1 text-center space-y-2.5">
          <div className="relative inline-flex mx-auto">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6] shadow-md group relative overflow-visible"
              title={isFa ? 'تغییر عکس پروفایل' : 'Change profile photo'}
            >
              <div className="w-full h-full rounded-full bg-[var(--panel)] overflow-hidden grid place-items-center font-display font-black text-3xl text-[#1652F0]">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white text-slate-800 shadow-md grid place-items-center border border-slate-200 group-hover:scale-110 transition">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <span className="absolute top-0 end-0 w-6 h-6 rounded-full bg-[#0D9455] text-white grid place-items-center border-2 border-[var(--bg)] shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <h2 className="font-display font-bold text-lg text-main">{user.username}</h2>
            <p className="text-xs text-dim mt-0.5">{user.email}</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-full panel text-[11px] font-bold text-[#1652F0] inline-flex items-center gap-1.5 hover:bg-[var(--soft)] transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{avatarBusy ? '...' : isFa ? 'تغییر تصویر پروفایل' : 'Upload Photo'}</span>
            </button>
            {user.avatar_url && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void handleRemoveAvatar()}
                className="px-3 py-1.5 rounded-full panel text-[11px] font-bold text-loss inline-flex items-center gap-1 hover:bg-rose-500/10 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFa ? 'حذف' : 'Remove'}</span>
              </button>
            )}
          </div>
          {avatarStatus && <p className="text-[11px] font-bold text-jade">{avatarStatus}</p>}
        </div>

        {/* Section 1: اطلاعات حساب matching image-2.png */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'اطلاعات حساب' : 'Account Details'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <User className="w-4 h-4 text-dim" />
                <span>{isFa ? 'نام کاربری' : 'Username'}</span>
              </span>
              <span className="font-extrabold text-sub">{user.username}</span>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Mail className="w-4 h-4 text-dim" />
                <span>{isFa ? 'ایمیل' : 'Email'}</span>
              </span>
              <span dir="ltr" className="font-extrabold text-sub truncate max-w-[58%]">{user.email}</span>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <UserCheck className="w-4 h-4 text-dim" />
                <span>{isFa ? 'وضعیت اشتراک' : 'Plan Status'}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-[#0D9455]/12 text-[#0D9455] text-[11px] font-black">
                {activePlanLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: حساب کاربری دلارینو matching image-2.png */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'حساب کاربری دلارینو' : 'Dollarino Settings'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('copy')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
            >
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <KeyRound className="w-4 h-4 text-dim" />
                <span>{isFa ? 'اتصال صرافی‌ها (Toobit / KCEX)' : 'Exchange API Vault'}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-dim font-bold">
                  {data.activeExchange?.provider?.toUpperCase() || 'PAPER'}
                </span>
                <Arrow className="w-4 h-4 text-dim" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
            >
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Users className="w-4 h-4 text-dim" />
                <span>{isFa ? 'زیرمجموعه‌ها و اشتراک (+۷ روز هدیه)' : 'Referrals & Plans'}</span>
              </span>
              <Arrow className="w-4 h-4 text-dim" />
            </button>
          </div>
        </div>

        {/* Telegram Mini App <-> Web Account Sync Card */}
        <div className="panel rounded-[24px] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#1652F0]" />
              <span className="text-xs font-black text-main">
                {isFa ? (
                  <>
                    اتصال همگام حساب وب و <span dir="ltr" className="inline-block font-mono-num">@Dollarino_bot</span>
                  </>
                ) : (
                  'Sync Web & @Dollarino_bot'
                )}
              </span>
            </div>
            {user.telegram_id && !isTelegramPseudo && (
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                {isFa ? 'متصل به تلگرام' : 'Linked'}
              </span>
            )}
          </div>

          {isTelegramPseudo ? (
            <div className="space-y-2">
              <p className="text-[11px] text-sub leading-relaxed">
                {isFa
                  ? 'اگر از قبل اکانت وب دارید، کد اتصال (LINK-...) را این‌جا وارد کنید تا اشتراک و سابقه یکی شود:'
                  : 'Paste your web account LINK code below to merge both accounts:'}
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => void handleGenerateLinkCode()}
                className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>
                  {linkBusy ? (
                    '...'
                  ) : isFa ? (
                    <>
                      اتصال ۱-کلیکی به <span dir="ltr" className="inline-block font-mono-num">@Dollarino_bot</span>
                    </>
                  ) : (
                    '1-Click Connect'
                  )}
                </span>
              </button>
              {deepLinkUrl && (
                <a
                  href={deepLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-emerald px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'باز کردن تلگرام' : 'Open Telegram'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {linkCmd && (
                <code dir="ltr" className="px-3 py-1.5 rounded-xl surface-soft font-mono-num text-xs font-black text-jade">
                  {linkCmd}
                </code>
              )}
            </div>
          )}
          {linkStatus && <p className="text-[11px] font-bold text-jade">{linkStatus}</p>}
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

  /* Main Services Hub matching image-6.png */
  const doubleRingShortcuts: Array<{
    tab: NavTab;
    title: string;
    icon: typeof Bot;
    bg: string;
    color: string;
  }> = [
    {
      tab: 'myai',
      title: isFa ? 'هوش مصنوعی من' : 'My AI',
      icon: BrainCircuit,
      bg: 'from-[#1652F0] to-[#3B82F6]',
      color: '#FFFFFF',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار AI' : 'AI Radar',
      icon: Radar,
      bg: 'from-[#0EA5E9] to-[#2563EB]',
      color: '#FFFFFF',
    },
    {
      tab: 'copy',
      title: isFa ? 'کپی‌ترید و API' : 'Copy & API',
      icon: Users,
      bg: 'from-[#1D4ED8] to-[#60A5FA]',
      color: '#FFFFFF',
    },
    {
      tab: 'pricing',
      title: isFa ? 'اشتراک و هدیه' : 'Plans & Gift',
      icon: Gift,
      bg: 'from-[#F59E0B] to-[#FBBF24]',
      color: '#FFFFFF',
    },
  ];

  const featuredServices: Array<{
    tab: NavTab;
    title: string;
    subtitle: string;
    icon: typeof Bot;
    tileBg: string;
    tileColor: string;
    badge?: string;
  }> = [
    {
      tab: 'myai',
      title: isFa ? 'هوش مصنوعی من (قابل آموزش با چت)' : 'My Trainable AI Agent',
      subtitle: isFa ? 'با چت فارسی استراتژی خودت را به AI یاد بده، تست بگیر و ۲۴/۷ اجرا کن' : 'Teach your strategy via chat, test live & activate 24/7',
      icon: BrainCircuit,
      tileBg: 'bg-[#1652F0]/15',
      tileColor: 'text-[#1652F0]',
      badge: isFa ? 'جدید' : 'NEW',
    },
    {
      tab: 'overview',
      title: isFa ? 'ربات معامله‌گر هوشمند ۲۴/۷' : '24/7 Autonomous AI Bot',
      subtitle: isFa ? 'اسکن کل بازار با استاپ، تریلینگ و TP1-TP3 خودکار' : 'Automated TP1-TP3, breakeven & AI filtering',
      icon: Bot,
      tileBg: 'bg-[#F59E0B]/15',
      tileColor: 'text-[#D97706]',
      badge: data.config.bot_state.startsWith('RUNNING') ? (isFa ? 'روشن' : 'LIVE') : isFa ? 'آماده' : 'READY',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار شکار فرصت و IDE کاستوم' : 'Market Radar & Strategy IDE',
      subtitle: isFa ? 'اسکن ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی و ادیتور Pine/Python' : '807 pairs radar, 900-candle backtest & Pine/Py IDE',
      icon: Sparkles,
      tileBg: 'bg-slate-900/90 dark:bg-white/15',
      tileColor: 'text-white',
    },
    {
      tab: 'copy',
      title: isFa ? 'کپی‌ترید تاییدشده و صرافی Toobit / KCEX' : 'Verified Copy Trade & Exchanges',
      subtitle: isFa ? 'تریدرهای تاییدشده ادمین + اتصال امن صرافی AES-256' : 'Admin-verified Copy Traders & AES-256 exchange vault',
      icon: Users,
      tileBg: 'bg-[#0EA5E9]/15',
      tileColor: 'text-[#0284C7]',
    },
    {
      tab: 'card',
      title: isFa ? 'کارت سود هفتگی تاییدشده' : 'Verified Profit Card',
      subtitle: isFa ? 'ساخت کارت عملکرد تاییدشده با امضای دیجیتال سرور' : 'Generate HMAC signed profit share card',
      icon: Image,
      tileBg: 'bg-[#10B981]/15',
      tileColor: 'text-[#0D9455]',
    },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* 1. Kifpool image-6.png Compact Top Profile Card with Inline Action Circles */}
      <div className="panel rounded-[22px] p-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAccountView(true)}
          className="flex items-center gap-3 min-w-0 text-start group"
        >
          <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6] shrink-0">
            <div className="w-full h-full rounded-full bg-[var(--panel)] overflow-hidden grid place-items-center font-display font-black text-sm text-[#1652F0]">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display font-bold text-sm text-main truncate group-hover:text-[#1652F0] transition">
                {user.username}
              </h2>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9455] shrink-0" />
            </div>
            <p className="text-[11px] text-dim truncate">{activePlanLabel}</p>
          </div>
        </button>

        {/* 3 Circular Inline Controls matching image-6.png */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleUiMode(uiMode === 'simple' ? 'pro' : 'simple')}
            title={isFa ? 'تغییر سطح کاربری (ساده / حرفه‌ای)' : 'Toggle Easy / Pro'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-xs font-black text-main hover:bg-[var(--line)] transition"
          >
            {uiMode === 'simple' ? <Sprout className="w-4 h-4 text-[#0D9455]" /> : <Zap className="w-4 h-4 text-[#1652F0]" />}
          </button>
          <button
            type="button"
            onClick={onToggleDaylight}
            title={isFa ? 'تغییر تم روز / شب' : 'Toggle Day / Night'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-[#F59E0B] hover:bg-[var(--line)] transition"
          >
            {currentLook === 'paper' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setAccountView(true)}
            title={isFa ? 'مدیریت حساب و عکس پروفایل' : 'Account & Photo'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-main hover:bg-[var(--line)] transition"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Kifpool image-6.png Double-Ring Glossy Circular Shortcuts */}
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
              <span className="w-14 h-14 rounded-full p-1 border-2 border-[#1652F0]/25 bg-[var(--panel)] shadow-xs transition group-hover:scale-105">
                <span className={`w-full h-full rounded-full bg-gradient-to-tr ${item.bg} grid place-items-center shadow-inner`}>
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </span>
              </span>
              <span className="text-[11px] font-extrabold text-main leading-tight">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Studio Generated Banner Card matching image-6.png */}
      <div className="rounded-[24px] relative overflow-hidden border hairline shadow-sm min-h-[124px] flex items-center bg-[#F3F5F8] dark:bg-slate-900">
        <img
          src="/assets/banner-radar-studio.webp"
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none select-none opacity-95 dark:opacity-45 ${
            isFa ? '-scale-x-100 object-right' : 'object-right'
          }`}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              currentLook === 'paper'
                ? isFa
                  ? 'linear-gradient(90deg, rgba(243,245,248,0.02) 0%, rgba(243,245,248,0.78) 46%, rgba(243,245,248,0.97) 100%)'
                  : 'linear-gradient(270deg, rgba(243,245,248,0.02) 0%, rgba(243,245,248,0.78) 46%, rgba(243,245,248,0.97) 100%)'
                : isFa
                  ? 'linear-gradient(90deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.82) 48%, rgba(15,23,42,0.96) 100%)'
                  : 'linear-gradient(270deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.82) 48%, rgba(15,23,42,0.96) 100%)',
          }}
        />
        <div className="relative z-10 w-full px-5 py-4 flex items-center justify-between gap-3">
          <div className="space-y-1.5 max-w-[66%]">
            <p className={`text-xs sm:text-sm font-black ${currentLook === 'paper' ? 'text-slate-900' : 'text-white'}`}>
              {isFa ? 'رادار هوشمند و استراتژی کاستوم دلارینو' : 'Dollarino Smart Radar & Pine/Py IDE'}
            </p>
            <p className={`text-[11px] leading-relaxed ${currentLook === 'paper' ? 'text-slate-600' : 'text-slate-300'}`}>
              {isFa ? (
                <>
                  اسکن زنده ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی و اتصال ۱-کلیکی به{' '}
                  <span dir="ltr" className="font-bold">@Dollarino_bot</span>
                </>
              ) : (
                '807-pair live scanner, 900-candle backtest & @Dollarino_bot sync'
              )}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('radar')}
              className="mt-1 px-3.5 py-1.5 rounded-full bg-[#1652F0] hover:bg-[#0D3CC4] text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition"
            >
              <span>{isFa ? 'شروع تحلیل و معامله' : 'Open Radar Lab'}</span>
              <Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Kifpool image-6.png Grouped White Service Cards */}
      <div className="space-y-2">
        <p className="text-xs font-black text-dim px-1">{isFa ? 'سرویس‌های ویژه دلارینو' : 'Featured Services'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          {featuredServices.map((srv) => {
            const Icon = srv.icon;
            return (
              <button
                key={srv.tab}
                type="button"
                onClick={() => onNavigate(srv.tab)}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
              >
                <span className={`w-10 h-10 rounded-2xl ${srv.tileBg} ${srv.tileColor} grid place-items-center shrink-0`}>
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
        <p className="text-xs font-black text-dim px-1">{isFa ? 'مدیریت حساب، اشتراک و پشتیبانی' : 'Account, Plans & Support'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          <button
            type="button"
            onClick={() => setAccountView(true)}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/12 text-[#1652F0] grid place-items-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'مدیریت حساب، عکس پروفایل و اتصال تلگرام' : 'Profile Photo, Account & Telegram Link'}</span>
              <span className="text-[11px] text-dim block">
                {isFa ? (
                  <>
                    آپلود عکس پروفایل و اتصال ۱-کلیکی به <span dir="ltr" className="inline-block font-mono-num">@Dollarino_bot</span>
                  </>
                ) : (
                  'Upload avatar & sync @Dollarino_bot'
                )}
              </span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 text-[#D97706] grid place-items-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'اشتراک، کد هدیه و دعوت دوستان' : 'Plans, Gift Codes & Referrals'}</span>
              <span className="text-[11px] text-dim block">{activePlanLabel}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
            >
              <span className="w-10 h-10 rounded-2xl bg-[#10B981]/15 text-[#0D9455] grid place-items-center shrink-0">
                <Headphones className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'پشتیبانی آنلاین و چت با ادمین' : 'Online Support & Live Admin Chat'}</span>
                <span className="text-[11px] text-dim block">{isFa ? 'ارسال پیام فوری همگام با تلگرام پشتیبانی' : 'Direct chat synced with Telegram support'}</span>
              </div>
              <Arrow className="w-4 h-4 text-dim shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('faq')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#0D9455]/12 text-[#0D9455] grid place-items-center shrink-0">
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
