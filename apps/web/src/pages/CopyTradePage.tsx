import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Copy,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { DollarinoSignal } from '@dollarino/core';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { UserEntitlement } from './SubscriptionPage';

const SAMPLE_SIGNALS = [
  {
    labelFa: 'فرمت رسمی کانال @Dollarinoofficial',
    labelEn: '@Dollarinoofficial Channel Format',
    text: `🟢 Buy signal
------------------------------------------------
💲 Symbol: BTCUSDT
------------------------------------------------
⌛️ Time Frame: 30
------------------------------------------------
🔔 Price: 62000
------------------------------------------------
⛔️ Stop: 60500
------------------------------------------------
🔘 Leverage: 10
------------------------------------------------
🟢 TP1: 63500
🟡 TP2: 65000
🟠 TP3: 66500
------------------------------------------------
🆔 @Dollarinoofficial`,
  },
  {
    labelFa: 'فرمت کوتاه #SOLUSDT',
    labelEn: 'Compact Channel Format',
    text: `🔴 SHORT #SOLUSDT | 15m
Entry: 198.50
SL: 203.00
TP1: 194.00
TP2: 189.50
Leverage: 5x`,
  },
];

interface TgBot {
  id: string;
  bot_username: string;
  bot_token_masked: string;
  signal_channel_id: string | null;
}

export function CopyTradePage({
  lang,
  webhookSecret,
  executionMode,
  channelHandle,
  recentSignals,
  entitlement,
  onExecuted,
  onOpenSubscription,
}: {
  lang: Lang;
  webhookSecret: string;
  executionMode: 'AUTO' | 'MANUAL_CONFIRM';
  channelHandle: string;
  recentSignals: Array<{
    id: string;
    source: string;
    symbol: string;
    direction: string;
    price: string;
    status: string;
    raw_text: string;
    created_at: string;
  }>;
  entitlement?: UserEntitlement;
  onExecuted: () => Promise<void>;
  onOpenSubscription: () => void;
}) {
  const isFa = lang === 'fa';
  const [tgBots, setTgBots] = useState<TgBot[]>([]);
  const [tgToken, setTgToken] = useState('');
  const [tgChannel, setTgChannel] = useState(channelHandle || '@Dollarinoofficial');
  const [mode, setMode] = useState<'AUTO' | 'MANUAL_CONFIRM'>(executionMode || 'AUTO');
  const [rawSignal, setRawSignal] = useState(SAMPLE_SIGNALS[0]!.text);
  const [parsedPreview, setParsedPreview] = useState<DollarinoSignal | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBots = async () => {
    const res = await apiFetch<{ bots: TgBot[] }>('/api/connections/telegram-bots').catch(() => ({ bots: [] }));
    setTgBots(res.bots);
  };

  useEffect(() => {
    void loadBots();
  }, []);

  const webhookUrl = `${window.location.origin}/api/webhook/tv/${webhookSecret}`;

  const saveChannelSettings = async (nextMode: 'AUTO' | 'MANUAL_CONFIRM') => {
    setMode(nextMode);
    await apiFetch('/api/trading/config', {
      method: 'PATCH',
      body: JSON.stringify({
        trade_execution_mode: nextMode,
        signal_channel_handle: tgChannel.trim() || '@Dollarinoofficial',
      }),
    });
    setStatusMsg(
      nextMode === 'AUTO'
        ? isFa ? 'حالت کپی‌ترید خودکار (AUTO) فعال شد.' : 'Auto Copy-Trade enabled.'
        : isFa ? 'حالت تایید دستی در تلگرام فعال شد.' : 'Manual Telegram Confirm enabled.'
    );
    await onExecuted();
  };

  const connectTgBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ username: string }>('/api/connections/telegram-bots', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
      });
      setTgToken('');
      setStatusMsg(
        isFa
          ? `ربات @${res.username} متصل شد! کافیست ربات را در کانال ${tgChannel} ادمین کنید.`
          : `Bot @${res.username} connected! Add it as admin to ${tgChannel}.`
      );
      await loadBots();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to connect Telegram bot');
    } finally {
      setLoading(false);
    }
  };

  const parseOrExecuteSignal = async (executeNow: boolean) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        parsed?: DollarinoSignal;
        tradeId?: string;
        error?: string;
      }>('/api/trading/signals/execute', {
        method: 'POST',
        body: JSON.stringify({ rawText: rawSignal, executeNow }),
      });
      if (res.parsed) setParsedPreview(res.parsed);
      if (executeNow) {
        setStatusMsg(
          res.ok
            ? isFa
              ? `سیگنال با موفقیت در ربات اجرا شد! (کد معامله: ${res.tradeId})`
              : `Signal executed successfully (${res.tradeId})!`
            : res.error || 'Execution rejected by risk engine'
        );
        await onExecuted();
      } else {
        setStatusMsg(isFa ? 'فرمت سیگنال با موفقیت شناسایی و پارس شد!' : 'Signal parsed cleanly!');
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not parse signal format');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="hero-cobalt p-6 text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-[#55ff94]" />
          </div>
          <div>
            <h1 className="text-lg font-black">
              {isFa ? 'کپی‌ترید' : 'Copy-Trade'}
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              {isFa
                ? 'تمام معاملات کانال تلگرام شما ۲۴ ساعته رصد و به‌صورت خودکار در حساب شما کپی می‌شوند.'
                : 'Monitors your Telegram signal channel 24/7 and mirrors trades automatically.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!entitlement?.allowCopyTrade && (
            <button
              onClick={onOpenSubscription}
              className="px-4 py-2 rounded-xl bg-[#FF8A00] hover:bg-[#e87c00] text-white text-xs font-extrabold"
            >
              {isFa ? 'فعال‌سازی با خرید اشتراک Pro' : 'Unlock Auto Copy-Trade (Pro)'}
            </button>
          )}
          <div className="inline-flex rounded-xl bg-black/25 p-1 text-xs">
            <button
              onClick={() => void saveChannelSettings('AUTO')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                mode === 'AUTO' ? 'bg-[#16E664] text-[#042310]' : 'text-white/80 hover:text-white'
              }`}
            >
              {isFa ? 'اجرای خودکار' : 'Auto Execute'}
            </button>
            <button
              onClick={() => void saveChannelSettings('MANUAL_CONFIRM')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                mode === 'MANUAL_CONFIRM' ? 'bg-white text-[#082475]' : 'text-white/80 hover:text-white'
              }`}
            >
              {isFa ? 'تایید دستی' : 'Manual Confirm'}
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="surface-card p-4 border-brand text-xs text-main font-semibold">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 surface-card p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-signal" />
            <h2 className="font-black text-sm text-main">
              {isFa ? '۱. اتصال بات تلگرام و کانال سیگنال' : '1. Connect Telegram Bot & Channel'}
            </h2>
          </div>

          <p className="text-sub leading-relaxed">
            {isFa
              ? 'توکن ربات BotFather را وارد کنید و ربات را به عنوان ادمین در کانال سیگنال خود اضافه کنید.'
              : 'Paste your BotFather token and add the bot as admin in your signal channel.'}
          </p>

          {tgBots.map((b) => (
            <div key={b.id} className="p-3 rounded-2xl surface-soft border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-signal" />
                <div>
                  <div className="font-extrabold text-main">@{b.bot_username}</div>
                  <div className="text-[11px] text-dim">{b.signal_channel_id || tgChannel}</div>
                </div>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' });
                  await loadBots();
                }}
                className="p-1.5 text-loss rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <form onSubmit={connectTgBot} className="space-y-3">
            <div>
              <label className="text-sub font-semibold block mb-1">{isFa ? 'توکن ربات تلگرام (BotFather)' : 'BotFather Token'}</label>
              <input
                required
                dir="ltr"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="123456789:ABCdefGHI..."
                className="w-full surface-input rounded-xl px-3 py-2.5 font-mono-num"
              />
            </div>
            <div>
              <label className="text-sub font-semibold block mb-1">{isFa ? 'آیدی کانال سیگنال' : 'Channel Handle / ID'}</label>
              <input
                dir="ltr"
                value={tgChannel}
                onChange={(e) => setTgChannel(e.target.value)}
                placeholder="@Dollarinoofficial"
                className="w-full surface-input rounded-xl px-3 py-2.5 font-mono-num"
              />
            </div>
            <button
              disabled={loading}
              type="submit"
              className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold inline-flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isFa ? 'اتصال بات کپی‌ترید' : 'Connect Copy-Trade Bot'}</span>
            </button>
          </form>

          <div className="pt-3 border-t space-y-2">
            <div className="text-[11px] text-sub font-semibold">
              {isFa ? 'لینک وب‌هوک اختصاصی:' : 'Personal Signal Webhook URL:'}
            </div>
            <div className="flex items-center gap-2">
              <input readOnly dir="ltr" value={webhookUrl} className="flex-1 surface-input rounded-xl px-3 py-2 font-mono-num text-[11px]" />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(webhookUrl);
                  setStatusMsg(isFa ? 'لینک وب‌هوک کپی شد.' : 'Webhook URL copied.');
                }}
                className="p-2.5 rounded-xl surface-soft border text-main"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 surface-card p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-sm text-main flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span>{isFa ? '۲. تست و اجرای فرمت سیگنال کانال شما' : '2. Test & Execute Channel Signal Format'}</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_SIGNALS.map((s) => (
                <button
                  key={s.labelEn}
                  type="button"
                  onClick={() => {
                    setRawSignal(s.text);
                    setParsedPreview(null);
                  }}
                  className="px-3 py-1 rounded-xl surface-soft border text-[11px] font-bold text-sub hover:text-main"
                >
                  {isFa ? s.labelFa : s.labelEn}
                </button>
              ))}
            </div>
          </div>

          <textarea
            dir="ltr"
            rows={7}
            value={rawSignal}
            onChange={(e) => setRawSignal(e.target.value)}
            className="w-full surface-input rounded-2xl p-3.5 font-mono-num text-xs outline-none focus:border-brand"
            placeholder="Paste any signal text from your Telegram channel..."
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void parseOrExecuteSignal(false)}
              className="px-4 py-2.5 rounded-xl surface-soft border text-main font-bold"
            >
              {isFa ? 'بررسی و پارس فرمت' : 'Preview & Parse'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void parseOrExecuteSignal(true)}
              className="px-5 py-2.5 rounded-xl btn-emerald font-extrabold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isFa ? 'تست اجرای فوری سیگنال' : 'Execute Signal Now'}</span>
            </button>
          </div>

          {parsedPreview && (
            <div className="p-4 rounded-2xl surface-soft border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg font-extrabold font-mono-num ${
                      parsedPreview.direction === 'LONG' ? 'bg-[#10D856]/15 text-signal' : 'bg-rose-500/15 text-loss'
                    }`}
                  >
                    {parsedPreview.direction}
                  </span>
                  <span className="font-black text-main font-mono-num text-sm">{parsedPreview.symbol}</span>
                  <span className="text-sub font-mono-num">({parsedPreview.timeframe}) · {parsedPreview.leverage}x</span>
                </div>
                <ShieldCheck className="w-4 h-4 text-signal" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono-num text-[11px]">
                <div className="p-2.5 rounded-xl surface-card">
                  <span className="text-dim block">ENTRY</span>
                  <b className="text-main">{parsedPreview.price}</b>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10">
                  <span className="text-loss block font-bold">STOP LOSS</span>
                  <b className="text-main">{parsedPreview.stopLoss}</b>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10D856]/10">
                  <span className="text-signal block font-bold">TP 1</span>
                  <b className="text-main">{parsedPreview.tp1}</b>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10D856]/10">
                  <span className="text-signal block font-bold">TP 2</span>
                  <b className="text-main">{parsedPreview.tp2 || '-'}</b>
                </div>
                <div className="p-2.5 rounded-xl bg-[#10D856]/10">
                  <span className="text-signal block font-bold">TP 3</span>
                  <b className="text-main">{parsedPreview.tp3 || '-'}</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="surface-card p-5 space-y-3 text-xs">
        <h3 className="font-black text-sm text-main">
          {isFa ? 'تاریخچه سیگنال‌های دریافت‌شده' : 'Recent Copy-Trade Signals'}
        </h3>
        {recentSignals.length === 0 ? (
          <p className="text-dim py-4 text-center">
            {isFa ? 'هنوز سیگنالی ثبت نشده است.' : 'No signals received yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentSignals.slice(0, 8).map((s) => (
              <div key={s.id} className="p-3.5 rounded-2xl surface-soft border flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-mono-num">
                    <span className={s.direction === 'LONG' ? 'text-signal font-bold' : 'text-loss font-bold'}>{s.direction}</span>
                    <span className="text-main font-bold">{s.symbol}</span>
                    <span className="text-sub">@{s.price}</span>
                  </div>
                  <div className="text-[11px] text-dim mt-1">{s.source} · {s.created_at}</div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold banner-cobalt-soft text-brand">
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
