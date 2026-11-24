# راهنمای استقرار واقعی (Production) پلتفرم Dollarino V10.1 روی Cloudflare

این نسخه کاملاً برای اجرای **واقعی (Non-Demo / Production)** روی **Cloudflare Workers + Static Assets + D1 Database + Durable Objects** آماده شده است.

---

## ۱. پیش‌نیازهای کلیدی Production
- حساب **Cloudflare** (Workers Paid برای Durable Objects 24/7 یا پلن استاندارد)
- توکن ربات تلگرام از `@BotFather` (`TELEGRAM_BOT_TOKEN`)
- کلید هوش مصنوعی (`HILINKUP_API_KEY` یا کلید OpenAI/DeepSeek/Anthropic/Gemini در پنل ادمین)
- آدرس کیف‌پول رسمی خودتان برای دریافت **کارمزد ۱٪ سود معاملات لایو** (TRC20 یا BEP20)

---

## ۲. نصب، بیلد و اجرای مایگریشن‌ها (`0001` تا `0033`)

```bash
npm ci
npx wrangler login
npx wrangler d1 migrations apply dollarino-db --remote
```

یا مستقیماً از اسکریپت آماده استقرار استفاده کنید:
```bash
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

---

## ۳. تنظیم کلیدهای امنیتی روی Cloudflare (الزامی، فقط یک‌بار)

```bash
openssl rand -hex 32    | npx wrangler secret put SESSION_JWT_SECRET
openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put HILINKUP_API_KEY
npx wrangler secret put PUBLIC_WEB_URL   # مثال: https://dollarino.yourdomain.com
```

> برای اجرای محلی (`npx wrangler dev`) فایل `.dev.vars.example` را به `.dev.vars` کپی کنید.

---

## ۴. راه‌اندازی اولیه Owner و چک‌لیست واقعی‌سازی

1. **راه‌اندازی اولیه Owner (با امنیت کامل):** روی دیتابیس خام، کافیست با اکانت تلگرام مدیر (`OWNER_TELEGRAM_ID`) در ربات `@Dollarino_bot` دکمه `/start` را بزنید تا فوری نقش `owner` بگیرید؛ یا یک‌بار درخواست `POST /api/auth/bootstrap-owner` را با `bootstrapSecret = SESSION_JWT_SECRET` ارسال کنید. ثبت‌نام مستقیم ایمیل برای کاربران عادی همچنان فقط از طریق تلگرام امن بسته باقی می‌ماند.
2. **ورود به تب مدیریت (`AdminPage`) -> بخش سلامت سیستم (`Production Readiness`)**: تمام ۶ چراغ زیر باید سبز (`✅`) شوند:
   - کلید امنیتی `JWT Secret` و `AES Vault Key`
   - توکن ربات تلگرام + ثبت خودکار Webhook (`POST /api/webhook/telegram/setup`)
   - موتور هوش مصنوعی (یا افزودن کلید مدل در تب «موتور AI»)
   - **تنظیم آدرس واقعی کیف‌پول دریافت کارمزد ۱٪ (TRC20 / BEP20)** تا هیچ آدرس نمایشی/پیش‌فرضی باقی نماند
   - فعال بودن `ALLOW_LIVE_TRADING=true` در `wrangler.toml`
3. **اتصال واقعی کاربران (بدون حالت نمایشی):**
   - **شبیه‌ساز دمو ($۱۰,۰۰۰)**: برای آموزش و تست استراتژی همیشه آزاد و رایگان است.
   - **ترید واقعی (LIVE)**: کاربران می‌توانند از **Hyperliquid Trade-Only Agent Wallet** (اجرای خودکار ۲۴/۷ غیرامانی با امضای EIP-712)، **تایید دستی ۱-کلیکی در Trust Wallet DApp**، یا **صرافی‌های Toobit / Bitunix / KCEX** استفاده کنند.
   - **کارمزد ۱٪ سرور**: تنها از سود معاملات واقعی محاسبه شده و در صورت گذشت از سقف و مهلت تسویه، ربات لایو به‌صورت خودکار متوقف می‌شود.
