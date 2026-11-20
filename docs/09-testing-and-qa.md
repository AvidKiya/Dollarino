# Testing, Verification & QA Protocol (`09-testing-and-qa`)

---

## 1. Automated Test Layers

| Layer | Command | Coverage & Verified Result |
|---|---|---|
| **TypeScript Strict Typechecking** | `npm run typecheck` | All 3 workspaces (`@dollarino/core`, `@dollarino/worker`, `@dollarino/web`) pass `tsc --noEmit` with `noUncheckedIndexedAccess` and `0` errors |
| **Core Quantitative Unit Tests** | `npm test` (`vitest run`) | `10/10` tests pass across Dollarino signal parser/formatter, ALMA/DEMA/SuperSmoother, KBOS v11, Hybrid Mixer, risk gates, quantization, and backtester |
| **Production Frontend Bundle** | `npm run build --workspace=@dollarino/web` | `tsc --noEmit && vite build` bundles `1,622` modules cleanly (`dist/assets/index-*.js`, CSS, manifest, PWA icons) |
| **Telegram `initData` HMAC Verification** | WebCrypto `WebAppData` check | Verified `HMAC-SHA256("WebAppData", botToken)` hex signing and strict rejection of forged/empty `initData` payloads (`400`/`401`) |
| **Live Full-Stack E2E HTTP Suite** | Local Wrangler D1 + Vite Proxy (`127.0.0.1:5173`) | **`10/10`** live checks passing across Track 1/2 endpoints + prior **`31/31`** baseline pass across trading, scanner, reconcile, and Chart AI |

---

## 2. Live Verification Matrix Executed After Track 1 & 2

1. `GET /api/health` → `200`, `version: 6.0.0`.
2. `GET /api/public/plans` → exact plan alignment `$20` (30d), `$50` (90d), `$90` (180d), `$160` (365d).
3. `POST /api/auth/register` + `GET /api/trading/dashboard` → verified defaults (`margin_pct = 10`, `tp1/2/3 = 50/25/25`, `auto_breakeven_on_tp1 = 1`, `move_sl_to_tp1_on_tp2 = 1`).
4. `GET /api/subscriptions/referrals` → `DLR-XXXXXX` code, `totalReferred`, `rewardDaysEarned`.
5. `POST /api/auth/register` with `referralCode` → verified automatic `referrals` attribution (`totalReferred = 1`, `rewardDaysEarned = 7`).
6. `POST /api/subscriptions/admin/gift-codes` → `403` for standard user, `201` for Admin/Owner.
7. `POST /api/subscriptions/redeem-gift` → activates 30d license & rejects duplicate redemption (`409`).
8. `POST /api/auth/telegram-webapp` → validates `initData` HMAC strictly and rejects empty/forged signatures (`400`/`401`).
9. `PATCH /api/trading/config` (`MANUAL_CONFIRM`) + `POST /api/webhook/tv/:secret` + `POST /api/trading/orders/manual` + `POST /api/trading/positions/:id/close`.
10. Frontend SPA serves `index.html` containing `telegram.org/js/telegram-web-app.js` and `/logo.png` PNG asset.

---

## 3. Cleanliness & Safety Invariants During QA

- Zero real-exchange live orders placed during sandbox testing (`Paper Demo` ledger only).
- All E2E synthetic rows (`@dollarino.test`, gift codes, referrals) are deleted from local D1 immediately after verification.
- Note on headless browser UI screenshots: Chromium/Playwright binaries are not installed in this sandbox; visual validation relies on Vite production bundle compilation (`0` JSX/TS/CSS errors) and strict DOM/API verification.
