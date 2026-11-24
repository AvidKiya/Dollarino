-- Migration 0034: Upgrade default profit-share server fee from 1.0% to sustainable 5.0% SaaS standard

UPDATE system_settings
SET value = '5.0', updated_at = datetime('now')
WHERE key = 'profit_share_pct' AND value = '1.0';

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('profit_share_pct', '5.0');

UPDATE system_settings
SET value = '📘 راهنمای دلارینو (V10.2 رایگان و ۵٪ کارمزد سود)\n۱. تمام ابزارها رایگان است و هیچ اشتراک ماهانه‌ای ندارد.\n۲. ابتدا با شبیه‌ساز دمو $10,000 رایگان تمرین کنید؛ برای ترید واقعی فقط Trust Wallet (حداقل $10) متصل کنید.\n۳. کارمزد سرور فقط ۵٪ از سود خالص معاملات واقعی است (۹۵٪ سود متعلق به شما و شبیه‌ساز دمو ۱۰۰٪ رایگان).',
    updated_at = datetime('now')
WHERE key = 'help_text';
