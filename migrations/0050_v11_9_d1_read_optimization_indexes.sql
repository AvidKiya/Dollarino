-- V11.9: Cloudflare D1 Read Optimization Indexes (eliminates full-table scans on cron, polling, copy discovery & notifications)

CREATE INDEX IF NOT EXISTS idx_users_active_last_seen
  ON users(is_blocked, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_tg_notify
  ON users(telegram_id, is_blocked, last_active_at DESC)
  WHERE telegram_id IS NOT NULL AND telegram_id != '';

CREATE INDEX IF NOT EXISTS idx_users_fee_enforcement_due
  ON users(fee_lock_status, fee_penalty_usd)
  WHERE fee_lock_status != 'ACTIVE' OR fee_penalty_usd > 0;

CREATE INDEX IF NOT EXISTS idx_copy_traders_user_id
  ON copy_traders(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_closed_recent_user
  ON trades(status, closed_at DESC, user_id)
  WHERE status = 'CLOSED';

CREATE INDEX IF NOT EXISTS idx_dex_trades_closed_recent_user
  ON dex_trades(status, closed_at DESC, user_id)
  WHERE status = 'CLOSED';

CREATE INDEX IF NOT EXISTS idx_copy_pos_v2_user_opened_desc
  ON copy_positions_v2(user_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_perp_dex_orders_user_created_desc
  ON perp_dex_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_server_fee_ledger_status_user
  ON server_fee_ledger(status, user_id, fee_usd);

CREATE INDEX IF NOT EXISTS idx_bot_configs_sniper_running
  ON bot_configs(bot_state, sniper_enabled, user_id)
  WHERE bot_state IN ('RUNNING_PAPER', 'RUNNING_LIVE');

CREATE INDEX IF NOT EXISTS idx_pending_orders_status_user
  ON pending_orders(status, user_id)
  WHERE status = 'PENDING';
