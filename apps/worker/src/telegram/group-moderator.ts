import { generateSupportAIReply } from '../ai/providers.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { getFounderProfile } from '../services/founder-profile.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import { ANTI_SCAM_WARNING_FA, OFFICIAL_BOT_HANDLE, OFFICIAL_CHANNEL_HANDLE } from './formatter.js';
import { getSystemSettingValue, resolveChannelAndBotConfig } from './publisher.js';

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface TelegramGroupMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
  chat: { id: number; type: string; title?: string; username?: string };
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  new_chat_members?: Array<{ id: number; first_name?: string; username?: string; is_bot?: boolean }>;
  reply_to_message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    text?: string;
  };
  forward_from?: unknown;
  forward_from_chat?: { id: number; type: string; username?: string; title?: string };
  forward_origin?: { type: string; chat?: { id: number; type: string; username?: string; title?: string } };
}

export interface GroupModSettings {
  antiLink: boolean;
  antiForward: boolean;
  antiScam: boolean;
  aiAssistant: boolean;
  welcomeEnabled: boolean;
}

export async function getGroupModSettings(db: D1Database): Promise<GroupModSettings> {
  const [antiLink, antiForward, antiScam, aiAssistant, welcomeEnabled] = await Promise.all([
    getSystemSettingValue(db, 'group_antilink_enabled', 'true'),
    getSystemSettingValue(db, 'group_antiforward_enabled', 'true'),
    getSystemSettingValue(db, 'group_antiscam_enabled', 'true'),
    getSystemSettingValue(db, 'group_ai_assistant_enabled', 'true'),
    getSystemSettingValue(db, 'group_welcome_enabled', 'true'),
  ]);
  return {
    antiLink: antiLink !== 'false',
    antiForward: antiForward !== 'false',
    antiScam: antiScam !== 'false',
    aiAssistant: aiAssistant !== 'false',
    welcomeEnabled: welcomeEnabled !== 'false',
  };
}

function buildGroupModInlineKeyboard(s: GroupModSettings): InlineKeyboardButton[][] {
  return [
    [
      {
        text: `🛡 ضدلینک: ${s.antiLink ? 'روشن ✅' : 'خاموش ❌'}`,
        callback_data: 'gmod:toggle:group_antilink_enabled',
      },
      {
        text: `🚫 ضدفوروارد: ${s.antiForward ? 'روشن ✅' : 'خاموش ❌'}`,
        callback_data: 'gmod:toggle:group_antiforward_enabled',
      },
    ],
    [
      {
        text: `🚨 ضداسکم: ${s.antiScam ? 'روشن ✅' : 'خاموش ❌'}`,
        callback_data: 'gmod:toggle:group_antiscam_enabled',
      },
      {
        text: `🤖 پاسخ AI در گروه: ${s.aiAssistant ? 'روشن ✅' : 'خاموش ❌'}`,
        callback_data: 'gmod:toggle:group_ai_assistant_enabled',
      },
    ],
    [
      {
        text: `👋 خوشامدگویی: ${s.welcomeEnabled ? 'روشن ✅' : 'خاموش ❌'}`,
        callback_data: 'gmod:toggle:group_welcome_enabled',
      },
      { text: '📜 قوانین گروه', callback_data: 'gmod:rules' },
    ],
  ];
}

export async function isGroupModeratorExempt(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  userId: number | string,
  username?: string
): Promise<boolean> {
  const uid = String(userId);
  if (uid === '1087968824' || username === 'GroupAnonymousBot') return true;
  if (uid === (env.OWNER_TELEGRAM_ID || '944021185')) return true;

  const dbAdmin = await env.DB.prepare(
    `SELECT role FROM users WHERE telegram_id = ? AND role IN ('owner', 'admin') LIMIT 1`
  )
    .bind(uid)
    .first<{ role: string }>()
    .catch(() => null);
  if (dbAdmin) return true;

  const member = await bot.getChatMember(chatId, Number(userId)).catch(() => null);
  return member?.status === 'creator' || member?.status === 'administrator';
}

function extractWhitelistedTokens(botUsername: string, webAppUrl: string): Set<string> {
  const allowed = new Set<string>([
    '@dollarino_bot',
    '@dollarino_official',
    '@avidkiya',
    '@avid_kiya',
    `@${botUsername.replace(/^@/, '').toLowerCase()}`,
  ]);
  try {
    const host = new URL(webAppUrl).hostname.toLowerCase();
    if (host) allowed.add(host);
  } catch {
    // ignore invalid url
  }
  return allowed;
}

function containsUnauthorizedLink(
  rawText: string,
  entities: TelegramMessageEntity[] | undefined,
  botUsername: string,
  webAppUrl: string
): boolean {
  const allowed = extractWhitelistedTokens(botUsername, webAppUrl);
  const textLower = rawText.toLowerCase();

  for (const ent of entities ?? []) {
    if (ent.type === 'text_link' && ent.url) {
      const uLower = ent.url.toLowerCase();
      const ok = Array.from(allowed).some((w) => uLower.includes(w.replace(/^@/, '')));
      if (!ok) return true;
    }
    if (ent.type === 'url') {
      const slice = rawText.slice(ent.offset, ent.offset + ent.length).toLowerCase();
      const ok = Array.from(allowed).some((w) => slice.includes(w.replace(/^@/, '')));
      if (!ok) return true;
    }
    if (ent.type === 'mention') {
      const slice = rawText.slice(ent.offset, ent.offset + ent.length).toLowerCase();
      if (!allowed.has(slice)) return true;
    }
  }

  const matches = textLower.match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)[a-z0-9_/?=&.%+-]+|@[a-z0-9_]{4,}/gi) ?? [];
  for (const m of matches) {
    const clean = m.toLowerCase();
    if (clean.startsWith('@')) {
      if (!allowed.has(clean)) return true;
    } else {
      const isAllowed = Array.from(allowed).some((w) => !w.startsWith('@') ? clean.includes(w) : clean.includes(`t.me/${w.slice(1)}`));
      if (!isAllowed) return true;
    }
  }

  return false;
}

function containsScamPattern(rawText: string): boolean {
  const t = rawText.toLowerCase();
  const patterns = [
    /seed\s*phrase/i,
    /private\s*key/i,
    /recovery\s*phrase/i,
    /کلمات\s*بازیابی/,
    /عبارت\s*بازیابی/,
    /پرایوت\s*کی/,
    /تضمین\s*سود\s*(100|۱۰۰|قطعی)/,
    /واریز\s*کن.*دو\s*برابر/,
    /double\s*your\s*(usdt|btc|eth|crypto)/i,
    /claim\s*free\s*airdrop/i,
  ];
  return patterns.some((p) => p.test(t));
}

async function recordGroupWarning(
  db: D1Database,
  chatId: string,
  userTgId: string,
  username: string,
  reason: string
): Promise<number> {
  const existing = await db
    .prepare(`SELECT id, warn_count FROM telegram_group_warnings WHERE chat_id = ? AND user_tg_id = ? LIMIT 1`)
    .bind(chatId, userTgId)
    .first<{ id: string; warn_count: number }>()
    .catch(() => null);

  if (existing) {
    const next = existing.warn_count + 1;
    await db
      .prepare(
        `UPDATE telegram_group_warnings SET warn_count = ?, username = ?, last_reason = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(next, username, reason, existing.id)
      .run()
      .catch(() => {});
    return next;
  }

  await db
    .prepare(
      `INSERT INTO telegram_group_warnings (id, chat_id, user_tg_id, username, warn_count, last_reason)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .bind(randomId('gwarn'), chatId, userTgId, username, reason)
    .run()
    .catch(() => {});
  return 1;
}

export function extractGroupAiPrompt(
  msg: TelegramGroupMessage,
  botUsername: string
): { triggered: boolean; question: string } {
  const text = (msg.text ?? msg.caption ?? '').trim();
  if (!text) return { triggered: false, question: '' };
  const cleanBot = botUsername.replace(/^@/, '').toLowerCase();

  const isReplyToBot = Boolean(
    msg.reply_to_message?.from?.is_bot &&
      (!msg.reply_to_message.from.username || msg.reply_to_message.from.username.toLowerCase() === cleanBot)
  );
  const mentionRegex = new RegExp(`@(?:${cleanBot}|dollarino_bot)\\b`, 'gi');
  const hasMention = mentionRegex.test(text);
  const hasAskCmd = /^\/(ask|ai)(?:@\w+)?\b/i.test(text);
  const hasNameCall = /^(?:سلام\s+)?(?:دلارینو|ربات\s+دلارینو|دستیار\s+دلارینو)[،,:\s]/i.test(text);

  if (!isReplyToBot && !hasMention && !hasAskCmd && !hasNameCall) {
    return { triggered: false, question: '' };
  }

  let q = text
    .replace(mentionRegex, ' ')
    .replace(/^\/(ask|ai)(?:@\w+)?\s*/i, '')
    .replace(/^(?:سلام\s+)?(?:دلارینو|ربات\s+دلارینو|دستیار\s+دلارینو)[،,:\s]*/i, '')
    .trim();

  if (!q && msg.reply_to_message?.text) {
    q = `این پیام را به صورت واضح توضیح بده: ${msg.reply_to_message.text.slice(0, 400)}`;
  } else if (!q) {
    q = 'سلام! خودت رو معرفی کن و بگو چطور می‌تونم از امکانات دلارینو استفاده کنم؟';
  }

  return { triggered: true, question: q };
}

export async function handleGroupModCallback(
  env: Env,
  bot: TelegramBotClient,
  cqId: string,
  chatId: string | number,
  msgId: number | undefined,
  fromUserId: number,
  fromUsername: string | undefined,
  data: string
): Promise<boolean> {
  if (!data.startsWith('gmod:')) return false;

  const isAdmin = await isGroupModeratorExempt(env, bot, chatId, fromUserId, fromUsername);
  if (!isAdmin) {
    await bot.answerCallbackQuery(cqId, '⛔️ فقط مدیران گروه می‌توانند تنظیمات نظارت را تغییر دهند.', true);
    return true;
  }

  if (data === 'gmod:rules') {
    await bot.answerCallbackQuery(cqId);
    const rulesText =
      `📜 **قوانین رسمی گروه کامیونیتی دلارینو**\n\n` +
      `1️⃣ ارسال هرگونه لینک خارجی، کانال و تبلیغات ممنوع است (حذف خودکار + ۳ اخطار = سکوت ۲۴ ساعته).\n` +
      `2️⃣ هرگونه وعده سود تضمینی، درخواست ۱۲ کلمه بازیابی (Seed Phrase) یا پیام مشکوک اسکم محسوب و فوراً حذف می‌شود.\n` +
      `3️⃣ پشتیبانی و ثبت‌نام رسمی فقط در ربات ${OFFICIAL_BOT_HANDLE} است.\n` +
      `4️⃣ برای پرسش سوال از هوش مصنوعی در همین گروه، کافیست بنویسید:\n` +
      `\`@Dollarino_bot سوالتون...\``;
    await bot.sendMessage(chatId, rulesText);
    return true;
  }

  if (data.startsWith('gmod:toggle:')) {
    const key = data.slice('gmod:toggle:'.length);
    const allowedKeys = new Set([
      'group_antilink_enabled',
      'group_antiforward_enabled',
      'group_antiscam_enabled',
      'group_ai_assistant_enabled',
      'group_welcome_enabled',
    ]);
    if (!allowedKeys.has(key)) {
      await bot.answerCallbackQuery(cqId);
      return true;
    }
    const cur = await getSystemSettingValue(env.DB, key, 'true');
    const next = cur === 'false' ? 'true' : 'false';
    await env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(key, next)
      .run();

    const fresh = await getGroupModSettings(env.DB);
    await bot.answerCallbackQuery(cqId, next === 'true' ? 'فعال شد ✅' : 'غیرفعال شد ❌');
    if (msgId) {
      await bot.editMessageText(
        chatId,
        msgId,
        `🛡 **تنظیمات مبصر هوشمند گروه دلارینو**\nوضعیت فیلترها و دستیار AI گروه را مدیریت کنید:`,
        buildGroupModInlineKeyboard(fresh)
      ).catch(() => {});
    }
    return true;
  }

  await bot.answerCallbackQuery(cqId);
  return true;
}

export async function handleTelegramGroupMessage(
  env: Env,
  bot: TelegramBotClient,
  msg: TelegramGroupMessage
): Promise<{ ok: boolean; action?: string }> {
  const chatId = msg.chat.id;
  const chatIdStr = String(chatId);
  const cfg = await resolveChannelAndBotConfig(env);
  const settings = await getGroupModSettings(env.DB);

  // 1. Welcome newly joined non-bot members
  if (msg.new_chat_members && msg.new_chat_members.length > 0 && settings.welcomeEnabled) {
    const humanNames = msg.new_chat_members
      .filter((m) => !m.is_bot)
      .map((m) => m.first_name || (m.username ? `@${m.username}` : 'دوست عزیز'));
    if (humanNames.length > 0) {
      await bot.sendMessage(
        chatId,
        `👋 خوش آمدید **${humanNames.join('، ')}** به گروه کامیونیتی **دلارینو**!\n\n` +
          `🤖 ربات و هوش مصنوعی رسمی ما در گروه فعال است — هر سوال یا مشکلی دارید کافیست **@${cfg.botUsername}** را صدا بزنید یا روی پیام ربات ریپلای کنید.\n` +
          `🛡 برای امنیت خودتان: هرگز ۱۲ کلمه بازیابی ولت را برای کسی نفرستید. لینک و تبلیغ در گروه خودکار حذف می‌شود.\n\n` +
          `📌 ربات رسمی: @${cfg.botUsername} | کانال: ${OFFICIAL_CHANNEL_HANDLE}`,
        {
          inlineKeyboard: [
            [
              { text: '🤖 شروع با ربات دلارینو', url: `https://t.me/${cfg.botUsername}`, style: 'success' },
              { text: '🌐 ورود به سایت', url: cfg.webAppUrl, style: 'primary' },
            ],
          ],
        }
      ).catch(() => {});
    }
    return { ok: true, action: 'welcome' };
  }

  if (!msg.from || msg.from.is_bot) {
    return { ok: true, action: 'ignored_bot' };
  }

  const senderId = msg.from.id;
  const senderName = msg.from.first_name || msg.from.username || String(senderId);
  const rawText = (msg.text ?? msg.caption ?? '').trim();
  const entities = msg.entities ?? msg.caption_entities;

  const isExemptAdmin = await isGroupModeratorExempt(env, bot, chatId, senderId, msg.from.username);

  // 2. Group Admin Slash Moderation Commands
  if (/^\/rules(?:@\w+)?$/i.test(rawText)) {
    await bot.sendMessage(
      chatId,
      `📜 **قوانین گروه کامیونیتی دلارینو**\n\n` +
        `1️⃣ ارسال لینک خارجی، دعوت گروه/کانال دیگر و تبلیغات ممنوع است (حذف خودکار + اخطار).\n` +
        `2️⃣ هرگونه وعده سود تضمینی، طرح پانزی یا درخواست Seed Phrase کلاهبرداری است.\n` +
        `3️⃣ تمام امکانات تحلیل، کیف‌پول دمو رایگان و آلرت TradingView رایگان است؛ ۳ معامله سودده اول واقعی ۰٪ کارمزد و پس از آن فقط ۳٪ از سود واقعی محاسبه می‌شود.\n` +
        `4️⃣ برای پرسش در گروه، ربات را با **@${cfg.botUsername}** منشن کنید.`,
      { replyToMessageId: msg.message_id }
    ).catch(() => {});
    return { ok: true, action: 'rules' };
  }

  if (/^\/mod(?:@\w+)?$/i.test(rawText)) {
    if (!isExemptAdmin) {
      await bot.sendMessage(chatId, '⛔️ فقط مدیران گروه به تنظیمات مبصر دسترسی دارند.', {
        replyToMessageId: msg.message_id,
      }).catch(() => {});
      return { ok: true, action: 'mod_denied' };
    }
    await bot.sendMessage(
      chatId,
      `🛡 **پنل مبصر هوشمند گروه دلارینو**\nتنظیمات ضدلینک، ضدفوروارد، ضداسکم و پاسخگویی هوش مصنوعی گروه:`,
      { inlineKeyboard: buildGroupModInlineKeyboard(settings), replyToMessageId: msg.message_id }
    ).catch(() => {});
    return { ok: true, action: 'mod_panel' };
  }

  if (isExemptAdmin && /^\/(warn|mute|unmute|ban)(?:@\w+)?(\s+\d+)?/i.test(rawText) && msg.reply_to_message?.from) {
    const target = msg.reply_to_message.from;
    const targetName = target.first_name || target.username || String(target.id);
    const cmd = rawText.toLowerCase();

    if (cmd.startsWith('/warn')) {
      const count = await recordGroupWarning(env.DB, chatIdStr, String(target.id), targetName, 'اخطار مستقیم مدیر');
      await bot.sendMessage(chatId, `⚠️ کاربر **${targetName}** اخطار مدیریت دریافت کرد (${count}/3).`).catch(() => {});
      if (count >= 3) {
        const until = Math.floor(Date.now() / 1000) + 86400;
        await bot.restrictChatMember(chatId, target.id, { can_send_messages: false }, until).catch(() => {});
        await bot.sendMessage(chatId, `🔇 **${targetName}** به دلیل دریافت ۳ اخطار، ۲۴ ساعت در حالت سکوت قرار گرفت.`).catch(() => {});
      }
      return { ok: true, action: 'admin_warn' };
    }

    if (cmd.startsWith('/mute')) {
      const minsMatch = rawText.match(/\d+/);
      const mins = Math.max(5, Math.min(43200, Number(minsMatch?.[0] || 60)));
      const until = Math.floor(Date.now() / 1000) + mins * 60;
      await bot.restrictChatMember(chatId, target.id, { can_send_messages: false }, until).catch(() => {});
      await bot.sendMessage(chatId, `🔇 کاربر **${targetName}** به مدت ${mins} دقیقه توسط مدیر سکوت شد.`).catch(() => {});
      return { ok: true, action: 'admin_mute' };
    }

    if (cmd.startsWith('/unmute')) {
      await bot.restrictChatMember(chatId, target.id, {
        can_send_messages: true,
        can_send_photos: true,
        can_send_documents: true,
        can_send_other_messages: true,
      }).catch(() => {});
      await env.DB.prepare(`UPDATE telegram_group_warnings SET warn_count = 0 WHERE chat_id = ? AND user_tg_id = ?`)
        .bind(chatIdStr, String(target.id))
        .run()
        .catch(() => {});
      await bot.sendMessage(chatId, `🔊 محدودیت کاربر **${targetName}** برداشته شد و اخطارها صفر گردید.`).catch(() => {});
      return { ok: true, action: 'admin_unmute' };
    }

    if (cmd.startsWith('/ban')) {
      await bot.banChatMember(chatId, target.id).catch(() => {});
      await bot.sendMessage(chatId, `⛔️ کاربر **${targetName}** توسط مدیر از گروه حذف شد.`).catch(() => {});
      return { ok: true, action: 'admin_ban' };
    }
  }

  // 3. Automated Anti-Link / Anti-Forward / Anti-Scam Moderation for non-admins
  if (!isExemptAdmin) {
    const isChannelForward = Boolean(
      msg.forward_origin?.type === 'channel' || msg.forward_from_chat?.type === 'channel'
    );
    let violationReason = '';

    if (settings.antiScam && rawText && containsScamPattern(rawText)) {
      violationReason = 'محتوای مشکوک به کلاهبرداری / اسکم';
    } else if (settings.antiForward && isChannelForward) {
      violationReason = 'فوروارد پست تبلیغاتی از کانال‌های دیگر';
    } else if (settings.antiLink && rawText && containsUnauthorizedLink(rawText, entities, cfg.botUsername, cfg.webAppUrl)) {
      violationReason = 'ارسال لینک یا آیدی بدون هماهنگی';
    }

    if (violationReason) {
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
      const warnCount = await recordGroupWarning(env.DB, chatIdStr, String(senderId), senderName, violationReason);
      if (warnCount >= 3) {
        const until = Math.floor(Date.now() / 1000) + 86400;
        await bot.restrictChatMember(chatId, senderId, { can_send_messages: false }, until).catch(() => {});
        await bot.sendMessage(
          chatId,
          `🛡 **${senderName}** به دلیل تکرار «${violationReason}» (۳/۳ اخطار) به‌صورت خودکار ۲۴ ساعت محدود شد.`
        ).catch(() => {});
        return { ok: true, action: 'moderated_muted' };
      }
      await bot.sendMessage(
        chatId,
        `⚠️ **${senderName}**، ${violationReason} در گروه مجاز نیست و پیام شما حذف شد (اخطار **${warnCount}/3**).`
      ).catch(() => {});
      return { ok: true, action: 'moderated_deleted' };
    }
  }

  // 4. Community AI Q&A whenever someone @mentions the bot, replies to the bot, or calls "دلارینو"
  if (settings.aiAssistant && rawText) {
    const { triggered, question } = extractGroupAiPrompt(msg, cfg.botUsername);
    if (triggered) {
      const founder = await getFounderProfile(env.DB).catch(() => null);
      const founderSummary = founder
        ? `سازنده و مالک مستقل پروژه: ${founder.fullNameFa} (${founder.telegram}، ایمیل ${founder.email}، ${founder.independenceFa}).`
        : 'سازنده مستقل: آوید کیا (@avidkiya).';

      const enrichedQuestion =
        `[سوال در گروه کامیونیتی دلارینو از کاربر «${senderName}»]\n` +
        `اطلاعات کلیدی پلتفرم: اشتراک ماهانه $0 (کاملاً رایگان)، کیف‌پول دمو قابل تنظیم رایگان، حداقل موجودی لایو Trust Wallet $10، ` +
        `۳ معامله سودده اول واقعی ۰٪ کارمزد و سپس کارمزد سرور فقط ۳٪ از سود معاملات واقعی (۹۷٪ سود متعلق به کاربر)، ۲۵+ اندیکاتور و آلرت رایگان TradingView، پشتیبانی در ربات @${cfg.botUsername}. ${founderSummary}\n\n` +
        `سوال کاربر: ${question}\n` +
        `لطفاً پاسخ دقیق، کوتاه، محترمانه و کاربردی (حداکثر ۸ خط) به فارسی بده.`;

      const aiRes = await generateSupportAIReply(env, {
        userId: `tg_grp_${senderId}`,
        username: senderName,
        question: enrichedQuestion,
      });

      const replyText =
        `🤖 **پاسخ دستیار هوشمند دلارینو:**\n\n` +
        `${aiRes.reply}\n\n` +
        `💡 برای تحلیل تصویر چارت یا شروع ترید، پیام خصوصی به **@${cfg.botUsername}** بدهید.\n` +
        `${ANTI_SCAM_WARNING_FA}`;

      await bot.sendMessage(chatId, replyText, {
        replyToMessageId: msg.message_id,
        inlineKeyboard: [
          [
            { text: '🤖 گفتگو در پیوی ربات', url: `https://t.me/${cfg.botUsername}`, style: 'success' },
            { text: '🚀 ورود به سایت دلارینو', url: cfg.webAppUrl, style: 'primary' },
          ],
        ],
      }).catch(() => {});

      return { ok: true, action: 'group_ai_replied' };
    }
  }

  return { ok: true, action: 'group_noop' };
}
