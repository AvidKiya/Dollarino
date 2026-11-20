import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Flame,
  Play,
  Radar,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { formatDollarinoSignal, runBacktest as runCoreBacktest, type BacktestMetrics, type Candle, type Timeframe } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { AreaChart, ConsensusGauge } from '../components/DollarinoViz';
import { HybridLab } from '../components/HybridLab';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';

function parseLevels(raw: string, fallbackPrice: string) {
  const num = (re: RegExp) => {
    const m = raw.match(re);
    if (!m) return null;
    const v = Number(String(m[1]).replace(/,/g, ''));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    entry: num(/(?:entry|price|ورود|قیمت)\s*[:=]\s*\$?([\d.,]+)/i) ?? (Number(fallbackPrice) || null),
    sl: num(/(?:sl|stop\s*loss|حد\s*ضرر)\s*[:=]\s*\$?([\d.,]+)/i),
    tp1: num(/(?:tp\s*1|target\s*1|تارگت\s*1)\s*[:=]\s*\$?([\d.,]+)/i),
    tp3: num(/(?:tp\s*3|target\s*3|تارگت\s*3)\s*[:=]\s*\$?([\d.,]+)/i),
  };
}

export function RadarLabPage({
  lang,
  data,
  markets,
  onTradeSymbol,
  onRefresh,
}: {
  lang: Lang;
  data: DashboardPayload;
  markets: ExchangeMarket[];
  onTradeSymbol: (sym: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [subTab, setSubTab] = useState<'radar' | 'lab'>('radar');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'AI' | 'DORNA' | 'TELEGRAM' | 'TRADINGVIEW'>('ALL');
  const [expandedRaw, setExpandedRaw] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Array<{ symbol: string; price: number; trend: string; rsi: number; mixerConfidence: number; mixerDirection: string }>>([]);

  // Backtest state
  const [btSymbol, setBtSymbol] = useState(data.config.symbol || 'BTCUSDT');
  const [btStrategy, setBtStrategy] = useState<'dollarino_v01' | 'sp2l' | 'ema_trend_pullback'>('dollarino_v01');
  const [btTf, setBtTf] = useState<Timeframe>('15m');
  const [btCapital, setBtCapital] = useState(10000);
  const [btRiskPct, setBtRiskPct] = useState(1.0);
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<{ metrics: BacktestMetrics; equityCurve: number[] } | null>(null);
  const [labMsg, setLabMsg] = useState('');

  const signals = data.recentSignals;
  const filteredSignals = useMemo(() => {
    if (sourceFilter === 'ALL') return signals;
    return signals.filter((s) => {
      const src = String(s.source || '').toUpperCase();
      if (sourceFilter === 'DORNA') return src.includes('DORNA') || src.includes('BOT') || src.includes('SCANNER');
      return src.includes(sourceFilter);
    });
  }, [signals, sourceFilter]);

  const longCount = signals.filter((s) => String(s.direction).toUpperCase().includes('LONG')).length;
  const longRatio = signals.length ? Math.round((longCount / signals.length) * 100) : 64;
  const topMovers = useMemo(
    () => [...markets].sort((a, b) => Math.abs(Number(b.changePct24h)) - Math.abs(Number(a.changePct24h))).slice(0, 5),
    [markets]
  );

  const runLiveScanner = async () => {
    setScanning(true);
    try {
      const topSyms = markets.slice(0, 12).map((m) => m.symbol);
      const res = await apiFetch<{ results?: typeof scanResults }>('/api/trading/scanner', {
        method: 'POST',
        body: JSON.stringify({
          symbols: topSyms.length ? topSyms : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'],
          timeframe: data.config.entry_timeframe || '15m',
          strategyKey: data.config.strategy_key || 'dollarino_v01',
        }),
      });
      if (res.results) setScanResults(res.results);
      await onRefresh();
    } finally {
      setScanning(false);
    }
  };

  const applyLabModel = async (cfg: { strategyKey: 'ai_autonomous_agent' | 'dollarino_v01'; marginPct: number; maxLeverage: number; maxOpenPositions: number; aiMinConfidence: number }) => {
    setLabMsg('');
    await apiFetch('/api/trading/config', {
      method: 'PUT',
      body: JSON.stringify({
        strategy_key: cfg.strategyKey,
        margin_pct: cfg.marginPct,
        max_leverage: cfg.maxLeverage,
        max_open_positions: cfg.maxOpenPositions,
        ai_min_confidence: cfg.aiMinConfidence,
      }),
    });
    setLabMsg(isFa ? 'تنظیمات مدل ترکیبی مستقیم در حساب ربات شما ذخیره شد ✅' : 'Hybrid setup applied to your account ✅');
    await onRefresh();
  };

  const runBacktest = async () => {
    setBtLoading(true);
    setLabMsg('');
    try {
      const htfMap: Record<Timeframe, Timeframe> = {
        '1m': '15m',
        '3m': '15m',
        '5m': '15m',
        '15m': '1h',
        '30m': '4h',
        '1h': '4h',
        '2h': '4h',
        '4h': '1d',
        '1d': '1d',
      };
      const htf = htfMap[btTf] ?? '1h';
      const [ltfRes, htfRes] = await Promise.all([
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${btSymbol}&timeframe=${btTf}&limit=450`),
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${btSymbol}&timeframe=${htf}&limit=160`),
      ]);
      const res = runCoreBacktest(ltfRes.candles, htfRes.candles, {
        symbol: btSymbol,
        strategyKey: btStrategy,
        timeframe: btTf,
        higherTimeframe: htf,
        initialBalance: btCapital,
        marginPct: Math.max(1, btRiskPct * 2),
        leverage: data.config.max_leverage || 5,
        tp1ClosePct: 30,
        tp2ClosePct: 40,
        tp3ClosePct: 30,
        autoBreakevenOnTp1: true,
        moveSlToTp1OnTp2: true,
        useTrailingStop: true,
        trailPct: 1.5,
      });
      setBtResult({
        metrics: res.metrics,
        equityCurve: res.equityCurve.map((p) => p.equity),
      });
    } catch (e) {
      setLabMsg(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setBtLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--gold)' }}>
            <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
            <span>LIVE SIGNAL RADAR & LAB</span>
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {subTab === 'radar' ? (isFa ? 'رادار سیگنال زنده' : 'AI Signal Radar') : isFa ? 'آزمایشگاه ترکیب و بک‌تست' : 'Hybrid Lab & Backtest'}
          </h2>
        </div>

        <div className="inline-flex p-1 panel rounded-full">
          <button
            type="button"
            onClick={() => setSubTab('radar')}
            className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 ${
              subTab === 'radar' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>{isFa ? 'رادار زنده و اسکن' : 'Live Radar'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('lab')}
            className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 ${
              subTab === 'lab' ? 'btn-gold' : 'text-dim hover:text-main'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isFa ? 'آزمایشگاه و بک‌تست' : 'Hybrid Lab & Backtest'}</span>
          </button>
        </div>
      </div>

      {subTab === 'radar' ? (
        <>
          {/* 4 Stat Cards (02.zip Radar) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Activity, l: isFa ? 'کل سیگنال‌ها' : 'Signals Logged', v: String(signals.length), c: 'text-goldsoft' },
              { icon: Trophy, l: isFa ? 'وین‌ریت حساب' : 'Win Rate', v: `${data.stats.winRate.toFixed(1)}%`, c: 'text-jade' },
              { icon: Crosshair, l: isFa ? 'آستانه اطمینان' : 'Min Confidence', v: `${data.config.ai_min_confidence}%`, c: 'text-brand' },
              { icon: Target, l: isFa ? 'سود کل' : 'Total PnL', v: `${data.stats.totalPnl >= 0 ? '+' : ''}$${data.stats.totalPnl.toFixed(0)}`, c: data.stats.totalPnl >= 0 ? 'text-jade' : 'text-loss' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.l} className="panel rounded-3xl p-4 sm:p-5">
                  <Icon className={`w-5 h-5 mb-2 ${s.c}`} />
                  <p dir="ltr" className="font-display font-bold text-2xl tabular text-main">{s.v}</p>
                  <p className="text-xs text-dim font-semibold mt-1">{s.l}</p>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-[1fr_290px] gap-4">
            {/* Signal Feed + Scanner */}
            <div className="panel rounded-[26px] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['ALL', isFa ? 'همه' : 'All'],
                    ['AI', isFa ? 'هوش مصنوعی' : 'AI'],
                    ['DORNA', isFa ? 'دُرنا V1' : 'Dorna V1'],
                    ['TELEGRAM', isFa ? 'تلگرام' : 'Telegram'],
                    ['TRADINGVIEW', 'TradingView'],
                  ] as const).map(([key, lbl]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSourceFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-black transition ${
                        sourceFilter === key ? 'btn-gold' : 'btn-ghost text-dim'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => void runLiveScanner()}
                  className="btn-emerald px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning...') : isFa ? 'اسکن زنده بازار' : 'Scan Market Now'}</span>
                </button>
              </div>

              {scanResults.length > 0 && (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-3.5 space-y-2">
                  <div className="text-xs font-black text-main flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-jade" />
                    <span>{isFa ? 'نتایج اسکن همزمان لحظه‌ای:' : 'Live Multi-Coin Scan Results:'}</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {scanResults.slice(0, 6).map((r) => (
                      <button
                        key={r.symbol}
                        type="button"
                        onClick={() => onTradeSymbol(r.symbol)}
                        className="rounded-xl surface-card p-2.5 text-start flex items-center justify-between text-xs hover:border-[var(--gold)] transition"
                      >
                        <div>
                          <div className="font-bold text-main">{r.symbol.replace('USDT', '')}</div>
                          <div className="text-[10px] text-dim">RSI {r.rsi.toFixed(0)} · {r.trend}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${r.mixerDirection === 'LONG' ? 'bg-jade/15 text-jade' : r.mixerDirection === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'text-dim'}`}>
                          {r.mixerDirection} {r.mixerConfidence}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredSignals.length === 0 ? (
                <div className="py-12 text-center text-xs text-dim border border-dashed hairline rounded-2xl">
                  {isFa
                    ? 'هنوز سیگنالی دریافت نشده است. دکمه «اسکن زنده بازار» را بزنید یا وب‌هوک را متصل کنید.'
                    : 'No signals logged yet. Click Scan Market Now or connect Telegram/TradingView.'}
                </div>
              ) : (
                <div className="space-y-3 max-h-[680px] overflow-y-auto pe-1">
                  {filteredSignals.map((s) => {
                    const lv = parseLevels(s.raw_text, s.price);
                    const isLong = String(s.direction).toUpperCase().includes('LONG');
                    const open = Boolean(expandedRaw[s.id]);
                    return (
                      <div key={s.id} className="signal-in rounded-2xl border hairline bg-[var(--soft)] p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <CoinIcon symbol={s.symbol} size={30} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-main">{s.symbol}</span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isLong ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                                {s.direction}
                              </span>
                            </div>
                            <p className="text-[10px] text-dim">{s.source} · {new Date(s.created_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onTradeSymbol(s.symbol)}
                            className="ms-auto text-xs font-black hover:underline"
                            style={{ color: 'var(--gold)' }}
                          >
                            {isFa ? 'معامله در پایانه ←' : 'Open in Terminal →'}
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-num" dir="ltr">
                          <div className="rounded-xl bg-black/20 border hairline py-1.5">
                            <span className="text-[9px] text-dim block">ENTRY</span>
                            <span className="font-bold text-main">{lv.entry ? `$${lv.entry}` : '—'}</span>
                          </div>
                          <div className="rounded-xl bg-black/20 border hairline py-1.5">
                            <span className="text-[9px] text-dim block">TP1</span>
                            <span className="font-bold text-jade">{lv.tp1 ? `$${lv.tp1}` : '—'}</span>
                          </div>
                          <div className="rounded-xl bg-black/20 border hairline py-1.5">
                            <span className="text-[9px] text-dim block">SL</span>
                            <span className="font-bold text-loss">{lv.sl ? `$${lv.sl}` : '—'}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedRaw((p) => ({ ...p, [s.id]: !p[s.id] }))}
                          className="w-full flex items-center justify-between text-[11px] text-dim hover:text-main"
                        >
                          <span>{isFa ? 'متن کامل سیگنال' : 'Raw signal'}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <pre dir="ltr" className="text-[11px] font-mono text-sub bg-black/25 rounded-xl p-3 border hairline whitespace-pre-wrap">
                            {s.raw_text || formatDollarinoSignal({ symbol: s.symbol, direction: isLong ? 'LONG' : 'SHORT', timeframe: '15m', price: s.price, stopLoss: String(lv.sl || ''), leverage: 10, tp1: String(lv.tp1 || '') })}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Sidebar: Consensus + Top Movers */}
            <div className="space-y-4">
              <div className="panel rounded-[26px] p-5">
                <h3 className="font-display font-bold text-base text-main mb-3">{isFa ? 'اجماع سیگنال‌ها' : 'Signal Consensus'}</h3>
                <ConsensusGauge value={longRatio} longLabel={isFa ? 'خرید' : 'Long'} shortLabel={isFa ? 'فروش' : 'Short'} />
              </div>

              <div className="panel rounded-[26px] p-5 space-y-3">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-flame" />
                  <span>{isFa ? 'پرنوسان‌ترین‌های امروز' : 'Top Movers'}</span>
                </h3>
                <div className="space-y-2.5">
                  {topMovers.map((c) => {
                    const ch = Number(c.changePct24h || 0);
                    return (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => onTradeSymbol(c.symbol)}
                        className="w-full flex items-center gap-2 text-xs hover:opacity-80"
                      >
                        <span className="font-bold text-main w-12 text-start">{c.base}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full rounded-full ${ch >= 0 ? 'bg-jade' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.abs(ch) * 10)}%` }} />
                        </div>
                        <span dir="ltr" className={`font-num font-bold w-14 text-end ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? '+' : ''}{ch.toFixed(1)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {labMsg && (
            <div className="p-3.5 rounded-2xl badge-signal text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{labMsg}</span>
            </div>
          )}

          {/* Hybrid Lab Interactive Composer */}
          <HybridLab lang={lang} onTryDemo={() => void applyLabModel({ strategyKey: 'ai_autonomous_agent', marginPct: 5, maxLeverage: 10, maxOpenPositions: 8, aiMinConfidence: 68 })} />

          {/* Clean Historical Backtester */}
          <div className="panel rounded-[26px] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                  <span>{isFa ? 'شبیه‌ساز تاریخی استراتژی (Backtester)' : 'Strategy Historical Backtester'}</span>
                </h3>
                <p className="text-xs text-dim mt-0.5">
                  {isFa ? 'عملکرد واقعی استراتژی روی کندل‌های گذشته صرافی را قبل از اجرا تست کنید.' : 'Test your strategy on historical exchange candles before deploying.'}
                </p>
              </div>
              <button
                type="button"
                disabled={btLoading}
                onClick={() => void runBacktest()}
                className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{btLoading ? (isFa ? 'در حال محاسبه...' : 'Running...') : isFa ? 'اجرای بک‌تست' : 'Run Backtest'}</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="text-dim block mb-1">{isFa ? 'نماد' : 'Symbol'}</label>
                <SymbolPicker
                  lang={lang}
                  markets={markets}
                  value={btSymbol}
                  provider={data.activeExchange?.provider || 'paper'}
                  onChange={setBtSymbol}
                />
              </div>
              <div>
                <label className="text-dim block mb-1">{isFa ? 'استراتژی' : 'Strategy'}</label>
                <select value={btStrategy} onChange={(e) => setBtStrategy(e.target.value as typeof btStrategy)} className="field text-xs py-2.5">
                  <option value="dollarino_v01">{isFa ? 'دُرنا V1' : 'Dorna V1'}</option>
                  <option value="sp2l">SP2L Spike-2Leg</option>
                  <option value="ema_trend_pullback">EMA Pullback</option>
                </select>
              </div>
              <div>
                <label className="text-dim block mb-1">{isFa ? 'تایم‌فریم' : 'Timeframe'}</label>
                <select value={btTf} onChange={(e) => setBtTf(e.target.value as Timeframe)} className="field text-xs py-2.5">
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                </select>
              </div>
              <div>
                <label className="text-dim block mb-1">{isFa ? 'سرمایه اولیه ($)' : 'Capital ($)'}</label>
                <input type="number" value={btCapital} onChange={(e) => setBtCapital(Number(e.target.value))} className="field text-xs py-2.5 font-num" />
              </div>
              <div>
                <label className="text-dim block mb-1">{isFa ? 'ریسک هر معامله %' : 'Risk/Trade %'}</label>
                <input type="number" step="0.25" value={btRiskPct} onChange={(e) => setBtRiskPct(Number(e.target.value))} className="field text-xs py-2.5 font-num" />
              </div>
            </div>

            {btResult && (
              <div className="space-y-4 pt-3 border-t hairline">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    { l: isFa ? 'بازده کل' : 'Total Return', v: `${btResult.metrics.netReturnPct >= 0 ? '+' : ''}${btResult.metrics.netReturnPct.toFixed(2)}%`, c: btResult.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss' },
                    { l: isFa ? 'تعداد معاملات' : 'Total Trades', v: String(btResult.metrics.totalTrades), c: 'text-main' },
                    { l: isFa ? 'وین‌ریت' : 'Win Rate', v: `${btResult.metrics.winRatePct.toFixed(1)}%`, c: 'text-goldsoft' },
                    { l: isFa ? 'حداکثر افت (DD)' : 'Max Drawdown', v: `${btResult.metrics.maxDrawdownPct.toFixed(2)}%`, c: 'text-loss' },
                  ].map((m) => (
                    <div key={m.l} className="surface-soft rounded-2xl p-3">
                      <p dir="ltr" className={`font-num font-bold text-lg ${m.c}`}>{m.v}</p>
                      <p className="text-[11px] text-dim mt-0.5">{m.l}</p>
                    </div>
                  ))}
                </div>
                {btResult.equityCurve.length > 2 && (
                  <div className="h-44 rounded-2xl bg-black/20 border hairline p-3">
                    <AreaChart values={btResult.equityCurve} height={152} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
