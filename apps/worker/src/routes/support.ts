import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { ANTI_SCAM_WARNING_FA, OFFICIAL_BOT_HANDLE, OFFICIAL_CHANNEL_HANDLE } from '../telegram/formatter.js';
import { notifyAllAdmins } from '../telegram/publisher.js';

export const supportRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
supportRoutes.use('*', requireAuth);

supportRoutes.get('/tickets', async (c) => {
  const user = c.get('user');

  const [ticketsRes, msgsRes, tgSetting, antiScamSetting] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM support_tickets WHERE user_id = ? ORDER BY last_message_at DESC LIMIT 20`
    ).bind(user.id).all<{
      id: string;
      user_id: string;
      subject: string;
      status: string;
      channel: string;
      last_message_at: string;
      created_at: string;
    }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT sm.*
       FROM support_messages sm
       JOIN support_tickets st ON st.id = sm.ticket_id
       WHERE st.user_id = ?
       ORDER BY sm.created_at ASC LIMIT 200`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'telegram_support'`)
      .first<{ value: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'anti_scam_notice_fa'`)
      .first<{ value: string }>().catch(() => null),
  ]);

  const rawSupport = tgSetting?.value || OFFICIAL_BOT_HANDLE;
  const telegramSupport = /Dollarino_admin/i.test(rawSupport) ? OFFICIAL_BOT_HANDLE : rawSupport;

  return c.json({
    tickets: ticketsRes.results,
    messages: msgsRes.results,
    telegramSupport,
    officialChannel: OFFICIAL_CHANNEL_HANDLE,
    antiScamNotice: antiScamSetting?.value || ANTI_SCAM_WARNING_FA,
  });
});

supportRoutes.post('/message', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    ticketId?: string;
    subject?: string;
    message?: string;
  }>().catch(() => ({} as { ticketId?: string; subject?: string; message?: string }));

  const text = String(body.message || '').trim();
  if (!text) return c.json({ error: 'متن پیام پشتیبانی نمی‌تواند خالی باشد.' }, 400);

  let ticketId = (body.ticketId || '').trim();
  if (ticketId) {
    const own = await c.env.DB.prepare(
      `SELECT id FROM support_tickets WHERE id = ? AND user_id = ? LIMIT 1`
    ).bind(ticketId, user.id).first<{ id: string }>();
    if (!own) ticketId = '';
  }

  if (!ticketId) {
    const openExisting = await c.env.DB.prepare(
      `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
    ).bind(user.id).first<{ id: string }>();
    if (openExisting) {
      ticketId = openExisting.id;
    } else {
      ticketId = randomId('tkt');
      await c.env.DB.prepare(
        `INSERT INTO support_tickets (id, user_id, subject, status, channel) VALUES (?, ?, ?, 'OPEN', 'WEB')`
      ).bind(ticketId, user.id, (body.subject || 'پشتیبانی آنلاین دلارینو').trim().slice(0, 100)).run();
    }
  }

  const msgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message)
     VALUES (?, ?, ?, 'user', ?, ?)`
  ).bind(msgId, ticketId, user.id, user.username || user.email, text.slice(0, 2000)).run();

  await c.env.DB.prepare(
    `UPDATE support_tickets SET status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`
  ).bind(ticketId).run();

  // Notify ALL admins/owners via Telegram Bot (never personal DMs)
  const alert = [
    `💬 پیام پشتیبانی آنلاین جدید (وب)`,
    `کاربر: ${user.username} (${user.email})`,
    `تیکت: ${ticketId}`,
    ``,
    text.slice(0, 800),
  ].join('\n');

  await notifyAllAdmins(c.env, alert, {
    inlineKeyboard: [
      [{ text: '✍️ پاسخ آنلاین به این تیکت', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' }],
    ],
  }).catch(() => {});

  return c.json({ ok: true, ticketId, messageId: msgId }, 201);
});
