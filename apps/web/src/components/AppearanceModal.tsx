import { Check, Moon, Palette, Sparkles, Sun, X, Zap } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export type LookId = 'obsidian' | 'paper' | 'cosmic' | 'midnight';

const LOOKS: Array<{
  id: LookId;
  icon: typeof Moon;
  bg: string;
  panel: string;
  accent: string;
  ink: string;
  lime: string;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
}> = [
  {
    id: 'cosmic',
    icon: Sparkles,
    bg: '#050a1a',
    panel: '#0a1328',
    accent: '#1f63ff',
    ink: '#f3f7fd',
    lime: '#16e664',
    titleFa: 'کبالت کیهانی',
    titleEn: 'Cosmic Cobalt',
    descFa: 'رنگ رسمی دلارینو · کبالت عمیق و سیگنال سبز',
    descEn: 'Official deep space cobalt & signal green',
  },
  {
    id: 'paper',
    icon: Sun,
    bg: '#f4f1ea',
    panel: '#fffdf7',
    accent: '#2f5bff',
    ink: '#10131a',
    lime: '#d9f73c',
    titleFa: 'کاغذ روشن ادیتوریال',
    titleEn: 'Editorial Paper',
    descFa: 'زمینه گرم روشن با کنتراست بالا برای روز',
    descEn: 'Warm daylight editorial desk with cobalt ink',
  },
  {
    id: 'obsidian',
    icon: Moon,
    bg: '#090b07',
    panel: '#151910',
    accent: '#e8c15a',
    ink: '#f5edd7',
    lime: '#d7f83c',
    titleFa: 'اُبسیدیان طلایی',
    titleEn: 'Obsidian Gold',
    descFa: 'مشکی مخملی لوکس با اکسنت طلایی گرم',
    descEn: 'Deep obsidian night with warm antique gold',
  },
  {
    id: 'midnight',
    icon: Zap,
    bg: '#070a12',
    panel: '#0d1220',
    accent: '#6d8bff',
    ink: '#eef2ff',
    lime: '#c9f24e',
    titleFa: 'سیگنال نیمه‌شب',
    titleEn: 'Midnight Signal',
    descFa: 'آبی نیمه‌شب با کنتراست ملایم و چارت واضح',
    descEn: 'Crisp indigo night tuned for long chart runs',
  },
];

export function AppearanceModal({
  open,
  lang,
  currentLook,
  onSelectLook,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  currentLook: LookId;
  onSelectLook: (look: LookId) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const isFa = lang === 'fa';

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm p-4 grid place-items-center overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="pop-in w-full max-w-3xl panel !bg-[var(--panel)] rounded-[30px] p-6 sm:p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-gold uppercase mb-2 flex items-center gap-2">
              <Palette className="w-3.5 h-3.5" />
              <span>FOUR SIGNATURE LOOKS</span>
            </p>
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-main">
              {isFa ? 'چهار ظاهر اختصاصی دلارینو' : 'Four Signature Looks'}
            </h2>
            <p className="text-xs sm:text-sm text-dim mt-2 max-w-xl">
              {isFa
                ? 'پوسته‌ای را انتخاب کنید که با چشمتان راحت‌تر است؛ تمام داشبورد و پایانه معاملات فوراً تغییر می‌کند.'
                : 'Pick the visual atmosphere that feels best — saved automatically across sessions.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 grid place-items-center rounded-full btn-ghost"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {LOOKS.map((l) => {
            const on = currentLook === l.id;
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onSelectLook(l.id)}
                aria-pressed={on}
                className={`text-start rounded-2xl p-2.5 transition hover:-translate-y-1 ${on ? 'ring-2 ring-gold' : ''}`}
                style={{ background: l.bg, border: `1px solid ${l.accent}44` }}
              >
                <div className="rounded-xl overflow-hidden" style={{ background: l.bg, border: `1px solid ${l.accent}22` }}>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: `${l.accent}22` }}>
                    <span
                      className="h-4 w-4 rounded-full grid place-items-center text-[6px] font-black"
                      style={{ background: l.accent, color: l.bg }}
                    >
                      D$
                    </span>
                    <span className="text-[7px] font-bold" style={{ color: l.ink }}>Dollarino.</span>
                    <span className="ms-auto h-1 w-6 rounded-full" style={{ background: l.accent }} />
                  </div>
                  <div className="p-2">
                    <p className="font-display font-bold text-[11px] leading-tight" style={{ color: l.ink }}>
                      {isFa ? (
                        <>
                          سه موتور.
                          <br />
                          <span style={{ background: l.lime, color: '#0b1405', borderRadius: 4, padding: '0 3px' }}>
                            یک میز.
                          </span>
                        </>
                      ) : (
                        <>
                          Every Market.
                          <br />
                          <span style={{ background: l.lime, color: '#0b1405', borderRadius: 4, padding: '0 3px' }}>
                            One Engine.
                          </span>
                        </>
                      )}
                    </p>
                    <div className="mt-2 rounded-lg p-2" style={{ background: l.panel, border: `1px solid ${l.accent}25` }}>
                      <p className="text-[5px]" style={{ color: l.ink, opacity: 0.55 }}>TOTAL EQUITY</p>
                      <p dir="ltr" className="font-num font-bold text-[11px]" style={{ color: l.ink }}>$12,480</p>
                      <svg viewBox="0 0 120 26" className="w-full mt-1">
                        <path
                          d="M0 24L14 19L24 22L38 15L48 17L60 10L72 13L86 6L100 9L120 1"
                          stroke={l.accent}
                          strokeWidth="1.8"
                          fill="none"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2.5 px-1">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: l.accent }} />
                  <span className="font-bold text-[11px] truncate" style={{ color: l.ink }}>
                    {isFa ? l.titleFa : l.titleEn}
                  </span>
                  {on && <Check className="w-3.5 h-3.5 ms-auto shrink-0" style={{ color: l.accent }} />}
                </div>
                <p className="text-[9px] mt-1 px-1 leading-relaxed" style={{ color: l.ink, opacity: 0.62 }}>
                  {isFa ? l.descFa : l.descEn}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <p className="text-[11px] text-dim flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-jade" />
            <span>{isFa ? 'ذخیره خودکار در مرورگر شما' : 'Saved automatically in your browser'}</span>
          </p>
          <button type="button" onClick={onClose} className="btn-gold text-xs sm:text-sm px-6 py-2.5 rounded-xl">
            {isFa ? 'عالیه، ادامه بده' : "Looks good. Let's go."}
          </button>
        </div>
      </div>
    </div>
  );
}
