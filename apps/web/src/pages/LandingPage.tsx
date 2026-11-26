import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
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
  Radar,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  UserCheck,
  Users,
  Vault,
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
  const [activePillar, setActivePillar] = useState<'simple' | 'myai' | 'copy' | 'ide'>('simple');
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
      badge: '۰۱ · DOLLARINO AI',
      title: isFa ? 'هوش مصنوعی دلارینو: ترید هوشمند اتومات با اجماع چندمدله' : 'Dollarino AI: 100% Automated Multi-LLM Trading',
      shortTitle: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI',
      icon: Bot,
      color: '#10b981',
      desc: isFa
        ? 'مناسب همه افراد حتی بدون دانش فنی! فقط میزان سرمایه و ریسک‌پذیری (کم‌ریسک، متعادل یا پرقدرت) را انتخاب کنید تا هوش مصنوعی دلارینو ۲۴ ساعته بهترین فرصت‌ها را پیدا کند، معامله باز کند و با ۳ تارگت + استاپ‌لاس خودکار مدیریت کند.'
        : 'Designed for everyone. Choose your comfort level and Dollarino AI scans markets 24/7, enters trades, and manages 3 take-profits + stop-loss automatically.',
      bullets: isFa
        ? ['فقط با یک لمس روشن و خاموش می‌شود', 'بدون نیاز به دانش کدنویسی یا تحلیل پیچیده', 'مدیریت خودکار ریسک‌فری و حد ضرر هوشمند']
        : ['1-tap start & stop', 'Zero technical setup required', 'Automatic 3-TP & Risk-Free management'],
    },
    {
      id: 'myai' as const,
      badge: '۰۲ · RAW PERSONAL AI',
      title: isFa ? 'هوش مصنوعی خام (شخصی): هوش مصنوعی خودت را آموزش بده' : 'Raw Personal AI: Train Your Own AI Trader',
      shortTitle: isFa ? 'هوش مصنوعی خام (شخصی)' : 'Raw Personal AI',
      icon: Brain,
      color: '#1652f0',
      desc: isFa
        ? 'یک هوش مصنوعی کاملاً خام که استراتژی شما را با چت فارسی یاد می‌گیرد! به او بگویید چه تایم‌فریمی، چه اندیکاتورهایی (مثلاً RSI، EMA، MACD یا سوپرترند)، چه حد ضرر و سودی و کدام ارزها را دوست دارید — روی بازار تست بگیرید و فعال کنید تا دقیقاً مثل خودتان ترید کند.'
        : 'Starts as a blank AI. Chat in plain language to teach your exact rules, indicators, coins, SL & TP — test on live candles and activate 24/7 execution.',
      bullets: isFa
        ? ['یادگیری سریع از طریق گفتگو به زبان ساده', 'استخراج خودکار قوانین و بک‌تست روی بازار زنده', 'امکان ریست و آموزش استراتژی جدید در هر لحظه']
        : ['Teaches easily through natural chat', 'Extracts structured rules & runs instant backtests', 'Reset and retrain anytime'],
    },
    {
      id: 'copy' as const,
      badge: '۰۳ · VERIFIED & SMART WALLET COPY V2',
      title: isFa ? 'کپی‌ترید دوگانه: تریدرهای تاییدشده + شکار ولت نهنگ‌ها (V2)' : 'Dual Copy Trade: Verified VIPs + Smart-Money Wallets (V2)',
      shortTitle: isFa ? 'کپی‌ترید ولت و VIP' : 'Copy Trade V2',
      icon: Trophy,
      color: '#f59e0b',
      desc: isFa
        ? 'هم معاملات تریدرهای تاییدشده سایت را روی Trust Wallet و شبیه‌ساز قابل تنظیم (\u2066$50–$10M\u2069) کپی کنید و هم ۱۰ ولت برتر هوشمند یا هر ولت دلخواه در Solana، Base، ETH، BSC، TON و TRON را با باکس مارجین جداگانه، بک‌تست ۷ روزه، سپر ضدراگ، ۳ تارگت + Moonbag و خزانه ۲۴/۷ دنبال کنید.'
        : 'Mirror verified site traders on Trust Wallet & Custom Demo ($50–$10M) AND track Top-10 Smart-Money or custom wallets across Solana, Base, ETH, BSC, TON & TRON with isolated margin boxes, 7-day backtest, Anti-Rug shield, 3-TP + Moonbag, and 24/7 Copy-Vault.',
      bullets: isFa
        ? [
            'کپی فقط معاملات جدید از لحظه فالو + باکس مارجین ایزوله برای هر تریدر',
            'سپر ضدراگ واقعی (GoPlus + Honeypot.is + RugCheck) و خروج خودکار Dev-Sell',
            'حالت اجرای تک‌کلیک Trust Wallet یا خزانه تمام‌اتومات ۲۴/۷ با بک‌آپ کلید',
          ]
        : [
            'Follows only fresh trades from follow-time forward + isolated margin box per trader',
            'Real-time Anti-Rug (GoPlus + Honeypot.is + RugCheck) & Dev-Sell auto exit',
            'Trust Wallet 1-Click DApp or 24/7 Auto Copy-Vault with encrypted key backup',
          ],
    },
    {
      id: 'ide' as const,
      badge: '۰۴ · HUNTING STRATEGY (2 MODES)',
      title: isFa ? 'استراتژی شکار: استراتژی‌های آماده ما + استراتژی شخصی شما' : 'Hunting Strategy: Our Presets + Your Custom Code',
      shortTitle: isFa ? 'استراتژی شکار' : 'Hunting Strategy',
      icon: Code2,
      color: '#8b5cf6',
      desc: isFa
        ? 'دو راه در یک موتور: می‌توانید از استراتژی‌های آماده و تست‌شده دلارینو (دُرنا V1، KBOS و شکار نقدینگی SP2L) استفاده کنید، یا استراتژی Pine Script / Python شخصی خودتان را در آزمایشگاه بسازید و با بک‌تست ۹۰۰ کندلی ۲۴/۷ اجرا کنید.'
        : 'Two modes in one engine: trade Dollarino preset hunters (Dorna V1, KBOS, SP2L) OR write/paste your own Pine Script or Python strategy.',
      bullets: isFa
        ? ['بخش ۱: استراتژی‌های آماده و غیرریپینت دُرنا V1، KBOS و SP2L', 'بخش ۲: ورود Pine Script v5 (با گرافیک کامل روی چارت)، Python و TP/SL درصدی/قیمتی', 'بک‌تست زنده ۹۰۰ کندلی و اجرای همزمان با بقیه موتورها روی Trust Wallet و شبیه‌ساز دمو']
        : ['Mode 1: Preset Dorna V1, KBOS & SP2L hunters', 'Mode 2: Full Pine Script v5 chart plots + Python & %/$ TP/SL', '24/7 concurrent multi-engine Trust Wallet & Simulator execution'],
    },
  ];

  const selectedPillar = pillars.find((p) => p.id === activePillar) ?? pillars[0]!;

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell relative overflow-x-clip">
      {/* Clean Subtle Dot Pattern (no color halos on mobile) */}
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

      {/* Sticky Floating Pill Navbar (Clean mobile layout without overlap) */}
      <header className="sticky top-0 z-40 px-2.5 sm:px-6 pt-2.5 sm:pt-3">
        <div
          className="mx-auto max-w-6xl panel rounded-full px-3 sm:px-5 py-2 flex items-center gap-2 shadow-xl lg:backdrop-blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel) 92%, transparent)' }}
        >
          <button type="button" onClick={() => scrollTo('top')} className="flex items-center gap-2 shrink-0 min-w-0">
            <DollarinoBrandMark size={34} glow />
            <span className="leading-none text-start">
              <span dir="ltr" className="block font-display font-bold text-sm sm:text-base text-main">
                Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
              </span>
              <span className="hidden sm:block text-[9px] font-black tracking-[0.18em] text-dim">V11.7.2 · AI &amp; DAPP</span>
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-0.5 mx-auto text-[11px] font-bold text-dim">
            {[
              ['whats-new', isFa ? 'جدید V11.7.2' : 'New in V11.7.2'],
              ['live-markets', isFa ? 'بازار زنده' : 'Live Markets'],
              ['pillars', isFa ? '۴ روش' : '4 Ways'],
              ['smart-v2', isFa ? 'کپی ولت V2' : 'Smart Copy'],
              ['pricing', isFa ? 'کارمزد ۳٪' : '3% Fee'],
              ['trust-founder', isFa ? 'سازنده و اصالت' : 'Founder & Trust'],
              ['faq', isFa ? 'سوالات' : 'FAQ'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id!)}
                className="px-2.5 py-2 rounded-full hover:text-main hover:bg-[var(--soft)] transition whitespace-nowrap"
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1.5 shrink-0">
            {onOpenSupport && (
              <button
                type="button"
                onClick={onOpenSupport}
                className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full btn-ghost text-xs font-bold"
              >
                <Headphones className="w-3.5 h-3.5 text-jade" />
                <span>{isFa ? 'پشتیبانی آنلاین' : 'Support'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-2 rounded-full btn-ghost"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{isFa ? 'EN' : 'فارسی'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleDaylight}
              title={isFa ? 'تغییر حالت روز و شب' : 'Day / Night'}
              className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-auto sm:px-3 gap-1.5 rounded-full btn-ghost text-xs font-bold"
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
              onClick={() => onGoAuth('register')}
              className="btn-gold inline-flex items-center gap-1 text-[11px] font-black px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full shrink-0"
            >
              <span className="sm:hidden">{isFa ? 'ورود / پنل' : 'Enter'}</span>
              <span className="hidden sm:inline">{isFa ? 'ورود به میز کار' : 'Enter Workspace'}</span>
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
              ['whats-new', isFa ? 'جدیدترین امکانات نسخه V11.7.2 (پنل کروم، کارت ۱۶:۹/۹:۱۶، اسنایپر)' : "What's New in V11.7.2"],
              ['live-markets', isFa ? 'نبض زنده بازار و قیمت ارزهای برتر' : 'Live Top Markets'],
              ['pillars', isFa ? '۴ روش معامله (ساده تا حرفه‌ای)' : '4 Ways to Trade'],
              ['smart-v2', isFa ? 'کپی‌ترید ولت نهنگ‌ها و سپر ضدراگ (V2)' : 'Smart Wallet Copy & Anti-Rug V2'],
              ['copy-leaders', isFa ? 'تریدرهای تاییدشده کپی‌ترید' : 'Verified Copy Traders'],
              ['pricing', isFa ? '۳ معامله رایگان + ۳٪ از سود' : '3 Free · 3% Profit Fee'],
              ['trust-founder', isFa ? 'معرفی سازنده و شفافیت ضدپانزی' : 'Founder Verification & Anti-Ponzi'],
              ['faq', isFa ? 'راهنما و سوالات پرتکرار' : 'FAQ'],
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
            {onOpenSupport && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  onOpenSupport();
                }}
                className="btn-emerald w-full py-2.5 rounded-2xl font-black text-xs inline-flex items-center justify-center gap-1.5"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{isFa ? 'پشتیبانی آنلاین و تلگرام' : 'Online Support'}</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Seamless Infinite Live Market Ticker (Click any coin -> Live Markets Spotlight) */}
      <LiveTickerBar
        items={liveCoins}
        selectedSymbol={heroCoin}
        onSelectCoin={handleSelectTickerCoin}
        className="relative z-10 mt-3 border-y hairline bg-[color:color-mix(in_srgb,var(--panel)_75%,transparent)] backdrop-blur-md"
      />

      {/* Main Content */}
      <main id="top" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 space-y-16 sm:space-y-20 py-10 sm:py-14">
        {/* 1. Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.06fr_0.94fr] gap-8 xl:gap-12 items-center">
          <div className="text-center lg:text-start reveal-up space-y-5">
            <div className="flex flex-wrap justify-center lg:justify-start gap-2">
              {[
                { icon: Bot, text: isFa ? '۵ موتور ترید همزمان' : '5 Concurrent Engines', color: 'var(--jade)' },
                { icon: PanelRight, text: isFa ? 'اکستنشن پنل کناری کروم (ساده)' : 'Chrome Side Panel (Simple)', color: 'var(--gold)' },
                { icon: Trophy, text: isFa ? 'شروع مستقیم DApp تراست‌ولت + ضدراگ V2' : 'Trust DApp Signup + Anti-Rug V2', color: '#f59e0b' },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <span key={b.text} className="inline-flex items-center gap-1.5 panel rounded-full px-3.5 py-1.5 text-[11px] font-black text-main">
                    <Icon className="h-3.5 w-3.5" style={{ color: b.color }} />
                    <span>{b.text}</span>
                  </span>
                );
              })}
            </div>

            <h1 className="font-display font-bold tracking-tight leading-[1.42] text-[clamp(30px,6.4vw,56px)] text-main">
              {isFa ? (
                <>
                  پلتفرم جامع ترید هوشمند <span className="text-[0.55em] align-middle px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-black">V11.7.2</span>
                  <br />
                  <span style={{ color: 'var(--gold)' }}>ساده برای همه، </span>
                  <span className="mark-lime">حرفه‌ای</span>
                  <br />
                  برای معامله‌گران.
                </>
              ) : (
                <>
                  One Smart Trading Platform <span className="text-[0.55em] align-middle px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-black">V11.7.2</span>
                  <br />
                  <span style={{ color: 'var(--gold)' }}>Effortless </span>
                  <span className="mark-lime">AI Trading</span>
                  <br />
                  for Every Skill Level.
                </>
              )}
            </h1>

            <p className="text-sm sm:text-[15px] leading-[1.9] text-dim max-w-xl mx-auto lg:mx-0">
              {isFa ? (
                <>
                  با دلارینو V11.7.2 همزمان با ۵ موتور هوشمند (هوش مصنوعی مرکزی، هوش مصنوعی شخصی، استراتژی دُرنا/Pine v5 گرافیکی، کپی‌ترید V2 و اسنایپر ۵ دقیقه‌ای با فیلتر پرو) ترید کنید — متصل به کیف‌پول غیرامانی چندزنجیره‌ای Trust Wallet (تایید دستی یا تمام‌اتوترید ۲۴/۷ و شارژ سریع خزانه سولانا)، اکستنشن پنل کناری کروم، استودیو کارت سود ۱۶:۹ و ۹:۱۶، TP/SL درصدی (%) و شبیه‌ساز رایگان (<span dir="ltr" className="inline-block font-bold" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>)
                  {publicBotInfo.botUsername ? (
                    <>
                      {' '}همراه ربات تلگرام{' '}
                      <span dir="ltr" className="inline-block font-bold text-main">
                        @{publicBotInfo.botUsername}
                      </span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                `Trade with Dollarino V11.7.2 across 5 simultaneous engines (Central AI, Personal AI, Pine v5 Chart Strategy, Copy Trade V2 & 5m Pro Sniper) — powered by multi-chain Trust Wallet DApp (with Solana SOL/USDC Vault funding), Chrome Side Panel Extension, 16:9 & 9:16 Profit Card Studio, %/$ TP/SL, and Free Demo ($50–$10M)${publicBotInfo.botUsername ? ` with Telegram Bot @${publicBotInfo.botUsername}` : ''}.`
              )}
            </p>

            {/* Brand Ecosystem Strip (Trust Wallet, Perps & Blockchains) */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-1">
              {[
                { kind: 'w' as const, id: 'trustwallet', label: 'Trust Wallet' },
                { kind: 'ex' as const, id: 'paper', label: 'Custom Demo ($50–$10M)' },
                { kind: 'c' as const, id: 'arbitrum', label: 'Hyperliquid 24/7' },
                { kind: 'w' as const, id: 'tonkeeper', label: 'TON' },
                { kind: 'c' as const, id: 'solana', label: 'Solana · Jupiter' },
                { kind: 'c' as const, id: 'bsc', label: 'BSC' },
                { kind: 'c' as const, id: 'ethereum', label: 'Ethereum' },
                { kind: 'c' as const, id: 'base', label: 'Base' },
              ].map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full surface-soft border hairline text-[11px] font-bold text-main"
                >
                  {item.kind === 'ex' ? (
                    <ExchangeLogo provider={item.id} size={16} />
                  ) : item.kind === 'w' ? (
                    <WalletLogo wallet={item.id === 'tonkeeper' ? 'ton' : 'trustwallet'} size={16} />
                  ) : (
                    <ChainLogo chain={item.id} size={16} />
                  )}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-3 pt-1">
              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="btn-lime inline-flex items-center gap-2 font-black px-7 py-4 rounded-2xl text-sm"
              >
                <Zap className="h-[18px] w-[18px]" />
                <span>{isFa ? 'ثبت‌نام سریع (تراست‌ولت / گوگل / تلگرام)' : 'Quick Sign Up (Trust Wallet / Google / TG)'}</span>
              </button>
              <button
                type="button"
                onClick={() => onGoAuth('login')}
                className="btn-gold inline-flex items-center gap-2 font-black px-6 py-4 rounded-2xl text-sm"
              >
                <span>{isFa ? 'ورود به میز کار' : 'Sign In to Workspace'}</span>
                <ArrowLeft className={`h-4 w-4 ${isFa ? '' : 'rotate-180'}`} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo('whats-new')}
                className="btn-ghost inline-flex items-center gap-2 font-bold px-5 py-4 rounded-2xl text-sm"
              >
                <Play className="h-4 w-4" />
                <span>{isFa ? 'جدید در V11.7.2' : 'What’s New V11.7.2'}</span>
              </button>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2 text-xs font-bold text-dim pt-1">
              {[
                isFa ? 'ثبت‌نام مستقیم DApps تراست‌ولت + گوگل + تلگرام + کد معرف خودکار' : 'Direct Trust Wallet DApp, Google & Telegram Signup',
                isFa ? 'اکستنشن پنل کناری کروم (ساده) + کارت سود ۱۶:۹ و ۹:۱۶' : 'Chrome Side Panel Extension + 16:9 & 9:16 Profit Cards',
                isFa ? '۰٪ اشتراک برای همیشه · ۳ معامله اول ۰٪ · ۳٪ فقط از سود خالص' : '0% Subscription · 3 Free Live Wins · Keep 97% Profit',
              ].map((x) => (
                <span key={x} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-jade" />
                  <span>{x}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Right Live Market & 4-Mode Interactive Card */}
          <div className="panel glow-card-anim rounded-[30px] p-5 sm:p-6 space-y-4">
            <div className="relative rounded-2xl overflow-hidden border hairline h-36 sm:h-40">
              <img
                src="/images/hero-quant-desk.webp"
                alt="Dollarino AI Quantitative Desk"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#081022]/90 via-[#081022]/30 to-transparent flex items-end p-3.5">
                <div className="flex items-center justify-between gap-2 w-full">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--gold)' }}>
                      DOLLARINO QUANT DESK
                    </p>
                    <p className="text-xs font-bold text-white">
                      {isFa ? 'ترید هوشمند، کپی‌ترید، و Trust Wallet DApp' : 'AI Trading, Copy-Trade & Trust Wallet DApp'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black shrink-0">
                    {isFa ? 'آنلاین ۲۴/۷' : '24/7 LIVE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--gold)' }}>
                  LIVE MARKET TELEMETRY
                </p>
                <h3 className="font-display font-bold text-lg text-main">
                  {isFa ? 'نبض زنده بازار و ۵ موتور همزمان' : 'Live Market & 5-Engine Feed'}
                </h3>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT'] as const).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setHeroCoin(sym)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition ${
                      heroCoin === sym ? 'btn-gold' : 'btn-ghost text-dim'
                    }`}
                  >
                    {sym.replace('USDT', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="ios-wallet-card rounded-[24px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CoinIcon symbol={activeCoin.symbol} size={34} />
                  <div>
                    <p dir="ltr" className="font-display font-bold text-base">{activeCoin.symbol}</p>
                    <p className="text-[11px] text-white/75">
                      {coinDisplayName(activeCoin.base || activeCoin.symbol.replace(/USDT$/, ''), isFa)} · Perp
                    </p>
                  </div>
                </div>
                <div className="text-end" dir="ltr">
                  <p className="font-num font-black text-2xl">{fmtUsdPrice(activeCoin.price)}</p>
                  <p className={`text-xs font-black ${activeCoin.changePct24h >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {activeCoin.changePct24h >= 0 ? '+' : ''}{activeCoin.changePct24h.toFixed(2)}% (24h)
                  </p>
                </div>
              </div>
              {liveCandles.length > 4 && (
                <div className="h-24 pt-2">
                  <Sparkline
                    values={liveCandles}
                    color={activeCoin.changePct24h >= 0 ? '#10d9a3' : '#f43f5e'}
                    height={82}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {pillars.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActivePillar(p.id);
                      scrollTo('pillars');
                    }}
                    className="surface-soft hover:border-[var(--gold)] border border-transparent rounded-2xl p-3 text-start transition space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-black text-main">
                      <Icon className="w-4 h-4 shrink-0" style={{ color: p.color }} />
                      <span className="truncate">{p.shortTitle}</span>
                    </div>
                    <p className="text-[10px] text-dim">{p.badge}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Market Explorer (Triggered by clicking ANY coin in the Top Infinite Ticker Bar) */}
        <section id="live-markets" className="space-y-4">
          <div className="panel rounded-[28px] p-5 sm:p-6 border hairline space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
                  LIVE TOP MARKETS · CLICK ANY TICKER COIN
                </p>
                <h2 className="font-display font-bold text-2xl text-main mt-0.5">
                  {isFa ? 'نبض زنده بازار ارزهای برتر (با کلیک از نوار بالا)' : 'Live Top Crypto Markets Explorer'}
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
                  {isFa ? 'ورود به بازار کامل' : 'Open Full Markets'}
                </button>
              </div>
            </div>

            {/* Active Spotlight Card for Clicked Ticker Coin */}
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
                  <span>{isFa ? `شروع ترید ${activeCoin.base || activeCoin.symbol.replace(/USDT$/, '')}` : `Trade ${activeCoin.base || activeCoin.symbol}`}</span>
                </button>
              </div>
            </div>

            {/* Top Markets Quick Grid */}
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

        {/* What's New in V11.7.2 Feature Showcase */}
        <section id="whats-new" className="space-y-6">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
              <Sparkles className="w-3.5 h-3.5 text-jade" />
              <span>DOLLARINO V11.5 – V11.7.2 RELEASE HIGHLIGHTS</span>
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? 'جدیدترین امکانات و آپدیت‌های دلارینو (نسخه V11.7.2)' : 'Everything New in Dollarino V11.7.2'}
            </h2>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'تمامی قابلیت‌های جدید از اکستنشن پنل کناری کروم، ثبت‌نام مستقیم در DApps تراست‌ولت، اسنایپر ۵ دقیقه‌ای و شارژ خزانه سولانا تا استودیو کارت سود ۱۶:۹ و ۹:۱۶ آماده استفاده هستند.'
                : 'Explore Chrome Side Panel Simple Mode, direct Trust Wallet DApp signup, 5-minute Pro Sniper with Solana Vault funding, Pine v5 chart graphics, %/$ TP/SL, and 16:9 / 9:16 Profit Cards.'}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              {
                icon: PanelRight,
                badge: 'V11.7.2 · CHROME EXTENSION',
                color: '#1652f0',
                title: isFa ? 'اکستنشن پنل کناری کروم (حالت ساده)' : 'Chrome Side Panel Extension (Simple-Only)',
                desc: isFa
                  ? 'با یک کلیک روی آیکون افزونه، دلارینو مثل Trust Wallet به کنار مرورگر Chrome سنجاق می‌شود و بدون شلوغی، فقط حالت ساده را کنار صرافی‌ها و نمودارهای شما نگه می‌دارد.'
                  : 'Docks permanently inside Chrome’s native Side Panel just like Trust Wallet, locked to clean Simple Mode alongside your tabs.',
              },
              {
                icon: KeyRound,
                badge: 'V11.7.2 · INSTANT ONBOARDING',
                color: '#10b981',
                title: isFa ? 'ثبت‌نام مستقیم DApp تراست‌ولت + گوگل + تلگرام' : 'Direct Trust DApp, Google & Telegram Signup',
                desc: isFa
                  ? 'دکمه ثبت‌نام کیف‌پول سایت را مستقیماً داخل مرورگر DApps تراست‌ولت باز می‌کند؛ همچنین ورود با گوگل و تلگرام فرم یکپارچه شماره تماس، اسم مستعار، نام کاربری و رمز + کد معرف خودکار دارند.'
                  : 'Opens straight inside Trust Wallet DApp browser, plus Google & Telegram onboarding with unified phone, nickname, username & password completion and automatic admin referral.',
              },
              {
                icon: Flame,
                badge: 'V11.7.1 · SNIPER & SOLANA VAULT',
                color: '#f59e0b',
                title: isFa ? 'ذخیره چندموتوره + اسنایپر ۵ دقیقه + شارژ سولانا' : 'Multi-Engine Persist, 5m Sniper & Solana Fund',
                desc: isFa
                  ? 'موتورهای انتخابی شما با استارت ربات خودکار ذخیره می‌شوند؛ اسنایپر ۵ دقیقه‌ای پرو توکن‌های جدید و میم‌کوین‌ها را فیلتر می‌کند و شارژ خزانه SOL / USDC مستقیماً از تراست‌ولت انجام می‌شود.'
                  : 'Auto-saves active engines on bot start, filters fresh pools with 5m Pro Sniper guards, and funds your Solana Jupiter vault directly from Trust Wallet.',
              },
              {
                icon: Percent,
                badge: 'V11.7.1 · PINE V5 + %/$ TP/SL',
                color: '#8b5cf6',
                title: isFa ? 'گرافیک کامل Pine v5 + حد سود و ضرر درصدی (%)' : 'Pine v5 Chart Plots + % / $ TP & SL Modes',
                desc: isFa
                  ? 'نمایش کامل اندیکاتورها، خطوط و HUD در استراتژی‌های Pine Script v5 روی چارت و انتخاب آسان حد سود و ضرر به صورت درصدی (%) یا قیمتی ($) در ترمینال و Perp DEX.'
                  : 'Full chart lines & HUD rendering for Pine v5 scripts plus 1-tap switching between Percentage (%) and Price ($) TP/SL in Terminal and Perp DEX.',
              },
              {
                icon: Image,
                badge: 'V11.7 · 16:9 & 9:16 CARDS',
                color: '#0ea5e9',
                title: isFa ? 'استودیو کارت سود ۱۶:۹ افقی و ۹:۱۶ استوری' : 'Verified 16:9 & 9:16 Profit Card Studio',
                desc: isFa
                  ? 'صدور کارت گرافیکی PNG تاییدشده از معاملات Perp DEX، DEX Swap، کپی‌ترید و ربات در ۸ بازه زمانی (تک‌معامله تا سالانه) با QR کد پیگیری اصالت آنلاین.'
                  : 'Render Verified PNG PnL Cards in 16:9 Landscape & 9:16 Mobile Story across Perp, DEX, Copy Trade & Bot with public QR verification.',
              },
              {
                icon: Layers,
                badge: 'V11.7.2 · ZERO SUB · SAFE RESET',
                color: '#059669',
                title: isFa ? '۰٪ اشتراک، ۳٪ فقط از سود + صفرسازی امن مدیریت' : '0% Subscription, 3% Net Fee & Safe Admin Reset',
                desc: isFa
                  ? 'اشتراک پولی برای همیشه حذف شده؛ ۳ معامله اول رایگان و پس از آن ۹۷٪ سود برای شماست. حساب‌های مدیر نیز از کارمزد/محدودیت معاف هستند و قابلیت صفرسازی ایمن به ۰ بدون حذف اکانت دارند.'
                  : 'Zero monthly subscriptions, 3 free live wins, then keep 97% of real profit — plus full Admin exemption and reset-to-zero without losing account access.',
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
                    <span className="text-[9px] font-black tracking-wider text-dim uppercase">{item.badge}</span>
                  </div>
                  <h3 className="font-display font-bold text-base text-main leading-snug">{item.title}</h3>
                  <p className="text-dim leading-relaxed text-[11.5px]">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Animated Auto-Rotating Promo Banners Carousel */}
        <section className="reveal-up">
          <PromoBannerCarousel lang={lang} placement="LANDING" onGuestAction={() => onGoAuth('register')} />
        </section>

        {/* 2. Interactive 4 Pillars Clear Walkthrough */}
        <section id="pillars" className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--gold)' }}>
              HOW DOLLARINO WORKS · SUPER EASY FOR EVERYONE
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa ? '۴ روش ساده و قدرتمند برای کسب سود در دلارینو' : '4 Simple & Powerful Ways to Trade'}
            </h2>
            <p className="text-xs sm:text-sm text-dim">
              {isFa
                ? 'هر سطحی که دارید — از کسی که فقط یک دکمه می‌خواهد تا تریدر حرفه‌ای — بخش مناسب خودتان آماده است.'
                : 'Whether you want 1-tap automated AI or full Pine Script control, pick your lane cleanly.'}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {pillars.map((p) => {
              const Icon = p.icon;
              const active = activePillar === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePillar(p.id)}
                  className={`rounded-2xl p-3.5 text-start transition flex items-center gap-2.5 border ${
                    active ? 'btn-gold border-transparent shadow-lg' : 'panel border-transparent hover:border-[var(--line-strong)] text-main'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ color: active ? '#fff' : p.color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">{p.shortTitle}</p>
                    <p className={`text-[10px] truncate ${active ? 'text-white/80' : 'text-dim'}`}>{p.badge}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="panel glow-card-anim rounded-[30px] p-6 sm:p-8 grid md:grid-cols-[1.15fr_0.85fr] gap-6 items-center">
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
                  {isFa ? 'شروع با همین روش' : 'Get Started Now'}
                </button>
                {publicBotInfo.botUsername && (
                  <a
                    href={`https://t.me/${publicBotInfo.botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-5 py-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-brand" />
                    <span>{isFa ? 'اجرا در ربات تلگرام' : 'Open Telegram Bot'}</span>
                  </a>
                )}
              </div>
            </div>

            <div className="surface-soft rounded-[26px] p-5 space-y-3 border hairline">
              <p className="text-[11px] font-black text-dim uppercase">
                {isFa ? 'چطور در ۳ قدم شروع کنم؟' : '3 Simple Steps to Start'}
              </p>
              {[
                {
                  n: '۱',
                  t: publicBotInfo.botUsername
                    ? isFa
                      ? `ثبت‌نام یا ورود با ربات @${publicBotInfo.botUsername}`
                      : `Sign In via @${publicBotInfo.botUsername} or Web`
                    : isFa
                      ? 'ورود به حساب یا روش فعال‌شده مدیریت'
                      : 'Sign In via Enabled Method',
                  d: isFa
                    ? 'با نام کاربری و رمز عبور یا هر روش احراز هویتی که مدیر سایت فعال کرده وارد شوید.'
                    : 'Sign in with credentials or any authentication provider enabled by the site admin.',
                },
                {
                  n: '۲',
                  t: isFa ? 'اتصال Trust Wallet (یا شبیه‌ساز رایگان قابل تنظیم)' : 'Connect Trust Wallet (or Free Custom Demo)',
                  d: isFa ? 'با حداقل ۱۰ دلار واقعی شروع کنید یا رایگان با شبیه‌ساز قابل تنظیم (\u2066$50–$10M\u2069) تمرین کنید.' : 'Trade real with $10+ in Trust Wallet or practice free with Custom Demo ($50–$10M).',
                },
                {
                  n: '۳',
                  t: isFa ? 'روشن کردن ربات یا آموزش هوش مصنوعی من' : 'Launch Auto AI, My AI, or Copy Trade',
                  d: isFa ? 'به سادگی در سایت یا ربات تلگرام دکمه شروع را بزنید.' : 'Start automated trades on Web or Telegram.',
                },
              ].map((step) => (
                <div key={step.n} className="panel rounded-2xl p-3.5 flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl btn-gold grid place-items-center text-xs font-black shrink-0">{step.n}</span>
                  <div>
                    <p className="text-xs font-black text-main">{step.t}</p>
                    <p className="text-[11px] text-dim mt-0.5">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2.5 Smart Copy-Trading V2 & Anti-Rug Multi-DApp Showcase */}
        <section id="smart-v2" className="space-y-6">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3.5 py-1 rounded-full text-[11px] font-black">
              <Radar className="w-3.5 h-3.5 text-jade" />
              <span>SMART COPY-TRADING V2 · MULTI-CHAIN ANTI-RUG & TRUST DAPP</span>
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
              {isFa
                ? 'شکار نهنگ‌ها، سپر ضدراگ واقعی و سوآپ Multi-DApp در یک پلتفرم'
                : 'Whale Wallet Copy-Trading, Real Anti-Rug & Trust Multi-DApp'}
            </h2>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'بهترین ولت‌های اسمارت‌مانی را در کل شبکه‌ها پیدا کنید، قبل از اتصال ۷ روز بک‌تست واقعی بگیرید، برای هر تریدر باکس مارجین اختصاصی بسازید و بدون نیاز به ترس از اسکم، معاملات جدیدشان را ۲۴/۷ یا با یک کلیک در Trust Wallet کپی کنید.'
                : 'Discover Top-10 smart-money wallets or add any custom wallet, run a 7-day backtest, isolate per-trader margin boxes, and copy live trades safely with GoPlus/Honeypot/RugCheck protection.'}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Banner Card 1: Smart Wallet Copy + Isolated Boxes + 24/7 Copy-Vault */}
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
                      ? 'برترین ولت‌های Solana، Base، Ethereum، BSC، Arbitrum، TON و TRON را رصد کنید یا آدرس هر ولت شخصی را ثبت کنید. سیستم به‌صورت خودکار فقط تراکنش‌هایی را که از لحظه فالو باز می‌شوند رصد و کپی می‌کند.'
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
                        desc: isFa ? 'TP1/2/3، Moonbag، Trailing، Break-Even و تایم‌لیمیت.' : 'TP1/2/3, Moonbag, Trailing SL, Break-Even & Reverse Copy.',
                      },
                      {
                        icon: KeyRound,
                        title: isFa ? 'خزانه ۲۴/۷ + دریافت کلید خصوصی' : '24/7 Copy-Vault + Key Backup',
                        desc: isFa ? 'اجرای خودکار روی Jupiter سولانا و خروجی کلید AES-256.' : 'Automated Solana Jupiter swaps & encrypted key export.',
                      },
                      {
                        icon: Trophy,
                        title: isFa ? 'کنترل در تلگرام + کارت سود' : 'Telegram Bot + Verified Card',
                        desc: publicBotInfo.botUsername
                          ? isFa
                            ? `مدیریت پوزیشن‌ها در @${publicBotInfo.botUsername} و کارت سود PNG.`
                            : `Manage V2 trades in @${publicBotInfo.botUsername} & issue Verified PnL Cards.`
                          : isFa
                            ? 'مدیریت پوزیشن‌ها در ربات تلگرام متصل و کارت سود PNG.'
                            : 'Manage V2 trades in connected Telegram bot & issue Verified PnL Cards.',
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

            {/* Banner Card 2: Real Anti-Rug Shield + Trust Wallet Multi-DApp Router */}
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
                        {isFa ? 'GOPLUS · HONEYPOT.IS · RUGCHECK · TRUST DAPP' : 'GOPLUS · HONEYPOT.IS · RUGCHECK · TRUST DAPP'}
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
                      ? 'قبل از هر خرید غیرحضانتی، قرارداد توکن به‌صورت زنده از نظر Honeypot، مالیات خرید/فروش، مجوز Mint، قفل بودن نقدینگی و ریسک دولوپر بررسی می‌شود. سپس می‌توانید معامله را مستقیماً در برترین صرافی‌های همان شبکه باز کنید.'
                      : 'Before any non-custodial swap, every contract is scanned live for Honeypot traps, Buy/Sell tax, Mint authority, and LP locks — then routed straight into the top DApps inside Trust Wallet.'}
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
                        desc: isFa ? 'Jupiter, Raydium, PancakeSwap, Uniswap, 1inch, STON.fi, SunSwap, Cetus.' : 'Jupiter, Raydium, PancakeSwap, Uniswap, 1inch, STON.fi & Cetus.',
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

          {/* 4-Step Visual Walkthrough Strip */}
          <div className="panel rounded-[26px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <p className="text-[10px] font-black tracking-[0.18em] uppercase" style={{ color: 'var(--gold)' }}>
                  QUICK START TRAINING
                </p>
                <h3 className="font-display font-bold text-lg text-main">
                  {isFa ? 'آموزش ۴ مرحله‌ای شروع کپی‌ترید هوشمند ولت‌ها (از صفر تا اجرا)' : '4-Step Smart Copy-Trading Walkthrough'}
                </h3>
              </div>
              <span className="badge-signal px-3 py-1 rounded-full text-[11px] font-black">
                {isFa ? 'بدون نیاز به دانش برنامه‌نویسی' : 'Beginner Friendly'}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                {
                  n: '۱',
                  t: isFa ? 'انتخاب تریدر یا ولت دلخواه' : 'Pick Top-10 or Custom Wallet',
                  d: isFa ? 'از لیست ۱۰ تریدر برتر شبکه انتخاب کنید یا آدرس هر ولت دلخواه را بدهید (فقط تریدهای جدید کپی می‌شوند).' : 'Choose from Top-10 Smart Wallets or paste any custom address (only new trades copy).',
                },
                {
                  n: '۲',
                  t: isFa ? 'بک‌تست ۷ روزه + باکس مارجین' : '7-Day Backtest & Margin Box',
                  d: isFa ? 'باکس سرمایه جدا، سقف ضرر روزانه، TP1/2/3، Moonbag، SL و سپر ضدراگ را تنظیم و با بک‌تست بررسی کنید.' : 'Simulate 7 days with your isolated margin box, 3-step TP, Moonbag, SL & Anti-Rug filters.',
                },
                {
                  n: '۳',
                  t: isFa ? 'انتخاب روش اجرا (Trust یا خزانه)' : 'Trust 1-Click or 24/7 Vault',
                  d: isFa ? 'حالت تک‌کلیک Trust Wallet را انتخاب کنید یا خزانه اختصاصی ۲۴/۷ را شارژ و کلید پشتیبان آن را دریافت کنید.' : 'Choose Trust 1-Click confirmation or 24/7 Copy-Vault with instant AES-256 key backup.',
                },
                {
                  n: '۴',
                  t: isFa ? 'پایش لحظه‌ای + کارت سود' : 'Live Monitor + Profit Card',
                  d: isFa ? 'با هر خرید جدید ولت، سپر ضدراگ اجرا می‌شود، خروج خودکار در TP/SL/Dev-Sell انجام شده و کارت سود صادر می‌گردد.' : 'Live polling + instant Dev-Sell exit, Telegram alerts, and Verified PnL PNG Cards.',
                },
              ].map((step) => (
                <div key={step.n} className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                  <span className="w-7 h-7 rounded-xl btn-gold grid place-items-center text-xs font-black">{step.n}</span>
                  <p className="font-black text-main">{step.t}</p>
                  <p className="text-[11px] text-dim leading-relaxed">{step.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Verified Copy Traders Showcase */}
        <section id="copy-leaders" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--gold)' }}>
                VERIFIED COPY TRADE DESK
              </p>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
                {isFa ? 'معامله‌گران تاییدشده توسط مدیریت دلارینو' : 'Admin-Verified Copy Traders'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onGoAuth('register')}
              className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black"
            >
              {isFa ? 'مشاهده معاملات و کپی‌ترید' : 'View Trades & Copy'}
            </button>
          </div>

          {copyTraders.length === 0 ? (
            <div className="panel rounded-[26px] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border hairline">
              <div className="space-y-1.5">
                <p className="font-display font-bold text-base text-main">
                  {isFa ? 'کپی‌ترید دوگانه: لیست تریدرهای تاییدشده مدیریت + ۱۰ ولت هوشمند هر شبکه' : 'Dual Copy Trade: Verified VIPs + Top-10 Smart Wallets Per Chain'}
                </p>
                <p className="text-xs text-dim leading-relaxed max-w-2xl">
                  {isFa
                    ? 'پس از ورود می‌توانید هم معامله‌گران تاییدشده توسط مدیریت را دنبال کنید و هم به صورت ۲۴ ساعته معاملات ولت‌های برتر اسمارت‌مانی در Solana، Base، Ethereum، BSC، TON و TRON را با سپر ضدراگ و باکس مارجین اختصاصی کپی بگیرید.'
                    : 'Sign in to mirror admin-verified traders or track Top-10 Smart-Money wallets across Solana, Base, Ethereum, BSC, TON & TRON with Anti-Rug protection and isolated margin boxes.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onGoAuth('register')}
                className="btn-emerald px-5 py-3 rounded-2xl text-xs font-black shrink-0"
              >
                {isFa ? 'ورود به بخش کپی‌ترید V2' : 'Open Copy Trade V2'}
              </button>
            </div>
          ) : (
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

        {/* 4. Free Forever + 3 Free Wins + 3% Only On Real Profit Showcase */}
        <section id="pricing" className="space-y-6">
          <div className="panel rounded-[30px] p-6 sm:p-8 border hairline grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-center">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[11px] font-black">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isFa ? '۱۰۰٪ رایگان · اشتراک ماهانه برای همیشه حذف شد!' : 'ZERO SUBSCRIPTIONS · 100% FREE FOREVER'}</span>
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? '۳ معامله اول ۰٪ · سپس فقط ۳٪ کارمزد از سود واقعی (۹۷٪ سود برای شما!)' : 'First 3 Live Wins 0% · Then Only 3% Server Fee on Net Profits (Keep 97%!)'}
              </h2>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">
                {isFa
                  ? `تمام امکانات دلارینو رایگان است: کیف‌پول دمو قابل تنظیم رایگان (\u2066$50–$10M\u2069)، ۵ موتور همزمان + اسنایپر لیستینگ و میم‌کوین، ۲۵+ اندیکاتور رایگان و هوش مصنوعی چندمدلی. نرخ لحظه‌ای هر دلار تتر ایران: ${iranIrt.toLocaleString('en-US')} تومان.`
                  : 'All Dollarino modules are free: Customizable Paper Wallet ($50–$10M), 5 concurrent engines + Listing & Meme Sniper, 25+ Free Alerts, and Multi-AI. Live trading starts from $10+ USD in your own Trust Wallet.'}
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
                  {isFa ? 'تفاوت بزرگ دلارینو با پلتفرم‌های اشتراکی:' : 'Why Dollarino Fights Harder for Your Profit:'}
                </p>
                <p className="text-main">
                  {isFa
                    ? 'سایر ربات‌ها و سایت‌ها از همان ابتدا هزینه اشتراک را از شما می‌گیرند و سود یا ضرر شما در بازار برایشان فرقی ندارد؛ اما دلارینو اشتراک پولی ندارد و تمام تلاشش را می‌کند تا بیشترین سود را ببرید، چون درآمد ۳٪ سرور ما هم فقط زمانی بیشتر می‌شود که شما سود بیشتری بگیرید!'
                    : 'Competitors take upfront subscription fees and profit whether you win or lose. Dollarino charges $0 subscription and fights its hardest to maximize your net profit — because we only earn our 3% server share when YOU win more!'}
                </p>
              </div>
              <div className="pt-1 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onGoAuth('register')}
                  className="btn-emerald px-6 py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'شروع رایگان در ربات و وب' : 'Start Free Now'}
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3">
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

        {/* 4.5 Full Pre-Signup Founder Verification, Project Goals & Anti-Ponzi Transparency Showcase */}
        {(founder?.showPublic ?? true) && (
          <section id="trust-founder" className="space-y-6">
            <div className="text-center max-w-3xl mx-auto space-y-2.5">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[10px] font-black tracking-wide uppercase">
                <BadgeCheck className="w-3.5 h-3.5" />
                <span>{isFa ? 'شفافیت کامل بنیان‌گذار · ۱۰۰٪ مستقل · تضمین فنی ضدپانزی و ضدکلاهبرداری' : 'FULL FOUNDER TRANSPARENCY · 100% SOLO-BUILT · ZERO-PONZI PROOF'}</span>
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
                {isFa ? 'قبل از ثبت‌نام، سازنده و اصالت پروژه را کامل بشناسید' : 'Meet the Founder & Verify Dollarino Before Signing Up'}
              </h2>
              <p className="text-xs sm:text-sm text-dim leading-relaxed">
                {isFa
                  ? 'برخلاف پروژه‌های ناشناس و اسکم، تمام هویت سازنده، هدف پلتفرم، استقلال کامل بدون هیچ نهاد پشت‌پرده و ۶ دلیل فنی غیرپانزی بودن دلارینو به‌صورت شفاف قبل از ورود در دسترس شماست.'
                  : 'Unlike anonymous schemes, Dollarino publishes full founder identity, verifiable contacts, project goals, solo-built independence, and 6 architectural proofs that Dollarino is strictly non-custodial and zero-Ponzi.'}
              </p>
            </div>

            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-5 items-stretch">
              {/* Left: Verifiable Founder Identity & Contact Card */}
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
                        <DollarinoBrandMark size={48} glow />
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
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim pt-0.5">
                        {founder?.verificationId && (
                          <span dir="ltr" className="px-2.5 py-0.5 rounded-lg surface-soft border hairline font-mono font-bold text-main">
                            ID: {founder.verificationId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 0-to-100 Independence Declaration */}
                  <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#059669] dark:text-[#34D399]">
                      <Award className="w-4 h-4 shrink-0" />
                      <span>{isFa ? 'بیانیه استقلال ۱۰۰٪ (صفر تا صد مستقل و بدون پوشش شخص ثالث)' : '100% Independent Solo-Built Declaration'}</span>
                    </div>
                    <p className="text-xs text-main leading-relaxed">
                      {isFa
                        ? (founder?.independenceFa || 'تمامی بخش‌های دلارینو از صفر تا صد توسط یک نفر (آوید کیا) طراحی، کدنویسی و نگهداری شده و زیر پوشش هیچ شرکت، گروه یا واسطه ثالثی نیست.')
                        : (founder?.independenceEn || 'Designed, engineered, and operated 0-to-100 solely by Avid Kiya without any third-party cover, syndicate, or intermediary.')}
                    </p>
                  </div>

                  {/* Bio */}
                  <p className="text-xs text-sub leading-relaxed">
                    {isFa
                      ? (founder?.bioFa || 'طراح و مهندس تمام کدهای کلاینت، سرور ابری، موتورهای چندمدلی AI، سیستم امنیتی و ربات تلگرام دلارینو با تمرکز بر شفافیت و نگهداری غیرامانی سرمایه کاربران.')
                      : (founder?.bioEn || 'Creator of the entire Dollarino web platform, edge AI engine, security layer, and Telegram automation stack focused on non-custodial transparency.')}
                  </p>

                  {/* Verifiable Identities & Contacts */}
                  <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                    {founder?.email && (
                      <a
                        href={`mailto:${founder.email}`}
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Mail className="w-4 h-4 text-[var(--gold)] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Gmail / Official Email</span>
                          <span className="font-bold text-main truncate block">{founder.email}</span>
                        </div>
                      </a>
                    )}
                    {founder?.phone && (
                      <div dir="ltr" className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 min-w-0">
                        <Phone className="w-4 h-4 text-jade shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Phone / Direct</span>
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
                    {(founder?.channelUrl || founder?.channel || publicBotInfo.officialChannelInvite) && (
                      <a
                        href={publicBotInfo.officialChannelInvite || founder?.channelUrl || `https://t.me/${String(founder?.channel || '').replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <ShieldCheck className="w-4 h-4 text-jade shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? '🌟 چنل رسمی و اصلی دلارینو' : 'Official Main Channel'}</span>
                          <span className="font-bold text-main truncate block">{publicBotInfo.officialChannel || founder?.channel || founder?.channelUrl}</span>
                        </div>
                      </a>
                    )}
                    {publicBotInfo.signalsChannelInvite && (
                      <a
                        href={publicBotInfo.signalsChannelInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="surface-soft rounded-2xl p-3 border border-emerald-500/30 flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Send className="w-4 h-4 text-jade shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? '01. سیگنال دلارینو' : '01. Signals'}</span>
                          <span dir="ltr" className="font-bold text-main truncate block">{publicBotInfo.signalsChannel || (isFa ? 'کانال سیگنال‌های معاملاتی' : 'Trading Signals')}</span>
                        </div>
                      </a>
                    )}
                    {publicBotInfo.resultsChannelInvite && (
                      <a
                        href={publicBotInfo.resultsChannelInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="surface-soft rounded-2xl p-3 border border-amber-500/30 flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <ShieldCheck className="w-4 h-4 text-gold shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? '02. نتایج سیگنال دلارینو' : '02. Signal Results'}</span>
                          <span className="font-bold text-main truncate block">{publicBotInfo.resultsChannel || (isFa ? 'نتایج، سود و عملکرد' : 'Results & PnL')}</span>
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
                    {publicBotInfo.newsChannelInvite && (
                      <a
                        href={publicBotInfo.newsChannelInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="surface-soft rounded-2xl p-3 border border-sky-500/30 flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Send className="w-4 h-4 text-[#0EA5E9] shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">{isFa ? '07. اخبار دلارینو' : '07. Crypto News'}</span>
                          <span className="font-bold text-main truncate block">{publicBotInfo.newsChannel || (isFa ? 'اخبار کریپتو و بازار' : 'Crypto & Market News')}</span>
                        </div>
                      </a>
                    )}
                    {(founder?.instagramUrl || founder?.instagram) && (
                      <a
                        href={founder?.instagramUrl || `https://instagram.com/${String(founder?.instagram || '').replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">Instagram</span>
                          <span className="font-bold text-main truncate block">{founder?.instagram || founder?.instagramUrl}</span>
                        </div>
                      </a>
                    )}
                    {(founder?.twitterUrl || founder?.twitter) && (
                      <a
                        href={founder?.twitterUrl || `https://x.com/${String(founder?.twitter || '').replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                        className="surface-soft rounded-2xl p-3 border hairline flex items-center gap-2.5 hover:border-[var(--gold)] transition min-w-0"
                      >
                        <Globe className="w-4 h-4 text-brand shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-dim block">X (Twitter)</span>
                          <span className="font-bold text-main truncate block">{founder?.twitter || founder?.twitterUrl}</span>
                        </div>
                      </a>
                    )}
                  </div>
                </div>

                {/* Project Goals & Promotional Value */}
                <div className="surface-soft rounded-2xl p-4 border hairline space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-main">
                    <FileCheck2 className="w-4 h-4 text-[var(--gold)]" />
                    <span>{isFa ? 'هدف، کاربرد و ارزش پروژه دلارینو برای کاربران' : 'Project Mission & Core Value'}</span>
                  </div>
                  <p className="text-xs text-sub leading-relaxed">
                    {isFa
                      ? (founder?.missionFa || 'هدف دلارینو دموکراتیک‌سازی ترید الگوریتمی و هوش مصنوعی برای همه کاربران بدون نیاز به پرداخت اشتراک است: آموزش و تمرین ۱۰۰٪ رایگان روی کیف‌پول دمو قابل تنظیم و در حالت واقعی ۳ معامله اول رایگان + فقط کارمزد شفاف ۳٪ از سود واقعی در کیف‌پول شخصی خود کاربر.')
                      : (founder?.missionEn || 'Dollarino democratizes AI and algorithmic trading for everyone with zero upfront fees: free customizable paper training, first 3 live wins at 0% fee, plus a transparent 3% profit-only fee.')}
                  </p>
                </div>
              </div>

              {/* Right: 6-Point Technical Anti-Ponzi & Anti-Scam Proof */}
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
                          ['۶. هویت باز و قابل پیگیری قانونی', 'مشخصات واقعی سازنده، کد تایید و راه‌های تماس مستقیم در دسترس عموم و مراجع قانونی جهت بررسی کامل قرار دارد.'],
                        ]
                      : [
                          ['1. Zero Pooled Deposits', 'Dollarino never collects or holds trading capital. Your funds stay inside your own self-custodial Trust Wallet.'],
                          ['2. No Fixed ROI / No MLM', 'Zero fake guaranteed daily yields and zero multi-level pyramid payouts — only transparent market execution.'],
                          ['3. Zero Withdrawal Permission', 'Execution scopes only sign orders & SL/TP. Funds cannot be withdrawn to third-party wallets.'],
                          ['4. 3 Free Wins · 3% Profit Only', 'First 3 profitable live trades carry 0% fee, then you keep 97% of net profits. Demo simulation is 100% free.'],
                          ['5. Real-Time Anti-Rug Scanner', 'Every token is verified via GoPlus, Honeypot.is & RugCheck before copy or swap orders trigger.'],
                          ['6. Traceable Solo Founder', 'Real identity, verification ID, and direct channels are published openly for user & legal inspection.'],
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
                        ابتدا با شبیه‌ساز دمو قابل تنظیم (<span dir="ltr" className="inline-block font-bold" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>) رایگان امتحان کنید؛ بدون ریسک و بدون واریز وجه!
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

        {/* 5. Security & FAQ */}
        <section id="faq" className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div className="panel rounded-[28px] p-6 space-y-4">
            <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[10px] font-black">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ZERO-TRUST SECURITY</span>
            </span>
            <h3 className="font-display font-bold text-2xl text-main">
              {isFa ? 'امنیت کامل سرمایه + پشتیبانی آنلاین واقعی' : 'Bank-Grade Security + Real Online Support'}
            </h3>
            <p className="text-xs sm:text-sm text-dim leading-relaxed">
              {isFa
                ? 'دارایی واقعی شما در کیف‌پول غیرامانی Trust Wallet باقی می‌ماند و با امضای استاندارد Web3 و کلید محدود (بدون مجوز برداشت) عمل می‌کند. در تمام ساعات شبانه‌روز از طریق چت پشتیبانی آنلاین داخل سایت یا ربات تلگرام کنار شما هستیم.'
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
            </div>
          </div>

          <div className="panel rounded-[28px] p-5 space-y-2.5">
            <h3 className="font-display font-bold text-lg text-main px-1 pb-1">
              {isFa ? 'سوالات پرتکرار کاربران' : 'Frequently Asked Questions'}
            </h3>
            {(isFa
              ? [
                  ['اکستنشن پنل کناری کروم (V11.7.2) چه تفاوتی با پاپ‌آپ قدیمی دارد؟', 'افزونه جدید مستقیماً از API رسمی Chrome Side Panel استفاده می‌کند و دقیقاً مثل افزونه Trust Wallet کنار صفحه مرورگر شما باز و ثابت می‌ماند. این پنل به‌طور اختصاصی فقط روی حالت ساده قفل شده تا کنار چارت‌ها یا صرافی‌ها سریع و بدون شلوغی با ربات و بازار کار کنید.'],
                  ['ثبت‌نام مستقیم DApps تراست‌ولت، گوگل و تلگرام چطور انجام می‌شود؟', 'اگر روی ثبت‌نام با کیف‌پول کلیک کنید سایت مستقیماً در مرورگر DApps تراست‌ولت باز شده و درخواست امضای ورود می‌دهد. پس از ورود با کیف‌پول، گوگل یا تلگرام، یک فرم کوتاه برای تکمیل شماره تماس، اسم مستعار، نام کاربری و رمز عبور نمایش داده می‌شود و در صورت نداشتن کد معرف، کد معرف مدیر به‌صورت خودکار اعمال می‌گردد.'],
                  ['کارت سود ۱۶:۹ و ۹:۱۶، اسنایپر ۵ دقیقه‌ای و TP/SL درصدی چطور کار می‌کنند؟', 'در استودیو کارت سود می‌توانید برای هر معامله یا بازه زمانی (Perp DEX، DEX Swap، کپی‌ترید و ربات) کارت PNG در ابعاد ۱۶:۹ افقی یا ۹:۱۶ استوری بسازید. اسنایپر ۵ دقیقه‌ای با فیلترهای پرو توکن‌های جدید و شارژ خزانه سولانا (SOL/USDC) را پشتیبانی می‌کند و در ترمینال و Perp DEX حد سود/ضرر را می‌توانید با یک کلیک روی درصد (%) یا قیمت ($) تنظیم کنید.'],
                  ['کپی‌ترید هوشمند ولت‌ها (V2) و باکس مارجین اختصاصی چطور کار می‌کند؟', 'در بخش کپی‌ترید می‌توانید هم تریدرهای تاییدشده سایت را فالو کنید و هم از ۱۰ ولت برتر هوشمند هر شبکه یا هر ولت دلخواه (Solana, Base, ETH, BSC, TON, TRON) کپی بگیرید. پس از فعال‌سازی فالو، سیستم فقط معاملاتی که از همان لحظه به بعد باز می‌شوند را کپی می‌کند و برای هر تریدر باکس مارجین جداگانه و سقف ضرر روزانه دارد.'],
                  ['سپر ضدراگ و Multi-DApp Trust Wallet چه فایده‌ای دارد؟', 'قبل از هر سوآپ یا کپی، قرارداد توکن به‌صورت خودکار با GoPlus، Honeypot.is و RugCheck از نظر قفل نقدینگی، مالیات خرید/فروش و مجوز Mint اسکن می‌شود. همچنین می‌توانید هر توکن را با یک کلیک روی همه صرافی‌های معتبر آن شبکه (Jupiter, Uniswap, PancakeSwap, 1inch, STON.fi و...) داخل مرورگر Trust Wallet باز کنید.'],
                  ['خزانه کپی‌ترید ۲۴/۷ چقدر امن است و آیا کلید خصوصی در اختیار من است؟', 'بله؛ برای اجرای تمام‌اتومات ۲۴/۷ می‌توانید از آدرس خزانه اختصاصی خودتان استفاده کنید. کلیدهای شما با رمزنگاری AES-256-GCM نگهداری می‌شوند و هر زمان خواستید از دکمه «نمایش و بک‌آپ کلیدهای خزانه» پس از تایید ۲ مرحله‌ای (رمز حساب یا کد تلگرام)، کلید خصوصی EVM و سولانا را دریافت یا سودتان را به Trust Wallet منتقل کنید.'],
                  ['چرا دلارینو اشتراک نمی‌گیرد و فقط ۳٪ از سود واقعی محاسبه می‌کند؟', 'پلتفرم‌های اشتراکی پولشان را از پیش می‌گیرند و فرقی به حالشان ندارد که شما ضرر کنید یا سود؛ اما در دلارینو هیچ اشتراک ماهانه‌ای نیست (دمو قابل تنظیم و ۲۵+ اندیکاتور هم ۱۰۰٪ رایگانند). علاوه بر ۳ معامله سودده اول رایگان (۰٪)، بعد از آن ۹۷٪ سود برای شما و فقط ۳٪ از سود خالص هزینه سرور است — یعنی ما فقط وقتی بیشتر درآمد داریم که شما سود بیشتری بگیرید!'],
                ]
              : [
                  ['How does the new Chrome Side Panel Extension (V11.7.2) work?', 'The upgraded MV3 extension uses Chrome’s native Side Panel API to stay docked alongside any tab — just like Trust Wallet — locked to Simple Mode so you can control your bot and live prices effortlessly without clutter.'],
                  ['How do Direct Trust Wallet DApp, Google & Telegram signups work?', 'Clicking Wallet signup launches Dollarino straight inside Trust Wallet’s DApps browser to register/sign in with 1 tap. Wallet, Google & Telegram signups all open the unified profile completion form (Phone, Nickname, Username, Password) with automatic admin referral fallback.'],
                  ['What are 16:9 & 9:16 Profit Cards, 5m Pro Sniper & %/$ TP/SL?', 'Issue verified PNG PnL cards in 16:9 Landscape or 9:16 Story across Perp, DEX, Copy & Bot; filter fresh tokens with the 5m Sniper + Solana SOL/USDC Vault funding; and toggle Terminal / Perp TP & SL between % and $ price.'],
                  ['How does Smart-Wallet Copy Trading V2 & Isolated Margin Boxes work?', 'Track Top-10 smart-money wallets or add any custom wallet across Solana, Base, ETH, BSC, Arbitrum, TON & TRON. Only fresh trades opened after follow-time are mirrored, each inside an isolated margin box with its own daily max loss, 3-step TP, Moonbag, Trailing SL, and 7-day backtest.'],
                  ['What does the Anti-Rug Shield & Trust Multi-DApp Router do?', 'Before every trade or copy order, contracts are scanned live via GoPlus, Honeypot.is & RugCheck for honeypots, high taxes, mint/freeze traps, and liquidity depth — plus 1-click Multi-DApp links directly into Trust Wallet.'],
                  ['How does the 24/7 Copy-Vault & Key Backup work?', 'Each user gets an encrypted AES-256-GCM Copy-Vault for 24/7 automated Solana Jupiter execution, plus 2-step (Password or Telegram 6-digit PIN) verified export of private keys anytime inside the dashboard.'],
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

      <footer className="border-t hairline py-10 px-4 text-center text-xs text-dim space-y-3">
        <div className="flex items-center justify-center gap-2">
          <DollarinoBrandMark size={26} />
          <span className="font-bold text-main">Dollarino V11.7.2 AI Trading Platform</span>
        </div>
        <p className="opacity-85">
          {isFa
            ? `۵ موتور همزمان + اکستنشن پنل کناری کروم + Trust Wallet DApp + کارت سود ۱۶:۹/۹:۱۶${publicBotInfo.botUsername ? ` · ربات تلگرام @${publicBotInfo.botUsername}` : ''}`
            : `5 Concurrent Engines · Chrome Side Panel · Trust Wallet DApp · 16:9 & 9:16 Profit Cards${publicBotInfo.botUsername ? ` · @${publicBotInfo.botUsername}` : ''}`}
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
