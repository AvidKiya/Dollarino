# UI/UX & Apple iOS Cupertino Design System (`06-ui-ux-and-design-system`)

---

## 1. Dual-Mode Accessibility Architecture

| Dimension | **Simple Mode (Default — Ages 10 to 80)** | **Pro Mode (Toggleable Anytime)** |
|---|---|---|
| **Target User** | First-time users, beginners, seniors, mobile Telegram Mini App users | Experienced futures & quant traders |
| **Language** | Plain Persian & English (*"موجودی امن"، "بالا میره 📈"، "سپر ضرر خودکار 🛡️"*) — zero jargon | Full futures terminology (`LONG/SHORT`, `EMA 20/50/200`, `KBOS`, `ISOLATED/CROSS`, `Funding`, `R:R`) |
| **Mobile Navigation** | Kifpool-inspired curved SVG notch bottom tab bar (`خانه` · `بازار` · center Cobalt trade CTA `معامله` · `کیف پول` · `خدمات`) | Same curved bottom dock on mobile + full desktop sidebar (`Overview`, `Terminal`, `Markets`, `Radar & Lab`, `Copy & Connect`, `Portfolio`, `Services`, `Weekly Card`, `Pricing`, `FAQ`, `Admin`) |
| **Trading Flow** | 3 taps: Pick Coin → `خرید / فروش` + `۱۰٪/۲۵٪/۵۰٪/۱۰۰٪` margin chips → `ConfirmTradeSheet` (`👈 دلارینو ترید کن برام 👉` → `تایید میکنم ✅`) | Order Ticket (`Market/Limit`, `1x–50x`, `SL`, `TP1/TP2/TP3`), Chart AI copilot, Order Book, inline TP/SL editor |
| **Switch Mechanism** | One-tap Apple `.ios-segmented` pill (`معامله آسان | معامله حرفه‌ای`) in top bar, Terminal header, and Services hub | Same instant toggle; persists in `localStorage['dollarino_ui_mode']` |

---

## 2. Unified Apple iOS Day & Night Theme (`apps/web/src/index.css`)

Single cohesive Cupertino visual language with crisp Day (`paper`) and Night (`cosmic`) toggling (no fragmented multi-theme picker):

- **Apple Day Mode (`paper` — Default)**:
  - `--bg`: `#F3F6FB`, `--panel`: `#FFFFFF` (solid high-contrast Apple cards), `--text`: `#0F172A`, `--muted`: `#475569`
- **Apple Night Mode (`cosmic`)**:
  - `--bg`: `#070E20`, `--panel`: `rgba(14, 24, 51, 0.88)`, `--text`: `#F8FAFC`, `--muted`: `#CBD5E1`
- **Shared Brand & Status Tokens**:
  - Cobalt Primary: `#1652F0` / `#2563EB` (CTA buttons, Cobalt Wallet card, center floating dock button)
  - Warm Amber Active Tab: `#F59E0B` (`bg-[#F59E0B]/15` icon pill + glowing bottom bar indicator)
  - Bullish Emerald: `#10B981`, Loss Crimson: `#EF4444`
  - Dark Instrument Console (`.console-lab`): Always `#0B1636 → #050C20` so `HybridLab` maintains high contrast across Day & Night modes.
