import {
  computeKbosV11Detailed,
  computeStrategySignals,
  DEFAULT_MIXER_WEIGHTS,
  ema,
  evaluateCustomStrategy,
  evaluateSignalMixerAtBar,
  mergeKbosParams,
  resolveEngineDisplayLabel,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type CustomStrategyLanguage,
  type Direction,
  type DirectionMode,
  type MarketType,
  type SignalMixerWeights,
  type StrategySignalOutput,
} from '@dollarino/core';
import { runAutonomousAITrader } from '../ai/providers.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { getExchangeMarkets, MAJOR_LIQUID_COINS } from '../exchanges/markets.js';
import { compileTrainedRulesToVisualDef, DEFAULT_TRAINED_RULES, type TrainedAIRules } from '../routes/my-ai.js';
import { publishSignalBroadcast, publishSignalClosedCard } from '../telegram/publisher.js';
import { checkLiveFeeEnforcement } from '../services/server-fee.js';
import { checkPreTradeOnboardingGate } from './onboarding-gate.js';
import { parseActiveEnginesFromConfig, type TradingEngineChoice } from './exclusive-engine.js';
import { runNewListingAndMemeSniperForUser } from './listing-sniper.js';
import {
  executeSignalForUser,
  logAudit,
  notifyUserTelegram,
  pushNotification,
  reconcileOpenPositionsForUser,
  type UserBotConfigRow,
} from './executor.js';

export class TradingBotCoordinator implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/tick') {
      const userId = url.searchParams.get('userId');
      if (userId) {
        await this.runUserTick(userId);
        await this.scheduleAlarm();
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/start') {
      await this.scheduleAlarm();
      return Response.json({ ok: true, scheduled: true });
    }
    return Response.json({ ok: true });
  }

  private async scheduleAlarm() {
    const current = await this.state.storage.getAlarm();
    if (!current || current < Date.now()) {
      await this.state.storage.setAlarm(Date.now() + 60_000);
    }
  }

  async alarm() {
    const [runningUsers, openUsers, pendingUsers, alertUsers] = await Promise.all([
      this.env.DB.prepare(
        `SELECT * FROM bot_configs WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE') LIMIT 200`
      ).all<UserBotConfigRow>(),
      this.env.DB.prepare(
        `SELECT DISTINCT user_id FROM trades WHERE status = 'OPEN' LIMIT 200`
      ).all<{ user_id: string }>(),
      this.env.DB.prepare(
        `SELECT DISTINCT user_id FROM pending_orders WHERE status = 'PENDING' LIMIT 200`
      ).all<{ user_id: string }>().catch(() => ({ results: [] as Array<{ user_id: string }> })),
      this.env.DB.prepare(
        `SELECT DISTINCT user_id FROM price_alerts WHERE is_active = 1 LIMIT 200`
      ).all<{ user_id: string }>().catch(() => ({ results: [] as Array<{ user_id: string }> })),
    ]);

    const runningMap = new Map(runningUsers.results.map((r) => [r.user_id, r]));
    const openSet = new Set(openUsers.results.map((r) => r.user_id));
    const pendingSet = new Set(pendingUsers.results.map((r) => r.user_id));
    const alertSet = new Set(alertUsers.results.map((r) => r.user_id));
    const allUserIds = new Set([...runningMap.keys(), ...openSet, ...pendingSet, ...alertSet]);

    for (const userId of allUserIds) {
      await this.runUserTick(userId, {
        isBotRunning: runningMap.has(userId),
        hasOpenTrades: openSet.has(userId),
        hasPendingOrders: pendingSet.has(userId),
        hasAlerts: alertSet.has(userId),
        prefetchedCfg: runningMap.get(userId),
      }).catch(() => {});
    }

    // Prune stale audit logs once every 6 hours to keep D1 compact & fast
    const now = Date.now();
    const lastPrune = (await this.state.storage.get<number>('last_audit_prune_ms')) ?? 0;
    if (now - lastPrune > 6 * 3600_000) {
      await this.state.storage.put('last_audit_prune_ms', now);
      await this.env.DB.prepare(
        `DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs WHERE created_at < datetime('now', '-7 days') LIMIT 500)`
      ).run().catch(() => {});
    }

    if (allUserIds.size > 0) {
      // Check every 90s when open trades/pending orders exist; otherwise every 300s (5m) to preserve D1 quota
      const nextDelay = openSet.size > 0 || pendingSet.size > 0 ? 90_000 : 300_000;
      await this.state.storage.setAlarm(Date.now() + nextDelay);
    }
  }

  private async checkUserPriceAlerts(
    userId: string,
    adapter: Awaited<ReturnType<typeof resolveUserExchangeAdapter>>['adapter']
  ) {
    const alerts = await this.env.DB.prepare(
      `SELECT id, symbol, condition, target_price, note FROM price_alerts WHERE user_id = ? AND is_active = 1 LIMIT 20`
    )
      .bind(userId)
      .all<{ id: string; symbol: string; condition: 'ABOVE' | 'BELOW'; target_price: number; note: string | null }>()
      .catch(() => ({ results: [] }));
    if (!alerts.results.length) return;

    const pxCache = new Map<string, number>();
    for (const al of alerts.results) {
      let curPx = pxCache.get(al.symbol);
      if (curPx === undefined) {
        const pxStr = await adapter.getTickerPrice(al.symbol).catch(() => '0');
        curPx = Number(pxStr);
        if (!Number.isFinite(curPx) || curPx <= 0) continue;
        pxCache.set(al.symbol, curPx);
      }
      const hit = al.condition === 'BELOW' ? curPx <= al.target_price : curPx >= al.target_price;
      if (!hit) continue;

      await this.env.DB.prepare(
        `UPDATE price_alerts SET is_active = 0, triggered_at = datetime('now') WHERE id = ?`
      ).bind(al.id).run().catch(() => {});

      const dirFa = al.condition === 'BELOW' ? 'کاهش به زیر' : 'عبور از';
      const title = `هشدار قیمت ${al.symbol}`;
      const msg = `${al.symbol} به قیمت لحظه‌ای $${curPx} رسید (${dirFa} $${al.target_price})${al.note ? ` · ${al.note}` : ''}`;
      await pushNotification(this.env.DB, userId, 'SYSTEM', title, msg).catch(() => {});
      await notifyUserTelegram(this.env, userId, `🔔 ${title}\n${msg}`).catch(() => {});
    }
  }

  private async buildScanBatchForUser(
    userId: string,
    cfg: UserBotConfigRow,
    adapter: Awaited<ReturnType<typeof resolveUserExchangeAdapter>>['adapter'],
    openSymbols: Set<string>
  ): Promise<string[]> {
    const scope = cfg.scan_scope || (cfg.auto_scan_top ? 'ALL_MARKET' : 'SINGLE');
    const marketType: MarketType = cfg.market_type ?? 'FUTURES';

    if (scope === 'SINGLE' && !cfg.auto_scan_top) {
      return Array.from(new Set([cfg.symbol, ...openSymbols])).slice(0, 6);
    }

    let watchlist: string[] = [];
    try {
      if (cfg.watchlist_json) {
        const parsed = JSON.parse(cfg.watchlist_json) as unknown;
        if (Array.isArray(parsed)) {
          watchlist = parsed.map((x) => String(x).toUpperCase()).filter(Boolean);
        }
      }
    } catch {
      watchlist = [];
    }

    let universe: string[] = [];
    if (scope === 'ALL_MARKET') {
      const cachedKey = `mkt_universe_${cfg.trading_mode}_${marketType}`;
      const cached = await this.state.storage.get<{ ts: number; list: string[] }>(cachedKey);
      if (cached && Date.now() - cached.ts < 5 * 60_000 && cached.list.length >= 10) {
        universe = cached.list;
      } else {
        const listed = await getExchangeMarkets(adapter.provider, undefined, marketType).catch(() => []);
        if (listed.length > 0) {
          // Include ALL listed USDT pairs across the exchange (no 32-coin truncation)
          universe = listed
            .filter((m) => m.symbol.endsWith('USDT'))
            .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
            .map((m) => m.symbol);
          await this.state.storage.put(cachedKey, { ts: Date.now(), list: universe });
        }
      }
    }

    const pool = Array.from(
      new Set([
        cfg.symbol,
        ...openSymbols,
        ...watchlist,
        ...MAJOR_LIQUID_COINS,
        ...universe,
      ])
    );

    // Rotate cleanly across the entire exchange coin universe while prioritizing open positions & primary symbol
    const priority = Array.from(new Set([cfg.symbol, ...openSymbols])).slice(0, 4);
    const others = pool.filter((s) => !priority.includes(s));
    const cursorKey = `scan_cursor_${userId}`;
    const cursor = (await this.state.storage.get<number>(cursorKey)) ?? 0;
    const targetTotal = cursor === 0 ? 16 : 12;
    const batchSize = Math.max(4, targetTotal - priority.length);

    const picked: string[] = [...priority];
    if (others.length > 0) {
      for (let i = 0; i < Math.min(batchSize, others.length); i++) {
        picked.push(others[(cursor + i) % others.length]!);
      }
      await this.state.storage.put(cursorKey, (cursor + batchSize) % others.length);
    }

    return Array.from(new Set(picked));
  }

  private async runUserTick(
    userId: string,
    hints?: { isBotRunning?: boolean; hasOpenTrades?: boolean; hasPendingOrders?: boolean; hasAlerts?: boolean; prefetchedCfg?: UserBotConfigRow }
  ) {
    // 1. Only query & reconcile open positions/pending orders when present (or manual /tick trigger)
    if (!hints || hints.hasOpenTrades || hints.hasPendingOrders) {
      await reconcileOpenPositionsForUser(this.env, userId, {
        prefetchedCfg: hints?.prefetchedCfg,
        checkPendingOrders: hints ? Boolean(hints.hasPendingOrders) : true,
      });
    }

    // 1B. Only check price alerts when user actually has active alerts (or manual /tick trigger)
    if (!hints || hints.hasAlerts) {
      const { adapter: alertAdapter } = await resolveUserExchangeAdapter(this.env, userId, 'paper').catch(() => ({ adapter: null }));
      if (alertAdapter) {
        await this.checkUserPriceAlerts(userId, alertAdapter).catch(() => {});
      }
    }

    // 2. Skip autonomous strategy scan immediately when bot is known stopped
    if (hints && !hints.isBotRunning) {
      return;
    }

    const cfg =
      hints?.prefetchedCfg ??
      (await this.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
        .bind(userId)
        .first<UserBotConfigRow>());
    if (!cfg || (cfg.bot_state !== 'RUNNING_PAPER' && cfg.bot_state !== 'RUNNING_LIVE')) {
      return;
    }

    const gateKey = `do_gate_ok_${userId}`;
    const gateCached = hints?.prefetchedCfg
      ? await this.state.storage.get<{ ts: number; ok: boolean }>(gateKey)
      : undefined;
    const onboardingGate =
      gateCached && gateCached.ok && Date.now() - gateCached.ts < 120_000
        ? { ok: true }
        : await checkPreTradeOnboardingGate(this.env.DB, userId).catch(() => ({ ok: true }));
    if (onboardingGate.ok && (!gateCached || Date.now() - gateCached.ts >= 120_000)) {
      await this.state.storage.put(gateKey, { ts: Date.now(), ok: true }).catch(() => {});
    }
    if (!onboardingGate.ok) {
      await this.state.storage.delete(gateKey).catch(() => {});
      await this.env.DB.prepare(`UPDATE bot_configs SET bot_state = 'STOPPED', updated_at = datetime('now') WHERE user_id = ?`)
        .bind(userId)
        .run()
        .catch(() => {});
      return;
    }

    if (cfg.trading_mode === 'LIVE') {
      const feeCheck = await checkLiveFeeEnforcement(this.env.DB, userId).catch(() => ({ allowed: true, totalDueUsd: 0 }));
      if (!feeCheck.allowed) {
        const due = `$${Number(feeCheck.totalDueUsd || 0).toFixed(2)}`;
        // SAFE GRACE GUARANTEE: Never stop or abandon existing OPEN positions;
        // reconcileOpenPositionsForUser above keeps TP/SL/Trailing active so open trades close in profit.
        // Only NEW trade openings (including Sniper/AI/Strategy) are blocked here!
        const feeWarnKey = `fee_block_notice_${userId}`;
        const lastWarnMs = (await this.state.storage.get<number>(feeWarnKey)) ?? 0;
        if (Date.now() - lastWarnMs > 1800_000) {
          await this.state.storage.put(feeWarnKey, Date.now());
          await this.env.DB.prepare(
            `UPDATE bot_configs SET last_ai_reason = ? WHERE user_id = ?`
          )
            .bind(`فقط باز کردن معامله جدید تا تسویه کارمزد ۳٪ (${due}) محدود شد؛ پوزیشن‌های باز همچنان در مسیر سود مدیریت می‌شوند.`, userId)
            .run()
            .catch(() => {});
          await logAudit(this.env.DB, userId, 'RISK', 'WARN', `New LIVE entries paused due to overdue 3% fee (${due}); open positions remain managed.`);
          await pushNotification(
            this.env.DB,
            userId,
            'SUBSCRIPTION',
            'توقف موقت ورود جدید (کارمزد ۳٪)',
            `بدهی تسویه‌نشده ${due} است. پوزیشن‌های باز شما همچنان مدیریت می‌شوند تا در سود بسته شوند؛ پس از تسویه در خزانه ورود جدید آزاد می‌شود.`
          ).catch(() => {});
          await notifyUserTelegram(
            this.env,
            userId,
            `⏳ **باز کردن معامله جدید لایو تا تسویه کارمزد ۳٪ (${due}) متوقف شد**\n🛡 پوزیشن‌های باز فعلی شما همچنان مدیریت می‌شوند تا در سود بسته شوند.\nاز بخش «خزانه و تسویه ۳٪» تسویه کنید تا ورود جدید باز شود.`
          ).catch(() => {});
        }
        return;
      }
    }

    const metaKey = `do_eng_meta_${userId}`;
    const metaCached = hints?.prefetchedCfg
      ? await this.state.storage.get<{ ts: number; agentActive: boolean; copyCount: number }>(metaKey)
      : undefined;
    let agentActive: boolean;
    let copyCount: number;
    if (metaCached && Date.now() - metaCached.ts < 90_000) {
      agentActive = metaCached.agentActive;
      copyCount = metaCached.copyCount;
    } else {
      const [agentRow, activeCopyRow] = await Promise.all([
        this.env.DB.prepare(`SELECT is_active_for_trading FROM user_ai_agents WHERE user_id = ? LIMIT 1`)
          .bind(userId)
          .first<{ is_active_for_trading: number }>()
          .catch(() => null),
        this.env.DB.prepare(`SELECT COUNT(*) as cnt FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`)
          .bind(userId)
          .first<{ cnt: number }>()
          .catch(() => ({ cnt: 0 })),
      ]);
      agentActive = Boolean(agentRow?.is_active_for_trading);
      copyCount = Number(activeCopyRow?.cnt ?? 0);
      await this.state.storage.put(metaKey, { ts: Date.now(), agentActive, copyCount }).catch(() => {});
    }

    const activeEngines: TradingEngineChoice[] = parseActiveEnginesFromConfig(
      cfg.active_engines_json,
      cfg.strategy_key,
      agentActive,
      copyCount,
      Boolean(cfg.sniper_enabled),
      cfg.bot_state
    );

    // Run New Exchange Listings & Hot Meme Coin Sniper independently if toggled ON
    if (activeEngines.includes('LISTING_SNIPER')) {
      await runNewListingAndMemeSniperForUser(this.env, userId, cfg).catch(() => {});
    }

    const runCentralAi = activeEngines.includes('CENTRAL_AI');
    const runMyAi = activeEngines.includes('MY_AI');
    const runStrategy = activeEngines.includes('STRATEGY');

    // Strict Multi-Engine Isolation:
    // If user enabled ONLY Copy-Trade (or Copy-Trade + Sniper) without AI/Strategy, NEVER fire AI or Strategy trades!
    if (!runCentralAi && !runMyAi && !runStrategy) {
      return;
    }

    const marketType: MarketType = cfg.market_type ?? 'FUTURES';
    const hedgeMode = marketType === 'FUTURES' && Boolean(cfg.hedge_mode);

    const [{ adapter }, openRows, prefetchedAgent, prefetchedCustomStrat] = await Promise.all([
      resolveUserExchangeAdapter(
        this.env,
        userId,
        cfg.trading_mode === 'PAPER' ? 'paper' : undefined
      ),
      hints && !hints.hasOpenTrades && !hints.hasPendingOrders
        ? Promise.resolve({
            results: [] as Array<{
              id: string;
              symbol: string;
              direction: Direction;
              entry_price: string;
              current_stop_loss: string;
              tp1: string;
              remaining_quantity: string;
              margin_used: string;
              realized_pnl: string;
              mode: string;
              market_type?: MarketType;
            }>,
          })
        : this.env.DB.prepare(
            `SELECT id, symbol, direction, entry_price, current_stop_loss, tp1, remaining_quantity, margin_used, realized_pnl, mode, market_type
             FROM trades WHERE user_id = ? AND status = 'OPEN'`
          ).bind(userId).all<{
            id: string;
            symbol: string;
            direction: Direction;
            entry_price: string;
            current_stop_loss: string;
            tp1: string;
            remaining_quantity: string;
            margin_used: string;
            realized_pnl: string;
            mode: string;
            market_type?: MarketType;
          }>(),
      runMyAi
        ? this.env.DB.prepare(`SELECT name, system_rules_json FROM user_ai_agents WHERE user_id = ? LIMIT 1`)
            .bind(userId)
            .first<{ name: string; system_rules_json: string }>()
            .catch(() => null)
        : Promise.resolve(null),
      runStrategy && cfg.active_custom_strategy_id &&
      (cfg.strategy_key === 'custom_pine' || cfg.strategy_key === 'custom_python' || cfg.strategy_key === 'custom_visual')
        ? this.env.DB.prepare(`SELECT language, code FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`)
            .bind(cfg.active_custom_strategy_id, userId)
            .first<{ language: CustomStrategyLanguage; code: string }>()
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const openByKey = new Map<string, (typeof openRows.results)[number]>();
    const openSymbols = new Set<string>();
    for (const r of openRows.results) {
      openSymbols.add(r.symbol);
      const key = hedgeMode ? `${r.symbol}:${r.direction}` : r.symbol;
      if (!openByKey.has(key)) openByKey.set(key, r);
    }
    let liveOpenCount = openRows.results.length;

    const symbolsToScan = await this.buildScanBatchForUser(userId, cfg, adapter, openSymbols);

    // Evaluate symbols in parallel chunks of 4 so a 12-coin sweep finishes rapidly
    for (let i = 0; i < symbolsToScan.length; i += 4) {
      const chunk = symbolsToScan.slice(i, i + 4);
      const results = await Promise.all(
        chunk.map((scanSymbol) => {
          const openLong = hedgeMode ? openByKey.get(`${scanSymbol}:LONG`) ?? null : openByKey.get(scanSymbol) ?? null;
          const openShort = hedgeMode ? openByKey.get(`${scanSymbol}:SHORT`) ?? null : openByKey.get(scanSymbol) ?? null;
          if (!openLong && !openShort && liveOpenCount >= cfg.max_open_positions) {
            return Promise.resolve(false);
          }
          return this.evaluateSymbolForUser(
            userId,
            cfg,
            adapter,
            scanSymbol,
            { long: openLong, short: openShort, hedgeMode },
            liveOpenCount,
            { centralAi: runCentralAi, myAi: runMyAi, strategy: runStrategy },
            { agentRow: prefetchedAgent, customStratRow: prefetchedCustomStrat }
          ).catch(async (err) => {
            const msg = err instanceof Error ? err.message : 'Scan error';
            await logAudit(this.env.DB, userId, 'SIGNAL', 'WARN', `خطا در بررسی ${scanSymbol}: ${msg}`, scanSymbol).catch(() => {});
            return false;
          });
        })
      );
      for (const opened of results) {
        if (opened) liveOpenCount++;
      }
    }

    const hbKey = `last_scan_hb_${userId}`;
    const lastHb = (await this.state.storage.get<number>(hbKey)) ?? 0;
    if (Date.now() - lastHb >= 300_000) {
      await this.state.storage.put(hbKey, Date.now());
      const names = symbolsToScan.map((s) => s.replace('USDT', '')).join('، ');
      await logAudit(
        this.env.DB,
        userId,
        'SIGNAL',
        'INFO',
        `پایش زنده همزمان ${symbolsToScan.length} ارز ${marketType} (${names}) تکمیل شد · جستجو برای نقطه ورود مطمئن`,
        symbolsToScan[0] || cfg.symbol
      );
    }
  }

  private async closeOpenPositionEarly(
    userId: string,
    cfg: UserBotConfigRow,
    adapter: Awaited<ReturnType<typeof resolveUserExchangeAdapter>>['adapter'],
    openPos: {
      id: string;
      symbol: string;
      direction: Direction;
      entry_price: string;
      remaining_quantity: string;
      margin_used: string;
      realized_pnl: string;
      mode: string;
      market_type?: MarketType;
      signal_id?: string | null;
      strategy_key?: string | null;
      leverage?: number;
      tp1?: string;
      current_stop_loss?: string;
      opened_at?: string | null;
    },
    reason: 'AI_EXIT' | 'STRATEGY_FLIP'
  ) {
    const cls = await adapter.closePositionPartialOrFull(
      openPos.symbol,
      openPos.direction,
      openPos.remaining_quantity,
      `${reason.toLowerCase()}_${Date.now()}`,
      openPos.market_type ?? cfg.market_type ?? 'FUTURES'
    );
    const exitPx = Number(cls.filledPrice);
    const entryPx = Number(openPos.entry_price);
    const qty = Number(openPos.remaining_quantity);
    const pnl = openPos.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
    const totalRealized = Number(openPos.realized_pnl) + pnl - Number(cls.fee);

    if (openPos.mode === 'PAPER') {
      const freshCfg = await this.env.DB.prepare('SELECT paper_balance FROM bot_configs WHERE user_id = ?')
        .bind(userId).first<{ paper_balance: string }>();
      const restored = Number(freshCfg?.paper_balance ?? cfg.paper_balance) + Number(openPos.margin_used) + pnl - Number(cls.fee);
      await this.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
        .bind(restored.toFixed(2), userId).run();
    }

    await this.env.DB.prepare(
      `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = ?, closed_at = datetime('now') WHERE id = ?`
    ).bind(cls.filledPrice, totalRealized.toFixed(4), reason, openPos.id).run();

    await logAudit(
      this.env.DB,
      userId,
      'ORDER',
      'INFO',
      `Closed ${openPos.direction} ${openPos.symbol} (${reason}) @ ${cls.filledPrice} | PnL: ${totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}`,
      openPos.symbol
    );
    const pnlPct = Number(openPos.margin_used) > 0 ? (totalRealized / Number(openPos.margin_used)) * 100 : 0;
    await publishSignalClosedCard(this.env, {
      tradeId: openPos.id,
      userId,
      signalId: openPos.signal_id,
      symbol: openPos.symbol,
      direction: openPos.direction,
      leverage: openPos.leverage ?? cfg.max_leverage ?? 1,
      mode: (openPos.mode === 'LIVE' ? 'LIVE' : 'PAPER'),
      strategyKey: openPos.strategy_key ?? cfg.strategy_key,
      entryPrice: openPos.entry_price,
      exitPrice: cls.filledPrice,
      stopLoss: openPos.current_stop_loss || openPos.entry_price,
      tp1: openPos.tp1 || cls.filledPrice,
      tp1Hit: totalRealized > 0,
      tp2Hit: false,
      tp3Hit: false,
      trailingActive: false,
      trailingSl: openPos.current_stop_loss,
      pnlUsd: totalRealized,
      pnlPct,
      reason: reason === 'AI_EXIT' ? 'خروج هوشمند دلارینو (AI_EXIT)' : 'چرخش روند (STRATEGY_FLIP)',
      openedAt: openPos.opened_at,
      closedAt: new Date().toISOString(),
    }).catch(() => {});
  }

  private async evaluateSymbolForUser(
    userId: string,
    cfg: UserBotConfigRow,
    adapter: Awaited<ReturnType<typeof resolveUserExchangeAdapter>>['adapter'],
    scanSymbol: string,
    openState: {
      long: {
        id: string;
        symbol: string;
        direction: Direction;
        entry_price: string;
        current_stop_loss: string;
        tp1: string;
        remaining_quantity: string;
        margin_used: string;
        realized_pnl: string;
        mode: string;
        market_type?: MarketType;
      } | null;
      short: {
        id: string;
        symbol: string;
        direction: Direction;
        entry_price: string;
        current_stop_loss: string;
        tp1: string;
        remaining_quantity: string;
        margin_used: string;
        realized_pnl: string;
        mode: string;
        market_type?: MarketType;
      } | null;
      hedgeMode: boolean;
    },
    openCount: number,
    activeScanModes: { centralAi: boolean; myAi: boolean; strategy: boolean },
    prefetched?: {
      agentRow?: { name: string; system_rules_json: string } | null;
      customStratRow?: { language: CustomStrategyLanguage; code: string } | null;
    }
  ): Promise<boolean> {
    const marketType: MarketType = cfg.market_type ?? 'FUTURES';
    const directionMode: DirectionMode = cfg.direction_mode ?? 'BOTH';
    const openAny = openState.long ?? openState.short;
    const isDirectionAllowed = (dir: Direction) => {
      if (marketType === 'SPOT' && dir === 'SHORT') return false;
      if (directionMode === 'LONG_ONLY' && dir === 'SHORT') return false;
      if (directionMode === 'SHORT_ONLY' && dir === 'LONG') return false;
      return true;
    };

    // If max open positions reached and we don't hold this symbol (nor allow flip/exit), skip heavy API calls
    if (!openAny && openCount >= cfg.max_open_positions) {
      return false;
    }

    const [ltfRaw, htfRaw] = await Promise.all([
      adapter.getKlines(scanSymbol, cfg.entry_timeframe, 450),
      adapter.getKlines(scanSymbol, cfg.higher_timeframe, 200),
    ]);

    const now = Date.now();
    const ltfClosed = selectClosedCandles(ltfRaw, cfg.entry_timeframe, now);
    const htfClosed = selectClosedCandles(htfRaw, cfg.higher_timeframe, now);
    if (ltfClosed.length < 40) return false;

    // Volatility / News Spike Guard: block brand-new entries when the latest closed bar prints an abnormal flash spike
    // (> 3.8x ATR-14 or > 6.5% single-bar move), while still allowing protective closes / risk-free management.
    if (!openAny && ltfClosed.length >= 20) {
      const latestBar = ltfClosed[ltfClosed.length - 1]!;
      const prevBars = ltfClosed.slice(-15, -1);
      const atr14 = prevBars.reduce((acc, b) => acc + Math.max(0, b.high - b.low), 0) / Math.max(1, prevBars.length);
      const latestRange = Math.max(0, latestBar.high - latestBar.low);
      const latestBodyPct = latestBar.open > 0 ? (Math.abs(latestBar.close - latestBar.open) / latestBar.open) * 100 : 0;
      const spikeRatio = atr14 > 0 ? latestRange / atr14 : 0;
      if ((atr14 > 0 && spikeRatio >= 3.8) || latestBodyPct >= 6.5) {
        const guardKey = `vol_guard_${userId}_${scanSymbol}_${latestBar.timestamp}`;
        const alreadyLogged = await this.state.storage.get<boolean>(guardKey);
        if (!alreadyLogged) {
          await this.state.storage.put(guardKey, true);
          const guardNote = `سپر نوسان شدید (Volatility Guard): کندل ${scanSymbol} (${spikeRatio.toFixed(1)}× ATR) غیرعادی بود؛ ورود جدید متوقف شد.`;
          await this.env.DB.prepare(
            `UPDATE bot_configs SET last_ai_reason = ?, last_ai_decision_at = datetime('now') WHERE user_id = ?`
          )
            .bind(guardNote, userId)
            .run()
            .catch(() => {});
          await logAudit(this.env.DB, userId, 'RISK', 'WARN', guardNote, scanSymbol);
        }
        return false;
      }
    }

    let kbosParams = mergeKbosParams();
    try {
      if (cfg.kbos_params_json) kbosParams = mergeKbosParams(JSON.parse(cfg.kbos_params_json));
    } catch { /* fallback */ }

    let mixerWeights: SignalMixerWeights = DEFAULT_MIXER_WEIGHTS;
    try {
      if (cfg.mixer_weights_json) mixerWeights = JSON.parse(cfg.mixer_weights_json) as SignalMixerWeights;
    } catch { /* fallback */ }

    let cooldownMinutes = 10;
    let riskPreset = 'balanced';
    try {
      if (cfg.risk_profile_json) {
        const rp = JSON.parse(cfg.risk_profile_json) as { cooldownMinutes?: number; preset?: string };
        if (Number.isFinite(rp.cooldownMinutes)) cooldownMinutes = Math.max(0, Number(rp.cooldownMinutes));
        if (rp.preset) riskPreset = rp.preset;
      }
    } catch { /* fallback */ }

    // 2A. Dollarino AI (Token-Guarded Quant Pre-Filter + Single-Model Consensus + Quant Fallback)
    let openedAnyOnSymbol = false;
    if (activeScanModes.centralAi) {
      const latestBarTs = ltfClosed[ltfClosed.length - 1]!.timestamp;
      const aiBarKey = `last_ai_bar_ts_${userId}_${scanSymbol}_${cfg.entry_timeframe}`;
      const aiCheckKey = `last_ai_check_ms_${userId}_${scanSymbol}_${cfg.entry_timeframe}`;
      const userAiThrottleKey = `user_ai_throttle_ms_${userId}`;
      const [lastAiTs, lastCheckMs, lastUserAiMs] = await Promise.all([
        this.state.storage.get<number>(aiBarKey),
        this.state.storage.get<number>(aiCheckKey),
        this.state.storage.get<number>(userAiThrottleKey),
      ]);
      // Re-evaluate each symbol at most once every 15 minutes (or on new candle close)
      const aiTimeEligible = !(lastAiTs === latestBarTs && lastCheckMs && now - lastCheckMs < 900_000);

      let hasStrongQuantCandidate = false;
      if (aiTimeEligible) {
        let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        if (htfClosed.length >= 25) {
          const hc = htfClosed.map((c) => c.close);
          const h20 = ema(hc, 20);
          const h50 = ema(hc, 50);
          const f = h20[htfClosed.length - 1];
          const s = h50[htfClosed.length - 1];
          if (Number.isFinite(f) && Number.isFinite(s)) {
            htfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
          }
        }
        const preMixer = evaluateSignalMixerAtBar(
          ltfClosed,
          ltfClosed.length - 1,
          htfTrend,
          mixerWeights,
          cfg.mixer_threshold ?? 65
        );
        const preKbos = computeKbosV11Detailed(ltfClosed, cfg.entry_timeframe, kbosParams);
        const preKbosSig = preKbos.outputs[preKbos.outputs.length - 1]?.signal ?? 'NONE';
        hasStrongQuantCandidate =
          Boolean(openAny) ||
          preKbosSig !== 'NONE' ||
          Math.abs(preMixer.compositeScore || 0) >= 26 ||
          preMixer.direction !== 'NONE';

        if (!hasStrongQuantCandidate) {
          await Promise.all([
            this.state.storage.put(aiBarKey, latestBarTs),
            this.state.storage.put(aiCheckKey, now),
          ]);
        }
      }

      if (aiTimeEligible && hasStrongQuantCandidate && (!(!openAny && lastUserAiMs && now - lastUserAiMs < 120_000))) {
        await Promise.all([
          this.state.storage.put(aiBarKey, latestBarTs),
          this.state.storage.put(aiCheckKey, now),
          this.state.storage.put(userAiThrottleKey, now),
        ]);

      const [orderBook, market24h, recentClosedRows] = await Promise.all([
        adapter.getOrderBook(scanSymbol, 15).catch(() => ({ bids: [], asks: [] })),
        adapter.getMarket24h(scanSymbol).catch(() => null),
        this.env.DB.prepare(
          `SELECT symbol, direction, exit_reason, realized_pnl FROM trades WHERE user_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT 5`
        )
          .bind(userId)
          .all<{ symbol: string; direction: string; exit_reason: string | null; realized_pnl: string }>()
          .catch(() => ({ results: [] })),
      ]);

      const recentTradesSummary = recentClosedRows.results.length
        ? recentClosedRows.results
            .map((t) => `${t.symbol} ${t.direction} => ${t.exit_reason || 'CLOSED'} ($${Number(t.realized_pnl || 0).toFixed(2)})`)
            .join('; ')
        : undefined;

      const bidVol = orderBook.bids.reduce((s, [, q]) => s + Number(q), 0);
      const askVol = orderBook.asks.reduce((s, [, q]) => s + Number(q), 0);
      const imbalancePct = bidVol + askVol > 0 ? (((bidVol - askVol) / (bidVol + askVol)) * 100).toFixed(1) : '0.0';
      const bestBid = Number(orderBook.bids[0]?.[0] ?? 0);
      const bestAsk = Number(orderBook.asks[0]?.[0] ?? 0);
      const spreadPct = bestBid > 0 ? (((bestAsk - bestBid) / bestBid) * 100).toFixed(4) : '0.01';

      let decision;
      try {
        decision = await runAutonomousAITrader(this.env, userId, {
          symbol: scanSymbol,
          timeframe: cfg.entry_timeframe,
          higherTimeframe: cfg.higher_timeframe,
          candles: ltfClosed,
          htfCandles: htfClosed,
          maxLeverage: marketType === 'SPOT' ? 1 : Math.max(1, cfg.max_leverage),
          minConfidence: cfg.ai_min_confidence ?? 62,
          orderBookImbalancePct: imbalancePct,
          spreadPct,
          fundingRate: market24h?.fundingRate,
          recentTradesSummary,
          openPosition: openAny
            ? {
                direction: openAny.direction,
                entryPrice: openAny.entry_price,
                currentStopLoss: openAny.current_stop_loss,
                tp1: openAny.tp1,
              }
            : null,
          riskPreset,
          kbosParams,
          mixerWeights,
          mixerThreshold: cfg.mixer_threshold ?? 65,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI Trader error';
        await logAudit(this.env.DB, userId, 'AI_AGENT', 'ERROR', `Dollarino AI error on ${scanSymbol}: ${msg}`, scanSymbol);
        decision = null;
      }

      if (decision) {
        const reasonSummary = `${scanSymbol} (${decision.action} · ${decision.confidence}%): ${decision.thesis}`;
        await this.env.DB.prepare(
          `UPDATE bot_configs SET last_ai_reason = ?, last_ai_decision_at = datetime('now') WHERE user_id = ?`
        )
          .bind(reasonSummary.slice(0, 480), userId)
          .run()
          .catch(() => {});

        await logAudit(
          this.env.DB,
          userId,
          'AI_AGENT',
          decision.ok ? 'INFO' : 'WARN',
          `[هوش مصنوعی دلارینو · ${decision.modelCount || 1}x] ${decision.action} ${scanSymbol} (${decision.confidence}% conf) — ${decision.thesis}`,
          scanSymbol,
          decision
        );

        if (decision.ok && decision.action === 'CLOSE' && openAny) {
          await this.closeOpenPositionEarly(userId, cfg, adapter, openAny, 'AI_EXIT');
          return false;
        }

        if (
          decision.ok &&
          (decision.action === 'LONG' || decision.action === 'SHORT') &&
          decision.confidence >= (cfg.ai_min_confidence ?? 62)
        ) {
          const sameSideOpen = decision.action === 'LONG' ? openState.long : openState.short;
          const oppositeSideOpen = decision.action === 'LONG' ? openState.short : openState.long;

          let aiEligible = true;
          if (marketType === 'SPOT' && decision.action === 'SHORT') {
            if (openState.long && (cfg.allow_auto_flip ?? 1)) {
              await this.closeOpenPositionEarly(userId, cfg, adapter, openState.long, 'AI_EXIT');
            }
            aiEligible = false;
          }
          if (!isDirectionAllowed(decision.action)) aiEligible = false;
          if (sameSideOpen && !(cfg.allow_pyramiding ?? 0)) aiEligible = false;
          if (aiEligible && oppositeSideOpen && !openState.hedgeMode) {
            if (cfg.allow_auto_flip ?? 1) {
              await this.closeOpenPositionEarly(userId, cfg, adapter, oppositeSideOpen, 'AI_EXIT');
            } else {
              aiEligible = false;
            }
          }
          if (openCount >= cfg.max_open_positions) aiEligible = false;

          if (aiEligible && cooldownMinutes > 0 && !sameSideOpen) {
            const lastClosed = await this.env.DB.prepare(
              `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
            ).bind(userId, scanSymbol).first<{ closed_at: string; exit_reason: string | null }>();
            if (lastClosed?.closed_at) {
              const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
              const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
              if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) aiEligible = false;
            }
          }

          if (aiEligible) {
            const sig = {
              symbol: scanSymbol,
              direction: decision.action,
              timeframe: cfg.entry_timeframe,
              price: String(decision.entry),
              stopLoss: String(decision.stopLoss),
              leverage: marketType === 'SPOT' ? 1 : decision.leverage,
              tp1: String(decision.tp1),
              tp2: String(decision.tp2),
              tp3: String(decision.tp3),
              channelHandle: cfg.signal_channel_handle || undefined,
              engineKey: 'ai_autonomous_agent',
              engineLabel: resolveEngineDisplayLabel('ai_autonomous_agent'),
              reason: decision.thesis,
            };
            const recentChan = await this.env.DB.prepare(
              `SELECT id FROM signals
               WHERE symbol = ? AND direction = ? AND engine_source = 'ai_autonomous_agent'
                 AND channel_message_id IS NOT NULL AND created_at >= datetime('now', '-20 minutes')
               ORDER BY created_at DESC LIMIT 1`
            ).bind(sig.symbol, sig.direction).first<{ id: string }>().catch(() => null);

            let sigId = recentChan?.id;
            if (!sigId) {
              sigId = randomId('sig');
              await publishSignalBroadcast(this.env, {
                signalId: sigId,
                signal: sig,
                source: 'ai_agent',
                engineKey: 'ai_autonomous_agent',
                publishToChannel: true,
                notifySubscribers: false,
              }).catch(() => {});
            }

            const execRes = await executeSignalForUser(this.env, userId, sig, {
              signalId: sigId,
              strategyKey: 'ai_autonomous_agent',
              aiConfidence: decision.confidence,
              aiReasoning: decision.thesis,
              marketType,
            });
            if (execRes.ok) {
              await this.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
              openedAnyOnSymbol = true;
              if (!(cfg.allow_pyramiding ?? 0)) return true;
            }
          }
        }
      }
      }
    }

    // 2B. Independent / Simultaneous Quant Strategy & Personal AI Execution
    const subModes: Array<'MY_AI' | 'STRATEGY'> = [];
    if (activeScanModes.myAi) subModes.push('MY_AI');
    if (activeScanModes.strategy) subModes.push('STRATEGY');

    for (const modeKind of subModes) {
      if (openedAnyOnSymbol && !(cfg.allow_pyramiding ?? 0)) break;

      const effectiveStratKey =
        modeKind === 'MY_AI'
          ? 'my_custom_ai'
          : cfg.strategy_key &&
              cfg.strategy_key !== 'ai_autonomous_agent' &&
              cfg.strategy_key !== 'my_custom_ai' &&
              cfg.strategy_key !== 'copy_trade'
            ? cfg.strategy_key
            : 'dollarino_v01';

      let outputs: StrategySignalOutput[] = [];
      if (modeKind === 'MY_AI') {
        const agentRow =
          prefetched?.agentRow !== undefined
            ? prefetched.agentRow
            : await this.env.DB.prepare(`SELECT name, system_rules_json FROM user_ai_agents WHERE user_id = ? LIMIT 1`)
                .bind(userId)
                .first<{ name: string; system_rules_json: string }>()
                .catch(() => null);
        if (agentRow) {
          let rules: TrainedAIRules = DEFAULT_TRAINED_RULES;
          try {
            rules = { ...DEFAULT_TRAINED_RULES, ...(JSON.parse(agentRow.system_rules_json || '{}') as Partial<TrainedAIRules>) };
          } catch {
            rules = DEFAULT_TRAINED_RULES;
          }
          const visualDef = compileTrainedRulesToVisualDef(rules, agentRow.name);
          const evalRes = evaluateCustomStrategy('visual', JSON.stringify(visualDef), ltfClosed, cfg.entry_timeframe);
          if (evalRes.valid) outputs = evalRes.signals;
        }
      } else if (
        (effectiveStratKey === 'custom_pine' ||
          effectiveStratKey === 'custom_python' ||
          effectiveStratKey === 'custom_visual') &&
        cfg.active_custom_strategy_id
      ) {
        const customRow =
          prefetched?.customStratRow !== undefined
            ? prefetched.customStratRow
            : await this.env.DB.prepare(`SELECT language, code FROM user_strategies WHERE id = ? AND user_id = ? LIMIT 1`)
                .bind(cfg.active_custom_strategy_id, userId)
                .first<{ language: CustomStrategyLanguage; code: string }>();

        if (customRow?.code) {
          const evalRes = evaluateCustomStrategy(customRow.language, customRow.code, ltfClosed, cfg.entry_timeframe);
          if (evalRes.valid) outputs = evalRes.signals;
        }
      }

      if (outputs.length === 0) {
        outputs = computeStrategySignals(
          effectiveStratKey,
          ltfClosed,
          htfClosed,
          cfg.entry_timeframe,
          cfg.higher_timeframe,
          {
            kbosParams,
            mixerWeights,
            mixerThreshold: cfg.mixer_threshold ?? 65,
          }
        );
      }

      const lastBarKey = `last_signal_ts_${userId}_${modeKind}_${scanSymbol}`;
      const lastProcessed = await this.state.storage.get<number>(lastBarKey);
      const currentClose = ltfClosed[ltfClosed.length - 1]!.close;

      let latest = outputs[outputs.length - 1];
      if ((!latest || latest.signal === 'NONE') && !lastProcessed && outputs.length >= 6) {
        for (let lookback = 2; lookback <= 6; lookback++) {
          const cand = outputs[outputs.length - lookback];
          if (cand && cand.signal !== 'NONE' && cand.price > 0 && cand.stopLoss && cand.tp1) {
            const driftPct = Math.abs(currentClose - cand.price) / cand.price;
            const slValid = cand.signal === 'LONG' ? currentClose > cand.stopLoss : currentClose < cand.stopLoss;
            const tp1NotHit = cand.signal === 'LONG' ? currentClose < cand.tp1 : currentClose > cand.tp1;
            if (driftPct <= 0.015 && slValid && tp1NotHit) {
              latest = cand;
              break;
            }
          }
        }
      }
      if (!latest || latest.signal === 'NONE') continue;
      if (lastProcessed === latest.timestamp) continue;

      const sigDir: Direction = latest.signal;
      const sameSideOpen = sigDir === 'LONG' ? openState.long : openState.short;
      const oppositeSideOpen = sigDir === 'LONG' ? openState.short : openState.long;

      if (marketType === 'SPOT' && sigDir === 'SHORT') {
        if (openState.long && (cfg.allow_auto_flip ?? 1)) {
          await this.state.storage.put(lastBarKey, latest.timestamp);
          await this.closeOpenPositionEarly(userId, cfg, adapter, openState.long, 'STRATEGY_FLIP');
        }
        continue;
      }
      if (!isDirectionAllowed(sigDir)) continue;
      if (sameSideOpen && !(cfg.allow_pyramiding ?? 0)) continue;
      if (oppositeSideOpen && !openState.hedgeMode) {
        if (cfg.allow_auto_flip ?? 1) {
          await this.closeOpenPositionEarly(userId, cfg, adapter, oppositeSideOpen, 'STRATEGY_FLIP');
        } else {
          continue;
        }
      }
      if (openCount >= cfg.max_open_positions) continue;

      if (cooldownMinutes > 0 && !sameSideOpen) {
        const lastClosed = await this.env.DB.prepare(
          `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
        ).bind(userId, scanSymbol).first<{ closed_at: string; exit_reason: string | null }>();
        if (lastClosed?.closed_at) {
          const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
          const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
          if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) {
            continue;
          }
        }
      }

      await this.state.storage.put(lastBarKey, latest.timestamp);
      const sig = strategyOutputToDollarinoSignal(
        scanSymbol,
        cfg.entry_timeframe,
        marketType === 'SPOT' ? 1 : Math.max(1, cfg.max_leverage),
        latest,
        cfg.signal_channel_handle || undefined,
        effectiveStratKey
      );
      if (!sig) continue;

      const isPersonalCustom =
        effectiveStratKey === 'my_custom_ai' ||
        effectiveStratKey === 'custom_pine' ||
        effectiveStratKey === 'custom_python' ||
        effectiveStratKey === 'custom_visual';

      let sigId: string | undefined;
      if (!isPersonalCustom) {
        const recentChan = await this.env.DB.prepare(
          `SELECT id FROM signals
           WHERE symbol = ? AND direction = ? AND engine_source = ?
             AND channel_message_id IS NOT NULL AND created_at >= datetime('now', '-20 minutes')
           ORDER BY created_at DESC LIMIT 1`
        ).bind(sig.symbol, sig.direction, effectiveStratKey).first<{ id: string }>().catch(() => null);

        sigId = recentChan?.id;
        if (!sigId) {
          sigId = randomId('sig');
          await publishSignalBroadcast(this.env, {
            signalId: sigId,
            signal: sig,
            source: effectiveStratKey,
            engineKey: effectiveStratKey,
            publishToChannel: true,
            notifySubscribers: false,
          }).catch(() => {});
        }
      }

      await logAudit(this.env.DB, userId, 'SIGNAL', 'INFO', `سیگنال ${sig.direction} روی ${sig.symbol} شناسایی شد (${effectiveStratKey} · ${marketType})`, sig.symbol);
      const exec = await executeSignalForUser(this.env, userId, sig, { signalId: sigId, strategyKey: effectiveStratKey, marketType });
      if (exec.ok) {
        openedAnyOnSymbol = true;
      }
    }

    return openedAnyOnSymbol;
  }
}
