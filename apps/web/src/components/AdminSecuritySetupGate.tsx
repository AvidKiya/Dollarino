import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import QRCode from 'qrcode';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo } from '../lib/types';
import { DollarinoBrandMark } from './BrandGraphics';

export function AdminSecuritySetupGate({
  lang,
  user,
  onCompleted,
  onLogout,
}: {
  lang: Lang;
  user: AuthUserInfo;
  onCompleted: (updated: AuthUserInfo) => void;
  onLogout: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loadingQr, setLoadingQr] = useState(true);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoInitRef = useRef(false);
  const reqSeqRef = useRef(0);

  const normalizeDigits = (val: string) =>
    val
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/\D/g, '')
      .slice(0, 6);

  const initTotpSetup = useCallback(async (force = false) => {
    const seq = ++reqSeqRef.current;
    setLoadingQr(true);
    setError(null);
    if (force) setTotpCode('');
    try {
      const res = await apiFetch<{ ok: boolean; secret: string; otpauthUri: string }>('/api/auth/2fa/setup', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      if (seq !== reqSeqRef.current) return;
      setSecret(res.secret);
      const dataUrl = await QRCode.toDataURL(res.otpauthUri, { width: 220, margin: 1 });
      if (seq !== reqSeqRef.current) return;
      setQrDataUrl(dataUrl);
    } catch (err) {
      if (seq !== reqSeqRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : isFa
            ? 'خطا در تولید کد QR احراز هویت Google Authenticator'
            : 'Failed to generate Google Authenticator QR setup'
      );
    } finally {
      if (seq === reqSeqRef.current) {
        setLoadingQr(false);
      }
    }
  }, [isFa]);

  useEffect(() => {
    if (didAutoInitRef.current) return;
    didAutoInitRef.current = true;
    void initTotpSetup(false);
  }, [initTotpSetup]);

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 1800);
    } catch {
      // ignore clipboard permission error
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = normalizeDigits(totpCode);

    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUser)) {
      setError(
        isFa
          ? 'نام کاربری جدید باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ . - باشد.'
          : 'New username must be 3–32 characters (letters, digits, _, ., -).'
      );
      return;
    }
    if (cleanUser.toLowerCase() === 'admin') {
      setError(
        isFa
          ? 'نام کاربری جدید نمی‌تواند همچنان admin بماند؛ یک نام کاربری اختصاصی انتخاب کنید.'
          : 'New username cannot remain "admin". Please choose a unique username.'
      );
      return;
    }
    if (password.length < 6) {
      setError(isFa ? 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' : 'New password must be at least 6 characters.');
      return;
    }
    if (password === 'admin' || password === 'admin123') {
      setError(
        isFa
          ? 'رمز عبور جدید نمی‌تواند برابر با رمز پیش‌فرض اولیه (admin / admin123) باشد.'
          : 'New password cannot match the default bootstrap passwords.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setError(isFa ? 'رمز عبور و تکرار آن مطابقت ندارند.' : 'Passwords do not match.');
      return;
    }
    if (cleanEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.endsWith('.local'))) {
      setError(isFa ? 'فرمت ایمیل وارد شده معتبر نیست.' : 'Invalid email address.');
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError(
        isFa
          ? 'کد ۶ رقمی Google Authenticator جهت تبدیل رمز دوم ثابت به 2FA الزامی است.'
          : 'A 6-digit Google Authenticator code is required to finalize 2FA.'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; token: string; user: AuthUserInfo }>('/api/auth/complete-admin-setup', {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUser,
          displayName: displayName.trim() || cleanUser,
          email: cleanEmail || undefined,
          password,
          totpCode: cleanCode,
          clientTimestampMs: Date.now(),
        }),
      });
      if (res.token) setStoredToken(res.token);
      onCompleted(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : isFa ? 'خطا در ثبت تنظیمات امنیتی مدیر' : 'Setup failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-[720px] panel rounded-[28px] p-6 sm:p-8 space-y-6 shadow-2xl border border-amber-500/30">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <DollarinoBrandMark size={44} glow />
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-[#F59E0B] text-[10px] font-black mb-1">
                <ShieldAlert className="w-3 h-3" />
                <span>{isFa ? 'ایمن‌سازی اجباری اولین ورود مدیر' : 'Mandatory First-Login Admin Security Setup'}</span>
              </span>
              <h1 className="font-display font-bold text-lg sm:text-xl text-main">
                {isFa ? 'تغییر نام کاربری، رمز عبور و فعال‌سازی Google Authenticator' : 'Change Credentials & Activate Google Authenticator 2FA'}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="px-3 py-2 rounded-xl btn-ghost text-xs font-bold inline-flex items-center gap-1.5 text-dim hover:text-loss"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isFa ? 'خروج' : 'Logout'}</span>
          </button>
        </div>

        <div className="surface-soft rounded-2xl p-4 border hairline text-xs text-sub leading-relaxed flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-jade shrink-0 mt-0.5" />
          <div>
            {isFa ? (
              <>
                شما با حساب پیش‌فرض اولیه (<span dir="ltr" className="font-mono-num font-bold text-main">{user.username}</span>) وارد شده‌اید.
                قبل از دسترسی به پنل مدیریت و تنظیم اتصالات سایت، باید <strong>نام کاربری و رمز عبور جدید</strong> تعیین کنید و با اسکن QR کد زیر،
                <strong> رمز دوم ثابت (admin123) را برای همیشه به احراز هویت دوعاملی Google Authenticator تبدیل نمایید</strong>.
              </>
            ) : (
              <>
                You signed in with the bootstrap admin account (<span className="font-mono-num font-bold text-main">{user.username}</span>).
                Before unlocking the Admin Panel, you must set a <strong>new username & password</strong> and activate <strong>Google Authenticator TOTP 2FA</strong>,
                permanently replacing the static secondary password (<span className="font-mono-num">admin123</span>).
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-loss">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Left/Top Column: TOTP QR Step */}
          <div className="md:col-span-5 surface-soft rounded-2xl p-4 border hairline space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-main">
                <QrCode className="w-4 h-4 text-jade" />
                <span>{isFa ? 'گام ۱: اسکن در Google Authenticator' : 'Step 1: Scan TOTP QR'}</span>
              </div>
              <button
                type="button"
                onClick={() => void initTotpSetup(true)}
                disabled={loadingQr}
                className="text-[11px] font-bold text-dim hover:text-main inline-flex items-center gap-1"
                title={isFa ? 'تولید کلید جدید' : 'Regenerate key'}
              >
                <RefreshCw className={`w-3 h-3 ${loadingQr ? 'animate-spin' : ''}`} />
                <span>{isFa ? 'نوسازی' : 'Refresh'}</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl p-3 flex items-center justify-center min-h-[196px] border border-slate-200">
              {loadingQr ? (
                <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="Google Authenticator QR" className="w-[184px] h-[184px] object-contain" />
              ) : (
                <span className="text-xs text-rose-500">{isFa ? 'خطا در نمایش QR' : 'QR unavailable'}</span>
              )}
            </div>

            {secret && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-dim block">
                  {isFa ? 'یا وارد کردن دستی کلید محرمانه:' : 'Or enter setup key manually:'}
                </span>
                <div className="flex items-center gap-1.5" dir="ltr">
                  <code className="flex-1 px-2.5 py-2 rounded-xl bg-black/25 border hairline text-[11px] font-mono-num text-jade truncate select-all">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copySecret()}
                    className="p-2 rounded-xl btn-ghost shrink-0"
                    title={isFa ? 'کپی کلید' : 'Copy key'}
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-jade" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <label className="text-[11px] font-black text-main flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-jade" />
                <span>{isFa ? 'کد ۶ رقمی Google Authenticator:' : '6-Digit Authenticator Code:'}</span>
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                maxLength={6}
                dir="ltr"
                value={totpCode}
                onChange={(e) => setTotpCode(normalizeDigits(e.target.value))}
                placeholder="000000"
                className="field text-center text-xl font-mono-num tracking-[0.4em] py-2.5"
              />
            </div>
          </div>

          {/* Right/Bottom Column: New Admin Credentials */}
          <div className="md:col-span-7 space-y-3.5">
            <div className="text-xs font-black text-main flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-brand" />
              <span>{isFa ? 'گام ۲: نام کاربری و رمز عبور جدید مدیر' : 'Step 2: New Admin Credentials'}</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-dim block">
                {isFa ? 'نام کاربری جدید (غیر از admin):' : 'New Username (not "admin"):'}
              </label>
              <div className="relative" dir="ltr">
                <User className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. avid_owner"
                  className="field pl-10 pr-3.5 text-xs text-left"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-dim block">
                  {isFa ? 'نام نمایشی (اختیاری):' : 'Display Name (optional):'}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={isFa ? 'مدیر سیستم' : 'Platform Owner'}
                  className="field px-3.5 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-dim block">
                  {isFa ? 'ایمیل مدیر (اختیاری):' : 'Admin Email (optional):'}
                </label>
                <div className="relative" dir="ltr">
                  <Mail className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@domain.com"
                    className="field pl-10 pr-3.5 text-xs text-left"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-dim block">
                {isFa ? 'رمز عبور جدید (حداقل ۶ کاراکتر):' : 'New Password (min 6 chars):'}
              </label>
              <div className="relative" dir="ltr">
                <Lock className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Strong password"
                  className="field pl-10 pr-3.5 text-xs text-left"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-dim block">
                {isFa ? 'تکرار رمز عبور جدید:' : 'Confirm New Password:'}
              </label>
              <div className="relative" dir="ltr">
                <Lock className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="field pl-10 pr-3.5 text-xs text-left"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-sub leading-relaxed">
              {isFa
                ? 'با ثبت این فرم، رمز دوم ثابت اولیه (admin123) برای همیشه حذف شده و در تمامی ورودهای بعدی فقط کد پویا ۶ رقمی Google Authenticator پذیرفته می‌شود.'
                : 'Submitting permanently retires the static secondary password (admin123) and enforces live Google Authenticator TOTP on every future login.'}
            </div>

            <button
              type="submit"
              disabled={saving || loadingQr}
              className="btn-gold w-full py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isFa
                  ? 'ذخیره اطلاعات امنیتی و ورود به پنل مدیریت'
                  : 'Save Admin Security & Enter Admin Panel'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
