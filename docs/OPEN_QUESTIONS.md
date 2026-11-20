# Open Questions & Pending Operator Actions (`OPEN_QUESTIONS`)

1. **Production Telegram Bot Credentials**:
   - Have `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` been provisioned via `npx wrangler secret put` on the target Cloudflare account, and has `@BotFather` `/setmenubutton` been pointed to the production Cloudflare Pages Mini App URL?
2. **Toobit Geo-Egress Relay (`TOOBIT_PROXY_URL`)**:
   - Which hosting target (`Vercel` vs dedicated EU/SG VPS Docker container via `apps/relay`) will serve as the production Toobit egress proxy to prevent Cloudflare geo-403 blocks?
3. **Production Crypto Secrets**:
   - Confirm strong non-default values are set for `SESSION_JWT_SECRET` and `MASTER_ENCRYPTION_KEY` before opening public registration.
4. **Live Toobit API Verification**:
   - Awaiting an operator-supplied **trade-only (no-withdraw)** Toobit Futures API key/secret for final end-to-end live order/balance smoke verification in staging.
5. **Payment Receiving Coordinates (`system_settings`)**:
   - Confirm final production `usdt_trc20_wallet`, `iran_card_number`, `iran_card_holder`, and `telegram_support` values inside `AdminPage` before live billing opens.
6. **Headless Visual Regression CI**:
   - Since Chromium/Playwright is absent in the sandbox environment, should a GitHub Actions Playwright job be added to `.github/workflows` to screenshot `Simple Mode`, `Pro Mode`, and `iOS Daylight Frost` across mobile (`390x844`) and desktop (`1440x900`) viewports on every PR?
