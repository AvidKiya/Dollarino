import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { randomId } from '../crypto.js';
import { buildTrustWalletSwapLinks, getDexTokenPools } from '../dex/screener.js';
import type { AuthUser, Env } from '../env.js';
import { checkLiveFeeEnforcement } from '../services/server-fee.js';

export const trustWalletRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

trustWalletRoutes.use('*', requireAuth);

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
  for (const r of settingsRows.results) receivers[r.key] = r.value;

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
  return c.json({ ok: true, nonce, message });
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

  const verified = body.signature && body.signature.length > 20 ? 1 : 0;

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
  return c.json({ ok: true });
});

trustWalletRoutes.post('/balance', async (c) => {
  const user = c.get('user');
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
  const rows = await c.env.DB.prepare(
    `SELECT * FROM dex_trades WHERE user_id = ? ORDER BY opened_at DESC LIMIT 80`
  ).bind(user.id).all<{
    id: string;
    chain_id: string;
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
    realized_pnl_usd: number;
    realized_pnl_pct: number;
    opened_at: string;
    closed_at: string | null;
  }>();

  // Enrich OPEN trades with live DexScreener prices (deduplicated)
  const openTokens = new Map<string, { chainId: string; tokenAddress: string }>();
  for (const t of rows.results) {
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

  const enriched = rows.results.map((t) => {
    const livePx = livePrices.get(`${t.chain_id}:${t.token_address}`) ?? t.entry_price_usd;
    const unrealizedPct = t.entry_price_usd > 0 ? ((livePx - t.entry_price_usd) / t.entry_price_usd) * 100 : 0;
    const unrealizedUsd = (t.amount_usd * unrealizedPct) / 100;
    return {
      ...t,
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
    amount_usd: number;
    entry_price_usd: number;
  }>();
  if (!row) return c.json({ error: 'معامله یافت نشد.' }, 404);

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

  return c.json({ ok: true, id, exitPriceUsd: exitPx, realizedPnlUsd: Number(pnlUsd.toFixed(2)), realizedPnlPct: Number(pnlPct.toFixed(2)) });
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

export async function getTrustWalletLiveTotalUsd(
  db: D1Database,
  userId: string
): Promise<{
  hasWallet: boolean;
  totalUsd: number;
  rpcReachable: boolean;
  meetsMinimum: boolean;
  minRequiredUsd: number;
  breakdown: Record<string, number>;
}> {
  const [u, perpRow, vaultRow, minSetting] = await Promise.all([
    db.prepare(
      `SELECT trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, wallet_balance_usdt
       FROM users WHERE id = ?`
    ).bind(userId).first<{
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
    db.prepare(`SELECT value FROM system_settings WHERE key = 'min_live_trust_usd'`).first<{ value: string }>().catch(() => null),
  ]);

  const minRequiredUsd = Math.max(10, Number(minSetting?.value || MIN_LIVE_TRUST_USD) || MIN_LIVE_TRUST_USD);
  const hasWallet = Boolean(
    u?.trust_wallet_address || u?.trust_wallet_tron || u?.trust_wallet_solana || u?.trust_wallet_ton || perpRow || vaultRow
  );
  if (!hasWallet) {
    return { hasWallet: false, totalUsd: 0, rpcReachable: true, meetsMinimum: false, minRequiredUsd, breakdown: {} };
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

  const tasks: Array<Promise<void>> = [];
  if (u?.trust_wallet_address && isValidEvm(u.trust_wallet_address)) {
    const addr = u.trust_wallet_address;
    tasks.push(
      fetchBscUsdtBalance(addr).then((v: number | null) => {
        if (v !== null) {
          rpcReachable = true;
          breakdown.bscUsdt = v;
          totalUsd += v;
        }
      }),
      fetchEvmNativeBalance('https://bsc-dataseed.binance.org', addr).then((bnb) => {
        if (bnb !== null) {
          rpcReachable = true;
          const usd = bnb * 620;
          breakdown.bscBnbUsd = Number(usd.toFixed(2));
          totalUsd += usd;
        }
      }),
      fetchEvmNativeBalance('https://eth.llamarpc.com', addr).then((eth) => {
        if (eth !== null) {
          rpcReachable = true;
          const usd = eth * 2600;
          breakdown.ethUsd = Number(usd.toFixed(2));
          totalUsd += usd;
        }
      })
    );
  }
  if (u?.trust_wallet_tron && isValidTron(u.trust_wallet_tron)) {
    tasks.push(
      fetchTronBalances(u.trust_wallet_tron).then((tr) => {
        if (tr !== null) {
          rpcReachable = true;
          const usd = tr.usdt + tr.trx * 0.25;
          breakdown.tronUsd = Number(usd.toFixed(2));
          totalUsd += usd;
        }
      })
    );
  }
  if (u?.trust_wallet_solana && isValidSolana(u.trust_wallet_solana)) {
    tasks.push(
      fetchSolanaBalance(u.trust_wallet_solana).then((sol) => {
        if (sol !== null) {
          rpcReachable = true;
          const usd = sol * 180;
          breakdown.solanaUsd = Number(usd.toFixed(2));
          totalUsd += usd;
        }
      })
    );
  }
  if (u?.trust_wallet_ton && isValidTon(u.trust_wallet_ton)) {
    tasks.push(
      fetchTonBalance(u.trust_wallet_ton).then((ton) => {
        if (ton !== null) {
          rpcReachable = true;
          const usd = ton * 5;
          breakdown.tonUsd = Number(usd.toFixed(2));
          totalUsd += usd;
        }
      })
    );
  }

  await Promise.allSettled(tasks);

  // When RPC succeeded (or explicit zero recorded balance), enforce >= $10 USD minimum strictly.
  // If user connected only Perp/Vault without an external address query returning zero, honor vault/perp balance check.
  const meetsMinimum = rpcReachable ? totalUsd >= minRequiredUsd : totalUsd >= minRequiredUsd || Boolean(perpRow);

  return {
    hasWallet,
    totalUsd: Number(totalUsd.toFixed(2)),
    rpcReachable,
    meetsMinimum,
    minRequiredUsd,
    breakdown,
  };
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
  if (body.tradingMode === 'LIVE' || body.tradingMode === 'PAPER') {
    if (body.tradingMode === 'LIVE') {
      const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
      if (!feeCheck.allowed) {
        return c.json({
          error: feeCheck.reasonFa || 'حساب معاملات واقعی تا تسویه کارمزد ۵٪ معوق قفل شده است.',
          code: 'FEE_SETTLEMENT_REQUIRED',
          enforcement: feeCheck,
        }, 402);
      }
      const readiness = await getTrustWalletLiveTotalUsd(c.env.DB, user.id);
      if (!readiness.hasWallet) {
        return c.json({
          error: 'ابتدا کیف‌پول Trust Wallet خود را متصل کنید (یا برای تست بدون ریسک روی شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری بمانید).',
          code: 'NO_TRUST_WALLET',
        }, 400);
      }
      if (!readiness.meetsMinimum) {
        return c.json({
          error: `برای اجرای ربات روی کیف‌پول واقعی، حداقل موجودی ${readiness.minRequiredUsd} دلار (USDT/BNB/SOL/TRX) در Trust Wallet لازم است (موجودی فعلی: $${readiness.totalUsd.toFixed(2)}). فعلاً می‌توانید رایگان از شبیه‌ساز دمو ۱۰٬۰۰۰ دلاری استفاده کنید.`,
          code: 'MIN_BALANCE_10_USD',
          currentUsd: readiness.totalUsd,
          minRequiredUsd: readiness.minRequiredUsd,
        }, 400);
      }
      liveBalanceUsd = readiness.totalUsd;
    }
    sets.push(`trading_mode = ?`);
    vals.push(body.tradingMode);
  }

  vals.push(user.id);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO bot_configs (user_id, webhook_secret) VALUES (?, ?)`
  ).bind(user.id, randomId('wh')).run().catch(() => {});
  await c.env.DB.prepare(`UPDATE bot_configs SET ${sets.join(', ')} WHERE user_id = ?`).bind(...vals).run();

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
    message:
      nextExec === 'AUTO'
        ? 'حالت تمام‌اتوترید خودکار ۲۴/۷ فعال شد (بدون نیاز به تایید دستی هر معامله).'
        : 'حالت تایید دستی فعال شد (هر معامله قبل از ثبت، با یک کلیک در Trust Wallet تایید می‌شود).',
  });
});

