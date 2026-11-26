-- V11.8: Clean-slate Raw Platform Defaults + Pre-seeded Initial Admin with Mandatory Credential & 2FA Migration
-- 1. Add secondary password & first-login mandatory credential change columns to users
ALTER TABLE users ADD COLUMN secondary_password_hash TEXT;
ALTER TABLE users ADD COLUMN must_change_credentials INTEGER NOT NULL DEFAULT 0;

-- 2. Blank out all pre-configured tokens, numeric Telegram IDs, channels, wallets & external integrations
--    so every deployment starts 100% raw and Admin configures everything strictly from the Admin Panel.
DELETE FROM system_settings WHERE key IN ('telegram_bot_token_enc', 'telegram_webhook_secret_auto');

INSERT INTO system_settings (key, value, updated_at) VALUES
  ('owner_telegram_id', '', datetime('now')),
  ('bot_username', '', datetime('now')),
  ('official_channel', '', datetime('now')),
  ('signal_channel_handle', '', datetime('now')),
  ('signals_channel_id', '', datetime('now')),
  ('results_channel_id', '', datetime('now')),
  ('news_channel_id', '', datetime('now')),
  ('education_channel_id', '', datetime('now')),
  ('alerts_channel_id', '', datetime('now')),
  ('signals_channel_invite', '', datetime('now')),
  ('results_channel_invite', '', datetime('now')),
  ('community_group_id', '', datetime('now')),
  ('community_group_invite', '', datetime('now')),
  ('telegram_support', '', datetime('now')),
  ('support_handle', '', datetime('now')),
  ('google_client_id', '', datetime('now')),
  ('google_client_secret', '', datetime('now')),
  ('default_ai_base_url', '', datetime('now')),
  ('usdt_trc20_wallet', '', datetime('now')),
  ('trust_wallet_evm_receiver', '', datetime('now')),
  ('trust_wallet_sol_receiver', '', datetime('now')),
  ('trust_wallet_ton_receiver', '', datetime('now')),
  ('treasury_evm_receiver', '', datetime('now')),
  ('treasury_trc20_receiver', '', datetime('now')),
  ('treasury_solana_receiver', '', datetime('now')),
  ('treasury_ton_receiver', '', datetime('now')),
  ('iran_card_number', '', datetime('now')),
  ('iran_card_holder', '', datetime('now')),
  ('founder_verification_id', '', datetime('now')),
  ('founder_channel', '', datetime('now')),
  ('founder_channel_url', '', datetime('now')),
  -- User auth/registration methods start OFF until enabled & configured by Admin
  ('auth_password_login_enabled', 'true', datetime('now')),
  ('auth_public_signup_enabled', 'false', datetime('now')),
  ('auth_wallet_enabled', 'false', datetime('now')),
  ('auth_telegram_enabled', 'false', datetime('now')),
  ('auth_google_enabled', 'false', datetime('now')),
  ('allow_direct_email_signup', 'false', datetime('now')),
  ('telegram_only_signup', 'false', datetime('now')),
  ('require_telegram_phone_kyc', 'false', datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

-- 3. Seed initial Owner/Admin account ONLY if no owner exists yet:
--    Username: admin | Primary Password: admin | Secondary Access Password: admin123
--    Forces immediate credential change + Google Authenticator 2FA activation upon first login.
INSERT INTO users (
  id, email, username, display_name, auth_provider, password_hash, secondary_password_hash,
  role, profile_completed, has_custom_password, must_change_credentials, totp_enabled, referral_code
)
SELECT
  'usr_admin_bootstrap',
  'admin@dollarino.local',
  'admin',
  'مدیر سیستم',
  'password',
  'pbkdf2$FfUD3N/QzgfRSvQJZ1W9EA==$pfSQ++vEBchPb3mX0BMADWHP/1HGvrwbX4Uzzy+Pawc=',
  'pbkdf2$yOA7tUq2N5nnMSEXDjIJRw==$NtzKG80xEVzaws/n0FRwen/wtFHoocN/sMyogHll8ao=',
  'owner',
  1,
  1,
  1,
  0,
  'DLRADMIN'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner');

INSERT OR IGNORE INTO bot_configs (
  user_id, bot_state, trading_mode, trade_execution_mode, market_type, direction_mode,
  notifications_enabled, notification_prefs_json, display_currency, strategy_key, active_engines_json,
  entry_timeframe, higher_timeframe, margin_pct, use_signal_leverage, max_leverage, max_open_positions,
  daily_max_loss_pct, trailing_stop_enabled, trailing_stop_pct, trail_after_tp1,
  tp1_close_pct, tp2_close_pct, tp3_close_pct, auto_breakeven_on_tp1, move_sl_to_tp1_on_tp2,
  auto_scan_top, scan_scope, allow_auto_flip, ai_gate_enabled, ai_min_confidence,
  sniper_enabled, sniper_auto_execute, sniper_min_safety_score, sniper_min_liquidity_usd,
  sniper_tp_pct, sniper_sl_pct, sniper_trailing_enabled, sniper_trailing_pct,
  bot_budget_mode, bot_budget_usd, bot_budget_pct, trading_mode_selected, webhook_secret
)
SELECT
  'usr_admin_bootstrap', 'STOPPED', 'PAPER', 'MANUAL_CONFIRM', 'FUTURES', 'BOTH',
  0, '{"tradeOpen":false,"tpSlHit":false,"aiSignals":false,"whaleCopy":false,"dailyDigest":false}', 'USD',
  'dollarino_v01', '[]', '15m', '1h', 5, 0, 10, 3, 5, 1, 2, 1, 50, 25, 25, 1, 1,
  0, 'ALL_MARKET', 0, 0, 70, 0, 0, 80, 35000, 35, 15, 1, 8, 'FULL_BALANCE', 0, 100, 0, 'tv_admin_bootstrap'
WHERE EXISTS (SELECT 1 FROM users WHERE id = 'usr_admin_bootstrap');

INSERT OR IGNORE INTO exchange_connections (
  id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status
)
SELECT
  'ex_admin_bootstrap_paper', 'usr_admin_bootstrap', 'paper', 'Paper Simulator (Live Quotes)', 1, 1, 'PAPER-MODE', '{}', 'OK'
WHERE EXISTS (SELECT 1 FROM users WHERE id = 'usr_admin_bootstrap');
