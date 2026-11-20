import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  CircleHelp,
  Command,
  CreditCard,
  Flame,
  Globe,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette as PaletteIcon,
  Power,
  Radar,
  RotateCcw,
  Search,
  Shield,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, EntitlementSummary, NavTab } from '../lib/types';
import { AppearanceModal, type LookId } from './AppearanceModal';
import { CoinIcon } from './CoinIcon';
import type { ExchangeMarket } from './SymbolPickerModal';

export type { AuthUserInfo, EntitlementSummary, NavTab };

export function DollarinoCoinMark({ size = 40 }: { size?: number }) {
  return (
    <span className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" className="w-full h-full drop-shadow-[0_4px_16px_rgba(31,99,255,0.35)]">
        <defs>
          <linearGradient id="coinGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--gold-a)" />
            <stop offset="48%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--gold-deep)" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="21" fill="url(#coinGold)" />
        <circle
          cx="24"
          cy="24"
          r="16.5"
          fill="none"
          stroke="var(--bg)"
          strokeOpacity="0.4"
          strokeWidth="1.6"
          strokeDasharray="3 3"
        />
        <text x="24" y="31" textAnchor="middle" fontSize="17" fontWeight="900" fill="var(--bg)" fontFamily="Fraunces, serif">
          D$
        </text>
      </svg>
    </span>
  );
}

const MAIN_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', icon: LayoutDashboard },
  { id: 'terminal', labelFa: 'پایانه و چارت AI', labelEn: 'Terminal & Chart AI', icon: CandlestickChart },
  { id: 'markets', labelFa: 'بازارهای فیوچرز', labelEn: 'Markets', icon: Globe },
  { id: 'radar', labelFa: 'رادار و آزمایشگاه', labelEn: 'Radar & Lab', icon: Radar },
  { id: 'copy', labelFa: 'کپی‌ترید و اتصالات', labelEn: 'Copy & Connect', icon: Users },
  { id: 'portfolio', labelFa: 'پورتفوی و گزارش‌ها', labelEn: 'Portfolio & Logs', icon: Wallet },
];

const ACCOUNT_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof CreditCard }> = [
  { id: 'pricing', labelFa: 'تعرفه‌ها و اشتراک', labelEn: 'Pricing', icon: CreditCard },
  { id: 'faq', labelFa: 'راهنما و سوالات', labelEn: 'FAQ & Guide', icon: CircleHelp },
];

export function tabLabel(id: NavTab, lang: Lang): string {
  const isFa = lang === 'fa';
  if (id === 'card') return isFa ? 'کارت هفتگی' : 'Weekly Card';
  if (id === 'admin') return isFa ? 'مدیریت' : 'Admin';
  const found = [...MAIN_VIEWS, ...ACCOUNT_VIEWS].find((x) => x.id === id);
  return found ? (isFa ? found.labelFa : found.labelEn) : id;
}

export function Layout({
  lang,
  setLang,
  currentLook,
  onSelectLook,
  activeTab,
  setActiveTab,
  user,
  entitlement,
  botState,
  tradingMode,
  activeExchangeLabel,
  freeBalance,
  markets = [],
  openTradesCount = 0,
  recentSignalsCount = 0,
  onStartStop,
  onKillSwitch,
  onResetDemo,
  onSelectSymbolForTerminal,
  onRefresh,
  onGoLanding,
  onLogout,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  currentLook: LookId;
  onSelectLook: (look: LookId) => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  user: AuthUserInfo;
  entitlement?: EntitlementSummary | null;
  botState: string;
  tradingMode: 'PAPER' | 'LIVE';
  activeExchangeLabel: string;
  freeBalance: string;
  markets?: ExchangeMarket[];
  openTradesCount?: number;
  recentSignalsCount?: number;
  onStartStop: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onResetDemo?: () => Promise<void>;
  onSelectSymbolForTerminal?: (sym: string) => void;
  onRefresh?: () => Promise<void>;
  onGoLanding?: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const isFa = lang === 'fa';
  const isRunning = botState.startsWith('RUNNING');
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState('');
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [qtOpen, setQtOpen] = useState(false);
  const [qtSymbol, setQtSymbol] = useState('BTCUSDT');
  const [qtSide, setQtSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [qtLev, setQtLev] = useState(10);
  const [qtBusy, setQtBusy] = useState(false);
  const [qtErr, setQtErr] = useState('');
  const [clock, setClock] = useState('');

  useEffect(() => {
    const f = () =>
      setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    f();
    const iv = setInterval(f, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setQtOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allTabs: NavTab[] = [
    ...MAIN_VIEWS.map((x) => x.id),
    'card',
    ...ACCOUNT_VIEWS.map((x) => x.id),
    ...(isAdmin ? (['admin'] as NavTab[]) : []),
  ];

  const filteredTabs = useMemo(() => {
    const q = paletteQ.trim().toLowerCase();
    if (!q) return allTabs;
    return allTabs.filter((id) => tabLabel(id, lang).toLowerCase().includes(q) || id.includes(q));
  }, [paletteQ, lang, isAdmin]);

  const filteredMarkets = useMemo(() => {
    const q = paletteQ.trim().toLowerCase();
    const list = markets.length ? markets : [];
    if (!q) return list.slice(0, 5);
    return list.filter((m) => m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q)).slice(0, 5);
  }, [markets, paletteQ]);

  const selectTab = (id: NavTab) => {
    setActiveTab(id);
    setDrawerOpen(false);
    setPaletteOpen(false);
    setPaletteQ('');
  };

  const tickerCoins = markets.slice(0, 12);

  const openQuickTradeModal = (sym?: string) => {
    if (sym) setQtSymbol(sym);
    setQtErr('');
    setQtOpen(true);
  };

  const submitQuickTrade = async () => {
    setQtBusy(true);
    setQtErr('');
    try {
      const m = markets.find((x) => x.symbol === qtSymbol);
      const px = Number(m?.lastPrice || 0);
      const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
      const sl = px > 0 ? (qtSide === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec) : undefined;
      const tp1 = px > 0 ? (qtSide === 'LONG' ? px * 1.025 : px * 0.975).toFixed(dec) : undefined;
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol: qtSymbol,
          direction: qtSide,
          orderType: 'MARKET',
          leverage: qtLev,
          marginMode: 'ISOLATED',
          stopLoss: sl,
          tp1,
        }),
      });
      if (!res.ok) {
        setQtErr(res.error || 'Order failed');
      } else {
        setQtOpen(false);
        await onRefresh?.();
        setActiveTab('terminal');
      }
    } catch (e) {
      setQtErr(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setQtBusy(false);
    }
  };

  const renderSidebarBody = (mobile?: boolean) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-6">
        <DollarinoCoinMark />
        <div>
          <p className="font-display font-bold text-[20px] leading-none text-main">
            Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
          </p>
          <p className="text-[9px] font-black tracking-[0.22em] mt-1.5" style={{ color: 'var(--gold)' }}>
            WEALTH OS · V6
          </p>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="ms-auto lg:hidden h-9 w-9 grid place-items-center rounded-full btn-ghost"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mb-2">
        {isFa ? 'بخش‌های اصلی' : 'VIEWS'}
      </p>
      <div className="space-y-0.5">
        {MAIN_VIEWS.map((item) => {
          const Icon = item.icon;
          const on = activeTab === item.id;
          const badge = item.id === 'radar' ? recentSignalsCount : item.id === 'terminal' ? openTradesCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                on ? 'bg-[color:color-mix(in_srgb,var(--gold)_16%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
              }`}
            >
              {on && (
                <span
                  className="absolute start-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full"
                  style={{ background: 'var(--gold)', boxShadow: '0 0 12px var(--gold)' }}
                />
              )}
              <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold)' } : undefined} />
              <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
              {badge > 0 && (
                <span
                  dir="ltr"
                  className="ms-auto text-[10px] font-black rounded-full px-2 py-0.5 tabular"
                  style={{ background: 'var(--gold)', color: 'var(--bg)' }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mt-5 mb-2">
        {isFa ? 'استودیو' : 'STUDIO'}
      </p>
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => selectTab('card')}
          className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
            activeTab === 'card'
              ? 'bg-[color:color-mix(in_srgb,var(--gold)_16%,transparent)] text-main'
              : 'text-dim hover:text-main hover:bg-[var(--soft)]'
          }`}
        >
          {activeTab === 'card' && (
            <span className="absolute start-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full" style={{ background: 'var(--gold)' }} />
          )}
          <Image className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate">{isFa ? 'کارت هفتگی' : 'Weekly Card'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setDrawerOpen(false);
            setAppearanceOpen(true);
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-dim hover:text-main hover:bg-[var(--soft)] transition"
        >
          <PaletteIcon className="w-[18px] h-[18px] shrink-0" />
          <span className="truncate">{isFa ? 'ظاهر برنامه (۴ تم)' : 'Appearance'}</span>
        </button>
      </div>

      <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mt-5 mb-2">
        {isFa ? 'حساب کاربری' : 'ACCOUNT'}
      </p>
      <div className="space-y-0.5">
        {ACCOUNT_VIEWS.map((item) => {
          const Icon = item.icon;
          const on = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                on ? 'bg-[color:color-mix(in_srgb,var(--gold)_16%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
              }`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold)' } : undefined} />
              <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            type="button"
            onClick={() => selectTab('admin')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition ${
              activeTab === 'admin' ? 'btn-gold' : 'text-flame hover:bg-[#FF8A00]/10'
            }`}
          >
            <Shield className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate">{isFa ? 'پنل مدیریت' : 'Admin'}</span>
          </button>
        )}
      </div>

      {/* Bottom Engine Card */}
      <div className="mt-auto pt-5 space-y-2.5">
        <div className="panel rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'bg-gold live-gold'}`} />
            <p className="text-xs font-bold text-main">
              {isRunning ? (isFa ? 'ربات روشن است' : 'Bot Active 24/7') : isFa ? 'همه موتورها آماده‌اند' : 'All engines online'}
            </p>
          </div>
          <p className="text-[10px] text-dim truncate">
            {entitlement?.hasPaidPlan
              ? `${isFa ? entitlement.planNameFa : entitlement.planNameEn}`
              : tradingMode === 'PAPER'
                ? isFa
                  ? 'حساب دمو ($۱۰,۰۰۰ رایگان)'
                  : 'Paper Demo Account'
                : activeExchangeLabel}
          </p>
          <div className="flex gap-1.5 mt-3" dir="ltr">
            {[
              { code: 'AI', c: '#e8c15a', target: 'radar' as NavTab },
              { code: 'V1', c: '#10d9a3', target: 'overview' as NavTab },
              { code: 'CP', c: '#38e1ff', target: 'copy' as NavTab },
            ].map((eng) => (
              <button
                key={eng.code}
                type="button"
                onClick={() => selectTab(eng.target)}
                className="flex-1 text-center text-[10px] font-black rounded-lg py-1.5 border transition hover:scale-105"
                style={{ borderColor: `${eng.c}55`, color: eng.c, background: `${eng.c}16` }}
              >
                {eng.code}
              </button>
            ))}
          </div>
        </div>

        {isRunning && (
          <button
            type="button"
            onClick={() => void onKillSwitch()}
            className="w-full py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{isFa ? 'توقف اضطراری (Kill Switch)' : 'Emergency Kill Switch'}</span>
          </button>
        )}

        <div className="flex items-center justify-between text-[10px] font-semibold text-dim px-1">
          {onResetDemo && tradingMode === 'PAPER' ? (
            <button type="button" onClick={() => void onResetDemo()} className="inline-flex items-center gap-1 hover:text-main transition">
              <RotateCcw className="w-3 h-3" />
              <span>{isFa ? 'ریست دمو' : 'Reset Demo'}</span>
            </button>
          ) : (
            <span className="truncate">{user.username}</span>
          )}
          <button type="button" onClick={() => void onLogout()} className="inline-flex items-center gap-1 hover:text-loss transition">
            <LogOut className="w-3 h-3" />
            <span>{isFa ? 'خروج' : 'Sign Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col">
      {/* Desktop Fixed Sidebar + Main Wrapper */}
      <div className="flex-1 flex min-w-0">
        <aside className="hidden lg:flex w-64 shrink-0 border-e hairline p-4 flex-col sticky top-0 h-screen overflow-y-auto bg-[var(--panel)]/65">
          {renderSidebarBody()}
        </aside>

        {/* Mobile Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-black/70 backdrop-blur-sm flex" onClick={() => setDrawerOpen(false)}>
            <div
              className="w-72 max-w-[85vw] h-full p-5 bg-[var(--panel)] border-e hairline overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {renderSidebarBody(true)}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar (02.zip shell.tsx) */}
          <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--bg)]/85 border-b hairline">
            <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Menu"
                className="lg:hidden h-10 w-10 grid place-items-center rounded-xl btn-ghost shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="lg:hidden flex items-center gap-2 shrink-0">
                <DollarinoCoinMark size={30} />
                <span className="font-display font-bold text-base text-main">
                  Dollarino<span style={{ color: 'var(--gold)' }}>.</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden lg:flex flex-1 max-w-sm items-center gap-2.5 panel rounded-xl px-4 py-2 text-[12px] text-dim hover:border-[var(--gold)] transition text-start"
              >
                <Search className="w-4 h-4 shrink-0" />
                <span className="truncate">{isFa ? 'جستجوی صفحه، ارز یا دستور...' : 'Search views, coins, actions...'}</span>
                <kbd dir="ltr" className="ms-auto text-[9px] border hairline rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="lg:hidden h-10 w-10 grid place-items-center rounded-xl btn-ghost shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>

              <div className="ms-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span dir="ltr" className="hidden xl:flex items-center gap-1.5 text-[10px] font-bold text-dim tabular px-2">
                  <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
                  {clock} UTC
                </span>

                <button
                  type="button"
                  onClick={() => setAppearanceOpen(true)}
                  title={isFa ? 'انتخاب ظاهر برنامه' : 'Signature Look'}
                  className="h-10 w-10 grid place-items-center rounded-xl btn-ghost"
                >
                  <PaletteIcon className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                </button>

                {onGoLanding && (
                  <button
                    type="button"
                    onClick={onGoLanding}
                    title={isFa ? 'مشاهده صفحه معرفی' : 'View Site'}
                    className="hidden sm:grid h-10 w-10 place-items-center rounded-xl btn-ghost"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLang(isFa ? 'en' : 'fa')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-2.5 rounded-xl btn-ghost"
                >
                  <Globe className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                  <span>{isFa ? 'EN' : 'فارسی'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('portfolio')}
                  className="hidden sm:inline-flex items-center gap-1.5 panel rounded-xl px-3 py-2 text-xs font-bold"
                >
                  <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
                  <span dir="ltr" className="tabular text-main">
                    ${Number(freeBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void onStartStop()}
                  className={`inline-flex items-center gap-1.5 text-xs font-black px-3.5 sm:px-4 py-2.5 rounded-xl transition ${
                    isRunning ? 'bg-[#FF8A00] hover:bg-[#ea7d00] text-white' : 'btn-gold'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isRunning ? (isFa ? 'توقف ربات' : 'Stop Bot') : isFa ? 'شروع ترید' : 'Start Bot'}</span>
                </button>
              </div>
            </div>

            {/* Live Ticker Tape */}
            {tickerCoins.length > 0 && (
              <div className="border-t hairline bg-black/20 overflow-hidden">
                <div
                  className="flex w-max gap-8 px-5 py-1.5 animate-ticker"
                  style={isFa ? { animationName: 'ticker-rtl' } : undefined}
                >
                  {[...tickerCoins, ...tickerCoins].map((c, idx) => {
                    const ch = Number(c.changePct24h || 0);
                    const px = Number(c.lastPrice || 0);
                    return (
                      <button
                        key={`${c.symbol}-${idx}`}
                        type="button"
                        onClick={() => {
                          onSelectSymbolForTerminal?.(c.symbol);
                          selectTab('terminal');
                        }}
                        className="flex items-center gap-2 text-[11px] font-semibold whitespace-nowrap hover:opacity-75 transition"
                      >
                        <CoinIcon symbol={c.symbol} size={15} />
                        <span className="font-bold text-main">{c.base}</span>
                        <span dir="ltr" className="text-dim tabular">
                          ${px >= 100 ? px.toLocaleString(undefined, { maximumFractionDigits: 2 }) : px.toFixed(px >= 1 ? 3 : 5)}
                        </span>
                        <span dir="ltr" className={`tabular font-bold ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </header>

          {/* Main Workspace */}
          <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-6 py-5 pb-28 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Mobile Floating Dock (02.zip shell.tsx with center QuickTrade) */}
      <nav className="lg:hidden fixed bottom-3 inset-x-3 z-40">
        <div className="panel rounded-[26px] px-2 py-2 grid grid-cols-[1fr_1fr_64px_1fr_1fr] items-center shadow-2xl !bg-[var(--panel)]">
          {([
            { id: 'overview' as NavTab, icon: LayoutDashboard, l: isFa ? 'خانه' : 'Overview' },
            { id: 'markets' as NavTab, icon: Globe, l: isFa ? 'بازار' : 'Markets' },
          ]).map((x) => {
            const Icon = x.icon;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => selectTab(x.id)}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl transition ${
                  activeTab === x.id ? 'text-brand' : 'text-dim'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-bold">{x.l}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => openQuickTradeModal()}
            aria-label="Quick Trade"
            className="relative -mt-7 h-15 w-15 mx-auto rounded-full btn-gold grid place-items-center shrink-0 overflow-hidden shadow-xl"
            style={{ width: 58, height: 58 }}
          >
            <span className="absolute inset-0 shine" />
            <Zap className="w-6 h-6 relative" />
          </button>

          {([
            { id: 'radar' as NavTab, icon: Radar, l: isFa ? 'رادار' : 'Radar' },
            { id: 'portfolio' as NavTab, icon: Wallet, l: isFa ? 'پورتفوی' : 'Portfolio' },
          ]).map((x) => {
            const Icon = x.icon;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => selectTab(x.id)}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl transition ${
                  activeTab === x.id ? 'text-brand' : 'text-dim'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-bold">{x.l}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Command Palette (⌘K) */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm p-4 grid place-items-start justify-items-center pt-[12vh]"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="pop-in w-full max-w-lg panel !bg-[var(--panel)] rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
              <Command className="w-5 h-5 shrink-0" style={{ color: 'var(--gold)' }} />
              <input
                autoFocus
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                placeholder={isFa ? 'جستجوی صفحه یا ارز...' : 'Jump to view or market...'}
                className="bg-transparent flex-1 outline-none text-sm font-medium text-main"
              />
              <kbd className="text-[10px] font-bold text-dim border hairline rounded-md px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
              {filteredTabs.length > 0 && (
                <div>
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">
                    {isFa ? 'صفحات' : 'VIEWS'}
                  </p>
                  {filteredTabs.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectTab(id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--soft)] transition text-start font-semibold text-sm text-main"
                    >
                      <LayoutDashboard className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                      <span>{tabLabel(id, lang)}</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredMarkets.length > 0 && (
                <div>
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">
                    {isFa ? 'ارزهای بازار' : 'MARKETS'}
                  </p>
                  {filteredMarkets.map((c) => {
                    const ch = Number(c.changePct24h || 0);
                    return (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => {
                          onSelectSymbolForTerminal?.(c.symbol);
                          selectTab('terminal');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--soft)] transition font-semibold text-sm text-main"
                      >
                        <CoinIcon symbol={c.symbol} size={24} />
                        <span>{c.symbol}</span>
                        <span dir="ltr" className="ms-auto tabular text-dim">
                          ${Number(c.lastPrice).toLocaleString()}
                        </span>
                        <span dir="ltr" className={`tabular text-xs font-bold ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? '+' : ''}
                          {ch.toFixed(2)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile QuickTrade Modal (02.zip shell.tsx) */}
      {qtOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm p-4 grid place-items-center overflow-y-auto"
          onClick={() => setQtOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="pop-in w-full max-w-sm panel !bg-[var(--panel)] rounded-[26px] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={qtSymbol} size={36} />
                <div>
                  <p className="font-display font-bold text-lg text-main">{qtSymbol}</p>
                  <p className="text-[11px] text-dim">{isFa ? 'معامله سریع مارکت' : 'Quick Market Order'}</p>
                </div>
              </div>
              <button type="button" onClick={() => setQtOpen(false)} className="h-9 w-9 grid place-items-center rounded-full btn-ghost">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQtSymbol(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-black shrink-0 ${
                    qtSymbol === s ? 'btn-gold' : 'btn-ghost text-dim'
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-black/25 border hairline">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQtSide(s)}
                  className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition ${
                    qtSide === s
                      ? s === 'LONG'
                        ? 'bg-jade text-black'
                        : 'bg-rose-500 text-white'
                      : 'text-dim'
                  }`}
                >
                  {s === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{s === 'LONG' ? (isFa ? 'خرید LONG' : 'LONG') : isFa ? 'فروش SHORT' : 'SHORT'}</span>
                </button>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-dim">{isFa ? 'اهرم' : 'Leverage'}</span>
                <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold)' }}>
                  {qtLev}×
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={qtLev}
                onChange={(e) => setQtLev(Number(e.target.value))}
                className="w-full"
                style={{ ['--fill' as string]: `${((qtLev - 1) / 49) * 100}%` }}
              />
            </div>

            {qtErr && <div className="text-xs text-loss font-bold">{qtErr}</div>}

            <button
              type="button"
              disabled={qtBusy}
              onClick={() => void submitQuickTrade()}
              className="btn-gold w-full py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>{qtBusy ? '...' : `${isFa ? 'ثبت معامله' : 'Open'} · ${qtSymbol} ${qtSide} ${qtLev}×`}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 Signature Looks Picker */}
      <AppearanceModal
        open={appearanceOpen}
        lang={lang}
        currentLook={currentLook}
        onSelectLook={onSelectLook}
        onClose={() => setAppearanceOpen(false)}
      />
    </div>
  );
}
