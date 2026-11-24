-- Migration 0031: Remove CEX references from subscription_plans & align copy exclusively to Trust Wallet + $10k Simulator + 24/7 Auto-Trade

UPDATE subscription_plans
SET
  description_fa = 'دسترسی کامل به هوش مصنوعی دلارینو، استراتژی منتخب، هوش مصنوعی من و کپی‌ترید V2 روی Trust Wallet',
  description_en = 'Full Dollarino AI, My AI, Hunting & Smart Copy V2 with 24/7 Trust Wallet & $10K Simulator',
  features_json = '["ترید خودکار با هوش مصنوعی دلارینو (تایید دستی یا تمام‌اتومات ۲۴/۷)","استراتژی شکار دُرنا V1 / KBOS / SP2L با اسکن کل بازار","کپی‌ترید هوشمند V2 ولت‌ها و کانال تلگرام","اتصال انحصاری Trust Wallet + شبیه‌ساز دمو $10,000"]',
  updated_at = datetime('now')
WHERE code = 'pro_monthly';

UPDATE subscription_plans
SET
  description_fa = '۹۰ روز دسترسی کامل به تمام امکانات + اولویت اسکن بازار، خزانه ۲۴/۷ و پشتیبانی اختصاصی',
  description_en = '90 days full VIP access with priority multi-coin scanning, 24/7 Copy-Vault & dedicated support',
  features_json = '["۹۰ روز دسترسی کامل به هوش مصنوعی، شکار، کپی‌ترید V2 و Perp DEX","اولویت پردازش چندارزی و تا ۲۰ پوزیشن همزمان","فعال‌سازی ۲۴/۷ اتوترید Trust Wallet (Agent Key + Copy-Vault)","پشتیبانی مستقیم مدیریت و بروزرسانی‌های جدید"]',
  updated_at = datetime('now')
WHERE code = 'vip_quarterly';

UPDATE subscription_plans
SET
  description_fa = '۱۸۰ روز دسترسی کامل به اتوترید ۲۴/۷، کپی‌ترید V2، هوش مصنوعی من و Trust Wallet با ۲۵٪ تخفیف',
  description_en = '180 days full AI, Strategy, Smart Copy V2 & 24/7 Trust Wallet access (25% savings)',
  features_json = '["۱۸۰ روز دسترسی نامحدود به تمام امکانات حرفه‌ای","اتوترید ۲۴/۷ و کپی‌ترید خودکار بدون محدودیت","تحلیل چارت و عکس با هوش مصنوعی مرکزی دلارینو","صرفه‌جویی ۳۰ دلار نسبت به خرید ماهانه"]',
  updated_at = datetime('now')
WHERE code = 'pro_semiannual';

UPDATE subscription_plans
SET
  description_fa = '۳۶۵ روز دسترسی کامل طلایی با ۳۳٪ تخفیف ویژه معامله‌گران مداوم',
  description_en = '365 days full golden access with maximum 33% annual savings',
  features_json = '["۳۶۵ روز دسترسی کامل به تمام موتورهای AI و Trust Wallet","اولویت پردازش سیگنال، خزانه ۲۴/۷ و Perp DEX 100x","پشتیبانی مستقیم تیم فنی دلارینو","بیشترین تخفیف سالانه (۸۰ دلار صرفه‌جویی)"]',
  updated_at = datetime('now')
WHERE code = 'pro_annual';

UPDATE system_settings
SET value = REPLACE(
  REPLACE(
    REPLACE(value, 'Toobit، Bitunix، KCEX و Trust Wallet', 'Trust Wallet و شبیه‌ساز دمو $10K'),
    'Toobit / Bitunix / KCEX',
    'Trust Wallet + شبیه‌ساز دمو $10K'
  ),
  'صرافی‌های Toobit، Bitunix و KCEX',
  'کیف‌پول Trust Wallet و Perp DEX'
)
WHERE key = 'bot_help_text';
