-- Dollarino V11.4: Strict Initial Onboarding Mode+Risk Gate & Complete Listing/Meme Sniper Settings
ALTER TABLE bot_configs ADD COLUMN trading_mode_selected INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN sniper_target_type TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE bot_configs ADD COLUMN sniper_min_liquidity_usd REAL NOT NULL DEFAULT 25000;
ALTER TABLE bot_configs ADD COLUMN sniper_max_pair_age_hours REAL NOT NULL DEFAULT 24;
ALTER TABLE bot_configs ADD COLUMN sniper_max_tax_pct REAL NOT NULL DEFAULT 5;
ALTER TABLE bot_configs ADD COLUMN sniper_tp_pct REAL NOT NULL DEFAULT 35;
ALTER TABLE bot_configs ADD COLUMN sniper_sl_pct REAL NOT NULL DEFAULT 15;
ALTER TABLE bot_configs ADD COLUMN sniper_trailing_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN sniper_trailing_pct REAL NOT NULL DEFAULT 8;
ALTER TABLE bot_configs ADD COLUMN sniper_max_open_positions INTEGER NOT NULL DEFAULT 3;
ALTER TABLE bot_configs ADD COLUMN sniper_auto_execute INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN sniper_slippage_pct REAL NOT NULL DEFAULT 3;
