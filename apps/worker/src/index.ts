import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes, requireAuth, type AppVariables } from './auth.js';
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

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('*', cors({
  origin: (origin) => origin || '*',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dollarino-Token'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: 'Dollarino API Worker v6.0',
    health: '/api/health',
    note: 'Open the Website preview (port 5173) or Cloudflare Pages frontend to use the full Dollarino UI.',
  });
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    platform: 'Dollarino (دلارینو)',
    version: '6.0.0',
    openSource: false,
    paidSubscriptions: true,
    centralMultiAI: true,
    multiCoinAutonomous: true,
    primaryStrategy: 'dollarino_v01',
    brandNames: {
      ai: 'هوش مصنوعی دلارینو',
      strategy: 'استراتژی منتخب دلارینو (موتور دُرنا V1)',
      copyTrade: 'کپی ترید دلارینو',
    },
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

app.get('/api/events/stream', requireAuth, async (c) => {
  const user = c.get('user');
  const [cfg, openCount, unreadNtf, latestSig] = await Promise.all([
    c.env.DB.prepare(`SELECT bot_state, trading_mode, paper_balance FROM bot_configs WHERE user_id = ?`).bind(user.id).first<{ bot_state: string; trading_mode: string; paper_balance: string }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT id, symbol, direction, created_at FROM signals ORDER BY created_at DESC LIMIT 1`).first(),
  ]);
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      const send = (ev: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('balance.updated', { paperBalance: cfg?.paper_balance ?? '0', tradingMode: cfg?.trading_mode ?? 'PAPER' });
      send('position.updated', { openCount: openCount?.cnt ?? 0, botState: cfg?.bot_state ?? 'STOPPED' });
      send('notification.created', { unread: unreadNtf?.cnt ?? 0 });
      if (latestSig) send('signal.received', latestSig);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

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
