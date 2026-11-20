import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpDown, ArrowUpRight, Search, TrendingUp, Zap } from 'lucide-react';
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

export function MarketsPage({
  lang,
  markets,
  onTradeSymbol,
}: {
  lang: Lang;
  markets: ExchangeMarket[];
  onTradeSymbol: (sym: string) => void;
}) {
  const isFa = lang === 'fa';
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'gainers' | 'losers'>('volume');

  const list = useMemo(() => {
    const query = q.trim().toUpperCase();
    let arr = [...markets];
    if (query) {
      arr = arr.filter((m) => m.symbol.includes(query) || m.base.includes(query));
    }
    if (sortBy === 'gainers') arr.sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    else if (sortBy === 'losers') arr.sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    return arr.slice(0, 60);
  }, [markets, q, sortBy]);

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
          <p className="text-xs sm:text-sm text-dim mt-1">
            {isFa
              ? 'تمام نمادها با قیمت زنده؛ روی هر ارز کلیک کنید تا مستقیم در پایانه معاملاتی باز شود.'
              : 'Live perpetual futures across major & mid-cap coins — click any pair to trade.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isFa ? 'جستجوی نماد...' : 'Search coin...'}
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

      <div className="panel rounded-[26px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.4fr_1fr_.9fr_1fr_1fr_.7fr] gap-4 px-6 py-3.5 text-[10px] font-black tracking-[0.15em] text-dim uppercase border-b hairline">
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
            return (
              <div
                key={c.symbol}
                className="grid grid-cols-[1.5fr_1fr_auto] md:grid-cols-[1.4fr_1fr_.9fr_1fr_1fr_.7fr] items-center gap-3 md:gap-4 px-4 sm:px-6 py-3.5 hover:bg-[var(--soft)] transition"
              >
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

                <span
                  dir="ltr"
                  className={`hidden md:inline-flex items-center gap-1 font-bold text-xs tabular ${up ? 'text-jade' : 'text-loss'}`}
                >
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
                  className="md:hidden col-span-3 btn-ghost rounded-xl py-2 text-xs font-black"
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
              <span>{isFa ? 'ارزی با این نام پیدا نشد.' : 'No matching pairs.'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
