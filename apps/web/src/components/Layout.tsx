import { useState, type ReactNode } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  CandlestickChart as ChartIcon,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  GitBranch,
  Globe,
  KeyRound,
  LogOut,
  Menu,
  Power,
  Radar,
  ShieldAlert,
  Sliders,
  Sparkles,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { dict, type Lang } from '../lib/i18n';

export type NavTab =
  | 'dashboard'
  | 'flow'
  | 'risk'
  | 'backtest'
  | 'chartAi'
  | 'signals'
  | 'exchange'
  | 'connections'
  | 'logs'
  | 'admin';

export function Layout({
  lang,
  setLang,
  activeTab,
  setActiveTab,
  user,
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
  activeTab: NavTab;
  setActiveTab: (t: NavTab) => void;
  user: { email: string; username: string; role: string };
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
  const isRunning = botState.startsWith('RUNNING');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof Activity; badge?: string }>;
  }> = [
    {
      groupLabel: lang === 'fa' ? 'معاملات هوشمند' : 'TRADING DESK',
      items: [
        { id: 'dashboard', label: t.nav.dashboard, shortLabel: lang === 'fa' ? 'ترید' : 'AI Desk', icon: Activity },
        { id: 'exchange', label: t.nav.exchange, shortLabel: lang === 'fa' ? 'صرافی' : 'Exchange', icon: ChartIcon },
        { id: 'connections', label: t.nav.connections, shortLabel: lang === 'fa' ? 'کیف‌پول' : 'Wallets', icon: Wallet },
      ],
    },
    {
      groupLabel: lang === 'fa' ? 'کوانت و استراتژی KBOs' : 'QUANT & KBOs V11',
      items: [
        { id: 'flow', label: t.nav.flow, shortLabel: 'KBOs', icon: GitBranch, badge: 'v11' },
        { id: 'risk', label: t.nav.risk, shortLabel: lang === 'fa' ? 'ریسک' : 'Risk', icon: Sliders },
        { id: 'backtest', label: t.nav.backtest, shortLabel: lang === 'fa' ? 'بک‌تست' : 'Backtest', icon: FlaskConical },
        { id: 'chartAi', label: t.nav.chartAi, shortLabel: 'Chart AI', icon: BrainCircuit },
        { id: 'signals', label: t.nav.signals, shortLabel: lang === 'fa' ? 'سیگنال' : 'Signals', icon: Radar },
      ],
    },
    {
      groupLabel: lang === 'fa' ? 'سیستم و کنترل' : 'SYSTEM',
      items: [
        { id: 'logs', label: t.nav.logs, shortLabel: lang === 'fa' ? 'لاگ' : 'Logs', icon: FileText },
        { id: 'admin', label: t.nav.admin, shortLabel: lang === 'fa' ? 'تنظیمات' : 'Settings', icon: UserCog },
      ],
    },
  ];

  const allItems = navGroups.flatMap((g) => g.items);
  const primaryMobileTabs: NavTab[] = ['dashboard', 'exchange', 'chartAi', 'connections'];

  return (
    <div dir={lang === 'fa' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#080a0e] text-[#e7ecf2] flex">
      {/* Desktop Obsidian Left/Right Sidebar matching timetrade.live */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#0a0c11] border-e border-[#181b23] sticky top-0 h-screen transition-all duration-200 z-30 ${
          collapsed ? 'w-[68px]' : 'w-[244px]'
        }`}
      >
        {/* Brand Header */}
        <div className="px-3.5 py-3.5 border-b border-[#181b23] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#4b73f5]/15 border border-[#4b73f5]/40 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-[#4b73f5]" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-[0.06em] uppercase text-white truncate">
                    {lang === 'fa' ? 'دلارینو' : 'DOLLARINO'}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#27cd86]/15 text-[#27cd86] border border-[#27cd86]/30 font-semibold">
                    FREE
                  </span>
                </div>
                <p className="text-[10px] text-[#6c7689] truncate">{t.brandSub}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded-md text-[#6c7689] hover:text-white hover:bg-[#1a1e26] transition"
            title="Toggle Sidebar"
          >
            {lang === 'fa' ? (
              collapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {navGroups.map((grp) => (
            <div key={grp.groupLabel} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6c7689]">
                  {grp.groupLabel}
                </div>
              )}
              {grp.items.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                      active
                        ? 'bg-[#1a1e26] text-white border border-[#262b36] shadow-sm'
                        : 'text-[#9aa5b5] hover:text-white hover:bg-[#14171f] border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#4b73f5]' : 'text-[#6c7689]'}`} />
                    {!collapsed && <span className="flex-1 text-start truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#4b73f5]/15 text-[#4b73f5] font-mono-num font-semibold">
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
          {!collapsed && (
            <div className="px-2.5 py-2 rounded-lg bg-[#0f1218] border border-[#1c2028] flex items-center justify-between text-[11px]">
              <span className="text-[#6c7689]">{lang === 'fa' ? 'موجودی آزاد' : 'Available'}</span>
              <span className="font-mono-num font-bold text-[#27cd86]">${Number(freeBalance || 0).toLocaleString()}</span>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-[#9aa5b5] hover:text-white hover:bg-[#1a1e26] transition"
          >
            <LogOut className="w-4 h-4 shrink-0 text-[#6c7689]" />
            {!collapsed && <span className="flex-1 text-start truncate">{user.username}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Minimal Utility Bar */}
        <header className="sticky top-0 z-20 border-b border-[#181b23] bg-[#080a0e]/95 backdrop-blur-md">
          <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="md:hidden w-8 h-8 rounded-lg bg-[#4b73f5]/15 border border-[#4b73f5]/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-[#4b73f5]" />
              </div>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f1218] border border-[#1c2028] text-[11px] font-medium text-[#d5dce6]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-[#27cd86] animate-pulse' : 'bg-[#6c7689]'}`} />
                  <span className="truncate max-w-[140px] sm:max-w-none">{activeExchangeLabel}</span>
                </span>
                <span
                  className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
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
              <button
                onClick={onStartStop}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition ${
                  isRunning
                    ? 'bg-[#f59f14]/15 text-[#f59f14] border border-[#f59f14]/40 hover:bg-[#f59f14]/25'
                    : 'bg-[#4b73f5] text-white hover:bg-[#3e64e0] glow-primary'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isRunning ? t.stopBot : t.startBot}</span>
              </button>

              <button
                onClick={onOpenWizard}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#1a1e26] text-[#d5dce6] border border-[#262b36] hover:border-[#4b73f5]/50 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#4b73f5]" />
                <span>{t.wizard}</span>
              </button>

              <button
                onClick={onKillSwitch}
                title={t.killSwitch}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-[#eb493d]/15 hover:bg-[#eb493d] text-[#eb493d] hover:text-white border border-[#eb493d]/35 transition"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.killSwitch}</span>
              </button>

              <button
                onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a1e26] hover:bg-[#232833] text-xs text-[#d5dce6] border border-[#262b36]"
              >
                <Globe className="w-3.5 h-3.5 text-[#6c7689]" />
                <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-5 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
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
              className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-medium transition ${
                active ? 'text-[#4b73f5] bg-[#4b73f5]/10' : 'text-[#6c7689]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-medium transition ${
            !primaryMobileTabs.includes(activeTab) ? 'text-[#4b73f5] bg-[#4b73f5]/10' : 'text-[#6c7689]'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>{lang === 'fa' ? 'منو بیشتر' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile More Menu Bottom Sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end">
          <div className="bg-[#0f1218] border-t border-[#1c2028] rounded-t-2xl w-full p-4 space-y-4 max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1c2028] pb-3">
              <div>
                <div className="text-sm font-bold text-white">{user.username}</div>
                <div className="text-[11px] text-[#6c7689]">
                  {t.freeBalance}: <span className="text-[#27cd86] font-mono-num font-bold">${Number(freeBalance || 0).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg bg-[#1a1e26] text-[#9aa5b5]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {allItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-medium ${
                      active
                        ? 'bg-[#4b73f5]/15 text-white border-[#4b73f5]/40'
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
                  onOpenWizard();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 text-[#4b73f5] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t.wizard}</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="py-2.5 px-4 rounded-xl bg-[#1a1e26] border border-[#262b36] text-[#eb493d] text-xs font-semibold flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 hidden" />
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
