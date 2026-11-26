import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, LineType, type IChartApi, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts';
import type {
  Candle,
  CustomBarColor,
  CustomBgBand,
  CustomChartBox,
  CustomChartLabel,
  CustomChartLine,
  CustomChartPolyline,
  CustomChartTable,
  CustomFillZone,
  CustomHLine,
  CustomPlotSeries,
  PineConsoleLog,
  PineInputMeta,
} from '@dollarino/core';

export interface ChartLevels {
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  supports?: number[];
  resistances?: number[];
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface KbosChartOverlays {
  closeSeriesAlt?: IndicatorPoint[];
  openSeriesAlt?: IndicatorPoint[];
  demaAtr?: Array<{ time: number; value: number; trend: 'BULL' | 'BEAR' }>;
  almaRibbon?: {
    bands: Array<{ label: string; color: string; points: IndicatorPoint[] }>;
  };
  markers?: Array<{
    time: number;
    position: 'belowBar' | 'aboveBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown';
    text: string;
  }>;
}

export interface ChartOverlays {
  ema20?: IndicatorPoint[];
  ema50?: IndicatorPoint[];
  ema200?: IndicatorPoint[];
}

export interface CustomStrategyChartOverlay {
  id?: string;
  title: string;
  language?: 'pine' | 'python' | 'visual';
  pineVersion?: 4 | 5 | 6;
  scriptKind?: 'indicator' | 'strategy' | 'library';
  overlay?: boolean;
  plots: CustomPlotSeries[];
  markers: Array<{
    time: number;
    position: 'belowBar' | 'aboveBar' | 'inBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
    text: string;
  }>;
  hlines?: CustomHLine[];
  fills?: CustomFillZone[];
  bgcolors?: CustomBgBand[];
  barcolors?: CustomBarColor[];
  labels?: CustomChartLabel[];
  lines?: CustomChartLine[];
  boxes?: CustomChartBox[];
  tables?: CustomChartTable[];
  polylines?: CustomChartPolyline[];
  logs?: PineConsoleLog[];
  inputs?: PineInputMeta[];
  alertsTriggered?: Array<{ time: number; message: string }>;
}

function toLwLineStyle(style?: 'solid' | 'dashed' | 'dotted'): LineStyle {
  if (style === 'dotted') return LineStyle.Dotted;
  if (style === 'dashed') return LineStyle.Dashed;
  return LineStyle.Solid;
}

function svgDash(style?: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (style === 'dashed') return '6 4';
  if (style === 'dotted') return '2 3';
  return undefined;
}

function tablePosClass(pos: CustomChartTable['position']): string {
  switch (pos) {
    case 'top_left':
      return 'top-2.5 left-2.5';
    case 'bottom_left':
      return 'bottom-8 left-2.5';
    case 'bottom_right':
      return 'bottom-8 right-16';
    case 'top_center':
      return 'top-2.5 left-1/2 -translate-x-1/2';
    case 'bottom_center':
      return 'bottom-8 left-1/2 -translate-x-1/2';
    case 'middle_left':
      return 'top-1/2 -translate-y-1/2 left-2.5';
    case 'middle_right':
      return 'top-1/2 -translate-y-1/2 right-16';
    default:
      return 'top-2.5 right-16';
  }
}

export function CandlestickChart({
  candles,
  levels,
  overlays,
  kbosOverlays,
  customOverlays,
  showVolume = true,
  height = 420,
}: {
  candles: Candle[];
  levels?: ChartLevels;
  overlays?: ChartOverlays;
  kbosOverlays?: KbosChartOverlays;
  customOverlays?: CustomStrategyChartOverlay | null;
  showVolume?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgOverlayRef = useRef<SVGSVGElement>(null);
  const subPaneRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  const [showKbosHtf, setShowKbosHtf] = useState(true);
  const [showDemaAtr, setShowDemaAtr] = useState(true);
  const [showAlmaRibbon, setShowAlmaRibbon] = useState(true);
  const [showEmas, setShowEmas] = useState(false);
  const [showCustomOverlay, setShowCustomOverlay] = useState(true);
  const [showTvGraphics, setShowTvGraphics] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  const hasSubPane = Boolean(showCustomOverlay && customOverlays?.plots?.some((p) => p.overlay === false && p.points.length));

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('theme-light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dedupAsc = <T extends { time: number | Time }>(arr: T[]): T[] => {
      const m = new Map<number, T>();
      for (const item of arr) {
        const t = Number(item.time);
        if (Number.isFinite(t)) m.set(t, item);
      }
      return Array.from(m.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v);
    };

    const chart = createChart(el, {
      width: Math.max(280, el.clientWidth || 600),
      height,
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#060c1c' },
        textColor: isLight ? '#4b6491' : '#96a9cf',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(12, 68, 200, 0.06)' : 'rgba(120, 165, 255, 0.06)' },
        horzLines: { color: isLight ? 'rgba(12, 68, 200, 0.06)' : 'rgba(120, 165, 255, 0.06)' },
      },
      crosshair: { mode: 1 },
      timeScale: {
        timeVisible: true,
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
      },
      rightPriceScale: {
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 },
      },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#10D856',
      downColor: '#f43f5e',
      borderUpColor: '#10D856',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10D856',
      wickDownColor: '#f43f5e',
    });

    const barColorMap = new Map<number, string>();
    if (showCustomOverlay && customOverlays?.barcolors?.length) {
      for (const bc of customOverlays.barcolors) {
        if (bc.color) barColorMap.set(bc.time, bc.color);
      }
    }

    let sortedCandles: Array<{ time: Time; open: number; high: number; low: number; close: number; volume: number }> = [];
    if (candles.length > 0) {
      sortedCandles = dedupAsc(
        candles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }))
      );
      series.setData(
        sortedCandles.map(({ time, open, high, low, close }) => {
          const overrideColor = barColorMap.get(Number(time));
          return overrideColor
            ? { time, open, high, low, close, color: overrideColor, borderColor: overrideColor, wickColor: overrideColor }
            : { time, open, high, low, close };
        })
      );

      if (showVolume) {
        const volSeries = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        volSeries.setData(
          sortedCandles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(16, 216, 86, 0.24)' : 'rgba(244, 63, 94, 0.24)',
          }))
        );
      }

      if (showMarkers && ((showCustomOverlay && customOverlays?.markers?.length) || kbosOverlays?.markers?.length)) {
        const rawMarkers =
          showCustomOverlay && customOverlays?.markers?.length
            ? customOverlays.markers
            : kbosOverlays?.markers ?? [];
        const sortedRaw = dedupAsc(
          rawMarkers.map((m) => ({
            time: m.time as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text.includes('BUY') ? 'BUY' : m.text.includes('SELL') ? 'SELL' : m.text.slice(0, 10),
          }))
        );
        const barStepSec =
          sortedCandles.length >= 2
            ? Math.max(60, Number(sortedCandles[1]!.time) - Number(sortedCandles[0]!.time))
            : 900;
        const firstSec = Number(sortedCandles[0]?.time ?? 0);
        const lastSec = Number(sortedCandles[sortedCandles.length - 1]?.time ?? 0);
        const spanSec = Math.max(0, lastSec - firstSec);
        const minGapSec = Math.max(barStepSec * 10, Math.floor(spanSec / 12));
        const spaced: SeriesMarker<Time>[] = [];
        for (const m of sortedRaw) {
          const prev = spaced[spaced.length - 1];
          if (!prev || Number(m.time) - Number(prev.time) >= minGapSec) {
            spaced.push(m);
          } else {
            spaced[spaced.length - 1] = m;
          }
        }
        series.setMarkers(spaced);
      }

      chart.timeScale().fitContent();
    }

    if (showCustomOverlay && customOverlays?.plots?.length) {
      for (const pl of customOverlays.plots) {
        if (pl.overlay === false || !pl.points.length) continue;
        if (pl.style === 'histogram' || pl.style === 'columns') {
          const hs = chart.addHistogramSeries({ color: pl.color || '#38e1ff', priceLineVisible: false, title: pl.title });
          hs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
        } else if (pl.style === 'area') {
          const as = chart.addAreaSeries({ lineColor: pl.color || '#38e1ff', topColor: 'rgba(56,225,255,0.22)', bottomColor: 'rgba(56,225,255,0.02)', lineWidth: (pl.linewidth || 2) as 1 | 2 | 3 | 4, priceLineVisible: false, title: pl.title });
          as.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value }))));
        } else {
          const cs = chart.addLineSeries({
            color: pl.color || '#38e1ff',
            lineWidth: Math.max(1, Math.min(4, pl.linewidth || 2)) as 1 | 2 | 3 | 4,
            lineType: pl.style === 'stepline' ? LineType.WithSteps : LineType.Simple,
            priceLineVisible: false,
            title: pl.title,
          });
          cs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
        }
      }
    }

    if (showCustomOverlay && customOverlays?.hlines?.length) {
      for (const hl of customOverlays.hlines) {
        if (hl.overlay === false) continue;
        series.createPriceLine({
          price: hl.price,
          color: hl.color || '#94a3b8',
          lineWidth: Math.max(1, Math.min(4, hl.linewidth || 1)) as 1 | 2 | 3 | 4,
          lineStyle: toLwLineStyle(hl.linestyle),
          axisLabelVisible: true,
          title: hl.title,
        });
      }
    }

    if (showEmas || (!kbosOverlays && overlays)) {
      if (overlays?.ema20?.length) {
        const s20 = chart.addLineSeries({ color: '#1464F6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s20.setData(dedupAsc(overlays.ema20.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (overlays?.ema50?.length) {
        const s50 = chart.addLineSeries({ color: '#FF8A00', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s50.setData(dedupAsc(overlays.ema50.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (overlays?.ema200?.length) {
        const s200 = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        s200.setData(dedupAsc(overlays.ema200.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    if (showKbosHtf && kbosOverlays?.closeSeriesAlt?.length && kbosOverlays?.openSeriesAlt?.length) {
      const cLine = chart.addLineSeries({ color: '#10D856', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'KBOs Close' });
      cLine.setData(dedupAsc(kbosOverlays.closeSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
      const oLine = chart.addLineSeries({ color: '#f43f5e', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'KBOs Open' });
      oLine.setData(dedupAsc(kbosOverlays.openSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
    }

    if (showDemaAtr && kbosOverlays?.demaAtr?.length) {
      const daLine = chart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: false, title: 'DEMA ATR' });
      daLine.setData(
        dedupAsc(
          kbosOverlays.demaAtr.map((p) => ({
            time: p.time as Time,
            value: p.value,
            color: p.trend === 'BULL' ? '#10D856' : '#f43f5e',
          }))
        )
      );
    }

    if (showAlmaRibbon && kbosOverlays?.almaRibbon?.bands?.length) {
      for (const band of kbosOverlays.almaRibbon.bands) {
        if (!band.points.length) continue;
        const bSeries = chart.addLineSeries({ color: band.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        bSeries.setData(dedupAsc(band.points.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    const addLevel = (price: number | undefined, title: string, color: string) => {
      if (!price || !Number.isFinite(price)) return;
      series.createPriceLine({ price, color, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title });
    };

    if (levels) {
      addLevel(levels.entry, 'ENTRY', '#1464F6');
      addLevel(levels.stopLoss, 'STOP LOSS', '#f43f5e');
      addLevel(levels.tp1, 'TP1', '#10D856');
      addLevel(levels.tp2, 'TP2', '#FF8A00');
      addLevel(levels.tp3, 'TP3', '#f97316');
      levels.supports?.forEach((s, idx) => addLevel(s, `S${idx + 1}`, '#06b6d4'));
      levels.resistances?.forEach((r, idx) => addLevel(r, `R${idx + 1}`, '#8b5cf6'));
    }

    // Synchronized TradingView Vector Overlay Layer (Box, Line, Label, Fill, Bgcolor)
    const timeStep =
      sortedCandles.length >= 2 ? Math.max(60, Number(sortedCandles[1]!.time) - Number(sortedCandles[0]!.time)) : 900;
    const minCandleTime = Number(sortedCandles[0]?.time ?? 0);
    const maxCandleTime = Number(sortedCandles[sortedCandles.length - 1]?.time ?? 0);

    const resolveX = (t: number, width: number): number | null => {
      const direct = chart.timeScale().timeToCoordinate(t as Time);
      if (direct !== null && Number.isFinite(direct)) return direct;
      if (sortedCandles.length >= 2) {
        if (t > maxCandleTime) {
          const xLast = chart.timeScale().timeToCoordinate(maxCandleTime as Time);
          const xPrev = chart.timeScale().timeToCoordinate((maxCandleTime - timeStep) as Time);
          if (xLast !== null && xPrev !== null) {
            const pxPerBar = Math.max(1, xLast - xPrev);
            return xLast + ((t - maxCandleTime) / timeStep) * pxPerBar;
          }
          return width - 60;
        }
        if (t < minCandleTime) return 0;
      }
      return null;
    };

    const drawSvgOverlay = () => {
      const svg = svgOverlayRef.current;
      if (!svg) return;
      if (!showCustomOverlay || !showTvGraphics || !customOverlays) {
        svg.replaceChildren();
        return;
      }
      const w = el.clientWidth || 600;
      const h = height;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const ns = 'http://www.w3.org/2000/svg';
      const frag = document.createDocumentFragment();

      const mk = (tag: string, attrs: Record<string, string | number | undefined>) => {
        const node = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) {
          if (v !== undefined) node.setAttribute(k, String(v));
        }
        return node;
      };

      // 1. Background Bands (bgcolor)
      for (const bg of customOverlays.bgcolors || []) {
        const x = resolveX(bg.time, w);
        if (x === null || x < -20 || x > w) continue;
        frag.appendChild(mk('rect', { x: x - 3, y: 0, width: 6, height: h, fill: bg.color }));
      }

      // 2. Plot Fills (fill)
      for (const fl of customOverlays.fills || []) {
        if (fl.overlay === false || fl.points.length < 2) continue;
        const topPts: string[] = [];
        const botPts: string[] = [];
        for (const pt of fl.points) {
          const x = resolveX(pt.time, w);
          const yT = series.priceToCoordinate(pt.top);
          const yB = series.priceToCoordinate(pt.bottom);
          if (x === null || yT === null || yB === null) continue;
          topPts.push(`${x.toFixed(1)},${yT.toFixed(1)}`);
          botPts.unshift(`${x.toFixed(1)},${yB.toFixed(1)}`);
        }
        if (topPts.length >= 2) {
          frag.appendChild(mk('polygon', { points: [...topPts, ...botPts].join(' '), fill: fl.color }));
        }
      }

      // 3. Boxes (box.new — Order Blocks, FVG, Supply/Demand)
      for (const bx of customOverlays.boxes || []) {
        const yTop = series.priceToCoordinate(bx.top);
        const yBot = series.priceToCoordinate(bx.bottom);
        if (yTop === null || yBot === null) continue;
        let x1 = resolveX(bx.leftTime, w);
        let x2 = resolveX(bx.rightTime, w);
        if (bx.extend === 'right' || bx.extend === 'both') x2 = w - 58;
        if (bx.extend === 'left' || bx.extend === 'both') x1 = 0;
        if (x1 === null) x1 = 0;
        if (x2 === null) x2 = Math.min(w - 60, x1 + 64);
        const rx = Math.min(x1, x2);
        const rw = Math.max(8, Math.abs(x2 - x1));
        const ry = Math.min(yTop, yBot);
        const rh = Math.max(4, Math.abs(yBot - yTop));
        if (rx + rw < 0 || rx > w) continue;

        frag.appendChild(
          mk('rect', {
            x: rx.toFixed(1),
            y: ry.toFixed(1),
            width: rw.toFixed(1),
            height: rh.toFixed(1),
            rx: 3,
            fill: bx.bgcolor || 'rgba(43,116,255,0.16)',
            stroke: bx.borderColor || '#2b74ff',
            'stroke-width': bx.borderWidth ?? 1,
            'stroke-dasharray': svgDash(bx.borderStyle),
          })
        );
        if (bx.text && rh >= 10 && rw >= 24) {
          const txt = mk('text', {
            x: (rx + 5).toFixed(1),
            y: (ry + Math.min(rh - 3, 12)).toFixed(1),
            fill: bx.textColor || bx.borderColor || '#e2e8f0',
            'font-size': 10,
            'font-weight': 700,
          });
          txt.textContent = bx.text.slice(0, 22);
          frag.appendChild(txt);
        }
      }

      // 4. Lines (line.new — BOS, CHoCH, Trendlines)
      for (const ln of customOverlays.lines || []) {
        const y1 = series.priceToCoordinate(ln.y1);
        const y2 = series.priceToCoordinate(ln.y2);
        if (y1 === null || y2 === null) continue;
        let x1 = resolveX(ln.x1Time, w);
        let x2 = resolveX(ln.x2Time, w);
        if (ln.extend === 'right' || ln.extend === 'both') x2 = w - 58;
        if (ln.extend === 'left' || ln.extend === 'both') x1 = 0;
        if (x1 === null || x2 === null) continue;
        frag.appendChild(
          mk('line', {
            x1: x1.toFixed(1),
            y1: y1.toFixed(1),
            x2: x2.toFixed(1),
            y2: y2.toFixed(1),
            stroke: ln.color || '#38e1ff',
            'stroke-width': ln.width ?? 2,
            'stroke-dasharray': svgDash(ln.style),
          })
        );
      }

      // 4.5. Polylines (polyline.new & linefill.new)
      for (const pl of customOverlays.polylines || []) {
        const coords: Array<{ x: number; y: number }> = [];
        for (const pt of pl.points) {
          const x = resolveX(pt.time, w);
          const y = series.priceToCoordinate(pt.price);
          if (x !== null && y !== null) coords.push({ x, y });
        }
        if (coords.length < 2) continue;
        let d = `M ${coords[0]!.x.toFixed(1)} ${coords[0]!.y.toFixed(1)}`;
        if (pl.curved && coords.length >= 3) {
          for (let i = 1; i < coords.length - 1; i++) {
            const xc = (coords[i]!.x + coords[i + 1]!.x) / 2;
            const yc = (coords[i]!.y + coords[i + 1]!.y) / 2;
            d += ` Q ${coords[i]!.x.toFixed(1)} ${coords[i]!.y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
          }
          const last = coords[coords.length - 1]!;
          d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
        } else {
          for (let i = 1; i < coords.length; i++) {
            d += ` L ${coords[i]!.x.toFixed(1)} ${coords[i]!.y.toFixed(1)}`;
          }
        }
        if (pl.closed) d += ' Z';
        frag.appendChild(
          mk('path', {
            d,
            fill: pl.fillColor || (pl.closed ? 'rgba(56,225,255,0.12)' : 'none'),
            stroke: (pl.width ?? 2) > 0 ? pl.color || '#38e1ff' : 'none',
            'stroke-width': pl.width ?? 2,
            'stroke-dasharray': svgDash(pl.style),
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          })
        );
      }

      // 5. Floating Labels (label.new)
      for (const lbl of customOverlays.labels || []) {
        const x = resolveX(lbl.time, w);
        const yRaw = series.priceToCoordinate(lbl.price);
        if (x === null || yRaw === null || x < 4 || x > w - 40) continue;
        const text = (lbl.text || '').slice(0, 18);
        if (!text) continue;
        const bw = Math.max(26, text.length * 6.5 + 10);
        const bh = 16;
        const isUp = lbl.style === 'label_up' || lbl.yloc === 'belowbar';
        const by = isUp ? yRaw + 5 : yRaw - bh - 5;
        const bx = x - bw / 2;
        frag.appendChild(
          mk('rect', {
            x: bx.toFixed(1),
            y: by.toFixed(1),
            width: bw.toFixed(1),
            height: bh,
            rx: 4,
            fill: lbl.color || '#2b74ff',
          })
        );
        const txtEl = mk('text', {
          x: x.toFixed(1),
          y: (by + 11.5).toFixed(1),
          'text-anchor': 'middle',
          fill: lbl.textcolor || '#ffffff',
          'font-size': 9.5,
          'font-weight': 800,
        });
        txtEl.textContent = text;
        frag.appendChild(txtEl);
      }

      svg.replaceChildren(frag);
    };

    const scheduleDraw = () => requestAnimationFrame(drawSvgOverlay);
    scheduleDraw();
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleDraw);

    // Optional Sub-Pane Chart for overlay=false oscillators (RSI, MACD, Stochastic, etc.)
    let subChart: IChartApi | null = null;
    const subEl = subPaneRef.current;
    const subPlots = (customOverlays?.plots || []).filter((p) => p.overlay === false && p.points.length);
    if (showCustomOverlay && subEl && subPlots.length > 0) {
      subChart = createChart(subEl, {
        width: Math.max(280, subEl.clientWidth || 600),
        height: 135,
        layout: {
          background: { type: ColorType.Solid, color: isLight ? '#f8fafc' : '#050915' },
          textColor: isLight ? '#4b6491' : '#96a9cf',
        },
        grid: {
          vertLines: { color: isLight ? 'rgba(12, 68, 200, 0.05)' : 'rgba(120, 165, 255, 0.05)' },
          horzLines: { color: isLight ? 'rgba(12, 68, 200, 0.05)' : 'rgba(120, 165, 255, 0.05)' },
        },
        timeScale: { timeVisible: true, borderColor: 'rgba(120,165,255,0.12)' },
        rightPriceScale: { borderColor: 'rgba(120,165,255,0.12)' },
      });
      let firstSubSeries: ISeriesApi<'Line'> | ISeriesApi<'Histogram'> | null = null;
      for (const pl of subPlots) {
        if (pl.style === 'histogram' || pl.style === 'columns') {
          const s = subChart.addHistogramSeries({ color: pl.color || '#38e1ff', title: pl.title });
          s.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
          if (!firstSubSeries) firstSubSeries = s;
        } else {
          const s = subChart.addLineSeries({ color: pl.color || '#38e1ff', lineWidth: 2, title: pl.title });
          s.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value }))));
          if (!firstSubSeries) firstSubSeries = s;
        }
      }
      if (firstSubSeries && customOverlays?.hlines?.length) {
        for (const hl of customOverlays.hlines) {
          firstSubSeries.createPriceLine({
            price: hl.price,
            color: hl.color || '#94a3b8',
            lineWidth: 1,
            lineStyle: toLwLineStyle(hl.linestyle),
            axisLabelVisible: true,
            title: hl.title,
          });
        }
      }
      subChart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      if (el && el.clientWidth > 0) {
        chart.applyOptions({ width: el.clientWidth });
        scheduleDraw();
      }
      if (subEl && subChart && subEl.clientWidth > 0) {
        subChart.applyOptions({ width: subEl.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleDraw);
      } catch { /* ignore */ }
      try {
        chart.remove();
      } catch { /* ignore */ }
      if (subChart) {
        try {
          subChart.remove();
        } catch { /* ignore */ }
      }
    };
  }, [candles, levels, overlays, kbosOverlays, customOverlays, showVolume, height, showKbosHtf, showDemaAtr, showAlmaRibbon, showEmas, showCustomOverlay, showTvGraphics, showMarkers, isLight]);

  const hasPrimitives = Boolean(
    customOverlays &&
      ((customOverlays.boxes?.length || 0) > 0 ||
        (customOverlays.lines?.length || 0) > 0 ||
        (customOverlays.labels?.length || 0) > 0 ||
        (customOverlays.fills?.length || 0) > 0 ||
        (customOverlays.polylines?.length || 0) > 0 ||
        (customOverlays.tables?.length || 0) > 0)
  );

  return (
    <div className="space-y-2">
      {(kbosOverlays || customOverlays) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {customOverlays && (
            <button
              type="button"
              onClick={() => setShowCustomOverlay((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold transition ${showCustomOverlay ? 'btn-lime' : 'surface-soft text-dim'}`}
            >
              {customOverlays.language ? `${customOverlays.language.toUpperCase()} · ` : ''}{customOverlays.title}
            </button>
          )}
          {hasPrimitives && (
            <button
              type="button"
              onClick={() => setShowTvGraphics((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold transition ${showTvGraphics ? 'btn-cobalt' : 'surface-soft text-dim'}`}
            >
              TV Graphics (Box/Label/Table)
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowKbosHtf((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showKbosHtf ? 'btn-emerald' : 'surface-soft text-dim'}`}
          >
            KBOs HTF
          </button>
          <button
            type="button"
            onClick={() => setShowDemaAtr((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showDemaAtr ? 'btn-cobalt' : 'surface-soft text-dim'}`}
          >
            DEMA ATR
          </button>
          <button
            type="button"
            onClick={() => setShowAlmaRibbon((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showAlmaRibbon ? 'banner-cobalt-soft text-brand' : 'surface-soft text-dim'}`}
          >
            RLA MA Ribbon
          </button>
          <button
            type="button"
            onClick={() => setShowMarkers((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-bold transition ${showMarkers ? 'btn-cobalt' : 'surface-soft text-dim'}`}
          >
            BUY/SELL Arrows
          </button>
          {overlays && (
            <button
              type="button"
              onClick={() => setShowEmas((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border font-bold transition ${showEmas ? 'bg-[#FF8A00]/15 text-flame border-[#FF8A00]/40' : 'surface-soft text-dim'}`}
            >
              EMA 20/50/200
            </button>
          )}
        </div>
      )}

      <div className="relative w-full rounded-2xl overflow-hidden border">
        <div ref={containerRef} className="w-full" />
        <svg
          ref={svgOverlayRef}
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
        />

        {/* TradingView table.new HUD overlays */}
        {showCustomOverlay &&
          showTvGraphics &&
          customOverlays?.tables?.map((tbl, tIdx) => {
            const cellGrid: Array<Array<CustomChartTable['cells'][number] | undefined>> = Array.from({ length: tbl.rows }, () =>
              Array.from({ length: tbl.columns }, () => undefined)
            );
            for (const c of tbl.cells) {
              if (c.row >= 0 && c.row < tbl.rows && c.col >= 0 && c.col < tbl.columns) {
                cellGrid[c.row]![c.col] = c;
              }
            }
            return (
              <div
                key={`tv_tbl_${tIdx}`}
                dir="ltr"
                style={{ background: tbl.bgcolor, borderColor: tbl.borderColor, borderWidth: tbl.borderWidth ?? 1 }}
                className={`pointer-events-none absolute z-20 rounded-xl border backdrop-blur-md shadow-lg overflow-hidden text-[10px] font-mono ${tablePosClass(tbl.position)}`}
              >
                <table className="border-collapse">
                  <tbody>
                    {cellGrid.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            style={{
                              background: cell?.bgcolor && cell.bgcolor !== 'transparent' ? cell.bgcolor : undefined,
                              color: cell?.textColor || '#e2e8f0',
                              borderColor: tbl.borderColor,
                            }}
                            className="px-2 py-1 border border-white/10 whitespace-nowrap font-bold"
                          >
                            {cell?.text ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
      </div>

      {hasSubPane && (
        <div className="w-full rounded-2xl overflow-hidden border">
          <div ref={subPaneRef} className="w-full" />
        </div>
      )}
    </div>
  );
}
