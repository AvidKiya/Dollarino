import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  Check,
  Code2,
  Layers,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Waves,
  X,
} from 'lucide-react';
import { SAMPLE_CUSTOM_STRATEGIES, type SampleCustomStrategy } from '@dollarino/core';
import type { Lang } from '../../lib/i18n';
import {
  TV_INDICATOR_CATALOG,
  type ActiveTvIndicator,
  type TvIndicatorDef,
} from '../../lib/tv-indicators';

type ModalTab = 'ALL' | 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'VOLUME' | 'PINE_TEMPLATES';

export function IndicatorsModal({
  open,
  lang,
  activeIndicators,
  onAddIndicator,
  onRemoveIndicatorById,
  onRunPineSample,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  activeIndicators: ActiveTvIndicator[];
  onAddIndicator: (def: TvIndicatorDef) => void;
  onRemoveIndicatorById: (id: string) => void;
  onRunPineSample: (sample: SampleCustomStrategy) => void;
  onClose: () => void;
}) {
  const isFa = lang === 'fa';
  const [tab, setTab] = useState<ModalTab>('ALL');
  const [query, setQuery] = useState('');

  const filteredIndicators = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TV_INDICATOR_CATALOG.filter((item) => {
      if (tab !== 'ALL' && tab !== 'PINE_TEMPLATES' && item.category !== tab) return false;
      if (!q) return true;
      return (
        item.nameEn.toLowerCase().includes(q) ||
        item.nameFa.toLowerCase().includes(q) ||
        item.shortName.toLowerCase().includes(q) ||
        item.pineRef.toLowerCase().includes(q) ||
        item.descriptionEn.toLowerCase().includes(q) ||
        item.descriptionFa.toLowerCase().includes(q)
      );
    });
  }, [tab, query]);

  const filteredSamples = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_CUSTOM_STRATEGIES.filter((s) => {
      if (!q) return true;
      return (
        s.nameEn.toLowerCase().includes(q) ||
        s.nameFa.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.descriptionEn.toLowerCase().includes(q) ||
        s.descriptionFa.toLowerCase().includes(q)
      );
    });
  }, [query]);

  if (!open || typeof document === 'undefined') return null;

  const tabs: Array<{ id: ModalTab; labelFa: string; labelEn: string; icon: typeof TrendingUp }> = [
    { id: 'ALL', labelFa: `همه (${TV_INDICATOR_CATALOG.length})`, labelEn: `All (${TV_INDICATOR_CATALOG.length})`, icon: Layers },
    { id: 'TREND', labelFa: 'روند و میانگین', labelEn: 'Trend', icon: TrendingUp },
    { id: 'MOMENTUM', labelFa: 'اسیلاتورها', labelEn: 'Oscillators', icon: Activity },
    { id: 'VOLATILITY', labelFa: 'نوسان و باندها', labelEn: 'Volatility', icon: Waves },
    { id: 'VOLUME', labelFa: 'حجم و VWAP', labelEn: 'Volume', icon: BarChart3 },
    { id: 'PINE_TEMPLATES', labelFa: `قالب‌های Pine v6 (${SAMPLE_CUSTOM_STRATEGIES.length})`, labelEn: `Pine v6 Scripts (${SAMPLE_CUSTOM_STRATEGIES.length})`, icon: Code2 },
  ];

  return createPortal(
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[210] bg-black/75 backdrop-blur-sm grid place-items-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="pop-in panel !bg-[var(--panel)] rounded-[28px] w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden border hairline shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b hairline flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--gold)]/15 border border-[var(--gold)]/35 grid place-items-center text-[var(--gold)] font-serif italic font-black text-base">
              fx
            </div>
            <div>
              <h3 className="font-display font-bold text-base sm:text-lg text-main">
                {isFa ? 'کتابخانه اندیکاتورها و اسکریپت‌های TradingView' : 'Indicators, Metrics & Pine v6 Scripts'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa
                  ? 'افزودن آنی اندیکاتورهای تکنیکال روی چارت اصلی یا پنل‌های مجزا (Sub-Pane) — کاملاً Client-side و بدون تاخیر'
                  : 'Instant TradingView technical indicators on overlay or separate sub-panes — zero latency.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl surface-soft grid place-items-center text-dim hover:text-main transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Category Filter */}
        <div className="px-5 pt-3.5 pb-2 space-y-3 border-b hairline bg-[var(--soft)]/40">
          <div className="relative">
            <Search className="w-4 h-4 text-dim absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isFa
                  ? 'جستجوی اندیکاتور یا اسکریپت (مثلاً: RSI, Ichimoku, SuperTrend, بولینگر, MACD...)'
                  : 'Search indicators or Pine scripts (e.g. RSI, Ichimoku, SuperTrend, Bollinger, MACD)...'
              }
              className="field ps-10 py-2.5 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5 shrink-0 transition ${
                    active ? 'btn-gold shadow-xs' : 'surface-soft text-dim hover:text-main'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isFa ? t.labelFa : t.labelEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
          {tab === 'PINE_TEMPLATES' ? (
            filteredSamples.length === 0 ? (
              <div className="py-12 text-center text-xs text-dim">
                {isFa ? 'اسکریپتی با این عبارت یافت نشد.' : 'No matching Pine scripts found.'}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {filteredSamples.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onRunPineSample(s);
                      onClose();
                    }}
                    className="p-3.5 rounded-2xl surface-soft border hairline hover:border-[var(--gold)] text-start transition group space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-main group-hover:text-[var(--gold)] transition line-clamp-1">
                        {isFa ? s.nameFa : s.nameEn}
                      </span>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full badge-signal uppercase shrink-0">
                        {s.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-dim line-clamp-2">{isFa ? s.descriptionFa : s.descriptionEn}</p>
                    <div className="flex items-center justify-between pt-1 text-[10px] font-bold text-brand">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {isFa ? 'اجرا و باز کردن در Pine Editor' : 'Run & Open in Pine Editor'}
                      </span>
                      <span className="uppercase">{s.language}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : filteredIndicators.length === 0 ? (
            <div className="py-12 text-center text-xs text-dim">
              {isFa ? 'اندیکاتوری با این نام پیدا نشد.' : 'No indicators matched your query.'}
            </div>
          ) : (
            filteredIndicators.map((def) => {
              const count = activeIndicators.filter((a) => a.id === def.id).length;
              return (
                <div
                  key={def.id}
                  className="p-3 rounded-2xl surface-soft border hairline hover:border-[var(--gold)]/60 transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: def.defaultColor }}
                      />
                      <span className="text-xs font-black text-main">
                        {isFa ? def.nameFa : def.nameEn}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10 text-dim">
                        {def.pineRef}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          def.overlay ? 'bg-sky-500/15 text-sky-400' : 'bg-purple-500/15 text-purple-400'
                        }`}
                      >
                        {def.overlay ? (isFa ? 'روی چارت' : 'Overlay') : isFa ? 'پنل مجزا' : 'Sub-Pane'}
                      </span>
                      {count > 0 && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-jade/15 text-jade inline-flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          {count}× {isFa ? 'فعال' : 'Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-dim ps-4">
                      {isFa ? def.descriptionFa : def.descriptionEn}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {count > 0 && (
                      <button
                        type="button"
                        onClick={() => onRemoveIndicatorById(def.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-loss text-[11px] font-bold transition"
                      >
                        {isFa ? 'حذف' : 'Remove'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddIndicator(def)}
                      className="btn-gold px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{count > 0 ? (isFa ? 'نمونه دیگر' : 'Add Another') : isFa ? 'افزودن' : 'Add'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
