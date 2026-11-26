import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildV2SwapExactEthForTokensCalldata,
  bytesToHex,
  deriveEvmAddressFromPrivateKey,
  hexToBytes,
  msgpackEncode,
  rlpEncode,
  signEip1559Transaction,
  signHyperliquidL1Action,
} from '../dex/evm-tx.js';
import { recordPerpDexOrder, savePerpDexConnection } from '../dex/perp-dex.js';
import type { Env } from '../env.js';
import worker from '../index.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;
const telegramCalls: Array<{ url: string; body: string }> = [];

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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-wave5',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:TEST_BOT_TOKEN',
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

async function issueUserToken(
  env: Env,
  opts: { id: string; role: 'OWNER' | 'user'; telegramId: string; username: string }
): Promise<string> {
  const magic = `tglm_${opts.id}_${Date.now()}_${Math.random()}`;
  const existing = await db
    .prepare(`SELECT id FROM users WHERE telegram_id = ? LIMIT 1`)
    .bind(opts.telegramId)
    .first<{ id: string }>();

  let targetUserId = opts.id;
  if (existing) {
    targetUserId = existing.id;
    await db
      .prepare(
        `UPDATE users SET role = ?, web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`
      )
      .bind(opts.role, magic, targetUserId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, ?, 'x', ?, ?, '+989120001122', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(opts.id, `${opts.id}@dollarino.local`, opts.username, opts.role, opts.telegramId, magic)
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
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error(`Token issue failed: ${JSON.stringify(data)}`);
  return data.token;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'test-wave5-db' },
  });
  db = await mf.getD1Database('DB');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migDir = path.resolve(__dirname, '../../../../migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    for (const stmt of splitSqlStatements(sql)) {
      await db.prepare(stmt).run();
    }
  }
  await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('auth_telegram_enabled', 'true')`).run();
});

afterAll(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = realFetch;
  await mf.dispose();
});

beforeEach(() => {
  telegramCalls.length = 0;
});

describe('Wave 5 On-Chain EVM EIP-1559 & Hyperliquid EIP-712 Crypto', () => {
  it('encodes canonical RLP items and signs recoverable EIP-1559 transactions', () => {
    expect(bytesToHex(rlpEncode(new Uint8Array(0)))).toBe('80');
    expect(bytesToHex(rlpEncode(new Uint8Array([0x2a])))).toBe('2a');
    expect(bytesToHex(rlpEncode([new Uint8Array([0x01]), new Uint8Array([0x02])]))).toBe('c20102');

    const privHex = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
    const expectedFrom = deriveEvmAddressFromPrivateKey(privHex);
    expect(expectedFrom).toMatch(/^0x[a-f0-9]{40}$/);

    const tx = {
      chainId: 56,
      nonce: 3n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 5_000_000_000n,
      gasLimit: 21_000n,
      to: '0x1111111111111111111111111111111111111111',
      valueWei: 100_000_000_000_000_000n,
      dataHex: '0x',
    };

    const signed = signEip1559Transaction(privHex, tx);
    expect(signed.from).toBe(expectedFrom);
    expect(signed.rawTxHex.startsWith('0x02')).toBe(true);
    expect(signed.txHash).toMatch(/^0x[a-f0-9]{64}$/);

    // Verify txHash = keccak256(rawTx)
    expect('0x' + bytesToHex(keccak_256(hexToBytes(signed.rawTxHex)))).toBe(signed.txHash);

    // Recompute unsigned digest and check secp256k1 signature recovers expectedFrom
    const unsignedBytes = hexToBytes(
      '0x02' +
        bytesToHex(
          rlpEncode([
            hexToBytes('38'),
            hexToBytes('03'),
            hexToBytes('3b9aca00'),
            hexToBytes('012a05f200'),
            hexToBytes('5208'),
            hexToBytes(tx.to),
            hexToBytes('016345785d8a0000'),
            new Uint8Array(0),
            [],
          ])
        )
    );
    const sig = secp256k1.sign(keccak_256(unsignedBytes), hexToBytes(privHex), {
      prehash: false,
      lowS: true,
      format: 'recovered',
    });
    const recPoint = secp256k1.recoverPublicKey(sig, keccak_256(unsignedBytes), { prehash: false });
    const recUncomp = secp256k1.Point.fromBytes(recPoint).toBytes(false);
    const recAddr = '0x' + bytesToHex(keccak_256(recUncomp.slice(1)).slice(-20));
    expect(recAddr).toBe(expectedFrom);
  });

  it('builds valid Uniswap/Pancake V2 swapExactETHForTokens calldata', () => {
    const calldata = buildV2SwapExactEthForTokensCalldata(
      12345n,
      ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0x55d398326f99059fF775485246999027B3197955'],
      '0x2222222222222222222222222222222222222222',
      1799999999n
    );
    expect(calldata.startsWith('0xb6f9de95')).toBe(true);
    // 4-byte selector (8 hex) + 7 x 32-byte ABI words (448 hex) = 456 chars + '0x' = 458
    expect(calldata.length).toBe(458);
  });

  it('encodes MsgPack and signs verifiable Hyperliquid L1 Agent EIP-712 actions', () => {
    const mp = msgpackEncode({ type: 'order', a: 0, b: true });
    expect(mp[0]).toBe(0x83); // map of 3 elements

    const agentPriv = '0x7777777777777777777777777777777777777777777777777777777777777777';
    const action = {
      type: 'order',
      orders: [{ a: 0, b: true, p: '92500', s: '0.01', r: false, t: { limit: { tif: 'Ioc' } } }],
      grouping: 'na',
    };
    const nonce = 1760000000123;
    const res = signHyperliquidL1Action({
      agentPrivateKeyHex: agentPriv,
      action,
      nonce,
      isMainnet: true,
    });

    expect(res.signature.r).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.signature.s).toMatch(/^0x[a-f0-9]{64}$/);
    expect([27, 28]).toContain(res.signature.v);
    expect(res.signerAddress).toBe(deriveEvmAddressFromPrivateKey(agentPriv));

    // Independently recover EIP-712 signer address
    const enc = new TextEncoder();
    const domainTypeHash = keccak_256(
      enc.encode('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    );
    const chainWord = new Uint8Array(32);
    chainWord[30] = 0x05;
    chainWord[31] = 0x39; // 1337
    const domainSep = keccak_256(
      new Uint8Array([
        ...domainTypeHash,
        ...keccak_256(enc.encode('Exchange')),
        ...keccak_256(enc.encode('1')),
        ...chainWord,
        ...new Uint8Array(32),
      ])
    );
    const agentType = keccak_256(enc.encode('Agent(string source,bytes32 connectionId)'));
    const structHash = keccak_256(
      new Uint8Array([...agentType, ...keccak_256(enc.encode('a')), ...hexToBytes(res.connectionId)])
    );
    const digest = keccak_256(new Uint8Array([0x19, 0x01, ...domainSep, ...structHash]));

    const recSig = new Uint8Array(65);
    recSig[0] = res.signature.v - 27;
    recSig.set(hexToBytes(res.signature.r), 1);
    recSig.set(hexToBytes(res.signature.s), 33);
    const recPub = secp256k1.recoverPublicKey(recSig, digest, { prehash: false });
    const recUncomp = secp256k1.Point.fromBytes(recPub).toBytes(false);
    const recAddr = '0x' + bytesToHex(keccak_256(recUncomp.slice(1)).slice(-20));
    expect(recAddr).toBe(res.signerAddress);
  });
});

describe('Wave 5 Copy-Vault Direct Withdraw & Live Hyperliquid Order Integration', () => {
  it('enforces 2FA Telegram PIN and executes direct EVM & Solana Copy-Vault withdrawals', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, {
      id: 'u_w5_vault',
      role: 'user',
      telegramId: '555111222',
      username: 'vault_withdrawer',
    });

    let sentRawTxHex = '';
    let sentSolTx = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      if (url.includes('api.telegram.org')) {
        telegramCalls.push({ url, body: bodyStr });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), { status: 200 });
      }
      if (url.includes('bsc') || url.includes('binance')) {
        const rpc = JSON.parse(bodyStr) as { method: string; params: unknown[] };
        if (rpc.method === 'eth_getBalance') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0de0b6b3a7640000' }), { status: 200 }); // 1 BNB
        }
        if (rpc.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2' }), { status: 200 });
        }
        if (rpc.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x3b9aca00' }), { status: 200 });
        }
        if (rpc.method === 'eth_sendRawTransaction') {
          sentRawTxHex = String(rpc.params[0] || '');
          const hash = '0x' + bytesToHex(keccak_256(hexToBytes(sentRawTxHex)));
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: hash }), { status: 200 });
        }
      }
      if (url.includes('solana')) {
        const rpc = JSON.parse(bodyStr) as { method: string; params: unknown[] };
        if (rpc.method === 'getBalance') {
          return new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 2_000_000_000 } }), // 2 SOL
            { status: 200 }
          );
        }
        if (rpc.method === 'getLatestBlockhash') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: { value: { blockhash: '11111111111111111111111111111111' } },
            }),
            { status: 200 }
          );
        }
        if (rpc.method === 'sendTransaction') {
          sentSolTx = String(rpc.params[0] || '');
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
            }),
            { status: 200 }
          );
        }
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    // 1. Provision Copy-Vault
    const vRes = await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(vRes.status).toBe(200);

    // 2. Request 2FA Telegram PIN
    const pinRes = await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault/request-pin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(pinRes.status).toBe(200);
    const pinText = (JSON.parse(telegramCalls[telegramCalls.length - 1]!.body) as { text: string }).text;
    const pinMatch = pinText.match(/\b(\d{6})\b/);
    expect(pinMatch).toBeTruthy();
    const pin = pinMatch![1]!;

    // 3. Wrong PIN must reject (403)
    const badRes = await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault/withdraw', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'bsc',
          toAddress: '0x3333333333333333333333333333333333333333',
          amountNative: 0.05,
          pinCode: '000000',
        }),
      }),
      env
    );
    expect(badRes.status).toBe(403);

    // 4. Valid PIN executes signed BSC EIP-1559 withdrawal
    const okEvm = await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault/withdraw', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'bsc',
          toAddress: '0x3333333333333333333333333333333333333333',
          amountNative: 0.05,
          pinCode: pin,
        }),
      }),
      env
    );
    const okEvmJson = (await okEvm.json()) as { ok: boolean; txHash: string; symbol: string };
    expect(okEvm.status).toBe(200);
    expect(okEvmJson.ok).toBe(true);
    expect(okEvmJson.symbol).toBe('BNB');
    expect(sentRawTxHex.startsWith('0x02')).toBe(true);
    expect(okEvmJson.txHash).toMatch(/^0x[a-f0-9]{64}$/);

    // 5. Request fresh PIN and test Solana Vault-to-Trust-Wallet SystemProgram transfer
    telegramCalls.length = 0;
    await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault/request-pin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    const pin2Text = (JSON.parse(telegramCalls[telegramCalls.length - 1]!.body) as { text: string }).text;
    const pin2 = pin2Text.match(/\b(\d{6})\b/)![1]!;
    const okSol = await worker.fetch(
      new Request('http://localhost/api/copy-trade/vault/withdraw', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 'solana',
          toAddress: '11111111111111111111111111111111',
          amountNative: 0.1,
          pinCode: pin2,
        }),
      }),
      env
    );
    const okSolJson = (await okSol.json()) as { ok: boolean; txHash: string; symbol: string };
    expect(okSol.status).toBe(200);
    expect(okSolJson.symbol).toBe('SOL');
    expect(sentSolTx.length).toBeGreaterThan(80);

    const audit = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM audit_logs WHERE category = 'VAULT_WITHDRAW'`)
      .first<{ cnt: number }>();
    expect(Number(audit?.cnt || 0)).toBe(2);
  });

  it('signs and submits live Hyperliquid L1 Agent orders in recordPerpDexOrder', async () => {
    const env = makeEnv();
    const token = await issueUserToken(env, {
      id: 'u_w5_hl',
      role: 'user',
      telegramId: '555333444',
      username: 'hl_trader',
    });
    expect(token.length).toBeGreaterThan(10);

    const agentPriv = '0x9999999999999999999999999999999999999999999999999999999999999999';
    const agentAddr = deriveEvmAddressFromPrivateKey(agentPriv);
    await savePerpDexConnection(env, 'u_w5_hl', {
      venue: 'hyperliquid',
      masterAddress: '0x4444444444444444444444444444444444444444',
      agentAddress: agentAddr,
      agentPrivateKey: agentPriv,
    });

    let capturedExchangePayload: Record<string, unknown> | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      if (url === 'https://api.hyperliquid.xyz/info') {
        return new Response(
          JSON.stringify([
            { universe: [{ name: 'BTC', szDecimals: 4 }, { name: 'ETH', szDecimals: 3 }] },
            [{ markPx: '95000.0' }, { markPx: '3200.0' }],
          ]),
          { status: 200 }
        );
      }
      if (url === 'https://api.hyperliquid.xyz/exchange') {
        capturedExchangePayload = JSON.parse(bodyStr) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            status: 'ok',
            response: {
              type: 'order',
              data: {
                statuses: [{ filled: { oid: 987654321, totalSz: '0.0052', avgPx: '95010' } }],
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    const orderRes = await recordPerpDexOrder(env, 'u_w5_hl', {
      venue: 'hyperliquid',
      symbol: 'BTCUSDT',
      side: 'LONG',
      leverage: 10,
      marginUsd: 50,
      entryPrice: 95000,
    });

    expect(orderRes.ok).toBe(true);
    expect(orderRes.note).toContain('987654321');
    expect(capturedExchangePayload).toBeTruthy();
    const payloadObj = capturedExchangePayload as unknown as {
      action: { type: string };
      signature: { r: string; s: string; v: number };
    };
    expect(payloadObj.action.type).toBe('order');
    const sig = payloadObj.signature;
    expect(sig.r).toMatch(/^0x[a-f0-9]{64}$/);
    expect([27, 28]).toContain(sig.v);

    const row = await db
      .prepare(`SELECT execution_kind, external_order_id, status FROM perp_dex_orders WHERE id = ?`)
      .bind(orderRes.orderId)
      .first<{ execution_kind: string; external_order_id: string | null; status: string }>();
    expect(row?.execution_kind).toBe('HYPERLIQUID_AGENT_LIVE');
    expect(row?.external_order_id).toBe('987654321');
    expect(row?.status).toBe('FILLED');
  });
});
