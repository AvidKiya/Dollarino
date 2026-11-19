# راهنمای گام‌به‌گام نصب روی GitHub و Cloudflare Pages (دلارینو)

این پروژه به صورت **۱۰۰٪ رایگان و متن‌باز** طوری طراحی شده که فایل‌های این ZIP را مستقیماً در **GitHub** قرار دهید و به **Cloudflare Pages + Workers + D1** متصل کنید.

---

## مرحله ۱: قرار دادن پروژه در GitHub
۱. یک ریپازیتوری جدید (Public یا Private) در گیت‌هاب بسازید.
۲. فایل‌های داخل این ZIP را آنزیپ کرده و در ریشه ریپازیتوری آپلود/Push کنید (مطمئن شوید `package.json` و `wrangler.toml` مستقیماً در ریشه ریپازیتوری باشند، نه داخل یک پوشه اضافه).

---

## مرحله ۲: ساخت دیتابیس D1 و دیپلوی بک‌اند (Cloudflare Worker)
روی سیستم خودتان (یا از طریق GitHub Actions داخل `.github/workflows/deploy.yml`) دستورات زیر را اجرا کنید:

```bash
npm install
npx wrangler login
npx wrangler d1 create dollarino-db
```
شناسه (`database_id`) که کلادفلر به شما می‌دهد را داخل فایل `wrangler.toml` جایگزین `local-dev-db` کنید و سپس مایگریشن‌ها را روی دیتابیس آنلاین اعمال کنید:
```bash
npx wrangler d1 migrations apply dollarino-db --remote
```
کلیدهای امنیتی رمزنگاری AES-256 و نشست‌ها را ثبت کنید:
```bash
openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
openssl rand -hex 32 | npx wrangler secret put SESSION_JWT_SECRET
```
*(اختیاری: اگر ربات تلگرام اصلی سیستم دارید:)*
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```
سپس ورکر را دیپلوی کنید:
```bash
npx wrangler deploy
```

> 💡 **نکته:** اگر از **GitHub Actions** استفاده کنید، کافی است دو مقدار `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID` را در GitHub Repo Secrets وارد کنید تا هر بار که Push می‌کنید، خودکار مایگریشن، Worker و Pages آپدیت شوند.

---

## مرحله ۳: اتصال مستقیم GitHub به Cloudflare Pages (از پنل کلادفلر)
۱. وارد پنل Cloudflare شوید -> **Workers & Pages** -> **Create** -> تب **Pages** -> **Connect to Git**.
۲. ریپازیتوری گیت‌هاب خودتان را انتخاب کنید.
۳. تنظیمات بیلد را دقیقاً به شکل زیر وارد کنید:
   - **Project name:** `dollarino`
   - **Production branch:** `main`
   - **Root directory:** `/` *(خالی / ریشه)*
   - **Build command:** `npm run build`
   - **Build output directory:** `apps/web/dist`
4. دکمه **Save and Deploy** را بزنید.

### اتصال فرانت‌اند Pages به بک‌اند Worker (بسیار مهم!)
پروکسی داخلی `/functions/api/[[path]].ts` درخواست‌های `/api/*` را به بک‌اند شما هدایت می‌کند. برای فعال شدن آن، در صفحه پروژه **Pages** وارد مسیر زیر شوید:
**Settings -> Functions / Bindings** (یا Environment Variables):
- **روش اول (پیشنهادی - سریع‌تر و بدون هاپ اینترنتی):** یک **Service Binding** اضافه کنید با نام دقیق **`WORKER_API`** و آن را به سرویس **`dollarino-worker`** متصل کنید.
- **روش دوم:** یک متغیر محیطی (Environment Variable) با نام **`WORKER_URL`** بسازید و آدرس ورکر دیپلوی‌شده را داخل آن قرار دهید (مثلاً `https://dollarino-worker.yourname.workers.dev`).

پس از افزودن Binding یا Variable، یک بار از بخش Deployments گزینه **Retry deployment** را بزنید تا اتصال برقرار شود.

---

## مرحله ۴: شروع کار در وب‌اپ
- آدرس سایت `https://dollarino.pages.dev` (یا دامنه شخصی شما) را باز کنید.
- **اولین کاربری که ثبت‌نام می‌کند به صورت خودکار مالک اصلی سیستم (`owner`) می‌شود.**
- از منوی **راه‌اندازی سریع (Setup Wizard)** یا تب **اتصالات** صرافی موردنظر (**Toobit**، **KCEX Mirror**، **Bitunix** یا **Paper**) را متصل کنید تا تمام ارزهای آن صرافی فوراً بارگذاری شوند.
