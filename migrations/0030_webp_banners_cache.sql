-- Migration 0030: Switch promo banner image URLs to ultra-fast WebP (~90% lighter)
UPDATE promo_banners
SET image_url = REPLACE(image_url, '.png', '.webp')
WHERE image_url LIKE '/images/%.png';
