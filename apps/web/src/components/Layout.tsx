import { useState, type ReactNode } from 'react';
import {
  BrainCircuit,
  CandlestickChart as ChartIcon,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Crown,
  Download,
  FileText,
  FlaskConical,
  Globe,
  LayoutDashboard,
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

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof LayoutDashboard; badge?: string }>;
  }> = [
    {
      groupLabel: isFa ? '۳ روش اصلی معامله' : 'CORE TRADING',
      items: [
        { id: 'dashboard', label: isFa ? 'داشبورد و ترید AI' : 'AI Dashboard', shortLabel: isFa ? 'داشبورد' : 'Home', icon: LayoutDashboard },
        { id: 'flow', label: isFa ? 'استراتژی CodexBot' : 'CodexBot Strategies', shortLabel: 'CodexBot', icon: Cpu, badge: 'PRO' },
        { id: 'copytrade', label: isFa ? 'کپی‌ترید تلگرام' : 'Telegram Copy-Trade', shortLabel: isFa ? 'تلگرام' : 'Telegram', icon: Radio },
        { id: 'connections', label: isFa ? 'صرافی Toobit / KCEX' : 'Exchanges & AI', shortLabel: isFa ? 'صرافی‌ها' : 'Exchanges', icon: Wallet },
        { id: 'subscription', label: isFa ? 'اشتراک و خرید پلن' : 'Subscription', shortLabel: isFa ? 'اشتراک' : 'Plans', icon: Crown },
      ],
    },
    {
      groupLabel: isFa ? 'ابزارهای تحلیل و کنترل' : 'TOOLS & CONTROL',
      items: [
        { id: 'exchange', label: isFa ? 'نمای زنده بازار' : 'Market Terminal', shortLabel: isFa ? 'بازار' : 'Market', icon: ChartIcon },
        { id: 'chartAi', label: isFa ? 'تحلیل چارت با AI' : 'Chart AI', shortLabel: 'Chart AI', icon: BrainCircuit },
        { id: 'backtest', label: isFa ? 'شبیه‌ساز بک‌تست' : 'Backtester', shortLabel: isFa ? 'بک‌تست' : 'Backtest', icon: FlaskConical },
        { id: 'risk', label: isFa ? 'تنظیمات ریسک و اهرم' : 'Risk & Leverage', shortLabel: isFa ? 'ریسک' : 'Risk', icon: Sliders },
        { id: 'signals', label: isFa ? 'وب‌هوک و سیگنال‌ها' : 'Signals Log', shortLabel: isFa ? 'سیگنال' : 'Signals', icon: Radar },
        { id: 'logs', label: isFa ? 'لاگ‌های سیستم' : 'Audit Logs', shortLabel: isFa ? 'لاگ' : 'Logs', icon: FileText },
        { id: 'admin', label: isFa ? 'مدیریت اشتراک و تنظیمات' : 'Admin & Config', shortLabel: isFa ? 'مدیریت' : 'Admin', icon: UserCog },
      ],
    },
  ];

  const allItems = navGroups.flatMap((g) => g.items);
  const primaryMobileTabs: NavTab[] = ['dashboard', 'flow', 'copytrade', 'subscription'];

  const isPaid = Boolean(entitlement?.hasPaidPlan);
  const badgeText = isPaid
    ? entitlement?.planCode.includes('vip')
      ? 'VIP'
      : 'PRO'
    : 'DEMO';

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className={`min-h-screen bg-[#080a0e] text-[#e7ecf2] flex ${theme === 'light' ? 'theme-light' : ''}`}>
      {/* Desktop Clean Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#0a0c11] border-e border-[#181b23] sticky top-0 h-screen transition-all duration-200 z-30 ${
          collapsed ? 'w-[70px]' : 'w-[252px]'
        }`}
      >
        <div className="px-3.5 py-3.5 border-b border-[#181b23] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icons/icon-192.png" alt="Dollarino" className="w-8 h-8 rounded-xl shrink-0 shadow" />
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm text-white truncate">
                    {isFa ? 'دلارینو' : 'DOLLARINO'}
                  </span>
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                      isPaid
                        ? 'bg-[#27cd86]/15 text-[#27cd86] border-[#27cd86]/35'
                        : 'bg-[#f59f14]/15 text-[#f59f14] border-[#f59f14]/35'
                    }`}
                  >
                    {badgeText}
                  </button>
                </div>
                <p className="text-[10px] text-[#6c7689] truncate">
                  {isPaid
                    ? isFa
                      ? entitlement?.planNameFa
                      : entitlement?.planNameEn
                    : isFa
                      ? 'حساب دمو رایگان'
                      : 'Paper Demo Mode'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded-lg text-[#6c7689] hover:text-white hover:bg-[#1a1e26] transition"
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

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {navGroups.map((grp) => (
            <div key={grp.groupLabel} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#6c7689]">
                  {grp.groupLabel}
                </div>
              )}
              {grp.items.map((item) => {
                if (item.id === 'admin' && user.role !== 'admin' && user.role !== 'owner') return null;
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      active
                        ? 'bg-[#2563eb] text-white shadow-md shadow-blue-600/20'
                        : 'text-[#9aa5b5] hover:text-white hover:bg-[#14171f]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-[#6c7689]'}`} />
                    {!collapsed && <span className="flex-1 text-start truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono-num font-bold ${
                          active ? 'bg-white/20 text-white' : 'bg-[#4b73f5]/15 text-[#4b73f5]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-2.5 border-t border-[#181b23] space-y-2">
          {!collapsed && !isPaid && (
            <button
              onClick={() => setActiveTab('subscription')}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow"
            >
              <Crown className="w-3.5 h-3.5 text-[#fde047]" />
              <span>{isFa ? 'خرید اشتراک حرفه‌ای' : 'Upgrade to Pro'}</span>
            </button>
          )}
          {!collapsed && (
            <div className="px-3 py-2 rounded-xl bg-[#0f1218] border border-[#1c2028] flex items-center justify-between text-[11px]">
              <span className="text-[#6c7689]">{isFa ? 'موجودی آزاد' : 'Available'}</span>
              <span className="font-mono-num font-bold text-[#27cd86]">${Number(freeBalance || 0).toLocaleString()}</span>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-[#9aa5b5] hover:text-[#eb493d] hover:bg-[#1a1e26] transition"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-start truncate">{user.username} ({isFa ? 'خروج' : 'Logout'})</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Top Utility Header */}
        <header className="sticky top-0 z-20 border-b border-[#181b23] bg-[#080a0e]/95 backdrop-blur-md">
          <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/icons/icon-192.png" alt="Dollarino" className="md:hidden w-8 h-8 rounded-xl shrink-0" />
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0f1218] border border-[#1c2028] text-[11px] font-semibold text-[#d5dce6]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-[#27cd86] animate-pulse' : 'bg-[#6c7689]'}`} />
                  <span className="truncate max-w-[130px] sm:max-w-none">{activeExchangeLabel}</span>
                </span>
                <span
                  className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${
                    tradingMode === 'LIVE'
                      ? 'bg-[#f59f14]/15 text-[#f59f14] border-[#f59f14]/30'
                      : 'bg-[#4b73f5]/15 text-[#4b73f5] border-[#4b73f5]/30'
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
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#27cd86]/15 hover:bg-[#27cd86]/25 border border-[#27cd86]/35 text-[#27cd86] text-xs font-bold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isFa ? 'نصب اپ' : 'Install App'}</span>
                </button>
              )}

              <button
                onClick={onStartStop}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                  isRunning
                    ? 'bg-[#f59f14]/15 text-[#f59f14] border border-[#f59f14]/40 hover:bg-[#f59f14]/25'
                    : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-md shadow-blue-600/20'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isRunning ? t.stopBot : t.startBot}</span>
              </button>

              <button
                onClick={onOpenWizard}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#1a1e26] text-[#d5dce6] border border-[#262b36] hover:border-[#4b73f5]/50 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#4b73f5]" />
                <span>{t.wizard}</span>
              </button>

              <button
                onClick={onKillSwitch}
                title={t.killSwitch}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold bg-[#eb493d]/15 hover:bg-[#eb493d] text-[#eb493d] hover:text-white border border-[#eb493d]/35 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t.killSwitch}</span>
              </button>

              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={isFa ? 'تم روشن / تیره' : 'Theme'}
                className="p-2 rounded-xl bg-[#1a1e26] border border-[#262b36] text-[#d5dce6] hover:border-[#4b73f5]"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-[#f59f14]" /> : <Moon className="w-3.5 h-3.5 text-[#2563eb]" />}
              </button>

              <button
                onClick={() => setLang(isFa ? 'en' : 'fa')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1a1e26] hover:bg-[#232833] text-xs text-[#d5dce6] border border-[#262b36]"
              >
                <Globe className="w-3.5 h-3.5 text-[#6c7689]" />
                <span>{isFa ? 'EN' : 'فا'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0a0c11]/95 backdrop-blur-md border-t border-[#181b23] px-2 py-1.5 grid grid-cols-5 gap-1">
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
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-semibold transition ${
                active ? 'text-[#2563eb] bg-[#2563eb]/10' : 'text-[#6c7689]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-semibold transition ${
            !primaryMobileTabs.includes(activeTab) ? 'text-[#2563eb] bg-[#2563eb]/10' : 'text-[#6c7689]'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>{isFa ? 'سایر' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile More Menu Bottom Sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end">
          <div className="bg-[#0f1218] border-t border-[#1c2028] rounded-t-3xl w-full p-4 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1c2028] pb-3">
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{user.username}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#2563eb]/20 text-[#4b73f5] font-bold">{badgeText}</span>
                </div>
                <div className="text-[11px] text-[#6c7689]">
                  {t.freeBalance}: <span className="text-[#27cd86] font-mono-num font-bold">${Number(freeBalance || 0).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-xl bg-[#1a1e26] text-[#9aa5b5]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {allItems.map((item) => {
                if (item.id === 'admin' && user.role !== 'admin' && user.role !== 'owner') return null;
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-2xl border text-xs font-semibold ${
                      active
                        ? 'bg-[#2563eb]/15 text-white border-[#2563eb]/45'
                        : 'bg-[#131720] text-[#9aa5b5] border-[#1c2028]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-[#4b73f5]" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#1c2028]">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleInstallPwa();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#27cd86]/15 border border-[#27cd86]/35 text-[#27cd86] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>{isFa ? 'نصب اپ موبایل' : 'Install App'}</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenWizard();
                }}
                className="py-2.5 px-3 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 text-[#4b73f5] text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="py-2.5 px-4 rounded-xl bg-[#1a1e26] border border-[#262b36] text-[#eb493d] text-xs font-bold flex items-center gap-1.5"
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
