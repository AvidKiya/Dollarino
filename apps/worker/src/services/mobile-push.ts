import { randomId } from '../crypto.js';
import type { Env } from '../env.js';

export type MobileNotificationCategory =
  | 'TRADE'
  | 'TP_SL'
  | 'SIGNAL'
  | 'SNIPER'
  | 'SECURITY'
  | 'SUBSCRIPTION'
  | 'SYSTEM';

export type AndroidChannelId =
  | 'dollarino_signals'
  | 'dollarino_trades'
  | 'dollarino_sniper'
  | 'dollarino_security'
  | 'dollarino_system';

export function resolveChannelAndDeepLink(
  category: MobileNotificationCategory,
  title: string,
  body: string
): { channelId: AndroidChannelId; channelPrefKey: string; deepLink: string; priority: 'high' | 'default' } {
  const joined = `${title} ${body}`.toLowerCase();
  if (
    category === 'SECURITY' ||
    joined.includes('2fa') ||
    joined.includes('vault') ||
    joined.includes('هشدار امنیتی') ||
    joined.includes('کد تایید') ||
    joined.includes('تغییر رمز') ||
    joined.includes('خروج از حساب')
  ) {
    return {
      channelId: 'dollarino_security',
      channelPrefKey: 'security',
      deepLink: 'dollarino://app?tab=security',
      priority: 'high',
    };
  }
  if (
    category === 'SNIPER' ||
    joined.includes('sniper') ||
    joined.includes('listing') ||
    joined.includes('meme') ||
    joined.includes('اسنایپر') ||
    joined.includes('لیستینگ')
  ) {
    return {
      channelId: 'dollarino_sniper',
      channelPrefKey: 'sniper',
      deepLink: 'dollarino://app?tab=sniper',
      priority: 'high',
    };
  }
  if (category === 'SIGNAL' || joined.includes('سیگنال') || joined.includes('signal') || joined.includes('radar') || joined.includes('تحلیل')) {
    return {
      channelId: 'dollarino_signals',
      channelPrefKey: 'signals',
      deepLink: 'dollarino://app?tab=signals',
      priority: 'high',
    };
  }
  if (category === 'TRADE' || category === 'TP_SL') {
    return {
      channelId: 'dollarino_trades',
      channelPrefKey: 'trades',
      deepLink: 'dollarino://app?tab=positions',
      priority: 'high',
    };
  }
  if (category === 'SUBSCRIPTION' || joined.includes('کارمزد') || joined.includes('خزانه') || joined.includes('fee') || joined.includes('treasury')) {
    return {
      channelId: 'dollarino_system',
      channelPrefKey: 'system',
      deepLink: 'dollarino://app?tab=treasury',
      priority: 'default',
    };
  }
  return {
    channelId: 'dollarino_system',
    channelPrefKey: 'system',
    deepLink: 'dollarino://app?tab=dashboard',
    priority: 'default',
  };
}

export async function enqueueMobileInboxNotification(
  db: D1Database,
  params: {
    userId: string;
    category: MobileNotificationCategory;
    title: string;
    body: string;
    deepLink?: string;
    data?: Record<string, unknown>;
  }
): Promise<{ id: string; channelId: AndroidChannelId; deepLink: string; priority: 'high' | 'default'; channelPrefKey: string } | null> {
  try {
    const cleanTitle = String(params.title || 'دلارینو').replace(/<[^>]+>/g, '').trim().slice(0, 140);
    const cleanBody = String(params.body || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);
    if (!cleanTitle && !cleanBody) return null;

    const meta = resolveChannelAndDeepLink(params.category, cleanTitle, cleanBody);
    const id = randomId('mntf');
    const deepLink = params.deepLink || meta.deepLink;
    const dataJson = JSON.stringify({
      category: params.category,
      channelId: meta.channelId,
      deepLink,
      ...(params.data || {}),
    });

    await db
      .prepare(
        `INSERT INTO mobile_notifications_inbox
         (id, user_id, category, channel_id, priority, title, body, deep_link, data_json, delivered_fcm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .bind(id, params.userId, params.category, meta.channelId, meta.priority, cleanTitle, cleanBody, deepLink, dataJson)
      .run();

    // Keep mobile inbox lean per user (max ~120 rows)
    await db
      .prepare(
        `DELETE FROM mobile_notifications_inbox
         WHERE user_id = ? AND id NOT IN (
           SELECT id FROM mobile_notifications_inbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 120
         )`
      )
      .bind(params.userId, params.userId)
      .run()
      .catch(() => {});

    return {
      id,
      channelId: meta.channelId,
      channelPrefKey: meta.channelPrefKey,
      deepLink,
      priority: meta.priority,
    };
  } catch {
    return null;
  }
}

async function sendLegacyFcmBatch(
  serverKey: string,
  tokens: string[],
  payload: {
    id: string;
    title: string;
    body: string;
    channelId: AndroidChannelId;
    deepLink: string;
    category: string;
    priority: 'high' | 'default';
  }
): Promise<boolean> {
  if (!serverKey || tokens.length === 0) return false;
  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registration_ids: tokens,
        priority: payload.priority === 'high' ? 'high' : 'normal',
        notification: {
          title: payload.title,
          body: payload.body,
          android_channel_id: payload.channelId,
          sound: 'default',
        },
        data: {
          id: payload.id,
          title: payload.title,
          body: payload.body,
          channelId: payload.channelId,
          deepLink: payload.deepLink,
          category: payload.category,
        },
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Persists a mobile notification into D1 inbox AND dispatches FCM push if configured.
 * Never throws so trading execution paths are never delayed or broken.
 */
export async function dispatchMobileNotification(
  env: Env,
  params: {
    userId: string;
    category: MobileNotificationCategory;
    title: string;
    body: string;
    deepLink?: string;
    data?: Record<string, unknown>;
    bypassPref?: boolean;
  }
): Promise<{ queued: boolean; fcmSent: boolean; notificationId?: string }> {
  try {
    if (!params.bypassPref) {
      const cfg = await env.DB.prepare(`SELECT notifications_enabled FROM bot_configs WHERE user_id = ? LIMIT 1`)
        .bind(params.userId)
        .first<{ notifications_enabled: number }>()
        .catch(() => null);
      if (cfg && cfg.notifications_enabled === 0) {
        return { queued: false, fcmSent: false };
      }
    }

    const queued = await enqueueMobileInboxNotification(env.DB, params);
    if (!queued) return { queued: false, fcmSent: false };

    let fcmSent = false;
    const fcmServerKey = (env.FCM_SERVER_KEY || '').trim();
    if (fcmServerKey) {
      const devices = await env.DB.prepare(
        `SELECT fcm_token, channels_json FROM mobile_push_devices
         WHERE user_id = ? AND is_active = 1 AND fcm_token IS NOT NULL AND fcm_token != ''`
      )
        .bind(params.userId)
        .all<{ fcm_token: string; channels_json: string }>()
        .catch(() => ({ results: [] }));

      const tokens = devices.results
        .filter((d) => {
          try {
            const parsed = JSON.parse(d.channels_json || '{}') as Record<string, boolean>;
            return parsed[queued.channelPrefKey] !== false;
          } catch {
            return true;
          }
        })
        .map((d) => d.fcm_token);

      if (tokens.length > 0) {
        fcmSent = await sendLegacyFcmBatch(fcmServerKey, tokens, {
          id: queued.id,
          title: params.title.replace(/<[^>]+>/g, '').slice(0, 140),
          body: params.body.replace(/<[^>]+>/g, '').slice(0, 500),
          channelId: queued.channelId,
          deepLink: queued.deepLink,
          category: params.category,
          priority: queued.priority,
        });
        if (fcmSent) {
          await env.DB.prepare(`UPDATE mobile_notifications_inbox SET delivered_fcm = 1 WHERE id = ?`)
            .bind(queued.id)
            .run()
            .catch(() => {});
        }
      }
    }

    return { queued: true, fcmSent, notificationId: queued.id };
  } catch {
    return { queued: false, fcmSent: false };
  }
}
