import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Crown,
  Download,
  Globe,
  Monitor,
  Moon,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react';
import { CoinIcon } from '../components/CoinIcon';
import { PwaInstallModal } from '../components/PwaInstallModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';

interface PublicCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PublicMarketTicker {
  symbol: string;
  lastPrice: number;
  changePct24h: number;
  volume24hUsd: number;
  high24h: number;
  low24h: number;
}

interface PublicPlan {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  features_json: string;
  is_popular: number;
}

const FALLBACK_MARKETS: PublicMarketTicker[] = [
  { symbol: 'BTCUSDT', lastPrice: 91450.2, changePct24h: 2.34, volume24hUsd: 1842000000, high24h: 92100, low24h: 89120 },
  { symbol: 'ETHUSDT', lastPrice: 3124.8, changePct24h: 1.82, volume24hUsd: 892000000, high24h: 3180, low24h: 3045 },
  { symbol: 'SOLUSDT', lastPrice: 198.45, changePct24h: 4.12, volume24hUsd: 540000000, high24h: 202.1, low24h: 188.6 },
  { symbol: 'BNBUSDT', lastPrice: 642.1, changePct24h: 0.94, volume24hUsd: 210000000, high24h: 649.5, low24h: 632.0 },
  { symbol: 'XRPUSDT', lastPrice: 1.482, changePct24h: -0.64, volume24hUsd: 390000000, high24h: 1.521, low24h: 1.448 },
];

const COIN_NAMES_FA: Record<string, string> = {
  BTCUSDT: 'بیت کوین',
  ETHUSDT: 'اتریوم',
  SOLUSDT: 'سولانا',
  BNBUSDT: 'بایننس کوین',
  XRPUSDT: 'ریپل',
};

function fmtPx(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  if (px >= 1000) return px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(2);
  return px.toFixed(4);
}

function HeroAreaChart({ candles }: { candles: PublicCandle[] }) {
  const pts = useMemo(() => {
    const src = candles.length >= 10 ? candles.slice(-30).map((c) => c.close) : [89400, 89800, 89550, 90200, 90850, 90600, 91200, 91450];
    const min = Math.min(...src);
    const max = Math.max(...src);
    const span = max - min || 1;
    const w = 440;
    const h = 140;
    const coords = src.map((v, i) => ({
      x: (i / Math.max(1, src.length - 1)) * w,
      y: 12 + ((max - v) / span) * (h - 24),
    }));
    const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    return { line, area, w, h };
  }, [candles]);

  return (
    <svg viewBox={`0 0 ${pts.w} ${pts.h}`} className="w-full h-[140px]">
      <defs>
        <linearGradient id="kifHeroGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={pts.area} fill="url(#kifHeroGrad)" />
      <path d={pts.line} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingPage({
  lang,
  setLang,
  theme,
  setTheme,
  onOpenAuth,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}) {
  const isFa = lang === 'fa';
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [previewMode, setPreviewMode] = useState<'ai' | 'codexbot' | 'copytrade'>('ai');
  const [snapshot, setSnapshot] = useState<{ candles: PublicCandle[]; markets: PublicMarketTicker[] } | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [pwaOpen, setPwaOpen] = useState(false);
  const { canPromptNatively, promptInstall } = usePwaInstall();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [snap, pl] = await Promise.all([
        apiFetch<{ candles: PublicCandle[]; markets: PublicMarketTicker[] }>(
          `/api/public/market-snapshot?symbol=${encodeURIComponent(selectedSymbol)}`
        ).catch(() => null),
        apiFetch<{ plans: PublicPlan[] }>('/api/public/plans').catch(() => ({ plans: [] })),
      ]);
      if (!active) return;
      if (snap) setSnapshot(snap);
      if (pl?.plans?.length) setPlans(pl.plans);
    };
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [selectedSymbol]);

  const marketsList = snapshot?.markets?.length ? snapshot.markets : FALLBACK_MARKETS;
  const activeTicker = marketsList.find((m) => m.symbol === selectedSymbol) || marketsList[0]!;

  const handleInstallClick = async () => {
    if (canPromptNatively) {
      const outcome = await promptInstall();
      if (outcome !== 'installed') setPwaOpen(true);
    } else {
      setPwaOpen(true);
    }
  };

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className={`min-h-screen bg-[#090d16] text-[#e7ecf2] ${theme === 'light' ? 'theme-light' : ''}`}>
      {/* Sticky Clean Navbar (kifpool-style clarity) */}
      <header className="sticky top-0 z-40 border-b border-[#181d28] bg-[#090d16]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/icons/icon-192.png" alt="Dollarino" className="w-9 h-9 rounded-xl shadow-md" />
            <div>
              <span className="font-extrabold text-base text-white tracking-tight">
                {isFa ? 'دلارینو' : 'Dollarino'}
              </span>
              <p className="text-[10px] text-[#8f99aa] hidden sm:block">
                {isFa ? 'دستیار هوشمند ترید و کپی‌ترید' : 'Smart AI & Copy-Trade Platform'}
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[#9aa5b5]">
            <a href="#modes" className="hover:text-[#4b73f5] transition">{isFa ? 'روش‌های معامله' : 'Trading Modes'}</a>
            <a href="#markets" className="hover:text-[#4b73f5] transition">{isFa ? 'قیمت لحظه‌ای بازار' : 'Live Markets'}</a>
            <a href="#pricing" className="hover:text-[#4b73f5] transition">{isFa ? 'تعرفه اشتراک‌ها' : 'Subscriptions'}</a>
            <a href="#pwa" className="hover:text-[#4b73f5] transition">{isFa ? 'اپ ویندوز و موبایل' : 'Windows & Mobile App'}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-[#11151d] border border-[#222836] text-[#9aa5b5] hover:text-white transition"
              title={isFa ? 'تغییر تم روشن / تیره' : 'Toggle Light / Dark'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-[#f59f14]" /> : <Moon className="w-4 h-4 text-[#2563eb]" />}
            </button>
            <button
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="px-2.5 py-2 rounded-xl bg-[#11151d] border border-[#222836] text-[11px] font-semibold text-[#c5cede] inline-flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              onClick={handleInstallClick}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#11151d] hover:bg-[#192030] border border-[#222836] text-xs font-semibold text-[#27cd86] transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'نصب اپ' : 'Install App'}</span>
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3.5 py-2 rounded-xl border border-[#222836] bg-[#0f131b] text-xs font-semibold text-white transition"
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              onClick={() => onOpenAuth('register')}
              className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition"
            >
              {isFa ? 'ثبت‌نام و تست دمو' : 'Start Free Demo'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-20 pb-20">
        {/* 1. Graphical Kifpool-Inspired Hero */}
        <section className="pt-10 sm:pt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2563eb]/10 border border-[#2563eb]/30 text-xs font-semibold text-[#4b73f5]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isFa
                  ? 'اتصال رسمی به صرافی‌های Toobit و KCEX + حساب دمو رایگان'
                  : 'Toobit & KCEX Perpetuals + Free Paper Demo Simulator'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-[1.22]">
              {isFa ? (
                <>
                  پلتفرم هوشمند ترید با{' '}
                  <span className="text-[#3b82f6]">هوش مصنوعی</span>،{' '}
                  <span className="text-[#10b981]">CodexBot</span> و کپی‌ترید تلگرام
                </>
              ) : (
                <>
                  Simple &amp; Powerful <span className="text-[#3b82f6]">AI Trading</span>,{' '}
                  <span className="text-[#10b981]">CodexBot</span> &amp; Telegram Copy-Trade
                </>
              )}
            </h1>

            <p className="text-sm sm:text-base text-[#8f99aa] leading-relaxed">
              {isFa
                ? 'بدون پیچیدگی‌های اضافی! حساب صرافی Toobit یا KCEX خود را متصل کنید، در حساب دمو رایگان آزمایش کنید و با هوش مصنوعی DeepSeek، استراتژی‌های آماده CodexBot یا سیگنال‌های کانال تلگرام خودتان ۲۴ ساعته معامله کنید.'
                : 'No clutter. Connect Toobit or KCEX, test safely in Paper Demo, and trade 24/7 with DeepSeek AI, CodexBot strategies, or your own Telegram channel signals.'}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onOpenAuth('register')}
                className="px-6 py-3.5 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-bold shadow-xl shadow-blue-600/25 inline-flex items-center gap-2 transition"
              >
                <span>{isFa ? 'شروع رایگان با حساب دمو' : 'Start Paper Demo Free'}</span>
                {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
              <a
                href="#pricing"
                className="px-6 py-3.5 rounded-2xl bg-[#11151d] hover:bg-[#192030] border border-[#222836] text-white text-sm font-bold inline-flex items-center gap-2 transition"
              >
                <Crown className="w-4 h-4 text-[#f59f14]" />
                <span>{isFa ? 'مشاهده اشتراک‌ها' : 'View Plans'}</span>
              </a>
            </div>

            {/* Platform Badges like Kifpool */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 text-xs">
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl bg-[#11151d] border border-[#222836] hover:border-[#3b82f6]/50 flex items-center gap-2 text-[#c5cede] transition"
              >
                <Monitor className="w-4 h-4 text-[#3b82f6]" />
                <span>{isFa ? 'نسخه ویندوز (PWA)' : 'Windows App'}</span>
              </button>
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl bg-[#11151d] border border-[#222836] hover:border-[#10b981]/50 flex items-center gap-2 text-[#c5cede] transition"
              >
                <Smartphone className="w-4 h-4 text-[#10b981]" />
                <span>{isFa ? 'اپ موبایل اندروید و آیفون' : 'Android & iOS PWA'}</span>
              </button>
            </div>
          </div>

          {/* Right Graphical Interactive Card */}
          <div className="lg:col-span-6">
            <div className="card-tt p-5 sm:p-6 rounded-3xl border-[#1f283b] shadow-2xl space-y-5">
              {/* Interactive 3-Mode Preview Pills */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#080a0e] border border-[#1a2130] text-xs">
                {[
                  { id: 'ai', label: isFa ? '🤖 هوش مصنوعی' : 'AI Trader' },
                  { id: 'codexbot', label: isFa ? '⚡ استراتژی CodexBot' : 'CodexBot' },
                  { id: 'copytrade', label: isFa ? '📡 کپی‌ترید تلگرام' : 'Copy-Trade' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPreviewMode(m.id as typeof previewMode)}
                    className={`py-2 rounded-xl font-bold transition ${
                      previewMode === m.id ? 'bg-[#2563eb] text-white shadow' : 'text-[#8f99aa] hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={activeTicker.symbol} size={42} />
                  <div>
                    <div className="font-extrabold text-base text-white">
                      {isFa ? COIN_NAMES_FA[activeTicker.symbol] || activeTicker.symbol : activeTicker.symbol}
                      <span className="ms-2 text-xs font-mono-num text-[#6c7689]">{activeTicker.symbol}</span>
                    </div>
                    <div className="text-xs text-[#27cd86] font-semibold">
                      {previewMode === 'ai'
                        ? isFa ? 'تحلیل زنده DeepSeek V4 · اطمینان ۸۶٪' : 'DeepSeek V4 Active · 86% Conviction'
                        : previewMode === 'codexbot'
                          ? isFa ? 'استراتژی CodexBot Super v11 فعال' : 'CodexBot Super v11 Active'
                          : isFa ? 'متصل به کانال سیگنال تلگرام شما' : 'Listening to Your Telegram Channel'}
                    </div>
                  </div>
                </div>
                <div className="text-end font-mono-num">
                  <div className="text-xl font-extrabold text-white">${fmtPx(activeTicker.lastPrice)}</div>
                  <div className={`text-xs font-bold ${activeTicker.changePct24h >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                    {activeTicker.changePct24h >= 0 ? '+' : ''}
                    {activeTicker.changePct24h.toFixed(2)}%
                  </div>
                </div>
              </div>

              <HeroAreaChart candles={snapshot?.candles || []} />

              {/* Quick Coin Switcher Pills */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#181d28] overflow-x-auto">
                <div className="flex items-center gap-1.5">
                  {marketsList.map((m) => (
                    <button
                      key={m.symbol}
                      onClick={() => setSelectedSymbol(m.symbol)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-mono-num flex items-center gap-1.5 transition ${
                        selectedSymbol === m.symbol
                          ? 'bg-[#2563eb]/20 text-white border border-[#2563eb]/50'
                          : 'bg-[#0c101a] text-[#8f99aa] hover:text-white'
                      }`}
                    >
                      <CoinIcon symbol={m.symbol} size={18} />
                      <span>{m.symbol.replace('USDT', '')}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-bold text-xs shrink-0"
                >
                  {isFa ? 'تست رایگان' : 'Try Demo'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Three Core Graphical Trading Modes */}
        <section id="modes" className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              {isFa ? 'سه روش حرفه‌ای برای معامله خودکار' : 'Three Simple Ways to Automate Your Trading'}
            </h2>
            <p className="text-sm text-[#8f99aa]">
              {isFa ? 'ساده، بصری و آماده کار روی حساب دمو یا صرافی‌های Toobit و KCEX' : 'Graphical, simple, and built for Toobit, KCEX, and Paper Demo'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="card-tt p-6 rounded-3xl space-y-4 hover:border-[#3b82f6]/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-[#3b82f6]/15 border border-[#3b82f6]/35 flex items-center justify-center">
                <BrainCircuit className="w-6 h-6 text-[#3b82f6]" />
              </div>
              <h3 className="text-lg font-bold text-white">{isFa ? '۱. ترید با هوش مصنوعی' : '1. AI Autonomous Trading'}</h3>
              <p className="text-xs text-[#8f99aa] leading-relaxed">
                {isFa
                  ? 'کافیست کلید API دیپ‌سیک (DeepSeek)، کلود یا GPT خود را وارد کنید؛ هوش مصنوعی مستقیماً نمودار و اردربوک را تحلیل کرده و با حد ضرر و ۳ تارگت ترید می‌زند.'
                  : 'Connect DeepSeek, Claude, or GPT. The AI reads live structure & orderbooks and trades with strict SL & 3-TP protection.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/10 text-[#60a5fa]">DeepSeek V4</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/10 text-[#60a5fa]">Claude</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/10 text-[#60a5fa]">GPT-4o</span>
              </div>
            </div>

            <div className="card-tt p-6 rounded-3xl space-y-4 hover:border-[#10b981]/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-[#10b981]/15 border border-[#10b981]/35 flex items-center justify-center">
                <Cpu className="w-6 h-6 text-[#10b981]" />
              </div>
              <h3 className="text-lg font-bold text-white">{isFa ? '۲. استراتژی‌های CodexBot' : '2. CodexBot Strategies'}</h3>
              <p className="text-xs text-[#8f99aa] leading-relaxed">
                {isFa
                  ? 'مجموعه کامل استراتژی‌های اختصاصی CodexBot (Super v11، شکار نقدینگی SP2L، پولبک EMA و میکسر ۸ کاناله) همراه با بک‌تست واقعی و ریسک‌فری خودکار.'
                  : 'Proven CodexBot quantitative strategies (Super v11, SP2L Liquidity, EMA Momentum, 8-Channel Mixer) with built-in backtesting.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#10b981]/10 text-[#34d399]">CodexBot v11</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#10b981]/10 text-[#34d399]">3-TP Risk-Free</span>
              </div>
            </div>

            <div className="card-tt p-6 rounded-3xl space-y-4 hover:border-[#8b5cf6]/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-[#8b5cf6]/15 border border-[#8b5cf6]/35 flex items-center justify-center">
                <Radio className="w-6 h-6 text-[#a78bfa]" />
              </div>
              <h3 className="text-lg font-bold text-white">{isFa ? '۳. کپی‌ترید کانال تلگرام' : '3. Telegram Copy-Trade'}</h3>
              <p className="text-xs text-[#8f99aa] leading-relaxed">
                {isFa
                  ? 'بات تلگرام خود را به کانال سیگنال متصل کنید؛ تمام سیگنال‌ها با فرمت اختصاصی شما در کانال خوانده شده و در صرافی یا حساب دمو اجرا می‌شوند.'
                  : 'Connect your Telegram bot to your signal channel; every post in your format is parsed and executed automatically.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#8b5cf6]/10 text-[#c4b5fd]">{isFa ? 'فرمت اختصاصی کانال' : 'Your Channel Format'}</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#8b5cf6]/10 text-[#c4b5fd]">Auto / Manual</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Kifpool-style Live Markets + Supported Exchanges (ONLY Toobit, KCEX, Paper) */}
        <section id="markets" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-white">
                {isFa ? 'قیمت لحظه‌ای ارزهای دیجیتال' : 'Live Perpetual Crypto Markets'}
              </h2>
              <p className="text-xs text-[#8f99aa] mt-1">
                {isFa ? 'پشتیبانی متمرکز از صرافی‌های Toobit و KCEX + حساب دمو Paper برای تست' : 'Focused support for Toobit & KCEX + Paper Demo simulator'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/35 text-[#60a5fa] font-bold">Toobit Futures</span>
              <span className="px-3 py-1.5 rounded-xl bg-[#10b981]/15 border border-[#10b981]/35 text-[#34d399] font-bold">KCEX 0% Fee</span>
              <span className="px-3 py-1.5 rounded-xl bg-[#f59f14]/15 border border-[#f59f14]/35 text-[#fbbf24] font-bold">Paper Demo</span>
            </div>
          </div>

          <div className="card-tt rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-[#0b101b] border-b border-[#181d28] text-[11px] text-[#6c7689]">
                  <tr>
                    <th className="py-3.5 px-5 text-start">{isFa ? 'ارز دیجیتال' : 'Asset'}</th>
                    <th className="py-3.5 px-5 text-end">{isFa ? 'قیمت دلاری (USDT)' : 'Price (USDT)'}</th>
                    <th className="py-3.5 px-5 text-end">{isFa ? 'تغییرات ۲۴ ساعته' : '24h Change'}</th>
                    <th className="py-3.5 px-5 text-end hidden sm:table-cell">{isFa ? 'سقف / کف ۲۴س' : '24h High / Low'}</th>
                    <th className="py-3.5 px-5 text-end">{isFa ? 'عملیات' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#151a24]">
                  {marketsList.map((m) => (
                    <tr key={m.symbol} className="hover:bg-[#0f1523]/70 transition">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <CoinIcon symbol={m.symbol} size={34} />
                          <div>
                            <div className="font-bold text-white">{isFa ? COIN_NAMES_FA[m.symbol] || m.symbol : m.symbol.replace('USDT', '')}</div>
                            <div className="text-[11px] font-mono-num text-[#6c7689]">{m.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-end font-mono-num font-bold text-white">${fmtPx(m.lastPrice)}</td>
                      <td className="py-4 px-5 text-end font-mono-num">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            m.changePct24h >= 0 ? 'bg-[#27cd86]/15 text-[#27cd86]' : 'bg-[#eb493d]/15 text-[#eb493d]'
                          }`}
                        >
                          {m.changePct24h >= 0 ? '+' : ''}
                          {m.changePct24h.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-4 px-5 text-end font-mono-num text-xs text-[#8f99aa] hidden sm:table-cell">
                        ${fmtPx(m.high24h)} / ${fmtPx(m.low24h)}
                      </td>
                      <td className="py-4 px-5 text-end">
                        <button
                          onClick={() => onOpenAuth('register')}
                          className="px-4 py-1.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition"
                        >
                          {isFa ? 'شروع معامله' : 'Trade'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 4. Live Subscription Pricing */}
        <section id="pricing" className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              {isFa ? 'پلن‌های اشتراک دلارینو' : 'Simple Subscription Plans'}
            </h2>
            <p className="text-sm text-[#8f99aa]">
              {isFa
                ? 'ابتدا با حساب دمو رایگان تست کنید و سپس اشتراک حرفه‌ای یا VIP تهیه کنید (پرداخت با تتر TRC20 یا کارت‌به‌کارت)'
                : 'Test free in Paper Demo, then upgrade with USDT TRC20 or Card-to-Card'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(plans.length
              ? plans
              : [
                  {
                    code: 'free_demo',
                    name_fa: 'تست دمو (Paper Demo)',
                    name_en: 'Paper Demo Trial',
                    description_fa: 'تست استراتژی‌های CodexBot در حساب دمو',
                    description_en: 'Test CodexBot in Paper Demo',
                    price_usd: 0,
                    price_toman: 0,
                    duration_days: 365,
                    features_json: '["حساب دمو با قیمت زنده بازار","بک‌تست استراتژی‌های CodexBot","نصب نسخه ویندوز و موبایل"]',
                    is_popular: 0,
                  },
                  {
                    code: 'pro_monthly',
                    name_fa: 'اشتراک حرفه‌ای ماهانه (Pro)',
                    name_en: 'Pro Monthly',
                    description_fa: 'دسترسی کامل به AI، CodexBot و کپی‌ترید تلگرام',
                    description_en: 'Full AI, CodexBot & Telegram Copy-Trade',
                    price_usd: 29,
                    price_toman: 1950000,
                    duration_days: 30,
                    features_json: '["ترید با هوش مصنوعی (DeepSeek/Claude)","کپی‌ترید خودکار کانال تلگرام","اتصال لایو صرافی Toobit و KCEX"]',
                    is_popular: 1,
                  },
                  {
                    code: 'vip_quarterly',
                    name_fa: 'اشتراک ویژه ۳ ماهه (VIP)',
                    name_en: 'VIP Quarterly',
                    description_fa: '۳ ماه دسترسی کامل با ۳۲٪ تخفیف ویژه',
                    description_en: '90 days full VIP license with 32% savings',
                    price_usd: 59,
                    price_toman: 3950000,
                    duration_days: 90,
                    features_json: '["۹۰ روز تمام امکانات Pro","سقف بالاتر فراخوانی AI","پشتیبانی و راه‌اندازی اختصاصی"]',
                    is_popular: 0,
                  },
                ]
            ).map((p) => {
              let feats: string[] = [];
              try {
                feats = JSON.parse(p.features_json) as string[];
              } catch {
                feats = [];
              }
              return (
                <div
                  key={p.code}
                  className={`card-tt p-6 rounded-3xl flex flex-col justify-between gap-5 ${
                    p.is_popular ? 'border-[#2563eb] ring-2 ring-[#2563eb]/20' : ''
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base text-white">{isFa ? p.name_fa : p.name_en}</span>
                      {p.is_popular ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#2563eb] text-white text-[10px] font-bold">
                          {isFa ? 'پیشنهادی' : 'POPULAR'}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono-num">
                      <span className="text-3xl font-extrabold text-white">
                        {p.price_usd === 0 ? (isFa ? 'رایگان' : 'Free') : `$${p.price_usd}`}
                      </span>
                      {p.price_usd > 0 && (
                        <span className="text-xs text-[#6c7689] ms-1.5">/ {p.duration_days} {isFa ? 'روز' : 'days'}</span>
                      )}
                      {p.price_toman > 0 && (
                        <div className="text-xs text-[#27cd86] font-sans font-semibold mt-1">
                          {p.price_toman.toLocaleString()} تومان
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[#8f99aa]">{isFa ? p.description_fa : p.description_en}</p>
                    <ul className="space-y-2 pt-2 border-t border-[#181d28] text-xs">
                      {feats.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-[#c8d0dc]">
                          <CheckCircle2 className="w-4 h-4 text-[#27cd86] shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => onOpenAuth('register')}
                    className={`w-full py-3 rounded-2xl text-xs font-bold transition ${
                      p.is_popular
                        ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-600/25'
                        : 'bg-[#131823] hover:bg-[#1b2232] text-white border border-[#242c3c]'
                    }`}
                  >
                    {p.price_usd === 0
                      ? isFa ? 'شروع تست دمو رایگان' : 'Start Free Demo'
                      : isFa ? 'ثبت‌نام و خرید اشتراک' : 'Subscribe Now'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. PWA Install Banner (Windows + Android + iOS like kifpool/application) */}
        <section id="pwa" className="card-tt p-7 sm:p-10 rounded-3xl bg-gradient-to-br from-[#0f172a] to-[#0b1222] border-[#2563eb]/35 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#27cd86]/15 text-[#27cd86] text-xs font-bold">
              <Zap className="w-3.5 h-3.5" />
              <span>PWA Ready · Windows &amp; Mobile</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              {isFa ? 'نصب اپلیکیشن دلارینو روی ویندوز، اندروید و آیفون' : 'Install Dollarino App on Windows, Android & iOS'}
            </h2>
            <p className="text-xs sm:text-sm text-[#8f99aa] leading-relaxed">
              {isFa
                ? 'با فناوری وب‌اپلیکیشن پیشرفته (PWA)، تنها با یک کلیک دلارینو را مثل یک برنامه واقعی روی دسکتاپ ویندوز یا صفحه اصلی موبایل نصب کنید و همیشه به سرعت بالا، اعلان‌ها و رابط تمام‌صفحه دسترسی داشته باشید.'
                : 'Install Dollarino directly as a standalone Windows desktop app or Mobile home-screen app in one click — no app store needed.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleInstallClick}
                className="px-6 py-3 rounded-2xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-extrabold text-xs sm:text-sm inline-flex items-center gap-2 transition"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب فوری نسخه ویندوز / موبایل' : 'Install App Now (PWA)'}</span>
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-5 py-3 rounded-2xl bg-[#131a29] hover:bg-[#1a2338] border border-[#263047] text-white font-bold text-xs sm:text-sm"
              >
                {isFa ? 'ورود به نسخه وب' : 'Open Web Version'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col items-center justify-center gap-3">
            <img src="/icons/icon-512.png" alt="Dollarino App" className="w-28 h-28 rounded-3xl shadow-2xl border border-[#3b82f6]/40" />
            <div className="text-xs font-semibold text-[#9aa5b5] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#27cd86]" />
              <span>{isFa ? 'سبک، سریع و امن با رمزنگاری کامل' : 'Fast, Lightweight & AES-256 Encrypted'}</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#181d28] py-8 px-4 sm:px-6 text-xs text-[#6c7689]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#3b82f6]" />
            <span className="font-bold text-white">{isFa ? 'دلارینو (Dollarino)' : 'Dollarino Platform'}</span>
            <span>· {isFa ? 'پلتفرم هوشمند ترید با AI، CodexBot و کپی‌ترید' : 'AI, CodexBot & Telegram Copy-Trade'}</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleInstallClick} className="hover:text-white transition">{isFa ? 'نصب PWA' : 'Install PWA'}</button>
            <button onClick={() => onOpenAuth('login')} className="hover:text-white transition">{isFa ? 'ورود' : 'Sign In'}</button>
            <button onClick={() => onOpenAuth('register')} className="hover:text-white transition">{isFa ? 'ثبت‌نام' : 'Register'}</button>
          </div>
        </div>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
