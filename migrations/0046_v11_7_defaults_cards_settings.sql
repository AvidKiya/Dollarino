-- V11.7 Upgrade: User Display & Notification Preferences + Enriched Profit Card Metadata & Revocation
ALTER TABLE bot_configs ADD COLUMN notification_prefs_json TEXT NOT NULL DEFAULT '{"tradeOpen":false,"tpSlHit":false,"aiSignals":false,"whaleCopy":false,"dailyDigest":false}';
ALTER TABLE bot_configs ADD COLUMN display_currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE verified_profit_cards ADD COLUMN trade_source TEXT NOT NULL DEFAULT 'PERP';
ALTER TABLE verified_profit_cards ADD COLUMN entry_price REAL;
ALTER TABLE verified_profit_cards ADD COLUMN exit_price REAL;
ALTER TABLE verified_profit_cards ADD COLUMN signal_name TEXT;
ALTER TABLE verified_profit_cards ADD COLUMN token_address TEXT;
ALTER TABLE verified_profit_cards ADD COLUMN chain_id TEXT;
ALTER TABLE verified_profit_cards ADD COLUMN token_image_url TEXT;
ALTER TABLE verified_profit_cards ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_verified_cards_issued_revoked ON verified_profit_cards(issued_at DESC, revoked);
CREATE INDEX IF NOT EXISTS idx_dex_trades_user_status_closed ON dex_trades(user_id, status, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_pos_v2_user_status_closed ON copy_positions_v2(user_id, status, closed_at DESC);
