import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  User,
  Wallet,
} from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import {
  buildTrustWalletDappOpenUrl,
  connectAllWalletChains,
  hasAnyInjectedWallet,
  isMobileWalletPlatform,
  signTrustWalletNonce,
} from '../lib/trustwallet';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { WalletLogo } from '../components/BrandLogos';

function GoogleColorLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function AuthPage({
  lang,
  setLang,
  isLight,
  onToggleDaylight,
  initialMode = 'register',
  initial2faToken = null,
  externalError,
  onBack,
  onSuccess,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  isLight: boolean;
  onToggleDaylight: () => void;
  initialMode?: 'login' | 'register';
  initial2faToken?: string | null;
  externalError?: string | null;
  onBack?: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() =>
    typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('ref') || '').trim().toUpperCase() : ''
  );
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twDappDeepLink, setTwDappDeepLink] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<{
    googleConfigured: boolean;
    googleClientId?: string | null;
    defaultAdminReferralCode?: string | null;
  }>({
    googleConfigured: false,
  });
  const [challengeToken, setChallengeToken] = useState<string | null>(initial2faToken);
  const [totpCode, setTotpCode] = useState('');
  const [verifying2fa, setVerifying2fa] = useState(false);
  const autoTwSignupTriggeredRef = useRef(false);

  const isSidePanelEmbed =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('embed') === 'sidepanel' ||
      sessionStorage.getItem('dollarino_embed_sidepanel') === '1' ||
      window.self !== window.top);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initial2faToken) setChallengeToken(initial2faToken);
  }, [initial2faToken]);

  useEffect(() => {
    apiFetch<{ ok: boolean }>('/api/health')
      .then((r) => setApiReady(Boolean(r.ok)))
      .catch(() => setApiReady(false));
    apiFetch<{
      googleConfigured?: boolean;
      googleEnabled?: boolean;
      googleClientId?: string | null;
      defaultAdminReferralCode?: string | null;
    }>('/api/auth/providers')
      .then((p) =>
        setProviders({
          googleConfigured: Boolean(p.googleConfigured ?? p.googleEnabled),
          googleClientId: p.googleClientId ?? null,
          defaultAdminReferralCode: p.defaultAdminReferralCode ?? null,
        })
      )
      .catch(() => {});
  }, []);

  const cleanRef = referralCode.trim().replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  const telegramBotUrl = cleanRef
    ? `https://t.me/Dollarino_bot?start=${encodeURIComponent(`web_auth__REF_${cleanRef}`)}`
    : 'https://t.me/Dollarino_bot?start=web_auth';

  const handleWalletAuth = useCallback(async () => {
    setError(null);
    setTwDappDeepLink(null);
    setWalletLoading(true);
    try {
      if (!hasAnyInjectedWallet()) {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dollarino.pages.dev';
        const target = new URL(origin);
        target.searchParams.set('auth_screen', '1');
        target.searchParams.set('auth_mode', 'register');
        target.searchParams.set('tw_signup', '1');
        if (cleanRef) target.searchParams.set('ref', cleanRef);
        const dappUrl = buildTrustWalletDappOpenUrl(target.toString());
        setTwDappDeepLink(dappUrl);
        if (isMobileWalletPlatform() && !isSidePanelEmbed) {
          window.location.href = dappUrl;
          return;
        }
        window.open(dappUrl, '_blank', 'noopener,noreferrer');
        setError(
          isFa
            ? 'برای ثبت‌نام مستقیم با کیف‌پول، سایت مستقیماً در مرورگر DApps تراست‌ولت باز شد. داخل Trust Wallet گزینه Confirm / Sign را بزنید.'
            : 'Opened Dollarino directly inside Trust Wallet DApp Browser. Confirm the wallet signature there to complete registration.'
        );
        return;
      }

      const all = await connectAllWalletChains();
      if (!all.evmAddress) {
        throw new Error(
          isFa
            ? 'آدرس EVM کیف‌پول برای امضای احراز هویت دریافت نشد. لطفاً کیف‌پول خود را باز و تایید کنید.'
            : 'EVM wallet address is required for authentication signature.'
        );
      }

      const nonceRes = await apiFetch<{ ok: boolean; nonce: string; message: string }>('/api/auth/wallet/nonce', {
        method: 'POST',
        body: JSON.stringify({ address: all.evmAddress }),
      });

      const signature = await signTrustWalletNonce(all.evmAddress, nonceRes.message);
      const res = await apiFetch<{
        token?: string;
        requires2fa?: boolean;
        challengeToken?: string;
      }>('/api/auth/wallet/verify', {
        method: 'POST',
        body: JSON.stringify({
          address: all.evmAddress,
          signature,
          nonce: nonceRes.nonce,
          solanaAddress: all.solanaAddress || undefined,
          tronAddress: all.tronAddress || undefined,
          tonAddress: all.tonAddress || undefined,
          referralCode: cleanRef || undefined,
        }),
      });

      if (res.requires2fa && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        return;
      }
      if (res.token) {
        setStoredToken(res.token);
        await onSuccess();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'USER_REJECTED') {
        setError(isFa ? 'امضای کیف‌پول توسط شما لغو شد.' : 'Wallet signature was rejected.');
      } else {
        setError(msg);
      }
    } finally {
      setWalletLoading(false);
    }
  }, [cleanRef, isFa, isSidePanelEmbed, onSuccess]);

  useEffect(() => {
    if (typeof window === 'undefined' || autoTwSignupTriggeredRef.current) return;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tw_signup') !== '1') return;
    if (!hasAnyInjectedWallet()) return;
    autoTwSignupTriggeredRef.current = true;
    qp.delete('tw_signup');
    const nextQ = qp.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${nextQ ? `?${nextQ}` : ''}`);
    void handleWalletAuth();
  }, [handleWalletAuth]);

  const handleGoogleAuth = () => {
    setError(null);
    if (!providers.googleConfigured) {
      setError(
        isFa
          ? 'ورود با Google هنوز توسط مدیریت در تنظیمات سرور پیکربندی نشده است. از کیف‌پول دیجیتال یا ربات تلگرام استفاده کنید.'
          : 'Google OAuth is not configured by the administrator yet. Please sign up via Web3 Wallet or Telegram Bot.'
      );
      return;
    }
    setGoogleLoading(true);
    const params = new URLSearchParams();
    if (cleanRef) params.set('ref', cleanRef);
    const qs = params.toString();
    const startUrl = `/api/auth/google/start${qs ? `?${qs}` : ''}`;
    if (isSidePanelEmbed) {
      window.open(`${window.location.origin}${startUrl}`, '_blank', 'noopener,noreferrer');
      setGoogleLoading(false);
      return;
    }
    window.location.href = startUrl;
  };

  const submitPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cleanId = identifier.trim();
      if (cleanId.length < 2) {
        throw new Error(isFa ? 'لطفاً ایمیل یا نام کاربری خود را وارد کنید.' : 'Enter your email or username.');
      }
      if (password.length < 6) {
        throw new Error(isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد.' : 'Password must be at least 6 characters.');
      }
      const res = await apiFetch<{
        token?: string;
        requires2fa?: boolean;
        challengeToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: cleanId, password }),
      });

      if (res.requires2fa && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        return;
      }
      if (res.token) {
        setStoredToken(res.token);
        await onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const submit2faVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setVerifying2fa(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; token: string }>('/api/auth/2fa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code: totpCode.trim() }),
      });
      setStoredToken(res.token);
      setChallengeToken(null);
      setTotpCode('');
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : isFa ? 'کد تایید نامعتبر است' : 'Invalid 2FA code');
    } finally {
      setVerifying2fa(false);
    }
  };

  const shownError = error || externalError;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[470px] space-y-4">
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
                <p className="text-xs text-dim">
                  {challengeToken
                    ? isFa
                      ? 'احراز هویت دوعاملی Google Authenticator'
                      : 'Two-Factor Authentication'
                    : isFa
                      ? 'ثبت‌نام و ورود چندمسیره (کیف‌پول، گوگل، تلگرام)'
                      : 'Wallet, Google & Telegram Onboarding'}
                </p>
              </div>
            </div>
            {apiReady !== null && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${apiReady ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                {apiReady ? (isFa ? 'سرور آنلاین' : 'Online') : isFa ? 'خطای سرور' : 'Offline'}
              </span>
            )}
          </div>

          {shownError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-loss space-y-2">
              <p>{shownError}</p>
              {twDappDeepLink && (
                <a
                  href={twDappDeepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-jade border border-emerald-500/40 text-[11px] font-black"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isFa ? 'باز کردن مستقیم در DApps تراست‌ولت' : 'Open Directly in Trust Wallet DApps'}</span>
                </a>
              )}
            </div>
          )}

          {challengeToken ? (
            <form onSubmit={submit2faVerify} className="space-y-4">
              <div className="surface-soft rounded-2xl p-4 border hairline space-y-2">
                <div className="flex items-center gap-2 text-sm font-black text-main">
                  <Smartphone className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'کد ۶ رقمی تایید دوعاملی را وارد کنید' : 'Enter 6-Digit Authenticator Code'}</span>
                </div>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'برنامه Google Authenticator (یا Authy) را باز کرده و کد ۶ رقمی حساب دلارینو را وارد نمایید.'
                    : 'Open Google Authenticator and enter the 6-digit verification code for your Dollarino account.'}
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                dir="ltr"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="field text-center text-2xl font-mono-num tracking-[0.45em] py-3"
              />

              <button
                type="submit"
                disabled={verifying2fa || totpCode.trim().length !== 6}
                className="btn-gold w-full py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {verifying2fa && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isFa ? 'تایید و ورود امن به حساب' : 'Verify & Sign In'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setTotpCode('');
                  setError(null);
                }}
                className="w-full py-2 text-[11px] font-bold text-dim hover:text-main"
              >
                {isFa ? 'بازگشت به روش‌های ورود' : 'Back to Login Options'}
              </button>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-2 p-1 rounded-2xl surface-soft gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'register' ? 'btn-gold' : 'text-dim hover:text-main'}`}
                >
                  {isFa ? 'ثبت‌نام سریع (۳ روش)' : 'Quick Sign Up (3 Ways)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'login' ? 'btn-gold' : 'text-dim hover:text-main'}`}
                >
                  {isFa ? 'ورود با نام کاربری / ایمیل' : 'Username / Email Login'}
                </button>
              </div>

              {mode === 'register' ? (
                <div className="space-y-3.5">
                  <div className="surface-soft rounded-2xl p-3.5 border hairline text-[11px] text-sub leading-relaxed flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-jade shrink-0 mt-0.5" />
                    <span>
                      {isFa
                        ? 'ثبت‌نام مستقیم و تاییدشده فقط از طریق یکی از ۳ روش زیر انجام می‌شود؛ سپس نام، نام کاربری یکتا و رمز عبور دلخواه خود را تعیین می‌کنید.'
                        : 'Sign up seamlessly via Web3 Wallet, Google, or Telegram Bot, then pick your unique username and personal password.'}
                    </span>
                  </div>

                  {/* Method 1: Web3 / Trust Wallet */}
                  <button
                    type="button"
                    onClick={() => void handleWalletAuth()}
                    disabled={walletLoading}
                    className="w-full rounded-2xl p-3.5 bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/35 text-start flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 grid place-items-center shrink-0">
                        <WalletLogo wallet="trustwallet" size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-main flex items-center gap-1.5">
                          <span>{isFa ? 'ثبت‌نام با کیف‌پول دیجیتال (Trust Wallet / Web3)' : 'Continue with Web3 / Trust Wallet'}</span>
                        </div>
                        <p className="text-[11px] text-dim truncate">
                          {isFa ? 'امضای رایگان EIP-191 بدون کارمزد شبکه و اتصال خودکار' : 'Free EIP-191 cryptographic signature — 0 gas'}
                        </p>
                      </div>
                    </div>
                    {walletLoading ? <Loader2 className="w-4 h-4 animate-spin text-jade shrink-0" /> : <Wallet className="w-4 h-4 text-jade shrink-0" />}
                  </button>

                  {/* Method 2: Google Account */}
                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={googleLoading}
                    className={`w-full rounded-2xl p-3.5 border text-start flex items-center justify-between gap-3 transition ${
                      providers.googleConfigured
                        ? 'bg-white/10 hover:bg-white/15 border-white/25'
                        : 'surface-soft border-white/10 opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white grid place-items-center shrink-0 shadow-sm">
                        <GoogleColorLogo size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-main flex items-center gap-1.5">
                          <span>{isFa ? 'ثبت‌نام / ورود با حساب Google' : 'Continue with Google'}</span>
                          {!providers.googleConfigured && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-[#F59E0B] font-bold">
                              {isFa ? 'در انتظار کلید OAuth' : 'Needs OAuth Key'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-dim truncate">
                          {isFa ? 'تایید آنی هویت با جیمیل شخصی شما' : 'Instant verified sign-in via your Gmail'}
                        </p>
                      </div>
                    </div>
                    {googleLoading ? <Loader2 className="w-4 h-4 animate-spin text-main shrink-0" /> : <ExternalLink className="w-4 h-4 text-dim shrink-0" />}
                  </button>

                  {/* Method 3: Telegram Bot */}
                  <a
                    href={telegramBotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full rounded-2xl p-3.5 bg-sky-500/12 hover:bg-sky-500/20 border border-sky-500/35 text-start flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/20 grid place-items-center shrink-0">
                        <Send className="w-5 h-5 text-sky-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-main flex items-center gap-1.5 flex-wrap">
                          <span>
                            {isFa ? (
                              <>
                                ثبت‌نام / ورود با ربات تلگرام <span dir="ltr" className="font-mono-num text-sky-400">@Dollarino_bot</span>
                              </>
                            ) : (
                              'Continue with @Dollarino_bot Telegram'
                            )}
                          </span>
                        </div>
                        <p className="text-[11px] text-dim truncate">
                          {isFa ? 'ورود تک‌لمسی امن بدون رمز و دریافت اعلان لحظه‌ای' : 'Instant 1-tap login & live Telegram trade alerts'}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sky-400 shrink-0" />
                  </a>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-dim block">
                      {isFa ? 'کد معرف یا دعوت (اختیاری):' : 'Referral Code (optional):'}
                    </label>
                    <div className="relative" dir="ltr">
                      <ShieldCheck className="w-4 h-4 text-jade absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        dir="ltr"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder={providers.defaultAdminReferralCode || 'DLRXHSOW'}
                        className="field pl-10 pr-3.5 text-xs font-mono-num text-left"
                      />
                    </div>
                    <p className="text-[10px] text-dim">
                      {isFa
                        ? `در صورت خالی ماندن، به‌صورت خودکار کد معرف مدیر${providers.defaultAdminReferralCode ? ` (${providers.defaultAdminReferralCode})` : ''} ثبت می‌شود.`
                        : `If left empty, the admin referral code${providers.defaultAdminReferralCode ? ` (${providers.defaultAdminReferralCode})` : ''} is applied automatically.`}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitPasswordLogin} className="space-y-3.5">
                  <div className="surface-soft rounded-2xl p-3 text-[11px] text-sub leading-relaxed flex items-start gap-2">
                    <KeyRound className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                    <span>
                      {isFa
                        ? 'با ایمیل یا نام کاربری اختصاصی و رمز عبوری که در تکمیل ثبت‌نام تنظیم کرده‌اید وارد شوید:'
                        : 'Sign in with your username or email and personal password:'}
                    </span>
                  </div>

                  <div className="relative" dir="ltr">
                    <User className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={isFa ? 'نام کاربری یا ایمیل (e.g. trader_pro)' : 'Username or email'}
                      className="field pl-10 pr-3.5 text-xs text-left"
                    />
                  </div>

                  <div className="relative" dir="ltr">
                    <Lock className="w-4 h-4 text-dim absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isFa ? 'رمز عبور' : 'Password'}
                      className="field pl-10 pr-3.5 text-xs text-left"
                    />
                  </div>

                  <button type="submit" disabled={loading} className="btn-gold w-full py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{isFa ? 'ورود به میز کار دلارینو' : 'Enter Workspace'}</span>
                  </button>

                  <div className="relative py-1 flex items-center justify-center">
                    <div className="border-t hairline w-full" />
                    <span className="px-2.5 text-[10px] font-bold text-dim bg-[var(--panel)] shrink-0">
                      {isFa ? 'یا ورود یک‌کلیکی با' : 'OR QUICK SIGN IN WITH'}
                    </span>
                    <div className="border-t hairline w-full" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWalletAuth()}
                      disabled={walletLoading}
                      className="py-2.5 px-2 rounded-xl surface-soft hover:bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-main flex items-center justify-center gap-1.5"
                    >
                      <WalletLogo wallet="trustwallet" size={16} />
                      <span>{isFa ? 'کیف‌پول' : 'Wallet'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGoogleAuth}
                      className="py-2.5 px-2 rounded-xl surface-soft hover:bg-white/15 border border-white/20 text-[11px] font-bold text-main flex items-center justify-center gap-1.5"
                    >
                      <GoogleColorLogo size={15} />
                      <span>Google</span>
                    </button>
                    <a
                      href={telegramBotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 px-2 rounded-xl surface-soft hover:bg-sky-500/15 border border-sky-500/30 text-[11px] font-bold text-main flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-sky-400" />
                      <span>{isFa ? 'تلگرام' : 'Telegram'}</span>
                    </a>
                  </div>
                </form>
              )}
            </>
          )}

          <p className="text-[10px] text-dim flex items-center justify-center gap-1.5 pt-1 border-t hairline">
            <Bot className="w-3.5 h-3.5 text-brand shrink-0" />
            <span dir="ltr">@Dollarino_bot · @Dollarino_official</span>
          </p>
        </div>
      </div>
    </div>
  );
}
