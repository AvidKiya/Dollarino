import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CandlestickChart as CandleIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Coins,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Lock,
  Menu,
  Moon,
  Play,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Terminal as TerminalIcon,
  Trophy,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';
import type { LookId } from '../components/AppearanceModal';
import { DollarinoBrandMark, ModeGraphicAI, ModeGraphicCodex, ModeGraphicTelegram } from '../components/BrandGraphics';
import { CoinIcon } from '../components/CoinIcon';
import { Sparkline } from '../components/DollarinoViz';
import { HybridLab } from '../components/HybridLab';
import { PwaInstallModal } from '../components/PwaInstallModal';

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

interface SnapshotCoin {
  symbol: string;
  price: number;
  changePct24h: number;
  funding?: string;
}

export function LandingPage({
  lang,
  setLang,
  look,
  onToggleDaylight,
  onQuickDemo,
  onGoAuth,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  look: LookId;
  onToggleDaylight: () => void;
  onQuickDemo: () => Promise<void>;
  onGoAuth: (mode: 'login' | 'register') => void;
}) {
  const isFa = lang === 'fa';
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [hideBal, setHideBal] = useState(false);
  const [heroPreview, setHeroPreview] = useState<'desk' | 'simple' | 'ide'>('desk');
  const [showcaseTab, setShowcaseTab] = useState<'terminal' | 'desk' | 'chartai' | 'pine' | 'futures'>('terminal');
  const [heroCoin, setHeroCoin] = useState<'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'>('BTCUSDT');
  const [aiQuery, setAiQuery] = useState(
    isFa ? 'بهترین نقطه ورود و حد ضرر بیت‌کوین در ۱۵ دقیقه چیست؟' : 'What is the cleanest 15m BTC entry, stop-loss and targets?'
  );
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [liveCandles, setLiveCandles] = useState<number[]>([]);
  const [liveCoins, setLiveCoins] = useState<SnapshotCoin[]>([
    { symbol: 'BTCUSDT', price: 0, changePct24h: 0, funding: '0.0085%' },
    { symbol: 'ETHUSDT', price: 0, changePct24h: 0, funding: '0.0091%' },
    { symbol: 'SOLUSDT', price: 0, changePct24h: 0, funding: '0.0110%' },
    { symbol: 'BNBUSDT', price: 0, changePct24h: 0, funding: '0.0072%' },
    { symbol: 'XRPUSDT', price: 0, changePct24h: 0, funding: '0.0064%' },
  ]);
  const [openFaq, setOpenFaq] = useState<number>(0);
  const [pwaOpen, setPwaOpen] = useState(false);
  const pwa = usePwaInstall();

  useEffect(() => {
    apiFetch<{ plans: PublicPlan[] }>('/api/public/plans')
      .then((r) => {
        if (r.plans?.length) setPlans(r.plans);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<{
      candles?: Array<{ close: number }>;
      markets?: Array<{ symbol: string; lastPrice: number; changePct24h: number; fundingRate?: string }>;
    }>(`/api/public/market-snapshot?symbol=${heroCoin}`)
      .then((r) => {
        if (r.candles?.length) {
          setLiveCandles(r.candles.slice(-24).map((c) => Number(c.close)).filter((n) => n > 0));
        }
        if (r.markets?.length) {
          setLiveCoins(
            r.markets.map((m) => ({
              symbol: m.symbol,
              price: Number(m.lastPrice),
              changePct24h: Number(m.changePct24h || 0),
              funding: m.fundingRate ?? '0.008%',
            }))
          );
        }
      })
      .catch(() => {});
  }, [heroCoin]);

  const triggerDemo = async () => {
    setDemoBusy(true);
    try {
      await onQuickDemo();
    } finally {
      setDemoBusy(false);
    }
  };

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const runPreviewChartAI = () => {
    const coin = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;
    const p = coin.price || 60000;
    const dec = p > 1000 ? 0 : 2;
    setAiReply(
      isFa
        ? `${heroCoin.replace('USDT', '')}: ساختار روند تأیید شده (اطمینان ۷۸٪). محدوده ورود: $${p.toLocaleString()} · حد ابطال (SL): $${(p * 0.985).toFixed(dec)} · تارگت ۱: $${(p * 1.022).toFixed(dec)} · تارگت ۲: $${(p * 1.045).toFixed(dec)}.`
        : `${heroCoin.replace('USDT', '')}: Continuation bias (78% conf). Entry Zone: $${p.toLocaleString()} · Invalidation: $${(p * 0.985).toFixed(dec)} · Targets: $${(p * 1.022).toFixed(dec)} / $${(p * 1.045).toFixed(dec)}.`
    );
  };

  const activeCoin = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell relative overflow-x-clip">
      {/* Subtle Apple Cupertino Backdrop */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[760px] z-0 overflow-hidden">
        <div
          className={`absolute inset-0 ${look === 'paper' ? 'opacity-25' : 'opacity-45'}`}
          style={{
            backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text) 14%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 65% at 72% 20%, #000, transparent 78%)',
          }}
        />
        <div
          className={`absolute -top-32 end-[10%] h-[380px] w-[380px] rounded-full blur-[130px] ${
            look === 'paper' ? 'opacity-10' : 'opacity-22'
          }`}
          style={{ background: 'var(--gold)' }}
        />
      </div>

      {/* Sticky Floating Pill Navbar */}
      <header className="sticky top-0 z-40 px-3 sm:px-6 pt-3">
        <div
          className="mx-auto max-w-6xl panel rounded-full px-3 sm:px-5 py-2 flex items-center gap-2 shadow-xl backdrop-blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel) 86%, transparent)' }}
        >
          <button type="button" onClick={() => scrollTo('top')} className="flex items-center gap-2.5 shrink-0">
            <DollarinoBrandMark size={38} glow />
            <span className="leading-none text-start">
              <span dir="ltr" className="block font-display font-bold text-base text-main">
                Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
              </span>
              <span className="text-[9px] font-black tracking-[0.18em] text-dim">OS · V6</span>
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-1 mx-auto text-xs font-bold text-dim">
            {[
              ['showcase', isFa ? 'امکانات و پایانه' : 'Terminal Tour'],
              ['engines', isFa ? 'موتورهای ربات' : 'Engines'],
              ['lab', isFa ? 'آزمایشگاه ترکیب' : 'Hybrid Lab'],
              ['pricing', isFa ? 'تعرفه‌ها' : 'Pricing'],
              ['faq', isFa ? 'سوالات' : 'FAQ'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="px-3.5 py-2 rounded-full hover:text-main hover:bg-[var(--soft)] transition"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-2 rounded-full btn-ghost"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDaylight}
              title={isFa ? 'تغییر حالت روز و شب' : 'Day / Night'}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full btn-ghost text-xs font-bold"
            >
              {look === 'paper' ? (
                <>
                  <Moon className="h-4 w-4 text-[var(--gold)]" />
                  <span className="hidden sm:inline">{isFa ? 'حالت شب' : 'Night'}</span>
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4 text-[#f59e0b]" />
                  <span className="hidden sm:inline">{isFa ? 'حالت روز' : 'Day'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('login')}
              className="hidden sm:inline-flex btn-ghost px-3.5 py-2 rounded-full text-xs font-bold"
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => void triggerDemo()}
              className="btn-gold inline-flex items-center gap-1.5 text-[11px] font-black px-4 py-2.5 rounded-full"
            >
              <span>{demoBusy ? '...' : isFa ? 'ورود به میز دمو' : 'Launch App'}</span>
              <ArrowLeft className={`h-3.5 w-3.5 ${isFa ? '' : 'rotate-180'}`} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenu((v) => !v)}
              className="lg:hidden h-9 w-9 grid place-items-center rounded-full btn-ghost"
              aria-label="Menu"
            >
              {mobileMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="panel rounded-3xl mt-2 p-2.5 lg:hidden max-w-6xl mx-auto space-y-1">
            {[
              ['showcase', isFa ? 'امکانات و پایانه' : 'Terminal Tour'],
              ['engines', isFa ? 'موتورهای ربات' : 'Engines'],
              ['lab', isFa ? 'آزمایشگاه ترکیب' : 'Hybrid Lab'],
              ['pricing', isFa ? 'تعرفه‌ها' : 'Pricing'],
              ['faq', isFa ? 'سوالات' : 'FAQ'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="block w-full text-start px-4 py-2.5 rounded-2xl text-xs font-bold hover:bg-[var(--soft)]"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void triggerDemo()}
              className="btn-gold w-full py-3 rounded-2xl font-black text-xs mt-1"
            >
              {isFa ? 'شروع فوری رایگان ($۱۰,۰۰۰ دمو)' : 'Launch Free $10,000 Demo'}
            </button>
          </div>
        )}
      </header>

      {/* Live Scrolling Market Ticker Bar */}
      <div className="relative z-10 mt-3 overflow-hidden border-y hairline bg-[color:color-mix(in_srgb,var(--panel)_65%,transparent)] backdrop-blur-md py-2">
        <div className="flex w-max animate-ticker gap-6 text-xs font-num" dir="ltr">
          {[...liveCoins, ...liveCoins, ...liveCoins].map((c, idx) => {
            const up = c.changePct24h >= 0;
            return (
              <div key={`${c.symbol}-${idx}`} className="flex items-center gap-2 px-3">
                <CoinIcon symbol={c.symbol} size={18} />
                <span className="font-bold text-main">{c.symbol}</span>
                <span className="text-sub">{c.price > 0 ? `$${c.price.toLocaleString()}` : '$—'}</span>
                <span className={`font-black ${up ? 'text-jade' : 'text-loss'}`}>
                  {up ? '+' : ''}{c.changePct24h.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main id="top" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-20 py-10 sm:py-14">
        {/* 1. Editorial Hero + Interactive Cobalt Live Instrument & Neural Core */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.03fr_0.97fr] gap-10 xl:gap-14 items-center">
          <div className="text-center lg:text-start reveal-up">
            <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6">
              {[
                { icon: Rocket, text: isFa ? 'شروع در ۴ گام ساده + محیط Pine & Python' : '4-Step Simple + Pine/Python Pro IDE', color: 'var(--gold)' },
                { icon: ShieldCheck, text: 'Paper · Toobit · KCEX', color: 'var(--jade)' },
                { icon: Lock, text: isFa ? 'کارت سود HMAC-SHA256' : 'HMAC-Signed Profit Proof', color: 'var(--text)' },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <span key={b.text} className="inline-flex items-center gap-1.5 panel rounded-full px-3.5 py-1.5 text-[10px] font-black text-main">
                    <Icon className="h-3.5 w-3.5" style={{ color: b.color }} />
                    <span>{b.text}</span>
                  </span>
                );
              })}
            </div>

            <p className="text-[11px] font-black tracking-[0.18em] text-dim mb-3">
              {isFa ? 'دو دنیا در یک پلتفرم · ساده برای همه · کوانت برای حرفه‌ای‌ها' : 'TWO WORLDS IN ONE · EFFORTLESS FOR BEGINNERS · QUANT FOR PROS'}
            </p>

            <h1 className="font-display font-bold tracking-tight leading-[1.16] text-[clamp(36px,7.5vw,66px)] text-main">
              {isFa ? (
                <>
                  شما استراحت کنید،
                  <br />
                  <span style={{ color: 'var(--gold)' }}>دلارینو </span>
                  <span className="mark-lime">بازار</span>
                  <br />
                  را شکار می‌کند.
                </>
              ) : (
                <>
                  You rest.
                  <br />
                  <span style={{ color: 'var(--gold)' }}>Dollarino </span>
                  <span className="mark-lime">hunts</span>
                  <br />
                  the market.
                </>
              )}
            </h1>

            <p className="mt-5 text-sm sm:text-[15px] leading-[1.9] text-dim max-w-xl mx-auto lg:mx-0">
              {isFa
                ? 'در حالت ساده فقط سرمایه را مشخص کنید و در ۴ گام ربات ۲۴/۷ خود را روشن کنید تا خودکار معامله و سودسازی کند. در حالت حرفه‌ای کد Pine Script یا Python بنویسید، روی چارت زنده اجرا کنید و به صرافی‌های Toobit و KCEX متصل شوید.'
                : 'In Simple Mode just enter your capital and follow 4 guided steps to launch a 24/7 autonomous earner. Switch to Pro Mode to author TradingView Pine Script & Python strategies directly on live charts.'}
            </p>

            <div className="mt-7 flex flex-wrap justify-center lg:justify-start gap-3">
              <button
                type="button"
                disabled={demoBusy}
                onClick={() => void triggerDemo()}
                className="btn-lime inline-flex items-center gap-2 font-black px-7 py-4 rounded-2xl text-sm"
              >
                <Zap className="h-[18px] w-[18px]" />
                <span>{demoBusy ? '...' : isFa ? 'شروع رایگان در دمو ($۱۰,۰۰۰)' : 'Start Free in Demo ($10k)'}</span>
              </button>
              <button
                type="button"
                onClick={() => scrollTo('showcase')}
                className="btn-ghost inline-flex items-center gap-2 font-bold px-6 py-4 rounded-2xl text-sm"
              >
                <Play className="h-4 w-4" />
                <span>{isFa ? 'ببین چطور کار می‌کند' : 'See How It Works'}</span>
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-xs font-bold text-dim">
              {[
                isFa ? 'بدون کلید API برای دمو' : 'No API keys needed for Demo',
                isFa ? 'اهرم در اختیار تو (تا ۵۰×)' : 'Leverage up to 50×',
                isFa ? 'بدون محدودیت ارز (۸۰۷ جفت‌ارز)' : '807 live pairs',
              ].map((x) => (
                <span key={x} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-jade" />
                  <span>{x}</span>
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap justify-center lg:justify-start items-center gap-3 text-xs font-bold text-dim">
              <span className="flex" style={{ color: 'var(--gold)' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </span>
              <span>{isFa ? '۴.۹ رضایت کاربران · بیش از ۱۲K تریدر فعال' : '4.9 rating · 12K+ active traders'}</span>
            </div>
          </div>

          {/* Interactive Animated Live Instrument Device Mockup */}
          <div className="relative">
            <div className="panel glow-card-anim rounded-[30px] p-4 sm:p-5 shadow-2xl space-y-3.5 relative">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black tracking-widest text-dim">
                <div className="flex items-center gap-2">
                  <DollarinoBrandMark size={24} />
                  <span>DOLLARINO OS V7</span>
                </div>
                <div className="ios-segmented p-0.5 text-[10px]">
                  {[
                    { id: 'desk' as const, l: isFa ? 'نمای زنده' : 'Desk' },
                    { id: 'simple' as const, l: isFa ? 'حالت ساده' : 'Simple' },
                    { id: 'ide' as const, l: 'Pine / Py' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setHeroPreview(m.id)}
                      className={`px-2.5 py-1 rounded-full font-black transition ${heroPreview === m.id ? 'ios-pill-active' : 'text-dim'}`}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>

              {heroPreview === 'desk' && (
                <>
                  {/* Signature Cobalt Wallet Card with 3D AI Core */}
                  <div
                    className="rounded-[22px] p-5 text-white relative overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #1b54f5 0%, #0d32b5 58%, #071d70 100%)' }}
                  >
                    <img
                      src="/assets/hero-core.png"
                      alt="Dollarino AI Core"
                      className="pointer-events-none absolute -end-6 -top-8 w-44 h-44 object-contain opacity-65 mix-blend-screen animate-floaty-slow"
                    />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold opacity-80">{isFa ? 'موجودی دمو · USD' : 'Paper Demo · USD'}</span>
                        <button type="button" onClick={() => setHideBal((v) => !v)} className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20">
                          {hideBal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular mt-1.5">
                        {hideBal ? '••••••' : '$10,000.00'}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span dir="ltr" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black" style={{ background: 'var(--lime)', color: '#09111f' }}>
                          +12.4% · Weekly
                        </span>
                        <span className="text-[11px] font-semibold opacity-80">{isFa ? 'آماده اسکن ۲۴/۷' : '24/7 Engine Ready'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Market Rows inside Device */}
                  <div className="space-y-2">
                    {liveCoins.slice(0, 4).map((c) => {
                      const up = c.changePct24h >= 0;
                      return (
                        <button
                          key={c.symbol}
                          type="button"
                          onClick={() => setHeroCoin(c.symbol === 'ETHUSDT' || c.symbol === 'SOLUSDT' ? c.symbol : 'BTCUSDT')}
                          className="w-full rounded-2xl surface-soft px-3.5 py-2.5 flex items-center gap-3 hover:border-[var(--gold)] transition text-xs"
                        >
                          <CoinIcon symbol={c.symbol} size={26} />
                          <span className="font-bold text-main w-12 text-start">{c.symbol.replace('USDT', '')}</span>
                          <div className="flex-1 h-6">
                            <Sparkline
                              values={
                                c.symbol === heroCoin && liveCandles.length >= 4
                                  ? liveCandles.slice(-10)
                                  : [100, 102, 101, 103, up ? 105 : 98]
                              }
                              height={22}
                              color={up ? '#10d9a3' : '#ff4d6d'}
                              fill={false}
                            />
                          </div>
                          <span dir="ltr" className="font-num font-bold text-main tabular">
                            {c.price > 0 ? `$${c.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                          </span>
                          <span dir="ltr" className={`font-num font-bold w-14 text-end ${up ? 'text-jade' : 'text-loss'}`}>
                            {up ? '+' : ''}{c.changePct24h.toFixed(2)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {heroPreview === 'simple' && (
                <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-main">{isFa ? 'راه‌اندازی ۴ مرحله‌ای ساده' : '4-Step Auto-Bot Setup'}</span>
                    <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{isFa ? 'بدون نیاز به دانش فنی' : 'Zero Coding'}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold">
                    <div className="badge-signal rounded-xl py-2 text-center">1. $1,000</div>
                    <div className="badge-signal rounded-xl py-2 text-center">2. Balanced</div>
                    <div className="btn-cobalt rounded-xl py-2 text-center">3. دُرنا V1</div>
                    <div className="surface-card rounded-xl py-2 text-center text-dim">4. Launch</div>
                  </div>
                  <div className="rounded-2xl bg-[#07112b] text-white p-4 space-y-2">
                    <div className="flex justify-between text-[11px] text-white/70">
                      <span>{isFa ? 'انتظار سود با حفاظت TP1 Risk-Free' : 'Auto 3-TP + Trailing Shield'}</span>
                      <span className="text-jade font-bold">ACTIVE</span>
                    </div>
                    <p className="text-xs leading-relaxed text-white/90">
                      {isFa
                        ? 'فقط مبلغ را بگذارید و تأیید بزنید؛ ربات خودکار بازار را اسکن، معامله را باز و سود را برداشت می‌کند.'
                        : 'Allocate funds once and let your bot scan all 807 markets 24/7 automatically.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => void triggerDemo()} className="btn-lime w-full py-3 rounded-xl font-black">
                    {isFa ? 'تست رایگان همین حالا' : 'Try Guided Setup Free'}
                  </button>
                </div>
              )}

              {heroPreview === 'ide' && (
                <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-main flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-jade" />
                      <span>Pine Script v5 · Python Quant</span>
                    </span>
                    <img src="/assets/ide-prism.png" alt="Quant Prism" className="w-9 h-9 rounded-lg object-cover" />
                  </div>
                  <pre dir="ltr" className="rounded-xl bg-[#050c20] text-[#93c5fd] p-3 font-mono text-[10px] leading-relaxed overflow-x-auto">
{`//@version=5
strategy("Dollarino EMA 9/21", overlay=true)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
plot(fast, "EMA 9", color=color.aqua)
strategy.entry("L", strategy.long,
  when=ta.crossover(fast, slow))`}
                  </pre>
                  <button type="button" onClick={() => void triggerDemo()} className="btn-cobalt w-full py-2.5 rounded-xl font-black">
                    {isFa ? 'باز کردن Pine / Python IDE زنده' : 'Open Live Strategy IDE'}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 text-[10px] font-black text-dim">
                <span>LIVE DESK · 807 PAIRS</span>
                <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--lime)', color: '#09111f' }}>
                  {isFa ? 'اسپات + فیوچرز + Pine/Py' : 'SPOT · FUTURES · IDE'}
                </span>
              </div>
            </div>

            {/* Floating Live Badge Top-Start */}
            <div className="hidden sm:flex items-center gap-2.5 panel rounded-2xl px-3.5 py-2 shadow-xl animate-floaty absolute -top-4 -start-4">
              <span className="h-8 w-8 rounded-xl bg-jade/15 text-jade grid place-items-center">
                <ArrowUpRight className="w-4 h-4" />
              </span>
              <div className="text-xs">
                <p className="font-bold text-jade tabular" dir="ltr">LONG {activeCoin.symbol.replace('USDT', '')}</p>
                <p className="text-[10px] text-dim">{isFa ? 'مجهز به ۳ تارگت و تریلینگ' : '3-TP & Trailing Protected'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Big Metric Cards (Animated Pop) */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['807+', isFa ? 'جفت‌ارز زنده' : 'Live Perpetuals'],
            ['20', isFa ? 'معامله همزمان' : 'Parallel Trades'],
            ['Pine + Py', isFa ? 'کدنویسی روی چارت' : 'Live Script IDE'],
            ['50×', isFa ? 'سقف اهرم آزاد' : 'Max Leverage'],
          ].map(([v, l]) => (
            <div key={l} className="panel panel-hover rounded-3xl py-5 px-4 text-center">
              <p dir="ltr" className="font-display font-bold text-2xl sm:text-4xl tabular" style={{ color: 'var(--gold)' }}>
                {v}
              </p>
              <p className="text-xs font-bold text-dim mt-1">{l}</p>
            </div>
          ))}
        </section>

        {/* 2. Interactive Product Tour */}
        <section id="showcase" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
                {isFa ? 'همه‌چیز، یک‌جا — پایانه و ابزارهای هوشمند' : 'EVERYTHING IN ONE WORKSPACE'}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'تور زنده پایانه، ربات ۴ مرحله‌ای، چارت AI و Pine/Python' : 'Pro Terminal, 4-Step Auto-Bot, Chart AI & Pine/Python IDE'}
              </h2>
            </div>

            <div className="inline-flex p-1 panel rounded-full overflow-x-auto no-scrollbar">
              {[
                { id: 'terminal' as const, icon: CandleIcon, l: isFa ? 'پایانه و چارت' : 'Terminal' },
                { id: 'desk' as const, icon: Cpu, l: isFa ? '۰۱ ربات و سپر ریسک' : '01 Auto Bot' },
                { id: 'chartai' as const, icon: BrainCircuit, l: isFa ? '۰۲ دستیار چارت AI' : '02 Chart AI' },
                { id: 'pine' as const, icon: Code2, l: isFa ? '۰۳ کدنویسی Pine/Py' : '03 Pine & Py' },
                { id: 'futures' as const, icon: Coins, l: isFa ? '۰۴ بازار فیوچرز' : '04 Markets' },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setShowcaseTab(t.id)}
                    className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 whitespace-nowrap ${
                      showcaseTab === t.id ? 'btn-gold' : 'text-dim hover:text-main'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel rounded-[28px] p-5 sm:p-7">
            {showcaseTab === 'terminal' && (
              <div className="grid lg:grid-cols-3 gap-5 items-center">
                <div className="lg:col-span-2 surface-soft rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-main flex items-center gap-2">
                      <CoinIcon symbol={activeCoin.symbol} size={22} />
                      {activeCoin.symbol} · Futures · 15m
                    </span>
                    <div className="flex gap-1.5 text-[10px]">
                      {['1m', '5m', '15m', '1h', '4h', '1D'].map((tf) => (
                        <span key={tf} className={`px-2 py-0.5 rounded ${tf === '15m' ? 'btn-gold' : 'bg-black/20 text-dim'}`}>
                          {tf}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="h-44 rounded-xl bg-black/20 border hairline p-3 flex flex-col justify-between">
                    <div className="flex justify-between text-[10px] font-num">
                      <span className="text-jade">TP2 ${(Math.max(1, activeCoin.price) * 1.04).toFixed(0)}</span>
                      <span className="text-main">Entry ${(activeCoin.price || 60000).toFixed(0)}</span>
                      <span className="text-loss">SL ${(Math.max(1, activeCoin.price) * 0.985).toFixed(0)}</span>
                    </div>
                    <Sparkline
                      values={liveCandles.length >= 4 ? liveCandles : [58, 59, 58.6, 60, 61.5, 62]}
                      height={110}
                      color="#10d9a3"
                    />
                  </div>
                </div>
                <div className="space-y-3 text-xs">
                  <h3 className="font-display font-bold text-xl text-main">{isFa ? 'پایانه یکپارچه فیوچرز + AI' : 'Unified Futures & AI Terminal'}</h3>
                  <p className="text-dim leading-relaxed">
                    {isFa
                      ? '۸۰۷ جفت‌ارز، دفتر سفارش زنده (Order Book)، رسم خودکار سطوح Entry/SL/TP1-3 و خطوط KBOS روی کندل‌ها، به همراه اجرای سفارش با یک کلیک.'
                      : '807 pairs, live Order Book, auto-drawn Entry/SL/TP1-3 & KBOS levels on candlesticks, and 1-click ticket execution.'}
                  </p>
                  <button type="button" onClick={() => void triggerDemo()} className="btn-gold w-full py-3 rounded-xl text-xs">
                    {isFa ? 'ورود به پایانه زنده' : 'Open Live Terminal'}
                  </button>
                </div>
              </div>
            )}

            {showcaseTab === 'desk' && (
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <div className="space-y-3">
                  <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--gold)' }}>
                    01 · AUTONOMOUS EXCHANGE
                  </span>
                  <h3 className="font-display font-bold text-2xl text-main">{isFa ? 'میز ربات خودکار + سپر ریسک سخت‌گیرانه' : 'Agent Desk + Strict Risk Engine'}</h3>
                  <p className="text-xs text-dim leading-relaxed">
                    {isFa
                      ? 'ویزارد ۴ مرحله‌ای شروع کار، سقف ضرر روزانه، حد ضرر اجباری، انتقال خودکار استاپ به نقطه ورود در TP1، و کلید توقف اضطراری (Kill Switch).'
                      : '4-step Setup Wizard, daily max-loss guard, mandatory SL, Break-Even on TP1, and instant Kill Switch.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { l: isFa ? 'سرعت اجرا' : 'Execution', v: '< 1s', c: 'text-jade' },
                    { l: isFa ? 'سقف ضرر روزانه' : 'Daily Loss Cap', v: '3% – 12%', c: 'text-goldsoft' },
                    { l: isFa ? 'تارگت خودکار' : 'Take Profits', v: '3 Stages + BE', c: 'text-brand' },
                    { l: isFa ? 'سوییچ اضطراری' : 'Kill Switch', v: '1-Click Settle', c: 'text-loss' },
                  ].map((x) => (
                    <div key={x.l} className="surface-soft rounded-2xl p-4">
                      <p dir="ltr" className={`font-display font-bold text-xl ${x.c}`}>{x.v}</p>
                      <p className="text-dim mt-1">{x.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showcaseTab === 'chartai' && (
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <div className="space-y-3">
                  <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--gold)' }}>
                    02 · INTERACTIVE CHART AI
                  </span>
                  <h3 className="font-display font-bold text-2xl text-main">{isFa ? 'با چارت زنده صحبت کن و سطوح را روی کندل ببین' : 'Ask Anything About Any Chart'}</h3>
                  <div className="flex gap-2">
                    <input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} className="field text-xs" />
                    <button type="button" onClick={runPreviewChartAI} className="btn-gold px-4 rounded-xl text-xs shrink-0">
                      {isFa ? 'تحلیل' : 'Ask'}
                    </button>
                  </div>
                  {aiReply && <div className="badge-signal rounded-2xl p-3.5 text-xs leading-relaxed">{aiReply}</div>}
                </div>
                <div className="surface-soft rounded-2xl p-5 space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-main">
                    <Target className="w-4 h-4 text-jade" />
                    <span>{isFa ? 'امکانات کامل چارت AI داخل پنل:' : 'Full Chart AI inside workspace:'}</span>
                  </div>
                  <p className="text-dim">• {isFa ? 'ذخیره تاریخچه گفتگوها و بازگردانی تحلیل‌های قبلی' : 'Persistent chat threads & annotations'}</p>
                  <p className="text-dim">• {isFa ? 'محدوده ورود + حد ضرر + ۳ تارگت + حمایت/مقاومت' : 'Entry Zone, SL, TP1–TP3 & S/R zones'}</p>
                  <p className="text-dim">• {isFa ? 'انتقال مستقیم سطوح به فرم سفارش با یک کلیک' : '1-click copy levels to Order Ticket'}</p>
                </div>
              </div>
            )}

            {showcaseTab === 'pine' && (
              <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-6 items-center">
                <div className="space-y-3">
                  <span className="text-[10px] font-black tracking-widest text-jade">
                    03 · PINE SCRIPT V5 & PYTHON QUANT IDE
                  </span>
                  <h3 className="font-display font-bold text-2xl text-main">
                    {isFa ? 'کد تریدینگ‌ویو و پایتون را مستقیم روی چارت زنده اجرا کن' : 'Paste Pine Script or Python — Trade Live Off Your Code'}
                  </h3>
                  <p className="text-xs text-dim leading-relaxed">
                    {isFa
                      ? 'پشتیبانی از ta.ema، ta.sma، ta.bb، ta.supertrend، ta.rsi، plot() و strategy.entry بدون نیاز به سرور خارجی؛ رسم خطوط روی چارت، بک‌تست لحظه‌ای و فعال‌سازی ربات ۲۴/۷ با یک کلیک.'
                      : 'Native parser for ta.ema, ta.bb, ta.supertrend, ta.rsi, plot() & strategy.entry — instant live chart plots, Sharpe/DD backtesting, and 1-click autonomous deployment.'}
                  </p>
                  <pre dir="ltr" className="rounded-2xl bg-[#050c20] border border-blue-500/25 p-3.5 font-mono text-[11px] text-[#a5f3fc] overflow-x-auto">
{`# Python or Pine Script v5
def generate_signals(df):
    bb_mid, upper, lower = ta.bbands(df['close'], 20, 2.0)
    plot("BB Upper", upper, "#ff4d6d")
    df.loc[crossover(df['close'], lower), 'signal'] = 1`}
                  </pre>
                </div>
                <div className="panel rounded-3xl p-5 flex flex-col items-center text-center gap-3 glow-card-anim">
                  <img src="/assets/ide-prism.png" alt="Dollarino Pine & Python Engine" className="w-40 h-40 object-contain rounded-2xl animate-floaty" />
                  <p className="text-xs font-bold text-main">
                    {isFa ? '۶ قالب آماده Pine و Python + سازنده بصری بدون کد' : '6 Ready Templates + Visual Rule Builder'}
                  </p>
                  <button type="button" onClick={() => void triggerDemo()} className="btn-lime w-full py-2.5 rounded-xl text-xs font-black">
                    {isFa ? 'ساخت استراتژی اختصاصی' : 'Launch Strategy IDE'}
                  </button>
                </div>
              </div>
            )}

            {showcaseTab === 'futures' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-xl text-main">{isFa ? '۰۳ · جدول زنده بازار فیوچرز' : '03 · Live Perpetual Futures'}</h3>
                  <button type="button" onClick={() => void triggerDemo()} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
                    {isFa ? 'مشاهده کل ۸۰۷ ارز ←' : 'Explore 807 pairs →'}
                  </button>
                </div>
                <div className="space-y-2">
                  {liveCoins.map((c) => (
                    <div key={c.symbol} className="surface-soft rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={c.symbol} size={24} />
                        <span className="font-bold text-main">{c.symbol}</span>
                      </div>
                      <span dir="ltr" className="font-num font-bold text-main">
                        {c.price > 0 ? `$${c.price.toLocaleString()}` : '—'}
                      </span>
                      <span dir="ltr" className={`font-num font-bold ${c.changePct24h >= 0 ? 'text-jade' : 'text-loss'}`}>
                        {c.changePct24h >= 0 ? '+' : ''}{c.changePct24h.toFixed(2)}%
                      </span>
                      <span dir="ltr" className="hidden sm:inline text-dim font-num">Funding {c.funding}</span>
                      <button type="button" onClick={() => void triggerDemo()} className="btn-gold px-3 py-1.5 rounded-xl text-[11px]">
                        {isFa ? 'معامله' : 'Trade'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3. Three Engines with Custom Brand SVG Artwork (BrandGraphics.tsx) */}
        <section id="engines" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
              THREE AUTONOMOUS ENGINES
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'سه موتور. یک مغز.' : 'Three Engines. One Brain.'}
            </h2>
            <p className="text-xs sm:text-sm text-dim mt-2">
              {isFa ? 'هر کدام را جداگانه فعال کنید، یا در آزمایشگاه ترکیب، هر سه را کنار هم قرار دهید.' : 'Run individually or combine all three inside Hybrid Lab.'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                art: <ModeGraphicAI />,
                code: 'DORR-BIN',
                title: isFa ? 'هوش مصنوعی دُرّبین (Multi-AI)' : 'Dorrbin Multi-AI Consensus',
                desc: isFa ? 'ترکیب چند مدل پیشرفته — DeepSeek، Claude، GPT و Gemini. بدون نیاز به کلید API، فقط اجماع و اجرا.' : 'Centralized multi-LLM consensus checking structure & momentum.',
                c: '#2b74ff',
              },
              {
                art: <ModeGraphicCodex />,
                code: 'PINE · PYTHON · KBOS',
                title: isFa ? 'استراتژی‌های دُرنا، Pine Script و Python' : 'Dorna V1, Pine Script & Python IDE',
                desc: isFa ? '۶ استراتژی کوانت آماده به همراه محیط کدنویسی Pine Script v5 و Python با رسم مستقیم روی چارت و بک‌تستر ۹۰۰ کندلی.' : 'Built-in quant engines plus live Pine Script v5 & Python IDE with 900-bar backtesting.',
                c: '#10d9a3',
              },
              {
                art: <ModeGraphicTelegram />,
                code: 'MIRROR',
                title: isFa ? 'کپی‌ترید آینه (تلگرام و TradingView)' : 'Telegram & TradingView Mirror',
                desc: isFa ? 'سیگنال‌های کانال تلگرام و وب‌هوک TradingView را در کمتر از یک ثانیه با مدیریت ۳ تارگت اجرا می‌کند.' : 'Sub-second auto execution from Telegram channels & TradingView alerts.',
                c: '#ff8a00',
              },
            ].map((e) => (
              <div key={e.code} className="panel panel-hover glow-card-anim rounded-[26px] p-5 space-y-4">
                {e.art}
                <div className="flex items-center justify-between">
                  <span dir="ltr" className="text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: `${e.c}20`, color: e.c }}>
                    {e.code}
                  </span>
                </div>
                <h3 className="font-display font-bold text-lg text-main">{e.title}</h3>
                <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3B. Cryptographic Security Vault & Server HMAC Verified Profit Cards */}
        <section className="panel glow-card-anim rounded-[30px] p-6 sm:p-8 grid md:grid-cols-[0.85fr_1.15fr] gap-8 items-center">
          <div className="flex justify-center">
            <img
              src="/assets/vault-shield.png"
              alt="Dollarino Vault Security"
              className="w-52 h-52 object-contain rounded-3xl animate-floaty-slow"
            />
          </div>
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[10px] font-black">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ZERO-TRUST SECURITY · HMAC-SHA256 PROOF</span>
            </span>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
              {isFa ? 'امنیت بانکی کلیدها + کارت سود غیرقابل جعل' : 'Bank-Grade Key Vault + Tamper-Proof Profit Cards'}
            </h2>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'تمامی کلیدهای صرافی Toobit و KCEX با الگوریتم AES-256-GCM رمزنگاری می‌شوند و فقط دسترسی معامله دارند (برداشت غیرممکن). علاوه بر این، هر کارت سود هفتگی شما با امضای دیجیتال سرور HMAC-SHA256 و لینک QR عمومی تایید می‌شود تا هیچ‌کس نتواند آمار ساختگی بسازد.'
                : 'Exchange keys are AES-256-GCM encrypted with strict trade-only permissions. Every Profit Card is cryptographically HMAC-SHA256 signed by the server with an instant public QR verifier.'}
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5 text-xs">
              {[
                [isFa ? 'رمزنگاری AES-256' : 'AES-256 Vault', isFa ? 'حافظه ایزوله سرور' : 'Encrypted at rest'],
                [isFa ? 'بدون مجوز برداشت' : 'Zero Withdrawal', isFa ? 'سرمایه در صرافی خودت' : 'Funds stay on exchange'],
                [isFa ? 'اثبات HMAC + QR' : 'HMAC + QR Verify', isFa ? 'استعلام لحظه‌ای اصالت' : 'Public anti-fake proof'],
              ].map(([t, s]) => (
                <div key={t} className="surface-soft rounded-2xl p-3">
                  <p className="font-black text-main">{t}</p>
                  <p className="text-[11px] text-dim mt-0.5">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Interactive Hybrid Lab right on Landing (01.zip) */}
        <section id="lab" className="space-y-4">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
              HYBRID STRATEGY COMPOSER
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'مدل ترکیبی خودت را بساز و زنده تست کن' : 'Build Your Hybrid Blend Live'}
            </h2>
          </div>
          <HybridLab lang={lang} onTryDemo={() => void triggerDemo()} />
        </section>

        {/* 5. Pricing Plans (from Live D1) */}
        <section id="pricing" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
              TRANSPARENT PLANS
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'ساده شروع کن. جدی ادامه بده.' : 'Start Free in Demo. Upgrade Anytime.'}
            </h2>
          </div>

          <div className="panel rounded-[26px] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border border-[#12E35D]/30">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-jade uppercase">FREE FOREVER · PAPER DEMO</span>
              <h3 className="font-display font-bold text-xl text-main">
                {isFa ? 'حساب دمو رایگان ($۱۰,۰۰۰ موجودی تمرین)' : 'Free Paper Desk ($10,000 Virtual Funds)'}
              </h3>
              <p className="text-xs text-sub">
                {isFa
                  ? 'حالت ساده و حرفه‌ای + پایانه چارت + استراتژی دُرنا V1 و KBOS + کارت هفتگی PNG — کاملاً رایگان بدون ریسک.'
                  : 'Simple & Pro Modes + Candlestick Terminal + Dorna V1 & KBOS + Weekly Card PNG — 100% Free forever.'}
              </p>
            </div>
            <button type="button" onClick={() => void triggerDemo()} className="btn-emerald px-6 py-3.5 rounded-2xl text-xs font-black shrink-0">
              {isFa ? 'ورود فوری رایگان ($۱۰,۰۰۰)' : 'Start Free Demo Now'}
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.filter((p) => p.price_usd > 0).map((p) => {
              let feats: string[] = [];
              try {
                feats = JSON.parse(p.features_json || '[]') as string[];
              } catch {
                feats = [];
              }
              return (
                <div key={p.code} className={`panel rounded-[26px] p-6 flex flex-col justify-between space-y-5 ${p.is_popular ? 'ring-2 ring-[var(--gold)]' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase" style={{ color: 'var(--gold-soft)' }}>{p.code}</span>
                      {p.is_popular === 1 && <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{isFa ? 'محبوب‌ترین' : 'POPULAR'}</span>}
                    </div>
                    <h3 className="font-display font-bold text-xl text-main mt-1">{isFa ? p.name_fa : p.name_en}</h3>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span dir="ltr" className="font-display font-bold text-3xl text-main">${p.price_usd}</span>
                      <span className="text-xs text-dim">/ {p.duration_days} {isFa ? 'روز' : 'days'}</span>
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-sub">
                      {feats.slice(0, 4).map((f) => (
                        <li key={f} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 text-jade" /><span>{f}</span></li>
                      ))}
                    </ul>
                  </div>
                  <button type="button" onClick={() => onGoAuth('register')} className="btn-cobalt w-full py-3 rounded-2xl text-xs font-black">
                    {isFa ? 'انتخاب پلن و ثبت‌نام' : 'Choose Plan'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 6. FAQ Preview */}
        <section id="faq" className="max-w-3xl mx-auto space-y-4">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-main text-center">
            {isFa ? 'سوالات پرتکرار' : 'Frequently Asked Questions'}
          </h2>
          <div className="panel rounded-[26px] p-5 space-y-2.5">
            {(isFa
              ? [
                  ['آیا برای شروع نیاز به کلید API صرافی یا هوش مصنوعی دارم؟', 'خیر! بلافاصله پس از کلیک روی ورود دمو، حساب $۱۰,۰۰۰ رایگان با قیمت لحظه‌ای صرافی در اختیارتان است و هوش مصنوعی دُرّبین نیز مرکزی است.'],
                  ['کدام صرافی‌ها پشتیبانی می‌شوند؟', 'صرافی Toobit Futures به‌صورت مستقیم و خودکار با کلید رمزنگاری‌شده AES-256 (فقط مجوز معامله و بدون دسترسی برداشت) متصل می‌شود و برای KCEX Mirror نیز سیگنال‌دهی هماهنگ و کارمزد میکر ۰٪ فعال است.'],
                  ['آیا می‌توانم اپلیکیشن را روی موبایل و دسکتاپ نصب کنم؟', 'بله! دلارینو یک وب‌اپ پیشرفته (PWA) است و با یک کلیک روی ویندوز، مک، آیفون و اندروید نصب می‌شود.'],
                ]
              : [
                  ['Do I need exchange or LLM API keys to start?', 'No — Paper Demo gives $10,000 live-quote credit instantly, and Dorrbin Multi-AI runs centrally on the platform.'],
                  ['Which live exchanges are supported?', 'Toobit USDT-M Futures connects directly via AES-256 encrypted Trade-Only API keys (zero withdrawal scope), alongside KCEX Signal-Mirror (0% maker fee).'],
                  ['Can I install Dollarino as an app?', 'Yes — installable PWA across iOS, Android, macOS, and Windows.'],
                ]
            ).map(([q, a], i) => (
              <div key={q} className="surface-soft rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-start text-xs sm:text-sm font-bold text-main"
                >
                  <span>{q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <p className="px-4 pb-3.5 text-xs text-dim leading-relaxed">{a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* 7. Install PWA & Closing CTA */}
        <section className="panel rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 max-w-xl">
            <DollarinoBrandMark size={64} glow />
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
                PWA · DESKTOP · MOBILE · TELEGRAM
              </span>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-main mt-1">
                {isFa ? 'بازار حرکت می‌کند. دلارینو تصمیم می‌گیرد.' : 'The Market Moves. Dollarino Decides.'}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPwaOpen(true)} className="btn-ghost px-5 py-3.5 rounded-2xl text-xs font-bold inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              <span>{pwa.canPromptNatively ? (isFa ? 'نصب اپلیکیشن' : 'Install App') : isFa ? 'نصب روی موبایل / ویندوز' : 'Install PWA'}</span>
            </button>
            <button type="button" onClick={() => void triggerDemo()} className="btn-gold px-6 py-3.5 rounded-2xl text-xs font-black">
              {isFa ? 'فعال‌سازی رایگان دلارینو' : 'Activate Dollarino Free'}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t hairline py-8 px-4 text-center text-xs text-dim space-y-2">
        <div className="flex items-center justify-center gap-2">
          <DollarinoBrandMark size={24} />
          <span className="font-bold text-main">Dollarino OS · v6</span>
        </div>
        <p className="opacity-75">
          {isFa
            ? 'هر بازار. یک موتور. معاملات فیوچرز دارای ریسک است — همیشه ابتدا در حساب دمو تست کنید.'
            : 'Every market. One engine. Always test strategies inside Paper Demo before live execution.'}
        </p>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
