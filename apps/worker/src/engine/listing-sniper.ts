import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { fetchUltraFreshSniperPoolFeed, normalizeDexChainId, type DexTokenEnriched } from '../dex/screener.js';
import { executeLiveEvmVaultSwap, executeLiveSolanaVaultJupiterSwap } from '../dex/smart-copy.js';
import { checkLiveFeeEnforcement } from '../services/server-fee.js';
import { isPaperDexTradeRow, isSniperDexTradeRow } from '../services/portfolio-accounting.js';
import { publishSniperSignal } from '../telegram/publisher.js';
import { logAudit, notifyUserTelegram, pushNotification, resolveUserCapitalSummary, type UserBotConfigRow } from './executor.js';
import { checkPreTradeOnboardingGate } from './onboarding-gate.js';

export type SniperTargetType = 'BOTH' | 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME';

export interface SniperAdvancedFilters {
  maxPairAgeMinutes?: number;
  minPairAgeMinutes?: number;
  minMcapUsd?: number;
  maxMcapUsd?: number;
  minVolume5mUsd?: number;
  minVolume1hUsd?: number;
  minChange5mPct?: number;
  minChange1hPct?: number;
  minBuys5m?: number;
  minBuySellRatio?: number;
  requireSocials?: boolean;
  excludeHighRiskFlags?: boolean;
  dexFilter?: string;
  sortBy?: 'SCORE' | 'NEWEST' | 'MOMENTUM_5M' | 'VOLUME_1H' | 'LIQUIDITY' | 'SAFETY';
}

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
  volume5mUsd?: number;
  volume1hUsd?: number;
  volume24hUsd: number;
  buys5m?: number;
  sells5m?: number;
  buys1h: number;
  sells1h: number;
  buySellRatio1h?: number;
  ageHours: number | null;
  ageMinutes?: number | null;
  mcapUsd: number | null;
  hasSocials?: boolean;
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
        headers: { Accept: 'application/json', 'User-Agent': 'Dollarino/11.7' },
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
  maxPairAgeMinutes?: number;
  targetType?: SniperTargetType;
  advancedFilters?: SniperAdvancedFilters;
}): Promise<SniperCandidate[]> {
  const allowedChains = new Set(
    (options?.allowedChains?.length ? options.allowedChains : DEFAULT_SNIPER_CHAINS).map((c) => normalizeDexChainId(c))
  );
  const adv = options?.advancedFilters || {};
  const minSafety = Math.max(30, Math.min(98, options?.minSafetyScore ?? 68));
  const minLiquidity = Math.max(1000, options?.minLiquidityUsd ?? 15_000);
  const rawMaxMin =
    options?.maxPairAgeMinutes ??
    adv.maxPairAgeMinutes ??
    (options?.maxPairAgeHours !== undefined ? Math.round(options.maxPairAgeHours * 60) : 10080);
  const maxAgeMinutes = Math.max(1, Math.min(43200, rawMaxMin));
  const minAgeMinutes = Math.max(0, Number(adv.minPairAgeMinutes ?? 0));
  const targetType: SniperTargetType = options?.targetType || 'BOTH';

  const [cexNewSymbols, poolFeed] = await Promise.all([
    fetchBinanceRecentListingSymbols(),
    fetchUltraFreshSniperPoolFeed([...allowedChains]).catch(() => [] as DexTokenEnriched[]),
  ]);

  const cexSet = new Set(cexNewSymbols.map((s) => s.toUpperCase()));
  const candidates: SniperCandidate[] = [];
  const seen = new Set<string>();
  const nowMs = Date.now();

  for (const p of poolFeed) {
    const chain = normalizeDexChainId(p.chainId || '');
    if (!allowedChains.has(chain)) continue;

    const sym = (p.baseToken?.symbol || '').toUpperCase().trim();
    if (!sym || ['USDT', 'USDC', 'WETH', 'WBNB', 'SOL', 'WBTC', 'DAI', 'WSOL'].includes(sym)) continue;

    const liq = Number(p.liquidity?.usd || 0);
    const px = Number(p.priceUsd || 0);
    const ch5m = Number(p.priceChange?.m5 || 0);
    const ch1h = Number(p.priceChange?.h1 || 0);
    const ch24h = Number(p.priceChange?.h24 || 0);
    const vol5m = Number(p.volume?.m5 || 0);
    const vol1h = Number(p.volume?.h1 || 0);
    const vol24h = Number(p.volume?.h24 || 0);
    const buys5m = Number(p.txns?.m5?.buys || 0);
    const sells5m = Number(p.txns?.m5?.sells || 0);
    const buys1h = Number(p.txns?.h1?.buys || buys5m);
    const sells1h = Number(p.txns?.h1?.sells || sells5m);
    const mcapUsd = typeof p.marketCap === 'number' ? p.marketCap : typeof p.fdv === 'number' ? p.fdv : null;
    const hasSocials = Boolean((p.info?.websites?.length || 0) > 0 || (p.info?.socials?.length || 0) > 0);
    const buySellRatio1h = sells1h > 0 ? Number((buys1h / sells1h).toFixed(2)) : buys1h > 0 ? 5 : 1;

    if (!Number.isFinite(px) || px <= 0 || liq < minLiquidity) continue;
    if (p.safetyScore < minSafety) continue;

    const minRatio = Number(adv.minBuySellRatio ?? 0.65);
    if (buys1h + buys5m < 1 || buySellRatio1h < minRatio) continue;

    const ageMinutes =
      typeof p.pairCreatedAt === 'number' && Number.isFinite(p.pairCreatedAt) && p.pairCreatedAt > 0
        ? Math.max(0.5, Number(((nowMs - p.pairCreatedAt) / 60_000).toFixed(1)))
        : null;
    const ageHours = ageMinutes !== null ? Number((ageMinutes / 60).toFixed(2)) : null;

    if (maxAgeMinutes <= 60 && ageMinutes === null) {
      // Only enforce strict exclusion of unknown-timestamp pairs when user asks for <=1h ultra-fresh launches
      continue;
    }
    if (ageMinutes !== null) {
      if (ageMinutes > maxAgeMinutes) continue;
      if (minAgeMinutes > 0 && ageMinutes < minAgeMinutes) continue;
    }

    if (adv.minMcapUsd && (mcapUsd === null || mcapUsd < adv.minMcapUsd)) continue;
    if (adv.maxMcapUsd && mcapUsd !== null && mcapUsd > adv.maxMcapUsd) continue;
    if (adv.minVolume5mUsd && vol5m < adv.minVolume5mUsd) continue;
    if (adv.minVolume1hUsd && vol1h < adv.minVolume1hUsd) continue;
    if (adv.minChange5mPct !== undefined && ch5m < adv.minChange5mPct) continue;
    if (adv.minChange1hPct !== undefined && ch1h < adv.minChange1hPct) continue;
    if (adv.minBuys5m && buys5m < adv.minBuys5m) continue;
    if (adv.requireSocials && !hasSocials) continue;
    if (adv.excludeHighRiskFlags && (p.riskFlags || []).some((rf) => /honeypot|rug|freeze|mint/i.test(rf))) continue;

    if (adv.dexFilter && adv.dexFilter !== 'ALL') {
      const dl = (p.dexId || '').toLowerCase();
      if (adv.dexFilter === 'PUMP_RAYDIUM' && !/(pump|raydium|orca|meteora)/.test(dl)) continue;
      if (adv.dexFilter === 'PANCAKE' && !dl.includes('pancake')) continue;
      if (adv.dexFilter === 'UNISWAP' && !dl.includes('uniswap')) continue;
      if (adv.dexFilter === 'AERODROME' && !dl.includes('aerodrome')) continue;
      if (adv.dexFilter === 'STONFI_SUN' && !/(ston|dedust|sunswap)/.test(dl)) continue;
    }

    const isCexListed = p.isOnCentralizedHint || cexSet.has(sym);
    const source: 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME' = isCexListed ? 'CEX_NEW_LISTING' : 'DEX_BOOM_MEME';

    if (targetType === 'CEX_NEW_LISTING' && source !== 'CEX_NEW_LISTING') continue;
    if (targetType === 'DEX_BOOM_MEME' && source !== 'DEX_BOOM_MEME') continue;

    const isUltraFresh = maxAgeMinutes <= 60;
    const hasMomentum = isUltraFresh ? buys5m >= 2 || ch5m >= -2 || isCexListed : ch1h >= 2 || ch5m >= 1 || buys5m >= 3 || isCexListed;
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
      volume5mUsd: vol5m,
      volume1hUsd: vol1h,
      volume24hUsd: vol24h,
      buys5m,
      sells5m,
      buys1h,
      sells1h,
      buySellRatio1h,
      ageHours,
      ageMinutes,
      mcapUsd,
      hasSocials,
      imageUrl: p.info?.imageUrl || null,
      isOnCentralizedHint: isCexListed,
      riskFlags: p.riskFlags || [],
      trustWalletSwapUrl: p.trustWallet.trustWalletDappUrl,
      dexScreenerUrl: p.trustWallet.dexScreenerUrl,
    });
  }

  const sortBy = adv.sortBy || (maxAgeMinutes <= 30 ? 'NEWEST' : 'SCORE');
  candidates.sort((a, b) => {
    if (sortBy === 'NEWEST') {
      const aAge = a.ageMinutes ?? 999999;
      const bAge = b.ageMinutes ?? 999999;
      return aAge - bAge;
    }
    if (sortBy === 'MOMENTUM_5M') return b.change5mPct - a.change5mPct;
    if (sortBy === 'VOLUME_1H') return (b.volume1hUsd ?? 0) - (a.volume1hUsd ?? 0);
    if (sortBy === 'LIQUIDITY') return b.liquidityUsd - a.liquidityUsd;
    if (sortBy === 'SAFETY') return b.safetyScore - a.safetyScore;
    const freshnessBoostA = (a.ageMinutes !== null && a.ageMinutes !== undefined && a.ageMinutes <= 15) ? 20 : (a.ageMinutes !== null && a.ageMinutes !== undefined && a.ageMinutes <= 60) ? 12 : 0;
    const freshnessBoostB = (b.ageMinutes !== null && b.ageMinutes !== undefined && b.ageMinutes <= 15) ? 20 : (b.ageMinutes !== null && b.ageMinutes !== undefined && b.ageMinutes <= 60) ? 12 : 0;
    const ratioBoostA = Math.min(14, Math.max(-8, ((a.buySellRatio1h ?? 1) - 1) * 10));
    const ratioBoostB = Math.min(14, Math.max(-8, ((b.buySellRatio1h ?? 1) - 1) * 10));
    const turnoverA = a.liquidityUsd > 0 ? Math.min(15, ((a.volume1hUsd ?? 0) / a.liquidityUsd) * 6) : 0;
    const turnoverB = b.liquidityUsd > 0 ? Math.min(15, ((b.volume1hUsd ?? 0) / b.liquidityUsd) * 6) : 0;
    const aScore = (a.source === 'CEX_NEW_LISTING' ? 22 : 0) + a.safetyScore + freshnessBoostA + ratioBoostA + turnoverA + Math.min(28, Math.max(-10, a.change1hPct * 0.4 + a.change5mPct));
    const bScore = (b.source === 'CEX_NEW_LISTING' ? 22 : 0) + b.safetyScore + freshnessBoostB + ratioBoostB + turnoverB + Math.min(28, Math.max(-10, b.change1hPct * 0.4 + b.change5mPct));
    return bScore - aScore;
  });

  return candidates.slice(0, 32);
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

  const maxOpenSniper = Math.max(1, Math.min(50, Number(cfg.sniper_max_open_positions ?? 5)));
  const openDexRows = await env.DB.prepare(
    `SELECT tx_hash, note, dex_id FROM dex_trades WHERE user_id = ? AND status = 'OPEN'`
  )
    .bind(userId)
    .all<{ tx_hash: string | null; note: string | null; dex_id: string | null }>()
    .catch(() => ({ results: [] as Array<{ tx_hash: string | null; note: string | null; dex_id: string | null }> }));
  const isPaperMode = cfg.trading_mode !== 'LIVE';
  const openSniperCount = (openDexRows.results || []).filter(
    (r) => isSniperDexTradeRow(r) && isPaperDexTradeRow(r) === isPaperMode
  ).length;
  if (openSniperCount >= maxOpenSniper) {
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
    await publishSniperSignal(env, {
      userId,
      symbol: pick.symbol,
      name: pick.name,
      chainId: pick.chainId,
      dexId: pick.dexId,
      source: pick.source,
      tokenAddress: pick.tokenAddress,
      priceUsd: pick.priceUsd,
      tpUsd: tp1Usd,
      slUsd,
      tpPct,
      slPct,
      safetyScore: pick.safetyScore,
      liquidityUsd: pick.liquidityUsd,
      mcapUsd: pick.mcapUsd,
      ageMinutes: pick.ageMinutes,
      change5mPct: pick.change5mPct,
      change1hPct: pick.change1hPct,
      buySellRatio1h: pick.buySellRatio1h,
      modeLabel: 'حساب دمو',
      trustWalletSwapUrl: pick.trustWalletSwapUrl,
    }).catch(() => {});

    return { ok: true, tradeId };
  }

  // LIVE mode: when trade_execution_mode === 'AUTO', attempt genuine on-chain execution via user's funded 24/7 Copy-Vault first!
  const slippagePct = Math.max(1, Math.min(35, Number(cfg.sniper_slippage_pct ?? 12)));
  if (cfg.trade_execution_mode === 'AUTO') {
    let vaultExec: { executedOnchain: boolean; txHash: string | null; note: string } = {
      executedOnchain: false,
      txHash: null,
      note: '',
    };
    if (pick.chainId === 'solana') {
      vaultExec = await executeLiveSolanaVaultJupiterSwap(
        env,
        userId,
        pick.tokenAddress,
        budgetUsd,
        Math.round(slippagePct * 100)
      ).catch(() => ({ executedOnchain: false, txHash: null, note: '' }));
    } else if (['bsc', 'base', 'ethereum', 'arbitrum'].includes(pick.chainId)) {
      vaultExec = await executeLiveEvmVaultSwap(
        env,
        userId,
        pick.chainId,
        pick.tokenAddress,
        budgetUsd,
        slippagePct
      ).catch(() => ({ executedOnchain: false, txHash: null, note: '' }));
    }

    if (vaultExec.executedOnchain && vaultExec.txHash) {
      const tradeId = randomId('dtr');
      await env.DB.prepare(
        `INSERT INTO dex_trades (id, user_id, chain_id, dex_id, pair_address, token_address, token_symbol, quote_symbol, direction, amount_usd, token_qty, entry_price_usd, stop_loss_usd, tp1_usd, tx_hash, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'USDT', 'BUY', ?, ?, ?, ?, ?, ?, 'OPEN', ?)`
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
          vaultExec.txHash,
          `[شکارچی واقعی ۲۴/۷ آن‌چین] ${vaultExec.note}`
        )
        .run();

      await logAudit(
        env.DB,
        userId,
        'ORDER',
        'INFO',
        `🎯 شکارچی واقعی آن‌چین: خرید $${budgetUsd} از ${pick.symbol} (${pick.chainId.toUpperCase()} · TX: ${vaultExec.txHash})`,
        pick.symbol
      );
      await pushNotification(
        env.DB,
        userId,
        'TRADE',
        `⚡ خرید خودکار واقعی ${pick.symbol} ($${budgetUsd})`,
        `${vaultExec.note} · TX: ${vaultExec.txHash.slice(0, 14)}...`
      );
      await publishSniperSignal(env, {
        userId,
        symbol: pick.symbol,
        name: pick.name,
        chainId: pick.chainId,
        dexId: pick.dexId,
        source: pick.source,
        tokenAddress: pick.tokenAddress,
        priceUsd: pick.priceUsd,
        tpUsd: tp1Usd,
        slUsd,
        tpPct,
        slPct,
        safetyScore: pick.safetyScore,
        liquidityUsd: pick.liquidityUsd,
        mcapUsd: pick.mcapUsd,
        ageMinutes: pick.ageMinutes,
        change5mPct: pick.change5mPct,
        change1hPct: pick.change1hPct,
        buySellRatio1h: pick.buySellRatio1h,
        slippagePct,
        modeLabel: `خرید آن‌چین واقعی (TX: ${vaultExec.txHash.slice(0, 10)}...)`,
        trustWalletSwapUrl: pick.trustWalletSwapUrl,
      }).catch(() => {});

      return { ok: true, tradeId };
    }
  }

  // Fallback for MANUAL_CONFIRM or unfunded Copy-Vault: create PENDING_SIGN entry & deliver 1-tap Trust Wallet swap link
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
  await publishSniperSignal(env, {
    userId,
    symbol: pick.symbol,
    name: pick.name,
    chainId: pick.chainId,
    dexId: pick.dexId,
    source: pick.source,
    tokenAddress: pick.tokenAddress,
    priceUsd: pick.priceUsd,
    tpUsd: tp1Usd,
    slUsd,
    tpPct,
    slPct,
    safetyScore: pick.safetyScore,
    liquidityUsd: pick.liquidityUsd,
    mcapUsd: pick.mcapUsd,
    ageMinutes: pick.ageMinutes,
    change5mPct: pick.change5mPct,
    change1hPct: pick.change1hPct,
    buySellRatio1h: pick.buySellRatio1h,
    slippagePct,
    modeLabel: 'آماده امضا در Trust Wallet',
    trustWalletSwapUrl: pick.trustWalletSwapUrl,
  }).catch(() => {});

  return { ok: true, tradeId, trustWalletSwapUrl: pick.trustWalletSwapUrl };
}

export async function runNewListingAndMemeSniperForUser(
  env: Env,
  userId: string,
  cfg: UserBotConfigRow,
  options?: { forceExecute?: boolean }
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
        const cleaned = Array.from(new Set(parsed.map((c) => normalizeDexChainId(String(c))))).filter(Boolean);
        if (cleaned.length > 0) allowedChains = cleaned;
      }
    }
  } catch {
    allowedChains = DEFAULT_SNIPER_CHAINS;
  }

  const minSafetyScore = Math.max(30, Math.min(98, Number(cfg.sniper_min_safety_score ?? 70)));
  const minLiquidityUsd = Math.max(1000, Math.min(10_000_000, Number(cfg.sniper_min_liquidity_usd ?? 15_000)));
  let advancedFilters: Record<string, unknown> = {};
  try {
    if (cfg.sniper_advanced_filters_json) advancedFilters = JSON.parse(cfg.sniper_advanced_filters_json);
  } catch { /* ignore */ }
  const maxPairAgeHours = Math.max(0.05, Math.min(720, Number(cfg.sniper_max_pair_age_hours ?? 168)));
  const maxPairAgeMinutes = Math.max(
    1,
    Math.min(43200, Number(cfg.sniper_max_pair_age_minutes ?? Math.round(maxPairAgeHours * 60)))
  );
  const targetType: SniperTargetType =
    cfg.sniper_target_type === 'CEX_NEW_LISTING' || cfg.sniper_target_type === 'DEX_BOOM_MEME'
      ? cfg.sniper_target_type
      : 'BOTH';

  const candidates = await discoverListingAndBoomCandidates({
    allowedChains,
    minSafetyScore,
    minLiquidityUsd,
    maxPairAgeHours,
    maxPairAgeMinutes,
    targetType,
    advancedFilters,
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

  // If user switched Sniper to alert-only (autoExecute === 0), return candidates without buying unless explicitly triggered via scan-now execute
  if (cfg.sniper_auto_execute === 0 && !options?.forceExecute) {
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
