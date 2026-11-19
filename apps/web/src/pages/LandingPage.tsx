import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crown,
  Download,
  Globe,
  Monitor,
  Moon,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  DollarinoBrandMark,
  ModeGraphicAI,
  ModeGraphicCodex,
  ModeGraphicTelegram,
} from '../components/BrandGraphics';
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
  { symbol: 'BTCUSDT', lastPrice: 62150.4, changePct24h: 2.34, volume24hUsd: 1842000000, high24h: 63200, low24h: 60800 },
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
    const src =
      candles.length >= 10
        ? candles.slice(-32).map((c) => c.close)
        : [60400, 60850, 60500, 61200, 61750, 61400, 61950, 62150];
    const min = Math.min(...src);
    const max = Math.max(...src);
    const span = max - min || 1;
    const w = 440;
    const h = 136;
    const coords = src.map((v, i) => ({
      x: (i / Math.max(1, src.length - 1)) * w,
      y: 12 + ((max - v) / span) * (h - 24),
    }));
    const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    return { line, area, w, h };
  }, [candles]);

  return (
    <svg viewBox={`0 0 ${pts.w} ${pts.h}`} className="w-full h-[136px]">
      <defs>
        <linearGradient id="logoCobaltGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16E664" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#1464F6" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={pts.area} fill="url(#logoCobaltGrad)" />
      <path d={pts.line} fill="none" stroke="#16E664" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell">
      {/* Clean Kifpool-inspired Header */}
      <header className="sticky top-0 z-40 border-b app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DollarinoBrandMark size={42} glow />
            <div>
              <span className="font-black text-lg text-main tracking-tight">
                {isFa ? 'دلارینو' : 'Dollarino'}
              </span>
              <p className="text-[11px] text-dim hidden sm:block">
                {isFa ? 'دستیار هوشمند ترید و کپی‌ترید' : 'Smart AI & Copy-Trade'}
              </p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-sub">
            <a href="#modes" className="hover:text-brand transition">
              {isFa ? '۳ روش معامله' : 'Trading Modes'}
            </a>
            <a href="#markets" className="hover:text-brand transition">
              {isFa ? 'بازار لحظه‌ای' : 'Live Markets'}
            </a>
            <a href="#pricing" className="hover:text-brand transition">
              {isFa ? 'تعرفه اشتراک' : 'Pricing'}
            </a>
            <a href="#pwa" className="hover:text-brand transition">
              {isFa ? 'نصب اپلیکیشن' : 'Install App'}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle Theme"
              className="p-2.5 rounded-xl surface-soft hover:border-brand transition"
              title={isFa ? 'تغییر حالت روز / شب' : 'Light / Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[#FF8A00]" />
              ) : (
                <Moon className="w-4 h-4 text-[#0C44C8]" />
              )}
            </button>
            <button
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="px-3 py-2 rounded-xl surface-soft text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-brand" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              onClick={handleInstallClick}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl surface-soft text-xs font-bold text-signal"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'نصب اپ' : 'Get App'}</span>
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-4 py-2 rounded-xl surface-soft text-xs font-bold"
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              onClick={() => onOpenAuth('register')}
              className="px-4 py-2 rounded-xl btn-cobalt text-xs font-extrabold"
            >
              {isFa ? 'شروع دمو رایگان' : 'Free Demo'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 space-y-24 pb-20">
        {/* 1. Spacious Graphical Hero Showcase */}
        <section className="pt-10 sm:pt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full banner-cobalt-soft text-xs font-bold text-brand">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isFa
                  ? 'صرافی‌های رسمی Toobit و KCEX + حساب دمو Paper'
                  : 'Toobit & KCEX Perpetuals + Paper Demo Simulator'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-main leading-[1.24]">
              {isFa ? (
                <>
                  ترید هوشمند کریپتو، ساده و گرافیکی با{' '}
                  <span className="text-brand">دلارینو</span>
                </>
              ) : (
                <>
                  Simple, Graphical Crypto Automation with{' '}
                  <span className="text-brand">Dollarino</span>
                </>
              )}
            </h1>

            <p className="text-sm sm:text-base text-sub leading-relaxed max-w-xl">
              {isFa
                ? 'بدون نیاز به دانش ترید یا تنظیمات پیچیده! فقط با یک کلیک از هوش مصنوعی مرکزی دلارینو، استراتژی اختصاصی «دلارینو V0.1» یا کپی‌ترید خودکار روی Toobit، KCEX و حساب دمو رایگان سود بسازید.'
                : 'Zero clutter. Launch Dollarino Central Multi-AI, Dollarino V0.1 master strategy, or Copy-Trade on Toobit, KCEX, or free Paper Demo in seconds.'}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onOpenAuth('register')}
                className="px-7 py-3.5 rounded-2xl btn-cobalt text-sm font-extrabold inline-flex items-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                <span>{isFa ? 'شروع رایگان با حساب دمو' : 'Start Paper Demo Free'}</span>
                {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
              <a
                href="#pricing"
                className="px-6 py-3.5 rounded-2xl surface-card text-sm font-bold inline-flex items-center gap-2 hover:border-brand transition"
              >
                <Crown className="w-4 h-4 text-[#FF8A00]" />
                <span>{isFa ? 'مشاهده اشتراک‌ها' : 'View Plans'}</span>
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-semibold text-sub">
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl surface-card inline-flex items-center gap-2 hover:border-brand transition"
              >
                <Monitor className="w-4 h-4 text-brand" />
                <span>{isFa ? 'نسخه ویندوز (PWA)' : 'Windows App'}</span>
              </button>
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl surface-card inline-flex items-center gap-2 hover:border-brand transition"
              >
                <Smartphone className="w-4 h-4 text-signal" />
                <span>{isFa ? 'اندروید و آیفون' : 'Android & iOS'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Cobalt Visual Showcase Card */}
          <div className="lg:col-span-6">
            <div className="surface-card p-6 space-y-5 relative overflow-hidden">
              {/* Top Cobalt Brand Strip with Logo Astronaut */}
              <div className="hero-cobalt p-4 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <DollarinoBrandMark size={54} />
                  <div>
                    <div className="text-xs font-bold text-white/80">
                      {isFa ? 'موتور معاملاتی فعال' : 'Active Smart Engine'}
                    </div>
                    <div className="text-base font-black text-white">
                      {previewMode === 'ai'
                        ? isFa ? 'هوش مصنوعی مرکزی دلارینو (ترکیب ۳ مدل)' : 'Central Multi-AI Consensus'
                        : previewMode === 'codexbot'
                          ? isFa ? 'استراتژی اختصاصی دلارینو V0.1' : 'Dollarino V0.1 Master Strategy'
                          : isFa ? 'کپی‌ترید خودکار' : 'Copy-Trade'}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#16E664] text-[#032410] text-[11px] font-black shrink-0">
                  LIVE
                </span>
              </div>

              {/* 3-Mode Pill Switcher */}
              <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl surface-soft text-xs font-bold">
                {[
                  { id: 'ai', label: isFa ? 'هوش مصنوعی' : 'AI Trading' },
                  { id: 'codexbot', label: isFa ? 'دلارینو V0.1' : 'Dollarino V0.1' },
                  { id: 'copytrade', label: isFa ? 'کپی‌ترید' : 'Copy-Trade' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPreviewMode(m.id as typeof previewMode)}
                    className={`py-2 rounded-xl transition ${
                      previewMode === m.id ? 'btn-cobalt' : 'text-sub hover:text-main'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Coin + Price + Chart */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={activeTicker.symbol} size={42} />
                  <div>
                    <div className="font-extrabold text-base text-main">
                      {isFa ? COIN_NAMES_FA[activeTicker.symbol] || activeTicker.symbol : activeTicker.symbol}
                    </div>
                    <div className="text-xs font-mono-num text-dim">{activeTicker.symbol}</div>
                  </div>
                </div>
                <div className="text-end font-mono-num">
                  <div className="text-xl font-black text-main">${fmtPx(activeTicker.lastPrice)}</div>
                  <div className={`text-xs font-bold ${activeTicker.changePct24h >= 0 ? 'text-signal' : 'text-rose-500'}`}>
                    {activeTicker.changePct24h >= 0 ? '+' : ''}
                    {activeTicker.changePct24h.toFixed(2)}%
                  </div>
                </div>
              </div>

              <HeroAreaChart candles={snapshot?.candles || []} />

              <div className="flex items-center justify-between gap-2 pt-2 border-t overflow-x-auto">
                <div className="flex items-center gap-1.5">
                  {marketsList.map((m) => (
                    <button
                      key={m.symbol}
                      onClick={() => setSelectedSymbol(m.symbol)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono-num font-bold inline-flex items-center gap-1.5 transition ${
                        selectedSymbol === m.symbol
                          ? 'btn-cobalt'
                          : 'surface-soft text-sub hover:text-main'
                      }`}
                    >
                      <CoinIcon symbol={m.symbol} size={18} />
                      <span>{m.symbol.replace('USDT', '')}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-4 py-2 rounded-xl btn-emerald text-xs shrink-0"
                >
                  {isFa ? 'تست دمو' : 'Try Demo'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Three Graphical Modes with Custom Vector Illustrations */}
        <section id="modes" className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-main">
              {isFa ? 'سه موتور قدرتمند، در یک پنل ساده و گرافیکی' : 'Three Trading Engines in One Clean Workspace'}
            </h2>
            <p className="text-sm text-sub">
              {isFa
                ? 'طراحی‌شده برای معامله خودکار روی Toobit و KCEX + تست بدون ریسک در Paper Demo'
                : 'Built for Toobit, KCEX, and risk-free Paper Demo testing'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="surface-card p-6 space-y-4 hover:border-brand transition">
              <ModeGraphicAI />
              <h3 className="text-lg font-extrabold text-main">
                {isFa ? '۱. هوش مصنوعی مرکزی دلارینو' : '1. Central Multi-AI Engine'}
              </h3>
              <p className="text-xs text-sub leading-relaxed">
                {isFa
                  ? 'بدون نیاز به خرید اشتراک یا API شخصی! تیم ما ۱ تا ۳ مدل پیشرفته هوش مصنوعی را با هم ترکیب کرده و با اجماع دقیق برای شما معامله می‌کند.'
                  : 'Zero API key setup! Powered by 1–3 combined AI models voting in consensus with strict SL and 3-TP exits.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand">Multi-AI Consensus</span>
                <span className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand">Zero API Needed</span>
              </div>
            </div>

            <div className="surface-card p-6 space-y-4 hover:border-brand transition">
              <ModeGraphicCodex />
              <h3 className="text-lg font-extrabold text-main">
                {isFa ? '۲. استراتژی اختصاصی دلارینو V0.1' : '2. Dollarino V0.1 Strategy'}
              </h3>
              <p className="text-xs text-sub leading-relaxed">
                {isFa
                  ? 'کامل‌ترین و بهترین استراتژی اختصاصی دلارینو؛ ترکیب هوشمند چندلایه تمام الگوریتم‌ها با ریسک‌فری و حفظ سود خودکار.'
                  : 'Our unified master strategy combining all proven trend, sweep & momentum engines with automatic profit protection.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="px-2.5 py-1 rounded-lg bg-[#10D856]/15 text-signal">دلارینو V0.1</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#10D856]/15 text-signal">Free in Demo</span>
              </div>
            </div>

            <div className="surface-card p-6 space-y-4 hover:border-brand transition">
              <ModeGraphicTelegram />
              <h3 className="text-lg font-extrabold text-main">
                {isFa ? '۳. کپی‌ترید' : '3. Copy-Trade'}
              </h3>
              <p className="text-xs text-sub leading-relaxed">
                {isFa
                  ? 'کپی خودکار و لحظه‌ای تمام معاملات کانال @Dollarinoofficial یا کانال دلخواه شما با مدیریت خودکار حد سود و ضرر.'
                  : 'Automatically mirror signals from @Dollarinoofficial or your Telegram channel with full risk protection.'}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand">کپی‌ترید خودکار</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#FF8A00]/15 text-flame">Auto 3-TP</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Live Markets + Strict 2 Exchanges + Paper Demo */}
        <section id="markets" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-main">
                {isFa ? 'قیمت لحظه‌ای بازار و صرافی‌های متصل' : 'Live Markets & Supported Exchanges'}
              </h2>
              <p className="text-xs text-sub mt-1">
                {isFa
                  ? 'تمرکز اختصاصی روی صرافی‌های Toobit و KCEX + حساب دمو رایگان Paper برای تست'
                  : 'Dedicated support for Toobit & KCEX + free Paper Demo testing'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-extrabold">
              <span className="px-3.5 py-1.5 rounded-xl btn-cobalt">Toobit Futures</span>
              <span className="px-3.5 py-1.5 rounded-xl btn-emerald">KCEX 0% Fee</span>
              <span className="px-3.5 py-1.5 rounded-xl surface-card text-flame">Paper Demo</span>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="surface-soft border-b text-[11px] text-dim">
                  <tr>
                    <th className="py-4 px-5 text-start">{isFa ? 'ارز دیجیتال' : 'Asset'}</th>
                    <th className="py-4 px-5 text-end">{isFa ? 'قیمت (USDT)' : 'Price (USDT)'}</th>
                    <th className="py-4 px-5 text-end">{isFa ? 'تغییر ۲۴س' : '24h Change'}</th>
                    <th className="py-4 px-5 text-end hidden sm:table-cell">{isFa ? 'سقف / کف ۲۴س' : '24h High / Low'}</th>
                    <th className="py-4 px-5 text-end">{isFa ? 'معامله' : 'Trade'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {marketsList.map((m) => (
                    <tr key={m.symbol} className="hover:opacity-90 transition">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <CoinIcon symbol={m.symbol} size={36} />
                          <div>
                            <div className="font-extrabold text-main">
                              {isFa ? COIN_NAMES_FA[m.symbol] || m.symbol : m.symbol.replace('USDT', '')}
                            </div>
                            <div className="text-[11px] font-mono-num text-dim">{m.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-end font-mono-num font-extrabold text-main">
                        ${fmtPx(m.lastPrice)}
                      </td>
                      <td className="py-4 px-5 text-end font-mono-num">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            m.changePct24h >= 0
                              ? 'bg-[#10D856]/15 text-signal'
                              : 'bg-rose-500/15 text-rose-500'
                          }`}
                        >
                          {m.changePct24h >= 0 ? '+' : ''}
                          {m.changePct24h.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-4 px-5 text-end font-mono-num text-xs text-sub hidden sm:table-cell">
                        ${fmtPx(m.high24h)} / ${fmtPx(m.low24h)}
                      </td>
                      <td className="py-4 px-5 text-end">
                        <button
                          onClick={() => onOpenAuth('register')}
                          className="px-4 py-2 rounded-xl btn-cobalt text-xs font-bold"
                        >
                          {isFa ? 'شروع' : 'Trade'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 4. Subscription Pricing */}
        <section id="pricing" className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-main">
              {isFa ? 'تعرفه اشتراک‌های دلارینو' : 'Subscription Plans'}
            </h2>
            <p className="text-sm text-sub">
              {isFa
                ? 'شروع رایگان با Paper Demo و ارتقا با پرداخت تتر (TRC20) یا کارت‌به‌کارت'
                : 'Start free with Paper Demo and upgrade via USDT TRC20 or Card-to-Card'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(plans.length
              ? plans
              : [
                  {
                    code: 'free_demo',
                    name_fa: 'تست دمو (Paper Demo)',
                    name_en: 'Paper Demo Trial',
                    description_fa: 'تست استراتژی دلارینو V0.1 در حساب دمو',
                    description_en: 'Test Dollarino V0.1 in Paper Demo',
                    price_usd: 0,
                    price_toman: 0,
                    duration_days: 365,
                    features_json: '["حساب دمو با قیمت زنده بازار","اجرای استراتژی دلارینو V0.1","نصب نسخه ویندوز و موبایل"]',
                    is_popular: 0,
                  },
                  {
                    code: 'pro_monthly',
                    name_fa: 'اشتراک حرفه‌ای ماهانه (Pro)',
                    name_en: 'Pro Monthly',
                    description_fa: 'دسترسی کامل به هوش مصنوعی مرکزی، دلارینو V0.1 و کپی‌ترید',
                    description_en: 'Full Central AI, Dollarino V0.1 & Copy-Trade',
                    price_usd: 29,
                    price_toman: 1950000,
                    duration_days: 30,
                    features_json: '["هوش مصنوعی مرکزی ترکیبی (بدون نیاز به API)","کپی‌ترید خودکار کانال تلگرام","اتصال لایو صرافی Toobit و KCEX"]',
                    is_popular: 1,
                  },
                  {
                    code: 'vip_quarterly',
                    name_fa: 'اشتراک ویژه ۳ ماهه (VIP)',
                    name_en: 'VIP Quarterly',
                    description_fa: '۹۰ روز تمام امکانات Pro با ۳۲٪ تخفیف',
                    description_en: '90 days full VIP access with 32% savings',
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
                  className={`surface-card p-6 flex flex-col justify-between gap-5 ${
                    p.is_popular ? 'ring-2 ring-[#1464F6]' : ''
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-base text-main">{isFa ? p.name_fa : p.name_en}</span>
                      {p.is_popular ? (
                        <span className="px-2.5 py-0.5 rounded-full btn-cobalt text-[10px] font-black">
                          {isFa ? 'محبوب‌ترین' : 'POPULAR'}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono-num">
                      <span className="text-3xl font-black text-main">
                        {p.price_usd === 0 ? (isFa ? 'رایگان' : 'Free') : `$${p.price_usd}`}
                      </span>
                      {p.price_usd > 0 && (
                        <span className="text-xs text-dim ms-1.5">
                          / {p.duration_days} {isFa ? 'روز' : 'days'}
                        </span>
                      )}
                      {p.price_toman > 0 && (
                        <div className="text-xs text-signal font-sans font-bold mt-1">
                          {p.price_toman.toLocaleString()} تومان
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-sub">{isFa ? p.description_fa : p.description_en}</p>
                    <ul className="space-y-2.5 pt-3 border-t text-xs">
                      {feats.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-main">
                          <CheckCircle2 className="w-4 h-4 text-signal shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => onOpenAuth('register')}
                    className={`w-full py-3 rounded-2xl text-xs font-extrabold ${
                      p.is_popular ? 'btn-cobalt' : 'surface-soft hover:border-brand'
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

        {/* 5. Cobalt Hero PWA Install Card (Always crisp white text on cobalt gradient!) */}
        <section id="pwa" className="hero-cobalt p-7 sm:p-10 rounded-3xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-bold">
              <Rocket className="w-3.5 h-3.5 text-[#16E664]" />
              <span>Windows &amp; Mobile PWA Ready</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              {isFa
                ? 'نصب اپلیکیشن دلارینو روی ویندوز، اندروید و آیفون'
                : 'Install Dollarino on Windows, Android & iOS'}
            </h2>
            <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
              {isFa
                ? 'تنها با یک کلیک دلارینو را مثل یک برنامه واقعی روی دسکتاپ ویندوز یا صفحه اصلی موبایل نصب کنید و همیشه تمام‌صفحه و پرسرعت ترید کنید.'
                : 'Install Dollarino in one click as a standalone desktop or mobile app with instant offline shell and fast launch.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={handleInstallClick} className="px-6 py-3 rounded-2xl btn-emerald text-xs sm:text-sm inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب فوری اپ ویندوز / موبایل' : 'Install App Now (PWA)'}</span>
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm"
              >
                {isFa ? 'ورود به نسخه وب' : 'Open Web App'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col items-center justify-center gap-3">
            <DollarinoBrandMark size={132} glow />
            <div className="text-xs font-bold text-white/90 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#16E664]" />
              <span>{isFa ? 'رمزنگاری بانکی AES-256-GCM' : 'Bank-Grade AES-256 Encryption'}</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-4 sm:px-6 text-xs text-sub">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <DollarinoBrandMark size={28} />
            <span className="font-extrabold text-main">{isFa ? 'دلارینو (Dollarino)' : 'Dollarino Platform'}</span>
            <span className="text-dim">· {isFa ? 'هوش مصنوعی مرکزی · دلارینو V0.1 · کپی‌ترید' : 'Central AI · Dollarino V0.1 · Copy-Trade'}</span>
          </div>
          <div className="flex items-center gap-5 font-semibold">
            <button onClick={handleInstallClick} className="hover:text-brand transition">
              {isFa ? 'نصب PWA' : 'Install PWA'}
            </button>
            <button onClick={() => onOpenAuth('login')} className="hover:text-brand transition">
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button onClick={() => onOpenAuth('register')} className="hover:text-brand transition">
              {isFa ? 'ثبت‌نام' : 'Register'}
            </button>
          </div>
        </div>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
