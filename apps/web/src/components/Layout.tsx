import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  CandlestickChart,
  CircleHelp,
  Command,
  CreditCard,
  Flame,
  Globe,
  Headphones,
  Home,
  Image,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Power,
  Radar,
  Rocket,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getPersianToday } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { tgHaptic, tgNotifyHaptic } from '../lib/telegram';
import type { AuthUserInfo, EntitlementSummary, NavTab } from '../lib/types';
import type { LookId } from './AppearanceModal';
import { DollarinoBrandMark } from './BrandGraphics';
import { CoinIcon } from './CoinIcon';
import { ConfirmTradeSheet, type PendingTradeConfirmation } from './ConfirmTradeSheet';
import type { ExchangeMarket } from './SymbolPickerModal';

export type { AuthUserInfo, EntitlementSummary, NavTab };
export type UiMode = 'simple' | 'pro';

export function DollarinoCoinMark({ size = 40 }: { size?: number }) {
  return <DollarinoBrandMark size={size} glow />;
}

const SIMPLE_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof Home }> = [
  { id: 'overview', labelFa: 'خانه و ربات من', labelEn: 'Home & Bot', icon: Home },
  { id: 'markets', labelFa: 'بازار ارزها', labelEn: 'Coins & Prices', icon: BarChart3 },
  { id: 'terminal', labelFa: 'معامله آسان', labelEn: 'Easy Trade', icon: Zap },
  { id: 'portfolio', labelFa: 'کیف پول و سودها', labelEn: 'Wallet & Profit', icon: Wallet },
  { id: 'services', labelFa: 'خدمات و ابزارها', labelEn: 'Services Hub', icon: LayoutGrid },
  { id: 'pricing', labelFa: 'اشتراک و پشتیبانی', labelEn: 'Plans & Help', icon: CreditCard },
  { id: 'faq', labelFa: 'راهنمای ساده', labelEn: 'Simple Guide', icon: CircleHelp },
];

const MAIN_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', icon: LayoutDashboard },
  { id: 'terminal', labelFa: 'پایانه و چارت AI', labelEn: 'Terminal & Chart AI', icon: CandlestickChart },
  { id: 'markets', labelFa: 'بازارهای فیوچرز', labelEn: 'Markets', icon: Globe },
  { id: 'radar', labelFa: 'رادار و آزمایشگاه', labelEn: 'Radar & Lab', icon: Radar },
  { id: 'copy', labelFa: 'کپی‌ترید و اتصالات', labelEn: 'Copy & Connect', icon: Users },
  { id: 'portfolio', labelFa: 'پورتفوی و گزارش‌ها', labelEn: 'Portfolio & Logs', icon: Wallet },
  { id: 'services', labelFa: 'خدمات و پروفایل', labelEn: 'Services Hub', icon: LayoutGrid },
];

const ACCOUNT_VIEWS: Array<{ id: NavTab; labelFa: string; labelEn: string; icon: typeof CreditCard }> = [
  { id: 'pricing', labelFa: 'تعرفه‌ها و اشتراک', labelEn: 'Pricing', icon: CreditCard },
  { id: 'faq', labelFa: 'راهنما و سوالات', labelEn: 'FAQ & Guide', icon: CircleHelp },
];

export function tabLabel(id: NavTab, lang: Lang): string {
  const isFa = lang === 'fa';
  if (id === 'services') return isFa ? 'خدمات' : 'Services';
  if (id === 'card') return isFa ? 'کارت هفتگی' : 'Weekly Card';
  if (id === 'admin') return isFa ? 'مدیریت' : 'Admin';
  const found = [...MAIN_VIEWS, ...ACCOUNT_VIEWS].find((x) => x.id === id);
  return found ? (isFa ? found.labelFa : found.labelEn) : id;
}

function DockTabIcon({ id, active }: { id: 'overview' | 'markets' | 'portfolio' | 'services'; active: boolean }) {
  if (id === 'overview') {
    return (
      <span
        className={`w-7 h-7 rounded-[9px] grid place-items-center transition-all ${
          active ? 'bg-[#F59E0B]/18' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" aria-hidden="true">
          <path
            d="M12 3.2 4 9.6c-.6.45-.9 1.15-.9 1.9V19a2 2 0 0 0 2 2h13.8a2 2 0 0 0 2-2v-7.5c0-.75-.3-1.45-.9-1.9L12 3.2Z"
            fill={active ? '#F59E0B' : '#7A828F'}
          />
          <rect
            x="11.15"
            y="13.2"
            width="1.7"
            height="4.4"
            rx="0.85"
            fill={active ? '#FFFBEB' : 'var(--panel)'}
          />
        </svg>
      </span>
    );
  }
  if (id === 'markets') {
    return (
      <span
        className={`w-7 h-7 rounded-[9px] grid place-items-center transition-all ${
          active ? 'bg-[#F59E0B]/20' : 'bg-slate-400/15'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
          <rect x="4.5" y="12.5" width="3.2" height="6.5" rx="1.6" fill={active ? '#F59E0B' : '#7A828F'} />
          <rect x="10.4" y="6.5" width="3.2" height="12.5" rx="1.6" fill={active ? '#F59E0B' : '#7A828F'} />
          <rect x="16.3" y="9.8" width="3.2" height="9.2" rx="1.6" fill={active ? '#F59E0B' : '#7A828F'} />
        </svg>
      </span>
    );
  }
  if (id === 'portfolio') {
    return (
      <span
        className={`w-7 h-7 rounded-[9px] grid place-items-center transition-all ${
          active ? 'bg-[#F59E0B]/18' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" aria-hidden="true">
          <path
            d="M6.8 6.8 14.9 4.2c1-.32 2 .25 2.25 1.25L18 8.8H5.6l1.2-2Z"
            fill={active ? '#D97706' : '#334155'}
          />
          <rect
            x="3.5"
            y="8.2"
            width="17"
            height="12"
            rx="3.6"
            fill={active ? '#F59E0B' : '#7A828F'}
          />
          <rect
            x="9.5"
            y="13.4"
            width="5"
            height="1.9"
            rx="0.95"
            fill={active ? '#FFFBEB' : 'var(--panel)'}
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`w-7 h-7 rounded-[9px] grid place-items-center transition-all ${
        active ? 'bg-[#F59E0B]/18' : ''
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-[20px] h-[20px]" aria-hidden="true">
        <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="2.3" fill={active ? '#D97706' : '#1E293B'} />
        <rect x="13.1" y="3.5" width="7.4" height="7.4" rx="2.3" fill={active ? '#FBBF24' : '#94A3B8'} />
        <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="2.3" fill={active ? '#FBBF24' : '#94A3B8'} />
        <rect x="13.1" y="13.1" width="7.4" height="7.4" rx="2.3" fill={active ? '#F59E0B' : '#1E293B'} />
      </svg>
    </span>
  );
}

export function Layout({
  lang,
  setLang,
  uiMode = 'simple',
  onToggleUiMode,
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
  uiMode?: UiMode;
  onToggleUiMode?: (m: UiMode) => void;
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; category: string; title: string; body: string; is_read: number; created_at: string }>>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [qtOpen, setQtOpen] = useState(false);
  const [qtSymbol, setQtSymbol] = useState('BTCUSDT');
  const [qtSide, setQtSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [qtLev, setQtLev] = useState(uiMode === 'simple' ? 5 : 10);
  const [qtBusy, setQtBusy] = useState(false);
  const [qtErr, setQtErr] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingTradeConfirmation | null>(null);
  const [clock, setClock] = useState('');

  const loadNotifications = async () => {
    try {
      const r = await apiFetch<{ notifications: typeof notifications; unread: number }>('/api/trading/notifications');
      setNotifications(r.notifications || []);
      setUnreadNotifs(r.unread || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void loadNotifications();
    const iv = setInterval(() => void loadNotifications(), 20_000);
    return () => {
      clearInterval(iv);
    };
  }, [onRefresh]);

  const toggleDayNight = () => {
    tgHaptic('light');
    onSelectLook(currentLook === 'paper' ? 'cosmic' : 'paper');
  };

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
        setPendingConfirm(null);
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
    tgHaptic('light');
    setActiveTab(id);
    setDrawerOpen(false);
    setPaletteOpen(false);
    setPaletteQ('');
  };

  const tickerCoins = markets.slice(0, 12);

  const openQuickTradeModal = (sym?: string) => {
    tgHaptic('medium');
    if (sym) setQtSymbol(sym);
    setQtErr('');
    setQtOpen(true);
  };

  const prepareQuickConfirm = () => {
    const m = markets.find((x) => x.symbol === qtSymbol);
    const px = Number(m?.lastPrice || 0);
    const dec = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    const sl = px > 0 ? (qtSide === 'LONG' ? px * 0.985 : px * 1.015).toFixed(dec) : undefined;
    const tp1 = px > 0 ? (qtSide === 'LONG' ? px * 1.025 : px * 0.975).toFixed(dec) : undefined;
    setQtOpen(false);
    setPendingConfirm({
      symbol: qtSymbol,
      direction: qtSide,
      orderType: 'MARKET',
      entryPrice: px > 0 ? px.toFixed(dec) : undefined,
      leverage: qtLev,
      stopLoss: sl,
      tp1,
      tradingMode,
    });
  };

  const executeConfirmedQuickTrade = async () => {
    if (!pendingConfirm) return;
    setQtBusy(true);
    setQtErr('');
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/orders/manual', {
        method: 'POST',
        body: JSON.stringify({
          symbol: pendingConfirm.symbol,
          direction: pendingConfirm.direction,
          orderType: 'MARKET',
          leverage: pendingConfirm.leverage,
          marginMode: 'ISOLATED',
          stopLoss: pendingConfirm.stopLoss,
          tp1: pendingConfirm.tp1,
        }),
      });
      if (!res.ok) {
        tgNotifyHaptic('error');
        setQtErr(res.error || 'Order failed');
        setPendingConfirm(null);
        setQtOpen(true);
      } else {
        tgNotifyHaptic('success');
        setPendingConfirm(null);
        await onRefresh?.();
        setActiveTab('terminal');
      }
    } catch (e) {
      tgNotifyHaptic('error');
      setQtErr(e instanceof Error ? e.message : 'Order failed');
      setPendingConfirm(null);
      setQtOpen(true);
    } finally {
      setQtBusy(false);
    }
  };

  const renderModeSwitcher = (compact?: boolean) =>
    onToggleUiMode ? (
      <div className="ios-segmented p-0.5 shrink-0" role="group" aria-label={isFa ? 'انتخاب سطح تجربه کاربری' : 'Interface Mode'}>
        <button
          type="button"
          onClick={() => {
            tgHaptic('light');
            onToggleUiMode('simple');
          }}
          className={`${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-full transition font-bold inline-flex items-center gap-1 whitespace-nowrap ${
            uiMode === 'simple' ? 'ios-pill-active' : 'text-dim hover:text-main'
          }`}
        >
          <Sprout className={`${compact ? 'hidden sm:inline ' : ''}w-3 h-3 shrink-0`} />
          <span>{isFa ? 'ساده' : 'Simple'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            tgHaptic('light');
            onToggleUiMode('pro');
          }}
          className={`${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-full transition font-bold inline-flex items-center gap-1 whitespace-nowrap ${
            uiMode === 'pro' ? 'ios-pill-active' : 'text-dim hover:text-main'
          }`}
        >
          <Zap className={`${compact ? 'hidden sm:inline ' : ''}w-3 h-3 shrink-0`} />
          <span>{isFa ? 'حرفه‌ای' : 'Pro'}</span>
        </button>
      </div>
    ) : null;

  const renderSidebarBody = (mobile?: boolean) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-5">
        <DollarinoCoinMark size={42} />
        <div>
          <p className="font-display font-bold text-[20px] leading-none text-main">
            Dollarino<span style={{ color: 'var(--gold-soft)' }}>.</span>
          </p>
          <p className="text-[9px] font-black tracking-[0.2em] mt-1" style={{ color: 'var(--gold-soft)' }}>
            {uiMode === 'simple' ? (isFa ? 'نسخه آسان ۱۰ تا ۸۰ ساله' : 'SIMPLE EDITION') : 'PRO QUANT DESK'}
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

      {onToggleUiMode && (
        <div className="mb-4 px-1 flex items-center justify-center">{renderModeSwitcher()}</div>
      )}

      {uiMode === 'simple' ? (
        <>
          <p className="px-3.5 text-[10px] font-black tracking-wider text-dim mb-2">
            {isFa ? 'منوی سریع و آسان' : 'EASY MENU'}
          </p>
          <div className="space-y-1">
            {SIMPLE_VIEWS.map((item) => {
              const Icon = item.icon;
              const on = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-bold transition-all ${
                    on ? 'ios-pill-active' : 'text-sub hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              tgHaptic('medium');
              onToggleUiMode?.('pro');
            }}
            className="mt-5 w-full rounded-2xl p-3.5 text-start surface-soft hover:border-[var(--line-strong)] transition space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-main flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--gold-soft)' }} />
                <span>{isFa ? 'حالت حرفه‌ای‌ها' : 'Unlock Pro Desk'}</span>
                <Zap className="w-3.5 h-3.5 text-[#F59E0B]" />
              </span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              {isFa
                ? 'چارت کندلی، رادار، بک‌تستر، کپی‌ترید و اتصال API صرافی'
                : 'Charts, Radar, Backtester, Copy-Trade & API Keys'}
            </p>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => selectTab('admin')}
              className={`mt-3 w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[13px] font-bold transition ${
                activeTab === 'admin' ? 'ios-pill-active' : 'text-flame hover:bg-[#FF8200]/10'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span className="truncate">{isFa ? 'پنل مدیریت' : 'Admin'}</span>
            </button>
          )}
        </>
      ) : (
        <>
          <p className="px-3.5 text-[9px] font-black tracking-[0.2em] text-dim mb-2">
            {isFa ? 'میز کار حرفه‌ای' : 'PRO VIEWS'}
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
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                    on ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  {on && (
                    <span
                      className="absolute start-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full"
                      style={{ background: 'var(--gold-soft)', boxShadow: '0 0 12px var(--gold)' }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold-soft)' } : undefined} />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                  {badge > 0 && (
                    <span
                      dir="ltr"
                      className="ms-auto text-[10px] font-black rounded-full px-2 py-0.5 tabular bg-jade text-black"
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
              className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                activeTab === 'card'
                  ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main'
                  : 'text-dim hover:text-main hover:bg-[var(--soft)]'
              }`}
            >
              <Image className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate">{isFa ? 'کارت هفتگی' : 'Weekly Card'}</span>
            </button>

            <button
              type="button"
              onClick={toggleDayNight}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold text-dim hover:text-main hover:bg-[var(--soft)] transition"
            >
              {currentLook === 'paper' ? <Moon className="w-[18px] h-[18px] shrink-0" /> : <Sun className="w-[18px] h-[18px] shrink-0 text-[#F59E0B]" />}
              <span className="truncate">{currentLook === 'paper' ? (isFa ? 'حالت شب آیفونی' : 'Night Mode') : isFa ? 'حالت روز آیفونی' : 'Day Mode'}</span>
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
                  className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition-all ${
                    on ? 'bg-[color:color-mix(in_srgb,var(--gold)_18%,transparent)] text-main' : 'text-dim hover:text-main hover:bg-[var(--soft)]'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" style={on ? { color: 'var(--gold-soft)' } : undefined} />
                  <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}

            {isAdmin && (
              <button
                type="button"
                onClick={() => selectTab('admin')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold transition ${
                  activeTab === 'admin' ? 'btn-gold' : 'text-flame hover:bg-[#FF8200]/10'
                }`}
              >
                <Shield className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">{isFa ? 'پنل مدیریت' : 'Admin'}</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Bottom Engine Card */}
      <div className="mt-auto pt-5 space-y-2.5">
        <div className="panel rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'live-dot bg-jade' : 'live-gold'}`} style={!isRunning ? { background: 'var(--gold-soft)' } : undefined} />
            <p className="text-xs font-bold text-main">
              {isRunning ? (isFa ? 'ربات روشن است' : 'Bot Active 24/7') : isFa ? 'ربات آماده است' : 'Ready to Trade'}
            </p>
          </div>
          <p className="text-[10px] text-dim truncate">
            {entitlement?.hasPaidPlan
              ? `${isFa ? entitlement.planNameFa : entitlement.planNameEn}`
              : tradingMode === 'PAPER'
                ? isFa
                  ? 'حساب دمو ($۱۰,۰۰۰ رایگان)'
                  : 'Paper Demo ($10,000 Free)'
                : activeExchangeLabel}
          </p>
          <button
            type="button"
            onClick={toggleDayNight}
            className="mt-2.5 w-full py-1.5 px-2.5 rounded-xl surface-soft text-[11px] font-bold text-main flex items-center justify-center gap-1.5 hover:border-[var(--line-strong)] transition"
          >
            {currentLook === 'paper' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>{isFa ? 'تغییر به حالت شب' : 'Switch to Night'}</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>{isFa ? 'تغییر به حالت روز' : 'Switch to Day'}</span>
              </>
            )}
          </button>
        </div>

        {isRunning && (
          <button
            type="button"
            onClick={() => void onKillSwitch()}
            className="w-full py-2.5 px-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{isFa ? 'توقف اضطراری و بستن همه' : 'Emergency Kill Switch'}</span>
          </button>
        )}

        <div className="flex items-center justify-between text-[11px] font-semibold text-dim px-1">
          {onResetDemo && tradingMode === 'PAPER' ? (
            <button type="button" onClick={() => void onResetDemo()} className="inline-flex items-center gap-1 hover:text-main transition">
              <RotateCcw className="w-3 h-3" />
              <span>{isFa ? 'ریست $۱۰k' : 'Reset $10k'}</span>
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
    <div dir={isFa ? 'rtl' : 'ltr'} className="min-h-screen app-shell flex flex-col overflow-x-hidden max-w-full">
      <div className="flex-1 flex min-w-0">
        <aside className="hidden lg:flex w-64 shrink-0 border-e hairline p-4 flex-col sticky top-0 h-screen overflow-y-auto backdrop-blur-2xl bg-[var(--panel)]">
          {renderSidebarBody()}
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-black/70 backdrop-blur-sm flex" onClick={() => setDrawerOpen(false)}>
            <div
              className="w-72 max-w-[85vw] h-full p-5 bg-[var(--bg-surface)] border-e hairline overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {renderSidebarBody(true)}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          {/* Unified Consistent Header Across Simple & Pro Modes */}
          <header className="sticky top-0 z-30 backdrop-blur-2xl bg-[var(--bg)]/92 border-b hairline">
            <div className="mx-auto max-w-6xl px-2.5 sm:px-6 py-2 flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Menu"
                  className="lg:hidden h-8 w-8 grid place-items-center rounded-full btn-ghost shrink-0"
                >
                  <Menu className="w-4 h-4 text-main" />
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('services')}
                  className="flex items-center gap-1.5 sm:gap-2 text-start group min-w-0"
                >
                  <span className="h-8 w-8 rounded-full surface-soft grid place-items-center text-main font-display font-bold text-xs border hairline shrink-0 overflow-hidden">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      user.username.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="leading-tight">
                    <span className="flex items-center gap-1 text-[10.5px] sm:text-[11px] font-bold text-main whitespace-nowrap">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${isRunning ? 'bg-[#10B981] live-dot' : 'bg-slate-400'}`} />
                      <span className="font-num">{isFa ? getPersianToday() : clock}</span>
                    </span>
                    <span className="text-[10px] text-dim hidden sm:inline truncate">{user.username}</span>
                  </div>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden lg:flex flex-1 max-w-xs items-center gap-2.5 panel rounded-2xl px-3.5 py-1.5 text-[12px] text-dim hover:border-[var(--line-strong)] transition text-start"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{isFa ? 'جستجوی صفحه یا ارز...' : 'Search views or coins...'}</span>
                <kbd dir="ltr" className="ms-auto text-[9px] border hairline rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </button>

              <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                {renderModeSwitcher(true)}

                <button
                  type="button"
                  onClick={() => selectTab('faq')}
                  aria-label={isFa ? 'پشتیبانی و راهنما' : 'Support & Guide'}
                  title={isFa ? 'پشتیبانی و راهنما' : 'Support & Guide'}
                  className="relative h-7 w-7 sm:h-8 sm:w-8 grid place-items-center rounded-full hover:bg-[var(--soft)] transition"
                >
                  <Headphones className="w-[15px] h-[15px] sm:w-[16px] sm:h-[16px] text-main" />
                  <span className="absolute top-0.5 end-0.5 w-2 h-2 rounded-full bg-[#10B981] ring-2 ring-[var(--bg)]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    if (!notifOpen && unreadNotifs > 0) {
                      void apiFetch('/api/trading/notifications/read', { method: 'POST' }).catch(() => {});
                      setUnreadNotifs(0);
                    }
                  }}
                  aria-label={isFa ? 'اعلان‌ها' : 'Notifications'}
                  title={isFa ? 'اعلان‌ها' : 'Notifications'}
                  className="relative h-7 w-7 sm:h-8 sm:w-8 grid place-items-center rounded-full hover:bg-[var(--soft)] transition"
                >
                  <Bell className="w-[15px] h-[15px] sm:w-[16px] sm:h-[16px] text-main" />
                  {unreadNotifs > 0 && (
                    <span className="absolute top-0.5 end-0.5 w-2 h-2 rounded-full bg-[#F59E0B] ring-2 ring-[var(--bg)]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleDayNight}
                  aria-label="Toggle day or night"
                  title={isFa ? 'حالت روز / شب' : 'Day / Night'}
                  className="h-7 w-7 sm:h-8 sm:w-8 grid place-items-center rounded-full hover:bg-[var(--soft)] transition"
                >
                  {currentLook === 'paper' ? (
                    <Moon className="w-[15px] h-[15px] sm:w-4 sm:h-4 text-[var(--gold)]" />
                  ) : (
                    <Sun className="w-[15px] h-[15px] sm:w-4 sm:h-4 text-[#F59E0B]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLang(isFa ? 'en' : 'fa')}
                  className="hidden md:inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-full hover:bg-[var(--soft)] transition"
                >
                  <Globe className="w-3.5 h-3.5" style={{ color: 'var(--gold-soft)' }} />
                  <span>{isFa ? 'EN' : 'فارسی'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectTab('portfolio')}
                  className="hidden md:inline-flex items-center gap-1.5 panel rounded-full px-3 py-1 text-xs font-bold"
                >
                  <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--jade)' }} />
                  <span dir="ltr" className="tabular text-main font-num">
                    ${Number(freeBalance || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    tgHaptic('medium');
                    void onStartStop();
                  }}
                  className={`hidden md:inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full transition ${
                    isRunning ? 'bg-[#0D9455] hover:bg-[#059669] text-white' : 'btn-emerald'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isRunning ? (isFa ? 'توقف ربات' : 'Stop') : isFa ? 'شروع ربات' : 'Start Bot'}</span>
                </button>
              </div>
            </div>

            {tickerCoins.length > 0 && uiMode === 'pro' && (
              <div className="border-t hairline bg-black/5 dark:bg-black/20 overflow-hidden">
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
                        <span dir="ltr" className="text-dim tabular font-num">
                          ${px >= 100 ? px.toLocaleString('en-US', { maximumFractionDigits: 2 }) : px.toFixed(px >= 1 ? 3 : 5)}
                        </span>
                        <span dir="ltr" className={`tabular font-bold inline-flex items-center gap-0.5 ${ch >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {ch >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>{Math.abs(ch).toFixed(2)}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-6 py-5 pb-32 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Notifications Popover */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" onClick={() => setNotifOpen(false)}>
          <div
            className="pop-in fixed top-16 end-3 sm:end-8 w-[92vw] max-w-sm panel rounded-[26px] p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b hairline pb-2.5">
              <span className="font-display font-bold text-sm text-main flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#F59E0B]" />
                {isFa ? 'اعلان‌ها و رویدادها' : 'Live Notifications'}
              </span>
              <button type="button" onClick={() => setNotifOpen(false)} className="h-7 w-7 rounded-full btn-ghost grid place-items-center">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {notifications.length === 0 ? (
                <p className="text-xs text-dim py-6 text-center">
                  {isFa ? 'اعلان جدیدی ثبت نشده است.' : 'No notifications yet.'}
                </p>
              ) : (
                notifications.slice(0, 12).map((n) => (
                  <div key={n.id} className="surface-soft rounded-2xl p-3 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-main truncate">{n.title}</span>
                      <span className="text-[10px] text-dim shrink-0">{n.created_at.slice(11, 16)}</span>
                    </div>
                    <p className="text-[11px] text-sub leading-relaxed">{n.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kifpool-inspired Deep U-Cradle Curved Notch Floating Bottom Tab Bar (matching image-1.png) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none select-none">
        <div className="relative mx-auto max-w-md h-[84px] pointer-events-auto">
          {/* Deep U-Notch Cradle SVG matching image-1.png */}
          <svg
            viewBox="0 0 390 84"
            preserveAspectRatio="none"
            className="w-full h-[84px] block"
            style={{ filter: 'drop-shadow(0 -6px 20px rgba(15, 23, 42, 0.09))' }}
            aria-hidden="true"
          >
            <path
              d="M0,34 Q0,14 20,14 L142,14 C153,14 159,20 160,30 A35,35 0 0 0 230,30 C231,20 237,14 248,14 L370,14 Q390,14 390,34 L390,84 L0,84 Z"
              fill="var(--panel)"
            />
            <path
              d="M0,34 Q0,14 20,14 L142,14 C153,14 159,20 160,30 A35,35 0 0 0 230,30 C231,20 237,14 248,14 L370,14 Q390,14 390,34"
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
          </svg>

          {/* Concentric Floating Center Bot Power Logo Button: B&W when OFF, Full Color + Green Ring when ON */}
          <button
            type="button"
            onClick={() => {
              tgHaptic('medium');
              void onStartStop();
            }}
            aria-label={isRunning ? (isFa ? 'خاموش کردن ربات' : 'Turn Off Bot') : isFa ? 'روشن کردن ربات' : 'Turn On Bot'}
            title={isRunning ? (isFa ? 'ربات روشن است (لمس برای توقف)' : 'Bot is ON (tap to pause)') : isFa ? 'ربات خاموش است (لمس برای شروع)' : 'Bot is OFF (tap to start)'}
            className="z-20 absolute left-1/2 -translate-x-1/2 top-[2px] w-[56px] h-[56px] rounded-full grid place-items-center active:scale-95 transition-all"
            style={{
              background: isRunning
                ? 'radial-gradient(circle at center, #082a88 0%, #051646 100%)'
                : 'radial-gradient(circle at center, #334155 0%, #1e293b 100%)',
              border: isRunning ? '3px solid #10B981' : '2.5px solid #cbd5e1',
              boxShadow: isRunning
                ? '0 0 0 3px rgba(16, 185, 129, 0.22), 0 8px 20px rgba(16, 185, 129, 0.38)'
                : '0 6px 16px rgba(15, 23, 42, 0.22)',
            }}
          >
            <img
              src="/logo.png"
              alt="Dollarino Bot"
              className={`w-[44px] h-[44px] rounded-full object-contain transition-all duration-300 select-none ${
                isRunning ? 'scale-105' : 'grayscale contrast-125 opacity-75'
              }`}
            />
            {isRunning && (
              <span className="absolute -top-0.5 -end-0.5 w-3.5 h-3.5 rounded-full bg-[#10B981] border-2 border-[var(--panel)] shadow-sm" />
            )}
          </button>

          {/* 4 Surrounding Balanced Tabs with Two-Tone Icons matching image-1.png */}
          <div className="absolute inset-x-0 bottom-0 h-[70px] grid grid-cols-[1fr_1fr_82px_1fr_1fr] items-center px-2">
            {([
              { id: 'overview' as const, l: isFa ? 'خانه' : 'Home' },
              { id: 'markets' as const, l: isFa ? 'بازار' : 'Markets' },
            ]).map((x) => {
              const active = activeTab === x.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => selectTab(x.id)}
                  className="relative flex flex-col items-center justify-center gap-1 h-full pt-1"
                >
                  <DockTabIcon id={x.id} active={active} />
                  <span className={`text-[11px] font-bold leading-none ${active ? 'text-[#F59E0B]' : 'text-main/80'}`}>
                    {x.l}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 w-7 h-[3px] rounded-t-full bg-[#F59E0B] shadow-[0_0_14px_rgba(245,158,11,0.9)]" />
                  )}
                </button>
              );
            })}

            <div aria-hidden="true" className="h-full pointer-events-none" />

            {([
              { id: 'portfolio' as const, l: isFa ? 'کیف پول' : 'Wallet' },
              { id: 'services' as const, l: isFa ? 'خدمات' : 'Services' },
            ]).map((x) => {
              const active = activeTab === x.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => selectTab(x.id)}
                  className="relative flex flex-col items-center justify-center gap-1 h-full pt-1"
                >
                  <DockTabIcon id={x.id} active={active} />
                  <span className={`text-[11px] font-bold leading-none ${active ? 'text-[#F59E0B]' : 'text-main/80'}`}>
                    {x.l}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 w-7 h-[3px] rounded-t-full bg-[#F59E0B] shadow-[0_0_14px_rgba(245,158,11,0.9)]" />
                  )}
                </button>
              );
            })}
          </div>
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
            className="pop-in w-full max-w-lg panel rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b hairline">
              <Command className="w-5 h-5 shrink-0" style={{ color: 'var(--gold-soft)' }} />
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
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">{isFa ? 'صفحات' : 'VIEWS'}</p>
                  {filteredTabs.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectTab(id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--soft)] transition text-start font-semibold text-sm text-main"
                    >
                      <LayoutDashboard className="w-4 h-4" style={{ color: 'var(--gold-soft)' }} />
                      <span>{tabLabel(id, lang)}</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredMarkets.length > 0 && (
                <div>
                  <p className="px-3 text-[9px] font-black tracking-widest text-dim mb-1.5">{isFa ? 'ارزهای بازار' : 'MARKETS'}</p>
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

      {/* iPhone QuickTrade Modal */}
      {qtOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto"
          onClick={() => setQtOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="pop-in w-full max-w-sm panel rounded-[30px] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={qtSymbol} size={38} />
                <div>
                  <p className="font-display font-bold text-lg text-main">{qtSymbol}</p>
                  <p className="text-[11px] text-dim">{isFa ? 'معامله سریع و محافظت‌شده' : 'Protected Quick Order'}</p>
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
                    qtSymbol === s ? 'btn-cobalt' : 'btn-ghost text-dim'
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl surface-soft">
              {(['LONG', 'SHORT'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQtSide(s)}
                  className={`py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition ${
                    qtSide === s
                      ? s === 'LONG'
                        ? 'btn-emerald'
                        : 'bg-rose-500 text-white'
                      : 'text-dim'
                  }`}
                >
                  {s === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>
                    {s === 'LONG' ? (isFa ? 'بالا میره (خرید)' : 'Going UP') : isFa ? 'پایین میاد (فروش)' : 'Going DOWN'}
                  </span>
                </button>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-dim">{isFa ? 'سرعت (اهرم محافظت‌شده)' : 'Speed (Leverage)'}</span>
                <span dir="ltr" className="font-num font-bold" style={{ color: 'var(--gold-soft)' }}>
                  {qtLev}×
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={uiMode === 'simple' ? 15 : 50}
                value={qtLev}
                onChange={(e) => setQtLev(Number(e.target.value))}
                className="w-full"
                style={{ ['--fill' as string]: `${((qtLev - 1) / ((uiMode === 'simple' ? 15 : 50) - 1)) * 100}%` }}
              />
            </div>

            {qtErr && <div className="text-xs text-loss font-bold">{qtErr}</div>}

            <button
              type="button"
              onClick={prepareQuickConfirm}
              className="btn-cobalt w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              <span>{isFa ? 'دلارینو ترید کن برام' : 'Execute Protected Trade'}</span>
            </button>
          </div>
        </div>
      )}

      <ConfirmTradeSheet
        open={Boolean(pendingConfirm)}
        lang={lang}
        order={pendingConfirm}
        busy={qtBusy}
        onConfirm={executeConfirmedQuickTrade}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
