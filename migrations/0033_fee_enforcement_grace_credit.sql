-- Migration 0033: 1% Server Fee Credit, Grace Period, Late Penalty & Auto-Lock Enforcement

ALTER TABLE users ADD COLUMN fee_prepaid_credit_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN fee_penalty_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN fee_lock_status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN fee_grace_deadline TEXT;

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('fee_grace_limit_usd', '2.0');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('fee_grace_hours', '72');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('fee_late_penalty_pct', '25');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('fee_auto_lock_enabled', 'true');
