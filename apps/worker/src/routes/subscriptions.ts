import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import { logAudit } from '../engine/executor.js';
import type { AuthUser, Env } from '../env.js';
import { TelegramBotClient } from '../telegram/client.js';

export interface SubscriptionPlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  max_live_exchanges: number;
  allow_ai_trading: number;
  allow_codexbot: number;
  allow_copy_trade: number;
  allow_live_trading: number;
  features_json: string;
  is_popular: number;
  is_active: number;
  sort_order: number;
}

export interface UserEntitlement {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  allowPaperDemo: boolean;
  allowAiTrading: boolean;
  allowCodexbot: boolean;
  allowCopyTrade: boolean;
  allowLiveTrading: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  subscriptionRequired: boolean;
}

export async function getPublicPlans(db: D1Database): Promise<SubscriptionPlanRow[]> {
  const rows = await db.prepare(
    `SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC`
  ).all<SubscriptionPlanRow>().catch(() => ({ results: [] as SubscriptionPlanRow[] }));
  return rows.results;
}

export async function resolveUserEntitlement(db: D1Database, user: AuthUser): Promise<UserEntitlement> {
  const reqSetting = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'subscription_required'`
  ).first<{ value: string }>().catch(() => null);
  const subscriptionRequired = (reqSetting?.value ?? 'true') !== 'false';

  if (user.role === 'owner' || user.role === 'admin') {
    return {
      hasPaidPlan: true,
      planCode: 'vip_owner',
      planNameFa: 'دسترسی کامل مدیریت (VIP)',
      planNameEn: 'Admin / Owner Full VIP',
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: true,
      allowCodexbot: true,
      allowCopyTrade: true,
      allowLiveTrading: true,
      daysRemaining: 9999,
      expiresAt: null,
      subscriptionRequired,
    };
  }

  const activeSub = await db.prepare(
    `SELECT us.plan_code, us.expires_at, sp.name_fa, sp.name_en,
            sp.allow_ai_trading, sp.allow_codexbot, sp.allow_copy_trade, sp.allow_live_trading
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.user_id = ? AND us.status = 'ACTIVE'
       AND (us.expires_at IS NULL OR us.expires_at > datetime('now'))
     ORDER BY us.expires_at DESC LIMIT 1`
  ).bind(user.id).first<{
    plan_code: string;
    expires_at: string | null;
    name_fa: string;
    name_en: string;
    allow_ai_trading: number;
    allow_codexbot: number;
    allow_copy_trade: number;
    allow_live_trading: number;
  }>().catch(() => null);

  if (activeSub && activeSub.plan_code !== 'free_demo') {
    const expMs = activeSub.expires_at
      ? Date.parse(activeSub.expires_at.includes('T') ? activeSub.expires_at : `${activeSub.expires_at.replace(' ', 'T')}Z`)
      : Date.now() + 30 * 86_400_000;
    const daysRemaining = Math.max(1, Math.ceil((expMs - Date.now()) / 86_400_000));
    return {
      hasPaidPlan: true,
      planCode: activeSub.plan_code,
      planNameFa: activeSub.name_fa,
      planNameEn: activeSub.name_en,
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: Boolean(activeSub.allow_ai_trading),
      allowCodexbot: Boolean(activeSub.allow_codexbot),
      allowCopyTrade: Boolean(activeSub.allow_copy_trade),
      allowLiveTrading: Boolean(activeSub.allow_live_trading),
      daysRemaining,
      expiresAt: activeSub.expires_at,
      subscriptionRequired,
    };
  }

  if (!subscriptionRequired) {
    return {
      hasPaidPlan: true,
      planCode: 'open_access',
      planNameFa: 'دسترسی آزاد پلتفرم',
      planNameEn: 'Open Platform Access',
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: true,
      allowCodexbot: true,
      allowCopyTrade: true,
      allowLiveTrading: true,
      daysRemaining: 365,
      expiresAt: null,
      subscriptionRequired: false,
    };
  }

  return {
    hasPaidPlan: false,
    planCode: 'free_demo',
    planNameFa: 'حساب تست دمو (رایگان)',
    planNameEn: 'Paper Demo Trial',
    status: 'FREE_DEMO',
    allowPaperDemo: true,
    allowAiTrading: false,
    allowCodexbot: true, // Allowed in Paper Demo for testing!
    allowCopyTrade: false,
    allowLiveTrading: false,
    daysRemaining: 0,
    expiresAt: null,
    subscriptionRequired: true,
  };
}

export const subscriptionRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
subscriptionRoutes.use('*', requireAuth);

subscriptionRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const [entitlement, plans, orders, settings] = await Promise.all([
    resolveUserEntitlement(c.env.DB, user),
    getPublicPlans(c.env.DB),
    c.env.DB.prepare(
      `SELECT us.*, sp.name_fa, sp.name_en
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN ('subscription_required', 'usdt_trc20_wallet', 'iran_card_number', 'iran_card_holder', 'telegram_support')`
    ).all<{ key: string; value: string }>().catch(() => ({ results: [] })),
  ]);

  const paymentConfig: Record<string, string> = {};
  for (const s of settings.results) paymentConfig[s.key] = s.value;

  return c.json({
    entitlement,
    plans,
    orders: orders.results,
    paymentConfig,
  });
});

subscriptionRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    planCode?: string;
    paymentMethod?: 'USDT_TRC20' | 'CARD_TO_CARD';
    paymentReference?: string;
    payerNote?: string;
  }>().catch(() => ({} as Record<string, string>));

  const planCode = (body.planCode || '').trim();
  const plan = await c.env.DB.prepare(
    `SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1`
  ).bind(planCode).first<SubscriptionPlanRow>().catch(() => null);

  if (!plan || plan.price_usd <= 0) {
    return c.json({ error: 'Selected subscription plan is invalid' }, 400);
  }

  const ref = (body.paymentReference || '').trim();
  if (ref.length < 5) {
    return c.json({ error: 'Please enter a valid TXID or payment tracking reference (min 5 chars)' }, 400);
  }

  const method = body.paymentMethod === 'CARD_TO_CARD' ? 'CARD_TO_CARD' : 'USDT_TRC20';
  const id = randomId('sub');

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, payer_note)
     VALUES (?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    plan.code,
    method,
    ref.slice(0, 140),
    plan.price_usd,
    (body.payerNote || '').trim().slice(0, 240)
  ).run();

  await logAudit(
    c.env.DB,
    user.id,
    'SYSTEM',
    'INFO',
    `Subscription order ${id} submitted for ${plan.name_en} (${method}: ${ref.slice(0, 32)})`
  );

  // Best-effort owner Telegram notification if configured
  if (c.env.TELEGRAM_BOT_TOKEN && c.env.OWNER_TELEGRAM_ID) {
    const tg = new TelegramBotClient(c.env.TELEGRAM_BOT_TOKEN);
    const note = [
      `💳 درخواست اشتراک جدید در دلارینو`,
      `کاربر: ${user.email} (${user.username})`,
      `پلن: ${plan.name_fa} ($${plan.price_usd})`,
      `روش: ${method}`,
      `کد پیگیری / TXID: ${ref}`,
      `شناسه سفارش: ${id}`,
    ].join('\n');
    await tg.sendMessage(c.env.OWNER_TELEGRAM_ID, note).catch(() => {});
  }

  return c.json({ ok: true, orderId: id, status: 'PENDING_REVIEW' }, 201);
});

// Admin subscription management routes
function isAdmin(c: { get: (k: 'user') => AuthUser; env: Env }): boolean {
  const u = c.get('user');
  const ownerTg = c.env.OWNER_TELEGRAM_ID || '944021185';
  return u.role === 'owner' || u.role === 'admin' || Boolean(u.telegramId && u.telegramId === ownerTg);
}

subscriptionRoutes.get('/admin/orders', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT us.*, u.email, u.username, sp.name_fa, sp.name_en, sp.duration_days
     FROM user_subscriptions us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     ORDER BY CASE WHEN us.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END, us.created_at DESC
     LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ orders: rows.results });
});

subscriptionRoutes.post('/admin/orders/:id/review', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ decision: 'APPROVE' | 'REJECT'; adminNote?: string }>();

  const order = await c.env.DB.prepare(
    `SELECT us.*, sp.duration_days
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.id = ?`
  ).bind(id).first<{ id: string; user_id: string; plan_code: string; duration_days: number | null }>();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  if (body.decision === 'APPROVE') {
    const days = Math.max(1, order.duration_days ?? 30);
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'ACTIVE',
           started_at = datetime('now'),
           expires_at = datetime('now', '+' || ? || ' days'),
           reviewed_by = ?,
           reviewed_at = datetime('now'),
           admin_note = ?
       WHERE id = ?`
    ).bind(days, actor.id, body.adminNote || 'Approved', id).run();
    await logAudit(c.env.DB, order.user_id, 'SYSTEM', 'INFO', `Subscription ${order.plan_code} approved for ${days} days`);
  } else {
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'REJECTED', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ?
       WHERE id = ?`
    ).bind(actor.id, body.adminNote || 'Rejected', id).run();
  }

  return c.json({ ok: true });
});

subscriptionRoutes.post('/admin/grant', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ emailOrUserId: string; planCode?: string; days?: number; note?: string }>();
  const target = (body.emailOrUserId || '').trim();
  const userRow = await c.env.DB.prepare(
    `SELECT id, email FROM users WHERE lower(email) = lower(?) OR id = ? LIMIT 1`
  ).bind(target, target).first<{ id: string; email: string }>();
  if (!userRow) return c.json({ error: 'User not found' }, 404);

  const planCode = body.planCode || 'pro_monthly';
  const days = Math.max(1, Math.min(3650, Number(body.days ?? 30)));
  const id = randomId('sub');

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, reviewed_by, reviewed_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', 'OWNER_DIRECT_GRANT', 0, datetime('now'), datetime('now', '+' || ? || ' days'), ?, datetime('now'), ?)`
  ).bind(id, userRow.id, planCode, days, actor.id, body.note || `Granted ${days}d by owner`).run();

  return c.json({ ok: true, id, userId: userRow.id, email: userRow.email, days });
});

subscriptionRoutes.patch('/admin/config', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const body = await c.req.json<{
    subscriptionRequired?: boolean;
    usdtTrc20Wallet?: string;
    iranCardNumber?: string;
    iranCardHolder?: string;
    telegramSupport?: string;
    proPriceUsd?: number;
    proPriceToman?: number;
    vipPriceUsd?: number;
    vipPriceToman?: number;
  }>();

  const kvPairs: Array<[string, string | undefined]> = [
    ['subscription_required', body.subscriptionRequired !== undefined ? String(body.subscriptionRequired) : undefined],
    ['usdt_trc20_wallet', body.usdtTrc20Wallet?.trim()],
    ['iran_card_number', body.iranCardNumber?.trim()],
    ['iran_card_holder', body.iranCardHolder?.trim()],
    ['telegram_support', body.telegramSupport?.trim()],
  ];

  for (const [k, v] of kvPairs) {
    if (v !== undefined && v !== '') {
      await c.env.DB.prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).bind(k, v).run();
    }
  }

  if (typeof body.proPriceUsd === 'number' || typeof body.proPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'pro_monthly'`
    ).bind(body.proPriceUsd ?? null, body.proPriceToman ?? null).run();
  }
  if (typeof body.vipPriceUsd === 'number' || typeof body.vipPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'vip_quarterly'`
    ).bind(body.vipPriceUsd ?? null, body.vipPriceToman ?? null).run();
  }

  return c.json({ ok: true });
});

subscriptionRoutes.get('/referrals', async (c) => {
  const user = c.get('user');
  const code = `DLR-${user.id.slice(-6).toUpperCase()}`;
  const refs = await c.env.DB.prepare(
    `SELECT r.id, r.reward_days, r.status, r.created_at, u.username
     FROM referrals r JOIN users u ON u.id = r.referred_user_id
     WHERE r.referrer_user_id = ? ORDER BY r.created_at DESC LIMIT 50`
  ).bind(user.id).all<{ id: string; reward_days: number; status: string; created_at: string; username: string }>().catch(() => ({ results: [] }));
  const totalReferred = refs.results.length;
  const rewardDaysEarned = refs.results.reduce((acc, r) => acc + Number(r.reward_days || 0), 0);
  return c.json({ referralCode: code, totalReferred, rewardDaysEarned, referrals: refs.results });
});

subscriptionRoutes.post('/redeem-gift', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const code = (body.code || '').trim().toUpperCase();
  if (!code) return c.json({ error: 'Gift code is required' }, 400);

  const gift = await c.env.DB.prepare(
    `SELECT * FROM gift_codes WHERE code = ? AND is_active = 1`
  ).bind(code).first<{
    code: string;
    plan_code: string;
    duration_days: number;
    max_uses: number;
    uses_count: number;
    expires_at: string | null;
  }>().catch(() => null);

  if (!gift) return c.json({ error: 'Gift code is invalid or inactive' }, 404);
  if (gift.uses_count >= gift.max_uses) return c.json({ error: 'Gift code usage limit reached' }, 400);
  if (gift.expires_at && Date.parse(gift.expires_at) < Date.now()) {
    return c.json({ error: 'Gift code has expired' }, 400);
  }

  const already = await c.env.DB.prepare(
    `SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?`
  ).bind(code, user.id).first();
  if (already) return c.json({ error: 'You have already redeemed this gift code' }, 409);

  const subId = randomId('sub');
  const redId = randomId('red');
  await c.env.DB.prepare(`INSERT INTO gift_redemptions (id, code, user_id) VALUES (?, ?, ?)`).bind(redId, code, user.id).run();
  await c.env.DB.prepare(`UPDATE gift_codes SET uses_count = uses_count + 1 WHERE code = ?`).bind(code).run();
  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'Gift code redeemed')`
  ).bind(subId, user.id, gift.plan_code, `GIFT:${code}`, gift.duration_days).run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Redeemed gift code ${code} (${gift.duration_days}d)`);
  return c.json({ ok: true, durationDays: gift.duration_days, planCode: gift.plan_code });
});

subscriptionRoutes.post('/admin/gift-codes', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ code?: string; planCode?: string; durationDays?: number; maxUses?: number }>();
  const code = (body.code || `DLR${Math.random().toString(36).slice(2, 8)}`).trim().toUpperCase();
  const durationDays = Math.max(1, Math.min(365, Number(body.durationDays ?? 30)));
  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses ?? 1)));
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO gift_codes (code, plan_code, duration_days, max_uses, is_active, created_by)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).bind(code, body.planCode || 'pro_monthly', durationDays, maxUses, actor.id).run();
  return c.json({ ok: true, code, durationDays, maxUses }, 201);
});
