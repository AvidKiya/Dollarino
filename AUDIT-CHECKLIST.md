# چک‌لیست کامل بررسی طراحی، رفع مشکلات فنی و یکپارچه‌سازی واقعی Trust Wallet DApp Browser (V11.6 – V11.7.2)

> **تکمیلشده در V11.7.2:** صفرسازی حساب مدیریتی به ۰ با حفظ حساب و دسترسی (`resetPrivilegedUserAccountToFreshState`)، معافیت کامل مدیر/مالک از کارمزد و محدودیت‌ها (`server-fee.ts`, `security.ts`, `trustwallet.ts`, `trading.ts`, `copy-trade.ts`), اکستنشن کروم **Side Panel** در حالت ساده اختصاصی (`chrome.sidePanel`, `?ui_mode=simple&embed=sidepanel`), ثبت خودکار کد معرف مدیر هنگام خالی بودن کد معرف (`resolveEffectiveReferralCode`), ثبت‌نام مستقیم DApps تراست‌ولت (`?auth_screen=1&auth_mode=register&tw_signup=1`), و یکپارچه‌سازی فرم تکمیل پروفایل (شماره تماس + اسم مستعار + نام کاربری + رمز عبور) پس از کیف‌پول، گوگل و تلگرام. ([`V11.7-MASTER-PLAN.md`](./V11.7-MASTER-PLAN.md))

این فایل تمام ایرادات کشف‌شده در بررسی تک‌به‌تک اسکرین‌شات‌های دسکتاپ (`1440×900`) و موبایل (`390×844`) کاربر و ادمین، و همچنین مراحل پیاده‌سازی واقعی و امن **مرورگر DApp تراست‌ولت (Trust Wallet DApp Browser)**، **دسترسی‌های تک‌کلیکی بدون خطر سرقت** و **اتوترید واقعی ۲۴/۷** را به صورت مرحله‌ای لیست کرده و با انجام هر مورد تیک (`[x]`) می‌خورد.

---

## فاز ۱: رفع ایرادات بصری، داده‌ای، ریسپانسیو و RTL/Bidi (بر اساس اسکرین‌شات‌ها)

- [x] **۱.۱ پاکسازی آدرس Placeholder از خزانه ولت و صفحه کارمزد (`18_dex_wallet.png`, `04_admin_sec_payments.png`)**
  - حذف پیش‌فرض `TYourTRC20WalletAddressHereSetInAdminPanel` از D1 و افزودن مایگریشن `0042_clean_placeholders_and_tw_nonces.sql`.
  - فیلتر کردن آدرس‌های نمونه (`TYour...` / `0xYour...`) در خروجی API (`/api/trustwallet/status`, `/api/admin/...`, `/api/subscriptions/ledger`) و نمایش پیام شفاف فارسی وقتی آدرسی توسط ادمین ثبت نشده است.
- [x] **۱.۲ حذف جفت‌ارزهای تکراری در لیست بازارها (`05_markets.png`)**
  - اصلاح `apps/worker/src/exchanges/markets.ts` با deduplication قطعی بر اساس `canonical symbol` تا نمادهایی مثل `BTC/USDT`, `ETH/USDT`, `DOGE/USDT` هرگز بیش از یک‌بار در جدول نمایش داده نشوند.
- [x] **۱.۳ ریسپانسیو کردن جدول کاربران پنل ادمین در موبایل و تمیزکاری فرم‌های ادمین (`موبایل/ادمین/07_admin_sec_users.png`, `04_admin_sec_payments.png`, `06_admin_sec_founder.png`)**
  - افزودن نمای کارتی اختصاصی موبایل (`md:hidden`) برای لیست کاربران ادمین جهت جلوگیری از بریدگی ستون‌های نقش، اعتبار کارمزد و دکمه‌های عملیات.
  - افزودن لیبل‌های واضح فارسی بالای ورودی‌های «آدرس‌های تسویه کارمزد ۳٪ و امنیت Trust Wallet» و پاکسازی placeholderهای مبهم انگلیسی.
  - نمایش آواتار پیش‌فرض حرفه‌ای برای بخش عکس بنیان‌گذار تا کادر خالی خاکستری نباشد.
- [x] **۱.۴ تک‌ردیفی کردن تب‌بار RadarLabPage و رفع تداخل لیبل محور Y نمودارها (`07`–`10_radar_*`, `04_terminal_pro.png`, `09_radar_lab.png`)**
  - بهینه‌سازی چیدمان ۵ تب بالای `RadarLabPage.tsx` تا در دسکتاپ روی یک خط مرتب قرار بگیرند و در موبایل منظم اسکرول/رپ شوند.
  - تنظیم `lastValueVisible` و فاصله محور عمودی در `CandlestickChart.tsx` / `DollarinoViz.tsx` تا برچسب‌های قیمت روی هم یا روی اعداد محور Y (`11000.00` / `59000`) نیفتند.
- [x] **۱.۵ اصلاح فیلتر زنجیره‌ها و تقارن گرید در اسکنر DEX (`16_dex_scanner.png`)**
  - محدودکردن چیپ‌های فیلتر اصلی شبکه به شبکه‌های استاندارد معتبر (`solana`, `bsc`, `base`, `ethereum`, `arbitrum`, `polygon`, `avalanche`, `optimism`, `ton`, `tron`, `sui`) و حذف نام‌های نامعتبر مثل `ROBINHOOD`.
  - ردیف‌کردن خروجی گرید کارت‌ها به مضرب ۳ (`slice(0, 21)`) تا کارت تک‌افتاده در ردیف آخر نباشد.
- [x] **۱.۶ رفع باگ‌های Bidi/RTL و موقعیت چت شناور موبایل (`00_landing_guest.png`, `14_copy_exchanges.png`, `25_pricing_fees.png`, `26_faq_guide.png`, `27_support_modal.png`, `13d_copy_live_boxes.png`, `موبایل/کاربر/02_simple_overview.png`, `21b_portfolio_wallet.png`, `24_weekly_card.png`)**
  - قراردادن تمام بازه‌های ارزی (`$50–$10M`, `$10K`, موجودی‌های دلاری دمو/واقعی و کارت بودجه) در `<span dir="ltr">` / ایزوله یونی‌کد برای جلوگیری از برعکس‌شدن علامت `$`.
  - اصلاح فیلدهای `dir="auto"` دارای placeholder فارسی در `SubscriptionPage.tsx` (تبدیل لیبل فارسی به بالای فیلد + placeholder تمیز) و رفع بریدگی placeholder در `SmartCopyProHub.tsx`.
  - بهینه‌سازی جایگاه و سایز دکمه شناور `FloatingAiChat` در موبایل تا روی کارت ولت یا نوار پایین قرار نگیرد، و بهبود فاصله‌گذاری `WeeklyCardPage`.

---

## فاز ۲: یکپارچه‌سازی واقعی، راحت و امن Trust Wallet In-App DApp Browser

- [x] **۲.۱ تشخیص هوشمند و اتصال ۱-کلیکی همه‌زنجیره‌ها درون DApp تراست‌ولت (`apps/web/src/lib/trustwallet.ts`, `App.tsx`, `Layout.tsx`)**
  - بهبود تشخیص مرورگر داخلی Trust Wallet DApp (`window.trustwallet`, `isTrust`, `isTrustWallet`, EIP-6963, Wallet Standard, Solana, TRON, TON) و نمایش بنر وضعیت «مرورگر امن Trust Wallet DApp فعال است».
  - افزودن جریان خودکار هنگام ورود با `?tw_autoconnect=1` یا کلیک روی «اتصال کامل DApp» در تمام نقاط کلیدی (Overview، Modal خوش‌آمدگویی، کپی‌ترید، DEX و هدر).
- [x] **۲.۲ احراز مالکیت واقعی با امضای رمزنگاری ECDSA `ecrecover` و Nonce یک‌بارمصرف در سرور (`apps/worker/src/routes/trustwallet.ts`)**
  - ذخیره Nonce صادرشده برای کاربر در جدول `trust_wallet_nonces` (D1) با انقضای ۵ دقیقه‌ای و ابطال پس از مصرف (ضد Replay Attack).
  - پیاده‌سازی وریفای واقعی امضای `personal_sign` (EIP-191 + `secp256k1` `recoverPublicKey` با `@noble/curves/secp256k1` و `@noble/hashes/sha3`) و تطبیق آدرس بازیابی‌شده با `evmAddress`.
- [x] **۲.۳ ویزارد یک‌کلیکی و کاملاً امن صدور مجوز اتوترید داخل Trust Wallet DApp (بدون نیاز به کلید اصلی یا عبارت بازیابی)**
  - **Hyperliquid Perp Agent Key (فقط-معامله، صفر دسترسی برداشت):** تولید جفت‌کلید تازه `secp256k1` در کلاینت + سوییچ خودکار شبکه به Arbitrum (`0xa4b1`) + امضای رسمی **EIP-712 `HyperliquidTransaction:ApproveAgent`** درون Trust Wallet DApp (`eth_signTypedData_v4`) + ارسال مستقیم به `https://api.hyperliquid.xyz/exchange` از مسیر جدید `POST /api/dex/perp-approve-agent` + ذخیره رمزنگاری‌شده AES-256-GCM در `perp_dex_connections`.
  - **شارژ و برداشت ۱-کلیکی خزانه ایزوله ۲۴/۷ (`Copy-Vault`):** افزودن دکمه‌های مبلغ آماده (`$25`, `$50`, `$100`, `$250`) برای ارسال مستقیم از کیف‌پول DApp به آدرس خزانه اختصاصی خود کاربر (`eth_sendTransaction` روی BSC/Base/Arbitrum/ETH یا `solana` transfer) + دکمه برداشت آنی تمام موجودی به Trust Wallet اصلی.
  - **مجوز محدود روتر DEX (`ERC-20 Approve` با سقف دلخواه + `Revoke`):** امکان دادن مجوز استاندارد فقط به مبلغ دلخواه کاربر (نه نامحدود) به روتر 1inch/PancakeSwap روی BSC/Arbitrum/Base در DApp تراست ولت و چک زنده Allowance آن‌چین.
  - رفع ناهماهنگی نام فیلدهای فرم `perp-connect` در `DexTrustPage.tsx` (`venue` / `masterAddress`).

---

## فاز ۳: سوآپ واقعی درون DApp و اتوماسیون ۱۰۰٪ تریدهای ربات، اسنایپر و کپی‌ترید

- [x] **۳.۱ اجرای واقعی سوآپ مستقیم داخل DApp تراست ولت (`Manual / 1-Click Swap`)**
  - افزودن endpoint واقعی `POST /api/dex/build-swap-tx` برای دریافت مسیر و calldata واقعی سوآپ (Jupiter v6 روی Solana؛ ParaSwap / 1inch / PancakeSwap-Uniswap V2 Router روی BSC, Base, Arbitrum, Ethereum).
  - ارتقای `handleTrackDexTrade` و دکمه «سوآپ در Trust Wallet» در `DexTrustPage.tsx`: وقتی کاربر داخل Trust Wallet DApp Browser است، پاپ‌آپ واقعی `eth_sendTransaction` / `solana.signAndSendTransaction` باز می‌شود و پس از تایید، `txHash` واقعی آن‌چین فوراً در پورتفوی DEX ثبت می‌شود.
- [x] **۳.۲ اتصال کامل چرخه اتوترید واقعی ۲۴/۷ (`LIVE + AUTO`) در ربات، اسنایپر و کپی‌ترید**
  - بروزرسانی `engine/executor.ts`, `engine/bot-do.ts`, `engine/listing-sniper.ts` و `routes/trading.ts` (`POST /orders/manual` `LIMIT`) تا در حالت `LIVE + AUTO`:
    - معاملات فیوچرز (`FUTURES`) از طریق `HyperliquidPerpAdapter` (با Agent Key امضاشده در DApp) یا صرافی متصل روی بازار واقعی اجرا و تا بسته‌شدن مدیریت شوند.
    - معاملات اسپات / DEX و اسنایپر (`listing-sniper.ts`) در صورت شارژ بودن `Copy-Vault`، مستقیماً از طریق `executeLiveSolanaVaultJupiterSwap` و `executeLiveEvmVaultSwap` روی بلاکچین واقعی اجرا شوند.
    - در حالت `MANUAL_CONFIRM` یا کمبود موجودی واقعی (یا ثبت `LIMIT` در حالت `LIVE` بدون Agent Key)، درخواست امضای تک‌کلیکی و لینک مستقیم به DApp + اعلان شفاف (`AGENT_KEY_REQUIRED` / `TRUST_WALLET_MANUAL_SIGN_SENT`) صادر شود و هیچ معامله جعلی ثبت نشود.

---

## فاز ۴: تست، بیلد، راه‌اندازی روی پورت `1654` و بازبینی نهایی اسکرین‌شات‌ها

- [x] **۴.۱ افزودن تست‌های جامع برای تایید امضای ECDSA، Agent Approve، Build Swap Tx، Dedupe بازارها و حفاظت از LIVE LIMIT**
  - `apps/worker/src/__tests__/v116-dapp-upgrade.test.ts` (۵ تست) + `apps/worker/src/__tests__/trust-wallet-redesign.test.ts` (۵ تست).
- [x] **۴.۲ اجرای `npm run typecheck`, `npm test`, `npm run build` و `wrangler deploy --dry-run` بدون خطا**
  - `packages/core`: 15/15 passed | `apps/worker`: 11/11 files, 69/69 tests passed | `apps/web` Vite build + Worker bundle (`1508.29 KiB gzip`) سبز.
- [x] **۴.۳ اعمال مایگریشن `0042` روی D1 لوکال، ری‌استارت سرور روی `0.0.0.0:1654` و بررسی `/api/health` (`11.6.0`)**
- [x] **۴.۴ اجرای تست End-to-End با Playwright (شبیه‌سازی کامل Trust Wallet DApp Browser با امضای واقعی Secp256k1، اتصال خودکار `?tw_autoconnect=1`، ویزارد EIP-712 `ApproveAgent` و سوآپ) + بازبینی اسکرین‌شات‌های نهایی دسکتاپ (`1440×900`) و موبایل (`390×844`)**
  - رفع باگ نمایش `BTC/USDC` به صورت `/USDT` در حالت حرفه‌ای `MarketsPage.tsx` (`/{c.quote || 'USDT'}`) پس از بررسی اسکرین‌شات و تایید مجدد تصویر نهایی.
- [x] **۴.۵ بازسازی آرشیو نهایی `Dollarino-V11.6.zip` و تیک‌زدن نهایی تمام موارد**

---

## فاز ۵: پالایش نهایی V11.6.5 — طراحی غیرامانی، تقارن گرید، کش‌باستینگ، مستندسازی کامل و QA چهارحالته

- [x] **۵.۱ بازطراحی ۱۰۰٪ غیرحضانتی تجربه مالی کاربر (`TreasuryBankingHub`, `DexTrustPage`, `SubscriptionPage`, `ServicesPage`, `Layout`, `PortfolioPage`, `SmartCopyProHub`, `PromoBannerCarousel`)**
  - حذف کامل عبارت‌های گمراه‌کننده واریز سرمایه به خزانه سایت در تمام صفحات کاربری و جایگزینی شفاف با «خزانه شخصی شما = همان کیف‌پول Trust Wallet خودتان» و تنظیم سقف سرمایه روی ولت + تسویه صرفاً کارمزد ۳٪ سود واقعی یا شارژ اختیاری اعتبار کارمزد.
- [x] **۵.۲ تقارن ۵ کارت موتور حالت ساده (`OverviewPage.tsx` `lg:grid-cols-5`) و بازسازی ۳ آیکون ۳D شفاف `512×512`**
  - جایگزینی آیکون‌های تیره/حفره‌دار با فایل‌های شفاف تمیز در `public/images/transparent/{my-ai-brain-3d.png,sniper-rocket-3d.png,capital-vault-3d.png}` و هم‌اندازه‌سازی ۵ کارت دقیقاً `185×261px`.
- [x] **۵.۳ رفع کامل کش مزاحم PWA و Cloudflare CDN (`sw.js` `v11.6.5`, `_headers`, `main.tsx`, `?v=1165`)**
  - اعمال سیاست Network-First برای HTML و تصاویر، هدرهای `no-store` برای `/` و `/sw.js`، و پاکسازی خودکار کش‌های قدیمی در کلاینت.
- [x] **۵.۴ احراز هویت ۳ مسیره (`Wallet / Google / Telegram`)، تکمیل پروفایل و TOTP 2FA (`0044_auth_profile_totp_2fa.sql`)**
- [x] **۵.۵ مستندسازی جامع کل تاریخچه V1.0 تا V11.6.5 (`DOLLARINO-COMPLETE-DOCUMENTATION.md` + `CHANGELOG.md` + `README.md`)**
- [x] **۵.۶ اجرای کامل تست زنده ۴ حالته (`Desktop Light`, `Desktop Dark`, `Mobile Light`, `Mobile Dark`), `74/74` تست سرور + `15/15` تست هسته + `21/21` تاییدیه Playwright با `84` اسکرین‌شات سازمان‌یافته (`QA-VERIFICATION-REPORT.md`)**

---

## فاز ۶: جهش جامع V11.7 — TP/SL درصدی، Pine v5 گرافیکی، Solana Vault، کارت ۹:۱۶ و اسنایپر ۵ دقیقه‌ای

- [x] **۶.۱ موتور کامل TradingView Pine Script v4/v5/v6 + پالت گرافیکی روی کندل (`packages/core/src/pine.ts`, `CandlestickChart.tsx`)**
- [x] **۶.۲ سوییچر جهانی `%` و `$` برای حد سود (`TP1/TP2/TP3`) و حد ضرر (`SL`) با تبدیل خودکار در ترمینال، حالت ساده و تنظیمات (`packages/core/src/tpsl.ts`, `TpSlModeSwitch.tsx`, `TerminalPage.tsx`)**
- [x] **۶.۳ استودیو کارت سود رسمی ۱۶:۹ و ۹:۱۶ با ۸ بازه زمانی، QR وکتور تایید اصالت و ابطال مدیریتی (`WeeklyCardPage.tsx`, `/api/admin/profit-cards/:id/revoke`)**
- [x] **۶.۴ اسنایپر ۵ دقیقه‌ای + ذخیره خودکار موتور ربات + تنظیمات دقیق ۵گانه اعلان‌ها (`USD/IRT`) همگام در وب و تلگرام (`SniperWorkbench.tsx`, `0047_v117_comprehensive_overhaul.sql`)**
- [x] **۶.۵ شارژ مستقیم خزانه سولانا (`build-solana-fund-tx`), پلتفرم معرفی و Google OAuth زنده در پنل مدیریت و تلگرام**

---

## فاز ۷: انتشار نهایی V11.7.2 Final — Chrome Side Panel، صفرسازی ایمن ادمین، نوار قیمت پیوسته و QA ۴ حالته `75/75`

- [x] **۷.۱ صفرسازی امن حساب مدیریتی با حفظ اکانت و دسترسی (`resetPrivilegedUserAccountToFreshState`, `ServicesPage`, `AdminPage`) + معافیت کامل مدیر/مالک از کارمزد و محدودیت‌ها**
- [x] **۷.۲ اکستنشن Chrome Side Panel بومی (`apps/extension`, MV3 `11.7.2`) قفل‌شده روی حالت ساده (`?ui_mode=simple&embed=sidepanel`) بدون دکمه حالت حرفه‌ای**
- [x] **۷.۳ ثبت‌نام مستقیم DApps تراست‌ولت (`tw_signup=1`), فرم یکپارچه تکمیل پروفایل (`CompleteProfileGate`) و ثبت خودکار کد معرف مدیر (`resolveEffectiveReferralCode`)**
- [x] **۷.۴ نوار قیمت زنده پیوسته بی‌انتها (`LiveTickerBar.tsx`) با `16` ارز برتر کریپتو در هر ردیف و کلیک مستقیم به صفحه بازارها (`market-spotlight-card`) + بازسازی کامل `LandingPage.tsx`**
- [x] **۷.۵ اجرای کامل `npm run typecheck`, `17/17` هسته، `84/84` سرور (`14` مجموعه)، `1748` ماژول Vite و `75/75` تست زنده ۴ حالته Playwright + Side Panel با `98` اسکرین‌شات (`0px` سرریز و `0` خطای JS)**

