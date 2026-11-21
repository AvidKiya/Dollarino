import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { AuthUser, Env } from './env.js';
import { hashPassword, randomId, signJwt, verifyJwt, verifyPassword, verifyTelegramWebAppInitData } from './crypto.js';
import { TelegramBotClient } from './telegram/client.js';

export async function syncTelegramAvatarForUser(
  env: Env,
  userId: string,
  telegramId: string,
  explicitPhotoUrl?: string | null,
  forceRefresh = false
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT avatar_url, avatar_custom, telegram_avatar_file_id FROM users WHERE id = ? LIMIT 1`
    ).bind(userId).first<{ avatar_url: string | null; avatar_custom: number; telegram_avatar_file_id: string | null }>();
    if (!row) return null;
    if (row.avatar_custom === 1 && row.avatar_url && !forceRefresh) {
      return row.avatar_url;
    }

    let fileId = row.telegram_avatar_file_id;
    const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
    if (botToken && telegramId && (!fileId || forceRefresh)) {
      const bot = new TelegramBotClient(botToken);
      const photos = await bot.getUserProfilePhotos(telegramId, 1).catch(() => null);
      const sizes = photos?.photos?.[0];
      if (sizes && sizes.length > 0) {
        // Pick medium/large crisp size (usually index 1 or last)
        const chosen = sizes[Math.min(1, sizes.length - 1)] || sizes[sizes.length - 1]!;
        fileId = chosen.file_id;
      }
    }

    if (fileId) {
      const proxyPath = `/api/auth/avatar/${encodeURIComponent(userId)}`;
      await env.DB.prepare(
        `UPDATE users SET telegram_avatar_file_id = ?, avatar_url = CASE WHEN COALESCE(avatar_custom, 0) = 0 THEN ? ELSE avatar_url END WHERE id = ?`
      ).bind(fileId, proxyPath, userId).run().catch(() => {});
      return proxyPath;
    }

    if (explicitPhotoUrl && explicitPhotoUrl.startsWith('https://')) {
      await env.DB.prepare(
        `UPDATE users SET avatar_url = CASE WHEN COALESCE(avatar_custom, 0) = 0 THEN ? ELSE avatar_url END WHERE id = ?`
      ).bind(explicitPhotoUrl, userId).run().catch(() => {});
      return explicitPhotoUrl;
    }
    return row.avatar_url ?? null;
  } catch {
    return null;
  }
}

export type AppVariables = {
  user: AuthUser;
};

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const extKey = c.req.header('X-Dollarino-Extension-Key');
  if (extKey && extKey.startsWith('dlr_ext_')) {
    const extRow = await c.env.DB.prepare(
      'SELECT id, email, username, role, is_blocked, telegram_id FROM users WHERE extension_api_key = ? LIMIT 1'
    ).bind(extKey.trim()).first<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
    }>().catch(() => null);
    if (!extRow) return c.json({ error: 'Invalid Extension Key' }, 401);
    if (extRow.is_blocked) return c.json({ error: 'Account is suspended' }, 403);
    c.set('user', {
      id: extRow.id,
      email: extRow.email,
      username: extRow.username,
      role: (extRow.role as AuthUser['role']) || 'user',
      telegramId: extRow.telegram_id,
    });
    await next();
    return;
  }

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
     (user_id, strategy_key, margin_pct, max_leverage, max_open_positions, tp1_close_pct, tp2_close_pct, tp3_close_pct, auto_breakeven_on_tp1, move_sl_to_tp1_on_tp2, auto_scan_top, scan_scope, allow_auto_flip, webhook_secret)
     VALUES (?, 'dollarino_v01', 10, 10, 6, 50, 25, 25, 1, 1, 1, 'ALL_MARKET', 1, ?)`
  ).bind(userId, webhookSecret).run();

  await db.prepare(
    `INSERT OR IGNORE INTO exchange_connections
     (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
     VALUES (?, ?, 'paper', 'Paper Simulator (Live Quotes)', 1, 1, 'PAPER-MODE', '{}', 'OK')`
  ).bind(randomId('ex'), userId).run();
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{ email?: string; username?: string; password?: string; referralCode?: string }>().catch(
    () => ({} as { email?: string; username?: string; password?: string; referralCode?: string })
  );
  const email = (body.email ?? '').trim().toLowerCase();
  const username = (body.username ?? '').trim() || email.split('@')[0] || 'trader';
  const password = body.password ?? '';
  const referralCode = (body.referralCode ?? '').trim().toUpperCase();

  if (!email.includes('@') || password.length < 6) {
    return c.json({ error: 'Valid email and password (min 6 chars) are required' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  // First registered user on a fresh instance automatically receives owner role
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  const role = (countRow?.cnt ?? 0) === 0 ? 'owner' : 'user';

  const id = randomId('usr');
  const myReferralCode = `DLR-${id.slice(-6).toUpperCase()}`;
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, password_hash, role, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, email, username, passwordHash, role, myReferralCode, referralCode || null).run();

  await ensureUserDefaults(c.env.DB, id);

  if (referralCode) {
    const referrerId = await c.env.DB.prepare(
      `SELECT id FROM users WHERE COALESCE(referral_code, 'DLR-' || UPPER(SUBSTR(id, -6))) = ? OR ('DLR-' || UPPER(SUBSTR(id, -6))) = ? LIMIT 1`
    ).bind(referralCode, referralCode).first<{ id: string }>().catch(() => null);
    if (referrerId?.id && referrerId.id !== id) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, referral_code, reward_days, status) VALUES (?, ?, ?, ?, 7, 'REGISTERED')`
      ).bind(randomId('ref'), referrerId.id, id, referralCode).run();
    }
  }

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
  return c.json(
    {
      error: 'سرویس تست رایگان غیرفعال شده است. برای ورود به دلارینو لطفاً ثبت‌نام کرده و اشتراک خود را فعال کنید.',
      code: 'PAID_ONLY_PLATFORM',
    },
    403
  );
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'dollarino_session', { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/session', async (c) => {
  const customHeader = c.req.header('X-Dollarino-Token');
  const authHeader = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'dollarino_session');
  const token = customHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken);
  if (!token) return c.json({ authenticated: false, user: null });

  const payload = await verifyJwt(token, c.env.SESSION_JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string') {
    return c.json({ authenticated: false, user: null });
  }
  const full = await c.env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username, telegram_first_name, telegram_link_code,
            wallet_balance_usdt, avatar_url, COALESCE(avatar_custom, 0) as avatar_custom, phone_number, phone_verified,
            trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_verified,
            ui_mode, mobile_widgets_json, extension_api_key, created_at
     FROM users WHERE id = ?`
  ).bind(payload.sub).first<{ is_blocked?: number; id: string; telegram_id?: string | null; avatar_url?: string | null; avatar_custom?: number }>();
  if (!full || full.is_blocked) {
    return c.json({ authenticated: false, user: null });
  }
  if (full.telegram_id && !full.avatar_url && !full.avatar_custom) {
    const synced = await syncTelegramAvatarForUser(c.env, full.id, full.telegram_id);
    if (synced) full.avatar_url = synced;
  }
  return c.json({ authenticated: true, user: full });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const u = c.get('user');
  const full = await c.env.DB.prepare(
    `SELECT id, email, username, role, telegram_id, telegram_username, telegram_first_name, telegram_link_code,
            wallet_balance_usdt, avatar_url, COALESCE(avatar_custom, 0) as avatar_custom, phone_number, phone_verified,
            trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_verified,
            ui_mode, mobile_widgets_json, extension_api_key, created_at
     FROM users WHERE id = ?`
  ).bind(u.id).first<{ id: string; telegram_id?: string | null; avatar_url?: string | null; avatar_custom?: number }>();
  if (full?.telegram_id && !full.avatar_url && !full.avatar_custom) {
    const synced = await syncTelegramAvatarForUser(c.env, full.id, full.telegram_id);
    if (synced) full.avatar_url = synced;
  }
  return c.json({ user: full });
});

authRoutes.get('/avatar/:userId', async (c) => {
  const userId = decodeURIComponent(c.req.param('userId') || '').trim();
  if (!userId) return c.notFound();
  const row = await c.env.DB.prepare(
    `SELECT telegram_id, telegram_avatar_file_id FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first<{ telegram_id: string | null; telegram_avatar_file_id: string | null }>();
  if (!row || !row.telegram_id) return c.notFound();

  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return c.notFound();
  const bot = new TelegramBotClient(botToken);

  let fileId = row.telegram_avatar_file_id;
  if (!fileId) {
    const photos = await bot.getUserProfilePhotos(row.telegram_id, 1).catch(() => null);
    const sizes = photos?.photos?.[0];
    if (sizes && sizes.length > 0) {
      const chosen = sizes[Math.min(1, sizes.length - 1)] || sizes[sizes.length - 1]!;
      fileId = chosen.file_id;
      await c.env.DB.prepare(`UPDATE users SET telegram_avatar_file_id = ? WHERE id = ?`).bind(fileId, userId).run().catch(() => {});
    }
  }
  if (!fileId) return c.notFound();

  const tgFile = await bot.getFile(fileId).catch(() => null);
  if (!tgFile?.file_path) return c.notFound();

  const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${tgFile.file_path}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!imgRes || !imgRes.ok) return c.notFound();

  return new Response(imgRes.body, {
    status: 200,
    headers: {
      'Content-Type': imgRes.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

authRoutes.patch('/profile', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ username?: string; avatarUrl?: string | null; useTelegramAvatar?: boolean }>().catch(
    () => ({} as { username?: string; avatarUrl?: string | null; useTelegramAvatar?: boolean })
  );

  const updates: string[] = [];
  const binds: Array<string | number | null> = [];

  if (typeof body.username === 'string') {
    const cleanName = body.username.trim();
    if (cleanName.length < 2 || cleanName.length > 40) {
      return c.json({ error: 'نام کاربری باید بین ۲ تا ۴۰ کاراکتر باشد' }, 400);
    }
    updates.push('username = ?');
    binds.push(cleanName);
  }

  if (body.useTelegramAvatar) {
    updates.push('avatar_custom = 0');
    updates.push('avatar_url = NULL');
  } else if (body.avatarUrl !== undefined) {
    if (body.avatarUrl === null || body.avatarUrl === '') {
      updates.push('avatar_url = NULL');
      updates.push('avatar_custom = 0');
    } else if (typeof body.avatarUrl === 'string') {
      const val = body.avatarUrl.trim();
      if (!val.startsWith('data:image/') && !val.startsWith('https://') && !val.startsWith('/api/auth/avatar/')) {
        return c.json({ error: 'فرمت تصویر نامعتبر است' }, 400);
      }
      if (val.length > 350_000) {
        return c.json({ error: 'حجم تصویر پروفایل بیش از حد مجاز است (حداکثر ۲۵۰ کیلوبایت)' }, 400);
      }
      updates.push('avatar_url = ?');
      binds.push(val);
      updates.push('avatar_custom = 1');
    }
  }

  if (updates.length > 0) {
    binds.push(u.id);
    await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  }

  if (body.useTelegramAvatar && u.telegramId) {
    await syncTelegramAvatarForUser(c.env, u.id, u.telegramId, undefined, true);
  }

  const full = await c.env.DB.prepare(
    `SELECT id, email, username, role, telegram_id, telegram_username, telegram_first_name, telegram_link_code,
            wallet_balance_usdt, avatar_url, COALESCE(avatar_custom, 0) as avatar_custom, created_at
     FROM users WHERE id = ?`
  ).bind(u.id).first();

  return c.json({ ok: true, user: full });
});

authRoutes.post('/telegram-link-code', requireAuth, async (c) => {
  const u = c.get('user');
  const code = `LINK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await c.env.DB.prepare(
    `UPDATE users SET telegram_link_code = ?, telegram_link_expires_at = ? WHERE id = ?`
  ).bind(code, expiresAt, u.id).run();

  return c.json({
    code,
    expiresAt,
    command: `/link ${code}`,
    deepLinkUrl: `https://t.me/Dollarino_bot?start=${code}`,
  });
});

authRoutes.post('/telegram/merge-code', requireAuth, async (c) => {
  const u = c.get('user');
  if (!u.telegramId) {
    return c.json({ error: 'این گزینه مخصوص کاربرانی است که از داخل مینی‌اپ تلگرام وارد شده‌اند.' }, 400);
  }
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const cleanCode = (body.code ?? '').trim().replace(/^\/link\s+/i, '').toUpperCase();
  if (!cleanCode) return c.json({ error: 'کد اتصال را وارد کنید (مثلاً LINK-ABC123).' }, 400);

  const webUser = await c.env.DB.prepare(
    `SELECT id, email, username, role, telegram_link_expires_at FROM users WHERE telegram_link_code = ?`
  ).bind(cleanCode).first<{ id: string; email: string; username: string; role: string; telegram_link_expires_at: string | null }>();

  if (!webUser) {
    return c.json({ error: 'کد اتصال نامعتبر یا یافت نشد.' }, 404);
  }
  if (webUser.telegram_link_expires_at && Date.parse(webUser.telegram_link_expires_at) < Date.now()) {
    return c.json({ error: 'اعتبار این کد منقضی شده است؛ لطفاً از پنل وب کد جدید بسازید.' }, 400);
  }

  if (webUser.id !== u.id) {
    const currentTgRow = await c.env.DB.prepare(
      `SELECT telegram_id, telegram_username, telegram_first_name FROM users WHERE id = ?`
    ).bind(u.id).first<{ telegram_id: string | null; telegram_username: string | null; telegram_first_name: string | null }>();

    await c.env.DB.prepare(`UPDATE users SET telegram_id = NULL WHERE id = ?`).bind(u.id).run();
    await c.env.DB.prepare(
      `UPDATE users SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?, telegram_link_code = NULL, telegram_link_expires_at = NULL WHERE id = ?`
    ).bind(
      currentTgRow?.telegram_id ?? u.telegramId,
      currentTgRow?.telegram_username ?? null,
      currentTgRow?.telegram_first_name ?? null,
      webUser.id
    ).run();
  }

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: webUser.id, email: webUser.email, role: webUser.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    ok: true,
    token,
    user: {
      id: webUser.id,
      email: webUser.email,
      username: webUser.username,
      role: webUser.role,
      telegram_id: u.telegramId,
    },
  });
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

authRoutes.post('/upgrade-demo', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ email?: string; username?: string; password?: string }>().catch(() => ({} as { email?: string; username?: string; password?: string }));
  const email = (body.email ?? '').trim().toLowerCase();
  const username = (body.username ?? '').trim() || email.split('@')[0] || u.username;
  const password = body.password ?? '';

  if (!email.includes('@') || email.endsWith('@dollarino.app') || password.length < 6) {
    return c.json({ error: 'Valid personal email and password (min 6 chars) are required' }, 400);
  }
  const taken = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, u.id).first();
  if (taken) return c.json({ error: 'Email is already registered' }, 409);

  const hash = await hashPassword(password);
  await c.env.DB.prepare('UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?')
    .bind(email, username, hash, u.id)
    .run();

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: u.id, email, role: u.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    token,
    user: { id: u.id, email, username, role: u.role, telegram_id: u.telegramId },
  });
});

// Telegram Mini App cryptographic initData authentication (HMAC-SHA256)
authRoutes.post('/telegram-webapp', async (c) => {
  const body = await c.req.json<{ initData?: string }>().catch(() => ({} as { initData?: string }));
  const initData = (body.initData ?? '').trim();
  const botToken = c.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured on server' }, 503);
  }
  const verified = await verifyTelegramWebAppInitData(initData, botToken);
  if (!verified.valid || !verified.user) {
    return c.json({ error: verified.error || 'Invalid Telegram initData signature' }, 401);
  }

  const tgId = String(verified.user.id);
  const ownerId = c.env.OWNER_TELEGRAM_ID || '944021185';
  let row = await c.env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_id, avatar_url FROM users WHERE telegram_id = ?`
  ).bind(tgId).first<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    avatar_url?: string | null;
  }>();

  if (!row) {
    const id = randomId('usr');
    const role = tgId === ownerId ? 'owner' : 'user';
    const username = verified.user.username || verified.user.first_name || `tg_${tgId}`;
    const email = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('tg_pwd'));

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, telegram_first_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, username, pwd, role, tgId, verified.user.username ?? null, verified.user.first_name ?? null).run();

    await ensureUserDefaults(c.env.DB, id);
    row = { id, email, username, role, is_blocked: 0, telegram_id: tgId, avatar_url: null };
  }

  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  const syncedAvatar = await syncTelegramAvatarForUser(c.env, row.id, tgId, verified.user.photo_url);
  if (syncedAvatar && !row.avatar_url) {
    row.avatar_url = syncedAvatar;
  }
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
      avatar_url: row.avatar_url ?? null,
    },
  });
});

// One-click Magic Login from @Dollarino_bot (`/?tg_login=...`)
authRoutes.post('/telegram-magic-login', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const magic = (body.token ?? '').trim();
  if (!magic) {
    return c.json({ error: 'Magic login token is required' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_id, avatar_url, web_magic_expires_at
     FROM users WHERE web_magic_token = ? LIMIT 1`
  ).bind(magic).first<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    avatar_url?: string | null;
    web_magic_expires_at: string | null;
  }>();

  if (!row) {
    return c.json({ error: 'لینک ورود نامعتبر است یا قبلاً استفاده شده است' }, 401);
  }
  if (row.web_magic_expires_at && Date.parse(row.web_magic_expires_at) < Date.now()) {
    return c.json({ error: 'لینک ورود منقضی شده است؛ لطفاً دوباره از ربات تلگرام درخواست دهید' }, 401);
  }
  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  await c.env.DB.prepare(
    `UPDATE users SET web_magic_token = NULL, web_magic_expires_at = NULL, last_active_at = datetime('now') WHERE id = ?`
  ).bind(row.id).run();
  if (row.telegram_id && !row.avatar_url) {
    const synced = await syncTelegramAvatarForUser(c.env, row.id, row.telegram_id);
    if (synced) row.avatar_url = synced;
  }

  const isHttps = isHttpsRequest(c);
  const jwt = await signJwt({ sub: row.id, email: row.email, role: row.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', jwt, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({
    token: jwt,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      telegram_id: row.telegram_id,
      avatar_url: row.avatar_url ?? null,
    },
  });
});

// Generate or retrieve personal Browser Extension & Mobile Shortcut API key
authRoutes.post('/extension-key', requireAuth, async (c) => {
  const u = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { rotate?: boolean };
  const row = await c.env.DB.prepare(`SELECT extension_api_key FROM users WHERE id = ?`)
    .bind(u.id)
    .first<{ extension_api_key: string | null }>();
  let key = row?.extension_api_key || null;
  if (!key || body.rotate) {
    key = `dlr_ext_${randomId('').replace(/_/g, '')}${Math.random().toString(36).slice(2, 10)}`;
    await c.env.DB.prepare(`UPDATE users SET extension_api_key = ? WHERE id = ?`).bind(key, u.id).run();
  }
  return c.json({ ok: true, extensionApiKey: key });
});

// Sync user UI mode (simple / pro) & customized Mobile PWA widgets across devices
authRoutes.patch('/ui-preferences', requireAuth, async (c) => {
  const u = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    uiMode?: 'simple' | 'pro';
    mobileWidgets?: string[];
  };
  if (body.uiMode && (body.uiMode === 'simple' || body.uiMode === 'pro')) {
    await c.env.DB.prepare(`UPDATE users SET ui_mode = ? WHERE id = ?`).bind(body.uiMode, u.id).run();
  }
  if (Array.isArray(body.mobileWidgets)) {
    const clean = body.mobileWidgets.slice(0, 12).map((x) => String(x).slice(0, 40));
    await c.env.DB.prepare(`UPDATE users SET mobile_widgets_json = ? WHERE id = ?`)
      .bind(JSON.stringify(clean), u.id)
      .run();
  }
  return c.json({ ok: true });
});
