import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTokenRugAndSafetyScan } from '../dex/smart-copy.js';
import type { Env } from '../env.js';
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
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-tw-redesign',
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

async function issueUserToken(env: Env, userId: string, tgId: string): Promise<string> {
  const magic = `tglm_${userId}_${Date.now()}_${Math.random()}`;
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE users SET role = 'owner', web_magic_token = ?, web_magic_expires_at = datetime('now', '+15 minutes') WHERE id = ?`
      )
      .bind(magic, userId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, telegram_id, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
         VALUES (?, ?, 'tw_tester', 'x', 'owner', ?, '+989120001122', 1, ?, datetime('now', '+15 minutes'), 0)`
      )
      .bind(userId, `${userId}@dollarino.local`, tgId, magic)
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
    d1Databases: { DB: 'test-tw-redesign-db' },
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
});

afterAll(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = realFetch;
  await mf?.dispose();
});

beforeEach(() => {
  globalThis.fetch = realFetch;
});

describe('Trust Wallet Exclusive Redesign & 24/7 Controls', () => {
  it('toggles Manual Approval vs 24/7 Full Auto-Trade cleanly and reports wallet permissions', async () => {
    const env = makeEnv();
    const userId = 'usr_tw_redesign_1';
    const token = await issueUserToken(env, userId, '778899110');

    await db
      .prepare(
        `INSERT OR REPLACE INTO bot_configs (user_id, webhook_secret, trading_mode, trade_execution_mode, paper_balance)
         VALUES (?, 'wh_tw_test_1', 'PAPER', 'AUTO', '10000')`
      )
      .bind(userId)
      .run();

    // Provision Copy-Vault cleanly via API
    await worker.fetch(
      new Request('https://dollarino.pages.dev/api/copy-trade/vault', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );

    const getRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const initial = (await getRes.json()) as {
      ok: boolean;
      executionMode: string;
      tradingMode: string;
      demoSimulatorBalance: number;
      permissions: { copyVaultReady: boolean; perpAgentConnected: boolean };
    };
    expect(initial.ok).toBe(true);
    expect(initial.executionMode).toBe('AUTO');
    expect(initial.tradingMode).toBe('PAPER');
    expect(initial.demoSimulatorBalance).toBe(10000);
    expect(initial.permissions.copyVaultReady).toBe(true);
    expect(initial.permissions.perpAgentConnected).toBe(false);

    const setManual = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ executionMode: 'MANUAL_CONFIRM', syncCopyRules: true }),
      }),
      env
    );
    expect(setManual.status).toBe(200);
    const manualJson = (await setManual.json()) as { ok: boolean; executionMode: string };
    expect(manualJson.executionMode).toBe('MANUAL_CONFIRM');

    const cfgRow = await db
      .prepare('SELECT trade_execution_mode FROM bot_configs WHERE user_id = ?')
      .bind(userId)
      .first<{ trade_execution_mode: string }>();
    expect(cfgRow?.trade_execution_mode).toBe('MANUAL_CONFIRM');

    const setAuto = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/execution-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ executionMode: 'AUTO', tradingMode: 'PAPER' }),
      }),
      env
    );
    expect(setAuto.status).toBe(200);
    const autoJson = (await setAuto.json()) as { ok: boolean; executionMode: string };
    expect(autoJson.executionMode).toBe('AUTO');
  });

  it('requires connected Trust Wallet / Perp Agent before launching LIVE bot mode', async () => {
    const env = makeEnv();
    const userId = 'usr_tw_redesign_live';
    const token = await issueUserToken(env, userId, '778899111');

    await db
      .prepare(
        `INSERT OR REPLACE INTO bot_configs (user_id, webhook_secret, trading_mode, trade_execution_mode, paper_balance)
         VALUES (?, 'wh_tw_test_2', 'LIVE', 'AUTO', '10000')`
      )
      .bind(userId)
      .run();

    const startRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ strategyKey: 'dollarino_ai', acceptRiskTerms: true }),
      }),
      env
    );
    expect(startRes.status).toBe(400);
    const body = (await startRes.json()) as { error: string; code: string };
    expect(body.code).toBe('NO_TRUST_WALLET');
    expect(body.error).toContain('Trust Wallet');
  });

  it('exposes clean Trust Wallet plans without legacy CEX names on public /api/public/plans', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://dollarino.pages.dev/api/public/plans'), env);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw.toLowerCase()).not.toContain('toobit');
    expect(raw.toLowerCase()).not.toContain('bitunix');
    expect(raw.toLowerCase()).not.toContain('kcex');
  });

  it('includes tokenAgeHours in TokenRugSafetyReport and flags pools younger than 6h', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('dexscreener.com')) {
        return new Response(
          JSON.stringify({
            pairs: [
              {
                chainId: 'solana',
                liquidity: { usd: 80_000 },
                pairCreatedAt: Date.now() - 2 * 3600_000,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes('rugcheck.xyz')) {
        return new Response(
          JSON.stringify({
            score: 120,
            tokenMeta: { mutable: false },
            markets: [{ lp: { lpLockedPct: 98 } }],
            topHolders: [{ pct: 8 }, { pct: 5 }],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const env = makeEnv();
    const report = await runTokenRugAndSafetyScan(
      env,
      'solana',
      'So11111111111111111111111111111111111111112',
      {
        chainId: 'solana',
        dexId: 'raydium',
        url: 'https://dexscreener.com/solana/test',
        pairAddress: 'SoPair1',
        baseToken: { address: 'So11111111111111111111111111111111111111112', name: 'TestSol', symbol: 'TSOL' },
        quoteToken: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USD Coin', symbol: 'USDC' },
        priceUsd: '1.25',
        pairCreatedAt: Date.now() - 2 * 3600_000,
        liquidity: { usd: 80_000 },
        safetyScore: 80,
        riskFlags: [],
        isOnCentralizedHint: false,
        trustWallet: {
          chainId: 'solana',
          coinId: 501,
          dexName: 'Jupiter',
          swapUrl: 'https://jup.ag',
          trustWalletDappUrl: 'https://link.trustwallet.com/open_url',
          dexScreenerUrl: 'https://dexscreener.com',
        },
      }
    );
    expect(report.tokenAgeHours).not.toBeNull();
    expect(report.tokenAgeHours!).toBeLessThan(6);
    expect(report.flags.some((f: string) => f.includes('توکن بسیار تازه'))).toBe(true);
  });

  it('generates direct Trust Wallet DApp handoff auto-login links and saves all 4 chain addresses atomically', async () => {
    const env = makeEnv();
    const userId = 'usr_tw_handoff_1';
    const token = await issueUserToken(env, userId, '778899222');

    // 1) Request DApp handoff link (used when user taps top Wallet button outside Trust Wallet browser)
    const handoffRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/dapp-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin: 'https://dollarino.pages.dev' }),
      }),
      env
    );
    expect(handoffRes.status).toBe(200);
    const handoff = (await handoffRes.json()) as {
      ok: boolean;
      targetUrl: string;
      universalLink: string;
      deepLink: string;
      expiresInSeconds: number;
    };
    expect(handoff.ok).toBe(true);
    expect(handoff.universalLink).toContain('https://link.trustwallet.com/open_url?');
    expect(handoff.deepLink).toContain('trust://open_url?');
    expect(handoff.targetUrl).toContain('tw_autoconnect=1');
    expect(handoff.targetUrl).toContain('tab=dex');

    // 2) Verify the handoff token logs the user in seamlessly inside Trust Wallet DApp Browser
    const tgLoginParam = new URL(handoff.targetUrl).searchParams.get('tg_login');
    expect(tgLoginParam).toBeTruthy();
    const magicLoginRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tgLoginParam }),
      }),
      env
    );
    expect(magicLoginRes.status).toBe(200);
    const magicJson = (await magicLoginRes.json()) as { token: string; user: { id: string } };
    expect(magicJson.user.id).toBe(userId);

    // 3) Connect ALL 4 chain families simultaneously inside Trust Wallet
    const connectAllRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({
          evmAddress: '0x1111111111111111111111111111111111111111',
          solanaAddress: 'So11111111111111111111111111111111111111112',
          tronAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
          tonAddress: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
          signature: '0x' + 'ab'.repeat(65),
          signedMessage: 'Dollarino Trust Wallet Verification',
        }),
      }),
      env
    );
    expect(connectAllRes.status).toBe(200);

    const statusRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trustwallet/status', {
        headers: { Authorization: `Bearer ${magicJson.token}` },
      }),
      env
    );
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as {
      connected: boolean;
      wallet: {
        evmAddress: string;
        solanaAddress: string;
        tronAddress: string;
        tonAddress: string;
        verified: boolean;
      };
    };
    expect(statusJson.connected).toBe(true);
    expect(statusJson.wallet.evmAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(statusJson.wallet.solanaAddress).toBe('So11111111111111111111111111111111111111112');
    expect(statusJson.wallet.tronAddress).toBe('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb');
    expect(statusJson.wallet.tonAddress).toBe('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
    expect(statusJson.wallet.verified).toBe(true);
  });
});
