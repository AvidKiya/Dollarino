import { resolveEngineDisplayLabel } from '@dollarino/core';
import type { FuturesBalance } from '../exchanges/base.js';
import type { InlineKeyboardButton } from './client.js';

export const OFFICIAL_CHANNEL_HANDLE = '@Dollarino_official';
export const OFFICIAL_BOT_HANDLE = '@Dollarino_bot';
export const ANTI_SCAM_WARNING_FA =
  '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. تنها راه ارتباطی رسمی: پشتیبانی آنلاین داخل سایت و ربات @Dollarino_bot است.';

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

export function welcomeMessage(firstName: string): string {
  return (
    `سلام خوش اومدی ${firstName || 'دوست عزیز'} 🌹\n\n` +
    `💎 به پلتفرم هوشمند ترید دلارینو (${OFFICIAL_BOT_HANDLE}) خوش آمدید!\n` +
    `اینجا ۴ موتور قدرتمند در اختیار شماست:\n` +
    `۱. 🧠 هوش مصنوعی دلارینو (تحلیل و معامله خودکار مرکزی)\n` +
    `۲. 🤖 هوش مصنوعی خام (آموزش با چت به سبک خودتان)\n` +
    `۳. 🎯 استراتژی شکار (استراتژی‌های آماده ما + استراتژی شخصی شما)\n` +
    `۴. 🏆 کپی‌ترید تاییدشده (آینه‌سازی آنی معاملات تریدرهای برتر)\n\n` +
    `📢 کانال رسمی سیگنال و اخبار: ${OFFICIAL_CHANNEL_HANDLE}\n` +
    `${ANTI_SCAM_WARNING_FA}\n\n` +
    `از منوی شیشه‌ای و کشویی زیر یا دکمه‌های ربات استفاده کنید:`
  );
}

export function mainMenuKeyboard(webAppUrl?: string) {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  return [
    [{ text: 'اتصال به صرافی 🔗' }, { text: 'تنظیمات ⚙️' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'خرید اشتراک 💎' }],
    [{ text: '📈 معاملات باز' }, { text: 'ربات و هوش مصنوعی من 🤖' }],
    [{ text: '🎯 استراتژی شکار' }, { text: '🏆 کپی‌ترید تاییدشده' }],
    safeUrl
      ? [{ text: '🚀 مینی‌اپ دلارینو', web_app: { url: safeUrl } }, { text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }]
      : [{ text: '💬 پشتیبانی آنلاین' }, { text: 'راهنما 📚' }],
  ];
}

export type CollapsibleMenuSection = 'none' | 'ai' | 'hunt' | 'copy' | 'tools';

export function miniAppInlineKeyboard(
  webAppUrl: string,
  path = '',
  openSection: CollapsibleMenuSection = 'none',
  isBotRunning = false
): InlineKeyboardButton[][] {
  const base = webAppUrl.replace(/\/$/, '');
  const fullUrl = `${base}${path}`;
  const hasHttps = fullUrl.startsWith('https://');
  const rows: InlineKeyboardButton[][] = [];

  if (hasHttps) {
    rows.push([
      {
        text: '🚀 باز کردن پنل شیشه‌ای در مینی‌اپ',
        web_app: { url: fullUrl },
        style: 'primary',
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
      { text: '📊 دریافت کارت سود', callback_data: 'tg_profit_card' },
    ]);
  }

  // Engine 3: Hunting Strategy (Ready + Personal)
  rows.push([
    {
      text: `${openSection === 'hunt' ? '▾' : '▸'} 🎯 ۳: استراتژی شکار (آماده + شخصی)`,
      callback_data: `tg_acc:${openSection === 'hunt' ? 'none' : 'hunt'}`,
      style: 'primary',
    },
  ]);
  if (openSection === 'hunt') {
    rows.push([
      { text: '⚡️ استراتژی‌های آماده دلارینو', callback_data: 'tg_hunt_ready', style: 'success' },
      ...(hasHttps
        ? [{ text: '🛠 استراتژی شخصی خودتان (IDE)', web_app: { url: `${base}/?tab=radar` } }]
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
        ? [{ text: '🌐 باز کردن در مینی‌اپ', web_app: { url: `${base}/?tab=copy` } }]
        : [{ text: '📈 پوزیشن‌های فعال', callback_data: 'tg_positions' }]),
    ]);
  }

  // Section 4: Account, Subscription & Online Support (No personal DM!)
  rows.push([
    {
      text: `${openSection === 'tools' ? '▾' : '▸'} 💎 اشتراک، پوزیشن‌ها و پشتیبانی آنلاین`,
      callback_data: `tg_acc:${openSection === 'tools' ? 'none' : 'tools'}`,
    },
  ]);
  if (openSection === 'tools') {
    rows.push([
      { text: '📈 معاملات باز', callback_data: 'tg_positions' },
      { text: '💎 خرید / تمدید اشتراک', callback_data: 'tg_open_sub', style: 'success' },
    ]);
    rows.push([
      { text: '💬 پشتیبانی آنلاین', callback_data: 'tg_support_open', style: 'primary' },
      { text: '🌐 ورود مستقیم به سایت', callback_data: 'tg_web_login' },
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
  return (
    `👤 اطلاعات حساب کاربری دلارینو\n\n` +
    `👤 نام: ${params.username}\n` +
    `🆔 آیدی عددی: ${params.telegramId}\n` +
    `📧 حساب وب: ${params.email.endsWith('.local') ? 'متصل نشده (از وب یا دکمه ورود سریع استفاده کنید)' : params.email}\n` +
    `💰 موجودی کیف پول: ${params.walletUsdt.toFixed(2)} USDT (${walletToman} تومان)\n\n` +
    `💎 اشتراک فعلی: ${params.planNameFa}\n` +
    (params.hasPaidPlan
      ? `📅 تاریخ شروع: ${formatIranDateTime(params.subStart)}\n⏳ تاریخ پایان: ${formatIranDateTime(params.subEnd)} (${params.daysRemaining} روز باقیمانده)\n\n`
      : `⏳ برای دسترسی کامل به لایو و کپی‌ترید، اشتراک تهیه کنید.\n\n`) +
    `⚙️ حالت معامله: ${params.tradingMode} | ${params.execMode === 'AUTO' ? 'اتوترید 🤖' : 'دستی ترید 💪'}\n` +
    `📊 معاملات بسته: ${params.totalTrades} (برد: ${params.wins})\n` +
    `📈 سود/ضرر خالص: ${params.totalPnl >= 0 ? '+' : '-'}$${Math.abs(params.totalPnl).toFixed(2)}\n\n` +
    `${ANTI_SCAM_WARNING_FA}`
  );
}
