import { Hono } from 'hono';
import type { Timeframe } from '@dollarino/core';
import { runChartAIAnalysis } from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';

export const chartAiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
chartAiRoutes.use('*', requireAuth);

chartAiRoutes.get('/chats', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, symbol, timeframe, title, updated_at FROM chart_ai_chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 25`
  ).bind(user.id).all();
  return c.json({ chats: rows.results });
});

chartAiRoutes.get('/chats/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT * FROM chart_ai_chats WHERE id = ? AND user_id = ?`
  ).bind(c.req.param('id'), user.id).first();
  if (!row) return c.json({ error: 'Chat not found' }, 404);
  return c.json({ chat: row });
});

chartAiRoutes.post('/analyze', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    chatId?: string;
    symbol: string;
    timeframe: Timeframe;
    prompt: string;
  }>();

  const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = (body.timeframe || '15m') as Timeframe;
  const prompt = (body.prompt || 'Analyze trend, key support/resistance, and suggest Entry/SL/3-TP setup.').trim();

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const candles = await adapter.getKlines(symbol, timeframe, 120);
  const analysis = await runChartAIAnalysis(c.env, user.id, symbol, timeframe, candles, prompt);

  const chatId = body.chatId || randomId('chat');
  const existing = await c.env.DB.prepare('SELECT messages_json FROM chart_ai_chats WHERE id = ? AND user_id = ?')
    .bind(chatId, user.id).first<{ messages_json: string }>();

  const prevMessages: Array<{ role: string; content: string }> = existing
    ? JSON.parse(existing.messages_json)
    : [];
  const nextMessages = [
    ...prevMessages,
    { role: 'user', content: prompt },
    { role: 'assistant', content: analysis.summary },
  ];

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE chart_ai_chats SET messages_json = ?, annotations_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(nextMessages), JSON.stringify(analysis), chatId).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO chart_ai_chats (id, user_id, symbol, timeframe, title, messages_json, annotations_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      chatId,
      user.id,
      symbol,
      timeframe,
      `${symbol} ${timeframe} Analysis`,
      JSON.stringify(nextMessages),
      JSON.stringify(analysis)
    ).run();
  }

  return c.json({ chatId, analysis, messages: nextMessages });
});
