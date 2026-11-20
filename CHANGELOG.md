# Changelog

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
