import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import type { Env } from '../env.js';
import { TelegramBotClient } from '../telegram/client.js';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
adminRoutes.use('*', requireAuth);

adminRoutes.use('*', async (c, next) => {
  const u = c.get('user');
  const ownerTg = c.env.OWNER_TELEGRAM_ID || '944021185';
  const isOwnerOrAdmin = u.role === 'owner' || u.role === 'admin' || (u.telegramId && u.telegramId === ownerTg);
  if (!isOwnerOrAdmin) return c.json({ error: 'Admin access required' }, 403);
  await next();
});

adminRoutes.get('/overview', async (c) => {
  const [users, trades, signals, bots, settings] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username, created_at, last_active_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    ).all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
              COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl
       FROM trades`
    ).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM signals`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM telegram_bots`).first(),
    c.env.DB.prepare(`SELECT key, value FROM system_settings`).all<{ key: string; value: string }>(),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings.results) settingsMap[s.key] = s.value;

  return c.json({
    users: users.results,
    stats: {
      totalUsers: users.results.length,
      trades,
      signalsCount: (signals as { total: number } | null)?.total ?? 0,
      botsCount: (bots as { total: number } | null)?.total ?? 0,
    },
    settings: settingsMap,
  });
});

adminRoutes.patch('/users/:id', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json<{ role?: 'user' | 'admin'; is_blocked?: boolean }>();

  if (body.role !== undefined && actor.role !== 'owner') {
    return c.json({ error: 'Only the primary instance owner can promote or demote admins' }, 403);
  }
  if (targetId === actor.id && body.is_blocked) {
    return c.json({ error: 'Cannot block yourself' }, 400);
  }

  if (body.role !== undefined) {
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ? AND role != \'owner\'').bind(body.role, targetId).run();
  }
  if (body.is_blocked !== undefined) {
    await c.env.DB.prepare('UPDATE users SET is_blocked = ? WHERE id = ? AND role != \'owner\'')
      .bind(body.is_blocked ? 1 : 0, targetId).run();
  }
  return c.json({ ok: true });
});

adminRoutes.put('/settings', async (c) => {
  const body = await c.req.json<Record<string, string>>();
  for (const [k, v] of Object.entries(body)) {
    await c.env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).bind(k, String(v)).run();
  }
  return c.json({ ok: true });
});

adminRoutes.post('/broadcast', async (c) => {
  const body = await c.req.json<{ message: string }>();
  if (!body.message?.trim()) return c.json({ error: 'Message required' }, 400);
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Global TELEGRAM_BOT_TOKEN not configured' }, 400);

  const client = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
  const targets = await c.env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND is_blocked = 0')
    .all<{ telegram_id: string }>();
  let sent = 0;
  for (const t of targets.results) {
    await client.sendMessage(t.telegram_id, `📢 اطلاعیه دلارینو:\n\n${body.message}`).then(() => sent++).catch(() => {});
  }
  return c.json({ ok: true, sent, total: targets.results.length });
});
