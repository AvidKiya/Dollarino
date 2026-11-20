# Verified Exchange Capabilities Matrix (`02-exchange-specs`)

> **Engineering Rule**: No endpoint, order flag, or fee schedule may be fabricated. Every capability below is classified strictly as `VERIFIED`, `CONDITIONAL`, or `UNSUPPORTED` based on official exchange documentation and code inspection.

---

## 1. Capability Summary Table

| Exchange | Automated Bot REST Trading | Fee Model (Futures) | Symbol Format | Status | Notes |
|---|---|---|---|---|---|
| **Paper Demo** | Simulated live quotes + D1 ledger | `0.04%` simulated fee | `BTCUSDT` | `VERIFIED` | Always available, `$10,000` free virtual balance, top-up & reset |
| **Toobit Futures** | Signed USDT-M Perpetual REST & WS | Maker/Taker exchange-side | `BTC-SWAP-USDT` | `VERIFIED` (`CONDITIONAL` on CF Proxy) | Requires `apps/relay` when Cloudflare edge IPs encounter geo-403 |
| **KCEX Futures** | Public Bot API Keys **NOT offered** | `0%` Maker / `0.01%` Taker (Web/App) | `BTC_USDT` | `UNSUPPORTED` for live API keys | Supported via **Signal-Mirror Mode** (`0.01%` taker simulation + 1-tap KCEX deep-link) |
| **Bitunix** | Legacy adapter file present (`bitunix.ts`) | N/A | `BTCUSDT` | `LEGACY / NON-PRIMARY` | Not surfaced in active V6 onboarding; retained only for compatibility |

---

## 2. Toobit USDT-M Futures Specification (`apps/worker/src/exchanges/toobit.ts`)

Verified against official Toobit OpenAPI documentation (`https://api-docs.toobit.com/api/basic-information.html` and `https://api-docs.toobit.com/api/code-examples.html`):

- **Base REST URL**: `https://api.toobit.com`
- **WebSocket Market / Private Stream**: `wss://stream.toobit.com/api/v1/ws/<listenKey>`
- **Auth Header**: `X-BB-APIKEY: <apiKey>`
- **Signature Algorithm**: Lowercase hex `HMAC-SHA256(apiSecret, queryString)` for `application/x-www-form-urlencoded` v1 requests, with `timestamp` (UTC ms) and `recvWindow=5000`.
- **Verified Endpoints Implemented**:
  - `GET /api/v1/futures/balance` — Wallet balance (`free`, `used`, `total`)
  - `GET /api/v1/futures/positions` — Open perpetual positions
  - `GET /api/v1/futures/openOrders` / `historyOrders` — Order books & fills
  - `POST /api/v1/futures/leverage` — Set position leverage
  - `POST /api/v1/futures/order` — Open/close orders (`BUY_OPEN`, `SELL_OPEN`, `SELL_CLOSE`, `BUY_CLOSE`; market orders require `type='LIMIT'` + `priceType='MARKET'`)
  - `DELETE /api/v1/futures/order` — Cancel pending order
- **Cloudflare Geo-403 Mitigation (`apps/worker/src/exchanges/proxy.ts` + `apps/relay`)**:
  - Direct Cloudflare Workers egress IPs (`2a06:98c0:3600::103`) can be blocked by upstream WAF rules (`HTTP 403`).
  - `apps/relay` forwards signed requests cleanly via `TOOBIT_PROXY_URL` + shared `X-Dollarino-Proxy-Secret` header without storing API keys on the relay.

---

## 3. KCEX Futures Specification (`apps/worker/src/exchanges/kcex.ts`)

Verified against official KCEX documentation (`https://blog.kcex.com/kcex-guide/lowest-futures-fees-2026-api-web-funding-basis-cost/`):

- **Official Fee Structure**: `0%` Maker / `0.01%` Taker on Futures web and mobile app trading.
- **Public Bot Trading API**: **`UNSUPPORTED`** — KCEX explicitly states it does not currently offer public REST API keys for automated third-party trading bots.
- **Dollarino Implementation (`Signal-Mirror Mode`)**:
  - Zero fabricated signing endpoints.
  - Simulates positions transparently in D1 using live market quotes and KCEX's `0.01%` taker fee math.
  - Surfaces a **1-Tap KCEX Deep-Link** (`https://www.kcex.com/futures/exchange/PAIR_USDT`) and clear UI disclosure inside `CopyConnectPage.tsx` so traders never confuse Signal-Mirror execution with live API placement.
