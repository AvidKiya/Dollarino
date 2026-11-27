import { runBacktest, type StrategyKey } from '@dollarino/core';
import type { Env } from '../env.js';
import { fetchPublicKlines } from '../exchanges/paper.js';
import { hmacSha256Hex } from '../crypto.js';
import { buildVerifiedCardCanonicalPayload } from '../routes/trading.js';
import { fetchTrustWalletLivePortfolio } from './trustwallet-universe.js';

export interface PublicStrategyBacktestItem {
  strategyKey: StrategyKey;
  titleFa: string;
  titleEn: string;
  symbol: string;
  timeframe: string;
  candlesCount: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  profitFactor: number;
  netReturnUsd: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  sharpeEstimate: number;
  equityPoints: number[];
  computedAt: string;
}

export interface PublicChannelSignalPreview {
  id: string;
  symbol: string;
  direction: string;
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  status: string;
  engineSource: string;
  engineLabel: string;
  summary: string;
  closedCardId: string | null;
  createdAt: string;
}

export interface PublicWallet30dAuditRow {
  auditId: string;
  walletAddress: string;
  walletMasked: string;
  chain: 'EVM' | 'SOLANA' | 'TON' | 'TRON' | 'SIMULATOR';
  explorerUrl: string | null;
  mode: 'LIVE' | 'PAPER';
  tradesCount30d: number;
  wins30d: number;
  losses30d: number;
  winRate30d: number;
  netPnlUsd30d: number;
  totalMargin30d: number;
  roiPct30d: number;
  bestSymbol: string;
  equityPoints: number[];
  lastTradeAt: string;
}

export interface PublicVerifiedCardPreview {
  id: string;
  mode: 'LIVE' | 'PAPER';
  period: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  strategyName: string;
  symbol: string | null;
  issuedAt: string;
}

export interface PublicLiveProofPayload {
  ok: true;
  generatedAt: string;
  platformStats: {
    totalSignals: number;
    tpHitSignals: number;
    signalHitRatePct: number;
    closedTrades30d: number;
    liveClosedTrades30d: number;
    paperClosedTrades30d: number;
    liveWinRate30dPct: number;
    paperWinRate30dPct: number;
    verifiedCardsCount: number;
    connectedWalletsCount: number;
  };
  liveStrategyBacktests: PublicStrategyBacktestItem[];
  channelSignals: PublicChannelSignalPreview[];
  verifiedCards: PublicVerifiedCardPreview[];
  wallet30dLedger: PublicWallet30dAuditRow[];
}

export function maskWalletAddress(addr: string): string {
  const s = (addr || '').trim();
  if (!s) return '—';
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function detectWalletChainAndExplorer(u: {
  evm?: string | null;
  solana?: string | null;
  ton?: string | null;
  tron?: string | null;
}): {
  address: string;
  chain: 'EVM' | 'SOLANA' | 'TON' | 'TRON' | 'SIMULATOR';
  explorerUrl: string | null;
} {
  if (u.evm && /^0x[a-fA-F0-9]{40}$/.test(u.evm.trim())) {
    const a = u.evm.trim();
    return { address: a, chain: 'EVM', explorerUrl: `https://etherscan.io/address/${a}` };
  }
  if (u.solana && u.solana.trim().length >= 32) {
    const a = u.solana.trim();
    return { address: a, chain: 'SOLANA', explorerUrl: `https://solscan.io/account/${a}` };
  }
  if (u.ton && u.ton.trim().length >= 32) {
    const a = u.ton.trim();
    return { address: a, chain: 'TON', explorerUrl: `https://tonviewer.com/${a}` };
  }
  if (u.tron && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(u.tron.trim())) {
    const a = u.tron.trim();
    return { address: a, chain: 'TRON', explorerUrl: `https://tronscan.org/#/address/${a}` };
  }
  return { address: '', chain: 'SIMULATOR', explorerUrl: null };
}

let BACKTEST_MEM_CACHE: { ts: number; items: PublicStrategyBacktestItem[] } | null = null;

async function computeLiveStrategyBacktests(env: Env): Promise<PublicStrategyBacktestItem[]> {
  if (BACKTEST_MEM_CACHE && Date.now() - BACKTEST_MEM_CACHE.ts < 300_000) {
    return BACKTEST_MEM_CACHE.items;
  }

  const proxyCfg = env.TOOBIT_PROXY_URL
    ? { proxyUrl: env.TOOBIT_PROXY_URL, proxySecret: env.EXCHANGE_PROXY_SECRET }
    : undefined;

  const presets: Array<{
    strategyKey: StrategyKey;
    titleFa: string;
    titleEn: string;
    symbol: string;
    timeframe: '15m' | '1h';
  }> = [
    {
      strategyKey: 'dollarino_v01',
      titleFa: 'استراتژی دُرنا V1 (روند + اسمارت مانی)',
      titleEn: 'Dorna V1 (Trend + SMC)',
      symbol: 'BTCUSDT',
      timeframe: '15m',
    },
    {
      strategyKey: 'kbos_v11',
      titleFa: 'الگوریتم KBOS پرو (شکست ساختار و حجم)',
      titleEn: 'KBOS V11 Pro (BOS + Liquidity)',
      symbol: 'ETHUSDT',
      timeframe: '15m',
    },
    {
      strategyKey: 'sp2l',
      titleFa: 'شکار نقدینگی SP2L (نوسان‌گیری تاییدشده)',
      titleEn: 'SP2L Liquidity Hunter',
      symbol: 'SOLUSDT',
      timeframe: '1h',
    },
  ];

  const items: PublicStrategyBacktestItem[] = [];
  await Promise.all(
    presets.map(async (p) => {
      try {
        const candles = await fetchPublicKlines(p.symbol, p.timeframe, 260, proxyCfg);
        if (!Array.isArray(candles) || candles.length < 60) return;
        const bt = runBacktest(candles, [], {
          symbol: p.symbol,
          strategyKey: p.strategyKey,
          timeframe: p.timeframe,
          initialBalance: 10_000,
          marginPct: 10,
          leverage: 5,
          tp1ClosePct: 40,
          tp2ClosePct: 30,
          tp3ClosePct: 30,
          autoBreakevenOnTp1: true,
          moveSlToTp1OnTp2: true,
        });
        const eq = (bt.equityCurve || []).map((pt) => Number(pt.equity));
        const sampledEq =
          eq.length <= 24
            ? eq
            : Array.from({ length: 24 }, (_, idx) => {
                const pos = Math.round((idx / 23) * (eq.length - 1));
                return Number((eq[pos] ?? 10000).toFixed(2));
              });
        items.push({
          strategyKey: p.strategyKey,
          titleFa: p.titleFa,
          titleEn: p.titleEn,
          symbol: p.symbol,
          timeframe: p.timeframe,
          candlesCount: candles.length,
          totalTrades: bt.metrics.totalTrades,
          winCount: bt.metrics.winCount,
          lossCount: bt.metrics.lossCount,
          winRatePct: Number(bt.metrics.winRatePct.toFixed(1)),
          profitFactor: Number(Math.min(bt.metrics.profitFactor, 9.99).toFixed(2)),
          netReturnUsd: Number(bt.metrics.netReturnUsd.toFixed(2)),
          netReturnPct: Number(bt.metrics.netReturnPct.toFixed(2)),
          maxDrawdownPct: Number(bt.metrics.maxDrawdownPct.toFixed(2)),
          sharpeEstimate: Number(bt.metrics.sharpeEstimate.toFixed(2)),
          equityPoints: sampledEq.length >= 2 ? sampledEq : [10000, Number(bt.metrics.finalEquity.toFixed(2))],
          computedAt: new Date().toISOString(),
        });
      } catch {
        // Offline/test environments skip network backtest gracefully
      }
    })
  );

  if (items.length > 0) {
    BACKTEST_MEM_CACHE = { ts: Date.now(), items };
  }
  return items;
}

export async function buildPublicLiveProof(db: D1Database, env: Env): Promise<PublicLiveProofPayload> {
  const [
    liveStrategyBacktests,
    sigStatsRow,
    tradeStatsRows,
    cardsCountRow,
    walletsCountRow,
    recentSignalsRows,
    recentCardsRows,
    recentClosedTradesRows,
  ] = await Promise.all([
    computeLiveStrategyBacktests(env),
    db
      .prepare(
        `SELECT COUNT(*) AS total_signals,
                SUM(CASE WHEN tp1_hit = 1 OR tp2_hit = 1 OR tp3_hit = 1 THEN 1 ELSE 0 END) AS tp_hits,
                SUM(CASE WHEN tp1_hit = 1 OR tp2_hit = 1 OR tp3_hit = 1 OR status IN ('EXECUTED', 'CLOSED', 'SL_HIT') THEN 1 ELSE 0 END) AS resolved_cnt
         FROM signals`
      )
      .first<{ total_signals: number; tp_hits: number | null; resolved_cnt: number | null }>()
      .catch(() => null),
    db
      .prepare(
        `SELECT mode,
                COUNT(*) AS cnt,
                SUM(CASE WHEN CAST(realized_pnl AS REAL) > 0 THEN 1 ELSE 0 END) AS wins
         FROM trades
         WHERE status = 'CLOSED'
           AND COALESCE(closed_at, opened_at) >= datetime('now', '-30 days')
         GROUP BY mode`
      )
      .all<{ mode: string; cnt: number; wins: number | null }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM verified_profit_cards WHERE COALESCE(revoked, 0) = 0`)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM users
         WHERE COALESCE(is_blocked, 0) = 0
           AND (
             LENGTH(COALESCE(trust_wallet_address, '')) > 10
             OR LENGTH(COALESCE(trust_wallet_solana, '')) > 10
             OR LENGTH(COALESCE(trust_wallet_ton, '')) > 10
             OR LENGTH(COALESCE(trust_wallet_tron, '')) > 10
           )`
      )
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
    db
      .prepare(
        `SELECT id, symbol, direction, timeframe, price, stop_loss, tp1, tp2, tp3,
                tp1_hit, tp2_hit, tp3_hit, status, engine_source, engine_label,
                raw_text, closed_card_id, created_at
         FROM signals
         ORDER BY created_at DESC
         LIMIT 8`
      )
      .all<{
        id: string;
        symbol: string;
        direction: string;
        timeframe: string;
        price: string;
        stop_loss: string;
        tp1: string;
        tp2: string | null;
        tp3: string | null;
        tp1_hit: number;
        tp2_hit: number;
        tp3_hit: number;
        status: string;
        engine_source: string | null;
        engine_label: string | null;
        raw_text: string | null;
        closed_card_id: string | null;
        created_at: string;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT id, mode, period, trades_count, win_rate, net_pnl_usd, roi_pct, profit_factor, strategy_name, payload_json, issued_at
         FROM verified_profit_cards
         WHERE COALESCE(revoked, 0) = 0
         ORDER BY issued_at DESC
         LIMIT 6`
      )
      .all<{
        id: string;
        mode: string;
        period: string;
        trades_count: number;
        win_rate: number;
        net_pnl_usd: number;
        roi_pct: number;
        profit_factor: number;
        strategy_name: string;
        payload_json: string | null;
        issued_at: string;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT t.user_id, t.mode, t.symbol, t.realized_pnl, t.margin_used, COALESCE(t.closed_at, t.opened_at) AS ts,
                u.trust_wallet_address, u.trust_wallet_solana, u.trust_wallet_ton, u.trust_wallet_tron
         FROM trades t
         JOIN users u ON u.id = t.user_id
         WHERE t.status = 'CLOSED'
           AND COALESCE(u.is_blocked, 0) = 0
           AND COALESCE(t.closed_at, t.opened_at) >= datetime('now', '-30 days')
         ORDER BY ts ASC
         LIMIT 600`
      )
      .all<{
        user_id: string;
        mode: string;
        symbol: string;
        realized_pnl: string;
        margin_used: string;
        ts: string;
        trust_wallet_address: string | null;
        trust_wallet_solana: string | null;
        trust_wallet_ton: string | null;
        trust_wallet_tron: string | null;
      }>()
      .catch(() => ({ results: [] })),
  ]);

  let liveClosedTrades30d = 0;
  let liveWins30d = 0;
  let paperClosedTrades30d = 0;
  let paperWins30d = 0;
  for (const row of tradeStatsRows.results || []) {
    const cnt = Number(row.cnt || 0);
    const w = Number(row.wins || 0);
    if (String(row.mode).toUpperCase() === 'LIVE') {
      liveClosedTrades30d += cnt;
      liveWins30d += w;
    } else {
      paperClosedTrades30d += cnt;
      paperWins30d += w;
    }
  }

  const totalSignals = Number(sigStatsRow?.total_signals || 0);
  const tpHitSignals = Number(sigStatsRow?.tp_hits || 0);
  const resolvedSignals = Number(sigStatsRow?.resolved_cnt || 0);

  const channelSignals: PublicChannelSignalPreview[] = (recentSignalsRows.results || []).map((s) => ({
    id: s.id,
    symbol: s.symbol,
    direction: s.direction,
    timeframe: s.timeframe || '15m',
    entryPrice: Number(s.price || 0),
    stopLoss: Number(s.stop_loss || 0),
    tp1: Number(s.tp1 || 0),
    tp2: Number(s.tp2 || 0),
    tp3: Number(s.tp3 || 0),
    tp1Hit: Number(s.tp1_hit || 0) === 1,
    tp2Hit: Number(s.tp2_hit || 0) === 1,
    tp3Hit: Number(s.tp3_hit || 0) === 1,
    status: s.status || 'OPEN',
    engineSource: s.engine_source || 'CENTRAL_AI',
    engineLabel: s.engine_label || 'Dollarino AI',
    summary: String(s.raw_text || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    closedCardId: s.closed_card_id || null,
    createdAt: s.created_at,
  }));

  const verifiedCards: PublicVerifiedCardPreview[] = (recentCardsRows.results || []).map((vc) => {
    let symbol: string | null = null;
    try {
      const parsed = JSON.parse(vc.payload_json || '{}') as Record<string, unknown>;
      if (typeof parsed.symbol === 'string') symbol = parsed.symbol;
      else if (typeof parsed.bestSymbol === 'string') symbol = parsed.bestSymbol;
    } catch {
      symbol = null;
    }
    return {
      id: vc.id,
      mode: String(vc.mode).toUpperCase() === 'LIVE' ? 'LIVE' : 'PAPER',
      period: vc.period,
      tradesCount: Number(vc.trades_count || 0),
      winRate: Number(vc.win_rate || 0),
      netPnlUsd: Number(vc.net_pnl_usd || 0),
      roiPct: Number(vc.roi_pct || 0),
      profitFactor: Number(vc.profit_factor || 0),
      strategyName: vc.strategy_name || 'Dollarino AI',
      symbol,
      issuedAt: vc.issued_at,
    };
  });

  // Aggregate real 30-day per-wallet/account digital summary
  const byWalletGroup = new Map<
    string,
    {
      userId: string;
      mode: 'LIVE' | 'PAPER';
      evm: string | null;
      solana: string | null;
      ton: string | null;
      tron: string | null;
      tradesCount: number;
      wins: number;
      losses: number;
      netPnl: number;
      totalMargin: number;
      bestSymbol: string;
      bestSymPnl: number;
      lastTradeAt: string;
      eq: number[];
    }
  >();

  for (const t of recentClosedTradesRows.results || []) {
    const mode: 'LIVE' | 'PAPER' = String(t.mode).toUpperCase() === 'LIVE' ? 'LIVE' : 'PAPER';
    const key = `${t.user_id}::${mode}`;
    let g = byWalletGroup.get(key);
    if (!g) {
      g = {
        userId: t.user_id,
        mode,
        evm: t.trust_wallet_address,
        solana: t.trust_wallet_solana,
        ton: t.trust_wallet_ton,
        tron: t.trust_wallet_tron,
        tradesCount: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
        totalMargin: 0,
        bestSymbol: t.symbol,
        bestSymPnl: -Infinity,
        lastTradeAt: t.ts,
        eq: [0],
      };
      byWalletGroup.set(key, g);
    }
    const pnl = Number(t.realized_pnl || 0);
    const margin = Math.max(0, Number(t.margin_used || 0));
    g.tradesCount += 1;
    if (pnl > 0) g.wins += 1;
    else if (pnl < 0) g.losses += 1;
    g.netPnl += pnl;
    g.totalMargin += margin;
    if (pnl > g.bestSymPnl) {
      g.bestSymPnl = pnl;
      g.bestSymbol = t.symbol;
    }
    if (t.ts > g.lastTradeAt) g.lastTradeAt = t.ts;
    g.eq.push(Number(g.netPnl.toFixed(2)));
  }

  const wallet30dLedger: PublicWallet30dAuditRow[] = Array.from(byWalletGroup.values())
    .map((g) => {
      const chainInfo = detectWalletChainAndExplorer({
        evm: g.evm,
        solana: g.solana,
        ton: g.ton,
        tron: g.tron,
      });
      const suffix = g.userId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'TRADER';
      const auditId = `AUD-${suffix}-${g.mode === 'LIVE' ? 'LIVE' : 'DEMO'}`;
      const displayAddress = chainInfo.address || auditId;
      const roiPct = g.totalMargin > 0 ? (g.netPnl / g.totalMargin) * 100 : 0;
      const winRate = g.tradesCount > 0 ? (g.wins / g.tradesCount) * 100 : 0;
      return {
        auditId,
        walletAddress: displayAddress,
        walletMasked: chainInfo.address ? maskWalletAddress(chainInfo.address) : auditId,
        chain: chainInfo.chain,
        explorerUrl: chainInfo.explorerUrl,
        mode: g.mode,
        tradesCount30d: g.tradesCount,
        wins30d: g.wins,
        losses30d: g.losses,
        winRate30d: Number(winRate.toFixed(1)),
        netPnlUsd30d: Number(g.netPnl.toFixed(2)),
        totalMargin30d: Number(g.totalMargin.toFixed(2)),
        roiPct30d: Number(roiPct.toFixed(2)),
        bestSymbol: g.bestSymbol || 'BTCUSDT',
        equityPoints: g.eq.slice(-18),
        lastTradeAt: g.lastTradeAt,
      };
    })
    .sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === 'LIVE' ? -1 : 1;
      return b.netPnlUsd30d - a.netPnlUsd30d;
    })
    .slice(0, 12);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    platformStats: {
      totalSignals,
      tpHitSignals,
      signalHitRatePct: resolvedSignals > 0 ? Number(((tpHitSignals / resolvedSignals) * 100).toFixed(1)) : 0,
      closedTrades30d: liveClosedTrades30d + paperClosedTrades30d,
      liveClosedTrades30d,
      paperClosedTrades30d,
      liveWinRate30dPct: liveClosedTrades30d > 0 ? Number(((liveWins30d / liveClosedTrades30d) * 100).toFixed(1)) : 0,
      paperWinRate30dPct: paperClosedTrades30d > 0 ? Number(((paperWins30d / paperClosedTrades30d) * 100).toFixed(1)) : 0,
      verifiedCardsCount: Number(cardsCountRow?.cnt || 0),
      connectedWalletsCount: Number(walletsCountRow?.cnt || 0),
    },
    liveStrategyBacktests,
    channelSignals,
    verifiedCards,
    wallet30dLedger,
  };
}

export async function lookupPublicWalletOrCardAudit(
  db: D1Database,
  env: Env,
  rawQuery: string
): Promise<Record<string, unknown>> {
  const q = (rawQuery || '').trim();
  if (!q) {
    return { found: false, error: 'لطفاً آدرس کیف‌پول، کد استعلام دیجیتال (AUD-...) یا شناسه کارت سود را وارد کنید.' };
  }

  // 1. Check Verified Profit Card ID lookup
  if (/^CRD_/i.test(q)) {
    const card = await db
      .prepare(
        `SELECT v.*, u.trust_wallet_address
         FROM verified_profit_cards v
         LEFT JOIN users u ON u.id = v.user_id
         WHERE v.id = ? LIMIT 1`
      )
      .bind(q)
      .first<{
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
        revoked: number | null;
        trust_wallet_address: string | null;
      }>();

    if (!card) {
      return { found: false, kind: 'CARD', error: 'کارت سود با این شناسه در سرور دلارینو ثبت نشده است.' };
    }

    const secret = env.SESSION_JWT_SECRET || env.MASTER_ENCRYPTION_KEY || 'dollarino-card-hmac-secret';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(card.payload_json || '{}') as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const canonical = buildVerifiedCardCanonicalPayload({
      id: card.id,
      userId: card.user_id,
      mode: card.mode,
      period: card.period,
      startDate: card.start_date,
      endDate: card.end_date,
      tradesCount: Number(card.trades_count),
      winRate: Number(card.win_rate),
      netPnlUsd: Number(card.net_pnl_usd),
      roiPct: Number(card.roi_pct),
      profitFactor: Number(card.profit_factor),
      exchangeProvider: card.exchange_provider,
      strategyName: card.strategy_name,
      tradesHash: typeof parsed.tradesHash === 'string' ? parsed.tradesHash : '',
      issuedAt: card.issued_at,
    });
    const sig = await hmacSha256Hex(canonical, secret);
    const revoked = Number(card.revoked || 0) === 1;
    return {
      found: true,
      kind: 'CARD',
      verifiedSignature: sig === card.hmac_signature && !revoked,
      revoked,
      card: {
        id: card.id,
        mode: card.mode,
        period: card.period,
        startDate: card.start_date,
        endDate: card.end_date,
        tradesCount: card.trades_count,
        winRate: card.win_rate,
        netPnlUsd: card.net_pnl_usd,
        roiPct: card.roi_pct,
        profitFactor: card.profit_factor,
        strategyName: card.strategy_name,
        walletMasked: card.trust_wallet_address ? maskWalletAddress(card.trust_wallet_address) : null,
        issuedAt: card.issued_at,
      },
    };
  }

  // 2. Check AUD-<SUFFIX>-<MODE> or direct Trust Wallet address across EVM/Solana/TON/TRON
  interface AuditUserRow {
    id: string;
    trust_wallet_address: string | null;
    trust_wallet_solana: string | null;
    trust_wallet_ton: string | null;
    trust_wallet_tron: string | null;
    trust_wallet_verified: number | null;
    created_at: string;
  }
  let targetUser: AuditUserRow | null = null;
  let preferredMode: 'LIVE' | 'PAPER' | null = null;

  const audMatch = /^AUD-([A-Z0-9]{4,12})-(LIVE|DEMO)$/i.exec(q);
  if (audMatch) {
    const suffix = audMatch[1]!.toLowerCase();
    preferredMode = audMatch[2]!.toUpperCase() === 'LIVE' ? 'LIVE' : 'PAPER';
    const candidates = await db
      .prepare(
        `SELECT id, trust_wallet_address, trust_wallet_solana, trust_wallet_ton, trust_wallet_tron, trust_wallet_verified, created_at
         FROM users WHERE COALESCE(is_blocked, 0) = 0 LIMIT 200`
      )
      .all<AuditUserRow>()
      .catch(() => ({ results: [] as AuditUserRow[] }));
    targetUser =
      (candidates.results || []).find(
        (u) => u.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toLowerCase() === suffix
      ) ?? null;
  } else {
    targetUser = await db
      .prepare(
        `SELECT id, trust_wallet_address, trust_wallet_solana, trust_wallet_ton, trust_wallet_tron, trust_wallet_verified, created_at
         FROM users
         WHERE COALESCE(is_blocked, 0) = 0
           AND (
             LOWER(COALESCE(trust_wallet_address, '')) = LOWER(?)
             OR COALESCE(trust_wallet_solana, '') = ?
             OR COALESCE(trust_wallet_ton, '') = ?
             OR COALESCE(trust_wallet_tron, '') = ?
           )
         LIMIT 1`
      )
      .bind(q, q, q, q)
      .first<AuditUserRow>()
      .catch(() => null);
  }

  if (targetUser) {
    const modeFilter = preferredMode ? `AND t.mode = '${preferredMode}'` : '';
    const trades = await db
      .prepare(
        `SELECT t.id, t.mode, t.symbol, t.direction, t.strategy_key, t.leverage,
                t.entry_price, t.exit_price, t.margin_used, t.realized_pnl,
                t.tp1_hit, t.tp2_hit, t.tp3_hit, t.exit_reason,
                COALESCE(t.closed_at, t.opened_at) AS ts
         FROM trades t
         WHERE t.user_id = ?
           AND t.status = 'CLOSED'
           ${modeFilter}
           AND COALESCE(t.closed_at, t.opened_at) >= datetime('now', '-30 days')
         ORDER BY ts ASC
         LIMIT 250`
      )
      .bind(targetUser.id)
      .all<{
        id: string;
        mode: string;
        symbol: string;
        direction: string;
        strategy_key: string;
        leverage: number;
        entry_price: string;
        exit_price: string | null;
        margin_used: string;
        realized_pnl: string;
        tp1_hit: number;
        tp2_hit: number;
        tp3_hit: number;
        exit_reason: string | null;
        ts: string;
      }>();

    let wins = 0;
    let losses = 0;
    let netPnl = 0;
    let totalMargin = 0;
    const eq: number[] = [0];
    let liveCnt = 0;
    let paperCnt = 0;

    for (const r of trades.results || []) {
      const p = Number(r.realized_pnl || 0);
      const m = Math.max(0, Number(r.margin_used || 0));
      if (String(r.mode).toUpperCase() === 'LIVE') liveCnt += 1;
      else paperCnt += 1;
      if (p > 0) wins += 1;
      else if (p < 0) losses += 1;
      netPnl += p;
      totalMargin += m;
      eq.push(Number(netPnl.toFixed(2)));
    }

    const chainInfo = detectWalletChainAndExplorer({
      evm: targetUser.trust_wallet_address,
      solana: targetUser.trust_wallet_solana,
      ton: targetUser.trust_wallet_ton,
      tron: targetUser.trust_wallet_tron,
    });
    const total = (trades.results || []).length;
    const suffix = targetUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    const resolvedMode: 'LIVE' | 'PAPER' = preferredMode || (liveCnt > 0 ? 'LIVE' : 'PAPER');

    return {
      found: true,
      kind: 'WALLET_30D',
      registeredInDollarino: true,
      auditId: `AUD-${suffix}-${resolvedMode === 'LIVE' ? 'LIVE' : 'DEMO'}`,
      walletAddress: chainInfo.address || `AUD-${suffix}`,
      walletMasked: chainInfo.address ? maskWalletAddress(chainInfo.address) : `AUD-${suffix}`,
      chain: chainInfo.chain,
      walletVerified: Number(targetUser.trust_wallet_verified || 0) === 1,
      explorerUrl: chainInfo.explorerUrl,
      mode: resolvedMode,
      summary30d: {
        tradesCount: total,
        liveTradesCount: liveCnt,
        paperTradesCount: paperCnt,
        wins,
        losses,
        winRatePct: total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0,
        netPnlUsd: Number(netPnl.toFixed(2)),
        totalMarginUsd: Number(totalMargin.toFixed(2)),
        roiPct: totalMargin > 0 ? Number(((netPnl / totalMargin) * 100).toFixed(2)) : 0,
        equityPoints: eq.slice(-24),
      },
      recentTrades: (trades.results || [])
        .slice(-8)
        .reverse()
        .map((t) => ({
          id: t.id,
          mode: t.mode,
          symbol: t.symbol,
          direction: t.direction,
          leverage: t.leverage,
          marginUsd: Number(Number(t.margin_used || 0).toFixed(2)),
          pnlUsd: Number(Number(t.realized_pnl || 0).toFixed(2)),
          exitReason: t.exit_reason || 'CLOSED',
          closedAt: t.ts,
        })),
    };
  }

  // 3. Valid external EVM/Solana/TON/TRON wallet not yet registered -> read live on-chain balance as proof
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(q);
  const isTron = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(q);
  const isSol = !isEvm && !isTron && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
  const isTon = !isEvm && !isTron && !isSol && /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(q);

  if (isEvm || isTron || isSol || isTon) {
    const portfolio = await Promise.race([
      fetchTrustWalletLivePortfolio({
        evmAddress: isEvm ? q : undefined,
        tronAddress: isTron ? q : undefined,
        solanaAddress: isSol ? q : undefined,
        tonAddress: isTon ? q : undefined,
      }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
    ]);

    const chain = isEvm ? 'EVM' : isSol ? 'SOLANA' : isTon ? 'TON' : 'TRON';
    const explorerUrl = isEvm
      ? `https://etherscan.io/address/${q}`
      : isSol
        ? `https://solscan.io/account/${q}`
        : isTon
          ? `https://tonviewer.com/${q}`
          : `https://tronscan.org/#/address/${q}`;

    return {
      found: true,
      kind: 'EXTERNAL_WALLET',
      registeredInDollarino: false,
      walletAddress: q,
      walletMasked: maskWalletAddress(q),
      chain,
      explorerUrl,
      onChainTotalUsd: portfolio ? Number(portfolio.totalUsd || 0) : null,
      onChainHoldings: portfolio ? portfolio.holdings.slice(0, 6) : [],
      message:
        'این آدرس کیف‌پول معتبر بلاکچینی است اما هنوز در دلارینو متصل نشده است. پس از ثبت‌نام می‌توانید بدون واریز وجه به سایت، معاملات خود را مستقیماً روی همین ولت انجام دهید.',
    };
  }

  return {
    found: false,
    error: 'هیچ ولت متصل، کد استعلام ۳۰ روزه (AUD-...) یا کارت سودی با این مشخصات در سرور یافت نشد.',
  };
}
