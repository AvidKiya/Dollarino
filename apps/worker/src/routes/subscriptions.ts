import { Hono } from 'hono';
import { requireAuth, type AppVariables } from '../auth.js';
import { generateReferralCode, randomId } from '../crypto.js';
import { logAudit } from '../engine/executor.js';
import type { AuthUser, Env } from '../env.js';
import { enforceRateLimit, maskUsernameForReferral } from '../security.js';
import { TelegramBotClient } from '../telegram/client.js';
import { resolveOwnerTelegramId, resolveTelegramBotToken, resolveTelegramBotUsername } from '../telegram/token.js';
import { ANTI_SCAM_WARNING_FA, OFFICIAL_BOT_HANDLE } from '../telegram/formatter.js';
import { notifyAllAdmins, notifyAllAdminsPhoto, publishTransactionEvent } from '../telegram/publisher.js';
import {
  evaluateUserFeeStanding,
  FREE_PROFITABLE_LIVE_TRADES,
  getFeePolicyConfig,
  getUserServerFeeSummary,
  isValidBlockchainTxHash,
  SERVER_PROFIT_FEE_PCT,
  tryVerifyEvmReceiptOnchain,
  verifyBlockchainTxOnchain,
} from '../services/server-fee.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';
import {
  autoDetectUserTransferOnchain,
  buildExplorerTxUrl,
  buildInvoiceNumber,
  getUserBankingInvoices,
  getUserTreasuryDepositOptions,
  MIN_TREASURY_DEPOSIT_USD,
  settleDebtFirstThenCredit,
  submitTreasuryDeposit,
} from '../services/treasury.js';

export interface SubscriptionPlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  max_live_exchanges: number;
  allow_ai_trading: number;
  allow_codexbot: number;
  allow_copy_trade: number;
  allow_live_trading: number;
  features_json: string;
  is_popular: number;
  is_active: number;
  sort_order: number;
}

export interface UserEntitlement {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  allowPaperDemo: boolean;
  allowAiTrading: boolean;
  allowCodexbot: boolean;
  allowCopyTrade: boolean;
  allowLiveTrading: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  subscriptionRequired: boolean;
}

const FALLBACK_PUBLIC_PLANS: SubscriptionPlanRow[] = [
  {
    code: 'pro_monthly',
    name_fa: 'اشتراک حرفه‌ای ماهانه (Pro)',
    name_en: 'Pro Monthly',
    description_fa: 'دسترسی کامل به هوش مصنوعی دلارینو، استراتژی دُرنا V1، کپی‌ترید هوشمند ولت‌ها و اتصال تمام‌اتومات Trust Wallet',
    description_en: 'Full Dollarino AI, Dorna V1, Smart Copy-Trade & 24/7 Trust Wallet Automation',
    price_usd: 20,
    price_toman: 1400000,
    duration_days: 30,
    max_live_exchanges: 2,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      'ترید خودکار ۲۴/۷ با هوش مصنوعی دلارینو روی Trust Wallet و شبیه‌ساز دمو',
      'استراتژی منتخب دُرنا V1 با اسکن آزاد کل بازار (۳۰+ ارز)',
      'کپی‌ترید هوشمند ۱۰ ولت برتر + تریدرهای تاییدشده با سپر ضدراگ',
      'انتخاب تایید دستی یا تمام‌اتوترید خودکار روی اسپات، میم‌کوین و فیوچرز ۱۰۰x',
    ]),
    is_popular: 1,
    is_active: 1,
    sort_order: 2,
  },
  {
    code: 'vip_quarterly',
    name_fa: 'اشتراک ویژه ۳ ماهه (VIP)',
    name_en: 'VIP Quarterly (3 Months)',
    description_fa: '۹۰ روز دسترسی کامل به تمام امکانات + اسکن سریع کل بازار و پشتیبانی اختصاصی',
    description_en: '90 days full VIP access with multi-coin priority scanning & dedicated support',
    price_usd: 50,
    price_toman: 3450000,
    duration_days: 90,
    max_live_exchanges: 5,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۹۰ روز دسترسی کامل به هوش مصنوعی، استراتژی دُرنا V1 و کپی‌ترید هوشمند ولت‌ها',
      'اولویت پردازش چندارزی و تا ۲۰ پوزیشن همزمان',
      'راه‌اندازی اختصاصی Copy-Vault ۲۴/۷ و Perp Agent Key بدون حق برداشت',
      'پشتیبانی مستقیم مدیریت و بروزرسانی‌های جدید',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 3,
  },
  {
    code: 'pro_semiannual',
    name_fa: 'اشتراک ۶ ماهه (نصف‌سال)',
    name_en: 'Semiannual (6 Months)',
    description_fa: '۱۸۰ روز دسترسی کامل به اتوترید ۲۴/۷ Trust Wallet، کپی‌ترید و هوش مصنوعی با ۲۵٪ تخفیف',
    description_en: '180 days full AI, Strategy & 24/7 Trust Wallet Auto-Trade (25% savings)',
    price_usd: 90,
    price_toman: 6200000,
    duration_days: 180,
    max_live_exchanges: 5,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۱۸۰ روز دسترسی نامحدود به تمام امکانات حرفه‌ای',
      'اتوترید و کپی‌ترید خودکار تلگرام بدون محدودیت',
      'تحلیل چارت با هوش مصنوعی مرکزی دلارینو',
      'صرفه‌جویی ۳۰ دلار نسبت به خرید ماهانه',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 4,
  },
  {
    code: 'pro_annual',
    name_fa: 'اشتراک سالانه (۱۲ ماهه)',
    name_en: 'Annual (12 Months)',
    description_fa: '۳۶۵ روز دسترسی کامل طلایی با ۳۳٪ تخفیف ویژه معامله‌گران مداوم',
    description_en: '365 days full access with maximum 33% annual savings',
    price_usd: 160,
    price_toman: 11000000,
    duration_days: 365,
    max_live_exchanges: 10,
    allow_ai_trading: 1,
    allow_codexbot: 1,
    allow_copy_trade: 1,
    allow_live_trading: 1,
    features_json: JSON.stringify([
      '۳۶۵ روز دسترسی کامل به تمام موتورها و صرافی‌ها',
      'اولویت پردازش سیگنال و رله اختصاصی',
      'پشتیبانی مستقیم تیم فنی دلارینو',
      'بیشترین تخفیف سالانه (۸۰ دلار صرفه‌جویی)',
    ]),
    is_popular: 0,
    is_active: 1,
    sort_order: 5,
  },
];

export async function getPublicPlans(db: D1Database): Promise<SubscriptionPlanRow[]> {
  try {
    const rows = await db
      .prepare(`SELECT * FROM subscription_plans WHERE is_active = 1 AND price_usd > 0 ORDER BY sort_order ASC`)
      .all<SubscriptionPlanRow>();
    return rows.results.length > 0 ? rows.results : FALLBACK_PUBLIC_PLANS;
  } catch {
    return FALLBACK_PUBLIC_PLANS;
  }
}

export async function requirePaidEntitlement(
  db: D1Database,
  user: AuthUser
): Promise<{ ok: true; entitlement: UserEntitlement } | { ok: false; entitlement: UserEntitlement; error: string }> {
  const entitlement = await resolveUserEntitlement(db, user);
  return { ok: true, entitlement };
}

export async function resolveUserEntitlement(_db: D1Database, user: AuthUser): Promise<UserEntitlement> {
  const isAdminUser = user.role === 'owner' || user.role === 'admin';

  if (isAdminUser) {
    return {
      hasPaidPlan: true,
      planCode: 'vip_owner',
      planNameFa: 'دسترسی کامل مدیریت · بدون کارمزد و بدون محدودیت (۰٪ کارمزد · نامحدود)',
      planNameEn: 'Admin Full Access · Zero Fees & Zero Limits',
      status: 'ACTIVE',
      allowPaperDemo: true,
      allowAiTrading: true,
      allowCodexbot: true,
      allowCopyTrade: true,
      allowLiveTrading: true,
      daysRemaining: 9999,
      expiresAt: null,
      subscriptionRequired: false,
    };
  }

  return {
    hasPaidPlan: true,
    planCode: 'free_3pct_profit',
    planNameFa: 'رایگان برای همه · ۳ معامله سودده اول ۰٪ · سپس ۳٪ کارمزد سرور از سود واقعی',
    planNameEn: 'Free Forever · First 3 Profitable Live Trades 0% · Then 3% Fee Only on Net Profit',
    status: 'ACTIVE',
    allowPaperDemo: true,
    allowAiTrading: true,
    allowCodexbot: true,
    allowCopyTrade: true,
    allowLiveTrading: true,
    daysRemaining: 3650,
    expiresAt: null,
    subscriptionRequired: false,
  };
}

export async function rewardReferrerIfEligible(
  env: Env,
  referredUserId: string,
  subscriptionId?: string,
  paidAmountUsd = 0
): Promise<void> {
  if (!Number.isFinite(paidAmountUsd) || paidAmountUsd <= 0) {
    // Do not grant referral bonuses or USD commissions on $0 gift codes / admin grants
    return;
  }

  const ref = await env.DB.prepare(
    `SELECT id, referrer_user_id, reward_days, status, COALESCE(fraud_flag, 0) as fraud_flag
     FROM referrals WHERE referred_user_id = ? LIMIT 1`
  )
    .bind(referredUserId)
    .first<{ id: string; referrer_user_id: string; reward_days: number; status: string; fraud_flag: number }>()
    .catch(() => null);

  if (!ref || ref.referrer_user_id === referredUserId) return;
  if (ref.fraud_flag === 1 || ref.status === 'FLAGGED_DUPLICATE') {
    await logAudit(
      env.DB,
      ref.referrer_user_id,
      'SYSTEM',
      'WARN',
      `Referral reward blocked due to anti-abuse flag on user ${referredUserId}`
    ).catch(() => {});
    return;
  }

  // Cross-check phone number / Trust Wallet overlap between referrer & referred to prevent self-farming
  const [referrerUser, referredUser] = await Promise.all([
    env.DB.prepare(
      `SELECT id, phone_number, trust_wallet_address, signup_ip_hash, telegram_id FROM users WHERE id = ?`
    )
      .bind(ref.referrer_user_id)
      .first<{
        id: string;
        phone_number: string | null;
        trust_wallet_address: string | null;
        signup_ip_hash: string | null;
        telegram_id: string | null;
      }>()
      .catch(() => null),
    env.DB.prepare(
      `SELECT id, phone_number, trust_wallet_address, signup_ip_hash, telegram_id FROM users WHERE id = ?`
    )
      .bind(referredUserId)
      .first<{
        id: string;
        phone_number: string | null;
        trust_wallet_address: string | null;
        signup_ip_hash: string | null;
        telegram_id: string | null;
      }>()
      .catch(() => null),
  ]);

  if (!referrerUser || !referredUser) return;

  let abuseReason = '';
  if (
    referredUser.phone_number &&
    referrerUser.phone_number &&
    referredUser.phone_number === referrerUser.phone_number
  ) {
    abuseReason = 'شماره تماس یکسان با معرف';
  } else if (
    referredUser.trust_wallet_address &&
    referrerUser.trust_wallet_address &&
    referredUser.trust_wallet_address.toLowerCase() === referrerUser.trust_wallet_address.toLowerCase()
  ) {
    abuseReason = 'کیف‌پول Trust Wallet یکسان با معرف';
  } else if (referredUser.phone_number) {
    const dupPhone = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
       WHERE r.status = 'REWARDED' AND r.referred_user_id != ? AND u.phone_number = ?`
    )
      .bind(referredUserId, referredUser.phone_number)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 }));
    if ((dupPhone?.cnt ?? 0) > 0) abuseReason = 'استفاده مجدد از شماره تماس قبلی برای پاداش رفرال';
  }

  if (abuseReason) {
    await env.DB.prepare(
      `UPDATE referrals SET fraud_flag = 1, status = 'FLAGGED_DUPLICATE', fraud_reason = ? WHERE id = ?`
    )
      .bind(abuseReason, ref.id)
      .run()
      .catch(() => {});
    await logAudit(env.DB, ref.referrer_user_id, 'SYSTEM', 'WARN', `Referral flagged (${abuseReason})`).catch(() => {});
    return;
  }

  // Compute tier commission rate based on qualified referrals count
  const qualifiedCntRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_user_id = ? AND status = 'REWARDED'`
  )
    .bind(ref.referrer_user_id)
    .first<{ cnt: number }>()
    .catch(() => ({ cnt: 0 }));
  const qualifiedCount = Number(qualifiedCntRow?.cnt ?? 0);

  const isFirstPurchase = ref.status !== 'REWARDED';
  let tier = 'BRONZE';
  let firstPct = 0.15;
  if (qualifiedCount >= 15) {
    tier = 'GOLD';
    firstPct = 0.22;
  } else if (qualifiedCount >= 5) {
    tier = 'SILVER';
    firstPct = 0.18;
  }

  const rate = isFirstPurchase ? firstPct : 0.1; // 15%-22% first order, 10% recurring renewals
  const commissionUsd = Math.round(paidAmountUsd * rate * 100) / 100;
  const days = isFirstPurchase ? Math.max(1, ref.reward_days || 7) : 0;

  await env.DB.prepare(
    `UPDATE referrals
     SET status = 'REWARDED',
         commission_usd = COALESCE(commission_usd, 0) + ?,
         subscription_id = COALESCE(subscription_id, ?),
         unlocked_at = COALESCE(unlocked_at, datetime('now'))
     WHERE id = ?`
  )
    .bind(commissionUsd, subscriptionId ?? null, ref.id)
    .run();

  await env.DB.prepare(
    `UPDATE users
     SET referral_balance_usd = COALESCE(referral_balance_usd, 0) + ?,
         referral_total_earned_usd = COALESCE(referral_total_earned_usd, 0) + ?,
         referral_tier = ?
     WHERE id = ?`
  )
    .bind(commissionUsd, commissionUsd, tier, ref.referrer_user_id)
    .run();

  if (days > 0) {
    await env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
       VALUES (?, ?, 'pro_monthly', 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'پاداش دعوت دوست (رفرال)')`
    )
      .bind(randomId('sub'), ref.referrer_user_id, `REFERRAL:${referredUserId}`, days)
      .run();
  }

  await logAudit(
    env.DB,
    ref.referrer_user_id,
    'SYSTEM',
    'INFO',
    `Referral bonus credited: +$${commissionUsd.toFixed(2)} USD${days > 0 ? ` & +${days} Pro days` : ''} (${tier})`
  );

  const referrerTg = await env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ?`)
    .bind(ref.referrer_user_id)
    .first<{ telegram_id: string | null }>()
    .catch(() => null);
  const botToken = referrerTg?.telegram_id ? await resolveTelegramBotToken(env) : '';
  if (referrerTg?.telegram_id && botToken) {
    const tg = new TelegramBotClient(botToken);
    await tg
      .sendMessage(
        referrerTg.telegram_id,
        `کمیسیون جدید رفرال در دلارینو!\n` +
          `• پاداش نقدی واریزشده: +$${commissionUsd.toFixed(2)} USDT\n` +
          (days > 0 ? `• هدیه اشتراک: +${days} روز اشتراک Pro\n` : '') +
          `• سطح همکاری شما: ${tier}\n` +
          `می‌توانید از بخش کارمزد و رفرال در سایت مبلغ را به USDT برداشت یا تبدیل به اعتبار کارمزد ۳٪ کنید.`
      )
      .catch(() => {});
  }
}

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BEP20_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifyBscUsdtBep20(
  txHash: string,
  expectedWallet: string,
  minAmountUsd: number
): Promise<{ verified: boolean; amountUsd?: number; note: string }> {
  const cleanHash = txHash.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash) || !/^0x[a-fA-F0-9]{40}$/.test(expectedWallet.trim())) {
    return { verified: false, note: 'Pending manual review (non-EVM hash or Trust Wallet receiver not set)' };
  }
  try {
    const res = await fetch('https://bsc-dataseed.binance.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [cleanHash] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { verified: false, note: `BSC RPC HTTP ${res.status}` };
    const rpc = (await res.json()) as {
      result?: {
        status?: string;
        logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
      } | null;
    };
    const receipt = rpc.result;
    if (!receipt || receipt.status !== '0x1') {
      return { verified: false, note: 'BSC transaction not yet confirmed' };
    }
    const targetTopic = '0x' + expectedWallet.trim().toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
    const match = logs.find((l) => {
      const sameContract = (l.address || '').toLowerCase() === USDT_BEP20_CONTRACT;
      const isTransfer = (l.topics?.[0] || '').toLowerCase() === TRANSFER_EVENT_TOPIC;
      const sameTo = (l.topics?.[2] || '').toLowerCase() === targetTopic;
      if (!sameContract || !isTransfer || !sameTo || !l.data) return false;
      const amt = Number(BigInt(l.data)) / 1e18;
      return amt >= Math.max(0.5, minAmountUsd - 0.5);
    });
    if (!match || !match.data) {
      return { verified: false, note: 'BSC BEP20 USDT transfer to platform Trust Wallet did not match' };
    }
    const amt = Number(BigInt(match.data)) / 1e18;
    return { verified: true, amountUsd: amt, note: `Auto-verified $${amt.toFixed(2)} USDT BEP20 via Trust Wallet / BSC` };
  } catch (err) {
    return { verified: false, note: err instanceof Error ? err.message : 'BSC verification unavailable' };
  }
}

async function verifyTronscanUsdtTrc20(
  txid: string,
  expectedWallet: string,
  minAmountUsd: number
): Promise<{ verified: boolean; amountUsd?: number; note: string }> {
  const cleanHash = txid.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(cleanHash) || !expectedWallet || expectedWallet.startsWith('T-PLACEHOLDER')) {
    return { verified: false, note: 'Pending manual review (non-64-hex hash or wallet not finalized)' };
  }
  try {
    const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(cleanHash)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { verified: false, note: `Tronscan HTTP ${res.status}` };
    const data = await res.json() as {
      confirmed?: boolean;
      contractRet?: string;
      trc20TransferInfo?: Array<{
        contract_address?: string;
        to_address?: string;
        amount_str?: string;
        decimals?: number;
      }>;
    };
    if (!data.confirmed || data.contractRet !== 'SUCCESS') {
      return { verified: false, note: 'Transaction not yet confirmed on TRON' };
    }
    const transfers = Array.isArray(data.trc20TransferInfo) ? data.trc20TransferInfo : [];
    const match = transfers.find((t) => {
      const sameContract = (t.contract_address || '').toLowerCase() === USDT_TRC20_CONTRACT.toLowerCase();
      const sameWallet = (t.to_address || '').toLowerCase() === expectedWallet.toLowerCase();
      const dec = Number(t.decimals ?? 6);
      const amt = Number(t.amount_str || 0) / Math.pow(10, dec);
      return sameContract && sameWallet && amt >= Math.max(0.5, minAmountUsd - 0.5);
    });
    if (!match) {
      return { verified: false, note: 'Wallet or USDT amount did not match automatically' };
    }
    const amt = Number(match.amount_str || 0) / Math.pow(10, Number(match.decimals ?? 6));
    return { verified: true, amountUsd: amt, note: `Auto-verified $${amt.toFixed(2)} USDT TRC20 via Tronscan` };
  } catch (err) {
    return { verified: false, note: err instanceof Error ? err.message : 'Tronscan verification unavailable' };
  }
}

export const subscriptionRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
subscriptionRoutes.use('*', requireAuth);

subscriptionRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const [entitlement, plans, orders, settings] = await Promise.all([
    resolveUserEntitlement(c.env.DB, user),
    getPublicPlans(c.env.DB),
    c.env.DB.prepare(
      `SELECT us.*, sp.name_fa, sp.name_en
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC LIMIT 20`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN (
         'subscription_required', 'usdt_trc20_wallet', 'trust_wallet_evm_receiver',
         'trust_wallet_sol_receiver', 'trust_wallet_ton_receiver',
         'iran_card_number', 'iran_card_holder', 'telegram_support', 'anti_scam_notice_fa'
       )`
    ).all<{ key: string; value: string }>().catch(() => ({ results: [] })),
  ]);

  const paymentConfig: Record<string, string> = {};
  for (const s of settings.results) paymentConfig[s.key] = s.value;
  if (paymentConfig.usdt_trc20_wallet?.includes('YourTRC20WalletAddress')) {
    paymentConfig.usdt_trc20_wallet = '';
  }
  if (paymentConfig.iran_card_number === '6037-9975-0000-0000') {
    paymentConfig.iran_card_number = '';
  }
  if (!paymentConfig.telegram_support || /Dollarino_admin/i.test(paymentConfig.telegram_support)) {
    const botUser = (paymentConfig.bot_username || '').replace(/^@/, '');
    paymentConfig.telegram_support = botUser ? `@${botUser}` : OFFICIAL_BOT_HANDLE;
  }
  if (!paymentConfig.anti_scam_notice_fa) {
    paymentConfig.anti_scam_notice_fa = ANTI_SCAM_WARNING_FA;
  }

  return c.json({
    entitlement,
    plans,
    orders: orders.results,
    paymentConfig,
  });
});

subscriptionRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `chk:${user.id}`, 10, 300, { bypass: user.role === 'owner' || user.role === 'admin' });
  if (!rl.allowed) {
    return c.json({ error: `تعداد ثبت سفارش زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = await c.req.json<{
    planCode?: string;
    paymentMethod?: 'USDT_TRC20' | 'TRUST_WALLET_BEP20' | 'TRUST_WALLET_TRC20' | 'CARD_TO_CARD';
    paymentReference?: string;
    receiptImageDataUrl?: string | null;
    payerNote?: string;
  }>().catch(() => ({} as Record<string, string | null | undefined>));

  const planCode = (body.planCode || '').trim();
  const plan = await c.env.DB.prepare(
    `SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1`
  ).bind(planCode).first<SubscriptionPlanRow>().catch(() => null);

  if (!plan || plan.price_usd <= 0) {
    return c.json({ error: 'Selected subscription plan is invalid' }, 400);
  }

  const rawReceipt = body.receiptImageDataUrl ? String(body.receiptImageDataUrl).trim() : '';
  if (rawReceipt && (!rawReceipt.startsWith('data:image/') || rawReceipt.length > 4_500_000)) {
    return c.json({ error: 'فرمت تصویر رسید نامعتبر است یا حجم آن بیش از حد مجاز (۴ مگابایت) است.' }, 400);
  }
  const receiptImage = rawReceipt || null;

  const userRef = (body.paymentReference || '').trim();
  if (!receiptImage && userRef.length < 5) {
    return c.json({ error: 'لطفاً تصویر رسید واریز را آپلود کنید یا کد پیگیری / TXID معتبر وارد نمایید.' }, 400);
  }

  // Prevent reusing the exact same user-entered payment reference / TXID
  if (userRef.length >= 5) {
    const duplicateRef = await c.env.DB.prepare(
      `SELECT id FROM user_subscriptions WHERE payment_reference = ? AND status IN ('ACTIVE', 'PENDING_REVIEW') LIMIT 1`
    ).bind(userRef.slice(0, 140)).first<{ id: string }>().catch(() => null);
    if (duplicateRef) {
      return c.json({ error: 'این کد پیگیری یا TXID قبلاً ثبت شده است.' }, 409);
    }
  }

  const method =
    body.paymentMethod === 'CARD_TO_CARD'
      ? 'CARD_TO_CARD'
      : body.paymentMethod === 'TRUST_WALLET_BEP20'
        ? 'TRUST_WALLET_BEP20'
        : body.paymentMethod === 'TRUST_WALLET_TRC20'
          ? 'TRUST_WALLET_TRC20'
          : 'USDT_TRC20';
  const id = randomId('sub');
  const ref = userRef.length >= 4 ? userRef : `RECEIPT-${id.slice(-6).toUpperCase()}`;

  // Auto-verify USDT TRC20 (Tronscan) or Trust Wallet BEP20 (BSC RPC) TXID when applicable
  let autoActivated = false;
  let autoNote = '';
  if (userRef.length >= 16) {
    if (method === 'USDT_TRC20' || method === 'TRUST_WALLET_TRC20') {
      const walletSetting = await c.env.DB.prepare(
        `SELECT value FROM system_settings WHERE key = 'usdt_trc20_wallet'`
      ).first<{ value: string }>().catch(() => null);
      const check = await verifyTronscanUsdtTrc20(ref, walletSetting?.value || '', plan.price_usd);
      if (check.verified) {
        autoActivated = true;
        autoNote = check.note;
      }
    } else if (method === 'TRUST_WALLET_BEP20') {
      const evmReceiver = await c.env.DB.prepare(
        `SELECT value FROM system_settings WHERE key = 'trust_wallet_evm_receiver'`
      ).first<{ value: string }>().catch(() => null);
      const check = await verifyBscUsdtBep20(ref, evmReceiver?.value || '', plan.price_usd);
      if (check.verified) {
        autoActivated = true;
        autoNote = check.note;
      }
    }
  }

  if (autoActivated) {
    const days = Math.max(1, plan.duration_days || 30);
    await c.env.DB.prepare(
      `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, receipt_image_url, amount_usd, payer_note, started_at, expires_at, reviewed_at, admin_note)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+' || ? || ' days'), datetime('now'), ?)`
    ).bind(
      id,
      user.id,
      plan.code,
      method,
      ref.slice(0, 140),
      receiptImage,
      plan.price_usd,
      (body.payerNote || '').trim().slice(0, 240),
      days,
      autoNote
    ).run();

    await rewardReferrerIfEligible(c.env, user.id, id, plan.price_usd).catch(() => {});
    await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Subscription ${id} AUTO-ACTIVATED via Tronscan (${plan.name_en})`);
    await notifyAllAdmins(
      c.env,
      `✅ اشتراک کاربر ${user.username} (${user.email}) برای پلن ${plan.name_fa} به صورت خودکار از طریق شبکه بلاک‌چین تایید و فعال شد!\nTXID: ${ref}`
    ).catch(() => {});
    await publishTransactionEvent(c.env, {
      eventType: 'ORDER',
      status: 'CONFIRMED',
      title: `تایید خودکار سفارش ${plan.name_fa}`,
      username: user.username,
      userId: user.id,
      amountUsd: Number(plan.price_usd || 0),
      network: method,
      txHash: ref,
      invoiceNo: `#${id}`,
      details: `سفارش #${id} از طریق بلاکچین به صورت خودکار تایید و فعال شد.`,
    }).catch(() => {});

    return c.json({ ok: true, orderId: id, status: 'ACTIVE', autoVerified: true }, 201);
  }

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, receipt_image_url, amount_usd, payer_note)
     VALUES (?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    plan.code,
    method,
    ref.slice(0, 140),
    receiptImage,
    plan.price_usd,
    (body.payerNote || '').trim().slice(0, 240)
  ).run();

  await logAudit(
    c.env.DB,
    user.id,
    'SYSTEM',
    'INFO',
    `Subscription order ${id} submitted for ${plan.name_en} (${method}: ${ref.slice(0, 32)})`
  );

  const note = [
    `💳 درخواست اشتراک جدید در دلارینو`,
    `👤 کاربر: ${user.email} (${user.username})`,
    `📦 پلن: ${plan.name_fa} ($${plan.price_usd} / ${Number(plan.price_toman || 0).toLocaleString()} تومان)`,
    `💳 روش: ${method}`,
    userRef ? `🔗 کد پیگیری / TXID: ${userRef}` : `📸 ثبت‌شده با عکس رسید واریز`,
    body.payerNote?.trim() ? `📝 توضیح: ${body.payerNote.trim().slice(0, 120)}` : '',
    `🧾 سفارش: #${id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const reviewKeyboard = {
    inlineKeyboard: [
      [
        { text: '✅ تایید فوری اشتراک', callback_data: `adm:tx_approve:${id}`, style: 'success' as const },
        { text: '❌ رد درخواست', callback_data: `adm:tx_reject:${id}`, style: 'danger' as const },
      ],
    ],
  };

  if (receiptImage) {
    await notifyAllAdminsPhoto(c.env, receiptImage, note, reviewKeyboard).catch(() => {});
  } else {
    await notifyAllAdmins(c.env, note, reviewKeyboard).catch(() => {});
  }
  await publishTransactionEvent(c.env, {
    eventType: 'ORDER',
    status: 'PENDING',
    title: `سفارش جدید (${plan.name_fa})`,
    username: user.username,
    userId: user.id,
    amountUsd: Number(plan.price_usd || 0),
    network: method,
    txHash: userRef || null,
    invoiceNo: `#${id}`,
    details: body.payerNote?.trim() || undefined,
    imageDataUrl: receiptImage,
    inlineKeyboard: reviewKeyboard.inlineKeyboard,
  }).catch(() => {});

  return c.json({ ok: true, orderId: id, status: 'PENDING_REVIEW', autoVerified: false }, 201);
});

// Admin subscription management routes
async function isAdmin(c: { get: (k: 'user') => AuthUser; env: Env }): Promise<boolean> {
  const u = c.get('user');
  const ownerTg = await resolveOwnerTelegramId(c.env);
  return u.role === 'owner' || u.role === 'admin' || Boolean(ownerTg && u.telegramId && u.telegramId === ownerTg);
}

subscriptionRoutes.get('/admin/orders', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT us.*, u.email, u.username, sp.name_fa, sp.name_en, sp.duration_days
     FROM user_subscriptions us
     JOIN users u ON u.id = us.user_id
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     ORDER BY CASE WHEN us.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END, us.created_at DESC
     LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ orders: rows.results });
});

subscriptionRoutes.post('/admin/orders/:id/review', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ decision: 'APPROVE' | 'REJECT'; adminNote?: string }>();

  const order = await c.env.DB.prepare(
    `SELECT us.*, sp.duration_days
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.code = us.plan_code
     WHERE us.id = ?`
  ).bind(id).first<{ id: string; user_id: string; plan_code: string; amount_usd: number; duration_days: number | null }>();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  if (body.decision === 'APPROVE') {
    const days = Math.max(1, order.duration_days ?? 30);
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'ACTIVE',
           started_at = datetime('now'),
           expires_at = datetime('now', '+' || ? || ' days'),
           reviewed_by = ?,
           reviewed_at = datetime('now'),
           admin_note = ?
       WHERE id = ?`
    ).bind(days, actor.id, body.adminNote || 'Approved', id).run();
    await rewardReferrerIfEligible(c.env, order.user_id, order.id, Number(order.amount_usd || 0)).catch(() => {});
    await logAudit(c.env.DB, order.user_id, 'SYSTEM', 'INFO', `Subscription ${order.plan_code} approved for ${days} days`);
    await publishTransactionEvent(c.env, {
      eventType: 'ORDER',
      status: 'CONFIRMED',
      title: `تایید سفارش ${order.plan_code}`,
      userId: order.user_id,
      amountUsd: Number(order.amount_usd || 0),
      invoiceNo: `#${id}`,
      details: `تایید شده توسط ${actor.username} به مدت ${days} روز`,
    }).catch(() => {});
  } else {
    await c.env.DB.prepare(
      `UPDATE user_subscriptions
       SET status = 'REJECTED', reviewed_by = ?, reviewed_at = datetime('now'), admin_note = ?
       WHERE id = ?`
    ).bind(actor.id, body.adminNote || 'Rejected', id).run();
    await publishTransactionEvent(c.env, {
      eventType: 'ORDER',
      status: 'REJECTED',
      title: `رد سفارش ${order.plan_code}`,
      userId: order.user_id,
      amountUsd: Number(order.amount_usd || 0),
      invoiceNo: `#${id}`,
      details: body.adminNote || `رد شده توسط ${actor.username}`,
    }).catch(() => {});
  }

  return c.json({ ok: true });
});

subscriptionRoutes.post('/admin/grant', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ emailOrUserId: string; planCode?: string; days?: number; note?: string }>();
  const target = (body.emailOrUserId || '').trim();
  const userRow = await c.env.DB.prepare(
    `SELECT id, email FROM users WHERE lower(email) = lower(?) OR id = ? LIMIT 1`
  ).bind(target, target).first<{ id: string; email: string }>();
  if (!userRow) return c.json({ error: 'User not found' }, 404);

  const planCode = body.planCode || 'pro_monthly';
  const days = Math.max(1, Math.min(3650, Number(body.days ?? 30)));
  const id = randomId('sub');

  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, reviewed_by, reviewed_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', 'OWNER_DIRECT_GRANT', 0, datetime('now'), datetime('now', '+' || ? || ' days'), ?, datetime('now'), ?)`
  ).bind(id, userRow.id, planCode, days, actor.id, body.note || `Granted ${days}d by owner`).run();

  return c.json({ ok: true, id, userId: userRow.id, email: userRow.email, days });
});

subscriptionRoutes.patch('/admin/config', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const body = await c.req.json<{
    subscriptionRequired?: boolean;
    usdtTrc20Wallet?: string;
    iranCardNumber?: string;
    iranCardHolder?: string;
    telegramSupport?: string;
    proPriceUsd?: number;
    proPriceToman?: number;
    vipPriceUsd?: number;
    vipPriceToman?: number;
  }>();

  const cleanSupport = body.telegramSupport?.trim();
  const safeSupport = cleanSupport && /Dollarino_admin/i.test(cleanSupport) ? '' : cleanSupport;

  const kvPairs: Array<[string, string | undefined]> = [
    ['subscription_required', body.subscriptionRequired !== undefined ? String(body.subscriptionRequired) : undefined],
    ['usdt_trc20_wallet', body.usdtTrc20Wallet?.trim()],
    ['iran_card_number', body.iranCardNumber?.trim()],
    ['iran_card_holder', body.iranCardHolder?.trim()],
    ['telegram_support', safeSupport],
  ];

  for (const [k, v] of kvPairs) {
    if (v !== undefined && v !== '') {
      await c.env.DB.prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      ).bind(k, v).run();
    }
  }

  if (typeof body.proPriceUsd === 'number' || typeof body.proPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'pro_monthly'`
    ).bind(body.proPriceUsd ?? null, body.proPriceToman ?? null).run();
  }
  if (typeof body.vipPriceUsd === 'number' || typeof body.vipPriceToman === 'number') {
    await c.env.DB.prepare(
      `UPDATE subscription_plans SET price_usd = COALESCE(?, price_usd), price_toman = COALESCE(?, price_toman), updated_at = datetime('now') WHERE code = 'vip_quarterly'`
    ).bind(body.vipPriceUsd ?? null, body.vipPriceToman ?? null).run();
  }

  invalidateSettingsCache(c.env.DB);
  return c.json({ ok: true });
});

subscriptionRoutes.get('/referrals', async (c) => {
  const user = c.get('user');
  const existingRow = await c.env.DB.prepare(
    `SELECT referral_code FROM users WHERE id = ? LIMIT 1`
  )
    .bind(user.id)
    .first<{ referral_code: string | null }>()
    .catch(() => null);
  let code = (existingRow?.referral_code || '').trim().toUpperCase();
  if (!/^DLR[A-Z0-9]{5}$/.test(code)) {
    code = generateReferralCode();
    await c.env.DB.prepare(`UPDATE users SET referral_code = ? WHERE id = ?`)
      .bind(code, user.id)
      .run()
      .catch(() => {});
  }
  const [userBal, refFeeAgg, refs, withdrawals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COALESCE(referral_balance_usd, 0) as bal,
              COALESCE(referral_total_earned_usd, 0) as total,
              COALESCE(referral_tier, 'BRONZE') as tier,
              COALESCE(fee_prepaid_credit_usd, 0) as fee_credit_usd
       FROM users WHERE id = ?`
    )
      .bind(user.id)
      .first<{ bal: number; total: number; tier: string; fee_credit_usd: number }>()
      .catch(() => ({ bal: 0, total: 0, tier: 'BRONZE', fee_credit_usd: 0 })),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(fee_usd), 0) AS ref_credit_sum
       FROM server_fee_ledger
       WHERE user_id = ? AND source IN ('REFERRAL_FEE_CREDIT', 'REFERRAL_WELCOME_CREDIT')`
    )
      .bind(user.id)
      .first<{ ref_credit_sum: number }>()
      .catch(() => ({ ref_credit_sum: 0 })),
    c.env.DB.prepare(
      `SELECT r.id, r.reward_days, r.status, COALESCE(r.commission_usd, 0) as commission_usd,
              COALESCE(r.fraud_flag, 0) as fraud_flag, r.fraud_reason, r.created_at, r.unlocked_at,
              u.username, COALESCE(u.phone_verified, 0) as phone_verified,
              COALESCE(u.wallet_balance_usdt, 0) as friend_wallet_bal,
              (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id AND t.mode = 'LIVE') as friend_live_trades,
              (SELECT COUNT(*) FROM copy_positions_v2 p WHERE p.user_id = u.id AND p.execution_mode != 'PAPER_SIMULATOR') as friend_copy_trades
       FROM referrals r JOIN users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id = ? ORDER BY r.created_at DESC LIMIT 80`
    )
      .bind(user.id)
      .all<{
        id: string;
        reward_days: number;
        status: string;
        commission_usd: number;
        fraud_flag: number;
        fraud_reason: string | null;
        created_at: string;
        unlocked_at: string | null;
        username: string;
        phone_verified: number;
        friend_wallet_bal: number;
        friend_live_trades: number;
        friend_copy_trades: number;
      }>()
      .catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT id, amount_usd, target_type, wallet_address, network, status, tx_hash, admin_note, created_at, processed_at
       FROM referral_withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(user.id)
      .all()
      .catch(() => ({ results: [] })),
  ]);

  const totalReferred = refs.results.length;
  const qualifiedReferred = refs.results.filter((r) => r.status === 'REWARDED').length;
  const flaggedCount = refs.results.filter((r) => r.fraud_flag === 1 || r.status === 'FLAGGED_DUPLICATE').length;
  const rewardDaysEarned = refs.results
    .filter((r) => r.status === 'REWARDED')
    .reduce((acc, r) => acc + Number(r.reward_days || 0), 0);

  let tier = 'BRONZE';
  let commissionPct = 20;
  if (qualifiedReferred >= 15) {
    tier = 'GOLD';
    commissionPct = 25;
  } else if (qualifiedReferred >= 5) {
    tier = 'SILVER';
    commissionPct = 22;
  }

  const webUrl = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/+$/, '');
  const inviteUrl = `${webUrl}/?ref=${encodeURIComponent(code)}`;
  const botUsername = await resolveTelegramBotUsername(c.env);
  const telegramInviteUrl = botUsername ? `https://t.me/${botUsername}?start=REF_${encodeURIComponent(code)}` : '';

  const sanitizedRefs = refs.results.map((r) => {
    const liveBalanceUsd = Number(r.friend_wallet_bal || 0);
    const liveTradesCount = Number(r.friend_live_trades || 0) + Number(r.friend_copy_trades || 0);
    const friendHasMinBalance = liveBalanceUsd >= 10;
    const qualificationStatus =
      r.fraud_flag === 1 || r.status === 'FLAGGED_DUPLICATE'
        ? 'FLAGGED_DUPLICATE'
        : r.status === 'REWARDED'
          ? 'QUALIFIED_ACTIVE'
          : 'PENDING_BALANCE_OR_TRADE';
    return {
      id: r.id,
      username: maskUsernameForReferral(r.username),
      reward_days: r.reward_days,
      commission_usd: Number(r.commission_usd || 0),
      status: r.status,
      qualificationStatus,
      friendHasMinBalance,
      friendLiveTradesCount: liveTradesCount,
      fraud_flag: r.fraud_flag,
      fraud_reason: r.fraud_reason,
      phone_verified: r.phone_verified === 1,
      created_at: r.created_at,
      unlocked_at: r.unlocked_at,
    };
  });

  const inviteTextFa =
    `🚀 من با هوش مصنوعی دلارینو (Dollarino) روی کیف‌پول شخصی Trust Wallet ترید خودکار و کپی‌ترید انجام می‌دم!\n` +
    `✅ اشتراک ماهانه: صفر تومان (کاملاً رایگان)\n` +
    `✅ کیف‌پول دمو رایگان (با موجودی قابل تنظیم از ۵۰ تا ۱۰M دلار) برای تمرین و تست استراتژی\n` +
    `✅ ۳ معامله سودده اول واقعی ۱۰۰٪ رایگان (کارمزد ۰٪) و پس از آن فقط ۳٪ کارمزد سرور از سود خالص (۹۷٪ سود برای شما!)\n` +
    `🎁 با کد دعوت من ثبت‌نام کن و پس از شارژ حداقل ۱۰ دلار و اولین ترید واقعی، ۱ دلار اعتبار کارمزد رایگان هدیه بگیر:\n\n` +
    `🔑 کد دعوت: ${code}\n` +
    `🤖 ورود از ربات تلگرام: ${telegramInviteUrl}\n` +
    `🌐 لینک مستقیم سایت: ${inviteUrl}`;

  const inviteTextEn =
    `🚀 I'm trading with Dollarino AI & Smart Copy-Trade directly on self-custody Trust Wallet!\n` +
    `✅ $0 Monthly Subscription — Customizable Paper Simulator ($50–$10M)\n` +
    `✅ First 3 Profitable Live Trades 0% Fee, then only 3% Server Fee Strictly on Net Profits (You keep 97%!)\n` +
    `🎁 Join with my invite code & get +$1.00 non-withdrawable 3% Fee Credit after holding >= $10 and placing your first live trade:\n\n` +
    `🔑 Invite Code: ${code}\n` +
    `🤖 Telegram Bot: ${telegramInviteUrl}\n` +
    `🌐 Web App: ${inviteUrl}`;

  return c.json({
    referralCode: code,
    inviteUrl,
    telegramInviteUrl,
    inviteTextFa,
    inviteTextEn,
    tier,
    commissionPct,
    renewalPct: 20,
    nonWithdrawable: true,
    minFriendBalanceUsd: 10,
    requireRealLiveTrade: true,
    activationBonusReferrerUsd: 2.0,
    activationBonusFriendUsd: 1.0,
    feeCreditBalanceUsd: Number((userBal?.fee_credit_usd ?? 0).toFixed(4)),
    referralFeeCreditEarnedUsd: Number((refFeeAgg?.ref_credit_sum ?? 0).toFixed(4)),
    nonWithdrawablePolicyFa:
      'جوایز رفرال نقدی و قابل برداشت نیستند و فقط به اعتبار پیش‌پرداخت کارمزد ۳٪ سود شما اضافه می‌شوند. جایزه زمانی آزاد می‌شود که دوست دعوت‌شده حداقل ۱۰ دلار موجودی واقعی داشته باشد و معامله واقعی (LIVE) انجام دهد؛ حساب‌های تکراری با IP/دستگاه/کیف‌پول مشترک خودکار مسدود می‌شوند.',
    nonWithdrawablePolicyEn:
      'Referral rewards are strictly non-withdrawable and go exclusively into your Prepaid 3% Profit-Fee Credit. Rewards unlock ONLY after the invited friend holds >= $10 real balance and executes a live trade; duplicate IPs/devices/Trust Wallets are automatically blocked.',
    balanceUsd: Number(userBal?.bal ?? 0),
    totalEarnedUsd: Number(userBal?.total ?? 0),
    totalReferred,
    qualifiedReferred,
    flaggedCount,
    rewardDaysEarned,
    referrals: sanitizedRefs,
    withdrawals: withdrawals.results,
  });
});

subscriptionRoutes.post('/referrals/apply-to-fee-credit', async (c) => {
  const user = c.get('user');
  const uRow = await c.env.DB.prepare(`SELECT COALESCE(referral_balance_usd, 0) as bal FROM users WHERE id = ?`)
    .bind(user.id)
    .first<{ bal: number }>()
    .catch(() => ({ bal: 0 }));
  const amt = Math.round(Number(uRow?.bal || 0) * 100) / 100;
  if (amt <= 0) {
    return c.json({ error: 'موجودی قابل تبدیل رفرال صفر است.' }, 400);
  }
  const upd = await c.env.DB.prepare(
    `UPDATE users
     SET referral_balance_usd = 0,
         fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4)
     WHERE id = ? AND COALESCE(referral_balance_usd, 0) >= ?`
  )
    .bind(amt, user.id, amt)
    .run();
  if (!upd.meta?.changes) {
    return c.json({ error: 'تبدیل اعتبار انجام نشد.' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
     VALUES (?, ?, ?, 'REFERRAL_FEE_CREDIT', 'USDT', 0, 0, ?, 'SETTLED_PREPAID', ?)`
  )
    .bind(randomId('fee_rc'), user.id, `ref_conv:${Date.now()}`, amt, 'انتقال به اعتبار پیش‌پرداخت کارمزد ۳٪ (غیرقابل برداشت)')
    .run()
    .catch(() => {});
  return c.json({ ok: true, transferredUsd: amt });
});

subscriptionRoutes.post('/referrals/redeem-balance', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `refred:${user.id}`, 8, 300, { bypass: user.role === 'owner' || user.role === 'admin' });
  if (!rl.allowed) return c.json({ error: 'درخواست زیاد است. کمی بعد تلاش کنید.' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as { amountUsd?: number };
  const amt = Math.round(Number(body.amountUsd || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt < 5) {
    return c.json({ error: 'حداقل مبلغ برای تبدیل به اعتبار کارمزد ۳٪ معادل ۵ دلار است.' }, 400);
  }

  // Atomic balance deduction to eliminate double-spend races
  const res = await c.env.DB.prepare(
    `UPDATE users SET referral_balance_usd = ROUND(referral_balance_usd - ?, 2),
                      fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 2)
     WHERE id = ? AND COALESCE(referral_balance_usd, 0) >= ?`
  )
    .bind(amt, amt, user.id, amt)
    .run();

  if (!res.meta?.changes || res.meta.changes < 1) {
    return c.json({ error: 'موجودی کمیسیون رفرال کافی نیست.' }, 400);
  }

  const wId = randomId('rw');
  await c.env.DB.prepare(
    `INSERT INTO referral_withdrawals (id, user_id, amount_usd, target_type, status, admin_note, processed_at)
     VALUES (?, ?, ?, 'FEE_CREDIT', 'APPROVED', ?, datetime('now'))`
  )
    .bind(wId, user.id, amt, `Converted $${amt.toFixed(2)} to 3% profit-fee credit`)
    .run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Converted $${amt.toFixed(2)} referral balance to 3% profit-fee credit`);
  return c.json({ ok: true, convertedUsd: amt, feeCreditAddedUsd: amt });
});

subscriptionRoutes.post('/referrals/withdraw', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `refwd:${user.id}`, 5, 600, { bypass: user.role === 'owner' || user.role === 'admin' });
  if (!rl.allowed) return c.json({ error: 'درخواست برداشت بیش از حد مجاز. چند دقیقه دیگر تلاش کنید.' }, 429);

  const body = (await c.req.json().catch(() => ({}))) as {
    amountUsd?: number;
    walletAddress?: string;
    network?: 'BEP20' | 'TRC20';
  };
  const amt = Math.round(Number(body.amountUsd || 0) * 100) / 100;
  const wallet = (body.walletAddress || '').trim();
  const network = body.network === 'TRC20' ? 'TRC20' : 'BEP20';

  if (!Number.isFinite(amt) || amt < 10) {
    return c.json({ error: 'حداقل مبلغ برداشت نقدی کمیسیون ۱۰ USDT است.' }, 400);
  }
  if (network === 'BEP20' && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return c.json({ error: 'آدرس کیف‌پول BEP20 (Trust Wallet) نامعتبر است.' }, 400);
  }
  if (network === 'TRC20' && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet)) {
    return c.json({ error: 'آدرس کیف‌پول TRC20 نامعتبر است.' }, 400);
  }

  // Require phone verification before cash payout for anti-abuse security
  const uRow = await c.env.DB.prepare(
    `SELECT COALESCE(phone_verified, 0) as pv FROM users WHERE id = ?`
  )
    .bind(user.id)
    .first<{ pv: number }>()
    .catch(() => null);
  if (!uRow?.pv) {
    const botUsername = await resolveTelegramBotUsername(c.env);
    const botLabel = botUsername ? `@${botUsername}` : 'ربات متصل تلگرام';
    return c.json(
      { error: `برای برداشت نقدی USDT ابتدا باید شماره تماس تلگرام خود را از طریق ربات ${botLabel} احراز (KYC) کنید.` },
      403
    );
  }

  const ded = await c.env.DB.prepare(
    `UPDATE users SET referral_balance_usd = ROUND(referral_balance_usd - ?, 2)
     WHERE id = ? AND COALESCE(referral_balance_usd, 0) >= ?`
  )
    .bind(amt, user.id, amt)
    .run();

  if (!ded.meta?.changes || ded.meta.changes < 1) {
    const fcRow = await c.env.DB.prepare(
      `SELECT COALESCE(fee_prepaid_credit_usd, 0) as fc FROM users WHERE id = ?`
    )
      .bind(user.id)
      .first<{ fc: number }>()
      .catch(() => null);
    if ((fcRow?.fc ?? 0) > 0) {
      return c.json(
        {
          error: 'پاداش رفرال دلارینو نقدی و قابل برداشت نیست و فقط به عنوان اعتبار پیش‌پرداخت کارمزد ۳٪ سود مصرف می‌شود.',
          code: 'NON_WITHDRAWABLE_FEE_CREDIT',
        },
        400
      );
    }
    return c.json({ error: 'موجودی قابل برداشت کافی نیست.' }, 400);
  }

  const wid = randomId('rwd');
  await c.env.DB.prepare(
    `INSERT INTO referral_withdrawals (id, user_id, amount_usd, target_type, wallet_address, network, status)
     VALUES (?, ?, ?, 'USDT_WALLET', ?, ?, 'PENDING')`
  )
    .bind(wid, user.id, amt, wallet, network)
    .run();

  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Referral withdrawal requested: $${amt.toFixed(2)} ${network} -> ${wallet}`);
  await notifyAllAdmins(
    c.env,
    `💸 درخواست برداشت کمیسیون رفرال\nکاربر: ${user.username} (${user.email})\nمبلغ: $${amt.toFixed(2)} USDT\nشبکه: ${network}\nآدرس: ${wallet}\nشناسه: ${wid}`
  ).catch(() => {});
  await publishTransactionEvent(c.env, {
    eventType: 'REFERRAL_WITHDRAWAL',
    status: 'PENDING',
    title: 'درخواست برداشت کمیسیون رفرال',
    username: user.username,
    userId: user.id,
    amountUsd: amt,
    asset: 'USDT',
    network,
    invoiceNo: wid,
    details: `آدرس مقصد: ${wallet}`,
  }).catch(() => {});

  return c.json({ ok: true, withdrawalId: wid, status: 'PENDING' }, 201);
});

subscriptionRoutes.post('/redeem-gift', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `gift:${user.id}`, 8, 300, { bypass: user.role === 'owner' || user.role === 'admin' });
  if (!rl.allowed) return c.json({ error: 'تعداد تلاش برای کد هدیه زیاد است. چند دقیقه دیگر امتحان کنید.' }, 429);
  const body = await c.req.json<{ code?: string }>().catch(() => ({} as { code?: string }));
  const code = (body.code || '').trim().toUpperCase();
  if (!code) return c.json({ error: 'Gift code is required' }, 400);

  const gift = await c.env.DB.prepare(
    `SELECT * FROM gift_codes WHERE code = ? AND is_active = 1`
  ).bind(code).first<{
    code: string;
    plan_code: string;
    duration_days: number;
    max_uses: number;
    uses_count: number;
    expires_at: string | null;
  }>().catch(() => null);

  if (!gift) return c.json({ error: 'Gift code is invalid or inactive' }, 404);
  if (gift.uses_count >= gift.max_uses) return c.json({ error: 'Gift code usage limit reached' }, 400);
  if (gift.expires_at && Date.parse(gift.expires_at) < Date.now()) {
    return c.json({ error: 'Gift code has expired' }, 400);
  }

  const already = await c.env.DB.prepare(
    `SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?`
  ).bind(code, user.id).first();
  if (already) return c.json({ error: 'You have already redeemed this gift code' }, 409);

  // Atomic capacity reservation prevents concurrent redemption race exceeding max_uses
  const incRes = await c.env.DB.prepare(
    `UPDATE gift_codes SET uses_count = uses_count + 1 WHERE code = ? AND is_active = 1 AND uses_count < max_uses`
  ).bind(code).run();
  if (!incRes.meta?.changes || incRes.meta.changes < 1) {
    return c.json({ error: 'Gift code usage limit reached' }, 400);
  }

  const subId = randomId('sub');
  const redId = randomId('red');
  await c.env.DB.prepare(`INSERT INTO gift_redemptions (id, code, user_id) VALUES (?, ?, ?)`).bind(redId, code, user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO user_subscriptions (id, user_id, plan_code, status, payment_method, payment_reference, amount_usd, started_at, expires_at, admin_note)
     VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_GRANT', ?, 0, datetime('now'), datetime('now', '+' || ? || ' days'), 'Gift code redeemed')`
  ).bind(subId, user.id, gift.plan_code, `GIFT:${code}`, gift.duration_days).run();

  // Free gift codes activate subscription only; they do not unlock USD referral commissions (anti-farming)
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Redeemed gift code ${code} (${gift.duration_days}d)`);
  return c.json({ ok: true, durationDays: gift.duration_days, planCode: gift.plan_code });
});

subscriptionRoutes.post('/admin/gift-codes', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const actor = c.get('user');
  const body = await c.req.json<{ code?: string; planCode?: string; durationDays?: number; maxUses?: number }>();
  const code = (body.code || `DLR${Math.random().toString(36).slice(2, 8)}`).trim().toUpperCase();
  const durationDays = Math.max(1, Math.min(365, Number(body.durationDays ?? 30)));
  const maxUses = Math.max(1, Math.min(1000, Number(body.maxUses ?? 1)));
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO gift_codes (code, plan_code, duration_days, max_uses, is_active, created_by)
     VALUES (?, ?, ?, ?, 1, ?)`
  ).bind(code, body.planCode || 'free_1pct_profit', durationDays, maxUses, actor.id).run();
  return c.json({ ok: true, code, durationDays, maxUses }, 201);
});

subscriptionRoutes.get('/server-fees', async (c) => {
  const user = c.get('user');
  const [summary, settingsRows, treasuryOpts, invoices] = await Promise.all([
    getUserServerFeeSummary(c.env.DB, user.id),
    c.env.DB.prepare(
      `SELECT key, value FROM system_settings WHERE key IN ('usdt_trc20_wallet', 'trust_wallet_evm_receiver', 'trust_wallet_sol_receiver', 'trust_wallet_ton_receiver')`
    ).all<{ key: string; value: string }>().catch(() => ({ results: [] })),
    getUserTreasuryDepositOptions(c.env.DB, user.id).catch(() => null),
    getUserBankingInvoices(c.env.DB, user.id).catch(() => []),
  ]);
  const receivers: Record<string, string> = {};
  for (const s of settingsRows.results) {
    const val = String(s.value || '').trim();
    if (!val || /YourTRC20WalletAddress|^0xYour/i.test(val)) continue;
    receivers[s.key] = val;
  }

  return c.json({
    ...summary,
    subscriptionModel: 'FREE_ZERO_SUBSCRIPTION',
    profitSharePct: SERVER_PROFIT_FEE_PCT,
    freeProfitableLiveTrades: FREE_PROFITABLE_LIVE_TRADES,
    minTreasuryDepositUsd: MIN_TREASURY_DEPOSIT_USD,
    treasury: treasuryOpts,
    invoices,
    receivers,
    honestArchitectureNoteFa:
      `دارایی اصلی Trust Wallet شما ۱۰۰٪ غیرامانی (Non-Custodial) است و دلارینو هیچ‌گاه دسترسی برداشت خودکار از کیف‌پول اصلی شما ندارد؛ در معاملات واقعی، ${FREE_PROFITABLE_LIVE_TRADES} معامله سودده اول ۱۰۰٪ رایگان است (کارمزد ۰٪) و پس از آن فقط ${SERVER_PROFIT_FEE_PCT}% کارمزد از سود خالص معاملات موفق ثبت می‌گردد (۹۷٪ سود خالص برای شما).`,
    honestArchitectureNoteEn:
      `Your main Trust Wallet remains 100% non-custodial. Your first ${FREE_PROFITABLE_LIVE_TRADES} profitable LIVE trades have 0% fee, followed by a transparent ${SERVER_PROFIT_FEE_PCT}% fee strictly on net profits (you keep 97%).`,
  });
});

subscriptionRoutes.get('/treasury/options', async (c) => {
  const user = c.get('user');
  const [opts, invoices] = await Promise.all([
    getUserTreasuryDepositOptions(c.env.DB, user.id),
    getUserBankingInvoices(c.env.DB, user.id).catch(() => []),
  ]);
  return c.json({ ok: true, ...opts, invoices });
});

subscriptionRoutes.get('/invoices', async (c) => {
  const user = c.get('user');
  const invoices = await getUserBankingInvoices(c.env.DB, user.id).catch(() => []);
  return c.json({ ok: true, invoices });
});

subscriptionRoutes.post('/treasury/verify-auto', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `tr_auto:${user.id}`, 10, 300);
  if (!rl.allowed) return c.json({ error: `درخواست زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  const body = (await c.req.json().catch(() => ({}))) as {
    network?: string;
    asset?: string;
    minAmountUsd?: number;
    category?: 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP';
  };
  const res = await autoDetectUserTransferOnchain(c.env.DB, user.id, {
    network: body.network || 'BEP20',
    asset: body.asset,
    minAmountUsd: body.minAmountUsd,
    category: body.category,
  });
  if (!res.ok) {
    return c.json(res, 400);
  }
  const enforcement = await evaluateUserFeeStanding(c.env.DB, user.id).catch(() => null);
  await notifyAllAdmins(
    c.env,
    `🏦 کشف و تایید خودکار تراکنش خزانه ($${Number(res.amountUsd || 0).toFixed(2)})\n` +
      `کاربر: ${user.username}\nشبکه: ${body.network || 'BEP20'}\nTX: ${res.txHash}`
  ).catch(() => {});
  await publishTransactionEvent(c.env, {
    eventType: 'TREASURY_DEPOSIT',
    status: 'CONFIRMED',
    title: 'کشف و تایید خودکار واریز خزانه',
    username: user.username,
    userId: user.id,
    amountUsd: Number(res.amountUsd || 0),
    network: body.network || 'BEP20',
    asset: body.asset || 'USDT',
    txHash: res.txHash || null,
    details: `وضعیت حساب پس از واریز: ${enforcement?.lockStatus || 'ACTIVE'}`,
  }).catch(() => {});
  return c.json({ ...res, enforcement });
});

subscriptionRoutes.post('/treasury/deposit', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `tr_dep:${user.id}`, 12, 300);
  if (!rl.allowed) return c.json({ error: `درخواست واریز بیش از حد مجاز. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  const body = (await c.req.json().catch(() => ({}))) as {
    asset?: string;
    network?: 'BEP20' | 'TRC20' | 'ERC20' | 'BASE' | 'ARBITRUM' | 'SOLANA' | 'TON';
    amountUsd?: number;
    txHash?: string;
    category?: 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP';
    senderAddress?: string;
  };
  try {
    const cleanTx = String(body.txHash || '').trim();
    const net = body.network || 'BEP20';
    const amt = Number(body.amountUsd || 0);
    const result = await submitTreasuryDeposit(c.env.DB, user.id, {
      asset: body.asset || (net === 'SOLANA' ? 'SOL' : net === 'TON' ? 'TON' : 'USDT'),
      network: net,
      amountUsd: amt,
      txHash: cleanTx,
      category: body.category,
      senderAddress: body.senderAddress,
    });
    await notifyAllAdmins(
      c.env,
      `🏦 واریز اعتبار خزانه مرکزی ($${amt.toFixed(2)})\n` +
        `کاربر: ${user.username}\nشبکه: ${net}\nوضعیت: ${
          result.status === 'CONFIRMED' ? '✅ تایید خودکار آن‌چین و شارژ شد' : '⏳ در انتظار تایید ادمین'
        }\nTX: ${cleanTx}`
    ).catch(() => {});
    await publishTransactionEvent(c.env, {
      eventType: 'TREASURY_DEPOSIT',
      status: result.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
      title: 'واریز به خزانه مرکزی دلارینو',
      username: user.username,
      userId: user.id,
      amountUsd: amt,
      network: net,
      asset: body.asset || 'USDT',
      txHash: cleanTx,
      details: body.senderAddress ? `مبدا: ${body.senderAddress}` : undefined,
    }).catch(() => {});
    return c.json(result, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = /قبلاً/.test(msg) ? 409 : 400;
    return c.json({ ok: false, error: msg }, code);
  }
});

subscriptionRoutes.post('/server-fees/settle', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `feesettle:${user.id}`, 12, 300);
  if (!rl.allowed) return c.json({ error: `درخواست تسویه بیش از حد مجاز. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  const body = await c.req
    .json<{ txHash?: string; network?: string; asset?: string; senderAddress?: string; amountUsd?: number }>()
    .catch(() => ({} as { txHash?: string; network?: string; asset?: string; senderAddress?: string; amountUsd?: number }));
  const txHash = (body.txHash || '').trim();
  if (!isValidBlockchainTxHash(txHash)) {
    return c.json(
      { error: 'فرمت هش تراکنش (TX Hash) نامعتبر است. لطفاً هش واقعی تراکنش بلاکچین (۰x... یا سولانا/ترون) را وارد کنید.' },
      400
    );
  }

  const [dup, dupOwn, dupTreasury] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id FROM server_fee_ledger WHERE LOWER(tx_hash) = LOWER(?) AND user_id != ? LIMIT 1`
    ).bind(txHash, user.id).first<{ id: string }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT id FROM server_fee_ledger WHERE LOWER(tx_hash) = LOWER(?) AND status IN ('SETTLED_ONCHAIN', 'PENDING_VERIFY') LIMIT 1`
    ).bind(txHash).first<{ id: string }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT id FROM treasury_deposits WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`
    ).bind(txHash).first<{ id: string }>().catch(() => null),
  ]);
  if (dup || dupOwn || dupTreasury) {
    return c.json({ error: 'این هش تراکنش قبلاً برای تسویه یا واریز ثبت شده است و قابل استفاده مجدد نیست.' }, 409);
  }

  const standingBefore = await evaluateUserFeeStanding(c.env.DB, user.id);
  const net = (body.network || (/^0x[0-9a-fA-F]{64}$/.test(txHash) ? 'BEP20' : /^[0-9a-fA-F]{64}$/.test(txHash) ? 'TRC20' : 'SOLANA')).toUpperCase();

  const settings = await c.env.DB.prepare(
    `SELECT key, value FROM system_settings WHERE key IN ('treasury_evm_receiver', 'trust_wallet_evm_receiver', 'treasury_trc20_receiver', 'usdt_trc20_wallet', 'treasury_solana_receiver', 'treasury_ton_receiver')`
  )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));
  const smap = new Map(settings.results.map((r) => [r.key, r.value]));
  const receiverAddress =
    net === 'TRC20'
      ? smap.get('treasury_trc20_receiver') || smap.get('usdt_trc20_wallet') || null
      : net === 'SOLANA'
        ? smap.get('treasury_solana_receiver') || null
        : net === 'TON'
          ? smap.get('treasury_ton_receiver') || null
          : smap.get('treasury_evm_receiver') || smap.get('trust_wallet_evm_receiver') || null;

  void tryVerifyEvmReceiptOnchain;
  const receipt = await verifyBlockchainTxOnchain(net, txHash, receiverAddress || undefined);
  if (receipt === 'FAILED') {
    return c.json({ error: 'تراکنش در بلاکچین ناموفق (Reverted) بوده است. لطفاً تراکنش موفق ثبت کنید.' }, 400);
  }
  const asset = (body.asset || 'USDT').toUpperCase();
  const dueUsd = Math.max(0, Number(standingBefore.totalDueUsd || standingBefore.accruedUsd || 0));
  const claimedAmt = Number(body.amountUsd || 0);
  // Security hardening: unconfirmed TX hashes MUST NEVER grant self-declared prepaid credit or auto-clear locked debt!
  const invAmt =
    receipt === 'CONFIRMED' && Number.isFinite(claimedAmt) && claimedAmt > 0 && claimedAmt <= 50_000
      ? Math.max(dueUsd, claimedAmt)
      : dueUsd;
  const nextLedgerStatus = receipt === 'CONFIRMED' ? 'SETTLED_ONCHAIN' : 'PENDING_VERIFY';

  let settledDebtUsd = 0;
  let addedCreditUsd = 0;
  let settledCount = 0;

  if (nextLedgerStatus === 'SETTLED_ONCHAIN') {
    const resSplit = await settleDebtFirstThenCredit(c.env.DB, user.id, invAmt, txHash, {
      alsoCreditWalletBalance: false,
    });
    settledDebtUsd = resSplit.settledDebtUsd;
    addedCreditUsd = resSplit.addedCreditUsd;
    settledCount = resSplit.settledCount;
  } else {
    const updated = await c.env.DB.prepare(
      `UPDATE server_fee_ledger SET status = 'PENDING_VERIFY', tx_hash = ? WHERE user_id = ? AND status = 'ACCRUED'`
    ).bind(txHash, user.id).run();
    settledCount = updated.meta?.changes ?? 0;
    settledDebtUsd = dueUsd;
    await c.env.DB.prepare(
      `UPDATE users SET fee_lock_status = 'PENDING_REVIEW' WHERE id = ? AND COALESCE(fee_lock_status, 'ACTIVE') != 'LOCKED'`
    ).bind(user.id).run().catch(() => {});
  }

  const depId = randomId('tset');
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const noteStr =
    addedCreditUsd > 0 && settledDebtUsd > 0
      ? `تسویه $${settledDebtUsd.toFixed(2)} بدهی + شارژ $${addedCreditUsd.toFixed(2)} اعتبار کارمزد`
      : 'تسویه کارمزد ۳٪ سرور دلارینو';

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO treasury_deposits (id, user_id, category, asset, network, receiver_address, sender_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet, admin_note, confirmed_at)
     VALUES (?, ?, 'FEE_SETTLEMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      depId,
      user.id,
      asset,
      net,
      receiverAddress || '',
      body.senderAddress?.trim() || null,
      Number(invAmt.toFixed(4)),
      txHash,
      nextLedgerStatus === 'SETTLED_ONCHAIN' ? 'CONFIRMED' : 'PENDING_VERIFY',
      receipt === 'CONFIRMED' ? 1 : 0,
      nextLedgerStatus === 'SETTLED_ONCHAIN' ? 1 : 0,
      noteStr,
      nextLedgerStatus === 'SETTLED_ONCHAIN' ? nowIso : null
    )
    .run()
    .catch(() => {});

  const enforcement = await evaluateUserFeeStanding(c.env.DB, user.id);
  await notifyAllAdmins(
    c.env,
    `💳 ثبت تسویه کارمزد ${SERVER_PROFIT_FEE_PCT}% سرور\nکاربر: ${user.username}\nمبلغ کل: $${invAmt.toFixed(2)} (تسویه بدهی: $${settledDebtUsd.toFixed(2)} | اعتبار مازاد: $${addedCreditUsd.toFixed(2)})\nوضعیت: ${nextLedgerStatus === 'SETTLED_ONCHAIN' ? '✅ تایید و آزاد شد' : '⏳ در انتظار تایید ادمین (حساب قفل بود)'}\nTX: ${txHash}`
  ).catch(() => {});
  await publishTransactionEvent(c.env, {
    eventType: 'SERVER_FEE',
    status: nextLedgerStatus === 'SETTLED_ONCHAIN' ? 'CONFIRMED' : 'PENDING',
    title: `تسویه کارمزد ${SERVER_PROFIT_FEE_PCT}٪ سرور`,
    username: user.username,
    userId: user.id,
    amountUsd: invAmt,
    asset,
    network: net,
    txHash,
    invoiceNo: buildInvoiceNumber(depId, nowIso),
    details: `تسویه بدهی: $${settledDebtUsd.toFixed(2)} | شارژ اعتبار مازاد: $${addedCreditUsd.toFixed(2)} | وضعیت حساب: ${enforcement.lockStatus}`,
  }).catch(() => {});
  await logAudit(c.env.DB, user.id, 'SYSTEM', 'INFO', `Server fee settlement (${nextLedgerStatus}) debt=$${settledDebtUsd.toFixed(2)} credit=$${addedCreditUsd.toFixed(2)} tx=${txHash}`);

  return c.json({
    ok: true,
    status: nextLedgerStatus,
    settledCount,
    settledDebtUsd,
    addedCreditUsd,
    txHash,
    enforcement,
    invoice: {
      invoiceNo: buildInvoiceNumber(depId, nowIso),
      id: depId,
      kind: 'FEE_SETTLEMENT' as const,
      titleFa: addedCreditUsd > 0 && settledDebtUsd > 0 ? 'فاکتور تسویه بدهی + شارژ اعتبار' : 'فاکتور تسویه کارمزد ۳٪ دلارینو',
      titleEn: '3% Profit Fee Settlement Invoice',
      network: net,
      asset,
      amountUsd: Number(invAmt.toFixed(4)),
      senderAddress: body.senderAddress?.trim() || null,
      receiverAddress,
      txHash,
      explorerUrl: buildExplorerTxUrl(net, txHash),
      status: nextLedgerStatus === 'SETTLED_ONCHAIN' ? ('CONFIRMED' as const) : ('PENDING_VERIFY' as const),
      verifiedOnchain: receipt === 'CONFIRMED',
      settledDebtUsd,
      addedCreditUsd,
      note: noteStr,
      createdAt: nowIso,
      confirmedAt: nextLedgerStatus === 'SETTLED_ONCHAIN' ? nowIso : null,
    },
  });
});

subscriptionRoutes.post('/server-fees/prepay', async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `feeprep:${user.id}`, 10, 300);
  if (!rl.allowed) return c.json({ error: `درخواست بیش از حد مجاز. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  const body = await c.req
    .json<{ amountUsd?: number; txHash?: string; network?: string; asset?: string; senderAddress?: string }>()
    .catch(() => ({} as { amountUsd?: number; txHash?: string; network?: string; asset?: string; senderAddress?: string }));
  const amountUsd = Number(body.amountUsd || 0);
  const txHash = (body.txHash || '').trim();
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_TREASURY_DEPOSIT_USD || amountUsd > 50000) {
    return c.json({ error: `حداقل مبلغ شارژ اعتبار کارمزد ${MIN_TREASURY_DEPOSIT_USD} دلار (USDT) و حداکثر ۵۰٬۰۰۰ دلار است.` }, 400);
  }
  if (!isValidBlockchainTxHash(txHash)) {
    return c.json({ error: 'لطفاً هش تراکنش (TX Hash) معتبر شارژ اعتبار کارمزد را وارد کنید.' }, 400);
  }

  const [dup, dupTreasury] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM server_fee_ledger WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`)
      .bind(txHash).first<{ id: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT id FROM treasury_deposits WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`)
      .bind(txHash).first<{ id: string }>().catch(() => null),
  ]);
  if (dup || dupTreasury) {
    return c.json({ error: 'این هش تراکنش قبلاً ثبت شده است.' }, 409);
  }

  const net = (body.network || (/^0x[0-9a-fA-F]{64}$/.test(txHash) ? 'BEP20' : /^[0-9a-fA-F]{64}$/.test(txHash) ? 'TRC20' : 'SOLANA')).toUpperCase();
  const prepayReceivers = await c.env.DB.prepare(
    `SELECT key, value FROM system_settings WHERE key IN ('treasury_evm_receiver', 'trust_wallet_evm_receiver', 'treasury_trc20_receiver', 'usdt_trc20_wallet', 'treasury_solana_receiver', 'treasury_ton_receiver')`
  ).all<{ key: string; value: string }>().catch(() => ({ results: [] }));
  const pm = new Map(prepayReceivers.results.map((r) => [r.key, r.value]));
  const expectedRcv =
    net === 'TRC20'
      ? pm.get('treasury_trc20_receiver') || pm.get('usdt_trc20_wallet') || ''
      : net === 'SOLANA'
        ? pm.get('treasury_solana_receiver') || ''
        : net === 'TON'
          ? pm.get('treasury_ton_receiver') || ''
          : pm.get('treasury_evm_receiver') || pm.get('trust_wallet_evm_receiver') || '';
  const receipt = await verifyBlockchainTxOnchain(net, txHash, expectedRcv || undefined);
  if (receipt === 'FAILED') {
    return c.json({ error: 'تراکنش در بلاکچین ناموفق بوده است.' }, 400);
  }

  const autoConfirm = receipt === 'CONFIRMED';
  const feePreId = randomId('fee_pre');
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const asset = (body.asset || 'USDT').toUpperCase();

  let settledDebtUsd = 0;
  let addedCreditUsd = 0;
  if (autoConfirm) {
    const split = await settleDebtFirstThenCredit(c.env.DB, user.id, amountUsd, txHash, {
      alsoCreditWalletBalance: false,
    });
    settledDebtUsd = split.settledDebtUsd;
    addedCreditUsd = split.addedCreditUsd;
  }

  const prepayNote =
    settledDebtUsd > 0
      ? `پرداخت $${amountUsd.toFixed(2)}: تسویه $${settledDebtUsd.toFixed(2)} بدهی + شارژ $${addedCreditUsd.toFixed(2)} اعتبار کارمزد`
      : `شارژ پیش‌پرداخت اعتبار کارمزد ${SERVER_PROFIT_FEE_PCT}% (${amountUsd.toFixed(2)}$)`;

  await c.env.DB.prepare(
    `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, tx_hash, note)
     VALUES (?, ?, ?, 'PREPAY_CREDIT', 'USDT', 0, 0, ?, ?, ?, ?)`
  )
    .bind(
      feePreId,
      user.id,
      `prepay:${txHash}`,
      Number((autoConfirm ? addedCreditUsd : amountUsd).toFixed(2)),
      autoConfirm ? 'SETTLED_PREPAID' : 'PENDING_VERIFY',
      txHash,
      prepayNote
    )
    .run();

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO treasury_deposits (id, user_id, category, asset, network, receiver_address, sender_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet, admin_note, confirmed_at)
     VALUES (?, ?, 'CREDIT_TOPUP', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      feePreId,
      user.id,
      asset,
      net,
      body.senderAddress?.trim() || null,
      Number(amountUsd.toFixed(4)),
      txHash,
      autoConfirm ? 'CONFIRMED' : 'PENDING_VERIFY',
      autoConfirm ? 1 : 0,
      autoConfirm ? 1 : 0,
      prepayNote,
      autoConfirm ? nowIso : null
    )
    .run()
    .catch(() => {});

  await notifyAllAdmins(
    c.env,
    `🏦 درخواست شارژ اعتبار کارمزد ${SERVER_PROFIT_FEE_PCT}%\nکاربر: ${user.username}\nمبلغ: $${amountUsd.toFixed(2)}${settledDebtUsd > 0 ? ` (تسویه بدهی: $${settledDebtUsd.toFixed(2)} | اعتبار: $${addedCreditUsd.toFixed(2)})` : ''}\nوضعیت: ${autoConfirm ? '✅ تایید خودکار آن‌چین' : '⏳ در انتظار تایید ادمین'}\nTX: ${txHash}`
  ).catch(() => {});
  await publishTransactionEvent(c.env, {
    eventType: 'INVOICE',
    status: autoConfirm ? 'CONFIRMED' : 'PENDING',
    title: 'شارژ پیش‌پرداخت کارمزد ۳٪ سرور',
    username: user.username,
    userId: user.id,
    amountUsd,
    asset,
    network: net,
    txHash,
    invoiceNo: buildInvoiceNumber(feePreId, nowIso),
    details: settledDebtUsd > 0 ? `تسویه بدهی: $${settledDebtUsd.toFixed(2)} | شارژ اعتبار: $${addedCreditUsd.toFixed(2)}` : undefined,
  }).catch(() => {});

  const enforcement = await evaluateUserFeeStanding(c.env.DB, user.id);
  return c.json({
    ok: true,
    autoConfirmed: autoConfirm,
    status: autoConfirm ? 'CONFIRMED' : 'PENDING_VERIFY',
    settledDebtUsd,
    addedCreditUsd,
    enforcement,
    invoice: {
      invoiceNo: buildInvoiceNumber(feePreId, nowIso),
      id: feePreId,
      kind: 'CREDIT_TOPUP' as const,
      titleFa: settledDebtUsd > 0 ? 'فاکتور تسویه بدهی و شارژ پیش‌پرداخت' : 'فاکتور شارژ اعتبار پیش‌پرداخت کارمزد',
      titleEn: 'Prepaid Fee Credit Invoice',
      network: net,
      asset,
      amountUsd: Number(amountUsd.toFixed(4)),
      senderAddress: body.senderAddress?.trim() || null,
      receiverAddress: null,
      txHash,
      explorerUrl: buildExplorerTxUrl(net, txHash),
      status: autoConfirm ? ('CONFIRMED' as const) : ('PENDING_VERIFY' as const),
      verifiedOnchain: autoConfirm,
      settledDebtUsd,
      addedCreditUsd,
      note: prepayNote,
      createdAt: nowIso,
      confirmedAt: autoConfirm ? nowIso : null,
    },
  });
});

subscriptionRoutes.get('/admin/server-fees', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const [policy, accounts, pendingEntries] = await Promise.all([
    getFeePolicyConfig(c.env.DB),
    c.env.DB.prepare(
      `SELECT u.id, u.username, u.email, u.telegram_id,
              COALESCE(u.fee_prepaid_credit_usd, 0) AS prepaid_credit_usd,
              COALESCE(u.fee_penalty_usd, 0) AS penalty_usd,
              COALESCE(u.fee_lock_status, 'ACTIVE') AS lock_status,
              u.fee_grace_deadline,
              COALESCE(SUM(CASE WHEN l.status = 'ACCRUED' THEN l.fee_usd ELSE 0 END), 0) AS accrued_usd,
              COALESCE(SUM(CASE WHEN l.status = 'PENDING_VERIFY' THEN l.fee_usd ELSE 0 END), 0) AS pending_verify_usd,
              COALESCE(SUM(CASE WHEN l.status IN ('SETTLED_ONCHAIN', 'SETTLED_PREPAID') THEN l.fee_usd ELSE 0 END), 0) AS settled_usd
       FROM users u
       LEFT JOIN server_fee_ledger l ON l.user_id = u.id
       GROUP BY u.id
       HAVING accrued_usd > 0 OR pending_verify_usd > 0 OR penalty_usd > 0 OR prepaid_credit_usd > 0 OR lock_status != 'ACTIVE'
       ORDER BY (accrued_usd + penalty_usd) DESC`
    ).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT l.*, u.username, u.email
       FROM server_fee_ledger l
       JOIN users u ON u.id = l.user_id
       WHERE l.status = 'PENDING_VERIFY'
       ORDER BY l.created_at DESC
       LIMIT 50`
    ).all().catch(() => ({ results: [] })),
  ]);

  return c.json({ policy, accounts: accounts.results, pendingEntries: pendingEntries.results });
});

subscriptionRoutes.post('/admin/server-fees/:userId/action', async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Admin access required' }, 403);
  const targetUserId = c.req.param('userId');
  const body = await c.req.json<{
    action: 'APPROVE_SETTLEMENT' | 'REJECT_TX' | 'APPLY_PENALTY' | 'LOCK' | 'UNLOCK' | 'GRANT_CREDIT';
    amountUsd?: number;
  }>();

  if (body.action === 'APPROVE_SETTLEMENT') {
    const prepayRows = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(fee_usd), 0) AS sum_pre FROM server_fee_ledger WHERE user_id = ? AND source = 'PREPAY_CREDIT' AND status = 'PENDING_VERIFY'`
    ).bind(targetUserId).first<{ sum_pre: number }>().catch(() => ({ sum_pre: 0 }));
    const prepaySum = Number(prepayRows?.sum_pre || 0);

    if (prepaySum > 0) {
      await c.env.DB.prepare(
        `UPDATE server_fee_ledger SET status = 'SETTLED_PREPAID' WHERE user_id = ? AND source = 'PREPAY_CREDIT' AND status = 'PENDING_VERIFY'`
      ).bind(targetUserId).run();
      await settleDebtFirstThenCredit(c.env.DB, targetUserId, prepaySum, 'ADMIN_APPROVED');
    }

    await c.env.DB.prepare(
      `UPDATE server_fee_ledger SET status = 'SETTLED_ONCHAIN' WHERE user_id = ? AND status IN ('PENDING_VERIFY', 'ACCRUED') AND COALESCE(source, '') != 'PREPAY_CREDIT'`
    ).bind(targetUserId).run();
    await c.env.DB.prepare(
      `UPDATE users SET fee_lock_status = 'ACTIVE', fee_penalty_usd = 0, fee_grace_deadline = NULL WHERE id = ?`
    ).bind(targetUserId).run();
  } else if (body.action === 'REJECT_TX') {
    await c.env.DB.prepare(
      `UPDATE server_fee_ledger SET status = CASE WHEN source = 'PREPAY_CREDIT' THEN 'REJECTED' ELSE 'ACCRUED' END WHERE user_id = ? AND status = 'PENDING_VERIFY'`
    ).bind(targetUserId).run();
    await c.env.DB.prepare(
      `UPDATE users SET fee_lock_status = 'LOCKED' WHERE id = ?`
    ).bind(targetUserId).run();
    await c.env.DB.prepare(
      `UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ? AND trading_mode = 'LIVE'`
    ).bind(targetUserId).run().catch(() => {});
  } else if (body.action === 'APPLY_PENALTY') {
    const penalty = Math.max(0.5, Number(body.amountUsd || 1));
    await c.env.DB.prepare(
      `UPDATE users SET fee_penalty_usd = ROUND(COALESCE(fee_penalty_usd, 0) + ?, 4), fee_lock_status = 'LOCKED' WHERE id = ?`
    ).bind(penalty, targetUserId).run();
    await c.env.DB.prepare(
      `UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ? AND trading_mode = 'LIVE'`
    ).bind(targetUserId).run().catch(() => {});
  } else if (body.action === 'LOCK') {
    await c.env.DB.prepare(`UPDATE users SET fee_lock_status = 'LOCKED' WHERE id = ?`).bind(targetUserId).run();
    await c.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED' WHERE user_id = ? AND trading_mode = 'LIVE'`).bind(targetUserId).run().catch(() => {});
  } else if (body.action === 'UNLOCK') {
    await c.env.DB.prepare(`UPDATE users SET fee_lock_status = 'ACTIVE', fee_penalty_usd = 0, fee_grace_deadline = NULL WHERE id = ?`).bind(targetUserId).run();
  } else if (body.action === 'GRANT_CREDIT') {
    const credit = Math.max(1, Number(body.amountUsd || 5));
    await c.env.DB.prepare(
      `UPDATE users SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4) WHERE id = ?`
    ).bind(credit, targetUserId).run();
  }

  const standing = await evaluateUserFeeStanding(c.env.DB, targetUserId);
  const targetMeta = await c.env.DB.prepare(`SELECT username FROM users WHERE id = ?`).bind(targetUserId).first<{ username: string }>().catch(() => null);
  await publishTransactionEvent(c.env, {
    eventType: 'SERVER_FEE',
    status:
      body.action === 'APPROVE_SETTLEMENT' || body.action === 'UNLOCK' || body.action === 'GRANT_CREDIT'
        ? 'CONFIRMED'
        : body.action === 'REJECT_TX'
          ? 'REJECTED'
          : 'LOCKED',
    title: `عملیات مدیریتی کارمزد (${body.action})`,
    username: targetMeta?.username || targetUserId,
    userId: targetUserId,
    amountUsd: typeof body.amountUsd === 'number' ? body.amountUsd : Number(standing.totalDueUsd || 0),
    dueAt: standing.graceDeadline || null,
    details: `وضعیت حساب پس از عملیات: ${standing.lockStatus} | بدهی باقیمانده: $${Number(standing.totalDueUsd || 0).toFixed(2)}`,
  }).catch(() => {});
  return c.json({ ok: true, standing });
});

