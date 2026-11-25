import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Loader2, LogOut, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo } from '../lib/types';
import { DollarinoBrandMark } from './BrandGraphics';

interface CompleteProfileGateProps {
  lang: Lang;
  user: AuthUserInfo;
  onCompleted: (user: AuthUserInfo) => void;
  onLogout: () => void;
}

export function CompleteProfileGate({ lang, user, onCompleted, onLogout }: CompleteProfileGateProps) {
  const isFa = lang === 'fa';
  const [displayName, setDisplayName] = useState(user.display_name || user.telegram_first_name || '');
  const [username, setUsername] = useState(() => {
    const raw = user.username || '';
    if (/^(wallet_|tg_)/.test(raw)) return '';
    return raw.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 28);
  });
  const [email, setEmail] = useState(() =>
    user.email && !user.email.endsWith('.local') ? user.email : ''
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingUser, setCheckingUser] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clean = username.trim();
    if (!clean) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(clean)) {
      setUsernameAvailable(false);
      setUsernameError(isFa ? 'فقط ۳ تا ۳۲ حرف انگلیسی، عدد یا _ . - مجاز است.' : 'Use 3-32 chars (a-z, 0-9, _ . -).');
      return;
    }
    const timer = setTimeout(() => {
      setCheckingUser(true);
      setUsernameError(null);
      void apiFetch<{ ok: boolean; available: boolean; reason?: string }>(
        `/api/auth/check-username?username=${encodeURIComponent(clean)}`
      )
        .then((res) => {
          setUsernameAvailable(res.available);
          if (!res.available) {
            setUsernameError(res.reason || (isFa ? 'این نام کاربری قبلاً گرفته شده است.' : 'Username is already taken.'));
          }
        })
        .catch(() => {
          setUsernameAvailable(null);
        })
        .finally(() => setCheckingUser(false));
    }, 320);
    return () => clearTimeout(timer);
  }, [username, isFa]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) {
      setError(isFa ? 'لطفاً نام و نام خانوادگی (حداقل ۲ حرف) را وارد کنید.' : 'Enter your full name (at least 2 chars).');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
      setError(isFa ? 'نام کاربری معتبر نیست.' : 'Invalid username.');
      return;
    }
    if (usernameAvailable === false) {
      setError(usernameError || (isFa ? 'این نام کاربری قابل انتخاب نیست.' : 'Username unavailable.'));
      return;
    }
    if (password.length < 6) {
      setError(isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد.' : 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError(isFa ? 'رمز عبور و تکرار آن یکسان نیستند.' : 'Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; token?: string; user: AuthUserInfo }>('/api/auth/complete-profile', {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          password,
          ...(email.trim() ? { email: email.trim() } : {}),
        }),
      });
      if (res.token) setStoredToken(res.token);
      onCompleted(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : isFa ? 'خطا در ثبت اطلاعات' : 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  };

  const providerBadge =
    user.auth_provider === 'wallet'
      ? isFa
        ? 'ثبت‌نام با کیف‌پول Web3'
        : 'Wallet Sign-Up'
      : user.auth_provider === 'google'
        ? isFa
          ? 'ثبت‌نام با Google'
          : 'Google Sign-Up'
        : isFa
          ? 'ثبت‌نام با تلگرام'
          : 'Telegram Sign-Up';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex items-center justify-center p-4">
      <div className="panel rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl border border-[var(--gold)]/25">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarinoBrandMark size={40} glow />
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-jade border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" />
                {providerBadge}
              </span>
              <h1 className="text-lg font-display font-black text-main mt-1">
                {isFa ? 'تکمیل مشخصات حساب کاربری' : 'Complete Your Trading Profile'}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="btn-ghost p-2 rounded-xl text-dim hover:text-main"
            title={isFa ? 'خروج' : 'Logout'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-dim leading-relaxed">
          {isFa
            ? 'برای ورود به میز کار معاملاتی و فعال‌سازی ورود با نام کاربری و رمز عبور، لطفاً نام، نام کاربری یکتا و رمز عبور شخصی خود را تعیین کنید.'
            : 'Please choose your display name, a unique username, and a personal password so you can also sign in directly anytime.'}
        </p>

        {user.trust_wallet_address && (
          <div className="rounded-xl p-2.5 bg-black/20 border border-white/10 text-[11px] text-dim flex items-center justify-between gap-2">
            <span>{isFa ? 'ولت تاییدشده:' : 'Verified Wallet:'}</span>
            <span dir="ltr" className="font-mono text-jade font-bold">
              {user.trust_wallet_address.slice(0, 8)}...{user.trust_wallet_address.slice(-6)}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-[11px] font-bold text-dim block mb-1">
              {isFa ? 'نام و نام خانوادگی (نام نمایشی)' : 'Full Name / Display Name'}
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isFa ? 'مثلاً: آوید کیا' : 'e.g. Alex Trader'}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm field"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-dim block mb-1">
              {isFa ? 'نام کاربری منحصربه‌فرد (انگلیسی)' : 'Unique Username'}
            </label>
            <div className="relative">
              <input
                type="text"
                dir="ltr"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                placeholder="trader_pro_2026"
                className="w-full rounded-xl px-3.5 py-2.5 pe-10 text-sm field font-mono"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2">
                {checkingUser ? (
                  <Loader2 className="w-4 h-4 animate-spin text-dim" />
                ) : usernameAvailable === true ? (
                  <CheckCircle2 className="w-4 h-4 text-jade" />
                ) : usernameAvailable === false ? (
                  <XCircle className="w-4 h-4 text-loss" />
                ) : null}
              </span>
            </div>
            {usernameError && <p className="text-[11px] text-loss mt-1">{usernameError}</p>}
            {usernameAvailable === true && !usernameError && (
              <p className="text-[11px] text-jade mt-1">
                {isFa ? 'این نام کاربری آزاد و قابل انتخاب است.' : 'Username is available.'}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-dim block mb-1">
              {isFa ? 'ایمیل شخصی (اختیاری)' : 'Personal Email (Optional)'}
            </label>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">
                {isFa ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'Password (min 6 chars)'}
              </label>
              <input
                type="password"
                dir="ltr"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm field"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">
                {isFa ? 'تکرار رمز عبور' : 'Confirm Password'}
              </label>
              <input
                type="password"
                dir="ltr"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm field"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl p-2.5 bg-rose-500/10 border border-rose-500/30 text-xs text-loss font-semibold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || checkingUser || usernameAvailable === false}
            className="w-full btn-gold py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            <span>{isFa ? 'ثبت نهایی و ورود به داشبورد' : 'Save & Enter Dashboard'}</span>
          </button>

          <p className="text-[10px] text-dim text-center flex items-center justify-center gap-1">
            <KeyRound className="w-3 h-3" />
            {isFa
              ? 'پس از تکمیل می‌توانید در بخش خدمات، تایید دوعاملی Google Authenticator (2FA) را نیز فعال کنید.'
              : 'You can enable Google Authenticator 2FA anytime in Services settings.'}
          </p>
        </form>
      </div>
    </div>
  );
}
