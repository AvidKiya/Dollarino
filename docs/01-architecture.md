# System Architecture (`01-architecture`)

> All user interfaces — Website PWA, Telegram Bot, and Telegram Mini App — share a single stateless Hono API layer backed by Cloudflare D1 and stateful Durable Object alarms (`TradingBotCoordinator`).

---

## 1. High-Level Topology

```mermaid
flowchart TB
    subgraph Clients["Client Surfaces"]
        WEB["Website PWA (React 18 + Vite)"]
        TMA["Telegram Mini App (WebApp SDK + HMAC initData)"]
        BOT["Telegram Bot (@DollarinoBot Webhook)"]
    end

    subgraph Edge["Cloudflare Edge (apps/worker)"]
        API["Hono API Gateway (/api/*)"]
        AUTH["Auth & RBAC (PBKDF2, HS256 JWT, WebAppData HMAC, Owner 944021185)"]
        EXEC["Order & Risk Engine (executor.ts + @dollarino/core)"]
        AI["Central Multi-AI Consensus (DeepSeek / Claude / GPT / Gemini)"]
        DO["Durable Object: TradingBotCoordinator (15s Alarms)"]
        D1[("Cloudflare D1 SQLite (0001..0008)")]
    end

    subgraph External["External Services"]
        RELAY["Toobit Egress Relay (apps/relay on Vercel / VPS)"]
        TOOBIT["Toobit USDT-M Futures API (api.toobit.com)"]
        KCEX["KCEX Web Deep-Links (Signal-Mirror Only)"]
        TGAPI["Telegram Bot API (api.telegram.org)"]
        TV["TradingView Alert Webhooks"]
    end

    WEB -->|Bearer JWT / Cookie| API
    TMA -->|POST /api/auth/telegram-webapp| AUTH
    TMA -->|Bearer JWT| API
    BOT -->|POST /api/webhook/telegram| API
    TV -->|POST /api/webhook/tv/:secret| API

    API --> AUTH
    API --> EXEC
    API --> AI
    API --> D1
    API <--> DO
    DO --> EXEC
    DO --> D1

    EXEC -->|Signed REST via Proxy| RELAY --> TOOBIT
    EXEC -->|0.01% Taker Sim + Deep-Link| KCEX
    API -->|Inline Cards & Alerts| TGAPI
```

---

## 2. Telegram Mini App + 2-Step Manual Trade Sequence

```mermaid
sequenceDiagram
    actor User as User (10-80 yrs)
    participant TMA as Telegram Mini App
    participant API as Worker (/api/auth & /api/trading)
    participant D1 as Cloudflare D1
    participant Ex as Paper / Toobit Adapter

    User->>TMA: Opens Mini App from Telegram Bot
    TMA->>TMA: initTelegramMiniApp() reads window.Telegram.WebApp.initData
    TMA->>API: POST /api/auth/telegram-webapp { initData }
    API->>API: verifyTelegramWebAppInitData (WebAppData HMAC-SHA256 + auth_date check)
    API->>D1: Upsert user by telegram_id (Super Admin 944021185 => role='owner')
    API-->>TMA: { token (JWT), user }

    User->>TMA: Taps Coin -> Direction -> "👈 دلارینو ترید کن برام 👉"
    TMA-->>User: Opens ConfirmTradeSheet (Plain-language SL/TP/Risk summary)
    User->>TMA: Taps "تایید میکنم ✅"
    TMA->>API: POST /api/trading/orders/manual (with SL & TP1)
    API->>Ex: Place order (Paper ledger or signed Toobit POST /api/v1/futures/order)
    API->>D1: Persist open trade + audit log
    API-->>TMA: { ok: true, tradeId }
```

---

## 3. Core Architectural Invariants

1. **Zero Client-Side Secret Exposure**: Exchange API secrets, Telegram bot tokens, and platform AI keys never leave `apps/worker` after encryption into D1 (`MASTER_ENCRYPTION_KEY` + AES-256-GCM).
2. **Idempotent Bot Alarms**: `TradingBotCoordinator` runs every `15s` whenever at least one user has `bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')` or an active `'OPEN'` trade in D1, reconciling 3-TP partial exits, break-even shifts, and dynamic trailing stops even when browser tabs are closed.
3. **Frontend Parity & Mode Persistence**: `uiMode` (`'simple' | 'pro'`) defaults to `'simple'` and persists in `localStorage['dollarino_ui_mode']`, allowing instant bidirectional switching without losing session state, open positions, or active chart symbols.
