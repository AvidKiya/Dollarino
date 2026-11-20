import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export function FaqPage({ lang }: { lang: Lang }) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState<number | null>(0);

  const items = isFa
    ? [
        [
          'چطور بدون ریسک و در ۲ دقیقه با دلارینو شروع کنم؟',
          'بلافاصله بعد از ورود، یک حساب دمو با $۱۰,۰۰۰ اعتبار رایگان و قیمت واقعی بازار در اختیارتان است. کافی است در بخش نمای کلی، موتور دلخواه (دُرّبین AI یا دُرنا V1) و ریسک را انتخاب کنید و دکمه «شروع خودکار ربات» را بزنید.',
        ],
        [
          'پایانه و چارت AI چطور کار می‌کند؟',
          'در تب «پایانه و چارت AI» می‌توانید روی هر جفت‌ارز چارت زنده را ببینید، از هوش مصنوعی بخواهید سطوح حمایت، مقاومت، Entry، حد ضرر و ۳ تارگت را روی چارت بکشد و با یک کلیک آن‌ها را به فرم معامله منتقل کنید.',
        ],
        [
          'برای استفاده از هوش مصنوعی دُرّبین باید کلید API بخرم؟',
          'خیر! هوش مصنوعی دلارینو (دُرّبین) به‌صورت مرکزی توسط پلتفرم مدیریت می‌شود و نیاز به هیچ کلید شخصی LLM ندارید.',
        ],
        [
          'آیا سرمایه من در صرافی‌های Toobit و KCEX امن است؟',
          'بله، سرمایه شما در حساب صرافی خودتان می‌ماند. کلیدهای API با استاندارد AES-256 رمزنگاری می‌شوند و تنها دسترسی معامله (بدون مجوز برداشت) نیاز دارند.',
        ],
        [
          'فرق ۴ پوسته ظاهری برنامه چیست؟',
          'از آیکون پالت در بالای صفحه می‌توانید بین ۴ ظاهر کبالت کیهانی، کاغذ روشن ادیتوریال، اُبسیدیان طلایی و سیگنال نیمه‌شب سوییچ کنید.',
        ],
      ]
    : [
        [
          'How do I start safely with zero capital at risk?',
          'Every account launches with a $10,000 Paper Demo running against live exchange quotes. Pick an engine and risk preset in Overview and click Start Auto-Trading.',
        ],
        [
          'How does Terminal & Chart AI work?',
          'In Terminal & Chart AI you get live candlesticks, Order Book depth, interactive AI chart analysis that plots Entry/SL/TP1–TP3 directly onto candles, and 1-click copy into the Order Ticket.',
        ],
        [
          'Do I need personal OpenAI/Anthropic API keys?',
          'No — Dorrbin Multi-AI consensus is managed centrally by the platform.',
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
            ? 'حساب دمو برای تمرین است؛ هنگام اتصال به صرافی واقعی حتماً سطح ریسک متناسب با سرمایه خود را انتخاب کنید.'
            : 'Paper mode simulates live quotes risk-free; always size live leverage conservatively.'}
        </span>
      </div>
    </div>
  );
}
