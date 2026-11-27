import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  Bot,
  Brain,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Compass,
  Download,
  FileCheck2,
  Flame,
  Globe,
  Headphones,
  Image,
  KeyRound,
  Layers,
  Mail,
  MapPin,
  Menu,
  Moon,
  PanelRight,
  Percent,
  Phone,
  Play,
  PowerOff,
  Radar,
  Rocket,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  UserCheck,
  Users,
  Vault,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import type { FounderProfile } from '../lib/types';
import { usePwaInstall } from '../lib/pwa';
import type { LookId } from '../components/AppearanceModal';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { ChainLogo, ExchangeLogo, WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { Sparkline } from '../components/DollarinoViz';
import { LandingLiveProofHub } from '../components/LandingLiveProofHub';
import { LiveTickerBar } from '../components/LiveTickerBar';
import { PromoBannerCarousel } from '../components/PromoBannerCarousel';
import { PwaInstallModal } from '../components/PwaInstallModal';

interface PublicCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  risk_level: string;
}

interface SnapshotCoin {
  symbol: string;
  base?: string;
  price: number;
  changePct24h: number;
  high24h?: number;
  low24h?: number;
  volume24hUsd?: number;
  funding?: string;
}

function fmtUsdPrice(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '$—';
  if (px >= 1000) return `$${px.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (px >= 1) return `$${px.toFixed(3)}`;
  if (px >= 0.01) return `$${px.toFixed(4)}`;
  return `$${px.toFixed(6)}`;
}

const INITIAL_TICKER_COINS: SnapshotCoin[] = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'SUIUSDT',
  'TONUSDT',
  'LINKUSDT',
  'ADAUSDT',
  'NEARUSDT',
  'ARBUSDT',
  'PEPEUSDT',
  'TRXUSDT',
  'LTCUSDT',
].map((sym) => ({
  symbol: sym,
  base: sym.replace(/USDT$/, ''),
  price: 0,
  changePct24h: 0,
  funding: '0.0085%',
}));

export function LandingPage({
  lang,
  setLang,
  look,
  onToggleDaylight,
  onGoAuth,
  onOpenSupport,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  look: LookId;
  onToggleDaylight: () => void;
  onGoAuth: (mode: 'login' | 'register') => void;
  onOpenSupport?: () => void;
}) {
  const isFa = lang === 'fa';
  const [iranIrt, setIranIrt] = useState<number>(290000);
  const [copyTraders, setCopyTraders] = useState<PublicCopyTrader[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [heroCoin, setHeroCoin] = useState<string>('BTCUSDT');
  const [liveCandles, setLiveCandles] = useState<number[]>([]);
  const [liveCoins, setLiveCoins] = useState<SnapshotCoin[]>(INITIAL_TICKER_COINS);
  const [activePillar, setActivePillar] = useState<'simple' | 'myai' | 'copy' | 'ide' | 'sniper'>('simple');
  const [openFaq, setOpenFaq] = useState<number>(0);
  const [pwaOpen, setPwaOpen] = useState(false);
  const [founder, setFounder] = useState<FounderProfile | null>(null);
  const [communityInvite, setCommunityInvite] = useState<string>('');
  const [publicBotInfo, setPublicBotInfo] = useState<{
    botUsername: string;
    officialChannel: string;
    officialChannelInvite: string;
    signalsChannel: string;
    signalsChannelInvite: string;
    resultsChannel: string;
    resultsChannelInvite: string;
    communityGroupInvite: string;
    newsChannel: string;
    newsChannelInvite: string;
    telegramAuthEnabled: boolean;
  }>({
    botUsername: '',
    officialChannel: '',
    officialChannelInvite: '',
    signalsChannel: '',
    signalsChannelInvite: '',
    resultsChannel: '',
    resultsChannelInvite: '',
    communityGroupInvite: '',
    newsChannel: '',
    newsChannelInvite: '',
    telegramAuthEnabled: false,
  });
  const pwa = usePwaInstall();

  useEffect(() => {
    apiFetch<{ usdtIrt?: number }>('/api/public/usdt-irt-rate')
      .then((r) => {
        if (r.usdtIrt) setIranIrt(r.usdtIrt);
      })
      .catch(() => {});

    apiFetch<{ traders: PublicCopyTrader[] }>('/api/public/copy-traders')
      .then((r) => {
        if (r.traders?.length) setCopyTraders(r.traders);
      })
      .catch(() => {});

    apiFetch<{ founderProfile?: FounderProfile; communityGroupInvite?: string }>('/api/public/creator')
      .then((r) => {
        if (r.founderProfile) setFounder(r.founderProfile);
        if (r.communityGroupInvite) setCommunityInvite(r.communityGroupInvite);
      })
      .catch(() => {});

    apiFetch<{
      telegramBotUsername?: string;
      officialChannel?: string;
      officialChannelInvite?: string;
      signalsChannel?: string;
      signalsChannelInvite?: string;
      resultsChannel?: string;
      resultsChannelInvite?: string;
      communityGroupInvite?: string;
      newsChannel?: string;
      newsChannelInvite?: string;
      telegramAuthEnabled?: boolean;
    }>('/api/auth/providers')
      .then((r) => {
        setPublicBotInfo({
          botUsername: (r.telegramBotUsername || '').replace(/^@/, ''),
          officialChannel: r.officialChannel || '',
          officialChannelInvite: r.officialChannelInvite || '',
          signalsChannel: r.signalsChannel || '',
          signalsChannelInvite: r.signalsChannelInvite || '',
          resultsChannel: r.resultsChannel || '',
          resultsChannelInvite: r.resultsChannelInvite || '',
          communityGroupInvite: r.communityGroupInvite || '',
          newsChannel: r.newsChannel || '',
          newsChannelInvite: r.newsChannelInvite || '',
          telegramAuthEnabled: Boolean(r.telegramAuthEnabled),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch<{
      candles?: Array<{ close: number }>;
      markets?: Array<{
        symbol: string;
        base?: string;
        lastPrice: number;
        changePct24h: number;
        high24h?: number;
        low24h?: number;
        volume24hUsd?: number;
        fundingRate?: string;
      }>;
    }>(`/api/public/market-snapshot?symbol=${heroCoin}`)
      .then((r) => {
        if (r.candles?.length) {
          setLiveCandles(r.candles.slice(-24).map((c) => Number(c.close)).filter((n) => n > 0));
        }
        if (r.markets?.length) {
          setLiveCoins(
            r.markets.map((m) => ({
              symbol: m.symbol,
              base: m.base || m.symbol.replace(/USDT$/, ''),
              price: Number(m.lastPrice),
              changePct24h: Number(m.changePct24h || 0),
              high24h: Number(m.high24h || 0),
              low24h: Number(m.low24h || 0),
              volume24hUsd: Number(m.volume24hUsd || 0),
              funding: m.fundingRate ?? '0.0085%',
            }))
          );
        }
      })
      .catch(() => {});
  }, [heroCoin]);

  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelectTickerCoin = (sym: string) => {
    setHeroCoin(sym);
    scrollTo('live-markets');
  };

  const activeCoin = liveCoins.find((c) => c.symbol === heroCoin) ?? liveCoins[0]!;

  const pillars = [
    {
      id: 'simple' as const,
      badge: '۰۱ · DOLLARINO AI (DEFAULT OFF)',
      title: isFa ? 'هوش مصنوعی مرکزی دلارینو: تحلیل چندمدله و اجرای هوشمند' : 'Central Dollarino AI: Multi-LLM Consensus Execution',
      shortTitle: isFa ? 'هوش مصنوعی مرکزی' : 'Central AI',
      icon: Bot,
      color: '#10b981',
      desc: isFa
        ? 'به‌صورت پیش‌فرض خاموش است و هر زمان خودتان روشنش کنید فعال می‌شود! با اجماع چند مدل AI، ساختار بازار، لیکوییدیتی و حجم را تحلیل کرده و معاملات را با ۳ تارگت و Risk-Free خودکار مدیریت می‌کند.'
        : 'Starts OFF by default until you switch it on. Multi-LLM consensus analyzes structure, liquidity & momentum and executes with 3 TPs + automatic Risk-Free protection.',
      bullets: isFa
        ? ['پیش‌فرض خاموش با راهنمای گام‌به‌گام تک‌باره روی کارت', 'انتخاب سطح اطمینان و مدیریت ۳ تارگت + استاپ‌لاس هوشمند', 'امکان پرش مستقیم از معامله به سوپرچارت و مشاهده دلیل سیگنال']
        : ['Default OFF with interactive guide card', 'Configurable confidence threshold & 3-TP + smart SL', '1-click jump from active position to Superchart & AI reason'],
    },
    {
      id: 'myai' as const,
      badge: '۰۲ · PERSONAL RAW AI',
      title: isFa ? 'هوش مصنوعی شخصی (خام): استراتژی خودت را به فارسی آموزش بده' : 'Personal Raw AI: Train Your Own AI Strategist',
      shortTitle: isFa ? 'هوش مصنوعی من' : 'My Personal AI',
      icon: Brain,
      color: '#1652f0',
      desc: isFa
        ? 'یک ایجنت AI کاملاً شخصی! به زبان طبیعی (فارسی یا انگلیسی) یا با ارسال عکس چارت به آن بگویید دنبال چه ستاپ، اندیکاتور یا سطوحی بگردد؛ قوانین را به دستورالعمل ساختاریافته تبدیل می‌کند و ۲۴/۷ در خدمت شماست.'
        : 'Your private blank AI agent. Teach it in plain Persian/English or send chart screenshots; it extracts structured rules, validates setups on live candles, and trades 24/7.',
      bullets: isFa
        ? ['پشتیبانی از تحلیل تصویر چارت (Vision) و تبدیل ایده به استراتژی', 'ایزوله‌شده برای حساب شما بدون تداخل با موتورهای دیگر', 'امکان تنظیم فیلتر ارسال سیگنال اختصاصی در تلگرام و پنل']
        : ['Supports Chart Vision screenshots & idea-to-rule conversion', 'Strictly isolated to your account preferences', 'Dedicated Telegram & web signal delivery filters'],
    },
    {
      id: 'ide' as const,
      badge: '۰۳ · SUPERCHARTS & PINE V6 LAB',
      title: isFa ? 'استراتژی شکار و آزمایشگاه Pine Script v4/v5/v6 + Python' : 'Strategy Hunter & Pine Script v4/v5/v6 + Python Lab',
      shortTitle: isFa ? 'استراتژی و Pine v6' : 'Strategy & Pine',
      icon: Code2,
      color: '#8b5cf6',
      desc: isFa
        ? 'استراتژی‌های آماده دُرنا V1، KBOS V11 و SP2L را اجرا کنید یا کد Pine Script v4/v5/v6 و Python خودتان را روی ۸۲۰+ جفت‌ارز Trust Wallet با بک‌تست زنده ۹۰۰ کندلی و گرافیک کامل TradingView تست و خودکارسازی کنید.'
        : 'Run proven Dorna V1, KBOS V11 & SP2L presets or paste Pine Script v4/v5/v6 & Python code across 820+ Trust Wallet pairs with 900-candle live backtests and Superchart overlays.',
      bullets: isFa
        ? ['اجرای بومی Pine Script v4/v5/v6 با رسم خطوط، پلات، جدول و HUD روی سوپرچارت', 'بخش رادار و اسکنر یکپارچه روی کل دسته‌بندی‌های Trust Wallet', 'ذخیره و اجرای ۲۴/۷ بدون نیاز به روشن ماندن سیستم شما']
        : ['Native Pine v4/v5/v6 runtime with Superchart lines, fills & HUD tables', 'Paginated Radar scanner across full Trust Wallet categories', '24/7 cloud execution with zero local PC uptime required'],
    },
    {
      id: 'copy' as const,
      badge: '۰۴ · SMART WALLET COPY V2',
      title: isFa ? 'کپی‌ترید دوگانه: تریدرهای تاییدشده + شکار ولت نهنگ‌ها (V2)' : 'Dual Copy Trade: Verified VIPs + Smart-Money Wallets (V2)',
      shortTitle: isFa ? 'کپی‌ترید V2' : 'Copy Trade V2',
      icon: Trophy,
      color: '#f59e0b',
      desc: isFa
        ? 'معاملات تریدرهای تاییدشده سایت یا ولت‌های اسمارت‌مانی در Solana، Base، ETH، BSC، TON و TRON را با باکس مارجین ایزوله، بک‌تست ۷ روزه، سپر ضدراگ، ۳ تارگت + Moonbag و خزانه ۲۴/۷ دنبال کنید.'
        : 'Mirror verified site traders or Top-10 Smart-Money wallets across Solana, Base, ETH, BSC, TON & TRON with isolated margin boxes, 7-day backtest, Anti-Rug & 24/7 Copy-Vault.',
      bullets: isFa
        ? ['کپی فقط معاملات جدید از لحظه فالو + باکس مارجین جداگانه', 'فیلتر هوشمند ضدراگ (GoPlus + Honeypot.is + RugCheck) و خروج Dev-Sell', 'خروجی کارت سود تاییدشده ۱۶:۹ و ۹:۱۶ با کد استعلام']
        : ['Copies only fresh trades from follow-time with isolated margin boxes', 'Multi-source Anti-Rug & automatic Dev-Sell protection', 'Verified 16:9 & 9:16 PNG profit cards upon position close'],
    },
    {
      id: 'sniper' as const,
      badge: '۰۵ · 5M PRO LISTING & MEME SNIPER',
      title: isFa ? 'اسنایپر لیستینگ صرافی و شکار میم‌کوین‌های پرجهش (۵ دقیقه‌ای)' : '5m Pro Exchange Listing & Booming Meme Sniper',
      shortTitle: isFa ? 'اسنایپر ۵ دقیقه' : '5m Pro Sniper',
      icon: Flame,
      color: '#f97316',
      desc: isFa
        ? 'رصد مداوم لیستینگ‌های تازه و استخرهای نقدینگی ۵ دقیقه‌ای با فیلترهای پرو (حداقل نقدینگی، امتیاز امنیت قرارداد، جلوگیری از Honeypot)، اجرای خودکار روی خزانه سولانا یا Trust Wallet و ارسال سیگنال لحظه‌ای.'
        : 'Continuously tracks fresh exchange listings and 5-minute meme pools with Pro safety guards (min liquidity, contract audit score, honeypot shield) + instant Telegram/web alerts.',
      bullets: isFa
        ? ['کارت اختصاصی سیگنال اسنایپر با امتیاز امنیت و نقدینگی استخر', 'تنظیم اختصاصی حداقل امنیت اسنایپر در بخش فیلتر ارسال سیگنال', 'پشتیبانی مستقیم از شارژ و سوآپ SOL / USDC در خزانه سولانا']
        : ['Dedicated Sniper signal cards with liquidity & safety scoring', 'Per-user Sniper minimum safety filter for alert delivery', 'Direct Solana SOL/USDC Vault funding & Jupiter execution'],
    },
  ];

  const selectedPillar = pillars.find((p) => p.id === activePillar) ?? pillars[0]!;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell relative overflow-x-clip">
      {/* Subtle Clean Background Grid */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[560px] z-0 overflow-hidden">
        <div
          className={`absolute inset-0 ${look === 'paper' ? 'opacity-15' : 'opacity-20'}`}
          style={{
            backgroundImage: 'radial-gradient(color-mix(in srgb, var(--text) 12%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to bottom, #000 10%, transparent 90%)',
          }}
        />
      </div>

      {/* Sticky Floating Pill Navbar */}
      <header className="sticky top-0 z-40 px-2.5 sm:px-5 pt-2.5 sm:pt-3">
        <div
          className="mx-auto max-w-7xl panel rounded-full px-3 sm:px-4 py-2 flex items-center gap-1.5 shadow-xl lg:backdrop-blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel) 92%, transparent)' }}
        >
          <button type="button" onClick={() => scrollTo('top')} className="flex items-center gap-2 shrink-0 min-w-0">
            <DollarinoBrandMark size={36} glow />
            <span className="leading-none text-start">
              <span dir="ltr" className="block font-display font-black text-sm sm:text-base text-main">
                Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
              </span>
              <span className="hidden xl:block text-[9px] font-black tracking-[0.14em] text-dim">
                V11.9 · TRUST &amp; SUPERCHARTS
              </span>
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-0.5 mx-auto text-[10.5px] font-bold text-dim">
            {[
              ['capabilities', isFa ? 'قابلیت‌ها' : 'Features'],
              ['digital-proof', isFa ? 'بک‌تست و استعلام ۳۰ روزه' : '30d Audit'],
              ['signals-preview', isFa ? 'سیگنال و نتایج' : 'Signals'],
              ['pillars', isFa ? '۵ موتور و آموزش' : 'Engines'],
              ['roadmap', isFa ? 'نقشه راه' : 'Roadmap'],
              ['pricing', isFa ? 'کارمزد ۳٪' : '3% Fee'],
              ['trust-founder', isFa ? 'اصالت و سازنده' : 'Trust'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="px-2 py-1.5 rounded-full hover:text-main hover:bg-[var(--soft)] transition whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1 shrink-0">
            {onOpenSupport && (
              <button
                type="button"
                onClick={onOpenSupport}
                title={isFa ? 'پشتیبانی آنلاین' : 'Support'}
                className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-full btn-ghost text-[11px] font-bold"
              >
                <Headphones className="w-3.5 h-3.5 text-jade" />
                <span className="hidden xl:inline">{isFa ? 'پشتیبانی' : 'Support'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-full btn-ghost"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDaylight}
              title={isFa ? 'تغییر حالت روز و شب' : 'Day / Night'}
              className="inline-flex items-center justify-center h-8 w-8 sm:h-8 sm:w-auto sm:px-2.5 gap-1 rounded-full btn-ghost text-[11px] font-bold"
            >
              {look === 'paper' ? (
                <>
                  <Moon className="h-3.5 w-3.5 text-[var(--gold)]" />
                  <span className="hidden xl:inline">{isFa ? 'حالت شب' : 'Night'}</span>
                </>
              ) : (
                <>
                  <Sun className="h-3.5 w-3.5 text-[#f59e0b]" />
                  <span className="hidden xl:inline">{isFa ? 'حالت روز' : 'Day'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('login')}
              className="hidden sm:inline-flex btn-ghost px-3 py-1.5 rounded-full text-[11px] font-bold"
            >
              {isFa ? 'ورود' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => onGoAuth('register')}
              className="btn-gold inline-flex items-center gap-1 text-[11px] font-black px-3.5 sm:px-4 py-2 rounded-full shrink-0"
            >
              <span className="sm:hidden">{isFa ? 'شروع' : 'Start'}</span>
              <span className="hidden sm:inline">{isFa ? 'شروع رایگان' : 'Start Free'}</span>
              <ArrowLeft className={`h-3.5 w-3.5 ${isFa ? '' : 'rotate-180'}`} />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenu((v) => !v)}
              className="lg:hidden h-8 w-8 grid place-items-center rounded-full btn-ghost"
              aria-label="Menu"
            >
              {mobileMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="panel rounded-3xl mt-2 p-3 lg:hidden max-w-6xl mx-auto space-y-1.5">
            <div className="flex items-center justify-between px-2 pb-1.5 border-b hairline sm:hidden">
              <span className="text-[11px] font-bold text-dim">{isFa ? 'زبان پلتفرم' : 'Language'}</span>
              <button
                type="button"
                onClick={() => setLang(isFa ? 'en' : 'fa')}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full btn-ghost"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{isFa ? 'English' : 'فارسی'}</span>
              </button>
            </div>
            {[
              ['capabilities', isFa ? 'معرفی و قابلیت‌های نسخه V11.9' : 'V11.9 Capabilities'],
              ['digital-proof', isFa ? 'بک‌تست زنده و استعلام دیجیتال ۳۰ روزه ولت' : 'Live Backtests & 30d Wallet Audit'],
              ['signals-preview', isFa ? 'کانال سیگنال و نتایج قبل از عضویت' : 'Signals & Results Channels'],
              ['live-markets', isFa ? 'نبض زنده بازار ارزهای برتر' : 'Live Top Markets'],
              ['pillars', isFa ? '۵ موتور معاملاتی + آموزش گام‌به‌گام' : '5 Engines & Quick Academy'],
              ['roadmap', isFa ? 'نقشه راه دلارینو (V10 تا V12)' : 'Roadmap (V10–V12)'],
              ['pricing', isFa ? '۳ معامله رایگان + ۳٪ فقط از سود' : '3 Free · 3% Profit Fee'],
              ['trust-founder', isFa ? 'معرفی سازنده و تضمین ضدپانزی' : 'Founder & Anti-Ponzi Proof'],
              ['faq', isFa ? 'سوالات پرتکرار' : 'FAQ'],
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
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onGoAuth('login');
                }}
                className="btn-ghost py-2.5 rounded-2xl font-bold text-xs"
              >
                {isFa ? 'ورود به حساب' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onGoAuth('register');
                }}
                className="btn-gold py-2.5 rounded-2xl font-black text-xs"
              >
                {isFa ? 'ورود به میز کار' : 'Open Workspace'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Live Top Ticker Bar */}
      <LiveTickerBar
        items={liveCoins}
        selectedSymbol={heroCoin}
        onSelectCoin={handleSelectTickerCoin}
        className="relative z-10 mt-3 border-y hairline bg-[color:color-mix(in_srgb,var(--panel)_75%,transparent)] backdrop-blur-md"
      />

      {/* Main Content */}
      <main id="top" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-16 sm:space-y-20 py-8 sm:py-12">
        {/* 1. HERO SECTION with Clear Brand Logo + Subtle Giant Watermark */}
        <section className="relative rounded-[34px] panel p-6 sm:p-9 lg:p-10 border hairline overflow-hidden">
          {/* Giant Low-Opacity Brand Logo Watermark */}
          <img
            src="/logo-hd.webp"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute -top-12 end-[-60px] w-[380px] h-[380px] sm:w-[460px] sm:h-[460px] object-contain opacity-[0.055]"
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.06fr_0.94fr] gap-8 xl:gap-10 items-center">
            <div className="text-center lg:text-start reveal-up space-y-5">
              {/* Prominent Brand Crest + Status Pills */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                <div className="inline-flex items-center gap-2.5 surface-soft rounded-2xl px-3.5 py-2 border hairline shadow-sm">
                  <DollarinoBrandMark size={40} glow />
                  <div className="text-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--gold)] block">
                      DOLLARINO QUANT PLATFORM
                    </span>
                    <span className="text-xs font-black text-main">
                      {isFa ? 'نسخه V11.9 · هم‌تراز Trust Wallet' : 'V11.9 · Trust Wallet Parity'}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[11px] font-black">
                  <PowerOff className="h-3.5 w-3.5" />
                  <span>{isFa ? '۵ موتور پیش‌فرض خاموش و تحت کنترل شما' : '5 Engines Default-OFF · User-Controlled'}</span>
                </span>
              </div>

              <h1 className="font-display font-bold tracking-tight leading-[1.35] text-[clamp(26px,4.3vw,43px)] text-main">
                {isFa ? (
                  <>
                    سوپرچارت <span dir="ltr" className="mark-lime inline-block">TradingView</span>
                    <br />
                    <span style={{ color: 'var(--gold)' }}>هوش مصنوعی چندمدله</span> و
                    <br />
                    ترید غیرامانی در <span dir="ltr" className="inline-block whitespace-nowrap">Trust Wallet</span>
                  </>
                ) : (
                  <>
                    <span className="mark-lime">TradingView</span> Supercharts,
                    <br />
                    <span style={{ color: 'var(--gold)' }}>Multi-Model AI</span> &amp;
                    <br />
                    Non-Custodial <span className="whitespace-nowrap">Trust Wallet</span>
                  </>
                )}
              </h1>

              <p className="text-sm sm:text-[15px] leading-[1.88] text-dim max-w-xl mx-auto lg:mx-0">
                {isFa ? (
                  <>
                    همه‌چیز قبل از ثبت‌نام قابل بررسی و استعلام است: نتایج زنده بک‌تست الگوریتم‌ها، دفتر دیجیتال ۳۰ روزه ولت‌های کاربران، کانال سیگنال <span dir="ltr" className="font-bold text-main">01</span> و نتایج <span dir="ltr" className="font-bold text-main">02</span>، سوپرچارت با <span dir="ltr" className="font-bold text-main">Pine v6</span>، اکستنشن کروم و کارمزد منصفانه <strong className="text-main">۰٪ اشتراک + فقط ۳٪ از سود خالص واقعی</strong>.
                  </>
                ) : (
                  'Inspect everything before signing up: live strategy backtests, verifiable 30-day wallet audit sheets, preview signals (01) & results (02), TradingView Supercharts + Pine v6, Trust Wallet portfolio parity, Chrome Side Panel, and 0% subscription with just 3% fee on net profits.'
                )}
              </p>

              {/* Ecosystem Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-0.5">
                {[
                  { kind: 'w' as const, id: 'trustwallet', label: 'Trust Wallet 820+ Markets' },
                  { kind: 'ex' as const, id: 'paper', label: 'Free Demo ($50–$10M)' },
                  { kind: 'c' as const, id: 'arbitrum', label: 'Hyperliquid Perp' },
                  { kind: 'c' as const, id: 'solana', label: 'Solana · Jupiter' },
                  { kind: 'c' as const, id: 'ethereum', label: 'EVM' },
                  { kind: 'w' as const, id: 'tonkeeper', label: 'TON' },
                  { kind: 'c' as const, id: 'tron', label: 'TRON' },
                ].map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full surface-soft border hairline text-[11px] font-bold text-main"
                  >
                    {item.kind === 'ex' ? (
                      <ExchangeLogo provider={item.id} size={15} />
                    ) : item.kind === 'w' ? (
                      <WalletLogo wallet={item.id === 'tonkeeper' ? 'ton' : 'trustwallet'} size={15} />
                    ) : (
                      <ChainLogo chain={item.id} size={15} />
                    )}
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap justify-center lg:justify-start gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-lime inline-flex items-center gap-2 font-black px-6 py-3.5 rounded-2xl text-sm"
                >
                  <Zap className="h-[18px] w-[18px]" />
                  <span>{isFa ? 'شروع رایگان (تراست‌ولت / گوگل / تلگرام)' : 'Start Free (Trust Wallet / Google / TG)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo('digital-proof')}
                  className="btn-gold inline-flex items-center gap-2 font-black px-5 py-3.5 rounded-2xl text-sm"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isFa ? 'استعلام ولت و بک‌تست زنده' : 'Verify 30d Audits & Backtests'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo('signals-preview')}
                  className="btn-ghost inline-flex items-center gap-2 font-bold px-4 py-3.5 rounded-2xl text-sm"
                >
                  <Play className="h-4 w-4 text-jade" />
                  <span>{isFa ? 'مشاهده سیگنال‌ها قبل از عضویت' : 'Preview Signals'}</span>
                </button>
              </div>
            </div>

            {/* Right Column: Live Market Card + Supercharts Showcase */}
            <div className="surface-soft rounded-[28px] p-4 sm:p-5 border hairline space-y-4 shadow-xl">
              <div className="relative rounded-2xl overflow-hidden border hairline h-40 sm:h-44">
                <img
                  src="/images/landing-supercharts-pine.webp"
                  alt="Dollarino TradingView Supercharts & Pine v6"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060d1f]/90 via-transparent to-transparent flex items-end justify-between p-3.5">
                  <div className="flex items-center gap-2">
                    <img src="/logo-sm.webp" alt="" className="w-7 h-7 object-contain" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--gold)]">
                        SUPERCHARTS · PINE V6 · TECHNICALS GAUGE
                      </p>
                      <p className="text-xs font-bold text-white">
                        {isFa ? 'نمایش مستقیم Entry/SL/TP از معامله روی چارت' : 'Direct Entry/SL/TP Chart Overlay & Watchlist'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">
                    24/7 LIVE
                  </span>
                </div>
              </div>

              <div className="ios-wallet-card rounded-[22px] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <CoinIcon symbol={activeCoin.symbol} size={32} />
                    <div>
                      <p dir="ltr" className="font-display font-bold text-sm">{activeCoin.symbol}</p>
                      <p className="text-[10.5px] text-white/75">
                        {coinDisplayName(activeCoin.base || activeCoin.symbol.replace(/USDT$/, ''), isFa)} · Perp
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT'] as const).map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => setHeroCoin(sym)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition ${
                          heroCoin === sym ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                      >
                        {sym.replace('USDT', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div dir="ltr">
                    <p className="font-num font-black text-2xl">{fmtUsdPrice(activeCoin.price)}</p>
                    <p className={`text-[11px] font-black ${activeCoin.changePct24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {activeCoin.changePct24h >= 0 ? '+' : ''}{activeCoin.changePct24h.toFixed(2)}% (24h)
                    </p>
                  </div>
                  {liveCandles.length > 4 && (
                    <div className="w-36 h-14">
                      <Sparkline
                        values={liveCandles}
                        color={activeCoin.changePct24h >= 0 ? '#10d9a3' : '#f43f5e'}
                        height={54}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {pillars.slice(0, 4).map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActivePillar(p.id);
                        scrollTo('pillars');
                      }}
                      className="panel hover:border-[var(--gold)] border border-transparent rounded-xl p-2.5 text-start transition space-y-0.5"
                    >
                      <div className="flex items-center gap-1.5 font-black text-main">
                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
                        <span className="truncate">{p.shortTitle}</span>
                      </div>
                      <p className="text-[9.5px] text-dim truncate">{p.badge}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 2. V11.9 COMPLETE CAPABILITIES OVERVIEW */}
        <section id="capabilities" className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
                <Sparkles className="w-3.5 h-3.5 text-jade" />
                <span>FULL PLATFORM ARCHITECTURE · V11.9</span>
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'معرفی کامل امکانات پلتفرم معاملاتی دلارینو' : 'Complete Dollarino V11.9 Trading Ecosystem'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-dim max-w-md leading-relaxed">
              {isFa
                ? 'تمامی ابزارهای یک تریدر مدرن — از چارت حرفه‌ای و کیف‌پول غیرامانی تا ربات تلگرام، اکستنشن کروم و استودیو کارت سود — در یک میز کار سریع و بدون اشتراک ماهانه.'
                : 'Every pro tool — Supercharts, non-custodial Trust Wallet portfolio, Telegram automation, Chrome side panel, and Verified PNG profit cards — unified with $0 monthly fee.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              {
                icon: CandlestickChart,
                badge: 'TRADINGVIEW SUPERCHARTS + PINE V6',
                color: '#1652f0',
                title: isFa ? 'سوپرچارت کامل + واچ‌لیست و عقربه تکنیکال' : 'TradingView Supercharts + Watchlist & Technicals Dial',
                desc: isFa
                  ? 'نمودار تمیز پیش‌فرض، نوار تایم‌فریم 1D تا All، عقربه خلاصه تکنیکال (Buy/Neutral/Sell)، داک کدنویسی Pine Script v4/v5/v6 و پرش یک‌کلیک از هر معامله روی چارت همراه با رسم Entry/SL/TP.'
                  : 'Clean chart default, 1D–All range bar, live Technicals gauge, Pine v4/v5/v6 dock, and 1-click trade-to-chart jump drawing exact Entry/SL/TP levels.',
              },
              {
                icon: Wallet,
                badge: 'TRUST WALLET PARITY · 820+ ASSETS',
                color: '#059669',
                title: isFa ? 'هم‌تراز با Trust Wallet + پورتفوی زنده ۴ شبکه' : 'Trust Wallet Market & Multi-Chain Portfolio Parity',
                desc: isFa
                  ? 'پوشش کامل ۸۲۰+ جفت ارز دسته‌بندی‌شده (L1، DeFi، AI، Meme، Gaming، RWA)، نمایش زنده موجودی ETH، BNB، USDT، USDC، SOL، TON و TRX مستقیماً از کیف‌پول شخصی و جداسازی شفاف از خزانه ۳٪.'
                  : '820+ categorized pairs (L1, DeFi, AI, Meme, Gaming, RWA), live on-chain balance tracking across EVM, Solana, TON & TRON, cleanly separated from the 3% fee hub.',
              },
              {
                icon: PowerOff,
                badge: 'DEFAULT OFF + ONE-TIME GUIDES',
                color: '#f59e0b',
                title: isFa ? 'کنترل کامل ۵ موتور + راهنمای آموزشی روی هر کارت' : 'All 5 Engines Default-OFF + Built-in Guides',
                desc: isFa
                  ? 'برخلاف ربات‌های خودسر، در دلارینو تمام ۵ موتور در شروع خاموش هستند و هیچ معامله‌ای بدون انتخاب آگاهانه شما باز نمی‌شود؛ هر موتور یک راهنمای تعاملی تک‌باره و آیکن ؟ دارد.'
                  : 'All 5 trading engines start OFF by default — nothing executes until you intentionally enable an engine, each documented with an interactive guide modal.',
              },
              {
                icon: Flame,
                badge: 'SMART COPY V2 + ANTI-RUG + SNIPER',
                color: '#f97316',
                title: isFa ? 'کپی‌ترید ولت نهنگ‌ها + سپر ضدراگ + اسنایپر ۵م' : 'Smart Copy V2 + Anti-Rug Shield + 5m Sniper',
                desc: isFa
                  ? 'رصد ۱۰ ولت برتر هوشمند هر شبکه با بک‌تست ۷ روزه، باکس مارجین ایزوله و بررسی خودکار Honeypot، مالیات و قفل نقدینگی (GoPlus / RugCheck) به همراه اسنایپر ۵ دقیقه‌ای لیستینگ.'
                  : 'Follow Top-10 smart wallets with 7-day backtest, isolated margin boxes, live Honeypot/Tax/LP verification (GoPlus + RugCheck), and 5-minute listing sniper.',
              },
              {
                icon: Send,
                badge: '1+7+1 TELEGRAM + PER-ENGINE FILTER',
                color: '#0ea5e9',
                title: isFa ? 'اکوسیستم تلگرام + فیلتر هوشمند سیگنال و اخبار' : 'Telegram 1+7+1 + Per-Engine Filters & 240m News',
                desc: isFa
                  ? 'فیلتر کردن اخبار بی‌اهمیت بازار در چرخه ۲۴۰ دقیقه‌ای و امکان شخصی‌سازی دریافت سیگنال‌ها بر اساس موتور، حداقل درصد اطمینان، امنیت اسنایپر، جهت معامله و ساعت سکوت شبانه.'
                  : 'Importance-filtered market news every 240 minutes plus granular signal routing per engine, min confidence, sniper safety score, direction & quiet hours.',
              },
              {
                icon: PanelRight,
                badge: 'CHROME EXTENSION + 16:9 / 9:16 CARDS',
                color: '#8b5cf6',
                title: isFa ? 'اکستنشن پنل کناری کروم + کارت سود QR دار' : 'Chrome Side Panel Extension + Verified PnL Cards',
                desc: isFa
                  ? 'سنجاق پنل ساده دلارینو در کنار صرافی‌ها در مرورگر Chrome و صدور کارت‌های گرافیکی PNG تاییدشده با امضای HMAC در سایز افقی ۱۶:۹ و استوری ۹:۱۶ قابل استعلام.'
                  : 'Native Chrome Side Panel Extension locked to clean Simple Mode plus cryptographically signed 16:9 & 9:16 PNG PnL Cards verifiable by QR code.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="panel panel-hover rounded-[26px] p-5 space-y-3 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="w-10 h-10 rounded-2xl grid place-items-center shrink-0"
                      style={{ background: `color-mix(in srgb, ${item.color} 16%, transparent)`, color: item.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-[9px] font-black tracking-wider text-dim uppercase text-end">{item.badge}</span>
                  </div>
                  <h3 className="font-display font-bold text-base text-main leading-snug">{item.title}</h3>
                  <p className="text-dim leading-relaxed text-[11.5px]">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Promo Banners */}
        <section className="reveal-up">
          <PromoBannerCarousel lang={lang} placement="LANDING" onGuestAction={() => onGoAuth('register')} />
        </section>

        {/* 3 & 4. LIVE DIGITAL BACKTEST, 30-DAY WALLET AUDIT & PRE-SIGNUP SIGNAL/RESULTS CHANNELS */}
        <LandingLiveProofHub
          lang={lang}
          onGoAuth={onGoAuth}
          publicBotInfo={publicBotInfo}
        />

        {/* 5. INTERACTIVE 5-ENGINE SHOWCASE & QUICK ACADEMY */}
        <section id="pillars" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
              <BookOpen className="w-3.5 h-3.5 text-jade" />
              <span>5 MODULAR ENGINES · STEP-BY-STEP ACADEMY</span>
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? '۵ موتور تخصصی + آموزش سریع شروع کار از صفر' : '5 Specialized Engines + Step-by-Step Starter Guide'}
            </h2>
            <p className="text-xs sm:text-sm text-dim">
              {isFa
                ? 'هر سطحی که دارید — از اولین تجربه ترید روی شبیه‌ساز رایگان تا کدنویسی Pine v6 و شکار ولت نهنگ‌ها — موتور اختصاصی خودش را دارد.'
                : 'Whether you are starting on the free simulator or writing Pine v6 and mirroring whale wallets, choose the exact engine you want.'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {pillars.map((p) => {
              const Icon = p.icon;
              const active = activePillar === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePillar(p.id)}
                  className={`rounded-2xl p-3 text-start transition flex items-center gap-2.5 border ${
                    active ? 'btn-gold border-transparent shadow-lg' : 'panel border-transparent hover:border-[var(--line-strong)] text-main'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: active ? '#fff' : p.color }} />
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-black truncate">{p.shortTitle}</p>
                    <p className={`text-[9px] truncate ${active ? 'text-white/80' : 'text-dim'}`}>{p.badge}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="panel glow-card-anim rounded-[30px] p-6 sm:p-8 grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[11px] font-black">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{selectedPillar.badge}</span>
              </span>
              <h3 className="font-display font-bold text-2xl sm:text-3xl text-main">{selectedPillar.title}</h3>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">{selectedPillar.desc}</p>
              <ul className="space-y-2 text-xs text-sub">
                {selectedPillar.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-jade shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-2 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'تنظیم و تست این موتور در پنل' : 'Configure This Engine'}
                </button>
                {publicBotInfo.botUsername && (
                  <a
                    href={`https://t.me/${publicBotInfo.botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-5 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-brand" />
                    <span>{isFa ? `ربات تلگرام @${publicBotInfo.botUsername}` : `Bot @${publicBotInfo.botUsername}`}</span>
                  </a>
                )}
              </div>
            </div>

            <div className="surface-soft rounded-[26px] p-5 space-y-3 border hairline">
              <p className="text-[11px] font-black text-dim uppercase">
                {isFa ? 'آموزش ۴ قدمه شروع سریع (برای تازه‌کار تا حرفه‌ای)' : '4-Step Quick Academy Walkthrough'}
              </p>
              {[
                {
                  n: '۱',
                  t: isFa ? 'ثبت‌نام یک‌کلیک (Trust Wallet / گوگل / تلگرام)' : '1-Tap Onboarding (Trust Wallet / Google / TG)',
                  d: isFa
                    ? 'حساب در چند ثانیه ساخته می‌شود؛ بدون دریافت کارمزد ورودی یا اطلاعات بانکی.'
                    : 'Create your workspace in seconds with zero upfront fee.',
                },
                {
                  n: '۲',
                  t: isFa ? 'تمرین با دمو قابل تنظیم ($50–$10M) یا اتصال Trust Wallet' : 'Practice on Demo ($50–$10M) or Connect Trust Wallet',
                  d: isFa
                    ? 'ابتدا با سرمایه مجازی دلخواه معامله کنید یا از ۱۰ دلار واقعی روی ولت شخصی خودتان شروع کنید.'
                    : 'Practice risk-free on the custom simulator or trade live from $10+ inside Trust Wallet.',
                },
                {
                  n: '۳',
                  t: isFa ? 'فعال‌سازی دقیق موتور دلخواه (همگی پیش‌فرض خاموش‌اند)' : 'Pick & Toggle Desired Engines (Default OFF)',
                  d: isFa
                    ? 'راهنمای هر موتور را ببینید، فیلتر ارسال سیگنال و حد سود/ضرر را تنظیم کرده و استارت بزنید.'
                    : 'Read each built-in guide, configure signal filters & TP/SL, then switch on what you choose.',
                },
                {
                  n: '۴',
                  t: isFa ? 'مشاهده روی سوپرچارت و دریافت کارت سود قابل استعلام' : 'Inspect on Supercharts & Issue Verified Cards',
                  d: isFa
                    ? 'روی دکمه «نمودار و سیگنال» بزنید تا سطوح ورود و تارگت‌ها را روی کندل زنده ببینید و کارت سود بگیرید.'
                    : 'Tap Chart & Signal to view Entry/SL/TP directly on candles and export verifiable PnL cards.',
                },
              ].map((step) => (
                <div key={step.n} className="panel rounded-2xl p-3 flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl btn-gold grid place-items-center text-xs font-black shrink-0">{step.n}</span>
                  <div>
                    <p className="text-xs font-black text-main">{step.t}</p>
                    <p className="text-[10.5px] text-dim mt-0.5 leading-relaxed">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. TRANSPARENT PRODUCT ROADMAP */}
        <section id="roadmap" className="space-y-6">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
              <Compass className="w-3.5 h-3.5 text-[var(--gold)]" />
              <span>TRANSPARENT DELIVERY ROADMAP</span>
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'نقشه راه دلارینو: دستاوردهای تکمیل‌شده و چشم‌انداز آینده' : 'Dollarino Roadmap: Shipped Milestones & Next Horizon'}
            </h2>
            <p className="text-xs sm:text-sm text-dim">
              {isFa
                ? 'تمام بخش‌های فاز ۱ تا ۳ هم‌اکنون در پلتفرم پیاده‌سازی و فعال هستند و توسعه فاز ۴ در حال برنامه‌ریزی است.'
                : 'Phases 1–3 are live and tested in production today; Phase 4 outlines upcoming multi-sig & mobile expansions.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              {
                phase: 'PHASE 01 · V10 – V11.5',
                status: isFa ? 'تکمیل و فعال ✓' : 'COMPLETED ✓',
                done: true,
                title: isFa ? 'حذف اشتراک و مدل عادلانه ۳٪' : 'Zero Subscriptions & 3% Profit Model',
                items: isFa
                  ? ['حذف کامل اشتراک ماهانه برای همیشه', '۳ معامله سودده اول ۰٪ کارمزد واقعی', 'اکوسیستم تلگرام ۱+۷+۱ با ربات هوشمند', 'شبیه‌ساز دمو با سقف دلخواه $50 تا $10M']
                  : ['Permanent $0 monthly subscription', 'First 3 live wins at 0% fee', '1+7+1 Telegram bot & channel network', 'Custom $50–$10M Paper Simulator'],
              },
              {
                phase: 'PHASE 02 · V11.6 – V11.7.2',
                status: isFa ? 'تکمیل و فعال ✓' : 'COMPLETED ✓',
                done: true,
                title: isFa ? 'کپی‌ترید V2، اکستنشن و کارت سود' : 'Smart Copy V2, Extension & PnL Cards',
                items: isFa
                  ? ['کپی‌ترید ولت نهنگ‌ها + سپر ضدراگ زنده', 'اکستنشن پنل کناری کروم (Chrome Side Panel)', 'استودیو کارت سود ۱۶:۹ و ۹:۱۶ با تایید QR', 'ورود تک‌کلیک Trust Wallet DApp + گوگل']
                  : ['Whale Copy V2 + GoPlus/RugCheck shield', 'Chrome Side Panel simple extension', 'Signed 16:9 & 9:16 Profit Card Studio', 'Trust DApp + Google + Telegram onboarding'],
              },
              {
                phase: 'PHASE 03 · V11.9 (NOW)',
                status: isFa ? 'نسخه فعلی (فعال) ✓' : 'LIVE NOW ✓',
                done: true,
                title: isFa ? 'هم‌ترازی Trust، سوپرچارت و استعلام ۳۰ روزه' : 'Trust Parity, Supercharts & 30d Audits',
                items: isFa
                  ? ['پیش‌فرض خاموش تمام ۵ موتور + راهنمای تک‌باره', 'همگام با ۸۲۰+ ارز و پورتفوی ۴ شبکه Trust Wallet', 'سوپرچارت TradingView + عقربه تکنیکال + Pine v6', 'فیلتر اخبار ۲۴۰م + استعلام زنده ۳۰ روزه ولت']
                  : ['All 5 engines Default-OFF + guided setup', '820+ Trust Wallet markets & live multi-chain portfolio', 'TradingView Supercharts + Gauge + Pine v6', '240m filtered news + live 30d wallet audit page'],
              },
              {
                phase: 'PHASE 04 · V12 VISION',
                status: isFa ? 'در مسیر توسعه 🚀' : 'UPCOMING 🚀',
                done: false,
                title: isFa ? 'آربیتراژ DEX و خزانه چندامضایی' : 'Cross-DEX Arbitrage & Multi-Sig Vaults',
                items: isFa
                  ? ['خزانه غیرامانی با محدودیت سقف امضای هوشمند', 'رادار آربیتراژ لحظه‌ای میان Perp DEX و Spot', 'اشتراک‌گذاری لینک استراتژی‌های تاییدشده Pine v6', 'اپلیکیشن موبایل بومی با اعلان نیتیو']
                  : ['Session-key capped smart contract vaults', 'Real-time Perp/DEX spread & arbitrage radar', 'Shareable verified Pine v6 strategy presets', 'Native mobile push & biometric signing'],
              },
            ].map((rm) => (
              <div
                key={rm.phase}
                className={`panel rounded-[26px] p-5 border space-y-3 ${
                  rm.done ? 'border-emerald-500/30' : 'border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-dim">{rm.phase}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9.5px] font-black ${
                      rm.done ? 'bg-emerald-500/15 text-jade' : 'bg-amber-500/15 text-[var(--gold)]'
                    }`}
                  >
                    {rm.status}
                  </span>
                </div>
                <h3 className="font-display font-bold text-base text-main">{rm.title}</h3>
                <ul className="space-y-1.5 text-[11px] text-dim">
                  {rm.items.map((it) => (
                    <li key={it} className="flex items-start gap-1.5">
                      {rm.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-jade shrink-0 mt-0.5" />
                      ) : (
                        <Rocket className="w-3.5 h-3.5 text-[var(--gold)] shrink-0 mt-0.5" />
                      )}
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 7. LIVE MARKETS EXPLORER */}
        <section id="live-markets" className="space-y-4">
          <div className="panel rounded-[28px] p-5 sm:p-6 border hairline space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
                  LIVE TOP MARKETS · CLICK ANY TICKER COIN
                </p>
                <h2 className="font-display font-bold text-2xl text-main mt-0.5">
                  {isFa ? 'نبض زنده بازار ارزهای برتر (همگام با نوار بالا)' : 'Live Top Crypto Markets Explorer'}
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-xl surface-soft border hairline font-bold text-main">
                  {isFa ? `تتر زنده: ${iranIrt.toLocaleString('en-US')} تومان` : `Live USDT/IRT: ${iranIrt.toLocaleString('en-US')}`}
                </span>
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-gold px-4 py-2 rounded-xl text-xs font-black"
                >
                  {isFa ? 'مشاهده ۸۲۰+ بازار Trust' : 'Explore 820+ Markets'}
                </button>
              </div>
            </div>

            <div className="surface-soft rounded-2xl p-4 border-2 border-[var(--gold)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <CoinIcon symbol={activeCoin.symbol} size={42} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span dir="ltr" className="font-display font-black text-lg text-main">{activeCoin.symbol}</span>
                    <span className="text-xs font-bold text-dim">
                      {coinDisplayName(activeCoin.base || activeCoin.symbol.replace(/USDT$/, ''), isFa)}
                    </span>
                    <span
                      dir="ltr"
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        activeCoin.changePct24h >= 0 ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'
                      }`}
                    >
                      {activeCoin.changePct24h >= 0 ? '+' : ''}
                      {activeCoin.changePct24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
                    <span dir="ltr" className="font-num font-black text-base text-main">{fmtUsdPrice(activeCoin.price)}</span>
                    {isFa && activeCoin.price > 0 && (
                      <span className="text-dim tabular">{formatTomanEq(activeCoin.price, iranIrt)} تومان</span>
                    )}
                    {Number(activeCoin.high24h || 0) > 0 && (
                      <span dir="ltr" className="text-[11px] text-dim">
                        24h H: {fmtUsdPrice(Number(activeCoin.high24h))} · L: {fmtUsdPrice(Number(activeCoin.low24h || activeCoin.price))}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {liveCandles.length > 4 && (
                  <div className="w-28 h-10 hidden sm:block">
                    <Sparkline
                      values={liveCandles}
                      color={activeCoin.changePct24h >= 0 ? '#10d9a3' : '#f43f5e'}
                      height={38}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-4 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isFa ? `تحلیل و ترید ${activeCoin.base || activeCoin.symbol.replace(/USDT$/, '')}` : `Trade ${activeCoin.base || activeCoin.symbol}`}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {liveCoins.slice(0, 8).map((c) => {
                const up = c.changePct24h >= 0;
                const active = c.symbol === activeCoin.symbol;
                return (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => setHeroCoin(c.symbol)}
                    className={`rounded-2xl p-2.5 text-start transition border ${
                      active
                        ? 'bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)] border-[var(--gold)]'
                        : 'surface-soft hairline hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CoinIcon symbol={c.symbol} size={18} />
                      <span dir="ltr" className="text-xs font-black text-main truncate">
                        {c.base || c.symbol.replace(/USDT$/, '')}
                      </span>
                    </div>
                    <p dir="ltr" className="font-num font-bold text-xs text-sub mt-1.5 truncate">
                      {fmtUsdPrice(c.price)}
                    </p>
                    <p dir="ltr" className={`font-num text-[10px] font-black ${up ? 'text-jade' : 'text-loss'}`}>
                      {up ? '+' : ''}
                      {c.changePct24h.toFixed(2)}%
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 8. SMART COPY-TRADING V2 + ANTI-RUG SHOWCASE */}
        <section id="smart-v2" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="panel glow-card-anim rounded-[30px] overflow-hidden flex flex-col justify-between border border-amber-500/25">
              <div>
                <div className="relative h-48 sm:h-52 overflow-hidden">
                  <img
                    src="/images/smart-wallet-radar.webp"
                    alt="Smart Wallet Copy Trading & 24/7 Copy-Vault"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#081022] via-[#081022]/35 to-transparent flex items-end p-5">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black">
                        {isFa ? '۱۰ تریدر برتر + ولت دلخواه + خزانه ۲۴/۷' : 'TOP-10 WALLETS + CUSTOM TRACKING + VAULT'}
                      </span>
                      <h3 className="font-display font-bold text-lg sm:text-xl text-white mt-1.5">
                        {isFa ? 'کپی‌ترید هوشمند ولت‌ها با باکس مارجین ایزوله' : 'Smart-Money Wallets with Isolated Margin Boxes'}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-3 text-xs">
                  <p className="text-dim leading-relaxed">
                    {isFa
                      ? 'برترین ولت‌های Solana، Base، Ethereum، BSC، Arbitrum، TON و TRON را رصد کنید یا آدرس هر ولت شخصی را ثبت کنید. سیستم به‌صورت خودکار فقط معاملاتی را که از لحظه فالو باز می‌شوند رصد و کپی می‌کند.'
                      : 'Track leaderboard whales or paste any custom address across Solana, Base, ETH, BSC, Arbitrum, TON & TRON. Strictly copies new positions opened after follow time.'}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      {
                        icon: Vault,
                        title: isFa ? 'باکس سرمایه جدا + سقف ضرر' : 'Isolated Margin Box & Daily Cap',
                        desc: isFa ? 'هر تریدر حسابک مارجین و حد ضرر روزانه مستقل دارد.' : 'Separate budget box & daily loss cap per trader.',
                      },
                      {
                        icon: Sparkles,
                        title: isFa ? 'بک‌تست ۷ روزه + پله‌های پرو' : '7-Day Backtest & Pro TP/SL',
                        desc: isFa ? 'TP1/2/3، Moonbag، Trailing، Break-Even و معکوس.' : 'TP1/2/3, Moonbag, Trailing SL, Break-Even & Reverse Copy.',
                      },
                      {
                        icon: KeyRound,
                        title: isFa ? 'خزانه ۲۴/۷ + بک‌آپ کلید' : '24/7 Copy-Vault + Key Backup',
                        desc: isFa ? 'اجرای خودکار روی Jupiter سولانا و خروجی کلید AES-256.' : 'Automated Solana Jupiter swaps & encrypted key export.',
                      },
                      {
                        icon: Trophy,
                        title: isFa ? 'کنترل در تلگرام + کارت سود' : 'Telegram Bot + Verified Card',
                        desc: isFa ? 'مدیریت پوزیشن‌ها در ربات متصل و صدور کارت سود PNG.' : 'Manage V2 trades in Telegram bot & issue Verified PnL Cards.',
                      },
                    ].map((f) => {
                      const FIcon = f.icon;
                      return (
                        <div key={f.title} className="surface-soft rounded-2xl p-3 space-y-1">
                          <div className="flex items-center gap-1.5 font-black text-main">
                            <FIcon className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
                            <span>{f.title}</span>
                          </div>
                          <p className="text-[11px] text-dim leading-relaxed">{f.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="px-5 sm:px-6 pb-5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-gold w-full py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'ورود به هاب کپی‌ترید هوشمند V2' : 'Open Smart Copy-Trading V2 Hub'}
                </button>
              </div>
            </div>

            <div className="panel glow-card-anim rounded-[30px] overflow-hidden flex flex-col justify-between border border-emerald-500/25">
              <div>
                <div className="relative h-48 sm:h-52 overflow-hidden">
                  <img
                    src="/images/antirug-shield-dapp.webp"
                    alt="Real-Time Anti-Rug Shield and Multi-DApp Trust Wallet Routing"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#081022] via-[#081022]/35 to-transparent flex items-end p-5">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                        GOPLUS · HONEYPOT.IS · RUGCHECK · TRUST DAPP
                      </span>
                      <h3 className="font-display font-bold text-lg sm:text-xl text-white mt-1.5">
                        {isFa ? 'سپر ضدراگ چندمنبعی + تمام صرافی‌های DEX در Trust Wallet' : 'Multi-Source Anti-Rug + All Network DEXs in Trust Wallet'}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-3 text-xs">
                  <p className="text-dim leading-relaxed">
                    {isFa
                      ? 'قبل از هر خرید غیرامانی، قرارداد توکن به‌صورت زنده از نظر Honeypot، مالیات خرید/فروش، مجوز Mint و قفل بودن نقدینگی بررسی می‌شود. سپس می‌توانید معامله را مستقیماً در برترین DAppهای Trust Wallet باز کنید.'
                      : 'Before any non-custodial swap, every contract is scanned live for Honeypot traps, Buy/Sell tax, Mint authority, and LP locks — then routed straight into Trust Wallet DApps.'}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      {
                        icon: ShieldAlert,
                        title: isFa ? 'امتیاز شفاف ۰ تا ۹۵ + اخطارها' : '0–95 Safety Score & Tax Flags',
                        desc: isFa ? 'شناسایی مالیات بالا، فریز، هانی‌پات و خروج خودکار Dev-Sell.' : 'Detects high taxes, freeze/mint traps & auto Dev-Sell exit.',
                      },
                      {
                        icon: Zap,
                        title: isFa ? 'مسیریاب Multi-DApp همه‌شبکه‌ها' : 'All-Chain Multi-DApp Router',
                        desc: isFa ? 'Jupiter, Raydium, PancakeSwap, Uniswap, 1inch, STON.fi, SunSwap.' : 'Jupiter, Raydium, PancakeSwap, Uniswap, 1inch, STON.fi & Cetus.',
                      },
                      {
                        icon: ShieldCheck,
                        title: isFa ? 'فیلتر حداقل نقدینگی و مارکت‌کپ' : 'Liquidity, Slippage & MCap Guard',
                        desc: isFa ? 'اگر توکن زیر نقدینگی یا اسلیپیج مجاز باشد خودکار رد می‌شود.' : 'Blocks illiquid or over-slippage trades before execution.',
                      },
                      {
                        icon: Send,
                        title: isFa ? 'یک کلیک تا Trust Wallet موبایل' : '1-Click Trust Wallet Deep Link',
                        desc: isFa ? 'باز شدن فوری جفت‌ارز در DApp مرورگر تراست‌ولت بدون انتقال کلید.' : 'Launches straight inside Trust Wallet DApp with zero key sharing.',
                      },
                    ].map((f) => {
                      const FIcon = f.icon;
                      return (
                        <div key={f.title} className="surface-soft rounded-2xl p-3 space-y-1">
                          <div className="flex items-center gap-1.5 font-black text-main">
                            <FIcon className="w-3.5 h-3.5 text-jade shrink-0" />
                            <span>{f.title}</span>
                          </div>
                          <p className="text-[11px] text-dim leading-relaxed">{f.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="px-5 sm:px-6 pb-5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald w-full py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'اسکن ضدراگ و سوآپ Multi-DApp در پنل' : 'Launch Anti-Rug Scanner & Trust Multi-DApp'}
                </button>
              </div>
            </div>
          </div>

          {copyTraders.length > 0 && (
            <div className="grid md:grid-cols-3 gap-4">
              {copyTraders.map((t) => (
                <div key={t.id} className="panel panel-hover rounded-[26px] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-display font-bold text-base text-main">{t.display_name}</h3>
                        <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                      </div>
                      <p className="text-[11px] text-dim mt-0.5">{t.specialty} · <span dir="ltr">{t.handle}</span></p>
                    </div>
                    <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                      {isFa ? 'تاییدشده' : 'VERIFIED'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="surface-soft rounded-2xl p-2.5">
                      <p dir="ltr" className="font-num font-black text-jade">+{t.roi_30d_pct}%</p>
                      <p className="text-[10px] text-dim">{isFa ? 'بازده ۳۰ روزه' : '30d ROI'}</p>
                    </div>
                    <div className="surface-soft rounded-2xl p-2.5">
                      <p dir="ltr" className="font-num font-black text-main">{t.win_rate}%</p>
                      <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
                    </div>
                    <div className="surface-soft rounded-2xl p-2.5">
                      <p dir="ltr" className="font-num font-black text-sub">{t.followers_count}</p>
                      <p className="text-[10px] text-dim">{isFa ? 'دنبال‌کننده' : 'Followers'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoAuth('register')}
                    className="btn-ghost w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-brand" />
                    <span>{isFa ? 'کپی خودکار معاملات این تریدر' : 'Follow & Copy Trader'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 9. ZERO SUBSCRIPTION + 3 FREE WINS + 3% PROFIT SHARE */}
        <section id="pricing" className="space-y-6">
          <div className="panel rounded-[30px] p-6 sm:p-8 border hairline grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-center relative overflow-hidden">
            <img
              src="/logo-hd.webp"
              alt=""
              aria-hidden="true"
              className="pointer-events-none select-none absolute -top-10 -left-10 w-52 h-52 object-contain opacity-[0.04]"
            />
            <div className="relative z-10 space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[11px] font-black">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isFa ? '۱۰۰٪ رایگان · اشتراک ماهانه برای همیشه حذف شد!' : 'ZERO SUBSCRIPTIONS · 100% FREE FOREVER'}</span>
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? '۳ معامله اول ۰٪ · سپس فقط ۳٪ کارمزد سرور از سود واقعی (۹۷٪ سود برای شما!)' : 'First 3 Live Wins 0% · Then Only 3% Server Fee on Net Profits (Keep 97%!)'}
              </h2>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">
                {isFa
                  ? `تمام امکانات دلارینو رایگان است: کیف‌پول دمو قابل تنظیم رایگان (\u2066$50–$10M\u2069)، ۵ موتور همزمان، سوپرچارت TradingView و ۲۵+ اندیکاتور و هوش مصنوعی چندمدلی. نرخ لحظه‌ای هر دلار تتر ایران: ${iranIrt.toLocaleString('en-US')} تومان.`
                  : 'All Dollarino modules are free: Customizable Paper Wallet ($50–$10M), 5 concurrent engines, TradingView Supercharts, 25+ Free Alerts, and Multi-AI. Live trading starts from $10+ USD in your own Trust Wallet.'}
              </p>
              <div className="grid sm:grid-cols-3 gap-2.5 text-xs">
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="font-black text-main">{isFa ? '۳ معامله سودده اول ۰٪' : 'First 3 Live Wins = 0%'}</p>
                  <p className="text-[11px] text-dim mt-0.5">{isFa ? 'تست واقعی بدون کارمزد' : 'Zero fee trial on real wins'}</p>
                </div>
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="font-black text-[#059669] dark:text-[#34D399]">{isFa ? '۳٪ فقط از سود واقعی' : '3% On Real Profit'}</p>
                  <p className="text-[11px] text-dim mt-0.5">{isFa ? '۹۷٪ سود برای شما · دمو رایگان' : 'Keep 97% · Demo = $0'}</p>
                </div>
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="font-black text-main">{isFa ? 'شروع واقعی از ۱۰ دلار' : 'Live Min $10 USD'}</p>
                  <p className="text-[11px] text-dim mt-0.5">{isFa ? 'کیف‌پول Trust Wallet شخصی' : 'Non-custodial Trust Wallet'}</p>
                </div>
              </div>
              <div className="rounded-2xl p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-xs leading-relaxed">
                <p className="font-black text-[#059669] dark:text-[#34D399] mb-1">
                  {isFa ? 'چرا دلارینو کاملاً هم‌جهت با سود شماست؟' : 'Why Dollarino Is 100% Aligned With Your Net Profit:'}
                </p>
                <p className="text-main">
                  {isFa
                    ? 'سایر پلتفرم‌ها قبل از هر نتیجه‌ای حق اشتراک می‌گیرند و سود یا ضرر کاربر برایشان فرقی ندارد؛ اما دلارینو اشتراک پولی ندارد و تمام تلاشش را روی کیفیت تحلیل و فیلتر سیگنال می‌گذارد، چون درآمد ۳٪ سرور فقط زمانی ایجاد می‌شود که معاملات واقعی شما سودده شوند!'
                    : 'Subscription bots get paid upfront whether you win or lose. Dollarino charges $0 subscription and earns its 3% server fee strictly on realized net wins — our incentives match yours.'}
                </p>
              </div>
              <div className="pt-1 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-6 py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'شروع رایگان در وب و تلگرام' : 'Start Free Now'}
                </button>
              </div>
            </div>
            <div className="relative z-10 flex flex-col items-center justify-center gap-3">
              <img
                src="/images/transparent/rocket-profit-3d.webp"
                alt="3% Profit Share Rocket"
                loading="lazy"
                decoding="async"
                className="h-48 w-48 object-contain drop-shadow-2xl"
              />
              <span className="text-[11px] font-bold text-dim text-center">
                {isFa ? 'معادل هر ۱۰ دلار موجودی ≈ ' + Math.round(10 * iranIrt).toLocaleString('fa-IR') + ' تومان' : '10 USD Live Minimum ≈ ' + Math.round(10 * iranIrt).toLocaleString('en-US') + ' IRT'}
              </span>
            </div>
          </div>
        </section>

        {/* 10. FOUNDER VERIFICATION & ANTI-PONZI TRANSPARENCY */}
        {(founder?.showPublic ?? true) && (
          <section id="trust-founder" className="space-y-6">
            <div className="text-center max-w-3xl mx-auto space-y-2.5">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[10px] font-black tracking-wide uppercase">
                <BadgeCheck className="w-3.5 h-3.5" />
                <span>{isFa ? 'شفافیت کامل بنیان‌گذار · ۱۰۰٪ مستقل · تضمین فنی ضدپانزی' : 'FULL FOUNDER TRANSPARENCY · 100% SOLO-BUILT · ZERO-PONZI PROOF'}</span>
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'قبل از ثبت‌نام، سازنده و اصالت پروژه را کامل بشناسید' : 'Meet the Founder & Verify Dollarino Before Signing Up'}
              </h2>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">
                {isFa
                  ? 'برخلاف پروژه‌های ناشناس و اسکم، تمام هویت سازنده، راه‌های ارتباط مستقیم، استقلال کامل پروژه و ۶ دلیل فنی غیرپانزی بودن دلارینو به‌صورت شفاف قبل از ورود در دسترس شماست.'
                  : 'Unlike anonymous schemes, Dollarino publishes full founder identity, verifiable contacts, solo-built independence, and 6 architectural proofs that Dollarino is non-custodial and zero-Ponzi.'}
              </p>
            </div>

            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-5 items-stretch">
              <div className="panel rounded-[30px] p-6 sm:p-7 border hairline flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    {founder?.photoUrl ? (
                      <img
                        src={founder.photoUrl}
                        alt={isFa ? founder.fullNameFa : founder.fullNameEn}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-[24px] object-cover border-2 border-[var(--gold)] shadow-lg shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[24px] surface-soft border hairline flex flex-col items-center justify-center shrink-0">
                        <DollarinoBrandMark size={60} glow />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-black text-xl sm:text-2xl text-main">
                          {isFa ? (founder?.fullNameFa || 'آوید کیا') : (founder?.fullNameEn || 'Avid Kiya')}
                        </h3>
                        <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          <span>{isFa ? 'هویت رسمی تاییدشده' : 'VERIFIED FOUNDER'}</span>
                        </span>
                      </div>
                      <p className="text-xs font-bold text-[var(--gold)]">
                        {isFa
                          ? (founder?.roleFa || 'معمار نرم‌افزار، بنیان‌گذار و توسعه‌دهنده ۱۰۰٪ مستقل (صفر تا صد)')
                          : (founder?.roleEn || '100% Independent Founder & Solo Full-Stack Architect')}
                      </p>
                      {founder?.verificationId && (
                        <span dir="ltr" className="inline-block px-2.5 py-0.5 rounded-lg surface-soft border hairline font-mono font-bold text-[11px] text-main">
                          ID: {founder.verificationId}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#059669] dark:text-[#34D399]">
                      <Award className="w-4 h-4 shrink-0" />
                      <span>{isFa ? 'بیانیه استقلال ۱۰۰٪ (صفر تا صد مستقل و بدون واسطه)' : '100% Independent Solo-Built Declaration'}</span>
                    </div>
                    <p className="text-xs text-main leading-relaxed">
                      {isFa
                        ? (founder?.independenceFa || 'تمامی بخش‌های دلارینو از صفر تا صد توسط یک نفر (آوید کیا) طراحی، کدنویسی و نگهداری شده و زیر پوشش هیچ شرکت یا واسطه ثالثی نیست.')
                        : (founder?.independenceEn || 'Designed, engineered, and operated 0-to-100 solely by Avid Kiya without any third-party cover or intermediary.')}
                    </p>
                  </div>

                  <p className="text-xs text-sub leading-relaxed">
                    {isFa
                      ? (founder?.bioFa || 'طراح و مهندس تمام کدهای کلاینت، سرور ابری، موتورهای چندمدلی AI، سیستم امنیتی و ربات تلگرام دلارینو با تمرکز بر شفافیت و نگهداری غیرامانی سرمایه کاربران.')
                      : (founder?.bioEn || 'Creator of the entire Dollarino web platform, edge AI engine, security layer, and Telegram automation stack focused on non-custodial transparency.')}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                    {founder?.email && (
                      <a
                        href={`mailto:${founder.email}`}
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Mail className="w-4 h-4 text-[var(--gold)] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Official Email</span>
                          <span className="font-bold text-main truncate block">{founder.email}</span>
                        </div>
                      </a>
                    )}
                    {founder?.phone && (
                      <div dir="ltr" className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 min-w-0">
                        <Phone className="w-4 h-4 text-jade shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Direct Contact</span>
                          <span className="font-mono font-bold text-main truncate block">{founder.phone}</span>
                        </div>
                      </div>
                    )}
                    {(isFa ? founder?.addressFa : founder?.addressEn) && (
                      <div className="surface-soft rounded-2xl p-3 border hairline flex items-start gap-2.5 sm:col-span-2 min-w-0">
                        <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? 'نشانی و محل استقرار قابل استعلام' : 'Verifiable Physical Address'}</span>
                          <span className="font-bold text-main leading-relaxed block">
                            {isFa ? founder?.addressFa : founder?.addressEn}
                          </span>
                        </div>
                      </div>
                    )}
                    {(founder?.telegramUrl || founder?.telegram) && (
                      <a
                        href={founder?.telegramUrl || `https://t.me/${String(founder?.telegram || '').replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Send className="w-4 h-4 text-[#0EA5E9] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Telegram Founder ID</span>
                          <span className="font-bold text-main truncate block">{founder?.telegram || founder?.telegramUrl}</span>
                        </div>
                      </a>
                    )}
                    {(communityInvite || publicBotInfo.communityGroupInvite) && (
                      <a
                        href={publicBotInfo.communityGroupInvite || communityInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="surface-soft rounded-2xl p-3 border border-indigo-500/35 flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Users className="w-4 h-4 text-brand shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? '03. گروه کاربران دلارینو' : '03. Community Group'}</span>
                          <span className="font-bold text-main truncate block">{isFa ? 'پرسش و پاسخ و تبادل تجربه' : 'Join Traders Community'}</span>
                        </div>
                      </a>
                    )}
                  </div>
                </div>

                <div className="surface-soft rounded-2xl p-4 border hairline space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-main">
                    <FileCheck2 className="w-4 h-4 text-[var(--gold)]" />
                    <span>{isFa ? 'هدف، کاربرد و ارزش پروژه دلارینو' : 'Project Mission & Core Value'}</span>
                  </div>
                  <p className="text-xs text-sub leading-relaxed">
                    {isFa
                      ? (founder?.missionFa || 'هدف دلارینو دموکراتیک‌سازی ترید الگوریتمی و هوش مصنوعی برای همه کاربران بدون نیاز به پرداخت اشتراک است: آموزش ۱۰۰٪ رایگان روی دمو قابل تنظیم و در حالت واقعی ۳ معامله اول رایگان + فقط ۳٪ از سود واقعی در کیف‌پول شخصی خود کاربر.')
                      : (founder?.missionEn || 'Dollarino democratizes AI and algorithmic trading with zero upfront fees: free customizable paper training, first 3 live wins at 0% fee, plus a transparent 3% profit-only fee.')}
                  </p>
                </div>
              </div>

              <div className="panel rounded-[30px] p-6 sm:p-7 border hairline flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#059669] dark:text-[#34D399]">
                        {isFa ? 'اصالت و ساختار حقوقی/فنی' : 'ARCHITECTURAL TRUST PROOF'}
                      </span>
                      <h3 className="font-display font-black text-xl text-main mt-0.5">
                        {isFa ? '۶ دلیل قطعی که دلارینو پانزی و اسکم نیست' : '6 Verifiable Reasons Dollarino Is Zero-Ponzi'}
                      </h3>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[10px] font-black">
                      NON-CUSTODIAL
                    </span>
                  </div>

                  <p className="text-xs text-dim leading-relaxed">
                    {isFa
                      ? (founder?.antiPonziFa || 'دلارینو هیچ‌گونه دریافت سرمایه، سود تضمینی یا طرح هرمی ندارد؛ دارایی در کیف‌پول شخصی خود کاربر است و هر تراکنش با مجوز غیرقابل برداشت اجرا می‌شود.')
                      : (founder?.antiPonziEn || 'Dollarino never pools user deposits, promises fixed yields, or runs MLM tiers. Funds remain in the user’s own Trust Wallet.')}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                    {(isFa
                      ? [
                          ['۱. بدون دریافت سپرده کاربر', 'هیچ پولی به حساب دلارینو واریز نمی‌شود؛ تمام سرمایه شما در کیف‌پول شخصی Trust Wallet خودتان باقی می‌ماند.'],
                          ['۲. بدون سود تضمینی و بدون هرمی', 'هیچ وعده سود ثابت روزانه/ماهانه وجود ندارد. هر معامله واقعی روی بازار شفاف صرافی غیرمتمرکز انجام می‌شود.'],
                          ['۳. کلید بدون مجوز برداشت', 'اتصال Web3 و Agent Key منحصراً برای ثبت سفارش و حد ضرر است و امکان برداشت به ولت دیگر از پایه مسدود است.'],
                          ['۴. ۳ معامله رایگان · ۳٪ فقط از سود', '۳ معامله سودده اول رایگان است و پس از آن فقط ۳٪ از سود واقعی محاسبه می‌شود (۹۷٪ سود مال شماست).'],
                          ['۵. سپر ضدراگ و هانی‌پات زنده', 'تمام توکن‌ها قبل از ورود با GoPlus، Honeypot.is و RugCheck اسکن می‌شوند تا از کلاهبرداری قراردادها جلوگیری شود.'],
                          ['۶. هویت باز و استعلام ۳۰ روزه', 'مشخصات واقعی سازنده، نتایج زنده بک‌تست و صفحه استعلام دیجیتال ۳۰ روزه برای راستی‌آزمایی عموم باز است.'],
                        ]
                      : [
                          ['1. Zero Pooled Deposits', 'Dollarino never collects or holds trading capital. Your funds stay inside your own self-custodial Trust Wallet.'],
                          ['2. No Fixed ROI / No MLM', 'Zero fake guaranteed daily yields and zero multi-level pyramid payouts — only transparent market execution.'],
                          ['3. Zero Withdrawal Permission', 'Execution scopes only sign orders & SL/TP. Funds cannot be withdrawn to third-party wallets.'],
                          ['4. 3 Free Wins · 3% Profit Only', 'First 3 profitable live trades carry 0% fee, then you keep 97% of net profits. Demo simulation is 100% free.'],
                          ['5. Real-Time Anti-Rug Scanner', 'Every token is verified via GoPlus, Honeypot.is & RugCheck before copy or swap orders trigger.'],
                          ['6. Traceable Identity & 30d Audits', 'Founder identity, live candle backtests, and the 30-day wallet audit lookup are publicly verifiable.'],
                        ]
                    ).map(([title, desc]) => (
                      <div key={title} className="surface-soft rounded-2xl p-3.5 border hairline space-y-1">
                        <p className="font-black text-main text-xs">{title}</p>
                        <p className="text-[11px] text-dim leading-relaxed">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5 border-t hairline">
                  <span className="text-[11px] font-bold text-dim">
                    {isFa ? (
                      <>
                        ابتدا با شبیه‌ساز دمو قابل تنظیم (<span dir="ltr" className="inline-block font-bold" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>) رایگان امتحان کنید؛ بدون ریسک!
                      </>
                    ) : (
                      'Test free on the Custom Demo Simulator ($50–$10M) first — zero deposit required!'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onGoAuth('register')}
                    className="btn-emerald px-5 py-2.5 rounded-2xl text-xs font-black shrink-0"
                  >
                    {isFa ? 'شروع آزمایشی رایگان ←' : 'Try Free Simulator →'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 11. SECURITY & FAQ */}
        <section id="faq" className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div className="panel rounded-[28px] p-6 space-y-4">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[10px] font-black">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ZERO-TRUST SECURITY · PWA + EXTENSION</span>
            </span>
            <h3 className="font-display font-bold text-2xl text-main">
              {isFa ? 'امنیت کامل سرمایه + اکستنشن کروم + پشتیبانی واقعی' : 'Bank-Grade Security + Chrome Side Panel + Live Support'}
            </h3>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'دارایی واقعی شما در کیف‌پول غیرامانی Trust Wallet باقی می‌ماند و با امضای استاندارد Web3 و کلید محدود (بدون مجوز برداشت) عمل می‌کند. در تمام ساعات شبانه‌روز از طریق چت پشتیبانی آنلاین یا ربات تلگرام همراه شما هستیم.'
                : 'Your live funds remain inside your self-custody Trust Wallet using scoped non-withdrawable execution keys. Reach our support desk live inside the app or via Telegram anytime.'}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {onOpenSupport && (
                <button
                  type="button"
                  onClick={onOpenSupport}
                  className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Headphones className="w-4 h-4" />
                  <span>{isFa ? 'گفتگو با پشتیبانی آنلاین' : 'Chat with Support'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPwaOpen(true)}
                className="btn-ghost px-4 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{pwa.canPromptNatively ? (isFa ? 'نصب اپلیکیشن' : 'Install App') : isFa ? 'نصب وب‌اپ (PWA)' : 'Install PWA'}</span>
              </button>
              <a
                href="/downloads/dollarino-extension.zip"
                download="dollarino-extension-chrome-v11.9.1.zip"
                className="btn-cobalt px-4 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <PanelRight className="w-4 h-4" />
                <span>{isFa ? 'اکستنشن کروم V11.9.1' : 'Chrome Extension'}</span>
              </a>
              <a
                href="/downloads/dollarino-extension-firefox.zip"
                download="dollarino-extension-firefox-v11.9.1.zip"
                className="btn-ghost px-3.5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'فایرفاکس' : 'Firefox'}</span>
              </a>
              <a
                href="/downloads/dollarino-extension-edge.zip"
                download="dollarino-extension-edge-v11.9.1.zip"
                className="btn-ghost px-3.5 py-3 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'اج (Edge)' : 'Edge'}</span>
              </a>
            </div>
          </div>

          <div className="panel rounded-[28px] p-5 space-y-2.5">
            <h3 className="font-display font-bold text-lg text-main px-1 pb-1">
              {isFa ? 'سوالات پرتکرار کاربران (نسخه V11.9)' : 'Frequently Asked Questions (V11.9)'}
            </h3>
            {(isFa
              ? [
                  ['چرا تمام ۵ موتور معاملاتی در ابتدا خاموش هستند؟', 'برای ایمنی کامل سرمایه شما در نسخه V11.9، هیچ موتوری به‌صورت خودکار روشن نمی‌شود. هنگام ورود، راهنمای هر موتور با کلیک روی کارت یا علامت ؟ در دسترس است و ربات فقط موتورهایی را اجرا می‌کند که خودتان آگاهانه فعال کرده باشید.'],
                  ['استعلام دیجیتال ۳۰ روزه ولت‌ها چطور کار می‌کند؟', 'در بخش «صفحه دیجیتال استعلام ۳۰ روزه» بالای همین صفحه می‌توانید آدرس کیف‌پول خود یا هر کد استعلام AUD-... یا شناسه کارت سود CRD_... را وارد کنید تا وین‌ریت، تعداد معاملات، سود خالص دلاری، ROI و تاریخچه ۳۰ روزه به صورت زنده از سرور استعلام شود — بدون افشای ایمیل یا اطلاعات شخصی.'],
                  ['سوپرچارت TradingView و دکمه «نمودار و سیگنال» چه کمکی می‌کند؟', 'پلتفرم دارای سوپرچارت کامل با واچ‌لیست، عقربه خلاصه تکنیکال (Technicals Gauge) و ادیتور Pine Script v4/v5/v6 است. همچنین کنار هر معامله باز دکمه «نمودار و سیگنال» وجود دارد که شما را مستقیماً به همان تایم‌فریم سیگنال برده و خطوط Entry، SL و TP1..TP3 را با متن دلیل روی چارت رسم می‌کند.'],
                  ['هم‌ترازی کامل با Trust Wallet یعنی چه؟', 'تمام ۸۲۰+ جفت‌ارز در بخش بازارها و اسکنر رادار دقیقاً با دسته‌بندی و لوگوی Trust Wallet هماهنگ شده‌اند و در صفحه کیف‌پول من، موجودی لحظه‌ای توکن‌های شما روی شبکه‌های EVM، Solana، TON و TRON مستقل از صفحه خزانه ۳٪ نمایش داده می‌شود.'],
                  ['اکستنشن پنل کناری کروم و کارت سود ۱۶:۹ / ۹:۱۶ چطور کار می‌کنند؟', 'افزونه کروم مستقیماً در Side Panel مرورگر کنار سایت‌های صرافی سنجاق می‌شود و در حالت ساده کار می‌کند. همچنین پس از بسته‌شدن هر معامله، می‌توانید کارت سود PNG تاییدشده با امضای HMAC و QR استعلام آنلاین در سایز ۱۶:۹ یا ۹:۱۶ صادر کنید.'],
                  ['آیا امکان پیش‌نمایش سیگنال‌ها و نتایج قبل از عضویت وجود دارد؟', 'بله! در بخش «پیش‌نمایش زنده کانال سیگنال (01) و نتایج (02)» در همین صفحه می‌توانید جدیدترین سیگنال‌ها، سطوح ورود/تارگت و لینک مستقیم کانال‌های تلگرام ما را پیش از ثبت‌نام مشاهده کنید.'],
                ]
              : [
                  ['Why are all 5 trading engines OFF by default?', 'For strict user safety in V11.9, zero engines are pre-enabled. Each engine card includes an interactive guide modal (? button), and the bot strictly starts only after you choose and activate at least one engine.'],
                  ['How does the 30-day digital wallet audit lookup work?', 'Enter any connected wallet address, audit code (AUD-...), or Profit Card ID (CRD_...) in the Digital Audit Hub above to verify real 30-day trade counts, win rate, net USD PnL, ROI, and recent closed trades directly from the server — with zero personal PII exposed.'],
                  ['How do TradingView Supercharts & Chart-Signal Jump work?', 'Dollarino includes Supercharts with a collapsible Watchlist, Technicals Dial Gauge, and Pine v4/v5/v6 runtime. Every open trade also offers a "Chart & Signal" button that switches to the exact signal timeframe and draws Entry, SL & TP1–TP3 right on the candles.'],
                  ['What does Trust Wallet parity cover?', 'Markets & Radar scan across 820+ Trust Wallet-aligned assets by category (L1, DeFi, AI, Meme, Gaming, RWA), while My Trust Wallet tracks live multi-chain balances across EVM, Solana, TON & TRON cleanly separated from the 3% Treasury page.'],
                  ['How do Chrome Side Panel & 16:9 / 9:16 Profit Cards work?', 'The MV3 Chrome extension docks cleanly in Chrome’s Side Panel locked to Simple Mode, while the Studio exports HMAC-signed 16:9 & 9:16 PNG PnL cards verifiable publicly via QR code.'],
                  ['Can I inspect signals & results before registering?', 'Yes! The Public Signal (01) & Results (02) Showcase right on this page displays recent live signals, target hits, verified cards, and direct Telegram channel invites before signup.'],
                ]
            ).map(([q, a], i) => (
              <div key={q} className="surface-soft rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="w-full px-4 py-3 flex items-center justify-between text-start text-xs sm:text-sm font-bold text-main gap-2"
                >
                  <span>{q}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && <p className="px-4 pb-3.5 text-xs text-dim leading-relaxed">{a}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Branded Footer with Clear Logo + Subtle Watermark */}
      <footer className="border-t hairline py-10 px-4 text-center text-xs text-dim space-y-3 relative overflow-hidden">
        <img
          src="/logo-hd.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none mx-auto mb-1 w-14 h-14 object-contain opacity-85"
        />
        <div className="flex items-center justify-center gap-2">
          <span className="font-display font-black text-sm text-main">Dollarino V11.9 · Trust Parity &amp; Supercharts</span>
        </div>
        <p className="opacity-85">
          {isFa
            ? `۵ موتور پیش‌فرض خاموش + سوپرچارت Pine v6 + کیف‌پول Trust Wallet + استعلام ۳۰ روزه دیجیتال${publicBotInfo.botUsername ? ` · ربات تلگرام @${publicBotInfo.botUsername}` : ''}`
            : `5 Default-OFF Engines · Supercharts Pine v6 · Trust Wallet Parity · 30d Digital Audit${publicBotInfo.botUsername ? ` · @${publicBotInfo.botUsername}` : ''}`}
        </p>
        {(publicBotInfo.botUsername ||
          publicBotInfo.officialChannelInvite ||
          publicBotInfo.signalsChannelInvite ||
          publicBotInfo.resultsChannelInvite ||
          publicBotInfo.communityGroupInvite ||
          publicBotInfo.newsChannelInvite) && (
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto">
            {publicBotInfo.botUsername && (
              <a
                href={`https://t.me/${publicBotInfo.botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                🤖 {isFa ? 'ربات رسمی دلارینو' : 'Official Bot'} (@{publicBotInfo.botUsername})
              </a>
            )}
            {publicBotInfo.officialChannelInvite && (
              <a
                href={publicBotInfo.officialChannelInvite}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                🌟 {isFa ? 'چنل رسمی و اصلی' : 'Official Main'}
              </a>
            )}
            {publicBotInfo.signalsChannelInvite && (
              <a
                href={publicBotInfo.signalsChannelInvite}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                01. {isFa ? 'سیگنال دلارینو' : 'Signals'}
              </a>
            )}
            {publicBotInfo.resultsChannelInvite && (
              <a
                href={publicBotInfo.resultsChannelInvite}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                02. {isFa ? 'نتایج سیگنال' : 'Results'}
              </a>
            )}
            {publicBotInfo.communityGroupInvite && (
              <a
                href={publicBotInfo.communityGroupInvite}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                03. {isFa ? 'گروه کاربران' : 'Community'}
              </a>
            )}
            {publicBotInfo.newsChannelInvite && (
              <a
                href={publicBotInfo.newsChannelInvite}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl surface-soft border hairline text-[11px] font-bold text-main hover:border-[var(--gold)]"
              >
                07. {isFa ? 'اخبار دلارینو' : 'News'}
              </a>
            )}
          </div>
        )}
        <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-2xl surface-soft border hairline text-[11px]">
          <span className="font-black text-main">
            {isFa
              ? `طراحی و توسعه ۰ تا ۱۰۰: ${founder?.fullNameFa || 'آوید کیا'} (${founder?.fullNameEn || 'Avid Kiya'})`
              : `Created & Engineered 0-to-100 by ${founder?.fullNameEn || 'Avid Kiya'}`}
          </span>
          {(founder?.telegramUrl || founder?.instagramUrl || founder?.twitterUrl) && <span className="opacity-40">|</span>}
          {founder?.telegramUrl && (
            <a href={founder.telegramUrl} target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-[var(--gold)] hover:underline">
              Telegram: {founder.telegram || founder.telegramUrl}
            </a>
          )}
          {founder?.instagramUrl && (
            <a href={founder.instagramUrl} target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-jade hover:underline">
              Instagram: {founder.instagram || founder.instagramUrl}
            </a>
          )}
          {founder?.twitterUrl && (
            <a href={founder.twitterUrl} target="_blank" rel="noreferrer" dir="ltr" className="font-bold text-brand hover:underline">
              X (Twitter): {founder.twitter || founder.twitterUrl}
            </a>
          )}
        </div>
      </footer>

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
