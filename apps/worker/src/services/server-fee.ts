import { randomId } from '../crypto.js';

export const SERVER_PROFIT_FEE_PCT = 5.0;

export interface FeePolicyConfig {
  feePct: number;
  graceLimitUsd: number;
  graceHours: number;
  latePenaltyPct: number;
  autoLockEnabled: boolean;
}

export interface FeeEnforcementStatus {
  allowed: boolean;
  lockStatus: 'ACTIVE' | 'WARNING' | 'PENDING_REVIEW' | 'LOCKED';
  reasonCode?: 'FEE_SETTLEMENT_REQUIRED';
  reasonFa?: string;
  reasonEn?: string;
  accruedUsd: number;
  pendingVerifyUsd: number;
  penaltyUsd: number;
  totalDueUsd: number;
  prepaidCreditUsd: number;
  graceLimitUsd: number;
  graceDeadline: string | null;
  hoursRemaining: number | null;
  latePenaltyPct: number;
  autoLockEnabled: boolean;
}

export async function getFeePolicyConfig(db: D1Database): Promise<FeePolicyConfig> {
  const rows = await db
    .prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN ('profit_share_pct', 'fee_grace_limit_usd', 'fee_grace_hours', 'fee_late_penalty_pct', 'fee_auto_lock_enabled')`
    )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));

  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;

  return {
    feePct: Math.max(0, Math.min(20, Number(map.profit_share_pct || SERVER_PROFIT_FEE_PCT) || SERVER_PROFIT_FEE_PCT)),
    graceLimitUsd: Math.max(0.5, Math.min(100, Number(map.fee_grace_limit_usd || 2.0) || 2.0)),
    graceHours: Math.max(1, Math.min(720, Number(map.fee_grace_hours || 72) || 72)),
    latePenaltyPct: Math.max(0, Math.min(100, Number(map.fee_late_penalty_pct ?? 25) || 25)),
    autoLockEnabled: map.fee_auto_lock_enabled !== 'false',
  };
}

export function isValidBlockchainTxHash(txHash: string): boolean {
  const t = txHash.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(t)) return true; // EVM (BSC, ETH, Base, Arb, Polygon)
  if (/^[0-9a-fA-F]{64}$/.test(t)) return true; // TRON / TON hex
  if (/^[1-9A-HJ-NP-Za-km-z]{43,96}$/.test(t)) return true; // Solana Base58 signature
  return false;
}

export async function tryVerifyEvmReceiptOnchain(txHash: string): Promise<'CONFIRMED' | 'FAILED' | 'UNAVAILABLE'> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return 'UNAVAILABLE';
  const rpcs = [
    'https://bsc-dataseed.binance.org',
    'https://eth.llamarpc.com',
  ];
  for (const rpc of rpcs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1400);
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { result?: { status?: string } | null };
      if (data?.result?.status === '0x1') return 'CONFIRMED';
      if (data?.result?.status === '0x0') return 'FAILED';
    } catch {
      // Ignore unreachable RPC in sandboxed/offline mode
    }
  }
  return 'UNAVAILABLE';
}

export async function evaluateUserFeeStanding(db: D1Database, userId: string): Promise<FeeEnforcementStatus> {
  const [policy, agg, uRow] = await Promise.all([
    getFeePolicyConfig(db),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) AS accrued_usd,
           COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFY' THEN fee_usd ELSE 0 END), 0) AS pending_verify_usd
         FROM server_fee_ledger
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{ accrued_usd: number; pending_verify_usd: number }>()
      .catch(() => null),
    db
      .prepare(
        `SELECT
           COALESCE(fee_prepaid_credit_usd, 0) AS prepaid_credit,
           COALESCE(fee_penalty_usd, 0) AS penalty_usd,
           COALESCE(fee_lock_status, 'ACTIVE') AS lock_status,
           fee_grace_deadline
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first<{
        prepaid_credit: number;
        penalty_usd: number;
        lock_status: string;
        fee_grace_deadline: string | null;
      }>()
      .catch(() => null),
  ]);

  const accruedUsd = Number((agg?.accrued_usd || 0).toFixed(4));
  const pendingVerifyUsd = Number((agg?.pending_verify_usd || 0).toFixed(4));
  let penaltyUsd = Number((uRow?.penalty_usd || 0).toFixed(4));
  const prepaidCreditUsd = Number((uRow?.prepaid_credit || 0).toFixed(4));
  let lockStatus = (uRow?.lock_status as FeeEnforcementStatus['lockStatus']) || 'ACTIVE';
  let graceDeadline = uRow?.fee_grace_deadline || null;

  const totalDueUsd = Number((accruedUsd + penaltyUsd).toFixed(4));

  // If zero accrued and zero penalty, ensure clean ACTIVE state (or PENDING_REVIEW if pending verification exists)
  if (accruedUsd <= 0.0001 && penaltyUsd <= 0.0001) {
    const nextStatus = pendingVerifyUsd > 0 ? 'PENDING_REVIEW' : 'ACTIVE';
    if (lockStatus !== nextStatus || graceDeadline !== null) {
      await db
        .prepare(`UPDATE users SET fee_lock_status = ?, fee_grace_deadline = NULL WHERE id = ?`)
        .bind(nextStatus, userId)
        .run()
        .catch(() => {});
    }
    return {
      allowed: true,
      lockStatus: nextStatus,
      accruedUsd: 0,
      pendingVerifyUsd,
      penaltyUsd: 0,
      totalDueUsd: 0,
      prepaidCreditUsd,
      graceLimitUsd: policy.graceLimitUsd,
      graceDeadline: null,
      hoursRemaining: null,
      latePenaltyPct: policy.latePenaltyPct,
      autoLockEnabled: policy.autoLockEnabled,
    };
  }

  let hoursRemaining: number | null = null;
  if (accruedUsd >= policy.graceLimitUsd || penaltyUsd > 0 || lockStatus === 'LOCKED') {
    if (!graceDeadline) {
      const deadlineDate = new Date(Date.now() + policy.graceHours * 3_600_000);
      graceDeadline = deadlineDate.toISOString();
      await db
        .prepare(`UPDATE users SET fee_grace_deadline = ?, fee_lock_status = CASE WHEN fee_lock_status = 'LOCKED' THEN 'LOCKED' ELSE 'WARNING' END WHERE id = ?`)
        .bind(graceDeadline, userId)
        .run()
        .catch(() => {});
      if (lockStatus !== 'LOCKED') lockStatus = 'WARNING';
    }

    const msLeft = Date.parse(graceDeadline) - Date.now();
    hoursRemaining = Number(Math.max(0, msLeft / 3_600_000).toFixed(1));
    const criticalDebtLimit = policy.graceLimitUsd * 2.5;
    const deadlinePassed = Number.isFinite(msLeft) && msLeft <= 0;

    if (policy.autoLockEnabled && (deadlinePassed || accruedUsd >= criticalDebtLimit || lockStatus === 'LOCKED')) {
      if (lockStatus !== 'LOCKED') {
        if (penaltyUsd <= 0 && policy.latePenaltyPct > 0) {
          penaltyUsd = Number((accruedUsd * (policy.latePenaltyPct / 100)).toFixed(4));
        }
        lockStatus = 'LOCKED';
        await db
          .prepare(`UPDATE users SET fee_lock_status = 'LOCKED', fee_penalty_usd = ? WHERE id = ?`)
          .bind(penaltyUsd, userId)
          .run()
          .catch(() => {});
        // Automatically pause live bot engines on fee delinquency
        await db
          .prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ? AND trading_mode = 'LIVE'`)
          .bind(userId)
          .run()
          .catch(() => {});
      }
    } else if (lockStatus === 'ACTIVE') {
      lockStatus = 'WARNING';
      await db
        .prepare(`UPDATE users SET fee_lock_status = 'WARNING' WHERE id = ?`)
        .bind(userId)
        .run()
        .catch(() => {});
    }
  }

  const finalDue = Number((accruedUsd + penaltyUsd).toFixed(4));
  const blocked = policy.autoLockEnabled && lockStatus === 'LOCKED';

  return {
    allowed: !blocked,
    lockStatus,
    ...(blocked
      ? {
          reasonCode: 'FEE_SETTLEMENT_REQUIRED' as const,
          reasonFa: `حساب معاملات واقعی به دلیل عدم تسویه کارمزد ۵٪ سرور ($${finalDue.toFixed(2)} شامل بدهی و جریمه دیرکرد) قفل شده است. با واریز و ثبت TX Hash در بخش «کارمزد ۵٪ سود» بلافاصله باز می‌شود. شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری همچنان رایگان فعال است.`,
          reasonEn: `Live trading is paused due to overdue 5% profit-share fees ($${finalDue.toFixed(2)}). Submit your Trust Wallet settlement TX hash in the 5% Fee Ledger to unlock immediately. Free $10K Demo remains active.`,
        }
      : {}),
    accruedUsd,
    pendingVerifyUsd,
    penaltyUsd,
    totalDueUsd: finalDue,
    prepaidCreditUsd,
    graceLimitUsd: policy.graceLimitUsd,
    graceDeadline,
    hoursRemaining,
    latePenaltyPct: policy.latePenaltyPct,
    autoLockEnabled: policy.autoLockEnabled,
  };
}

export async function checkLiveFeeEnforcement(db: D1Database, userId: string): Promise<FeeEnforcementStatus> {
  return evaluateUserFeeStanding(db, userId);
}

/**
 * Anti-Abuse Referral Qualification Engine (V10.2):
 * - Rewards strictly credit NON-WITHDRAWABLE `fee_prepaid_credit_usd` (never cash withdrawal).
 * - Blocks fake/self-referral accounts by verifying:
 *   1) Distinct IP+UA, distinct Telegram/Phone, and ZERO shared Trust Wallet addresses (EVM/Solana/TRON/TON)
 *   2) Friend holds real verified balance >= $10 (never counts $0 accounts or $10K free Paper Simulator)
 *   3) Friend executed >= 1 real LIVE trade
 */
export async function unlockTradingReferralFeeCredit(
  db: D1Database,
  referredUserId: string,
  params: { tradeId: string; mode: string; feeUsd: number; realizedPnlUsd: number; tradeAmountUsd?: number }
): Promise<{ granted: boolean; referrerCreditUsd: number; friendBonusUsd: number; reason: string }> {
  if (params.mode !== 'LIVE') {
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: 'PAPER_TRADE_IGNORED' };
  }

  const ref = await db
    .prepare(`SELECT * FROM referrals WHERE referred_user_id = ? LIMIT 1`)
    .bind(referredUserId)
    .first<{
      id: string;
      referrer_user_id: string;
      referred_user_id: string;
      status: string;
      fraud_flag: number;
      commission_usd: number;
    }>()
    .catch(() => null);

  if (!ref || ref.fraud_flag === 1 || ref.status === 'FLAGGED_DUPLICATE') {
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: 'NO_ELIGIBLE_REFERRAL' };
  }

  if (ref.referrer_user_id === referredUserId) {
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: 'SELF_REFERRAL_BLOCKED' };
  }

  const [referrerRow, friendRow, perpRow] = await Promise.all([
    db
      .prepare(
        `SELECT id, signup_ip_hash, signup_ua_hash, telegram_id, phone_number,
                trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton
         FROM users WHERE id = ?`
      )
      .bind(ref.referrer_user_id)
      .first<Record<string, string | null>>()
      .catch(() => null),
    db
      .prepare(
        `SELECT id, signup_ip_hash, signup_ua_hash, telegram_id, phone_number,
                trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton,
                COALESCE(wallet_balance_usdt, 0) AS wallet_bal
         FROM users WHERE id = ?`
      )
      .bind(referredUserId)
      .first<Record<string, string | number | null>>()
      .catch(() => null),
    db
      .prepare(
        `SELECT COALESCE(MAX(margin_usd), 0) AS perp_equity
         FROM perp_dex_orders WHERE user_id = ? AND execution_kind != 'PAPER'`
      )
      .bind(referredUserId)
      .first<{ perp_equity: number }>()
      .catch(() => null),
  ]);

  if (!referrerRow || !friendRow) {
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: 'USER_NOT_FOUND' };
  }

  const normAddr = (v: unknown) => (typeof v === 'string' && v.trim().length > 6 ? v.trim().toLowerCase() : null);
  const referrerWallets = new Set(
    [
      normAddr(referrerRow.trust_wallet_address),
      normAddr(referrerRow.trust_wallet_tron),
      normAddr(referrerRow.trust_wallet_solana),
      normAddr(referrerRow.trust_wallet_ton),
    ].filter(Boolean)
  );
  const friendWallets = [
    normAddr(friendRow.trust_wallet_address),
    normAddr(friendRow.trust_wallet_tron),
    normAddr(friendRow.trust_wallet_solana),
    normAddr(friendRow.trust_wallet_ton),
  ].filter((x): x is string => Boolean(x));

  const sameWallet = friendWallets.some((w) => referrerWallets.has(w));
  const sameDeviceIp = Boolean(
    referrerRow.signup_ip_hash &&
      friendRow.signup_ip_hash &&
      referrerRow.signup_ip_hash === friendRow.signup_ip_hash &&
      referrerRow.signup_ua_hash === friendRow.signup_ua_hash
  );
  const sameTelegramOrPhone = Boolean(
    (referrerRow.telegram_id && referrerRow.telegram_id === friendRow.telegram_id) ||
      (referrerRow.phone_number && referrerRow.phone_number === friendRow.phone_number)
  );

  if (sameWallet || sameDeviceIp || sameTelegramOrPhone) {
    const fraudReason = sameWallet
      ? 'SHARED_TRUST_WALLET_SELF_REFERRAL'
      : sameTelegramOrPhone
        ? 'SHARED_TELEGRAM_OR_PHONE'
        : 'SAME_IP_DEVICE_FINGERPRINT';
    await db
      .prepare(`UPDATE referrals SET fraud_flag = 1, status = 'FLAGGED_DUPLICATE', fraud_reason = ? WHERE id = ?`)
      .bind(fraudReason, ref.id)
      .run()
      .catch(() => {});
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: fraudReason };
  }

  // Real balance >= $10 check (uses live wallet balance, live Perp equity, or actual >=$10 live trade amount)
  const verifiedBalanceUsd = Math.max(
    Number(friendRow.wallet_bal || 0),
    Number(perpRow?.perp_equity || 0),
    Number(params.tradeAmountUsd || 0)
  );
  if (verifiedBalanceUsd < 10) {
    await db
      .prepare(`UPDATE referrals SET fraud_reason = 'PENDING_MIN_10_USD_BALANCE' WHERE id = ? AND status = 'PENDING'`)
      .bind(ref.id)
      .run()
      .catch(() => {});
    return { granted: false, referrerCreditUsd: 0, friendBonusUsd: 0, reason: 'MIN_10_USD_REQUIRED' };
  }

  let referrerCreditUsd = 0;
  let friendBonusUsd = 0;

  // 1) One-time activation fee-credit bonus on first qualified LIVE trade with >= $10 balance
  if (ref.status !== 'REWARDED') {
    const actTradeId = `ref_act:${ref.id}`;
    const alreadyAct = await db
      .prepare(`SELECT id FROM server_fee_ledger WHERE trade_id = ? LIMIT 1`)
      .bind(actTradeId)
      .first<{ id: string }>()
      .catch(() => null);
    if (!alreadyAct) {
      referrerCreditUsd += 2.0;
      friendBonusUsd += 1.0;
      await db.batch([
        db
          .prepare(
            `UPDATE users SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + 2.0, 4) WHERE id = ?`
          )
          .bind(ref.referrer_user_id),
        db
          .prepare(
            `UPDATE users SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + 1.0, 4) WHERE id = ?`
          )
          .bind(referredUserId),
        db
          .prepare(
            `UPDATE referrals
             SET status = 'REWARDED', fraud_flag = 0, fraud_reason = NULL, reward_days = 0,
                 commission_usd = ROUND(COALESCE(commission_usd, 0) + 2.0, 4),
                 unlocked_at = COALESCE(unlocked_at, datetime('now'))
             WHERE id = ?`
          )
          .bind(ref.id),
        db
          .prepare(
            `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
             VALUES (?, ?, ?, 'REFERRAL_FEE_CREDIT', 'USDT', 0, 0, 2.0, 'SETTLED_PREPAID', ?)`
          )
          .bind(
            randomId('fee_ref'),
            ref.referrer_user_id,
            actTradeId,
            'پاداش غیرقابل‌برداشت اعتبار کارمزد ۵٪ بابت فعال‌سازی دوست (حداقل ۱۰$ موجودی + ترید واقعی)'
          ),
        db
          .prepare(
            `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
             VALUES (?, ?, ?, 'REFERRAL_WELCOME_CREDIT', 'USDT', 0, 0, 1.0, 'SETTLED_PREPAID', ?)`
          )
          .bind(
            randomId('fee_refw'),
            referredUserId,
            `ref_welcome:${ref.id}`,
            'هدیه خوش‌آمدگویی غیرقابل‌برداشت اعتبار کارمزد ۵٪ با کد معرف'
          ),
      ]);
    }
  }

  // 2) Ongoing 20% fee-credit share from friend's profitable 5% server fees (non-withdrawable, capped $250/friend)
  if (params.feeUsd > 0 && Number(ref.commission_usd || 0) < 250) {
    const shareTradeId = `ref_share:${params.tradeId}`;
    const alreadyShare = await db
      .prepare(`SELECT id FROM server_fee_ledger WHERE trade_id = ? LIMIT 1`)
      .bind(shareTradeId)
      .first<{ id: string }>()
      .catch(() => null);
    const shareUsd = Number((params.feeUsd * 0.2).toFixed(4));
    if (!alreadyShare && shareUsd >= 0.0001) {
      referrerCreditUsd += shareUsd;
      await db.batch([
        db
          .prepare(
            `UPDATE users SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4) WHERE id = ?`
          )
          .bind(shareUsd, ref.referrer_user_id),
        db
          .prepare(
            `UPDATE referrals SET commission_usd = ROUND(COALESCE(commission_usd, 0) + ?, 4) WHERE id = ?`
          )
          .bind(shareUsd, ref.id),
        db
          .prepare(
            `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
             VALUES (?, ?, ?, 'REFERRAL_FEE_CREDIT', 'USDT', ?, 20, ?, 'SETTLED_PREPAID', ?)`
          )
          .bind(
            randomId('fee_refs'),
            ref.referrer_user_id,
            shareTradeId,
            Number(params.realizedPnlUsd.toFixed(4)),
            shareUsd,
            '۲۰٪ سهم اعتبار غیرقابل‌برداشت از کارمزد ۵٪ معامله سودده دوست'
          ),
      ]);
    }
  }

  return {
    granted: referrerCreditUsd > 0 || friendBonusUsd > 0,
    referrerCreditUsd: Number(referrerCreditUsd.toFixed(4)),
    friendBonusUsd: Number(friendBonusUsd.toFixed(4)),
    reason: 'QUALIFIED_CREDIT_APPLIED',
  };
}

/**
 * Records a transparent 5% server-cost fee ONLY when a real (LIVE) trade closes with positive profit.
 * Auto-deducts from user's Prepaid Fee Credit if available; otherwise accrues and updates standing.
 * Also evaluates & unlocks anti-abuse referral Fee Credits when qualifying LIVE trades settle.
 * Losses and Demo Simulator (PAPER) trades NEVER incur any fee ($0).
 */
export async function recordProfitShareServerFee(
  db: D1Database,
  params: {
    userId: string;
    tradeId: string;
    source: 'PERP_LIVE' | 'COPY_V2_LIVE' | 'DEX_LIVE';
    symbol: string;
    mode: string;
    realizedPnlUsd: number;
    tradeAmountUsd?: number;
    note?: string;
  }
): Promise<{ recorded: boolean; feeUsd: number; feePct: number; paidFromCredit?: boolean }> {
  if (params.mode !== 'LIVE') {
    return { recorded: false, feeUsd: 0, feePct: SERVER_PROFIT_FEE_PCT };
  }

  const policy = await getFeePolicyConfig(db);
  const feePct = policy.feePct;
  const positivePnl = Number.isFinite(params.realizedPnlUsd) && params.realizedPnlUsd > 0 ? params.realizedPnlUsd : 0;
  const feeUsd = positivePnl > 0 ? Number((positivePnl * (feePct / 100)).toFixed(4)) : 0;

  if (feeUsd <= 0) {
    // Even if trade closed break-even/small loss, evaluate qualification if balance >= $10
    await unlockTradingReferralFeeCredit(db, params.userId, {
      tradeId: params.tradeId,
      mode: params.mode,
      feeUsd: 0,
      realizedPnlUsd: Number(params.realizedPnlUsd || 0),
      tradeAmountUsd: params.tradeAmountUsd,
    }).catch(() => {});
    return { recorded: false, feeUsd: 0, feePct };
  }

  // Avoid duplicate ledger entry for the same closed trade
  const existing = await db
    .prepare(`SELECT id FROM server_fee_ledger WHERE trade_id = ? LIMIT 1`)
    .bind(params.tradeId)
    .first<{ id: string }>()
    .catch(() => null);
  if (existing) {
    return { recorded: false, feeUsd: 0, feePct };
  }

  const uRow = await db
    .prepare(`SELECT COALESCE(fee_prepaid_credit_usd, 0) AS credit FROM users WHERE id = ?`)
    .bind(params.userId)
    .first<{ credit: number }>()
    .catch(() => null);
  const creditAvail = Math.max(0, Number(uRow?.credit || 0));

  let paidFromCredit = false;
  let ledgerStatus = 'ACCRUED';
  let finalNote = params.note || `کارمزد ${feePct}٪ هزینه سرور از معامله سودده واقعی ${params.symbol}`;

  if (creditAvail >= feeUsd) {
    paidFromCredit = true;
    ledgerStatus = 'SETTLED_PREPAID';
    finalNote = `کسر خودکار ${feePct}٪ از اعتبار پیش‌پرداخت کارمزد (${params.symbol})`;
    await db
      .prepare(`UPDATE users SET fee_prepaid_credit_usd = ROUND(MAX(0, COALESCE(fee_prepaid_credit_usd, 0) - ?), 4) WHERE id = ?`)
      .bind(feeUsd, params.userId)
      .run()
      .catch(() => {});
  }

  await db
    .prepare(
      `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      randomId('fee'),
      params.userId,
      params.tradeId,
      params.source,
      params.symbol,
      Number(params.realizedPnlUsd.toFixed(4)),
      feePct,
      feeUsd,
      ledgerStatus,
      finalNote
    )
    .run()
    .catch(() => {});

  await evaluateUserFeeStanding(db, params.userId);
  await unlockTradingReferralFeeCredit(db, params.userId, {
    tradeId: params.tradeId,
    mode: params.mode,
    feeUsd,
    realizedPnlUsd: Number(params.realizedPnlUsd || 0),
    tradeAmountUsd: params.tradeAmountUsd,
  }).catch(() => {});
  return { recorded: true, feeUsd, feePct, paidFromCredit };
}

export async function getUserServerFeeSummary(db: D1Database, userId: string) {
  const [enforcement, agg, recent] = await Promise.all([
    evaluateUserFeeStanding(db, userId),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(realized_pnl_usd), 0) AS total_profitable_pnl_usd,
           COALESCE(SUM(fee_usd), 0) AS total_fee_usd,
           COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) AS accrued_fee_usd,
           COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFY' THEN fee_usd ELSE 0 END), 0) AS pending_verify_fee_usd,
           COALESCE(SUM(CASE WHEN status IN ('SETTLED_ONCHAIN', 'SETTLED_PREPAID') THEN fee_usd ELSE 0 END), 0) AS settled_fee_usd,
           COUNT(*) AS profitable_trades_count
         FROM server_fee_ledger
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{
        total_profitable_pnl_usd: number;
        total_fee_usd: number;
        accrued_fee_usd: number;
        pending_verify_fee_usd: number;
        settled_fee_usd: number;
        profitable_trades_count: number;
      }>()
      .catch(() => null),
    db
      .prepare(
        `SELECT id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, tx_hash, note, created_at
         FROM server_fee_ledger
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all()
      .catch(() => ({ results: [] })),
  ]);

  return {
    feePct: SERVER_PROFIT_FEE_PCT,
    totalProfitablePnlUsd: Number(agg?.total_profitable_pnl_usd || 0),
    totalFeeUsd: Number(agg?.total_fee_usd || 0),
    accruedFeeUsd: Number(agg?.accrued_fee_usd || 0),
    pendingVerifyFeeUsd: Number(agg?.pending_verify_fee_usd || 0),
    settledFeeUsd: Number(agg?.settled_fee_usd || 0),
    profitableTradesCount: Number(agg?.profitable_trades_count || 0),
    enforcement,
    entries: recent.results,
  };
}
