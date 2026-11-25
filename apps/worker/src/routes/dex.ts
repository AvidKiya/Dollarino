import { Hono } from 'hono';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { requireAuth } from '../auth.js';
import {
  buildMultiDappRoutes,
  fetchDexTrendingOverview,
  getDexOrdersCheck,
  getDexTokenPools,
  searchDexPairs,
} from '../dex/screener.js';
import { runTokenRugAndSafetyScan } from '../dex/smart-copy.js';
import {
  buildPerpDappLinks,
  fetchHyperliquidLivePerpMarkets,
  getUserPerpDexOverview,
  recordPerpDexOrder,
  savePerpDexConnection,
  type PerpVenueId,
} from '../dex/perp-dex.js';
import type { AuthUser, Env } from '../env.js';
import { enforceRateLimit } from '../security.js';
import { checkLiveFeeEnforcement } from '../services/server-fee.js';

export const dexRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

dexRoutes.get('/trending', async (c) => {
  const data = await fetchDexTrendingOverview();
  return c.json({ ok: true, trending: data.pairs, ...data, source: 'dexscreener.com' });
});

dexRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) {
    const data = await fetchDexTrendingOverview();
    return c.json({ ok: true, pairs: data.pairs, results: data.pairs, source: 'dexscreener.com' });
  }
  const pairs = await searchDexPairs(q);
  return c.json({ ok: true, query: q, pairs, results: pairs, source: 'dexscreener.com' });
});

dexRoutes.get('/token/:chainId/:tokenAddress', async (c) => {
  const chainId = c.req.param('chainId');
  const tokenAddress = c.req.param('tokenAddress');
  const [pools, orders] = await Promise.all([
    getDexTokenPools(chainId, tokenAddress),
    getDexOrdersCheck(chainId, tokenAddress),
  ]);
  return c.json({
    ok: true,
    chainId,
    tokenAddress,
    pools,
    paidOrders: orders,
    primaryPair: pools[0] ?? null,
    dappRoutes: buildMultiDappRoutes(chainId, tokenAddress, pools[0]?.url),
  });
});

dexRoutes.get('/routes', async (c) => {
  const chainId = (c.req.query('chainId') || 'solana').trim();
  const tokenAddress = (c.req.query('tokenAddress') || '').trim();
  if (!tokenAddress) return c.json({ error: 'tokenAddress الزامی است' }, 400);
  const routes = buildMultiDappRoutes(chainId, tokenAddress);
  return c.json({ ok: true, chainId, tokenAddress, routes });
});

dexRoutes.get('/safety', async (c) => {
  const chainId = (c.req.query('chainId') || 'solana').trim();
  const tokenAddress = (c.req.query('tokenAddress') || '').trim();
  if (!tokenAddress) return c.json({ error: 'tokenAddress الزامی است' }, 400);
  const report = await runTokenRugAndSafetyScan(c.env, chainId, tokenAddress);
  return c.json({ ok: true, report });
});

dexRoutes.post('/ai-analyze', requireAuth, async (c) => {
  const user = c.get('user');
  const rl = await enforceRateLimit(c.env, `dexai:${user.id}`, 12, 300);
  if (!rl.allowed) {
    return c.json({ error: `تعداد تحلیل‌های سریع DEX زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    tokenAddress?: string;
    query?: string;
    lang?: 'fa' | 'en';
  };

  let pair = null;
  if (body.chainId && body.tokenAddress) {
    const pools = await getDexTokenPools(body.chainId, body.tokenAddress);
    pair = pools[0] ?? null;
  } else if (body.query) {
    const hits = await searchDexPairs(body.query);
    pair = hits[0] ?? null;
  }
  if (!pair) {
    return c.json({ error: 'توکن مورد نظر در DexScreener یافت نشد.' }, 404);
  }

  const priceUsd = Number(pair.priceUsd || 0);
  const liqUsd = Number(pair.liquidity?.usd || 0);
  const vol24 = Number(pair.volume?.h24 || 0);
  const fdv = Number(pair.fdv || 0);
  const ch5 = Number(pair.priceChange?.m5 || 0);
  const ch1 = Number(pair.priceChange?.h1 || 0);
  const ch24 = Number(pair.priceChange?.h24 || 0);

  const fallbackAnalysis =
    body.lang === 'en'
      ? `${pair.baseToken.symbol} (${pair.chainId.toUpperCase()}): Price $${priceUsd}, Liquidity $${liqUsd.toLocaleString()}, 24h Vol $${vol24.toLocaleString()}, Safety Score ${pair.safetyScore}/100. ${
          pair.riskFlags.length ? `Warnings: ${pair.riskFlags.join(', ')}.` : 'Pool liquidity and activity look balanced.'
        }`
      : `تحلیل هوشمند ${pair.baseToken.symbol} در شبکه ${pair.chainId.toUpperCase()}:\n` +
        `• قیمت لحظه‌ای: $${priceUsd < 0.01 ? priceUsd.toPrecision(5) : priceUsd.toFixed(4)} | نقدینگی استخر: $${Math.round(liqUsd).toLocaleString('en-US')}\n` +
        `• حجم ۲۴ساعته: $${Math.round(vol24).toLocaleString('en-US')} | امتیاز ایمنی دلارینو: ${pair.safetyScore}/100\n` +
        `• تغییرات ۵دقیقه: ${ch5 >= 0 ? '+' : ''}${ch5}% | ۱ساعت: ${ch1 >= 0 ? '+' : ''}${ch1}% | ۲۴ساعت: ${ch24 >= 0 ? '+' : ''}${ch24}%\n` +
        (pair.riskFlags.length ? `⚠️ هشدارها: ${pair.riskFlags.join(' · ')}` : '✅ نقدینگی و جریان معاملات برای ترید غیرحضانتی با Trust Wallet مناسب ارزیابی شد.');

  const ensemble = await resolveAIEnsemble(c.env, user.id);
  let aiText = fallbackAnalysis;
  if (ensemble.engines.length > 0) {
    const sys =
      body.lang === 'en'
        ? 'You are Dollarino DEX Analyst. Give concise risk & trade setup analysis (3-5 bullets) for this DexScreener token.'
        : 'تو تحلیلگر ارشد DEX و توکن‌های آن‌چین دلارینو هستی. در ۴ تا ۵ خط شفاف و فارسی درباره ریسک، نقدینگی، مومنتوم و حد ضرر/تارگت احتمالی این توکن نظر بده. به کاربر یادآوری کن برای خرید غیرحضانتی از Trust Wallet DApp استفاده کند.';
    const usr = JSON.stringify({
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      chainId: pair.chainId,
      dexId: pair.dexId,
      priceUsd,
      liquidityUsd: liqUsd,
      volume24h: vol24,
      fdv,
      priceChange: pair.priceChange,
      txnsM5: pair.txns?.m5,
      safetyScore: pair.safetyScore,
      riskFlags: pair.riskFlags,
    });
    const out = await callBYOAI(ensemble.engines[0]!, sys, usr, { fastJson: false }).catch(() => '');
    if (out.trim()) aiText = out.trim().slice(0, 1400);
  }

  return c.json({
    ok: true,
    pair,
    analysis: aiText,
    suggestedLevels: {
      entryUsd: priceUsd,
      stopLossUsd: Number((priceUsd * 0.88).toPrecision(6)),
      tp1Usd: Number((priceUsd * 1.25).toPrecision(6)),
    },
  });
});

// =========================================================================
// Non-Custodial Wallet Perpetual Futures (Hyperliquid, Jupiter Perps, GMX, dYdX)
// =========================================================================

function normalizePerpVenue(raw?: string): PerpVenueId {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'jupiter_perps' || s === 'jupiter' || s === 'jup') return 'jupiter_perps';
  if (s === 'gmx' || s === 'gmx_arb' || s === 'gmx_v2') return 'gmx';
  if (s === 'dydx' || s === 'dydx_v4') return 'dydx';
  return 'hyperliquid';
}

function formatPerpAccountPayload(overview: Awaited<ReturnType<typeof getUserPerpDexOverview>>) {
  const primary = overview.connections.find((x) => x.venue === 'hyperliquid') ?? overview.connections[0];
  const live = primary?.liveState;
  const positions = (live?.positions || []).map((p) => ({
    symbol: p.coin,
    size: Math.abs(p.size),
    side: p.size >= 0 ? 'LONG' : 'SHORT',
    entryPrice: p.entryPx,
    unrealizedPnl: p.unrealizedPnl,
    leverage: p.leverage,
  }));
  const mappedOrders = overview.orders.map((o) => ({
    ...o,
    provider: String(o.venue || 'hyperliquid').toUpperCase(),
    size_usd: Number(o.margin_usd || 0),
  }));
  return {
    ok: true,
    connected: Boolean(primary),
    walletAddress: primary?.master_address || '',
    agentAddress: primary?.agent_address || '',
    mode: primary?.hasAgentKey ? 'AGENT_WALLET' : 'READ_ONLY',
    liveAccount: live
      ? {
          accountValueUsd: live.accountValueUsd,
          marginUsedUsd: Number(Math.max(0, live.accountValueUsd - live.withdrawableUsd).toFixed(2)),
          withdrawableUsd: live.withdrawableUsd,
          positions,
        }
      : null,
    connections: overview.connections,
    orders: mappedOrders,
  };
}

dexRoutes.get('/perp-markets', async (c) => {
  const symbol = (c.req.query('symbol') || 'BTC').trim();
  const markets = await fetchHyperliquidLivePerpMarkets();
  const dapps = buildPerpDappLinks(symbol);
  return c.json({ ok: true, venue: 'hyperliquid', markets, dapps });
});

dexRoutes.get('/perp-links', async (c) => {
  const symbol = (c.req.query('symbol') || 'BTC').trim();
  const links = buildPerpDappLinks(symbol);
  return c.json({ ok: true, symbol, links });
});

dexRoutes.get('/perp-overview', requireAuth, async (c) => {
  const user = c.get('user');
  const overview = await getUserPerpDexOverview(c.env, user.id);
  return c.json(formatPerpAccountPayload(overview));
});

dexRoutes.get('/perp-account', requireAuth, async (c) => {
  const user = c.get('user');
  const overview = await getUserPerpDexOverview(c.env, user.id);
  return c.json(formatPerpAccountPayload(overview));
});

dexRoutes.post('/perp-connect', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    venue?: PerpVenueId;
    provider?: string;
    masterAddress?: string;
    walletAddress?: string;
    agentAddress?: string;
    agentPrivateKey?: string;
  };
  const masterAddress = (body.masterAddress || body.walletAddress || '').trim();
  if (!masterAddress) return c.json({ error: 'آدرس کیف‌پول اصلی الزامی است.' }, 400);
  const venue = normalizePerpVenue(body.venue || body.provider);
  const res = await savePerpDexConnection(c.env, user.id, {
    venue,
    masterAddress,
    agentAddress: body.agentAddress,
    agentPrivateKey: body.agentPrivateKey,
  });
  const overview = await getUserPerpDexOverview(c.env, user.id);
  return c.json({
    ...res,
    ...formatPerpAccountPayload(overview),
    messageFa: res.hasAgentKey
      ? 'اتصال کیف‌پول و Agent Key (بدون مجوز برداشت) با رمزنگاری AES-256 ذخیره و همگام شد.'
      : 'کیف‌پول اصلی برای رصد زنده پوزیشن‌ها و موجودی Perp متصل شد.',
    messageEn: res.hasAgentKey
      ? 'Main wallet and encrypted trade-only Agent Wallet connected.'
      : 'Main wallet connected for live Perp position & balance tracking.',
  });
});

dexRoutes.post('/perp-order', requireAuth, async (c) => {
  const user = c.get('user');
  const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
  if (!feeCheck.allowed) {
    return c.json({
      error: feeCheck.reasonFa || 'سفارش جدید Perp DEX تا تسویه کارمزد ۳٪ معوق متوقف است (پوزیشن‌های باز همچنان مدیریت می‌شوند).',
      code: 'FEE_SETTLEMENT_REQUIRED',
      enforcement: feeCheck,
    }, 402);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    venue?: PerpVenueId;
    provider?: string;
    symbol?: string;
    side?: 'LONG' | 'SHORT';
    leverage?: number;
    marginUsd?: number;
    sizeUsd?: number;
    entryPrice?: number;
    tpPrice?: number;
    slPrice?: number;
  };
  if (!body.symbol) return c.json({ error: 'نماد ارز الزامی است.' }, 400);
  const venue = normalizePerpVenue(body.venue || body.provider);
  const cleanSym = body.symbol.toUpperCase().replace(/USDT$|USD$/i, '') || 'BTC';
  let entryPx = Number(body.entryPrice || 0);
  if (!Number.isFinite(entryPx) || entryPx <= 0) {
    const mk = await fetchHyperliquidLivePerpMarkets().catch(() => []);
    entryPx = mk.find((m) => m.symbol.toUpperCase() === cleanSym)?.markPrice || 0;
  }
  const res = await recordPerpDexOrder(c.env, user.id, {
    venue,
    symbol: cleanSym,
    side: body.side === 'SHORT' ? 'SHORT' : 'LONG',
    leverage: Number(body.leverage || 5),
    marginUsd: Number(body.marginUsd ?? body.sizeUsd ?? 25),
    entryPrice: entryPx,
    tpPrice: body.tpPrice,
    slPrice: body.slPrice,
  });
  return c.json({
    ...res,
    dappRedirectUrl: res.dappLink.trustWalletDappUrl,
    messageFa: `سفارش ${body.side === 'SHORT' ? 'SHORT' : 'LONG'} ${cleanSym} با اهرم ${Number(body.leverage || 5)}x ثبت شد. برای تایید نهایی بدون حضانت، در کیف‌پول باز می‌شود.`,
    messageEn: `${body.side === 'SHORT' ? 'SHORT' : 'LONG'} ${cleanSym} (${Number(body.leverage || 5)}x) recorded. Opening non-custodial wallet DApp...`,
  });
});

