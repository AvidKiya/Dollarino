# DevOps, Environment & Deployment Runbook (`10-devops-and-deployment`)

---

## 1. Local Development Workflow

```bash
# 1. Install dependencies
npm install

# 2. Apply all Cloudflare D1 migrations locally (0001..0008)
npx wrangler d1 migrations apply dollarino-db --local

# 3. Run API Worker locally (127.0.0.1:8787)
npm run dev --workspace=@dollarino/worker

# 4. Run React + Vite Frontend (0.0.0.0:5173, proxies /api -> 8787)
npm run dev --workspace=@dollarino/web
```

---

## 2. Cloudflare Production Deployment (`wrangler.toml`)

1. **Apply Production D1 Migrations**:
   ```bash
   npx wrangler d1 migrations apply dollarino-db --remote
   ```
2. **Set Required Worker Secrets** (NEVER commit to Git):
   ```bash
   npx wrangler secret put SESSION_JWT_SECRET
   npx wrangler secret put MASTER_ENCRYPTION_KEY
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put EXCHANGE_PROXY_SECRET   # optional, if using apps/relay
   ```
3. **Configure Plain Variables (`wrangler.toml`)**:
   - `OWNER_TELEGRAM_ID = "944021185"`
   - `DEFAULT_SIGNAL_CHANNEL = "@Dollarinoofficial"`
   - `ALLOW_LIVE_TRADING = "true"`
   - `TOOBIT_PROXY_URL = "https://your-relay.vercel.app"` (if needed for geo-403 bypass)
4. **Deploy Worker + Durable Object (`TradingBotCoordinator`) + Cron (`* * * * *`)**:
   ```bash
   npx wrangler deploy
   ```
5. **Build & Deploy Frontend PWA (`apps/web`) to Cloudflare Pages**:
   ```bash
   npm run build --workspace=@dollarino/web
   npx wrangler pages deploy apps/web/dist --project-name dollarino-web
   ```
6. **Register Telegram Bot Webhook & Mini App Menu Button**:
   - Webhook URL: `https://<your-worker-or-pages-domain>/api/webhook/telegram` with header secret `TELEGRAM_WEBHOOK_SECRET`.
   - Menu Button (via `@BotFather` `/setmenubutton`): set Web App URL to `https://<your-pages-domain>/`.

---

## 3. Toobit Relay Deployment (`apps/relay`)

Deploy `apps/relay` to Vercel (`vercel.json` included) or Docker (`Dockerfile` included) in an unrestricted region, set `PROXY_SECRET`, and configure `TOOBIT_PROXY_URL` + `EXCHANGE_PROXY_SECRET` on the Worker or per-user inside `CopyConnectPage`.
