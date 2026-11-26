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
import { getAllCachedSystemSettings } from './services/settings-cache.js';
import { TelegramBotClient } from './telegram/client.js';
import { publishSystemLogEvent } from './telegram/publisher.js';
import { resolveOwnerTelegramId, resolveTelegramBotToken } from './telegram/token.js';

const USER_PROFILE_COLUMNS = `
  id, email, username, display_name, auth_provider, role, is_blocked, telegram_id, telegram_username, telegram_first_name, telegram_link_code,
  wallet_balance_usdt, avatar_url, COALESCE(avatar_custom, 0) as avatar_custom, phone_number, phone_verified,
  COALESCE(has_custom_password, 0) as has_custom_password, COALESCE(profile_completed, 1) as profile_completed,
  COALESCE(must_change_credentials, 0) as must_change_credentials,
  COALESCE(totp_enabled, 0) as totp_enabled, display_bio,
  COALESCE(referral_code, 'DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) as referral_code,
  trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified,
  ui_mode, mobile_widgets_json, extension_api_key, risk_terms_accepted_at, created_at
`;

export interface AuthProviderToggles {
  passwordLoginEnabled: boolean;
  publicSignupEnabled: boolean;
  walletAuthEnabled: boolean;
  telegramAuthEnabled: boolean;
  googleAuthEnabled: boolean;
  telegramOnlySignup: boolean;
  requireTelegramPhoneKyc: boolean;
  botUsername: string;
  officialChannel: string;
  officialChannelInvite: string;
  signalsChannel: string;
  signalsChannelInvite: string;
  resultsChannel: string;
  resultsChannelInvite: string;
  communityGroupInvite: string;
  newsChannel: string;
  newsChannelInvite: string;
  telegramSupport: string;
}

function buildPublicChannelUrl(target: string, explicitInvite: string): string {
  const inv = (explicitInvite || '').trim();
  if (inv && /^https?:\/\//i.test(inv)) return inv;
  const t = (target || '').trim();
  if (!t) return '';
  if (/^https?:\/\/t\.me\//i.test(t)) return t;
  if (t.startsWith('@') && t.length > 1) return `https://t.me/${t.slice(1)}`;
  return '';
}

export async function resolveAuthProviderToggles(db: D1Database): Promise<AuthProviderToggles> {
  const s = await getAllCachedSystemSettings(db);
  const g = (k: string, fb = '') => (s.get(k) ?? fb).trim();
  const telegramOnly = g('telegram_only_signup', 'false') === 'true';
  const legacyDirectSignup = g('allow_direct_email_signup', 'false') === 'true';
  const publicSignup = (g('auth_public_signup_enabled', 'false') === 'true' || legacyDirectSignup) && !telegramOnly;

  const officialChannel = g('official_channel', '');
  const signalsChannel = g('signals_channel_id', '');
  const resultsChannel = g('results_channel_id', '');
  const newsChannel = g('news_channel_id', '');
  const communityGroup = g('community_group_id', '');

  return {
    passwordLoginEnabled: g('auth_password_login_enabled', 'true') !== 'false',
    publicSignupEnabled: publicSignup,
    walletAuthEnabled: g('auth_wallet_enabled', 'false') === 'true',
    telegramAuthEnabled: g('auth_telegram_enabled', 'false') === 'true' || telegramOnly,
    googleAuthEnabled: g('auth_google_enabled', 'false') === 'true',
    telegramOnlySignup: telegramOnly,
    requireTelegramPhoneKyc: g('require_telegram_phone_kyc', 'false') === 'true',
    botUsername: g('bot_username', '').replace(/^@/, ''),
    officialChannel,
    officialChannelInvite: buildPublicChannelUrl(officialChannel, g('official_channel_invite', '')),
    signalsChannel,
    signalsChannelInvite: buildPublicChannelUrl(signalsChannel, g('signals_channel_invite', '')),
    resultsChannel,
    resultsChannelInvite: buildPublicChannelUrl(resultsChannel, g('results_channel_invite', '')),
    communityGroupInvite: buildPublicChannelUrl(communityGroup, g('community_group_invite', '')),
    newsChannel,
    newsChannelInvite: buildPublicChannelUrl(newsChannel, g('news_channel_invite', '')),
    telegramSupport: g('telegram_support', ''),
  };
}

const SETUP_BYPASS_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/session',
  '/api/auth/logout',
  '/api/auth/check-username',
  '/api/auth/2fa/setup',
  '/api/auth/complete-admin-setup',
  '/api/auth/ui-preferences',
]);

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

const AUTH_USER_CACHE = new WeakMap<object, Map<string, { ts: number; user: AuthUser }>>();
const AUTH_EXT_CACHE = new WeakMap<object, Map<string, { ts: number; user: AuthUser }>>();
const AUTH_CACHE_TTL_MS = 45_000;

export function invalidateAuthUserCache(db: D1Database, userId?: string): void {
  const userMap = AUTH_USER_CACHE.get(db as unknown as object);
  if (userMap) {
    if (userId) userMap.delete(userId);
    else userMap.clear();
  }
  const extMap = AUTH_EXT_CACHE.get(db as unknown as object);
  if (extMap) {
    if (userId) {
      for (const [k, v] of extMap.entries()) {
        if (v.user.id === userId) extMap.delete(k);
      }
    } else {
      extMap.clear();
    }
  }
}

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AppVariables }>, next: Next) {
  const extKey = c.req.header('X-Dollarino-Extension-Key');
  if (extKey && extKey.startsWith('dlr_ext_')) {
    const trimmedKey = extKey.trim();
    const now = Date.now();
    let extMap = AUTH_EXT_CACHE.get(c.env.DB as unknown as object);
    const extCached = extMap?.get(trimmedKey);
    if (extCached && now - extCached.ts < AUTH_CACHE_TTL_MS) {
      c.set('user', extCached.user);
      await next();
      return;
    }

    const extRow = await c.env.DB.prepare(
      'SELECT id, email, username, role, is_blocked, telegram_id FROM users WHERE extension_api_key = ? LIMIT 1'
    ).bind(trimmedKey).first<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
    }>().catch(() => null);
    if (!extRow) return c.json({ error: 'Invalid Extension Key' }, 401);
    if (extRow.is_blocked) return c.json({ error: 'Account is suspended' }, 403);
    const authUser: AuthUser = {
      id: extRow.id,
      email: extRow.email,
      username: extRow.username,
      role: (extRow.role as AuthUser['role']) || 'user',
      telegramId: extRow.telegram_id,
    };
    if (!extMap) {
      extMap = new Map();
      AUTH_EXT_CACHE.set(c.env.DB as unknown as object, extMap);
    }
    if (extMap.size > 500) extMap.clear();
    extMap.set(trimmedKey, { ts: now, user: authUser });
    c.set('user', authUser);
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
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    payload.purpose === '2fa_challenge' ||
    payload.purpose === 'secondary_password_challenge'
  ) {
    console.warn('[auth] 401 invalid jwt');
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  const allowPollCache =
    (c.req.path === '/api/trading/live-ticks' && c.req.query('poll') === '1') ||
    (c.req.path === '/api/trading/dashboard' && c.req.query('lite') === '1') ||
    c.req.header('X-Dollarino-Poll') === '1' ||
    (c.req.method === 'GET' && !c.req.path.startsWith('/api/auth/') && !c.req.path.startsWith('/api/admin/'));

  const now = Date.now();
  let userMap = AUTH_USER_CACHE.get(c.env.DB as unknown as object);
  const cachedUser = allowPollCache ? userMap?.get(payload.sub) : undefined;
  if (cachedUser && now - cachedUser.ts < AUTH_CACHE_TTL_MS && !cachedUser.user.mustChangeCredentials) {
    c.set('user', cachedUser.user);
    await next();
    return;
  }

  const row = await c.env.DB.prepare(
    'SELECT id, email, username, role, is_blocked, telegram_id, COALESCE(must_change_credentials, 0) as must_change_credentials FROM users WHERE id = ?'
  ).bind(payload.sub).first<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    must_change_credentials: number;
  }>();

  if (!row) return c.json({ error: 'User not found' }, 401);
  if (row.is_blocked) {
    userMap?.delete(payload.sub);
    return c.json({ error: 'Account is suspended' }, 403);
  }

  const mustChange = Number(row.must_change_credentials ?? 0) === 1;
  if (mustChange && !SETUP_BYPASS_PATHS.has(c.req.path)) {
    return c.json(
      {
        error: 'برای امنیت پلتفرم، ابتدا نام کاربری و رمز عبور جدید را تعیین کرده و تایید دو مرحله‌ای Google Authenticator را فعال نمایید.',
        code: 'ADMIN_CREDENTIAL_CHANGE_REQUIRED',
      },
      403
    );
  }

  const authUser: AuthUser = {
    id: row.id,
    email: row.email,
    username: row.username,
    role: (row.role as AuthUser['role']) || 'user',
    telegramId: row.telegram_id,
    mustChangeCredentials: mustChange,
  };
  if (!userMap) {
    userMap = new Map();
    AUTH_USER_CACHE.set(c.env.DB as unknown as object, userMap);
  }
  if (userMap.size > 1000) userMap.clear();
  userMap.set(payload.sub, { ts: now, user: authUser });

  c.set('user', authUser);
  await next();
}

export function normalizePhoneInput(raw?: string | null): string {
  if (!raw) return '';
  const ascii = String(raw)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim();
  const hasPlus = ascii.startsWith('+');
  const digits = ascii.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 16) return '';
  return `${hasPlus ? '+' : ''}${digits}`;
}

export async function resolveEffectiveReferralCode(
  db: D1Database,
  suppliedReferralCode: string | null | undefined,
  newUserId: string
): Promise<string | null> {
  const clean = (suppliedReferralCode ?? '').trim().toUpperCase();
  if (clean) return clean;
  const adminRow = await db
    .prepare(
      `SELECT id, COALESCE(NULLIF(TRIM(referral_code), ''), 'DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) AS ref_code
       FROM users
       WHERE id != ? AND LOWER(role) IN ('owner', 'admin') AND COALESCE(must_change_credentials, 0) = 0
       ORDER BY CASE WHEN LOWER(role) = 'owner' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`
    )
    .bind(newUserId)
    .first<{ id: string; ref_code: string }>()
    .catch(() => null);
  return adminRow?.ref_code ? adminRow.ref_code.trim().toUpperCase() : null;
}

export async function resetPrivilegedUserAccountToFreshState(db: D1Database, userId: string): Promise<void> {
  const cleanups = [
    db.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ?`).bind(userId),
    db
      .prepare(
        `DELETE FROM support_messages WHERE user_id = ? OR ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)`
      )
      .bind(userId, userId),
    db.prepare(`DELETE FROM support_tickets WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_ai_messages WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_ai_agents WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM copy_subscriptions WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM copy_positions_v2 WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM copy_follow_rules WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_copy_vaults WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM verified_profit_cards WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM price_alerts WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM tradingview_free_alerts WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM notifications WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM gift_redemptions WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?`).bind(userId, userId),
    db.prepare(`DELETE FROM referral_withdrawals WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM server_fee_ledger WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM treasury_deposits WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM perp_dex_orders WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM perp_dex_connections WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM dex_trades WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_strategies WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM wallet_ledger WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM pending_orders WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM trades WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM signals WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM chart_ai_chats WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM audit_logs WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM bot_configs WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM ai_connections WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM exchange_connections WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM telegram_bots WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_subscriptions WHERE user_id = ?`).bind(userId),
  ];

  for (const stmt of cleanups) {
    await stmt.run().catch(() => {});
  }

  await db
    .prepare(
      `UPDATE users SET
         wallet_balance_usdt = 0,
         fee_prepaid_credit_usd = 0,
         fee_penalty_usd = 0,
         fee_lock_status = 'ACTIVE',
         fee_grace_deadline = NULL,
         referral_balance_usd = 0,
         referred_by = NULL,
         trust_wallet_address = NULL,
         trust_wallet_tron = NULL,
         trust_wallet_solana = NULL,
         trust_wallet_ton = NULL,
         trust_wallet_verified = 0,
         trust_wallet_connected_at = NULL,
         risk_terms_accepted_at = NULL,
         extension_api_key = NULL,
         display_bio = NULL,
         avatar_url = NULL,
         avatar_custom = 0,
         ui_mode = 'simple',
         mobile_widgets_json = NULL,
         last_active_at = datetime('now')
       WHERE id = ?`
    )
    .bind(userId)
    .run();

  await ensureUserDefaults(db, userId);
  invalidateAuthUserCache(db, userId);
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
  userRow: {
    id: string;
    email: string;
    username: string;
    role: string;
    telegram_id: string | null;
    display_name?: string | null;
    totp_enabled?: number;
    totp_secret?: string | null;
    secondary_password_hash?: string | null;
  }
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
      twoFactorMode: 'TOTP' as const,
      challengeType: 'TOTP' as const,
      tempToken,
      challengeToken: tempToken,
      username: userRow.username,
      displayName: userRow.display_name || userRow.username,
    };
  }

  if (userRow.secondary_password_hash) {
    const tempToken = await signJwt(
      {
        sub: userRow.id,
        email: userRow.email,
        role: userRow.role,
        purpose: 'secondary_password_challenge',
        issuedAt: Date.now(),
      },
      c.env.SESSION_JWT_SECRET
    );
    return {
      requires2fa: true as const,
      twoFactorMode: 'SECONDARY_PASSWORD' as const,
      challengeType: 'SECONDARY_PASSWORD' as const,
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
  const rec = computeDynamicRecommendedSettings(10_000, 'conservative');
  await db.prepare(
    `INSERT OR IGNORE INTO bot_configs
     (user_id, bot_state, trading_mode, trade_execution_mode, market_type, direction_mode, notifications_enabled, notification_prefs_json, display_currency, strategy_key, active_engines_json, entry_timeframe, higher_timeframe, margin_pct, use_signal_leverage, max_leverage, max_open_positions, daily_max_loss_pct, trailing_stop_enabled, trailing_stop_pct, trail_after_tp1, tp1_close_pct, tp2_close_pct, tp3_close_pct, auto_breakeven_on_tp1, move_sl_to_tp1_on_tp2, auto_scan_top, scan_scope, allow_auto_flip, ai_gate_enabled, ai_min_confidence, sniper_enabled, sniper_auto_execute, sniper_min_safety_score, sniper_min_liquidity_usd, sniper_tp_pct, sniper_sl_pct, sniper_trailing_enabled, sniper_trailing_pct, bot_budget_mode, bot_budget_usd, bot_budget_pct, trading_mode_selected, webhook_secret)
     VALUES (?, 'STOPPED', 'PAPER', 'MANUAL_CONFIRM', 'FUTURES', 'BOTH', 0, '{"tradeOpen":false,"tpSlHit":false,"aiSignals":false,"whaleCopy":false,"dailyDigest":false}', 'USD', 'dollarino_v01', '[]', '15m', '1h', ?, 0, ?, ?, ?, 1, ?, 1, ?, ?, ?, 1, 1, 0, 'ALL_MARKET', 0, 0, 70, 0, 0, 80, 35000, 35, 15, 1, 8, 'FULL_BALANCE', 0, 100, 0, ?)`
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

  const toggles = await resolveAuthProviderToggles(c.env.DB);
  if (!toggles.publicSignupEnabled) {
    if (toggles.telegramOnlySignup) {
      const botUser = toggles.botUsername;
      const botUrl = botUser ? `https://t.me/${botUser}?start=web_auth` : '';
      return c.json(
        {
          error: botUser
            ? `ثبت‌نام مستقیم با ایمیل غیرفعال شده است. ثبت‌نام و احراز هویت فقط از طریق ربات تلگرام @${botUser} انجام می‌شود.`
            : 'ثبت‌نام مستقیم با ایمیل غیرفعال شده است. ثبت‌نام از طریق ربات متصل تلگرام انجام می‌شود.',
          code: 'TELEGRAM_SIGNUP_REQUIRED',
          botUrl,
        },
        403
      );
    }
    return c.json(
      {
        error: 'ثبت‌نام مستقیم در حال حاضر توسط مدیریت غیرفعال است.',
        code: 'PUBLIC_SIGNUP_DISABLED',
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

  // Public registration NEVER grants owner/admin role — strictly standard 'user'
  const role = 'user';

  const id = randomId('usr');
  const myReferralCode = generateReferralCode();
  const passwordHash = await hashPassword(password);
  const fp = await buildClientFingerprints(c.req.raw, c.env);
  const effectiveRefCode = await resolveEffectiveReferralCode(c.env.DB, referralCode, id);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, username, display_name, password_hash, role, auth_provider, profile_completed, referral_code, referred_by, signup_ip_hash, signup_ua_hash)
     VALUES (?, ?, ?, ?, ?, ?, 'email', 1, ?, ?, ?, ?)`
  ).bind(id, email, username, username, passwordHash, role, myReferralCode, effectiveRefCode, fp.ipHash, fp.uaHash).run();

  await ensureUserDefaults(c.env.DB, id);

  if (effectiveRefCode) {
    const normalizedRef = effectiveRefCode.trim().toUpperCase();
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
        effectiveRefCode,
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
  const [toggles, google, botToken, defaultAdminReferralCode] = await Promise.all([
    resolveAuthProviderToggles(c.env.DB),
    resolveGoogleOAuthConfig(c.env),
    resolveTelegramBotToken(c.env),
    resolveEffectiveReferralCode(c.env.DB, null, ''),
  ]);
  const googleConfigured = Boolean(google.clientId && google.clientSecret);
  const googleEnabled = toggles.googleAuthEnabled && googleConfigured;
  return c.json({
    ok: true,
    passwordLoginEnabled: toggles.passwordLoginEnabled,
    publicSignupEnabled: toggles.publicSignupEnabled,
    walletAuthEnabled: toggles.walletAuthEnabled,
    telegramAuthEnabled: toggles.telegramAuthEnabled,
    telegramBotConfigured: Boolean(botToken),
    telegramBotUsername: toggles.botUsername,
    officialChannel: toggles.officialChannel,
    officialChannelInvite: toggles.officialChannelInvite,
    signalsChannel: toggles.signalsChannel,
    signalsChannelInvite: toggles.signalsChannelInvite,
    resultsChannel: toggles.resultsChannel,
    resultsChannelInvite: toggles.resultsChannelInvite,
    communityGroupInvite: toggles.communityGroupInvite,
    newsChannel: toggles.newsChannel,
    newsChannelInvite: toggles.newsChannelInvite,
    telegramSupport: toggles.telegramSupport,
    requireTelegramPhoneKyc: toggles.requireTelegramPhoneKyc,
    googleAuthEnabled: toggles.googleAuthEnabled,
    googleEnabled,
    googleConfigured,
    googleClientId: googleConfigured ? google.clientId : null,
    defaultAdminReferralCode,
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
    `SELECT id, email, username, display_name, password_hash, secondary_password_hash, role, is_blocked, telegram_id,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret, COALESCE(must_change_credentials, 0) as must_change_credentials
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
      secondary_password_hash: string | null;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      totp_enabled: number;
      totp_secret: string | null;
      must_change_credentials: number;
    }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: 'نام کاربری/ایمیل یا رمز عبور نامعتبر است' }, 401);
  }
  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  if (!toggles.passwordLoginEnabled && row.role !== 'owner' && row.role !== 'admin') {
    return c.json({ error: 'ورود با رمز عبور برای کاربران فعلاً غیرفعال است.' }, 403);
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
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      payload.purpose === '2fa_challenge' ||
      payload.purpose === 'secondary_password_challenge'
    ) {
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

  const toggles = await resolveAuthProviderToggles(c.env.DB);
  return c.json({
    code,
    expiresAt,
    command: `/link ${code}`,
    deepLinkUrl: toggles.botUsername ? `https://t.me/${toggles.botUsername}?start=${code}` : '',
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
  const [ownerId, toggles] = await Promise.all([
    resolveOwnerTelegramId(c.env),
    resolveAuthProviderToggles(c.env.DB),
  ]);
  const isConfiguredOwner = Boolean(ownerId && tgId === ownerId);

  let row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id, avatar_url, phone_verified,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret, secondary_password_hash
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
    secondary_password_hash?: string | null;
  }>();

  if (!toggles.telegramAuthEnabled && !isConfiguredOwner && row?.role !== 'owner' && row?.role !== 'admin') {
    return c.json(
      { error: 'ورود و ثبت‌نام از طریق تلگرام هنوز توسط مدیر سایت فعال نشده است.', code: 'TELEGRAM_AUTH_DISABLED' },
      403
    );
  }

  if (!row) {
    const id = randomId('usr');
    const role = isConfiguredOwner ? 'owner' : 'user';
    const username = verified.user.username || verified.user.first_name || `tg_${tgId}`;
    const email = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('tg_pwd'));
    const myRefCode = generateReferralCode();
    const effectiveRefCode = await resolveEffectiveReferralCode(c.env.DB, null, id);
    const clientIp = getClientIp(c.req.raw);
    const fp = await buildClientFingerprints(c.req.raw, c.env);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, username, display_name, auth_provider, password_hash, role, telegram_id, telegram_username, telegram_first_name, phone_verified, profile_completed, referral_code, referred_by, signup_ip_hash, signup_ua_hash)
       VALUES (?, ?, ?, ?, 'telegram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        email,
        username,
        verified.user.first_name || username,
        pwd,
        role,
        tgId,
        verified.user.username ?? null,
        verified.user.first_name ?? null,
        isConfiguredOwner ? 1 : 0,
        isConfiguredOwner ? 1 : 0,
        myRefCode,
        effectiveRefCode,
        fp.ipHash,
        fp.uaHash
      )
      .run();

    await ensureUserDefaults(c.env.DB, id);
    if (effectiveRefCode) {
      await attachReferralIfProvided(c.env, id, effectiveRefCode, clientIp, fp);
    }
    row = {
      id,
      email,
      username,
      display_name: verified.user.first_name || username,
      role,
      is_blocked: 0,
      telegram_id: tgId,
      avatar_url: null,
      phone_verified: isConfiguredOwner ? 1 : 0,
      totp_enabled: 0,
      totp_secret: null,
      secondary_password_hash: null,
    };
  }

  if (row.is_blocked) {
    return c.json({ error: 'Account is suspended by admin' }, 403);
  }

  const kycRequired = toggles.requireTelegramPhoneKyc;
  const botHandle = toggles.botUsername ? `@${toggles.botUsername}` : 'ربات تلگرام پلتفرم';
  const botStartUrl = toggles.botUsername ? `https://t.me/${toggles.botUsername}?start=web_auth` : '';

  if (kycRequired && Number(row.phone_verified ?? 0) !== 1 && row.role !== 'owner' && row.role !== 'admin') {
    return c.json(
      {
        error: `برای فعال‌سازی حساب و ورود به مینی‌اپ، ابتدا داخل ${botHandle} شماره تماس اکانت تلگرام خود را به اشتراک بگذارید.`,
        code: 'PHONE_KYC_REQUIRED',
        botUrl: botStartUrl,
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

// One-click Magic Login from Telegram Bot (`/?tg_login=...`)
authRoutes.post('/telegram-magic-login', async (c) => {
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  const body = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const magic = (body.token ?? '').trim();
  if (!magic) {
    return c.json({ error: 'Magic login token is required' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT id, email, username, display_name, role, is_blocked, telegram_id, avatar_url, web_magic_expires_at,
            COALESCE(totp_enabled, 0) as totp_enabled, totp_secret, secondary_password_hash
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
    secondary_password_hash?: string | null;
  }>();

  if (!toggles.telegramAuthEnabled && row?.role !== 'owner' && row?.role !== 'admin') {
    return c.json({ error: 'ورود و ثبت‌نام از طریق تلگرام هنوز توسط مدیر فعال نشده است.', code: 'TELEGRAM_AUTH_DISABLED' }, 403);
  }
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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
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
    `SELECT ${USER_PROFILE_COLUMNS}, totp_secret, secondary_password_hash FROM users WHERE telegram_id = ? LIMIT 1`
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
    secondary_password_hash?: string | null;
  }>();

  if (!toggles.telegramAuthEnabled && row?.role !== 'owner' && row?.role !== 'admin') {
    return c.json({ error: 'ورود با تلگرام هنوز توسط مدیر فعال نشده است.', code: 'TELEGRAM_AUTH_DISABLED' }, 403);
  }

  const kycRequired = toggles.requireTelegramPhoneKyc;
  const botHandle = toggles.botUsername ? `@${toggles.botUsername}` : 'ربات تلگرام';
  const botStartUrl = toggles.botUsername ? `https://t.me/${toggles.botUsername}?start=web_auth` : '';

  if (!row || (kycRequired && Number(row.phone_verified || 0) !== 1 && row.role !== 'owner' && row.role !== 'admin')) {
    return c.json(
      {
        error: `برای اولین ورود و احراز هویت شماره تماس، ابتدا ${botHandle} را استارت کرده و شماره تماس اکانت خود را به اشتراک بگذارید.`,
        code: 'PHONE_KYC_REQUIRED',
        botUrl: botStartUrl,
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
    secondary_password_hash: row.secondary_password_hash,
  });
  return c.json(authRes);
});

// Generate or retrieve personal Browser Extension & Mobile Shortcut API key
authRoutes.post('/extension-key', requireAuth, async (c) => {
  const u = c.get('user');
  const rl = await enforceRateLimit(c.env, `extkey:${u.id}`, 15, 300, { bypass: u.role === 'owner' || u.role === 'admin' });
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

// Permanently delete regular user account, OR reset Admin/Owner account to fresh zero-state while keeping Admin role & access
authRoutes.delete('/account', requireAuth, async (c) => {
  const u = c.get('user');

  const body = (await c.req.json().catch(() => ({}))) as {
    confirmText?: string;
    password?: string;
  };
  const cleanConfirm = (body.confirmText || '').trim();
  if (cleanConfirm.toUpperCase() !== 'DELETE' && cleanConfirm !== 'حذف' && cleanConfirm !== 'حذف حساب') {
    return c.json(
      { error: 'برای تایید عملیات، لطفاً عبارت DELETE یا «حذف» را به درستی وارد کنید.' },
      400
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, role, password_hash, telegram_id, COALESCE(has_custom_password, 0) as has_custom_password
     FROM users WHERE id = ?`
  )
    .bind(u.id)
    .first<{
      id: string;
      email: string;
      role: string;
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
      return c.json({ error: 'رمز عبور فعلی جهت تایید صحیح نیست.' }, 401);
    }
  }

  const isPrivileged = row.role === 'owner' || row.role === 'admin' || u.role === 'owner' || u.role === 'admin';
  const botToken = row.telegram_id ? await resolveTelegramBotToken(c.env) : '';

  if (isPrivileged) {
    await resetPrivilegedUserAccountToFreshState(c.env.DB, u.id);
    if (row.telegram_id && botToken) {
      const bot = new TelegramBotClient(botToken);
      await bot
        .sendMessage(
          row.telegram_id,
          '♻️ حساب مدیریتی شما در دلارینو کاملاً پاکسازی و به حالت صفر (مانند کاربر تازه‌وارد) بازنشانی شد؛ دسترسی مدیریت و امتیازات ویژه شما همچنان فعال است.'
        )
        .catch(() => {});
    }
    return c.json({
      ok: true,
      deleted: false,
      resetAdminAccount: true,
      role: row.role,
      message: 'تمام موجودی‌ها، معاملات، کیف‌پول‌ها و سوابق حساب مدیریتی به ۰ بازنشانی شد و دسترسی مدیریت حفظ گردید.',
    });
  }

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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  if (!toggles.walletAuthEnabled) {
    return c.json(
      { error: 'ورود و ثبت‌نام با کیف‌پول هنوز توسط مدیر سایت فعال نشده است.', code: 'WALLET_AUTH_DISABLED' },
      403
    );
  }
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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  if (!toggles.walletAuthEnabled) {
    return c.json(
      { error: 'ورود و ثبت‌نام با کیف‌پول هنوز توسط مدیر سایت فعال نشده است.', code: 'WALLET_AUTH_DISABLED' },
      403
    );
  }
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
    // Public wallet registration NEVER grants owner/admin role
    const role = 'user';
    const id = randomId('usr');
    const shortTag = address.slice(2, 8).toLowerCase();
    const email = `wallet_${shortTag}_${id.slice(-4)}@wallet.dollarino.local`;
    const username = `wallet_${shortTag}_${id.slice(-4)}`;
    const pwdHash = await hashPassword(randomId('wl_pwd'));
    const myRefCode = generateReferralCode();
    const fp = await buildClientFingerprints(c.req.raw, c.env);
    const effectiveRefCode = await resolveEffectiveReferralCode(c.env.DB, body.referralCode, id);

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
        effectiveRefCode,
        fp.ipHash,
        fp.uaHash
      )
      .run();

    await ensureUserDefaults(c.env.DB, id);
    await attachReferralIfProvided(c.env, id, effectiveRefCode || undefined, clientIp, fp);

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
    // Public Google registration NEVER grants owner/admin role
    const role = 'user';
    const id = randomId('usr');
    const localSlug = (cleanEmail.split('@')[0] || 'trader').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) || 'google';
    const username = `${localSlug}_${id.slice(-4)}`;
    const pwdHash = await hashPassword(randomId('gg_pwd'));
    const myRefCode = generateReferralCode();
    const fp = await buildClientFingerprints(c.req.raw, c.env);
    const effectiveRefCode = await resolveEffectiveReferralCode(c.env.DB, gProfile.referralCode, id);

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
        effectiveRefCode,
        fp.ipHash,
        fp.uaHash
      )
      .run();

    await ensureUserDefaults(c.env.DB, id);
    await attachReferralIfProvided(c.env, id, effectiveRefCode || undefined, clientIp, fp);

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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  if (!toggles.googleAuthEnabled) {
    return c.json(
      { error: 'ورود و ثبت‌نام با گوگل هنوز توسط مدیر سایت فعال نشده است.', code: 'GOOGLE_AUTH_DISABLED' },
      403
    );
  }
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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  const gCfg = await resolveGoogleOAuthConfig(c.env);
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  if (!toggles.googleAuthEnabled) {
    return c.redirect(`${origin}/?auth_error=google_auth_disabled`);
  }
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
  const toggles = await resolveAuthProviderToggles(c.env.DB);
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const code = (c.req.query('code') || '').trim();
  const state = (c.req.query('state') || '').trim();
  const errParam = (c.req.query('error') || '').trim();

  if (!toggles.googleAuthEnabled) {
    return c.redirect(`${origin}/?auth_error=google_auth_disabled`);
  }
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
    .json<{ displayName?: string; username?: string; password?: string; email?: string; phoneNumber?: string; phone?: string }>()
    .catch(() => ({} as { displayName?: string; username?: string; password?: string; email?: string; phoneNumber?: string; phone?: string }));

  const displayName = (body.displayName || '').trim();
  const username = (body.username || '').trim();
  const password = body.password || '';
  const email = (body.email || '').trim().toLowerCase();
  const rawPhone = body.phoneNumber ?? body.phone;
  let normalizedPhone: string | null = null;
  if (rawPhone !== undefined && String(rawPhone).trim() !== '') {
    normalizedPhone = normalizePhoneInput(String(rawPhone));
    if (!normalizedPhone) {
      return c.json({ error: 'شماره تماس وارد شده معتبر نیست (۷ تا ۱۶ رقم وارد کنید).' }, 400);
    }
  }

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

  const existingPhoneRow = await c.env.DB.prepare(
    `SELECT phone_number, COALESCE(phone_verified, 0) as phone_verified FROM users WHERE id = ? LIMIT 1`
  )
    .bind(u.id)
    .first<{ phone_number: string | null; phone_verified: number }>()
    .catch(() => null);
  const nextPhone =
    existingPhoneRow?.phone_verified === 1 && existingPhoneRow.phone_number
      ? existingPhoneRow.phone_number
      : normalizedPhone || existingPhoneRow?.phone_number || null;

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `UPDATE users
     SET display_name = ?,
         username = ?,
         email = ?,
         phone_number = ?,
         password_hash = ?,
         has_custom_password = 1,
         profile_completed = 1,
         last_active_at = datetime('now')
     WHERE id = ?`
  )
    .bind(displayName, username, nextEmail, nextPhone, passwordHash, u.id)
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

function normalizeTotpDigits(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, '');
}

async function verifyTotpForRequest(
  c: { req: { url: string; header: (name: string) => string | undefined } },
  secretBase32: string,
  rawCode: string,
  clientTimestampMs?: unknown
): Promise<boolean> {
  const clean = normalizeTotpDigits(rawCode);
  if (!/^\d{6}$/.test(clean)) return false;

  // Always check authoritative server clock first with ±2 step tolerance (±60s)
  if (await verifyTotpCode(secretBase32, clean, 2)) {
    return true;
  }

  // In local / sandbox previews (no Cloudflare edge cf-ray header), container OS clock may differ from real-world phone clock.
  // Production Cloudflare edge always injects cf-ray, so clientTimestampMs is strictly ignored in production.
  const hasCfEdge = Boolean(c.req.header('cf-ray'));
  if (!hasCfEdge) {
    let urlHost = '';
    try {
      urlHost = new URL(c.req.url).hostname.toLowerCase();
    } catch {
      urlHost = '';
    }
    const isLocalPreview =
      urlHost === '127.0.0.1' ||
      urlHost === 'localhost' ||
      urlHost === '::1' ||
      urlHost.endsWith('.e2b.app');
    const tsNum = typeof clientTimestampMs === 'number' ? clientTimestampMs : Number(clientTimestampMs);
    if (isLocalPreview && Number.isFinite(tsNum) && tsNum > 1_577_836_800_000 && tsNum < 2_208_988_800_000) {
      if (await verifyTotpCode(secretBase32, clean, 2, tsNum)) {
        return true;
      }
    }
  }

  return false;
}

// ==================== 3B) Mandatory Initial Admin Credential Change + TOTP 2FA Migration ====================

authRoutes.post('/complete-admin-setup', requireAuth, async (c) => {
  const u = c.get('user');
  if (u.role !== 'owner' && u.role !== 'admin') {
    return c.json({ error: 'Only admin/owner accounts can perform admin security setup.' }, 403);
  }

  const body = await c.req
    .json<{
      username?: string;
      newUsername?: string;
      password?: string;
      newPassword?: string;
      email?: string;
      newEmail?: string;
      displayName?: string;
      totpCode?: string;
      code?: string;
      clientTimestampMs?: number;
    }>()
    .catch(
      () =>
        ({} as {
          username?: string;
          newUsername?: string;
          password?: string;
          newPassword?: string;
          email?: string;
          newEmail?: string;
          displayName?: string;
          totpCode?: string;
          code?: string;
          clientTimestampMs?: number;
        })
    );

  const username = (body.username || body.newUsername || '').trim();
  const password = body.password || body.newPassword || '';
  const email = (body.email || body.newEmail || '').trim().toLowerCase();
  const displayName = (body.displayName || '').trim() || username;
  const totpCode = normalizeTotpDigits(body.totpCode || body.code);

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return c.json({ error: 'نام کاربری جدید باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ . - باشد.' }, 400);
  }
  if (username.toLowerCase() === 'admin') {
    return c.json({ error: 'نام کاربری جدید نمی‌تواند همچنان admin باقی بماند؛ لطفاً نام کاربری اختصاصی انتخاب کنید.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' }, 400);
  }
  if (password === 'admin' || password === 'admin123') {
    return c.json({ error: 'رمز عبور جدید نمی‌تواند برابر با رمز پیش‌فرض اولیه باشد.' }, 400);
  }
  if (!/^\d{6}$/.test(totpCode)) {
    return c.json({ error: 'کد ۶ رقمی Google Authenticator جهت تبدیل رمز دوم ثابت به 2FA الزامی است.' }, 400);
  }

  const takenUsername = await c.env.DB.prepare(
    `SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1`
  )
    .bind(username, u.id)
    .first();
  if (takenUsername) {
    return c.json({ error: 'این نام کاربری قبلاً استفاده شده است.' }, 409);
  }

  const row = await c.env.DB.prepare(`SELECT email, totp_secret FROM users WHERE id = ? LIMIT 1`)
    .bind(u.id)
    .first<{ email: string; totp_secret: string | null }>();
  if (!row) return c.json({ error: 'User not found' }, 404);
  if (!row.totp_secret) {
    return c.json({ error: 'ابتدا کلید QR کد Google Authenticator را دریافت و اسکن کنید.' }, 400);
  }

  const validTotp = await verifyTotpForRequest(c, row.totp_secret, totpCode, body.clientTimestampMs);
  if (!validTotp) {
    return c.json({ error: 'کد ۶ رقمی Google Authenticator صحیح نیست. لطفاً ساعت دستگاه را بررسی و دوباره تلاش کنید.' }, 401);
  }

  let nextEmail = row.email;
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
  } else if (nextEmail === 'admin@dollarino.local') {
    nextEmail = `${username.toLowerCase()}@admin.dollarino.local`;
  }

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `UPDATE users
     SET username = ?,
         display_name = ?,
         email = ?,
         password_hash = ?,
         has_custom_password = 1,
         secondary_password_hash = NULL,
         must_change_credentials = 0,
         totp_enabled = 1,
         totp_verified_at = datetime('now'),
         profile_completed = 1,
         last_active_at = datetime('now')
     WHERE id = ?`
  )
    .bind(username, displayName, nextEmail, passwordHash, u.id)
    .run();

  invalidateAuthUserCache(c.env.DB, u.id);

  await publishSystemLogEvent(c.env, {
    category: 'SECURITY',
    level: 'INFO',
    source: 'AdminSetupGate',
    title: 'تکمیل ایمن‌سازی نخستین مدیر کل',
    details: `نام کاربری پیش‌فرض admin پاکسازی شد؛ حساب جدید: ${username} (${nextEmail}) · 2FA فعال شد.`,
    userId: u.id,
  }).catch(() => {});

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
  return c.json({ ok: true, token, mustChangeCredentials: false, user: fullUser });
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
  const body = await c.req.json<{ force?: boolean }>().catch(() => ({} as { force?: boolean }));
  const forceRegenerate = Boolean(body.force) || c.req.query('force') === '1';

  const row = await c.env.DB.prepare(
    `SELECT username, email, COALESCE(totp_enabled, 0) as totp_enabled, totp_secret FROM users WHERE id = ? LIMIT 1`
  )
    .bind(u.id)
    .first<{ username: string; email: string; totp_enabled: number; totp_secret: string | null }>();
  if (!row) return c.json({ error: 'User not found' }, 404);
  if (row.totp_enabled === 1) {
    return c.json({ error: 'احراز هویت دوعاملی هم‌اکنون فعال است.' }, 400);
  }

  // Keep existing unverified setup secret across StrictMode / reloads unless explicitly forced,
  // preventing race conditions where two concurrent requests overwrite the DB secret differently from the displayed QR.
  let secret = row.totp_secret && row.totp_secret.trim().length >= 16 && !forceRegenerate
    ? row.totp_secret.trim()
    : '';
  if (!secret) {
    secret = generateTotpSecret(20);
    await c.env.DB.prepare(`UPDATE users SET totp_secret = ? WHERE id = ?`).bind(secret, u.id).run();
  }
  const label = row.username || row.email;
  const otpauthUri = buildTotpOtpAuthUri(label, secret, 'Dollarino');

  return c.json({ ok: true, secret, otpauthUri, issuer: 'Dollarino', account: label });
});

authRoutes.post('/2fa/enable', requireAuth, async (c) => {
  const u = c.get('user');
  const body = await c.req
    .json<{ code?: string; clientTimestampMs?: number }>()
    .catch(() => ({} as { code?: string; clientTimestampMs?: number }));
  const code = normalizeTotpDigits(body.code);
  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: 'لطفاً کد ۶ رقمی Google Authenticator را وارد کنید.' }, 400);
  }

  const row = await c.env.DB.prepare(`SELECT totp_secret FROM users WHERE id = ? LIMIT 1`)
    .bind(u.id)
    .first<{ totp_secret: string | null }>();
  if (!row?.totp_secret) {
    return c.json({ error: 'ابتدا کلید راه‌اندازی 2FA را ایجاد کنید.' }, 400);
  }

  const valid = await verifyTotpForRequest(c, row.totp_secret, code, body.clientTimestampMs);
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

  const valid = await verifyTotpForRequest(c, row.totp_secret, code, (body as { clientTimestampMs?: number }).clientTimestampMs);
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

async function handleSecondFactorVerification(c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const clientIp = getClientIp(c.req.raw);
  const rl = await enforceRateLimit(c.env, `2fa:${clientIp}`, 20, 300);
  if (!rl.allowed) return c.json({ error: `تلاش بیش از حد. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const body = await c.req
    .json<{ tempToken?: string; challengeToken?: string; code?: string; secondaryPassword?: string; clientTimestampMs?: number }>()
    .catch(() => ({} as { tempToken?: string; challengeToken?: string; code?: string; secondaryPassword?: string; clientTimestampMs?: number }));
  const tempToken = (body.tempToken || body.challengeToken || '').trim();
  const payload = tempToken ? await verifyJwt(tempToken, c.env.SESSION_JWT_SECRET) : null;

  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    (payload.purpose !== '2fa_challenge' && payload.purpose !== 'secondary_password_challenge')
  ) {
    return c.json({ error: 'نشست تایید مرحله دوم منقضی شده است؛ لطفاً دوباره وارد شوید.' }, 401);
  }
  const issuedAt = Number(payload.issuedAt || 0);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 5 * 60_000) {
    return c.json({ error: 'زمان ۵ دقیقه‌ای تایید مرحله دوم به پایان رسید؛ لطفاً مجدداً وارد شوید.' }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_id, totp_secret, totp_enabled, secondary_password_hash
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
      secondary_password_hash: string | null;
    }>();

  if (!row || row.is_blocked) return c.json({ error: 'Account unavailable' }, 403);

  if (payload.purpose === 'secondary_password_challenge') {
    const secPwd = (body.secondaryPassword ?? body.code ?? '').trim();
    if (!secPwd || !row.secondary_password_hash) {
      return c.json({ error: 'رمز دوم ورود الزامی است.' }, 400);
    }
    const validSec = await verifyPassword(secPwd, row.secondary_password_hash);
    if (!validSec) {
      return c.json({ error: 'رمز دوم امنیتی صحیح نیست.' }, 401);
    }
  } else {
    const code = normalizeTotpDigits(body.code);
    if (!/^\d{6}$/.test(code)) {
      return c.json({ error: 'کد ۶ رقمی Google Authenticator الزامی است.' }, 400);
    }
    if (row.totp_enabled !== 1 || !row.totp_secret) return c.json({ error: '2FA not enabled' }, 400);
    const valid = await verifyTotpForRequest(c, row.totp_secret, code, body.clientTimestampMs);
    if (!valid) {
      return c.json({ error: 'کد تایید Google Authenticator نادرست است.' }, 401);
    }
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
  const fullUser = await c.env.DB.prepare(`SELECT ${USER_PROFILE_COLUMNS} FROM users WHERE id = ?`)
    .bind(row.id)
    .first<{ must_change_credentials?: number }>();
  const mustChangeCredentials = Boolean(Number(fullUser?.must_change_credentials ?? 0) === 1);
  return c.json({ ok: true, token, mustChangeCredentials, user: fullUser });
}

authRoutes.post('/2fa/verify-login', handleSecondFactorVerification);
authRoutes.post('/verify-secondary-password', handleSecondFactorVerification);

