-- V11.7 Pro Sniper 5-Minute Age & Multi-Metric Filters
ALTER TABLE bot_configs ADD COLUMN sniper_max_pair_age_minutes INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE bot_configs ADD COLUMN sniper_advanced_filters_json TEXT NOT NULL DEFAULT '{}';
