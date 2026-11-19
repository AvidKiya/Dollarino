import { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Crown,
  ExternalLink,
  KeyRound,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { EntitlementSummary } from '../components/Layout';

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

interface AiConn {
  id: string;
  provider: string;
  label: string;
  model: string;
  is_active: number;
  api_key_masked: string;
}

interface TgBot {
  id: string;
  bot_username: string;
  bot_token_masked: string;
  signal_channel_id: string | null;
}

type AIProviderChoice = 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';

const AI_MODEL_PRESETS: Record<AIProviderChoice, string[]> = {
  deepseek: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  openai_compatible: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
};

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
  const [ais, setAis] = useState<AiConn[]>([]);
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [linkCode, setLinkCode] = useState<{ code: string; command: string } | null>(null);
  const [msg, setMsg] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [testingAi, setTestingAi] = useState(false);

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
  const [aiForm, setAiForm] = useState<{
    provider: AIProviderChoice;
    model: string;
    baseUrl: string;
    apiKey: string;
  }>({
    provider: 'deepseek',
    model: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
  });
  const [tgToken, setTgToken] = useState('');
  const [tgChannel, setTgChannel] = useState('@Dollarinoofficial');

  const loadAll = async () => {
    const [ex, ai, tg] = await Promise.all([
      apiFetch<{ connections: ExchangeConn[] }>('/api/connections/exchanges'),
      apiFetch<{ connections: AiConn[] }>('/api/connections/ai'),
      apiFetch<{ bots: TgBot[] }>('/api/connections/telegram-bots'),
    ]);
    // Strictly show only Toobit, KCEX, and Paper Demo
    setExchanges(ex.connections.filter((c) => c.provider === 'toobit' || c.provider === 'kcex' || c.provider === 'paper'));
    setAis(ai.connections);
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
            ? 'اطلاعات صرافی ذخیره و تست شد (در حالت Standby). برای فعال‌سازی معامله واقعی روی Toobit یا KCEX ابتدا اشتراک Pro تهیه کنید.'
            : 'Exchange saved in STANDBY. Upgrade to Pro/VIP to activate live Toobit or KCEX trading.',
        });
      } else {
        setMsg({ type: 'info', text: res.test?.message ?? 'Exchange saved & activated' });
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

  const addAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/connections/ai', { method: 'POST', body: JSON.stringify(aiForm) });
      setAiForm({ ...aiForm, apiKey: '' });
      setMsg({
        type: 'info',
        text: isFa
          ? `کلید ${aiForm.provider.toUpperCase()} (${aiForm.model}) ذخیره و فعال شد!`
          : `${aiForm.provider.toUpperCase()} (${aiForm.model}) saved & activated!`,
      });
      await loadAll();
      await onRefreshDashboard();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save AI key' });
    }
  };

  const testAI = async () => {
    setMsg(null);
    setTestingAi(true);
    try {
      const res = await apiFetch<{ ok: boolean; provider?: string; model?: string; reply?: string; error?: string }>(
        '/api/connections/ai/test',
        { method: 'POST' }
      );
      setMsg({
        type: res.ok ? 'info' : 'error',
        text: res.ok ? `AI Ping OK (${res.provider} / ${res.model}): ${res.reply}` : res.error || 'Failed',
      });
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'AI Ping Failed' });
    } finally {
      setTestingAi(false);
    }
  };

  const runTestOrder = async () => {
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/connections/exchanges/test-order', {
        method: 'POST',
        body: JSON.stringify({ symbol: 'BTCUSDT', direction: 'LONG' }),
      });
      setMsg({ type: res.ok ? 'info' : 'error', text: res.ok ? `Test Order executed (${res.tradeId})` : res.error || 'Rejected' });
      await onRefreshDashboard();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Test order failed' });
    }
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
        text: `Telegram bot @${res.username} connected (webhook=${res.webhookConfigured ? 'HTTPS OK' : 'pending HTTPS'}).`,
      });
      await loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Telegram connect failed' });
    }
  };

  const generateLinkCode = async () => {
    const res = await apiFetch<{ code: string; command: string }>('/api/auth/telegram-link-code', { method: 'POST' });
    setLinkCode(res);
  };

  const isPaid = Boolean(entitlement?.hasPaidPlan);

  return (
    <div className="space-y-5">
      {!isPaid && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-[#2563eb]/15 to-[#f59f14]/10 border border-[#2563eb]/35 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <Crown className="w-5 h-5 text-[#f59f14] shrink-0" />
            <div>
              <div className="font-bold text-white">
                {isFa ? 'در حالت دمو رایگان (Paper Demo) هستید' : 'You are currently on Free Paper Demo'}
              </div>
              <div className="text-[#9aa5b5]">
                {isFa
                  ? 'حساب دمو همیشه فعال است؛ برای فعال‌سازی معاملات لایو روی Toobit و KCEX اشتراک Pro یا VIP تهیه کنید.'
                  : 'Paper Demo is active for testing; upgrade to Pro or VIP to activate live Toobit or KCEX trading.'}
              </div>
            </div>
          </div>
          {onOpenSubscription && (
            <button
              onClick={onOpenSubscription}
              className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold shrink-0"
            >
              {isFa ? 'خرید اشتراک' : 'Upgrade Plan'}
            </button>
          )}
        </div>
      )}

      {msg && (
        <div
          className={`p-3.5 rounded-2xl border text-xs ${
            msg.type === 'error'
              ? 'bg-[#eb493d]/15 border-[#eb493d]/40 text-[#eb493d]'
              : 'bg-[#2563eb]/15 border-[#2563eb]/40 text-[#c5d6ff]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 1. Exchanges: Strictly Toobit, KCEX & Paper Demo */}
      <div className="card-tt p-6 rounded-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold flex items-center gap-2 text-white">
              <KeyRound className="w-5 h-5 text-[#27cd86]" />
              <span>{isFa ? 'صرافی‌های متصل (فقط Toobit · KCEX · Paper Demo)' : 'Exchanges (Toobit · KCEX · Paper Demo)'}</span>
            </h2>
            <p className="text-xs text-[#8f99aa] mt-1">
              {isFa
                ? 'تمامی کلیدها با رمزنگاری AES-256-GCM ذخیره می‌شوند. حساب دمو Paper برای تست همیشه آماده است.'
                : 'Encrypted with AES-256-GCM. Use Toobit API, KCEX Mirror, or Paper Demo.'}
            </p>
          </div>
          <button
            onClick={runTestOrder}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#f59f14]/15 hover:bg-[#f59f14]/25 border border-[#f59f14]/35 text-[#f59f14] text-xs font-bold"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isFa ? 'تست سفارش روی حساب فعال' : 'Run Test Order'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {exchanges.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-2xl border ${
                c.is_active ? 'border-[#27cd86]/50 bg-[#27cd86]/5' : 'border-[#1d222e] bg-[#0b0e14]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-white uppercase">
                  {c.provider === 'paper' ? 'Paper Demo' : c.provider.toUpperCase()}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    c.is_active ? 'bg-[#27cd86]/20 text-[#27cd86]' : 'bg-[#1a1f2b] text-[#8f99aa]'
                  }`}
                >
                  {c.is_active ? 'ACTIVE' : 'STANDBY'}
                </span>
              </div>
              <div className="text-[#d5dce6] mt-1 font-medium">{c.label}</div>
              <div className="font-mono-num text-[#6c7689] text-[11px] mt-0.5 break-words">
                {c.api_key_masked} · {c.last_test_status || 'UNTESTED'}
              </div>
              {c.provider === 'toobit' && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <input
                    value={proxyEdits[c.id] ?? c.proxy_url ?? ''}
                    onChange={(e) => setProxyEdits({ ...proxyEdits, [c.id]: e.target.value })}
                    placeholder={c.has_global_proxy ? 'Global Relay active' : 'Toobit Relay URL (https://...)'}
                    className="flex-1 min-w-0 bg-[#080a0e] border border-[#222836] rounded-xl px-2.5 py-1.5 text-[11px] font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={() => updateExchangeProxy(c.id)}
                    className="px-2.5 py-1.5 rounded-xl bg-[#2563eb]/20 hover:bg-[#2563eb]/30 text-[#9eb7ff] text-[11px] font-bold shrink-0"
                  >
                    {isFa ? 'ذخیره رله' : 'Save Relay'}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                {!c.is_active && (
                  <button
                    onClick={async () => {
                      setMsg(null);
                      try {
                        await apiFetch(`/api/connections/exchanges/${c.id}/activate`, { method: 'POST' });
                        await loadAll();
                        await onRefreshDashboard();
                      } catch (err) {
                        setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Activation blocked' });
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#27cd86]/20 text-[#27cd86] hover:bg-[#27cd86]/30 font-bold"
                  >
                    {isFa ? 'فعال‌سازی' : 'Activate'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    const t = await apiFetch<{ ok: boolean; message: string }>(`/api/connections/exchanges/${c.id}/test`, {
                      method: 'POST',
                    });
                    setMsg({ type: t.ok ? 'info' : 'error', text: t.message });
                    await loadAll();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#161b26] hover:bg-[#1e2533] text-[#d5dce6] inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> {isFa ? 'تست' : 'Test'}
                </button>
                {c.provider !== 'paper' && (
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/connections/exchanges/${c.id}`, { method: 'DELETE' });
                      await loadAll();
                    }}
                    className="p-1.5 text-[#eb493d] hover:bg-[#eb493d]/10 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addExchange} className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-3 border-t border-[#181d28] text-xs">
          <select
            value={exForm.provider}
            onChange={(e) => setExForm({ ...exForm, provider: e.target.value as 'toobit' | 'kcex' })}
            className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-semibold"
          >
            <option value="toobit">Toobit Futures (Live API)</option>
            <option value="kcex">KCEX Futures (0% Maker)</option>
          </select>

          {exForm.provider === 'kcex' ? (
            <>
              <div className="md:col-span-2 bg-[#f59f14]/10 border border-[#f59f14]/30 rounded-xl px-3 py-2 text-[#f5b74e] flex items-center justify-between gap-2">
                <span>
                  {isFa
                    ? 'حالت اتصال KCEX (کارمزد ۰٪ + لینک سریع سفارش)'
                    : 'KCEX 0% Maker Mirror integration'}
                </span>
                <a
                  href="https://www.kcex.com/futures/exchange/BTC_USDT"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#f59f14] underline shrink-0 inline-flex items-center gap-1"
                >
                  KCEX <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                placeholder={isFa ? 'توکن سشن وب (اختیاری)' : 'Web-Session Token (optional)'}
                value={exForm.webSessionToken}
                onChange={(e) => setExForm({ ...exForm, webSessionToken: e.target.value })}
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
              />
            </>
          ) : (
            <>
              <input
                placeholder={isFa ? 'نام دلخواه (مثلاً Toobit اصلی)' : 'Label (optional)'}
                value={exForm.label}
                onChange={(e) => setExForm({ ...exForm, label: e.target.value })}
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
              />
              <input
                required
                placeholder="Toobit API Key"
                value={exForm.apiKey}
                onChange={(e) => setExForm({ ...exForm, apiKey: e.target.value })}
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num"
              />
              <input
                required
                type="password"
                placeholder="Toobit API Secret"
                value={exForm.apiSecret}
                onChange={(e) => setExForm({ ...exForm, apiSecret: e.target.value })}
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num"
              />
              <input
                placeholder="Toobit Relay URL (optional)"
                value={exForm.proxyUrl}
                onChange={(e) => setExForm({ ...exForm, proxyUrl: e.target.value })}
                className="md:col-span-2 bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num"
              />
              <input
                type="password"
                placeholder="Relay Secret (optional)"
                value={exForm.proxySecret}
                onChange={(e) => setExForm({ ...exForm, proxySecret: e.target.value })}
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num"
              />
            </>
          )}

          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-extrabold inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isFa ? 'افزودن صرافی' : 'Connect Exchange'}</span>
          </button>
        </form>
      </div>

      {/* 2. AI Trading Engine Vault */}
      <div className="card-tt p-6 rounded-3xl space-y-4 text-xs border-[#2563eb]/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold flex items-center gap-2 text-white">
              <BrainCircuit className="w-5 h-5 text-[#3b82f6]" />
              <span>{isFa ? 'موتور هوش مصنوعی (DeepSeek · Claude · GPT · Gemini)' : 'AI Engine (DeepSeek · Claude · GPT · Gemini)'}</span>
            </h2>
            <p className="text-xs text-[#8f99aa] mt-1">
              {isFa
                ? 'کلید API مدل هوش مصنوعی خود را برای ترید خودکار یا تحلیل چارت وارد کنید.'
                : 'Add your AI key for Autonomous AI Trading and Chart AI analysis.'}
            </p>
          </div>
          <button
            onClick={testAI}
            disabled={testingAi}
            className="px-3.5 py-2 rounded-xl bg-[#2563eb]/15 hover:bg-[#2563eb]/25 text-[#9eb7ff] border border-[#2563eb]/35 font-bold inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{testingAi ? '...' : isFa ? 'تست پینگ AI' : 'Test AI Ping'}</span>
          </button>
        </div>

        {ais.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ais.map((a) => (
              <div
                key={a.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                  a.is_active ? 'border-[#2563eb]/50 bg-[#2563eb]/10' : 'border-[#1d222e] bg-[#0b0e14]'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white uppercase">{a.provider}</span>
                    {a.is_active ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#27cd86]/20 text-[#27cd86] text-[9px] font-bold">ACTIVE</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-[#9aa5b5] truncate">{a.model}</div>
                  <div className="font-mono-num text-[10px] text-[#6c7689]">{a.api_key_masked}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!a.is_active && (
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/connections/ai/${a.id}/activate`, { method: 'POST' });
                        await loadAll();
                        await onRefreshDashboard();
                      }}
                      className="px-2.5 py-1 rounded-xl bg-[#2563eb]/20 text-[#9eb7ff] text-[10px] font-bold"
                    >
                      {isFa ? 'فعال' : 'Use'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/connections/ai/${a.id}`, { method: 'DELETE' });
                      await loadAll();
                      await onRefreshDashboard();
                    }}
                    className="p-1.5 text-[#eb493d] hover:bg-[#eb493d]/10 rounded-xl"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addAI} className="space-y-3 pt-2 border-t border-[#181d28]">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'deepseek', label: 'DeepSeek (پیشنهادی)' },
                { id: 'anthropic', label: 'Claude' },
                { id: 'openai', label: 'OpenAI GPT' },
                { id: 'gemini', label: 'Gemini' },
                { id: 'openai_compatible', label: 'OpenRouter / Custom' },
              ] as const
            ).map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  const defaultModel = AI_MODEL_PRESETS[p.id][0]!;
                  const defaultBase =
                    p.id === 'deepseek'
                      ? 'https://api.deepseek.com'
                      : p.id === 'openai_compatible'
                        ? 'https://openrouter.ai/api/v1'
                        : '';
                  setAiForm({ ...aiForm, provider: p.id, model: defaultModel, baseUrl: defaultBase });
                }}
                className={`px-3 py-1.5 rounded-xl border font-bold transition ${
                  aiForm.provider === p.id
                    ? 'border-[#2563eb] bg-[#2563eb] text-white'
                    : 'border-[#1e2432] bg-[#0b0e14] text-[#8f99aa] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[#6c7689]">{isFa ? 'مدل‌ها:' : 'Presets:'}</span>
            {AI_MODEL_PRESETS[aiForm.provider].map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setAiForm({ ...aiForm, model: m })}
                className={`px-2.5 py-1 rounded-xl font-mono-num text-[11px] border ${
                  aiForm.model === m
                    ? 'border-[#27cd86]/50 bg-[#27cd86]/15 text-[#27cd86]'
                    : 'border-[#1d222e] bg-[#080a0e] text-[#9aa5b5] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <input
              value={aiForm.model}
              onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
              placeholder="Model ID"
              className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num text-white"
            />
            {(aiForm.provider === 'deepseek' || aiForm.provider === 'openai_compatible') && (
              <input
                value={aiForm.baseUrl}
                onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                placeholder="Base URL"
                className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num text-[#c5cede]"
              />
            )}
            <input
              required
              type="password"
              value={aiForm.apiKey}
              onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
              placeholder={`Paste ${aiForm.provider.toUpperCase()} API Key`}
              className={`${
                aiForm.provider === 'deepseek' || aiForm.provider === 'openai_compatible' ? 'md:col-span-1' : 'md:col-span-2'
              } bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num text-white`}
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isFa ? 'ذخیره کلید AI' : 'Save AI Key'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. Telegram BotFather */}
      <div className="card-tt p-6 rounded-3xl space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#a78bfa]" />
            <h3 className="font-extrabold text-sm text-white">
              {isFa ? 'اتصال بات تلگرام (BotFather)' : 'Telegram BotFather & Signal Channel'}
            </h3>
          </div>
          <button
            onClick={generateLinkCode}
            className="px-3 py-1.5 rounded-xl bg-[#2563eb]/20 text-[#9eb7ff] border border-[#2563eb]/35 font-bold"
          >
            {isFa ? 'ساخت کد اتصال حساب' : 'Link Code'}
          </button>
        </div>
        {linkCode && (
          <div className="p-3 rounded-xl bg-[#27cd86]/10 border border-[#27cd86]/30 text-[#27cd86] font-mono-num">
            Send in Telegram: <span className="font-bold select-all">{linkCode.command}</span>
          </div>
        )}
        {tgBots.map((b) => (
          <div key={b.id} className="flex items-center justify-between p-3 rounded-2xl bg-[#0b0e14] border border-[#1d222e]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#27cd86]" />
              <span className="font-bold text-white">@{b.bot_username}</span>
              <span className="text-[#6c7689]">{b.signal_channel_id || ''}</span>
            </div>
            <button
              onClick={async () => {
                await apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' });
                await loadAll();
              }}
              className="text-[#eb493d]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <form onSubmit={addTgBot} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            required
            value={tgToken}
            onChange={(e) => setTgToken(e.target.value)}
            placeholder="BotFather Token (123456789:ABC...)"
            className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
          />
          <input
            value={tgChannel}
            onChange={(e) => setTgChannel(e.target.value)}
            placeholder="@Dollarinoofficial"
            className="bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5"
          />
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold">
            {isFa ? 'اتصال بات تلگرام' : 'Connect Bot'}
          </button>
        </form>
      </div>
    </div>
  );
}
