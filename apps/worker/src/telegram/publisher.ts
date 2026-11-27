import {
  formatDollarinoSignal,
  resolveEngineDisplayLabel,
  type Direction,
  type DollarinoSignal,
} from '@dollarino/core';
import { renderProfitCardPng, renderSignalClosedCardPng, type ProfitCardRenderInput } from '../cards/renderer.js';

function isUserNotifCategoryOn(prefsJson: string | null | undefined, category: 'signals' | 'open_close' | 'tp_sl' | 'dex_sniper' | 'cards_reports'): boolean {
  if (!prefsJson) return true;
  try {
    const parsed = JSON.parse(prefsJson) as Record<string, unknown>;
    if (category in parsed && typeof parsed[category] === 'boolean') {
      return Boolean(parsed[category]);
    }
  } catch { /* fallback true */ }
  return true;
}

export type SignalEngineFilterKey = 'CENTRAL_AI' | 'MY_AI' | 'STRATEGY' | 'COPY_TRADE' | 'LISTING_SNIPER';

export interface SignalDeliveryPrefs {
  signalEngines: Record<SignalEngineFilterKey, boolean>;
  channels: {
    telegramBot: boolean;
    inApp: boolean;
    channelSignals: boolean;
  };
  minConfidence: number;
  minSniperSafety: number;
  directionFilter: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
  quietHoursEnabled: boolean;
}

export function resolveSignalEngineCategory(engineKeyOrSource?: string | null): SignalEngineFilterKey {
  const s = String(engineKeyOrSource || '').toLowerCase();
  if (s.includes('sniper') || s.includes('listing') || s.includes('meme')) return 'LISTING_SNIPER';
  if (s.includes('copy') || s.includes('whale') || s.includes('smart_wallet')) return 'COPY_TRADE';
  if (s.includes('my_ai') || s.includes('my_custom_ai') || s.includes('personal_ai')) return 'MY_AI';
  if (s.includes('ai_autonomous') || s.includes('central_ai') || s === 'ai') return 'CENTRAL_AI';
  return 'STRATEGY';
}

export function parseSignalDeliveryPrefs(prefsJson: string | null | undefined): SignalDeliveryPrefs {
  const defaults: SignalDeliveryPrefs = {
    signalEngines: {
      CENTRAL_AI: true,
      MY_AI: true,
      STRATEGY: true,
      COPY_TRADE: true,
      LISTING_SNIPER: true,
    },
    channels: {
      telegramBot: true,
      inApp: true,
      channelSignals: true,
    },
    minConfidence: 60,
    minSniperSafety: 70,
    directionFilter: 'BOTH',
    quietHoursEnabled: false,
  };
  if (!prefsJson) return defaults;
  try {
    const raw = JSON.parse(prefsJson) as Record<string, unknown>;
    const sd = (raw.signalDelivery && typeof raw.signalDelivery === 'object'
      ? raw.signalDelivery
      : raw) as Record<string, unknown>;
    const seRaw = sd.signalEngines;
    const seArr = Array.isArray(seRaw) ? new Set(seRaw.map((x) => String(x))) : null;
    const se = (!Array.isArray(seRaw) && seRaw && typeof seRaw === 'object' ? seRaw : {}) as Record<string, unknown>;
    const chRaw = sd.channels;
    const chArr = Array.isArray(chRaw) ? new Set(chRaw.map((x) => String(x))) : null;
    const ch = (!Array.isArray(chRaw) && chRaw && typeof chRaw === 'object' ? chRaw : {}) as Record<string, unknown>;
    return {
      signalEngines: {
        CENTRAL_AI: seArr ? seArr.has('CENTRAL_AI') : typeof se.CENTRAL_AI === 'boolean' ? se.CENTRAL_AI : true,
        MY_AI: seArr ? seArr.has('MY_AI') : typeof se.MY_AI === 'boolean' ? se.MY_AI : true,
        STRATEGY: seArr ? seArr.has('STRATEGY') : typeof se.STRATEGY === 'boolean' ? se.STRATEGY : true,
        COPY_TRADE: seArr
          ? seArr.has('COPY_TRADE')
          : typeof se.COPY_TRADE === 'boolean'
            ? se.COPY_TRADE
            : Boolean(raw.whaleCopy ?? true),
        LISTING_SNIPER: seArr
          ? seArr.has('LISTING_SNIPER')
          : typeof se.LISTING_SNIPER === 'boolean'
            ? se.LISTING_SNIPER
            : Boolean(raw.dex_sniper ?? true),
      },
      channels: {
        telegramBot: chArr ? chArr.has('TELEGRAM') || chArr.has('telegramBot') : typeof ch.telegramBot === 'boolean' ? ch.telegramBot : true,
        inApp: chArr ? chArr.has('WEB') || chArr.has('inApp') : typeof ch.inApp === 'boolean' ? ch.inApp : true,
        channelSignals: chArr ? chArr.has('CHANNEL') || chArr.has('channelSignals') : typeof ch.channelSignals === 'boolean' ? ch.channelSignals : true,
      },
      minConfidence: Number.isFinite(Number(sd.minConfidence)) ? Math.max(0, Math.min(99, Number(sd.minConfidence))) : 60,
      minSniperSafety: Number.isFinite(Number(sd.minSniperSafety)) ? Math.max(0, Math.min(99, Number(sd.minSniperSafety))) : 70,
      directionFilter:
        sd.directionFilter === 'LONG_ONLY' || sd.directionFilter === 'SHORT_ONLY' ? sd.directionFilter : 'BOTH',
      quietHoursEnabled: Boolean(sd.quietHoursEnabled),
    };
  } catch {
    return defaults;
  }
}

export function shouldDeliverEngineSignalToUser(
  prefsJson: string | null | undefined,
  opts: {
    engine: SignalEngineFilterKey;
    direction?: string;
    confidence?: number;
    safetyScore?: number;
  }
): boolean {
  if (!isUserNotifCategoryOn(prefsJson, 'signals')) return false;
  if (opts.engine === 'LISTING_SNIPER' && !isUserNotifCategoryOn(prefsJson, 'dex_sniper')) return false;
  const delivery = parseSignalDeliveryPrefs(prefsJson);
  if (!delivery.signalEngines[opts.engine]) return false;
  if (!delivery.channels.telegramBot) return false;
  if (typeof opts.confidence === 'number' && opts.confidence < delivery.minConfidence) return false;
  if (opts.engine === 'LISTING_SNIPER' && typeof opts.safetyScore === 'number' && opts.safetyScore < delivery.minSniperSafety) {
    return false;
  }
  const dir = String(opts.direction || '').toUpperCase();
  if (delivery.directionFilter === 'LONG_ONLY' && dir === 'SHORT') return false;
  if (delivery.directionFilter === 'SHORT_ONLY' && (dir === 'LONG' || dir === 'SELL')) return false;
  return true;
}

import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import {
  getAllCachedSystemSettings,
  getCachedSystemSetting,
} from '../services/settings-cache.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import { resolveOwnerTelegramId, resolveTelegramBotToken } from './token.js';
import {
  channelNewsInlineButtons,
  channelSignalInlineButtons,
  copyTradePublishConfirmButtons,
  formatCopyTradeSignalCard,
  formatSniperSignalCard,
  formatTradeClosedCard,
} from './formatter.js';

export async function getSystemSettingValue(db: D1Database, key: string, fallback: string): Promise<string> {
  return getCachedSystemSetting(db, key, fallback);
}

export function normalizeTelegramTarget(val: string): string {
  const t = (val || '').trim();
  if (!t) return '';
  if (/^https?:\/\/t\.me\//i.test(t)) {
    const slug = t.replace(/^https?:\/\/t\.me\//i, '').split(/[/?]/)[0];
    if (slug && !slug.startsWith('+')) return `@${slug}`;
  }
  return t.startsWith('@') || t.startsWith('-100') || /^-?\d+$/.test(t) ? t : `@${t}`;
}

export function resolvePublicTelegramInviteUrl(target: string, explicitInvite: string): string {
  const inv = (explicitInvite || '').trim();
  if (inv && /^https?:\/\//i.test(inv)) return inv;
  const norm = normalizeTelegramTarget(target);
  if (norm.startsWith('@') && norm.length > 1) {
    return `https://t.me/${norm.slice(1)}`;
  }
  return '';
}

export async function resolveChannelAndBotConfig(env: Env): Promise<{
  channelHandle: string;
  officialChannel: string;
  officialChannelInvite: string;
  officialEnabled: boolean;
  signalsChannelId: string;
  signalsChannelInvite: string;
  resultsChannelId: string;
  resultsChannelInvite: string;
  newsChannelId: string;
  newsChannelInvite: string;
  educationChannelId: string;
  alertsChannelId: string;
  communityGroupId: string;
  communityGroupInvite: string;
  communityEnabled: boolean;
  logsChannelId: string;
  logsEnabled: boolean;
  databaseChannelId: string;
  databaseEnabled: boolean;
  transactionsChannelId: string;
  transactionsEnabled: boolean;
  signalsEnabled: boolean;
  signalsToChannelsEnabled: boolean;
  signalsToBotEnabled: boolean;
  resultsEnabled: boolean;
  newsEnabled: boolean;
  educationEnabled: boolean;
  alertsEnabled: boolean;
  botUsername: string;
  webAppUrl: string;
}> {
  const s = await getAllCachedSystemSettings(env.DB);
  const g = (k: string, fb: string) => {
    const v = s.get(k);
    return v !== undefined && v !== '' ? v : fb;
  };
  const channelRaw = g('official_channel', env.DEFAULT_SIGNAL_CHANNEL || '');
  const officialInviteRaw = g('official_channel_invite', '');
  const sigChanRaw = g('signals_channel_id', '');
  const sigInviteRaw = g('signals_channel_invite', '');
  const resChanRaw = g('results_channel_id', '');
  const resInviteRaw = g('results_channel_invite', '');
  const newsChanRaw = g('news_channel_id', '');
  const newsInviteRaw = g('news_channel_invite', '');
  const eduChanRaw = g('education_channel_id', '');
  const alertsChanRaw = g('alerts_channel_id', '');
  const commGroupRaw = g('community_group_id', '');
  const commInviteRaw = g('community_group_invite', '');
  const logsChanRaw = g('logs_channel_id', '');
  const dbChanRaw = g('database_channel_id', '');
  const txChanRaw = g('transactions_channel_id', '');

  const officialEn = g('channel_official_enabled', 'true');
  const sigEn = g('channel_signals_enabled', 'true');
  const sigToChanEn = g('publish_signals_to_channels', 'true');
  const sigToBotEn = g('publish_signals_to_bot_users', 'true');
  const resEn = g('channel_results_enabled', 'true');
  const commEn = g('channel_community_enabled', 'true');
  const logsEn = g('channel_logs_enabled', 'true');
  const dbEn = g('channel_database_enabled', 'true');
  const txEn = g('channel_transactions_enabled', 'true');
  const newsEn = g('channel_news_enabled', 'true');
  const eduEn = g('channel_education_enabled', 'true');
  const alertsEn = g('channel_alerts_enabled', 'true');
  const botUserRaw = g('bot_username', '');
  const webUrlRaw = g('public_web_url', env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev');

  const officialChan = normalizeTelegramTarget(channelRaw);
  const signalsChan = normalizeTelegramTarget(sigChanRaw);
  const resultsChan = normalizeTelegramTarget(resChanRaw);
  const newsChan = normalizeTelegramTarget(newsChanRaw);
  const commGroup = normalizeTelegramTarget(commGroupRaw);

  return {
    channelHandle: officialChan,
    officialChannel: officialChan,
    officialChannelInvite: resolvePublicTelegramInviteUrl(officialChan, officialInviteRaw),
    officialEnabled: officialEn !== 'false',
    signalsChannelId: signalsChan,
    signalsChannelInvite: resolvePublicTelegramInviteUrl(signalsChan, sigInviteRaw),
    resultsChannelId: resultsChan,
    resultsChannelInvite: resolvePublicTelegramInviteUrl(resultsChan, resInviteRaw),
    newsChannelId: newsChan,
    newsChannelInvite: resolvePublicTelegramInviteUrl(newsChan, newsInviteRaw),
    educationChannelId: normalizeTelegramTarget(eduChanRaw),
    alertsChannelId: normalizeTelegramTarget(alertsChanRaw),
    communityGroupId: commGroup,
    communityGroupInvite: resolvePublicTelegramInviteUrl(commGroup, commInviteRaw),
    communityEnabled: commEn !== 'false',
    logsChannelId: normalizeTelegramTarget(logsChanRaw),
    logsEnabled: logsEn !== 'false',
    databaseChannelId: normalizeTelegramTarget(dbChanRaw),
    databaseEnabled: dbEn !== 'false',
    transactionsChannelId: normalizeTelegramTarget(txChanRaw),
    transactionsEnabled: txEn !== 'false',
    signalsEnabled: sigEn !== 'false',
    signalsToChannelsEnabled: sigToChanEn !== 'false',
    signalsToBotEnabled: sigToBotEn !== 'false',
    resultsEnabled: resEn !== 'false',
    newsEnabled: newsEn !== 'false',
    educationEnabled: eduEn !== 'false',
    alertsEnabled: alertsEn !== 'false',
    botUsername: botUserRaw.replace(/^@/, ''),
    webAppUrl: webUrlRaw.replace(/\/$/, ''),
  };
}

export async function notifyAllAdmins(
  env: Env,
  text: string,
  options?: { inlineKeyboard?: InlineKeyboardButton[][] }
): Promise<number> {
  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return 0;
  const [admins, ownerTg] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT telegram_id FROM users WHERE role IN ('owner', 'admin') AND telegram_id IS NOT NULL AND telegram_id != ''`
    ).all<{ telegram_id: string }>().catch(() => ({ results: [] })),
    resolveOwnerTelegramId(env),
  ]);

  const targets = new Set<string>();
  if (ownerTg) targets.add(ownerTg);
  for (const r of admins.results) {
    if (r.telegram_id?.trim()) targets.add(r.telegram_id.trim());
  }

  const tg = new TelegramBotClient(botToken);
  let sent = 0;
  for (const chatId of targets) {
    try {
      await tg.sendMessage(chatId, text, options);
      sent++;
    } catch {
      // Ignore unreachable admin chat
    }
  }
  return sent;
}

export async function notifyAllAdminsPhoto(
  env: Env,
  imageDataUrl: string,
  caption: string,
  options?: { inlineKeyboard?: InlineKeyboardButton[][] }
): Promise<number> {
  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return 0;
  const [admins, ownerTg] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT telegram_id FROM users WHERE role IN ('owner', 'admin') AND telegram_id IS NOT NULL AND telegram_id != ''`
    ).all<{ telegram_id: string }>().catch(() => ({ results: [] })),
    resolveOwnerTelegramId(env),
  ]);

  const targets = new Set<string>();
  if (ownerTg) targets.add(ownerTg);
  for (const r of admins.results) {
    if (r.telegram_id?.trim()) targets.add(r.telegram_id.trim());
  }

  const tg = new TelegramBotClient(botToken);
  let sent = 0;
  for (const chatId of targets) {
    try {
      await tg.sendDataUrlPhoto(chatId, imageDataUrl, caption, options);
      sent++;
    } catch {
      try {
        await tg.sendMessage(chatId, caption, options);
        sent++;
      } catch {
        // Ignore unreachable admin chat
      }
    }
  }
  return sent;
}

export async function publishSignalBroadcast(
  env: Env,
  params: {
    signalId?: string;
    signal: DollarinoSignal;
    source: string;
    engineKey?: string;
    engineLabel?: string;
    publishToChannel?: boolean;
    notifySubscribers?: boolean;
  }
): Promise<{
  signalId: string;
  channelMessageId?: number;
  channelError?: string;
  subscribersNotified: number;
}> {
  const cfg = await resolveChannelAndBotConfig(env);
  const signalId = params.signalId || randomId('sig');
  const engineLabel = resolveEngineDisplayLabel(params.engineKey || params.signal.engineKey, params.engineLabel || params.signal.engineLabel);
  const fullSignal: DollarinoSignal = {
    ...params.signal,
    channelHandle: cfg.channelHandle,
    engineKey: params.engineKey || params.signal.engineKey,
    engineLabel,
  };
  const formattedText = formatDollarinoSignal(fullSignal);

  const existing = await env.DB.prepare(`SELECT id FROM signals WHERE id = ?`).bind(signalId).first().catch(() => null);
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO signals (
        id, source, symbol, direction, timeframe, price, stop_loss, leverage,
        tp1, tp2, tp3, raw_text, status, engine_source, engine_label, channel_chat_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED', ?, ?, ?)`
    ).bind(
      signalId,
      params.source,
      fullSignal.symbol,
      fullSignal.direction,
      fullSignal.timeframe,
      fullSignal.price,
      fullSignal.stopLoss,
      fullSignal.leverage ?? 5,
      fullSignal.tp1 ?? fullSignal.price,
      fullSignal.tp2 ?? null,
      fullSignal.tp3 ?? null,
      formattedText,
      params.engineKey || params.source,
      engineLabel,
      cfg.channelHandle
    ).run().catch(() => {});
  }

  let channelMessageId: number | undefined;
  let channelError: string | undefined;
  let subscribersNotified = 0;

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) {
    return { signalId, subscribersNotified: 0, channelError: 'توکن ربات تلگرام هنوز تنظیم نشده است.' };
  }

  const tg = new TelegramBotClient(botToken);
  const autoPublish = (await getSystemSettingValue(env.DB, 'auto_publish_signals_to_channel', 'true')) !== 'false';
  const alsoOfficial = (await getSystemSettingValue(env.DB, 'signals_also_official', 'false')) === 'true';

  if (cfg.signalsEnabled && cfg.signalsToChannelsEnabled && (params.publishToChannel ?? autoPublish)) {
    const primaryTarget = cfg.signalsChannelId || cfg.officialChannel;
    const targets = new Set<string>();
    if (primaryTarget) targets.add(primaryTarget);
    if (alsoOfficial && cfg.officialEnabled && cfg.officialChannel) targets.add(cfg.officialChannel);

    const chanMarkup = channelSignalInlineButtons({
      signalId,
      botUsername: cfg.botUsername,
      webAppUrl: cfg.webAppUrl,
      forChannel: true,
      resultsChannelInvite: cfg.resultsChannelInvite,
    });

    for (const targetChat of targets) {
      try {
        const sent = await tg.sendMessage(targetChat, formattedText, {
          inlineKeyboard: chanMarkup,
        });
        if (!channelMessageId || targetChat === primaryTarget) {
          channelMessageId = sent.message_id;
          await env.DB.prepare(
            `UPDATE signals SET channel_message_id = ?, channel_chat_id = ?, engine_label = ?, engine_source = ? WHERE id = ?`
          ).bind(sent.message_id, targetChat, engineLabel, params.engineKey || params.source, signalId).run().catch(() => {});
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!channelError) channelError = errMsg;
        await notifyAllAdmins(
          env,
          `⚠️ خطای ارسال سیگنال ${fullSignal.symbol} به کانال ${targetChat}:\n${errMsg}\n\nلطفاً مطمئن شوید @${cfg.botUsername} با دسترسی ارسال پیام در کانال ادمین است.`
        ).catch(() => {});
      }
    }
  }

  if (params.notifySubscribers && cfg.signalsToBotEnabled) {
    const subs = await env.DB.prepare(
      `SELECT DISTINCT u.telegram_id, bc.notification_prefs_json
       FROM users u
       LEFT JOIN bot_configs bc ON bc.user_id = u.id
       WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''
         AND COALESCE(u.is_blocked, 0) = 0
         AND COALESCE(bc.notifications_enabled, 1) != 0
         AND (COALESCE(u.phone_verified, 0) = 1 OR bc.bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE'))
       ORDER BY u.last_active_at DESC
       LIMIT 100`
    ).all<{ telegram_id: string; notification_prefs_json?: string | null }>().catch(() => ({ results: [] }));

    const engineCat = resolveSignalEngineCategory(params.engineKey || params.source);
    const eligibleSubs = subs.results.filter((s) =>
      shouldDeliverEngineSignalToUser(s.notification_prefs_json, {
        engine: engineCat,
        direction: fullSignal.direction,
      })
    );
    const inlineKb = channelSignalInlineButtons({
      signalId,
      botUsername: cfg.botUsername,
      webAppUrl: cfg.webAppUrl,
      forChannel: false,
    });
    for (let i = 0; i < eligibleSubs.length; i += 10) {
      const batch = eligibleSubs.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map((s) => tg.sendMessage(s.telegram_id, formattedText, { inlineKeyboard: inlineKb }))
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') subscribersNotified++;
      }
    }
  }

  await publishSystemLogEvent(env, {
    category: 'AI_DECISION',
    level: 'INFO',
    source: engineLabel,
    title: `انتشار سیگنال ${fullSignal.direction} روی ${fullSignal.symbol}`,
    details: `تایم‌فریم ${fullSignal.timeframe} | ورود ${fullSignal.price} | SL ${fullSignal.stopLoss} | TP1 ${fullSignal.tp1 ?? '-'} | کاربران مطلع‌شده: ${subscribersNotified}${channelMessageId ? ` | Msg #${channelMessageId}` : ''}`,
  }).catch(() => {});

  return { signalId, channelMessageId, channelError, subscribersNotified };
}

/**
 * Logs & broadcasts a Sniper discovery as a first-class Signal with its own Sniper card format.
 */
export async function publishSniperSignal(
  env: Env,
  params: {
    userId: string;
    symbol: string;
    name?: string;
    chainId: string;
    dexId: string;
    source: 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME' | string;
    tokenAddress: string;
    priceUsd: number;
    tpUsd: number;
    slUsd: number;
    tpPct: number;
    slPct: number;
    safetyScore: number;
    liquidityUsd: number;
    mcapUsd?: number | null;
    ageMinutes?: number | null;
    change5mPct?: number;
    change1hPct?: number;
    buySellRatio1h?: number;
    slippagePct?: number;
    modeLabel?: string;
    trustWalletSwapUrl?: string;
  }
): Promise<{ signalId: string; notified: boolean }> {
  const cfg = await resolveChannelAndBotConfig(env);
  const signalId = randomId('sig');
  const formattedText = formatSniperSignalCard({
    ...params,
    channelHandle: cfg.channelHandle,
  });

  await env.DB.prepare(
    `INSERT INTO signals (
      id, source, symbol, direction, timeframe, price, stop_loss, leverage,
      tp1, raw_text, status, engine_source, engine_label, channel_chat_id
    ) VALUES (?, 'LISTING_SNIPER', ?, 'LONG', '5m', ?, ?, 1, ?, ?, 'PROCESSED', 'LISTING_SNIPER', 'اسنایپر لیستینگ و میم‌کوین', ?)`
  )
    .bind(
      signalId,
      `${params.symbol.toUpperCase()}USDT`,
      String(params.priceUsd),
      String(params.slUsd),
      String(params.tpUsd),
      formattedText,
      cfg.channelHandle
    )
    .run()
    .catch(() => {});

  const userRow = await env.DB.prepare(
    `SELECT u.telegram_id, bc.notifications_enabled, bc.notification_prefs_json
     FROM users u
     LEFT JOIN bot_configs bc ON bc.user_id = u.id
     WHERE u.id = ? LIMIT 1`
  )
    .bind(params.userId)
    .first<{ telegram_id: string | null; notifications_enabled: number | null; notification_prefs_json?: string | null }>()
    .catch(() => null);

  if (
    !userRow?.telegram_id ||
    userRow.notifications_enabled === 0 ||
    !shouldDeliverEngineSignalToUser(userRow.notification_prefs_json, {
      engine: 'LISTING_SNIPER',
      direction: 'LONG',
      safetyScore: params.safetyScore,
    })
  ) {
    return { signalId, notified: false };
  }

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return { signalId, notified: false };
  const tg = new TelegramBotClient(botToken);
  const baseWeb = cfg.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const kb: InlineKeyboardButton[][] = [];
  if (params.trustWalletSwapUrl) {
    kb.push([{ text: `خرید ${params.symbol} در Trust Wallet 🛡`, url: params.trustWalletSwapUrl, style: 'success' }]);
  }
  if (baseWeb.startsWith('https://')) {
    kb.push([{ text: '🎯 میز اسنایپر در مینی‌اپ', web_app: { url: `${baseWeb}/?tab=sniper` }, style: 'primary' }]);
  }
  const sent = await tg.sendMessage(userRow.telegram_id, formattedText, kb.length ? { inlineKeyboard: kb } : undefined).catch(() => null);
  return { signalId, notified: Boolean(sent) };
}

/**
 * Logs & broadcasts a Copy-Trade / Whale Wallet discovery as a first-class Signal with its own Copy-Trade card format.
 */
export async function publishCopyTradeSignal(
  env: Env,
  params: {
    userId: string;
    traderName: string;
    traderKind: 'SMART_WALLET' | 'SITE_TRADER' | 'COPY_TRADER' | string;
    chainId?: string;
    symbol: string;
    direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | string;
    leverage?: number;
    entryPrice: string | number;
    stopLoss?: string | number | null;
    tp1?: string | number | null;
    traderWinRate?: number | null;
    traderRoi30d?: number | null;
    traderAmountUsd?: number | null;
    userAllocUsd?: number | null;
    actionNote?: string;
    trustWalletSwapUrl?: string;
    skipTelegramSend?: boolean;
  }
): Promise<{ signalId: string; notified: boolean }> {
  const cfg = await resolveChannelAndBotConfig(env);
  const signalId = randomId('sig');
  const formattedText = formatCopyTradeSignalCard({
    ...params,
    channelHandle: cfg.channelHandle,
  });
  const normDir = String(params.direction || 'LONG').toUpperCase() === 'SHORT' || String(params.direction).toUpperCase() === 'SELL' ? 'SHORT' : 'LONG';
  const canonSym = params.symbol.toUpperCase().endsWith('USDT') ? params.symbol.toUpperCase() : `${params.symbol.toUpperCase()}USDT`;

  await env.DB.prepare(
    `INSERT INTO signals (
      id, source, symbol, direction, timeframe, price, stop_loss, leverage,
      tp1, raw_text, status, engine_source, engine_label, channel_chat_id
    ) VALUES (?, 'COPY_TRADE', ?, ?, '15m', ?, ?, ?, ?, ?, 'PROCESSED', 'COPY_TRADE', 'کپی‌ترید تاییدشده دلارینو', ?)`
  )
    .bind(
      signalId,
      canonSym,
      normDir,
      String(params.entryPrice || '0'),
      String(params.stopLoss || '0'),
      Math.max(1, Number(params.leverage || 1)),
      params.tp1 ? String(params.tp1) : String(params.entryPrice || '0'),
      formattedText,
      cfg.channelHandle
    )
    .run()
    .catch(() => {});

  if (params.skipTelegramSend) {
    return { signalId, notified: false };
  }

  const userRow = await env.DB.prepare(
    `SELECT u.telegram_id, bc.notifications_enabled, bc.notification_prefs_json
     FROM users u
     LEFT JOIN bot_configs bc ON bc.user_id = u.id
     WHERE u.id = ? LIMIT 1`
  )
    .bind(params.userId)
    .first<{ telegram_id: string | null; notifications_enabled: number | null; notification_prefs_json?: string | null }>()
    .catch(() => null);

  if (
    !userRow?.telegram_id ||
    userRow.notifications_enabled === 0 ||
    !shouldDeliverEngineSignalToUser(userRow.notification_prefs_json, {
      engine: 'COPY_TRADE',
      direction: normDir,
    })
  ) {
    return { signalId, notified: false };
  }

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return { signalId, notified: false };
  const tg = new TelegramBotClient(botToken);
  const baseWeb = cfg.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const kb: InlineKeyboardButton[][] = [];
  if (params.trustWalletSwapUrl) {
    kb.push([{ text: `تایید در Trust Wallet 🛡`, url: params.trustWalletSwapUrl, style: 'success' }]);
  }
  if (baseWeb.startsWith('https://')) {
    kb.push([{ text: '🏆 کپی‌ترید در مینی‌اپ', web_app: { url: `${baseWeb}/?tab=copy` }, style: 'primary' }]);
  }
  const sent = await tg.sendMessage(userRow.telegram_id, formattedText, kb.length ? { inlineKeyboard: kb } : undefined).catch(() => null);
  return { signalId, notified: Boolean(sent) };
}

export async function publishSignalClosedCard(
  env: Env,
  params: {
    tradeId: string;
    userId: string;
    signalId?: string | null;
    symbol: string;
    direction: Direction;
    leverage: number;
    mode: 'LIVE' | 'PAPER';
    strategyKey?: string | null;
    engineLabel?: string | null;
    entryPrice: string;
    exitPrice: string;
    stopLoss: string;
    tp1: string;
    tp1Hit: boolean;
    tp2Hit: boolean;
    tp3Hit: boolean;
    trailingActive: boolean;
    trailingSl?: string;
    pnlUsd: number;
    pnlPct: number;
    reason: string;
    openedAt?: string | null;
    closedAt?: string | null;
  }
): Promise<void> {
  const cfg = await resolveChannelAndBotConfig(env);
  const engineLabel = resolveEngineDisplayLabel(params.strategyKey, params.engineLabel);
  const cardId = `SIG-${randomId('').slice(0, 10).toUpperCase()}`;
  const closedAt = params.closedAt ?? new Date().toISOString();
  const openedAt = params.openedAt ?? closedAt;

  const caption = formatTradeClosedCard({
    symbol: params.symbol,
    direction: params.direction,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    pnlUsd: params.pnlUsd,
    pnlPct: params.pnlPct,
    reason: params.reason,
    openedAt,
    closedAt,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
    leverage: params.leverage,
    tp1Hit: params.tp1Hit,
    tp2Hit: params.tp2Hit,
    tp3Hit: params.tp3Hit,
    trailingActive: params.trailingActive,
    trailingSl: params.trailingSl,
    engineKey: params.strategyKey || undefined,
    engineLabel,
    mode: params.mode,
  });

  await env.DB.prepare(
    `UPDATE trades SET closed_card_id = ?, engine_label = ? WHERE id = ?`
  ).bind(cardId, engineLabel, params.tradeId).run().catch(() => {});

  if (params.signalId) {
    await env.DB.prepare(
      `UPDATE signals SET tp1_hit = ?, tp2_hit = ?, tp3_hit = ?, trailing_sl = ?, closed_card_id = ? WHERE id = ?`
    ).bind(
      params.tp1Hit ? 1 : 0,
      params.tp2Hit ? 1 : 0,
      params.tp3Hit ? 1 : 0,
      params.trailingSl || params.stopLoss,
      cardId,
      params.signalId
    ).run().catch(() => {});
  }

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return;
  const tg = new TelegramBotClient(botToken);

  const pngBytes = await renderSignalClosedCardPng({
    cardId,
    symbol: params.symbol,
    direction: params.direction,
    leverage: params.leverage,
    engineLabel,
    mode: params.mode,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    pnlUsd: params.pnlUsd,
    pnlPct: params.pnlPct,
    tp1Hit: params.tp1Hit,
    tp2Hit: params.tp2Hit,
    tp3Hit: params.tp3Hit,
    trailingActive: params.trailingActive,
    trailingSlPrice: params.trailingSl || params.stopLoss,
    closeReason: params.reason,
    openedAt,
    closedAt,
    layout: 'horizontal',
  }).catch(() => null);

  // 1. Send card to user's private Telegram if notifications enabled
  const userRow = await env.DB.prepare(
    `SELECT u.telegram_id, bc.notifications_enabled, bc.notification_prefs_json
     FROM users u LEFT JOIN bot_configs bc ON bc.user_id = u.id
     WHERE u.id = ? LIMIT 1`
  ).bind(params.userId).first<{ telegram_id: string | null; notifications_enabled: number | null; notification_prefs_json?: string | null }>().catch(() => null);

  if (
    userRow?.telegram_id &&
    userRow.notifications_enabled !== 0 &&
    isUserNotifCategoryOn(userRow.notification_prefs_json, 'tp_sl')
  ) {
    try {
      if (pngBytes) {
        await tg.sendPhotoBuffer(userRow.telegram_id, pngBytes, `dollarino-result-${params.symbol}.png`, caption);
      } else {
        await tg.sendMessage(userRow.telegram_id, caption);
      }
    } catch {
      // ignore unreachable user
    }
  }

  const isPubBtnUrl = (u: string) =>
    /^https?:\/\//i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/i.test(u);

  const rowA: InlineKeyboardButton[] = [];
  if (isPubBtnUrl(cfg.signalsChannelInvite)) {
    rowA.push({ text: '📡 سیگنال دلارینو', url: cfg.signalsChannelInvite });
  }
  if (cfg.botUsername) {
    rowA.push({ text: '🤖 شروع با ربات', url: `https://t.me/${cfg.botUsername}`, style: 'success' });
  }
  const rowB: InlineKeyboardButton[] = [];
  if (isPubBtnUrl(cfg.webAppUrl)) {
    rowB.push({ text: '📊 تاییدیه و نتایج در سایت', url: cfg.webAppUrl, style: 'primary' });
  }
  const channelMarkup: InlineKeyboardButton[][] = [rowA, rowB].filter((r) => r.length > 0);
  const replyOpts = channelMarkup.length > 0 ? { inlineKeyboard: channelMarkup } : undefined;

  let sentToResultsChannel = false;
  // 2A. Dedicated 02. Results Channel (نتایج سیگنال دلارینو)
  if (cfg.resultsEnabled && cfg.signalsToChannelsEnabled && cfg.resultsChannelId) {
    try {
      if (pngBytes) {
        await tg.sendPhotoBuffer(cfg.resultsChannelId, pngBytes, `dollarino-result-${params.symbol}.png`, caption, replyOpts);
      } else {
        await tg.sendMessage(cfg.resultsChannelId, caption, replyOpts);
      }
      sentToResultsChannel = true;
    } catch {
      // ignore results channel post failure
    }
  }

  // 2B. If tied to a channel signal message, reply directly to that signal with result card!
  if (cfg.resultsEnabled && cfg.signalsToChannelsEnabled && params.signalId) {
    const sigRow = await env.DB.prepare(
      `SELECT channel_message_id, channel_chat_id FROM signals WHERE id = ? LIMIT 1`
    ).bind(params.signalId).first<{ channel_message_id: number | null; channel_chat_id: string | null }>().catch(() => null);

    if (sigRow?.channel_message_id) {
      const targetChannel = sigRow.channel_chat_id || cfg.channelHandle;
      if (targetChannel && (!sentToResultsChannel || targetChannel !== cfg.resultsChannelId)) {
        try {
          if (pngBytes) {
            await tg.sendPhotoBuffer(
              targetChannel,
              pngBytes,
              `dollarino-signal-${params.symbol}.png`,
              caption,
              {
                replyToMessageId: sigRow.channel_message_id,
                ...(channelMarkup.length > 0 ? { inlineKeyboard: channelMarkup } : {}),
              }
            );
          } else {
            await tg.sendMessage(targetChannel, caption, {
              replyToMessageId: sigRow.channel_message_id,
              ...(channelMarkup.length > 0 ? { inlineKeyboard: channelMarkup } : {}),
            });
          }
        } catch {
          // ignore channel reply failure
        }
      }
    }
  }

  await publishSystemLogEvent(env, {
    category: 'BOT_ACTIVITY',
    level: params.pnlUsd >= 0 ? 'INFO' : 'WARN',
    source: engineLabel,
    title: `نتیجه معامله ${params.symbol} (${params.mode})`,
    details: `${params.direction} | خروج ${params.exitPrice} | سود/زیان: ${params.pnlUsd >= 0 ? '+' : ''}$${params.pnlUsd.toFixed(2)} (${params.pnlPct.toFixed(2)}%) | دلیل: ${params.reason}`,
  }).catch(() => {});
}

export async function publishProfitCardToTelegram(
  env: Env,
  chatId: string | number,
  card: Omit<ProfitCardRenderInput, 'cardId'> & { id: string },
  layout: 'horizontal' | 'vertical' = 'horizontal'
): Promise<boolean> {
  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return false;
  const tg = new TelegramBotClient(botToken);
  const pngBytes = await renderProfitCardPng({ ...card, cardId: card.id, layout }).catch(() => null);
  const ratioLabel = layout === 'vertical' ? '۹:۱۶ استوری' : '۱۶:۹ افقی';
  const tradeLine =
    card.symbol
      ? `🪙 نماد: ${card.symbol}${card.direction ? ` (${card.direction}${card.leverage && card.leverage > 1 ? ` ${card.leverage}x` : ''})` : ''}\n`
      : '';
  const priceLine =
    card.entryPrice && card.exitPrice
      ? `🎯 ورود: $${Number(card.entryPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })} ➔ خروج: $${Number(card.exitPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })}\n`
      : '';
  const cfg = await resolveChannelAndBotConfig(env);
  const caption =
    `🏆 کارت سود رسمی دلارینو (${card.mode === 'LIVE' ? 'حساب واقعی ✅' : 'حساب دمو 🧪'} · ${ratioLabel})\n` +
    tradeLine +
    priceLine +
    `📊 دوره: ${card.period} | موتور: ${card.strategyName}${card.signalName ? ` | سیگنال: ${card.signalName}` : ''}\n` +
    `💰 سود خالص: ${card.netPnlUsd >= 0 ? '+' : '-'}$${Math.abs(card.netPnlUsd).toFixed(2)} (${card.roiPct >= 0 ? '+' : '-'}${Math.abs(card.roiPct).toFixed(2)}%)` +
    (cfg.channelHandle ? `\n🆔 ${cfg.channelHandle}` : '');

  if (pngBytes) {
    await tg.sendPhotoBuffer(chatId, pngBytes, `dollarino-profit-${card.id}-${layout}.png`, caption);
  } else {
    await tg.sendMessage(chatId, caption);
  }
  return true;
}

export async function publishChannelNews(
  env: Env,
  params: {
    category: 'NEWS' | 'ANALYSIS' | 'SIGNAL_UPDATE' | 'ANNOUNCEMENT' | 'ALERT' | 'EDUCATION' | 'PROMO' | 'LOTTERY' | 'ADVICE';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    createdBy?: string;
    notifyBotUsers?: boolean;
  }
): Promise<{ id: string; channelMessageId?: number; usersNotified: number; error?: string }> {
  const cfg = await resolveChannelAndBotConfig(env);
  const id = randomId('news');
  const catBadge =
    params.category === 'ANALYSIS'
      ? '📊 تحلیل هوشمند بازار دلارینو'
      : params.category === 'ALERT'
        ? '⚠️ اخطار و هشدار مدیریت ریسک دلارینو'
        : params.category === 'EDUCATION'
          ? '🎓 آموزش گام‌به‌گام و ساده دلارینو'
          : params.category === 'PROMO'
            ? '🚀 معرفی قدرت و امکانات دلارینو'
            : params.category === 'LOTTERY'
              ? '🎁 قرعه‌کشی و کمپین ویژه دلارینو'
              : params.category === 'ADVICE'
                ? '💡 توصیه و راهنمای کلیدی دلارینو'
                : params.category === 'ANNOUNCEMENT'
                  ? '🌟 اطلاعیه و آپدیت رسمی دلارینو'
                  : params.category === 'SIGNAL_UPDATE'
                    ? '⚡️ به‌روزرسانی سیگنال'
                    : '📰 خبر فوری و نبض بازار کریپتو';

  const isOfficialKind =
    params.category === 'ANNOUNCEMENT' ||
    params.category === 'PROMO' ||
    params.category === 'LOTTERY' ||
    params.category === 'ADVICE';

  const targetChannel = isOfficialKind
    ? (cfg.officialChannel || cfg.newsChannelId)
    : params.category === 'ALERT' && cfg.alertsEnabled
      ? (cfg.alertsChannelId || cfg.signalsChannelId || cfg.officialChannel)
      : params.category === 'EDUCATION' && cfg.educationEnabled
        ? (cfg.educationChannelId || cfg.officialChannel || cfg.newsChannelId)
        : params.category === 'SIGNAL_UPDATE' && cfg.signalsEnabled
          ? (cfg.signalsChannelId || cfg.officialChannel)
          : cfg.newsEnabled
            ? (cfg.newsChannelId || cfg.officialChannel)
            : cfg.officialChannel;

  const footerParts = [
    targetChannel && targetChannel.startsWith('@') ? `🆔 ${targetChannel}` : cfg.officialChannel ? `🆔 ${cfg.officialChannel}` : '',
    cfg.botUsername ? `🤖 @${cfg.botUsername}` : '',
  ].filter(Boolean);

  const text =
    `${catBadge}\n\n` +
    `📌 ${params.title.trim()}\n` +
    `------------------------------------------------\n` +
    `${params.body.trim()}\n` +
    `------------------------------------------------` +
    (footerParts.length > 0 ? `\n${footerParts.join(' · ')}` : '');

  await env.DB.prepare(
    `INSERT INTO channel_news (id, category, title, body, media_url, button_label, button_url, channel_chat_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    params.category,
    params.title.trim(),
    params.body.trim(),
    params.mediaUrl || null,
    params.buttonLabel || null,
    params.buttonUrl || null,
    targetChannel,
    params.createdBy || null
  ).run().catch(() => {});

  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) {
    return { id, usersNotified: 0, error: 'توکن ربات تلگرام تنظیم نشده است.' };
  }

  const tg = new TelegramBotClient(botToken);
  const markup = channelNewsInlineButtons({
    botUsername: cfg.botUsername,
    webAppUrl: cfg.webAppUrl,
    customButtonLabel: params.buttonLabel,
    customButtonUrl: params.buttonUrl,
    signalsChannelInvite: cfg.signalsChannelInvite,
    resultsChannelInvite: cfg.resultsChannelInvite,
    officialChannelInvite: cfg.officialChannelInvite,
    newsChannelInvite: cfg.newsChannelInvite,
  });
  const replyMarkupOpt = markup.length > 0 ? { inlineKeyboard: markup } : undefined;

  const shouldPostChannel =
    Boolean(targetChannel) &&
    cfg.signalsToChannelsEnabled &&
    (isOfficialKind
      ? cfg.officialEnabled
      : params.category === 'ALERT'
        ? cfg.alertsEnabled
        : params.category === 'EDUCATION'
          ? cfg.educationEnabled
          : params.category === 'SIGNAL_UPDATE'
            ? cfg.signalsEnabled
            : cfg.newsEnabled);

  let channelMessageId: number | undefined;
  let channelErr: string | undefined;
  if (shouldPostChannel && targetChannel) {
    try {
      const res = params.mediaUrl?.startsWith('http')
        ? await tg.sendPhoto(targetChannel, params.mediaUrl, text.slice(0, 1020), replyMarkupOpt)
        : await tg.sendMessage(targetChannel, text, replyMarkupOpt);
      channelMessageId = res.message_id;
      await env.DB.prepare(`UPDATE channel_news SET channel_message_id = ? WHERE id = ?`)
        .bind(res.message_id, id).run().catch(() => {});
    } catch (err) {
      channelErr = err instanceof Error ? err.message : String(err);
    }
  }

  let usersNotified = 0;
  if (params.notifyBotUsers && cfg.signalsToBotEnabled) {
    const users = await env.DB.prepare(
      `SELECT DISTINCT u.telegram_id
       FROM users u
       LEFT JOIN bot_configs bc ON bc.user_id = u.id
       WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''
         AND COALESCE(u.is_blocked, 0) = 0
         AND COALESCE(bc.notifications_enabled, 1) != 0
         AND COALESCE(u.phone_verified, 0) = 1
       ORDER BY u.last_active_at DESC
       LIMIT 80`
    ).all<{ telegram_id: string }>().catch(() => ({ results: [] }));

    for (let i = 0; i < users.results.length; i += 10) {
      const batch = users.results.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map((u) =>
          params.mediaUrl?.startsWith('http')
            ? tg.sendPhoto(u.telegram_id, params.mediaUrl, text.slice(0, 1020), replyMarkupOpt)
            : tg.sendMessage(u.telegram_id, text, replyMarkupOpt)
        )
      );
      for (const r of settled) {
        if (r.status === 'fulfilled') usersNotified++;
      }
    }
  }

  return { id, channelMessageId, usersNotified, error: channelErr };
}

export async function publishOfficialAnnouncement(
  env: Env,
  params: {
    kind: 'PROJECT_UPDATE' | 'ANNOUNCEMENT' | 'PROMO' | 'LOTTERY' | 'ADVICE';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    notifyBotUsers?: boolean;
    createdBy?: string;
  }
): Promise<{ id: string; channelMessageId?: number; usersNotified: number; error?: string }> {
  const mappedCategory =
    params.kind === 'PROJECT_UPDATE'
      ? 'ANNOUNCEMENT'
      : params.kind;
  return publishChannelNews(env, {
    category: mappedCategory,
    title: params.title,
    body: params.body,
    mediaUrl: params.mediaUrl,
    buttonLabel: params.buttonLabel,
    buttonUrl: params.buttonUrl,
    notifyBotUsers: params.notifyBotUsers,
    createdBy: params.createdBy,
  });
}

// Track re-entrancy so logging errors never trigger recursive logging
let inFlightSystemLog = false;

export async function publishSystemLogEvent(
  env: Env,
  params: {
    category: 'BOT_ACTIVITY' | 'ERROR' | 'AI_DECISION' | 'SYSTEM' | 'SECURITY';
    level: 'INFO' | 'WARN' | 'ERROR';
    source: string;
    title: string;
    details?: string;
    userId?: string;
  }
): Promise<{ ok: boolean; skipped?: boolean; messageId?: number; error?: string }> {
  if (inFlightSystemLog) return { ok: false, skipped: true };
  inFlightSystemLog = true;
  try {
    const cfg = await resolveChannelAndBotConfig(env);
    if (!cfg.logsEnabled || !cfg.logsChannelId) {
      return { ok: false, skipped: true };
    }
    const botToken = await resolveTelegramBotToken(env);
    if (!botToken) return { ok: false, skipped: true };

    const levelIcon = params.level === 'ERROR' ? '🔴' : params.level === 'WARN' ? '🟠' : '🟢';
    const catLabel =
      params.category === 'AI_DECISION'
        ? '🧠 تصمیم AI'
        : params.category === 'BOT_ACTIVITY'
          ? '🤖 فعالیت ربات'
          : params.category === 'ERROR'
            ? '💥 خطای سیستمی'
            : params.category === 'SECURITY'
              ? '🛡 امنیت سیستم'
              : '⚙️ رویداد سیستمی';

    const irTime = new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());

    const msg =
      `${levelIcon} **04. لاگ‌های دلارینو** · ${catLabel}\n` +
      `📌 **${params.title.trim()}**\n` +
      `• منبع: \`${params.source}\`` +
      (params.userId ? ` · کاربر: \`${params.userId}\`` : '') +
      `\n• زمان: ${irTime}` +
      (params.details ? `\n\n📝 جزئیات:\n${params.details.slice(0, 2800)}` : '');

    const tg = new TelegramBotClient(botToken);
    const sent = await tg.sendMessage(cfg.logsChannelId, msg);
    return { ok: true, messageId: sent.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    inFlightSystemLog = false;
  }
}

export async function publishDatabaseReport(
  env: Env,
  params?: {
    eventType?: 'PERIODIC_STATUS' | 'BACKUP_EXPORT' | 'RESTORE' | 'WIPE' | 'MANUAL_SNAPSHOT' | 'STORAGE_ALERT';
    actorUsername?: string;
    note?: string;
    attachBackupJson?: boolean;
  }
): Promise<{
  ok: boolean;
  skipped?: boolean;
  messageId?: number;
  totalRows?: number;
  sizeKb?: number;
  error?: string;
}> {
  try {
    const cfg = await resolveChannelAndBotConfig(env);
    if (!cfg.databaseEnabled || !cfg.databaseChannelId) {
      return { ok: false, skipped: true };
    }
    const botToken = await resolveTelegramBotToken(env);
    if (!botToken) return { ok: false, skipped: true };

    const keyTables = [
      'users',
      'bot_configs',
      'trades',
      'signals',
      'server_fee_ledger',
      'treasury_deposits',
      'ai_connections',
      'channel_news',
      'support_tickets',
      'audit_logs',
    ];

    const evType = params?.eventType || 'PERIODIC_STATUS';
    const useFastRowEstimate = evType === 'PERIODIC_STATUS';

    const [pageCountRow, pageSizeRow, ...counts] = await Promise.all([
      env.DB.prepare(`PRAGMA page_count`).first<{ page_count: number }>().catch(() => null),
      env.DB.prepare(`PRAGMA page_size`).first<{ page_size: number }>().catch(() => null),
      ...keyTables.map(async (tbl) => {
        const sql = useFastRowEstimate
          ? `SELECT COALESCE(MAX(rowid), 0) as cnt FROM "${tbl}"`
          : `SELECT COUNT(*) as cnt FROM "${tbl}"`;
        const row = await env.DB.prepare(sql)
          .first<{ cnt: number }>()
          .catch(() => ({ cnt: 0 }));
        return { table: tbl, rows: Number(row?.cnt || 0) };
      }),
    ]);

    const totalKeyRows = counts.reduce((acc, r) => acc + r.rows, 0);
    const rawBytes = Number(pageCountRow?.page_count || 0) * Number(pageSizeRow?.page_size || 4096);
    const sizeKb = Math.max(1, Math.round((rawBytes > 0 ? rawBytes : totalKeyRows * 420) / 1024));

    const openPosRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN'`
    ).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
    const activeBotRow = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM bot_configs WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')`
    ).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
    const evTitle =
      evType === 'BACKUP_EXPORT'
        ? '💾 خروجی بکاپ کامل دیتابیس'
        : evType === 'RESTORE'
          ? '♻️ بازگردانی دیتابیس (Restore)'
          : evType === 'WIPE'
            ? '🧹 ریست / پاک‌سازی دیتابیس'
            : evType === 'STORAGE_ALERT'
              ? '⚠️ هشدار حجم و وضعیت ذخیره‌سازی'
              : evType === 'MANUAL_SNAPSHOT'
                ? '📸 گزارش لحظه‌ای وضعیت دیتابیس'
                : '🗄 گزارش دوره‌ای دیتابیس دلارینو';

    const irTime = new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    const rowMap = new Map(counts.map((c) => [c.table, c.rows]));
    const msg =
      `🗄 **05. دیتابیس دلارینو** · ${evTitle}\n` +
      `⏰ زمان: ${irTime}` +
      (params?.actorUsername ? ` · مدیر: \`${params.actorUsername}\`` : '') +
      `\n\n📊 **آمار وضعیت ذخیره‌سازی D1:**\n` +
      `• حجم تقریبی دیتابیس: **${sizeKb.toLocaleString('en-US')} KB**\n` +
      `• کاربران: **${rowMap.get('users') ?? 0}** | ربات‌های فعال: **${activeBotRow?.cnt ?? 0}**\n` +
      `• معاملات: **${rowMap.get('trades') ?? 0}** (باز: **${openPosRow?.cnt ?? 0}**) | سیگنال‌ها: **${rowMap.get('signals') ?? 0}**\n` +
      `• تراکنش‌های خزانه: **${rowMap.get('treasury_deposits') ?? 0}** | دفتر کارمزد ۳٪: **${rowMap.get('server_fee_ledger') ?? 0}**\n` +
      `• مدل‌های AI: **${rowMap.get('ai_connections') ?? 0}** | تیکت‌ها: **${rowMap.get('support_tickets') ?? 0}**\n` +
      `• لاگ‌های ثبت‌شده: **${rowMap.get('audit_logs') ?? 0}** | خبر/پست کانال: **${rowMap.get('channel_news') ?? 0}**` +
      (params?.note ? `\n\n📝 یادداشت مدیریتی:\n${params.note}` : '');

    const tg = new TelegramBotClient(botToken);
    const sent = await tg.sendMessage(cfg.databaseChannelId, msg);

    if (params?.attachBackupJson) {
      const snapshotPayload = {
        format: 'dollarino-d1-telemetry-snapshot-v1',
        exportedAt: new Date().toISOString(),
        actor: params.actorUsername || 'system',
        sizeKb,
        tableCounts: Object.fromEntries(counts.map((c) => [c.table, c.rows])),
      };
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      await tg
        .sendDocument(
          cfg.databaseChannelId,
          `dollarino-db-report-${stamp}.json`,
          JSON.stringify(snapshotPayload, null, 2),
          'application/json',
          `📎 فایل اسنپ‌شات آماری دیتابیس (${irTime})`
        )
        .catch(() => {});
    }

    return { ok: true, messageId: sent.message_id, totalRows: totalKeyRows, sizeKb };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function publishTransactionEvent(
  env: Env,
  params: {
    eventType:
      | 'SETTLEMENT_DUE'
      | 'ACCOUNT_LOCKED'
      | 'TREASURY_DEPOSIT'
      | 'SERVER_FEE'
      | 'REFERRAL_WITHDRAWAL'
      | 'ORDER'
      | 'INVOICE'
      | 'SETTLEMENT_DIGEST';
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'DUE' | 'LOCKED' | 'INFO';
    title: string;
    username?: string | null;
    userId?: string | null;
    amountUsd?: number;
    network?: string | null;
    asset?: string | null;
    txHash?: string | null;
    invoiceNo?: string | null;
    dueAt?: string | null;
    details?: string | null;
    imageDataUrl?: string | null;
    inlineKeyboard?: InlineKeyboardButton[][];
  }
): Promise<{ ok: boolean; skipped?: boolean; messageId?: number; error?: string }> {
  try {
    const cfg = await resolveChannelAndBotConfig(env);
    if (!cfg.transactionsEnabled || !cfg.transactionsChannelId) {
      return { ok: false, skipped: true };
    }
    const botToken = await resolveTelegramBotToken(env);
    if (!botToken) return { ok: false, skipped: true };

    const statusBadge =
      params.status === 'CONFIRMED'
        ? '✅ تایید و تسویه‌شده'
        : params.status === 'REJECTED'
          ? '❌ رد شده'
          : params.status === 'LOCKED'
            ? '🔒 مسدود به‌دلیل بدهی سررسیدشده'
            : params.status === 'DUE'
              ? '⏰ سررسید تسویه / بدهی باز'
              : params.status === 'PENDING'
                ? '⏳ در انتظار بررسی / تایید'
                : '💳 گزارش مالی';

    const lines = [
      `💳 **06. تراکنش‌های دلارینو** · ${params.title}`,
      `• وضعیت: ${statusBadge}`,
      params.username ? `• کاربر: \`${params.username}\`${params.userId ? ` (${params.userId})` : ''}` : null,
      typeof params.amountUsd === 'number'
        ? `• مبلغ: **$${params.amountUsd.toFixed(2)}**${params.asset ? ` ${params.asset}` : ''}${params.network ? ` (${params.network})` : ''}`
        : null,
      params.invoiceNo ? `• شماره فاکتور: \`${params.invoiceNo}\`` : null,
      params.dueAt ? `• موعد سررسید: ${params.dueAt}` : null,
      params.txHash ? `• TX Hash: \`${params.txHash}\`` : null,
      params.details ? `\n📝 ${params.details}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const tg = new TelegramBotClient(botToken);
    const opts = params.inlineKeyboard ? { inlineKeyboard: params.inlineKeyboard } : undefined;
    if (params.imageDataUrl && params.imageDataUrl.startsWith('data:image/')) {
      try {
        const sent = await tg.sendDataUrlPhoto(cfg.transactionsChannelId, params.imageDataUrl, lines.slice(0, 1020), opts);
        return { ok: true, messageId: sent.message_id };
      } catch {
        // fallback to text message
      }
    }
    const sent = await tg.sendMessage(cfg.transactionsChannelId, lines, opts);
    return { ok: true, messageId: sent.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function promptCopyTraderPublish(
  env: Env,
  params: {
    traderId: string;
    traderName: string;
    traderTelegramId?: string | null;
    copyTradeId: string;
    symbol: string;
    direction: Direction;
    leverage: number;
    entryPrice: string;
    stopLoss?: string;
    tp1?: string;
    tp2?: string;
    tp3?: string;
  }
): Promise<boolean> {
  const botToken = await resolveTelegramBotToken(env);
  if (!botToken || !params.traderTelegramId) return false;
  const tg = new TelegramBotClient(botToken);
  const text =
    `🏆 تایید انتشار معامله کپی‌ترید (${params.traderName})\n\n` +
    `شما یک معامله جدید باز کردید:\n` +
    `${params.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'} · ${params.symbol} · ${params.leverage}x\n` +
    `📥 ورود: ${params.entryPrice}\n` +
    (params.stopLoss ? `⛔️ SL: ${params.stopLoss}\n` : '') +
    (params.tp1 ? `🟢 TP1: ${params.tp1}\n` : '') +
    (params.tp2 ? `🟡 TP2: ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3: ${params.tp3}\n` : '') +
    `\nآیا مایلید این معامله دقیقاً با همین مشخصات برای تمام دنبال‌کنندگان کپی‌ترید منتشر و آینه‌سازی شود؟`;

  try {
    await tg.sendMessage(params.traderTelegramId, text, {
      inlineKeyboard: copyTradePublishConfirmButtons(params.copyTradeId),
    });
    return true;
  } catch {
    return false;
  }
}

export async function maybePromptCopyTraderOnNewTrade(
  env: Env,
  userId: string,
  params: {
    sourceTradeId: string;
    symbol: string;
    direction: Direction;
    leverage: number;
    entryPrice: string;
    stopLoss: string;
    tp1: string;
    tp2?: string;
    tp3?: string;
    note?: string;
  }
): Promise<{ prompted: boolean; copyTradeId?: string }> {
  const trader = await env.DB.prepare(
    `SELECT ct.id, ct.display_name, ct.telegram_id, ct.auto_ask_publish, u.telegram_id AS linked_tg_id
     FROM copy_traders ct
     LEFT JOIN users u ON u.id = ct.user_id
     WHERE ct.user_id = ? AND ct.is_active = 1
     LIMIT 1`
  ).bind(userId).first<{
    id: string;
    display_name: string;
    telegram_id: string | null;
    linked_tg_id: string | null;
    auto_ask_publish: number;
  }>().catch(() => null);

  if (!trader || trader.auto_ask_publish === 0) {
    return { prompted: false };
  }

  const copyTradeId = randomId('ctt');
  await env.DB.prepare(
    `INSERT INTO copy_trader_trades
     (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, tp2, tp3, status, publish_status, source_trade_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'PENDING_CONFIRM', ?, ?)`
  ).bind(
    copyTradeId,
    trader.id,
    params.symbol,
    params.direction,
    params.leverage,
    params.entryPrice,
    params.stopLoss,
    params.tp1,
    params.tp2 ?? null,
    params.tp3 ?? null,
    params.sourceTradeId,
    params.note || 'معامله زنده تریدر کپی‌ترید (در انتظار تایید انتشار)'
  ).run();

  const tgId = trader.telegram_id || trader.linked_tg_id;
  await promptCopyTraderPublish(env, {
    traderId: trader.id,
    traderName: trader.display_name,
    traderTelegramId: tgId,
    copyTradeId,
    symbol: params.symbol,
    direction: params.direction,
    leverage: params.leverage,
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
    tp2: params.tp2,
    tp3: params.tp3,
  });

  return { prompted: true, copyTradeId };
}

export async function publishAlertToRadarChannel(env: Env, text: string): Promise<boolean> {
  const botToken = await resolveTelegramBotToken(env);
  if (!botToken) return false;
  const cfg = await resolveChannelAndBotConfig(env);
  if (!cfg.alertsEnabled) return false;
  const target = cfg.alertsChannelId || cfg.channelHandle;
  if (!target) return false;
  try {
    const tg = new TelegramBotClient(botToken);
    await tg.sendMessage(target, text);
    return true;
  } catch {
    return false;
  }
}

