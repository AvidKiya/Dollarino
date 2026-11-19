import {
  computeStrategySignals,
  DEFAULT_MIXER_WEIGHTS,
  formatDollarinoSignal,
  mergeKbosParams,
  selectClosedCandles,
  strategyOutputToDollarinoSignal,
  type Direction,
  type SignalMixerWeights,
} from '@dollarino/core';
import { runAutonomousAITrader } from '../ai/providers.js';
import { randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { executeSignalForUser, logAudit, reconcileOpenPositionsForUser, type UserBotConfigRow } from './executor.js';

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

  private async runUserTick(userId: string) {
    // 1. Always manage open positions (3-TP + Risk-Free trailing)
    await reconcileOpenPositionsForUser(this.env, userId);

    // 2. Check if bot is actively scanning strategies or AI Agent
    const cfg = await this.env.DB.prepare('SELECT * FROM bot_configs WHERE user_id = ?')
      .bind(userId).first<UserBotConfigRow>();
    if (!cfg || (cfg.bot_state !== 'RUNNING_PAPER' && cfg.bot_state !== 'RUNNING_LIVE')) {
      return;
    }

    const { adapter } = await resolveUserExchangeAdapter(
      this.env,
      userId,
      cfg.trading_mode === 'PAPER' ? 'paper' : undefined
    );

    const [ltfRaw, htfRaw] = await Promise.all([
      adapter.getKlines(cfg.symbol, cfg.entry_timeframe, 450),
      adapter.getKlines(cfg.symbol, cfg.higher_timeframe, 200),
    ]);

    const now = Date.now();
    const ltfClosed = selectClosedCandles(ltfRaw, cfg.entry_timeframe, now);
    const htfClosed = selectClosedCandles(htfRaw, cfg.higher_timeframe, now);
    if (ltfClosed.length < 40) return;

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

    // 2A. Autonomous AI Trader Engine (DeepSeek / Claude / GPT / Gemini)
    if (cfg.strategy_key === 'ai_autonomous_agent') {
      const latestBarTs = ltfClosed[ltfClosed.length - 1]!.timestamp;
      const aiBarKey = `last_ai_bar_ts_${userId}_${cfg.symbol}_${cfg.entry_timeframe}`;
      const lastAiTs = await this.state.storage.get<number>(aiBarKey);
      if (lastAiTs === latestBarTs) return;
      await this.state.storage.put(aiBarKey, latestBarTs);

      const [orderBook, market24h, openOnSymbol] = await Promise.all([
        adapter.getOrderBook(cfg.symbol, 15).catch(() => ({ bids: [], asks: [] })),
        adapter.getMarket24h(cfg.symbol).catch(() => null),
        this.env.DB.prepare(
          `SELECT id, direction, entry_price, current_stop_loss, tp1, remaining_quantity, margin_used, realized_pnl, mode FROM trades WHERE user_id = ? AND symbol = ? AND status = 'OPEN' LIMIT 1`
        ).bind(userId, cfg.symbol).first<{
          id: string;
          direction: Direction;
          entry_price: string;
          current_stop_loss: string;
          tp1: string;
          remaining_quantity: string;
          margin_used: string;
          realized_pnl: string;
          mode: string;
        }>(),
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
          symbol: cfg.symbol,
          timeframe: cfg.entry_timeframe,
          higherTimeframe: cfg.higher_timeframe,
          candles: ltfClosed,
          htfCandles: htfClosed,
          maxLeverage: Math.max(1, cfg.max_leverage),
          minConfidence: cfg.ai_min_confidence ?? 65,
          orderBookImbalancePct: imbalancePct,
          spreadPct,
          fundingRate: market24h?.fundingRate,
          openPosition: openOnSymbol
            ? {
                direction: openOnSymbol.direction,
                entryPrice: openOnSymbol.entry_price,
                currentStopLoss: openOnSymbol.current_stop_loss,
                tp1: openOnSymbol.tp1,
              }
            : null,
          riskPreset,
          kbosParams,
          mixerWeights,
          mixerThreshold: cfg.mixer_threshold ?? 65,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI Trader error';
        await logAudit(this.env.DB, userId, 'AI_AGENT', 'ERROR', `AI Trader failed on ${cfg.symbol}: ${msg}`, cfg.symbol);
        return;
      }

      await logAudit(
        this.env.DB,
        userId,
        'AI_AGENT',
        decision.ok ? 'INFO' : 'WARN',
        `[${(decision.provider || 'AI').toUpperCase()} · ${decision.model || ''}] ${decision.action} ${cfg.symbol} (${decision.confidence}% conf) — ${decision.thesis}`,
        cfg.symbol,
        decision
      );

      if (!decision.ok) return;

      if (decision.action === 'CLOSE' && openOnSymbol) {
        const cls = await adapter.closePositionPartialOrFull(
          cfg.symbol,
          openOnSymbol.direction,
          openOnSymbol.remaining_quantity,
          `ai_exit_${Date.now()}`
        );
        const exitPx = Number(cls.filledPrice);
        const entryPx = Number(openOnSymbol.entry_price);
        const qty = Number(openOnSymbol.remaining_quantity);
        const pnl = openOnSymbol.direction === 'LONG' ? (exitPx - entryPx) * qty : (entryPx - exitPx) * qty;
        const totalRealized = Number(openOnSymbol.realized_pnl) + pnl - Number(cls.fee);
        if (openOnSymbol.mode === 'PAPER') {
          const restored = Number(cfg.paper_balance) + Number(openOnSymbol.margin_used) + pnl - Number(cls.fee);
          await this.env.DB.prepare('UPDATE bot_configs SET paper_balance = ? WHERE user_id = ?')
            .bind(restored.toFixed(2), userId).run();
        }
        await this.env.DB.prepare(
          `UPDATE trades SET status = 'CLOSED', remaining_quantity = '0', exit_price = ?, realized_pnl = ?, exit_reason = 'AI_EXIT', closed_at = datetime('now') WHERE id = ?`
        ).bind(cls.filledPrice, totalRealized.toFixed(4), openOnSymbol.id).run();
        return;
      }

      if ((decision.action === 'LONG' || decision.action === 'SHORT') && decision.confidence >= (cfg.ai_min_confidence ?? 65)) {
        if (cooldownMinutes > 0) {
          const lastClosed = await this.env.DB.prepare(
            `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
          ).bind(userId, cfg.symbol).first<{ closed_at: string; exit_reason: string | null }>();
          if (lastClosed?.closed_at) {
            const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
            const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
            if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) return;
          }
        }

        const sig = {
          symbol: cfg.symbol,
          direction: decision.action,
          timeframe: cfg.entry_timeframe,
          price: String(decision.entry),
          stopLoss: String(decision.stopLoss),
          leverage: decision.leverage,
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
        });
        if (execRes.ok) {
          await this.env.DB.prepare(`UPDATE signals SET status = 'EXECUTED' WHERE id = ?`).bind(sigId).run();
        }
      }
      return;
    }

    // 2B. Classic Quantitative Strategy Engine (optional hybrid/quant modes)
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
    const latest = outputs[outputs.length - 1];
    if (!latest || latest.signal === 'NONE') return;

    const lastBarKey = `last_signal_ts_${userId}_${cfg.symbol}`;
    const lastProcessed = await this.state.storage.get<number>(lastBarKey);
    if (lastProcessed === latest.timestamp) return;

    if (cooldownMinutes > 0) {
      const lastClosed = await this.env.DB.prepare(
        `SELECT closed_at, exit_reason FROM trades WHERE user_id = ? AND symbol = ? AND status = 'CLOSED' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1`
      ).bind(userId, cfg.symbol).first<{ closed_at: string; exit_reason: string | null }>();
      if (lastClosed?.closed_at) {
        const closedMs = Date.parse(lastClosed.closed_at.includes('T') ? lastClosed.closed_at : `${lastClosed.closed_at.replace(' ', 'T')}Z`);
        const effectiveCooldownMs = (lastClosed.exit_reason === 'SL' ? Math.max(cooldownMinutes, 15) : cooldownMinutes) * 60_000;
        if (Number.isFinite(closedMs) && now - closedMs < effectiveCooldownMs) {
          return;
        }
      }
    }

    await this.state.storage.put(lastBarKey, latest.timestamp);
    const sig = strategyOutputToDollarinoSignal(
      cfg.symbol,
      cfg.entry_timeframe,
      Math.max(1, cfg.max_leverage),
      latest,
      cfg.signal_channel_handle
    );
    if (!sig) return;

    await logAudit(this.env.DB, userId, 'SIGNAL', 'INFO', `Strategy ${cfg.strategy_key} emitted ${sig.direction} ${sig.symbol}`, sig.symbol);
    await executeSignalForUser(this.env, userId, sig, { strategyKey: cfg.strategy_key });
  }
}
