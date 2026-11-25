import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';

function formatSignedCurrency(val: number, decimals = 2): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return val > 0.004 ? `+$${abs}` : val < -0.004 ? `-$${abs}` : `$${abs}`;
}

/* ---------------- Smooth Catmull-Rom Cubic Bezier Helper ---------------- */
function catmullRomSvgPath(pts: Array<{ x: number; y: number }>, tension = 0.25): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  if (pts.length === 2) {
    return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)} L ${pts[1]!.x.toFixed(2)} ${pts[1]!.y.toFixed(2)}`;
  }
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* ---------------- Animated Number ---------------- */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.001) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const duration = 380;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + diff * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{format(display)}</>;
}

/* ---------------- Live Pulse Dot ---------------- */
export function LiveDot({ color = '#16e664', size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full opacity-60 animate-ping"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative rounded-full"
        style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}

/* ---------------- Mini Smooth Bezier Sparkline ---------------- */
export function Sparkline({
  values,
  color = '#10d9a3',
  height = 40,
  fill = true,
  endDot = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  endDot?: boolean;
}) {
  const gid = useId().replace(/:/g, '');
  const src = values.length >= 2 ? values.map((v) => (Number.isFinite(v) ? v : 0)) : [1, 1];
  const w = 160;
  const h = height;
  const min = Math.min(...src);
  const max = Math.max(...src);
  const span = max - min || Math.max(Math.abs(max) * 0.01, 1);
  const pad = 4;
  const pts = src.map((v, i) => ({
    x: (i / (src.length - 1)) * w,
    y: pad + ((max - v) / span) * (h - pad * 2),
  }));
  const d = catmullRomSvgPath(pts, 0.22);
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
      {fill && (
        <defs>
          <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#spk-${gid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      {endDot && (
        <>
          <circle cx={last.x} cy={last.y} r="4.8" fill={color} fillOpacity="0.22" />
          <circle cx={last.x} cy={last.y} r="2.4" fill={color} />
        </>
      )}
    </svg>
  );
}

/* ---------------- Pro TradingView Lightweight-Charts Equity & Backtest AreaChart ---------------- */
export interface EquityCurvePointInput {
  time?: number | string;
  label?: string;
  equity: number;
}

export function AreaChart({
  values,
  points,
  labels,
  compareValues,
  compareLabel = 'Strategy B',
  baseline,
  color,
  tone = 'auto',
  height = 220,
  showHud = true,
  formatValue = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}: {
  values: number[];
  points?: EquityCurvePointInput[];
  labels?: string[];
  compareValues?: number[];
  compareLabel?: string;
  baseline?: number;
  color?: string;
  tone?: 'auto' | 'dark' | 'light';
  height?: number;
  showHud?: boolean;
  formatValue?: (v: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [docLight, setDocLight] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('theme-light') : false
  );

  useEffect(() => {
    if (tone !== 'auto' || typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setDocLight(document.documentElement.classList.contains('theme-light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [tone]);

  const isLight = tone === 'light' ? true : tone === 'dark' ? false : docLight;

  const normalized = useMemo(() => {
    const rawPts: Array<{ time: UTCTimestamp; value: number; label: string }> = [];
    const nowSec = Math.floor(Date.now() / 1000);

    if (points && points.length > 0) {
      let prevTs = 0;
      const stepFallback = 3600;
      const baseStart = nowSec - points.length * stepFallback;
      points.forEach((p, idx) => {
        const val = Number.isFinite(Number(p.equity)) ? Number(p.equity) : 0;
        let ts = 0;
        if (typeof p.time === 'number' && Number.isFinite(p.time) && p.time > 100000) {
          ts = p.time > 1e11 ? Math.floor(p.time / 1000) : Math.floor(p.time);
        } else if (typeof p.time === 'string') {
          const parsed = Date.parse(p.time.includes('T') ? p.time : p.time.replace(' ', 'T') + 'Z');
          if (Number.isFinite(parsed) && parsed > 0) ts = Math.floor(parsed / 1000);
        }
        if (ts <= 0) ts = baseStart + idx * stepFallback;
        if (ts <= prevTs) ts = prevTs + 60;
        prevTs = ts;
        rawPts.push({
          time: ts as UTCTimestamp,
          value: val,
          label: p.label || labels?.[idx] || new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
      });
    } else {
      const safeVals = values.length > 0 ? values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) : [0, 0];
      const step = 3600;
      const startSec = nowSec - safeVals.length * step;
      safeVals.forEach((v, idx) => {
        const ts = (startSec + idx * step) as UTCTimestamp;
        rawPts.push({
          time: ts,
          value: v,
          label: labels?.[idx] || `#${idx + 1}`,
        });
      });
    }

    if (rawPts.length === 1) {
      const only = rawPts[0]!;
      rawPts.unshift({
        time: (Number(only.time) - 3600) as UTCTimestamp,
        value: only.value,
        label: 'Start',
      });
    }

    const basePrice = baseline !== undefined && Number.isFinite(baseline) ? baseline : rawPts[0]!.value;
    const compareSeries =
      compareValues && compareValues.length > 1
        ? rawPts.map((pt, i) => {
            const cIdx = Math.min(compareValues.length - 1, Math.round((i / Math.max(1, rawPts.length - 1)) * (compareValues.length - 1)));
            const cv = Number(compareValues[cIdx] ?? basePrice);
            return { time: pt.time, value: Number.isFinite(cv) ? cv : basePrice };
          })
        : null;

    const lastVal = rawPts[rawPts.length - 1]!.value;
    const delta = lastVal - basePrice;
    const pct = basePrice > 0 ? (delta / basePrice) * 100 : 0;
    const maxVal = Math.max(...rawPts.map((x) => x.value));
    const minVal = Math.min(...rawPts.map((x) => x.value));

    return { rawPts, basePrice, compareSeries, lastVal, delta, pct, maxVal, minVal };
  }, [values, points, labels, compareValues, baseline]);

  const [hoverData, setHoverData] = useState<{
    value: number;
    compare?: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chartHeight = Math.max(88, height - (showHud ? 26 : 0));
    const chart = createChart(el, {
      width: Math.max(240, el.clientWidth || 420),
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isLight ? '#475569' : '#94a3b8',
        fontFamily: 'Inter, Vazirmatn, system-ui, sans-serif',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.06)', style: LineStyle.Dotted },
        horzLines: { color: isLight ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.07)', style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.18, bottom: 0.22 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: {
          color: isLight ? 'rgba(22, 82, 240, 0.4)' : 'rgba(96, 165, 250, 0.45)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? '#1e293b' : '#1652f0',
        },
        horzLine: {
          color: isLight ? 'rgba(22, 82, 240, 0.35)' : 'rgba(96, 165, 250, 0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? '#1e293b' : '#1652f0',
        },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const labelByTime = new Map<number, string>();
    normalized.rawPts.forEach((p) => labelByTime.set(Number(p.time), p.label));

    const useCustomAccent = Boolean(color && color !== '#3b7bff');
    const mainSeries = useCustomAccent
      ? chart.addAreaSeries({
          lineColor: color!,
          topColor: `${color!}44`,
          bottomColor: `${color!}04`,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: !showHud,
        })
      : chart.addBaselineSeries({
          baseValue: { type: 'price', price: normalized.basePrice },
          topLineColor: '#10b981',
          topFillColor1: 'rgba(16, 185, 129, 0.30)',
          topFillColor2: 'rgba(16, 185, 129, 0.02)',
          bottomLineColor: '#f43f5e',
          bottomFillColor1: 'rgba(244, 63, 94, 0.03)',
          bottomFillColor2: 'rgba(244, 63, 94, 0.30)',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: !showHud,
        });

    mainSeries.setData(normalized.rawPts.map((p) => ({ time: p.time, value: p.value })));

    mainSeries.createPriceLine({
      price: normalized.basePrice,
      color: isLight ? 'rgba(100, 116, 139, 0.55)' : 'rgba(148, 163, 184, 0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });

    let compSeries: ReturnType<IChartApi['addLineSeries']> | null = null;
    if (normalized.compareSeries) {
      compSeries = chart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      compSeries.setData(normalized.compareSeries);
    }

    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }
      const d = param.seriesData.get(mainSeries) as { value?: number } | undefined;
      if (!d || typeof d.value !== 'number') {
        setHoverData(null);
        return;
      }
      const cVal = compSeries ? (param.seriesData.get(compSeries) as { value?: number } | undefined)?.value : undefined;
      setHoverData({
        value: d.value,
        compare: typeof cVal === 'number' ? cVal : undefined,
        label: labelByTime.get(Number(param.time)) || '',
      });
    });

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        chart.applyOptions({ width: el.clientWidth });
        chart.timeScale().fitContent();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [normalized, isLight, height, color, showHud]);

  const activeValue = hoverData ? hoverData.value : normalized.lastVal;
  const activeDelta = activeValue - normalized.basePrice;
  const activePct = normalized.basePrice > 0 ? (activeDelta / normalized.basePrice) * 100 : 0;

  return (
    <div className="relative w-full select-none flex flex-col" style={{ height }}>
      {showHud && (
        <div
          dir="ltr"
          className={`flex flex-wrap items-center justify-between gap-2 px-1 pb-1.5 text-[11px] font-mono-num ${
            isLight ? 'text-slate-700' : 'text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black text-xs">{formatValue(activeValue)}</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeDelta >= 0
                  ? isLight
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : 'bg-emerald-500/20 text-emerald-300'
                  : isLight
                    ? 'bg-rose-500/15 text-rose-700'
                    : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {formatSignedCurrency(activeDelta)} ({activePct >= 0 ? '+' : ''}
              {activePct.toFixed(2)}%)
            </span>
            {hoverData?.label && (
              <span className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {hoverData.label}
              </span>
            )}
          </div>

          <div className={`flex items-center gap-3 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {normalized.compareSeries && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-500">
                <span>┈</span>
                <span>
                  {compareLabel}: {hoverData?.compare !== undefined ? formatValue(hoverData.compare) : formatValue(normalized.compareSeries[normalized.compareSeries.length - 1]!.value)}
                </span>
              </span>
            )}
            <span className="hidden sm:inline">Peak {formatValue(normalized.maxVal)}</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full flex-1 min-h-[70px]" />
    </div>
  );
}

/* ---------------- Progress Ring Gauge ---------------- */
export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
  color = '#16e664',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.11"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
}

/* ---------------- Consensus Semi-Gauge ---------------- */
export function ConsensusGauge({
  value,
  longLabel = 'LONG',
  shortLabel = 'SHORT',
}: {
  value: number;
  longLabel?: string;
  shortLabel?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const v = Math.max(0, Math.min(100, value));
  const angle = -90 + (v / 100) * 180;
  const label = v >= 58 ? longLabel : v <= 42 ? shortLabel : 'NEUTRAL';
  const labelColor = v >= 58 ? '#16e664' : v <= 42 ? '#ff5b76' : '#e8c15a';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-[220px] overflow-visible">
        <defs>
          <linearGradient id={`cg-${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff5b76" />
            <stop offset="50%" stopColor="#e8c15a" />
            <stop offset="100%" stopColor="#16e664" />
          </linearGradient>
        </defs>
        <path
          d="M 20 98 A 80 80 0 0 1 180 98"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.1"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 98 A 80 80 0 0 1 180 98"
          fill="none"
          stroke={`url(#cg-${gid})`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <g transform={`translate(100,98) rotate(${angle})`} style={{ transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <line x1="0" y1="0" x2="0" y2="-62" stroke={labelColor} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="6" fill={labelColor} />
        </g>
      </svg>
      <div className="-mt-2 flex w-full items-center justify-between text-[11px] font-bold">
        <span className="text-loss">{shortLabel}</span>
        <span dir="ltr" className="font-mono-num text-sm font-black" style={{ color: labelColor }}>
          {Math.round(v)}% · {label}
        </span>
        <span className="text-signal">{longLabel}</span>
      </div>
    </div>
  );
}

/* ---------------- Allocation Donut ---------------- */
export function DonutChart({
  segments,
  size = 152,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + Math.max(0, x.value), 0));
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={stroke} />
      {segments.map((seg) => {
        const len = (Math.max(0, seg.value) / total) * c;
        const dash = `${Math.max(0, len - 3)} ${c}`;
        const dashOffset = -acc;
        acc += len;
        return (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        );
      })}
    </svg>
  );
}

/* ---------------- Interactive Profit Bar Chart ---------------- */
export function ProfitBars({
  data,
  height = 170,
  format = (v: number) => `$${Math.abs(v).toFixed(0)}`,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  format?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className="flex items-end gap-2 pt-6" style={{ height }}>
      {data.map((item, i) => {
        const pct = Math.max(10, Math.round((Math.abs(item.value) / maxAbs) * 100));
        const pos = item.value >= 0;
        const isHi = hovered === i;
        return (
          <div
            key={`${item.label}-${i}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="relative flex-1 flex flex-col items-center h-full justify-end group"
          >
            {isHi && (
              <div
                dir="ltr"
                className="absolute -top-2 z-10 rounded-lg bg-[#091229] text-white border border-white/15 px-2 py-0.5 text-[10px] font-mono-num font-bold whitespace-nowrap shadow"
              >
                {item.value >= 0 ? '+' : '-'}
                {format(Math.abs(item.value)).replace(/^[+-]/, '')}
              </div>
            )}
            <div className="w-full flex items-end justify-center flex-1">
              <div
                className="w-full max-w-[34px] rounded-t-xl transition-all duration-300"
                style={{
                  height: `${pct}%`,
                  background: pos
                    ? isHi
                      ? 'linear-gradient(180deg, #d9f75c, #16e664)'
                      : 'linear-gradient(180deg, #3b7bff, rgba(59,123,255,0.42))'
                    : 'linear-gradient(180deg, #ff5b76, rgba(255,91,118,0.35))',
                  boxShadow: isHi ? '0 0 18px rgba(59,123,255,0.45)' : undefined,
                }}
              />
            </div>
            <span className="mt-2 text-[10px] font-bold text-dim truncate max-w-full">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
