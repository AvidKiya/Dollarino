import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ProDropdownOption<T extends string = string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
}

export interface ProDropdownProps<T extends string = string> {
  value: T;
  options: ProDropdownOption<T>[];
  onChange: (next: T) => void;
  icon?: React.ReactNode;
  prefix?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: 'start' | 'end';
  className?: string;
  buttonClassName?: string;
  menuMinWidthClass?: string;
  ariaLabel?: string;
}

export function ProDropdown<T extends string = string>({
  value,
  options,
  onChange,
  icon,
  prefix,
  placeholder = '',
  disabled = false,
  align = 'start',
  className = '',
  buttonClassName = '',
  menuMinWidthClass = 'min-w-[210px]',
  ariaLabel,
}: ProDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || prefix || active?.label || placeholder}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`h-9 sm:h-10 px-3 rounded-xl border hairline surface-soft hover:border-[var(--line-strong)] inline-flex items-center justify-between gap-2 text-[11px] sm:text-xs font-bold text-main transition select-none disabled:opacity-50 w-full ${
          open ? 'ring-2 ring-blue-500/30 border-blue-500/50' : ''
        } ${buttonClassName}`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          {icon && <span className="shrink-0 flex items-center text-dim">{icon}</span>}
          {prefix && <span className="text-dim font-semibold shrink-0">{prefix}</span>}
          <span className="truncate font-extrabold text-main">{active?.label || placeholder}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-dim shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-brand' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-[90] mt-1.5 ${align === 'end' ? 'end-0' : 'start-0'} ${menuMinWidthClass} max-w-[90vw] max-h-72 overflow-y-auto rounded-2xl panel border border-[var(--line-strong)] shadow-2xl p-1.5 backdrop-blur-xl tab-enter`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-xl text-start text-[11px] sm:text-xs font-bold flex items-center justify-between gap-2.5 transition ${
                  isSelected
                    ? 'bg-[#0D47A1] text-white shadow-sm'
                    : 'text-main hover:bg-black/5 dark:hover:bg-white/8'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className={`block text-[10px] mt-0.5 truncate ${isSelected ? 'text-white/75' : 'text-dim'}`}>
                      {opt.sublabel}
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                        isSelected ? 'bg-white/20 text-white' : 'surface-soft text-dim'
                      }`}
                    >
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface SlidingSwitchProps {
  checked: boolean;
  onChange?: (next: boolean) => void;
  accent?: 'emerald' | 'cobalt' | 'amber' | 'violet' | 'cyan';
  size?: 'sm' | 'md';
  disabled?: boolean;
  ariaLabel?: string;
  readOnlyVisual?: boolean;
}

const SWITCH_BG: Record<NonNullable<SlidingSwitchProps['accent']>, string> = {
  emerald: 'bg-[#059669]',
  cobalt: 'bg-[#0D47A1]',
  amber: 'bg-[#F97316]',
  violet: 'bg-[#7C3AED]',
  cyan: 'bg-[#0284C7]',
};

export const SlidingSwitch: React.FC<SlidingSwitchProps> = ({
  checked,
  onChange,
  accent = 'emerald',
  size = 'md',
  disabled = false,
  ariaLabel,
  readOnlyVisual = false,
}) => {
  const trackCls = size === 'sm' ? 'w-9 h-5 p-0.5' : 'w-11 h-6 p-0.5';
  const knobCls = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const moveCls = checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0';

  const trackBody = (
    <span
      dir="ltr"
      className={`relative inline-flex items-center rounded-full transition-colors duration-200 shrink-0 ${trackCls} ${
        checked
          ? `${SWITCH_BG[accent]} shadow-inner`
          : 'bg-slate-300 dark:bg-white/15 border border-black/10 dark:border-white/15'
      }`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow-md transform transition-transform duration-200 ease-out ${knobCls} ${moveCls}`}
      />
    </span>
  );

  if (readOnlyVisual) {
    return trackBody;
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-full disabled:opacity-50 cursor-pointer"
    >
      {trackBody}
    </button>
  );
};
