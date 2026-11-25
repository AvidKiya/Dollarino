-- V11.5: Composite covering indexes to slash D1 Rows Read by 80-90% + signal broadcast toggles
CREATE INDEX IF NOT EXISTS idx_trades_user_status_mode_closed ON trades(user_id, status, mode, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_status_mode_opened ON trades(user_id, status, mode, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user_created_desc ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_sym_dir_eng_created ON signals(symbol, direction, engine_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_cat_created ON audit_logs(user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_mode_created ON wallet_ledger(user_id, mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active_user ON price_alerts(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_tv_alerts_active_user ON tradingview_free_alerts(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_copy_rules_active_kind ON copy_follow_rules(is_active, trader_kind, user_id);
CREATE INDEX IF NOT EXISTS idx_copy_pos_v2_status ON copy_positions_v2(status, user_id);
CREATE INDEX IF NOT EXISTS idx_dex_trades_user_opened ON dex_trades(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_fee_ledger_user_status ON server_fee_ledger(user_id, status);
CREATE INDEX IF NOT EXISTS idx_new_listing_events_created ON new_listing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_status ON scheduled_broadcasts(status, scheduled_at);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('publish_signals_to_channels', 'true'),
  ('publish_signals_to_bot_users', 'true');
