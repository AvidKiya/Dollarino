import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { enforceRateLimit } from '../security.js';
import { dispatchMobileNotification } from '../services/mobile-push.js';
import { getAllCachedSystemSettings } from '../services/settings-cache.js';
import { DOLLARINO_VERSION } from '../version.js';

export const mobileRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Public mobile app bootstrap: lets the native Android shell inspect maintenance state,
 * minimum supported build, and auth capabilities before rendering login / main shell.
 */
mobileRoutes.get('/bootstrap', async (c) => {
  const settings = await getAllCachedSystemSettings(c.env.DB).catch(() => new Map<string, string>());
  const maintenanceEnabled = settings.get('site_maintenance_mode') === 'true';
  return c.json({
    ok: true,
    platform: 'android',
    serverVersion: DOLLARINO_VERSION,
    minSupportedVersion: '11.7.0',
    recommendedPollSeconds: 900,
    foregroundPollSeconds: 45,
    maintenance: {
      enabled: maintenanceEnabled,
      titleFa: settings.get('site_maintenance_title_fa') || 'سایت در حال بروزرسانی فنی است',
      messageFa: settings.get('site_maintenance_message_fa') || '',
    },
    channels: [
      { id: 'dollarino_signals', nameFa: 'سیگنال‌ها و رادار AI', importance: 'HIGH' },
      { id: 'dollarino_trades', nameFa: 'معاملات، سود و حد ضرر', importance: 'HIGH' },
      { id: 'dollarino_sniper', nameFa: 'اسنایپر و لیستینگ‌های جدید', importance: 'HIGH' },
      { id: 'dollarino_security', nameFa: 'امنیت حساب و خزانه', importance: 'MAX' },
      { id: 'dollarino_system', nameFa: 'اعلان‌های سیستم و کارمزد', importance: 'DEFAULT' },
    ],
    timestamp: new Date().toISOString(),
  });
});

mobileRoutes.use('/devices/*', requireAuth);
mobileRoutes.use('/notifications/*', requireAuth);

/**
 * Registers or refreshes an Android / iOS device and optional FCM push token.
 */
mobileRoutes.post('/devices/register', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    deviceId?: string;
    platform?: 'android' | 'ios';
    fcmToken?: string | null;
    appVersion?: string;
    appBuild?: number;
    deviceModel?: string;
    osVersion?: string;
    locale?: string;
    channels?: Record<string, boolean>;
  };

  const deviceId = String(body.deviceId || '').trim().slice(0, 128);
  if (!deviceId || deviceId.length < 6) {
    return c.json({ error: 'Valid deviceId is required' }, 400);
  }
  const platform = body.platform === 'ios' ? 'ios' : 'android';
  const fcmToken = body.fcmToken ? String(body.fcmToken).trim().slice(0, 512) : null;
  const pushProvider = fcmToken ? 'fcm' : 'poll';
  const appVersion = String(body.appVersion || DOLLARINO_VERSION).slice(0, 32);
  const appBuild = Number.isFinite(Number(body.appBuild)) ? Number(body.appBuild) : 110702;
  const deviceModel = body.deviceModel ? String(body.deviceModel).slice(0, 100) : null;
  const osVersion = body.osVersion ? String(body.osVersion).slice(0, 48) : null;
  const locale = body.locale === 'en' ? 'en' : 'fa';

  const defaultChannels = {
    signals: true,
    trades: true,
    sniper: true,
    security: true,
    system: true,
  };
  const channelsJson = JSON.stringify({
    ...defaultChannels,
    ...(body.channels && typeof body.channels === 'object' ? body.channels : {}),
  });

  await c.env.DB.prepare(
    `INSERT INTO mobile_push_devices
     (id, user_id, device_id, platform, push_provider, fcm_token, app_version, app_build, device_model, os_version, locale, channels_json, is_active, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(user_id, device_id) DO UPDATE SET
       platform = excluded.platform,
       push_provider = CASE WHEN excluded.fcm_token IS NOT NULL THEN 'fcm' ELSE mobile_push_devices.push_provider END,
       fcm_token = COALESCE(excluded.fcm_token, mobile_push_devices.fcm_token),
       app_version = excluded.app_version,
       app_build = excluded.app_build,
       device_model = COALESCE(excluded.device_model, mobile_push_devices.device_model),
       os_version = COALESCE(excluded.os_version, mobile_push_devices.os_version),
       locale = excluded.locale,
       channels_json = excluded.channels_json,
       is_active = 1,
       last_seen_at = datetime('now')`
  )
    .bind(randomId('mdev'), user.id, deviceId, platform, pushProvider, fcmToken, appVersion, appBuild, deviceModel, osVersion, locale, channelsJson)
    .run();

  return c.json({
    ok: true,
    deviceId,
    pushProvider,
    fcmConfiguredOnServer: Boolean((c.env.FCM_SERVER_KEY || '').trim()),
  });
});

mobileRoutes.delete('/devices/:deviceId', async (c) => {
  const user = c.get('user');
  const deviceId = c.req.param('deviceId').trim();
  await c.env.DB.prepare(`UPDATE mobile_push_devices SET is_active = 0, fcm_token = NULL WHERE user_id = ? AND device_id = ?`)
    .bind(user.id, deviceId)
    .run();
  return c.json({ ok: true });
});

/**
 * Reliable background & foreground mobile notification feed.
 * Android WorkManager & in-app bridge poll this endpoint with ?since=<ISO timestamp or notification id>
 * so alerts NEVER get lost even without Firebase or Google Play Services.
 */
mobileRoutes.get('/notifications/feed', async (c) => {
  const user = c.get('user');
  const sinceRaw = (c.req.query('since') || '').trim();
  const limit = Math.min(40, Math.max(1, Number(c.req.query('limit') || 25)));

  let rows: Array<{
    id: string;
    category: string;
    channel_id: string;
    priority: string;
    title: string;
    body: string;
    deep_link: string;
    data_json: string;
    read_at: string | null;
    created_at: string;
  }> = [];

  if (sinceRaw && /^\d{4}-\d{2}-\d{2}/.test(sinceRaw)) {
    const res = await c.env.DB.prepare(
      `SELECT id, category, channel_id, priority, title, body, deep_link, data_json, read_at, created_at
       FROM mobile_notifications_inbox
       WHERE user_id = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT ?`
    )
      .bind(user.id, sinceRaw, limit)
      .all<typeof rows[number]>();
    rows = res.results || [];
  } else {
    const res = await c.env.DB.prepare(
      `SELECT id, category, channel_id, priority, title, body, deep_link, data_json, read_at, created_at
       FROM mobile_notifications_inbox
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
      .bind(user.id, limit)
      .all<typeof rows[number]>();
    rows = res.results || [];
  }

  const [unreadRow, openTradesRow, botCfgRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM mobile_notifications_inbox WHERE user_id = ? AND read_at IS NULL`)
      .bind(user.id)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`)
      .bind(user.id)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT bot_state, trading_mode FROM bot_configs WHERE user_id = ? LIMIT 1`)
      .bind(user.id)
      .first<{ bot_state: string; trading_mode: string }>()
      .catch(() => null),
  ]);

  return c.json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      channelId: r.channel_id,
      priority: r.priority,
      title: r.title,
      body: r.body,
      deepLink: r.deep_link,
      data: (() => {
        try {
          return JSON.parse(r.data_json || '{}');
        } catch {
          return {};
        }
      })(),
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    })),
    unreadCount: Number(unreadRow?.cnt || 0),
    openPositionsCount: Number(openTradesRow?.cnt || 0),
    botState: botCfgRow?.bot_state || 'STOPPED',
    tradingMode: botCfgRow?.trading_mode || 'PAPER',
    cursor: rows[0]?.created_at || sinceRaw || new Date().toISOString().replace('T', ' ').slice(0, 19),
    serverTime: new Date().toISOString(),
  });
});

mobileRoutes.post('/notifications/ack', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { ids?: string[]; all?: boolean };
  if (body.all) {
    await c.env.DB.prepare(
      `UPDATE mobile_notifications_inbox SET read_at = COALESCE(read_at, datetime('now')) WHERE user_id = ? AND read_at IS NULL`
    )
      .bind(user.id)
      .run();
    return c.json({ ok: true, markedAll: true });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string').slice(0, 50) : [];
  for (const id of ids) {
    await c.env.DB.prepare(
      `UPDATE mobile_notifications_inbox SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ? AND user_id = ?`
    )
      .bind(id, user.id)
      .run();
  }
  return c.json({ ok: true, ackedCount: ids.length });
});

mobileRoutes.post('/notifications/test', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `mobtest:${user.id}`, 8, 300);
  if (!rl.allowed) return c.json({ error: `لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);

  const res = await dispatchMobileNotification(c.env, {
    userId: user.id,
    category: 'SIGNAL',
    title: 'تست اعلان موبایل دلارینو',
    body: 'اتصال اپلیکیشن اندروید و سرویس اعلان پس‌زمینه به بک‌اند کلادفلر با موفقیت برقرار است.',
    deepLink: 'dollarino://app?tab=dashboard',
    bypassPref: true,
    data: { test: true },
  });

  return c.json({
    ok: true,
    ...res,
  });
});
