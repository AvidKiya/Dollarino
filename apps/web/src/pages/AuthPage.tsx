import { useEffect, useState } from 'react';
import { Bot, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function AuthPage({
  lang,
  setLang,
  externalError,
  onSuccess,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  externalError?: string | null;
  onSuccess: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

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

  return (
    <div
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#080a0f] flex items-center justify-center p-4 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(76,124,243,0.14),transparent_55%)] pointer-events-none" />

      <div className="w-full max-w-md bg-[#0f131b] border border-slate-800 rounded-2xl p-7 shadow-2xl relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center">
              <Bot className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {lang === 'fa' ? 'دلارینو (Dollarino)' : 'Dollarino Platform'}
              </h1>
              <p className="text-xs text-emerald-400 font-medium">
                {lang === 'fa'
                  ? '۱۰۰٪ رایگان و اوپن‌سورس · بدون اشتراک پولی'
                  : '100% Free & Open-Source · No Subscriptions'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
          >
            {lang === 'fa' ? 'EN' : 'فارسی'}
          </button>
        </div>

        {apiReady === false && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            {lang === 'fa'
              ? 'سرور API در حال راه‌اندازی یا غیرفعال است. چند لحظه صبر کنید یا صفحه را رفرش کنید.'
              : 'Backend API server is unreachable right now. Please refresh in a moment.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`py-2 rounded-lg text-sm font-medium transition ${
              mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'fa' ? 'ورود به حساب' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`py-2 rounded-lg text-sm font-medium transition ${
              mode === 'register' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'fa' ? 'ثبت‌نام رایگان' : 'Create Account'}
          </button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {lang === 'fa' ? 'نام کاربری (دلخواه)' : 'Username (optional)'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute top-3 start-3" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="trader_ali"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 ps-9 pe-3 text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              {lang === 'fa' ? 'ایمیل' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute top-3 start-3" />
              <input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 ps-9 pe-3 text-sm focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              {lang === 'fa' ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'Password (min 6 chars)'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute top-3 start-3" />
              <input
                type="password"
                dir="ltr"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 ps-9 pe-3 text-sm focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {shownError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {shownError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm transition"
          >
            {loading
              ? '...'
              : mode === 'login'
                ? lang === 'fa' ? 'ورود به دلارینو' : 'Sign In'
                : lang === 'fa' ? 'ساخت حساب رایگان' : 'Create Free Account'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            {lang === 'fa'
              ? 'پشتیبانی کامل از Toobit · KCEX · Bitunix · شبیه‌ساز زنده، میکسر ۸ کاناله، چارت AI و موتور ۳ تارگت ریسک‌فری با رمزنگاری AES-256-GCM.'
              : 'Full Toobit · KCEX · Bitunix · Live Paper Sim, 8-Channel Signal Mixer, Chart AI, & 3-TP Risk-Free Engine encrypted with AES-256-GCM.'}
          </span>
        </div>
      </div>
    </div>
  );
}
