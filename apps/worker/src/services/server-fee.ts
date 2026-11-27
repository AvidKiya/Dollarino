import { randomId } from '../crypto.js';

export const SERVER_PROFIT_FEE_PCT = 3.0;
export const FREE_PROFITABLE_LIVE_TRADES = 3;

export interface FeePolicyConfig {
  feePct: number;
  freeProfitableTrades: number;
  graceLimitUsd: number;
  graceHours: number;
  latePenaltyPct: number;
  autoLockEnabled: boolean;
}

export interface FeeEnforcementStatus {
  allowed: boolean;
  canManageOpenPositions: boolean;
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
  freeTradesUsed: number;
  freeTradesLimit: number;
  freeTradesRemaining: number;
  feeExempt?: boolean;
}

async function isUserFeeExempt(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<{ role: string | null }>()
    .catch(() => null);
  const role = String(row?.role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

const LIVE_TRADE_SOURCES = `'PERP_LIVE', 'COPY_V2_LIVE', 'DEX_LIVE', 'SNIPER_LIVE'`;

export async function getFeePolicyConfig(db: D1Database): Promise<FeePolicyConfig> {
  const rows = await db
    .prepare(
      `SELECT key, value FROM system_settings
       WHERE key IN ('profit_share_pct', 'free_profitable_live_trades', 'fee_grace_limit_usd', 'fee_grace_hours', 'fee_late_penalty_pct', 'fee_auto_lock_enabled')`
    )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));

  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;

  return {
    feePct: Math.max(0, Math.min(20, Number(map.profit_share_pct ?? SERVER_PROFIT_FEE_PCT) || SERVER_PROFIT_FEE_PCT)),
    freeProfitableTrades: Math.max(0, Math.min(20, Number(map.free_profitable_live_trades ?? FREE_PROFITABLE_LIVE_TRADES))),
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

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function evmAddressMatches(actual: string | undefined | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const cleanExp = expected.trim().toLowerCase().replace(/^0x/, '');
  const cleanAct = actual.trim().toLowerCase().replace(/^0x/, '');
  if (!cleanExp || !cleanAct) return false;
  return cleanAct === cleanExp || cleanAct.endsWith(cleanExp);
}

export async function tryVerifyEvmReceiptOnchain(
  txHash: string,
  expectedRecipient?: string
): Promise<'CONFIRMED' | 'FAILED' | 'UNAVAILABLE'> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return 'UNAVAILABLE';
  const rpcs = [
    'https://bsc-dataseed.binance.org',
    'https://mainnet.base.org',
    'https://arb1.arbitrum.io/rpc',
    'https://ethereum-rpc.publicnode.com',
    'https://polygon-bor-rpc.publicnode.com',
  ];
  const normalizedExp = expectedRecipient?.trim();
  const checkRecipient = Boolean(normalizedExp && /^0x[0-9a-fA-F]{40}$/.test(normalizedExp));
  for (const rpc of rpcs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2400);
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        result?: {
          status?: string;
          to?: string | null;
          logs?: Array<{ topics?: string[] }>;
        } | null;
      };
      if (data?.result?.status === '0x0') return 'FAILED';
      if (data?.result?.status === '0x1') {
        if (!checkRecipient || !normalizedExp) return 'CONFIRMED';
        const directMatch = evmAddressMatches(data.result.to, normalizedExp);
        const tokenTransferMatch = Array.isArray(data.result.logs)
          ? data.result.logs.some(
              (log) =>
                Array.isArray(log.topics) &&
                log.topics.length >= 3 &&
                String(log.topics[0] || '').toLowerCase() === ERC20_TRANSFER_TOPIC &&
                evmAddressMatches(log.topics[2], normalizedExp)
            )
          : false;
        if (directMatch || tokenTransferMatch) return 'CONFIRMED';
        // Receipt succeeded on-chain, but NOT sent to configured treasury recipient -> require manual verification
        return 'UNAVAILABLE';
      }
    } catch {
      // Ignore unreachable RPC
    }
  }
  return 'UNAVAILABLE';
}

export async function verifyBlockchainTxOnchain(
  network: string,
  txHash: string,
  expectedRecipient?: string
): Promise<'CONFIRMED' | 'FAILED' | 'UNAVAILABLE'> {
  const cleanHash = txHash.trim();
  const net = String(network || '').toUpperCase().trim();
  if (!isValidBlockchainTxHash(cleanHash)) return 'UNAVAILABLE';

  if (/^0x[0-9a-fA-F]{64}$/.test(cleanHash)) {
    return tryVerifyEvmReceiptOnchain(cleanHash, expectedRecipient);
  }

  if (net === 'TRC20' || net === 'TRON' || (/^[0-9a-fA-F]{64}$/.test(cleanHash) && net !== 'TON')) {
    try {
      const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(cleanHash)}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          confirmed?: boolean;
          contractRet?: string;
          revert?: boolean;
          toAddress?: string;
          trc20TransferInfo?: Array<{ to_address?: string }>;
        };
        if (j.revert || (j.contractRet && j.contractRet !== 'SUCCESS')) return 'FAILED';
        if (j.confirmed && j.contractRet === 'SUCCESS') {
          if (expectedRecipient) {
            const directMatch = j.toAddress === expectedRecipient;
            const trc20Match = Array.isArray(j.trc20TransferInfo)
              ? j.trc20TransferInfo.some((t) => t.to_address === expectedRecipient)
              : false;
            if (!directMatch && !trc20Match) return 'UNAVAILABLE';
          }
          return 'CONFIRMED';
        }
      }
    } catch {
      // ignore
    }
    return 'UNAVAILABLE';
  }

  if (net === 'SOLANA' || /^[1-9A-HJ-NP-Za-km-z]{43,96}$/.test(cleanHash)) {
    for (const rpc of ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com']) {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignatureStatuses',
            params: [[cleanHash], { searchTransactionHistory: true }],
          }),
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) continue;
        const j = (await res.json().catch(() => ({}))) as {
          result?: { value?: Array<{ err?: unknown; confirmationStatus?: string } | null> };
        };
        const st = j.result?.value?.[0];
        if (!st) continue;
        if (st.err) return 'FAILED';
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
          return 'CONFIRMED';
        }
      } catch {
        // try next rpc
      }
    }
    return 'UNAVAILABLE';
  }

  return 'UNAVAILABLE';
}

export async function getUserFreeTrialProgress(db: D1Database, userId: string, freeLimit = FREE_PROFITABLE_LIVE_TRADES) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM server_fee_ledger
       WHERE user_id = ? AND source IN (${LIVE_TRADE_SOURCES})`
    )
    .bind(userId)
    .first<{ cnt: number }>()
    .catch(() => ({ cnt: 0 }));
  const totalProfitableLiveTrades = Number(row?.cnt ?? 0);
  const freeTradesUsed = Math.min(freeLimit, totalProfitableLiveTrades);
  const freeTradesRemaining = Math.max(0, freeLimit - totalProfitableLiveTrades);
  return { totalProfitableLiveTrades, freeTradesUsed, freeTradesLimit: freeLimit, freeTradesRemaining };
}

export async function evaluateUserFeeStanding(db: D1Database, userId: string): Promise<FeeEnforcementStatus> {
  if (await isUserFeeExempt(db, userId)) {
    return {
      allowed: true,
      canManageOpenPositions: true,
      lockStatus: 'ACTIVE',
      accruedUsd: 0,
      pendingVerifyUsd: 0,
      penaltyUsd: 0,
      totalDueUsd: 0,
      prepaidCreditUsd: 0,
      graceLimitUsd: 999999,
      graceDeadline: null,
      hoursRemaining: null,
      latePenaltyPct: 0,
      autoLockEnabled: false,
      freeTradesUsed: 0,
      freeTradesLimit: 999999,
      freeTradesRemaining: 999999,
      feeExempt: true,
    };
  }
  const [policy, agg, uRow] = await Promise.all([
    getFeePolicyConfig(db),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) AS accrued_usd,
           COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFY' THEN fee_usd ELSE 0 END), 0) AS pending_verify_usd,
           COALESCE(SUM(CASE WHEN source IN (${LIVE_TRADE_SOURCES}) THEN 1 ELSE 0 END), 0) AS live_prof_count
         FROM server_fee_ledger
         WHERE user_id = ?`
      )
      .bind(userId)
      .first<{ accrued_usd: number; pending_verify_usd: number; live_prof_count: number }>()
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
  const liveProfCount = Number(agg?.live_prof_count || 0);
  const freeTradesUsed = Math.min(policy.freeProfitableTrades, liveProfCount);
  const freeTradesRemaining = Math.max(0, policy.freeProfitableTrades - liveProfCount);

  let penaltyUsd = Number((uRow?.penalty_usd || 0).toFixed(4));
  const prepaidCreditUsd = Number((uRow?.prepaid_credit || 0).toFixed(4));
  let lockStatus = (uRow?.lock_status as FeeEnforcementStatus['lockStatus']) || 'ACTIVE';
  let graceDeadline = uRow?.fee_grace_deadline || null;

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
      canManageOpenPositions: true,
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
      freeTradesUsed,
      freeTradesLimit: policy.freeProfitableTrades,
      freeTradesRemaining,
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
        // IMPORTANT SAFETY GUARANTEE: NEVER stop bot or freeze open trades!
        // Open positions stay actively managed (TP/SL/Trailing) so they close in profit;
        // only NEW trade entries are blocked until overdue fees are settled.
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
    canManageOpenPositions: true,
    lockStatus,
    ...(blocked
      ? {
          reasonCode: 'FEE_SETTLEMENT_REQUIRED' as const,
          reasonFa: `باز کردن معامله جدید واقعی تا زمان تسویه کارمزد ۳٪ سرور ($${finalDue.toFixed(2)}) موقتاً متوقف است. پوزیشن‌های باز فعلی شما همچنان مدیریت می‌شوند تا در سود بسته شوند. پس از واریز و ثبت TX Hash بلافاصله باز می‌شود.`,
          reasonEn: `New LIVE entries are paused due to overdue 3% profit-share fees ($${finalDue.toFixed(2)}). Existing open trades remain actively managed for TP/SL profit exit. Settle in Treasury to unlock new entries.`,
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
    freeTradesUsed,
    freeTradesLimit: policy.freeProfitableTrades,
    freeTradesRemaining,
  };
}

export async function checkLiveFeeEnforcement(db: D1Database, userId: string): Promise<FeeEnforcementStatus> {
  return evaluateUserFeeStanding(db, userId);
}

/**
 * Anti-Abuse Referral Qualification Engine:
 * - Credits NON-WITHDRAWABLE `fee_prepaid_credit_usd` toward 3% profit fees.
 * - Requires distinct wallet/device/TG/phone, real balance >= $10, and >= 1 real LIVE trade.
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
            'پاداش غیرقابل‌برداشت اعتبار کارمزد ۳٪ بابت فعال‌سازی دوست (حداقل ۱۰$ موجودی + ترید واقعی)'
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
            'هدیه خوش‌آمدگویی غیرقابل‌برداشت اعتبار کارمزد ۳٪ با کد معرف'
          ),
      ]);
    }
  }

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
            '۲۰٪ سهم اعتبار غیرقابل‌برداشت از کارمزد ۳٪ معامله سودده دوست'
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
 * Records transparent Profit-Share Server Fee ONLY when a real (LIVE) trade closes with positive profit:
 * - First 3 profitable LIVE trades per user: 0% fee ($0, recorded as FREE_TRIAL).
 * - From 4th profitable LIVE trade onward: 3% of net profit (auto-deducted from Prepaid Credit if available).
 * - Losses and Demo Simulator (PAPER) trades NEVER incur any fee ($0).
 */
export async function recordProfitShareServerFee(
  db: D1Database,
  params: {
    userId: string;
    tradeId: string;
    source: 'PERP_LIVE' | 'COPY_V2_LIVE' | 'DEX_LIVE' | 'SNIPER_LIVE';
    symbol: string;
    mode: string;
    realizedPnlUsd: number;
    tradeAmountUsd?: number;
    note?: string;
  }
): Promise<{
  recorded: boolean;
  feeUsd: number;
  feePct: number;
  paidFromCredit?: boolean;
  freeTrialUsed?: boolean;
  freeTradesRemaining?: number;
}> {
  if (params.mode !== 'LIVE') {
    return { recorded: false, feeUsd: 0, feePct: SERVER_PROFIT_FEE_PCT };
  }

  if (await isUserFeeExempt(db, params.userId)) {
    return { recorded: false, feeUsd: 0, feePct: 0, freeTrialUsed: true, freeTradesRemaining: 999999 };
  }

  const policy = await getFeePolicyConfig(db);
  const positivePnl = Number.isFinite(params.realizedPnlUsd) && params.realizedPnlUsd > 0 ? params.realizedPnlUsd : 0;

  if (positivePnl <= 0) {
    await unlockTradingReferralFeeCredit(db, params.userId, {
      tradeId: params.tradeId,
      mode: params.mode,
      feeUsd: 0,
      realizedPnlUsd: Number(params.realizedPnlUsd || 0),
      tradeAmountUsd: params.tradeAmountUsd,
    }).catch(() => {});
    return { recorded: false, feeUsd: 0, feePct: policy.feePct };
  }

  // Avoid duplicate ledger entry for the same closed trade
  const existing = await db
    .prepare(`SELECT id FROM server_fee_ledger WHERE trade_id = ? LIMIT 1`)
    .bind(params.tradeId)
    .first<{ id: string }>()
    .catch(() => null);
  if (existing) {
    return { recorded: false, feeUsd: 0, feePct: policy.feePct };
  }

  const trial = await getUserFreeTrialProgress(db, params.userId, policy.freeProfitableTrades);
  if (trial.totalProfitableLiveTrades < policy.freeProfitableTrades) {
    const tradeNumber = trial.totalProfitableLiveTrades + 1;
    const freeRemaining = Math.max(0, policy.freeProfitableTrades - tradeNumber);
    await db
      .prepare(
        `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, note)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'FREE_TRIAL', ?)`
      )
      .bind(
        randomId('fee'),
        params.userId,
        params.tradeId,
        params.source,
        params.symbol,
        Number(positivePnl.toFixed(4)),
        `هدیه معامله سودده رایگان (${tradeNumber} از ${policy.freeProfitableTrades}) · ۰٪ کارمزد روی ${params.symbol}`
      )
      .run()
      .catch(() => {});

    await evaluateUserFeeStanding(db, params.userId);
    await unlockTradingReferralFeeCredit(db, params.userId, {
      tradeId: params.tradeId,
      mode: params.mode,
      feeUsd: 0,
      realizedPnlUsd: Number(params.realizedPnlUsd || 0),
      tradeAmountUsd: params.tradeAmountUsd,
    }).catch(() => {});
    return {
      recorded: true,
      feeUsd: 0,
      feePct: 0,
      freeTrialUsed: true,
      freeTradesRemaining: freeRemaining,
    };
  }

  const feePct = policy.feePct;
  const feeUsd = Number((positivePnl * (feePct / 100)).toFixed(4));
  if (feeUsd <= 0) {
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
      Number(positivePnl.toFixed(4)),
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
  return { recorded: true, feeUsd, feePct, paidFromCredit, freeTrialUsed: false, freeTradesRemaining: 0 };
}

export async function getUserServerFeeSummary(db: D1Database, userId: string) {
  const [enforcement, agg, recent] = await Promise.all([
    evaluateUserFeeStanding(db, userId),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN source IN (${LIVE_TRADE_SOURCES}) THEN realized_pnl_usd ELSE 0 END), 0) AS total_profitable_pnl_usd,
           COALESCE(SUM(fee_usd), 0) AS total_fee_usd,
           COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) AS accrued_fee_usd,
           COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFY' THEN fee_usd ELSE 0 END), 0) AS pending_verify_fee_usd,
           COALESCE(SUM(CASE WHEN status IN ('SETTLED_ONCHAIN', 'SETTLED_PREPAID') THEN fee_usd ELSE 0 END), 0) AS settled_fee_usd,
           COALESCE(SUM(CASE WHEN source IN (${LIVE_TRADE_SOURCES}) THEN 1 ELSE 0 END), 0) AS profitable_trades_count
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
    feePct: enforcement.feeExempt ? 0 : SERVER_PROFIT_FEE_PCT,
    feeExempt: Boolean(enforcement.feeExempt),
    freeTradesUsed: enforcement.freeTradesUsed,
    freeTradesLimit: enforcement.freeTradesLimit,
    freeTradesRemaining: enforcement.freeTradesRemaining,
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
