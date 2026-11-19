import { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Crown,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { EntitlementSummary } from '../components/Layout';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface ExchangeConn {
  id: string;
  provider: string;
  label: string;
  is_active: number;
  api_key_masked: string;
  proxy_url?: string;
  has_global_proxy?: boolean;
  last_test_status: string;
}

interface PlatformAISummary {
  configured: boolean;
  activeCount: number;
  consensusMode: string;
  effectiveModeLabelFa: string;
  effectiveModeLabelEn: string;
  engines: Array<{
    id: string;
    slot_order: number;
    provider: string;
    label: string;
    model: string;
    weight: number;
    is_active: number;
  }>;
}

interface TgBot {
  id: string;
  bot_username: string;
  bot_token_masked: string;
  signal_channel_id: string | null;
}

export function ConnectionsPage({
  lang,
  entitlement,
  onOpenSubscription,
  onRefreshDashboard,
}: {
  lang: Lang;
  entitlement?: EntitlementSummary | null;
  onOpenSubscription?: () => void;
  onRefreshDashboard: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [exchanges, setExchanges] = useState<ExchangeConn[]>([]);
  const [platformAI, setPlatformAI] = useState<PlatformAISummary | null>(null);
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [linkCode, setLinkCode] = useState<{ code: string; command: string } | null>(null);
  const [msg, setMsg] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [showProOptions, setShowProOptions] = useState(false);

  const [exForm, setExForm] = useState({
    provider: 'toobit' as 'toobit' | 'kcex',
    label: '',
    apiKey: '',
    apiSecret: '',
    webSessionToken: '',
    proxyUrl: '',
    proxySecret: '',
  });
  const [proxyEdits, setProxyEdits] = useState<Record<string, string>>({});
  const [tgToken, setTgToken] = useState('');
  const [tgChannel, setTgChannel] = useState('@Dollarinoofficial');

  const loadAll = async () => {
    const [ex, aiRes, tg] = await Promise.all([
      apiFetch<{ connections: ExchangeConn[] }>('/api/connections/exchanges'),
      apiFetch<{ platformAI: PlatformAISummary }>('/api/connections/platform-ai').catch(() => ({ platformAI: null })),
      apiFetch<{ bots: TgBot[] }>('/api/connections/telegram-bots'),
    ]);
    setExchanges(ex.connections.filter((c) => c.provider === 'toobit' || c.provider === 'kcex' || c.provider === 'paper'));
    setPlatformAI(aiRes.platformAI);
    setTgBots(tg.bots);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const addExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{
        test: { ok: boolean; message: string };
        activated?: boolean;
        requiresSubscription?: boolean;
      }>('/api/connections/exchanges', {
        method: 'POST',
        body: JSON.stringify(exForm),
      });
      if (res.requiresSubscription && !res.activated) {
        setMsg({
          type: 'info',
          text: isFa
            ? 'حساب صرافی با موفقیت ذخیره شد. برای فعال‌سازی معامله واقعی روی Toobit یا KCEX اشتراک Pro را فعال کنید.'
            : 'Exchange saved! Upgrade to Pro/VIP to activate live trading.',
        });
      } else {
        setMsg({ type: 'info', text: res.test?.message ?? (isFa ? 'صرافی با موفقیت متصل و فعال شد ✅' : 'Exchange connected!') });
      }
      setExForm({ ...exForm, apiKey: '', apiSecret: '', webSessionToken: '', proxySecret: '' });
      await loadAll();
      await onRefreshDashboard();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save exchange' });
    }
  };

  const updateExchangeProxy = async (id: string) => {
    setMsg(null);
    try {
      const proxyUrl = proxyEdits[id] ?? '';
      const res = await apiFetch<{ ok: boolean; test: { ok: boolean; message: string } }>(`/api/connections/exchanges/${id}/proxy`, {
        method: 'PATCH',
        body: JSON.stringify({ proxyUrl }),
      });
      setMsg({ type: 'info', text: res.test?.message ?? 'Relay updated' });
      await loadAll();
      await onRefreshDashboard();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Relay update failed' });
    }
  };

  const generateLinkCode = async () => {
    const res = await apiFetch<{ code: string; command: string }>('/api/auth/telegram-link-code', { method: 'POST' });
    setLinkCode(res);
  };

  const addTgBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{ username: string; webhookConfigured: boolean }>('/api/connections/telegram-bots', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
      });
      setTgToken('');
      setMsg({
        type: 'info',
        text: `Telegram bot @${res.username} connected.`,
      });
      await loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Telegram connect failed' });
    }
  };

  const isPaid = Boolean(entitlement?.hasPaidPlan);

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      {!isPaid && (
        <div className="hero-cobalt rounded-3xl p-5 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <Crown className="w-5 h-5 text-[#fde047] shrink-0" />
            <div>
              <div className="font-black text-sm">
                {isFa ? 'در حال حاضر روی حساب دمو رایگان هستید' : 'Currently on Free Paper Demo'}
              </div>
              <div className="text-white/80 mt-0.5">
                {isFa
                  ? 'همین الان بدون اتصال صرافی می‌توانید در دمو ترید کنید. برای اتصال پول واقعی، اشتراک Pro لازم است.'
                  : 'Trade risk-free in Demo anytime. Upgrade to Pro for Live Toobit & KCEX trading.'}
              </div>
            </div>
          </div>
          {onOpenSubscription && (
            <button onClick={onOpenSubscription} className="px-4 py-2 rounded-xl btn-emerald text-xs font-black shrink-0">
              {isFa ? 'مشاهده اشتراک‌ها' : 'View Plans'}
            </button>
          )}
        </div>
      )}

      {msg && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold ${
            msg.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
              : 'badge-signal'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Centralized AI Engine Status Card (NO User API Keys Needed!) */}
      <section className="surface-card rounded-3xl p-5 sm:p-6 space-y-3 border-[#1464F6]/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl banner-cobalt-soft flex items-center justify-center shrink-0">
              <BrainCircuit className="w-6 h-6 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-main">
                  {isFa ? 'هوش مصنوعی دلارینو (مرکزی)' : 'Dollarino AI Engine'}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1.5 ${
                  platformAI?.configured ? 'badge-signal' : 'bg-[#FF8A00]/15 text-flame'
                }`}>
                  {platformAI?.configured && <span className="w-2 h-2 dot-signal" />}
                  <span>
                    {platformAI?.configured
                      ? isFa ? `فعال (${platformAI.activeCount} مدل)` : `Active (${platformAI.activeCount} models)`
                      : isFa ? 'در انتظار اتصال توسط مدیر' : 'Pending Admin Setup'}
                  </span>
                </span>
              </div>
              <p className="text-xs text-sub mt-1 leading-relaxed">
                {isFa
                  ? 'هوش مصنوعی دلارینو به‌صورت متمرکز روی سرور ما راه‌اندازی شده است — شما نیازی به خرید اشتراک یا وارد کردن کلید API ندارید!'
                  : 'Managed centrally by Dollarino — you never need to buy or configure personal AI API keys.'}
              </p>
            </div>
          </div>
        </div>

        {platformAI && platformAI.engines.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            {platformAI.engines.filter((e) => e.is_active === 1).map((eng) => (
              <div key={eng.id} className="surface-soft rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-black text-main">{eng.label}</div>
                  <div className="text-[11px] text-dim font-mono-num">{eng.model}</div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-signal shrink-0" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main 2-Column Clean Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Exchange Connection */}
        <section className="lg:col-span-7 surface-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-brand" />
              <span>{isFa ? 'اتصال صرافی (دمو رایگان، Toobit یا KCEX)' : 'Connect Exchange'}</span>
            </h2>
            <p className="text-xs text-sub mt-1">
              {isFa
                ? 'حساب دمو به‌طور پیش‌فرض فعال است. اگر می‌خواهید روی پول واقعی ترید کنید، صرافی Toobit یا KCEX را وصل کنید.'
                : 'Paper Demo is active by default. Connect Toobit or KCEX whenever you are ready for live funds.'}
            </p>
          </div>

          {/* Saved Exchanges List */}
          <div className="space-y-2">
            {exchanges.map((c) => (
              <div key={c.id} className="surface-soft rounded-2xl p-3.5 space-y-2 border">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-main">{c.label || c.provider.toUpperCase()}</span>
                      {c.is_active === 1 && (
                        <span className="px-2 py-0.5 rounded-full badge-signal text-[10px] font-black">
                          {isFa ? 'فعال' : 'ACTIVE'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-dim font-mono-num mt-0.5">
                      {c.api_key_masked} · {c.last_test_status || 'OK'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!c.is_active && (
                      <button
                        onClick={async () => {
                          setMsg(null);
                          try {
                            await apiFetch(`/api/connections/exchanges/${c.id}/activate`, { method: 'POST' });
                            await loadAll();
                            await onRefreshDashboard();
                          } catch (err) {
                            setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Activation error' });
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl btn-cobalt text-[11px] font-extrabold"
                      >
                        {isFa ? 'فعال کردن' : 'Use This'}
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const r = await apiFetch<{ ok: boolean; message: string }>(`/api/connections/exchanges/${c.id}/test`, { method: 'POST' });
                        setMsg({ type: r.ok ? 'info' : 'error', text: r.message });
                        await loadAll();
                      }}
                      className="p-2 rounded-xl surface-card text-sub hover:text-main"
                      title="Test"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {c.provider !== 'paper' && (
                      <button
                        onClick={async () => {
                          await apiFetch(`/api/connections/exchanges/${c.id}`, { method: 'DELETE' });
                          await loadAll();
                          await onRefreshDashboard();
                        }}
                        className="p-2 rounded-xl surface-card text-rose-500"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {showProOptions && c.provider === 'toobit' && (
                  <div className="flex gap-1.5 pt-2 border-t">
                    <input
                      type="url"
                      dir="ltr"
                      value={proxyEdits[c.id] ?? c.proxy_url ?? ''}
                      onChange={(e) => setProxyEdits({ ...proxyEdits, [c.id]: e.target.value })}
                      placeholder="Relay URL (e.g. https://relay.example.com)"
                      className="flex-1 surface-input rounded-xl px-2.5 py-1.5 text-[11px] font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => updateExchangeProxy(c.id)}
                      className="px-3 py-1.5 rounded-xl btn-cobalt text-[11px] font-bold"
                    >
                      Save Relay
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Simple Add Exchange Form */}
          <form onSubmit={addExchange} className="pt-3 border-t space-y-3">
            <div className="text-xs font-black text-main">{isFa ? 'افزودن صرافی جدید' : 'Add Live Exchange'}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExForm({ ...exForm, provider: 'toobit' })}
                className={`py-2.5 rounded-2xl text-xs font-extrabold border transition ${
                  exForm.provider === 'toobit' ? 'btn-cobalt border-transparent' : 'surface-soft text-sub'
                }`}
              >
                Toobit (توبیت)
              </button>
              <button
                type="button"
                onClick={() => setExForm({ ...exForm, provider: 'kcex' })}
                className={`py-2.5 rounded-2xl text-xs font-extrabold border transition ${
                  exForm.provider === 'kcex' ? 'btn-cobalt border-transparent' : 'surface-soft text-sub'
                }`}
              >
                KCEX (۰٪ کارمزد)
              </button>
            </div>

            {exForm.provider === 'toobit' ? (
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl surface-soft text-[11px] text-sub leading-relaxed">
                  {isFa
                    ? '۱. در سایت یا اپلیکیشن Toobit بخش API Management بروید. ۲. تیک Read و Trade را بزنید (بدون تیک برداشت پول!). ۳. دو کد API Key و Secret را اینجا وارد کنید.'
                    : 'Create an API Key in Toobit with Trade permission only (no withdrawal permission) and paste below.'}
                </div>
                <input
                  type="text"
                  dir="ltr"
                  required
                  placeholder="API Key"
                  value={exForm.apiKey}
                  onChange={(e) => setExForm({ ...exForm, apiKey: e.target.value })}
                  className="w-full surface-input rounded-2xl px-3.5 py-2.5 text-xs font-mono-num"
                />
                <input
                  type="password"
                  dir="ltr"
                  required
                  placeholder="API Secret"
                  value={exForm.apiSecret}
                  onChange={(e) => setExForm({ ...exForm, apiSecret: e.target.value })}
                  className="w-full surface-input rounded-2xl px-3.5 py-2.5 text-xs font-mono-num"
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl banner-cobalt-soft text-[11px] text-sub leading-relaxed">
                  {isFa
                    ? 'صرافی KCEX با کارمزد ۰٪ میکر متصل می‌شود و لینک مستقیم معاملات را در حساب شما می‌سازد.'
                    : 'KCEX connects in 0% Maker Signal-Mirror mode with instant KCEX deep-links.'}
                </div>
                <a
                  href="https://www.kcex.com/futures/exchange/BTC_USDT"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
                >
                  <span>{isFa ? 'ورود به سایت KCEX' : 'Open KCEX Futures'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-2xl btn-emerald text-xs font-black flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isFa ? 'ثبت و اتصال صرافی' : 'Save & Connect Exchange'}</span>
            </button>
          </form>
        </section>

        {/* Right: Telegram Notifications + Optional Pro Settings */}
        <section className="lg:col-span-5 space-y-5">
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl badge-signal flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-signal" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-main">
                  {isFa ? 'دریافت گزارش معاملات در تلگرام' : 'Telegram Trade Alerts'}
                </h2>
                <p className="text-xs text-sub mt-1 leading-relaxed">
                  {isFa
                    ? 'هر وقت ربات معامله‌ای باز کند یا سود بگیرد، پیامش را لحظه‌ای در تلگرام خود دریافت کنید.'
                    : 'Receive instant open/close profit alerts on your Telegram.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={generateLinkCode}
              className="w-full py-3 rounded-2xl btn-cobalt text-xs font-black flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isFa ? 'ساخت کد اتصال تلگرام' : 'Generate Link Code'}</span>
            </button>

            {linkCode && (
              <div className="surface-soft rounded-2xl p-4 space-y-2 border border-[#1464F6]/30">
                <div className="text-xs text-sub">
                  {isFa ? 'این دستور را برای ربات @Dollarino_bot در تلگرام بفرستید:' : 'Send this command to @Dollarino_bot:'}
                </div>
                <div dir="ltr" className="font-mono-num text-sm font-black text-signal bg-black/20 rounded-xl px-3 py-2 text-center select-all">
                  {linkCode.command}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-dim pt-1">
              <ShieldCheck className="w-4 h-4 text-signal shrink-0 mt-0.5" />
              <span>{isFa ? 'کدهای صرافی شما به‌صورت رمزنگاری‌شده نگهداری می‌شوند و هیچ دسترسی برداشت وجهی ندارند.' : 'Credentials are encrypted and never have withdrawal access.'}</span>
            </div>
          </div>

          {/* Optional Advanced Technical Connectors */}
          <div className="surface-card rounded-3xl p-4 sm:p-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowProOptions((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-extrabold text-sub hover:text-main"
            >
              <span>{isFa ? 'تنظیمات پیشرفته (Relay و توکن ربات اختصاصی)' : 'Advanced Options (Relay & Custom Bot)'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showProOptions ? 'rotate-180' : ''}`} />
            </button>

            {showProOptions && (
              <form onSubmit={addTgBot} className="pt-2 border-t space-y-2.5">
                <div className="text-[11px] text-dim">
                  {isFa ? 'فقط در صورتی که می‌خواهید ربات اختصاصی BotFather خودتان را وصل کنید:' : 'Optional custom Telegram BotFather token:'}
                </div>
                <input
                  type="password"
                  dir="ltr"
                  placeholder="BotFather Token (123456:ABC...)"
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
                <input
                  type="text"
                  dir="ltr"
                  placeholder="@Dollarinoofficial"
                  value={tgChannel}
                  onChange={(e) => setTgChannel(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
                <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt text-xs font-bold">
                  {isFa ? 'اتصال ربات اختصاصی' : 'Connect Custom Bot'}
                </button>
                {tgBots.length > 0 && (
                  <div className="space-y-1 pt-2">
                    {tgBots.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs surface-soft rounded-xl px-3 py-2">
                        <span className="font-mono-num">@{b.bot_username}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' });
                            await loadAll();
                          }}
                          className="text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
