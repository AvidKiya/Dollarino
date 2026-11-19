import { useEffect, useState } from 'react';
import { ArrowLeft, Globe, Lock, Mail, Moon, ShieldCheck, Sparkles, Sun, User } from 'lucide-react';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function AuthPage({
  lang,
  setLang,
  theme,
  setTheme,
  initialMode = 'login',
  externalError,
  onBack,
  onSuccess,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  initialMode?: 'login' | 'register';
  externalError?: string | null;
  onBack?: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
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
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, username: username.trim(), password }),
      });
      setStoredToken(res.token);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const quickStartDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/quick-demo', {
        method: 'POST',
      });
      setStoredToken(res.token);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick demo failed');
    } finally {
      setDemoLoading(false);
    }
  };

  const shownError = error || externalError;
  const isFa = lang === 'fa';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[430px] space-y-4">
        <div className="flex items-center justify-between text-xs">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sub hover:text-main font-bold transition"
            >
              <ArrowLeft className={`w-4 h-4 ${isFa ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'صفحه اصلی' : 'Home'}</span>
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl surface-card"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-[#FF8A00]" /> : <Moon className="w-4 h-4 text-[#0C44C8]" />}
            </button>
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="px-3 py-2 rounded-xl surface-card text-main font-bold inline-flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-brand" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
          </div>
        </div>

        <div className="surface-card rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="text-center space-y-2.5">
            <div className="flex justify-center">
              <DollarinoBrandMark size={74} glow />
            </div>
            <div>
              <h1 className="text-xl font-black text-main">
                {mode === 'login'
                  ? isFa ? 'خوش آمدید به دلارینو' : 'Welcome to Dollarino'
                  : isFa ? 'ساخت حساب در ۱۰ ثانیه' : 'Start Trading in 10 Seconds'}
              </h1>
              <p className="text-xs text-sub mt-1 leading-relaxed">
                {isFa
                  ? 'ربات معامله‌گر خودکار برای همه — بدون نیاز به دانش ترید یا تنظیمات پیچیده'
                  : 'Effortless automated crypto trading — built for complete beginners'}
              </p>
            </div>
          </div>

          {/* Kifpool-inspired 1-Tap Instant Free Demo */}
          <button
            type="button"
            disabled={demoLoading || loading}
            onClick={quickStartDemo}
            className="w-full py-3.5 px-4 rounded-2xl btn-emerald font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition hover:brightness-105 disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {demoLoading
                ? '...'
                : isFa
                  ? 'ورود سریع و تست رایگان با ۱۰,۰۰۰ دلار مجازی'
                  : '1-Tap Instant Free Demo ($10,000 Virtual)'}
            </span>
          </button>

          <div className="flex items-center gap-3 text-[11px] text-dim">
            <div className="flex-1 h-px bg-current opacity-20" />
            <span>{isFa ? 'یا ورود با حساب شخصی' : 'or sign in with your account'}</span>
            <div className="flex-1 h-px bg-current opacity-20" />
          </div>

          {apiReady === false && (
            <div className="p-3 rounded-xl bg-[#FF8A00]/15 border border-[#FF8A00]/35 text-xs text-flame font-semibold">
              {isFa ? 'سرور موقتاً در حال راه‌اندازی است.' : 'Server is warming up.'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 p-1 surface-soft rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-extrabold transition ${
                mode === 'login' ? 'btn-cobalt' : 'text-sub hover:text-main'
              }`}
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 rounded-xl text-xs font-extrabold transition ${
                mode === 'register' ? 'btn-cobalt' : 'text-sub hover:text-main'
              }`}
            >
              {isFa ? 'ثبت‌نام' : 'Create Account'}
            </button>
          </div>

          <form onSubmit={submit} noValidate className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-sub mb-1.5">
                  {isFa ? 'نام شما (اختیاری)' : 'Your Name (optional)'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-dim absolute top-3 start-3.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={isFa ? 'مثلاً علی رضایی' : 'Alex'}
                    className="w-full surface-input rounded-2xl py-2.5 ps-10 pe-3 text-xs outline-none focus:border-brand"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-sub mb-1.5">
                {isFa ? 'ایمیل' : 'Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-dim absolute top-3 start-3.5" />
                <input
                  type="email"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full surface-input rounded-2xl py-2.5 ps-10 pe-3 text-xs outline-none focus:border-brand"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-sub mb-1.5">
                {isFa ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'Password (min 6 chars)'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-dim absolute top-3 start-3.5" />
                <input
                  type="password"
                  dir="ltr"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full surface-input rounded-2xl py-2.5 ps-10 pe-3 text-xs outline-none focus:border-brand"
                />
              </div>
            </div>

            {shownError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-500 font-semibold">
                {shownError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || demoLoading}
              className="w-full py-3.5 rounded-2xl btn-cobalt disabled:opacity-60 font-black text-xs"
            >
              {loading
                ? '...'
                : mode === 'login'
                  ? isFa ? 'ورود به حساب من' : 'Sign In'
                  : isFa ? 'ساخت حساب و شروع' : 'Create Account'}
            </button>
          </form>

          <div className="pt-3 border-t flex items-center gap-2 text-[11px] text-dim">
            <ShieldCheck className="w-4 h-4 text-signal shrink-0" />
            <span>
              {isFa
                ? 'هوش مصنوعی مرکزی آماده و متصل است · شروع بدون نیاز به خرید API یا سرمایه اولیه'
                : 'Central AI Engine ready — zero API setup or upfront deposit required'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
