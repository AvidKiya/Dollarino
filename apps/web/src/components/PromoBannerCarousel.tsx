import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { NavTab, PromoBannerItem } from '../lib/types';

const FALLBACK_BANNERS: PromoBannerItem[] = [
  {
    id: 'fallback_smart_copy',
    badge_fa: 'جدید · V2 PRO',
    badge_en: 'NEW · V2 PRO',
    title_fa: 'کپی‌ترید هوشمند ولت‌ها با باکس مارجین اختصاصی',
    title_en: 'Smart-Money Wallet Copy with Isolated Margin Boxes',
    subtitle_fa:
      '۱۰ ولت برتر یا آدرس دلخواه را رصد کنید، ۷ روز بک‌تست واقعی بگیرید و مستقیم با Trust Wallet یا ولت اختصاصی ۲۴/۷ معامله کنید.',
    subtitle_en:
      'Track Top-10 or custom wallets, run a 7-day backtest, and execute directly via Trust Wallet or your 24/7 private wallet.',
    cta_label_fa: 'شروع کپی‌ترید ولت‌ها',
    cta_label_en: 'Open Smart Copy V2',
    cta_target: 'copy',
    image_url: '/images/smart-wallet-radar.webp',
    accent_theme: 'gold',
    placement: 'BOTH',
    sort_order: 1,
    is_active: 1,
  },
  {
    id: 'fallback_antirug',
    badge_fa: 'ضدراگ + فیوچرز کیف‌پول',
    badge_en: 'ANTI-RUG + PERPS',
    title_fa: 'سپر ضدراگ واقعی + فیوچرز اهرم‌دار بدون صرافی روی کیف‌پول',
    title_en: 'Real Anti-Rug + Leveraged Perp Futures Straight From Your Wallet',
    subtitle_fa:
      'اسکن GoPlus/Honeypot/RugCheck، باز کردن همه DEXهای شبکه و ترید اهرم‌دار در Hyperliquid و Jupiter Perps بدون KYC.',
    subtitle_en:
      'Live contract scan, all-chain Multi-DApp Trust routing, and leveraged Perp DEX trading without KYC.',
    cta_label_fa: 'ورود به هاب DEX و فیوچرز',
    cta_label_en: 'Launch DEX & Perps',
    cta_target: 'dex',
    image_url: '/images/antirug-shield-dapp.webp',
    accent_theme: 'emerald',
    placement: 'BOTH',
    sort_order: 2,
    is_active: 1,
  },
];

const THEME_CLASSES: Record<string, { border: string; glow: string; btn: string }> = {
  gold: {
    border: 'border-amber-500/35',
    glow: 'from-amber-500/15 via-transparent to-blue-500/10',
    btn: 'btn-gold',
  },
  emerald: {
    border: 'border-emerald-500/35',
    glow: 'from-emerald-500/15 via-transparent to-cyan-500/10',
    btn: 'btn-emerald',
  },
  cobalt: {
    border: 'border-blue-500/35',
    glow: 'from-blue-500/15 via-transparent to-purple-500/10',
    btn: 'btn-cobalt',
  },
  purple: {
    border: 'border-purple-500/35',
    glow: 'from-purple-500/15 via-transparent to-amber-500/10',
    btn: 'btn-cobalt',
  },
};

export function PromoBannerCarousel({
  lang,
  placement,
  onNavigateTab,
  onGuestAction,
}: {
  lang: Lang;
  placement: 'LANDING' | 'DASHBOARD';
  onNavigateTab?: (tab: NavTab) => void;
  onGuestAction?: (target: string) => void;
}) {
  const isFa = lang === 'fa';
  const [banners, setBanners] = useState<PromoBannerItem[]>(FALLBACK_BANNERS);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    apiFetch<{ banners: PromoBannerItem[] }>(`/api/public/banners?placement=${placement}`)
      .then((res) => {
        if (res.banners && res.banners.length > 0) {
          setBanners(res.banners);
          setIdx(0);
        }
      })
      .catch(() => {});
  }, [placement]);

  useEffect(() => {
    if (paused || banners.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % banners.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [paused, banners.length]);

  if (!banners.length) return null;
  const safeIdx = idx % banners.length;
  const current = banners[safeIdx]!;
  const style = THEME_CLASSES[current.accent_theme] ?? THEME_CLASSES.gold!;

  const goNext = () => setIdx((prev) => (prev + 1) % banners.length);
  const goPrev = () => setIdx((prev) => (prev - 1 + banners.length) % banners.length);

  const handleAction = () => {
    const rawTarget = (current.cta_target || 'copy').trim();
    const targetMap: Record<string, NavTab> = {
      'my-ai': 'myai',
      myai: 'myai',
      subscription: 'pricing',
      pricing: 'pricing',
      copy: 'copy',
      dex: 'dex',
      radar: 'radar',
      overview: 'overview',
      terminal: 'terminal',
      markets: 'markets',
      portfolio: 'portfolio',
      aichat: 'aichat',
      card: 'card',
      services: 'services',
      faq: 'faq',
    };
    if (/^https?:\/\//i.test(rawTarget)) {
      window.open(rawTarget, '_blank', 'noopener,noreferrer');
      return;
    }
    if (rawTarget.startsWith('#')) {
      document.getElementById(rawTarget.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const normalizedTab = targetMap[rawTarget.toLowerCase()] || 'copy';
    if (onNavigateTab) {
      onNavigateTab(normalizedTab);
    } else if (onGuestAction) {
      onGuestAction(normalizedTab);
    }
  };

  return (
    <div
      className={`panel rounded-[28px] overflow-hidden border relative shadow-xl ${style.border}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const endX = e.changedTouches[0]?.clientX;
        if (touchStartX.current !== null && typeof endX === 'number') {
          const dx = endX - touchStartX.current;
          if (Math.abs(dx) > 40) {
            if (dx > 0) goPrev();
            else goNext();
          }
        }
        touchStartX.current = null;
        setPaused(false);
      }}
    >
      {/* Top animated progress bar when auto-rotating */}
      {banners.length > 1 && !paused && (
        <div className="h-0.5 w-full bg-white/10 overflow-hidden">
          <div key={`${current.id}-${safeIdx}`} className="h-full bg-[var(--gold)] banner-progress" />
        </div>
      )}

      <div
        key={current.id}
        className={`banner-slide relative bg-gradient-to-br ${style.glow} p-4 sm:p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6`}
      >
        <div className="relative w-full md:w-64 lg:w-72 h-36 sm:h-40 rounded-2xl overflow-hidden shrink-0 border hairline shadow-lg">
          <img
            src={current.image_url || '/images/smart-wallet-radar.webp'}
            alt={isFa ? current.title_fa : current.title_en}
            className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
          />
          <span className="absolute top-2.5 start-2.5 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-black text-amber-300 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>{isFa ? current.badge_fa : current.badge_en}</span>
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <h3 className="font-display font-bold text-lg sm:text-xl text-main leading-snug">
            {isFa ? current.title_fa : current.title_en}
          </h3>
          <p className="text-xs sm:text-sm text-dim leading-relaxed max-w-2xl">
            {isFa ? current.subtitle_fa : current.subtitle_en}
          </p>

          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleAction}
              className={`${style.btn} px-5 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isFa ? current.cta_label_fa : current.cta_label_en}</span>
            </button>

            {banners.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="h-8 w-8 rounded-full surface-soft hover:bg-[var(--soft)] grid place-items-center text-dim hover:text-main transition"
                  aria-label="Previous slide"
                >
                  {isFa ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                <div className="flex items-center gap-1.5">
                  {banners.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i === safeIdx ? 'w-6 bg-[var(--gold)]' : 'w-2 bg-white/25 hover:bg-white/45'
                      }`}
                      aria-label={`Slide ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="h-8 w-8 rounded-full surface-soft hover:bg-[var(--soft)] grid place-items-center text-dim hover:text-main transition"
                  aria-label="Next slide"
                >
                  {isFa ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
