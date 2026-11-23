-- Migration 0027: Smart On-Chain Copy Trading Pro, Top-10 Wallet Discovery,
-- Per-Trader Isolated Margin Vaults, Multi-Chain DApp Execution & Admin On-Chain APIs

CREATE TABLE IF NOT EXISTS onchain_api_providers (
  provider TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'DISCOVERY', -- DISCOVERY | SECURITY | AGGREGATOR | RPC
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  requires_key INTEGER NOT NULL DEFAULT 1,
  api_key_masked TEXT,
  encrypted_api_key TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  calls_today INTEGER NOT NULL DEFAULT 0,
  last_test_ok INTEGER,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO onchain_api_providers (provider, category, label, base_url, requires_key, is_active) VALUES
  ('dexscreener', 'DISCOVERY', 'DexScreener Live Discovery (Free)', 'https://api.dexscreener.com', 0, 1),
  ('geckoterminal', 'DISCOVERY', 'GeckoTerminal Multi-Chain Pools (Free)', 'https://api.geckoterminal.com/api/v2', 0, 1),
  ('jupiter', 'AGGREGATOR', 'Jupiter Solana Aggregator & Quotes', 'https://quote-api.jup.ag/v6', 0, 1),
  ('rugcheck', 'SECURITY', 'RugCheck Solana Token Safety (Free)', 'https://api.rugcheck.xyz/v1', 0, 1),
  ('honeypot_is', 'SECURITY', 'Honeypot.is EVM Contract Scanner (Free)', 'https://api.honeypot.is/v2', 0, 1),
  ('moralis', 'DISCOVERY', 'Moralis Web3 & Top Traders / Streams', 'https://deep-index.moralis.io/api/v2.2', 1, 0),
  ('birdeye', 'DISCOVERY', 'Birdeye Smart Money & PnL Leaderboard', 'https://public-api.birdeye.so', 1, 0),
  ('helius', 'RPC', 'Helius Solana Webhooks & Enhanced RPC', 'https://api.helius.xyz/v0', 1, 0),
  ('goplus', 'SECURITY', 'GoPlus Security Token Audit API', 'https://api.gopluslabs.io/api/v1', 1, 0),
  ('oneinch', 'AGGREGATOR', '1inch Multi-Chain EVM Swap Aggregator', 'https://api.1inch.dev/swap/v6.0', 1, 0);

CREATE TABLE IF NOT EXISTS smart_wallet_traders (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'AUTO_TOP10', -- AUTO_TOP10 | SITE_PICK | USER_CUSTOM
  added_by_user_id TEXT,
  wallet_address TEXT NOT NULL,
  chain_id TEXT NOT NULL DEFAULT 'solana', -- solana | bsc | ethereum | base | arbitrum | polygon | optimism | avalanche | ton | tron | sui
  display_name TEXT NOT NULL,
  style_tag TEXT NOT NULL DEFAULT 'Smart Money',
  roi_7d_pct REAL NOT NULL DEFAULT 0,
  roi_30d_pct REAL NOT NULL DEFAULT 0,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  win_rate REAL NOT NULL DEFAULT 0,
  avg_hold_mins INTEGER NOT NULL DEFAULT 45,
  trades_30d INTEGER NOT NULL DEFAULT 0,
  safety_discipline_score INTEGER NOT NULL DEFAULT 80,
  is_bot_filtered INTEGER NOT NULL DEFAULT 0,
  top_tokens_json TEXT NOT NULL DEFAULT '[]',
  recent_trades_json TEXT NOT NULL DEFAULT '[]',
  last_seen_tx_hash TEXT,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_smart_wallet_unique_owner
  ON smart_wallet_traders(wallet_address, chain_id, COALESCE(added_by_user_id, 'PLATFORM'));
CREATE INDEX IF NOT EXISTS idx_smart_wallet_source_active
  ON smart_wallet_traders(source_type, is_active, roi_30d_pct DESC);
CREATE INDEX IF NOT EXISTS idx_smart_wallet_added_by
  ON smart_wallet_traders(added_by_user_id, is_active);

CREATE TABLE IF NOT EXISTS copy_follow_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trader_kind TEXT NOT NULL DEFAULT 'SMART_WALLET', -- SMART_WALLET | SITE_TRADER
  trader_id TEXT NOT NULL,
  trader_label TEXT NOT NULL DEFAULT '',
  chain_id TEXT NOT NULL DEFAULT 'solana',
  execution_mode TEXT NOT NULL DEFAULT 'TRUST_ONE_CLICK', -- TRUST_ONE_CLICK | AUTO_EVM_ALLOWANCE | AUTO_COPY_VAULT
  allocated_margin_usd REAL NOT NULL DEFAULT 100,
  used_margin_usd REAL NOT NULL DEFAULT 0,
  sizing_mode TEXT NOT NULL DEFAULT 'FIXED_USD', -- FIXED_USD | PCT_ALLOCATION | PROPORTIONAL
  order_size_usd REAL NOT NULL DEFAULT 25,
  order_size_pct REAL NOT NULL DEFAULT 15,
  leverage INTEGER NOT NULL DEFAULT 5,
  tp1_pct REAL NOT NULL DEFAULT 30,
  tp1_sell_pct REAL NOT NULL DEFAULT 40,
  tp2_pct REAL NOT NULL DEFAULT 75,
  tp2_sell_pct REAL NOT NULL DEFAULT 40,
  tp3_pct REAL NOT NULL DEFAULT 150,
  moonbag_pct REAL NOT NULL DEFAULT 20,
  stop_loss_pct REAL NOT NULL DEFAULT 20,
  trailing_activate_pct REAL NOT NULL DEFAULT 25,
  trailing_drop_pct REAL NOT NULL DEFAULT 10,
  break_even_pct REAL NOT NULL DEFAULT 18,
  time_limit_hours INTEGER NOT NULL DEFAULT 48,
  min_safety_score INTEGER NOT NULL DEFAULT 60,
  max_slippage_pct REAL NOT NULL DEFAULT 15,
  min_liquidity_usd REAL NOT NULL DEFAULT 15000,
  min_mcap_usd REAL NOT NULL DEFAULT 25000,
  max_mcap_usd REAL NOT NULL DEFAULT 50000000,
  max_open_positions INTEGER NOT NULL DEFAULT 4,
  daily_max_loss_usd REAL NOT NULL DEFAULT 60,
  daily_loss_used_usd REAL NOT NULL DEFAULT 0,
  only_new_positions INTEGER NOT NULL DEFAULT 1,
  copy_sells INTEGER NOT NULL DEFAULT 1,
  dev_sell_auto_exit INTEGER NOT NULL DEFAULT 1,
  anti_mev INTEGER NOT NULL DEFAULT 1,
  ai_guard_enabled INTEGER NOT NULL DEFAULT 1,
  reverse_copy INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_copy_follow_rules_unique
  ON copy_follow_rules(user_id, trader_kind, trader_id);
CREATE INDEX IF NOT EXISTS idx_copy_follow_rules_active
  ON copy_follow_rules(is_active, trader_kind, trader_id);
CREATE INDEX IF NOT EXISTS idx_copy_follow_rules_user
  ON copy_follow_rules(user_id, is_active);

CREATE TABLE IF NOT EXISTS user_copy_vaults (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  evm_address TEXT NOT NULL,
  solana_address TEXT NOT NULL,
  tron_address TEXT,
  ton_address TEXT,
  encrypted_keys_json TEXT NOT NULL,
  allowance_limit_usd REAL NOT NULL DEFAULT 500,
  auto_withdraw_to_trust INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS copy_positions_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  trader_kind TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  trader_label TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  dex_name TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'BUY', -- BUY | SELL | LONG | SHORT
  margin_usd REAL NOT NULL,
  entry_price_usd REAL NOT NULL,
  current_price_usd REAL NOT NULL,
  qty_tokens REAL NOT NULL DEFAULT 0,
  remaining_pct REAL NOT NULL DEFAULT 100,
  tp1_hit INTEGER NOT NULL DEFAULT 0,
  tp2_hit INTEGER NOT NULL DEFAULT 0,
  tp3_hit INTEGER NOT NULL DEFAULT 0,
  peak_pnl_pct REAL NOT NULL DEFAULT 0,
  pnl_pct REAL NOT NULL DEFAULT 0,
  pnl_usd REAL NOT NULL DEFAULT 0,
  safety_score INTEGER NOT NULL DEFAULT 75,
  ai_guard_note TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', -- PENDING_TRUST_SIGN | OPEN | CLOSED | SKIPPED_SAFETY | SKIPPED_AI
  trust_dapp_url TEXT,
  tx_hash TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_copy_positions_v2_user_status
  ON copy_positions_v2(user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_positions_v2_status_open
  ON copy_positions_v2(status, chain_id);
CREATE INDEX IF NOT EXISTS idx_copy_positions_v2_rule
  ON copy_positions_v2(rule_id, status);
