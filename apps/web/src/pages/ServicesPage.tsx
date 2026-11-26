import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Crosshair,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Headphones,
  Image,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Moon,
  Phone,
  Radar,
  RefreshCw,
  Save,
  Send,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  User,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
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
  onRefresh,
  onOpenSupport,
  onLogout,
}: {
  lang: Lang;
  uiMode: UiMode;
  onToggleUiMode?: (mode: UiMode) => void;
  currentLook: LookId;
  onToggleDaylight: () => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  onNavigate: (tab: NavTab) => void;
  onUpdateUser?: (next: AuthUserInfo) => void;
  onRefresh?: () => Promise<void>;
  onOpenSupport?: () => void;
  onLogout: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const Arrow = isFa ? ChevronLeft : ChevronRight;
  const BackArrow = isFa ? ArrowRight : ArrowLeft;
  const isTelegramPseudo = user.email.endsWith('@telegram.dollarino.local');
  const [accountView, setAccountView] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState('');

  const [editUsername, setEditUsername] = useState(user.username || '');
  const [editEmail, setEditEmail] = useState(isTelegramPseudo ? '' : user.email || '');
  const [editBio, setEditBio] = useState(user.display_bio || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [totpEnabled, setTotpEnabled] = useState(Boolean(user.totp_enabled));
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUri: string; qrDataUrl: string } | null>(null);
  const [totpInputCode, setTotpInputCode] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [publicTgMeta, setPublicTgMeta] = useState<{
    botUsername: string;
    officialChannel: string;
    officialChannelInvite: string;
    signalsChannel: string;
    signalsChannelInvite: string;
    resultsChannel: string;
    resultsChannelInvite: string;
    communityGroupInvite: string;
    newsChannel: string;
    newsChannelInvite: string;
  }>({
    botUsername: '',
    officialChannel: '',
    officialChannelInvite: '',
    signalsChannel: '',
    signalsChannelInvite: '',
    resultsChannel: '',
    resultsChannelInvite: '',
    communityGroupInvite: '',
    newsChannel: '',
    newsChannelInvite: '',
  });

  useEffect(() => {
    apiFetch<{
      telegramBotUsername?: string;
      officialChannel?: string;
      officialChannelInvite?: string;
      signalsChannel?: string;
      signalsChannelInvite?: string;
      resultsChannel?: string;
      resultsChannelInvite?: string;
      communityGroupInvite?: string;
      newsChannel?: string;
      newsChannelInvite?: string;
    }>('/api/auth/providers')
      .then((r) =>
        setPublicTgMeta({
          botUsername: (r.telegramBotUsername || '').replace(/^@/, ''),
          officialChannel: r.officialChannel || '',
          officialChannelInvite: r.officialChannelInvite || '',
          signalsChannel: r.signalsChannel || '',
          signalsChannelInvite: r.signalsChannelInvite || '',
          resultsChannel: r.resultsChannel || '',
          resultsChannelInvite: r.resultsChannelInvite || '',
          communityGroupInvite: r.communityGroupInvite || '',
          newsChannel: r.newsChannel || '',
          newsChannelInvite: r.newsChannelInvite || '',
        })
      )
      .catch(() => {});
  }, []);

  const parsedNotifPrefs = (() => {
    try {
      const p = data.config.notification_prefs_json ? JSON.parse(data.config.notification_prefs_json) : {};
      return {
        tradeOpen: Boolean(p.tradeOpen),
        tpSlHit: Boolean(p.tpSlHit),
        aiSignals: Boolean(p.aiSignals),
        whaleCopy: Boolean(p.whaleCopy),
        dailyDigest: Boolean(p.dailyDigest),
      };
    } catch {
      return { tradeOpen: false, tpSlHit: false, aiSignals: false, whaleCopy: false, dailyDigest: false };
    }
  })();

  const [prefCurrency, setPrefCurrency] = useState<'USD' | 'IRT'>(data.config.display_currency === 'IRT' ? 'IRT' : 'USD');
  const [prefNotifMaster, setPrefNotifMaster] = useState<boolean>(Boolean(data.config.notifications_enabled));
  const [prefNotifs, setPrefNotifs] = useState(parsedNotifPrefs);
  const [prefExecMode, setPrefExecMode] = useState<'AUTO' | 'MANUAL_CONFIRM'>(
    data.config.trade_execution_mode === 'AUTO' ? 'AUTO' : 'MANUAL_CONFIRM'
  );
  const [prefMarketType, setPrefMarketType] = useState<'FUTURES' | 'SPOT'>(
    data.config.market_type === 'SPOT' ? 'SPOT' : 'FUTURES'
  );
  const [prefDirection, setPrefDirection] = useState<'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'>(
    (data.config.direction_mode as 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY') || 'BOTH'
  );
  const [prefBlockWeekends, setPrefBlockWeekends] = useState<boolean>(Boolean(data.config.block_weekends));
  const [prefMacroBlackout, setPrefMacroBlackout] = useState<boolean>(Boolean(data.config.macro_blackout));
  const [prefPaperBalance, setPrefPaperBalance] = useState<string>(String(data.config.custom_paper_balance ?? 10000));
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setPrefCurrency(data.config.display_currency === 'IRT' ? 'IRT' : 'USD');
    setPrefNotifMaster(Boolean(data.config.notifications_enabled));
    setPrefExecMode(data.config.trade_execution_mode === 'AUTO' ? 'AUTO' : 'MANUAL_CONFIRM');
    setPrefMarketType(data.config.market_type === 'SPOT' ? 'SPOT' : 'FUTURES');
    setPrefDirection((data.config.direction_mode as 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY') || 'BOTH');
    setPrefBlockWeekends(Boolean(data.config.block_weekends));
    setPrefMacroBlackout(Boolean(data.config.macro_blackout));
    setPrefPaperBalance(String(data.config.custom_paper_balance ?? 10000));
    try {
      const p = data.config.notification_prefs_json ? JSON.parse(data.config.notification_prefs_json) : {};
      setPrefNotifs({
        tradeOpen: Boolean(p.tradeOpen),
        tpSlHit: Boolean(p.tpSlHit),
        aiSignals: Boolean(p.aiSignals),
        whaleCopy: Boolean(p.whaleCopy),
        dailyDigest: Boolean(p.dailyDigest),
      });
    } catch { /* ignore */ }
  }, [data.config]);

  const handleSaveUserPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsBusy(true);
    setPrefsMsg(null);
    try {
      const paperNum = Math.max(50, Math.min(10_000_000, Number(prefPaperBalance) || 10000));
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          display_currency: prefCurrency,
          notifications_enabled: prefNotifMaster ? 1 : 0,
          notification_prefs_json: JSON.stringify(prefNotifs),
          trade_execution_mode: prefExecMode,
          market_type: prefMarketType,
          direction_mode: prefMarketType === 'SPOT' && prefDirection === 'SHORT_ONLY' ? 'LONG_ONLY' : prefDirection,
          block_weekends: prefBlockWeekends ? 1 : 0,
          macro_blackout: prefMacroBlackout ? 1 : 0,
          custom_paper_balance: paperNum,
        }),
      });
      setPrefsMsg({
        ok: true,
        text: isFa ? 'تنظیمات کامل حساب، اعلانات و ربات ذخیره شد ✅' : 'Account, notifications & bot preferences saved ✅',
      });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setPrefsMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setPrefsBusy(false);
    }
  };

  useEffect(() => {
    setTotpEnabled(Boolean(user.totp_enabled));
  }, [user.totp_enabled]);

  useEffect(() => {
    if (!accountView) return;
    void apiFetch<{ enabled: boolean }>('/api/auth/2fa/status')
      .then((s) => setTotpEnabled(Boolean(s.enabled)))
      .catch(() => {});
  }, [accountView]);

  const handleStart2faSetup = async () => {
    setTotpBusy(true);
    setTotpMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; secret: string; otpauthUri: string }>('/api/auth/2fa/setup', {
        method: 'POST',
      });
      const qrDataUrl = await QRCode.toDataURL(res.otpauthUri, { width: 200, margin: 1 });
      setTotpSetup({ secret: res.secret, otpauthUri: res.otpauthUri, qrDataUrl });
      setTotpInputCode('');
    } catch (err) {
      setTotpMsg({ ok: false, text: err instanceof Error ? err.message : '2FA setup error' });
    } finally {
      setTotpBusy(false);
    }
  };

  const handleEnable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    setTotpMsg(null);
    try {
      await apiFetch<{ ok: boolean }>('/api/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: totpInputCode.trim(), clientTimestampMs: Date.now() }),
      });
      setTotpEnabled(true);
      setTotpSetup(null);
      setTotpInputCode('');
      if (onUpdateUser) onUpdateUser({ ...user, totp_enabled: 1 });
      setTotpMsg({
        ok: true,
        text: isFa ? 'تایید دوعاملی Google Authenticator با موفقیت فعال شد!' : 'Google Authenticator 2FA enabled!',
      });
    } catch (err) {
      setTotpMsg({ ok: false, text: err instanceof Error ? err.message : 'Verification failed' });
    } finally {
      setTotpBusy(false);
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    setTotpMsg(null);
    try {
      await apiFetch<{ ok: boolean }>('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: totpInputCode.trim(), clientTimestampMs: Date.now() }),
      });
      setTotpEnabled(false);
      setTotpInputCode('');
      if (onUpdateUser) onUpdateUser({ ...user, totp_enabled: 0 });
      setTotpMsg({
        ok: true,
        text: isFa ? 'تایید دوعاملی غیرفعال شد.' : '2FA disabled.',
      });
    } catch (err) {
      setTotpMsg({ ok: false, text: err instanceof Error ? err.message : 'Disable failed' });
    } finally {
      setTotpBusy(false);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    setEditUsername(user.username || '');
    setEditEmail(user.email.endsWith('@telegram.dollarino.local') ? '' : user.email || '');
    setEditBio(user.display_bio || '');
  }, [user.username, user.email, user.display_bio]);

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

  const handleUseTelegramAvatar = async () => {
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ useTelegramAvatar: true }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل تلگرام شما همگام‌سازی و جایگزین شد' : 'Synced with your Telegram profile photo');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : 'Error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfileDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const payload: { username?: string; email?: string; displayBio?: string | null } = {
        username: editUsername.trim(),
        displayBio: editBio.trim() || null,
      };
      const cleanEmail = editEmail.trim().toLowerCase();
      if (cleanEmail) payload.email = cleanEmail;

      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo; token?: string }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.token) setStoredToken(res.token);
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setProfileMsg({
        ok: true,
        text: isFa ? 'مشخصات حساب با موفقیت ذخیره و به‌روزرسانی شد.' : 'Profile details updated successfully.',
      });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : isFa ? 'خطا در ذخیره مشخصات' : 'Failed to save profile',
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ ok: false, text: isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد' : 'Password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: isFa ? 'تکرار رمز عبور مطابقت ندارد' : 'Passwords do not match' });
      return;
    }
    setPasswordBusy(true);
    try {
      const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: hasExistingPwd ? currentPassword : undefined,
          newPassword,
        }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({
        ok: true,
        text: isFa
          ? 'رمز عبور اختصاصی شما ذخیره شد. از این پس می‌توانید با ایمیل شخصی و همین رمز نیز وارد شوید.'
          : 'Password saved successfully.',
      });
    } catch (err) {
      setPasswordMsg({
        ok: false,
        text: err instanceof Error ? err.message : isFa ? 'خطا در تغییر رمز عبور' : 'Failed to update password',
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr(null);
    setDeleteSuccessMsg(null);
    const clean = deleteConfirmText.trim();
    if (clean.toUpperCase() !== 'DELETE' && clean !== 'حذف' && clean !== 'حذف حساب') {
      setDeleteErr(isFa ? 'لطفاً عبارت DELETE یا «حذف» را تایپ کنید.' : 'Please type DELETE to confirm.');
      return;
    }
    setDeleteBusy(true);
    try {
      const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
      const res = await apiFetch<{ ok: boolean; deleted?: boolean; resetAdminAccount?: boolean; message?: string }>('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({
          confirmText: clean,
          password: hasExistingPwd ? deletePassword : undefined,
        }),
      });
      if (res.resetAdminAccount) {
        setDeleteOpen(false);
        setDeleteConfirmText('');
        setDeletePassword('');
        setDeleteSuccessMsg(
          res.message ||
            (isFa
              ? 'تمام موجودی‌ها و سوابق حساب مدیریتی به ۰ بازنشانی شد و دسترسی مدیریت حفظ گردید.'
              : 'Admin account reset to fresh zero state while preserving admin privileges.')
        );
        if (onRefresh) await onRefresh();
        return;
      }
      setStoredToken(null);
      await onLogout();
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : isFa ? 'خطا در حذف حساب کاربری' : 'Failed to delete account');
    } finally {
      setDeleteBusy(false);
    }
  };

  const activePlanLabel = isAdmin
    ? isFa
      ? 'دسترسی کامل مدیریت · بدون کارمزد و محدودیت ∞'
      : 'Admin Full Access · 0% Fee & Unlimited ∞'
    : isFa
      ? '۳ معامله اول ۰٪ · ۹۷٪ سود برای شما (کارمزد ۳٪ فقط از سود واقعی)'
      : 'First 3 Live Wins 0% · 3% Fee Only on Net Profit';

  /* Dedicated Account Management View: Full Editable Profile with Locked Verified Phone */
  if (accountView) {
    const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarSelected}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAccountView(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl panel text-xs font-black text-main hover:bg-[var(--soft)] transition"
          >
            <BackArrow className="w-4 h-4" />
            <span>{isFa ? 'مدیریت حساب' : 'Account'}</span>
          </button>
          <span className="text-[11px] font-bold text-dim">{isFa ? 'پروفایل یکپارچه تلگرام و وب' : 'Synced Dollarino Profile'}</span>
        </div>

        {/* Centered Profile Photo Upload Avatar */}
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
            <p className="text-xs text-dim mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
              {user.telegram_username && (
                <>
                  <bdi dir="ltr" className="font-mono-num">@{user.telegram_username}</bdi>
                  <span>·</span>
                </>
              )}
              <bdi dir={isTelegramPseudo ? 'auto' : 'ltr'} className={isTelegramPseudo ? '' : 'font-mono-num'}>
                {isTelegramPseudo ? (isFa ? 'ثبت‌نام‌شده با تلگرام (ایمیل شخصی ثبت نشده)' : 'Telegram Account') : user.email}
              </bdi>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-full panel text-[11px] font-bold text-[#1652F0] inline-flex items-center gap-1.5 hover:bg-[var(--soft)] transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{avatarBusy ? '...' : isFa ? 'آپلود تصویر دلخواه' : 'Upload Photo'}</span>
            </button>
            {user.telegram_id && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void handleUseTelegramAvatar()}
                className="px-3.5 py-1.5 rounded-full panel text-[11px] font-bold text-[#0EA5E9] inline-flex items-center gap-1.5 hover:bg-[var(--soft)] transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'عکس پروفایل تلگرام' : 'Use Telegram Photo'}</span>
              </button>
            )}
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

        {/* Locked Verified Phone + Account Overview */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'هویت تاییدشده تلگرام (غیرقابل تغییر)' : 'Verified Telegram Identity (Locked)'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Phone className="w-4 h-4 text-jade" />
                <span>{isFa ? 'شماره تماس تاییدشده' : 'Verified Phone'}</span>
              </span>
              <div className="flex items-center gap-2">
                <span dir="ltr" className="font-mono-num font-black text-main">
                  {user.phone_number || (isFa ? 'تاییدشده' : 'Verified')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-jade text-[10px] font-black inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>{isFa ? 'قفل‌شده' : 'Locked'}</span>
                </span>
              </div>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Send className="w-4 h-4 text-[#0EA5E9]" />
                <span>{isFa ? 'شناسه اکانت تلگرام' : 'Telegram Account'}</span>
              </span>
              <span dir="ltr" className="font-mono-num font-bold text-sub">
                {user.telegram_username ? `@${user.telegram_username}` : user.telegram_id ? `ID: ${user.telegram_id}` : '—'}
              </span>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <UserCheck className="w-4 h-4 text-dim" />
                <span>{isFa ? 'وضعیت دسترسی و مدل کارمزد' : 'Access & Profit-Fee Model'}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-[#0D9455]/12 text-[#0D9455] text-[11px] font-black">
                {activePlanLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Editable Profile Form */}
        <form onSubmit={handleSaveProfileDetails} className="panel rounded-[24px] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-main flex items-center gap-2">
              <User className="w-4 h-4 text-[#1652F0]" />
              <span>{isFa ? 'ویرایش مشخصات کاربری' : 'Edit Profile Information'}</span>
            </h3>
            <span className="text-[10px] text-dim">{isFa ? 'تمامی فیلدها به جز شماره تماس قابل ویرایشند' : 'All fields editable except phone'}</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'نام نمایشی / نام کاربری' : 'Username'}</label>
              <div className="relative">
                <User className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  minLength={2}
                  maxLength={40}
                  required
                  className="field ps-10 text-xs"
                  placeholder={isFa ? 'نام شما در پنل و کارت سود' : 'Your display name'}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">
                {isFa ? 'ایمیل شخصی (برای ورود با ایمیل و اعلان‌ها)' : 'Personal Email'}
              </label>
              <div className="relative" dir="ltr">
                <Mail className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  dir="ltr"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="field pl-10 pr-3.5 text-xs text-left"
                  placeholder="you@gmail.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'معرفی کوتاه / بیوگرافی (اختیاری)' : 'Short Bio (optional)'}</label>
              <div className="relative">
                <FileText className="w-4 h-4 text-dim absolute start-3.5 top-3" />
                <textarea
                  rows={2}
                  maxLength={160}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="field ps-10 text-xs py-2.5"
                  placeholder={isFa ? 'مثلاً تریدر فیوچرز و اسکالپ طلا و BTC...' : 'Short bio...'}
                />
              </div>
            </div>
          </div>

          {profileMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${profileMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {profileMsg.text}
            </div>
          )}

          <button type="submit" disabled={profileBusy} className="btn-cobalt w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            <span>{profileBusy ? '...' : isFa ? 'ذخیره تغییرات پروفایل' : 'Save Profile Changes'}</span>
          </button>
        </form>

        {/* Password Setup / Change Form */}
        <form onSubmit={handleSavePassword} className="panel rounded-[24px] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-gold" />
              <span>{hasExistingPwd ? (isFa ? 'تغییر رمز عبور' : 'Change Password') : isFa ? 'تنظیم رمز عبور برای ورود از سایت' : 'Set Web Login Password'}</span>
            </h3>
          </div>
          {!hasExistingPwd && (
            <p className="text-[11px] text-sub leading-relaxed">
              {isFa
                ? 'شما با حساب تلگرام وارد شده‌اید. اگر ایمیل شخصی خود را در کادر بالا ثبت کرده و این‌جا یک رمز عبور بسازید، از این پس علاوه‌بر ربات می‌توانید با ایمیل و رمز نیز وارد سایت شوید.'
                : 'Set a password here along with your personal email above if you also want password sign-in.'}
            </p>
          )}
          <div className="space-y-2.5 text-xs">
            {hasExistingPwd && (
              <input
                type="password"
                dir="ltr"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={isFa ? 'رمز عبور فعلی' : 'Current Password'}
                className="field text-xs"
              />
            )}
            <div className="grid sm:grid-cols-2 gap-2.5">
              <input
                type="password"
                dir="ltr"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={isFa ? 'رمز عبور جدید (حداقل ۶ کاراکتر)' : 'New Password (min 6)'}
                className="field text-xs"
              />
              <input
                type="password"
                dir="ltr"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={isFa ? 'تکرار رمز عبور جدید' : 'Confirm Password'}
                className="field text-xs"
              />
            </div>
          </div>

          {passwordMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${passwordMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {passwordMsg.text}
            </div>
          )}

          <button type="submit" disabled={passwordBusy} className="btn-gold w-full py-2.5 rounded-xl text-xs font-black">
            {passwordBusy ? '...' : hasExistingPwd ? (isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password') : isFa ? 'ثبت رمز عبور اختصاصی' : 'Set Password'}
          </button>
        </form>

        {/* Two-Factor Authentication (Google Authenticator TOTP 2FA) */}
        <div className="panel rounded-[26px] p-5 space-y-3 border hairline">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-jade" />
              <div>
                <h3 className="text-sm font-black text-main">
                  {isFa ? 'تایید دوعاملی (Google Authenticator / 2FA)' : 'Two-Factor Authentication (2FA)'}
                </h3>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? 'افزودن کد ۶ رقمی یکبارمصرف برای امنیت بیشتر هنگام ورود به حساب'
                    : 'Protect logins with 6-digit Google Authenticator TOTP codes.'}
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
                totpEnabled ? 'bg-emerald-500/15 text-jade border border-emerald-500/30' : 'surface-soft text-dim'
              }`}
            >
              {totpEnabled ? (isFa ? 'فعال' : 'Active') : isFa ? 'غیرفعال' : 'Off'}
            </span>
          </div>

          {totpMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${totpMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {totpMsg.text}
            </div>
          )}

          {totpEnabled ? (
            <form onSubmit={handleDisable2fa} className="space-y-2.5 pt-1">
              <p className="text-[11px] text-sub">
                {isFa
                  ? 'برای غیرفعال‌سازی تایید دوعاملی، کد ۶ رقمی فعلی Google Authenticator را وارد کنید:'
                  : 'Enter your current 6-digit authenticator code to disable 2FA:'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  dir="ltr"
                  required
                  value={totpInputCode}
                  onChange={(e) =>
                    setTotpInputCode(
                      e.target.value
                        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
                        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    )
                  }
                  placeholder="000000"
                  className="field text-xs font-mono-num text-center tracking-widest flex-1"
                />
                <button
                  type="submit"
                  disabled={totpBusy || totpInputCode.length !== 6}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/15 text-loss border border-rose-500/30 text-xs font-black shrink-0 disabled:opacity-50"
                >
                  {totpBusy ? '...' : isFa ? 'غیرفعال‌سازی 2FA' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          ) : totpSetup ? (
            <form onSubmit={handleEnable2fa} className="space-y-3 pt-1">
              <div className="surface-soft rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 border hairline">
                <img
                  src={totpSetup.qrDataUrl}
                  alt="2FA QR Code"
                  className="w-36 h-36 rounded-2xl bg-white p-2 shrink-0 border border-black/10"
                />
                <div className="space-y-2 min-w-0 flex-1 text-xs">
                  <p className="font-bold text-main">
                    {isFa ? '۱. بارکد را در Google Authenticator اسکن کنید' : '1. Scan QR in Google Authenticator'}
                  </p>
                  <p className="text-[11px] text-dim leading-relaxed">
                    {isFa
                      ? 'یا کد مخفی زیر را به صورت دستی وارد برنامه کنید:'
                      : 'Or enter this setup key manually:'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <code dir="ltr" className="px-2.5 py-1.5 rounded-lg bg-black/25 text-jade font-mono text-[11px] select-all break-all">
                      {totpSetup.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(totpSetup.secret);
                        setTotpMsg({ ok: true, text: isFa ? 'کلید مخفی کپی شد' : 'Secret copied' });
                      }}
                      className="p-1.5 rounded-lg btn-ghost shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-dim block">
                  {isFa ? '۲. کد ۶ رقمی تولیدشده توسط برنامه را جهت تایید و فعال‌سازی وارد کنید:' : '2. Enter 6-digit code to activate:'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    dir="ltr"
                    required
                    value={totpInputCode}
                    onChange={(e) =>
                      setTotpInputCode(
                        e.target.value
                          .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
                          .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                          .replace(/\D/g, '')
                          .slice(0, 6)
                      )
                    }
                    placeholder="123456"
                    className="field text-sm font-mono-num text-center tracking-widest flex-1"
                  />
                  <button
                    type="submit"
                    disabled={totpBusy || totpInputCode.length !== 6}
                    className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black shrink-0 disabled:opacity-50"
                  >
                    {totpBusy ? '...' : isFa ? 'تایید و فعال‌سازی' : 'Activate 2FA'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTotpSetup(null)}
                    className="px-3 py-2.5 rounded-xl btn-ghost text-xs font-bold"
                  >
                    {isFa ? 'انصراف' : 'Cancel'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              type="button"
              disabled={totpBusy}
              onClick={() => void handleStart2faSetup()}
              className="btn-emerald w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              <span>{totpBusy ? '...' : isFa ? 'راه‌اندازی تایید دوعاملی Google Authenticator' : 'Setup Google Authenticator 2FA'}</span>
            </button>
          )}
        </div>

        {/* Comprehensive User Preferences & Notification Center */}
        <form onSubmit={handleSaveUserPreferences} className="panel rounded-[26px] p-5 space-y-4 border hairline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-brand" />
              <div>
                <h3 className="text-sm font-black text-main">
                  {isFa ? 'تنظیمات کامل اعلانات، نمایشگر و ترجیحات ربات' : 'Bot Preferences, Display & Notification Center'}
                </h3>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? 'تمام تنظیمات به‌صورت پیش‌فرض ایمن و خاموش است؛ هر بخش را مطابق نیاز خود فعال کنید.'
                    : 'All automated switches start safely OFF — customize and activate only what you want.'}
                </p>
              </div>
            </div>
            <button type="submit" disabled={prefsBusy} className="btn-gold px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" />
              <span>{prefsBusy ? '...' : isFa ? 'ذخیره تنظیمات' : 'Save Settings'}</span>
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {onToggleUiMode && (
            <div className="surface-soft rounded-2xl p-3.5 space-y-2 border hairline">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'نمای رابط کاربری سایت و تلگرام' : 'UI Experience Mode'}</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleUiMode('simple')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    uiMode === 'simple' ? 'btn-emerald text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '🌱 حالت ساده' : '🌱 Simple Mode'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleUiMode('pro')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    uiMode === 'pro' ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '⚡ حالت حرفه‌ای' : '⚡ Pro Mode'}
                </button>
              </div>
            </div>
            )}

            <div className="surface-soft rounded-2xl p-3.5 space-y-2 border hairline">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'واحد نمایش اصلی مبالغ' : 'Primary Display Currency'}</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrefCurrency('USD')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    prefCurrency === 'USD' ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '💵 دلار (USDT)' : '💵 USD / USDT'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrefCurrency('IRT')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    prefCurrency === 'IRT' ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '🇮🇷 معادل تومان' : '🇮🇷 Toman (IRT)'}
                </button>
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-3.5 space-y-2 border hairline">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'روش اجرای دستورات' : 'Trade Execution Mode'}</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrefExecMode('MANUAL_CONFIRM')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    prefExecMode === 'MANUAL_CONFIRM' ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '✋ تایید دستی من' : '✋ Manual Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrefExecMode('AUTO')}
                  className={`py-2 rounded-xl text-[11px] font-black transition ${
                    prefExecMode === 'AUTO' ? 'btn-emerald text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                  }`}
                >
                  {isFa ? '🤖 اتوترید خودکار' : '🤖 Auto Execute'}
                </button>
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-3.5 space-y-2 border hairline">
              <span className="text-[11px] font-bold text-dim block">{isFa ? 'نوع بازار و جهت مجاز' : 'Market & Direction'}</span>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={prefMarketType}
                  onChange={(ev) => setPrefMarketType(ev.target.value === 'SPOT' ? 'SPOT' : 'FUTURES')}
                  className="field py-2 text-[11px] font-bold"
                >
                  <option value="FUTURES">{isFa ? 'فیوچرز (با اهرم)' : 'Futures (Perp)'}</option>
                  <option value="SPOT">{isFa ? 'اسپات (بدون اهرم)' : 'Spot (1x)'}</option>
                </select>
                <select
                  value={prefDirection}
                  onChange={(ev) => setPrefDirection((ev.target.value as 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY') || 'BOTH')}
                  className="field py-2 text-[11px] font-bold"
                >
                  <option value="BOTH">{isFa ? 'لانگ + شورت' : 'Long + Short'}</option>
                  <option value="LONG_ONLY">{isFa ? 'فقط خرید (Long)' : 'Long Only'}</option>
                  {prefMarketType === 'FUTURES' && <option value="SHORT_ONLY">{isFa ? 'فقط فروش (Short)' : 'Short Only'}</option>}
                </select>
              </div>
            </div>
          </div>

          <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-main inline-flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--gold)]" />
                {isFa ? 'اعلانات لحظه‌ای تلگرام و سایت (Master Switch)' : 'Instant Telegram & App Notifications'}
              </span>
              <input
                type="checkbox"
                checked={prefNotifMaster}
                onChange={(ev) => {
                  const next = ev.target.checked;
                  setPrefNotifMaster(next);
                  if (next && !Object.values(prefNotifs).some(Boolean)) {
                    setPrefNotifs({ tradeOpen: true, tpSlHit: true, aiSignals: true, whaleCopy: true, dailyDigest: false });
                  }
                }}
                className="w-4 h-4 accent-[#10d9a3] cursor-pointer"
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { k: 'tradeOpen' as const, fa: 'باز/بسته شدن معاملات', en: 'Trade Open & Close' },
                { k: 'tpSlHit' as const, fa: 'رسیدن به TP1/2/3 و حد ضرر', en: 'TP / SL Hit Alerts' },
                { k: 'aiSignals' as const, fa: 'سیگنال‌های مدل AI دلارینو', en: 'AI Signal Alerts' },
                { k: 'whaleCopy' as const, fa: 'تراکنش نهنگ‌های کپی‌ترید', en: 'Whale Copy Activity' },
                { k: 'dailyDigest' as const, fa: 'گزارش خلاصه سود روزانه', en: 'Daily PnL Digest' },
              ].map((item) => (
                <label key={item.k} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg)]/50 cursor-pointer">
                  <span className="text-[11px] font-semibold text-sub">{isFa ? item.fa : item.en}</span>
                  <input
                    type="checkbox"
                    disabled={!prefNotifMaster}
                    checked={prefNotifMaster && prefNotifs[item.k]}
                    onChange={(ev) => setPrefNotifs((p) => ({ ...p, [item.k]: ev.target.checked }))}
                    className="w-3.5 h-3.5 accent-[#10d9a3]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-2.5 text-xs">
            <label className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline cursor-pointer">
              <span className="font-bold text-main text-[11px]">{isFa ? 'توقف ترید آخر هفته‌ها' : 'Block Weekends'}</span>
              <input
                type="checkbox"
                checked={prefBlockWeekends}
                onChange={(ev) => setPrefBlockWeekends(ev.target.checked)}
                className="w-4 h-4 accent-[#10d9a3]"
              />
            </label>
            <label className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 border hairline cursor-pointer">
              <span className="font-bold text-main text-[11px]">{isFa ? 'توقف در اخبار CPI/FOMC' : 'Macro Blackout'}</span>
              <input
                type="checkbox"
                checked={prefMacroBlackout}
                onChange={(ev) => setPrefMacroBlackout(ev.target.checked)}
                className="w-4 h-4 accent-[#10d9a3]"
              />
            </label>
            <div className="surface-soft rounded-2xl p-3 flex items-center justify-between gap-2 border hairline">
              <span className="font-bold text-main text-[11px] shrink-0">{isFa ? 'موجودی دمو ($)' : 'Demo ($)'}</span>
              <input
                dir="ltr"
                type="number"
                min={50}
                max={10000000}
                value={prefPaperBalance}
                onChange={(ev) => setPrefPaperBalance(ev.target.value)}
                className="field py-1.5 px-2 w-28 font-num text-xs text-end"
              />
            </div>
          </div>

          {prefsMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${prefsMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {prefsMsg.text}
            </div>
          )}
        </form>

        {/* Dollarino Quick Settings */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'حساب کاربری دلارینو' : 'Dollarino Settings'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('dex')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
            >
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <KeyRound className="w-4 h-4 text-dim" />
                <span>{isFa ? 'کیف‌پول Trust Wallet، سرمایه شخصی و فاکتورها' : 'Trust Wallet, Wallet Cap & Invoices'}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-dim font-bold">
                  {data.config.trading_mode === 'LIVE' ? 'TRUST WALLET' : 'DEMO SIMULATOR'}
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
                <span>{isFa ? 'زیرمجموعه‌ها و اعتبار کارمزد ۳٪ (+$۲ پاداش)' : 'Referrals & 3% Fee Credit (+$2 Bonus)'}</span>
              </span>
              <Arrow className="w-4 h-4 text-dim" />
            </button>
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

        {/* Danger Zone: Permanent Account Deletion */}
        <div className="panel rounded-[24px] p-4 sm:p-5 border border-rose-500/30 bg-rose-500/5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-loss shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-black text-loss">
                  {isAdmin
                    ? isFa
                      ? 'صفرسازی کامل حساب مدیریتی (Reset Account to 0)'
                      : 'Reset Admin Account to Fresh Zero State'
                    : isFa
                      ? 'حذف دائمی حساب کاربری (Delete Account)'
                      : 'Danger Zone — Delete Account'}
                </h3>
                <p className="text-[11px] text-sub mt-0.5 leading-relaxed">
                  {isAdmin
                    ? isFa
                      ? 'با اجرای این عملیات روی حساب مدیر/مالک، حساب شما حذف نمی‌شود و دسترسی مدیریتی پابرجا می‌ماند؛ اما تمام موجودی‌ها، تاریخچه معاملات، کیف‌پول‌های متصل، سیگنال‌ها و تنظیمات مثل یک کاربر تازه‌وارد به ۰ بازنشانی می‌شوند.'
                      : 'Wipes all balances, trades, wallets, signals, and preferences back to 0 like a fresh user while preserving your admin/owner account and privileges.'
                    : isFa
                      ? 'با حذف حساب، تمامی اطلاعات پروفایل، کلیدهای API صرافی، اتصال ربات، تاریخچه معاملات و کلید اکستنشن برای همیشه پاک می‌شوند و قابل بازیابی نیستند.'
                      : 'Permanently erases your profile, exchange APIs, trades, alerts, and extension key. This cannot be undone.'}
                </p>
              </div>
            </div>
          </div>

          {deleteSuccessMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-jade text-[11px] font-bold">
              {deleteSuccessMsg}
            </div>
          )}

          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteErr(null);
                setDeleteSuccessMsg(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-500/15 text-loss border border-rose-500/30 text-xs font-black inline-flex items-center gap-2 hover:bg-rose-500/25 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {isAdmin
                  ? isFa
                    ? 'صفرسازی حساب من (حفظ مدیریت)'
                    : 'Reset Account to 0 (Keep Admin)'
                  : isFa
                    ? 'حذف حساب کاربری من'
                    : 'Delete My Account'}
              </span>
            </button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="space-y-2.5 pt-2 border-t border-rose-500/20 text-xs">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'برای تایید، کلمه DELETE یا «حذف» را بنویسید:' : 'Type DELETE to confirm:'}
                </label>
                <input
                  dir="ltr"
                  required
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="field text-xs font-mono-num"
                />
              </div>

              {hasExistingPwd && (
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">
                    {isFa ? 'رمز عبور فعلی جهت تایید امنیتی:' : 'Current Password:'}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={isFa ? 'رمز عبور فعلی' : 'Current Password'}
                    className="field text-xs"
                  />
                </div>
              )}

              {deleteErr && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-loss text-[11px] font-bold">{deleteErr}</div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black inline-flex items-center gap-1.5 hover:bg-rose-700 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleteBusy ? '...' : isFa ? 'تایید و حذف کامل حساب' : 'Permanently Delete Account'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmText('');
                    setDeletePassword('');
                    setDeleteErr(null);
                  }}
                  className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </form>
          )}
        </div>
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
      title: isFa ? 'کارمزد ۳٪ و هدیه' : '3% Fee & Gift',
      icon: Gift,
      bg: 'from-[#F59E0B] to-[#FBBF24]',
      color: '#FFFFFF',
    },
  ];

  const featuredServices: Array<{
    tab: NavTab;
    subTab?: 'radar' | 'sniper' | 'copy' | 'risk';
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
      tileColor: 'text-[#1652F0] dark:text-[#60A5FA]',
      badge: isFa ? 'جدید' : 'NEW',
    },
    {
      tab: 'overview',
      title: isFa ? 'ربات معامله‌گر هوشمند ۲۴/۷' : '24/7 Autonomous AI Bot',
      subtitle: isFa ? 'اسکن کل بازار با استاپ، تریلینگ و TP1-TP3 خودکار' : 'Automated TP1-TP3, breakeven & AI filtering',
      icon: Bot,
      tileBg: 'bg-[#F59E0B]/15',
      tileColor: 'text-[#D97706] dark:text-[#FBBF24]',
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
      title: isFa ? 'رادار، کپی و اسنایپر' : 'Radar, Copy & Sniper',
      subtitle: isFa ? 'تریدرهای تاییدشده + Top-10 نهنگ‌ها + اسکنر DexScreener' : 'Verified Copy Traders, Top-10 Whales & DexScreener',
      icon: Users,
      tileBg: 'bg-[#0EA5E9]/15',
      tileColor: 'text-[#0284C7] dark:text-[#38BDF8]',
    },
    {
      tab: 'copy',
      subTab: 'sniper' as const,
      title: isFa ? 'میز اسنایپر لیست جدید و میم‌کوین' : 'New Listing & Meme Sniper Hub',
      subtitle: isFa ? 'شکار خودکار لیست صرافی + میم‌کوین‌های پرجهش با TP/SL و Trailing' : 'Auto CEX Listing & Meme Sniper with TP/SL & Trailing',
      icon: Crosshair,
      tileBg: 'bg-amber-500/15',
      tileColor: 'text-amber-600 dark:text-amber-400',
      badge: 'Sniper',
    },
    {
      tab: 'dex',
      title: isFa ? 'کیف‌پول Trust Wallet، سرمایه شخصی و فاکتورها' : 'Trust Wallet, Wallet Cap & Invoices',
      subtitle: isFa ? 'مدیریت سرمایه ۱۰۰٪ داخل Trust Wallet خودتان، سقف ربات و فاکتور کارمزد ۳٪' : 'Multi-chain addresses, wallet budget cap & 3% fee invoices',
      icon: Sparkles,
      tileBg: 'bg-[#10B981]/15',
      tileColor: 'text-[#0D9455] dark:text-[#34D399]',
      badge: 'Trust Wallet',
    },
    {
      tab: 'card',
      title: isFa ? 'کارت سود تاییدشده (Live / Demo)' : 'Verified Profit Card',
      subtitle: isFa ? 'صدور تصویر PNG رسمی عملکرد با مهر حساب واقعی/دمو و امضای سرور' : 'Generate official Live/Demo PNG Profit Card with HMAC verification',
      icon: Image,
      tileBg: 'bg-[#10B981]/15',
      tileColor: 'text-[#0D9455] dark:text-[#34D399]',
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
            <div className="w-full h-full rounded-full bg-[var(--panel)] overflow-hidden grid place-items-center font-display font-black text-sm text-[#1652F0] dark:text-[#60A5FA]">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display font-bold text-sm text-main truncate group-hover:text-[#1652F0] dark:group-hover:text-[#60A5FA] transition">
                {user.username}
              </h2>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9455] dark:text-[#34D399] shrink-0" />
            </div>
            <p className="text-[11px] text-dim truncate">{activePlanLabel}</p>
          </div>
        </button>

        {/* 3 Circular Inline Controls matching image-6.png */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleUiMode && (
          <button
            type="button"
            onClick={() => onToggleUiMode(uiMode === 'simple' ? 'pro' : 'simple')}
            title={isFa ? 'تغییر سطح کاربری (ساده / حرفه‌ای)' : 'Toggle Easy / Pro'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-xs font-black text-main hover:bg-[var(--line)] transition"
          >
            {uiMode === 'simple' ? <Sprout className="w-4 h-4 text-[#0D9455] dark:text-[#34D399]" /> : <Zap className="w-4 h-4 text-[#1652F0] dark:text-[#60A5FA]" />}
          </button>
          )}
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
          className={`absolute inset-0 pointer-events-none ${
            isFa
              ? 'bg-gradient-to-l from-[#F3F5F8] via-[#F3F5F8]/82 to-transparent dark:from-slate-900 dark:via-slate-900/85 dark:to-slate-900/20'
              : 'bg-gradient-to-r from-[#F3F5F8] via-[#F3F5F8]/82 to-transparent dark:from-slate-900 dark:via-slate-900/85 dark:to-slate-900/20'
          }`}
        />
        <div className="relative z-10 w-full px-5 py-4 flex items-center justify-between gap-3">
          <div className="space-y-1.5 max-w-[66%]">
            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
              {isFa ? 'رادار هوشمند و استراتژی کاستوم دلارینو' : 'Dollarino Smart Radar & Pine/Py IDE'}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              {isFa ? (
                <>
                  اسکن زنده ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی
                  {publicTgMeta.botUsername ? (
                    <>
                      {' '}و اتصال ۱-کلیکی به{' '}
                      <span dir="ltr" className="font-bold">@{publicTgMeta.botUsername}</span>
                    </>
                  ) : (
                    ' و همگام‌سازی لحظه‌ای با ربات متصل تلگرام'
                  )}
                </>
              ) : (
                `807-pair live scanner, 900-candle backtest${publicTgMeta.botUsername ? ` & @${publicTgMeta.botUsername} sync` : ' & Telegram sync'}`
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
                key={`${srv.tab}-${srv.subTab || 'main'}`}
                type="button"
                onClick={() => {
                  if (srv.subTab) {
                    sessionStorage.setItem('dollarino_copy_subtab', srv.subTab);
                    window.dispatchEvent(new CustomEvent('dollarino:copy-subtab', { detail: srv.subTab }));
                  }
                  onNavigate(srv.tab);
                }}
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
        <p className="text-xs font-black text-dim px-1">{isFa ? 'مدیریت حساب، کارمزد ۳٪ سود و پشتیبانی' : 'Account, 3% Profit Fee & Support'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          <button
            type="button"
            onClick={() => setAccountView(true)}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/12 text-[#1652F0] dark:text-[#60A5FA] grid place-items-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'مدیریت حساب، امنیت (2FA) و تنظیمات کامل ربات' : 'Account Details, 2FA & Full Bot Preferences'}</span>
              <span className="text-[11px] text-dim block">
                {isFa ? 'اعلانات، حالت ساده/حرفه‌ای، واحد تومان/دلار، 2FA، رمز عبور و عکس پروفایل' : 'Notifications, UI mode, currency, 2FA, profile, avatar & password'}
              </span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 text-[#D97706] dark:text-[#FBBF24] grid place-items-center shrink-0">
              <Award className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'کارمزد ۳٪ سود، فاکتورها و باشگاه دعوت' : '3% Profit Fee, Invoices & Referrals'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#0D9455]/15 text-[#0D9455] dark:text-[#34D399]">
                  {isFa ? 'اعتبار کارمزد غیرقابل‌برداشت' : 'Prepaid Fee Credit'}
                </span>
              </div>
              <span className="text-[11px] text-dim block">
                {isFa ? 'بنر دعوت اختصاصی، متن پیام، کد معرف + پاداش پس از $۱۰ موجودی و ترید واقعی' : 'Invite banner, text, code + credit unlock after >= $10 live trade'}
              </span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <a
            href="/downloads/dollarino-extension.zip"
            download="dollarino-extension.zip"
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/15 text-[#1652F0] dark:text-[#60A5FA] grid place-items-center shrink-0">
              <Download className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'اکستنشن مرورگر (Chrome / Edge / Brave)' : 'Browser Extension (V11.7 ZIP)'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1652F0]/15 text-[#1652F0] dark:text-[#60A5FA]">V11.7 گرافیکی</span>
              </div>
              <span className="text-[11px] text-dim block">{isFa ? 'طراحی Liquid Glass هم‌شکل سایت · کنترل ربات، بازارها و رادار DEX' : 'Liquid Glass UI matching web app · Bot, Markets & DEX radar'}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-dim shrink-0" />
          </a>

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
            >
              <span className="w-10 h-10 rounded-2xl bg-[#10B981]/15 text-[#0D9455] dark:text-[#34D399] grid place-items-center shrink-0">
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
            <span className="w-10 h-10 rounded-2xl bg-[#0D9455]/12 text-[#0D9455] dark:text-[#34D399] grid place-items-center shrink-0">
              <CircleHelp className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'راهنمای کامل و امنیت حساب' : 'User Guide & Security'}</span>
              <span className="text-[11px] text-dim block">{isFa ? 'آموزش گام‌به‌گام و پشتیبانی' : 'Step-by-step guide & help'}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          {[
            {
              show: Boolean(publicTgMeta.botUsername),
              href: `https://t.me/${publicTgMeta.botUsername}`,
              title: isFa ? '🤖 ربات رسمی دلارینو' : '🤖 Official Dollarino Bot',
              sub: `@${publicTgMeta.botUsername} · ${isFa ? 'ثبت‌نام، ورود و حالت ساده سایت داخل تلگرام' : 'Auth, Quick Access & Simple Mode'}`,
            },
            {
              show: Boolean(publicTgMeta.officialChannelInvite),
              href: publicTgMeta.officialChannelInvite,
              title: isFa ? '🌟 چنل رسمی و اصلی دلارینو' : '🌟 Official Main Dollarino Channel',
              sub: publicTgMeta.officialChannel || (isFa ? 'آپدیت‌های قطعی پروژه، اطلاعیه‌ها، قرعه‌کشی و تبلیغات' : 'Project Updates & Announcements'),
            },
            {
              show: Boolean(publicTgMeta.signalsChannelInvite),
              href: publicTgMeta.signalsChannelInvite,
              title: isFa ? '01. سیگنال دلارینو' : '01. Dollarino Signals',
              sub: publicTgMeta.signalsChannel || (isFa ? 'انتشار سیگنال‌های معاملاتی موتورهای پروژه' : 'Live Trading Signals'),
            },
            {
              show: Boolean(publicTgMeta.resultsChannelInvite),
              href: publicTgMeta.resultsChannelInvite,
              title: isFa ? '02. نتایج سیگنال دلارینو' : '02. Signal Results',
              sub: publicTgMeta.resultsChannel || (isFa ? 'نتیجه سیگنال‌ها، سود و زیان و کارت سود' : 'Verified Results & PnL'),
            },
            {
              show: Boolean(publicTgMeta.communityGroupInvite),
              href: publicTgMeta.communityGroupInvite,
              title: isFa ? '03. گروه کاربران دلارینو' : '03. Traders Community Group',
              sub: isFa ? 'ارتباط کاربران، پرسش و پاسخ و تبادل تجربه' : 'User Community & Q&A',
            },
            {
              show: Boolean(publicTgMeta.newsChannelInvite),
              href: publicTgMeta.newsChannelInvite,
              title: isFa ? '07. اخبار دلارینو' : '07. Crypto & Market News',
              sub: publicTgMeta.newsChannel || (isFa ? 'اخبار کریپتو و بازار' : 'Crypto & Market News'),
            },
          ]
            .filter((item) => item.show && item.href)
            .map((item) => (
              <a
                key={item.title}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
              >
                <span className="w-10 h-10 rounded-2xl bg-[#0EA5E9]/15 text-[#0284C7] dark:text-[#38BDF8] grid place-items-center shrink-0">
                  <Send className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-extrabold text-main block">{item.title}</span>
                  <span className="text-[11px] text-[#0284C7] dark:text-[#38BDF8] font-bold block truncate">{item.sub}</span>
                </div>
                <ExternalLink className="w-4 h-4 text-dim shrink-0" />
              </a>
            ))}

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
                <span className="text-[11px] text-dim block">{isFa ? 'کاربران، بکاپ/مدیریت دیتابیس، کد هدیه و AI' : 'Users, DB Backup/Wipe, gift codes & AI'}</span>
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
