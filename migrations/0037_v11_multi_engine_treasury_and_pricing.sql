-- Migration 0037: V11.0 Multi-Engine Simultaneous Execution, Custom Demo Balance,
-- New-Listing/Meme Sniper, 3 Free Profitable Live Trades + 3% Fee, Risk Acceptance & Central Platform Treasury

ALTER TABLE bot_configs ADD COLUMN active_engines_json TEXT NOT NULL DEFAULT '["CENTRAL_AI"]';
ALTER TABLE bot_configs ADD COLUMN custom_paper_balance REAL NOT NULL DEFAULT 10000;
ALTER TABLE bot_configs ADD COLUMN sniper_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_configs ADD COLUMN sniper_budget_usd REAL NOT NULL DEFAULT 25;
ALTER TABLE bot_configs ADD COLUMN sniper_min_safety_score INTEGER NOT NULL DEFAULT 75;
ALTER TABLE bot_configs ADD COLUMN sniper_networks_json TEXT NOT NULL DEFAULT '["solana","bsc","base"]';

ALTER TABLE users ADD COLUMN risk_terms_accepted_at TEXT;

CREATE TABLE IF NOT EXISTS treasury_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'DEPOSIT',
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING_VERIFY',
  verified_onchain INTEGER NOT NULL DEFAULT 0,
  credited_to_wallet INTEGER NOT NULL DEFAULT 0,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_treasury_deposits_user ON treasury_deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_deposits_status ON treasury_deposits(status, created_at DESC);

CREATE TABLE IF NOT EXISTS new_listing_events (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  token_address TEXT NOT NULL DEFAULT '',
  chain_id TEXT NOT NULL DEFAULT 'cex',
  source TEXT NOT NULL DEFAULT 'CEX_NEW_LISTING',
  safety_score INTEGER NOT NULL DEFAULT 75,
  liquidity_usd REAL NOT NULL DEFAULT 0,
  price_usd REAL NOT NULL DEFAULT 0,
  change_1h_pct REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_new_listing_events_created ON new_listing_events(created_at DESC);

UPDATE system_settings
SET value = '3.0', updated_at = datetime('now')
WHERE key = 'profit_share_pct';

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('profit_share_pct', '3.0'),
  ('free_profitable_live_trades', '3'),
  ('min_treasury_deposit_usd', '10'),
  ('subscription_required', 'false'),
  ('treasury_evm_receiver', ''),
  ('treasury_trc20_receiver', ''),
  ('treasury_solana_receiver', ''),
  ('treasury_ton_receiver', ''),
  ('treasury_bank_mode', 'WALLET_CONNECT'),
  ('treasury_bank_mnemonic_enc', '');

UPDATE system_settings
SET value = '📘 راهنمای دلارینو (۳ معامله اول رایگان + فقط ۳٪ کارمزد سود)\n۱. تمام ابزارها رایگان است و هیچ اشتراک ماهانه‌ای ندارد.\n۲. ۳ معامله سودده اول واقعی شما با ۰٪ کارمزد رایگان است؛ از معامله سودده چهارم به بعد فقط ۳٪ کارمزد سود محاسبه می‌شود.\n۳. اگر کارمزد معوق باشد، صرفاً باز کردن معامله جدید محدود می‌شود و پوزیشن‌های باز شما برای بسته‌شدن در سود مدیریت می‌مانند.',
    updated_at = datetime('now')
WHERE key = 'help_text';
