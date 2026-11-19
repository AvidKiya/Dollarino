import { useState } from 'react';
import { Download, GitCompare, Play, TrendingUp } from 'lucide-react';
import { runBacktest, type BacktestResult, type Candle, type StrategyKey, type Timeframe } from '@dollarino/core';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

function EquityCurveSvg({ points }: { points: Array<{ equity: number }> }) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const w = 800;
  const h = 150;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - 10 - ((v - min) / span) * (h - 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const isPos = vals[vals.length - 1]! >= vals[0]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 bg-slate-950/70 rounded-xl border border-slate-800/80">
      <polyline fill="none" stroke={isPos ? '#10b981' : '#ef4444'} strokeWidth="2.5" points={coords} />
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
  const [strategy, setStrategy] = useState<StrategyKey>('sp2l');
  const [compareStrategy, setCompareStrategy] = useState<StrategyKey>('ema_trend_pullback');
  const [initialBalance, setInitialBalance] = useState(10_000);
  const [marginPct, setMarginPct] = useState(10);
  const [leverage, setLeverage] = useState(5);
  const [feeBps, setFeeBps] = useState(5); // 5 bps = 0.05% Toobit, 1 bps = 0.01% KCEX
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [compareResult, setCompareResult] = useState<BacktestResult | null>(null);

  const executeBacktest = async (withCompare = false) => {
    setRunning(true);
    try {
      const [ltfRes, htfRes] = await Promise.all([
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${symbol}&timeframe=${tf}&limit=450`),
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${symbol}&timeframe=1h&limit=200`),
      ]);
      const baseCfg = {
        symbol,
        timeframe: tf,
        higherTimeframe: '1h' as Timeframe,
        initialBalance,
        marginPct,
        leverage,
        tp1ClosePct: 50,
        tp2ClosePct: 25,
        tp3ClosePct: 25,
        autoBreakevenOnTp1: true,
        moveSlToTp1OnTp2: true,
        feeBps,
      };
      setResult(runBacktest(ltfRes.candles, htfRes.candles, { ...baseCfg, strategyKey: strategy }));
      setCompareResult(
        withCompare ? runBacktest(ltfRes.candles, htfRes.candles, { ...baseCfg, strategyKey: compareStrategy }) : null
      );
    } finally {
      setRunning(false);
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const header = 'id,symbol,direction,entryTime,exitTime,entryPrice,exitPrice,pnlUsd,pnlPct,exitReason,tp1Hit,tp2Hit,tp3Hit,riskFree\n';
    const rows = result.trades
      .map((t) =>
        [
          t.id,
          t.symbol,
          t.direction,
          new Date(t.entryTime).toISOString(),
          new Date(t.exitTime).toISOString(),
          t.entryPrice.toFixed(2),
          t.exitPrice.toFixed(2),
          t.pnlUsd.toFixed(2),
          t.pnlPct.toFixed(2),
          t.exitReason,
          t.tp1Hit,
          t.tp2Hit,
          t.tp3Hit,
          t.riskFreeTriggered,
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dollarino-backtest-${symbol}-${strategy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const winningCount = result ? result.trades.filter((t) => t.pnlUsd > 0).length : 0;
  const losingCount = result ? result.trades.length - winningCount : 0;
  const tp1Count = result ? result.trades.filter((t) => t.tp1Hit).length : 0;
  const tp2Count = result ? result.trades.filter((t) => t.tp2Hit).length : 0;
  const tp3Count = result ? result.trades.filter((t) => t.tp3Hit).length : 0;

  return (
    <div className="space-y-5">
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs items-end">
        <div>
          <label className="text-slate-400 block mb-1">Symbol</label>
          <SymbolPicker lang={lang} value={symbol} markets={markets} provider={provider} onChange={setSymbol} compact />
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Strategy A</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyKey)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
            <option value="sp2l">SP2L Liquidity Sweep</option>
            <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
            <option value="grid_strategy">Grid Mean Reversion</option>
            <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
            <option value="vibe_4h_candle_confirmation">4H Candle Confirmation</option>
          </select>
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Compare B</label>
          <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value as StrategyKey)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
            <option value="ema_trend_pullback">EMA Pullback</option>
            <option value="sp2l">SP2L Sweep</option>
            <option value="grid_strategy">Grid Mean Rev</option>
            <option value="vibe_4h_daily_breakout">4H Breakout</option>
          </select>
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Timeframe</label>
          <select value={tf} onChange={(e) => setTf(e.target.value as Timeframe)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
            {['5m', '15m', '30m', '1h'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Exchange Fee</label>
          <select value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
            <option value={1}>KCEX (0.01%)</option>
            <option value={5}>Toobit / Bitunix (0.05%)</option>
          </select>
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Balance ($)</label>
          <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 font-mono-num" />
        </div>
        <div>
          <label className="text-slate-400 block mb-1">Margin% / Lev</label>
          <div className="flex gap-1">
            <input type="number" value={marginPct} onChange={(e) => setMarginPct(Number(e.target.value))} className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 font-mono-num" />
            <input type="number" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 font-mono-num" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            disabled={running}
            onClick={() => executeBacktest(false)}
            className="flex-1 inline-flex items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{running ? '...' : lang === 'fa' ? 'اجرا' : 'Run'}</span>
          </button>
          <button
            disabled={running}
            onClick={() => executeBacktest(true)}
            title="Compare Strategy A vs B"
            className="px-2.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
          >
            <GitCompare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400">Final Equity</div>
              <div className="text-lg font-bold font-mono-num text-white">${result.metrics.finalEquity.toFixed(2)}</div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400">Net Return</div>
              <div className={`text-lg font-bold font-mono-num ${result.metrics.netReturnUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {result.metrics.netReturnPct >= 0 ? '+' : ''}{result.metrics.netReturnPct.toFixed(2)}%
              </div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400">Win Rate / PF</div>
              <div className="text-lg font-bold font-mono-num text-blue-400">
                {result.metrics.winRatePct.toFixed(1)}% · {result.metrics.profitFactor.toFixed(2)}
              </div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400">Sharpe / Expectancy</div>
              <div className="text-lg font-bold font-mono-num text-cyan-300">
                {result.metrics.sharpeEstimate.toFixed(2)} · ${result.metrics.expectancyUsd.toFixed(1)}
              </div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-400">Max DD / Risk-Free</div>
              <div className="text-lg font-bold font-mono-num text-rose-400">
                -{result.metrics.maxDrawdownPct.toFixed(2)}% · {result.metrics.riskFreeCount} RF
              </div>
            </div>
            <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">Trades (W/L)</div>
                <div className="text-lg font-bold font-mono-num">
                  {result.metrics.totalTrades} ({winningCount}/{losingCount})
                </div>
              </div>
              <button onClick={exportCsv} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200" title="Export CSV">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Equity Curve ({strategy.toUpperCase()})
              </span>
              <span className="text-slate-400 font-mono-num">
                TP1: {tp1Count} · TP2: {tp2Count} · TP3: {tp3Count}
              </span>
            </div>
            <EquityCurveSvg points={result.equityCurve} />
          </div>

          {compareResult && (
            <div className="bg-[#0e131d] border border-blue-500/30 rounded-2xl p-4 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-slate-400">Compare Strategy B</div>
                <div className="font-bold text-blue-300">{compareStrategy.toUpperCase()}</div>
              </div>
              <div>
                <div className="text-slate-400">Net Return B</div>
                <div className="font-mono-num font-bold text-white">{compareResult.metrics.netReturnPct.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-slate-400">Win Rate B / PF</div>
                <div className="font-mono-num font-bold text-cyan-300">
                  {compareResult.metrics.winRatePct.toFixed(1)}% · {compareResult.metrics.profitFactor.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Sharpe / MaxDD</div>
                <div className="font-mono-num font-bold text-amber-300">
                  {compareResult.metrics.sharpeEstimate.toFixed(2)} / -{compareResult.metrics.maxDrawdownPct.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2 text-start">ID</th>
                  <th className="py-2 px-2 text-start">Side</th>
                  <th className="py-2 px-2 text-start">Entry → Exit</th>
                  <th className="py-2 px-2 text-start">3-TP Progress</th>
                  <th className="py-2 px-2 text-start">Exit Reason</th>
                  <th className="py-2 px-2 text-end">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-num">
                {result.trades.slice(0, 60).map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 px-2">{t.id}</td>
                    <td className="py-2 px-2">{t.direction}</td>
                    <td className="py-2 px-2">{t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}</td>
                    <td className="py-2 px-2">
                      {t.tp1Hit ? 'TP1✓ ' : ''}{t.tp2Hit ? 'TP2✓ ' : ''}{t.tp3Hit ? 'TP3✓ ' : ''}{t.riskFreeTriggered ? '(Risk-Free)' : ''}
                    </td>
                    <td className="py-2 px-2 text-slate-400">{t.exitReason}</td>
                    <td className={`py-2 px-2 text-end font-semibold ${t.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.pnlUsd >= 0 ? '+' : ''}${t.pnlUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
