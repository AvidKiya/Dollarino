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
  const [users, trades, signals, bots, settings, aiSummary, plans, subs, openSupport, copyTraders] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username, wallet_balance_usdt, created_at, last_active_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    ).all<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      telegram_username: string | null;
      wallet_balance_usdt: number;
      created_at: string;
      last_active_at: string | null;
    }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
              COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl
       FROM trades`
    ).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM signals`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM telegram_bots`).first(),
    c.env.DB.prepare(`SELECT key, value FROM system_settings`).all<{ key: string; value: string }>(),
    getPlatformAISummary(c.env),
    c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT user_id, plan_code, expires_at FROM user_subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY expires_at DESC`
    ).all<{ user_id: string; plan_code: string; expires_at: string | null }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM support_tickets WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_traders WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings.results) settingsMap[s.key] = s.value;

  const activeSubByUser = new Map<string, { plan_code: string; expires_at: string | null }>();
  for (const s of subs.results) {
    if (!activeSubByUser.has(s.user_id)) activeSubByUser.set(s.user_id, s);
  }

  const enrichedUsers = users.results.map((u) => {
    const sub = activeSubByUser.get(u.id);
    return {
      ...u,
      activePlan: sub?.plan_code || (u.role === 'owner' || u.role === 'admin' ? 'vip_owner' : null),
      subscriptionExpiresAt: sub?.expires_at || null,
    };
  });

  return c.json({
    users: enrichedUsers,
    stats: {
      totalUsers: enrichedUsers.length,
      activeSubscriptions: activeSubByUser.size,
      openSupportTickets: openSupport?.cnt ?? 0,
      copyTradersCount: copyTraders?.cnt ?? 0,
      trades,
      signalsCount: (signals as { total: number } | null)?.total ?? 0,
      botsCount: (bots as { total: number } | null)?.total ?? 0,
    },
    settings: settingsMap,
    platformAI: aiSummary,
    plans: plans.results,
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

// =========================================================================
// Full Plan CRUD (Admin Panel)
// =========================================================================

adminRoutes.get('/plans', async (c) => {
  const res = await c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all();
  return c.json({ plans: res.results });
});

adminRoutes.post('/plans', async (c) => {
  const body = await c.req.json<{
    code?: string;
    name_fa?: string;
    name_en?: string;
    description_fa?: string;
    description_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    max_live_exchanges?: number;
    features?: string[];
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  const code = (body.code || `plan_${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const priceUsd = Math.max(1, Number(body.price_usd ?? 29));
  const priceToman = Math.max(10000, Number(body.price_toman ?? priceUsd * 70000));
  const durationDays = Math.max(1, Number(body.duration_days ?? 30));

  await c.env.DB.prepare(
    `INSERT INTO subscription_plans
     (code, name_fa, name_en, description_fa, description_en, price_usd, price_toman, duration_days, max_live_exchanges,
      allow_ai_trading, allow_codexbot, allow_copy_trade, allow_live_trading, features_json, is_popular, is_active, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?, 10, datetime('now'))
     ON CONFLICT(code) DO UPDATE SET
      name_fa = excluded.name_fa,
      name_en = excluded.name_en,
      description_fa = excluded.description_fa,
      description_en = excluded.description_en,
      price_usd = excluded.price_usd,
      price_toman = excluded.price_toman,
      duration_days = excluded.duration_days,
      max_live_exchanges = excluded.max_live_exchanges,
      features_json = excluded.features_json,
      is_popular = excluded.is_popular,
      is_active = excluded.is_active,
      updated_at = datetime('now')`
  ).bind(
    code,
    (body.name_fa || 'پلن جدید').trim(),
    (body.name_en || 'Custom Plan').trim(),
    (body.description_fa || '').trim(),
    (body.description_en || '').trim(),
    priceUsd,
    priceToman,
    durationDays,
    Math.max(1, Number(body.max_live_exchanges ?? 3)),
    JSON.stringify(Array.isArray(body.features) && body.features.length ? body.features : ['دسترسی کامل ترید هوشمند، هوش مصنوعی من، کپی‌ترید و استراتژی شخصی']),
    body.is_popular ? 1 : 0,
    body.is_active !== false ? 1 : 0
  ).run();

  return c.json({ ok: true, code });
});

adminRoutes.patch('/plans/:code', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json<{
    name_fa?: string;
    name_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  await c.env.DB.prepare(
    `UPDATE subscription_plans
     SET name_fa = COALESCE(?, name_fa),
         name_en = COALESCE(?, name_en),
         price_usd = COALESCE(?, price_usd),
         price_toman = COALESCE(?, price_toman),
         duration_days = COALESCE(?, duration_days),
         is_popular = COALESCE(?, is_popular),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
     WHERE code = ?`
  ).bind(
    body.name_fa ?? null,
    body.name_en ?? null,
    typeof body.price_usd === 'number' ? body.price_usd : null,
    typeof body.price_toman === 'number' ? body.price_toman : null,
    typeof body.duration_days === 'number' ? body.duration_days : null,
    body.is_popular !== undefined ? (body.is_popular ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    code
  ).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin Gift Codes List & User Wallet
// =========================================================================

adminRoutes.get('/gift-codes', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM gift_codes ORDER BY created_at DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ giftCodes: rows.results });
});

adminRoutes.delete('/gift-codes/:code', async (c) => {
  const code = c.req.param('code');
  await c.env.DB.prepare(`UPDATE gift_codes SET is_active = 0 WHERE code = ?`).bind(code).run();
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/wallet', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ amountUsdt: number }>();
  const amount = Number(body.amountUsdt);
  if (!Number.isFinite(amount)) return c.json({ error: 'Invalid amount' }, 400);
  await c.env.DB.prepare(
    `UPDATE users SET wallet_balance_usdt = MAX(0, wallet_balance_usdt + ?) WHERE id = ?`
  ).bind(amount, id).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin-Verified Copy Traders Management & Trade Publishing
// =========================================================================

adminRoutes.get('/copy-traders', async (c) => {
  const [traders, trades] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM copy_traders ORDER BY created_at DESC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT * FROM copy_trader_trades ORDER BY opened_at DESC LIMIT 100`).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ traders: traders.results, trades: trades.results });
});

adminRoutes.post('/copy-traders', async (c) => {
  const body = await c.req.json<{
    display_name: string;
    handle?: string;
    bio_fa?: string;
    bio_en?: string;
    specialty?: string;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    min_allocation_usd?: number;
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    is_verified?: boolean;
  }>();
  const displayName = (body.display_name || '').trim();
  if (!displayName) return c.json({ error: 'نام نمایشی تریدر الزامی است.' }, 400);

  const id = randomId('ct');
  await c.env.DB.prepare(
    `INSERT INTO copy_traders
     (id, display_name, handle, bio_fa, bio_en, specialty, win_rate, roi_30d_pct, max_drawdown_pct, min_allocation_usd, risk_level, is_verified, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    displayName,
    (body.handle || `@${displayName.replace(/\s+/g, '_').toLowerCase()}`).slice(0, 40),
    (body.bio_fa || '').trim(),
    (body.bio_en || '').trim(),
    (body.specialty || 'AI & Futures').trim(),
    Number(body.win_rate ?? 75),
    Number(body.roi_30d_pct ?? 40),
    Number(body.max_drawdown_pct ?? 6),
    Number(body.min_allocation_usd ?? 50),
    body.risk_level || 'MEDIUM',
    body.is_verified !== false ? 1 : 0
  ).run();

  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    display_name?: string;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    is_verified?: boolean;
    is_active?: boolean;
    risk_level?: string;
  }>();

  await c.env.DB.prepare(
    `UPDATE copy_traders
     SET display_name = COALESCE(?, display_name),
         win_rate = COALESCE(?, win_rate),
         roi_30d_pct = COALESCE(?, roi_30d_pct),
         max_drawdown_pct = COALESCE(?, max_drawdown_pct),
         is_verified = COALESCE(?, is_verified),
         is_active = COALESCE(?, is_active),
         risk_level = COALESCE(?, risk_level),
         updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    body.display_name ?? null,
    typeof body.win_rate === 'number' ? body.win_rate : null,
    typeof body.roi_30d_pct === 'number' ? body.roi_30d_pct : null,
    typeof body.max_drawdown_pct === 'number' ? body.max_drawdown_pct : null,
    body.is_verified !== undefined ? (body.is_verified ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    body.risk_level ?? null,
    id
  ).run();

  return c.json({ ok: true });
});

adminRoutes.delete('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM copy_traders WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/copy-traders/:id/trades', async (c) => {
  const traderId = c.req.param('id');
  const body = await c.req.json<{
    symbol: string;
    direction: 'LONG' | 'SHORT';
    leverage?: number;
    entry_price: string;
    stop_loss?: string;
    tp1?: string;
    status?: 'OPEN' | 'CLOSED';
    pnl_pct?: number;
    note?: string;
  }>();
  const sym = (body.symbol || 'BTCUSDT').toUpperCase().trim();
  const id = randomId('ctt');
  await c.env.DB.prepare(
    `INSERT INTO copy_trader_trades
     (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, status, pnl_pct, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    traderId,
    sym,
    body.direction === 'SHORT' ? 'SHORT' : 'LONG',
    Math.max(1, Number(body.leverage ?? 5)),
    String(body.entry_price || '0'),
    body.stop_loss ? String(body.stop_loss) : null,
    body.tp1 ? String(body.tp1) : null,
    body.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    Number(body.pnl_pct ?? 0),
    (body.note || '').trim() || null
  ).run();
  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/copy-traders/trades/:tradeId', async (c) => {
  const tradeId = c.req.param('tradeId');
  const body = await c.req.json<{ status?: 'OPEN' | 'CLOSED'; exit_price?: string; pnl_pct?: number }>();
  await c.env.DB.prepare(
    `UPDATE copy_trader_trades
     SET status = COALESCE(?, status),
         exit_price = COALESCE(?, exit_price),
         pnl_pct = COALESCE(?, pnl_pct),
         closed_at = CASE WHEN ? = 'CLOSED' THEN datetime('now') ELSE closed_at END
     WHERE id = ?`
  ).bind(body.status ?? null, body.exit_price ?? null, typeof body.pnl_pct === 'number' ? body.pnl_pct : null, body.status ?? null, tradeId).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin Online Support Ticket Desk (Synced Web + Telegram)
// =========================================================================

adminRoutes.get('/support', async (c) => {
  const [tickets, msgs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT st.*, u.email, u.username, u.telegram_id
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ORDER BY CASE WHEN st.status = 'OPEN' THEN 0 ELSE 1 END, st.last_message_at DESC
       LIMIT 100`
    ).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT * FROM support_messages ORDER BY created_at ASC LIMIT 400`
    ).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ tickets: tickets.results, messages: msgs.results });
});

adminRoutes.post('/support/:ticketId/reply', async (c) => {
  const actor = c.get('user');
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ message: string; close?: boolean }>();
  const text = String(body.message || '').trim();
  if (!text) return c.json({ error: 'پاسخ نمی‌تواند خالی باشد.' }, 400);

  const ticket = await c.env.DB.prepare(
    `SELECT st.id, st.user_id, u.telegram_id FROM support_tickets st JOIN users u ON u.id = st.user_id WHERE st.id = ? LIMIT 1`
  ).bind(ticketId).first<{ id: string; user_id: string; telegram_id: string | null }>();
  if (!ticket) return c.json({ error: 'تیکت یافت نشد.' }, 404);

  const msgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message)
     VALUES (?, ?, ?, 'admin', ?, ?)`
  ).bind(msgId, ticketId, actor.id, actor.username || 'پشتیبانی دلارینو', text.slice(0, 2000)).run();

  await c.env.DB.prepare(
    `UPDATE support_tickets SET status = ?, last_message_at = datetime('now') WHERE id = ?`
  ).bind(body.close ? 'CLOSED' : 'ANSWERED', ticketId).run();

  if (ticket.telegram_id && c.env.TELEGRAM_BOT_TOKEN) {
    const tg = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
    await tg.sendMessage(
      ticket.telegram_id,
      `💬 <b>پاسخ پشتیبانی آنلاین دلارینو:</b>\n\n${text}`
    ).catch(() => {});
  }

  return c.json({ ok: true, messageId: msgId });
});

adminRoutes.patch('/support/:ticketId/status', async (c) => {
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ status: 'OPEN' | 'ANSWERED' | 'CLOSED' }>();
  await c.env.DB.prepare(`UPDATE support_tickets SET status = ? WHERE id = ?`).bind(body.status, ticketId).run();
  return c.json({ ok: true });
});
