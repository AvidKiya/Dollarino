-- V11.6: Clean legacy placeholder wallet addresses + add single-use cryptographic nonces for Trust Wallet DApp auth
UPDATE system_settings
SET value = ''
WHERE value LIKE 'TYourTRC20%' OR value LIKE 'YourTRC20%' OR value LIKE '0xYour%' OR value = 'TYourTRC20WalletAddressHereSetInAdminPanel';

CREATE TABLE IF NOT EXISTS trust_wallet_nonces (
  nonce TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'CONNECT',
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tw_nonces_user_expires ON trust_wallet_nonces(user_id, expires_at);
