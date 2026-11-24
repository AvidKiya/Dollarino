import type { Direction, DollarinoSignal } from '@dollarino/core';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserEntitlement } from '../routes/subscriptions.js';
import { TelegramBotClient } from '../telegram/client.js';
import { resolveTelegramBotToken } from '../telegram/token.js';
import {
  getSystemSettingValue,
  publishSignalBroadcast,
} from '../telegram/publisher.js';
import { executeSignalForUser } from './executor.js';

export interface CopyTradeRecord {
  id: string;
  trader_id: string;
  symbol: string;
  direction: Direction;
  leverage: number;
  entry_price: string;
  stop_loss: string | null;
  tp1: string | null;
  tp2: string | null;
  tp3: string | null;
  status: string;
  publish_status: string;
  note: string | null;
}

/**
 * Confirms a Copy Trader's trade for publication, broadcasts it to @Dollarino_official / subscribers,
 * and immediately mirrors exact parameters into all active auto_mirror follower accounts.
 */
export async function confirmAndMirrorCopyTrade(
  env: Env,
  copyTradeId: string,
  approve: boolean
): Promise<{
  ok: boolean;
  published: boolean;
  mirroredCount: number;
  skippedCount: number;
  channelMessageId?: number;
}> {
  const row = await env.DB.prepare(
    `SELECT ctt.*, ct.display_name AS trader_name
     FROM copy_trader_trades ctt
     JOIN copy_traders ct ON ct.id = ctt.trader_id
     WHERE ctt.id = ? LIMIT 1`
  ).bind(copyTradeId).first<CopyTradeRecord & { trader_name: string }>();

  if (!row) {
    return { ok: false, published: false, mirroredCount: 0, skippedCount: 0 };
  }

  if (!approve) {
    await env.DB.prepare(`UPDATE copy_trader_trades SET publish_status = 'REJECTED' WHERE id = ?`)
      .bind(copyTradeId).run();
    return { ok: true, published: false, mirroredCount: 0, skippedCount: 0 };
  }

  await env.DB.prepare(`UPDATE copy_trader_trades SET publish_status = 'PUBLISHED' WHERE id = ?`)
    .bind(copyTradeId).run();

  const entryNum = Number(row.entry_price) || 1;
  const fallbackSl = row.stop_loss || (row.direction === 'LONG' ? (entryNum * 0.98).toFixed(4) : (entryNum * 1.02).toFixed(4));
  const fallbackTp1 = row.tp1 || (row.direction === 'LONG' ? (entryNum * 1.03).toFixed(4) : (entryNum * 0.97).toFixed(4));

  const sig: DollarinoSignal = {
    symbol: row.symbol,
    direction: row.direction,
    timeframe: 'Copy',
    price: row.entry_price,
    stopLoss: fallbackSl,
    leverage: row.leverage,
    tp1: fallbackTp1,
    tp2: row.tp2 ?? undefined,
    tp3: row.tp3 ?? undefined,
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${row.trader_name}`,
  };

  const publishChan = (await getSystemSettingValue(env.DB, 'copy_publish_to_channel', 'true')) === 'true';
  const broadcast = await publishSignalBroadcast(env, {
    signal: sig,
    source: 'COPY_TRADE',
    engineKey: 'copy_trade',
    engineLabel: `🏆 کپی‌ترید تاییدشده · ${row.trader_name}`,
    publishToChannel: publishChan,
    notifySubscribers: false,
  });

  if (broadcast.channelMessageId) {
    await env.DB.prepare(`UPDATE copy_trader_trades SET channel_message_id = ? WHERE id = ?`)
      .bind(broadcast.channelMessageId, copyTradeId).run().catch(() => {});
  }

  // Mirror exact parameters immediately to all active followers of this trader
  const followers = await env.DB.prepare(
    `SELECT cs.user_id, cs.allocation_usd, cs.risk_multiplier, u.telegram_id, u.email, u.role
     FROM copy_subscriptions cs
     JOIN users u ON u.id = cs.user_id
     WHERE cs.trader_id = ? AND cs.is_active = 1 AND cs.auto_mirror = 1`
  ).bind(row.trader_id).all<{
    user_id: string;
    allocation_usd: number;
    risk_multiplier: number;
    telegram_id: string | null;
    email: string;
    role: 'owner' | 'admin' | 'user';
  }>();

  let mirroredCount = 0;
  let skippedCount = 0;
  const botToken = await resolveTelegramBotToken(env);
  const tg = botToken ? new TelegramBotClient(botToken) : null;

  for (const f of followers.results) {
    try {
      // Mutual exclusion safety check: do not mirror if user has another autonomous engine running
      const followerBot = await env.DB.prepare(
        `SELECT bot_state, strategy_key FROM bot_configs WHERE user_id = ? LIMIT 1`
      )
        .bind(f.user_id)
        .first<{ bot_state: string; strategy_key: string }>()
        .catch(() => null);
      if (
        followerBot &&
        (followerBot.bot_state === 'RUNNING_PAPER' || followerBot.bot_state === 'RUNNING_LIVE') &&
        followerBot.strategy_key !== 'copy_trade'
      ) {
        skippedCount++;
        continue;
      }

      const ent = await resolveUserEntitlement(env.DB, {
        id: f.user_id,
        email: f.email,
        username: f.email,
        role: f.role,
        telegramId: f.telegram_id,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        skippedCount++;
        continue;
      }

      const execRes = await executeSignalForUser(env, f.user_id, sig, {
        signalId: broadcast.signalId,
        forceBypassState: true,
        strategyKey: 'copy_trade',
        aiConfidence: 95,
        aiReasoning: `Copy-Trade mirror from verified trader ${row.trader_name}`,
      });

      if (execRes.ok) {
        mirroredCount++;
        if (tg && f.telegram_id) {
          await tg.sendMessage(
            f.telegram_id,
            `🏆 معامله کپی‌ترید از ${row.trader_name} برای شما آینه‌سازی شد!\n\n` +
              `${row.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} · ${row.symbol} (${row.leverage}x)\n` +
              `📥 ورود: ${row.entry_price}\n⛔️ SL: ${fallbackSl}\n🎯 TP1: ${fallbackTp1}`
          ).catch(() => {});
        }
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  // Also mirror into V2 Pro Rules (copy_follow_rules where trader_kind = 'SITE_TRADER')
  const v2Followers = await env.DB.prepare(
    `SELECT r.*, u.telegram_id, u.email, u.role
     FROM copy_follow_rules r
     JOIN users u ON u.id = r.user_id
     WHERE r.trader_kind = 'SITE_TRADER' AND r.trader_id = ? AND r.is_active = 1`
  )
    .bind(row.trader_id)
    .all<{
      id: string;
      user_id: string;
      allocated_margin_usd: number;
      used_margin_usd: number;
      order_size_usd: number;
      leverage: number;
      tp1_pct: number;
      tp2_pct: number;
      tp3_pct: number;
      stop_loss_pct: number;
      reverse_copy: number;
      daily_max_loss_usd: number;
      daily_loss_used_usd: number;
      telegram_id: string | null;
      email: string;
      role: 'owner' | 'admin' | 'user';
    }>()
    .catch(() => ({ results: [] }));

  const legacyFollowedUserIds = new Set(followers.results.map((f) => f.user_id));

  for (const vr of v2Followers.results) {
    if (legacyFollowedUserIds.has(vr.user_id)) continue;
    try {
      if (vr.daily_loss_used_usd >= vr.daily_max_loss_usd) {
        skippedCount++;
        continue;
      }
      const ent = await resolveUserEntitlement(env.DB, {
        id: vr.user_id,
        email: vr.email,
        username: vr.email,
        role: vr.role,
        telegramId: vr.telegram_id,
      });
      if (!ent.hasPaidPlan && ent.subscriptionRequired) {
        skippedCount++;
        continue;
      }

      const dir: Direction = vr.reverse_copy
        ? row.direction === 'LONG'
          ? 'SHORT'
          : 'LONG'
        : row.direction;
      const lev = Math.max(1, Math.min(50, Number(vr.leverage || row.leverage || 5)));
      const slDist = entryNum * (Math.max(1, Number(vr.stop_loss_pct || 5)) / 100 / lev);
      const tp1Dist = entryNum * (Math.max(2, Number(vr.tp1_pct || 20)) / 100 / lev);
      const tp2Dist = entryNum * (Math.max(4, Number(vr.tp2_pct || 45)) / 100 / lev);
      const tp3Dist = entryNum * (Math.max(6, Number(vr.tp3_pct || 90)) / 100 / lev);

      const customSig: DollarinoSignal = {
        ...sig,
        direction: dir,
        leverage: lev,
        stopLoss: (dir === 'LONG' ? Math.max(0.0001, entryNum - slDist) : entryNum + slDist).toFixed(4),
        tp1: (dir === 'LONG' ? entryNum + tp1Dist : Math.max(0.0001, entryNum - tp1Dist)).toFixed(4),
        tp2: (dir === 'LONG' ? entryNum + tp2Dist : Math.max(0.0001, entryNum - tp2Dist)).toFixed(4),
        tp3: (dir === 'LONG' ? entryNum + tp3Dist : Math.max(0.0001, entryNum - tp3Dist)).toFixed(4),
        engineLabel: `🏆 کپی‌ترید پرو V2 · ${row.trader_name}`,
      };

      const execRes = await executeSignalForUser(env, vr.user_id, customSig, {
        signalId: broadcast.signalId,
        forceBypassState: true,
        strategyKey: 'copy_trade',
        aiConfidence: 96,
        aiReasoning: `Copy-Trade V2 Pro Rule (Margin Box $${vr.allocated_margin_usd}, ${lev}x, TP1 +${vr.tp1_pct}%)`,
      });
      if (execRes.ok) {
        mirroredCount++;
        if (tg && vr.telegram_id) {
          await tg
            .sendMessage(
              vr.telegram_id,
              `🏆 معامله کپی‌ترید پرو V2 از **${row.trader_name}** با قوانین اختصاصی شما باز شد!\n\n` +
                `${dir === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} · ${row.symbol} (${lev}x)\n` +
                `💼 باکس اختصاصی: $${vr.allocated_margin_usd} | ورود: ${row.entry_price}\n` +
                `⛔️ SL: ${customSig.stopLoss} | 🎯 TP1: ${customSig.tp1}`
            )
            .catch(() => {});
        }
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return {
    ok: true,
    published: true,
    mirroredCount,
    skippedCount,
    channelMessageId: broadcast.channelMessageId,
  };
}
