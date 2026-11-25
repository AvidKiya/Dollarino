import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import { DollarinoBrandMark } from './BrandGraphics';

declare global {
  interface Window {
    __dollarinoBootPct?: number;
    __dollarinoBootTimer?: number;
  }
}

export type SplashStage = 'boot' | 'auth' | 'desk' | 'card';

interface AppSplashLoaderProps {
  lang?: 'fa' | 'en';
  stage?: SplashStage;
  targetPercent?: number;
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}

const STAGE_DEFAULT_TARGET: Record<SplashStage, number> = {
  boot: 48,
  auth: 68,
  desk: 96,
  card: 84,
};

export function AppSplashLoader({
  lang = 'fa',
  stage = 'auth',
  targetPercent,
  error,
  onRetry,
  onBack,
}: AppSplashLoaderProps) {
  const isFa = lang === 'fa';
  const goal = Math.min(99, Math.max(18, targetPercent ?? STAGE_DEFAULT_TARGET[stage]));

  const [pct, setPct] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      if (window.__dollarinoBootTimer) {
        window.clearInterval(window.__dollarinoBootTimer);
        window.__dollarinoBootTimer = undefined;
      }
      const prev = Number(window.__dollarinoBootPct ?? 0);
      if (Number.isFinite(prev) && prev > 12) return Math.min(goal, prev);
    }
    return stage === 'desk' ? 68 : 24;
  });

  const [showFallbackActions, setShowFallbackActions] = useState(false);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setPct((cur) => {
        if (error) return cur;
        if (cur >= goal) return cur;
        const diff = goal - cur;
        const step = Math.max(0.45, diff * 0.085);
        const next = Math.min(goal, cur + step);
        window.__dollarinoBootPct = next;
        return next;
      });
    }, 65);
    return () => window.clearInterval(iv);
  }, [goal, error]);

  useEffect(() => {
    if (error) {
      setShowFallbackActions(true);
      return;
    }
    setShowFallbackActions(false);
    const t = window.setTimeout(() => setShowFallbackActions(true), 12_000);
    return () => window.clearTimeout(t);
  }, [error, stage]);

  const roundedPct = Math.min(100, Math.max(1, Math.round(pct)));

  const statusText = useMemo(() => {
    if (error) return error;
    if (stage === 'card') {
      return isFa ? 'در حال رمزگشایی و تایید اصالت کارت سود...' : 'Verifying profit card authenticity...';
    }
    if (roundedPct < 36) {
      return isFa ? 'در حال راه‌اندازی هسته اپلیکیشن و رابط کاربری...' : 'Initializing core modules & interface...';
    }
    if (roundedPct < 66) {
      return isFa ? 'بررسی امن نشست کاربری و رمزنگاری اتصال...' : 'Verifying encrypted session & security...';
    }
    if (roundedPct < 88) {
      return isFa ? 'همگام‌سازی نرخ‌های زنده، کیف‌پول و بازارها...' : 'Syncing live market feeds & wallet vaults...';
    }
    return isFa ? 'آماده‌سازی نهایی میز کار هوشمند دلارینو...' : 'Finalizing your AI trading workspace...';
  }, [error, isFa, roundedPct, stage]);

  const milestones = useMemo(
    () => [
      {
        id: 'sec',
        label: isFa ? 'اتصال امن' : 'Security',
        done: roundedPct >= 34,
        icon: ShieldCheck,
      },
      {
        id: 'feed',
        label: isFa ? 'داده بازارها' : 'Live Feeds',
        done: roundedPct >= 68,
        icon: Wifi,
      },
      {
        id: 'ai',
        label: isFa ? 'میز کار AI' : 'AI Desk',
        done: roundedPct >= 92,
        icon: Sparkles,
      },
    ],
    [isFa, roundedPct]
  );

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      data-testid="app-splash-loader"
      className="relative min-h-screen app-shell flex items-center justify-center p-4 overflow-hidden select-none"
    >
      {/* Ambient Fintech / App Background Glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-28 start-1/2 -translate-x-1/2 w-[560px] h-[360px] rounded-full blur-[110px] opacity-30"
          style={{ background: 'radial-gradient(circle, #1652F0 0%, rgba(14,165,233,0.45) 55%, transparent 80%)' }}
        />
        <div
          className="absolute -bottom-32 start-1/4 w-[380px] h-[320px] rounded-full blur-[110px] opacity-20"
          style={{ background: 'radial-gradient(circle, #10D856 0%, rgba(14,165,233,0.35) 60%, transparent 85%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />
      </div>

      {/* Central App Splash Card */}
      <div className="relative z-10 w-full max-w-[420px] panel rounded-[32px] p-6 sm:p-8 shadow-2xl border border-[var(--line-strong)] backdrop-blur-2xl text-center">
        {/* Orbital Animated Brand Mark */}
        <div className="relative mx-auto w-32 h-32 flex items-center justify-center mb-5">
          {/* Halo Pulse */}
          <div
            className="absolute inset-2 rounded-full loader-halo-pulse"
            style={{
              background:
                'radial-gradient(circle, rgba(22,82,240,0.32) 0%, rgba(14,165,233,0.16) 55%, transparent 75%)',
            }}
          />

          {/* Outer Orbit Ring */}
          <div className="absolute inset-0 rounded-full border border-dashed border-[#38BDF8]/35 loader-orbit-slow">
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#38BDF8] shadow-[0_0_10px_#38BDF8]" />
          </div>

          {/* Inner Reverse Orbit Ring */}
          <div className="absolute inset-3 rounded-full border border-[#1652F0]/40 loader-orbit-reverse">
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#10D856] shadow-[0_0_10px_#10D856]" />
          </div>

          {/* Glass Logo Medallion */}
          <div className="relative w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#1652F0]/18 via-white/10 to-[#0EA5E9]/15 border border-white/25 dark:border-white/15 shadow-xl grid place-items-center animate-float">
            <DollarinoBrandMark size={54} glow />
            <span
              className="absolute -bottom-1 -end-1 w-4 h-4 rounded-full bg-[#10D856] border-2 border-[var(--panel)] shadow-[0_0_8px_#10D856] academy-pulse-dot"
              title="Online"
            />
          </div>
        </div>

        {/* Brand Name & Version Tag */}
        <div className="space-y-1.5 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full surface-soft border hairline text-[10px] font-extrabold tracking-wide text-[#1652F0] dark:text-[#60A5FA]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10D856] academy-pulse-dot" />
            <bdi dir="ltr">DOLLARINO AI · V11.6</bdi>
          </div>

          <h1 className="font-display font-black text-2xl sm:text-[26px] tracking-tight text-main">
            {isFa ? 'دلارینو' : 'Dollarino'}
          </h1>

          <p className="text-xs text-dim leading-relaxed max-w-xs mx-auto">
            {isFa
              ? 'دستیار ترید هوشمند ۲۴/۷، کپی‌ترید ولت‌ها و کیف‌پول چندزنجیره‌ای DEX'
              : '24/7 AI Quant Trading, Smart Wallet Copy & Multi-Chain Trust DEX'}
          </p>
        </div>

        {/* Progress Track + Live Percentage */}
        <div className="surface-soft rounded-2xl p-4 border hairline space-y-3 text-start">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  error ? 'bg-rose-500' : 'bg-[#1652F0] dark:bg-[#38BDF8] academy-pulse-dot'
                }`}
              />
              <span className={`text-[11px] sm:text-xs font-bold truncate ${error ? 'text-loss' : 'text-main'}`}>
                {statusText}
              </span>
            </div>
            <span
              dir="ltr"
              data-testid="app-splash-percent"
              className="font-mono-num text-sm font-black text-[#1652F0] dark:text-[#60A5FA] tabular-nums shrink-0"
            >
              {roundedPct}%
            </span>
          </div>

          {/* Animated Gradient Bar */}
          <div
            dir="ltr"
            role="progressbar"
            aria-valuenow={roundedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-2.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800/90 overflow-hidden shadow-inner"
          >
            <div
              className={`relative h-full rounded-full transition-[width] duration-150 ease-out overflow-hidden ${
                error
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                  : 'bg-gradient-to-r from-[#1652F0] via-[#0EA5E9] to-[#10D856]'
              }`}
              style={{ width: `${roundedPct}%` }}
            >
              {!error && (
                <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent loader-bar-shine" />
              )}
            </div>
          </div>

          {/* 3 Mini System Milestones */}
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            {milestones.map((m) => {
              const Icon = m.done ? CheckCircle2 : m.icon;
              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                    m.done
                      ? 'bg-[#10D856]/12 text-[#0D9455] dark:text-[#34D399]'
                      : 'text-dim opacity-75'
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recovery Actions (Only shown on error or prolonged load >12s) */}
        {showFallbackActions && (onRetry || onBack) && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn-gold px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'تلاش مجدد' : 'Retry'}</span>
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازگشت' : 'Back'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppInlineTabLoader({ lang = 'fa' }: { lang?: 'fa' | 'en' }) {
  const isFa = lang === 'fa';
  const [pct, setPct] = useState(28);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setPct((p) => (p >= 94 ? p : Math.min(94, p + Math.max(1, (94 - p) * 0.18))));
    }, 90);
    return () => window.clearInterval(iv);
  }, []);

  const rounded = Math.round(pct);

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="py-16 px-4 flex items-center justify-center">
      <div className="panel rounded-3xl p-6 max-w-xs w-full text-center space-y-4 border hairline shadow-lg">
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-dashed border-[#38BDF8]/45 loader-orbit-slow" />
          <div className="w-12 h-12 rounded-2xl bg-[#1652F0]/12 border hairline grid place-items-center animate-float">
            <DollarinoBrandMark size={34} glow />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold px-1">
            <span className="text-dim">{isFa ? 'در حال آماده‌سازی صفحه...' : 'Loading module...'}</span>
            <span dir="ltr" className="font-mono-num text-[#1652F0] dark:text-[#60A5FA]">
              {rounded}%
            </span>
          </div>
          <div dir="ltr" className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-[#1652F0] via-[#0EA5E9] to-[#10D856] transition-[width] duration-150 overflow-hidden"
              style={{ width: `${rounded}%` }}
            >
              <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent loader-bar-shine" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
