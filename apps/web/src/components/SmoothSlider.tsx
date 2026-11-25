import React from 'react';

export interface SmoothSliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (nextVal: number) => void;
  dir?: 'ltr' | 'rtl';
  accent?: 'cobalt' | 'amber' | 'jade';
  className?: string;
  ariaLabel?: string;
}

const ACCENT_TRACK: Record<NonNullable<SmoothSliderProps['accent']>, string> = {
  cobalt: 'linear-gradient(90deg, #1652f0 0%, #38bdf8 100%)',
  amber: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
  jade: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
};

const ACCENT_BORDER: Record<NonNullable<SmoothSliderProps['accent']>, string> = {
  cobalt: '#1652f0',
  amber: '#f59e0b',
  jade: '#10b981',
};

export const SmoothSlider: React.FC<SmoothSliderProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  dir = 'ltr',
  accent = 'cobalt',
  className = '',
  ariaLabel,
}) => {
  const safeSpan = Math.max(1e-6, max - min);
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const pct = Math.min(100, Math.max(0, ((clamped - min) / safeSpan) * 100));

  return (
    <div dir={dir} className={`relative flex items-center w-full h-6 select-none ${className}`}>
      {/* Base Track */}
      <div
        className="absolute inset-x-0 h-2 rounded-full pointer-events-none"
        style={{ background: 'var(--line, rgba(148, 163, 184, 0.25))' }}
      />
      {/* Active Fill synced strictly with thumb position */}
      <div
        className="absolute start-0 h-2 rounded-full pointer-events-none"
        style={{
          width: `${pct}%`,
          background: ACCENT_TRACK[accent],
        }}
      />
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
        className="smooth-range-input relative z-10 w-full cursor-pointer"
        style={{ ['--gold' as string]: ACCENT_BORDER[accent] }}
      />
    </div>
  );
};
