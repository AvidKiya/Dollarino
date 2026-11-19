import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { AuthUser, Env } from './env.js';
import { hashPassword, randomId, signJwt, verifyJwt, verifyPassword } from './crypto.js';

export type AppVariables = {
  user: AuthUser;
};

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const customHeader = c.req.header('X-Dollarino-Token');
  const authHeader = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'dollarino_session');
  const token = customHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken);

  if (!token) {
    console.warn('[auth] 401 missing token', {
      hasCustom: Boolean(customHeader),
      hasAuth: Boolean(authHeader),
      hasCookie: Boolean(cookieToken),
    });
    return c.json({ error: 'Authentication required' }, 401);
  }
  const payload = await verifyJwt(token, c.env.SESSION_JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string') {
    console.warn('[auth] 401 invalid jwt');
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  const row = await c.env.DB.prepare(
    'SELECT id, email, username, role, is_blocked, telegram_id FROM users WHERE id = ?'
  ).bind(payload.sub).first<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
  }>();

  if (!row) return c.json({ error: 'User not found' }, 401);
  if (row.is_blocked) return c.json({ error: 'Account is suspended' }, 403);

  c.set('user', {
    id: row.id,
    email: row.email,
    username: row.username,
    role: (row.role as AuthUser['role']) || 'user',
    telegramId: row.telegram_id,
  });
  await next();
}

function isHttpsRequest(c: Context): boolean {
  const xfProto = c.req.header('x-forwarded-proto');
  const origin = c.req.header('origin') ?? '';
  const referer = c.req.header('referer') ?? '';
  return (
    xfProto === 'https' ||
    c.req.url.startsWith('https://') ||
    origin.startsWith('https://') ||
    referer.startsWith('https://')
  );
}

export async function ensureUserDefaults(db: D1Database, userId: string) {
  const webhookSecret = randomId('tv');
  await db.prepare(
    `INSERT OR IGNORE INTO bot_configs
     (user_id, strategy_key, margin_pct, max_leverage, max_open_positions, tp1_close_pct, tp2_close_pct, tp3_close_pct, auto_scan_top, scan_scope, allow_auto_flip, webhook_secret)
     VALUES (?, 'dollarino_v01', 5, 5, 6, 40, 30, 30, 1, 'ALL_MARKET', 1, ?)`
  ).bind(userId, webhookSecret).run();

  await db.prepare(
    `INSERT OR IGNORE INTO exchange_connections
     (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
     VALUES (?, ?, 'paper', 'Paper Simulator (Live Quotes)', 1, 1, 'PAPER-MODE', '{}', 'OK')`
  ).bind(randomId('ex'), userId).run();
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; username?: string; password?: string }>().catch(() => ({} as { email?: string; username?: string; password?: string }));
  const email = (body.email ?? '').trim().toLowerCase();
  const username = (body.username ?? '').trim() || email.split('@')[0] || 'trader';
  const password = body.password ?? '';

  if (!email.includes('@') || password.length < 6) {
    return c.json({ error: 'Valid email and password (min 6 chars) are required' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  // First registered user on a fresh instance automatically receives owner role
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  const role = (countRow?.cnt ?? 0) === 0 ? 'owner' : 'user';

  const id = randomId('usr');
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, email, username, passwordHash, role).run();

  await ensureUserDefaults(c.env.DB, id);

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: id, email, role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    token,
    user: { id, email, username, role, telegram_id: null },
  }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  const row = await c.env.DB.prepare(
    'SELECT id, email, username, password_hash, role, is_blocked, telegram_id FROM users WHERE email = ?'
  ).bind(email).first<{
    id: string;
    email: string;
    username: string;
    password_hash: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
  }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`).bind(row.id).run();

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: row.id, email: row.email, role: row.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    token,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      telegram_id: row.telegram_id,
    },
  });
});

authRoutes.post('/quick-demo', async (c) => {
  const shortTag = Math.random().toString(36).slice(2, 8);
  const email = `demo-${shortTag}@dollarino.app`;
  const username = `کاربر-${shortTag}`;
  const rawPassword = `Dl#${Math.random().toString(36).slice(2, 10)}`;
  const id = randomId('usr');
  const passwordHash = await hashPassword(rawPassword);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, 'user')`
  ).bind(id, email, username, passwordHash).run();

  await ensureUserDefaults(c.env.DB, id);

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: id, email, role: 'user' }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    token,
    user: { id, email, username, role: 'user', telegram_id: null },
    demoCredentials: { email, password: rawPassword },
  }, 201);
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'dollarino_session', { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const u = c.get('user');
  const full = await c.env.DB.prepare(
    `SELECT id, email, username, role, telegram_id, telegram_username, telegram_first_name, telegram_link_code, created_at
     FROM users WHERE id = ?`
  ).bind(u.id).first();
  return c.json({ user: full });
});

authRoutes.post('/telegram-link-code', requireAuth, async (c) => {
  const u = c.get('user');
  const code = `LINK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await c.env.DB.prepare(
    `UPDATE users SET telegram_link_code = ?, telegram_link_expires_at = ? WHERE id = ?`
  ).bind(code, expiresAt, u.id).run();

  return c.json({ code, expiresAt, command: `/link ${code}` });
});

authRoutes.patch('/profile', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ username?: string }>();
  const username = (body.username ?? '').trim();
  if (username.length < 2) return c.json({ error: 'Username must be at least 2 characters' }, 400);
  await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, u.id).run();
  return c.json({ ok: true, username });
});

authRoutes.patch('/password', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const cur = body.currentPassword ?? '';
  const next = body.newPassword ?? '';
  if (next.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400);

  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(cur, row.password_hash))) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }
  const hash = await hashPassword(next);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, u.id).run();
  return c.json({ ok: true });
});
