# Dollarino Project Status

- **Version:** 6.1.0 (Apple iOS Day/Night + Kifpool Curved Dock + Centralized Worker/D1 Architecture)
- **Date:** 2026-11-19
- **Status:** Production-ready codebase verified against Cloudflare Workers, D1, Durable Objects, Telegram Bot Webhook/Mini App, and Cloudflare Pages SPA.

## Verified Components
1. **Shared Core (`@dollarino/core`)**: Strict BigDecimal/integer-scale position sizing, TP1 (`50%`) / TP2 (`25%`) / TP3 (`25%`) calculations, breakeven & trailing stop rules, Persian/English signal parser/formatter, 10/10 Vitest unit suite passing.
2. **Backend (`@dollarino/worker`)**: Hono REST + SSE (`/api/events/stream`) API on Cloudflare Workers + D1 (`0001`–`0009` migrations) + Durable Object (`TradingBotCoordinator`) 1-minute watchdog.
   - Toobit USDT-M Futures authenticated REST integration (relay-ready via `TOOBIT_PROXY_URL`).
   - KCEX Signal-Mirror mode (`0%` maker tracking without fabricated REST trade endpoints).
   - Official Telegram channel guard (`-1002263982097` / `@Dollarino_official`, non-forwarded posts only) + duplicate signal idempotency + 2-step manual confirmation (`👈 دلارینو ترید کن برام 👉` → `تایید میکنم✅`).
   - Persistent `notifications` table + unread counter + Super Admin (`OWNER_TELEGRAM_ID = 944021185`) exclusive admin RBAC.
3. **Frontend (`@dollarino/web`)**: Single cohesive Apple iOS Cupertino Day/Night theme (`paper` Day / `cosmic` Night), Simple Mode (`۱۰–۸۰` years) + Pro Chart AI Mode (`معامله آسان | معامله حرفه‌ای`), Kifpool-inspired curved SVG notch bottom tab bar (`خانه`, `بازار`, center floating Cobalt button, `کیف پول`, `خدمات`), live Bell notifications drawer, and high-contrast `HybridLab` dark console.
