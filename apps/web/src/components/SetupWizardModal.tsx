import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  KeyRound,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function SetupWizardModal({
  lang,
  availableBalance = 10000,
  onClose,
  onCompleted,
}: {
  lang: Lang;
  availableBalance?: number;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [tab, setTab] = useState<'agent' | 'vault'>('agent');
  const [step, setStep] = useState(0);

  const safeAvail = Math.max(100, availableBalance);
  const [allocatedAmount, setAllocatedAmount] = useState<number>(Math.round(safeAvail * 0.5));
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [strategyType, setStrategyType] = useState<'dollarino_v01' | 'ai_autonomous_agent' | 'kbos_v11' | 'sp2l' | 'ema_trend_pullback' | 'signal_mixer' | 'high_20x'>('dollarino_v01');

  const [exProvider, setExProvider] = useState<'paper' | 'toobit' | 'kcex'>('toobit');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [kcexSession, setKcexSession] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const marginPct = Math.min(100, Math.max(5, Math.round((allocatedAmount / safeAvail) * 100)));

  const riskOptions = [
    {
      id: 'low' as const,
      title: lang === 'fa' ? 'محافظه‌کارانه (Conservative)' : 'Conservative',
      maxLev: 3,
      dailyLoss: 3.0,
      trailingPct: 1.5,
      detail: lang === 'fa' ? 'اهرم ۳x، تریلینگ استاپ ۱.۵٪، حد ضرر روزانه ۳٪' : 'Max 3x leverage · 1.5% Trailing SL · 3% daily cap',
      color: 'text-signal',
    },
    {
      id: 'medium' as const,
      title: lang === 'fa' ? 'متعادل (Balanced)' : 'Balanced',
      recommended: true,
      maxLev: 5,
      dailyLoss: 5.0,
      trailingPct: 2.0,
      detail: lang === 'fa' ? 'اهرم ۵x، تریلینگ ۲٪ + ریسک‌فری خودکار TP1' : 'Max 5x leverage · 2.0% Trailing SL + Auto Risk-Free',
      color: 'text-brand',
    },
    {
      id: 'high' as const,
      title: lang === 'fa' ? 'تهاجمی (Aggressive)' : 'Aggressive',
      maxLev: 10,
      dailyLoss: 8.0,
      trailingPct: 2.8,
      detail: lang === 'fa' ? 'اهرم ۱۰x، ریسک‌پذیری بالا برای نوسان‌گیری سریع' : 'Max 10x leverage · Higher ROI target',
      color: 'text-flame',
    },
  ];

  const strategyOptions = [
    {
      id: 'dollarino_v01' as const,
      title: lang === 'fa' ? 'استراتژی اختصاصی دلارینو V0.1' : 'Dollarino V0.1 Master Strategy',
      recommended: true,
      badge: 'V0.1',
      detail:
        lang === 'fa'
          ? 'بهترین ترکیب تمام استراتژی‌های دلارینو در یک موتور جامع و دقیق'
          : 'Unifies all Dollarino strategies into one non-repainting engine',
    },
    {
      id: 'ai_autonomous_agent' as const,
      title: lang === 'fa' ? 'هوش مصنوعی مرکزی دلارینو' : 'Dollarino Central AI',
      badge: '100% AI',
      detail:
        lang === 'fa'
          ? 'تحلیل توسط موتور هوش مصنوعی مرکزی (بدون نیاز به API شخصی)'
          : 'Powered by central multi-AI brain — zero API setup needed',
    },
    {
      id: 'kbos_v11' as const,
      title: 'KBOs Super v11',
      badge: 'ALMA + ATR',
      detail:
        lang === 'fa'
          ? 'استراتژی کوانت غیرریپینت با ۳ تارگت و تریلینگ استاپ هوشمند'
          : 'Non-repainting HTF ALMA crossover + DEMA ATR & 3-TP Trailing',
    },
    {
      id: 'sp2l' as const,
      title: lang === 'fa' ? 'شکار نقدینگی (SP2L)' : 'Steady Growth (SP2L)',
      badge: '3-TP',
      detail: lang === 'fa' ? 'شکار نقدینگی و شکست جعلی به همراه ریسک‌فری خودکار' : 'Liquidity sweep reversal with BE on TP1',
    },
    {
      id: 'ema_trend_pullback' as const,
      title: lang === 'fa' ? 'مومنتوم روند (Momentum EMA)' : 'Momentum (EMA 20/50)',
      badge: 'Trend',
      detail: lang === 'fa' ? 'ورود روی پولبک EMA در جهت روند تایم بالاتر' : 'HTF-aligned EMA pullback continuation',
    },
    {
      id: 'signal_mixer' as const,
      title: lang === 'fa' ? 'میکسر ۸ کاناله (Quant + AI)' : '8-Channel Mixer',
      badge: '8-Ch',
      detail: lang === 'fa' ? 'اجماع ۸ کانال تکنیکال + تایید AI' : '8-channel scoring + AI confirmation',
    },
    {
      id: 'high_20x' as const,
      title: lang === 'fa' ? 'اهرم بالا ۲۰x' : 'High ×20 Leverage',
      badge: '20x',
      detail: lang === 'fa' ? 'ترکیب KBOs v11 با اهرم تا ۲۰x' : 'KBOs v11 paired with 20x leverage',
    },
  ];

  const selectedRisk = riskOptions.find((r) => r.id === riskLevel) ?? riskOptions[1]!;
  const selectedStrat = strategyOptions.find((s) => s.id === strategyType) ?? strategyOptions[0]!;

  const startAiAgent = async () => {
    setSaving(true);
    setMsg('');
    try {
      const actualKey = strategyType === 'high_20x' ? 'kbos_v11' : strategyType;
      const effLev = strategyType === 'high_20x' ? 20 : selectedRisk.maxLev;

      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          strategy_key: actualKey,
          margin_pct: marginPct,
          max_leverage: effLev,
          daily_max_loss_pct: selectedRisk.dailyLoss,
          trailing_stop_enabled: 1,
          trailing_stop_pct: selectedRisk.trailingPct,
          tp1_close_pct: actualKey === 'kbos_v11' ? 30 : 50,
          tp2_close_pct: actualKey === 'kbos_v11' ? 30 : 25,
          tp3_close_pct: actualKey === 'kbos_v11' ? 40 : 25,
          risk_profile_json: {
            preset: riskLevel === 'low' ? 'conservative' : riskLevel === 'high' ? 'aggressive' : 'balanced',
            allocatedAmount,
            trailingStop: true,
            trailingDistance: selectedRisk.trailingPct,
          },
        }),
      });

      await apiFetch('/api/trading/bot/start', {
        method: 'POST',
        body: JSON.stringify({
          marginPct,
          strategyKey: actualKey,
          riskPreset: riskLevel,
          maxLeverage: effLev,
          trailingStopEnabled: true,
          trailingStopPct: selectedRisk.trailingPct,
          allocatedAmount,
        }),
      });

      onCompleted();
      onClose();
    } catch (e) {
      const errText = e instanceof Error ? e.message : 'Failed to start AI Agent';
      if (errText.includes('NO_ACTIVE_AI_KEY') || errText.includes('موتور هوش مصنوعی مرکزی')) {
        setMsg(
          lang === 'fa'
            ? 'موتور هوش مصنوعی مرکزی هنوز توسط مدیریت فعال نشده است؛ می‌توانید از استراتژی «دلارینو V0.1» استفاده کنید.'
            : 'Central AI is awaiting admin setup; try Dollarino V0.1 in the meantime.'
        );
      } else {
        setMsg(errText);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveExchange = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch<{ test: { message: string }; activated?: boolean; requiresSubscription?: boolean }>('/api/connections/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          provider: exProvider,
          apiKey: exProvider === 'toobit' ? apiKey : undefined,
          apiSecret: exProvider === 'toobit' ? apiSecret : undefined,
          proxyUrl: exProvider === 'toobit' && proxyUrl.trim() ? proxyUrl.trim() : undefined,
          webSessionToken: exProvider === 'kcex' ? kcexSession : undefined,
        }),
      });
      if (res.requiresSubscription && !res.activated) {
        setMsg(
          lang === 'fa'
            ? 'کلید ذخیره شد (Standby). برای فعال‌سازی معامله لایو روی Toobit / KCEX ابتدا اشتراک تهیه کنید.'
            : 'Saved in Standby. Upgrade to Pro/VIP to activate live Toobit or KCEX trading.'
        );
      } else {
        setMsg(res.test?.message || 'Exchange saved');
      }
      onCompleted();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    lang === 'fa' ? 'مبلغ سرمایه' : 'Amount',
    lang === 'fa' ? 'سطح ریسک' : 'Risk',
    lang === 'fa' ? 'استراتژی' : 'Strategy',
    lang === 'fa' ? 'شروع' : 'Review',
  ];

  return (
    <div dir={lang === 'fa' ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="surface-card w-full max-w-xl p-6 space-y-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl banner-cobalt-soft flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="font-black text-main text-base">
                {lang === 'fa' ? 'راه‌اندازی ربات تریدر دلارینو' : 'Dollarino Bot Setup Wizard'}
              </h3>
              <p className="text-[11px] text-sub">
                {lang === 'fa' ? 'پیکربندی سریع سرمایه، ریسک و استراتژی' : '4-step allocation, risk & strategy deployment'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl surface-soft text-sub hover:text-main">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl surface-soft text-xs">
          <button
            onClick={() => setTab('agent')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              tab === 'agent' ? 'btn-cobalt' : 'text-sub hover:text-main'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'تنظیم ربات (۴ مرحله)' : 'Setup Wizard'}</span>
          </button>
          <button
            onClick={() => setTab('vault')}
            className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
              tab === 'vault' ? 'btn-cobalt' : 'text-sub hover:text-main'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'اتصال صرافی و AI' : 'Exchange & AI Keys'}</span>
          </button>
        </div>

        {msg && <div className="text-xs px-3.5 py-2.5 rounded-xl banner-cobalt-soft text-brand font-bold">{msg}</div>}

        {tab === 'agent' ? (
          <>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              {stepLabels.map((lbl, idx) => (
                <button
                  key={lbl}
                  onClick={() => setStep(idx)}
                  className={`py-2 px-1.5 rounded-xl border font-bold text-center transition ${
                    step === idx
                      ? 'btn-cobalt'
                      : idx < step
                        ? 'bg-[#10D856]/15 border-[#10D856]/40 text-signal'
                        : 'surface-soft text-dim'
                  }`}
                >
                  {idx + 1}. {lbl}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-sub flex items-center gap-1.5 font-semibold">
                    <Wallet className="w-3.5 h-3.5 text-brand" />
                    <span>{lang === 'fa' ? 'موجودی قابل تخصیص:' : 'Available Balance:'}</span>
                  </span>
                  <span className="font-mono-num font-black text-signal">${safeAvail.toLocaleString()}</span>
                </div>

                <div>
                  <label className="text-xs text-sub font-semibold block mb-1.5">
                    {lang === 'fa' ? 'مبلغ سرمایه تخصیصی (USDT)' : 'Allocated Capital (USDT)'}
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={safeAvail}
                    value={allocatedAmount}
                    onChange={(e) => setAllocatedAmount(Math.max(10, Math.min(safeAvail, Number(e.target.value) || 0)))}
                    className="w-full surface-input rounded-2xl px-4 py-3 text-lg font-mono-num font-black outline-none focus:border-brand"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[0.25, 0.5, 0.75, 1.0].map((pct) => {
                    const val = Math.round(safeAvail * pct);
                    const active = Math.abs(allocatedAmount - val) < 5;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setAllocatedAmount(val)}
                        className={`py-2.5 rounded-xl border font-mono-num font-bold transition ${
                          active ? 'btn-cobalt' : 'surface-soft text-sub'
                        }`}
                      >
                        {Math.round(pct * 100)}%
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2.5">
                {riskOptions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRiskLevel(r.id)}
                    className={`w-full p-4 rounded-2xl border text-start transition ${
                      riskLevel === r.id ? 'surface-card ring-2 ring-[#1464F6]' : 'surface-soft'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-black text-xs sm:text-sm flex items-center gap-1.5 ${r.color}`}>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{r.title}</span>
                      </span>
                      {r.recommended && (
                        <span className="rounded-full banner-cobalt-soft px-2.5 py-0.5 text-[10px] font-bold text-brand">★ Recommended</span>
                      )}
                    </div>
                    <p className="text-xs text-sub mt-1">{r.detail}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pe-1">
                {strategyOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStrategyType(s.id)}
                    className={`w-full p-3.5 rounded-2xl border text-start transition ${
                      strategyType === s.id ? 'surface-card ring-2 ring-[#1464F6]' : 'surface-soft'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-xs text-main flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-signal" />
                        <span>{s.title}</span>
                      </span>
                      <span className="rounded-lg banner-cobalt-soft px-2 py-0.5 text-[10px] text-brand font-mono-num font-bold">
                        {s.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-sub mt-1">{s.detail}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="surface-soft rounded-2xl border divide-y text-xs">
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-sub">{lang === 'fa' ? 'سرمایه تخصیصی' : 'Allocated Capital'}</span>
                  <span className="font-mono-num font-black text-main">${allocatedAmount.toLocaleString()} ({marginPct}%)</span>
                </div>
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-sub">{lang === 'fa' ? 'پروفایل ریسک' : 'Risk Level'}</span>
                  <span className={`font-extrabold ${selectedRisk.color}`}>{selectedRisk.title}</span>
                </div>
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-sub">{lang === 'fa' ? 'استراتژی' : 'Strategy'}</span>
                  <span className="font-bold text-main">{selectedStrat.title}</span>
                </div>
                <div className="flex items-center justify-between p-3.5">
                  <span className="text-sub">{lang === 'fa' ? 'حفاظت خروج' : 'Exit Protection'}</span>
                  <span className="font-mono-num font-bold text-signal">3-TP + {selectedRisk.trailingPct}% Trailing SL</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="px-4 py-2.5 rounded-xl surface-soft border text-main text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{lang === 'fa' ? 'قبلی' : 'Back'}</span>
                </button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                  className="px-5 py-2.5 rounded-xl btn-cobalt text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <span>{lang === 'fa' ? 'مرحله بعد' : 'Continue'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={startAiAgent}
                  className="px-5 py-2.5 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{saving ? '...' : lang === 'fa' ? 'شروع معامله هوشمند' : 'Start Trading'}</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'toobit', name: 'Toobit Live' },
                { id: 'kcex', name: 'KCEX 0% Fee' },
                { id: 'paper', name: 'Paper Demo' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setExProvider(p.id as typeof exProvider)}
                  className={`p-2.5 rounded-xl border font-bold ${
                    exProvider === p.id ? 'btn-cobalt' : 'surface-soft text-sub'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {exProvider === 'toobit' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                  <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API Secret" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                </div>
                <input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="Optional Relay URL" className="w-full surface-input rounded-xl px-3 py-2 font-mono-num" />
              </div>
            )}

            {exProvider === 'kcex' && (
              <input type="password" value={kcexSession} onChange={(e) => setKcexSession(e.target.value)} placeholder="Optional KCEX Token" className="w-full surface-input rounded-xl px-3 py-2 font-mono-num" />
            )}

            <button disabled={saving} onClick={saveExchange} className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold inline-flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? '...' : lang === 'fa' ? 'ذخیره و تست اتصال صرافی' : 'Save & Activate Exchange'}</span>
            </button>

            <div className="pt-3 border-t text-xs text-sub flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand shrink-0" />
              <span>
                {lang === 'fa'
                  ? 'هوش مصنوعی مرکزی دلارینو روی سرور متصل است و نیازی به وارد کردن کلید API توسط شما ندارد.'
                  : 'Dollarino Central AI is managed on the platform — no personal AI key required.'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
