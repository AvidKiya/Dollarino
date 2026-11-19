import { useCallback, useEffect, useState } from 'react';
import { DollarinoBrandMark } from './components/BrandGraphics';
import { Layout, type NavTab } from './components/Layout';
import { SetupWizardModal } from './components/SetupWizardModal';
import type { ExchangeMarket } from './components/SymbolPickerModal';
import { apiFetch, setStoredToken } from './lib/api';
import type { Lang } from './lib/i18n';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { BacktestPage } from './pages/BacktestPage';
import { ChartAIPage } from './pages/ChartAIPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { CopyTradePage } from './pages/CopyTradePage';
import { DashboardPage, type DashboardPayload } from './pages/DashboardPage';
import { ExchangePage } from './pages/ExchangePage';
import { LandingPage } from './pages/LandingPage';
import { LogsPage } from './pages/LogsPage';
import { RiskStudioPage } from './pages/RiskStudioPage';
import { SignalsPage } from './pages/SignalsPage';
import { StrategyFlowPage } from './pages/StrategyFlowPage';
import { SubscriptionPage, type UserEntitlement } from './pages/SubscriptionPage';

interface MeUser {
  id: string;
  email: string;
  username: string;
  role: string;
  telegram_id: string | null;
}

type FullDashboard = DashboardPayload & {
  config: DashboardPayload['config'] & { signal_channel_handle?: string };
  entitlement?: UserEntitlement | null;
  recentSignals: Array<{
    id: string;
    source: string;
    symbol: string;
    direction: string;
    price: string;
    status: string;
    raw_text: string;
    created_at: string;
  }>;
};

function applyThemeToRoot(t: 'dark' | 'light') {
  const root = document.documentElement;
  root.classList.toggle('theme-light', t === 'light');
  root.classList.toggle('dark', t === 'dark');
  root.style.colorScheme = t;
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('dollarino_lang') === 'en' ? 'en' : 'fa'));
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('dollarino_theme') === 'light' ? 'light' : 'dark'
  );
  const [user, setUser] = useState<MeUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicScreen, setPublicScreen] = useState<'landing' | 'auth'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [markets, setMarkets] = useState<ExchangeMarket[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('dollarino_lang', l);
  };

  const handleSetTheme = (t: 'dark' | 'light') => {
    setTheme(t);
    localStorage.setItem('dollarino_theme', t);
    applyThemeToRoot(t);
  };

  const loadSessionAndDashboard = useCallback(async () => {
    try {
      setAuthError(null);
      const me = await apiFetch<{ user: MeUser }>('/api/auth/me');
      setUser(me.user);
      const [dash, mkts] = await Promise.all([
        apiFetch<FullDashboard>('/api/trading/dashboard'),
        apiFetch<{ markets: ExchangeMarket[] }>('/api/trading/markets').catch(() => ({ markets: [] })),
      ]);
      setDashboard(dash);
      if (mkts.markets.length) setMarkets(mkts.markets);
    } catch (err) {
      setUser(null);
      setDashboard(null);
      const msg = err instanceof Error ? err.message : '';
      if (msg && !msg.includes('Authentication required')) {
        setAuthError(msg);
      }
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void loadSessionAndDashboard();
  }, [loadSessionAndDashboard]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
    setUser(null);
    setDashboard(null);
  };

  const handleStartStop = async () => {
    if (!dashboard) return;
    const isRunning = dashboard.config.bot_state.startsWith('RUNNING');
    try {
      await apiFetch(isRunning ? '/api/trading/bot/stop' : '/api/trading/bot/start', { method: 'POST' });
      await loadSessionAndDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to change bot state';
      if (msg.includes('subscription') || msg.includes('Pro') || msg.includes('VIP') || msg.includes('SUBSCRIPTION_REQUIRED')) {
        setActiveTab('subscription');
        window.alert(
          lang === 'fa'
            ? 'برای استفاده از هوش مصنوعی مرکزی یا معامله واقعی صرافی، ابتدا اشتراک Pro را فعال کنید. استراتژی دلارینو V0.1 در دمو رایگان است!'
            : msg
        );
      } else if (msg.includes('NO_ACTIVE_AI_KEY') || msg.includes('موتور هوش مصنوعی مرکزی')) {
        window.alert(
          lang === 'fa'
            ? 'موتور هوش مصنوعی مرکزی در حال تنظیم توسط مدیریت است. همین الان می‌توانید با استراتژی رایگان «دلارینو V0.1» شروع کنید!'
            : msg
        );
      } else {
        window.alert(msg);
      }
    }
  };

  const handleKillSwitch = async () => {
    if (
      !window.confirm(
        lang === 'fa'
          ? 'توقف اضطراری و بستن تمام پوزیشن‌های باز؟'
          : 'Activate Emergency Kill Switch and close all open positions?'
      )
    ) {
      return;
    }
    await apiFetch('/api/trading/bot/kill-switch', { method: 'POST' });
    await loadSessionAndDashboard();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen app-shell flex flex-col items-center justify-center gap-3 text-sm text-sub">
        <DollarinoBrandMark size={64} glow />
        <span className="font-bold">Loading Dollarino...</span>
      </div>
    );
  }

  if (!user || !dashboard) {
    if (publicScreen === 'landing' && !authError) {
      return (
        <LandingPage
          lang={lang}
          setLang={handleSetLang}
          theme={theme}
          setTheme={handleSetTheme}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setPublicScreen('auth');
          }}
        />
      );
    }
    return (
      <AuthPage
        lang={lang}
        setLang={handleSetLang}
        theme={theme}
        setTheme={handleSetTheme}
        initialMode={authMode}
        externalError={authError}
        onBack={() => {
          setAuthError(null);
          setPublicScreen('landing');
        }}
        onSuccess={loadSessionAndDashboard}
      />
    );
  }

  return (
    <Layout
      lang={lang}
      setLang={handleSetLang}
      theme={theme}
      setTheme={handleSetTheme}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
      entitlement={dashboard.entitlement}
      botState={dashboard.config.bot_state}
      tradingMode={dashboard.config.trading_mode}
      activeExchangeLabel={dashboard.activeExchange.label}
      freeBalance={dashboard.balance.free}
      onStartStop={handleStartStop}
      onKillSwitch={handleKillSwitch}
      onOpenWizard={() => setWizardOpen(true)}
      onLogout={handleLogout}
    >
      {activeTab === 'dashboard' && (
        <DashboardPage
          lang={lang}
          data={dashboard}
          markets={markets}
          onRefresh={loadSessionAndDashboard}
          onOpenConnections={() => setActiveTab('connections')}
          onOpenTab={setActiveTab}
        />
      )}
      {activeTab === 'copytrade' && (
        <CopyTradePage
          lang={lang}
          webhookSecret={dashboard.config.webhook_secret}
          executionMode={dashboard.config.trade_execution_mode}
          channelHandle={dashboard.config.signal_channel_handle || '@Dollarinoofficial'}
          recentSignals={dashboard.recentSignals}
          entitlement={dashboard.entitlement ?? undefined}
          onExecuted={loadSessionAndDashboard}
          onOpenSubscription={() => setActiveTab('subscription')}
        />
      )}
      {activeTab === 'subscription' && (
        <SubscriptionPage lang={lang} onRefreshDashboard={loadSessionAndDashboard} />
      )}
      {activeTab === 'flow' && (
        <StrategyFlowPage
          lang={lang}
          config={dashboard.config}
          markets={markets}
          provider={dashboard.activeExchange.provider}
          mixerSnapshot={dashboard.mixerSnapshot}
          onRefresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'risk' && (
        <RiskStudioPage
          lang={lang}
          config={dashboard.config}
          markets={markets}
          provider={dashboard.activeExchange.provider}
          balanceFree={dashboard.balance.free}
          refresh={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'backtest' && (
        <BacktestPage lang={lang} markets={markets} provider={dashboard.activeExchange.provider} />
      )}
      {activeTab === 'chartAi' && (
        <ChartAIPage
          lang={lang}
          markets={markets}
          provider={dashboard.activeExchange.provider}
          onExecuted={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'signals' && (
        <SignalsPage
          lang={lang}
          webhookSecret={dashboard.config.webhook_secret}
          recentSignals={dashboard.recentSignals}
          onExecuted={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'exchange' && (
        <ExchangePage
          lang={lang}
          activeExchange={dashboard.activeExchange}
          markets={markets}
          onExecuted={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'connections' && (
        <ConnectionsPage
          lang={lang}
          entitlement={dashboard.entitlement}
          onOpenSubscription={() => setActiveTab('subscription')}
          onRefreshDashboard={loadSessionAndDashboard}
        />
      )}
      {activeTab === 'logs' && <LogsPage lang={lang} />}
      {activeTab === 'admin' && (
        <AdminPage lang={lang} currentUser={user} onUserUpdated={loadSessionAndDashboard} />
      )}

      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          availableBalance={Number(dashboard.balance.free || 10000)}
          onClose={() => setWizardOpen(false)}
          onCompleted={() => void loadSessionAndDashboard()}
        />
      )}
    </Layout>
  );
}
