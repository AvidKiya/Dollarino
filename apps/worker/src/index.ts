import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { authRoutes, requireAuth, type AppVariables } from './auth.js';
import { hmacSha256Hex, verifyJwt } from './crypto.js';
import { TradingBotCoordinator } from './engine/bot-do.js';
import { runAlwaysOnAiIntel, runAlwaysOnSignalRadar } from './engine/market-intel.js';
import { pollWatchedWalletsForNewTrades, reconcileCopyPositionsV2 } from './dex/smart-copy.js';
import { reconcilePerpDexOrders } from './dex/perp-dex.js';
import type { Env } from './env.js';
import { fetchPublicKlines, fetchPublicMarket24h, fetchPublicOrderBook } from './exchanges/paper.js';
import { getExchangeMarkets, MAJOR_LIQUID_COINS } from './exchanges/markets.js';
import {
  DOLLARINO_CREATOR_INFO,
  listSelectableAIModels,
  runPublicGuestAIChat,
} from './ai/assistant.js';
import { buildClientFingerprints, enforceRateLimit, resolveAllowedCorsOrigin } from './security.js';
import { adminRoutes, dispatchDueScheduledBroadcasts } from './routes/admin.js';
import { aiAssistantRoutes } from './routes/ai-assistant.js';
import { buildProfitCardSvg, renderProfitCardPng, type ProfitCardRenderInput } from './cards/renderer.js';
import { resolveTokenLogoPngDataUri } from './services/profit-cards.js';
import { chartAiRoutes } from './routes/chart-ai.js';
import { connectionRoutes } from './routes/connections.js';
import { copyTradeRoutes } from './routes/copy-trade.js';
import { dexRoutes } from './routes/dex.js';
import { myAiRoutes } from './routes/my-ai.js';
import { getPublicPlans, subscriptionRoutes } from './routes/subscriptions.js';
import { supportRoutes } from './routes/support.js';
import { mobileRoutes } from './routes/mobile.js';
import { buildVerifiedCardCanonicalPayload, tradingRoutes } from './routes/trading.js';
import { trustWalletRoutes } from './routes/trustwallet.js';
import { evaluateTradingViewFreeAlerts, syncTelegramBotAutoOnVersion, webhookRoutes } from './routes/webhooks.js';
import { getFounderProfile } from './services/founder-profile.js';
import { buildPublicLiveProof, lookupPublicWalletOrCardAudit } from './services/public-proof.js';
import { SERVER_PROFIT_FEE_PCT, FREE_PROFITABLE_LIVE_TRADES } from './services/server-fee.js';
import { reconcilePendingFeeAndTreasuryTransactions } from './services/treasury.js';
import { publishDatabaseReport, publishSystemLogEvent, publishTransactionEvent } from './telegram/publisher.js';
import type { UserBotConfigRow } from './engine/executor.js';
import { runNewListingAndMemeSniperForUser } from './engine/listing-sniper.js';
import { syncAutoTopSiteTraders } from './services/site-traders.js';
import {
  getAllCachedSystemSettings,
  getCachedPublicCopyTraders,
  getCachedSystemSetting,
  setCachedPublicCopyTraders,
  setCachedSystemSetting,
} from './services/settings-cache.js';
import { serveWithEdgeAndDbCache } from './services/d1-cache.js';
import { getSystemSettingValue } from './telegram/publisher.js';
import { fetchIranUsdtRate } from './exchanges/iran-rate.js';
import { DOLLARINO_VERSION, DOLLARINO_ASSET_VERSION } from './version.js';

export { TradingBotCoordinator };

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('*', cors({
  origin: (origin, c) => resolveAllowedCorsOrigin(origin, c.env) || '',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Dollarino-Token', 'X-Dollarino-Extension-Key'],
  credentials: true,
}));

app.use('/api/*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});

const MAINTENANCE_OPEN_PREFIXES = [
  '/api/health',
  '/api/public/site-status',
  '/api/public/creator',
  '/api/public/founder-profile',
  '/api/auth/',
  '/api/admin/',
  '/api/mobile/bootstrap',
  '/api/webhook/telegram',
  '/api/webhooks/telegram',
];

async function readSiteMaintenanceState(db: D1Database) {
  const settings = await getAllCachedSystemSettings(db).catch(() => new Map<string, string>());
  const enabled = settings.get('site_maintenance_mode') === 'true';
  return {
    enabled,
    titleFa: settings.get('site_maintenance_title_fa') || 'سایت در حال بروزرسانی فنی است',
    titleEn: settings.get('site_maintenance_title_en') || 'Scheduled Platform Maintenance',
    messageFa:
      settings.get('site_maintenance_message_fa') ||
      'پلتفرم دلارینو موقتاً برای ارتقای هسته و بهینه‌سازی زیرساخت برای کاربران بسته شده است. لطفاً ساعاتی دیگر مجدداً تلاش فرمایید.',
    messageEn:
      settings.get('site_maintenance_message_en') ||
      'Dollarino is temporarily closed for maintenance and infrastructure upgrades. Please check back shortly.',
    eta: settings.get('site_maintenance_eta') || '',
    updatedAt: settings.get('site_maintenance_updated_at') || null,
  };
}

app.use('/api/*', async (c, next) => {
  const p = c.req.path;
  if (MAINTENANCE_OPEN_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix))) {
    await next();
    return;
  }
  const maintenance = await readSiteMaintenanceState(c.env.DB);
  if (!maintenance.enabled) {
    await next();
    return;
  }
  // Allow owners & admins to bypass maintenance lock
  const customHeader = c.req.header('X-Dollarino-Token');
  const authHeader = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'dollarino_session');
  const token = customHeader || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken);
  if (token) {
    const payload = await verifyJwt(token, c.env.SESSION_JWT_SECRET).catch(() => null);
    const role = typeof payload?.role === 'string' ? payload.role : '';
    if (payload && typeof payload.sub === 'string' && (role === 'owner' || role === 'admin')) {
      await next();
      return;
    }
    if (payload && typeof payload.sub === 'string') {
      const row = await c.env.DB.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
        .bind(payload.sub)
        .first<{ role: string }>()
        .catch(() => null);
      if (row && (row.role === 'owner' || row.role === 'admin')) {
        await next();
        return;
      }
    }
  }
  return c.json(
    {
      error: maintenance.messageFa,
      code: 'SITE_MAINTENANCE',
      maintenance,
    },
    503
  );
});

app.get('/api/public/site-status', async (c) => {
  const maintenance = await readSiteMaintenanceState(c.env.DB);
  return c.json({
    ok: true,
    version: DOLLARINO_VERSION,
    maintenance,
  });
});

app.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/D1_ERROR|daily row read limit|quota|exceeded/i.test(msg)) {
    return c.json(
      {
        error:
          'سهمیه رایگان دیتابیس کلادفلر (۵ میلیون خواندن روزانه D1) پر شده است و ساعت ۰۰:۰۰ UTC (۰۳:۳۰ بامداد ایران) خودکار ریست می‌شود. با ارتقا به پلن پایه ۵ دلاری کلادفلر، محدودیت فوراً برداشته می‌شود.',
        code: 'D1_QUOTA_EXCEEDED',
      },
      503
    );
  }
  console.error('[Worker Error]', msg);
  return c.json({ error: 'خطای داخلی سرور رخ داد. لطفاً لحظاتی دیگر تلاش کنید.', code: 'INTERNAL_ERROR' }, 500);
});

async function serveAssetsWithDynamicOg(
  req: Request,
  assets: { fetch: (req: Request) => Promise<Response> }
): Promise<Response> {
  const res = await assets.fetch(req);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return res;
  }
  const url = new URL(req.url);
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return res;
  }
  const origin = url.origin.replace(/\/+$/, '');
  const html = await res.text();
  const rewritten = html
    .replaceAll('https://dollarino.pages.dev/dollarino-preview.jpg', `${origin}/dollarino-preview.jpg`)
    .replaceAll('https://dollarino.pages.dev/images/dollarino-og-brand.jpg', `${origin}/images/dollarino-og-brand.jpg`)
    .replaceAll('content="https://dollarino.pages.dev/"', `content="${origin}/"`)
    .replaceAll('href="https://dollarino.pages.dev/"', `href="${origin}/"`);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(rewritten, { status: res.status, statusText: res.statusText, headers });
}

app.get('/', (c) => {
  if (c.env.ASSETS) {
    return serveAssetsWithDynamicOg(c.req.raw, c.env.ASSETS);
  }
  return c.json({
    ok: true,
    service: `Dollarino API Worker v${DOLLARINO_VERSION}`,
    health: '/api/health',
    note: 'Open the Website preview (port 5173) or unified Worker URL to use the full Dollarino UI.',
  });
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    platform: 'Dollarino (دلارینو)',
    version: DOLLARINO_VERSION,
    assetVersion: DOLLARINO_ASSET_VERSION,
    buildSurface: 'worker',
    openSource: false,
    paidSubscriptions: false,
    profitShareFeePct: SERVER_PROFIT_FEE_PCT,
    freeProfitableLiveTrades: FREE_PROFITABLE_LIVE_TRADES,
    multiEngineSimultaneous: true,
    listingAndMemeSniper: true,
    trustWalletOnly: true,
    minLiveBalanceUsd: 10,
    demoSimulatorUsd: 10000,
    freeTradingViewAlerts: true,
    centralMultiAI: true,
    multiCoinAutonomous: true,
    alwaysOnSignalsAndAiIntel: true,
    dedicatedFloatingVisionAI: true,
    creator: DOLLARINO_CREATOR_INFO,
    primaryStrategy: 'dollarino_v01',
    brandNames: {
      ai: 'هوش مصنوعی دلارینو',
      strategy: 'استراتژی منتخب دلارینو (موتور دُرنا V1)',
      copyTrade: 'کپی ترید دلارینو',
    },
    aiProviders: ['deepseek', 'anthropic', 'openai', 'gemini', 'openai_compatible'],
    exchanges: {
      trustwallet: 'LIVE_EVM_SOLANA_TON_TRON_AND_PERP_DEX',
      paper: 'SIMULATOR_10K_LIVE_QUOTES',
    },
    capabilities: {
      spotTrading: true,
      futuresTrading: true,
      dualDirection: true,
      hedgeMode: true,
      verifiedProfitCards: true,
      dexScreenerRadar: true,
      trustWalletDapp: true,
      browserExtension: true,
      smartSupportEscalation: true,
      antiAbuseReferralSystem: true,
      telegramFirstRegistration: true,
      profileEditorWithLockedPhone: true,
      telegramLoginWidget: true,
      alwaysOnSignalsAndAiIntel: true,
      dedicatedFloatingVisionAI: true,
      simultaneousMultiEngine: true,
      customizablePaperBalance: true,
      centralTreasury: true,
      listingAndMemeSniper: true,
      riskTermsGate: true,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/public/creator', async (c) => {
  const [founderProfile, communityGroupInvite] = await Promise.all([
    getFounderProfile(c.env.DB),
    getSystemSettingValue(c.env.DB, 'community_group_invite', ''),
  ]);
  return c.json({
    creator: {
      ...DOLLARINO_CREATOR_INFO,
      nameFa: founderProfile.fullNameFa || DOLLARINO_CREATOR_INFO.nameFa,
      nameEn: founderProfile.fullNameEn || DOLLARINO_CREATOR_INFO.nameEn,
      telegram: founderProfile.telegram || DOLLARINO_CREATOR_INFO.telegram,
      telegramUrl: founderProfile.telegramUrl || DOLLARINO_CREATOR_INFO.telegramUrl,
      instagram: founderProfile.instagram || DOLLARINO_CREATOR_INFO.instagram,
      instagramUrl: founderProfile.instagramUrl || DOLLARINO_CREATOR_INFO.instagramUrl,
      twitter: founderProfile.twitter || DOLLARINO_CREATOR_INFO.twitter,
      twitterUrl: founderProfile.twitterUrl || DOLLARINO_CREATOR_INFO.twitterUrl,
    },
    founderProfile,
    communityGroupInvite: communityGroupInvite.trim(),
  });
});

app.get('/api/public/founder-profile', async (c) => {
  const founderProfile = await getFounderProfile(c.env.DB);
  return c.json({ ok: true, founderProfile });
});

app.get('/api/public/ai-models', async (c) => {
  const data = await listSelectableAIModels(c.env);
  return c.json({
    ...data,
    creator: DOLLARINO_CREATOR_INFO,
  });
});

app.post('/api/public/ai-chat', async (c) => {
  const fp = await buildClientFingerprints(c.req.raw, c.env).catch(() => ({ ipHash: 'anon' }));
  const rl = await enforceRateLimit(c.env, `pub_ai:${fp.ipHash}`, 20, 60).catch(() => ({
    allowed: true,
    retryAfterSec: 0,
  }));
  if (!rl.allowed) {
    return c.json(
      { error: `تعداد درخواست زیاد است. لطفاً ${rl.retryAfterSec} ثانیه دیگر امتحان کنید.` },
      429
    );
  }

  const body = await c.req
    .json<{
      modelId?: string | null;
      message?: string;
      imageDataUrl?: string | null;
      currentSymbol?: string | null;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }>()
    .catch(() => ({} as { modelId?: string; message?: string; imageDataUrl?: string; currentSymbol?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }));

  const message = String(body.message || '').trim();
  const imageDataUrl = body.imageDataUrl ? String(body.imageDataUrl).trim() : null;
  if (!message && !imageDataUrl) {
    return c.json({ error: 'لطفاً پیام یا تصویر چارت ارسال کنید.' }, 400);
  }
  if (imageDataUrl && (!imageDataUrl.startsWith('data:image/') || imageDataUrl.length > 6_500_000)) {
    return c.json({ error: 'فرمت یا حجم تصویر نامعتبر است.' }, 400);
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter((h) => (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-8)
    : [];

  const res = await runPublicGuestAIChat(c.env, {
    modelId: body.modelId || null,
    message,
    imageDataUrl,
    currentSymbol: body.currentSymbol || null,
    history,
  });

  return c.json(res);
});

app.get('/api/public/banners', async (c) => {
  const placement = (c.req.query('placement') || 'ALL').toUpperCase();
  return serveWithEdgeAndDbCache(
    c,
    {
      edgeCacheKey: `https://dollarino.internal/cache/public/banners/${placement}`,
      dbKey: `public:banners:${placement}`,
      ttlSeconds: 120,
    },
    async () => {
      const rows = await c.env.DB.prepare(
        `SELECT * FROM promo_banners WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC LIMIT 20`
      )
        .all<Record<string, unknown>>()
        .catch(() => ({ results: [] as Array<Record<string, unknown>> }));
      const filtered = rows.results.filter((b) => {
        const p = String(b.placement || 'BOTH').toUpperCase();
        return placement === 'ALL' || p === 'BOTH' || p === placement;
      });
      return { ok: true, banners: filtered };
    }
  );
});

app.get('/api/public/verify-card/:cardId', async (c) => {
  const cardId = (c.req.param('cardId') || '').trim();
  if (!cardId) return c.json({ valid: false, error: 'Missing cardId' }, 400);

  const row = await c.env.DB.prepare(
    `SELECT v.*, u.username, u.telegram_username
     FROM verified_profit_cards v
     LEFT JOIN users u ON u.id = v.user_id
     WHERE v.id = ? LIMIT 1`
  ).bind(cardId).first<{
    id: string;
    user_id: string;
    mode: string;
    period: string;
    start_date: string;
    end_date: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    payload_json: string;
    hmac_signature: string;
    issued_at: string;
    trade_source?: string | null;
    entry_price?: number | null;
    exit_price?: number | null;
    signal_name?: string | null;
    token_address?: string | null;
    chain_id?: string | null;
    token_image_url?: string | null;
    revoked?: number | null;
    username: string | null;
    telegram_username: string | null;
  }>();

  if (!row) {
    return c.json({ valid: false, error: 'کارت سود با این شناسه در سرور دلارینو ثبت نشده است (احتمالاً جعلی یا نامعتبر است).' }, 404);
  }

  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(row.payload_json || '{}') as Record<string, unknown>;
  } catch {
    parsedPayload = {};
  }

  const cardSecret = c.env.SESSION_JWT_SECRET || c.env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';
  const expectedCanonical = buildVerifiedCardCanonicalPayload({
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    tradesCount: Number(row.trades_count),
    winRate: Number(row.win_rate),
    netPnlUsd: Number(row.net_pnl_usd),
    roiPct: Number(row.roi_pct),
    profitFactor: Number(row.profit_factor),
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    tradesHash: typeof parsedPayload.tradesHash === 'string' ? parsedPayload.tradesHash : '',
    issuedAt: row.issued_at,
  });
  const expectedSig = await hmacSha256Hex(expectedCanonical, cardSecret);
  const isRevoked = Number(row.revoked || 0) === 1;
  const signatureValid = expectedSig === row.hmac_signature && !isRevoked;

  return c.json({
    valid: signatureValid,
    revoked: isRevoked,
    error: isRevoked ? 'این کارت توسط مدیریت دلارینو ابطال شده است.' : undefined,
    card: {
      id: row.id,
      displayName: row.username || (row.telegram_username ? `@${row.telegram_username}` : 'Dollarino Trader'),
      mode: row.mode,
      isVerifiedReal: row.mode === 'LIVE' && signatureValid,
      revoked: isRevoked,
      tradeSource: row.trade_source || (typeof parsedPayload.tradeSource === 'string' ? parsedPayload.tradeSource : 'ALL'),
      period: row.period,
      startDate: row.start_date,
      endDate: row.end_date,
      tradesCount: row.trades_count,
      winRate: row.win_rate,
      netPnlUsd: row.net_pnl_usd,
      roiPct: row.roi_pct,
      profitFactor: row.profit_factor,
      exchangeProvider: row.exchange_provider,
      strategyName: row.strategy_name,
      engineKey: typeof parsedPayload.engineKey === 'string' ? parsedPayload.engineKey : undefined,
      cardStyle: typeof parsedPayload.cardStyle === 'string' ? parsedPayload.cardStyle : 'dark',
      symbol: typeof parsedPayload.symbol === 'string' ? parsedPayload.symbol : undefined,
      baseSymbol: typeof parsedPayload.baseSymbol === 'string' ? parsedPayload.baseSymbol : undefined,
      direction: typeof parsedPayload.direction === 'string' ? parsedPayload.direction : undefined,
      leverage: typeof parsedPayload.leverage === 'number' ? parsedPayload.leverage : undefined,
      entryPrice: row.entry_price ?? (typeof parsedPayload.entryPrice === 'number' ? parsedPayload.entryPrice : null),
      exitPrice: row.exit_price ?? (typeof parsedPayload.exitPrice === 'number' ? parsedPayload.exitPrice : null),
      signalName: row.signal_name ?? (typeof parsedPayload.signalName === 'string' ? parsedPayload.signalName : undefined),
      tokenAddress: row.token_address ?? (typeof parsedPayload.tokenAddress === 'string' ? parsedPayload.tokenAddress : undefined),
      chainId: row.chain_id ?? (typeof parsedPayload.chainId === 'string' ? parsedPayload.chainId : undefined),
      tokenImageUrl: row.token_image_url ?? (typeof parsedPayload.tokenImageUrl === 'string' ? parsedPayload.tokenImageUrl : undefined),
      bestSymbol: typeof parsedPayload.bestSymbol === 'string' ? parsedPayload.bestSymbol : undefined,
      signaturePrefix: row.hmac_signature.slice(0, 16),
      issuedAt: row.issued_at,
    },
  });
});

app.get('/api/public/card-image/:cardId', async (c) => {
  const rawId = c.req.param('cardId').replace(/\.png$/i, '');
  const layout: 'horizontal' | 'vertical' = c.req.query('layout') === 'vertical' ? 'vertical' : 'horizontal';
  const row = await c.env.DB.prepare(
    `SELECT vc.*, u.username, u.telegram_username
     FROM verified_profit_cards vc LEFT JOIN users u ON vc.user_id = u.id
     WHERE vc.id = ?`
  ).bind(rawId).first<{
    id: string;
    user_id: string;
    mode: 'LIVE' | 'PAPER';
    period: string;
    trades_count: number;
    win_rate: number;
    net_pnl_usd: number;
    roi_pct: number;
    profit_factor: number;
    exchange_provider: string;
    strategy_name: string;
    payload_json: string;
    trade_source?: string | null;
    entry_price?: number | null;
    exit_price?: number | null;
    signal_name?: string | null;
    token_address?: string | null;
    chain_id?: string | null;
    token_image_url?: string | null;
    issued_at: string;
    username: string | null;
    telegram_username: string | null;
  }>();
  if (!row) return c.json({ error: 'Card not found' }, 404);

  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(row.payload_json || '{}') as Record<string, unknown>;
  } catch {
    parsedPayload = {};
  }

  const tokenLogoDataUri = await resolveTokenLogoPngDataUri({
    baseSymbol: (typeof parsedPayload.baseSymbol === 'string' ? parsedPayload.baseSymbol : undefined) ||
      (typeof parsedPayload.symbol === 'string' ? parsedPayload.symbol : undefined) ||
      (typeof parsedPayload.bestSymbol === 'string' ? parsedPayload.bestSymbol : undefined),
    chainId: row.chain_id || (typeof parsedPayload.chainId === 'string' ? parsedPayload.chainId : undefined),
    tokenAddress: row.token_address || (typeof parsedPayload.tokenAddress === 'string' ? parsedPayload.tokenAddress : undefined),
    tokenImageUrl: row.token_image_url || (typeof parsedPayload.tokenImageUrl === 'string' ? parsedPayload.tokenImageUrl : undefined),
  }).catch(() => null);

  const srcRaw = String(row.trade_source || parsedPayload.tradeSource || 'ALL').toUpperCase();
  const renderInput: ProfitCardRenderInput = {
    cardId: row.id,
    displayName: row.username || (row.telegram_username ? `@${row.telegram_username}` : 'Dollarino Trader'),
    mode: row.mode,
    period: row.period,
    tradeSource: srcRaw === 'PERP' || srcRaw === 'DEX' || srcRaw === 'COPY' ? srcRaw : 'ALL',
    netPnlUsd: Number(row.net_pnl_usd || 0),
    roiPct: Number(row.roi_pct || 0),
    tradesCount: Number(row.trades_count || 0),
    winRate: Number(row.win_rate || 0),
    profitFactor: Number(row.profit_factor || 0),
    exchangeProvider: row.exchange_provider,
    strategyName: row.strategy_name,
    engineKey: typeof parsedPayload.engineKey === 'string' ? parsedPayload.engineKey : undefined,
    cardStyle: typeof parsedPayload.cardStyle === 'string' ? parsedPayload.cardStyle : 'dark',
    symbol: typeof parsedPayload.symbol === 'string' ? parsedPayload.symbol : undefined,
    baseSymbol: typeof parsedPayload.baseSymbol === 'string' ? parsedPayload.baseSymbol : undefined,
    direction: typeof parsedPayload.direction === 'string' ? parsedPayload.direction : undefined,
    leverage: typeof parsedPayload.leverage === 'number' ? parsedPayload.leverage : undefined,
    entryPrice: row.entry_price ?? (typeof parsedPayload.entryPrice === 'number' ? parsedPayload.entryPrice : null),
    exitPrice: row.exit_price ?? (typeof parsedPayload.exitPrice === 'number' ? parsedPayload.exitPrice : null),
    signalName: row.signal_name ?? (typeof parsedPayload.signalName === 'string' ? parsedPayload.signalName : undefined),
    bestSymbol: typeof parsedPayload.bestSymbol === 'string' ? parsedPayload.bestSymbol : undefined,
    bestRoiPct: typeof parsedPayload.bestRoiPct === 'number' ? parsedPayload.bestRoiPct : undefined,
    tokenLogoDataUri,
    issuedAt: row.issued_at,
    layout,
  };
  const png = await renderProfitCardPng(renderInput);

  if (png) {
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return new Response(buildProfitCardSvg(renderInput), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

app.get('/api/public/plans', async (c) => {
  return serveWithEdgeAndDbCache(
    c,
    {
      edgeCacheKey: 'https://dollarino.internal/cache/public/plans',
      dbKey: 'public:plans',
      ttlSeconds: 300,
    },
    async () => {
      const plans = await getPublicPlans(c.env.DB);
      return { plans };
    }
  );
});

app.get('/api/public/copy-traders', async (c) => {
  try {
    const cached = getCachedPublicCopyTraders(c.env.DB);
    if (cached) {
      return c.json({ traders: cached, cached: true });
    }
    return serveWithEdgeAndDbCache(
      c,
      {
        edgeCacheKey: 'https://dollarino.internal/cache/public/copy-traders',
        dbKey: 'public:copy-traders',
        ttlSeconds: 120,
      },
      async () => {
        const rows = await c.env.DB.prepare(
          `SELECT id, display_name, handle, specialty, win_rate, roi_30d_pct, max_drawdown_pct, followers_count, risk_level
           FROM copy_traders
           WHERE is_active = 1 AND is_verified = 1
             AND id NOT IN ('ct_aria_quant', 'ct_parsa_scalp', 'ct_negin_ai')
           ORDER BY roi_30d_pct DESC LIMIT 12`
        ).all();
        setCachedPublicCopyTraders(c.env.DB, rows.results);
        return { traders: rows.results };
      }
    );
  } catch {
    return c.json({ traders: [] });
  }
});

app.get('/api/public/live-proof', async (c) => {
  try {
    return await serveWithEdgeAndDbCache(
      c,
      {
        edgeCacheKey: 'https://dollarino.internal/cache/public/live-proof-v1',
        dbKey: 'public:live-proof-v1',
        ttlSeconds: 90,
      },
      async () => buildPublicLiveProof(c.env.DB, c.env)
    );
  } catch (err) {
    return c.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      platformStats: {
        totalSignals: 0,
        tpHitSignals: 0,
        signalHitRatePct: 0,
        closedTrades30d: 0,
        liveClosedTrades30d: 0,
        paperClosedTrades30d: 0,
        liveWinRate30dPct: 0,
        paperWinRate30dPct: 0,
        verifiedCardsCount: 0,
        connectedWalletsCount: 0,
      },
      liveStrategyBacktests: [],
      channelSignals: [],
      verifiedCards: [],
      wallet30dLedger: [],
      warning: err instanceof Error ? err.message : 'fallback',
    });
  }
});

app.get('/api/public/verify-wallet', async (c) => {
  const q = (c.req.query('q') || '').trim();
  const fp = await buildClientFingerprints(c.req.raw, c.env).catch(() => ({ ipHash: 'anon' }));
  const rl = await enforceRateLimit(c.env, `pub_verify_${fp.ipHash}`, 40, 60).catch(() => ({ allowed: true }));
  if (!rl.allowed) {
    return c.json({ found: false, error: 'درخواست‌های استعلام بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.' }, 429);
  }
  const result = await lookupPublicWalletOrCardAudit(c.env.DB, c.env, q);
  return c.json(result);
});

app.get('/api/public/market-snapshot', async (c) => {
  const symbol = (c.req.query('symbol') || 'BTCUSDT').toUpperCase();
  const proxyCfg = c.env.TOOBIT_PROXY_URL
    ? { proxyUrl: c.env.TOOBIT_PROXY_URL, proxySecret: c.env.EXCHANGE_PROXY_SECRET }
    : undefined;

  const coreWatchlist = MAJOR_LIQUID_COINS;
  const [candles, orderBook, selectedTicker, universe] = await Promise.all([
    fetchPublicKlines(symbol, '15m', 48, proxyCfg).catch(() => []),
    fetchPublicOrderBook(symbol, 10, proxyCfg).catch(() => ({ bids: [], asks: [] })),
    fetchPublicMarket24h(symbol, proxyCfg).catch(() => null),
    getExchangeMarkets('paper', proxyCfg, 'FUTURES').catch(() => []),
  ]);

  const bySymbol = new Map<
    string,
    {
      symbol: string;
      base: string;
      lastPrice: number;
      changePct24h: number;
      volume24hUsd: number;
      high24h: number;
      low24h: number;
      fundingRate: string;
    }
  >();

  for (const m of universe) {
    const px = Number(m.lastPrice ?? 0);
    if (!Number.isFinite(px) || px <= 0) continue;
    bySymbol.set(m.symbol, {
      symbol: m.symbol,
      base: m.base || m.symbol.replace(/USDT$/, ''),
      lastPrice: px,
      changePct24h: Number(m.changePct24h ?? 0),
      volume24hUsd: Number.isFinite(Number(m.volume24h)) ? Number(m.volume24h) : 0,
      high24h: Number(m.high24h ?? px),
      low24h: Number(m.low24h ?? px),
      fundingRate: '0.0085%',
    });
  }

  if (selectedTicker && Number(selectedTicker.lastPrice) > 0) {
    const rawVol = Number(String(selectedTicker.volume24h ?? '0').replace(/,/g, ''));
    const px = Number(selectedTicker.lastPrice);
    bySymbol.set(symbol, {
      symbol,
      base: symbol.replace(/USDT$/, ''),
      lastPrice: px,
      changePct24h: Number(selectedTicker.changePct24h ?? 0),
      volume24hUsd: Number.isFinite(rawVol) ? rawVol : 0,
      high24h: Number(selectedTicker.high24h ?? px),
      low24h: Number(selectedTicker.low24h ?? px),
      fundingRate: selectedTicker.fundingRate ?? '0.0085%',
    });
  }

  if (bySymbol.size < 5) {
    const fallbackWatchlist = coreWatchlist.slice(0, 8);
    const fetched = await Promise.all(
      fallbackWatchlist.map((sym) => fetchPublicMarket24h(sym, proxyCfg).catch(() => null))
    );
    fetched.forEach((m, i) => {
      const sym = fallbackWatchlist[i]!;
      const px = Number(m?.lastPrice ?? 0);
      if (!m || px <= 0 || bySymbol.has(sym)) return;
      const rawVol = Number(String(m.volume24h ?? '0').replace(/,/g, ''));
      bySymbol.set(sym, {
        symbol: sym,
        base: sym.replace(/USDT$/, ''),
        lastPrice: px,
        changePct24h: Number(m.changePct24h ?? 0),
        volume24hUsd: Number.isFinite(rawVol) ? rawVol : 0,
        high24h: Number(m.high24h ?? px),
        low24h: Number(m.low24h ?? px),
        fundingRate: m.fundingRate ?? '0.0085%',
      });
    });
  }

  const priorityRank = new Map<string, number>(coreWatchlist.map((s, idx) => [s, idx]));
  const nonCryptoBaseRe = /^(SOXL|SOXS|SNDK|XAU|XAG|PAXG|SPX|NDX|NVDA|TSLA|AAPL|AMZN|MSFT|GOOG|META|COIN|MSTR)/i;
  const markets = Array.from(bySymbol.values())
    .filter((m) => m.symbol.endsWith('USDT') && !nonCryptoBaseRe.test(m.base || m.symbol))
    .sort((a, b) => {
      const ra = priorityRank.get(a.symbol);
      const rb = priorityRank.get(b.symbol);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return b.volume24hUsd - a.volume24hUsd;
    })
    .slice(0, 16);

  return c.json({
    symbol,
    candles,
    orderBook,
    markets,
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/connections', connectionRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/ai-assistant', aiAssistantRoutes);
app.route('/api/chart-ai', chartAiRoutes);
app.route('/api/my-ai', myAiRoutes);
app.route('/api/copy-trade', copyTradeRoutes);
app.route('/api/dex', dexRoutes);
app.route('/api/trustwallet', trustWalletRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/mobile', mobileRoutes);
app.route('/api/webhook', webhookRoutes);
app.route('/api/admin', adminRoutes);

app.get('/api/public/usdt-irt-rate', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';
  if (forceRefresh) {
    const rate = await fetchIranUsdtRate(true);
    return c.json({ ok: true, ...rate });
  }
  return serveWithEdgeAndDbCache(
    c,
    {
      edgeCacheKey: 'https://dollarino.internal/cache/public/usdt-irt',
      dbKey: 'public:usdt-irt',
      ttlSeconds: 60,
    },
    async () => {
      const rate = await fetchIranUsdtRate(false);
      return { ok: true, ...rate };
    }
  );
});

app.get('/api/events/stream', requireAuth, async (c) => {
  const user = c.get('user');
  const [cfg, openCount, unreadNtf, latestSig] = await Promise.all([
    c.env.DB.prepare(`SELECT bot_state, trading_mode, paper_balance FROM bot_configs WHERE user_id = ?`).bind(user.id).first<{ bot_state: string; trading_mode: string; paper_balance: string }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM trades WHERE user_id = ? AND status = 'OPEN'`).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(user.id).first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    c.env.DB.prepare(`SELECT id, symbol, direction, created_at FROM signals ORDER BY created_at DESC LIMIT 1`).first(),
  ]);
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      const send = (ev: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('balance.updated', { paperBalance: cfg?.paper_balance ?? '0', tradingMode: cfg?.trading_mode ?? 'PAPER' });
      send('position.updated', { openCount: openCount?.cnt ?? 0, botState: cfg?.bot_state ?? 'STOPPED' });
      send('notification.created', { unread: unreadNtf?.cnt ?? 0 });
      if (latestSig) send('signal.received', latestSig);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// Explicit aliases so both `/api/telegram/webhook/:botId` and `/api/webhook/telegram/:botId` work cleanly
app.post('/api/telegram/webhook', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/api/webhook/telegram';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});
app.post('/api/telegram/webhook/:botId', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = `/api/webhook/telegram/${c.req.param('botId')}`;
  return app.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});

app.all('*', async (c) => {
  if (!c.req.path.startsWith('/api/') && c.env.ASSETS) {
    return serveAssetsWithDynamicOg(c.req.raw, c.env.ASSETS);
  }
  // Include the running Worker version so a stale deployment is obvious in logs and
  // the web client can tell "mistyped route" apart from "Worker not redeployed".
  return c.json(
    {
      error: `Route not found: ${c.req.path}`,
      code: 'ROUTE_NOT_FOUND',
      workerVersion: DOLLARINO_VERSION,
      hint: 'If the UI is newer than this version, redeploy the Worker: npx wrangler d1 migrations apply dollarino-db --remote && npx wrangler deploy',
    },
    404
  );
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Runs every 5 minutes (*/5): check lightweight indexed flags first so idle periods consume minimal D1 Rows Read
    ctx.waitUntil((async () => {
      await syncTelegramBotAutoOnVersion(env, DOLLARINO_VERSION).catch(() => {});

      const activity = await env.DB.prepare(
        `SELECT
           EXISTS(SELECT 1 FROM bot_configs WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')) AS has_bot,
           EXISTS(SELECT 1 FROM trades WHERE status = 'OPEN') AS has_open,
           EXISTS(SELECT 1 FROM dex_trades WHERE status = 'OPEN') AS has_dex_open,
           EXISTS(SELECT 1 FROM perp_dex_orders WHERE status IN ('FILLED', 'OPEN')) AS has_perp_open,
           EXISTS(SELECT 1 FROM pending_orders WHERE status = 'PENDING') AS has_pending,
           EXISTS(SELECT 1 FROM price_alerts WHERE is_active = 1) AS has_alert,
           EXISTS(SELECT 1 FROM copy_follow_rules WHERE is_active = 1 AND trader_kind = 'SMART_WALLET') AS has_copy_watch,
           EXISTS(SELECT 1 FROM copy_positions_v2 WHERE status = 'OPEN') AS has_copy_pos,
           EXISTS(SELECT 1 FROM tradingview_free_alerts WHERE is_active = 1) AS has_tv_alert,
           EXISTS(SELECT 1 FROM scheduled_broadcasts WHERE status = 'SCHEDULED') AS has_sched_bc,
           EXISTS(SELECT 1 FROM treasury_deposits WHERE status = 'PENDING_VERIFY') AS has_pending_treasury,
           EXISTS(SELECT 1 FROM server_fee_ledger WHERE status = 'PENDING_VERIFY') AS has_pending_fee`
      )
        .first<{
          has_bot: number;
          has_open: number;
          has_dex_open: number;
          has_perp_open: number;
          has_pending: number;
          has_alert: number;
          has_copy_watch: number;
          has_copy_pos: number;
          has_tv_alert: number;
          has_sched_bc: number;
          has_pending_treasury: number;
          has_pending_fee: number;
        }>()
        .catch(() => null);

      if (
        !activity ||
        activity.has_bot ||
        activity.has_open ||
        activity.has_dex_open ||
        activity.has_perp_open ||
        activity.has_pending ||
        activity.has_copy_pos ||
        activity.has_alert
      ) {
        const id = env.TRADING_BOT_DO.idFromName('global-coordinator');
        const stub = env.TRADING_BOT_DO.get(id);
        await stub.fetch('https://do/start').catch(() => {});
      }

      if (!activity || activity.has_perp_open) {
        await reconcilePerpDexOrders(env).catch(() => {});
      }

      if (!activity || activity.has_pending_treasury || activity.has_pending_fee) {
        await reconcilePendingFeeAndTreasuryTransactions(env.DB).catch(() => {});
      }

      await runAlwaysOnSignalRadar(env, { fromCron: true }).catch(() => {});
      await runAlwaysOnAiIntel(env, { fromCron: true }).catch(() => {});

      if (!activity || activity.has_tv_alert) {
        await evaluateTradingViewFreeAlerts(env).catch(() => {});
      }
      if (!activity || activity.has_sched_bc) {
        await dispatchDueScheduledBroadcasts(env).catch(() => {});
      }

      // Auto top-traders aggregation is heavy; skip DB reads unless auto-publish or published site traders exist (30m cached throttle inside syncAutoTopSiteTraders)
      await syncAutoTopSiteTraders(env.DB).catch(() => {});

      if (!activity || activity.has_copy_watch) {
        await pollWatchedWalletsForNewTrades(env).catch(() => {});
      }
      if (!activity || activity.has_copy_pos) {
        await reconcileCopyPositionsV2(env).catch(() => {});
      }

      // Run CEX New Listing & DEX Booming Meme Sniper only when at least one bot is actively running
      if (!activity || activity.has_bot) {
        const sniperUsers = await env.DB.prepare(
          `SELECT * FROM bot_configs
           WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')
             AND (sniper_enabled = 1 OR active_engines_json LIKE '%LISTING_SNIPER%')
           LIMIT 25`
        )
          .all<UserBotConfigRow>()
          .catch(() => ({ results: [] }));
        for (const su of sniperUsers.results) {
          await runNewListingAndMemeSniperForUser(env, su.user_id, su).catch(() => {});
        }
      }

      // Periodic 05. Database Report (default every 6h)
      try {
        const [intervalStr, lastDbReportStr, lastDigestStr] = await Promise.all([
          getCachedSystemSetting(env.DB, 'database_report_interval_hours', '6'),
          getCachedSystemSetting(env.DB, 'last_db_channel_report_at', ''),
          getCachedSystemSetting(env.DB, 'last_settlement_digest_at', ''),
        ]);
        const intervalHours = Math.max(1, Math.min(168, Number(intervalStr) || 6));
        const lastDbMs = lastDbReportStr ? Date.parse(lastDbReportStr) : 0;
        if (!Number.isFinite(lastDbMs) || Date.now() - lastDbMs >= intervalHours * 3600_000) {
          const rep = await publishDatabaseReport(env, { eventType: 'PERIODIC_STATUS' });
          if (rep.ok) {
            await setCachedSystemSetting(env.DB, 'last_db_channel_report_at', new Date().toISOString()).catch(() => {});
          }
        }

        // Daily 06. Transactions Settlement Digest (every 24h when open fee accounts exist)
        const lastDigMs = lastDigestStr ? Date.parse(lastDigestStr) : 0;
        if (!Number.isFinite(lastDigMs) || Date.now() - lastDigMs >= 24 * 3600_000) {
          const [feeAccruedRows, lockedOrPenalizedUsers] = await Promise.all([
            env.DB.prepare(
              `SELECT l.user_id, u.username, COALESCE(u.fee_lock_status, 'ACTIVE') AS lock_status,
                      u.fee_grace_deadline, COALESCE(u.fee_penalty_usd, 0) AS penalty_usd,
                      SUM(l.fee_usd) AS accrued_usd
               FROM server_fee_ledger l
               JOIN users u ON u.id = l.user_id
               WHERE l.status = 'ACCRUED'
               GROUP BY l.user_id
               HAVING accrued_usd > 0
               ORDER BY accrued_usd DESC
               LIMIT 25`
            )
              .all<{
                user_id: string;
                username: string;
                lock_status: string;
                fee_grace_deadline: string | null;
                penalty_usd: number;
                accrued_usd: number;
              }>()
              .catch(() => ({ results: [] })),
            env.DB.prepare(
              `SELECT id AS user_id, username, COALESCE(fee_lock_status, 'ACTIVE') AS lock_status,
                      fee_grace_deadline, COALESCE(fee_penalty_usd, 0) AS penalty_usd
               FROM users
               WHERE fee_lock_status != 'ACTIVE' OR fee_penalty_usd > 0
               LIMIT 25`
            )
              .all<{
                user_id: string;
                username: string;
                lock_status: string;
                fee_grace_deadline: string | null;
                penalty_usd: number;
              }>()
              .catch(() => ({ results: [] })),
          ]);

          const mergedDue = new Map<
            string,
            { user_id: string; username: string; lock_status: string; fee_grace_deadline: string | null; penalty_usd: number; accrued_usd: number }
          >();
          for (const r of feeAccruedRows.results) mergedDue.set(r.user_id, r);
          for (const u of lockedOrPenalizedUsers.results) {
            if (!mergedDue.has(u.user_id)) {
              mergedDue.set(u.user_id, { ...u, accrued_usd: 0 });
            }
          }
          const dueList = Array.from(mergedDue.values())
            .sort((a, b) => Number(b.accrued_usd) + Number(b.penalty_usd) - (Number(a.accrued_usd) + Number(a.penalty_usd)))
            .slice(0, 25);

          if (dueList.length > 0) {
            const totalDue = dueList.reduce((s, r) => s + Number(r.accrued_usd || 0) + Number(r.penalty_usd || 0), 0);
            const summaryTxt = dueList
              .map(
                (r, idx) =>
                  `${idx + 1}. \`${r.username}\` · بدهی: **$${(Number(r.accrued_usd) + Number(r.penalty_usd)).toFixed(2)}** · ${r.lock_status}${r.fee_grace_deadline ? ` · سررسید: ${r.fee_grace_deadline}` : ''}`
              )
              .join('\n');
            await publishTransactionEvent(env, {
              eventType: 'SETTLEMENT_DIGEST',
              status: 'DUE',
              title: 'گزارش خودکار روزانه موعد تسویه کاربران',
              amountUsd: totalDue,
              details: summaryTxt,
            }).catch(() => {});
          }
          await setCachedSystemSetting(env.DB, 'last_settlement_digest_at', new Date().toISOString()).catch(() => {});
        }
      } catch (cronErr) {
        await publishSystemLogEvent(env, {
          category: 'ERROR',
          level: 'ERROR',
          source: 'CronScheduled',
          title: 'خطای اجرای گزارش دوره‌ای کرون',
          details: cronErr instanceof Error ? cronErr.message : String(cronErr),
        }).catch(() => {});
      }
    })());
  },
};
