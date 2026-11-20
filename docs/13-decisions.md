# Architecture Decision Records (`13-decisions`)

---

## ADR-001: Single Centralized Cloudflare Worker + D1 + Durable Objects
- **Decision**: Serve Website, Telegram Bot, and Telegram Mini App from one unified Hono Worker (`apps/worker`), one D1 database, and `TradingBotCoordinator` Durable Object alarms.
- **Rationale**: Eliminates state drift between web orders, Telegram commands, and background 3-TP/trailing reconciliations while minimizing cold-start latency globally.

## ADR-002: Default Simple Mode with Bidirectional Pro Mode Toggle
- **Decision**: Default new users and Mini App sessions to **Simple Mode** (`uiMode = 'simple'`) while offering an instant `.ios-segmented` toggle into **Pro Mode** (`uiMode = 'pro'`).
- **Rationale**: Guarantees immediate clarity for beginners and elders (aged 10–80) without sacrificing any quantitative controls (`Terminal`, `Chart AI`, `KBOS v11`, `HybridLab`, `Risk Studio`) for experienced traders.

## ADR-003: Mandatory 2-Step Manual Trade Confirmation
- **Decision**: Gate all manual trades on **`👈 دلارینو ترید کن برام 👉`** → **`تایید میکنم ✅`** across both `ConfirmTradeSheet.tsx` and Telegram inline callbacks (`manual_trade` → `confirm_trade`).
- **Rationale**: Prevents accidental market orders on touchscreens while displaying Stop-Loss and Take-Profit risk clearly before capital commits.

## ADR-004: Honest KCEX Signal-Mirror vs Toobit Live REST
- **Decision**: Support Toobit USDT-M Futures via signed REST + `apps/relay` (`VERIFIED`), and run KCEX strictly as **Signal-Mirror (`0.01%` taker + deep-links)** (`UNSUPPORTED` for third-party API keys per Oct 2026 KCEX documentation).
- **Rationale**: Strictly forbids hallucinated or reverse-engineered unofficial private endpoints that violate platform reliability and engineering honesty.

## ADR-005: Apple Cupertino Liquid-Glass Derived from `/logo.png`
- **Decision**: Anchor all four selectable visual themes (`cosmic`, `paper`, `midnight`, `obsidian`) to the brand mark's Cobalt (`#0A46E4`), Cyan (`#00C2FF`), Emerald (`#12E35D`), and Amber (`#FF8200`) tokens using frosted glass surfaces while preserving `.theme-light` observer compatibility for `CandlestickChart.tsx`.

## ADR-006: Telegram WebApp `WebAppData` Cryptographic Auth + Owner ID `944021185`
- **Decision**: Verify Mini App `initData` via constant-time `HMAC-SHA256("WebAppData", botToken)` and enforce `OWNER_TELEGRAM_ID = '944021185'` server-side for Super Admin controls (`افزودن مدیر 🔑`, gift code generation, payment approval).

## ADR-007: Master Spec Financial & Risk Defaults
- **Decision**: Standardize new user risk defaults to `margin_pct = 10`, `tp1/2/3_close_pct = 50/25/25`, `auto_breakeven_on_tp1 = 1`, `move_sl_to_tp1_on_tp2 = 1`, and paid subscription plans to `$20` (1M), `$50` (3M), `$90` (6M), `$160` (1Y).
