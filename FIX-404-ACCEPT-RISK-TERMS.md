# رفع خطای `404 Route not found: /api/trading/accept-risk-terms`

## خلاصه

با کلیک روی **«تایید حالت و قوانین ریسک»** در صفحه اصلی، درخواست به
`POST /api/trading/accept-risk-terms` می‌رود و پاسخ **404** برمی‌گردد.

این خطا از کد اپلیکیشن نیست: مسیر در `apps/worker/src/routes/trading.ts:1055`
کاملاً پیاده‌سازی شده و روی برنچ `main` هم هست. مشکل این است که
**فرانت‌اند (Cloudflare Pages) و API (Cloudflare Worker) جدا دیپلوی می‌شوند** و
Worker دیپلوی‌شده روی `dollarino.pages.dev` نسخه‌ی قدیمی (قبل از V11.4) است، در
حالی که UI نسخه V11.7.2 را نشان می‌دهد. مسیر `accept-risk-terms` در V11.4 اضافه شده،
پس Worker قدیمی آن را نمی‌شناسد و به 404 می‌رسد.

## چرا خودکار دیپلوی نشد؟ (علت ریشه‌ای)

`gh run list` نشان می‌دهد **همه‌ی اجراهای GitHub Actions از ۶ ساعت پیش در ۰ ثانیه
fail شده‌اند** با پیام «This run likely failed because of a workflow file issue».

دلیلش این بود که در `.github/workflows/deploy.yml` از `secrets.*` داخل
`if:` سطح step استفاده شده بود:

```yaml
if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}   # ❌ نامعتبر در GitHub Actions
```

GitHub اجازه‌ی استفاده از context منی `secrets` را در `if:` نمی‌دهد؛ نتیجه این است
که کل فایل ورک‌فلو **نامعتبر** می‌شود و هیچ‌کدام از stepها (تست، بیلد، مهاجرت D1 و
دیپلوی) اجرا نمی‌شوند. بنابراین هر آپدیت فقط سمت Pages منتشر می‌شد و Worker عقب می‌ماند.

## اصلاحات این برنچ

1. **`deploy.yml` بازنویسی شد** (بدون تغییر منطق):
   - سکرت‌ها به `env` سطح job منتقل شدند و شرط‌ها با `env.*` بررسی می‌شوند
     (روش مجاز GitHub).
   - دو job جدا شد: `verify` (typecheck + tests + build + artifact) و
     `deploy` (migrations → worker → pages → smoke test).
   - step جدید **Smoke-test deployed Worker version** که `/api/health` را صدا می‌زند و
     اگر نسخه‌ی Worker با نسخه‌ی مخزن یکی نبود، warning می‌دهد.
   - `concurrency` تا دو دیپلوی همزمان روی هم نیفتند.
2. **منبع واحد نسخه** اضافه شد: `apps/worker/src/version.ts` (`DOLLARINO_VERSION`).
   `/api/health`، پاسخ 404 روتر، `ADMIN database backup` و
   `syncTelegramBotAutoOnVersion` همه از همان ثابت می‌خوانند.
3. **`scripts/sync-version.mjs`** نسخه را روی همه‌ی سطوح همگام می‌کند
   (Worker، Web، PWA cache، اکستنشن). **`scripts/version-guard.mjs`** در ابتدای
   `npm run build` اجرا می‌شود و اگر نسخه‌ها واگرا شوند بیلد را fail می‌کند.
4. **تشخیص ناهماهنگی در کلاینت**: `App.tsx` نسخه‌ی `/api/health` را با
   `APP_VERSION` مقایسه می‌کند و در صورت اختلاف، یک اعلان شناور با دکمه‌ی
   «بروزرسانی اپ» (پاک‌سازی کش + reload) نشان می‌دهد.
5. **۴۰۴ گویاتر**: روتر ناشناخته حالا `code: ROUTE_NOT_FOUND`،
   `workerVersion` و `hint` برمی‌گرداند و `apiFetch` همان نسخه‌ی سرور را در پیام
   خطا نشان می‌دهد.
6. **تست رگرسیون** `apps/worker/src/__tests__/deploy-parity.test.ts`:
   برابری نسخه‌ی UI/Worker، وجود `workerVersion` در ۴۰۴، در دسترس بودن مسیر
   `accept-risk-terms` و سبز بودن `version-guard`.

## اقدام لازم برای رفع روی سرور (بدون دسترسی سندباکس به Cloudflare)

سندباکس این جلسه فقط به `github.com` دسترسی دارد و `api.cloudflare.com` مسدود است؛
همچنین توکن Cloudflare در چت قرار داده شده و باید **rotate** شود (بند امنیتی پایین).
پس دیپلوی باید از ماشین خودت یا با سکرت تازه در GitHub اجرا شود:

```bash
npm ci
npm run build              # version-guard + core + web
npx wrangler whoami        # با توکن جدید لاگین/تایید کن
npx wrangler d1 migrations apply dollarino-db --remote   # 0045, 0046, 0047
npx wrangler deploy        # ← Worker را جلو می‌آورد؛ همین خطا را رفع می‌کند
npx wrangler pages deploy apps/web/dist --project-name=dollarino
```

برای اینکه بعد از این، دیپلوی خودکار انجام شود:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo AvidKiya/Dollarino
gh secret set CLOUDFLARE_ACCOUNT_ID --repo AvidKiya/Dollarino --body <account_id>
```

بعد از آن ورک‌فلوی اصلاح‌شده روی هر push به `main` تست+مهاجرت+دیپلوی را انجام می‌دهد
و smoke test نسخه را گزارش می‌کند.

## بررسی سریع بعد از دیپلوی

```bash
curl -s https://dollarino.pages.dev/api/health | jq '{version, assetVersion, buildSurface}'
# باید 11.7.2 باشد؛ اگر نبود Worker قدیمی است.
```

## ⚠️ امنیت

توکنی که در پیام فرستادی (`cfut_...`) عملاً یک کلید دسترسی کامل به حساب Cloudflare
است. آن را همین حالا از داشبورد Cloudflare → My Profile → API Tokens **Revoke** کن،
توکن جدید بساز و **فقط** در GitHub Secrets ذخیره کن (نه در چت/کد/فایل).
