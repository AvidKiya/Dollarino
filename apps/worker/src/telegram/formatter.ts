import type { FuturesBalance } from '../exchanges/base.js';

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
    `🤖 به ربات تریدر هوشمند دلارینو (@Dollarino_bot) خوش آمدید!\n` +
    `• اجرای خودکار و دستی سیگنال‌های کانال رسمی @Dollarino_official\n` +
    `• موتور هوش مصنوعی مرکزی و استراتژی منتخب دلارینو (اسکن کل بازار)\n` +
    `• مدیریت خودکار ۳ تارگت (۵۰٪ / ۲۵٪ / ۲۵٪) + ریسک‌فری خودکار روی TP1\n\n` +
    `💎 صرافی‌های متصل: Toobit و KCEX + حساب دمو رایگان Paper Mode.\n` +
    `از دکمه‌های زیر استفاده کنید:`
  );
}

export function mainMenuKeyboard(webAppUrl?: string) {
  const safeUrl = webAppUrl?.startsWith('https://') ? webAppUrl : undefined;
  return [
    [{ text: 'اتصال به صرافی 🔗' }, { text: 'تنظیمات ⚙️' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'خرید اشتراک 💎' }],
    [{ text: '📈 معاملات باز' }, { text: 'ربات و هوش مصنوعی من 🤖' }],
    safeUrl
      ? [{ text: '🚀 مینی‌اپ دلارینو', web_app: { url: safeUrl } }, { text: 'راهنما 📚' }]
      : [{ text: 'راهنما 📚' }],
  ];
}

export function miniAppInlineKeyboard(webAppUrl: string, path = '') {
  const base = webAppUrl.replace(/\/$/, '');
  const fullUrl = `${base}${path}`;
  if (!fullUrl.startsWith('https://')) {
    return [
      [
        { text: '📈 معاملات باز', callback_data: 'tg_positions' },
        { text: '🤖 روشن/خاموش ربات', callback_data: 'tg_bot_toggle' },
      ],
      [{ text: '🌐 ورود مستقیم به سایت دلارینو', callback_data: 'tg_web_login' }],
    ];
  }
  return [
    [{ text: '🚀 باز کردن پنل کامل در مینی‌اپ', web_app: { url: fullUrl } }],
    [
      { text: '📈 معاملات باز', callback_data: 'tg_positions' },
      { text: '🤖 روشن/خاموش ربات', callback_data: 'tg_bot_toggle' },
    ],
    [{ text: '🌐 ورود مستقیم به سایت (مرورگر)', callback_data: 'tg_web_login' }],
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
    [{ text: 'Paper Mode (دمو رایگان) 🧪' }],
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
