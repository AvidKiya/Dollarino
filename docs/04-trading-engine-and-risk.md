# Trading Engine, Strategies & Risk Guard (`04-trading-engine-and-risk`)

> Deterministic math lives in `packages/core` so backtesting, live scanning, and order sizing evaluate identical logic with zero drift.

---

## 1. Strategy Roster (`packages/core/src/strategies.ts` & `kiya-bot.ts`)

1. **`dollarino_v01` (Dorna V1 / Dollarino Select — Default)**
   - Non-repaint price-action + trend confirmation across entry and higher timeframes.
   - Supports multi-coin scanning (`ALL_MARKET`, `TOP_COINS`, `WATCHLIST`, `SINGLE`) inside `TradingBotCoordinator`.
2. **`kbos_v11` (KBOS Liquidity Sweep & Breakout v11)**
   - Built atop `ALMA` ribbons, `SuperSmoother`, `DEMA ATR`, and liquidity-sweep displacement triggers with configurable `KbosParams` (`mergeKbosParams`).
3. **`sp2l` (SP2L Trend Momentum)**
   - Disciplined pullbacks aligned with multi-EMAs and volatility-scaled Stop-Loss / 3-TP placement.
4. **Hybrid Mixer (`DEFAULT_MIXER_WEIGHTS` & `evaluateSignalMixerAtBar`)**
   - Combines independent strategy votes (`Dorna V1`, `KBOS`, `SP2L`, `Multi-AI`) into a single weighted confidence score (`0–100`) gated against `mixer_threshold`.
5. **Central Multi-AI Brain (`Dorrbin` — `apps/worker/src/ai/providers.ts`)**
   - Supports up to 3 concurrent central engines (`DeepSeek`, `Anthropic Claude`, `OpenAI GPT`, `Google Gemini`, `OpenAI-Compatible`) configured by Super Admin; individual users need zero personal LLM API keys.

---

## 2. Deterministic Risk Gates (`packages/core/src/risk-engine.ts` & `executor.ts`)

Every signal or manual order passes these mandatory rules before touching Paper or Toobit:

| Guard | Default | Behavior |
|---|---|---|
| **Mandatory Stop-Loss** | Always Required | Orders lacking a valid `stopLoss` on the correct side of entry are rejected immediately |
| **Position Sizing** | `10%` of free margin | `marginUsed = freeBalance * (margin_pct / 100)` quantized down to `InstrumentSpec` precision |
| **Max Leverage** | `10×` (cap `50×`) | Caps `signal.leverage` at `min(config.max_leverage, market.maxLeverage)` |
| **Max Open Positions** | `6` concurrent | Blocks new opens when active positions reach `max_open_positions` |
| **Daily Max Loss** | `5%` | Suspends new autonomous opens if realized + unrealized daily drawdown exceeds limit |
| **3-Stage Take Profit** | `50% / 25% / 25%` | Closes 50% at TP1, 25% at TP2, remaining 25% at TP3 |
| **Auto Break-Even (TP1)** | Enabled (`1`) | Tightens Stop-Loss to entry price immediately upon TP1 fill |
| **Trail to TP1 (TP2)** | Enabled (`1`) | Tightens Stop-Loss to TP1 upon TP2 fill; optional percentage trailing thereafter |
| **Weekend / Macro Filter** | Configurable | Can block new trades on weekends or CPI/FOMC windows |

---

## 3. Mandatory 2-Step Manual Trade Confirmation

Both **Website / Mini App** (`ConfirmTradeSheet.tsx`) and **Telegram Bot** (`handler.ts`) enforce explicit confirmation on manual trades:

1. Step 1: User taps **`👈 دلارینو ترید کن برام 👉`** (or submits Order Ticket / taps manual signal button).
2. Step 2: Review Sheet displays plain-language Coin, Direction (`📈 LONG` / `📉 SHORT`), Risk Margin, Leverage, Stop-Loss (`🛡️`), and Take-Profit (`🎯`) with explicit button **`تایید میکنم ✅`**.
3. Only clicking **`تایید میکنم ✅`** dispatches `POST /api/trading/orders/manual` (or `confirm_trade:<signalId>` in Telegram).
