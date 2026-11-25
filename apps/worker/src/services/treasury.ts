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

/**
 * Core debt-first settlement rule:
 * Always settles any outstanding server fee debt + penalty first,
 * and credits every cent of overpayment to the user's prepaid fee credit balance.
 */
export async function settleDebtFirstThenCredit(
  db: D1Database,
  userId: string,
  paidAmountUsd: number,
  txHash: string,
  opts?: { alsoCreditWalletBalance?: boolean }
): Promise<{ settledDebtUsd: number; addedCreditUsd: number; settledCount: number }> {
  const paidAmount = Math.max(0, Number(paidAmountUsd || 0));
  const [feeAgg, uRow] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN status IN ('ACCRUED', 'PENDING_VERIFY') AND COALESCE(source, '') != 'PREPAY_CREDIT' THEN fee_usd ELSE 0 END), 0) AS due_usd
         FROM server_fee_ledger WHERE user_id = ?`
      )
      .bind(userId)
      .first<{ due_usd: number }>(),
    db
      .prepare(`SELECT COALESCE(fee_penalty_usd, 0) AS penalty_usd FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ penalty_usd: number }>(),
  ]);

  const accruedDue = Number(feeAgg?.due_usd || 0);
  const penaltyDue = Number(uRow?.penalty_usd || 0);
  const totalDebt = accruedDue + penaltyDue;
  const walletIncSql = opts?.alsoCreditWalletBalance
    ? `, wallet_balance_usdt = ROUND(COALESCE(wallet_balance_usdt, 0) + ?, 4)`
    : '';

  let settledDebtUsd = 0;
  let addedCreditUsd = 0;
  let settledCount = 0;

  if (totalDebt > 0 && paidAmount >= totalDebt - 0.01) {
    settledDebtUsd = Number(totalDebt.toFixed(4));
    addedCreditUsd = Number(Math.max(0, paidAmount - totalDebt).toFixed(4));
    const updRes = await db
      .prepare(
        `UPDATE server_fee_ledger
         SET status = 'SETTLED_ONCHAIN', tx_hash = COALESCE(tx_hash, ?)
         WHERE user_id = ? AND status IN ('ACCRUED', 'PENDING_VERIFY') AND COALESCE(source, '') != 'PREPAY_CREDIT'`
      )
      .bind(txHash, userId)
      .run();
    settledCount = updRes.meta?.changes ?? 0;

    const uBinds: Array<string | number> = opts?.alsoCreditWalletBalance
      ? [addedCreditUsd, addedCreditUsd, userId]
      : [addedCreditUsd, userId];
    await db
      .prepare(
        `UPDATE users
         SET fee_lock_status = 'ACTIVE',
             fee_penalty_usd = 0,
             fee_grace_deadline = NULL,
             fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4)${walletIncSql}
         WHERE id = ?`
      )
      .bind(...uBinds)
      .run();
  } else if (totalDebt > 0 && paidAmount > 0) {
    // Partial settlement toward open fee debt: penalty first, then oldest accrued ledger entries
    settledDebtUsd = Number(Math.min(paidAmount, totalDebt).toFixed(4));
    const remPenalty = Math.max(0, penaltyDue - paidAmount);
    await db
      .prepare(`UPDATE users SET fee_penalty_usd = ROUND(?, 4) WHERE id = ?`)
      .bind(remPenalty, userId)
      .run();

    let pool = Math.max(0, paidAmount - penaltyDue);
    if (pool > 0) {
      const rows = await db
        .prepare(
          `SELECT id, fee_usd FROM server_fee_ledger
           WHERE user_id = ? AND status IN ('ACCRUED', 'PENDING_VERIFY') AND COALESCE(source, '') != 'PREPAY_CREDIT'
           ORDER BY created_at ASC`
        )
        .bind(userId)
        .all<{ id: string; fee_usd: number }>();
      for (const r of rows.results) {
        if (pool + 0.001 >= r.fee_usd) {
          pool = Math.max(0, pool - r.fee_usd);
          await db
            .prepare(`UPDATE server_fee_ledger SET status = 'SETTLED_ONCHAIN', tx_hash = COALESCE(tx_hash, ?) WHERE id = ?`)
            .bind(txHash, r.id)
            .run();
          settledCount++;
        } else if (pool > 0.01) {
          // Reduce remaining ledger row proportionally so exact paid amount reduces debt
          const remRowUsd = Number(Math.max(0, r.fee_usd - pool).toFixed(4));
          await db
            .prepare(`UPDATE server_fee_ledger SET fee_usd = ?, note = COALESCE(note, '') || ' [تسویه جزئی با TX ' || ? || ']' WHERE id = ?`)
            .bind(remRowUsd, txHash.slice(0, 12), r.id)
            .run();
          pool = 0;
          break;
        }
      }
      if (pool > 0.0001) {
        addedCreditUsd = Number(pool.toFixed(4));
        const uBinds: Array<string | number> = opts?.alsoCreditWalletBalance
          ? [addedCreditUsd, addedCreditUsd, userId]
          : [addedCreditUsd, userId];
        await db
          .prepare(
            `UPDATE users
             SET fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4)${walletIncSql}
             WHERE id = ?`
          )
          .bind(...uBinds)
          .run();
      }
    }
  } else {
    addedCreditUsd = Number(paidAmount.toFixed(4));
    const uBinds: Array<string | number> = opts?.alsoCreditWalletBalance
      ? [addedCreditUsd, addedCreditUsd, userId]
      : [addedCreditUsd, userId];
    await db
      .prepare(
        `UPDATE users
         SET fee_lock_status = 'ACTIVE',
             fee_prepaid_credit_usd = ROUND(COALESCE(fee_prepaid_credit_usd, 0) + ?, 4)${walletIncSql}
         WHERE id = ?`
      )
      .bind(...uBinds)
      .run();
  }

  return { settledDebtUsd, addedCreditUsd, settledCount };
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

  const paidAmount = Number(dep.amount_usd || 0);
  const { settledDebtUsd, addedCreditUsd } = await settleDebtFirstThenCredit(db, dep.user_id, paidAmount, dep.tx_hash, {
    alsoCreditWalletBalance: true,
  });

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

export interface BankingInvoiceItem {
  invoiceNo: string;
  id: string;
  kind: 'TREASURY_DEPOSIT' | 'CREDIT_TOPUP' | 'FEE_SETTLEMENT';
  titleFa: string;
  titleEn: string;
  network: string;
  asset: string;
  amountUsd: number;
  senderAddress: string | null;
  receiverAddress: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  status: 'CONFIRMED' | 'PENDING_VERIFY' | 'REJECTED';
  verifiedOnchain: boolean;
  settledDebtUsd: number;
  addedCreditUsd: number;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export function buildInvoiceNumber(id: string, createdAt?: string | null): string {
  const datePart = (createdAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  const tail = (id || '000000').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase().padStart(6, '0');
  return `DLR-${datePart}-${tail}`;
}

export function buildExplorerTxUrl(network: string, txHash: string | null): string | null {
  if (!txHash) return null;
  const spec = TREASURY_NETWORKS.find((n) => n.network === network.toUpperCase());
  if (spec) return `${spec.explorerPrefix}${encodeURIComponent(txHash)}`;
  if (/^0x[0-9a-fA-F]{64}$/.test(txHash)) return `https://bscscan.com/tx/${encodeURIComponent(txHash)}`;
  if (/^[0-9a-fA-F]{64}$/.test(txHash)) return `https://tronscan.org/#/transaction/${encodeURIComponent(txHash)}`;
  return null;
}

const EVM_STABLE_CONTRACTS: Record<string, { rpc: string; usdt?: { address: string; decimals: number }; usdc?: { address: string; decimals: number } }> = {
  BEP20: {
    rpc: 'https://bsc-dataseed.binance.org',
    usdt: { address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
    usdc: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
  },
  ERC20: {
    rpc: 'https://ethereum-rpc.publicnode.com',
    usdt: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    usdc: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  },
  BASE: {
    rpc: 'https://mainnet.base.org',
    usdc: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    usdt: { address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', decimals: 6 },
  },
  ARBITRUM: {
    rpc: 'https://arb1.arbitrum.io/rpc',
    usdt: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
    usdc: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
  },
};
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function getUserBankingInvoices(db: D1Database, userId: string): Promise<BankingInvoiceItem[]> {
  const [depRows, feeRows, settings] = await Promise.all([
    db
      .prepare(
        `SELECT id, category, asset, network, receiver_address, sender_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet, admin_note, created_at, confirmed_at
         FROM treasury_deposits
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all<{
        id: string;
        category: string;
        asset: string;
        network: string;
        receiver_address: string;
        sender_address?: string | null;
        amount_usd: number;
        tx_hash: string;
        status: string;
        verified_onchain: number;
        credited_to_wallet: number;
        admin_note: string | null;
        created_at: string;
        confirmed_at: string | null;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT id, source, symbol, fee_usd, status, tx_hash, note, created_at
         FROM server_fee_ledger
         WHERE user_id = ? AND tx_hash IS NOT NULL AND tx_hash != ''
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(userId)
      .all<{
        id: string;
        source: string;
        symbol: string;
        fee_usd: number;
        status: string;
        tx_hash: string;
        note: string | null;
        created_at: string;
      }>()
      .catch(() => ({ results: [] })),
    getTreasurySettingsMap(db),
  ]);

  const seenHashes = new Set<string>();
  const invoices: BankingInvoiceItem[] = [];

  for (const d of depRows.results) {
    if (d.tx_hash) seenHashes.add(d.tx_hash.toLowerCase());
    const kind: BankingInvoiceItem['kind'] =
      d.category === 'FEE_SETTLEMENT'
        ? 'FEE_SETTLEMENT'
        : d.category === 'CREDIT_TOPUP'
          ? 'CREDIT_TOPUP'
          : 'TREASURY_DEPOSIT';
    const titleFa =
      kind === 'FEE_SETTLEMENT'
        ? 'فاکتور تسویه کارمزد ۳٪ دلارینو'
        : kind === 'CREDIT_TOPUP'
          ? 'فاکتور شارژ اعتبار پیش‌پرداخت کارمزد'
          : 'فاکتور واریز به خزانه بانکی دلارینو';
    const titleEn =
      kind === 'FEE_SETTLEMENT'
        ? '3% Profit Fee Settlement Invoice'
        : kind === 'CREDIT_TOPUP'
          ? 'Prepaid Fee Credit Invoice'
          : 'Central Treasury Deposit Invoice';

    const status: BankingInvoiceItem['status'] =
      d.status === 'CONFIRMED' ? 'CONFIRMED' : d.status === 'REJECTED' ? 'REJECTED' : 'PENDING_VERIFY';

    invoices.push({
      invoiceNo: buildInvoiceNumber(d.id, d.created_at),
      id: d.id,
      kind,
      titleFa,
      titleEn,
      network: d.network,
      asset: d.asset,
      amountUsd: Number(d.amount_usd || 0),
      senderAddress: d.sender_address || null,
      receiverAddress: d.receiver_address || null,
      txHash: d.tx_hash || null,
      explorerUrl: buildExplorerTxUrl(d.network, d.tx_hash || null),
      status,
      verifiedOnchain: Boolean(d.verified_onchain) || status === 'CONFIRMED',
      settledDebtUsd: kind === 'FEE_SETTLEMENT' ? Number(d.amount_usd || 0) : 0,
      addedCreditUsd: kind !== 'FEE_SETTLEMENT' && status === 'CONFIRMED' ? Number(d.amount_usd || 0) : 0,
      note: d.admin_note || null,
      createdAt: d.created_at,
      confirmedAt: d.confirmed_at || null,
    });
  }

  // Group direct fee settlement batches by tx_hash from server_fee_ledger if not already covered by treasury_deposits
  const feeGroups = new Map<
    string,
    { id: string; totalUsd: number; source: string; status: string; note: string | null; createdAt: string }
  >();
  for (const f of feeRows.results) {
    const hashKey = f.tx_hash.toLowerCase();
    if (seenHashes.has(hashKey)) continue;
    const prev = feeGroups.get(hashKey);
    if (prev) {
      prev.totalUsd += Number(f.fee_usd || 0);
    } else {
      feeGroups.set(hashKey, {
        id: f.id,
        totalUsd: Number(f.fee_usd || 0),
        source: f.source,
        status: f.status,
        note: f.note,
        createdAt: f.created_at,
      });
    }
  }

  for (const [hashLower, grp] of feeGroups.entries()) {
    const originalHash = feeRows.results.find((r) => r.tx_hash.toLowerCase() === hashLower)?.tx_hash || hashLower;
    const isPrepay = grp.source === 'PREPAY_CREDIT';
    const isEvm = /^0x[a-fA-F0-9]{64}$/.test(originalHash);
    const network = isEvm ? 'BEP20' : /^[a-fA-F0-9]{64}$/.test(originalHash) ? 'TRC20' : 'SOLANA';
    const receiverAddress = isEvm
      ? settings.treasury_evm_receiver || settings.trust_wallet_evm_receiver || null
      : settings.treasury_trc20_receiver || settings.usdt_trc20_wallet || null;
    const status: BankingInvoiceItem['status'] =
      grp.status === 'SETTLED_ONCHAIN' || grp.status === 'SETTLED_PREPAID'
        ? 'CONFIRMED'
        : grp.status === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING_VERIFY';

    invoices.push({
      invoiceNo: buildInvoiceNumber(grp.id, grp.createdAt),
      id: grp.id,
      kind: isPrepay ? 'CREDIT_TOPUP' : 'FEE_SETTLEMENT',
      titleFa: isPrepay ? 'فاکتور شارژ اعتبار پیش‌پرداخت کارمزد' : 'فاکتور تسویه کارمزد ۳٪ دلارینو',
      titleEn: isPrepay ? 'Prepaid Fee Credit Invoice' : '3% Profit Fee Settlement Invoice',
      network,
      asset: 'USDT',
      amountUsd: Number(grp.totalUsd.toFixed(4)),
      senderAddress: null,
      receiverAddress,
      txHash: originalHash,
      explorerUrl: buildExplorerTxUrl(network, originalHash),
      status,
      verifiedOnchain: status === 'CONFIRMED',
      settledDebtUsd: !isPrepay ? Number(grp.totalUsd.toFixed(4)) : 0,
      addedCreditUsd: isPrepay && status === 'CONFIRMED' ? Number(grp.totalUsd.toFixed(4)) : 0,
      note: grp.note || null,
      createdAt: grp.createdAt,
      confirmedAt: status === 'CONFIRMED' ? grp.createdAt : null,
    });
  }

  invoices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return invoices;
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
    senderAddress?: string;
  }
) {
  const networkUpper = String(params.network || '').toUpperCase().trim() as TreasuryNetwork;
  const assetUpper = String(params.asset || '').toUpperCase().trim() as TreasuryAsset;
  const txHash = String(params.txHash || '').trim();
  const senderAddress = params.senderAddress ? String(params.senderAddress).trim().slice(0, 120) : null;
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

  const minUsd = category === 'FEE_SETTLEMENT' ? 0.05 : Math.max(10, Number(settings.min_treasury_deposit_usd || 10) || 10);
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
  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db
    .prepare(
      `INSERT INTO treasury_deposits (id, user_id, category, asset, network, receiver_address, sender_address, amount_usd, tx_hash, status, verified_onchain, credited_to_wallet)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .bind(
      depositId,
      userId,
      category,
      assetUpper,
      spec.network,
      receiverAddress,
      senderAddress,
      Number(amountUsd.toFixed(4)),
      txHash,
      verifiedOnchain ? 'CONFIRMED' : 'PENDING_VERIFY',
      verifiedOnchain
    )
    .run();

  const buildInvoiceObj = (
    status: 'CONFIRMED' | 'PENDING_VERIFY',
    settledDebtUsd: number,
    addedCreditUsd: number
  ): BankingInvoiceItem => ({
    invoiceNo: buildInvoiceNumber(depositId, nowIso),
    id: depositId,
    kind: category === 'FEE_SETTLEMENT' ? 'FEE_SETTLEMENT' : category === 'CREDIT_TOPUP' ? 'CREDIT_TOPUP' : 'TREASURY_DEPOSIT',
    titleFa:
      category === 'FEE_SETTLEMENT'
        ? 'فاکتور تسویه کارمزد ۳٪ دلارینو'
        : category === 'CREDIT_TOPUP'
          ? 'فاکتور شارژ اعتبار پیش‌پرداخت کارمزد'
          : 'فاکتور واریز به خزانه بانکی دلارینو',
    titleEn:
      category === 'FEE_SETTLEMENT'
        ? '3% Profit Fee Settlement Invoice'
        : category === 'CREDIT_TOPUP'
          ? 'Prepaid Fee Credit Invoice'
          : 'Central Treasury Deposit Invoice',
    network: spec.network,
    asset: assetUpper,
    amountUsd: Number(amountUsd.toFixed(4)),
    senderAddress,
    receiverAddress,
    txHash,
    explorerUrl: buildExplorerTxUrl(spec.network, txHash),
    status,
    verifiedOnchain: status === 'CONFIRMED',
    settledDebtUsd,
    addedCreditUsd,
    note: status === 'CONFIRMED' ? 'تایید خودکار آن‌چین روی بلاکچین' : 'در صف بررسی خودکار / ادمین',
    createdAt: nowIso,
    confirmedAt: status === 'CONFIRMED' ? nowIso : null,
  });

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
      invoice: buildInvoiceObj('CONFIRMED', applied.settledDebtUsd, applied.addedCreditUsd),
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
    invoice: buildInvoiceObj('PENDING_VERIFY', 0, 0),
  };
}

export async function autoDetectUserTransferOnchain(
  db: D1Database,
  userId: string,
  params: {
    network: string;
    asset?: string;
    minAmountUsd?: number;
    category?: TreasuryCategory;
  }
) {
  const networkUpper = String(params.network || 'BEP20').toUpperCase().trim() as TreasuryNetwork;
  const spec = TREASURY_NETWORKS.find((n) => n.network === networkUpper);
  if (!spec) {
    return { ok: false as const, found: false as const, error: 'شبکه انتخابی معتبر نیست.' };
  }

  const [settings, userRow] = await Promise.all([
    getTreasurySettingsMap(db),
    db
      .prepare(`SELECT trust_wallet_address, trust_wallet_tron FROM users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first<{ trust_wallet_address: string | null; trust_wallet_tron: string | null }>()
      .catch(() => null),
  ]);

  const receiverAddress = resolveNetworkReceiverAddress(spec, settings);
  if (!receiverAddress) {
    return { ok: false as const, found: false as const, error: `آدرس خزانه برای شبکه ${spec.network} هنوز ثبت نشده است.` };
  }

  const minExpected = Math.max(0.4, Number(params.minAmountUsd || (params.category === 'FEE_SETTLEMENT' ? 0.5 : 10)));
  let detectedHash = '';
  let detectedAmount = 0;
  let detectedAsset = (params.asset || 'USDT').toUpperCase();
  let senderAddr = '';

  if (spec.chainKind === 'EVM') {
    const evmSender = (userRow?.trust_wallet_address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(evmSender)) {
      return {
        ok: false as const,
        found: false as const,
        error: 'برای جستجوی خودکار تراکنش، ابتدا آدرس EVM کیف‌پول Trust Wallet خود را متصل کنید یا TX Hash را وارد نمایید.',
      };
    }
    senderAddr = evmSender;
    const netCfg = EVM_STABLE_CONTRACTS[spec.network];
    if (netCfg) {
      const fromTopic = '0x' + evmSender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
      const toTopic = '0x' + receiverAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
      try {
        const blkRes = await fetch(netCfg.rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
          signal: AbortSignal.timeout(4000),
        });
        const blkJson = (await blkRes.json()) as { result?: string };
        const latestHex = blkJson?.result;
        if (latestHex) {
          const latest = parseInt(latestHex, 16);
          const fromBlock = '0x' + Math.max(0, latest - 240).toString(16);
          const tokensToCheck = [
            netCfg.usdt ? { sym: 'USDT', ...netCfg.usdt } : null,
            netCfg.usdc ? { sym: 'USDC', ...netCfg.usdc } : null,
          ].filter((x): x is { sym: string; address: string; decimals: number } => Boolean(x));

          for (const tk of tokensToCheck) {
            const logRes = await fetch(netCfg.rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'eth_getLogs',
                params: [
                  {
                    fromBlock,
                    toBlock: 'latest',
                    address: tk.address,
                    topics: [ERC20_TRANSFER_TOPIC, fromTopic, toTopic],
                  },
                ],
              }),
              signal: AbortSignal.timeout(5000),
            }).catch(() => null);
            if (!logRes?.ok) continue;
            const lj = (await logRes.json()) as {
              result?: Array<{ transactionHash?: string; data?: string }>;
            };
            const logs = Array.isArray(lj.result) ? [...lj.result].reverse() : [];
            for (const lg of logs) {
              if (!lg.transactionHash || !lg.data) continue;
              const amt = Number(BigInt(lg.data)) / Math.pow(10, tk.decimals);
              if (amt < minExpected - 0.1) continue;
              const usedBefore = await db
                .prepare(`SELECT id FROM treasury_deposits WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`)
                .bind(lg.transactionHash)
                .first()
                .catch(() => null);
              if (usedBefore) continue;
              detectedHash = lg.transactionHash;
              detectedAmount = Number(amt.toFixed(4));
              detectedAsset = tk.sym;
              break;
            }
            if (detectedHash) break;
          }
        }
      } catch {
        // RPC unavailable in offline sandbox
      }
    }
  } else if (spec.chainKind === 'TRON') {
    const tronSender = (userRow?.trust_wallet_tron || '').trim();
    if (tronSender) senderAddr = tronSender;
    try {
      const trRes = await fetch(
        `https://api.trongrid.io/v1/accounts/${encodeURIComponent(receiverAddress)}/transactions/trc20?limit=25`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (trRes.ok) {
        const tj = (await trRes.json()) as {
          data?: Array<{
            transaction_id?: string;
            from?: string;
            to?: string;
            value?: string;
            token_info?: { symbol?: string; decimals?: number };
          }>;
        };
        for (const tx of tj.data || []) {
          if (!tx.transaction_id || !tx.value) continue;
          if (tronSender && (tx.from || '').toLowerCase() !== tronSender.toLowerCase()) continue;
          if ((tx.to || '').toLowerCase() !== receiverAddress.toLowerCase()) continue;
          const dec = Number(tx.token_info?.decimals ?? 6);
          const amt = Number(tx.value) / Math.pow(10, dec);
          if (amt < minExpected - 0.1) continue;
          const usedBefore = await db
            .prepare(`SELECT id FROM treasury_deposits WHERE LOWER(tx_hash) = LOWER(?) LIMIT 1`)
            .bind(tx.transaction_id)
            .first()
            .catch(() => null);
          if (usedBefore) continue;
          detectedHash = tx.transaction_id;
          detectedAmount = Number(amt.toFixed(4));
          detectedAsset = tx.token_info?.symbol || 'USDT';
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!detectedHash) {
    return {
      ok: false as const,
      found: false as const,
      error:
        'تراکنش تاییدشده جدیدی در بلاک‌های اخیر از آدرس کیف‌پول متصل شما به خزانه یافت نشد. اگر چند ثانیه پیش ارسال کرده‌اید کمی صبر کرده و دوباره بزنید یا TX Hash را مستقیم وارد کنید.',
    };
  }

  const submitted = await submitTreasuryDeposit(db, userId, {
    network: spec.network,
    asset: detectedAsset,
    amountUsd: detectedAmount,
    txHash: detectedHash,
    category: params.category || 'DEPOSIT',
    senderAddress: senderAddr || undefined,
  });

  return {
    ...submitted,
    ok: true as const,
    found: true as const,
    txHash: detectedHash,
    amountUsd: detectedAmount,
    asset: detectedAsset,
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
