import { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Globe, Lock, Mail, Moon, Send, ShieldCheck, Sun, User } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { DollarinoBrandMark } from '../components/BrandGraphics';

export function AuthPage({
  lang,
  setLang,
  isLight,
  onToggleDaylight,
  initialMode = 'login',
  externalError,
  onBack,
  onSuccess,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  isLight: boolean;
  onToggleDaylight: () => void;
  initialMode?: 'login' | 'register';
  externalError?: string | null;
  onBack?: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() =>
    typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('ref') || '').trim().toUpperCase() : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    apiFetch<{ ok: boolean }>('/api/health')
      .then((r) => setApiReady(Boolean(r.ok)))
      .catch(() => setApiReady(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail.includes('@')) {
        throw new Error(lang === 'fa' ? 'لطفاً یک ایمیل معتبر وارد کنید' : 'Please enter a valid email address');
      }
      if (password.length < 6) {
        throw new Error(lang === 'fa' ? 'رمز عبور باید حداقل ۶ رقم یا حرف باشد' : 'Password must be at least 6 characters');
      }
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const cleanRef = referralCode.trim().toUpperCase();
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email: cleanEmail,
          username: username.trim(),
          password,
          referralCode: mode === 'register' && cleanRef ? cleanRef : undefined,
        }),
      });
      setStoredToken(res.token);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const shownError = error || externalError;
  const isFa = lang === 'fa';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[430px] space-y-4">
        <div className="flex items-center justify-between text-xs">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-dim hover:text-main font-bold transition">
              <ArrowLeft className={`w-4 h-4 ${isFa ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'صفحه اصلی' : 'Home'}</span>
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onToggleDaylight} className="p-2 rounded-xl btn-ghost" aria-label="Toggle theme">
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#f7c85c]" />}
            </button>
            <button type="button" onClick={() => setLang(isFa ? 'en' : 'fa')} className="px-3 py-2 rounded-xl btn-ghost text-main font-bold inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'English' : 'فارسی'}</span>
            </button>
          </div>
        </div>

        <div className="panel rounded-[28px] p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DollarinoBrandMark size={44} glow />
              <div>
                <h1 className="font-display font-bold text-xl text-main">Dollarino</h1>
                <p className="text-xs text-dim">{isFa ? 'میز معامله هوشمند و کپی‌ترید' : 'Autonomous Trading OS'}</p>
              </div>
            </div>
            {apiReady !== null && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${apiReady ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                {apiReady ? (isFa ? 'سرور آنلاین' : 'Online') : isFa ? 'خطای سرور' : 'Offline'}
              </span>
            )}
          </div>

          <a
            href="https://t.me/Dollarino_bot?start=web_auth"
            target="_blank"
            rel="noreferrer"
            className="btn-cobalt w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>
              {isFa ? (
                <>
                  ورود و ثبت‌نام ۱-کلیکی با ربات تلگرام (<span dir="ltr" className="inline-block font-mono-num">@Dollarino_bot</span>)
                </>
              ) : (
                '1-Click Sign In via @Dollarino_bot'
              )}
            </span>
          </a>

          <div className="flex items-center gap-2 text-[11px] text-dim">
            <div className="h-px flex-1 bg-white/10" />
            <span>{isFa ? 'یا با ایمیل خود وارد شوید' : 'or sign in with email'}</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 p-1 rounded-2xl surface-soft gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'register' ? 'btn-gold' : 'text-dim hover:text-main'}`}
            >
              {isFa ? 'ثبت‌نام حساب کاربری' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'login' ? 'btn-gold' : 'text-dim hover:text-main'}`}
            >
              {isFa ? 'ورود به حساب' : 'Sign In'}
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div className="relative">
                  <User className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={isFa ? 'نام نمایشی (اختیاری)' : 'Display Name (optional)'}
                    className="field ps-10 text-xs"
                  />
                </div>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-jade absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    dir="ltr"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder={isFa ? 'کد معرف / دعوت (اختیاری - مثلا DLR-XXXX)' : 'Referral Code (optional)'}
                    className="field ps-10 text-xs font-mono-num"
                  />
                </div>
                {referralCode.trim() && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-[11px] font-bold text-jade">
                    {isFa
                      ? `🎁 کد معرف ${referralCode.trim()} روی حساب شما ثبت می‌شود.`
                      : `🎁 Referral code ${referralCode.trim()} will be applied.`}
                  </div>
                )}
              </>
            )}

            <div className="relative">
              <Mail className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field ps-10 text-xs"
              />
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isFa ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'Password (min 6 chars)'}
                className="field ps-10 text-xs"
              />
            </div>

            {shownError && <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-loss">{shownError}</div>}

            <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 rounded-2xl text-xs font-black">
              {loading ? '...' : mode === 'register' ? (isFa ? 'ساخت حساب و ورود به پنل' : 'Create Account & Continue') : isFa ? 'ورود به میز کار' : 'Enter Workspace'}
            </button>
          </form>

          <p className="text-[11px] text-dim flex items-center justify-center gap-1.5 pt-1 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-jade shrink-0" />
            <span>{isFa ? 'برای استفاده از معامله اتومات، هوش مصنوعی من و کپی‌ترید، فعال‌سازی اشتراک الزامی است.' : 'Active subscription is required to start automated trading & Copy Trade.'}</span>
          </p>
          <p className="text-[10px] text-dim flex items-center justify-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-brand shrink-0" />
            <span dir="ltr">@Dollarino_bot · @Dollarino_official</span>
          </p>
        </div>
      </div>
    </div>
  );
}
