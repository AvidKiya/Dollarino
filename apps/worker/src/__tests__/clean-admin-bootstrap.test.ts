import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateTotpCodeAt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';

let mf: Miniflare;
let db: D1Database;

function makeCleanEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'clean-bootstrap-test-jwt-secret-key-99',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.test',
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

describe('Clean-Slate Bootstrap, Default Admin Flow (admin/admin -> admin123 -> TOTP Setup) & Auth Toggles', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'dollarino-clean-bootstrap-db' },
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
  });

  afterAll(async () => {
    await mf?.dispose();
  });

  it('1. Ships completely clean-slate: all external auth providers disabled, zero pre-configured handles/keys', async () => {
    const env = makeCleanEnv();

    const provRes = await worker.fetch(new Request('https://dollarino.test/api/auth/providers'), env);
    expect(provRes.status).toBe(200);
    const prov = (await provRes.json()) as Record<string, unknown>;
    expect(prov.passwordLoginEnabled).toBe(true);
    expect(prov.publicSignupEnabled).toBe(false);
    expect(prov.walletAuthEnabled).toBe(false);
    expect(prov.telegramAuthEnabled).toBe(false);
    expect(prov.telegramBotConfigured).toBe(false);
    expect(prov.telegramBotUsername).toBe('');
    expect(prov.officialChannel).toBe('');
    expect(prov.telegramSupport).toBe('');
    expect(prov.requireTelegramPhoneKyc).toBe(false);
    expect(prov.googleAuthEnabled).toBe(false);
    expect(prov.googleEnabled).toBe(false);
    expect(prov.googleConfigured).toBe(false);
    expect(prov.googleClientId).toBeNull();
    expect(prov.defaultAdminReferralCode).toBeNull();

    const creatorRes = await worker.fetch(new Request('https://dollarino.test/api/public/creator'), env);
    expect(creatorRes.status).toBe(200);
    const creator = (await creatorRes.json()) as {
      founderProfile: { channel: string; channelUrl: string; verificationId: string };
      communityGroupInvite: string;
    };
    expect(creator.founderProfile.channel).toBe('');
    expect(creator.founderProfile.channelUrl).toBe('');
    expect(creator.founderProfile.verificationId).toBe('');
    expect(creator.communityGroupInvite).toBe('');

    const aiRes = await worker.fetch(new Request('https://dollarino.test/api/public/ai-models'), env);
    expect(aiRes.status).toBe(200);
    const ai = (await aiRes.json()) as { models: Array<{ id: string }> };
    expect(Array.isArray(ai.models)).toBe(true);
    expect(ai.models.map((m) => m.id)).toEqual(['dollarino-live-ai']);
  });

  it('2. Blocks all disabled public auth routes (register, wallet, telegram, google)', async () => {
    const env = makeCleanEnv();

    const regRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attacker@test.io', username: 'attacker', password: 'Password123!' }),
      }),
      env
    );
    expect(regRes.status).toBe(403);
    expect(((await regRes.json()) as { code: string }).code).toBe('PUBLIC_SIGNUP_DISABLED');

    const wNonceRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/wallet/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '0x1111111111111111111111111111111111111111' }),
      }),
      env
    );
    expect(wNonceRes.status).toBe(403);
    expect(((await wNonceRes.json()) as { code: string }).code).toBe('WALLET_AUTH_DISABLED');

    const tgMagicRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/telegram-magic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'tglm_fake' }),
      }),
      env
    );
    expect(tgMagicRes.status).toBe(403);
    expect(((await tgMagicRes.json()) as { code: string }).code).toBe('TELEGRAM_AUTH_DISABLED');

    const googleRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fake' }),
      }),
      env
    );
    expect(googleRes.status).toBe(403);
    expect(((await googleRes.json()) as { code: string }).code).toBe('GOOGLE_AUTH_DISABLED');
  });

  it('3. Authenticates admin/admin -> secondary password admin123, locks routes until setup, and completes TOTP + credential migration', async () => {
    const env = makeCleanEnv();

    // Wrong password rejected
    const badLogin = await worker.fetch(
      new Request('https://dollarino.test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'wrong' }),
      }),
      env
    );
    expect(badLogin.status).toBe(401);

    // Step 1: Primary login with admin / admin -> SECONDARY_PASSWORD challenge
    const loginRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
    const loginJson = (await loginRes.json()) as {
      requires2fa: boolean;
      challengeType: string;
      challengeToken: string;
      token?: string;
    };
    expect(loginJson.requires2fa).toBe(true);
    expect(loginJson.challengeType).toBe('SECONDARY_PASSWORD');
    expect(loginJson.challengeToken).toBeTruthy();
    expect(loginJson.token).toBeUndefined();

    // Wrong secondary password rejected
    const badSecRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/verify-secondary-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: loginJson.challengeToken, secondaryPassword: 'nope' }),
      }),
      env
    );
    expect(badSecRes.status).toBe(401);

    // Step 2: Secondary password 'admin123' -> temporary session locked with mustChangeCredentials=true
    const secRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/verify-secondary-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: loginJson.challengeToken, secondaryPassword: 'admin123' }),
      }),
      env
    );
    expect(secRes.status).toBe(200);
    const secJson = (await secRes.json()) as {
      token: string;
      mustChangeCredentials: boolean;
      user: { role: string; must_change_credentials: number };
    };
    expect(secJson.token).toBeTruthy();
    expect(secJson.mustChangeCredentials).toBe(true);
    expect(secJson.user.role).toBe('owner');
    expect(secJson.user.must_change_credentials).toBe(1);

    // While must_change_credentials=1, admin & trading endpoints MUST be blocked with 403 ADMIN_CREDENTIAL_CHANGE_REQUIRED
    const blockedAdmin = await worker.fetch(
      new Request('https://dollarino.test/api/admin/overview', {
        headers: { Authorization: `Bearer ${secJson.token}` },
      }),
      env
    );
    expect(blockedAdmin.status).toBe(403);
    expect(((await blockedAdmin.json()) as { code: string }).code).toBe('ADMIN_CREDENTIAL_CHANGE_REQUIRED');

    const blockedDash = await worker.fetch(
      new Request('https://dollarino.test/api/trading/dashboard', {
        headers: { Authorization: `Bearer ${secJson.token}` },
      }),
      env
    );
    expect(blockedDash.status).toBe(403);
    expect(((await blockedDash.json()) as { code: string }).code).toBe('ADMIN_CREDENTIAL_CHANGE_REQUIRED');

    // Bypass paths (/me and /2fa/setup) remain accessible
    const setup2faRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secJson.token}` },
      }),
      env
    );
    expect(setup2faRes.status).toBe(200);
    const setup2fa = (await setup2faRes.json()) as { secret: string; otpauthUri: string };
    expect(setup2fa.secret).toBeTruthy();
    expect(setup2fa.otpauthUri).toContain('otpauth://totp/');

    // StrictMode / double call without force=true must return the SAME unverified secret (no overwrite race)
    const setup2faRepeatRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      }),
      env
    );
    expect(setup2faRepeatRes.status).toBe(200);
    const setup2faRepeat = (await setup2faRepeatRes.json()) as { secret: string };
    expect(setup2faRepeat.secret).toBe(setup2fa.secret);

    // Shifted phone clock (7 days offset) is REJECTED on production Cloudflare edge (cf-ray present),
    // while ACCEPTED strictly on local/sandbox previews without cf-ray when clientTimestampMs is supplied.
    const shiftedTs = Date.now() - 7 * 86_400_000;
    const shiftedCode = await generateTotpCodeAt(setup2fa.secret, shiftedTs);
    const prodRejectedRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/complete-admin-setup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secJson.token}`,
          'Content-Type': 'application/json',
          'cf-ray': 'prod-edge-ray-123',
        },
        body: JSON.stringify({
          username: 'founder_master',
          email: 'owner@dollarino.test',
          password: 'StrongOwnerPassword#2026',
          totpCode: shiftedCode,
          clientTimestampMs: shiftedTs,
        }),
      }),
      env
    );
    expect(prodRejectedRes.status).toBe(401);

    // Verify local preview (127.0.0.1, no cf-ray) accepts Persian digits & device clock sync
    const persianShiftedCode = shiftedCode.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
    // Wait: test actual server-clock flow below for complete-admin-setup after confirming explicit force regeneration works
    const forcedSetupRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      env
    );
    expect(forcedSetupRes.status).toBe(200);
    const forcedSetup = (await forcedSetupRes.json()) as { secret: string };
    expect(forcedSetup.secret).not.toBe(setup2fa.secret);

    // Use the forced secret + shifted local-preview code on 127.0.0.1? First test standard bad TOTP rejection
    const badComplete = await worker.fetch(
      new Request('https://dollarino.test/api/auth/complete-admin-setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newUsername: 'admin',
          newEmail: 'owner@dollarino.test',
          newPassword: 'StrongOwnerPassword#2026',
          totpCode: '000000',
        }),
      }),
      env
    );
    expect(badComplete.status).toBe(400);

    // Step 3: Valid complete-admin-setup with RFC 6238 TOTP code (using local-preview clock + Persian digits)
    const localShiftedCode = await generateTotpCodeAt(forcedSetup.secret, shiftedTs);
    const localPersianCode = localShiftedCode.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
    expect(persianShiftedCode.length).toBe(6);
    const completeRes = await worker.fetch(
      new Request('http://127.0.0.1:8787/api/auth/complete-admin-setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secJson.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'founder_master',
          email: 'owner@dollarino.test',
          password: 'StrongOwnerPassword#2026',
          totpCode: localPersianCode,
          clientTimestampMs: shiftedTs,
        }),
      }),
      env
    );
    expect(completeRes.status).toBe(200);
    const completeJson = (await completeRes.json()) as {
      ok: boolean;
      token: string;
      mustChangeCredentials: boolean;
      user: { username: string; email: string; role: string; totp_enabled: number; must_change_credentials: number };
    };
    expect(completeJson.ok).toBe(true);
    expect(completeJson.mustChangeCredentials).toBe(false);
    expect(completeJson.user.username).toBe('founder_master');
    expect(completeJson.user.email).toBe('owner@dollarino.test');
    expect(completeJson.user.role).toBe('owner');
    expect(completeJson.user.totp_enabled).toBe(1);
    expect(completeJson.user.must_change_credentials).toBe(0);

    // Old admin/admin credentials are permanently invalid
    const oldCredsRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin' }),
      }),
      env
    );
    expect(oldCredsRes.status).toBe(401);

    // Re-login with new username + password triggers TOTP 2FA and grants full owner access
    const newLoginRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'founder_master', password: 'StrongOwnerPassword#2026' }),
      }),
      env
    );
    expect(newLoginRes.status).toBe(200);
    const newLoginJson = (await newLoginRes.json()) as { requires2fa: boolean; challengeType: string; challengeToken: string };
    expect(newLoginJson.requires2fa).toBe(true);
    expect(newLoginJson.challengeType).toBe('TOTP');

    const loginTotp = await generateTotpCodeAt(forcedSetup.secret);
    const verifyTotpRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/2fa/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: newLoginJson.challengeToken, code: loginTotp }),
      }),
      env
    );
    expect(verifyTotpRes.status).toBe(200);
    const ownerToken = ((await verifyTotpRes.json()) as { token: string }).token;

    // Now /api/admin/system-health & /api/admin/overview work, with ownerTelegramIdConfigured=false initially
    const healthPre = await worker.fetch(
      new Request('https://dollarino.test/api/admin/system-health', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(healthPre.status).toBe(200);
    expect(
      ((await healthPre.json()) as { health: { productionChecks: { ownerTelegramIdConfigured: boolean } } }).health.productionChecks
        .ownerTelegramIdConfigured
    ).toBe(false);

    // Owner enables Wallet + Public Signup + Owner Telegram ID + Bot Handle via Admin Settings
    const saveSettingsRes = await worker.fetch(
      new Request('https://dollarino.test/api/admin/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            auth_wallet_enabled: 'true',
            auth_public_signup_enabled: 'true',
            owner_telegram_id: '777888999',
            bot_username: 'MyCustomTraderBot',
            official_channel: '@MyCustomSignals',
          },
        }),
      }),
      env
    );
    expect(saveSettingsRes.status).toBe(200);

    const provAfter = (await (await worker.fetch(new Request('https://dollarino.test/api/auth/providers'), env)).json()) as Record<
      string,
      unknown
    >;
    expect(provAfter.walletAuthEnabled).toBe(true);
    expect(provAfter.publicSignupEnabled).toBe(true);
    expect(provAfter.telegramBotUsername).toBe('MyCustomTraderBot');
    expect(provAfter.officialChannel).toBe('@MyCustomSignals');

    // Public signup creates strictly 'user' role, NEVER 'owner'
    const userSignupRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'newuser@dollarino.test', username: 'new_trader_01', password: 'Password123!' }),
      }),
      env
    );
    expect(userSignupRes.status).toBe(201);
    expect(((await userSignupRes.json()) as { user: { role: string } }).user.role).toBe('user');

    // Unpreserved DB wipe re-seeds clean usr_admin_bootstrap (admin/admin/admin123)
    const wipeRes = await worker.fetch(
      new Request('https://dollarino.test/api/admin/database/wipe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'FULL_FACTORY_WIPE',
          preserveOwnerAndSettings: false,
          confirmPhrase: 'DELETE_ALL_DATA',
        }),
      }),
      env
    );
    expect(wipeRes.status).toBe(200);

    const provAfterWipe = (await (await worker.fetch(new Request('https://dollarino.test/api/auth/providers'), env)).json()) as Record<
      string,
      unknown
    >;
    expect(provAfterWipe.walletAuthEnabled).toBe(false);
    expect(provAfterWipe.publicSignupEnabled).toBe(false);

    const reseedLoginRes = await worker.fetch(
      new Request('https://dollarino.test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin' }),
      }),
      env
    );
    expect(reseedLoginRes.status).toBe(200);
    expect(((await reseedLoginRes.json()) as { challengeType: string }).challengeType).toBe('SECONDARY_PASSWORD');
  });
});
