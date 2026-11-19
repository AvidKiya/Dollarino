import { Hono } from 'hono';
import {
  getPlatformAISummary,
  testAllPlatformAIEngines,
} from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { encryptVaultJson, maskSecret, randomId } from '../crypto.js';
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
  const [users, trades, signals, bots, settings, aiSummary] = await Promise.all([
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
    getPlatformAISummary(c.env),
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
    platformAI: aiSummary,
  });
});

adminRoutes.get('/ai-engines', async (c) => {
  const [rows, summary] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked,
              temperature, max_tokens, daily_call_cap, calls_today, last_test_status, last_tested_at, updated_at
       FROM platform_ai_engines ORDER BY slot_order ASC, created_at ASC LIMIT 3`
    ).all(),
    getPlatformAISummary(c.env),
  ]);
  return c.json({
    engines: rows.results,
    consensusMode: summary.consensusMode,
    cacheTtlSec: summary.cacheTtlSec,
    activeCount: summary.activeCount,
    latestSignals: summary.latestSignals,
  });
});

adminRoutes.post('/ai-engines', async (c) => {
  const body = await c.req.json<{
    id?: string;
    slotOrder?: number;
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible';
    label?: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    weight?: number;
    temperature?: number;
    maxTokens?: number;
    dailyCallCap?: number;
    isActive?: boolean;
  }>();

  if (!body.provider || !body.model) {
    return c.json({ error: 'Provider and model are required' }, 400);
  }

  const slotOrder = Math.min(3, Math.max(1, Math.round(Number(body.slotOrder ?? 1))));
  const weight = Math.min(100, Math.max(10, Math.round(Number(body.weight ?? 100))));
  const defaultModelMap: Record<string, string> = {
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-2.0-flash',
    openai_compatible: body.model,
  };
  const model = body.model.trim() || defaultModelMap[body.provider] || 'gpt-4o-mini';
  const label = (body.label ?? '').trim() || `مدل ${slotOrder} (${body.provider.toUpperCase()})`;

  // Check if updating an existing slot or creating a new one (max 3 slots!)
  const existing = body.id
    ? await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE id = ?`).bind(body.id).first<{ id: string }>()
    : await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE slot_order = ?`).bind(slotOrder).first<{ id: string }>();

  if (!existing) {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM platform_ai_engines`).first<{ cnt: number }>();
    if ((countRow?.cnt ?? 0) >= 3) {
      return c.json({ error: 'حداکثر ۳ مدل برای هوش مصنوعی دلارینو قابل ثبت است. یکی از اسلات‌ها را ویرایش یا حذف کنید.' }, 400);
    }
    if (!body.apiKey?.trim()) {
      return c.json({ error: 'API Key is required for a new platform AI engine' }, 400);
    }
    const id = randomId('paie');
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `INSERT INTO platform_ai_engines
       (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, temperature, max_tokens, daily_call_cap, last_test_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAVED')`
    )
      .bind(
        id,
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 500))
      )
      .run();
    return c.json({ ok: true, id, slotOrder }, 201);
  }

  // Update existing slot
  if (body.apiKey?.trim()) {
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           api_key_masked = ?, encrypted_api_key = ?, temperature = ?, max_tokens = ?, daily_call_cap = ?,
           last_test_status = 'UPDATED', updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 500)),
        existing.id
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           temperature = ?, max_tokens = ?, daily_call_cap = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 500)),
        existing.id
      )
      .run();
  }

  return c.json({ ok: true, id: existing.id, slotOrder });
});

adminRoutes.patch('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ is_active?: boolean; weight?: number; label?: string; model?: string }>();
  if (body.is_active !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, id)
      .run();
  }
  if (body.weight !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET weight = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(Math.min(100, Math.max(10, Math.round(body.weight))), id)
      .run();
  }
  if (body.label !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET label = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.label.trim(), id)
      .run();
  }
  if (body.model !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET model = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.model.trim(), id)
      .run();
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM platform_ai_engines WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/ai-engines/test', async (c) => {
  const result = await testAllPlatformAIEngines(c.env);
  return c.json(result, result.results.length === 0 ? 400 : 200);
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
