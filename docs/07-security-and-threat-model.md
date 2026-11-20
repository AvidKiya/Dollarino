# Security Architecture & STRIDE Threat Model (`07-security-and-threat-model`)

---

## 1. Cryptographic Controls (`apps/worker/src/crypto.ts`)

| Asset / Flow | Mechanism | Implementation Notes |
|---|---|---|
| **User Passwords** | `PBKDF2-HMAC-SHA256` (`100,000` iterations, 16-byte random salt) | Constant-time string comparison in `verifyPassword` |
| **Session Auth** | `HS256` JWT (7-day expiry) via `SESSION_JWT_SECRET` | Cookie (`HttpOnly`, `SameSite=None; Secure` on HTTPS) + `Authorization: Bearer` header |
| **Exchange API Keys & Bot Tokens** | `AES-256-GCM` (`MASTER_ENCRYPTION_KEY`) with random 12-byte IV | Stored encrypted in D1; only masked prefixes (`abcd••••wxyz`) ever return to client |
| **Telegram Mini App Auth** | `WebAppData` nested `HMAC-SHA256` (`verifyTelegramWebAppInitData`) | Alphabetical parameter sorting, `auth_date` 24h freshness enforcement, constant-time hex comparison |
| **Exchange Signing** | Lowercase hex `HMAC-SHA256` (`toobit.ts`) | Signed server-side inside `apps/worker` only |

---

## 2. STRIDE Threat Matrix & Mitigations

| Threat Category | Concrete Threat | Mitigation Implemented & Verified |
|---|---|---|
| **S — Spoofing** | Forged Telegram Mini App `initData` claiming Super Admin ID `944021185` | `verifyTelegramWebAppInitData` validates Telegram Bot HMAC signature + `auth_date` TTL; forged hashes rejected `HTTP 401` |
| **T — Tampering** | Modifying TP/SL, gift code redemption limits, or TradingView webhook payload | `evaluateRiskGates` enforces valid SL bounds; `gift_redemptions` enforces `UNIQUE(code, user_id)`; TradingView webhooks scoped by unguessable `webhook_secret` |
| **R — Repudiation** | Disputing manual vs bot execution or admin role grants | Immutable `audit_logs` table records `SIGNAL`, `ORDER`, `RISK`, `SYSTEM`, `ADMIN` actions with UTC timestamps |
| **I — Information Disclosure** | Exposing plaintext exchange secrets, LLM keys, or user tokens | `AES-256-GCM` vault; admin queries mask keys; no secrets returned in `/api/trading/dashboard`, `/api/admin/*`, or client JS |
| **D — Denial of Service** | Heavy Multi-AI calls or rapid bot scan loops exhausting budgets | Shared `cache_ttl_sec` (`platform_ai_settings`), `daily_call_cap` per AI engine, bounded 32-pair market universe cache (`5 min`) |
| **E — Elevation of Privilege** | Standard user invoking `/api/admin/*`, `/api/subscriptions/admin/*`, or `افزودن مدیر 🔑` | Server-side `isAdmin` / `isOwner` middleware checks `role IN ('owner','admin')` & `OWNER_TELEGRAM_ID`; E2E verified non-admin receives `HTTP 403` |

---

## 3. Operational Security Rules

1. **No-Withdrawal Policy**: UI & docs mandate futures trade-only API keys (`Withdraw = OFF`). No withdrawal code exists anywhere in the repository.
2. **Production Secret Replacement**: Before production deploy, set non-default `SESSION_JWT_SECRET`, 32+ char `MASTER_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` via `wrangler secret put`.
3. **Relay Isolation**: `apps/relay` forwards requests with `X-Dollarino-Proxy-Secret` only to allowlisted exchange hosts (`api.toobit.com`) and never stores secrets on disk.
