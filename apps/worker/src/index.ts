import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth.js';
import { TradingBotCoordinator } from './engine/bot-do.js';
import { reconcileOpenPositionsForUser } from './engine/executor.js';
import type { Env } from './env.js';
import { adminRoutes } from './routes/admin.js';
import { chartAiRoutes } from './routes/chart-ai.js';
import { connectionRoutes } from './routes/connections.js';
import { tradingRoutes } from './routes/trading.js';
import { webhookRoutes } from './routes/webhooks.js';

export { TradingBotCoordinator };

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dollarino-Token'],
  credentials: true,
}));

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    platform: 'Dollarino (دلارینو)',
    version: '2.0.0',
    openSource: true,
    paidSubscriptions: false,
    exchanges: {
      toobit: 'LIVE_FUTURES_SUPPORTED',
      bitunix: 'LIVE_FUTURES_SUPPORTED',
      paper: 'SIMULATOR_LIVE_QUOTES',
      kcex: 'MIRROR_0PCT_MAKER_AND_WEB_SESSION',
    },
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/connections', connectionRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/chart-ai', chartAiRoutes);
app.route('/api/webhook', webhookRoutes);
app.route('/api/admin', adminRoutes);

// Explicit aliases so both `/api/telegram/webhook/:botId` and `/api/webhook/telegram/:botId` work cleanly
app.post('/api/telegram/webhook', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/api/webhook/telegram';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});
app.post('/api/telegram/webhook/:botId', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = `/api/webhook/telegram/${c.req.param('botId')}`;
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 1-minute watchdog across all running bots & open trades
    ctx.waitUntil((async () => {
      const id = env.TRADING_BOT_DO.idFromName('global-coordinator');
      const stub = env.TRADING_BOT_DO.get(id);
      await stub.fetch('https://do/start').catch(() => {});

      const openUsers = await env.DB.prepare(
        `SELECT DISTINCT user_id FROM trades WHERE status = 'OPEN'`
      ).all<{ user_id: string }>();

      for (const u of openUsers.results) {
        await reconcileOpenPositionsForUser(env, u.user_id).catch(() => {});
      }
    })());
  },
};
