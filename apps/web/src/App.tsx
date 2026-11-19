import { useCallback, useEffect, useState } from 'react';
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
import { DashboardPage, type DashboardPayload } from './pages/DashboardPage';
import { ExchangePage } from './pages/ExchangePage';
import { LogsPage } from './pages/LogsPage';
import { RiskStudioPage } from './pages/RiskStudioPage';
import { SignalsPage } from './pages/SignalsPage';
import { StrategyFlowPage } from './pages/StrategyFlowPage';

interface MeUser {
  id: string;
  email: string;
  username: string;
  role: string;
  telegram_id: string | null;
}

type FullDashboard = DashboardPayload & {
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

export function App() {
  const [lang, setLang] = useState<Lang>('fa');
  const [user, setUser] = useState<MeUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [markets, setMarkets] = useState<ExchangeMarket[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

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
    await apiFetch(isRunning ? '/api/trading/bot/stop' : '/api/trading/bot/start', { method: 'POST' });
    await loadSessionAndDashboard();
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
      <div className="min-h-screen bg-[#07090f] flex items-center justify-center text-sm text-slate-400">
        Loading Dollarino (دلارینو)...
      </div>
    );
  }

  if (!user || !dashboard) {
    return <AuthPage lang={lang} setLang={setLang} externalError={authError} onSuccess={loadSessionAndDashboard} />;
  }

  return (
    <Layout
      lang={lang}
      setLang={setLang}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
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
        <DashboardPage lang={lang} data={dashboard} markets={markets} onRefresh={loadSessionAndDashboard} />
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
        <ConnectionsPage lang={lang} onRefreshDashboard={loadSessionAndDashboard} />
      )}
      {activeTab === 'logs' && <LogsPage lang={lang} />}
      {activeTab === 'admin' && (
        <AdminPage lang={lang} currentUser={user} onUserUpdated={loadSessionAndDashboard} />
      )}

      {wizardOpen && (
        <SetupWizardModal
          lang={lang}
          onClose={() => setWizardOpen(false)}
          onCompleted={() => void loadSessionAndDashboard()}
        />
      )}
    </Layout>
  );
}
