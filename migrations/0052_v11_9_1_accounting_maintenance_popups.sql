-- Dollarino V11.9.1 / V12.0 Upgrade:
-- 1. Admin Targeted & Broadcast In-App Popup Messages + Acknowledgements
-- 2. Site Maintenance Mode Defaults
-- 3. Accounting & Treasury Performance Indexes

CREATE TABLE IF NOT EXISTS user_popup_messages (
  id TEXT PRIMARY KEY,
  title_fa TEXT NOT NULL,
  title_en TEXT NULL,
  body_fa TEXT NOT NULL,
  body_en TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  target_scope TEXT NOT NULL DEFAULT 'ALL',
  target_user_id TEXT NULL,
  cta_label_fa TEXT NULL,
  cta_route TEXT NULL,
  dismissible INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NULL,
  expires_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_popup_acks (
  popup_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (popup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_popup_active_target
  ON user_popup_messages (is_active, target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_popup_acks_user
  ON user_popup_acks (user_id, popup_id);

CREATE INDEX IF NOT EXISTS idx_treasury_deposits_status_created
  ON treasury_deposits (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copy_pos_v2_user_status_mode
  ON copy_positions_v2 (user_id, status, execution_mode);

CREATE INDEX IF NOT EXISTS idx_perp_dex_orders_user_status
  ON perp_dex_orders (user_id, status, execution_kind);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('site_maintenance_mode', 'false'),
  ('site_maintenance_title_fa', 'سایت در حال بروزرسانی فنی است'),
  ('site_maintenance_title_en', 'Scheduled Platform Maintenance'),
  ('site_maintenance_message_fa', 'پلتفرم دلارینو موقتاً در حال بروزرسانی فنی و ارتقای سرورها است. به‌زودی با امکانات کامل در دسترس خواهد بود.'),
  ('site_maintenance_message_en', 'Dollarino is temporarily undergoing scheduled maintenance and upgrades. We will be back shortly.'),
  ('site_maintenance_eta', '');
