# Subscriptions, Gift Codes & Referral Growth (`11-subscriptions-and-growth`)

---

## 1. Aligned Subscription Plans (`0008_spec_and_miniapp_alignment.sql`)

| Plan Code | Duration | Price (USD) | Features Unlocked |
|---|---|---|---|
| `free_demo` | 365 days | `$0` | Paper Demo `$10,000`, Simple & Pro UI, Dorna V1 + KBOS, Backtester, Weekly Card |
| `pro_monthly` | 30 days | **`$20`** | Everything in Demo + Multi-AI Brain (`Dorrbin`), Telegram & TV Copy-Trade, Live Toobit / KCEX Mirror |
| `vip_quarterly` | 90 days | **`$50`** | Full 3-month access + priority scanning (`Popular`) |
| `pro_semiannual` | 180 days | **`$90`** | Full 6-month access (25% savings vs monthly) |
| `pro_annual` | 365 days | **`$160`** | Full 1-year institutional access (33% savings vs monthly) |

---

## 2. Payment Verification Lifecycle

1. User chooses a plan on `SubscriptionPage` (or taps **`خرید اشتراک 💎`** inside the Telegram Bot).
2. User submits either a **USDT (TRC20) TXID** or **Iranian Card-to-Card tracking code**.
3. Order enters `subscription_orders` with `status = 'PENDING_REVIEW'`.
4. Super Admin (`944021185`) or Admin reviews in `AdminPage` (`/api/subscriptions/admin/orders/:id/review`) or manually grants days via `/api/subscriptions/admin/grant`.
5. Approving writes an `ACTIVE` row into `user_subscriptions` and immediately unlocks `allowAiTrading`, `allowCopyTrade`, and `allowLiveTrading`.

---

## 3. Gift Codes & Referral Engine

- **Gift Codes (`gift_codes` & `gift_redemptions`)**:
  - Created exclusively by Admin/Owner via `AdminPage` or `POST /api/subscriptions/admin/gift-codes`.
  - Supports custom duration (`1–365` days) and usage caps (`max_uses`), with strict `UNIQUE(code, user_id)` guard against duplicate redemptions.
- **Referral Program (`referrals`)**:
  - Every user has a deterministic code `DLR-<last 6 chars of user.id>` and shareable URL `/?ref=DLR-XXXXXX`.
  - Registering with `?ref=` automatically writes an attribution record (`7` bonus reward days) surfaced in `SubscriptionPage` via `GET /api/subscriptions/referrals`.
