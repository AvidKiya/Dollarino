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
      price: '62000',
      stopLoss: '60500',
      leverage: 10,
      tp1: '63500',
      tp2: '65000',
      tp3: '66500',
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
    void navigator.clipboard.writeText(text);
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
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-signal" />
            <h3 className="text-sm font-black text-main">
              {lang === 'fa' ? 'آدرس وب‌هوک اختصاصی TradingView' : 'Personal TradingView Webhook URL'}
            </h3>
          </div>
          <p className="text-xs text-sub">
            {lang === 'fa'
              ? 'این لینک را در آلرت TradingView قرار دهید. سیگنال‌ها مستقیم وارد موتور ۳ تارگت می‌شوند.'
              : 'Paste into TradingView Alert Webhook URL. Incoming signals flow straight into 3-TP execution.'}
          </p>
          <div className="flex items-center gap-2 surface-soft border rounded-xl p-2.5">
            <code dir="ltr" className="text-xs font-mono-num text-brand flex-1 truncate">{webhookUrl}</code>
            <button onClick={() => copyText('url', webhookUrl)} className="px-2.5 py-1.5 rounded-lg surface-card text-xs">
              {copied === 'url' ? <Check className="w-3.5 h-3.5 text-signal" /> : <Copy className="w-3.5 h-3.5 text-sub" />}
            </button>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-main">Alert Payload Template</span>
            <button onClick={() => copyText('tpl', tvTemplate)} className="text-xs text-brand font-bold flex items-center gap-1">
              {copied === 'tpl' ? <Check className="w-3 h-3 text-signal" /> : <Copy className="w-3 h-3" />} Copy
            </button>
          </div>
          <pre dir="ltr" className="text-[11px] font-mono-num surface-soft border rounded-xl p-3 overflow-x-auto text-sub">
            {tvTemplate}
          </pre>
        </div>

        <div className="surface-card p-5 space-y-3 text-xs">
          <h3 className="text-sm font-black text-main">
            {lang === 'fa' ? 'تست و اجرای مستقیم کارت سیگنال دلارینو' : 'Dollarino Signal Parser & Executor'}
          </h3>
          <textarea dir="ltr" rows={8} value={rawSignal} onChange={(e) => setRawSignal(e.target.value)} className="w-full surface-input rounded-2xl p-3 font-mono-num text-[11px]" />
          {execResult && <div className="p-3 rounded-xl bg-[#10D856]/15 text-signal font-bold">{execResult}</div>}
          <div className="flex gap-2">
            <button onClick={() => testParseAndRun(false)} className="px-3.5 py-2 rounded-xl surface-soft border text-main font-bold">
              Parse & Log Only
            </button>
            <button onClick={() => testParseAndRun(true)} className="flex-1 py-2 rounded-xl btn-emerald font-extrabold inline-flex items-center justify-center gap-1.5">
              <Play className="w-3.5 h-3.5" /> Parse & Execute 3-TP
            </button>
          </div>
        </div>
      </div>

      <div className="surface-card p-5">
        <h3 className="text-sm font-black text-main mb-3">{lang === 'fa' ? 'تاریخچه سیگنال‌های دریافتی' : 'Recent Signals Feed'}</h3>
        {recentSignals.length === 0 ? (
          <div className="text-xs text-dim py-8 text-center">No signals received yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentSignals.map((s) => (
              <div key={s.id} className="surface-soft border rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-main">{s.symbol} · {s.direction}</span>
                  <span className="px-2.5 py-0.5 rounded-full banner-cobalt-soft text-brand text-[10px] font-bold">{s.source} · {s.status}</span>
                </div>
                <pre dir="ltr" className="text-[11px] font-mono-num text-sub whitespace-pre-wrap">{s.raw_text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
