import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { LookId } from './components/AppearanceModal';
import { DollarinoBrandMark } from './components/BrandGraphics';
import { FloatingAiChat } from './components/FloatingAiChat';
import { FloatingToastHost } from './components/FloatingToastHost';
import { Layout, type UiMode } from './components/Layout';
import { OnboardingAcademyModal } from './components/OnboardingAcademyModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { QuickLauncherModal } from './components/QuickWidgetsBar';
import { SupportModal } from './components/SupportModal';
import type { ExchangeMarket } from './components/SymbolPickerModal';
import { TrustWalletDirectModal } from './components/TrustWalletDirectModal';
import { apiFetch, ApiError, setStoredToken } from './lib/api';
import { setLiveUsdtIrt } from './lib/format';
import type { Lang } from './lib/i18n';
import { pushFloatingToast } from './lib/toast';
import { getTelegramWebApp, initTelegramMiniApp, isInsideTelegramMiniApp } from './lib/telegram';
import {
  connectAndPersistAllTrustWallets,
  isMobileWalletPlatform,
  launchTrustWalletUrl,
  requestTrustWalletDappHandoff,
  type TrustWalletDappHandoff,
} from './lib/trustwallet';
import type { AuthUserInfo, DashboardPayload, NavTab } from './lib/types';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';

const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AiChatPage = lazy(() => import('./pages/AiChatPage').then((m) => ({ default: m.AiChatPage })));
const CopyConnectPage = lazy(() => import('./pages/CopyConnectPage').then((m) => ({ default: m.CopyConnectPage })));
const DexTrustPage = lazy(() => import('./pages/DexTrustPage').then((m) => ({ default: m.DexTrustPage })));
const FaqPage = lazy(() => import('./pages/FaqPage').then((m) => ({ default: m.FaqPage })));
const MarketsPage = lazy(() => import('./pages/MarketsPage').then((m) => ({ default: m.MarketsPage })));
const MyAiPage = lazy(() => import('./pages/MyAiPage').then((m) => ({ default: m.MyAiPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const RadarLabPage = lazy(() => import('./pages/RadarLabPage').then((m) => ({ default: m.RadarLabPage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const TerminalPage = lazy(() => import('./pages/TerminalPage').then((m) => ({ default: m.TerminalPage })));
const VerifyCardPage = lazy(() => import('./pages/VerifyCardPage').then((m) => ({ default: m.VerifyCardPage })));
const WeeklyCardPage = lazy(() => import('./pages/WeeklyCardPage').then((m) => ({ default: m.WeeklyCardPage })));

function applyLookToRoot(look: LookId) {
  const root = document.documentElement;
  root.setAttribute('data-theme', look);
  const isLight = look === 'paper';
  root.classList.toggle('theme-light', isLight);
  root.classList.toggle('dark', !isLight);
  root.style.colorScheme = isLight ? 'light' : 'dark';
  localStorage.setItem('dollarino_look', look);
  localStorage.setItem('dollarino_theme', isLight ? 'light' : 'dark');
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('dollarino_lang') === 'en' ? 'en' : 'fa'));
  const [look, setLook] = useState<LookId>(() => {
    const saved = localStorage.getItem('dollarino_look');
    if (saved === 'paper' || saved === 'cosmic') return saved;
    if (saved === 'obsidian' || saved === 'midnight') return 'cosmic';
    return 'paper';
  });
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    const saved = localStorage.getItem('dollarino_ui_mode');
    if (saved === 'simple' || saved === 'pro') return saved;
    return 'simple';
  });

  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicScreen, setPublicScreen] = useState<'landing' | 'auth'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [supportOpen, setSupportOpen] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(() => {
    const qp = new URLSearchParams(window.location.search);
    return qp.get('install') === '1' || qp.get('install') === 'true';
  });
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [twModalOpen, setTwModalOpen] = useState(false);
  const [twHandoff, setTwHandoff] = useState<TrustWalletDappHandoff | null>(null);
  const [twMobileLaunched, setTwMobileLaunched] = useState(false);
  const [twModalError, setTwModalError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const qp = new URLSearchParams(window.location.search);
    const tab = qp.get('tab') as NavTab | null;
    const quick = qp.get('quick');
    if (quick === 'dex' || tab === 'dex') return 'dex';
    if (quick === 'report') return 'portfolio';
    if (tab && ['overview', 'aichat', 'myai', 'terminal', 'markets', 'dex', 'radar', 'copy', 'portfolio', 'services', 'card', 'pricing', 'faq', 'admin'].includes(tab)) {
      return tab;
    }
    return 'overview';
  });
  const [quickAction, setQuickAction] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search).get('quick');
    return q === 'bot-toggle' || q === 'kill-switch' ? q : null;
  });
  const [marketType, setMarketType] = useState<'SPOT' | 'FUTURES'>('FUTURES');
  const [terminalSymbol, setTerminalSymbol] = useState('BTCUSDT');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [markets, setMarkets] = useState<ExchangeMarket[]>([]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);
  const [verifyCardId, setVerifyCardId] = useState<string | null>(() => {
    const m = window.location.pathname.match(/^\/verify-card\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  });

  useEffect(() => {
    applyLookToRoot(look);
  }, [look]);

  useEffect(() => {
    initTelegramMiniApp(look === 'paper' ? '#F3F7FF' : '#040917');
  }, [look]);

  useEffect(() => {
    if (!user) return;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tw_autoconnect') === '1') return;
    const hasTw = Boolean(
      user.trust_wallet_address || user.trust_wallet_tron || user.trust_wallet_solana || user.trust_wallet_ton
    );
    const seenKey = `dollarino_academy_done_${user.id}`;
    if (!hasTw && !localStorage.getItem(seenKey) && activeTab !== 'admin') {
      setAcademyOpen(true);
    }
  }, [user, activeTab]);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('dollarino_lang', l);
  };

  const handleSetUiMode = (next: UiMode) => {
    setUiMode(next);
    localStorage.setItem('dollarino_ui_mode', next);
    if (user) {
      void apiFetch('/api/auth/ui-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ uiMode: next }),
      }).catch(() => {});
    }
  };

  const handleSelectLook = (next: LookId) => {
    setLook(next);
    applyLookToRoot(next);
  };

  const handleToggleDaylight = () => {
    handleSelectLook(look === 'paper' ? 'cosmic' : 'paper');
  };

  const loadSessionAndDashboard = useCallback(async () => {
    try {
      setAuthError(null);
      const urlParams = new URLSearchParams(window.location.search);
      const tgLoginToken = urlParams.get('tg_login');
      const tgWidgetHash = urlParams.get('hash');
      const tgWidgetId = urlParams.get('id');
      if (tgLoginToken) {
        const magicRes = await apiFetch<{ token: string; user: AuthUserInfo }>('/api/auth/telegram-magic-login', {
          method: 'POST',
          body: JSON.stringify({ token: tgLoginToken }),
        });
        setStoredToken(magicRes.token);
        urlParams.delete('tg_login');
        urlParams.delete('install');
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      } else if (tgWidgetHash && tgWidgetId) {
        const widgetPayload: Record<string, string> = {};
        for (const k of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
          const v = urlParams.get(k);
          if (v) widgetPayload[k] = v;
        }
        const widgetRes = await apiFetch<{ token: string; user: AuthUserInfo }>('/api/auth/telegram-login-widget', {
          method: 'POST',
          body: JSON.stringify(widgetPayload),
        });
        setStoredToken(widgetRes.token);
        for (const k of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
          urlParams.delete(k);
        }
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      }

      let me: { user: AuthUserInfo } | null = null;
      const sess = await apiFetch<{ authenticated: boolean; user: AuthUserInfo | null }>('/api/auth/session');
      if (sess.authenticated && sess.user) {
        me = { user: sess.user };
      } else if (isInsideTelegramMiniApp()) {
        const tg = getTelegramWebApp();
        if (tg?.initData) {
          const authRes = await apiFetch<{ token: string; user: AuthUserInfo }>('/api/auth/telegram-webapp', {
            method: 'POST',
            body: JSON.stringify({ initData: tg.initData }),
          });
          setStoredToken(authRes.token);
          me = { user: authRes.user };
        }
      }
      if (!me) {
        setUser(null);
        setDashboard(null);
        return;
      }
      setUser(me.user);
      if (me.user.ui_mode === 'simple' || me.user.ui_mode === 'pro') {
        setUiMode(me.user.ui_mode);
        localStorage.setItem('dollarino_ui_mode', me.user.ui_mode);
      }
      const dash = await apiFetch<DashboardPayload>('/api/trading/dashboard');
      if (dash.iranRate?.usdtIrt) {
        setLiveUsdtIrt(dash.iranRate.usdtIrt, dash.iranRate.source);
      } else {
        apiFetch<{ usdtIrt?: number; source?: string }>('/api/public/usdt-irt-rate')
          .then((r) => {
            if (r?.usdtIrt) setLiveUsdtIrt(r.usdtIrt, r.source);
          })
          .catch(() => {});
      }
      const activeMkt: 'SPOT' | 'FUTURES' = dash.config?.market_type === 'SPOT' ? 'SPOT' : 'FUTURES';
      setMarketType(activeMkt);
      const mkts = await apiFetch<{ markets: ExchangeMarket[] }>(`/api/trading/markets?marketType=${activeMkt}`).catch(() => ({ markets: [] }));
      setDashboard(dash);
      if (dash.config?.symbol) setTerminalSymbol((prev) => prev || dash.config.symbol);
      if (mkts.markets.length) setMarkets(mkts.markets);
    } catch (err) {
      setUser(null);
      setDashboard(null);
      const msg = err instanceof Error ? err.message : '';
      if (msg && !msg.includes('Authentication required')) setAuthError(msg);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void loadSessionAndDashboard();
  }, [loadSessionAndDashboard]);

  useEffect(() => {
    if (!user) return;
    const iv = setInterval(() => {
      void apiFetch<DashboardPayload>('/api/trading/dashboard')
        .then((d) => {
          if (d.iranRate?.usdtIrt) setLiveUsdtIrt(d.iranRate.usdtIrt, d.iranRate.source);
          setDashboard(d);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, [user]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
    setUser(null);
    setDashboard(null);
    setPublicScreen('landing');
  };

  const handleTopbarStartStop = async () => {
    if (!dashboard) return;
    const prevState = dashboard.config.bot_state;
    const running = prevState.startsWith('RUNNING');
    if (!running && !dashboard.riskTermsAcceptedAt && !user?.risk_terms_accepted_at) {
      setActiveTab('overview');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dollarino:require-risk-terms'));
      }, 60);
      return;
    }
    const optimisticState = running ? 'STOPPED' : dashboard.config.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
    setDashboard((cur) => (cur ? { ...cur, config: { ...cur.config, bot_state: optimisticState } } : cur));
    try {
      if (running) {
        await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
        pushFloatingToast(
          lang === 'fa' ? '⏸ ربات معاملاتی متوقف شد' : '⏸ Trading bot stopped',
          'warn'
        );
      } else {
        await apiFetch('/api/trading/bot/start', { method: 'POST', body: JSON.stringify({ scanScope: dashboard.config.scan_scope || 'ALL_MARKET' }) });
        pushFloatingToast(
          lang === 'fa' ? '✅ ربات معاملاتی با موفقیت روشن شد' : '✅ Trading bot is now active',
          'success'
        );
      }
      await loadSessionAndDashboard();
    } catch (err) {
      setDashboard((cur) => (cur ? { ...cur, config: { ...cur.config, bot_state: prevState } } : cur));
      if (err instanceof ApiError && err.status === 402) {
        pushFloatingToast(
          lang === 'fa' ? 'برای روشن کردن ربات، ابتدا اشتراک خود را فعال کنید.' : 'Please activate a subscription to start the bot.',
          'warn'
        );
        setActiveTab('pricing');
      } else {
        pushFloatingToast(err instanceof Error ? err.message : 'Action failed', 'error');
      }
    }
  };

  const handleKillSwitch = async () => {
    await apiFetch('/api/trading/bot/kill-switch', { method: 'POST' });
    await loadSessionAndDashboard();
  };

  const handleDirectConnectWallet = useCallback(async () => {
    setWalletConnecting(true);
    setTwModalError(null);
    try {
      const res = await connectAndPersistAllTrustWallets();
      await loadSessionAndDashboard();
      setTwModalOpen(false);
      setAcademyOpen(false);
      pushFloatingToast(
        lang === 'fa'
          ? `کیف‌پول Trust Wallet به تمام شبکه‌ها متصل شد: ${res.connectedFamilies.join(' + ')}`
          : `Trust Wallet connected across all chains: ${res.connectedFamilies.join(' + ')}`,
        'success',
        5500
      );
      setActiveTab('dex');
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'USER_REJECTED') {
        pushFloatingToast(
          lang === 'fa'
            ? 'درخواست اتصال در کیف‌پول تایید نشد؛ برای اتصال دوباره دکمه ولت را بزنید.'
            : 'Wallet connection request was rejected. Tap Wallet to retry.',
          'warn',
          5000,
          { label: lang === 'fa' ? 'مدیریت Trust Wallet' : 'Trust Wallet', onClick: () => setActiveTab('dex') }
        );
        setTwModalError(
          lang === 'fa'
            ? 'اتصال توسط کاربر لغو شد — دکمه «اتصال افزونه مرورگر» یا «باز کردن Trust Wallet» را بزنید.'
            : 'Connection was canceled — retry browser wallet or open Trust Wallet App.'
        );
      } else {
        try {
          const handoff = await requestTrustWalletDappHandoff();
          setTwHandoff(handoff);
          const mobile = isMobileWalletPlatform();
          setTwMobileLaunched(mobile);
          setTwModalOpen(true);
          if (mobile) {
            launchTrustWalletUrl(handoff.universalLink, handoff.deepLink);
          }
        } catch (handoffErr) {
          setTwHandoff(null);
          setTwMobileLaunched(false);
          setTwModalError(handoffErr instanceof Error ? handoffErr.message : 'Unable to start Trust Wallet link');
          setTwModalOpen(true);
        }
      }
    } finally {
      setWalletConnecting(false);
    }
  }, [lang, loadSessionAndDashboard]);

  // Auto-connect ALL chains when opened via Trust Wallet DApp handoff (`?tw_autoconnect=1`)
  useEffect(() => {
    if (!user) return;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tw_autoconnect') !== '1') return;

    qp.delete('tw_autoconnect');
    const qs = qp.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    setAcademyOpen(false);

    let cancelled = false;
    void (async () => {
      setWalletConnecting(true);
      await new Promise((r) => setTimeout(r, 260));
      if (cancelled) return;
      try {
        const res = await connectAndPersistAllTrustWallets();
        if (cancelled) return;
        await loadSessionAndDashboard();
        pushFloatingToast(
          lang === 'fa'
            ? `تمامی آدرس‌های کیف‌پول Trust Wallet متصل شد: ${res.connectedFamilies.join(' + ')}`
            : `Trust Wallet connected across all chains: ${res.connectedFamilies.join(' + ')}`,
          'success',
          5500
        );
        setActiveTab('dex');
      } catch {
        if (!cancelled) setActiveTab('dex');
      } finally {
        if (!cancelled) setWalletConnecting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, lang, loadSessionAndDashboard]);

  const handleChangeMarketType = useCallback(async (nextMkt: 'SPOT' | 'FUTURES') => {
    setMarketType(nextMkt);
    const mkts = await apiFetch<{ markets: ExchangeMarket[] }>(`/api/trading/markets?marketType=${nextMkt}`).catch(() => ({ markets: [] }));
    if (mkts.markets.length) setMarkets(mkts.markets);
  }, []);

  const openTerminalWithSymbol = (sym?: string, mkt?: 'SPOT' | 'FUTURES') => {
    if (sym) setTerminalSymbol(sym);
    if (mkt && mkt !== marketType) void handleChangeMarketType(mkt);
    setActiveTab('terminal');
  };

  if (verifyCardId) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen app-shell flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
          </div>
        }
      >
        <VerifyCardPage
          cardId={verifyCardId}
          lang={lang}
          onBackHome={() => {
            window.history.pushState({}, '', '/');
            setVerifyCardId(null);
          }}
        />
      </Suspense>
    );
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <DollarinoBrandMark size={52} glow />
          <div className="w-8 h-8 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {publicScreen === 'landing' ? (
          <LandingPage
            lang={lang}
            setLang={handleSetLang}
            look={look}
            onToggleDaylight={handleToggleDaylight}
            onGoAuth={(mode) => {
              setAuthMode(mode);
              setPublicScreen('auth');
            }}
            onOpenSupport={() => setSupportOpen(true)}
          />
        ) : (
          <AuthPage
            lang={lang}
            setLang={handleSetLang}
            isLight={look === 'paper'}
            onToggleDaylight={handleToggleDaylight}
            initialMode={authMode}
            externalError={authError}
            onBack={() => setPublicScreen('landing')}
            onSuccess={loadSessionAndDashboard}
          />
        )}
        <SupportModal
          open={supportOpen}
          lang={lang}
          authenticated={false}
          onClose={() => setSupportOpen(false)}
          onGoToAuth={() => {
            setSupportOpen(false);
            setAuthMode('login');
            setPublicScreen('auth');
          }}
        />
        <FloatingAiChat
          lang={lang}
          authenticated={false}
          onGoAuth={() => {
            setAuthMode('login');
            setPublicScreen('auth');
          }}
        />
        <FloatingToastHost />
      </>
    );
  }

  if (!dashboard) {
    return (
      <>
        <div className="min-h-screen app-shell flex items-center justify-center p-4">
          <div className="panel rounded-3xl p-6 text-center space-y-3 max-w-sm w-full">
            <DollarinoBrandMark size={44} glow />
            <p className="text-sm font-bold text-main">
              {authError || (lang === 'fa' ? 'در حال آماده‌سازی میز کار معاملاتی...' : 'Loading your trading desk...')}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => void loadSessionAndDashboard()} className="btn-gold px-4 py-2 rounded-xl text-xs">
                {lang === 'fa' ? 'تلاش مجدد' : 'Retry'}
              </button>
              <button type="button" onClick={() => void handleLogout()} className="btn-ghost px-4 py-2 rounded-xl text-xs">
                {lang === 'fa' ? 'بازگشت' : 'Back'}
              </button>
            </div>
          </div>
        </div>
        <SupportModal
          open={supportOpen}
          lang={lang}
          authenticated={Boolean(user)}
          onClose={() => setSupportOpen(false)}
        />
        <FloatingAiChat
          lang={lang}
          authenticated={Boolean(user)}
          onNavigate={setActiveTab}
        />
      </>
    );
  }

  return (
    <>
    <Layout
      lang={lang}
      setLang={handleSetLang}
      currentLook={look}
      onSelectLook={handleSelectLook}
      uiMode={uiMode}
      onToggleUiMode={handleSetUiMode}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
      entitlement={dashboard.entitlement}
      botState={dashboard.config.bot_state}
      tradingMode={dashboard.config.trading_mode}
      activeExchangeLabel={dashboard.activeExchange?.label || dashboard.activeExchange?.provider || 'Exchange'}
      freeBalance={dashboard.balance.free || '0'}
      markets={markets}
      openTradesCount={dashboard.openTrades.length}
      recentSignalsCount={dashboard.recentSignals.length}
      onStartStop={handleTopbarStartStop}
      onKillSwitch={handleKillSwitch}
      onSelectSymbolForTerminal={openTerminalWithSymbol}
      onRefresh={loadSessionAndDashboard}
      onOpenSupport={() => setSupportOpen(true)}
      onOpenAcademy={() => setAcademyOpen(true)}
      onDirectConnectWallet={handleDirectConnectWallet}
      walletConnecting={walletConnecting}
      onLogout={handleLogout}
    >
      <Suspense
        fallback={
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--gold)] border-t-transparent animate-spin" />
            <p className="text-xs font-bold text-dim">{lang === 'fa' ? 'در حال بارگذاری...' : 'Loading...'}</p>
          </div>
        }
      >
      {activeTab === 'overview' && (
        <OverviewPage
          lang={lang}
          uiMode={uiMode}
          onToggleUiMode={handleSetUiMode}
          user={user}
          data={dashboard}
          markets={markets}
          onNavigate={setActiveTab}
          onSelectTerminalSymbol={openTerminalWithSymbol}
          onRefresh={loadSessionAndDashboard}
          onOpenAcademy={() => setAcademyOpen(true)}
          onUpgradeUser={(u) => setUser(u)}
        />
      )}
      {activeTab === 'aichat' && (
        <AiChatPage
          lang={lang}
          onNavigate={setActiveTab}
          onSelectSymbolForTerminal={(sym) => openTerminalWithSymbol(sym)}
        />
      )}
      {activeTab === 'myai' && (
        <MyAiPage
          lang={lang}
          hasPaidPlan={Boolean(dashboard.entitlement?.hasPaidPlan)}
          onNavigate={setActiveTab}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'dex' && (
        <DexTrustPage
          lang={lang}
          user={user}
          onUserRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'terminal' && (
        <TerminalPage
          lang={lang}
          uiMode={uiMode}
          onToggleUiMode={handleSetUiMode}
          symbol={terminalSymbol}
          setSymbol={setTerminalSymbol}
          marketType={marketType}
          onChangeMarketType={handleChangeMarketType}
          data={dashboard}
          markets={markets}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'markets' && (
        <MarketsPage
          lang={lang}
          uiMode={uiMode}
          markets={markets}
          iranRate={dashboard.iranRate?.usdtIrt}
          marketType={marketType}
          onChangeMarketType={handleChangeMarketType}
          onTradeSymbol={(sym) => openTerminalWithSymbol(sym, marketType)}
        />
      )}
      {activeTab === 'radar' && (
        <RadarLabPage
          lang={lang}
          data={dashboard}
          markets={markets}
          onTradeSymbol={(sym) => openTerminalWithSymbol(sym)}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'copy' && (
        <CopyConnectPage
          lang={lang}
          uiMode={uiMode}
          isAdmin={user.role === 'owner' || user.role === 'admin'}
          data={dashboard}
          entitlement={dashboard.entitlement}
          onNavigate={setActiveTab}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'portfolio' && (
        <PortfolioPage
          lang={lang}
          iranRate={dashboard.iranRate?.usdtIrt}
          data={dashboard}
          onOpenTerminal={openTerminalWithSymbol}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'services' && (
        <ServicesPage
          lang={lang}
          uiMode={uiMode}
          onToggleUiMode={handleSetUiMode}
          currentLook={look}
          onToggleDaylight={handleToggleDaylight}
          user={user}
          data={dashboard}
          onNavigate={setActiveTab}
          onUpdateUser={(u) => setUser(u)}
          onOpenSupport={() => setSupportOpen(true)}
          onLogout={handleLogout}
        />
      )}
      {activeTab === 'card' && (
        <WeeklyCardPage
          lang={lang}
          username={user.username || user.email.split('@')[0] || 'Trader'}
          data={dashboard}
        />
      )}
      {activeTab === 'pricing' && (
        <SubscriptionPage lang={lang} onRefreshDashboard={loadSessionAndDashboard} />
      )}
      {activeTab === 'faq' && <FaqPage lang={lang} />}
      {activeTab === 'admin' && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER') && (
        <AdminPage lang={lang} currentUser={user} onUserUpdated={() => void loadSessionAndDashboard()} />
      )}
      </Suspense>
    </Layout>
    <SupportModal
      open={supportOpen}
      lang={lang}
      authenticated
      onClose={() => setSupportOpen(false)}
    />
    <OnboardingAcademyModal
      open={academyOpen}
      lang={lang}
      user={user}
      onClose={() => setAcademyOpen(false)}
      onDone={loadSessionAndDashboard}
    />
    <FloatingAiChat
      lang={lang}
      authenticated
      activeTab={activeTab}
      onNavigate={setActiveTab}
      onSelectSymbolForTerminal={(sym) => openTerminalWithSymbol(sym)}
    />
    {installOpen && (
      <PwaInstallModal
        lang={lang}
        onClose={() => {
          setInstallOpen(false);
          const qp = new URLSearchParams(window.location.search);
          if (qp.has('install')) {
            qp.delete('install');
            const qs = qp.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
          }
        }}
      />
    )}
    <QuickLauncherModal
      action={quickAction}
      lang={lang}
      dashboard={dashboard}
      onToggleBot={handleTopbarStartStop}
      onKillSwitch={handleKillSwitch}
      onNavigate={(t) => setActiveTab(t)}
      onClose={() => {
        setQuickAction(null);
        const qp = new URLSearchParams(window.location.search);
        if (qp.has('quick')) {
          qp.delete('quick');
          const qs = qp.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
        }
      }}
    />
    <TrustWalletDirectModal
      open={twModalOpen}
      lang={lang}
      handoff={twHandoff}
      mobileLaunched={twMobileLaunched}
      busyRetry={walletConnecting}
      errorText={twModalError}
      onRetryInjected={handleDirectConnectWallet}
      onConnected={async () => {
        await loadSessionAndDashboard();
        setTwModalOpen(false);
        setAcademyOpen(false);
        pushFloatingToast(
          lang === 'fa'
            ? 'کیف‌پول Trust Wallet همگام‌سازی و متصل شد!'
            : 'Trust Wallet synced and connected!',
          'success',
          5500
        );
        setActiveTab('dex');
      }}
      onGoToWalletPage={() => {
        setTwModalOpen(false);
        setActiveTab('dex');
      }}
      onClose={() => setTwModalOpen(false)}
    />
    <FloatingToastHost dir={lang === 'fa' ? 'rtl' : 'ltr'} />
    </>
  );
}
export default App;
