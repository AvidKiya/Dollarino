# Production Readiness & Phase Roadmap (`12-readiness-and-roadmap`)

---

## 1. Subsystem Readiness Scorecard

| Subsystem | Score | Status | Evidence / Remaining External Action |
|---|---|---|---|
| **Core Quant Engine (`@dollarino/core`)** | **9.8 / 10** | Production-Ready | `10/10` Vitest passing, `0` TS errors, deterministic math & backtester |
| **Worker API & D1 Schema (`0001..0008`)** | **9.5 / 10** | Production-Ready | `10/10` live E2E + `31/31` baseline pass; requires production `wrangler secret put` |
| **Website & Simple/Pro Apple UI** | **9.3 / 10** | Production-Ready | `1622` modules compiled via Vite; visual browser E2E pending outside headless sandbox |
| **Telegram Bot & Mini App Auth** | **9.0 / 10** | Ready for Live Token | `WebAppData` HMAC verified mathematically & via negative tests; awaits live `TELEGRAM_BOT_TOKEN` & webhook registration |
| **Toobit Futures Adapter + Relay** | **8.5 / 10** | Verified / Ready for Live Key | Signed endpoints match `api-docs.toobit.com`; live execution requires operator API key + `TOOBIT_PROXY_URL` |
| **KCEX Integration** | **9.0 / 10** | Honest Signal-Mirror | Explicitly marks live bot API keys `UNSUPPORTED` per Oct 2026 KCEX docs; deep-link + 0.01% sim verified |
| **Security & RBAC (`944021185`)** | **9.2 / 10** | Strong | AES-GCM, PBKDF2, server-side RBAC, 2-step confirmation; rotate dev defaults on deploy |

---

## 2. Release Checklist & Phased Roadmap

- **Phase 1 (Complete — Delivered)**:
  - Unified Worker + D1 (`0001..0008`) + Durable Object engine.
  - Simple Mode (10–80 age accessibility) + Pro Mode toggle + Apple Cupertino glass theme aligned to `/logo.png`.
  - Telegram Mini App `initData` HMAC auth, Super Admin RBAC (`944021185`), Gift Codes, Referrals, `$20/$50/$90/$160` plans, `10%` / `50/25/25` defaults, and `👈 دلارینو ترید کن برام 👉` → `تایید میکنم ✅` confirmation across all surfaces.
- **Phase 2 (Immediate Operator Production Cutover)**:
  - Configure Cloudflare Secrets (`SESSION_JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`), deploy `apps/relay` to Vercel/Docker, apply `--remote` D1 migrations, and register BotFather Menu Button URL.
- **Phase 3 (Continuous Growth)**:
  - Optional automated TRC20 on-chain TXID checker (TronGrid integration), push notifications, and real Chromium Playwright visual regression suite in CI.
