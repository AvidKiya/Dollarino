# Dollarino V11.9.1 Browser Extensions (Chrome · Edge · Firefox)

افزونه رسمی دلارینو **V11.9.1** با **حالت ساده یکسان با سایت**، **ورود و ثبت‌نام مستقیم (به همراه 2FA، کلید اکستنشن و تلگرام)**، **۵ موتور ترید همزمان (پیش‌فرض خاموش)**، **تراز یکپارچه ۵ بخش**، **گام الزامی دمو/واقعی و قوانین ریسک**، **رادار DEX + اسنایپر زیر ۵ دقیقه (`70 / $15k / 5`)** و **راهنما و اتصال Trust Wallet** برای مرورگرهای **Chrome**، **Microsoft Edge** و **Mozilla Firefox**.

## بسته‌های آماده دانلود
اسکریپت ساخت بسته‌ها (`node scripts/build-extensions.mjs`) فایل‌های ZIP آماده نصب هر مرورگر را در `apps/web/public/downloads/` می‌سازد:
- **Google Chrome / Brave / Opera:** `dollarino-extension-chrome.zip` (و `dollarino-extension.zip`) — با **Side Panel** بومی MV3
- **Microsoft Edge:** `dollarino-extension-edge.zip` — با **Side Panel** بومی (`minimum_edge_version: 114`)
- **Mozilla Firefox:** `dollarino-extension-firefox.zip` — با **Sidebar Action** بومی (`sidebar_action` + `browser_specific_settings.gecko`)

## راهنمای نصب سریع
### ۱. Google Chrome / Brave / Arc
1. آدرس `chrome://extensions` را باز کنید و **Developer mode** را روشن کنید.
2. فایل `dollarino-extension-chrome-v11.9.1.zip` را استخراج (Extract) کنید.
3. دکمه **Load unpacked** را زده و پوشه استخراج‌شده (یا مستقیم پوشه `apps/extension`) را انتخاب کنید.

### ۲. Microsoft Edge
1. آدرس `edge://extensions` را باز کنید و **Developer mode** را فعال کنید.
2. فایل `dollarino-extension-edge-v11.9.1.zip` را استخراج کنید و **Load unpacked** را بزنید.

### ۳. Mozilla Firefox
1. فایل `dollarino-extension-firefox-v11.9.1.zip` را در `about:debugging#/runtime/this-firefox` با گزینه **Load Temporary Add-on** (انتخاب `manifest.json` داخل پوشه استخراج‌شده یا مستقیم فایل zip) بارگذاری کنید، یا پس از امضا روی AMO نصب دائمی کنید.
2. روی آیکون دلارینو در نوار ابزار کلیک کنید (یا `Ctrl+B` بزنید) تا سایدبار بومی فایرفاکس باز شود.
