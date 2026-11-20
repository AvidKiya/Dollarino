# Dollarino Execution & Delivery Plan

1. **Completed — Track 1 (Backend, Auth, RBAC, Migrations)**:
   - Migration `0008_spec_and_miniapp_alignment.sql` (`gift_codes`, `gift_redemptions`, `referrals`, `$20/$50/$90/$160` plans).
   - `verifyTelegramWebAppInitData` + `POST /api/auth/telegram-webapp` + referral attribution on `/register`.
   - `ensureUserDefaults`: `margin_pct = 10`, `tp1/2/3 = 50/25/25`, auto break-even + SL→TP1 enabled.
   - Telegram Bot menus (`خرید اشتراک 💎`, `افزودن مدیر 🔑` gated to `OWNER_TELEGRAM_ID = 944021185`), TradingView `MANUAL_CONFIRM` inline 2-step confirmation.
2. **Completed — Track 2 (Apple Liquid-Glass Simple & Pro Frontend + Mini App)**:
   - Logo-derived palette tokens (`#0A46E4`, `#00C2FF`, `#12E35D`, `#FF8200`) across 4 Apple themes in `index.css` & `AppearanceModal.tsx`.
   - `telegram.ts` SDK bridge + `App.tsx` Mini App auto-auth + `uiMode` (`simple` | `pro`) persistence.
   - `ConfirmTradeSheet.tsx` (`👈 دلارینو ترید کن برام 👉` → `تایید میکنم ✅`) integrated into `Layout`, `OverviewPage`, and `TerminalPage`.
   - `MarketsPage`, `SubscriptionPage` (Gift Codes + Referrals), `CopyConnectPage` (KCEX honesty disclosure), `AdminPage` (Gift Code generator), and `LandingPage` (4-plan showcase).
3. **Completed — Track 3 (Engineering & Research Documentation + Verification)**:
   - Full `docs/00..13` + `OPEN_QUESTIONS.md`, `contracts/openapi-summary.yaml`, `research/exchange-verification.md`, `planning/roadmap.md`, `implementation/README.md`.
   - Typecheck (`0` errors across all 3 workspaces), `vitest` (`10/10`), `vite build` (`1622` modules), live E2E HTTP suite (`10/10`), and WebCrypto Telegram `initData` HMAC verification.
