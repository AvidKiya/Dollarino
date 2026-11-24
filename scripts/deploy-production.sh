#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "  Dollarino V10.1 — Production Cloudflare Deploy"
echo "=================================================="

command -v npx >/dev/null 2>&1 || { echo "❌ npx not found. Install Node.js 20+."; exit 1; }

echo "1/5 Typechecking TypeScript..."
npm run typecheck

echo "2/5 Running Full Core + Worker Test Suite..."
npm test

echo "3/5 Building Production Frontend & Worker Assets..."
npm run build

echo "4/5 Applying Remote D1 Migrations (0001..0033)..."
npx wrangler d1 migrations apply dollarino-db --remote

echo "5/5 Deploying Unified Worker + Static Assets + Durable Object..."
npx wrangler deploy

echo ""
echo "✅ Deploy Complete!"
echo "Next checklist:"
echo "  1. Ensure Cloudflare Secrets are set (once per instance):"
echo "       openssl rand -hex 32   | npx wrangler secret put SESSION_JWT_SECRET"
echo "       openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY"
echo "       npx wrangler secret put TELEGRAM_BOT_TOKEN"
echo "       npx wrangler secret put HILINKUP_API_KEY"
echo "       npx wrangler secret put PUBLIC_WEB_URL"
echo "  2. Open your deployed domain -> first signup becomes Owner automatically."
echo "  3. In Admin Panel -> Check 'Production Readiness' & set TRC20 / BEP20 receiver wallet."
echo "  4. Call POST /api/webhook/telegram/setup as Owner to register @Dollarino_bot webhook."
