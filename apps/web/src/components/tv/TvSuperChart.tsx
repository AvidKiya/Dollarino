import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  LineType,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import {
  Activity,
  BrainCircuit,
  Camera,
  ChevronDown,
  Code2,
  Columns2,
  Crosshair,
  Eye,
  EyeOff,
  LayoutGrid,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Percent,
  Ruler,
  Settings2,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import type {
  Candle,
  CustomChartTable,
  SampleCustomStrategy,
  Timeframe,
} from '@dollarino/core';
import type { Lang } from '../../lib/i18n';
import {
  computeActiveTvIndicators,
  getTvIndicatorDef,
  loadDrawingsForSymbol,
  loadSavedChartType,
  loadSavedIndicators,
  saveActiveIndicators,
  saveChartType,
  saveDrawingsForSymbol,
  toHeikinAshiCandles,
  type ActiveTvIndicator,
  type ChartDrawing,
  type ChartDrawingPoint,
  type ChartSeriesType,
  type DrawingToolType,
  type TvIndicatorDef,
} from '../../lib/tv-indicators';
import type {
  ChartLevels,
  ChartOverlays,
  CustomStrategyChartOverlay,
  KbosChartOverlays,
} from '../CandlestickChart';
import { CoinIcon } from '../CoinIcon';
import { SymbolPicker, type ExchangeMarket } from '../SymbolPickerModal';
import { IndicatorsModal } from './IndicatorsModal';
import { TradingViewRealWidget } from './TradingViewRealWidget';

const ALL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];
const QUICK_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

const CHART_TYPE_OPTIONS: Array<{ id: ChartSeriesType; labelFa: string; labelEn: string }> = [
  { id: 'candles', labelFa: 'کندل ژاپنی', labelEn: 'Candles' },
  { id: 'hollow', labelFa: 'کندل توخالی', labelEn: 'Hollow Candles' },
  { id: 'heikin_ashi', labelFa: 'هیکن آشی', labelEn: 'Heikin Ashi' },
  { id: 'line', labelFa: 'خطی (Line)', labelEn: 'Line' },
  { id: 'area', labelFa: 'مساحتی (Area)', labelEn: 'Area' },
  { id: 'baseline', labelFa: 'خط مبنا (Baseline)', labelEn: 'Baseline' },
];

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
      return 'top-14 left-3';
    case 'bottom_left':
      return 'bottom-10 left-3';
    case 'bottom_right':
      return 'bottom-10 right-20';
    case 'top_center':
      return 'top-14 left-1/2 -translate-x-1/2';
    case 'bottom_center':
      return 'bottom-10 left-1/2 -translate-x-1/2';
    case 'middle_left':
      return 'top-1/2 -translate-y-1/2 left-3';
    case 'middle_right':
      return 'top-1/2 -translate-y-1/2 right-20';
    default:
      return 'top-14 right-20';
  }
}

function fmtPx(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function calcEmaVal(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const k = 2 / (period + 1);
  let val = closes[0]!;
  for (let i = 1; i < closes.length; i++) {
    val = closes[i]! * k + val * (1 - k);
  }
  return val;
}

function computeTechnicalsSummary(candles: Candle[]): {
  verdictEn: string;
  verdictFa: string;
  score: number; // -1 to +1
  sellCount: number;
  neutralCount: number;
  buyCount: number;
} {
  if (candles.length < 20) {
    return { verdictEn: 'Neutral', verdictFa: 'خنثی', score: 0, sellCount: 4, neutralCount: 6, buyCount: 4 };
  }
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]!;
  let sellCount = 0;
  let neutralCount = 0;
  let buyCount = 0;

  // Moving averages (10, 20, 30, 50, 100, 200)
  for (const p of [10, 20, 30, 50, 100, 200]) {
    const e = calcEmaVal(closes, Math.min(p, closes.length));
    const diffPct = e > 0 ? (last - e) / e : 0;
    if (diffPct > 0.002) buyCount++;
    else if (diffPct < -0.002) sellCount++;
    else neutralCount++;
  }

  // RSI (14)
  let gains = 0;
  let losses = 0;
  const rsiStart = Math.max(1, closes.length - 14);
  for (let i = rsiStart; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gains += d;
    else losses += -d;
  }
  const rs = losses > 0 ? gains / losses : 100;
  const rsi14 = 100 - 100 / (1 + rs);
  if (rsi14 > 55 && rsi14 < 78) buyCount += 2;
  else if (rsi14 < 45 && rsi14 > 22) sellCount += 2;
  else neutralCount += 2;

  // MACD(12,26)
  const ema12 = calcEmaVal(closes, 12);
  const ema26 = calcEmaVal(closes, 26);
  const macdVal = ema12 - ema26;
  if (macdVal > 0) buyCount += 2;
  else if (macdVal < 0) sellCount += 2;
  else neutralCount += 2;

  // Momentum(10)
  const prev10 = closes[Math.max(0, closes.length - 11)]!;
  if (last > prev10 * 1.002) buyCount += 2;
  else if (last < prev10 * 0.998) sellCount += 2;
  else neutralCount += 2;

  const total = Math.max(1, buyCount + sellCount + neutralCount);
  const score = Math.max(-1, Math.min(1, (buyCount - sellCount) / total));
  let verdictEn = 'Neutral';
  let verdictFa = 'خنثی';
  if (score >= 0.45) {
    verdictEn = 'Strong Buy';
    verdictFa = 'خرید قوی';
  } else if (score >= 0.15) {
    verdictEn = 'Buy';
    verdictFa = 'خرید';
  } else if (score <= -0.45) {
    verdictEn = 'Strong Sell';
    verdictFa = 'فروش قوی';
  } else if (score <= -0.15) {
    verdictEn = 'Sell';
    verdictFa = 'فروش';
  }
  return { verdictEn, verdictFa, score, sellCount, neutralCount, buyCount };
}

export function TvSuperChart({
  lang,
  symbol,
  timeframe,
  candles,
  markets,
  provider,
  marketType,
  levels,
  overlays,
  kbosOverlays,
  customOverlays,
  layoutMode,
  showKbos,
  pineDockOpen,
  aiLoading,
  onChangeSymbol,
  onChangeTimeframe,
  onChangeMarketType,
  onToggleKbos,
  onChangeLayoutMode,
  onTogglePineDock,
  onRunPineSample,
  onRunAiAnalyze,
  onClearCustomOverlay,
  height = 520,
}: {
  lang: Lang;
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  markets: ExchangeMarket[];
  provider?: string;
  marketType?: 'SPOT' | 'FUTURES';
  levels?: ChartLevels;
  overlays?: ChartOverlays;
  kbosOverlays?: KbosChartOverlays;
  customOverlays?: CustomStrategyChartOverlay | null;
  layoutMode: '1x1' | '2x1' | '2x2';
  showKbos: boolean;
  pineDockOpen: boolean;
  aiLoading?: boolean;
  onChangeSymbol: (sym: string) => void;
  onChangeTimeframe: (tf: Timeframe) => void;
  onChangeMarketType?: (m: 'SPOT' | 'FUTURES') => void;
  onToggleKbos: () => void;
  onChangeLayoutMode: (m: '1x1' | '2x1' | '2x2') => void;
  onTogglePineDock: () => void;
  onRunPineSample?: (sample: SampleCustomStrategy) => void;
  onRunAiAnalyze?: () => void;
  onClearCustomOverlay?: () => void;
  height?: number;
}) {
  const isFa = lang === 'fa';
  const [isLight, setIsLight] = useState(
    () =>
      document.documentElement.dataset.look === 'paper' ||
      document.documentElement.classList.contains('theme-light')
  );
  const [chartEngine, setChartEngine] = useState<'quant' | 'tv_widget'>('quant');
  const [chartType, setChartType] = useState<ChartSeriesType>(() => loadSavedChartType());
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showMoreTf, setShowMoreTf] = useState(false);
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<ActiveTvIndicator[]>(() => loadSavedIndicators());
  const [editingIndUid, setEditingIndUid] = useState<string | null>(null);

  const [scaleMode, setScaleMode] = useState<'normal' | 'log' | 'percent'>('normal');
  const [magnetOn, setMagnetOn] = useState(false);
  const [showDrawings, setShowDrawings] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCustomOverlay, setShowCustomOverlay] = useState(true);
  const [showWatchlistSidebar, setShowWatchlistSidebar] = useState(false);
  const [activeRangePreset, setActiveRangePreset] = useState<string>('3M');
  const [utcClock, setUtcClock] = useState<string>(() => new Date().toISOString().slice(11, 19));
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const applyTimeRangePreset = (preset: string) => {
    setActiveRangePreset(preset);
    const chart = chartApiRef.current;
    if (!chart || !candles.length) return;
    if (preset === 'All') {
      chart.timeScale().fitContent();
      return;
    }
    const barsMap: Record<string, number> = {
      '1D': 48,
      '5D': 120,
      '1M': 160,
      '3M': 240,
      '6M': 300,
      YTD: 320,
      '1Y': 360,
      '5Y': candles.length,
    };
    const count = Math.min(candles.length, barsMap[preset] ?? 180);
    const to = candles.length - 1;
    const from = Math.max(0, to - count);
    chart.timeScale().setVisibleLogicalRange({ from, to: to + 4 });
  };

  const techSummary = useMemo(() => computeTechnicalsSummary(candles), [candles]);
  const watchlistRows = useMemo(() => {
    const core = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TONUSDT', 'AVAXUSDT', 'DOGEUSDT', 'SUIUSDT'];
    const map = new Map(markets.map((m) => [m.symbol, m]));
    return core.map((s) => map.get(s)).filter((x): x is ExchangeMarket => Boolean(x));
  }, [markets]);

  // Interactive Drawing Tools
  const [activeTool, setActiveTool] = useState<DrawingToolType>('cursor');
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => loadDrawingsForSymbol(symbol));
  const [draftStart, setDraftStart] = useState<ChartDrawingPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<ChartDrawingPoint | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // Crosshair OHLC live readout
  const [hoverBar, setHoverBar] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    chgPct: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgOverlayRef = useRef<SVGSVGElement>(null);
  const subPaneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | ISeriesApi<'Baseline'> | null>(null);
  const candlesLookupRef = useRef<Map<number, Candle>>(new Map());

  const effectiveHeight = fullscreen
    ? Math.max(420, (typeof window !== 'undefined' ? window.innerHeight : 820) - 210)
    : height;

  useEffect(() => {
    const syncTheme = () => {
      setIsLight(
        document.documentElement.dataset.look === 'paper' ||
          document.documentElement.classList.contains('theme-light')
      );
    };
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-look'] });
    return () => obs.disconnect();
  }, []);

  // Esc key closes fullscreen or cancels active drawing draft
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (draftStart) {
          setDraftStart(null);
          return;
        }
        if (activeTool !== 'cursor') {
          setActiveTool('cursor');
          return;
        }
        if (fullscreen) setFullscreen(false);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        setDrawings((prev) => {
          const next = prev.filter((d) => d.id !== selectedDrawingId);
          saveDrawingsForSymbol(symbol, next);
          return next;
        });
        setSelectedDrawingId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draftStart, activeTool, fullscreen, selectedDrawingId, symbol]);

  // Reload drawings when symbol changes
  useEffect(() => {
    setDrawings(loadDrawingsForSymbol(symbol));
    setDraftStart(null);
    setSelectedDrawingId(null);
  }, [symbol]);

  const updateIndicators = (updater: (prev: ActiveTvIndicator[]) => ActiveTvIndicator[]) => {
    setActiveIndicators((prev) => {
      const next = updater(prev);
      saveActiveIndicators(next);
      return next;
    });
  };

  const addIndicatorFromModal = (def: TvIndicatorDef) => {
    const palette = ['#38bdf8', '#f59e0b', '#a855f7', '#10d9a3', '#f43f5e', '#22d3ee'];
    const sameCount = activeIndicators.filter((a) => a.id === def.id).length;
    const uid = `ind_${def.id}_${Date.now().toString(36)}_${sameCount}`;
    const defaultParams = { ...def.defaultParams };
    if (def.id === 'EMA' && sameCount > 0) {
      const presets = [20, 50, 200, 9, 100];
      defaultParams.length = presets[sameCount % presets.length]!;
    }
    updateIndicators((prev) => [
      ...prev,
      {
        uid,
        id: def.id,
        params: defaultParams,
        visible: true,
        color: sameCount > 0 ? palette[(sameCount + 1) % palette.length]! : def.defaultColor,
      },
    ]);
  };

  // Display candles (transformed to Heikin Ashi when selected)
  const displayCandles = useMemo(() => {
    if (!candles.length) return [];
    return chartType === 'heikin_ashi' ? toHeikinAshiCandles(candles) : candles;
  }, [candles, chartType]);

  // Compute all active client-side indicators
  const computedIndicators = useMemo(
    () => computeActiveTvIndicators(candles, activeIndicators),
    [candles, activeIndicators]
  );

  // Merge Pine Script overlay=false plots into sub-panes
  const pineSubPane = useMemo(() => {
    if (!showCustomOverlay || !customOverlays?.plots?.length) return null;
    const subPlots = customOverlays.plots.filter((p) => p.overlay === false && p.points.length);
    if (!subPlots.length) return null;
    const subHlines = (customOverlays.hlines ?? []).filter((h) => h.overlay === false);
    return {
      uid: 'pine_subpane',
      id: 'PINE_SUB',
      title: `${customOverlays.title} (Pine)`,
      plots: subPlots,
      hlines: subHlines,
      fills: [],
      lastSummary: '',
    };
  }, [customOverlays, showCustomOverlay]);

  const allSubPanes = useMemo(
    () => [...computedIndicators.subPanes, ...(pineSubPane ? [pineSubPane] : [])],
    [computedIndicators.subPanes, pineSubPane]
  );

  // Keep latest drawings / hover in ref so SVG redraw callback doesn't tear down Lightweight Chart
  const drawingsStateRef = useRef({ drawings, draftStart, hoverPoint, selectedDrawingId, showDrawings });
  drawingsStateRef.current = { drawings, draftStart, hoverPoint, selectedDrawingId, showDrawings };

  const drawSvgOverlayRef = useRef<() => void>(() => {});

  useEffect(() => {
    drawSvgOverlayRef.current();
  }, [drawings, draftStart, hoverPoint, selectedDrawingId, showDrawings]);

  useEffect(() => {
    if (chartEngine !== 'quant') return;
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
      width: Math.max(300, el.clientWidth || 720),
      height: effectiveHeight,
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#050b18' },
        textColor: isLight ? '#4b6491' : '#96a9cf',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(12, 68, 200, 0.055)' : 'rgba(120, 165, 255, 0.055)' },
        horzLines: { color: isLight ? 'rgba(12, 68, 200, 0.055)' : 'rgba(120, 165, 255, 0.055)' },
      },
      crosshair: {
        mode: 0, // Free crosshair (TradingView style)
      },
      timeScale: {
        timeVisible: true,
        rightOffset: 10,
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
      },
      rightPriceScale: {
        mode:
          scaleMode === 'log'
            ? PriceScaleMode.Logarithmic
            : scaleMode === 'percent'
              ? PriceScaleMode.Percentage
              : PriceScaleMode.Normal,
        borderColor: isLight ? 'rgba(12, 68, 200, 0.14)' : 'rgba(120, 165, 255, 0.14)',
        scaleMargins: { top: 0.1, bottom: 0.18 },
      },
    });
    chartApiRef.current = chart;

    const lastClose = displayCandles[displayCandles.length - 1]?.close ?? 0;
    const firstClose = displayCandles[0]?.close ?? lastClose;

    const mainSeries =
      chartType === 'line'
        ? chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, title: symbol })
        : chartType === 'area'
          ? chart.addAreaSeries({
              lineColor: '#38bdf8',
              topColor: 'rgba(56, 189, 248, 0.28)',
              bottomColor: 'rgba(56, 189, 248, 0.02)',
              lineWidth: 2,
              title: symbol,
            })
          : chartType === 'baseline'
            ? chart.addBaselineSeries({
                baseValue: { type: 'price', price: firstClose },
                topLineColor: '#10d9a3',
                topFillColor1: 'rgba(16,217,163,0.24)',
                topFillColor2: 'rgba(16,217,163,0.02)',
                bottomLineColor: '#f43f5e',
                bottomFillColor1: 'rgba(244,63,94,0.02)',
                bottomFillColor2: 'rgba(244,63,94,0.24)',
                lineWidth: 2,
                title: symbol,
              })
            : chart.addCandlestickSeries({
                upColor: chartType === 'hollow' ? 'transparent' : '#10D856',
                downColor: '#f43f5e',
                borderUpColor: '#10D856',
                borderDownColor: '#f43f5e',
                wickUpColor: '#10D856',
                wickDownColor: '#f43f5e',
              });

    candleSeriesRef.current = mainSeries;

    const barColorMap = new Map<number, string>();
    if (showCustomOverlay && customOverlays?.barcolors?.length) {
      for (const bc of customOverlays.barcolors) {
        if (bc.color) barColorMap.set(bc.time, bc.color);
      }
    }

    const cLookup = new Map<number, Candle>();
    const sortedCandles = dedupAsc(
      displayCandles.map((c) => {
        const t = Math.floor(c.timestamp / 1000);
        cLookup.set(t, c);
        return {
          time: t as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        };
      })
    );
    candlesLookupRef.current = cLookup;

    if (sortedCandles.length > 0) {
      if (chartType === 'line' || chartType === 'area' || chartType === 'baseline') {
        (mainSeries as ISeriesApi<'Line'>).setData(sortedCandles.map((c) => ({ time: c.time, value: c.close })));
      } else {
        (mainSeries as ISeriesApi<'Candlestick'>).setData(
          sortedCandles.map(({ time, open, high, low, close }) => {
            const overrideColor = barColorMap.get(Number(time));
            return overrideColor
              ? { time, open, high, low, close, color: overrideColor, borderColor: overrideColor, wickColor: overrideColor }
              : { time, open, high, low, close };
          })
        );
      }

      // Volume Histogram
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volSeries.setData(
        sortedCandles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 216, 86, 0.22)' : 'rgba(244, 63, 94, 0.22)',
        }))
      );

      // Buy/Sell Markers
      if (showMarkers && ((showCustomOverlay && customOverlays?.markers?.length) || (showKbos && kbosOverlays?.markers?.length))) {
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
            text: m.text.includes('BUY') ? 'BUY' : m.text.includes('SELL') ? 'SELL' : m.text.slice(0, 12),
          }))
        );
        const barStepSec =
          sortedCandles.length >= 2
            ? Math.max(60, Number(sortedCandles[1]!.time) - Number(sortedCandles[0]!.time))
            : 900;
        const firstSec = Number(sortedCandles[0]?.time ?? 0);
        const lastSec = Number(sortedCandles[sortedCandles.length - 1]?.time ?? 0);
        const minGapSec = Math.max(barStepSec * 8, Math.floor(Math.max(0, lastSec - firstSec) / 14));
        const spaced: SeriesMarker<Time>[] = [];
        for (const m of sortedRaw) {
          const prev = spaced[spaced.length - 1];
          if (!prev || Number(m.time) - Number(prev.time) >= minGapSec) spaced.push(m);
          else spaced[spaced.length - 1] = m;
        }
        mainSeries.setMarkers(spaced);
      }

      chart.timeScale().fitContent();
    }

    // Plot active TV overlay indicators + custom Pine Script overlay plots
    const allMainPlots = [
      ...computedIndicators.mainPlots,
      ...(showCustomOverlay && customOverlays?.plots ? customOverlays.plots.filter((p) => p.overlay !== false) : []),
    ];
    for (const pl of allMainPlots) {
      if (!pl.points.length) continue;
      if (pl.style === 'histogram' || pl.style === 'columns') {
        const hs = chart.addHistogramSeries({ color: pl.color || '#38e1ff', priceLineVisible: false, lastValueVisible: false, title: pl.title });
        hs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
      } else if (pl.style === 'area') {
        const as = chart.addAreaSeries({
          lineColor: pl.color || '#38e1ff',
          topColor: 'rgba(56,225,255,0.20)',
          bottomColor: 'rgba(56,225,255,0.02)',
          lineWidth: (pl.linewidth || 2) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        as.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value }))));
      } else {
        const cs = chart.addLineSeries({
          color: pl.color || '#38e1ff',
          lineWidth: Math.max(1, Math.min(4, pl.linewidth || 2)) as 1 | 2 | 3 | 4,
          lineType: pl.style === 'stepline' ? LineType.WithSteps : LineType.Simple,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        cs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
      }
    }

    // Main horizontal price lines from TV indicators (e.g. Pivots) & Pine hlines
    const allMainHlines = [
      ...computedIndicators.mainHlines,
      ...(showCustomOverlay && customOverlays?.hlines ? customOverlays.hlines.filter((h) => h.overlay !== false) : []),
    ];
    for (const hl of allMainHlines) {
      mainSeries.createPriceLine({
        price: hl.price,
        color: hl.color || '#94a3b8',
        lineWidth: Math.max(1, Math.min(4, hl.linewidth || 1)) as 1 | 2 | 3 | 4,
        lineStyle: toLwLineStyle(hl.linestyle),
        axisLabelVisible: true,
        title: hl.title,
      });
    }

    // Legacy backend EMAs if provided & user has no active EMA
    if (overlays && activeIndicators.length === 0) {
      if (overlays.ema20?.length) {
        const s20 = chart.addLineSeries({ color: '#1464F6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s20.setData(dedupAsc(overlays.ema20.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (overlays.ema50?.length) {
        const s50 = chart.addLineSeries({ color: '#FF8A00', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s50.setData(dedupAsc(overlays.ema50.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
    }

    // KBOS Overlays (when enabled)
    if (showKbos && kbosOverlays) {
      if (kbosOverlays.closeSeriesAlt?.length && kbosOverlays.openSeriesAlt?.length) {
        const cLine = chart.addLineSeries({ color: '#10D856', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        cLine.setData(dedupAsc(kbosOverlays.closeSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
        const oLine = chart.addLineSeries({ color: '#f43f5e', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        oLine.setData(dedupAsc(kbosOverlays.openSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value }))));
      }
      if (kbosOverlays.demaAtr?.length) {
        const daLine = chart.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
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
      if (kbosOverlays.almaRibbon?.bands?.length) {
        for (const band of kbosOverlays.almaRibbon.bands) {
          if (!band.points.length) continue;
          const bSeries = chart.addLineSeries({ color: band.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
          bSeries.setData(dedupAsc(band.points.map((p) => ({ time: p.time as Time, value: p.value }))));
        }
      }
    }

    // Position / AI Levels
    const addLevel = (price: number | undefined, title: string, color: string) => {
      if (!price || !Number.isFinite(price)) return;
      mainSeries.createPriceLine({ price, color, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
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

    // Coordinate resolver supporting future extrapolation for drawings (Long/Short Position, Fib, Rays)
    const timeStep =
      sortedCandles.length >= 2 ? Math.max(60, Number(sortedCandles[1]!.time) - Number(sortedCandles[0]!.time)) : 900;
    const minCandleTime = Number(sortedCandles[0]?.time ?? 0);
    const maxCandleTime = Number(sortedCandles[sortedCandles.length - 1]?.time ?? 0);

    const resolveX = (t: number, width: number): number | null => {
      const direct = chart.timeScale().timeToCoordinate(t as Time);
      if (direct !== null && Number.isFinite(direct)) return direct;
      if (sortedCandles.length >= 2) {
        const xLast = chart.timeScale().timeToCoordinate(maxCandleTime as Time);
        const xPrev = chart.timeScale().timeToCoordinate((maxCandleTime - timeStep) as Time);
        const xFirst = chart.timeScale().timeToCoordinate(minCandleTime as Time);
        const xSecond = chart.timeScale().timeToCoordinate((minCandleTime + timeStep) as Time);
        if (t > maxCandleTime && xLast !== null && xPrev !== null) {
          const pxPerBar = Math.max(1, xLast - xPrev);
          return xLast + ((t - maxCandleTime) / timeStep) * pxPerBar;
        }
        if (t < minCandleTime && xFirst !== null && xSecond !== null) {
          const pxPerBar = Math.max(1, xSecond - xFirst);
          return xFirst - ((minCandleTime - t) / timeStep) * pxPerBar;
        }
        if (t > maxCandleTime) return width - 70;
        if (t < minCandleTime) return 0;
      }
      return null;
    };

    const drawSvgOverlay = () => {
      const svg = svgOverlayRef.current;
      if (!svg) return;
      const w = el.clientWidth || 720;
      const h = effectiveHeight;
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

      // A) Active Indicator Fill Clouds (Ichimoku Kumo, Bollinger, Keltner, Donchian)
      for (const fl of computedIndicators.mainFills) {
        if (fl.points.length < 2) continue;
        const topPts: string[] = [];
        const botPts: string[] = [];
        for (const pt of fl.points) {
          const x = resolveX(pt.time, w);
          const yT = mainSeries.priceToCoordinate(pt.top);
          const yB = mainSeries.priceToCoordinate(pt.bottom);
          if (x === null || yT === null || yB === null) continue;
          topPts.push(`${x.toFixed(1)},${yT.toFixed(1)}`);
          botPts.unshift(`${x.toFixed(1)},${yB.toFixed(1)}`);
        }
        if (topPts.length >= 2) {
          frag.appendChild(mk('polygon', { points: [...topPts, ...botPts].join(' '), fill: fl.color }));
        }
      }

      // B) Pine Script Graphics (bgcolors, fills, boxes, lines, polylines, labels)
      if (showCustomOverlay && customOverlays) {
        for (const bg of customOverlays.bgcolors || []) {
          const x = resolveX(bg.time, w);
          if (x === null || x < -20 || x > w) continue;
          frag.appendChild(mk('rect', { x: x - 3, y: 0, width: 6, height: h, fill: bg.color }));
        }
        for (const fl of customOverlays.fills || []) {
          if (fl.overlay === false || fl.points.length < 2) continue;
          const topPts: string[] = [];
          const botPts: string[] = [];
          for (const pt of fl.points) {
            const x = resolveX(pt.time, w);
            const yT = mainSeries.priceToCoordinate(pt.top);
            const yB = mainSeries.priceToCoordinate(pt.bottom);
            if (x === null || yT === null || yB === null) continue;
            topPts.push(`${x.toFixed(1)},${yT.toFixed(1)}`);
            botPts.unshift(`${x.toFixed(1)},${yB.toFixed(1)}`);
          }
          if (topPts.length >= 2) frag.appendChild(mk('polygon', { points: [...topPts, ...botPts].join(' '), fill: fl.color }));
        }
        for (const bx of customOverlays.boxes || []) {
          const yTop = mainSeries.priceToCoordinate(bx.top);
          const yBot = mainSeries.priceToCoordinate(bx.bottom);
          if (yTop === null || yBot === null) continue;
          let x1 = resolveX(bx.leftTime, w);
          let x2 = resolveX(bx.rightTime, w);
          if (bx.extend === 'right' || bx.extend === 'both') x2 = w - 65;
          if (bx.extend === 'left' || bx.extend === 'both') x1 = 0;
          if (x1 === null) x1 = 0;
          if (x2 === null) x2 = Math.min(w - 65, x1 + 64);
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
        for (const ln of customOverlays.lines || []) {
          const y1 = mainSeries.priceToCoordinate(ln.y1);
          const y2 = mainSeries.priceToCoordinate(ln.y2);
          if (y1 === null || y2 === null) continue;
          let x1 = resolveX(ln.x1Time, w);
          let x2 = resolveX(ln.x2Time, w);
          if (ln.extend === 'right' || ln.extend === 'both') x2 = w - 65;
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
        for (const pl of customOverlays.polylines || []) {
          const coords: Array<{ x: number; y: number }> = [];
          for (const pt of pl.points) {
            const x = resolveX(pt.time, w);
            const y = mainSeries.priceToCoordinate(pt.price);
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
            for (let i = 1; i < coords.length; i++) d += ` L ${coords[i]!.x.toFixed(1)} ${coords[i]!.y.toFixed(1)}`;
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
            })
          );
        }
        for (const lbl of customOverlays.labels || []) {
          const x = resolveX(lbl.time, w);
          const yRaw = mainSeries.priceToCoordinate(lbl.price);
          if (x === null || yRaw === null || x < 4 || x > w - 40) continue;
          const text = (lbl.text || '').slice(0, 18);
          if (!text) continue;
          const bw = Math.max(26, text.length * 6.5 + 10);
          const bh = 16;
          const isUp = lbl.style === 'label_up' || lbl.yloc === 'belowbar';
          const by = isUp ? yRaw + 5 : yRaw - bh - 5;
          const bx = x - bw / 2;
          frag.appendChild(mk('rect', { x: bx.toFixed(1), y: by.toFixed(1), width: bw.toFixed(1), height: bh, rx: 4, fill: lbl.color || '#2b74ff' }));
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
      }

      // C) User Interactive Drawings (Trendline, Ray, HLine, VLine, Rect, Fib, Long/Short R:R, Measure, Text)
      const st = drawingsStateRef.current;
      if (st.showDrawings) {
        const list: Array<ChartDrawing & { isDraft?: boolean }> = [...st.drawings];
        if (st.draftStart && st.hoverPoint && activeTool !== 'cursor') {
          list.push({
            id: '__draft__',
            tool: activeTool,
            p1: st.draftStart,
            p2: st.hoverPoint,
            color: '#38bdf8',
            isDraft: true,
          });
        }

        const renderAnchor = (cx: number, cy: number, color: string) => {
          frag.appendChild(mk('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 4, fill: '#0b1224', stroke: color, 'stroke-width': 2 }));
        };

        for (const dr of list) {
          const x1 = resolveX(dr.p1.time, w);
          const y1 = mainSeries.priceToCoordinate(dr.p1.price);
          if (x1 === null || y1 === null) continue;
          const p2 = dr.p2 ?? dr.p1;
          const x2 = resolveX(p2.time, w) ?? x1;
          const y2 = mainSeries.priceToCoordinate(p2.price) ?? y1;
          const isSel = dr.id === st.selectedDrawingId;
          const strokeCol = isSel ? '#fbbf24' : dr.color || '#38bdf8';

          if (dr.tool === 'hline') {
            frag.appendChild(mk('line', { x1: 0, y1: y1.toFixed(1), x2: w - 62, y2: y1.toFixed(1), stroke: strokeCol, 'stroke-width': isSel ? 2.5 : 1.75 }));
            frag.appendChild(mk('rect', { x: w - 68, y: (y1 - 9).toFixed(1), width: 66, height: 18, rx: 4, fill: strokeCol }));
            const lbl = mk('text', { x: w - 35, y: (y1 + 3.5).toFixed(1), 'text-anchor': 'middle', fill: '#050b18', 'font-size': 9.5, 'font-weight': 800 });
            lbl.textContent = fmtPx(dr.p1.price);
            frag.appendChild(lbl);
            continue;
          }

          if (dr.tool === 'vline') {
            frag.appendChild(mk('line', { x1: x1.toFixed(1), y1: 0, x2: x1.toFixed(1), y2: h - 24, stroke: strokeCol, 'stroke-width': isSel ? 2.5 : 1.5, 'stroke-dasharray': '4 3' }));
            continue;
          }

          if (dr.tool === 'trendline') {
            frag.appendChild(mk('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: strokeCol, 'stroke-width': isSel ? 2.5 : 2 }));
            renderAnchor(x1, y1, strokeCol);
            renderAnchor(x2, y2, strokeCol);
            continue;
          }

          if (dr.tool === 'ray') {
            let rx: number = Number(x2);
            let ry: number = Number(y2);
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (Math.abs(dx) > 1) {
              const targetX = dx > 0 ? w - 65 : 0;
              rx = targetX;
              ry = y1 + (dy * (targetX - x1)) / dx;
            }
            frag.appendChild(mk('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: rx.toFixed(1), y2: ry.toFixed(1), stroke: strokeCol, 'stroke-width': isSel ? 2.5 : 2 }));
            renderAnchor(x1, y1, strokeCol);
            renderAnchor(x2, y2, strokeCol);
            continue;
          }

          if (dr.tool === 'rect') {
            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.max(6, Math.abs(x2 - x1));
            const rh = Math.max(6, Math.abs(y2 - y1));
            frag.appendChild(mk('rect', { x: rx.toFixed(1), y: ry.toFixed(1), width: rw.toFixed(1), height: rh.toFixed(1), rx: 3, fill: 'rgba(56,189,248,0.14)', stroke: strokeCol, 'stroke-width': isSel ? 2 : 1.5 }));
            renderAnchor(x1, y1, strokeCol);
            renderAnchor(x2, y2, strokeCol);
            continue;
          }

          if (dr.tool === 'fib') {
            const fibLevels = [
              { r: 0, c: '#94a3b8' },
              { r: 0.236, c: '#f43f5e' },
              { r: 0.382, c: '#f59e0b' },
              { r: 0.5, c: '#22c55e' },
              { r: 0.618, c: '#38bdf8' },
              { r: 0.786, c: '#a855f7' },
              { r: 1, c: '#94a3b8' },
            ];
            const leftX = Math.min(x1, x2);
            const rightX = Math.max(leftX + 90, Math.max(x1, x2));
            const pStart = dr.p1.price;
            const pEnd = p2.price;
            const y0618 = Number(mainSeries.priceToCoordinate(pEnd + (pStart - pEnd) * 0.618) ?? y1);
            const y0382 = Number(mainSeries.priceToCoordinate(pEnd + (pStart - pEnd) * 0.382) ?? y2);
            frag.appendChild(
              mk('rect', {
                x: leftX.toFixed(1),
                y: Math.min(y0618, y0382).toFixed(1),
                width: (rightX - leftX).toFixed(1),
                height: Math.max(2, Math.abs(y0382 - y0618)).toFixed(1),
                fill: 'rgba(56,189,248,0.10)',
              })
            );
            frag.appendChild(mk('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: '#94a3b8', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
            for (const lv of fibLevels) {
              const px = pEnd + (pStart - pEnd) * lv.r;
              const ly = mainSeries.priceToCoordinate(px);
              if (ly === null) continue;
              frag.appendChild(mk('line', { x1: leftX.toFixed(1), y1: ly.toFixed(1), x2: rightX.toFixed(1), y2: ly.toFixed(1), stroke: lv.c, 'stroke-width': 1.25 }));
              const t = mk('text', { x: (leftX + 4).toFixed(1), y: (ly - 3).toFixed(1), fill: lv.c, 'font-size': 9.5, 'font-weight': 700 });
              t.textContent = `${lv.r} (${fmtPx(px)})`;
              frag.appendChild(t);
            }
            renderAnchor(x1, y1, strokeCol);
            renderAnchor(x2, y2, strokeCol);
            continue;
          }

          if (dr.tool === 'long_pos' || dr.tool === 'short_pos') {
            const isLong = dr.tool === 'long_pos';
            const entry = dr.p1.price;
            const rawTpDist = Math.abs(p2.price - entry);
            const tpDist = rawTpDist > 0 ? rawTpDist : entry * 0.03;
            const tpPx = isLong ? entry + tpDist : entry - tpDist;
            const slDist = tpDist * 0.5;
            const slPx = isLong ? entry - slDist : entry + slDist;
            const yEntry = mainSeries.priceToCoordinate(entry);
            const yTp = mainSeries.priceToCoordinate(tpPx);
            const ySl = mainSeries.priceToCoordinate(slPx);
            if (yEntry === null || yTp === null || ySl === null) continue;
            const bx = Math.min(x1, x2);
            const bw = Math.max(95, Math.abs(x2 - x1));
            const tpTop = Math.min(yEntry, yTp);
            const tpH = Math.max(6, Math.abs(yTp - yEntry));
            const slTop = Math.min(yEntry, ySl);
            const slH = Math.max(6, Math.abs(ySl - yEntry));
            frag.appendChild(mk('rect', { x: bx.toFixed(1), y: tpTop.toFixed(1), width: bw.toFixed(1), height: tpH.toFixed(1), fill: 'rgba(16,217,163,0.18)', stroke: '#10d9a3', 'stroke-width': 1.2 }));
            frag.appendChild(mk('rect', { x: bx.toFixed(1), y: slTop.toFixed(1), width: bw.toFixed(1), height: slH.toFixed(1), fill: 'rgba(244,63,94,0.18)', stroke: '#f43f5e', 'stroke-width': 1.2 }));
            frag.appendChild(mk('line', { x1: bx.toFixed(1), y1: yEntry.toFixed(1), x2: (bx + bw).toFixed(1), y2: yEntry.toFixed(1), stroke: '#e2e8f0', 'stroke-width': 1.5 }));
            const tpPct = ((tpDist / Math.max(1e-9, entry)) * 100).toFixed(2);
            const slPct = ((slDist / Math.max(1e-9, entry)) * 100).toFixed(2);
            const badgeY = yEntry - 10;
            frag.appendChild(mk('rect', { x: (bx + 4).toFixed(1), y: badgeY.toFixed(1), width: Math.min(bw - 8, 165).toFixed(1), height: 18, rx: 4, fill: 'rgba(15,23,42,0.9)', stroke: '#38bdf8', 'stroke-width': 1 }));
            const lbl = mk('text', { x: (bx + 10).toFixed(1), y: (badgeY + 12).toFixed(1), fill: '#f8fafc', 'font-size': 9.5, 'font-weight': 800 });
            lbl.textContent = `${isLong ? 'LONG' : 'SHORT'} R:R 1:2.0 | +${tpPct}% / -${slPct}%`;
            frag.appendChild(lbl);
            continue;
          }

          if (dr.tool === 'measure') {
            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.max(4, Math.abs(x2 - x1));
            const rh = Math.max(4, Math.abs(y2 - y1));
            const diff = p2.price - dr.p1.price;
            const pct = dr.p1.price > 0 ? (diff / dr.p1.price) * 100 : 0;
            const bars = Math.max(1, Math.round(Math.abs(p2.time - dr.p1.time) / timeStep));
            const col = diff >= 0 ? '#10d9a3' : '#f43f5e';
            frag.appendChild(mk('rect', { x: rx.toFixed(1), y: ry.toFixed(1), width: rw.toFixed(1), height: rh.toFixed(1), fill: diff >= 0 ? 'rgba(16,217,163,0.16)' : 'rgba(244,63,94,0.16)', stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '4 2' }));
            frag.appendChild(mk('rect', { x: (rx + rw / 2 - 58).toFixed(1), y: (ry + rh / 2 - 11).toFixed(1), width: 116, height: 22, rx: 6, fill: 'rgba(15,23,42,0.92)', stroke: col, 'stroke-width': 1 }));
            const t = mk('text', { x: (rx + rw / 2).toFixed(1), y: (ry + rh / 2 + 3.5).toFixed(1), 'text-anchor': 'middle', fill: '#ffffff', 'font-size': 10, 'font-weight': 800 });
            t.textContent = `${diff >= 0 ? '+' : ''}${pct.toFixed(2)}% (${bars} bars)`;
            frag.appendChild(t);
            continue;
          }

          if (dr.tool === 'text' && dr.text) {
            const bw = Math.max(54, dr.text.length * 6.8 + 14);
            frag.appendChild(mk('rect', { x: (x1 - 4).toFixed(1), y: (y1 - 16).toFixed(1), width: bw.toFixed(1), height: 22, rx: 6, fill: 'rgba(15,23,42,0.9)', stroke: strokeCol, 'stroke-width': 1.2 }));
            const t = mk('text', { x: (x1 + 3).toFixed(1), y: (y1 - 2).toFixed(1), fill: '#f8fafc', 'font-size': 10.5, 'font-weight': 700 });
            t.textContent = dr.text;
            frag.appendChild(t);
          }
        }
      }

      svg.replaceChildren(frag);
    };

    drawSvgOverlayRef.current = drawSvgOverlay;
    const scheduleDraw = () => requestAnimationFrame(drawSvgOverlay);
    scheduleDraw();
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleDraw);

    // Crosshair hover OHLC readout + Live drawing point preview
    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (param.time) {
        const tNum = Number(param.time);
        const found = candlesLookupRef.current.get(tNum);
        if (found) {
          const chg = found.open > 0 ? ((found.close - found.open) / found.open) * 100 : 0;
          setHoverBar({
            open: found.open,
            high: found.high,
            low: found.low,
            close: found.close,
            volume: found.volume,
            chgPct: chg,
          });
        }
      }
      if (param.point && activeTool !== 'cursor') {
        const px = mainSeries.coordinateToPrice(param.point.y);
        if (px !== null && Number.isFinite(px)) {
          let t = param.time ? Number(param.time) : null;
          if (t === null && sortedCandles.length >= 2) {
            const logical = chart.timeScale().coordinateToLogical(param.point.x);
            if (logical !== null) {
              const lastIdx = sortedCandles.length - 1;
              t = Math.round(maxCandleTime + (logical - lastIdx) * timeStep);
            }
          }
          if (t !== null) {
            setHoverPoint({ time: t, price: Number(px) });
          }
        }
      }
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    // Create synced Sub-Pane Charts for Oscillators / Volume Indicators
    const subCharts: IChartApi[] = [];
    let isSyncingRange = false;

    for (const sp of allSubPanes) {
      const subEl = subPaneRefs.current.get(sp.uid);
      if (!subEl) continue;
      const sc = createChart(subEl, {
        width: Math.max(300, subEl.clientWidth || 720),
        height: 122,
        layout: {
          background: { type: ColorType.Solid, color: isLight ? '#f8fafc' : '#050a16' },
          textColor: isLight ? '#4b6491' : '#96a9cf',
        },
        grid: {
          vertLines: { color: isLight ? 'rgba(12, 68, 200, 0.045)' : 'rgba(120, 165, 255, 0.045)' },
          horzLines: { color: isLight ? 'rgba(12, 68, 200, 0.045)' : 'rgba(120, 165, 255, 0.045)' },
        },
        timeScale: { timeVisible: true, rightOffset: 10, borderColor: 'rgba(120,165,255,0.12)' },
        rightPriceScale: { borderColor: 'rgba(120,165,255,0.12)' },
      });

      let firstSeries: ISeriesApi<'Line'> | ISeriesApi<'Histogram'> | null = null;
      for (const pl of sp.plots) {
        if (!pl.points.length) continue;
        if (pl.style === 'histogram' || pl.style === 'columns') {
          const hs = sc.addHistogramSeries({ color: pl.color || '#38e1ff', priceLineVisible: false });
          hs.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) }))));
          if (!firstSeries) firstSeries = hs;
        } else {
          const ls = sc.addLineSeries({ color: pl.color || '#38e1ff', lineWidth: Math.max(1, Math.min(3, pl.linewidth || 2)) as 1 | 2 | 3, priceLineVisible: false });
          ls.setData(dedupAsc(pl.points.map((p) => ({ time: p.time as Time, value: p.value }))));
          if (!firstSeries) firstSeries = ls;
        }
      }
      if (firstSeries) {
        for (const hl of sp.hlines) {
          firstSeries.createPriceLine({
            price: hl.price,
            color: hl.color || '#94a3b8',
            lineWidth: 1,
            lineStyle: toLwLineStyle(hl.linestyle),
            axisLabelVisible: true,
            title: hl.title,
          });
        }
      }
      sc.timeScale().fitContent();

      sc.timeScale().subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
        if (isSyncingRange || !range) return;
        isSyncingRange = true;
        try {
          chart.timeScale().setVisibleLogicalRange(range);
          for (const other of subCharts) {
            if (other !== sc) other.timeScale().setVisibleLogicalRange(range);
          }
        } catch { /* ignore */ }
        isSyncingRange = false;
      });
      subCharts.push(sc);
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
      if (isSyncingRange || !range) return;
      isSyncingRange = true;
      for (const sc of subCharts) {
        try {
          sc.timeScale().setVisibleLogicalRange(range);
        } catch { /* ignore */ }
      }
      isSyncingRange = false;
      scheduleDraw();
    });

    const ro = new ResizeObserver(() => {
      if (el && el.clientWidth > 0) {
        chart.applyOptions({ width: el.clientWidth });
        scheduleDraw();
      }
      for (const sp of allSubPanes) {
        const sEl = subPaneRefs.current.get(sp.uid);
        const idx = allSubPanes.indexOf(sp);
        if (sEl && subCharts[idx] && sEl.clientWidth > 0) {
          subCharts[idx]!.applyOptions({ width: sEl.clientWidth });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try {
        chart.unsubscribeCrosshairMove(onCrosshairMove);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleDraw);
        chart.remove();
      } catch { /* ignore */ }
      for (const sc of subCharts) {
        try {
          sc.remove();
        } catch { /* ignore */ }
      }
    };
  }, [
    displayCandles,
    chartType,
    scaleMode,
    effectiveHeight,
    isLight,
    levels,
    overlays,
    kbosOverlays,
    customOverlays,
    computedIndicators,
    allSubPanes,
    showKbos,
    showCustomOverlay,
    showMarkers,
    symbol,
    activeTool,
    chartEngine,
  ]);

  // Interactive click handler on chart canvas for placing drawings
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'cursor') return;
    const el = containerRef.current;
    const chart = chartApiRef.current;
    const series = candleSeriesRef.current;
    if (!el || !chart || !series || displayCandles.length < 2) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rawPrice = series.coordinateToPrice(y);
    if (rawPrice === null || !Number.isFinite(rawPrice)) return;
    let snappedPrice = Number(rawPrice);

    const timeVal = chart.timeScale().coordinateToTime(x);
    let timeSec = timeVal !== null ? Number(timeVal) : null;
    const lastT = Math.floor(displayCandles[displayCandles.length - 1]!.timestamp / 1000);
    const stepSec = Math.max(60, Math.floor((displayCandles[1]!.timestamp - displayCandles[0]!.timestamp) / 1000));
    if (timeSec === null) {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null) return;
      timeSec = Math.round(lastT + (logical - (displayCandles.length - 1)) * stepSec);
    }

    // Magnet snap to nearest OHLC
    if (magnetOn) {
      const nearest = candlesLookupRef.current.get(timeSec);
      if (nearest) {
        const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
        snappedPrice = candidates.reduce(
          (best, cur) => (Math.abs(cur - snappedPrice) < Math.abs(best - snappedPrice) ? cur : best),
          candidates[0]!
        );
      }
    }

    const pt: ChartDrawingPoint = { time: timeSec, price: snappedPrice };

    const paletteByTool: Record<Exclude<DrawingToolType, 'cursor'>, string> = {
      trendline: '#38bdf8',
      ray: '#22d3ee',
      hline: '#f59e0b',
      vline: '#94a3b8',
      rect: '#38bdf8',
      fib: '#a855f7',
      long_pos: '#10d9a3',
      short_pos: '#f43f5e',
      measure: '#38bdf8',
      text: '#fbbf24',
    };

    // Single-click tools
    if (activeTool === 'hline' || activeTool === 'vline' || activeTool === 'text') {
      let note: string | undefined;
      if (activeTool === 'text') {
        const entered = window.prompt(isFa ? 'متن برچسب روی چارت:' : 'Chart text annotation:', isFa ? 'ناحیه کلیدی' : 'Key Zone');
        if (!entered) return;
        note = entered;
      }
      const nextItem: ChartDrawing = {
        id: `dr_${Date.now().toString(36)}`,
        tool: activeTool,
        p1: pt,
        color: paletteByTool[activeTool],
        text: note,
      };
      const next = [...drawings, nextItem];
      setDrawings(next);
      saveDrawingsForSymbol(symbol, next);
      setActiveTool('cursor');
      return;
    }

    // Two-click tools
    if (!draftStart) {
      setDraftStart(pt);
      setHoverPoint(pt);
    } else {
      const nextItem: ChartDrawing = {
        id: `dr_${Date.now().toString(36)}`,
        tool: activeTool,
        p1: draftStart,
        p2: pt,
        color: paletteByTool[activeTool],
      };
      const next = [...drawings, nextItem];
      setDrawings(next);
      saveDrawingsForSymbol(symbol, next);
      setDraftStart(null);
      setHoverPoint(null);
      setActiveTool('cursor');
    }
  };

  const takeScreenshot = () => {
    const chart = chartApiRef.current;
    if (!chart) return;
    try {
      const canvas = chart.takeScreenshot();
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `dollarino-${symbol}-${timeframe}.png`;
      a.click();
    } catch {
      /* ignore */
    }
  };

  const latestBar = displayCandles[displayCandles.length - 1];
  const ohlcShown = hoverBar ?? (latestBar ? {
    open: latestBar.open,
    high: latestBar.high,
    low: latestBar.low,
    close: latestBar.close,
    volume: latestBar.volume,
    chgPct: latestBar.open > 0 ? ((latestBar.close - latestBar.open) / latestBar.open) * 100 : 0,
  } : null);

  const drawingToolsList: Array<{ id: DrawingToolType; labelFa: string; labelEn: string; icon: typeof Crosshair }> = [
    { id: 'cursor', labelFa: 'نشانگر', labelEn: 'Crosshair', icon: MousePointer2 },
    { id: 'trendline', labelFa: 'خط روند', labelEn: 'Trend Line', icon: TrendingUp },
    { id: 'ray', labelFa: 'نیم‌خط', labelEn: 'Ray', icon: Activity },
    { id: 'hline', labelFa: 'خط افقی S/R', labelEn: 'Horizontal Line', icon: Minus },
    { id: 'vline', labelFa: 'خط عمودی', labelEn: 'Vertical Line', icon: SlidersHorizontal },
    { id: 'rect', labelFa: 'باکس ناحیه (OB/FVG)', labelEn: 'Rectangle Zone', icon: Square },
    { id: 'fib', labelFa: 'فیبوناچی اصلاحی', labelEn: 'Fib Retracement', icon: Percent },
    { id: 'long_pos', labelFa: 'ابزار پوزیشن Long R:R', labelEn: 'Long Position R:R', icon: TrendingUp },
    { id: 'short_pos', labelFa: 'ابزار پوزیشن Short R:R', labelEn: 'Short Position R:R', icon: TrendingDown },
    { id: 'measure', labelFa: 'خط‌کش درصد و کندل', labelEn: 'Price Range Measure', icon: Ruler },
    { id: 'text', labelFa: 'یادداشت متنی', labelEn: 'Text Annotation', icon: Type },
  ];

  const editingIndicator = editingIndUid ? activeIndicators.find((x) => x.uid === editingIndUid) : undefined;
  const editingIndicatorDef = editingIndicator ? getTvIndicatorDef(editingIndicator.id) : undefined;

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[190] bg-[var(--bg)] p-3 sm:p-4 flex flex-col gap-2 overflow-y-auto'
          : 'flex flex-col gap-2'
      }
    >
      {/* 1. TradingView Top Superchart Toolbar */}
      <div className="surface-soft border hairline rounded-2xl px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {/* Left: Symbol + Timeframes + Chart Type */}
        <div className="flex flex-wrap items-center gap-1.5">
          <SymbolPicker
            lang={lang}
            compact
            markets={markets}
            value={symbol}
            provider={provider || 'paper'}
            marketType={marketType}
            onChangeMarketType={onChangeMarketType}
            onChange={onChangeSymbol}
          />

          <div className="h-5 w-px bg-[var(--line)] mx-0.5 hidden sm:block" />

          {/* Quick Timeframes + Dropdown for all 10 including 1w */}
          <div className="relative flex items-center gap-0.5 bg-[var(--panel)] p-0.5 rounded-xl border hairline">
            {QUICK_TIMEFRAMES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => onChangeTimeframe(x)}
                className={`px-2 py-1 rounded-lg font-num font-bold transition ${
                  timeframe === x ? 'btn-gold shadow-xs' : 'text-dim hover:text-main'
                }`}
              >
                {x}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMoreTf((v) => !v)}
              className="px-1.5 py-1 rounded-lg text-dim hover:text-main inline-flex items-center"
              title={isFa ? 'همه تایم‌فریم‌ها' : 'All timeframes'}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showMoreTf && (
              <div className="absolute top-full mt-1.5 start-0 z-50 panel !bg-[var(--panel)] border hairline rounded-xl p-1.5 shadow-xl grid grid-cols-5 gap-1 w-56">
                {ALL_TIMEFRAMES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => {
                      onChangeTimeframe(x);
                      setShowMoreTf(false);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-num font-bold ${
                      timeframe === x ? 'btn-gold' : 'surface-soft text-dim hover:text-main'
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart Engine Mode Switch: Dollarino Quant (AI + Pine + KBOS) vs Genuine TradingView Widget */}
          <div className="inline-flex items-center rounded-xl bg-[var(--panel)] border hairline p-0.5">
            <button
              type="button"
              onClick={() => setChartEngine('quant')}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-black transition ${
                chartEngine === 'quant' ? 'btn-cobalt text-white' : 'text-dim hover:text-main'
              }`}
            >
              {isFa ? 'Quant + AI' : 'Quant + AI'}
            </button>
            <button
              type="button"
              onClick={() => setChartEngine('tv_widget')}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-black transition ${
                chartEngine === 'tv_widget' ? 'btn-gold' : 'text-dim hover:text-main'
              }`}
            >
              TradingView
            </button>
          </div>

          {/* Chart Type Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTypeMenu((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--panel)] border hairline font-bold text-main inline-flex items-center gap-1 hover:border-[var(--gold)] transition"
            >
              <span>
                {isFa
                  ? CHART_TYPE_OPTIONS.find((o) => o.id === chartType)?.labelFa
                  : CHART_TYPE_OPTIONS.find((o) => o.id === chartType)?.labelEn}
              </span>
              <ChevronDown className="w-3 h-3 text-dim" />
            </button>
            {showTypeMenu && (
              <div className="absolute top-full mt-1.5 start-0 z-50 panel !bg-[var(--panel)] border hairline rounded-xl p-1.5 shadow-xl w-44 space-y-0.5">
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setChartType(opt.id);
                      saveChartType(opt.id);
                      setShowTypeMenu(false);
                    }}
                    className={`w-full text-start px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${
                      chartType === opt.id ? 'btn-gold' : 'text-sub hover:bg-[var(--soft)] hover:text-main'
                    }`}
                  >
                    {isFa ? opt.labelFa : opt.labelEn}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* fx Indicators Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowIndicatorsModal(true)}
            className="px-2.5 py-1.5 rounded-xl bg-[var(--panel)] border hairline hover:border-[var(--gold)] font-black text-main inline-flex items-center gap-1.5 transition"
          >
            <span className="font-serif italic text-[var(--gold)] text-xs">fx</span>
            <span>{isFa ? 'اندیکاتورها' : 'Indicators'}</span>
            {activeIndicators.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] font-num text-[10px]">
                {activeIndicators.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleKbos}
            className={`px-2 py-1.5 rounded-xl text-[10.5px] font-bold inline-flex items-center gap-1 transition ${
              showKbos ? 'badge-signal' : 'bg-[var(--panel)] border hairline text-dim'
            }`}
          >
            <Eye className="w-3 h-3" /> KBOS
          </button>
        </div>

        {/* Right: Multi-Chart Layout, Scale, Pine Dock, AI, Screenshot, Fullscreen */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Multi-Chart Layout Switcher */}
          <div className="flex items-center gap-0.5 bg-[var(--panel)] p-0.5 rounded-xl border hairline">
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
                  className={`px-2 py-1 rounded-lg font-num font-bold inline-flex items-center gap-1 transition ${
                    layoutMode === ly.id ? 'btn-gold' : 'text-dim hover:text-main'
                  }`}
                  title={isFa ? `چیدمان ${ly.label}` : `Layout ${ly.label}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline text-[10px]">{ly.label}</span>
                </button>
              );
            })}
          </div>

          {/* Price Scale Mode (Auto / Log / %) */}
          <button
            type="button"
            onClick={() => setScaleMode((m) => (m === 'normal' ? 'log' : m === 'log' ? 'percent' : 'normal'))}
            className={`px-2 py-1.5 rounded-xl border hairline text-[10px] font-black uppercase transition ${
              scaleMode !== 'normal' ? 'btn-cobalt' : 'bg-[var(--panel)] text-dim hover:text-main'
            }`}
            title={isFa ? 'تغییر مقیاس (Auto / Log / %)' : 'Scale Mode (Auto / Log / %)'}
          >
            {scaleMode === 'normal' ? 'Auto' : scaleMode === 'log' ? 'Log' : '%'}
          </button>

          <button
            type="button"
            onClick={() => setShowWatchlistSidebar((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl font-black inline-flex items-center gap-1 transition ${
              showWatchlistSidebar ? 'btn-cobalt' : 'bg-[var(--panel)] border hairline text-dim hover:text-main'
            }`}
            title={isFa ? 'پنل واچ‌لیست و عقربه تکنیکال' : 'Watchlist & Technicals'}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isFa ? 'تکنیکال و واچ‌لیست' : 'Watchlist'}</span>
          </button>

          <button
            type="button"
            onClick={onTogglePineDock}
            className={`px-2.5 py-1.5 rounded-xl font-black inline-flex items-center gap-1 transition ${
              pineDockOpen || customOverlays ? 'btn-lime' : 'bg-[var(--panel)] border hairline text-dim hover:text-main'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Pine v6</span>
          </button>

          {onRunAiAnalyze && (
            <button
              type="button"
              disabled={aiLoading}
              onClick={onRunAiAnalyze}
              className="btn-gold px-2.5 py-1.5 rounded-xl font-black inline-flex items-center gap-1"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>{aiLoading ? '...' : isFa ? 'تحلیل AI' : 'AI'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={takeScreenshot}
            className="p-1.5 rounded-xl bg-[var(--panel)] border hairline text-dim hover:text-main transition"
            title={isFa ? 'ذخیره تصویر چارت (PNG)' : 'Download Chart Screenshot'}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="p-1.5 rounded-xl bg-[var(--panel)] border hairline text-dim hover:text-main transition"
            title={isFa ? 'تمام‌صفحه (Esc)' : 'Fullscreen (Esc)'}
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Main Superchart Workspace: TradingView Real Widget OR Quant Chart (Drawing Sidebar + Canvas + Sub-Panes) */}
      {chartEngine === 'tv_widget' ? (
        <TradingViewRealWidget
          symbol={symbol}
          timeframe={timeframe}
          lang={lang}
          height={Math.max(460, effectiveHeight + 45)}
          isLight={isLight}
        />
      ) : (
      <div className="flex gap-2 items-stretch">
        {/* Left Drawing Toolbar (TradingView style) */}
        <div
          className="w-10 shrink-0 rounded-2xl border hairline bg-[var(--soft)]/80 py-2 flex flex-col items-center gap-1 select-none"
          title={isFa ? 'ابزارهای رسم تکنیکال' : 'Drawing Tools'}
        >
          {drawingToolsList.map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  setDraftStart(null);
                  setActiveTool(tool.id);
                }}
                title={isFa ? tool.labelFa : tool.labelEn}
                className={`w-7.5 h-7.5 p-1.5 rounded-lg grid place-items-center transition ${
                  active ? 'btn-gold shadow-xs' : 'text-dim hover:text-main hover:bg-[var(--panel)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}

          <div className="w-5 h-px bg-[var(--line)] my-1" />

          <button
            type="button"
            onClick={() => setMagnetOn((v) => !v)}
            title={isFa ? 'آهنربای کندل (Magnet OHLC)' : 'Magnet OHLC Snap'}
            className={`p-1.5 rounded-lg transition ${magnetOn ? 'btn-cobalt' : 'text-dim hover:text-main'}`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowDrawings((v) => !v)}
            title={isFa ? 'نمایش / مخفی کردن رسم‌ها' : 'Show / Hide Drawings'}
            className={`p-1.5 rounded-lg transition ${showDrawings ? 'text-main' : 'text-dim opacity-50'}`}
          >
            {showDrawings ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            disabled={drawings.length === 0}
            onClick={() => {
              const next = drawings.slice(0, -1);
              setDrawings(next);
              saveDrawingsForSymbol(symbol, next);
            }}
            title={isFa ? 'واگرد آخرین رسم' : 'Undo Last Drawing'}
            className="p-1.5 rounded-lg text-dim hover:text-main disabled:opacity-30 transition"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={drawings.length === 0}
            onClick={() => {
              setDrawings([]);
              saveDrawingsForSymbol(symbol, []);
              setSelectedDrawingId(null);
            }}
            title={isFa ? 'پاک کردن همه رسم‌های این نماد' : 'Clear All Drawings'}
            className="p-1.5 rounded-lg text-dim hover:text-loss disabled:opacity-30 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Canvas Column: Main Price Chart + Synchronized Oscillator Sub-Panes */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Active Drawing Mode Helper Banner */}
          {activeTool !== 'cursor' && (
            <div className="px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-[11px] font-bold text-sky-300 flex items-center justify-between gap-2">
              <span>
                {draftStart
                  ? isFa
                    ? `نقطه اول ثبت شد — روی نقطه دوم چارت کلیک کنید (${drawingToolsList.find((x) => x.id === activeTool)?.labelFa})`
                    : `Anchor 1 placed — click destination point on chart`
                  : isFa
                    ? `حالت رسم فعال: ${drawingToolsList.find((x) => x.id === activeTool)?.labelFa} — روی چارت کلیک کنید`
                    : `Drawing active: ${drawingToolsList.find((x) => x.id === activeTool)?.labelEn} — click on chart`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraftStart(null);
                  setActiveTool('cursor');
                }}
                className="underline text-[10px]"
              >
                {isFa ? 'لغو (Esc)' : 'Cancel (Esc)'}
              </button>
            </div>
          )}

          {/* Main Chart Container */}
          <div
            onClick={handleChartClick}
            className={`relative w-full rounded-2xl overflow-hidden border hairline ${
              activeTool !== 'cursor' ? 'cursor-crosshair' : ''
            }`}
          >
            {/* Subtle TradingView Center Background Watermark (e.g. SOLUSDT, 1D) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0 select-none overflow-hidden">
              <div className="text-center opacity-[0.065]">
                <p dir="ltr" className="font-display font-black text-4xl sm:text-6xl tracking-tight text-main">
                  {symbol}, {timeframe.toUpperCase()}
                </p>
                <p className="text-xs sm:text-sm font-black tracking-[0.25em] uppercase text-main mt-1">
                  DOLLARINO SUPERCHARTS
                </p>
              </div>
            </div>
            <div ref={containerRef} className="w-full" />
            <svg ref={svgOverlayRef} className="pointer-events-none absolute inset-0 w-full h-full z-10" />
            {candles.length === 0 && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-[var(--panel)]/85 backdrop-blur-sm space-y-2.5">
                <p className="text-xs font-black text-main">
                  {isFa
                    ? `داده کندلی زنده برای ${symbol} از صرافی دریافت نشد (بدون کندل مصنوعی).`
                    : `No live exchange candles available for ${symbol} (synthetic candles disabled).`}
                </p>
                <button
                  type="button"
                  onClick={() => setChartEngine('tv_widget')}
                  className="btn-gold px-3.5 py-1.5 rounded-xl text-xs font-black"
                >
                  {isFa ? 'نمایش در TradingView واقعی' : 'Open Real TradingView Chart'}
                </button>
              </div>
            )}

            {/* Floating TradingView OHLC + Active Indicator Legend */}
            <div
              dir="ltr"
              className="pointer-events-none absolute top-2 left-2.5 right-24 z-20 flex flex-col gap-1 items-start"
            >
              <div className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-2.5 py-1 rounded-xl bg-[var(--panel)]/88 backdrop-blur-md border hairline text-[10.5px] shadow-sm">
                <span className="inline-flex items-center gap-1.5 font-black text-main">
                  <CoinIcon symbol={symbol} size={14} />
                  <span>{symbol} · {timeframe}</span>
                </span>
                {ohlcShown && (
                  <div className="flex flex-wrap items-center gap-2 font-num text-[10px]">
                    <span className="text-dim">O <strong className="text-main">{fmtPx(ohlcShown.open)}</strong></span>
                    <span className="text-dim">H <strong className="text-jade">{fmtPx(ohlcShown.high)}</strong></span>
                    <span className="text-dim">L <strong className="text-loss">{fmtPx(ohlcShown.low)}</strong></span>
                    <span className="text-dim">
                      C <strong className={ohlcShown.chgPct >= 0 ? 'text-jade' : 'text-loss'}>{fmtPx(ohlcShown.close)}</strong>
                    </span>
                    <span className={`font-black ${ohlcShown.chgPct >= 0 ? 'text-jade' : 'text-loss'}`}>
                      ({ohlcShown.chgPct >= 0 ? '+' : ''}{ohlcShown.chgPct.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Active Indicators Legend Pills */}
              <div className="pointer-events-auto flex flex-wrap items-center gap-1">
                {computedIndicators.legends.map((lg) => (
                  <div
                    key={lg.uid}
                    className={`relative px-2 py-0.5 rounded-lg bg-slate-950/65 backdrop-blur-md border border-white/10 text-[10px] inline-flex items-center gap-1.5 transition ${
                      lg.visible ? '' : 'opacity-50'
                    }`}
                  >
                    <span className="font-bold text-slate-200">{lg.title}</span>
                    {lg.values.map((v, vi) => (
                      <span key={vi} className="font-num font-bold" style={{ color: v.color }}>
                        {v.label ? `${v.label}: ` : ''}
                        {v.value}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIndicators((prev) =>
                          prev.map((item) => (item.uid === lg.uid ? { ...item, visible: !item.visible } : item))
                        );
                      }}
                      className="text-slate-400 hover:text-white"
                      title={lg.visible ? 'Hide' : 'Show'}
                    >
                      {lg.visible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIndUid((cur) => (cur === lg.uid ? null : lg.uid));
                      }}
                      className="text-slate-400 hover:text-amber-400"
                      title="Settings"
                    >
                      <Settings2 className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIndicators((prev) => prev.filter((item) => item.uid !== lg.uid));
                      }}
                      className="text-slate-400 hover:text-rose-400"
                      title="Remove"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}

                {customOverlays && (
                  <div className="px-2 py-0.5 rounded-lg bg-emerald-950/75 backdrop-blur-md border border-emerald-400/30 text-[10px] inline-flex items-center gap-1.5 text-emerald-200 font-bold">
                    <span>
                      {customOverlays.pineVersion ? `Pine v${customOverlays.pineVersion}` : customOverlays.language?.toUpperCase()} · {customOverlays.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCustomOverlay((v) => !v);
                      }}
                      className="hover:text-white"
                    >
                      {showCustomOverlay ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                    </button>
                    {onClearCustomOverlay && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearCustomOverlay();
                        }}
                        className="hover:text-rose-300"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Inline Indicator Parameter Editor Popover */}
              {editingIndicator && editingIndicatorDef && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto mt-1 p-2.5 rounded-xl bg-slate-900/95 border border-white/15 shadow-2xl flex flex-wrap items-center gap-2 text-[10.5px]"
                >
                  <span className="font-black text-amber-300">{editingIndicatorDef.shortName}:</span>
                  {Object.entries(editingIndicator.params).map(([k, val]) => {
                    const meta = editingIndicatorDef.paramLabels?.[k];
                    return (
                      <label key={k} className="flex items-center gap-1 text-slate-300">
                        <span>{isFa ? meta?.fa ?? k : meta?.en ?? k}</span>
                        <input
                          type="number"
                          min={meta?.min ?? 1}
                          max={meta?.max ?? 500}
                          step={meta?.step ?? 1}
                          value={val}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            if (!Number.isFinite(num)) return;
                            updateIndicators((prev) =>
                              prev.map((item) =>
                                item.uid === editingIndicator.uid
                                  ? { ...item, params: { ...item.params, [k]: num } }
                                  : item
                              )
                            );
                          }}
                          className="w-14 px-1.5 py-0.5 rounded bg-black/50 border border-white/15 text-white font-num text-center outline-none"
                        />
                      </label>
                    );
                  })}
                  <input
                    type="color"
                    value={editingIndicator.color || editingIndicatorDef.defaultColor}
                    onChange={(e) => {
                      const c = e.target.value;
                      updateIndicators((prev) =>
                        prev.map((item) => (item.uid === editingIndicator.uid ? { ...item, color: c } : item))
                      );
                    }}
                    className="w-6 h-5 rounded cursor-pointer bg-transparent border-0"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingIndUid(null)}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-bold"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>

            {/* TradingView table.new HUD overlays */}
            {showCustomOverlay &&
              customOverlays?.tables?.map((tbl, tIdx) => {
                const cellGrid: Array<Array<CustomChartTable['cells'][number] | undefined>> = Array.from(
                  { length: tbl.rows },
                  () => Array.from({ length: tbl.columns }, () => undefined)
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

            {/* Drawings quick selector pills when drawings exist */}
            {drawings.length > 0 && showDrawings && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-8 left-2.5 z-20 flex items-center gap-1 flex-wrap max-w-[75%]"
              >
                <span className="px-2 py-0.5 rounded-lg bg-slate-950/75 border border-white/10 text-[9.5px] font-bold text-slate-300">
                  {drawings.length} {isFa ? 'رسم' : 'drawings'}
                </span>
                {drawings.slice(-4).map((dr) => (
                  <button
                    key={dr.id}
                    type="button"
                    onClick={() => setSelectedDrawingId((cur) => (cur === dr.id ? null : dr.id))}
                    className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold inline-flex items-center gap-1 border ${
                      selectedDrawingId === dr.id
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                        : 'bg-slate-950/70 border-white/10 text-slate-300'
                    }`}
                  >
                    <span>{dr.tool}</span>
                    <X
                      className="w-2.5 h-2.5 hover:text-rose-400"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const next = drawings.filter((x) => x.id !== dr.id);
                        setDrawings(next);
                        saveDrawingsForSymbol(symbol, next);
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TradingView Bottom Time Range Bar (1D..All + UTC Clock + % / log / Auto) */}
          <div
            dir="ltr"
            className="rounded-xl border hairline bg-[var(--soft)]/80 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px]"
          >
            <div className="flex items-center gap-0.5 flex-wrap">
              {['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'].map((rng) => (
                <button
                  key={rng}
                  type="button"
                  onClick={() => applyTimeRangePreset(rng)}
                  className={`px-2 py-0.5 rounded-md font-num font-bold transition ${
                    activeRangePreset === rng
                      ? 'bg-[var(--panel)] text-main border hairline shadow-xs'
                      : 'text-dim hover:text-main'
                  }`}
                >
                  {rng}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 font-num text-dim">
              <span>{utcClock} (UTC)</span>
              <span className="text-[var(--line-strong)]">|</span>
              <button
                type="button"
                onClick={() => setScaleMode((m) => (m === 'percent' ? 'normal' : 'percent'))}
                className={`px-1.5 py-0.5 rounded font-bold ${scaleMode === 'percent' ? 'text-brand bg-sky-500/15' : 'hover:text-main'}`}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setScaleMode((m) => (m === 'log' ? 'normal' : 'log'))}
                className={`px-1.5 py-0.5 rounded font-bold ${scaleMode === 'log' ? 'text-brand bg-sky-500/15' : 'hover:text-main'}`}
              >
                log
              </button>
              <button
                type="button"
                onClick={() => {
                  setScaleMode('normal');
                  chartApiRef.current?.timeScale().fitContent();
                }}
                className={`px-1.5 py-0.5 rounded font-bold ${scaleMode === 'normal' ? 'text-brand bg-sky-500/15' : 'hover:text-main'}`}
              >
                auto
              </button>
            </div>
          </div>

          {/* Synchronized Oscillator Sub-Panes (RSI, MACD, Stoch, ADX, Pine Sub-Pane) */}
          {allSubPanes.map((sp) => (
            <div key={sp.uid} className="relative w-full rounded-2xl overflow-hidden border hairline">
              <div
                dir="ltr"
                className="absolute top-1.5 left-2.5 z-20 px-2 py-0.5 rounded-lg bg-slate-950/70 backdrop-blur-sm border border-white/10 text-[10px] font-bold text-slate-200 inline-flex items-center gap-2"
              >
                <span>{sp.title}</span>
                {sp.lastSummary && <span className="font-num text-amber-300">{sp.lastSummary}</span>}
                {sp.id !== 'PINE_SUB' && (
                  <button
                    type="button"
                    onClick={() => updateIndicators((prev) => prev.filter((item) => item.uid !== sp.uid))}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div
                ref={(node) => {
                  if (node) subPaneRefs.current.set(sp.uid, node);
                  else subPaneRefs.current.delete(sp.uid);
                }}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {/* Right TradingView Dock (Watchlist + Technicals Summary Gauge matching image-11.png) */}
        {showWatchlistSidebar && (
          <aside
            style={{ maxHeight: effectiveHeight + 40 }}
            className="hidden lg:flex w-[215px] shrink-0 flex-col justify-between gap-2 rounded-2xl border hairline bg-[var(--soft)]/85 p-2 select-none overflow-hidden"
          >
            {/* Top: Watchlist Table */}
            <div className="space-y-1 min-h-0 flex-1 overflow-y-auto pe-0.5">
              <div className="flex items-center justify-between px-1 pb-1 border-b hairline sticky top-0 bg-[var(--soft)] z-10">
                <span className="text-[11px] font-black text-main">
                  {isFa ? 'واچ‌لیست' : 'Watchlist'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowWatchlistSidebar(false)}
                  className="text-dim hover:text-main"
                  title={isFa ? 'بستن ستون' : 'Close panel'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {watchlistRows.map((m) => {
                  const pct = Number(m.changePct24h || 0);
                  const active = m.symbol === symbol;
                  return (
                    <button
                      key={m.symbol}
                      type="button"
                      dir="ltr"
                      onClick={() => onChangeSymbol(m.symbol)}
                      className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg text-[10.5px] transition ${
                        active ? 'bg-sky-500/15 text-main font-black' : 'hover:bg-[var(--panel)] text-sub'
                      }`}
                    >
                      <span className="font-bold truncate inline-flex items-center gap-1.5 shrink-0">
                        <CoinIcon symbol={m.symbol} size={14} />
                        <span>{m.base}</span>
                      </span>
                      <span className="text-end leading-tight font-num">
                        <strong className="block text-[10.5px] font-bold text-main">
                          ${fmtPx(Number(m.lastPrice))}
                        </strong>
                        <span className={`block text-[9.5px] font-black ${pct >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {pct >= 0 ? '+' : ''}
                          {pct.toFixed(2)}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom: TradingView Technicals Semicircle Gauge */}
            <div className="rounded-xl border hairline bg-[var(--panel)] p-2 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-black text-main">{isFa ? 'خلاصه تکنیکال' : 'Technicals'}</span>
                <span dir="ltr" className="text-[9px] font-bold text-dim">{timeframe.toUpperCase()}</span>
              </div>
              <div className="relative flex flex-col items-center">
                <svg viewBox="0 0 180 96" className="w-32 h-16 overflow-visible">
                  <path d="M 18 84 A 70 70 0 0 1 48 29" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" opacity="0.85" />
                  <path d="M 52 26 A 70 70 0 0 1 78 17" fill="none" stroke="#f97316" strokeWidth="8" opacity="0.85" />
                  <path d="M 82 16 A 70 70 0 0 1 98 16" fill="none" stroke="#94a3b8" strokeWidth="8" opacity="0.7" />
                  <path d="M 102 17 A 70 70 0 0 1 128 26" fill="none" stroke="#38bdf8" strokeWidth="8" opacity="0.85" />
                  <path d="M 132 29 A 70 70 0 0 1 162 84" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" opacity="0.9" />
                  {(() => {
                    const angleDeg = -90 + techSummary.score * 75;
                    return (
                      <g transform={`translate(90, 84) rotate(${angleDeg})`}>
                        <line x1="0" y1="0" x2="0" y2="-52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-main" />
                        <circle cx="0" cy="0" r="4" fill="currentColor" className="text-main" />
                      </g>
                    );
                  })()}
                </svg>
                <p
                  className={`text-[11px] font-black -mt-1 ${
                    techSummary.score >= 0.15
                      ? 'text-jade'
                      : techSummary.score <= -0.15
                        ? 'text-loss'
                        : 'text-dim'
                  }`}
                >
                  {isFa ? techSummary.verdictFa : techSummary.verdictEn}
                </p>
              </div>
              <div className="grid grid-cols-3 text-center text-[9.5px] pt-1 border-t hairline">
                <div>
                  <span className="text-dim block">{isFa ? 'فروش' : 'Sell'}</span>
                  <strong className="font-num text-loss">{techSummary.sellCount}</strong>
                </div>
                <div>
                  <span className="text-dim block">{isFa ? 'خنثی' : 'Neutral'}</span>
                  <strong className="font-num text-main">{techSummary.neutralCount}</strong>
                </div>
                <div>
                  <span className="text-dim block">{isFa ? 'خرید' : 'Buy'}</span>
                  <strong className="font-num text-jade">{techSummary.buyCount}</strong>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
      )}

      {/* Indicators & Pine Scripts Catalog Modal */}
      <IndicatorsModal
        open={showIndicatorsModal}
        lang={lang}
        activeIndicators={activeIndicators}
        onAddIndicator={addIndicatorFromModal}
        onRemoveIndicatorById={(id) => updateIndicators((prev) => prev.filter((x) => x.id !== id))}
        onRunPineSample={(sample) => {
          onRunPineSample?.(sample);
        }}
        onClose={() => setShowIndicatorsModal(false)}
      />
    </div>
  );
}
