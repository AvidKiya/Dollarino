import { Hono } from 'hono';
import { formatDollarinoSignal, parseDollarinoSignal } from '@dollarino/core';
import { decryptVaultJson, randomId } from '../crypto.js';
import { executeSignalForUser, logAudit, notifyUserTelegram } from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserEntitlement } from './subscriptions.js';
import { TelegramBotClient } from '../telegram/client.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

export const webhookRoutes = new Hono<{ Bindings: Env }>();

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

  const rawBody = await c.req.text();
  const signal = parseDollarinoSignal(rawBody);
  if (!signal) {
    return c.json({ error: 'Unrecognized signal payload. Provide Dollarino text or JSON with symbol/direction/price/stop/tp1.' }, 400);
  }

  const formatted = formatDollarinoSignal({
    ...signal,
    channelHandle: signal.channelHandle || cfg.signal_channel_handle || '@Dollarinoofficial',
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
    const ent = await resolveUserEntitlement(c.env.DB, {
      id: cfg.user_id,
      email: cfg.email,
      username: cfg.username,
      role: cfg.role,
      telegramId: cfg.telegram_id,
    });
    if (!ent.allowCopyTrade) {
      await logAudit(c.env.DB, cfg.user_id, 'RISK', 'WARN', 'Auto Copy-Trade skipped: active Pro/VIP subscription required', signal.symbol);
      return c.json({ ok: false, mode: 'AUTO', code: 'SUBSCRIPTION_REQUIRED', error: 'Active Pro/VIP subscription required for Auto Copy-Trade' }, 402);
    }
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

  // Manual Confirm Mode: push Telegram inline card if user has linked bot
  await notifyUserTelegram(c.env, cfg.user_id, `📡 سیگنال جدید TradingView آماده تایید در ربات/پنل وب:\n\n${formatted}`);
  return c.json({ ok: true, mode: 'MANUAL_CONFIRM', signalId: sigId, formatted });
});

/**
 * Global instance Telegram Bot Webhook
 */
webhookRoutes.post('/telegram', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured on this worker' }, 503);
  }
  if (c.env.TELEGRAM_WEBHOOK_SECRET) {
    const hdr = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (hdr !== c.env.TELEGRAM_WEBHOOK_SECRET) {
      return c.json({ error: 'Unauthorized webhook secret' }, 403);
    }
  }
  const update = await c.req.json();
  const result = await handleTelegramUpdate(c.env, c.env.TELEGRAM_BOT_TOKEN, update);
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
