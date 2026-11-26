-- V11.9: Official Dollarino 1+7+1 Ecosystem Channels (Main + 7 Sections + Official Bot)

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('official_channel_invite', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('news_channel_invite', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('logs_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('database_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('transactions_channel_id', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_official_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_community_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_logs_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_database_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('channel_transactions_enabled', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('signals_also_official', 'false');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('database_report_interval_hours', '6');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('last_db_channel_report_at', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('last_settlement_digest_at', '');
