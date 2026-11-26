import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTotpCodeAt } from '../crypto.js';
import { deriveEvmAddressFromPrivateKey } from '../dex/evm-tx.js';
import { executeSniperBuyForCandidate, type SniperCandidate } from '../engine/listing-sniper.js';
import type { UserBotConfigRow } from '../engine/executor.js';
import type { Env } from '../env.js';
import { dedupeMarketsBySymbol } from '../exchanges/markets.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';
import worker from '../index.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;

function makeEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-v116-dapp',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:ENV_FALLBACK_TOKEN_V116',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === '-' && sql[i + 1] === '-' && !inSingle && !inDouble) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (sql[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function signEip191(message: string, privBytes: Uint8Array): { address: string; signature: string } {
  const pubUncompressed = secp256k1.getPublicKey(privBytes, false);
  const address = '0x' + Buffer.from(keccak_256(pubUncompressed.slice(1)).slice(-20)).toString('hex');
  const msgBytes = Buffer.from(message, 'utf8');
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${msgBytes.length}`, 'utf8');
  const digest = keccak_256(Buffer.concat([prefix, msgBytes]));
  const rec = secp256k1.sign(digest, privBytes, { prehash: false, lowS: true, format: 'recovered' });
  const ethSig = new Uint8Array(65);
  ethSig.set(rec.slice(1, 65), 0);
  ethSig[64] = 27 + rec[0]!;
  return { address, signature: '0x' + Buffer.from(ethSig).toString('hex') };
}

async function issueUserToken(
  env: Env,
  userId: string,
  tgId: string,
  role: 'owner' | 'admin' | 'user' = 'user'
): Promise<string> {
  const magic = `tglm_${userId}_${Date.now()}_${Math.random()}`;
  const existing = await db.prepare('SELECT id FROM users WHERE id = ? OR telegram_id = ?').bind(userId, tgId).first<{ id: string }>();
  if (existing) {
    await db
      .prepare(`UPDATE users SET role = ?, web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`)
      .bind(role, magic, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, risk_terms_accepted_at, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001199', 1, datetime('now'), ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(userId, `${userId}@dollarino.local`, `v116_${userId}`, role, tgId, magic)
      .run();
  }
  const res = await worker.fetch(
    new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magic }),
    }),
    env
  );
  const j = (await res.json()) as { token: string };
  return j.token;
}

describe('V11.6 Trust Wallet DApp Integration, ECDSA Verification & Live 24/7 Execution', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: ['DB'],
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await db.prepare(stmt).run();
      }
    }
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_telegram_enabled', 'true')`).run();
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  beforeEach(() => {
    globalThis.fetch = realFetch;
  });

  it('verifies ECDSA ecrecover personal_sign, rejects mismatched signatures & blocks nonce replay', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_ecdsa_1', '7770001');

    const nonceRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/nonce', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(nonceRes.status).toBe(200);
    const { message } = (await nonceRes.json()) as { nonce: string; message: string };

    const privA = new Uint8Array(32).fill(11);
    const privB = new Uint8Array(32).fill(22);
    const signedA = signEip191(message, privA);
    const signedB = signEip191(message, privB);

    // 1. Forged address mismatch (address B + signature A) must fail 401
    const badRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evmAddress: signedB.address,
          signature: signedA.signature,
          signedMessage: message,
        }),
      }),
      env
    );
    expect(badRes.status).toBe(401);

    // 2. Valid signature for address A succeeds & marks verified=true
    const okRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evmAddress: signedA.address,
          signature: signedA.signature,
          signedMessage: message,
        }),
      }),
      env
    );
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as { verified: boolean };
    expect(okJson.verified).toBe(true);

    // 3. Replaying the same one-time nonce must fail 401
    const replayRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evmAddress: signedA.address,
          signature: signedA.signature,
          signedMessage: message,
        }),
      }),
      env
    );
    expect(replayRes.status).toBe(401);
  });

  it('strips placeholder receiver wallet addresses in Trust Wallet status and dedupes exchange markets cleanly', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_placeholder_chk', '7770002');
    await db
      .prepare(
        `INSERT INTO system_settings (key, value) VALUES ('usdt_trc20_wallet', 'YourTRC20WalletAddressHere')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run();

    const stRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(stRes.status).toBe(200);
    const stJson = (await stRes.json()) as { platformReceivers: { trc20: string } };
    expect(stJson.platformReceivers.trc20).toBe('');

    const deduped = dedupeMarketsBySymbol([
      { symbol: 'BTC-USDT', exchangeSymbol: 'BTC-USDT', base: 'BTC', quote: 'USDT', lastPrice: '90000', changePct24h: '1', high24h: '91000', low24h: '89000', volume24h: 1000, maxLeverage: 50, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
      { symbol: 'BTCUSDT', exchangeSymbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', lastPrice: '90010', changePct24h: '1.2', high24h: '91000', low24h: '89000', volume24h: 50000, maxLeverage: 50, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
      { symbol: 'BTC_USDT', exchangeSymbol: 'BTC_USDT', base: 'BTC', quote: 'USDT', lastPrice: '90005', changePct24h: '1.1', high24h: '91000', low24h: '89000', volume24h: 5000, maxLeverage: 50, basePrecision: 3, quotePrecision: 2, minTradeVolume: '0.001', status: 'OPEN' },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.symbol).toBe('BTCUSDT');
    expect(deduped[0]!.volume24h).toBe(50000);
  });

  it('registers 1-click Hyperliquid ApproveAgent via /api/dex/perp-approve-agent and builds live EVM & Solana swaps', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, 'usr_dapp_perp_1', '7770003');

    const agentPrivHex = '0x' + '44'.repeat(32);
    const agentAddress = deriveEvmAddressFromPrivateKey(agentPrivHex);
    const masterAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (u.includes('api.hyperliquid.xyz/exchange')) {
        return new Response(JSON.stringify({ status: 'ok', response: { type: 'default' } }), { status: 200 });
      }
      if (u.includes('api.hyperliquid.xyz/info')) {
        return new Response(JSON.stringify({ marginSummary: { accountValue: '250.0' }, withdrawable: '220.0', assetPositions: [] }), { status: 200 });
      }
      if (u.includes('api.dexscreener.com')) {
        return new Response(JSON.stringify({ pairs: [{ chainId: 'bsc', priceUsd: '600', liquidity: { usd: 500000 } }] }), { status: 200 });
      }
      if (u.includes('quote-api.jup.ag/v6/quote')) {
        return new Response(JSON.stringify({ outAmount: '123456', priceImpactPct: '0.1' }), { status: 200 });
      }
      if (u.includes('quote-api.jup.ag/v6/swap')) {
        return new Response(JSON.stringify({ swapTransaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    // 1. Mismatched agent key/address rejected
    const badApprove = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-approve-agent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterAddress,
          agentAddress: '0x1111111111111111111111111111111111111111',
          agentPrivateKey: agentPrivHex,
          nonce: Date.now(),
          signature: { r: '0x' + 'aa'.repeat(32), s: '0x' + 'bb'.repeat(32), v: 27 },
        }),
      }),
      env
    );
    expect(badApprove.status).toBe(400);

    // 2. Valid ApproveAgent stores encrypted key & marks AGENT_WALLET mode
    const goodApprove = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-approve-agent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterAddress,
          agentAddress,
          agentPrivateKey: agentPrivHex,
          agentName: 'Dollarino24x7',
          nonce: Date.now(),
          signature: { r: '0x' + 'aa'.repeat(32), s: '0x' + 'bb'.repeat(32), v: 28 },
        }),
      }),
      env
    );
    expect(goodApprove.status).toBe(200);
    const approveJson = (await goodApprove.json()) as { ok: boolean; mode: string; hasAgentKey: boolean };
    expect(approveJson.ok).toBe(true);
    expect(approveJson.hasAgentKey).toBe(true);
    expect(approveJson.mode).toBe('AGENT_WALLET');

    // 3. Build BSC EVM swap transaction payload
    const evmSwapRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/build-swap-tx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'bsc',
          tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
          amountUsd: 50,
          userAddress: masterAddress,
          slippagePct: 5,
        }),
      }),
      env
    );
    expect(evmSwapRes.status).toBe(200);
    const evmSwap = (await evmSwapRes.json()) as { ok: boolean; kind: string; chainIdHex: string; tx: { to: string; data: string } };
    expect(evmSwap.ok).toBe(true);
    expect(evmSwap.kind).toBe('EVM_TX');
    expect(evmSwap.chainIdHex).toBe('0x38');
    expect(evmSwap.tx.data.startsWith('0xb6f9de95')).toBe(true);

    // 4. Build Solana Jupiter v6 swap transaction payload
    const solSwapRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/build-swap-tx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'solana',
          tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amountUsd: 30,
          userAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          slippagePct: 5,
        }),
      }),
      env
    );
    expect(solSwapRes.status).toBe(200);
    const solSwap = (await solSwapRes.json()) as { ok: boolean; kind: string; swapTransactionBase64: string };
    expect(solSwap.ok).toBe(true);
    expect(solSwap.kind).toBe('SOLANA_TX');
    expect(solSwap.swapTransactionBase64).toBeTruthy();
  });

  it('executes real on-chain Copy-Vault swap in Listing Sniper when LIVE + AUTO and funded', async () => {
    const env = makeEnv();
    const userId = 'usr_sniper_live_auto';
    await issueUserToken(env, userId, '7770004');
    await db
      .prepare(
        `UPDATE bot_configs
         SET bot_state = 'RUNNING_LIVE', trading_mode = 'LIVE', trading_mode_selected = 1,
             trade_execution_mode = 'AUTO', market_type = 'SPOT', strategy_key = 'dollarino_v01'
         WHERE user_id = ?`
      )
      .bind(userId)
      .run();

    // Ensure Copy-Vault exists first, then mock funded Solana balance + Jupiter + RPC sendTransaction
    const { ensureUserCopyVault } = await import('../dex/smart-copy.js');
    const vault = await ensureUserCopyVault(env, userId);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (u.includes('api.mainnet-beta.solana.com') || u.includes('helius-rpc')) {
        const bodyStr = String(init?.body || '');
        if (bodyStr.includes('getBalance')) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 1_500_000_000 } }), { status: 200 });
        }
        if (bodyStr.includes('sendTransaction')) {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '5MockSolanaLiveTxHash998877' }), { status: 200 });
        }
      }
      if (u.includes('api.dexscreener.com')) {
        return new Response(JSON.stringify({ pairs: [{ chainId: 'solana', priceUsd: '180' }] }), { status: 200 });
      }
      if (u.includes('quote-api.jup.ag/v6/quote')) {
        return new Response(JSON.stringify({ outAmount: '500000' }), { status: 200 });
      }
      if (u.includes('quote-api.jup.ag/v6/swap')) {
        // Minimal 1-signer versioned-like payload: [1 signer, 64 zero sig bytes, 8 message bytes]
        const buf = new Uint8Array(1 + 64 + 8);
        buf[0] = 1;
        return new Response(JSON.stringify({ swapTransaction: Buffer.from(buf).toString('base64') }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    expect(vault.solanaAddress).toBeTruthy();
    const cfg = await db.prepare('SELECT * FROM bot_configs WHERE user_id = ?').bind(userId).first<UserBotConfigRow>();
    const pick: SniperCandidate = {
      symbol: 'JUPGEM',
      name: 'Jup Gem',
      chainId: 'solana',
      tokenAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      pairAddress: 'Pair123',
      dexId: 'raydium',
      source: 'DEX_BOOM_MEME',
      safetyScore: 88,
      liquidityUsd: 200_000,
      priceUsd: 0.5,
      change5mPct: 4,
      change1hPct: 14,
      change24hPct: 40,
      volume24hUsd: 800_000,
      buys1h: 120,
      sells1h: 40,
      ageHours: 5,
      mcapUsd: 2_000_000,
      isOnCentralizedHint: false,
      riskFlags: [],
      trustWalletSwapUrl: 'https://link.trustwallet.com/open_url',
      dexScreenerUrl: 'https://dexscreener.com/solana/Pair123',
    };

    const res = await executeSniperBuyForCandidate({ env, userId, cfg: cfg!, pick, bypassDedupe: true });
    expect(res.ok).toBe(true);
    expect(res.tradeId).toBeTruthy();

    const trade = await db.prepare('SELECT status, tx_hash FROM dex_trades WHERE id = ?').bind(res.tradeId).first<{ status: string; tx_hash: string }>();
    expect(trade?.status).toBe('OPEN');
    expect(trade?.tx_hash).toBe('5MockSolanaLiveTxHash998877');
  });

  it('rejects LIVE LIMIT manual order without Agent Key/Exchange instead of using paper_balance, while allowing PAPER LIMIT', async () => {
    const env = makeEnv();
    const userId = 'usr_v116_limit';
    const token = await issueUserToken(env, userId, '99116004', 'user');

    await db
      .prepare(
        `UPDATE users
         SET phone_verified = 1,
             risk_terms_accepted_at = datetime('now'),
             trust_wallet_verified = 1,
             trust_wallet_address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
         WHERE id = ?`
      )
      .bind(userId)
      .run();

    // 1. LIVE without Agent Key or CEX -> must fail with AGENT_KEY_REQUIRED (never queue using $10k paper_balance)
    await db
      .prepare(`UPDATE bot_configs SET trading_mode = 'LIVE', trading_mode_selected = 1, paper_balance = '10000' WHERE user_id = ?`)
      .bind(userId)
      .run();

    const liveLimitRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/orders/manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'BTCUSDT',
          direction: 'LONG',
          orderType: 'LIMIT',
          limitPrice: '60000',
          leverage: 5,
          stopLoss: '58000',
          tp1: '63000',
        }),
      }),
      env
    );
    expect(liveLimitRes.status).toBe(400);
    const liveErr = (await liveLimitRes.json()) as { ok: boolean; code?: string };
    expect(liveErr.ok).toBe(false);
    expect(liveErr.code).toBe('AGENT_KEY_REQUIRED');

    // 2. PAPER mode -> queues LIMIT cleanly using paper_balance
    await db.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER' WHERE user_id = ?`).bind(userId).run();
    const paperLimitRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/orders/manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'BTCUSDT',
          direction: 'LONG',
          orderType: 'LIMIT',
          limitPrice: '60000',
          leverage: 5,
          stopLoss: '58000',
          tp1: '63000',
        }),
      }),
      env
    );
    expect(paperLimitRes.status).toBe(200);
    const paperJson = (await paperLimitRes.json()) as { ok: boolean; pendingOrderId?: string };
    expect(paperJson.ok).toBe(true);
    expect(paperJson.pendingOrderId).toBeTruthy();
  });

  it('removes default copy-traders, issues banking invoices, restores paper_balance on DEX/sniper close, and closes perp orders', async () => {
    const env = makeEnv();
    const userId = 'usr_banking_dex_close_1';
    const token = await issueUserToken(env, userId, '7770099');

    // 1. Default copy traders must be completely absent (empty array until admin adds real traders)
    const pubCopyRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/copy-traders'), env);
    expect(pubCopyRes.status).toBe(200);
    const pubCopyJson = (await pubCopyRes.json()) as { traders: Array<{ id: string }> };
    expect(pubCopyJson.traders).toEqual([]);

    // 2. PAPER Sniper / DEX position lifecycle -> close restores paper_balance & marks CLOSED
    await db.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER', paper_balance = 1000 WHERE user_id = ?`).bind(userId).run();
    const tradeId = 'dext_test_close_1';
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, tx_hash, status, opened_at)
         VALUES (?, ?, 'bsc', 'pancakeswap', '0xPair1234', '0xToken1234567890', 'PEPEBSC', 'USDT', 'BUY', 100, 1000, 0.1, 'PAPER_TEST_SNIPER_001', 'OPEN', datetime('now'))`
      )
      .bind(tradeId, userId)
      .run();

    // Update SL/TP1
    const patchRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/trustwallet/dex-trades/${tradeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopLossUsd: 0.08, tp1Usd: 0.2 }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    globalThis.fetch = vi.fn(async () => new Response('{"pairs":[]}', { status: 200 })) as typeof fetch;

    const dashRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(dashRes.status).toBe(200);
    const dashJson = (await dashRes.json()) as { dexTrades?: Array<{ id: string; status: string }> };
    expect((dashJson.dexTrades || []).some((d) => d.id === tradeId && d.status === 'OPEN')).toBe(true);

    // Close at $0.15 -> $150 returned (+$50 profit on $100 notional -> paper_balance 1000 + 150 = 1150)
    const closeDexRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/trustwallet/dex-trades/${tradeId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitPriceUsd: 0.15 }),
      }),
      env
    );
    expect(closeDexRes.status).toBe(200);
    const closeDexJson = (await closeDexRes.json()) as { ok: boolean; realizedPnlUsd: number; paperBalanceUsd: number | null };
    expect(closeDexJson.ok).toBe(true);
    expect(closeDexJson.realizedPnlUsd).toBeCloseTo(50, 2);
    expect(closeDexJson.paperBalanceUsd).toBeCloseTo(1150, 2);

    // 3. Treasury banking invoice endpoint & Perp DEX close
    await db
      .prepare(
        `INSERT INTO treasury_deposits (id, user_id, network, asset, receiver_address, amount_usd, tx_hash, sender_address, status, category, created_at)
         VALUES ('dep_inv_1', ?, 'BEP20', 'USDT', '0x2222222222222222222222222222222222222222', 25, '0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd', '0x1111111111111111111111111111111111111111', 'CONFIRMED', 'DEPOSIT', datetime('now'))`
      )
      .bind(userId)
      .run();

    const invRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/invoices', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(invRes.status).toBe(200);
    const invJson = (await invRes.json()) as { ok: boolean; invoices: Array<{ invoiceNo: string; amountUsd: number; status: string }> };
    expect(invJson.ok).toBe(true);
    expect(invJson.invoices.length).toBeGreaterThanOrEqual(1);
    expect(invJson.invoices[0]!.invoiceNo).toMatch(/^DLR-\d{8}-/);
    expect(invJson.invoices[0]!.amountUsd).toBe(25);

    // 4. Close perp order
    await db
      .prepare(
        `INSERT INTO perp_dex_orders (id, user_id, venue, symbol, side, leverage, margin_usd, entry_price, execution_kind, status, created_at)
         VALUES ('perp_close_1', ?, 'hyperliquid', 'BTC-PERP', 'LONG', 10, 100, 90000, 'AGENT_WALLET', 'OPEN', datetime('now'))`
      )
      .bind(userId)
      .run();

    const closePerpRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/dex/perp-orders/perp_close_1/close', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }),
      env
    );
    expect(closePerpRes.status).toBe(200);
    const closePerpJson = (await closePerpRes.json()) as { ok: boolean; status: string };
    expect(closePerpJson.ok).toBe(true);
    expect(closePerpJson.status).toBe('CLOSED');
  });

  it('supports Web3 EIP-191 signup/login, complete-profile, username/email login, TOTP 2FA challenge, and masks google_client_secret in admin overview', async () => {
    const env = makeEnv();

    // 1. Check providers — wallet starts disabled cleanly until admin enables it
    const provCleanRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/auth/providers'), env);
    expect(provCleanRes.status).toBe(200);
    const provCleanJson = (await provCleanRes.json()) as {
      walletAuthEnabled: boolean;
      telegramAuthEnabled: boolean;
      googleEnabled: boolean;
    };
    expect(provCleanJson.walletAuthEnabled).toBe(false);
    expect(provCleanJson.googleEnabled).toBe(false);

    // Enable wallet auth as admin and verify providers reflects it
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_wallet_enabled', 'true')`).run();
    invalidateSettingsCache(db);
    const provRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/auth/providers'), env);
    expect(provRes.status).toBe(200);
    const provJson = (await provRes.json()) as {
      walletAuthEnabled: boolean;
      telegramAuthEnabled: boolean;
      googleEnabled: boolean;
    };
    expect(provJson.walletAuthEnabled).toBe(true);
    expect(provJson.telegramAuthEnabled).toBe(true);
    expect(provJson.googleEnabled).toBe(false);

    // 2. Web3 wallet signup with real EIP-191 signature
    const priv = new Uint8Array(32).fill(7);
    const dummyInit = signEip191('init', priv);
    const nonceRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/wallet/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: dummyInit.address }),
      }),
      env
    );
    expect(nonceRes.status).toBe(200);
    const { nonce, message } = (await nonceRes.json()) as { nonce: string; message: string };
    const signed = signEip191(message, priv);

    const w3Res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: signed.address, signature: signed.signature, nonce }),
      }),
      env
    );
    expect(w3Res.status).toBe(200);
    const w3Json = (await w3Res.json()) as { token: string; user: { id: string; profile_completed: number; auth_provider: string } };
    expect(w3Json.token).toBeTruthy();
    expect(w3Json.user.profile_completed).toBe(0);
    expect(w3Json.user.auth_provider).toBe('wallet');

    // 3. Check username availability & complete profile
    const chkBad = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/check-username?username=ab', {
        headers: { Authorization: `Bearer ${w3Json.token}` },
      }),
      env
    );
    expect(((await chkBad.json()) as { available: boolean }).available).toBe(false);

    const chkGood = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/check-username?username=AliReza_Pro99', {
        headers: { Authorization: `Bearer ${w3Json.token}` },
      }),
      env
    );
    expect(((await chkGood.json()) as { available: boolean }).available).toBe(true);

    const compRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/complete-profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${w3Json.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'علیرضا تریدر',
          username: 'AliReza_Pro99',
          email: 'alireza99@example.com',
          password: 'MyStrongPassword123',
        }),
      }),
      env
    );
    expect(compRes.status).toBe(200);
    const compJson = (await compRes.json()) as { ok: boolean; user: { profile_completed: number; username: string; display_name: string } };
    expect(compJson.ok).toBe(true);
    expect(compJson.user.profile_completed).toBe(1);
    expect(compJson.user.username).toBe('AliReza_Pro99');

    // 4. Setup & enable Google Authenticator TOTP 2FA
    const setup2fa = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${w3Json.token}` },
      }),
      env
    );
    expect(setup2fa.status).toBe(200);
    const { secret, otpauthUri } = (await setup2fa.json()) as { secret: string; otpauthUri: string };
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(otpauthUri).toContain('otpauth://totp/');

    const code1 = await generateTotpCodeAt(secret);
    const enable2fa = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/2fa/enable', {
        method: 'POST',
        headers: { Authorization: `Bearer ${w3Json.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code1 }),
      }),
      env
    );
    expect(enable2fa.status).toBe(200);

    // 5. Login with username -> must trigger 2FA challenge, pending token blocked from protected routes, verify-login succeeds
    const loginRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alireza_pro99', password: 'MyStrongPassword123' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
    const loginJson = (await loginRes.json()) as {
      requires2fa?: boolean;
      tempToken?: string;
      challengeToken?: string;
    };
    expect(loginJson.requires2fa).toBe(true);
    const challengeJwt = loginJson.challengeToken || loginJson.tempToken || '';
    expect(challengeJwt).toBeTruthy();

    // Pending token cannot access protected dashboard
    const blockedDash = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${challengeJwt}` },
      }),
      env
    );
    expect(blockedDash.status).toBe(401);

    // Complete 2FA login
    const code2 = await generateTotpCodeAt(secret);
    const v2fa = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: challengeJwt, code: code2 }),
      }),
      env
    );
    expect(v2fa.status).toBe(200);
    const v2faJson = (await v2fa.json()) as { ok: boolean; token: string };
    expect(v2faJson.ok).toBe(true);
    expect(v2faJson.token).toBeTruthy();

    // 6. Admin secret masking: google_client_secret must come back masked as '********' and preserve on PUT
    const adminToken = await issueUserToken(env, 'usr_admin_mask_check', '944021185', 'owner');
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_client_id: 'gid-test-123.apps.googleusercontent.com',
          google_client_secret: 'GOCSPX-super-secret-value',
        }),
      }),
      env
    );

    const ovRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/overview', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env
    );
    expect(ovRes.status).toBe(200);
    const ovJson = (await ovRes.json()) as { settings: Record<string, string> };
    expect(ovJson.settings.google_client_id).toBe('gid-test-123.apps.googleusercontent.com');
    expect(ovJson.settings.google_client_secret).toBe('********');

    // Sending '********' back must NOT overwrite real secret
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_client_secret: '********' }),
      }),
      env
    );
    const rawSec = await db.prepare(`SELECT value FROM system_settings WHERE key = 'google_client_secret'`).first<{ value: string }>();
    expect(rawSec?.value).toBe('GOCSPX-super-secret-value');
  });

  it('settles debt first and credits overflow to fee_prepaid_credit_usd, cancels PENDING_SIGN DEX trades, and batch-closes all 4 position sources', async () => {
    const env = makeEnv();
    const userId = 'usr_unified_batch_settle_1';
    const token = await issueUserToken(env, userId, '7770199');

    // 1. Debt-first settlement + surplus prepaid credit
    await db
      .prepare(
        `UPDATE users SET fee_penalty_usd = 0.50, fee_prepaid_credit_usd = 0, fee_lock_status = 'LOCKED' WHERE id = ?`
      )
      .bind(userId)
      .run();
    await db
      .prepare(
        `INSERT INTO server_fee_ledger (id, user_id, trade_id, source, symbol, realized_pnl_usd, fee_pct, fee_usd, status, created_at)
         VALUES ('sf_debt_1', ?, 'tr_debt_1', 'CEX', 'BTCUSDT', 100, 3, 3.00, 'ACCRUED', datetime('now'))`
      )
      .bind(userId)
      .run();

    const { settleDebtFirstThenCredit } = await import('../services/treasury.js');
    const settleResult = await settleDebtFirstThenCredit(db, userId, 10.0, '0xdeadbeef_test_settle', {
      alsoCreditWalletBalance: false,
    });
    expect(settleResult.settledDebtUsd).toBeCloseTo(3.5, 2);
    expect(settleResult.addedCreditUsd).toBeCloseTo(6.5, 2);

    const usrAfter = await db
      .prepare(`SELECT fee_penalty_usd, fee_prepaid_credit_usd, fee_lock_status FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ fee_penalty_usd: number; fee_prepaid_credit_usd: number; fee_lock_status: string }>();
    expect(Number(usrAfter?.fee_penalty_usd)).toBe(0);
    expect(Number(usrAfter?.fee_prepaid_credit_usd)).toBeCloseTo(6.5, 2);
    expect(usrAfter?.fee_lock_status).toBe('ACTIVE');

    // 2. Cancel PENDING_SIGN DEX trade cleanly with zero PnL impact
    await db.prepare(`UPDATE bot_configs SET trading_mode = 'PAPER', paper_balance = 1000 WHERE user_id = ?`).bind(userId).run();
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, tx_hash, status, opened_at)
         VALUES ('dext_pending_1', ?, 'solana', 'raydium', 'PairP1', 'TokP1', 'BONKTEST', 'USDC', 'BUY', 50, 1000, 0.05, 'PENDING_SIGN_1', 'PENDING_SIGN', datetime('now'))`
      )
      .bind(userId)
      .run();

    const cancelRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/dex-trades/dext_pending_1/close', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(cancelRes.status).toBe(200);
    const cancelJson = (await cancelRes.json()) as { status: string; realizedPnlUsd: number };
    expect(cancelJson.status).toBe('CANCELLED');
    expect(cancelJson.realizedPnlUsd).toBe(0);

    // 3. Seed open positions across CEX, DEX, Smart Copy V2 & Perp DEX -> test live-ticks & batch close profitable
    await db
      .prepare(
        `INSERT INTO trades (id, client_id, user_id, strategy_key, exchange_provider, mode, market_type, symbol, direction, leverage, entry_price, initial_quantity, remaining_quantity, margin_used, initial_stop_loss, current_stop_loss, tp1, status, opened_at)
         VALUES ('tr_cex_win', 'cli_cex_win', ?, 'dollarino_v01', 'paper', 'PAPER', 'FUTURES', 'BTCUSDT', 'LONG', 5, '80000', '0.01', '0.01', '160', '78000', '78000', '90000', 'OPEN', datetime('now'))`
      )
      .bind(userId)
      .run();
    await db
      .prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, tx_hash, status, opened_at)
         VALUES ('dext_win_1', ?, 'bsc', 'pancakeswap', 'PairW1', 'TokW1', 'WIFTEST', 'USDT', 'BUY', 100, 100, 1.0, 'PAPER_WIN_1', 'OPEN', datetime('now'))`
      )
      .bind(userId)
      .run();
    await db
      .prepare(
        `INSERT INTO copy_positions_v2 (id, user_id, rule_id, trader_kind, trader_id, trader_label, execution_mode, chain_id, dex_name, token_address, token_symbol, token_name, direction, margin_usd, entry_price_usd, current_price_usd, qty_tokens, pnl_usd, pnl_pct, status, opened_at)
         VALUES ('cpv2_loss_1', ?, 'rule_test_1', 'SMART_WALLET', 'ctv2_1', 'WhaleTest', 'PAPER_SIMULATOR', 'ethereum', 'uniswap', '0xTokLoss', 'LOSSTOK', 'Loss Tok', 'BUY', 100, 2.0, 1.5, 50, -25, -25, 'OPEN', datetime('now'))`
      )
      .bind(userId)
      .run();
    await db
      .prepare(
        `INSERT INTO perp_dex_orders (id, user_id, venue, symbol, side, leverage, margin_usd, entry_price, execution_kind, status, created_at)
         VALUES ('perp_win_1', ?, 'hyperliquid', 'BTC-PERP', 'LONG', 10, 100, 80000, 'PAPER_SIMULATOR', 'OPEN', datetime('now'))`
      )
      .bind(userId)
      .run();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (u.includes('fapi.bitunix.com')) {
        return new Response(JSON.stringify({ code: 0, data: [{ symbol: 'BTCUSDT', lastPrice: '88000', last: '88000' }] }), { status: 200 });
      }
      if (u.includes('binance.com') && u.includes('ticker/price')) {
        return new Response(JSON.stringify({ symbol: 'BTCUSDT', price: '88000' }), { status: 200 });
      }
      if (u.includes('api.dexscreener.com/token-pairs')) {
        if (u.includes('TokW1')) {
          return new Response(JSON.stringify([{ chainId: 'bsc', dexId: 'pancakeswap', pairAddress: 'PairW1', baseToken: { address: 'TokW1', symbol: 'WIFTEST' }, quoteToken: { symbol: 'USDT' }, priceUsd: '1.5', liquidity: { usd: 50000 } }]), { status: 200 });
        }
        return new Response(JSON.stringify([{ chainId: 'ethereum', dexId: 'uniswap', pairAddress: 'PairL1', baseToken: { address: '0xTokLoss', symbol: 'LOSSTOK' }, quoteToken: { symbol: 'USDT' }, priceUsd: '1.5', liquidity: { usd: 50000 } }]), { status: 200 });
      }
      if (u.includes('api.dexscreener.com')) {
        return new Response(
          JSON.stringify({
            pairs: [
              { chainId: 'bsc', baseToken: { address: 'TokW1', symbol: 'WIFTEST' }, priceUsd: '1.5' },
              { chainId: 'ethereum', baseToken: { address: '0xTokLoss', symbol: 'LOSSTOK' }, priceUsd: '1.5' },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const ticksRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/live-ticks', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(ticksRes.status).toBe(200);
    const ticksJson = (await ticksRes.json()) as {
      ok: boolean;
      openTrades: Array<{ id: string }>;
      dexTrades: Array<{ id: string }>;
      smartCopyPositions: Array<{ id: string }>;
      perpOrders: Array<{ id: string }>;
    };
    expect(ticksJson.ok).toBe(true);
    expect(ticksJson.openTrades.length).toBe(1);
    expect(ticksJson.dexTrades.some((d) => d.id === 'dext_win_1')).toBe(true);
    expect(ticksJson.smartCopyPositions.length).toBe(1);
    expect(ticksJson.perpOrders.length).toBe(1);

    // Batch close ALL_PROFITABLE -> closes CEX (+$80), DEX (+$50), and Perp (+$100), keeps losing smart copy open
    const batchWinRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/positions/close-batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'ALL_PROFITABLE' }),
      }),
      env
    );
    expect(batchWinRes.status).toBe(200);
    const batchWin = (await batchWinRes.json()) as { ok: boolean; closedCount: number; closedIds: string[] };
    expect(batchWin.ok).toBe(true);
    expect(batchWin.closedCount).toBe(3);

    // Verify losing smart copy is still OPEN, then close ALL_LOSING
    const batchLossRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/positions/close-batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'ALL_LOSING' }),
      }),
      env
    );
    expect(batchLossRes.status).toBe(200);
    const batchLoss = (await batchLossRes.json()) as { ok: boolean; closedCount: number };
    expect(batchLoss.ok).toBe(true);
    expect(batchLoss.closedCount).toBe(1);
  });
});

