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
  Coins,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Menu,
  Moon,
  Palette,
  Play,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
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
  onOpenAppearance,
  onToggleDaylight,
  onQuickDemo,
  onGoAuth,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  look: LookId;
  onOpenAppearance: () => void;
  onToggleDaylight: () => void;
  onQuickDemo: () => Promise<void>;
  onGoAuth: (mode: 'login' | 'register') => void;
}) {
  const isFa = lang === 'fa';
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [hideBal, setHideBal] = useState(false);
  const [showcaseTab, setShowcaseTab] = useState<'terminal' | 'desk' | 'chartai' | 'futures'>('terminal');
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
      {/* Ambient Hero Aura & Dots (01.zip Site.tsx) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[920px] z-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text) 16%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 65% at 72% 20%, #000, transparent 78%)',
          }}
        />
        <div
          className="absolute -top-32 end-[10%] h-[420px] w-[420px] rounded-full blur-[125px] opacity-28"
          style={{ background: 'var(--gold)' }}
        />
        <div
          className="absolute top-[380px] start-[6%] h-[280px] w-[280px] rounded-full blur-[110px] opacity-18"
          style={{ background: 'var(--lime)' }}
        />
      </div>

      {/* Top Announcement Ribbon (01.zip) */}
      <div
        className="relative z-30 text-center py-2 px-3 text-[11px] font-bold border-b hairline"
        style={{ background: 'var(--gold)', color: '#fff' }}
      >
        <span className="inline-flex items-center gap-2 flex-wrap justify-center">
          <Sparkles className="h-3.5 w-3.5" />
          <span>
            {isFa
              ? 'نسخه ۶.۰ دلارینو منتشر شد — پایانه چارت AI، ۳ موتور خودکار، ۸۰۷ جفت‌ارز و اهرم آزاد تا ۵۰×'
              : 'Dollarino OS v6.0 — Pro Chart AI Terminal, 3 Autonomous Engines, 807 Pairs & up to 50× Leverage'}
          </span>
          <button type="button" onClick={() => scrollTo('pricing')} className="underline underline-offset-2 font-black">
            {isFa ? 'مشاهده تعرفه‌ها →' : 'See Pricing →'}
          </button>
        </span>
      </div>

      {/* Sticky Floating Pill Navbar (01.zip Header with Real Logo) */}
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
              onClick={onOpenAppearance}
              title={isFa ? '۴ تم ظاهری' : 'Looks'}
              className="h-9 w-9 grid place-items-center rounded-full btn-ghost"
            >
              <Palette className="h-4 w-4" style={{ color: 'var(--gold)' }} />
            </button>
            <button
              type="button"
              onClick={onToggleDaylight}
              title={isFa ? 'تغییر حالت روز/شب' : 'Day/Night'}
              className="h-9 w-9 grid place-items-center rounded-full btn-ghost"
            >
              {look === 'paper' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-[#f7c85c]" />}
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

      {/* Main Content */}
      <main id="top" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-20 py-10 sm:py-14">
        {/* 1. Signature 01.zip Editorial Hero + Cobalt Live Device Mockup */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.03fr_0.97fr] gap-10 xl:gap-14 items-center">
          <div className="text-center lg:text-start">
            <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6">
              {[
                { icon: Rocket, text: isFa ? 'حالت ساده (۱۰ تا ۸۰ سال) + حرفه‌ای' : 'Simple & Pro Modes', color: 'var(--gold)' },
                { icon: ShieldCheck, text: 'Paper · Toobit · KCEX', color: 'var(--jade)' },
                { icon: Download, text: isFa ? 'وب · ربات و مینی‌اپ تلگرام' : 'Web · Bot · Mini App', color: 'var(--text)' },
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
              {isFa ? 'سه موتور · یک میز · صفر حدس' : 'THREE ENGINES · ONE DESK · ZERO GUESSWORK'}
            </p>

            <h1 className="font-display font-bold tracking-tight leading-[1.16] text-[clamp(36px,7.5vw,66px)] text-main">
              {isFa ? (
                <>
                  شما بخوابید،
                  <br />
                  <span style={{ color: 'var(--gold)' }}>دلارینو </span>
                  <span className="mark-lime">بیدار</span>
                  <br />
                  می‌ماند.
                </>
              ) : (
                <>
                  You sleep.
                  <br />
                  <span style={{ color: 'var(--gold)' }}>Dollarino </span>
                  <span className="mark-lime">stays</span>
                  <br />
                  awake.
                </>
              )}
            </h1>

            <p className="mt-5 text-sm sm:text-[15px] leading-[1.9] text-dim max-w-xl mx-auto lg:mx-0">
              {isFa
                ? 'چه تازه‌کار باشی و بخواهی در ۳ لمس ساده ترید کنی، چه تریدر حرفه‌ای باشی و دنبال چارت AI، ۶ استراتژی کوانت، بک‌تستر ۹۰۰ کندلی و اتصال Toobit/KCEX باشی — همه چیز یکپارچه در وب، ربات و مینی‌اپ تلگرام آماده است.'
                : 'Simple 3-tap guided trading for absolute beginners (ages 10 to 80) plus a full Pro Quant Desk with Chart AI, 6 strategies, 900-candle backtester & Toobit/KCEX integration.'}
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

          {/* 01.zip Cobalt Live Instrument Device Mockup */}
          <div className="relative">
            <div className="panel rounded-[28px] p-4 sm:p-5 shadow-2xl space-y-3.5 relative">
              <div className="flex items-center justify-between text-[10px] font-black tracking-widest text-dim">
                <div className="flex items-center gap-2">
                  <DollarinoBrandMark size={24} />
                  <span>DOLLARINO OS V6</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-jade">
                  <span className="live-dot h-2 w-2 rounded-full bg-jade" />
                  <span>LIVE DESK</span>
                </span>
              </div>

              {/* Signature Cobalt Wallet Card inside Device */}
              <div
                className="rounded-[22px] p-5 text-white relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #1b54f5 0%, #0d32b5 58%, #071d70 100%)' }}
              >
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
                  <span className="text-[11px] font-semibold opacity-80">{isFa ? 'آماده اسکن زنده' : 'Live Desk Ready'}</span>
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
                      onClick={() => setHeroCoin((c.symbol === 'ETHUSDT' || c.symbol === 'SOLUSDT' ? c.symbol : 'BTCUSDT'))}
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

              <div className="flex items-center justify-between pt-1 text-[10px] font-black text-dim">
                <span>LIVE DESK · 807 PAIRS</span>
                <span className="px-2.5 py-1 rounded-full" style={{ background: 'var(--lime)', color: '#09111f' }}>
                  {isFa ? '۳ موتور فعال' : '3 ENGINES'}
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

        {/* 4 Big Metric Cards (01.zip) */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['807+', isFa ? 'جفت‌ارز زنده' : 'Live Perpetuals'],
            ['20', isFa ? 'معامله همزمان' : 'Parallel Trades'],
            ['24/7', isFa ? 'اسکن و اجرای خودکار' : 'Autonomous Desk'],
            ['50×', isFa ? 'سقف اهرم آزاد' : 'Max Leverage'],
          ].map(([v, l]) => (
            <div key={l} className="panel rounded-3xl py-5 px-4 text-center">
              <p dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular" style={{ color: 'var(--gold)' }}>
                {v}
              </p>
              <p className="text-xs font-bold text-dim mt-1">{l}</p>
            </div>
          ))}
        </section>

        {/* 2. Interactive TimeTrade + Dollarino Product Tour */}
        <section id="showcase" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
                {isFa ? 'همه‌چیز، یک‌جا — پایانه و ابزارهای هوشمند' : 'EVERYTHING IN ONE WORKSPACE'}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'تور زنده پایانه حرفه‌ای، ربات و چارت AI' : 'Pro Terminal, Autonomous Agents & Chart AI'}
              </h2>
            </div>

            <div className="inline-flex p-1 panel rounded-full overflow-x-auto no-scrollbar">
              {[
                { id: 'terminal' as const, icon: CandleIcon, l: isFa ? 'پایانه و چارت AI' : 'Pro Terminal' },
                { id: 'desk' as const, icon: Cpu, l: isFa ? '۰۱ ربات و سپر ریسک' : '01 Agent & Risk' },
                { id: 'chartai' as const, icon: BrainCircuit, l: isFa ? '۰۲ دستیار چارت AI' : '02 Chart AI' },
                { id: 'futures' as const, icon: Coins, l: isFa ? '۰۳ بازار فیوچرز' : '03 Perpetuals' },
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
                code: 'DORNA V1 & KBOS',
                title: isFa ? 'استراتژی‌های دُرنا V1، KBOS و SP2L' : 'Dorna V1, KBOS & SP2L Playbook',
                desc: isFa ? 'روند، مومنتوم، شکار نقدینگی و ریبون غیرریپینت؛ به همراه بک‌تست تاریخی و جدول حرارتی ماهانه.' : 'Non-repaint trend & liquidity sweep engines with full historical backtesting.',
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
              <div key={e.code} className="panel panel-hover rounded-[26px] p-5 space-y-4">
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
                  ['کدام صرافی‌ها پشتیبانی می‌شوند؟', 'صرافی‌های Toobit Futures و KCEX Futures (با کارمزد میکر ۰٪) به‌صورت کامل با کلید رمزنگاری‌شده AES-256 و فقط مجوز معامله (بدون برداشت) پشتیبانی می‌شوند.'],
                  ['آیا می‌توانم اپلیکیشن را روی موبایل و دسکتاپ نصب کنم؟', 'بله! دلارینو یک وب‌اپ پیشرفته (PWA) است و با یک کلیک روی ویندوز، مک، آیفون و اندروید نصب می‌شود.'],
                ]
              : [
                  ['Do I need exchange or LLM API keys to start?', 'No — Paper Demo gives $10,000 live-quote credit instantly, and Dorrbin Multi-AI runs centrally on the platform.'],
                  ['Which live exchanges are supported?', 'Toobit Futures and KCEX Futures using AES-256 encrypted Trade-Only keys with zero withdrawal scope.'],
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
