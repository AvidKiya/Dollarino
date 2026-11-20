# Contributing to Dollarino

## Workspace Layout
- `packages/core`: Pure deterministic trading math, signal parsing, risk gates, and Vitest unit tests.
- `apps/worker`: Cloudflare Worker Hono API, D1 persistence, AES-256-GCM credential vault, Telegram webhook/Mini App handler, and Durable Object watchdog.
- `apps/web`: React + Tailwind + Lightweight Charts SPA for Web & Telegram Mini App.
- `migrations/`: Sequential D1 SQL migrations (`0001`–`0009`).

## Engineering Standards
1. **Strict TypeScript**: Always pass `npm run typecheck` across all 3 workspaces (`core`, `worker`, `web`).
2. **Zero Floating-Point Money Bugs**: All quantity, margin, and PnL scaling in execution paths must use `@dollarino/core` decimal helpers.
3. **Never Fabricate Exchange Capabilities**: Do not invent undocumented private REST endpoints for exchanges; mark unsupported APIs honestly.
4. **Always Verify Locally**: Run `npm run typecheck && npm test && npm run build --workspace=@dollarino/web` before archiving or deploying.
5. **Security**: Never commit `.dev.vars` or API keys, never store exchange secrets in plaintext, and never bypass the 2-step confirmation flow.
