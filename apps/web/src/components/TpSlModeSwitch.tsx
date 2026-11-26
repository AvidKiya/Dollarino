import type { TpSlInputMode } from '../lib/tpsl';

export function TpSlModeSwitch({
  mode,
  onChange,
  isFa,
  compact = false,
}: {
  mode: TpSlInputMode;
  onChange: (next: TpSlInputMode) => void;
  isFa: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-[var(--soft)] border hairline p-0.5 ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
      role="group"
      aria-label={isFa ? 'حالت ورود حد سود و ضرر' : 'TP/SL Input Mode'}
    >
      <button
        type="button"
        onClick={() => onChange('PRICE')}
        data-testid="tpsl-mode-price"
        className={`px-2 py-0.5 rounded-lg font-bold transition ${
          mode === 'PRICE'
            ? 'bg-[#1E293B] text-white shadow-sm'
            : 'text-dim hover:text-main'
        }`}
      >
        {isFa ? 'قیمت ($)' : 'Price ($)'}
      </button>
      <button
        type="button"
        onClick={() => onChange('PCT')}
        data-testid="tpsl-mode-pct"
        className={`px-2 py-0.5 rounded-lg font-bold transition ${
          mode === 'PCT'
            ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
            : 'text-dim hover:text-main'
        }`}
      >
        {isFa ? 'درصد (%)' : 'Percent (%)'}
      </button>
    </div>
  );
}
