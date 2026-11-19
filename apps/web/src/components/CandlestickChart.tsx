import { useEffect, useRef } from 'react';
import { createChart, ColorType, type IChartApi, type Time } from 'lightweight-charts';
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

export interface ChartOverlays {
  ema20?: IndicatorPoint[];
  ema50?: IndicatorPoint[];
  ema200?: IndicatorPoint[];
}

export function CandlestickChart({
  candles,
  levels,
  overlays,
  showVolume = true,
  height = 420,
}: {
  candles: Candle[];
  levels?: ChartLevels;
  overlays?: ChartOverlays;
  showVolume?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090c13' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.05)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.05)' },
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
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
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
            color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
          }))
        );
      }

      chart.timeScale().fitContent();
    }

    if (overlays?.ema20?.length) {
      const s20 = chart.addLineSeries({ color: '#38bdf8', lineWidth: 1, priceLineVisible: false });
      s20.setData(overlays.ema20.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    if (overlays?.ema50?.length) {
      const s50 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false });
      s50.setData(overlays.ema50.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    if (overlays?.ema200?.length) {
      const s200 = chart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceLineVisible: false });
      s200.setData(overlays.ema200.map((p) => ({ time: p.time as Time, value: p.value })));
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
      addLevel(levels.entry, 'ENTRY', '#3b82f6');
      addLevel(levels.stopLoss, 'STOP LOSS', '#ef4444');
      addLevel(levels.tp1, 'TP1 (50%)', '#10b981');
      addLevel(levels.tp2, 'TP2 (25%)', '#eab308');
      addLevel(levels.tp3, 'TP3 (25%)', '#f97316');
      levels.supports?.forEach((s, idx) => addLevel(s, `S${idx + 1}`, '#22d3ee'));
      levels.resistances?.forEach((r, idx) => addLevel(r, `R${idx + 1}`, '#c084fc'));
    }

    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, levels, overlays, showVolume, height]);

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden border border-slate-800/80" />;
}
