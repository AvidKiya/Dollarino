import type { FuturesBalance } from '../exchanges/base.js';
import type { InlineKeyboardButton } from './client.js';

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
    `💎 به پلتفرم هوشمند ترید دلارینو (@Dollarino_bot) خوش آمدید!\n` +
    `• حالت ساده: ترید کاملاً اتومات با هوش مصنوعی ۲۴ ساعته\n` +
    `• هوش مصنوعی من: هوش مصنوعی خام خودت را با چت آموزش بده تا برایت معامله کند\n` +
    `• کپی‌ترید تاییدشده: مشاهده و کپی خودکار معاملات تریدرهای تاییدشده\n` +
    `• استراتژی شخصی: ساخت و بک‌تست اسکریپت‌های Pine Script و Python\n\n` +
    `🔐 برای دسترسی به معاملات واقعی و خودکار، اشتراک دلارینو لازم است.\n` +
    `از منوی شیشه‌ای و کشویی زیر یا دکمه‌های ربات استفاده کنید:`
  );
}

export function mainMenuKeyboard(webAppUrl?: string) {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  return [
    [{ text: 'اتصال به صرافی 🔗' }, { text: 'تنظیمات ⚙️' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'خرید اشتراک 💎' }],
    [{ text: '📈 معاملات باز' }, { text: 'ربات و هوش مصنوعی من 🤖' }],
    [{ text: '🏆 کپی‌ترید تاییدشده' }, { text: '💬 پشتیبانی آنلاین' }],
    safeUrl
      ? [{ text: '🚀 مینی‌اپ دلارینو', web_app: { url: safeUrl } }, { text: 'راهنما 📚' }]
      : [{ text: 'راهنما 📚' }],
  ];
}

export type CollapsibleMenuSection = 'none' | 'ai' | 'copy' | 'tools';

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

  // Section 1: AI & Trading Accordion
  rows.push([
    {
      text: `${openSection === 'ai' ? '▾' : '▸'} 🧠 ترید هوشمند و هوش مصنوعی من`,
      callback_data: `tg_acc:${openSection === 'ai' ? 'none' : 'ai'}`,
      style: 'primary',
    },
  ]);
  if (openSection === 'ai') {
    rows.push([
      { text: '🤖 حالت ساده (اتومات AI)', callback_data: 'tg_mode_simple_ai', style: 'success' },
      { text: '🧠 آموزش به هوش مصنوعی من', callback_data: 'tg_myai', style: 'primary' },
    ]);
    rows.push([
      {
        text: isBotRunning ? '🔴 توقف ربات خودکار' : '🟢 روشن کردن ربات خودکار',
        callback_data: 'tg_bot_toggle',
        style: isBotRunning ? 'danger' : 'success',
      },
      ...(hasHttps
        ? [{ text: '🧪 استراتژی شخصی (IDE)', web_app: { url: `${base}/?tab=lab` } }]
        : [{ text: '📈 معاملات باز', callback_data: 'tg_positions' }]),
    ]);
  }

  // Section 2: Verified Copy Trade Accordion
  rows.push([
    {
      text: `${openSection === 'copy' ? '▾' : '▸'} 🏆 کپی‌ترید تریدرهای تاییدشده`,
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

  // Section 3: Account, Subscription & Online Support Accordion
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
    `🆔 @Dollarino_official`
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
}) {
  return (
    `📣 باز شدن معامله جدید (${params.exchange.toUpperCase()})\n\n` +
    `${params.direction === 'LONG' ? '🟢 لانگ (BUY)' : '🔴 شورت (SELL)'} | 💲 ${params.symbol}\n` +
    `🔔 قیمت ورود (Market): ${params.entryPrice}\n` +
    `🔘 لوریج: ${params.leverage}x\n` +
    `💰 مارجین درگیر: ${params.marginUsed} USDT\n` +
    `⛔️ SL اولیه: ${params.stopLoss}\n` +
    `🟢 TP1 (${params.tp1Pct}% + ریسک‌فری): ${params.tp1}\n` +
    (params.tp2 ? `🟡 TP2 (${params.tp2Pct}% + SL→TP1): ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3 (${params.tp3Pct}%): ${params.tp3}\n` : '') +
    `🕒 زمان ورود: ${formatIranDateTime(new Date().toISOString())}\n` +
    `🆔 @Dollarino_official`
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
}) {
  const win = params.pnlUsd >= 0;
  const header = win ? 'تبریک میگم 🤑' : 'ضرر هم جزئی از بازار🥲';
  const entryTime = formatIranDateTime(params.openedAt);
  const exitTime = formatIranDateTime(params.closedAt ?? new Date().toISOString());

  return (
    `${header}\n\n` +
    `💲 نماد: ${params.symbol} (${params.direction})\n` +
    `🕒 تایم ورود: ${entryTime}\n` +
    `🏁 تایم خروج: ${exitTime}\n` +
    `📥 قیمت ورود: ${params.entryPrice}\n` +
    `📤 قیمت خروج: ${params.exitPrice}\n` +
    `${win ? '🟢 سود خالص' : '🔴 زیان خالص'}: ${params.pnlUsd >= 0 ? '+' : ''}${params.pnlUsd.toFixed(2)} USDT (${params.pnlPct >= 0 ? '+' : ''}${params.pnlPct.toFixed(2)}%)\n` +
    `📌 نتیجه: ${params.reason}\n\n` +
    `استراتژی:\n` +
    `• لوریج: ${params.leverage ?? 1}x | SL: ${params.stopLoss ?? '—'} | TP1: ${params.tp1 ?? '—'}\n` +
    `🆔 @Dollarino_official`
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
    `📈 سود/ضرر خالص: ${params.totalPnl >= 0 ? '+' : ''}${params.totalPnl.toFixed(2)} USDT`
  );
}
