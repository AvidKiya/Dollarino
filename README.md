# Dollarino (دلارینو v6.0) — هوش مصنوعی دلارینو، استراتژی منتخب دلارینو و کپی ترید دلارینو

**Dollarino (دلارینو)** یک وب‌اپلیکیشن تجاری، PWA قابل نصب و سیستم ترید خودکار چندارزی مبتنی بر **Cloudflare Workers + D1 + Durable Objects + React** و **ربات تلگرام ۲۴/۷** است که با طراحی سبک iOS / Apple و الهام‌گرفته از اپلیکیشن‌های فین‌تک موبایل، به کاربران اجازه می‌دهد در چند ثانیه و بدون نیاز به دانش پیچیده، به‌صورت همزمان روی تمام ارزهای مناسب بازار معامله کنند.

## ویژگی‌های کلیدی نسخه v6.0

- **موتور معاملاتی آزاد و چندارزی (`ALL_MARKET` / `TOP_COINS` / `SINGLE`):**
  - ربات به یک یا سه ارز محدود نیست! به‌صورت خودکار **۳۰+ ارز پرنقدینگی بازار** را رصد کرده و می‌تواند تا **۲۰ معامله همزمان** با چرخش خودکار روند (`allow_auto_flip`) و اهرم آزاد (`1x` تا `50x`) مدیریت کند.
- **سه موتور رسمی دلارینو:**
  1. **هوش مصنوعی دلارینو (موتور دُرّبین):** ترکیب هوشمند ۱ تا ۳ مدل هوش مصنوعی (DeepSeek، Claude، GPT، Gemini و OpenRouter) توسط مدیریت پلتفرم — بدون نیاز به ثبت کلید API توسط کاربر.
  2. **استراتژی منتخب دلارینو (موتور دُرنا V1):** ترکیب جامع استراتژی‌های روند، مومنتوم، شکار نقدینگی و ریبون غیرریپینت؛ رایگان در حساب دمو برای همه کاربران.
  3. **کپی ترید دلارینو:** کپی خودکار و لحظه‌ای سیگنال‌ها از کانال تلگرام `@Dollarinoofficial` یا کانال اختصاصی کاربر و TradingView Webhook.
- **طراحی لوکس Apple / iOS + دسکتاپ حرفه‌ای:**
  - پنل ساده با کارت کیف‌پول کُبالت، دکمه مخفی/نمایش موجودی، نوار شناور پایین موبایل (iOS Dock)، چراغ‌های سبز تیره با خوانایی کامل در تم روز (Light Mode) و دکمه **حالت حرفه‌ای تریدرها (Pro Mode)**.
  - **کارت نتایج هفتگی اختصاصی (Weekly Card):** طراحی شیشه‌ای 4:5 همراه با لوگوی بزرگ کم‌رنگ دلارینو در پس‌زمینه و خروجی PNG باکیفیت.
- **صرافی‌های پشتیبانی‌شده:**
  - **Paper Demo** (حساب دمو رایگان با قیمت زنده بازار) · **Toobit Futures** · **KCEX Futures**.

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
5. اولین کاربری که ثبت‌نام می‌کند نقش مالک (`owner`) می‌گیرد و می‌تواند از تب **مدیریت** مدل‌های **هوش مصنوعی دلارینو**، تعرفه‌ها و واریزی‌ها را مدیریت کند.

> ⚠️ **هشدار امنیتی:** هرگز کلیدهای API هوش مصنوعی، توکن ربات تلگرام (`TELEGRAM_BOT_TOKEN`) یا کلیدهای صرافی را داخل Git قرار ندهید؛ همیشه از Cloudflare Secrets یا بخش رمزنگاری‌شده پنل استفاده کنید.
