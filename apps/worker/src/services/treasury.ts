import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decryptVaultJson, encryptVaultJson, randomId } from '../crypto.js';
import { evaluateUserFeeStanding, isValidBlockchainTxHash, tryVerifyEvmReceiptOnchain } from './server-fee.js';

export type TreasuryNetwork = 'BEP20' | 'TRC20' | 'ERC20' | 'BASE' | 'ARBITRUM' | 'SOLANA' | 'TON';
export type TreasuryAsset = 'USDT' | 'BNB' | 'ETH' | 'TRX' | 'SOL' | 'TON' | 'USDC';
export type TreasuryCategory = 'DEPOSIT' | 'FEE_SETTLEMENT' | 'CREDIT_TOPUP';

export const MIN_TREASURY_DEPOSIT_USD = 10;

export interface TreasuryNetworkSpec {
  network: TreasuryNetwork;
  labelFa: string;
  labelEn: string;
  assets: TreasuryAsset[];
  receiverSettingKey: string;
  legacySettingKey?: string;
  chainKind: 'EVM' | 'TRON' | 'SOLANA' | 'TON';
  feeNoteFa: string;
  explorerPrefix: string;
}

export const TREASURY_NETWORKS: TreasuryNetworkSpec[] = [
  {
    network: 'BEP20',
    labelFa: 'شبکه بایننس اسمارت چین (BSC · BEP20)',
    labelEn: 'BNB Smart Chain (BEP20)',
    assets: ['USDT', 'BNB', 'USDC'],
    receiverSettingKey: 'treasury_evm_receiver',
    legacySettingKey: 'trust_wallet_evm_receiver',
    chainKind: 'EVM',
    feeNoteFa: 'کارمزد کم (~$0.05) · تایید خودکار آن‌چین',
    explorerPrefix: 'https://bscscan.com/tx/',
  },
  {
    network: 'TRC20',
    labelFa: 'شبکه ترون (TRON · TRC20)',
    labelEn: 'TRON Network (TRC20)',
    assets: ['USDT', 'TRX'],
    receiverSettingKey: 'treasury_trc20_receiver',
    legacySettingKey: 'usdt_trc20_wallet',
    chainKind: 'TRON',
    feeNoteFa: 'استاندارد پرکاربرد تتر · کارمزد ~$1',
    explorerPrefix: 'https://tronscan.org/#/transaction/',
  },
  {
    network: 'ERC20',
    labelFa: 'شبکه اتریوم (Ethereum · ERC20)',
    labelEn: 'Ethereum Mainnet (ERC20)',
    assets: ['USDT', 'ETH', 'USDC'],
    receiverSettingKey: 'treasury_evm_receiver',
    legacySettingKey: 'trust_wallet_evm_receiver',
    chainKind: 'EVM',
    feeNoteFa: 'تایید آن‌چین · کارمزد شبکه اتریوم بالاتر است',
    explorerPrefix: 'https://etherscan.io/tx/',
  },
  {
    network: 'BASE',
    labelFa: 'شبکه Base (L2)',
    labelEn: 'Base Mainnet (L2)',
    assets: ['USDC', 'ETH', 'USDT'],
    receiverSettingKey: 'treasury_evm_receiver',
    legacySettingKey: 'trust_wallet_evm_receiver',
    chainKind: 'EVM',
    feeNoteFa: 'سریع و فوق‌العاده ارزان (<$0.02)',
    explorerPrefix: 'https://basescan.org/tx/',
  },
  {
    network: 'ARBITRUM',
    labelFa: 'شبکه Arbitrum One',
    labelEn: 'Arbitrum One',
    assets: ['USDT', 'USDC', 'ETH'],
    receiverSettingKey: 'treasury_evm_receiver',
    legacySettingKey: 'trust_wallet_evm_receiver',
    chainKind: 'EVM',
    feeNoteFa: 'سریع و کم‌هزینه (<$0.05)',
    explorerPrefix: 'https://arbiscan.io/tx/',
  },
  {
    network: 'SOLANA',
    labelFa: 'شبکه سولانا (Solana SPL)',
    labelEn: 'Solana Network (SPL)',
    assets: ['USDT', 'SOL', 'USDC'],
    receiverSettingKey: 'treasury_solana_receiver',
    chainKind: 'SOLANA',
    feeNoteFa: 'تایید فوق‌سریع (<$0.01)',
    explorerPrefix: 'https://solscan.io/tx/',
  },
  {
    network: 'TON',
    labelFa: 'شبکه تون‌کوین (TON)',
    labelEn: 'TON Network',
    assets: ['USDT', 'TON'],
    receiverSettingKey: 'treasury_ton_receiver',
    chainKind: 'TON',
    feeNoteFa: 'سازگار با کیف‌پول تلگرام و تراست‌ولت',
    explorerPrefix: 'https://tonscan.org/tx/',
  },
];

const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + (bytesToHex(bytes) || '0'));
}

function bigIntTo32Bytes(val: bigint): Uint8Array {
  const hex = val.toString(16).padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base58Encode(bytes: Uint8Array): string {
  let num = bytesToBigInt(bytes);
  const chars: string[] = [];
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    chars.push(BASE58_ALPHABET[rem]!);
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    chars.push('1');
  }
  return chars.reverse().join('');
}

function toEip55ChecksumAddress(lowerHex20: string): string {
  const clean = lowerHex20.toLowerCase().replace(/^0x/, '');
  const hashHex = bytesToHex(keccak_256(new TextEncoder().encode(clean)));
  let out = '0x';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    out += parseInt(hashHex[i]!, 16) >= 8 ? ch.toUpperCase() : ch;
  }
  return out;
}

function evm20ToTronAddress(addr20: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addr20, 1);
  const h1 = sha256(payload);
  const h2 = sha256(h1);
  const full = new Uint8Array(25);
  full.set(payload, 0);
  full.set(h2.slice(0, 4), 21);
  return base58Encode(full);
}

async function hmacSha512(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const keyBuf = new Uint8Array(keyBytes).buffer as ArrayBuffer;
  const dataBuf = new Uint8Array(data).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
  return new Uint8Array(sig);
}

async function deriveBip32Path(seed: Uint8Array, path: number[]): Promise<Uint8Array> {
  const masterI = await hmacSha512(new TextEncoder().encode('Bitcoin seed'), seed);
  let priv: Uint8Array = masterI.slice(0, 32);
  let chain: Uint8Array = masterI.slice(32, 64);

  for (const index of path) {
    const isHardened = index >= 0x80000000;
    const data = new Uint8Array(37);
    if (isHardened) {
      data[0] = 0;
      data.set(priv, 1);
    } else {
      const pubCompressed = secp256k1.getPublicKey(priv, true);
      data.set(pubCompressed, 0);
    }
    const view = new DataView(data.buffer);
    view.setUint32(33, index >>> 0, false);

    const I = await hmacSha512(chain, data);
    const il = bytesToBigInt(I.slice(0, 32));
    const kPar = bytesToBigInt(priv);
    const childKey = (il + kPar) % SECP256K1_N;
    if (il >= SECP256K1_N || childKey === 0n) {
      throw new Error('Invalid BIP32 child key derived');
    }
    priv = bigIntTo32Bytes(childKey);
    chain = I.slice(32, 64);
  }
  return priv;
}

export function normalizeAndValidateMnemonic(rawPhrase: string): {
  ok: true;
  normalized: string;
  words: string[];
} | { ok: false; error: string } {
  const words = rawPhrase
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length !== 12 && words.length !== 24) {
    return {
      ok: false,
      error: 'عبارت بازیابی باید دقیقاً ۱۲ کلمه (یا ۲۴ کلمه) انگلیسی استاندارد باشد.',
    };
  }
  if (!words.every((w) => /^[a-z]{2,12}$/.test(w))) {
    return {
      ok: false,
      error: 'تمامی کلمات عبارت بازیابی باید حروف انگلیسی کوچک و بدون عدد یا کاراکتر اضافه باشند.',
    };
  }
  return { ok: true, normalized: words.join(' '), words };
}

/**
 * Derives genuine BIP44 EVM (m/44'/60'/0'/0/0) and TRON (m/44'/195'/0'/0/0) addresses
 * from a 12-word or 24-word BIP39 mnemonic using WebCrypto PBKDF2-SHA512 + secp256k1.
 */
export async function deriveWalletsFromMnemonic(rawPhrase: string): Promise<{
  evmAddress: string;
  tronAddress: string;
  wordCount: number;
  hint: string;
}> {
  const valid = normalizeAndValidateMnemonic(rawPhrase);
  if (!valid.ok) throw new Error(valid.error);

  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(valid.normalized), 'PBKDF2', false, ['deriveBits']);
  const seedBuf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode('mnemonic'), iterations: 2048, hash: 'SHA-512' },
    baseKey,
    512
  );
  const seed = new Uint8Array(seedBuf);

  const HARDENED = 0x80000000;
  const evmPriv = await deriveBip32Path(seed, [44 + HARDENED, 60 + HARDENED, 0 + HARDENED, 0, 0]);
  const evmPubUncompressed = secp256k1.getPublicKey(evmPriv, false);
  const evmAddr20 = keccak_256(evmPubUncompressed.slice(1)).slice(-20);
  const evmAddress = toEip55ChecksumAddress(bytesToHex(evmAddr20));

  const tronPriv = await deriveBip32Path(seed, [44 + HARDENED, 195 + HARDENED, 0 + HARDENED, 0, 0]);
  const tronPubUncompressed = secp256k1.getPublicKey(tronPriv, false);
  const tronAddr20 = keccak_256(tronPubUncompressed.slice(1)).slice(-20);
  const tronAddress = evm20ToTronAddress(tronAddr20);

  return {
    evmAddress,
    tronAddress,
    wordCount: valid.words.length,
    hint: `${valid.words.length} کلمه رمزگذاری‌شده (${valid.words[0]} ... ${valid.words[valid.words.length - 1]})`,
  };
}

async function upsertSetting(db: D1Database, key: string, value: string) {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run();
}

export async function getTreasurySettingsMap(db: D1Database): Promise<Record<string, string>> {
  const rows = await db
    .prepare(
      `SELECT key, value FROM system_settings WHERE key IN (
        'treasury_evm_receiver', 'treasury_trc20_receiver', 'treasury_solana_receiver', 'treasury_ton_receiver',
        'trust_wallet_evm_receiver', 'usdt_trc20_wallet', 'treasury_bank_mode', 'treasury_bank_mnemonic_enc',
        'treasury_bank_mnemonic_hint', 'min_treasury_deposit_usd', 'profit_share_pct', 'free_profitable_live_trades'
      )`
    )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));
  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;
  return map;
}

export function resolveNetworkReceiverAddress(
  spec: TreasuryNetworkSpec,
  settings: Record<string, string>
): string {
  const primary = (settings[spec.receiverSettingKey] || '').trim();
  if (primary && !primary.includes('YourTRC20WalletAddress')) return primary;
  const legacy = spec.legacySettingKey ? (settings[spec.legacySettingKey] || '').trim() : '';
  if (legacy && !legacy.includes('YourTRC20WalletAddress')) return legacy;
  return '';
}

export async function connectOwnerWalletAsTreasury(
  db: D1Database,
  ownerUserId: string,
  override?: { evmAddress?: string; tronAddress?: string; solanaAddress?: string; tonAddress?: string }
) {
  const uRow = await db
    .prepare(
      `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton FROM users WHERE id = ?`
    )
    .bind(ownerUserId)
    .first<{
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
    }>()
    .catch(() => null);

  const evm = (override?.evmAddress ?? uRow?.trust_wallet_address ?? '').trim();
  const tron = (override?.tronAddress ?? uRow?.trust_wallet_tron ?? '').trim();
  const sol = (override?.solanaAddress ?? uRow?.trust_wallet_solana ?? '').trim();
  const ton = (override?.tonAddress ?? uRow?.trust_wallet_ton ?? '').trim();

  if (!evm && !tron && !sol && !ton) {
    throw new Error('هیچ آدرس Trust Wallet متصل‌شده‌ای برای مدیر یافت نشد. ابتدا کیف‌پول خود را از نوار بالا متصل کنید.');
  }

  await Promise.all([
    upsertSetting(db, 'treasury_bank_mode', 'WALLET_CONNECT'),
    evm ? upsertSetting(db, 'treasury_evm_receiver', evm) : Promise.resolve(),
    evm ? upsertSetting(db, 'trust_wallet_evm_receiver', evm) : Promise.resolve(),
    tron ? upsertSetting(db, 'treasury_trc20_receiver', tron) : Promise.resolve(),
    tron ? upsertSetting(db, 'usdt_trc20_wallet', tron) : Promise.resolve(),
    sol ? upsertSetting(db, 'treasury_solana_receiver', sol) : Promise.resolve(),
    ton ? upsertSetting(db, 'treasury_ton_receiver', ton) : Promise.resolve(),
  ]);

  return {
    bankMode: 'WALLET_CONNECT',
    receivers: { evm, tron, solana: sol, ton },
  };
}

export async function importOwnerMnemonicAsTreasury(
  db: D1Database,
  masterEncryptionKey: string | undefined,
  mnemonicPhrase: string,
  extra?: { solanaAddress?: string; tonAddress?: string }
) {
  const derived = await deriveWalletsFromMnemonic(mnemonicPhrase);
  const valid = normalizeAndValidateMnemonic(mnemonicPhrase);
  if (!valid.ok) throw new Error(valid.error);

  const encrypted = await encryptVaultJson(
    {
      mnemonic: valid.normalized,
      evmAddress: derived.evmAddress,
      tronAddress: derived.tronAddress,
      importedAt: new Date().toISOString(),
    },
    masterEncryptionKey
  );

  await Promise.all([
    upsertSetting(db, 'treasury_bank_mode', 'MNEMONIC_VAULT'),
    upsertSetting(db, 'treasury_bank_mnemonic_enc', encrypted),
    upsertSetting(db, 'treasury_bank_mnemonic_hint', derived.hint),
    upsertSetting(db, 'treasury_evm_receiver', derived.evmAddress),
    upsertSetting(db, 'trust_wallet_evm_receiver', derived.evmAddress),
    upsertSetting(db, 'treasury_trc20_receiver', derived.tronAddress),
    upsertSetting(db, 'usdt_trc20_wallet', derived.tronAddress),
    extra?.solanaAddress?.trim()
      ? upsertSetting(db, 'treasury_solana_receiver', extra.solanaAddress.trim())
      : Promise.resolve(),
    extra?.tonAddress?.trim()
      ? upsertSetting(db, 'treasury_ton_receiver', extra.tonAddress.trim())
      : Promise.resolve(),
  ]);

  return {
    bankMode: 'MNEMONIC_VAULT',
    hint: derived.hint,
    receivers: {
      evm: derived.evmAddress,
      tron: derived.tronAddress,
      solana: extra?.solanaAddress?.trim() || '',
      ton: extra?.tonAddress?.trim() || '',
    },
  };
}

export async function saveManualTreasuryReceivers(
  db: D1Database,
  input: { evm?: string; tron?: string; solana?: string; ton?: string; minDepositUsd?: number }
) {
  const tasks: Promise<void>[] = [];
  if (input.evm !== undefined) {
    tasks.push(upsertSetting(db, 'treasury_evm_receiver', input.evm.trim()));
    tasks.push(upsertSetting(db, 'trust_wallet_evm_receiver', input.evm.trim()));
  }
  if (input.tron !== undefined) {
    tasks.push(upsertSetting(db, 'treasury_trc20_receiver', input.tron.trim()));
    tasks.push(upsertSetting(db, 'usdt_trc20_wallet', input.tron.trim()));
  }
  if (input.solana !== undefined) {
    tasks.push(upsertSetting(db, 'treasury_solana_receiver', input.solana.trim()));
  }
  if (input.ton !== undefined) {
    tasks.push(upsertSetting(db, 'treasury_ton_receiver', input.ton.trim()));
  }
  if (input.minDepositUsd !== undefined && Number.isFinite(input.minDepositUsd)) {
    tasks.push(upsertSetting(db, 'min_treasury_deposit_usd', String(Math.max(10, Math.round(input.minDepositUsd)))));
  }
  await Promise.all(tasks);
}

export async function getUserTreasuryDepositOptions(db: D1Database, userId: string) {
  const [settings, standing, myDeposits] = await Promise.all([
    getTreasurySettingsMap(db),
    evaluateUserFeeStanding(db, userId),
    db
      .prepare(
        `SELECT id, category, asset, network, receiver_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet, admin_note, created_at, confirmed_at
         FROM treasury_deposits
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 30`
      )
      .bind(userId)
      .all()
      .catch(() => ({ results: [] })),
  ]);

  const minDepositUsd = Math.max(10, Number(settings.min_treasury_deposit_usd || 10) || 10);

  const networks = TREASURY_NETWORKS.map((spec) => {
    const address = resolveNetworkReceiverAddress(spec, settings);
    return {
      network: spec.network,
      labelFa: spec.labelFa,
      labelEn: spec.labelEn,
      assets: spec.assets,
      chainKind: spec.chainKind,
      feeNoteFa: spec.feeNoteFa,
      explorerPrefix: spec.explorerPrefix,
      configured: Boolean(address),
      address: address || null,
    };
  });

  return {
    minDepositUsd,
    networks,
    standing,
    deposits: myDeposits.results,
  };
}

export async function applyConfirmedTreasuryCredit(
  db: D1Database,
  depositId: string,
  adminNote?: string
): Promise<{ ok: boolean; settledDebtUsd: number; addedCreditUsd: number }> {
  const dep = await db
    .prepare(`SELECT * FROM treasury_deposits WHERE id = ? LIMIT 1`)
    .bind(depositId)
    .first<{
      id: string;
      user_id: string;
      category: string;
      asset: string;
      network: string;
      amount_usd: number;
      tx_hash: string;
      status: string;
      credited_to_wallet: number;
    }>();

  if (!dep) throw new Error('رکورد واریز یافت نشد.');
  if (dep.status === 'CONFIRMED' && dep.credited_to_wallet === 1) {
    return { ok: true, settledDebtUsd: 0, addedCreditUsd: 0 };
  }

  const [feeAgg, uRow] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN status IN ('ACCRUED', 'PENDING_VERIFY') THEN fee_usd ELSE 0 END), 0) AS due_usd
         FROM server_fee_ledger WHERE user_id = ?`
      )
      .bind(dep.user_id)
      .first<{ due_usd: number }>(),
    db
      .prepare(`SELECT COALESCE(fee_penalty_usd, 0) AS penalty_usd FROM users WHERE id = ?`)
      .bind(dep.user_id)
      .first<{ penalty_usd: number }>(),
  ]);

  const accruedDue = Number(feeAgg?.due_usd || 0);
  const penaltyDue = Number(uRow?.penalty_usd || 0);
  const totalDebt = accruedDue + penaltyDue;
  const paidAmount = Number(dep.amount_usd || 0);

  let settledDebtUsd = 0;
  let addedCreditUsd = 0;

  if (totalDebt > 0 && paidAmount >= totalDebt - 0.01) {
    settledDebtUsd = Number(totalDebt.toFixed(4));
    addedCreditUsd = Number(Math.max(0, paidAmount - totalDebt).toFixed(4));
    await db.batch([
      db
        .prepare(
          `UPDATE server_fee_ledger
           SET status = 'SETTLED_ONCHAIN', tx_hash = COALESCE(tx_hash, ?)
           WHERE user_id = ? AND status IN ('ACCRUED', 'PENDING_VERIFY')`
        )
        .bind(dep.tx_hash, dep.user_id),
      db
        .prepare(
          `UPDATE users
           SET fee_lock_status = 'ACTIVE',
               fee_penalty_usd = 0,
               fee_grace_deadline = NULL,
               fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4),
               wallet_balance_usdt = ROUND(COALESCE(wallet_balance_usdt, 0) + ?, 4)
           WHERE id = ?`
        )
        .bind(addedCreditUsd, addedCreditUsd, dep.user_id),
    ]);
  } else if (totalDebt > 0) {
    // Partial settlement toward open fee debt
    settledDebtUsd = Number(Math.min(paidAmount, totalDebt).toFixed(4));
    const remPenalty = Math.max(0, penaltyDue - paidAmount);
    await db
      .prepare(
        `UPDATE users SET fee_penalty_usd = ROUND(?, 4) WHERE id = ?`
      )
      .bind(remPenalty, dep.user_id)
      .run();
    // Settle oldest ACCRUED ledger items covered by remaining paid amount
    const remForAccrued = Math.max(0, paidAmount - penaltyDue);
    if (remForAccrued > 0) {
      const rows = await db
        .prepare(
          `SELECT id, fee_usd FROM server_fee_ledger WHERE user_id = ? AND status IN ('ACCRUED', 'PENDING_VERIFY') ORDER BY created_at ASC`
        )
        .bind(dep.user_id)
        .all<{ id: string; fee_usd: number }>();
      let pool = remForAccrued;
      for (const r of rows.results) {
        if (pool + 0.001 >= r.fee_usd) {
          pool -= r.fee_usd;
          await db
            .prepare(`UPDATE server_fee_ledger SET status = 'SETTLED_ONCHAIN', tx_hash = COALESCE(tx_hash, ?) WHERE id = ?`)
            .bind(dep.tx_hash, r.id)
            .run();
        }
      }
      if (pool > 0.0001) {
        addedCreditUsd = Number(pool.toFixed(4));
        await db
          .prepare(`UPDATE users SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4) WHERE id = ?`)
          .bind(addedCreditUsd, dep.user_id)
          .run();
      }
    }
  } else {
    addedCreditUsd = Number(paidAmount.toFixed(4));
    await db
      .prepare(
        `UPDATE users
         SET fee_lock_status = 'ACTIVE',
             fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4),
             wallet_balance_usdt = ROUND(COALESCE(wallet_balance_usdt, 0) + ?, 4)
         WHERE id = ?`
      )
      .bind(addedCreditUsd, addedCreditUsd, dep.user_id)
      .run();
  }

  await db
    .prepare(
      `UPDATE treasury_deposits
       SET status = 'CONFIRMED', credited_to_wallet = 1, admin_note = COALESCE(?, admin_note), confirmed_at = datetime('now')
       WHERE id = ?`
    )
    .bind(adminNote ?? null, depositId)
    .run();

  await evaluateUserFeeStanding(db, dep.user_id).catch(() => {});
  return { ok: true, settledDebtUsd, addedCreditUsd };
}

export async function submitTreasuryDeposit(
  db: D1Database,
  userId: string,
  params: {
    asset: string;
    network: string;
    amountUsd: number;
    txHash: string;
    category?: TreasuryCategory;
  }
) {
  const networkUpper = String(params.network || '').toUpperCase().trim() as TreasuryNetwork;
  const assetUpper = String(params.asset || '').toUpperCase().trim() as TreasuryAsset;
  const txHash = String(params.txHash || '').trim();
  const category: TreasuryCategory =
    params.category === 'FEE_SETTLEMENT' || params.category === 'CREDIT_TOPUP' ? params.category : 'DEPOSIT';

  const spec = TREASURY_NETWORKS.find((n) => n.network === networkUpper);
  if (!spec) {
    throw new Error('لطفاً ابتدا شبکه صحیح انتقال (BEP20 / TRC20 / ERC20 / SOLANA / TON ...) را انتخاب کنید.');
  }
  if (!spec.assets.includes(assetUpper)) {
    throw new Error(`ارز ${assetUpper} روی شبکه ${spec.network} پشتیبانی نمی‌شود.`);
  }
  if (!isValidBlockchainTxHash(txHash)) {
    throw new Error('فرمت کد تراکنش (TX Hash) معتبر نیست.');
  }

  const settings = await getTreasurySettingsMap(db);
  const receiverAddress = resolveNetworkReceiverAddress(spec, settings);
  if (!receiverAddress) {
    throw new Error(`آدرس خزانه برای شبکه ${spec.network} هنوز توسط مدیریت ثبت نشده است.`);
  }

  const minUsd = category === 'FEE_SETTLEMENT' ? 0.5 : Math.max(10, Number(settings.min_treasury_deposit_usd || 10) || 10);
  const amountUsd = Number(params.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < minUsd) {
    throw new Error(
      category === 'FEE_SETTLEMENT'
        ? 'مبلغ تسویه کارمزد معتبر نیست.'
        : `حداقل مبلغ واریز به خزانه پلتفرم ${minUsd} دلار است.`
    );
  }

  // Global Uniqueness Check: txHash uniquely identifies ONE depositor across ALL users & tables!
  const [dupTreasury, dupFeeLedger] = await Promise.all([
    db.prepare(`SELECT id, user_id FROM treasury_deposits WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`).bind(txHash).first<{ id: string; user_id: string }>().catch(() => null),
    db.prepare(`SELECT id, user_id FROM server_fee_ledger WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`).bind(txHash).first<{ id: string; user_id: string }>().catch(() => null),
  ]);
  if (dupTreasury || dupFeeLedger) {
    throw new Error('این کد تراکنش (TX Hash) قبلاً در سیستم ثبت شده و متعلق به یک تراکنش منحصربه‌فرد است.');
  }

  const receiptState = spec.chainKind === 'EVM' ? await tryVerifyEvmReceiptOnchain(txHash) : 'UNAVAILABLE';
  if (receiptState === 'FAILED') {
    throw new Error('تراکنش روی شبکه بلاکچین ناموفق (Reverted / Failed) گزارش شد.');
  }

  const depositId = randomId('tdep');
  const verifiedOnchain = receiptState === 'CONFIRMED' ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO treasury_deposits (id, user_id, category, asset, network, receiver_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .bind(
      depositId,
      userId,
      category,
      assetUpper,
      spec.network,
      receiverAddress,
      Number(amountUsd.toFixed(4)),
      txHash,
      verifiedOnchain ? 'CONFIRMED' : 'PENDING_VERIFY',
      verifiedOnchain
    )
    .run();

  if (verifiedOnchain) {
    const applied = await applyConfirmedTreasuryCredit(db, depositId, 'تایید خودکار آن‌چین روی بلاکچین');
    return {
      ok: true,
      id: depositId,
      status: 'CONFIRMED' as const,
      verifiedOnchain: true,
      receiverAddress,
      settledDebtUsd: applied.settledDebtUsd,
      addedCreditUsd: applied.addedCreditUsd,
    };
  }

  return {
    ok: true,
    id: depositId,
    status: 'PENDING_VERIFY' as const,
    verifiedOnchain: false,
    receiverAddress,
    settledDebtUsd: 0,
    addedCreditUsd: 0,
  };
}

export async function getAdminTreasurySummary(db: D1Database, masterEncryptionKey?: string) {
  const [settings, depositRows, feeAgg, depAgg] = await Promise.all([
    getTreasurySettingsMap(db),
    db
      .prepare(
        `SELECT td.*, u.username, u.email, u.telegram_id
         FROM treasury_deposits td
         JOIN users u ON u.id = td.user_id
         ORDER BY td.created_at DESC
         LIMIT 100`
      )
      .all()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('SETTLED_ONCHAIN', 'SETTLED_PREPAID') AND source IN ('PERP_LIVE', 'COPY_V2_LIVE', 'DEX_LIVE', 'SNIPER_LIVE') THEN fee_usd ELSE 0 END), 0) AS fees_collected_usd,
           COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) AS fees_accrued_usd,
           COALESCE(SUM(CASE WHEN status = 'FREE_TRIAL' THEN 1 ELSE 0 END), 0) AS free_trial_trades_count,
           COALESCE(SUM(CASE WHEN status = 'REFERRAL_FEE_CREDIT' OR source IN ('REFERRAL_FEE_CREDIT', 'REFERRAL_WELCOME_CREDIT') THEN fee_usd ELSE 0 END), 0) AS referral_credits_usd
         FROM server_fee_ledger`
      )
      .first<{
        fees_collected_usd: number;
        fees_accrued_usd: number;
        free_trial_trades_count: number;
        referral_credits_usd: number;
      }>()
      .catch(() => null),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'CONFIRMED' AND category = 'DEPOSIT' THEN amount_usd ELSE 0 END), 0) AS confirmed_deposits_usd,
           COALESCE(SUM(CASE WHEN status = 'CONFIRMED' AND category = 'CREDIT_TOPUP' THEN amount_usd ELSE 0 END), 0) AS confirmed_topups_usd,
           COALESCE(SUM(CASE WHEN status = 'CONFIRMED' AND category = 'FEE_SETTLEMENT' THEN amount_usd ELSE 0 END), 0) AS confirmed_fee_settlements_usd,
           COALESCE(SUM(CASE WHEN status = 'PENDING_VERIFY' THEN amount_usd ELSE 0 END), 0) AS pending_deposits_usd,
           COUNT(CASE WHEN status = 'PENDING_VERIFY' THEN 1 END) AS pending_count
         FROM treasury_deposits`
      )
      .first<{
        confirmed_deposits_usd: number;
        confirmed_topups_usd: number;
        confirmed_fee_settlements_usd: number;
        pending_deposits_usd: number;
        pending_count: number;
      }>()
      .catch(() => null),
  ]);

  let mnemonicConfigured = false;
  if (settings.treasury_bank_mnemonic_enc) {
    try {
      const dec = await decryptVaultJson<{ mnemonic?: string }>(settings.treasury_bank_mnemonic_enc, masterEncryptionKey);
      mnemonicConfigured = Boolean(dec?.mnemonic);
    } catch {
      mnemonicConfigured = true;
    }
  }

  return {
    bankMode: settings.treasury_bank_mode || 'WALLET_CONNECT',
    mnemonicConfigured,
    mnemonicHint: settings.treasury_bank_mnemonic_hint || '',
    minDepositUsd: Math.max(10, Number(settings.min_treasury_deposit_usd || 10) || 10),
    receivers: {
      evm: settings.treasury_evm_receiver || settings.trust_wallet_evm_receiver || '',
      tron: settings.treasury_trc20_receiver || settings.usdt_trc20_wallet || '',
      solana: settings.treasury_solana_receiver || '',
      ton: settings.treasury_ton_receiver || '',
    },
    totals: {
      confirmedDepositsUsd: Number(depAgg?.confirmed_deposits_usd || 0),
      confirmedTopupsUsd: Number(depAgg?.confirmed_topups_usd || 0),
      confirmedFeeSettlementsUsd: Number(depAgg?.confirmed_fee_settlements_usd || 0),
      pendingDepositsUsd: Number(depAgg?.pending_deposits_usd || 0),
      pendingCount: Number(depAgg?.pending_count || 0),
      profitFeesCollectedUsd: Number(feeAgg?.fees_collected_usd || 0),
      profitFeesAccruedUsd: Number(feeAgg?.fees_accrued_usd || 0),
      freeTrialTradesCount: Number(feeAgg?.free_trial_trades_count || 0),
      referralCreditsUsd: Number(feeAgg?.referral_credits_usd || 0),
    },
    deposits: depositRows.results,
  };
}
