# Dollarino Platform Overview (`00-overview`)

> **Version**: `6.0.0` · **Architecture**: Unified Cloudflare Workers + D1 + Durable Objects + React 18 PWA + Telegram Bot & Mini App
> **Core Mission**: Make algorithmic and manual cryptocurrency futures trading effortlessly understandable for anyone aged **10 to 80** in **Simple Mode**, while giving seasoned traders a full institutional **Pro Mode** toggle — powered by a single centralized backend and trading engine.

---

## 1. Platform Pillars

1. **Single Source of Truth (`apps/worker`)**
   - Every surface — **Website**, **Telegram Bot**, and **Telegram Mini App** — authenticates against and executes through the same centralized Cloudflare Worker + D1 SQLite + `TradingBotCoordinator` Durable Object engine.
   - Positions, TP/SL rules, Paper/Live balances, subscription entitlements, referral links, gift codes, and audit trails stay synchronized in real time across all three clients.

2. **Two Modes, One Seamless Switch (`Simple Mode` ↔ `Pro Mode`)**
   - **Simple Mode (Default)**: Apple iOS Cupertino liquid-glass aesthetic, zero technical jargon, friendly emoji-guided copy in Persian & English, a unified cobalt Wallet Card, a 3-tap Guided Trade flow (**Pick Coin → Pick Direction + Risk Comfort → `👈 دلارینو ترید کن برام 👉` → `تایید میکنم ✅`**), and one-tap **Collect Profit / Close**.
   - **Pro Mode (Toggle)**: Unlocks the 3-column Futures Terminal, Lightweight Candlestick Charts (`EMA 20/50/200` + `KBOS v11` overlays), Persistent **Chart AI** Copilot, 6-Strategy Quantitative Engine (`Dorna V1`, `KBOS v11`, `SP2L`, `Hybrid Lab`), 900-Candle Backtester, Live Market Radar, TradingView Webhook Mirror, Risk Studio, and Exchange API Vault.

3. **Logo-Derived Visual Identity (`/logo.png`)**
   - Every visual surface, button, status badge, and Apple-glass card derives from the official **Hexagonal Astronaut & Green Candles** brand mark:
     - **Primary Cobalt**: `#03258C` → `#0A46E4` → `#1565FF`
     - **Electric Cyan Rim**: `#00B2FF` → `#4AD8FF`
     - **Bullish Emerald**: `#0FD94D` → `#12E35D`
     - **Rocket Thruster Amber**: `#FF7A00` → `#FFC233`
     - **Deep Space Base**: `#040917` (Dark) / `#F3F7FF` (iOS Daylight Frost)

4. **Safe-by-Design Risk & Execution Discipline**
   - Default risk profile: **`10%` position margin**, **`50% / 25% / 25%`** 3-stage Take-Profit split, **`auto_breakeven_on_tp1 = 1`**, **`move_sl_to_tp1_on_tp2 = 1`**, mandatory Stop-Loss on every order, and explicit **2-step manual confirmation** before placing any manual trade.
   - Zero withdrawal permissions accepted or used; all exchange and Telegram credentials are encrypted at rest with **AES-256-GCM**.

---

## 2. Repository Layout

| Path | Role |
|---|---|
| `packages/core` | Deterministic math, indicators (`ALMA`, `DEMA ATR`, `SuperSmoother`, `KBOS v11`), strategy engines, signal parser/formatter, risk engine, backtester, and Vitest suite |
| `apps/worker` | Hono API router, auth (Email/JWT + Telegram Mini App `initData` HMAC), D1 repositories, Durable Object `TradingBotCoordinator`, Toobit & KCEX adapters, Telegram Bot webhook, Multi-AI consensus |
| `apps/web` | React 18 + TypeScript + Tailwind + Lightweight-Charts PWA & Telegram Mini App frontend (`Simple Mode` + `Pro Mode`) |
| `apps/relay` | Lightweight Node/Vercel/Docker outbound forwarder (`TOOBIT_PROXY_URL`) mitigating Cloudflare Workers IP blocks against Toobit endpoints |
| `migrations/` | Versioned D1 SQL migrations `0001_init.sql` → `0008_spec_and_miniapp_alignment.sql` |
| `docs/`, `contracts/`, `research/`, `planning/`, `implementation/` | Engineering specs, architecture diagrams, verified exchange research, STRIDE threat model, OpenAPI summary, ADRs, and deployment runbooks |
