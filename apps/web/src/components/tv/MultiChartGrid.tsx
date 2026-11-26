import { useEffect, useState } from 'react';
import { Columns2, LayoutGrid, Maximize2, RefreshCw, Square } from 'lucide-react';
import type { Candle, Timeframe } from '@dollarino/core';
import { apiFetch } from '../../lib/api';
import type { Lang } from '../../lib/i18n';
import { CandlestickChart } from '../CandlestickChart';
import { CoinIcon } from '../CoinIcon';
import { SymbolPicker, type ExchangeMarket } from '../SymbolPickerModal';

interface MultiPaneConfig {
  id: string;
  symbol: string;
  timeframe: Timeframe;
}

interface PaneOverview {
  candles: Candle[];
  market24h?: {
    lastPrice?: string;
    changePct24h?: string;
  };
  indicators?: {
    ema20?: Array<{ time: number; value: number }>;
    ema50?: Array<{ time: number; value: number }>;
  };
}

const MULTI_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

function MultiPaneCell({
  lang,
  pane,
  markets,
  isActiveSymbol,
  height,
  onSelectSymbol,
  onUpdatePane,
}: {
  lang: Lang;
  pane: MultiPaneConfig;
  markets: ExchangeMarket[];
  isActiveSymbol: boolean;
  height: number;
  onSelectSymbol: (sym: string) => void;
  onUpdatePane: (next: MultiPaneConfig) => void;
}) {
  const isFa = lang === 'fa';
  const [data, setData] = useState<PaneOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async () => {
      const ov = await apiFetch<PaneOverview>(
        `/api/trading/market/overview?symbol=${pane.symbol}&timeframe=${pane.timeframe}`
      ).catch(() => null);
      if (alive) {
        if (ov) setData(ov);
        setLoading(false);
      }
    };
    void load();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load();
    }, 35_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [pane.symbol, pane.timeframe]);

  const px = Number(data?.market24h?.lastPrice || 0);
  const chg = Number(data?.market24h?.changePct24h || 0);

  return (
    <div
      onClick={() => onSelectSymbol(pane.symbol)}
      className={`rounded-2xl border p-2.5 space-y-2 transition cursor-pointer ${
        isActiveSymbol
          ? 'border-[var(--gold)] bg-[var(--soft)]/80 shadow-md'
          : 'hairline bg-[var(--soft)]/45 hover:border-[var(--gold)]/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <SymbolPicker
            lang={lang}
            compact
            provider="paper"
            markets={markets}
            value={pane.symbol}
            onChange={(sym) => onUpdatePane({ ...pane, symbol: sym })}
          />
          <select
            value={pane.timeframe}
            onChange={(e) => onUpdatePane({ ...pane, timeframe: e.target.value as Timeframe })}
            className="field py-1 px-2 text-[11px] font-num font-bold"
          >
            {MULTI_TIMEFRAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {px > 0 && (
            <span dir="ltr" className={`font-num font-black ${chg >= 0 ? 'text-jade' : 'text-loss'}`}>
              ${px >= 1000 ? px.toLocaleString('en-US', { maximumFractionDigits: 2 }) : px.toFixed(4)} ({chg >= 0 ? '+' : ''}
              {chg.toFixed(2)}%)
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelectSymbol(pane.symbol)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1 ${
              isActiveSymbol ? 'btn-gold' : 'surface-soft text-dim hover:text-main'
            }`}
          >
            <CoinIcon symbol={pane.symbol} size={12} />
            <span>{isActiveSymbol ? (isFa ? 'فعال' : 'Active') : isFa ? 'انتخاب' : 'Trade'}</span>
          </button>
        </div>
      </div>

      {data?.candles?.length ? (
        <CandlestickChart
          candles={data.candles}
          overlays={data.indicators}
          showVolume
          height={height}
        />
      ) : (
        <div style={{ height }} className="grid place-items-center text-xs text-dim">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin text-[var(--gold)]" /> : 'No candles'}
        </div>
      )}
    </div>
  );
}

export function MultiChartGrid({
  lang,
  primarySymbol,
  primaryTimeframe,
  layoutMode,
  markets,
  onSelectSymbol,
  onChangeLayoutMode,
}: {
  lang: Lang;
  primarySymbol: string;
  primaryTimeframe: Timeframe;
  layoutMode: '2x1' | '2x2';
  markets: ExchangeMarket[];
  onSelectSymbol: (sym: string) => void;
  onChangeLayoutMode: (m: '1x1' | '2x1' | '2x2') => void;
}) {
  const isFa = lang === 'fa';
  const [panes, setPanes] = useState<MultiPaneConfig[]>([
    { id: 'p1', symbol: primarySymbol, timeframe: primaryTimeframe },
    { id: 'p2', symbol: primarySymbol === 'ETHUSDT' ? 'BTCUSDT' : 'ETHUSDT', timeframe: '1h' },
    { id: 'p3', symbol: 'SOLUSDT', timeframe: '15m' },
    { id: 'p4', symbol: 'BNBUSDT', timeframe: '4h' },
  ]);

  useEffect(() => {
    setPanes((prev) => [{ ...prev[0]!, symbol: primarySymbol, timeframe: primaryTimeframe }, ...prev.slice(1)]);
  }, [primarySymbol, primaryTimeframe]);

  const visiblePanes = layoutMode === '2x1' ? panes.slice(0, 2) : panes.slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="surface-soft border hairline rounded-2xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-main">
          <LayoutGrid className="w-4 h-4 text-[var(--gold)]" />
          <span>
            {isFa
              ? `حالت چندچارت همزمان (${layoutMode === '2x1' ? '۲ چارت' : '۴ چارت'}) — کلیک روی هر چارت، نماد فرم سفارش را تغییر می‌دهد`
              : `Multi-Chart Sync View (${layoutMode}) — click any pane to sync Order Ticket`}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-[var(--panel)] p-0.5 rounded-xl border hairline">
          {[
            { id: '1x1' as const, label: '1×1', icon: Square },
            { id: '2x1' as const, label: '2×1', icon: Columns2 },
            { id: '2x2' as const, label: '2×2', icon: LayoutGrid },
          ].map((ly) => {
            const Icon = ly.icon;
            return (
              <button
                key={ly.id}
                type="button"
                onClick={() => onChangeLayoutMode(ly.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-num font-bold inline-flex items-center gap-1 transition ${
                  layoutMode === ly.id ? 'btn-gold' : 'text-dim hover:text-main'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{ly.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChangeLayoutMode('1x1')}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-brand hover:underline inline-flex items-center gap-1"
          >
            <Maximize2 className="w-3 h-3" />
            <span>{isFa ? 'بازگشت به تک‌چارت کامل' : 'Single Superchart'}</span>
          </button>
        </div>
      </div>

      <div className={`grid gap-3 ${layoutMode === '2x1' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {visiblePanes.map((pane, idx) => (
          <MultiPaneCell
            key={pane.id}
            lang={lang}
            pane={pane}
            markets={markets}
            isActiveSymbol={pane.symbol === primarySymbol}
            height={layoutMode === '2x1' ? 400 : 270}
            onSelectSymbol={onSelectSymbol}
            onUpdatePane={(next) =>
              setPanes((prev) => prev.map((item, i) => (i === idx ? next : item)))
            }
          />
        ))}
      </div>
    </div>
  );
}
