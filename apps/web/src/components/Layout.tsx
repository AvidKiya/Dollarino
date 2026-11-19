import { useState, type ReactNode } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  CandlestickChart as ChartIcon,
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

  const navItems: Array<{ id: NavTab; label: string; shortLabel: string; icon: typeof Activity }> = [
    { id: 'dashboard', label: t.nav.dashboard, shortLabel: lang === 'fa' ? 'ترید' : 'Trade', icon: Activity },
    { id: 'flow', label: t.nav.flow, shortLabel: lang === 'fa' ? 'فلو' : 'Flow', icon: GitBranch },
    { id: 'risk', label: t.nav.risk, shortLabel: lang === 'fa' ? 'ریسک' : 'Risk', icon: Sliders },
    { id: 'backtest', label: t.nav.backtest, shortLabel: lang === 'fa' ? 'بک‌تست' : 'Test', icon: FlaskConical },
    { id: 'chartAi', label: t.nav.chartAi, shortLabel: 'Chart AI', icon: BrainCircuit },
    { id: 'signals', label: t.nav.signals, shortLabel: lang === 'fa' ? 'سیگنال' : 'Signals', icon: Radar },
    { id: 'exchange', label: t.nav.exchange, shortLabel: lang === 'fa' ? 'صرافی' : 'Exchange', icon: ChartIcon },
    { id: 'connections', label: t.nav.connections, shortLabel: lang === 'fa' ? 'اتصال' : 'Vault', icon: KeyRound },
    { id: 'logs', label: t.nav.logs, shortLabel: lang === 'fa' ? 'لاگ' : 'Logs', icon: FileText },
    { id: 'admin', label: t.nav.admin, shortLabel: lang === 'fa' ? 'تنظیمات' : 'Settings', icon: UserCog },
  ];

  const primaryMobileTabs: NavTab[] = ['dashboard', 'chartAi', 'exchange', 'connections'];

  return (
    <div dir={lang === 'fa' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#07090f] text-slate-100 flex flex-col">
      {/* Top Institutional Cockpit Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0b0f17]/95 backdrop-blur-md">
        <div className="max-w-[1640px] mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-900/30 shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm sm:text-base tracking-tight">{t.brand}</span>
                <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  {t.freeBadge}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700/80 truncate max-w-[140px] sm:max-w-none">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="truncate">{activeExchangeLabel}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">{t.brandSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <span className="text-slate-400">{t.freeBalance}:</span>
              <span className="font-mono-num font-bold text-emerald-400">${Number(freeBalance || 0).toLocaleString()}</span>
            </div>

            <span
              className={`hidden sm:inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                tradingMode === 'LIVE'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
              }`}
            >
              {tradingMode === 'LIVE' ? t.liveMode : t.paperMode}
            </span>

            <button
              onClick={onStartStop}
              className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold transition ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-950/40'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isRunning ? t.stopBot : t.startBot}</span>
            </button>

            <button
              onClick={onOpenWizard}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.wizard}</span>
            </button>

            <button
              onClick={onKillSwitch}
              title={t.killSwitch}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white transition"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.killSwitch}</span>
            </button>

            <button
              onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
              className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
            </button>

            <button
              onClick={onLogout}
              title={user.email}
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-slate-400 border border-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{user.username}</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation Strip */}
        <nav className="hidden md:flex max-w-[1640px] mx-auto px-4 pb-2 items-center gap-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 max-w-[1640px] w-full mx-auto p-3 sm:p-4 md:p-5 pb-24 md:pb-6">{children}</main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0b0f17]/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 grid grid-cols-5 gap-1">
        {primaryMobileTabs.map((id) => {
          const item = navItems.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
                active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
            !primaryMobileTabs.includes(activeTab) ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>{lang === 'fa' ? 'منو بیشتر' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile More Menu Bottom Sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end">
          <div className="bg-[#0e131d] border-t border-slate-700 rounded-t-2xl w-full p-4 space-y-4 max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-sm font-bold text-white">{user.username}</div>
                <div className="text-[11px] text-slate-400">{t.freeBalance}: <span className="text-emerald-400 font-mono-num font-bold">${Number(freeBalance || 0).toLocaleString()}</span></div>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-xl bg-slate-800 text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-medium text-start ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenWizard();
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-semibold"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t.wizard}</span>
              </button>
              <button
                onClick={onLogout}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-rose-300 font-semibold"
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
