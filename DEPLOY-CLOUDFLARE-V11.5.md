# راهنمای جامع استقرار و راه‌اندازی نسخه **Dollarino V11.5 Production** روی کلادفلر

> **بنیان‌گذار و معمار نرم‌افزار:** آوید کیا (`Avid Kiya`)  
> **نسخه:** `V11.5` (بهینه‌سازی مصرف D1/Worker، حذف کامل اشتراک، کنترل دوگانه انتشار سیگنال و پنل مدیریت دیتابیس)

---

## تغییرات کلیدی نسخه V11.5

1. **بهینه‌سازی عمیق مصرف Cloudflare D1 و Worker (مناسب و آماده برای سقف رایگان و ترافیک بالا):**
   - **مایگریشن `migrations/0041_v11_5_indexes_and_controls.sql`:** افزودن **۱۵ ایندکس ترکیبی (`CREATE INDEX IF NOT EXISTS`)** روی پرمصرف‌ترین جداول (`trades`, `signals`, `dex_trades`, `bot_configs`, `audit_logs`, `server_fee_ledger`, `user_subscriptions`, `promo_banners`, `copy_traders` و ...) برای حذف اسکن کامل جدول‌ها (`D1 Rows Read`).
   - **کش هوشمند حافظه‌ای تنظیمات و کپی‌ترید (`apps/worker/src/services/settings-cache.ts`):** کش با ایزوله‌سازی `WeakMap<D1Database>` با TTL ۴۵ ثانیه برای `system_settings` و ۶۰ ثانیه برای لیست عمومی `copy_traders` + invalidation فوری هنگام ذخیره در پنل وب یا ربات تلگرام (در حالی‌که تایمرهای عملیاتی `intel_last_*` همیشه لحظه‌ای خوانده می‌شوند).
   - **کد بهینه داشبورد (`/api/trading/dashboard?lite=1`):** ادغام ۵ کوئری آمار PnL در یک کوئری، جایگزینی `OR` در جدول `signals` با `UNION ALL` ایندکس‌شده، تک‌اسکن `closedSeriesRaw` برای نمودارها، و مسیر سبک `?lite=1` برای polling پس‌زمینه.
   - **کاهش ترافیک پس‌زمینه:** افزایش فاصله alarm حالت بیکاری `TradingBotCoordinator` به `90s`، throttle ۳۰ دقیقه‌ای `syncAutoTopSiteTraders` و gating کرون، و توقف خودکار polling کلاینت هنگام مخفی بودن تب مرورگر (`document.visibilityState === 'visible'`).

2. **حذف کامل اشتراک ماهانه (۰٪ اشتراک) و هم‌راستایی ۱۰۰٪ منافع با کاربر:**
   - حذف تمام گیت‌های قدیمی `SUBSCRIPTION_REQUIRED` (`402`) از APIها، تلگرام و فرانت‌اند؛ تمام ابزارها، دمو دلخواه ($50 تا $10M) و ۲۵+ اندیکاتور همواره برای همه رایگان هستند.
   - ۳ معامله سودده اول در حالت لایو کاملاً رایگان (`۰٪`) و از معامله چهارم فقط **۳٪ کارمزد سرور از سود خالص معاملات موفق لایو** (`۹۷٪` سود برای کاربر) محاسبه می‌شود.
   - افزودن بخش شفاف «تفاوت بزرگ دلارینو با پلتفرم‌های اشتراکی» در صفحه ورود، صفحه کارمزد و آکادمی، همراه با قابلیت تبدیل پاداش رفرال مستقیم به اعتبار کارمزد ۳٪ (`fee_prepaid_credit_usd`).

3. **کنترل مستقل انتشار سیگنال (کانال‌های تلگرام vs پی‌وی ربات کاربران):**
   - سوئیچ‌های آنی `publish_signals_to_channels` و `publish_signals_to_bot_users` در هدر مرکز فرماندهی و تب تلگرام پنل مدیریت + اندپوینت `POST /api/admin/signal-controls`.
   - می‌توان به‌صورت لحظه‌ای انتشار سیگنال را فقط برای کانال‌ها روشن/خاموش کرد بدون قطع کردن ارسال به ربات کاربران، یا برعکس.

4. **مرکز فرماندهی مدرن مالک و مدیریت جامع دیتابیس D1 (Owner Only):**
   - هدر شیشه‌ای گرادیانت جدید Command Center با تب‌های سریع بالا.
   - بخش کامل **بانک اطلاعاتی D1** ویژه مالک اصلی (`isSystemOwner`):
     - `GET /api/admin/database/stats`: آمار لحظه‌ای جداول، ایندکس‌ها، ردیف‌ها و حجم دیتابیس.
     - `POST /api/admin/prune-logs`: پاکسازی هدفمند رکوردهای زائد (`AUDIT_ONLY`, `SIGNALS_30D`, `NEWS_30D`, `ALL_STALE`).
     - `GET /api/admin/database/backup`: دانلود فایل کامل JSON بکاپ (`dollarino-d1-backup-v1`) با گزینه اختیاری حذف سکرت‌ها (`?excludeSecrets=1`).
     - `POST /api/admin/database/restore`: بازیابی امن از فایل `.json` در دو حالت `MERGE` یا `REPLACE` (با تطبیق خودکار ستون‌ها).
     - `POST /api/admin/database/wipe`: ریست داده‌های عملیاتی (`OPERATIONAL_RESET` با حفظ کاربران و تنظیمات) یا پاکسازی کامل کارخانه (`FULL_FACTORY_WIPE` با گزینه حفظ حساب مالک).
   - ابزارهای مالک روی کاربران: اعطای اعتبار کارمزد `+$5`، بخشش/تسویه بدهی کارمزد ۳٪، و حذف کامل کاربر.

---

## پیش‌نیازهای استقرار در کلادفلر (`Cloudflare Workers + D1 + Durable Objects`)

### ۱. استخراج و آماده‌سازی پروژه
```bash
unzip Dollarino-V11.5.zip -d Dollarino
cd Dollarino
npm install
```

### ۲. ساخت و ارتقای پایگاه داده Cloudflare D1
```bash
# در صورت نصب تازه:
npx wrangler d1 create dollarino-db
```
سپس تمام مایگریشن‌ها (`0001` تا `0041`) را اعمال کنید (اگر از نسخه V11.4 ارتقا می‌دهید، مایگریشن `0041_v11_5_indexes_and_controls.sql` با ۱۵ ایندکس جدید و تنظیمات سیگنال اعمال می‌شود):
```bash
npx wrangler d1 migrations apply dollarino-db --remote
```

### ۳. تنظیم Secretهای ضروری روی Worker
```bash
npx wrangler secret put SESSION_JWT_SECRET
npx wrangler secret put MASTER_ENCRYPTION_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put HILINKUP_API_KEY
```

### ۴. بیلد کامل فرانت‌اند و استقرار Worker
```bash
npm run build
npx wrangler deploy
```

### ۵. تنظیم وب‌هوک تلگرام و بررسی سلامت
پس از استقرار:
1. آدرس `https://<your-worker>/api/health` را باز کنید و مطمئن شوید `"version": "11.5.0"` و `"paidSubscriptions": false` برگردانده می‌شود.
2. وارد پنل مدیریت -> تب **سیگنال و تلگرام** شوید و وب‌هوک تلگرام و آیدی کانال‌ها را تایید کنید.
3. از تب **دیتابیس (بکاپ/پاکسازی)** قبل از هر تغییر بزرگ یک بکاپ `.json` دانلود نمایید.

---

## راستی‌آزمایی و تست‌ها (وضعیت تاییدشده پیش از تحویل V11.5)
- تست‌های واحد هسته (`@dollarino/core`): **۱۵/۱۵ پاس**
- تست‌های یکپارچه سرور و D1 (`@dollarino/worker` در ۱۰ مجموعه تست شامل `v115-upgrade.test.ts` برای کش، کنترل دوگانه سیگنال، حذف قفل ۴۰۲، آمار D1، بکاپ، بازیابی و پاکسازی): **۶۴/۶۴ پاس**
- بررسی تایپ‌اسکریپت (`core` + `worker` + `web`): **۰ خطا**
- بیلد تولیدی Vite + `wrangler deploy --dry-run` (`1502.89 KiB` gzip): **موفق**
- تست مرورگر واقعی Playwright + بررسی بصری اسکرین‌شات‌ها (صفحه ورود، آکادمی، کارمزد ۳٪، هدر جدید Command Center، تاگل کانال/ربات، صفحه مدیریت دیتابیس D1، نمای موبایل `390px`، ۰ خطای `402` و ۰ خطای کنسول): **تایید کامل**
