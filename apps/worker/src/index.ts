import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './auth.js';
import { TradingBotCoordinator } from './engine/bot-do.js';
import { reconcileOpenPositionsForUser } from './engine/executor.js';
import type { Env } from './env.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook } from './exchanges/paper.js';
import { adminRoutes } from './routes/admin.js';
import { chartAiRoutes } from './routes/chart-ai.js';
import { connectionRoutes } from './routes/connections.js';
import { getPublicPlans, subscriptionRoutes } from './routes/subscriptions.js';
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
    version: '5.0.0',
    openSource: false,
    paidSubscriptions: true,
    centralMultiAI: true,
    primaryStrategy: 'dollarino_v01',
    aiProviders: ['deepseek', 'anthropic', 'openai', 'gemini', 'openai_compatible'],
    exchanges: {
      toobit: 'LIVE_FUTURES_SUPPORTED',
      kcex: 'MIRROR_0PCT_MAKER_AND_WEB_SESSION',
      paper: 'SIMULATOR_LIVE_QUOTES',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/public/plans', async (c) => {
  const plans = await getPublicPlans(c.env.DB);
  return c.json({ plans });
});

app.get('/api/public/market-snapshot', async (c) => {
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const proxyCfg = c.env.TOOBIT_PROXY_URL
    ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
    : undefined;

  const watchlist = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const [candles, orderBook, ...tickers] = await Promise.all([
    fetchPublicKlines(symbol, '15m', 48, proxyCfg).catch(() => []),
    fetchPublicOrderBook(symbol, 10, proxyCfg).catch(() => ({ bids: [], asks: [] })),
    ...watchlist.map(async (sym) => {
      const m = await fetchPublicMarket24h(sym, proxyCfg).catch(() => null);
      const rawVol = Number(String(m?.volume24h ?? '0').replace(/,/g, ''));
      return {
        symbol: sym,
        lastPrice: Number(m?.lastPrice ?? 0),
        changePct24h: Number(m?.changePct24h ?? 0),
        volume24hUsd: Number.isFinite(rawVol) ? rawVol : 0,
        high24h: Number(m?.high24h ?? 0),
        low24h: Number(m?.low24h ?? 0),
        fundingRate: m?.fundingRate ?? '0.0001',
      };
    }),
  ]);

  return c.json({
    symbol,
    candles,
    orderBook,
    markets: tickers.filter((t) => t.lastPrice > 0),
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/connections', connectionRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
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
