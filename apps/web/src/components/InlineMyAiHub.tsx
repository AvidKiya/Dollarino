import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ImagePlus,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { compressChartImageFile } from './FloatingAiChat';

interface TrainedAIRules {
  style: string;
  timeframe: string;
  directionMode: string;
  symbols: string[];
  indicators: string[];
  rsiOversold: number;
  rsiOverbought: number;
  emaFast: number;
  emaSlow: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxLeverage: number;
}

interface MyAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function InlineMyAiHub({
  lang,
  hasPaidPlan,
  onMsg,
  onRefresh,
  onNeedSubscription,
}: {
  lang: Lang;
  hasPaidPlan: boolean;
  onMsg: (text: string, isErr?: boolean) => void;
  onRefresh: () => Promise<void>;
  onNeedSubscription?: () => void;
}) {
  const isFa = lang === 'fa';
  const [agentName, setAgentName] = useState('هوش مصنوعی شخصی من');
  const [rules, setRules] = useState<TrainedAIRules | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<MyAiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [chartImg, setChartImg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    symbol: string;
    timeframe: string;
    latestSignal: { signal: string; price: number; rsi: number } | null;
    markersCount: number;
    backtest: {
      metrics: { netReturnPct: number; totalTrades: number; winRatePct: number; maxDrawdownPct: number };
    } | null;
  } | null>(null);

  const imgInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch<{
        agent: { name: string; is_active_for_trading: number; rules: TrainedAIRules };
        messages: MyAiMessage[];
      }>('/api/my-ai');
      setAgentName(res.agent.name);
      setRules(res.agent.rules);
      setIsActive(Boolean(res.agent.is_active_for_trading));
      setMessages(res.messages.slice(-8));
    } catch {
      // silent load guard
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sendMessage = async (customText?: string) => {
    const txt = (customText ?? input).trim();
    if (!txt && !chartImg) return;
    setBusy(true);
    const imgToSend = chartImg;
    if (!customText) {
      setInput('');
      setChartImg(null);
    }
    try {
      const res = await apiFetch<{ ok: boolean; reply: string; rules: TrainedAIRules }>('/api/my-ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: txt,
          agentName,
          imageDataUrl: imgToSend || undefined,
        }),
      });
      setRules(res.rules);
      await load();
      onMsg(isFa ? 'قوانین جدید به هوش مصنوعی شخصی شما آموزش داده شد.' : 'Personal AI trained with your new rules.');
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Error teaching AI', true);
    } finally {
      setBusy(false);
    }
  };

  const runQuickTest = async () => {
    setTestBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        symbol: string;
        timeframe: string;
        latestSignal: { signal: string; price: number; rsi: number } | null;
        markersCount: number;
        backtest: {
          metrics: { netReturnPct: number; totalTrades: number; winRatePct: number; maxDrawdownPct: number };
        } | null;
      }>('/api/my-ai/test', {
        method: 'POST',
        body: JSON.stringify({ symbol: rules?.symbols[0] || 'BTCUSDT' }),
      });
      setTestResult(res);
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Test failed', true);
    } finally {
      setTestBusy(false);
    }
  };

  const activateMyAi = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/my-ai/activate', {
        method: 'POST',
        body: JSON.stringify({ active: true, startBot: true }),
      });
      setIsActive(true);
      await onRefresh();
      onMsg(
        isFa
          ? 'هوش مصنوعی شخصی شما فعال و در حال ترید خودکار ۲۴/۷ است!'
          : 'Your Personal AI is now live and trading 24/7!'
      );
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Activation error', true);
    } finally {
      setBusy(false);
    }
  };

  const resetAi = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; rules: TrainedAIRules }>('/api/my-ai/reset', { method: 'POST' });
      setRules(res.rules);
      setIsActive(false);
      setTestResult(null);
      await load();
      onMsg(isFa ? 'هوش مصنوعی من به حالت خام اولیه برگشت.' : 'Personal AI reset to blank state.');
    } finally {
      setBusy(false);
    }
  };

  const quickPrompts = isFa
    ? [
        {
          label: '⚡ اسکالپ ۵ دقیقه',
          prompt: 'اسکالپ ۵ دقیقه روی BTC و ETH با EMA 9/21 و RSI زیر ۳۵، حد ضرر ۱.۵٪ و سود ۴٪ و اهرم ۵x',
        },
        {
          label: '🌊 سوئینگ ۴ ساعته',
          prompt: 'سوئینگ ۴ ساعته کم‌ریسک روی BTC/ETH/SOL با EMA 20/50 و RSI، حد ضرر ۲٪ و تارگت ۷٪ با اهرم ۳x',
        },
        {
          label: '🪙 ترید طلا و بیت‌کوین',
          prompt: 'معاملات لانگ و شورت ۱۵ دقیقه‌ای روی PAXG و BTC با SuperTrend و حد ضرر ۱.۸٪ و سود ۵٪ با اهرم ۴x',
        },
        {
          label: '🛡 ریسک کم ۲٪',
          prompt: 'استراتژی محافظه‌کارانه تایم ۱ ساعته روی BTC و BNB با حداکثر اهرم ۲x، حد ضرر ۱.۲٪ و تارگت ۳.۶٪',
        },
      ]
    : [
        { label: '⚡ 5m Scalp', prompt: '5m scalp on BTC and ETH with EMA 9/21 + RSI < 35, SL 1.5%, TP 4%, 5x' },
        { label: '🌊 4h Swing', prompt: '4h low-risk swing on BTC/ETH/SOL with EMA 20/50 + RSI, SL 2%, TP 7%, 3x' },
        { label: '🪙 Gold & BTC', prompt: '15m PAXG & BTC with SuperTrend, SL 1.8%, TP 5%, 4x leverage' },
        { label: '🛡 Low Risk 2%', prompt: 'Conservative 1h on BTC & BNB with 2x leverage, SL 1.2%, TP 3.6%' },
      ];

  return (
    <div className="space-y-4 tab-enter">
      {/* Header strip + Reset / Activate */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
            <Brain className="w-5 h-5" />
          </span>
          <div>
            <p className="text-sm font-black text-main">
              {isFa ? 'آموزش مستقیم هوش مصنوعی شخصی شما (در همین صفحه)' : 'Train Your Personal AI Inline'}
            </p>
            <p className="text-[11px] text-dim">
              {isFa
                ? 'با زبان ساده یا آپلود عکس چارت، استراتژی‌ات را همین‌جا بهش یاد بده، تست بگیر و اجرا کن'
                : 'Teach rules in plain text or upload a chart screenshot — backtest & activate right here'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetAi()}
            className="btn-ghost px-3 py-2 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isFa ? 'ریست خام' : 'Reset'}</span>
          </button>
          <button
            type="button"
            disabled={testBusy}
            onClick={() => void runQuickTest()}
            className="btn-ghost px-3.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1 border border-sky-400/30 text-sky-300"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{testBusy ? '...' : isFa ? 'تست سریع عملکرد' : 'Quick Backtest'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void activateMyAi()}
            className={`px-4 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5 ${
              isActive ? 'btn-emerald' : 'btn-lime'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {isActive
                ? isFa ? 'فعال و در حال ترید ✅' : 'Active & Live ✅'
                : isFa ? 'فعال‌سازی و شروع خودکار' : 'Activate & Start'}
            </span>
          </button>
        </div>
      </div>

      {/* 4 One-Tap Quick Prompts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {quickPrompts.map((qp) => (
          <button
            key={qp.label}
            type="button"
            disabled={busy}
            onClick={() => void sendMessage(qp.prompt)}
            className="panel-soft rounded-xl px-3 py-2.5 text-right hover:border-violet-400/50 transition text-[11px] font-black text-main flex items-center justify-between gap-1.5"
          >
            <span className="truncate">{qp.label}</span>
            <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
          </button>
        ))}
      </div>

      {/* Extracted Rules Summary Pills */}
      {rules && (
        <div className="panel-soft rounded-2xl p-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-dim font-bold">{isFa ? 'قوانین یادگرفته‌شده:' : 'Learned Rules:'}</span>
          <span className="px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-200 font-black">
            {rules.style} · {rules.timeframe}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-jade font-mono font-bold" dir="ltr">
            {rules.symbols.slice(0, 3).join(', ')}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 font-bold" dir="ltr">
            {rules.indicators.slice(0, 3).join(' + ') || 'EMA + RSI'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-goldsoft font-mono font-bold" dir="ltr">
            SL {rules.stopLossPct}% / TP {rules.takeProfitPct}% · {rules.maxLeverage}x
          </span>
        </div>
      )}

      {/* Compact Inline Chat Box + Chart Screenshot Input */}
      <div className="panel-soft rounded-2xl p-3 space-y-2.5">
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
          {messages.length === 0 ? (
            <p className="text-xs text-dim text-center py-4">
              {isFa
                ? 'سلام! روی یکی از ۴ دکمه بالا بزن یا استراتژی دلخواهت را اینجا بنویس (حتی عکس چارت هم می‌توانی بفرستی).'
                : 'Tap a quick preset above or describe your strategy below — you can attach a chart screenshot too.'}
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-emerald-500/15 border border-emerald-500/25 text-main mr-auto max-w-[88%]'
                    : 'bg-[var(--soft)] border hairline text-dim ml-auto max-w-[92%]'
                }`}
              >
                {m.content}
              </div>
            ))
          )}
        </div>

        {chartImg && (
          <div className="flex items-center gap-2 bg-[var(--soft)] border hairline px-2.5 py-1.5 rounded-xl w-fit">
            <img src={chartImg} alt="Chart" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-[11px] text-jade font-bold">{isFa ? 'چارت ضمیمه شد' : 'Chart attached'}</span>
            <button type="button" onClick={() => setChartImg(null)} className="text-loss p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void compressChartImageFile(file).then(setChartImg).catch(() => {});
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            className="btn-ghost p-2.5 rounded-xl shrink-0"
            title={isFa ? 'آپلود عکس چارت' : 'Attach Chart Image'}
          >
            <ImagePlus className="w-4 h-4 text-sky-300" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={isFa ? 'استراتژی‌ات را به فارسی بنویس (مثلاً: با شکست EMA20 روی ۱۵ دقیقه بخر)...' : 'Describe your rules to train My AI...'}
            className="field text-xs flex-1"
          />
          <button
            type="button"
            disabled={busy || (!input.trim() && !chartImg)}
            onClick={() => void sendMessage()}
            className="btn-emerald px-3.5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{busy ? '...' : isFa ? 'آموزش' : 'Train'}</span>
          </button>
        </div>
      </div>

      {/* Inline Backtest Feedback */}
      {testResult?.backtest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="panel-soft rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-dim">{isFa ? 'بازده تست' : 'Net Return'}</p>
            <p className={`font-mono font-black ${testResult.backtest.metrics.netReturnPct >= 0 ? 'text-jade' : 'text-loss'}`} dir="ltr">
              {testResult.backtest.metrics.netReturnPct >= 0 ? '+' : ''}{testResult.backtest.metrics.netReturnPct}%
            </p>
          </div>
          <div className="panel-soft rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-dim">{isFa ? 'نرخ برد' : 'Win Rate'}</p>
            <p className="font-mono font-black text-main" dir="ltr">{testResult.backtest.metrics.winRatePct}%</p>
          </div>
          <div className="panel-soft rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-dim">{isFa ? 'تعداد معامله' : 'Trades'}</p>
            <p className="font-mono font-black text-main">{testResult.backtest.metrics.totalTrades}</p>
          </div>
          <div className="panel-soft rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-dim">{isFa ? 'آخرین سیگنال' : 'Latest Signal'}</p>
            <p className="font-mono font-black text-goldsoft inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{testResult.latestSignal?.signal || 'WAIT'}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
