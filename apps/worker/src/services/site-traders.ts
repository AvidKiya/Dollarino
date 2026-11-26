import { randomId } from '../crypto.js';
import { getAllCachedSystemSettings } from './settings-cache.js';

export interface SiteTopTraderCandidate {
  userId: string;
  username: string;
  handle: string;
  avatarUrl: string | null;
  telegramId: string | null;
  hasTrustWallet: boolean;
  mode: 'LIVE' | 'PAPER';
  closedTrades: number;
  openTrades: number;
  winTrades: number;
  winRate: number;
  netPnlUsd: number;
  roi30dPct: number;
  maxDrawdownPct: number;
  specialty: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  alreadyPublished: boolean;
  copyTraderId: string | null;
  isActiveInCopyList: boolean;
  followersCount: number;
  lastTradeAt: string | null;
}

export interface SiteTraderAutoConfig {
  enabled: boolean;
  minWinRate: number;
  maxCount: number;
}

export async function getSiteTraderAutoConfig(db: D1Database): Promise<SiteTraderAutoConfig> {
  const map = await getAllCachedSystemSettings(db);
  return {
    enabled: map.get('auto_publish_top_traders') === 'true',
    minWinRate: Math.max(0, Math.min(95, Number(map.get('auto_publish_min_win_rate') ?? 52) || 52)),
    maxCount: Math.max(1, Math.min(20, Number(map.get('auto_publish_max_count') ?? 6) || 6)),
  };
}

export async function discoverTopSiteTraders(db: D1Database, limit = 30): Promise<SiteTopTraderCandidate[]> {
  const [usersRes, cexStatsRes, dexStatsRes, copyRowsRes] = await Promise.all([
    db
      .prepare(
        `SELECT u.id, u.username, u.telegram_id, u.telegram_username, u.avatar_url, u.trust_wallet_address, u.last_active_at,
                COALESCE(bc.trading_mode, 'PAPER') AS trading_mode
         FROM users u
         LEFT JOIN bot_configs bc ON bc.user_id = u.id
         WHERE COALESCE(u.is_blocked, 0) = 0
         ORDER BY u.last_active_at DESC
         LIMIT 200`
      )
      .all<{
        id: string;
        username: string;
        telegram_id: string | null;
        telegram_username: string | null;
        avatar_url: string | null;
        trust_wallet_address: string | null;
        last_active_at: string | null;
        trading_mode: string;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT user_id,
                SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_cnt,
                SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_cnt,
                SUM(CASE WHEN status = 'CLOSED' AND CAST(COALESCE(realized_pnl, '0') AS REAL) > 0 THEN 1 ELSE 0 END) AS win_cnt,
                SUM(CASE WHEN status = 'CLOSED' THEN CAST(COALESCE(realized_pnl, '0') AS REAL) ELSE 0 END) AS net_pnl,
                SUM(CASE WHEN status = 'CLOSED' AND CAST(COALESCE(realized_pnl, '0') AS REAL) < 0 THEN ABS(CAST(realized_pnl AS REAL)) ELSE 0 END) AS gross_loss,
                AVG(CASE WHEN CAST(COALESCE(margin_used, '0') AS REAL) > 0 THEN CAST(margin_used AS REAL) ELSE 25 END) AS avg_margin,
                MAX(COALESCE(closed_at, opened_at)) AS last_trade_at
         FROM trades
         WHERE COALESCE(closed_at, opened_at) >= datetime('now', '-90 days')
         GROUP BY user_id`
      )
      .all<{
        user_id: string;
        closed_cnt: number;
        open_cnt: number;
        win_cnt: number;
        net_pnl: number;
        gross_loss: number;
        avg_margin: number;
        last_trade_at: string | null;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT user_id,
                SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_cnt,
                SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_cnt,
                SUM(CASE WHEN status = 'CLOSED' AND COALESCE(realized_pnl_usd, 0) > 0 THEN 1 ELSE 0 END) AS win_cnt,
                SUM(CASE WHEN status = 'CLOSED' THEN COALESCE(realized_pnl_usd, 0) ELSE 0 END) AS net_pnl,
                SUM(CASE WHEN status = 'CLOSED' AND COALESCE(realized_pnl_usd, 0) < 0 THEN ABS(realized_pnl_usd) ELSE 0 END) AS gross_loss,
                MAX(COALESCE(closed_at, opened_at)) AS last_trade_at
         FROM dex_trades
         WHERE COALESCE(closed_at, opened_at) >= datetime('now', '-90 days')
         GROUP BY user_id`
      )
      .all<{
        user_id: string;
        closed_cnt: number;
        open_cnt: number;
        win_cnt: number;
        net_pnl: number;
        gross_loss: number;
        last_trade_at: string | null;
      }>()
      .catch(() => ({ results: [] })),
    db
      .prepare(`SELECT id, user_id, is_active, is_verified, followers_count FROM copy_traders WHERE user_id IS NOT NULL`)
      .all<{ id: string; user_id: string; is_active: number; is_verified: number; followers_count: number }>()
      .catch(() => ({ results: [] })),
  ]);

  const cexMap = new Map(cexStatsRes.results.map((r) => [r.user_id, r]));
  const dexMap = new Map(dexStatsRes.results.map((r) => [r.user_id, r]));
  const copyMap = new Map(copyRowsRes.results.map((r) => [r.user_id, r]));

  const candidates: SiteTopTraderCandidate[] = [];

  for (const u of usersRes.results) {
    const cex = cexMap.get(u.id);
    const dex = dexMap.get(u.id);
    const copyRow = copyMap.get(u.id);

    const cexClosed = Number(cex?.closed_cnt ?? 0);
    const dexClosed = Number(dex?.closed_cnt ?? 0);
    const closedTrades = cexClosed + dexClosed;
    const openTrades = Number(cex?.open_cnt ?? 0) + Number(dex?.open_cnt ?? 0);

    // Include users who have at least 1 trade OR are already published as copy traders
    if (closedTrades + openTrades === 0 && !copyRow) continue;

    const winTrades = Number(cex?.win_cnt ?? 0) + Number(dex?.win_cnt ?? 0);
    const netPnlUsd = Number((Number(cex?.net_pnl ?? 0) + Number(dex?.net_pnl ?? 0)).toFixed(2));
    const grossLoss = Number(cex?.gross_loss ?? 0) + Number(dex?.gross_loss ?? 0);
    const avgMargin = Math.max(20, Number(cex?.avg_margin ?? 50));

    const winRate = closedTrades > 0 ? Number(((winTrades / closedTrades) * 100).toFixed(1)) : 0;
    const estCapital = Math.max(50, avgMargin * Math.max(1, Math.min(5, closedTrades / 2)));
    const roi30dPct = closedTrades > 0 ? Number(Math.max(-95, Math.min(600, (netPnlUsd / estCapital) * 100)).toFixed(1)) : 0;
    const maxDrawdownPct = Number(Math.max(1.5, Math.min(48, (grossLoss / estCapital) * 100 || 3.2)).toFixed(1));

    const hasTrustWallet = Boolean(u.trust_wallet_address?.trim());
    const mode: 'LIVE' | 'PAPER' = u.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';
    const specialty =
      dexClosed > cexClosed
        ? 'DEX & Memecoin'
        : cexClosed > 0 && dexClosed > 0
          ? 'AI Hybrid Perp + DEX'
          : 'Perp & AI Quant';
    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
      maxDrawdownPct <= 8 ? 'LOW' : maxDrawdownPct <= 18 ? 'MEDIUM' : 'HIGH';

    const score = Number(
      (
        (hasTrustWallet && mode === 'LIVE' ? 30 : 0) +
        winRate * 0.75 +
        Math.max(-40, Math.min(120, netPnlUsd * 0.5)) +
        Math.min(35, closedTrades * 2.5) -
        maxDrawdownPct * 0.35
      ).toFixed(2)
    );

    const cleanHandle = u.telegram_username
      ? `@${u.telegram_username.replace(/^@/, '')}`
      : `@${(u.username || `trader_${u.id.slice(-4)}`).replace(/[^a-zA-Z0-9_]/g, '_')}`;

    const lastTradeAt =
      cex?.last_trade_at && dex?.last_trade_at
        ? cex.last_trade_at > dex.last_trade_at
          ? cex.last_trade_at
          : dex.last_trade_at
        : cex?.last_trade_at || dex?.last_trade_at || null;

    candidates.push({
      userId: u.id,
      username: u.username || cleanHandle,
      handle: cleanHandle,
      avatarUrl: u.avatar_url || null,
      telegramId: u.telegram_id || null,
      hasTrustWallet,
      mode,
      closedTrades,
      openTrades,
      winTrades,
      winRate,
      netPnlUsd,
      roi30dPct,
      maxDrawdownPct,
      specialty,
      riskLevel,
      score,
      alreadyPublished: Boolean(copyRow && copyRow.is_verified === 1),
      copyTraderId: copyRow?.id ?? null,
      isActiveInCopyList: Boolean(copyRow && copyRow.is_active === 1 && copyRow.is_verified === 1),
      followersCount: Number(copyRow?.followers_count ?? 0),
      lastTradeAt,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.netPnlUsd - a.netPnlUsd;
  });

  return candidates.slice(0, limit);
}

export async function promoteSiteTraderToCopyList(
  db: D1Database,
  targetUserId: string,
  opts?: { active?: boolean; askConfirm?: boolean }
): Promise<{ ok: boolean; copyTraderId?: string; isActive: boolean; error?: string }> {
  const user = await db
    .prepare(
      `SELECT id, username, telegram_id, telegram_username, avatar_url FROM users WHERE id = ? LIMIT 1`
    )
    .bind(targetUserId)
    .first<{
      id: string;
      username: string;
      telegram_id: string | null;
      telegram_username: string | null;
      avatar_url: string | null;
    }>()
    .catch(() => null);

  if (!user) return { ok: false, isActive: false, error: 'کاربر یافت نشد.' };

  const existing = await db
    .prepare(`SELECT id FROM copy_traders WHERE user_id = ? LIMIT 1`)
    .bind(targetUserId)
    .first<{ id: string }>()
    .catch(() => null);

  if (opts?.active === false) {
    if (existing) {
      await db.prepare(`UPDATE copy_traders SET is_active = 0 WHERE id = ?`).bind(existing.id).run();
      return { ok: true, copyTraderId: existing.id, isActive: false };
    }
    return { ok: true, isActive: false };
  }

  const all = await discoverTopSiteTraders(db, 100);
  const found = all.find((x) => x.userId === targetUserId);
  const displayName = found?.username || user.username || 'Dollarino Trader';
  const handle =
    found?.handle ||
    (user.telegram_username
      ? `@${user.telegram_username.replace(/^@/, '')}`
      : `@${displayName.replace(/[^a-zA-Z0-9_]/g, '_') || 'trader'}`);
  const winRate = found && found.closedTrades > 0 ? found.winRate : 65;
  const roi = found && found.closedTrades > 0 ? found.roi30dPct : 18.5;
  const dd = found ? found.maxDrawdownPct : 4.5;
  const specialty = found?.specialty || 'Perp & AI Quant';
  const riskLevel = found?.riskLevel || 'MEDIUM';
  const bioFa = found && found.closedTrades > 0
    ? `تریدر برگزیده سایت دلارینو با ${found.closedTrades} معامله بسته، نرخ برد ${winRate}% و سود خالص ${found.netPnlUsd >= 0 ? '+' : '-'}$${Math.abs(found.netPnlUsd).toFixed(2)}.`
    : 'تریدر تاییدشده پلتفرم دلارینو متصل به سیستم کپی‌ترید هوشمند.';
  const bioEn = found && found.closedTrades > 0
    ? `Top ranked Dollarino site trader with ${found.closedTrades} closed trades, ${winRate}% win rate, and $${found.netPnlUsd.toFixed(2)} net PnL.`
    : 'Verified Dollarino platform trader connected for live Copy-Trade.';

  if (existing) {
    await db
      .prepare(
        `UPDATE copy_traders
         SET display_name = ?, handle = ?, avatar_url = COALESCE(?, avatar_url), telegram_id = COALESCE(?, telegram_id),
             specialty = ?, win_rate = ?, roi_30d_pct = ?, max_drawdown_pct = ?, risk_level = ?,
             bio_fa = ?, bio_en = ?, auto_ask_publish = ?, is_verified = 1, is_active = 1
         WHERE id = ?`
      )
      .bind(
        displayName,
        handle,
        user.avatar_url,
        user.telegram_id,
        specialty,
        winRate,
        roi,
        dd,
        riskLevel,
        bioFa,
        bioEn,
        opts?.askConfirm === false ? 0 : 1,
        existing.id
      )
      .run();
    return { ok: true, copyTraderId: existing.id, isActive: true };
  }

  const newId = randomId('ct');
  await db
    .prepare(
      `INSERT INTO copy_traders (
         id, user_id, telegram_id, auto_ask_publish, display_name, handle, avatar_url,
         bio_fa, bio_en, specialty, win_rate, roi_30d_pct, max_drawdown_pct,
         followers_count, min_allocation_usd, risk_level, is_verified, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 10, ?, 1, 1)`
    )
    .bind(
      newId,
      targetUserId,
      user.telegram_id,
      opts?.askConfirm === false ? 0 : 1,
      displayName,
      handle,
      user.avatar_url,
      bioFa,
      bioEn,
      specialty,
      winRate,
      roi,
      dd,
      riskLevel
    )
    .run();

  return { ok: true, copyTraderId: newId, isActive: true };
}

export async function syncAutoTopSiteTraders(db: D1Database, force = false): Promise<{
  synced: number;
  autoEnabled: boolean;
}> {
  const cfg = await getSiteTraderAutoConfig(db);
  if (!cfg.enabled && !force) {
    const hasPublishedSiteTrader = await db
      .prepare(`SELECT 1 FROM copy_traders WHERE user_id IS NOT NULL LIMIT 1`)
      .first()
      .catch(() => null);
    if (!hasPublishedSiteTrader) {
      return { synced: 0, autoEnabled: false };
    }
  }
  const candidates = await discoverTopSiteTraders(db, 40);
  let synced = 0;

  // Refresh stats for already published site traders
  for (const cand of candidates) {
    if (cand.copyTraderId && cand.closedTrades > 0) {
      await db
        .prepare(
          `UPDATE copy_traders
           SET win_rate = ?, roi_30d_pct = ?, max_drawdown_pct = ?, specialty = ?, risk_level = ?
           WHERE id = ?`
        )
        .bind(cand.winRate, cand.roi30dPct, cand.maxDrawdownPct, cand.specialty, cand.riskLevel, cand.copyTraderId)
        .run()
        .catch(() => {});
      synced++;
    }
  }

  if (!cfg.enabled && !force) {
    return { synced, autoEnabled: false };
  }

  // Auto-surface best qualifying site performers (min 2 closed trades, winRate >= threshold, positive net PnL)
  const qualifying = candidates.filter(
    (c) => c.closedTrades >= 2 && c.winRate >= cfg.minWinRate && c.netPnlUsd > 0
  );
  const activeSiteTraders = candidates.filter((c) => c.isActiveInCopyList).length;
  let needed = Math.max(0, cfg.maxCount - activeSiteTraders);

  for (const cand of qualifying) {
    if (needed <= 0) break;
    if (cand.isActiveInCopyList) continue;
    await promoteSiteTraderToCopyList(db, cand.userId, { active: true, askConfirm: true }).catch(() => {});
    synced++;
    needed--;
  }

  return { synced, autoEnabled: cfg.enabled };
}
