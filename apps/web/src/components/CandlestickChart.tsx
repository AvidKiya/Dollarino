import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type SeriesMarker, type Time } from 'lightweight-charts';
import type { Candle } from '@dollarino/core';

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

export function CandlestickChart({
  candles,
  levels,
  overlays,
  kbosOverlays,
  showVolume = true,
  height = 420,
}: {
  candles: Candle[];
  levels?: ChartLevels;
  overlays?: ChartOverlays;
  kbosOverlays?: KbosChartOverlays;
  showVolume?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [showKbosHtf, setShowKbosHtf] = useState(true);
  const [showDemaAtr, setShowDemaAtr] = useState(true);
  const [showAlmaRibbon, setShowAlmaRibbon] = useState(true);
  const [showEmas, setShowEmas] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090c12' },
        textColor: '#8d98ab',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.04)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.04)' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        timeVisible: true,
        borderColor: 'rgba(148, 163, 184, 0.14)',
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.14)',
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 },
      },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#27cd86',
      downColor: '#eb493d',
      borderUpColor: '#27cd86',
      borderDownColor: '#eb493d',
      wickUpColor: '#27cd86',
      wickDownColor: '#eb493d',
    });

    if (candles.length > 0) {
      series.setData(
        candles.map((c) => ({
          time: Math.floor(c.timestamp / 1000) as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );

      if (showVolume) {
        const volSeries = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.84, bottom: 0 },
        });
        volSeries.setData(
          candles.map((c) => ({
            time: Math.floor(c.timestamp / 1000) as Time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(39, 205, 134, 0.22)' : 'rgba(235, 73, 61, 0.22)',
          }))
        );
      }

      if (showMarkers && kbosOverlays?.markers?.length) {
        const markers: SeriesMarker<Time>[] = kbosOverlays.markers.map((m) => ({
          time: m.time as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        }));
        series.setMarkers(markers);
      }

      chart.timeScale().fitContent();
    }

    // Standard EMA overlays
    if (showEmas || (!kbosOverlays && overlays)) {
      if (overlays?.ema20?.length) {
        const s20 = chart.addLineSeries({ color: '#38bdf8', lineWidth: 1, priceLineVisible: false });
        s20.setData(overlays.ema20.map((p) => ({ time: p.time as Time, value: p.value })));
      }
      if (overlays?.ema50?.length) {
        const s50 = chart.addLineSeries({ color: '#f59f14', lineWidth: 1, priceLineVisible: false });
        s50.setData(overlays.ema50.map((p) => ({ time: p.time as Time, value: p.value })));
      }
      if (overlays?.ema200?.length) {
        const s200 = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceLineVisible: false });
        s200.setData(overlays.ema200.map((p) => ({ time: p.time as Time, value: p.value })));
      }
    }

    // KBOs v11 Non-repainting HTF Cross Lines
    if (showKbosHtf && kbosOverlays?.closeSeriesAlt?.length && kbosOverlays?.openSeriesAlt?.length) {
      const cLine = chart.addLineSeries({ color: '#27cd86', lineWidth: 2, priceLineVisible: false, title: 'KBOs Close' });
      cLine.setData(kbosOverlays.closeSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value })));
      const oLine = chart.addLineSeries({ color: '#eb493d', lineWidth: 2, priceLineVisible: false, title: 'KBOs Open' });
      oLine.setData(kbosOverlays.openSeriesAlt.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    // DEMA ATR [BackQuant]
    if (showDemaAtr && kbosOverlays?.demaAtr?.length) {
      const daLine = chart.addLineSeries({
        lineWidth: 2,
        priceLineVisible: false,
        title: 'DEMA ATR',
      });
      daLine.setData(
        kbosOverlays.demaAtr.map((p) => ({
          time: p.time as Time,
          value: p.value,
          color: p.trend === 'BULL' ? '#00ffbb' : '#ff1100',
        }))
      );
    }

    // RLA MA 8-Band Golden Ratio ALMA Ribbon
    if (showAlmaRibbon && kbosOverlays?.almaRibbon?.bands?.length) {
      for (const band of kbosOverlays.almaRibbon.bands) {
        if (!band.points.length) continue;
        const bSeries = chart.addLineSeries({
          color: band.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        bSeries.setData(band.points.map((p) => ({ time: p.time as Time, value: p.value })));
      }
    }

    const addLevel = (price: number | undefined, title: string, color: string) => {
      if (!price || !Number.isFinite(price)) return;
      series.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title,
      });
    };

    if (levels) {
      addLevel(levels.entry, 'ENTRY', '#4b73f5');
      addLevel(levels.stopLoss, 'STOP LOSS', '#eb493d');
      addLevel(levels.tp1, 'TP1 (30%)', '#27cd86');
      addLevel(levels.tp2, 'TP2 (30%)', '#f59f14');
      addLevel(levels.tp3, 'TP3 (40%)', '#f97316');
      levels.supports?.forEach((s, idx) => addLevel(s, `S${idx + 1}`, '#22d3ee'));
      levels.resistances?.forEach((r, idx) => addLevel(r, `R${idx + 1}`, '#a855f7'));
    }

    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, levels, overlays, kbosOverlays, showVolume, height, showKbosHtf, showDemaAtr, showAlmaRibbon, showEmas, showMarkers]);

  return (
    <div className="space-y-2">
      {kbosOverlays && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <button
            type="button"
            onClick={() => setShowKbosHtf((v) => !v)}
            className={`px-2 py-1 rounded-md border font-medium transition ${
              showKbosHtf ? 'bg-[#27cd86]/15 border-[#27cd86]/40 text-[#27cd86]' : 'bg-[#11151c] border-[#1c2028] text-[#6c7689]'
            }`}
          >
            KBOs HTF
          </button>
          <button
            type="button"
            onClick={() => setShowDemaAtr((v) => !v)}
            className={`px-2 py-1 rounded-md border font-medium transition ${
              showDemaAtr ? 'bg-[#00ffbb]/15 border-[#00ffbb]/40 text-[#00ffbb]' : 'bg-[#11151c] border-[#1c2028] text-[#6c7689]'
            }`}
          >
            DEMA ATR
          </button>
          <button
            type="button"
            onClick={() => setShowAlmaRibbon((v) => !v)}
            className={`px-2 py-1 rounded-md border font-medium transition ${
              showAlmaRibbon ? 'bg-[#8e4cf0]/15 border-[#8e4cf0]/40 text-[#b48af8]' : 'bg-[#11151c] border-[#1c2028] text-[#6c7689]'
            }`}
          >
            RLA MA Ribbon (8×ALMA)
          </button>
          <button
            type="button"
            onClick={() => setShowMarkers((v) => !v)}
            className={`px-2 py-1 rounded-md border font-medium transition ${
              showMarkers ? 'bg-[#4b73f5]/15 border-[#4b73f5]/40 text-[#4b73f5]' : 'bg-[#11151c] border-[#1c2028] text-[#6c7689]'
            }`}
          >
            BUY/SELL Arrows
          </button>
          {overlays && (
            <button
              type="button"
              onClick={() => setShowEmas((v) => !v)}
              className={`px-2 py-1 rounded-md border font-medium transition ${
                showEmas ? 'bg-[#f59f14]/15 border-[#f59f14]/40 text-[#f59f14]' : 'bg-[#11151c] border-[#1c2028] text-[#6c7689]'
              }`}
            >
              EMA 20/50/200
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden border border-[#1c2028]" />
    </div>
  );
}
