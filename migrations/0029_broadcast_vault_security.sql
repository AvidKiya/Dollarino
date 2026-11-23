-- Dollarino v10.1: Scheduled Broadcast Center (Telegram + In-App) & Copy-Vault 2FA PIN Verification

CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'اطلاعیه دلارینو',
  message TEXT NOT NULL,
  deliver_telegram INTEGER NOT NULL DEFAULT 1,
  deliver_inapp INTEGER NOT NULL DEFAULT 1,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'SENT',
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_status_time
  ON scheduled_broadcasts(status, scheduled_at);

ALTER TABLE user_copy_vaults ADD COLUMN vault_pin_hash TEXT;
ALTER TABLE user_copy_vaults ADD COLUMN vault_pin_expires_at TEXT;
