import type { Env } from '../env.js';

export type TradingAccountMode = 'PAPER' | 'LIVE';
export type PortfolioEngineMode = 'futures' | 'spot' | 'dex' | 'sniper' | 'copy';

export interface ModePortfolioBucket {
  mode: PortfolioEngineMode;
  labelFa: string;
  labelEn: string;
  openCount: number;
  pendingCount: number;
  closedCount: number;
  winsCount: number;
  lossesCount: number;
  winRatePct: number;
  lockedMarginUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  todayRealizedPnlUsd: number;
  netPnlUsd: number;
  totalVolumeUsd: number;
  // Equity attributed to this mode = locked margin + unrealized PnL (for open capital in this engine)
  activeEquityUsd: number;
}

export interface UnifiedPortfolioAccounting {
  tradingMode: TradingAccountMode;
  freeBalanceUsd: number;
  lockedMarginUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  todayRealizedPnlUsd: number;
  todayNetPnlUsd: number;
  totalEquityUsd: number;
  walletStartingUsd: number;
  allTimeReturnPct: number;
  openPositionsCount: number;
  pendingPositionsCount: number;
  closedTradesCount: number;
  winRatePct: number;
  botBudgetAllocatedUsd: number;
  botBudgetAvailableUsd: number;
  botBudgetMode: string;
  modes: Record<PortfolioEngineMode, ModePortfolioBucket>;
  modeList: ModePortfolioBucket[];
  reconciliationOk: boolean;
  reconciliationDiffUsd: number;
}

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function isPaperDexTradeRow(row: { tx_hash?: string | null; note?: string | null }): boolean {
  const tx = String(row.tx_hash || '').trim().toLowerCase();
  if (tx.startsWith('paper_') || tx.startsWith('sim_')) return true;
  if (!tx) {
    const note = String(row.note || '');
    if (/دمو|شبیه‌ساز|demo|paper/i.test(note)) return true;
  }
  return false;
}

export function isSniperDexTradeRow(row: { note?: string | null; dex_id?: string | null }): boolean {
  const note = String(row.note || '');
  const dex = String(row.dex_id || '');
  return /شکارچی|اسنایپر|sniper/i.test(note) || /sniper/i.test(dex);
}

export function isPaperCopyPositionRow(row: { execution_mode?: string | null; tx_hash?: string | null }): boolean {
  const mode = String(row.execution_mode || '').toUpperCase();
  const tx = String(row.tx_hash || '').trim().toLowerCase();
  if (tx.startsWith('paper_') || tx.startsWith('sim_')) return true;
  if (mode === 'PAPER_SIMULATOR') return true;
  return false;
}

function emptyBucket(mode: PortfolioEngineMode, labelFa: string, labelEn: string): ModePortfolioBucket {
  return {
    mode,
    labelFa,
    labelEn,
    openCount: 0,
    pendingCount: 0,
    closedCount: 0,
    winsCount: 0,
    lossesCount: 0,
    winRatePct: 0,
    lockedMarginUsd: 0,
    unrealizedPnlUsd: 0,
    realizedPnlUsd: 0,
    todayRealizedPnlUsd: 0,
    netPnlUsd: 0,
    totalVolumeUsd: 0,
    activeEquityUsd: 0,
  };
}

export async function computeUnifiedPortfolioAccounting(
  env: Env,
  userId: string,
  options: {
    tradingMode: TradingAccountMode;
    freeBalanceUsd: number;
    livePrices?: Record<string, number>;
    dexPrices?: Record<string, number>;
    botBudgetMode?: string;
    botBudgetUsd?: number;
    botBudgetPct?: number;
    walletStartingUsd?: number;
  }
): Promise<UnifiedPortfolioAccounting> {
  const tradingMode: TradingAccountMode = options.tradingMode === 'LIVE' ? 'LIVE' : 'PAPER';
  const livePrices = options.livePrices || {};
  const dexPrices = options.dexPrices || {};
  const todayIso = new Date().toISOString().slice(0, 10);

  const buckets: Record<PortfolioEngineMode, ModePortfolioBucket> = {
    futures: emptyBucket('futures', 'فیوچرز / Perp', 'Futures / Perp'),
    spot: emptyBucket('spot', 'اسپات (Spot)', 'Spot'),
    dex: emptyBucket('dex', 'توکن‌ها و سواپ DEX', 'DEX Token Swaps'),
    sniper: emptyBucket('sniper', 'اسنایپر میم‌کوین و لیستینگ', 'Listing & Meme Sniper'),
    copy: emptyBucket('copy', 'کپی‌ترید هوشمند', 'Smart Copy Trade'),
  };

  interface TradeLite {
    id: string;
    mode: string;
    symbol: string;
    direction: string;
    status: string;
    market_type: string | null;
    strategy_key: string | null;
    engine_label: string | null;
    entry_price: string;
    initial_quantity: string;
    remaining_quantity: string;
    margin_used: string;
    realized_pnl: string;
    closed_at: string | null;
  }

  interface DexTradeLite {
    id: string;
    chain_id: string;
    dex_id: string | null;
    token_address: string;
    amount_usd: number;
    entry_price_usd: number;
    exit_price_usd: number | null;
    tx_hash: string | null;
    status: string;
    realized_pnl_usd: number;
    note: string | null;
    closed_at: string | null;
  }

  interface CopyPosV2Lite {
    id: string;
    execution_mode: string;
    chain_id: string;
    token_address: string;
    margin_usd: number;
    entry_price_usd: number;
    current_price_usd: number;
    remaining_pct: number;
    direction: string;
    pnl_usd: number;
    status: string;
    tx_hash: string | null;
    closed_at: string | null;
  }

  interface PerpOrderLite {
    id: string;
    symbol: string;
    side: string;
    margin_usd: number;
    leverage: number;
    entry_price: number;
    status: string;
    execution_kind: string;
  }

  const [cexRes, dexRes, copyRes, perpRes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, mode, symbol, direction, status, market_type, strategy_key, engine_label,
              entry_price, initial_quantity, remaining_quantity, margin_used, realized_pnl, closed_at
       FROM trades WHERE user_id = ? AND mode = ?`
    )
      .bind(userId, tradingMode)
      .all<TradeLite>()
      .catch(() => ({ results: [] as TradeLite[] })),
    env.DB.prepare(
      `SELECT id, chain_id, dex_id, token_address, amount_usd, entry_price_usd, exit_price_usd,
              tx_hash, status, realized_pnl_usd, note, closed_at
       FROM dex_trades WHERE user_id = ?`
    )
      .bind(userId)
      .all<DexTradeLite>()
      .catch(() => ({ results: [] as DexTradeLite[] })),
    env.DB.prepare(
      `SELECT id, execution_mode, chain_id, token_address, margin_usd, entry_price_usd, current_price_usd,
              remaining_pct, direction, pnl_usd, status, tx_hash, closed_at
       FROM copy_positions_v2 WHERE user_id = ?`
    )
      .bind(userId)
      .all<CopyPosV2Lite>()
      .catch(() => ({ results: [] as CopyPosV2Lite[] })),
    tradingMode === 'LIVE'
      ? env.DB.prepare(
          `SELECT id, symbol, side, margin_usd, leverage, entry_price, status, execution_kind
           FROM perp_dex_orders WHERE user_id = ? AND status IN ('OPEN', 'FILLED')`
        )
          .bind(userId)
          .all<PerpOrderLite>()
          .catch(() => ({ results: [] as PerpOrderLite[] }))
      : Promise.resolve({ results: [] as PerpOrderLite[] }),
  ]);

  // 1) CEX / Simulator Trades -> classified into copy | spot | futures (strictly disjoint)
  for (const t of cexRes.results || []) {
    const isCopy =
      t.strategy_key === 'copy_trade' ||
      /کپی|copy/i.test(String(t.engine_label || ''));
    const modeKey: PortfolioEngineMode = isCopy
      ? 'copy'
      : String(t.market_type || '').toUpperCase() === 'SPOT'
        ? 'spot'
        : 'futures';
    const b = buckets[modeKey];
    const initQty = Math.max(1e-9, Number(t.initial_quantity || 0));
    const remQty = Math.max(0, Number(t.remaining_quantity || 0));
    const marginUsed = Math.max(0, Number(t.margin_used || 0));
    const entryPx = Math.max(0, Number(t.entry_price || 0));

    if (t.status === 'OPEN') {
      b.openCount += 1;
      const remMargin = marginUsed * Math.min(1, remQty / initQty);
      b.lockedMarginUsd += remMargin;
      b.totalVolumeUsd += marginUsed;
      const mark = Number(livePrices[t.symbol] || entryPx);
      if (entryPx > 0 && remQty > 0 && mark > 0) {
        const uPnl = t.direction === 'LONG' ? (mark - entryPx) * remQty : (entryPx - mark) * remQty;
        b.unrealizedPnlUsd += uPnl;
      }
      // Partial realized PnL recorded on still-open position
      b.realizedPnlUsd += Number(t.realized_pnl || 0);
    } else if (t.status === 'CLOSED') {
      b.closedCount += 1;
      const rPnl = Number(t.realized_pnl || 0);
      b.realizedPnlUsd += rPnl;
      b.totalVolumeUsd += marginUsed;
      if (rPnl > 0) b.winsCount += 1;
      else if (rPnl < 0) b.lossesCount += 1;
      if (t.closed_at && t.closed_at.slice(0, 10) === todayIso) {
        b.todayRealizedPnlUsd += rPnl;
      }
    }
  }

  // 2) Non-Custodial / Demo DEX & Sniper Trades -> classified into sniper | dex
  for (const d of dexRes.results || []) {
    const isPaperRow = isPaperDexTradeRow(d);
    if ((tradingMode === 'PAPER' && !isPaperRow) || (tradingMode === 'LIVE' && isPaperRow)) {
      continue;
    }
    const modeKey: PortfolioEngineMode = isSniperDexTradeRow(d) ? 'sniper' : 'dex';
    const b = buckets[modeKey];
    const amt = Math.max(0, Number(d.amount_usd || 0));

    if (d.status === 'PENDING_SIGN') {
      b.pendingCount += 1;
    } else if (d.status === 'OPEN') {
      b.openCount += 1;
      b.lockedMarginUsd += amt;
      b.totalVolumeUsd += amt;
      const key = `${String(d.chain_id || '').toLowerCase()}:${String(d.token_address || '').toLowerCase()}`;
      const rawKey = `${String(d.chain_id || '')}:${String(d.token_address || '')}`;
      const curPx = Number(dexPrices[key] ?? dexPrices[rawKey] ?? d.entry_price_usd ?? 0);
      if (d.entry_price_usd > 0 && curPx > 0) {
        const pct = (curPx - d.entry_price_usd) / d.entry_price_usd;
        b.unrealizedPnlUsd += amt * pct;
      }
    } else if (d.status === 'CLOSED') {
      b.closedCount += 1;
      const rPnl = Number(d.realized_pnl_usd || 0);
      b.realizedPnlUsd += rPnl;
      b.totalVolumeUsd += amt;
      if (rPnl > 0) b.winsCount += 1;
      else if (rPnl < 0) b.lossesCount += 1;
      if (d.closed_at && d.closed_at.slice(0, 10) === todayIso) {
        b.todayRealizedPnlUsd += rPnl;
      }
    }
  }

  // 3) Smart Copy V2 Positions -> classified into copy
  for (const cp of copyRes.results || []) {
    const isPaperRow = isPaperCopyPositionRow(cp);
    if ((tradingMode === 'PAPER' && !isPaperRow) || (tradingMode === 'LIVE' && isPaperRow)) {
      continue;
    }
    const b = buckets.copy;
    const margin = Math.max(0, Number(cp.margin_usd || 0));
    const remPct = Math.max(0, Math.min(100, Number(cp.remaining_pct ?? 100)));

    if (cp.status === 'PENDING_TRUST_SIGN') {
      b.pendingCount += 1;
    } else if (cp.status === 'OPEN') {
      b.openCount += 1;
      const remMargin = margin * (remPct / 100);
      b.lockedMarginUsd += remMargin;
      b.totalVolumeUsd += margin;
      const key = `${String(cp.chain_id || '').toLowerCase()}:${String(cp.token_address || '').toLowerCase()}`;
      const rawKey = `${String(cp.chain_id || '')}:${String(cp.token_address || '')}`;
      const curPx = Number(dexPrices[key] ?? dexPrices[rawKey] ?? cp.current_price_usd ?? cp.entry_price_usd ?? 0);
      if (cp.entry_price_usd > 0 && curPx > 0) {
        const rawPct = (curPx - cp.entry_price_usd) / cp.entry_price_usd;
        const signedPct = cp.direction === 'SHORT' ? -rawPct : rawPct;
        b.unrealizedPnlUsd += remMargin * signedPct;
      } else {
        b.unrealizedPnlUsd += Number(cp.pnl_usd || 0);
      }
    } else if (cp.status === 'CLOSED') {
      b.closedCount += 1;
      const rPnl = Number(cp.pnl_usd || 0);
      b.realizedPnlUsd += rPnl;
      b.totalVolumeUsd += margin;
      if (rPnl > 0) b.winsCount += 1;
      else if (rPnl < 0) b.lossesCount += 1;
      if (cp.closed_at && cp.closed_at.slice(0, 10) === todayIso) {
        b.todayRealizedPnlUsd += rPnl;
      }
    }
  }

  // 4) Non-custodial Perp DEX Orders (Hyperliquid/GMX/dYdX LIVE) -> rolled into futures if on-chain open/filled
  for (const po of perpRes.results || []) {
    if (po.execution_kind === 'HYPERLIQUID_AGENT_LIVE' || po.status === 'OPEN') {
      const b = buckets.futures;
      const m = Math.max(0, Number(po.margin_usd || 0));
      b.openCount += 1;
      b.lockedMarginUsd += m;
      b.totalVolumeUsd += m * Math.max(1, Number(po.leverage || 1));
      const mark = Number(livePrices[`${po.symbol}USDT`] || livePrices[po.symbol] || po.entry_price || 0);
      if (po.entry_price > 0 && mark > 0) {
        const dir = po.side === 'SHORT' ? -1 : 1;
        const pct = ((mark - po.entry_price) / po.entry_price) * dir * Math.max(1, Number(po.leverage || 1));
        b.unrealizedPnlUsd += m * pct;
      }
    }
  }

  // Finalize and round every bucket cleanly so sums match component display to the exact cent
  const modeOrder: PortfolioEngineMode[] = ['futures', 'spot', 'dex', 'sniper', 'copy'];
  const modeList: ModePortfolioBucket[] = [];

  let totalLockedCents = 0;
  let totalUnrealizedCents = 0;
  let totalRealizedCents = 0;
  let totalTodayRealizedCents = 0;
  let openPositionsCount = 0;
  let pendingPositionsCount = 0;
  let closedTradesCount = 0;
  let totalWins = 0;

  for (const key of modeOrder) {
    const b = buckets[key];
    b.lockedMarginUsd = round2(b.lockedMarginUsd);
    b.unrealizedPnlUsd = round2(b.unrealizedPnlUsd);
    b.realizedPnlUsd = round2(b.realizedPnlUsd);
    b.todayRealizedPnlUsd = round2(b.todayRealizedPnlUsd);
    b.netPnlUsd = round2(b.realizedPnlUsd + b.unrealizedPnlUsd);
    b.totalVolumeUsd = round2(b.totalVolumeUsd);
    b.activeEquityUsd = round2(b.lockedMarginUsd + b.unrealizedPnlUsd);
    const decided = b.winsCount + b.lossesCount;
    b.winRatePct = decided > 0 ? round2((b.winsCount / decided) * 100) : 0;

    totalLockedCents += Math.round(b.lockedMarginUsd * 100);
    totalUnrealizedCents += Math.round(b.unrealizedPnlUsd * 100);
    totalRealizedCents += Math.round(b.realizedPnlUsd * 100);
    totalTodayRealizedCents += Math.round(b.todayRealizedPnlUsd * 100);
    openPositionsCount += b.openCount;
    pendingPositionsCount += b.pendingCount;
    closedTradesCount += b.closedCount;
    totalWins += b.winsCount;

    modeList.push(b);
  }

  const freeBalanceUsd = round2(Math.max(0, options.freeBalanceUsd));
  const lockedMarginUsd = totalLockedCents / 100;
  const unrealizedPnlUsd = totalUnrealizedCents / 100;
  const realizedPnlUsd = totalRealizedCents / 100;
  const todayRealizedPnlUsd = totalTodayRealizedCents / 100;
  const todayNetPnlUsd = round2(todayRealizedPnlUsd + unrealizedPnlUsd);

  // Exact reconciled equity equation: Total Equity = Free Balance + Locked Margin + Unrealized PnL
  const totalEquityUsd = round2(freeBalanceUsd + lockedMarginUsd + unrealizedPnlUsd);
  const reconciliationDiffUsd = round2(totalEquityUsd - (freeBalanceUsd + lockedMarginUsd + unrealizedPnlUsd));

  // Bot Capital Budget aligned to the EXACT reconciled free/total equity
  const budgetMode = String(options.botBudgetMode || 'FULL_BALANCE').toUpperCase();
  const rawPct = Math.max(5, Math.min(100, Number(options.botBudgetPct || 100)));
  const rawUsd = Math.max(0, Number(options.botBudgetUsd || 0));

  let botBudgetAllocatedUsd = totalEquityUsd;
  if (budgetMode === 'FIXED_USD' && rawUsd > 0) {
    botBudgetAllocatedUsd = round2(Math.min(totalEquityUsd, rawUsd));
  } else if (budgetMode === 'PERCENT_OF_BALANCE') {
    botBudgetAllocatedUsd = round2(totalEquityUsd * (rawPct / 100));
  }
  const botBudgetAvailableUsd = round2(Math.max(0, Math.min(freeBalanceUsd, botBudgetAllocatedUsd - lockedMarginUsd)));

  const decidedTotal = modeList.reduce((s, m) => s + m.winsCount + m.lossesCount, 0);
  const winRatePct = decidedTotal > 0 ? round2((totalWins / decidedTotal) * 100) : 0;
  const startCap = round2(Math.max(0, options.walletStartingUsd || (tradingMode === 'PAPER' ? 10000 : 0)));
  const allTimeReturnPct = startCap > 0 ? round2(((totalEquityUsd - startCap) / startCap) * 100) : 0;

  return {
    tradingMode,
    freeBalanceUsd,
    lockedMarginUsd,
    unrealizedPnlUsd,
    realizedPnlUsd,
    todayRealizedPnlUsd,
    todayNetPnlUsd,
    totalEquityUsd,
    walletStartingUsd: startCap,
    allTimeReturnPct,
    openPositionsCount,
    pendingPositionsCount,
    closedTradesCount,
    winRatePct,
    botBudgetAllocatedUsd,
    botBudgetAvailableUsd,
    botBudgetMode: budgetMode,
    modes: buckets,
    modeList,
    reconciliationOk: Math.abs(reconciliationDiffUsd) < 0.005,
    reconciliationDiffUsd,
  };
}
