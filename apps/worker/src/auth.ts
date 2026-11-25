import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { computeDynamicRecommendedSettings } from '@dollarino/core';
import type { AuthUser, Env } from './env.js';
import {
  buildTotpOtpAuthUri,
  generateReferralCode,
  generateTotpSecret,
  hashPassword,
  randomId,
  signJwt,
  verifyJwt,
  verifyPassword,
  verifyTelegramLoginWidget,
  verifyTelegramWebAppInitData,
  verifyTotpCode,
} from './crypto.js';
import { buildClientFingerprints, enforceRateLimit, getClientIp } from './security.js';
import { TelegramBotClient } from './telegram/client.js';
import { resolveTelegramBotToken } from './telegram/token.js';

const USER_PROFILE_COLUMNS = `
  id, email, username, display_name, auth_provider, role, is_blocked, telegram_id, telegram_username, telegram_first_name, telegram_link_code,
  wallet_balance_usdt, avatar_url, COALESCE(avatar_custom, 0) as avatar_custom, phone_number, phone_verified,
  COALESCE(has_custom_password, 0) as has_custom_password, COALESCE(profile_completed, 1) as profile_completed,
  COALESCE(totp_enabled, 0) as totp_enabled, display_bio,
  COALESCE(referral_code, 'DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) as referral_code,
  trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified,
  ui_mode, mobile_widgets_json, extension_api_key, risk_terms_accepted_at, created_at
`;

function verifyWalletPersonalSign(message: string, signatureHex: string, expectedEvmAddress: string): boolean {
  if (!message || !/^0x[a-fA-F0-9]{40}$/.test(expectedEvmAddress.trim())) return false;
  const clean = signatureHex.trim().replace(/^0x/i, '');
  if (!clean || clean.length !== 130 || !/^[0-9a-fA-F]+$/.test(clean)) return false;
  const rawSig = new Uint8Array(65);
  for (let i = 0; i < 65; i++) rawSig[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);

  const r = rawSig.slice(0, 32);
  const s = rawSig.slice(32, 64);
  const vRaw = rawSig[64]!;
  let recovery = -1;
  if (vRaw === 27 || vRaw === 0) recovery = 0;
  else if (vRaw === 28 || vRaw === 1) recovery = 1;
  else if (vRaw >= 35) recovery = (vRaw - 35) % 2;
  if (recovery !== 0 && recovery !== 1) return false;

  try {
    const recoveredSig = new Uint8Array(65);
    recoveredSig[0] = recovery;
    recoveredSig.set(r, 1);
    recoveredSig.set(s, 33);
    const enc = new TextEncoder();
    const msgBytes = enc.encode(message);
    const prefixBytes = enc.encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
    const prefixed = new Uint8Array(prefixBytes.length + msgBytes.length);
    prefixed.set(prefixBytes, 0);
    prefixed.set(msgBytes, prefixBytes.length);
    const digest = keccak_256(prefixed);
    const pubCompressed = secp256k1.recoverPublicKey(recoveredSig, digest, { prehash: false });
    const pubUncompressed = secp256k1.Point.fromBytes(pubCompressed).toBytes(false);
    const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(-20);
    const recoveredAddress = '0x' + Array.from(addrBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return recoveredAddress.toLowerCase() === expectedEvmAddress.trim().toLowerCase();
  } catch {
    return false;
  }
}

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
    const botToken = await resolveTelegramBotToken(env);
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
  if (!payload || typeof payload.sub !== 'string' || payload.purpose === '2fa_challenge') {
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

async function resolveGoogleOAuthConfig(env: Env): Promise<{ clientId: string; clientSecret: string }> {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM system_settings WHERE key IN ('google_client_id', 'google_client_secret')`
  )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));
  const map = new Map(rows.results.map((r) => [r.key, (r.value || '').trim()]));
  return {
    clientId: (env.GOOGLE_CLIENT_ID || map.get('google_client_id') || '').trim(),
    clientSecret: (env.GOOGLE_CLIENT_SECRET || map.get('google_client_secret') || '').trim(),
  };
}

async function attachReferralIfProvided(
  env: Env,
  newUserId: string,
  referralCodeRaw: string | undefined,
  clientIp: string,
  fp: { ipHash: string; uaHash: string }
) {
  const referralCode = (referralCodeRaw ?? '').trim().toUpperCase();
  if (!referralCode) return;
  const referrer = await env.DB.prepare(
    `SELECT id, signup_ip_hash FROM users
     WHERE UPPER(COALESCE(referral_code, '')) = ?
        OR ('DLR-' || UPPER(SUBSTR(id, -6))) = ?
        OR ('DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) = ?
     LIMIT 1`
  )
    .bind(referralCode, referralCode, referralCode)
    .first<{ id: string; signup_ip_hash: string | null }>()
    .catch(() => null);
  if (!referrer?.id || referrer.id === newUserId) return;

  let fraudFlag = 0;
  let fraudReason: string | null = null;
  if (clientIp !== 'unknown' && referrer.signup_ip_hash && referrer.signup_ip_hash === fp.ipHash) {
    fraudFlag = 1;
    fraudReason = 'تطابق IP ثبت‌نامی با معرف (مشکوک به خود-دعوتی)';
  } else if (clientIp !== 'unknown') {
    const recentSameIp = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM users u
       JOIN referrals r ON r.referred_user_id = u.id
       WHERE r.referrer_user_id = ? AND u.signup_ip_hash = ? AND u.created_at >= datetime('now', '-24 hours')`
    )
      .bind(referrer.id, fp.ipHash)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 }));
    if ((recentSameIp?.cnt ?? 0) >= 2) {
      fraudFlag = 1;
      fraudReason = 'ثبت‌نام مکرر از یک آی‌پی برای یک کد معرف در ۲۴ ساعت اخیر';
    }
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, referral_code, reward_days, status, fraud_flag, fraud_reason)
     VALUES (?, ?, ?, ?, 7, ?, ?, ?)`
  )
    .bind(
      randomId('ref'),
      referrer.id,
      newUserId,
      referralCode,
      fraudFlag ? 'FLAGGED_DUPLICATE' : 'REGISTERED',
      fraudFlag,
      fraudReason
    )
    .run()
    .catch(() => {});
}

async function issueAuthSessionOr2fa(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  userRow: { id: string; email: string; username: string; role: string; telegram_id: string | null; display_name?: string | null; totp_enabled?: number; totp_secret?: string | null }
) {
  if (Number(userRow.totp_enabled ?? 0) === 1 && userRow.totp_secret) {
    const tempToken = await signJwt(
      {
        sub: userRow.id,
        email: userRow.email,
        role: userRow.role,
        purpose: '2fa_challenge',
        issuedAt: Date.now(),
      },
      c.env.SESSION_JWT_SECRET
    );
    return {
      requires2fa: true as const,
      tempToken,
      challengeToken: tempToken,
      username: userRow.username,
      displayName: userRow.display_name || userRow.username,
    };
  }

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: userRow.id, email: userRow.email, role: userRow.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`).bind(userRow.id).first();
  return {
    requires2fa: false as const,
    token,
    user: fullUser || {
      id: userRow.id,
      email: userRow.email,
      username: userRow.username,
      role: userRow.role,
      telegram_id: userRow.telegram_id,
    },
  };
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
  const rec = computeDynamicRecommendedSettings(10_000, 'balanced');
  await db.prepare(
    `INSERT OR IGNORE INTO bot_configs
     (user_id, strategy_key, margin_pct, max_leverage, max_open_positions, daily_max_loss_pct, trailing_stop_pct, tp1_close_pct, tp2_close_pct, tp3_close_pct, auto_breakeven_on_tp1, move_sl_to_tp1_on_tp2, auto_scan_top, scan_scope, allow_auto_flip, bot_budget_mode, bot_budget_usd, bot_budget_pct, trading_mode_selected, webhook_secret)
     VALUES (?, 'dollarino_v01', ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'ALL_MARKET', 1, 'FULL_BALANCE', 0, 100, 0, ?)`
  ).bind(
    userId,
    rec.marginPct,
    rec.maxLeverage,
    rec.maxOpenPositions,
    rec.dailyMaxLossPct,
    rec.trailingStopPct,
    rec.tp1ClosePct,
    rec.tp2ClosePct,
    rec.tp3ClosePct,
    webhookSecret
  ).run();

  await db.prepare(
    `INSERT OR IGNORE INTO exchange_connections
     (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
     VALUES (?, ?, 'paper', 'Paper Simulator (Live Quotes)', 1, 1, 'PAPER-MODE', '{}', 'OK')`
  ).bind(randomId('ex'), userId).run();
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

authRoutes.post('/register', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `reg:${clientIp}`, 10, 600);
  if (!rl.allowed) {
    return c.json(
      { error: `تعداد درخواست ثبت‌نام زیاد است. لطفاً ${rl.retryAfterSec} ثانیه دیگر تلاش کنید.` },
      429
    );
  }

  const tgOnlyRows = await c.env.DB.prepare(
    `SELECT key, value FROM system_settings WHERE key IN ('telegram_only_signup', 'allow_direct_email_signup')`
  ).all<{ key: string; value: string }>().catch(() => ({ results: [] as Array<{ key: string; value: string }> }));
  const signupCfg: Record<string, string> = {};
  for (const r of tgOnlyRows.results ?? []) signupCfg[r.key] = r.value;
  const telegramOnlySignup = (signupCfg.telegram_only_signup ?? 'true') !== 'false' || signupCfg.allow_direct_email_signup === 'false';
  if (telegramOnlySignup) {
    return c.json(
      {
        error: 'ثبت‌نام مستقیم با ایمیل غیرفعال شده است. برای جلوگیری از حساب‌های جعلی، ثبت‌نام و احراز هویت فقط از طریق ربات تلگرام @Dollarino_bot و اشتراک‌گذاری شماره تماس اکانت تلگرام انجام می‌شود.',
        code: 'TELEGRAM_SIGNUP_REQUIRED',
        botUrl: 'https://t.me/Dollarino_bot?start=web_auth',
      },
      403
    );
  }

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

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').bind(email, username).first();
  if (existing) return c.json({ error: 'Email or username already registered' }, 409);

  // First registered user on a fresh instance automatically receives owner role
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  const role = (countRow?.cnt ?? 0) === 0 ? 'owner' : 'user';

  const id = randomId('usr');
  const myReferralCode = generateReferralCode();
  const passwordHash = await hashPassword(password);
  const fp = await buildClientFingerprints(c.req.raw, c.env);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, role, auth_provider, profile_completed, referral_code, referred_by, signup_ip_hash, signup_ua_hash)
     VALUES (?, ?, ?, ?, ?, ?, 'email', 1, ?, ?, ?, ?)`
  ).bind(id, email, username, username, passwordHash, role, myReferralCode, referralCode || null, fp.ipHash, fp.uaHash).run();

  await ensureUserDefaults(c.env.DB, id);

  if (referralCode) {
    const normalizedRef = referralCode.trim().toUpperCase();
    const referrer = await c.env.DB.prepare(
      `SELECT id, signup_ip_hash FROM users
       WHERE UPPER(COALESCE(referral_code, '')) = ?
          OR ('DLR-' || UPPER(SUBSTR(id, -6))) = ?
          OR ('DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) = ?
       LIMIT 1`
    ).bind(normalizedRef, normalizedRef, normalizedRef).first<{ id: string; signup_ip_hash: string | null }>().catch(() => null);
    if (referrer?.id && referrer.id !== id) {
      let fraudFlag = 0;
      let fraudReason: string | null = null;
      if (clientIp !== 'unknown' && referrer.signup_ip_hash && referrer.signup_ip_hash === fp.ipHash) {
        fraudFlag = 1;
        fraudReason = 'تطابق IP ثبت‌نامی با معرف (مشکوک به خود-دعوتی)';
      } else if (clientIp !== 'unknown') {
        const recentSameIp = await c.env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM users u
           JOIN referrals r ON r.referred_user_id = u.id
           WHERE r.referrer_user_id = ? AND u.signup_ip_hash = ? AND u.created_at >= datetime('now', '-24 hours')`
        ).bind(referrer.id, fp.ipHash).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
        if ((recentSameIp?.cnt ?? 0) >= 2) {
          fraudFlag = 1;
          fraudReason = 'ثبت‌نام مکرر از یک آی‌پی برای یک کد معرف در ۲۴ ساعت اخیر';
        }
      }

      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, referral_code, reward_days, status, fraud_flag, fraud_reason)
         VALUES (?, ?, ?, ?, 7, ?, ?, ?)`
      ).bind(
        randomId('ref'),
        referrer.id,
        id,
        referralCode,
        fraudFlag ? 'FLAGGED_DUPLICATE' : 'REGISTERED',
        fraudFlag,
        fraudReason
      ).run();
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
    user: {
      id,
      email,
      username,
      display_name: username,
      role,
      auth_provider: 'email',
      profile_completed: 1,
      totp_enabled: 0,
      telegram_id: null,
      referral_code: myReferralCode,
    },
  }, 201);
});

authRoutes.post('/bootstrap-owner', async (c) => {
  const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) > 0) {
    return c.json({ error: 'Instance already initialized with an owner account.' }, 403);
  }
  const body = await c.req.json<{
    email?: string;
    username?: string;
    password?: string;
    bootstrapSecret?: string;
  }>().catch(() => ({} as { email?: string; username?: string; password?: string; bootstrapSecret?: string }));

  const providedSecret = (body.bootstrapSecret ?? '').trim();
  if (!providedSecret || (providedSecret !== c.env.SESSION_JWT_SECRET && providedSecret !== c.env.MASTER_ENCRYPTION_KEY)) {
    return c.json({ error: 'Invalid bootstrap secret' }, 403);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const username = (body.username ?? 'owner').trim();
  const password = body.password ?? '';
  if (!email.includes('@') || password.length < 8) {
    return c.json({ error: 'Valid email and strong password (min 8 chars) are required' }, 400);
  }

  const id = randomId('usr');
  const myReferralCode = generateReferralCode();
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, password_hash, role, referral_code)
     VALUES (?, ?, ?, ?, 'owner', ?)`
  ).bind(id, email, username, passwordHash, myReferralCode).run();
  await ensureUserDefaults(c.env.DB, id);

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: id, email, role: 'owner' }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return c.json({ token, user: { id, email, username, role: 'owner', telegram_id: null } }, 201);
});

authRoutes.get('/providers', async (c) => {
  const google = await resolveGoogleOAuthConfig(c.env);
  const gEnabled = Boolean(google.clientId && google.clientSecret);
  return c.json({
    ok: true,
    walletAuthEnabled: true,
    telegramAuthEnabled: true,
    telegramBotUsername: 'Dollarino_bot',
    googleEnabled: gEnabled,
    googleConfigured: gEnabled,
    googleClientId: google.clientId || null,
  });
});

authRoutes.post('/login', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `login:${clientIp}`, 20, 300);
  if (!rl.allowed) {
    return c.json(
      { error: `تلاش بیش از حد برای ورود. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` },
      429
    );
  }

  const body = await c.req
    .json<{ email?: string; identifier?: string; username?: string; password?: string }>()
    .catch(() => ({} as { email?: string; identifier?: string; username?: string; password?: string }));
  const identifier = (body.identifier ?? body.email ?? body.username ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !password) {
    return c.json({ error: 'نام کاربری یا ایمیل و رمز عبور الزامی است' }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, password_hash, role, is_blocked, telegram_id,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret
     FROM users
     WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)
     LIMIT 1`
  )
    .bind(identifier, identifier)
    .first<{
      id: string;
      email: string;
      username: string;
      display_name: string | null;
      password_hash: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      totp_enabled: number;
      totp_secret: string | null;
    }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'نام کاربری/ایمیل یا رمز عبور نامعتبر است' }, 401);
  }
  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  const authRes = await issueAuthSessionOr2fa(c, row);
  return c.json(authRes);
});

authRoutes.post('/quick-demo', async (c) => {
  return c.json(
    {
      error: 'برای ورود به دلارینو از یکی از ۳ روش امن (کیف‌پول، تلگرام یا گوگل) استفاده کنید.',
      code: 'AUTH_METHOD_REQUIRED',
    },
    403
  );
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'dollarino_session', { path: '/' });
  return c.json({ ok: true });
});

authRoutes.get('/session', async (c) => {
  const extKey = c.req.header('X-Dollarino-Extension-Key')?.trim();
  let userId: string | null = null;

  if (extKey && extKey.startsWith('dlr_ext_')) {
    const extRow = await c.env.DB.prepare('SELECT id, is_blocked FROM users WHERE extension_api_key = ? LIMIT 1')
      .bind(extKey)
      .first<{ id: string; is_blocked?: number }>()
      .catch(() => null);
    if (!extRow || extRow.is_blocked) {
      return c.json({ authenticated: false, user: null });
    }
    userId = extRow.id;
  } else {
    const customHeader = c.req.header('X-Dollarino-Token');
    const authHeader = c.req.header('Authorization');
    const cookieToken = getCookie(c, 'dollarino_session');
    const token = customHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken);
    if (!token) return c.json({ authenticated: false, user: null });

    const payload = await verifyJwt(token, c.env.SESSION_JWT_SECRET);
    if (!payload || typeof payload.sub !== 'string' || payload.purpose === '2fa_challenge') {
      return c.json({ authenticated: false, user: null });
    }
    userId = payload.sub;
  }

  const full = await c.env.DB.prepare(
    `SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`
  ).bind(userId).first<{ is_blocked?: number; id: string; telegram_id?: string | null; avatar_url?: string | null; avatar_custom?: number }>();
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
    `SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`
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

  const botToken = await resolveTelegramBotToken(c.env);
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
  const body = await c.req
    .json<{
      username?: string;
      email?: string;
      displayBio?: string | null;
      avatarUrl?: string | null;
      useTelegramAvatar?: boolean;
      currentPassword?: string;
      newPassword?: string;
      phoneNumber?: string;
      phone_number?: string;
    }>()
    .catch(
      () =>
        ({} as {
          username?: string;
          email?: string;
          displayBio?: string | null;
          avatarUrl?: string | null;
          useTelegramAvatar?: boolean;
          currentPassword?: string;
          newPassword?: string;
          phoneNumber?: string;
          phone_number?: string;
        })
    );

  // Security rule: Verified Telegram phone number can NEVER be altered by the user from profile panel
  if (body.phoneNumber !== undefined || body.phone_number !== undefined) {
    return c.json(
      { error: 'شماره تماس احراز هویت‌شده از طریق تلگرام قفل است و قابل تغییر نمی‌باشد.' },
      403
    );
  }

  const currentRow = await c.env.DB.prepare(
    `SELECT email, password_hash, COALESCE(has_custom_password, 0) as has_custom_password FROM users WHERE id = ?`
  )
    .bind(u.id)
    .first<{ email: string; password_hash: string; has_custom_password: number }>();
  if (!currentRow) return c.json({ error: 'User not found' }, 404);

  const updates: string[] = [];
  const binds: Array<string | number | null> = [];
  let nextEmailForToken = currentRow.email;

  if (typeof body.username === 'string') {
    const cleanName = body.username.trim();
    if (cleanName.length < 2 || cleanName.length > 40) {
      return c.json({ error: 'نام کاربری باید بین ۲ تا ۴۰ کاراکتر باشد' }, 400);
    }
    updates.push('username = ?');
    binds.push(cleanName);
  }

  if (typeof body.email === 'string') {
    const cleanEmail = body.email.trim().toLowerCase();
    if (cleanEmail !== currentRow.email) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail);
      if (!emailOk || cleanEmail.endsWith('.local') || cleanEmail.endsWith('@dollarino.app')) {
        return c.json({ error: 'لطفاً یک ایمیل معتبر و شخصی وارد کنید' }, 400);
      }
      const taken = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ? LIMIT 1')
        .bind(cleanEmail, u.id)
        .first();
      if (taken) {
        return c.json({ error: 'این ایمیل قبلاً برای حساب دیگری ثبت شده است' }, 409);
      }
      updates.push('email = ?');
      binds.push(cleanEmail);
      nextEmailForToken = cleanEmail;
    }
  }

  if (body.displayBio !== undefined) {
    const cleanBio = body.displayBio === null ? null : String(body.displayBio).trim().slice(0, 160);
    updates.push('display_bio = ?');
    binds.push(cleanBio || null);
  }

  if (typeof body.newPassword === 'string' && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      return c.json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' }, 400);
    }
    const alreadyHadCustomPassword =
      currentRow.has_custom_password === 1 && !currentRow.email.endsWith('@telegram.dollarino.local');
    if (alreadyHadCustomPassword) {
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, currentRow.password_hash))) {
        return c.json({ error: 'رمز عبور فعلی صحیح نیست' }, 401);
      }
    }
    const nextHash = await hashPassword(body.newPassword);
    updates.push('password_hash = ?');
    binds.push(nextHash);
    updates.push('has_custom_password = 1');
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
    `SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`
  ).bind(u.id).first();

  let refreshedToken: string | undefined;
  if (nextEmailForToken !== currentRow.email) {
    const isHttps = isHttpsRequest(c);
    refreshedToken = await signJwt({ sub: u.id, email: nextEmailForToken, role: u.role }, c.env.SESSION_JWT_SECRET);
    setCookie(c, 'dollarino_session', refreshedToken, {
      httpOnly: true,
      sameSite: isHttps ? 'None' : 'Lax',
      secure: isHttps,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return c.json({ ok: true, user: full, token: refreshedToken });
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
  const botToken = await resolveTelegramBotToken(c.env);
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
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id, avatar_url, phone_verified,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret
     FROM users WHERE telegram_id = ?`
  ).bind(tgId).first<{
    id: string;
    email: string;
    username: string;
    display_name: string | null;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    avatar_url?: string | null;
    phone_verified?: number;
    totp_enabled: number;
    totp_secret: string | null;
  }>();

  if (!row) {
    const id = randomId('usr');
    const role = tgId === ownerId ? 'owner' : 'user';
    const username = verified.user.username || verified.user.first_name || `tg_${tgId}`;
    const email = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('tg_pwd'));
    const myRefCode = generateReferralCode();

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, username, display_name, auth_provider, password_hash, role, telegram_id, telegram_username, telegram_first_name, phone_verified, profile_completed, referral_code)
       VALUES (?, ?, ?, ?, 'telegram', ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(id, email, username, verified.user.first_name || username, pwd, role, tgId, verified.user.username ?? null, verified.user.first_name ?? null, tgId === ownerId ? 1 : 0, myRefCode).run();

    await ensureUserDefaults(c.env.DB, id);
    row = { id, email, username, display_name: verified.user.first_name || username, role, is_blocked: 0, telegram_id: tgId, avatar_url: null, phone_verified: tgId === ownerId ? 1 : 0, totp_enabled: 0, totp_secret: null };
  }

  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  const kycSettingRow = await c.env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'require_telegram_phone_kyc' LIMIT 1`
  ).first<{ value: string }>().catch(() => null);
  const kycRequired = (kycSettingRow?.value ?? 'true') !== 'false';

  if (kycRequired && Number(row.phone_verified ?? 0) !== 1 && row.role !== 'owner' && row.role !== 'admin') {
    return c.json(
      {
        error: 'برای فعال‌سازی حساب و ورود به مینی‌اپ، ابتدا داخل ربات @Dollarino_bot شماره تماس اکانت تلگرام خود را به اشتراک بگذارید.',
        code: 'PHONE_KYC_REQUIRED',
        botUrl: 'https://t.me/Dollarino_bot?start=web_auth',
      },
      403
    );
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  const syncedAvatar = await syncTelegramAvatarForUser(c.env, row.id, tgId, verified.user.photo_url);
  if (syncedAvatar && !row.avatar_url) {
    row.avatar_url = syncedAvatar;
  }
  const authRes = await issueAuthSessionOr2fa(c, row);
  return c.json(authRes);
});

// One-click Magic Login from @Dollarino_bot (`/?tg_login=...`)
authRoutes.post('/telegram-magic-login', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const magic = (body.token ?? '').trim();
  if (!magic) {
    return c.json({ error: 'Magic login token is required' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id, avatar_url, web_magic_expires_at,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret
     FROM users WHERE web_magic_token = ? LIMIT 1`
  ).bind(magic).first<{
    id: string;
    email: string;
    username: string;
    display_name: string | null;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    avatar_url?: string | null;
    web_magic_expires_at: string | null;
    totp_enabled: number;
    totp_secret: string | null;
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

  await ensureUserDefaults(c.env.DB, row.id);
  await c.env.DB.prepare(
    `UPDATE users SET last_active_at = datetime('now') WHERE id = ?`
  ).bind(row.id).run();
  if (row.telegram_id && !row.avatar_url) {
    const synced = await syncTelegramAvatarForUser(c.env, row.id, row.telegram_id);
    if (synced) row.avatar_url = synced;
  }

  const authRes = await issueAuthSessionOr2fa(c, row);
  return c.json(authRes);
});

// Telegram Login Widget verification (BotFather -> Login Widget) for phone-verified users
authRoutes.post('/telegram-login-widget', async (c) => {
  const botToken = await resolveTelegramBotToken(c.env);
  if (!botToken) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured on server' }, 503);
  }
  const payload = await c.req.json<Record<string, string | number | undefined>>().catch(
    () => ({} as Record<string, string | number | undefined>)
  );
  const verified = await verifyTelegramLoginWidget(payload, botToken);
  if (!verified.valid || !verified.user) {
    return c.json({ error: verified.error || 'Invalid Telegram login signature' }, 401);
  }

  const tgId = String(verified.user.id);
  const row = await c.env.DB.prepare(
    `SELECT ${USER_PROFILE_COLUMNS}, totp_secret FROM users WHERE telegram_id = ? LIMIT 1`
  ).bind(tgId).first<{
    id: string;
    email: string;
    username: string;
    display_name?: string | null;
    role: string;
    is_blocked: number;
    phone_verified: number;
    telegram_id: string | null;
    avatar_url?: string | null;
    totp_enabled?: number;
    totp_secret?: string | null;
  }>();

  const kycRow = await c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'require_telegram_phone_kyc' LIMIT 1`)
    .first<{ value: string }>()
    .catch(() => null);
  const kycRequired = (kycRow?.value ?? 'true') !== 'false';

  if (!row || (kycRequired && Number(row.phone_verified || 0) !== 1 && row.role !== 'owner' && row.role !== 'admin')) {
    return c.json(
      {
        error: 'برای اولین ورود و احراز هویت شماره تماس، ابتدا ربات @Dollarino_bot را استارت کرده و شماره تماس اکانت خود را به اشتراک بگذارید.',
        code: 'PHONE_KYC_REQUIRED',
        botUrl: 'https://t.me/Dollarino_bot?start=web_auth',
      },
      403
    );
  }
  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  await c.env.DB.prepare(`UPDATE users SET last_active_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  if (verified.user.photo_url && !row.avatar_url) {
    const synced = await syncTelegramAvatarForUser(c.env, row.id, tgId, verified.user.photo_url);
    if (synced) row.avatar_url = synced;
  }

  const authRes = await issueAuthSessionOr2fa(c, {
    id: row.id,
    email: row.email,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    telegram_id: row.telegram_id,
    totp_enabled: row.totp_enabled,
    totp_secret: row.totp_secret,
  });
  return c.json(authRes);
});

// Generate or retrieve personal Browser Extension & Mobile Shortcut API key
authRoutes.post('/extension-key', requireAuth, async (c) => {
  const u = c.get('user');
  const rl = await enforceRateLimit(c.env, `extkey:${u.id}`, 15, 300);
  if (!rl.allowed) {
    return c.json({ error: 'درخواست بیش از حد برای کلید اکستنشن. چند دقیقه دیگر تلاش کنید.' }, 429);
  }
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

// Permanently delete current user account and purge all associated data
authRoutes.delete('/account', requireAuth, async (c) => {
  const u = c.get('user');
  if (u.role === 'owner') {
    return c.json({ error: 'حساب مالک اصلی پلتفرم جهت حفظ امنیت سیستم قابل حذف نیست.' }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    confirmText?: string;
    password?: string;
  };
  const cleanConfirm = (body.confirmText || '').trim();
  if (cleanConfirm.toUpperCase() !== 'DELETE' && cleanConfirm !== 'حذف' && cleanConfirm !== 'حذف حساب') {
    return c.json(
      { error: 'برای تایید حذف کامل حساب، لطفاً عبارت DELETE یا «حذف» را به درستی وارد کنید.' },
      400
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, password_hash, telegram_id, COALESCE(has_custom_password, 0) as has_custom_password
     FROM users WHERE id = ?`
  )
    .bind(u.id)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      telegram_id: string | null;
      has_custom_password: number;
    }>();
  if (!row) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const hasWebPwd = row.has_custom_password === 1 && !row.email.endsWith('@telegram.dollarino.local');
  if (hasWebPwd) {
    if (!body.password || !(await verifyPassword(body.password, row.password_hash))) {
      return c.json({ error: 'رمز عبور فعلی جهت تایید حذف حساب صحیح نیست.' }, 401);
    }
  }

  const botToken = row.telegram_id ? await resolveTelegramBotToken(c.env) : '';
  if (row.telegram_id && botToken) {
    const bot = new TelegramBotClient(botToken);
    await bot
      .sendMessage(
        row.telegram_id,
        '🗑 حساب کاربری شما در پلتفرم دلارینو با درخواست خودتان به صورت کامل حذف و کلیه اطلاعات پاکسازی شدند.\nهر زمان مایل بودید می‌توانید مجدداً با ارسال /start حساب جدید بسازید.'
      )
      .catch(() => {});
  }

  // Stop active bot & clean up any tables referencing user_id (including those without ON DELETE CASCADE)
  const cleanupStatements = [
    c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(
      `DELETE FROM support_messages WHERE user_id = ? OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)`
    ).bind(u.id, u.id),
    c.env.DB.prepare(`DELETE FROM support_tickets WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM user_ai_messages WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM user_ai_agents WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM copy_subscriptions WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM copy_traders WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM verified_profit_cards WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM price_alerts WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM gift_redemptions WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?`).bind(u.id, u.id),
    c.env.DB.prepare(`DELETE FROM referral_withdrawals WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM dex_trades WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM user_strategies WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM wallet_ledger WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM pending_orders WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM trades WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM signals WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM chart_ai_chats WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM audit_logs WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM bot_configs WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM ai_connections WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM exchange_connections WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM telegram_bots WHERE user_id = ?`).bind(u.id),
    c.env.DB.prepare(`DELETE FROM user_subscriptions WHERE user_id = ?`).bind(u.id),
  ];

  for (const stmt of cleanupStatements) {
    await stmt.run().catch(() => {});
  }

  await c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(u.id).run();
  deleteCookie(c, 'dollarino_session', { path: '/' });

  return c.json({ ok: true, deleted: true });
});

// ==================== 1) Wallet Registration & Login (Trust Wallet / EVM EIP-191) ====================

authRoutes.post('/wallet/nonce', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `wnonce:${clientIp}`, 25, 300);
  if (!rl.allowed) return c.json({ error: `لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const body = await c.req.json<{ address?: string }>().catch(() => ({} as { address?: string }));
  const address = (body.address || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ error: 'آدرس کیف‌پول EVM معتبر نیست.' }, 400);
  }

  const nonce = `${randomId('wn')}_${Math.random().toString(36).slice(2, 10)}`;
  const issuedAt = new Date().toISOString();
  const message =
    `Dollarino Secure Sign-In & Registration\n` +
    `Wallet: ${address}\n` +
    `Nonce: ${nonce}\n` +
    `Issued: ${issuedAt}\n` +
    `Note: Signing this message is free (0 gas) and never gives fund transfer permission.`;
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO trust_wallet_nonces (nonce, user_id, message, purpose, used, expires_at)
     VALUES (?, ?, ?, 'AUTH', 0, ?)`
  )
    .bind(nonce, `AUTH:${address.toLowerCase()}`, message, expiresAt)
    .run();

  return c.json({ ok: true, nonce, message, expiresAt });
});

authRoutes.post('/wallet/verify', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `wverify:${clientIp}`, 20, 300);
  if (!rl.allowed) return c.json({ error: `لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const body = await c.req
    .json<{
      address?: string;
      signature?: string;
      nonce?: string;
      solanaAddress?: string;
      tronAddress?: string;
      tonAddress?: string;
      referralCode?: string;
    }>()
    .catch(
      () =>
        ({} as {
          address?: string;
          signature?: string;
          nonce?: string;
          solanaAddress?: string;
          tronAddress?: string;
          tonAddress?: string;
          referralCode?: string;
        })
    );

  const address = (body.address || '').trim();
  const signature = (body.signature || '').trim();
  const nonce = (body.nonce || '').trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !signature || !nonce) {
    return c.json({ error: 'آدرس، کد یکبارمصرف و امضای کیف‌پول الزامی است.' }, 400);
  }

  const nonceRow = await c.env.DB.prepare(
    `SELECT nonce, message, used, expires_at FROM trust_wallet_nonces
     WHERE nonce = ? AND user_id = ? LIMIT 1`
  )
    .bind(nonce, `AUTH:${address.toLowerCase()}`)
    .first<{ nonce: string; message: string; used: number; expires_at: string }>();

  if (!nonceRow || nonceRow.used === 1 || Date.parse(nonceRow.expires_at) < Date.now()) {
    return c.json({ error: 'کد امضا منقضی شده یا قبلاً مصرف شده است؛ دوباره تلاش کنید.' }, 401);
  }

  if (!verifyWalletPersonalSign(nonceRow.message, signature, address)) {
    return c.json({ error: 'امضای دیجیتال کیف‌پول با آدرس مطابقت ندارد.' }, 401);
  }

  await c.env.DB.prepare(`UPDATE trust_wallet_nonces SET used = 1 WHERE nonce = ?`).bind(nonce).run();

  let row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret
     FROM users WHERE LOWER(trust_wallet_address) = LOWER(?) LIMIT 1`
  )
    .bind(address)
    .first<{
      id: string;
      email: string;
      username: string;
      display_name: string | null;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      totp_enabled: number;
      totp_secret: string | null;
    }>();

  let isNewAccount = false;
  if (!row) {
    isNewAccount = true;
    const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
    const role = (countRow?.cnt ?? 0) === 0 ? 'owner' : 'user';
    const id = randomId('usr');
    const shortTag = address.slice(2, 8).toLowerCase();
    const email = `wallet_${shortTag}_${id.slice(-4)}@wallet.dollarino.local`;
    const username = `wallet_${shortTag}_${id.slice(-4)}`;
    const pwdHash = await hashPassword(randomId('wl_pwd'));
    const myRefCode = generateReferralCode();
    const fp = await buildClientFingerprints(c.req.raw, c.env);

    await c.env.DB.prepare(
      `INSERT INTO users (
         id, email, username, display_name, auth_provider, password_hash, role,
         trust_wallet_address, trust_wallet_solana, trust_wallet_tron, trust_wallet_ton,
         trust_wallet_verified, trust_wallet_connected_at, profile_completed,
         has_custom_password, referral_code, referred_by, signup_ip_hash, signup_ua_hash
       ) VALUES (?, ?, ?, ?, 'wallet', ?, ?, ?, ?, ?, ?, 1, datetime('now'), 0, 0, ?, ?, ?, ?)`
    )
      .bind(
        id,
        email,
        username,
        `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
        pwdHash,
        role,
        address,
        body.solanaAddress?.trim() || null,
        body.tronAddress?.trim() || null,
        body.tonAddress?.trim() || null,
        myRefCode,
        body.referralCode?.trim().toUpperCase() || null,
        fp.ipHash,
        fp.uaHash
      )
      .run();

    await ensureUserDefaults(c.env.DB, id);
    await attachReferralIfProvided(c.env, id, body.referralCode, clientIp, fp);

    row = {
      id,
      email,
      username,
      display_name: `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
      role,
      is_blocked: 0,
      telegram_id: null,
      totp_enabled: 0,
      totp_secret: null,
    };
  } else {
    if (row.is_blocked) return c.json({ error: 'Account is suspended by admin' }, 403);
    await c.env.DB.prepare(
      `UPDATE users
       SET trust_wallet_verified = 1,
           trust_wallet_solana = COALESCE(?, trust_wallet_solana),
           trust_wallet_tron = COALESCE(?, trust_wallet_tron),
           trust_wallet_ton = COALESCE(?, trust_wallet_ton),
           last_active_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        body.solanaAddress?.trim() || null,
        body.tronAddress?.trim() || null,
        body.tonAddress?.trim() || null,
        row.id
      )
      .run();
  }

  const authRes = await issueAuthSessionOr2fa(c, row);
  return c.json({ ...authRes, isNewAccount });
});

// ==================== 2) Google OAuth2 / ID-Token Registration & Login ====================

async function findOrCreateGoogleUser(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  gProfile: { sub: string; email: string; name?: string; picture?: string; referralCode?: string }
) {
  const clientIp = getClientIp(c.req.raw);
  const cleanEmail = gProfile.email.trim().toLowerCase();
  let row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret
     FROM users WHERE google_sub = ? OR LOWER(email) = LOWER(?) LIMIT 1`
  )
    .bind(gProfile.sub, cleanEmail)
    .first<{
      id: string;
      email: string;
      username: string;
      display_name: string | null;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      totp_enabled: number;
      totp_secret: string | null;
    }>();

  let isNewAccount = false;
  if (!row) {
    isNewAccount = true;
    const countRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
    const role = (countRow?.cnt ?? 0) === 0 ? 'owner' : 'user';
    const id = randomId('usr');
    const localSlug = (cleanEmail.split('@')[0] || 'trader').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) || 'google';
    const username = `${localSlug}_${id.slice(-4)}`;
    const pwdHash = await hashPassword(randomId('gg_pwd'));
    const myRefCode = generateReferralCode();
    const fp = await buildClientFingerprints(c.req.raw, c.env);

    await c.env.DB.prepare(
      `INSERT INTO users (
         id, email, username, display_name, auth_provider, google_sub, password_hash, role,
         avatar_url, profile_completed, has_custom_password, referral_code, referred_by, signup_ip_hash, signup_ua_hash
       ) VALUES (?, ?, ?, ?, 'google', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
    )
      .bind(
        id,
        cleanEmail,
        username,
        (gProfile.name || localSlug).slice(0, 50),
        gProfile.sub,
        pwdHash,
        role,
        gProfile.picture || null,
        myRefCode,
        gProfile.referralCode?.trim().toUpperCase() || null,
        fp.ipHash,
        fp.uaHash
      )
      .run();

    await ensureUserDefaults(c.env.DB, id);
    await attachReferralIfProvided(c.env, id, gProfile.referralCode, clientIp, fp);

    row = {
      id,
      email: cleanEmail,
      username,
      display_name: (gProfile.name || localSlug).slice(0, 50),
      role,
      is_blocked: 0,
      telegram_id: null,
      totp_enabled: 0,
      totp_secret: null,
    };
  } else {
    if (row.is_blocked) return { blocked: true as const };
    await c.env.DB.prepare(
      `UPDATE users
       SET google_sub = COALESCE(google_sub, ?),
           avatar_url = COALESCE(avatar_url, ?),
           last_active_at = datetime('now')
       WHERE id = ?`
    )
      .bind(gProfile.sub, gProfile.picture || null, row.id)
      .run();
  }

  return { blocked: false as const, row, isNewAccount };
}

authRoutes.post('/google', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `gg:${clientIp}`, 20, 300);
  if (!rl.allowed) return c.json({ error: `لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const body = await c.req
    .json<{ idToken?: string; credential?: string; accessToken?: string; referralCode?: string }>()
    .catch(() => ({} as { idToken?: string; credential?: string; accessToken?: string; referralCode?: string }));

  const idToken = (body.idToken || body.credential || '').trim();
  const accessToken = (body.accessToken || '').trim();
  const gCfg = await resolveGoogleOAuthConfig(c.env);

  let gUser: { sub: string; email: string; name?: string; picture?: string } | null = null;

  if (idToken) {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res || !res.ok) return c.json({ error: 'توکن گوگل نامعتبر یا منقضی است.' }, 401);
    const info = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      aud?: string;
      name?: string;
      picture?: string;
    };
    if (!info.sub || !info.email || (info.email_verified !== true && info.email_verified !== 'true')) {
      return c.json({ error: 'ایمیل گوگل تایید نشده است.' }, 401);
    }
    if (gCfg.clientId && info.aud && info.aud !== gCfg.clientId) {
      return c.json({ error: 'Google Client ID mismatch.' }, 401);
    }
    gUser = { sub: info.sub, email: info.email, name: info.name, picture: info.picture };
  } else if (accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res || !res.ok) return c.json({ error: 'توکن دسترسی گوگل معتبر نیست.' }, 401);
    const info = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!info.sub || !info.email || !info.email_verified) {
      return c.json({ error: 'حساب گوگل تاییدشده یافت نشد.' }, 401);
    }
    gUser = { sub: info.sub, email: info.email, name: info.name, picture: info.picture };
  } else {
    return c.json(
      {
        error: gCfg.clientId
          ? 'توکن تایید گوگل ارسال نشد.'
          : 'ورود مستقیم گوگل هنوز توسط مدیریت تنظیم نشده است (GOOGLE_CLIENT_ID در تنظیمات سرور خالی است). از ورود با کیف‌پول یا تلگرام استفاده کنید.',
        code: gCfg.clientId ? 'GOOGLE_TOKEN_REQUIRED' : 'GOOGLE_NOT_CONFIGURED',
      },
      gCfg.clientId ? 400 : 503
    );
  }

  const found = await findOrCreateGoogleUser(c, { ...gUser, referralCode: body.referralCode });
  if (found.blocked) return c.json({ error: 'Account is suspended by admin' }, 403);

  const authRes = await issueAuthSessionOr2fa(c, found.row);
  return c.json({ ...authRes, isNewAccount: found.isNewAccount });
});

authRoutes.get('/google/start', async (c) => {
  const gCfg = await resolveGoogleOAuthConfig(c.env);
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  if (!gCfg.clientId) {
    return c.redirect(`${origin}/?auth_error=google_not_configured`);
  }
  const ref = (c.req.query('ref') || '').trim().toUpperCase();
  const state = await signJwt({ nonce: randomId('gs'), ref }, c.env.SESSION_JWT_SECRET);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', gCfg.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);
  return c.redirect(authUrl.toString());
});

authRoutes.get('/google/callback', async (c) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const code = (c.req.query('code') || '').trim();
  const state = (c.req.query('state') || '').trim();
  const errParam = (c.req.query('error') || '').trim();

  if (errParam || !code) {
    return c.redirect(`${origin}/?auth_error=${encodeURIComponent(errParam || 'google_cancelled')}`);
  }
  const gCfg = await resolveGoogleOAuthConfig(c.env);
  if (!gCfg.clientId || !gCfg.clientSecret) {
    return c.redirect(`${origin}/?auth_error=google_not_configured`);
  }
  const statePayload = state ? await verifyJwt(state, c.env.SESSION_JWT_SECRET) : null;
  const referralCode = typeof statePayload?.ref === 'string' ? statePayload.ref : undefined;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: gCfg.clientId,
      client_secret: gCfg.clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!tokenRes || !tokenRes.ok) {
    return c.redirect(`${origin}/?auth_error=google_token_exchange_failed`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
  if (!tokens.access_token) {
    return c.redirect(`${origin}/?auth_error=google_missing_access_token`);
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!userRes || !userRes.ok) {
    return c.redirect(`${origin}/?auth_error=google_userinfo_failed`);
  }
  const gInfo = (await userRes.json()) as { sub?: string; email?: string; name?: string; picture?: string };
  if (!gInfo.sub || !gInfo.email) {
    return c.redirect(`${origin}/?auth_error=google_missing_email`);
  }

  const found = await findOrCreateGoogleUser(c, {
    sub: gInfo.sub,
    email: gInfo.email,
    name: gInfo.name,
    picture: gInfo.picture,
    referralCode,
  });
  if (found.blocked) {
    return c.redirect(`${origin}/?auth_error=account_suspended`);
  }

  const authRes = await issueAuthSessionOr2fa(c, found.row);
  if (authRes.requires2fa) {
    return c.redirect(`${origin}/?google_2fa=${encodeURIComponent(authRes.tempToken)}`);
  }
  return c.redirect(`${origin}/?google_token=${encodeURIComponent(authRes.token)}`);
});

// ==================== 3) Mandatory Profile Completion (Display Name, Username, Password) ====================

authRoutes.get('/check-username', async (c) => {
  const raw = (c.req.query('username') || c.req.query('u') || '').trim();
  const valid = /^[a-zA-Z0-9_.-]{3,32}$/.test(raw);
  if (!valid) {
    return c.json({
      available: false,
      valid: false,
      reason: 'نام کاربری باید بین ۳ تا ۳۲ کاراکتر انگلیسی (حروف، اعداد یا _ . -) باشد.',
    });
  }
  const excludeUserId = (c.req.query('exclude') || '').trim();
  const existing = await c.env.DB.prepare(
    `SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1`
  )
    .bind(raw, excludeUserId || '')
    .first();
  return c.json({
    available: !existing,
    valid: true,
    reason: existing ? 'این نام کاربری قبلاً انتخاب شده است.' : null,
  });
});

authRoutes.post('/complete-profile', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req
    .json<{ displayName?: string; username?: string; password?: string; email?: string }>()
    .catch(() => ({} as { displayName?: string; username?: string; password?: string; email?: string }));

  const displayName = (body.displayName || '').trim();
  const username = (body.username || '').trim();
  const password = body.password || '';
  const email = (body.email || '').trim().toLowerCase();

  if (displayName.length < 2 || displayName.length > 50) {
    return c.json({ error: 'نام نمایشی باید بین ۲ تا ۵۰ کاراکتر باشد.' }, 400);
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return c.json({ error: 'نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ . - باشد.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' }, 400);
  }

  const takenUsername = await c.env.DB.prepare(
    `SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1`
  )
    .bind(username, u.id)
    .first();
  if (takenUsername) {
    return c.json({ error: 'این نام کاربری قبلاً توسط کاربر دیگری ثبت شده است.' }, 409);
  }

  let nextEmail = u.email;
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.endsWith('.local')) {
      return c.json({ error: 'فرمت ایمیل معتبر نیست.' }, 400);
    }
    const takenEmail = await c.env.DB.prepare(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1`
    )
      .bind(email, u.id)
      .first();
    if (takenEmail) {
      return c.json({ error: 'این ایمیل قبلاً ثبت شده است.' }, 409);
    }
    nextEmail = email;
  }

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `UPDATE users
     SET display_name = ?,
         username = ?,
         email = ?,
         password_hash = ?,
         has_custom_password = 1,
         profile_completed = 1,
         last_active_at = datetime('now')
     WHERE id = ?`
  )
    .bind(displayName, username, nextEmail, passwordHash, u.id)
    .run();

  const isHttps = isHttpsRequest(c);
  const token = await signJwt({ sub: u.id, email: nextEmail, role: u.role }, c.env.SESSION_JWT_SECRET);
  setCookie(c, 'dollarino_session', token, {
    httpOnly: true,
    sameSite: isHttps ? 'None' : 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`).bind(u.id).first();
  return c.json({ ok: true, token, user: fullUser });
});

// ==================== 4) Google Authenticator TOTP 2FA Security ====================

authRoutes.get('/2fa/status', requireAuth, async (c) => {
  const u = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(totp_enabled, 0) as totp_enabled, totp_verified_at FROM users WHERE id = ? LIMIT 1`
  )
    .bind(u.id)
    .first<{ totp_enabled: number; totp_verified_at: string | null }>();
  return c.json({
    ok: true,
    enabled: Boolean(row?.totp_enabled === 1),
    verifiedAt: row?.totp_verified_at || null,
  });
});

authRoutes.post('/2fa/setup', requireAuth, async (c) => {
  const u = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT username, email, COALESCE(totp_enabled, 0) as totp_enabled FROM users WHERE id = ? LIMIT 1`
  )
    .bind(u.id)
    .first<{ username: string; email: string; totp_enabled: number }>();
  if (!row) return c.json({ error: 'User not found' }, 404);
  if (row.totp_enabled === 1) {
    return c.json({ error: 'احراز هویت دوعاملی هم‌اکنون فعال است.' }, 400);
  }

  const secret = generateTotpSecret(20);
  await c.env.DB.prepare(`UPDATE users SET totp_secret = ? WHERE id = ?`).bind(secret, u.id).run();
  const label = row.username || row.email;
  const otpauthUri = buildTotpOtpAuthUri(label, secret, 'Dollarino');

  return c.json({ ok: true, secret, otpauthUri, issuer: 'Dollarino', account: label });
});

authRoutes.post('/2fa/enable', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const code = (body.code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: 'لطفاً کد ۶ رقمی Google Authenticator را وارد کنید.' }, 400);
  }

  const row = await c.env.DB.prepare(`SELECT totp_secret FROM users WHERE id = ? LIMIT 1`)
    .bind(u.id)
    .first<{ totp_secret: string | null }>();
  if (!row?.totp_secret) {
    return c.json({ error: 'ابتدا کلید راه‌اندازی 2FA را ایجاد کنید.' }, 400);
  }

  const valid = await verifyTotpCode(row.totp_secret, code, 1);
  if (!valid) {
    return c.json({ error: 'کد ۶ رقمی واردشده صحیح یا به‌روز نیست. ساعت دستگاه خود را بررسی و دوباره تلاش کنید.' }, 401);
  }

  await c.env.DB.prepare(
    `UPDATE users SET totp_enabled = 1, totp_verified_at = datetime('now') WHERE id = ?`
  )
    .bind(u.id)
    .run();
  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`).bind(u.id).first();
  return c.json({ ok: true, enabled: true, user: fullUser });
});

authRoutes.post('/2fa/disable', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const code = (body.code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: 'برای غیرفعال‌سازی، کد ۶ رقمی Google Authenticator الزامی است.' }, 400);
  }

  const row = await c.env.DB.prepare(`SELECT totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1`)
    .bind(u.id)
    .first<{ totp_secret: string | null; totp_enabled: number }>();
  if (!row || row.totp_enabled !== 1 || !row.totp_secret) {
    return c.json({ error: 'احراز هویت دوعاملی فعال نیست.' }, 400);
  }

  const valid = await verifyTotpCode(row.totp_secret, code, 1);
  if (!valid) {
    return c.json({ error: 'کد ۶ رقمی اشتباه است.' }, 401);
  }

  await c.env.DB.prepare(
    `UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_verified_at = NULL WHERE id = ?`
  )
    .bind(u.id)
    .run();
  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`).bind(u.id).first();
  return c.json({ ok: true, enabled: false, user: fullUser });
});

authRoutes.post('/2fa/verify-login', async (c) => {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `2fa:${clientIp}`, 20, 300);
  if (!rl.allowed) return c.json({ error: `تلاش بیش از حد. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const body = await c.req
    .json<{ tempToken?: string; challengeToken?: string; code?: string }>()
    .catch(() => ({} as { tempToken?: string; challengeToken?: string; code?: string }));
  const tempToken = (body.tempToken || body.challengeToken || '').trim();
  const code = (body.code || '').replace(/\s+/g, '');
  if (!tempToken || !/^\d{6}$/.test(code)) {
    return c.json({ error: 'توکن موقت و کد ۶ رقمی الزامی است.' }, 400);
  }

  const payload = await verifyJwt(tempToken, c.env.SESSION_JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string' || payload.purpose !== '2fa_challenge') {
    return c.json({ error: 'نشست تایید دوعاملی منقضی شده است؛ لطفاً دوباره وارد شوید.' }, 401);
  }
  const issuedAt = Number(payload.issuedAt || 0);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 5 * 60_000) {
    return c.json({ error: 'زمان ۵ دقیقه‌ای تایید دوعاملی به پایان رسید؛ لطفاً مجدداً وارد شوید.' }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_id, totp_secret, totp_enabled
     FROM users WHERE id = ? LIMIT 1`
  )
    .bind(payload.sub)
    .first<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      totp_secret: string | null;
      totp_enabled: number;
    }>();

  if (!row || row.is_blocked) return c.json({ error: 'Account unavailable' }, 403);
  if (row.totp_enabled !== 1 || !row.totp_secret) return c.json({ error: '2FA not enabled' }, 400);

  const valid = await verifyTotpCode(row.totp_secret, code, 1);
  if (!valid) {
    return c.json({ error: 'کد تایید Google Authenticator نادرست است.' }, 401);
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
  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`).bind(row.id).first();
  return c.json({ ok: true, token, user: fullUser });
});

