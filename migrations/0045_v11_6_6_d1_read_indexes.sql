-- V11.6.6: Composite covering & partial indexes to slash D1 Rows Read on high-frequency endpoints
CREATE INDEX IF NOT EXISTS idx_trades_user_mode_status_opened ON trades(user_id, mode, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status_closed_at ON trades(status, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dex_trades_user_status_opened ON dex_trades(user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_pos_v2_user_exec_status ON copy_positions_v2(user_id, execution_mode, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_perp_dex_orders_user_status_created ON perp_dex_orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_connections_user_active ON exchange_connections(user_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_perp_dex_conn_user_venue_active ON perp_dex_connections(user_id, venue, is_active);
CREATE INDEX IF NOT EXISTS idx_bot_configs_user_state ON bot_configs(user_id, bot_state);
CREATE INDEX IF NOT EXISTS idx_user_ai_agents_user_active ON user_ai_agents(user_id, is_active_for_trading);
CREATE INDEX IF NOT EXISTS idx_signals_public_created_desc ON signals(created_at DESC) WHERE user_id IS NULL;
