# 🚀 Dollarino V11.1 — راهنمای جامع ارتقاء، دیپلوی Cloudflare و GitHub

نسخه **V11.1** شامل بازطراحی موتور سرمایه و مدیریت ریسک پویا، ارتقاء ۵ موتور همزمان معاملاتی، سپر نرخ ارز زنده ایران، و خزانه مرکزی Non-Custodial است.

---

## ✨ مهم‌ترین قابلیت‌های نسخه V11.1

1. **مدیریت بودجه مجاز ربات (`Bot Capital Budget Cap`):**
   - تعیین سقف دقیق دلاری (`FIXED_USD`)، درصدی (`PERCENT`) یا کل سرمایه (`FULL_BALANCE`) در سطح Core + Worker + Telegram + Web.
   - جلوگیری سخت‌گیرانه از باز شدن پوزیشن جدید در صورت پر شدن سقف (`BOT_BUDGET_CAP_REACHED`) بدون رها کردن پوزیشن‌های باز.
2. **پیشنهاد پویای ریسک و سایز پوزیشن (`computeDynamicRecommendedSettings`):**
   - محاسبه خودکار سایز ترید، اهرم و تعداد معاملات همزمان متناسب با موجودی واقعی یا سقف بودجه ربات (کم‌ریسک / متعادل / پرقدرت + دکمه ۱-کلیکی `پیشنهادی پویا`).
3. **۵ موتور معاملاتی همزمان (`Simultaneous Multi-Engine`):**
   - هوش مصنوعی دلارینو، استراتژی شکار دُرنا، هوش مصنوعی شخصی من، کپی‌ترید تاییدشده و اسنایپر لیستینگ صرافی‌ها و میم‌کوین‌های انفجاری (`LISTING_SNIPER`).
4. **کارمزد منصفانه ۳٪ فقط بر سود + ۳ معامله اول رایگان (`0% -> 3%`):**
   - حذف کامل اشتراک ماهانه؛ ۳ معامله سودده واقعی اول ۰٪ کارمزد، پس از آن ۹۷٪ سود برای کاربر و ۳٪ کارمزد سرور روی سود خالص.
5. **خزانه مرکزی دلارینو (`BIP39 / Trust Wallet Bank`) + سپر نرخ تتر زنده (`290k+ IRT`):**
   - واریز حداقل $10 با تایید آن‌چین و هش یکتا، و دریافت همزمان نرخ زنده تتر ایران از مراجع `Alanchand`، `ArzDigital`، `Nobitex`، `Wallex`، `Tetherland` و `Ramzinex`.

---

## 🛠 دستورهای سریع نصب و اجرا (Local & Production)

```bash
# 1. نصب وابستگی‌ها
npm install

# 2. اعمال تمام مایگریشن‌های دیتابیس D1 (تا 0038_v11_dynamic_capital_budget.sql)
npx wrangler d1 migrations apply dollarino-db --local
# برای دیتابیس اصلی کلودفلر:
npx wrangler d1 migrations apply dollarino-db --remote

# 3. اجرای تست‌های کامل (74/74 Core + Worker Miniflare)
npm test

# 4. بیلد کامل فرانت‌اند و پکیج‌ها
npm run build

# 5. دیپلوی روی Cloudflare Workers + Assets
npx wrangler deploy
```

## 🔐 متغیرهای ضروری Cloudflare (`wrangler secret put`)
- `JWT_SECRET`
- `VAULT_MASTER_KEY` (برای رمزنگاری AES-GCM کلید صرافی‌ها، توکن ربات تلگرام و سید خزانه BIP39)
- `TELEGRAM_BOT_TOKEN` (یا ثبت مستقیم از پنل ادمین)
- `HILINKUP_API_KEY` / `OPENAI_API_KEY` (اختیاری در کنار موتورهای ادمین)
