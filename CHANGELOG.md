# Changelog

## [7.0.0] - 2026-11-20
### Added
- `migrations/0011_custom_strategies.sql`: Added `user_strategies` table (`pine`, `python`, `visual` strategies) and `bot_configs.active_custom_strategy_id` for 24/7 autonomous custom code execution.
- **Simple Mode Guided 4-Step Launcher (TimeTrade Parity)**: Embedded full 4-step launcher (`تنظیم ربات معاملاتی` | `اتصال صرافی واقعی` -> `1. مبلغ سرمایه 2. سطح ریسک 3. استراتژی 4. تأیید و شروع`) directly in Simple Mode (`OverviewPage.tsx`), plus Hourly Trading Activity curve & Open/Settled trade tabs.
- **Pro Quant Strategy IDE (Pine Script v4/v5 + Python + Visual Builder)**:
  - Added deterministic zero-`eval` interpreter in `packages/core/src/custom-strategy-engine.ts` supporting Pine Script v4/v5 (`ta.ema`, `ta.sma`, `ta.rsi`, `ta.atr`, `ta.bb`, `ta.supertrend`, `ta.macd`, `ta.vwap`, `plot()`, `strategy.entry()`) and Python Quant (`df['close'].ewm().mean()`, `rolling()`, `ta.bbands`, `crossover`, `plot()`, `df.loc[..., 'signal']`) plus No-Code Visual Rule Builder and 6 built-in templates (`SAMPLE_CUSTOM_STRATEGIES`).
  - Added Worker CRUD, Live Evaluation & Bot Activation routes (`/api/trading/strategies`, `/evaluate`, `/:id`, `/:id/activate`) and integrated `bot-do.ts` autonomous execution.
  - Added `StrategyIdePanel.tsx` to `RadarLabPage.tsx` (`Pine / Python IDE` tab) and live `Pine/Py` script drawer inside `TerminalPage.tsx` with direct `CandlestickChart.tsx` line plotting & marker overlays.
- **Landing Page Redesign & 3D Brand Visuals**: Added generated glassmorphic 3D assets (`hero-core.png`, `ide-prism.png`, `vault-shield.png`), live scrolling ticker, interactive Desk/Simple/IDE hero switcher, Pine/Python product showcase tab, cryptographic HMAC security section, and animated CSS transitions.

## [6.2.0] - 2026-11-20
### Added
- `migrations/0010_spot_futures_directions_verified_cards.sql`: Added `market_type`, `direction_mode`, and `hedge_mode` on `bot_configs`, `market_type` on `trades`, and `verified_profit_cards` table for tamper-proof HMAC-SHA256 profit cards.
- **Full Spot & Futures Engine**: Live `Toobit` Spot (`/api/v1/spot/order`, `/api/v1/account`) and Futures execution, Paper Spot (`1x` leverage + no margin-short guard), and uncapped Spot (`1000+`) + Futures (`800+`) market scanning & pagination.
- **Dual-Direction & Futures Hedge Mode**: `BOTH` / `LONG_ONLY` / `SHORT_ONLY` direction filtering in risk engine & executor, plus simultaneous LONG + SHORT positions per symbol when `hedge_mode = 1`.
- **Tamper-Proof Verified Profit Cards**: `POST /api/trading/cards/issue`, `GET /api/trading/cards`, `GET /api/public/verify-card/:cardId`, QR-embedded PNG export in `WeeklyCardPage.tsx`, and public verifier route `/verify-card/:cardId` (`VerifyCardPage.tsx`) distinguishing verified `LIVE` vs `PAPER` cards.
- **Telegram Bot & Mini App Integration**: Added `setMyCommands`, `setChatMenuButton`, `POST /api/webhook/telegram/setup`, interactive `web_app` launchers, `/app`, `/positions`, `/balance`, `/settings`, `/help`, callback handlers (`set_mkt:*`, `set_dir:*`, `toggle_hedge`, `tg_positions`, `close_pos:*`, `tg_bot_toggle`), and bidirectional account merge (`POST /api/auth/telegram/merge-code`) in `ServicesPage.tsx`.
- **Iconography & Real-Time Polish**: Multi-CDN + clean inline SVG `CoinIcon`, wired `/api/events/stream` SSE listeners in `Layout.tsx`, and replaced all UI emojis across `apps/web/src` with `lucide-react` icons.

## [6.1.0] - 2026-11-19
### Added
- `migrations/0009_notifications_and_idempotency.sql`: Persistent `notifications` feed and `(user_id, signal_id)` duplicate execution guard index.
- `GET /api/events/stream`, `GET /api/trading/notifications`, `POST /api/trading/notifications/read`, `GET /api/trading/events/snapshot`.
- `apps/web/src/pages/ServicesPage.tsx`: Dedicated Kifpool-style Account & Services Hub (`خدمات`).
- Sculpted curved SVG notch bottom dock (`خانه`, `بازار`, floating center Cobalt trade button, `کیف پول`, `خدمات`) with warm amber active indicator.

### Changed
- Consolidated multi-theme switcher into a single cohesive Apple iOS Cupertino theme supporting Day (`paper`) and Night (`cosmic`) modes.
- Removed top announcement ribbon from `LandingPage.tsx` and restored dark `.console-lab` high-contrast surface for `HybridLab.tsx`.
- Hardened `handler.ts` `channel_post` origin check to official channel `-1002263982097` / `@Dollarino_official` and rejected forwarded posts + expired manual signal confirmations (>60 min).
- Fixed `App.tsx` admin route guard so both `ADMIN` and `OWNER` roles can open `AdminPage`.

## [6.0.0] - 2026-11-19
- Initial v6 release with Chart AI Terminal, Multi-AI Ensemble, Subscriptions, Gift Codes, Referrals, Weekly PNG Cards, Telegram Bot & Mini App HMAC auth.
