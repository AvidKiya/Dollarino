# Dollarino Native Android App (`apps/android`)

Real, lightweight, fast native Android application for **Dollarino (دلارینو)** — **not** a browser shortcut.

## Architecture Highlights
- **Local Offline-First UI Bundle (`WebViewAssetLoader`)**: Bundles compiled `apps/web/dist` directly inside the APK (`app/src/main/assets/public`) and serves it locally at `https://appassets.dollarino.local/` with zero external webpage load latency, exact mobile website UI & full feature parity (TradingView Supercharts, AI Chat & Vision, Listing Sniper, Copy-Vault, Trust Wallet DApp, Central Treasury, Admin Panel).
- **Direct Cloudflare Worker API Connection**: All API requests talk directly to Dollarino's Cloudflare Worker (`https://dollarino.pages.dev`, configurable via `-PDOLLARINO_API_BASE=...` or in-app override) using encrypted Bearer/header authentication (`X-Dollarino-Token`).
- **Encrypted Keystore Session Storage (`SecureSessionStore`)**: Uses AndroidX `EncryptedSharedPreferences` (`AES256-GCM` `MasterKey`) to persist session tokens, notification cursor, and device ID securely inside hardware-backed Android Keystore.
- **5 Native Android Notification Channels + Background Sync (`NotificationSyncWorker`)**:
  - `dollarino_signals`: AI Signals & Radar Alerts (`IMPORTANCE_HIGH`)
  - `dollarino_trades`: Order Entries, TP1/TP2/TP3, SL & Risk-Free Alerts (`IMPORTANCE_HIGH`)
  - `dollarino_sniper`: New Listings & Meme Sniper Alerts (`IMPORTANCE_HIGH`)
  - `dollarino_security`: 2FA, Vault Withdrawals & Account Security (`IMPORTANCE_HIGH`)
  - `dollarino_system`: 3% Server Fee, Treasury & Platform Status (`IMPORTANCE_DEFAULT`)
  - Backed by AndroidX `WorkManager` polling `/api/mobile/notifications/feed` reliably in the background (even where Google Play Services / FCM is unavailable) plus instant foreground polling (`45s`).
- **Native Hardware & App Intents (`window.DollarinoNative`)**:
  - Trust Wallet (`trust://` / `https://link.trustwallet.com/...`) & Telegram (`tg://` / `https://t.me/...`) deep-link handoff
  - Google OAuth Custom Tab login returning via `dollarino://auth?google_token=...`
  - Android 13+ (`POST_NOTIFICATIONS`) permission launcher, hardware haptics, image file chooser (Vision AI & Avatar upload), dynamic dark/light system bars, and back-button modal/tab navigation.

## Building & Packaging
1. Sync latest mobile web bundle into Android APK assets:
   ```bash
   npm run build:android
   ```
2. Compile Debug or Release APK (requires Android SDK 35 + Gradle 8.9+ / Java 11+):
   ```bash
   cd apps/android
   gradle assembleDebug
   # Or Release:
   gradle assembleRelease
   ```
3. Or push to GitHub and run `.github/workflows/android-apk.yml` to produce downloadable APK artifacts automatically.
