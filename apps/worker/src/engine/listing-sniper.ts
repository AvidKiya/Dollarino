import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { fetchDexTrendingOverview, type DexTokenEnriched } from '../dex/screener.js';
import { checkLiveFeeEnforcement } from '../services/server-fee.js';
import { logAudit, notifyUserTelegram, pushNotification, resolveUserCapitalSummary, type UserBotConfigRow } from './executor.js';
import { checkPreTradeOnboardingGate } from './onboarding-gate.js';

export type SniperTargetType = 'BOTH' | 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME';

export interface SniperCandidate {
  symbol: string;
  name: string;
  chainId: string;
  tokenAddress: string;
  pairAddress: string;
  dexId: string;
  source: 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME';
  safetyScore: number;
  liquidityUsd: number;
  priceUsd: number;
  change5mPct: number;
  change1hPct: number;
  change24hPct: number;
  volume24hUsd: number;
  buys1h: number;
  sells1h: number;
  ageHours: number | null;
  mcapUsd: number | null;
  imageUrl?: string | null;
  isOnCentralizedHint: boolean;
  riskFlags: string[];
  trustWalletSwapUrl: string;
  dexScreenerUrl: string;
}

const DEFAULT_SNIPER_CHAINS = ['solana', 'bsc', 'base', 'ethereum', 'ton', 'arbitrum'];

async function fetchBinanceRecentListingSymbols(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=12',
      {
        headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.4' },
        signal: AbortSignal.timeout(1800),
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { catalogs?: Array<{ articles?: Array<{ title?: string }> }> };
    };
    const articles = json.data?.catalogs?.[0]?.articles ?? [];
    const tickers = new Set<string>();
    for (const a of articles) {
      const title = String(a.title || '');
      const matches = title.match(/\(([A-Z0-9]{2,12})\)/g) ?? [];
      for (const m of matches) {
        const clean = m.slice(1, -1).trim();
        if (clean && !['USDT', 'USDC', 'FDUSD', 'TRY', 'BTC', 'ETH', 'USD'].includes(clean)) {
          tickers.add(clean);
        }
      }
    }
    return Array.from(tickers);
  } catch {
    return [];
  }
}

export async function discoverListingAndBoomCandidates(options?: {
  allowedChains?: string[];
  minSafetyScore?: number;
  minLiquidityUsd?: number;
  maxPairAgeHours?: number;
  targetType?: SniperTargetType;
}): Promise<SniperCandidate[]> {
  const allowedChains = new Set(
    (options?.allowedChains?.length ? options.allowedChains : DEFAULT_SNIPER_CHAINS).map((c) => c.toLowerCase())
  );
  const minSafety = Math.max(40, Math.min(98, options?.minSafetyScore ?? 75));
  const minLiquidity = Math.max(5000, options?.minLiquidityUsd ?? 25_000);
  const maxAgeHours = Math.max(1, Math.min(720, options?.maxPairAgeHours ?? 168));
  const targetType: SniperTargetType = options?.targetType || 'BOTH';

  const [cexNewSymbols, dexOverview] = await Promise.all([
    fetchBinanceRecentListingSymbols(),
    fetchDexTrendingOverview().catch(() => ({ pairs: [] as DexTokenEnriched[], metas: [] })),
  ]);

  const cexSet = new Set(cexNewSymbols.map((s) => s.toUpperCase()));
  const candidates: SniperCandidate[] = [];
  const seen = new Set<string>();
  const nowMs = Date.now();

  for (const p of dexOverview.pairs) {
    const chain = (p.chainId || '').toLowerCase();
    if (!allowedChains.has(chain)) continue;

    const sym = (p.baseToken?.symbol || '').toUpperCase().trim();
    if (!sym || ['USDT', 'USDC', 'WETH', 'WBNB', 'SOL', 'WBTC', 'DAI'].includes(sym)) continue;

    const liq = Number(p.liquidity?.usd || 0);
    const px = Number(p.priceUsd || 0);
    const ch1h = Number(p.priceChange?.h1 || 0);
    const ch5m = Number(p.priceChange?.m5 || 0);
    const ch24h = Number(p.priceChange?.h24 || 0);
    const buys1h = Number(p.txns?.h1?.buys || 0);
    const sells1h = Number(p.txns?.h1?.sells || 0);

    if (!Number.isFinite(px) || px <= 0 || liq < minLiquidity) continue;
    if (p.safetyScore < minSafety) continue;
    if (sells1h <= 0 || buys1h < Math.max(2, sells1h * 0.7)) continue;

    const ageHours =
      typeof p.pairCreatedAt === 'number' && Number.isFinite(p.pairCreatedAt) && p.pairCreatedAt > 0
        ? Math.max(0.1, Number(((nowMs - p.pairCreatedAt) / 3_600_000).toFixed(1)))
        : null;

    if (ageHours !== null && ageHours > maxAgeHours) continue;

    const isCexListed = p.isOnCentralizedHint || cexSet.has(sym);
    const source: 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME' = isCexListed ? 'CEX_NEW_LISTING' : 'DEX_BOOM_MEME';

    if (targetType === 'CEX_NEW_LISTING' && source !== 'CEX_NEW_LISTING') continue;
    if (targetType === 'DEX_BOOM_MEME' && source !== 'DEX_BOOM_MEME') continue;

    const hasMomentum = ch1h >= 4 || ch5m >= 2 || isCexListed;
    if (!hasMomentum) continue;

    const dedupKey = `${chain}:${p.baseToken.address.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    candidates.push({
      symbol: sym,
      name: p.baseToken.name || sym,
      chainId: chain,
      tokenAddress: p.baseToken.address,
      pairAddress: p.pairAddress,
      dexId: p.dexId || 'dex',
      source,
      safetyScore: p.safetyScore,
      liquidityUsd: liq,
      priceUsd: px,
      change5mPct: ch5m,
      change1hPct: ch1h,
      change24hPct: ch24h,
      volume24hUsd: Number(p.volume?.h24 || 0),
      buys1h,
      sells1h,
      ageHours,
      mcapUsd: typeof p.marketCap === 'number' ? p.marketCap : typeof p.fdv === 'number' ? p.fdv : null,
      imageUrl: p.info?.imageUrl || null,
      isOnCentralizedHint: isCexListed,
      riskFlags: p.riskFlags || [],
      trustWalletSwapUrl: p.trustWallet.trustWalletDappUrl,
      dexScreenerUrl: p.trustWallet.dexScreenerUrl,
    });
  }

  candidates.sort((a, b) => {
    const aScore = (a.source === 'CEX_NEW_LISTING' ? 25 : 0) + a.safetyScore + Math.min(40, Math.max(0, a.change1hPct));
    const bScore = (b.source === 'CEX_NEW_LISTING' ? 25 : 0) + b.safetyScore + Math.min(40, Math.max(0, b.change1hPct));
    return bScore - aScore;
  });

  return candidates.slice(0, 16);
}

export async function executeSniperBuyForCandidate(params: {
  env: Env;
  userId: string;
  cfg: UserBotConfigRow;
  pick: SniperCandidate;
  bypassDedupe?: boolean;
}): Promise<{ ok: boolean; tradeId?: string; reason?: string; trustWalletSwapUrl?: string }> {
  const { env, userId, cfg, pick, bypassDedupe } = params;

  const onboardingGate = await checkPreTradeOnboardingGate(env.DB, userId);
  if (!onboardingGate.ok) {
    return { ok: false, reason: `${onboardingGate.code}: ${onboardingGate.error}` };
  }

  if (cfg.trading_mode === 'LIVE') {
    const feeCheck = await checkLiveFeeEnforcement(env.DB, userId);
    if (!feeCheck.allowed) {
      return { ok: false, reason: 'FEE_SETTLEMENT_REQUIRED' };
    }
  }

  const maxOpenSniper = Math.max(1, Math.min(12, Number(cfg.sniper_max_open_positions ?? 3)));
  const openCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM dex_trades WHERE user_id = ? AND status = 'OPEN'`
  )
    .bind(userId)
    .first<{ cnt: number }>()
    .catch(() => ({ cnt: 0 }));
  if ((openCountRow?.cnt ?? 0) >= maxOpenSniper) {
    return { ok: false, reason: 'SNIPER_MAX_OPEN_POSITIONS_REACHED' };
  }

  if (!bypassDedupe) {
    const recentBuy = await env.DB.prepare(
      `SELECT id FROM dex_trades
       WHERE user_id = ? AND LOWER(token_address) = LOWER(?) AND opened_at >= datetime('now', '-24 hours')
       LIMIT 1`
    )
      .bind(userId, pick.tokenAddress)
      .first<{ id: string }>()
      .catch(() => null);
    if (recentBuy) return { ok: false, reason: 'ALREADY_SNIPED_24H' };
  }

  const requestedBudgetUsd = Math.max(5, Math.min(5000, Number(cfg.sniper_budget_usd ?? 25)));
  const capSummary = await resolveUserCapitalSummary(env.DB, userId, cfg).catch(() => null);
  const budgetUsd =
    capSummary && capSummary.isCapped
      ? Math.min(requestedBudgetUsd, capSummary.remainingBudgetUsd)
      : requestedBudgetUsd;
  if (capSummary && capSummary.isCapped && budgetUsd < 5) {
    return { ok: false, reason: 'BOT_BUDGET_CAP_REACHED' };
  }

  const tpPct = Math.max(5, Math.min(500, Number(cfg.sniper_tp_pct ?? 35)));
  const slPct = Math.max(3, Math.min(80, Number(cfg.sniper_sl_pct ?? 15)));
  const qty = Number((budgetUsd / pick.priceUsd).toFixed(6));
  const slUsd = Number((pick.priceUsd * (1 - slPct / 100)).toFixed(8));
  const tp1Usd = Number((pick.priceUsd * (1 + tpPct / 100)).toFixed(8));

  if (cfg.trading_mode === 'PAPER') {
    const balRow = await env.DB.prepare(`SELECT paper_balance FROM bot_configs WHERE user_id = ?`)
      .bind(userId)
      .first<{ paper_balance: string }>()
      .catch(() => null);
    const currentBal = Number(balRow?.paper_balance ?? cfg.paper_balance ?? 0);
    if (currentBal < budgetUsd) {
      return { ok: false, reason: 'INSUFFICIENT_PAPER_BALANCE' };
    }

    const nextBal = Number((currentBal - budgetUsd).toFixed(2));
    const tradeId = randomId('dtr');
    await env.DB.batch([
      env.DB.prepare(`UPDATE bot_configs SET paper_balance = ?, updated_at = datetime('now') WHERE user_id = ?`).bind(String(nextBal), userId),
      env.DB.prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, tx_hash, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'USDT', 'BUY', ?, ?, ?, ?, ?, ?, 'OPEN', ?)`
      ).bind(
        tradeId,
        userId,
        pick.chainId,
        pick.dexId,
        pick.pairAddress,
        pick.tokenAddress,
        pick.symbol,
        budgetUsd,
        qty,
        pick.priceUsd,
        slUsd,
        tp1Usd,
        `PAPER_SNIPER_${Date.now()}`,
        `[شکارچی دمو ${pick.source === 'CEX_NEW_LISTING' ? 'لیستینگ جدید' : 'میم‌کوین داغ'}] امنیت ${pick.safetyScore}/100 · TP +${tpPct}% / SL -${slPct}%`
      ),
    ]);

    await logAudit(
      env.DB,
      userId,
      'ORDER',
      'INFO',
      `🎯 شکارچی دمو: خرید $${budgetUsd} از ${pick.symbol} (${pick.chainId.toUpperCase()} · امنیت ${pick.safetyScore}/100 · رشد ۱ساعته ${pick.change1hPct.toFixed(1)}%)`,
      pick.symbol
    );
    await pushNotification(
      env.DB,
      userId,
      'TRADE',
      `🎯 شکار خودکار ${pick.symbol} ($${budgetUsd})`,
      `${pick.source === 'CEX_NEW_LISTING' ? 'لیستینگ صرافی معتبر' : 'میم‌کوین داغ و تاییدشده'} روی ${pick.chainId} · امتیاز امنیت ${pick.safetyScore}/100`
    );
    await notifyUserTelegram(
      env,
      userId,
      `🎯 **شکارچی خودکار لیستینگ جدید و میم‌کوین**\n` +
        `• ارز: **${pick.symbol}** (${pick.chainId.toUpperCase()})\n` +
        `• نوع: ${pick.source === 'CEX_NEW_LISTING' ? '🆕 لیستینگ جدید صرافی معتبر' : '🔥 میم‌کوین داغ'}\n` +
        `• بودجه: $${budgetUsd} (حالت دمو) · امنیت آن‌چین: **${pick.safetyScore}/100**\n` +
        `• ورود: $${pick.priceUsd} | 🎯 TP1 (+${tpPct}%): $${tp1Usd} | ⛔️ SL (-${slPct}%): $${slUsd}`
    ).catch(() => {});

    return { ok: true, tradeId };
  }

  // LIVE mode: create PENDING_SIGN entry & deliver 1-tap Trust Wallet swap link
  const tradeId = randomId('dtr');
  await env.DB.prepare(
    `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'USDT', 'BUY', ?, ?, ?, ?, ?, 'PENDING_SIGN', ?)`
  )
    .bind(
      tradeId,
      userId,
      pick.chainId,
      pick.dexId,
      pick.pairAddress,
      pick.tokenAddress,
      pick.symbol,
      budgetUsd,
      qty,
      pick.priceUsd,
      slUsd,
      tp1Usd,
      `[شکارچی واقعی ${pick.source === 'CEX_NEW_LISTING' ? 'لیستینگ جدید' : 'میم‌کوین داغ'}] آماده تایید Trust Wallet`
    )
    .run();

  await pushNotification(
    env.DB,
    userId,
    'TRADE',
    `🎯 فرصت شکار واقعی ${pick.symbol} ($${budgetUsd})`,
    `امتیاز امنیت ${pick.safetyScore}/100 · نقدینگی $${Math.round(pick.liquidityUsd).toLocaleString()} · برای تایید ۱-کلیک در Trust Wallet کلیک کنید.`
  );
  await notifyUserTelegram(
    env,
    userId,
    `🎯 **فرصت شکار واقعی لیستینگ / میم‌کوین داغ!**\n` +
      `• ارز: **${pick.symbol}** (${pick.chainId.toUpperCase()})\n` +
      `• بودجه: $${budgetUsd} · امتیاز امنیت: **${pick.safetyScore}/100** · نقدینگی: $${Math.round(pick.liquidityUsd).toLocaleString()}\n` +
      `👇 به دلیل غیرامانی بودن Trust Wallet، برای امضا و خرید فوری با ۱ کلیک لمس کنید:`,
    [[{ text: `خرید ${pick.symbol} در Trust Wallet 🛡`, url: pick.trustWalletSwapUrl }]]
  ).catch(() => {});

  return { ok: true, tradeId, trustWalletSwapUrl: pick.trustWalletSwapUrl };
}

export async function runNewListingAndMemeSniperForUser(
  env: Env,
  userId: string,
  cfg: UserBotConfigRow
): Promise<{ ok: boolean; scannedCount: number; boughtCount: number; candidates: SniperCandidate[]; reason?: string }> {
  const onboardingGate = await checkPreTradeOnboardingGate(env.DB, userId);
  if (!onboardingGate.ok) {
    return {
      ok: false,
      scannedCount: 0,
      boughtCount: 0,
      candidates: [],
      reason: `${onboardingGate.code}: ${onboardingGate.error}`,
    };
  }

  if (cfg.bot_state !== 'RUNNING_PAPER' && cfg.bot_state !== 'RUNNING_LIVE') {
    return { ok: false, scannedCount: 0, boughtCount: 0, candidates: [], reason: 'BOT_STOPPED' };
  }

  if (cfg.trading_mode === 'LIVE') {
    const feeCheck = await checkLiveFeeEnforcement(env.DB, userId);
    if (!feeCheck.allowed) {
      return { ok: false, scannedCount: 0, boughtCount: 0, candidates: [], reason: 'FEE_SETTLEMENT_REQUIRED' };
    }
  }

  let allowedChains = DEFAULT_SNIPER_CHAINS;
  try {
    if (cfg.sniper_networks_json) {
      const parsed = JSON.parse(cfg.sniper_networks_json) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        allowedChains = parsed.map((c) => String(c).toLowerCase());
      }
    }
  } catch {
    allowedChains = DEFAULT_SNIPER_CHAINS;
  }

  const minSafetyScore = Math.max(40, Math.min(98, Number(cfg.sniper_min_safety_score ?? 75)));
  const minLiquidityUsd = Math.max(5000, Math.min(10_000_000, Number(cfg.sniper_min_liquidity_usd ?? 25_000)));
  const maxPairAgeHours = Math.max(1, Math.min(720, Number(cfg.sniper_max_pair_age_hours ?? 168)));
  const targetType: SniperTargetType =
    cfg.sniper_target_type === 'CEX_NEW_LISTING' || cfg.sniper_target_type === 'DEX_BOOM_MEME'
      ? cfg.sniper_target_type
      : 'BOTH';

  const candidates = await discoverListingAndBoomCandidates({
    allowedChains,
    minSafetyScore,
    minLiquidityUsd,
    maxPairAgeHours,
    targetType,
  });

  if (!candidates.length) {
    return { ok: true, scannedCount: 0, boughtCount: 0, candidates: [] };
  }

  for (const c of candidates.slice(0, 5)) {
    await env.DB.prepare(
      `INSERT INTO new_listing_events (id, symbol, token_address, chain_id, source, safety_score, liquidity_usd, price_usd, change_1h_pct, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        randomId('nle'),
        c.symbol,
        c.tokenAddress,
        c.chainId,
        c.source,
        c.safetyScore,
        c.liquidityUsd,
        c.priceUsd,
        c.change1hPct,
        `${c.name} (${c.dexId})`
      )
      .run()
      .catch(() => {});
  }

  // If user switched Sniper to alert-only (autoExecute === 0), return candidates without buying
  if (cfg.sniper_auto_execute === 0) {
    return { ok: true, scannedCount: candidates.length, boughtCount: 0, candidates };
  }

  // Max 1 snipe buy per tick so balance isn't drained simultaneously
  for (const pick of candidates) {
    const res = await executeSniperBuyForCandidate({ env, userId, cfg, pick });
    if (res.ok) {
      return { ok: true, scannedCount: candidates.length, boughtCount: 1, candidates };
    }
    if (res.reason === 'INSUFFICIENT_PAPER_BALANCE' || res.reason === 'BOT_BUDGET_CAP_REACHED' || res.reason === 'SNIPER_MAX_OPEN_POSITIONS_REACHED') {
      return { ok: false, scannedCount: candidates.length, boughtCount: 0, candidates, reason: res.reason };
    }
  }

  return { ok: true, scannedCount: candidates.length, boughtCount: 0, candidates };
}
