import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CandlestickChart as CandleIcon,
  Check,
  CheckCircle2,
  Coins,
  Cpu,
  Download,
  Globe,
  Layers,
  Moon,
  Palette,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { LookId } from '../components/AppearanceModal';
import { CoinIcon } from '../components/CoinIcon';
import { DollarinoCoinMark } from '../components/Layout';
import { Sparkline } from '../components/DollarinoViz';
import { PwaInstallModal } from '../components/PwaInstallModal';
import { usePwaInstall } from '../lib/pwa';

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
          setLiveCandles(r.candles.slice(-20).map((c) => Number(c.close)).filter((n) => n > 0));
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

  const runPreviewChartAI = () => {
    const btc = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;
    const p = btc.price;
    const sl = (p * 0.985).toFixed(p > 1000 ? 0 : 2);
    const tp1 = (p * 1.022).toFixed(p > 1000 ? 0 : 2);
    const tp2 = (p * 1.045).toFixed(p > 1000 ? 0 : 2);
    setAiReply(
      isFa
        ? `${heroCoin.replace('USDT', '')}: ساختار صعودی تأیید شده (اطمینان ۷۸٪). محدوده ورود: $${p.toLocaleString()} · حد ضرر (Invalidation): $${sl} · تارگت ۱: $${tp1} · تارگت ۲: $${tp2}.`
        : `${heroCoin.replace('USDT', '')}: Bullish continuation (78% conf). Entry Zone: $${p.toLocaleString()} · Invalidation: $${sl} · Targets: $${tp1} / $${tp2}.`
    );
  };

  const activeCoin = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell relative overflow-x-clip">
      {/* Subtle 01.zip Aurora & Grid Backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-65"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 35%, transparent 100%)',
        }}
      />

      {/* Sticky 01.zip Header */}
      <header className="sticky top-0 z-40 border-b hairline backdrop-blur-2xl" style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DollarinoCoinMark size={40} />
            <div>
              <span className="font-display font-bold text-lg text-main tracking-tight">Dollarino</span>
              <p className="text-[10px] font-bold" style={{ color: 'var(--gold)' }}>
                {isFa ? 'ترمینال هوشمند و ربات معاملاتی' : 'AI Trading OS · Three Engines'}
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-dim">
            <a href="#showcase" className="hover:text-main transition">{isFa ? 'پیش‌نمایش پلتفرم' : 'Terminal'}</a>
            <a href="#engines" className="hover:text-main transition">{isFa ? 'موتورهای ربات' : 'Engines'}</a>
            <a href="#pricing" className="hover:text-main transition">{isFa ? 'تعرفه‌ها' : 'Pricing'}</a>
            <a href="#install" className="hover:text-main transition">{isFa ? 'اپلیکیشن موبایل' : 'App & PWA'}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenAppearance}
              title={isFa ? '۴ تم ظاهری' : 'Looks'}
              className="btn-ghost p-2 rounded-xl"
            >
              <Palette className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            </button>
            <button type="button" onClick={onToggleDaylight} className="btn-ghost p-2 rounded-xl" title={isFa ? 'روز / شب' : 'Day / Night'}>
              {look === 'paper' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-[#f7c85c]" />}
            </button>
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="btn-ghost px-2.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isFa ? 'EN' : 'FA'}</span>
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('login')}
              className="hidden sm:inline-flex btn-ghost px-3.5 py-2 rounded-xl text-xs font-bold"
            >
              {isFa ? 'ورود' : 'Sign in'}
            </button>
            <button
              type="button"
              disabled={demoBusy}
              onClick={() => void triggerDemo()}
              className="btn-gold px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{demoBusy ? '...' : isFa ? 'شروع رایگان دمو' : 'Try Free Demo'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 space-y-20 py-10 sm:py-14">
        {/* 1. Hero Section (01.zip Hero + TimeTrade + Instant Demo CTA) */}
        <section className="grid lg:grid-cols-[1.08fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 panel rounded-full px-4 py-1.5 text-[11px] font-black mb-5" style={{ color: 'var(--gold-soft)' }}>
              <span className="live-dot h-2 w-2 rounded-full bg-jade" />
              <span>
                {isFa
                  ? 'هوش مصنوعی دُرّبین · استراتژی دُرنا V1 · پایانه چارت AI · صرافی Toobit و KCEX'
                  : 'Dorrbin Multi-AI · Dorna V1 · Pro Chart AI Terminal · Toobit & KCEX'}
              </span>
            </div>

            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl leading-[1.12] tracking-tight text-main">
              {isFa ? (
                <>
                  پلتفرم جامع ترید و
                  <br />
                  <span className="text-gold-grad">ربات معاملاتی هوشمند.</span>
                </>
              ) : (
                <>
                  Autonomous Crypto Desk.
                  <br />
                  <span className="text-gold-grad">Every Market. Live.</span>
                </>
              )}
            </h1>

            <p className="mt-5 text-dim text-sm sm:text-base leading-relaxed max-w-xl">
              {isFa
                ? 'با $۱۰,۰۰۰ موجودی دمو رایگان شروع کنید: پایانه حرفه‌ای فیوچرز با تحلیل چارت AI روی کندل‌ها، ۳ موتور معامله‌گر خودکار، اسکنر زنده ۳۰+ جفت‌ارز، بک‌تست، کپی‌ترید تلگرام و اتصال ایمن API صرافی‌ها.'
                : 'Start risk-free with $10,000 Paper credit: Pro futures terminal with interactive Chart AI, 3 autonomous engines, 804+ live perpetual pairs, backtester, Telegram mirroring, and encrypted Toobit/KCEX execution.'}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={demoBusy}
                onClick={() => void triggerDemo()}
                className="btn-gold px-7 py-4 rounded-2xl text-sm inline-flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>{demoBusy ? '...' : isFa ? 'شروع فوری رایگان ($۱۰,۰۰۰ دمو)' : 'Launch Free $10,000 Demo'}</span>
              </button>

              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="btn-ghost px-6 py-4 rounded-2xl text-sm font-bold inline-flex items-center gap-2"
              >
                <span>{isFa ? 'ثبت‌نام با ایمیل' : 'Create Account'}</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-dim font-semibold">
              {[
                isFa ? '✓ بدون نیاز به کلید API برای دمو' : '✓ Zero API setup for Paper Demo',
                isFa ? '✓ مدیریت ریسک و ۳ تارگت خودکار' : '✓ Mandatory SL & 3-TP protection',
                isFa ? '✓ بدون نیاز به کلید شخصی هوش مصنوعی' : '✓ Platform-managed Multi-AI',
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>

          {/* 01.zip Interactive Live Desk Card */}
          <div className="panel rounded-[28px] p-5 sm:p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setHeroCoin(sym)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 ${
                      heroCoin === sym ? 'btn-gold' : 'btn-ghost text-dim'
                    }`}
                  >
                    <CoinIcon symbol={sym} size={16} />
                    <span>{sym.replace('USDT', '')}</span>
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-jade">
                <span className="live-dot h-2 w-2 rounded-full bg-jade" />
                LIVE QUOTE
              </span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] text-dim font-semibold">{activeCoin.symbol} · Perpetual</p>
                <p dir="ltr" className="font-display font-bold text-3xl sm:text-4xl text-main tabular mt-0.5">
                  {activeCoin.price > 0 ? `$${activeCoin.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                </p>
              </div>
              <span dir="ltr" className={`px-3 py-1 rounded-full text-xs font-black ${activeCoin.changePct24h >= 0 ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                {activeCoin.changePct24h >= 0 ? '+' : ''}{activeCoin.changePct24h.toFixed(2)}%
              </span>
            </div>

            <div className="h-24 rounded-2xl bg-black/20 border hairline p-3">
              <Sparkline
                values={
                  liveCandles.length >= 4
                    ? liveCandles
                    : [
                        activeCoin.price * 0.985,
                        activeCoin.price * 0.992,
                        activeCoin.price * 0.989,
                        activeCoin.price * 0.996,
                        activeCoin.price || 1,
                      ]
                }
                height={70}
                color={activeCoin.changePct24h >= 0 ? '#10d9a3' : '#ff4d6d'}
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="surface-soft rounded-2xl p-3">
                <p className="text-[10px] text-dim">{isFa ? 'موتور فعال' : 'Engine'}</p>
                <p className="font-bold text-main mt-0.5">{isFa ? 'دُرّبین AI' : 'Dorrbin AI'}</p>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <p className="text-[10px] text-dim">{isFa ? 'سپر ریسک' : 'Risk Guard'}</p>
                <p dir="ltr" className="font-num font-bold text-jade mt-0.5">R:R 1:2.8</p>
              </div>
              <div className="surface-soft rounded-2xl p-3">
                <p className="text-[10px] text-dim">{isFa ? 'اهرم' : 'Leverage'}</p>
                <p dir="ltr" className="font-num font-bold mt-0.5" style={{ color: 'var(--gold)' }}>1x – 50x</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Interactive TimeTrade + Dollarino Product Showcase (01.zip Showcase + timetrade.live 4 tabs) */}
        <section id="showcase" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
                {isFa ? 'تور تعاملی امکانات پلتفرم' : 'INTERACTIVE PLATFORM TOUR'}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'هر ابزاری که تریدر حرفه‌ای می‌خواهد در یک قاب' : 'Pro Terminal, Autonomous Agents & Chart AI'}
              </h2>
            </div>

            <div className="inline-flex p-1 panel rounded-full overflow-x-auto no-scrollbar">
              {[
                { id: 'terminal' as const, icon: CandleIcon, l: isFa ? 'پایانه حرفه‌ای' : 'Pro Terminal' },
                { id: 'desk' as const, icon: Cpu, l: isFa ? '۰۱ ربات و ریسک' : '01 Autonomous Desk' },
                { id: 'chartai' as const, icon: BrainCircuit, l: isFa ? '۰۲ چارت AI' : '02 Chart AI' },
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
                        <span key={tf} className={`px-2 py-0.5 rounded ${tf === '15m' ? 'btn-gold' : 'bg-black/20 text-dim'}`}>{tf}</span>
                      ))}
                    </div>
                  </div>
                  <div className="h-44 rounded-xl bg-black/25 border hairline p-3 flex flex-col justify-between">
                    <div className="flex justify-between text-[10px] font-num">
                      <span className="text-jade">TP2 ${(activeCoin.price * 1.04).toFixed(0)}</span>
                      <span className="text-main">Entry ${activeCoin.price.toFixed(0)}</span>
                      <span className="text-loss">SL ${(activeCoin.price * 0.985).toFixed(0)}</span>
                    </div>
                    <Sparkline values={[activeCoin.price * 0.95, activeCoin.price * 0.97, activeCoin.price * 0.96, activeCoin.price * 0.985, activeCoin.price * 1.01, activeCoin.price]} height={110} color="#10d9a3" />
                  </div>
                </div>
                <div className="space-y-3 text-xs">
                  <h3 className="font-display font-bold text-xl text-main">{isFa ? 'پایانه یکپارچه فیوچرز + AI' : 'Unified Futures & AI Terminal'}</h3>
                  <p className="text-dim leading-relaxed">
                    {isFa
                      ? 'تغییر فوری بین ۸۰۴+ نماد، دفتر سفارش زنده (Order Book)، رسم خودکار سطوح Entry/SL/TP1-3 روی کندل‌ها و اجرای سفارش با یک کلیک.'
                      : '804+ pairs, real-time Order Book, auto-drawn Entry/SL/TP1-3 lines, and sub-second execution.'}
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
                  <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--gold)' }}>01 · AUTONOMOUS EXCHANGE</span>
                  <h3 className="font-display font-bold text-2xl text-main">{isFa ? 'میز ربات خودکار + سپر ریسک سخت‌گیرانه' : 'Agent Desk + Strict Risk Engine'}</h3>
                  <p className="text-xs text-dim leading-relaxed">
                    {isFa
                      ? 'موتورها در کمتر از ۱ ثانیه بازار را اسکن می‌کنند، هر معامله را قبل از اجرا با سقف ضرر روزانه، اهرم و حد ضرر اجباری کنترل می‌کنند و کلید توقف اضطراری همیشه در دسترس است.'
                      : 'Sub-second execution guarded by daily max-loss circuit breakers, mandatory stop-loss, and instant Kill Switch.'}
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
                  <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--gold)' }}>02 · INTERACTIVE CHART AI</span>
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
                    <span>{isFa ? 'خروجی ساختاریافته چارت AI:' : 'Structured Chart AI Output:'}</span>
                  </div>
                  <p className="text-dim">• {isFa ? 'تشخیص جهت و درصد اطمینان' : 'Directional bias & confidence score'}</p>
                  <p className="text-dim">• {isFa ? 'محدوده ورود + حد ابطال (Stop Loss) + ۳ تارگت' : 'Entry Zone, Invalidation SL, and TP1–TP3'}</p>
                  <p className="text-dim">• {isFa ? 'خطوط حمایت و مقاومت کلیدی رسم‌شده روی چارت' : 'Plotted S/R lines directly on candlesticks'}</p>
                  <p className="text-dim">• {isFa ? 'انتقال مستقیم سطوح به فرم ثبت معامله با یک کلیک' : '1-click copy levels to Order Ticket'}</p>
                </div>
              </div>
            )}

            {showcaseTab === 'futures' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-xl text-main">{isFa ? '۰۳ · جدول بازار فیوچرز دائمی' : '03 · Perpetual Futures Markets'}</h3>
                  <button type="button" onClick={() => void triggerDemo()} className="text-xs font-bold hover:underline" style={{ color: 'var(--gold)' }}>
                    {isFa ? 'مشاهده ۸۰۴+ جفت‌ارز در برنامه ←' : 'Explore all 804+ pairs →'}
                  </button>
                </div>
                <div className="space-y-2">
                  {liveCoins.map((c) => (
                    <div key={c.symbol} className="surface-soft rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={c.symbol} size={24} />
                        <span className="font-bold text-main">{c.symbol}</span>
                      </div>
                      <span dir="ltr" className="font-num font-bold text-main">${c.price.toLocaleString()}</span>
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

        {/* 3. Three Core Engines (01.zip Engines.tsx) */}
        <section id="engines" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
              THREE AUTONOMOUS ENGINES
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'سه موتور هوشمند در کنار یکدیگر' : 'Three Strategies. Zero Guesswork.'}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: BrainCircuit,
                code: 'DORR-BIN',
                title: isFa ? 'هوش مصنوعی دُرّبین (Multi-AI)' : 'Dorrbin Multi-AI Consensus',
                desc: isFa ? 'اجماع همزمان چند مدل هوش مصنوعی روی ساختار، فاندینگ و مومنتوم بازار بدون نیاز به کلید API.' : 'Centralized multi-LLM voting engine checking structure, momentum and liquidity.',
                color: '#e8c15a',
              },
              {
                icon: Radar,
                code: 'DORNA V1',
                title: isFa ? 'استراتژی اختصاصی دُرنا V1' : 'Dorna V1 Price-Action Engine',
                desc: isFa ? 'الگوریتم غیرریپینت شکار نقدینگی و ریبون تایم‌فریم بالا؛ رایگان در تمام حساب‌های دمو و واقعی.' : 'Non-repaint trend & liquidity sweep strategy included free for every account.',
                color: '#10d9a3',
              },
              {
                icon: Bot,
                code: 'MIRROR',
                title: isFa ? 'کپی‌ترید تلگرام و TradingView' : 'Telegram & TradingView Mirror',
                desc: isFa ? 'پارس و اجرای لحظه‌ای سیگنال‌های کانال تلگرام و هشدارهای وب‌هوک با ۳ تارگت و تریلینگ استاپ.' : 'Instant signal parsing from Telegram channels & TradingView alerts.',
                color: '#38e1ff',
              },
            ].map((e) => {
              const Icon = e.icon;
              return (
                <div key={e.code} className="panel panel-hover rounded-[26px] p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="h-11 w-11 rounded-2xl grid place-items-center" style={{ background: `${e.color}20`, color: e.color }}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <span dir="ltr" className="text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: `${e.color}20`, color: e.color }}>
                      {e.code}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-main">{e.title}</h3>
                  <p className="text-xs text-dim leading-relaxed">{e.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. Pricing Plans from Live D1 */}
        <section id="pricing" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
              TRANSPARENT PLANS
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'شروع کاملاً رایگان در دمو · ارتقا هر زمان' : 'Free Paper Desk · Upgrade for Live Auto-Trade'}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Free Paper Card */}
            <div className="panel rounded-[26px] p-6 flex flex-col justify-between space-y-5">
              <div>
                <span className="text-[10px] font-black text-jade uppercase">FREE FOREVER</span>
                <h3 className="font-display font-bold text-2xl text-main mt-1">{isFa ? 'دمو رایگان ($۱۰,۰۰۰)' : 'Free Paper Desk'}</h3>
                <p className="font-display font-bold text-3xl text-main mt-3">$0</p>
                <ul className="mt-4 space-y-2 text-xs text-sub">
                  {[
                    isFa ? 'موجودی تمرین $۱۰,۰۰۰ با قابلیت افزایش' : '$10,000 Paper wallet with free top-ups',
                    isFa ? 'پایانه حرفه‌ای و استراتژی دُرنا V1' : 'Pro Terminal + Dorna V1 live scanner',
                    isFa ? 'شبیه‌ساز تاریخی بک‌تست و کارت هفتگی' : 'Historical Backtester & Weekly Card PNG',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-jade shrink-0" /><span>{f}</span></li>
                  ))}
                </ul>
              </div>
              <button type="button" onClick={() => void triggerDemo()} className="btn-emerald w-full py-3 rounded-xl text-xs">
                {isFa ? 'ورود آنی رایگان' : 'Start Free Now'}
              </button>
            </div>

            {plans.slice(0, 2).map((p) => {
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
                      <span className="text-[10px] font-black uppercase" style={{ color: 'var(--gold)' }}>{p.code}</span>
                      {p.is_popular === 1 && <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{isFa ? 'محبوب‌ترین' : 'POPULAR'}</span>}
                    </div>
                    <h3 className="font-display font-bold text-2xl text-main mt-1">{isFa ? p.name_fa : p.name_en}</h3>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span dir="ltr" className="font-display font-bold text-3xl text-main">${p.price_usd}</span>
                      <span className="text-xs text-dim">/ {p.duration_days} {isFa ? 'روز' : 'days'}</span>
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-sub">
                      {feats.slice(0, 4).map((f) => (
                        <li key={f} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--gold)' }} /><span>{f}</span></li>
                      ))}
                    </ul>
                  </div>
                  <button type="button" onClick={() => onGoAuth('register')} className="btn-gold w-full py-3 rounded-xl text-xs">
                    {isFa ? 'انتخاب و ثبت‌نام' : 'Choose Plan'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Mobile Apps & PWA Install Banner (01.zip AppInstall + timetrade.live Mobile) */}
        <section id="install" className="panel rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
              MOBILE · DESKTOP · PWA
            </span>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
              {isFa ? 'دلارینو را روی آیفون، اندروید یا دسکتاپ نصب کنید' : 'Install Dollarino on iOS, Android & Desktop'}
            </h2>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'با یک ضربه نسخه وب‌اپ پیشرفته (PWA) را مثل اپلیکیشن اصلی روی گوشی نصب کنید و بدون نیاز به مرورگر، اعلان‌ها و پوزیشن‌ها را پیگیری کنید.'
                : 'Install as a native-feel PWA in seconds across iOS, Android, macOS, and Windows.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPwaOpen(true)} className="btn-gold px-6 py-3.5 rounded-2xl text-xs inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              <span>{pwa.canPromptNatively ? (isFa ? 'نصب مستقیم برنامه' : 'Install App Now') : isFa ? 'راهنمای نصب روی گوشی' : 'Install Guide'}</span>
            </button>
            <button type="button" onClick={() => void triggerDemo()} className="btn-ghost px-5 py-3.5 rounded-2xl text-xs font-bold">
              {isFa ? 'ورود به وب‌اپ' : 'Launch Web App'}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t hairline py-8 px-4 text-center text-xs text-dim space-y-2">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-jade" />
          <span>{isFa ? 'دلارینو — پلتفرم معامله خودکار، پایانه چارت AI و مدیریت ریسک' : 'Dollarino Autonomous Trading OS'}</span>
        </div>
        <p className="opacity-75">
          {isFa
            ? 'معاملات فیوچرز دارای ریسک است؛ همیشه ابتدا از حساب دمو رایگان برای تست استراتژی خود استفاده کنید.'
            : 'Futures carry risk — start risk-free inside Paper Demo before live API execution.'}
        </p>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
