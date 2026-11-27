-- V11.9.2 Mobile Native Android App: Push Devices & Reliable Notification Inbox
CREATE TABLE IF NOT EXISTS mobile_push_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',     -- 'android' | 'ios'
  push_provider TEXT NOT NULL DEFAULT 'poll',   -- 'fcm' | 'poll'
  fcm_token TEXT,
  app_version TEXT NOT NULL DEFAULT '11.7.2',
  app_build INTEGER NOT NULL DEFAULT 110702,
  device_model TEXT,
  os_version TEXT,
  locale TEXT DEFAULT 'fa',
  channels_json TEXT NOT NULL DEFAULT '{"signals":true,"trades":true,"sniper":true,"security":true,"system":true}',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_active ON mobile_push_devices(user_id, is_active);

CREATE TABLE IF NOT EXISTS mobile_notifications_inbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'SYSTEM',      -- 'TRADE' | 'TP_SL' | 'SIGNAL' | 'SNIPER' | 'SECURITY' | 'SUBSCRIPTION' | 'SYSTEM'
  channel_id TEXT NOT NULL DEFAULT 'dollarino_system',
  priority TEXT NOT NULL DEFAULT 'default',     -- 'high' | 'default'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_link TEXT NOT NULL DEFAULT 'dollarino://app?tab=dashboard',
  data_json TEXT NOT NULL DEFAULT '{}',
  delivered_fcm INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mobile_inbox_user_created ON mobile_notifications_inbox(user_id, created_at DESC);
