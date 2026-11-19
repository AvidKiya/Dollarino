import { useState } from 'react';
import { Calendar, Download, GitCompare, Layers, Play, Sliders, TrendingUp } from 'lucide-react';
import {
  computeKbosV11Detailed,
  DEFAULT_KBOS_PARAMS,
  runBacktest,
  type BacktestResult,
  type Candle,
  type KbosParams,
  type MaVariantKind,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import { CandlestickChart, type KbosChartOverlays } from '../components/CandlestickChart';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

const MA_KINDS: MaVariantKind[] = ['ALMA', 'EMA', 'DEMA', 'TEMA', 'SMA', 'WMA', 'VWMA', 'SMMA', 'HullMA', 'LSMA', 'TMA', 'SSMA'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function EquityCurveSvg({ points }: { points: Array<{ equity: number }> }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const w = 800;
  const h = 155;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - 12 - ((v - min) / span) * (h - 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const isPos = vals[vals.length - 1]! >= vals[0]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 surface-soft rounded-2xl border">
      <polyline fill="none" stroke={isPos ? '#10D856' : '#f43f5e'} strokeWidth="2.5" points={coords} />
    </svg>
  );
}

export function BacktestPage({
  lang,
  markets,
  provider,
}: {
  lang: Lang;
  markets: ExchangeMarket[];
  provider: string;
}) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState<Timeframe>('15m');
  const [strategy, setStrategy] = useState<StrategyKey>('dollarino_v01');
  const [compareStrategy, setCompareStrategy] = useState<StrategyKey>('kbos_v11');
  const [initialBalance, setInitialBalance] = useState(10_000);
  const [marginPct, setMarginPct] = useState(50);
  const [leverage, setLeverage] = useState(5);
  const [feeBps, setFeeBps] = useState(5);
  const [kbosParams, setKbosParams] = useState<KbosParams>({ ...DEFAULT_KBOS_PARAMS });
  const [showPineDrawer, setShowPineDrawer] = useState(true);
  const [running, setRunning] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [kbosOverlays, setKbosOverlays] = useState<KbosChartOverlays | undefined>(undefined);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [compareResult, setCompareResult] = useState<BacktestResult | null>(null);

  const higherTimeframeFor = (ltf: Timeframe): Timeframe => {
    const map: Record<string, Timeframe> = { '1m': '15m', '3m': '15m', '5m': '15m', '15m': '1h', '30m': '4h', '1h': '4h', '2h': '4h', '4h': '1d', '1d': '1d' };
    return map[ltf] ?? '4h';
  };

  const executeBacktest = async (withCompare = false) => {
    setRunning(true);
    try {
      const htf = higherTimeframeFor(tf);
      const [ltfRes, htfRes] = await Promise.all([
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${symbol}&timeframe=${tf}&limit=900`),
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${symbol}&timeframe=${htf}&limit=350`),
      ]);

      setCandles(ltfRes.candles);
      const kd = computeKbosV11Detailed(ltfRes.candles, tf, kbosParams);
      setKbosOverlays({
        closeSeriesAlt: kd.closeSeriesAlt,
        openSeriesAlt: kd.openSeriesAlt,
        demaAtr: kd.demaAtr,
        almaRibbon: kd.almaRibbon,
        markers: kd.markers,
      });

      const isKbos = strategy === 'kbos_v11';
      const baseCfg = {
        symbol,
        timeframe: tf,
        higherTimeframe: htf,
        initialBalance,
        marginPct,
        leverage,
        tp1ClosePct: isKbos ? 30 : 50,
        tp2ClosePct: isKbos ? 30 : 25,
        tp3ClosePct: isKbos ? 40 : 25,
        autoBreakevenOnTp1: isKbos ? kbosParams.beAfterTp1 : true,
        moveSlToTp1OnTp2: !isKbos,
        useTrailingStop: isKbos ? kbosParams.useTrail : true,
        trailPct: kbosParams.trailPct,
        trailAfterTp1: kbosParams.trailAfterTp1,
        feeRateBps: feeBps,
        params: { kbosParams },
      };

      const main = runBacktest(ltfRes.candles, htfRes.candles, { ...baseCfg, strategyKey: strategy });
      setResult(main);

      if (withCompare) {
        const cmpIsKbos = compareStrategy === 'kbos_v11';
        const cmp = runBacktest(ltfRes.candles, htfRes.candles, {
          ...baseCfg,
          tp1ClosePct: cmpIsKbos ? 30 : 50,
          tp2ClosePct: cmpIsKbos ? 30 : 25,
          tp3ClosePct: cmpIsKbos ? 40 : 25,
          strategyKey: compareStrategy,
        });
        setCompareResult(cmp);
      } else {
        setCompareResult(null);
      }
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const header = 'ID,Direction,EntryTime,ExitTime,EntryPrice,ExitPrice,PnL_USD,ROE_%,Fees,Reason,RiskFree,Trailing';
    const rows = result.trades.map((t) =>
      [t.id, t.direction, new Date(t.entryTime).toISOString(), new Date(t.exitTime).toISOString(), t.entryPrice.toFixed(4), t.exitPrice.toFixed(4), t.pnlUsd.toFixed(2), t.pnlPct.toFixed(2), t.feesUsd.toFixed(2), t.exitReason, t.riskFreeTriggered, Boolean(t.trailingTriggered)].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dollarino-backtest-${symbol}-${strategy}-${tf}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-main flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand" />
              <span>{lang === 'fa' ? 'موتور بک‌تست استراتژی منتخب دلارینو' : 'Dollarino Select (Dorna V1) Backtester'}</span>
            </h2>
            <p className="text-xs text-sub">
              {lang === 'fa'
                ? 'شبیه‌ساز غیرریپینت با ۳ تارگت، تریلینگ استاپ و ماتریس ماهانه'
                : 'Non-repainting simulator with 3-TP exits, trailing SL & monthly heatmap'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowPineDrawer((v) => !v)} className="px-3.5 py-2 rounded-xl surface-soft border text-xs font-bold text-main inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand" />
              <span>{lang === 'fa' ? 'تنظیمات هسته دُرنا V1' : 'Core Params'}</span>
            </button>
            <button disabled={running} onClick={() => executeBacktest(false)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-emerald text-xs font-extrabold">
              <Play className="w-3.5 h-3.5" />
              <span>{running ? '...' : lang === 'fa' ? 'اجرای بک‌تست' : 'Run Backtest'}</span>
            </button>
            <button disabled={running} onClick={() => executeBacktest(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl btn-cobalt text-xs font-extrabold">
              <GitCompare className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'مقایسه A/B' : 'A/B Compare'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-xs">
          <div>
            <label className="text-sub font-semibold block mb-1">Symbol</label>
            <SymbolPicker lang={lang} value={symbol} markets={markets} provider={provider} onChange={setSymbol} compact />
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Timeframe</label>
            <select value={tf} onChange={(e) => setTf(e.target.value as Timeframe)} className="w-full surface-input rounded-xl px-2.5 py-2">
              {['5m', '15m', '30m', '1h', '4h'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Primary Strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKey)} className="w-full surface-input rounded-xl px-2.5 py-2">
              <option value="dollarino_v01">✨ استراتژی منتخب دلارینو (موتور دُرنا V1)</option>
              <option value="kbos_v11">KBOs Super v11</option>
              <option value="sp2l">SP2L Liquidity Sweep</option>
              <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
              <option value="grid_strategy">Grid Mean Reversion</option>
              <option value="signal_mixer">8-Ch Signal Mixer</option>
              <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
            </select>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Compare With</label>
            <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value as StrategyKey)} className="w-full surface-input rounded-xl px-2.5 py-2">
              <option value="kbos_v11">KBOs v11</option>
              <option value="dollarino_v01">استراتژی منتخب دلارینو</option>
              <option value="sp2l">SP2L Sweep</option>
              <option value="ema_trend_pullback">EMA Pullback</option>
              <option value="signal_mixer">Signal Mixer</option>
            </select>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Capital ($)</label>
            <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Margin % / Lev</label>
            <div className="flex gap-1">
              <input type="number" value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value))} className="w-1/2 surface-input rounded-xl px-2 py-2 font-mono-num" />
              <input type="number" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-1/2 surface-input rounded-xl px-2 py-2 font-mono-num" />
            </div>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Taker Fee (bps)</label>
            <select value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} className="w-full surface-input rounded-xl px-2.5 py-2">
              <option value={5}>Toobit (5 bps)</option>
              <option value={1}>KCEX (1 bps)</option>
              <option value={5}>Paper Demo (5 bps)</option>
            </select>
          </div>
        </div>

        {showPineDrawer && (
          <div className="pt-4 border-t space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              <div>
                <label className="text-[11px] text-sub block mb-1">MA Basis</label>
                <select value={kbosParams.basisType} onChange={(e) => setKbosParams({ ...kbosParams, basisType: e.target.value as MaVariantKind })} className="w-full surface-input rounded-xl px-2 py-1.5">
                  {MA_KINDS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">MA Period</label>
                <input type="number" min={1} max={100} value={kbosParams.basisLen} onChange={(e) => setKbosParams({ ...kbosParams, basisLen: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">HTF Mult</label>
                <input type="number" min={1} max={60} value={kbosParams.intRes} onChange={(e) => setKbosParams({ ...kbosParams, intRes: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">ALMA Offset</label>
                <input type="number" step="0.05" value={kbosParams.offsetALMA} onChange={(e) => setKbosParams({ ...kbosParams, offsetALMA: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">TP1 / TP2 / TP3 %</label>
                <div className="flex gap-1">
                  <input type="number" step="0.5" value={kbosParams.tp1Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp1Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1 py-1.5 font-mono-num text-[11px]" />
                  <input type="number" step="0.5" value={kbosParams.tp2Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp2Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1 py-1.5 font-mono-num text-[11px]" />
                  <input type="number" step="0.5" value={kbosParams.tp3Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp3Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1 py-1.5 font-mono-num text-[11px]" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">Trail SL %</label>
                <input type="number" step="0.2" value={kbosParams.trailPct} onChange={(e) => setKbosParams({ ...kbosParams, trailPct: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">DEMA ATR</label>
                <input type="number" step="0.1" value={kbosParams.factorAtr} onChange={(e) => setKbosParams({ ...kbosParams, factorAtr: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[11px] text-sub block mb-1">Side</label>
                <select value={kbosParams.tradeType} onChange={(e) => setKbosParams({ ...kbosParams, tradeType: e.target.value as KbosParams['tradeType'] })} className="w-full surface-input rounded-xl px-2 py-1.5">
                  <option value="BOTH">BOTH</option>
                  <option value="LONG">LONG ONLY</option>
                  <option value="SHORT">SHORT ONLY</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Net Return $', val: `${result.metrics.netReturnUsd >= 0 ? '+' : '-'}$${Math.abs(result.metrics.netReturnUsd).toFixed(2)}`, c: result.metrics.netReturnUsd >= 0 ? 'text-signal' : 'text-loss' },
              { label: 'Net Return %', val: `${result.metrics.netReturnPct >= 0 ? '+' : ''}${result.metrics.netReturnPct.toFixed(2)}%`, c: result.metrics.netReturnPct >= 0 ? 'text-signal' : 'text-loss' },
              { label: 'Win Rate', val: `${result.metrics.winRatePct.toFixed(1)}% (${result.metrics.winCount}/${result.metrics.totalTrades})`, c: 'text-brand' },
              { label: 'Profit Factor', val: result.metrics.profitFactor.toFixed(2), c: 'text-flame' },
              { label: 'Max Run-Up', val: `+$${result.metrics.maxRunupUsd.toFixed(2)}`, c: 'text-signal' },
              { label: 'Max Drawdown', val: `-${result.metrics.maxDrawdownPct.toFixed(2)}%`, c: 'text-loss' },
            ].map((m) => (
              <div key={m.label} className="surface-card p-4">
                <div className="text-[11px] text-dim">{m.label}</div>
                <div className={`text-base font-black font-mono-num mt-1 ${m.c}`}>{m.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 surface-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-main">Dollarino Signal Replay ({symbol} · {tf})</span>
                <span className="text-dim">450 closed candles</span>
              </div>
              <CandlestickChart candles={candles} kbosOverlays={kbosOverlays} height={380} />
            </div>

            <div className="xl:col-span-4 surface-card p-4 flex flex-col justify-between space-y-3 text-xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-main flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-signal" /> Equity Curve
                  </span>
                  <button onClick={exportCsv} className="inline-flex items-center gap-1 text-xs text-brand font-bold hover:underline">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                <EquityCurveSvg points={result.equityCurve} />

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl surface-soft border">
                    <span className="text-dim block">Sharpe Ratio</span>
                    <span className="font-mono-num font-black text-main">{result.metrics.sharpeEstimate.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl surface-soft border">
                    <span className="text-dim block">Expectancy</span>
                    <span className="font-mono-num font-black text-main">${result.metrics.expectancyUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl surface-soft border">
                    <span className="text-dim block">Long / Short</span>
                    <span className="font-mono-num font-black text-main">{result.metrics.longTrades}L / {result.metrics.shortTrades}S</span>
                  </div>
                  <div className="p-2.5 rounded-xl surface-soft border">
                    <span className="text-dim block">Risk-Free Saved</span>
                    <span className="font-mono-num font-black text-signal">{result.metrics.riskFreeCount} trades</span>
                  </div>
                </div>
              </div>

              {compareResult && (
                <div className="p-3.5 rounded-2xl banner-cobalt-soft space-y-1">
                  <div className="font-extrabold text-brand">A/B Compare: {compareStrategy.toUpperCase()}</div>
                  <div className="flex justify-between font-mono-num text-main font-bold">
                    <span>Return: {compareResult.metrics.netReturnPct.toFixed(2)}%</span>
                    <span>WR: {compareResult.metrics.winRatePct.toFixed(1)}%</span>
                    <span>PF: {compareResult.metrics.profitFactor.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {result.monthlyBreakdown.length > 0 && (
            <div className="surface-card p-5 space-y-3 overflow-x-auto">
              <div className="flex items-center gap-2 text-sm font-black text-main">
                <Calendar className="w-4 h-4 text-brand" />
                <span>Monthly & Yearly Performance Heatmap (%)</span>
              </div>
              <table className="w-full text-[11px] font-mono-num border-collapse">
                <thead>
                  <tr className="text-dim border-b">
                    <th className="py-2 px-2 text-start">Year</th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="py-2 px-1.5 text-center">{m}</th>
                    ))}
                    <th className="py-2 px-2 text-end">Year Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthlyBreakdown.map((row) => (
                    <tr key={row.year} className="border-b">
                      <td className="py-2 px-2 font-black text-main">{row.year}</td>
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
                        const val = row.months[m] ?? 0;
                        const bg =
                          val > 0
                            ? 'badge-signal font-bold'
                            : val < 0
                              ? 'bg-rose-500/15 text-loss font-bold'
                              : 'surface-soft text-dim';
                        return (
                          <td key={m} className="p-1 text-center">
                            <span className={`inline-block w-full py-1 rounded-lg ${bg}`}>
                              {val === 0 ? '—' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                            </span>
                          </td>
                        );
                      })}
                      <td className={`py-2 px-2 text-end font-black ${row.yearPct >= 0 ? 'text-signal' : 'text-loss'}`}>
                        {row.yearPct >= 0 ? '+' : ''}{row.yearPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="surface-card p-4 overflow-x-auto max-h-96 overflow-y-auto">
            <h3 className="text-sm font-black text-main mb-3">Simulated Trades ({result.trades.length})</h3>
            <table className="w-full text-[11px] font-mono-num">
              <thead>
                <tr className="text-dim border-b">
                  <th className="py-1.5 text-start">Dir</th>
                  <th className="py-1.5 text-start">Entry</th>
                  <th className="py-1.5 text-start">Exit</th>
                  <th className="py-1.5 text-start">Reason</th>
                  <th className="py-1.5 text-end">PnL ($)</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t) => (
                  <tr key={t.id} className="border-b">
                    <td className={`py-1.5 font-bold ${t.direction === 'LONG' ? 'text-signal' : 'text-loss'}`}>{t.direction}</td>
                    <td className="py-1.5 text-main">${t.entryPrice.toFixed(2)}</td>
                    <td className="py-1.5 text-main">${t.exitPrice.toFixed(2)}</td>
                    <td className="py-1.5 text-sub">{t.exitReason}</td>
                    <td className={`py-1.5 text-end font-bold ${t.pnlUsd >= 0 ? 'text-signal' : 'text-loss'}`}>
                      {t.pnlUsd >= 0 ? '+' : '-'}${Math.abs(t.pnlUsd).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
