import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { buildMultiDappRoutes } from '../dex/screener.js';
import {
  ensureUserCopyVault,
  exportUserCopyVaultKeys,
  listOnchainApiProviders,
  resolveOnchainApiKey,
  saveOnchainApiProviderKey,
  simulateWalletCopyBacktest,
  type SmartWalletTraderRow,
} from '../dex/smart-copy.js';

let mf: Miniflare;
let db: D1Database;

function createTestEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {} as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'test-jwt-secret-smart-copy-v2',
    MASTER_ENCRYPTION_KEY: 'test-master-encryption-key-32-bytes!',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
  };
}

describe('Smart On-Chain & Multi-Chain Copy-Trading V2', () => {
  beforeAll(async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const mig0027 = fs.readFileSync(path.resolve(here, '../../../../migrations/0027_smart_copy_trading_v2.sql'), 'utf8');
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-smart-copy-v2' },
    });
    db = await mf.getD1Database('DB');
    const cleanSql = mig0027.replace(/^\s*--.*$/gm, '');
    const stmts = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const st of stmts) {
      await db.prepare(st).run();
    }
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('builds multi-DApp Trust Wallet routes across Solana, BSC, Base, TON, and TRON', () => {
    const solRoutes = buildMultiDappRoutes('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(solRoutes.map((r) => r.id)).toEqual(expect.arrayContaining(['jupiter', 'raydium', 'pumpfun', 'birdeye', 'dexscreener']));
    expect(solRoutes[0]!.trustWalletDappUrl).toContain('https://link.trustwallet.com/open_url?coin_id=501');

    const bscRoutes = buildMultiDappRoutes('bsc', '0x55d398326f99059fF775485246999027B3197955');
    expect(bscRoutes.map((r) => r.id)).toEqual(expect.arrayContaining(['pancake', '1inch', 'kyber', 'paraswap', 'dexscreener']));
    expect(bscRoutes[0]!.trustWalletDappUrl).toContain('coin_id=20000714');

    const tonRoutes = buildMultiDappRoutes('ton', 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs');
    expect(tonRoutes.map((r) => r.id)).toEqual(expect.arrayContaining(['stonfi', 'dedust']));

    const tronRoutes = buildMultiDappRoutes('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    expect(tronRoutes.map((r) => r.id)).toContain('sunswap');
  });

  it('stores and decrypts admin on-chain API keys safely with AES-256-GCM', async () => {
    const env = createTestEnv();
    const initial = await listOnchainApiProviders(db);
    expect(initial.length).toBeGreaterThanOrEqual(10);
    expect(initial.find((p) => p.provider === 'dexscreener')?.is_active).toBe(1);

    const saved = await saveOnchainApiProviderKey(env, {
      provider: 'birdeye',
      apiKey: 'be_live_super_secret_123456',
      isActive: true,
    });
    expect(saved.masked).toBe('be_l****3456');

    const resolved = await resolveOnchainApiKey(env, 'birdeye');
    expect(resolved.isActive).toBe(true);
    expect(resolved.apiKey).toBe('be_live_super_secret_123456');
  });

  it('generates genuine isolated Copy-Vault addresses for EVM, Solana, and TRON', async () => {
    const env = createTestEnv();
    const vault1 = await ensureUserCopyVault(env, 'user_test_1');
    expect(vault1.evmAddress).toMatch(/^0x[a-f0-9]{40}$/);
    expect(vault1.tronAddress).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(vault1.solanaAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

    // Idempotent for the same user
    const vault2 = await ensureUserCopyVault(env, 'user_test_1');
    expect(vault2.evmAddress).toBe(vault1.evmAddress);
    expect(vault2.solanaAddress).toBe(vault1.solanaAddress);

    // Keys decrypt and match vault public addresses
    const exported = await exportUserCopyVaultKeys(env, 'user_test_1');
    expect(exported.evmAddress).toBe(vault1.evmAddress);
    expect(exported.solanaAddress).toBe(vault1.solanaAddress);
    expect(exported.evmPrivateKeyHex).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.solanaSecretBase58.length).toBeGreaterThan(60);
  });

  it('simulates 7-day wallet copy backtest with anti-rug safety filter, TP/SL, and reverse copy', () => {
    const mockTrader: SmartWalletTraderRow = {
      id: 'swt_mock',
      source_type: 'AUTO_TOP10',
      added_by_user_id: null,
      wallet_address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
      chain_id: 'solana',
      display_name: 'Mock Whale',
      style_tag: 'Meme',
      roi_7d_pct: 40,
      roi_30d_pct: 120,
      realized_pnl_usd: 50000,
      win_rate: 75,
      avg_hold_mins: 60,
      trades_30d: 30,
      safety_discipline_score: 85,
      is_bot_filtered: 1,
      top_tokens_json: '[]',
      recent_trades_json: JSON.stringify([
        { symbol: 'BONK', tokenAddress: 'a', chainId: 'solana', side: 'BUY', entryUsd: 0.001, maxGainPct: 90, minDrawdownPct: -5, finalReturnPct: 60, holdMins: 60, safetyScore: 85, timestamp: '2026-11-18T00:00:00Z' },
        { symbol: 'RUGCOIN', tokenAddress: 'b', chainId: 'solana', side: 'BUY', entryUsd: 0.001, maxGainPct: 5, minDrawdownPct: -95, finalReturnPct: -95, holdMins: 10, safetyScore: 22, timestamp: '2026-11-18T02:00:00Z' },
        { symbol: 'WIF', tokenAddress: 'c', chainId: 'solana', side: 'BUY', entryUsd: 1.5, maxGainPct: 22, minDrawdownPct: -25, finalReturnPct: -25, holdMins: 40, safetyScore: 88, timestamp: '2026-11-18T04:00:00Z' },
      ]),
      last_seen_tx_hash: null,
      last_synced_at: '2026-11-18T00:00:00Z',
      is_active: 1,
    };

    const sim = simulateWalletCopyBacktest(mockTrader, {
      orderSizeUsd: 100,
      tp1Pct: 30,
      tp2Pct: 75,
      stopLossPct: 20,
      trailingActivatePct: 25,
      trailingDropPct: 10,
      breakEvenPct: 18,
      minSafetyScore: 60,
      reverseCopy: false,
    });

    expect(sim.skippedUnsafeCount).toBe(1);
    expect(sim.tradesSimulated).toBe(2);
    // Trade 1 hits TP2 (30*0.4 + 75*0.6 = 57%), Trade 3 triggers Break-Even (+1.5%)
    expect(sim.netProfitUsd).toBeGreaterThan(50);
    expect(sim.winRatePct).toBe(100);
  });
});
