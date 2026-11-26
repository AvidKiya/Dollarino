import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { LookId } from './components/AppearanceModal';
import { AppInlineTabLoader, AppSplashLoader } from './components/AppSplashLoader';
import { FloatingAiChat } from './components/FloatingAiChat';
import { FloatingToastHost } from './components/FloatingToastHost';
import { Layout, type UiMode } from './components/Layout';
import { QuickLauncherModal } from './components/QuickWidgetsBar';
import type { ExchangeMarket } from './components/SymbolPickerModal';
import { apiFetch, ApiError, setStoredToken } from './lib/api';
import { setLiveUsdtIrt } from './lib/format';
import type { Lang } from './lib/i18n';
import { pushFloatingToast } from './lib/toast';
import { APP_VERSION } from './lib/version';
import { getTelegramWebApp, initTelegramMiniApp, isInsideTelegramMiniApp } from './lib/telegram';
import {
  connectAndPersistAllTrustWallets,
  isMobileWalletPlatform,
  launchTrustWalletUrl,
  requestTrustWalletDappHandoff,
  type TrustWalletDappHandoff,
} from './lib/trustwallet';
import type { AuthUserInfo, DashboardPayload, NavTab } from './lib/types';

const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const CompleteProfileGate = lazy(() => import('./components/CompleteProfileGate').then((m) => ({ default: m.CompleteProfileGate })));
const AdminSecuritySetupGate = lazy(() => import('./components/AdminSecuritySetupGate').then((m) => ({ default: m.AdminSecuritySetupGate })));
const OnboardingAcademyModal = lazy(() => import('./components/OnboardingAcademyModal').then((m) => ({ default: m.OnboardingAcademyModal })));
const PwaInstallModal = lazy(() => import('./components/PwaInstallModal').then((m) => ({ default: m.PwaInstallModal })));
const SupportModal = lazy(() => import('./components/SupportModal').then((m) => ({ default: m.SupportModal })));
const TrustWalletDirectModal = lazy(() => import('./components/TrustWalletDirectModal').then((m) => ({ default: m.TrustWalletDirectModal })));
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
  const [isSidePanelEmbed] = useState<boolean>(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('embed') === 'sidepanel' || qp.get('simple_only') === '1') {
      sessionStorage.setItem('dollarino_embed_sidepanel', '1');
      return true;
    }
    return sessionStorage.getItem('dollarino_embed_sidepanel') === '1';
  });
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('dollarino_lang') === 'en' ? 'en' : 'fa'));
  const [look, setLook] = useState<LookId>(() => {
    const saved = localStorage.getItem('dollarino_look');
    if (saved === 'paper' || saved === 'cosmic') return saved;
    if (saved === 'obsidian' || saved === 'midnight') return 'cosmic';
    return 'paper';
  });
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('embed') === 'sidepanel' || qp.get('simple_only') === '1' || qp.get('ui_mode') === 'simple' || sessionStorage.getItem('dollarino_embed_sidepanel') === '1') {
      return 'simple';
    }
    const saved = localStorage.getItem('dollarino_ui_mode');
    if (saved === 'simple' || saved === 'pro') return saved;
    return 'simple';
  });

  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [publicScreen, setPublicScreen] = useState<'landing' | 'auth'>(() => {
    const qp = new URLSearchParams(window.location.search);
    return qp.get('auth_screen') === '1' || qp.get('tw_signup') === '1' ? 'auth' : 'landing';
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() => {
    const qp = new URLSearchParams(window.location.search);
    return qp.get('auth_mode') === 'login' ? 'login' : 'register';
  });
  const [pending2faToken, setPending2faToken] = useState<string | null>(null);
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
    const tab = qp.get('tab');
    const quick = qp.get('quick');
    if (quick === 'dex' || tab === 'dex') return 'dex';
    if (quick === 'report') return 'portfolio';
    if (tab === 'sniper') {
      sessionStorage.setItem('dollarino_copy_subtab', 'sniper');
      return 'copy';
    }
    if (tab === 'cards') return 'card';
    if (tab && ['overview', 'aichat', 'myai', 'terminal', 'markets', 'dex', 'radar', 'copy', 'portfolio', 'services', 'card', 'pricing', 'faq', 'admin'].includes(tab)) {
      return tab as NavTab;
    }
    return 'overview';
  });
  const [quickAction, setQuickAction] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search).get('quick');
    return q === 'bot-toggle' || q === 'kill-switch' ? q : null;
  });
  const [marketType, setMarketType] = useState<'SPOT' | 'FUTURES'>('FUTURES');
  const [terminalSymbol, setTerminalSymbol] = useState('BTCUSDT');
  const [marketFocusSymbol, setMarketFocusSymbol] = useState<string | null>(null);
  const [marketFocusNonce, setMarketFocusNonce] = useState(0);
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
    if (!user || Boolean(user.must_change_credentials) || isSidePanelEmbed) return;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tw_autoconnect') === '1') return;
    const hasTw = Boolean(
      user.trust_wallet_address || user.trust_wallet_tron || user.trust_wallet_solana || user.trust_wallet_ton
    );
    const seenKey = `dollarino_academy_done_${user.id}`;
    if (!hasTw && !localStorage.getItem(seenKey) && activeTab !== 'admin') {
      setAcademyOpen(true);
    }
  }, [user, activeTab, isSidePanelEmbed]);

  const handleSetLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('dollarino_lang', l);
  };

  const handleSetUiMode = (next: UiMode) => {
    if (isSidePanelEmbed) {
      setUiMode('simple');
      return;
    }
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
      const googleToken = urlParams.get('google_token') || urlParams.get('auth_token');
      const google2fa = urlParams.get('google_2fa') || urlParams.get('twofa_token');
      const googleError = urlParams.get('google_error') || urlParams.get('auth_error');

      if (googleError) {
        setAuthError(googleError);
        setPublicScreen('auth');
        setAuthMode('login');
        urlParams.delete('google_error');
        urlParams.delete('auth_error');
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      } else if (google2fa) {
        setPending2faToken(google2fa);
        setPublicScreen('auth');
        setAuthMode('login');
        urlParams.delete('google_2fa');
        urlParams.delete('twofa_token');
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      } else if (googleToken) {
        setStoredToken(googleToken);
        urlParams.delete('google_token');
        urlParams.delete('auth_token');
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      } else if (tgLoginToken) {
        const magicRes = await apiFetch<{ token?: string; user?: AuthUserInfo; requires2fa?: boolean; challengeToken?: string }>('/api/auth/telegram-magic-login', {
          method: 'POST',
          body: JSON.stringify({ token: tgLoginToken }),
        });
        urlParams.delete('tg_login');
        urlParams.delete('install');
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
        if (magicRes.requires2fa && magicRes.challengeToken) {
          setPending2faToken(magicRes.challengeToken);
          setPublicScreen('auth');
          setAuthMode('login');
          setUser(null);
          setDashboard(null);
          return;
        }
        if (magicRes.token) setStoredToken(magicRes.token);
      } else if (tgWidgetHash && tgWidgetId) {
        const widgetPayload: Record<string, string> = {};
        for (const k of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
          const v = urlParams.get(k);
          if (v) widgetPayload[k] = v;
        }
        const widgetRes = await apiFetch<{ token?: string; user?: AuthUserInfo; requires2fa?: boolean; challengeToken?: string }>('/api/auth/telegram-login-widget', {
          method: 'POST',
          body: JSON.stringify(widgetPayload),
        });
        for (const k of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
          urlParams.delete(k);
        }
        const nextQuery = urlParams.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
        if (widgetRes.requires2fa && widgetRes.challengeToken) {
          setPending2faToken(widgetRes.challengeToken);
          setPublicScreen('auth');
          setAuthMode('login');
          setUser(null);
          setDashboard(null);
          return;
        }
        if (widgetRes.token) setStoredToken(widgetRes.token);
      }

      let me: { user: AuthUserInfo } | null = null;
      const sess = await apiFetch<{ authenticated: boolean; user: AuthUserInfo | null }>('/api/auth/session');
      if (sess.authenticated && sess.user) {
        me = { user: sess.user };
      } else if (isInsideTelegramMiniApp()) {
        const tg = getTelegramWebApp();
        if (tg?.initData) {
          const authRes = await apiFetch<{ token?: string; user?: AuthUserInfo; requires2fa?: boolean; challengeToken?: string }>('/api/auth/telegram-webapp', {
            method: 'POST',
            body: JSON.stringify({ initData: tg.initData }),
          });
          if (authRes.requires2fa && authRes.challengeToken) {
            setPending2faToken(authRes.challengeToken);
            setPublicScreen('auth');
            setAuthMode('login');
            setUser(null);
            setDashboard(null);
            return;
          }
          if (authRes.token && authRes.user) {
            setStoredToken(authRes.token);
            me = { user: authRes.user };
          }
        }
      }
      if (!me) {
        setUser(null);
        setDashboard(null);
        return;
      }
      setUser(me.user);
      if ((me.user.role === 'owner' || me.user.role === 'admin') && Boolean(me.user.must_change_credentials)) {
        setDashboard(null);
        return;
      }
      if (isSidePanelEmbed) {
        setUiMode('simple');
      } else if (me.user.ui_mode === 'simple' || me.user.ui_mode === 'pro') {
        setUiMode(me.user.ui_mode);
        localStorage.setItem('dollarino_ui_mode', me.user.ui_mode);
      }
      const dashPromise = apiFetch<DashboardPayload>('/api/trading/dashboard');
      const futuresMktsPromise = apiFetch<{ markets: ExchangeMarket[] }>('/api/trading/markets?marketType=FUTURES').catch(() => ({ markets: [] }));
      const dash = await dashPromise;
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
      setDashboard(dash);
      if (dash.config?.symbol) setTerminalSymbol((prev) => prev || dash.config.symbol);
      void (activeMkt === 'FUTURES'
        ? futuresMktsPromise
        : apiFetch<{ markets: ExchangeMarket[] }>('/api/trading/markets?marketType=SPOT').catch(() => ({ markets: [] }))
      ).then((mkts) => {
        if (mkts.markets.length) setMarkets(mkts.markets);
      });
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

  // Deploy-parity guard: the Pages frontend and the Worker API are deployed separately.
  // When the Worker still runs an older build, brand-new routes 404
  // (e.g. `/api/trading/accept-risk-terms`) and the UI silently looks broken.
  // Detect it early, tell the user precisely what to do, and self-heal once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const health = await apiFetch<{ ok?: boolean; version?: string }>('/api/health');
        if (cancelled) return;
        const apiVersion = String(health?.version ?? '').trim();
        if (!apiVersion || apiVersion === APP_VERSION) return;

        const bannerKey = `dollarino_api_version_mismatch_${apiVersion}`;
        if (sessionStorage.getItem(bannerKey) === '1') return;
        sessionStorage.setItem(bannerKey, '1');

        const payload = {
          uiVersion: APP_VERSION,
          apiVersion,
          message: lang === 'fa'
            ? `سرویس API روی نسخه ${apiVersion} است ولی رابط کاربری ${APP_VERSION} — بخشی از قابلیت‌ها ۴۰۴ می‌دهند.`
            : `API service is on ${apiVersion} while the UI is ${APP_VERSION} — some features will 404.`,
        };
        console.warn('[dollarino] deploy parity mismatch', payload);

        pushFloatingToast(
          lang === 'fa'
            ? `نسخه سرور (${apiVersion}) با رابط کاربری (${APP_VERSION}) هم‌خوان نیست. برای رفع موقت، حافظه نهان را پاک کنید یا اپراتور باید Worker را دوباره دیپلوی کند.`
            : `Server build (${apiVersion}) does not match the UI (${APP_VERSION}). Hard-refresh, or the operator must redeploy the Worker.`,
          'warn',
          9000,
          {
            label: lang === 'fa' ? 'بروزرسانی اپ' : 'Reload app',
            onClick: () => {
              if ('caches' in window) {
                void window.caches.keys().then((keys) => Promise.all(keys.map((k) => window.caches.delete(k))));
              }
              for (const reg of [navigator.serviceWorker?.controller]) reg?.postMessage?.({ type: 'SKIP_WAITING' });
              window.location.reload();
            },
          }
        );
      } catch {
        // `/api/health` itself failing means the Worker/Pages proxy is unreachable;
        // login and dashboard calls already surface that error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const hasActivePositionsRef = useRef(false);
  const lastTickSigRef = useRef('');
  useEffect(() => {
    hasActivePositionsRef.current = Boolean(
      dashboard &&
        (dashboard.openTrades.length > 0 ||
          dashboard.dexTrades?.some((d) => d.status === 'OPEN') ||
          dashboard.smartCopyPositions?.some((p) => p.status === 'OPEN') ||
          dashboard.perpOrders?.some((o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED'))
    );
  }, [dashboard]);

  useEffect(() => {
    if (!user || Boolean(user.must_change_credentials)) return;
    let cancelled = false;
    let tickInFlight = false;
    let tickTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleTick = () => {
      if (cancelled) return;
      const delayMs = hasActivePositionsRef.current ? 10_000 : 45_000;
      tickTimer = setTimeout(() => {
        if (cancelled) return;
        if (tickInFlight || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
          scheduleTick();
          return;
        }
        tickInFlight = true;
        void apiFetch<{
          ok: boolean;
          balance?: DashboardPayload['balance'];
          openTrades?: DashboardPayload['openTrades'];
          dexTrades?: DashboardPayload['dexTrades'];
          smartCopyPositions?: DashboardPayload['smartCopyPositions'];
          perpOrders?: DashboardPayload['perpOrders'];
          totalUnrealizedPnl?: number;
        }>('/api/trading/live-ticks?poll=1')
          .then((t) => {
            if (cancelled || !t?.ok) return;
            const sig = JSON.stringify([
              t.balance?.free,
              t.balance?.total,
              t.totalUnrealizedPnl ?? 0,
              t.openTrades?.length ?? 0,
              t.dexTrades?.length ?? 0,
              t.smartCopyPositions?.length ?? 0,
              t.perpOrders?.length ?? 0,
            ]);
            const hasAny =
              (t.openTrades?.length ?? 0) > 0 ||
              (t.dexTrades?.length ?? 0) > 0 ||
              (t.smartCopyPositions?.length ?? 0) > 0 ||
              (t.perpOrders?.length ?? 0) > 0;
            if (!hasAny && sig === lastTickSigRef.current) return;
            lastTickSigRef.current = sig;
            setDashboard((prev) =>
              prev
                ? {
                    ...prev,
                    balance: t.balance ?? prev.balance,
                    openTrades: t.openTrades ?? prev.openTrades,
                    dexTrades: t.dexTrades ?? prev.dexTrades,
                    smartCopyPositions: t.smartCopyPositions ?? prev.smartCopyPositions,
                    perpOrders: t.perpOrders ?? prev.perpOrders,
                    stats: {
                      ...prev.stats,
                      unrealizedPnl: t.totalUnrealizedPnl ?? prev.stats.unrealizedPnl,
                    },
                  }
                : prev
            );
          })
          .catch(() => {})
          .finally(() => {
            tickInFlight = false;
            scheduleTick();
          });
      }, delayMs);
    };
    scheduleTick();

    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void apiFetch<DashboardPayload>('/api/trading/dashboard?lite=1')
        .then((d) => {
          if (d.iranRate?.usdtIrt) setLiveUsdtIrt(d.iranRate.usdtIrt, d.iranRate.source);
          setDashboard((prev) =>
            prev && (d.charts?.equityCurve?.length ?? 0) <= 2 && (prev.charts?.equityCurve?.length ?? 0) > 2
              ? { ...d, charts: prev.charts, mixerSnapshot: d.mixerSnapshot ?? prev.mixerSnapshot }
              : d
          );
        })
        .catch(() => {});
    }, 120_000);
    return () => {
      cancelled = true;
      if (tickTimer) clearTimeout(tickTimer);
      clearInterval(iv);
    };
  }, [user]);

  // Public Tether/Toman rate polling while unauthenticated (logged-in users already receive iranRate via /dashboard?lite=1)
  useEffect(() => {
    if (user) return;
    const pollRate = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void apiFetch<{ usdtIrt?: number; usdtIrr?: number; source?: string }>('/api/public/usdt-irt-rate')
        .then((r) => {
          if (r?.usdtIrt && r.usdtIrt >= 30_000) {
            setLiveUsdtIrt(r.usdtIrt, r.source);
          }
        })
        .catch(() => {});
    };
    const rateIv = setInterval(pollRate, 90_000);
    return () => clearInterval(rateIv);
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
    const modeSelected =
      dashboard.tradingModeSelected === true || Number(dashboard.config.trading_mode_selected ?? 0) === 1;
    const riskAccepted = Boolean(dashboard.riskTermsAcceptedAt || user?.risk_terms_accepted_at);
    if (!running && (!modeSelected || !riskAccepted)) {
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
          lang === 'fa' ? 'ربات معاملاتی با موفقیت روشن شد' : 'Trading bot is now active',
          'success'
        );
      }
      await loadSessionAndDashboard();
    } catch (err) {
      setDashboard((cur) => (cur ? { ...cur, config: { ...cur.config, bot_state: prevState } } : cur));
      if (err instanceof ApiError && err.status === 403) {
        setActiveTab('overview');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dollarino:require-risk-terms'));
        }, 60);
        pushFloatingToast(err.message, 'warn');
      } else if (err instanceof ApiError && err.status === 402) {
        pushFloatingToast(
          err.message ||
            (lang === 'fa'
              ? 'حساب واقعی نیازمند تسویه کارمزد ۳٪ سودهای قبلی است (دمو رایگان است).'
              : 'Live mode requires settling overdue 3% profit-share fees (Demo stays free).'),
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

  const openMarketsWithSymbol = (sym: string) => {
    setTerminalSymbol(sym);
    setMarketFocusSymbol(sym);
    setMarketFocusNonce((n) => n + 1);
    setActiveTab('markets');
  };

  if (verifyCardId) {
    return (
      <Suspense fallback={<AppSplashLoader lang={lang} stage="card" />}>
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
    return <AppSplashLoader lang={lang} stage="auth" />;
  }

  if (!user) {
    return (
      <>
        <Suspense fallback={<AppSplashLoader lang={lang} stage="auth" />}>
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
            initial2faToken={pending2faToken}
            externalError={authError}
            onBack={() => {
              setPending2faToken(null);
              setPublicScreen('landing');
            }}
            onSuccess={() => {
              setPending2faToken(null);
              return loadSessionAndDashboard();
            }}
          />
        )}
        </Suspense>
        {supportOpen && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}
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

  if ((user.role === 'owner' || user.role === 'admin') && Boolean(user.must_change_credentials)) {
    return (
      <Suspense fallback={<AppSplashLoader lang={lang} stage="desk" />}>
        <AdminSecuritySetupGate
          lang={lang}
          user={user}
          onCompleted={(updated) => {
            setUser(updated);
            setActiveTab('admin');
            void loadSessionAndDashboard();
          }}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (Number(user.profile_completed ?? 1) === 0) {
    return (
      <Suspense fallback={<AppSplashLoader lang={lang} stage="desk" />}>
        <CompleteProfileGate
          lang={lang}
          user={user}
          onCompleted={(updated) => {
            setUser(updated);
            void loadSessionAndDashboard();
          }}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!dashboard) {
    return (
      <>
        <AppSplashLoader
          lang={lang}
          stage="desk"
          error={authError || null}
          onRetry={() => void loadSessionAndDashboard()}
          onBack={() => void handleLogout()}
        />
        {supportOpen && (
          <Suspense fallback={null}>
            <SupportModal
              open={supportOpen}
              lang={lang}
              authenticated={Boolean(user)}
              onClose={() => setSupportOpen(false)}
            />
          </Suspense>
        )}
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
      uiMode={isSidePanelEmbed ? 'simple' : uiMode}
      onToggleUiMode={isSidePanelEmbed ? undefined : handleSetUiMode}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
      entitlement={dashboard.entitlement}
      botState={dashboard.config.bot_state}
      tradingMode={dashboard.config.trading_mode}
      activeExchangeLabel={dashboard.activeExchange?.label || dashboard.activeExchange?.provider || 'Exchange'}
      freeBalance={dashboard.balance.free || '0'}
      markets={markets}
      openTradesCount={
        dashboard.openTrades.length +
        (dashboard.dexTrades?.filter((d) => d.status === 'OPEN').length || 0) +
        (dashboard.smartCopyPositions?.filter((p) => p.status === 'OPEN').length || 0) +
        (dashboard.perpOrders?.filter((o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED').length || 0)
      }
      recentSignalsCount={dashboard.recentSignals.length}
      onStartStop={handleTopbarStartStop}
      onKillSwitch={handleKillSwitch}
      onSelectSymbolForTerminal={openTerminalWithSymbol}
      onSelectSymbolForMarket={openMarketsWithSymbol}
      onRefresh={loadSessionAndDashboard}
      onOpenSupport={() => setSupportOpen(true)}
      onOpenAcademy={() => setAcademyOpen(true)}
      onDirectConnectWallet={handleDirectConnectWallet}
      walletConnecting={walletConnecting}
      onLogout={handleLogout}
    >
      <Suspense fallback={<AppInlineTabLoader lang={lang} />}>
      {activeTab === 'overview' && (
        <OverviewPage
          lang={lang}
          uiMode={isSidePanelEmbed ? 'simple' : uiMode}
          onToggleUiMode={isSidePanelEmbed ? undefined : handleSetUiMode}
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
          data={dashboard}
          onRefresh={loadSessionAndDashboard}
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
          uiMode={isSidePanelEmbed ? 'simple' : uiMode}
          onToggleUiMode={isSidePanelEmbed ? undefined : handleSetUiMode}
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
          uiMode={isSidePanelEmbed ? 'simple' : uiMode}
          markets={markets}
          iranRate={dashboard.iranRate?.usdtIrt}
          marketType={marketType}
          walletEvmAddress={user.trust_wallet_address}
          focusSymbol={marketFocusSymbol}
          focusNonce={marketFocusNonce}
          onClearFocus={() => setMarketFocusSymbol(null)}
          onChangeMarketType={handleChangeMarketType}
          onTradeSymbol={(sym) => openTerminalWithSymbol(sym, marketType)}
          onRefresh={loadSessionAndDashboard}
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
          uiMode={isSidePanelEmbed ? 'simple' : uiMode}
          onToggleUiMode={isSidePanelEmbed ? undefined : handleSetUiMode}
          currentLook={look}
          onToggleDaylight={handleToggleDaylight}
          user={user}
          data={dashboard}
          onNavigate={setActiveTab}
          onUpdateUser={(u) => setUser(u)}
          onRefresh={loadSessionAndDashboard}
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
        <SubscriptionPage lang={lang} onRefreshDashboard={loadSessionAndDashboard} onNavigate={setActiveTab} />
      )}
      {activeTab === 'faq' && <FaqPage lang={lang} />}
      {activeTab === 'admin' && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER') && (
        <AdminPage lang={lang} currentUser={user} onUserUpdated={() => void loadSessionAndDashboard()} />
      )}
      </Suspense>
    </Layout>
    {supportOpen && (
      <Suspense fallback={null}>
        <SupportModal
          open={supportOpen}
          lang={lang}
          authenticated
          onClose={() => setSupportOpen(false)}
        />
      </Suspense>
    )}
    {academyOpen && (
      <Suspense fallback={null}>
        <OnboardingAcademyModal
          open={academyOpen}
          lang={lang}
          user={user}
          onClose={() => setAcademyOpen(false)}
          onDone={loadSessionAndDashboard}
        />
      </Suspense>
    )}
    <FloatingAiChat
      lang={lang}
      authenticated
      activeTab={activeTab}
      onNavigate={setActiveTab}
      onSelectSymbolForTerminal={(sym) => openTerminalWithSymbol(sym)}
    />
    {installOpen && (
      <Suspense fallback={null}>
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
      </Suspense>
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
    {twModalOpen && (
      <Suspense fallback={null}>
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
      </Suspense>
    )}
    <FloatingToastHost dir={lang === 'fa' ? 'rtl' : 'ltr'} />
    </>
  );
}
export default App;
