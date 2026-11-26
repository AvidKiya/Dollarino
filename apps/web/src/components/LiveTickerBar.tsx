import type { CSSProperties } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { CoinIcon } from './CoinIcon';

export interface LiveTickerItem {
  symbol: string;
  base?: string;
  price: number;
  changePct24h: number;
}

function formatTickerPrice(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '$—';
  if (px >= 1000) return `$${px.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (px >= 1) return `$${px.toFixed(3)}`;
  if (px >= 0.01) return `$${px.toFixed(4)}`;
  return `$${px.toFixed(6)}`;
}

export function LiveTickerBar({
  items,
  selectedSymbol,
  onSelectCoin,
  compact = false,
  className = '',
}: {
  items: LiveTickerItem[];
  selectedSymbol?: string | null;
  onSelectCoin?: (symbol: string) => void;
  compact?: boolean;
  className?: string;
}) {
  if (!items.length) return null;

  // Ensure a single lane always holds >= 16 items so Track A > widest monitor
  // and Track A + Track B wrap seamlessly with zero empty white gap.
  const minItemsPerLane = 16;
  const repeatCount = Math.max(1, Math.ceil(minItemsPerLane / items.length));
  const singleLane: LiveTickerItem[] = [];
  for (let r = 0; r < repeatCount; r += 1) {
    singleLane.push(...items);
  }

  const durationSec = Math.max(28, Math.round(singleLane.length * 2.4));
  const trackStyle = { '--ticker-duration': `${durationSec}s` } as CSSProperties;

  const renderLane = (laneKey: 'a' | 'b', ariaHidden: boolean) => (
    <div
      key={laneKey}
      aria-hidden={ariaHidden}
      className="flex items-center shrink-0"
    >
      {singleLane.map((item, idx) => {
        const base = item.base || item.symbol.replace(/USDT$/i, '');
        const up = item.changePct24h >= 0;
        const active = selectedSymbol && selectedSymbol.toUpperCase() === item.symbol.toUpperCase();
        return (
          <button
            key={`${laneKey}-${item.symbol}-${idx}`}
            type="button"
            tabIndex={ariaHidden ? -1 : 0}
            onClick={() => onSelectCoin?.(item.symbol)}
            data-ticker-symbol={item.symbol}
            title={`${item.symbol} · ${formatTickerPrice(item.price)}`}
            className={`group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 ${
              compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs'
            } font-semibold whitespace-nowrap border-e hairline transition-colors cursor-pointer ${
              active
                ? 'bg-[color:color-mix(in_srgb,var(--gold)_14%,transparent)] text-main'
                : 'hover:bg-[var(--soft)]'
            }`}
          >
            <CoinIcon symbol={item.symbol} size={compact ? 15 : 17} />
            <span className="font-black text-main group-hover:text-[var(--gold)] transition-colors">{base}</span>
            <span className="font-num tabular text-sub">{formatTickerPrice(item.price)}</span>
            <span
              className={`font-num tabular font-black inline-flex items-center gap-0.5 ${
                up ? 'text-jade' : 'text-loss'
              }`}
            >
              {up ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
              <span>
                {up ? '+' : ''}
                {item.changePct24h.toFixed(2)}%
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      dir="ltr"
      data-testid="live-ticker-bar"
      className={`w-full overflow-hidden ticker-edge-fade select-none ${className}`}
    >
      <div className="animate-ticker items-center" style={trackStyle}>
        {renderLane('a', false)}
        {renderLane('b', true)}
      </div>
    </div>
  );
}
