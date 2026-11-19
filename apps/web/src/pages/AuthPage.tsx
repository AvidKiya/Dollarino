import { useEffect, useState } from 'react';
import { ArrowLeft, Globe, Lock, Mail, Moon, ShieldCheck, Sun, User } from 'lucide-react';
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
        throw new Error(lang === 'fa' ? 'رمز عبور باید حداقل ۶ کاراکتر باشد' : 'Password must be at least 6 characters');
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

  const shownError = error || externalError;
  const isFa = lang === 'fa';

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className={`min-h-screen bg-[#080a0e] flex flex-col items-center justify-center p-4 relative overflow-hidden ${
        theme === 'light' ? 'theme-light' : ''
      }`}
    >
      <div className="w-full max-w-[430px] relative z-10 space-y-4">
        <div className="flex items-center justify-between text-xs">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[#8f99aa] hover:text-white transition"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${isFa ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'بازگشت به صفحه اصلی' : 'Back to Home'}</span>
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-xl bg-[#10141d] border border-[#222836]"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-[#f59f14]" /> : <Moon className="w-3.5 h-3.5 text-[#2563eb]" />}
            </button>
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="px-2.5 py-1.5 rounded-xl bg-[#10141d] border border-[#222836] text-[#c5cede] inline-flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
          </div>
        </div>

        <div className="card-tt p-6 sm:p-8 rounded-3xl border-[#1d2330] shadow-2xl space-y-5">
          <div className="text-center space-y-2.5">
            <img src="/icons/icon-192.png" alt="Dollarino" className="w-14 h-14 mx-auto rounded-2xl shadow-lg" />
            <div>
              <h1 className="text-xl font-extrabold text-white">
                {mode === 'login'
                  ? isFa ? 'ورود به دلارینو' : 'Welcome back to Dollarino'
                  : isFa ? 'ثبت‌نام و شروع تست دمو' : 'Create Your Dollarino Account'}
              </h1>
              <p className="text-xs text-[#6c7689] mt-1">
                {mode === 'login'
                  ? isFa ? 'ترید هوش مصنوعی، CodexBot و کپی‌ترید تلگرام' : 'AI Trading, CodexBot & Telegram Copy-Trade'
                  : isFa ? 'شروع با حساب دمو Paper + اشتراک‌های حرفه‌ای Toobit و KCEX' : 'Start with Paper Demo + Pro plans for Toobit & KCEX'}
              </p>
            </div>
          </div>

          {apiReady === false && (
            <div className="p-3 rounded-xl bg-[#f59f14]/10 border border-[#f59f14]/30 text-xs text-[#f59f14]">
              {isFa
                ? 'سرور API در حال راه‌اندازی یا موقتاً غیرفعال است.'
                : 'Backend API server is currently unreachable. Please refresh shortly.'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#080a0e] rounded-2xl border border-[#1a1f2b]">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                mode === 'login' ? 'bg-[#2563eb] text-white shadow' : 'text-[#6c7689] hover:text-white'
              }`}
            >
              {isFa ? 'ورود به حساب' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                mode === 'register' ? 'bg-[#2563eb] text-white shadow' : 'text-[#6c7689] hover:text-white'
              }`}
            >
              {isFa ? 'ثبت‌نام' : 'Create Account'}
            </button>
          </div>

          <form onSubmit={submit} noValidate className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-[11px] text-[#8f99aa] mb-1.5">
                  {isFa ? 'نام کاربری (دلخواه)' : 'Username (optional)'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#6c7689] absolute top-3 start-3" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="trader_ali"
                    className="w-full bg-[#080a0e] border border-[#1f2533] rounded-xl py-2.5 ps-9 pe-3 text-xs text-white focus:border-[#2563eb] outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-[#8f99aa] mb-1.5">
                {isFa ? 'ایمیل' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#6c7689] absolute top-3 start-3" />
                <input
                  type="email"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#080a0e] border border-[#1f2533] rounded-xl py-2.5 ps-9 pe-3 text-xs text-white focus:border-[#2563eb] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#8f99aa] mb-1.5">
                {isFa ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'Password (min 6 chars)'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#6c7689] absolute top-3 start-3" />
                <input
                  type="password"
                  dir="ltr"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#080a0e] border border-[#1f2533] rounded-xl py-2.5 ps-9 pe-3 text-xs text-white focus:border-[#2563eb] outline-none"
                />
              </div>
            </div>

            {shownError && (
              <div className="p-3 rounded-xl bg-[#eb493d]/10 border border-[#eb493d]/35 text-xs text-[#eb493d]">
                {shownError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition"
            >
              {loading
                ? '...'
                : mode === 'login'
                  ? isFa ? 'ورود به پنل ترید' : 'Sign In'
                  : isFa ? 'ساخت حساب و شروع تست دمو' : 'Create Account & Start Demo'}
            </button>
          </form>

          <div className="pt-3 border-t border-[#181d28] flex items-start gap-2 text-[11px] text-[#6c7689]">
            <ShieldCheck className="w-4 h-4 text-[#27cd86] shrink-0 mt-0.5" />
            <span>
              {isFa
                ? 'کلیدهای صرافی Toobit / KCEX و هوش مصنوعی DeepSeek / Claude / GPT با رمزنگاری AES-256-GCM محافظت می‌شوند.'
                : 'Toobit, KCEX & AI keys are protected with AES-256-GCM encryption. Paper Demo included free.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
