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
🔔 Price: 91200
------------------------------------------------
⛔️ Stop: 90100
------------------------------------------------
🔘 Leverage: 10
------------------------------------------------
🟢 TP1: 92400
🟡 TP2: 93600
🟠 TP3: 94800
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
      const res = await apiFetch<{ username: string; webhookConfigured: boolean }>('/api/connections/telegram-bots', {
        method: 'POST',
        body: JSON.stringify({ botToken: tgToken, signalChannelId: tgChannel }),
      });
      setTgToken('');
      setStatusMsg(
        isFa
          ? `ربات @${res.username} متصل شد! کافیست ربات را در کانال ${tgChannel} ادمین کنید تا پیام‌ها خودکار خوانده شوند.`
          : `Bot @${res.username} connected! Add it as admin to ${tgChannel} to copy signals automatically.`
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
      {/* Header Banner */}
      <div className="card-tt p-5 sm:p-6 bg-gradient-to-br from-[#0e1526] to-[#0a0f1c] border-[#4b73f5]/35 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#4b73f5]/15 border border-[#4b73f5]/40 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-[#4b73f5]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white">
              {isFa ? 'کپی‌ترید هوشمند کانال تلگرام (Copy-Trade)' : 'Telegram Channel Copy-Trade'}
            </h1>
            <p className="text-xs text-[#8f99aa] mt-0.5">
              {isFa
                ? 'ربات کانال تلگرام شما را ۲۴ ساعته رصد می‌کند و سیگنال‌ها را با فرمت اختصاصی شما روی Toobit، KCEX یا حساب دمو اجرا می‌نماید.'
                : 'Monitors your Telegram channel 24/7 and executes your signal format automatically on Toobit, KCEX, or Paper Demo.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!entitlement?.allowCopyTrade && (
            <button
              onClick={onOpenSubscription}
              className="px-4 py-2 rounded-xl bg-[#f59f14] hover:bg-[#e08e0c] text-[#080a0e] text-xs font-bold"
            >
              {isFa ? 'فعال‌سازی با خرید اشتراک Pro' : 'Unlock Auto Copy-Trade (Pro)'}
            </button>
          )}
          <div className="inline-flex rounded-xl bg-[#080a0e] border border-[#1d2433] p-1 text-xs">
            <button
              onClick={() => void saveChannelSettings('AUTO')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                mode === 'AUTO' ? 'bg-[#27cd86] text-[#080a0e]' : 'text-[#8f99aa] hover:text-white'
              }`}
            >
              {isFa ? 'اجرای خودکار' : 'Auto Execute'}
            </button>
            <button
              onClick={() => void saveChannelSettings('MANUAL_CONFIRM')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                mode === 'MANUAL_CONFIRM' ? 'bg-[#4b73f5] text-white' : 'text-[#8f99aa] hover:text-white'
              }`}
            >
              {isFa ? 'تایید دستی در تلگرام' : 'Manual Confirm'}
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 text-xs text-[#d6e2ff]">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Telegram BotFather & Channel Connection */}
        <div className="lg:col-span-5 card-tt p-5 space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#27cd86]" />
            <h2 className="font-bold text-sm text-white">
              {isFa ? '۱. اتصال بات تلگرام و کانال سیگنال' : '1. Connect Telegram Bot & Channel'}
            </h2>
          </div>

          <p className="text-[#8f99aa] leading-relaxed">
            {isFa
              ? 'توکن ربات BotFather را وارد کنید و ربات را به عنوان ادمین در کانال سیگنال خود اضافه کنید. هر پیامی که با فرمت سیگنال ارسال شود بلافاصله پردازش می‌شود.'
              : 'Paste your BotFather token and add the bot as an admin inside your signal channel.'}
          </p>

          {tgBots.map((b) => (
            <div key={b.id} className="p-3 rounded-xl bg-[#0b0e14] border border-[#27cd86]/35 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#27cd86]" />
                <div>
                  <div className="font-bold text-white">@{b.bot_username}</div>
                  <div className="text-[11px] text-[#6c7689]">{b.signal_channel_id || tgChannel}</div>
                </div>
              </div>
              <button
                onClick={async () => {
                  await apiFetch(`/api/connections/telegram-bots/${b.id}`, { method: 'DELETE' });
                  await loadBots();
                }}
                className="p-1.5 text-[#eb493d] hover:bg-[#eb493d]/10 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <form onSubmit={connectTgBot} className="space-y-3">
            <div>
              <label className="text-[#8f99aa] block mb-1">{isFa ? 'توکن ربات تلگرام (BotFather)' : 'BotFather Token'}</label>
              <input
                required
                dir="ltr"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="123456789:ABCdefGHI..."
                className="w-full bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num text-white"
              />
            </div>
            <div>
              <label className="text-[#8f99aa] block mb-1">{isFa ? 'آیدی کانال سیگنال' : 'Channel Handle / ID'}</label>
              <input
                dir="ltr"
                value={tgChannel}
                onChange={(e) => setTgChannel(e.target.value)}
                placeholder="@YourSignalChannel"
                className="w-full bg-[#080a0e] border border-[#222836] rounded-xl px-3 py-2.5 font-mono-num text-white"
              />
            </div>
            <button
              disabled={loading}
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#4b73f5] hover:bg-[#3d63e0] text-white font-bold inline-flex items-center justify-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isFa ? 'اتصال بات کپی‌ترید' : 'Connect Copy-Trade Bot'}</span>
            </button>
          </form>

          <div className="pt-3 border-t border-[#181d28] space-y-2">
            <div className="text-[11px] text-[#8f99aa]">
              {isFa ? 'لینک وب‌هوک اختصاصی TradingView / ربات:' : 'Personal TradingView / Signal Webhook URL:'}
            </div>
            <div className="flex items-center gap-2">
              <input readOnly dir="ltr" value={webhookUrl} className="flex-1 bg-[#080a0e] border border-[#222836] rounded-lg px-2.5 py-2 font-mono-num text-[11px] text-[#9aa5b5]" />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(webhookUrl);
                  setStatusMsg(isFa ? 'لینک وب‌هوک کپی شد.' : 'Webhook URL copied.');
                }}
                className="p-2 rounded-lg bg-[#161b26] hover:bg-[#202736] text-white"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Interactive Signal Format Tester & Executor */}
        <div className="lg:col-span-7 card-tt p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4b73f5]" />
              <span>{isFa ? '۲. تست و اجرای فرمت سیگنال کانال شما' : '2. Test & Execute Your Channel Format'}</span>
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
                  className="px-2.5 py-1 rounded-lg bg-[#131823] hover:bg-[#1b2232] border border-[#222938] text-[11px] text-[#c5cede]"
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
            className="w-full bg-[#080a0e] border border-[#222836] rounded-xl p-3.5 font-mono-num text-xs text-white focus:border-[#4b73f5] outline-none"
            placeholder="Paste any signal text from your Telegram channel..."
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void parseOrExecuteSignal(false)}
              className="px-4 py-2.5 rounded-xl bg-[#161b26] hover:bg-[#1f2636] border border-[#273042] text-white font-semibold"
            >
              {isFa ? 'بررسی و پارس فرمت' : 'Preview & Parse Signal'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void parseOrExecuteSignal(true)}
              className="px-5 py-2.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-bold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isFa ? 'تست اجرای فوری سیگنال در حساب فعال' : 'Execute Signal Now'}</span>
            </button>
          </div>

          {parsedPreview && (
            <div className="p-4 rounded-xl bg-[#0b0e15] border border-[#27cd86]/35 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded font-bold font-mono-num ${
                      parsedPreview.direction === 'LONG' ? 'bg-[#27cd86]/20 text-[#27cd86]' : 'bg-[#eb493d]/20 text-[#eb493d]'
                    }`}
                  >
                    {parsedPreview.direction}
                  </span>
                  <span className="font-bold text-white font-mono-num text-sm">{parsedPreview.symbol}</span>
                  <span className="text-[#8f99aa] font-mono-num">({parsedPreview.timeframe}) · {parsedPreview.leverage}x</span>
                </div>
                <ShieldCheck className="w-4 h-4 text-[#27cd86]" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono-num text-[11px]">
                <div className="p-2 rounded-lg bg-[#111622]">
                  <span className="text-[#6c7689] block">ENTRY</span>
                  <b className="text-white">{parsedPreview.price}</b>
                </div>
                <div className="p-2 rounded-lg bg-[#eb493d]/10">
                  <span className="text-[#eb493d] block">STOP LOSS</span>
                  <b className="text-white">{parsedPreview.stopLoss}</b>
                </div>
                <div className="p-2 rounded-lg bg-[#27cd86]/10">
                  <span className="text-[#27cd86] block">TP 1</span>
                  <b className="text-white">{parsedPreview.tp1}</b>
                </div>
                <div className="p-2 rounded-lg bg-[#27cd86]/10">
                  <span className="text-[#27cd86] block">TP 2</span>
                  <b className="text-white">{parsedPreview.tp2 || '-'}</b>
                </div>
                <div className="p-2 rounded-lg bg-[#27cd86]/10">
                  <span className="text-[#27cd86] block">TP 3</span>
                  <b className="text-white">{parsedPreview.tp3 || '-'}</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Copy-Trade Signals Feed */}
      <div className="card-tt p-5 space-y-3 text-xs">
        <h3 className="font-bold text-sm text-white">
          {isFa ? 'تاریخچه سیگنال‌های دریافت‌شده و اجراشده' : 'Recent Copy-Trade Signals'}
        </h3>
        {recentSignals.length === 0 ? (
          <p className="text-[#6c7689] py-4 text-center">
            {isFa ? 'هنوز سیگنالی از کانال تلگرام یا تست دستی ثبت نشده است.' : 'No signals received yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentSignals.slice(0, 8).map((s) => (
              <div key={s.id} className="p-3 rounded-xl bg-[#0b0e15] border border-[#1a202c] flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-mono-num">
                    <span className={s.direction === 'LONG' ? 'text-[#27cd86] font-bold' : 'text-[#eb493d] font-bold'}>{s.direction}</span>
                    <span className="text-white font-bold">{s.symbol}</span>
                    <span className="text-[#8f99aa]">@{s.price}</span>
                  </div>
                  <div className="text-[10px] text-[#6c7689] mt-1">{s.source} · {s.created_at}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4b73f5]/15 text-[#9eb7ff]">
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
