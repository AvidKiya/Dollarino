-- V10.5: Telegram Community Group Moderator Warnings + Default Automation Settings

CREATE TABLE IF NOT EXISTS telegram_group_warnings (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_tg_id TEXT NOT NULL,
  username TEXT,
  warn_count INTEGER NOT NULL DEFAULT 0,
  muted_until TEXT,
  last_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_tg_id)
);

CREATE INDEX IF NOT EXISTS idx_tg_group_warn_chat_user ON telegram_group_warnings(chat_id, user_tg_id);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('auto_publish_top_traders', 'true'),
  ('auto_publish_min_win_rate', '52'),
  ('auto_publish_max_count', '6'),
  ('auto_publish_signals_to_channel', 'true'),
  ('always_on_signals_enabled', 'true'),
  ('always_on_ai_broadcast_enabled', 'true'),
  ('group_antilink_enabled', 'true'),
  ('group_antiforward_enabled', 'true'),
  ('group_antiscam_enabled', 'true'),
  ('group_ai_assistant_enabled', 'true'),
  ('group_welcome_enabled', 'true'),
  ('community_group_id', ''),
  ('community_group_invite', '');
