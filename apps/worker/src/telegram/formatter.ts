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
      ? `🌱 **حالت ساده فعال است (هماهنگ با نسخه جدید سایت V11.7):** مدیریت سریع کل پلتفرم، سوئیچ آنی دمو/واقعی، انتخاب ۵ موتور ترید هم‌زمان، کارت‌های سود یکپارچه و تنظیم دقیق اعلان‌ها.`
      : `⚡ **حالت حرفه‌ای (Quant Pro V11.7) فعال است:** دسترسی هم‌زمان به رادار زنده DexScreener + خرید مستقیم، کپی‌ترید هوشمند و سبد نهنگ‌ها، دُرنا V1، کارت‌های سود ۱۶:۹ و ۹:۱۶، ۲۵+ آلرت TradingView و اکستنشن کروم.`;
  return (
    `🚀 به **دلارینو V11.7** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `${modeSummary}\n\n` +
    `✨ **امکانات نسخه جدید حساب شما:**\n` +
    `🧠 **هوش مصنوعی اختصاصی + تحلیل چارت + پیشنهاد صریح خرید/عدم خرید در DEX**\n` +
    `🎯 **خرید مستقیم توکن‌های رادار داخل سایت با تنظیمات از پیش تعیین‌شده اسنایپر**\n` +
    `🐋 **کپی‌ترید حرفه‌ای V2 با نمایش سبد ارزهای کیف‌پول هر تریدر و فیلتر هولدر/اسکلپر**\n` +
    `🛡 **۱۰۰٪ غیرامانی با Trust Wallet** (۳ معامله سودده اول رایگان ۰٪، سپس فقط ۳٪ کارمزد از سود خالص · دمو رایگان قابل تنظیم)\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `🌐 وب‌سایت رسمی دلارینو: ${cleanWeb}\n` +
    `${CREATOR_ATTRIBUTION_FA}\n\n` +
    `🛡 هیچ بازدهی تضمین‌شده‌ای یا ساختار پانزی وجود ندارد؛ کل سرمایه در کیف‌پول شخصی خودتان است.\n` +
    `**دلارینو؛ هوشمندانه‌تر معامله کنید.**`
  );
}

export function mainMenuKeyboard(webAppUrl?: string, uiMode: 'simple' | 'pro' = 'simple', isAdmin = false): ReplyKeyboardButton[][] {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  const rows: ReplyKeyboardButton[][] =
    uiMode === 'simple'
      ? [
          [{ text: '🤖 شروع / توقف ربات' }, { text: '⚡️ شکار فوری AI' }],
          [{ text: '🎛 ۵ موتور ترید همزمان' }, { text: '💰 حالت دمو/واقعی و بودجه' }],
          [{ text: '📊 معاملات باز و پورتفوی' }, { text: '🏆 کپی‌ترید حرفه‌ای (V2)' }],
          [{ text: '🔍 رادار DEX & خرید مستقیم' }, { text: '🎯 اسنایپر زیر ۵ دقیقه' }],
          [{ text: 'کارت سود دلارینو 📊' }, { text: 'اعلان‌ها 🔔' }, { text: '🧠 هوش مصنوعی من / چت AI' }],
          [{ text: '🛡 Trust Wallet و کارمزد ۳٪' }, { text: '💬 پشتیبانی' }, { text: '⚡ حالت حرفه‌ای' }],
        ]
      : [
          [{ text: '🟢 شروع خودکار ربات' }, { text: '⚡️ شکار فوری AI' }],
          [{ text: '🎛 انتخاب ۵ موتور ترید' }, { text: '💰 بودجه مجاز و اهرم' }],
          [{ text: '📈 معاملات باز و پورتفوی' }, { text: '🔍 رادار DEX & خرید مستقیم' }, { text: '🏆 کپی‌ترید حرفه‌ای (V2)' }],
          [{ text: '🧠 چت هوش مصنوعی (عکس چارت)' }, { text: '🤖 هوش مصنوعی من' }, { text: '🎯 اسنایپر و استراتژی' }],
          [{ text: '🛡 اتصال Trust Wallet' }, { text: '📡 آلرت رایگان TradingView' }, { text: '🧩 اکستنشن کروم V11.7' }],
          [{ text: '💰 کارمزد ۳٪ سود (رایگان)' }, { text: 'کارت سود دلارینو 📊' }, { text: 'تنظیمات ⚙️' }],
          [{ text: '💬 پشتیبانی' }, { text: 'راهنما 📚' }, { text: '🌱 رفتن به حالت ساده' }],
        ];
  if (isAdmin && safeUrl) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: '🚀 باز کردن مینی‌اپ', web_app: { url: safeUrl } }]);
  } else if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }]);
  } else if (safeUrl) {
    rows.push([{ text: '🚀 باز کردن مینی‌اپ دلارینو', web_app: { url: safeUrl } }]);
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
      { text: '📈 معاملات باز و بستن آنی', callback_data: 'tg_positions' },
      { text: '📡 آلرت رایگان TradingView', callback_data: 'tg_tv_alerts', style: 'success' },
    ]);
    rows.push([
      { text: '🧩 اکستنشن کروم V11.7', callback_data: 'tg_ext_widgets' },
      { text: '📊 صدور کارت سود', callback_data: 'tg_profit_card' },
    ]);
    rows.push([
      { text: '🌐 ورود سریع به سایت', callback_data: 'tg_web_login' },
      ...(hasHttps ? [{ text: '⚙️ صفحه خدمات سایت', web_app: { url: `${base}/?tab=services` } }] : []),
    ]);
  }

  rows.push([
    ...(hasHttps ? [{ text: '🚀 باز کردن مینی‌اپ', web_app: { url: fullUrl }, style: 'success' as const }] : []),
    { text: '🔙 بستن منو', callback_data: 'tg_acc:none' },
  ]);

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
