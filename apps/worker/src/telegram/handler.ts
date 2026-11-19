import { formatDollarinoSignal, parseDollarinoSignal } from '@dollarino/core';
import { getPlatformAISummary } from '../ai/providers.js';
import { ensureUserDefaults } from '../auth.js';
import { encryptVaultJson, hashPassword, maskSecret, randomId } from '../crypto.js';
import { executeSignalForUser, type UserBotConfigRow } from '../engine/executor.js';
import type { AuthUser, Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { resolveUserEntitlement } from '../routes/subscriptions.js';
import { TelegramBotClient } from './client.js';
import {
  exchangeSelectionKeyboard,
  formatBalanceCard,
  mainMenuKeyboard,
  settingsKeyboard,
  welcomeMessage,
} from './formatter.js';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
  channel_post?: {
    message_id: number;
    chat: { id: number; username?: string; title?: string };
    text?: string;
  };
}

interface TelegramStepState {
  step: string;
  provider?: 'toobit' | 'kcex';
  apiKey?: string;
}

function isUserAdmin(telegramId: string, role: string, env: Env): boolean {
  const ownerId = env.OWNER_TELEGRAM_ID || '944021185';
  return telegramId === ownerId || role === 'owner' || role === 'admin';
}

async function getOrProvisionTelegramUser(env: Env, tgUser: { id: number; first_name?: string; username?: string }) {
  const tgId = String(tgUser.id);
  let row = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?').bind(tgId).first<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_state: string | null;
  }>();

  if (!row) {
    const id = randomId('usr');
    const ownerId = env.OWNER_TELEGRAM_ID || '944021185';
    const role = tgId === ownerId ? 'owner' : 'user';
    const username = tgUser.username || tgUser.first_name || `tg_${tgId}`;
    const pseudoEmail = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('pwd'));

    await env.DB.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, telegram_first_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, pseudoEmail, username, pwd, role, tgId, tgUser.username ?? null, tgUser.first_name ?? null).run();

    await ensureUserDefaults(env.DB, id);
    row = { id, email: pseudoEmail, username, role, is_blocked: 0, telegram_state: null };
  }

  return row;
}

export async function handleTelegramUpdate(env: Env, botToken: string, update: TelegramUpdate) {
  const bot = new TelegramBotClient(botToken);

  // 1. Handle Channel Posts containing Dollarino Signals
  if (update.channel_post?.text) {
    const signal = parseDollarinoSignal(update.channel_post.text);
    if (!signal) return { ok: true, ignored: 'not a signal' };

    const sigId = randomId('sig');
    await env.DB.prepare(
      `INSERT INTO signals (id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status)
       VALUES (?, 'telegram_channel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
    ).bind(
      sigId,
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
      formatDollarinoSignal(signal)
    ).run();

    // Route to all linked users with Auto-Trade or Manual-Trade enabled (enforcing paid Copy-Trade entitlement)
    const users = await env.DB.prepare(
      `SELECT u.id, u.email, u.username, u.role, u.telegram_id, bc.trade_execution_mode, bc.bot_state
       FROM users u JOIN bot_configs bc ON u.id = bc.user_id
       WHERE u.telegram_id IS NOT NULL AND u.is_blocked = 0`
    ).all<{
      id: string;
      email: string;
      username: string;
      role: AuthUser['role'];
      telegram_id: string;
      trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
      bot_state: string;
    }>();

    for (const u of users.results) {
      const ent = await resolveUserEntitlement(env.DB, {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        telegramId: u.telegram_id,
      });
      if (!ent.allowCopyTrade) {
        continue;
      }
      if (u.trade_execution_mode === 'AUTO' && (u.bot_state === 'RUNNING_PAPER' || u.bot_state === 'RUNNING_LIVE')) {
        await executeSignalForUser(env, u.id, signal, { signalId: sigId }).catch(() => {});
      } else {
        await bot.sendMessage(u.telegram_id, formatDollarinoSignal(signal), {
          inlineKeyboard: [[{ text: '👈 دلارینو ترید کن برام 👉', callback_data: `manual_trade:${sigId}` }]],
        }).catch(() => {});
      }
    }
    return { ok: true, signalId: sigId };
  }

  // 2. Handle Inline Callback Queries
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;
    const msgId = cq.message?.message_id;
    const data = cq.data ?? '';
    const user = await getOrProvisionTelegramUser(env, cq.from);

    if (data.startsWith('manual_trade:')) {
      const sigId = data.split(':')[1]!;
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚠️ آیا از باز کردن معامله برای این سیگنال اطمینان دارید؟`,
          [
            [
              { text: 'تایید میکنم ✅', callback_data: `confirm_trade:${sigId}` },
              { text: 'نه دستم خورد ❌', callback_data: `cancel_trade:${sigId}` },
            ],
          ]
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data.startsWith('cancel_trade:')) {
      if (msgId) {
        await bot.editMessageText(chatId, msgId, '❌ سفارش لغو شد و هیچ معامله‌ای باز نگردید.');
      }
      await bot.answerCallbackQuery(cq.id, 'لغو شد');
      return { ok: true };
    }

    if (data.startsWith('confirm_trade:')) {
      const sigId = data.split(':')[1]!;
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: String(cq.from.id),
      });
      if (!ent.allowCopyTrade) {
        await bot.answerCallbackQuery(cq.id, 'برای کپی‌ترید تلگرام اشتراک Pro یا VIP لازم است.', true);
        return { ok: true };
      }
      const sigRow = await env.DB.prepare('SELECT * FROM signals WHERE id = ?').bind(sigId).first<{
        symbol: string;
        direction: 'LONG' | 'SHORT';
        timeframe: string;
        price: string;
        stop_loss: string;
        leverage: number;
        tp1: string;
        tp2: string | null;
        tp3: string | null;
      }>();
      if (!sigRow) {
        await bot.answerCallbackQuery(cq.id, 'سیگنال منقضی شده است', true);
        return { ok: true };
      }
      const res = await executeSignalForUser(
        env,
        user.id,
        {
          symbol: sigRow.symbol,
          direction: sigRow.direction,
          timeframe: sigRow.timeframe,
          price: sigRow.price,
          stopLoss: sigRow.stop_loss,
          leverage: sigRow.leverage,
          tp1: sigRow.tp1,
          tp2: sigRow.tp2 ?? undefined,
          tp3: sigRow.tp3 ?? undefined,
        },
        { signalId: sigId, forceBypassState: true }
      );
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          res.ok ? `✅ معامله با موفقیت ثبت شد (شناسه: ${res.tradeId})` : `❌ خطا در ثبت معامله: ${res.error}`
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data === 'toggle_auto_on' || data === 'toggle_auto_off') {
      const nextState = data === 'toggle_auto_on' ? 'RUNNING_PAPER' : 'STOPPED';
      await env.DB.prepare(
        `UPDATE bot_configs SET trade_execution_mode = 'AUTO', bot_state = ? WHERE user_id = ?`
      ).bind(nextState, user.id).run();
      await bot.answerCallbackQuery(cq.id, data === 'toggle_auto_on' ? 'اتوترید روشن شد 🤖' : 'اتوترید خاموش شد');
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `وضعیت اتوترید: ${data === 'toggle_auto_on' ? '🟢 روشن (خودکار)' : '🔴 خاموش'}`
        );
      }
      return { ok: true };
    }

    await bot.answerCallbackQuery(cq.id);
    return { ok: true };
  }

  // 3. Handle Normal Messages & Menu Navigation
  const msg = update.message;
  if (!msg?.from || !msg.text) return { ok: true };

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const user = await getOrProvisionTelegramUser(env, msg.from);
  const admin = isUserAdmin(String(msg.from.id), user.role, env);

  if (user.is_blocked) {
    await bot.sendMessage(chatId, '⛔️ دسترسی حساب شما موقتاً توسط مدیر محدود شده است.');
    return { ok: true };
  }

  const clearState = () =>
    env.DB.prepare('UPDATE users SET telegram_state = NULL WHERE id = ?').bind(user.id).run();
  const setState = (s: TelegramStepState) =>
    env.DB.prepare('UPDATE users SET telegram_state = ? WHERE id = ?').bind(JSON.stringify(s), user.id).run();

  // /start or Back
  if (text === '/start' || text === 'بازگشت به صفحه قبل 🔙') {
    await clearState();
    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username), {
      replyKeyboard: mainMenuKeyboard(),
    });
    return { ok: true };
  }

  // Link Web account with /link CODE
  if (text.startsWith('/link ')) {
    const code = text.slice(6).trim().toUpperCase();
    const webUser = await env.DB.prepare(
      `SELECT id, username, telegram_link_expires_at FROM users WHERE telegram_link_code = ?`
    ).bind(code).first<{ id: string; username: string; telegram_link_expires_at: string | null }>();

    if (!webUser) {
      await bot.sendMessage(chatId, '❌ کد اتصال نامعتبر است. لطفاً از پنل وب یک کد جدید بسازید.');
      return { ok: true };
    }
    if (webUser.telegram_link_expires_at && Date.parse(webUser.telegram_link_expires_at) < Date.now()) {
      await bot.sendMessage(chatId, '⏰ اعتبار این کد اتصال منقضی شده است. لطفاً از پنل وب یک کد جدید بسازید.');
      return { ok: true };
    }

    // Reassign telegram_id onto the web account
    if (webUser.id !== user.id) {
      await env.DB.prepare(`UPDATE users SET telegram_id = NULL WHERE id = ?`).bind(user.id).run();
      await env.DB.prepare(
        `UPDATE users SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?, telegram_link_code = NULL WHERE id = ?`
      ).bind(String(msg.from.id), msg.from.username ?? null, msg.from.first_name ?? null, webUser.id).run();
    }
    await bot.sendMessage(chatId, `✅ حساب تلگرام شما با موفقیت به اکانت وب «${webUser.username}» متصل شد!`, {
      replyKeyboard: mainMenuKeyboard(),
    });
    return { ok: true };
  }

  // Handle Multi-Step Flows
  if (user.telegram_state) {
    const state = JSON.parse(user.telegram_state) as TelegramStepState;
    if (state.step === 'AWAIT_API_KEY' && state.provider) {
      await setState({ step: 'AWAIT_API_SECRET', provider: state.provider, apiKey: text });
      await bot.sendMessage(chatId, '🔐 عالی! حالا لطفاً Secret Key صرافی خود را ارسال کنید:');
      return { ok: true };
    }
    if (state.step === 'AWAIT_API_SECRET' && state.provider && state.apiKey) {
      const apiKey = state.apiKey;
      const apiSecret = text;
      const encCreds = await encryptVaultJson({ apiKey, apiSecret }, env.MASTER_ENCRYPTION_KEY);
      const ent = await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: String(msg.from.id),
      });
      const canActivateLive = ent.allowLiveTrading;

      if (canActivateLive) {
        await env.DB.prepare(`UPDATE exchange_connections SET is_active = 0 WHERE user_id = ?`).bind(user.id).run();
      }
      await env.DB.prepare(
        `INSERT INTO exchange_connections (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'PENDING')`
      ).bind(
        randomId('ex'),
        user.id,
        state.provider,
        `${state.provider.toUpperCase()} Telegram`,
        canActivateLive ? 1 : 0,
        maskSecret(apiKey),
        encCreds
      ).run();

      await clearState();
      const { adapter } = await resolveUserExchangeAdapter(env, user.id, state.provider);
      const test = await adapter.testConnection();
      if (!canActivateLive) {
        await bot.sendMessage(
          chatId,
          `🔐 کلید ${state.provider.toUpperCase()} با رمزنگاری AES-256 ذخیره شد (در حالت Standby).\n\nبرای فعال‌سازی معاملات واقعی روی Toobit یا KCEX لطفاً از پنل وب دلارینو اشتراک Pro یا VIP تهیه کنید.`,
          { replyKeyboard: mainMenuKeyboard() }
        );
      } else if (test.ok && test.balance) {
        await env.DB.prepare(`UPDATE bot_configs SET trading_mode = 'LIVE' WHERE user_id = ?`).bind(user.id).run();
        await bot.sendMessage(
          chatId,
          `✅ اتصال به ${state.provider.toUpperCase()} با موفقیت برقرار شد!\n\n${formatBalanceCard(state.provider, test.balance)}`,
          { replyKeyboard: mainMenuKeyboard() }
        );
      } else {
        await bot.sendMessage(
          chatId,
          `⚠️ کلیدها به‌صورت رمزنگاری‌شده ذخیره شدند اما تست اتصال صرافی پیام داد:\n${test.message}`,
          { replyKeyboard: mainMenuKeyboard() }
        );
      }
      return { ok: true };
    }
    if (state.step === 'AWAIT_MARGIN_PCT') {
      const pct = Number(text);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        await bot.sendMessage(chatId, '❌ لطفاً یک عدد معتبر بین 1 تا 100 وارد کنید:');
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET margin_pct = ? WHERE user_id = ?').bind(pct, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ درصد مارجین هر معامله روی ${pct}% تنظیم شد.`, {
        replyKeyboard: settingsKeyboard(admin),
      });
      return { ok: true };
    }
    if (state.step === 'AWAIT_BROADCAST' && admin) {
      await clearState();
      const targets = await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL').all<{ telegram_id: string }>();
      let sent = 0;
      for (const t of targets.results) {
        await bot.sendMessage(t.telegram_id, `📢 اطلاعیه دلارینو:\n\n${text}`).then(() => sent++).catch(() => {});
      }
      await bot.sendMessage(chatId, `✅ پیام همگانی به ${sent} کاربر ارسال شد.`, {
        replyKeyboard: settingsKeyboard(admin),
      });
      return { ok: true };
    }
  }

  // Main Menu Handlers
  if (text === 'اتصال به صرافی 🔗' || text === 'تغییر API صرافی 📡') {
    await bot.sendMessage(
      chatId,
      `🔗 انتخاب صرافی و اتصال:\n\n• **Toobit (توبیت):** اتصال مستقیم API فیوچرز\n• **KCEX (کی‌سی‌ای‌ایکس):** معاملات ۰٪ کارمزد میرر\n• **Paper Mode:** حساب دمو رایگان برای تست\n\nصرافی مورد نظر خود را انتخاب کنید:`,
      { replyKeyboard: exchangeSelectionKeyboard() }
    );
    return { ok: true };
  }

  if (text === 'Toobit (توبیت - API لایو) 🟢' || text === 'Toobit (توبیت - فعال) 🟢') {
    await setState({ step: 'AWAIT_API_KEY', provider: 'toobit' });
    await bot.sendMessage(
      chatId,
      `🟢 راهنمای اتصال به صرافی Toobit:\n۱. وارد بخش API Management در توبیت شوید و کلید جدید با دسترسی Futures Trade بسازید (دسترسی Withdraw را غیرفعال بگذارید).\n۲. اکنون **API Key** خود را ارسال کنید:`,
      { removeKeyboard: true }
    );
    return { ok: true };
  }

  if (text === 'KCEX (۰٪ کارمزد) 🔵' || text === 'KCEX (در انتظار API) ⏳') {
    await bot.sendMessage(
      chatId,
      `🔵 صرافی KCEX (۰٪ کارمزد میرر):\nبرای اتصال حساب KCEX و لینک معامله سریع، وارد پنل وب دلارینو بخش «صرافی Toobit / KCEX» شوید و اشتراک Pro خود را فعال کنید.`,
      { replyKeyboard: exchangeSelectionKeyboard() }
    );
    return { ok: true };
  }

  if (text === 'Paper Mode (دمو رایگان) 🧪' || text === 'Paper Mode (آزمایشی) 🧪') {
    await env.DB.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER' WHERE user_id = ?`).bind(user.id).run();
    const { adapter } = await resolveUserExchangeAdapter(env, user.id, 'paper');
    const bal = await adapter.getBalance();
    await bot.sendMessage(chatId, `✅ حالت معاملاتی روی **Paper Demo** فعال شد!\n\n${formatBalanceCard('PAPER', bal)}`, {
      replyKeyboard: mainMenuKeyboard(),
    });
    return { ok: true };
  }

  if (text === 'تنظیمات ⚙️') {
    await bot.sendMessage(chatId, '⚙️ منوی تنظیمات ربات دلارینو:', {
      replyKeyboard: settingsKeyboard(admin),
    });
    return { ok: true };
  }

  if (text === 'اتوترید 🤖') {
    await bot.sendMessage(chatId, '🤖 وضعیت اجرای خودکار سیگنال‌ها (Auto-Trade) را انتخاب کنید:', {
      inlineKeyboard: [
        [
          { text: 'روشن کردن اتوترید 🟢', callback_data: 'toggle_auto_on' },
          { text: 'خاموش کردن 🔴', callback_data: 'toggle_auto_off' },
        ],
      ],
    });
    return { ok: true };
  }

  if (text === 'دستی ترید 💪') {
    await env.DB.prepare(`UPDATE bot_configs SET trade_execution_mode = 'MANUAL_CONFIRM' WHERE user_id = ?`)
      .bind(user.id).run();
    await bot.sendMessage(chatId, '💪 حالت **دستی ترید** فعال شد! از این پس زیر هر سیگنال دکمه «👈 دلارینو ترید کن برام 👉» برای تایید شما ارسال می‌شود.');
    return { ok: true };
  }

  if (text === 'دریافت موجودی صرافی 💳') {
    const cfg = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string }>();
    const { adapter, provider } = await resolveUserExchangeAdapter(
      env,
      user.id,
      cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
    );
    const bal = await adapter.getBalance().catch((err) => {
      throw err;
    });
    await bot.sendMessage(chatId, formatBalanceCard(provider, bal));
    return { ok: true };
  }

  if (text === 'تنظیم مقادیر معاملات 🪛') {
    const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<UserBotConfigRow>();
    await setState({ step: 'AWAIT_MARGIN_PCT' });
    await bot.sendMessage(
      chatId,
      `🪛 تنظیمات فعلی معامله:\n• درصد مارجین هر معامله: ${cfg?.margin_pct ?? 10}%\n• تقسیم تارگت‌ها: TP1=${cfg?.tp1_close_pct ?? 50}% (ریسک‌فری خودکار) | TP2=${cfg?.tp2_close_pct ?? 25}% | TP3=${cfg?.tp3_close_pct ?? 25}%\n• حداکثر اهرم مجاز: ${cfg?.max_leverage ?? 20}x\n\nبرای تغییر، عدد درصد مارجین جدید (مثلاً 10) را بفرستید (یا از پنل وب همه‌چیز را دقیق‌تر تنظیم کنید):`
    );
    return { ok: true };
  }

  if (text === 'دریافت اعلان 🔔') {
    const cfg = await env.DB.prepare('SELECT notifications_enabled FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ notifications_enabled: number }>();
    const next = cfg?.notifications_enabled ? 0 : 1;
    await env.DB.prepare('UPDATE bot_configs SET notifications_enabled = ? WHERE user_id = ?').bind(next, user.id).run();
    await bot.sendMessage(chatId, next ? '🔔 اعلان‌های باز و بسته شدن معاملات روشن شد.' : '🔕 اعلان‌های ربات خاموش شد.');
    return { ok: true };
  }

  if (text === 'حساب کاربری 👤') {
    const stats = await env.DB.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ total: number; wins: number; pnl: number }>();

    const cfg = await env.DB.prepare('SELECT trading_mode, trade_execution_mode, margin_pct FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<UserBotConfigRow>();
    const ent = await resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: String(msg.from.id),
    });

    await bot.sendMessage(
      chatId,
      `👤 اطلاعات حساب کاربری دلارینو:\n\n` +
      `🆔 آیدی تلگرام: ${msg.from.id}\n` +
      `📧 ایمیل وب متصل: ${user.email.endsWith('.local') ? 'هنوز به وب لینک نشده (/link)' : user.email}\n` +
      `💎 اشتراک فعال: ${ent.planNameFa}${ent.hasPaidPlan ? ` (${ent.daysRemaining} روز باقیمانده)` : ''}\n` +
      `⚙️ حالت معامله: ${cfg?.trading_mode ?? 'PAPER'} | ${cfg?.trade_execution_mode ?? 'AUTO'}\n` +
      `📊 تعداد معاملات بسته: ${stats?.total ?? 0} (برد: ${stats?.wins ?? 0})\n` +
      `💰 سود/ضرر کل: ${(stats?.pnl ?? 0).toFixed(2)} USDT`
    );
    return { ok: true };
  }

  if (text === 'ربات و هوش مصنوعی من 🤖') {
    const [bots, aiSummary, cfg] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM telegram_bots WHERE user_id = ?').bind(user.id).first<{ cnt: number }>(),
      getPlatformAISummary(env),
      env.DB.prepare('SELECT strategy_key FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ strategy_key: string }>(),
    ]);
    const stratName =
      cfg?.strategy_key === 'ai_autonomous_agent'
        ? 'هوش مصنوعی دلارینو'
        : cfg?.strategy_key === 'dollarino_v01'
          ? 'استراتژی منتخب دلارینو (موتور دُرنا V1)'
          : cfg?.strategy_key || 'استراتژی منتخب دلارینو';
    await bot.sendMessage(
      chatId,
      `🤖 وضعیت ربات و هوش مصنوعی دلارینو:\n\n` +
      `🔹 استراتژی انتخاب‌شده: ${stratName}\n` +
      `🔹 موتور هوش مصنوعی دلارینو: ${aiSummary.effectiveModeLabelFa}\n` +
      `🔹 ربات‌های کپی ترید دلارینو متصل: ${bots?.cnt ?? 0}\n\n` +
      `شما بدون نیاز به خرید API هوش مصنوعی، مستقیماً از پنل وب می‌توانید ربات را با یک دکمه روی کل بازار روشن کنید.`
    );
    return { ok: true };
  }

  if (text === 'راهنما 📚') {
    const help = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'help_text'`).first<{ value: string }>();
    await bot.sendMessage(chatId, help?.value || '📚 راهنمای دلارینو در پنل وب در دسترس است.');
    return { ok: true };
  }

  if (text === 'پنل مدیریت 💼' && admin) {
    const uCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
    const tCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM trades').first<{ cnt: number }>();
    await setState({ step: 'AWAIT_BROADCAST' });
    await bot.sendMessage(
      chatId,
      `💼 پنل مدیریت دلارینو:\n\n👥 کل کاربران: ${uCount?.cnt ?? 0}\n📈 کل معاملات ثبت‌شده: ${tCount?.cnt ?? 0}\n\nاگر می‌خواهید پیام همگانی به همه کاربران تلگرام ارسال کنید، متن پیام را بفرستید (یا «بازگشت به صفحه قبل 🔙» را بزنید).`
    );
    return { ok: true };
  }

  // Fallback: if user pasted a raw Dollarino Signal straight into the bot chat!
  const directSignal = parseDollarinoSignal(text);
  if (directSignal) {
    const sigId = randomId('sig');
    await env.DB.prepare(
      `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
       VALUES (?, ?, 'manual_test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
    ).bind(
      sigId,
      user.id,
      directSignal.symbol,
      directSignal.direction,
      directSignal.timeframe,
      directSignal.price,
      directSignal.stopLoss,
      directSignal.leverage,
      directSignal.tp1,
      directSignal.tp2 ?? null,
      directSignal.tp3 ?? null,
      formatDollarinoSignal(directSignal)
    ).run();

    await bot.sendMessage(chatId, `📡 سیگنال شناسایی شد! مایلید معامله را اجرا کنم؟\n\n${formatDollarinoSignal(directSignal)}`, {
      inlineKeyboard: [[{ text: '👈 دلارینو ترید کن برام 👉', callback_data: `manual_trade:${sigId}` }]],
    });
    return { ok: true };
  }

  await bot.sendMessage(chatId, 'لطفاً یکی از گزینه‌های منو را انتخاب کنید یا سیگنال را برای بررسی ارسال کنید:', {
    replyKeyboard: mainMenuKeyboard(),
  });
  return { ok: true };
}
