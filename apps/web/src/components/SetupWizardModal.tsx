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
  const [step, setStep] = useState(0); // 0: Amount, 1: Risk, 2: Strategy, 3: Review

  // Agent Wizard state (exact timetrade.live 4-step flow)
  const safeAvail = Math.max(100, availableBalance);
  const [allocatedAmount, setAllocatedAmount] = useState<number>(Math.round(safeAvail * 0.5));
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [strategyType, setStrategyType] = useState<'ai_autonomous_agent' | 'kbos_v11' | 'sp2l' | 'ema_trend_pullback' | 'signal_mixer' | 'high_20x'>('ai_autonomous_agent');

  // Vault connection state
  const [exProvider, setExProvider] = useState<'paper' | 'toobit' | 'kcex'>('toobit');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [kcexSession, setKcexSession] = useState('');
  const [aiProvider, setAiProvider] = useState<'deepseek' | 'openai' | 'anthropic' | 'gemini'>('deepseek');
  const [aiKey, setAiKey] = useState('');

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
      color: 'text-[#27cd86]',
    },
    {
      id: 'medium' as const,
      title: lang === 'fa' ? 'متعادل (Balanced)' : 'Balanced',
      recommended: true,
      maxLev: 5,
      dailyLoss: 5.0,
      trailingPct: 2.0,
      detail: lang === 'fa' ? 'اهرم ۵x، تریلینگ ۲٪ + ریسک‌فری خودکار TP1' : 'Max 5x leverage · 2.0% Trailing SL + Auto Risk-Free',
      color: 'text-[#4b73f5]',
    },
    {
      id: 'high' as const,
      title: lang === 'fa' ? 'تهاجمی (Aggressive)' : 'Aggressive',
      maxLev: 10,
      dailyLoss: 8.0,
      trailingPct: 2.8,
      detail: lang === 'fa' ? 'اهرم ۱۰x، ریسک‌پذیری بالا برای نوسان‌گیری سریع' : 'Max 10x leverage · Wider trailing SL · Higher ROI target',
      color: 'text-[#f59f14]',
    },
  ];

  const strategyOptions = [
    {
      id: 'ai_autonomous_agent' as const,
      title: lang === 'fa' ? 'عامل هوشمند مستقل (DeepSeek / Claude / GPT)' : 'Autonomous AI Agent (DeepSeek / Claude / GPT)',
      recommended: true,
      badge: '100% AI-Driven',
      detail:
        lang === 'fa'
          ? 'هوش مصنوعی (دیپ‌سیک / کلود) شخصاً کندل‌ها، تایم‌فریم‌ها و اردربوک را تحلیل کرده و معاملات را باز و مدیریت می‌کند'
          : 'Real LLM reasoning directly analyzes live candles, HTF structure & orderbook to decide LONG / SHORT / HOLD / CLOSE',
    },
    {
      id: 'kbos_v11' as const,
      title: 'CodexBot Super v11 (Quant Hybrid)',
      badge: 'ALMA + DEMA ATR',
      detail:
        lang === 'fa'
          ? 'استراتژی کوانت غیرریپینت تایم‌فریم بالا با ۳ تارگت (۱.۵/۳/۴.۵٪) و تریلینگ ۲٪'
          : 'Non-repainting HTF ALMA crossover + DEMA ATR + 8-band Golden ALMA ribbon & 3-TP Trailing',
    },
    {
      id: 'sp2l' as const,
      title: lang === 'fa' ? 'رشد پایدار (Steady Growth · SP2L)' : 'Steady Growth (SP2L Liquidity)',
      badge: '3-TP Risk-Free',
      detail: lang === 'fa' ? 'شکار نقدینگی و شکست جعلی به همراه ریسک‌فری خودکار' : 'Liquidity sweep reversal with 50/25/25 TP split & BE on TP1',
    },
    {
      id: 'ema_trend_pullback' as const,
      title: lang === 'fa' ? 'مومنتوم روند (Momentum EMA)' : 'Momentum (EMA 20/50 Pullback)',
      badge: 'Trend Rider',
      detail: lang === 'fa' ? 'ورود روی پولبک EMA در جهت روند تایم بالاتر' : 'HTF-aligned EMA pullback continuation',
    },
    {
      id: 'signal_mixer' as const,
      title: lang === 'fa' ? 'میکسر ۸ کاناله (Quant + AI Gate)' : '8-Channel Mixer + AI Gate',
      badge: '8-Channel Quant',
      detail: lang === 'fa' ? 'اجماع ۸ کانال تکنیکال + دروازه تایید BYO AI' : '8-channel composite scoring + BYO AI confirmation gate',
    },
    {
      id: 'high_20x' as const,
      title: lang === 'fa' ? 'اهرم بالا ۲۰x (VIP Momentum)' : 'High ×20 Leverage',
      badge: '20x Turbo',
      detail: lang === 'fa' ? 'ترکیب KBOs v11 با اهرم تا ۲۰x برای تریدرهای حرفه‌ای' : 'KBOs v11 paired with 20x leverage & tight trailing stops',
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
      if (errText.includes('AI API key') || errText.includes('NO_ACTIVE_AI_KEY')) {
        setTab('vault');
        setMsg(
          lang === 'fa'
            ? 'ابتدا کلید DeepSeek (یا Claude/GPT/Gemini) خود را در بخش پایین وارد و ذخیره کنید، سپس ربات را استارت بزنید.'
            : 'Paste & save your DeepSeek (or Claude/GPT/Gemini) API key below first, then launch the AI Agent.'
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
      const res = await apiFetch<{
        test: { ok: boolean; message: string };
        activated?: boolean;
        requiresSubscription?: boolean;
      }>('/api/connections/exchanges', {
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
            ? 'کلید ذخیره شد (حالت Standby). برای فعال‌سازی معامله واقعی روی Toobit / KCEX ابتدا اشتراک تهیه کنید.'
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

  const saveAi = async () => {
    if (!aiKey.trim()) return;
    setSaving(true);
    try {
      const modelMap = {
        deepseek: 'deepseek-flash',
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-5-sonnet-latest',
        gemini: 'gemini-2.0-flash',
      };
      await apiFetch('/api/connections/ai', {
        method: 'POST',
        body: JSON.stringify({ provider: aiProvider, model: modelMap[aiProvider], apiKey: aiKey.trim() }),
      });
      setMsg(`Saved ${aiProvider.toUpperCase()} AI key!`);
      onCompleted();
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = [
    lang === 'fa' ? 'مبلغ سرمایه' : 'Amount',
    lang === 'fa' ? 'سطح ریسک' : 'Risk',
    lang === 'fa' ? 'استراتژی' : 'Strategy',
    lang === 'fa' ? 'بررسی و شروع' : 'Review',
  ];

  return (
    <div dir={lang === 'fa' ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-[#0f1218] border border-[#1c2028] rounded-2xl w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.75)] my-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#4b73f5]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">
                {lang === 'fa' ? 'راه‌اندازی ربات تریدر هوش مصنوعی' : 'AI Agent Trading Setup'}
              </h3>
              <p className="text-[11px] text-[#6c7689]">
                {lang === 'fa' ? 'پیکربندی دقیق در ۴ مرحله + اتصال صرافی و AI' : '4-step allocation, risk & KBOs v11 strategy deployment'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-[#1a1e26] text-[#9aa5b5] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#080a0e] border border-[#1c2028] text-xs">
          <button
            onClick={() => setTab('agent')}
            className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'agent' ? 'bg-[#4b73f5] text-white' : 'text-[#6c7689] hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'تنظیم ربات (۴ مرحله)' : 'AI Agent Wizard (4 Steps)'}</span>
          </button>
          <button
            onClick={() => setTab('vault')}
            className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'vault' ? 'bg-[#4b73f5] text-white' : 'text-[#6c7689] hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'اتصال صرافی و هوش مصنوعی' : 'Exchange & AI Keys'}</span>
          </button>
        </div>

        {msg && (
          <div className="text-xs px-3 py-2 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 text-[#9eb7ff]">
            {msg}
          </div>
        )}

        {tab === 'agent' ? (
          <>
            {/* 4-Step Progress Bar */}
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              {stepLabels.map((lbl, idx) => (
                <button
                  key={lbl}
                  onClick={() => setStep(idx)}
                  className={`py-2 px-1.5 rounded-lg border font-medium text-center transition ${
                    step === idx
                      ? 'border-[#4b73f5] bg-[#4b73f5]/15 text-white'
                      : idx < step
                        ? 'border-[#27cd86]/40 bg-[#27cd86]/10 text-[#27cd86]'
                        : 'border-[#1c2028] bg-[#11151c] text-[#6c7689]'
                  }`}
                >
                  {idx + 1}. {lbl}
                </button>
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9aa5b5] flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-[#4b73f5]" />
                    <span>{lang === 'fa' ? 'موجودی قابل تخصیص:' : 'Available Balance:'}</span>
                  </span>
                  <span className="font-mono-num font-bold text-[#27cd86]">${safeAvail.toLocaleString()}</span>
                </div>

                <div>
                  <label className="text-[11px] text-[#6c7689] block mb-1.5">
                    {lang === 'fa' ? 'مبلغ سرمایه تخصیصی (USDT)' : 'Allocated Capital (USDT)'}
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={safeAvail}
                    value={allocatedAmount}
                    onChange={(e) => setAllocatedAmount(Math.max(10, Math.min(safeAvail, Number(e.target.value) || 0)))}
                    className="w-full bg-[#080a0e] border border-[#262b36] focus:border-[#4b73f5] rounded-xl px-4 py-3 text-lg font-mono-num font-bold text-white outline-none"
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
                        className={`py-2.5 rounded-xl border font-mono-num font-semibold transition ${
                          active
                            ? 'border-[#4b73f5] bg-[#4b73f5]/15 text-white'
                            : 'border-[#1c2028] bg-[#11151c] text-[#9aa5b5] hover:border-[#262b36]'
                        }`}
                      >
                        {Math.round(pct * 100)}%
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#6c7689]">
                  {lang === 'fa'
                    ? `سهم مارجین هر پوزیشن معادل ${marginPct}% از کل موجودی آزاد محاسبه می‌شود.`
                    : `Position sizing allocates ${marginPct}% of available margin ($${allocatedAmount.toLocaleString()}) with automatic Risk-Free protection.`}
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2.5">
                {riskOptions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRiskLevel(r.id)}
                    className={`w-full p-3.5 rounded-xl border text-start transition ${
                      riskLevel === r.id
                        ? 'border-[#4b73f5] bg-[#4b73f5]/10'
                        : 'border-[#1c2028] bg-[#11151c] hover:border-[#262b36]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold text-xs sm:text-sm flex items-center gap-1.5 ${r.color}`}>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{r.title}</span>
                      </span>
                      {r.recommended && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#4b73f5]/15 border border-[#4b73f5]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4b73f5]">
                          ★ Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9aa5b5] mt-1">{r.detail}</p>
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
                    className={`w-full p-3 rounded-xl border text-start transition ${
                      strategyType === s.id
                        ? 'border-[#4b73f5] bg-[#4b73f5]/10'
                        : 'border-[#1c2028] bg-[#11151c] hover:border-[#262b36]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[#27cd86]" />
                        <span>{s.title}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {s.recommended && (
                          <span className="rounded-full bg-[#4b73f5]/15 border border-[#4b73f5]/30 px-2 py-0.5 text-[9px] font-semibold text-[#4b73f5]">
                            ★ Recommended
                          </span>
                        )}
                        <span className="rounded bg-[#1a1e26] px-1.5 py-0.5 text-[9px] text-[#9aa5b5] font-mono-num">
                          {s.badge}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#6c7689] mt-1">{s.detail}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#1c2028] bg-[#080a0e] divide-y divide-[#1c2028] text-xs">
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[#6c7689]">{lang === 'fa' ? 'سرمایه تخصیصی' : 'Allocated Capital'}</span>
                    <span className="font-mono-num font-bold text-white">${allocatedAmount.toLocaleString()} ({marginPct}%)</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[#6c7689]">{lang === 'fa' ? 'پروفایل ریسک' : 'Risk Level'}</span>
                    <span className={`font-bold ${selectedRisk.color}`}>{selectedRisk.title}</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[#6c7689]">{lang === 'fa' ? 'سبک معاملاتی' : 'Trading Strategy'}</span>
                    <span className="font-semibold text-white">{selectedStrat.title}</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[#6c7689]">{lang === 'fa' ? 'حفاظت خروج' : 'Exit Protection'}</span>
                    <span className="font-mono-num text-[#27cd86]">3-TP + {selectedRisk.trailingPct}% Trailing SL</span>
                  </div>
                </div>
                <p className="text-[10px] text-[#6c7689] text-center leading-relaxed">
                  {lang === 'fa'
                    ? 'ربات با تایید کندل بسته بدون ریپینت و مدیریت ریسک روزانه اجرا خواهد شد.'
                    : 'Non-repainting closed-candle execution with UTC daily loss protection and automatic Risk-Free BE on TP1.'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1c2028]">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="px-4 py-2.5 rounded-xl bg-[#1a1e26] text-[#d5dce6] text-xs font-semibold inline-flex items-center gap-1.5"
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
                  className="px-5 py-2.5 rounded-xl bg-[#4b73f5] hover:bg-[#3d63e0] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <span>{lang === 'fa' ? 'مرحله بعد' : 'Continue'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={startAiAgent}
                  className="px-5 py-2.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] text-xs font-bold inline-flex items-center gap-1.5 glow-success"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{saving ? '...' : lang === 'fa' ? 'شروع معامله هوشمند' : 'Start AI Trading'}</span>
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
                  className={`p-2.5 rounded-xl border font-semibold ${
                    exProvider === p.id ? 'border-[#4b73f5] bg-[#4b73f5]/15 text-white' : 'border-[#1c2028] bg-[#11151c] text-[#9aa5b5]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {exProvider === 'toobit' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API Key"
                    className="bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="API Secret"
                    className="bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>
                <input
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="Optional Relay Proxy URL (e.g. https://relay.vercel.app for CF geo-bypass)"
                  className="w-full bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2 font-mono-num"
                />
              </div>
            )}

            {exProvider === 'kcex' && (
              <input
                type="password"
                value={kcexSession}
                onChange={(e) => setKcexSession(e.target.value)}
                placeholder="Optional KCEX Cookie/Auth Token"
                className="w-full bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2 font-mono-num"
              />
            )}

            <button
              disabled={saving}
              onClick={saveExchange}
              className="w-full py-2.5 rounded-xl bg-[#4b73f5] hover:bg-[#3d63e0] text-white font-bold inline-flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? '...' : lang === 'fa' ? 'ذخیره و تست اتصال صرافی' : 'Save & Activate Exchange'}</span>
            </button>

            <div className="pt-3 border-t border-[#1c2028] space-y-2">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#8e4cf0]" />
                <span>{lang === 'fa' ? 'اتصال کلید هوش مصنوعی شخصی (BYO AI)' : 'Connect Personal AI Key (Optional)'}</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as typeof aiProvider)}
                  className="bg-[#080a0e] border border-[#262b36] rounded-xl px-2.5 py-2"
                >
                  <option value="deepseek">DeepSeek (Flash / V4-Pro)</option>
                  <option value="anthropic">Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                </select>
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 bg-[#080a0e] border border-[#262b36] rounded-xl px-3 py-2 font-mono-num"
                />
                <button
                  disabled={saving || !aiKey.trim()}
                  onClick={saveAi}
                  className="px-4 py-2 rounded-xl bg-[#8e4cf0] hover:bg-[#7d3ce0] text-white font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
