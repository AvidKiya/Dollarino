import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Cpu, ExternalLink, KeyRound, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
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

export function ConnectionsPage({
  lang,
  onRefreshDashboard,
}: {
  lang: Lang;
  onRefreshDashboard: () => Promise<void>;
}) {
  const [exchanges, setExchanges] = useState<ExchangeConn[]>([]);
  const [ais, setAis] = useState<AiConn[]>([]);
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [linkCode, setLinkCode] = useState<{ code: string; command: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [exForm, setExForm] = useState({
    provider: 'toobit' as 'toobit' | 'kcex' | 'bitunix',
    label: '',
    apiKey: '',
    apiSecret: '',
    webSessionToken: '',
    proxyUrl: '',
    proxySecret: '',
  });
  const [proxyEdits, setProxyEdits] = useState<Record<string, string>>({});
  const [aiForm, setAiForm] = useState({
    provider: 'openai' as 'openai' | 'anthropic' | 'gemini' | 'openai_compatible',
    model: 'gpt-4o-mini',
    baseUrl: '',
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
    setExchanges(ex.connections);
    setAis(ai.connections);
    setTgBots(tg.bots);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const addExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await apiFetch<{ test: { ok: boolean; message: string } }>('/api/connections/exchanges', {
      method: 'POST',
      body: JSON.stringify(exForm),
    });
    setMsg(res.test?.message ?? 'Exchange saved');
    setExForm({ ...exForm, apiKey: '', apiSecret: '', webSessionToken: '', proxySecret: '' });
    await loadAll();
    await onRefreshDashboard();
  };

  const updateExchangeProxy = async (id: string) => {
    setMsg(null);
    const proxyUrl = proxyEdits[id] ?? '';
    const res = await apiFetch<{ ok: boolean; test: { ok: boolean; message: string } }>(`/api/connections/exchanges/${id}/proxy`, {
      method: 'PATCH',
      body: JSON.stringify({ proxyUrl }),
    });
    setMsg(res.test?.message ?? 'Relay updated');
    await loadAll();
    await onRefreshDashboard();
  };

  const addAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/connections/ai', { method: 'POST', body: JSON.stringify(aiForm) });
    setAiForm({ ...aiForm, apiKey: '' });
    setMsg(lang === 'fa' ? 'کلید هوش مصنوعی با موفقیت ذخیره شد.' : 'AI Key saved securely.');
    await loadAll();
    await onRefreshDashboard();
  };

  const testAI = async () => {
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; reply?: string; error?: string }>('/api/connections/ai/test', { method: 'POST' });
      setMsg(res.ok ? `AI Ping OK: ${res.reply}` : res.error || 'Failed');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'AI Ping Failed');
    }
  };

  const runTestOrder = async () => {
    setMsg(null);
    const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/connections/exchanges/test-order', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'BTCUSDT', direction: 'LONG' }),
    });
    setMsg(res.ok ? `Guarded Test Order executed (${res.tradeId})` : res.error || 'Rejected');
    await onRefreshDashboard();
  };

  const addTgBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await apiFetch<{ username: string; webhookConfigured: boolean }>('/api/connections/telegram-bots', {
      method: 'POST',
      body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
    });
    setTgToken('');
    setMsg(`Telegram bot @${res.username} connected (webhook=${res.webhookConfigured ? 'HTTPS OK' : 'pending HTTPS'}).`);
    await loadAll();
  };

  const generateLinkCode = async () => {
    const res = await apiFetch<{ code: string; command: string }>('/api/auth/telegram-link-code', { method: 'POST' });
    setLinkCode(res);
  };

  return (
    <div className="space-y-5">
      {msg && (
        <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200">{msg}</div>
      )}

      {/* 1. Exchanges: Toobit + KCEX + Bitunix + Paper */}
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              <KeyRound className="w-5 h-5 text-emerald-400" />
              <span>{lang === 'fa' ? 'اتصال صرافی‌های فیوچرز (Toobit · KCEX · Bitunix · Paper)' : 'Exchange API Vault (Toobit · KCEX · Bitunix · Paper)'}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fa'
                ? 'تمامی کلیدها با رمزنگاری AES-256-GCM ذخیره می‌شوند. پشتیبانی کامل از Toobit و حالت ویژه KCEX Mirror ۰٪ میکر.'
                : 'Credentials encrypted with AES-256-GCM. Full Toobit & Bitunix HMAC API + KCEX 0% Maker Signal-Mirror integration.'}
            </p>
          </div>
          <button
            onClick={runTestOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'تست سفارش محافظت‌شده' : 'Run Guarded Test Order'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {exchanges.map((c) => (
            <div key={c.id} className={`p-3.5 rounded-xl border ${c.is_active ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-white uppercase">{c.provider}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${c.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                  {c.is_active ? 'ACTIVE' : 'STANDBY'}
                </span>
              </div>
              <div className="text-slate-300 mt-1">{c.label}</div>
              <div className="font-mono-num text-slate-500 text-[11px] mt-0.5 break-words">{c.api_key_masked} · {c.last_test_status || 'UNTESTED'}</div>
              {c.provider === 'toobit' && (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={proxyEdits[c.id] ?? c.proxy_url ?? ''}
                    onChange={(e) => setProxyEdits({ ...proxyEdits, [c.id]: e.target.value })}
                    placeholder={c.has_global_proxy ? 'Global Relay active (optional override)' : 'Toobit Relay URL (https://...)'}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={() => updateExchangeProxy(c.id)}
                    className="px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[11px] shrink-0"
                  >
                    {lang === 'fa' ? 'ذخیره رله' : 'Save Relay'}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2.5">
                {!c.is_active && (
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/connections/exchanges/${c.id}/activate`, { method: 'POST' });
                      await loadAll();
                      await onRefreshDashboard();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={async () => {
                    const t = await apiFetch<{ ok: boolean; message: string }>(`/api/connections/exchanges/${c.id}/test`, { method: 'POST' });
                    setMsg(t.message);
                    await loadAll();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Test
                </button>
                {c.provider !== 'paper' && (
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/connections/exchanges/${c.id}`, { method: 'DELETE' });
                      await loadAll();
                    }}
                    className="p-1 text-rose-400 hover:bg-rose-500/10 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={addExchange} className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2 border-t border-slate-800 text-xs">
          <select
            value={exForm.provider}
            onChange={(e) => setExForm({ ...exForm, provider: e.target.value as 'toobit' | 'kcex' | 'bitunix' })}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
          >
            <option value="toobit">Toobit Futures (Live API)</option>
            <option value="kcex">KCEX Futures (0% Mirror)</option>
            <option value="bitunix">Bitunix Futures (Live API)</option>
          </select>

          {exForm.provider === 'kcex' ? (
            <>
              <div className="md:col-span-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-200 flex items-center justify-between gap-2">
                <span>
                  {lang === 'fa'
                    ? 'KCEX API رسمی ندارد — فعال‌سازی حالت KCEX Mirror (کارمزد ۰.۰۱٪ + BTC_USDT)'
                    : 'KCEX lacks public REST API keys — activates 0.01% Mirror + BTC_USDT deep-link'}
                </span>
                <a href="https://www.kcex.com/futures/exchange/BTC_USDT" target="_blank" rel="noreferrer" className="text-amber-300 underline shrink-0 inline-flex items-center gap-1">
                  KCEX <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                placeholder={lang === 'fa' ? 'توکن سشن وب (اختیاری)' : 'Optional Web-Session Token'}
                value={exForm.webSessionToken}
                onChange={(e) => setExForm({ ...exForm, webSessionToken: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              />
            </>
          ) : (
            <>
              <input
                placeholder="Label (optional)"
                value={exForm.label}
                onChange={(e) => setExForm({ ...exForm, label: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              />
              <input
                required
                placeholder="API Key"
                value={exForm.apiKey}
                onChange={(e) => setExForm({ ...exForm, apiKey: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              />
              <input
                required
                type="password"
                placeholder="API Secret"
                value={exForm.apiSecret}
                onChange={(e) => setExForm({ ...exForm, apiSecret: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              />
              {exForm.provider === 'toobit' && (
                <>
                  <input
                    placeholder="Relay Proxy URL (optional, e.g. https://relay.vercel.app)"
                    value={exForm.proxyUrl}
                    onChange={(e) => setExForm({ ...exForm, proxyUrl: e.target.value })}
                    className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    type="password"
                    placeholder="Relay Secret (optional)"
                    value={exForm.proxySecret}
                    onChange={(e) => setExForm({ ...exForm, proxySecret: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num"
                  />
                  <div className="md:col-span-2 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    {lang === 'fa'
                      ? 'نکته Toobit: کلودفلر آی‌پی 2a06:98c0:3600::103 را برای Toobit مسدود می‌کند (خطای 403). رله رایگان apps/relay را روی Vercel (منطقه fra1) یا سرور غیرآمریکایی مستقر کرده و آدرس آن را وارد کنید — یا از Bitunix مستقیم استفاده کنید.'
                      : 'Toobit Note: Cloudflare Workers IP (2a06:98c0:3600::103) receives 403 Geo-Block from Toobit. Deploy apps/relay to Vercel (fra1) or any non-US VPS and paste its URL here, or connect Bitunix directly.'}
                  </div>
                </>
              )}
            </>
          )}

          <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center justify-center gap-1">
            <Plus className="w-3.5 h-3.5" /> {lang === 'fa' ? 'افزودن و اتصال' : 'Connect Exchange'}
          </button>
        </form>
      </div>

      {/* 2. BYO AI + 3. Telegram BotFather */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'اتصال کلید هوش مصنوعی شخصی (BYO AI)' : 'Bring-Your-Own AI Keys'}</h3>
            </div>
            <button onClick={testAI} className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30">
              {lang === 'fa' ? 'تست پینگ AI' : 'Test AI Ping'}
            </button>
          </div>
          {ais.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
              <div>
                <span className="font-bold text-white uppercase">{a.provider}</span> · {a.model} · <span className="font-mono-num text-slate-400">{a.api_key_masked}</span>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/connections/ai/${a.id}`, { method: 'DELETE' });
                  await loadAll();
                }}
                className="text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <form onSubmit={addAI} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={aiForm.provider}
                onChange={(e) => {
                  const p = e.target.value as 'openai' | 'anthropic' | 'gemini' | 'openai_compatible';
                  const defaultModel = p === 'openai' ? 'gpt-4o-mini' : p === 'anthropic' ? 'claude-3-5-sonnet-latest' : p === 'gemini' ? 'gemini-2.0-flash' : 'deepseek/deepseek-chat';
                  setAiForm({ ...aiForm, provider: p, model: defaultModel });
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              >
                <option value="openai">OpenAI (GPT-4o / o3)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai_compatible">OpenRouter / DeepSeek / Groq</option>
              </select>
              <input value={aiForm.model} onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })} placeholder="Model ID" className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            </div>
            {aiForm.provider === 'openai_compatible' && (
              <input value={aiForm.baseUrl} onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })} placeholder="Base URL (e.g. https://openrouter.ai/api/v1)" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            )}
            <div className="flex gap-2">
              <input required type="password" value={aiForm.apiKey} onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })} placeholder="Paste API Key" className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
              <button type="submit" className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold">Save</button>
            </div>
          </form>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'اتصال بات تلگرام شخصی (BotFather)' : 'Telegram BotFather & Signal Channel'}</h3>
            </div>
            <button onClick={generateLinkCode} className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {lang === 'fa' ? 'کد لینک اکانت' : 'Link Code'}
            </button>
          </div>
          {linkCode && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono-num">
              Send in Telegram: <span className="font-bold select-all">{linkCode.command}</span>
            </div>
          )}
          {tgBots.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-bold">@{b.bot_username}</span>
                <span className="text-slate-400">{b.signal_channel_id || ''}</span>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' });
                  await loadAll();
                }}
                className="text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <form onSubmit={addTgBot} className="space-y-2">
            <input required value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="BotFather Token (123456789:ABC...)" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
            <div className="flex gap-2">
              <input value={tgChannel} onChange={(e) => setTgChannel(e.target.value)} placeholder="@Dollarinoofficial" className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2" />
              <button type="submit" className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">Connect Bot</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
