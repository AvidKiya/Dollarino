import { decryptVaultJson, encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { getCachedSystemSetting, invalidateSettingsCache } from '../services/settings-cache.js';
import { TelegramBotClient } from './client.js';

export const DEFAULT_TG_COMMANDS = [
  { command: 'start', description: 'شروع، احراز هویت و منوی اصلی دلارینو' },
  { command: 'ai', description: 'چت با هوش مصنوعی اختصاصی + تحلیل عکس چارت' },
  { command: 'autostart', description: 'شروع خودکار ربات با یک کلیک' },
  { command: 'scan', description: 'شکار و ترید فوری با هوش مصنوعی' },
  { command: 'app', description: 'باز کردن مینی‌اپ معاملاتی دلارینو' },
  { command: 'weblogin', description: 'دریافت لینک ورود فوری با یک کلیک به سایت' },
  { command: 'wizard', description: 'راه‌اندازی ۴ مرحله‌ای ربات ترید' },
  { command: 'positions', description: 'مشاهده و مدیریت معاملات باز' },
  { command: 'balance', description: 'نمایش موجودی لحظه‌ای حساب' },
  { command: 'wallet', description: 'مدیریت کیف‌پول Trust Wallet DApp' },
  { command: 'dex', description: 'رادار توکن‌های داغ DexScreener' },
  { command: 'myai', description: 'آموزش و فعال‌سازی هوش مصنوعی من' },
  { command: 'copy', description: 'کپی‌ترید تاییدشده دلارینو' },
  { command: 'card', description: 'صدور و دریافت تصویر کارت سود دلارینو' },
  { command: 'settings', description: 'تنظیمات بازار (اسپات/فیوچرز) و جهت' },
  { command: 'channels', description: 'کانال‌ها و گروه رسمی اکوسیستم دلارینو' },
  { command: 'support', description: 'پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران' },
  { command: 'rules', description: 'قوانین گروه و سپر ضداسکم دلارینو' },
  { command: 'about', description: 'معرفی دلارینو، شفافیت ضدپانزی و سازنده' },
  { command: 'help', description: 'راهنمای کامل و امنیت حساب' },
];

const TG_TOKEN_CACHE = new WeakMap<object, { ts: number; token: string; hasDbToken: boolean }>();
const TG_WH_SECRET_CACHE = new WeakMap<object, { ts: number; secret: string | undefined }>();
const TG_CACHE_TTL_MS = 300_000;

export function invalidateTelegramTokenCache(db?: D1Database): void {
  if (db) {
    TG_TOKEN_CACHE.delete(db as unknown as object);
    TG_WH_SECRET_CACHE.delete(db as unknown as object);
  }
}

export async function resolveOwnerTelegramId(env: Env): Promise<string> {
  const fromDb = await getCachedSystemSetting(env.DB, 'owner_telegram_id', '').catch(() => '');
  if (fromDb && fromDb.trim()) return fromDb.trim();
  return (env.OWNER_TELEGRAM_ID || '').trim();
}

export async function resolveTelegramBotUsername(env: Env): Promise<string> {
  const fromDb = await getCachedSystemSetting(env.DB, 'bot_username', '').catch(() => '');
  return (fromDb || '').trim().replace(/^@/, '');
}

export async function resolveTelegramBotToken(env: Env): Promise<string> {
  const now = Date.now();
  const cached = TG_TOKEN_CACHE.get(env.DB as unknown as object);
  if (cached && now - cached.ts < TG_CACHE_TTL_MS) {
    return cached.hasDbToken ? cached.token : (env.TELEGRAM_BOT_TOKEN || '').trim();
  }
  try {
    const row = await env.DB.prepare(
      `SELECT value FROM system_settings WHERE key = 'telegram_bot_token_enc' LIMIT 1`
    )
      .first<{ value: string }>()
      .catch(() => null);
    if (row?.value && env.MASTER_ENCRYPTION_KEY) {
      const dec = await decryptVaultJson<{ botToken?: string }>(row.value, env.MASTER_ENCRYPTION_KEY).catch(() => null);
      if (dec?.botToken && dec.botToken.trim().length > 15) {
        const val = dec.botToken.trim();
        TG_TOKEN_CACHE.set(env.DB as unknown as object, { ts: now, token: val, hasDbToken: true });
        return val;
      }
    }
  } catch {
    // Fall back to worker secret
  }
  TG_TOKEN_CACHE.set(env.DB as unknown as object, { ts: now, token: '', hasDbToken: false });
  return (env.TELEGRAM_BOT_TOKEN || '').trim();
}

export async function resolveTelegramWebhookSecret(env: Env): Promise<string | undefined> {
  if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
    return env.TELEGRAM_WEBHOOK_SECRET.trim();
  }
  const now = Date.now();
  const cached = TG_WH_SECRET_CACHE.get(env.DB as unknown as object);
  if (cached && now - cached.ts < TG_CACHE_TTL_MS) {
    return cached.secret;
  }
  const row = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'telegram_webhook_secret_auto' LIMIT 1`
  )
    .first<{ value: string }>()
    .catch(() => null);
  const val = row?.value?.trim() || undefined;
  TG_WH_SECRET_CACHE.set(env.DB as unknown as object, { ts: now, secret: val });
  return val;
}

export async function getTelegramBotTokenStatus(env: Env): Promise<{
  configured: boolean;
  source: 'db' | 'env' | 'none';
  masked: string;
  botUsername: string;
}> {
  const botUserRow = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'bot_username' LIMIT 1`
  )
    .first<{ value: string }>()
    .catch(() => null);

  let source: 'db' | 'env' | 'none' = 'none';
  let token = '';

  const encRow = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'telegram_bot_token_enc' LIMIT 1`
  )
    .first<{ value: string }>()
    .catch(() => null);

  if (encRow?.value && env.MASTER_ENCRYPTION_KEY) {
    const dec = await decryptVaultJson<{ botToken?: string }>(encRow.value, env.MASTER_ENCRYPTION_KEY).catch(() => null);
    if (dec?.botToken?.trim()) {
      token = dec.botToken.trim();
      source = 'db';
    }
  }

  if (!token && env.TELEGRAM_BOT_TOKEN?.trim()) {
    token = env.TELEGRAM_BOT_TOKEN.trim();
    source = 'env';
  }

  return {
    configured: Boolean(token),
    source,
    masked: token ? maskSecret(token) : '',
    botUsername: (botUserRow?.value || '').replace(/^@/, ''),
  };
}

export async function clearDbTelegramBotToken(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM system_settings WHERE key = 'telegram_bot_token_enc'`).run().catch(() => {});
  invalidateTelegramTokenCache(env.DB);
}

export async function saveAndConfigureTelegramBot(
  env: Env,
  opts: {
    botToken?: string;
    webhookBaseUrl?: string;
    webAppUrl?: string;
  }
): Promise<{
  ok: boolean;
  source: 'db' | 'env';
  masked: string;
  bot?: { id: number; username: string; first_name: string };
  webhookUrl: string;
  webhookSet: boolean;
  webhookNote?: string;
  webhookInfo?: { url: string; pending_update_count: number; last_error_message?: string } | null;
  error?: string;
}> {
  const incomingToken = (opts.botToken || '').trim();
  const isNewToken = Boolean(incomingToken);
  const token = incomingToken || (await resolveTelegramBotToken(env));

  if (!token) {
    return {
      ok: false,
      source: 'env',
      masked: '',
      webhookUrl: '',
      webhookSet: false,
      error: 'توکن ربات تلگرام وارد نشده و روی کلادفلر نیز تنظیم نشده است.',
    };
  }

  if (isNewToken && !/^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return {
      ok: false,
      source: 'db',
      masked: '',
      webhookUrl: '',
      webhookSet: false,
      error: 'فرمت توکن ربات تلگرام معتبر نیست (مثال صحیح: 123456789:ABCdefGHIjklMNO...).',
    };
  }

  const client = new TelegramBotClient(token);
  let me: { id: number; username: string; first_name: string };
  try {
    me = await client.getMe();
  } catch (err) {
    return {
      ok: false,
      source: isNewToken ? 'db' : 'env',
      masked: maskSecret(token),
      webhookUrl: '',
      webhookSet: false,
      error: `توکن توسط تلگرام تایید نشد: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (isNewToken) {
    if (!env.MASTER_ENCRYPTION_KEY || env.MASTER_ENCRYPTION_KEY.length < 16) {
      return {
        ok: false,
        source: 'db',
        masked: maskSecret(token),
        webhookUrl: '',
        webhookSet: false,
        error: 'کلید رمزنگاری MASTER_ENCRYPTION_KEY تنظیم نشده است.',
      };
    }
    const enc = await encryptVaultJson({ botToken: token }, env.MASTER_ENCRYPTION_KEY);
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('telegram_bot_token_enc', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(enc)
      .run();
  }

  if (me.username) {
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('bot_username', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(me.username)
      .run()
      .catch(() => {});
    const cleanHandle = `@${me.username.replace(/^@/, '')}`;
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('telegram_support', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = CASE WHEN TRIM(COALESCE(value, '')) = '' THEN excluded.value ELSE value END, updated_at = datetime('now')`
    )
      .bind(cleanHandle)
      .run()
      .catch(() => {});
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('support_handle', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = CASE WHEN TRIM(COALESCE(value, '')) = '' THEN excluded.value ELSE value END, updated_at = datetime('now')`
    )
      .bind(cleanHandle)
      .run()
      .catch(() => {});
  }
  invalidateSettingsCache(env.DB);
  invalidateTelegramTokenCache(env.DB);

  let webhookSecret = await resolveTelegramWebhookSecret(env);
  if (!webhookSecret) {
    webhookSecret = `wh_${randomId('sec')}${randomId('k')}`.replace(/[^A-Za-z0-9_-]/g, '');
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('telegram_webhook_secret_auto', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(webhookSecret)
      .run()
      .catch(() => {});
  }

  const webAppUrl = (opts.webAppUrl || env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const base = (opts.webhookBaseUrl || webAppUrl).replace(/\/$/, '');
  const webhookUrl = `${base}/api/webhook/telegram`;

  await client.setMyCommands(DEFAULT_TG_COMMANDS).catch(() => {});
  if (webAppUrl.startsWith('https://')) {
    await client.setChatMenuButton(webAppUrl, 'پنل دلارینو').catch(() => {});
  }

  let webhookSet = false;
  let webhookNote: string | undefined;
  if (webhookUrl.startsWith('https://')) {
    try {
      await client.setWebhook(webhookUrl, webhookSecret);
      webhookSet = true;
    } catch (err) {
      webhookNote = err instanceof Error ? err.message : String(err);
    }
  } else {
    webhookNote = 'آدرس پیش‌نمایش محلی HTTPS نیست؛ برای ست شدن وب‌هوک تلگرام آدرس عمومی HTTPS لازم است (مثال: آدرس Worker یا دامنه Cloudflare).';
  }

  const webhookInfo = await client.getWebhookInfo().catch(() => null);

  return {
    ok: true,
    source: isNewToken ? 'db' : ((await getTelegramBotTokenStatus(env)).source === 'db' ? 'db' : 'env'),
    masked: maskSecret(token),
    bot: me,
    webhookUrl,
    webhookSet,
    webhookNote,
    webhookInfo,
  };
}
