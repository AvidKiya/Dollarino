# راهنمای استقرار Dollarino v5.0 روی GitHub و Cloudflare Pages

پروژه **دلارینو (Dollarino v5.0)** آماده استقرار مستقیم از طریق **GitHub** روی **Cloudflare Pages + Workers + Durable Objects + D1** است.

---

## مرحله ۱: قرار دادن پروژه در GitHub
۱. یک ریپازیتوری جدید (پیشنهادی: **Private**) در GitHub بسازید.
۲. فایل‌های این آرشیو را استخراج کرده و مستقیماً در ریشه ریپازیتوری آپلود/Push کنید (`package.json` و `wrangler.toml` باید در ریشه باشند).

---

## مرحله ۲: ساخت دیتابیس D1 و دیپلوی بک‌اند (Cloudflare Worker)
```bash
npm install
npx wrangler login
npx wrangler d1 create dollarino-db
```
شناسه (`database_id`) دریافتی را داخل `wrangler.toml` جایگزین `local-dev-db` کنید و هر ۶ مایگریشن (`0001` تا `0006`) را اعمال کنید:
```bash
npx wrangler d1 migrations apply dollarino-db --remote
```
کلیدهای امنیتی رمزنگاری AES-256 و JWT را تنظیم کنید:
```bash
openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
openssl rand -hex 32 | npx wrangler secret put SESSION_JWT_SECRET
```
*(اختیاری: برای فعال‌سازی ربات تلگرام اصلی سیستم:)*
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```
سپس ورکر را دیپلوی کنید:
```bash
npx wrangler deploy
```

> 💡 **نکته GitHub Actions:** با قرار دادن `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID` در GitHub Secrets، ورک‌فلو `.github/workflows/deploy.yml` پس از هر Push به‌صورت خودکار مایگریشن‌ها، Worker و Pages را منتشر می‌کند.

---

## مرحله ۳: اتصال GitHub به Cloudflare Pages
۱. در پنل Cloudflare -> **Workers & Pages** -> **Create** -> تب **Pages** -> **Connect to Git**.
۲. تنظیمات بیلد را وارد کنید:
   - **Project name:** `dollarino`
   - **Production branch:** `main`
   - **Root directory:** `/`
   - **Build command:** `npm run build`
   - **Build output directory:** `apps/web/dist`
۳. برای پروکسی `/api/*` داخل `functions/api/[[path]].ts`:
   - در **Settings -> Bindings / Functions** یک **Service Binding** با نام **`WORKER_API`** متصل به سرویس **`dollarino-worker`** بسازید (یا `WORKER_URL` را روی آدرس Worker تنظیم کنید).
4. گزینه **Retry deployment** را بزنید.

---

## مرحله ۴: راه‌اندازی پنل مدیریت، هوش مصنوعی مرکزی و صرافی‌ها
۱. اولین کاربری که ثبت‌نام می‌کند به صورت خودکار مالک سیستم (`owner`) می‌شود.
۲. وارد تب **مدیریت (Admin)** شوید و:
   - در بخش **«موتور هوش مصنوعی مرکزی (۱ تا ۳ مدل)»** از ۱ تا ۳ مدل (مثل DeepSeek، Claude، GPT یا Gemini) را وارد، تست (`پینگ زنده`) و با حالت اجماع دلخواه ذخیره کنید. تمام کلیدها با AES-256 روی سرور رمزنگاری می‌شوند و کاربران بدون نیاز به API شخصی از هوش مصنوعی مرکزی استفاده می‌کنند.
   - آدرس کیف‌پول تتر TRC20، شماره کارت بانکی و اشتراک‌ها را تنظیم کنید.
۳. کاربران در صفحه ورود می‌توانند با یک کلیک **«تست رایگان دمو (شروع فوری)»** استراتژی **دلارینو V0.1** را امتحان کنند یا در تب **اتصالات** حساب **Toobit** و **KCEX** خود را متصل نمایند.
