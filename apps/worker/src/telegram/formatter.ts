import { resolveEngineDisplayLabel } from '@dollarino/core';
import type { FuturesBalance } from '../exchanges/base.js';
import type { InlineKeyboardButton, ReplyKeyboardButton } from './client.js';

export const OFFICIAL_CHANNEL_HANDLE = '';
export const OFFICIAL_BOT_HANDLE = '';
export const SIGNALS_CHANNEL_INVITE = '';
export const RESULTS_CHANNEL_INVITE = '';
export const CREATOR_ATTRIBUTION_FA =
  '👨‍💻 طراح و سازنده پروژه دلارینو: **آوید کیا (Avid Kiya)**\n' +
  '• تلگرام: @avidkiya (https://t.me/avidkiya)\n' +
  '• اینستاگرام و توییتر (X): @avid_kiya (https://instagram.com/avid_kiya)';
export const ANTI_SCAM_WARNING_FA =
  '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. ثبت‌نام، ورود و پشتیبانی رسمی فقط از طریق ربات متصل تلگرام و پشتیبانی آنلاین داخل سایت انجام می‌شود.';

export function formatIranDateTime(isoInput?: string | null): string {
  if (!isoInput) return '—';
  const normalized = isoInput.includes('T') || isoInput.endsWith('Z') ? isoInput : isoInput.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(isoInput);
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function formatToman(usdt: number, rate = 290000): string {
  return Math.round(usdt * rate).toLocaleString('en-US');
}

export function formatRial(usdt: number, rateIrr = 2900000): string {
  return Math.round(usdt * rateIrr).toLocaleString('en-US');
}

export function preAuthIntroMessage(firstName: string): string {
  return (
    `🚀 به **دلارینو** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `به دنیای ابزارهای هوشمند معاملاتی خوش آمدید.\n\n` +
    `در دلارینو می‌توانید به مجموعه‌ای از امکانات معاملاتی دسترسی داشته باشید:\n\n` +
    `🤖 **هوش مصنوعی دلارینو**\n` +
    `ابزار هوشمند تحلیل و معاملهٔ خودکار بازار\n\n` +
    `📊 **استراتژی‌های منتخب دلارینو**\n` +
    `دسترسی به استراتژی‌های معاملاتی منتخب و دُرنا V1\n\n` +
    `🔄 **کپی ترید دلارینو**\n` +
    `امکان کپی معاملات و دنبال‌کردن عملکرد معامله‌گران\n\n` +
    `━━━━━━━━━━━━━━\n\n` +
    `🔐 **تنها یک قدم تا شروع:**\n` +
    `برای ورود امن و باز شدن منوی کامل ربات، دکمهٔ پایین صفحه (**📱 اشتراک‌گذاری شماره تماس من**) را لمس کنید.\n` +
    `⚠️ فقط شماره خودتان پذیرفته می‌شود.`
  );
}

export function preAuthIntroInlineButtons(): InlineKeyboardButton[][] {
  return [];
}

export function contactVerificationKeyboard(): ReplyKeyboardButton[][] {
  return [
    [{ text: '📱 اشتراک‌گذاری شماره تماس من', request_contact: true }],
  ];
}

export function welcomeMessage(firstName: string, uiMode: 'simple' | 'pro' = 'simple', webAppUrl = 'https://dollarino.pages.dev'): string {
  const cleanWeb = webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const modeSummary =
    uiMode === 'simple'
      ? `🌱 **حالت ساده فعال است (همگام با نسخه V11.9.1 سایت):** محیطی تمیز و بدون شلوغی برای کنترل ۱-کلیکی ربات، سوئیچ دمو/واقعی، ۵ موتور همزمان، تراز ۵ بخش و اسنایپر.`
      : `⚡ **حالت حرفه‌ای (Quant Pro V11.9.1) فعال است:** رادار زنده DexScreener + خرید مستقیم، کپی‌ترید هوشمند و سبد نهنگ‌ها، دُرنا V1، کارت‌های سود ۱۶:۹ و ۹:۱۶، ۲۵+ آلرت TradingView و اکستنشن کروم/فایرفاکس/اج.`;
  return (
    `🚀 به **دلارینو V11.9.1** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `${modeSummary}\n\n` +
    `✨ **امکانات نسخه جدید حساب شما:**\n` +
    `• 🎛 **۵ موتور ترید همزمان** (پیش‌فرض خاموش برای ایمنی سرمایه)\n` +
    `• 📊 **تراز یکپارچه ۵ بخش** (فیوچرز · اسپات · DEX · اسنایپر · کپی‌ترید)\n` +
    `• 🧪 **دمو قابل تنظیم ($50–$10M)** یا **Trust Wallet غیرامانی** (۳ برد اول ۰٪، سپس ۳٪ از سود خالص)\n` +
    `• 🧩 **اکستنشن کروم، فایرفاکس و اج V11.9.1** + **کپی‌ترید و اسنایپر زیر ۵ دقیقه**\n\n` +
    `🌐 وب‌سایت رسمی: ${cleanWeb}\n` +
    `${CREATOR_ATTRIBUTION_FA}`
  );
}

export function mainMenuKeyboard(webAppUrl?: string, uiMode: 'simple' | 'pro' = 'simple', isAdmin = false): ReplyKeyboardButton[][] {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  const rows: ReplyKeyboardButton[][] =
    uiMode === 'simple'
      ? [
          [{ text: '🏠 پنل ساده من' }, { text: '🤖 شروع / توقف ربات' }],
          [{ text: '🎛 ۵ موتور ترید' }, { text: '💼 دمو / واقعی و بودجه' }],
          [{ text: '📊 معاملات و تراز ۵ بخش' }, { text: '🎯 اسنایپر زیر ۵ دقیقه' }],
          [{ text: 'کارت سود دلارینو 📊' }, { text: 'اعلان‌ها 🔔' }, { text: '🛡 Trust Wallet' }],
          [{ text: '🛠 ابزارها و پشتیبانی' }, { text: '⚡ حالت حرفه‌ای' }],
        ]
      : [
          [{ text: '🟢 شروع خودکار ربات' }, { text: '⚡️ شکار فوری AI' }],
          [{ text: '🎛 انتخاب ۵ موتور ترید' }, { text: '💰 بودجه مجاز و اهرم' }],
          [{ text: '📈 معاملات باز و پورتفوی' }, { text: '🔍 رادار DEX & خرید مستقیم' }, { text: '🏆 کپی‌ترید حرفه‌ای (V2)' }],
          [{ text: '🧠 چت هوش مصنوعی (عکس چارت)' }, { text: '🤖 هوش مصنوعی من' }, { text: '🎯 اسنایپر و استراتژی' }],
          [{ text: '🛡 اتصال Trust Wallet' }, { text: '📡 آلرت رایگان TradingView' }, { text: '🧩 اکستنشن کروم/فایرفاکس/اج' }],
          [{ text: '💰 کارمزد ۳٪ سود (رایگان)' }, { text: 'کارت سود دلارینو 📊' }, { text: 'تنظیمات ⚙️' }],
          [{ text: '💬 پشتیبانی' }, { text: 'راهنما 📚' }, { text: '🌱 رفتن به حالت ساده' }],
        ];
  if (isAdmin && safeUrl) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: '🚀 مینی‌اپ ساده', web_app: { url: `${safeUrl.replace(/\/$/, '')}/?ui_mode=${uiMode}` } }]);
  } else if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }]);
  } else if (safeUrl) {
    rows.push([{ text: uiMode === 'simple' ? '🚀 مینی‌اپ ساده' : '🚀 باز کردن مینی‌اپ دلارینو', web_app: { url: `${safeUrl.replace(/\/$/, '')}/?ui_mode=${uiMode}` } }]);
  }
  return rows;
}

export type CollapsibleMenuSection = 'none' | 'ai' | 'hunt' | 'copy' | 'trust' | 'tools';

export function miniAppInlineKeyboard(
  webAppUrl: string,
  path = '',
  openSection: CollapsibleMenuSection = 'none',
  isBotRunning = false,
  uiMode: 'simple' | 'pro' = 'simple'
): InlineKeyboardButton[][] {
  const base = webAppUrl.replace(/\/$/, '');
  const fullUrl = `${base}${path}`;
  const hasHttps = fullUrl.startsWith('https://');
  const rows: InlineKeyboardButton[][] = [];

  rows.push([
    {
      text: isBotRunning ? '🔴 توقف ربات' : '🟢 روشن کردن ربات',
      callback_data: 'tg_bot_toggle',
      style: isBotRunning ? 'danger' : 'success',
    },
    {
      text: '⚡️ شکار فوری AI',
      callback_data: 'tg_instant_ai_trade',
      style: 'primary',
    },
  ]);

  if (openSection === 'none') {
    rows.push([
      { text: '🎛 انتخاب ۵ موتور ترید', callback_data: 'tg_acc:ai', style: 'primary' },
      { text: '🎯 اسنایپر زیر ۵ دقیقه ⚡', callback_data: 'tg_sniper_scan_5m', style: 'success' },
    ]);
    rows.push([
      { text: '🔍 رادار DEX & خرید مستقیم', callback_data: 'tg_dex_trending' },
      { text: '🐋 کپی‌ترید و سبد نهنگ‌ها', callback_data: 'tg_copy_smart_v2' },
    ]);
    rows.push([
      { text: '🧠 چت AI و عکس چارت', callback_data: 'tg_ai_chat' },
      { text: '📊 کارت سود', callback_data: 'tg_profit_card' },
      { text: '🔔 اعلان‌ها', callback_data: 'tg_notif_menu' },
    ]);
    rows.push([
      { text: '🛡 Trust Wallet و دمو', callback_data: 'tg_acc:trust' },
      { text: '🛠 ابزارها و اکستنشن', callback_data: 'tg_acc:tools' },
    ]);
    rows.push([
      { text: '📡 کانال‌ها و گروه رسمی', callback_data: 'tg_ecosystem_links' },
      { text: '🌐 ورود سریع به سایت', callback_data: 'tg_web_login' },
    ]);
    if (hasHttps) {
      rows.push([
        { text: '🚀 باز کردن مینی‌اپ سایت', web_app: { url: fullUrl }, style: 'success' },
        { text: '📊 پورتفوی و معاملات', web_app: { url: `${base}/?tab=portfolio` }, style: 'primary' },
      ]);
    }
    return rows;
  }

  if (openSection === 'ai') {
    rows.push([
      { text: '🤖 هوش مصنوعی دلارینو', callback_data: 'tg_mode_simple_ai', style: 'success' },
      { text: '📊 استراتژی دُرنا V1', callback_data: 'tg_hunt_ready', style: 'primary' },
    ]);
    rows.push([
      { text: '🎛 روشن/خاموش ۵ موتور همزمان', callback_data: 'tg_engines_menu', style: 'primary' },
      { text: '💰 بودجه ربات و اهرم', callback_data: 'tg_trade_quantities' },
    ]);
    rows.push([
      { text: '🔄 کپی‌ترید', callback_data: 'tg_copy_list' },
      { text: '🧠 آموزش به هوش مصنوعی من', callback_data: 'tg_myai' },
    ]);
    rows.push([
      {
        text: uiMode === 'simple' ? '⚡ حالت حرفه‌ای' : '🌱 حالت ساده',
        callback_data: 'tg_toggle_ui_mode',
      },
      { text: '🚀 راه‌اندازی ۴ مرحله', callback_data: 'tg_simple_wizard:1' },
    ]);
  }

  if (openSection === 'hunt') {
    rows.push([
      { text: '🎯 اسکن زنده زیر ۵ دقیقه ⚡', callback_data: 'tg_sniper_scan_5m', style: 'success' },
      { text: '🔥 مومنتوم ۱ ساعته', callback_data: 'tg_sniper_scan_1h', style: 'primary' },
    ]);
    rows.push([
      { text: '⚡️ استراتژی‌های آماده', callback_data: 'tg_hunt_ready' },
      ...(hasHttps
        ? [{ text: '🌐 اسنایپر کامل در مینی‌اپ', web_app: { url: `${base}/?tab=sniper` } }]
        : [{ text: '🛠 استراتژی شخصی', callback_data: 'tg_hunt_personal' }]),
    ]);
  }

  if (openSection === 'copy') {
    rows.push([
      { text: '📋 تریدرهای تاییدشده', callback_data: 'tg_copy_list', style: 'success' },
      { text: '🐋 نهنگ‌ها و سبد ارزها (V2)', callback_data: 'tg_copy_smart_v2', style: 'primary' },
    ]);
    if (hasHttps) {
      rows.push([{ text: '🌐 باز کردن هاب کپی‌ترید در مینی‌اپ', web_app: { url: `${base}/?tab=copy` } }]);
    }
  }

  if (openSection === 'trust') {
    rows.push([
      { text: '🛡 وضعیت و اتصال Trust Wallet', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🔍 رادار کامل DEX + خرید مستقیم', callback_data: 'tg_dex_trending', style: 'success' },
    ]);
    rows.push([
      { text: '🔎 جستجوی توکن', callback_data: 'tg_dex_search' },
      { text: '💰 کارمزد ۳٪ سود (رایگان)', callback_data: 'tg_open_sub' },
    ]);
  }

  if (openSection === 'tools') {
    rows.push([
      { text: '📊 معاملات و تراز ۵ بخش', callback_data: 'tg_simple_positions', style: 'primary' },
      { text: '📡 آلرت رایگان TradingView', callback_data: 'tg_tv_alerts', style: 'success' },
    ]);
    rows.push([
      { text: '🧩 اکستنشن کروم / فایرفاکس / اج', callback_data: 'tg_ext_widgets' },
      { text: '📊 صدور کارت سود', callback_data: 'tg_profit_card' },
    ]);
    rows.push([
      { text: '🛡 راهنمای ۵ بخش Trust Wallet', callback_data: 'tg_tw_playbook' },
      { text: '🌐 ورود سریع به سایت', callback_data: 'tg_web_login' },
    ]);
  }

  rows.push([
    ...(hasHttps ? [{ text: '🚀 باز کردن مینی‌اپ', web_app: { url: fullUrl }, style: 'success' as const }] : []),
    { text: uiMode === 'simple' ? '🔙 بازگشت به پنل ساده' : '🔙 بستن منو', callback_data: uiMode === 'simple' ? 'tg_simple_home' : 'tg_acc:none' },
  ]);

  return rows;
}

export interface SimpleSiteDashboardInput {
  isRunning: boolean;
  tradingMode: 'PAPER' | 'LIVE';
  execMode: 'AUTO' | 'MANUAL_CONFIRM';
  balanceUsd: number;
  tomanRate: number;
  budgetMode: 'FULL_BALANCE' | 'FIXED_USD';
  budgetUsd: number;
  maxLeverage: number;
  useSignalLeverage: boolean;
  activeEngineLabels: string[];
  freeTradesRemaining: number;
  freeTradesLimit: number;
  isFeeExempt: boolean;
  onboardingDone: boolean;
  modes: {
    futures: { openCount: number; lockedMarginUsd: number; netUsd: number };
    spot: { openCount: number; lockedMarginUsd: number; netUsd: number };
    dex: { openCount: number; lockedMarginUsd: number; netUsd: number };
    sniper: { openCount: number; lockedMarginUsd: number; netUsd: number };
    copy: { openCount: number; lockedMarginUsd: number; netUsd: number };
  };
  totalOpenCount: number;
  netPnlUsd: number;
}

export function formatSimpleSiteDashboard(p: SimpleSiteDashboardInput): string {
  const statusLine = p.isRunning ? '🟢 **ربات روشن و فعال**' : '🔴 **ربات متوقف**';
  const accountLine = p.tradingMode === 'LIVE' ? '🛡 **حساب واقعی (Trust Wallet)**' : '🧪 **حساب دمو آزمایشی**';
  const execLine = p.execMode === 'AUTO' ? '⚡ خودکار ۲۴/۷' : '✋ قبلش بپرسه';
  const budgetLine = p.budgetMode === 'FIXED_USD' && p.budgetUsd > 0 ? `$${p.budgetUsd.toLocaleString('en-US')}` : 'کل موجودی';
  const levLine = p.useSignalLeverage ? 'پیشنهادی (هوشمند)' : `${p.maxLeverage}× دستی`;
  const feeLine = p.isFeeExempt
    ? '۰٪ کارمزد (حساب مدیریت ∞)'
    : `${p.freeTradesRemaining}/${p.freeTradesLimit} برد اول ۰٪ · سپس ۳٪ از سود`;
  const enginesLine = p.activeEngineLabels.length
    ? `🟢 **${p.activeEngineLabels.length}/5 فعال:** ${p.activeEngineLabels.join(' · ')}`
    : '⚪️ **0/5 موتور روشن** (پیش‌فرض خاموش — برای شروع از «🎛 ۵ موتور» انتخاب کنید)';
  const pnlSign = p.netPnlUsd >= 0 ? '+' : '-';
  const gateBanner = !p.onboardingDone
    ? `\n⚠️ **گام الزامی اول:** پیش از اولین معامله، دکمه «✅ انتخاب حساب و تایید قوانین ریسک» را بزنید.\n`
    : '';

  return (
    `🌱 **پنل ساده دلارینو (V11.9.1 · همگام با سایت)**\n` +
    `━━━━━━━━━━━━━━\n` +
    `${statusLine}  |  ${accountLine}\n` +
    `💵 **موجودی:** \`$${p.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: p.balanceUsd < 100 ? 2 : 0, maximumFractionDigits: 2 })}\` (≈ **${formatToman(p.balanceUsd, p.tomanRate)} تومان**)\n` +
    `⚙️ **اجرا:** ${execLine}  |  🎚 **بودجه / اهرم:** ${budgetLine} · ${levLine}\n` +
    `🎁 **کارمزد:** ${feeLine}\n` +
    `${enginesLine}\n` +
    gateBanner +
    `\n📊 **تراز یکپارچه ۵ موتور (${p.totalOpenCount} باز · خالص ${pnlSign}$${Math.abs(p.netPnlUsd).toFixed(2)}):**\n` +
    `• فیوچرز: ${p.modes.futures.openCount} باز (\`$${p.modes.futures.lockedMarginUsd.toFixed(1)}\`)  |  اسپات: ${p.modes.spot.openCount} باز (\`$${p.modes.spot.lockedMarginUsd.toFixed(1)}\`)\n` +
    `• DEX: ${p.modes.dex.openCount} باز (\`$${p.modes.dex.lockedMarginUsd.toFixed(1)}\`)  |  اسنایپر: ${p.modes.sniper.openCount} باز  |  کپی‌ترید: ${p.modes.copy.openCount} باز`
  );
}

export function simpleSiteHomeInlineKeyboard(params: {
  webAppUrl: string;
  isBotRunning: boolean;
  activeEnginesCount: number;
  totalOpenCount: number;
  onboardingDone: boolean;
}): InlineKeyboardButton[][] {
  const base = (params.webAppUrl || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const hasHttps = base.startsWith('https://');
  const rows: InlineKeyboardButton[][] = [];

  if (!params.onboardingDone) {
    rows.push([
      {
        text: '✅ گام اول: انتخاب حساب و تایید قوانین ریسک',
        callback_data: 'tg_onboard_prompt',
        style: 'success',
      },
    ]);
  }

  rows.push([
    {
      text: params.isBotRunning ? '🔴 توقف ربات' : '🟢 روشن کردن ربات',
      callback_data: 'tg_bot_toggle',
      style: params.isBotRunning ? 'danger' : 'success',
    },
    {
      text: '⚡️ شکار فوری AI',
      callback_data: 'tg_instant_ai_trade',
      style: 'primary',
    },
  ]);

  rows.push([
    {
      text: `🎛 ۵ موتور (${params.activeEnginesCount}/5)`,
      callback_data: 'tg_engines_menu',
      style: 'primary',
    },
    {
      text: '💼 دمو / واقعی و بودجه',
      callback_data: 'tg_simple_wallet_mode',
    },
  ]);

  rows.push([
    {
      text: `📊 معاملات (${params.totalOpenCount}) و تراز ۵ بخش`,
      callback_data: 'tg_simple_positions',
    },
    {
      text: '🎯 اسنایپر زیر ۵ دقیقه',
      callback_data: 'tg_sniper_scan_5m',
      style: 'success',
    },
  ]);

  rows.push([
    {
      text: '🛠 ابزارها (تراست‌ولت · کپی · AI · اکستنشن)',
      callback_data: 'tg_more_tools',
    },
    {
      text: '🔄 تازه‌سازی',
      callback_data: 'tg_simple_home',
    },
  ]);

  if (hasHttps) {
    rows.push([
      {
        text: '🚀 باز کردن حالت ساده در مینی‌اپ سایت',
        web_app: { url: `${base}/?ui_mode=simple` },
        style: 'success',
      },
    ]);
  }

  return rows;
}

function isPublicTelegramButtonUrl(url: string): boolean {
  const u = (url || '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/i.test(u)) return false;
  return true;
}

export function channelSignalInlineButtons(params: {
  signalId: string;
  botUsername: string;
  webAppUrl: string;
  forChannel: boolean;
  resultsChannelInvite?: string;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '');
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const resultsUrl = (params.resultsChannelInvite || '').trim();
  const webOk = isPublicTelegramButtonUrl(baseWeb);

  if (params.forChannel) {
    const row1: InlineKeyboardButton[] = [];
    if (cleanBot) {
      row1.push(
        {
          text: '🤖 ترید در ربات',
          url: `https://t.me/${cleanBot}?start=sig_${params.signalId}`,
          style: 'success',
        },
        {
          text: '⚡️ تایید و اجرا',
          url: `https://t.me/${cleanBot}?start=exec_${params.signalId}`,
          style: 'primary',
        }
      );
    }
    const row2: InlineKeyboardButton[] = [];
    if (isPublicTelegramButtonUrl(resultsUrl)) {
      row2.push({
        text: '🏆 نتایج سیگنال دلارینو',
        url: resultsUrl,
      });
    }
    if (webOk) {
      row2.push({
        text: '📊 مشاهده در سایت',
        url: `${baseWeb}/?signal=${params.signalId}`,
      });
    }
    return [row1, row2].filter((r) => r.length > 0);
  }

  return [
    [
      {
        text: 'دلارینو ترید کن برام 🤖',
        callback_data: `manual_trade:${params.signalId}`,
        style: 'success',
      },
      {
        text: 'تایید سریع و اجرا ✅',
        callback_data: `manual_confirm:${params.signalId}`,
        style: 'primary',
      },
    ],
    ...(baseWeb.startsWith('https://')
      ? [
          [
            {
              text: '📊 تحلیل و جزئیات در مینی‌اپ',
              web_app: { url: `${baseWeb}/?signal=${params.signalId}` },
            },
          ],
        ]
      : []),
  ];
}

export function channelNewsInlineButtons(params: {
  botUsername: string;
  webAppUrl: string;
  customButtonLabel?: string;
  customButtonUrl?: string;
  signalsChannelInvite?: string;
  resultsChannelInvite?: string;
  officialChannelInvite?: string;
  newsChannelInvite?: string;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '');
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const firstRow: InlineKeyboardButton[] = [];
  if (cleanBot) {
    firstRow.push({
      text: `🤖 ربات @${cleanBot}`,
      url: `https://t.me/${cleanBot}`,
      style: 'primary',
    });
  }
  if (isPublicTelegramButtonUrl(baseWeb)) {
    firstRow.push({
      text: '🚀 پنل هوشمند دلارینو',
      url: baseWeb,
      style: 'success',
    });
  }
  const secondRow: InlineKeyboardButton[] = [];
  if (isPublicTelegramButtonUrl(params.signalsChannelInvite || '')) {
    secondRow.push({
      text: '📡 سیگنال دلارینو',
      url: params.signalsChannelInvite!.trim(),
    });
  }
  if (isPublicTelegramButtonUrl(params.resultsChannelInvite || '')) {
    secondRow.push({
      text: '🏆 نتایج سیگنال',
      url: params.resultsChannelInvite!.trim(),
    });
  }
  const thirdRow: InlineKeyboardButton[] = [];
  if (isPublicTelegramButtonUrl(params.officialChannelInvite || '')) {
    thirdRow.push({
      text: '🌟 چنل رسمی دلارینو',
      url: params.officialChannelInvite!.trim(),
    });
  }
  if (isPublicTelegramButtonUrl(params.newsChannelInvite || '')) {
    thirdRow.push({
      text: '📰 اخبار دلارینو',
      url: params.newsChannelInvite!.trim(),
    });
  }
  const rows: InlineKeyboardButton[][] = [];
  if (firstRow.length > 0) rows.push(firstRow);
  if (secondRow.length > 0) rows.push(secondRow);
  if (thirdRow.length > 0) rows.push(thirdRow);
  if (params.customButtonLabel && isPublicTelegramButtonUrl(params.customButtonUrl || '')) {
    rows.unshift([
      {
        text: params.customButtonLabel,
        url: params.customButtonUrl!.trim(),
      },
    ]);
  }
  return rows;
}

export function copyTradePublishConfirmButtons(copyTradeId: string): InlineKeyboardButton[][] {
  return [
    [
      {
        text: '✅ بله، منتشر و برای کپی‌تریدها ارسال شود',
        callback_data: `copy_pub_yes:${copyTradeId}`,
        style: 'success',
      },
    ],
    [
      {
        text: '❌ خیر، فقط ترید شخصی بماند',
        callback_data: `copy_pub_no:${copyTradeId}`,
        style: 'danger',
      },
    ],
  ];
}

export function settingsKeyboard(isAdmin: boolean, isSuperAdmin = false, uiMode: 'simple' | 'pro' = 'simple') {
  const rows = [
    [{ text: 'اتوترید 🤖' }, { text: 'دستی ترید 💪' }],
    [{ text: '🎛 انتخاب روش ترید' }, { text: '⚖️ اسپات / فیوچرز' }],
    [{ text: '↕️ جهت معاملات' }, { text: 'تنظیم مقادیر معاملات 🪛' }],
    [{ text: 'دریافت موجودی ولت 💳' }, { text: 'دریافت اعلان 🔔' }],
    [
      { text: uiMode === 'simple' ? '⚡ رفتن به حالت حرفه‌ای' : '🌱 رفتن به حالت ساده' },
      { text: '🛡 مدیریت Trust Wallet' },
    ],
  ];
  if (isSuperAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: 'افزودن مدیر 🔑' }]);
  } else if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }]);
  }
  rows.push([{ text: 'بازگشت به صفحه قبل 🔙' }]);
  return rows;
}

export function exchangeSelectionKeyboard() {
  return [
    [{ text: '🛡 اتصال Trust Wallet (تراست‌ولت)' }, { text: '🧪 شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری' }],
    [{ text: '⚡ تایید دستی یا اتوترید ۲۴/۷' }, { text: '📡 آلرت رایگان TradingView' }],
    [{ text: 'بازگشت به صفحه قبل 🔙' }],
  ];
}

export function formatBalanceCard(provider: string, bal: FuturesBalance, irtRate = 290000): string {
  const totalNum = Number(bal.total || 0);
  const toman = Math.round(totalNum * irtRate).toLocaleString('en-US');
  const rial = Math.round(totalNum * irtRate * 10).toLocaleString('en-US');
  return (
    `💳 موجودی حساب (${provider === 'paper' ? 'شبیه‌ساز دمو تراست‌ولت' : 'Trust Wallet Live'}):\n\n` +
    `Free: ${bal.free} ${bal.currency}\n` +
    `Used: ${bal.used} ${bal.currency}\n` +
    `Total: ${bal.total} ${bal.currency}\n` +
    `🇮🇷 معادل لحظه‌ای: **${toman} تومان** (${rial} ریال)\n` +
    `📌 نرخ تتر ایران: ${Math.round(irtRate).toLocaleString('en-US')} تومان` +
    (OFFICIAL_CHANNEL_HANDLE ? `\n\n🆔 ${OFFICIAL_CHANNEL_HANDLE}` : '')
  );
}

export function formatTradeOpenedCard(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  exchange: string;
  entryPrice: string;
  leverage: number;
  marginUsed: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  engineKey?: string;
  engineLabel?: string;
}) {
  const engineStr = resolveEngineDisplayLabel(params.engineKey, params.engineLabel);
  return (
    `📣 باز شدن معامله جدید (${params.exchange.toUpperCase()})\n` +
    `⚙️ موتور: ${engineStr}\n\n` +
    `${params.direction === 'LONG' ? '🟢 لانگ (BUY)' : '🔴 شورت (SELL)'} | 💲 ${params.symbol}\n` +
    `🔔 قیمت ورود (Market): ${params.entryPrice}\n` +
    `🔘 لوریج: ${params.leverage}x\n` +
    `💰 مارجین درگیر: ${params.marginUsed} USDT\n` +
    `⛔️ SL اولیه: ${params.stopLoss}\n` +
    `🟢 TP1 (${params.tp1Pct}% + ریسک‌فری): ${params.tp1}\n` +
    (params.tp2 ? `🟡 TP2 (${params.tp2Pct}% + SL→TP1): ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3 (${params.tp3Pct}%): ${params.tp3}\n` : '') +
    `🕒 زمان ورود: ${formatIranDateTime(new Date().toISOString())}` +
    (OFFICIAL_CHANNEL_HANDLE ? `\n🆔 ${OFFICIAL_CHANNEL_HANDLE}` : '')
  );
}

export function formatTradeClosedCard(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  exitPrice: string;
  pnlUsd: number;
  pnlPct: number;
  reason: string;
  openedAt?: string | null;
  closedAt?: string | null;
  stopLoss?: string;
  tp1?: string;
  leverage?: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  trailingActive?: boolean;
  trailingSl?: string;
  engineKey?: string;
  engineLabel?: string;
  mode?: 'LIVE' | 'PAPER';
}) {
  const win = params.pnlUsd >= 0;
  const header = win ? 'تبریک میگم 🤑' : 'بسته‌شدن معامله با مدیریت ریسک 🛡';
  const entryTime = formatIranDateTime(params.openedAt);
  const exitTime = formatIranDateTime(params.closedAt ?? new Date().toISOString());
  const engineName = resolveEngineDisplayLabel(params.engineKey, params.engineLabel);
  const signPnl = `${params.pnlUsd >= 0 ? '+' : '-'}$${Math.abs(params.pnlUsd).toFixed(2)}`;
  const signPct = `${params.pnlPct >= 0 ? '+' : '-'}${Math.abs(params.pnlPct).toFixed(2)}%`;

  const tpSummary = [
    `TP1: ${params.tp1Hit ? '✅ فعال شد' : '⏳ نرسید'}`,
    `TP2: ${params.tp2Hit ? '✅ فعال شد' : '⏳ نرسید'}`,
    `TP3: ${params.tp3Hit ? '✅ کامل شد' : '⏳ نرسید'}`,
  ].join(' | ');

  const trailSummary = params.trailingActive
    ? `🛡 Trailing SL فعال‌شده (${params.trailingSl || 'Risk-Free'})`
    : `⛔️ SL ثابت (${params.trailingSl || params.stopLoss || '—'})`;

  return (
    `${header}\n\n` +
    `⚙️ موتور: ${engineName}\n` +
    `🏷 نوع حساب: ${params.mode === 'LIVE' ? 'حساب واقعی (LIVE)' : 'حساب دمو / شبیه‌ساز'}\n` +
    `💲 نماد: ${params.symbol} (${params.direction} · ${params.leverage ?? 1}x)\n` +
    `🕒 تایم ورود: ${entryTime}\n` +
    `🏁 تایم خروج: ${exitTime}\n` +
    `📥 قیمت ورود: ${params.entryPrice}\n` +
    `📤 قیمت خروج: ${params.exitPrice}\n` +
    `${win ? '🟢 سود خالص' : '🛡 نتیجه خالص'}: ${signPnl} (${signPct})\n` +
    `🎯 وضعیت تارگت‌ها: ${tpSummary}\n` +
    `${trailSummary}\n` +
    `📌 نتیجه: ${params.reason}\n\n` +
    `استراتژی:\n` +
    `• لوریج: ${params.leverage ?? 1}x | SL اولیه: ${params.stopLoss ?? '—'} | TP1: ${params.tp1 ?? '—'}` +
    (OFFICIAL_CHANNEL_HANDLE ? `\n🆔 ${OFFICIAL_CHANNEL_HANDLE}` : '')
  );
}

export function formatAccountCard(params: {
  telegramId: string;
  username: string;
  email: string;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  trustWalletAddress?: string | null;
  uiMode?: 'simple' | 'pro';
  walletUsdt: number;
  tomanRate: number;
  planNameFa: string;
  hasPaidPlan: boolean;
  daysRemaining: number;
  subStart?: string | null;
  subEnd?: string | null;
  tradingMode: string;
  execMode: string;
  totalTrades: number;
  wins: number;
  totalPnl: number;
}): string {
  const walletToman = formatToman(params.walletUsdt, params.tomanRate);
  const walletRial = formatRial(params.walletUsdt, params.tomanRate * 10);
  const shortTw = params.trustWalletAddress
    ? `${params.trustWalletAddress.slice(0, 6)}...${params.trustWalletAddress.slice(-4)}`
    : 'متصل نشده (از دکمه Trust Wallet متصل کنید)';
  return (
    `👤 اطلاعات حساب کاربری دلارینو (Trust Wallet Only)\n\n` +
    `👤 نام: ${params.username}\n` +
    `📱 شماره تماس احرازشده: ${params.phoneVerified && params.phoneNumber ? `${params.phoneNumber} ✅` : 'تایید نشده'}\n` +
    `🛡 کیف‌پول Trust Wallet: ${shortTw}\n` +
    `🎛 حالت رابط ربات: ${params.uiMode === 'pro' ? 'حالت حرفه‌ای ⚡' : 'حالت ساده 🌱'}\n` +
    `🆔 آیدی عددی: ${params.telegramId}\n` +
    `📧 حساب وب: ${params.email.endsWith('.local') ? 'ورود با تلگرام (از دکمه ورود سریع استفاده کنید)' : params.email}\n` +
    `💰 موجودی کل: $${params.walletUsdt.toFixed(2)} | ${walletToman} تومان (${walletRial} ریال)\n` +
    `🌐 نرخ لحظه‌ای تتر ایران: ${Math.round(params.tomanRate).toLocaleString('en-US')} تومان\n\n` +
    `✅ دسترسی پلتفرم: **۱۰۰٪ رایگان بدون اشتراک ماهانه**\n` +
    `💎 مدل هزینه سرور: **کیف‌پول دمو رایگان · ۳ معامله سودده اول ۰٪ · سپس ۳٪ کارمزد فقط از سود واقعی**\n` +
    `📌 حداقل موجودی حساب واقعی: **$10 USD** (دمو قابل تنظیم از $50 تا $10M رایگان)\n\n` +
    `⚙️ حالت معامله: ${params.tradingMode} | ${params.execMode === 'AUTO' ? 'اتوترید 🤖' : 'دستی ترید 💪'}\n` +
    `📊 معاملات بسته: ${params.totalTrades} (برد: ${params.wins})\n` +
    `📈 نتیجه خالص: ${params.totalPnl >= 0 ? '+' : '-'}$${Math.abs(params.totalPnl).toFixed(2)}\n\n` +
    `${ANTI_SCAM_WARNING_FA}`
  );
}

/**
 * Distinct, specialized signal card for Engine #5: Listing & Meme Sniper.
 */
export function formatSniperSignalCard(params: {
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
  channelHandle?: string;
}): string {
  const srcLabel =
    params.source === 'CEX_NEW_LISTING'
      ? '🆕 لیستینگ جدید صرافی معتبر (CEX Listing)'
      : '🔥 استخر انفجاری DEX / میم‌کوین ایمن';
  const ageStr =
    params.ageMinutes !== null && params.ageMinutes !== undefined
      ? params.ageMinutes < 60
        ? `${params.ageMinutes.toFixed(1)} دقیقه`
        : `${(params.ageMinutes / 60).toFixed(1)} ساعت`
      : 'جدید';
  const safetyBadge =
    params.safetyScore >= 85 ? '🛡 عالی (ایمن)' : params.safetyScore >= 75 ? '✅ تاییدشده' : '⚠️ ریسک متوسط';
  const pxStr = params.priceUsd >= 1 ? params.priceUsd.toFixed(4) : params.priceUsd.toPrecision(4);
  const tpStr = params.tpUsd >= 1 ? params.tpUsd.toFixed(4) : params.tpUsd.toPrecision(4);
  const slStr = params.slUsd >= 1 ? params.slUsd.toFixed(4) : params.slUsd.toPrecision(4);

  return (
    `🎯 **سیگنال اختصاصی اسنایپر شکارچی (Sniper V2)**\n` +
    `🏷 موتور: شکار لیستینگ و میم‌کوین${params.modeLabel ? ` · ${params.modeLabel}` : ''}\n` +
    `━━━━━━━━━━━━━━\n` +
    `🪙 **${params.symbol}**${params.name ? ` (${params.name})` : ''} · 🌐 شبکه: **${params.chainId.toUpperCase()}**\n` +
    `📡 منبع: ${srcLabel}\n` +
    `🏛 صرافی DEX: \`${params.dexId.toUpperCase()}\` | ⏱ عمر استخر: **${ageStr}**\n` +
    `📜 قرارداد (Contract):\n\`${params.tokenAddress}\`\n\n` +
    `🔐 امنیت آن‌چین: **${params.safetyScore}/100** (${safetyBadge})\n` +
    `💧 نقدینگی: **$${Math.round(params.liquidityUsd).toLocaleString('en-US')}**` +
    (params.mcapUsd ? ` | 💎 MCap: **$${Math.round(params.mcapUsd).toLocaleString('en-US')}**` : '') +
    `\n` +
    (params.change5mPct !== undefined || params.change1hPct !== undefined
      ? `📈 مومنتوم: 5m \`${(params.change5mPct ?? 0) >= 0 ? '+' : ''}${(params.change5mPct ?? 0).toFixed(1)}%\` | 1h \`${(params.change1hPct ?? 0) >= 0 ? '+' : ''}${(params.change1hPct ?? 0).toFixed(1)}%\`` +
        (params.buySellRatio1h ? ` | نسبت خرید/فروش: **${params.buySellRatio1h}x**` : '') +
        `\n\n`
      : '\n') +
    `📥 **قیمت ورود لحظه‌ای:** \`$${pxStr}\`\n` +
    `🎯 **تارگت سود (+${params.tpPct}%):** \`$${tpStr}\`\n` +
    `⛔️ **حد ضرر حفاظتی (-${params.slPct}%):** \`$${slStr}\`\n` +
    (params.slippagePct ? `⚙️ اسلیپیج مجاز: ${params.slippagePct}%\n` : '') +
    `🕒 زمان رصد: ${formatIranDateTime(new Date().toISOString())}` +
    (params.channelHandle ? `\n🆔 ${params.channelHandle}` : '')
  );
}

/**
 * Distinct, specialized signal card for Engine #4: Copy-Trade & Smart Whale Wallets.
 */
export function formatCopyTradeSignalCard(params: {
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
  channelHandle?: string;
}): string {
  const dirUp = String(params.direction || 'BUY').toUpperCase();
  const isLong = dirUp === 'LONG' || dirUp === 'BUY';
  const dirText = isLong ? '🟢 ورود / خرید (LONG)' : '🔴 فروش / شورت (SHORT)';
  const kindLabel =
    params.traderKind === 'SMART_WALLET'
      ? '🐋 ولت نهنگ هوشمند آن‌چین (Smart Wallet)'
      : '🏆 تریدر حرفه‌ای تاییدشده دلارینو';

  return (
    `🏆 **سیگنال اختصاصی کپی‌ترید هوشمند (Copy-Trade)**\n` +
    `⚙️ موتور: آینه‌سازی تریدرهای برتر و نهنگ‌ها\n` +
    `━━━━━━━━━━━━━━\n` +
    `👤 مرجع سیگنال: **${params.traderName}**\n` +
    `📡 منبع: ${kindLabel}${params.chainId ? ` · 🌐 شبکه: **${params.chainId.toUpperCase()}**` : ''}\n` +
    (params.traderWinRate || params.traderRoi30d
      ? `📊 سابقه تریدر: نرخ برد **${params.traderWinRate ?? '—'}%** · بازده ۳۰روزه **${(params.traderRoi30d ?? 0) >= 0 ? '+' : ''}${params.traderRoi30d ?? '—'}%**\n`
      : '') +
    `\n` +
    `💲 نماد: **${params.symbol}** | جهت: ${dirText}` +
    (params.leverage && params.leverage > 1 ? ` · اهرم **${params.leverage}x**` : '') +
    `\n` +
    `📥 **قیمت ورود تریدر:** \`$${params.entryPrice}\`\n` +
    (params.stopLoss ? `⛔️ **حد ضرر پیشنهادی:** \`$${params.stopLoss}\`\n` : '') +
    (params.tp1 ? `🎯 **تارگت سود ۱:** \`$${params.tp1}\`\n` : '') +
    (params.traderAmountUsd ? `💼 حجم حرکت تریدر مرجع: **$${Math.round(params.traderAmountUsd).toLocaleString('en-US')}**\n` : '') +
    (params.userAllocUsd ? `💰 سهم تخصیص کپی شما: **$${Number(params.userAllocUsd).toFixed(2)}**\n` : '') +
    (params.actionNote ? `📝 توضیح: ${params.actionNote}\n` : '') +
    `🕒 زمان ثبت: ${formatIranDateTime(new Date().toISOString())}` +
    (params.channelHandle ? `\n🆔 ${params.channelHandle}` : '')
  );
}

