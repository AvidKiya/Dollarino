# مستندات جامع فنی، معماری و تاریخچه کامل پروژه **Dollarino (دلارینو)** — از **V1.0** تا **V11.7.2**

> **بنیان‌گذار و معمار نرم‌افزار:** آوید کیا (`Avid Kiya`) · تلگرام: `@avidkiya` · اینستاگرام و X: `@avid_kiya`  
> **نسخه نهایی مستندشده:** `V11.7.2 Production` (اکستنشن بومی Chrome Side Panel فقط در حالت ساده، صفرسازی امن حساب مدیریتی + معافیت کامل مدیر از کارمزد و محدودیت‌ها، ثبت خودکار کد معرف مدیر، ثبت‌نام مستقیم Trust Wallet DApp و فرم یکپارچه شماره تماس/نام/نام کاربری/رمز، ۰٪ اشتراک و ۳٪ کارمزد فقط از سود واقعی)  
> **تعداد کل مایگریشن‌های دیتابیس (D1):** `47` فایل (`0001_init.sql` تا `0047_v11_7_sniper_pro_filters.sql`)  
> **زیرساخت:** Cloudflare Workers + Cloudflare D1 (SQLite) + Cloudflare Durable Objects (`TradingBotCoordinator`) + React 18 / Vite PWA (`dollarino-pwa-v11.7.2`) + Chrome Extension MV3 (`11.7.2` · `sidePanel`) + Telegram Bot API

> **نکته حیاتی استقرار Cloudflare (`dollarino.pages.dev`):** هنگام انتشار نسخه جدید، باید هر دو دستور `npx wrangler d1 migrations apply dollarino-db --remote && npx wrangler deploy` (بک‌اند Worker + D1) و سپس `npx wrangler pages deploy apps/web/dist --project-name=dollarino` (فرانت‌اند Pages) اجرا شوند تا خطای `404 Route not found` در مسیرهای `/api/...` رخ ندهد. همچنین در فایل‌های `functions/api/[[path]].ts` و `apps/web/functions/api/[[path]].ts` پروکسی `/api/*` با حفظ شفافیت کامل هدرها (بدون `X-Frame-Options` مزاحم) پیاده‌سازی شده است.

---

## فهرست مطالب
1. [معرفی کلان و فلسفه معماری دلارینو](#۱-معرفی-کلان-و-فلسفه-معماری-دلارینو)
2. [ساختار Monorepo و نقش هر ماژول](#۲-ساختار-monorepo-و-نقش-هر-ماژول)
3. [تاریخچه کامل تکامل نسخه‌ها (V1.0 تا V11.7.2 Final)](#۳-تاریخچه-کامل-تکامل-نسخه‌ها-v10-تا-v1172-final)
4. [معماری پایگاه داده (۴۷ مایگریشن D1)](#۴-معماری-پایگاه-داده-۴۷-مایگریشن-d1)
5. [موتورهای ترید ۵گانه و اجرای همزمان (Multi-Engine & DO)](#۵-موتورهای-ترید-۵گانه-و-اجرای-همزمان)
6. [معماری غیرامانی Trust Wallet DApp، Perp DEX، سولانا و اسنایپر](#۶-معماری-غیرامانی-trust-wallet-dapp-perp-dex-سولانا-و-اسنایپر)
7. [سیستم مالی ۰٪ اشتراک، ۳ معامله رایگان، کارمزد ۳٪ از سود و معافیت مدیر](#۷-سیستم-مالی-۰-اشتراک-۳-معامله-رایگان-کارمزد-۳-از-سود-و-معافیت-مدیر)
8. [امنیت، احراز هویت چندمسیره، رمزنگاری و TOTP 2FA](#۸-امنیت-احراز-هویت-چندمسیره-رمزنگاری-و-totp-2fa)
9. [ربات تلگرام ۲۴/۷، کانال‌ها و مینی‌اپ](#۹-ربات-تلگرام-۲۴۷-کانال‌ها-و-مینی‌اپ)
10. [معماری فرانت‌اند (`18` صفحه و `38+` کامپوننت)، نوار قیمت زنده و اکستنشن Chrome Side Panel](#۱۰-معماری-فرانت‌اند-و-اکستنشن-کروم-mv3)
11. [فهرست کامل مسیرهای API بک‌اند (`apps/worker`)](#۱۱-فهرست-کامل-مسیرهای-api-بک‌اند)
12. [راهنمای استقرار، متغیرهای محیطی و نگهداری D1](#۱۲-راهنمای-استقرار-متغیرهای-محیطی-و-نگهداری-d1)

---

## ۱. معرفی کلان و فلسفه معماری دلارینو

**دلارینو (Dollarino)** یک اکوسیستم کامل معاملاتی، هوش مصنوعی و اتوماسیون مالی مبتنی بر شبکه لبه (Edge) کلادفلر است که با سه رکن اصلی طراحی شده است:
1. **۱۰۰٪ غیرامانی (Zero-Custody):** سرمایه معاملاتی کاربر همواره در **کیف‌پول شخصی Trust Wallet** خود کاربر (در شبکه‌های EVM، Solana، TON و TRON) یا ولت خود-حضانتی اختصاصی‌اش باقی می‌ماند؛ هیچ‌گاه سرمایه معامله به حساب پلتفرم واریز نمی‌شود.
2. **۰٪ اشتراک ماهانه، هم‌راستایی کامل منافع:** تمام ابزارها، شبیه‌ساز دمو قابل تنظیم (`$50` تا `$10,000,000`)، ۲۵+ اندیکاتور، کدنویسی Pine/Python و رادارها رایگان هستند. کاربر در **۳ معامله سودده اول حالت لایو ۰٪ کارمزد** می‌پردازد و پس از آن فقط **۳٪ از سود واقعی ثبت‌شده** به عنوان کارمزد سرور تسویه می‌گردد (`۹۷٪` سود خالص برای کاربر).
3. **چندموتوره همزمان + ۲ حالت کاربری (ساده برای همگان ۱۰ تا ۸۰ ساله / حرفه‌ای کوانت):** کاربر می‌تواند یک یا چند موتور را همزمان روشن کند و با یک کلیک بین رابط ساده (۵ کارت شفاف) و میز کار حرفه‌ای کوانت جابجا شود.

---

## ۲. ساختار Monorepo و نقش هر ماژول

```text
Dollarino/
├── package.json                  # ریشه Workspaces: packages/core, apps/worker, apps/web
├── wrangler.toml                 # پیکربندی Worker, D1 (dollarino-db), Durable Object & Cron (* * * * *)
├── migrations/                   # 47 فایل SQL متوالی از 0001_init.sql تا 0047_v11_7_sniper_pro_filters.sql
├── functions/api/[[path]].ts     # پروکسی Cloudflare Pages -> Worker بدون X-Frame-Options
├── packages/core/                # موتور ریاضی، اندیکاتورها، ریسک، بک‌تستر، TP/SL و مفسر Pine/Python (بدون eval)
│   └── src/
│       ├── decimal.ts            # محاسبات دقیق اعشاری مالی
│       ├── types.ts              # انواع مشترک سیگنال، پوزیشن، ریسک و کندل
│       ├── indicators.ts         # ALMA, EMA, SMA, RSI, ATR, DEMA, ADX, BB, SuperTrend, MACD, VWAP
│       ├── kiya-bot.ts           # موتور اختصاصی KBOs v11 + فیلترهای چندلایه
│       ├── strategies.ts         # استراتژی منتخب Dollarino V0.1 (دُرنا V1) + میکسر ۸-کاناله
│       ├── risk-engine.ts        # محاسبه سایز پوزیشن، SL/TP1-3، Break-Even و Trailing Stop
│       ├── tpsl.ts               # محاسبه‌گر و مبدل دوطرفه TP/SL قیمتی ($) و درصدی (%) + ROE اهرمی
│       ├── signal-parser.ts      # پارس استاندارد پیام‌های سیگنال تلگرام و JSON
│       ├── tv-alerts.ts          # تبدیل هشدارهای TradingView به ساختار عملیاتی
│       ├── backtester.ts         # شبیه‌ساز بک‌تست روی داده‌های تاریخی تا ۹۰۰ کندل
│       └── custom-strategy-engine.ts # مفسر ایمن بدون eval برای Pine Script v4/v5/v6 (با باکس/خط/لیبل/HUD), Python Quant و قوانین بصری
├── apps/worker/                  # بک‌اند Hono/Cloudflare Worker + Durable Object + Telegram Bot (84 تست در 14 مجموعه)
│   └── src/
│       ├── index.ts              # ورودی Worker، کرون ۲۴/۷ (`scheduled`)، /api/public/market-snapshot (16 ارز برتر)، و Serve Assets + Dynamic OG
│       ├── auth.ts               # صدور و بررسی JWT، لینک جادویی، ادغام حساب، صفرسازی امن حساب مدیر، کد معرف خودکار مدیر، Google/Wallet/Telegram Auth & TOTP
│       ├── crypto.ts             # رمزنگاری AES-256-GCM کلیدهای کاربر، امضای HMAC-SHA256، و TOTP RFC 6238
│       ├── security.ts           # Rate Limiting دولایه (Isolate Cache + D1) با معافیت مدیران و هش ایمن IP/UA
│       ├── routes/               # 12 فایل روتر API (admin, ai-assistant, chart-ai, connections, copy-trade, dex, my-ai, subscriptions, support, trading, trustwallet, webhooks)
│       ├── engine/               # 7 ماژول موتور اجرایی (bot-do, executor, copy-mirror, exclusive-engine, listing-sniper, market-intel, onboarding-gate)
│       ├── dex/                  # 4 ماژول آن‌چین (evm-tx, perp-dex, screener, smart-copy با buildUnsignedSolanaTransferTx)
│       ├── exchanges/            # 10 ماژول اتصال بازار و نرخ لحظه‌ای (base, factory, paper, markets, iran-rate, hyperliquid, toobit, bitunix, kcex, proxy)
│       ├── ai/                   # 2 ماژول هوش مصنوعی (providers, assistant + Vision + Live Fallback)
│       ├── services/             # 6 سرویس هسته‌ای (founder-profile, profit-cards, server-fee با معافیت مدیر, settings-cache, site-traders, treasury)
│       ├── telegram/             # 7 ماژول ربات و کانال تلگرام (handler, admin-menu, publisher, group-moderator, formatter, client, token)
│       ├── cards/renderer.ts     # رندر سرورساید کارت سود (16:9 1200x675 و 9:16 1080x1920 + QR وکتور) و نتیجه سیگنال به PNG واقعی (@resvg/resvg-wasm)
│       └── __tests__/            # 14 فایل تست یکپارچه Miniflare + D1 (84 تست موفق)
├── apps/web/                     # فرانت‌اند React 18 + Vite + Tailwind + Lightweight-Charts + PWA (1748 ماژول)
│   ├── public/
│   │   ├── sw.js                 # Service Worker نسخه dollarino-pwa-v11.7.2 (Network-First + Cache-Bust)
│   │   ├── _headers              # هدرهای Cache-Control کلادفلر (no-store برای HTML/SW، immutable برای /assets، بدون X-Frame-Options)
│   │   ├── manifest.webmanifest  # تنظیمات نصب PWA و میانبرهای سریع موبایل
│   │   ├── downloads/            # dollarino-extension.zip آماده نصب Chrome Side Panel v11.7.2
│   │   └── images/transparent/   # آیکون‌های 3D با پس‌زمینه کاملاً شفاف (WebP/PNG)
│   └── src/
│       ├── App.tsx               # روتینگ مرکزی، تم روز/شب (paper/cosmic)، قفل Side Panel ساده (?embed=sidepanel)، focusSymbol برای کلیک نوار قیمت -> بازارها
│       ├── pages/                # 18 صفحه مستقل با React.lazy (LandingPage V11.7.2, MarketsPage با Spotlight, OverviewPage, TerminalPage, ...)
│       ├── components/           # 38+ کامپوننت اختصاصی (LiveTickerBar پیوسته بدون فضای سفید, TpSlModeSwitch, ProDropdown, SmoothSlider, FloatingAiChat, ...)
│       └── lib/                  # api.ts, format.ts, i18n.ts, pwa.ts, telegram.ts, toast.ts, trustwallet.ts, tpsl.ts, types.ts
└── apps/extension/               # اکستنشن رسمی مرورگر Chrome MV3 (v11.7.2 · Native chrome.sidePanel در حالت ساده اختصاصی)
```

---

## ۳. تاریخچه کامل تکامل نسخه‌ها (`V1.0` تا `V11.7.2 Final`)

### نسل ۱ تا ۴ (`V1.0` – `V4.0` · پایه‌گذاری هسته کوانت و اشتراک اولیه)
- **V1.0 (`0001_init.sql`):** ساخت اسکلت کامل پایگاه داده روی Cloudflare D1 (`users`, `telegram_bots`, اتصالات و معاملات)، پیاده‌سازی اولین ربات معاملاتی با Cloudflare Durable Objects (`TradingBotCoordinator`)، نقش‌های `owner | admin | user`، اتصال اکانت تلگرام و اجرای خودکار سفارشات.
- **V2.0 (`0002` – `0004`):** معرفی جریان چندمرحله‌ای استراتژی (`strategy_flow`)، **میکسر ۸-کاناله سیگنال (`mixer_threshold = 65`)**، حالت مارجین (`ISOLATED`/`CROSS`), و موتور پیشرفته **KBOs v11 (`kiya-bot.ts`)** مجهز به ریبون `ALMA`, `DEMA+ATR`, فیلترهای `EMA200` و `ADX`, سه تارگت `TP1/TP2/TP3`, انتقال خودکار حد ضرر به نقطه ورود پس از تارگت اول (`beAfterTp1`) و تریلینگ استاپ (`trailAfterTp1`). در `0004` پارامترهای پیش‌فرض بر اساس نتایج بک‌تست کالیبره شدند.
- **V3.0–V4.0 (`0005_subscriptions.sql`):** افزودن ساختار لایسنس، پلن‌های اشتراک، و کنترل دسترسی کاربران روی قابلیت‌های موتور.

### نسل ۵ و ۶ (`V5.0` – `V6.2` · هوش مصنوعی مرکزی، چندارزی، اسپات/فیوچرز و کارت سود رمزنگاری‌شده)
- **V5.0–V5.1 (`0006` – `0007`):** اضافه شدن **`platform_ai_engines`** برای اجماع ۱ تا ۳ مدل هوش مصنوعی مرکزی با کلیدهای ادمین بدون نیاز به تنظیم کاربر، رونمایی از استراتژی مرجع **`Dollarino V0.1` (موتور دُرنا V1)** و اسکنر خودکار کل بازار (`ALL_MARKET`، `TOP_COINS`، `SINGLE`) با قابلیت چرخش خودکار روند (`allow_auto_flip`).
- **V6.0–V6.1 (`0008` – `0009`):** هم‌ترازسازی پلن‌ها با مدل ۴گانه دلارینو، افزودن **کدهای هدیه (`gift_codes`)**، تقسیم پوزیشن `50%/25%/25%`، طراحی **ترمینال چارت زنده + تحلیلگر AI چارت**، سیستم اعلان‌های دائمی (`notifications` + رویداد زنده SSE)، گارد جلوگیری از اجرای تکراری سیگنال، طراحی iOS Cupertino روز/شب (`paper` / `cosmic`) با داک شیشه‌ای خمیده موبایل، و تب یکپارچه `خدمات` (`ServicesPage.tsx`).
- **V6.2 (`0010`):** پشتیبانی همزمان از **بازار اسپات (Spot 1x)** و **فیوچرز (Futures)**، کنترل جهت معامله (`BOTH`, `LONG_ONLY`, `SHORT_ONLY`) و **حالت هج دوطرفه (`hedge_mode`)**؛ و رونمایی از **کارت سود رسمی تاییدشده سرور (`verified_profit_cards`)** رندرشده با `@resvg/resvg-wasm` و فونت فارسی به همراه امضای دیجیتال `HMAC-SHA256` و صفحه استعلام عمومی `/verify-card/:cardId` (`VerifyCardPage.tsx`).

### نسل ۷ و ۸ (`V7.0` – `V8.5` · محیط کدنویسی Pine/Python، پنل ۹بخشی تلگرام، My AI و کپی‌ترید)
- **V7.0 (`0011`):** اضافه شدن **حالت ساده ۴ مرحله‌ای** هم‌تراز با استانداردهای مدرن UI، محیط کدنویسی **Pro Quant IDE** (`StrategyIdePanel.tsx`) با مفسر صفر-`eval` (`custom-strategy-engine.ts`) برای **TradingView Pine Script v4/v5**، **Python Quant** و **Visual Rule Builder** همراه با اتصال ۲۴/۷ استراتژی کاربر به ربات.
- **V7.1–V7.2 (`0012` – `0013`):** تکمیل **ربات جامع تلگرام (`@Dollarino_bot`)** با پنل مدیریت ۹-بخشی (`admin-menu.ts`) شامل خروجی واقعی **Excel/CSV و JSON** با `sendDocument`، تایم‌اوت ۱۵ دقیقه‌ای امنیت ادمین، لینک جادویی ورود به وب `/weblogin` و ادغام حساب `LINK-XXXXXX`، کیف‌پول داخلی، و آپلود آواتار کاربری (`0013`).
- **V8.0–V8.5 (`0014` – `0015`):** راه‌اندازی **هوش مصنوعی شخصی قابل آموزش (`My AI`)** که کاربر استراتژی خود را با چت فارسی به AI یاد می‌دهد، سیستم **کپی‌ترید تاییدشده (`copy_traders`)** با تایید دو مرحله‌ای، انتشار سیگنال و اخبار در کانال `@Dollarino_official` با دکمه‌های شیشه‌ای، پشتیبانی آنلاین، اتصال گیت‌وی Hilinkup AI، و کارت‌های سود ۷روزه/۳۰روزه/یکساله (۱۶:۹ و ۳:۴).

### نسل ۹ (`V9.0` – `V9.9.4` · Trust Wallet DApp، رادار DEX، اکستنشن کروم، چت AI تصویری و رفرال)
- **V9.0 (`0016`):** اتصال غیرامانی **Trust Wallet DApp** (EVM, Solana, TRON)، **رادار زنده DexScreener** برای شکار توکن‌های خارج از صرافی‌ها، احراز اجباری شماره تلگرام (**Phone KYC**)، ویجت‌های سریع PWA، و انتشار نسخه اول **اکستنشن مرورگر Chrome MV3** با کلید اختصاصی `X-Dollarino-Extension-Key`.
- **V9.5 (`0017`):** همگام‌سازی خودکار عکس پروفایل تلگرام (`/api/auth/avatar/:userId`)، پشتیبانی دوحالته هوشمند (`AI_ASSISTANT ⇄ HUMAN_ADMIN`)، هشدارهای زنده قیمت (`Price Alerts`)، و مجموعه آیکون‌های برداری `CoinIcon` با حذف تمام ایموجی‌ها.
- **V9.6 (`0018`):** سخت‌سازی امنیتی با **Rate Limiting دولایه (`security.ts`)** و هدرهای محافظتی، راه‌اندازی **باشگاه همکاران رفرال پلکانی** (۱۵٪/۱۸٪/۲۲٪) با مکانیزم ضدتقلب هم‌IP/هم‌دستگاه و درخواست برداشت نقدی USDT، فالبک دوم سرور رادار با `GeckoTerminal API v2`، و طراحی مجدد اکستنشن به سبک `Liquid Glass` با ۴ تب.
- **V9.7 (`0019` – `0022`):** تکمیل و ویرایش کامل پروفایل با قفل ایمن شماره تاییدشده (`0019`)، رفع سقف تماس روزانه AI به ۵۰٬۰۰۰ (`0020`)، پاکسازی رکوردهای تاریخی آسیب‌دیده (`price=100`) حساب کاغذی (`0021`)، و بهسازی متن‌های راهنمای تلگرام (`0022`).
- **V9.8 (`0023`):** پشتیبانی بلاکچین **TON** در Trust Wallet (`trust_wallet_ton`) و سوئیچر ۹ شبکه EVM، پکیج کامل برندهای SVG (`BrandLogos.tsx`)، مودال پشتیبانی جدید، و ورود دوگانه Telegram Mini App + مرورگر وب (`PwaInstallModal`).
- **V9.9–V9.9.4 (`0024` – `0026`):** **دستیار چت AI شناور (`FloatingAiChat`)** روی تمام صفحات + صفحه تمام‌صفحه چت AI (`AiChatPage.tsx`) با **تحلیل تصویری چارت (Multimodal Vision)** و استخراج خودکار Entry/SL/TP1-3؛ انتساب رسمی بنیان‌گذار **آوید کیا (`Avid Kiya`)**؛ فالبک بدون‌قطعی `dollarino-live-ai` و دکمه AssistiveTouch؛ پیوست تصویر/رسید در پشتیبانی و پرداخت (`0025`)؛ و اولین موج ایندکس‌های سرعت D1 (`0026`).

### نسل ۱۰ (`V10.0` – `V10.5` · Smart Copy V2، تمرکز ۱۰۰٪ Trust Wallet، حذف اشتراک ماهانه و شفافیت بنیان‌گذار)
- **V10.0 (`0027` – `0028`):** **Smart Copy Trading Pro V2** با رتبه‌بندی و ردیابی **Top-10 نهنگ‌های آن‌چین** و بررسی دارایی داخل ولت‌ها؛ پشتیبانی **Perp DEX غیرامانی** (Hyperliquid / Jupiter Perps / GMX)؛ کاروسل بنرهای تبلیغاتی (`promo_banners`)؛ و ثبت دلایل ساده تصمیمات هوش مصنوعی.
- **V10.1–V10.2 (`0029` – `0031`):** مرکز پیام‌رسانی زمان‌بندی‌شده ادمین (`scheduled_broadcasts`)، کد امنیتی PIN برای Copy-Vault (`0029`)، تبدیل بنرها به WebP سبک (`0030`)، و **خروج کامل از صرافی‌های متمرکز (CEX) در مسیرهای کپی‌ترید و تمرکز انحصاری بر Trust Wallet + شبیه‌ساز ۱۰٬۰۰۰ دلاری** (`0031`).
- **V10.3–V10.4 (`0032` – `0034`):** **انقلاب مدل تجاری: حذف کامل اشتراک ماهانه (`subscription_required = false`)**، معرفی دفترکل کارمزد فقط-از-سود (`server_fee_ledger` با ۱٪ و سپس ۵٪ استاندارد در `0034` به همراه اعتبار پیش‌پرداخت، مهلت تسویه و قفل کارمزد در `0033`)، هشدار رایگان TradingView، و تفکیک ۵ کانال تخصصی تلگرام.
- **V10.5 (`0035` – `0036`):** بخش شفافیت بنیان‌گذار و استعلام قانونی ضد پانزی (`founder-profile.ts`)، و **ناظر هوشمند گروه تلگرام (`group-moderator.ts`)** برای مدیریت اخطارها و قوانین انجمن.

### نسل ۱۱ (`V11.0` – `V11.6.5` · همزمانی ۵ موتور، اسنایپر، کارمزد ۳٪، بهینه‌سازی کلادفلر، DApp واقعی و معماری ۱۰۰٪ غیرامانی)
- **V11.0 (`0037`):**
  - **اجرای همزمان چند موتور (`active_engines_json`):** فعال‌سازی همزمان هوش مصنوعی مرکزی، دُرنا V1، هوش مصنوعی شخصی من، کپی‌ترید و اسنایپر.
  - **شبیه‌ساز دمو با موجودی دلخواه (`$50` تا `$10M`)** بدون نیاز به محدودیت `$10K` ثابت.
  - **موتور اسنایپر لیستینگ و میم‌کوین (`listing-sniper.ts` & `SniperPage.tsx`)** با امتیاز ایمنی ضدراگ (`sniper_min_safety_score`).
  - کاهش کارمزد فقط-از-سود از ۵٪ به **۳٪ استاندارد نهایی دلارینو + ۳ معامله سودده اول کاملاً رایگان (`۰٪`)**.
  - دروازه پذیرش ریسک (`risk_terms_accepted_at`).
- **V11.1–V11.4 (`0038` – `0040`):**
  - **بودجه پویا (`bot_budget_mode`, `bot_budget_usd`, `bot_budget_pct`)**: تعیین سقف سرمایه دلخواه ربات (دلاری یا درصدی) روی ولت بدون جابجایی وجه (`0038`).
  - **دفترچه یادداشت تریدر (`account_notes`)** در داشبورد (`0039`).
  - **دروازه دقیق Onboarding + آکادمی تعاملی چندمرحله‌ای (`OnboardingAcademyModal.tsx`)** و پارامترهای کامل اسنایپر (فیلتر نوع هدف `LISTING | MEME | BOTH` و حداقل نقدینگی `$25,000+`) (`0040`).
- **V11.5 (`0041`):**
  - **بهینه‌سازی عمیق D1 برای ترافیک بالا و Free Tier:** افزودن **۱۵ ایندکس ترکیبی پوششی**، کش حافظه‌ای `settings-cache.ts` (`WeakMap` + TTL 45/60s)، مسیر سبک `?lite=1` برای polling، کاهش alarm بیکاری Durable Object به `90s`، کنترل دوگانه و مستقل انتشار سیگنال (کانال vs پی‌وی ربات)، و **صفحه کامل مدیریت دیتابیس D1 برای مالک** (آمار زنده، Pruning، Backup JSON کامل، Restore با Merge/Replace و Factory Wipe).
- **V11.6 (`0042` – `0044`):**
  - **احراز مالکیت رمزنگاری واقعی Trust Wallet DApp (`0042`):** جدول `trust_wallet_nonces` با انقضای ۵ دقیقه‌ای و بررسی امضای `personal_sign` (`secp256k1 ecrecover` با `@noble/curves`) + پاکسازی کامل Placeholderهای تاریخی.
  - **اجرای واقعی آن‌چین درون مرورگر Trust Wallet DApp:** ویزارد صدور کلید معامله بدون دسترسی برداشت **Hyperliquid EIP-712 `ApproveAgent`**، دریافت مستقیم calldata سوآپ واقعی (`/api/dex/build-swap-tx` با Jupiter v6 و 1inch/ParaSwap)، مجوز محدود روتر DEX + Revoke آنی، و اتوترید واقعی `LIVE + AUTO` در `executor.ts` و `listing-sniper.ts`.
  - **پاکسازی کامل لیست کپی‌ترید پیش‌فرض (`0043`)** و افزودن `sender_address` به فاکتورها.
  - **ثبت‌نام و ورود ۳ مسیره + تکمیل اجباری پروفایل + TOTP 2FA (`0044`):** امکان ثبت‌نام و ورود از سه مسیر (Trust Wallet، Google، Telegram)، دروازه تکمیل پروفایل (`CompleteProfileGate.tsx`) و احراز هویت دوعاملی واقعی **Google Authenticator (`TOTP RFC 6238`)** برای ورود و عملیات حساس.
  - **بروزرسانی اکستنشن مرورگر به نسخه V11.6**.
- **V11.6.5 (پالایش نهایی تولیدی و تضمین کیفیت ۴ حالته):**
  - **بازطراحی ۱۰۰٪ غیرحضانتی رابط مالی (`Zero-Custody UI Audit`):** حذف کامل هرگونه واژه و باکس «واریز سرمایه به خزانه سایت» در `TreasuryBankingHub`, `DexTrustPage`, `SubscriptionPage`, `ServicesPage`, `PortfolioPage`, `Layout`, `SmartCopyProHub` و `PromoBannerCarousel`؛ نمایش شفاف «**خزانه شخصی شما = همان کیف‌پول Trust Wallet خودتان**» با دکمه‌های تنظیم سقف مجاز سرمایه و تفکیک روشن پرداخت صرفاً کارمزد ۳٪ سودهای واقعی یا شارژ اختیاری اعتبار کارمزد.
  - **تقارن ۵ موتوره در حالت ساده (`OverviewPage.tsx`):** تبدیل گرید نامتقارن `lg:grid-cols-6` به **`lg:grid-cols-5`** هم‌عرض (`185×261px`) و اصلاح نوع state پیش‌فرض `hunting`.
  - **تولید و جایگزینی ۳ آیکون ۳D شفاف با آلفای واقعی (`512×512`):** رفع لکه‌های تیره و حفره‌های آلفا در `my-ai-brain-3d.png`, `sniper-rocket-3d.png`, `capital-vault-3d.png`.
  - **کَش‌باستینگ کامل PWA و CDN (`v11.6.5`):** تغییر سیاست `public/sw.js` (`dollarino-pwa-v11.6.5`) به Network-First برای مسیرهای `/`، HTML و `/images/*`، تنظیم هدرهای `no-store` روی `/`، `/index.html` و `/sw.js` در `_headers`، پاکسازی خودکار کش‌های قدیمی در `main.tsx` + بارگذاری مجدد هنگام `controllerchange` و پارامتر `?v=1165`.
  - **تایید جامع ۴ حالته روی سرور زنده (`Desktop Light`, `Desktop Dark`, `Mobile Light`, `Mobile Dark`):** اجرای ۲۱/۲۱ سناریو، ۸۴ اسکرین‌شات تمیز، ۰ خطای JS و ۰ خطای ۵۰۰ سرور.
- **V11.6.6 (بهینه‌سازی شدید خوانش D1، تبدیل WebP و ۶۰fps موبایل — `0045`):**
  - افزودن ۱۰ ایندکس پوششی در `0045_v11_6_6_d1_read_indexes.sql`، کش حافظه‌ای کوتاه‌عمر روی `RPC/Auth/LiveTicks/Quotes`، و بهینه‌سازی باندل WebP (`9.2MB -> 3.5MB`) + سرویس‌ورکر `v11.6.6`.
- **V11.7 (`11.7.0` — بازطراحی استودیو کارت سود `16:9`/`9:16`، تنظیمات پیش‌فرض تمام-خاموش ایمن، اسنایپر ۵ دقیقه و گرافیک Pine v5 — `0046` و `0047`):**
  - **پیش‌فرض‌های کاملاً ایمن (All-OFF) و مرکز تنظیمات کاربر (`0046`):** ساخت حساب‌های جدید با ربات متوقف، تمامی ۵ موتور خاموش (`[]`)، تایید دستی، اعلانات خاموش و اسنایپر خاموش + افزودن `notification_prefs_json` (۵ سوییچ دقیق) و `display_currency` (`USD`/`IRT`) در سایت (`ServicesPage.tsx`) و تلگرام (`دریافت اعلان 🔔`).
  - **فیلترهای پرو ۵ دقیقه‌ای اسنایپر (`0047_v11_7_sniper_pro_filters.sql`):** افزودن `maxPairAgeMinutes` (از ۱ دقیقه تا ۷۲ ساعت)، ۴ پریست آماده (`5M_DEGEN` و ...) و موتور گرافیکی کامل Pine Script v4/v5/v6 (`ta.crossover`, `barssince`, `valuewhen`, باکس‌ها، خطوط، لیبل‌ها و جدول HUD زنده روی چارت).
  - **استودیو کارت سود چندمنبعی (`PERP + DEX + COPY`) با کیفیت استودیویی (`1200×675` و `1080×1920`):** پشتیبانی از ۸ بازه (`24H`, `7D`, `30D`, `3M`, `6M`, `1Y`, `ALL`, `TRADE`)، انتخابگر تک‌معامله بسته، آیکون و لوگوی توکن‌ها، قیمت ورود/خروج، منبع سیگنال، QR وکتور واقعی و جداسازی اعداد فارسی در SVG (`\u200F`).
  - **اکستنشن کروم `11.7.0`، ربات تلگرام، Google OAuth ادمین و ممیزی/ابطال:** رفع باگ `PLATFORM_AI -> CENTRAL_AI`، تنظیم آنی Google OAuth در پنل ادمین و تلگرام، ممیزی/ابطال کارت سود (`POST /api/admin/profit-cards/:id/revoke`) و مانیتورینگ + توقف اضطراری ربات‌های فعال کاربران (`GET /api/admin/active-bots`, `POST /api/admin/users/:id/bot-stop`).
- **V11.7.1 (ذخیره خودکار موتور هنگام استارت، شارژ سولانا در خزانه، و TP/SL درصدی `%`):**
  - **رفع ریشه‌ای ذخیره موتور هنگام کلیک «شروع ربات» (`routes/trading.ts`):** اگر کاربر از وضعیت پیش‌فرض `active_engines_json = '[]'` دکمه «شروع ربات» را بزند، موتور انتخابی (`STRATEGY` / `CENTRAL_AI` / ...) بلافاصله در D1 ذخیره می‌شود تا `TradingBotCoordinator` اجرا شود + راهنمای خطای همگام‌سازی Worker روی Cloudflare Pages.
  - **شارژ سریع خزانه سولانا (`SOL / USDC · Jupiter`) (`routes/trustwallet.ts`, `dex/smart-copy.ts`, `TrustWalletConnectInline.tsx`):** افزودن `POST /api/trustwallet/build-solana-fund-tx` و سازنده بومی `buildUnsignedSolanaTransferTx` + لینک Jupiter بدون نیاز به Approve روتر.
  - **سوییچر دوحالته `قیمت ($) | درصد (%)` در تمام فرم‌های TP/SL (`packages/core/src/tpsl.ts`, `TpSlModeSwitch.tsx`):** چیپ‌های سریع `%` (`-1%..-5%` / `+2%..+20%`)، محاسبه لحظه‌ای قیمت دلاری و نمایش `ROE %` اهرمی در ترمینال، ویرایش معامله، Perp DEX و ادمین.
- **V11.7.2 Final (پنل کناری Chrome، صفرسازی ایمن و معافیت مدیر، ثبت‌نام مستقیم DApp، کد معرف خودکار، نوار قیمت پیوسته و صفحه معرفی کامل):**
  - **صفرسازی امن حساب مدیریتی + معافیت کامل (`resetPrivilegedUserAccountToFreshState`):** حذف/صفرسازی روی اکانت `owner` یا `admin` از مسیرهای `DELETE /api/auth/account` (`ServicesPage.tsx`), `DELETE /api/admin/users/:id` و `POST /api/admin/users/:id/reset-account` (`AdminPage.tsx` `صفرسازی ۰`) تمام موجودی‌ها، معاملات، کیف‌پول‌ها و سوابق را به `۰` بازنشانی می‌کند در حالی که حساب و نقش مدیریتی حفظ می‌شوند؛ همچنین مدیران از کارمزد ۳٪، Rate Limit، حداقل موجودی ۱۰ دلاری و سقف پوزیشن معاف هستند.
  - **اکستنشن کروم `chrome.sidePanel` در حالت ساده اختصاصی (`v11.7.2`):** با کلیک روی آیکون اکستنشن، دلارینو مشابه Trust Wallet درون پنل کناری مرورگر Chrome قفل‌شده در **حالت ساده** (`?ui_mode=simple&embed=sidepanel`) بدون دکمه حالت حرفه‌ای و بدون پاپ‌آپ مزاحم باز می‌شود و فاقد هدرهای مسدودکننده `X-Frame-Options` است.
  - **ثبت خودکار کد معرف مدیر (`resolveEffectiveReferralCode`) + ثبت‌نام مستقیم DApps تراست‌ولت (`tw_signup=1`) + فرم یکپارچه تکمیل پروفایل:** ثبت خودکار کد معرف مدیر برای تمام ثبت‌نام‌های بدون معرف؛ باز شدن مستقیم سایت داخل مرورگر DApps تراست‌ولت برای ثبت‌نام/امضا؛ و دریافت شماره تماس، اسم مستعار، نام کاربری و رمز عبور پس از ورود با کیف‌پول، گوگل یا تلگرام.
  - **نوار قیمت پیوسته بی‌انتها (`LiveTickerBar`) + کلیک مستقیم به صفحه بازارها + بروزرسانی کامل `LandingPage.tsx`:**
    - نوار `LiveTickerBar.tsx` با دو مسیر یکسان و انیمیشن سخت‌افزاری `translate3d(-50%, 0, 0)` و حداقل ۱۶ ارز دیجیتال برتر (`BTC, ETH, SOL, BNB, XRP, DOGE, TON, ADA, AVAX, SUI, LINK, DOT, ...` — بدون افتادن سهام توکنیزه‌شده جای ارزهای اصلی) مشکل سفید شدن پایان چرخه را کاملاً برطرف کرد و در **هر دو حالت ساده و حرفه‌ای** (و نیز لندینگ) نمایش می‌یابد.
    - کلیک روی هر ارز در نوار بالای داشبورد، کاربر را مستقیم به `MarketsPage` (`markets`) هدایت کرده، جستجو را بازنشانی و کارت تمرکز (`market-spotlight-card`) + ردیف پین‌شده همان ارز را نمایش می‌دهد.
    - صفحه معرفی پیش از ورود (`LandingPage.tsx`) با بخش‌های کامل `#whats-new` (`V11.7.2`), `#live-markets` تعاملی متصل به نوار قیمت بالا، ۵ موتور همزمان، اسنایپر ۵ دقیقه، استودیو کارت ۱۶:۹ و ۹:۱۶، و مدل ۰٪ اشتراک / ۳٪ کارمزد سود کاملاً همگام‌سازی شد.

---

## ۴. معماری پایگاه داده (`47` مایگریشن D1)

| بازه مایگریشن | نسخه متناظر | جداول و ستون‌های کلیدی افزوده‌شده / اصلاح‌شده |
| :--- | :--- | :--- |
| `0001` | V1.0 | `users`, `telegram_bots`, `exchange_connections`, `ai_connections`, `bot_configs`, `signals`, `trades`, `audit_logs`, `system_settings` |
| `0002`–`0004` | V2.0 | `bot_configs.{margin_mode, mixer_threshold, kbos_params_json, risk_profile_json}`, دفتر کل کیف‌پول، کالیبراسیون v2 |
| `0005` | V3.0–V4.0 | `subscription_plans`, `user_subscriptions` |
| `0006`–`0007` | V5.0–V5.1 | `platform_ai_engines`, `bot_configs.{scan_scope, allow_auto_flip}` |
| `0008`–`0010` | V6.0–V6.2 | `gift_codes`, `referrals`, `notifications`, `verified_profit_cards`, `bot_configs.{market_type, direction_mode, hedge_mode}` |
| `0011`–`0013` | V7.0–V7.2 | `user_strategies`, `users.{wallet_balance_usdt, web_magic_token, avatar_url}`, `gift_codes.{code_type, credit_usdt}` |
| `0014`–`0015` | V8.0–V8.5 | `copy_traders`, `copy_subscriptions`, `my_ai_profiles`, `support_messages`, `signals.engine_source` |
| `0016`–`0018` | V9.0–V9.6 | `users.{phone_number, phone_verified, trust_wallet_evm, trust_wallet_sol, trust_wallet_tron, signup_ip_hash, signup_ua_hash}`, `dex_trades`, `price_alerts`, `referral_withdrawals`, `rate_limits` |
| `0019`–`0026` | V9.7–V9.9.4 | `users.{display_bio, trust_wallet_ton, preferred_ai_model_id}`, `ai_chat_sessions`, `ai_chat_messages`, ستون تصاویر پشتیبانی/رسید، و اولین سری ایندکس‌های کارایی D1 |
| `0027`–`0031` | V10.0–V10.2 | `onchain_api_providers`, `smart_copy_wallets`, `smart_copy_vaults`, `perp_dex_connections`, `promo_banners`, `scheduled_broadcasts`, همسویی انحصاری Trust Wallet |
| `0032`–`0036` | V10.3–V10.5 | `server_fee_ledger`, `users.{fee_prepaid_credit_usd, fee_penalty_usd}`, تنظیمات شفافیت بنیان‌گذار، `telegram_group_warnings` |
| `0037`–`0040` | V11.0–V11.4 | `bot_configs.{active_engines_json, custom_paper_balance, sniper_*, bot_budget_*, trading_mode_selected}`, `treasury_deposits`, `account_notes`, `users.risk_terms_accepted_at` |
| `0041` | V11.5 | ۱۵ ایندکس ترکیبی (`idx_trades_user_status_mode_closed`, `idx_signals_user_created_desc`, ...), کنترل‌های مستقل انتشار سیگنال |
| `0042`–`0044` | V11.6–V11.6.5 | `trust_wallet_nonces`, پاکسازی آدرس‌های Placeholder و تریدرهای دمو، `sender_address`, `users.{display_name, auth_provider, google_sub, profile_completed, totp_secret, totp_enabled, totp_verified_at}` |
| `0045`–`0047` | V11.6.6–V11.7.2 | ۱۰ ایندکس پوششی خوانش (`0045`) + `bot_configs.{notification_prefs_json, display_currency}` و `verified_profit_cards.{trade_source, entry_price, exit_price, signal_name, token_address, chain_id, token_image_url, revoked}` (`0046`) + ستون‌های فیلتر پیشرفته اسنایپر ۵ دقیقه `bot_configs.{sniper_max_pair_age_minutes, sniper_preset, sniper_pro_filters_json}` (`0047`) |

---

## ۵. موتورهای ترید ۵گانه و اجرای همزمان

در نسخه `V11.0+` به بالا (و نسخه فعلی `V11.7.2`)، تنظیم `bot_configs.active_engines_json` اجازه می‌دهد تا **هر ۵ موتور به طور مستقل یا همزمان** برای هر حساب فعال باشند (و در حساب‌های تازه تمام موتورها برای ایمنی خاموش‌اند تا با شروع ربات، موتور برگزیده ذخیره و فعال شود):

1. **هوش مصنوعی مرکزی دلارینو (`CENTRAL_AI`):** اجماع چندمدلی روی موتورهای ثبت‌شده ادمین (`platform_ai_engines`) و درگاه Hilinkup (`deepseek-v4.1-flash`, OpenAI, Anthropic, Gemini) همراه با فالبک داخلی `dollarino-live-ai` جهت تضمین صفر بودن قطعی.
2. **استراتژی منتخب دُرنا V1 (`DOLLARINO_V01` / `KBOs`):** استراتژی ترکیبی کوانت اختصاصی روی هسته `packages/core/src/strategies.ts` و `kiya-bot.ts` با اسکن کل بازار (`ALL_MARKET` از ۸۰۰+ جفت فیوچرز و ۱۰۰۰+ اسپات) و سوییچ TP/SL درصدی (`%`) و قیمتی (`$`).
3. **هوش مصنوعی شخصی من (`MY_AI`):** پروفایل قابل آموزش کاربر با قوانین معاملاتی، تایم‌فریم‌ها و سبک ریسک شخصی، و امکان اجرای استراتژی‌های سفارشی Pine Script v4/v5/v6 (با پشتیبانی از `ta.*`, باکس، خط، لیبل و جدول HUD) و Python از `user_strategies`.
4. **کپی‌ترید حرفه‌ای (`COPY_TRADE`):** شامل کپی از تریدرهای تاییدشده سایت و **Smart Copy Pro V2** (ردیابی ولت‌های برتر آن‌چین Top-10 و کپی‌ولت اختصاصی ۲۴/۷ با کلید در اختیار کاربر روی EVM و Solana).
5. **اسنایپر لیستینگ و میم‌کوین (`SNIPER`):** پایش پیوسته توکن‌های جدید در `listing-sniper.ts` روی شبکه‌های Solana / BSC / Base با فیلتر سن جفت‌ارز (`maxPairAgeMinutes` از ۱ دقیقه تا ۷۲ ساعت)، پریست‌های حرفه‌ای (`5M_DEGEN`)، فیلتر نقدینگی (`$25K+`)، نمره ضدراگ (`75+`)، مدیریت اسلیپیج و تریلینگ استاپ.

تمام حلقه اجرایی از طریق **Cloudflare Durable Object (`TradingBotCoordinator` در `engine/bot-do.ts`)** با مکانیزم Alarm خودکار (`45s/90s/120s` تطبیقی) و **کرون دقیقه‌ای `* * * * *`** مدیریت می‌شود.

---

## ۶. معماری غیرامانی Trust Wallet DApp، Perp DEX، سولانا و اسنایپر

در معماری نهایی `V11.7.2`:
- **احراز مالکیت کیف‌پول (`routes/trustwallet.ts`):** صدور Nonce یک‌بارمصرف با انقضای ۵ دقیقه‌ای در `trust_wallet_nonces` و تایید رمزنگاری امضای `personal_sign` (EIP-191 + بازیابی کلید عمومی `secp256k1` بدون افشای کلید خصوصی).
- **چندشبکه‌ای بومی (`lib/trustwallet.ts`):** پشتیبانی از EVM (`ETH`, `BSC`, `Base`, `Arbitrum`, `Polygon`, `Optimism`, `Avalanche`)، `Solana` (`SOL / USDC · Jupiter`)، `TON` و `TRON`.
- **شارژ سریع خزانه سولانا و EVM (`POST /api/trustwallet/build-solana-fund-tx`):** ساخت تراکنش آماده انتقال بومی Solana (`SystemProgram::Transfer` در `buildUnsignedSolanaTransferTx`) به همراه لینک مستقیم Jupiter (بدون نیاز به Approve روتر روی سولانا) و دیپ‌لینک `coin=501` در Trust Wallet.
- **Perp DEX بدون دسترسی برداشت (`dex/perp-dex.ts` و `DexTrustPage.tsx`):** تولید کلید اختصاصی معامله‌گر در کلاینت، امضای استاندارد **EIP-712 `HyperliquidTransaction:ApproveAgent`** درون Trust Wallet DApp و رمزنگاری با AES-256-GCM. این کلید **صرفاً حق باز/بسته‌کردن معامله دارد و هیچ حق برداشتی ندارد**.
- **سوآپ و اتوترید واقعی (`POST /api/dex/build-swap-tx`):** ساخت calldata واقعی از مسیرهای Jupiter v6 (Solana) و ParaSwap/1inch/Router (EVM) برای تایید تک‌کلیکی درون DApp؛ و در حالت `LIVE + AUTO` با کپی‌ولت اختصاصی ۲۴/۷ یا کنترل بودجه روی ولت خود کاربر (`bot_budget_mode`)، اجرای واقعی و ثبت `tx_hash`.
- **تنظیم دوحالته TP/SL (`%` و `$`) با محاسبه `ROE %`:** در تمام ترمینال‌ها و فرم‌های مدیریت سفارش، کاربر می‌تواند سطوح SL و TP1–TP3 را بر حسب درصد فاصله قیمتی (`%` با چیپ‌های سریع `-1%..-5%` و `+2%..+20%`) یا قیمت دقیق (`$`) تنظیم کند.
- **Zero-Custody UI (`V11.6.5–V11.7.2`):** تمامی باکس‌ها و دکمه‌های بخش سرمایه (`TreasuryBankingHub.tsx`, `DexTrustPage.tsx`) کاملاً بر **حفظ سرمایه داخل Trust Wallet شخصی کاربر** و **تعیین سقف بودجه مجاز ربات** متمرکز هستند و هیچ مسیر واریز سرمایه به سایت ندارند.

---

## ۷. سیستم مالی ۰٪ اشتراک، ۳ معامله رایگان، کارمزد ۳٪ از سود و معافیت مدیر

- **حذف کامل قفل‌های ۴۰۲ (`paidSubscriptions: false`):** دسترسی به تمام موتورها، ایدئولوژی کدنویسی، چت AI، رادارها و دمو دلخواه (`$50` تا `$10M`) کاملاً آزاد است.
- **مدل کارمزد ۳٪ (`services/server-fee.ts`):**
  - **حساب‌های مدیر و مالک (`owner` / `admin`):** معافیت ۱۰۰٪ از کارمزد ۳٪، Rate Limit، حداقل موجودی ۱۰ دلاری و سقف پوزیشن‌ها (`isUserFeeExempt`).
  - **۳ معامله سودده اول لایو کاربران:** **کاملاً رایگان (`۰٪`)**.
  - **معاملات ضررده لایو:** **کارمزد ۰٪**.
  - **از معامله سودده چهارم به بعد در حالت لایو:** **۳٪ از سود خالص** در `server_fee_ledger` ثبت می‌شود (`۹۷٪` سود خالص برای کاربر).
- **تسویه دو منظوره (`SubscriptionPage.tsx` & `TreasuryBankingHub.tsx`):**
  1. **تسویه بدهی کارمزد ۳٪ سود واقعی:** پرداخت مستقیم از Trust Wallet (BSC BEP20 / TRON TRC20 / سایر شبکه‌ها) به آدرس رسمی ثبت‌شده توسط ادمین در D1 با تایید یا کشف آن‌چین.
  2. **شارژ اختیاری اعتبار کارمزد (`fee_prepaid_credit_usd`):** امکان پیش‌پرداخت اعتبار کارمزد یا تبدیل موجودی پاداش رفرال جهت جلوگیری از توقف ربات حین معاملات متوالی (هرگز به عنوان سرمایه ترید استفاده نمی‌شود).

---

## ۸. امنیت، احراز هویت چندمسیره، رمزنگاری و TOTP 2FA

1. **رمزنگاری لایه‌محافظ (`crypto.ts`):** کلیدهای API، کلید ایجنت Perp و کلیدهای اختیاری ولت ۲۴/۷ با کلید اصلی سرور (`MASTER_ENCRYPTION_KEY`) و الگوریتم **AES-256-GCM** به همراه IV تصادفی یکتا رمزنگاری می‌شوند.
2. **کارت‌های ضدجعل ۱۶:۹ و ۹:۱۶ (`cards/renderer.ts` & `profit-cards.ts`):** تمام کارت‌های سود (`LIVE` یا `DEMO` روی `ALL | PERP | DEX | COPY` و ۸ بازه `24H..ALL + TRADE`) با امضای `HMAC-SHA256` و کد QR وکتور صادر و قابل راستی‌آزمایی یا ابطال در `/verify-card/:cardId` و پنل مدیریت هستند.
3. **ثبت‌نام ۳ مسیره (`auth.ts`, `AuthPage.tsx`, `0044`, `V11.7.2`):**
   - اتصال ۱-کلیکی **Trust Wallet DApp Browser** (دکمه ثبت‌نام مستقیماً درون مرورگر DApps تراست‌ولت با `?auth_screen=1&auth_mode=register&tw_signup=1` باز شده و با Nonce + `ecrecover` امضا می‌شود).
   - ورود و ثبت‌نام از طریق **Google OAuth** (قابل پیکربندی لحظه‌ای از پنل ادمین وب و تلگرام).
   - ورود سریع از طریق ربات و ویجت **Telegram** (همراه با Phone KYC ضد چندحسابی و کد جادویی `/weblogin`).
   - **کد معرف خودکار مدیر (`resolveEffectiveReferralCode`):** در صورت ثبت‌نام کاربر جدید بدون ورود کد معرف، کد معرف مدیر/مالک به صورت خودکار اعمال می‌شود.
4. **دروازه تکمیل یکپارچه پروفایل (`CompleteProfileGate.tsx`):** دریافت **شماره تماس** (با نرمال‌سازی ارقام فارسی/لاتین و قفل ایمن شماره تاییدشده تلگرام)، **اسم مستعار (نام نمایشی)**، **نام کاربری یکتا** و **رمز عبور** برای تمام کاربران ورودی از کیف‌پول، گوگل یا تلگرام.
5. **احراز هویت دوعاملی TOTP (`RFC 6238`) و صفرسازی ایمن مدیر:** تولید سکرت `Base32` و کد QR استاندارد سازگار با Google Authenticator؛ و هنگام اجرای حذف/صفرسازی حساب روی اکانت `owner`/`admin` (`resetPrivilegedUserAccountToFreshState`)، کل داده‌های مالی/معاملاتی به `۰` بازمی‌گردد بدون پاک شدن حساب یا نقش مدیریتی.
6. **Rate Limiting دولایه (`security.ts`):** محدودکننده همزمان در حافظه ایزوله و جدول `rate_limits` در D1 روی ورود، ثبت‌نام، پرداخت، برداشت رفرال، اسکن AI و سفارشات دستی (با معافیت کامل مدیران).

---

## ۹. ربات تلگرام ۲۴/۷، کانال‌ها و مینی‌اپ

ماژول `apps/worker/src/telegram/` دارای ۷ بخش مجزاست:
- **`handler.ts`:** ورود و ثبت‌نام با Phone KYC (با قفل ایمن شماره تاییدشده و دروازه تکمیل مشخصات در اولین ورود وب)، منوهای تاشو، اتصال Trust Wallet و انتخاب شبیه‌ساز، تغییر حالت ساده/حرفه‌ای، تنظیم مقادیر معامله 🪛، منوی دقیق **`دریافت اعلان 🔔`** (تغییر واحد نمایش `USD/IRT` و ۵ سوییچ دقیق اعلان‌ها همگام با سایت)، دستور **`/card`** برای صدور کارت سود `۱۶:۹` و **`۹:۱۶ استوری`** در ۸ بازه زمانی (از `24H` تا `6M` و تک‌معامله `TRADE`), تحلیل چارت با ارسال عکس به ربات، مدیریت پوزیشن‌های باز و بسته‌کردن دستی، پشتیبانی آنلاین با ارسال عکس، و `My AI`.
- **`admin-menu.ts`:** پنل مدیریت ۹-بخشی کامل در تلگرام قفل‌شده روی شناسه مالک (`944021185`) با تایم‌اوت ۱۵ دقیقه‌ای، ثبت/ویرایش لحظه‌ای کلیدهای `Google OAuth` و خروجی مستقیم فایل‌های CSV/Excel و JSON.
- **`publisher.ts` & `formatter.ts`:** ارسال خودکار سیگنال‌های تاییدشده، کارت‌های بسته‌شدن معامله (`TP1/TP2/TP3` و `SL` با ساعت تهران)، اخبار و هشدارهای AI با **کنترل مستقل روشن/خاموش برای کانال‌ها در برابر پی‌وی ربات کاربران** (`publish_signals_to_channels` / `publish_signals_to_bot_users`).
- **`group-moderator.ts`:** نظارت خودکار بر گروه‌های تلگرامی، اخطار و کنترل اسپم (`telegram_group_warnings`).

---

## ۱۰. معماری فرانت‌اند و اکستنشن کروم MV3 (`V11.7.2`)

- **صفحات فرانت‌اند (`18` صفحه در `apps/web/src/pages/`):**
  `LandingPage` (بروزرسانی کامل V11.7.2 با بخش `#whats-new`, `#live-markets` تعاملی، ۵ موتور، کپی‌ترید V2، مدل ۰٪ اشتراک و کارمزد ۳٪، سوالات متداول و فوتر) · `AuthPage` (ثبت‌نام مستقیم DApps تراست‌ولت + Google + Telegram) · `OverviewPage` (ساده ۵-کارته + حرفه‌ای) · `DexTrustPage` · `CopyConnectPage` · `SniperPage` · `MarketsPage` (با کارت تمرکز اختصاصی `market-spotlight-card` و پین خودکار ارز برگزیده از نوار قیمت) · `TerminalPage` (با سوییچر `%` و `$` برای SL/TP1-3) · `RadarLabPage` (ویرایشگر گرافیکی کامل Pine Script v4/v5/v6 + Python + Visual) · `MyAiPage` · `AiChatPage` · `PortfolioPage` · `SubscriptionPage` (کارمزد ۳٪ + رفرال) · `ServicesPage` (پروفایل، ۲FA، تنظیمات اعلان/ارز و صفرسازی حساب مدیریتی) · `WeeklyCardPage` (استودیو کارت سود `16:9` و `9:16` در ۸ بازه) · `VerifyCardPage` · `FaqPage` · `AdminPage` (مرکز فرماندهی مالک، ابطال کارت سود، مانیتورینگ ربات‌ها، صفرسازی ۰ و مدیریت D1).
- **نوار قیمت زنده پیوسته (`LiveTickerBar.tsx` + `index.css`):**
  - با رندر دو ردیف هم‌تراز (`>= 16` ارز دیجیتال برتر در هر ردیف با اولویت `BTC, ETH, SOL, BNB, XRP, DOGE, TON, ADA, AVAX, SUI, LINK, DOT, TRX, NEAR, LTC, ARB, OP`) داخل کانتینر `dir="ltr" overflow-hidden` و انیمیشن سخت‌افزاری `translate3d(-50%, 0, 0)` چرخش کاملاً نرم و **بدون هرگونه فضای سفید انتهای چرخه** در دسکتاپ، موبایل و پنل کناری دارد.
  - در هر دو حالت **ساده** و **حرفه‌ای** (و صفحه معرفی) قابل کلیک است و در داشبورد با کلیک روی هر ارز، مستقیماً `MarketsPage` را با تمرکز روی همان ارز باز می‌کند.
- **کامپوننت‌های اختصاصی کلیدی (`38+` مورد):** `LiveTickerBar` · `TpSlModeSwitch` · `Layout` · `ProDropdown` · `SmoothSlider` · `FloatingAiChat` · `TreasuryBankingHub` · `SmartCopyProHub` · `DexScreenerRadarPanel` · `SniperWorkbench` · `OnboardingAcademyModal` · `CompleteProfileGate` · `CandlestickChart` · `StrategyIdePanel` · `TrustWalletConnectInline` · `PerpDexPanel` · `CoinIcon` & `BrandLogos`.
- **تم روز و شب (`paper` و `cosmic`):** ذخیره در `dollarino_look` و همگام‌سازی فوری با `data-theme` و کلاس `.theme-light` / `.dark`.
- **اکستنشن مرورگر (`apps/extension/`, Manifest V3 `11.7.2` · `Native Chrome Side Panel`):**
  - استفاده از API بومی `chrome.sidePanel` (`side_panel: { default_path: "sidepanel.html" }` + `openPanelOnActionClick: true`) تا دلارینو دقیقاً مانند Trust Wallet کنار پنجره مرورگر Chrome چسبیده بماند.
  - قفل اجباری روی **حالت ساده اختصاصی (`?ui_mode=simple&embed=sidepanel`)** بدون نمایش دکمه حالت حرفه‌ای یا پاپ‌آپ مزاحم، با پشتیبانی از فایل آماده دانلود در `/downloads/dollarino-extension.zip`.

---

## ۱۱. فهرست کامل مسیرهای API بک‌اند (`apps/worker`)

| فایل روتر | پیشوند مسیر | وظیفه و اندپوینت‌های اصلی |
| :--- | :--- | :--- |
| `auth.ts` + `index.ts` | `/api/auth/*`, `/api/public/*` | `login`, `register`, `google`, `wallet/nonce`, `wallet/verify`, `complete-profile`, `telegram-magic-login`, `session`, `profile`, `avatar`, `DELETE /account` (صفرسازی امن برای مدیر), `totp/*`, `creator`, `health`, `verify-card/:cardId`, `market-snapshot` (۱۶ ارز برتر), `ai-models`, `ai-chat` |
| `trustwallet.ts` | `/api/trustwallet/*` | `nonce`, `connect`, `status`, `balances`, `sync-all`, `budget`, `build-solana-fund-tx` (شارژ خزانه سولانا) |
| `dex.ts` | `/api/dex/*` | `radar`, `ai-analyze`, `build-swap-tx`, `perp-approve-agent`, `perp-connect`, `positions`, `track-trade` |
| `trading.ts` | `/api/trading/*` | `dashboard` (`?lite=1`), `bot/start` (ذخیره خودکار موتور)، `bot/toggle`, `bot/config`, `orders/manual`, `positions/close`, `ai-scan-now`, `sniper/scan-now`, `strategies/*`, `alerts/*`, `cards/*` (۱۶:۹ و ۹:۱۶ + ۸ بازه), `notes/*`, `live-ticks` (`?poll=1`), `events/stream` |
| `copy-trade.ts` | `/api/copy/*` | `traders`, `follow`, `unfollow`, `smart-wallets`, `top-whales`, `vaults/*` (تنظیمات و کلید اختصاصی کاربر) |
| `connections.ts` | `/api/connections/*` | مدیریت اتصالات شبیه‌ساز/والت، کلیدهای اکستنشن و وضعیت همگام‌سازی |
| `my-ai.ts` | `/api/my-ai/*` | آموزش پروفایل شخصی، گفتگو با مربی استراتژی و فعال‌سازی روی ربات |
| `ai-assistant.ts` | `/api/ai-assistant/*` | چت چندمدلی با تاریخچه جلسات، انتخاب مدل، تحلیل تصویر چارت و تبدیل به سیگنال |
| `chart-ai.ts` | `/api/chart-ai/*` | تحلیل تکنیکال چارت روی نماد/تایم‌فریم زنده در ترمینال |
| `subscriptions.ts` | `/api/subscriptions/*` | دفترکل کارمزد ۳٪ (معافیت مدیر)، پرداخت یا شارژ اختیاری اعتبار کارمزد، کشف تراکنش، باشگاه رفرال و برداشت پاداش |
| `support.ts` | `/api/support/*` | ارسال تیکت متنی/تصویری، سوئیچ `AI ⇄ HUMAN_ADMIN` و پاسخ آنی پشتیبانی |
| `webhooks.ts` | `/api/webhook/*` | وب‌هوک تلگرام، وب‌هوک TradingView Alerts و تایید سیگنال‌ها |
| `admin.ts` | `/api/admin/*` | مرکز فرماندهی مالک: `overview`, `users/*` (incl. `POST /users/:id/reset-account`), `signal-controls`, `profit-cards/*` (incl. `revoke`), `active-bots`, `users/:id/bot-stop`, `ai-engines/*`, `payments/*`, `broadcasts/*`, `banners/*`, `founder-profile`, `database/{stats,backup,restore,wipe}`, `prune-logs` |

---

## ۱۲. راهنمای استقرار، متغیرهای محیطی و نگهداری D1

### ۱. نصب، بیلد و تست کامل
```bash
npm install
npx wrangler d1 migrations apply dollarino-db --local   # یا --remote برای کلادفلر تولیدی
npm run typecheck
npm test
npm run build
```

### ۲. Secretهای الزامی در Cloudflare
```bash
npx wrangler secret put MASTER_ENCRYPTION_KEY
npx wrangler secret put SESSION_JWT_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put HILINKUP_API_KEY
```

### ۳. استقرار نهایی همزمان روی Cloudflare Workers و Cloudflare Pages
```bash
npx wrangler d1 migrations apply dollarino-db --remote
npx wrangler deploy
npx wrangler pages deploy apps/web/dist --project-name=dollarino
```

### ۴. بررسی سلامت پس از استقرار
- `GET /api/health` باید `"ok": true`, `"version": "11.7.2"` و `"paidSubscriptions": false` را برگرداند.
- `GET /api/public/market-snapshot?symbol=BTCUSDT` باید تا `16` جفت‌ارز برتر کریپتویی برگرداند.
- هدرهای `/`, `/index.html`, `/sw.js` باید `Cache-Control: no-cache, no-store, must-revalidate` و بدون هرگونه `X-Frame-Options` باشند تا PWA و Chrome Side Panel بدون تداخل کش کار کنند.
- از بخش **مدیریت ← دیتابیس (بکاپ/پاکسازی)** می‌توانید در هر لحظه از D1 بکاپ کامل `.json` تهیه کنید یا لاگ‌های قدیمی بالای ۳۰ روز را هرس نمایید.
