-- Dollarino V11.1: Dynamic Capital Budget Cap & Capital-Aware Recommended Settings
ALTER TABLE bot_configs ADD COLUMN bot_budget_mode TEXT NOT NULL DEFAULT 'FULL_BALANCE';
ALTER TABLE bot_configs ADD COLUMN bot_budget_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE bot_configs ADD COLUMN bot_budget_pct REAL NOT NULL DEFAULT 100;
