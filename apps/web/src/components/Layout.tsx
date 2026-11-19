import { useState, type ReactNode } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Globe,
  Home,
  Layers,
  LayoutGrid,
  Link2,
  LogOut,
  Moon,
  Power,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  User,
  Wallet,
  Zap,
  X,
} from 'lucide-react';
import { dict, type Lang } from '../lib/i18n';
import { DollarinoBrandMark } from './BrandGraphics';

export type NavTab =
  | 'dashboard'
  | 'flow'
  | 'copytrade'
  | 'subscription'
  | 'risk'
  | 'backtest'
  | 'chartAi'
  | 'signals'
  | 'exchange'
  | 'connections'
  | 'logs'
  | 'admin';

export interface AuthUserInfo {
  id: string;
  email: string;
  username: string;
  role: string;
  telegram_id: string | null;
}

export interface EntitlementSummary {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  daysRemaining: number;
  subscriptionRequired: boolean;
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
  setActiveTab: (tab: NavTab) => void;
  user: AuthUserInfo;
  entitlement?: EntitlementSummary | null;
  botState: string;
  tradingMode: string;
  activeExchangeLabel: string;
  freeBalance: string;
  onStartStop: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onOpenWizard: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const t = dict[lang];
  const isFa = lang === 'fa';
  const isRunning = botState.startsWith('RUNNING');
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  const isPro = Boolean(entitlement?.hasPaidPlan);

  const [moreOpen, setMoreOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const primaryTabs: Array<{ id: NavTab; label: string; icon: typeof Home }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: Home },
    { id: 'copytrade', label: t.nav.copytrade, icon: Bot },
    { id: 'connections', label: t.nav.connections, icon: Link2 },
    { id: 'subscription', label: t.nav.subscription, icon: Crown },
  ];

  const proTabs: Array<{ id: NavTab; label: string; icon: typeof Layers; color: string }> = [
    { id: 'flow', label: t.nav.flow, icon: Layers, color: 'text-signal badge-signal' },
    { id: 'chartAi', label: t.nav.chartAi, icon: BrainCircuit, color: 'text-brand banner-cobalt-soft' },
    { id: 'risk', label: t.nav.risk, icon: Sliders, color: 'text-flame bg-[#FF8A00]/15' },
    { id: 'backtest', label: t.nav.backtest, icon: BarChart3, color: 'text-brand banner-cobalt-soft' },
    { id: 'exchange', label: t.nav.exchange, icon: Activity, color: 'text-signal badge-signal' },
    { id: 'signals', label: t.nav.signals, icon: Zap, color: 'text-flame bg-[#FF8A00]/15' },
    { id: 'logs', label: t.nav.logs, icon: BookOpen, color: 'text-sub surface-soft' },
  ];

  const isProTabActive = proTabs.some((p) => p.id === activeTab);

  const selectTab = (id: NavTab) => {
    setActiveTab(id);
    setMoreOpen(false);
  };

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col">
      {/* Apple iOS / Kifpool Top Bar */}
      <header className="sticky top-0 z-30 border-b app-header">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => selectTab('dashboard')}
              className="flex items-center gap-2.5 text-start focus:outline-none"
            >
              <DollarinoBrandMark size={38} glow />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-base tracking-tight text-main">{t.brand}</span>
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isRunning
                        ? 'badge-signal'
                        : 'surface-soft text-sub'
                    }`}
                  >
                    <span className={`w-2 h-2 ${isRunning ? 'dot-signal animate-pulse' : 'rounded-full bg-slate-400'}`} />
                    <span>
                      {isRunning
                        ? isFa ? 'ربات روشن' : 'Bot Active'
                        : isFa ? 'آماده شروع' : 'Ready'}
                    </span>
                  </span>
                </div>
                <p className="text-[10px] text-dim truncate hidden sm:block">
                  {tradingMode === 'PAPER' ? t.paperMode : activeExchangeLabel}
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Balance Pill */}
            <button
              type="button"
              onClick={() => selectTab('dashboard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl surface-soft text-xs font-extrabold"
            >
              <Wallet className="w-3.5 h-3.5 text-brand" />
              <span dir="ltr" className="font-mono-num text-main">
                ${Number(freeBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </button>

            {/* Primary Start/Stop Button (Desktop) */}
            <button
              type="button"
              onClick={() => void onStartStop()}
              className={`hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-extrabold transition ${
                isRunning ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white shadow-md' : 'btn-emerald'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isRunning ? t.stopBot : t.startBot}</span>
            </button>

            {/* Quick Setup */}
            <button
              type="button"
              onClick={onOpenWizard}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl surface-soft hover:border-brand text-xs font-bold text-main transition"
              title={t.wizard}
            >
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span>{t.wizard}</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="p-2 rounded-2xl surface-soft hover:border-brand transition"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[#FF8A00]" />
              ) : (
                <Moon className="w-4 h-4 text-[#0C44C8]" />
              )}
            </button>

            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setLang(isFa ? 'en' : 'fa')}
              className="px-2.5 py-2 rounded-2xl surface-soft text-xs font-extrabold inline-flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 text-brand" />
              <span>{isFa ? 'EN' : 'FA'}</span>
            </button>

            {/* Profile / Sign Out */}
            <button
              type="button"
              onClick={() => void onLogout()}
              title={t.logout}
              className="hidden sm:inline-flex p-2 rounded-2xl surface-soft text-sub hover:text-loss transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 flex gap-6 pb-28 lg:pb-8">
        {/* Desktop iOS Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 gap-4">
          <div className="surface-card p-3 space-y-1.5">
            {/* Core Beginner Navigation */}
            {primaryTabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-extrabold transition ${
                    active ? 'btn-cobalt' : 'text-sub hover:surface-soft hover:text-main'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {isAdmin && (
              <button
                type="button"
                onClick={() => selectTab('admin')}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-extrabold transition ${
                  activeTab === 'admin' ? 'btn-cobalt' : 'text-flame bg-[#FF8A00]/10 hover:bg-[#FF8A00]/15'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.nav.admin}</span>
              </button>
            )}

            {/* Collapsible Pro Trader Tools */}
            <div className="pt-2 mt-2 border-t">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-extrabold text-sub hover:text-main hover:surface-soft transition"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span>{isFa ? 'امکانات حرفه‌ای تریدرها' : 'Pro Trader Suite'}</span>
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced || isProTabActive ? 'rotate-180' : ''}`} />
              </button>

              {(showAdvanced || isProTabActive) && (
                <div className="mt-1.5 space-y-1">
                  {proTabs.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                          active ? 'btn-cobalt' : 'text-sub hover:surface-soft hover:text-main'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Account & Plan Card */}
          <div className="surface-card p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl banner-cobalt-soft flex items-center justify-center text-brand font-black">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-main truncate">{user.username}</div>
                <div className="text-[11px] text-dim truncate">{user.email}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectTab('subscription')}
              className={`w-full py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-between ${
                isPro ? 'badge-signal' : 'banner-cobalt-soft text-brand'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                <span>{isFa ? entitlement?.planNameFa || 'دمو رایگان' : entitlement?.planNameEn || 'Free Demo'}</span>
              </span>
              <span className="text-[10px] underline">{isPro ? 'VIP' : isFa ? 'ارتقا' : 'Upgrade'}</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={() => void onKillSwitch()}
                className="w-full py-2.5 px-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500 text-rose-500 hover:text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{t.killSwitch}</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Kifpool / iOS Floating Bottom Pill Dock (Mobile & Tablet) */}
      <nav className="lg:hidden fixed bottom-2.5 inset-x-2.5 z-40 ios-dock rounded-[26px] px-2 py-1.5">
        <div className="grid grid-cols-5 items-center gap-1">
          <button
            type="button"
            onClick={() => selectTab('dashboard')}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl text-[10px] font-extrabold transition ${
              activeTab === 'dashboard' ? 'text-brand' : 'text-dim'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span>{isFa ? 'خانه' : 'Home'}</span>
          </button>

          <button
            type="button"
            onClick={() => selectTab('copytrade')}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl text-[10px] font-extrabold transition ${
              activeTab === 'copytrade' ? 'text-brand' : 'text-dim'
            }`}
          >
            <Bot className="w-5 h-5 mb-0.5" />
            <span>{isFa ? 'کپی‌ترید' : 'Copy'}</span>
          </button>

          {/* Elevated Central Cobalt Action Pill (matches Kifpool screenshot dock!) */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void onStartStop()}
              className={`-mt-4 w-full py-2.5 px-2 rounded-2xl shadow-xl flex flex-col items-center justify-center text-[10px] font-black transition ${
                isRunning ? 'bg-[#FF8A00] text-white' : 'btn-cobalt text-white'
              }`}
            >
              <Power className="w-5 h-5 mb-0.5" />
              <span>{isRunning ? (isFa ? 'توقف' : 'Stop') : isFa ? 'شروع' : 'Start'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => selectTab('connections')}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl text-[10px] font-extrabold transition ${
              activeTab === 'connections' ? 'text-brand' : 'text-dim'
            }`}
          >
            <Link2 className="w-5 h-5 mb-0.5" />
            <span>{isFa ? 'صرافی' : 'Connect'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl text-[10px] font-extrabold transition ${
              moreOpen || isProTabActive || activeTab === 'admin' || activeTab === 'subscription' ? 'text-brand' : 'text-dim'
            }`}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            <span>{isFa ? 'ابزارها' : 'More'}</span>
          </button>
        </div>
      </nav>

      {/* iOS More & Pro Hub Drawer (Modeled on Screenshot #4 — Circular quick icons + grouped iOS tiles!) */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-[32px] surface-card p-5 space-y-5 max-h-[88vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-400/40 mx-auto" />

            {/* Profile Card Header */}
            <div className="surface-soft rounded-3xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <DollarinoBrandMark size={44} />
                <div className="min-w-0">
                  <div className="font-black text-sm text-main truncate">{user.username}</div>
                  <div className="text-[11px] text-dim truncate">
                    {isFa ? entitlement?.planNameFa || 'حساب دمو رایگان' : entitlement?.planNameEn || 'Paper Demo'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-2.5 rounded-full surface-card border"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-[#FF8A00]" /> : <Moon className="w-4 h-4 text-[#0C44C8]" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="p-2.5 rounded-full surface-card border"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Circular Quick Icons Row (like Kifpool Screenshot #4!) */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { id: 'subscription' as const, label: isFa ? 'اشتراک' : 'Plans', icon: Crown, bg: 'bg-[#FF8A00]/15 text-flame' },
                { id: 'flow' as const, label: isFa ? 'استراتژی منتخب' : 'Select', icon: Layers, bg: 'badge-signal' },
                { id: 'chartAi' as const, label: isFa ? 'هوش مصنوعی' : 'AI Chart', icon: BrainCircuit, bg: 'banner-cobalt-soft text-brand' },
                { id: 'exchange' as const, label: isFa ? 'ترید دستی' : 'Terminal', icon: Activity, bg: 'surface-soft text-main' },
              ].map((q) => {
                const QIcon = q.icon;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => selectTab(q.id)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:surface-soft transition"
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${q.bg}`}>
                      <QIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold text-main leading-tight">{q.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Grouped iOS Service Tiles */}
            <div className="space-y-2">
              <div className="text-xs font-black text-dim px-1">
                {isFa ? 'ابزارهای کامل تریدرها و مدیریت' : 'Full Trader Suite & Settings'}
              </div>
              <div className="surface-soft rounded-3xl divide-y overflow-hidden">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => selectTab('admin')}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-start hover:opacity-90"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-[#FF8A00]/15 text-flame flex items-center justify-center">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-main">{t.nav.admin}</div>
                        <div className="text-[10px] text-dim">{isFa ? 'مدیریت ۱ تا ۳ مدل هوش مصنوعی دلارینو' : 'Manage 1–3 Dollarino AI slots'}</div>
                      </div>
                    </div>
                    {isFa ? <ChevronLeft className="w-4 h-4 text-dim" /> : <ChevronRight className="w-4 h-4 text-dim" />}
                  </button>
                )}

                {proTabs.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTab(item.id)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:opacity-90"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${item.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-extrabold text-main">{item.label}</span>
                      </div>
                      {isFa ? <ChevronLeft className="w-4 h-4 text-dim" /> : <ChevronRight className="w-4 h-4 text-dim" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenWizard();
                }}
                className="py-3 rounded-2xl btn-cobalt text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <Award className="w-4 h-4" />
                <span>{t.wizard}</span>
              </button>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="py-3 rounded-2xl bg-rose-500/15 text-rose-500 text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
