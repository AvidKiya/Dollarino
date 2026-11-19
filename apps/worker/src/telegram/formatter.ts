import type { FuturesBalance } from '../exchanges/base.js';

export function welcomeMessage(firstName: string): string {
  return (
    `سلام خوش اومدی ${firstName || 'دوست عزیز'} 🌹\n\n` +
    `🤖 ربات ترید خودکار دلارینو (Dollarino)\n` +
    `ترید هوشمند با AI (DeepSeek / Claude / GPT)، استراتژی‌های CodexBot و کپی‌ترید کانال تلگرام!\n\n` +
    `💎 صرافی‌های پشتیبانی‌شده: **Toobit** و **KCEX** + حساب آزمایشی رایگان **Paper Demo** برای تست.\n\n` +
    `⚠️ توجه: تمام مسئولیت معاملات بر عهده کاربر است.\n\n` +
    `از منوی زیر انتخاب کنید:`
  );
}

export function mainMenuKeyboard() {
  return [
    [{ text: 'اتصال به صرافی 🔗' }, { text: 'تنظیمات ⚙️' }],
    [{ text: 'حساب کاربری 👤' }, { text: 'ربات و هوش مصنوعی من 🤖' }],
    [{ text: 'راهنما 📚' }],
  ];
}

export function settingsKeyboard(isAdmin: boolean) {
  const rows = [
    [{ text: 'اتوترید 🤖' }, { text: 'دستی ترید 💪' }],
    [{ text: 'دریافت موجودی صرافی 💳' }, { text: 'تنظیم مقادیر معاملات 🪛' }],
    [{ text: 'دریافت اعلان 🔔' }, { text: 'تغییر API صرافی 📡' }],
  ];
  if (isAdmin) {
    rows.push([{ text: 'پنل مدیریت 💼' }, { text: 'افزودن مدیر 🔑' }]);
  }
  rows.push([{ text: 'بازگشت به صفحه قبل 🔙' }]);
  return rows;
}

export function exchangeSelectionKeyboard() {
  return [
    [{ text: 'Toobit (توبیت - API لایو) 🟢' }, { text: 'KCEX (۰٪ کارمزد) 🔵' }],
    [{ text: 'Paper Mode (دمو رایگان) 🧪' }],
    [{ text: 'بازگشت به صفحه قبل 🔙' }],
  ];
}

export function formatBalanceCard(provider: string, bal: FuturesBalance): string {
  return (
    `💳 موجودی حساب فیوچرز (${provider.toUpperCase()}):\n\n` +
    `🟢 آزاد (Free): ${bal.free} ${bal.currency}\n` +
    `🟡 در معامله (Used): ${bal.used} ${bal.currency}\n` +
    `🔵 کل (Total): ${bal.total} ${bal.currency}`
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
    `🔘 اهرم: ${params.leverage}x\n` +
    `💰 مارجین درگیر: ${params.marginUsed} USDT\n` +
    `⛔️ استاپ‌لاس اولیه: ${params.stopLoss}\n` +
    `🟢 TP1 (${params.tp1Pct}% + Risk-Free): ${params.tp1}\n` +
    (params.tp2 ? `🟡 TP2 (${params.tp2Pct}% + SL→TP1): ${params.tp2}\n` : '') +
    (params.tp3 ? `🟠 TP3 (${params.tp3Pct}%): ${params.tp3}\n` : '') +
    `🆔 @Dollarinoofficial`
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
}) {
  const win = params.pnlUsd >= 0;
  return (
    `📊 گزارش بسته شدن معامله\n\n` +
    `💲 نماد: ${params.symbol} (${params.direction})\n` +
    `📥 ورود: ${params.entryPrice} | 📤 خروج: ${params.exitPrice}\n` +
    `📌 دلیل خروج: ${params.reason}\n` +
    `${win ? '🟢 سود خالص' : '🔴 ضرر خالص'}: ${params.pnlUsd >= 0 ? '+' : ''}${params.pnlUsd.toFixed(2)} USDT (${params.pnlPct >= 0 ? '+' : ''}${params.pnlPct.toFixed(2)}%)\n` +
    `🆔 @Dollarinoofficial`
  );
}
