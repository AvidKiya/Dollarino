# Dollarino (دلارینو) — پلتفرم اوپن‌سورس اتوترید هوشمند + ربات تلگرام روی کلادفلر

**Dollarino (دلارینو)** یک سیستم کاملاً رایگان و متن‌باز برای **اتوترید خودکار، تحلیل نمودار با هوش مصنوعی، دریافت سیگنال‌های TradingView / کانال تلگرام و مدیریت پوزیشن ۳ مرحله‌ای (TP1/TP2/TP3 + Risk-Free)** است که هم از طریق **وب‌اپ (Cloudflare Pages)** و هم از طریق **ربات تلگرام ۲۴/۷ (Cloudflare Workers)** کار می‌کند.

## ویژگی‌های اصلی

- **کاملاً رایگان و متن‌باز (MIT):** بدون هیچ پلن پولی، اشتراک یا محدودیت — هر کاربر می‌تواند نسخه شخصی خودش را روی GitHub + Cloudflare راه‌اندازی کند.
- **ثبت‌نام و اتصال آسان حساب تلگرام:** ثبت‌نام سریع در وب، دریافت کد اتصال یکتا (`LINK-XXXXXX`) و لینک کردن مستقیم حساب تلگرام به پنل وب، به‌علاوه امکان ثبت **توکن ربات تلگرام شخصی** داخل پنل.
- **صرافی‌ها (BYO Exchange):**
  - **Paper Simulator:** معامله آزمایشی ۲۴/۷ با قیمت و فاندینگ ریت واقعی بازار از Toobit.
  - **Toobit Futures:** اتصال کامل به API رسمی فیوچرز Toobit (`api.toobit.com`) + تیکر ۲۴ ساعته، عمق بازار، فاندینگ ریت و سفارش تست محافظت‌شده.
  - **Bitunix Futures:** اتصال کامل با امضای Double-SHA256 (`fapi.bitunix.com`).
  - **KCEX Futures (0% Maker Mirror):** طبق مستندات رسمی KCEX هنوز API کلید عمومی برای ترید خودکار منتشر نشده؛ دلارینو حالت اختصاصی **KCEX Signal-Mirror** را با محاسبه کارمزد ۰٪ میکر / ۰.۰۱٪ تیکر، فرمت دقیق `BTC_USDT`، لینک بازکردن مستقیم ترمینال KCEX و ذخیره امن اختیاری توکن سشن وب ارائه می‌دهد.
- **تمام امکانات ترکیبی TimeTrade + CodexBot در ۱۰ صفحه تخصصی:**
  - **کاپیتان ترید (Dashboard):** نوار تیکر ۲۴ ساعته و فاندینگ ریت زنده، چارت کندلی با **EMA 20/50/200** و حجم، دفتر سفارش زنده (Order Book Depth + Spread/Imbalance)، فرم ثبت سریع Market/Limit + ایزوله/کراس، ویرایش لحظه‌ای SL/TP1/TP2/TP3 و نمودار عملکرد هفتگی و روزانه.
  - **فلو استراتژی و میکسر ۸ کاناله (Strategy Flow & Signal Mixer):** گره‌های بصری جریان ترید، وزن‌دهی قابل تنظیم روی ۸ کانال تحلیلی (Trend, RSI, Liquidity Sweep SP2L, FVG, ATR, Volume, Candle Structure, Bollinger) و **اسکنر چندارزی زنده ۶ جفت‌ارز**.
  - **استودیو ریسک و ۳ تارگت (Risk Studio):** انتخاب تمام استراتژی‌ها (`SP2L`, `EMA Pullback`, `GridStrategy`, `4H Breakout`, `4H Candle`, `TestStrategy`)، محاسبه‌گر لحظه‌ای مارجین/پورتفولیو هیت/فاصله لیکوییدیشن و فیلترهای آخر هفته و اخبار کلان.
  - **بک‌تست کمی (Quant Backtester):** نمودار منحنی سرمایه (Equity Curve)، ۱۶+ شاخص (Sharpe Estimate، Profit Factor، Expectancy، تعداد Risk-Free)، مقایسه همزمان دو استراتژی A/B و خروجی CSV.
  - **چارت AI و راه‌اندازی سریع (Chart AI + Setup Wizard):** چت چندگانه روی چارت با رسم خطوط حمایت/مقاومت و ستاپ ورود روی نمودار + اجرای مستقیم معامله و ویزارد ۴ مرحله‌ای راه‌اندازی.
- **هوش مصنوعی شخصی (BYO AI):** اتصال مستقیم کلید **Claude (Anthropic)**، **OpenAI**، **Google Gemini** یا مدل‌های سازگار با OpenAI (**OpenRouter / Groq / Ollama**) برای **Chart AI** (رسم خطوط Entry/SL/TP روی نمودار) و **AI Reasoning Gate**.
- **موتور اجرای ۳ مرحله‌ای و ریسک‌فری خودکار:**
  - تخصیص درصدی مارجین (پیش‌فرض **۱۰٪ مارجین آزاد**) و ورود **Market** لحظه‌ای با اهرم سیگنال.
  - **TP1:** بستن ۵۰٪ پوزیشن + انتقال خودکار Stop Loss به نقطه ورود (**Risk-Free**).
  - **TP2:** بستن ۲۵٪ پوزیشن + انتقال خودکار Stop Loss به **TP1**.
  - **TP3:** بستن ۲۵٪ باقی‌مانده.
- **ربات تلگرام کامل و همیشه روشن (Webhook روی Worker):**
  - منوی اصلی (`اتصال به صرافی 🔗`، `تنظیمات ⚙️`، `حساب کاربری 👤`، `ربات و هوش مصنوعی من 🤖`، `راهنما 📚`)
  - حالت **اتوترید 🤖** و **دستی ترید 💪** (دکمه شیشه‌ای `👈 دلارینو ترید کن برام 👉` + تایید دو مرحله‌ای)
  - دریافت موجودی (`Free / Used / Total`)، تنظیم مقادیر معامله، اعلان سود/ضرر، پنل مدیریت مدیران و دریافت سیگنال از کانال/TradingView.

---

## راه‌اندازی سریع روی سیستم شخصی و کلادفلر

### ۱. نصب و اجرای لوکال
```bash
npm install
npx wrangler d1 migrations apply dollarino-db --local
npm run dev:worker   # پورت 8787
npm run dev:web      # پورت 5173
```

### ۲. استقرار رایگان/همیشه‌روشن روی Cloudflare
1. مخزن را روی GitHub خودتان **Fork** کنید.
2. یک دیتابیس D1 بسازید و شناسه آن را در `wrangler.toml` قرار دهید:
   ```bash
   npx wrangler d1 create dollarino-db
   npx wrangler d1 migrations apply dollarino-db --remote
   ```
3. کلیدهای امنیتی را در Secrets کلادفلر ثبت کنید:
   ```bash
   openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
   openssl rand -hex 32 | npx wrangler secret put SESSION_JWT_SECRET
   ```
4. Worker را دیپلوی کنید:
   ```bash
   npx wrangler deploy
   ```
5. پوشه `apps/web` را روی **Cloudflare Pages** متصل به GitHub دیپلوی کنید (`Build command: npm run build`, `Output: apps/web/dist`).

> ⚠️ **هشدار امنیتی:** هرگز توکن ربات تلگرام (`TELEGRAM_BOT_TOKEN`) یا کلیدهای صرافی را داخل کد یا فایل‌های عمومی Git قرار ندهید؛ همیشه از Cloudflare Secrets یا بخش رمزنگاری‌شده **API Connections** داخل پنل وب استفاده کنید.
