import { useState } from 'react';
import { Check, Copy, Play, Radio } from 'lucide-react';
import { formatDollarinoSignal } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function SignalsPage({
  lang,
  webhookSecret,
  recentSignals,
  onExecuted,
}: {
  lang: Lang;
  webhookSecret: string;
  recentSignals: Array<{ id: string; source: string; symbol: string; direction: string; price: string; status: string; raw_text: string; created_at: string }>;
  onExecuted: () => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const webhookUrl = `${window.location.origin}/api/webhook/tv/${webhookSecret}`;

  const [rawSignal, setRawSignal] = useState(
    formatDollarinoSignal({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      timeframe: '15m',
      price: '63000',
      stopLoss: '62300',
      leverage: 10,
      tp1: '63700',
      tp2: '64500',
      tp3: '65800',
      channelHandle: '@Dollarinoofficial',
    })
  );
  const [execResult, setExecResult] = useState('');

  const tvTemplate = formatDollarinoSignal({
    symbol: '{{ticker}}',
    direction: 'LONG',
    timeframe: '{{interval}}',
    price: '{{close}}',
    stopLoss: '{{plot("StopLoss")}}',
    leverage: 10,
    tp1: '{{plot("TP1")}}',
    tp2: '{{plot("TP2")}}',
    tp3: '{{plot("TP3")}}',
    channelHandle: '@Dollarinoofficial',
  });

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const testParseAndRun = async (executeNow: boolean) => {
    setExecResult('');
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
        method: 'POST',
        body: JSON.stringify({ rawText: rawSignal, executeNow }),
      });
      setExecResult(
        executeNow
          ? res.ok
            ? `Executed Trade ${res.tradeId}`
            : res.error || 'Rejected'
          : 'Parsed & logged signal card cleanly!'
      );
      await onExecuted();
    } catch (e) {
      setExecResult(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold">
              {lang === 'fa' ? 'آدرس وب‌هوک اختصاصی TradingView شما' : 'Personal TradingView Webhook URL'}
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            {lang === 'fa'
              ? 'این لینک را در آلرت TradingView قرار دهید. سیگنال‌ها مستقیم وارد موتور ۳ تارگت یا تایید تلگرام می‌شوند.'
              : 'Paste into TradingView Alert Webhook URL. Incoming signals flow straight into 3-TP execution or Telegram confirmation.'}
          </p>
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <code dir="ltr" className="text-xs font-mono-num text-blue-300 flex-1 truncate">{webhookUrl}</code>
            <button onClick={() => copyText('url', webhookUrl)} className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs">
              {copied === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-slate-300">Alert Payload Template</span>
            <button onClick={() => copyText('tpl', tvTemplate)} className="text-xs text-blue-300 flex items-center gap-1">
              {copied === 'tpl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Copy
            </button>
          </div>
          <pre dir="ltr" className="text-[11px] font-mono-num bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-x-auto text-slate-300">
            {tvTemplate}
          </pre>
        </div>

        {/* Interactive Persian/English Dollarino Signal Parser & Simulator */}
        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-white">
            {lang === 'fa' ? 'تست و اجرای مستقیم کارت سیگنال دلارینو (فارسی/انگلیسی)' : 'Dollarino Signal Parser & Instant Executor'}
          </h3>
          <textarea
            dir="ltr"
            rows={8}
            value={rawSignal}
            onChange={(e) => setRawSignal(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono-num text-[11px] text-slate-200"
          />
          {execResult && <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">{execResult}</div>}
          <div className="flex gap-2">
            <button onClick={() => testParseAndRun(false)} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold">
              Parse & Log Only
            </button>
            <button onClick={() => testParseAndRun(true)} className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center justify-center gap-1.5">
              <Play className="w-3.5 h-3.5" /> Parse & Execute 3-TP Trade
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-3">{lang === 'fa' ? 'تاریخچه سیگنال‌های دریافتی' : 'Recent Signals Feed'}</h3>
        {recentSignals.length === 0 ? (
          <div className="text-xs text-slate-500 py-8 text-center">No signals received yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentSignals.map((s) => (
              <div key={s.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{s.symbol} · {s.direction}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 text-[10px]">{s.source} · {s.status}</span>
                </div>
                <pre dir="ltr" className="text-[11px] font-mono-num text-slate-400 whitespace-pre-wrap">{s.raw_text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
