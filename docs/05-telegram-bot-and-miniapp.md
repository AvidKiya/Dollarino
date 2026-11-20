# Telegram Bot & Mini App Integration (`05-telegram-bot-and-miniapp`)

---

## 1. Telegram Bot Flows (`apps/worker/src/telegram/{handler,formatter,client}.ts`)

- **Webhook Endpoints**:
  - Instance Bot: `POST /api/webhook/telegram` (verified against `X-Telegram-Bot-Api-Secret-Token`).
  - User Personal Bots: `POST /api/webhook/telegram/:botId` (AES-GCM decrypted token + per-bot webhook secret).
- **6-Button Main Menu (`mainMenuKeyboard`)**:
  - `اتصال به صرافی 🔗` · `تنظیمات ⚙️`
  - `حساب کاربری 👤` · `خرید اشتراک 💎`
  - `ربات و هوش مصنوعی من 🤖` · `راهنما 📚`
- **Settings Menu (`settingsKeyboard(isAdmin)`)**:
  - `اتوترید 🤖` · `دستی ترید 💪`
  - `دریافت موجودی صرافی 💳` · `تنظیم مقادیر معاملات 🪛`
  - `دریافت اعلان 🔔` · `تغییر API صرافی 📡`
  - Admin/Owner only: `پنل مدیریت 💼` · `افزودن مدیر 🔑`
- **Super Admin RBAC (`OWNER_TELEGRAM_ID = '944021185'`)**:
  - Clicking `افزودن مدیر 🔑` sets stateful `telegram_state = 'AWAIT_ADD_ADMIN'` strictly if `tgId === ownerId` (or `role === 'owner'`).
  - Entering a numeric Telegram user ID promotes (or creates & promotes) that user to `role = 'admin'` in D1. Non-owners are rejected server-side.
- **2-Step Manual Signal Execution**:
  - Channel signals (`channel_post`) and TradingView webhooks (`POST /api/webhook/tv/:secret`) dispatch inline button `callback_data = "manual_trade:<signalId>"` labeled **`👈 دلارینو ترید کن برام 👉`**.
  - Clicking it replies with a confirmation card & inline button `callback_data = "confirm_trade:<signalId>"` labeled **`تایید میکنم ✅`**, which executes `executeSignalForUser`.

---

## 2. Telegram Mini App (`apps/web/src/lib/telegram.ts` & `POST /api/auth/telegram-webapp`)

1. **SDK Initialization**: `apps/web/index.html` loads `https://telegram.org/js/telegram-web-app.js` async; `App.tsx` runs `initTelegramMiniApp()` on mount and syncs Telegram header/background colors to the user's chosen Apple look (`#040917` dark / `#F3F7FF` light).
2. **Cryptographic Verification (`verifyTelegramWebAppInitData` in `apps/worker/src/crypto.ts`)**:
   - Rejects missing/malformed `hash` (`!= 64` hex chars) and expired `auth_date` (`> 24h`).
   - Strips `hash`, sorts remaining query entries alphabetically joined by `\n`, derives `secret = HMAC-SHA256("WebAppData", TELEGRAM_BOT_TOKEN)`, and verifies `HMAC-SHA256(secret, dataCheckString) === hash` using a constant-time comparison loop.
   - Upserts user by `telegram_id`, assigns `role = 'owner'` strictly when `tgId === (env.OWNER_TELEGRAM_ID || '944021185')`, and issues an HS256 session JWT.
3. **Native Haptics**: `tgHaptic` (`light` / `medium` / `heavy`) and `tgNotifyHaptic` (`success` / `error`) fire on trade actions, mode toggles, and bot switches inside Telegram without crashing outside Telegram.
