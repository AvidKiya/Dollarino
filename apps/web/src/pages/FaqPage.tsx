import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export function FaqPage({ lang }: { lang: Lang }) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState<number | null>(0);

  const items = isFa
    ? [
        [
          'چطور در ۲ دقیقه با دلارینو شروع کنم؟',
          'پس از ثبت‌نام، اشتراک دلخواه خود را فعال کنید و سپس صرافی Toobit یا KCEX را متصل نمایید. در «حالت ساده» با یک دکمه ترید هوشمند اتومات با هوش مصنوعی روشن می‌شود؛ یا می‌توانید در «هوش مصنوعی من» استراتژی خودتان را با چت به AI یاد بدهید و در «کپی‌ترید تاییدشده» از تریدرهای منتخب کپی کنید.',
        ],
        [
          'پایانه و چارت AI چطور کار می‌کند؟',
          'در تب «پایانه و چارت AI» می‌توانید روی هر جفت‌ارز چارت زنده را ببینید، از هوش مصنوعی بخواهید سطوح حمایت، مقاومت، Entry، حد ضرر و ۳ تارگت را روی چارت بکشد و با یک کلیک آن‌ها را به فرم معامله منتقل کنید.',
        ],
        [
          'هوش مصنوعی من (My AI) چگونه کار می‌کند؟',
          'یک هوش مصنوعی خام در اختیار شماست؛ با گفتگوی ساده فارسی تایم‌فریم، اندیکاتورها (RSI، EMA، سوپرترند)، حد ضرر و سود دلخواه را به او یاد می‌دهید، روی کندل‌های واقعی تست می‌گیرید و برای ترید ۲۴ ساعته فعال می‌کنید.',
        ],
        [
          'آیا سرمایه من در صرافی‌های Toobit و KCEX امن است؟',
          'بله، سرمایه شما در حساب صرافی خودتان می‌ماند. کلیدهای API با استاندارد AES-256 رمزنگاری می‌شوند و تنها دسترسی معامله (بدون مجوز برداشت) نیاز دارند.',
        ],
      ]
    : [
        [
          'How do I start with Dollarino in 2 minutes?',
          'Sign up, activate a subscription plan, and pick Simple Automated AI Trading or teach your personal My AI agent, follow Verified Copy Traders, or run custom Pine Script & Python strategies.',
        ],
        [
          'How does Terminal & Chart AI work?',
          'In Terminal & Chart AI you get live candlesticks, Order Book depth, interactive AI chart analysis that plots Entry/SL/TP1–TP3 directly onto candles, and 1-click copy into the Order Ticket.',
        ],
        [
          'How does My Trainable AI work?',
          'Chat with your blank personal AI in plain language to define your indicators, timeframes, risk rules, and coins — preview a live market backtest and activate 24/7 execution.',
        ],
        [
          'Are my exchange funds safe?',
          'Yes. Funds never leave your Toobit or KCEX account. API credentials are encrypted with AES-256 and require Trade-Only access with zero withdrawal scope.',
        ],
      ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
          GUIDE & FAQ
        </p>
        <h2 className="font-display font-bold text-3xl text-main">
          {isFa ? 'راهنمای سریع و سوالات پرتکرار' : 'Quick Guide & FAQ'}
        </h2>
      </div>

      <div className="panel rounded-[26px] p-5 sm:p-6 space-y-3">
        {items.map(([q, a], idx) => {
          const isOpen = open === idx;
          return (
            <div key={q} className="rounded-2xl surface-soft overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : idx)}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-start font-bold text-xs sm:text-sm text-main"
              >
                <span>{q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <p className="px-4 pb-4 text-xs text-dim leading-relaxed">{a}</p>}
            </div>
          );
        })}
      </div>

      <div className="panel rounded-2xl p-4 flex items-center gap-3 text-xs text-dim">
        <ShieldCheck className="w-5 h-5 text-jade shrink-0" />
        <span>
          {isFa
            ? 'همیشه تنظیمات ریسک و اهرم را متناسب با سرمایه خود انتخاب کنید و برای هر سوال با پشتیبانی آنلاین در تماس باشید.'
            : 'Always size leverage conservatively according to your risk tolerance and contact Online Support anytime.'}
        </span>
      </div>
    </div>
  );
}
