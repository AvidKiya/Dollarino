import { useState, type ReactNode } from 'react';
import {
  BrainCircuit,
  CandlestickChart as ChartIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  FileText,
  FlaskConical,
  Globe,
  Home,
  LogOut,
  Menu,
  Moon,
  Power,
  Radar,
  Radio,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { dict, type Lang } from '../lib/i18n';
import { usePwaInstall } from '../lib/pwa';
import { DollarinoBrandMark } from './BrandGraphics';
import { PwaInstallModal } from './PwaInstallModal';

export type NavTab =
  | 'dashboard'
  | 'copytrade'
  | 'subscription'
  | 'flow'
  | 'risk'
  | 'backtest'
  | 'chartAi'
  | 'signals'
  | 'exchange'
  | 'connections'
  | 'logs'
  | 'admin';

export interface EntitlementSummary {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  expiresAt: string | null;
  daysRemaining: number;
}

export function Layout({
  lang,
  setLang,
  theme,
  setTheme,
  activeTab,
  setActiveTab,
  user,
  entitlement,
  botState,
  tradingMode,
  activeExchangeLabel,
  freeBalance,
  onStartStop,
  onKillSwitch,
  onOpenWizard,
  onLogout,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  activeTab: NavTab;
  setActiveTab: (t: NavTab) => void;
  user: { email: string; username: string; role: string };
  entitlement?: EntitlementSummary | null;
  botState: string;
  tradingMode: string;
  activeExchangeLabel: string;
  freeBalance: string;
  onStartStop: () => void;
  onKillSwitch: () => void;
  onOpenWizard: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const t = dict[lang];
  const isFa = lang === 'fa';
  const isRunning = botState.startsWith('RUNNING');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(() =>
    ['flow', 'exchange', 'chartAi', 'backtest', 'risk', 'signals', 'logs'].includes(activeTab)
  );
  const [pwaOpen, setPwaOpen] = useState(false);
  const { canPromptNatively, isInstalled, promptInstall } = usePwaInstall();

  const handleInstallPwa = async () => {
    if (canPromptNatively) {
      const outcome = await promptInstall();
      if (outcome !== 'installed') setPwaOpen(true);
    } else {
      setPwaOpen(true);
    }
  };

  const primaryItems: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof Home; badge?: string }> = [
    { id: 'dashboard', label: isFa ? 'خانه' : 'Home', shortLabel: isFa ? 'خانه' : 'Home', icon: Home },
    { id: 'copytrade', label: isFa ? 'کپی‌ترید' : 'Copy-Trade', shortLabel: isFa ? 'کپی‌ترید' : 'Copy-Trade', icon: Radio },
    { id: 'connections', label: isFa ? 'صرافی و تلگرام' : 'Exchanges', shortLabel: isFa ? 'صرافی' : 'Exchanges', icon: Wallet },
    { id: 'subscription', label: isFa ? 'اشتراک' : 'Plans', shortLabel: isFa ? 'اشتراک' : 'Plans', icon: Crown },
  ];

  const advancedItems: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof Home }> = [
    { id: 'flow', label: isFa ? 'استراتژی دلارینو V0.1' : 'Dollarino V0.1', shortLabel: 'V0.1', icon: Sparkles },
    { id: 'exchange', label: isFa ? 'نمای زنده بازار' : 'Market Terminal', shortLabel: isFa ? 'بازار' : 'Market', icon: ChartIcon },
    { id: 'chartAi', label: isFa ? 'تحلیل چارت هوشمند' : 'Chart AI', shortLabel: 'Chart AI', icon: BrainCircuit },
    { id: 'backtest', label: isFa ? 'شبیه‌ساز بک‌تست' : 'Backtester', shortLabel: isFa ? 'بک‌تست' : 'Backtest', icon: FlaskConical },
    { id: 'risk', label: isFa ? 'تنظیمات ریسک و اهرم' : 'Risk & Leverage', shortLabel: isFa ? 'ریسک' : 'Risk', icon: Sliders },
    { id: 'signals', label: isFa ? 'وب‌هوک تریدینگ‌ویو' : 'Webhooks', shortLabel: isFa ? 'وب‌هوک' : 'Signals', icon: Radar },
    { id: 'logs', label: isFa ? 'گزارش سیستم' : 'Audit Logs', shortLabel: isFa ? 'گزارش' : 'Logs', icon: FileText },
  ];

  const isAdmin = user.role === 'admin' || user.role === 'owner';
  const allItems = [
    ...primaryItems,
    ...(isAdmin ? [{ id: 'admin' as NavTab, label: isFa ? 'مدیریت و AI مرکزی' : 'Admin & Central AI', shortLabel: isFa ? 'مدیریت' : 'Admin', icon: UserCog }] : []),
    ...advancedItems,
  ];
  const primaryMobileTabs: NavTab[] = ['dashboard', 'copytrade', 'connections', 'subscription'];

  const isPaid = Boolean(entitlement?.hasPaidPlan);
  const badgeText = isPaid
    ? entitlement?.planCode.includes('vip')
      ? 'VIP'
      : 'PRO'
    : 'DEMO';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex">
      {/* Desktop Clean Cobalt Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 app-sidebar border-e sticky top-0 h-screen transition-all duration-200 z-30 ${
          collapsed ? 'w-[74px]' : 'w-[254px]'
        }`}
      >
        <div className="px-4 py-4 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <DollarinoBrandMark size={38} glow />
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm text-main truncate">
                    {isFa ? 'دلارینو' : 'DOLLARINO'}
                  </span>
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                      isPaid ? 'bg-[#10D856]/15 text-signal' : 'bg-[#FF8A00]/15 text-flame'
                    }`}
                  >
                    {badgeText}
                  </button>
                </div>
                <p className="text-[11px] text-dim truncate">
                  {isPaid
                    ? isFa
                      ? entitlement?.planNameFa
                      : entitlement?.planNameEn
                    : isFa
                      ? 'حساب دمو رایگان'
                      : 'Free Paper Demo'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded-lg text-dim hover:text-main surface-soft transition"
            title="Toggle Sidebar"
          >
            {isFa ? (
              collapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          <div className="space-y-1.5">
            {!collapsed && (
              <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-dim">
                {isFa ? 'منوی اصلی' : 'MENU'}
              </div>
            )}
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-extrabold transition ${
                    active ? 'btn-cobalt' : 'text-sub hover:text-main hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-dim'}`} />
                  {!collapsed && <span className="flex-1 text-start truncate">{item.label}</span>}
                </button>
              );
            })}

            {isAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                title={isFa ? 'مدیریت و AI مرکزی' : 'Admin & Central AI'}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-extrabold transition ${
                  activeTab === 'admin' ? 'btn-cobalt' : 'text-sub hover:text-main'
                }`}
              >
                <UserCog className={`w-4 h-4 shrink-0 ${activeTab === 'admin' ? 'text-white' : 'text-flame'}`} />
                {!collapsed && <span className="flex-1 text-start truncate">{isFa ? 'مدیریت و AI مرکزی' : 'Admin & Central AI'}</span>}
              </button>
            )}
          </div>

          {/* Optional Pro Tools Drawer */}
          <div className="space-y-1 pt-2 border-t">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-dim hover:text-main transition"
            >
              {!collapsed ? <span>{isFa ? 'بخش تخصصی تریدرها' : 'Pro Tools'}</span> : <Sliders className="w-4 h-4 mx-auto" />}
              {!collapsed && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />}
            </button>
            {showAdvanced &&
              advancedItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      active ? 'btn-cobalt' : 'text-sub hover:text-main'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-dim'}`} />
                    {!collapsed && <span className="flex-1 text-start truncate">{item.label}</span>}
                  </button>
                );
              })}
            {showAdvanced && !collapsed && (
              <button
                onClick={onOpenWizard}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-brand hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-start truncate">{t.wizard}</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t space-y-2">
          {!collapsed && !isPaid && (
            <button
              onClick={() => setActiveTab('subscription')}
              className="w-full py-2.5 px-3 rounded-2xl btn-cobalt text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <Crown className="w-3.5 h-3.5 text-[#fde047]" />
              <span>{isFa ? 'فعال‌سازی نسخه حرفه‌ای' : 'Upgrade to Pro'}</span>
            </button>
          )}
          {!collapsed && (
            <div className="px-3 py-2.5 rounded-2xl surface-soft flex items-center justify-between text-[11px]">
              <span className="text-dim font-semibold">{t.freeBalance}</span>
              <span className="font-mono-num font-black text-signal">${Number(freeBalance || 0).toLocaleString()}</span>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-sub hover:text-rose-500 transition"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-start truncate">{user.username} ({isFa ? 'خروج' : 'Logout'})</span>}
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 border-b app-header">
          <div className="max-w-[1320px] w-full mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="md:hidden shrink-0">
                <DollarinoBrandMark size={34} />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full surface-soft text-xs font-bold text-main">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-[#10D856] animate-pulse' : 'bg-slate-400'}`} />
                  <span className="truncate max-w-[125px] sm:max-w-none">{activeExchangeLabel}</span>
                </span>
                <span
                  className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-extrabold ${
                    tradingMode === 'LIVE' ? 'bg-[#FF8A00]/15 text-flame' : 'banner-cobalt-soft text-brand'
                  }`}
                >
                  {tradingMode === 'LIVE' ? t.liveMode : t.paperMode}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {!isInstalled && (
                <button
                  onClick={handleInstallPwa}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl surface-soft text-signal text-xs font-extrabold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isFa ? 'نصب اپ' : 'Install App'}</span>
                </button>
              )}

              <button
                onClick={onStartStop}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                  isRunning ? 'bg-[#FF8A00]/15 text-flame border border-[#FF8A00]/40' : 'btn-emerald'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isRunning ? t.stopBot : t.startBot}</span>
              </button>

              {showAdvanced && (
                <button
                  onClick={onKillSwitch}
                  title={t.killSwitch}
                  className="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-extrabold bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/35 transition"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{t.killSwitch}</span>
                </button>
              )}

              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={isFa ? 'تغییر تم روز / شب' : 'Light / Dark Mode'}
                aria-label="Toggle Theme"
                className="p-2 rounded-xl surface-soft hover:border-brand transition"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[#FF8A00]" /> : <Moon className="w-4 h-4 text-[#0C44C8]" />}
              </button>

              <button
                onClick={() => setLang(isFa ? 'en' : 'fa')}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl surface-soft text-xs font-bold"
              >
                <Globe className="w-3.5 h-3.5 text-brand" />
                <span>{isFa ? 'EN' : 'فا'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1320px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Kifpool-Style Clean Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 app-header border-t px-2 py-1.5 grid grid-cols-5 gap-1">
        {primaryMobileTabs.map((id) => {
          const item = allItems.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-2xl text-[10px] font-extrabold transition ${
                active ? 'text-brand banner-cobalt-soft' : 'text-dim'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-2xl text-[10px] font-extrabold transition ${
            !primaryMobileTabs.includes(activeTab) ? 'text-brand banner-cobalt-soft' : 'text-dim'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>{isFa ? 'بیشتر' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile Drawer Sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="surface-card border-t rounded-t-3xl w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <DollarinoBrandMark size={36} />
                <div>
                  <div className="text-sm font-black text-main flex items-center gap-2">
                    <span>{user.username}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded banner-cobalt-soft text-brand font-black">{badgeText}</span>
                  </div>
                  <div className="text-xs text-sub">
                    {t.freeBalance}: <span className="text-signal font-mono-num font-black">${Number(freeBalance || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-xl surface-soft text-sub">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {primaryItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-2xl border text-xs font-extrabold ${
                      active ? 'btn-cobalt' : 'surface-soft text-sub'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-brand'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
              {isAdmin && (
                <button
                  onClick={() => {
                    setActiveTab('admin');
                    setMobileMenuOpen(false);
                  }}
                  className={`col-span-2 flex items-center gap-2 p-3 rounded-2xl border text-xs font-extrabold ${
                    activeTab === 'admin' ? 'btn-cobalt' : 'surface-soft text-flame'
                  }`}
                >
                  <UserCog className="w-4 h-4 shrink-0" />
                  <span>{isFa ? 'پنل مدیریت و هوش مصنوعی مرکزی' : 'Admin & Central AI'}</span>
                </button>
              )}
            </div>

            {/* Optional Advanced Section in Mobile Sheet */}
            <div className="pt-2 border-t space-y-2">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-bold text-dim px-1"
              >
                <span>{isFa ? 'ابزارهای تخصصی تریدرها' : 'Advanced Pro Tools'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-2">
                  {advancedItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold ${
                          active ? 'btn-cobalt' : 'surface-soft text-sub'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-brand'}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleInstallPwa();
                }}
                className="flex-1 py-2.5 rounded-xl btn-emerald text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب اپلیکیشن' : 'Install App'}</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="py-2.5 px-4 rounded-xl surface-soft text-rose-500 text-xs font-bold flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pwaOpen && <PwaInstallModal lang={lang} onClose={() => setPwaOpen(false)} />}
    </div>
  );
}
