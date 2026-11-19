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
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 bg-[#080a0e] rounded-xl border border-[#1c2028]">
      <polyline fill="none" stroke={isPos ? '#27cd86' : '#eb493d'} strokeWidth="2.5" points={coords} />
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
  const [strategy, setStrategy] = useState<StrategyKey>('kbos_v11');
  const [compareStrategy, setCompareStrategy] = useState<StrategyKey>('sp2l');
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
      [
        t.id,
        t.direction,
        new Date(t.entryTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        t.entryPrice.toFixed(4),
        t.exitPrice.toFixed(4),
        t.pnlUsd.toFixed(2),
        t.pnlPct.toFixed(2),
        t.feesUsd.toFixed(2),
        t.exitReason,
        t.riskFreeTriggered,
        Boolean(t.trailingTriggered),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dollarino-backtest-${symbol}-${strategy}-${tf}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* Control Panel */}
      <div className="card-tt p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'موتور بک‌تست استراتژی‌های CodexBot' : 'CodexBot Strategy Backtester'}</span>
            </h2>
            <p className="text-xs text-[#6c7689]">
              {lang === 'fa'
                ? 'شبیه‌ساز غیرریپینت با ۳ تارگت، تریلینگ استاپ، ماتریس ماهانه و جدول Win/Loss روزهای هفته'
                : 'Non-repainting closed-bar simulator with 3-TP exits, trailing SL, monthly heatmap & day-of-week breakdown'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPineDrawer((v) => !v)}
              className="px-3 py-2 rounded-lg bg-[#1a1e26] border border-[#262b36] text-xs font-semibold text-[#d5dce6] inline-flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'تنظیمات KBOs Pine' : 'KBOs Pine Params'}</span>
            </button>
            <button
              disabled={running}
              onClick={() => executeBacktest(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] text-xs font-bold glow-success"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{running ? '...' : lang === 'fa' ? 'اجرای بک‌تست' : 'Run Backtest'}</span>
            </button>
            <button
              disabled={running}
              onClick={() => executeBacktest(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4b73f5] hover:bg-[#3d63e0] text-white text-xs font-bold"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'مقایسه A/B' : 'A/B Compare'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-xs">
          <div>
            <label className="text-[#6c7689] block mb-1">Symbol</label>
            <SymbolPicker lang={lang} value={symbol} markets={markets} provider={provider} onChange={setSymbol} compact />
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Timeframe</label>
            <select value={tf} onChange={(e) => setTf(e.target.value as Timeframe)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
              {['5m', '15m', '30m', '1h', '4h'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Primary Strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKey)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
              <option value="kbos_v11">CodexBot Super v11 (Quant)</option>
              <option value="sp2l">SP2L Liquidity Sweep</option>
              <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
              <option value="grid_strategy">Grid Mean Reversion</option>
              <option value="signal_mixer">8-Ch Signal Mixer</option>
              <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
              <option value="vibe_4h_candle_confirmation">4H Confirmation</option>
            </select>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Compare With</label>
            <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value as StrategyKey)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
              <option value="sp2l">SP2L Sweep</option>
              <option value="kbos_v11">KBOs v11</option>
              <option value="ema_trend_pullback">EMA Pullback</option>
              <option value="signal_mixer">Signal Mixer</option>
            </select>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Capital ($)</label>
            <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Margin % / Lev</label>
            <div className="flex gap-1">
              <input type="number" value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value))} className="w-1/2 bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-2 font-mono-num" />
              <input type="number" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-1/2 bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-2 font-mono-num" />
            </div>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Taker Fee (bps)</label>
            <select value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
              <option value={5}>Toobit (5 bps / 0.05%)</option>
              <option value={1}>KCEX (1 bps / 0.01%)</option>
              <option value={5}>Paper Demo (5 bps / 0.05%)</option>
            </select>
          </div>
        </div>

        {/* KBOs v11 Interactive Pine Script Parameters Drawer */}
        {showPineDrawer && (
          <div className="pt-4 border-t border-[#1c2028] space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">MA Basis (12x)</label>
                <select
                  value={kbosParams.basisType}
                  onChange={(e) => setKbosParams({ ...kbosParams, basisType: e.target.value as MaVariantKind })}
                  className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5"
                >
                  {MA_KINDS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">MA Period</label>
                <input type="number" min={1} max={100} value={kbosParams.basisLen} onChange={(e) => setKbosParams({ ...kbosParams, basisLen: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">HTF Multiplier</label>
                <input type="number" min={1} max={60} value={kbosParams.intRes} onChange={(e) => setKbosParams({ ...kbosParams, intRes: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">ALMA Offset</label>
                <input type="number" step="0.05" value={kbosParams.offsetALMA} onChange={(e) => setKbosParams({ ...kbosParams, offsetALMA: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">TP1 / TP2 / TP3 %</label>
                <div className="flex gap-1">
                  <input type="number" step="0.5" value={kbosParams.tp1Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp1Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1 py-1.5 font-mono-num text-[11px]" />
                  <input type="number" step="0.5" value={kbosParams.tp2Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp2Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1 py-1.5 font-mono-num text-[11px]" />
                  <input type="number" step="0.5" value={kbosParams.tp3Pct} onChange={(e) => setKbosParams({ ...kbosParams, tp3Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1 py-1.5 font-mono-num text-[11px]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">Trail SL %</label>
                <input type="number" step="0.2" value={kbosParams.trailPct} onChange={(e) => setKbosParams({ ...kbosParams, trailPct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">DEMA ATR Factor</label>
                <input type="number" step="0.1" value={kbosParams.factorAtr} onChange={(e) => setKbosParams({ ...kbosParams, factorAtr: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5 font-mono-num" />
              </div>
              <div>
                <label className="text-[10px] text-[#6c7689] block mb-1">Trade Side</label>
                <select value={kbosParams.tradeType} onChange={(e) => setKbosParams({ ...kbosParams, tradeType: e.target.value as KbosParams['tradeType'] })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2 py-1.5">
                  <option value="BOTH">BOTH</option>
                  <option value="LONG">LONG ONLY</option>
                  <option value="SHORT">SHORT ONLY</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-[11px] pt-1">
              {([
                ['useDemaAtr', 'DEMA ATR Filter'],
                ['useTrail', 'Trailing Stop'],
                ['beAfterTp1', 'BreakEven @ TP1'],
                ['useAtr1', 'ATR Norm Filter'],
                ['useVol', 'Volume > 1.5×SMA'],
                ['useEma200', 'EMA 200 Trend'],
                ['useAdx', 'ADX > 25'],
                ['useEmaRsi', 'EMA+RSI Momentum'],
                ['useBb', 'Bollinger Slope'],
              ] as Array<[keyof KbosParams, string]>).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#11151c] border border-[#1c2028] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(kbosParams[k])}
                    onChange={(e) => setKbosParams({ ...kbosParams, [k]: e.target.checked })}
                  />
                  <span className="text-[#d5dce6]">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Area */}
      {result && (
        <div className="space-y-5">
          {/* TradingView-Style Backtest HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {[
              { label: 'Net Return $', val: `${result.metrics.netReturnUsd >= 0 ? '+' : '-'}$${Math.abs(result.metrics.netReturnUsd).toFixed(2)}`, c: result.metrics.netReturnUsd >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]' },
              { label: 'Net Return %', val: `${result.metrics.netReturnPct >= 0 ? '+' : ''}${result.metrics.netReturnPct.toFixed(2)}%`, c: result.metrics.netReturnPct >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]' },
              { label: 'Win Rate', val: `${result.metrics.winRatePct.toFixed(1)}% (${result.metrics.winCount}/${result.metrics.totalTrades})`, c: 'text-[#4b73f5]' },
              { label: 'Profit Factor', val: result.metrics.profitFactor.toFixed(2), c: 'text-[#f59f14]' },
              { label: 'Max Run-Up', val: `+$${result.metrics.maxRunupUsd.toFixed(2)} (${result.metrics.maxRunupPct.toFixed(1)}%)`, c: 'text-[#27cd86]' },
              { label: 'Max Drawdown', val: `-${result.metrics.maxDrawdownPct.toFixed(2)}% (-$${result.metrics.maxDrawdownUsd.toFixed(0)})`, c: 'text-[#eb493d]' },
            ].map((m) => (
              <div key={m.label} className="card-tt-subtle p-3.5">
                <div className="text-[10px] text-[#6c7689]">{m.label}</div>
                <div className={`text-sm sm:text-base font-bold font-mono-num mt-1 ${m.c}`}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* KBOs v11 Chart Overlays + Equity Curve */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 card-tt p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">KBOs v11 Signal & Ribbon Replay ({symbol} · {tf})</span>
                <span className="text-[11px] text-[#6c7689]">450 closed candles</span>
              </div>
              <CandlestickChart candles={candles} kbosOverlays={kbosOverlays} height={380} />
            </div>

            <div className="xl:col-span-4 card-tt p-4 flex flex-col justify-between space-y-3 text-xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#27cd86]" /> Equity Curve
                  </span>
                  <button onClick={exportCsv} className="inline-flex items-center gap-1 text-[11px] text-[#4b73f5] hover:underline">
                    <Download className="w-3 h-3" /> CSV
                  </button>
                </div>
                <EquityCurveSvg points={result.equityCurve} />

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[#080a0e] border border-[#1c2028]">
                    <span className="text-[#6c7689] block">Sharpe Ratio</span>
                    <span className="font-mono-num font-bold text-white">{result.metrics.sharpeEstimate.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080a0e] border border-[#1c2028]">
                    <span className="text-[#6c7689] block">Expectancy</span>
                    <span className="font-mono-num font-bold text-white">${result.metrics.expectancyUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080a0e] border border-[#1c2028]">
                    <span className="text-[#6c7689] block">Long / Short</span>
                    <span className="font-mono-num font-bold text-white">{result.metrics.longTrades}L / {result.metrics.shortTrades}S</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#080a0e] border border-[#1c2028]">
                    <span className="text-[#6c7689] block">Risk-Free Saved</span>
                    <span className="font-mono-num font-bold text-[#27cd86]">{result.metrics.riskFreeCount} trades</span>
                  </div>
                </div>
              </div>

              {compareResult && (
                <div className="p-3 rounded-xl bg-[#4b73f5]/10 border border-[#4b73f5]/35 space-y-1">
                  <div className="font-bold text-[#4b73f5]">A/B Compare: {compareStrategy.toUpperCase()}</div>
                  <div className="flex justify-between font-mono-num">
                    <span>Return: {compareResult.metrics.netReturnPct.toFixed(2)}%</span>
                    <span>WR: {compareResult.metrics.winRatePct.toFixed(1)}%</span>
                    <span>PF: {compareResult.metrics.profitFactor.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* @QuantNomad Monthly & Yearly Returns Heatmap */}
          {result.monthlyBreakdown.length > 0 && (
            <div className="card-tt p-4 sm:p-5 space-y-3 overflow-x-auto">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Calendar className="w-4 h-4 text-[#4b73f5]" />
                <span>Monthly & Yearly Performance Heatmap (%)</span>
              </div>
              <table className="w-full text-[11px] font-mono-num border-collapse">
                <thead>
                  <tr className="text-[#6c7689] border-b border-[#1c2028]">
                    <th className="py-2 px-2 text-start">Year</th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="py-2 px-1.5 text-center">{m}</th>
                    ))}
                    <th className="py-2 px-2 text-end">Year Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthlyBreakdown.map((row) => (
                    <tr key={row.year} className="border-b border-[#1c2028]/50">
                      <td className="py-2 px-2 font-bold text-white">{row.year}</td>
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
                        const val = row.months[m] ?? 0;
                        const bg =
                          val > 0
                            ? 'bg-[#27cd86]/20 text-[#27cd86]'
                            : val < 0
                              ? 'bg-[#eb493d]/20 text-[#eb493d]'
                              : 'bg-[#11151c] text-[#6c7689]';
                        return (
                          <td key={m} className="p-1 text-center">
                            <span className={`inline-block w-full py-1 rounded ${bg}`}>
                              {val === 0 ? '—' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                            </span>
                          </td>
                        );
                      })}
                      <td className={`py-2 px-2 text-end font-bold ${row.yearPct >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                        {row.yearPct >= 0 ? '+' : ''}{row.yearPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* niceGear68734 Day-of-Week Win/Loss Matrix + Trades Log */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-5 card-tt p-4 overflow-x-auto">
              <h3 className="text-sm font-bold text-white mb-3">Day-of-Week Win/Loss Breakdown</h3>
              <table className="w-full text-[11px] font-mono-num">
                <thead>
                  <tr className="text-[#6c7689] border-b border-[#1c2028]">
                    <th className="py-1.5 text-start">Day</th>
                    <th className="py-1.5 text-center">Open W/L</th>
                    <th className="py-1.5 text-center">Open WR%</th>
                    <th className="py-1.5 text-center">Close W/L</th>
                    <th className="py-1.5 text-end">Close WR%</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dayOfWeekStats.map((d) => (
                    <tr key={d.dayIndex} className="border-b border-[#1c2028]/50">
                      <td className="py-2 font-bold text-white">{d.dayName}</td>
                      <td className="py-2 text-center text-[#9aa5b5]">{d.openedWins}/{d.openedLosses}</td>
                      <td className={`py-2 text-center ${d.openedWinRate >= 50 ? 'text-[#27cd86]' : 'text-[#9aa5b5]'}`}>{d.openedWinRate.toFixed(0)}%</td>
                      <td className="py-2 text-center text-[#9aa5b5]">{d.closedWins}/{d.closedLosses}</td>
                      <td className={`py-2 text-end font-bold ${d.closedWinRate >= 50 ? 'text-[#27cd86]' : 'text-[#9aa5b5]'}`}>{d.closedWinRate.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="xl:col-span-7 card-tt p-4 overflow-x-auto max-h-96 overflow-y-auto">
              <h3 className="text-sm font-bold text-white mb-3">Simulated Trades ({result.trades.length})</h3>
              <table className="w-full text-[11px] font-mono-num">
                <thead>
                  <tr className="text-[#6c7689] border-b border-[#1c2028]">
                    <th className="py-1.5 text-start">Dir</th>
                    <th className="py-1.5 text-start">Entry</th>
                    <th className="py-1.5 text-start">Exit</th>
                    <th className="py-1.5 text-start">Reason</th>
                    <th className="py-1.5 text-end">PnL ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t) => (
                    <tr key={t.id} className="border-b border-[#1c2028]/50">
                      <td className={`py-1.5 font-bold ${t.direction === 'LONG' ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>{t.direction}</td>
                      <td className="py-1.5 text-[#d5dce6]">${t.entryPrice.toFixed(2)}</td>
                      <td className="py-1.5 text-[#d5dce6]">${t.exitPrice.toFixed(2)}</td>
                      <td className="py-1.5 text-[#9aa5b5]">{t.exitReason}</td>
                      <td className={`py-1.5 text-end font-bold ${t.pnlUsd >= 0 ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                        {t.pnlUsd >= 0 ? '+' : '-'}${Math.abs(t.pnlUsd).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
