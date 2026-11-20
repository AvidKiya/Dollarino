import { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy as CopyIcon,
  KeyRound,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatDollarinoSignal } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, EntitlementSummary, NavTab } from '../lib/types';

interface ExchangeConn {
  id: string;
  provider: string;
  label: string;
  is_active: number;
  api_key_masked: string;
  last_test_status: string;
}

interface TgBot {
  id: string;
  bot_username: string;
  bot_token_masked: string;
  signal_channel_id: string | null;
}

export function CopyConnectPage({
  lang,
  data,
  entitlement,
  onNavigate,
  onRefresh,
}: {
  lang: Lang;
  data: DashboardPayload;
  entitlement?: EntitlementSummary | null;
  onNavigate: (tab: NavTab) => void;
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<'copy' | 'exchanges' | 'risk'>('copy');
  const [msg, setMsg] = useState<{ err?: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Copy Trade & Signals
  const webhookUrl = `${window.location.origin}/api/webhook/tv/${data.config.webhook_secret}`;
  const [rawSig, setRawSig] = useState(
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
      channelHandle: data.config.signal_channel_handle || '@Dollarinoofficial',
    })
  );
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [tgToken, setTgToken] = useState('');
  const [tgChannel, setTgChannel] = useState(data.config.signal_channel_handle || '@Dollarinoofficial');
  const [linkCode, setLinkCode] = useState<{ code: string; command: string } | null>(null);

  // Exchange connections (2-step simplified form)
  const [exchanges, setExchanges] = useState<ExchangeConn[]>([]);
  const [showAdvancedEx, setShowAdvancedEx] = useState(false);
  const [exForm, setExForm] = useState({
    provider: 'toobit' as 'toobit' | 'kcex',
    label: '',
    apiKey: '',
    apiSecret: '',
    webSessionToken: '',
    proxyUrl: '',
    proxySecret: '',
  });

  // Risk Engine Controls
  const [riskForm, setRiskForm] = useState({
    margin_pct: Number(data.config.margin_pct ?? 5),
    max_leverage: Number(data.config.max_leverage ?? 10),
    max_open_positions: Number(data.config.max_open_positions ?? 6),
    daily_max_loss_pct: Number(data.config.daily_max_loss_pct ?? 5),
    trailing_stop_enabled: Boolean(data.config.trailing_stop_enabled ?? 1),
    trailing_stop_pct: Number(data.config.trailing_stop_pct ?? 2),
    auto_breakeven_on_tp1: Boolean(data.config.auto_breakeven_on_tp1 ?? 1),
    allow_auto_flip: Boolean(data.config.allow_auto_flip ?? 1),
    block_weekends: Boolean(data.config.block_weekends ?? 0),
    macro_blackout: Boolean(data.config.macro_blackout ?? 0),
  });

  const loadConnections = async () => {
    const [ex, tg] = await Promise.all([
      apiFetch<{ connections: ExchangeConn[] }>('/api/connections/exchanges').catch(() => ({ connections: [] })),
      apiFetch<{ bots: TgBot[] }>('/api/connections/telegram-bots').catch(() => ({ bots: [] })),
    ]);
    setExchanges(ex.connections.filter((c) => c.provider === 'toobit' || c.provider === 'kcex' || c.provider === 'paper'));
    setTgBots(tg.bots);
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const flash = (text: string, err = false) => {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 5000);
  };

  const runSignal = async (executeNow: boolean) => {
    try {
      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
        method: 'POST',
        body: JSON.stringify({ rawText: rawSig, executeNow }),
      });
      if (!res.ok) flash(res.error || 'Rejected', true);
      else flash(executeNow ? (isFa ? `معامله ${res.tradeId} باز شد ✅` : `Executed ${res.tradeId}`) : isFa ? 'سیگنال با موفقیت ثبت شد ✅' : 'Signal parsed & logged ✅');
      await onRefresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Error', true);
    }
  };

  const addExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ test: { ok: boolean; message: string }; requiresSubscription?: boolean }>('/api/connections/exchanges', {
        method: 'POST',
        body: JSON.stringify(exForm),
      });
      flash(
        res.requiresSubscription
          ? isFa
            ? 'صرافی ذخیره شد. برای معامله واقعی، اشتراک Pro را فعال کنید.'
            : 'Saved. Upgrade to Pro for live execution.'
          : `${res.test.ok ? '✅' : '⚠️'} ${res.test.message}`
      );
      setExForm({ provider: 'toobit', label: '', apiKey: '', apiSecret: '', webSessionToken: '', proxyUrl: '', proxySecret: '' });
      await loadConnections();
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const activateExchange = async (id: string) => {
    try {
      await apiFetch(`/api/connections/exchanges/${id}/activate`, { method: 'POST' });
      flash(isFa ? 'حساب صرافی فعال شد ✅' : 'Active exchange switched ✅');
      await loadConnections();
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Upgrade required', true);
    }
  };

  const addTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ botUsername: string }>('/api/connections/telegram-bots', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
      });
      flash(isFa ? `ربات @${res.botUsername} متصل شد ✅` : `Bot @${res.botUsername} connected ✅`);
      setTgToken('');
      await loadConnections();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed', true);
    }
  };

  const saveRisk = async () => {
    try {
      await apiFetch('/api/trading/config', {
        method: 'PUT',
        body: JSON.stringify({
          ...riskForm,
          trailing_stop_enabled: riskForm.trailing_stop_enabled ? 1 : 0,
          auto_breakeven_on_tp1: riskForm.auto_breakeven_on_tp1 ? 1 : 0,
          allow_auto_flip: riskForm.allow_auto_flip ? 1 : 0,
          block_weekends: riskForm.block_weekends ? 1 : 0,
          macro_blackout: riskForm.macro_blackout ? 1 : 0,
        }),
      });
      flash(isFa ? 'تنظیمات سپر ریسک در ربات اعمال شد ✅' : 'Risk engine rules saved ✅');
      await onRefresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
            COPY-TRADE · EXCHANGES · RISK ENGINE
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {isFa ? 'کپی‌ترید، اتصال صرافی و سپر ریسک' : 'Copy-Trade, Exchanges & Risk'}
          </h2>
        </div>

        <div className="inline-flex p-1 panel rounded-full overflow-x-auto no-scrollbar">
          {[
            { id: 'copy' as const, icon: Bot, l: isFa ? 'کپی‌ترید و تلگرام' : 'Copy & Telegram' },
            { id: 'exchanges' as const, icon: Link2, l: isFa ? 'اتصال صرافی واقعی' : 'Exchanges' },
            { id: 'risk' as const, icon: Sliders, l: isFa ? 'سپر ریسک' : 'Risk Shield' },
          ].map((x) => {
            const Icon = x.icon;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                className={`px-4 py-2 rounded-full text-xs font-black transition inline-flex items-center gap-1.5 whitespace-nowrap ${
                  tab === x.id ? 'btn-gold' : 'text-dim hover:text-main'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{x.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {msg && (
        <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${msg.err ? 'bg-rose-500/15 text-loss border border-rose-500/35' : 'badge-signal'}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg.text}</span>
        </div>
      )}

      {tab === 'copy' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* TradingView & Signal Parser */}
          <div className="panel rounded-[26px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-main">
                {isFa ? 'لینک وب‌هوک TradingView و اجرای سیگنال' : 'TradingView Webhook & Signal Runner'}
              </h3>
              {!entitlement?.hasPaidPlan && (
                <button type="button" onClick={() => onNavigate('pricing')} className="text-[11px] font-bold hover:underline" style={{ color: 'var(--gold)' }}>
                  {isFa ? 'نیازمند پرو ←' : 'Upgrade Pro →'}
                </button>
              )}
            </div>

            <div className="rounded-2xl surface-soft p-3 flex items-center justify-between gap-2 text-xs">
              <code dir="ltr" className="truncate font-mono text-[11px] text-main">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="btn-gold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی لینک' : 'Copy'}</span>
              </button>
            </div>

            <textarea
              rows={8}
              dir="ltr"
              value={rawSig}
              onChange={(e) => setRawSig(e.target.value)}
              className="field font-mono text-[11px]"
            />

            <div className="flex gap-2">
              <button type="button" onClick={() => void runSignal(false)} className="btn-ghost flex-1 py-2.5 rounded-xl text-xs font-bold">
                {isFa ? 'فقط تحلیل و ثبت در رادار' : 'Parse & Log Only'}
              </button>
              <button type="button" onClick={() => void runSignal(true)} className="btn-emerald flex-1 py-2.5 rounded-xl text-xs inline-flex items-center justify-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>{isFa ? 'اجرای خودکار ۳ تارگت' : 'Execute 3-TP'}</span>
              </button>
            </div>
          </div>

          {/* Telegram Bot & Link Account */}
          <div className="panel rounded-[26px] p-5 space-y-4">
            <h3 className="font-display font-bold text-lg text-main">
              {isFa ? 'کپی‌ترید مستقیم از کانال تلگرام' : 'Telegram Channel Copy-Trade'}
            </h3>
            <p className="text-xs text-dim leading-relaxed">
              {isFa
                ? 'توکن ربات تلگرام (از BotFather@) و آیدی کانال سیگنال خود را متصل کنید تا تمام سیگنال‌ها لحظه‌ای معامله شوند.'
                : 'Connect your Telegram bot token and signal channel handle for real-time auto execution.'}
            </p>

            <form onSubmit={addTelegramBot} className="space-y-3 text-xs">
              <input
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                required
                dir="ltr"
                placeholder="123456:ABC-BotFatherToken..."
                className="field font-mono"
              />
              <input
                value={tgChannel}
                onChange={(e) => setTgChannel(e.target.value)}
                dir="ltr"
                placeholder="@Dollarinoofficial"
                className="field font-mono"
              />
              <button type="submit" className="btn-gold w-full py-3 rounded-xl text-xs inline-flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" />
                <span>{isFa ? 'اتصال ربات تلگرام' : 'Connect Telegram Bot'}</span>
              </button>
            </form>

            {tgBots.length > 0 && (
              <div className="space-y-2 pt-2 border-t hairline text-xs">
                {tgBots.map((b) => (
                  <div key={b.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between">
                    <span>@{b.bot_username} · {b.signal_channel_id}</span>
                    <button
                      type="button"
                      onClick={() => void apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' }).then(loadConnections)}
                      className="text-loss hover:opacity-75"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t hairline flex items-center justify-between text-xs">
              <span className="text-dim">{isFa ? 'دریافت کد اتصال سریع در چت تلگرام:' : 'Quick Telegram Account Link:'}</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await apiFetch<{ code: string; command: string }>('/api/auth/telegram-link-code', { method: 'POST' });
                  setLinkCode(res);
                }}
                className="btn-ghost px-3 py-1.5 rounded-xl font-bold"
              >
                {isFa ? 'ساخت کد اتصال' : 'Generate Code'}
              </button>
            </div>
            {linkCode && (
              <div dir="ltr" className="surface-soft rounded-xl p-2.5 text-center font-mono text-xs text-jade font-bold">
                {linkCode.command}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'exchanges' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Active Connections */}
          <div className="panel rounded-[26px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-main">{isFa ? 'حساب‌های متصل شما' : 'Connected Accounts'}</h3>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-jade">
                <BrainCircuit className="w-3.5 h-3.5" />
                {isFa ? 'AI مرکزی پلتفرم فعال است' : 'Platform Multi-AI Online'}
              </span>
            </div>

            <div className="space-y-2.5">
              {exchanges.map((c) => (
                <div key={c.id} className="surface-soft rounded-2xl p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-main">{c.label || c.provider.toUpperCase()}</span>
                      {c.is_active === 1 && <span className="px-2 py-0.5 rounded-full badge-signal text-[10px] font-black">{isFa ? 'فعال' : 'ACTIVE'}</span>}
                    </div>
                    <p dir="ltr" className="font-mono text-[11px] text-dim mt-0.5">{c.api_key_masked} · {c.last_test_status}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.is_active !== 1 && (
                      <button type="button" onClick={() => void activateExchange(c.id)} className="btn-gold px-3 py-1.5 rounded-xl text-[11px]">
                        {isFa ? 'فعال‌سازی' : 'Activate'}
                      </button>
                    )}
                    {c.provider !== 'paper' && (
                      <button
                        type="button"
                        onClick={() => void apiFetch(`/api/connections/exchanges/${c.id}/test`, { method: 'POST' }).then((r) => {
                          const d = r as { ok: boolean; message: string };
                          flash(`${d.ok ? '✅' : '⚠️'} ${d.message}`);
                        })}
                        className="btn-ghost p-2 rounded-xl"
                        title="Test"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Simplified 2-Step Exchange Connect Form */}
          <form onSubmit={addExchange} className="panel rounded-[26px] p-5 space-y-3 text-xs">
            <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'افزودن صرافی واقعی (Toobit / KCEX)' : 'Connect Exchange API'}</span>
            </h3>
            <p className="text-dim leading-relaxed">
              {isFa
                ? 'فقط دسترسی «معامله Futures» را فعال کنید — گزینه برداشت (Withdraw) حتماً خاموش بماند.'
                : 'Use Trade-Only Futures API keys — never enable withdrawal permissions.'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(['toobit', 'kcex'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setExForm((f) => ({ ...f, provider: p }))}
                  className={`py-2.5 rounded-xl font-black uppercase ${exForm.provider === p ? 'btn-gold' : 'btn-ghost text-dim'}`}
                >
                  {p === 'toobit' ? 'Toobit Futures' : 'KCEX (0% Maker)'}
                </button>
              ))}
            </div>

            <input
              value={exForm.label}
              onChange={(e) => setExForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={isFa ? 'نام دلخواه (مثلاً حساب اصلی)' : 'Account Label'}
              className="field"
            />
            <input
              value={exForm.apiKey}
              onChange={(e) => setExForm((f) => ({ ...f, apiKey: e.target.value }))}
              required
              dir="ltr"
              placeholder="API Key"
              className="field font-mono"
            />
            <input
              type="password"
              value={exForm.apiSecret}
              onChange={(e) => setExForm((f) => ({ ...f, apiSecret: e.target.value }))}
              required
              dir="ltr"
              placeholder="API Secret"
              className="field font-mono"
            />

            <button
              type="button"
              onClick={() => setShowAdvancedEx((v) => !v)}
              className="inline-flex items-center gap-1 text-dim hover:text-main font-bold"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedEx ? 'rotate-180' : ''}`} />
              <span>{isFa ? 'تنظیمات پیشرفته شبکه (پروکسی / سشن وب)' : 'Advanced Proxy / Web Session'}</span>
            </button>

            {showAdvancedEx && (
              <div className="space-y-2 pt-1">
                {exForm.provider === 'kcex' && (
                  <input
                    value={exForm.webSessionToken}
                    onChange={(e) => setExForm((f) => ({ ...f, webSessionToken: e.target.value }))}
                    dir="ltr"
                    placeholder="KCEX Web Token (optional)"
                    className="field font-mono"
                  />
                )}
                <input
                  value={exForm.proxyUrl}
                  onChange={(e) => setExForm((f) => ({ ...f, proxyUrl: e.target.value }))}
                  dir="ltr"
                  placeholder="https://your-relay.vercel.app (optional)"
                  className="field font-mono"
                />
              </div>
            )}

            <button type="submit" className="btn-emerald w-full py-3 rounded-xl text-xs font-black">
              {isFa ? 'ذخیره رمزنگاری‌شده و تست اتصال' : 'Encrypt & Test Connection'}
            </button>
          </form>
        </div>
      )}

      {tab === 'risk' && (
        <div className="panel rounded-[26px] p-5 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-lg text-main flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-jade" />
                <span>{isFa ? 'قوانین سپر ریسک ربات' : 'Automated Risk Engine'}</span>
              </h3>
              <p className="text-xs text-dim mt-0.5">
                {isFa ? 'کنترل‌های قطعی برای جلوگیری از ضرر سنگین و مدیریت هوشمند سود.' : 'Hard exposure rules enforced on every autonomous & manual order.'}
              </p>
            </div>
            <button type="button" onClick={() => void saveRisk()} className="btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              <span>{isFa ? 'ذخیره قوانین ریسک' : 'Save Risk Rules'}</span>
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              { l: isFa ? `حجم هر معامله: ${riskForm.margin_pct}%` : `Margin/Trade: ${riskForm.margin_pct}%`, min: 1, max: 50, val: riskForm.margin_pct, set: (v: number) => setRiskForm((f) => ({ ...f, margin_pct: v })) },
              { l: isFa ? `سقف اهرم: ${riskForm.max_leverage}×` : `Max Leverage: ${riskForm.max_leverage}×`, min: 1, max: 50, val: riskForm.max_leverage, set: (v: number) => setRiskForm((f) => ({ ...f, max_leverage: v })) },
              { l: isFa ? `معاملات همزمان: ${riskForm.max_open_positions}` : `Max Open: ${riskForm.max_open_positions}`, min: 1, max: 20, val: riskForm.max_open_positions, set: (v: number) => setRiskForm((f) => ({ ...f, max_open_positions: v })) },
              { l: isFa ? `سقف ضرر روزانه: ${riskForm.daily_max_loss_pct}%` : `Daily Max Loss: ${riskForm.daily_max_loss_pct}%`, min: 1, max: 25, val: riskForm.daily_max_loss_pct, set: (v: number) => setRiskForm((f) => ({ ...f, daily_max_loss_pct: v })) },
            ].map((s) => (
              <div key={s.l} className="surface-soft rounded-2xl p-4 space-y-2.5">
                <p className="font-bold text-main">{s.l}</p>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  value={s.val}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className="w-full"
                  style={{ ['--fill' as string]: `${((s.val - s.min) / (s.max - s.min)) * 100}%` }}
                />
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { k: 'trailing_stop_enabled' as const, l: isFa ? 'تریلینگ استاپ (جمع‌آوری سود)' : 'Trailing Stop Protection' },
              { k: 'auto_breakeven_on_tp1' as const, l: isFa ? 'ریسک‌فری خودکار بعد از تارگت ۱' : 'Auto Break-Even on TP1' },
              { k: 'allow_auto_flip' as const, l: isFa ? 'چرخش خودکار در تغییر روند' : 'Auto-Flip on Reversal' },
              { k: 'block_weekends' as const, l: isFa ? 'توقف ترید در آخر هفته' : 'Block Weekends' },
              { k: 'macro_blackout' as const, l: isFa ? 'توقف هنگام اخبار CPI / FOMC' : 'Macro Blackout (CPI/FOMC)' },
            ].map((tog) => (
              <label key={tog.k} className="surface-soft rounded-2xl p-3.5 flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-bold text-main flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                  {tog.l}
                </span>
                <input
                  type="checkbox"
                  checked={riskForm[tog.k]}
                  onChange={(e) => setRiskForm((f) => ({ ...f, [tog.k]: e.target.checked }))}
                  className="w-4 h-4 accent-[#10d9a3]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
