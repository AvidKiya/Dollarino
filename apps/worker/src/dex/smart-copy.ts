import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { decryptVaultJson, encryptVaultJson, maskSecret, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import {
  fetchEvmNativeBalance,
  fetchSolanaBalance,
  fetchTonBalance,
  fetchTronBalances,
  isValidEvm,
  isValidSolana,
  isValidTon,
  isValidTron,
} from '../routes/trustwallet.js';
import { TelegramBotClient } from '../telegram/client.js';
import { resolveTelegramBotToken } from '../telegram/token.js';
import {
  buildV2SwapExactEthForTokensCalldata,
  EVM_CHAIN_CONFIG,
  signAndBroadcastEvmTx,
} from './evm-tx.js';
import { checkLiveFeeEnforcement, recordProfitShareServerFee } from '../services/server-fee.js';
import {
  buildMultiDappRoutes,
  buildTrustWalletSwapLinks,
  fetchDexTrendingOverview,
  getDexTokenPools,
  searchDexPairs,
  type DexTokenEnriched,
  type MultiDappRoute,
} from './screener.js';

export type OnchainProviderId =
  | 'dexscreener'
  | 'geckoterminal'
  | 'jupiter'
  | 'rugcheck'
  | 'honeypot_is'
  | 'moralis'
  | 'birdeye'
  | 'helius'
  | 'goplus'
  | 'oneinch';

export interface OnchainApiProviderRow {
  provider: OnchainProviderId;
  category: string;
  label: string;
  base_url: string;
  requires_key: number;
  api_key_masked: string | null;
  is_active: number;
  calls_today: number;
  last_test_ok: number | null;
  last_error: string | null;
  updated_at: string;
}

export interface SmartWalletHoldingItem {
  symbol: string;
  name?: string;
  chainId: string;
  tokenAddress?: string;
  sharePct: number;
  valueUsd: number;
  change24h?: number;
}

export interface SmartWalletTraderRow {
  id: string;
  source_type: 'AUTO_TOP10' | 'SITE_PICK' | 'USER_CUSTOM';
  added_by_user_id: string | null;
  wallet_address: string;
  chain_id: string;
  display_name: string;
  style_tag: string;
  roi_24h_pct?: number;
  roi_7d_pct: number;
  roi_30d_pct: number;
  realized_pnl_usd: number;
  win_rate: number;
  avg_hold_mins: number;
  trades_30d: number;
  safety_discipline_score: number;
  is_bot_filtered: number;
  top_tokens_json: string;
  recent_trades_json: string;
  last_seen_tx_hash: string | null;
  last_synced_at: string;
  is_active: number;
  trader_category?: 'HOLDER' | 'SCALPER' | 'SWING' | 'SNIPER';
  wallet_holdings?: SmartWalletHoldingItem[];
}

export interface CopyFollowRuleRow {
  id: string;
  user_id: string;
  trader_kind: 'SMART_WALLET' | 'SITE_TRADER';
  trader_id: string;
  trader_label: string;
  chain_id: string;
  execution_mode: 'TRUST_ONE_CLICK' | 'AUTO_EVM_ALLOWANCE' | 'AUTO_COPY_VAULT';
  allocated_margin_usd: number;
  used_margin_usd: number;
  sizing_mode: 'FIXED_USD' | 'PCT_ALLOCATION' | 'PROPORTIONAL';
  order_size_usd: number;
  order_size_pct: number;
  leverage: number;
  tp1_pct: number;
  tp1_sell_pct: number;
  tp2_pct: number;
  tp2_sell_pct: number;
  tp3_pct: number;
  moonbag_pct: number;
  stop_loss_pct: number;
  trailing_activate_pct: number;
  trailing_drop_pct: number;
  break_even_pct: number;
  time_limit_hours: number;
  min_safety_score: number;
  max_slippage_pct: number;
  min_liquidity_usd: number;
  min_mcap_usd: number;
  max_mcap_usd: number;
  max_open_positions: number;
  daily_max_loss_usd: number;
  daily_loss_used_usd: number;
  only_new_positions: number;
  copy_sells: number;
  dev_sell_auto_exit: number;
  anti_mev: number;
  ai_guard_enabled: number;
  reverse_copy: number;
  is_active: number;
  updated_at: string;
}

export interface CopyPositionV2Row {
  id: string;
  user_id: string;
  rule_id: string;
  trader_kind: string;
  trader_id: string;
  trader_label: string;
  execution_mode: string;
  chain_id: string;
  dex_name: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  direction: string;
  margin_usd: number;
  entry_price_usd: number;
  current_price_usd: number;
  qty_tokens: number;
  remaining_pct: number;
  tp1_hit: number;
  tp2_hit: number;
  tp3_hit: number;
  peak_pnl_pct: number;
  pnl_pct: number;
  pnl_usd: number;
  safety_score: number;
  ai_guard_note: string | null;
  status: 'PENDING_TRUST_SIGN' | 'OPEN' | 'CLOSED' | 'SKIPPED_SAFETY' | 'SKIPPED_AI';
  trust_dapp_url: string | null;
  tx_hash: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface TokenRugSafetyReport {
  chainId: string;
  tokenAddress: string;
  safetyScore: number;
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  lpLockedOrBurned: boolean;
  isMintable: boolean;
  top10HoldersPct: number;
  devHoldPct: number;
  liquidityUsd: number;
  tokenAgeHours: number | null;
  flags: string[];
  verdict: 'SAFE' | 'CAUTION' | 'DANGER';
  sourcesUsed: string[];
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let res = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) res += '1';
  for (let i = digits.length - 1; i >= 0; i--) res += BASE58_ALPHABET[digits[i]!]!;
  return res;
}

function decodeBase58(str: string): Uint8Array {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = BASE58_ALPHABET.indexOf(str[i]!);
    if (c < 0) throw new Error('Invalid Base58 character');
    let carry = c;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const EVM_CHAIN_HEX_MAP: Record<string, string> = {
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  base: '8453',
  avalanche: '43114',
};

const MORALIS_CHAIN_MAP: Record<string, string> = {
  ethereum: 'eth',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  optimism: 'optimism',
  avalanche: 'avalanche',
};

const CHAIN_RPC_MAP: Record<string, string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  bsc: 'https://bsc-dataseed.binance.org',
  base: 'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  polygon: 'https://polygon-rpc.com',
  optimism: 'https://mainnet.optimism.io',
  avalanche: 'https://api.avax.network/ext/bc/C/rpc',
};

export async function listOnchainApiProviders(db: D1Database): Promise<OnchainApiProviderRow[]> {
  const res = await db
    .prepare(
      `SELECT provider, category, label, base_url, requires_key, api_key_masked, is_active, calls_today, last_test_ok, last_error, updated_at
       FROM onchain_api_providers
       ORDER BY requires_key ASC, category ASC, provider ASC`
    )
    .all<OnchainApiProviderRow>()
    .catch(() => ({ results: [] as OnchainApiProviderRow[] }));
  return res.results;
}

export async function resolveOnchainApiKey(env: Env, provider: OnchainProviderId): Promise<{
  apiKey: string | null;
  baseUrl: string;
  isActive: boolean;
}> {
  const row = await env.DB.prepare(
    `SELECT base_url, encrypted_api_key, is_active FROM onchain_api_providers WHERE provider = ? LIMIT 1`
  )
    .bind(provider)
    .first<{ base_url: string; encrypted_api_key: string | null; is_active: number }>()
    .catch(() => null);

  if (!row || !row.is_active) {
    return { apiKey: null, baseUrl: row?.base_url || '', isActive: false };
  }
  if (!row.encrypted_api_key) {
    return { apiKey: null, baseUrl: row.base_url, isActive: true };
  }
  try {
    const parsed = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY);
    return { apiKey: parsed.apiKey?.trim() || null, baseUrl: row.base_url, isActive: true };
  } catch {
    return { apiKey: null, baseUrl: row.base_url, isActive: false };
  }
}

export async function saveOnchainApiProviderKey(
  env: Env,
  params: { provider: OnchainProviderId; apiKey?: string; baseUrl?: string; isActive?: boolean; label?: string }
): Promise<{ masked: string | null }> {
  const cleanKey = params.apiKey?.trim();
  const masked = cleanKey ? maskSecret(cleanKey) : null;
  const encrypted = cleanKey ? await encryptVaultJson({ apiKey: cleanKey }, env.MASTER_ENCRYPTION_KEY) : null;

  const existing = await env.DB.prepare(
    `SELECT provider, label, base_url, requires_key, api_key_masked, encrypted_api_key, is_active
     FROM onchain_api_providers WHERE provider = ? LIMIT 1`
  )
    .bind(params.provider)
    .first<{
      provider: string;
      label: string;
      base_url: string;
      requires_key: number;
      api_key_masked: string | null;
      encrypted_api_key: string | null;
      is_active: number;
    }>()
    .catch(() => null);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO onchain_api_providers (provider, category, label, base_url, requires_key, api_key_masked, encrypted_api_key, is_active, updated_at)
       VALUES (?, 'DISCOVERY', ?, ?, 1, ?, ?, ?, datetime('now'))`
    )
      .bind(
        params.provider,
        params.label || params.provider.toUpperCase(),
        params.baseUrl || 'https://api.dexscreener.com',
        masked,
        encrypted,
        params.isActive ?? Boolean(cleanKey) ? 1 : 0
      )
      .run();
    return { masked };
  }

  await env.DB.prepare(
    `UPDATE onchain_api_providers
     SET label = COALESCE(?, label),
         base_url = COALESCE(?, base_url),
         api_key_masked = COALESCE(?, api_key_masked),
         encrypted_api_key = COALESCE(?, encrypted_api_key),
         is_active = ?,
         last_error = NULL,
         updated_at = datetime('now')
     WHERE provider = ?`
  )
    .bind(
      params.label?.trim() || null,
      params.baseUrl?.trim() || null,
      masked,
      encrypted,
      typeof params.isActive === 'boolean' ? (params.isActive ? 1 : 0) : cleanKey ? 1 : existing.is_active,
      params.provider
    )
    .run();

  return { masked: masked || existing.api_key_masked };
}

export async function testOnchainApiProvider(
  env: Env,
  provider: OnchainProviderId
): Promise<{ ok: boolean; status: number; message: string }> {
  const cfg = await resolveOnchainApiKey(env, provider);
  const row = await env.DB.prepare(
    `SELECT base_url, requires_key, encrypted_api_key FROM onchain_api_providers WHERE provider = ? LIMIT 1`
  )
    .bind(provider)
    .first<{ base_url: string; requires_key: number; encrypted_api_key: string | null }>()
    .catch(() => null);

  let rawKey = cfg.apiKey;
  if (!rawKey && row?.encrypted_api_key) {
    try {
      const dec = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY);
      rawKey = dec.apiKey?.trim() || null;
    } catch {
      rawKey = null;
    }
  }

  if (row?.requires_key && !rawKey) {
    await env.DB.prepare(
      `UPDATE onchain_api_providers SET last_test_ok = 0, last_error = 'API Key ثبت نشده است', updated_at = datetime('now') WHERE provider = ?`
    )
      .bind(provider)
      .run()
      .catch(() => {});
    return { ok: false, status: 400, message: 'کلید API برای این سرویس هنوز ذخیره نشده است.' };
  }

  let testUrl = 'https://api.dexscreener.com/token-boosts/top/v1';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let method: 'GET' | 'POST' = 'GET';
  let body: string | undefined;

  if (provider === 'dexscreener') {
    testUrl = 'https://api.dexscreener.com/token-boosts/top/v1';
  } else if (provider === 'geckoterminal') {
    testUrl = 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools';
  } else if (provider === 'jupiter') {
    testUrl = 'https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000';
  } else if (provider === 'rugcheck') {
    testUrl = 'https://api.rugcheck.xyz/v1/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/report/summary';
  } else if (provider === 'honeypot_is') {
    testUrl = 'https://api.honeypot.is/v2/IsHoneypot?address=0x55d398326f99059fF775485246999027B3197955&chainID=56';
  } else if (provider === 'moralis') {
    testUrl = 'https://deep-index.moralis.io/api/v2.2/market-data/erc20s/top-tokens';
    headers['X-API-Key'] = rawKey!;
  } else if (provider === 'birdeye') {
    testUrl = 'https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=5';
    headers['X-API-KEY'] = rawKey!;
    headers['x-chain'] = 'solana';
  } else if (provider === 'helius') {
    testUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(rawKey!)}`;
    method = 'POST';
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' });
  } else if (provider === 'goplus') {
    testUrl = 'https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=0x55d398326f99059fF775485246999027B3197955';
    if (rawKey) headers['Authorization'] = rawKey;
  } else if (provider === 'oneinch') {
    testUrl = 'https://api.1inch.dev/swap/v6.0/56/healthcheck';
    headers['Authorization'] = `Bearer ${rawKey!}`;
  }

  try {
    const res = await fetch(testUrl, { method, headers, body, signal: AbortSignal.timeout(7000) });
    const ok = res.ok;
    const msg = ok ? `اتصال سالم و تاییدشده (HTTP ${res.status})` : `خطای پاسخ سرویس (HTTP ${res.status})`;
    await env.DB.prepare(
      `UPDATE onchain_api_providers
       SET last_test_ok = ?, last_error = ?, is_active = CASE WHEN ? = 1 THEN 1 ELSE is_active END,
           calls_today = calls_today + 1, updated_at = datetime('now')
       WHERE provider = ?`
    )
      .bind(ok ? 1 : 0, ok ? null : msg, ok ? 1 : 0, provider)
      .run()
      .catch(() => {});
    return { ok, status: res.status, message: msg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    await env.DB.prepare(
      `UPDATE onchain_api_providers SET last_test_ok = 0, last_error = ?, updated_at = datetime('now') WHERE provider = ?`
    )
      .bind(msg, provider)
      .run()
      .catch(() => {});
    return { ok: false, status: 0, message: msg };
  }
}

export async function runTokenRugAndSafetyScan(
  env: Env,
  chainId: string,
  tokenAddress: string,
  pairHint?: DexTokenEnriched | null
): Promise<TokenRugSafetyReport> {
  const c = (chainId || 'solana').toLowerCase();
  const addr = tokenAddress.trim();
  const pair = pairHint ?? (await getDexTokenPools(c, addr).catch(() => []))[0] ?? null;

  let safetyScore = pair ? pair.safetyScore : 55;
  let isHoneypot = false;
  let buyTaxPct = 0;
  let sellTaxPct = 0;
  let lpLockedOrBurned = false;
  let isMintable = false;
  let top10HoldersPct = 0;
  let devHoldPct = 0;
  const flags = new Set<string>(pair?.riskFlags ?? []);
  const sourcesUsed = ['DexScreener'];

  const evmChainNum = EVM_CHAIN_HEX_MAP[c];

  const checks: Array<Promise<void>> = [];

  // 1) GoPlus Token Security (works free or with key for EVM & Solana)
  if (evmChainNum || c === 'solana') {
    checks.push(
      (async () => {
        try {
          const goKey = await resolveOnchainApiKey(env, 'goplus').catch(() => ({ apiKey: null, isActive: false }));
          const goUrl =
            c === 'solana'
              ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(addr)}`
              : `https://api.gopluslabs.io/api/v1/token_security/${evmChainNum}?contract_addresses=${encodeURIComponent(addr.toLowerCase())}`;
          const headers: Record<string, string> = {};
          if (goKey.isActive && goKey.apiKey) headers['Authorization'] = goKey.apiKey;
          const res = await fetch(goUrl, { headers, signal: AbortSignal.timeout(4500) });
          if (!res.ok) return;
          const j = (await res.json()) as {
            result?: Record<string, Record<string, unknown>>;
          };
          const info = j.result?.[addr] || j.result?.[addr.toLowerCase()];
          if (!info) return;
          sourcesUsed.push('GoPlus Security');

          if (String(info.is_honeypot) === '1') {
            isHoneypot = true;
            safetyScore -= 60;
            flags.add('هانی‌پات شناسایی شد (امکان فروش مسدود است)');
          }
          if (String(info.is_mintable) === '1' || (info.mintable && (info.mintable as { status?: string }).status === '1')) {
            isMintable = true;
            safetyScore -= 15;
            flags.add('قابلیت چاپ توکن جدید (Mintable)');
          }
          if (String(info.cannot_sell_all) === '1') {
            safetyScore -= 25;
            flags.add('محدودیت فروش ۱۰۰٪ موجودی');
          }
          const bTax = Number(info.buy_tax || 0) * 100;
          const sTax = Number(info.sell_tax || 0) * 100;
          if (Number.isFinite(bTax) && bTax > 0) buyTaxPct = Math.max(buyTaxPct, Number(bTax.toFixed(1)));
          if (Number.isFinite(sTax) && sTax > 0) sellTaxPct = Math.max(sellTaxPct, Number(sTax.toFixed(1)));
          if (sellTaxPct > 12 || buyTaxPct > 12) {
            safetyScore -= 22;
            flags.add(`مالیات سنگین معامله (خرید ${buyTaxPct}% / فروش ${sellTaxPct}%)`);
          }
          if (Array.isArray(info.lp_holders)) {
            const lockedPct = info.lp_holders.reduce(
              (acc, h: { is_locked?: number; percent?: string }) =>
                acc + (h.is_locked === 1 ? Number(h.percent || 0) * 100 : 0),
              0
            );
            if (lockedPct >= 50) {
              lpLockedOrBurned = true;
              safetyScore += 10;
            }
          }
          if (Array.isArray(info.holders)) {
            const top10 = info.holders
              .slice(0, 10)
              .reduce((acc, h: { percent?: string }) => acc + Number(h.percent || 0) * 100, 0);
            top10HoldersPct = Number(top10.toFixed(1));
            if (top10HoldersPct > 55) {
              safetyScore -= 12;
              flags.add(`تمرکز بالای ۱۰ هولدر اول (${top10HoldersPct}%)`);
            }
          }
        } catch {
          // ignore network timeout
        }
      })()
    );
  }

  // 2) Honeypot.is for EVM chains
  if (evmChainNum) {
    checks.push(
      (async () => {
        try {
          const hpUrl = `https://api.honeypot.is/v2/IsHoneypot?address=${encodeURIComponent(addr)}&chainID=${evmChainNum}`;
          const res = await fetch(hpUrl, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) return;
          const j = (await res.json()) as {
            honeypotResult?: { isHoneypot?: boolean };
            simulationResult?: { buyTax?: number; sellTax?: number };
          };
          sourcesUsed.push('Honeypot.is');
          if (j.honeypotResult?.isHoneypot) {
            isHoneypot = true;
            safetyScore -= 60;
            flags.add('Honeypot.is: تله فروش تایید شد');
          }
          const bt = Number(j.simulationResult?.buyTax || 0);
          const st = Number(j.simulationResult?.sellTax || 0);
          if (bt > buyTaxPct) buyTaxPct = Number(bt.toFixed(1));
          if (st > sellTaxPct) sellTaxPct = Number(st.toFixed(1));
        } catch {
          // ignore
        }
      })()
    );
  }

  // 3) RugCheck.xyz for Solana tokens
  if (c === 'solana') {
    checks.push(
      (async () => {
        try {
          const rcRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(addr)}/report/summary`, {
            signal: AbortSignal.timeout(4000),
          });
          if (!rcRes.ok) return;
          const rc = (await rcRes.json()) as {
            score?: number;
            risks?: Array<{ name?: string; level?: string }>;
          };
          sourcesUsed.push('RugCheck.xyz');
          if (Array.isArray(rc.risks)) {
            for (const r of rc.risks.slice(0, 4)) {
              if (r.name) flags.add(`RugCheck: ${r.name}`);
              if (r.level === 'danger') safetyScore -= 18;
            }
          }
          if (typeof rc.score === 'number' && rc.score <= 500) {
            lpLockedOrBurned = true;
            safetyScore += 8;
          }
        } catch {
          // ignore
        }
      })()
    );
  }

  await Promise.all(checks);

  const liqUsd = Number(pair?.liquidity?.usd || 0);
  if (liqUsd >= 100_000) {
    lpLockedOrBurned = lpLockedOrBurned || true;
  } else if (liqUsd < 10_000) {
    safetyScore -= 15;
    flags.add('نقدینگی استخر زیر ۱۰ هزار دلار');
  }

  const pairCreatedMs = Number(pair?.pairCreatedAt || 0);
  const tokenAgeHours =
    pairCreatedMs > 0 ? Math.max(0.1, Number(((Date.now() - pairCreatedMs) / 3600_000).toFixed(1))) : null;
  if (tokenAgeHours !== null && tokenAgeHours < 6) {
    safetyScore -= 8;
    flags.add(`توکن بسیار تازه (${tokenAgeHours} ساعت از ساخت استخر)`);
  }

  const finalScore = isHoneypot ? Math.min(18, Math.max(0, safetyScore)) : Math.max(5, Math.min(99, Math.round(safetyScore)));
  const verdict: TokenRugSafetyReport['verdict'] =
    isHoneypot || finalScore < 45 ? 'DANGER' : finalScore < 70 ? 'CAUTION' : 'SAFE';

  return {
    chainId: c,
    tokenAddress: addr,
    safetyScore: finalScore,
    isHoneypot,
    buyTaxPct,
    sellTaxPct,
    lpLockedOrBurned,
    isMintable,
    top10HoldersPct,
    devHoldPct,
    liquidityUsd: liqUsd,
    tokenAgeHours,
    flags: [...flags],
    verdict,
    sourcesUsed,
  };
}

export interface SimulatedWalletTrade {
  symbol: string;
  tokenAddress: string;
  chainId: string;
  side: 'BUY' | 'SELL';
  entryUsd: number;
  maxGainPct: number;
  minDrawdownPct: number;
  finalReturnPct: number;
  holdMins: number;
  safetyScore: number;
  timestamp: string;
}

const CURATED_SMART_SEEDS: Array<{
  wallet: string;
  chainId: string;
  name: string;
  style: string;
  category: 'HOLDER' | 'SCALPER' | 'SWING' | 'SNIPER';
  roi24h: number;
  roi7d: number;
  roi30d: number;
  pnlUsd: number;
  winRate: number;
  avgHoldMins: number;
  trades30d: number;
  safetyDiscipline: number;
  holdings?: Array<{ symbol: string; sharePct: number; change24h: number }>;
}> = [
  {
    wallet: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    chainId: 'solana',
    name: 'Solana Alpha Whale #1',
    style: 'Solana Memecoin Early',
    category: 'SNIPER',
    roi24h: 11.4,
    roi7d: 48.6,
    roi30d: 214.4,
    pnlUsd: 184200,
    winRate: 74.2,
    avgHoldMins: 85,
    trades30d: 62,
    safetyDiscipline: 88,
    holdings: [
      { symbol: 'SOL', sharePct: 38, change24h: 4.2 },
      { symbol: 'JUP', sharePct: 24, change24h: 8.7 },
      { symbol: 'WIF', sharePct: 22, change24h: 14.5 },
      { symbol: 'USDC', sharePct: 16, change24h: 0 },
    ],
  },
  {
    wallet: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
    chainId: 'solana',
    name: 'Jup Sniper Pro (Anti-MEV)',
    style: 'Jupiter Momentum',
    category: 'SWING',
    roi24h: 6.8,
    roi7d: 36.2,
    roi30d: 168.5,
    pnlUsd: 142900,
    winRate: 71.8,
    avgHoldMins: 420,
    trades30d: 49,
    safetyDiscipline: 91,
    holdings: [
      { symbol: 'SOL', sharePct: 44, change24h: 4.2 },
      { symbol: 'BONK', sharePct: 26, change24h: 11.3 },
      { symbol: 'PYTH', sharePct: 18, change24h: 5.1 },
      { symbol: 'USDT', sharePct: 12, change24h: 0 },
    ],
  },
  {
    wallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    chainId: 'base',
    name: 'Base Smart Money #3',
    style: 'Base Narrative Holder',
    category: 'HOLDER',
    roi24h: 5.1,
    roi7d: 29.4,
    roi30d: 149.2,
    pnlUsd: 118500,
    winRate: 76.5,
    avgHoldMins: 4320,
    trades30d: 19,
    safetyDiscipline: 93,
    holdings: [
      { symbol: 'ETH', sharePct: 42, change24h: 3.1 },
      { symbol: 'AERO', sharePct: 33, change24h: 9.8 },
      { symbol: 'BRETT', sharePct: 15, change24h: 7.4 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '0x28C6c06298d514Db089934071355E5743bf21d60',
    chainId: 'bsc',
    name: 'BSC Pancake Whale',
    style: 'BSC Meme & AI',
    category: 'SWING',
    roi24h: 4.7,
    roi7d: 24.8,
    roi30d: 132.7,
    pnlUsd: 96400,
    winRate: 69.4,
    avgHoldMins: 640,
    trades30d: 54,
    safetyDiscipline: 86,
    holdings: [
      { symbol: 'BNB', sharePct: 46, change24h: 2.6 },
      { symbol: 'CAKE', sharePct: 24, change24h: 6.4 },
      { symbol: 'FLOKI', sharePct: 18, change24h: 9.2 },
      { symbol: 'USDT', sharePct: 12, change24h: 0 },
    ],
  },
  {
    wallet: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
    chainId: 'ethereum',
    name: 'ETH On-Chain Legend',
    style: 'ETH Large-Cap Holder',
    category: 'HOLDER',
    roi24h: 3.9,
    roi7d: 19.7,
    roi30d: 118.9,
    pnlUsd: 265000,
    winRate: 78.0,
    avgHoldMins: 7200,
    trades30d: 14,
    safetyDiscipline: 95,
    holdings: [
      { symbol: 'ETH', sharePct: 52, change24h: 3.1 },
      { symbol: 'PEPE', sharePct: 21, change24h: 12.1 },
      { symbol: 'LINK', sharePct: 17, change24h: 4.5 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    chainId: 'solana',
    name: 'Pump.fun Gem Scout',
    style: 'Graduated Pump.fun',
    category: 'SNIPER',
    roi24h: 13.8,
    roi7d: 41.3,
    roi30d: 112.4,
    pnlUsd: 78300,
    winRate: 66.7,
    avgHoldMins: 52,
    trades30d: 71,
    safetyDiscipline: 82,
    holdings: [
      { symbol: 'SOL', sharePct: 45, change24h: 4.2 },
      { symbol: 'POPCAT', sharePct: 28, change24h: 16.4 },
      { symbol: 'FARTCOIN', sharePct: 17, change24h: 19.1 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE',
    chainId: 'arbitrum',
    name: 'Arbitrum DeFi Rotation',
    style: 'ARB & Perp Gems',
    category: 'HOLDER',
    roi24h: 4.3,
    roi7d: 22.1,
    roi30d: 98.6,
    pnlUsd: 89100,
    winRate: 75.0,
    avgHoldMins: 2880,
    trades30d: 22,
    safetyDiscipline: 94,
    holdings: [
      { symbol: 'ARB', sharePct: 39, change24h: 3.8 },
      { symbol: 'ETH', sharePct: 31, change24h: 3.1 },
      { symbol: 'GMX', sharePct: 18, change24h: 5.9 },
      { symbol: 'USDC', sharePct: 12, change24h: 0 },
    ],
  },
  {
    wallet: 'EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG',
    chainId: 'ton',
    name: 'TON STON.fi Alpha',
    style: 'TON Ecosystem Memes',
    category: 'SWING',
    roi24h: 7.4,
    roi7d: 27.5,
    roi30d: 94.3,
    pnlUsd: 54200,
    winRate: 72.1,
    avgHoldMins: 540,
    trades30d: 43,
    safetyDiscipline: 89,
    holdings: [
      { symbol: 'TON', sharePct: 48, change24h: 3.6 },
      { symbol: 'NOT', sharePct: 24, change24h: 8.2 },
      { symbol: 'DOGS', sharePct: 18, change24h: 6.7 },
      { symbol: 'USDT', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    chainId: 'base',
    name: 'Aerodrome Liquidity Shark',
    style: 'Base Bluechip Holder',
    category: 'HOLDER',
    roi24h: 3.2,
    roi7d: 18.4,
    roi30d: 88.2,
    pnlUsd: 74900,
    winRate: 74.0,
    avgHoldMins: 5760,
    trades30d: 16,
    safetyDiscipline: 92,
    holdings: [
      { symbol: 'ETH', sharePct: 41, change24h: 3.1 },
      { symbol: 'AERO', sharePct: 34, change24h: 9.8 },
      { symbol: 'VIRTUAL', sharePct: 15, change24h: 11.2 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: 'TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR',
    chainId: 'tron',
    name: 'TRON SunSwap Whale',
    style: 'TRON Meme & USDT Flow',
    category: 'SWING',
    roi24h: 2.9,
    roi7d: 16.9,
    roi30d: 81.5,
    pnlUsd: 62800,
    winRate: 70.6,
    avgHoldMins: 480,
    trades30d: 34,
    safetyDiscipline: 87,
    holdings: [
      { symbol: 'TRX', sharePct: 45, change24h: 2.1 },
      { symbol: 'SUNDOG', sharePct: 28, change24h: 10.4 },
      { symbol: 'USDT', sharePct: 27, change24h: 0 },
    ],
  },
  {
    wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    chainId: 'solana',
    name: 'SOL Institutional Holder',
    style: 'Solana DeFi Long-Term',
    category: 'HOLDER',
    roi24h: 4.5,
    roi7d: 21.8,
    roi30d: 76.4,
    pnlUsd: 312000,
    winRate: 81.2,
    avgHoldMins: 10080,
    trades30d: 11,
    safetyDiscipline: 96,
    holdings: [
      { symbol: 'SOL', sharePct: 58, change24h: 4.2 },
      { symbol: 'JTO', sharePct: 19, change24h: 6.1 },
      { symbol: 'RAY', sharePct: 13, change24h: 7.8 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
    chainId: 'bsc',
    name: 'BNB Smart Accumulator',
    style: 'BSC Top Bluechip Holder',
    category: 'HOLDER',
    roi24h: 2.4,
    roi7d: 14.2,
    roi30d: 64.9,
    pnlUsd: 195000,
    winRate: 79.5,
    avgHoldMins: 8640,
    trades30d: 12,
    safetyDiscipline: 95,
    holdings: [
      { symbol: 'BNB', sharePct: 54, change24h: 2.6 },
      { symbol: 'CAKE', sharePct: 21, change24h: 6.4 },
      { symbol: 'TWT', sharePct: 15, change24h: 4.9 },
      { symbol: 'USDT', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    chainId: 'ethereum',
    name: 'ETH AI & Layer2 Whale',
    style: 'ETH L2 & AI Tokens',
    category: 'SWING',
    roi24h: 5.8,
    roi7d: 26.3,
    roi30d: 108.4,
    pnlUsd: 228400,
    winRate: 74.6,
    avgHoldMins: 960,
    trades30d: 25,
    safetyDiscipline: 93,
    holdings: [
      { symbol: 'ETH', sharePct: 40, change24h: 3.1 },
      { symbol: 'RENDER', sharePct: 25, change24h: 9.2 },
      { symbol: 'FET', sharePct: 20, change24h: 7.8 },
      { symbol: 'USDC', sharePct: 15, change24h: 0 },
    ],
  },
  {
    wallet: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    chainId: 'solana',
    name: 'Raydium Rapid Scalper',
    style: 'High-Frequency Solana',
    category: 'SCALPER',
    roi24h: 9.6,
    roi7d: 34.1,
    roi30d: 138.0,
    pnlUsd: 68400,
    winRate: 68.9,
    avgHoldMins: 28,
    trades30d: 118,
    safetyDiscipline: 84,
    holdings: [
      { symbol: 'SOL', sharePct: 48, change24h: 4.2 },
      { symbol: 'RAY', sharePct: 27, change24h: 7.8 },
      { symbol: 'USDC', sharePct: 25, change24h: 0 },
    ],
  },
  {
    wallet: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    chainId: 'bsc',
    name: 'BSC Micro-Scalp Desk',
    style: 'Fast PancakeSwap Flip',
    category: 'SCALPER',
    roi24h: 5.4,
    roi7d: 21.0,
    roi30d: 72.3,
    pnlUsd: 44100,
    winRate: 67.5,
    avgHoldMins: 35,
    trades30d: 94,
    safetyDiscipline: 85,
    holdings: [
      { symbol: 'BNB', sharePct: 50, change24h: 2.6 },
      { symbol: 'BUSD', sharePct: 28, change24h: 0 },
      { symbol: 'CAKE', sharePct: 22, change24h: 6.4 },
    ],
  },
  {
    wallet: '0x5a52E96BACdabb82fd05763E25335261B270Efcb',
    chainId: 'ethereum',
    name: 'ETH Steady Yield Vault',
    style: 'Low-Risk ETH Holder',
    category: 'HOLDER',
    roi24h: 1.8,
    roi7d: 11.4,
    roi30d: 48.2,
    pnlUsd: 139000,
    winRate: 84.0,
    avgHoldMins: 12960,
    trades30d: 8,
    safetyDiscipline: 97,
    holdings: [
      { symbol: 'ETH', sharePct: 60, change24h: 3.1 },
      { symbol: 'AAVE', sharePct: 22, change24h: 5.4 },
      { symbol: 'USDC', sharePct: 18, change24h: 0 },
    ],
  },
  {
    wallet: '0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D',
    chainId: 'arbitrum',
    name: 'ARB Perp Hedge Desk',
    style: 'Arbitrum Neutral Swing',
    category: 'SWING',
    roi24h: 3.1,
    roi7d: 15.6,
    roi30d: 58.9,
    pnlUsd: 82700,
    winRate: 76.2,
    avgHoldMins: 1440,
    trades30d: 24,
    safetyDiscipline: 94,
    holdings: [
      { symbol: 'ETH', sharePct: 44, change24h: 3.1 },
      { symbol: 'ARB', sharePct: 31, change24h: 3.8 },
      { symbol: 'PENDLE', sharePct: 15, change24h: 6.9 },
      { symbol: 'USDC', sharePct: 10, change24h: 0 },
    ],
  },
  {
    wallet: 'EQC8zQ7tP4M9R3nL2xH5V8bW6aJ1dK9fY0sG3uN4cM7pQ2z',
    chainId: 'ton',
    name: 'TON Jetton Holder Club',
    style: 'TON Ecosystem Holder',
    category: 'HOLDER',
    roi24h: 2.6,
    roi7d: 13.8,
    roi30d: 52.4,
    pnlUsd: 47500,
    winRate: 77.0,
    avgHoldMins: 6480,
    trades30d: 13,
    safetyDiscipline: 92,
    holdings: [
      { symbol: 'TON', sharePct: 62, change24h: 3.6 },
      { symbol: 'NOT', sharePct: 23, change24h: 8.2 },
      { symbol: 'USDT', sharePct: 15, change24h: 0 },
    ],
  },
];

function computeTraderMetaFromRow(row: SmartWalletTraderRow): {
  roi_24h_pct: number;
  trader_category: 'HOLDER' | 'SCALPER' | 'SWING' | 'SNIPER';
  wallet_holdings: SmartWalletHoldingItem[];
} {
  const seed = CURATED_SMART_SEEDS.find((s) => s.wallet.toLowerCase() === row.wallet_address.toLowerCase());
  const category: 'HOLDER' | 'SCALPER' | 'SWING' | 'SNIPER' =
    seed?.category ||
    (row.avg_hold_mins >= 1440
      ? 'HOLDER'
      : row.avg_hold_mins <= 45
        ? 'SCALPER'
        : row.style_tag.toLowerCase().includes('meme') || row.style_tag.toLowerCase().includes('pump')
          ? 'SNIPER'
          : 'SWING');
  const roi24h = seed?.roi24h ?? Number((Number(row.roi_7d_pct || 0) * 0.24).toFixed(1));
  const totalEstPortfolioUsd = Math.max(15_000, Math.round(Number(row.realized_pnl_usd || 25_000) * 1.6));

  let parsedTop: Array<{
    symbol?: string;
    name?: string;
    chainId?: string;
    tokenAddress?: string;
    change24h?: number;
    sharePct?: number;
    valueUsd?: number;
  }> = [];
  try {
    parsedTop = JSON.parse(row.top_tokens_json || '[]');
  } catch {
    parsedTop = [];
  }

  let holdings: SmartWalletHoldingItem[] = [];
  if (seed?.holdings?.length) {
    holdings = seed.holdings.map((h) => ({
      symbol: h.symbol,
      name: h.symbol,
      chainId: row.chain_id,
      sharePct: h.sharePct,
      valueUsd: Math.round((totalEstPortfolioUsd * h.sharePct) / 100),
      change24h: h.change24h,
    }));
  } else if (parsedTop.length > 0) {
    const shares = [45, 30, 15, 10];
    holdings = parsedTop.slice(0, 4).map((t, idx) => {
      const sharePct = Number(t.sharePct || shares[idx] || 15);
      return {
        symbol: String(t.symbol || 'TOKEN'),
        name: String(t.name || t.symbol || 'Token'),
        chainId: String(t.chainId || row.chain_id),
        tokenAddress: t.tokenAddress,
        sharePct,
        valueUsd: Number(t.valueUsd || Math.round((totalEstPortfolioUsd * sharePct) / 100)),
        change24h: typeof t.change24h === 'number' ? t.change24h : 0,
      };
    });
  }
  return {
    roi_24h_pct: roi24h,
    trader_category: category,
    wallet_holdings: holdings,
  };
}

export function enrichSmartTraderRow(row: SmartWalletTraderRow): SmartWalletTraderRow {
  const meta = computeTraderMetaFromRow(row);
  return {
    ...row,
    roi_24h_pct: meta.roi_24h_pct,
    trader_category: meta.trader_category,
    wallet_holdings: meta.wallet_holdings,
  };
}

export async function discoverTop10SmartTraders(
  env: Env,
  opts?: { forceRefresh?: boolean; chainFilter?: string }
): Promise<SmartWalletTraderRow[]> {
  // Check cache freshness in D1 so repeated loads don't waste D1 quota or external API limits
  const existing = await env.DB.prepare(
    `SELECT * FROM smart_wallet_traders
     WHERE source_type = 'AUTO_TOP10' AND is_active = 1
     ORDER BY roi_30d_pct DESC LIMIT 40`
  )
    .all<SmartWalletTraderRow>()
    .catch(() => ({ results: [] as SmartWalletTraderRow[] }));

  const newestSync = existing.results[0]?.last_synced_at ? Date.parse(existing.results[0].last_synced_at) : 0;
  const ageMins = Number.isFinite(newestSync) && newestSync > 0 ? (Date.now() - newestSync) / 60_000 : Infinity;

  if (!opts?.forceRefresh && existing.results.length >= CURATED_SMART_SEEDS.length && ageMins < 30) {
    const enrichedExisting = existing.results.map(enrichSmartTraderRow);
    if (opts?.chainFilter && opts.chainFilter !== 'ALL') {
      return enrichedExisting.filter((r) => r.chain_id.toLowerCase() === opts.chainFilter!.toLowerCase());
    }
    return enrichedExisting;
  }

  // Pull live trending pairs from DexScreener to enrich Top-10 smart-money hunters with real active tokens
  const trending = await fetchDexTrendingOverview().catch(() => ({ pairs: [] as DexTokenEnriched[], metas: [] }));
  const byChainTokens = new Map<string, DexTokenEnriched[]>();
  for (const p of trending.pairs) {
    const ch = (p.chainId || 'solana').toLowerCase();
    if (!byChainTokens.has(ch)) byChainTokens.set(ch, []);
    byChainTokens.get(ch)!.push(p);
  }

  // If admin configured Birdeye API key, fetch live top Solana traders
  const birdeyeCfg = await resolveOnchainApiKey(env, 'birdeye');
  const discoveredRows: Array<{
    id: string;
    wallet: string;
    chainId: string;
    name: string;
    style: string;
    roi7d: number;
    roi30d: number;
    pnlUsd: number;
    winRate: number;
    avgHoldMins: number;
    trades30d: number;
    safetyDiscipline: number;
  }> = [];

  if (birdeyeCfg.isActive && birdeyeCfg.apiKey) {
    try {
      const bRes = await fetch('https://public-api.birdeye.so/trader/gainers-losers?type=1W&sort_by=PnL&sort_type=desc&offset=0&limit=10', {
        headers: { 'X-API-KEY': birdeyeCfg.apiKey, 'x-chain': 'solana' },
        signal: AbortSignal.timeout(5500),
      });
      if (bRes.ok) {
        const bj = (await bRes.json()) as {
          data?: { items?: Array<{ address?: string; pnl?: number; volume?: number; trade_count?: number }> };
        };
        for (const [idx, item] of (bj.data?.items ?? []).slice(0, 4).entries()) {
          if (!item.address || (item.trade_count || 0) < 3) continue;
          const pnl = Number(item.pnl || 0);
          if (pnl <= 0) continue;
          const vol = Math.max(pnl, Number(item.volume || pnl * 2));
          const roi = Math.min(480, Math.max(25, Number(((pnl / vol) * 100 * 3.5).toFixed(1))));
          discoveredRows.push({
            wallet: item.address,
            chainId: 'solana',
            name: `Birdeye Top #${idx + 1} (${item.address.slice(0, 4)}..${item.address.slice(-4)})`,
            style: 'Birdeye Live Smart Money',
            roi7d: Number((roi * 0.35).toFixed(1)),
            roi30d: roi,
            pnlUsd: Math.round(pnl),
            winRate: 71.5,
            avgHoldMins: 75,
            trades30d: Number(item.trade_count || 20),
            safetyDiscipline: 87,
            id: `swt_top_${idx + 1}_birdeye`,
          });
        }
      }
    } catch {
      // fallback gracefully to multi-chain discovery
    }
  }

  // If admin configured Moralis API key, also pull live Top Profitable ERC20/BEP20/Base Traders
  const moralisCfg = await resolveOnchainApiKey(env, 'moralis');
  if (moralisCfg.isActive && moralisCfg.apiKey && discoveredRows.length < 8) {
    const evmTrending = trending.pairs.find((p) => MORALIS_CHAIN_MAP[p.chainId.toLowerCase()]);
    if (evmTrending) {
      const ch = evmTrending.chainId.toLowerCase();
      const mChain = MORALIS_CHAIN_MAP[ch]!;
      try {
        const mRes = await fetch(
          `https://deep-index.moralis.io/api/v2.2/erc20/${encodeURIComponent(evmTrending.baseToken.address)}/top-gainers?chain=${mChain}`,
          { headers: { 'X-API-Key': moralisCfg.apiKey }, signal: AbortSignal.timeout(5500) }
        );
        if (mRes.ok) {
          const mj = (await mRes.json()) as {
            result?: Array<{ address?: string; realized_profit_usd?: number; total_usd_invested?: number; count_of_trades?: number }>;
          };
          for (const [idx, item] of (mj.result ?? []).slice(0, 3).entries()) {
            if (!item.address || discoveredRows.some((r) => r.wallet === item.address)) continue;
            const pnl = Number(item.realized_profit_usd || 0);
            if (pnl <= 0) continue;
            const inv = Math.max(500, Number(item.total_usd_invested || pnl));
            const roi = Math.min(450, Math.max(20, Number(((pnl / inv) * 100).toFixed(1))));
            discoveredRows.push({
              id: `swt_top_${idx + 1}_moralis_${ch}`,
              wallet: item.address,
              chainId: ch,
              name: `Moralis ${ch.toUpperCase()} Top #${idx + 1} (${item.address.slice(0, 5)}..${item.address.slice(-4)})`,
              style: `Moralis Live Smart Money (${evmTrending.baseToken.symbol})`,
              roi7d: Number((roi * 0.4).toFixed(1)),
              roi30d: roi,
              pnlUsd: Math.round(pnl),
              winRate: 73.0,
              avgHoldMins: 115,
              trades30d: Number(item.count_of_trades || 18),
              safetyDiscipline: 88,
            });
          }
        }
      } catch {
        // fallback gracefully
      }
    }
  }

  for (const [idx, seed] of CURATED_SMART_SEEDS.entries()) {
    if (discoveredRows.length >= 28) break;
    if (discoveredRows.some((r) => r.wallet === seed.wallet)) continue;
    discoveredRows.push({
      id: `swt_top_${idx + 1}_${seed.chainId}`,
      ...seed,
    });
  }

  const nowIso = new Date().toISOString();
  const stmtBatch: D1PreparedStatement[] = [];

  for (let i = 0; i < discoveredRows.length; i++) {
    const item = discoveredRows[i]!;
    const chainTokens = byChainTokens.get(item.chainId) || trending.pairs.slice(0, 4);
    const topTokens = chainTokens.slice(0, 3).map((t) => ({
      symbol: t.baseToken.symbol,
      chainId: t.chainId,
      tokenAddress: t.baseToken.address,
      priceUsd: t.priceUsd,
      change24h: t.priceChange?.h24 ?? 0,
      safetyScore: t.safetyScore,
    }));

    const sampleTrades: SimulatedWalletTrade[] = (chainTokens.length ? chainTokens : trending.pairs)
      .slice(0, 6)
      .map((t, tIdx) => {
        const h24 = Number(t.priceChange?.h24 ?? 18);
        const gain = Math.max(8, Math.min(260, Math.abs(h24) * 1.4 + (tIdx % 2 === 0 ? 32 : 14)));
        const dd = tIdx === 2 ? -24 : -(6 + (tIdx * 3) % 14);
        return {
          symbol: t.baseToken.symbol,
          tokenAddress: t.baseToken.address,
          chainId: t.chainId || item.chainId,
          side: 'BUY',
          entryUsd: Number(t.priceUsd || 0.001),
          maxGainPct: Number(gain.toFixed(1)),
          minDrawdownPct: Number(dd.toFixed(1)),
          finalReturnPct: tIdx === 2 ? Number(dd.toFixed(1)) : Number((gain * 0.72).toFixed(1)),
          holdMins: item.avgHoldMins + tIdx * 12,
          safetyScore: t.safetyScore ?? 78,
          timestamp: new Date(Date.now() - (tIdx + 1) * 18 * 3600_000).toISOString(),
        };
      });

    stmtBatch.push(
      env.DB.prepare(
        `INSERT INTO smart_wallet_traders (
           id, source_type, added_by_user_id, wallet_address, chain_id, display_name, style_tag,
           roi_7d_pct, roi_30d_pct, realized_pnl_usd, win_rate, avg_hold_mins, trades_30d,
           safety_discipline_score, is_bot_filtered, top_tokens_json, recent_trades_json, last_synced_at, is_active
         ) VALUES (?, 'AUTO_TOP10', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           display_name = excluded.display_name,
           roi_7d_pct = excluded.roi_7d_pct,
           roi_30d_pct = excluded.roi_30d_pct,
           realized_pnl_usd = excluded.realized_pnl_usd,
           win_rate = excluded.win_rate,
           top_tokens_json = excluded.top_tokens_json,
           recent_trades_json = excluded.recent_trades_json,
           last_synced_at = excluded.last_synced_at,
           is_active = 1`
      ).bind(
        item.id,
        item.wallet,
        item.chainId,
        item.name,
        item.style,
        item.roi7d,
        item.roi30d,
        item.pnlUsd,
        item.winRate,
        item.avgHoldMins,
        item.trades30d,
        item.safetyDiscipline,
        JSON.stringify(topTokens),
        JSON.stringify(sampleTrades),
        nowIso
      )
    );
  }

  if (stmtBatch.length) {
    await env.DB.batch(stmtBatch).catch(() => {});
  }

  const fresh = await env.DB.prepare(
    `SELECT * FROM smart_wallet_traders
     WHERE source_type = 'AUTO_TOP10' AND is_active = 1
     ORDER BY roi_30d_pct DESC LIMIT 40`
  )
    .all<SmartWalletTraderRow>()
    .catch(() => ({ results: [] as SmartWalletTraderRow[] }));

  const enrichedFresh = fresh.results.map(enrichSmartTraderRow);

  if (opts?.chainFilter && opts.chainFilter !== 'ALL') {
    return enrichedFresh.filter((r) => r.chain_id.toLowerCase() === opts.chainFilter!.toLowerCase());
  }
  return enrichedFresh;
}

export async function inspectAndAddCustomWallet(
  env: Env,
  params: { userId: string; walletAddress: string; chainId?: string; displayName?: string }
): Promise<{
  ok: true;
  trader: SmartWalletTraderRow;
  nativeBalance: number | null;
  recentTxCount: number;
} | { ok: false; error: string }> {
  const addr = params.walletAddress.trim();
  let chain = (params.chainId || '').toLowerCase().trim();

  if (!chain) {
    if (isValidEvm(addr)) chain = 'bsc';
    else if (isValidSolana(addr)) chain = 'solana';
    else if (isValidTron(addr)) chain = 'tron';
    else if (isValidTon(addr)) chain = 'ton';
  }

  const isEvmChain = chain in CHAIN_RPC_MAP;
  if (isEvmChain && !isValidEvm(addr)) {
    return { ok: false, error: 'فرمت آدرس EVM معتبر نیست (باید با 0x شروع شود و ۴۲ کاراکتر باشد).' };
  }
  if (chain === 'solana' && !isValidSolana(addr)) {
    return { ok: false, error: 'فرمت آدرس شبکه Solana معتبر نیست.' };
  }
  if (chain === 'tron' && !isValidTron(addr)) {
    return { ok: false, error: 'فرمت آدرس شبکه TRON معتبر نیست (با T شروع می‌شود).' };
  }
  if (chain === 'ton' && !isValidTon(addr)) {
    return { ok: false, error: 'فرمت آدرس شبکه TON معتبر نیست.' };
  }
  if (!chain) {
    return { ok: false, error: 'شبکه کیف‌پول مشخص نیست یا فرمت آدرس ناشناخته است.' };
  }

  let nativeBalance: number | null = null;
  let recentTxCount = 0;

  if (chain === 'solana') {
    nativeBalance = await fetchSolanaBalance(addr);
    const helius = await resolveOnchainApiKey(env, 'helius');
    if (helius.isActive && helius.apiKey) {
      const hRes = await fetch(
        `https://api.helius.xyz/v0/addresses/${encodeURIComponent(addr)}/transactions?api-key=${encodeURIComponent(helius.apiKey)}&limit=10`,
        { signal: AbortSignal.timeout(4500) }
      ).catch(() => null);
      if (hRes?.ok) {
        const arr = (await hRes.json().catch(() => [])) as unknown[];
        if (Array.isArray(arr)) recentTxCount = arr.length;
      }
    }
  } else if (chain === 'ton') {
    nativeBalance = await fetchTonBalance(addr);
  } else if (chain === 'tron') {
    const tr = await fetchTronBalances(addr);
    nativeBalance = tr?.trx ?? null;
  } else if (isEvmChain) {
    nativeBalance = await fetchEvmNativeBalance(CHAIN_RPC_MAP[chain]!, addr);
    const moralis = await resolveOnchainApiKey(env, 'moralis');
    if (moralis.isActive && moralis.apiKey && MORALIS_CHAIN_MAP[chain]) {
      const mRes = await fetch(
        `https://deep-index.moralis.io/api/v2.2/wallets/${encodeURIComponent(addr)}/history?chain=${MORALIS_CHAIN_MAP[chain]}&limit=10`,
        { headers: { 'X-API-Key': moralis.apiKey }, signal: AbortSignal.timeout(4500) }
      ).catch(() => null);
      if (mRes?.ok) {
        const mj = (await mRes.json().catch(() => ({}))) as { result?: unknown[] };
        recentTxCount = Array.isArray(mj.result) ? mj.result.length : 0;
      }
    }
  }

  const trending = await fetchDexTrendingOverview().catch(() => ({ pairs: [] as DexTokenEnriched[] }));
  const chainPairs = trending.pairs.filter((p) => p.chainId.toLowerCase() === chain);
  const sampleSource = chainPairs.length ? chainPairs : trending.pairs;
  const sampleTrades: SimulatedWalletTrade[] = sampleSource.slice(0, 5).map((t, idx) => ({
    symbol: t.baseToken.symbol,
    tokenAddress: t.baseToken.address,
    chainId: t.chainId || chain,
    side: 'BUY',
    entryUsd: Number(t.priceUsd || 0.001),
    maxGainPct: Number((22 + idx * 14).toFixed(1)),
    minDrawdownPct: Number((-8 - idx * 3).toFixed(1)),
    finalReturnPct: idx === 1 ? -11 : Number((18 + idx * 11).toFixed(1)),
    holdMins: 65 + idx * 20,
    safetyScore: t.safetyScore ?? 76,
    timestamp: new Date(Date.now() - (idx + 1) * 24 * 3600_000).toISOString(),
  }));

  const id = randomId('cwallet');
  const label = params.displayName?.trim() || `ولت شخصی (${addr.slice(0, 5)}..${addr.slice(-4)})`;

  await env.DB.prepare(
    `INSERT INTO smart_wallet_traders (
       id, source_type, added_by_user_id, wallet_address, chain_id, display_name, style_tag,
       roi_7d_pct, roi_30d_pct, realized_pnl_usd, win_rate, avg_hold_mins, trades_30d,
       safety_discipline_score, is_bot_filtered, top_tokens_json, recent_trades_json, last_synced_at, is_active
     ) VALUES (?, 'USER_CUSTOM', ?, ?, ?, ?, 'Custom Tracked Wallet', 12.5, 42.0, ?, 68.0, 95, ?, 80, 0, ?, ?, datetime('now'), 1)
     ON CONFLICT(wallet_address, chain_id, COALESCE(added_by_user_id, 'PLATFORM')) DO UPDATE SET
       display_name = excluded.display_name,
       last_synced_at = datetime('now'),
       is_active = 1`
  )
    .bind(
      id,
      params.userId,
      addr,
      chain,
      label,
      Math.round((nativeBalance ?? 0) * 120),
      Math.max(recentTxCount, sampleTrades.length),
      JSON.stringify(sampleSource.slice(0, 3).map((t) => ({ symbol: t.baseToken.symbol, chainId: t.chainId }))),
      JSON.stringify(sampleTrades)
    )
    .run();

  const saved = await env.DB.prepare(
    `SELECT * FROM smart_wallet_traders WHERE wallet_address = ? AND chain_id = ? AND added_by_user_id = ? LIMIT 1`
  )
    .bind(addr, chain, params.userId)
    .first<SmartWalletTraderRow>();

  return {
    ok: true,
    trader: saved!,
    nativeBalance,
    recentTxCount,
  };
}

export function simulateWalletCopyBacktest(
  trader: SmartWalletTraderRow,
  settings: {
    orderSizeUsd: number;
    tp1Pct: number;
    tp2Pct: number;
    stopLossPct: number;
    trailingActivatePct: number;
    trailingDropPct: number;
    breakEvenPct: number;
    minSafetyScore: number;
    reverseCopy?: boolean;
  }
): {
  tradesSimulated: number;
  skippedUnsafeCount: number;
  winRatePct: number;
  netProfitUsd: number;
  roiPct: number;
  maxDrawdownPct: number;
  samples: Array<{ symbol: string; outcome: string; pnlPct: number; pnlUsd: number }>;
} {
  let rawTrades: SimulatedWalletTrade[] = [];
  try {
    rawTrades = JSON.parse(trader.recent_trades_json || '[]') as SimulatedWalletTrade[];
  } catch {
    rawTrades = [];
  }

  if (!rawTrades.length) {
    const fallbackWin = Math.max(50, Math.min(85, trader.win_rate || 68));
    rawTrades = [
      { symbol: 'BONK', tokenAddress: '', chainId: trader.chain_id, side: 'BUY', entryUsd: 0.00002, maxGainPct: 68, minDrawdownPct: -8, finalReturnPct: 49, holdMins: 75, safetyScore: 84, timestamp: new Date().toISOString() },
      { symbol: 'PEPE', tokenAddress: '', chainId: trader.chain_id, side: 'BUY', entryUsd: 0.00001, maxGainPct: 44, minDrawdownPct: -11, finalReturnPct: 34, holdMins: 95, safetyScore: 88, timestamp: new Date().toISOString() },
      { symbol: 'MEME', tokenAddress: '', chainId: trader.chain_id, side: 'BUY', entryUsd: 0.012, maxGainPct: 14, minDrawdownPct: -29, finalReturnPct: -25, holdMins: 40, safetyScore: 76, timestamp: new Date().toISOString() },
      { symbol: 'WIF', tokenAddress: '', chainId: trader.chain_id, side: 'BUY', entryUsd: 1.85, maxGainPct: 95, minDrawdownPct: -6, finalReturnPct: 72, holdMins: 140, safetyScore: 90, timestamp: new Date().toISOString() },
    ];
    if (fallbackWin < 65) rawTrades[1]!.finalReturnPct = -16;
  }

  const orderSize = Math.max(5, Number(settings.orderSizeUsd || 25));
  let netProfitUsd = 0;
  let wins = 0;
  let skippedUnsafeCount = 0;
  let peakEquity = 0;
  let maxDrawdownUsd = 0;
  const samples: Array<{ symbol: string; outcome: string; pnlPct: number; pnlUsd: number }> = [];

  for (const tr of rawTrades) {
    if (tr.safetyScore < settings.minSafetyScore) {
      skippedUnsafeCount++;
      samples.push({ symbol: tr.symbol, outcome: 'SKIPPED_RUG_GUARD', pnlPct: 0, pnlUsd: 0 });
      continue;
    }

    let simulatedPct = tr.finalReturnPct;
    let outcome = 'CLOSED';

    if (settings.reverseCopy) {
      simulatedPct = -simulatedPct;
    } else {
      if (tr.minDrawdownPct <= -settings.stopLossPct) {
        if (tr.maxGainPct >= settings.breakEvenPct) {
          simulatedPct = 1.5;
          outcome = 'BREAK_EVEN';
        } else {
          simulatedPct = -settings.stopLossPct;
          outcome = 'STOP_LOSS';
        }
      } else if (tr.maxGainPct >= settings.tp2Pct) {
        simulatedPct = settings.tp1Pct * 0.4 + settings.tp2Pct * 0.6;
        outcome = 'TP2_HIT';
      } else if (tr.maxGainPct >= settings.trailingActivatePct) {
        simulatedPct = Math.max(settings.tp1Pct * 0.5, tr.maxGainPct - settings.trailingDropPct);
        outcome = 'TRAILING_STOP';
      } else if (tr.maxGainPct >= settings.tp1Pct) {
        simulatedPct = settings.tp1Pct * 0.5 + tr.finalReturnPct * 0.5;
        outcome = 'TP1_HIT';
      }
    }

    const pnlUsd = (orderSize * simulatedPct) / 100;
    netProfitUsd += pnlUsd;
    if (pnlUsd > 0) wins++;
    if (netProfitUsd > peakEquity) peakEquity = netProfitUsd;
    const dd = peakEquity - netProfitUsd;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;

    samples.push({
      symbol: tr.symbol,
      outcome,
      pnlPct: Number(simulatedPct.toFixed(1)),
      pnlUsd: Number(pnlUsd.toFixed(2)),
    });
  }

  const executedCount = samples.filter((s) => s.outcome !== 'SKIPPED_RUG_GUARD').length;
  const totalCapitalUsed = Math.max(orderSize, executedCount * orderSize);

  return {
    tradesSimulated: executedCount,
    skippedUnsafeCount,
    winRatePct: executedCount ? Number(((wins / executedCount) * 100).toFixed(1)) : 0,
    netProfitUsd: Number(netProfitUsd.toFixed(2)),
    roiPct: Number(((netProfitUsd / totalCapitalUsed) * 100).toFixed(1)),
    maxDrawdownPct: Number(((maxDrawdownUsd / totalCapitalUsed) * 100).toFixed(1)),
    samples,
  };
}

export async function ensureUserCopyVault(
  env: Env,
  userId: string
): Promise<{
  id: string;
  evmAddress: string;
  solanaAddress: string;
  tronAddress: string;
  allowanceLimitUsd: number;
  autoWithdrawToTrust: boolean;
}> {
  const existing = await env.DB.prepare(
    `SELECT id, evm_address, solana_address, tron_address, allowance_limit_usd, auto_withdraw_to_trust
     FROM user_copy_vaults WHERE user_id = ? LIMIT 1`
  )
    .bind(userId)
    .first<{
      id: string;
      evm_address: string;
      solana_address: string;
      tron_address: string | null;
      allowance_limit_usd: number;
      auto_withdraw_to_trust: number;
    }>()
    .catch(() => null);

  if (existing) {
    return {
      id: existing.id,
      evmAddress: existing.evm_address,
      solanaAddress: existing.solana_address,
      tronAddress: existing.tron_address || '',
      allowanceLimitUsd: Number(existing.allowance_limit_usd || 500),
      autoWithdrawToTrust: Boolean(existing.auto_withdraw_to_trust),
    };
  }

  // Generate genuine secp256k1 keypair (EVM + TRON) and ed25519 keypair (Solana)
  const evmPriv = crypto.getRandomValues(new Uint8Array(32));
  const evmPubUncompressed = secp256k1.getPublicKey(evmPriv, false).slice(1);
  const evmHash = keccak_256(evmPubUncompressed);
  const evmAddrBytes = evmHash.slice(-20);
  const evmAddress = '0x' + toHex(evmAddrBytes);

  // TRON address = Base58Check(0x41 + 20-byte address)
  const tronPayload = new Uint8Array(21);
  tronPayload[0] = 0x41;
  tronPayload.set(evmAddrBytes, 1);
  const tronChk = sha256(sha256(tronPayload)).slice(0, 4);
  const tronFull = new Uint8Array(25);
  tronFull.set(tronPayload, 0);
  tronFull.set(tronChk, 21);
  const tronAddress = encodeBase58(tronFull);

  // Solana keypair = 32-byte seed + 32-byte ed25519 public key
  const solSeed = crypto.getRandomValues(new Uint8Array(32));
  const solPub = ed25519.getPublicKey(solSeed);
  const solFull = new Uint8Array(64);
  solFull.set(solSeed, 0);
  solFull.set(solPub, 32);
  const solanaAddress = encodeBase58(solPub);
  const solanaSecretBase58 = encodeBase58(solFull);

  const encryptedKeys = await encryptVaultJson(
    {
      evmPrivateKeyHex: toHex(evmPriv),
      solanaSecretBase58,
    },
    env.MASTER_ENCRYPTION_KEY
  );

  const id = randomId('cvault');
  await env.DB.prepare(
    `INSERT INTO user_copy_vaults (id, user_id, evm_address, solana_address, tron_address, encrypted_keys_json, allowance_limit_usd, auto_withdraw_to_trust, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 500, 1, 1)`
  )
    .bind(id, userId, evmAddress, solanaAddress, tronAddress, encryptedKeys)
    .run();

  return {
    id,
    evmAddress,
    solanaAddress,
    tronAddress,
    allowanceLimitUsd: 500,
    autoWithdrawToTrust: true,
  };
}

export async function exportUserCopyVaultKeys(
  env: Env,
  userId: string
): Promise<{
  evmAddress: string;
  evmPrivateKeyHex: string;
  solanaAddress: string;
  solanaSecretBase58: string;
  tronAddress: string;
}> {
  await ensureUserCopyVault(env, userId);
  const row = await env.DB.prepare(
    `SELECT evm_address, solana_address, tron_address, encrypted_keys_json
     FROM user_copy_vaults WHERE user_id = ? LIMIT 1`
  )
    .bind(userId)
    .first<{
      evm_address: string;
      solana_address: string;
      tron_address: string | null;
      encrypted_keys_json: string;
    }>();
  if (!row) throw new Error('Vault not found');
  const dec = await decryptVaultJson<{ evmPrivateKeyHex: string; solanaSecretBase58: string }>(
    row.encrypted_keys_json,
    env.MASTER_ENCRYPTION_KEY
  );
  return {
    evmAddress: row.evm_address,
    evmPrivateKeyHex: dec.evmPrivateKeyHex,
    solanaAddress: row.solana_address,
    solanaSecretBase58: dec.solanaSecretBase58,
    tronAddress: row.tron_address || '',
  };
}

export async function executeLiveSolanaVaultJupiterSwap(
  env: Env,
  userId: string,
  outputMint: string,
  usdAmount: number,
  slippageBps: number
): Promise<{ executedOnchain: boolean; txHash: string | null; note: string }> {
  try {
    const keys = await exportUserCopyVaultKeys(env, userId);
    const solBal = await fetchSolanaBalance(keys.solanaAddress);
    if (solBal === null || solBal < 0.015) {
      return {
        executedOnchain: false,
        txHash: null,
        note: `شبیه‌ساز زنده خزانه (موجودی SOL خزانه ${solBal?.toFixed(4) ?? '0'} — برای اجرای واقعی بلاکچین خزانه را شارژ کنید)`,
      };
    }

    // Estimate SOL price in USD via DexScreener WSOL pool
    const solMint = 'So11111111111111111111111111111111111111112';
    const solPools = await getDexTokenPools('solana', solMint).catch(() => []);
    const solPriceUsd = Number(solPools[0]?.priceUsd || 180);
    const desiredSol = usdAmount / Math.max(10, solPriceUsd);
    const maxSpendableSol = Math.max(0, solBal - 0.008); // Keep rent & gas reserve
    const spendSol = Math.min(desiredSol, maxSpendableSol);
    if (spendSol < 0.005) {
      return {
        executedOnchain: false,
        txHash: null,
        note: `شبیه‌ساز زنده خزانه (موجودی SOL آزاد کافی نیست: ${solBal.toFixed(4)} SOL)`,
      };
    }

    const lamports = Math.floor(spendSol * 1e9);
    const qUrl =
      `https://quote-api.jup.ag/v6/quote?inputMint=${solMint}&outputMint=${encodeURIComponent(outputMint)}` +
      `&amount=${lamports}&slippageBps=${Math.max(50, Math.min(4000, Math.round(slippageBps)))}`;
    const qRes = await fetch(qUrl, { signal: AbortSignal.timeout(6000) });
    if (!qRes.ok) {
      return { executedOnchain: false, txHash: null, note: 'خطای استعلام مسیر Jupiter — ثبت در حالت شبیه‌ساز زنده' };
    }
    const quoteResponse = await qRes.json();

    const sRes = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: keys.solanaAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!sRes.ok) {
      return { executedOnchain: false, txHash: null, note: 'ساخت تراکنش Jupiter ممکن نشد — ثبت در حالت شبیه‌ساز زنده' };
    }
    const swapJson = (await sRes.json()) as { swapTransaction?: string };
    if (!swapJson.swapTransaction) {
      return { executedOnchain: false, txHash: null, note: 'پاسخ خالی از Jupiter — ثبت شبیه‌ساز زنده' };
    }

    // Sign Solana serialized transaction (supports both legacy & versioned v0 with 1 signer)
    const rawBin = atob(swapJson.swapTransaction);
    const txBytes = new Uint8Array(rawBin.length);
    for (let i = 0; i < rawBin.length; i++) txBytes[i] = rawBin.charCodeAt(i);

    const numSigs = txBytes[0] || 1;
    const msgOffset = 1 + numSigs * 64;
    const messageBytes = txBytes.slice(msgOffset);
    const fullSecret = decodeBase58(keys.solanaSecretBase58);
    const seed32 = fullSecret.slice(0, 32);
    const sig64 = ed25519.sign(messageBytes, seed32);
    txBytes.set(sig64, 1);

    let signedStr = '';
    for (let i = 0; i < txBytes.length; i++) signedStr += String.fromCharCode(txBytes[i]!);
    const signedB64 = btoa(signedStr);

    const helius = await resolveOnchainApiKey(env, 'helius').catch(() => ({ apiKey: null, isActive: false }));
    const rpcEndpoint =
      helius.isActive && helius.apiKey
        ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius.apiKey)}`
        : 'https://api.mainnet-beta.solana.com';

    const rpcRes = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [signedB64, { encoding: 'base64', skipPreflight: false, maxRetries: 2 }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const rpcJson = (await rpcRes.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
    if (rpcJson.result) {
      return {
        executedOnchain: true,
        txHash: rpcJson.result,
        note: `✅ خرید واقعی آن‌چین با Jupiter انجام شد (${spendSol.toFixed(4)} SOL)`,
      };
    }
    return {
      executedOnchain: false,
      txHash: null,
      note: `ثبت شبیه‌ساز زنده (ارسال RPC: ${rpcJson.error?.message || 'ناموفق'})`,
    };
  } catch (err) {
    return {
      executedOnchain: false,
      txHash: null,
      note: `ثبت شبیه‌ساز زنده (${err instanceof Error ? err.message : 'Vault check'})`,
    };
  }
}

export async function executeLiveEvmVaultSwap(
  env: Env,
  userId: string,
  chainIdName: string,
  tokenAddress: string,
  usdAmount: number,
  slippagePct = 10
): Promise<{ executedOnchain: boolean; txHash: string | null; note: string }> {
  const chainKey = chainIdName.toLowerCase();
  const cfg = EVM_CHAIN_CONFIG[chainKey];
  if (!cfg) {
    return { executedOnchain: false, txHash: null, note: `رصد خودکار خزانه (${chainIdName})` };
  }

  try {
    const keys = await exportUserCopyVaultKeys(env, userId);
    const nativeBal = await fetchEvmNativeBalance(cfg.rpcUrls[0]!, keys.evmAddress);
    const minReserve = chainKey === 'bsc' ? 0.003 : 0.0015;
    if (nativeBal === null || nativeBal <= minReserve * 1.5) {
      return {
        executedOnchain: false,
        txHash: null,
        note: `شبیه‌ساز زنده خزانه (موجودی ${cfg.nativeSymbol} خزانه ${nativeBal?.toFixed(5) ?? '0'} — برای اجرای آن‌چین روی ${chainKey.toUpperCase()} خزانه را شارژ کنید)`,
      };
    }

    const pools = await getDexTokenPools(chainKey, cfg.wrappedNative).catch(() => []);
    const nativeUsd = Number(pools[0]?.priceUsd || (chainKey === 'bsc' ? 600 : 3000));
    const desiredNative = usdAmount / Math.max(10, nativeUsd);
    const spendNative = Math.min(desiredNative, Math.max(0, nativeBal - minReserve));
    if (spendNative <= 0.0005) {
      return {
        executedOnchain: false,
        txHash: null,
        note: `شبیه‌ساز زنده خزانه (موجودی آزاد ${cfg.nativeSymbol} کافی نیست)`,
      };
    }

    const valueWei = BigInt(Math.floor(spendNative * 1e9)) * 1_000_000_000n;
    const oneInchCfg = await resolveOnchainApiKey(env, 'oneinch').catch(() => ({ apiKey: null, isActive: false }));

    let txTo = cfg.v2Router;
    let txData: string | undefined;
    let txValue = valueWei;

    if (oneInchCfg?.isActive && oneInchCfg.apiKey) {
      const swapUrl =
        `https://api.1inch.dev/swap/v6.0/${cfg.chainId}/swap?src=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` +
        `&dst=${encodeURIComponent(tokenAddress)}&amount=${valueWei.toString()}&from=${keys.evmAddress}` +
        `&slippage=${Math.max(1, Math.min(49, Math.round(slippagePct)))}&disableEstimate=true`;
      const res = await fetch(swapUrl, {
        headers: { Authorization: `Bearer ${oneInchCfg.apiKey}` },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);
      if (res?.ok) {
        const j = (await res.json()) as { tx?: { to: string; data: string; value?: string } };
        if (j.tx?.to && j.tx?.data) {
          txTo = j.tx.to;
          txData = j.tx.data;
          if (j.tx.value) txValue = BigInt(j.tx.value);
        }
      }
    }

    if (!txData && cfg.v2Router) {
      txTo = cfg.v2Router;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      txData = buildV2SwapExactEthForTokensCalldata(0n, [cfg.wrappedNative, tokenAddress], keys.evmAddress, deadline);
    }

    if (!txTo || !txData) {
      return {
        executedOnchain: false,
        txHash: null,
        note: `مسیر روتر ${chainKey.toUpperCase()} نیاز به کلید فعال 1inch دارد (ثبت ردیابی خزانه)`,
      };
    }

    const sent = await signAndBroadcastEvmTx({
      chainIdName: chainKey,
      privateKeyHex: keys.evmPrivateKeyHex,
      to: txTo,
      valueWei: txValue,
      dataHex: txData,
    });

    return {
      executedOnchain: true,
      txHash: sent.txHash,
      note: `✅ خرید واقعی آن‌چین ${chainKey.toUpperCase()} اجرا شد (${spendNative.toFixed(4)} ${cfg.nativeSymbol})`,
    };
  } catch (err) {
    return {
      executedOnchain: false,
      txHash: null,
      note: `شبیه‌ساز زنده EVM (${err instanceof Error ? err.message : 'Vault check'})`,
    };
  }
}

export async function withdrawCopyVaultToTrustWallet(
  env: Env,
  userId: string,
  input: { chainId: string; toAddress: string; amountNative: number }
): Promise<{ ok: boolean; txHash: string; explorerUrl: string; amountSent: number; symbol: string }> {
  const chainKey = input.chainId.toLowerCase().trim();
  const to = input.toAddress.trim();
  const amount = Number(input.amountNative);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('مبلغ برداشت باید بزرگ‌تر از صفر باشد.');
  }

  const keys = await exportUserCopyVaultKeys(env, userId);

  if (chainKey === 'solana') {
    if (!isValidSolana(to)) throw new Error('آدرس مقصد سولانا نامعتبر است.');
    const bal = await fetchSolanaBalance(keys.solanaAddress);
    if (bal === null || bal < amount + 0.001) {
      throw new Error(`موجودی SOL خزانه (${bal?.toFixed(4) ?? '0'}) برای ارسال + کارمزد شبکه کافی نیست.`);
    }

    const helius = await resolveOnchainApiKey(env, 'helius').catch(() => ({ apiKey: null, isActive: false }));
    const rpcUrl =
      helius.isActive && helius.apiKey
        ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius.apiKey)}`
        : 'https://api.mainnet-beta.solana.com';

    const bhRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }),
      signal: AbortSignal.timeout(7000),
    });
    const bhJson = (await bhRes.json().catch(() => ({}))) as { result?: { value?: { blockhash?: string } } };
    const blockhash = bhJson.result?.value?.blockhash;
    if (!blockhash) throw new Error('دریافت بلاک‌هش شبکه سولانا ناموفق بود.');

    const fromPub = decodeBase58(keys.solanaAddress);
    const toPub = decodeBase58(to);
    const sysProg = new Uint8Array(32); // 11111111111111111111111111111111
    const bhBytes = decodeBase58(blockhash);

    const lamports = BigInt(Math.floor(amount * 1e9));
    const ixData = new Uint8Array(12);
    const view = new DataView(ixData.buffer);
    view.setUint32(0, 2, true); // SystemProgram::Transfer
    view.setBigUint64(4, lamports, true);

    const msg = new Uint8Array(3 + 1 + 32 * 3 + 32 + 1 + 1 + 3 + 1 + 12);
    let off = 0;
    msg.set([1, 0, 1], off); off += 3; // header
    msg[off++] = 3; // 3 accounts
    msg.set(fromPub, off); off += 32;
    msg.set(toPub, off); off += 32;
    msg.set(sysProg, off); off += 32;
    msg.set(bhBytes, off); off += 32;
    msg[off++] = 1; // 1 instruction
    msg[off++] = 2; // programId index (sysProg)
    msg[off++] = 2; // 2 account indices
    msg[off++] = 0; // from
    msg[off++] = 1; // to
    msg[off++] = 12; // data len
    msg.set(ixData, off);

    const seed32 = decodeBase58(keys.solanaSecretBase58).slice(0, 32);
    const sig64 = ed25519.sign(msg, seed32);
    const fullTx = new Uint8Array(1 + 64 + msg.length);
    fullTx[0] = 1;
    fullTx.set(sig64, 1);
    fullTx.set(msg, 65);

    let bin = '';
    for (let i = 0; i < fullTx.length; i++) bin += String.fromCharCode(fullTx[i]!);
    const b64 = btoa(bin);

    const sendRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [b64, { encoding: 'base64' }] }),
      signal: AbortSignal.timeout(8000),
    });
    const sendJson = (await sendRes.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
    if (!sendJson.result) {
      throw new Error(sendJson.error?.message || 'ارسال تراکنش سولانا ناموفق بود.');
    }
    return {
      ok: true,
      txHash: sendJson.result,
      explorerUrl: `https://solscan.io/tx/${sendJson.result}`,
      amountSent: amount,
      symbol: 'SOL',
    };
  }

  const cfg = EVM_CHAIN_CONFIG[chainKey];
  if (!cfg) throw new Error(`شبکه ${chainKey} برای برداشت مستقیم پشتیبانی نمی‌شود.`);
  if (!isValidEvm(to)) throw new Error('آدرس مقصد EVM نامعتبر است (باید با 0x شروع شود).');

  const bal = await fetchEvmNativeBalance(cfg.rpcUrls[0]!, keys.evmAddress);
  const feeBuf = chainKey === 'bsc' ? 0.0005 : 0.0003;
  if (bal === null || bal < amount + feeBuf) {
    throw new Error(`موجودی ${cfg.nativeSymbol} خزانه (${bal?.toFixed(5) ?? '0'}) برای برداشت + گس کافی نیست.`);
  }

  const valueWei = BigInt(Math.floor(amount * 1e9)) * 1_000_000_000n;
  const sent = await signAndBroadcastEvmTx({
    chainIdName: chainKey,
    privateKeyHex: keys.evmPrivateKeyHex,
    to,
    valueWei,
    gasLimitOverride: 21_000n,
  });

  return {
    ok: true,
    txHash: sent.txHash,
    explorerUrl: sent.explorerUrl,
    amountSent: amount,
    symbol: cfg.nativeSymbol,
  };
}

function toFixed32Bytes(decoded: Uint8Array): Uint8Array {
  if (decoded.length === 32) return decoded;
  const out = new Uint8Array(32);
  if (decoded.length > 32) {
    out.set(decoded.slice(decoded.length - 32), 0);
  } else {
    out.set(decoded, 32 - decoded.length);
  }
  return out;
}

export async function estimateSolPriceUsd(): Promise<number> {
  try {
    const solPools = await getDexTokenPools('solana', 'So11111111111111111111111111111111111111112');
    const px = Number(solPools[0]?.priceUsd || 0);
    if (Number.isFinite(px) && px >= 10 && px <= 25_000) return px;
  } catch {
    // fallback below
  }
  return 180;
}

export async function buildUnsignedSolanaTransferTx(
  env: Env,
  params: { fromAddress: string; toAddress: string; amountSol: number }
): Promise<{
  txBase64: string;
  blockhash: string;
  lamports: number;
  amountSol: number;
}> {
  const from = params.fromAddress.trim();
  const to = params.toAddress.trim();
  if (!isValidSolana(from)) throw new Error('آدرس مبدا سولانا نامعتبر است.');
  if (!isValidSolana(to)) throw new Error('آدرس مقصد سولانا نامعتبر است.');
  const cleanSol = Number(Math.max(0.0001, params.amountSol).toFixed(6));
  const lamports = Math.max(100_000, Math.round(cleanSol * 1e9));

  const helius = await resolveOnchainApiKey(env, 'helius').catch(() => ({ apiKey: null, isActive: false }));
  const rpcCandidates = [
    ...(helius.isActive && helius.apiKey
      ? [`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius.apiKey)}`]
      : []),
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
  ];

  let blockhash = '';
  for (const rpcUrl of rpcCandidates) {
    try {
      const bhRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }),
        signal: AbortSignal.timeout(5000),
      });
      const bhJson = (await bhRes.json().catch(() => ({}))) as { result?: { value?: { blockhash?: string } } };
      if (bhJson.result?.value?.blockhash) {
        blockhash = bhJson.result.value.blockhash;
        break;
      }
    } catch {
      // try next RPC
    }
  }
  if (!blockhash) {
    throw new Error('دریافت بلاک‌هش شبکه سولانا ناموفق بود.');
  }

  const fromPub = toFixed32Bytes(decodeBase58(from));
  const toPub = toFixed32Bytes(decodeBase58(to));
  const sysProg = new Uint8Array(32); // 11111111111111111111111111111111
  const bhBytes = toFixed32Bytes(decodeBase58(blockhash));

  const ixData = new Uint8Array(12);
  const view = new DataView(ixData.buffer);
  view.setUint32(0, 2, true); // SystemProgram::Transfer
  view.setBigUint64(4, BigInt(lamports), true);

  const msg = new Uint8Array(3 + 1 + 32 * 3 + 32 + 1 + 1 + 3 + 1 + 12);
  let off = 0;
  msg.set([1, 0, 1], off); off += 3;
  msg[off++] = 3;
  msg.set(fromPub, off); off += 32;
  msg.set(toPub, off); off += 32;
  msg.set(sysProg, off); off += 32;
  msg.set(bhBytes, off); off += 32;
  msg[off++] = 1;
  msg[off++] = 2;
  msg[off++] = 2;
  msg[off++] = 0;
  msg[off++] = 1;
  msg[off++] = 12;
  msg.set(ixData, off);

  // Legacy Transaction wire format with 1 empty 64-byte signature slot for wallet signAndSendTransaction
  const fullTx = new Uint8Array(1 + 64 + msg.length);
  fullTx[0] = 1;
  fullTx.set(msg, 65);

  let bin = '';
  for (let i = 0; i < fullTx.length; i++) bin += String.fromCharCode(fullTx[i]!);
  return {
    txBase64: btoa(bin),
    blockhash,
    lamports,
    amountSol: cleanSol,
  };
}

async function evaluateAiGuardForToken(
  env: Env,
  pair: DexTokenEnriched,
  safety: TokenRugSafetyReport,
  traderLabel: string
): Promise<{ approved: boolean; note: string }> {
  const m5Buys = Number(pair.txns?.m5?.buys || 0);
  const m5Sells = Number(pair.txns?.m5?.sells || 0);
  const h1Change = Number(pair.priceChange?.h1 || 0);
  const mcap = Number(pair.marketCap || pair.fdv || 0);

  if (safety.isHoneypot || safety.safetyScore < 42) {
    return { approved: false, note: `AI-Guard: ریسک بالای قرارداد (${safety.flags[0] || 'هشدار ایمنی'})` };
  }
  if (m5Sells > Math.max(8, m5Buys * 2.4) && h1Change < -15) {
    return { approved: false, note: 'AI-Guard: فشار فروش سنگین نهنگ‌ها در ۵ دقیقه اخیر' };
  }

  // Optional LLM quick check if central AI engine is active
  const ensemble = await resolveAIEnsemble(env).catch(() => null);
  const primary = ensemble?.engines?.[0];
  if (!primary) {
    const ratio = m5Buys + m5Sells > 0 ? Math.round((m5Buys / (m5Buys + m5Sells)) * 100) : 55;
    return {
      approved: true,
      note: `AI-Guard تایید کرد (امتیاز ایمنی ${safety.safetyScore}/100 · نسبت خرید ${ratio}% · MC $${Math.round(mcap).toLocaleString()})`,
    };
  }

  try {
    const prompt =
      `Token: ${pair.baseToken.symbol} (${pair.chainId}), Trader: ${traderLabel}, Safety: ${safety.safetyScore}/100, ` +
      `Liq: $${Math.round(safety.liquidityUsd)}, MCap: $${Math.round(mcap)}, 5m Buys/Sells: ${m5Buys}/${m5Sells}, 1h: ${h1Change}%. ` +
      `Flags: ${safety.flags.join('; ') || 'none'}. Reply JSON only: {"ok":true|false,"reason":"short Persian summary"}`;
    const raw = await callBYOAI(
      { ...primary, maxTokens: 140 },
      'You are an ultra-fast on-chain risk filter. Respond ONLY valid JSON {"ok":boolean,"reason":string}.',
      prompt,
      { fastJson: true }
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { ok?: boolean; reason?: string };
      return {
        approved: parsed.ok !== false,
        note: `AI-Guard: ${parsed.reason || `امتیاز ${safety.safetyScore}/100`}`,
      };
    }
  } catch {
    // non-fatal
  }
  return { approved: true, note: `AI-Guard: تایید با امتیاز ایمنی ${safety.safetyScore}/100` };
}

export async function executeSmartCopySignalForRule(
  env: Env,
  rule: CopyFollowRuleRow,
  signal: {
    chainId: string;
    tokenAddress: string;
    tokenSymbol?: string;
    tokenName?: string;
    side?: 'BUY' | 'SELL';
    traderSizeUsd?: number;
  }
): Promise<{
  ok: boolean;
  status: string;
  positionId?: string;
  message: string;
  routes?: MultiDappRoute[];
}> {
  const side = signal.side || 'BUY';

  // Handle Copy Sells: if trader sold and user enabled copy_sells, close matching open positions
  if (side === 'SELL' && rule.copy_sells) {
    const openMatch = await env.DB.prepare(
      `SELECT * FROM copy_positions_v2
       WHERE user_id = ? AND rule_id = ? AND LOWER(token_address) = LOWER(?) AND status = 'OPEN'`
    )
      .bind(rule.user_id, rule.id, signal.tokenAddress)
      .all<CopyPositionV2Row>();

    let closedCount = 0;
    for (const pos of openMatch.results) {
      await closeCopyPositionV2(env, pos, pos.current_price_usd, 'Copy Sell (فروش همراه تریدر)');
      closedCount++;
    }
    return {
      ok: true,
      status: 'COPY_SELL_EXECUTED',
      message: `${closedCount} پوزیشن همراه با فروش تریدر بسته شد.`,
    };
  }

  // 0. Check 3% server profit-fee standing before opening new LIVE copy-vault trades
  if (rule.execution_mode !== 'TRUST_ONE_CLICK') {
    const feeCheck = await checkLiveFeeEnforcement(env.DB, rule.user_id);
    if (!feeCheck.allowed) {
      return {
        ok: false,
        status: 'FEE_SETTLEMENT_REQUIRED',
        message: feeCheck.reasonFa || 'کپی‌ترید لایو تا تسویه کارمزد ۳٪ معوق قفل شده است (پوزیشن‌های باز همچنان مدیریت می‌شوند).',
      };
    }
  }

  // 1. Check daily loss limit & isolated margin availability
  if (rule.daily_loss_used_usd >= rule.daily_max_loss_usd) {
    return { ok: false, status: 'DAILY_LOSS_LIMIT', message: 'سقف ضرر روزانه این تریدر پر شده است.' };
  }

  const availableMargin = Math.max(0, Number(rule.allocated_margin_usd) - Number(rule.used_margin_usd));
  let desiredMargin = Number(rule.order_size_usd || 25);
  if (rule.sizing_mode === 'PCT_ALLOCATION') {
    desiredMargin = (Number(rule.allocated_margin_usd) * Number(rule.order_size_pct || 15)) / 100;
  } else if (rule.sizing_mode === 'PROPORTIONAL' && signal.traderSizeUsd) {
    desiredMargin = Math.min(Number(rule.order_size_usd), Math.max(10, signal.traderSizeUsd * 0.05));
  }
  desiredMargin = Number(Math.min(availableMargin, Math.max(5, desiredMargin)).toFixed(2));

  if (availableMargin < 5 || desiredMargin < 5) {
    return { ok: false, status: 'INSUFFICIENT_RULE_MARGIN', message: 'مارجین آزاد اختصاص‌یافته به این تریدر کافی نیست.' };
  }

  // 2. Check max open positions for this trader
  const openCntRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM copy_positions_v2 WHERE rule_id = ? AND status IN ('OPEN', 'PENDING_TRUST_SIGN')`
  )
    .bind(rule.id)
    .first<{ cnt: number }>();
  if (Number(openCntRow?.cnt ?? 0) >= Number(rule.max_open_positions || 4)) {
    return { ok: false, status: 'MAX_OPEN_REACHED', message: 'حداکثر تعداد پوزیشن همزمان این تریدر پر است.' };
  }

  // 3. Only New Positions filter
  if (rule.only_new_positions) {
    const alreadyOwned = await env.DB.prepare(
      `SELECT id FROM copy_positions_v2 WHERE user_id = ? AND LOWER(token_address) = LOWER(?) AND status IN ('OPEN', 'PENDING_TRUST_SIGN') LIMIT 1`
    )
      .bind(rule.user_id, signal.tokenAddress)
      .first();
    if (alreadyOwned) {
      return { ok: false, status: 'SKIPPED_DUPLICATE_TOKEN', message: 'فیلتر فقط پوزیشن جدید: این توکن هم‌اکنون باز است.' };
    }
  }

  // 4. Resolve live pair from DexScreener + Run Rug & Honeypot Scan
  const pools = await getDexTokenPools(signal.chainId, signal.tokenAddress).catch(() => []);
  const pair = pools[0] ?? (await searchDexPairs(signal.tokenAddress).catch(() => []))[0] ?? null;
  const priceUsd = Number(pair?.priceUsd || 0.0001);
  const liqUsd = Number(pair?.liquidity?.usd || 0);
  const mcap = Number(pair?.marketCap || pair?.fdv || 0);
  const tokenSym = signal.tokenSymbol || pair?.baseToken.symbol || 'TOKEN';
  const tokenName = signal.tokenName || pair?.baseToken.name || tokenSym;

  const safety = await runTokenRugAndSafetyScan(env, signal.chainId, signal.tokenAddress, pair);
  const routes = buildMultiDappRoutes(signal.chainId, signal.tokenAddress, pair?.url);
  const primaryLink = buildTrustWalletSwapLinks(signal.chainId, signal.tokenAddress, pair?.url);

  // Market cap & liquidity filters
  if (pair && rule.min_liquidity_usd > 0 && liqUsd < rule.min_liquidity_usd) {
    return { ok: false, status: 'SKIPPED_LOW_LIQ', message: `نقدینگی ($${Math.round(liqUsd)}) کمتر از حداقل مجاز است.` };
  }
  if (pair && mcap > 0 && (mcap < rule.min_mcap_usd || mcap > rule.max_mcap_usd)) {
    return { ok: false, status: 'SKIPPED_MCAP', message: `مارکت‌کپ ($${Math.round(mcap).toLocaleString()}) خارج از محدوده فیلتر است.` };
  }

  // Anti-Rug / Honeypot check
  const posId = randomId('cpos');
  if (safety.isHoneypot || safety.safetyScore < rule.min_safety_score) {
    await env.DB.prepare(
      `INSERT INTO copy_positions_v2 (
         id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name,
         token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd,
         qty_tokens, remaining_pct, safety_score, ai_guard_note, status, trust_dapp_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'SKIPPED_SAFETY', ?)`
    )
      .bind(
        posId,
        rule.user_id,
        rule.id,
        rule.trader_kind,
        rule.trader_id,
        rule.trader_label,
        rule.execution_mode,
        signal.chainId,
        primaryLink.dexName,
        signal.tokenAddress,
        tokenSym,
        tokenName,
        rule.reverse_copy ? 'SHORT' : 'BUY',
        desiredMargin,
        priceUsd,
        priceUsd,
        safety.safetyScore,
        `ضدراگ رد کرد: ${safety.flags[0] || `امتیاز ${safety.safetyScore} < ${rule.min_safety_score}`}`,
        routes[0]?.trustWalletDappUrl || primaryLink.trustWalletDappUrl
      )
      .run();

    return {
      ok: false,
      status: 'SKIPPED_SAFETY',
      positionId: posId,
      message: `فیلتر ضدراگ دلارینو خرید ${tokenSym} را رد کرد (امتیاز ${safety.safetyScore}/100).`,
    };
  }

  // Optional AI-Guard check
  let aiNote = `امتیاز ایمنی ${safety.safetyScore}/100 (${safety.sourcesUsed.join(' + ')})`;
  if (rule.ai_guard_enabled && pair) {
    const aiCheck = await evaluateAiGuardForToken(env, pair, safety, rule.trader_label);
    aiNote = aiCheck.note;
    if (!aiCheck.approved) {
      await env.DB.prepare(
        `INSERT INTO copy_positions_v2 (
           id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name,
           token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd,
           qty_tokens, remaining_pct, safety_score, ai_guard_note, status, trust_dapp_url
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'SKIPPED_AI', ?)`
      )
        .bind(
          posId,
          rule.user_id,
          rule.id,
          rule.trader_kind,
          rule.trader_id,
          rule.trader_label,
          rule.execution_mode,
          signal.chainId,
          primaryLink.dexName,
          signal.tokenAddress,
          tokenSym,
          tokenName,
          rule.reverse_copy ? 'SHORT' : 'BUY',
          desiredMargin,
          priceUsd,
          priceUsd,
          safety.safetyScore,
          aiNote,
          routes[0]?.trustWalletDappUrl || primaryLink.trustWalletDappUrl
        )
        .run();

      return { ok: false, status: 'SKIPPED_AI', positionId: posId, message: aiNote };
    }
  }

  const qtyTokens = priceUsd > 0 ? desiredMargin / priceUsd : 0;
  const isOneClickTrust = rule.execution_mode === 'TRUST_ONE_CLICK';
  const nextStatus: CopyPositionV2Row['status'] = isOneClickTrust ? 'PENDING_TRUST_SIGN' : 'OPEN';
  let txHash: string | null = null;

  if (!isOneClickTrust) {
    if (signal.chainId.toLowerCase() === 'solana' && !rule.reverse_copy) {
      const liveSwap = await executeLiveSolanaVaultJupiterSwap(
        env,
        rule.user_id,
        signal.tokenAddress,
        desiredMargin,
        Number(rule.max_slippage_pct || 15) * 100
      );
      txHash = liveSwap.txHash;
      aiNote = `${aiNote} | ${liveSwap.note}`;
    } else if (!rule.reverse_copy && EVM_CHAIN_CONFIG[signal.chainId.toLowerCase()]) {
      const evmSwap = await executeLiveEvmVaultSwap(
        env,
        rule.user_id,
        signal.chainId,
        signal.tokenAddress,
        desiredMargin,
        Number(rule.max_slippage_pct || 10)
      );
      txHash = evmSwap.txHash;
      aiNote = `${aiNote} | ${evmSwap.note}`;
    } else {
      aiNote = `${aiNote} | رصد خودکار خزانه با قیمت لحظه‌ای DexScreener`;
    }
  }

  const dappUrl = routes[0]?.trustWalletDappUrl || primaryLink.trustWalletDappUrl;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO copy_positions_v2 (
         id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name,
         token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd,
         qty_tokens, remaining_pct, safety_score, ai_guard_note, status, trust_dapp_url, tx_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?)`
    ).bind(
      posId,
      rule.user_id,
      rule.id,
      rule.trader_kind,
      rule.trader_id,
      rule.trader_label,
      rule.execution_mode,
      signal.chainId,
      primaryLink.dexName,
      signal.tokenAddress,
      tokenSym,
      tokenName,
      rule.reverse_copy ? 'SHORT' : 'BUY',
      desiredMargin,
      priceUsd,
      priceUsd,
      qtyTokens,
      safety.safetyScore,
      aiNote,
      nextStatus,
      dappUrl,
      txHash
    ),
    env.DB.prepare(
      `UPDATE copy_follow_rules SET used_margin_usd = used_margin_usd + ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(desiredMargin, rule.id),
  ]);

  // Send in-app notification & Telegram push if user linked Telegram
  await env.DB.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, body)
     VALUES (?, ?, 'COPY_TRADE', ?, ?)`
  )
    .bind(
      randomId('ntf'),
      rule.user_id,
      isOneClickTrust
        ? `🐋 سیگنال آماده امضا در Trust Wallet: ${tokenSym}`
        : `⚡ کپی‌ترید خودکار انجام شد: ${tokenSym}`,
      `تریدر ${rule.trader_label} روی ${signal.chainId.toUpperCase()} وارد ${tokenSym} شد ($${desiredMargin}). ${aiNote}`
    )
    .run()
    .catch(() => {});

  const tgUser = await env.DB.prepare(`SELECT telegram_id FROM users WHERE id = ? LIMIT 1`)
    .bind(rule.user_id)
    .first<{ telegram_id: string | null }>()
    .catch(() => null);

  const botToken = tgUser?.telegram_id ? await resolveTelegramBotToken(env) : '';
  if (tgUser?.telegram_id && botToken) {
    const tgClient = new TelegramBotClient(botToken);
    const msg =
      `${isOneClickTrust ? '🐋 **سیگنال کپی‌ترید آماده امضا در Trust Wallet**' : '⚡ **کپی‌ترید خودکار انجام شد**'}\n\n` +
      `👤 تریدر: **${rule.trader_label}**\n` +
      `🪙 توکن: **${tokenSym}** (${signal.chainId.toUpperCase()})\n` +
      `💵 مارجین اختصاصی: **$${desiredMargin}** | اسلیپیج مجاز: **${rule.max_slippage_pct}%**\n` +
      `🛡 امنیت ضدراگ: **${safety.safetyScore}/100** (${safety.verdict})\n` +
      `🎯 تنظیمات خروج: TP1 +${rule.tp1_pct}% | TP2 +${rule.tp2_pct}% | SL -${rule.stop_loss_pct}%\n` +
      `🤖 ${aiNote}`;

    const inlineKeyboard = isOneClickTrust
      ? [
          [{ text: `🦊 خرید سریع در ${primaryLink.dexName}`, url: dappUrl }],
          [
            { text: '✅ ثبت شد (تایید ورود)', callback_data: `cpos_act:${posId}:CONFIRM` },
            { text: '❌ رد کردن', callback_data: `cpos_act:${posId}:DISMISS` },
          ],
        ]
      : [
          [{ text: `📊 مشاهده در DexScreener`, url: primaryLink.dexScreenerUrl }],
          [{ text: '💸 فروش اضطراری ۱۰۰٪', callback_data: `cpos_act:${posId}:SELL100` }],
        ];

    await tgClient.sendMessage(tgUser.telegram_id, msg, { inlineKeyboard }).catch(() => {});
  }

  return {
    ok: true,
    status: nextStatus,
    positionId: posId,
    message: isOneClickTrust
      ? `سفارش آماده امضای Trust Wallet برای ${tokenSym} ساخته شد و در وب/تلگرام ارسال گردید.`
      : `پوزیشن ${tokenSym} به مبلغ $${desiredMargin} با موفقیت کپی شد.`,
    routes,
  };
}

export async function closeCopyPositionV2(
  env: Env,
  pos: CopyPositionV2Row,
  exitPriceUsd: number,
  reason: string
): Promise<void> {
  const entry = Math.max(1e-12, Number(pos.entry_price_usd));
  const rawPct = ((exitPriceUsd - entry) / entry) * 100;
  const dirPct = pos.direction === 'SHORT' ? -rawPct : rawPct;
  const finalUsd = (Number(pos.margin_usd) * (Number(pos.remaining_pct) / 100) * dirPct) / 100 + Number(pos.pnl_usd || 0);
  const lossIncrement = finalUsd < 0 ? Math.abs(finalUsd) : 0;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE copy_positions_v2
       SET current_price_usd = ?, pnl_pct = ?, pnl_usd = ?, remaining_pct = 0, status = 'CLOSED',
           ai_guard_note = COALESCE(ai_guard_note, '') || ' | ' || ?, closed_at = datetime('now')
       WHERE id = ?`
    ).bind(exitPriceUsd, Number(dirPct.toFixed(2)), Number(finalUsd.toFixed(2)), reason, pos.id),
    env.DB.prepare(
      `UPDATE copy_follow_rules
       SET used_margin_usd = MAX(0, used_margin_usd - ?),
           daily_loss_used_usd = daily_loss_used_usd + ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).bind(pos.margin_usd, Number(lossIncrement.toFixed(2)), pos.rule_id),
  ]);

  await recordProfitShareServerFee(env.DB, {
    userId: pos.user_id,
    tradeId: pos.id,
    source: 'COPY_V2_LIVE',
    symbol: pos.token_symbol,
    mode: pos.execution_mode === 'PAPER_SIMULATOR' ? 'PAPER' : 'LIVE',
    realizedPnlUsd: finalUsd,
    tradeAmountUsd: Number(pos.margin_usd || 0),
  }).catch(() => {});
}

export async function reconcileCopyPositionsV2(env: Env, userId?: string): Promise<number> {
  const query = userId
    ? `SELECT p.*, r.tp1_pct, r.tp1_sell_pct, r.tp2_pct, r.tp2_sell_pct, r.tp3_pct, r.moonbag_pct,
              r.stop_loss_pct, r.trailing_activate_pct, r.trailing_drop_pct, r.break_even_pct, r.time_limit_hours, r.dev_sell_auto_exit
       FROM copy_positions_v2 p
       JOIN copy_follow_rules r ON r.id = p.rule_id
       WHERE p.user_id = ? AND p.status = 'OPEN' LIMIT 40`
    : `SELECT p.*, r.tp1_pct, r.tp1_sell_pct, r.tp2_pct, r.tp2_sell_pct, r.tp3_pct, r.moonbag_pct,
              r.stop_loss_pct, r.trailing_activate_pct, r.trailing_drop_pct, r.break_even_pct, r.time_limit_hours, r.dev_sell_auto_exit
       FROM copy_positions_v2 p
       JOIN copy_follow_rules r ON r.id = p.rule_id
       WHERE p.status = 'OPEN' LIMIT 40`;

  const res = await (userId ? env.DB.prepare(query).bind(userId) : env.DB.prepare(query))
    .all<
      CopyPositionV2Row & {
        tp1_pct: number;
        tp1_sell_pct: number;
        tp2_pct: number;
        tp2_sell_pct: number;
        tp3_pct: number;
        moonbag_pct: number;
        stop_loss_pct: number;
        trailing_activate_pct: number;
        trailing_drop_pct: number;
        break_even_pct: number;
        time_limit_hours: number;
        dev_sell_auto_exit: number;
      }
    >()
    .catch(() => ({ results: [] }));

  if (!res.results.length) return 0;

  let updated = 0;
  for (const pos of res.results) {
    const pools = await getDexTokenPools(pos.chain_id, pos.token_address).catch(() => []);
    const primaryPool = pools[0];
    const livePrice = Number(primaryPool?.priceUsd || pos.current_price_usd);
    if (!Number.isFinite(livePrice) || livePrice <= 0) continue;

    const entry = Math.max(1e-12, Number(pos.entry_price_usd));
    const rawPct = ((livePrice - entry) / entry) * 100;
    const pnlPct = pos.direction === 'SHORT' ? -rawPct : rawPct;
    const peakPct = Math.max(Number(pos.peak_pnl_pct || 0), pnlPct);

    // Check Dev-Sell / Liquidity Dump Emergency Auto-Exit
    if (pos.dev_sell_auto_exit && primaryPool) {
      const m5B = Number(primaryPool.txns?.m5?.buys || 0);
      const m5S = Number(primaryPool.txns?.m5?.sells || 0);
      const liqUsd = Number(primaryPool.liquidity?.usd || 0);
      if ((liqUsd > 0 && liqUsd < 2000) || (m5S >= 18 && m5S > m5B * 4.5 && pnlPct < -8)) {
        await closeCopyPositionV2(
          env,
          pos,
          livePrice,
          'Dev-Sell / Dump Guard Emergency Exit'
        );
        updated++;
        continue;
      }
    }

    // Check Stop Loss or Break-Even
    const effectiveSl = pos.tp1_hit || peakPct >= pos.break_even_pct ? 0.5 : -pos.stop_loss_pct;
    if (pnlPct <= effectiveSl) {
      await closeCopyPositionV2(
        env,
        pos,
        livePrice,
        effectiveSl > 0 ? 'Break-Even Risk-Free Exit' : `Stop Loss (-${pos.stop_loss_pct}%)`
      );
      updated++;
      continue;
    }

    // Check Trailing Stop
    if (peakPct >= pos.trailing_activate_pct && pnlPct <= peakPct - pos.trailing_drop_pct) {
      await closeCopyPositionV2(env, pos, livePrice, `Trailing Stop (+${pnlPct.toFixed(1)}%)`);
      updated++;
      continue;
    }

    // Check Time Limit
    const ageHours = (Date.now() - Date.parse(pos.opened_at)) / 3600_000;
    if (pos.time_limit_hours > 0 && ageHours >= pos.time_limit_hours && pnlPct < pos.tp1_pct) {
      await closeCopyPositionV2(env, pos, livePrice, `Time Limit (${pos.time_limit_hours}h)`);
      updated++;
      continue;
    }

    // Tiered TP1 / TP2 / TP3 (preserving Moonbag %)
    let rem = Number(pos.remaining_pct);
    let realizedUsd = Number(pos.pnl_usd);
    let tp1Hit = pos.tp1_hit;
    let tp2Hit = pos.tp2_hit;
    let tp3Hit = pos.tp3_hit;

    if (!tp1Hit && pnlPct >= pos.tp1_pct) {
      const sellFrac = Math.min(rem - pos.moonbag_pct, pos.tp1_sell_pct);
      if (sellFrac > 0) {
        realizedUsd += (pos.margin_usd * (sellFrac / 100) * pnlPct) / 100;
        rem -= sellFrac;
      }
      tp1Hit = 1;
    }
    if (!tp2Hit && pnlPct >= pos.tp2_pct) {
      const sellFrac = Math.min(rem - pos.moonbag_pct, pos.tp2_sell_pct);
      if (sellFrac > 0) {
        realizedUsd += (pos.margin_usd * (sellFrac / 100) * pnlPct) / 100;
        rem -= sellFrac;
      }
      tp2Hit = 1;
    }
    if (!tp3Hit && pnlPct >= pos.tp3_pct) {
      const sellFrac = Math.max(0, rem - pos.moonbag_pct);
      if (sellFrac > 0) {
        realizedUsd += (pos.margin_usd * (sellFrac / 100) * pnlPct) / 100;
        rem -= sellFrac;
      }
      tp3Hit = 1;
      if (rem <= 0.5) {
        await closeCopyPositionV2(env, pos, livePrice, 'TP3 Full Target');
        updated++;
        continue;
      }
    }

    await env.DB.prepare(
      `UPDATE copy_positions_v2
       SET current_price_usd = ?, pnl_pct = ?, peak_pnl_pct = ?, pnl_usd = ?,
           remaining_pct = ?, tp1_hit = ?, tp2_hit = ?, tp3_hit = ?
       WHERE id = ?`
    )
      .bind(
        livePrice,
        Number(pnlPct.toFixed(2)),
        Number(peakPct.toFixed(2)),
        Number(realizedUsd.toFixed(2)),
        Number(rem.toFixed(1)),
        tp1Hit,
        tp2Hit,
        tp3Hit,
        pos.id
      )
      .run();
    updated++;
  }

  return updated;
}

const SOLANA_WSOL = 'So11111111111111111111111111111111111111112';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

async function fetchLatestWalletActivity(
  env: Env,
  trader: SmartWalletTraderRow
): Promise<{ txHash: string; tokenAddress: string; tokenSymbol?: string; side: 'BUY' | 'SELL' } | null> {
  const ch = (trader.chain_id || '').toLowerCase();
  const addr = trader.wallet_address.trim();

  if (ch === 'solana') {
    // 1) Try Helius Enhanced Transactions if admin configured Helius key
    const helius = await resolveOnchainApiKey(env, 'helius').catch(() => ({ apiKey: null, isActive: false }));
    if (helius.isActive && helius.apiKey) {
      const hRes = await fetch(
        `https://api.helius.xyz/v0/addresses/${encodeURIComponent(addr)}/transactions?api-key=${encodeURIComponent(helius.apiKey)}&limit=5`,
        { signal: AbortSignal.timeout(5000) }
      ).catch(() => null);
      if (hRes?.ok) {
        const txs = (await hRes.json().catch(() => [])) as Array<{
          signature?: string;
          type?: string;
          tokenTransfers?: Array<{ mint?: string; toUserAccount?: string; fromUserAccount?: string }>;
        }>;
        for (const tx of txs) {
          if (!tx.signature) continue;
          const incoming = (tx.tokenTransfers || []).find(
            (t) => t.toUserAccount === addr && t.mint && ![SOLANA_WSOL, SOLANA_USDC, SOLANA_USDT].includes(t.mint)
          );
          if (incoming?.mint) return { txHash: tx.signature, tokenAddress: incoming.mint, side: 'BUY' };
          const outgoing = (tx.tokenTransfers || []).find(
            (t) => t.fromUserAccount === addr && t.mint && ![SOLANA_WSOL, SOLANA_USDC, SOLANA_USDT].includes(t.mint)
          );
          if (outgoing?.mint) return { txHash: tx.signature, tokenAddress: outgoing.mint, side: 'SELL' };
          return { txHash: tx.signature, tokenAddress: '', side: 'BUY' };
        }
      }
    }

    // 2) Keyless Solana Mainnet RPC fallback (getSignaturesForAddress + getTransaction)
    const sigRes = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [addr, { limit: 2 }] }),
      signal: AbortSignal.timeout(4500),
    }).catch(() => null);
    if (!sigRes?.ok) return null;
    const sigJson = (await sigRes.json().catch(() => ({}))) as { result?: Array<{ signature?: string; err?: unknown }> };
    const latestSig = (sigJson.result || []).find((s) => s.signature && !s.err)?.signature;
    if (!latestSig) return null;
    if (latestSig === trader.last_seen_tx_hash) return { txHash: latestSig, tokenAddress: '', side: 'BUY' };

    const txRes = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [latestSig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!txRes?.ok) return { txHash: latestSig, tokenAddress: '', side: 'BUY' };
    const txJson = (await txRes.json().catch(() => ({}))) as {
      result?: {
        meta?: {
          preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number } }>;
          postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number } }>;
        };
      };
    };
    const post = txJson.result?.meta?.postTokenBalances || [];
    const pre = txJson.result?.meta?.preTokenBalances || [];
    for (const p of post) {
      if (p.owner !== addr || !p.mint || [SOLANA_WSOL, SOLANA_USDC, SOLANA_USDT].includes(p.mint)) continue;
      const beforeAmt = pre.find((b) => b.owner === addr && b.mint === p.mint)?.uiTokenAmount?.uiAmount ?? 0;
      const afterAmt = p.uiTokenAmount?.uiAmount ?? 0;
      if (afterAmt > beforeAmt) return { txHash: latestSig, tokenAddress: p.mint, side: 'BUY' };
      if (afterAmt < beforeAmt) return { txHash: latestSig, tokenAddress: p.mint, side: 'SELL' };
    }
    return { txHash: latestSig, tokenAddress: '', side: 'BUY' };
  }

  if (ch === 'tron') {
    const trRes = await fetch(
      `https://apilist.tronscanapi.com/api/transfer/trc20?toAddress=${encodeURIComponent(addr)}&limit=3`,
      { signal: AbortSignal.timeout(4500) }
    ).catch(() => null);
    if (!trRes?.ok) return null;
    const tj = (await trRes.json().catch(() => ({}))) as {
      data?: Array<{ hash?: string; contract_address?: string; tokenName?: string }>;
    };
    const hit = tj.data?.find((d) => d.hash && d.contract_address && d.contract_address !== 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    if (hit?.hash && hit.contract_address) {
      return { txHash: hit.hash, tokenAddress: hit.contract_address, tokenSymbol: hit.tokenName, side: 'BUY' };
    }
    return null;
  }

  if (ch === 'ton') {
    const tonRes = await fetch(
      `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(addr)}&limit=2`,
      { signal: AbortSignal.timeout(4500) }
    ).catch(() => null);
    if (!tonRes?.ok) return null;
    const j = (await tonRes.json().catch(() => ({}))) as {
      result?: Array<{ transaction_id?: { hash?: string } }>;
    };
    const hash = j.result?.[0]?.transaction_id?.hash;
    return hash ? { txHash: hash, tokenAddress: '', side: 'BUY' } : null;
  }

  // EVM chains via Moralis if configured
  const mChain = MORALIS_CHAIN_MAP[ch];
  if (mChain) {
    const moralis = await resolveOnchainApiKey(env, 'moralis').catch(() => ({ apiKey: null, isActive: false }));
    if (moralis.isActive && moralis.apiKey) {
      const mRes = await fetch(
        `https://deep-index.moralis.io/api/v2.2/wallets/${encodeURIComponent(addr)}/history?chain=${mChain}&limit=5`,
        { headers: { 'X-API-Key': moralis.apiKey }, signal: AbortSignal.timeout(5000) }
      ).catch(() => null);
      if (mRes?.ok) {
        const mj = (await mRes.json().catch(() => ({}))) as {
          result?: Array<{
            hash?: string;
            category?: string;
            erc20_transfers?: Array<{ token_symbol?: string; address?: string; to_address?: string; from_address?: string }>;
          }>;
        };
        for (const tx of mj.result || []) {
          if (!tx.hash) continue;
          const buyHit = (tx.erc20_transfers || []).find(
            (e) => e.address && e.to_address?.toLowerCase() === addr.toLowerCase() && !/^(USDT|USDC|WBNB|WETH)$/i.test(e.token_symbol || '')
          );
          if (buyHit?.address) {
            return { txHash: tx.hash, tokenAddress: buyHit.address, tokenSymbol: buyHit.token_symbol, side: 'BUY' };
          }
          const sellHit = (tx.erc20_transfers || []).find(
            (e) => e.address && e.from_address?.toLowerCase() === addr.toLowerCase() && !/^(USDT|USDC|WBNB|WETH)$/i.test(e.token_symbol || '')
          );
          if (sellHit?.address) {
            return { txHash: tx.hash, tokenAddress: sellHit.address, tokenSymbol: sellHit.token_symbol, side: 'SELL' };
          }
          return { txHash: tx.hash, tokenAddress: '', side: 'BUY' };
        }
      }
    }

    // Keyless Blockscout V2 API fallback for EVM chains (ETH, Base, Arbitrum, Optimism, Polygon)
    const BLOCKSCOUT_HOSTS: Record<string, string> = {
      ethereum: 'https://eth.blockscout.com',
      base: 'https://base.blockscout.com',
      optimism: 'https://optimism.blockscout.com',
      arbitrum: 'https://arbitrum.blockscout.com',
      polygon: 'https://polygon.blockscout.com',
    };
    const bsHost = BLOCKSCOUT_HOSTS[ch];
    if (bsHost) {
      const bsRes = await fetch(
        `${bsHost}/api/v2/addresses/${encodeURIComponent(addr)}/token-transfers?type=ERC-20`,
        { signal: AbortSignal.timeout(4500) }
      ).catch(() => null);
      if (bsRes?.ok) {
        const bj = (await bsRes.json().catch(() => ({}))) as {
          items?: Array<{
            tx_hash?: string;
            to?: { hash?: string };
            from?: { hash?: string };
            token?: { address?: string; symbol?: string };
          }>;
        };
        for (const it of (bj.items || []).slice(0, 5)) {
          if (!it.tx_hash || !it.token?.address) continue;
          if (/^(USDT|USDC|WETH|WMATIC|DAI|USDbC)$/i.test(it.token.symbol || '')) continue;
          const isBuy = it.to?.hash?.toLowerCase() === addr.toLowerCase();
          return {
            txHash: it.tx_hash,
            tokenAddress: it.token.address,
            tokenSymbol: it.token.symbol,
            side: isBuy ? 'BUY' : 'SELL',
          };
        }
      }
    }
  }
  return null;
}

export async function baselineWalletTxIfEmpty(env: Env, traderId: string): Promise<void> {
  const trader = await env.DB.prepare(`SELECT * FROM smart_wallet_traders WHERE id = ? LIMIT 1`)
    .bind(traderId)
    .first<SmartWalletTraderRow>()
    .catch(() => null);
  if (!trader || trader.last_seen_tx_hash) return;
  const latest = await fetchLatestWalletActivity(env, trader).catch(() => null);
  if (latest?.txHash) {
    await env.DB.prepare(
      `UPDATE smart_wallet_traders SET last_seen_tx_hash = ?, last_synced_at = datetime('now') WHERE id = ?`
    )
      .bind(latest.txHash, trader.id)
      .run()
      .catch(() => {});
  }
}

export async function pollWatchedWalletsForNewTrades(env: Env): Promise<{ checked: number; triggered: number }> {
  const watched = await env.DB.prepare(
    `SELECT DISTINCT t.*
     FROM smart_wallet_traders t
     JOIN copy_follow_rules r ON r.trader_id = t.id
     WHERE r.is_active = 1 AND r.trader_kind = 'SMART_WALLET' AND t.is_active = 1
     LIMIT 12`
  )
    .all<SmartWalletTraderRow>()
    .catch(() => ({ results: [] as SmartWalletTraderRow[] }));

  if (!watched.results.length) return { checked: 0, triggered: 0 };

  let checked = 0;
  let triggered = 0;

  for (const trader of watched.results) {
    checked++;
    const activity = await fetchLatestWalletActivity(env, trader).catch(() => null);
    if (!activity?.txHash) continue;

    // First sync: record baseline txHash so ONLY trades opened FROM THIS MOMENT ONWARD are copied
    if (!trader.last_seen_tx_hash) {
      await env.DB.prepare(
        `UPDATE smart_wallet_traders SET last_seen_tx_hash = ?, last_synced_at = datetime('now') WHERE id = ?`
      )
        .bind(activity.txHash, trader.id)
        .run()
        .catch(() => {});
      continue;
    }

    if (activity.txHash === trader.last_seen_tx_hash) continue;

    await env.DB.prepare(
      `UPDATE smart_wallet_traders SET last_seen_tx_hash = ?, last_synced_at = datetime('now') WHERE id = ?`
    )
      .bind(activity.txHash, trader.id)
      .run()
      .catch(() => {});

    if (!activity.tokenAddress) continue;

    const followers = await env.DB.prepare(
      `SELECT * FROM copy_follow_rules
       WHERE trader_id = ? AND trader_kind = 'SMART_WALLET' AND is_active = 1`
    )
      .bind(trader.id)
      .all<CopyFollowRuleRow>()
      .catch(() => ({ results: [] as CopyFollowRuleRow[] }));

    for (const rule of followers.results) {
      const exec = await executeSmartCopySignalForRule(env, rule, {
        chainId: trader.chain_id,
        tokenAddress: activity.tokenAddress,
        tokenSymbol: activity.tokenSymbol,
        side: activity.side,
      }).catch(() => ({ ok: false }));
      if (exec.ok) triggered++;
    }
  }

  return { checked, triggered };
}

