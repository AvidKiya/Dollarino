import { Hono } from 'hono';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { ensureUserDefaults, requireAuth } from '../auth.js';
import { randomId } from '../crypto.js';
import { buildTrustWalletSwapLinks, getDexTokenPools } from '../dex/screener.js';
import {
  buildUnsignedSolanaTransferTx,
  ensureUserCopyVault,
  estimateSolPriceUsd,
} from '../dex/smart-copy.js';
import type { AuthUser, Env } from '../env.js';
import { checkLiveFeeEnforcement, recordProfitShareServerFee } from '../services/server-fee.js';
import { invalidateLiveTicksCache } from './trading.js';
import { getCachedSystemSetting } from '../services/settings-cache.js';

export const trustWalletRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

trustWalletRoutes.use('*', requireAuth);

function hexToBytesStrict(hex: string): Uint8Array | null {
  const clean = hex.trim().replace(/^0x/i, '');
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHexLower(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function verifyEip191PersonalSign(
  message: string,
  signatureHex: string,
  expectedEvmAddress: string
): boolean {
  if (!message || !isValidEvm(expectedEvmAddress)) return false;
  const rawSig = hexToBytesStrict(signatureHex);
  if (!rawSig || rawSig.length !== 65) return false;

  const r = rawSig.slice(0, 32);
  const s = rawSig.slice(32, 64);
  const vRaw = rawSig[64]!;
  let recovery = -1;
  if (vRaw === 27 || vRaw === 0) recovery = 0;
  else if (vRaw === 28 || vRaw === 1) recovery = 1;
  else if (vRaw >= 35) recovery = (vRaw - 35) % 2;
  if (recovery !== 0 && recovery !== 1) return false;

  try {
    const recoveredSig = new Uint8Array(65);
    recoveredSig[0] = recovery;
    recoveredSig.set(r, 1);
    recoveredSig.set(s, 33);

    const enc = new TextEncoder();
    const msgBytes = enc.encode(message);
    const prefixBytes = enc.encode(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
    const prefixed = new Uint8Array(prefixBytes.length + msgBytes.length);
    prefixed.set(prefixBytes, 0);
    prefixed.set(msgBytes, prefixBytes.length);
    const digest = keccak_256(prefixed);

    const pubCompressed = secp256k1.recoverPublicKey(recoveredSig, digest, { prehash: false });
    const pubUncompressed = secp256k1.Point.fromBytes(pubCompressed).toBytes(false);
    const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(-20);
    const recoveredAddress = '0x' + bytesToHexLower(addrBytes);
    return recoveredAddress.toLowerCase() === expectedEvmAddress.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function isValidEvm(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export function isValidTron(addr: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr.trim());
}

export function isValidSolana(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim()) && !addr.trim().startsWith('0x');
}

export function isValidTon(addr: string): boolean {
  const clean = addr.trim();
  return /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(clean) || /^0:[a-fA-F0-9]{64}$/.test(clean);
}

export async function fetchSolanaBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { value?: number } };
    if (typeof j.result?.value !== 'number') return null;
    return j.result.value / 1e9;
  } catch {
    return null;
  }
}

export async function fetchTonBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok?: boolean; result?: string };
    if (!j.ok || !j.result) return null;
    return Number(j.result) / 1e9;
  } catch {
    return null;
  }
}

export async function fetchEvmNativeBalance(rpcUrl: string, address: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: string };
    if (!j.result) return null;
    return Number(BigInt(j.result)) / 1e18;
  } catch {
    return null;
  }
}

export async function fetchBscUsdtBalance(address: string): Promise<number | null> {
  try {
    // BEP20 USDT contract: 0x55d398326f99059fF775485246999027B3197955, balanceOf(address) selector 0x70a08231
    const clean = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const res = await fetch('https://bsc-dataseed.binance.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: '0x55d398326f99059fF775485246999027B3197955', data: `0x70a08231${clean}` }, 'latest'],
      }),
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: string };
    if (!j.result || j.result === '0x') return 0;
    return Number(BigInt(j.result)) / 1e18;
  } catch {
    return null;
  }
}

export async function fetchTronBalances(address: string): Promise<{ trx: number; usdt: number } | null> {
  try {
    const res = await fetch(`https://apilist.tronscanapi.com/api/accountv2?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balance?: number;
      withPriceTokens?: Array<{ tokenAbbr?: string; tokenId?: string; balance?: string; tokenDecimal?: number }>;
    };
    const trx = Number(data.balance || 0) / 1e6;
    const usdtRow = (data.withPriceTokens || []).find(
      (t) => t.tokenId === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' || String(t.tokenAbbr).toUpperCase() === 'USDT'
    );
    const usdt = usdtRow ? Number(usdtRow.balance || 0) / 10 ** (usdtRow.tokenDecimal ?? 6) : 0;
    return { trx, usdt };
  } catch {
    return null;
  }
}

trustWalletRoutes.get('/status', async (c) => {
  const user = c.get('user');
  const [u, trades, settingsRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified, trust_wallet_connected_at, phone_number, phone_verified
       FROM users WHERE id = ?`
    ).bind(user.id).first<{
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      trust_wallet_verified: number;
      trust_wallet_connected_at: string | null;
      phone_number: string | null;
      phone_verified: number;
    }>(),
    c.env.DB.prepare(`SELECT * FROM dex_trades WHERE user_id = ? ORDER BY opened_at DESC LIMIT 60`).bind(user.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT key, value FROM system_settings WHERE key IN ('usdt_trc20_wallet', 'trust_wallet_evm_receiver', 'trust_wallet_sol_receiver', 'trust_wallet_ton_receiver')`
    ).all<{ key: string; value: string }>(),
  ]);

  const receivers: Record<string, string> = {};
  for (const r of settingsRows.results) {
    const v = String(r.value || '').trim();
    receivers[r.key] = /YourTRC20WalletAddress|^0xYour/i.test(v) ? '' : v;
  }

  const publicUrl = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  const trustDappOpenUrl = `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(publicUrl)}`;

  return c.json({
    ok: true,
    connected: Boolean(u?.trust_wallet_address || u?.trust_wallet_tron || u?.trust_wallet_solana || u?.trust_wallet_ton),
    wallet: {
      evmAddress: u?.trust_wallet_address ?? null,
      tronAddress: u?.trust_wallet_tron ?? null,
      solanaAddress: u?.trust_wallet_solana ?? null,
      tonAddress: u?.trust_wallet_ton ?? null,
      verified: Boolean(u?.trust_wallet_verified),
      connectedAt: u?.trust_wallet_connected_at ?? null,
    },
    phoneVerified: Boolean(u?.phone_verified),
    phoneNumber: u?.phone_number ?? null,
    trustDappOpenUrl,
    platformReceivers: {
      trc20: receivers.usdt_trc20_wallet || '',
      evm: receivers.trust_wallet_evm_receiver || '',
      solana: receivers.trust_wallet_sol_receiver || '',
      ton: receivers.trust_wallet_ton_receiver || '',
    },
    trades: trades.results,
  });
});

trustWalletRoutes.post('/nonce', async (c) => {
  const user = c.get('user');
  const nonce = randomId('tw');
  const message = `Dollarino Trust Wallet Verification\nUser: ${user.username}\nNonce: ${nonce}\nNote: Read-only & non-custodial ownership check. No funds move.`;
  await c.env.DB.prepare(
    `DELETE FROM trust_wallet_nonces WHERE user_id = ? AND (used = 1 OR expires_at <= datetime('now'))`
  )
    .bind(user.id)
    .run()
    .catch(() => {});
  await c.env.DB.prepare(
    `INSERT INTO trust_wallet_nonces (nonce, user_id, message, purpose, used, expires_at)
     VALUES (?, ?, ?, 'CONNECT', 0, datetime('now', '+5 minutes'))`
  )
    .bind(nonce, user.id, message)
    .run();
  return c.json({ ok: true, nonce, message, expiresInSeconds: 300 });
});

trustWalletRoutes.post('/dapp-handoff', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { origin?: string; coinId?: number };
  let base = (c.env.PUBLIC_WEB_URL || 'https://dollarino.pages.dev').replace(/\/$/, '');
  if (body.origin) {
    try {
      const parsed = new URL(body.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        base = parsed.origin;
      }
    } catch {
      // fall back to PUBLIC_WEB_URL
    }
  }

  const handoffToken = `twlink_${randomId('tw')}_${Math.random().toString(36).slice(2, 10)}`;
  await c.env.DB.prepare(
    `UPDATE users SET web_magic_token = ?, web_magic_expires_at = datetime('now', '+10 minutes') WHERE id = ?`
  )
    .bind(handoffToken, user.id)
    .run();

  const coinId = typeof body.coinId === 'number' && Number.isFinite(body.coinId) ? Math.floor(body.coinId) : 20000714;
  const targetUrl = `${base}/?tg_login=${encodeURIComponent(handoffToken)}&tw_autoconnect=1&tab=dex`;
  const universalLink = `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;
  const deepLink = `trust://open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;

  return c.json({
    ok: true,
    targetUrl,
    universalLink,
    deepLink,
    expiresInSeconds: 600,
  });
});

trustWalletRoutes.post('/connect', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    evmAddress?: string;
    tronAddress?: string;
    solanaAddress?: string;
    tonAddress?: string;
    signature?: string;
    signedMessage?: string;
  };

  const evm = body.evmAddress?.trim() || null;
  const tron = body.tronAddress?.trim() || null;
  const sol = body.solanaAddress?.trim() || null;
  const ton = body.tonAddress?.trim() || null;

  if (!evm && !tron && !sol && !ton) {
    return c.json({ error: 'حداقل یک آدرس معتبر کیف‌پول (EVM / Solana / TON / TRON) وارد یا متصل کنید.' }, 400);
  }
  if (evm && !isValidEvm(evm)) {
    return c.json({ error: 'فرمت آدرس EVM (ETH/BSC/Base/Arbitrum/Polygon) نامعتبر است؛ باید با 0x و ۴۲ کاراکتر باشد.' }, 400);
  }
  if (tron && !isValidTron(tron)) {
    return c.json({ error: 'فرمت آدرس TRON (TRC20) نامعتبر است؛ باید با T و ۳۴ کاراکتر باشد.' }, 400);
  }
  if (sol && !isValidSolana(sol)) {
    return c.json({ error: 'فرمت آدرس Solana نامعتبر است.' }, 400);
  }
  if (ton && !isValidTon(ton)) {
    return c.json({ error: 'فرمت آدرس TON نامعتبر است (باید با EQ یا UQ شروع شود).' }, 400);
  }

  const signature = body.signature?.trim() || '';
  let verified = 0;

  if (signature) {
    if (!evm) {
      return c.json({ error: 'برای تایید رمزنگاری امضای کیف‌پول (EIP-191)، آدرس EVM معتبر الزامی است.' }, 400);
    }
    const signedMsg = body.signedMessage?.trim() || '';
    const nonceRow = signedMsg
      ? await c.env.DB.prepare(
          `SELECT nonce, message, used FROM trust_wallet_nonces
           WHERE user_id = ? AND message = ? AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1`
        )
          .bind(user.id, signedMsg)
          .first<{ nonce: string; message: string; used: number }>()
      : await c.env.DB.prepare(
          `SELECT nonce, message, used FROM trust_wallet_nonces
           WHERE user_id = ? AND used = 0 AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1`
        )
          .bind(user.id)
          .first<{ nonce: string; message: string; used: number }>();

    if (!nonceRow || nonceRow.used === 1) {
      return c.json(
        { error: 'کد یک‌بارمصرف تایید مالکیت (Nonce) یافت نشد، منقضی شده یا قبلاً استفاده شده است. لطفاً دوباره روی دکمه امضا کلیک کنید.' },
        401
      );
    }

    const sigValid = verifyEip191PersonalSign(nonceRow.message, signature, evm);
    if (!sigValid) {
      return c.json({ error: 'امضای کیف‌پول با آدرس EVM مطابقت ندارد و تایید نشد (ECDSA mismatch).' }, 401);
    }

    await c.env.DB.prepare(
      `UPDATE trust_wallet_nonces SET used = 1 WHERE nonce = ? AND used = 0`
    )
      .bind(nonceRow.nonce)
      .run();
    verified = 1;
  }

  await c.env.DB.prepare(
    `UPDATE users SET
      trust_wallet_address = COALESCE(?, trust_wallet_address),
      trust_wallet_tron = COALESCE(?, trust_wallet_tron),
      trust_wallet_solana = COALESCE(?, trust_wallet_solana),
      trust_wallet_ton = COALESCE(?, trust_wallet_ton),
      trust_wallet_verified = CASE WHEN ? = 1 THEN 1 ELSE trust_wallet_verified END,
      trust_wallet_connected_at = datetime('now')
     WHERE id = ?`
  ).bind(evm, tron, sol, ton, verified, user.id).run();

  // Anti-abuse: if this wallet address matches another user's connected Trust Wallet (including referrer), flag referral
  const addrs = [evm, tron, sol, ton].filter((a): a is string => Boolean(a)).map((a) => a.toLowerCase());
  if (addrs.length > 0) {
    const others = await c.env.DB.prepare(
      `SELECT id FROM users
       WHERE id != ? AND (
         LOWER(COALESCE(trust_wallet_address, '')) = ?
         OR LOWER(COALESCE(trust_wallet_tron, '')) = ?
         OR LOWER(COALESCE(trust_wallet_solana, '')) = ?
         OR LOWER(COALESCE(trust_wallet_ton, '')) = ?
       ) LIMIT 1`
    )
      .bind(
        user.id,
        (evm || '__none__').toLowerCase(),
        (tron || '__none__').toLowerCase(),
        (sol || '__none__').toLowerCase(),
        (ton || '__none__').toLowerCase()
      )
      .first<{ id: string }>()
      .catch(() => null);
    if (others) {
      await c.env.DB.prepare(
        `UPDATE referrals SET fraud_flag = 1, status = 'FLAGGED_DUPLICATE', fraud_reason = 'SHARED_TRUST_WALLET_SELF_REFERRAL'
         WHERE referred_user_id = ? AND status != 'REWARDED'`
      )
        .bind(user.id)
        .run()
        .catch(() => {});
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, category, level, message, details_json) VALUES (?, ?, 'EXCHANGE', 'INFO', ?, ?)`
  ).bind(
    randomId('aud'),
    user.id,
    `Connected Multi-Chain Wallet (${evm ? 'EVM ' : ''}${tron ? 'TRON ' : ''}${sol ? 'SOL ' : ''}${ton ? 'TON' : ''})`,
    JSON.stringify({ evm, tron, sol, ton, verified: Boolean(verified) })
  ).run().catch(() => {});

  invalidateTrustWalletCache(c.env.DB, user.id);

  return c.json({
    ok: true,
    verified: Boolean(verified),
    message: 'کیف پول چندزنجیره‌ای با موفقیت به حساب دلارینو متصل شد.',
  });
});

trustWalletRoutes.post('/disconnect', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(
    `UPDATE users SET trust_wallet_address = NULL, trust_wallet_tron = NULL, trust_wallet_solana = NULL, trust_wallet_ton = NULL, trust_wallet_verified = 0 WHERE id = ?`
  ).bind(user.id).run();
  invalidateTrustWalletCache(c.env.DB, user.id);
  return c.json({ ok: true });
});

trustWalletRoutes.post('/balance', async (c) => {
  const user = c.get('user');
  invalidateTrustWalletCache(c.env.DB, user.id);
  const u = await c.env.DB.prepare(
    `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton FROM users WHERE id = ?`
  ).bind(user.id).first<{
    trust_wallet_address: string | null;
    trust_wallet_tron: string | null;
    trust_wallet_solana: string | null;
    trust_wallet_ton: string | null;
  }>();

  const [bnb, eth, baseEth, arbEth, polygonPol, bscUsdt, solBal, tonBal, tronBal] = await Promise.all([
    u?.trust_wallet_address ? fetchEvmNativeBalance('https://bsc-dataseed.binance.org', u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_address ? fetchEvmNativeBalance('https://ethereum-rpc.publicnode.com', u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_address ? fetchEvmNativeBalance('https://mainnet.base.org', u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_address ? fetchEvmNativeBalance('https://arb1.arbitrum.io/rpc', u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_address ? fetchEvmNativeBalance('https://polygon-rpc.com', u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_address ? fetchBscUsdtBalance(u.trust_wallet_address) : Promise.resolve(null),
    u?.trust_wallet_solana ? fetchSolanaBalance(u.trust_wallet_solana) : Promise.resolve(null),
    u?.trust_wallet_ton ? fetchTonBalance(u.trust_wallet_ton) : Promise.resolve(null),
    u?.trust_wallet_tron ? fetchTronBalances(u.trust_wallet_tron) : Promise.resolve(null),
  ]);

  return c.json({
    ok: true,
    balances: {
      bnb,
      eth,
      baseEth,
      arbEth,
      polygonPol,
      bscUsdt,
      sol: solBal,
      ton: tonBal,
      trx: tronBal?.trx ?? null,
      trc20Usdt: tronBal?.usdt ?? null,
    },
  });
});

trustWalletRoutes.get('/dex-trades', async (c) => {
  const user = c.get('user');
  const modeFilter = (c.req.query('mode') || '').toUpperCase();
  const rows = await c.env.DB.prepare(
    `SELECT * FROM dex_trades WHERE user_id = ? ORDER BY opened_at DESC LIMIT 80`
  ).bind(user.id).all<{
    id: string;
    chain_id: string;
    dex_id?: string | null;
    pair_address?: string | null;
    token_address: string;
    token_symbol: string;
    amount_usd: number;
    token_qty: number;
    entry_price_usd: number;
    exit_price_usd: number | null;
    stop_loss_usd: number | null;
    tp1_usd: number | null;
    status: string;
    tx_hash: string | null;
    note?: string | null;
    realized_pnl_usd: number;
    realized_pnl_pct: number;
    opened_at: string;
    closed_at: string | null;
  }>();

  const filtered = rows.results.filter((t) => {
    const isPaper = Boolean(t.tx_hash && t.tx_hash.startsWith('PAPER_'));
    if (modeFilter === 'PAPER') return isPaper;
    if (modeFilter === 'LIVE') return !isPaper;
    return true;
  });

  // Enrich OPEN trades with live DexScreener prices (deduplicated)
  const openTokens = new Map<string, { chainId: string; tokenAddress: string }>();
  for (const t of filtered) {
    if (t.status === 'OPEN' || t.status === 'PENDING_SIGN') {
      openTokens.set(`${t.chain_id}:${t.token_address}`, { chainId: t.chain_id, tokenAddress: t.token_address });
    }
  }
  const livePrices = new Map<string, number>();
  await Promise.all(
    [...openTokens.values()].slice(0, 8).map(async (item) => {
      const pools = await getDexTokenPools(item.chainId, item.tokenAddress).catch(() => []);
      const px = Number(pools[0]?.priceUsd || 0);
      if (px > 0) livePrices.set(`${item.chainId}:${item.tokenAddress}`, px);
    })
  );

  const enriched = filtered.map((t) => {
    const livePx = livePrices.get(`${t.chain_id}:${t.token_address}`) ?? t.entry_price_usd;
    const unrealizedPct = t.entry_price_usd > 0 ? ((livePx - t.entry_price_usd) / t.entry_price_usd) * 100 : 0;
    const unrealizedUsd = (t.amount_usd * unrealizedPct) / 100;
    const isPaper = Boolean(t.tx_hash && t.tx_hash.startsWith('PAPER_'));
    return {
      ...t,
      mode: isPaper ? 'PAPER' : 'LIVE',
      live_price_usd: livePx,
      unrealized_pnl_pct: Number(unrealizedPct.toFixed(2)),
      unrealized_pnl_usd: Number(unrealizedUsd.toFixed(2)),
      trustWallet: buildTrustWalletSwapLinks(t.chain_id, t.token_address),
    };
  });

  return c.json({ ok: true, trades: enriched });
});

trustWalletRoutes.post('/dex-trades', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    dexId?: string;
    pairAddress?: string;
    tokenAddress?: string;
    tokenSymbol?: string;
    quoteSymbol?: string;
    amountUsd?: number;
    entryPriceUsd?: number;
    stopLossUsd?: number;
    tp1Usd?: number;
    txHash?: string;
    note?: string;
  };

  if (!body.chainId || !body.tokenAddress || !body.tokenSymbol) {
    return c.json({ error: 'chainId, tokenAddress و tokenSymbol الزامی هستند.' }, 400);
  }
  const amountUsd = Math.max(5, Number(body.amountUsd || 50));
  let entryPx = Number(body.entryPriceUsd || 0);
  let pairAddr = body.pairAddress || body.tokenAddress;
  let dexId = body.dexId || 'dex';

  if (entryPx <= 0) {
    const pools = await getDexTokenPools(body.chainId, body.tokenAddress);
    if (pools[0]?.priceUsd) {
      entryPx = Number(pools[0].priceUsd);
      pairAddr = pools[0].pairAddress;
      dexId = pools[0].dexId;
    }
  }
  if (entryPx <= 0) {
    return c.json({ error: 'امکان دریافت قیمت لحظه‌ای توکن از DexScreener میسر نشد.' }, 400);
  }

  const u = await c.env.DB.prepare(
    `SELECT trust_wallet_address, trust_wallet_solana FROM users WHERE id = ?`
  ).bind(user.id).first<{ trust_wallet_address: string | null; trust_wallet_solana: string | null }>();

  const walletAddress = body.chainId === 'solana' ? u?.trust_wallet_solana : u?.trust_wallet_address;
  const tokenQty = amountUsd / entryPx;
  const slUsd = body.stopLossUsd && body.stopLossUsd > 0 ? body.stopLossUsd : Number((entryPx * 0.85).toPrecision(6));
  const tp1Usd = body.tp1Usd && body.tp1Usd > 0 ? body.tp1Usd : Number((entryPx * 1.3).toPrecision(6));
  const status = body.txHash?.trim() ? 'OPEN' : 'PENDING_SIGN';
  const id = randomId('dext');

  await c.env.DB.prepare(
    `INSERT INTO dex_trades (
      id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol,
      direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, wallet_address, tx_hash, status, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    body.chainId.toLowerCase(),
    dexId,
    pairAddr,
    body.tokenAddress,
    body.tokenSymbol.toUpperCase(),
    body.quoteSymbol || 'USDT',
    amountUsd,
    tokenQty,
    entryPx,
    slUsd,
    tp1Usd,
    walletAddress ?? null,
    body.txHash?.trim() || null,
    status,
    body.note || 'معامله توکن DEX با Trust Wallet'
  ).run();

  return c.json({
    ok: true,
    tradeId: id,
    status,
    entryPriceUsd: entryPx,
    tokenQty,
    trustWallet: buildTrustWalletSwapLinks(body.chainId, body.tokenAddress),
  });
});

trustWalletRoutes.post('/dex-trades/:id/confirm', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { txHash?: string };
  await c.env.DB.prepare(
    `UPDATE dex_trades SET status = 'OPEN', tx_hash = COALESCE(?, tx_hash) WHERE id = ? AND user_id = ?`
  ).bind(body.txHash?.trim() || null, id, user.id).run();
  return c.json({ ok: true, id, status: 'OPEN' });
});

trustWalletRoutes.patch('/dex-trades/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    stopLossUsd?: number | null;
    tp1Usd?: number | null;
    note?: string;
  };
  const row = await c.env.DB.prepare(
    `SELECT id, status FROM dex_trades WHERE id = ? AND user_id = ? LIMIT 1`
  )
    .bind(id, user.id)
    .first<{ id: string; status: string }>();
  if (!row) return c.json({ error: 'معامله یافت نشد.' }, 404);

  const sl = body.stopLossUsd === null ? null : body.stopLossUsd !== undefined ? Math.max(0, Number(body.stopLossUsd)) : undefined;
  const tp1 = body.tp1Usd === null ? null : body.tp1Usd !== undefined ? Math.max(0, Number(body.tp1Usd)) : undefined;

  await c.env.DB.prepare(
    `UPDATE dex_trades
     SET stop_loss_usd = CASE WHEN ? IS NOT NULL THEN ? ELSE stop_loss_usd END,
         tp1_usd = CASE WHEN ? IS NOT NULL THEN ? ELSE tp1_usd END,
         note = COALESCE(?, note)
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      sl !== undefined ? 1 : null,
      sl ?? null,
      tp1 !== undefined ? 1 : null,
      tp1 ?? null,
      body.note !== undefined ? body.note.slice(0, 200) : null,
      id,
      user.id
    )
    .run();

  return c.json({ ok: true, id, stopLossUsd: sl, tp1Usd: tp1 });
});

trustWalletRoutes.post('/dex-trades/:id/close', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { exitPriceUsd?: number; txHash?: string };
  const row = await c.env.DB.prepare(
    `SELECT * FROM dex_trades WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first<{
    id: string;
    chain_id: string;
    token_address: string;
    token_symbol: string;
    amount_usd: number;
    entry_price_usd: number;
    tx_hash: string | null;
    status: string;
    realized_pnl_usd: number;
    realized_pnl_pct: number;
    exit_price_usd: number | null;
  }>();
  if (!row) return c.json({ error: 'معامله یافت نشد.' }, 404);
  if (row.status === 'CLOSED' || row.status === 'CANCELLED') {
    return c.json({
      ok: true,
      id,
      status: row.status,
      exitPriceUsd: row.exit_price_usd ?? row.entry_price_usd,
      realizedPnlUsd: row.realized_pnl_usd,
      realizedPnlPct: row.realized_pnl_pct,
    });
  }

  if (row.status === 'PENDING_SIGN') {
    await c.env.DB.prepare(
      `UPDATE dex_trades
       SET status = 'CANCELLED', realized_pnl_usd = 0, realized_pnl_pct = 0, closed_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).bind(id, user.id).run();
    return c.json({
      ok: true,
      id,
      status: 'CANCELLED',
      cancelled: true,
      exitPriceUsd: row.entry_price_usd,
      realizedPnlUsd: 0,
      realizedPnlPct: 0,
    });
  }

  let exitPx = Number(body.exitPriceUsd || 0);
  if (exitPx <= 0) {
    const pools = await getDexTokenPools(row.chain_id, row.token_address).catch(() => []);
    exitPx = Number(pools[0]?.priceUsd || row.entry_price_usd);
  }
  const pnlPct = row.entry_price_usd > 0 ? ((exitPx - row.entry_price_usd) / row.entry_price_usd) * 100 : 0;
  const pnlUsd = (row.amount_usd * pnlPct) / 100;

  await c.env.DB.prepare(
    `UPDATE dex_trades
     SET status = 'CLOSED', exit_price_usd = ?, realized_pnl_usd = ?, realized_pnl_pct = ?,
         tx_hash = COALESCE(?, tx_hash), closed_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).bind(exitPx, Number(pnlUsd.toFixed(2)), Number(pnlPct.toFixed(2)), body.txHash?.trim() || null, id, user.id).run();

  let updatedPaperBalanceUsd: number | null = null;
  const isPaper = Boolean(row.tx_hash && row.tx_hash.startsWith('PAPER_'));
  if (isPaper) {
    const balRow = await c.env.DB.prepare(`SELECT paper_balance FROM bot_configs WHERE user_id = ?`)
      .bind(user.id)
      .first<{ paper_balance: string }>()
      .catch(() => null);
    const curBal = Number(balRow?.paper_balance ?? 0);
    const returnUsd = Math.max(0, row.amount_usd + pnlUsd);
    const nextBal = Number((curBal + returnUsd).toFixed(2));
    updatedPaperBalanceUsd = nextBal;
    await c.env.DB.prepare(`UPDATE bot_configs SET paper_balance = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .bind(String(nextBal), user.id)
      .run()
      .catch(() => {});
    await c.env.DB.prepare(
      `INSERT INTO wallet_ledger (id, user_id, mode, event_type, amount_usd, balance_after, note)
       VALUES (?, ?, 'PAPER', 'DEX_CLOSE', ?, ?, ?)`
    )
      .bind(randomId('wl'), user.id, Number(pnlUsd.toFixed(2)), nextBal, `بستن موقعیت ${row.token_symbol} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`)
      .run()
      .catch(() => {});
  } else {
    const isSniper = Boolean(row.tx_hash === null || !row.tx_hash);
    await recordProfitShareServerFee(c.env.DB, {
      userId: user.id,
      tradeId: id,
      source: isSniper ? 'SNIPER_LIVE' : 'DEX_LIVE',
      symbol: row.token_symbol,
      mode: 'LIVE',
      realizedPnlUsd: Number(pnlUsd.toFixed(2)),
      tradeAmountUsd: row.amount_usd,
      note: `بستن معامله DEX/اسنایپر ${row.token_symbol} (${row.chain_id.toUpperCase()})`,
    }).catch(() => {});
  }

  return c.json({
    ok: true,
    id,
    exitPriceUsd: exitPx,
    realizedPnlUsd: Number(pnlUsd.toFixed(2)),
    realizedPnlPct: Number(pnlPct.toFixed(2)),
    paperBalanceUsd: updatedPaperBalanceUsd,
  });
});

trustWalletRoutes.get('/execution-mode', async (c) => {
  const user = c.get('user');
  const [u, cfg, perpRow, vaultRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified
       FROM users WHERE id = ?`
    ).bind(user.id).first<{
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      trust_wallet_verified: number;
    }>(),
    c.env.DB.prepare(
      `SELECT trading_mode, trade_execution_mode, paper_balance FROM bot_configs WHERE user_id = ?`
    ).bind(user.id).first<{ trading_mode: string; trade_execution_mode: string; paper_balance: string }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT venue, master_address, agent_address, is_active FROM perp_dex_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`
    ).bind(user.id).first<{ venue: string; master_address: string; agent_address: string | null; is_active: number }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT id, evm_address, solana_address, allowance_limit_usd, auto_withdraw_to_trust FROM user_copy_vaults WHERE user_id = ? LIMIT 1`
    ).bind(user.id).first<{
      id: string;
      evm_address: string;
      solana_address: string;
      allowance_limit_usd: number;
      auto_withdraw_to_trust: number;
    }>().catch(() => null),
  ]);

  const trustWalletConnected = Boolean(
    u?.trust_wallet_address || u?.trust_wallet_tron || u?.trust_wallet_solana || u?.trust_wallet_ton
  );

  return c.json({
    ok: true,
    executionMode: cfg?.trade_execution_mode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO',
    tradingMode: cfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER',
    demoSimulatorBalance: Number(cfg?.paper_balance ?? 10000),
    permissions: {
      trustWalletConnected,
      trustWalletVerified: Boolean(u?.trust_wallet_verified),
      perpAgentConnected: Boolean(perpRow?.agent_address || perpRow?.master_address),
      perpProvider: perpRow?.venue ?? null,
      copyVaultReady: Boolean(vaultRow && Number(vaultRow.allowance_limit_usd || 0) > 0),
      copyVaultAllowanceUsd: Number(vaultRow?.allowance_limit_usd ?? 0),
    },
  });
});

export const MIN_LIVE_TRUST_USD = 10;

export interface TrustWalletLiveSummary {
  hasWallet: boolean;
  totalUsd: number;
  rpcReachable: boolean;
  meetsMinimum: boolean;
  minRequiredUsd: number;
  breakdown: Record<string, number>;
}

const TRUST_RPC_CACHE = new WeakMap<
  object,
  Map<string, { ts: number; rpcUsd: number; rpcReachable: boolean; breakdown: Record<string, number> }>
>();
const TRUST_LIVE_USD_CACHE = new WeakMap<object, Map<string, { ts: number; data: TrustWalletLiveSummary }>>();
const TRUST_LIVE_CACHE_TTL_MS = 90_000;

export function invalidateTrustWalletCache(db: D1Database, userId?: string): void {
  const map = TRUST_LIVE_USD_CACHE.get(db as unknown as object);
  if (map) {
    if (userId) map.delete(userId);
    else map.clear();
  }
  const rpcMap = TRUST_RPC_CACHE.get(db as unknown as object);
  if (rpcMap && !userId) rpcMap.clear();
}

export async function getTrustWalletLiveTotalUsd(
  db: D1Database,
  userId: string,
  opts?: { forceRefresh?: boolean; skipRpc?: boolean; useFullCache?: boolean }
): Promise<TrustWalletLiveSummary> {
  const now = Date.now();
  let cacheMap = TRUST_LIVE_USD_CACHE.get(db as unknown as object);
  if (opts?.useFullCache && !opts?.forceRefresh) {
    const cached = cacheMap?.get(userId);
    if (cached && now - cached.ts < TRUST_LIVE_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const [u, perpRow, vaultRow, minSettingVal] = await Promise.all([
    db.prepare(
      `SELECT role, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, wallet_balance_usdt
       FROM users WHERE id = ?`
    ).bind(userId).first<{
      role: string | null;
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      wallet_balance_usdt: number | null;
    }>(),
    db.prepare(
      `SELECT id, equity_usd, margin_available_usd FROM perp_dex_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`
    ).bind(userId).first<{ id: string; equity_usd?: number; margin_available_usd?: number }>().catch(() => null),
    db.prepare(
      `SELECT id, allowance_limit_usd FROM user_copy_vaults WHERE user_id = ? LIMIT 1`
    ).bind(userId).first<{ id: string; allowance_limit_usd: number }>().catch(() => null),
    getCachedSystemSetting(db, 'min_live_trust_usd', String(MIN_LIVE_TRUST_USD)).catch(() => String(MIN_LIVE_TRUST_USD)),
  ]);

  const isPrivileged = u?.role === 'owner' || u?.role === 'admin';
  const minRequiredUsd = isPrivileged ? 0 : Math.max(10, Number(minSettingVal || MIN_LIVE_TRUST_USD) || MIN_LIVE_TRUST_USD);
  const hasWallet = Boolean(
    u?.trust_wallet_address || u?.trust_wallet_tron || u?.trust_wallet_solana || u?.trust_wallet_ton || perpRow || vaultRow
  );
  if (!hasWallet) {
    const emptyRes: TrustWalletLiveSummary = {
      hasWallet: false,
      totalUsd: 0,
      rpcReachable: true,
      meetsMinimum: false,
      minRequiredUsd,
      breakdown: {},
    };
    if (!cacheMap) {
      cacheMap = new Map();
      TRUST_LIVE_USD_CACHE.set(db as unknown as object, cacheMap);
    }
    if (cacheMap.size > 500) cacheMap.clear();
    cacheMap.set(userId, { ts: now, data: emptyRes });
    return emptyRes;
  }

  let totalUsd = 0;
  let rpcReachable = false;
  const breakdown: Record<string, number> = {};

  if (Number(u?.wallet_balance_usdt || 0) > 0) {
    const wb = Number(u!.wallet_balance_usdt);
    breakdown.internalUsd = wb;
    totalUsd += wb;
  }
  const perpUsd = Number(perpRow?.equity_usd || perpRow?.margin_available_usd || 0);
  if (perpUsd > 0) {
    breakdown.perpUsd = perpUsd;
    totalUsd += perpUsd;
  }

  const addrKey = `${u?.trust_wallet_address || ''}|${u?.trust_wallet_tron || ''}|${u?.trust_wallet_solana || ''}|${u?.trust_wallet_ton || ''}`;
  let rpcMap = TRUST_RPC_CACHE.get(db as unknown as object);
  const rpcCached = !opts?.forceRefresh ? rpcMap?.get(addrKey) : undefined;
  if (rpcCached && now - rpcCached.ts < TRUST_LIVE_CACHE_TTL_MS) {
    rpcReachable = rpcCached.rpcReachable;
    totalUsd += rpcCached.rpcUsd;
    Object.assign(breakdown, rpcCached.breakdown);
  } else if (!opts?.skipRpc) {
    let rpcUsd = 0;
    const rpcBreakdown: Record<string, number> = {};
    const tasks: Array<Promise<void>> = [];
    if (u?.trust_wallet_address && isValidEvm(u.trust_wallet_address)) {
      const addr = u.trust_wallet_address;
      tasks.push(
        fetchBscUsdtBalance(addr).then((v: number | null) => {
          if (v !== null) {
            rpcReachable = true;
            rpcBreakdown.bscUsdt = v;
            rpcUsd += v;
          }
        }),
        fetchEvmNativeBalance('https://bsc-dataseed.binance.org', addr).then((bnb) => {
          if (bnb !== null) {
            rpcReachable = true;
            const usd = Number((bnb * 620).toFixed(2));
            rpcBreakdown.bscBnbUsd = usd;
            rpcUsd += usd;
          }
        }),
        fetchEvmNativeBalance('https://eth.llamarpc.com', addr).then((eth) => {
          if (eth !== null) {
            rpcReachable = true;
            const usd = Number((eth * 2600).toFixed(2));
            rpcBreakdown.ethUsd = usd;
            rpcUsd += usd;
          }
        })
      );
    }
    if (u?.trust_wallet_tron && isValidTron(u.trust_wallet_tron)) {
      tasks.push(
        fetchTronBalances(u.trust_wallet_tron).then((tr) => {
          if (tr !== null) {
            rpcReachable = true;
            const usd = Number((tr.usdt + tr.trx * 0.25).toFixed(2));
            rpcBreakdown.tronUsd = usd;
            rpcUsd += usd;
          }
        })
      );
    }
    if (u?.trust_wallet_solana && isValidSolana(u.trust_wallet_solana)) {
      tasks.push(
        fetchSolanaBalance(u.trust_wallet_solana).then((sol) => {
          if (sol !== null) {
            rpcReachable = true;
            const usd = Number((sol * 180).toFixed(2));
            rpcBreakdown.solanaUsd = usd;
            rpcUsd += usd;
          }
        })
      );
    }
    if (u?.trust_wallet_ton && isValidTon(u.trust_wallet_ton)) {
      tasks.push(
        fetchTonBalance(u.trust_wallet_ton).then((ton) => {
          if (ton !== null) {
            rpcReachable = true;
            const usd = Number((ton * 5).toFixed(2));
            rpcBreakdown.tonUsd = usd;
            rpcUsd += usd;
          }
        })
      );
    }

    if (tasks.length > 0) {
      await Promise.race([
        Promise.allSettled(tasks),
        new Promise<void>((resolve) => setTimeout(resolve, 2200)),
      ]);
      totalUsd += rpcUsd;
      Object.assign(breakdown, rpcBreakdown);
      if (!rpcMap) {
        rpcMap = new Map();
        TRUST_RPC_CACHE.set(db as unknown as object, rpcMap);
      }
      if (rpcMap.size > 500) rpcMap.clear();
      rpcMap.set(addrKey, { ts: now, rpcUsd, rpcReachable, breakdown: rpcBreakdown });
    }
  }

  // When RPC succeeded (or explicit zero recorded balance), enforce >= $10 USD minimum strictly.
  // If user connected only Perp/Vault without an external address query returning zero, honor vault/perp balance check.
  const meetsMinimum = isPrivileged
    ? true
    : rpcReachable
      ? totalUsd >= minRequiredUsd
      : totalUsd >= minRequiredUsd || Boolean(perpRow);

  const resData: TrustWalletLiveSummary = {
    hasWallet,
    totalUsd: Number(totalUsd.toFixed(2)),
    rpcReachable,
    meetsMinimum,
    minRequiredUsd,
    breakdown,
  };
  if (!opts?.skipRpc) {
    if (!cacheMap) {
      cacheMap = new Map();
      TRUST_LIVE_USD_CACHE.set(db as unknown as object, cacheMap);
    }
    if (cacheMap.size > 500) cacheMap.clear();
    cacheMap.set(userId, { ts: now, data: resData });
  }
  return resData;
}

trustWalletRoutes.post('/execution-mode', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    executionMode?: 'AUTO' | 'MANUAL_CONFIRM';
    tradingMode?: 'PAPER' | 'LIVE';
    syncCopyRules?: boolean;
  };

  const nextExec = body.executionMode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO';
  const sets = [`trade_execution_mode = ?`, `updated_at = datetime('now')`];
  const vals: unknown[] = [nextExec];

  let liveBalanceUsd = 0;
  let liveReady = true;
  let warningCode: string | undefined;
  let liveNoticeMsg: string | undefined;

  if (body.tradingMode === 'LIVE' || body.tradingMode === 'PAPER') {
    if (body.tradingMode === 'LIVE') {
      const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
      if (!feeCheck.allowed) {
        return c.json({
          error: feeCheck.reasonFa || 'معاملات جدید واقعی تا تسویه کارمزد ۳٪ معوق متوقف است (پوزیشن‌های باز همچنان مدیریت می‌شوند).',
          code: 'FEE_SETTLEMENT_REQUIRED',
          enforcement: feeCheck,
        }, 402);
      }
      const readiness = await getTrustWalletLiveTotalUsd(c.env.DB, user.id);
      liveBalanceUsd = readiness.totalUsd;
      liveReady = readiness.hasWallet && readiness.meetsMinimum;
      if (!readiness.hasWallet) {
        warningCode = 'NO_TRUST_WALLET';
        liveNoticeMsg = 'حالت کیف‌پول واقعی انتخاب شد (موجودی واقعی: $0.00). برای معامله واقعی، آدرس Trust Wallet خود را متصل کنید.';
        sets.push(`bot_state = 'STOPPED'`);
      } else if (!readiness.meetsMinimum) {
        warningCode = 'MIN_BALANCE_10_USD';
        liveNoticeMsg = `حالت کیف‌پول واقعی انتخاب شد — موجودی واقعی Trust Wallet: $${readiness.totalUsd.toFixed(2)} (برای استارت خودکار ربات حداقل $${readiness.minRequiredUsd} لازم است).`;
        sets.push(`bot_state = 'STOPPED'`);
      } else {
        liveNoticeMsg = `کیف‌پول واقعی Trust Wallet فعال شد — موجودی واقعی: $${readiness.totalUsd.toFixed(2)} ✅`;
      }
    }
    sets.push(`trading_mode = ?`, `trading_mode_selected = 1`);
    vals.push(body.tradingMode);
  }

  vals.push(user.id);
  await ensureUserDefaults(c.env.DB, user.id).catch(() => {});
  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();
  invalidateLiveTicksCache(c.env.DB, user.id);

  if (body.syncCopyRules) {
    const copyMode = nextExec === 'AUTO' ? 'AUTO_COPY_VAULT' : 'TRUST_ONE_CLICK';
    await c.env.DB.prepare(
      `UPDATE copy_follow_rules SET execution_mode = ?, updated_at = datetime('now') WHERE user_id = ?`
    ).bind(copyMode, user.id).run().catch(() => {});
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, category, level, message) VALUES (?, ?, 'BOT', 'INFO', ?)`
  ).bind(
    randomId('aud'),
    user.id,
    `حالت اجرای Trust Wallet روی ${nextExec === 'AUTO' ? 'تمام‌اتوترید خودکار ۲۴/۷' : 'تایید دستی قبل از اجرا'} (${body.tradingMode === 'LIVE' ? `کیف‌پول واقعی · $${liveBalanceUsd}` : 'شبیه‌ساز دمو'}) تنظیم شد.`
  ).run().catch(() => {});

  return c.json({
    ok: true,
    executionMode: nextExec,
    tradingMode: body.tradingMode ?? undefined,
    liveBalanceUsd: body.tradingMode === 'LIVE' ? liveBalanceUsd : undefined,
    liveReady: body.tradingMode === 'LIVE' ? liveReady : undefined,
    minRequiredUsd: body.tradingMode === 'LIVE' ? 10 : undefined,
    warningCode,
    message:
      liveNoticeMsg ||
      (body.tradingMode === 'PAPER'
        ? 'حساب روی کیف‌پول دمو قرار گرفت 🧪'
        : nextExec === 'AUTO'
          ? 'حالت تمام‌اتوترید خودکار ۲۴/۷ فعال شد (بدون نیاز به تایید دستی هر معامله).'
          : 'حالت تایید دستی فعال شد (هر معامله قبل از ثبت، با یک کلیک در Trust Wallet تایید می‌شود).'),
  });
});

trustWalletRoutes.post('/build-solana-fund-tx', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    fromAddress?: string;
    vaultAddress?: string;
    amountUsd?: number;
    amountSol?: number;
  };

  const vault = await ensureUserCopyVault(c.env, user.id);
  const toAddress =
    typeof body.vaultAddress === 'string' && isValidSolana(body.vaultAddress)
      ? body.vaultAddress.trim()
      : vault.solanaAddress;

  const uRow = await c.env.DB.prepare(
    `SELECT trust_wallet_solana FROM users WHERE id = ? LIMIT 1`
  )
    .bind(user.id)
    .first<{ trust_wallet_solana: string | null }>()
    .catch(() => null);

  const fromAddress =
    typeof body.fromAddress === 'string' && isValidSolana(body.fromAddress)
      ? body.fromAddress.trim()
      : uRow?.trust_wallet_solana && isValidSolana(uRow.trust_wallet_solana)
        ? uRow.trust_wallet_solana.trim()
        : '';

  const solPriceUsd = await estimateSolPriceUsd();
  const reqUsd = Number(body.amountUsd || 0);
  const reqSol = Number(body.amountSol || 0);
  const amountSol =
    Number.isFinite(reqSol) && reqSol > 0
      ? Number(reqSol.toFixed(6))
      : Number(Math.max(0.01, (Number.isFinite(reqUsd) && reqUsd > 0 ? reqUsd : 25) / solPriceUsd).toFixed(4));
  const approxUsd = Number((amountSol * solPriceUsd).toFixed(2));

  const sendDeepLink = `https://link.trustwallet.com/send?coin=501&address=${encodeURIComponent(toAddress)}&amount=${encodeURIComponent(String(amountSol))}`;
  const jupiterDappUrl = `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent('https://jup.ag/swap/SOL-USDC')}`;

  if (fromAddress) {
    try {
      const built = await buildUnsignedSolanaTransferTx(c.env, {
        fromAddress,
        toAddress,
        amountSol,
      });
      return c.json({
        ok: true,
        kind: 'SOLANA_TX',
        fromAddress,
        vaultSolanaAddress: toAddress,
        txBase64: built.txBase64,
        blockhash: built.blockhash,
        lamports: built.lamports,
        amountSol: built.amountSol,
        approxUsd,
        solPriceUsd,
        sendDeepLink,
        jupiterDappUrl,
      });
    } catch (err) {
      return c.json({
        ok: true,
        kind: 'DAPP_URL',
        fromAddress,
        vaultSolanaAddress: toAddress,
        amountSol,
        approxUsd,
        solPriceUsd,
        sendDeepLink,
        jupiterDappUrl,
        note: err instanceof Error ? err.message : 'Solana RPC unavailable; use Trust Wallet Send Deep Link',
      });
    }
  }

  return c.json({
    ok: true,
    kind: 'DAPP_URL',
    fromAddress: null,
    vaultSolanaAddress: toAddress,
    amountSol,
    approxUsd,
    solPriceUsd,
    sendDeepLink,
    jupiterDappUrl,
    note: 'آدرس سولانای Trust Wallet متصل نیست؛ لینک مستقیم انتقال سولانا باز می‌شود.',
  });
});

