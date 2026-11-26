import { Hono } from 'hono';
import {
  evaluateIndicatorAlertRule,
  formatDollarinoSignal,
  FREE_TV_ALERT_TEMPLATES,
  parseDollarinoSignal,
  TRADINGVIEW_INDICATOR_CATALOG,
  type Timeframe,
} from '@dollarino/core';
import { requireAuth, type AppVariables } from '../auth.js';
import { decryptVaultJson, encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import { executeSignalForUser, logAudit, notifyUserTelegram } from '../engine/executor.js';
import type { Env } from '../env.js';
import { fetchPublicKlines } from '../exchanges/paper.js';
import { TelegramBotClient } from '../telegram/client.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { publishAlertToRadarChannel } from '../telegram/publisher.js';
import {
  DEFAULT_TG_COMMANDS,
  resolveTelegramBotToken,
  resolveTelegramWebhookSecret,
  saveAndConfigureTelegramBot,
} from '../telegram/token.js';
import { getCachedSystemSetting } from '../services/settings-cache.js';

export { DEFAULT_TG_COMMANDS };

export const webhookRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * TradingView Alert Webhook: accepts JSON or raw Dollarino signal text!
 * Routes the signal to Auto-Trade OR sends Manual-Trade inline button to Telegram!
 */
webhookRoutes.post('/tv/:secret', async (c) => {
  const secret = c.req.param('secret');
  const cfg = await c.env.DB.prepare(
    `SELECT bc.user_id, bc.trade_execution_mode, bc.signal_channel_handle, u.telegram_id, u.email, u.username, u.role
     FROM bot_configs bc JOIN users u ON bc.user_id = u.id
     WHERE bc.webhook_secret = ?`
  ).bind(secret).first<{
    user_id: string;
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    signal_channel_handle: string;
    telegram_id: string | null;
    email: string;
    username: string;
    role: 'owner' | 'admin' | 'user';
  }>();

  if (!cfg) return c.json({ error: 'Invalid TradingView webhook secret' }, 404);
  if (cfg.role !== 'owner' && cfg.role !== 'admin') {
    return c.json(
      {
        error: 'وبهوک تریدینگ‌ویو و چنل سیگنال تلگرام فقط در اختیار ادمین و مدیریت سیستم است.',
        code: 'WEBHOOK_ADMIN_ONLY',
      },
      403
    );
  }

  const rawBody = await c.req.text();
  const signal = parseDollarinoSignal(rawBody);
  if (!signal) {
    return c.json({ error: 'Unrecognized signal payload. Provide Dollarino text or JSON with symbol/direction/price/stop/tp1.' }, 400);
  }

  const formatted = formatDollarinoSignal({
    ...signal,
    channelHandle: signal.channelHandle || cfg.signal_channel_handle || undefined,
  });

  const sigId = randomId('sig');
  await c.env.DB.prepare(
    `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
     VALUES (?, ?, 'tradingview_webhook', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
  ).bind(
    sigId,
    cfg.user_id,
    signal.symbol,
    signal.direction,
    signal.timeframe,
    signal.price,
    signal.stopLoss,
    signal.leverage,
    signal.tp1,
    signal.tp2 ?? null,
    signal.tp3 ?? null,
    signal.slPct ?? null,
    signal.tp1Pct ?? null,
    signal.tp2Pct ?? null,
    signal.tp3Pct ?? null,
    formatted
  ).run();

  await logAudit(c.env.DB, cfg.user_id, 'SIGNAL', 'INFO', `TradingView Webhook received ${signal.direction} ${signal.symbol}`, signal.symbol);

  if (cfg.trade_execution_mode === 'AUTO') {
    const exec = await executeSignalForUser(c.env, cfg.user_id, signal, {
      signalId: sigId,
      forceBypassState: true,
      strategyKey: 'tradingview_webhook',
    });
    if (exec.ok) {
      await c.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
    }
    return c.json({ ok: exec.ok, mode: 'AUTO', signalId: sigId, tradeId: exec.tradeId, error: exec.error });
  }

  // Manual Confirm Mode: push Telegram inline card with exact 2-step confirmation flow
  await notifyUserTelegram(
    c.env,
    cfg.user_id,
    `📡 سیگنال جدید TradingView:\n\n${formatted}`,
    [
      [
        { text: 'دلارینو ترید کن برام 🤖', callback_data: `manual_trade:${sigId}`, style: 'success' },
        { text: 'تایید و اجرای فوری ✅', callback_data: `manual_confirm:${sigId}`, style: 'primary' },
      ],
    ]
  );
  return c.json({ ok: true, mode: 'MANUAL_CONFIRM', signalId: sigId, formatted });
});

/**
 * Global instance Telegram Bot Webhook
 */
webhookRoutes.post('/telegram', async (c) => {
  const botToken = await resolveTelegramBotToken(c.env);
  if (!botToken) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured on this worker' }, 503);
  }
  const expectedSecret = await resolveTelegramWebhookSecret(c.env);
  if (expectedSecret) {
    const hdr = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (hdr !== expectedSecret) {
      return c.json({ error: 'Unauthorized webhook secret' }, 403);
    }
  }
  const update = await c.req.json();
  const result = await handleTelegramUpdate(c.env, botToken, update);
  return c.json(result);
});

/**
 * Personal user-registered Telegram Bot Webhook (/api/webhook/telegram/:botId or /api/telegram/webhook/:botId)
 */
webhookRoutes.post('/telegram/:botId', async (c) => {
  const botId = c.req.param('botId');
  const row = await c.env.DB.prepare(
    `SELECT encrypted_bot_token, webhook_secret, is_active FROM telegram_bots WHERE id = ?`
  ).bind(botId).first<{ encrypted_bot_token: string; webhook_secret: string; is_active: number }>();

  if (!row || !row.is_active) return c.json({ error: 'Bot inactive or not found' }, 404);
  const hdr = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (hdr && hdr !== row.webhook_secret) return c.json({ error: 'Forbidden' }, 403);

  const { botToken } = await decryptVaultJson<{ botToken: string }>(row.encrypted_bot_token, c.env.MASTER_ENCRYPTION_KEY);
  if (!botToken) return c.json({ error: 'Invalid bot token vault' }, 500);

  const update = await c.req.json();
  const result = await handleTelegramUpdate(c.env, botToken, update);
  return c.json(result);
});

/**
 * One-click global Telegram Bot provisioning: registers Webhook, Bot Commands, and Mini App Menu Button
 */
webhookRoutes.post('/telegram/setup', requireAuth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner' && user.role !== 'admin') {
    return c.json({ error: 'Admin role required' }, 403);
  }
  const body = await c.req.json<{ botToken?: string; webhookBaseUrl?: string; webAppUrl?: string }>().catch(
    () => ({} as { botToken?: string; webhookBaseUrl?: string; webAppUrl?: string })
  );
  const webhookBase = (body.webhookBaseUrl || new URL(c.req.url).origin).replace(/\/$/, '');
  const webAppUrl = (body.webAppUrl || c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const res = await saveAndConfigureTelegramBot(c.env, {
    botToken: body.botToken,
    webhookBaseUrl: webhookBase,
    webAppUrl,
  });
  if (!res.ok) {
    return c.json(res, res.masked ? 400 : 503);
  }
  return c.json({
    ...res,
    webAppUrl,
    commandsRegistered: DEFAULT_TG_COMMANDS.length,
  });
});

let memSyncedVersion = '';

export async function syncTelegramBotAutoOnVersion(env: Env, targetVersion = '10.5.0'): Promise<void> {
  if (memSyncedVersion === targetVersion) return;
  const cachedVersion = await getCachedSystemSetting(env.DB, 'tg_bot_synced_version', '').catch(() => '');
  if (cachedVersion === targetVersion && !env.HILINKUP_TEST_API_KEY?.trim()) {
    memSyncedVersion = targetVersion;
    return;
  }

  if (env.HILINKUP_TEST_API_KEY?.trim() && env.MASTER_ENCRYPTION_KEY) {
    const testKey = env.HILINKUP_TEST_API_KEY.trim();
    const masked = maskSecret(testKey);
    const enc = await encryptVaultJson({ apiKey: testKey }, env.MASTER_ENCRYPTION_KEY).catch(() => null);
    if (enc) {
      await env.DB.prepare(
        `INSERT INTO platform_ai_engines (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, updated_at)
         VALUES ('paie_hilinkup_test_slot', 9, 'deepseek', ?, 'baidu/deepseek-v4.1-flash-1017', 'https://api.hilinkup.com/v1', 50, 0, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET api_key_masked = excluded.api_key_masked, encrypted_api_key = excluded.encrypted_api_key, updated_at = datetime('now')`
      )
        .bind(`تست Hilinkup (${masked.slice(-4)})`, masked, enc)
        .run()
        .catch(() => {});
    }
  }

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) {
    memSyncedVersion = targetVersion;
    return;
  }
  const row = await env.DB.prepare(
    `SELECT value FROM system_settings WHERE key = 'tg_bot_synced_version' LIMIT 1`
  ).first<{ value: string }>().catch(() => null);
  if (row?.value === targetVersion) {
    memSyncedVersion = targetVersion;
    return;
  }

  const client = new TelegramBotClient(botToken);
  const webAppUrl = (env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const webhookUrl = `${webAppUrl}/api/webhook/telegram`;
  const webhookSecret = await resolveTelegramWebhookSecret(env);

  await client.setMyCommands(DEFAULT_TG_COMMANDS).catch(() => {});
  if (webAppUrl.startsWith('https://')) {
    await client.setChatMenuButton(webAppUrl, 'پنل دلارینو').catch(() => {});
    await client.setWebhook(webhookUrl, webhookSecret).catch(() => {});
  }
  await env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('tg_bot_synced_version', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).bind(targetVersion).run().catch(() => {});
  memSyncedVersion = targetVersion;
}

// ============================================================================
// 100% FREE TradingView Indicators Catalog & Free Internal Alert Engine
// ============================================================================

webhookRoutes.get('/indicators', (c) => {
  return c.json({
    ok: true,
    freeForever: true,
    indicators: TRADINGVIEW_INDICATOR_CATALOG,
    alertTemplates: FREE_TV_ALERT_TEMPLATES,
  });
});

webhookRoutes.get('/alerts', requireAuth, async (c) => {
  const user = c.get('user');
  const [rows, cfg] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM tradingview_free_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`
    ).bind(user.id).all(),
    c.env.DB.prepare(`SELECT webhook_secret, trade_execution_mode FROM bot_configs WHERE user_id = ?`)
      .bind(user.id).first<{ webhook_secret: string; trade_execution_mode: string }>(),
  ]);

  const isPrivileged = user.role === 'owner' || user.role === 'admin';
  const origin = new URL(c.req.url).origin.replace(/\/$/, '');
  const webhookUrl = isPrivileged && cfg?.webhook_secret ? `${origin}/api/webhook/tv/${cfg.webhook_secret}` : null;

  return c.json({
    ok: true,
    freeForever: true,
    webhookUrl,
    webhookAdminOnly: !isPrivileged,
    executionMode: cfg?.trade_execution_mode ?? 'AUTO',
    alerts: rows.results,
    templates: FREE_TV_ALERT_TEMPLATES,
    indicators: TRADINGVIEW_INDICATOR_CATALOG,
  });
});

webhookRoutes.post('/alerts', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    symbol?: string;
    timeframe?: string;
    indicatorId?: string;
    params?: Record<string, number>;
    directionOverride?: 'AUTO' | 'LONG' | 'SHORT';
    autoTrade?: boolean;
    notifyTelegram?: boolean;
  };

  const indicatorId = String(body.indicatorId || 'RSI_OVERSOLD').trim();
  const tmpl = FREE_TV_ALERT_TEMPLATES.find((t) => t.id === indicatorId);
  const symbol = String(body.symbol || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const timeframe = String(body.timeframe || '15m').trim();
  const name = String(body.name || tmpl?.nameFa || `${indicatorId} · ${symbol}`).trim();
  const paramsJson = JSON.stringify(body.params || tmpl?.defaultParams || {});
  const dirOverride = body.directionOverride === 'LONG' || body.directionOverride === 'SHORT' ? body.directionOverride : 'AUTO';
  const id = randomId('tva');

  await c.env.DB.prepare(
    `INSERT INTO tradingview_free_alerts (id, user_id, name, symbol, timeframe, indicator_id, params_json, direction_override, auto_trade, notify_telegram, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    user.id,
    name,
    symbol,
    timeframe,
    indicatorId,
    paramsJson,
    dirOverride,
    body.autoTrade === false ? 0 : 1,
    body.notifyTelegram === false ? 0 : 1
  ).run();

  const created = await c.env.DB.prepare(`SELECT * FROM tradingview_free_alerts WHERE id = ?`).bind(id).first();
  return c.json({ ok: true, alert: created }, 201);
});

webhookRoutes.patch('/alerts/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { isActive?: boolean; autoTrade?: boolean };
  const sets: string[] = [`updated_at = datetime('now')`];
  const vals: unknown[] = [];
  if (typeof body.isActive === 'boolean') {
    sets.push(`is_active = ?`);
    vals.push(body.isActive ? 1 : 0);
  }
  if (typeof body.autoTrade === 'boolean') {
    sets.push(`auto_trade = ?`);
    vals.push(body.autoTrade ? 1 : 0);
  }
  vals.push(id, user.id);
  await c.env.DB.prepare(`UPDATE tradingview_free_alerts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

webhookRoutes.delete('/alerts/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM tradingview_free_alerts WHERE id = ? AND user_id = ?`).bind(id, user.id).run();
  return c.json({ ok: true });
});

export async function evaluateTradingViewFreeAlerts(env: Env, onlyUserId?: string): Promise<{ checked: number; triggered: number }> {
  const query = onlyUserId
    ? `SELECT a.*, bc.trade_execution_mode, bc.max_leverage
       FROM tradingview_free_alerts a
       LEFT JOIN bot_configs bc ON bc.user_id = a.user_id
       WHERE a.is_active = 1 AND a.user_id = ? LIMIT 40`
    : `SELECT a.*, bc.trade_execution_mode, bc.max_leverage
       FROM tradingview_free_alerts a
       LEFT JOIN bot_configs bc ON bc.user_id = a.user_id
       WHERE a.is_active = 1 LIMIT 50`;

  const rows = await (onlyUserId ? env.DB.prepare(query).bind(onlyUserId) : env.DB.prepare(query))
    .all<{
      id: string;
      user_id: string;
      name: string;
      symbol: string;
      timeframe: string;
      indicator_id: string;
      params_json: string;
      direction_override: 'AUTO' | 'LONG' | 'SHORT';
      auto_trade: number;
      notify_telegram: number;
      last_triggered_at: string | null;
      trade_execution_mode?: 'AUTO' | 'MANUAL_CONFIRM';
      max_leverage?: number;
    }>()
    .catch(() => ({ results: [] }));

  let checked = 0;
  let triggered = 0;
  const candleCache = new Map<string, Awaited<ReturnType<typeof fetchPublicKlines>>>();

  for (const row of rows.results) {
    checked++;
    const cacheKey = `${row.symbol}_${row.timeframe}`;
    let candles = candleCache.get(cacheKey);
    if (!candles) {
      candles = await fetchPublicKlines(row.symbol, (row.timeframe || '15m') as Timeframe, 120).catch(() => []);
      candleCache.set(cacheKey, candles);
    }
    if (!candles.length) continue;

    let params: Record<string, number> = {};
    try {
      params = row.params_json ? JSON.parse(row.params_json) : {};
    } catch {
      params = {};
    }

    const evalRes = evaluateIndicatorAlertRule({
      ruleId: row.indicator_id,
      candles,
      symbol: row.symbol,
      timeframe: row.timeframe,
      params,
      leverage: Math.min(20, Math.max(1, Number(row.max_leverage || 10))),
      directionOverride: row.direction_override || 'AUTO',
    });

    if (!evalRes.triggered || !evalRes.signal) continue;

    if (row.last_triggered_at) {
      const lastMs = Date.parse(row.last_triggered_at.includes('T') ? row.last_triggered_at : `${row.last_triggered_at.replace(' ', 'T')}Z`);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < 15 * 60_000) continue;
    }

    triggered++;
    const sigId = randomId('tvs');
    const formatted = formatDollarinoSignal(evalRes.signal);
    await env.DB.prepare(
      `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
       VALUES (?, ?, 'tradingview_free_alert', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
    ).bind(
      sigId,
      row.user_id,
      evalRes.signal.symbol,
      evalRes.signal.direction,
      evalRes.signal.timeframe,
      evalRes.signal.price,
      evalRes.signal.stopLoss,
      evalRes.signal.leverage,
      evalRes.signal.tp1,
      evalRes.signal.tp2 ?? null,
      evalRes.signal.tp3 ?? null,
      formatted
    ).run().catch(() => {});

    await env.DB.prepare(
      `UPDATE tradingview_free_alerts SET last_triggered_at = datetime('now'), last_signal_price = ?, trigger_count = trigger_count + 1, updated_at = datetime('now') WHERE id = ?`
    ).bind(Number(evalRes.signal.price), row.id).run().catch(() => {});

    if (row.notify_telegram) {
      await notifyUserTelegram(
        env,
        row.user_id,
        `🔔 **آلرت رایگان TradingView فعال شد!**\n📌 ${row.name}\n📊 ${evalRes.reasonFa}\n\n${formatted}`,
        row.auto_trade && row.trade_execution_mode === 'MANUAL_CONFIRM'
          ? [[
              { text: 'دلارینو ترید کن برام 🤖', callback_data: `manual_trade:${sigId}`, style: 'success' },
              { text: 'تایید و اجرای فوری ✅', callback_data: `manual_confirm:${sigId}`, style: 'primary' },
            ]]
          : undefined
      ).catch(() => {});
    }

    await publishAlertToRadarChannel(
      env,
      `📡 **آلرت رایگان اندیکاتور (${row.symbol} · ${row.timeframe})**\n${evalRes.reasonFa}\nقیمت: $${evalRes.signal.price}`
    ).catch(() => {});

    if (row.auto_trade && (row.trade_execution_mode ?? 'AUTO') === 'AUTO') {
      const exec = await executeSignalForUser(env, row.user_id, evalRes.signal, {
        signalId: sigId,
        forceBypassState: true,
        strategyKey: 'tradingview_free_alert',
      }).catch(() => ({ ok: false }));
      if (exec.ok) {
        await env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run().catch(() => {});
      }
    }
  }

  return { checked, triggered };
}

webhookRoutes.post('/alerts/evaluate-now', requireAuth, async (c) => {
  const user = c.get('user');
  const res = await evaluateTradingViewFreeAlerts(c.env, user.id);
  return c.json({ ok: true, ...res });
});

