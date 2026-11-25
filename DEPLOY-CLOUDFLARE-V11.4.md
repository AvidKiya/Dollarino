# راهنمای جامع استقرار و راه‌اندازی نسخه **Dollarino V11.4 Production** روی کلادفلر

> **بنیان‌گذار و معمار نرم‌افزار:** آوید کیا (`Avid Kiya`)  
> **نسخه:** `V11.4` (ارتقایافته بر پایه هسته V11.3)

---

## تغییرات کلیدی نسخه V11.4

1. **گیت اجباری پیش از اولین معامله (انتخاب حساب دمو / واقعی + پذیرش قوانین ریسک):**
   - هیچ سفارشی (نه از ربات اتومات، نه اسکن لحظه‌ای، نه خرید اسنایپر، نه کپی‌ترید و نه دکمه‌های تلگرام) تا قبل از تکمیل هر دو شرط (`trading_mode_selected = 1` و `risk_terms_accepted_at IS NOT NULL`) اجرا نمی‌شود و API با وضعیت `403` و کدهای `ONBOARDING_GATE_REQUIRED` / `TRADING_MODE_SELECTION_REQUIRED` / `RISK_TERMS_REQUIRED` پاسخ می‌دهد.
   - یک بنر راهنمای یکپارچه در صفحه نمای کلی (ساده و حرفه‌ای) و یک مودال شفاف در صورت کلیک زودهنگام روی «شروع ربات» نمایش داده می‌شود؛ در تلگرام نیز دکمه‌های یکپارچه‌ی `tg_onboard_mode:*` و `tg_onboard_accept` در همه نقاط شروع پیاده‌سازی شده‌اند.
   - مایگریشن جدید: `migrations/0040_v11_4_onboarding_sniper.sql`.

2. **حذف رفرش دستی نرخ تتر و همگام‌سازی خودکار زنده با مرجع ارزدیجیتال (`ArzDigital`):**
   - در `apps/worker/src/exchanges/iran-rate.ts` نرخ زنده تتر به تومان با اولویت مستقیم صفحه زنده ارزدیجیتال (`https://arzdigital.com/coins/tether/`) خوانده می‌شود و در صورت اختلال موقت به نوبیتکس/تترلند fallback می‌کند (کش سروری ۱۰ ثانیه‌ای).
   - تمام دکمه‌های دستی به‌روزرسانی نرخ تتر از صفحات وب حذف شدند و کلاینت در حالت فعال (`document.visibilityState === 'visible'`) هر ۱۲ ثانیه به طور خودکار نرخ ریالی/تومانی را همگام‌سازی می‌کند.

3. **میز حرفه‌ای یکپارچه «شکارچی ارزهای جدید و میم‌کوین‌های پرشتاب» (`SniperWorkbench`):**
   - کامپوننت مستقل `SniperWorkbench.tsx` در هر دو نمای **ساده** (هنگام روشن بودن موتور اسنایپر) و **حرفه‌ای** فعال شده و جایگزین کارت ساده قبلی شده است.
   - امکانات کامل قابل‌ذخیره در D1 (۱۱ ستون جدید در `bot_configs`):
     - **هدف شکار:** فقط لیستینگ‌های جدید (`NEW_LISTING`)، فقط میم‌کوین‌های پامپی (`MEME_PUMP`) یا هر دو (`BOTH`).
     - **نحوه اجرا:** خرید خودکار طبق فیلترها (`autoExecute`) یا صرفاً هشدار و خرید با تایید کاربر (`alert-only` و خرید ۱-کلیکی هر کاندیدا).
     - **شبکه‌های هدف:** `solana`, `bsc`, `base`, `ethereum`, `ton`, `arbitrum`.
     - **پارامترهای کنترل ریسک:** مبلغ هر شکار (`budgetUsd` با معادل تومانی زنده)، حداقل امتیاز ایمنی (`minSafetyScore`)، حداقل نقدینگی (`minLiquidityUsd`)، حداکثر سن جفت‌ارز (`maxPairAgeHours`)، سقف مالیات توکن (`maxTaxPct`)، حد سود (`tpPct`)، حد ضرر (`slPct`)، تریلینگ استاپ (`trailingEnabled` / `trailingPct`)، لغزش مجاز (`slippagePct`) و سقف پوزیشن همزمان (`maxOpenPositions`).
     - اندپوینت‌های جدید: `GET /api/trading/sniper`, `POST /api/trading/sniper`, `POST /api/trading/sniper/scan-now`, `POST /api/trading/sniper/buy-candidate`.

4. **ارتقای کارت‌های ۵ موتور به گرافیک ۳بعدی شفاف و بازطراحی ادبیات «مدیریت سرمایه»:**
   - تمام کارت‌های ۵ موتور در نمای حرفه‌ای و ساده به آیکون‌های ۳بعدی شفاف `RGBA` (`/images/transparent/*.png`) مجهز شدند.
   - تمام عبارات قدیمی «تنظیم بر اساس بودجه / Budget Defaults» به **«مدیریت سرمایه / Capital Management»** تغییر یافتند.

---

## پیش‌نیازهای استقرار در کلادفلر (`Cloudflare Workers + D1 + Durable Objects`)

### ۱. استخراج و آماده‌سازی پروژه
```bash
unzip Dollarino-V11.4.zip -d Dollarino
cd Dollarino
npm install
```

### ۲. ساخت و اتصال پایگاه داده Cloudflare D1 (یا ارتقای دیتابیس فعلی)
```bash
# در صورت نصب تازه:
npx wrangler d1 create dollarino-db
```
سپس تمام مایگریشن‌ها (`0001` تا `0040`) را اعمال کنید (اگر از نسخه V11.3 ارتقا می‌دهید، مایگریشن `0040_v11_4_onboarding_sniper.sql` اعمال می‌شود):
```bash
npx wrangler d1 migrations apply dollarino-db --remote
```

### ۳. تنظیم Secretهای ضروری روی Worker
```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put HILINKUP_API_KEY
```

### ۴. بیلد کامل فرانت‌اند و استقرار Worker
```bash
npm run build
npx wrangler deploy
```

### ۵. راه‌اندازی یا بررسی وب‌هوک تلگرام و TradingView (ادمین)
پس از استقرار، وارد پنل مدیریت وب‌سایت -> تب **عملیات تلگرام و کانال‌ها** شوید و روی **«ست وب‌هوک تلگرام»** بزنید. وب‌هوک اختصاصی TradingView نیز از همان بخش قابل کپی است.

---

## راستی‌آزمایی و تست‌ها (وضعیت تاییدشده پیش از تحویل V11.4)
- تست‌های واحد هسته (`@dollarino/core`): **۱۵/۱۵ پاس**
- تست‌های یکپارچه سرور و D1 (`@dollarino/worker` در ۹ مجموعه تست شامل گیت پیش از معامله، میز اسنایپر، نرخ لحظه‌ای ارزدیجیتال و تلگرام): **۶۱/۶۱ پاس**
- بررسی تایپ‌اسکریپت (`core` + `worker` + `web`): **۰ خطا**
- بیلد تولیدی Vite + `wrangler deploy --dry-run`: **موفق (۰ خطا)**
- تست مرورگر واقعی Playwright (دسکتاپ + موبایل 390px + لایت/دارک + ساده/حرفه‌ای + گیت اجباری + اسنایپر + بدون اسکرول افقی + ۰ خطای کنسول/5xx): **۱۶/۱۶ پاس**
