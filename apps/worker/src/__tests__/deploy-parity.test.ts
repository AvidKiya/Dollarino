import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let mf: Miniflare;
let db: D1Database;

function makeEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () => ({ fetch: async () => new Response('{"ok":true}') }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-version-parity',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

/**
 * Regression guard for the production incident:
 *   `404 Route not found: /api/trading/accept-risk-terms`
 * caused by a Pages frontend newer than the deployed Worker.
 *
 * These tests make the mismatch impossible to ship silently:
 *  - `/api/health` must expose the same version the UI bundle reports
 *  - unknown API routes must disclose the running Worker version so the client
 *    can tell "typo" apart from "Worker not redeployed"
 */
describe('Deploy parity: UI version == Worker version (no stale-Worker 404s)', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-version-parity-db' },
    });
    db = await mf.getD1Database('DB');
  });

  afterAll(async () => {
    await mf?.dispose();
  });

  it('reports the shared release version from /api/health', async () => {
    const workerVersion = String(
      fs.readFileSync(path.join(root, 'apps/worker/src/version.ts'), 'utf8').match(/DOLLARINO_VERSION\s*=\s*'([^']+)'/)?.[1]
    );
    const webVersion = String(
      fs.readFileSync(path.join(root, 'apps/web/src/lib/version.ts'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1]
    );
    expect(workerVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(webVersion).toMatch(/^\d+\.\d+\.\d+$/);

    const res = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; assetVersion: string; buildSurface: string };

    expect(body.version).toBe(workerVersion);
    expect(body.version).toBe(webVersion);
    expect(body.assetVersion).toBe(workerVersion.replace(/\./g, ''));
    expect(body.buildSurface).toBe('worker');
  });

  it('exposes the running Worker version on unknown API routes (stale-deploy diagnostics)', async () => {
    const res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/does-not-exist-yet', { method: 'POST' }),
      makeEnv()
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; workerVersion: string; hint: string };
    expect(body.code).toBe('ROUTE_NOT_FOUND');
    expect(body.workerVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.hint).toContain('wrangler deploy');
  });

  it('keeps onboarding route available for the risk-terms flow that broke in production', async () => {
    // The route existing at all is what the incident was about; assert it is registered
    // (401 from auth, never 404 from the router).
    const res = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/accept-risk-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradingMode: 'PAPER' }),
      }),
      makeEnv()
    );
    expect(res.status).not.toBe(404);
    expect([200, 401, 403]).toContain(res.status);
  });

  it('keeps version-guard script green so CI blocks drift', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [path.join(root, 'scripts/version-guard.mjs')], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(out).toContain('All surfaces on');
  });
});
