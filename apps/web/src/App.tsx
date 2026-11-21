import { useCallback, useEffect, useState } from 'react';
import type { LookId } from './components/AppearanceModal';
import { DollarinoBrandMark } from './components/BrandGraphics';
import { Layout, type UiMode } from './components/Layout';
import type { ExchangeMarket } from './components/SymbolPickerModal';
import { apiFetch, setStoredToken } from './lib/api';
import type { Lang } from './lib/i18n';
import { getTelegramWebApp, initTelegramMiniApp, isInsideTelegramMiniApp } from './lib/telegram';
import type { AuthUserInfo, DashboardPayload, NavTab } from './lib/types';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { CopyConnectPage } from './pages/CopyConnectPage';
import { FaqPage } from './pages/FaqPage';
import { LandingPage } from './pages/LandingPage';
import { MarketsPage } from './pages/MarketsPage';
import { OverviewPage } from './pages/OverviewPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { RadarLabPage } from './pages/RadarLabPage';
import { ServicesPage } from './pages/ServicesPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { TerminalPage } from './pages/TerminalPage';
import { VerifyCardPage } from './pages/VerifyCardPage';
import { WeeklyCardPage } from './pages/WeeklyCardPage';

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

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [marketType, setMarketType] = useState<'SPOT' | 'FUTURES'>('FUTURES');
  const [terminalSymbol, setTerminalSymbol] = useState('BTCUSDT');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [markets, setMarkets] = useState<ExchangeMarket[]>([]);
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

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('dollarino_lang', l);
  };

  const handleSetUiMode = (next: UiMode) => {
    setUiMode(next);
    localStorage.setItem('dollarino_ui_mode', next);
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
      if (tgLoginToken) {
        const magicRes = await apiFetch<{ token: string; user: AuthUserInfo }>('/api/auth/telegram-magic-login', {
          method: 'POST',
          body: JSON.stringify({ token: tgLoginToken }),
        });
        setStoredToken(magicRes.token);
        urlParams.delete('tg_login');
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
      const dash = await apiFetch<DashboardPayload>('/api/trading/dashboard');
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
        .then((d) => setDashboard(d))
        .catch(() => {});
    }, 12_000);
    return () => clearInterval(iv);
  }, [user]);

  const handleQuickDemo = async () => {
    const res = await apiFetch<{ token: string }>('/api/auth/quick-demo', { method: 'POST' });
    setStoredToken(res.token);
    await loadSessionAndDashboard();
  };

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
    const optimisticState = running ? 'STOPPED' : dashboard.config.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER';
    setDashboard((cur) => (cur ? { ...cur, config: { ...cur.config, bot_state: optimisticState } } : cur));
    try {
      if (running) {
        await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
      } else {
        await apiFetch('/api/trading/bot/start', { method: 'POST', body: JSON.stringify({ scanScope: dashboard.config.scan_scope || 'ALL_MARKET' }) });
      }
      await loadSessionAndDashboard();
    } catch {
      setDashboard((cur) => (cur ? { ...cur, config: { ...cur.config, bot_state: prevState } } : cur));
    }
  };

  const handleKillSwitch = async () => {
    await apiFetch('/api/trading/bot/kill-switch', { method: 'POST' });
    await loadSessionAndDashboard();
  };

  const handleResetDemo = async () => {
    await apiFetch('/api/trading/wallet/reset', { method: 'POST' });
    await loadSessionAndDashboard();
  };

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
      <VerifyCardPage
        cardId={verifyCardId}
        lang={lang}
        onBackHome={() => {
          window.history.pushState({}, '', '/');
          setVerifyCardId(null);
        }}
      />
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
            onQuickDemo={handleQuickDemo}
            onGoAuth={(mode) => {
              setAuthMode(mode);
              setPublicScreen('auth');
            }}
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
      </>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center p-4">
        <div className="panel rounded-3xl p-6 text-center space-y-3 max-w-sm w-full">
          <DollarinoBrandMark size={44} glow />
          <p className="text-sm font-bold text-main">
            {lang === 'fa' ? 'در حال آماده‌سازی میز کار معاملاتی...' : 'Loading your trading desk...'}
          </p>
          <button type="button" onClick={() => void loadSessionAndDashboard()} className="btn-gold px-4 py-2 rounded-xl text-xs">
            {lang === 'fa' ? 'تلاش مجدد' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
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
      activeExchangeLabel={dashboard.activeExchange?.label || dashboard.activeExchange?.provider || 'Paper Desk'}
      freeBalance={dashboard.balance.free || '10000'}
      markets={markets}
      openTradesCount={dashboard.openTrades.length}
      recentSignalsCount={dashboard.recentSignals.length}
      onStartStop={handleTopbarStartStop}
      onKillSwitch={handleKillSwitch}
      onResetDemo={handleResetDemo}
      onSelectSymbolForTerminal={openTerminalWithSymbol}
      onRefresh={loadSessionAndDashboard}
      onLogout={handleLogout}
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
          onUpgradeUser={(u) => setUser(u)}
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
          data={dashboard}
          entitlement={dashboard.entitlement}
          onNavigate={setActiveTab}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'portfolio' && (
        <PortfolioPage
          lang={lang}
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
    </Layout>
  );
}
export default App;
