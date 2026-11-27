import { Hono } from 'hono';
import type { DollarinoSignal } from '@dollarino/core';
import {
  discoverGatewayModels,
  getPlatformAISummary,
  isArenaGatewayUrl,
  testAllPlatformAIEngines,
} from '../ai/providers.js';
import { invalidateAuthUserCache, requireSessionAuth, resetPrivilegedUserAccountToFreshState, type AppVariables } from '../auth.js';
import { invalidateDbPublicCache } from '../services/d1-cache.js';
import { decryptVaultJson, encryptVaultJson, generateReferralCode, hashPassword, maskSecret, randomId } from '../crypto.js';
import { isSafeExternalHttpUrl, isValidSqlIdentifier } from '../security.js';
import type { Env } from '../env.js';
import { fetchPublicMarket24h } from '../exchanges/paper.js';
import { TelegramBotClient } from '../telegram/client.js';
import {
  normalizeTelegramTarget,
  promptCopyTraderPublish,
  publishChannelNews,
  publishDatabaseReport,
  publishOfficialAnnouncement,
  publishSignalBroadcast,
  publishSystemLogEvent,
  publishTransactionEvent,
  resolveChannelAndBotConfig,
} from '../telegram/publisher.js';
import { confirmAndMirrorCopyTrade } from '../engine/copy-mirror.js';
import { runAlwaysOnAiIntel, runAlwaysOnSignalRadar } from '../engine/market-intel.js';
import {
  listOnchainApiProviders,
  saveOnchainApiProviderKey,
  testOnchainApiProvider,
  type OnchainProviderId,
} from '../dex/smart-copy.js';
import { getFounderProfile, saveFounderProfile, type FounderProfile } from '../services/founder-profile.js';
import {
  discoverTopSiteTraders,
  getSiteTraderAutoConfig,
  promoteSiteTraderToCopyList,
  syncAutoTopSiteTraders,
} from '../services/site-traders.js';
import {
  clearDbTelegramBotToken,
  getTelegramBotTokenStatus,
  resolveOwnerTelegramId,
  resolveTelegramBotToken,
  saveAndConfigureTelegramBot,
} from '../telegram/token.js';
import {
  applyConfirmedTreasuryCredit,
  connectOwnerWalletAsTreasury,
  getAdminComprehensiveFeeReport,
  getAdminTreasurySummary,
  importOwnerMnemonicAsTreasury,
  reconcilePendingFeeAndTreasuryTransactions,
  saveManualTreasuryReceivers,
  settleDebtFirstThenCredit,
} from '../services/treasury.js';
import { evaluateUserFeeStanding } from '../services/server-fee.js';
import {
  invalidatePublicCopyTradersCache,
  invalidateSettingsCache,
  setCachedSystemSetting,
} from '../services/settings-cache.js';
import { DOLLARINO_VERSION } from '../version.js';

async function isSystemOwner(user: { role?: string; telegramId?: string | null }, env: Env): Promise<boolean> {
  if (user.role === 'owner') return true;
  const ownerTg = await resolveOwnerTelegramId(env);
  return Boolean(ownerTg && user.telegramId && user.telegramId === ownerTg);
}

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
adminRoutes.use('*', requireSessionAuth);

adminRoutes.use('*', async (c, next) => {
  const u = c.get('user');
  const ownerTg = await resolveOwnerTelegramId(c.env);
  const isOwnerOrAdmin = u.role === 'owner' || u.role === 'admin' || Boolean(ownerTg && u.telegramId && u.telegramId === ownerTg);
  if (!isOwnerOrAdmin) return c.json({ error: 'Admin access required' }, 403);
  await next();
});

adminRoutes.get('/overview', async (c) => {
  const [users, trades, signals, bots, settings, aiSummary, plans, subs, openSupport, copyTraders, dexStats, revRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username,
              phone_number, phone_verified, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified, ui_mode,
              wallet_balance_usdt, COALESCE(fee_prepaid_credit_usd, 0) as fee_credit_usd, COALESCE(referral_balance_usd, 0) as referral_balance_usd, created_at, last_active_at
       FROM users ORDER BY created_at DESC LIMIT 250`
    ).all<{
      id: string;
      email: string;
      username: string;
      role: string;
      is_blocked: number;
      telegram_id: string | null;
      telegram_username: string | null;
      phone_number: string | null;
      phone_verified: number;
      trust_wallet_address: string | null;
      trust_wallet_tron: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      trust_wallet_verified: number;
      ui_mode: string | null;
      wallet_balance_usdt: number;
      fee_credit_usd: number;
      referral_balance_usd: number;
      created_at: string;
      last_active_at: string | null;
    }>().catch(async () => {
      const legacy = await c.env.DB.prepare(
        `SELECT id, email, username, role, is_blocked, telegram_id, telegram_username,
                phone_number, phone_verified, trust_wallet_address, trust_wallet_tron, trust_wallet_solana, trust_wallet_ton, trust_wallet_verified, ui_mode,
                wallet_balance_usdt, created_at, last_active_at
         FROM users ORDER BY created_at DESC LIMIT 250`
      ).all<{
        id: string;
        email: string;
        username: string;
        role: string;
        is_blocked: number;
        telegram_id: string | null;
        telegram_username: string | null;
        phone_number: string | null;
        phone_verified: number;
        trust_wallet_address: string | null;
        trust_wallet_tron: string | null;
        trust_wallet_solana: string | null;
        trust_wallet_ton: string | null;
        trust_wallet_verified: number;
        ui_mode: string | null;
        wallet_balance_usdt: number;
        created_at: string;
        last_active_at: string | null;
      }>();
      return {
        ...legacy,
        results: legacy.results.map((u) => ({ ...u, fee_credit_usd: 0, referral_balance_usd: 0 })),
      };
    }),
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count,
              COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total_pnl
       FROM trades`
    ).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM signals`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM telegram_bots`).first(),
    c.env.DB.prepare(`SELECT key, value FROM system_settings`).all<{ key: string; value: string }>(),
    getPlatformAISummary(c.env),
    c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT user_id, plan_code, expires_at FROM user_subscriptions WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY expires_at DESC`
    ).all<{ user_id: string; plan_code: string; expires_at: string | null }>().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM support_tickets WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_traders WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_count FROM dex_trades`).first<{ total: number; open_count: number }>().catch(() => ({ total: 0, open_count: 0 })),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount_usd), 0) as total_usd FROM user_subscriptions WHERE status = 'ACTIVE'`).first<{ total_usd: number }>().catch(() => ({ total_usd: 0 })),
  ]);

  const settingsMap: Record<string, string> = {};
  for (const s of settings.results) {
    if (s.key === 'telegram_bot_token_enc' || s.key === 'telegram_webhook_secret_auto') continue;
    if (s.key === 'google_client_secret') {
      settingsMap[s.key] = s.value ? '********' : '';
      continue;
    }
    settingsMap[s.key] = /YourTRC20WalletAddress|^0xYour/i.test(s.value || '') ? '' : s.value;
  }

  const activeSubByUser = new Map<string, { plan_code: string; expires_at: string | null }>();
  for (const s of subs.results) {
    if (!activeSubByUser.has(s.user_id)) activeSubByUser.set(s.user_id, s);
  }

  const userFeesRows = await c.env.DB.prepare(
    `SELECT user_id,
            COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) as accrued_fee_usd,
            COALESCE(SUM(fee_usd), 0) as total_fee_usd,
            COUNT(*) as profitable_live_count
     FROM server_fee_ledger GROUP BY user_id`
  ).all<{ user_id: string; accrued_fee_usd: number; total_fee_usd: number; profitable_live_count: number }>().catch(() => ({ results: [] }));
  const feeByUser = new Map<string, { accrued_fee_usd: number; total_fee_usd: number; profitable_live_count: number }>();
  for (const fr of userFeesRows.results) feeByUser.set(fr.user_id, fr);

  const enrichedUsers = users.results.map((u) => {
    const sub = activeSubByUser.get(u.id);
    const fee = feeByUser.get(u.id);
    return {
      ...u,
      accruedFeeUsd: Number((fee?.accrued_fee_usd || 0).toFixed(4)),
      totalFeeUsd: Number((fee?.total_fee_usd || 0).toFixed(4)),
      profitableLiveCount: fee?.profitable_live_count || 0,
      activePlan: sub?.plan_code || (u.role === 'owner' || u.role === 'admin' ? 'vip_owner' : null),
      subscriptionExpiresAt: sub?.expires_at || null,
    };
  });

  const [phoneVerifiedCount, trustWalletConnectedCount] = [
    enrichedUsers.filter((u) => u.phone_verified === 1).length,
    enrichedUsers.filter((u) => Boolean(u.trust_wallet_address || u.trust_wallet_tron || u.trust_wallet_solana || u.trust_wallet_ton)).length,
  ];
  const serverFeeAgg = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(fee_usd), 0) as total_fee_usd, COALESCE(SUM(CASE WHEN status = 'ACCRUED' THEN fee_usd ELSE 0 END), 0) as accrued_fee_usd FROM server_fee_ledger`
  ).first<{ total_fee_usd: number; accrued_fee_usd: number }>().catch(() => ({ total_fee_usd: 0, accrued_fee_usd: 0 }));

  return c.json({
    users: enrichedUsers,
    stats: {
      totalUsers: enrichedUsers.length,
      phoneVerifiedCount,
      trustWalletConnectedCount,
      activeSubscriptions: enrichedUsers.length,
      totalRevenueUsd: Number(revRow?.total_usd || 0),
      serverFeeTotalUsd: Number(serverFeeAgg?.total_fee_usd || 0),
      serverFeeAccruedUsd: Number(serverFeeAgg?.accrued_fee_usd || 0),
      openSupportTickets: openSupport?.cnt ?? 0,
      copyTradersCount: copyTraders?.cnt ?? 0,
      dexTradesTotal: dexStats?.total ?? 0,
      dexTradesOpen: dexStats?.open_count ?? 0,
      trades,
      signalsCount: (signals as { total: number } | null)?.total ?? 0,
      botsCount: (bots as { total: number } | null)?.total ?? 0,
    },
    settings: settingsMap,
    platformAI: aiSummary,
    plans: plans.results,
  });
});

adminRoutes.get('/ai-engines', async (c) => {
  const [rows, summary] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked,
              temperature, max_tokens, daily_call_cap, calls_today, last_test_status, last_tested_at, updated_at
       FROM platform_ai_engines ORDER BY slot_order ASC, created_at ASC LIMIT 3`
    ).all<{
      id: string;
      slot_order: number;
      provider: string;
      label: string;
      model: string;
      base_url: string | null;
      weight: number;
      is_active: number;
      api_key_masked: string;
      temperature: number;
      max_tokens: number;
      daily_call_cap: number;
      calls_today: number;
      last_test_status: string;
      last_tested_at: string | null;
      updated_at: string;
    }>(),
    getPlatformAISummary(c.env),
  ]);
  const engines = [...(rows.results ?? [])];
  const secretKey = c.env.HILINKUP_API_KEY?.trim();
  if (secretKey && !engines.some((e) => e.is_active === 1)) {
    const masked = secretKey.length > 8 ? `${secretKey.slice(0, 4)}****${secretKey.slice(-4)}` : 'hlk_****';
    const freeSlot = engines.some((e) => e.slot_order === 1) ? (engines.some((e) => e.slot_order === 2) ? 3 : 2) : 1;
    engines.unshift({
      id: 'env-hilinkup-default',
      slot_order: freeSlot,
      provider: 'openai_compatible',
      label: 'Hilinkup DeepSeek v4.1 (Worker Secret)',
      model: c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017',
      base_url: c.env.HILINKUP_BASE_URL?.trim() || 'https://api.hilinkup.com/v1',
      weight: 100,
      is_active: 1,
      api_key_masked: masked,
      temperature: 0.25,
      max_tokens: 2048,
      daily_call_cap: 50000,
      calls_today: 0,
      last_test_status: 'ACTIVE (SECRET)',
      last_tested_at: null,
      updated_at: new Date().toISOString(),
    });
  }
  return c.json({
    engines,
    consensusMode: summary.consensusMode,
    cacheTtlSec: summary.cacheTtlSec,
    activeCount: summary.activeCount,
    latestSignals: summary.latestSignals,
    hilinkupSecretConfigured: Boolean(secretKey),
    hilinkupModel: c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017',
    arenaSecretConfigured: Boolean(c.env.ARENA_API_KEY?.trim()),
    arenaModel: c.env.ARENA_MODEL?.trim() || 'coding-router-preview',
  });
});

adminRoutes.post('/ai-engines', async (c) => {
  const body = await c.req.json<{
    id?: string;
    slotOrder?: number;
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible';
    label?: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    weight?: number;
    temperature?: number;
    maxTokens?: number;
    dailyCallCap?: number;
    isActive?: boolean;
  }>();

  if (!body.provider || !body.model) {
    return c.json({ error: 'Provider and model are required' }, 400);
  }

  const slotOrder = Math.min(3, Math.max(1, Math.round(Number(body.slotOrder ?? 1))));
  const weight = Math.min(100, Math.max(10, Math.round(Number(body.weight ?? 100))));
  const cleanBase = body.baseUrl?.trim() || null;
  if (cleanBase && !isSafeExternalHttpUrl(cleanBase)) {
    return c.json({ error: 'آدرس Base URL نامعتبر یا غیرمجاز است.' }, 400);
  }
  const defaultModelMap: Record<string, string> = {
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    anthropic: isArenaGatewayUrl(cleanBase) ? 'coding-router-preview' : 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-2.0-flash',
    openai_compatible: isArenaGatewayUrl(cleanBase) ? 'coding-router-preview' : body.model,
  };
  let model = body.model.trim() || defaultModelMap[body.provider] || 'gpt-4o-mini';
  if (
    cleanBase &&
    cleanBase.includes('hilinkup.com') &&
    ['deep', 'deepseek', 'دیپی', 'deepseek-v4', 'deepseek-chat'].includes(model.toLowerCase())
  ) {
    model = c.env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
  }
  const label =
    (body.label ?? '').trim() ||
    (isArenaGatewayUrl(cleanBase) ? `Arena AI · ${model}` : `مدل ${slotOrder} (${body.provider.toUpperCase()})`);

  // Check if updating an existing slot or creating a new one (max 3 slots!)
  const existing = body.id
    ? await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE id = ?`).bind(body.id).first<{ id: string }>()
    : await c.env.DB.prepare(`SELECT id FROM platform_ai_engines WHERE slot_order = ?`).bind(slotOrder).first<{ id: string }>();

  if (!existing) {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM platform_ai_engines`).first<{ cnt: number }>();
    if ((countRow?.cnt ?? 0) >= 3) {
      return c.json({ error: 'حداکثر ۳ مدل برای هوش مصنوعی دلارینو قابل ثبت است. یکی از اسلات‌ها را ویرایش یا حذف کنید.' }, 400);
    }
    if (!body.apiKey?.trim()) {
      return c.json({ error: 'API Key is required for a new platform AI engine' }, 400);
    }
    const id = randomId('paie');
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `INSERT INTO platform_ai_engines
       (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, temperature, max_tokens, daily_call_cap, last_test_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAVED')`
    )
      .bind(
        id,
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000))
      )
      .run();
    return c.json({ ok: true, id, slotOrder }, 201);
  }

  // Update existing slot
  if (body.apiKey?.trim()) {
    const encrypted = await encryptVaultJson({ apiKey: body.apiKey.trim() }, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           api_key_masked = ?, encrypted_api_key = ?, temperature = ?, max_tokens = ?, daily_call_cap = ?,
           last_test_status = 'UPDATED', updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        maskSecret(body.apiKey.trim()),
        encrypted,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000)),
        existing.id
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE platform_ai_engines
       SET slot_order = ?, provider = ?, label = ?, model = ?, base_url = ?, weight = ?, is_active = ?,
           temperature = ?, max_tokens = ?, daily_call_cap = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        slotOrder,
        body.provider,
        label,
        model,
        body.baseUrl?.trim() || null,
        weight,
        body.isActive !== false ? 1 : 0,
        Number(body.temperature ?? 0.2),
        Math.max(256, Number(body.maxTokens ?? 1536)),
        Math.max(10, Number(body.dailyCallCap ?? 50000)),
        existing.id
      )
      .run();
  }

  return c.json({ ok: true, id: existing.id, slotOrder });
});

adminRoutes.patch('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ is_active?: boolean; weight?: number; label?: string; model?: string }>();
  if (body.is_active !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, id)
      .run();
  }
  if (body.weight !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET weight = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(Math.min(100, Math.max(10, Math.round(body.weight))), id)
      .run();
  }
  if (body.label !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET label = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.label.trim(), id)
      .run();
  }
  if (body.model !== undefined) {
    await c.env.DB.prepare(`UPDATE platform_ai_engines SET model = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.model.trim(), id)
      .run();
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/ai-engines/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM platform_ai_engines WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post('/ai-engines/test', async (c) => {
  const result = await testAllPlatformAIEngines(c.env);
  return c.json(result, result.results.length === 0 ? 400 : 200);
});

adminRoutes.post('/ai-engines/discover-models', async (c) => {
  const body = await c.req
    .json<{
      baseUrl?: string;
      apiKey?: string;
      slotOrder?: number;
      provider?: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible';
    }>()
    .catch(
      () =>
        ({}) as {
          baseUrl?: string;
          apiKey?: string;
          slotOrder?: number;
          provider?: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openai_compatible';
        }
    );

  const baseUrl = String(body.baseUrl || 'https://api.arena.ai/v1').trim();
  if (!isSafeExternalHttpUrl(baseUrl)) {
    return c.json({ error: 'آدرس Base URL نامعتبر یا غیرمجاز است.' }, 400);
  }

  let apiKey = String(body.apiKey || '').trim();
  if (!apiKey && body.slotOrder) {
    const slotRow = await c.env.DB.prepare(
      `SELECT encrypted_api_key FROM platform_ai_engines WHERE slot_order = ? LIMIT 1`
    )
      .bind(Math.min(3, Math.max(1, Math.round(Number(body.slotOrder)))))
      .first<{ encrypted_api_key: string }>()
      .catch(() => null);
    if (slotRow?.encrypted_api_key) {
      const dec = await decryptVaultJson<{ apiKey?: string }>(
        slotRow.encrypted_api_key,
        c.env.MASTER_ENCRYPTION_KEY
      ).catch(() => ({ apiKey: undefined }));
      apiKey = dec.apiKey?.trim() || '';
    }
  }
  if (!apiKey && isArenaGatewayUrl(baseUrl) && c.env.ARENA_API_KEY?.trim()) {
    apiKey = c.env.ARENA_API_KEY.trim();
  }
  if (!apiKey) {
    return c.json({ error: 'برای دریافت لیست مدل‌های زنده، ابتدا API Key را وارد یا ذخیره کنید.' }, 400);
  }

  try {
    const models = await discoverGatewayModels({
      baseUrl,
      apiKey,
      provider: body.provider || 'openai_compatible',
    });
    return c.json({ ok: true, count: models.length, models });
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : 'دریافت لیست مدل‌ها ناموفق بود.' },
      400
    );
  }
});

adminRoutes.patch('/users/:id', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json<{ role?: 'user' | 'admin'; is_blocked?: boolean }>();

  if (body.role !== undefined && actor.role !== 'owner') {
    return c.json({ error: 'Only the primary instance owner can promote or demote admins' }, 403);
  }
  if (targetId === actor.id && body.is_blocked) {
    return c.json({ error: 'Cannot block yourself' }, 400);
  }

  if (body.role !== undefined) {
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ? AND role != \'owner\'').bind(body.role, targetId).run();
  }
  if (body.is_blocked !== undefined) {
    await c.env.DB.prepare('UPDATE users SET is_blocked = ? WHERE id = ? AND role != \'owner\'')
      .bind(body.is_blocked ? 1 : 0, targetId).run();
  }
  invalidateAuthUserCache(c.env.DB, targetId);
  return c.json({ ok: true });
});

adminRoutes.put('/settings', async (c) => {
  const actor = c.get('user');
  const ownerFlag = await isSystemOwner(actor, c.env);
  const body = await c.req.json<Record<string, unknown>>();
  const entriesSource: Record<string, unknown> =
    body && typeof body.settings === 'object' && body.settings !== null && !Array.isArray(body.settings)
      ? (body.settings as Record<string, unknown>)
      : body;

  const ownerOnlyKeys = [
    'owner_telegram_id',
    'treasury_evm_receiver',
    'trust_wallet_evm_receiver',
    'treasury_trc20_receiver',
    'usdt_trc20_wallet',
    'treasury_solana_receiver',
    'treasury_ton_receiver',
  ];
  for (const okKey of ownerOnlyKeys) {
    if (Object.prototype.hasOwnProperty.call(entriesSource, okKey) && !ownerFlag) {
      return c.json({ error: 'تغییر آیدی مالک یا آدرس‌های خزانه فقط برای مالک اصلی (Owner) مجاز است.' }, 403);
    }
  }

  if (Object.prototype.hasOwnProperty.call(entriesSource, 'owner_telegram_id')) {
    const rawOwnerId = String(entriesSource.owner_telegram_id ?? '').trim();
    if (rawOwnerId && !/^\d{5,16}$/.test(rawOwnerId)) {
      return c.json({ error: 'آیدی عددی تلگرام مالک باید شامل ۵ تا ۱۶ رقم باشد.' }, 400);
    }
    if (rawOwnerId && actor.role === 'owner') {
      const existingOther = await c.env.DB.prepare(
        `SELECT id FROM users WHERE telegram_id = ? AND id != ? LIMIT 1`
      )
        .bind(rawOwnerId, actor.id)
        .first();
      if (!existingOther) {
        await c.env.DB.prepare(`UPDATE users SET telegram_id = ? WHERE id = ?`)
          .bind(rawOwnerId, actor.id)
          .run()
          .catch(() => {});
        invalidateAuthUserCache(c.env.DB, actor.id);
      }
    }
  }

  const channelTargetKeys = new Set([
    'official_channel',
    'signals_channel_id',
    'results_channel_id',
    'community_group_id',
    'logs_channel_id',
    'database_channel_id',
    'transactions_channel_id',
    'news_channel_id',
    'education_channel_id',
    'alerts_channel_id',
  ]);
  const updatedChannelKeys: string[] = [];

  for (const [k, v] of Object.entries(entriesSource)) {
    if (v === undefined || v === null || typeof v === 'object') continue;
    let strVal = String(v);
    if (k === 'google_client_secret' && (strVal.trim() === '********' || strVal.trim() === '')) continue;
    if (channelTargetKeys.has(k)) {
      const trimmed = strVal.trim();
      if (!trimmed) {
        strVal = '';
      } else if (/^https?:\/\/t\.me\/\+/i.test(trimmed)) {
        // Admin pasted an invite link in a channel target field; preserve as-is unless numeric/username
        strVal = trimmed;
      } else {
        strVal = normalizeTelegramTarget(trimmed);
      }
      updatedChannelKeys.push(k);
    }
    await setCachedSystemSetting(c.env.DB, k, strVal);
  }
  invalidateSettingsCache(c.env.DB);
  if (updatedChannelKeys.length > 0) {
    await publishSystemLogEvent(c.env, {
      category: 'SYSTEM',
      level: 'INFO',
      source: 'AdminPanel',
      title: 'به‌روزرسانی تنظیمات کانال‌های اکوسیستم',
      userId: actor.id,
      details: `کلیدهای تغییریافته توسط ${actor.username}: ${updatedChannelKeys.join(', ')}`,
    }).catch(() => {});
  }
  return c.json({ ok: true });
});

adminRoutes.post('/signal-controls', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    publishSignalsToChannels?: boolean;
    publishSignalsToBotUsers?: boolean;
    alwaysOnSignals?: boolean;
    alwaysOnAiBroadcast?: boolean;
    signalsAlsoOfficial?: boolean;
    channelOfficialEnabled?: boolean;
    channelSignalsEnabled?: boolean;
    channelResultsEnabled?: boolean;
    channelCommunityEnabled?: boolean;
    channelLogsEnabled?: boolean;
    channelDatabaseEnabled?: boolean;
    channelTransactionsEnabled?: boolean;
    channelNewsEnabled?: boolean;
    channelEducationEnabled?: boolean;
    channelAlertsEnabled?: boolean;
    copyPublishToChannel?: boolean;
  };
  const pairs: Array<[string, boolean | undefined]> = [
    ['publish_signals_to_channels', body.publishSignalsToChannels],
    ['auto_publish_signals_to_channel', body.publishSignalsToChannels],
    ['publish_signals_to_bot_users', body.publishSignalsToBotUsers],
    ['always_on_signals_enabled', body.alwaysOnSignals],
    ['always_on_ai_broadcast_enabled', body.alwaysOnAiBroadcast],
    ['signals_also_official', body.signalsAlsoOfficial],
    ['channel_official_enabled', body.channelOfficialEnabled],
    ['channel_signals_enabled', body.channelSignalsEnabled],
    ['channel_results_enabled', body.channelResultsEnabled],
    ['channel_community_enabled', body.channelCommunityEnabled],
    ['channel_logs_enabled', body.channelLogsEnabled],
    ['channel_database_enabled', body.channelDatabaseEnabled],
    ['channel_transactions_enabled', body.channelTransactionsEnabled],
    ['channel_news_enabled', body.channelNewsEnabled],
    ['channel_education_enabled', body.channelEducationEnabled],
    ['channel_alerts_enabled', body.channelAlertsEnabled],
    ['copy_publish_to_channel', body.copyPublishToChannel],
  ];
  for (const [k, v] of pairs) {
    if (typeof v === 'boolean') {
      await setCachedSystemSetting(c.env.DB, k, v ? 'true' : 'false');
    }
  }
  invalidateSettingsCache(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'UPDATE_SIGNAL_CONTROLS', 'system_settings', 'signal_broadcast', ?)`
  ).bind(randomId('aud'), actor.id, JSON.stringify(body)).run().catch(() => {});

  const cfg = await resolveChannelAndBotConfig(c.env);
  return c.json({
    ok: true,
    controls: {
      publishSignalsToChannels: cfg.signalsToChannelsEnabled,
      publishSignalsToBotUsers: cfg.signalsToBotEnabled,
      channelOfficialEnabled: cfg.officialEnabled,
      channelSignalsEnabled: cfg.signalsEnabled,
      channelResultsEnabled: cfg.resultsEnabled,
      channelCommunityEnabled: cfg.communityEnabled,
      channelLogsEnabled: cfg.logsEnabled,
      channelDatabaseEnabled: cfg.databaseEnabled,
      channelTransactionsEnabled: cfg.transactionsEnabled,
      channelNewsEnabled: cfg.newsEnabled,
      channelEducationEnabled: cfg.educationEnabled,
      channelAlertsEnabled: cfg.alertsEnabled,
    },
  });
});

adminRoutes.get('/founder-profile', async (c) => {
  const profile = await getFounderProfile(c.env.DB);
  return c.json({ ok: true, profile });
});

adminRoutes.put('/founder-profile', async (c) => {
  const body = await c.req.json<Partial<FounderProfile>>().catch(() => ({} as Partial<FounderProfile>));
  const result = await saveFounderProfile(c.env.DB, body);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  const actor = c.get('user');
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'UPDATE_FOUNDER_PROFILE', 'system_settings', 'founder_profile', ?)`
  )
    .bind(
      randomId('aud'),
      actor.id,
      JSON.stringify({ updatedFields: Object.keys(body), hasPhoto: Boolean(result.profile.photoUrl) })
    )
    .run()
    .catch(() => {});
  return c.json({ ok: true, profile: result.profile });
});

export async function executeAdminBroadcast(
  env: Env,
  opts: { title: string; message: string; deliverTelegram: boolean; deliverInApp: boolean }
): Promise<{ sentTelegram: number; totalTelegram: number; deliveredInApp: number }> {
  let sentTelegram = 0;
  let totalTelegram = 0;
  let deliveredInApp = 0;

  const botToken = opts.deliverTelegram ? await resolveTelegramBotToken(env) : '';
  if (opts.deliverTelegram && botToken) {
    const client = new TelegramBotClient(botToken);
    const targets = await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND is_blocked = 0')
      .all<{ telegram_id: string }>();
    totalTelegram = targets.results.length;
    for (const t of targets.results) {
      await client
        .sendMessage(t.telegram_id, `📢 **${opts.title}**\n\n${opts.message}`)
        .then(() => sentTelegram++)
        .catch(() => {});
    }
  }

  if (opts.deliverInApp) {
    const activeUsers = await env.DB.prepare('SELECT id FROM users WHERE is_blocked = 0 LIMIT 500')
      .all<{ id: string }>();
    const stmts = activeUsers.results.map((u) =>
      env.DB.prepare(
        `INSERT INTO notifications (id, user_id, category, title, body, is_read) VALUES (?, ?, 'SYSTEM', ?, ?, 0)`
      ).bind(randomId('ntf'), u.id, opts.title, opts.message.slice(0, 600))
    );
    for (let i = 0; i < stmts.length; i += 80) {
      await env.DB.batch(stmts.slice(i, i + 80));
    }
    deliveredInApp = activeUsers.results.length;
  }

  return { sentTelegram, totalTelegram, deliveredInApp };
}

export async function dispatchDueScheduledBroadcasts(env: Env): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT * FROM scheduled_broadcasts
     WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at <= datetime('now')
     ORDER BY scheduled_at ASC LIMIT 5`
  )
    .all<{
      id: string;
      title: string;
      message: string;
      deliver_telegram: number;
      deliver_inapp: number;
    }>()
    .catch(() => ({ results: [] }));

  let dispatched = 0;
  for (const row of due.results) {
    const res = await executeAdminBroadcast(env, {
      title: row.title || 'اطلاعیه دلارینو',
      message: row.message,
      deliverTelegram: Boolean(row.deliver_telegram),
      deliverInApp: Boolean(row.deliver_inapp),
    });
    await env.DB.prepare(
      `UPDATE scheduled_broadcasts SET status = 'SENT', sent_count = ?, sent_at = datetime('now') WHERE id = ?`
    )
      .bind(Math.max(res.sentTelegram, res.deliveredInApp), row.id)
      .run()
      .catch(() => {});
    dispatched++;
  }
  return dispatched;
}

adminRoutes.get('/broadcasts', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM scheduled_broadcasts ORDER BY created_at DESC LIMIT 25`
  )
    .all()
    .catch(() => ({ results: [] }));
  return c.json({ ok: true, broadcasts: rows.results });
});

adminRoutes.delete('/broadcasts/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM scheduled_broadcasts WHERE id = ? AND status = 'SCHEDULED'`).bind(id).run();
  const rows = await c.env.DB.prepare(`SELECT * FROM scheduled_broadcasts ORDER BY created_at DESC LIMIT 25`)
    .all()
    .catch(() => ({ results: [] }));
  return c.json({ ok: true, broadcasts: rows.results });
});

adminRoutes.post('/broadcast', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json<{
    title?: string;
    message: string;
    deliverTelegram?: boolean;
    deliverInApp?: boolean;
    scheduledAt?: string | null;
  }>();
  const text = body.message?.trim();
  if (!text) return c.json({ error: 'متن اطلاعیه الزامی است.' }, 400);

  const title = (body.title || 'اطلاعیه رسمی دلارینو').trim().slice(0, 120);
  const deliverTelegram = body.deliverTelegram !== false;
  const deliverInApp = body.deliverInApp !== false;

  const botToken = await resolveTelegramBotToken(c.env);
  if (deliverTelegram && !deliverInApp && !botToken && !body.scheduledAt) {
    return c.json({ error: 'توکن ربات تلگرام هنوز تنظیم نشده است.' }, 400);
  }

  let scheduledIso: string | null = null;
  if (body.scheduledAt && String(body.scheduledAt).trim()) {
    const parsedMs = Date.parse(String(body.scheduledAt));
    if (Number.isFinite(parsedMs) && parsedMs > Date.now() + 15_000) {
      scheduledIso = new Date(parsedMs).toISOString().replace('T', ' ').slice(0, 19);
    }
  }

  const bid = randomId('brd');
  if (scheduledIso) {
    await c.env.DB.prepare(
      `INSERT INTO scheduled_broadcasts (id, title, message, deliver_telegram, deliver_inapp, scheduled_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)`
    )
      .bind(bid, title, text, deliverTelegram ? 1 : 0, deliverInApp ? 1 : 0, scheduledIso, actor.id)
      .run();
    return c.json({ ok: true, scheduled: true, id: bid, scheduledAt: scheduledIso, sent: 0, total: 0 });
  }

  const res = await executeAdminBroadcast(c.env, { title, message: text, deliverTelegram, deliverInApp });
  await c.env.DB.prepare(
    `INSERT INTO scheduled_broadcasts (id, title, message, deliver_telegram, deliver_inapp, status, sent_count, created_by, sent_at)
     VALUES (?, ?, ?, ?, ?, 'SENT', ?, ?, datetime('now'))`
  )
    .bind(
      bid,
      title,
      text,
      deliverTelegram ? 1 : 0,
      deliverInApp ? 1 : 0,
      Math.max(res.sentTelegram, res.deliveredInApp),
      actor.id
    )
    .run()
    .catch(() => {});

  return c.json({
    ok: true,
    scheduled: false,
    sent: res.sentTelegram,
    total: res.totalTelegram,
    deliveredInApp: res.deliveredInApp,
  });
});

// =========================================================================
// Full Plan CRUD (Admin Panel)
// =========================================================================

adminRoutes.get('/plans', async (c) => {
  const res = await c.env.DB.prepare(`SELECT * FROM subscription_plans ORDER BY sort_order ASC`).all();
  return c.json({ plans: res.results });
});

adminRoutes.post('/plans', async (c) => {
  const body = await c.req.json<{
    code?: string;
    name_fa?: string;
    name_en?: string;
    description_fa?: string;
    description_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    max_live_exchanges?: number;
    features?: string[];
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  const code = (body.code || `plan_${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const priceUsd = Math.max(1, Number(body.price_usd ?? 29));
  const priceToman = Math.max(10000, Number(body.price_toman ?? priceUsd * 70000));
  const durationDays = Math.max(1, Number(body.duration_days ?? 30));

  await c.env.DB.prepare(
    `INSERT INTO subscription_plans
     (code, name_fa, name_en, description_fa, description_en, price_usd, price_toman, duration_days, max_live_exchanges,
      allow_ai_trading, allow_codexbot, allow_copy_trade, allow_live_trading, features_json, is_popular, is_active, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?, 10, datetime('now'))
     ON CONFLICT(code) DO UPDATE SET
      name_fa = excluded.name_fa,
      name_en = excluded.name_en,
      description_fa = excluded.description_fa,
      description_en = excluded.description_en,
      price_usd = excluded.price_usd,
      price_toman = excluded.price_toman,
      duration_days = excluded.duration_days,
      max_live_exchanges = excluded.max_live_exchanges,
      features_json = excluded.features_json,
      is_popular = excluded.is_popular,
      is_active = excluded.is_active,
      updated_at = datetime('now')`
  ).bind(
    code,
    (body.name_fa || 'پلن جدید').trim(),
    (body.name_en || 'Custom Plan').trim(),
    (body.description_fa || '').trim(),
    (body.description_en || '').trim(),
    priceUsd,
    priceToman,
    durationDays,
    Math.max(1, Number(body.max_live_exchanges ?? 3)),
    JSON.stringify(Array.isArray(body.features) && body.features.length ? body.features : ['دسترسی کامل ترید هوشمند، هوش مصنوعی من، کپی‌ترید و استراتژی شخصی']),
    body.is_popular ? 1 : 0,
    body.is_active !== false ? 1 : 0
  ).run();

  return c.json({ ok: true, code });
});

adminRoutes.patch('/plans/:code', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json<{
    name_fa?: string;
    name_en?: string;
    price_usd?: number;
    price_toman?: number;
    duration_days?: number;
    is_popular?: boolean;
    is_active?: boolean;
  }>();
  await c.env.DB.prepare(
    `UPDATE subscription_plans
     SET name_fa = COALESCE(?, name_fa),
         name_en = COALESCE(?, name_en),
         price_usd = COALESCE(?, price_usd),
         price_toman = COALESCE(?, price_toman),
         duration_days = COALESCE(?, duration_days),
         is_popular = COALESCE(?, is_popular),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
     WHERE code = ?`
  ).bind(
    body.name_fa ?? null,
    body.name_en ?? null,
    typeof body.price_usd === 'number' ? body.price_usd : null,
    typeof body.price_toman === 'number' ? body.price_toman : null,
    typeof body.duration_days === 'number' ? body.duration_days : null,
    body.is_popular !== undefined ? (body.is_popular ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    code
  ).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin Gift Codes List & User Wallet
// =========================================================================

adminRoutes.get('/gift-codes', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM gift_codes ORDER BY created_at DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return c.json({ giftCodes: rows.results });
});

adminRoutes.delete('/gift-codes/:code', async (c) => {
  const code = c.req.param('code');
  await c.env.DB.prepare(`UPDATE gift_codes SET is_active = 0 WHERE code = ?`).bind(code).run();
  return c.json({ ok: true });
});

adminRoutes.post('/users/:id/wallet', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ amountUsdt: number }>();
  const amount = Number(body.amountUsdt);
  if (!Number.isFinite(amount)) return c.json({ error: 'Invalid amount' }, 400);
  await c.env.DB.prepare(
    `UPDATE users SET wallet_balance_usdt = MAX(0, wallet_balance_usdt + ?) WHERE id = ?`
  ).bind(amount, id).run();
  return c.json({ ok: true });
});

// =========================================================================
// Admin-Verified Copy Traders Management & Trade Publishing
// =========================================================================

adminRoutes.get('/copy-traders', async (c) => {
  await syncAutoTopSiteTraders(c.env.DB).catch(() => {});
  const [traders, trades, candidates, autoConfig] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM copy_traders ORDER BY is_active DESC, roi_30d_pct DESC, created_at DESC`).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(`SELECT * FROM copy_trader_trades ORDER BY opened_at DESC LIMIT 100`).all().catch(() => ({ results: [] })),
    discoverTopSiteTraders(c.env.DB, 30),
    getSiteTraderAutoConfig(c.env.DB),
  ]);
  return c.json({ traders: traders.results, trades: trades.results, candidates, autoConfig });
});

adminRoutes.get('/site-traders/top', async (c) => {
  const [candidates, autoConfig] = await Promise.all([
    discoverTopSiteTraders(c.env.DB, 35),
    getSiteTraderAutoConfig(c.env.DB),
  ]);
  return c.json({ ok: true, candidates, autoConfig });
});

adminRoutes.post('/site-traders/:userId/promote', async (c) => {
  const targetUserId = c.req.param('userId');
  const body = (await c.req.json().catch(() => ({}))) as { active?: boolean; askConfirm?: boolean };
  const res = await promoteSiteTraderToCopyList(c.env.DB, targetUserId, {
    active: body.active !== false,
    askConfirm: body.askConfirm !== false,
  });
  if (!res.ok) return c.json(res, 404);
  const [candidates, traders] = await Promise.all([
    discoverTopSiteTraders(c.env.DB, 35),
    c.env.DB.prepare(`SELECT * FROM copy_traders ORDER BY is_active DESC, roi_30d_pct DESC`).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ ...res, candidates, traders: traders.results });
});

adminRoutes.post('/site-traders/sync-auto', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean;
    minWinRate?: number;
    maxCount?: number;
  };
  const updates: Array<[string, string]> = [];
  if (typeof body.enabled === 'boolean') updates.push(['auto_publish_top_traders', body.enabled ? 'true' : 'false']);
  if (typeof body.minWinRate === 'number' && Number.isFinite(body.minWinRate)) {
    updates.push(['auto_publish_min_win_rate', String(Math.max(0, Math.min(95, body.minWinRate)))]);
  }
  if (typeof body.maxCount === 'number' && Number.isFinite(body.maxCount)) {
    updates.push(['auto_publish_max_count', String(Math.max(1, Math.min(20, Math.round(body.maxCount))))]);
  }
  for (const [k, v] of updates) {
    await c.env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
      .bind(k, v)
      .run();
  }
  invalidateSettingsCache(c.env.DB);
  invalidatePublicCopyTradersCache(c.env.DB);
  const syncRes = await syncAutoTopSiteTraders(c.env.DB, true);
  const [candidates, autoConfig, traders] = await Promise.all([
    discoverTopSiteTraders(c.env.DB, 35),
    getSiteTraderAutoConfig(c.env.DB),
    c.env.DB.prepare(`SELECT * FROM copy_traders ORDER BY is_active DESC, roi_30d_pct DESC`).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ ok: true, ...syncRes, candidates, autoConfig, traders: traders.results });
});

adminRoutes.post('/copy-traders', async (c) => {
  const body = await c.req.json<{
    display_name: string;
    handle?: string;
    user_id?: string;
    user_email?: string;
    telegram_id?: string;
    auto_ask_publish?: boolean;
    bio_fa?: string;
    bio_en?: string;
    specialty?: string;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    min_allocation_usd?: number;
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    is_verified?: boolean;
  }>();
  const displayName = (body.display_name || '').trim();
  if (!displayName) return c.json({ error: 'نام نمایشی تریدر الزامی است.' }, 400);

  let resolvedUserId = body.user_id?.trim() || null;
  let resolvedTgId = body.telegram_id?.trim() || null;
  if (!resolvedUserId && body.user_email?.trim()) {
    const uRow = await c.env.DB.prepare(`SELECT id, telegram_id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .bind(body.user_email.trim()).first<{ id: string; telegram_id: string | null }>().catch(() => null);
    if (uRow) {
      resolvedUserId = uRow.id;
      if (!resolvedTgId && uRow.telegram_id) resolvedTgId = uRow.telegram_id;
    }
  }

  const id = randomId('ct');
  await c.env.DB.prepare(
    `INSERT INTO copy_traders
     (id, user_id, telegram_id, auto_ask_publish, display_name, handle, bio_fa, bio_en, specialty, win_rate, roi_30d_pct, max_drawdown_pct, min_allocation_usd, risk_level, is_verified, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    resolvedUserId,
    resolvedTgId,
    body.auto_ask_publish !== false ? 1 : 0,
    displayName,
    (body.handle || `@${displayName.replace(/\s+/g, '_').toLowerCase()}`).slice(0, 40),
    (body.bio_fa || '').trim(),
    (body.bio_en || '').trim(),
    (body.specialty || 'AI & Futures').trim(),
    Number(body.win_rate ?? 75),
    Number(body.roi_30d_pct ?? 40),
    Number(body.max_drawdown_pct ?? 6),
    Number(body.min_allocation_usd ?? 50),
    body.risk_level || 'MEDIUM',
    body.is_verified !== false ? 1 : 0
  ).run();

  invalidatePublicCopyTradersCache(c.env.DB);
  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    display_name?: string;
    user_id?: string | null;
    telegram_id?: string | null;
    auto_ask_publish?: boolean;
    win_rate?: number;
    roi_30d_pct?: number;
    max_drawdown_pct?: number;
    is_verified?: boolean;
    is_active?: boolean;
    risk_level?: string;
  }>();

  await c.env.DB.prepare(
    `UPDATE copy_traders
     SET display_name = COALESCE(?, display_name),
         user_id = COALESCE(?, user_id),
         telegram_id = COALESCE(?, telegram_id),
         auto_ask_publish = COALESCE(?, auto_ask_publish),
         win_rate = COALESCE(?, win_rate),
         roi_30d_pct = COALESCE(?, roi_30d_pct),
         max_drawdown_pct = COALESCE(?, max_drawdown_pct),
         is_verified = COALESCE(?, is_verified),
         is_active = COALESCE(?, is_active),
         risk_level = COALESCE(?, risk_level),
         updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    body.display_name ?? null,
    body.user_id !== undefined ? body.user_id : null,
    body.telegram_id !== undefined ? body.telegram_id : null,
    body.auto_ask_publish !== undefined ? (body.auto_ask_publish ? 1 : 0) : null,
    typeof body.win_rate === 'number' ? body.win_rate : null,
    typeof body.roi_30d_pct === 'number' ? body.roi_30d_pct : null,
    typeof body.max_drawdown_pct === 'number' ? body.max_drawdown_pct : null,
    body.is_verified !== undefined ? (body.is_verified ? 1 : 0) : null,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
    body.risk_level ?? null,
    id
  ).run();

  invalidatePublicCopyTradersCache(c.env.DB);
  return c.json({ ok: true });
});

adminRoutes.delete('/copy-traders/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM copy_traders WHERE id = ?`).bind(id).run();
  invalidatePublicCopyTradersCache(c.env.DB);
  return c.json({ ok: true });
});

adminRoutes.post('/copy-traders/:id/trades', async (c) => {
  const traderId = c.req.param('id');
  const body = await c.req.json<{
    symbol: string;
    direction: 'LONG' | 'SHORT';
    leverage?: number;
    entry_price: string;
    stop_loss?: string;
    tp1?: string;
    tp2?: string;
    tp3?: string;
    status?: 'OPEN' | 'CLOSED';
    pnl_pct?: number;
    note?: string;
    askConfirm?: boolean;
    mirrorNow?: boolean;
  }>();
  const sym = (body.symbol || 'BTCUSDT').toUpperCase().trim();
  const dir = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const lev = Math.max(1, Number(body.leverage ?? 5));
  const id = randomId('ctt');
  const publishStatus = body.askConfirm ? 'PENDING_CONFIRM' : 'PUBLISHED';

  await c.env.DB.prepare(
    `INSERT INTO copy_trader_trades
     (id, trader_id, symbol, direction, leverage, entry_price, stop_loss, tp1, tp2, tp3, status, publish_status, pnl_pct, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    traderId,
    sym,
    dir,
    lev,
    String(body.entry_price || '0'),
    body.stop_loss ? String(body.stop_loss) : null,
    body.tp1 ? String(body.tp1) : null,
    body.tp2 ? String(body.tp2) : null,
    body.tp3 ? String(body.tp3) : null,
    body.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    publishStatus,
    Number(body.pnl_pct ?? 0),
    (body.note || '').trim() || null
  ).run();

  const trader = await c.env.DB.prepare(
    `SELECT ct.display_name, ct.telegram_id, u.telegram_id AS linked_tg_id
     FROM copy_traders ct LEFT JOIN users u ON u.id = ct.user_id WHERE ct.id = ? LIMIT 1`
  ).bind(traderId).first<{ display_name: string; telegram_id: string | null; linked_tg_id: string | null }>().catch(() => null);

  let mirrorResult = null;
  if (body.askConfirm && trader) {
    await promptCopyTraderPublish(c.env, {
      traderId,
      traderName: trader.display_name,
      traderTelegramId: trader.telegram_id || trader.linked_tg_id,
      copyTradeId: id,
      symbol: sym,
      direction: dir,
      leverage: lev,
      entryPrice: String(body.entry_price || '0'),
      stopLoss: body.stop_loss,
      tp1: body.tp1,
      tp2: body.tp2,
      tp3: body.tp3,
    });
  } else if (body.mirrorNow && body.status !== 'CLOSED') {
    mirrorResult = await confirmAndMirrorCopyTrade(c.env, id, true);
  }

  invalidatePublicCopyTradersCache(c.env.DB);
  return c.json({ ok: true, id, publishStatus, mirrorResult }, 201);
});

adminRoutes.patch('/copy-traders/trades/:tradeId', async (c) => {
  const tradeId = c.req.param('tradeId');
  const body = await c.req.json<{ status?: 'OPEN' | 'CLOSED'; exit_price?: string; pnl_pct?: number }>();
  await c.env.DB.prepare(
    `UPDATE copy_trader_trades
     SET status = COALESCE(?, status),
         exit_price = COALESCE(?, exit_price),
         pnl_pct = COALESCE(?, pnl_pct),
         closed_at = CASE WHEN ? = 'CLOSED' THEN datetime('now') ELSE closed_at END
     WHERE id = ?`
  ).bind(body.status ?? null, body.exit_price ?? null, typeof body.pnl_pct === 'number' ? body.pnl_pct : null, body.status ?? null, tradeId).run();
  invalidatePublicCopyTradersCache(c.env.DB);
  return c.json({ ok: true });
});

// =========================================================================
// Admin Online Support Ticket Desk (Synced Web + Telegram)
// =========================================================================

adminRoutes.get('/support', async (c) => {
  const [tickets, msgs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT st.*, u.email, u.username, u.telegram_id
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ORDER BY CASE WHEN st.status = 'OPEN' THEN 0 ELSE 1 END, st.last_message_at DESC
       LIMIT 100`
    ).all().catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT * FROM support_messages ORDER BY created_at ASC LIMIT 400`
    ).all().catch(() => ({ results: [] })),
  ]);
  return c.json({ tickets: tickets.results, messages: msgs.results });
});

adminRoutes.post('/support/:ticketId/reply', async (c) => {
  const actor = c.get('user');
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ message?: string; imageDataUrl?: string | null; close?: boolean }>();
  const text = String(body.message || '').trim();
  const imageDataUrl =
    body.imageDataUrl && String(body.imageDataUrl).startsWith('data:image/') && String(body.imageDataUrl).length < 4_500_000
      ? String(body.imageDataUrl)
      : null;
  if (!text && !imageDataUrl) return c.json({ error: 'پاسخ یا تصویر نمی‌تواند خالی باشد.' }, 400);

  const ticket = await c.env.DB.prepare(
    `SELECT st.id, st.user_id, u.telegram_id FROM support_tickets st JOIN users u ON u.id = st.user_id WHERE st.id = ? LIMIT 1`
  ).bind(ticketId).first<{ id: string; user_id: string; telegram_id: string | null }>();
  if (!ticket) return c.json({ error: 'تیکت یافت نشد.' }, 404);

  const displayMsg = text || '📷 تصویر پیوست پاسخ پشتیبانی';
  const msgId = randomId('smsg');
  await c.env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, user_id, sender_role, sender_name, message, image_data_url)
     VALUES (?, ?, ?, 'admin', ?, ?, ?)`
  ).bind(msgId, ticketId, actor.id, actor.username || 'پشتیبانی دلارینو', displayMsg.slice(0, 2000), imageDataUrl).run();

  await c.env.DB.prepare(
    `UPDATE support_tickets SET status = ?, last_message_at = datetime('now') WHERE id = ?`
  ).bind(body.close ? 'CLOSED' : 'ANSWERED', ticketId).run();

  const botToken = ticket.telegram_id ? await resolveTelegramBotToken(c.env) : '';
  if (ticket.telegram_id && botToken) {
    const tg = new TelegramBotClient(botToken);
    const caption = `💬 <b>پاسخ پشتیبانی آنلاین دلارینو:</b>\n\n${displayMsg}`;
    if (imageDataUrl) {
      await tg.sendDataUrlPhoto(ticket.telegram_id, imageDataUrl, caption).catch(() => tg.sendMessage(ticket.telegram_id!, caption).catch(() => {}));
    } else {
      await tg.sendMessage(ticket.telegram_id, caption).catch(() => {});
    }
  }

  return c.json({ ok: true, messageId: msgId });
});

adminRoutes.patch('/support/:ticketId/status', async (c) => {
  const ticketId = c.req.param('ticketId');
  const body = await c.req.json<{ status: 'OPEN' | 'ANSWERED' | 'CLOSED' }>();
  await c.env.DB.prepare(`UPDATE support_tickets SET status = ? WHERE id = ?`).bind(body.status, ticketId).run();
  return c.json({ ok: true });
});

// =========================================================================
// Official @Dollarino_official Channel Signal & News Desk + Bot Admin Check
// =========================================================================

adminRoutes.get('/telegram/channel-status', async (c) => {
  const [cfg, botToken, tokenStatus, autoSig, autoNews, sigAlsoOfficialRow, dbIntervalRow] = await Promise.all([
    resolveChannelAndBotConfig(c.env),
    resolveTelegramBotToken(c.env),
    getTelegramBotTokenStatus(c.env),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'always_on_signals_enabled' LIMIT 1`).first<{ value: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'always_on_ai_broadcast_enabled' LIMIT 1`).first<{ value: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'signals_also_official' LIMIT 1`).first<{ value: string }>().catch(() => null),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'database_report_interval_hours' LIMIT 1`).first<{ value: string }>().catch(() => null),
  ]);

  const channelsPayload = {
    official: { target: cfg.officialChannel, invite: cfg.officialChannelInvite, enabled: cfg.officialEnabled },
    signals: { target: cfg.signalsChannelId, effectiveTarget: cfg.signalsChannelId || cfg.officialChannel, invite: cfg.signalsChannelInvite, enabled: cfg.signalsEnabled },
    results: { target: cfg.resultsChannelId, invite: cfg.resultsChannelInvite, enabled: cfg.resultsEnabled },
    community: { target: cfg.communityGroupId, invite: cfg.communityGroupInvite, enabled: cfg.communityEnabled },
    logs: { target: cfg.logsChannelId, enabled: cfg.logsEnabled },
    database: { target: cfg.databaseChannelId, enabled: cfg.databaseEnabled },
    transactions: { target: cfg.transactionsChannelId, enabled: cfg.transactionsEnabled },
    news: { target: cfg.newsChannelId, effectiveTarget: cfg.newsChannelId || cfg.officialChannel, invite: cfg.newsChannelInvite, enabled: cfg.newsEnabled },
    education: { target: cfg.educationChannelId || cfg.officialChannel, enabled: cfg.educationEnabled },
    alerts: { target: cfg.alertsChannelId || cfg.officialChannel, enabled: cfg.alertsEnabled },
  };
  const automationPayload = {
    alwaysOnSignals: (autoSig?.value ?? 'true') !== 'false',
    alwaysOnAiBroadcast: (autoNews?.value ?? 'true') !== 'false',
    autoPublishSignalsToChannel: cfg.signalsToChannelsEnabled,
    publishSignalsToChannels: cfg.signalsToChannelsEnabled,
    publishSignalsToBotUsers: cfg.signalsToBotEnabled,
    signalsAlsoOfficial: (sigAlsoOfficialRow?.value ?? 'false') === 'true',
    databaseReportIntervalHours: Number(dbIntervalRow?.value || 6) || 6,
  };

  if (!botToken) {
    return c.json({
      ok: false,
      channelHandle: cfg.officialChannel,
      tokenStatus,
      channels: channelsPayload,
      automation: automationPayload,
      error: 'توکن ربات تلگرام هنوز تنظیم نشده است. می‌توانید همین‌جا از پنل ادمین توکن ربات را وارد و ذخیره کنید.',
    });
  }
  const tg = new TelegramBotClient(botToken);
  const primaryCheckTarget = cfg.officialChannel || cfg.signalsChannelId;
  const [status, webhookInfo] = await Promise.all([
    primaryCheckTarget ? tg.checkChannelAdminReadiness(primaryCheckTarget) : Promise.resolve({ ok: true, botUsername: cfg.botUsername, channelTitle: '', status: 'configured' }),
    tg.getWebhookInfo().catch(() => null),
  ]);
  return c.json({
    ...status,
    channelHandle: cfg.officialChannel,
    botUsername: ('botUsername' in status && status.botUsername) || cfg.botUsername,
    tokenStatus,
    webhookInfo,
    automation: automationPayload,
    channels: channelsPayload,
  });
});

adminRoutes.post('/telegram/bot-token', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    botToken?: string;
    webhookBaseUrl?: string;
    webAppUrl?: string;
    clearOverride?: boolean;
  };
  if (body.clearOverride) {
    await clearDbTelegramBotToken(c.env);
    const tokenStatus = await getTelegramBotTokenStatus(c.env);
    return c.json({ ok: true, cleared: true, tokenStatus });
  }
  const origin = new URL(c.req.url).origin;
  const res = await saveAndConfigureTelegramBot(c.env, {
    botToken: body.botToken,
    webhookBaseUrl: body.webhookBaseUrl || c.env.PUBLIC_WEB_URL || origin,
    webAppUrl: body.webAppUrl || c.env.PUBLIC_WEB_URL || origin,
  });
  const tokenStatus = await getTelegramBotTokenStatus(c.env);
  return c.json({ ...res, tokenStatus }, res.ok ? 200 : 400);
});

adminRoutes.post('/channels/test', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    channelKey?: 'official' | 'signals' | 'results' | 'community' | 'logs' | 'database' | 'transactions' | 'news' | 'education' | 'alerts';
    customTarget?: string;
  };
  const botToken = await resolveTelegramBotToken(c.env);
  if (!botToken) {
    return c.json({ ok: false, error: 'توکن ربات تلگرام هنوز تنظیم نشده است. ابتدا توکن ربات را در بخش بالای کانال‌ها ست کنید.' }, 400);
  }
  const cfg = await resolveChannelAndBotConfig(c.env);
  const labels: Record<string, { title: string; target: string; desc: string }> = {
    official: {
      title: '🌟 چنل رسمی و اصلی دلارینو (عمومی)',
      target: cfg.officialChannel,
      desc: 'آپدیت‌های قطعی پروژه، اطلاعیه‌ها، تبلیغات، قرعه‌کشی و توصیه‌های رسمی',
    },
    signals: {
      title: '01. سیگنال دلارینو (عمومی)',
      target: cfg.signalsChannelId || cfg.officialChannel,
      desc: 'انتشار سیگنال‌های معاملاتی و فرصت‌های شناسایی‌شده توسط موتورهای پروژه',
    },
    results: {
      title: '02. نتایج سیگنال دلارینو (عمومی)',
      target: cfg.resultsChannelId || cfg.officialChannel,
      desc: 'نتیجه سیگنال‌ها، سود و زیان، کارت سود، درصد موفقیت و عملکرد سیستم',
    },
    community: {
      title: '03. گروه کاربران دلارینو (گروه)',
      target: cfg.communityGroupId,
      desc: 'ارتباط کاربران، پرسش و پاسخ و تبادل تجربه',
    },
    logs: {
      title: '04. لاگ‌های دلارینو (خصوصی)',
      target: cfg.logsChannelId,
      desc: 'گزارش فعالیت ربات، خطاها، تصمیمات هوش مصنوعی و رویدادهای سیستمی',
    },
    database: {
      title: '05. دیتابیس دلارینو (خصوصی)',
      target: cfg.databaseChannelId,
      desc: 'گزارش داده‌ها، وضعیت ذخیره‌سازی و اطلاعات مدیریتی سیستم',
    },
    transactions: {
      title: '06. تراکنش‌های دلارینو (خصوصی)',
      target: cfg.transactionsChannelId,
      desc: 'موعد تسویه کاربران، فاکتورها و تراکنش‌های مالی',
    },
    news: {
      title: '07. اخبار دلارینو (عمومی)',
      target: cfg.newsChannelId || cfg.officialChannel,
      desc: 'اخبار کریپتو و بازار',
    },
    education: {
      title: '🎓 کانال آموزش دلارینو',
      target: cfg.educationChannelId || cfg.officialChannel,
      desc: 'آموزش‌های ساده و گام‌به‌گام',
    },
    alerts: {
      title: '🚨 کانال آلرت و رادار دلارینو',
      target: cfg.alertsChannelId || cfg.signalsChannelId || cfg.officialChannel,
      desc: 'هشدارهای نوسان و نهنگ‌ها',
    },
  };
  const key = body.channelKey && labels[body.channelKey] ? body.channelKey : 'official';
  const rawTarget = normalizeTelegramTarget(body.customTarget || labels[key]!.target || '');
  if (!rawTarget) {
    return c.json({ ok: false, error: 'آیدی عددی (-100...) یا یوزرنیم (@channel) هنوز وارد نشده است.' }, 400);
  }
  const target: string | number = /^-?\d+$/.test(rawTarget) ? Number(rawTarget) : rawTarget;
  try {
    const tg = new TelegramBotClient(botToken);
    const readiness = await tg.checkChannelAdminReadiness(rawTarget);
    const res = await tg.sendMessage(
      target,
      `✅ **تست اتصال اکوسیستم رسمی DOLLARINO موفق بود!**\n` +
        `📌 بخش: **${labels[key]!.title}**\n` +
        `📝 کاربرد: ${labels[key]!.desc}\n` +
        `🆔 مقصد: \`${rawTarget}\`\n` +
        `👤 درخواست‌کننده: \`${actor.username}\``
    );
    return c.json({
      ok: true,
      target: rawTarget,
      chatTitle: readiness.channelTitle,
      adminReady: readiness.ok,
      warning: readiness.ok ? undefined : readiness.error,
      messageId: res.message_id,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        ok: false,
        target: rawTarget,
        error: `${errMsg} — نکته: ربات را در کانال یا گروه ادمین کنید؛ برای بخش‌های خصوصی (04، 05، 06) آیدی عددی (-100...) را وارد نمایید.`,
      },
      400
    );
  }
});

adminRoutes.post('/channels/verify-all', async (c) => {
  const botToken = await resolveTelegramBotToken(c.env);
  if (!botToken) {
    return c.json({ ok: false, error: 'توکن ربات تلگرام هنوز تنظیم نشده است.' }, 400);
  }
  const cfg = await resolveChannelAndBotConfig(c.env);
  const tg = new TelegramBotClient(botToken);
  const entries = [
    { key: 'official', label: '🌟 چنل رسمی و اصلی دلارینو', target: cfg.officialChannel, enabled: cfg.officialEnabled },
    { key: 'signals', label: '01. سیگنال دلارینو', target: cfg.signalsChannelId, enabled: cfg.signalsEnabled },
    { key: 'results', label: '02. نتایج سیگنال دلارینو', target: cfg.resultsChannelId, enabled: cfg.resultsEnabled },
    { key: 'community', label: '03. گروه کاربران دلارینو', target: cfg.communityGroupId, enabled: cfg.communityEnabled },
    { key: 'logs', label: '04. لاگ‌های دلارینو (خصوصی)', target: cfg.logsChannelId, enabled: cfg.logsEnabled },
    { key: 'database', label: '05. دیتابیس دلارینو (خصوصی)', target: cfg.databaseChannelId, enabled: cfg.databaseEnabled },
    { key: 'transactions', label: '06. تراکنش‌های دلارینو (خصوصی)', target: cfg.transactionsChannelId, enabled: cfg.transactionsEnabled },
    { key: 'news', label: '07. اخبار دلارینو', target: cfg.newsChannelId, enabled: cfg.newsEnabled },
  ];
  const results = await Promise.all(
    entries.map(async (item) => {
      if (!item.target) {
        return { ...item, configured: false, ok: false, status: 'NOT_CONFIGURED' };
      }
      const check = await tg.checkChannelAdminReadiness(item.target);
      return {
        ...item,
        configured: true,
        ok: check.ok,
        chatTitle: check.channelTitle,
        chatType: check.chatType,
        memberStatus: check.status,
        canPostMessages: check.canPostMessages,
        error: check.error,
      };
    })
  );
  return c.json({
    ok: true,
    botUsername: cfg.botUsername,
    results,
  });
});

adminRoutes.post('/channels/send-db-report', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { attachBackupJson?: boolean; note?: string };
  const res = await publishDatabaseReport(c.env, {
    eventType: 'MANUAL_SNAPSHOT',
    actorUsername: actor.username,
    note: body.note,
    attachBackupJson: body.attachBackupJson !== false,
  });
  if (res.skipped) {
    return c.json({ ok: false, error: 'کانال خصوصی 05. دیتابیس دلارینو هنوز تنظیم یا فعال نشده است.' }, 400);
  }
  return c.json(res, res.ok ? 200 : 400);
});

adminRoutes.post('/channels/send-settlement-digest', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.username, COALESCE(u.fee_lock_status, 'ACTIVE') AS lock_status,
            u.fee_grace_deadline,
            COALESCE(u.fee_penalty_usd, 0) AS penalty_usd,
            COALESCE(SUM(CASE WHEN l.status = 'ACCRUED' THEN l.fee_usd ELSE 0 END), 0) AS accrued_usd
     FROM users u
     LEFT JOIN server_fee_ledger l ON l.user_id = u.id
     GROUP BY u.id
     HAVING accrued_usd > 0 OR penalty_usd > 0 OR lock_status != 'ACTIVE'
     ORDER BY (accrued_usd + penalty_usd) DESC
     LIMIT 30`
  )
    .all<{
      id: string;
      username: string;
      lock_status: string;
      fee_grace_deadline: string | null;
      penalty_usd: number;
      accrued_usd: number;
    }>()
    .catch(() => ({ results: [] }));

  const totalDue = rows.results.reduce((acc, r) => acc + Number(r.accrued_usd || 0) + Number(r.penalty_usd || 0), 0);
  const lines = rows.results.length
    ? rows.results
        .map(
          (r, i) =>
            `${i + 1}. \`${r.username}\` · بدهی: **$${(Number(r.accrued_usd) + Number(r.penalty_usd)).toFixed(2)}** · وضعیت: ${r.lock_status}${r.fee_grace_deadline ? ` · سررسید: ${r.fee_grace_deadline}` : ''}`
        )
        .join('\n')
    : '✅ در حال حاضر هیچ کاربر دارای بدهی باز یا موعد تسویه سررسیدشده وجود ندارد.';

  const res = await publishTransactionEvent(c.env, {
    eventType: 'SETTLEMENT_DIGEST',
    status: rows.results.length > 0 ? 'DUE' : 'INFO',
    title: 'گزارش موعد تسویه و کارمزد ۳٪ کاربران',
    amountUsd: totalDue,
    details: `تعداد پرونده‌های فعال: ${rows.results.length}\n\n${lines}`,
  });
  if (res.skipped) {
    return c.json({ ok: false, error: 'کانال خصوصی 06. تراکنش‌های دلارینو هنوز تنظیم یا فعال نشده است.' }, 400);
  }
  return c.json({ ...res, accountsCount: rows.results.length, totalDueUsd: totalDue }, res.ok ? 200 : 400);
});

adminRoutes.post('/channel/publish-official', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json<{
    kind?: 'PROJECT_UPDATE' | 'ANNOUNCEMENT' | 'PROMO' | 'LOTTERY' | 'ADVICE';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    notifyBotUsers?: boolean;
  }>();
  if (!body.title?.trim() || !body.body?.trim()) {
    return c.json({ error: 'عنوان و متن اطلاعیه رسمی الزامی است.' }, 400);
  }
  const res = await publishOfficialAnnouncement(c.env, {
    kind: body.kind || 'PROJECT_UPDATE',
    title: body.title,
    body: body.body,
    mediaUrl: body.mediaUrl?.trim(),
    buttonLabel: body.buttonLabel?.trim(),
    buttonUrl: body.buttonUrl?.trim(),
    notifyBotUsers: body.notifyBotUsers === true,
    createdBy: actor.id,
  });
  return c.json({ ok: !res.error, ...res });
});

adminRoutes.post('/automation/run-now', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    kind?: 'SIGNALS' | 'NEWS' | 'ANALYSIS' | 'EDUCATION' | 'PROMO' | 'ALERT';
  };
  const kind = body.kind || 'NEWS';
  if (kind === 'SIGNALS') {
    const res = await runAlwaysOnSignalRadar(c.env, { fromCron: false, force: true });
    return c.json({ ok: true, kind, ...res });
  }
  const res = await runAlwaysOnAiIntel(c.env, { forceKind: kind });
  return c.json({ ok: true, ...res });
});

adminRoutes.post('/channel/publish-signal', async (c) => {
  const body = await c.req.json<{
    symbol: string;
    direction: 'LONG' | 'SHORT';
    timeframe?: string;
    price?: string;
    entryPrice?: string;
    stopLoss: string;
    leverage?: number;
    tp1: string;
    tp2?: string;
    tp3?: string;
    engineKey?: string;
    engineLabel?: string;
    note?: string;
    notifySubscribers?: boolean;
  }>();

  const sym = (body.symbol || '').trim().toUpperCase();
  let priceVal = String(body.price || body.entryPrice || '').trim();
  if (!priceVal && sym) {
    const mkt = await fetchPublicMarket24h(sym).catch(() => null);
    if (mkt?.lastPrice) priceVal = String(mkt.lastPrice);
  }

  if (!sym || !priceVal || !body.stopLoss || !body.tp1) {
    return c.json({ error: 'نماد، قیمت ورود، حد ضرر و TP1 الزامی هستند.' }, 400);
  }

  const sig: DollarinoSignal = {
    symbol: sym,
    direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
    timeframe: (body.timeframe || '15m').trim(),
    price: priceVal,
    stopLoss: String(body.stopLoss).trim(),
    leverage: Math.max(1, Number(body.leverage ?? 10)),
    tp1: String(body.tp1).trim(),
    tp2: body.tp2 ? String(body.tp2).trim() : undefined,
    tp3: body.tp3 ? String(body.tp3).trim() : undefined,
    engineKey: body.engineKey || 'ai_autonomous_agent',
    engineLabel: body.engineLabel,
    reason: body.note?.trim(),
  };

  const res = await publishSignalBroadcast(c.env, {
    signal: sig,
    source: 'ADMIN_CHANNEL',
    engineKey: sig.engineKey,
    engineLabel: sig.engineLabel,
    publishToChannel: true,
    notifySubscribers: body.notifySubscribers !== false,
  });

  return c.json({ ok: true, ...res });
});

adminRoutes.get('/channel/news', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM channel_news ORDER BY created_at DESC LIMIT 40`
  ).all().catch(() => ({ results: [] }));
  return c.json({ news: rows.results });
});

adminRoutes.post('/channel/publish-news', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json<{
    category?: 'NEWS' | 'ANALYSIS' | 'SIGNAL_UPDATE' | 'ANNOUNCEMENT' | 'ALERT' | 'EDUCATION' | 'PROMO' | 'LOTTERY' | 'ADVICE';
    title: string;
    body: string;
    mediaUrl?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    notifyBotUsers?: boolean;
  }>();

  if (!body.title?.trim() || !body.body?.trim()) {
    return c.json({ error: 'عنوان و متن خبر الزامی است.' }, 400);
  }

  const res = await publishChannelNews(c.env, {
    category: body.category || 'NEWS',
    title: body.title,
    body: body.body,
    mediaUrl: body.mediaUrl?.trim(),
    buttonLabel: body.buttonLabel?.trim(),
    buttonUrl: body.buttonUrl?.trim(),
    notifyBotUsers: body.notifyBotUsers === true,
    createdBy: actor.id,
  });

  return c.json({ ok: !res.error, ...res });
});

adminRoutes.get('/audit-logs', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.username, u.email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 120`
  ).all().catch(() => ({ results: [] }));
  return c.json({ logs: rows.results });
});

adminRoutes.get('/dex-trades', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT d.*, u.username, u.email
     FROM dex_trades d
     JOIN users u ON u.id = d.user_id
     ORDER BY d.opened_at DESC LIMIT 80`
  ).all().catch(() => ({ results: [] }));
  return c.json({ trades: rows.results });
});

adminRoutes.patch('/users/:id/kyc', async (c) => {
  const uid = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    phoneNumber?: string;
    phoneVerified?: boolean;
    trustWalletAddress?: string;
    trustWalletVerified?: boolean;
  };
  await c.env.DB.prepare(
    `UPDATE users SET
       phone_number = COALESCE(?, phone_number),
       phone_verified = COALESCE(?, phone_verified),
       phone_verified_at = CASE WHEN ? = 1 THEN datetime('now') ELSE phone_verified_at END,
       trust_wallet_address = COALESCE(?, trust_wallet_address),
       trust_wallet_verified = COALESCE(?, trust_wallet_verified)
     WHERE id = ?`
  ).bind(
    body.phoneNumber?.trim() || null,
    typeof body.phoneVerified === 'boolean' ? (body.phoneVerified ? 1 : 0) : null,
    body.phoneVerified ? 1 : 0,
    body.trustWalletAddress?.trim() || null,
    typeof body.trustWalletVerified === 'boolean' ? (body.trustWalletVerified ? 1 : 0) : null,
    uid
  ).run();
  return c.json({ ok: true });
});

adminRoutes.get('/referrals', async (c) => {
  const [referrals, withdrawals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.*, u1.username as referrer_name, u1.email as referrer_email, u2.username as referred_name, u2.email as referred_email
       FROM referrals r
       LEFT JOIN users u1 ON u1.id = r.referrer_user_id
       LEFT JOIN users u2 ON u2.id = r.referred_user_id
       ORDER BY r.fraud_flag DESC, r.created_at DESC LIMIT 80`
    )
      .all()
      .catch(() => ({ results: [] })),
    c.env.DB.prepare(
      `SELECT rw.*, u.username, u.email
       FROM referral_withdrawals rw
       JOIN users u ON u.id = rw.user_id
       ORDER BY CASE WHEN rw.status = 'PENDING' THEN 0 ELSE 1 END, rw.created_at DESC LIMIT 60`
    )
      .all()
      .catch(() => ({ results: [] })),
  ]);
  return c.json({ referrals: referrals.results, withdrawals: withdrawals.results });
});

adminRoutes.post('/referrals/withdrawals/:id/decide', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    decision: 'APPROVE' | 'REJECT';
    txHash?: string;
    adminNote?: string;
  };
  const wd = await c.env.DB.prepare(
    `SELECT rw.*, u.username FROM referral_withdrawals rw LEFT JOIN users u ON u.id = rw.user_id WHERE rw.id = ?`
  )
    .bind(id)
    .first<{ id: string; user_id: string; amount_usd: number; status: string; username: string | null; network?: string | null; wallet_address?: string | null }>();
  if (!wd) return c.json({ error: 'Withdrawal request not found' }, 404);
  if (wd.status !== 'PENDING') return c.json({ error: 'Withdrawal already processed' }, 409);

  if (body.decision === 'APPROVE') {
    await c.env.DB.prepare(
      `UPDATE referral_withdrawals
       SET status = 'APPROVED', tx_hash = ?, admin_note = ?, processed_at = datetime('now')
       WHERE id = ?`
    )
      .bind(body.txHash?.trim() || null, body.adminNote?.trim() || 'Paid', id)
      .run();
    await publishTransactionEvent(c.env, {
      eventType: 'REFERRAL_WITHDRAWAL',
      status: 'CONFIRMED',
      title: 'تایید و پرداخت برداشت رفرال',
      username: wd.username || wd.user_id,
      userId: wd.user_id,
      amountUsd: Number(wd.amount_usd || 0),
      network: wd.network || 'USDT',
      txHash: body.txHash?.trim() || null,
      details: body.adminNote?.trim() || `مقصد: ${wd.wallet_address || '—'}`,
    }).catch(() => {});
  } else {
    await c.env.DB.prepare(
      `UPDATE referral_withdrawals
       SET status = 'REJECTED', admin_note = ?, processed_at = datetime('now')
       WHERE id = ?`
    )
      .bind(body.adminNote?.trim() || 'Rejected by admin', id)
      .run();
    // Refund locked amount back to user's referral balance
    await c.env.DB.prepare(
      `UPDATE users SET referral_balance_usd = ROUND(COALESCE(referral_balance_usd, 0) + ?, 2) WHERE id = ?`
    )
      .bind(wd.amount_usd, wd.user_id)
      .run();
    await publishTransactionEvent(c.env, {
      eventType: 'REFERRAL_WITHDRAWAL',
      status: 'REJECTED',
      title: 'رد درخواست برداشت رفرال و بازگشت موجودی',
      username: wd.username || wd.user_id,
      userId: wd.user_id,
      amountUsd: Number(wd.amount_usd || 0),
      network: wd.network || 'USDT',
      details: body.adminNote?.trim() || 'رد توسط مدیریت',
    }).catch(() => {});
  }
  return c.json({ ok: true });
});

adminRoutes.get('/onchain-apis', async (c) => {
  const providers = await listOnchainApiProviders(c.env.DB);
  return c.json({ ok: true, providers });
});

adminRoutes.post('/onchain-apis', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    provider?: OnchainProviderId;
    apiKey?: string;
    baseUrl?: string;
    isActive?: boolean;
    label?: string;
  };
  if (!body.provider) return c.json({ error: 'provider الزامی است' }, 400);
  const res = await saveOnchainApiProviderKey(c.env, {
    provider: body.provider,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl,
    isActive: body.isActive,
    label: body.label,
  });
  const providers = await listOnchainApiProviders(c.env.DB);
  return c.json({ ok: true, masked: res.masked, providers });
});

adminRoutes.post('/onchain-apis/:provider/test', async (c) => {
  const provider = c.req.param('provider') as OnchainProviderId;
  const result = await testOnchainApiProvider(c.env, provider);
  const providers = await listOnchainApiProviders(c.env.DB);
  return c.json({ ...result, providers });
});

adminRoutes.delete('/onchain-apis/:provider', async (c) => {
  const provider = c.req.param('provider');
  await c.env.DB.prepare(
    `UPDATE onchain_api_providers
     SET api_key_masked = NULL, encrypted_api_key = NULL,
         is_active = CASE WHEN requires_key = 0 THEN 1 ELSE 0 END,
         last_test_ok = NULL, last_error = NULL, updated_at = datetime('now')
     WHERE provider = ?`
  )
    .bind(provider)
    .run();
  const providers = await listOnchainApiProviders(c.env.DB);
  return c.json({ ok: true, providers });
});

// =========================================================================
// Promo Banners Carousel Management (Landing + Dashboard)
// =========================================================================

adminRoutes.get('/banners', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM promo_banners ORDER BY sort_order ASC, created_at DESC`
  )
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] }));
  return c.json({ ok: true, banners: rows.results });
});

adminRoutes.post('/banners', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    id?: string;
    badge_fa?: string;
    badge_en?: string;
    title_fa?: string;
    title_en?: string;
    subtitle_fa?: string;
    subtitle_en?: string;
    cta_label_fa?: string;
    cta_label_en?: string;
    cta_target?: string;
    image_url?: string;
    accent_theme?: string;
    placement?: string;
    sort_order?: number;
    is_active?: boolean | number;
  };
  const titleFa = String(body.title_fa || '').trim();
  const subtitleFa = String(body.subtitle_fa || '').trim();
  if (!titleFa || !subtitleFa) return c.json({ error: 'عنوان و متن توضیح بنر الزامی است.' }, 400);

  const id = body.id?.trim() || randomId('banner');
  const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

  await c.env.DB.prepare(
    `INSERT INTO promo_banners (
       id, badge_fa, badge_en, title_fa, title_en, subtitle_fa, subtitle_en,
       cta_label_fa, cta_label_en, cta_target, image_url, accent_theme, placement, sort_order, is_active, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       badge_fa = excluded.badge_fa,
       badge_en = excluded.badge_en,
       title_fa = excluded.title_fa,
       title_en = excluded.title_en,
       subtitle_fa = excluded.subtitle_fa,
       subtitle_en = excluded.subtitle_en,
       cta_label_fa = excluded.cta_label_fa,
       cta_label_en = excluded.cta_label_en,
       cta_target = excluded.cta_target,
       image_url = excluded.image_url,
       accent_theme = excluded.accent_theme,
       placement = excluded.placement,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active,
       updated_at = datetime('now')`
  )
    .bind(
      id,
      String(body.badge_fa || 'اطلاعیه ویژه').slice(0, 80),
      String(body.badge_en || body.badge_fa || 'FEATURED').slice(0, 80),
      titleFa.slice(0, 140),
      String(body.title_en || titleFa).slice(0, 140),
      subtitleFa.slice(0, 320),
      String(body.subtitle_en || subtitleFa).slice(0, 320),
      String(body.cta_label_fa || 'مشاهده و شروع').slice(0, 60),
      String(body.cta_label_en || body.cta_label_fa || 'Explore').slice(0, 60),
      String(body.cta_target || 'copy').slice(0, 200),
      String(body.image_url || '/images/smart-wallet-radar.webp').slice(0, 500),
      String(body.accent_theme || 'gold').slice(0, 24),
      String(body.placement || 'BOTH').toUpperCase(),
      Number(body.sort_order || 1),
      isActive
    )
    .run();

  invalidateDbPublicCache(c.env.DB, 'public:banners');
  const rows = await c.env.DB.prepare(`SELECT * FROM promo_banners ORDER BY sort_order ASC, created_at DESC`).all();
  return c.json({ ok: true, id, banners: rows.results });
});

adminRoutes.patch('/banners/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { is_active?: boolean | number; sort_order?: number };
  if (typeof body.is_active !== 'undefined') {
    await c.env.DB.prepare(`UPDATE promo_banners SET is_active = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, id)
      .run();
  }
  if (typeof body.sort_order === 'number') {
    await c.env.DB.prepare(`UPDATE promo_banners SET sort_order = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(body.sort_order, id)
      .run();
  }
  invalidateDbPublicCache(c.env.DB, 'public:banners');
  const rows = await c.env.DB.prepare(`SELECT * FROM promo_banners ORDER BY sort_order ASC, created_at DESC`).all();
  return c.json({ ok: true, banners: rows.results });
});

adminRoutes.delete('/banners/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM promo_banners WHERE id = ?`).bind(id).run();
  invalidateDbPublicCache(c.env.DB, 'public:banners');
  const rows = await c.env.DB.prepare(`SELECT * FROM promo_banners ORDER BY sort_order ASC, created_at DESC`).all();
  return c.json({ ok: true, banners: rows.results });
});

// =========================================================================
// System Health, D1 Housekeeping & Smart Copy V2 Telemetry
// =========================================================================

adminRoutes.get('/system-health', async (c) => {
  const [
    runningBots,
    openCexTrades,
    smartRules,
    openCopyV2,
    vaultCount,
    perpOrders,
    auditCount,
    activeBanners,
    activeProviders,
    activeAiEngines,
    trc20Row,
  ] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM bot_configs WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_follow_rules WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_positions_v2 WHERE status = 'OPEN'`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM user_copy_vaults`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM perp_dex_orders`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM audit_logs`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM promo_banners WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM onchain_api_providers WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM platform_ai_engines WHERE is_active = 1`).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'usdt_trc20_wallet' LIMIT 1`).first<{ value: string }>().catch(() => null),
  ]);

  const jwtSec = (c.env.SESSION_JWT_SECRET || '').trim();
  const encKey = (c.env.MASTER_ENCRYPTION_KEY || '').trim();
  const trc20Val = (trc20Row?.value || '').trim();
  const feeWalletOk = Boolean(trc20Val) && !trc20Val.includes('YourTRC20WalletAddress');

  return c.json({
    ok: true,
    health: {
      runningBots: runningBots?.cnt ?? 0,
      openCexTrades: openCexTrades?.cnt ?? 0,
      activeSmartCopyRules: smartRules?.cnt ?? 0,
      openCopyPositionsV2: openCopyV2?.cnt ?? 0,
      userCopyVaults: vaultCount?.cnt ?? 0,
      perpDexOrders: perpOrders?.cnt ?? 0,
      auditLogsTotal: auditCount?.cnt ?? 0,
      activeBanners: activeBanners?.cnt ?? 0,
      activeOnchainProviders: activeProviders?.cnt ?? 0,
      cronIntervalSec: 60,
      productionChecks: {
        jwtSecretOk: jwtSec.length >= 24 && !jwtSec.includes('dev-secret'),
        encryptionKeyOk: encKey.length >= 32,
        ownerTelegramIdConfigured: Boolean(await resolveOwnerTelegramId(c.env)),
        telegramBotConfigured: Boolean(await resolveTelegramBotToken(c.env)),
        aiEngineConfigured: Boolean(c.env.HILINKUP_API_KEY?.trim()) || (activeAiEngines?.cnt ?? 0) > 0,
        feeReceiverWalletConfigured: feeWalletOk,
        googleOauthConfigured: Boolean(
          (c.env.GOOGLE_CLIENT_ID?.trim() || (await c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'google_client_id'`).first<{ value: string }>().catch(() => null))?.value?.trim()) &&
          (c.env.GOOGLE_CLIENT_SECRET?.trim() || (await c.env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'google_client_secret'`).first<{ value: string }>().catch(() => null))?.value?.trim())
        ),
        allowLiveTrading: c.env.ALLOW_LIVE_TRADING === 'true',
        publicWebUrl: c.env.PUBLIC_WEB_URL || '',
      },
      timestamp: new Date().toISOString(),
    },
  });
});

adminRoutes.post('/prune-logs', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    scope?: 'ALL_STALE' | 'AUDIT_ONLY' | 'SIGNALS_30D' | 'NEWS_30D' | 'AI_SIGNALS';
  };
  const scope = body.scope || 'ALL_STALE';
  const cutoffSec = Math.floor(Date.now() / 1000) - 86400;
  let totalDeleted = 0;

  if (scope === 'AUDIT_ONLY' || scope === 'ALL_STALE') {
    const r1 = await c.env.DB.prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-5 days')`).run().catch(() => ({ meta: { changes: 0 } }));
    const r4 = await c.env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).bind(cutoffSec).run().catch(() => ({ meta: { changes: 0 } }));
    totalDeleted += (r1.meta?.changes ?? 0) + (r4.meta?.changes ?? 0);
  }
  if (scope === 'SIGNALS_30D' || scope === 'ALL_STALE') {
    const r2 = await c.env.DB.prepare(`DELETE FROM signals WHERE created_at < datetime('now', '-14 days') AND status != 'PENDING'`).run().catch(() => ({ meta: { changes: 0 } }));
    totalDeleted += r2.meta?.changes ?? 0;
  }
  if (scope === 'NEWS_30D' || scope === 'ALL_STALE') {
    const r3 = await c.env.DB.prepare(`DELETE FROM channel_news WHERE created_at < datetime('now', '-14 days')`).run().catch(() => ({ meta: { changes: 0 } }));
    totalDeleted += r3.meta?.changes ?? 0;
  }
  if (scope === 'AI_SIGNALS' || scope === 'ALL_STALE') {
    const r5 = await c.env.DB.prepare(`DELETE FROM platform_ai_signals WHERE created_at < datetime('now', '-7 days')`).run().catch(() => ({ meta: { changes: 0 } }));
    totalDeleted += r5.meta?.changes ?? 0;
  }

  const countAfter = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM audit_logs`).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
  return c.json({ ok: true, scope, deletedRows: totalDeleted, remainingRows: countAfter?.cnt ?? 0 });
});

// =========================================================================
// Central Treasury / Bank Wallet (Owner Trust Wallet + BIP39 Seed + Deposit Approvals)
// =========================================================================

adminRoutes.get('/treasury', async (c) => {
  const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
  return c.json({ ok: true, ...summary });
});

adminRoutes.post('/treasury/connect-wallet', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    evmAddress?: string;
    tronAddress?: string;
    solanaAddress?: string;
    tonAddress?: string;
  };
  try {
    const res = await connectOwnerWalletAsTreasury(c.env.DB, actor.id, body);
    const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, category, level, message) VALUES (?, ?, 'SYSTEM', 'INFO', ?)`
    )
      .bind(randomId('aud'), actor.id, `Owner connected Treasury wallet(s): ${res.receivers.evm || res.receivers.tron || ''}`)
      .run()
      .catch(() => {});
    return c.json({ ok: true, ...res, summary });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

adminRoutes.post('/treasury/import-mnemonic', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    mnemonic?: string;
    solanaAddress?: string;
    tonAddress?: string;
  };
  try {
    const res = await importOwnerMnemonicAsTreasury(c.env.DB, c.env.MASTER_ENCRYPTION_KEY, body.mnemonic || '', {
      solanaAddress: body.solanaAddress,
      tonAddress: body.tonAddress,
    });
    const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, category, level, message) VALUES (?, ?, 'SYSTEM', 'INFO', ?)`
    )
      .bind(randomId('aud'), actor.id, `Admin imported encrypted BIP39 Treasury seed (${res.receivers.evm})`)
      .run()
      .catch(() => {});
    return c.json({ ok: true, ...res, summary });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

adminRoutes.post('/treasury/receivers', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    trc20?: string;
    tron?: string;
    evm?: string;
    solana?: string;
    ton?: string;
    minDepositUsd?: number;
  };
  await saveManualTreasuryReceivers(c.env.DB, {
    evm: body.evm,
    tron: body.tron ?? body.trc20,
    solana: body.solana,
    ton: body.ton,
    minDepositUsd: body.minDepositUsd,
  });
  const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
  return c.json({ ok: true, summary });
});

adminRoutes.post('/treasury/deposits/:id/decide', async (c) => {
  const actor = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { approve?: boolean; note?: string };
  const approve = body.approve !== false;
  try {
    const depMeta = await c.env.DB.prepare(
      `SELECT td.user_id, td.amount_usd, td.network, td.asset, td.tx_hash, td.category, u.username
       FROM treasury_deposits td LEFT JOIN users u ON u.id = td.user_id WHERE td.id = ? LIMIT 1`
    )
      .bind(id)
      .first<{
        user_id: string;
        amount_usd: number;
        network: string;
        asset: string;
        tx_hash: string;
        category: string;
        username: string | null;
      }>()
      .catch(() => null);

    if (approve) {
      const creditRes = await applyConfirmedTreasuryCredit(c.env.DB, id, body.note || `تایید شده توسط ${actor.username}`);
      await publishTransactionEvent(c.env, {
        eventType: 'TREASURY_DEPOSIT',
        status: 'CONFIRMED',
        title: 'تایید واریز خزانه و شارژ حساب',
        username: depMeta?.username || depMeta?.user_id || id,
        userId: depMeta?.user_id,
        amountUsd: Number(depMeta?.amount_usd || 0),
        network: depMeta?.network,
        asset: depMeta?.asset,
        txHash: depMeta?.tx_hash,
        details: `تایید شده توسط ${actor.username} | تسویه بدهی: $${Number(creditRes.settledDebtUsd || 0).toFixed(2)} | اعتبار اضافه‌شده: $${Number(creditRes.addedCreditUsd || 0).toFixed(2)}`,
      }).catch(() => {});
      const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
      return c.json({
        ok: true,
        status: 'CONFIRMED',
        settledDebtUsd: creditRes.settledDebtUsd,
        addedCreditUsd: creditRes.addedCreditUsd,
        summary,
      });
    } else {
      await c.env.DB.prepare(
        `UPDATE treasury_deposits SET status = 'REJECTED', admin_note = COALESCE(?, admin_note) WHERE id = ?`
      )
        .bind(body.note || 'رد شده توسط مدیریت', id)
        .run();
      await publishTransactionEvent(c.env, {
        eventType: 'TREASURY_DEPOSIT',
        status: 'REJECTED',
        title: 'رد واریز خزانه توسط مدیر',
        username: depMeta?.username || depMeta?.user_id || id,
        userId: depMeta?.user_id,
        amountUsd: Number(depMeta?.amount_usd || 0),
        network: depMeta?.network,
        asset: depMeta?.asset,
        txHash: depMeta?.tx_hash,
        details: body.note || `رد شده توسط ${actor.username}`,
      }).catch(() => {});
      const summary = await getAdminTreasurySummary(c.env.DB, c.env.MASTER_ENCRYPTION_KEY);
      return c.json({ ok: true, status: 'REJECTED', summary });
    }
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// =========================================================================
// Owner User Controls (Fee Credit Grant, Debt Waiver, Safe User Delete)
// =========================================================================

adminRoutes.post('/users/:id/fee-credit', async (c) => {
  const actor = c.get('user');
  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم اجازه اعطای اعتبار کارمزد دارد.' }, 403);
  }
  const targetId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { amountUsd?: number; note?: string };
  const amount = Number(body.amountUsd);
  if (!Number.isFinite(amount) || Math.abs(amount) > 100_000) {
    return c.json({ error: 'مبلغ اعتبار نامعتبر است.' }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE users SET fee_prepaid_credit_usd = ROUND(MAX(0, COALESCE(fee_prepaid_credit_usd, 0) + ?), 4) WHERE id = ?`
  ).bind(amount, targetId).run();
  const updated = await c.env.DB.prepare(
    `SELECT username, telegram_id, COALESCE(fee_prepaid_credit_usd, 0) as fee_credit_usd FROM users WHERE id = ?`
  ).bind(targetId).first<{
    username: string; telegram_id: string | null; fee_credit_usd: number;
  }>().catch(() => null);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'ADJUST_FEE_CREDIT', 'users', ?, ?)`
  ).bind(randomId('aud'), actor.id, targetId, JSON.stringify({ amount, note: body.note || '' })).run().catch(() => {});

  if (updated?.telegram_id && amount > 0) {
    const botToken = await resolveTelegramBotToken(c.env).catch(() => '');
    if (botToken) {
      await new TelegramBotClient(botToken)
        .sendMessage(
          updated.telegram_id,
          `🎁 مدیریت دلارینو مبلغ $${amount.toFixed(2)} اعتبار رایگان کارمزد ۳٪ سود به حساب شما اضافه کرد!\nموجودی فعلی اعتبار کارمزد: $${Number(updated.fee_credit_usd || 0).toFixed(2)}`
        )
        .catch(() => {});
    }
  }
  return c.json({ ok: true, feeCreditUsd: Number(updated?.fee_credit_usd || 0) });
});

adminRoutes.post('/users/:id/reset-fee-debt', async (c) => {
  const actor = c.get('user');
  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم اجازه بخشش بدهی کارمزد را دارد.' }, 403);
  }
  const targetId = c.req.param('id');
  const res = await c.env.DB.prepare(
    `UPDATE server_fee_ledger SET status = 'WAIVED', note = 'Waived by owner'
     WHERE user_id = ? AND status = 'ACCRUED'`
  ).bind(targetId).run();
  await c.env.DB.prepare(
    `UPDATE users SET fee_penalty_usd = 0, fee_lock_status = 'ACTIVE', fee_grace_deadline = NULL WHERE id = ?`
  ).bind(targetId).run().catch(() => {});
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'WAIVE_SERVER_FEE_DEBT', 'users', ?, ?)`
  ).bind(randomId('aud'), actor.id, targetId, JSON.stringify({ waivedRows: res.meta?.changes ?? 0 })).run().catch(() => {});
  return c.json({ ok: true, waivedRows: res.meta?.changes ?? 0 });
});

adminRoutes.delete('/users/:id', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare(`SELECT id, role, username FROM users WHERE id = ?`)
    .bind(targetId)
    .first<{ id: string; role: string; username: string }>()
    .catch(() => null);
  if (!target) return c.json({ error: 'کاربر یافت نشد.' }, 404);

  const isTargetPrivileged = target.role === 'owner' || target.role === 'admin';
  if (isTargetPrivileged) {
    if (actor.id !== targetId && !(await isSystemOwner(actor, c.env))) {
      return c.json({ error: 'فقط مالک اصلی یا خود مدیر مجاز به صفرسازی حساب مدیریتی است.' }, 403);
    }
    await resetPrivilegedUserAccountToFreshState(c.env.DB, targetId);
    await c.env.DB.prepare(
      `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
       VALUES (?, ?, 'RESET_ADMIN_ACCOUNT_TO_FRESH', 'users', ?, ?)`
    )
      .bind(randomId('aud'), actor.id, targetId, JSON.stringify({ username: target.username, preservedRole: target.role }))
      .run()
      .catch(() => {});
    return c.json({
      ok: true,
      resetToFresh: true,
      preservedRole: target.role,
      username: target.username,
      message: `تمامی اطلاعات و موجودی‌های حساب ${target.username} صفر شد و دسترسی ${target.role} حفظ گردید.`,
    });
  }

  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم اجازه حذف کاربر را دارد.' }, 403);
  }

  const userTablesWithFk = [
    'support_messages',
    'support_tickets',
    'referral_withdrawals',
    'referrals',
    'gift_redemptions',
    'server_fee_ledger',
    'treasury_deposits',
    'wallet_ledger',
    'notifications',
    'audit_logs',
    'trades',
    'pending_orders',
    'signals',
    'dex_trades',
    'perp_dex_orders',
    'perp_dex_connections',
    'copy_positions_v2',
    'copy_follow_rules',
    'user_copy_vaults',
    'copy_subscriptions',
    'price_alerts',
    'tradingview_free_alerts',
    'user_ai_agents',
    'user_strategies',
    'ai_connections',
    'exchange_connections',
    'telegram_bots',
    'user_subscriptions',
    'bot_configs',
  ];
  for (const tbl of userTablesWithFk) {
    if (tbl === 'referrals') {
      await c.env.DB.prepare(`DELETE FROM referrals WHERE referrer_user_id = ? OR referred_user_id = ?`).bind(targetId, targetId).run().catch(() => {});
    } else {
      await c.env.DB.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).bind(targetId).run().catch(() => {});
    }
  }
  await c.env.DB.prepare(`DELETE FROM users WHERE id = ? AND role != 'owner'`).bind(targetId).run();
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'DELETE_USER', 'users', ?, ?)`
  ).bind(randomId('aud'), actor.id, targetId, JSON.stringify({ username: target.username })).run().catch(() => {});
  return c.json({ ok: true, deletedUsername: target.username });
});

adminRoutes.post('/users/:id/reset-account', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare(`SELECT id, role, username FROM users WHERE id = ?`)
    .bind(targetId)
    .first<{ id: string; role: string; username: string }>()
    .catch(() => null);
  if (!target) return c.json({ error: 'کاربر یافت نشد.' }, 404);
  if (actor.id !== targetId && !(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی یا خود کاربر مجاز به صفرسازی حساب است.' }, 403);
  }
  await resetPrivilegedUserAccountToFreshState(c.env.DB, targetId);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'RESET_ACCOUNT_TO_FRESH', 'users', ?, ?)`
  )
    .bind(randomId('aud'), actor.id, targetId, JSON.stringify({ username: target.username, preservedRole: target.role }))
    .run()
    .catch(() => {});
  return c.json({
    ok: true,
    resetToFresh: true,
    preservedRole: target.role,
    username: target.username,
    message: `تمامی اطلاعات و موجودی‌های حساب ${target.username} صفر شد و دسترسی ${target.role} حفظ گردید.`,
  });
});

// =========================================================================
// Owner-Only Full D1 Database Backup, Restore, Wipe & Telemetry
// =========================================================================

// Parent-first order for inserts/backups; reverse for safe FK-clean deletes
const D1_BACKUP_TABLE_ORDER = [
  'system_settings',
  'subscription_plans',
  'copy_traders',
  'onchain_api_providers',
  'platform_ai_engines',
  'promo_banners',
  'users',
  'bot_configs',
  'exchange_connections',
  'ai_connections',
  'user_strategies',
  'user_ai_agents',
  'user_subscriptions',
  'telegram_bots',
  'telegram_pending_actions',
  'signals',
  'trades',
  'pending_orders',
  'wallet_ledger',
  'audit_logs',
  'notifications',
  'price_alerts',
  'tradingview_free_alerts',
  'gift_codes',
  'gift_redemptions',
  'referrals',
  'referral_withdrawals',
  'support_tickets',
  'support_messages',
  'copy_trader_trades',
  'copy_subscriptions',
  'watched_smart_wallets',
  'copy_follow_rules',
  'user_copy_vaults',
  'copy_positions_v2',
  'dex_trades',
  'perp_dex_connections',
  'perp_dex_orders',
  'channel_news',
  'scheduled_broadcasts',
  'platform_ai_signals',
  'new_listing_events',
  'server_fee_ledger',
  'treasury_deposits',
  'admin_audit_logs',
  'rate_limits',
  'market_snapshots',
];

const OPERATIONAL_RESET_TABLES = [
  'support_messages',
  'support_tickets',
  'server_fee_ledger',
  'treasury_deposits',
  'wallet_ledger',
  'notifications',
  'audit_logs',
  'trades',
  'pending_orders',
  'signals',
  'dex_trades',
  'perp_dex_orders',
  'copy_positions_v2',
  'copy_trader_trades',
  'copy_subscriptions',
  'channel_news',
  'scheduled_broadcasts',
  'platform_ai_signals',
  'new_listing_events',
  'price_alerts',
  'tradingview_free_alerts',
  'telegram_pending_actions',
  'rate_limits',
  'market_snapshots',
];

async function discoverAllUserTables(db: D1Database): Promise<string[]> {
  const masterRows = await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'
       ORDER BY name ASC`
    )
    .all<{ name: string }>()
    .catch(() => ({ results: [] }));
  const present = new Set(masterRows.results.map((r) => r.name));
  const ordered: string[] = [];
  for (const t of D1_BACKUP_TABLE_ORDER) {
    if (present.has(t)) {
      ordered.push(t);
      present.delete(t);
    }
  }
  for (const rest of present) ordered.push(rest);
  return ordered.filter((t) => isValidSqlIdentifier(t));
}

adminRoutes.get('/database/stats', async (c) => {
  const actor = c.get('user');
  const tables = await discoverAllUserTables(c.env.DB);
  const [pageCountRow, pageSizeRow, idxRow] = await Promise.all([
    c.env.DB.prepare(`PRAGMA page_count`).first<{ page_count: number }>().catch(() => null),
    c.env.DB.prepare(`PRAGMA page_size`).first<{ page_size: number }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`
    ).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
  ]);

  const tableStats: Array<{ table: string; rows: number }> = [];
  for (let i = 0; i < tables.length; i += 12) {
    const chunk = tables.slice(i, i + 12);
    const counts = await Promise.all(
      chunk.map(async (tbl) => {
        const res = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM "${tbl.replace(/"/g, '')}"`)
          .first<{ cnt: number }>()
          .catch(() => ({ cnt: 0 }));
        return { table: tbl, rows: Number(res?.cnt || 0) };
      })
    );
    tableStats.push(...counts);
  }

  tableStats.sort((a, b) => b.rows - a.rows);
  const totalRows = tableStats.reduce((s, t) => s + t.rows, 0);
  const rawBytes = Number(pageCountRow?.page_count || 0) * Number(pageSizeRow?.page_size || 4096);
  const sizeBytes = rawBytes > 0 ? rawBytes : Math.max(16384, totalRows * 380);

  return c.json({
    ok: true,
    isOwner: await isSystemOwner(actor, c.env),
    tableCount: tables.length,
    indexCount: idxRow?.cnt ?? 0,
    totalRows,
    sizeBytes,
    sizeKb: Math.max(1, Math.round(sizeBytes / 1024)),
    tables: tableStats,
  });
});

adminRoutes.get('/database/backup', async (c) => {
  const actor = c.get('user');
  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم (Owner) اجازه گرفتن بکاپ کامل دیتابیس را دارد.' }, 403);
  }
  const excludeSecrets = c.req.query('excludeSecrets') === '1';
  const tables = await discoverAllUserTables(c.env.DB);
  const data: Record<string, Array<Record<string, unknown>>> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const tbl of tables) {
    if (!isValidSqlIdentifier(tbl)) continue;
    const safeTbl = tbl.replace(/"/g, '');
    const res = await c.env.DB.prepare(`SELECT * FROM "${safeTbl}"`).all<Record<string, unknown>>().catch(() => ({ results: [] }));
    let rows = res.results ?? [];
    if (excludeSecrets) {
      if (tbl === 'system_settings') {
        rows = rows.filter((r) => !['telegram_bot_token_enc', 'telegram_webhook_secret_auto', 'treasury_mnemonic_enc', 'google_oauth_client_secret_enc'].includes(String(r.key || '')));
      } else {
        const sensitiveFields = [
          'password_hash',
          'secondary_password_hash',
          'totp_secret',
          'encrypted_credentials',
          'encrypted_api_key',
          'encrypted_bot_token',
          'encrypted_evm_private_key',
          'encrypted_sol_private_key',
          'extension_api_key',
          'webhook_secret',
          'vault_pin_hash',
        ];
        rows = rows.map((row) => {
          const copy = { ...row };
          for (const field of sensitiveFields) {
            if (field in copy && copy[field] !== null && copy[field] !== undefined) {
              copy[field] = '[REDACTED]';
            }
          }
          return copy;
        });
      }
    }
    data[tbl] = rows;
    rowCounts[tbl] = rows.length;
    totalRows += rows.length;
  }

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'DATABASE_BACKUP_EXPORT', 'database', 'd1', ?)`
  ).bind(randomId('aud'), actor.id, JSON.stringify({ tables: tables.length, totalRows, excludeSecrets })).run().catch(() => {});

  await publishDatabaseReport(c.env, {
    eventType: 'BACKUP_EXPORT',
    actorUsername: actor.username,
    note: `بکاپ کامل ${tables.length} جدول با مجموع ${totalRows} رکورد تهیه شد (${excludeSecrets ? 'بدون کلیدهای محرمانه' : 'کامل'}).`,
  }).catch(() => {});

  const payload = {
    format: 'dollarino-d1-backup-v1',
    version: DOLLARINO_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: actor.username,
    excludeSecrets,
    tableOrder: tables,
    rowCounts,
    totalRows,
    tables: data,
  };

  if (c.req.query('download') === '1') {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="dollarino-d1-backup-${stamp}.json"`,
      },
    });
  }
  return c.json(payload);
});

adminRoutes.post('/database/restore', async (c) => {
  const actor = c.get('user');
  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم (Owner) اجازه بازگردانی دیتابیس را دارد.' }, 403);
  }
  const body = (await c.req.json().catch(() => null)) as {
    mode?: 'REPLACE' | 'MERGE';
    confirmPhrase?: string;
    backup?: {
      format?: string;
      tableOrder?: string[];
      tables?: Record<string, Array<Record<string, unknown>>>;
    };
  } | null;

  if (!body || !body.backup || body.backup.format !== 'dollarino-d1-backup-v1' || typeof body.backup.tables !== 'object') {
    return c.json({ error: 'فرمت فایل بکاپ نامعتبر است. فقط فایل‌های dollarino-d1-backup-v1 قابل بازگردانی هستند.' }, 400);
  }

  const mode = body.mode === 'MERGE' ? 'MERGE' : 'REPLACE';
  if (mode === 'REPLACE' && body.confirmPhrase !== 'RESTORE_REPLACE_DB') {
    return c.json({ error: 'برای بازگردانی جایگزین (REPLACE)، عبارت تایید RESTORE_REPLACE_DB الزامی است.' }, 400);
  }

  const existingTables = await discoverAllUserTables(c.env.DB);
  const existingSet = new Set(existingTables);
  const backupTables = body.backup.tables;

  const rawOrder = Array.isArray(body.backup.tableOrder) ? body.backup.tableOrder : Object.keys(backupTables);
  const restoreOrder: string[] = [];
  for (const t of existingTables) {
    if (Object.prototype.hasOwnProperty.call(backupTables, t) && !restoreOrder.includes(t)) restoreOrder.push(t);
  }
  for (const t of rawOrder) {
    if (existingSet.has(t) && Object.prototype.hasOwnProperty.call(backupTables, t) && !restoreOrder.includes(t)) restoreOrder.push(t);
  }

  if (mode === 'REPLACE') {
    for (const tbl of [...restoreOrder].reverse()) {
      const safeTbl = tbl.replace(/"/g, '');
      await c.env.DB.prepare(`DELETE FROM "${safeTbl}"`).run().catch(() => {});
    }
  }

  let insertedRows = 0;
  const restoredTables: Array<{ table: string; rows: number; skipped?: number }> = [];
  const errors: string[] = [];

  for (const tbl of restoreOrder) {
    const rows = backupTables[tbl];
    if (!Array.isArray(rows) || rows.length === 0) {
      restoredTables.push({ table: tbl, rows: 0 });
      continue;
    }
    const safeTbl = tbl.replace(/"/g, '');
    const infoRes = await c.env.DB.prepare(`PRAGMA table_info("${safeTbl}")`).all<{ name: string }>().catch(() => ({ results: [] }));
    const validCols = new Set(infoRes.results.map((r) => r.name));
    if (validCols.size === 0) continue;

    const sampleKeys = new Set<string>();
    for (const r of rows.slice(0, 5)) {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r)) {
          if (validCols.has(k)) sampleKeys.add(k);
        }
      }
    }
    const cols = Array.from(sampleKeys);
    if (cols.length === 0) continue;

    const colSql = cols.map((col) => `"${col.replace(/"/g, '')}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO "${safeTbl}" (${colSql}) VALUES (${placeholders})`;

    let okCount = 0;
    let skipCount = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const stmts = chunk.map((r) => {
        const vals = cols.map((col) => (r[col] === undefined ? null : r[col]));
        return c.env.DB.prepare(sql).bind(...vals);
      });
      try {
        await c.env.DB.batch(stmts);
        okCount += chunk.length;
      } catch (batchErr) {
        for (const stmt of stmts) {
          try {
            await stmt.run();
            okCount++;
          } catch (rowErr) {
            skipCount++;
            if (errors.length < 10) {
              errors.push(`${tbl}: ${rowErr instanceof Error ? rowErr.message : String(batchErr)}`);
            }
          }
        }
      }
    }
    insertedRows += okCount;
    restoredTables.push({ table: tbl, rows: okCount, ...(skipCount > 0 ? { skipped: skipCount } : {}) });
  }

  invalidateSettingsCache(c.env.DB);
  invalidatePublicCopyTradersCache(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'DATABASE_RESTORE', 'database', 'd1', ?)`
  ).bind(randomId('aud'), actor.id, JSON.stringify({ mode, insertedRows, tablesCount: restoredTables.length })).run().catch(() => {});

  await publishDatabaseReport(c.env, {
    eventType: 'RESTORE',
    actorUsername: actor.username,
    note: `حالت بازگردانی: ${mode} | رکوردهای بازگردانی‌شده: ${insertedRows} | جدول‌ها: ${restoredTables.length}`,
  }).catch(() => {});

  return c.json({
    ok: true,
    mode,
    insertedRows,
    restoredTables,
    errors,
  });
});

adminRoutes.post('/database/wipe', async (c) => {
  const actor = c.get('user');
  if (!(await isSystemOwner(actor, c.env))) {
    return c.json({ error: 'فقط مالک اصلی سیستم (Owner) اجازه پاکسازی یا ریست دیتابیس را دارد.' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    mode?: 'OPERATIONAL_RESET' | 'FULL_FACTORY_WIPE';
    preserveOwnerAndSettings?: boolean;
    confirmPhrase?: string;
  };
  const mode = body.mode === 'FULL_FACTORY_WIPE' ? 'FULL_FACTORY_WIPE' : 'OPERATIONAL_RESET';
  const expectedPhrase = mode === 'FULL_FACTORY_WIPE' ? 'DELETE_ALL_DATA' : 'RESET_OPERATIONAL_DATA';
  if (body.confirmPhrase !== expectedPhrase) {
    return c.json({ error: `برای تایید پاکسازی باید دقیقاً عبارت "${expectedPhrase}" را وارد کنید.` }, 400);
  }

  let deletedRows = 0;
  const affectedTables: string[] = [];

  if (mode === 'OPERATIONAL_RESET') {
    for (const tbl of OPERATIONAL_RESET_TABLES) {
      const safeTbl = tbl.replace(/"/g, '');
      const res = await c.env.DB.prepare(`DELETE FROM "${safeTbl}"`).run().catch(() => null);
      if (res) {
        deletedRows += res.meta?.changes ?? 0;
        affectedTables.push(tbl);
      }
    }
    await c.env.DB.prepare(
      `UPDATE bot_configs SET bot_state = 'STOPPED', paper_balance = COALESCE(custom_paper_balance, 10000), updated_at = datetime('now')`
    ).run().catch(() => {});
  } else {
    const preserve = body.preserveOwnerAndSettings !== false;
    const ownerTg = (await resolveOwnerTelegramId(c.env)) || '__NONE__';
    const allTables = await discoverAllUserTables(c.env.DB);
    const deleteOrder = [...allTables].reverse();
    for (const tbl of deleteOrder) {
      const safeTbl = tbl.replace(/"/g, '');
      if (preserve && tbl === 'system_settings') continue;
      if (preserve && tbl === 'platform_ai_engines') continue;
      if (preserve && tbl === 'subscription_plans') continue;
      if (preserve && tbl === 'users') {
        const res = await c.env.DB.prepare(
          `DELETE FROM users WHERE id != ? AND role != 'owner' AND COALESCE(telegram_id, '') != ?`
        ).bind(actor.id, ownerTg).run().catch(() => null);
        if (res) {
          deletedRows += res.meta?.changes ?? 0;
          affectedTables.push('users (non-owner)');
        }
        continue;
      }
      if (preserve && tbl === 'bot_configs') {
        const res = await c.env.DB.prepare(
          `DELETE FROM bot_configs WHERE user_id != ? AND user_id NOT IN (SELECT id FROM users WHERE role = 'owner' OR COALESCE(telegram_id, '') = ?)`
        ).bind(actor.id, ownerTg).run().catch(() => null);
        if (res) {
          deletedRows += res.meta?.changes ?? 0;
          affectedTables.push('bot_configs (non-owner)');
        }
        continue;
      }
      const res = await c.env.DB.prepare(`DELETE FROM "${safeTbl}"`).run().catch(() => null);
      if (res) {
        deletedRows += res.meta?.changes ?? 0;
        affectedTables.push(tbl);
      }
    }
    if (!preserve) {
      const [pwdHash, secHash] = await Promise.all([hashPassword('admin'), hashPassword('admin123')]);
      const freshOwnerId = 'usr_admin_bootstrap';
      await c.env.DB.prepare(
        `INSERT INTO users (
           id, email, username, display_name, auth_provider, password_hash, secondary_password_hash,
           role, profile_completed, has_custom_password, must_change_credentials, totp_enabled, referral_code
         ) VALUES (?, 'admin@dollarino.local', 'admin', 'مدیر سیستم', 'password', ?, ?, 'owner', 1, 1, 1, 0, ?)`
      )
        .bind(freshOwnerId, pwdHash, secHash, generateReferralCode())
        .run();
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO bot_configs (
           user_id, bot_state, trading_mode, active_engines_json, ai_gate_enabled, sniper_enabled
         ) VALUES (?, 'STOPPED', 'PAPER', '[]', 0, 0)`
      )
        .bind(freshOwnerId)
        .run()
        .catch(() => {});
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO exchange_connections (
           id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status
         ) VALUES ('ex_admin_bootstrap_paper', ?, 'paper', 'Paper Simulator (Live Quotes)', 1, 1, 'PAPER-MODE', '{}', 'OK')`
      )
        .bind(freshOwnerId)
        .run()
        .catch(() => {});
      for (const [sk, sv] of [
        ['auth_password_login_enabled', 'true'],
        ['auth_public_signup_enabled', 'false'],
        ['auth_wallet_enabled', 'false'],
        ['auth_telegram_enabled', 'false'],
        ['auth_google_enabled', 'false'],
        ['allow_direct_email_signup', 'false'],
        ['telegram_only_signup', 'false'],
        ['require_telegram_phone_kyc', 'false'],
      ]) {
        await c.env.DB.prepare(
          `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        )
          .bind(sk, sv)
          .run()
          .catch(() => {});
      }
    }
  }

  invalidateSettingsCache(c.env.DB);
  invalidatePublicCopyTradersCache(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'DATABASE_WIPE', 'database', 'd1', ?)`
  ).bind(randomId('aud'), actor.id, JSON.stringify({ mode, preserveOwnerAndSettings: body.preserveOwnerAndSettings !== false, deletedRows })).run().catch(() => {});

  await publishDatabaseReport(c.env, {
    eventType: 'WIPE',
    actorUsername: actor.username,
    note: `عملیات ${mode} اجرا شد | رکوردهای پاک‌شده: ${deletedRows} | جدول‌ها: ${affectedTables.length}`,
  }).catch(() => {});
  await publishSystemLogEvent(c.env, {
    category: 'SECURITY',
    level: 'WARN',
    source: 'DatabaseManager',
    title: `پاک‌سازی / ریست دیتابیس (${mode})`,
    userId: actor.id,
    details: `مدیر ${actor.username} عملیات ${mode} را با حذف ${deletedRows} رکورد اجرا کرد.`,
  }).catch(() => {});

  return c.json({
    ok: true,
    mode,
    deletedRows,
    affectedTablesCount: affectedTables.length,
    affectedTables,
  });
});

// =========================================================================
// V11.7 Stage 6: Profit Cards Audit/Revoke & Active Bots Monitor
// =========================================================================

adminRoutes.get('/profit-cards', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT vpc.id, vpc.user_id, u.username, u.email, vpc.mode, vpc.period, vpc.trade_source,
            vpc.trades_count, vpc.win_rate, vpc.net_pnl_usd, vpc.roi_pct, vpc.profit_factor,
            vpc.exchange_provider, vpc.strategy_name, vpc.signal_name, vpc.entry_price, vpc.exit_price,
            COALESCE(vpc.revoked, 0) AS revoked, vpc.issued_at
     FROM verified_profit_cards vpc
     LEFT JOIN users u ON u.id = vpc.user_id
     ORDER BY vpc.issued_at DESC
     LIMIT 120`
  ).all().catch(() => ({ results: [] }));
  return c.json({ ok: true, cards: rows.results });
});

adminRoutes.post('/profit-cards/:id/revoke', async (c) => {
  const actor = c.get('user');
  const cardId = c.req.param('id');
  const body = await c.req.json<{ revoked?: boolean }>().catch(() => ({ revoked: true }));
  const revokedInt = body.revoked === false ? 0 : 1;

  const res = await c.env.DB.prepare(
    `UPDATE verified_profit_cards SET revoked = ? WHERE id = ?`
  ).bind(revokedInt, cardId).run();
  if (!res.meta?.changes) {
    return c.json({ error: 'Profit card not found' }, 404);
  }

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, ?, 'profit_card', ?, ?)`
  ).bind(
    randomId('aud'),
    actor.id,
    revokedInt ? 'REVOKE_PROFIT_CARD' : 'RESTORE_PROFIT_CARD',
    cardId,
    JSON.stringify({ revoked: Boolean(revokedInt) })
  ).run().catch(() => {});

  return c.json({ ok: true, cardId, revoked: Boolean(revokedInt) });
});

adminRoutes.get('/active-bots', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT bc.user_id, u.username, u.email, u.telegram_username,
            bc.bot_state, bc.trading_mode, bc.trade_execution_mode,
            bc.active_engines_json, bc.strategy_key, bc.max_leverage AS leverage, bc.margin_pct,
            bc.paper_balance, bc.display_currency, bc.notifications_enabled, bc.updated_at
     FROM bot_configs bc
     JOIN users u ON u.id = bc.user_id
     WHERE bc.bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')
        OR (bc.active_engines_json IS NOT NULL AND bc.active_engines_json != '[]' AND bc.active_engines_json != '')
     ORDER BY CASE WHEN bc.bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE') THEN 0 ELSE 1 END, bc.updated_at DESC
     LIMIT 120`
  ).all().catch(() => ({ results: [] }));
  return c.json({ ok: true, bots: rows.results });
});

adminRoutes.post('/users/:id/bot-stop', async (c) => {
  const actor = c.get('user');
  const targetUserId = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`
  ).bind(targetUserId).run();

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'ADMIN_STOP_USER_BOT', 'user', ?, '{}')`
  ).bind(randomId('aud'), actor.id, targetUserId).run().catch(() => {});

  await publishSystemLogEvent(c.env, {
    category: 'SYSTEM',
    level: 'WARN',
    source: 'AdminConsole',
    title: 'توقف اجباری ربات کاربر توسط مدیر',
    details: `مدیر سیستم (${actor.username || actor.id}) ربات کاربر را متوقف کرد.`,
    userId: targetUserId,
  }).catch(() => {});

  return c.json({ ok: true, userId: targetUserId, bot_state: 'STOPPED' });
});

// =========================================================================
// V11.9.1: Comprehensive 3% Server Fee Report, Manual & Auto Verification
// =========================================================================

adminRoutes.get('/fee-report', async (c) => {
  const report = await getAdminComprehensiveFeeReport(c.env.DB);
  return c.json(report);
});

adminRoutes.post('/fee-report/reconcile', async (c) => {
  const actor = c.get('user');
  const syncRes = await reconcilePendingFeeAndTreasuryTransactions(c.env.DB);
  const report = await getAdminComprehensiveFeeReport(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'RECONCILE_PENDING_FEES', 'server_fee_ledger', 'batch', ?)`
  )
    .bind(randomId('aud'), actor.id, JSON.stringify(syncRes))
    .run()
    .catch(() => {});
  return c.json({ ok: true, reconcile: syncRes, report });
});

adminRoutes.post('/fee-report/ledger/:id/decide', async (c) => {
  const actor = c.get('user');
  const ledgerId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { approve?: boolean; note?: string };
  const approve = body.approve !== false;

  const entry = await c.env.DB.prepare(
    `SELECT * FROM server_fee_ledger WHERE id = ? LIMIT 1`
  )
    .bind(ledgerId)
    .first<{
      id: string;
      user_id: string;
      source: string;
      fee_usd: number;
      status: string;
      tx_hash: string | null;
      note: string | null;
    }>();

  if (!entry) {
    return c.json({ error: 'رکورد کارمزد یافت نشد.' }, 404);
  }

  if (approve) {
    if (entry.source === 'PREPAY_CREDIT') {
      const split = await settleDebtFirstThenCredit(
        c.env.DB,
        entry.user_id,
        Number(entry.fee_usd || 0),
        entry.tx_hash || `admin_${ledgerId}`,
        { alsoCreditWalletBalance: false }
      );
      await c.env.DB.prepare(
        `UPDATE server_fee_ledger
         SET status = 'SETTLED_PREPAID',
             fee_usd = ?,
             note = COALESCE(note, '') || ?
         WHERE id = ?`
      )
        .bind(Number(split.addedCreditUsd || entry.fee_usd || 0), ` [تایید توسط ${actor.username}]`, ledgerId)
        .run();
    } else {
      await c.env.DB.prepare(
        `UPDATE server_fee_ledger
         SET status = 'SETTLED_ONCHAIN',
             note = COALESCE(note, '') || ?
         WHERE id = ?`
      )
        .bind(` [تایید توسط ${actor.username}]`, ledgerId)
        .run();
    }
    if (entry.tx_hash) {
      await c.env.DB.prepare(
        `UPDATE treasury_deposits
         SET status = 'CONFIRMED', credited_to_wallet = 1, confirmed_at = COALESCE(confirmed_at, datetime('now')), admin_note = ?
         WHERE LOWER(tx_hash) = LOWER(?) AND status = 'PENDING_VERIFY'`
      )
        .bind(body.note || `تایید شده توسط ${actor.username}`, entry.tx_hash)
        .run()
        .catch(() => {});
    }
  } else {
    await c.env.DB.prepare(
      `UPDATE server_fee_ledger
       SET status = CASE WHEN source = 'PREPAY_CREDIT' THEN 'REJECTED' ELSE 'ACCRUED' END,
           note = COALESCE(note, '') || ?
       WHERE id = ?`
    )
      .bind(` [رد/برگشت توسط ${actor.username}${body.note ? `: ${body.note}` : ''}]`, ledgerId)
      .run();
    if (entry.tx_hash) {
      await c.env.DB.prepare(
        `UPDATE treasury_deposits SET status = 'REJECTED', admin_note = ? WHERE LOWER(tx_hash) = LOWER(?) AND status = 'PENDING_VERIFY'`
      )
        .bind(body.note || `رد شده توسط ${actor.username}`, entry.tx_hash)
        .run()
        .catch(() => {});
    }
  }

  const standing = await evaluateUserFeeStanding(c.env.DB, entry.user_id).catch(() => null);
  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, ?, 'server_fee_ledger', ?, ?)`
  )
    .bind(
      randomId('aud'),
      actor.id,
      approve ? 'APPROVE_FEE_LEDGER' : 'REJECT_FEE_LEDGER',
      ledgerId,
      JSON.stringify({ userId: entry.user_id, feeUsd: entry.fee_usd, note: body.note || '' })
    )
    .run()
    .catch(() => {});

  const report = await getAdminComprehensiveFeeReport(c.env.DB);
  return c.json({ ok: true, standing, report });
});

// =========================================================================
// V11.9.1: Site Maintenance Lock (Pause platform for users, keep Admin open)
// =========================================================================

adminRoutes.get('/site-maintenance', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT key, value FROM system_settings WHERE key IN (
       'site_maintenance_mode',
       'site_maintenance_title_fa',
       'site_maintenance_title_en',
       'site_maintenance_message_fa',
       'site_maintenance_message_en',
       'site_maintenance_eta',
       'site_maintenance_updated_at'
     )`
  )
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] }));
  const map = new Map(rows.results.map((r) => [r.key, r.value]));
  return c.json({
    ok: true,
    maintenance: {
      enabled: map.get('site_maintenance_mode') === 'true',
      titleFa: map.get('site_maintenance_title_fa') || 'سایت در حال بروزرسانی فنی است',
      titleEn: map.get('site_maintenance_title_en') || 'Scheduled Platform Maintenance',
      messageFa:
        map.get('site_maintenance_message_fa') ||
        'پلتفرم دلارینو موقتاً برای ارتقای هسته و بهینه‌سازی زیرساخت برای کاربران بسته شده است. لطفاً ساعاتی دیگر مجدداً تلاش فرمایید.',
      messageEn:
        map.get('site_maintenance_message_en') ||
        'Dollarino is temporarily closed for maintenance and infrastructure upgrades. Please check back shortly.',
      eta: map.get('site_maintenance_eta') || '',
      updatedAt: map.get('site_maintenance_updated_at') || null,
    },
  });
});

adminRoutes.put('/site-maintenance', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean;
    titleFa?: string;
    titleEn?: string;
    messageFa?: string;
    messageEn?: string;
    eta?: string;
  };
  const nowIso = new Date().toISOString();
  const pairs: Array<[string, string]> = [
    ['site_maintenance_updated_at', nowIso],
  ];
  if (typeof body.enabled === 'boolean') {
    pairs.push(['site_maintenance_mode', body.enabled ? 'true' : 'false']);
  }
  if (typeof body.titleFa === 'string') pairs.push(['site_maintenance_title_fa', body.titleFa.trim().slice(0, 180)]);
  if (typeof body.titleEn === 'string') pairs.push(['site_maintenance_title_en', body.titleEn.trim().slice(0, 180)]);
  if (typeof body.messageFa === 'string') pairs.push(['site_maintenance_message_fa', body.messageFa.trim().slice(0, 1500)]);
  if (typeof body.messageEn === 'string') pairs.push(['site_maintenance_message_en', body.messageEn.trim().slice(0, 1500)]);
  if (typeof body.eta === 'string') pairs.push(['site_maintenance_eta', body.eta.trim().slice(0, 160)]);

  for (const [k, v] of pairs) {
    await setCachedSystemSetting(c.env.DB, k, v);
  }
  invalidateSettingsCache(c.env.DB);

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'TOGGLE_SITE_MAINTENANCE', 'system', 'site_maintenance_mode', ?)`
  )
    .bind(randomId('aud'), actor.id, JSON.stringify({ enabled: body.enabled, eta: body.eta || '' }))
    .run()
    .catch(() => {});

  if (typeof body.enabled === 'boolean') {
    await publishSystemLogEvent(c.env, {
      category: 'SYSTEM',
      level: body.enabled ? 'WARN' : 'INFO',
      source: 'SiteMaintenance',
      title: body.enabled ? 'قفل موقت دسترسی کاربران به سایت فعال شد' : 'سایت برای تمام کاربران بازگشایی شد',
      userId: actor.id,
      details: `توسط ${actor.username} | زمان تخمینی: ${body.eta || 'نامشخص'}`,
    }).catch(() => {});
  }

  return c.json({ ok: true, enabled: body.enabled, updatedAt: nowIso });
});

// =========================================================================
// V11.9.1: Admin Custom Modal Popups (Global or Targeted User Notices)
// =========================================================================

adminRoutes.get('/popups', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.*,
            u.username AS target_username,
            (SELECT COUNT(*) FROM user_popup_acks a WHERE a.popup_id = p.id) AS ack_count
     FROM user_popup_messages p
     LEFT JOIN users u ON u.id = p.target_user_id
     ORDER BY p.is_active DESC, p.created_at DESC
     LIMIT 100`
  )
    .all()
    .catch(() => ({ results: [] }));
  return c.json({ ok: true, popups: rows.results || [] });
});

adminRoutes.post('/popups', async (c) => {
  const actor = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    titleFa?: string;
    titleEn?: string;
    bodyFa?: string;
    bodyEn?: string;
    severity?: string;
    targetScope?: string;
    targetUserId?: string | null;
    ctaLabelFa?: string;
    ctaRoute?: string;
    dismissible?: boolean;
    expiresAt?: string | null;
  };
  const titleFa = String(body.titleFa || '').trim();
  const bodyFa = String(body.bodyFa || '').trim();
  if (!titleFa || !bodyFa) {
    return c.json({ error: 'عنوان و متن پیام پاپ‌آپ فارسی الزامی است.' }, 400);
  }
  const severity = ['INFO', 'WARNING', 'SUCCESS', 'MAINTENANCE', 'URGENT'].includes((body.severity || '').toUpperCase())
    ? String(body.severity).toUpperCase()
    : 'INFO';
  const targetUserId = body.targetUserId && String(body.targetUserId).trim() ? String(body.targetUserId).trim() : null;
  const targetScope = targetUserId ? 'USER' : 'ALL';
  const id = randomId('pop');

  await c.env.DB.prepare(
    `INSERT INTO user_popup_messages
     (id, title_fa, title_en, body_fa, body_en, severity, target_scope, target_user_id, cta_label_fa, cta_route, dismissible, is_active, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      id,
      titleFa.slice(0, 180),
      (body.titleEn || '').trim().slice(0, 180) || null,
      bodyFa.slice(0, 2000),
      (body.bodyEn || '').trim().slice(0, 2000) || null,
      severity,
      targetScope,
      targetUserId,
      (body.ctaLabelFa || '').trim().slice(0, 60) || null,
      (body.ctaRoute || '').trim().slice(0, 120) || null,
      body.dismissible === false ? 0 : 1,
      actor.id,
      body.expiresAt ? String(body.expiresAt).trim() : null
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, 'CREATE_USER_POPUP', 'popup', ?, ?)`
  )
    .bind(randomId('aud'), actor.id, id, JSON.stringify({ titleFa, targetScope, targetUserId, severity }))
    .run()
    .catch(() => {});

  return c.json({ ok: true, id }, 201);
});

adminRoutes.patch('/popups/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { isActive?: boolean };
  if (typeof body.isActive === 'boolean') {
    await c.env.DB.prepare(`UPDATE user_popup_messages SET is_active = ? WHERE id = ?`)
      .bind(body.isActive ? 1 : 0, id)
      .run();
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/popups/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`DELETE FROM user_popup_acks WHERE popup_id = ?`).bind(id).run().catch(() => {});
  await c.env.DB.prepare(`DELETE FROM user_popup_messages WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});


