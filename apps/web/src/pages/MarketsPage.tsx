import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Flame,
  Gauge,
  Globe,
  LayoutGrid,
  List,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq, getLiveIranSource, getLiveUsdtIrt, setLiveUsdtIrt } from '../lib/format';
import type { Lang } from '../lib/i18n';
import type { ExchangeMarket } from '../components/SymbolPickerModal';
import { CoinIcon } from '../components/CoinIcon';
import { Sparkline } from '../components/DollarinoViz';
import { PerpDexPanel } from '../components/PerpDexPanel';
import { TrustWalletTradePlaybook } from '../components/TrustWalletTradePlaybook';

function fmtPx(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  if (px >= 1000) return px.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(3);
  return px.toFixed(5);
}

const MAJOR_BASES = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK', 'TON', 'SUI']);
const MEME_BASES = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'BOME', 'MEME']);

export function MarketsPage({
  lang,
  uiMode = 'pro',
  markets,
  iranRate,
  marketType = 'FUTURES',
  walletEvmAddress,
  focusSymbol,
  focusNonce = 0,
  onClearFocus,
  onChangeMarketType,
  onTradeSymbol,
  onRefresh,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  markets: ExchangeMarket[];
  iranRate?: number;
  marketType?: 'SPOT' | 'FUTURES';
  walletEvmAddress?: string | null;
  focusSymbol?: string | null;
  focusNonce?: number;
  onClearFocus?: () => void;
  onChangeMarketType?: (next: 'SPOT' | 'FUTURES') => void;
  onTradeSymbol: (sym: string) => void;
  onRefresh?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [section, setSection] = useState<'markets' | 'perp'>('markets');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | 'favs' | 'MAJOR' | 'L1' | 'DEFI' | 'AI' | 'MEME' | 'GAMING' | 'RWA'>('all');
  const [sortBy, setSortBy] = useState<'volume' | 'gainers' | 'losers'>('volume');
  const [simpleViewMode, setSimpleViewMode] = useState<'list' | 'grid'>('list');
  const [visibleCount, setVisibleCount] = useState(60);
  const [liveIrt, setLiveIrt] = useState<number>(() => iranRate || getLiveUsdtIrt());
  const [liveIrtSource, setLiveIrtSource] = useState<string>(() => getLiveIranSource());
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(focusSymbol ?? null);

  useEffect(() => {
    if (!focusSymbol) {
      setSelectedSymbol(null);
      return;
    }
    setSection('markets');
    setCategory('all');
    setQ('');
    setSelectedSymbol(focusSymbol);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [focusSymbol, focusNonce]);

  useEffect(() => {
    if (iranRate && iranRate >= 30_000) {
      setLiveIrt(iranRate);
      setLiveUsdtIrt(iranRate);
    }
  }, [iranRate]);

  useEffect(() => {
    const syncRate = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      apiFetch<{ usdtIrt?: number; source?: string }>('/api/public/usdt-irt-rate')
        .then((res) => {
          if (res?.usdtIrt && res.usdtIrt >= 30_000) {
            setLiveIrt(res.usdtIrt);
            if (res.source) setLiveIrtSource(res.source);
            setLiveUsdtIrt(res.usdtIrt, res.source);
          }
        })
        .catch(() => {});
    };
    if (!iranRate || iranRate < 30_000) syncRate();
    const iv = setInterval(syncRate, 60_000);
    return () => clearInterval(iv);
  }, []);
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('dollarino_fav_pairs');
      return raw ? (JSON.parse(raw) as string[]) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    } catch {
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    }
  });

  const toggleFav = (sym: string) => {
    const next = favs.includes(sym) ? favs.filter((x) => x !== sym) : [...favs, sym];
    setFavs(next);
    localStorage.setItem('dollarino_fav_pairs', JSON.stringify(next));
  };

  const stats = useMemo(() => {
    const green = markets.filter((m) => Number(m.changePct24h) > 0).length;
    const red = markets.length - green;
    const sentiment = markets.length ? Math.round((green / markets.length) * 100) : 50;
    return { green, red, sentiment };
  }, [markets]);

  const list = useMemo(() => {
    const query = q.trim().toUpperCase();
    let arr = [...markets];
    if (category === 'favs') arr = arr.filter((m) => favs.includes(m.symbol));
    else if (category === 'MAJOR') arr = arr.filter((m) => m.category === 'MAJOR' || MAJOR_BASES.has(m.base));
    else if (category === 'L1') arr = arr.filter((m) => m.category === 'L1' || MAJOR_BASES.has(m.base));
    else if (category === 'MEME') arr = arr.filter((m) => m.category === 'MEME' || MEME_BASES.has(m.base));
    else if (category !== 'all') arr = arr.filter((m) => m.category === category);
    if (query) {
      arr = arr.filter(
        (m) =>
          m.symbol.includes(query) ||
          m.base.includes(query) ||
          m.exchangeSymbol.toUpperCase().includes(query) ||
          (m.nameEn && m.nameEn.toUpperCase().includes(query)) ||
          (m.nameFa && m.nameFa.includes(query))
      );
    }
    if (sortBy === 'gainers') arr.sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    else if (sortBy === 'losers') arr.sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    if (selectedSymbol) {
      const idx = arr.findIndex((m) => m.symbol.toUpperCase() === selectedSymbol.toUpperCase());
      if (idx > 0) {
        const [picked] = arr.splice(idx, 1);
        if (picked) arr.unshift(picked);
      }
    }
    return arr;
  }, [markets, q, sortBy, category, favs, selectedSymbol]);

  const focusedMarket = useMemo(
    () =>
      selectedSymbol
        ? markets.find((m) => m.symbol.toUpperCase() === selectedSymbol.toUpperCase()) ?? null
        : null,
    [markets, selectedSymbol]
  );

  const visibleList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);

  const focusedMarketCard = focusedMarket ? (() => {
    const px = Number(focusedMarket.lastPrice || 0);
    const ch = Number(focusedMarket.changePct24h || 0);
    const up = ch >= 0;
    const lo = Number(focusedMarket.low24h || px * 0.97);
    const hi = Number(focusedMarket.high24h || px * 1.03);
    const spark = [lo, px * (up ? 0.992 : 1.008), px * (up ? 0.997 : 1.003), px];
    const isFav = favs.includes(focusedMarket.symbol);
    return (
      <div
        data-testid="market-spotlight-card"
        className="panel rounded-[26px] p-4 sm:p-5 border-2 border-[var(--gold)] shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <CoinIcon symbol={focusedMarket.symbol} size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)] text-[var(--gold)] text-[10px] font-black">
                <Sparkles className="w-3 h-3" />
                <span>{isFa ? 'ارز انتخاب‌شده از نوار قیمت' : 'SELECTED FROM TICKER'}</span>
              </span>
              <button
                type="button"
                onClick={() => toggleFav(focusedMarket.symbol)}
                className="text-dim hover:text-[#F59E0B]"
                aria-label="Favorite"
              >
                <Star className={`w-4 h-4 ${isFav ? 'fill-[#F59E0B] text-[#F59E0B]' : ''}`} />
              </button>
            </div>
            <h3 className="font-display font-black text-lg sm:text-xl text-main mt-1 flex items-center gap-2">
              <span dir="ltr">{focusedMarket.symbol}</span>
              <span className="text-xs font-bold text-dim">· {coinDisplayName(focusedMarket.base, isFa)}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
              <span dir="ltr" className="font-num font-black text-base text-main">${fmtPx(px)}</span>
              {isFa && px > 0 && <span className="text-dim tabular">{formatTomanEq(px, liveIrt)} تومان</span>}
              <span dir="ltr" className={`font-num font-black ${up ? 'text-jade' : 'text-loss'}`}>
                {up ? '+' : ''}{ch.toFixed(2)}%
              </span>
              <span dir="ltr" className="text-[11px] text-dim">
                H: ${fmtPx(hi)} · L: ${fmtPx(lo)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:block w-28 h-10">
            <Sparkline values={spark} height={38} color={up ? '#10d9a3' : '#ff4d6d'} fill />
          </div>
          <button
            type="button"
            onClick={() => onTradeSymbol(focusedMarket.symbol)}
            className="btn-gold px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isFa ? `معامله ${focusedMarket.base}` : `Trade ${focusedMarket.base}`}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol(null);
              onClearFocus?.();
            }}
            aria-label={isFa ? 'بستن انتخاب' : 'Clear selection'}
            className="btn-ghost p-2 rounded-xl text-dim hover:text-main"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  })() : null;

  const sectionToggleBar = (
    <div className="tab-bar w-full sm:w-auto">
      {[
        { id: 'markets' as const, icon: Globe, fa: 'بازارهای اسپات و فیوچرز', en: 'Spot & Futures Markets' },
        { id: 'perp' as const, icon: Gauge, fa: 'فیوچرز کیف‌پول (Perp DEX تا ۱۰۰x)', en: 'Wallet Perp DEX (Up to 100x)' },
      ].map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setSection(t.id)}
            className={`tab-pill flex-1 sm:flex-initial ${section === t.id ? 'tab-pill-active' : ''}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{isFa ? t.fa : t.en}</span>
          </button>
        );
      })}
    </div>
  );

  if (section === 'perp') {
    return (
      <div className="space-y-4">
        {sectionToggleBar}
        <PerpDexPanel lang={lang} walletEvmAddress={walletEvmAddress} onAfterChange={onRefresh} />
      </div>
    );
  }

  if (uiMode === 'simple') {
    const totalVol = markets.reduce((acc, m) => acc + Number(m.volume24h || 0), 0);
    const btcRow = markets.find((m) => m.symbol === 'BTCUSDT');
    const btcCh = Number(btcRow?.changePct24h ?? 0);
    const btcDom = totalVol > 0 && btcRow ? Math.min(68, Math.max(46, 54 + (Number(btcRow.volume24h || 0) / totalVol) * 20)) : 58.7;
    const fearScore = Math.max(5, Math.min(95, stats.sentiment));

    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        {sectionToggleBar}
        {focusedMarketCard}
        {/* Top 5 Market Pulse Strip incl. Live Iran Tether/USD */}
        <div className="panel rounded-2xl p-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center items-center">
          <div className="col-span-2 sm:col-span-1 space-y-0.5 border-b sm:border-b-0 sm:border-e hairline pb-2 sm:pb-0 sm:pe-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-dim">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{isFa ? 'دلار / تتر ایران (زنده)' : 'Live Iran USDT/USD'}</span>
            </div>
            <p dir="ltr" className="font-display font-bold text-sm sm:text-base text-jade font-num">
              {Math.round(liveIrt).toLocaleString('en-US')} <span className="text-[10px]">ت</span>
            </p>
            <p className="text-[10px] font-bold text-dim truncate">
              {liveIrtSource === 'arzdigital' ? (isFa ? 'مرجع ارزدیجیتال' : 'ArzDigital') : liveIrtSource.toUpperCase()}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-dim">{isFa ? 'ارزش بازار' : 'M. Cap'}</p>
            <p dir="ltr" className="font-display font-bold text-sm sm:text-base text-main">$2.04 T</p>
            <p dir="ltr" className={`text-[11px] font-bold tabular ${btcCh >= 0 ? 'text-jade' : 'text-loss'}`}>
              {btcCh >= 0 ? '+' : ''}
              {btcCh.toFixed(2)}%
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-dim">{isFa ? 'حجم معاملات' : '24h Vol'}</p>
            <p dir="ltr" className="font-display font-bold text-sm sm:text-base text-main">
              {totalVol >= 1e9 ? `${(totalVol / 1e9).toFixed(1)} B` : `${Math.max(12.4, totalVol / 1e6).toFixed(1)} M`}
            </p>
            <p dir="ltr" className="text-[11px] font-bold tabular text-jade">
              {markets.length} {isFa ? 'جفت' : 'pairs'}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-dim">{isFa ? 'دامیننس BTC' : 'BTC Dom'}</p>
            <p dir="ltr" className="font-display font-bold text-sm sm:text-base text-main">{btcDom.toFixed(2)}%</p>
            <div className="text-[11px] font-bold text-dim inline-flex items-center justify-center gap-1">
              <CoinIcon symbol="BTCUSDT" size={13} />
              <span>BTC</span>
            </div>
          </div>

          <div className="space-y-1 flex flex-col items-center">
            <p className="text-[11px] font-bold text-dim">{isFa ? 'ترس و طمع' : 'Fear & Greed'}</p>
            <p dir="ltr" className="font-display font-bold text-sm sm:text-base text-main">{fearScore}</p>
            <div className="relative w-16 h-2 rounded-full overflow-hidden flex">
              <span className="flex-1 bg-[#EF4444]" />
              <span className="flex-1 bg-[#F97316]" />
              <span className="flex-1 bg-[#FACC15]" />
              <span className="flex-1 bg-[#10B981]" />
              <span
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-900 shadow"
                style={{ left: `calc(${fearScore}% - 5px)` }}
              />
            </div>
          </div>
        </div>

        {/* Clean Rounded Search Pill */}
        <div className="panel rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
          <Search className="w-4 h-4 text-dim shrink-0" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisibleCount(60);
            }}
            placeholder={isFa ? 'جستجوی ارز (مثلاً BTC، ETH، SOL)...' : 'Search coin (BTC, ETH, SOL)...'}
            className="bg-transparent flex-1 text-xs font-medium text-main outline-none placeholder:text-dim"
          />
        </div>

        {/* Horizontal Filter Tabs + Market Type / View Toggle */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
          <div className="flex items-center gap-3.5 text-xs font-bold shrink-0">
            {[
              { id: 'favs', sort: 'volume', lbl: isFa ? 'علاقه‌مندی' : 'Favorites' },
              { id: 'all', sort: 'volume', lbl: isFa ? 'محبوب‌ترین' : 'Popular' },
              { id: 'L1', sort: 'volume', lbl: isFa ? 'ارزهای برتر' : 'Top Majors' },
              { id: 'all_gain', sort: 'gainers', lbl: isFa ? 'بیشترین سود' : 'Top Gainers' },
              { id: 'all_loss', sort: 'losers', lbl: isFa ? 'بیشترین ضرر' : 'Top Losers' },
            ].map((t) => {
              const active =
                (t.id === 'favs' && category === 'favs') ||
                (t.id === 'L1' && category === 'L1') ||
                (t.id === 'all' && category === 'all' && sortBy === 'volume') ||
                (t.id === 'all_gain' && category === 'all' && sortBy === 'gainers') ||
                (t.id === 'all_loss' && category === 'all' && sortBy === 'losers');
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (t.id === 'favs') {
                      setCategory('favs');
                      setSortBy('volume');
                    } else if (t.id === 'L1') {
                      setCategory('L1');
                      setSortBy('volume');
                    } else {
                      setCategory('all');
                      setSortBy(t.sort as typeof sortBy);
                    }
                    setVisibleCount(60);
                  }}
                  className={`py-1.5 whitespace-nowrap transition border-b-2 ${
                    active ? 'text-[#D97706] border-[#F59E0B] font-black' : 'text-dim border-transparent hover:text-main'
                  }`}
                >
                  {t.lbl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          {onChangeMarketType ? (
            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => void onChangeMarketType('FUTURES')}
                className={`px-3 py-1 rounded-full text-[11px] font-black transition ${
                  marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'
                }`}
              >
                {isFa ? 'فیوچرز' : 'Futures'}
              </button>
              <button
                type="button"
                onClick={() => void onChangeMarketType('SPOT')}
                className={`px-3 py-1 rounded-full text-[11px] font-black transition ${
                  marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'
                }`}
              >
                {isFa ? 'اسپات' : 'Spot'}
              </button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSimpleViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
              className="p-2 rounded-xl panel text-sub hover:text-main transition"
              title={isFa ? 'تغییر نمایش' : 'Toggle view'}
            >
              {simpleViewMode === 'list' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Clean Crisp Coin List matching Screenshot 1 */}
        {simpleViewMode === 'list' ? (
          <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
            {visibleList.map((c) => {
              const px = Number(c.lastPrice || 0);
              const ch = Number(c.changePct24h || 0);
              const up = ch >= 0;
              const isFav = favs.includes(c.symbol);
              return (
                <div
                  key={c.symbol}
                  onClick={() => onTradeSymbol(c.symbol)}
                  className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[var(--soft)] cursor-pointer transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CoinIcon symbol={c.symbol} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-extrabold text-sm text-main">{c.base}</span>
                        {c.quote && c.quote !== 'USDT' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--soft)] text-dim">{c.quote}</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFav(c.symbol);
                          }}
                          className="text-dim hover:text-[#F59E0B]"
                          aria-label="Favorite"
                        >
                          <Star className={`w-3 h-3 ${isFav ? 'fill-[#F59E0B] text-[#F59E0B]' : ''}`} />
                        </button>
                      </div>
                      <p className="text-[11px] text-dim truncate">{coinDisplayName(c.base, isFa)}</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <p dir="ltr" className="font-num font-bold text-xs sm:text-sm text-main">
                      ${fmtPx(px)}
                    </p>
                    {isFa && (
                      <p className="text-[10px] text-dim tabular">
                        {formatTomanEq(px, liveIrt)} تومان
                      </p>
                    )}
                  </div>

                  <div dir="ltr" className={`font-num font-black text-xs sm:text-sm tabular min-w-[58px] text-end ${up ? 'text-jade' : 'text-loss'}`}>
                    {up ? '+' : '-'}
                    {Math.abs(ch).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleList.map((c) => {
              const px = Number(c.lastPrice || 0);
              const ch = Number(c.changePct24h || 0);
              const up = ch >= 0;
              return (
                <button
                  key={c.symbol}
                  type="button"
                  onClick={() => onTradeSymbol(c.symbol)}
                  className="panel panel-hover rounded-[24px] p-4 flex flex-col gap-2.5 text-start"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={c.symbol} size={34} />
                      <div>
                        <p className="font-display font-bold text-sm text-main">{c.base}</p>
                        <p className="text-[10px] text-dim">{coinDisplayName(c.base, isFa)}</p>
                      </div>
                    </div>
                    <span dir="ltr" className={`text-xs font-black tabular ${up ? 'text-jade' : 'text-loss'}`}>
                      {up ? '+' : ''}
                      {ch.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span dir="ltr" className="font-num font-bold text-base text-main">${fmtPx(px)}</span>
                    {isFa && <span className="text-[10px] text-dim">{formatTomanEq(px, liveIrt)} تومان</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {list.length > visibleList.length && (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + 60)}
              className="btn-ghost px-6 py-2.5 rounded-2xl text-xs font-black"
            >
              {isFa
                ? `نمایش ۶۰ ارز بیشتر (${visibleList.length} از ${list.length})`
                : `Load 60 more (${visibleList.length} of ${list.length})`}
            </button>
          </div>
        )}
      </div>
    );
  }

  const proTotalVol = markets.reduce((acc, m) => acc + Number(m.volume24h || 0), 0);
  const proBtcRow = markets.find((m) => m.symbol === 'BTCUSDT');
  const proBtcDom = proTotalVol > 0 && proBtcRow ? Math.min(68, Math.max(46, 54 + (Number(proBtcRow.volume24h || 0) / proTotalVol) * 20)) : 58.7;

  return (
    <div className="space-y-6">
      {sectionToggleBar}
      {focusedMarketCard}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--gold)' }}>
            <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
            <span>LIVE {marketType} MARKET UNIVERSE</span>
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {isFa
              ? `بازارهای ${marketType === 'SPOT' ? 'اسپات' : 'فیوچرز'} (${markets.length} جفت‌ارز)`
              : `${marketType === 'SPOT' ? 'Spot' : 'Perpetual'} Markets (${markets.length})`}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {onChangeMarketType && (
            <div className="ios-segmented">
              <button
                type="button"
                onClick={() => void onChangeMarketType('FUTURES')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${
                  marketType === 'FUTURES' ? 'ios-pill-active' : 'text-dim'
                }`}
              >
                {isFa ? 'فیوچرز (Futures)' : 'Futures'}
              </button>
              <button
                type="button"
                onClick={() => void onChangeMarketType('SPOT')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition ${
                  marketType === 'SPOT' ? 'ios-pill-active' : 'text-dim'
                }`}
              >
                {isFa ? 'اسپات (Spot)' : 'Spot'}
              </button>
            </div>
          )}

          <div className="panel rounded-2xl px-3.5 py-2 flex items-center gap-2 flex-1 sm:flex-none sm:w-52">
            <Search className="w-4 h-4 text-dim shrink-0" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisibleCount(60);
              }}
              placeholder={isFa ? 'جستجوی ارز...' : 'Search coin...'}
              className="bg-transparent flex-1 min-w-0 text-xs text-main outline-none placeholder:text-dim"
            />
          </div>

          {(['volume', 'gainers', 'losers'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={`inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                sortBy === s ? 'btn-gold' : 'btn-ghost text-dim'
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>
                {s === 'volume' ? (isFa ? 'پرحجم‌ترین' : 'Volume') : s === 'gainers' ? (isFa ? 'بیشترین رشد' : 'Gainers') : isFa ? 'افت قیمت' : 'Losers'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Pro Market Pulse Strip incl. Live Iran Tether Rate */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="col-span-2 sm:col-span-1 panel rounded-2xl p-3.5 space-y-1 border border-emerald-500/25">
          <div className="flex items-center justify-between gap-1">
            <span className="text-dim">{isFa ? 'دلار / تتر ایران (زنده)' : 'Live Iran USDT/IRT'}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {isFa ? 'خودکار' : 'LIVE'}
            </span>
          </div>
          <p dir="ltr" className="font-display font-bold text-lg text-jade font-num">
            {Math.round(liveIrt).toLocaleString('en-US')} <span className="text-[11px]">ت</span>
          </p>
          <p className="text-[10px] font-bold text-dim">
            {liveIrtSource === 'arzdigital' ? (isFa ? 'مرجع ارزدیجیتال (ArzDigital)' : 'ArzDigital') : liveIrtSource.toUpperCase()}
          </p>
        </div>

        <div className="panel rounded-2xl p-3.5 space-y-1.5">
          <span className="text-dim">{isFa ? 'ترس و طمع / مومنتوم' : 'Fear & Breadth'}</span>
          <div className="flex items-center justify-between font-bold">
            <span className="text-main">{stats.sentiment}% {isFa ? 'سبز' : 'Bullish'}</span>
            <Flame className="w-4 h-4 text-flame" />
          </div>
          <div className="h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
            <div className="h-full bg-jade rounded-full" style={{ width: `${stats.sentiment}%` }} />
          </div>
        </div>

        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'حجم معاملات ۲۴h' : '24h Volume'}</span>
          <p dir="ltr" className="font-display font-bold text-xl text-main mt-1">
            {proTotalVol >= 1e9 ? `$${(proTotalVol / 1e9).toFixed(1)}B` : `$${Math.max(12.4, proTotalVol / 1e6).toFixed(1)}M`}
          </p>
          <p className="text-[10px] text-dim">BTC Dom: {proBtcDom.toFixed(1)}%</p>
        </div>

        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'صعودی / نزولی' : 'Gainers / Losers'}</span>
          <p dir="ltr" className="font-display font-bold text-lg mt-1 flex items-center gap-1.5">
            <span className="text-jade">{stats.green}</span>
            <span className="text-dim">/</span>
            <span className="text-loss">{stats.red}</span>
          </p>
        </div>

        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'علاقه‌مندی‌های من' : 'My Watchlist'}</span>
          <p dir="ltr" className="font-display font-bold text-xl text-goldsoft mt-1 inline-flex items-center gap-1.5">
            <span>{favs.length}</span>
            <Star className="w-4 h-4 fill-[var(--gold)] text-[var(--gold)]" />
          </p>
        </div>
      </div>

      {/* Trust Wallet Unified Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', lbl: isFa ? 'همه ارزهای Trust Wallet' : 'All Trust Wallet Assets' },
          { id: 'favs', lbl: isFa ? 'علاقه‌مندی‌ها' : 'Favorites', star: true },
          { id: 'MAJOR', lbl: isFa ? 'اصلی و برتر' : 'Major' },
          { id: 'L1', lbl: isFa ? 'لایه ۱ (L1)' : 'Layer 1' },
          { id: 'DEFI', lbl: isFa ? 'دیفای (DeFi)' : 'DeFi' },
          { id: 'AI', lbl: isFa ? 'هوش مصنوعی (AI)' : 'AI Coins' },
          { id: 'MEME', lbl: isFa ? 'میم‌کوین‌ها' : 'Meme Coins' },
          { id: 'GAMING', lbl: isFa ? 'گیمینگ و متاورس' : 'Gaming' },
          { id: 'RWA', lbl: 'RWA' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCategory(item.id as typeof category);
              setVisibleCount(60);
            }}
            className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 ${
              category === item.id ? 'btn-gold' : 'panel text-dim hover:text-main'
            }`}
          >
            {item.star && <Star className="w-3.5 h-3.5" />}
            <span>{item.lbl}</span>
          </button>
        ))}
      </div>

      <div className="panel rounded-[26px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_1.25fr_1.3fr_.8fr_.95fr_.95fr_.75fr] gap-4 px-6 py-3.5 text-[10px] font-black tracking-[0.15em] text-dim uppercase border-b hairline">
          <Star className="w-3.5 h-3.5" />
          <span>{isFa ? 'نماد' : 'ASSET'}</span>
          <span>{isFa ? 'قیمت' : 'PRICE'}</span>
          <span>{isFa ? '۲۴ ساعت' : '24H CHG'}</span>
          <span>{isFa ? 'روند' : 'TREND'}</span>
          <span>{isFa ? 'محدوده روز' : '24H RANGE'}</span>
          <span></span>
        </div>

        <div className="divide-y hairline">
          {visibleList.map((c) => {
            const px = Number(c.lastPrice || 0);
            const ch = Number(c.changePct24h || 0);
            const up = ch >= 0;
            const lo = Number(c.low24h || px * 0.97);
            const hi = Number(c.high24h || px * 1.03);
            const pos = hi > lo ? ((px - lo) / (hi - lo)) * 100 : 50;
            const spark = [lo, px * (up ? 0.992 : 1.008), px * (up ? 0.996 : 1.003), px];
            const isFav = favs.includes(c.symbol);
            return (
              <div
                key={c.symbol}
                className="grid grid-cols-[auto_1.35fr_1.15fr_auto] md:grid-cols-[auto_1.25fr_1.3fr_.8fr_.95fr_.95fr_.75fr] items-center gap-3 md:gap-4 px-4 sm:px-6 py-3.5 hover:bg-[var(--soft)] transition"
              >
                <button type="button" onClick={() => toggleFav(c.symbol)} className="text-dim hover:text-[var(--gold)]">
                  <Star className={`w-4 h-4 ${isFav ? 'fill-[var(--gold)] text-[var(--gold)]' : ''}`} />
                </button>

                <div className="flex items-center gap-3 min-w-0">
                  <CoinIcon symbol={c.symbol} size={34} />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-main truncate flex items-center gap-1.5">
                      <span>{c.base}</span>
                      <span className="text-dim text-[10px]">/{c.quote || 'USDT'}</span>
                      {c.category && (
                        <span className="px-1.5 py-0.2 rounded bg-sky-500/12 text-brand text-[9px] font-black">
                          {c.category}
                        </span>
                      )}
                    </p>
                    <p dir="ltr" className="text-[10px] text-dim tabular truncate">
                      {(isFa ? c.nameFa || c.nameEn : c.nameEn) ? `${isFa ? c.nameFa || c.nameEn : c.nameEn} · ` : ''}
                      {marketType === 'SPOT' ? 'Spot 1×' : `Max ${c.maxLeverage}×`}
                    </p>
                  </div>
                </div>

                <div className="min-w-0">
                  <span dir="ltr" className="font-num font-bold text-sm tabular text-main block">
                    ${fmtPx(px)}
                  </span>
                  {isFa && px > 0 && (
                    <span className="text-[10px] text-dim tabular block whitespace-nowrap">
                      {formatTomanEq(px, liveIrt)}
                    </span>
                  )}
                </div>

                <span dir="ltr" className={`hidden md:inline-flex items-center gap-1 font-bold text-xs tabular ${up ? 'text-jade' : 'text-loss'}`}>
                  {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {Math.abs(ch).toFixed(2)}%
                </span>

                <div className="hidden md:block w-24 h-7">
                  <Sparkline values={spark} height={26} color={up ? '#10d9a3' : '#ff4d6d'} fill={false} />
                </div>

                <div className="hidden md:flex items-center gap-2">
                  <div className="relative flex-1 h-1.5 rounded-full bg-[var(--soft)] border hairline">
                    <span
                      className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full"
                      style={{
                        left: `calc(${Math.max(4, Math.min(96, pos))}% - 5px)`,
                        background: 'var(--gold)',
                        boxShadow: '0 0 8px var(--gold)',
                      }}
                    />
                  </div>
                </div>

                <span dir="ltr" className={`md:hidden font-bold text-xs tabular ${up ? 'text-jade' : 'text-loss'}`}>
                  {up ? '+' : ''}{ch.toFixed(2)}%
                </span>

                <div className="hidden md:block text-end">
                  <button
                    type="button"
                    onClick={() => onTradeSymbol(c.symbol)}
                    className="inline-flex items-center gap-1 text-[11px] font-black px-3.5 py-2 rounded-xl border transition hover:opacity-90"
                    style={{
                      background: 'color-mix(in srgb, var(--gold) 14%, transparent)',
                      color: 'var(--gold)',
                      borderColor: 'color-mix(in srgb, var(--gold) 35%, transparent)',
                    }}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isFa ? 'معامله' : 'Trade'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onTradeSymbol(c.symbol)}
                  className="md:hidden col-span-4 btn-ghost rounded-xl py-2 text-xs font-black"
                  style={{ color: 'var(--gold)' }}
                >
                  {isFa ? `معامله ${c.base}` : `Trade ${c.base}`}
                </button>
              </div>
            );
          })}

          {list.length === 0 && (
            <div className="py-14 text-center text-dim flex flex-col items-center gap-2 text-xs">
              <TrendingUp className="w-7 h-7" />
              <span>{isFa ? 'ارزی در این دسته پیدا نشد.' : 'No matching pairs.'}</span>
            </div>
          )}
        </div>
      </div>

      {list.length > visibleList.length && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 100)}
            className="btn-gold px-6 py-3 rounded-2xl text-xs font-black"
          >
            {isFa
              ? `نمایش ۱۰۰ ارز بیشتر (${visibleList.length} از ${list.length})`
              : `Load 100 more (${visibleList.length} of ${list.length})`}
          </button>
        </div>
      )}

      <TrustWalletTradePlaybook lang={lang} focusMode={marketType === 'SPOT' ? 'SPOT' : 'FUTURES'} compact />
    </div>
  );
}
