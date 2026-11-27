-- V11.9 Overhaul: Ensure safe empty default engines when stopped + extra D1 read-reduction indexes

-- Any STOPPED user config that lacks an explicit active_engines_json starts with ALL engines OFF
UPDATE bot_configs
SET active_engines_json = '[]',
    ai_gate_enabled = 0,
    sniper_enabled = 0
WHERE bot_state = 'STOPPED'
  AND (active_engines_json IS NULL OR TRIM(active_engines_json) = '');

-- Covering indexes to eliminate full table scans in scheduled() & Durable Object alarm()
CREATE INDEX IF NOT EXISTS idx_copy_follow_rules_active_kind
  ON copy_follow_rules(is_active, trader_kind, trader_id);

CREATE INDEX IF NOT EXISTS idx_copy_positions_v2_status_opened
  ON copy_positions_v2(status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active_user
  ON price_alerts(is_active, user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_pending_orders_status_user
  ON pending_orders(status, user_id);

CREATE INDEX IF NOT EXISTS idx_signals_source_created_desc
  ON signals(engine_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dex_trades_user_status_opened
  ON dex_trades(user_id, status, opened_at DESC);
