import { resolveEngineDisplayLabel } from '@dollarino/core';
import type { FuturesBalance } from '../exchanges/base.js';
import type { InlineKeyboardButton, ReplyKeyboardButton } from './client.js';

export const OFFICIAL_CHANNEL_HANDLE = '@Dollarino_official';
export const OFFICIAL_BOT_HANDLE = '@Dollarino_bot';
export const ANTI_SCAM_WARNING_FA =
  '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. ثبت‌نام، ورود و پشتیبانی رسمی فقط از طریق ربات @Dollarino_bot و پشتیبانی آنلاین داخل سایت انجام می‌شود.';

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

export function formatToman(usdt: number, rate = 70000): string {
  return Math.round(usdt * rate).toLocaleString('en-US');
}

export function preAuthIntroMessage(firstName: string): string {
  return (
    `🌟 به پلتفرم هوشمند ترید **دلارینو (Dollarino)** خوش آمدید، ${firstName || 'دوست عزیز'}!\n\n` +
    `📌 **دلارینو چیست و چگونه کار می‌کند؟**\n` +
    `دلارینو یک دستیار و میز معامله تمام‌خودکار ۲۴ ساعته برای بازارهای کریپتو (اسپات و فیوچرز) و بازار غیرمتمرکز (DEX) است که هم برای **تازه‌کارها (حالت ساده ۴ گامه)** و هم برای **تریدرهای حرفه‌ای (حالت Quant Pro)** ساخته شده است:\n\n` +
    `⚙️ **۴ موتور معاملاتی هوشمند دلارینو:**\n` +
    `۱. 🧠 **هوش مصنوعی دلارینو:** تحلیل ۲۴ ساعته چارت، نقدینگی و مومنتوم بازار با اجماع چند مدل AI و ترید خودکار.\n` +
    `۲. 🤖 **هوش مصنوعی شخصی من (قابل آموزش):** با چت فارسی استراتژی دلخواهتان را یادش بدهید تا دقیقاً همان را اجرا کند.\n` +
    `۳. 🎯 **استراتژی شکار (دُرنا V1 + کدنویسی Pine/Python):** شکار نقطه‌های ورود دقیق با ۳ تارگت سود، ریسک‌فری و تریلینگ حد ضرر خودکار.\n` +
    `۴. 🏆 **کپی‌ترید تاییدشده:** آینه‌سازی خودکار معاملات تریدرهای برگزیده و ارزیابی‌شده پلتفرم.\n\n` +
    `🔗 **صرافی‌ها، کیف‌پول و ابزارها:**\n` +
    `• اتصال امن API به **Toobit** و **KCEX** (فقط با دسترسی ترید، بدون دسترسی برداشت).\n` +
    `• اتصال غیرامانی **Trust Wallet DApp** + اسکنر زنده **DexScreener** برای شکار و سوآپ توکن‌های داغ.\n` +
    `• صدور **کارت سود رسمی تاییدشده**، **اکستنشن مرورگر کروم**، **ویجت موبایل**، **باشگاه رفرال با درآمد دلاری** و **پشتیبانی هوشمند ۲۴ ساعته**.\n\n` +
    `🔐 **تنها قدم برای ثبت‌نام یا ورود به سایت و ربات:**\n` +
    `برای ساخت حساب امن، باز شدن منوهای کامل ربات و دریافت **لینک ورود فوری به پنل سایت**، کافیست دکمه **«📱 اشتراک‌گذاری شماره تماس من»** در پایین صفحه را لمس کنید تا شماره اکانت تلگرام خودتان تایید شود.\n` +
    `⚠️ شماره شخص ثالث یا پیام فورواردی پذیرفته نمی‌شود.`
  );
}

export function preAuthIntroInlineButtons(): InlineKeyboardButton[][] {
  return [];
}

export function contactVerificationKeyboard(): ReplyKeyboardButton[][] {
  return [
    [{ text: '📱 اشتراک‌گذاری شماره تماس من (ثبت‌نام / ورود)', request_contact: true }],
  ];
}

export function welcomeMessage(firstName: string, uiMode: 'simple' | 'pro' = 'simple'): string {
  const modeTitle = uiMode === 'simple' ? '🌱 حالت ساده (تازه‌کار / ۴ گامه)' : '⚡ حالت حرفه‌ای (Quant Pro)';
  return (
    `سلام خوش اومدی ${firstName || 'دوست عزیز'} 🌹\n\n` +
    `✅ حساب دلارینو شما احراز و فعال است | حالت فعلی: **${modeTitle}**\n\n` +
    (uiMode === 'simple'
      ? `🌱 **راهنمای سریع حالت ساده:**\n` +
        `بدون پیچیدگی، تنها در ۴ قدم ربات را روشن کنید:\n` +
        `• صرافی (Toobit / KCEX) یا کیف‌پول **Trust Wallet** را وصل کنید\n` +
        `• یکی از ۴ موتور آماده را انتخاب کنید (مثلاً هوش مصنوعی دلارینو یا کپی‌ترید)\n` +
        `• دکمه «🚀 راه‌اندازی ۴ مرحله‌ای» یا «🟢 شروع سریع» را بزنید!\n\n`
      : `⚡ **امکانات حالت حرفه‌ای (Quant Pro):**\n` +
        `• کنترل کامل Spot/Futures، جهت معاملات، Hedge و ۴ موتور همزمان\n` +
        `• رصد زنده **DexScreener** و ترید توکن‌های جدید با **Trust Wallet DApp**\n` +
        `• دریافت کلید **اکستنشن مرورگر** و تنظیم **ویجت‌های سریع موبایل**\n\n`) +
    `📢 کانال رسمی: ${OFFICIAL_CHANNEL_HANDLE}\n` +
    `${ANTI_SCAM_WARNING_FA}\n\n` +
    `از منو و دکمه‌های ربات در پایین استفاده کنید:`
  );
}

export function mainMenuKeyboard(webAppUrl?: string, uiMode: 'simple' | 'pro' = 'simple'): ReplyKeyboardButton[][] {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  if (uiMode === 'simple') {
    return [
      [{ text: '🚀 راه‌اندازی ۴ مرحله‌ای ربات' }, { text: '🦊 کیف‌پول Trust Wallet و DEX' }],
      [{ text: 'ربات و هوش مصنوعی من 🤖' }, { text: '🏆 کپی‌ترید تاییدشده' }],
      [{ text: 'حساب کاربری 👤' }, { text: 'خرید اشتراک 💎' }],
      [{ text: 'اتصال به صرافی 🔗' }, { text: '⚡ رفتن به حالت حرفه‌ای' }],
      safeUrl
        ? [{ text: '🚀 ورود به اپلیکیشن دلارینو', web_app: { url: safeUrl } }, { text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }]
        : [{ text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }],
    ];
  }
  return [
    [{ text: '🔍 رادار DexScreener و توکن داغ' }, { text: '🦊 کیف‌پول Trust Wallet و DEX' }],
    [{ text: 'اتصال به صرافی 🔗' }, { text: 'تنظیمات ⚙️' }],
    [{ text: '📈 معاملات باز' }, { text: 'ربات و هوش مصنوعی من 🤖' }],
    [{ text: '🎯 استراتژی شکار' }, { text: '🏆 کپی‌ترید تاییدشده' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'خرید اشتراک 💎' }],
    [{ text: '🧩 اکستنشن و ویجت موبایل' }, { text: '🌱 رفتن به حالت ساده' }],
    safeUrl
      ? [{ text: '🚀 ورود به اپلیکیشن دلارینو', web_app: { url: safeUrl } }, { text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }]
      : [{ text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }],
  ];
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
      text: uiMode === 'simple' ? '🌱 حالت ساده فعال است (تغییر به حرفه‌ای ⚡)' : '⚡ حالت حرفه‌ای فعال است (تغییر به ساده 🌱)',
      callback_data: 'tg_toggle_ui_mode',
      style: 'primary',
    },
  ]);

  if (hasHttps) {
    rows.push([
      {
        text: '🚀 باز کردن پنل وب و موبایل دلارینو',
        web_app: { url: fullUrl },
        style: 'success',
      },
    ]);
  }

  if (uiMode === 'simple') {
    rows.push([
      { text: '🚀 راه‌اندازی گام‌به‌گام (۴ مرحله)', callback_data: 'tg_simple_wizard:1', style: 'primary' },
      {
        text: isBotRunning ? '🔴 توقف فوری ربات' : '🟢 شروع سریع ربات',
        callback_data: 'tg_bot_toggle',
        style: isBotRunning ? 'danger' : 'success',
      },
    ]);
  }

  // Engine 1 & 2: Dollarino AI + Raw Personal AI
  rows.push([
    {
      text: `${openSection === 'ai' ? '▾' : '▸'} 🧠 ۱ و ۲: هوش مصنوعی دلارینو و هوش مصنوعی خام`,
      callback_data: `tg_acc:${openSection === 'ai' ? 'none' : 'ai'}`,
      style: 'primary',
    },
  ]);
  if (openSection === 'ai') {
    rows.push([
      { text: '🧠 هوش مصنوعی دلارینو (اتومات)', callback_data: 'tg_mode_simple_ai', style: 'success' },
      { text: '🤖 آموزش به هوش مصنوعی من', callback_data: 'tg_myai', style: 'primary' },
    ]);
    rows.push([
      {
        text: isBotRunning ? '🔴 توقف ربات خودکار' : '🟢 روشن کردن ربات خودکار',
        callback_data: 'tg_bot_toggle',
        style: isBotRunning ? 'danger' : 'success',
      },
      { text: '📊 صدور کارت سود رسمی', callback_data: 'tg_profit_card' },
    ]);
  }

  // Engine 3: Hunting Strategy (Ready + Personal)
  rows.push([
    {
      text: `${openSection === 'hunt' ? '▾' : '▸'} 🎯 ۳: استراتژی شکار (دُرنا V1 + شخصی)`,
      callback_data: `tg_acc:${openSection === 'hunt' ? 'none' : 'hunt'}`,
      style: 'primary',
    },
  ]);
  if (openSection === 'hunt') {
    rows.push([
      { text: '⚡️ فعال‌سازی استراتژی شکار', callback_data: 'tg_hunt_ready', style: 'success' },
      ...(hasHttps
        ? [{ text: '🛠 استراتژی شخصی (IDE)', web_app: { url: `${base}/?tab=radar` } }]
        : [{ text: '🛠 استراتژی شخصی', callback_data: 'tg_hunt_personal' }]),
    ]);
  }

  // Engine 4: Verified Copy Trade
  rows.push([
    {
      text: `${openSection === 'copy' ? '▾' : '▸'} 🏆 ۴: کپی‌ترید تاییدشده دلارینو`,
      callback_data: `tg_acc:${openSection === 'copy' ? 'none' : 'copy'}`,
      style: 'success',
    },
  ]);
  if (openSection === 'copy') {
    rows.push([
      { text: '📋 لیست تریدرهای تاییدشده', callback_data: 'tg_copy_list', style: 'success' },
      ...(hasHttps
        ? [{ text: '🌐 مدیریت کپی‌ترید در اپ', web_app: { url: `${base}/?tab=copy` } }]
        : [{ text: '📈 پوزیشن‌های فعال', callback_data: 'tg_positions' }]),
    ]);
  }

  // Trust Wallet DApp & DexScreener
  rows.push([
    {
      text: `${openSection === 'trust' ? '▾' : '▸'} 🦊 کیف‌پول Trust Wallet و اسکنر DexScreener`,
      callback_data: `tg_acc:${openSection === 'trust' ? 'none' : 'trust'}`,
      style: 'primary',
    },
  ]);
  if (openSection === 'trust') {
    rows.push([
      { text: '🦊 اتصال / وضعیت Trust Wallet', callback_data: 'tg_tw_menu', style: 'primary' },
      { text: '🔍 توکن‌های داغ DexScreener', callback_data: 'tg_dex_trending', style: 'success' },
    ]);
    rows.push([
      { text: '🔎 جستجوی توکن DEX (اسم/آدرس)', callback_data: 'tg_dex_search' },
      { text: '💳 پرداخت اشتراک با تراست‌ولت', callback_data: 'tg_open_sub' },
    ]);
  }

  // Section 5: Account, Widgets, Extension & Online Support
  rows.push([
    {
      text: `${openSection === 'tools' ? '▾' : '▸'} 💎 اشتراک، اکستنشن، ویجت موبایل و پشتیبانی`,
      callback_data: `tg_acc:${openSection === 'tools' ? 'none' : 'tools'}`,
    },
  ]);
  if (openSection === 'tools') {
    rows.push([
      { text: '📈 معاملات باز', callback_data: 'tg_positions' },
      { text: '💎 خرید / تمدید اشتراک', callback_data: 'tg_open_sub', style: 'success' },
    ]);
    rows.push([
      { text: '🧩 کلید اکستنشن و ویجت موبایل', callback_data: 'tg_ext_widgets' },
      { text: '🌐 ورود مستقیم به سایت', callback_data: 'tg_web_login' },
    ]);
    rows.push([
      { text: '💬 پشتیبانی آنلاین', callback_data: 'tg_support_open', style: 'primary' },
    ]);
  }

  return rows;
}

export function channelSignalInlineButtons(params: {
  signalId: string;
  botUsername: string;
  webAppUrl: string;
  forChannel: boolean;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '') || 'Dollarino_bot';
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';

  if (params.forChannel) {
    return [
      [
        {
          text: '🤖 ترید فوری این سیگنال در ربات',
          url: `https://t.me/${cleanBot}?start=sig_${params.signalId}`,
          style: 'success',
        },
        {
          text: '⚡️ تایید و اجرای خودکار',
          url: `https://t.me/${cleanBot}?start=exec_${params.signalId}`,
          style: 'primary',
        },
      ],
      [
        {
          text: '📊 مشاهده چارت و تنظیم اهرم در سایت',
          url: `${baseWeb}/?signal=${params.signalId}`,
        },
      ],
    ];
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
    [
      {
        text: '📊 تحلیل و جزئیات در مینی‌اپ',
        web_app: { url: `${baseWeb}/?signal=${params.signalId}` },
      },
    ],
  ];
}

export function channelNewsInlineButtons(params: {
  botUsername: string;
  webAppUrl: string;
  customButtonLabel?: string;
  customButtonUrl?: string;
}): InlineKeyboardButton[][] {
  const cleanBot = params.botUsername.replace(/^@/, '') || 'Dollarino_bot';
  const baseWeb = params.webAppUrl.replace(/\/$/, '') || 'https://dollarino.pages.dev';
  const rows: InlineKeyboardButton[][] = [
    [
      {
        text: '🤖 ورود به ربات ترید @Dollarino_bot',
        url: `https://t.me/${cleanBot}`,
        style: 'primary',
      },
      {
        text: '🚀 پنل هوشمند دلارینو',
        url: baseWeb,
        style: 'success',
      },
    ],
  ];
  if (params.customButtonLabel && params.customButtonUrl) {
    rows.unshift([
      {
        text: params.customButtonLabel,
        url: params.customButtonUrl,
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

export function settingsKeyboard(isAdmin: boolean, isSuperAdmin = false) {
  const rows = [
    [{ text: 'اتوترید 🤖' }, { text: 'دستی ترید 💪' }],
    [{ text: 'تنظیم نوع بازار (اسپات/فیوچرز) ⚖️' }, { text: 'جهت معاملات (لانگ/شورت) ↕️' }],
    [{ text: 'دریافت موجودی صرافی 💳' }, { text: 'تنظیم مقادیر معاملات 🪛' }],
    [{ text: 'دریافت اعلان 🔔' }, { text: 'تغییر API صرافی 📡' }],
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
    [{ text: '🦊 کیف‌پول Trust Wallet DApp (بدون نیاز به صرافی)' }],
    [{ text: 'Toobit (توبیت - API لایو) 🟢' }, { text: 'KCEX (کی‌سی‌ای‌ایکس - ۰٪ کارمزد) 🔵' }],
    [{ text: 'Paper Mode (حساب آزمایشی با اشتراک) 🧪' }],
    [{ text: 'بازگشت به صفحه قبل 🔙' }],
  ];
}

export function formatBalanceCard(provider: string, bal: FuturesBalance): string {
  return (
    `💳 موجودی حساب فیوچرز (${provider.toUpperCase()}):\n\n` +
    `Free: ${bal.free} ${bal.currency}\n` +
    `Used: ${bal.used} ${bal.currency}\n` +
    `Total: ${bal.total} ${bal.currency}\n\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
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
    `🕒 زمان ورود: ${formatIranDateTime(new Date().toISOString())}\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
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
  const header = win ? 'تبریک میگم 🤑' : 'ضرر هم جزئی از بازار🥲';
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
    `${win ? '🟢 سود خالص' : '🔴 زیان خالص'}: ${signPnl} (${signPct})\n` +
    `🎯 وضعیت تارگت‌ها: ${tpSummary}\n` +
    `${trailSummary}\n` +
    `📌 نتیجه: ${params.reason}\n\n` +
    `استراتژی:\n` +
    `• لوریج: ${params.leverage ?? 1}x | SL اولیه: ${params.stopLoss ?? '—'} | TP1: ${params.tp1 ?? '—'}\n` +
    `🆔 ${OFFICIAL_CHANNEL_HANDLE}`
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
  const shortTw = params.trustWalletAddress
    ? `${params.trustWalletAddress.slice(0, 6)}...${params.trustWalletAddress.slice(-4)}`
    : 'متصل نشده (از منوی Trust Wallet متصل کنید)';
  return (
    `👤 اطلاعات حساب کاربری دلارینو\n\n` +
    `👤 نام: ${params.username}\n` +
    `📱 شماره تماس احرازشده: ${params.phoneVerified && params.phoneNumber ? `${params.phoneNumber} ✅` : 'تایید نشده'}\n` +
    `🦊 کیف‌پول Trust Wallet: ${shortTw}\n` +
    `🎛 حالت رابط ربات: ${params.uiMode === 'pro' ? 'حالت حرفه‌ای ⚡' : 'حالت ساده 🌱'}\n` +
    `🆔 آیدی عددی: ${params.telegramId}\n` +
    `📧 حساب وب: ${params.email.endsWith('.local') ? 'ورود با تلگرام (از دکمه ورود سریع استفاده کنید)' : params.email}\n` +
    `💰 موجودی کیف پول: ${params.walletUsdt.toFixed(2)} USDT (${walletToman} تومان)\n\n` +
    `💎 اشتراک فعلی: ${params.planNameFa}\n` +
    (params.hasPaidPlan
      ? `📅 تاریخ شروع: ${formatIranDateTime(params.subStart)}\n⏳ تاریخ پایان: ${formatIranDateTime(params.subEnd)} (${params.daysRemaining} روز باقیمانده)\n\n`
      : `⏳ برای دسترسی کامل به لایو، DEX و کپی‌ترید، اشتراک تهیه کنید.\n\n`) +
    `⚙️ حالت معامله: ${params.tradingMode} | ${params.execMode === 'AUTO' ? 'اتوترید 🤖' : 'دستی ترید 💪'}\n` +
    `📊 معاملات بسته: ${params.totalTrades} (برد: ${params.wins})\n` +
    `📈 سود/ضرر خالص: ${params.totalPnl >= 0 ? '+' : '-'}$${Math.abs(params.totalPnl).toFixed(2)}\n\n` +
    `${ANTI_SCAM_WARNING_FA}`
  );
}
