import { Hono } from 'hono';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { ensureUserDefaults, requireAuth } from '../auth.js';
import { randomId } from '../crypto.js';
import {
  buildV2SwapExactEthForTokensCalldata,
  deriveEvmAddressFromPrivateKey,
  EVM_CHAIN_CONFIG,
} from '../dex/evm-tx.js';
import {
  annotateRoutesWithLivePools,
  buildMultiDappRoutes,
  buildTrustWalletSwapLinks,
  enrichDexPair,
  fetchDexTrendingOverview,
  getDexOrdersCheck,
  getDexTokenPools,
  searchDexPairs,
} from '../dex/screener.js';
import { resolveOnchainApiKey, runTokenRugAndSafetyScan } from '../dex/smart-copy.js';
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
import { isValidEvm, isValidSolana } from './trustwallet.js';

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
  const rawRoutes = buildMultiDappRoutes(chainId, tokenAddress, pools[0]?.url);
  const dappRoutes = annotateRoutesWithLivePools(rawRoutes, pools);
  const listedRoutes = dappRoutes.filter((r) => r.listedStatus === 'DIRECT_POOL' || r.listedStatus === 'AGGREGATOR');
  return c.json({
    ok: true,
    chainId,
    tokenAddress,
    pools,
    paidOrders: orders,
    primaryPair: pools[0] ?? null,
    dappRoutes,
    listedCount: listedRoutes.length,
    listedNames: listedRoutes.map((r) => r.name),
  });
});

dexRoutes.get('/routes', async (c) => {
  const chainId = (c.req.query('chainId') || 'solana').trim();
  const tokenAddress = (c.req.query('tokenAddress') || '').trim();
  if (!tokenAddress) return c.json({ error: 'tokenAddress الزامی است' }, 400);
  const pools = await getDexTokenPools(chainId, tokenAddress).catch(() => []);
  const rawRoutes = buildMultiDappRoutes(chainId, tokenAddress, pools[0]?.url);
  const routes = annotateRoutesWithLivePools(rawRoutes, pools);
  const listedRoutes = routes.filter((r) => r.listedStatus === 'DIRECT_POOL' || r.listedStatus === 'AGGREGATOR');
  return c.json({
    ok: true,
    chainId,
    tokenAddress,
    routes,
    listedCount: listedRoutes.length,
    listedNames: listedRoutes.map((r) => r.name),
  });
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
  const isPrivileged = user.role === 'owner' || user.role === 'admin';
  const rl = await enforceRateLimit(c.env, `dexai:${user.id}`, 12, 300, { bypass: isPrivileged });
  if (!rl.allowed) {
    return c.json({ error: `تعداد تحلیل‌های سریع DEX زیاد است. لطفاً ${rl.retryAfterSec} ثانیه صبر کنید.` }, 429);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    tokenAddress?: string;
    query?: string;
    lang?: 'fa' | 'en';
    tokenSnapshot?: {
      chainId?: string;
      dexId?: string;
      url?: string;
      pairAddress?: string;
      baseToken?: { address: string; name: string; symbol: string };
      quoteToken?: { address?: string; name?: string; symbol?: string };
      priceUsd?: string | number | null;
      liquidity?: { usd?: number } | null;
      volume?: Record<string, number>;
      priceChange?: Record<string, number>;
      txns?: Record<string, { buys: number; sells: number }>;
      fdv?: number | null;
      pairCreatedAt?: number | null;
      safetyScore?: number;
      riskFlags?: string[];
    };
  };

  let pair = null;
  if (body.chainId && body.tokenAddress) {
    const pools = await getDexTokenPools(body.chainId, body.tokenAddress);
    pair = pools[0] ?? null;
  }
  if (!pair && body.query) {
    const hits = await searchDexPairs(body.query);
    pair = hits.find((h) => !body.chainId || h.chainId === body.chainId) ?? hits[0] ?? null;
  }
  if (!pair && body.tokenSnapshot?.baseToken?.symbol && Number(body.tokenSnapshot?.priceUsd || 0) > 0) {
    const snap = body.tokenSnapshot;
    const enrichedSnap = enrichDexPair({
      chainId: snap.chainId || body.chainId || 'bsc',
      dexId: snap.dexId || 'dex',
      url: snap.url || '',
      pairAddress: snap.pairAddress || body.tokenAddress || snap.baseToken!.address,
      baseToken: {
        address: snap.baseToken!.address || body.tokenAddress || '',
        name: snap.baseToken!.name || snap.baseToken!.symbol,
        symbol: snap.baseToken!.symbol,
      },
      quoteToken: {
        address: snap.quoteToken?.address || '',
        name: snap.quoteToken?.name || 'USDT',
        symbol: snap.quoteToken?.symbol || 'USDT',
      },
      priceUsd: String(snap.priceUsd),
      liquidity: snap.liquidity ?? { usd: 0 },
      volume: snap.volume ?? {},
      priceChange: snap.priceChange ?? {},
      txns: snap.txns ?? {},
      fdv: snap.fdv ?? null,
      pairCreatedAt: snap.pairCreatedAt ?? null,
    });
    if (typeof snap.safetyScore === 'number') enrichedSnap.safetyScore = snap.safetyScore;
    if (Array.isArray(snap.riskFlags) && snap.riskFlags.length) enrichedSnap.riskFlags = snap.riskFlags;
    pair = enrichedSnap;
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
  const h1Buys = Number(pair.txns?.h1?.buys || pair.txns?.m5?.buys || 0);
  const h1Sells = Number(pair.txns?.h1?.sells || pair.txns?.m5?.sells || 0);
  const buyRatio = h1Buys + h1Sells > 0 ? Math.round((h1Buys / (h1Buys + h1Sells)) * 100) : 50;

  // Deterministic quantitative verdict: STRONG_BUY | BUY | WATCH | AVOID
  let quantScore = pair.safetyScore * 0.45;
  if (liqUsd >= 100_000) quantScore += 18;
  else if (liqUsd >= 30_000) quantScore += 10;
  else if (liqUsd < 10_000) quantScore -= 18;
  if (vol24 >= liqUsd * 0.8 && vol24 >= 50_000) quantScore += 12;
  if (buyRatio >= 56) quantScore += 10;
  else if (buyRatio < 40) quantScore -= 10;
  if (ch1 > 0 && ch1 < 45) quantScore += 10;
  else if (ch1 > 120) quantScore -= 8; // overextended pump warning
  else if (ch1 < -25) quantScore -= 8;

  const confidencePct = Math.round(Math.max(32, Math.min(94, quantScore)));
  let verdict: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' = 'WATCH';
  if (pair.safetyScore < 45 || liqUsd < 8_000) {
    verdict = 'AVOID';
  } else if (confidencePct >= 76 && pair.safetyScore >= 70) {
    verdict = 'STRONG_BUY';
  } else if (confidencePct >= 62 && pair.safetyScore >= 58) {
    verdict = 'BUY';
  } else if (confidencePct < 48) {
    verdict = 'AVOID';
  }

  const verdictLabelFa =
    verdict === 'STRONG_BUY'
      ? 'پیشنهاد خرید قوی (ورود پله‌ای مجاز)'
      : verdict === 'BUY'
        ? 'پیشنهاد خرید کنترل‌شده (با حد ضرر)'
        : verdict === 'WATCH'
          ? 'صبر و زیر نظر گرفتن (ورود هیجانی ممنوع)'
          : 'عدم خرید / ریسک بالا (پیشنهاد صرف‌نظر)';
  const verdictLabelEn =
    verdict === 'STRONG_BUY'
      ? 'STRONG BUY — High Momentum & Liquidity'
      : verdict === 'BUY'
        ? 'BUY — Controlled Entry with SL'
        : verdict === 'WATCH'
          ? 'WATCH — Wait for Pullback / Confirmation'
          : 'AVOID — High Risk / Weak Liquidity';

  const reasonsFa: string[] = [];
  const reasonsEn: string[] = [];
  if (pair.safetyScore >= 70) {
    reasonsFa.push(`امتیاز ایمنی استخر بالا (${pair.safetyScore}/100)`);
    reasonsEn.push(`Strong safety score (${pair.safetyScore}/100)`);
  } else {
    reasonsFa.push(`امتیاز ایمنی نیازمند احتیاط (${pair.safetyScore}/100)`);
    reasonsEn.push(`Moderate/low safety score (${pair.safetyScore}/100)`);
  }
  reasonsFa.push(`فشار خریداران: ${buyRatio}% (${h1Buys} خرید در برابر ${h1Sells} فروش)`);
  reasonsEn.push(`Buyer pressure: ${buyRatio}% (${h1Buys} buys vs ${h1Sells} sells)`);
  reasonsFa.push(
    liqUsd >= 50_000
      ? `نقدینگی قابل قبول ($${Math.round(liqUsd).toLocaleString('en-US')}) با حجم ۲۴س $${Math.round(vol24).toLocaleString('en-US')}`
      : `نقدینگی پایین استخر ($${Math.round(liqUsd).toLocaleString('en-US')}) — ریسک لغزش بالا`
  );
  reasonsEn.push(`Liquidity $${Math.round(liqUsd).toLocaleString('en-US')} · 24h Vol $${Math.round(vol24).toLocaleString('en-US')}`);
  if (ch1 > 80) {
    reasonsFa.push(`رشد تند ۱ ساعته (+${ch1.toFixed(1)}%) — احتمال اصلاح کوتاه‌مدت`);
    reasonsEn.push(`Sharp 1h pump (+${ch1.toFixed(1)}%) — pullback risk`);
  }

  const fallbackAnalysis =
    body.lang === 'en'
      ? `Recommendation: ${verdictLabelEn} (Confidence ${confidencePct}%)\n` +
        `• Price $${priceUsd}, Liquidity $${liqUsd.toLocaleString()}, 24h Vol $${vol24.toLocaleString()}, Safety ${pair.safetyScore}/100\n` +
        `• Signals: ${reasonsEn.join(' | ')}\n` +
        (pair.riskFlags.length ? `Warnings: ${pair.riskFlags.join(', ')}` : 'Risk checklist balanced.')
      : `نتیجه و پیشنهاد AI: ${verdictLabelFa} (اطمینان ${confidencePct}%)\n` +
        `• قیمت لحظه‌ای: $${priceUsd < 0.01 ? priceUsd.toPrecision(5) : priceUsd.toFixed(4)} | نقدینگی: $${Math.round(liqUsd).toLocaleString('en-US')} | حجم ۲۴س: $${Math.round(vol24).toLocaleString('en-US')}\n` +
        `• فشار معاملات: ${buyRatio}% خرید | تغییرات: ۵م (${ch5 >= 0 ? '+' : ''}${ch5}%) / ۱س (${ch1 >= 0 ? '+' : ''}${ch1}%) / ۲۴س (${ch24 >= 0 ? '+' : ''}${ch24}%)\n` +
        `• دلایل کلیدی: ${reasonsFa.join(' · ')}\n` +
        (pair.riskFlags.length ? `هشدارها: ${pair.riskFlags.join(' · ')}` : 'ساختار نقدینگی برای خرید با حد ضرر مناسب ارزیابی شد.');

  const ensemble = await resolveAIEnsemble(c.env, user.id);
  let aiText = fallbackAnalysis;
  if (ensemble.engines.length > 0) {
    const sys =
      body.lang === 'en'
        ? `You are Dollarino Senior DEX Analyst. Start explicitly with our verdict (${verdictLabelEn}), explain whether the user should BUY, WAIT or AVOID based on liquidity, buy/sell flow and momentum, and suggest entry/SL/TP in 4 crisp bullets.`
        : `تو تحلیلگر ارشد DEX دلارینو هستی. حتماً در خط اول صریح بگو کاربر الان بخرد، صبر کند یا نخرد (پیشنهاد فعلی: ${verdictLabelFa}) و سپس در ۳ تا ۴ خط دقیق دلایل نقدینگی، نسبت خرید/فروش، مومنتوم و ریسک را توضیح بده.`;
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
      buyerPressurePct: buyRatio,
      txnsH1: { buys: h1Buys, sells: h1Sells },
      safetyScore: pair.safetyScore,
      riskFlags: pair.riskFlags,
      verdict,
      confidencePct,
    });
    const out = await callBYOAI(ensemble.engines[0]!, sys, usr, { fastJson: false }).catch(() => '');
    if (out.trim()) aiText = out.trim().slice(0, 1400);
  }

  return c.json({
    ok: true,
    pair,
    verdict,
    verdictLabel: body.lang === 'en' ? verdictLabelEn : verdictLabelFa,
    confidencePct,
    reasons: body.lang === 'en' ? reasonsEn : reasonsFa,
    analysis: aiText,
    suggestedLevels: {
      entryUsd: priceUsd,
      stopLossUsd: Number((priceUsd * 0.88).toPrecision(6)),
      tp1Usd: Number((priceUsd * 1.25).toPrecision(6)),
    },
  });
});

// Direct 1-click buy inside site using user's pre-configured Sniper / Bot settings
dexRoutes.post('/direct-buy', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    dexId?: string;
    pairAddress?: string;
    tokenAddress?: string;
    tokenSymbol?: string;
    symbol?: string;
    quoteSymbol?: string;
    amountUsd?: number;
    entryPriceUsd?: number;
    priceUsd?: number;
    txHash?: string;
  };

  const resolvedSymbol = (body.tokenSymbol || body.symbol || '').trim();
  if (!body.chainId || !body.tokenAddress || !resolvedSymbol) {
    return c.json({ error: 'chainId، tokenAddress و tokenSymbol الزامی هستند.' }, 400);
  }

  await ensureUserDefaults(c.env.DB, user.id).catch(() => {});

  const [botCfg, uRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT trading_mode, paper_balance, margin_pct, sniper_budget_usd, sniper_tp_pct, sniper_sl_pct, sniper_min_safety_score
       FROM bot_configs WHERE user_id = ? LIMIT 1`
    ).bind(user.id).first<{
      trading_mode: 'PAPER' | 'LIVE';
      paper_balance: number;
      margin_pct: number;
      sniper_budget_usd: number;
      sniper_tp_pct: number;
      sniper_sl_pct: number;
      sniper_min_safety_score: number;
    }>().catch(() => null),
    c.env.DB.prepare(
      `SELECT trust_wallet_address, trust_wallet_solana, trust_wallet_ton, trust_wallet_tron FROM users WHERE id = ? LIMIT 1`
    ).bind(user.id).first<{
      trust_wallet_address: string | null;
      trust_wallet_solana: string | null;
      trust_wallet_ton: string | null;
      trust_wallet_tron: string | null;
    }>().catch(() => null),
  ]);

  const mode: 'PAPER' | 'LIVE' = botCfg?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
  const configuredBudget = Number(botCfg?.sniper_budget_usd || 0);
  const paperBal = Number(botCfg?.paper_balance ?? 10_000);
  const amountUsd = Math.max(
    5,
    Number(body.amountUsd && body.amountUsd > 0 ? body.amountUsd : configuredBudget > 0 ? configuredBudget : Math.max(25, Math.min(250, (paperBal * Number(botCfg?.margin_pct || 3)) / 100)))
  );
  const tpPct = Math.max(5, Number(botCfg?.sniper_tp_pct || 35));
  const slPct = Math.max(3, Math.min(80, Number(botCfg?.sniper_sl_pct || 15)));

  let entryPx = Number(body.entryPriceUsd || body.priceUsd || 0);
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
    return c.json({ error: 'دریافت قیمت لحظه‌ای توکن از DexScreener انجام نشد.' }, 400);
  }

  const slUsd = Number((entryPx * (1 - slPct / 100)).toPrecision(6));
  const tp1Usd = Number((entryPx * (1 + tpPct / 100)).toPrecision(6));
  const tokenQty = amountUsd / entryPx;
  const id = randomId('dext');
  const twLinks = buildTrustWalletSwapLinks(body.chainId, body.tokenAddress);

  if (mode === 'PAPER') {
    if (paperBal < amountUsd) {
      return c.json(
        { error: `موجودی کیف‌پول دمو ($${paperBal.toFixed(2)}) برای خرید $${amountUsd.toFixed(2)} کافی نیست.` },
        400
      );
    }
    await c.env.DB.prepare(
      `UPDATE bot_configs SET paper_balance = MAX(0, paper_balance - ?), updated_at = datetime('now') WHERE user_id = ?`
    ).bind(amountUsd, user.id).run();

    await c.env.DB.prepare(
      `INSERT INTO dex_trades (
        id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol,
        direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, wallet_address, tx_hash, status, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, 'PAPER_SIMULATOR', ?, 'OPEN', ?)`
    ).bind(
      id,
      user.id,
      body.chainId.toLowerCase(),
      dexId,
      pairAddr,
      body.tokenAddress,
      resolvedSymbol.toUpperCase(),
      body.quoteSymbol || 'USDT',
      amountUsd,
      tokenQty,
      entryPx,
      slUsd,
      tp1Usd,
      `paper_${id}`,
      `خرید مستقیم سایت (تنظیمات از پیش تعیین‌شده · TP +${tpPct}% / SL -${slPct}%)`
    ).run();

    return c.json({
      ok: true,
      mode: 'PAPER',
      tradeId: id,
      status: 'OPEN',
      amountUsd,
      tpPct,
      slPct,
      entryPriceUsd: entryPx,
      stopLossUsd: slUsd,
      tp1Usd,
      tokenQty,
      trustWallet: twLinks,
    });
  }

  // LIVE Mode: require fee check + either signed txHash or connected wallet confirmation
  const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
  if (!feeCheck.allowed) {
    return c.json(
      { error: feeCheck.reasonFa || `حساب واقعی به دلیل بدهی معوق کارمزد ۳٪ ($${feeCheck.totalDueUsd.toFixed(2)}) موقتاً قفل شده است.` },
      403
    );
  }
  const chainLower = body.chainId.toLowerCase();
  const walletAddr =
    chainLower === 'solana'
      ? uRow?.trust_wallet_solana
      : chainLower === 'ton'
        ? uRow?.trust_wallet_ton
        : chainLower === 'tron'
          ? uRow?.trust_wallet_tron
          : uRow?.trust_wallet_address;

  if (!body.txHash?.trim() && !walletAddr) {
    return c.json(
      {
        error: 'برای خرید مستقیم در حالت واقعی (LIVE)، ابتدا کیف‌پول Trust Wallet را متصل کنید یا به حالت دمو تغییر دهید.',
        needsWallet: true,
        trustWallet: twLinks,
      },
      400
    );
  }

  if (body.txHash?.trim()) {
    await c.env.DB.prepare(
      `INSERT INTO dex_trades (
        id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol,
        direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, wallet_address, tx_hash, status, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`
    ).bind(
      id,
      user.id,
      chainLower,
      dexId,
      pairAddr,
      body.tokenAddress,
      resolvedSymbol.toUpperCase(),
      body.quoteSymbol || 'USDT',
      amountUsd,
      tokenQty,
      entryPx,
      slUsd,
      tp1Usd,
      walletAddr || null,
      body.txHash.trim(),
      `خرید مستقیم آن‌چین با تنظیمات سایت (TP +${tpPct}% / SL -${slPct}%)`
    ).run();

    return c.json({
      ok: true,
      mode: 'LIVE',
      tradeId: id,
      status: 'OPEN',
      amountUsd,
      tpPct,
      slPct,
      entryPriceUsd: entryPx,
      stopLossUsd: slUsd,
      tp1Usd,
      tokenQty,
      trustWallet: twLinks,
    });
  }

  return c.json(
    {
      ok: false,
      needsWalletSign: true,
      amountUsd,
      tpPct,
      slPct,
      entryPriceUsd: entryPx,
      stopLossUsd: slUsd,
      tp1Usd,
      trustWallet: twLinks,
      error: 'برای نهایی‌سازی خرید واقعی، تراکنش را داخل Trust Wallet امضا و تایید کنید.',
    },
    200
  );
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

// =========================================================================
// 1-Click Hyperliquid ApproveAgent Registration (Signed inside Trust Wallet DApp)
// =========================================================================

dexRoutes.post('/perp-approve-agent', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    masterAddress?: string;
    agentAddress?: string;
    agentPrivateKey?: string;
    agentName?: string;
    nonce?: number;
    signature?: { r?: string; s?: string; v?: number };
    hyperliquidChain?: 'Mainnet' | 'Testnet';
  };

  const masterAddress = (body.masterAddress || '').trim();
  const agentAddress = (body.agentAddress || '').trim();
  const agentPrivateKey = (body.agentPrivateKey || '').trim();
  const nonce = Number(body.nonce || 0);
  const sig = body.signature;

  if (!isValidEvm(masterAddress) || !isValidEvm(agentAddress)) {
    return c.json({ error: 'آدرس کیف‌پول اصلی یا Agent Address نامعتبر است.' }, 400);
  }
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(agentPrivateKey)) {
    return c.json({ error: 'فرمت کلید خصوصی Trade-Only Agent نامعتبر است.' }, 400);
  }
  const derivedAgent = deriveEvmAddressFromPrivateKey(agentPrivateKey).toLowerCase();
  if (derivedAgent !== agentAddress.toLowerCase()) {
    return c.json({ error: 'کلید خصوصی با Agent Address هم‌خوانی ندارد.' }, 400);
  }
  if (!sig?.r || !sig?.s || typeof sig.v !== 'number' || !Number.isFinite(nonce) || nonce <= 0) {
    return c.json({ error: 'امضای EIP-712 ApproveAgent ناقص است.' }, 400);
  }

  const hlChain = body.hyperliquidChain === 'Testnet' ? 'Testnet' : 'Mainnet';
  const agentName = (body.agentName || 'Dollarino24x7').slice(0, 16);
  const action = {
    type: 'approveAgent',
    hyperliquidChain: hlChain,
    signatureChainId: '0xa4b1',
    agentAddress: agentAddress.toLowerCase(),
    agentName,
    nonce,
  };

  let hlOk = false;
  let hlError = '';
  try {
    const res = await fetch('https://api.hyperliquid.xyz/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        nonce,
        signature: {
          r: sig.r,
          s: sig.s,
          v: sig.v,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => ({}))) as { status?: string; response?: string };
    if (res.ok && j.status === 'ok') {
      hlOk = true;
    } else {
      hlError = typeof j.response === 'string' ? j.response : j.status || `HTTP ${res.status}`;
    }
  } catch (err) {
    hlError = err instanceof Error ? err.message : 'Hyperliquid network error';
  }

  if (!hlOk) {
    return c.json(
      {
        ok: false,
        error: `هایپرلیکویید تایید Agent را نپذیرفت: ${hlError}. مطمئن شوید روی شبکه Arbitrum امضا کرده‌اید و حساب Hyperliquid حداقل یک‌بار فعال/واریز شده است.`,
        hlError,
      },
      400
    );
  }

  const saved = await savePerpDexConnection(c.env, user.id, {
    venue: 'hyperliquid',
    masterAddress,
    agentAddress,
    agentPrivateKey: agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`,
  });

  const overview = await getUserPerpDexOverview(c.env, user.id);
  return c.json({
    ...saved,
    ...formatPerpAccountPayload(overview),
    messageFa: '⚡ Agent Wallet غیرحضانتی روی Hyperliquid با امضای Trust Wallet فعال و ذخیره شد! ربات اکنون می‌تواند ۲۴/۷ بدون مجوز برداشت ترید کند.',
    messageEn: '⚡ Non-custodial Hyperliquid Agent Wallet approved & encrypted! 24/7 trade-only execution is now active.',
  });
});

// =========================================================================
// 1-Click Live DEX Swap Transaction Builder (EVM + Solana Jupiter)
// =========================================================================

dexRoutes.post('/build-swap-tx', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    chainId?: string;
    tokenAddress?: string;
    amountUsd?: number;
    userAddress?: string;
    slippagePct?: number;
  };

  const chainId = (body.chainId || '').toLowerCase().trim();
  const tokenAddress = (body.tokenAddress || '').trim();
  const userAddress = (body.userAddress || '').trim();
  const amountUsd = Math.max(1, Math.min(50_000, Number(body.amountUsd || 25)));
  const slippagePct = Math.max(0.5, Math.min(45, Number(body.slippagePct || 5)));

  if (!chainId || !tokenAddress) {
    return c.json({ error: 'شبکه (chainId) و آدرس توکن مقصد الزامی هستند.' }, 400);
  }

  // Enforce fee check for live swaps
  const feeCheck = await checkLiveFeeEnforcement(c.env.DB, user.id);
  if (!feeCheck.allowed) {
    return c.json({ error: feeCheck.reasonFa || 'تسویه کارمزد ۳٪ معوق لازم است.', code: 'FEE_SETTLEMENT_REQUIRED' }, 402);
  }

  const fallbackLink = buildTrustWalletSwapLinks(chainId, tokenAddress).trustWalletDappUrl;

  if (chainId === 'solana') {
    if (!isValidSolana(userAddress)) {
      return c.json({
        ok: true,
        kind: 'DAPP_URL',
        chainId,
        dappUrl: fallbackLink,
        note: 'آدرس سولانای کاربر یافت نشد؛ باز کردن مسیر سوآپ در اپ Trust Wallet.',
      });
    }
    const solMint = 'So11111111111111111111111111111111111111112';
    const solPools = await getDexTokenPools('solana', solMint).catch(() => []);
    const solPriceUsd = Number(solPools[0]?.priceUsd || 180);
    const amountSol = Number((amountUsd / Math.max(10, solPriceUsd)).toFixed(6));
    const lamports = Math.max(500_000, Math.floor(amountSol * 1e9));
    const slippageBps = Math.round(slippagePct * 100);

    try {
      const qRes = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${solMint}&outputMint=${encodeURIComponent(tokenAddress)}&amount=${lamports}&slippageBps=${slippageBps}`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!qRes.ok) throw new Error(`Jupiter quote HTTP ${qRes.status}`);
      const quoteResponse = (await qRes.json()) as { outAmount?: string; priceImpactPct?: string };
      const sRes = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: userAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
        signal: AbortSignal.timeout(7000),
      });
      if (!sRes.ok) throw new Error(`Jupiter swap HTTP ${sRes.status}`);
      const swapJson = (await sRes.json()) as { swapTransaction?: string };
      if (!swapJson.swapTransaction) throw new Error('Empty swapTransaction');

      return c.json({
        ok: true,
        kind: 'SOLANA_TX',
        chainId: 'solana',
        swapTransactionBase64: swapJson.swapTransaction,
        quoteSummary: {
          inputSymbol: 'SOL',
          amountInput: amountSol,
          approxUsd: amountUsd,
          outAmountRaw: quoteResponse.outAmount || null,
          priceImpactPct: quoteResponse.priceImpactPct || null,
          slippagePct,
          router: 'Jupiter v6 Aggregator',
        },
        dappUrl: fallbackLink,
      });
    } catch {
      return c.json({
        ok: true,
        kind: 'DAPP_URL',
        chainId,
        dappUrl: fallbackLink,
        note: 'مسیریاب Jupiter در دسترس نبود؛ لینک مستقیم Trust Wallet DApp باز می‌شود.',
      });
    }
  }

  const evmCfg = EVM_CHAIN_CONFIG[chainId];
  if (evmCfg && isValidEvm(userAddress) && isValidEvm(tokenAddress)) {
    const pools = await getDexTokenPools(chainId, evmCfg.wrappedNative).catch(() => []);
    const nativeUsd = Number(pools[0]?.priceUsd || (chainId === 'bsc' ? 600 : 3000));
    const amountNative = Number((amountUsd / Math.max(10, nativeUsd)).toFixed(6));
    const valueWei = BigInt(Math.max(10_000, Math.floor(amountNative * 1e9))) * 1_000_000_000n;

    const oneInch = await resolveOnchainApiKey(c.env, 'oneinch').catch(() => ({ apiKey: null, isActive: false }));
    let txTo = evmCfg.v2Router || '';
    let txData = '';
    let txValue = valueWei;
    let routerName = chainId === 'bsc' ? 'PancakeSwap V2' : 'Uniswap V2';

    if (oneInch.isActive && oneInch.apiKey) {
      const swapUrl =
        `https://api.1inch.dev/swap/v6.0/${evmCfg.chainId}/swap?src=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` +
        `&dst=${encodeURIComponent(tokenAddress)}&amount=${valueWei.toString()}&from=${userAddress}` +
        `&slippage=${Math.max(1, Math.min(49, Math.round(slippagePct)))}&disableEstimate=true`;
      const res = await fetch(swapUrl, {
        headers: { Authorization: `Bearer ${oneInch.apiKey}` },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);
      if (res?.ok) {
        const j = (await res.json()) as { tx?: { to: string; data: string; value?: string } };
        if (j.tx?.to && j.tx?.data) {
          txTo = j.tx.to;
          txData = j.tx.data;
          if (j.tx.value) txValue = BigInt(j.tx.value);
          routerName = '1inch v6 Aggregator';
        }
      }
    }

    if (!txData && evmCfg.v2Router) {
      txTo = evmCfg.v2Router;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      txData = buildV2SwapExactEthForTokensCalldata(0n, [evmCfg.wrappedNative, tokenAddress], userAddress, deadline);
    }

    if (txTo && txData) {
      return c.json({
        ok: true,
        kind: 'EVM_TX',
        chainId,
        numericChainId: evmCfg.chainId,
        chainIdHex: '0x' + evmCfg.chainId.toString(16),
        tx: {
          from: userAddress,
          to: txTo,
          data: txData,
          value: '0x' + txValue.toString(16),
        },
        quoteSummary: {
          inputSymbol: evmCfg.nativeSymbol,
          amountInput: amountNative,
          approxUsd: amountUsd,
          slippagePct,
          router: routerName,
        },
        dappUrl: fallbackLink,
      });
    }
  }

  return c.json({
    ok: true,
    kind: 'DAPP_URL',
    chainId,
    dappUrl: fallbackLink,
    note: 'برای این شبکه یا حالت بدون اتصال DApp، صفحه سوآپ مستقیم باز می‌شود.',
  });
});

dexRoutes.post('/perp-orders/:id/close', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT id, symbol, side, leverage, margin_usd, status FROM perp_dex_orders WHERE id = ? AND user_id = ? LIMIT 1`
  )
    .bind(id, user.id)
    .first<{ id: string; symbol: string; side: string; leverage: number; margin_usd: number; status: string }>();
  if (!row) return c.json({ error: 'سفارش یا پوزیشن Perp DEX یافت نشد.' }, 404);
  if (row.status === 'CLOSED' || row.status === 'CANCELLED') {
    return c.json({ ok: true, id, status: row.status });
  }
  await c.env.DB.prepare(
    `UPDATE perp_dex_orders SET status = 'CLOSED', note = COALESCE(note, '') || ' [بسته‌شده توسط کاربر]' WHERE id = ? AND user_id = ?`
  )
    .bind(id, user.id)
    .run();
  return c.json({ ok: true, id, status: 'CLOSED', symbol: row.symbol });
});

