import {
  Bot,
  CircleHelp,
  CreditCard,
  Gift,
  Image,
  Moon,
  Radar,
  Shield,
  Sparkles,
  Sun,
  Users,
  Zap,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import type { LookId } from '../components/AppearanceModal';
import type { UiMode } from '../components/Layout';

export function ServicesPage({
  lang,
  uiMode,
  onToggleUiMode,
  currentLook,
  onToggleDaylight,
  user,
  data,
  onNavigate,
  onLogout,
}: {
  lang: Lang;
  uiMode: UiMode;
  onToggleUiMode: (mode: UiMode) => void;
  currentLook: LookId;
  onToggleDaylight: () => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  onNavigate: (tab: NavTab) => void;
  onLogout: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const Arrow = isFa ? ChevronLeft : ChevronRight;

  const quickShortcuts: Array<{
    tab: NavTab;
    title: string;
    icon: typeof Bot;
    color: string;
    bg: string;
  }> = [
    {
      tab: 'terminal',
      title: isFa ? 'معامله آسان و حرفه‌ای' : 'Easy & Pro Trade',
      icon: Zap,
      color: '#1652F0',
      bg: 'rgba(22, 82, 240, 0.12)',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار و آزمایشگاه' : 'Radar & Lab',
      icon: Radar,
      color: '#10B981',
      bg: 'rgba(16, 185, 129, 0.12)',
    },
    {
      tab: 'copy',
      title: isFa ? 'اتصال صرافی و کپی‌ترید' : 'Exchanges & Copy',
      icon: Users,
      color: '#0EA5E9',
      bg: 'rgba(14, 165, 233, 0.12)',
    },
    {
      tab: 'pricing',
      title: isFa ? 'کد هدیه و اشتراک' : 'Gift & Plans',
      icon: Gift,
      color: '#F59E0B',
      bg: 'rgba(245, 158, 11, 0.14)',
    },
  ];

  const featuredServices: Array<{
    tab: NavTab;
    title: string;
    subtitle: string;
    icon: typeof Bot;
    badge?: string;
    adminOnly?: boolean;
  }> = [
    {
      tab: 'overview',
      title: isFa ? 'ربات معامله‌گر هوشمند ۲۴/۷' : '24/7 Autonomous AI Bot',
      subtitle: isFa
        ? 'مدیریت خودکار استاپ، تریلینگ، TP1/TP2/TP3 و ریسک‌فری خودکار'
        : 'Automated TP1/TP2/TP3, breakeven, and AI confidence filtering',
      icon: Bot,
      badge: data.config.bot_state.startsWith('RUNNING') ? (isFa ? 'روشن' : 'LIVE') : isFa ? 'آماده' : 'READY',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار شکار فرصت و بک‌تست' : 'Market Radar & Backtester',
      subtitle: isFa
        ? 'اسکن ۸۰۷ جفت‌ارز فیوچرز با تحلیل تکنیکال و هوش مصنوعی دُرّبین'
        : 'Multi-symbol futures radar with real-candle backtesting',
      icon: Sparkles,
    },
    {
      tab: 'copy',
      title: isFa ? 'اتصال Toobit و کپی‌ترید تلگرام' : 'Toobit API & Telegram Bot',
      subtitle: isFa
        ? 'اتصال امن AES-256 بدون دسترسی برداشت + KCEX Signal-Mirror'
        : 'AES-256 trade-only exchange vault + Telegram channel sync',
      icon: Users,
    },
    {
      tab: 'card',
      title: isFa ? 'کارت سود هفتگی (PNG)' : 'Weekly Profit Card',
      subtitle: isFa
        ? 'تولید کارت حرفه‌ای عملکرد هفته با یک لمس برای اشتراک‌گذاری'
        : 'Export branded weekly performance cards in one tap',
      icon: Image,
    },
    {
      tab: 'pricing',
      title: isFa ? 'خرید اشتراک، دعوت دوستان و کد هدیه' : 'Plans, Referrals & Gift Codes',
      subtitle: isFa
        ? `${data.entitlement?.hasPaidPlan ? data.entitlement.planNameFa : 'دموی رایگان فعال است'} · دریافت ۷ روز رایگان با دعوت`
        : `${data.entitlement?.hasPaidPlan ? data.entitlement.planNameEn : 'Free Paper Demo Active'} · Refer friends`,
      icon: CreditCard,
    },
    {
      tab: 'faq',
      title: isFa ? 'راهنمای کامل و امنیت حساب' : 'User Guide & Security',
      subtitle: isFa
        ? 'آموزش گام‌به‌گام برای تازه‌کارها تا معامله‌گران حرفه‌ای'
        : 'Step-by-step docs, risk controls & safety checklist',
      icon: CircleHelp,
    },
    ...(isAdmin
      ? [
          {
            tab: 'admin' as NavTab,
            title: isFa ? 'پنل مدیریت کل دلارینو' : 'Super Admin Console',
            subtitle: isFa
              ? 'مدیریت کاربران، اشتراک‌ها، کدهای هدیه، هوش مصنوعی و پیام همگانی'
              : 'Manage users, plans, gift codes, AI engines & Telegram broadcast',
            icon: Shield,
            badge: user.role.toUpperCase(),
            adminOnly: true,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Kifpool-inspired Apple Account & Display Banner */}
      <div className="panel rounded-[28px] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl btn-cobalt grid place-items-center font-display font-black text-lg text-white shrink-0">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display font-bold text-base text-main truncate">{user.username}</h2>
                <CheckCircle2 className="w-4 h-4 text-jade shrink-0" />
              </div>
              <p className="text-xs text-dim truncate">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleDaylight}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl surface-soft text-xs font-bold text-main shrink-0"
          >
            {currentLook === 'paper' ? (
              <>
                <Moon className="w-4 h-4 text-[var(--gold)]" />
                <span>{isFa ? 'شب' : 'Night'}</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-[#F59E0B]" />
                <span>{isFa ? 'روز' : 'Day'}</span>
              </>
            )}
          </button>
        </div>

        {/* Simple vs Pro Segmented Control */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t hairline">
          <span className="text-xs font-bold text-sub">
            {isFa ? 'سطح محیط کاربری:' : 'Interface Level:'}
          </span>
          <div className="ios-segmented">
            <button
              type="button"
              onClick={() => onToggleUiMode('simple')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
                uiMode === 'simple' ? 'ios-pill-active' : 'text-dim'
              }`}
            >
              {isFa ? 'حالت ساده (۱۰-۸۰)' : 'Easy'}
            </button>
            <button
              type="button"
              onClick={() => onToggleUiMode('pro')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
                uiMode === 'pro' ? 'ios-pill-active' : 'text-dim'
              }`}
            >
              {isFa ? 'حالت حرفه‌ای' : 'Pro'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick 2x2 Action Strip (Kifpool Services Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickShortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="panel panel-hover rounded-[24px] p-4 text-center flex flex-col items-center gap-2.5"
            >
              <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: item.bg, color: item.color }}>
                <Icon className="w-6 h-6" />
              </span>
              <span className="text-xs font-extrabold text-main leading-snug">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* Featured Services List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-display font-bold text-sm text-main">
            {isFa ? 'سرویس‌های ویژه دلارینو' : 'Featured Services'}
          </h3>
          <span className="text-[11px] font-bold text-dim">Dollarino OS v6</span>
        </div>

        <div className="panel rounded-[28px] divide-y hairline overflow-hidden">
          {featuredServices.map((srv) => {
            const Icon = srv.icon;
            return (
              <button
                key={srv.tab}
                type="button"
                onClick={() => onNavigate(srv.tab)}
                className="w-full px-4 py-4 flex items-center gap-3.5 hover:bg-[var(--soft)] transition text-start"
              >
                <span
                  className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${
                    srv.adminOnly ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[var(--soft)] text-[var(--gold)]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-main truncate">{srv.title}</span>
                    {srv.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[var(--soft)] text-[var(--gold)]">
                        {srv.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-dim mt-0.5 line-clamp-1">{srv.subtitle}</p>
                </div>
                <Arrow className="w-4 h-4 text-dim shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Sign Out Card */}
      <button
        type="button"
        onClick={() => void onLogout()}
        className="w-full panel rounded-[22px] py-3.5 px-5 flex items-center justify-center gap-2 text-xs font-black text-loss hover:bg-rose-500/10 transition"
      >
        <LogOut className="w-4 h-4" />
        <span>{isFa ? 'خروج از حساب کاربری' : 'Sign Out'}</span>
      </button>
    </div>
  );
}
