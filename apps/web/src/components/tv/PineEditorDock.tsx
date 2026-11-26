import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  FileCode2,
  Layers,
  Play,
  Rocket,
  Save,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  SAMPLE_CUSTOM_STRATEGIES,
  type CustomStrategyLanguage,
  type PineConsoleLog,
  type PineInputMeta,
  type SampleCustomStrategy,
  type Timeframe,
} from '@dollarino/core';
import { apiFetch } from '../../lib/api';
import type { Lang } from '../../lib/i18n';
import type { CustomStrategyChartOverlay } from '../CandlestickChart';
import { AreaChart } from '../DollarinoViz';

export interface SavedPineStrategy {
  id: string;
  name: string;
  description: string;
  language: CustomStrategyLanguage;
  code: string;
  timeframe: string;
  updated_at: string;
}

interface BacktestSummaryData {
  metrics: {
    netReturnPct: number;
    totalTrades: number;
    winRatePct: number;
    profitFactor: number;
    sharpeEstimate: number;
    maxDrawdownPct: number;
  };
  equityCurve: Array<{ time: number; equity: number }>;
  trades?: Array<{
    direction: string;
    entryPrice: number;
    exitPrice: number;
    pnlPct: number;
    exitReason: string;
  }>;
}

type DockBottomTab = 'tester' | 'console' | 'inputs' | 'graphics';

export function PineEditorDock({
  lang,
  symbol,
  timeframe,
  initialScript,
  onAppliedToChart,
  onClearFromChart,
  onActivatedOnBot,
  onClose,
}: {
  lang: Lang;
  symbol: string;
  timeframe: Timeframe;
  initialScript?: { name: string; language: CustomStrategyLanguage; code: string } | null;
  onAppliedToChart: (overlay: CustomStrategyChartOverlay) => void;
  onClearFromChart?: () => void;
  onActivatedOnBot?: () => Promise<void> | void;
  onClose?: () => void;
}) {
  const isFa = lang === 'fa';
  const [samples, setSamples] = useState<SampleCustomStrategy[]>(SAMPLE_CUSTOM_STRATEGIES);
  const [savedList, setSavedList] = useState<SavedPineStrategy[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [language, setLanguage] = useState<CustomStrategyLanguage>(initialScript?.language ?? 'pine');
  const [name, setName] = useState(initialScript?.name ?? (isFa ? 'ایچیموکو + شکست کومو v6' : 'Ichimoku Cloud Breakout v6'));
  const [code, setCode] = useState(
    initialScript?.code ??
      (SAMPLE_CUSTOM_STRATEGIES.find((s) => s.id === 'pine6_ichimoku_cloud')?.code ?? SAMPLE_CUSTOM_STRATEGIES[0]!.code)
  );
  const [aiPrompt, setAiPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [bottomTab, setBottomTab] = useState<DockBottomTab>('tester');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<{
    pineVersion?: 4 | 5 | 6;
    scriptKind?: 'indicator' | 'strategy' | 'library';
    title: string;
    errors: string[];
    warnings: string[];
    logs: PineConsoleLog[];
    inputs: PineInputMeta[];
    plotsCount: number;
    markersCount: number;
    boxesCount: number;
    linesCount: number;
    labelsCount: number;
    polylinesCount: number;
    tablesCount: number;
    alertsCount: number;
    backtestSummary: BacktestSummaryData | null;
  } | null>(null);

  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialScript) {
      setLanguage(initialScript.language);
      setName(initialScript.name);
      setCode(initialScript.code);
      setEditingId(undefined);
    }
  }, [initialScript]);

  const loadLibrary = async () => {
    try {
      const r = await apiFetch<{ samples: SampleCustomStrategy[]; userStrategies: SavedPineStrategy[] }>(
        '/api/trading/strategies'
      );
      if (r.samples?.length) setSamples(r.samples);
      if (r.userStrategies) setSavedList(r.userStrategies);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  const lineCount = useMemo(() => Math.max(12, code.split('\n').length), [code]);
  const detectedVersion = useMemo(() => {
    const m = code.match(/\/\/\s*@version\s*=\s*(4|5|6)/i);
    return m?.[1] ? `v${m[1]}` : language === 'pine' ? 'v5' : 'Py';
  }, [code, language]);

  const runOnChart = async (overrideCode?: string, overrideLang?: CustomStrategyLanguage, overrideName?: string) => {
    const targetCode = overrideCode ?? code;
    const targetLang = overrideLang ?? language;
    const targetName = overrideName ?? name;
    setBusy(true);
    setMsg(null);
    try {
      const ev = await apiFetch<{
        valid: boolean;
        title: string;
        pineVersion?: 4 | 5 | 6;
        scriptKind?: 'indicator' | 'strategy' | 'library';
        overlay?: boolean;
        errors: string[];
        warnings: string[];
        plots: CustomStrategyChartOverlay['plots'];
        markers: CustomStrategyChartOverlay['markers'];
        hlines?: CustomStrategyChartOverlay['hlines'];
        fills?: CustomStrategyChartOverlay['fills'];
        bgcolors?: CustomStrategyChartOverlay['bgcolors'];
        barcolors?: CustomStrategyChartOverlay['barcolors'];
        labels?: CustomStrategyChartOverlay['labels'];
        lines?: CustomStrategyChartOverlay['lines'];
        boxes?: CustomStrategyChartOverlay['boxes'];
        tables?: CustomStrategyChartOverlay['tables'];
        polylines?: CustomStrategyChartOverlay['polylines'];
        logs?: PineConsoleLog[];
        inputs?: PineInputMeta[];
        alertsTriggered?: Array<{ time: number; message: string }>;
        backtestSummary: BacktestSummaryData | null;
      }>('/api/trading/strategies/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          language: targetLang,
          code: targetCode,
          symbol,
          timeframe,
          limit: 500,
        }),
      });

      setLastResult({
        pineVersion: ev.pineVersion,
        scriptKind: ev.scriptKind,
        title: ev.title || targetName,
        errors: ev.errors || [],
        warnings: ev.warnings || [],
        logs: ev.logs || [],
        inputs: ev.inputs || [],
        plotsCount: ev.plots?.length || 0,
        markersCount: ev.markers?.length || 0,
        boxesCount: ev.boxes?.length || 0,
        linesCount: ev.lines?.length || 0,
        labelsCount: ev.labels?.length || 0,
        polylinesCount: ev.polylines?.length || 0,
        tablesCount: ev.tables?.length || 0,
        alertsCount: ev.alertsTriggered?.length || 0,
        backtestSummary: ev.backtestSummary ?? null,
      });

      if (ev.valid) {
        onAppliedToChart({
          id: editingId,
          title: ev.title || targetName,
          language: targetLang,
          pineVersion: ev.pineVersion,
          scriptKind: ev.scriptKind,
          overlay: ev.overlay,
          plots: ev.plots,
          markers: ev.markers,
          hlines: ev.hlines,
          fills: ev.fills,
          bgcolors: ev.bgcolors,
          barcolors: ev.barcolors,
          labels: ev.labels,
          lines: ev.lines,
          boxes: ev.boxes,
          tables: ev.tables,
          polylines: ev.polylines,
          logs: ev.logs,
          inputs: ev.inputs,
          alertsTriggered: ev.alertsTriggered,
        });
        const gfxCount =
          (ev.boxes?.length || 0) +
          (ev.lines?.length || 0) +
          (ev.labels?.length || 0) +
          (ev.polylines?.length || 0) +
          (ev.tables?.length || 0);
        setMsg({
          ok: true,
          text: isFa
            ? `اجرا شد (${ev.pineVersion ? `Pine v${ev.pineVersion}` : targetLang.toUpperCase()}) · ${ev.plots.length} خط · ${ev.markers.length} سیگنال · ${gfxCount} المان گرافیکی`
            : `Compiled (${ev.pineVersion ? `Pine v${ev.pineVersion}` : targetLang.toUpperCase()}) · ${ev.plots.length} plots · ${ev.markers.length} signals · ${gfxCount} graphics`,
        });
      } else {
        setMsg({ ok: false, text: ev.errors[0] || 'Compilation failed' });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Evaluation error' });
    } finally {
      setBusy(false);
    }
  };

  const saveAndMaybeDeploy = async (deploy: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await apiFetch<{ ok: boolean; strategy: SavedPineStrategy }>('/api/trading/strategies', {
        method: 'POST',
        body: JSON.stringify({
          id: editingId,
          name: name.trim() || 'My Pine Script',
          language,
          code,
          timeframe,
        }),
      });
      setEditingId(saved.strategy.id);
      if (deploy) {
        await apiFetch(`/api/trading/strategies/${saved.strategy.id}/activate`, { method: 'POST' });
        setMsg({
          ok: true,
          text: isFa
            ? `استراتژی «${saved.strategy.name}» ذخیره و به ربات خودکار متصل شد.`
            : `Saved & deployed "${saved.strategy.name}" to Autonomous Bot.`,
        });
        await onActivatedOnBot?.();
      } else {
        setMsg({
          ok: true,
          text: isFa ? `«${saved.strategy.name}» در کتابخانه ذخیره شد.` : `Saved "${saved.strategy.name}".`,
        });
      }
      await loadLibrary();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  const generateWithAi = async () => {
    const prompt = aiPrompt.trim() || code.trim();
    if (!prompt) return;
    setAiBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ ok: boolean; title?: string; code?: string; summary?: string }>('/api/my-ai/convert-strategy', {
        method: 'POST',
        body: JSON.stringify({ prompt, targetLanguage: language }),
      });
      if (r.code) setCode(r.code);
      if (r.title) setName(r.title);
      setMsg({
        ok: true,
        text: r.summary || (isFa ? 'کد با هوش مصنوعی تولید شد — در حال اجرا روی چارت...' : 'AI script generated!'),
      });
      if (r.code) {
        await runOnChart(r.code, language, r.title || name);
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'AI generation failed' });
    } finally {
      setAiBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runOnChart();
    }
  };

  return (
    <div className="panel rounded-[26px] border hairline overflow-hidden flex flex-col shadow-xl">
      {/* Top Editor Header */}
      <div className="px-4 py-3 border-b hairline bg-[var(--soft)]/60 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[var(--gold)]" />
            <span className="font-display font-bold text-sm text-main">
              {isFa ? 'ویرایشگر کد Pine Script v5/v6' : 'Pine Script™ v5/v6 Editor'}
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full badge-signal">{detectedVersion}</span>
          </div>

          <div className="ios-segmented p-0.5">
            {[
              { id: 'pine' as const, l: 'Pine v5/v6', icon: FileCode2 },
              { id: 'python' as const, l: 'Python', icon: TerminalIcon },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLanguage(item.id)}
                  className={`px-2.5 py-1 rounded-full text-[10.5px] font-black inline-flex items-center gap-1 transition ${
                    language === item.id ? 'ios-pill-active' : 'text-dim hover:text-main'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{item.l}</span>
                </button>
              );
            })}
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isFa ? 'نام اسکریپت...' : 'Script title...'}
            className="field py-1 px-2.5 text-xs font-bold w-44 sm:w-56"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value=""
            onChange={(e) => {
              const found = samples.find((s) => s.id === e.target.value);
              if (found) {
                setEditingId(undefined);
                setLanguage(found.language);
                setName(isFa ? found.nameFa : found.nameEn);
                setCode(found.code);
                void runOnChart(found.code, found.language, isFa ? found.nameFa : found.nameEn);
              }
            }}
            className="field py-1.5 px-2.5 text-[11px] max-w-[210px]"
          >
            <option value="">{isFa ? 'قالب‌های آماده Pine v5/v6...' : 'Load Pine v5/v6 template...'}</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {isFa ? s.nameFa : s.nameEn}
              </option>
            ))}
          </select>

          {savedList.length > 0 && (
            <select
              value={editingId || ''}
              onChange={(e) => {
                const u = savedList.find((x) => x.id === e.target.value);
                if (u) {
                  setEditingId(u.id);
                  setLanguage(u.language);
                  setName(u.name);
                  setCode(u.code);
                }
              }}
              className="field py-1.5 px-2.5 text-[11px] max-w-[160px]"
            >
              <option value="">{isFa ? `ذخیره‌شده (${savedList.length})` : `Saved (${savedList.length})`}</option>
              {savedList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void runOnChart()}
            className="btn-cobalt px-3.5 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
            title="Ctrl/Cmd + Enter"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{busy ? '...' : isFa ? 'افزودن به چارت' : 'Add to Chart'}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAndMaybeDeploy(false)}
            className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isFa ? 'ذخیره' : 'Save'}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAndMaybeDeploy(true)}
            className="btn-emerald px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>{isFa ? 'دپلوی روی ربات' : 'Deploy Bot'}</span>
          </button>

          {onClearFromChart && (
            <button
              type="button"
              onClick={onClearFromChart}
              className="btn-ghost p-1.5 rounded-xl text-dim hover:text-loss"
              title={isFa ? 'پاک کردن لایه از چارت' : 'Remove overlay from chart'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button type="button" onClick={onClose} className="btn-ghost p-1.5 rounded-xl text-dim hover:text-main">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* AI Pine Script Assistant Strip */}
      <div className="px-4 py-2 border-b hairline bg-blue-500/5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black text-brand shrink-0">
          <Wand2 className="w-3.5 h-3.5" />
          <span>{isFa ? 'تولید / تبدیل Pine v6 با AI:' : 'AI Pine v6 Generator:'}</span>
        </div>
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void generateWithAi()}
          placeholder={
            isFa
              ? 'مثلاً: استراتژی SuperTrend + VWAP با فیلتر RSI و باکس Order Block بنویس...'
              : 'Describe a strategy (e.g. SuperTrend + VWAP bands with trailing stop & table HUD)...'
          }
          className="surface-input flex-1 rounded-xl px-3 py-1.5 text-[11px]"
        />
        <button
          type="button"
          disabled={aiBusy}
          onClick={() => void generateWithAi()}
          className="btn-gold px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{aiBusy ? '...' : isFa ? 'ساخت و اجرا' : 'Generate & Run'}</span>
        </button>
      </div>

      {/* Monospace Code Editor with Line Gutter */}
      <div dir="ltr" className="relative flex bg-[#050b1a] text-[#dce8ff] font-mono text-[12px] leading-[1.55] h-[250px] border-b border-blue-500/20">
        <div
          ref={gutterRef}
          className="select-none py-3 px-2.5 text-right text-[#4b6491] bg-[#040814] border-r border-white/5 overflow-hidden w-11 shrink-0"
        >
          {Array.from({ length: lineCount }, (_, idx) => (
            <div key={idx}>{idx + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          className="flex-1 bg-transparent p-3 outline-none resize-none overflow-auto whitespace-pre"
        />
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(code)}
          className="absolute top-2.5 right-3 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-slate-300 inline-flex items-center gap-1"
          title="Copy code"
        >
          <Copy className="w-3 h-3" /> Copy
        </button>
      </div>

      {/* Status Banner + Warnings */}
      {msg && (
        <div
          className={`px-4 py-2 text-[11px] font-bold flex flex-wrap items-center justify-between gap-2 border-b hairline ${
            msg.ok ? 'bg-jade/10 text-jade' : 'bg-rose-500/15 text-loss'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            <span>{msg.text}</span>
          </span>
          {lastResult?.warnings?.length ? (
            <span className="text-[10px] text-amber-400">
              ⚠ {lastResult.warnings[0]}
            </span>
          ) : null}
        </div>
      )}

      {/* Bottom Results Bar: Strategy Tester / Pine Console / Inputs / Graphics */}
      <div className="p-3.5 space-y-3 bg-[var(--panel)]">
        <div className="flex flex-wrap items-center gap-1.5 border-b hairline pb-2">
          {[
            { id: 'tester' as const, labelFa: 'تستر استراتژی (Backtest)', labelEn: 'Strategy Tester', icon: Activity },
            {
              id: 'console' as const,
              labelFa: `کنسول Pine Logs (${lastResult?.logs.length ?? 0})`,
              labelEn: `Pine Logs (${lastResult?.logs.length ?? 0})`,
              icon: TerminalIcon,
            },
            {
              id: 'inputs' as const,
              labelFa: `ورودی‌ها (${lastResult?.inputs.length ?? 0})`,
              labelEn: `Inputs (${lastResult?.inputs.length ?? 0})`,
              icon: Layers,
            },
            { id: 'graphics' as const, labelFa: 'آمار گرافیکی TV', labelEn: 'TV Graphics', icon: Bot },
          ].map((tb) => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setBottomTab(tb.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5 transition ${
                  bottomTab === tb.id ? 'btn-gold' : 'surface-soft text-dim hover:text-main'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isFa ? tb.labelFa : tb.labelEn}</span>
              </button>
            );
          })}
        </div>

        {bottomTab === 'tester' && (
          lastResult?.backtestSummary ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <div className="lg:col-span-7 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                {[
                  {
                    label: isFa ? 'بازده کل' : 'Net Profit',
                    val: `${lastResult.backtestSummary.metrics.netReturnPct >= 0 ? '+' : ''}${lastResult.backtestSummary.metrics.netReturnPct.toFixed(2)}%`,
                    cls: lastResult.backtestSummary.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss',
                  },
                  {
                    label: isFa ? 'معاملات' : 'Trades',
                    val: String(lastResult.backtestSummary.metrics.totalTrades),
                    cls: 'text-main',
                  },
                  {
                    label: isFa ? 'نرخ برد' : 'Win Rate',
                    val: `${lastResult.backtestSummary.metrics.winRatePct.toFixed(1)}%`,
                    cls: 'text-brand',
                  },
                  {
                    label: 'PF',
                    val: lastResult.backtestSummary.metrics.profitFactor.toFixed(2),
                    cls: 'text-main',
                  },
                  {
                    label: 'Sharpe',
                    val: lastResult.backtestSummary.metrics.sharpeEstimate.toFixed(2),
                    cls: 'text-main',
                  },
                  {
                    label: 'Max DD',
                    val: `-${lastResult.backtestSummary.metrics.maxDrawdownPct.toFixed(1)}%`,
                    cls: 'text-loss',
                  },
                ].map((m) => (
                  <div key={m.label} className="surface-soft rounded-xl p-2 border hairline">
                    <span className="text-[9.5px] text-dim block">{m.label}</span>
                    <strong dir="ltr" className={`font-num text-xs font-black ${m.cls}`}>
                      {m.val}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-5 h-[88px] surface-soft rounded-2xl p-2 border hairline">
                {lastResult.backtestSummary.equityCurve?.length > 2 && (
                  <AreaChart
                    values={lastResult.backtestSummary.equityCurve.map((x) => x.equity)}
                    points={lastResult.backtestSummary.equityCurve}
                    height={72}
                    showHud={false}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-[11px] text-dim">
              {isFa
                ? 'روی «افزودن به چارت» کلیک کنید تا بک‌تست روی ۵۰۰ کندل اخیر اجرا و گزارش سود/زیان نمایش داده شود.'
                : 'Click "Add to Chart" to evaluate across 500 live candles and compute Strategy Tester metrics.'}
            </div>
          )
        )}

        {bottomTab === 'console' && (
          <div dir="ltr" className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] surface-soft rounded-2xl p-3 border hairline">
            {!lastResult?.logs.length ? (
              <div className="text-dim text-center py-3">
                No Pine console output yet. Use log.info("...") or alert("...") in Pine v5/v6.
              </div>
            ) : (
              lastResult.logs.map((lg, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-dim shrink-0">[{lg.barIndex}]</span>
                  <span
                    className={`uppercase font-black shrink-0 ${
                      lg.level === 'error' ? 'text-loss' : lg.level === 'warn' ? 'text-amber-400' : 'text-jade'
                    }`}
                  >
                    {lg.level}
                  </span>
                  <span className="text-main">{lg.message}</span>
                </div>
              ))
            )}
          </div>
        )}

        {bottomTab === 'inputs' && (
          <div className="grid sm:grid-cols-3 gap-2">
            {!lastResult?.inputs.length ? (
              <div className="sm:col-span-3 text-center text-[11px] text-dim py-3">
                {isFa ? 'ورودی input.* در اسکریپت تعریف نشده است.' : 'No input.* parameters detected in script.'}
              </div>
            ) : (
              lastResult.inputs.map((inp) => (
                <div key={inp.name} className="surface-soft rounded-xl px-3 py-2 border hairline flex items-center justify-between gap-2 text-[11px]">
                  <div>
                    <span className="font-bold text-main block">{inp.title}</span>
                    <span className="text-[9.5px] font-mono text-dim">{inp.name} ({inp.type})</span>
                  </div>
                  <span dir="ltr" className="font-num font-black text-[var(--gold)]">
                    {String(inp.value)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {bottomTab === 'graphics' && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px]">
            {[
              { label: 'Plots', val: lastResult?.plotsCount ?? 0 },
              { label: 'Signals', val: lastResult?.markersCount ?? 0 },
              { label: 'Boxes', val: lastResult?.boxesCount ?? 0 },
              { label: 'Lines', val: lastResult?.linesCount ?? 0 },
              { label: 'Labels', val: lastResult?.labelsCount ?? 0 },
              { label: 'Polylines', val: lastResult?.polylinesCount ?? 0 },
            ].map((g) => (
              <div key={g.label} className="surface-soft rounded-xl p-2 border hairline">
                <span className="text-[9.5px] text-dim block">{g.label}</span>
                <strong className="font-num text-sm text-main">{g.val}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
