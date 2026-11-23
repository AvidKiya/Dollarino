import { useState } from 'react';
import { ChevronDown, ShieldCheck, Sparkles } from 'lucide-react';
import type { Lang } from '../lib/i18n';

export function FaqPage({ lang }: { lang: Lang }) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState<number | null>(0);

  const tutorials = isFa
    ? [
        {
          img: '/images/smart-wallet-radar.png',
          badge: 'آموزش ۱ · کپی‌ترید هوشمند ولت‌ها V2',
          title: 'شکار نهنگ‌ها، باکس مارجین ایزوله و خزانه ۲۴/۷',
          steps: [
            '۱. در صفحه «کپی‌ترید و اتصال»، از لیست «۱۰ تریدر برتر» یا تب «ولت‌های دلخواه من» آدرس ولت را انتخاب کنید (فقط خریدهای بعد از فالو کپی می‌شوند).',
            '۲. با «تنظیم قوانین پرو» برای هر تریدر باکس سرمایه مستقل، سقف ضرر روزانه، TP1/2/3 + Moonbag، SL و Break-Even بگذارید و «بک‌تست ۷ روزه» بگیرید.',
            '۳. حالت اجرا را بین «Trust 1-Click» (تایید داخل تراست‌ولت شما) یا «خزانه ۲۴/۷» (سوآپ خودکار با کلید خصوصی قابل بک‌آپ) انتخاب کنید.',
          ],
        },
        {
          img: '/images/antirug-shield-dapp.png',
          badge: 'آموزش ۲ · سپر ضدراگ و Multi-DApp Trust Wallet',
          title: 'بررسی قرارداد توکن و سوآپ مستقیم در صرافی‌های DEX',
          steps: [
            '۱. در صفحه «DEX و تراست‌ولت» هر توکنی را جستجو کنید و دکمه «DAppهای شبکه + ضدراگ» را بزنید.',
            '۲. سپر ۳ منبعی (GoPlus + Honeypot.is + RugCheck) امتیاز امنیت ۰ تا ۹۵، مالیات خرید/فروش، مجوز Mint و قفل نقدینگی را نشان می‌دهد.',
            '۳. بهترین DEX همان شبکه (Jupiter، Uniswap، PancakeSwap، 1inch، STON.fi، SunSwap، Cetus) را با یک کلیک داخل مرورگر Trust Wallet باز کنید.',
          ],
        },
        {
          img: '/images/my-ai-brain.png',
          badge: 'آموزش ۳ · ۴ موتور معاملاتی + چت AI و چارت',
          title: 'هوش مصنوعی دلارینو، هوش مصنوعی من و استراتژی شکار',
          steps: [
            '۱. «هوش مصنوعی دلارینو» برای ترید کاملاً خودکار است و فقط با انتخاب سطح ریسک معامله می‌کند.',
            '۲. در تب «هوش مصنوعی من»، مثل چت معمولی به AI استراتژی و اندیکاتورهای خودتان را یاد بدهید تا دقیقاً مثل شما ترید کند.',
            '۳. از دکمه شناور پایین صفحه یا /ai در @Dollarino_bot عکس چارت بفرستید تا ورود، SL و ۳ تارگت استخراج شود.',
          ],
        },
        {
          img: '/images/exchange-api-hub.png',
          badge: 'آموزش ۴ · اتصال صرافی، اشتراک و کارت سود',
          title: 'اتصال Toobit / Bitunix / KCEX و صدور کارت سود تاییدشده',
          steps: [
            '۱. کلید API صرافی را فقط با دسترسی معامله (بدون مجوز برداشت) ثبت کنید؛ رمزنگاری AES-256 تضمین‌شده است.',
            '۲. با ثبت TXID واریز تتر TRC20 در صفحه اشتراک، اکانت شما به‌صورت خودکار و آن‌چین فعال می‌شود.',
            '۳. از تمام معاملات CEX و کپی‌ترید V2 می‌توانید کارت سود تاییدشده PNG بگیرید و با شناسه اختصاصی در تلگرام به اشتراک بگذارید.',
          ],
        },
      ]
    : [
        {
          img: '/images/smart-wallet-radar.png',
          badge: 'GUIDE 1 · SMART WALLET COPY V2',
          title: 'Top-10 Smart Money, Isolated Margin Boxes & 24/7 Copy-Vault',
          steps: [
            '1. On Copy-Trade Hub V2, select from the Top-10 leaderboard or add any custom wallet (strictly copies new positions opened after follow time).',
            '2. Configure each trader’s isolated margin box, daily loss limit, TP1/2/3 + Moonbag, SL, Trailing & Break-Even, then run the 7-day backtest.',
            '3. Pick Trust 1-Click (user-signed) or 24/7 Copy-Vault (automated Solana Jupiter execution with password-verified private key backup).',
          ],
        },
        {
          img: '/images/antirug-shield-dapp.png',
          badge: 'GUIDE 2 · ANTI-RUG & TRUST MULTI-DAPP',
          title: '3-Source Contract Safety & All-Chain DEX Routing',
          steps: [
            '1. On the DEX & Trust Wallet page, click "Multi-DApp + Safety" on any token card.',
            '2. Review real GoPlus + Honeypot.is + RugCheck safety scores (0–95), buy/sell taxes, mint authority & LP flags.',
            '3. Launch Jupiter, Raydium, Uniswap, PancakeSwap, 1inch, STON.fi, SunSwap or Cetus directly inside Trust Wallet DApp Browser.',
          ],
        },
        {
          img: '/images/my-ai-brain.png',
          badge: 'GUIDE 3 · 4 ENGINES & VISION AI',
          title: 'Auto AI, My Trainable AI, Dorna V1 & Vision Chart AI',
          steps: [
            '1. Dollarino AI trades autonomously once you choose your risk profile.',
            '2. Teach your blank My AI agent in plain chat with your indicators, timeframe, and risk targets.',
            '3. Paste or upload any chart screenshot into Floating AI Chat or /ai in @Dollarino_bot to extract Entry, SL & 3 TPs.',
          ],
        },
        {
          img: '/images/exchange-api-hub.png',
          badge: 'GUIDE 4 · CEX API, TRC20 & PROFIT CARDS',
          title: 'Connect Toobit / Bitunix / KCEX & Verified Profit Cards',
          steps: [
            '1. Bind Trade-Only exchange API keys (withdrawal scope disabled) encrypted with AES-256.',
            '2. Submit any TRC20 TXID on the Subscription page for instant on-chain activation.',
            '3. Issue watermarked Verified PnL PNG Cards from both CEX trades and Copy-Trade V2 positions.',
          ],
        },
      ];

  const items = isFa
    ? [
        [
          'کپی‌ترید هوشمند ولت‌ها (V2) و باکس مارجین اختصاصی چگونه کار می‌کند؟',
          'در بخش پایین صفحه «کپی‌ترید و اتصال»، می‌توانید از بین ۱۰ ولت برتر هر شبکه انتخاب کنید یا آدرس هر ولت شخصی (در Solana، Base، Ethereum، BSC، Arbitrum، TON و TRON) را اضافه کنید. به محض فعال‌سازی فالو، آخرین تراکنش ولت به‌عنوان مبدأ ثبت می‌شود تا فقط معاملات جدیدی که از آن لحظه به بعد باز می‌شوند کپی شوند. هر تریدر باکس مارجین جداگانه و سقف ضرر روزانه مستقل دارد تا یک تریدر به بودجه دیگری آسیب نزند.',
        ],
        [
          'خزانه کپی‌ترید ۲۴/۷ (Copy-Vault) چیست و چطور کلید خصوصی را دریافت کنم؟',
          'برای اینکه ربات حتی وقتی آنلاین نیستید در تمام ۲۴ ساعت به‌صورت خودکار معامله را اجرا کند، هر کاربر یک خزانه غیرحضانتی رمزنگاری‌شده با استاندارد AES-256-GCM دارد (با پشتیبانی اجرای مستقیم Jupiter v6 روی سولانا). هر زمان مایل بودید از تب «خزانه ۲۴ ساعته» با کلیک روی «نمایش و بک‌آپ کلیدهای خزانه» و تایید رمز عبور حسابتان، کلید خصوصی EVM و سولانای خزانه را تحویل بگیرید یا در کیف‌پول شخصی خود ایمپورت کنید.',
        ],
        [
          'سپر ضدراگ واقعی و خروج خودکار Dev-Sell چطور از سرمایه محافظت می‌کند؟',
          'پیش از هر خرید یا کپی، قرارداد توکن از طریق APIهای زنده GoPlus، Honeypot.is و RugCheck بررسی می‌شود. توکن‌هایی که Honeypot هستند، مالیات خرید/فروش غیرعادی دارند، Mint فعال دارند یا زیر حداقل نقدینگی و مارکت‌کپ شما هستند به‌صورت خودکار بلاک می‌شوند. همچنین اگر گزینه «خروج خودکار هنگام فروش دولوپر (Dev-Sell)» فعال باشد، سیستم در کرون دقیقه‌ای ریزش مشکوک یا تخلیه لیکوئیدیتی را تشخیص داده و پوزیشن را می‌بندد.',
        ],
        [
          'چت هوش مصنوعی اختصاصی دلارینو و تحلیل عکس چارت چطور کار می‌کند؟',
          'از دکمه شناور پایین صفحه یا صفحه اختصاصی «چت هوش مصنوعی AI» می‌توانید دقیقاً مثل یک هوش مصنوعی کامل گفتگو کنید، از لیست بالا مدل دلخواهتان را انتخاب کنید (مدل‌های متصل سیستم یا کلیدهای شخصی خودتان)، و حتی عکس چارت بفرستید یا Paste کنید تا هوش مصنوعی ساختار چارت را تحلیل کرده و ستاپ دقیق (ورود، حد ضرر و ۳ تارگت) ارائه دهد. همین قابلیت مستقیماً داخل ربات تلگرام @Dollarino_bot با دستور /ai یا ارسال مستقیم عکس چارت نیز فعال است.',
        ],
        [
          'تفاوت ۴ موتور معاملاتی دلارینو و قانون تک‌موتوره چیست؟',
          '۱) هوش مصنوعی دلارینو (تحلیل چارت، ورود و مدیریت پوزیشن اتومات)، ۲) هوش مصنوعی من (تربیت AI شخصی خودتان با گفتگوی فارسی)، ۳) استراتژی شکار / دُرنا V1 (الگوریتم اختصاصی شکار اسپایک با ۳ تارگت و تریلینگ SL)، و ۴) کپی‌ترید تاییدشده (آینه‌سازی معاملات تریدرهای تاییدشده روی حساب شما). بر اساس قانون تک‌موتوره، با فعال کردن هر موتور روی صرافی‌ها، موتور قبلی متوقف می‌شود تا دو استراتژی همزمان با هم تداخل پیدا نکنند.',
        ],
        [
          'کارت سود تاییدشده (Profit Card) و کارت بسته شدن سیگنال چه تفاوتی دارند؟',
          'کارت سود در بازه‌های ۷ روزه، ۳۰ روزه و یک‌ساله (و همچنین برای هر پوزیشن کپی‌ترید V2) با خروجی PNG رسمی، واترمارک دلارینو و مهر بزرگ «حساب واقعی / حساب دمو» صادر می‌شود و هر فرد با شناسه تأیید می‌تواند اصالت آن را در سایت بررسی کند. هنگام بسته شدن هر سیگنال نیز کارت رسمی نتیجه معامله همراه با TP1/TP2/TP3 و Trailing SL در کانال رسمی و ربات ارسال می‌شود.',
        ],
        [
          'خرید اشتراک با تتر TRC20 و دعوت دوستان چطور انجام می‌شود؟',
          'پس از واریز مبلغ اشتراک به آدرس TRC20 داخل صفحه اشتراک، کافی است لینک یا هش TXID را ثبت کنید تا سیستم از طریق شبکه TRON تراکنش را بررسی و اشتراک شما را خودکار فعال کند. همچنین با لینک اختصاصی دعوت دوستان (یا کد ?ref= هنگام ثبت‌نام)، پاداش معرفی روی کیف پول و اشتراک شما منظور می‌شود.',
        ],
        [
          'کانال و ربات رسمی دلارینو کدامند و چطور از کلاهبرداری در امان بمانیم؟',
          'تنها کانال رسمی دلارینو @Dollarino_official و تنها ربات و پشتیبانی رسمی @Dollarino_bot (و تیکت آنلاین داخل همین وب‌اپ) هستند. دلارینو هیچ آیدی پشتیبانی متفرقه یا ادمینی که اول پیام بدهد ندارد و هرگز کلید خصوصی کیف‌پول شخصی یا دسترسی برداشت صرافی را نمی‌خواهد.',
        ],
        [
          'تفاوت فیوچرز صرافی (Toobit / Bitunix / KCEX) با فیوچرز کیف‌پول (Perp DEX مثل Hyperliquid) چیست؟',
          'در فیوچرز صرافی، معاملات با کلید API ترید (بدون دسترسی برداشت) داخل حساب صرافی شما اجرا می‌شوند و از تمام ربات‌ها، هوش مصنوعی و استاپ‌لاس خودکار پشتیبانی می‌کنند. اما در بخش Perp DEX (صفحه DEX و تراست‌ولت ← تب فیوچرز کیف‌پول)، شما مستقیماً از کیف‌پول شخصی خودتان روی Hyperliquid، Jupiter Perps، GMX V2 یا dYdX بدون احراز هویت (No-KYC) و با حضانت کامل خودتان معامله اهرم‌دار باز می‌کنید.',
        ],
        [
          'آیا سرمایه من در صرافی‌های Toobit، Bitunix و KCEX امن است؟',
          'بله، سرمایه شما در حساب صرافی خودتان می‌ماند. کلیدهای API با استاندارد AES-256 رمزنگاری می‌شوند و تنها دسترسی معامله (بدون مجوز برداشت) نیاز دارند.',
        ],
        [
          'طراح، توسعه‌دهنده و سازنده پلتفرم دلارینو کیست؟',
          'پلتفرم معاملاتی هوشمند دلارینو توسط آوید کیا (Avid Kiya) طراحی و ساخته شده است. صفحات رسمی سازنده: تلگرام @avidkiya · اینستاگرام و توییتر (X): @avid_kiya',
        ],
      ]
    : [
        [
          'How does Smart-Wallet Copy Trading V2 & Isolated Margin Boxes work?',
          'Choose from Top-10 smart-money wallets or add any custom address across Solana, Base, ETH, BSC, Arbitrum, TON & TRON. Upon following, only new positions opened after that moment are copied, each locked inside its own margin box and daily loss limit.',
        ],
        [
          'What is the 24/7 Copy-Vault and can I export my private keys?',
          'Each user gets an encrypted AES-256-GCM Copy-Vault for 24/7 automated Solana Jupiter execution. You can export your EVM and Solana vault private keys anytime inside the 24/7 Copy-Vault tab after confirming your account password.',
        ],
        [
          'How does the Anti-Rug Shield & Dev-Sell Auto Exit work?',
          'Before any entry, GoPlus, Honeypot.is & RugCheck audit contract taxes, mint/freeze flags, honeypot risk, and liquidity depth. During active positions, Dev-Sell protection automatically exits if sudden developer dumps or liquidity collapses occur.',
        ],
        [
          'What are the 4 Dollarino trading engines?',
          '1) Dollarino AI (autonomous chart & position AI), 2) My Trainable AI (teach your personal agent via chat), 3) Hunting Engine / Dorna V1 (precision 3-TP + trailing SL scanner), and 4) Verified Copy-Trade (mirror admin-vetted live traders). The same 4 engines are synced across Web and @Dollarino_bot.',
        ],
        [
          'How do Verified Profit Cards & Signal Closed cards work?',
          'Generate official 16:9 or 3:4 PNG Profit Cards (7D, 30D, 1Y, plus Copy-Trade V2 positions) with watermarked Dollarino branding, a bold LIVE vs DEMO stamp, and cryptographic verification IDs.',
        ],
        [
          'What is the difference between Exchange Futures (CEX) and Wallet Futures (Perp DEX)?',
          'Exchange Futures (Toobit / Bitunix / KCEX) execute automated bots via trade-only API keys inside your CEX account. Wallet Futures (Perp DEX like Hyperliquid, Jupiter Perps, GMX V2 & dYdX) let you trade leveraged perpetuals directly from your self-custody wallet with zero KYC.',
        ],
        [
          'How do TRC20 auto-verification and referrals work?',
          'Paste your TRC20 TXID or TronScan link on the Subscription page for instant on-chain verification. Share your referral link (?ref=CODE) so invited users earn rewards upon signup and subscription.',
        ],
        [
          'Which handles are official and how do I stay safe from impersonators?',
          'Our ONLY official bot & support handle is @Dollarino_bot and our official channel is @Dollarino_official (plus the in-app Online Support modal). Dollarino staff never DM you first or ask for withdrawal scopes.',
        ],
        [
          'Are my exchange funds safe?',
          'Yes. Funds never leave your Toobit, Bitunix, or KCEX account. API credentials are encrypted with AES-256 and require Trade-Only access with zero withdrawal scope.',
        ],
      ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--gold)' }}>
          TRAINING CENTER · WALKTHROUGH & FAQ
        </p>
        <h2 className="font-display font-bold text-3xl text-main">
          {isFa ? 'مرکز آموزش گام‌به‌گام و سوالات پرتکرار' : 'Step-by-Step Guide & FAQ'}
        </h2>
        <p className="text-xs text-dim mt-1">
          {isFa
            ? 'آموزش کامل کپی‌ترید هوشمند ولت‌ها V2، سپر ضدراگ، Trust Wallet Multi-DApp، هوش مصنوعی من و اتصال صرافی‌ها.'
            : 'Complete walkthrough of Smart Copy-Trading V2, Anti-Rug Shield, Trust Wallet Multi-DApp, My AI & CEX integration.'}
        </p>
      </div>

      {/* 4 Illustrated Training Walkthrough Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {tutorials.map((tut) => (
          <div key={tut.title} className="panel rounded-[26px] overflow-hidden border hairline flex flex-col">
            <div className="relative h-36 overflow-hidden">
              <img src={tut.img} alt={tut.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#081022] via-[#081022]/35 to-transparent flex items-end p-4">
                <div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black">
                    <Sparkles className="w-3 h-3" />
                    <span>{tut.badge}</span>
                  </span>
                  <h3 className="font-display font-bold text-sm sm:text-base text-white mt-1">{tut.title}</h3>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-2 text-xs text-dim">
              {tut.steps.map((s) => (
                <p key={s} className="leading-relaxed">
                  {s}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel rounded-[26px] p-5 sm:p-6 space-y-3">
        <h3 className="font-display font-bold text-lg text-main px-1 pb-1">
          {isFa ? 'پرسش و پاسخ کامل سیستم' : 'Complete System Q&A'}
        </h3>
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

      <div className="panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-dim">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-jade shrink-0" />
          <span>
            {isFa
              ? 'همیشه تنظیمات ریسک و اهرم را متناسب با سرمایه خود انتخاب کنید و برای هر سوال با پشتیبانی آنلاین در تماس باشید.'
              : 'Always size leverage conservatively according to your risk tolerance and contact Online Support anytime.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
          <span className="text-main">{isFa ? 'سازنده: آوید کیا' : 'Creator: Avid Kiya'}</span>
          <a href="https://t.me/avidkiya" target="_blank" rel="noreferrer" dir="ltr" className="text-[var(--gold)] hover:underline">
            TG @avidkiya
          </a>
          <a href="https://instagram.com/avid_kiya" target="_blank" rel="noreferrer" dir="ltr" className="text-jade hover:underline">
            IG / X @avid_kiya
          </a>
        </div>
      </div>
    </div>
  );
}
