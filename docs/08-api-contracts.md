# API & Webhook Contracts (`08-api-contracts`)

> Base URL: `/api/*` (proxied cleanly via Cloudflare Pages Function `functions/api/[[path]].ts` in production and Vite dev proxy locally). Formal summary: `/contracts/openapi-summary.yaml`.

---

## 1. Authentication & Session Routes (`/api/auth/*`)

| Method & Path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | Public | Register with `email`, `username`, `password`, optional `referralCode` -> `201 { token, user }` |
| `POST /api/auth/login` | Public | Password verification via PBKDF2 -> `{ token, user }` |
| `POST /api/auth/quick-demo` | Public | Instant `$10,000` Paper Demo account provisioning |
| `POST /api/auth/telegram-webapp` | Public (`initData` HMAC) | Verifies Telegram WebApp `initData`, enforces Super Admin `944021185` -> `{ token, user }` |
| `POST /api/auth/guest-upgrade` | Bearer/Cookie | Upgrades Quick-Demo user to permanent email/password account |
| `GET /api/auth/me` | Bearer/Cookie | Current user profile & entitlement metadata |
| `PATCH /api/auth/profile` & `/password` | Bearer/Cookie | Update display name or rotate password |

---

## 2. Trading, Markets, Scanner & AI (`/api/trading/*` & `/api/chart-ai/*`)

| Method & Path | Auth | Purpose |
|---|---|---|
| `GET /api/trading/dashboard` | User | Unified state: `config`, `balance`, `openTrades`, `closedTrades`, `pendingOrders`, `recentSignals`, `auditLogs`, `activeExchange`, `entitlement` |
| `GET /api/trading/markets` | User | Live perpetual universe with lastPrice, 24h change, leverage caps |
| `GET /api/trading/market/overview` | User | Symbol candles, EMA 20/50/200, KBOS overlays, order book, funding |
| `PATCH / PUT /api/trading/config` | User | Update strategy (`dollarino_v01`, `kbos_v11`, `sp2l`), `margin_pct`, `max_leverage`, `tp1/2/3_close_pct`, trailing/BE toggles, `kbosParams`, `mixerWeights` |
| `POST /api/trading/orders/manual` | User | Execute MARKET or LIMIT order with mandatory `stopLoss` and `tp1..tp3` |
| `POST /api/trading/positions/:id/close` | User | Market-close open trade and credit realized PnL |
| `PATCH /api/trading/positions/:id/tpsl` | User | Update active `stopLoss`, `tp1`, `tp2`, `tp3` |
| `DELETE /api/trading/pending/:id` | User | Cancel queued limit order |
| `POST /api/trading/bot/start` & `/stop` | User | Start autonomous scanning (`SINGLE`/`TOP_COINS`/`ALL_MARKET`) or pause/settle |
| `POST /api/trading/bot/kill-switch` | User | Immediate halt + close all open positions |
| `POST /api/trading/scanner/run` | User | Run on-demand live signal scan across selected coin universe |
| `POST /api/trading/backtest` | User | 900-candle historical strategy + hybrid mixer simulation |
| `POST /api/trading/wallet/topup` & `/reset` | User | Paper wallet credit top-up or `$10,000` clean reset |
| `GET/POST /api/chart-ai/*` | User (Pro/VIP) | Persistent Chart AI conversation & entry/SL/TP extraction |

---

## 3. Connections, Subscriptions, Referrals & Admin

| Method & Path | Auth | Purpose |
|---|---|---|
| `GET/POST/DELETE /api/connections/exchanges*` | User | Encrypted exchange vault (`paper`, `toobit`, `kcex` Signal-Mirror), proxy relay config, connection test |
| `GET/POST/DELETE /api/connections/telegram*` | User | Link personal Telegram account or custom bot token |
| `GET /api/subscriptions/me` | User | Entitlement status, 5 plans (`$0/$20/$50/$90/$160`), order history, payment wallet config |
| `POST /api/subscriptions/checkout` | User | Submit `USDT_TRC20` TXID or `CARD_TO_CARD` tracking reference |
| `GET /api/subscriptions/referrals` | User | Referral code (`DLR-XXXXXX`), count, bonus days, invitee list |
| `POST /api/subscriptions/redeem-gift` | User | Single-use gift code activation |
| `POST /api/subscriptions/admin/gift-codes` | Admin/Owner | Create multi-use or single-use gift codes (`403` for non-admin) |
| `POST /api/subscriptions/admin/orders/:id/review` & `/grant` | Admin/Owner | Approve/reject payment receipts or manually grant license |
| `GET/POST/PATCH/DELETE /api/admin/*` | Admin/Owner | Platform Multi-AI engines (`1..3`), user block/role management, Telegram broadcasts |
| `POST /api/webhook/tv/:secret` & `/api/webhook/telegram` | Secret Token | TradingView alerts (`AUTO` / `MANUAL_CONFIRM` inline card) & Telegram updates |
