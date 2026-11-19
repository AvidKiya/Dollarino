import { useState } from 'react';
import { CheckCircle2, KeyRound, Rocket, ShieldCheck, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function SetupWizardModal({
  lang,
  onClose,
  onCompleted,
}: {
  lang: Lang;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState(1);
  const [exProvider, setExProvider] = useState<'paper' | 'toobit' | 'kcex' | 'bitunix'>('toobit');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [kcexSession, setKcexSession] = useState('');
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic' | 'gemini'>('openai');
  const [aiKey, setAiKey] = useState('');
  const [preset, setPreset] = useState<'conservative' | 'balanced' | 'codex'>('balanced');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const saveExchange = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch<{ test: { ok: boolean; message: string } }>('/api/connections/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          provider: exProvider,
          apiKey: exProvider === 'toobit' || exProvider === 'bitunix' ? apiKey : undefined,
          apiSecret: exProvider === 'toobit' || exProvider === 'bitunix' ? apiSecret : undefined,
          webSessionToken: exProvider === 'kcex' ? kcexSession : undefined,
          activate: true,
        }),
      });
      setMsg(res.test?.message || 'Exchange saved');
      setStep(2);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async (skip = false) => {
    if (skip || !aiKey.trim()) {
      setStep(3);
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/connections/ai', {
        method: 'POST',
        body: JSON.stringify({
          provider: aiProvider,
          model: aiProvider === 'openai' ? 'gpt-4o-mini' : aiProvider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gemini-2.0-flash',
          apiKey: aiKey,
        }),
      });
      setStep(3);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const finishWizard = async () => {
    setSaving(true);
    try {
      const presets = {
        conservative: { margin_pct: 5, max_leverage: 5, daily_max_loss_pct: 2, max_open_positions: 2 },
        balanced: { margin_pct: 10, max_leverage: 10, daily_max_loss_pct: 4, max_open_positions: 3 },
        codex: { margin_pct: 15, max_leverage: 20, daily_max_loss_pct: 6, max_open_positions: 5 },
      }[preset];
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(presets),
      });
      onCompleted();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e131d] border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold">
              {lang === 'fa' ? 'راه‌اندازی سریع پلتفرم دلارینو' : 'Dollarino Quick Setup Wizard'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { n: 1, label: lang === 'fa' ? '۱. انتخاب صرافی' : '1. Exchange' },
            { n: 2, label: lang === 'fa' ? '۲. هوش مصنوعی (BYO AI)' : '2. BYO AI Key' },
            { n: 3, label: lang === 'fa' ? '۳. پروفایل ریسک ۳ تارگت' : '3. 3-TP Risk Profile' },
          ].map((s) => (
            <div
              key={s.n}
              className={`px-3 py-2 rounded-xl border text-center font-medium ${
                step === s.n
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : step > s.n
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {msg && <div className="text-xs px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200">{msg}</div>}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { id: 'toobit', name: 'Toobit Futures', desc: lang === 'fa' ? 'اتصال کامل API واقعی' : 'Full Live HMAC API' },
                { id: 'kcex', name: 'KCEX Futures', desc: lang === 'fa' ? 'کارمزد ۰٪ + میرور' : '0% Maker Mirror' },
                { id: 'bitunix', name: 'Bitunix', desc: lang === 'fa' ? 'سازگار با CodexBot' : 'CodexBot Live API' },
                { id: 'paper', name: 'Paper Sim', desc: lang === 'fa' ? '۱۰,۰۰۰$ مجازی زنده' : '$10k Live Sim' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setExProvider(item.id as typeof exProvider)}
                  className={`p-3 rounded-xl border text-start transition ${
                    exProvider === item.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold">{item.name}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{item.desc}</div>
                </button>
              ))}
            </div>

            {(exProvider === 'toobit' || exProvider === 'bitunix') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">API Key</label>
                  <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" placeholder="Paste API Key..." />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">API Secret</label>
                  <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" placeholder="Paste API Secret..." />
                </div>
              </div>
            )}

            {exProvider === 'kcex' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                <p className="text-amber-200 leading-relaxed">
                  {lang === 'fa'
                    ? 'صرافی KCEX هنوز API رسمی عمومی برای ترید خودکار منتشر نکرده است؛ اما با حالت KCEX Mirror می‌توانید با محاسبه دقیق کارمزد ۰٪ میکر / ۰.۰۱٪ تیکر، فرمت جفت‌ارز BTC_USDT و لینک مستقیم ترید یک‌کلیکی در KCEX کار کنید.'
                    : 'KCEX does not yet issue public API keys for external bots. KCEX Mirror activates KCEX contract formatting (BTC_USDT), exact 0%/0.01% fee modeling, 1-click KCEX terminal deep-links, and optional encrypted Web-Session token.'}
                </p>
                <input
                  value={kcexSession}
                  onChange={(e) => setKcexSession(e.target.value)}
                  placeholder={lang === 'fa' ? 'توکن وب سشن KCEX (اختیاری)' : 'Optional KCEX Web-Session Token'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="text-xs text-slate-400 hover:text-white">
                {lang === 'fa' ? 'رد کردن این مرحله' : 'Skip for now'}
              </button>
              <button
                disabled={saving}
                onClick={saveExchange}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{saving ? '...' : lang === 'fa' ? 'ذخیره و مرحله بعد' : 'Save & Continue'}</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              {lang === 'fa'
                ? 'کلید API هوش مصنوعی شخصی خود را متصل کنید (OpenAI، Claude یا Gemini) تا چارت AI و دروازه هوشمند تایید سیگنال فعال شود.'
                : 'Connect your own AI key (OpenAI, Anthropic, or Gemini) to power Chart AI Co-Pilot & the pre-trade AI gate.'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['openai', 'anthropic', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setAiProvider(p)}
                  className={`py-2 px-3 rounded-xl border font-semibold uppercase ${
                    aiProvider === p ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder="sk-... / AIza..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5"
            />
            <div className="flex justify-between pt-2">
              <button onClick={() => saveAi(true)} className="text-slate-400 hover:text-white">
                {lang === 'fa' ? 'بعداً متصل می‌کنم' : 'Skip AI'}
              </button>
              <button
                disabled={saving}
                onClick={() => saveAi(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              >
                {lang === 'fa' ? 'ذخیره AI و ادامه' : 'Save AI & Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'conservative', title: lang === 'fa' ? 'محافظه‌کار' : 'Conservative', detail: 'Margin 5% · Max 5x · Loss Cap 2%' },
                { id: 'balanced', title: lang === 'fa' ? 'متعادل (پیشنهادی)' : 'Balanced (Recommended)', detail: 'Margin 10% · Max 10x · Loss Cap 4%' },
                { id: 'codex', title: lang === 'fa' ? 'حرفه‌ای CodexBot' : 'Pro CodexBot', detail: 'Margin 15% · Max 20x · Loss Cap 6%' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreset(item.id as typeof preset)}
                  className={`p-3.5 rounded-xl border text-start ${
                    preset === item.id ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{item.title}</span>
                  </div>
                  <div className="text-slate-400 mt-1.5">{item.detail}</div>
                  <div className="text-[11px] text-emerald-400 mt-1">3-TP [50/25/25] + Auto Risk-Free</div>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                disabled={saving}
                onClick={finishWizard}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
              >
                <Rocket className="w-4 h-4" />
                <span>{lang === 'fa' ? 'تکمیل و ورود به کاپیتان ترید' : 'Complete Setup & Trade'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
