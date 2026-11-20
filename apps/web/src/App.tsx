import { useCallback, useEffect, useState } from 'react';
import { AppearanceModal, type LookId } from './components/AppearanceModal';
import { DollarinoCoinMark, Layout } from './components/Layout';
import type { ExchangeMarket } from './components/SymbolPickerModal';
import { apiFetch, setStoredToken } from './lib/api';
import type { Lang } from './lib/i18n';
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
import { SubscriptionPage } from './pages/SubscriptionPage';
import { TerminalPage } from './pages/TerminalPage';
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
    if (saved === 'obsidian' || saved === 'paper' || saved === 'cosmic' || saved === 'midnight') return saved;
    return localStorage.getItem('dollarino_theme') === 'light' ? 'paper' : 'cosmic';
  });
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicScreen, setPublicScreen] = useState<'landing' | 'auth'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [terminalSymbol, setTerminalSymbol] = useState('BTCUSDT');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [markets, setMarkets] = useState<ExchangeMarket[]>([]);

  useEffect(() => {
    applyLookToRoot(look);
  }, [look]);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('dollarino_lang', l);
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
      const me = await apiFetch<{ user: AuthUserInfo }>('/api/auth/me');
      setUser(me.user);
      const [dash, mkts] = await Promise.all([
        apiFetch<DashboardPayload>('/api/trading/dashboard'),
        apiFetch<{ markets: ExchangeMarket[] }>('/api/trading/markets').catch(() => ({ markets: [] })),
      ]);
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
    const running = dashboard.config.bot_state.startsWith('RUNNING');
    if (running) {
      await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: false }) });
    } else {
      await apiFetch('/api/trading/bot/start', { method: 'POST', body: JSON.stringify({ scanScope: dashboard.config.scan_scope || 'ALL_MARKET' }) });
    }
    await loadSessionAndDashboard();
  };

  const handleKillSwitch = async () => {
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    await loadSessionAndDashboard();
  };

  const handleResetDemo = async () => {
    await apiFetch('/api/trading/wallet/topup', { method: 'POST', body: JSON.stringify({ amountUsd: 2500 }) });
    await loadSessionAndDashboard();
  };

  const openTerminalWithSymbol = (sym?: string) => {
    if (sym) setTerminalSymbol(sym);
    setActiveTab('terminal');
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <DollarinoCoinMark size={52} />
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
            onOpenAppearance={() => setAppearanceOpen(true)}
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

        <AppearanceModal
          open={appearanceOpen}
          lang={lang}
          currentLook={look}
          onSelectLook={handleSelectLook}
          onClose={() => setAppearanceOpen(false)}
        />
      </>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center p-4">
        <div className="panel rounded-3xl p-6 text-center space-y-3 max-w-sm w-full">
          <DollarinoCoinMark size={44} />
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
          symbol={terminalSymbol}
          setSymbol={setTerminalSymbol}
          data={dashboard}
          markets={markets}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'markets' && (
        <MarketsPage
          lang={lang}
          markets={markets}
          onTradeSymbol={(sym) => openTerminalWithSymbol(sym)}
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
      {activeTab === 'admin' && user.role.toUpperCase() === 'ADMIN' && (
        <AdminPage lang={lang} currentUser={user} onUserUpdated={() => void loadSessionAndDashboard()} />
      )}
    </Layout>
  );
}
export default App;
