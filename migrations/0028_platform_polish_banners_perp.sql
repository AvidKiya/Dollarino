-- Dollarino v10.0: Promo Banners Carousel, Non-Custodial Perp DEX (Hyperliquid / Jupiter Perps / GMX),
-- AI Simple Reason Log, and Enhanced Copy-Vault Safety

CREATE TABLE IF NOT EXISTS promo_banners (
  id TEXT PRIMARY KEY,
  badge_fa TEXT NOT NULL DEFAULT 'جدید در دلارینو',
  badge_en TEXT NOT NULL DEFAULT 'NEW IN DOLLARINO',
  title_fa TEXT NOT NULL,
  title_en TEXT NOT NULL,
  subtitle_fa TEXT NOT NULL,
  subtitle_en TEXT NOT NULL,
  cta_label_fa TEXT NOT NULL DEFAULT 'مشاهده و شروع',
  cta_label_en TEXT NOT NULL DEFAULT 'Explore Now',
  cta_target TEXT NOT NULL DEFAULT 'copy',
  image_url TEXT NOT NULL DEFAULT '/images/smart-wallet-radar.webp',
  accent_theme TEXT NOT NULL DEFAULT 'gold',
  placement TEXT NOT NULL DEFAULT 'BOTH',
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_promo_banners_active_sort
  ON promo_banners(is_active, placement, sort_order);

INSERT OR IGNORE INTO promo_banners (
  id, badge_fa, badge_en, title_fa, title_en, subtitle_fa, subtitle_en,
  cta_label_fa, cta_label_en, cta_target, image_url, accent_theme, placement, sort_order, is_active
) VALUES
(
  'banner_smart_copy_v2',
  'جدید · V2 PRO',
  'NEW · V2 PRO',
  'کپی‌ترید هوشمند ولت‌ها با باکس مارجین اختصاصی',
  'Smart-Money Wallet Copy with Isolated Margin Boxes',
  '۱۰ ولت برتر یا آدرس دلخواه را رصد کنید، ۷ روز بک‌تست واقعی بگیرید و با خزانه ۲۴/۷ یا Trust Wallet معامله کنید.',
  'Track Top-10 or custom wallets, run a 7-day backtest, and execute via 24/7 Copy-Vault or Trust Wallet 1-Click.',
  'شروع کپی‌ترید ولت‌ها',
  'Open Smart Copy V2',
  'copy',
  '/images/smart-wallet-radar.webp',
  'gold',
  'BOTH',
  1,
  1
),
(
  'banner_antirug_dapp',
  'سپر امنیتی · ۳ منبعی',
  'ANTI-RUG · 3 SOURCES',
  'سپر ضدراگ واقعی + سوآپ Multi-DApp و فیوچرز کیف‌پول',
  'Real Anti-Rug Shield + Multi-DApp & Wallet Perp Futures',
  'اسکن قرارداد با GoPlus/Honeypot/RugCheck، باز کردن همه صرافی‌های شبکه در Trust Wallet و فیوچرز اهرم‌دار بدون KYC.',
  'Scan contracts live, launch all top DEXs inside Trust Wallet, and trade leveraged Perps directly from your wallet.',
  'اسکن و اتصال کیف‌پول',
  'Launch DEX & Perps',
  'dex',
  '/images/antirug-shield-dapp.webp',
  'emerald',
  'BOTH',
  2,
  1
),
(
  'banner_ai_vision',
  'هوش مصنوعی چندمدله',
  'MULTI-LLM VISION AI',
  'چت هوش مصنوعی + تحلیل عکس چارت با ورود و ۳ تارگت',
  'Dedicated AI Chat + Chart Screenshot Vision Setups',
  'عکس چارت را پیست یا ارسال کنید یا با هوش مصنوعی خام شخصی (My AI) استراتژی خودتان را ۲۴ ساعته آموزش دهید.',
  'Upload any chart screenshot for Entry/SL/3-TP extraction, or teach your blank My AI agent in natural chat.',
  'آموزش هوش مصنوعی من',
  'Train My AI Now',
  'myai',
  '/images/my-ai-brain.webp',
  'cobalt',
  'BOTH',
  3,
  1
);

CREATE TABLE IF NOT EXISTS perp_dex_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  master_address TEXT NOT NULL,
  agent_address TEXT,
  encrypted_agent_secret TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, venue)
);

CREATE TABLE IF NOT EXISTS perp_dex_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT 'hyperliquid',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  leverage INTEGER NOT NULL DEFAULT 5,
  margin_usd REAL NOT NULL DEFAULT 25,
  entry_price REAL NOT NULL DEFAULT 0,
  tp_price REAL,
  sl_price REAL,
  execution_kind TEXT NOT NULL DEFAULT 'DAPP_LINK',
  external_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_perp_dex_orders_user
  ON perp_dex_orders(user_id, created_at DESC);

ALTER TABLE bot_configs ADD COLUMN last_ai_reason TEXT;
ALTER TABLE bot_configs ADD COLUMN last_ai_decision_at TEXT;
