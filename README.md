# Dollarino (دلارینو v5.0) — پلتفرم هوشمند ترید، دلارینو V0.1 و کپی‌ترید

**Dollarino (دلارینو)** یک وب‌اپلیکیشن تجاری، PWA قابل نصب و سیستم ترید خودکار مبتنی بر **Cloudflare Workers + D1 + Durable Objects + React** و **ربات تلگرام ۲۴/۷** است که با طراحی بسیار ساده، گرافیکی و مبتدی‌پسند (الهام‌گرفته از تجربه‌های لوکس فین‌تک) به کاربران اجازه می‌دهد در چند ثانیه با دمو رایگان یا حساب صرافی واقعی معامله کنند.

## ویژگی‌های کلیدی نسخه v5.0

- **موتور هوش مصنوعی مرکزی (Central Multi-AI Engine — بدون نیاز به API کاربر):**
  - کاربران هیچ نیازی به ثبت یا خرید کلید OpenAI/Claude/DeepSeek ندارند.
  - مدیر سیستم در تب **مدیریت (Admin Panel)** از **۱ تا ۳ مدل هوش مصنوعی** (DeepSeek، Claude، GPT، Gemini یا OpenRouter/Groq) را اضافه، تست، وزن‌دهی و فعال می‌کند.
  - پشتیبانی از حالت‌های اجماع **`ENSEMBLE_AUTO`**، **`SINGLE`**، **`DUAL`** و **`ENSEMBLE_3`** همراه با کش مشترک سیگنال‌ها (`platform_ai_signals`) جهت کاهش هزینه توکن و پاسخ‌گویی آنی برای کل کاربران.
- **استراتژی اختصاصی «دلارینو V0.1» (`dollarino_v01`):**
  - استراتژی جامع و پیش‌فرض پلتفرم که تمام الگوریتم‌های روند، مومنتوم، شکار نقدینگی و ریبون غیرریپینت را ترکیب کرده و در حساب دمو برای همه رایگان است.
  - شامل حالت اختیاری **اسکن خودکار ۳ ارز برتر (`BTC / ETH / SOL`)** و ۳ سطح ریسک آماده (آرام و مطمئن / متعادل / پرقدرت).
- **کپی‌ترید (`کپی‌ترید`):**
  - دریافت خودکار سیگنال از کانال رسمی `@Dollarinoofficial`، کانال شخصی یا TradingView Webhook و اجرا در حالت **اتوترید** یا **تایید دستی**.
- **صرافی‌های پشتیبانی‌شده:**
  - **Paper Demo:** حساب دمو رایگان با قیمت زنده و دکمه‌های بازنشانی سریع به `$10,000` و افزایش اعتبار.
  - **Toobit Futures:** اتصال کامل به API رسمی فیوچرز Toobit (`api.toobit.com`) + پشتیبانی از Relay اختیاری (`apps/relay`).
  - **KCEX Futures:** حالت اختصاصی **KCEX Signal-Mirror (0% Maker)** و سشن وب.
- **مدل اشتراک تجاری (`Free Demo` / `Pro Monthly` / `VIP Quarterly`):**
  - حساب تست دمو + استراتژی **دلارینو V0.1** برای همیشه رایگان است؛ فعال‌سازی هوش مصنوعی مرکزی، کپی‌ترید و معامله لایو صرافی‌ها با خرید اشتراک (تتر TRC20 یا کارت‌به‌کارت + تایید مدیریت) آزاد می‌شود.
- **طراحی لوکس دوحالته (Dark/Light Cobalt) + PWA قابل نصب:**
  - ورود فوری با یک کلیک (**تست رایگان دمو بدون ثبت‌نام**)، ۴ تب اصلی ساده + منوی کشویی امکانات پیشرفته، تم شب و روز و نصب مستقیم روی موبایل و دسکتاپ.

---

## راه‌اندازی لوکال

```bash
npm install
npx wrangler d1 migrations apply dollarino-db --local
npm run dev:worker   # پورت 8787
npm run dev:web      # پورت 5173
```

## استقرار روی Cloudflare + GitHub

1. ریپازیتوری را در GitHub (Private یا Public) قرار دهید.
2. دیتابیس D1 بسازید و `database_id` را در `wrangler.toml` جایگزین کنید:
   ```bash
   npx wrangler d1 create dollarino-db
   npx wrangler d1 migrations apply dollarino-db --remote
   ```
3. کلیدهای امنیتی رمزنگاری AES-256 و JWT را در Cloudflare Secrets ثبت کنید:
   ```bash
   openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
   openssl rand -hex 32 | npx wrangler secret put SESSION_JWT_SECRET
   ```
4. Worker را دیپلوی کنید (`npx wrangler deploy`) و `apps/web` را به **Cloudflare Pages** متصل کنید (`Build command: npm run build`، `Build output directory: apps/web/dist`).
5. اولین کاربری که ثبت‌نام می‌کند نقش مالک (`owner`) می‌گیرد و می‌تواند از تب **مدیریت** مدل‌های هوش مصنوعی مرکزی، تعرفه‌ها و واریزی‌ها را مدیریت کند.

> ⚠️ **هشدار امنیتی:** هرگز کلیدهای API هوش مصنوعی، توکن ربات تلگرام (`TELEGRAM_BOT_TOKEN`) یا کلیدهای صرافی را داخل Git قرار ندهید؛ همیشه از Cloudflare Secrets یا بخش رمزنگاری‌شده پنل استفاده کنید.
