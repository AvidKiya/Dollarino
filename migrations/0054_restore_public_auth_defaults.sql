-- V11.9.3: Restore standard public user login & registration defaults
-- Ensures Email Signup, Wallet (EIP-191), Telegram Bot, and Google OAuth toggles default ON
-- for normal users while preserving admin security bootstrap and zero pre-configured secrets.

INSERT INTO system_settings (key, value, updated_at) VALUES
  ('auth_password_login_enabled', 'true', datetime('now')),
  ('auth_public_signup_enabled', 'true', datetime('now')),
  ('auth_wallet_enabled', 'true', datetime('now')),
  ('auth_telegram_enabled', 'true', datetime('now')),
  ('auth_google_enabled', 'true', datetime('now')),
  ('allow_direct_email_signup', 'true', datetime('now')),
  ('telegram_only_signup', 'false', datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
