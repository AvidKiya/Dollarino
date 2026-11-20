# Dollarino Design System (Apple iOS Cupertino + Kifpool Ergonomics)

## 1. Single Cohesive Theme — Day & Night Only
- **Day Mode (`paper` — default)**: `#F3F6FB` canvas, solid `#FFFFFF` Apple cards (`border: rgba(15, 23, 42, 0.08)`), `#0F172A` primary ink, `#475569` secondary ink.
- **Night Mode (`cosmic`)**: `#070E20` deep Cupertino navy, `#0E1833` frosted glass cards, `#F8FAFC` crisp white ink.
- **Brand Accents**:
  - Primary Cobalt: `#1652F0` → `#2563EB` (buttons, Wallet Hero card, floating center bottom dock CTA)
  - Active Tab Amber: `#F59E0B` (`bg-[#F59E0B]/15` icon pill + glowing bottom bar indicator)
  - Bullish Signal Emerald: `#10B981`
  - Loss / Stop-Loss Crimson: `#EF4444`
- **Dark Instrument Console (`.console-lab`)**: Deep navy `#0B1636 → #050C20` guaranteed across both Day and Night modes so `HybridLab` maintains high text contrast.

## 2. Mobile & Mini App Ergonomics
- **Curved SVG Notch Bottom Navigation**: 4 surrounding tabs (`خانه`, `بازار`, `کیف پول`, `خدمات`) + 1 elevated circular Cobalt trade button (`معامله`) centered in a smooth concave valley.
- **Simple Mode (`۱۰–۸۰` years)** vs **Pro Mode**: Segmented toggle (`معامله آسان | معامله حرفه‌ای`) at top of Trade & Services; Simple Mode uses 1-tap `۱۰٪ / ۲۵٪ / ۵۰٪ / ۱۰۰٪` margin chips and mandatory `👈 دلارینو ترید کن برام 👉` → `تایید میکنم✅` safety confirmation.
