import { logAudit } from './executor.js';

export type TradingEngineChoice =
  | 'CENTRAL_AI'
  | 'MY_AI'
  | 'STRATEGY'
  | 'COPY_TRADE'
  | 'LISTING_SNIPER';

export const ALL_ENGINE_CHOICES: TradingEngineChoice[] = [
  'CENTRAL_AI',
  'MY_AI',
  'STRATEGY',
  'COPY_TRADE',
  'LISTING_SNIPER',
];

export interface ActiveEngineState {
  activeEngine: TradingEngineChoice | 'MULTI' | 'NONE';
  activeEngines: TradingEngineChoice[];
  strategyKey: string;
  botState: string;
  isBotRunning: boolean;
  myAiActive: boolean;
  sniperEnabled: boolean;
  activeCopyTradersCount: number;
}

export function normalizeEngineArray(raw: unknown): TradingEngineChoice[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<TradingEngineChoice>();
  for (const item of raw) {
    const up = String(item || '').trim().toUpperCase() as TradingEngineChoice;
    if (ALL_ENGINE_CHOICES.includes(up)) valid.add(up);
  }
  return Array.from(valid);
}

export function parseActiveEnginesFromConfig(
  activeEnginesJson: string | null | undefined,
  strategyKey: string | null | undefined,
  myAiActive: boolean,
  activeCopyCount: number,
  sniperEnabled: boolean,
  botState?: string | null
): TradingEngineChoice[] {
  if (typeof activeEnginesJson === 'string' && activeEnginesJson.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(activeEnginesJson) as unknown;
      if (Array.isArray(parsed)) {
        const list = normalizeEngineArray(parsed);
        if (sniperEnabled && !list.includes('LISTING_SNIPER')) {
          list.push('LISTING_SNIPER');
        }
        if (!sniperEnabled) {
          return list.filter((e) => e !== 'LISTING_SNIPER');
        }
        return list;
      }
    } catch {
      // fall through to heuristic
    }
  }

  const out: TradingEngineChoice[] = [];
  if (strategyKey === 'copy_trade' || (activeCopyCount > 0 && botState === 'STOPPED')) {
    out.push('COPY_TRADE');
  } else if (strategyKey === 'ai_autonomous_agent') {
    out.push('CENTRAL_AI');
  } else if (strategyKey === 'my_custom_ai' || myAiActive) {
    out.push('MY_AI');
  } else if (strategyKey) {
    out.push('STRATEGY');
  }
  if (sniperEnabled && !out.includes('LISTING_SNIPER')) {
    out.push('LISTING_SNIPER');
  }
  return out;
}

export function classifyEngineFromStrategyKey(
  strategyKey: string | null | undefined,
  myAiActive: boolean,
  activeCopyCount: number,
  botState: string | null | undefined
): TradingEngineChoice | 'NONE' {
  const isRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';
  if (activeCopyCount > 0 && !isRunning) {
    return 'COPY_TRADE';
  }
  if (strategyKey === 'copy_trade' && activeCopyCount > 0) {
    return 'COPY_TRADE';
  }
  if (strategyKey === 'ai_autonomous_agent') {
    return 'CENTRAL_AI';
  }
  if (strategyKey === 'my_custom_ai' || (myAiActive && !isRunning)) {
    return 'MY_AI';
  }
  if (strategyKey) {
    return 'STRATEGY';
  }
  return activeCopyCount > 0 ? 'COPY_TRADE' : 'NONE';
}

export async function getActiveEngineState(db: D1Database, userId: string): Promise<ActiveEngineState> {
  const [cfg, agent, copyCnt] = await Promise.all([
    db
      .prepare(
        `SELECT bot_state, strategy_key, active_engines_json, COALESCE(sniper_enabled, 0) AS sniper_enabled
         FROM bot_configs WHERE user_id = ? LIMIT 1`
      )
      .bind(userId)
      .first<{
        bot_state: string;
        strategy_key: string;
        active_engines_json?: string | null;
        sniper_enabled?: number;
      }>()
      .catch(() => null),
    db
      .prepare(`SELECT is_active_for_trading FROM user_ai_agents WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ is_active_for_trading: number }>()
      .catch(() => null),
    db
      .prepare(`SELECT COUNT(*) as cnt FROM copy_subscriptions WHERE user_id = ? AND is_active = 1`)
      .bind(userId)
      .first<{ cnt: number }>()
      .catch(() => ({ cnt: 0 })),
  ]);

  const botState = cfg?.bot_state || 'STOPPED';
  const strategyKey = cfg?.strategy_key || 'dollarino_v01';
  const myAiActive = Boolean(agent?.is_active_for_trading);
  const sniperEnabled = Boolean(cfg?.sniper_enabled);
  const activeCopyTradersCount = Number(copyCnt?.cnt ?? 0);
  const isBotRunning = botState === 'RUNNING_PAPER' || botState === 'RUNNING_LIVE';

  const activeEngines = parseActiveEnginesFromConfig(
    cfg?.active_engines_json,
    strategyKey,
    myAiActive,
    activeCopyTradersCount,
    sniperEnabled,
    botState
  );

  const activeEngine: ActiveEngineState['activeEngine'] =
    activeEngines.length === 0
      ? 'NONE'
      : activeEngines.length === 1
        ? activeEngines[0]!
        : 'MULTI';

  return {
    activeEngine,
    activeEngines,
    strategyKey,
    botState,
    isBotRunning,
    myAiActive,
    sniperEnabled,
    activeCopyTradersCount,
  };
}

/**
 * Sets the exact user-selected set of active engines (single OR simultaneous).
 * Does NOT auto-start the bot (bot_state stays unchanged unless explicitly changed elsewhere).
 * Strictly enforces isolation: engines NOT in `engines` never fire trades!
 */
export async function setActiveTradingEngines(
  db: D1Database,
  userId: string,
  engines: TradingEngineChoice[],
  opts?: {
    strategyKey?: string;
    customStrategyId?: string | null;
    auditSource?: string;
  }
): Promise<ActiveEngineState> {
  const unique = normalizeEngineArray(engines);
  const hasCentralAi = unique.includes('CENTRAL_AI');
  const hasMyAi = unique.includes('MY_AI');
  const hasStrategy = unique.includes('STRATEGY');
  const hasCopy = unique.includes('COPY_TRADE');
  const hasSniper = unique.includes('LISTING_SNIPER');

  const currentCfg = await db
    .prepare(`SELECT strategy_key FROM bot_configs WHERE user_id = ? LIMIT 1`)
    .bind(userId)
    .first<{ strategy_key: string }>()
    .catch(() => null);

  let nextStrategyKey = opts?.strategyKey || currentCfg?.strategy_key || 'dollarino_v01';
  if (hasStrategy && (nextStrategyKey === 'ai_autonomous_agent' || nextStrategyKey === 'my_custom_ai' || nextStrategyKey === 'copy_trade')) {
    nextStrategyKey = 'dollarino_v01';
  } else if (!hasStrategy) {
    if (hasCentralAi) nextStrategyKey = 'ai_autonomous_agent';
    else if (hasMyAi) nextStrategyKey = 'my_custom_ai';
    else if (hasCopy) nextStrategyKey = 'copy_trade';
  }

  const aiGateEnabled = hasCentralAi ? 1 : 0;
  const sniperEnabled = hasSniper ? 1 : 0;

  if (opts?.customStrategyId !== undefined) {
    await db
      .prepare(
        `UPDATE bot_configs
         SET active_engines_json = ?,
             strategy_key = ?,
             active_custom_strategy_id = ?,
             ai_gate_enabled = ?,
             sniper_enabled = ?,
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .bind(JSON.stringify(unique), nextStrategyKey, opts.customStrategyId, aiGateEnabled, sniperEnabled, userId)
      .run()
      .catch(() => {});
  } else {
    await db
      .prepare(
        `UPDATE bot_configs
         SET active_engines_json = ?,
             strategy_key = ?,
             ai_gate_enabled = ?,
             sniper_enabled = ?,
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .bind(JSON.stringify(unique), nextStrategyKey, aiGateEnabled, sniperEnabled, userId)
      .run()
      .catch(() => {});
  }

  if (hasMyAi) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_ai_agents (id, user_id, name, training_notes, system_rules_json, is_active_for_trading)
         VALUES (?, ?, 'هوش مصنوعی شخصی من', '', '{}', 1)`
      )
      .bind(`myai_${userId.slice(-12)}`, userId)
      .run()
      .catch(() => {});
  }

  await db
    .prepare(`UPDATE user_ai_agents SET is_active_for_trading = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .bind(hasMyAi ? 1 : 0, userId)
    .run()
    .catch(() => {});

  // Keep copy_subscriptions auto_mirror aligned ONLY when bot is already running or user toggled Copy off
  if (!hasCopy) {
    await db
      .prepare(`UPDATE copy_subscriptions SET auto_mirror = 0, updated_at = datetime('now') WHERE user_id = ?`)
      .bind(userId)
      .run()
      .catch(() => {});
  }

  await logAudit(
    db,
    userId,
    'SYSTEM',
    'INFO',
    `Active engines updated -> [${unique.join(', ') || 'NONE'}]${opts?.auditSource ? ` via ${opts.auditSource}` : ''}`
  ).catch(() => {});

  return getActiveEngineState(db, userId);
}

export async function toggleTradingEngine(
  db: D1Database,
  userId: string,
  engine: TradingEngineChoice,
  enabled: boolean,
  opts?: { strategyKey?: string; customStrategyId?: string | null; auditSource?: string }
): Promise<ActiveEngineState> {
  const cur = await getActiveEngineState(db, userId);
  const next = new Set<TradingEngineChoice>(cur.activeEngines);
  if (enabled) next.add(engine);
  else next.delete(engine);
  return setActiveTradingEngines(db, userId, Array.from(next), opts);
}

/**
 * Legacy helper preserved for single-selection callers: sets `target` as primary engine
 * (preserving LISTING_SNIPER if already enabled unless target is COPY_TRADE only).
 */
export async function activateExclusiveTradingEngine(
  db: D1Database,
  userId: string,
  target: Exclude<TradingEngineChoice, 'LISTING_SNIPER'>,
  opts?: {
    strategyKey?: string;
    customStrategyId?: string | null;
    stopBotOnCopyTrade?: boolean;
    auditSource?: string;
  }
): Promise<{
  cancelledCopyCount: number;
  stoppedBot: boolean;
  disabledMyAi: boolean;
}> {
  const cur = await getActiveEngineState(db, userId);
  const next: TradingEngineChoice[] = [target];
  if (cur.sniperEnabled) next.push('LISTING_SNIPER');
  await setActiveTradingEngines(db, userId, next, {
    strategyKey: opts?.strategyKey,
    customStrategyId: opts?.customStrategyId,
    auditSource: opts?.auditSource,
  });
  return {
    cancelledCopyCount: 0,
    stoppedBot: false,
    disabledMyAi: target !== 'MY_AI' && cur.myAiActive,
  };
}
