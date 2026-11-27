import { computeDynamicRecommendedSettings, formatDollarinoSignal, FREE_TV_ALERT_TEMPLATES, parseDollarinoSignal, resolveEngineDisplayLabel, selectClosedCandles, type Direction, type MarketType, type Timeframe } from '@dollarino/core';
import {
  DOLLARINO_CREATOR_INFO,
  listSelectableAIModels,
  runDedicatedAIChat,
  type ExtractedChartSetup,
} from '../ai/assistant.js';
import { generateSupportAIReply, getPlatformAISummary, resolveAIEnsemble, runAutonomousAITrader } from '../ai/providers.js';
import {
  ensureUserDefaults,
  resolveAuthProviderToggles,
  resolveEffectiveReferralCode,
  syncTelegramAvatarForUser,
} from '../auth.js';
import { encryptVaultJson, generateReferralCode, hashPassword, hmacSha256Hex, maskSecret, randomId, sha256Hex } from '../crypto.js';
import {
  annotateRoutesWithLivePools,
  buildMultiDappRoutes,
  buildTrustWalletSwapLinks,
  fetchDexTrendingOverview,
  getDexTokenPools,
  searchDexPairs,
  type DexTokenEnriched,
} from '../dex/screener.js';
import { closeCopyPositionV2, discoverTop10SmartTraders, type CopyPositionV2Row } from '../dex/smart-copy.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import {
  getActiveEngineState,
  toggleTradingEngine,
  type TradingEngineChoice,
} from '../engine/exclusive-engine.js';
import { executeSignalForUser, resolveUserCapitalSummary, type UserBotConfigRow } from '../engine/executor.js';
import { discoverListingAndBoomCandidates } from '../engine/listing-sniper.js';
import { checkPreTradeOnboardingGate } from '../engine/onboarding-gate.js';
import type { AuthUser, Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { fetchIranUsdtRate } from '../exchanges/iran-rate.js';
import { DEFAULT_TRAINED_RULES, extractRulesFromConversation, type TrainedAIRules } from '../routes/my-ai.js';
import { buildVerifiedCardCanonicalPayload } from '../routes/trading.js';
import {
  buildTokenDisplayIconUrl,
  listUnifiedClosedTrades,
  normalizeCardPeriod,
  resolveTokenLogoPngDataUri,
} from '../services/profit-cards.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';
import { resolveUserEntitlement } from '../routes/subscriptions.js';
import {
  fetchBscUsdtBalance,
  fetchEvmNativeBalance,
  fetchSolanaBalance,
  fetchTonBalance,
  fetchTronBalances,
  getTrustWalletLiveTotalUsd,
  isValidEvm,
  isValidSolana,
  isValidTon,
  isValidTron,
} from '../routes/trustwallet.js';
import {
  FREE_PROFITABLE_LIVE_TRADES,
  getUserServerFeeSummary,
  SERVER_PROFIT_FEE_PCT,
} from '../services/server-fee.js';
import { computeUnifiedPortfolioAccounting } from '../services/portfolio-accounting.js';
import { getFounderProfile } from '../services/founder-profile.js';
import { syncAutoTopSiteTraders } from '../services/site-traders.js';
import {
  getSystemSetting,
  handleAdminCallback,
  handleAdminStepInput,
  openAdminPanelHome,
  parseAdminPerms,
  type AdminActor,
  type AdminStepState,
} from './admin-menu.js';
import { TelegramBotClient, type InlineKeyboardButton } from './client.js';
import { resolveOwnerTelegramId } from './token.js';
import {
  handleGroupModCallback,
  handleTelegramGroupMessage,
  type TelegramGroupMessage,
} from './group-moderator.js';
import {
  ANTI_SCAM_WARNING_FA,
  CREATOR_ATTRIBUTION_FA,
  channelSignalInlineButtons,
  type CollapsibleMenuSection,
  contactVerificationKeyboard,
  exchangeSelectionKeyboard,
  formatAccountCard,
  formatBalanceCard,
  formatSimpleSiteDashboard,
  formatToman,
  mainMenuKeyboard,
  miniAppInlineKeyboard,
  OFFICIAL_BOT_HANDLE,
  preAuthIntroMessage,
  settingsKeyboard,
  simpleSiteHomeInlineKeyboard,
  welcomeMessage,
} from './formatter.js';
import {
  notifyAllAdmins,
  notifyAllAdminsPhoto,
  publishProfitCardToTelegram,
  publishSignalClosedCard,
  resolveChannelAndBotConfig,
} from './publisher.js';

interface TelegramUpdate {
  update_id: number;
  message?: TelegramGroupMessage & {
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
    contact?: {
      phone_number: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
  };
  edited_message?: TelegramGroupMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number; type?: string }; message_id: number };
    data?: string;
  };
  my_chat_member?: {
    chat: { id: number; type: string; title?: string; username?: string };
    from?: { id: number; first_name?: string; username?: string };
    new_chat_member?: { status: string; can_post_messages?: boolean };
  };
  channel_post?: {
    message_id: number;
    date?: number;
    forward_date?: number;
    forward_from?: unknown;
    forward_from_chat?: unknown;
    chat: { id: number; username?: string; title?: string };
    text?: string;
  };
}

interface TelegramStepState extends Partial<AdminStepState> {
  step: string;
  subId?: string;
  pendingStartArg?: string;
  wizMarginPct?: number;
  wizLev?: number;
  wizEngine?: string;
  activeAiSessionId?: string;
}

async function sendFounderAboutCard(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  webAppUrl: string,
  replyKeyboard?: ReturnType<typeof mainMenuKeyboard>
) {
  const [fp, cfg] = await Promise.all([
    getFounderProfile(env.DB).catch(() => null),
    resolveChannelAndBotConfig(env),
  ]);
  const cleanWeb = webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const name = fp?.fullNameFa || DOLLARINO_CREATOR_INFO.nameFa;
  const verId = fp?.verificationId || 'تنظیم‌نشده';
  const lines = [
    `🛡 **شفافیت کامل بنیان‌گذار، استقلال ۱۰۰٪ و تاییدیه ضدپانزی دلارینو**`,
    ``,
    `👨‍💻 سازنده و مالک مستقل: **${name}** (${fp?.roleFa || 'بنیان‌گذار و معمار اصلی'})`,
    `🆔 کد تایید رسمی قابل استعلام: \`${verId}\``,
    fp?.email ? `📧 ایمیل رسمی: ${fp.email}` : '',
    fp?.phone ? `📞 تماس / استعلام: ${fp.phone}` : '',
    fp?.addressFa ? `📍 نشانی قابل استعلام: ${fp.addressFa}` : '',
    `📱 تلگرام: ${fp?.telegramUrl || DOLLARINO_CREATOR_INFO.telegramUrl} | اینستاگرام/X: ${fp?.instagram || DOLLARINO_CREATOR_INFO.instagram}`,
    ``,
    `✅ **بیانیه استقلال ۱۰۰٪ و ضدپانزی:**`,
    fp?.independenceFa || 'پلتفرم دلارینو از صفر تا صد به‌صورت کاملاً مستقل طراحی شده و هیچ وابستگی ثالث ندارد.',
    fp?.antiPonziFa || 'سرمایه ۱۰۰٪ در کیف‌پول شخصی Trust Wallet شما می‌ماند؛ اشتراک ماهانه صفر است، ۳ معامله سودده اول رایگان (۰٪) و پس از آن فقط ۳٪ کارمزد سرور از سود واقعی محاسبه می‌شود.',
    ``,
    `🌐 وب‌سایت: ${cleanWeb}`,
  ].filter(Boolean);

  const inlineKb: InlineKeyboardButton[][] = [];
  if (cfg.communityGroupInvite) {
    inlineKb.push([{ text: '👥 عضویت در گروه کامیونیتی رسمی', url: cfg.communityGroupInvite, style: 'success' }]);
  }
  if (cleanWeb.startsWith('https://')) {
    inlineKb.push([{ text: '🛡 مشاهده کارت تایید روی سایت', url: `${cleanWeb}/#trust-founder`, style: 'primary' }]);
  }

  await bot.sendMessage(chatId, lines.join('\n'), {
    replyKeyboard,
    inlineKeyboard: inlineKb.length > 0 ? inlineKb : undefined,
  });
}

function splitTelegramChunks(text: string, maxLen = 3800): string[] {
  const clean = text.trim();
  if (clean.length <= maxLen) return [clean];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen * 0.4) idx = maxLen;
    chunks.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function openDedicatedAIChatMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: number | string,
  user: ProvisionedUserRow,
  webAppUrl: string,
  opts?: { createNewSession?: boolean; editMsgId?: number }
): Promise<void> {
  const { models, selectedModelId } = await listSelectableAIModels(env, user.id);
  const currentModel = models.find((m) => m.id === selectedModelId) || models[0];
  let sessionId = '';
  if (opts?.createNewSession) {
    sessionId = randomId('aichat');
    await env.DB.prepare(`INSERT INTO ai_chat_sessions (id, user_id, title, model_id) VALUES (?, ?, ?, ?)`)
      .bind(sessionId, user.id, 'چت تلگرام دلارینو', currentModel?.id || null)
      .run()
      .catch(() => {});
  } else {
    const existing = await env.DB.prepare(
      `SELECT id FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
      .bind(user.id)
      .first<{ id: string }>()
      .catch(() => null);
    sessionId = existing?.id || '';
  }

  await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
    .bind(JSON.stringify({ step: 'AWAIT_AI_CHAT', activeAiSessionId: sessionId || undefined }), user.id)
    .run();

  const visionBadge = currentModel?.supportsVision ? '👁️ پشتیبانی کامل از عکس چارت' : '💬 مدل متنی';
  const hasHttps = webAppUrl.startsWith('https://');
  const text =
    `🧠 **هوش مصنوعی اختصاصی دلارینو (نسخه هوشمند + تحلیل چارت)**\n\n` +
    `🔹 مدل فعال فعلی: **${currentModel?.label || 'هوش مصنوعی مرکزی دلارینو'}** (${visionBadge})\n` +
    `🔹 مدل‌های آماده انتخاب: **${models.length} مدل متصل**\n\n` +
    `✨ **هر کاری می‌خواهی همین‌جا انجام بده:**\n` +
    `• **عکس چارت / اسکرین‌شات بفرست** تا روند، سطوح و ستاپ کامل (Entry / SL / TP1-3) بدهم 📸\n` +
    `• **هر سوالی داری بپرس** (تحلیل بازار، کدنویسی Pine/Python، استراتژی، سوالات عمومی و راهنمای دلارینو) 💬\n` +
    `• از دکمه‌های زیر مدل را عوض کن یا گفتگوی جدید بساز:\n\n` +
    `${CREATOR_ATTRIBUTION_FA}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: `🤖 تغییر مدل (${models.length})`, callback_data: 'tg_ai_models', style: 'primary' },
      { text: '🆕 گفتگوی جدید', callback_data: 'tg_ai_new', style: 'success' },
    ],
    ...(hasHttps
      ? [[{ text: '💬 باز کردن صفحه چت کامل در مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=aichat` }, style: 'primary' as const }]]
      : []),
    [{ text: '🏠 خروج به منوی اصلی', callback_data: 'tg_ai_exit' }],
  ];

  if (opts?.editMsgId) {
    await bot.editMessageText(chatId, opts.editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function handleTelegramAIChatTurn(params: {
  env: Env;
  bot: TelegramBotClient;
  chatId: number | string;
  user: ProvisionedUserRow;
  webAppUrl: string;
  text: string;
  imageFileId?: string;
  sessionId?: string;
}): Promise<void> {
  const { env, bot, chatId, user, webAppUrl, text, imageFileId } = params;
  let imageDataUrl: string | null = null;
  if (imageFileId) {
    try {
      const dl = await bot.downloadFileAsDataUrl(imageFileId);
      imageDataUrl = dl.dataUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در دریافت عکس از تلگرام';
      await bot.sendMessage(chatId, `⚠️ ${msg}`);
      if (!text) return;
    }
  }

  const res = await runDedicatedAIChat(env, {
    userId: user.id,
    sessionId: params.sessionId || null,
    message: text,
    imageDataUrl,
  });

  await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
    .bind(JSON.stringify({ step: 'AWAIT_AI_CHAT', activeAiSessionId: res.sessionId }), user.id)
    .run();

  const header = `🧠 **${res.modelLabel}**${res.usedVision ? ' (👁️ تحلیل تصویر چارت)' : ''}\n${
    res.visionFallbackNotice ? `ℹ️ ${res.visionFallbackNotice}\n` : ''
  }\n`;
  let setupBanner = '';
  if (res.setup) {
    setupBanner =
      `\n\n━━━━━━━━━━━━━━\n` +
      `🎯 **ستاپ معاملاتی استخراج‌شده:**\n` +
      `• نماد: **${res.setup.symbol}** | جهت: **${res.setup.direction}**${res.setup.timeframe ? ` (${res.setup.timeframe})` : ''}\n` +
      `• ورود: \`${res.setup.entry}\` | حد ضرر: \`${res.setup.stopLoss}\`\n` +
      `• تارگت‌ها: \`${res.setup.tp1}\`${res.setup.tp2 ? ` / \`${res.setup.tp2}\`` : ''}${res.setup.tp3 ? ` / \`${res.setup.tp3}\`` : ''}` +
      (res.setup.rrRatio ? ` | R:R ${res.setup.rrRatio}` : '');
  }

  const fullOut = `${header}${res.reply}${setupBanner}`;
  const chunks = splitTelegramChunks(fullOut);
  const hasHttps = webAppUrl.startsWith('https://');
  const kb: InlineKeyboardButton[][] = [
    ...(res.setup
      ? [[{ text: '⚡️ ثبت ستاپ و اجرای معامله در دلارینو', callback_data: `tg_ai_exec_setup:${res.sessionId}`, style: 'success' as const }]]
      : []),
    [
      { text: '🤖 انتخاب مدل AI', callback_data: 'tg_ai_models', style: 'primary' },
      { text: '🆕 گفتگوی جدید', callback_data: 'tg_ai_new' },
    ],
    [
      ...(hasHttps
        ? [{ text: '💬 ادامه در صفحه چت وب/مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=aichat` } }]
        : []),
      { text: '🏠 منوی اصلی', callback_data: 'tg_ai_exit' },
    ],
  ];

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await bot.sendMessage(chatId, chunks[i]!, isLast ? { inlineKeyboard: kb } : undefined);
  }
}

interface ProvisionedUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  is_blocked: number;
  telegram_state: string | null;
  telegram_admin_perms: string | null;
  admin_panel_last_active_at?: string | null;
  wallet_balance_usdt?: number;
  phone_number?: string | null;
  phone_verified?: number;
  trust_wallet_address?: string | null;
  trust_wallet_tron?: string | null;
  trust_wallet_solana?: string | null;
  trust_wallet_ton?: string | null;
  ui_mode?: string | null;
  extension_api_key?: string | null;
}

function getUserUiMode(user: ProvisionedUserRow): 'simple' | 'pro' {
  return user.ui_mode === 'pro' ? 'pro' : 'simple';
}

function isSuperAdminUser(telegramId: string, role: string, ownerId: string): boolean {
  return (Boolean(ownerId) && telegramId === ownerId) || role === 'owner';
}

function isUserAdmin(telegramId: string, role: string, ownerId: string): boolean {
  return isSuperAdminUser(telegramId, role, ownerId) || role === 'admin';
}

async function buildTelegramOnboardingGatePayload(env: Env, userId: string): Promise<{
  text: string;
  inlineKeyboard: InlineKeyboardButton[][];
}> {
  const gate = await checkPreTradeOnboardingGate(env.DB, userId);
  const modePicked = gate.hasSelectedMode;
  const riskDone = gate.hasAcceptedRisk;
  const isLive = gate.tradingMode === 'LIVE';
  const text =
    `🛡 **تنظیم و تایید اجباری قبل از اولین معامله**\n\n` +
    `برای حفظ سرمایه شما، تا زمانی که هر دو مورد زیر را تایید نکنید **هیچ معامله‌ای (حتی آزمایشی/دمو)** باز نمی‌شود:\n\n` +
    `۱️⃣ انتخاب حالت معاملاتی: ${modePicked ? (isLive ? '✅ حساب واقعی (Trust Wallet)' : '✅ حساب دمو (آزمایشی)') : '⏳ هنوز انتخاب نشده'}\n` +
    `۲️⃣ مطالعه و پذیرش مسئولیت ریسک بازار: ${riskDone ? '✅ تایید شد' : '⏳ هنوز تایید نشده'}\n\n` +
    `⚖️ *توضیح ریسک:* دلارینو دستیار تحلیل و اتوماسیون غیرامانی است و هیچ سود تضمینی ندارد؛ مسئولیت کامل ریسک معاملات، اهرم و حد ضرر با کاربر است (۳ معامله سودده اول واقعی ۰٪ کارمزد و پس از آن ۳٪ کارمزد سود).`;

  const inlineKeyboard: InlineKeyboardButton[][] = [
    [
      {
        text: modePicked && !isLive ? '✅ حالت دمو (آزمایشی)' : '🧪 انتخاب حالت دمو (آزمایشی)',
        callback_data: 'tg_onboard_mode:PAPER',
        style: modePicked && !isLive ? 'success' : 'primary',
      },
      {
        text: modePicked && isLive ? '✅ حالت واقعی (Trust Wallet)' : '🛡 انتخاب حالت واقعی (Trust)',
        callback_data: 'tg_onboard_mode:LIVE',
        style: modePicked && isLive ? 'success' : undefined,
      },
    ],
    [
      {
        text: riskDone ? '✅ قوانین و ریسک تایید شد' : '☑️ متن ریسک را خواندم و تایید می‌کنم',
        callback_data: 'tg_onboard_accept',
        style: riskDone ? 'success' : 'primary',
      },
    ],
  ];
  return { text, inlineKeyboard };
}

async function startBotOneClickForTelegram(params: {
  env: Env;
  bot: TelegramBotClient;
  chatId: number | string;
  user: ProvisionedUserRow;
  tgId: string;
  webAppUrl: string;
  overrideStrategyKey?: string;
}): Promise<{ ok: boolean; nextState?: string; needsOnboardingGate?: boolean; text: string }> {
  const { env, user, overrideStrategyKey } = params;

  const onboardingGate = await checkPreTradeOnboardingGate(env.DB, user.id);
  if (!onboardingGate.ok) {
    return {
      ok: false,
      needsOnboardingGate: true,
      text: `⛔️ ${onboardingGate.error}`,
    };
  }

  const cfg = await env.DB.prepare(
    'SELECT trading_mode, strategy_key, market_type, entry_timeframe, higher_timeframe, margin_pct, max_leverage, ai_min_confidence FROM bot_configs WHERE user_id = ?'
  )
    .bind(user.id)
    .first<{
      trading_mode: string;
      strategy_key: string;
      market_type?: MarketType;
      entry_timeframe?: Timeframe;
      higher_timeframe?: Timeframe;
      margin_pct?: number;
      max_leverage?: number;
      ai_min_confidence?: number;
    }>();

  if (cfg?.trading_mode === 'LIVE') {
    const readiness = await getTrustWalletLiveTotalUsd(env.DB, user.id);
    if (!readiness.hasWallet) {
      return {
        ok: false,
        text: '⚠️ حساب شما روی حالت **واقعی (Trust Wallet)** است اما هنوز کیف‌پول Trust Wallet متصل نکرده‌اید.\nابتدا آدرس کیف‌پول خود را متصل کنید یا حالت حساب را به «دمو آزمایشی» تغییر دهید.',
      };
    }
    if (!readiness.meetsMinimum) {
      return {
        ok: false,
        text: `⚠️ برای اجرای ربات روی کیف‌پول واقعی (Trust Wallet)، حداقل ${readiness.minRequiredUsd} دلار موجودی نیاز است (موجودی فعلی: $${readiness.totalUsd.toFixed(2)}).`,
      };
    }
  }

  const targetStrategy = overrideStrategyKey || cfg?.strategy_key || 'ai_autonomous_agent';
  if (targetStrategy === 'ai_autonomous_agent') {
    const ensemble = await resolveAIEnsemble(env, user.id);
    if (ensemble.engines.length === 0) {
      return {
        ok: false,
        text: ensemble.capExceeded
          ? '⚠️ سقف درخواست روزانه موتور «هوش مصنوعی دلارینو» پر شده است. لطفاً در پنل مدیریت سقف را افزایش دهید.'
          : '⚠️ موتور «هوش مصنوعی دلارینو» هنوز توسط مدیریت فعال نشده است.',
      };
    }
  }

  const { adapter, provider } = await resolveUserExchangeAdapter(
    env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );
  if (cfg?.trading_mode === 'LIVE' && provider === 'paper') {
    return {
      ok: false,
      text: '⚠️ حالت معاملاتی شما روی **واقعی (Trust Wallet)** تنظیم شده و به‌طور خودکار به دمو تغییر نمی‌کند. لطفاً ابتدا اتصال Trust Wallet / Agent Wallet خود را تکمیل کنید یا حالت را روی دمو بگذارید.',
    };
  }
  const nextState = cfg?.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
  const effectiveTradingMode = cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';

  const engineChoice: TradingEngineChoice =
    targetStrategy === 'ai_autonomous_agent'
      ? 'CENTRAL_AI'
      : targetStrategy === 'my_custom_ai'
        ? 'MY_AI'
        : targetStrategy === 'copy_trade'
          ? 'COPY_TRADE'
          : 'STRATEGY';
  // Multi-Engine V11: enable chosen engine without stopping/wiping any other engine already toggled ON!
  const excl = await toggleTradingEngine(env.DB, user.id, engineChoice, true, {
    strategyKey: targetStrategy,
    auditSource: 'telegram_start',
  });
  const enginesLabel = excl.activeEngines
    .map((e) =>
      e === 'CENTRAL_AI'
        ? '🤖 هوش مصنوعی مرکزی'
        : e === 'STRATEGY'
          ? '📊 استراتژی دُرنا V1'
          : e === 'MY_AI'
            ? '🧠 هوش مصنوعی من'
            : e === 'COPY_TRADE'
              ? '🏆 کپی‌ترید'
              : '🔥 اسنایپ لیست/میم'
    )
    .join(' + ');

  await env.DB.prepare(
    `UPDATE bot_configs
     SET strategy_key = ?, trade_execution_mode = 'AUTO', auto_scan_top = 1, scan_scope = 'ALL_MARKET',
         bot_state = ?, started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
     WHERE user_id = ?`
  )
    .bind(targetStrategy, nextState, user.id)
    .run();

  if (excl.activeEngines.includes('COPY_TRADE')) {
    await env.DB.prepare(
      `UPDATE copy_subscriptions SET auto_mirror = 1, updated_at = datetime('now') WHERE user_id = ? AND is_active = 1`
    )
      .bind(user.id)
      .run()
      .catch(() => {});
  }

  const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
  const runTick = Promise.all([
    doStub.fetch('https://do/start').catch(() => {}),
    doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {}),
  ]);
  await Promise.race([runTick, new Promise((resolve) => setTimeout(resolve, 4500))]);

  const [bal, openCountRow] = await Promise.all([
    adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => ({ free: '0.00', used: '0.00', total: '0.00', currency: 'USDT' })),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN' AND mode = ?`)
      .bind(user.id, effectiveTradingMode)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
  ]);

  const exclNote =
    excl.activeEngines.length > 1
      ? `\n🎛 **حالت چندموتوره همزمان:** ${enginesLabel} بدون تداخل با یکدیگر در حال اجرا هستند.`
      : '';

  const text =
    `🟢 **ربات ترید خودکار دلارینو روشن شد و فعال است!**\n\n` +
    `• حالت اجرا: ⚡️ **۱۰۰٪ خودکار (بدون نیاز به تایید دستی)**\n` +
    `• موتورهای فعال: ${enginesLabel || resolveEngineDisplayLabel(targetStrategy)}\n` +
    `• بستر متصل: ${provider === 'paper' ? 'کیف‌پول دمو تراست‌ولت' : 'Trust Wallet Live'} (${effectiveTradingMode})\n` +
    `• موجودی آزاد: $${Number(bal.free || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}\n` +
    `• معاملات باز فعلی: ${openCountRow?.cnt ?? 0}\n\n` +
    `🔍 اسکن خودکار کل بازار هر ۱۵ ثانیه در حال اجراست و به‌محض یافتن نقطه ورود مطمئن، معامله با حد ضرر و ۳ تارگت خودکار باز می‌شود.` +
    exclNote;

  return { ok: true, nextState, text };
}

async function runInstantAiAutoTradeForTelegram(params: {
  env: Env;
  user: ProvisionedUserRow;
  tgId: string;
}): Promise<{ ok: boolean; needSubscription?: boolean; needsOnboardingGate?: boolean; text: string }> {
  const { env, user, tgId: _tgId } = params;

  const onboardingGate = await checkPreTradeOnboardingGate(env.DB, user.id);
  if (!onboardingGate.ok) {
    return {
      ok: false,
      needsOnboardingGate: true,
      text: `⛔️ ${onboardingGate.error}`,
    };
  }

  const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<UserBotConfigRow>();
  const tf: Timeframe = cfg?.entry_timeframe ?? '15m';
  const htf: Timeframe = cfg?.higher_timeframe ?? '1h';
  const marketType: MarketType = cfg?.market_type ?? 'FUTURES';
  const { adapter, provider } = await resolveUserExchangeAdapter(
    env,
    user.id,
    cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
  );

  // V11.0 Multi-Engine: enable CENTRAL_AI concurrently without turning off other active engines
  await toggleTradingEngine(env.DB, user.id, 'CENTRAL_AI', true, {
    strategyKey: 'ai_autonomous_agent',
    auditSource: 'telegram_instant_ai',
  });
  const nextState = cfg?.trading_mode === 'LIVE' && provider !== 'paper' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
  await env.DB.prepare(
    `UPDATE bot_configs SET strategy_key = 'ai_autonomous_agent', trade_execution_mode = 'AUTO', auto_scan_top = 1, scan_scope = 'ALL_MARKET', bot_state = ?, updated_at = datetime('now') WHERE user_id = ?`
  )
    .bind(nextState, user.id)
    .run();

  const symbols = Array.from(new Set([cfg?.symbol || 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT']));
  const openedTrades: string[] = [];
  const signalLines: string[] = [];

  for (const sym of symbols) {
    try {
      const [ltfRaw, htfRaw] = await Promise.all([
        adapter.getKlines(sym, tf, 180),
        adapter.getKlines(sym, htf, 90).catch(() => []),
      ]);
      const ltfClosed = selectClosedCandles(ltfRaw, tf);
      const htfClosed = selectClosedCandles(htfRaw, htf);
      const decision = await runAutonomousAITrader(env, user.id, {
        symbol: sym,
        timeframe: tf,
        higherTimeframe: htf,
        candles: ltfClosed.length >= 35 ? ltfClosed : ltfRaw,
        htfCandles: htfClosed.length >= 25 ? htfClosed : htfRaw,
        maxLeverage: marketType === 'SPOT' ? 1 : Math.max(1, cfg?.max_leverage ?? 10),
        minConfidence: cfg?.ai_min_confidence ?? 60,
        bypassCache: true,
      });

      if (decision.ok && (decision.action === 'LONG' || decision.action === 'SHORT')) {
        const sigId = randomId('sig');
        const sigObj = {
          symbol: sym,
          direction: decision.action as Direction,
          timeframe: tf,
          price: String(decision.entry),
          stopLoss: String(decision.stopLoss),
          leverage: marketType === 'SPOT' ? 1 : decision.leverage,
          tp1: String(decision.tp1),
          tp2: String(decision.tp2),
          tp3: String(decision.tp3),
          channelHandle: cfg?.signal_channel_handle || undefined,
          engineKey: 'ai_autonomous_agent',
          engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
          reason: decision.thesis,
        };
        await env.DB.prepare(
          `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status, engine_source)
           VALUES (?, ?, 'ai_agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', 'ai_autonomous_agent')`
        )
          .bind(
            sigId,
            user.id,
            sym,
            sigObj.direction,
            tf,
            sigObj.price,
            sigObj.stopLoss,
            sigObj.leverage,
            sigObj.tp1,
            sigObj.tp2,
            sigObj.tp3,
            formatDollarinoSignal(sigObj)
          )
          .run()
          .catch(() => {});

        const execRes = await executeSignalForUser(env, user.id, sigObj, {
          signalId: sigId,
          forceBypassState: true,
          strategyKey: 'ai_autonomous_agent',
          aiConfidence: decision.confidence,
          aiReasoning: decision.thesis,
          marketType,
        });
        if (execRes.ok) {
          await env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run().catch(() => {});
          openedTrades.push(`✅ **${sym}** ${sigObj.direction} (${sigObj.leverage}x) @ $${sigObj.price}`);
        } else {
          signalLines.push(`⚠️ ${sym} ${sigObj.direction} (${decision.confidence}%): اجرا نشد — ${execRes.error}`);
        }
      } else {
        signalLines.push(`⏸ ${sym}: ${decision.action} (${decision.confidence}%)`);
      }
    } catch {
      signalLines.push(`⚠️ ${sym}: خطا در دریافت داده بازار`);
    }
  }

  const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
  await doStub.fetch('https://do/start').catch(() => {});

  const summary =
    `⚡️ **نتیجه شکار و ترید فوری هوش مصنوعی (${provider.toUpperCase()})**\n\n` +
    (openedTrades.length > 0
      ? `🚀 **${openedTrades.length} معامله هم‌اکنون باز شد:**\n${openedTrades.join('\n')}\n\n`
      : `🔎 **در این لحظه سیگنال ورود قطعی معامله‌نشده‌ای باز نشد:**\n`) +
    (signalLines.length > 0 ? `${signalLines.join('\n')}\n\n` : '') +
    `🤖 ربات خودکار همچنان روشن است و هر ۱۵ ثانیه بازار را رصد می‌کند.`;

  return { ok: true, text: summary };
}

async function getOrProvisionTelegramUser(
  env: Env,
  tgUser: { id: number; first_name?: string; username?: string },
  options?: { allowLinkBypass?: boolean; ownerId?: string }
): Promise<ProvisionedUserRow | null> {
  const tgId = String(tgUser.id);
  const ownerId = options?.ownerId ?? (await resolveOwnerTelegramId(env));
  const isConfiguredOwner = Boolean(ownerId && tgId === ownerId);

  let row = await env.DB.prepare(
    `SELECT id, email, username, role, is_blocked, telegram_state, telegram_admin_perms, admin_panel_last_active_at,
            wallet_balance_usdt, phone_number, phone_verified, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton,
            ui_mode, extension_api_key
     FROM users WHERE telegram_id = ?`
  ).bind(tgId).first<ProvisionedUserRow>();

  if (!row) {
    if (!isConfiguredOwner && !options?.allowLinkBypass) {
      const toggles = await resolveAuthProviderToggles(env.DB);
      if (!toggles.telegramAuthEnabled) {
        return null;
      }
    }
    const id = randomId('usr');
    const role = isConfiguredOwner ? 'owner' : 'user';
    const username = tgUser.username || tgUser.first_name || `tg_${tgId}`;
    const pseudoEmail = `tg_${tgId}@telegram.dollarino.local`;
    const pwd = await hashPassword(randomId('pwd'));
    const myRefCode = generateReferralCode();

    await env.DB.prepare(
      `INSERT INTO users (id, email, username, display_name, auth_provider, password_hash, role, telegram_id, telegram_username, telegram_first_name, phone_verified, profile_completed, ui_mode, referral_code, has_custom_password)
       VALUES (?, ?, ?, ?, 'telegram', ?, ?, ?, ?, ?, ?, ?, 'simple', ?, 0)`
    )
      .bind(id, pseudoEmail, username, tgUser.first_name || username, pwd, role, tgId, tgUser.username ?? null, tgUser.first_name ?? null, isConfiguredOwner ? 1 : 0, isConfiguredOwner ? 1 : 0, myRefCode)
      .run();

    await ensureUserDefaults(env.DB, id);
    row = {
      id,
      email: pseudoEmail,
      username,
      role,
      is_blocked: 0,
      telegram_state: null,
      telegram_admin_perms: '{}',
      admin_panel_last_active_at: null,
      wallet_balance_usdt: 0,
      phone_number: null,
      phone_verified: isConfiguredOwner ? 1 : 0,
      trust_wallet_address: null,
      trust_wallet_tron: null,
      trust_wallet_solana: null,
      trust_wallet_ton: null,
      ui_mode: 'simple',
      extension_api_key: null,
    };
  } else {
    if (isConfiguredOwner && row.role !== 'owner') {
      await env.DB.prepare(`UPDATE users SET role = 'owner', phone_verified = 1 WHERE id = ?`).bind(row.id).run();
      row.role = 'owner';
      row.phone_verified = 1;
    }
    await env.DB.prepare(
      `UPDATE users SET last_active_at = datetime('now'), telegram_username = COALESCE(?, telegram_username), telegram_first_name = COALESCE(?, telegram_first_name) WHERE id = ?`
    ).bind(tgUser.username ?? null, tgUser.first_name ?? null, row.id).run().catch(() => {});
  }

  // Sync default Telegram profile picture unless user uploaded a custom avatar
  await syncTelegramAvatarForUser(env, row.id, tgId).catch(() => {});

  return row;
}

function buildAdminActor(user: ProvisionedUserRow, tgId: string, ownerId: string): AdminActor {
  const superAdmin = isSuperAdminUser(tgId, user.role, ownerId);
  return {
    id: user.id,
    telegramId: tgId,
    role: user.role,
    username: user.username,
    perms: parseAdminPerms(user.telegram_admin_perms, superAdmin),
    isSuperAdmin: superAdmin,
    lastActiveAt: user.admin_panel_last_active_at,
  };
}

async function applyLinkCodeForUser(
  env: Env,
  currentUserId: string,
  tgUser: { id: number; first_name?: string; username?: string },
  rawCode: string
): Promise<{ ok: boolean; message: string }> {
  const code = rawCode.trim().toUpperCase();
  const webUser = await env.DB.prepare(
    `SELECT id, username, telegram_link_expires_at FROM users WHERE telegram_link_code = ?`
  ).bind(code).first<{ id: string; username: string; telegram_link_expires_at: string | null }>();

  if (!webUser) {
    return { ok: false, message: '❌ کد اتصال نامعتبر است. لطفاً از پنل وب یک کد جدید بسازید.' };
  }
  if (webUser.telegram_link_expires_at && Date.parse(webUser.telegram_link_expires_at) < Date.now()) {
    return { ok: false, message: '⏰ اعتبار این کد اتصال منقضی شده است. لطفاً از پنل وب یک کد جدید بسازید.' };
  }

  if (webUser.id !== currentUserId) {
    const oldRow = await env.DB.prepare(
      `SELECT phone_number, phone_verified, phone_verified_at FROM users WHERE id = ?`
    ).bind(currentUserId).first<{ phone_number: string | null; phone_verified: number; phone_verified_at: string | null }>();
    await env.DB.prepare(`UPDATE users SET telegram_id = NULL WHERE id = ?`).bind(currentUserId).run();
    await env.DB.prepare(
      `UPDATE users
       SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?,
           phone_number = COALESCE(phone_number, ?),
           phone_verified = CASE WHEN phone_verified = 1 OR ? = 1 THEN 1 ELSE 0 END,
           phone_verified_at = COALESCE(phone_verified_at, ?),
           telegram_link_code = NULL, telegram_link_expires_at = NULL
       WHERE id = ?`
    ).bind(
      String(tgUser.id),
      tgUser.username ?? null,
      tgUser.first_name ?? null,
      oldRow?.phone_number ?? null,
      oldRow?.phone_verified ?? 0,
      oldRow?.phone_verified_at ?? null,
      webUser.id
    ).run();
  } else {
    await env.DB.prepare(`UPDATE users SET telegram_link_code = NULL, telegram_link_expires_at = NULL WHERE id = ?`).bind(webUser.id).run();
  }

  return { ok: true, message: `✅ حساب تلگرام شما با موفقیت به اکانت وب «${webUser.username}» متصل شد!` };
}

async function sendWebMagicLoginLink(env: Env, bot: TelegramBotClient, chatId: string | number, userId: string, webAppUrl: string) {
  const magicToken = `tglm_${randomId('m')}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.prepare(
    `UPDATE users SET web_magic_token = ?, web_magic_expires_at = ? WHERE id = ?`
  ).bind(magicToken, expiresAt, userId).run();

  const cleanBase = webAppUrl.replace(/\/$/, '');
  const loginUrl = `${cleanBase}/?tg_login=${encodeURIComponent(magicToken)}`;
  const browserInstallUrl = `${cleanBase}/?tg_login=${encodeURIComponent(magicToken)}&install=1`;
  const kb: InlineKeyboardButton[][] = loginUrl.startsWith('https://')
    ? [
        [{ text: '📱 باز کردن مینی‌اپ تلگرام (ورود خودکار)', web_app: { url: loginUrl }, style: 'success' }],
        [{ text: '🌐 باز کردن در گوگل / مرورگر (و نصب برنامه)', url: browserInstallUrl, style: 'primary' }],
      ]
    : [];

  await bot.sendMessage(
    chatId,
    `🌐 **لینک اختصاصی ورود به سایت و مینی‌اپ دلارینو آماده شد** (معتبر به مدت ۱۰ دقیقه):\n\n` +
      `${loginUrl}\n\n` +
      `📱 **دکمه اول (مینی‌اپ):** همین جا داخل تلگرام با حساب تاییدشده خودتان باز می‌شود.\n` +
      `🌐 **دکمه دوم (گوگل / مرورگر):** سایت در مرورگر باز می‌شود تا هم وارد حساب شوید و هم اپلیکیشن دلارینو را نصب کنید.\n` +
      `✏️ از بخش «مدیریت حساب» می‌توانید نام نمایشی، ایمیل، رمز عبور، بیوگرافی و عکس پروفایل را تغییر دهید.`,
    { inlineKeyboard: kb.length ? kb : undefined }
  );
}

async function showAccountCard(env: Env, bot: TelegramBotClient, chatId: string | number, user: ProvisionedUserRow, tgId: string, webAppUrl: string) {
  const [stats, cfg, ent, iranRate] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END), 0) as wins, COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as pnl
       FROM trades WHERE user_id = ? AND status = 'CLOSED'`
    ).bind(user.id).first<{ total: number; wins: number; pnl: number }>(),
    env.DB.prepare('SELECT trading_mode, trade_execution_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trading_mode: string; trade_execution_mode: string }>(),
    resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: tgId,
    }),
    fetchIranUsdtRate(),
  ]);

  const card = formatAccountCard({
    telegramId: tgId,
    username: user.username,
    email: user.email,
    phoneNumber: user.phone_number,
    phoneVerified: Boolean(user.phone_verified),
    trustWalletAddress: user.trust_wallet_address || user.trust_wallet_tron || user.trust_wallet_solana || user.trust_wallet_ton,
    uiMode: getUserUiMode(user),
    walletUsdt: Number(user.wallet_balance_usdt ?? 0),
    tomanRate: iranRate.usdtIrt,
    planNameFa: ent.planNameFa,
    hasPaidPlan: ent.hasPaidPlan,
    daysRemaining: ent.daysRemaining,
    tradingMode: cfg?.trading_mode ?? 'PAPER',
    execMode: cfg?.trade_execution_mode ?? 'AUTO',
    totalTrades: stats?.total ?? 0,
    wins: stats?.wins ?? 0,
    totalPnl: stats?.pnl ?? 0,
  });

  const kb: InlineKeyboardButton[][] = [
    [
      { text: '💰 کارمزد ۳٪ سود (رایگان)', callback_data: 'sub_menu', style: 'success' },
      { text: '📡 آلرت رایگان TradingView', callback_data: 'tg_tv_alerts', style: 'primary' },
    ],
    [
      { text: '🛡 کیف‌پول Trust Wallet', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🧩 اکستنشن و ویجت موبایل', callback_data: 'tg_ext_widgets' },
    ],
    [
      {
        text: getUserUiMode(user) === 'simple' ? '⚡ ارتقا به حالت حرفه‌ای' : '🌱 رفتن به حالت ساده',
        callback_data: 'tg_toggle_ui_mode',
      },
      { text: '🌐 ورود مستقیم به وب', callback_data: 'tg_web_login' },
    ],
  ];
  if (webAppUrl.startsWith('https://')) {
    kb.push([{ text: '🚀 باز کردن حساب در مینی‌اپ', web_app: { url: `${webAppUrl}/?tab=services` } }]);
  }

  await bot.sendMessage(chatId, card, { inlineKeyboard: kb });
}

async function isPhoneKycRequiredForUser(env: Env, user: ProvisionedUserRow, tgId: string, ownerId: string): Promise<boolean> {
  if (isUserAdmin(tgId, user.role, ownerId)) return false;
  if (Number(user.phone_verified ?? 0) === 1) return false;
  const kycSetting = await getSystemSetting(env.DB, 'require_telegram_phone_kyc', 'false');
  return kycSetting === 'true';
}

function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return raw.trim();
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

async function sendPreAuthIntro(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  firstName: string,
  pendingStartArg?: string
) {
  if (pendingStartArg) {
    await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
      .bind(JSON.stringify({ step: 'PENDING_CONTACT_KYC', pendingStartArg } satisfies TelegramStepState), user.id)
      .run()
      .catch(() => {});
  }
  if (!pendingStartArg || !pendingStartArg.toUpperCase().startsWith('LINK-')) {
    await applyReferralIfPresent(env, user.id, pendingStartArg || null, user.phone_number).catch(() => {});
  }
  await bot.sendMessage(chatId, preAuthIntroMessage(firstName), {
    replyKeyboard: contactVerificationKeyboard(),
  });
}

async function applyReferralIfPresent(env: Env, userId: string, rawPayload?: string | null, phoneNumber?: string | null) {
  const existingRef = await env.DB.prepare(`SELECT id FROM referrals WHERE referred_user_id = ? LIMIT 1`).bind(userId).first();
  if (existingRef) return;

  let extracted = '';
  if (rawPayload) {
    const upper = rawPayload.trim().toUpperCase();
    const refMatch = upper.match(/(?:REF_)?(DLR-?[A-Z0-9_]+)/);
    extracted = refMatch?.[1] || (upper.includes('REF_') ? upper.split('REF_').pop()?.trim() || '' : '');
  }
  if (!extracted) {
    extracted = (await resolveEffectiveReferralCode(env.DB, null, userId)) || '';
  }
  if (!extracted) return;

  const referrer = await env.DB.prepare(
    `SELECT id FROM users
     WHERE UPPER(COALESCE(referral_code, '')) = ?
        OR ('DLR-' || UPPER(SUBSTR(id, -6))) = ?
        OR ('DLR' || UPPER(SUBSTR(REPLACE(id, '_', ''), -5))) = ?
     LIMIT 1`
  )
    .bind(extracted, extracted, extracted)
    .first<{ id: string }>()
    .catch(() => null);
  if (!referrer?.id || referrer.id === userId) return;

  let fraudFlag = 0;
  let fraudReason: string | null = null;
  if (phoneNumber) {
    const dupPhone = await env.DB.prepare(`SELECT id FROM users WHERE phone_number = ? AND id != ? LIMIT 1`)
      .bind(phoneNumber, userId)
      .first();
    if (dupPhone) {
      fraudFlag = 1;
      fraudReason = 'شماره تماس تکراری روی اکانت دیگر';
    }
  }
  await env.DB.prepare(`UPDATE users SET referred_by = COALESCE(referred_by, ?) WHERE id = ?`).bind(extracted, userId).run().catch(() => {});
  await env.DB.prepare(
    `INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, referral_code, reward_days, status, fraud_flag, fraud_reason)
     VALUES (?, ?, ?, ?, 7, ?, ?, ?)`
  )
    .bind(randomId('ref'), referrer.id, userId, extracted, fraudFlag ? 'FLAGGED_DUPLICATE' : 'REGISTERED', fraudFlag, fraudReason)
    .run()
    .catch(() => {});
}

async function showTrustWalletMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number,
  includeLiveBalances = false
) {
  const [bep20Recv, trc20Recv, dexPref, walletEnabled] = await Promise.all([
    getSystemSetting(env.DB, 'trust_wallet_evm_receiver', 'تنظیم‌نشده توسط ادمین'),
    getSystemSetting(env.DB, 'usdt_trc20_wallet', 'تنظیم‌نشده توسط ادمین'),
    getSystemSetting(env.DB, 'trust_wallet_default_dex', 'pancakeswap'),
    getSystemSetting(env.DB, 'trust_wallet_dapp_enabled', 'true'),
  ]);

  let balLines = '';
  if (includeLiveBalances) {
    const parts: string[] = [];
    if (user.trust_wallet_address) {
      const [bnb, usdtBep20, eth] = await Promise.all([
        fetchEvmNativeBalance('https://bsc-dataseed.binance.org', user.trust_wallet_address),
        fetchBscUsdtBalance(user.trust_wallet_address),
        fetchEvmNativeBalance('https://ethereum-rpc.publicnode.com', user.trust_wallet_address),
      ]);
      parts.push(
        `• موجودی BSC: ${bnb !== null ? bnb.toFixed(4) : '—'} BNB | ${usdtBep20 !== null ? usdtBep20.toFixed(2) : '—'} USDT (BEP20)`
      );
      parts.push(`• موجودی ETH: ${eth !== null ? eth.toFixed(4) : '—'} ETH`);
    }
    if (user.trust_wallet_solana) {
      const sol = await fetchSolanaBalance(user.trust_wallet_solana);
      if (sol !== null) parts.push(`• موجودی Solana: ${sol.toFixed(4)} SOL`);
    }
    if (user.trust_wallet_ton) {
      const ton = await fetchTonBalance(user.trust_wallet_ton);
      if (ton !== null) parts.push(`• موجودی TON: ${ton.toFixed(4)} TON`);
    }
    if (user.trust_wallet_tron) {
      const tr = await fetchTronBalances(user.trust_wallet_tron);
      if (tr) parts.push(`• موجودی TRON: ${tr.trx.toFixed(2)} TRX | ${tr.usdt.toFixed(2)} USDT (TRC20)`);
    }
    if (parts.length) {
      balLines = `\n💰 **استعلام لحظه‌ای آن‌چین:**\n${parts.join('\n')}\n`;
    }
  }

  const twDappDeepLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(
    `${webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev'}/?tab=trustwallet`
  )}`;

  const msgText =
    `🦊 **هسته مرکزی چندزنجیره‌ای Trust Wallet و رادار DEX**\n` +
    `وضعیت سرویس DApp: ${walletEnabled === 'true' ? '🟢 فعال' : '🔴 غیرفعال'}\n\n` +
    `🔐 **کیف‌پول‌های متصل شما (پوشش همه شبکه‌ها):**\n` +
    `• شبکه EVM (ETH / BSC / Base / Arbitrum / Polygon / AVAX): \`${user.trust_wallet_address || 'ثبت‌نشده'}\`\n` +
    `• شبکه Solana (SPL): \`${user.trust_wallet_solana || 'ثبت‌نشده'}\`\n` +
    `• شبکه TON (Jetton / تلگرام): \`${user.trust_wallet_ton || 'ثبت‌نشده'}\`\n` +
    `• شبکه TRON (TRC20): \`${user.trust_wallet_tron || 'ثبت‌نشده'}\`\n` +
    balLines +
    `\n📡 **ترید مستقیم روی همه شبکه‌ها (بدون نیاز به صرافی متمرکز):**\n` +
    `با دکمه‌های زیر می‌توانید توکن‌های **DexScreener** را روی هر شبکه از طریق مرورگر DApp در Trust Wallet (${dexPref}) سوآپ کنید و جزئیات مدل رایگان ۳٪ سود را ببینید.\n` +
    `\n🏦 آدرس دریافت کارمزد پلتفرم BEP20: \`${bep20Recv}\`\n` +
    `🏦 آدرس دریافت کارمزد پلتفرم TRC20: \`${trc20Recv}\``;

  const kb: InlineKeyboardButton[][] = [
    [{ text: '🌐 باز کردن دلارینو در مرورگر Trust Wallet', url: twDappDeepLink, style: 'success' }],
    [
      { text: '✏️ آدرس EVM (0x)', callback_data: 'tg_tw_set:evm', style: 'primary' },
      { text: '✏️ آدرس Solana', callback_data: 'tg_tw_set:solana' },
    ],
    [
      { text: '✏️ آدرس TON', callback_data: 'tg_tw_set:ton' },
      { text: '✏️ آدرس TRON (T...)', callback_data: 'tg_tw_set:tron' },
    ],
    [
      { text: '💰 استعلام موجودی همه شبکه‌ها', callback_data: 'tg_tw_bal', style: 'success' },
      { text: '🔍 اسکن توکن داغ DexScreener', callback_data: 'tg_dex_trending', style: 'primary' },
    ],
    [{ text: '💰 مدل ۳٪ سود (بدون اشتراک)', callback_data: 'tg_open_sub' }],
    [{ text: '🔙 بازگشت به منوی سریع', callback_data: 'tg_acc:trust' }],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, msgText, kb).catch(() => bot.sendMessage(chatId, msgText, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, msgText, { inlineKeyboard: kb });
  }
}

function formatUsdCompact(n?: number | null): string {
  const val = Number(n ?? 0);
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

async function showDexTrendingMenu(
  bot: TelegramBotClient,
  chatId: string | number,
  customTokens?: DexTokenEnriched[],
  queryLabel?: string,
  editMsgId?: number,
  page = 0
) {
  let tokens: DexTokenEnriched[] = customTokens || [];
  if (!customTokens) {
    const overview = await fetchDexTrendingOverview().catch(() => ({ pairs: [] as DexTokenEnriched[], metas: [] }));
    tokens = overview.pairs;
  }
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(tokens.length / pageSize));
  const safePage = Math.max(0, Math.min(totalPages - 1, page));
  const top = tokens.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (!top.length) {
    const emptyMsg = queryLabel
      ? `🔍 هیچ جفت‌ارزی برای «${queryLabel}» در DexScreener پیدا نشد.\nنام توکن یا آدرس کانترکت (Contract Address) را دوباره ارسال کنید.`
      : '⚠️ دریافت اطلاعات لحظه‌ای از DexScreener با تاخیر موقت روبرو شد. چند ثانیه دیگر دوباره تلاش کنید.';
    const kb: InlineKeyboardButton[][] = [
      [{ text: '🔎 جستجوی توکن دیگر', callback_data: 'tg_dex_search', style: 'primary' }],
      [{ text: '🔄 تلاش مجدد داغ‌ترین‌ها', callback_data: 'tg_dex_trending' }],
    ];
    if (editMsgId) await bot.editMessageText(chatId, editMsgId, emptyMsg, kb).catch(() => bot.sendMessage(chatId, emptyMsg, { inlineKeyboard: kb }));
    else await bot.sendMessage(chatId, emptyMsg, { inlineKeyboard: kb });
    return;
  }

  const lines = top.map((t, idx) => {
    const num = safePage * pageSize + idx + 1;
    const price = t.priceUsd ? `$${Number(t.priceUsd) < 0.01 ? Number(t.priceUsd).toPrecision(4) : Number(t.priceUsd).toFixed(4)}` : '—';
    const chg24 = Number(t.priceChange?.h24 ?? 0);
    const chgSign = chg24 >= 0 ? '🟢 +' : '🔴 ';
    const safetyBadge = t.safetyScore >= 70 ? '🛡 ایمن' : t.safetyScore >= 45 ? '⚠️ متوسط' : '🚨 پرریسک';
    const dappHint = `${t.dexId.toUpperCase()} (${t.chainId.toUpperCase()})`;
    return (
      `${num}. **${t.baseToken.symbol}** [${dappHint}]\n` +
      `   قیمت: ${price} | ۲۴س: ${chgSign}${chg24.toFixed(1)}%\n` +
      `   نقدینگی: ${formatUsdCompact(t.liquidity?.usd)} | حجم۲۴س: ${formatUsdCompact(t.volume?.h24)} | ${safetyBadge} (${t.safetyScore}/100)`
    );
  });

  const kb: InlineKeyboardButton[][] = [];
  for (const t of top) {
    const cbKey = `${t.chainId}:${t.baseToken.address}`.slice(0, 52);
    kb.push([
      { text: `⚡ خرید مستقیم ${t.baseToken.symbol}`, callback_data: `tg_dex_buy:${cbKey}`, style: 'success' },
      { text: `🧠 نظر AI (${t.baseToken.symbol})`, callback_data: `tg_dex_ai:${cbKey}`, style: 'primary' },
      { text: `🦊 سوآپ`, url: t.trustWallet.trustWalletDappUrl },
    ]);
  }
  if (totalPages > 1 && !customTokens) {
    const navRow: InlineKeyboardButton[] = [];
    if (safePage > 0) navRow.push({ text: '⬅️ صفحه قبل', callback_data: `tg_dex_page:${safePage - 1}` });
    navRow.push({ text: `📄 ${safePage + 1}/${totalPages} (${tokens.length} توکن)`, callback_data: `tg_dex_page:${safePage}` });
    if (safePage < totalPages - 1) navRow.push({ text: 'صفحه بعد ➡️', callback_data: `tg_dex_page:${safePage + 1}` });
    kb.push(navRow);
  }
  kb.push([
    { text: '🔎 جستجوی توکن با اسم/کانترکت', callback_data: 'tg_dex_search', style: 'primary' },
    { text: '🔄 بروزرسانی زنده', callback_data: 'tg_dex_trending' },
  ]);
  kb.push([{ text: '🦊 مدیریت کیف‌پول Trust Wallet', callback_data: 'tg_tw_menu' }]);

  const title = queryLabel
    ? `🔎 **نتایج رادار DexScreener برای «${queryLabel}»**\n`
    : `🔍 **رادار کامل DexScreener (${tokens.length} توکن زنده · صفحه ${safePage + 1}/${totalPages})**\n(تحلیل خرید AI + بررسی DAppهای Trust Wallet + خرید مستقیم با تنظیمات سایت)\n`;

  const fullText = `${title}\n${lines.join('\n\n')}`;
  if (editMsgId) await bot.editMessageText(chatId, editMsgId, fullText, kb).catch(() => bot.sendMessage(chatId, fullText, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, fullText, { inlineKeyboard: kb });
}

async function showSimpleWizardStep(
  bot: TelegramBotClient,
  chatId: string | number,
  stepNum: 1 | 2 | 3 | 4,
  state?: TelegramStepState,
  editMsgId?: number
) {
  let msg = '';
  let kb: InlineKeyboardButton[][] = [];

  if (stepNum === 1) {
    msg =
      `🚀 **راه‌اندازی گام‌به‌گام ربات (مرحله ۱ از ۴ — میزان سرمایه در هر معامله)**\n\n` +
      `در هر سیگنال، ربات چه درصدی از موجودی آزاد شما را وارد معامله کند؟ (توصیه برای شروع امن: ۵٪ یا ۱۰٪)`;
    kb = [
      [
        { text: '🛡 ۵٪ سرمایه (بسیار ایمن)', callback_data: 'tg_wiz_m:5', style: 'success' },
        { text: '⚖️ ۱۰٪ سرمایه (متعادل)', callback_data: 'tg_wiz_m:10', style: 'primary' },
      ],
      [{ text: '🔥 ۲۰٪ سرمایه (تهاجمی)', callback_data: 'tg_wiz_m:20' }],
      [{ text: '🔙 انصراف', callback_data: 'tg_acc:none' }],
    ];
  } else if (stepNum === 2) {
    msg =
      `🚀 **مرحله ۲ از ۴ — سطح ریسک و اهرم (Leverage)**\n` +
      `• مارجین انتخابی شما: ${state?.wizMarginPct ?? 10}%\n\n` +
      `میزان اهرم معاملاتی خود را انتخاب کنید:`;
    kb = [
      [
        { text: '🟢 کم‌ریسک (3x)', callback_data: 'tg_wiz_l:3', style: 'success' },
        { text: '🟡 متعادل (10x)', callback_data: 'tg_wiz_l:10', style: 'primary' },
      ],
      [{ text: '🔴 حرفه‌ای (20x)', callback_data: 'tg_wiz_l:20' }],
      [{ text: '⬅️ بازگشت به مرحله ۱', callback_data: 'tg_simple_wizard:1' }],
    ];
  } else if (stepNum === 3) {
    msg =
      `🚀 **مرحله ۳ از ۴ — انتخاب موتورهای معاملاتی دلارینو (امکان اجرای همزمان ۵ موتور)**\n` +
      `• مارجین: ${state?.wizMarginPct ?? 10}% | اهرم: ${state?.wizLev ?? 10}x\n\n` +
      `موتور پایه را انتخاب کنید (سایر موتورها را می‌توانید همزمان فعال نگه دارید):`;
    kb = [
      [{ text: '🧠 موتور ۱: هوش مصنوعی خودکار دلارینو', callback_data: 'tg_wiz_e:ai_autonomous_agent', style: 'success' }],
      [{ text: '🤖 موتور ۲: هوش مصنوعی شخصی من', callback_data: 'tg_wiz_e:my_custom_ai', style: 'primary' }],
      [{ text: '🎯 موتور ۳: استراتژی شکار دُرنا V1', callback_data: 'tg_wiz_e:dollarino_v01', style: 'primary' }],
      [{ text: '🏆 موتور ۴: کپی‌ترید تاییدشده', callback_data: 'tg_wiz_e:copy_trade', style: 'success' }],
      [{ text: '🔥 موتور ۵: اسنایپر لیستینگ و میم‌کوین', callback_data: 'tg_wiz_e:listing_sniper', style: 'primary' }],
      [{ text: '⬅️ بازگشت به مرحله ۲', callback_data: 'tg_simple_wizard:2' }],
    ];
  } else {
    const engineName = resolveEngineDisplayLabel(state?.wizEngine || 'ai_autonomous_agent');
    msg =
      `🚀 **مرحله ۴ از ۴ — مسیر اجرا و شروع ترید**\n` +
      `• سرمایه در هر معامله: ${state?.wizMarginPct ?? 10}%\n` +
      `• حداکثر اهرم: ${state?.wizLev ?? 10}x\n` +
      `• موتور انتخاب‌شده: ${engineName}\n\n` +
      `حساب معاملاتی مقصد را انتخاب کنید یا همین حالا ربات را روشن کنید:`;
    kb = [
      [{ text: '🟢 تایید و شروع فوری ربات اتومات', callback_data: 'tg_wiz_go:auto', style: 'success' }],
      [
        { text: '🦊 اتصال Trust Wallet و DEX', callback_data: 'tg_tw_menu', style: 'primary' },
        { text: '🧪 اجرای آزمایشی (Paper)', callback_data: 'tg_wiz_go:paper' },
      ],
      [{ text: '⬅️ بازگشت به مرحله ۳', callback_data: 'tg_simple_wizard:3' }],
    ];
  }

  if (editMsgId) await bot.editMessageText(chatId, editMsgId, msg, kb).catch(() => bot.sendMessage(chatId, msg, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, msg, { inlineKeyboard: kb });
}

async function showExtensionWidgetsMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number,
  rotate = false
) {
  let extKey = user.extension_api_key || '';
  if (!extKey || rotate) {
    extKey = `dlr_ext_${randomId('').replace(/_/g, '')}${Math.random().toString(36).slice(2, 10)}`;
    await env.DB.prepare(`UPDATE users SET extension_api_key = ? WHERE id = ?`).bind(extKey, user.id).run();
    user.extension_api_key = extKey;
  }
  const base = webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev';
  const msg =
    `🧩 **اکستنشن مرورگر V11.9.1 و ویجت‌های موبایل دلارینو**\n\n` +
    `✨ نسخه V11.9.1 اکستنشن برای **Chrome**، **Firefox** و **Edge** شامل حالت ساده کامل، ثبت‌نام/ورود، ۵ موتور همزمان و تراز ۵ بخش آماده نصب است!\n\n` +
    `🔑 **کلید اتصال امن اکستنشن شما:**\n` +
    `\`${extKey}\`\n` +
    `(هم از طریق نام کاربری/رمز عبور و هم با کلید بالا می‌توانید مستقیم داخل اکستنشن وارد شوید.)\n\n` +
    `📱 **لینک ویجت‌های سریع موبایل (PWA):**\n` +
    `• کنترل سریع ربات: ${base}/?quick=bot-toggle\n` +
    `• گزارش لحظه‌ای و تراز ۵ بخش: ${base}/?quick=report\n` +
    `• رادار توکن داغ DexScreener: ${base}/?quick=dex\n` +
    `• توقف اضطراری (Kill Switch): ${base}/?quick=kill-switch`;

  const kb: InlineKeyboardButton[][] = [
    [{ text: '🔄 تولید کلید جدید اکستنشن', callback_data: 'tg_ext_rotate', style: 'primary' }],
    ...(webAppUrl.startsWith('https://')
      ? [
          [
            { text: '📦 اکستنشن کروم (Chrome)', url: `${base}/downloads/dollarino-extension.zip`, style: 'primary' as const },
            { text: '🦊 اکستنشن فایرفاکس (Firefox)', url: `${base}/downloads/dollarino-extension-firefox.zip`, style: 'success' as const },
          ],
          [
            { text: '🌐 اکستنشن اج (Edge)', url: `${base}/downloads/dollarino-extension-edge.zip` },
            { text: '📱 ویجت‌های موبایل', web_app: { url: `${base}/?quick=bot-toggle` } },
          ],
        ]
      : []),
    [{ text: getUserUiMode(user) === 'simple' ? '🔙 بازگشت به پنل ساده' : '🔙 بازگشت به منوی سریع', callback_data: getUserUiMode(user) === 'simple' ? 'tg_simple_home' : 'tg_acc:tools' }],
  ];

  if (editMsgId) await bot.editMessageText(chatId, editMsgId, msg, kb).catch(() => bot.sendMessage(chatId, msg, { inlineKeyboard: kb }));
  else await bot.sendMessage(chatId, msg, { inlineKeyboard: kb });
}

async function showSubscriptionMenu(env: Env, bot: TelegramBotClient, chatId: string | number, user: ProvisionedUserRow, _tgId: string, editMsgId?: number) {
  const [feeSummary, iranRate] = await Promise.all([
    getUserServerFeeSummary(env.DB, user.id),
    fetchIranUsdtRate(),
  ]);
  const feeToman = Math.round(feeSummary.accruedFeeUsd * iranRate.usdtIrt).toLocaleString('en-US');

  const text =
    `💰 **مدل شفاف دلارینو: اشتراک ۱۰۰٪ رایگان · ${FREE_PROFITABLE_LIVE_TRADES} معامله اول ۰٪ · سپس ${SERVER_PROFIT_FEE_PCT}% کارمزد سرور**\n\n` +
    `✅ در دلارینو **هیچ هزینه اشتراک ماهانه یا سالانه** وجود ندارد!\n` +
    `• تمام امکانات (هوش مصنوعی، دُرنا V1، کپی‌ترید، اسنایپ لیست/میم و رادار DEX) برای شما رایگان است.\n` +
    `• 🧪 کیف‌پول دمو (قابل تنظیم ۵۰ تا ۱۰M دلار) و ابزارهای تحلیل: **کاملاً رایگان ($۰)!**\n` +
    `• 🎁 **${FREE_PROFITABLE_LIVE_TRADES} معامله سودده اول واقعی (LIVE) کاملاً رایگان است (۰٪ کارمزد)!**\n` +
    `• 💎 از معامله سودده چهارم به بعد، فقط **${SERVER_PROFIT_FEE_PCT}% از سود خالص** برای هزینه سرور محاسبه می‌شود (۹۷٪ سود متعلق به شماست).\n` +
    `• 🛡 دارایی Trust Wallet شما ۱۰۰٪ غیرامانی است و دلارینو هیچ حق برداشتی از ولت شما ندارد.\n\n` +
    `🤝 **تفاوت ما با بقیه پلتفرم‌ها:**\n` +
    `پلتفرم‌های دیگر از همان ابتدا پول اشتراک را می‌گیرند و سود یا ضرر شما برایشان فرقی ندارد؛ اما دلارینو پولی از قبل نمی‌گیرد و تمام تلاشش را می‌کند تا **بیشترین سود** را بگیرید، چون درآمد ۳٪ سرور ما هم فقط زمانی بیشتر می‌شود که شما سود بیشتری ببرید!\n\n` +
    `📊 **دفتر حساب ${SERVER_PROFIT_FEE_PCT}% شما:**\n` +
    `• معاملات رایگان باقی‌مانده: ${feeSummary.freeTradesRemaining} از ${feeSummary.freeTradesLimit}\n` +
    `• معاملات سودده واقعی: ${feeSummary.profitableTradesCount}\n` +
    `• مجموع سود خالص معاملات سودده: +$${feeSummary.totalProfitablePnlUsd.toFixed(2)}\n` +
    `• کارمزد ${SERVER_PROFIT_FEE_PCT}% معوق (هزینه سرور): $${feeSummary.accruedFeeUsd.toFixed(2)} (${feeToman} تومان)\n` +
    `• تسویه‌شده: $${feeSummary.settledFeeUsd.toFixed(2)}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: '🛡 اتصال Trust Wallet', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '📡 آلرت رایگان TradingView', callback_data: 'tg_tv_alerts', style: 'success' },
    ],
    [{ text: '🎁 اعمال کد هدیه', callback_data: 'sub_gift' }],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showFreeTradingViewAlertsMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  userId: string,
  webAppUrl: string,
  editMsgId?: number
) {
  const [alerts, cfg, uRow, ownerId] = await Promise.all([
    env.DB.prepare(`SELECT id, name, symbol, timeframe, trigger_count, is_active FROM tradingview_free_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`).bind(userId).all<{
      id: string; name: string; symbol: string; timeframe: string; trigger_count: number; is_active: number;
    }>().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT webhook_secret FROM bot_configs WHERE user_id = ?`).bind(userId).first<{ webhook_secret: string }>(),
    env.DB.prepare(`SELECT role, telegram_id FROM users WHERE id = ?`).bind(userId).first<{ role: string; telegram_id: string | null }>().catch(() => null),
    resolveOwnerTelegramId(env),
  ]);
  const isAdminUser =
    uRow?.role === 'owner' || uRow?.role === 'admin' || Boolean(ownerId && uRow?.telegram_id === ownerId);
  const hookUrl = cfg?.webhook_secret ? `${webAppUrl}/api/webhook/tv/${cfg.webhook_secret}` : `${webAppUrl}/api/webhook/tv/...`;
  const lines = alerts.results.length
    ? alerts.results.map((a, i) => `${i + 1}. ${a.is_active ? '🟢' : '⏸'} ${a.name} (${a.symbol} · ${a.timeframe}) — اجرا: ${a.trigger_count}`).join('\n')
    : 'هنوز آلرت داخلی نساخته‌اید؛ با دکمه‌های زیر ۱۰۰٪ رایگان بسازید!';

  const webhookBlock = isAdminUser
    ? `🔗 **لینک وب‌هوک مدیریت (ادمین):**\n\`${hookUrl}\`\n\n`
    : `🛡 **وب‌هوک و چنل رسمی سیگنال فقط در اختیار مدیریت دلارینو است** تا سیگنال‌های تاییدشده از کانال و ربات رسمی مستقیماً برای شما ارسال شوند.\n\n`;

  const text =
    `📡 **آلرت و اندیکاتورهای رایگان TradingView (بدون نیاز به اشتراک Pro تریدینگ‌ویو!)**\n\n` +
    `🔥 ۲۵+ اندیکاتور استاندارد (RSI, MACD, SuperTrend, Ichimoku, EMA, Bollinger, Keltner, ADX, VWAP, StochRSI) رایگان و متصل به ربات!\n\n` +
    webhookBlock +
    `📋 **آلرت‌های فعال شما:**\n${lines}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: '➕ آلرت RSI اشباع فروش (BTC)', callback_data: 'tg_tv_add:RSI_OVERSOLD:BTCUSDT', style: 'success' },
      { text: '➕ آلرت SuperTrend صعودی (ETH)', callback_data: 'tg_tv_add:SUPERTREND_FLIP_BULL:ETHUSDT', style: 'primary' },
    ],
    [
      { text: '➕ تقاطع MACD (SOL)', callback_data: 'tg_tv_add:MACD_CROSS_UP:SOLUSDT', style: 'primary' },
      { text: '🌐 استودیو کامل وب', web_app: { url: `${webAppUrl}/?tab=radar` } },
    ],
  ];
  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showEnginesToggleMenu(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  userId: string,
  editMsgId?: number
) {
  const [st, cfg] = await Promise.all([
    getActiveEngineState(env.DB, userId),
    env.DB.prepare('SELECT sniper_enabled, sniper_budget_usd, bot_state FROM bot_configs WHERE user_id = ?')
      .bind(userId)
      .first<{ sniper_enabled?: number; sniper_budget_usd?: number; bot_state?: string }>()
      .catch(() => null),
  ]);
  const active = new Set(st.activeEngines);
  const labelFor = (eng: TradingEngineChoice, title: string) =>
    `${active.has(eng) ? '🟢 [روشن]' : '⚪️ [خاموش]'} ${title}`;
  const isRunning = cfg?.bot_state?.startsWith('RUNNING');
  const text =
    `🎛 **انتخاب همزمان ۵ موتور معاملاتی دلارینو**\n\n` +
    `هر چند موتور که بخواهید را با هم روشن کنید (روشن کردن یکی، بقیه را خاموش نمی‌کند):\n` +
    `• وضعیت ربات: ${isRunning ? '🟢 روشن' : '🔴 متوقف (روشن‌کردن موتورها به معنای استارت خودکار نیست)'}\n` +
    `• بودجه اسنایپر لیست/میم: $${Number(cfg?.sniper_budget_usd ?? 25).toFixed(0)}`;
  const kb: InlineKeyboardButton[][] = [
    [
      { text: labelFor('CENTRAL_AI', 'هوش مصنوعی دلارینو'), callback_data: 'tg_eng_toggle:CENTRAL_AI', style: active.has('CENTRAL_AI') ? 'success' : undefined },
      { text: labelFor('STRATEGY', 'استراتژی دُرنا V1'), callback_data: 'tg_eng_toggle:STRATEGY', style: active.has('STRATEGY') ? 'success' : undefined },
    ],
    [
      { text: labelFor('MY_AI', 'هوش مصنوعی من'), callback_data: 'tg_eng_toggle:MY_AI', style: active.has('MY_AI') ? 'success' : undefined },
      { text: labelFor('COPY_TRADE', 'کپی‌ترید'), callback_data: 'tg_eng_toggle:COPY_TRADE', style: active.has('COPY_TRADE') ? 'success' : undefined },
    ],
    [
      {
        text: labelFor('LISTING_SNIPER', 'اسنایپ ارز جدید و میم‌کوین'),
        callback_data: 'tg_eng_toggle:LISTING_SNIPER',
        style: active.has('LISTING_SNIPER') ? 'success' : undefined,
      },
    ],
    [
      { text: isRunning ? '🔴 توقف ربات' : '🟢 روشن کردن ربات با موتورهای بالا', callback_data: isRunning ? 'toggle_auto_off' : 'toggle_auto_on', style: isRunning ? 'danger' : 'success' },
      { text: '💰 بودجه مجاز و اهرم', callback_data: 'tg_trade_quantities', style: 'primary' },
    ],
    [{ text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' }],
  ];
  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showSimpleSiteHome(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  tgId: string,
  webAppUrl: string,
  editMsgId?: number
) {
  const [cfg, engState, feeSummary, iranRate, entitlement, gate] = await Promise.all([
    env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first<UserBotConfigRow>().catch(() => null),
    getActiveEngineState(env.DB, user.id),
    getUserServerFeeSummary(env.DB, user.id),
    fetchIranUsdtRate(),
    resolveUserEntitlement(env.DB, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: (user.role as AuthUser['role']) || 'user',
      telegramId: tgId,
    }),
    checkPreTradeOnboardingGate(env.DB, user.id),
  ]);

  const tradingMode: 'PAPER' | 'LIVE' = cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
  const execMode: 'AUTO' | 'MANUAL_CONFIRM' = cfg?.trade_execution_mode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO';
  const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';

  let balanceUsd = Number(cfg?.paper_balance ?? 10000);
  if (tradingMode === 'LIVE') {
    const { adapter } = await resolveUserExchangeAdapter(env, user.id, undefined).catch(() => ({ adapter: null }));
    if (adapter) {
      const bal = await adapter.getBalance(cfg?.market_type ?? 'FUTURES').catch(() => null);
      if (bal && Number.isFinite(Number(bal.total))) balanceUsd = Number(bal.total);
    }
  }

  const pb = await computeUnifiedPortfolioAccounting(env, user.id, {
    tradingMode,
    freeBalanceUsd: balanceUsd,
    botBudgetMode: cfg?.bot_budget_mode,
    botBudgetUsd: cfg?.bot_budget_usd,
  }).catch(() => null);
  const modes = pb?.modes || {
    futures: { openCount: 0, lockedMarginUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 },
    spot: { openCount: 0, lockedMarginUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 },
    dex: { openCount: 0, lockedMarginUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 },
    sniper: { openCount: 0, lockedMarginUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 },
    copy: { openCount: 0, lockedMarginUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 },
  };
  const totalOpenCount =
    Number(modes.futures.openCount || 0) +
    Number(modes.spot.openCount || 0) +
    Number(modes.dex.openCount || 0) +
    Number(modes.sniper.openCount || 0) +
    Number(modes.copy.openCount || 0);
  const netPnlUsd = pb ? Number(pb.realizedPnlUsd + pb.unrealizedPnlUsd) : 0;

  const ENGINE_SHORT: Record<string, string> = {
    CENTRAL_AI: 'AI مرکزی',
    STRATEGY: 'دُرنا V1',
    MY_AI: 'هوش من',
    COPY_TRADE: 'کپی‌ترید',
    LISTING_SNIPER: 'اسنایپر',
  };
  const activeLabels = engState.activeEngines.map((e) => ENGINE_SHORT[e] || e);

  const text = formatSimpleSiteDashboard({
    isRunning,
    tradingMode,
    execMode,
    balanceUsd: pb ? pb.totalEquityUsd : balanceUsd,
    tomanRate: iranRate.usdtIrt,
    budgetMode: cfg?.bot_budget_mode === 'FIXED_USD' ? 'FIXED_USD' : 'FULL_BALANCE',
    budgetUsd: Number(cfg?.bot_budget_usd ?? 0),
    maxLeverage: Number(cfg?.max_leverage ?? 10),
    useSignalLeverage: Boolean(cfg?.use_signal_leverage ?? 1),
    activeEngineLabels: activeLabels,
    freeTradesRemaining: feeSummary.freeTradesRemaining,
    freeTradesLimit: feeSummary.freeTradesLimit,
    isFeeExempt: Boolean(feeSummary.feeExempt),
    onboardingDone: gate.ok,
    modes: {
      futures: { openCount: modes.futures.openCount, lockedMarginUsd: modes.futures.lockedMarginUsd, netUsd: modes.futures.realizedPnlUsd + modes.futures.unrealizedPnlUsd },
      spot: { openCount: modes.spot.openCount, lockedMarginUsd: modes.spot.lockedMarginUsd, netUsd: modes.spot.realizedPnlUsd + modes.spot.unrealizedPnlUsd },
      dex: { openCount: modes.dex.openCount, lockedMarginUsd: modes.dex.lockedMarginUsd, netUsd: modes.dex.realizedPnlUsd + modes.dex.unrealizedPnlUsd },
      sniper: { openCount: modes.sniper.openCount, lockedMarginUsd: modes.sniper.lockedMarginUsd, netUsd: modes.sniper.realizedPnlUsd + modes.sniper.unrealizedPnlUsd },
      copy: { openCount: modes.copy.openCount, lockedMarginUsd: modes.copy.lockedMarginUsd, netUsd: modes.copy.realizedPnlUsd + modes.copy.unrealizedPnlUsd },
    },
    totalOpenCount,
    netPnlUsd,
  });

  const kb = simpleSiteHomeInlineKeyboard({
    webAppUrl,
    isBotRunning: isRunning,
    activeEnginesCount: engState.activeEngines.length,
    totalOpenCount,
    onboardingDone: gate.ok,
  });

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showSimpleWalletAndBudgetSheet(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  editMsgId?: number
) {
  const [cfg, iranRate] = await Promise.all([
    env.DB.prepare('SELECT trading_mode, trade_execution_mode, paper_balance, bot_budget_mode, bot_budget_usd, max_leverage, use_signal_leverage FROM bot_configs WHERE user_id = ?')
      .bind(user.id)
      .first<{
        trading_mode?: string;
        trade_execution_mode?: string;
        paper_balance?: string;
        bot_budget_mode?: string;
        bot_budget_usd?: number;
        max_leverage?: number;
        use_signal_leverage?: number;
      }>()
      .catch(() => null),
    fetchIranUsdtRate(),
  ]);
  const isLive = cfg?.trading_mode === 'LIVE';
  const isManual = cfg?.trade_execution_mode === 'MANUAL_CONFIRM';
  const demoBal = Number(cfg?.paper_balance ?? 10000);
  const budgetTxt = cfg?.bot_budget_mode === 'FIXED_USD' && Number(cfg?.bot_budget_usd || 0) > 0
    ? `$${Number(cfg.bot_budget_usd).toLocaleString('en-US')}`
    : 'کل موجودی';
  const levTxt = cfg?.use_signal_leverage ? 'پیشنهادی مدیریت سرمایه' : `${Number(cfg?.max_leverage || 10)}× دستی`;

  const text =
    `💼 **مدیریت حساب دمو / واقعی و بودجه (حالت ساده)**\n` +
    `━━━━━━━━━━━━━━\n` +
    `• حساب فعال فعلی: ${isLive ? '🛡 **واقعی (Trust Wallet)**' : `🧪 **دمو آزمایشی ($${demoBal.toLocaleString('en-US')} ≈ ${formatToman(demoBal, iranRate.usdtIrt)} ت)**`}\n` +
    `• روش اجرا: ${isManual ? '✋ قبل از باز شدن بپرسه (تایید دستی)' : '⚡ خودکار ۲۴ ساعته'}\n` +
    `• بودجه مجاز ربات: **${budgetTxt}** | اهرم: **${levTxt}**\n` +
    `• کیف‌پول Trust Wallet: \`${user.trust_wallet_address || 'هنوز متصل نشده'}\`\n\n` +
    `از دکمه‌های شیشه‌ای زیر هر تغییر را با ۱ لمس اعمال کنید:`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: `${!isLive ? '✅ ' : ''}🧪 حساب دمو`, callback_data: 'tg_simple_set_mode:PAPER', style: !isLive ? 'success' : undefined },
      { text: `${isLive ? '✅ ' : ''}🛡 واقعی Trust Wallet`, callback_data: 'tg_simple_set_mode:LIVE', style: isLive ? 'success' : 'primary' },
    ],
    [
      { text: `${!isManual ? '✅ ' : ''}⚡ خودکار ۲۴/۷`, callback_data: 'tg_simple_exec:AUTO', style: !isManual ? 'primary' : undefined },
      { text: `${isManual ? '✅ ' : ''}✋ قبلش بپرسه`, callback_data: 'tg_simple_exec:MANUAL_CONFIRM', style: isManual ? 'primary' : undefined },
    ],
    [
      { text: '💵 تنظیم موجودی دمو ($50–$10M)', callback_data: 'tg_simple_demo_bal' },
      { text: '🎚 بودجه و اهرم ربات', callback_data: 'tg_trade_quantities', style: 'primary' },
    ],
    [
      { text: '🛡 اتصال/ویرایش Trust Wallet', callback_data: 'tg_tw_menu' },
      { text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' },
    ],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showSimplePositionsAndAccounting(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number
) {
  const cfg = await env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<{ trading_mode?: string; paper_balance?: string }>()
    .catch(() => null);
  const mode: 'PAPER' | 'LIVE' = cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
  const [pb, openCex, openDex, openCopy] = await Promise.all([
    computeUnifiedPortfolioAccounting(env, user.id, {
      tradingMode: mode,
      freeBalanceUsd: Number(cfg?.paper_balance ?? 10000),
    }).catch(() => null),
    env.DB.prepare(
      `SELECT id, symbol, direction, market_type, entry_price, leverage, margin_used FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 6`
    ).bind(user.id).all<{ id: string; symbol: string; direction: string; market_type?: string; entry_price: string; leverage: number; margin_used: string }>().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT id, token_symbol, chain_id, amount_usd FROM dex_trades WHERE user_id = ? AND status = 'OPEN' ORDER BY created_at DESC LIMIT 4`
    ).bind(user.id).all<{ id: string; token_symbol: string; chain_id: string; amount_usd: number }>().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT id, token_symbol, trader_label, execution_mode, entry_amount_usd FROM copy_positions_v2 WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 4`
    ).bind(user.id).all<{ id: string; token_symbol: string; trader_label: string; execution_mode: string; entry_amount_usd: number }>().catch(() => ({ results: [] })),
  ]);

  const modes = pb?.modes;
  const totalNetUsd = pb ? pb.realizedPnlUsd + pb.unrealizedPnlUsd : 0;
  const acctLines = modes && pb
    ? `📊 **تراز یکپارچه ۵ موتور (${pb.reconciliationOk ? 'تطبیق دقیق ✓' : 'در حال محاسبه'}):**\n` +
      `• آزاد: \`$${pb.freeBalanceUsd.toFixed(2)}\` | درگیر: \`$${pb.lockedMarginUsd.toFixed(2)}\` | خالص: \`${totalNetUsd >= 0 ? '+' : '-'}$${Math.abs(totalNetUsd).toFixed(2)}\`\n` +
      `1️⃣ فیوچرز: ${modes.futures.openCount} باز / ${modes.futures.closedCount} بسته (WR ${modes.futures.winRatePct.toFixed(0)}%)\n` +
      `2️⃣ اسپات: ${modes.spot.openCount} باز / ${modes.spot.closedCount} بسته\n` +
      `3️⃣ DEX: ${modes.dex.openCount} باز / ${modes.dex.closedCount} بسته\n` +
      `4️⃣ اسنایپر: ${modes.sniper.openCount} باز / ${modes.sniper.closedCount} بسته\n` +
      `5️⃣ کپی‌ترید: ${modes.copy.openCount} باز / ${modes.copy.closedCount} بسته\n`
    : '';

  const openLines: string[] = [];
  for (const t of openCex.results) {
    openLines.push(`• [CEX] **${t.symbol}** (${t.direction} ${t.leverage}x) — مارجین $${Number(t.margin_used || 0).toFixed(1)}`);
  }
  for (const t of openDex.results) {
    openLines.push(`• [DEX] **${t.token_symbol}** (${t.chain_id}) — $${Number(t.amount_usd || 0).toFixed(1)}`);
  }
  for (const t of openCopy.results) {
    openLines.push(`• [COPY] **${t.token_symbol}** (${t.trader_label}${t.execution_mode === 'PAPER_SIMULATOR' ? ' · دمو' : ''}) — $${Number(t.entry_amount_usd || 0).toFixed(1)}`);
  }

  const text =
    `${acctLines}\n` +
    (openLines.length
      ? `📈 **معاملات باز فعلی (${openLines.length}):**\n${openLines.join('\n')}`
      : `📭 در حال حاضر معامله بازی در حساب ${mode === 'LIVE' ? 'واقعی' : 'دمو'} ندارید.`);

  const kb: InlineKeyboardButton[][] = openCex.results.slice(0, 4).map((t) => [
    { text: `❌ بستن ${t.symbol} (${t.direction})`, callback_data: `close_pos:${t.id}`, style: 'danger' as const },
  ]);
  if (openCex.results.length > 0) {
    kb.push([{ text: '🛑 بستن همه معاملات باز (CEX)', callback_data: 'tg_close_all_confirm', style: 'danger' }]);
  }
  kb.push([
    { text: '📊 صدور کارت سود', callback_data: 'tg_profit_card', style: 'primary' },
    { text: '🔄 تازه‌سازی', callback_data: 'tg_simple_positions' },
  ]);
  if (webAppUrl.startsWith('https://')) {
    kb.push([
      { text: '🚀 مشاهده کامل در مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=portfolio` }, style: 'success' },
      { text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' },
    ]);
  } else {
    kb.push([{ text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' }]);
  }

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showSimpleMoreToolsSheet(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  webAppUrl: string,
  editMsgId?: number
) {
  const uiMode = getUserUiMode(user);
  const text =
    `🛠 **ابزارها و امکانات دلارینو V11.9.1**\n\n` +
    `تمام بخش‌های زیر با حساب وب و اکستنشن شما همگام هستند؛ ابزار دلخواه را انتخاب کنید:`;
  const kb: InlineKeyboardButton[][] = [
    [
      { text: '🧠 چت AI و تحلیل عکس چارت', callback_data: 'tg_ai_chat', style: 'primary' },
      { text: '🤖 هوش مصنوعی شخصی من', callback_data: 'tg_myai', style: 'success' },
    ],
    [
      { text: '🏆 کپی‌ترید و سبد نهنگ‌ها (V2)', callback_data: 'tg_copy_smart_v2', style: 'primary' },
      { text: '🔍 رادار DEX & خرید مستقیم', callback_data: 'tg_dex_trending', style: 'success' },
    ],
    [
      { text: '🛡 راهنمای ۵ بخش Trust Wallet', callback_data: 'tg_tw_playbook' },
      { text: '💰 کارمزد ۳٪ و رایگان‌ها', callback_data: 'tg_open_sub' },
    ],
    [
      { text: '🧩 اکستنشن کروم / فایرفاکس / اج', callback_data: 'tg_ext_widgets' },
      { text: '📡 آلرت رایگان TradingView', callback_data: 'tg_tv_alerts' },
    ],
    [
      { text: '💬 پشتیبانی آنلاین (AI + مدیر)', callback_data: 'tg_support_open' },
      { text: uiMode === 'simple' ? '⚡ رفتن به حالت حرفه‌ای' : '🌱 رفتن به حالت ساده', callback_data: 'tg_toggle_ui_mode' },
    ],
    [
      { text: '🌐 ورود یک‌کلیکی به سایت', callback_data: 'tg_web_login', style: 'primary' },
      { text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' },
    ],
  ];
  void env;
  void webAppUrl;

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showTrustWalletPlaybookTelegram(
  env: Env,
  bot: TelegramBotClient,
  chatId: string | number,
  user: ProvisionedUserRow,
  focusMode: 'FUTURES' | 'SPOT' | 'DEX' | 'SNIPER' | 'COPY_TRADE' = 'FUTURES',
  editMsgId?: number
) {
  const cfg = await env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id)
    .first<{ trading_mode?: string; paper_balance?: string }>()
    .catch(() => null);
  const trustConnected = Boolean(user.trust_wallet_address || user.trust_wallet_solana || user.trust_wallet_tron || user.trust_wallet_ton);
  const isLive = cfg?.trading_mode === 'LIVE';

  const PLAYBOOK_COPY: Record<'FUTURES' | 'SPOT' | 'DEX' | 'SNIPER' | 'COPY_TRADE', { title: string; steps: string[] }> = {
    FUTURES: {
      title: '📈 فیوچرز غیرمتمرکز (Perp DEX)',
      steps: [
        '• در حالت دمو: با اعتبار مجازی و قیمت لحظه‌ای بدون نیاز به ولت واقعی اجرا می‌شود.',
        '• در حالت واقعی: کافی است آدرس EVM خود را متصل و Agent کیف‌پول را روی Hyperliquid/Aster تایید کنید.',
      ],
    },
    SPOT: {
      title: '🪙 اسپات چندزنجیره (Multi-Chain Spot)',
      steps: [
        '• پوشش ۸۲۰+ ارز هم‌تراز با Trust Wallet روی شبکه‌های BSC، Ethereum، Solana، Base، TON و TRON.',
        '• تسویه مستقیم روی ولت شخصی یا شبیه‌ساز ۱× اسپات در حالت دمو.',
      ],
    },
    DEX: {
      title: '⚡ سوآپ مستقیم DEX (بدون صرافی متمرکز)',
      steps: [
        '• اسکن لحظه‌ای توکن‌های داغ DexScreener و تحلیل AI قبل از خرید.',
        '• تایید تراکنش مستقیم در DApp مرورگر Trust Wallet یا اجرای آنی در دمو.',
      ],
    },
    SNIPER: {
      title: '🎯 اسنایپر لیستینگ و میم‌کوین (70/$15k/5)',
      steps: [
        '• پیش‌فرض ایمن: امتیاز امنیت ≥۷۰، نقدینگی ≥$۱۵k و حداکثر ۵ پوزیشن همزمان.',
        '• شکار زیر ۵ دقیقه استخرهای تازه با TP/SL و حدضرر محافظتی.',
      ],
    },
    COPY_TRADE: {
      title: '🏆 کپی‌ترید تریدرها و نهنگ‌ها (PAPER_SIMULATOR + Vault)',
      steps: [
        '• در حالت دمو یا PAPER_SIMULATOR کاملاً رایگان و متصل به تراز حساب دمو عمل می‌کند.',
        '• در حالت واقعی با تایید ۱-کلیکی یا Copy Vault اختصاصی اجرا می‌شود.',
      ],
    },
  };

  const entry = PLAYBOOK_COPY[focusMode] || PLAYBOOK_COPY.FUTURES;
  const text =
    `🛡 **راهنمای جامع ترید با Trust Wallet و دمو (۵ بخش)**\n` +
    `━━━━━━━━━━━━━━\n` +
    `• وضعیت فعلی: ${isLive ? '🛡 واقعی' : `🧪 دمو ($${Number(cfg?.paper_balance ?? 10000).toLocaleString('en-US')})`} | اتصال Trust Wallet: ${trustConnected ? '🟢 متصل' : '⚪️ ثبت‌نشده'}\n\n` +
    `**${entry.title}**\n` +
    `${entry.steps.join('\n')}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: '📈 فیوچرز', callback_data: 'tg_tw_playbook:FUTURES', style: focusMode === 'FUTURES' ? 'success' : undefined },
      { text: '🪙 اسپات', callback_data: 'tg_tw_playbook:SPOT', style: focusMode === 'SPOT' ? 'success' : undefined },
      { text: '⚡ DEX', callback_data: 'tg_tw_playbook:DEX', style: focusMode === 'DEX' ? 'success' : undefined },
    ],
    [
      { text: '🎯 اسنایپر', callback_data: 'tg_tw_playbook:SNIPER', style: focusMode === 'SNIPER' ? 'success' : undefined },
      { text: '🏆 کپی‌ترید', callback_data: 'tg_tw_playbook:COPY_TRADE', style: focusMode === 'COPY_TRADE' ? 'success' : undefined },
    ],
    [
      { text: '✏️ اتصال / ویرایش آدرس ولت', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🔙 بازگشت به پنل ساده', callback_data: 'tg_simple_home' },
    ],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

async function showTradeQuantitiesMenu(env: Env, bot: TelegramBotClient, chatId: string | number, userId: string, editMsgId?: number) {
  const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(userId).first<UserBotConfigRow>();
  const cap = await resolveUserCapitalSummary(env.DB, userId, cfg ?? null).catch(() => null);
  const budgetLabel =
    cfg?.bot_budget_mode === 'FIXED_USD' && (cfg?.bot_budget_usd ?? 0) > 0
      ? `سقف ثابت $${Number(cfg.bot_budget_usd).toLocaleString()} (مؤثر: $${cap?.effectiveCapitalUsd ?? cfg.bot_budget_usd})`
      : cfg?.bot_budget_mode === 'PERCENT_OF_BALANCE'
        ? `${cfg?.bot_budget_pct ?? 100}% از کیف‌پول ($${cap?.effectiveCapitalUsd ?? 0})`
        : `کل موجودی کیف‌پول ($${cap?.effectiveCapitalUsd ?? 0})`;
  const rec = computeDynamicRecommendedSettings(cap?.effectiveCapitalUsd ?? 100, 'balanced');
  const text =
    `🪛 تنظیم بودجه ربات، مارجین و اهرم (پیشنهادی یا دستی)\n\n` +
    `• 💼 بودجه مجاز ربات: ${budgetLabel}\n` +
    `• 📊 مارجین درگیر فعلی: $${cap?.usedMarginUsd ?? 0} | باقی‌مانده: $${cap?.remainingBudgetUsd ?? 0}\n` +
    `• 💰 درصد مارجین هر معامله (از بودجه ربات): ${cfg?.margin_pct ?? 10}%\n` +
    `• 🔘 حداکثر اهرم دستی: ${cfg?.max_leverage ?? 20}x (${cfg?.use_signal_leverage ? 'پیشنهادی AI/سیگنال با این سقف' : 'اهرم ثابت دستی'})\n` +
    `• 💡 اهرم پیشنهادی متناسب با بودجه فعلی: ${rec.maxLeverage}x (مارجین ${rec.marginPct}%)\n` +
    `• 🎯 تقسیم تارگت‌ها: TP1=${cfg?.tp1_close_pct ?? 50}% | TP2=${cfg?.tp2_close_pct ?? 25}% | TP3=${cfg?.tp3_close_pct ?? 25}%\n` +
    `• 🛡 ریسک‌فری خودکار TP1 (SL→Entry): ${cfg?.auto_breakeven_on_tp1 ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `• 🛡 انتقال SL به TP1 روی TP2: ${cfg?.move_sl_to_tp1_on_tp2 ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `• 📡 کانال سیگنال متصل: ${cfg?.signal_channel_handle || 'تنظیم‌نشده'}`;

  const kb: InlineKeyboardButton[][] = [
    [
      { text: `💼 سقف سرمایه ربات`, callback_data: 'cfg_edit:bot_budget_usd', style: 'primary' },
      { text: `⚡ پیش‌فرض مدیریت سرمایه`, callback_data: 'cfg_apply_dynamic', style: 'success' },
    ],
    [
      { text: `💰 تغییر مارجین (${cfg?.margin_pct ?? 10}%)`, callback_data: 'cfg_edit:margin_pct' },
      { text: `🔘 اهرم دستی (${cfg?.max_leverage ?? 20}x)`, callback_data: 'cfg_edit:max_leverage' },
    ],
    [
      { text: `🧠 حالت اهرم: ${cfg?.use_signal_leverage ? 'پیشنهادی AI/سیگنال' : 'فقط دستی'}`, callback_data: 'cfg_toggle:use_sig_lev' },
      { text: `🎯 تنظیم درصد TP`, callback_data: 'cfg_tp_menu' },
    ],
    [
      { text: `🛡 ریسک‌فری TP1 (${cfg?.auto_breakeven_on_tp1 ? '✅' : '❌'})`, callback_data: 'cfg_toggle:be_tp1' },
      { text: `🛡 SL→TP1 در TP2 (${cfg?.move_sl_to_tp1_on_tp2 ? '✅' : '❌'})`, callback_data: 'cfg_toggle:sl_tp2' },
    ],
  ];

  if (editMsgId) {
    await bot.editMessageText(chatId, editMsgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
  } else {
    await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
  }
}

function parseTgNotifPrefs(raw: string | null | undefined): Record<string, boolean> {
  const def = { signals: true, open_close: true, tp_sl: true, dex_sniper: true, cards_reports: true };
  if (!raw) return def;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      signals: typeof p.signals === 'boolean' ? p.signals : true,
      open_close: typeof p.open_close === 'boolean' ? p.open_close : true,
      tp_sl: typeof p.tp_sl === 'boolean' ? p.tp_sl : true,
      dex_sniper: typeof p.dex_sniper === 'boolean' ? p.dex_sniper : true,
      cards_reports: typeof p.cards_reports === 'boolean' ? p.cards_reports : true,
    };
  } catch {
    return def;
  }
}

function buildNotifSettingsKeyboard(
  enabled: number,
  prefs: Record<string, boolean>,
  currency: string
): InlineKeyboardButton[][] {
  const isOn = Number(enabled || 0) === 1;
  const curr = currency === 'IRT' ? 'IRT' : 'USD';
  return [
    [
      {
        text: isOn ? '🔔 اعلان سراسری: روشن (برای خاموشی لمس کنید)' : '🔕 اعلان سراسری: خاموش (برای روشنی لمس کنید)',
        callback_data: 'tg_notif_master',
        style: isOn ? 'success' : 'danger',
      },
    ],
    [
      { text: `${prefs.signals ? '✅' : '⬜️'} سیگنال‌های جدید`, callback_data: 'tg_notif_pref:signals' },
      { text: `${prefs.open_close ? '✅' : '⬜️'} باز/بسته شدن معامله`, callback_data: 'tg_notif_pref:open_close' },
    ],
    [
      { text: `${prefs.tp_sl ? '✅' : '⬜️'} تاچ TP/SL و کارت سود`, callback_data: 'tg_notif_pref:tp_sl' },
      { text: `${prefs.dex_sniper ? '✅' : '⬜️'} اسنایپر و DEX`, callback_data: 'tg_notif_pref:dex_sniper' },
    ],
    [
      { text: `${prefs.cards_reports ? '✅' : '⬜️'} گزارش و کارت‌های سود`, callback_data: 'tg_notif_pref:cards_reports' },
      { text: curr === 'IRT' ? '🇮🇷 واحد نمایش: تومان' : '💵 واحد نمایش: دلار (USD)', callback_data: 'tg_disp_curr:toggle', style: 'primary' },
    ],
  ];
}

function buildTelegramProfitCardKeyboard(): InlineKeyboardButton[][] {
  return [
    [
      { text: '⏱ ۲۴ ساعته (24H)', callback_data: 'tg_profit_issue:24H:horizontal', style: 'primary' },
      { text: '📅 هفتگی (7D)', callback_data: 'tg_profit_issue:7D:horizontal', style: 'success' },
    ],
    [
      { text: '🗓 ماهانه (30D)', callback_data: 'tg_profit_issue:30D:horizontal', style: 'primary' },
      { text: '📊 ۳ ماهه (3M)', callback_data: 'tg_profit_issue:3M:horizontal', style: 'primary' },
    ],
    [
      { text: '📈 ۶ ماهه (6M)', callback_data: 'tg_profit_issue:6M:horizontal' },
      { text: '📆 سالانه (1Y)', callback_data: 'tg_profit_issue:1Y:horizontal', style: 'primary' },
    ],
    [
      { text: '🏆 کل دوره (ALL)', callback_data: 'tg_profit_issue:ALL:horizontal', style: 'success' },
      { text: '🎯 کارت تک‌معامله', callback_data: 'tg_profit_single_list', style: 'primary' },
    ],
    [
      { text: '📱 استوری ۹:۱۶ هفتگی', callback_data: 'tg_profit_issue:7D:vertical', style: 'success' },
      { text: '📱 استوری ۹:۱۶ ۳ماهه', callback_data: 'tg_profit_issue:3M:vertical', style: 'primary' },
    ],
  ];
}

async function issueAndPublishTelegramProfitCard(
  env: Env,
  chatId: string | number,
  user: { id: string; username: string },
  periodRaw: string,
  layout: 'horizontal' | 'vertical',
  tradeId?: string
): Promise<{ ok: boolean; error?: string }> {
  const period = normalizeCardPeriod(periodRaw);
  const cfgRow = await env.DB.prepare('SELECT trading_mode, paper_balance FROM bot_configs WHERE user_id = ?')
    .bind(user.id).first<{ trading_mode: 'LIVE' | 'PAPER'; paper_balance: string }>();
  const mode = cfgRow?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';

  const trades = await listUnifiedClosedTrades(env.DB, user.id, {
    mode,
    tradeSource: 'ALL',
    period,
    tradeId,
    limit: 200,
  });

  if (!trades.length) {
    return { ok: false, error: `معامله بسته‌شده‌ای در بازه ${period} یافت نشد.` };
  }

  let netPnl = 0;
  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalMargin = 0;
  let bestTrade = trades[0]!;
  for (const r of trades) {
    const pnl = Number(r.realizedPnlUsd || 0);
    netPnl += pnl;
    totalMargin += Math.max(0, Number(r.marginUsd || 0));
    if (pnl > 0) {
      wins++;
      grossWin += pnl;
    } else if (pnl < 0) {
      grossLoss += Math.abs(pnl);
    }
    if (r.roiPct > bestTrade.roiPct) bestTrade = r;
  }

  const winRate = Number(((wins / trades.length) * 100).toFixed(2));
  const pf = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0;
  const baseCap =
    period !== 'TRADE' && mode === 'PAPER'
      ? Math.max(totalMargin, Math.max(100, Number(cfgRow?.paper_balance || 10000) - netPnl))
      : Math.max(10, totalMargin);
  const single = period === 'TRADE' ? trades[0]! : null;
  const roiPct =
    single && single.roiPct !== 0
      ? Number(single.roiPct.toFixed(2))
      : Number(((netPnl / baseCap) * 100).toFixed(2));

  const cardId = `DLR-${randomId('').slice(0, 10).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const topStrategy = single ? single.engineLabel : bestTrade.engineLabel;
  const topSignal = single ? single.signalName : bestTrade.signalName;
  const topProv = single ? single.exchangeProvider : bestTrade.exchangeProvider;
  const baseSymbol = single ? single.baseSymbol : bestTrade.baseSymbol;
  const tokenAddress = single?.tokenAddress || bestTrade.tokenAddress;
  const chainId = single?.chainId || bestTrade.chainId;
  const tokenImageUrl =
    single?.tokenImageUrl ||
    bestTrade.tokenImageUrl ||
    buildTokenDisplayIconUrl(baseSymbol, chainId, tokenAddress);

  const startDate = trades[0]!.closedAt;
  const endDate = trades[trades.length - 1]!.closedAt;
  const tradesHash = await sha256Hex(trades.map((t) => `${t.tradeSource}:${t.id}:${t.realizedPnlUsd}:${t.closedAt}`).join(';'));
  const canonical = buildVerifiedCardCanonicalPayload({
    id: cardId,
    userId: user.id,
    mode,
    period,
    startDate,
    endDate,
    tradesCount: trades.length,
    winRate,
    netPnlUsd: Number(netPnl.toFixed(2)),
    roiPct,
    profitFactor: pf,
    exchangeProvider: topProv,
    strategyName: topStrategy,
    tradesHash,
    issuedAt,
  });
  const sig = await hmacSha256Hex(canonical, env.SESSION_JWT_SECRET || env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret');
  const resolvedSource = single ? single.tradeSource : 'ALL';

  await env.DB.prepare(
    `INSERT INTO verified_profit_cards (
      id, user_id, mode, period, start_date, end_date,
      trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor,
      exchange_provider, strategy_name, payload_json, hmac_signature, issued_at,
      trade_source, entry_price, exit_price, signal_name, token_address, chain_id, token_image_url, revoked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(
    cardId,
    user.id,
    mode,
    period,
    startDate,
    endDate,
    trades.length,
    winRate,
    Number(netPnl.toFixed(2)),
    roiPct,
    pf,
    topProv,
    topStrategy,
    JSON.stringify({
      isVerifiedReal: mode === 'LIVE',
      tradeSource: resolvedSource,
      symbol: single?.symbol,
      baseSymbol,
      direction: single?.direction,
      leverage: single?.leverage,
      entryPrice: single?.entryPrice,
      exitPrice: single?.exitPrice,
      signalName: topSignal,
      engineKey: single?.engineKey || bestTrade.engineKey,
      tokenAddress,
      chainId,
      tokenImageUrl,
      bestSymbol: bestTrade.baseSymbol,
      bestRoiPct: bestTrade.roiPct,
      tradesHash,
    }),
    sig,
    issuedAt,
    resolvedSource,
    single ? single.entryPrice : null,
    single ? single.exitPrice : null,
    topSignal,
    tokenAddress || null,
    chainId || null,
    tokenImageUrl
  ).run();

  const tokenLogoDataUri = await resolveTokenLogoPngDataUri({
    baseSymbol,
    chainId,
    tokenAddress,
    tokenImageUrl,
  }).catch(() => null);

  await publishProfitCardToTelegram(
    env,
    chatId,
    {
      id: cardId,
      displayName: user.username,
      mode,
      period,
      tradeSource: resolvedSource,
      tradesCount: trades.length,
      winRate,
      netPnlUsd: Number(netPnl.toFixed(2)),
      roiPct,
      profitFactor: pf,
      exchangeProvider: topProv,
      strategyName: topStrategy,
      engineKey: single?.engineKey || bestTrade.engineKey,
      symbol: single?.symbol,
      baseSymbol,
      direction: single?.direction,
      leverage: single?.leverage,
      entryPrice: single?.entryPrice,
      exitPrice: single?.exitPrice,
      signalName: topSignal,
      bestSymbol: bestTrade.baseSymbol,
      bestRoiPct: bestTrade.roiPct,
      tokenLogoDataUri,
      issuedAt,
    },
    layout
  );

  return { ok: true };
}

export async function handleTelegramUpdate(env: Env, botToken: string, update: TelegramUpdate) {
  const bot = new TelegramBotClient(botToken);
  const webAppUrl = (env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');

  // 0. Auto-detect when the bot is promoted to Admin in any Channel or Community Group
  if (update.my_chat_member) {
    const mcm = update.my_chat_member;
    const status = mcm.new_chat_member?.status;
    if (mcm.chat.type === 'channel' && (status === 'administrator' || status === 'creator')) {
      const chId = String(mcm.chat.id);
      const chTitle = mcm.chat.title || mcm.chat.username || chId;
      await notifyAllAdmins(
        env,
        `📡 ربات در کانال **«${chTitle}»** ادمین شد!\n` +
          `🆔 شناسه عددی کانال: \`${chId}\`\n\n` +
          `این کانال متعلق به کدام بخش از اکوسیستم رسمی DOLLARINO است؟`,
        {
          inlineKeyboard: [
            [{ text: '🌟 چنل رسمی و اصلی دلارینو (عمومی)', callback_data: `adm_bind_ch:official:${chId}`, style: 'primary' }],
            [
              { text: '01. سیگنال دلارینو', callback_data: `adm_bind_ch:signals:${chId}`, style: 'success' },
              { text: '02. نتایج سیگنال دلارینو', callback_data: `adm_bind_ch:results:${chId}`, style: 'success' },
            ],
            [
              { text: '07. اخبار دلارینو (عمومی)', callback_data: `adm_bind_ch:news:${chId}` },
              { text: '04. لاگ‌های دلارینو (خصوصی)', callback_data: `adm_bind_ch:logs:${chId}` },
            ],
            [
              { text: '05. دیتابیس دلارینو (خصوصی)', callback_data: `adm_bind_ch:database:${chId}` },
              { text: '06. تراکنش‌های دلارینو (خصوصی)', callback_data: `adm_bind_ch:transactions:${chId}` },
            ],
          ],
        }
      ).catch(() => {});
    } else if ((mcm.chat.type === 'group' || mcm.chat.type === 'supergroup') && (status === 'administrator' || status === 'creator')) {
      const grpId = String(mcm.chat.id);
      const grpTitle = mcm.chat.title || mcm.chat.username || grpId;
      await notifyAllAdmins(
        env,
        `👥 ربات در گروه **«${grpTitle}»** ادمین شد!\n` +
          `🆔 شناسه عددی گروه: \`${grpId}\`\n\n` +
          `مبصر ضدلینک و دستیار هوشمند گروه آماده است:`,
        {
          inlineKeyboard: [
            [{ text: '03. ثبت به‌عنوان گروه کاربران دلارینو', callback_data: `adm_bind_ch:community:${grpId}`, style: 'success' }],
          ],
        }
      ).catch(() => {});
    }
    return { ok: true, event: 'my_chat_member' };
  }

  // 1. Handle Channel Posts containing Dollarino Signals (Official origin validation, no forwards)
  if (update.channel_post?.text) {
    const post = update.channel_post;
    if (post.forward_date || post.forward_from || post.forward_from_chat) {
      return { ok: true, ignored: 'forwarded signal rejected' };
    }
    const chatIdStr = String(post.chat.id);
    const chatUser = (post.chat.username || '').toLowerCase();
    const [defaultRaw, configuredSignalsChannel] = await Promise.all([
      getSystemSetting(env.DB, 'official_channel', env.DEFAULT_SIGNAL_CHANNEL || ''),
      getSystemSetting(env.DB, 'signals_channel_id', ''),
    ]);
    const defaultHandle = defaultRaw.replace(/^@/, '').toLowerCase();
    const isOfficial =
      (Boolean(configuredSignalsChannel) && (chatIdStr === configuredSignalsChannel || (chatUser && chatUser === configuredSignalsChannel.replace(/^@/, '').toLowerCase()))) ||
      (Boolean(defaultHandle) && (chatUser === defaultHandle || chatIdStr === defaultRaw));

    if (!isOfficial) {
      const configuredBotChannel = await env.DB.prepare(
        `SELECT id FROM telegram_bots WHERE is_active = 1 AND (LOWER(REPLACE(COALESCE(signal_channel_id, ''), '@', '')) = ? OR signal_channel_id = ?) LIMIT 1`
      ).bind(chatUser || '__none__', chatIdStr).first<{ id: string }>();
      if (!configuredBotChannel) {
        return { ok: true, ignored: 'unauthorized signal channel' };
      }
    }

    const signal = parseDollarinoSignal(update.channel_post.text);
    if (!signal) return { ok: true, ignored: 'not a signal' };

    const sigId = randomId('sig');
    const engineLabel = signal.engineLabel || resolveEngineDisplayLabel(signal.engineKey, '📡 کانال رسمی دلارینو');
    await env.DB.prepare(
      `INSERT INTO signals (id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, sl_pct, tp1_pct, tp2_pct, tp3_pct, raw_text, status, engine_source, engine_label, channel_message_id, channel_chat_id)
       VALUES (?, 'telegram_channel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?)`
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
      formatDollarinoSignal({ ...signal, engineLabel }),
      signal.engineKey || 'telegram_channel',
      engineLabel,
      post.message_id,
      chatIdStr
    ).run();

    const cfg = await resolveChannelAndBotConfig(env);
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
        await bot.sendMessage(u.telegram_id, formatDollarinoSignal({ ...signal, engineLabel }), {
          inlineKeyboard: channelSignalInlineButtons({
            signalId: sigId,
            botUsername: cfg.botUsername,
            webAppUrl: cfg.webAppUrl,
            forChannel: false,
          }),
        }).catch(() => {});
      }
    }
    return { ok: true, signalId: sigId };
  }

  const [privateAdminOnlyVal, ownerId] = await Promise.all([
    getSystemSetting(env.DB, 'bot_private_admin_only', 'false'),
    resolveOwnerTelegramId(env),
  ]);
  const privateAdminOnly = privateAdminOnlyVal === 'true';

  // 2. Handle Inline Callback Queries
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;
    const msgId = cq.message?.message_id;
    const data = cq.data ?? '';
    const tgId = String(cq.from.id);

    if (data.startsWith('gmod:')) {
      await handleGroupModCallback(env, bot, cq.id, chatId, msgId, cq.from.id, cq.from.username, data);
      return { ok: true };
    }

    const user = await getOrProvisionTelegramUser(env, cq.from, { ownerId });
    if (!user) {
      await bot.answerCallbackQuery(cq.id, '⏳ ورود و ثبت‌نام از طریق تلگرام هنوز توسط مدیر سایت فعال نشده است.', true);
      return { ok: true };
    }
    const admin = isUserAdmin(tgId, user.role, ownerId);

    if (user.is_blocked || (privateAdminOnly && !admin)) {
      await bot.answerCallbackQuery(cq.id, '⛔️ دسترسی محدود شده یا ربات در حالت خصوصی ادمین است.', true);
      return { ok: true };
    }

    // Hard Phone-KYC Gate on all callbacks before account verification (no extra buttons before KYC)
    if (await isPhoneKycRequiredForUser(env, user, tgId, ownerId)) {
      await bot.answerCallbackQuery(cq.id, '🔐 ابتدا شماره تماس اکانت خود را از دکمه پایین به اشتراک بگذارید.', true);
      await sendPreAuthIntro(env, bot, chatId, user, cq.from.first_name || user.username);
      return { ok: true };
    }

    if (data.startsWith('cpos_act:')) {
      const parts = data.split(':');
      const posId = parts[1] || '';
      const act = parts[2] || '';
      const pos = await env.DB.prepare(
        `SELECT * FROM copy_positions_v2 WHERE id = ? AND user_id = ? LIMIT 1`
      )
        .bind(posId, user.id)
        .first<CopyPositionV2Row>()
        .catch(() => null);

      if (!pos) {
        await bot.answerCallbackQuery(cq.id, 'پوزیشن یافت نشد یا دسترسی ندارید.', true);
        return { ok: true };
      }

      if (act === 'CONFIRM') {
        await env.DB.prepare(`UPDATE copy_positions_v2 SET status = 'OPEN' WHERE id = ?`).bind(posId).run();
        await bot.answerCallbackQuery(cq.id, '✅ پوزیشن کپی‌ترید تایید و فعال شد!', true);
        if (msgId) {
          await bot.editMessageText(chatId, msgId, `✅ **پوزیشن ${pos.token_symbol} تایید شد و تحت رصد TP/SL دلارینو قرار گرفت.**\nمارجین اختصاصی: $${pos.margin_usd}`).catch(() => {});
        }
      } else if (act === 'DISMISS') {
        await env.DB.batch([
          env.DB.prepare(`UPDATE copy_positions_v2 SET status = 'CLOSED', remaining_pct = 0, closed_at = datetime('now'), ai_guard_note = 'لغو از تلگرام' WHERE id = ?`).bind(posId),
          env.DB.prepare(`UPDATE copy_follow_rules SET used_margin_usd = MAX(0, used_margin_usd - ?) WHERE id = ?`).bind(pos.margin_usd, pos.rule_id),
        ]);
        await bot.answerCallbackQuery(cq.id, '❌ لغو شد و مارجین به باکس تریدر برگشت.', true);
        if (msgId) {
          await bot.editMessageText(chatId, msgId, `❌ **ورود ${pos.token_symbol} لغو شد** و مارجین آزاد گردید.`).catch(() => {});
        }
      } else if (act === 'SELL100') {
        await closeCopyPositionV2(env, pos, Number(pos.current_price_usd || pos.entry_price_usd), 'Telegram Emergency Close');
        await bot.answerCallbackQuery(cq.id, '💸 پوزیشن ۱۰۰٪ بسته شد!', true);
        if (msgId) {
          await bot.editMessageText(chatId, msgId, `💸 **پوزیشن ${pos.token_symbol} با موفقیت بسته شد** و مارجین آزاد گردید.`).catch(() => {});
        }
      }
      return { ok: true };
    }

    if (data.startsWith('adm_bind_ch:')) {
      if (!admin) {
        await bot.answerCallbackQuery(cq.id, '⛔️ دسترسی مدیریتی ندارید.', true);
        return { ok: true };
      }
      const parts = data.split(':');
      const roleKey = parts[1];
      const targetChatId = parts.slice(2).join(':');
      const roleMeta: Record<string, { settingKey: string; title: string }> = {
        official: { settingKey: 'official_channel', title: '🌟 چنل رسمی و اصلی دلارینو' },
        signals: { settingKey: 'signals_channel_id', title: '01. سیگنال دلارینو' },
        results: { settingKey: 'results_channel_id', title: '02. نتایج سیگنال دلارینو' },
        community: { settingKey: 'community_group_id', title: '03. گروه کاربران دلارینو' },
        logs: { settingKey: 'logs_channel_id', title: '04. لاگ‌های دلارینو (خصوصی)' },
        database: { settingKey: 'database_channel_id', title: '05. دیتابیس دلارینو (خصوصی)' },
        transactions: { settingKey: 'transactions_channel_id', title: '06. تراکنش‌های دلارینو (خصوصی)' },
        news: { settingKey: 'news_channel_id', title: '07. اخبار دلارینو' },
      };
      const meta = (roleKey && roleMeta[roleKey]) || roleMeta.official!;
      const settingKey = meta.settingKey;
      const roleTitle = meta.title;

      await env.DB.prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).bind(settingKey, targetChatId).run();
      invalidateSettingsCache(env.DB);

      const readiness = await bot.checkChannelAdminReadiness(targetChatId);
      await bot.answerCallbackQuery(cq.id, `${roleTitle} ثبت شد ✅`);
      const confirmTxt = readiness.ok
        ? `✅ **${roleTitle}** با موفقیت روی «${readiness.channelTitle || targetChatId}» (\`${targetChatId}\`) ثبت و تایید شد!\nاز این لحظه پیام‌های مربوط به این بخش خودکار در این کانال منتشر می‌شوند.`
        : `⚠️ **${roleTitle}** روی \`${targetChatId}\` ذخیره شد، اما دسترسی ارسال پیام ربات تایید نشد:\n${readiness.error || ''}\n\nلطفاً ربات را در کانال ادمین با دسترسی ارسال پیام کنید.`;
      if (msgId) {
        await bot.editMessageText(chatId, msgId, confirmTxt).catch(() => bot.sendMessage(chatId, confirmTxt));
      } else {
        await bot.sendMessage(chatId, confirmTxt);
      }
      return { ok: true };
    }

    if (data.startsWith('adm:')) {
      if (!admin) {
        await bot.answerCallbackQuery(cq.id, '⛔️ دسترسی مدیریتی ندارید.', true);
        return { ok: true };
      }
      await handleAdminCallback(env, bot, buildAdminActor(user, tgId, ownerId), cq.id, chatId, msgId, data);
      return { ok: true };
    }

    if (data.startsWith('tg_onboard_mode:')) {
      const modeChoice = data.split(':')[1] === 'LIVE' ? 'LIVE' : 'PAPER';
      await env.DB.prepare(
        `UPDATE bot_configs SET trading_mode = ?, trading_mode_selected = 1, updated_at = datetime('now') WHERE user_id = ?`
      )
        .bind(modeChoice, user.id)
        .run();
      await bot.answerCallbackQuery(
        cq.id,
        modeChoice === 'LIVE' ? 'حالت واقعی (Trust Wallet) انتخاب شد 🛡' : 'حالت دمو آزمایشی انتخاب شد 🧪'
      );
      const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
      if (msgId) {
        await bot.editMessageText(chatId, msgId, gatePrompt.text, gatePrompt.inlineKeyboard).catch(() => {});
      } else {
        await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
      }
      return { ok: true };
    }

    if (data === 'tg_onboard_accept') {
      const nowIso = new Date().toISOString();
      await env.DB.prepare(`UPDATE users SET risk_terms_accepted_at = COALESCE(risk_terms_accepted_at, ?) WHERE id = ?`)
        .bind(nowIso, user.id)
        .run();
      const gateCheck = await checkPreTradeOnboardingGate(env.DB, user.id);
      if (gateCheck.ok) {
        await bot.answerCallbackQuery(cq.id, 'قوانین تایید و حساب آماده معامله شد ✅');
        const readyTxt = `✅ **تایید قوانین و انتخاب حالت حساب (${gateCheck.tradingMode === 'LIVE' ? 'واقعی Trust Wallet' : 'دمو آزمایشی'}) کامل شد!**\n\nهم‌اکنون می‌توانید در ربات یا وب با خیال راحت معامله یا ربات خودکار را روشن کنید.`;
        if (msgId) {
          await bot.editMessageText(chatId, msgId, readyTxt, miniAppInlineKeyboard(webAppUrl, '', 'none', false, getUserUiMode(user))).catch(() => {});
        } else {
          await bot.sendMessage(chatId, readyTxt, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, getUserUiMode(user)) });
        }
      } else {
        await bot.answerCallbackQuery(cq.id, 'قوانین تایید شد؛ لطفاً حالت دمو یا واقعی را هم انتخاب کنید 👆', true);
        const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
        if (msgId) {
          await bot.editMessageText(chatId, msgId, gatePrompt.text, gatePrompt.inlineKeyboard).catch(() => {});
        } else {
          await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
        }
      }
      return { ok: true };
    }

    if (data === 'tg_web_login') {
      await bot.answerCallbackQuery(cq.id, 'لینک ورود سریع ساخته شد 🌐');
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }

    if (data === 'tg_ecosystem_links') {
      await bot.answerCallbackQuery(cq.id);
      const cfg = await resolveChannelAndBotConfig(env);
      const pubUrl = (u: string) => /^https?:\/\//i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/i.test(u);
      const linkRows: Array<Array<{ text: string; url?: string; callback_data?: string; web_app?: { url: string }; style?: 'primary' | 'success' | 'danger' }>> = [];
      if (pubUrl(cfg.officialChannelInvite)) {
        linkRows.push([{ text: '🌟 چنل رسمی و اصلی دلارینو (اطلاعیه/قرعه‌کشی)', url: cfg.officialChannelInvite, style: 'primary' }]);
      }
      const row1: Array<{ text: string; url: string; style?: 'success' }> = [];
      if (pubUrl(cfg.signalsChannelInvite)) {
        row1.push({ text: '01. سیگنال دلارینو 📡', url: cfg.signalsChannelInvite, style: 'success' });
      }
      if (pubUrl(cfg.resultsChannelInvite)) {
        row1.push({ text: '02. نتایج سیگنال 🏆', url: cfg.resultsChannelInvite });
      }
      if (row1.length > 0) linkRows.push(row1);
      const row2: Array<{ text: string; url: string }> = [];
      if (pubUrl(cfg.communityGroupInvite)) {
        row2.push({ text: '03. گروه کاربران دلارینو 👥', url: cfg.communityGroupInvite });
      }
      if (pubUrl(cfg.newsChannelInvite)) {
        row2.push({ text: '07. اخبار دلارینو 📰', url: cfg.newsChannelInvite });
      }
      if (row2.length > 0) linkRows.push(row2);
      linkRows.push([{ text: '🌐 ورود فوری به نسخه وب', callback_data: 'tg_web_login', style: 'primary' }]);
      linkRows.push([{ text: '🔙 بازگشت به منو', callback_data: 'tg_acc:none' }]);

      const ecoText =
        `📡 **ساختار رسمی DOLLARINO — AI Trading Ecosystem**\n\n` +
        `• 🌟 **چنل رسمی و اصلی:** ${cfg.officialChannel || 'تنظیم‌نشده (به‌زودی)'}\n` +
        `• 📡 **01. سیگنال دلارینو:** ${cfg.signalsChannelId || 'تنظیم‌نشده'}\n` +
        `• 🏆 **02. نتایج سیگنال دلارینو:** ${cfg.resultsChannelId || 'تنظیم‌نشده'}\n` +
        `• 👥 **03. گروه کاربران دلارینو:** ${cfg.communityGroupId ? 'فعال ✅' : 'تنظیم‌نشده'}\n` +
        `• 📰 **07. اخبار دلارینو:** ${cfg.newsChannelId || 'تنظیم‌نشده'}\n\n` +
        `از دکمه‌های زیر می‌توانید مستقیماً وارد هر بخش یا سایت شوید 👇`;

      await bot.sendMessage(chatId, ecoText, { inlineKeyboard: linkRows });
      return { ok: true };
    }

    if (data === 'tg_account') {
      await bot.answerCallbackQuery(cq.id);
      await showAccountCard(env, bot, chatId, user, tgId, webAppUrl);
      return { ok: true };
    }

    if (data === 'sub_menu') {
      await bot.answerCallbackQuery(cq.id);
      await showSubscriptionMenu(env, bot, chatId, user, tgId, msgId);
      return { ok: true };
    }

    if (data === 'sub_gift') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_GIFT_CODE' } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '🎁 کد هدیه یا تخفیف خود را وارد کنید (مثلاً VIP1405):');
      return { ok: true };
    }

    if (data === 'sub_topup') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_TOPUP_AMOUNT' } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '💰 مبلغ افزایش موجودی کیف پول را به تتر (USDT) وارد کنید (مثلاً 20):');
      return { ok: true };
    }

    if (data.startsWith('sub_buy:')) {
      const planCode = data.slice('sub_buy:'.length);
      const [plan, rawWalletAddr, rateStr] = await Promise.all([
        env.DB.prepare(`SELECT code, name_fa, price_usd, duration_days FROM subscription_plans WHERE code = ?`)
          .bind(planCode).first<{ code: string; name_fa: string; price_usd: number; duration_days: number }>(),
        getSystemSetting(env.DB, 'usdt_trc20_wallet', ''),
        getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
      ]);
      const walletAddr = rawWalletAddr && !rawWalletAddr.includes('YourTRC20WalletAddress') ? rawWalletAddr : '';
      if (!plan) {
        await bot.answerCallbackQuery(cq.id, 'پلن یافت نشد', true);
        return { ok: true };
      }
      const subId = randomId('sub');
      await env.DB.prepare(
        `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, amount_usd, payer_note)
         VALUES (?, ?, ?, 'PENDING_REVIEW', 'USDT_TRC20', ?, 'Requested via Telegram Bot')`
      ).bind(subId, user.id, plan.code, plan.price_usd).run();

      const rate = Number(rateStr) || 70000;
      const canWalletPay = Number(user.wallet_balance_usdt ?? 0) >= plan.price_usd;
      const bep20Addr = await getSystemSetting(env.DB, 'trust_wallet_evm_receiver', '');
      const text =
        `🧾 فاکتور خرید ${plan.name_fa}\n\n` +
        `🔢 شماره فاکتور: ${subId}\n` +
        `💵 مبلغ قابل پرداخت: ${plan.price_usd} USDT (${formatToman(plan.price_usd, rate)} تومان)\n` +
        `⏳ مدت اعتبار: ${plan.duration_days} روز\n\n` +
        (walletAddr
          ? `💳 آدرس دریافت USDT (شبکه TRC20):\n\`${walletAddr}\`\n`
          : `⚠️ آدرس دریافت TRC20 هنوز در پنل مدیریت تنظیم نشده است.\n`) +
        (bep20Addr ? `🦊 آدرس دریافت USDT در Trust Wallet (شبکه BEP20):\n\`${bep20Addr}\`\n` : '') +
        `\nپس از انتقال وجه، روی «✅ بررسی پرداخت» بزنید تا کد پیگیری (TXID) ثبت و اشتراک با تایید خودکار بلاکچینی فعال شود:`;

      const twPayDeepLink = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(
        `${webAppUrl.startsWith('https://') ? webAppUrl : 'https://dollarino.pages.dev'}/subscription`
      )}`;
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '✅ بررسی پرداخت / ثبت TXID', callback_data: `sub_verify:${subId}`, style: 'success' },
          { text: '❌ انصراف', callback_data: `sub_cancel:${subId}`, style: 'danger' },
        ],
        [{ text: '🦊 پرداخت سریع با Trust Wallet DApp', url: twPayDeepLink, style: 'primary' }],
        ...(canWalletPay ? [[{ text: `💰 پرداخت فوری از کیف پول (${plan.price_usd}$)`, callback_data: `sub_pay_wallet:${subId}` }]] : []),
        [{ text: '🎁 اعمال کد هدیه', callback_data: 'sub_gift' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, text, kb).catch(() => bot.sendMessage(chatId, text, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, text, { inlineKeyboard: kb });
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data.startsWith('sub_pay_wallet:')) {
      const subId = data.slice('sub_pay_wallet:'.length);
      const sub = await env.DB.prepare(
        `SELECT s.id, s.plan_code, s.amount_usd, p.duration_days, p.name_fa FROM user_subscriptions s LEFT JOIN subscription_plans p ON p.code = s.plan_code WHERE s.id = ? AND s.user_id = ? AND s.status = 'PENDING_REVIEW'`
      ).bind(subId, user.id).first<{ id: string; plan_code: string; amount_usd: number; duration_days?: number; name_fa?: string }>();
      if (!sub || Number(user.wallet_balance_usdt ?? 0) < sub.amount_usd) {
        await bot.answerCallbackQuery(cq.id, 'موجودی کیف پول کافی نیست!', true);
        return { ok: true };
      }
      const days = sub.duration_days ?? 30;
      await env.DB.prepare(`UPDATE users SET wallet_balance_usdt = wallet_balance_usdt - ?, fee_prepaid_credit_usd = COALESCE(fee_prepaid_credit_usd, 0) + ? WHERE id = ?`)
        .bind(sub.amount_usd, sub.amount_usd, user.id).run();
      await env.DB.prepare(
        `UPDATE user_subscriptions SET status = 'ACTIVE', payment_method = 'WALLET_USDT', started_at = datetime('now'), expires_at = datetime('now', '+' || ? || ' days'), admin_note = 'Paid via wallet balance (3% fee credit)' WHERE id = ?`
      ).bind(days, sub.id).run();

      await bot.answerCallbackQuery(cq.id, 'اعتبار کارمزد ۳٪ شارژ شد ✅');
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `🎉 پرداخت با موجودی کیف پول انجام شد!\n\n✅ مبلغ ${sub.amount_usd} USDT به اعتبار کارمزد ۳٪ حساب شما اضافه شد (در دلارینو اشتراک ماهانه ۰٪ است!).`);
      }
      return { ok: true };
    }

    if (data.startsWith('sub_verify:')) {
      const subId = data.slice('sub_verify:'.length);
      const sub = await env.DB.prepare(`SELECT id, status, amount_usd, plan_code FROM user_subscriptions WHERE id = ? AND user_id = ?`)
        .bind(subId, user.id).first<{ id: string; status: string; amount_usd: number; plan_code: string }>();
      if (!sub) {
        await bot.answerCallbackQuery(cq.id, 'فاکتور یافت نشد', true);
        return { ok: true };
      }
      if (sub.status === 'ACTIVE') {
        await bot.answerCallbackQuery(cq.id, 'این پرداخت هم‌اکنون تایید شده است ✅', true);
        if (msgId) await bot.editMessageText(chatId, msgId, '🎉 تراکنش شما هم‌اکنون تایید و اعتبار کارمزد ۳٪ شما فعال است!').catch(() => {});
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_PAYMENT_TXID', subId: sub.id } satisfies TelegramStepState), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        `🔗 لطفاً **عکس رسید واریز** یا **کد پیگیری / هش تراکنش (TXID)** مربوط به فاکتور #${sub.id} (مبلغ ${sub.amount_usd} USDT) را همین‌جا ارسال کنید:`
      );
      return { ok: true };
    }

    if (data.startsWith('sub_cancel:')) {
      const subId = data.slice('sub_cancel:'.length);
      await env.DB.prepare(`UPDATE user_subscriptions SET status = 'REJECTED', admin_note = 'Cancelled by user' WHERE id = ? AND user_id = ? AND status = 'PENDING_REVIEW'`)
        .bind(subId, user.id).run();
      await bot.answerCallbackQuery(cq.id, 'سفارش لغو شد');
      if (msgId) await bot.editMessageText(chatId, msgId, `❌ فاکتور #${subId} لغو گردید.`).catch(() => {});
      return { ok: true };
    }

    // Trade Quantities Menu Callbacks
    if (data === 'cfg_qty_menu' || data === 'tg_trade_quantities') {
      await bot.answerCallbackQuery(cq.id);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data === 'cfg_tp_menu') {
      await bot.answerCallbackQuery(cq.id);
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '🎯 ۵۰% / ۲۵% / ۲۵% (پیش‌فرض)', callback_data: 'cfg_tp_set:50:25:25' },
          { text: '🎯 ۴۰% / ۳۰% / ۳۰%', callback_data: 'cfg_tp_set:40:30:30' },
        ],
        [
          { text: '🎯 ۳۰% / ۳۰% / ۴۰%', callback_data: 'cfg_tp_set:30:30:40' },
          { text: '✏️ ورود دستی درصدها', callback_data: 'cfg_edit:tp_custom' },
        ],
        [{ text: '🔙 بازگشت به مقادیر معامله', callback_data: 'cfg_qty_menu' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, '🎯 نحوه تقسیم حجم خروج در ۳ تارگت (مجموع = ۱۰۰٪) را انتخاب کنید:', kb);
      return { ok: true };
    }

    if (data.startsWith('cfg_tp_set:')) {
      const [, a, b, c] = data.split(':');
      await env.DB.prepare(`UPDATE bot_configs SET tp1_close_pct = ?, tp2_close_pct = ?, tp3_close_pct = ? WHERE user_id = ?`)
        .bind(Number(a), Number(b), Number(c), user.id).run();
      await bot.answerCallbackQuery(cq.id, `تنظیم شد: ${a}% / ${b}% / ${c}%`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data === 'tg_engines_menu') {
      await bot.answerCallbackQuery(cq.id);
      await showEnginesToggleMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_eng_toggle:')) {
      const eng = data.slice('tg_eng_toggle:'.length) as TradingEngineChoice;
      const valid: TradingEngineChoice[] = ['CENTRAL_AI', 'STRATEGY', 'MY_AI', 'COPY_TRADE', 'LISTING_SNIPER'];
      if (valid.includes(eng)) {
        const cur = await getActiveEngineState(env.DB, user.id);
        const currentlyOn = cur.activeEngines.includes(eng);
        await toggleTradingEngine(env.DB, user.id, eng, !currentlyOn, { auditSource: 'telegram_menu' });
        if (eng === 'LISTING_SNIPER') {
          await env.DB.prepare(`UPDATE bot_configs SET sniper_enabled = ?, updated_at = datetime('now') WHERE user_id = ?`)
            .bind(currentlyOn ? 0 : 1, user.id)
            .run()
            .catch(() => {});
        }
        await bot.answerCallbackQuery(cq.id, currentlyOn ? 'موتور خاموش شد ⚪️' : 'موتور روشن شد 🟢');
        await showEnginesToggleMenu(env, bot, chatId, user.id, msgId);
      }
      return { ok: true };
    }

    if (data.startsWith('cfg_toggle:')) {
      const which = data.split(':')[1];
      if (which === 'be_tp1') {
        await env.DB.prepare(`UPDATE bot_configs SET auto_breakeven_on_tp1 = CASE WHEN auto_breakeven_on_tp1 = 1 THEN 0 ELSE 1 END WHERE user_id = ?`).bind(user.id).run();
      } else if (which === 'sl_tp2') {
        await env.DB.prepare(`UPDATE bot_configs SET move_sl_to_tp1_on_tp2 = CASE WHEN move_sl_to_tp1_on_tp2 = 1 THEN 0 ELSE 1 END WHERE user_id = ?`).bind(user.id).run();
      } else if (which === 'use_sig_lev') {
        await env.DB.prepare(`UPDATE bot_configs SET use_signal_leverage = CASE WHEN use_signal_leverage = 1 THEN 0 ELSE 1 END WHERE user_id = ?`).bind(user.id).run();
      }
      await bot.answerCallbackQuery(cq.id, 'بروزرسانی شد ✅');
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data === 'cfg_apply_dynamic') {
      const cfg = await env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(user.id).first<UserBotConfigRow>();
      const cap = await resolveUserCapitalSummary(env.DB, user.id, cfg ?? null);
      const rec = computeDynamicRecommendedSettings(cap.effectiveCapitalUsd, 'balanced');
      await env.DB.prepare(
        `UPDATE bot_configs SET margin_pct = ?, max_leverage = ?, max_open_positions = ?, daily_max_loss_pct = ?, trailing_stop_pct = ?, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(rec.marginPct, rec.maxLeverage, rec.maxOpenPositions, rec.dailyMaxLossPct, rec.trailingStopPct, user.id).run();
      await bot.answerCallbackQuery(cq.id, `تنظیمات مدیریت سرمایه برای $${rec.effectiveCapitalUsd} اعمال شد ✅`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id, msgId);
      return { ok: true };
    }

    if (data.startsWith('cfg_edit:')) {
      const field = data.slice('cfg_edit:'.length);
      const stepMap: Record<string, { step: string; prompt: string }> = {
        bot_budget_usd: {
          step: 'AWAIT_BOT_BUDGET',
          prompt:
            '💼 سقف بودجه کل ربات به دلار را بفرستید (مثلاً 100 یعنی ربات جمع کل معاملاتش از $100 بیشتر نشود، حتی اگر موجودی کیف‌پول $1,000 باشد).\nبرای استفاده از کل موجودی کیف‌پول عدد 0 را بفرستید:',
        },
        margin_pct: { step: 'AWAIT_MARGIN_PCT', prompt: '💰 درصد مارجین هر معامله (بین 1 تا 100، پیش‌فرض 10) را بفرستید:' },
        max_leverage: { step: 'AWAIT_MAX_LEV', prompt: '🔘 حداکثر اهرم مجاز (بین 1 تا 125، پیش‌فرض 20) را بفرستید:' },
        signal_channel_handle: { step: 'AWAIT_SIGNAL_CHANNEL', prompt: '📡 آیدی یا لینک کانال سیگنال جدید را بفرستید (مثلاً @my_signals_channel):' },
        tp_custom: { step: 'AWAIT_TP_CUSTOM', prompt: '🎯 درصدهای TP1 TP2 TP3 را با فاصله بفرستید (مثلاً: 50 25 25):' },
      };
      const item = stepMap[field];
      if (item) {
        await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: item.step }), user.id).run();
        await bot.answerCallbackQuery(cq.id);
        await bot.sendMessage(chatId, item.prompt);
      }
      return { ok: true };
    }

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
        created_at: string;
      }>();
      if (!sigRow) {
        await bot.answerCallbackQuery(cq.id, 'سیگنال منقضی شده است', true);
        return { ok: true };
      }
      const ageMs = Date.now() - Date.parse(sigRow.created_at + 'Z');
      if (Number.isFinite(ageMs) && ageMs > 60 * 60_000) {
        await bot.answerCallbackQuery(cq.id, 'این سیگنال منقضی شده است (بیش از ۱ ساعت گذشته).', true);
        return { ok: true };
      }
      const gate = await checkPreTradeOnboardingGate(env.DB, user.id);
      if (!gate.ok) {
        const gp = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.answerCallbackQuery(cq.id, 'ابتدا حالت معاملاتی و قوانین ریسک را تایید کنید.', true);
        await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
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
      if (data === 'toggle_auto_on') {
        const res = await startBotOneClickForTelegram({
          env,
          bot,
          chatId,
          user,
          tgId,
          webAppUrl,
        });
        await bot.answerCallbackQuery(cq.id, res.ok ? 'اتوترید خودکار روشن شد 🤖' : res.text, !res.ok);
        if (res.needsOnboardingGate) {
          const gp = await buildTelegramOnboardingGatePayload(env, user.id);
          await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
          return { ok: true };
        }
        if (msgId) {
          await bot.editMessageText(chatId, msgId, res.text, miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, getUserUiMode(user))).catch(() => {});
        } else {
          await bot.sendMessage(chatId, res.text, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, getUserUiMode(user)) });
        }
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`
      ).bind(user.id).run();
      await bot.answerCallbackQuery(cq.id, 'اتوترید خاموش شد 🔴');
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `وضعیت اتوترید: 🔴 خاموش`);
      }
      return { ok: true };
    }

    if (data === 'tg_simple_home') {
      await bot.answerCallbackQuery(cq.id);
      await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl, msgId);
      return { ok: true };
    }

    if (data === 'tg_simple_wallet_mode') {
      await bot.answerCallbackQuery(cq.id);
      await showSimpleWalletAndBudgetSheet(env, bot, chatId, user, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_simple_set_mode:')) {
      const nextMode = data.endsWith(':LIVE') ? 'LIVE' : 'PAPER';
      if (nextMode === 'LIVE') {
        const hasTw = Boolean(user.trust_wallet_address || user.trust_wallet_solana || user.trust_wallet_tron || user.trust_wallet_ton);
        if (!hasTw) {
          await bot.answerCallbackQuery(cq.id, 'ابتدا یک آدرس Trust Wallet متصل کنید 🛡', true);
          await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, msgId);
          return { ok: true };
        }
      }
      await env.DB.prepare(
        `UPDATE bot_configs SET trading_mode = ?, trading_mode_selected = 1, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(nextMode, user.id).run();
      await bot.answerCallbackQuery(cq.id, nextMode === 'LIVE' ? 'حساب واقعی Trust Wallet فعال شد 🛡' : 'حساب دمو آزمایشی فعال شد 🧪');
      await showSimpleWalletAndBudgetSheet(env, bot, chatId, user, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_simple_exec:')) {
      const nextExec = data.endsWith(':MANUAL_CONFIRM') ? 'MANUAL_CONFIRM' : 'AUTO';
      await env.DB.prepare(
        `UPDATE bot_configs SET trade_execution_mode = ?, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(nextExec, user.id).run();
      await bot.answerCallbackQuery(cq.id, nextExec === 'AUTO' ? 'اجرای خودکار ۲۴/۷ فعال شد ⚡' : 'حالت تایید دستی فعال شد ✋');
      await showSimpleWalletAndBudgetSheet(env, bot, chatId, user, msgId);
      return { ok: true };
    }

    if (data === 'tg_simple_demo_bal') {
      await bot.answerCallbackQuery(cq.id);
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '$100', callback_data: 'tg_simple_set_demo:100' },
          { text: '$1,000', callback_data: 'tg_simple_set_demo:1000', style: 'primary' },
        ],
        [
          { text: '$10,000 (پیش‌فرض)', callback_data: 'tg_simple_set_demo:10000', style: 'success' },
          { text: '$100,000', callback_data: 'tg_simple_set_demo:100000' },
        ],
        [{ text: '🔙 بازگشت به حساب و بودجه', callback_data: 'tg_simple_wallet_mode' }],
      ];
      const txt = '💵 **انتخاب سریع موجودی حساب دمو آزمایشی (کاملاً رایگان):**\nیکی از مبالغ زیر را انتخاب کنید (در سایت تا $10M قابل تنظیم است):';
      if (msgId) await bot.editMessageText(chatId, msgId, txt, kb).catch(() => bot.sendMessage(chatId, txt, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, txt, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data.startsWith('tg_simple_set_demo:')) {
      const amt = Math.max(50, Math.min(10_000_000, Number(data.split(':')[1] || 10000)));
      await env.DB.prepare(
        `UPDATE bot_configs SET trading_mode = 'PAPER', trading_mode_selected = 1, paper_balance = ?, custom_paper_balance = ?, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(amt.toFixed(2), amt, user.id).run();
      await bot.answerCallbackQuery(cq.id, `موجودی دمو روی $${amt.toLocaleString('en-US')} تنظیم شد ✅`);
      await showSimpleWalletAndBudgetSheet(env, bot, chatId, user, msgId);
      return { ok: true };
    }

    if (data === 'tg_simple_positions') {
      await bot.answerCallbackQuery(cq.id);
      await showSimplePositionsAndAccounting(env, bot, chatId, user, webAppUrl, msgId);
      return { ok: true };
    }

    if (data === 'tg_close_all_confirm') {
      await bot.answerCallbackQuery(cq.id);
      const kb: InlineKeyboardButton[][] = [
        [
          { text: '🛑 بله، همه معاملات باز بسته شوند', callback_data: 'tg_close_all_exec', style: 'danger' },
          { text: 'انصراف 🔙', callback_data: 'tg_simple_positions' },
        ],
      ];
      const txt = '⚠️ آیا مطمئن هستید که می‌خواهید ربات را متوقف و تمام معاملات باز CEX را با قیمت لحظه‌ای بازار تسویه کنید؟';
      if (msgId) await bot.editMessageText(chatId, msgId, txt, kb).catch(() => bot.sendMessage(chatId, txt, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, txt, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data === 'tg_close_all_exec') {
      const openRows = await env.DB.prepare(`SELECT id, mode, market_type, symbol, direction, entry_price, initial_quantity, remaining_quantity, margin_used, realized_pnl FROM trades WHERE user_id = ? AND status = 'OPEN'`)
        .bind(user.id)
        .all<{ id: string; mode: string; market_type?: 'SPOT' | 'FUTURES'; symbol: string; direction: 'LONG' | 'SHORT'; entry_price: string; initial_quantity: string; remaining_quantity: string; margin_used: string; realized_pnl: string }>();
      let closedCount = 0;
      for (const t of openRows.results) {
        const { adapter } = await resolveUserExchangeAdapter(env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
        const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `tg_closeall_${Date.now()}`, t.market_type ?? 'FUTURES').catch(() => null);
        if (!cls) continue;
        const exitPx = Number(cls.filledPrice);
        const entryPx = Number(t.entry_price);
        const qty = Number(t.remaining_quantity);
        const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
        const totalRealized = Number(t.realized_pnl || 0) + pnl - Number(cls.fee || 0);
        if (t.mode === 'PAPER') {
          const curCfg = await env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ paper_balance: string }>();
          const remMargin = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
          const restored = Number(curCfg?.paper_balance ?? 0) + remMargin + pnl - Number(cls.fee || 0);
          await env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?').bind(restored.toFixed(2), user.id).run();
        }
        await env.DB.prepare(`UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'TG_CLOSE_ALL', closed_at = datetime('now') WHERE id = ?`)
          .bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();
        closedCount++;
      }
      await env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`).bind(user.id).run();
      await bot.answerCallbackQuery(cq.id, `${closedCount} معامله بسته شد ✅`);
      await showSimplePositionsAndAccounting(env, bot, chatId, user, webAppUrl, msgId);
      return { ok: true };
    }

    if (data === 'tg_more_tools') {
      await bot.answerCallbackQuery(cq.id);
      await showSimpleMoreToolsSheet(env, bot, chatId, user, webAppUrl, msgId);
      return { ok: true };
    }

    if (data === 'tg_tw_playbook' || data.startsWith('tg_tw_playbook:')) {
      const m = (data.split(':')[1] || 'FUTURES') as 'FUTURES' | 'SPOT' | 'DEX' | 'SNIPER' | 'COPY_TRADE';
      await bot.answerCallbackQuery(cq.id);
      await showTrustWalletPlaybookTelegram(env, bot, chatId, user, m, msgId);
      return { ok: true };
    }

    if (data === 'tg_onboard_prompt') {
      await bot.answerCallbackQuery(cq.id);
      const gp = await buildTelegramOnboardingGatePayload(env, user.id);
      if (msgId) await bot.editMessageText(chatId, msgId, gp.text, gp.inlineKeyboard).catch(() => bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard }));
      else await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
      return { ok: true };
    }

    if (data.startsWith('tg_acc:')) {
      const sec = (data.slice('tg_acc:'.length) || 'none') as CollapsibleMenuSection;
      const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      const uiMode = getUserUiMode(user);
      await bot.answerCallbackQuery(cq.id);
      if (sec === 'none' && uiMode === 'simple') {
        await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl, msgId);
        return { ok: true };
      }
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `🎛 کنترل پنل سریع دلارینو (${uiMode === 'simple' ? 'حالت ساده 🌱' : 'حالت حرفه‌ای ⚡'}):\nبخش دلخواه را باز یا بسته کنید:`,
          miniAppInlineKeyboard(webAppUrl, '', sec, isRunning, uiMode)
        ).catch(() => {});
      }
      return { ok: true };
    }

    if (data === 'tg_toggle_ui_mode') {
      const nextMode: 'simple' | 'pro' = getUserUiMode(user) === 'simple' ? 'pro' : 'simple';
      await env.DB.prepare(`UPDATE users SET ui_mode = ? WHERE id = ?`).bind(nextMode, user.id).run();
      user.ui_mode = nextMode;
      const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      await bot.answerCallbackQuery(cq.id, nextMode === 'pro' ? 'حالت حرفه‌ای فعال شد ⚡' : 'حالت ساده فعال شد 🌱');
      if (nextMode === 'simple') {
        await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl, msgId);
      } else if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `🎛 حالت رابط کاربری روی **حرفه‌ای (Quant Pro ⚡)** تنظیم شد (همگام با وب و موبایل):`,
          miniAppInlineKeyboard(webAppUrl, '', 'none', isRunning, nextMode)
        ).catch(() => {});
      }
      await bot.sendMessage(chatId, nextMode === 'pro' ? '⚡ منوی حالت حرفه‌ای فعال شد:' : '🌱 منوی حالت ساده فعال شد:', {
        replyKeyboard: mainMenuKeyboard(webAppUrl, nextMode, isUserAdmin(tgId, user.role, ownerId)),
      });
      return { ok: true };
    }

    if (data.startsWith('tg_simple_wizard:')) {
      const stepNum = Math.min(4, Math.max(1, Number(data.split(':')[1] || 1))) as 1 | 2 | 3 | 4;
      let st: TelegramStepState | undefined;
      try { st = user.telegram_state ? (JSON.parse(user.telegram_state) as TelegramStepState) : undefined; } catch { /* ignore */ }
      await bot.answerCallbackQuery(cq.id);
      await showSimpleWizardStep(bot, chatId, stepNum, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_m:')) {
      const margin = Number(data.split(':')[1] || 10);
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizMarginPct = margin;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, `مارجین ${margin}% انتخاب شد`);
      await showSimpleWizardStep(bot, chatId, 2, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_l:')) {
      const lev = Number(data.split(':')[1] || 10);
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizLev = lev;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, `اهرم ${lev}x انتخاب شد`);
      await showSimpleWizardStep(bot, chatId, 3, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_e:')) {
      const eng = data.slice('tg_wiz_e:'.length) || 'ai_autonomous_agent';
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      st.wizEngine = eng;
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify(st), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'موتور انتخاب شد ✅');
      await showSimpleWizardStep(bot, chatId, 4, st, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_wiz_go:')) {
      const onboardingGate = await checkPreTradeOnboardingGate(env.DB, user.id);
      if (!onboardingGate.ok) {
        await bot.answerCallbackQuery(cq.id, 'ابتدا حالت حساب و قوانین ریسک را تایید کنید ⛔️', true);
        const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
        return { ok: true };
      }
      const modeChoice = data.split(':')[1] || 'auto';
      let st: TelegramStepState = { step: 'WIZARD' };
      try { if (user.telegram_state) st = { ...st, ...(JSON.parse(user.telegram_state) as TelegramStepState) }; } catch { /* ignore */ }
      const marginPct = st.wizMarginPct ?? 10;
      const maxLev = st.wizLev ?? 10;
      const stratKey = st.wizEngine || 'ai_autonomous_agent';

      const cfg = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ trading_mode: string }>();
      const nextTradingMode = modeChoice === 'paper' ? 'PAPER' : (cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER');
      const nextBotState = nextTradingMode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
      const wizChoice: TradingEngineChoice =
        stratKey === 'listing_sniper'
          ? 'LISTING_SNIPER'
          : stratKey === 'ai_autonomous_agent'
            ? 'CENTRAL_AI'
            : stratKey === 'my_custom_ai'
              ? 'MY_AI'
              : stratKey === 'copy_trade'
                ? 'COPY_TRADE'
                : 'STRATEGY';
      await toggleTradingEngine(env.DB, user.id, wizChoice, true, {
        strategyKey: stratKey === 'listing_sniper' ? undefined : stratKey,
        auditSource: 'telegram_wizard',
      });

      await env.DB.prepare(
        `UPDATE bot_configs
         SET margin_pct = ?, max_leverage = ?, strategy_key = ?, trading_mode = ?, trade_execution_mode = 'AUTO', bot_state = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).bind(marginPct, maxLev, stratKey, nextTradingMode, nextBotState, user.id).run();
      await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(user.id).run();

      const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
      await doStub.fetch('https://do/start').catch(() => {});
      await doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});

      await bot.answerCallbackQuery(cq.id, 'ربات با تنظیمات ۴ مرحله‌ای روشن شد 🚀');
      const doneText =
        `✅ **تنظیمات ۴ مرحله‌ای ذخیره و ربات روشن شد!**\n\n` +
        `• سرمایه هر معامله: ${marginPct}%\n` +
        `• حداکثر اهرم: ${maxLev}x\n` +
        `• موتور فعال: ${resolveEngineDisplayLabel(stratKey)}\n` +
        `• وضعیت: 🟢 در حال رصد بازار (${nextTradingMode})`;
      if (msgId) await bot.editMessageText(chatId, msgId, doneText).catch(() => bot.sendMessage(chatId, doneText));
      else await bot.sendMessage(chatId, doneText);
      return { ok: true };
    }

    if (data === 'tg_tw_menu' || data === 'tg_tw_bal') {
      await bot.answerCallbackQuery(cq.id, data === 'tg_tw_bal' ? 'در حال استعلام از شبکه بلاکچین... 🔍' : undefined);
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, msgId, data === 'tg_tw_bal');
      return { ok: true };
    }

    if (data.startsWith('tg_tw_set:')) {
      const chainKind = data.slice('tg_tw_set:'.length);
      const stepMap: Record<string, { step: string; prompt: string }> = {
        evm: {
          step: 'AWAIT_TW_EVM',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه EVM (BSC / ETH / Base / Arbitrum)** خود را که با `0x` شروع می‌شود ارسال کنید:',
        },
        tron: {
          step: 'AWAIT_TW_TRON',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه TRON (TRC20)** خود را که با `T` شروع می‌شود ارسال کنید:',
        },
        solana: {
          step: 'AWAIT_TW_SOLANA',
          prompt: '🦊 لطفاً آدرس کیف‌پول **Trust Wallet شبکه Solana (SPL)** خود را ارسال کنید:',
        },
        ton: {
          step: 'AWAIT_TW_TON',
          prompt: '💎 لطفاً آدرس کیف‌پول **TON (شروع با EQ یا UQ)** خود را ارسال کنید:',
        },
      };
      const item = stepMap[chainKind];
      if (item) {
        await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: item.step }), user.id).run();
        await bot.answerCallbackQuery(cq.id);
        await bot.sendMessage(chatId, item.prompt);
      }
      return { ok: true };
    }

    if (data === 'tg_dex_trending' || data.startsWith('tg_dex_page:')) {
      const page = data.startsWith('tg_dex_page:') ? Math.max(0, Number(data.split(':')[1] || 0)) : 0;
      await bot.answerCallbackQuery(cq.id, 'در حال دریافت توکن‌های زنده DexScreener... 🔍');
      await showDexTrendingMenu(bot, chatId, undefined, undefined, msgId, page);
      return { ok: true };
    }

    if (data.startsWith('tg_dex_ai:')) {
      const rest = data.slice('tg_dex_ai:'.length);
      const colonIdx = rest.indexOf(':');
      const chainId = colonIdx > 0 ? rest.slice(0, colonIdx) : 'solana';
      const tokenAddr = colonIdx > 0 ? rest.slice(colonIdx + 1) : rest;
      await bot.answerCallbackQuery(cq.id, 'در حال تحلیل هوشمند خرید و بررسی DAppها... 🧠');
      const pools = await getDexTokenPools(chainId, tokenAddr).catch(() => []);
      const pair = pools[0];
      if (!pair) {
        await bot.sendMessage(chatId, '❌ اطلاعات لحظه‌ای این توکن در DexScreener یافت نشد.');
        return { ok: true };
      }
      const routes = annotateRoutesWithLivePools(buildMultiDappRoutes(chainId, tokenAddr, pair.url), pools);
      const listed = routes.filter((r) => r.listedStatus === 'DIRECT_POOL' || r.listedStatus === 'AGGREGATOR');
      const liqUsd = Number(pair.liquidity?.usd || 0);
      const vol24 = Number(pair.volume?.h24 || 0);
      const ch1 = Number(pair.priceChange?.h1 || 0);
      const buys = Number(pair.txns?.h1?.buys || pair.txns?.m5?.buys || 0);
      const sells = Number(pair.txns?.h1?.sells || pair.txns?.m5?.sells || 0);
      const buyRatio = buys + sells > 0 ? Math.round((buys / (buys + sells)) * 100) : 50;

      let score = pair.safetyScore * 0.45 + (liqUsd >= 100_000 ? 18 : liqUsd >= 30_000 ? 10 : -15) + (buyRatio >= 55 ? 10 : -8);
      if (ch1 > 0 && ch1 < 45) score += 10;
      const conf = Math.round(Math.max(30, Math.min(94, score)));
      const verdictText =
        pair.safetyScore < 45 || liqUsd < 8000
          ? '🚫 عدم خرید / ریسک بالا (پیشنهاد صرف‌نظر)'
          : conf >= 76 && pair.safetyScore >= 70
            ? '🟢 پیشنهاد خرید قوی (ورود پله‌ای مجاز)'
            : conf >= 62 && pair.safetyScore >= 58
              ? '✅ پیشنهاد خرید کنترل‌شده (با حد ضرر)'
              : '⏳ صبر و زیر نظر گرفتن (ورود هیجانی ممنوع)';

      const msgText =
        `🧠 **نتیجه تحلیل AI برای ${pair.baseToken.symbol} (${chainId.toUpperCase()})**\n\n` +
        `📌 **نتیجه و پیشنهاد: ${verdictText}** (اطمینان ${conf}%)\n` +
        `💵 قیمت: $${Number(pair.priceUsd || 0) < 0.01 ? Number(pair.priceUsd || 0).toPrecision(4) : Number(pair.priceUsd || 0).toFixed(4)}\n` +
        `💧 نقدینگی: ${formatUsdCompact(liqUsd)} | 📊 حجم ۲۴س: ${formatUsdCompact(vol24)}\n` +
        `⚖️ فشار خرید: ${buyRatio}% (${buys} خرید / ${sells} فروش) | 🛡 ایمنی: ${pair.safetyScore}/100\n` +
        `🦊 **لیست‌شده در برترین DAppهای Trust Wallet (${listed.length} صرافی):** ${listed.length ? listed.map((r) => r.name).join('، ') : 'صرافی مستقیم یافت نشد'}\n` +
        (pair.riskFlags.length ? `\n⚠️ هشدارها: ${pair.riskFlags.join(' · ')}` : '');

      const cbKey = `${chainId}:${pair.baseToken.address}`.slice(0, 52);
      await bot.sendMessage(chatId, msgText, {
        inlineKeyboard: [
          [
            { text: `⚡ خرید مستقیم همین توکن`, callback_data: `tg_dex_buy:${cbKey}`, style: 'success' },
            { text: `🦊 سوآپ در Trust Wallet`, url: pair.trustWallet.trustWalletDappUrl, style: 'primary' },
          ],
          [{ text: '🔙 بازگشت به رادار DEX', callback_data: 'tg_dex_trending' }],
        ],
      });
      return { ok: true };
    }

    if (data.startsWith('tg_dex_buy:')) {
      const rest = data.slice('tg_dex_buy:'.length);
      const colonIdx = rest.indexOf(':');
      const chainId = colonIdx > 0 ? rest.slice(0, colonIdx) : 'solana';
      const tokenAddr = colonIdx > 0 ? rest.slice(colonIdx + 1) : rest;
      const pools = await getDexTokenPools(chainId, tokenAddr).catch(() => []);
      const pair = pools[0];
      if (!pair || !pair.priceUsd) {
        await bot.answerCallbackQuery(cq.id, 'دریافت قیمت توکن ناموفق بود.', true);
        return { ok: true };
      }

      await ensureUserDefaults(env.DB, user.id).catch(() => {});

      const botCfg = await env.DB.prepare(
        `SELECT trading_mode, paper_balance, margin_pct, sniper_budget_usd, sniper_tp_pct, sniper_sl_pct FROM bot_configs WHERE user_id = ? LIMIT 1`
      )
        .bind(user.id)
        .first<{
          trading_mode: string;
          paper_balance: number;
          margin_pct: number;
          sniper_budget_usd: number;
          sniper_tp_pct: number;
          sniper_sl_pct: number;
        }>()
        .catch(() => null);

      const mode = botCfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
      const paperBal = Number(botCfg?.paper_balance ?? 10_000);
      const amountUsd = Math.max(5, Number(botCfg?.sniper_budget_usd || 25));
      const tpPct = Math.max(5, Number(botCfg?.sniper_tp_pct || 35));
      const slPct = Math.max(3, Math.min(80, Number(botCfg?.sniper_sl_pct || 15)));
      const entryPx = Number(pair.priceUsd);
      const slUsd = Number((entryPx * (1 - slPct / 100)).toPrecision(6));
      const tp1Usd = Number((entryPx * (1 + tpPct / 100)).toPrecision(6));
      const qty = amountUsd / entryPx;
      const twLinks = buildTrustWalletSwapLinks(chainId, tokenAddr);

      if (mode === 'LIVE') {
        await bot.answerCallbackQuery(cq.id, 'در حالت واقعی نیاز به امضای Trust Wallet دارد.');
        await bot.sendMessage(
          chatId,
          `🦊 **خرید مستقیم در حالت واقعی (LIVE) — ${pair.baseToken.symbol}**\n\n` +
            `• بودجه از پیش تعیین‌شده: $${amountUsd}\n` +
            `• TP: +${tpPct}% ($${tp1Usd}) | SL: -${slPct}% ($${slUsd})\n\n` +
            `برای امضای امن و غیرحضانتی روی دکمه زیر بزنید تا مستقیماً داخل Trust Wallet باز شود (یا از سایت در حالت دمو تمرین کنید):`,
          {
            inlineKeyboard: [
              [{ text: `🦊 امضا و خرید ${pair.baseToken.symbol} در Trust Wallet`, url: twLinks.trustWalletDappUrl, style: 'success' }],
            ],
          }
        );
        return { ok: true };
      }

      if (paperBal < amountUsd) {
        await bot.answerCallbackQuery(cq.id, `موجودی دمو ($${paperBal.toFixed(2)}) کافی نیست.`, true);
        return { ok: true };
      }

      const id = randomId('dext');
      await env.DB.prepare(`UPDATE bot_configs SET paper_balance = MAX(0, paper_balance - ?), updated_at = datetime('now') WHERE user_id = ?`)
        .bind(amountUsd, user.id)
        .run();
      await env.DB.prepare(
        `INSERT INTO dex_trades (
          id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol,
          direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, wallet_address, tx_hash, status, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, 'PAPER_SIMULATOR', ?, 'OPEN', ?)`
      ).bind(
        id,
        user.id,
        chainId.toLowerCase(),
        pair.dexId || 'dex',
        pair.pairAddress || tokenAddr,
        tokenAddr,
        pair.baseToken.symbol.toUpperCase(),
        pair.quoteToken?.symbol || 'USDT',
        amountUsd,
        qty,
        entryPx,
        slUsd,
        tp1Usd,
        `paper_${id}`,
        `خرید مستقیم از ربات تلگرام (TP +${tpPct}% / SL -${slPct}%)`
      ).run();

      await bot.answerCallbackQuery(cq.id, `خرید $${amountUsd} ${pair.baseToken.symbol} ثبت شد ✅`);
      await bot.sendMessage(
        chatId,
        `✅ **خرید مستقیم در سایت و حساب دمو با موفقیت انجام شد!**\n\n` +
          `🪙 توکن: **${pair.baseToken.symbol}** (${chainId.toUpperCase()})\n` +
          `💵 مبلغ خرید: $${amountUsd} (بر اساس تنظیمات از پیش تعیین‌شده)\n` +
          `📈 قیمت ورود: $${entryPx < 0.01 ? entryPx.toPrecision(5) : entryPx.toFixed(4)}\n` +
          `🎯 TP: +${tpPct}% ($${tp1Usd}) | 🛡 SL: -${slPct}% ($${slUsd})`,
        {
          inlineKeyboard: [
            [{ text: '📈 مشاهده در معاملات باز', callback_data: 'tg_positions', style: 'primary' }],
          ],
        }
      );
      return { ok: true };
    }

    if (data === 'tg_dex_search') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_DEX_SEARCH' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        '🔎 نام توکن، نماد (مثل PEPE یا AERO) یا آدرس کامل کانترکت (Contract Address) مورد نظر را بنویسید تا در لحظه در DexScreener بررسی شود و لینک سوآپ Trust Wallet بسازیم:'
      );
      return { ok: true };
    }

    if (data === 'tg_ext_widgets' || data === 'tg_ext_rotate') {
      await bot.answerCallbackQuery(cq.id, data === 'tg_ext_rotate' ? 'کلید جدید اکستنشن ساخته شد 🔑' : undefined);
      await showExtensionWidgetsMenu(env, bot, chatId, user, webAppUrl, msgId, data === 'tg_ext_rotate');
      return { ok: true };
    }

    if (data === 'tg_mode_simple_ai') {
      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
        overrideStrategyKey: 'ai_autonomous_agent',
      });
      await bot.answerCallbackQuery(cq.id, res.ok ? 'ترید هوشمند اتومات روشن شد ✅' : res.text, !res.ok);
      if (res.needsOnboardingGate) {
        const gp = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
        return { ok: true };
      }
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_myai') {
      await bot.answerCallbackQuery(cq.id);
      let ag = await env.DB.prepare(`SELECT name, system_rules_json, is_active_for_trading FROM user_ai_agents WHERE user_id = ?`).bind(user.id).first<{
        name: string;
        system_rules_json: string;
        is_active_for_trading: number;
      }>().catch(() => null);
      if (!ag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
          .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES)).run();
        ag = { name: 'هوش مصنوعی شخصی من', system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), is_active_for_trading: 0 };
      }
      let rules: TrainedAIRules = DEFAULT_TRAINED_RULES;
      try { rules = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') }; } catch { /* default */ }
      const summary =
        `🧠 ${ag.name} (${ag.is_active_for_trading ? '🟢 فعال روی ربات' : '⚪️ در حال آموزش'})\n\n` +
        `• تایم‌فریم: ${rules.timeframe} | سبک: ${rules.style}\n` +
        `• ارزها: ${rules.symbols.join('، ')}\n` +
        `• اندیکاتورها: ${rules.indicators.join(' + ')}\n` +
        `• حد ضرر: ${rules.stopLossPct}% | حد سود: ${rules.takeProfitPct}% | اهرم: ${rules.maxLeverage}x\n\n` +
        `روی دکمه زیر بزنید و استراتژی خودتان را با زبان ساده برایم بنویسید تا یاد بگیرم:`;
      const kb: InlineKeyboardButton[][] = [
        [{ text: '✍️ آموزش جدید به هوش مصنوعی من', callback_data: 'tg_myai_train', style: 'primary' }],
        [{ text: '🚀 فعال‌سازی ترید خودکار با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        [{ text: '🔙 بازگشت به پنل کنترل', callback_data: 'tg_acc:ai' }],
      ];
      if (msgId) await bot.editMessageText(chatId, msgId, summary, kb).catch(() => bot.sendMessage(chatId, summary, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, summary, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data === 'tg_myai_train') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_MYAI_TEACH' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(chatId, '🧠 هوش مصنوعی خام شما گوش به زنگ است!\nاستراتژی، تایم‌فریم، اندیکاتورها (مثلاً RSI زیر ۳۵ و EMA 9/21)، ارزها و حد ضرر/سود خود را همین الان بنویسید:');
      return { ok: true };
    }

    if (data === 'tg_myai_activate') {
      const gate = await checkPreTradeOnboardingGate(env.DB, user.id);
      if (!gate.ok) {
        const gp = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.answerCallbackQuery(cq.id, 'ابتدا حالت حساب و قوانین ریسک را تایید کنید.', true);
        await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
        return { ok: true };
      }
      await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      await toggleTradingEngine(env.DB, user.id, 'MY_AI', true, {
        auditSource: 'telegram_myai_activate',
      });
      const cfg = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ trading_mode: string }>();
      const nextState = cfg?.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
      await env.DB.prepare(`UPDATE bot_configs SET strategy_key = 'my_custom_ai', bot_state = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .bind(nextState, user.id).run();
      const doStub = env.TRADING_BOT_DO.get(env.TRADING_BOT_DO.idFromName('global-coordinator'));
      await doStub.fetch('https://do/start').catch(() => {});
      await doStub.fetch(`https://do/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});
      await bot.answerCallbackQuery(cq.id, 'هوش مصنوعی شخصی شما فعال شد ✅');
      await bot.sendMessage(chatId, '🚀 هوش مصنوعی شخصی شما به لیست موتورهای فعال اضافه شد و همزمان با سایر موتورهای روشن ۲۴ ساعته معامله می‌کند!');
      return { ok: true };
    }

    if (data === 'tg_copy_list') {
      await bot.answerCallbackQuery(cq.id);
      const traders = await env.DB.prepare(
        `SELECT id, display_name, specialty, win_rate, roi_30d_pct, followers_count FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC LIMIT 6`
      ).all<{ id: string; display_name: string; specialty: string; win_rate: number; roi_30d_pct: number; followers_count: number }>().catch(() => ({ results: [] }));
      if (!traders.results.length) {
        await bot.sendMessage(chatId, '🏆 در حال حاضر تریدری ثبت نشده است.');
        return { ok: true };
      }
      const lines = traders.results.map(
        (t, i) => `${i + 1}. ✅ ${t.display_name} (${t.specialty})\n   نرخ برد: ${t.win_rate}% | بازده ۳۰روزه: +${t.roi_30d_pct}% | دنبال‌کننده: ${t.followers_count}`
      ).join('\n\n');
      const kb: InlineKeyboardButton[][] = traders.results.map((t) => [
        { text: `📌 کپی از ${t.display_name}`, callback_data: `tg_copy_follow:${t.id}`, style: 'success' },
      ]);
      kb.push([{ text: '🐋 ۱۰ تریدر برتر هوشمند & ولت‌ها (V2)', callback_data: 'tg_copy_smart_v2', style: 'primary' }]);
      kb.push([{ text: '🔙 بازگشت', callback_data: 'tg_acc:copy' }]);
      if (msgId) await bot.editMessageText(chatId, msgId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, kb).catch(() => bot.sendMessage(chatId, lines, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data === 'tg_copy_smart_v2' || data.startsWith('tg_copy_smart_filter:')) {
      const filterKey = data.startsWith('tg_copy_smart_filter:') ? data.slice('tg_copy_smart_filter:'.length) : 'ALL';
      let topList = await discoverTop10SmartTraders(env, {}).catch(() => []);
      if (filterKey === 'HOLDER') {
        topList = topList.filter((w) => w.trader_category === 'HOLDER');
      } else if (filterKey === 'DAILY') {
        topList = [...topList].sort((a, b) => Number(b.roi_24h_pct || 0) - Number(a.roi_24h_pct || 0));
      } else if (filterKey === 'WEEKLY') {
        topList = [...topList].sort((a, b) => Number(b.roi_7d_pct || 0) - Number(a.roi_7d_pct || 0));
      } else if (filterKey === 'LOWEST') {
        topList = [...topList].sort((a, b) => Number(a.roi_30d_pct || 0) - Number(b.roi_30d_pct || 0));
      }
      const rules = await env.DB.prepare(
        `SELECT trader_label, allocated_margin_usd, used_margin_usd, execution_mode FROM copy_follow_rules WHERE user_id = ? AND is_active = 1 LIMIT 8`
      )
        .bind(user.id)
        .all<{ trader_label: string; allocated_margin_usd: number; used_margin_usd: number; execution_mode: string }>()
        .catch(() => ({ results: [] }));

      const topLines = topList
        .slice(0, 8)
        .map((w, i) => {
          const catFa = w.trader_category === 'HOLDER' ? 'هولدر' : w.trader_category === 'SCALPER' ? 'اسکلپر' : w.trader_category === 'SNIPER' ? 'اسنایپر' : 'سوئینگ';
          const holdingsStr = (w.wallet_holdings || [])
            .slice(0, 3)
            .map((h) => `${h.symbol} ${h.sharePct}%`)
            .join(' · ');
          return (
            `${i + 1}. 🐋 **${w.display_name}** [${w.chain_id.toUpperCase()} · ${catFa}]\n` +
            `   ۲۴س: +${w.roi_24h_pct ?? 0}% | ۷ر: +${w.roi_7d_pct}% | ۳۰ر: +${w.roi_30d_pct}% | برد: ${w.win_rate}%\n` +
            (holdingsStr ? `   💼 سبد ولت: ${holdingsStr}` : '')
          );
        })
        .join('\n\n');
      const myLines = rules.results.length
        ? `\n\n📌 **قوانین فعال شما (${rules.results.length}):**\n` +
          rules.results
            .map((r) => `• ${r.trader_label} — باکس: $${r.used_margin_usd.toFixed(0)}/$${r.allocated_margin_usd} (${r.execution_mode})`)
            .join('\n')
        : '\n\n💡 برای فالو، سبد کامل هر ولت، فیلترهای کامل و شروع خودکار کپی وارد هاب کپی‌ترید شوید:';

      const publicUrl = (env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
      const hasHttps = publicUrl.startsWith('https://');
      await bot.answerCallbackQuery(cq.id);
      const kbCopy: InlineKeyboardButton[][] = [
        [
          { text: '🔥 پرسودترین (۳۰ر)', callback_data: 'tg_copy_smart_filter:ALL', style: filterKey === 'ALL' ? 'success' : undefined },
          { text: '💎 هولدرها', callback_data: 'tg_copy_smart_filter:HOLDER', style: filterKey === 'HOLDER' ? 'success' : undefined },
        ],
        [
          { text: '⚡ سود ۲۴ ساعته', callback_data: 'tg_copy_smart_filter:DAILY', style: filterKey === 'DAILY' ? 'primary' : undefined },
          { text: '📆 سود هفتگی', callback_data: 'tg_copy_smart_filter:WEEKLY', style: filterKey === 'WEEKLY' ? 'primary' : undefined },
          { text: '🛡 کم‌نوسان‌ترین', callback_data: 'tg_copy_smart_filter:LOWEST', style: filterKey === 'LOWEST' ? 'primary' : undefined },
        ],
        [
          hasHttps
            ? { text: '⚙️ هاب کامل کپی‌ترید در مینی‌اپ', web_app: { url: `${publicUrl}/?tab=copy` }, style: 'primary' }
            : { text: '🌐 ورود به هاب کپی‌ترید سایت', url: `${publicUrl}/?tab=copy` },
        ],
        [{ text: '🔙 منوی کپی‌ترید', callback_data: 'tg_copy_list' }],
      ];
      const bodyTxt = `🐋 **تریدرهای هوشمند و سبد ولت‌ها (${topList.length} تریدر تاییدشده)**\n\n${topLines}${myLines}`;
      if (msgId && data.startsWith('tg_copy_smart_filter:')) {
        await bot.editMessageText(chatId, msgId, bodyTxt, kbCopy).catch(() => bot.sendMessage(chatId, bodyTxt, { inlineKeyboard: kbCopy }));
      } else {
        await bot.sendMessage(chatId, bodyTxt, { inlineKeyboard: kbCopy });
      }
      return { ok: true };
    }

    if (data.startsWith('tg_copy_follow:')) {
      const traderId = data.slice('tg_copy_follow:'.length);
      const trader = await env.DB.prepare(`SELECT display_name FROM copy_traders WHERE id = ?`).bind(traderId).first<{ display_name: string }>();
      const curState = await getActiveEngineState(env.DB, user.id);
      const shouldMirrorNow = curState.isBotRunning && curState.activeEngines.includes('COPY_TRADE') ? 1 : 0;
      const existingSub = await env.DB.prepare(
        `SELECT id, is_active FROM copy_subscriptions WHERE user_id = ? AND trader_id = ? LIMIT 1`
      ).bind(user.id, traderId).first<{ id: string; is_active: number }>();
      if (existingSub) {
        await env.DB.prepare(`UPDATE copy_subscriptions SET is_active = 1, auto_mirror = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(shouldMirrorNow, existingSub.id).run();
        if (!existingSub.is_active) {
          await env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
        }
      } else {
        await env.DB.prepare(
          `INSERT INTO copy_subscriptions (id, user_id, trader_id, allocation_usd, risk_multiplier, auto_mirror, is_active) VALUES (?, ?, ?, 100, 1, ?, 1)`
        ).bind(randomId('csub'), user.id, traderId, shouldMirrorNow).run();
        await env.DB.prepare(`UPDATE copy_traders SET followers_count = followers_count + 1 WHERE id = ?`).bind(traderId).run();
      }
      await bot.answerCallbackQuery(cq.id, `تریدر ${trader?.display_name || ''} فالو شد ✅`);
      await bot.sendMessage(
        chatId,
        `✅ تریدر «${trader?.display_name || traderId}» با موفقیت به لیست دنبال‌شده‌های شما اضافه شد!\n\n` +
          (shouldMirrorNow
            ? '🟢 ربات شما در حال حاضر با موتور کپی‌ترید روشن است و معاملات ایشان آینه‌سازی می‌شود.'
            : 'ℹ️ توجه: صرفاً فالو کردن تریدر باعث روشن‌شدن خودکار ربات نمی‌شود. هر زمان خواستید معاملات آینه شود، در منوی اصلی موتور کپی‌ترید را روشن کرده و ربات را استارت کنید.')
      );
      return { ok: true };
    }

    if (data === 'tg_open_sub') {
      await bot.answerCallbackQuery(cq.id);
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }

    if (data.startsWith('copy_pub_yes:') || data.startsWith('copy_pub_no:')) {
      const approve = data.startsWith('copy_pub_yes:');
      const copyTradeId = data.split(':')[1]!;
      const res = await confirmAndMirrorCopyTrade(env, copyTradeId, approve);
      await bot.answerCallbackQuery(
        cq.id,
        approve ? `منتشر شد ✅ (${res.mirroredCount} آینه‌سازی)` : 'فقط شخصی باقی ماند ❌'
      );
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          approve
            ? `✅ معامله کپی‌ترید شما منتشر شد و برای ${res.mirroredCount} دنبال‌کننده فعال آینه‌سازی گردید!`
            : `❌ معامله منتشر نشد و فقط در تاریخچه شخصی شما باقی ماند.`
        );
      }
      return { ok: true };
    }

    if (data.startsWith('manual_confirm:')) {
      const sigId = data.split(':')[1]!;
      await resolveUserEntitlement(env.DB, {
        id: user.id,
        email: user.email,
        username: user.username,
        role: (user.role as AuthUser['role']) || 'user',
        telegramId: tgId,
      });
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚡️ تایید نهایی اجرای این سیگنال روی حساب متصل شما:`,
          [
            [
              { text: 'تایید میکنم و اجرا کن ✅', callback_data: `confirm_trade:${sigId}`, style: 'success' },
              { text: 'انصراف ❌', callback_data: `cancel_trade:${sigId}`, style: 'danger' },
            ],
          ]
        );
      }
      await bot.answerCallbackQuery(cq.id);
      return { ok: true };
    }

    if (data === 'tg_hunt_ready' || data === 'tg_hunt_personal') {
      await bot.answerCallbackQuery(cq.id);
      if (data === 'tg_hunt_ready') {
        const kb: InlineKeyboardButton[][] = [
          [
            { text: '🦅 استراتژی دُرنا V1 (مخلوط ۸گانه)', callback_data: 'tg_set_strat:dollarino_v01', style: 'success' },
            { text: '⚡️ KBOS Super v11', callback_data: 'tg_set_strat:kbos_v11', style: 'primary' },
          ],
          [
            { text: '🌊 شکار نقدینگی SP2L', callback_data: 'tg_set_strat:sp2l' },
            { text: '📈 روند EMA Pullback', callback_data: 'tg_set_strat:ema_trend_pullback' },
          ],
          [{ text: '🔙 بازگشت به پنل کنترل', callback_data: 'tg_acc:hunt' }],
        ];
        await bot.sendMessage(
          chatId,
          `🎯 استراتژی‌های شکار آماده دلارینو:\nیکی از موتورهای آماده و بهینه‌شده زیر را برای شکار فرصت‌ها انتخاب کنید:`,
          { inlineKeyboard: kb }
        );
      } else {
        const hasHttps = webAppUrl.startsWith('https://');
        await bot.sendMessage(
          chatId,
          `🛠 استراتژی شخصی خودتان (Pine Script / Python / Visual Builder):\nدر محیط آزمایشگاه کد دلارینو می‌توانید استراتژی اختصاصی خود را بنویسید، بک‌تست ۹۰۰ کندلی بگیرید و روی ربات فعال کنید.`,
          {
            inlineKeyboard: hasHttps
              ? [
                  [{ text: '🚀 باز کردن آزمایشگاه کدنویسی (IDE)', web_app: { url: `${webAppUrl}/?tab=radar` }, style: 'primary' }],
                  [{ text: '🔙 بازگشت', callback_data: 'tg_acc:hunt' }],
                ]
              : [[{ text: '🔙 بازگشت', callback_data: 'tg_acc:hunt' }]],
          }
        );
      }
      return { ok: true };
    }

    if (data.startsWith('tg_set_strat:')) {
      const stratKey = data.slice('tg_set_strat:'.length);
      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
        overrideStrategyKey: stratKey,
      });
      await bot.answerCallbackQuery(cq.id, res.ok ? `استراتژی ${resolveEngineDisplayLabel(stratKey)} روشن شد ✅` : res.text, !res.ok);
      if (res.needsOnboardingGate) {
        const gp = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
        return { ok: true };
      }
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'hunt', res.ok, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_tv_alerts') {
      await bot.answerCallbackQuery(cq.id);
      await showFreeTradingViewAlertsMenu(env, bot, chatId, user.id, webAppUrl, msgId);
      return { ok: true };
    }

    if (data.startsWith('tg_tv_add:')) {
      const [, ruleId, sym] = data.split(':');
      const tmpl = FREE_TV_ALERT_TEMPLATES.find((t) => t.id === ruleId);
      const alertId = randomId('tva');
      await env.DB.prepare(
        `INSERT INTO tradingview_free_alerts (id, user_id, name, symbol, timeframe, indicator_id, params_json, auto_trade, notify_telegram, is_active)
         VALUES (?, ?, ?, ?, '15m', ?, ?, 1, 1, 1)`
      ).bind(
        alertId,
        user.id,
        tmpl?.nameFa || `${ruleId} ${sym}`,
        sym || 'BTCUSDT',
        ruleId || 'RSI_OVERSOLD',
        JSON.stringify(tmpl?.defaultParams || {})
      ).run();
      await bot.answerCallbackQuery(cq.id, `آلرت رایگان ${sym} ثبت و فعال شد ✅`);
      await showFreeTradingViewAlertsMenu(env, bot, chatId, user.id, webAppUrl, msgId);
      return { ok: true };
    }

    if (data === 'tg_profit_card') {
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        `🏆 صدور کارت سود رسمی دلارینو (فیوچرز + DEX + کپی‌ترید):\nبازه زمانی، تک‌معامله یا قالب استوری ۹:۱۶ را انتخاب کنید:`,
        { inlineKeyboard: buildTelegramProfitCardKeyboard() }
      );
      return { ok: true };
    }

    if (data === 'tg_profit_single_list') {
      const cfgRow = await env.DB.prepare('SELECT trading_mode FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ trading_mode: 'LIVE' | 'PAPER' }>();
      const mode = cfgRow?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
      const closed = await listUnifiedClosedTrades(env.DB, user.id, { mode, tradeSource: 'ALL', period: 'ALL', limit: 6 });
      if (!closed.length) {
        await bot.answerCallbackQuery(cq.id, `معامله بسته‌شده‌ای در حساب ${mode} وجود ندارد.`, true);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id);
      const kb: InlineKeyboardButton[][] = [...closed].reverse().map((t) => [
        {
          text: `[${t.tradeSource}] ${t.symbol} ${t.roiPct >= 0 ? '+' : ''}${t.roiPct.toFixed(1)}% (افقی ۱۶:۹)`,
          callback_data: `tg_profit_trade:${t.id}:horizontal`,
          style: t.realizedPnlUsd >= 0 ? 'success' : 'danger',
        },
        {
          text: `📱 استوری ۹:۱۶`,
          callback_data: `tg_profit_trade:${t.id}:vertical`,
          style: 'primary',
        },
      ]);
      await bot.sendMessage(chatId, `🎯 آخرین معاملات تسویه‌شده شما (${mode}) — انتخاب کارت تک‌معامله:`, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data.startsWith('tg_profit_trade:')) {
      const [, tradeId, rawLayout] = data.split(':');
      const layout = rawLayout === 'vertical' ? 'vertical' : 'horizontal';
      if (!tradeId) {
        await bot.answerCallbackQuery(cq.id, 'معامله نامعتبر است.', true);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id, 'در حال صدور کارت تک‌معامله... 🎨');
      const res = await issueAndPublishTelegramProfitCard(env, chatId, user, 'TRADE', layout, tradeId);
      if (!res.ok) {
        await bot.sendMessage(chatId, res.error || 'خطا در صدور کارت سود.');
      }
      return { ok: true };
    }

    if (data === 'tg_sniper_scan_5m' || data === 'tg_sniper_scan_1h') {
      const is5m = data === 'tg_sniper_scan_5m';
      await bot.answerCallbackQuery(cq.id, is5m ? 'در حال اسکن استخرهای زیر ۵ دقیقه... ⚡' : 'در حال اسکن مومنتوم ۱ ساعته... 🔥');
      const cfg = await env.DB.prepare(
        `SELECT sniper_networks_json, sniper_budget_usd FROM bot_configs WHERE user_id = ? LIMIT 1`
      )
        .bind(user.id)
        .first<{ sniper_networks_json?: string; sniper_budget_usd?: number }>()
        .catch(() => null);
      let chains = ['solana', 'base', 'bsc', 'ton'];
      try {
        if (cfg?.sniper_networks_json) {
          const parsed = JSON.parse(cfg.sniper_networks_json);
          if (Array.isArray(parsed) && parsed.length) chains = parsed;
        }
      } catch { /* default */ }
      const budget = Math.max(5, Number(cfg?.sniper_budget_usd || 25));
      const cands = await discoverListingAndBoomCandidates({
        targetType: 'DEX_BOOM_MEME',
        minSafetyScore: is5m ? 45 : 60,
        minLiquidityUsd: is5m ? 2000 : 10_000,
        maxPairAgeMinutes: is5m ? 5 : 60,
        maxPairAgeHours: is5m ? 5 / 60 : 1,
        allowedChains: chains,
        advancedFilters: {
          sortBy: is5m ? 'NEWEST' : 'MOMENTUM_5M',
          minVolume5mUsd: is5m ? 500 : 1500,
        },
      }).catch(() => []);

      if (!cands.length) {
        await bot.sendMessage(
          chatId,
          `🎯 **نتیجه اسکن زنده اسنایپر (${is5m ? 'عمر ≤ ۵ دقیقه ⚡' : 'عمر ≤ ۱ ساعت 🔥'})**\n\n` +
            `در این لحظه استخر جدیدی با حداقل نقدینگی و امنیت یافت نشد. می‌توانید از داخل مینی‌اپ اسنایپر با فیلتر منعطف‌تر یا پریست‌های دیگر اسکن کنید.`,
          {
            inlineKeyboard: [
              [
                { text: '🔄 اسکن مجدد زیر ۵ دقیقه', callback_data: 'tg_sniper_scan_5m', style: 'primary' },
                { text: '🔥 اسکن ۱ ساعته', callback_data: 'tg_sniper_scan_1h', style: 'success' },
              ],
            ],
          }
        );
        return { ok: true };
      }

      const top5 = cands.slice(0, 5);
      const lines = top5
        .map((c, idx) => {
          const age = c.ageMinutes !== null && c.ageMinutes !== undefined ? `${Math.max(1, c.ageMinutes)}m` : `${Math.max(1, Math.round((c.ageHours ?? 1) * 60))}m`;
          const px = c.priceUsd < 0.0001 ? c.priceUsd.toExponential(2) : c.priceUsd < 0.01 ? c.priceUsd.toFixed(6) : c.priceUsd.toFixed(4);
          return `${idx + 1}. **${c.symbol}** (${c.chainId.toUpperCase()} · عمر: ${age})\n   💵 $${px} | 💧 نقدینگی: $${Math.round(c.liquidityUsd).toLocaleString('en-US')} | 🛡 ایمنی: ${c.safetyScore}/100 | 5m: ${(c.change5mPct ?? 0) >= 0 ? '+' : ''}${(c.change5mPct ?? 0).toFixed(1)}%`;
        })
        .join('\n\n');

      const kb: InlineKeyboardButton[][] = top5.map((c) => {
        const key = `${c.chainId}:${c.tokenAddress}`.slice(0, 52);
        return [
          { text: `⚡ شکار ${c.symbol} ($${budget})`, callback_data: `tg_dex_buy:${key}`, style: 'success' },
          { text: `🧠 تحلیل AI`, callback_data: `tg_dex_ai:${key}`, style: 'primary' },
        ];
      });
      kb.push([
        { text: '🔄 بروزرسانی اسکن', callback_data: data },
        { text: '🔙 بازگشت به پنل کنترل', callback_data: 'tg_acc:hunt' },
      ]);

      await bot.sendMessage(
        chatId,
        `🎯 **اسنایپر زنده (${is5m ? 'تازه‌لانچ زیر ۵ دقیقه ⚡' : 'مومنتوم ۱ ساعته 🔥'})**\n\n${lines}\n\nروی دکمه «⚡ شکار» کنار هر توکن بزنید تا با بودجه $${budget} در حالت فعلی (دمو/واقعی) خرید ثبت شود:`,
        { inlineKeyboard: kb }
      );
      return { ok: true };
    }

    if (data === 'tg_notif_menu') {
      const cfg = await env.DB.prepare(
        'SELECT notifications_enabled, notification_prefs_json, display_currency FROM bot_configs WHERE user_id = ?'
      ).bind(user.id).first<{
        notifications_enabled: number;
        notification_prefs_json?: string | null;
        display_currency?: string | null;
      }>();
      const enabled = Number(cfg?.notifications_enabled ?? 1);
      const prefs = parseTgNotifPrefs(cfg?.notification_prefs_json);
      const currency = cfg?.display_currency === 'IRT' ? 'IRT' : 'USD';
      await bot.answerCallbackQuery(cq.id);
      await bot.sendMessage(
        chatId,
        `🔔 تنظیمات پیشرفته اعلان‌ها و واحد نمایش دلارینو:\n\nتمام تنظیمات زیر همزمان با پنل وب سایت همگام هستند:`,
        { inlineKeyboard: buildNotifSettingsKeyboard(enabled, prefs, currency) }
      );
      return { ok: true };
    }

    if (data === 'tg_notif_master' || data.startsWith('tg_notif_pref:') || data === 'tg_disp_curr:toggle') {
      const cfg = await env.DB.prepare(
        'SELECT notifications_enabled, notification_prefs_json, display_currency FROM bot_configs WHERE user_id = ?'
      ).bind(user.id).first<{
        notifications_enabled: number;
        notification_prefs_json?: string | null;
        display_currency?: string | null;
      }>();
      let enabled = Number(cfg?.notifications_enabled || 0);
      const prefs = parseTgNotifPrefs(cfg?.notification_prefs_json);
      let currency = cfg?.display_currency === 'IRT' ? 'IRT' : 'USD';

      if (data === 'tg_notif_master') {
        enabled = enabled ? 0 : 1;
      } else if (data.startsWith('tg_notif_pref:')) {
        const key = data.split(':')[1] || '';
        if (key in prefs) {
          prefs[key] = !prefs[key];
          if (prefs[key]) enabled = 1;
        }
      } else if (data === 'tg_disp_curr:toggle') {
        currency = currency === 'IRT' ? 'USD' : 'IRT';
      }

      await env.DB.prepare(
        `UPDATE bot_configs SET notifications_enabled = ?, notification_prefs_json = ?, display_currency = ?, updated_at = datetime('now') WHERE user_id = ?`
      ).bind(enabled, JSON.stringify(prefs), currency, user.id).run();

      await bot.answerCallbackQuery(cq.id, 'تنظیمات ذخیره شد ✅');
      await bot.editMessageText(
        chatId,
        cq.message!.message_id,
        `🔔 تنظیمات پیشرفته اعلان‌ها و واحد نمایش دلارینو:\n\nتمام تنظیمات زیر همزمان با پنل وب سایت همگام هستند:`,
        buildNotifSettingsKeyboard(enabled, prefs, currency)
      ).catch(() => {});
      return { ok: true };
    }

    if (data.startsWith('tg_profit_issue:')) {
      const [, rawPeriod, rawLayout] = data.split(':');
      const layout = rawLayout === 'vertical' ? 'vertical' : 'horizontal';
      const res = await issueAndPublishTelegramProfitCard(env, chatId, user, rawPeriod || '7D', layout);
      if (!res.ok) {
        await bot.answerCallbackQuery(cq.id, res.error || 'معامله یافت نشد.', true);
        return { ok: true };
      }
      await bot.answerCallbackQuery(cq.id, 'در حال صدور کارت سود... 🎨');
      return { ok: true };
    }

    if (data === 'tg_support_open') {
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`).bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id);
      const configuredBot = (await getSystemSetting(env.DB, 'bot_username', '')).replace(/^@/, '');
      const fallbackBot = configuredBot ? `@${configuredBot}` : '';
      const supportId = await getSystemSetting(env.DB, 'telegram_support', fallbackBot);
      const safeSup = !supportId || /Dollarino_admin/i.test(supportId) ? fallbackBot : supportId;
      const supTag = safeSup ? ` (${safeSup})` : '';
      await bot.sendMessage(
        chatId,
        `💬 پشتیبانی هوشمند و آنلاین دلارینو${supTag}\n\n` +
        `سوال، خطا یا <b>عکس و اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا دستیار هوش مصنوعی پشتیبانی ظرف چند ثانیه بررسی و پاسخ دهد.\n` +
        `هر زمان بخواهید می‌توانید دکمه «گفتگو مستقیم با مدیران» را بزنید تا پیام یا تصویرتان مستقیماً برای تیم مدیریت ارسال شود.\n\n` +
        `${ANTI_SCAM_WARNING_FA}`,
        {
          inlineKeyboard: [
            [{ text: '👨‍💼 اتصال مستقیم به مدیران پشتیبانی', callback_data: 'tg_support_human:new', style: 'primary' }],
          ],
        }
      );
      return { ok: true };
    }

    if (data.startsWith('tg_support_human:')) {
      const argTicketId = data.slice('tg_support_human:'.length).trim();
      let ticketId = argTicketId && argTicketId !== 'new' ? argTicketId : '';
      if (!ticketId) {
        const openTkt = await env.DB.prepare(
          `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
        ).bind(user.id).first<{ id: string }>();
        ticketId = openTkt?.id || '';
      }
      if (!ticketId) {
        ticketId = randomId('tkt');
        await env.DB.prepare(
          `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode, escalated_at) VALUES (?, ?, 'ارتباط مستقیم با مدیران (تلگرام)', 'OPEN', 'TELEGRAM', 'HUMAN_ADMIN', datetime('now'))`
        ).bind(ticketId, user.id).run();
      } else {
        await env.DB.prepare(
          `UPDATE support_tickets SET support_mode = 'HUMAN_ADMIN', escalated_at = datetime('now'), status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`
        ).bind(ticketId).run();
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'متصل شدید به مدیران پشتیبانی 👨‍💼');
      await notifyAllAdmins(
        env,
        `👨‍💼 درخواست گفتگوی مستقیم کاربر با مدیران (تلگرام)\n👤 ${user.username} (${tgId})\nتیکت: #${ticketId}`,
        { inlineKeyboard: [[{ text: '✍️ پاسخ فوری به کاربر', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' }]] }
      ).catch(() => {});
      await bot.sendMessage(
        chatId,
        `👨‍💼 درخواست شما برای گفتگوی مستقیم با <b>مدیران پشتیبانی دلارینو</b> در تیکت #${ticketId} ثبت شد.\n\nپیام متنی یا <b>عکس و اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا مستقیماً برای تیم مدیریت فرستاده شود و پاسخ مدیریت در همین‌جا برایتان پیام شود.`
      );
      return { ok: true };
    }

    if (data === 'tg_support_ai') {
      const openTkt = await env.DB.prepare(
        `SELECT id FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
      ).bind(user.id).first<{ id: string }>();
      if (openTkt) {
        await env.DB.prepare(`UPDATE support_tickets SET support_mode = 'AI_ASSISTANT' WHERE id = ?`).bind(openTkt.id).run();
      }
      await env.DB.prepare(`UPDATE users SET telegram_state = ? WHERE id = ?`)
        .bind(JSON.stringify({ step: 'AWAIT_SUPPORT_MSG' }), user.id).run();
      await bot.answerCallbackQuery(cq.id, 'دستیار هوشمند فعال شد 🤖');
      await bot.sendMessage(chatId, '🤖 دستیار هوشمند پشتیبانی آماده است! سوال یا <b>اسکرین‌شات/عکس</b> خود را بفرستید:');
      return { ok: true };
    }

    if (data === 'tg_instant_ai_trade') {
      await bot.answerCallbackQuery(cq.id, 'در حال بررسی...');
      const res = await runInstantAiAutoTradeForTelegram({ env, user, tgId });
      if (res.needsOnboardingGate) {
        const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
        return { ok: true };
      }
      if (res.needSubscription) {
        await showSubscriptionMenu(env, bot, chatId, user, tgId);
        return { ok: true };
      }
      await bot.sendMessage(chatId, res.text, {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user)),
      });
      return { ok: true };
    }

    if (data === 'tg_bot_toggle') {
      const cfg = await env.DB.prepare('SELECT bot_state, trading_mode FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ bot_state: string; trading_mode: string }>();
      const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
      if (isRunning) {
        await env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`)
          .bind(user.id).run();
        await bot.answerCallbackQuery(cq.id, 'ربات متوقف شد 🔴');
        const stopMsg = '🔴 **ربات دلارینو متوقف شد.** برای شروع مجدد در هر لحظه روی دکمه زیر بزنید:';
        if (msgId) {
          await bot.editMessageText(chatId, msgId, stopMsg, miniAppInlineKeyboard(webAppUrl, '', 'ai', false, getUserUiMode(user))).catch(() => {});
        } else {
          await bot.sendMessage(chatId, stopMsg, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', false, getUserUiMode(user)) });
        }
        return { ok: true };
      }

      const res = await startBotOneClickForTelegram({
        env,
        bot,
        chatId,
        user,
        tgId,
        webAppUrl,
      });
      await bot.answerCallbackQuery(cq.id, res.ok ? 'ربات خودکار روشن شد 🟢' : res.text, !res.ok);
      if (res.needsOnboardingGate) {
        const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
        await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
        return { ok: true };
      }
      if (msgId) {
        await bot.editMessageText(chatId, msgId, res.text, miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user))).catch(() => bot.sendMessage(chatId, res.text));
      } else {
        await bot.sendMessage(chatId, res.text, { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', res.ok, getUserUiMode(user)) });
      }
      return { ok: true };
    }

    if (data === 'tg_positions') {
      const openRows = await env.DB.prepare(
        `SELECT id, symbol, direction, market_type, entry_price, leverage, margin_used, current_stop_loss, tp1 FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 8`
      ).bind(user.id).all<{
        id: string;
        symbol: string;
        direction: 'LONG' | 'SHORT';
        market_type?: string;
        entry_price: string;
        leverage: number;
        margin_used: string;
        current_stop_loss: string;
        tp1: string;
      }>();
      await bot.answerCallbackQuery(cq.id);
      if (!openRows.results.length) {
        await bot.sendMessage(chatId, '📭 در حال حاضر هیچ معامله بازی روی حساب شما نیست.', {
          inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal'),
        });
        return { ok: true };
      }
      const lines = openRows.results.map(
        (t, idx) =>
          `${idx + 1}. ${t.direction === 'LONG' ? '🟢' : '🔴'} ${t.symbol} (${t.market_type || 'FUTURES'} ${t.leverage}x)\n   ورود: ${t.entry_price} | SL: ${t.current_stop_loss} | TP1: ${t.tp1}`
      ).join('\n\n');
      const closeButtons: InlineKeyboardButton[][] = openRows.results.map((t) => [
        { text: `❌ بستن ${t.symbol} (${t.direction})`, callback_data: `close_pos:${t.id}` },
      ]);
      if (webAppUrl.startsWith('https://')) {
        closeButtons.push([{ text: '🚀 مشاهده در مینی‌اپ', web_app: { url: `${webAppUrl}/terminal` } }]);
      }
      await bot.sendMessage(chatId, `📈 معاملات باز فعلی (${openRows.results.length}):\n\n${lines}`, {
        inlineKeyboard: closeButtons,
      });
      return { ok: true };
    }

    if (data.startsWith('close_pos:')) {
      const tradeId = data.slice('close_pos:'.length);
      const t = await env.DB.prepare(
        `SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = 'OPEN'`
      ).bind(tradeId, user.id).first<{
        id: string;
        signal_id?: string | null;
        strategy_key?: string | null;
        mode: string;
        market_type?: 'SPOT' | 'FUTURES';
        symbol: string;
        direction: 'LONG' | 'SHORT';
        leverage: number;
        entry_price: string;
        initial_quantity: string;
        remaining_quantity: string;
        margin_used: string;
        current_stop_loss: string;
        initial_stop_loss?: string;
        tp1: string;
        tp1_hit?: number;
        tp2_hit?: number;
        tp3_hit?: number;
        trailing_active?: number;
        risk_free_active?: number;
        opened_at?: string;
        realized_pnl: string;
      }>();
      if (!t) {
        await bot.answerCallbackQuery(cq.id, 'این معامله قبلاً بسته شده است.', true);
        return { ok: true };
      }
      const { adapter } = await resolveUserExchangeAdapter(env, user.id, t.mode === 'PAPER' ? 'paper' : undefined);
      const cls = await adapter.closePositionPartialOrFull(t.symbol, t.direction, t.remaining_quantity, `tg_cls_${Date.now()}`, t.market_type ?? 'FUTURES');
      const exitPx = Number(cls.filledPrice);
      const entryPx = Number(t.entry_price);
      const qty = Number(t.remaining_quantity);
      const pnl = t.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
      const totalRealized = Number(t.realized_pnl) + pnl - Number(cls.fee);

      if (t.mode === 'PAPER') {
        const cfgRow = await env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ paper_balance: string }>();
        const remMargin = Number(t.margin_used) * (qty / Math.max(1e-9, Number(t.initial_quantity)));
        const nextBal = Number(cfgRow?.paper_balance ?? 0) + remMargin + pnl - Number(cls.fee);
        await env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
          .bind(nextBal.toFixed(2), user.id).run();
      }
      await env.DB.prepare(
        `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'TELEGRAM_MANUAL', closed_at = datetime('now') WHERE id = ?`
      ).bind(cls.filledPrice, totalRealized.toFixed(4), t.id).run();

      const pnlPct = Number(t.margin_used) > 0 ? (totalRealized / Number(t.margin_used)) * 100 : 0;
      await publishSignalClosedCard(env, {
        tradeId: t.id,
        userId: user.id,
        signalId: t.signal_id,
        symbol: t.symbol,
        direction: t.direction,
        leverage: t.leverage ?? 1,
        mode: t.mode === 'LIVE' ? 'LIVE' : 'PAPER',
        strategyKey: t.strategy_key,
        entryPrice: t.entry_price,
        exitPrice: cls.filledPrice,
        stopLoss: t.initial_stop_loss ?? t.current_stop_loss,
        tp1: t.tp1,
        tp1Hit: Boolean(t.tp1_hit || totalRealized > 0),
        tp2Hit: Boolean(t.tp2_hit),
        tp3Hit: Boolean(t.tp3_hit),
        trailingActive: Boolean(t.trailing_active || t.risk_free_active),
        trailingSl: t.current_stop_loss,
        pnlUsd: totalRealized,
        pnlPct,
        reason: 'TELEGRAM_MANUAL',
        openedAt: t.opened_at,
        closedAt: new Date().toISOString(),
      }).catch(() => {});

      await bot.answerCallbackQuery(cq.id, 'معامله بسته شد ✅');
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `✅ معامله ${t.symbol} (${t.direction}) با موفقیت بسته شد!\nخروج: ${cls.filledPrice}\nسود/زیان خالص: ${totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)} USDT`
        );
      }
      return { ok: true };
    }

    if (data === 'set_mkt:SPOT' || data === 'set_mkt:FUTURES') {
      const nextMkt = data.endsWith('SPOT') ? 'SPOT' : 'FUTURES';
      if (nextMkt === 'SPOT') {
        await env.DB.prepare(
          `UPDATE bot_configs SET market_type = 'SPOT', max_leverage = 1, hedge_mode = 0, direction_mode = CASE WHEN direction_mode = 'SHORT_ONLY' THEN 'LONG_ONLY' ELSE direction_mode END WHERE user_id = ?`
        ).bind(user.id).run();
      } else {
        await env.DB.prepare(`UPDATE bot_configs SET market_type = 'FUTURES' WHERE user_id = ?`).bind(user.id).run();
      }
      await bot.answerCallbackQuery(cq.id, `بازار روی ${nextMkt} تنظیم شد`);
      if (msgId) {
        await bot.editMessageText(
          chatId,
          msgId,
          `⚖️ نوع بازار معاملاتی روی ${nextMkt === 'SPOT' ? 'اسپات (Spot · اهرم 1x)' : 'فیوچرز (Futures · اهرم و دوطرفه)'} ذخیره شد.`
        );
      }
      return { ok: true };
    }

    if (data.startsWith('set_dir:') || data === 'toggle_hedge') {
      if (data === 'toggle_hedge') {
        const cfgRow = await env.DB.prepare('SELECT market_type, hedge_mode FROM bot_configs WHERE user_id = ?')
          .bind(user.id).first<{ market_type?: string; hedge_mode?: number }>();
        if (cfgRow?.market_type === 'SPOT') {
          await bot.answerCallbackQuery(cq.id, 'حالت هج فقط در بازار فیوچرز فعال می‌شود.', true);
          return { ok: true };
        }
        const nextHedge = cfgRow?.hedge_mode ? 0 : 1;
        await env.DB.prepare('UPDATE bot_configs SET hedge_mode = ? WHERE user_id = ?').bind(nextHedge, user.id).run();
        await bot.answerCallbackQuery(cq.id, nextHedge ? 'حالت هج هم‌زمان فعال شد 🛡' : 'حالت هج غیرفعال شد');
        if (msgId) {
          await bot.editMessageText(chatId, msgId, `🛡 وضعیت Hedge Mode (لانگ و شورت هم‌زمان): ${nextHedge ? '🟢 فعال' : '⚪️ غیرفعال'}`);
        }
        return { ok: true };
      }
      const nextDir = data.slice('set_dir:'.length);
      const cfgRow = await env.DB.prepare('SELECT market_type FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ market_type?: string }>();
      if (cfgRow?.market_type === 'SPOT' && nextDir === 'SHORT_ONLY') {
        await bot.answerCallbackQuery(cq.id, 'در بازار اسپات امکان معامله Short وجود ندارد.', true);
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET direction_mode = ? WHERE user_id = ?').bind(nextDir, user.id).run();
      await bot.answerCallbackQuery(cq.id, `جهت معاملات: ${nextDir}`);
      if (msgId) {
        await bot.editMessageText(chatId, msgId, `↕️ جهت معاملات ربات روی ${nextDir} تنظیم شد.`);
      }
      return { ok: true };
    }

    if (data === 'tg_ai_chat' || data === 'tg_ai_new') {
      await bot.answerCallbackQuery(cq.id);
      await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl, {
        createNewSession: data === 'tg_ai_new',
        editMsgId: data === 'tg_ai_chat' ? msgId : undefined,
      });
      return { ok: true };
    }

    if (data === 'tg_ai_models') {
      await bot.answerCallbackQuery(cq.id);
      const { models, selectedModelId } = await listSelectableAIModels(env, user.id);
      const kb: InlineKeyboardButton[][] = models.map((m) => [
        {
          text: `${m.id === selectedModelId ? '✅ ' : ''}${m.label}${m.supportsVision ? ' 👁️' : ''}`,
          callback_data: `tg_ai_set_model:${m.id}`,
          style: m.id === selectedModelId ? 'success' : 'primary',
        },
      ]);
      kb.push([{ text: '🔙 بازگشت به چت هوش مصنوعی', callback_data: 'tg_ai_chat' }]);
      const modelTxt =
        `🤖 **انتخاب مدل هوش مصنوعی دلارینو**\n\n` +
        `مدل‌هایی که علامت 👁️ دارند از **تحلیل مستقیم عکس چارت** پشتیبانی می‌کنند.\n` +
        `مدل‌های بیشتر را می‌توانید از پنل مدیریت یا بخش اتصالات وب اضافه کنید:`;
      if (msgId) await bot.editMessageText(chatId, msgId, modelTxt, kb).catch(() => bot.sendMessage(chatId, modelTxt, { inlineKeyboard: kb }));
      else await bot.sendMessage(chatId, modelTxt, { inlineKeyboard: kb });
      return { ok: true };
    }

    if (data.startsWith('tg_ai_set_model:')) {
      const targetId = data.slice('tg_ai_set_model:'.length);
      const { models } = await listSelectableAIModels(env, user.id);
      const chosen = models.find((m) => m.id === targetId);
      if (!chosen) {
        await bot.answerCallbackQuery(cq.id, 'مدل یافت نشد یا غیرفعال شده است.', true);
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET preferred_ai_model_id = ? WHERE id = ?`).bind(chosen.id, user.id).run();
      await bot.answerCallbackQuery(cq.id, `مدل فعال: ${chosen.label}`);
      await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl, { editMsgId: msgId });
      return { ok: true };
    }

    if (data.startsWith('tg_ai_exec_setup:')) {
      const sid = data.slice('tg_ai_exec_setup:'.length);
      const row = await env.DB.prepare(
        `SELECT setup_json FROM ai_chat_messages WHERE session_id = ? AND user_id = ? AND setup_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`
      )
        .bind(sid, user.id)
        .first<{ setup_json: string }>()
        .catch(() => null);
      if (!row?.setup_json) {
        await bot.answerCallbackQuery(cq.id, 'ستاپ قابل اجرا پیدا نشد.', true);
        return { ok: true };
      }
      let setup: ExtractedChartSetup | null = null;
      try {
        setup = JSON.parse(row.setup_json) as ExtractedChartSetup;
      } catch {
        setup = null;
      }
      if (!setup) {
        await bot.answerCallbackQuery(cq.id, 'خطا در خواندن اطلاعات ستاپ.', true);
        return { ok: true };
      }
      const cleanSymbol = setup.symbol.endsWith('USDT') ? setup.symbol : `${setup.symbol.replace(/[^A-Z0-9]/gi, '')}USDT`;
      const sigId = randomId('sig');
      const sigObj = {
        symbol: cleanSymbol,
        direction: setup.direction,
        timeframe: (setup.timeframe as Timeframe) || '15m',
        price: setup.entry,
        stopLoss: setup.stopLoss,
        leverage: Math.min(25, Math.max(1, Number(setup.leverage || 5))),
        tp1: setup.tp1,
        tp2: setup.tp2,
        tp3: setup.tp3,
        engineKey: 'ai_autonomous_agent',
        engineLabel: 'تحلیل چارت AI اختصاصی دلارینو',
      };
      const formatted = formatDollarinoSignal(sigObj);
      await env.DB.prepare(
        `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
         VALUES (?, ?, 'ai_chart_vision', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
      )
        .bind(
          sigId,
          user.id,
          sigObj.symbol,
          sigObj.direction,
          sigObj.timeframe,
          sigObj.price,
          sigObj.stopLoss,
          sigObj.leverage,
          sigObj.tp1,
          sigObj.tp2 ?? null,
          sigObj.tp3 ?? null,
          formatted
        )
        .run();
      await bot.answerCallbackQuery(cq.id, 'ستاپ آماده اجرا شد ⚡');
      await bot.sendMessage(chatId, `🎯 ستاپ چارت به سیگنال استاندارد دلارینو تبدیل شد:\n\n${formatted}`, {
        inlineKeyboard: [[{ text: '👈 دلارینو ترید کن برام 👉', callback_data: `manual_trade:${sigId}`, style: 'success' }]],
      });
      return { ok: true };
    }

    if (data === 'tg_ai_exit') {
      await env.DB.prepare(`UPDATE users SET telegram_state = NULL WHERE id = ?`).bind(user.id).run();
      await bot.answerCallbackQuery(cq.id, 'بازگشت به منوی اصلی');
      await bot.sendMessage(chatId, '🏠 از حالت چت مستقیم خارج شدید. منوی کامل در اختیار شماست:', {
        replyKeyboard: mainMenuKeyboard(webAppUrl, getUserUiMode(user), isUserAdmin(tgId, user.role, ownerId)),
      });
      return { ok: true };
    }

    if (data === 'tg_about') {
      await bot.answerCallbackQuery(cq.id);
      await sendFounderAboutCard(env, bot, chatId, webAppUrl);
      return { ok: true };
    }

    await bot.answerCallbackQuery(cq.id);
    return { ok: true };
  }

  // 2.5 Handle Community Group / Supergroup Moderation & @Bot AI Assistant
  const rawIncomingMsg = update.message || update.edited_message;
  if (rawIncomingMsg && (rawIncomingMsg.chat.type === 'group' || rawIncomingMsg.chat.type === 'supergroup')) {
    return handleTelegramGroupMessage(env, bot, rawIncomingMsg);
  }

  // 3. Handle Normal Private Messages & Menu Navigation
  const msg = update.message;
  const msgBodyText = (msg?.text ?? msg?.caption ?? '').trim();
  const docImgFileId = msg?.document?.mime_type?.startsWith('image/') ? msg.document.file_id : undefined;
  const incomingImageFileId = msg?.photo?.[msg.photo.length - 1]?.file_id || docImgFileId;
  const forwardedChannel =
    msg?.forward_origin?.chat?.type === 'channel'
      ? msg.forward_origin.chat
      : msg?.forward_from_chat?.type === 'channel'
        ? msg.forward_from_chat
        : undefined;
  if (!msg?.from || (!msgBodyText && !incomingImageFileId && !msg.contact && !forwardedChannel)) return { ok: true };

  const text = msgBodyText;
  const chatId = msg.chat.id;
  const tgId = String(msg.from.id);
  const isLinkCommand = text.startsWith('/start LINK-') || text.startsWith('/link ');
  const user = await getOrProvisionTelegramUser(env, msg.from, { allowLinkBypass: isLinkCommand, ownerId });
  if (!user) {
    await bot.sendMessage(
      chatId,
      '⏳ ورود و ثبت‌نام از طریق تلگرام هنوز توسط مدیر سایت فعال نشده است.\nلطفاً پس از فعال‌سازی از پنل مدیریت دوباره تلاش کنید.'
    );
    return { ok: true };
  }
  const superAdmin = isSuperAdminUser(tgId, user.role, ownerId);
  const admin = isUserAdmin(tgId, user.role, ownerId);
  const uiMode = getUserUiMode(user);

  if (admin && forwardedChannel) {
    const fChId = String(forwardedChannel.id);
    const fTitle = forwardedChannel.title || forwardedChannel.username || fChId;
    await bot.sendMessage(
      chatId,
      `📡 کانال **«${fTitle}»** با شناسه \`${fChId}\` شناسایی شد!\nلطفاً مشخص کنید این کانال برای کدام بخش استفاده شود:`,
      {
        inlineKeyboard: [
          [{ text: '📡 ثبت به‌عنوان کانال سیگنال‌ها', callback_data: `adm_bind_ch:signals:${fChId}`, style: 'success' }],
          [{ text: '🏆 ثبت به‌عنوان کانال نتیجه سیگنال‌ها', callback_data: `adm_bind_ch:results:${fChId}`, style: 'primary' }],
          [{ text: '📢 ثبت به‌عنوان کانال اصلی دلارینو', callback_data: `adm_bind_ch:official:${fChId}` }],
        ],
      }
    );
    return { ok: true };
  }

  if (user.is_blocked) {
    await bot.sendMessage(chatId, '⛔️ دسترسی حساب شما موقتاً توسط مدیر محدود شده است.');
    return { ok: true };
  }

  if (privateAdminOnly && !admin) {
    await bot.sendMessage(
      chatId,
      '⛔️ این ربات در حال حاضر در حالت خصوصی است و فقط برای مدیر اصلی و مدیران تاییدشده قابل استفاده می‌باشد.'
    );
    return { ok: true };
  }

  const clearState = () =>
    env.DB.prepare('UPDATE users SET telegram_state = NULL WHERE id = ?').bind(user.id).run();
  const setState = (s: TelegramStepState) =>
    env.DB.prepare('UPDATE users SET telegram_state = ? WHERE id = ?').bind(JSON.stringify(s), user.id).run();

  // 3A. Handle Native Telegram Contact Sharing (Mandatory Phone KYC)
  if (msg.contact) {
    if (!msg.contact.user_id || String(msg.contact.user_id) !== tgId) {
      await bot.sendMessage(
        chatId,
        `⛔️ لطفاً فقط شماره تماس **اکانت تلگرام خودتان** را از طریق دکمه‌ی زیر به اشتراک بگذارید (ارسال یا فوروارد شماره افراد دیگر پذیرفته نمی‌شود).`,
        { replyKeyboard: contactVerificationKeyboard() }
      );
      return { ok: true };
    }
    const normalizedPhone = normalizePhoneNumber(msg.contact.phone_number);
    let pendingStartArg: string | undefined;
    if (user.telegram_state) {
      try {
        const st = JSON.parse(user.telegram_state) as TelegramStepState;
        if (st.pendingStartArg) pendingStartArg = st.pendingStartArg;
      } catch { /* ignore */ }
    }
    await env.DB.prepare(
      `UPDATE users
       SET phone_number = ?, phone_verified = 1, phone_verified_at = datetime('now'), telegram_state = NULL
       WHERE id = ?`
    ).bind(normalizedPhone, user.id).run();
    user.phone_number = normalizedPhone;
    user.phone_verified = 1;

    await applyReferralIfPresent(env, user.id, pendingStartArg, normalizedPhone);

    await bot.sendMessage(
      chatId,
      `✅ احراز هویت شماره تماس شما با موفقیت انجام شد (${normalizedPhone})!\nحساب شما با مشخصات تلگرام خودتان ساخته و فعال گردید.`
    );

    if (pendingStartArg && pendingStartArg.toUpperCase().startsWith('LINK-')) {
      const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, pendingStartArg);
      await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }

    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
    await bot.sendMessage(chatId, gatePrompt.text, {
      inlineKeyboard: gatePrompt.inlineKeyboard,
    });
    await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
    return { ok: true };
  }

  // 3B. Mandatory Pre-Auth Landing & Phone-KYC Gate (Never show bot menus before account verification!)
  if (await isPhoneKycRequiredForUser(env, user, tgId, ownerId)) {
    const startArg = text.startsWith('/start ') ? text.slice(7).trim() : undefined;
    await sendPreAuthIntro(env, bot, chatId, user, msg.from.first_name ?? user.username, startArg);
    return { ok: true };
  }

  // Deep-link `/start PAYLOAD` (e.g. `/start LINK-XXXXXX`, `/start sig_<id>`, `/start exec_<id>`, `/start web_auth`)
  if (text.startsWith('/start ')) {
    await clearState();
    const payload = text.slice(7).trim();
    if (payload.toUpperCase().startsWith('LINK-')) {
      const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, payload);
      await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
      return { ok: true };
    }
    if (payload.startsWith('sig_') || payload.startsWith('exec_') || payload.startsWith('open_')) {
      const sigId = payload.replace(/^(sig_|exec_|open_)/, '').trim();
      const sigRow = await env.DB.prepare(`SELECT * FROM signals WHERE id = ? LIMIT 1`).bind(sigId).first<{
        id: string;
        symbol: string;
        direction: 'LONG' | 'SHORT';
        timeframe: string;
        price: string;
        stop_loss: string;
        leverage: number;
        tp1: string;
        tp2: string | null;
        tp3: string | null;
        engine_label: string | null;
        raw_text: string;
      }>();
      if (!sigRow) {
        await bot.sendMessage(chatId, '⚠️ سیگنال درخواستی یافت نشد یا منقضی شده است.', {
          replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
        });
        return { ok: true };
      }
      const formatted = sigRow.raw_text || formatDollarinoSignal({
        symbol: sigRow.symbol,
        direction: sigRow.direction,
        timeframe: sigRow.timeframe,
        price: sigRow.price,
        stopLoss: sigRow.stop_loss,
        leverage: sigRow.leverage,
        tp1: sigRow.tp1,
        tp2: sigRow.tp2 ?? undefined,
        tp3: sigRow.tp3 ?? undefined,
        engineLabel: sigRow.engine_label ?? undefined,
      });
      await bot.sendMessage(chatId, formatted, {
        inlineKeyboard: payload.startsWith('exec_')
          ? [
              [
                { text: 'تایید میکنم و معامله کن ✅', callback_data: `confirm_trade:${sigRow.id}`, style: 'success' },
                { text: 'انصراف ❌', callback_data: `cancel_trade:${sigRow.id}`, style: 'danger' },
              ],
            ]
          : [
              [
                { text: 'دلارینو ترید کن برام 🤖', callback_data: `manual_trade:${sigRow.id}`, style: 'success' },
                { text: 'تایید و اجرای فوری ✅', callback_data: `manual_confirm:${sigRow.id}`, style: 'primary' },
              ],
            ],
      });
      return { ok: true };
    }
    if (payload.toUpperCase().startsWith('REF_') || payload.toUpperCase().startsWith('DLR')) {
      await applyReferralIfPresent(env, user.id, payload, user.phone_number);
      await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
      });
      await bot.sendMessage(chatId, '🎁 شما از طریق لینک دعوت دوستتان وارد شدید! با شروع ترید روی Trust Wallet، پاداش دعوت به صورت خودکار محاسبه می‌شود.', {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
      });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }
    if (payload === 'web_auth' || payload.toLowerCase().startsWith('web_auth__')) {
      await applyReferralIfPresent(env, user.id, payload, user.phone_number);
      await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
      });
      await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
      return { ok: true };
    }
    await applyReferralIfPresent(env, user.id, payload || null, user.phone_number);
  }

  if (text === '/start' || text === '/menu' || text === 'بازگشت به صفحه قبل 🔙' || text === '🏠 پنل ساده من') {
    await applyReferralIfPresent(env, user.id, null, user.phone_number);
    await clearState();
    const cfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?').bind(user.id).first<{ bot_state: string }>();
    const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    if (text === '🏠 پنل ساده من') {
      await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl);
      return { ok: true };
    }
    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, uiMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    if (uiMode === 'simple') {
      await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl);
    } else {
      await bot.sendMessage(chatId, '🎛 کنترل سریع ربات:', {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', isRunning, uiMode),
      });
    }
    return { ok: true };
  }

  if (text === '/weblogin') {
    await sendWebMagicLoginLink(env, bot, chatId, user.id, webAppUrl);
    return { ok: true };
  }

  if (text === '/wizard') {
    await clearState();
    await showSimpleWizardStep(bot, chatId, 1);
    return { ok: true };
  }

  if (text === '/app' || text === '🚀 مینی‌اپ دلارینو') {
    await bot.sendMessage(chatId, '📱 برای ورود مستقیم و بدون نیاز به لاگین به مینی‌اپ دلارینو روی دکمه زیر بزنید:', {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
    });
    return { ok: true };
  }

  if (text.startsWith('/link ')) {
    const linkRes = await applyLinkCodeForUser(env, user.id, msg.from, text.slice(6));
    await bot.sendMessage(chatId, linkRes.message, { replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin) });
    return { ok: true };
  }

  const SLASH_OVERRIDE = new Set([
    '/card',
    '/copy',
    '/support',
    '/positions',
    '/balance',
    '/settings',
    '/help',
    '/menu',
    '/dex',
    '/wallet',
    '/wizard',
    '/myai',
    '/weblogin',
    '/ai',
    '/chat',
    '/about',
  ]);
  const MAIN_MENU_PREFIXES = [
    '🏠 پنل ساده من',
    '🎛 ۵ موتور ترید',
    '💼 دمو / واقعی و بودجه',
    '📊 معاملات و تراز ۵ بخش',
    '🛡 Trust Wallet',
    '🛠 ابزارها و پشتیبانی',
    '🧠 چت هوش مصنوعی',
    '🧠 هوش مصنوعی من',
    '🤖 شروع ربات هوشمند AI',
    '🤖 شروع / توقف ربات',
    '🤖 هوش مصنوعی من',
    '🎛 انتخاب ۵ موتور ترید',
    '🎛 ۵ موتور ترید همزمان',
    '💰 بودجه مجاز و',
    '💰 حالت دمو/واقعی و بودجه',
    '📊 وضعیت سود و معاملات',
    '📊 معاملات باز و پورتفوی',
    '🟢 شروع خودکار ربات',
    '🟢 شروع / توقف ربات',
    '⚡️ شکار فوری AI',
    '🚀 راه‌اندازی ۴ مرحله‌ای ربات',
    '🛡 اتصال Trust Wallet',
    '🛡 مدیریت Trust Wallet',
    '🛡 Trust Wallet و کارمزد ۳٪',
    '📡 آلرت رایگان TradingView',
    '💰 کارمزد ۳٪ سود',
    '💰 کارمزد ۵٪ سود',
    'ربات و هوش مصنوعی من',
    '🏆 کپی‌ترید',
    'حساب کاربری 👤',
    '⚡ رفتن به حالت حرفه‌ای',
    '⚡ حالت حرفه‌ای',
    '🌱 رفتن به حالت ساده',
    '🔍 رادار DexScreener',
    '🔍 رادار DEX',
    '🔍 اسکنر DEX',
    'تنظیمات ⚙️',
    '📈 معاملات باز',
    '🎯 استراتژی شکار',
    '🎯 اسنایپر و استراتژی',
    '🧩 اکستنشن',
    '💬 پشتیبانی',
    'راهنما 📚',
    '👨‍💻 درباره سازنده',
    '👨‍💻 سازنده و ضدپانزی',
    'بازگشت به صفحه قبل 🔙',
    'پنل مدیریت 💼',
  ];
  const isMenuButtonTap =
    SLASH_OVERRIDE.has(text) ||
    text.startsWith('/') ||
    MAIN_MENU_PREFIXES.some((btn) => text.startsWith(btn.slice(0, 8)));

  if (SLASH_OVERRIDE.has(text) && user.telegram_state) {
    await clearState();
    user.telegram_state = null;
  }

  // Handle Multi-Step Flows
  if (user.telegram_state) {
    const state = JSON.parse(user.telegram_state) as TelegramStepState;

    if (admin && state.step.startsWith('ADM_')) {
      const handled = await handleAdminStepInput(
        env,
        bot,
        buildAdminActor(user, tgId, ownerId),
        chatId,
        state as AdminStepState,
        text,
        incomingImageFileId
      );
      if (handled) return { ok: true };
    }

    if (state.step === 'AWAIT_AI_CHAT') {
      if (isMenuButtonTap) {
        await clearState();
      } else {
        await handleTelegramAIChatTurn({
          env,
          bot,
          chatId,
          user,
          webAppUrl,
          text,
          imageFileId: incomingImageFileId,
          sessionId: state.activeAiSessionId,
        });
        return { ok: true };
      }
    }

    if (state.step === 'AWAIT_BOT_BUDGET') {
      const amt = Number(text.replace(/[,$\s]/g, ''));
      if (!Number.isFinite(amt) || amt < 0) {
        await bot.sendMessage(chatId, '❌ لطفاً مبلغ معتبر به دلار بفرستید (مثلاً 100 یا عدد 0 برای کل موجودی):');
        return { ok: true };
      }
      if (amt === 0) {
        await env.DB.prepare(`UPDATE bot_configs SET bot_budget_mode = 'FULL_BALANCE', bot_budget_usd = 0 WHERE user_id = ?`).bind(user.id).run();
        await clearState();
        await bot.sendMessage(chatId, '✅ بودجه مجاز ربات روی کل موجودی کیف‌پول تنظیم شد.');
      } else {
        const clamped = Math.max(10, Math.min(10_000_000, amt));
        await env.DB.prepare(`UPDATE bot_configs SET bot_budget_mode = 'FIXED_USD', bot_budget_usd = ? WHERE user_id = ?`).bind(clamped, user.id).run();
        await clearState();
        await bot.sendMessage(chatId, `✅ سقف کل سرمایه مجاز ربات روی $${clamped.toLocaleString('en-US')} قفل شد.`);
      }
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
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
      await bot.sendMessage(chatId, `✅ درصد مارجین هر معامله روی ${pct}% تنظیم شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_MAX_LEV') {
      const lev = Math.round(Number(text));
      if (!Number.isFinite(lev) || lev < 1 || lev > 125) {
        await bot.sendMessage(chatId, '❌ لطفاً عددی بین 1 تا 125 وارد کنید:');
        return { ok: true };
      }
      await env.DB.prepare('UPDATE bot_configs SET max_leverage = ? WHERE user_id = ?').bind(lev, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ حداکثر لوریج مجاز روی ${lev}x تنظیم شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_SIGNAL_CHANNEL') {
      const ch = text.trim().startsWith('@') || text.trim().startsWith('-100') ? text.trim() : `@${text.trim()}`;
      await env.DB.prepare('UPDATE bot_configs SET signal_channel_handle = ? WHERE user_id = ?').bind(ch, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ کانال سیگنال متصل روی ${ch} ذخیره شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TP_CUSTOM') {
      const nums = text.trim().split(/[\s,/]+/).map(Number);
      if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n) || n < 0) || Math.round(nums[0]! + nums[1]! + nums[2]!) !== 100) {
        await bot.sendMessage(chatId, '❌ لطفاً ۳ عدد که مجموعشان 100 شود بفرستید (مثلاً: 50 25 25):');
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE bot_configs SET tp1_close_pct = ?, tp2_close_pct = ?, tp3_close_pct = ? WHERE user_id = ?`)
        .bind(nums[0]!, nums[1]!, nums[2]!, user.id).run();
      await clearState();
      await bot.sendMessage(chatId, `✅ تقسیم تارگت‌ها روی ${nums[0]}% / ${nums[1]}% / ${nums[2]}% ذخیره شد.`);
      await showTradeQuantitiesMenu(env, bot, chatId, user.id);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TOPUP_AMOUNT') {
      const amt = Number(text);
      await clearState();
      if (!Number.isFinite(amt) || amt < 5) {
        await bot.sendMessage(chatId, '❌ حداقل مبلغ شارژ کیف پول 5 USDT است.');
        return { ok: true };
      }
      const [rawWalletAddr, rateStr] = await Promise.all([
        getSystemSetting(env.DB, 'usdt_trc20_wallet', ''),
        getSystemSetting(env.DB, 'usdt_to_toman_rate', '70000'),
      ]);
      const walletAddr = rawWalletAddr && !rawWalletAddr.includes('YourTRC20WalletAddress') ? rawWalletAddr : '';
      const subId = randomId('top');
      await env.DB.prepare(
        `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, amount_usd, payer_note)
         VALUES (?, ?, 'wallet_charge', 'PENDING_REVIEW', 'USDT_TRC20', ?, 'Wallet Top-Up')`
      ).bind(subId, user.id, amt).run();
      await bot.sendMessage(
        chatId,
        `💰 فاکتور شارژ کیف پول #${subId}\n\n💵 مبلغ: ${amt} USDT (${formatToman(amt, Number(rateStr) || 70000)} تومان)\n` +
          (walletAddr ? `💳 آدرس TRC20:\n${walletAddr}` : '⚠️ آدرس TRC20 هنوز توسط مدیر تنظیم نشده است.') +
          `\n\nپس از انتقال روی دکمه زیر بزنید:`,
        {
          inlineKeyboard: [
            [
              { text: '✅ بررسی پرداخت / ثبت TXID', callback_data: `sub_verify:${subId}` },
              { text: '❌ انصراف', callback_data: `sub_cancel:${subId}` },
            ],
          ],
        }
      );
      return { ok: true };
    }

    if (state.step === 'AWAIT_PAYMENT_TXID' && state.subId) {
      let txid = text.trim();
      let receiptDataUrl: string | null = null;
      if (incomingImageFileId) {
        try {
          const dl = await bot.downloadFileAsDataUrl(incomingImageFileId, 3_500_000);
          receiptDataUrl = dl.dataUrl;
          if (!txid) txid = `TG-RECEIPT-${state.subId.slice(-6).toUpperCase()}`;
        } catch (imgErr) {
          await bot.sendMessage(chatId, `⚠️ خطا در دریافت عکس رسید: ${imgErr instanceof Error ? imgErr.message : 'لطفاً دوباره بفرستید یا کد پیگیری را تایپ کنید.'}`);
          return { ok: true };
        }
      }
      if (!txid && !receiptDataUrl) {
        await bot.sendMessage(chatId, 'لطفاً عکس رسید یا کد پیگیری / TXID را ارسال کنید:');
        return { ok: true };
      }
      await clearState();
      await env.DB.prepare(`UPDATE user_subscriptions SET payment_reference = ?, receipt_image_url = COALESCE(?, receipt_image_url) WHERE id = ? AND user_id = ?`)
        .bind(txid.slice(0, 140), receiptDataUrl, state.subId, user.id).run();
      const sub = await env.DB.prepare(`SELECT plan_code, amount_usd FROM user_subscriptions WHERE id = ?`).bind(state.subId).first<{ plan_code: string; amount_usd: number }>();
      const alertText = `🔔 ثبت پرداخت جدید!\n\n👤 کاربر: ${user.username} (${tgId})\n🧾 سفارش: #${state.subId}\n📦 پلن: ${sub?.plan_code ?? '—'} | 💵 ${sub?.amount_usd ?? 0} USDT\n🔗 کد/TXID: ${txid}${receiptDataUrl ? '\n📸 به همراه عکس رسید' : ''}`;
      const reviewMarkup = {
        inlineKeyboard: [
          [
            { text: '✅ تایید فوری', callback_data: `adm:tx_approve:${state.subId}` },
            { text: '❌ رد', callback_data: `adm:tx_reject:${state.subId}` },
          ],
        ],
      };
      if (receiptDataUrl) {
        await notifyAllAdminsPhoto(env, receiptDataUrl, alertText, reviewMarkup).catch(() => {});
      } else {
        await notifyAllAdmins(env, alertText, reviewMarkup).catch(() => {});
      }
      await bot.sendMessage(
        chatId,
        `✅ ${receiptDataUrl ? 'عکس رسید واریز' : `کد پیگیری (${txid})`} برای فاکتور #${state.subId} ثبت و برای تایید آنی ارسال شد! به محض تایید پیام فعال‌سازی دریافت می‌کنید.`
      );
      return { ok: true };
    }

    if (state.step === 'AWAIT_MYAI_TEACH') {
      await clearState();
      let ag = await env.DB.prepare(`SELECT system_rules_json, training_notes FROM user_ai_agents WHERE user_id = ?`).bind(user.id).first<{ system_rules_json: string; training_notes: string }>().catch(() => null);
      if (!ag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
          .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES)).run();
        ag = { system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), training_notes: '' };
      }
      let cur: TrainedAIRules = DEFAULT_TRAINED_RULES;
      try { cur = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') }; } catch { /* default */ }
      const { next, learnedHighlights } = extractRulesFromConversation(text, cur);
      const nextNotes = `${ag.training_notes ? `${ag.training_notes}\n` : ''}• ${text}`.slice(-4000);
      await env.DB.prepare(
        `UPDATE user_ai_agents SET training_notes = ?, system_rules_json = ?, last_trained_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?`
      ).bind(nextNotes, JSON.stringify(next), user.id).run();
      await env.DB.prepare(`INSERT INTO user_ai_messages (id, user_id, role, content) VALUES (?, ?, 'user', ?)`).bind(randomId('msg'), user.id, text).run();
      const reply = learnedHighlights.length
        ? `✅ این موارد را یاد گرفتم و ثبت کردم:\n• ${learnedHighlights.join('\n• ')}\n\nتایم‌فریم: ${next.timeframe} | ارزها: ${next.symbols.join('، ')} | SL ${next.stopLossPct}% / TP ${next.takeProfitPct}%`
        : `🧠 دستورالعمل شما ثبت شد! تایم‌فریم فعلی: ${next.timeframe} | ارزها: ${next.symbols.join('، ')}`;
      await env.DB.prepare(`INSERT INTO user_ai_messages (id, user_id, role, content, extracted_rules_json) VALUES (?, ?, 'assistant', ?, ?)`).bind(randomId('msg'), user.id, reply, JSON.stringify(next)).run();
      await bot.sendMessage(chatId, reply, {
        inlineKeyboard: [
          [{ text: '✍️ آموزش بیشتر', callback_data: 'tg_myai_train', style: 'primary' }],
          [{ text: '🚀 فعال‌سازی ترید با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        ],
      });
      return { ok: true };
    }

    if (state.step === 'AWAIT_SUPPORT_MSG') {
      if (isMenuButtonTap) {
        await clearState();
      } else {
        let supportImgDataUrl: string | null = null;
        if (incomingImageFileId) {
          try {
            const dl = await bot.downloadFileAsDataUrl(incomingImageFileId, 3_500_000);
            supportImgDataUrl = dl.dataUrl;
          } catch {
            // fallback to text if image fetch fails
          }
        }
        const supportMsgText = text.trim() || (supportImgDataUrl ? '📷 تصویر پیوست‌شده در پشتیبانی' : '');
        if (!supportMsgText) return { ok: true };

        let tkt = await env.DB.prepare(
          `SELECT id, COALESCE(support_mode, 'AI_ASSISTANT') as support_mode FROM support_tickets WHERE user_id = ? AND status != 'CLOSED' ORDER BY last_message_at DESC LIMIT 1`
        ).bind(user.id).first<{ id: string; support_mode: string }>();
      const ticketId = tkt?.id || randomId('tkt');
      const supportMode = tkt?.support_mode || 'AI_ASSISTANT';
      if (!tkt) {
        await env.DB.prepare(
          `INSERT INTO support_tickets (id, user_id, subject, status, channel, support_mode) VALUES (?, ?, 'پشتیبانی تلگرام', 'OPEN', 'TELEGRAM', 'AI_ASSISTANT')`
        ).bind(ticketId, user.id).run();
      }
      await env.DB.prepare(`INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message, image_data_url) VALUES (?, ?, ?, 'user', ?, ?, ?)`)
        .bind(randomId('smsg'), ticketId, user.id, user.username, supportMsgText.slice(0, 2000), supportImgDataUrl).run();

      if (supportMode === 'HUMAN_ADMIN') {
        await clearState();
        await env.DB.prepare(`UPDATE support_tickets SET status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`).bind(ticketId).run();
        const adminCaption = `💬 پیام پشتیبانی جدید از ربات (گفتگوی مستقیم با مدیران):\n👤 ${user.username} (${tgId})\nتیکت: #${ticketId}\n\n${supportMsgText}`;
        const adminMarkup = {
          inlineKeyboard: [[{ text: '✍️ پاسخ فوری به کاربر', callback_data: `adm:sup_reply:${ticketId}`, style: 'primary' as const }]],
        };
        if (supportImgDataUrl) {
          await notifyAllAdminsPhoto(env, supportImgDataUrl, adminCaption, adminMarkup).catch(() => {});
        } else {
          await notifyAllAdmins(env, adminCaption, adminMarkup).catch(() => {});
        }
        await bot.sendMessage(
          chatId,
          `✅ پیام شما به تیکت #${ticketId} برای مدیران پشتیبانی ارسال شد و به‌زودی همین‌جا پاسخ می‌گیرید.\n\n${ANTI_SCAM_WARNING_FA}`,
          {
            replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
            inlineKeyboard: [[{ text: '🤖 بازگشت به پاسخگویی فوری هوش مصنوعی', callback_data: 'tg_support_ai' }]],
          }
        );
        return { ok: true };
      }

      // AI Support Auto-Answer mode — keeps AWAIT_SUPPORT_MSG active for continuous AI chat
      const aiRes = await generateSupportAIReply(env, {
        userId: user.id,
        username: user.username || tgId,
        question: supportImgDataUrl ? `${supportMsgText}\n[کاربر تصویر اسکرین‌شات ارسال کرده است؛ در صورت نیاز به بررسی دستی مدیر، یادآوری کن دکمه گفتگو با مدیران انسانی را بزند.]` : supportMsgText,
      });
      await env.DB.prepare(`INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message) VALUES (?, ?, ?, 'ai', ?, ?)`)
        .bind(randomId('smsg'), ticketId, user.id, `دستیار هوشمند (${aiRes.usedModel})`, aiRes.reply).run();
      await env.DB.prepare(`UPDATE support_tickets SET status = 'OPEN', last_message_at = datetime('now') WHERE id = ?`).bind(ticketId).run();

        await bot.sendMessage(
          chatId,
          `🤖 **پاسخ دستیار هوشمند دلارینو:**\n\n${aiRes.reply}\n\n—\nمی‌توانید سوال یا تصویر بعدی خود را همین‌جا بپرسید یا با دکمه زیر مستقیماً با مدیران صحبت کنید.`,
          {
            inlineKeyboard: [
              [{ text: '👨‍💼 سوال من حل نشد / گفتگو با مدیران انسانی', callback_data: `tg_support_human:${ticketId}`, style: 'primary' }],
            ],
          }
        );
        return { ok: true };
      }
    }

    if (state.step === 'AWAIT_TW_EVM') {
      const addr = text.trim();
      if (!isValidEvm(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس EVM نامعتبر است! آدرس شبکه BSC/ETH باید با `0x` شروع شده و ۴۲ کاراکتر هگز باشد:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_address = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_address = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس EVM تراست‌ولت شما ثبت و تایید شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_TRON') {
      const addr = text.trim();
      if (!isValidTron(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس TRON نامعتبر است! آدرس TRC20 باید با `T` شروع شده و ۳۴ کاراکتر باشد:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_tron = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_tron = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس TRON (TRC20) تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_SOLANA') {
      const addr = text.trim();
      if (!isValidSolana(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس Solana نامعتبر است! لطفاً آدرس معتبر SPL ارسال کنید:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_solana = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_solana = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس Solana تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl);
      return { ok: true };
    }

    if (state.step === 'AWAIT_TW_TON') {
      const addr = text.trim();
      if (!isValidTon(addr)) {
        await bot.sendMessage(chatId, '❌ فرمت آدرس TON نامعتبر است! آدرس باید با `EQ` یا `UQ` شروع شود:');
        return { ok: true };
      }
      await env.DB.prepare(
        `UPDATE users SET trust_wallet_ton = ?, trust_wallet_verified = 1, trust_wallet_connected_at = datetime('now') WHERE id = ?`
      ).bind(addr, user.id).run();
      user.trust_wallet_ton = addr;
      await clearState();
      await bot.sendMessage(chatId, `✅ آدرس TON تراست‌ولت شما ثبت شد:\n\`${addr}\``, {
        replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode),
      });
      await showTrustWalletMenu(env, bot, chatId, user, webAppUrl, undefined, true);
      return { ok: true };
    }

    if (state.step === 'AWAIT_DEX_SEARCH') {
      const q = text.trim();
      await clearState();
      const results = await searchDexPairs(q).catch(() => []);
      await showDexTrendingMenu(bot, chatId, results, q);
      return { ok: true };
    }

    if (state.step === 'AWAIT_GIFT_CODE') {
      const code = text.trim().toUpperCase();
      await clearState();
      const gift = await env.DB.prepare(`SELECT * FROM gift_codes WHERE code = ? AND is_active = 1`).bind(code).first<{
        code: string;
        code_type?: string;
        plan_code: string;
        duration_days: number;
        credit_usdt?: number;
        max_uses: number;
        uses_count: number;
        expires_at: string | null;
      }>();
      if (!gift) {
        await bot.sendMessage(chatId, '❌ کد هدیه نامعتبر یا غیرفعال است.');
        return { ok: true };
      }
      if (gift.uses_count >= gift.max_uses || (gift.expires_at && Date.parse(gift.expires_at) < Date.now())) {
        await bot.sendMessage(chatId, '⏰ ظرفیت یا مهلت استفاده از این کد هدیه به پایان رسیده است.');
        return { ok: true };
      }
      const already = await env.DB.prepare(`SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?`).bind(code, user.id).first();
      if (already) {
        await bot.sendMessage(chatId, '⚠️ شما قبلاً از این کد هدیه استفاده کرده‌اید.');
        return { ok: true };
      }
      await env.DB.prepare(`INSERT INTO gift_redemptions (id, code, user_id) VALUES (?, ?, ?)`).bind(randomId('red'), code, user.id).run();
      await env.DB.prepare(`UPDATE gift_codes SET uses_count = uses_count + 1 WHERE code = ?`).bind(code).run();

      if (gift.code_type === 'WALLET' && (gift.credit_usdt ?? 0) > 0) {
        await env.DB.prepare(
          `UPDATE users SET fee_prepaid_credit_usd = COALESCE(fee_prepaid_credit_usd, 0) + ?, wallet_balance_usdt = COALESCE(wallet_balance_usdt, 0) + ? WHERE id = ?`
        ).bind(gift.credit_usdt, gift.credit_usdt, user.id).run();
        await bot.sendMessage(chatId, `🎉 کد هدیه ${code} اعمال شد و مبلغ $${gift.credit_usdt} به اعتبار کارمزد ۳٪ سود شما اضافه گردید!`);
      } else {
        await env.DB.prepare(`UPDATE users SET fee_prepaid_credit_usd = COALESCE(fee_prepaid_credit_usd, 0) + 2 WHERE id = ?`).bind(user.id).run().catch(() => {});
        await bot.sendMessage(chatId, `🎉 کد هدیه ${code} اعمال شد و $۲.۰۰ اعتبار کارمزد رایگان به حساب شما اضافه گردید!`);
      }
      return { ok: true };
    }

    if (state.step === 'AWAIT_ADD_ADMIN' && superAdmin) {
      const targetTg = text.replace(/[^0-9]/g, '');
      await clearState();
      if (!targetTg) {
        await bot.sendMessage(chatId, '❌ آیدی عددی تلگرام نامعتبر است.', { replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode) });
        return { ok: true };
      }
      const existingTarget = await env.DB.prepare('SELECT id, username FROM users WHERE telegram_id = ?').bind(targetTg).first<{ id: string; username: string }>();
      if (!existingTarget) {
        await bot.sendMessage(chatId, `⚠️ کاربر با آیدی ${targetTg} هنوز ربات را استارت نزده است. ابتدا یک بار /start بزند.`, {
          replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
        });
        return { ok: true };
      }
      await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ? AND role != 'owner'`).bind(existingTarget.id).run();
      await bot.sendMessage(chatId, `✅ کاربر ${existingTarget.username} (${targetTg}) با موفقیت به لیست مدیران اضافه شد.`, {
        replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
      });
      return { ok: true };
    }
  }

  // Main Menu Handlers
  if (text === '🚀 راه‌اندازی ۴ مرحله‌ای ربات') {
    await showSimpleWizardStep(bot, chatId, 1);
    return { ok: true };
  }

  if (text === '⚡ رفتن به حالت حرفه‌ای' || text === '⚡ حالت حرفه‌ای' || text === '🌱 رفتن به حالت ساده') {
    const nextMode: 'simple' | 'pro' = text.includes('حرفه‌ای') ? 'pro' : 'simple';
    await env.DB.prepare(`UPDATE users SET ui_mode = ? WHERE id = ?`).bind(nextMode, user.id).run();
    user.ui_mode = nextMode;
    await bot.sendMessage(chatId, welcomeMessage(msg.from.first_name ?? user.username, nextMode, webAppUrl), {
      replyKeyboard: mainMenuKeyboard(webAppUrl, nextMode, admin),
    });
    if (nextMode === 'simple') {
      await showSimpleSiteHome(env, bot, chatId, user, tgId, webAppUrl);
    }
    return { ok: true };
  }

  if (text === '🛠 ابزارها و پشتیبانی') {
    await clearState();
    await showSimpleMoreToolsSheet(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text.startsWith('🦊 کیف‌پول Trust Wallet') || text === '🦊 Trust Wallet و DEX' || text === '/wallet') {
    await showTrustWalletMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '/myai' || text === '🤖 هوش مصنوعی من') {
    let ag = await env.DB.prepare(`SELECT name, system_rules_json, is_active_for_trading FROM user_ai_agents WHERE user_id = ?`)
      .bind(user.id)
      .first<{ name: string; system_rules_json: string; is_active_for_trading: number }>()
      .catch(() => null);
    if (!ag) {
      await env.DB.prepare(`INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, system_rules_json) VALUES (?, ?, 'هوش مصنوعی شخصی من', ?)`)
        .bind(randomId('myai'), user.id, JSON.stringify(DEFAULT_TRAINED_RULES))
        .run();
      ag = { name: 'هوش مصنوعی شخصی من', system_rules_json: JSON.stringify(DEFAULT_TRAINED_RULES), is_active_for_trading: 0 };
    }
    let rules: TrainedAIRules = DEFAULT_TRAINED_RULES;
    try {
      rules = { ...DEFAULT_TRAINED_RULES, ...JSON.parse(ag.system_rules_json || '{}') };
    } catch { /* default */ }
    await bot.sendMessage(
      chatId,
      `🧠 **${ag.name}** (${ag.is_active_for_trading ? '🟢 فعال روی ربات' : '⚪️ آماده آموزش'})\n\n` +
        `• تایم‌فریم: ${rules.timeframe} | سبک: ${rules.style}\n` +
        `• ارزها: ${rules.symbols.join('، ')}\n` +
        `• SL ${rules.stopLossPct}% / TP ${rules.takeProfitPct}% | اهرم ${rules.maxLeverage}x`,
      {
        inlineKeyboard: [
          [{ text: '✍️ آموزش جدید به هوش مصنوعی من', callback_data: 'tg_myai_train', style: 'primary' }],
          [{ text: '🚀 فعال‌سازی ترید خودکار با هوش مصنوعی من', callback_data: 'tg_myai_activate', style: 'success' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '🧠 هوش مصنوعی من / چت AI') {
    await clearState();
    await bot.sendMessage(
      chatId,
      `🧠 **مرکز هوش مصنوعی دلارینو**\n\nچت هوش مصنوعی (همراه با تحلیل عکس چارت) یا آموزش مستقیم «هوش مصنوعی شخصی من» را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '💬 شروع چت AI + تحلیل عکس چارت', callback_data: 'tg_ai_chat', style: 'primary' },
            { text: '🤖 هوش مصنوعی شخصی من', callback_data: 'tg_myai', style: 'success' },
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '🔍 رادار DexScreener و توکن داغ' || text === '🔍 رادار DEX & خرید مستقیم' || text === '🔍 اسکنر DEX' || text === '/dex') {
    await showDexTrendingMenu(bot, chatId);
    return { ok: true };
  }

  if (text === '🧩 اکستنشن و ویجت موبایل' || text === '🧩 اکستنشن کروم V11.7' || text === '🧩 اکستنشن کروم V11.6' || text === '🧩 اکستنشن کروم/فایرفاکس/اج') {
    await showExtensionWidgetsMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (
    text === '🛡 Trust Wallet' ||
    text === '🛡 اتصال Trust Wallet' ||
    text === '🛡 اتصال Trust Wallet و دمو' ||
    text === '🛡 مدیریت Trust Wallet' ||
    text === '🛡 اتصال Trust Wallet (تراست‌ولت)' ||
    text === '🛡 Trust Wallet و کارمزد ۳٪' ||
    text === '🦊 Trust Wallet و DEX' ||
    text === '🦊 کیف‌پول Trust Wallet' ||
    text === '/wallet'
  ) {
    if (text === '🛡 Trust Wallet') {
      await showTrustWalletPlaybookTelegram(env, bot, chatId, user, 'FUTURES');
      return { ok: true };
    }
    await showTrustWalletMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '🎛 ۵ موتور ترید' || text === '🎛 انتخاب ۵ موتور ترید' || text === '🎛 ۵ موتور ترید همزمان' || text === '/engines') {
    await clearState();
    await showEnginesToggleMenu(env, bot, chatId, user.id);
    return { ok: true };
  }

  if (text === '💼 دمو / واقعی و بودجه' || text === '💰 بودجه مجاز و پیشنهاد پویا' || text === '💰 بودجه مجاز و اهرم' || text === '💰 حالت دمو/واقعی و بودجه' || text === '/budget') {
    await clearState();
    if (text === '💼 دمو / واقعی و بودجه') {
      await showSimpleWalletAndBudgetSheet(env, bot, chatId, user);
      return { ok: true };
    }
    await showTradeQuantitiesMenu(env, bot, chatId, user.id);
    return { ok: true };
  }

  if (text === '🤖 شروع ربات هوشمند AI' || text === '🤖 شروع / توقف ربات') {
    await clearState();
    if (text === '🤖 شروع / توقف ربات') {
      const curCfg = await env.DB.prepare('SELECT bot_state FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ bot_state: string }>();
      const isAlreadyRunning = curCfg?.bot_state === 'RUNNING_PAPER' || curCfg?.bot_state === 'RUNNING_LIVE';
      if (isAlreadyRunning) {
        await env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`).bind(user.id).run();
        await bot.sendMessage(chatId, '🔴 ربات دلارینو با موفقیت متوقف شد. برای شروع مجدد دوباره روی همین دکمه بزنید.', {
          inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', false, uiMode),
        });
        return { ok: true };
      }
    }
    const res = await startBotOneClickForTelegram({
      env,
      bot,
      chatId,
      user,
      tgId,
      webAppUrl,
      overrideStrategyKey: 'ai_autonomous_agent',
    });
    if (res.needsOnboardingGate) {
      const gp = await buildTelegramOnboardingGatePayload(env, user.id);
      await bot.sendMessage(chatId, gp.text, { inlineKeyboard: gp.inlineKeyboard });
      return { ok: true };
    }
    await bot.sendMessage(chatId, res.text, {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, uiMode),
    });
    return { ok: true };
  }

  if (text === '🎯 اسنایپر زیر ۵ دقیقه') {
    await bot.sendMessage(
      chatId,
      `🎯 **اسنایپر فوق‌سریع زیر ۵ دقیقه و مومنتوم DEX**\n\nبازه زمانی اسکن استخرهای تازه‌لانچ (GeckoTerminal + DexScreener) را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '⚡ اسکن استخرهای زیر ۵ دقیقه', callback_data: 'tg_sniper_scan_5m', style: 'success' },
            { text: '🔥 مومنتوم ۱ ساعته', callback_data: 'tg_sniper_scan_1h', style: 'primary' },
          ],
          ...(webAppUrl.startsWith('https://')
            ? [[{ text: '🌐 باز کردن اسنایپر کامل در مینی‌اپ', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/?tab=sniper` } }]]
            : []),
        ],
      }
    );
    return { ok: true };
  }

  if (text === 'اعلان‌ها 🔔' || text === 'دریافت اعلان 🔔') {
    const cfg = await env.DB.prepare(
      'SELECT notifications_enabled, notification_prefs_json, display_currency FROM bot_configs WHERE user_id = ?'
    ).bind(user.id).first<{
      notifications_enabled: number;
      notification_prefs_json?: string | null;
      display_currency?: string | null;
    }>();
    const enabled = Number(cfg?.notifications_enabled ?? 1);
    const prefs = parseTgNotifPrefs(cfg?.notification_prefs_json);
    const currency = cfg?.display_currency === 'IRT' ? 'IRT' : 'USD';
    await bot.sendMessage(
      chatId,
      `🔔 تنظیمات پیشرفته اعلان‌ها و واحد نمایش دلارینو:\n\nتمام تنظیمات زیر همزمان با پنل وب سایت همگام هستند:`,
      { inlineKeyboard: buildNotifSettingsKeyboard(enabled, prefs, currency) }
    );
    return { ok: true };
  }

  if (text === '📊 معاملات و تراز ۵ بخش') {
    await clearState();
    await showSimplePositionsAndAccounting(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '📊 وضعیت سود و معاملات' || text === '📊 معاملات باز و پورتفوی') {
    await showAccountCard(env, bot, chatId, user, tgId, webAppUrl);
    return { ok: true };
  }

  if (text === '📡 آلرت رایگان TradingView') {
    await showFreeTradingViewAlertsMenu(env, bot, chatId, user.id, webAppUrl);
    return { ok: true };
  }

  if (text === '💰 کارمزد ۳٪ سود (رایگان)' || text === '💰 کارمزد ۵٪ سود (رایگان)' || text === '💰 کارمزد ۱٪ سود (رایگان)') {
    await showSubscriptionMenu(env, bot, chatId, user, tgId);
    return { ok: true };
  }

  if (text === '🧪 شبیه‌ساز دمو مشابه تراست‌ولت') {
    await env.DB.prepare(
      `UPDATE bot_configs SET trading_mode = 'PAPER', trading_mode_selected = 1, updated_at = datetime('now') WHERE user_id = ?`
    ).bind(user.id).run();
    const gateCheck = await checkPreTradeOnboardingGate(env.DB, user.id);
    await bot.sendMessage(
      chatId,
      `🧪 **شبیه‌ساز دمو مشابه Trust Wallet ($10,000) انتخاب شد!**` +
        (gateCheck.hasAcceptedRisk
          ? `\nتمام معاملات اسپات، میم‌کوین، کپی‌ترید و فیوچرز با قیمت لحظه‌ای واقعی روی حساب آزمایشی آماده اجراست.`
          : `\n⚠️ برای شروع اولین معامله یا روشن کردن ربات، لطفاً متن قوانین و ریسک را نیز تایید کنید:`)
    );
    if (!gateCheck.ok) {
      const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
      await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
    }
    return { ok: true };
  }

  if (text === '⚡ تایید دستی یا اتوترید ۲۴/۷') {
    const curCfg = await env.DB.prepare('SELECT trade_execution_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ trade_execution_mode: string }>();
    const isAuto = curCfg?.trade_execution_mode !== 'MANUAL_CONFIRM';
    const nextExec = isAuto ? 'MANUAL_CONFIRM' : 'AUTO';
    await env.DB.prepare(`UPDATE bot_configs SET trade_execution_mode = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .bind(nextExec, user.id).run();
    await bot.sendMessage(
      chatId,
      nextExec === 'AUTO'
        ? `⚡ **حالت تمام‌اتوترید خودکار ۲۴/۷ فعال شد!**\nربات بدون نیاز به تایید دستی، معاملات را شبانه‌روزی اجرا می‌کند.`
        : `✋ **حالت تایید دستی ۱-کلیکی فعال شد!**\nقبل از باز شدن هر معامله در Trust Wallet، اعلان تایید ارسال می‌شود.`
    );
    return { ok: true };
  }

  if (text === '/card' || text === 'کارت سود دلارینو 📊') {
    await bot.sendMessage(
      chatId,
      `📊 صدور کارت سود تاییدشده دلارینو (فیوچرز + تراست‌ولت/DEX + کپی‌ترید):\n\nبازه زمانی، تک‌معامله یا قالب استوری ۹:۱۶ خود را انتخاب کنید:`,
      { inlineKeyboard: buildTelegramProfitCardKeyboard() }
    );
    return { ok: true };
  }

  if (text === '🏆 کپی‌ترید تاییدشده' || text === '🏆 کپی‌ترید' || text === '🏆 کپی‌ترید حرفه‌ای (V2)' || text === '/copy') {
    await syncAutoTopSiteTraders(env.DB).catch(() => {});
    const traders = await env.DB.prepare(
      `SELECT id, display_name, specialty, win_rate, roi_30d_pct, followers_count FROM copy_traders WHERE is_active = 1 AND is_verified = 1 ORDER BY roi_30d_pct DESC LIMIT 6`
    ).all<{ id: string; display_name: string; specialty: string; win_rate: number; roi_30d_pct: number; followers_count: number }>().catch(() => ({ results: [] }));
    const lines = traders.results.length
      ? traders.results.map((t, i) => `${i + 1}. ✅ ${t.display_name} (${t.specialty})\n   نرخ برد: ${t.win_rate}% | بازده ۳۰روزه: +${t.roi_30d_pct}%`).join('\n\n')
      : 'در حال حاضر تریدری ثبت نشده است.';
    const kb: InlineKeyboardButton[][] = traders.results.map((t) => [
      { text: `➕ فالو (${t.display_name})`, callback_data: `tg_copy_follow:${t.id}`, style: 'success' },
    ]);
    kb.push([{ text: '🐋 تریدرهای هوشمند و سبد ولت‌ها (V2)', callback_data: 'tg_copy_smart_v2', style: 'primary' }]);
    await bot.sendMessage(chatId, `🏆 کپی‌تریدرهای تاییدشده دلارینو:\n\n${lines}`, { inlineKeyboard: kb });
    return { ok: true };
  }

  if (text === '🎯 استراتژی شکار' || text === '🎯 اسنایپر و استراتژی') {
    const hasHttps = webAppUrl.startsWith('https://');
    await bot.sendMessage(
      chatId,
      `🎯 موتور ۳: استراتژی شکار دلارینو\n\nشاخه مورد نظر خود را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '⚡️ استراتژی‌های آماده ما', callback_data: 'tg_hunt_ready', style: 'success' },
            ...(hasHttps
              ? [{ text: '🛠 استراتژی شخصی خودتان (IDE)', web_app: { url: `${webAppUrl}/?tab=radar` }, style: 'primary' as const }]
              : [{ text: '🛠 استراتژی شخصی', callback_data: 'tg_hunt_personal', style: 'primary' as const }]),
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '💬 پشتیبانی آنلاین' || text === '💬 پشتیبانی' || text === '/support') {
    await setState({ step: 'AWAIT_SUPPORT_MSG' });
    const configuredBot = (await getSystemSetting(env.DB, 'bot_username', '')).replace(/^@/, '');
    const fallbackBot = configuredBot ? `@${configuredBot}` : '';
    const supportId = await getSystemSetting(env.DB, 'telegram_support', fallbackBot);
    const safeSup = !supportId || /Dollarino_admin/i.test(supportId) ? fallbackBot : supportId;
    const supTag = safeSup ? ` (${safeSup})` : '';
    await bot.sendMessage(
      chatId,
      `💬 پشتیبانی هوشمند و آنلاین دلارینو${supTag}\n\n` +
      `سوال، مشکل یا <b>عکس / اسکرین‌شات</b> خود را همین‌جا ارسال کنید تا هوش مصنوعی پشتیبانی فوری بررسی و پاسخ دهد. هر زمان خواستید می‌توانید از دکمه زیر مستقیم با <b>مدیران انسانی</b> گفتگو کنید.\n\n` +
      `${ANTI_SCAM_WARNING_FA}`,
      {
        inlineKeyboard: [
          [{ text: '👨‍💼 اتصال مستقیم به مدیران پشتیبانی', callback_data: 'tg_support_human:new', style: 'primary' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text.startsWith('Paper Mode') || text === '🧪 شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری') {
    await env.DB.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER' WHERE user_id = ?`).bind(user.id).run();
    const [{ adapter }, iranRate] = await Promise.all([
      resolveUserExchangeAdapter(env, user.id, 'paper'),
      fetchIranUsdtRate(),
    ]);
    const bal = await adapter.getBalance();
    await bot.sendMessage(chatId, `✅ حالت شبیه‌ساز حساب تراست‌ولت ($10,000) فعال شد:\n\n${formatBalanceCard('paper', bal, iranRate.usdtIrt)}`, {
      replyKeyboard: mainMenuKeyboard(webAppUrl, uiMode, admin),
    });
    return { ok: true };
  }

  if (text === 'تنظیمات ⚙️' || text === '/settings') {
    await bot.sendMessage(chatId, '⚙️ منوی تنظیمات ربات دلارینو:', {
      replyKeyboard: settingsKeyboard(admin, superAdmin, uiMode),
    });
    return { ok: true };
  }

  if (text === '🎛 انتخاب روش ترید') {
    const cfg = await env.DB.prepare('SELECT strategy_key, bot_state FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ strategy_key: string; bot_state: string }>();
    const isRunning = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    await bot.sendMessage(
      chatId,
      `🎛 **انتخاب روش معاملاتی ربات:**\nروش فعلی: **${resolveEngineDisplayLabel(cfg?.strategy_key)}**\n\nیکی از موتورهای زیر را انتخاب کنید:`,
      { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'ai', isRunning, uiMode) }
    );
    return { ok: true };
  }

  if (text === 'تنظیم نوع بازار (اسپات/فیوچرز) ⚖️' || text === '⚖️ اسپات / فیوچرز') {
    const cfg = await env.DB.prepare('SELECT market_type FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ market_type?: string }>();
    await bot.sendMessage(
      chatId,
      `⚖️ بازار فعلی ربات: ${cfg?.market_type === 'SPOT' ? 'اسپات (Spot · 1x)' : 'فیوچرز (Futures)'}\nنوع بازار مورد نظر را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [
            { text: '📈 فیوچرز (Futures)', callback_data: 'set_mkt:FUTURES' },
            { text: '🪙 اسپات (Spot)', callback_data: 'set_mkt:SPOT' },
          ],
        ],
      }
    );
    return { ok: true };
  }

  if (text === 'جهت معاملات (لانگ/شورت) ↕️' || text === '↕️ جهت معاملات') {
    const cfg = await env.DB.prepare('SELECT direction_mode, hedge_mode FROM bot_configs WHERE user_id = ?')
      .bind(user.id).first<{ direction_mode?: string; hedge_mode?: number }>();
    await bot.sendMessage(
      chatId,
      `↕️ جهت فعلی معاملات: ${cfg?.direction_mode ?? 'BOTH'}\n🛡 حالت هج (لانگ و شورت هم‌زمان): ${cfg?.hedge_mode ? 'فعال' : 'غیرفعال'}\n\nجهت معاملات ربات را انتخاب کنید:`,
      {
        inlineKeyboard: [
          [{ text: '↕️ هر دو جهت (Long + Short)', callback_data: 'set_dir:BOTH' }],
          [
            { text: '🟢 فقط لانگ (Long Only)', callback_data: 'set_dir:LONG_ONLY' },
            { text: '🔴 فقط شورت (Short Only)', callback_data: 'set_dir:SHORT_ONLY' },
          ],
          [{ text: `🛡 تغییر حالت هج (${cfg?.hedge_mode ? 'روشن ✅' : 'خاموش'})`, callback_data: 'toggle_hedge' }],
        ],
      }
    );
    return { ok: true };
  }

  if (text === '📈 معاملات باز' || text === '📈 معاملات باز و پورتفوی' || text === '/positions') {
    const openRows = await env.DB.prepare(
      `SELECT id, symbol, direction, market_type, entry_price, leverage, margin_used, current_stop_loss, tp1 FROM trades WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 8`
    ).bind(user.id).all<{
      id: string;
      symbol: string;
      direction: 'LONG' | 'SHORT';
      market_type?: string;
      entry_price: string;
      leverage: number;
      margin_used: string;
      current_stop_loss: string;
      tp1: string;
    }>();
    if (!openRows.results.length) {
      await bot.sendMessage(chatId, '📭 در حال حاضر هیچ معامله بازی روی حساب شما نیست.', {
        inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal'),
      });
      return { ok: true };
    }
    const lines = openRows.results.map(
      (t, idx) =>
        `${idx + 1}. ${t.direction === 'LONG' ? '🟢' : '🔴'} ${t.symbol} (${t.market_type || 'FUTURES'} ${t.leverage}x)\n   ورود: ${t.entry_price} | SL: ${t.current_stop_loss} | TP1: ${t.tp1}`
    ).join('\n\n');
    const closeButtons: InlineKeyboardButton[][] = openRows.results.map((t) => [
      { text: `❌ بستن ${t.symbol} (${t.direction})`, callback_data: `close_pos:${t.id}` },
    ]);
    if (webAppUrl.startsWith('https://')) {
      closeButtons.push([{ text: '🚀 مدیریت کامل در مینی‌اپ', web_app: { url: `${webAppUrl}/terminal` } }]);
    }
    await bot.sendMessage(chatId, `📈 معاملات باز فعلی (${openRows.results.length}):\n\n${lines}`, {
      inlineKeyboard: closeButtons,
    });
    return { ok: true };
  }

  if (text === '🟢 شروع خودکار ربات' || text === '🟢 شروع خودکار ربات (یک کلیک)' || text === '🟢 شروع سریع ربات' || text === '/autostart') {
    await clearState();
    const res = await startBotOneClickForTelegram({
      env,
      bot,
      chatId,
      user,
      tgId,
      webAppUrl,
    });
    if (res.needsOnboardingGate) {
      const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
      await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
      return { ok: true };
    }
    await bot.sendMessage(chatId, res.text, {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, uiMode),
    });
    return { ok: true };
  }

  if (text === '⚡️ شکار فوری AI' || text === '⚡️ شکار و ترید فوری AI' || text === '/scan') {
    await clearState();
    const preGate = await checkPreTradeOnboardingGate(env.DB, user.id);
    if (!preGate.ok) {
      const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
      await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
      return { ok: true };
    }
    await bot.sendMessage(chatId, '⚡️ در حال تحلیل لحظه‌ای ۵ نماد اصلی با هوش مصنوعی دلارینو و اجرای خودکار سیگنال معتبر...');
    const res = await runInstantAiAutoTradeForTelegram({ env, user, tgId });
    if (res.needsOnboardingGate) {
      const gatePrompt = await buildTelegramOnboardingGatePayload(env, user.id);
      await bot.sendMessage(chatId, gatePrompt.text, { inlineKeyboard: gatePrompt.inlineKeyboard });
      return { ok: true };
    }
    if (res.needSubscription) {
      await showSubscriptionMenu(env, bot, chatId, user, tgId);
      return { ok: true };
    }
    await bot.sendMessage(chatId, res.text, {
      inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '', 'none', res.ok, uiMode),
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
    await bot.sendMessage(chatId, '💪 حالت دستی ترید فعال شد! از این پس زیر هر سیگنال دکمه «👈 دلارینو ترید کن برام 👉» برای تایید شما ارسال می‌شود.');
    return { ok: true };
  }

  if (text === 'دریافت موجودی ولت 💳' || text === 'دریافت موجودی صرافی 💳' || text === '/balance') {
    const [cfg, iranRate] = await Promise.all([
      env.DB.prepare('SELECT trading_mode, market_type FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ trading_mode: string; market_type?: 'SPOT' | 'FUTURES' }>(),
      fetchIranUsdtRate(),
    ]);
    const { adapter, provider } = await resolveUserExchangeAdapter(
      env,
      user.id,
      cfg?.trading_mode === 'PAPER' ? 'paper' : undefined
    );
    const bal = await adapter.getBalance(cfg?.market_type ?? 'FUTURES');
    await bot.sendMessage(chatId, formatBalanceCard(provider, bal, iranRate.usdtIrt));
    return { ok: true };
  }

  if (text === 'تنظیم مقادیر معاملات 🪛') {
    await showTradeQuantitiesMenu(env, bot, chatId, user.id);
    return { ok: true };
  }

  if (text === 'دریافت اعلان 🔔') {
    const cfg = await env.DB.prepare(
      'SELECT notifications_enabled, notification_prefs_json, display_currency FROM bot_configs WHERE user_id = ?'
    ).bind(user.id).first<{
      notifications_enabled: number;
      notification_prefs_json?: string | null;
      display_currency?: string | null;
    }>();
    const enabled = Number(cfg?.notifications_enabled || 0);
    const prefs = parseTgNotifPrefs(cfg?.notification_prefs_json);
    const currency = cfg?.display_currency === 'IRT' ? 'IRT' : 'USD';
    await bot.sendMessage(
      chatId,
      `🔔 تنظیمات پیشرفته اعلان‌ها و واحد نمایش دلارینو:\n\nتمام تنظیمات زیر همزمان با پنل وب سایت همگام هستند:`,
      { inlineKeyboard: buildNotifSettingsKeyboard(enabled, prefs, currency) }
    );
    return { ok: true };
  }

  if (text === 'حساب کاربری 👤') {
    await showAccountCard(env, bot, chatId, user, tgId, webAppUrl);
    return { ok: true };
  }

  if (text === 'ربات و هوش مصنوعی من 🤖') {
    const [bots, aiSummary, cfg] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM telegram_bots WHERE user_id = ?').bind(user.id).first<{ cnt: number }>(),
      getPlatformAISummary(env),
      env.DB.prepare('SELECT strategy_key, bot_state, market_type, direction_mode, hedge_mode FROM bot_configs WHERE user_id = ?')
        .bind(user.id).first<{ strategy_key: string; bot_state: string; market_type?: string; direction_mode?: string; hedge_mode?: number }>(),
    ]);
    const stratName =
      cfg?.strategy_key === 'ai_autonomous_agent'
        ? 'هوش مصنوعی دلارینو'
        : cfg?.strategy_key === 'dollarino_v01'
          ? 'استراتژی منتخب دلارینو (موتور دُرنا V1)'
          : cfg?.strategy_key || 'استراتژی منتخب دلارینو';
    const running = cfg?.bot_state === 'RUNNING_PAPER' || cfg?.bot_state === 'RUNNING_LIVE';
    await bot.sendMessage(
      chatId,
      `🤖 وضعیت ربات و هوش مصنوعی دلارینو:\n\n` +
      `🔹 وضعیت فعلی: ${running ? '🟢 روشن و فعال' : '🔴 متوقف'}\n` +
      `🔹 بازار و جهت: ${cfg?.market_type ?? 'FUTURES'} | ${cfg?.direction_mode ?? 'BOTH'}${cfg?.hedge_mode ? ' | Hedge Mode 🛡' : ''}\n` +
      `🔹 استراتژی انتخاب‌شده: ${stratName}\n` +
      `🔹 موتور هوش مصنوعی دلارینو: ${aiSummary.effectiveModeLabelFa}\n` +
      `🔹 ربات‌های کپی ترید دلارینو متصل: ${bots?.cnt ?? 0}\n\n` +
      `با یک لمس ربات را روشن/خاموش کنید یا وارد ترمینال مینی‌اپ شوید:`,
      { inlineKeyboard: miniAppInlineKeyboard(webAppUrl, '/terminal') }
    );
    return { ok: true };
  }

  if (text === 'خرید اشتراک 💎' || text === '💰 کارمزد ۳٪ سود (رایگان)' || text === '💰 کارمزد ۵٪ سود (رایگان)' || text === '💰 کارمزد ۱٪ سود (رایگان)') {
    await showSubscriptionMenu(env, bot, chatId, user, tgId);
    return { ok: true };
  }

  if (text === 'افزایش موجودی 💰') {
    await setState({ step: 'AWAIT_TOPUP_AMOUNT' });
    await bot.sendMessage(chatId, '💰 مبلغ افزایش موجودی کیف پول را به تتر (USDT) وارد کنید (مثلاً 20):');
    return { ok: true };
  }

  if (text === 'افزودن مدیر 🔑') {
    if (!superAdmin) {
      await bot.sendMessage(chatId, '⛔️ فقط مدیر اصلی سیستم مجاز به افزودن مدیر جدید است.');
      return { ok: true };
    }
    await setState({ step: 'AWAIT_ADD_ADMIN' });
    await bot.sendMessage(chatId, '🔑 لطفاً آیدی عددی تلگرام فردی که می‌خواهید مدیر شود را ارسال کنید:');
    return { ok: true };
  }

  // Direct photo / chart screenshot sent anytime outside specialized admin/support flows -> Instant AI Chart Vision Analysis!
  if (incomingImageFileId) {
    await handleTelegramAIChatTurn({
      env,
      bot,
      chatId,
      user,
      webAppUrl,
      text,
      imageFileId: incomingImageFileId,
    });
    return { ok: true };
  }

  if (text === '🧠 چت هوش مصنوعی (عکس چارت)' || text === '/ai' || text === '/chat') {
    await openDedicatedAIChatMenu(env, bot, chatId, user, webAppUrl);
    return { ok: true };
  }

  if (text === '👨‍💻 درباره سازنده' || text === '👨‍💻 سازنده و ضدپانزی' || text === '/about') {
    await sendFounderAboutCard(env, bot, chatId, webAppUrl, mainMenuKeyboard(webAppUrl, uiMode, admin));
    return { ok: true };
  }

  if (text === 'راهنما 📚' || text === '/help') {
    const [helpText, helpMedia, supportId, botUsernameCfg] = await Promise.all([
      getSystemSetting(env.DB, 'bot_help_text', ''),
      getSystemSetting(env.DB, 'bot_help_media_url', ''),
      getSystemSetting(env.DB, 'telegram_support', ''),
      getSystemSetting(env.DB, 'bot_username', ''),
    ]);
    const cleanHelpBot = botUsernameCfg.replace(/^@/, '');
    const fallbackHelpSup = cleanHelpBot ? `@${cleanHelpBot}` : '';
    const safeSup = !supportId || /Dollarino_admin/i.test(supportId) ? fallbackHelpSup : supportId;
    const defaultHelpGuide = [
      '📚 **راهنمای سریع دلارینو (نسخه V11.2)**',
      '• **۵ موتور معامله هم‌زمان:** ۱) هوش مصنوعی دلارینو (کاملاً خودکار)، ۲) هوش مصنوعی من (قابل آموزش با چت و عکس)، ۳) استراتژی شکار دُرنا V1 + IDE، ۴) کپی‌ترید هوشمند ولت‌ها V2، ۵) اسنایپ لیستینگ و میم‌کوین.',
      '• **تفاوت تایید دستی و تمام‌اتوترید ۲۴/۷ در Trust Wallet:** در حالت تایید دستی، سرمایه کاملاً دست‌نخورده در کیف‌پول شماست و هر معامله با ۱ کلیک تایید می‌شود. در حالت تمام‌اتوترید ۲۴/۷، با اتصال یک‌باره Perp Agent Key (بدون حق برداشت) و Copy-Vault دارای سقف بودجه، تمام معاملات اسپات، میم‌کوین، کپی‌ترید و فیوچرز ۱۰۰x شبانه‌روزی خودکار اجرا می‌شوند.',
      '• **شبیه‌ساز دمو قابل تنظیم ($50 تا $10M):** کاملاً مشابه ساختار Trust Wallet برای تست رایگان استراتژی‌ها و کپی‌ترید بدون ریسک.',
      '• **تحلیل چارت:** در چت ربات بنویسید `/ai` یا مستقیماً عکس چارت را بفرستید تا ورود، استاپ و ۳ تارگت تحویل بگیرید.',
    ].join('\n');
    const rawHelp = (helpText || (await getSystemSetting(env.DB, 'help_text', defaultHelpGuide))).replace(/\\n/g, '\n');
    const supLine = safeSup ? `\n\n🆘 پشتیبانی رسمی: ${safeSup}` : '\n';
    const caption = `${rawHelp}\n\n${CREATOR_ATTRIBUTION_FA}${supLine}\n${ANTI_SCAM_WARNING_FA}`;
    const faqKb: InlineKeyboardButton[][] = [
      [{ text: '📡 کانال‌ها و گروه رسمی دلارینو', callback_data: 'tg_ecosystem_links', style: 'success' }],
      ...(webAppUrl.startsWith('https://')
        ? [[{ text: '🚀 راهنمای کامل در مینی‌اپ دلارینو', web_app: { url: `${webAppUrl.replace(/\/$/, '')}/faq` }, style: 'primary' as const }]]
        : []),
    ];
    if (helpMedia && helpMedia.startsWith('https://')) {
      if (/\.(mp4|mov|webm)(\?|$)/i.test(helpMedia)) {
        await bot.sendVideo(chatId, helpMedia, caption).catch(() => bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb }));
      } else {
        await bot.sendPhoto(chatId, helpMedia, caption).catch(() => bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb }));
      }
    } else {
      await bot.sendMessage(chatId, caption, { inlineKeyboard: faqKb });
    }
    return { ok: true };
  }

  if (text === '/channels' || text === 'کانال‌های رسمی دلارینو') {
    const cfg = await resolveChannelAndBotConfig(env);
    const pubUrl = (u: string) => /^https?:\/\//i.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/i.test(u);
    const linkRows: InlineKeyboardButton[][] = [];
    if (pubUrl(cfg.officialChannelInvite)) {
      linkRows.push([{ text: '🌟 چنل رسمی و اصلی دلارینو', url: cfg.officialChannelInvite, style: 'primary' }]);
    }
    const r1: InlineKeyboardButton[] = [];
    if (pubUrl(cfg.signalsChannelInvite)) r1.push({ text: '01. سیگنال دلارینو 📡', url: cfg.signalsChannelInvite, style: 'success' });
    if (pubUrl(cfg.resultsChannelInvite)) r1.push({ text: '02. نتایج سیگنال 🏆', url: cfg.resultsChannelInvite });
    if (r1.length > 0) linkRows.push(r1);
    const r2: InlineKeyboardButton[] = [];
    if (pubUrl(cfg.communityGroupInvite)) r2.push({ text: '03. گروه کاربران دلارینو 👥', url: cfg.communityGroupInvite });
    if (pubUrl(cfg.newsChannelInvite)) r2.push({ text: '07. اخبار دلارینو 📰', url: cfg.newsChannelInvite });
    if (r2.length > 0) linkRows.push(r2);
    linkRows.push([{ text: '🌐 ورود فوری به نسخه وب', callback_data: 'tg_web_login', style: 'primary' }]);
    await bot.sendMessage(
      chatId,
      `📡 **ساختار رسمی DOLLARINO — AI Trading Ecosystem**\n\n` +
        `• 🌟 **چنل رسمی و اصلی:** ${cfg.officialChannel || 'تنظیم‌نشده'}\n` +
        `• 📡 **01. سیگنال دلارینو:** ${cfg.signalsChannelId || 'تنظیم‌نشده'}\n` +
        `• 🏆 **02. نتایج سیگنال دلارینو:** ${cfg.resultsChannelId || 'تنظیم‌نشده'}\n` +
        `• 👥 **03. گروه کاربران دلارینو:** ${cfg.communityGroupId ? 'فعال ✅' : 'تنظیم‌نشده'}\n` +
        `• 📰 **07. اخبار دلارینو:** ${cfg.newsChannelId || 'تنظیم‌نشده'}`,
      { inlineKeyboard: linkRows }
    );
    return { ok: true };
  }

  if ((text === 'پنل مدیریت 💼' || text === '/admin') && admin) {
    await openAdminPanelHome(env, bot, chatId, buildAdminActor(user, tgId, ownerId));
    return { ok: true };
  }

  // Fallback 1: if user pasted a raw Dollarino Signal straight into the bot chat!
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

  // Fallback 2: Free-form message -> respond naturally as Dollarino Dedicated AI (like ChatGPT/Claude)!
  await handleTelegramAIChatTurn({
    env,
    bot,
    chatId,
    user,
    webAppUrl,
    text,
  });
  return { ok: true };
}
