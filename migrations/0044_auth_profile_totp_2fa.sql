-- Migration 0044: Multi-method auth (Wallet/Telegram/Google), mandatory profile completion, and TOTP 2FA (Google Authenticator)
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_verified_at TEXT;

-- Preserve seamless access for existing/seeded users
UPDATE users
SET profile_completed = 1,
    display_name = COALESCE(NULLIF(display_name, ''), username)
WHERE profile_completed = 0;

CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
