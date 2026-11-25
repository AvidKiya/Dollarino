import type { D1Database } from '@cloudflare/workers-types';
import { DOLLARINO_CREATOR_INFO } from '../ai/assistant.js';

export interface FounderProfile {
  fullNameFa: string;
  fullNameEn: string;
  roleFa: string;
  roleEn: string;
  photoUrl: string;
  email: string;
  phone: string;
  addressFa: string;
  addressEn: string;
  telegram: string;
  telegramUrl: string;
  channel: string;
  channelUrl: string;
  instagram: string;
  instagramUrl: string;
  twitter: string;
  twitterUrl: string;
  github: string;
  website: string;
  verificationId: string;
  independenceFa: string;
  independenceEn: string;
  bioFa: string;
  bioEn: string;
  missionFa: string;
  missionEn: string;
  antiPonziFa: string;
  antiPonziEn: string;
  showPublic: boolean;
  updatedAt?: string | null;
}

export const DEFAULT_FOUNDER_PROFILE: FounderProfile = {
  fullNameFa: DOLLARINO_CREATOR_INFO.nameFa,
  fullNameEn: DOLLARINO_CREATOR_INFO.nameEn,
  roleFa: 'بنیان‌گذار، طراح و برنامه‌نویس ۱۰۰٪ مستقل (۰ تا ۱۰۰ دلارینو)',
  roleEn: 'Founder & 100% Independent Solo Architect (0-to-100 Dollarino)',
  photoUrl: '',
  email: '',
  phone: '',
  addressFa: '',
  addressEn: '',
  telegram: DOLLARINO_CREATOR_INFO.telegram,
  telegramUrl: DOLLARINO_CREATOR_INFO.telegramUrl,
  channel: '@Dollarino_official',
  channelUrl: 'https://t.me/Dollarino_official',
  instagram: DOLLARINO_CREATOR_INFO.instagram,
  instagramUrl: DOLLARINO_CREATOR_INFO.instagramUrl,
  twitter: DOLLARINO_CREATOR_INFO.twitter,
  twitterUrl: DOLLARINO_CREATOR_INFO.twitterUrl,
  github: '',
  website: 'https://dollarino.pages.dev',
  verificationId: 'TG-OWNER-944021185',
  independenceFa:
    '۰ تا ۱۰۰ طراحی، معماری سرور، هوش مصنوعی و کدنویسی دلارینو به‌صورت کاملاً مستقل توسط شخص سازنده انجام شده و تحت پوشش یا مالکیت هیچ شرکت، نهاد یا شخص ثالثی نیست.',
  independenceEn:
    '100% of Dollarino was designed, engineered, and coded independently from scratch by the founder with zero third-party shell ownership or hidden backers.',
  bioFa:
    'من این پروژه را با هویت واقعی و شفاف ساخته‌ام تا تمام کاربران، همکاران و حتی مراجع قانونی و پلیس بتوانند به‌سادگی هویت سازنده، راه‌های تماس مستقیم و مدل مالی پروژه را بررسی و استعلام کنند.',
  bioEn:
    'Built with full, verifiable identity transparency so every trader and authority can inspect the founder profile, direct contacts, and zero-custody architecture.',
  missionFa:
    'هدف دلارینو ارائه ابزارهای حرفه‌ای هوش مصنوعی، کپی‌ترید امن و سپر ضدراگ روی کیف‌پول شخصی Trust Wallet بدون اشتراک ماهانه و بدون نگه‌داری سرمایه کاربران است.',
  missionEn:
    'Dollarino democratizes institutional AI trading, verified copy-trading, and anti-rug protection directly on self-custody Trust Wallet with $0 subscriptions.',
  antiPonziFa:
    'دلارینو هیچ‌گونه سرمایه یا سپرده‌ای از کاربران دریافت و نگهداری نمی‌کند، هیچ سود ثابت یا تضمینی وعده نمی‌دهد، و ۳ معامله سودده اول واقعی ۰٪ کارمزد است؛ پس از آن صرفاً ۳٪ کارمزد سرور از سود خالص معاملات واقعی محاسبه می‌شود (۹۷٪ سود متعلق به کاربر است و رفرال صرفاً اعتبار کارمزد غیرقابل برداشت محسوب می‌شود).',
  antiPonziEn:
    'Dollarino never holds user deposits, never promises fixed/guaranteed returns, offers your first 3 profitable live trades completely 0% fee, and then charges strictly a 3% server fee on real net profits (97% stays with the trader).',
  showPublic: true,
  updatedAt: null,
};

const KEY_TO_FIELD: Array<[string, keyof Omit<FounderProfile, 'showPublic' | 'updatedAt'>]> = [
  ['founder_full_name_fa', 'fullNameFa'],
  ['founder_full_name_en', 'fullNameEn'],
  ['founder_role_fa', 'roleFa'],
  ['founder_role_en', 'roleEn'],
  ['founder_photo_url', 'photoUrl'],
  ['founder_email', 'email'],
  ['founder_phone', 'phone'],
  ['founder_address_fa', 'addressFa'],
  ['founder_address_en', 'addressEn'],
  ['founder_telegram', 'telegram'],
  ['founder_telegram_url', 'telegramUrl'],
  ['founder_channel', 'channel'],
  ['founder_channel_url', 'channelUrl'],
  ['founder_instagram', 'instagram'],
  ['founder_instagram_url', 'instagramUrl'],
  ['founder_twitter', 'twitter'],
  ['founder_twitter_url', 'twitterUrl'],
  ['founder_github', 'github'],
  ['founder_website', 'website'],
  ['founder_verification_id', 'verificationId'],
  ['founder_independence_fa', 'independenceFa'],
  ['founder_independence_en', 'independenceEn'],
  ['founder_bio_fa', 'bioFa'],
  ['founder_bio_en', 'bioEn'],
  ['founder_mission_fa', 'missionFa'],
  ['founder_mission_en', 'missionEn'],
  ['founder_anti_ponzi_fa', 'antiPonziFa'],
  ['founder_anti_ponzi_en', 'antiPonziEn'],
];

function cleanStr(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function normalizeHandleUrl(handle: string, explicitUrl: string, prefix: string): string {
  const u = explicitUrl.trim();
  if (u) return u;
  const h = handle.trim().replace(/^@+/, '');
  return h ? `${prefix}${h}` : '';
}

export async function getFounderProfile(db: D1Database): Promise<FounderProfile> {
  const out: FounderProfile = { ...DEFAULT_FOUNDER_PROFILE };
  try {
    const res = await db
      .prepare(`SELECT key, value, updated_at FROM system_settings WHERE key LIKE 'founder_%'`)
      .all<{ key: string; value: string; updated_at: string | null }>();
    const map = new Map<string, string>();
    let latestUpdated: string | null = null;
    for (const row of res.results ?? []) {
      map.set(row.key, row.value);
      if (row.updated_at && (!latestUpdated || row.updated_at > latestUpdated)) {
        latestUpdated = row.updated_at;
      }
    }
    for (const [dbKey, field] of KEY_TO_FIELD) {
      if (map.has(dbKey)) {
        const val = map.get(dbKey) ?? '';
        // Only override required brand defaults if non-empty, allow clearing optional contact fields
        const optionalFields = new Set([
          'photoUrl',
          'email',
          'phone',
          'addressFa',
          'addressEn',
          'github',
          'verificationId',
        ]);
        if (optionalFields.has(field) || val.trim().length > 0) {
          out[field] = val;
        }
      }
    }
    if (map.has('founder_show_public')) {
      out.showPublic = map.get('founder_show_public') !== 'false';
    }
    out.telegramUrl = normalizeHandleUrl(out.telegram, out.telegramUrl, 'https://t.me/');
    out.channelUrl = normalizeHandleUrl(out.channel, out.channelUrl, 'https://t.me/');
    out.instagramUrl = normalizeHandleUrl(out.instagram, out.instagramUrl, 'https://instagram.com/');
    out.twitterUrl = normalizeHandleUrl(out.twitter, out.twitterUrl, 'https://x.com/');
    out.updatedAt = latestUpdated;
  } catch {
    // fallback gracefully to defaults if system_settings unavailable
  }
  return out;
}

export async function saveFounderProfile(
  db: D1Database,
  patch: Partial<FounderProfile>
): Promise<{ ok: true; profile: FounderProfile } | { ok: false; error: string }> {
  const entries: Array<[string, string]> = [];

  if (patch.photoUrl !== undefined) {
    const p = String(patch.photoUrl ?? '').trim();
    if (p.length > 0) {
      const isDataImg = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(p);
      const isHttp = /^https?:\/\/.+/i.test(p) || p.startsWith('/images/');
      if (!isDataImg && !isHttp) {
        return { ok: false, error: 'فرمت عکس نامعتبر است (فقط PNG/JPG/WEBP یا لینک HTTPS).' };
      }
      if (p.length > 520_000) {
        return { ok: false, error: 'حجم عکس نباید بیشتر از ۴۰۰ کیلوبایت باشد.' };
      }
    }
    entries.push(['founder_photo_url', p]);
  }

  for (const [dbKey, field] of KEY_TO_FIELD) {
    if (field === 'photoUrl') continue;
    const raw = patch[field];
    if (raw !== undefined) {
      const maxLen =
        field.endsWith('Fa') || field.endsWith('En')
          ? field.startsWith('fullName') || field.startsWith('role')
            ? 180
            : 1200
          : 260;
      entries.push([dbKey, cleanStr(raw, maxLen)]);
    }
  }

  if (patch.showPublic !== undefined) {
    entries.push(['founder_show_public', patch.showPublic ? 'true' : 'false']);
  }

  if (entries.length > 0) {
    const stmts = entries.map(([k, v]) =>
      db
        .prepare(
          `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        )
        .bind(k, v)
    );
    await db.batch(stmts);
  }

  const profile = await getFounderProfile(db);
  return { ok: true, profile };
}
