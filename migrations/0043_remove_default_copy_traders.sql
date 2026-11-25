-- V11.7: Remove hardcoded/default dummy copy traders so Verified Copy Traders stays empty until admin/user explicitly adds traders,
-- disable automatic auto-publish unless admin explicitly turns it on, and add sender_address tracking for banking invoices.

DELETE FROM copy_trader_trades
WHERE trader_id IN ('ct_aria_quant', 'ct_parsa_scalp', 'ct_negin_ai');

DELETE FROM copy_subscriptions
WHERE trader_id IN ('ct_aria_quant', 'ct_parsa_scalp', 'ct_negin_ai');

DELETE FROM copy_traders
WHERE id IN ('ct_aria_quant', 'ct_parsa_scalp', 'ct_negin_ai');

INSERT INTO system_settings (key, value, updated_at)
VALUES ('auto_publish_top_traders', 'false', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = datetime('now');

ALTER TABLE treasury_deposits ADD COLUMN sender_address TEXT;
