import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpDown, ArrowUpRight, Flame, Search, Star, TrendingUp, Zap } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import type { ExchangeMarket } from '../components/SymbolPickerModal';
import { CoinIcon } from '../components/CoinIcon';
import { Sparkline } from '../components/DollarinoViz';

function fmtPx(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  if (px >= 1000) return px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(3);
  return px.toFixed(5);
}

const MAJOR_BASES = new Set(['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK', 'TON', 'SUI']);
const MEME_BASES = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'BOME', 'MEME']);

export function MarketsPage({
  lang,
  uiMode = 'pro',
  markets,
  onTradeSymbol,
}: {
  lang: Lang;
  uiMode?: 'simple' | 'pro';
  markets: ExchangeMarket[];
  onTradeSymbol: (sym: string) => void;
}) {
  const isFa = lang === 'fa';
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | 'favs' | 'layer1' | 'meme'>('all');
  const [sortBy, setSortBy] = useState<'volume' | 'gainers' | 'losers'>('volume');
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
    else if (category === 'layer1') arr = arr.filter((m) => MAJOR_BASES.has(m.base));
    else if (category === 'meme') arr = arr.filter((m) => MEME_BASES.has(m.base));
    if (query) {
      arr = arr.filter((m) => m.symbol.includes(query) || m.base.includes(query));
    }
    if (sortBy === 'gainers') arr.sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    else if (sortBy === 'losers') arr.sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    return arr.slice(0, 75);
  }, [markets, q, sortBy, category, favs]);

  if (uiMode === 'simple') {
    const topList = list.slice(0, 18);
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--gold-soft)' }}>
              {isFa ? 'قیمت زنده ارزها · بدون اصطلاح پیچیده' : 'LIVE COIN PRICES'}
            </p>
            <h2 className="font-display font-bold text-3xl text-main">
              {isFa ? 'انتخاب ارز برای معامله آسان 🪙' : 'Pick a Coin to Trade 🪙'}
            </h2>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isFa ? 'مثلاً BTC یا SOL...' : 'Search BTC, ETH, SOL...'}
              className="field ps-10 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['all', isFa ? 'همه ارزهای برتر' : 'Popular Coins'],
            ['favs', isFa ? '★ مورد علاقه‌ها' : '★ Favorites'],
            ['layer1', isFa ? 'ارزهای معتبر (BTC/ETH...)' : 'Top Majors'],
            ['meme', isFa ? 'میم‌کوین‌ها (DOGE/PEPE...)' : 'Meme Coins'],
          ].map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k as typeof category)}
              className={`px-4 py-2 rounded-2xl text-xs font-black transition ${
                category === k ? 'ios-pill-active' : 'panel text-sub'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {topList.map((c) => {
            const px = Number(c.lastPrice || 0);
            const ch = Number(c.changePct24h || 0);
            const up = ch >= 0;
            const isFav = favs.includes(c.symbol);
            return (
              <div key={c.symbol} className="panel rounded-[26px] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CoinIcon symbol={c.symbol} size={40} />
                    <div>
                      <p className="font-display font-bold text-base text-main">{c.base}</p>
                      <p className="text-[11px] text-dim">{up ? (isFa ? 'امروز سبز بوده 📈' : 'Up today 📈') : isFa ? 'امروز افت داشته 📉' : 'Down today 📉'}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleFav(c.symbol)} className="text-dim hover:text-[var(--gold)]">
                    <Star className={`w-4 h-4 ${isFav ? 'fill-[var(--gold)] text-[var(--gold)]' : ''}`} />
                  </button>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-dim">{isFa ? 'قیمت فعلی' : 'Price'}</p>
                    <p dir="ltr" className="font-display font-bold text-xl tabular text-main">${fmtPx(px)}</p>
                  </div>
                  <span
                    dir="ltr"
                    className={`px-3 py-1 rounded-full text-xs font-black tabular ${
                      up ? 'bg-[#12E35D]/15 text-jade' : 'bg-rose-500/15 text-loss'
                    }`}
                  >
                    {up ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onTradeSymbol(c.symbol)}
                  className="btn-cobalt w-full py-3 rounded-2xl text-xs font-black"
                >
                  {isFa ? `شروع معامله ${c.base} ⚡` : `Trade ${c.base} ⚡`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--gold)' }}>
            <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
            <span>LIVE MARKET UNIVERSE</span>
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {isFa ? `بازارهای فیوچرز (${markets.length} جفت‌ارز)` : `Perpetual Markets (${markets.length})`}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isFa ? 'جستجوی ارز...' : 'Search coin...'}
              className="field ps-10 text-xs sm:w-52"
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

      {/* Kifpool-inspired Global Market Pulse Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="panel rounded-2xl p-3.5 space-y-1.5">
          <span className="text-dim">{isFa ? 'شاخص مومنتوم بازار' : 'Market Breadth'}</span>
          <div className="flex items-center justify-between font-bold">
            <span className="text-main">{stats.sentiment}% {isFa ? 'سبز' : 'Bullish'}</span>
            <Flame className="w-4 h-4 text-flame" />
          </div>
          <div className="h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
            <div className="h-full bg-jade rounded-full" style={{ width: `${stats.sentiment}%` }} />
          </div>
        </div>
        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'ارزهای صعودی' : 'Gainers'}</span>
          <p dir="ltr" className="font-display font-bold text-xl text-jade mt-1">{stats.green}</p>
        </div>
        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'ارزهای نزولی' : 'Decliners'}</span>
          <p dir="ltr" className="font-display font-bold text-xl text-loss mt-1">{stats.red}</p>
        </div>
        <div className="panel rounded-2xl p-3.5">
          <span className="text-dim">{isFa ? 'علاقه‌مندی‌های من' : 'My Watchlist'}</span>
          <p dir="ltr" className="font-display font-bold text-xl text-goldsoft mt-1">{favs.length} ★</p>
        </div>
      </div>

      {/* Category Filter Pills (Kifpool Markets) */}
      <div className="flex flex-wrap gap-2">
        {[
          ['all', isFa ? 'همه ارزها' : 'All Pairs'],
          ['favs', isFa ? '★ علاقه‌مندی‌ها' : '★ Favorites'],
          ['layer1', isFa ? 'برترین‌های لایه ۱' : 'Layer 1 Majors'],
          ['meme', isFa ? 'میم‌کوین‌ها' : 'Meme Coins'],
        ].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setCategory(k as typeof category)}
            className={`px-4 py-2 rounded-full text-xs font-black transition ${
              category === k ? 'btn-gold' : 'panel text-dim hover:text-main'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div className="panel rounded-[26px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[auto_1.4fr_1fr_.9fr_1fr_1fr_.7fr] gap-4 px-6 py-3.5 text-[10px] font-black tracking-[0.15em] text-dim uppercase border-b hairline">
          <span>★</span>
          <span>{isFa ? 'نماد' : 'ASSET'}</span>
          <span>{isFa ? 'قیمت' : 'PRICE'}</span>
          <span>{isFa ? '۲۴ ساعت' : '24H CHG'}</span>
          <span>{isFa ? 'روند' : 'TREND'}</span>
          <span>{isFa ? 'محدوده روز' : '24H RANGE'}</span>
          <span></span>
        </div>

        <div className="divide-y hairline">
          {list.map((c) => {
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
                className="grid grid-cols-[auto_1.5fr_1fr_auto] md:grid-cols-[auto_1.4fr_1fr_.9fr_1fr_1fr_.7fr] items-center gap-3 md:gap-4 px-4 sm:px-6 py-3.5 hover:bg-[var(--soft)] transition"
              >
                <button type="button" onClick={() => toggleFav(c.symbol)} className="text-dim hover:text-[var(--gold)]">
                  <Star className={`w-4 h-4 ${isFav ? 'fill-[var(--gold)] text-[var(--gold)]' : ''}`} />
                </button>

                <div className="flex items-center gap-3 min-w-0">
                  <CoinIcon symbol={c.symbol} size={34} />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-main truncate">
                      {c.base}
                      <span className="text-dim text-[10px]"> /USDT</span>
                    </p>
                    <p dir="ltr" className="text-[10px] text-dim tabular">
                      Max {c.maxLeverage}×
                    </p>
                  </div>
                </div>

                <span dir="ltr" className="font-num font-bold text-sm tabular text-main">
                  ${fmtPx(px)}
                </span>

                <span dir="ltr" className={`hidden md:inline-flex items-center gap-1 font-bold text-xs tabular ${up ? 'text-jade' : 'text-loss'}`}>
                  {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {Math.abs(ch).toFixed(2)}%
                </span>

                <div className="hidden md:block w-24 h-7">
                  <Sparkline values={spark} height={26} color={up ? '#10d9a3' : '#ff4d6d'} fill={false} />
                </div>

                <div className="hidden md:flex items-center gap-2">
                  <div className="relative flex-1 h-1.5 rounded-full bg-white/10">
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
    </div>
  );
}
