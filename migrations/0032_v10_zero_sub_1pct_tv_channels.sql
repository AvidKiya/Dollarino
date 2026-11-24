-- Migration 0032: Free platform (zero paywall) + 1% profit-only server fee ledger + Free TradingView indicator alerts + 5 separated Telegram channels

UPDATE system_settings SET value = 'false', updated_at = datetime('now') WHERE key = 'subscription_required';
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('subscription_required', 'false');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('profit_share_pct', '1.0');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('min_live_trust_usd', '10');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('allow_direct_email_signup', 'false');
INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (
  'help_text',
  '📘 راهنمای دلارینو (V10 رایگان و ۱٪ کارمزد سود)\n۱. تمام ابزارها رایگان است و هیچ اشتراک ماهانه‌ای ندارد.\n۲. ابتدا با شبیه‌ساز دمو $10,000 رایگان تمرین کنید؛ برای ترید واقعی فقط Trust Wallet (حداقل $10) متصل کنید.\n۳. کارمزد سرور فقط ۱٪ از سود معاملات واقعی است (در ضرر و دمو = ۰ تومان).',
  datetime('now')
);

-- 5 separated Telegram channels + toggles
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('signals_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('results_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('news_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('education_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('alerts_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_signals_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_results_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_news_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_education_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_alerts_enabled', 'true');

-- 1% Server Fee Ledger (only accrued on profitable LIVE closed trades; $0 on losses or demo simulator)
CREATE TABLE IF NOT EXISTS server_fee_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trade_id TEXT,
  source TEXT NOT NULL DEFAULT 'PERP_LIVE',
  symbol TEXT NOT NULL,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  fee_pct REAL NOT NULL DEFAULT 1.0,
  fee_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACCRUED',
  tx_hash TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_server_fee_user_created ON server_fee_ledger(user_id, created_at DESC);

-- 100% Free TradingView-style Indicator & Strategy Alerts (evaluated by core + cron, connected to bot)
CREATE TABLE IF NOT EXISTS tradingview_free_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
  timeframe TEXT NOT NULL DEFAULT '15m',
  indicator_id TEXT NOT NULL DEFAULT 'RSI_OVERSOLD',
  params_json TEXT NOT NULL DEFAULT '{}',
  direction_override TEXT NOT NULL DEFAULT 'AUTO',
  auto_trade INTEGER NOT NULL DEFAULT 1,
  notify_telegram INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_signal_price REAL,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tv_free_alerts_active ON tradingview_free_alerts(is_active, symbol);
CREATE INDEX IF NOT EXISTS idx_tv_free_alerts_user ON tradingview_free_alerts(user_id, created_at DESC);
