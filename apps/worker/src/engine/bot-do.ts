import { computeStrategySignals, selectClosedCandles, strategyOutputToDollarinoSignal } from '@dollarino/core';
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

    // 2. Check if bot is actively scanning strategies
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
      adapter.getKlines(cfg.symbol, cfg.entry_timeframe, 150),
      adapter.getKlines(cfg.symbol, cfg.higher_timeframe, 100),
    ]);

    const now = Date.now();
    const ltfClosed = selectClosedCandles(ltfRaw, cfg.entry_timeframe, now);
    const htfClosed = selectClosedCandles(htfRaw, cfg.higher_timeframe, now);
    if (ltfClosed.length < 55) return;

    const outputs = computeStrategySignals(
      cfg.strategy_key,
      ltfClosed,
      htfClosed,
      cfg.entry_timeframe,
      cfg.higher_timeframe
    );
    const latest = outputs[outputs.length - 1];
    if (!latest || latest.signal === 'NONE') return;

    const lastBarKey = `last_signal_ts_${userId}_${cfg.symbol}`;
    const lastProcessed = await this.state.storage.get<number>(lastBarKey);
    if (lastProcessed === latest.timestamp) return;

    await this.state.storage.put(lastBarKey, latest.timestamp);
    const sig = strategyOutputToDollarinoSignal(
      cfg.symbol,
      cfg.entry_timeframe,
      Math.min(10, cfg.max_leverage),
      latest,
      cfg.signal_channel_handle
    );
    if (!sig) return;

    await logAudit(this.env.DB, userId, 'SIGNAL', 'INFO', `Strategy ${cfg.strategy_key} emitted ${sig.direction} ${sig.symbol}`, sig.symbol);
    await executeSignalForUser(this.env, userId, sig, { strategyKey: cfg.strategy_key });
  }
}
