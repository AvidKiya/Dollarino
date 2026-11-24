import { useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  CheckCircle2,
  Copy,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { tgHaptic } from '../lib/telegram';

interface TvAlertRow {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  indicator_id: string;
  direction_override: string;
  auto_trade: number;
  is_active: number;
  trigger_count: number;
  last_triggered_at: string | null;
}

interface TvTemplate {
  id: string;
  nameFa: string;
  nameEn: string;
  direction: string;
}

interface TvIndicatorMeta {
  id: string;
  nameFa: string;
  nameEn: string;
  category: string;
  pineRef: string;
}

export function TradingViewAlertsHub({
  lang,
  defaultSymbol = 'BTCUSDT',
  onRefresh,
}: {
  lang: Lang;
  defaultSymbol?: string;
  onRefresh?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [alerts, setAlerts] = useState<TvAlertRow[]>([]);
  const [templates, setTemplates] = useState<TvTemplate[]>([]);
  const [indicators, setIndicators] = useState<TvIndicatorMeta[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState('15m');
  const [indicatorId, setIndicatorId] = useState('RSI_OVERSOLD');
  const [autoTrade, setAutoTrade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [catFilter, setCatFilter] = useState<string>('ALL');

  const load = async () => {
    try {
      const res = await apiFetch<{
        ok: boolean;
        webhookUrl: string | null;
        alerts: TvAlertRow[];
        templates: TvTemplate[];
        indicators: TvIndicatorMeta[];
      }>('/api/webhook/alerts');
      setAlerts(res.alerts || []);
      setTemplates(res.templates || []);
      setIndicators(res.indicators || []);
      setWebhookUrl(res.webhookUrl || '');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createAlert = async () => {
    setBusy(true);
    setNotice('');
    try {
      await apiFetch('/api/webhook/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          timeframe,
          indicatorId,
          autoTrade,
          notifyTelegram: true,
        }),
      });
      tgHaptic('medium');
      setNotice(isFa ? 'آلرت رایگان با موفقیت ساخته شد و به ربات متصل است ✅' : 'Free TradingView Alert created and wired to your bot ✅');
      await load();
      await onRefresh?.();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const evaluateNow = async () => {
    setBusy(true);
    setNotice('');
    try {
      const res = await apiFetch<{ checked: number; triggered: number }>('/api/webhook/alerts/evaluate-now', {
        method: 'POST',
      });
      setNotice(
        isFa
          ? `${res.checked} آلرت روی دیتای زنده بازار بررسی شد — ${res.triggered} سیگنال فعال گردید.`
          : `Evaluated ${res.checked} live rules — ${res.triggered} triggered.`
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleAlert = async (row: TvAlertRow) => {
    await apiFetch(`/api/webhook/alerts/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !row.is_active }),
    });
    await load();
  };

  const deleteAlert = async (id: string) => {
    await apiFetch(`/api/webhook/alerts/${id}`, { method: 'DELETE' });
    await load();
  };

  const visibleIndicators = catFilter === 'ALL' ? indicators : indicators.filter((i) => i.category === catFilter);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="panel rounded-3xl p-5 flex flex-col md:flex-row items-center gap-4 border hairline">
        <img
          src="/images/transparent/tv-chart-3d.png"
          alt="TradingView Free Alerts"
          className="h-20 w-20 object-contain shrink-0"
        />
        <div className="flex-1 text-center md:text-start space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] text-[10px] font-black">
            <Sparkles className="w-3 h-3" />
            <span>{isFa ? '۱۰۰٪ رایگان · جایگزین اشتراک پولی TradingView' : '100% FREE · Zero Paid TradingView Plan Needed'}</span>
          </div>
          <h3 className="text-base sm:text-lg font-black text-main">
            {isFa ? 'آلرت‌ساز و اندیکاتورهای کامل TradingView متصل به ربات' : 'Free TradingView Indicators & Auto-Trade Alert Engine'}
          </h3>
          <p className="text-xs text-sub leading-relaxed">
            {isFa
              ? 'بدون نیاز به خرید اکانت Pro تریدینگ‌ویو: بین ۲۵+ اندیکاتور استاندارد (SuperTrend، Ichimoku، RSI، MACD، EMA، Bollinger، Keltner، ADX، VWAP، StochRSI) آلرت بسازید تا مستقیم در تلگرام و ربات اجرا شود، یا وب‌هوک رایگان شخصی خود را استفاده کنید.'
              : 'Create unlimited real-time indicator alerts across 25+ TradingView indicators routed directly to Telegram & Auto-Trade—or use your free personal TradingView webhook URL.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void evaluateNow()}
          className="px-4 py-2.5 rounded-2xl bg-[#0D47A1] hover:bg-[#1565C0] text-white text-xs font-black inline-flex items-center gap-1.5 shrink-0"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isFa ? 'بررسی زنده الان' : 'Scan Live Alerts'}</span>
        </button>
      </div>

      {/* Free Webhook URL Box */}
      {webhookUrl && (
        <div className="panel rounded-3xl p-4 border hairline space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-black text-main">
              {isFa ? '🔗 لینک وب‌هوک رایگان TradingView شخصی شما (متصل به اتوترید و تایید دستی):' : '🔗 Your Free Personal TradingView Webhook URL:'}
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(webhookUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#059669] text-white text-[11px] font-black inline-flex items-center gap-1"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی لینک' : 'Copy URL'}</span>
            </button>
          </div>
          <code dir="ltr" className="block w-full rounded-xl px-3 py-2 surface-soft text-[11px] font-mono text-main break-all">
            {webhookUrl}
          </code>
        </div>
      )}

      {/* Create Free Indicator Alert */}
      <div className="panel rounded-3xl p-5 border hairline space-y-4">
        <p className="text-sm font-black text-main flex items-center gap-2">
          <BellRing className="w-4 h-4 text-[#F59E0B]" />
          <span>{isFa ? 'ساخت آلرت جدید اندیکاتور (اجرای اتومات هر ۵ دقیقه روی کلود)' : 'Create Free Indicator Alert'}</span>
        </p>

        <div className="grid sm:grid-cols-4 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'نماد ارز' : 'Symbol'}</label>
            <select
              dir="ltr"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="input-pro w-full rounded-xl px-3 py-2 text-xs font-bold"
            >
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'TONUSDT', 'AVAXUSDT'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'تایم‌فریم' : 'Timeframe'}</label>
            <select
              dir="ltr"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="input-pro w-full rounded-xl px-3 py-2 text-xs font-bold"
            >
              {['5m', '15m', '30m', '1h', '4h'].map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'شرط اندیکاتور TradingView' : 'Indicator Condition'}</label>
            <select
              value={indicatorId}
              onChange={(e) => setIndicatorId(e.target.value)}
              className="input-pro w-full rounded-xl px-3 py-2 text-xs font-bold"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {isFa ? t.nameFa : t.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-main cursor-pointer">
            <input
              type="checkbox"
              checked={autoTrade}
              onChange={(e) => setAutoTrade(e.target.checked)}
              className="w-4 h-4 accent-[#0D47A1]"
            />
            <span>{isFa ? 'اجرای خودکار معامله + ارسال به تلگرام هنگام فعال شدن آلرت' : 'Auto-execute trade + Telegram notification on trigger'}</span>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createAlert()}
            className="px-5 py-2.5 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isFa ? 'افزودن آلرت رایگان' : 'Add Free Alert'}</span>
          </button>
        </div>

        {notice && (
          <div className="rounded-2xl px-4 py-2.5 bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-main">
            {notice}
          </div>
        )}

        {/* Active Alerts List */}
        {alerts.length > 0 && (
          <div className="space-y-2 pt-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-2xl p-3 surface-soft border hairline flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs font-black text-main">
                    {a.is_active ? '🟢' : '⏸️'} {a.name}
                  </p>
                  <p className="text-[11px] text-dim mt-0.5" dir="ltr">
                    {a.symbol} · {a.timeframe} · {a.indicator_id} · Triggers: {a.trigger_count}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void toggleAlert(a)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-bold ${
                      a.is_active ? 'bg-amber-500/20 text-main' : 'bg-[#059669] text-white'
                    }`}
                  >
                    {a.is_active ? (isFa ? 'توقف' : 'Pause') : isFa ? 'فعال' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAlert(a.id)}
                    className="p-1.5 rounded-xl bg-rose-500/15 text-loss hover:bg-rose-500 hover:text-white transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full 25+ TradingView Indicator Library Matrix */}
      <div className="panel rounded-3xl p-5 border hairline space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-main flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#3B82F6]" />
            <span>{isFa ? `کتابخانه کامل اندیکاتورهای استاندارد TradingView (${indicators.length} اندیکاتور فعال)` : `Full TradingView Standard Indicator Library (${indicators.length})`}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'TREND', 'MOMENTUM', 'VOLATILITY', 'VOLUME'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                  catFilter === cat ? 'bg-[#0D47A1] text-white' : 'surface-soft text-dim hover:text-main'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {visibleIndicators.map((ind) => (
            <div key={ind.id} className="rounded-2xl p-3 surface-soft border hairline flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-main truncate">{isFa ? ind.nameFa : ind.nameEn}</p>
                <p dir="ltr" className="text-[10px] font-mono text-dim">{ind.pineRef} · {ind.category}</p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-[#059669] dark:text-[#34D399] font-black shrink-0">
                FREE
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
