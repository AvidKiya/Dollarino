import { useEffect, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  MessageSquare,
  Radar,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { DedicatedAiChatSurface } from '../components/FloatingAiChat';
import { CoinIcon } from '../components/CoinIcon';
import { SlidingSwitch } from '../components/ProDropdown';
import { SmoothSlider } from '../components/SmoothSlider';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, NavTab } from '../lib/types';
import { pushFloatingToast } from '../lib/toast';

type AiTab = 'chat' | 'models';

export function AiChatPage({
  lang,
  data,
  onRefresh,
  onNavigate,
  onSelectSymbolForTerminal,
}: {
  lang: Lang;
  data?: DashboardPayload | null;
  onRefresh?: () => Promise<void>;
  onNavigate: (tab: NavTab) => void;
  onSelectSymbolForTerminal: (symbol: string) => void;
}) {
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<AiTab>(() => {
    try {
      const saved = sessionStorage.getItem('dollarino_aichat_tab');
      if (saved === 'models' || saved === 'chat') {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return 'chat';
  });

  useEffect(() => {
    const clearTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem('dollarino_aichat_tab');
      } catch {
        /* ignore */
      }
    }, 450);
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail === 'models' || detail === 'chat') {
        setTab(detail);
        try {
          sessionStorage.removeItem('dollarino_aichat_tab');
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('dollarino:aichat-tab', handler);
    return () => {
      window.clearTimeout(clearTimer);
      window.removeEventListener('dollarino:aichat-tab', handler);
    };
  }, []);

  const cfg = data?.config;
  const [aiGate, setAiGate] = useState<boolean>(Boolean(cfg?.ai_gate_enabled));
  const [minConf, setMinConf] = useState<number>(Number(cfg?.ai_min_confidence ?? 70));
  const [scanScope, setScanScope] = useState<'ALL_MARKET' | 'TOP_COINS' | 'SINGLE'>(
    (cfg?.scan_scope as 'ALL_MARKET' | 'TOP_COINS' | 'SINGLE') || 'ALL_MARKET'
  );
  const [entryTf, setEntryTf] = useState<string>(cfg?.entry_timeframe || '15m');
  const [dirMode, setDirMode] = useState<'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'>(
    (cfg?.direction_mode as 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY') || 'BOTH'
  );
  const [autoFlip, setAutoFlip] = useState<boolean>(Boolean(cfg?.allow_auto_flip));
  const [saving, setSaving] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResults, setScanResults] = useState<
    Array<{
      symbol: string;
      action: 'LONG' | 'SHORT' | 'SKIP';
      confidence: number;
      entry: number;
      stopLoss: number;
      tp1: number;
      thesis: string;
    }>
  >([]);

  useEffect(() => {
    if (!cfg) return;
    setAiGate(Boolean(cfg.ai_gate_enabled));
    setMinConf(Number(cfg.ai_min_confidence ?? 70));
    setScanScope((cfg.scan_scope as 'ALL_MARKET' | 'TOP_COINS' | 'SINGLE') || 'ALL_MARKET');
    setEntryTf(cfg.entry_timeframe || '15m');
    setDirMode((cfg.direction_mode as 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY') || 'BOTH');
    setAutoFlip(Boolean(cfg.allow_auto_flip));
  }, [cfg]);

  const saveModelSettings = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ai_gate_enabled: aiGate ? 1 : 0,
          ai_min_confidence: minConf,
          scan_scope: scanScope,
          entry_timeframe: entryTf,
          direction_mode: dirMode,
          allow_auto_flip: autoFlip ? 1 : 0,
        }),
      });
      pushFloatingToast(
        isFa ? 'تنظیمات مدل هوش مصنوعی دلارینو ذخیره شد ✅' : 'Dollarino AI model settings saved ✅',
        'success'
      );
      if (onRefresh) await onRefresh();
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runLiveAiScan = async () => {
    setScanBusy(true);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        results?: Array<{
          symbol: string;
          action: 'LONG' | 'SHORT' | 'SKIP';
          confidence: number;
          entry: number;
          stopLoss: number;
          tp1: number;
          thesis: string;
        }>;
      }>('/api/trading/ai-scan-now', {
        method: 'POST',
        body: JSON.stringify({ autoExecute: false }),
      });
      setScanResults(res.results || []);
      pushFloatingToast(isFa ? 'اسکن لحظه‌ای مدل هوش مصنوعی کامل شد' : 'Live AI model scan complete', 'info');
    } catch (err) {
      pushFloatingToast(err instanceof Error ? err.message : 'AI scan failed', 'error');
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase inline-flex items-center gap-1" style={{ color: 'var(--gold)' }}>
            <Sparkles className="w-3 h-3" />
            DEDICATED MULTI-MODEL &amp; CHART VISION AI
          </p>
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
            {tab === 'models'
              ? isFa
                ? 'تنظیمات مدل هوش مصنوعی دلارینو'
                : 'Dollarino AI Model Settings'
              : isFa
                ? 'چت اختصاصی و تحلیل چارت با هوش مصنوعی'
                : 'Dollarino Dedicated AI Chat & Chart Vision'}
          </h2>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-2xl surface-soft border hairline">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              tab === 'chat' ? 'btn-cobalt text-white shadow-sm' : 'text-dim hover:text-main'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{isFa ? 'چت و تحلیل چارت AI' : 'AI Chat & Vision'}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('models')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition ${
              tab === 'models' ? 'btn-cobalt text-white shadow-sm' : 'text-dim hover:text-main'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isFa ? 'تنظیمات مدل مرکزی' : 'Model Settings'}</span>
          </button>
        </div>
      </div>

      {tab === 'models' ? (
        <div className="space-y-4 tab-enter">
          {/* Dorrbin Consensus Info Banner */}
          <div className="panel rounded-[26px] p-5 sm:p-6 border border-blue-500/30 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl btn-cobalt grid place-items-center shrink-0">
                  <BrainCircuit className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-bold text-base sm:text-lg text-main">
                      {isFa ? 'معماری اجماع چندمدلی دُرّبین (Dorrbin Consensus)' : 'Dorrbin Multi-LLM Consensus Core'}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-jade inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {data?.platformAI?.configured
                        ? isFa
                          ? 'مدیریت متمرکز فعال'
                          : 'Managed Consensus Active'
                        : isFa
                          ? 'آماده اجرا'
                          : 'Ready'}
                    </span>
                  </div>
                  <p className="text-xs text-sub mt-1 leading-relaxed">
                    {isFa
                      ? data?.platformAI?.effectiveModeLabelFa ||
                        'بدون نیاز به کلید API شخصی: تا ۳ مدل هوش مصنوعی همزمان ساختار بازار، مومنتوم، حجم و ریسک را امتیازدهی کرده و فقط معاملات با اجماع بالا تایید می‌شوند.'
                      : data?.platformAI?.effectiveModeLabelEn ||
                        'Zero personal API keys needed: multi-model AI consensus scores trend, liquidity, and invalidation before approving entries.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveModelSettings()}
                className="btn-gold px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? '...' : isFa ? 'ذخیره تنظیمات مدل' : 'Save Model Settings'}</span>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
              <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-main inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-jade" />
                    {isFa ? 'دروازه تایید اجباری AI' : 'Mandatory AI Gate'}
                  </span>
                  <SlidingSwitch
                    checked={aiGate}
                    onChange={setAiGate}
                    accent="emerald"
                    size="sm"
                    ariaLabel="Mandatory AI Gate"
                  />
                </div>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'وقتی روشن باشد، حتی سیگنال‌های استراتژی نیز پیش از اجرا توسط مدل هوش مصنوعی تایید می‌شوند.'
                    : 'When ON, strategy signals must also pass AI consensus confidence before opening.'}
                </p>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline">
                <div className="flex items-center justify-between">
                  <span className="font-black text-main">{isFa ? 'حداقل اطمینان ورود مدل' : 'Minimum AI Confidence'}</span>
                  <span dir="ltr" className="font-num font-black text-brand">{minConf}%</span>
                </div>
                <SmoothSlider min={50} max={95} value={minConf} onChange={setMinConf} dir="ltr" ariaLabel="Min AI Confidence" />
                <p className="text-[11px] text-dim">
                  {isFa ? 'توصیه بهینه و امن: ۶۸٪ تا ۷۵٪ برای حذف سیگنال‌های ضعیف.' : 'Optimal safe range: 68%–75% to filter weak setups.'}
                </p>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-main">{isFa ? 'چرخش هوشمند در تغییر روند' : 'Auto-Flip on Reversal'}</span>
                  <SlidingSwitch
                    checked={autoFlip}
                    onChange={setAutoFlip}
                    accent="cobalt"
                    size="sm"
                    ariaLabel="Auto-Flip"
                  />
                </div>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'اگر مدل AI تغییر جهت قطعی روند را تشخیص دهد، معامله قبلی بسته شده و جهت جدید بررسی می‌شود.'
                    : 'Allow AI to close opposite bias when market structure decisively reverses.'}
                </p>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                <label className="text-[11px] font-black text-dim block">{isFa ? 'دامنه اسکن بازار مدل' : 'Market Scan Scope'}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['ALL_MARKET', isFa ? 'کل بازار' : 'All Market'],
                    ['TOP_COINS', isFa ? 'ارز برتر' : 'Top Pairs'],
                    ['SINGLE', isFa ? 'تک‌نماد' : 'Single'],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setScanScope(v)}
                      className={`py-2 rounded-xl text-[11px] font-black transition ${
                        scanScope === v ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                <label className="text-[11px] font-black text-dim block">{isFa ? 'تایم‌فریم تحلیل مدل' : 'Model Analysis Timeframe'}</label>
                <div className="grid grid-cols-4 gap-1.5" dir="ltr">
                  {['5m', '15m', '1h', '4h'].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setEntryTf(tf)}
                      className={`py-2 rounded-xl text-[11px] font-mono-num font-black transition ${
                        entryTf === tf ? 'btn-cobalt text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                <label className="text-[11px] font-black text-dim block">{isFa ? 'جهت مجاز معاملات AI' : 'Allowed Trade Directions'}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['BOTH', isFa ? 'هر دو جهت' : 'Both'],
                    ['LONG_ONLY', isFa ? 'فقط لانگ' : 'Long Only'],
                    ['SHORT_ONLY', isFa ? 'فقط شورت' : 'Short Only'],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDirMode(v)}
                      className={`py-2 rounded-xl text-[11px] font-black transition ${
                        dirMode === v ? 'btn-emerald text-white' : 'bg-[var(--bg)]/60 text-sub hover:text-main'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Instant Live AI Scan Preview */}
          <div className="panel rounded-[26px] p-5 space-y-3 border hairline">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-main">
                  {isFa ? 'تست زنده خروجی مدل هوش مصنوعی روی بازار' : 'Test Live AI Consensus Output'}
                </h3>
                <p className="text-[11px] text-dim">
                  {isFa
                    ? 'همین لحظه خروجی مدل چندلایه دلارینو را روی جفت‌ارزهای اصلی ببینید یا در بخش چت از آن بپرسید.'
                    : 'Run a live consensus check across top pairs without executing trades.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={scanBusy}
                  onClick={() => void runLiveAiScan()}
                  className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Radar className={`w-3.5 h-3.5 ${scanBusy ? 'animate-spin' : ''}`} />
                  <span>{scanBusy ? '...' : isFa ? 'اسکن زنده مدل AI' : 'Run Live Model Scan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('chat')}
                  className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{isFa ? 'پرسش در چت AI' : 'Ask in AI Chat'}</span>
                </button>
              </div>
            </div>

            {scanResults.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2">
                {scanResults.map((r) => (
                  <div key={r.symbol} className="surface-soft rounded-2xl p-3.5 space-y-1.5 border hairline text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-black text-main">
                        <CoinIcon symbol={r.symbol} size={20} />
                        <span>{r.symbol.replace('USDT', '')}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          r.action === 'LONG'
                            ? 'bg-emerald-500/15 text-jade'
                            : r.action === 'SHORT'
                              ? 'bg-rose-500/15 text-loss'
                              : 'bg-black/10 dark:bg-white/10 text-dim'
                        }`}
                      >
                        {r.action} · {r.confidence}%
                      </span>
                    </div>
                    <p className="text-[11px] text-dim line-clamp-2">{r.thesis}</p>
                    {r.action !== 'SKIP' && (
                      <div className="flex items-center justify-between pt-1 text-[10px] font-num" dir="ltr">
                        <span className="text-main">EN ${r.entry} · SL ${r.stopLoss}</span>
                        <button
                          type="button"
                          onClick={() => onSelectSymbolForTerminal(r.symbol)}
                          className="text-brand font-black hover:underline"
                        >
                          {isFa ? 'پایانه' : 'Terminal'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <DedicatedAiChatSurface
          lang={lang}
          compact={false}
          currentSymbol={data?.config?.symbol || 'BTCUSDT'}
          activeTab="aichat"
          onNavigate={onNavigate}
          onSelectSymbolForTerminal={onSelectSymbolForTerminal}
        />
      )}
    </div>
  );
}
