import {
  computeStrategySignals,
  DEFAULT_MIXER_WEIGHTS,
  formatDollarinoSignal,
  mergeKbosParams,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type Direction,
  type DirectionMode,
  type MarketType,
  type SignalMixerWeights,
} from '@dollarino/core';
import { runAutonomousAITrader } from '../ai/providers.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { getExchangeMarkets, MAJOR_LIQUID_COINS } from '../exchanges/markets.js';
import {
  executeSignalForUser,
  logAudit,
  notifyUserTelegram,
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
      await this.state.storage.setAlarm(Date.now() + 15_000);
    }
  }

  async alarm() {
    const runningUsers = await this.env.DB.prepare(
      `SELECT user_id FROM bot_configs WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE')`
    ).all<{ user_id: string }>();

    const openUsers = await this.env.DB.prepare(
      `SELECT DISTINCT user_id FROM trades WHERE status = 'OPEN'`
    ).all<{ user_id: string }>();

    const allUserIds = new Set([
      ...runningUsers.results.map((r) => r.user_id),
      ...openUsers.results.map((r) => r.user_id),
    ]);

    for (const userId of allUserIds) {
      await this.runUserTick(userId).catch(() => {});
    }

    if (allUserIds.size > 0) {
      await this.state.storage.setAlarm(Date.now() + 15_000);
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

  private async runUserTick(userId: string) {
    // 1. Always manage open positions (3-TP + Risk-Free trailing)
    await reconcileOpenPositionsForUser(this.env, userId);

    // 2. Check if bot is actively scanning strategies or Dollarino AI
    const cfg = await this.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
      .bind(userId).first<UserBotConfigRow>();
    if (!cfg || (cfg.bot_state !== 'RUNNING_PAPER' && cfg.bot_state !== 'RUNNING_LIVE')) {
      return;
    }

    const marketType: MarketType = cfg.market_type ?? 'FUTURES';
    const hedgeMode = marketType === 'FUTURES' && Boolean(cfg.hedge_mode);

    const [{ adapter }, openRows] = await Promise.all([
      resolveUserExchangeAdapter(
        this.env,
        userId,
        cfg.trading_mode === 'PAPER' ? 'paper' : undefined
      ),
      this.env.DB.prepare(
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
            liveOpenCount
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
    if (Date.now() - lastHb >= 60_000) {
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
    await notifyUserTelegram(
      this.env,
      userId,
      `🔄 معامله ${openPos.symbol} (${reason === 'AI_EXIT' ? 'خروج هوشمند دلارینو' : 'چرخش روند'}) بسته شد | سود/زیان: ${totalRealized >= 0 ? '+' : ''}$${totalRealized.toFixed(2)}`
    );
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
    openCount: number
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

    // 2A. Dollarino AI (Centralized Multi-AI Consensus Trader)
    if (cfg.strategy_key === 'ai_autonomous_agent') {
      const latestBarTs = ltfClosed[ltfClosed.length - 1]!.timestamp;
      const aiBarKey = `last_ai_bar_ts_${userId}_${scanSymbol}_${cfg.entry_timeframe}`;
      const lastAiTs = await this.state.storage.get<number>(aiBarKey);
      if (lastAiTs === latestBarTs) return false;
      await this.state.storage.put(aiBarKey, latestBarTs);

      const [orderBook, market24h] = await Promise.all([
        adapter.getOrderBook(scanSymbol, 15).catch(() => ({ bids: [], asks: [] })),
        adapter.getMarket24h(scanSymbol).catch(() => null),
      ]);

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
          minConfidence: cfg.ai_min_confidence ?? 65,
          orderBookImbalancePct: imbalancePct,
          spreadPct,
          fundingRate: market24h?.fundingRate,
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
        return false;
      }

      await logAudit(
        this.env.DB,
        userId,
        'AI_AGENT',
        decision.ok ? 'INFO' : 'WARN',
        `[هوش مصنوعی دلارینو · ${decision.modelCount || 1}x] ${decision.action} ${scanSymbol} (${decision.confidence}% conf) — ${decision.thesis}`,
        scanSymbol,
        decision
      );

      if (!decision.ok) return false;

      if (decision.action === 'CLOSE' && openAny) {
        await this.closeOpenPositionEarly(userId, cfg, adapter, openAny, 'AI_EXIT');
        return false;
      }

      if ((decision.action === 'LONG' || decision.action === 'SHORT') && decision.confidence >= (cfg.ai_min_confidence ?? 65)) {
        const sameSideOpen = decision.action === 'LONG' ? openState.long : openState.short;
        const oppositeSideOpen = decision.action === 'LONG' ? openState.short : openState.long;

        // Spot Sell Signal can close existing Spot LONG cleanly even though Spot cannot open margin SHORT
        if (marketType === 'SPOT' && decision.action === 'SHORT') {
          if (openState.long && (cfg.allow_auto_flip ?? 1)) {
            await this.closeOpenPositionEarly(userId, cfg, adapter, openState.long, 'AI_EXIT');
          }
          return false;
        }
        if (!isDirectionAllowed(decision.action)) return false;

        if (sameSideOpen && !(cfg.allow_pyramiding ?? 0)) {
          return false;
        }
        if (oppositeSideOpen && !openState.hedgeMode) {
          if (cfg.allow_auto_flip ?? 1) {
            await this.closeOpenPositionEarly(userId, cfg, adapter, oppositeSideOpen, 'AI_EXIT');
          } else {
            return false;
          }
        }
        if (openCount >= cfg.max_open_positions) return false;

        if (cooldownMinutes > 0 && !sameSideOpen) {
          const lastClosed = await this.env.DB.prepare(
            `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
          ).bind(userId, scanSymbol).first<{ closed_at: string; exit_reason: string | null }>();
          if (lastClosed?.closed_at) {
            const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
            const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
            if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) return false;
          }
        }

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
          channelHandle: cfg.signal_channel_handle,
          reason: decision.thesis,
        };
        const sigId = randomId('sig');
        await this.env.DB.prepare(
          `INSERT INTO signals (id, user_id, source, symbol, direction, timeframe, price, stop_loss, leverage, tp1, tp2, tp3, raw_text, status)
           VALUES (?, ?, 'ai_agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW')`
        ).bind(
          sigId,
          userId,
          sig.symbol,
          sig.direction,
          sig.timeframe,
          sig.price,
          sig.stopLoss,
          sig.leverage,
          sig.tp1,
          sig.tp2,
          sig.tp3,
          formatDollarinoSignal(sig)
        ).run();

        const execRes = await executeSignalForUser(this.env, userId, sig, {
          signalId: sigId,
          strategyKey: 'ai_autonomous_agent',
          aiConfidence: decision.confidence,
          aiReasoning: decision.thesis,
          marketType,
        });
        if (execRes.ok) {
          await this.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
          return true;
        }
      }
      return false;
    }

    // 2B. Dollarino Select Strategy (Dorna V1 & Quant strategies)
    const outputs = computeStrategySignals(
      cfg.strategy_key,
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
    const lastBarKey = `last_signal_ts_${userId}_${scanSymbol}`;
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
    if (!latest || latest.signal === 'NONE') return false;

    if (lastProcessed === latest.timestamp) return false;

    const sigDir: Direction = latest.signal;
    const sameSideOpen = sigDir === 'LONG' ? openState.long : openState.short;
    const oppositeSideOpen = sigDir === 'LONG' ? openState.short : openState.long;

    if (marketType === 'SPOT' && sigDir === 'SHORT') {
      if (openState.long && (cfg.allow_auto_flip ?? 1)) {
        await this.state.storage.put(lastBarKey, latest.timestamp);
        await this.closeOpenPositionEarly(userId, cfg, adapter, openState.long, 'STRATEGY_FLIP');
      }
      return false;
    }
    if (!isDirectionAllowed(sigDir)) return false;

    if (sameSideOpen && !(cfg.allow_pyramiding ?? 0)) {
      return false;
    }
    if (oppositeSideOpen && !openState.hedgeMode) {
      if (cfg.allow_auto_flip ?? 1) {
        await this.closeOpenPositionEarly(userId, cfg, adapter, oppositeSideOpen, 'STRATEGY_FLIP');
      } else {
        return false;
      }
    }
    if (openCount >= cfg.max_open_positions) return false;

    if (cooldownMinutes > 0 && !sameSideOpen) {
      const lastClosed = await this.env.DB.prepare(
        `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
      ).bind(userId, scanSymbol).first<{ closed_at: string; exit_reason: string | null }>();
      if (lastClosed?.closed_at) {
        const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
        const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
        if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) {
          return false;
        }
      }
    }

    await this.state.storage.put(lastBarKey, latest.timestamp);
    const sig = strategyOutputToDollarinoSignal(
      scanSymbol,
      cfg.entry_timeframe,
      marketType === 'SPOT' ? 1 : Math.max(1, cfg.max_leverage),
      latest,
      cfg.signal_channel_handle
    );
    if (!sig) return false;

    await logAudit(this.env.DB, userId, 'SIGNAL', 'INFO', `سیگنال ${sig.direction} روی ${sig.symbol} شناسایی شد (${cfg.strategy_key} · ${marketType})`, sig.symbol);
    const exec = await executeSignalForUser(this.env, userId, sig, { strategyKey: cfg.strategy_key, marketType });
    return exec.ok;
  }
}
