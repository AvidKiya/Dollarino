# Changelog

## [11.7.2] - 2026-11-26
### TradingView-Style Pine v6 Supercharts, 1+7+1 Official Channel Ecosystem, Clean Admin Bootstrap & D1 Read Optimization (Supercharts build)
- **Pine v6 Supercharts + TradingView-Style Terminal (`apps/web/src/components/tv/`, `TerminalPage.tsx`, `packages/core/src/custom-strategy-engine.ts`)**: Added `TvSuperChart.tsx` (TradingView `lightweight-charts` superchart with markers, price scales, log/percent mode & range sync), `MultiChartGrid.tsx` (1/2/4-pane layouts with independent symbol & timeframe), `IndicatorsModal.tsx` (built-in indicator catalog + user Pine scripts), `PineEditorDock.tsx` (docked Pine v5/v6 editor with compile/run/alert), and `apps/web/src/lib/tv-indicators.ts`. Extended the Pine runtime with `map.*`, `matrix.*`, chart points/polylines, array methods and `log.*`/`alert()` support.
- **Official 1+7+1 Telegram Ecosystem (`migrations/0049`, `telegram/publisher.ts`, `telegram/admin-menu.ts`, `routes/admin.ts`)**: Main official channel + 7 sections (01 Signals, 02 Results, 03 Education, 04 Logs, 05 Database, 06 Transactions, 07 News) + official bot, with strict routing separation, private-channel hiding on public endpoints, scheduled DB reports/JSON backups and bot-user notification fan-out.
- **Clean-Slate Admin Bootstrap (`migrations/0048`, `AdminSecuritySetupGate.tsx`, `routes/admin.ts`, `auth.ts`)**: New deployments start fully raw (`system_settings` tokens, wallets, cards & channel IDs blanked) and seed a single `admin` owner guarded by primary + secondary passwords, forced credential change and mandatory Google Authenticator 2FA before any admin route unlocks.
- **D1 Read Optimization (`migrations/0050`, `services/settings-cache.ts`, `index.ts`)**: Partial/covering indexes for cron, polling, copy discovery and notification fan-out, plus batched settings reads and short-lived caches so idle 5-minute cron ticks stay far below D1 `rows_read` limits.
- **Chrome Extension (`apps/extension`, `apps/web/public/downloads/dollarino-extension.zip`)**: Refreshed side-panel build for this release.
- **Verification**: `npm run typecheck` (`0` errors), `19/19` suites — `105/105` tests (`17` core + `88` worker) incl. new `pine-v6-supercharts`, `official-ecosystem-171`, `clean-admin-bootstrap` & `d1-read-optimization` suites, Vite build, `wrangler deploy --dry-run` and `scripts/version-guard.mjs` all green.

### Admin/Owner Safe Account Reset-to-Zero + Full Fee/Limit Exemption, Chrome Side Panel Simple-Only Extension, Default Admin Referral & Unified Phone/Nickname Onboarding
- **Admin/Owner Account Reset-to-Zero & Full Exemption (`auth.ts`, `routes/admin.ts`, `server-fee.ts`, `security.ts`, `routes/trustwallet.ts`, `routes/trading.ts`, `routes/dex.ts`, `routes/copy-trade.ts`, `routes/subscriptions.ts`, `ServicesPage.tsx`, `AdminPage.tsx`, `OverviewPage.tsx`, `SubscriptionPage.tsx`)**:
  - Added `resetPrivilegedUserAccountToFreshState` (`apps/worker/src/auth.ts`): deleting/resetting an `owner` or `admin` account via `DELETE /api/auth/account`, `DELETE /api/admin/users/:id`, or `POST /api/admin/users/:id/reset-account` wipes all operational balances, trades, wallets, fee debt, notifications, and bot config to fresh `0`/brand-new-user defaults while preserving the account, credentials, session, and `owner`/`admin` privileges. Exposed clearly in `ServicesPage.tsx` (`صفرسازی حساب من (حفظ مدیریت)`) and `AdminPage.tsx` (`صفرسازی ۰`).
  - Exempted `owner` and `admin` roles completely from: 3% profit fees & locks (`evaluateUserFeeStanding`, `recordProfitShareServerFee` in `server-fee.ts`), API rate limits (`enforceRateLimit(..., { bypass })` in `security.ts`), `$10` minimum LIVE Trust Wallet balance (`getTrustWalletLiveTotalUsd` & `POST /api/trading/bot/start`), and Sniper/Copy/Config open-position ceilings.
- **Chrome Side Panel Extension — Simple Mode Only (`apps/extension/`, `App.tsx`, `Layout.tsx`, `ServicesPage.tsx`)**:
  - Upgraded `apps/extension` to **V11.7.2** using Chrome's native `sidePanel` API (`manifest.json` `"permissions": [..., "sidePanel"]`, `"side_panel": { "default_path": "sidepanel.html" }`, `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` in `background.js`), docking Dollarino permanently inside Chrome's native side panel just like Trust Wallet instead of a transient floating popup.
  - Added `?ui_mode=simple&embed=sidepanel` locked Simple Mode (`App.tsx`, `Layout.tsx`, `ServicesPage.tsx`): forces `'simple'` layout, removes all Pro-mode switch buttons, suppresses auto-pop Academy modal inside Side Panel, and works seamlessly with zero `X-Frame-Options` restrictions.
- **Automatic Admin Referral Fallback (`auth.ts`, `telegram/handler.ts`, `AuthPage.tsx`)**:
  - Added `resolveEffectiveReferralCode` across all registration channels (`POST /api/auth/register`, `/api/auth/wallet/verify`, Google OAuth `findOrCreateGoogleUser`, `/api/auth/telegram-webapp`, and Telegram Bot `/start` + contact KYC): automatically assigns the primary `owner`/`admin` referral code whenever a new user signs up without supplying a custom referral code (while still honoring explicit friend referral codes when provided).
- **Direct Trust Wallet DApp Signup & Unified Post-Signup Form (`AuthPage.tsx`, `CompleteProfileGate.tsx`, `auth.ts`, `telegram/handler.ts`)**:
  - Updated Wallet signup (`AuthPage.tsx`) to launch Dollarino directly inside Trust Wallet's DApps browser (`?auth_screen=1&auth_mode=register&tw_signup=1`) and auto-initiate Web3 signature signup upon arrival inside Trust Wallet DApp Browser.
  - Unified `CompleteProfileGate.tsx` & `POST /api/auth/complete-profile` across Wallet, Google, and Telegram signups (setting `profile_completed = 0` on newly provisioned Telegram bot users in `telegram/handler.ts`): collects **phone number** (normalized Persian/Latin digits, locked if pre-verified via Telegram), **nickname/display name**, **username**, and **password**.
- **Seamless Infinite Live Ticker Bar + Direct Click-to-Markets Navigation (`LiveTickerBar.tsx`, `Layout.tsx`, `MarketsPage.tsx`, `LandingPage.tsx`, `App.tsx`, `index.css`, `apps/worker/src/index.ts`)**:
  - Replaced duplicate single-cycle marquee gaps with a hardware-accelerated dual-lane `translate3d(-50%, 0, 0)` infinite loop (`LiveTickerBar.tsx` with `>= 16` pure top cryptocurrencies per lane inside `dir="ltr" overflow-hidden`) across Landing Page and Dashboard headers (both **Simple** and **Pro** modes).
  - Prioritized top liquid cryptocurrencies (`BTC, ETH, SOL, BNB, XRP, DOGE, TON, ADA, AVAX, SUI, LINK, DOT, TRX, NEAR, LTC, ARB, OP`) in both `/api/public/market-snapshot` and `Layout.tsx` `tickerCoins`, preventing tokenized equity pairs from displacing major coins.
  - Wired every ticker coin button to open `MarketsPage` (`markets` added to `SIMPLE_VIEWS`) with `focusSymbol` spotlight card (`data-testid="market-spotlight-card"`), auto-cleared filters, scroll-to-top, and index-0 pinning (and `#live-markets` spotlight switching on `LandingPage.tsx`).
- **Pre-Login Landing Page Full V11.7.2 Showcase (`LandingPage.tsx`)**:
  - Added `#whats-new` 6-card release highlights (Chrome Side Panel Simple Mode, Direct Trust Wallet DApp + Google + Telegram onboarding, 5m Sniper + Solana Vault, Pine v5 Chart Graphics + `%/$` TP/SL, `16:9` & `9:16` Profit Card Studio, `0%` Subscription / `3%` Net Profit Fee + Safe Admin Reset), synced `#live-markets`, hero/pillars/FAQs/footer copy, and `copyTraders` empty-state handling.
- **Verification (`11.7.2` Final)**:
  - Added `apps/worker/src/__tests__/v1172-release.test.ts` (`5` E2E integration tests), verified `npm run typecheck` (`0` errors), `17/17` `@dollarino/core`, `84/84` `@dollarino/worker` (`14` suites), `1748`-module Vite build, and full 4-mode + Chrome Side Panel Playwright live verification (`75/75` checks passed, `98` organized screenshots across Desktop Light/Dark, Mobile Light/Dark & Side Panel, `0px` horizontal overflow, `0` console/page errors).

## [11.7.1] - 2026-11-26
### Bot Start Engine Persistence Fix, Solana Copy-Vault Quick Fund + Jupiter Support, Percentage (%) TP/SL Mode & Production Worker Sync Guidance
- **Trading Bot Start Fix (`apps/worker/src/routes/trading.ts`, `apps/web/src/lib/api.ts`)**:
  - **Root Cause 1 (Live Production Mismatch on `dollarino.pages.dev`)**: Diagnosed `404 Route not found: /api/trading/accept-risk-terms` and `/api/copy-trade/smart-wallets/refresh` returning from `apps/worker/src/index.ts:599`, confirming that `dollarino.pages.dev`'s bound `dollarino-worker` was still on a pre-V11.4 build while the Pages frontend was updated to V11.7. Enriched `apiFetch` (`apps/web/src/lib/api.ts`) to surface an explicit Cloudflare Worker redeploy hint (`npx wrangler d1 migrations apply dollarino-db --remote && npx wrangler deploy`) whenever a `Route not found` 404 occurs.
  - **Root Cause 2 (In-Repo Empty-Engines Bug on Bot Start)**: Fixed `POST /api/trading/bot/start` when invoked without explicit `activeEngines` or `strategyKey` (e.g., topbar `شروع ربات`) on accounts initialized with V11.7's safe default `active_engines_json = '[]'`. Previously, `resolvedEngines` was defaulted in memory without persisting to D1, causing `TradingBotCoordinator` (`bot-do.ts`) to exit immediately on every tick. Now persists the resolved engine (`STRATEGY` / `CENTRAL_AI` / `MY_AI` / `COPY_TRADE`) via `setActiveTradingEngines` in D1 and returns `activeEngines` in the JSON response.
- **Solana (`SOL / USDC · Jupiter`) in 24/7 Quick Vault Funding & Smart Copy Hub (`routes/trustwallet.ts`, `dex/smart-copy.ts`, `lib/trustwallet.ts`, `TrustWalletConnectInline.tsx`, `SmartCopyProHub.tsx`)**:
  - Added `POST /api/trustwallet/build-solana-fund-tx` (`apps/worker/src/routes/trustwallet.ts`) + pure-TS `buildUnsignedSolanaTransferTx` (`apps/worker/src/dex/smart-copy.ts`) returning serialized legacy Solana `SystemProgram::Transfer` transactions (`txBase64`) alongside Trust Wallet `coin=501` Send Deep Links and live `SOL/USD` valuation.
  - Added `Solana (SOL / USDC · Jupiter)` to the network selector in **"شارژ سریع خزانه ۲۴/۷ و مجوز محدود روتر DEX"** (`TrustWalletConnectInline.tsx`), decoupling Vault address fetching so `+25 / +50 / +100 شارژ خزانه (SOL)` works immediately on first click (via Trust Wallet Solana `signAndSendTransaction`, Wallet Standard `solana:signAndSendTransaction`, or Trust Wallet deep-link fallback) and displaying Solana's atomic no-approve Jupiter badge + 1-click Jupiter swap link + Solana 24/7 Vault address. Fixed `SmartCopyProHub.tsx` so Solana 1-click vault funding targets `vault.solanaAddress` on Solana instead of falling back to BSC.
- **Percentage (%) + Exact Price ($) TP/SL Mode Across All Order & Position Forms (`packages/core/src/tpsl.ts`, `TpSlModeSwitch.tsx`, `TerminalPage.tsx`, `OverviewPage.tsx`, `PerpDexPanel.tsx`, `AdminPage.tsx`)**:
  - Added shared `@dollarino/core` TP/SL conversion helpers (`calcPriceFromPct`, `calcPctFromPrice`, `calcRoePct`, `formatLevelPrice`) supporting `LONG` and `SHORT`, small meme decimals (`8` digits), and leveraged ROE calculation.
  - Added the **`قیمت ($) | درصد (%)`** mode switcher, quick `%` preset chips (`SL: -1%, -2%, -3%, -5%` · `TP: +2%, +5%, +10%, +15%` / `+3%..+20%`), live exact dollar price previews (`≈ $...`), and leveraged ROE % across `TerminalPage` (New Order + Edit Open Trade modal), `OverviewPage` (Edit Open Trade modal), `PerpDexPanel` (long/short dual preview + execution), and `AdminPage` (Copy-Trader Trade & Channel Signal forms), plus added missing `.btn-danger` styling in `apps/web/src/index.css`.
- **Version Sync & Verification (`11.7.1`)**:
  - Bumped Worker health/backup, PWA service worker (`dollarino-pwa-v11.7.1`), and Chrome Extension (`11.7.1`) and verified `npm run typecheck` (`0` errors), `17/17` `@dollarino/core`, `79/79` `@dollarino/worker` (`13` suites), `1747`-module Vite build, and headless Playwright visual verification on live dev servers (`0` console errors, `0` page errors).

## [11.7.0] - 2026-11-26
### Unified Multi-Source Profit Card Studio (16:9 & 9:16), Safe All-OFF New-User Defaults, Simple-Mode Fixes & V11.7 Sync (`0046`)
- **Safe Optimal New-User Defaults (`migrations/0046_v11_7_defaults_cards_settings.sql`, `auth.ts`, `routes/*.ts`, `telegram/handler.ts`)**:
  - Updated `ensureUserDefaults` and fallback user config provisions so every new account starts safely with `bot_state = 'STOPPED'`, `active_engines_json = '[]'`, `trade_execution_mode = 'MANUAL_CONFIRM'`, `notifications_enabled = 0`, `display_currency = 'USD'`, `sniper_enabled = 0`, `sniper_auto_execute = 0`, `ai_min_confidence = 70`, `margin_pct = 8`, and `max_leverage = 5`.
  - Preserved strict security-critical alerts (such as Copy-Vault 2FA withdrawal PINs) via `bypassNotificationsPref: true` on `notifyUserTelegram`, while explicit manual `/api/trading/sniper/scan-now` calls pass `{ forceExecute }`.
- **Simple-Mode UX & Granular User Settings (`OverviewPage.tsx`, `AiChatPage.tsx`, `RadarLabPage.tsx`, `ServicesPage.tsx`)**:
  - Fixed Simple-Mode action shortcuts (`تنظیمات مدل` -> `AiChatPage` `models` subtab; `بررسی استراتژی` -> `RadarLabPage` `lab` subtab) with StrictMode-safe `sessionStorage` + custom event sync and removed misleading arrow glyphs.
  - Added unified Bot Preferences, `USD`/`IRT` Primary Display Currency switcher, and Master + 5 granular notification switches (`tradeOpen`, `tpSlHit`, `aiSignals`, `whaleCopy`, `dailyDigest`) to `ServicesPage.tsx` Account Settings (`PATCH /api/trading/config`).
- **Profit Card Studio Overhaul (`services/profit-cards.ts`, `cards/renderer.ts`, `WeeklyCardPage.tsx`, `VerifyCardPage.tsx`)**:
  - Aggregated closed trades across **PERP + DEX + COPY** (`ALL | PERP | DEX | COPY`), expanded periods to **`24H`, `7D`, `30D`, `3M`, `6M`, `1Y`, `ALL`, `TRADE`** (Single-Trade picker), embedded token badges/logos, Entry/Exit/Signal metadata, vector QR codes (`qrcode`), and exact **`1200x675` (`16:9` Landscape)** & **`1080x1920` (`9:16` Vertical Story)** SVG/PNG outputs with RTL numeral BiDi isolation.
- **Chrome Extension V11.7, Telegram Bot Parity & Admin Audit (`apps/extension/`, `telegram/`, `routes/admin.ts`, `AdminPage.tsx`)**:
  - Fixed Extension `PLATFORM_AI -> CENTRAL_AI` bug, switched polling to `/api/trading/live-ticks?poll=1` & `/dashboard?lite=1`, updated 3%-profit referral copy, bumped manifest to `11.7.0`, and rebuilt `/apps/web/public/downloads/dollarino-extension.zip` (`412264` B).
  - Synced Telegram Bot `/card` & `دریافت اعلان 🔔` inline controls (`3M`, `6M`, Single-Trade picker, `9:16` Story, granular notifications, `USD/IRT` currency) and `V11.7` copy.
  - Added Admin Profit Cards Registry + Revoke/Restore (`GET /api/admin/profit-cards`, `POST /api/admin/profit-cards/:id/revoke`) and Live Active User Bots Monitor + Emergency Stop (`GET /api/admin/active-bots`, `POST /api/admin/users/:id/bot-stop`).
- **Verification (`core.test.ts`, `v117-overhaul.test.ts` + Full Monorepo & Live Playwright QA)**:
  - Passed full monorepo `tsc --noEmit`, `17/17` `@dollarino/core` tests (Pine v4/v5/v6 `ta.*`/boxes/lines/labels/HUD tables & stateful `var` execution), `78/78` `@dollarino/worker` tests across `13` suites, `1744`-module Vite build, local D1 migrations `0046` & `0047`, Admin Google OAuth + `AuthPage` Sign-In button verification, 5m Sniper Pro sticky-filter verification, TradingView SMC Order Blocks + FVG + HUD live chart verification (`0` console errors, `0` page errors), and `16:9` / `9:16` profit card PNG rendering.

## [11.6.6] - 2026-11-25
### Cloudflare D1 Read Reduction (~85–95%), Startup Speed & Mobile 60fps Optimization (`0045`)
- **D1 Covering & Partial Indexes (`migrations/0045_v11_6_6_d1_read_indexes.sql`)**:
  - Added 10 composite/partial covering indexes across `bot_configs`, `audit_logs`, `trades`, `dex_token_trades`, `smart_copy_positions`, `perp_orders`, `trading_signals`, `notifications`, `api_rate_limits`, and `users` to eliminate table scans on cron, dashboard, and auth lookups.
- **Trust Wallet RPC, Auth Poll & Trading Hot-Path Caching (`auth.ts`, `routes/trustwallet.ts`, `routes/trading.ts`, `engine/executor.ts`)**:
  - Added short-TTL `WeakMap<D1Database>` read-through caches for Trust Wallet RPC live balances (`45s` RPC / `20s` live USD, `2200ms` provider timeout, invalidated on connect/reset/sync), poll-scoped `AUTH_USER_CACHE` (`20s` strictly on `?poll=1`, `?lite=1`, or `X-Dollarino-Poll: 1`), `LIVE_TICKS_POLL_CACHE` (`1.5s`), and `TICKER_QUOTE_CACHE`/`DEX_QUOTE_CACHE` (`4s`), plus instant write invalidation on mutations/admin actions.
  - Eliminated duplicate `users`/`bot_configs`/`exchange_connections`/`trades` reads across `resolveModeAwareWalletAndBalance`, `/api/trading/live-ticks`, `/api/trading/dashboard`, and `PaperExchangeAdapter`.
- **DO, Cron & Market-Intel Throttling (`engine/bot-do.ts`, `services/site-traders.ts`, `engine/market-intel.ts`, `exchanges/iran-rate.ts`, `index.ts`)**:
  - Prefetched full `bot_configs` rows in `TradingBotCoordinator.alarm()` with `45s`/`120s` adaptive spacing, cached onboarding gate (`120s`) & engine metadata (`90s`) in DO storage, throttled heartbeat audit logs to `300s`, bounded `discoverTopSiteTraders` to `-90 days`, gated sniper cron queries on active `LISTING_SNIPER`, throttled auto top-traders sync to `60m`, skipped cooldown setting writes in `market-intel`, and raised `iran-rate.ts` cache TTL to `45s`/`60s`.
- **Frontend Startup Speed, Polling & Mobile 60fps Smoothness (`apps/web/`)**:
  - Converted 11 transparent 3D assets (`2256KB -> 348KB`), `logo-sm.webp` (`226KB -> 9KB`), and referral/treasury banners (`3.4MB -> 69KB`) to WebP (`apps/web/public` shrunk from `~9.2MB` to `3.5MB`).
  - Made Google Fonts non-render-blocking (`index.html`), fixed initial-install double-reload bug (`main.tsx`), switched `/images/*` to Stale-While-Revalidate (`sw.js` `v11.6.6`), lazy-loaded `LandingPage`/`AuthPage`/`OverviewPage`/modals (`App.tsx` + `vite.config.ts` vendor chunks), parallelized startup `dashboard` + `markets` fetches, switched `live-ticks` to adaptive `3s/15s` `?poll=1` with idle change-dedup, removed automatic `?refresh=1` Iran-rate polls, isolated `Layout` 1s UTC clock (`LiveUtcClock`), and disabled multi-pass mobile `backdrop-blur` & decorative infinite animations under `@media (max-width: 1024px)` (`index.css`) with zero desktop visual changes.

## [11.6.5] - 2026-11-25
### Zero-Custody UI Redesign, Visual Assets Fix, Cache Busting & 4-Mode QA
- **100% Non-Custodial User Treasury UI (`TreasuryBankingHub.tsx`, `DexTrustPage.tsx`, `SubscriptionPage.tsx`, `ServicesPage.tsx`, `Layout.tsx`, `PortfolioPage.tsx`, `SmartCopyProHub.tsx`, `PromoBannerCarousel.tsx`)**:
  - Eliminated all legacy "deposit trading funds to platform treasury" phrasing across user-facing screens; clearly established that **user trading funds always stay 100% inside the user's own Trust Wallet**, controlled directly via on-wallet capital budget caps (`$50–$1000`, `25%–75%`, or Full Wallet).
  - Separated profit-fee settlement (`تسویه بدهی کارمزد ۳٪ سود واقعی`) and optional prepaid fee credit (`شارژ اختیاری اعتبار کارمزد ۳٪`) cleanly with custom `ProDropdown` selectors (`0` native `<select>` elements).
- **Simple Mode 5-Card Grid Symmetry & Clean 3D Icons (`OverviewPage.tsx`, `OnboardingAcademyModal.tsx`, `apps/web/public/images/transparent/`)**:
  - Replaced the asymmetrical `lg:grid-cols-6` layout with a uniform `lg:grid-cols-5` grid (`185×261px` equal cards on `1440px` desktop) and fixed `setSimpleModel('hunting')` type typing.
  - Regenerated and flood-fill extracted 3 clean `512×512` transparent PNG icons (`my-ai-brain-3d.png`, `sniper-rocket-3d.png`, `capital-vault-3d.png`) and verified all 11 transparent icons.
- **PWA & CDN Cache Busting (`sw.js`, `_headers`, `main.tsx`)**:
  - Upgraded Service Worker to `dollarino-pwa-v11.6.5` with Network-First routing for HTML, JS/CSS, and `/images/*`, set `Cache-Control: no-cache, no-store, must-revalidate` for `/`, `/index.html`, and `/sw.js`, added startup legacy cache purging + `controllerchange` single reload in `main.tsx`, and appended `?v=1165` to updated icon paths.
- **Documentation & Live 4-Mode QA Verification (`DOLLARINO-COMPLETE-DOCUMENTATION.md`, `QA-VERIFICATION-REPORT.md`)**:
  - Authored complete V1.0–V11.6.5 technical documentation inside `/home/user/Dollarino/` and executed 4-mode Playwright live verification (**Desktop Light/Dark & Mobile Light/Dark**, `84` screenshots, `21/21` functional checks passed, `0` JS errors, `0` HTTP 500s, `0` horizontal overflow).

## [11.6.0] - 2026-11-24
### Real Trust Wallet DApp Execution, Multi-Method Auth & TOTP 2FA (`0042`–`0044`)
- **Cryptographic Wallet Verification & Placeholder Cleanup (`migrations/0042_clean_placeholders_and_tw_nonces.sql`, `routes/trustwallet.ts`)**:
  - Added single-use 5-minute D1 nonces (`trust_wallet_nonces`) and real EIP-191 `personal_sign` `secp256k1` `ecrecover` address verification via `@noble/curves`; purged all legacy placeholder wallet addresses.
- **Real In-App Trust Wallet DApp Trading (`routes/dex.ts`, `dex/perp-dex.ts`, `engine/executor.ts`, `engine/listing-sniper.ts`)**:
  - Added 1-click **Hyperliquid EIP-712 `ApproveAgent`** wizard (trade-only agent key with zero withdrawal access, AES-256-GCM encrypted).
  - Added `POST /api/dex/build-swap-tx` for real on-chain calldata (Jupiter v6 on Solana; ParaSwap/1inch/Router on BSC, Base, Arbitrum, Ethereum), limited ERC-20 router allowance + Revoke, and full `LIVE + AUTO` execution paths.
- **Clean Verified Copy List & Invoice Sender Tracking (`migrations/0043_remove_default_copy_traders.sql`)**:
  - Removed hardcoded demo copy traders so the verified copy list reflects only real admin/user-registered traders, and added `sender_address` invoice tracking.
- **3-Path Auth, Mandatory Profile Gate & Google Authenticator TOTP 2FA (`migrations/0044_auth_profile_totp_2fa.sql`, `crypto.ts`, `auth.ts`, `AuthPage.tsx`, `ServicesPage.tsx`, `CompleteProfileGate.tsx`)**:
  - Enabled 3-path signup/login (**Trust Wallet**, **Google**, **Telegram**), mandatory profile completion (`CompleteProfileGate`), and RFC 6238 **TOTP 2FA** setup/verification/disable flows.
- **Extension V11.6 Update (`apps/extension/`)**: Synchronized Chrome MV3 extension with V11.6 APIs and non-custodial controls.

## [11.5.0] - 2026-11-24
### Cloudflare D1 Optimization, Zero Subscription Enforcement, Signal Controls & D1 Admin Suite (`0041`)
- **D1 Performance & Free-Tier Scaling (`migrations/0041_v11_5_indexes_and_controls.sql`, `services/settings-cache.ts`)**:
  - Added 15 composite covering indexes across hot tables, `WeakMap<D1Database>` in-memory TTL cache (`45s` settings / `60s` copy traders) with instant write invalidation, merged dashboard queries + `?lite=1` polling route, `90s` idle `TradingBotCoordinator` alarm, and visibility-gated client polling.
- **0% Monthly Subscription + 3 Free Profitable Live Trades + 3% Profit-Share Only**:
  - Eliminated all legacy `402 SUBSCRIPTION_REQUIRED` paywalls; all tools, `$50–$10M` customizable simulator, and 25+ indicators are free for everyone.
- **Independent Signal Controls & Owner D1 Database Manager (`routes/admin.ts`, `AdminPage.tsx`)**:
  - Added instant `publish_signals_to_channels` vs. `publish_signals_to_bot_users` switches, plus Owner-only D1 Database Manager (`stats`, `prune-logs`, `backup` JSON with optional secret exclusion, `restore` MERGE/REPLACE, and `wipe`).

## [11.0.0] – [11.4.0] - 2026-11-23
### Simultaneous 5-Engine Execution, Listing/Meme Sniper, Dynamic Capital Budget & Interactive Academy (`0037`–`0040`)
- **V11.0 (`0037`)**: Simultaneous multi-engine bot execution (`active_engines_json` across Central AI, Dorna V1, My AI, Copy Trade, and Sniper), customizable `$50–$10M` paper demo balance, `listing-sniper.ts` & `SniperPage.tsx`, 3 free profitable live trades + 3% profit-only fee, and mandatory risk terms acceptance.
- **V11.1–V11.2 (`0038`–`0039`)**: Dynamic wallet capital budget controls (`FULL_BALANCE`, fixed USD, or percentage cap) and per-user personal trading journal (`account_notes`).
- **V11.4 (`0040`)**: Strict initial mode+risk onboarding gate, interactive `OnboardingAcademyModal`, and complete Sniper filters (`LISTING | MEME | BOTH`, minimum liquidity, anti-rug safety score).

## [10.0.0] – [10.5.0] - 2026-11-23
### Smart Copy Pro V2, Trust Wallet Exclusivity, Profit-Share Model & Transparency (`0027`–`0036`)
- **V10.0–V10.2 (`0027`–`0031`)**: Top-10 On-Chain Whale discovery & Copy-Vault V2 with self-owned 24/7 sub-wallet keys, Perp DEX (`Hyperliquid / Jupiter Perps / GMX`), WebP `promo_banners` carousel, scheduled admin broadcasts + Copy-Vault PIN verification, and removal of CEX references in favor of exclusive Trust Wallet + `$10K` simulator integration.
- **V10.3–V10.5 (`0032`–`0036`)**: Transitioned from paid monthly subscriptions (`subscription_required = false`) to profit-only server fee ledger (`1%` -> `5%` -> refined to `3%` in V11.0), free TradingView webhook alerts, 5 separated Telegram channels, admin-editable Founder Anti-Ponzi transparency profile (`founder-profile.ts`), and automated Telegram community group moderation (`group-moderator.ts`).

## [9.9.2] - 2026-11-22
### Added & Improved
- **Screenshot & Receipt Image Support End-to-End (Web, Admin & Telegram Bot + D1 Migration `0025`)**:
  - Added `support_messages.image_data_url` and `user_subscriptions.receipt_image_url` (`migrations/0025_v992_receipt_and_support_images.sql`).
  - Upgraded `SupportModal.tsx`, `routes/support.ts`, and Telegram `AWAIT_SUPPORT_MSG` so users can attach, paste (`Ctrl+V`), or send screenshots in Telegram and Web; AI Vision analyzes uploaded screenshots automatically, and human support relays photos directly to all Telegram admins via `sendPhoto` (`notifyAllAdminsPhoto`) + displays them inside `AdminPage.tsx` with full-screen lightbox preview.
  - Redesigned `SubscriptionPage.tsx` into a clear 3-step checkout flow with compressed `receiptImageDataUrl` upload (making TXID optional when a payment receipt photo is uploaded), instant auto-scroll to checkout, order receipt lightbox, and admin photo relay (`sub_verify:` / `POST /api/subscriptions/checkout`).
- **Central AI & DeepSeek / Hilinkup Gateway Normalization + Failover (`ai/providers.ts`, `ai/assistant.ts`, `routes/admin.ts`)**:
  - Automatically normalizes legacy/alias model names (`deep`, `deepseek`, `دیپی`, `deepseek-v4`) on `hilinkup.com` and DeepSeek endpoints to `baidu/deepseek-v4.1-flash-1017` / `deepseek-chat`, with automatic multi-model failover retry and explicit `hilinkupSecretConfigured` status visibility in `AdminPage.tsx`.
- **Logo-Inspired Floating AI Robot Orb & Unified Mobile Chat UX (`FloatingAiChat.tsx`, `Layout.tsx`, `LandingPage.tsx`)**:
  - Replaced the plain orb with a bespoke `DollarinoRobotLogoIcon` SVG inspired by `public/logo.png` (cosmic astronaut-bot with ascending jade candles), added a responsive mobile full-width bottom-sheet (`84dvh`), unified rounded-pill composer bars with safe-area padding, and decluttered mobile headers.
- **Mobile 60fps Performance, Lazy Routing & Dynamic Open Graph (`App.tsx`, `index.css`, `index.html`, `sw.js`, `worker/index.ts`)**:
  - Added `React.lazy` + `<Suspense>` code splitting across 14 secondary pages, disabled heavy `.panel` `backdrop-filter` below `1024px` for smooth mobile scrolling, moved OG meta tags to early `<head>` (`?v=992`) with server-side origin rewriting (`serveAssetsWithDynamicOg`), and bumped PWA cache to `dollarino-pwa-v9.9.2`.

## [9.9.1] - 2026-11-22
### Fixed & Improved
- **Mobile UI Cleanup — Removed Background Halos (`apps/web/src/index.css`, `LandingPage.tsx`, `BrandGraphics.tsx`)**:
  - Removed multi-spot radial gradient color halos (`--bg-art`) and `background-attachment: fixed` that rendered blotchy mobile backdrop artifacts, removed the `blur-[130px]` hero halo in `LandingPage.tsx`, toned down `.glow-card-anim` and mobile tab indicator bloom, and softened logo drop-shadows.
- **iPhone AssistiveTouch-Style Collapsible Floating AI Orb (`apps/web/src/components/FloatingAiChat.tsx`)**:
  - Replaced the oversized capsule button with a subtle, compact `44×44` circular glass orb modeled after iOS AssistiveTouch with concentric white rings, free pointer drag-to-move with left/right edge snapping, persistent position (`localStorage`), and automatic soft edge-collapse (`opacity: 0.48`, tucked half off-edge after 2.4s idle) so it stays unobtrusive on mobile and desktop.
- **Always-On Zero-Downtime AI Chat & Guest Support (`apps/worker/src/ai/assistant.ts`, `index.ts`, `env.ts`, `FloatingAiChat.tsx`)**:
  - Added public rate-limited `/api/public/ai-models` and `/api/public/ai-chat` endpoints so the floating AI orb opens an active chat immediately even before login.
  - Added seamless multi-model auto-failover across admin `platform_ai_engines`, `HILINKUP_API_KEY`, personal `ai_connections`, optional Cloudflare `env.AI`, and a zero-downtime built-in live market AI (`dollarino-live-ai`) that pulls real-time prices/candles and computes Entry/SL/TP1–TP3 setups, position sizing, Pine Script strategies, and platform/creator answers whenever external LLM gateways are unconfigured or unreachable.
- **Branded Open Graph & Social Link Preview (`apps/web/public/images/dollarino-og-brand.jpg`, `index.html`, `_headers`)**:
  - Created and optimized a `1200×630` Progressive JPEG (`114 KB`) featuring the official Dollarino logo (`logo.png`) alongside cache-busted Open Graph/Twitter meta tags and Cloudflare Pages `_headers` for crisp Telegram & Instagram DM previews.

## [9.9.0] - 2026-11-22
### Added
- **Floating AI Assistant & Dedicated Multi-Model Chat Page (`apps/web/src/components/FloatingAiChat.tsx`, `AiChatPage.tsx`, `apps/worker/src/ai/assistant.ts`, `routes/ai-assistant.ts`)**:
  - Added an always-accessible **Floating AI Chat Widget** across landing, auth, and workspace pages, plus a full-screen **Dedicated AI Chat & Vision Page** (`?tab=aichat`) with saved conversation sessions.
  - Added live **AI Model Selector** listing all connected platform engines (admin-configured OpenAI, Anthropic, Gemini, DeepSeek, Hilinkup) and user BYOAI keys, persisting per-user preference across Web and Telegram.
  - Added **Chart Image Upload / Drag & Drop / Clipboard Paste (`Ctrl+V`)** with client-side JPEG compression and full **Multimodal Vision Analysis** (OpenAI/GPT-4o, Claude, Gemini, OpenAI-compatible Vision gateways) that automatically extracts structured **Entry / Stop Loss / TP1–TP3 / R:R Trading Setups**.
- **Full Telegram Bot AI Chat, Model Switcher & Chart Image Analysis (`apps/worker/src/telegram/handler.ts`, `client.ts`, `formatter.ts`)**:
  - Added `/ai`, `/chat`, and `🧠 چت هوش مصنوعی (عکس چارت)` button, inline model switcher (`tg_ai_models`), new session control, direct Telegram photo/document image download & chart Vision analysis, 1-click conversion of extracted chart setups into Dollarino signals (`tg_ai_exec_setup`), and conversational AI fallback.
- **Project Creator Attribution (`Avid Kiya / آوید کیا`)**:
  - Credited creator **آوید کیا (Avid Kiya)** with official handles (**Telegram: `@avidkiya`**, **Instagram & X: `@avid_kiya`**) in Dedicated AI system memory, Web Landing/Dashboard/FAQ footers, `/api/public/creator`, and Telegram `/start`, `/help`, and `/about`.
- **Database Migration (`migrations/0024_v99_ai_chat_vision_creator.sql`)**:
  - Added `users.preferred_ai_model_id`, `ai_chat_sessions`, and `ai_chat_messages`.

## [9.8.1] - 2026-11-22
### Added & Improved
- **Rich Telegram & Social Link Preview (`apps/web/index.html`, `og-preview.jpg`)**:
  - Generated bespoke `1200×630` Open Graph preview artwork (`/images/og-preview.jpg`, `209 KB`) and added full `og:title`, `og:description`, `og:image`, `og:site_name`, and `twitter:card` (`summary_large_image`) meta tags so sharing `https://dollarino.pages.dev/` in Telegram displays a crisp banner image and polished Persian description.
- **Always-On 24/7 AI Signal Radar & Channel/Bot Intel Publisher (`apps/worker/src/engine/market-intel.ts`, `publisher.ts`, `index.ts`, `admin-menu.ts`)**:
  - Added `runAlwaysOnSignalRadar` to Cloudflare Cron (`* * * * *`): continuously scans markets via Dorna V1, KBOS v11, and Central AI and broadcasts verified signals to both `@Dollarino_official` and verified bot users **even when users' auto-trading bots are STOPPED**.
  - Added `runAlwaysOnAiIntel`: automatically publishes AI-generated **Market Analysis** (every 4h), **Crypto News Summaries** (every 6h), **Volatility / RSI Risk Alerts** (threshold-based + 2h cooldown), and **Platform Feature Spotlights / Promos** with brand banners (every 8h) to both the Telegram channel and bot users, with instant 1-tap triggers & toggles in the Telegram Admin Channel panel (`adm:channel`).

## [9.8.0] - 2026-11-21
### Added & Improved
- **Visual Banners, Brand Logos & Exchange Integrations (`Toobit`, `Bitunix`, `KCEX`, `Paper`)**:
  - Generated 4 high-resolution visual banners (`support-concierge.png`, `exchange-api-hub.png`, `my-ai-brain.png`, `vip-club-banner.png`) optimized for fast web/mobile delivery, plus `BrandLogos.tsx` (`ExchangeLogo`, `WalletLogo`, `ChainLogo`) covering exchanges, wallets, and 16+ blockchains.
  - Enabled `Bitunix Futures` across Worker (`bitunix.ts` with `getPositions()`, `connections.ts`, `trading.ts`, Telegram `handler.ts`/`formatter.ts`) and Web (`CopyConnectPage.tsx`, `SetupWizardModal.tsx`, `LandingPage.tsx`, `SubscriptionPage.tsx`, `ServicesPage.tsx`), and made `KCEX` Signal-Mirror keys optional (passwordless activation).
- **Redesigned Online Support (`SupportModal.tsx`)**:
  - Upgraded header with `support-concierge.png`, live online pulse badge, smooth sliding AI vs. Human segmented switcher, 4 quick-topic cards, and animated typing indicator.
- **Dual Telegram Mini App + Google/Browser PWA Login (`handler.ts`, `auth.ts`, `App.tsx`, `PwaInstallModal.tsx`)**:
  - Updated `sendWebMagicLoginLink` to include both a Telegram `web_app` Mini App button and a Google/Browser button (`&install=1`), backed by a 10-minute reusable `web_magic_token` and automatic `PwaInstallModal` trigger.
- **Multi-Chain Wallet Connect & All-Network DEX Radar (`migrations/0023_v98_multichain_wallets.sql`, `trustwallet.ts`, `screener.ts`, `DexTrustPage.tsx`)**:
  - Added `trust_wallet_ton` D1 column, multi-chain injected discovery (`connectAllWalletChains` for EVM + Solana + TRON + TON), 1-click EVM network switching (Ethereum, BSC, Base, Arbitrum, Polygon, Optimism, Avalanche), live 9-network on-chain balance querying, and parallel DexScreener + GeckoTerminal pair discovery across 17+ chains.
- **Service Worker (`sw.js`) & Full Audit Fixes**:
  - Updated cache version to `dollarino-pwa-v9.8`, fixed `bitunix.ts` `markPrice` typing, synced `trust_wallet_ton` across `support.ts`, `admin.ts`, and `admin-menu.ts`, and added end-to-end Miniflare tests in `telegram-bot.test.ts`.

## [7.1.0] - 2026-11-20
### Added
- `migrations/0012_telegram_bot_admin_suite.sql`: Added `wallet_balance_usdt`, `admin_panel_last_active_at`, `web_magic_token`, `web_magic_expires_at` on `users`, `code_type` / `credit_usdt` on `gift_codes`, and bot system defaults (`bot_help_text`, `bot_help_media_url`, `bot_private_admin_only`, `signal_channel_handle`, `default_margin_pct`, `default_max_leverage`, `usdt_to_toman_rate`).
- **Full Telegram Bot (`@Dollarino_bot`) & Channel (`@Dollarino_official` / `-1002263982097`) Specification**:
  - Updated Persian welcome (`سلام خوش اومدی {name} 🌹`), main keyboard (`اتصال به صرافی 🔗`, `تنظیمات ⚙️`, `حساب کاربری 👤`, `خرید اشتراک 💎`, `راهنما 📚`, Mini App), and full inline **Toobit & KCEX** API Key/Secret onboarding + Paper Demo (`Free/Used/Total` balance card).
  - Added interactive **تنظیم مقادیر معاملات 🪛** submenu (margin %, TP1/TP2/TP3 split presets & custom entry, max leverage, `@Dollarino_official` signal channel, Risk-Free BE/TP1 toggles).
  - Upgraded **اعلان معاملات بسته (`formatTradeClosedCard`)** and `executor.ts` with exact `تبریک میگم 🤑` / `ضرر هم جزئی از بازار🥲` templates, Iran/Tehran timestamps, and strategy SL/TP/leverage details.
  - Added full **حساب کاربری 👤** (USDT + Toman wallet balance, numeric ID, Persian subscription dates, `افزایش موجودی 💰`, `خرید اشتراک 💎`), 4-plan TRC20 checkout (`$20`/`$50`/`$90`/`$160`), `✅ بررسی پرداخت / ثبت TXID` -> Super Admin approval alert, wallet payment, and subscription/wallet gift code redemption.
  - Added **9-Section Telegram Admin Panel (`apps/worker/src/telegram/admin-menu.ts`)**: Financial & Stats Dashboard, User Search/List/VIP/Downgrade/Charge/Block/Stats, Audience-Targeted Broadcast (text/photo), Transaction Filters + Approve/Reject, Gift Code Wizard & Toggle, Live System Settings Editor (plan prices, margin, leverage, channel, TRC20 wallet, Toman rate, help text/media, `bot_private_admin_only` switch), Time-Filtered Reports with **real downloadable JSON & Excel/CSV (`sendDocument`)**, and **Super Admin (`944021185`)-locked Admin & Permissions Management** with 15-minute idle auto-exit and audit logging.
- **Bidirectional Easy Registration, Login & Account Linking**:
  - Added `/start LINK-XXXXXX` deep-link auto-merge, `/weblogin` + `POST /api/auth/telegram-magic-login` 1-click magic browser login, and `AuthPage.tsx` + `ServicesPage.tsx` + `CopyConnectPage.tsx` 1-click `@Dollarino_bot` links (`t.me/Dollarino_bot?start=...`).
- **Automated Telegram Bot Integration Tests (`apps/worker/src/__tests__/telegram-bot.test.ts`)**: Full Miniflare D1 + mocked Telegram API test suite covering onboarding, Toobit/KCEX, trade quantities, 9-section admin panel, CSV/JSON document export, Super Admin isolation, 15-min timeout, and signal manual confirmation.

## [7.0.0] - 2026-11-20
### Added
- `migrations/0011_custom_strategies.sql`: Added `user_strategies` table (`pine`, `python`, `visual` strategies) and `bot_configs.active_custom_strategy_id` for 24/7 autonomous custom code execution.
- **Simple Mode Guided 4-Step Launcher (TimeTrade Parity)**: Embedded full 4-step launcher (`تنظیم ربات معاملاتی` | `اتصال صرافی واقعی` -> `1. مبلغ سرمایه 2. سطح ریسک 3. استراتژی 4. تأیید و شروع`) directly in Simple Mode (`OverviewPage.tsx`), plus Hourly Trading Activity curve & Open/Settled trade tabs.
- **Pro Quant Strategy IDE (Pine Script v4/v5 + Python + Visual Builder)**:
  - Added deterministic zero-`eval` interpreter in `packages/core/src/custom-strategy-engine.ts` supporting Pine Script v4/v5 (`ta.ema`, `ta.sma`, `ta.rsi`, `ta.atr`, `ta.bb`, `ta.supertrend`, `ta.macd`, `ta.vwap`, `plot()`, `strategy.entry()`) and Python Quant (`df['close'].ewm().mean()`, `rolling()`, `ta.bbands`, `crossover`, `plot()`, `df.loc[..., 'signal']`) plus No-Code Visual Rule Builder and 6 built-in templates (`SAMPLE_CUSTOM_STRATEGIES`).
  - Added Worker CRUD, Live Evaluation & Bot Activation routes (`/api/trading/strategies`, `/evaluate`, `/:id`, `/:id/activate`) and integrated `bot-do.ts` autonomous execution.
  - Added `StrategyIdePanel.tsx` to `RadarLabPage.tsx` (`Pine / Python IDE` tab) and live `Pine/Py` script drawer inside `TerminalPage.tsx` with direct `CandlestickChart.tsx` line plotting & marker overlays.
- **Landing Page Redesign & 3D Brand Visuals**: Added generated glassmorphic 3D assets (`hero-core.png`, `ide-prism.png`, `vault-shield.png`), live scrolling ticker, interactive Desk/Simple/IDE hero switcher, Pine/Python product showcase tab, cryptographic HMAC security section, and animated CSS transitions.

## [6.2.0] - 2026-11-20
### Added
- `migrations/0010_spot_futures_directions_verified_cards.sql`: Added `market_type`, `direction_mode`, and `hedge_mode` on `bot_configs`, `market_type` on `trades`, and `verified_profit_cards` table for tamper-proof HMAC-SHA256 profit cards.
- **Full Spot & Futures Engine**: Live `Toobit` Spot (`/api/v1/spot/order`, `/api/v1/account`) and Futures execution, Paper Spot (`1x` leverage + no margin-short guard), and uncapped Spot (`1000+`) + Futures (`800+`) market scanning & pagination.
- **Dual-Direction & Futures Hedge Mode**: `BOTH` / `LONG_ONLY` / `SHORT_ONLY` direction filtering in risk engine & executor, plus simultaneous LONG + SHORT positions per symbol when `hedge_mode = 1`.
- **Tamper-Proof Verified Profit Cards**: `POST /api/trading/cards/issue`, `GET /api/trading/cards`, `GET /api/public/verify-card/:cardId`, QR-embedded PNG export in `WeeklyCardPage.tsx`, and public verifier route `/verify-card/:cardId` (`VerifyCardPage.tsx`) distinguishing verified `LIVE` vs `PAPER` cards.
- **Telegram Bot & Mini App Integration**: Added `setMyCommands`, `setChatMenuButton`, `POST /api/webhook/telegram/setup`, interactive `web_app` launchers, `/app`, `/positions`, `/balance`, `/settings`, `/help`, callback handlers (`set_mkt:*`, `set_dir:*`, `toggle_hedge`, `tg_positions`, `close_pos:*`, `tg_bot_toggle`), and bidirectional account merge (`POST /api/auth/telegram/merge-code`) in `ServicesPage.tsx`.
- **Iconography & Real-Time Polish**: Multi-CDN + clean inline SVG `CoinIcon`, wired `/api/events/stream` SSE listeners in `Layout.tsx`, and replaced all UI emojis across `apps/web/src` with `lucide-react` icons.

## [6.1.0] - 2026-11-19
### Added
- `migrations/0009_notifications_and_idempotency.sql`: Persistent `notifications` feed and `(user_id, signal_id)` duplicate execution guard index.
- `GET /api/events/stream`, `GET /api/trading/notifications`, `POST /api/trading/notifications/read`, `GET /api/trading/events/snapshot`.
- `apps/web/src/pages/ServicesPage.tsx`: Dedicated Kifpool-style Account & Services Hub (`خدمات`).
- Sculpted curved SVG notch bottom dock (`خانه`, `بازار`, floating center Cobalt trade button, `کیف پول`, `خدمات`) with warm amber active indicator.

### Changed
- Consolidated multi-theme switcher into a single cohesive Apple iOS Cupertino theme supporting Day (`paper`) and Night (`cosmic`) modes.
- Removed top announcement ribbon from `LandingPage.tsx` and restored dark `.console-lab` high-contrast surface for `HybridLab.tsx`.
- Hardened `handler.ts` `channel_post` origin check to official channel `-1002263982097` / `@Dollarino_official` and rejected forwarded posts + expired manual signal confirmations (>60 min).
- Fixed `App.tsx` admin route guard so both `ADMIN` and `OWNER` roles can open `AdminPage`.

## [6.0.0] - 2026-11-19
- Initial v6 release with Chart AI Terminal, Multi-AI Ensemble, Subscriptions, Gift Codes, Referrals, Weekly PNG Cards, Telegram Bot & Mini App HMAC auth.
