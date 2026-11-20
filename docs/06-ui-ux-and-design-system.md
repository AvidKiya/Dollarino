# UI/UX & Apple Cupertino Liquid-Glass Design System (`06-ui-ux-and-design-system`)

---

## 1. Dual-Mode Accessibility Architecture

| Dimension | **Simple Mode (Default — Ages 10 to 80)** | **Pro Mode (Toggleable Anytime)** |
|---|---|---|
| **Target User** | First-time users, beginners, seniors, mobile Telegram Mini App users | Experienced futures & quant traders |
| **Language** | Plain Persian & English (*"موجودی امن"، "بالا میره 📈"، "سپر ضرر خودکار 🛡️"*) — zero jargon | Full futures terminology (`LONG/SHORT`, `EMA 20/50/200`, `KBOS`, `ISOLATED/CROSS`, `Funding`, `R:R`) |
| **Navigation** | Clean 4-item iPhone dock (`خانه` / `بازار` / `معامله` / `تنظیمات`) | Full multi-module desk (`Overview`, `Terminal`, `Markets`, `Radar & Backtest`, `Copy & APIs`, `Portfolio`, `Weekly Card`, `Pricing`, `FAQ`, `Admin`) |
| **Trading Flow** | 3 taps: Pick Coin (BTC/ETH/SOL/BNB) → Pick Direction + Risk Comfort (`امن` / `متعادل` / `سریع`) → `ConfirmTradeSheet` (`تایید میکنم ✅`) | Order Ticket (`Market/Limit`, `1x–50x`, `SL`, `TP1/TP2/TP3`), Chart AI copilot, Order Book, inline TP/SL editor |
| **Switch Mechanism** | One-tap Apple `.ios-segmented` pill in top bar, bottom banner, and Terminal header | Same instant toggle; persists in `localStorage['dollarino_ui_mode']` |

---

## 2. Logo-Derived Color Tokens (`apps/web/src/index.css`)

Extracted directly from `/apps/web/public/logo.png`:

- **Cosmic Cobalt (Default Dark)**:
  - `--bg`: `#040917`, `--panel`: `rgba(11, 22, 50, 0.80)`, `--cobalt`: `#0A46E4`, `--cyan`: `#00C2FF`, `--jade`: `#12E35D`, `--amber`: `#FF8200`
- **iOS Daylight Frost (`paper`)**:
  - `--bg`: `#F3F7FF`, `--panel`: `rgba(255, 255, 255, 0.88)`, `--text`: `#08142E` (activates `.theme-light` observer for `Lightweight-Charts`)
- **Midnight Sapphire (`midnight`)** & **Obsidian Gold (`obsidian`)**:
  - Preserved user-selectable themes in `AppearanceModal.tsx`, unified under Apple Cupertino glass geometry (`backdrop-filter: blur(22px) saturate(165%)`, `1px` specular inner edge, rounded `26px–32px` cards, tabular numeric monospace `.font-num`).

---

## 3. Preserved Brand Integrity

- `DollarinoBrandMark` renders `/logo.png` directly inside rounded cobalt containers without substituting generic icons.
- `CandlestickChart.tsx` keeps full compatibility with `.theme-light` mutation observers across all four visual looks.
