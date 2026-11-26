import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Code2,
  Crosshair,
  Download,
  Flame,
  Play,
  Radar,
  Save,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_KBOS_PARAMS,
  formatDollarinoSignal,
  runBacktest as runCoreBacktest,
  type BacktestResult,
  type Candle,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type { DashboardPayload } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { SmoothSlider } from '../components/SmoothSlider';
import { AreaChart, ConsensusGauge } from '../components/DollarinoViz';
import { HybridLab } from '../components/HybridLab';
import { StrategyIdePanel } from '../components/StrategyIdePanel';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { TradingViewAlertsHub } from '../components/TradingViewAlertsHub';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [subTab, setSubTab] = useState<'radar' | 'tvalerts' | 'lab' | 'backtest' | 'ide'>(() => {
    try {
      const saved = sessionStorage.getItem('dollarino_radar_subtab');
      if (saved === 'radar' || saved === 'tvalerts' || saved === 'lab' || saved === 'backtest' || saved === 'ide') {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return 'radar';
  });

  useEffect(() => {
    const clearTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem('dollarino_radar_subtab');
      } catch {
        /* ignore */
      }
    }, 450);
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail === 'radar' || detail === 'tvalerts' || detail === 'lab' || detail === 'backtest' || detail === 'ide') {
        setSubTab(detail);
        try {
          sessionStorage.removeItem('dollarino_radar_subtab');
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('dollarino:radar-subtab', handler);
    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener('dollarino:radar-subtab', handler);
    };
  }, []);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'AI' | 'DORNA' | 'TELEGRAM' | 'TRADINGVIEW'>('ALL');
  const [expandedRaw, setExpandedRaw] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<
    Array<{
      symbol: string;
      price: number;
      trend: string;
      rsi: number;
      mixerConfidence: number;
      mixerDirection: string;
      formatted: string | null;
    }>
  >([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const isErr = /fail|error|خطا|ناموفق/i.test(notice);
    pushFloatingToast(notice, isErr ? 'error' : 'info');
    setNotice('');
  }, [notice]);

  // KBOS & Mixer Parameter Tuner (from StrategyFlowPage)
  const initialKbos = useMemo(() => {
    try {
      return data.config.kbos_params_json
        ? { ...DEFAULT_KBOS_PARAMS, ...(JSON.parse(data.config.kbos_params_json) as Record<string, number>) }
        : { ...DEFAULT_KBOS_PARAMS };
    } catch {
      return { ...DEFAULT_KBOS_PARAMS };
    }
  }, [data.config.kbos_params_json]);
  const [kbosParams, setKbosParams] = useState(initialKbos);
  const [mixerThreshold, setMixerThreshold] = useState(Number(data.config.mixer_threshold ?? 65));

  // Full Backtester (from BacktestPage: 900 candles, A/B compare, Heatmap, Trades Table, CSV)
  const [btSymbol, setBtSymbol] = useState(data.config.symbol || 'BTCUSDT');
  const [btStrategy, setBtStrategy] = useState<StrategyKey>('dollarino_v01');
  const [compareStrategy, setCompareStrategy] = useState<StrategyKey | ''>('');
  const [btTf, setBtTf] = useState<Timeframe>('15m');
  const [btCapital, setBtCapital] = useState(10000);
  const [btMarginPct, setBtMarginPct] = useState(10);
  const [btLev, setBtLev] = useState(Number(data.config.max_leverage || 5));
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [compareResult, setCompareResult] = useState<BacktestResult | null>(null);

  // Top-10 Coin × Multi-Timeframe Matrix Auto-Scanner
  const [matrixScanning, setMatrixScanning] = useState(false);
  const [matrixStrategy, setMatrixStrategy] = useState<StrategyKey>('dollarino_v01');
  const [matrixCells, setMatrixCells] = useState<
    Array<{
      symbol: string;
      timeframe: Timeframe;
      netReturnPct: number;
      winRatePct: number;
      profitFactor: number;
      totalTrades: number;
      maxDrawdownPct: number;
    }>
  >([]);

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
    setNotice('');
    try {
      const topSyms = markets.slice(0, 14).map((m) => m.symbol);
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

  const executeScannedSignal = async (formatted: string) => {
    setNotice('');
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
        method: 'POST',
        body: JSON.stringify({ rawText: formatted, executeNow: true, source: 'scanner' }),
      });
      setNotice(
        res.ok
          ? isFa ? `معامله اسکنر (${res.tradeId}) باز شد` : `Scanner trade ${res.tradeId} opened`
          : res.error || 'Rejected'
      );
      await onRefresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Execution error');
    }
  };

  const saveStrategyParams = async () => {
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          kbos_params_json: kbosParams,
          mixer_threshold: mixerThreshold,
        }),
      });
      setNotice(isFa ? 'پارامترهای استراتژی و KBOS در ربات ذخیره شد' : 'KBOS & Mixer parameters saved');
      await onRefresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Save error');
    }
  };

  const applyHybridModel = async () => {
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          strategy_key: 'ai_autonomous_agent',
          ai_gate_enabled: 1,
          mixer_threshold: mixerThreshold,
        }),
      });
      setNotice(isFa ? 'مدل ترکیبی در حساب ربات شما فعال شد' : 'Hybrid setup applied');
      await onRefresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Error');
    }
  };

  const runBacktest = async () => {
    setBtLoading(true);
    setNotice('');
    setCompareResult(null);
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
        '1w': '1w',
      };
      const htf = htfMap[btTf] ?? '1h';
      const [ltfRes, htfRes] = await Promise.all([
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${btSymbol}&timeframe=${btTf}&limit=900`),
        apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${btSymbol}&timeframe=${htf}&limit=350`),
      ]);
      const opts = {
        symbol: btSymbol,
        strategyKey: btStrategy,
        timeframe: btTf,
        higherTimeframe: htf,
        initialBalance: btCapital,
        marginPct: btMarginPct,
        leverage: btLev,
        tp1ClosePct: 30,
        tp2ClosePct: 40,
        tp3ClosePct: 30,
        autoBreakevenOnTp1: true,
        moveSlToTp1OnTp2: true,
        useTrailingStop: true,
        trailPct: 1.5,
      };
      setBtResult(runCoreBacktest(ltfRes.candles, htfRes.candles, opts));
      if (compareStrategy && compareStrategy !== btStrategy) {
        setCompareResult(runCoreBacktest(ltfRes.candles, htfRes.candles, { ...opts, strategyKey: compareStrategy }));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setBtLoading(false);
    }
  };

  const runMatrixScan = async () => {
    setMatrixScanning(true);
    setNotice('');
    try {
      const topSyms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'TONUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'];
      const tfs: Array<{ tf: Timeframe; htf: Timeframe }> = [
        { tf: '15m', htf: '1h' },
        { tf: '1h', htf: '4h' },
        { tf: '4h', htf: '1d' },
      ];
      const out: typeof matrixCells = [];
      for (const sym of topSyms) {
        const [c15, c1h, c4h, c1d] = await Promise.all([
          apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${sym}&timeframe=15m&limit=320`).catch(() => ({ candles: [] })),
          apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${sym}&timeframe=1h&limit=320`).catch(() => ({ candles: [] })),
          apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${sym}&timeframe=4h&limit=320`).catch(() => ({ candles: [] })),
          apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${sym}&timeframe=1d&limit=180`).catch(() => ({ candles: [] })),
        ]);
        const byTf: Record<string, Candle[]> = {
          '15m': c15.candles,
          '1h': c1h.candles,
          '4h': c4h.candles,
          '1d': c1d.candles,
        };
        for (const pair of tfs) {
          const ltf = byTf[pair.tf] || [];
          const htf = byTf[pair.htf] || [];
          if (ltf.length < 45) continue;
          const res = runCoreBacktest(ltf, htf, {
            symbol: sym,
            strategyKey: matrixStrategy,
            timeframe: pair.tf,
            higherTimeframe: pair.htf,
            initialBalance: btCapital,
            marginPct: btMarginPct,
            leverage: btLev,
            tp1ClosePct: 30,
            tp2ClosePct: 40,
            tp3ClosePct: 30,
            autoBreakevenOnTp1: true,
            moveSlToTp1OnTp2: true,
            useTrailingStop: true,
            trailPct: 1.5,
          });
          out.push({
            symbol: sym,
            timeframe: pair.tf,
            netReturnPct: res.metrics.netReturnPct,
            winRatePct: res.metrics.winRatePct,
            profitFactor: res.metrics.profitFactor,
            totalTrades: res.metrics.totalTrades,
            maxDrawdownPct: res.metrics.maxDrawdownPct,
          });
        }
      }
      setMatrixCells(out);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Matrix scan failed');
    } finally {
      setMatrixScanning(false);
    }
  };

  const exportBacktestCsv = () => {
    if (!btResult) return;
    const rows = [
      ['ID', 'Direction', 'Entry', 'Exit', 'Reason', 'PnL USD'],
      ...btResult.trades.map((t) => [t.id, t.direction, t.entryPrice.toFixed(4), t.exitPrice.toFixed(4), t.exitReason, t.pnlUsd.toFixed(2)]),
    ];
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dollarino-backtest-${btSymbol}-${btStrategy}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header + 5 Sub-Tabs */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="shrink-0">
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5 flex items-center gap-2" style={{ color: 'var(--gold)' }}>
            <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
            <span>RADAR · HYBRID LAB · BACKTESTER</span>
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
            {subTab === 'radar'
              ? isFa ? 'رادار سیگنال زنده و اسکنر' : 'AI Signal Radar & Scanner'
              : subTab === 'tvalerts'
                ? isFa ? 'آلرت‌ها و اندیکاتورهای رایگان TradingView' : 'Free TradingView Indicators & Alerts'
                : subTab === 'lab'
                  ? isFa ? 'آزمایشگاه ترکیب و تنظیمات KBOS' : 'Hybrid Lab & KBOS Tuner'
                  : subTab === 'ide'
                    ? isFa ? 'محیط کدنویسی Pine Script و Python' : 'Pine Script & Python Strategy IDE'
                    : isFa ? 'بک‌تستر تاریخی و جدول حرارتی' : 'Historical Backtester'}
          </h2>
        </div>

        <div className="tab-bar w-full xl:w-auto lg:flex-nowrap overflow-x-auto no-scrollbar">
          {[
            { id: 'radar' as const, icon: Radar, l: isFa ? 'رادار و اسکن' : 'Live Radar' },
            { id: 'tvalerts' as const, icon: BellRing, l: isFa ? 'آلرت TradingView' : 'TV Free Alerts' },
            { id: 'ide' as const, icon: Code2, l: isFa ? 'Pine / Python IDE' : 'Pine / Python IDE' },
            { id: 'lab' as const, icon: SlidersHorizontal, l: isFa ? 'آزمایشگاه KBOS' : 'Lab & KBOS' },
            { id: 'backtest' as const, icon: BarChart3, l: isFa ? 'بک‌تست ۹۰۰ کندل' : 'Backtester' },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`tab-pill flex-1 sm:flex-initial !px-3.5 !py-2 !text-[11.5px] ${subTab === t.id ? 'tab-pill-active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'radar' && (
        <div className="space-y-6 tab-enter">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Activity, l: isFa ? 'کل سیگنال‌ها' : 'Signals Logged', v: String(signals.length), c: 'text-goldsoft' },
              { icon: Trophy, l: isFa ? 'وین‌ریت حساب' : 'Win Rate', v: `${data.stats.winRate.toFixed(1)}%`, c: 'text-jade' },
              { icon: Crosshair, l: isFa ? 'آستانه اطمینان' : 'Min Confidence', v: `${data.config.ai_min_confidence}%`, c: 'text-brand' },
              { icon: Target, l: isFa ? 'سود کل' : 'Total PnL', v: data.stats.totalPnl >= 0 ? `+$${data.stats.totalPnl.toFixed(0)}` : `-$${Math.abs(data.stats.totalPnl).toFixed(0)}`, c: data.stats.totalPnl >= 0 ? 'text-jade' : 'text-loss' },
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

                <button type="button" disabled={scanning} onClick={() => void runLiveScanner()} className="btn-emerald px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning...') : isFa ? 'اسکن زنده ۱۴ ارز' : 'Scan 14 Markets Now'}</span>
                </button>
              </div>

              {scanResults.length > 0 && (
                <div className="rounded-2xl bg-[var(--soft)] border hairline p-3.5 space-y-2.5">
                  <div className="text-xs font-black text-main flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-jade" />
                    <span>{isFa ? 'نتایج اسکن زنده همزمان (با قابلیت اجرای مستقیم):' : 'Live Multi-Coin Scan Results:'}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {scanResults.map((r) => (
                      <div key={r.symbol} className="rounded-xl surface-card p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => onTradeSymbol(r.symbol)} className="font-bold text-main hover:underline">
                            {r.symbol.replace('USDT', '')}
                          </button>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${r.mixerDirection === 'LONG' ? 'bg-jade/15 text-jade' : r.mixerDirection === 'SHORT' ? 'bg-rose-500/15 text-loss' : 'text-dim'}`}>
                            {r.mixerDirection} {r.mixerConfidence}%
                          </span>
                        </div>
                        <div className="text-[10px] text-dim flex justify-between">
                          <span>RSI {r.rsi.toFixed(0)} · {r.trend}</span>
                          <span dir="ltr">${r.price}</span>
                        </div>
                        {r.formatted && (
                          <button
                            type="button"
                            onClick={() => void executeScannedSignal(r.formatted!)}
                            className="btn-gold w-full py-1.5 rounded-lg text-[10px] inline-flex items-center justify-center gap-1"
                          >
                            <Zap className="w-3 h-3" />
                            <span>{isFa ? 'اجرای سیگنال' : 'Execute Setup'}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredSignals.length === 0 ? (
                <div className="py-12 text-center text-xs text-dim border border-dashed hairline rounded-2xl">
                  {isFa ? 'هنوز سیگنالی ثبت نشده است. دکمه «اسکن زنده ۱۴ ارز» را بزنید.' : 'No signals logged yet. Click Scan Markets Now.'}
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
                          <button type="button" onClick={() => onTradeSymbol(s.symbol)} className="ms-auto text-xs font-black hover:underline" style={{ color: 'var(--gold)' }}>
                            {isFa ? 'معامله در پایانه ←' : 'Open Terminal →'}
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-num" dir="ltr">
                          <div className="rounded-xl surface-soft border hairline py-1.5">
                            <span className="text-[9px] text-dim block">ENTRY</span>
                            <span className="font-bold text-main">{lv.entry ? `$${lv.entry}` : '—'}</span>
                          </div>
                          <div className="rounded-xl surface-soft border hairline py-1.5">
                            <span className="text-[9px] text-dim block">TP1</span>
                            <span className="font-bold text-jade">{lv.tp1 ? `$${lv.tp1}` : '—'}</span>
                          </div>
                          <div className="rounded-xl surface-soft border hairline py-1.5">
                            <span className="text-[9px] text-dim block">SL</span>
                            <span className="font-bold text-loss">{lv.sl ? `$${lv.sl}` : '—'}</span>
                          </div>
                        </div>

                        <button type="button" onClick={() => setExpandedRaw((p) => ({ ...p, [s.id]: !p[s.id] }))} className="w-full flex items-center justify-between text-[11px] text-dim hover:text-main">
                          <span>{isFa ? 'متن کامل سیگنال' : 'Raw signal'}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <pre dir="ltr" className="text-[11px] font-mono text-sub surface-soft rounded-xl p-3 border hairline whitespace-pre-wrap">
                            {s.raw_text || formatDollarinoSignal({ symbol: s.symbol, direction: isLong ? 'LONG' : 'SHORT', timeframe: '15m', price: s.price, stopLoss: String(lv.sl || ''), leverage: 10, tp1: String(lv.tp1 || '') })}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
                      <button key={c.symbol} type="button" onClick={() => onTradeSymbol(c.symbol)} className="w-full flex items-center gap-2 text-xs hover:opacity-80">
                        <span className="font-bold text-main w-12 text-start">{c.base}</span>
                        <div className="flex-1 h-2 rounded-full bg-[var(--soft)] border hairline overflow-hidden">
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
        </div>
      )}

      {subTab === 'lab' && (
        <div className="space-y-6 tab-enter">
          {/* Quick Preset Strategy Selector & Inspector */}
          <div className="panel rounded-[26px] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                  <Target className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'بررسی و انتخاب سریع استراتژی‌های آماده دلارینو' : 'Dollarino Preset Strategies'}</span>
                </h3>
                <p className="text-xs text-dim mt-0.5">
                  {isFa
                    ? 'هر استراتژی را می‌توانید انتخاب کنید، پارامترهای آن را ببینید یا مستقیماً بک‌تست ۹۰۰ کندلی بگیرید.'
                    : 'Inspect rules, activate a preset strategy, or jump directly to 900-candle backtesting.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSubTab('backtest')} className="btn-cobalt px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'بک‌تست و مقایسه' : 'Backtest'}</span>
                </button>
                <button type="button" onClick={() => setSubTab('ide')} className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'کد شخصی (IDE)' : 'Custom IDE'}</span>
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                {
                  key: 'dollarino_v01' as StrategyKey,
                  title: isFa ? 'شکار دُرنا V1 (پیشنهادی)' : 'Dorna V1 Hunter',
                  tag: isFa ? 'ترند + شکست' : 'Trend + Breakout',
                  desc: isFa ? 'استراتژی متعادل دلارینو با فیلتر تایم‌فریم بالاتر، حجم و تریلینگ استاپ خودکار.' : 'Balanced multi-TF hunter with volume & auto trailing SL.',
                },
                {
                  key: 'kbos_v11' as StrategyKey,
                  title: isFa ? 'موتور KBOS V11' : 'KBOS V11 Engine',
                  tag: isFa ? 'ALMA + ATR + ADX' : 'ALMA + ATR',
                  desc: isFa ? 'مبتنی بر موج‌های سوپراسموثر ALMA و قدرت روند ADX با حد ضرر پویای ATR.' : 'SuperSmoother ALMA waves + ADX regime filter + ATR trailing.',
                },
                {
                  key: 'sp2l' as StrategyKey,
                  title: isFa ? 'اسنایپر بازگشتی SP2L' : 'SP2L Reversal',
                  tag: isFa ? 'نوسان‌گیر دقیق' : 'Reversal Sniper',
                  desc: isFa ? 'شکار سقف و کف‌های نقدینگی با واگرایی مومنتوم و خروج ۳ مرحله‌ای.' : 'Liquidity sweep reversal with 3-TP partial scaling.',
                },
                {
                  key: 'ema_trend_breakout' as StrategyKey,
                  title: isFa ? 'شکست کانال EMA' : 'EMA Trend Breakout',
                  tag: isFa ? 'مومنتوم سریع' : 'Fast Momentum',
                  desc: isFa ? 'ورود روی شکست ساختار روند کوتاه‌مدت در جفت‌ارزهای پرحجم.' : 'Momentum structure breakout on high-liquidity pairs.',
                },
              ].map((st) => {
                const isSelected = data.config.strategy_key === st.key;
                return (
                  <div
                    key={st.key}
                    className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 transition ${
                      isSelected ? 'border-[#059669] bg-emerald-500/10 ring-1 ring-[#059669]/35' : 'surface-soft hairline'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-main">{st.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-brand">{st.tag}</span>
                      </div>
                      <p className="text-[11px] text-dim leading-relaxed">{st.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch('/api/trading/config', {
                            method: 'PATCH',
                            body: JSON.stringify({ strategy_key: st.key }),
                          });
                          setNotice(isFa ? `استراتژی «${st.title}» فعال شد ✅` : `${st.title} selected`);
                          await onRefresh();
                        }}
                        className={`flex-1 py-2 rounded-xl text-[11px] font-black transition ${
                          isSelected ? 'bg-[#059669] text-white' : 'btn-cobalt text-white'
                        }`}
                      >
                        {isSelected ? (isFa ? 'انتخاب‌شده ✓' : 'Selected ✓') : isFa ? 'انتخاب استراتژی' : 'Select'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBtStrategy(st.key);
                          setSubTab('backtest');
                        }}
                        className="px-2.5 py-2 rounded-xl btn-ghost text-[11px] font-bold"
                      >
                        {isFa ? 'بک‌تست' : 'Test'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <HybridLab lang={lang} onTryDemo={() => void applyHybridModel()} />

          <div className="panel rounded-[26px] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-lg text-main">{isFa ? 'تنظیمات دقیق موتور KBOS و آستانه میکسر' : 'KBOS Strategy & Signal Mixer Parameters'}</h3>
                <p className="text-xs text-dim">{isFa ? 'پارامترهای فنی استراتژی KBOS v11 و حداقل امتیاز ورود را دقیقاً تنظیم کنید.' : 'Fine-tune KBOS ALMA/ATR lengths and minimum mixer confidence.'}</p>
              </div>
              <button type="button" onClick={() => void saveStrategyParams()} className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                <span>{isFa ? 'ذخیره پارامترها' : 'Save Parameters'}</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="surface-soft rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-dim">{isFa ? 'آستانه ورود میکسر' : 'Mixer Min Score'}</span>
                  <span className="font-bold text-main">{mixerThreshold}%</span>
                </div>
                <SmoothSlider min={45} max={90} value={mixerThreshold} onChange={setMixerThreshold} dir="ltr" />
              </div>

              {[
                { k: 'basisLen' as const, l: isFa ? 'طول موج پایه (ALMA)' : 'ALMA Basis Length', step: '1' },
                { k: 'offsetALMA' as const, l: isFa ? 'آفست ALMA' : 'ALMA Offset', step: '0.05' },
                { k: 'factorAtr' as const, l: isFa ? 'ضریب تریل ATR' : 'ATR Trail Factor', step: '0.1' },
                { k: 'adxThreshold' as const, l: isFa ? 'فیلتر قدرت روند ADX' : 'ADX Threshold', step: '1' },
              ].map((p) => (
                <div key={p.k} className="surface-soft rounded-2xl p-3.5 space-y-1.5">
                  <label className="text-dim block">{p.l}</label>
                  <input
                    type="number"
                    step={p.step}
                    value={kbosParams[p.k]}
                    onChange={(e) => setKbosParams((prev) => ({ ...prev, [p.k]: Number(e.target.value) }))}
                    className="field font-num text-xs py-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'ide' && (
        <div className="tab-enter">
          <StrategyIdePanel
            lang={lang}
            markets={markets}
            defaultSymbol={data.config.symbol || 'BTCUSDT'}
            activeCustomStrategyId={data.config.active_custom_strategy_id}
            onActivatedOnBot={onRefresh}
          />
        </div>
      )}

      {subTab === 'backtest' && (
        <div className="panel rounded-[26px] p-5 sm:p-6 space-y-5 tab-enter">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                <BarChart3 className="w-5 h-5" style={{ color: 'var(--gold)' }} />
                <span>{isFa ? 'شبیه‌ساز تاریخی پیشرفته (۹۰۰ کندل + مقایسه A/B)' : 'Pro Backtester (900 Candles + A/B Compare)'}</span>
              </h3>
              <p className="text-xs text-dim mt-0.5">
                {isFa ? 'محاسبه دقیق روی داده‌های گذشته همراه با ۳ تارگت، ریسک‌فری خودکار و جدول حرارتی ماهانه.' : 'Zero-lookahead backtesting with 3-TP partial exits, Break-Even & Monthly Heatmap.'}
              </p>
            </div>
            <div className="flex gap-2">
              {btResult && (
                <button type="button" onClick={exportBacktestCsv} className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              )}
              <button type="button" disabled={btLoading} onClick={() => void runBacktest()} className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>{btLoading ? (isFa ? 'در حال محاسبه...' : 'Running...') : isFa ? 'اجرای بک‌تست' : 'Run Backtest'}</span>
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="text-dim block mb-1">{isFa ? 'نماد' : 'Symbol'}</label>
              <SymbolPicker lang={lang} markets={markets} value={btSymbol} provider={data.activeExchange?.provider || 'paper'} onChange={setBtSymbol} />
            </div>
            <div>
              <label className="text-dim block mb-1">{isFa ? 'استراتژی اصلی' : 'Primary Strategy'}</label>
              <select value={btStrategy} onChange={(e) => setBtStrategy(e.target.value as StrategyKey)} className="field text-xs py-2.5">
                <option value="dollarino_v01">{isFa ? 'استراتژی شکار (دُرنا V1)' : 'Hunting Engine (Dorna V1)'}</option>
                <option value="kbos_v11">KBOS Super v11</option>
                <option value="sp2l">SP2L Spike-2Leg</option>
                <option value="ema_trend_pullback">EMA Pullback</option>
                <option value="signal_mixer">Signal Mixer</option>
              </select>
            </div>
            <div>
              <label className="text-dim block mb-1">{isFa ? 'مقایسه A/B' : 'Compare A/B'}</label>
              <select value={compareStrategy} onChange={(e) => setCompareStrategy(e.target.value as StrategyKey | '')} className="field text-xs py-2.5">
                <option value="">{isFa ? 'بدون مقایسه' : 'None'}</option>
                <option value="kbos_v11">KBOS v11</option>
                <option value="sp2l">SP2L</option>
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
              <label className="text-dim block mb-1">{isFa ? 'سرمایه ($)' : 'Capital ($)'}</label>
              <input type="number" value={btCapital} onChange={(e) => setBtCapital(Number(e.target.value))} className="field text-xs py-2.5 font-num" />
            </div>
            <div>
              <label className="text-dim block mb-1">{isFa ? 'مارجین / اهرم' : 'Margin% / Lev'}</label>
              <div className="grid grid-cols-2 gap-1">
                <input type="number" min={1} max={100} value={btMarginPct} onChange={(e) => setBtMarginPct(Number(e.target.value))} className="field text-xs py-2.5 font-num" />
                <input type="number" min={1} max={50} value={btLev} onChange={(e) => setBtLev(Number(e.target.value))} className="field text-xs py-2.5 font-num" />
              </div>
            </div>
          </div>

          {btResult && (
            <div className="space-y-5 pt-4 border-t hairline">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-center">
                {[
                  { l: isFa ? 'بازده خالص' : 'Net Return', v: `${btResult.metrics.netReturnPct >= 0 ? '+' : ''}${btResult.metrics.netReturnPct.toFixed(2)}%`, c: btResult.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss' },
                  { l: isFa ? 'معاملات' : 'Trades', v: String(btResult.metrics.totalTrades), c: 'text-main' },
                  { l: isFa ? 'وین‌ریت' : 'Win Rate', v: `${btResult.metrics.winRatePct.toFixed(1)}%`, c: 'text-goldsoft' },
                  { l: 'Profit Factor', v: btResult.metrics.profitFactor >= 90 ? '∞' : btResult.metrics.profitFactor.toFixed(2), c: 'text-jade' },
                  { l: 'Sharpe', v: btResult.metrics.sharpeEstimate.toFixed(2), c: 'text-brand' },
                  { l: isFa ? 'حداکثر افت' : 'Max DD', v: `${btResult.metrics.maxDrawdownPct.toFixed(2)}%`, c: 'text-loss' },
                ].map((m) => (
                  <div key={m.l} className="surface-soft rounded-2xl p-3">
                    <p dir="ltr" className={`font-num font-bold text-base ${m.c}`}>{m.v}</p>
                    <p className="text-[10px] text-dim mt-0.5">{m.l}</p>
                  </div>
                ))}
              </div>

              {compareResult && (
                <div className="banner-cobalt-soft rounded-2xl p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black text-brand">A/B Compare · {compareStrategy.toString().toUpperCase()}</span>
                  <div dir="ltr" className="flex gap-4 font-num font-bold text-main">
                    <span>Return: {compareResult.metrics.netReturnPct.toFixed(2)}%</span>
                    <span>WR: {compareResult.metrics.winRatePct.toFixed(1)}%</span>
                    <span>PF: {compareResult.metrics.profitFactor >= 90 ? '∞' : compareResult.metrics.profitFactor.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {btResult.equityCurve.length >= 2 && (
                <div className="h-[280px] rounded-2xl surface-soft border hairline p-3.5">
                  <AreaChart
                    values={btResult.equityCurve.map((p) => p.equity)}
                    points={btResult.equityCurve.map((p) => ({ time: p.time, equity: p.equity }))}
                    compareValues={compareResult?.equityCurve.map((p) => p.equity)}
                    compareLabel={compareStrategy.toString().toUpperCase()}
                    baseline={btCapital}
                    height={250}
                  />
                </div>
              )}

              {btResult.monthlyBreakdown.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="text-xs font-black text-main flex items-center gap-1.5 mb-2">
                    <Calendar className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                    <span>{isFa ? 'عملکرد ماهانه و سالانه (%)' : 'Monthly Performance Heatmap (%)'}</span>
                  </p>
                  <table className="w-full text-[11px] font-num border-collapse" dir="ltr">
                    <thead>
                      <tr className="text-dim border-b hairline">
                        <th className="py-2 px-2 text-start">Year</th>
                        {MONTH_NAMES.map((m) => (
                          <th key={m} className="py-2 px-1 text-center">{m}</th>
                        ))}
                        <th className="py-2 px-2 text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.monthlyBreakdown.map((row) => (
                        <tr key={row.year} className="border-b hairline">
                          <td className="py-2 px-2 font-black text-main">{row.year}</td>
                          {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
                            const val = row.months[m] ?? 0;
                            return (
                              <td key={m} className="p-1 text-center">
                                <span className={`inline-block w-full py-1 rounded-lg ${val > 0 ? 'badge-signal' : val < 0 ? 'bg-rose-500/15 text-loss font-bold' : 'surface-soft text-dim'}`}>
                                  {val === 0 ? '—' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`}
                                </span>
                              </td>
                            );
                          })}
                          <td className={`py-2 px-2 text-end font-black ${row.yearPct >= 0 ? 'text-jade' : 'text-loss'}`}>
                            {row.yearPct >= 0 ? '+' : ''}{row.yearPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {btResult.trades.length > 0 && (
                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                  <p className="text-xs font-black text-main mb-2">
                    {isFa ? `ریز معاملات شبیه‌سازی (${btResult.trades.length})` : `Simulated Trades (${btResult.trades.length})`}
                  </p>
                  <table className="w-full text-[11px] font-num" dir="ltr">
                    <thead>
                      <tr className="text-dim border-b hairline">
                        <th className="py-1.5 text-start">Dir</th>
                        <th className="py-1.5 text-start">Entry</th>
                        <th className="py-1.5 text-start">Exit</th>
                        <th className="py-1.5 text-start">Reason</th>
                        <th className="py-1.5 text-end">PnL ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.trades.slice(0, 60).map((t) => (
                        <tr key={t.id} className="border-b hairline">
                          <td className={`py-1.5 font-bold ${t.direction === 'LONG' ? 'text-jade' : 'text-loss'}`}>{t.direction}</td>
                          <td className="py-1.5 text-main">${t.entryPrice.toFixed(2)}</td>
                          <td className="py-1.5 text-main">${t.exitPrice.toFixed(2)}</td>
                          <td className="py-1.5 text-dim">{t.exitReason}</td>
                          <td className={`py-1.5 text-end font-bold ${t.pnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                            {t.pnlUsd >= 0 ? '+' : '-'}${Math.abs(t.pnlUsd).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Top-10 Coin × Multi-Timeframe Auto-Scanner Matrix */}
          <div className="pt-5 border-t hairline space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#059669]" />
                  <span>{isFa ? 'ماتریس خودکار ۱۰ کوین برتر × ۳ تایم‌فریم' : 'Auto Matrix Finder: Top-10 Coins × 3 Timeframes'}</span>
                </h4>
                <p className="text-[11px] text-dim mt-0.5">
                  {isFa
                    ? 'کل بازار را روی تایم‌فریم‌های 15m، 1h و 4h اسکن می‌کند تا پرسودترین جفت‌ارز و تایم‌فریم همین استراتژی را پیشنهاد دهد.'
                    : 'Scans 10 liquid coins across 15m, 1h & 4h to recommend the #1 best symbol + timeframe for this strategy.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={matrixStrategy}
                  onChange={(e) => setMatrixStrategy(e.target.value as StrategyKey)}
                  className="field text-xs py-2 w-auto"
                >
                  <option value="dollarino_v01">{isFa ? 'دُرنا V1' : 'Dorna V1'}</option>
                  <option value="kbos_v11">KBOS v11</option>
                  <option value="sp2l">SP2L</option>
                  <option value="ema_trend_pullback">EMA Pullback</option>
                  <option value="signal_mixer">Signal Mixer</option>
                </select>
                <button
                  type="button"
                  disabled={matrixScanning}
                  onClick={() => void runMatrixScan()}
                  className="btn-emerald px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{matrixScanning ? (isFa ? 'در حال اسکن ۳۰ ترکیب...' : 'Scanning 30 pairs...') : isFa ? 'کشف بهترین کوین و تایم‌فریم' : 'Discover Best Pair & TF'}</span>
                </button>
              </div>
            </div>

            {matrixCells.length > 0 && (() => {
              const sorted = [...matrixCells].sort((a, b) => b.netReturnPct - a.netReturnPct);
              const best = sorted[0];
              const symbols = Array.from(new Set(matrixCells.map((c) => c.symbol)));
              return (
                <div className="space-y-3">
                  {best && (
                    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/35 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <CoinIcon symbol={best.symbol} size={28} />
                        <div>
                          <div className="font-black text-jade">
                            {isFa ? `پیشنهاد شماره ۱: ${best.symbol} روی تایم‌فریم ${best.timeframe}` : `#1 Best Match: ${best.symbol} (${best.timeframe})`}
                          </div>
                          <div dir="ltr" className="text-[11px] font-num text-sub">
                            Return: {best.netReturnPct >= 0 ? '+' : ''}{best.netReturnPct.toFixed(2)}% · WR: {best.winRatePct.toFixed(1)}% · PF: {best.profitFactor.toFixed(2)} ({best.totalTrades} trades)
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onTradeSymbol(best.symbol)}
                          className="btn-gold px-3.5 py-2 rounded-xl text-[11px] font-black"
                        >
                          {isFa ? 'ترید در پایانه' : 'Open Terminal'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch('/api/trading/config', {
                              method: 'PATCH',
                              body: JSON.stringify({
                                symbol: best.symbol,
                                entry_timeframe: best.timeframe,
                                strategy_key: matrixStrategy,
                              }),
                            });
                            setNotice(isFa ? `${best.symbol} (${best.timeframe}) روی ربات تنظیم شد.` : `Bot set to ${best.symbol} (${best.timeframe}).`);
                            await onRefresh();
                          }}
                          className="btn-cobalt px-3.5 py-2 rounded-xl text-[11px] font-black"
                        >
                          {isFa ? 'اعمال روی ربات' : 'Apply to Bot'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] font-num border-collapse" dir="ltr">
                      <thead>
                        <tr className="text-dim border-b hairline">
                          <th className="py-2 px-2 text-start">Coin</th>
                          <th className="py-2 px-2 text-center">15m Return / WR</th>
                          <th className="py-2 px-2 text-center">1h Return / WR</th>
                          <th className="py-2 px-2 text-center">4h Return / WR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbols.map((sym) => (
                          <tr key={sym} className="border-b hairline">
                            <td className="py-2 px-2 font-black text-main">{sym.replace('USDT', '')}</td>
                            {(['15m', '1h', '4h'] as const).map((tf) => {
                              const cell = matrixCells.find((c) => c.symbol === sym && c.timeframe === tf);
                              if (!cell) return <td key={tf} className="p-1 text-center text-dim">—</td>;
                              const isBest = best && best.symbol === sym && best.timeframe === tf;
                              return (
                                <td key={tf} className="p-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBtSymbol(sym);
                                      setBtTf(tf);
                                      setBtStrategy(matrixStrategy);
                                    }}
                                    className={`w-full py-1.5 px-2 rounded-xl transition ${
                                      isBest
                                        ? 'ring-2 ring-emerald-400 badge-signal font-black'
                                        : cell.netReturnPct > 0
                                          ? 'badge-signal'
                                          : 'bg-rose-500/10 text-loss'
                                    }`}
                                  >
                                    {cell.netReturnPct >= 0 ? '+' : ''}{cell.netReturnPct.toFixed(1)}% · {cell.winRatePct.toFixed(0)}%
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {subTab === 'tvalerts' && (
        <TradingViewAlertsHub
          lang={lang}
          defaultSymbol={data.config.symbol || 'BTCUSDT'}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
