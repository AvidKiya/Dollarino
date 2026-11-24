import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Crown,
  Eye,
  Flame,
  Gift,
  Globe,
  Headphones,
  History,
  Image,
  KeyRound,
  Layers,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Newspaper,
  Phone,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { FounderProfile, OnchainApiProviderItem, PromoBannerItem } from '../lib/types';

interface PlatformAIEngine {
  id: string;
  slot_order: number;
  provider: 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
  label: string;
  model: string;
  base_url: string | null;
  weight: number;
  is_active: number;
  api_key_masked: string;
  calls_today: number;
  daily_call_cap: number;
  last_test_status: string;
}

interface PlatformAISignal {
  id: string;
  symbol: string;
  timeframe: string;
  action: string;
  confidence: number;
  model_count: number;
  consensus_mode: string;
  thesis: string;
  created_at: string;
  model_votes: Array<{ provider: string; model: string; action: string; confidence: number }>;
}

const ADMIN_AI_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  openai_compatible: ['baidu/deepseek-v4.1-flash-1017', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
};

interface AdminOverview {
  users: Array<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    telegram_username: string | null;
    phone_number?: string | null;
    phone_verified?: number;
    trust_wallet_address?: string | null;
    trust_wallet_tron?: string | null;
    trust_wallet_solana?: string | null;
    trust_wallet_verified?: number;
    ui_mode?: string | null;
    activePlan?: string | null;
    created_at: string;
  }>;
  stats: {
    totalUsers: number;
    phoneVerifiedCount?: number;
    trustWalletConnectedCount?: number;
    activeSubscriptions?: number;
    totalRevenueUsd?: number;
    openSupportTickets?: number;
    dexTradesTotal?: number;
    dexTradesOpen?: number;
    signalsCount: number;
    botsCount: number;
    trades: { total: number; open_count: number; total_pnl: number } | null;
    serverFees?: {
      accruedFeeUsd: number;
      settledFeeUsd: number;
      totalProfitablePnlUsd: number;
      profitableTrades: number;
    };
  };
  settings: Record<string, string>;
}

interface AdminDexTrade {
  id: string;
  user_id: string;
  username?: string;
  email?: string;
  chain_id: string;
  token_symbol: string;
  token_address: string;
  side: string;
  amount_usd: number;
  entry_price_usd: number;
  current_price_usd: number;
  pnl_usd: number;
  status: string;
  tx_hash: string | null;
  opened_at: string;
}

interface AdminAuditLog {
  id: string;
  user_id: string | null;
  username?: string | null;
  email?: string | null;
  category: string;
  level: string;
  message: string;
  created_at: string;
}

interface SubOrder {
  id: string;
  user_id: string;
  email: string;
  username: string;
  plan_code: string;
  name_fa: string | null;
  name_en: string | null;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  receipt_image_url?: string | null;
  amount_usd: number;
  amount_toman: number;
  created_at: string;
}

interface PlanRow {
  code: string;
  name_fa?: string;
  name_en?: string;
  price_usd: number;
  price_toman: number;
  duration_days?: number;
  is_popular?: number;
  is_active?: number;
}

interface AdminCopyTrader {
  id: string;
  display_name: string;
  handle: string;
  specialty: string;
  win_rate: number;
  roi_30d_pct: number;
  max_drawdown_pct: number;
  followers_count: number;
  risk_level: string;
  is_verified: number;
  is_active: number;
  trades?: Array<{
    id: string;
    symbol: string;
    side: string;
    entry_price: number;
    leverage: number;
    pnl_pct: number;
    status: string;
  }>;
}

interface AdminSupportTicket {
  id: string;
  user_id: string | null;
  username: string | null;
  email: string | null;
  subject: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  last_message_at: string;
}

interface AdminSupportMessage {
  id: string;
  ticket_id: string;
  sender_role: 'user' | 'admin' | 'ai' | 'system';
  sender_name: string | null;
  message: string;
  image_data_url?: string | null;
  created_at: string;
}

export function AdminPage({
  lang,
  currentUser,
  onUserUpdated,
}: {
  lang: Lang;
  currentUser: { id: string; email: string; username: string; role: string };
  onUserUpdated: () => void;
}) {
  const isFa = lang === 'fa';
  const roleLower = (currentUser.role || '').toLowerCase();
  const isOwnerOrAdmin = roleLower === 'owner' || roleLower === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [helpText, setHelpText] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('اطلاعیه رسمی دلارینو');
  const [broadcastTg, setBroadcastTg] = useState(true);
  const [broadcastInApp, setBroadcastInApp] = useState(true);
  const [broadcastScheduledAt, setBroadcastScheduledAt] = useState('');
  const [broadcastList, setBroadcastList] = useState<
    Array<{
      id: string;
      title: string;
      message: string;
      deliver_telegram: number;
      deliver_inapp: number;
      scheduled_at: string | null;
      status: string;
      sent_count: number;
      created_at: string;
    }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);

  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState('pro_monthly');
  const [grantDays, setGrantDays] = useState(30);

  const [payCfg, setPayCfg] = useState({
    subscriptionRequired: true,
    usdtTrc20Wallet: '',
    iranCardNumber: '',
    iranCardHolder: '',
    telegramSupport: '@Dollarino_bot',
    proPriceUsd: 29,
    proPriceToman: 1950000,
    vipPriceUsd: 59,
    vipPriceToman: 3950000,
  });

  const [adminSection, setAdminSection] = useState<'menu' | 'overview' | 'banners' | 'founder' | 'users' | 'payments' | 'ops' | 'dex_logs' | 'all'>('menu');
  const [founderProfile, setFounderProfile] = useState<FounderProfile>({
    fullNameFa: 'آوید کیا',
    fullNameEn: 'Avid Kiya',
    roleFa: 'بنیان‌گذار، معمار نرم‌افزار و توسعه‌دهنده ۱۰۰٪ مستقل (صفر تا صد)',
    roleEn: 'Founder, Lead Software Architect & 100% Independent Solo Builder',
    photoUrl: '',
    email: '',
    phone: '',
    addressFa: '',
    addressEn: '',
    telegram: '@avidkiya',
    telegramUrl: 'https://t.me/avidkiya',
    channel: '@Dollarino_official',
    channelUrl: 'https://t.me/Dollarino_official',
    instagram: '@avid_kiya',
    instagramUrl: 'https://instagram.com/avid_kiya',
    twitter: '@avid_kiya',
    twitterUrl: 'https://x.com/avid_kiya',
    github: '',
    website: '',
    verificationId: 'TG-OWNER-944021185',
    independenceFa: 'تمامی بخش‌های دلارینو از صفر تا صد توسط یک نفر (آوید کیا) طراحی، کدنویسی و نگهداری شده و زیر پوشش هیچ شرکت، گروه یا واسطه ثالثی نیست.',
    independenceEn: 'Designed, engineered, and operated 0-to-100 solely by Avid Kiya without any third-party cover, syndicate, or intermediary.',
    bioFa: '',
    bioEn: '',
    missionFa: '',
    missionEn: '',
    antiPonziFa: '',
    antiPonziEn: '',
    showPublic: true,
  });
  const [founderSaving, setFounderSaving] = useState(false);
  const [showAdminSecurityBox, setShowAdminSecurityBox] = useState(false);
  const [showBotFatherGuide, setShowBotFatherGuide] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'kyc_verified' | 'trust_wallet' | 'unverified'>('all');
  const [requirePhoneKyc, setRequirePhoneKyc] = useState(true);
  const [trustReceivers, setTrustReceivers] = useState({
    evm: '',
    sol: '',
    ton: '',
  });
  const [dexTrades, setDexTrades] = useState<AdminDexTrade[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [adminReferrals, setAdminReferrals] = useState<
    Array<{
      id: string;
      referrer_name?: string;
      referred_name?: string;
      status: string;
      commission_usd?: number;
      fraud_flag?: number;
      fraud_reason?: string | null;
      created_at: string;
    }>
  >([]);
  const [refWithdrawals, setRefWithdrawals] = useState<
    Array<{
      id: string;
      username?: string;
      email?: string;
      amount_usd: number;
      target_type: string;
      wallet_address?: string | null;
      network?: string | null;
      status: string;
      tx_hash?: string | null;
      created_at: string;
    }>
  >([]);
  const [wdTxInputs, setWdTxInputs] = useState<Record<string, string>>({});

  // Channel (@Dollarino_official) Management State
  const [channelCheck, setChannelCheck] = useState<{
    ok?: boolean;
    channelHandle?: string;
    botStatus?: string;
    canPostMessages?: boolean;
    message?: string;
    channels?: Array<{ key: string; handle: string; enabled: boolean }>;
  } | null>(null);
  const [checkingChannel, setCheckingChannel] = useState(false);
  const [fiveChannels, setFiveChannels] = useState({
    signals: '@Dollarino_official',
    results: '@Dollarino_results',
    news: '@Dollarino_news',
    education: '@Dollarino_academy',
    alerts: '@Dollarino_alerts',
    enableSignals: true,
    enableResults: true,
    enableNews: true,
    enableEdu: true,
    enableAlerts: true,
  });
  const [channelSignalForm, setChannelSignalForm] = useState({
    symbol: 'BTCUSDT',
    direction: 'LONG' as 'LONG' | 'SHORT',
    timeframe: '15m',
    entryPrice: '',
    stopLoss: '',
    tp1: '',
    tp2: '',
    tp3: '',
    leverage: 10,
    engineKey: 'dollarino_v01',
    note: '',
  });
  const [channelNewsForm, setChannelNewsForm] = useState({
    title: '',
    category: 'MARKET_NEWS',
    impact: 'HIGH',
    summary: '',
    analysis: '',
    symbolsText: 'BTCUSDT, ETHUSDT',
  });
  const [channelNewsList, setChannelNewsList] = useState<Array<{ id: string; title: string; category: string; impact: string; created_at: string }>>([]);

  const [aiEngines, setAiEngines] = useState<PlatformAIEngine[]>([]);
  const [aiSignals, setAiSignals] = useState<PlatformAISignal[]>([]);
  const [consensusMode, setConsensusMode] = useState('ENSEMBLE_AUTO');
  const [cacheTtlSec, setCacheTtlSec] = useState(180);
  const [testingAi, setTestingAi] = useState(false);
  const [hilinkupSecretReady, setHilinkupSecretReady] = useState(false);
  const [adminLightboxImg, setAdminLightboxImg] = useState<string | null>(null);
  const [aiTestResults, setAiTestResults] = useState<Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>>([]);
  const [aiForm, setAiForm] = useState({
    slotOrder: 1,
    provider: 'deepseek' as PlatformAIEngine['provider'],
    label: 'مدل ۱ (DeepSeek)',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    weight: 100,
  });

  // Copy Traders Admin State
  const [copyTraders, setCopyTraders] = useState<AdminCopyTrader[]>([]);
  const [siteTopTraders, setSiteTopTraders] = useState<
    Array<{
      userId: string;
      username: string;
      handle: string;
      hasTrustWallet: boolean;
      mode: 'LIVE' | 'PAPER';
      closedTrades: number;
      openTrades: number;
      winTrades: number;
      winRate: number;
      netPnlUsd: number;
      roi30dPct: number;
      maxDrawdownPct: number;
      specialty: string;
      riskLevel: string;
      score: number;
      alreadyPublished: boolean;
      isActiveInCopyList: boolean;
      followersCount: number;
    }>
  >([]);
  const [siteTraderAutoCfg, setSiteTraderAutoCfg] = useState({
    enabled: true,
    minWinRate: 52,
    maxCount: 6,
  });
  const [syncingSiteTraders, setSyncingSiteTraders] = useState(false);
  const [showManualCopyForm, setShowManualCopyForm] = useState(false);

  // Bot Token, Webhook, Auto-Publishing & Community Group State
  const [botTokenInput, setBotTokenInput] = useState('');
  const [botWebhookBaseInput, setBotWebhookBaseInput] = useState('');
  const [botTokenStatus, setBotTokenStatus] = useState<{
    configured: boolean;
    source: 'db' | 'env' | 'none';
    masked: string;
    botUsername: string;
  }>({ configured: false, source: 'none', masked: '', botUsername: 'Dollarino_bot' });
  const [botWebhookInfo, setBotWebhookInfo] = useState<{
    url: string;
    pending_update_count: number;
    last_error_message?: string;
  } | null>(null);
  const [savingBotToken, setSavingBotToken] = useState(false);
  const [autoPublishingCfg, setAutoPublishingCfg] = useState({
    alwaysOnSignals: true,
    alwaysOnAiBroadcast: true,
    autoPublishSignalsToChannel: true,
  });
  const [runningAutoKind, setRunningAutoKind] = useState<string | null>(null);
  const [communityGroupCfg, setCommunityGroupCfg] = useState({
    id: '',
    invite: '',
    antiLink: true,
    antiForward: true,
    antiScam: true,
    aiAssistant: true,
    welcome: true,
  });
  const [newTrader, setNewTrader] = useState({
    displayName: '',
    handle: '@',
    specialty: 'BTC/ETH Momentum',
    bioFa: '',
    userEmailOrId: '',
    telegramId: '',
    askBeforePublish: true,
    winRate: 76,
    roi30dPct: 38,
    maxDrawdownPct: 5.5,
    riskLevel: 'BALANCED',
  });
  const [tradeTargetId, setTradeTargetId] = useState('');
  const [newTraderTrade, setNewTraderTrade] = useState({
    symbol: 'BTCUSDT',
    side: 'LONG' as 'LONG' | 'SHORT',
    entryPrice: 92000,
    stopLoss: 90200,
    tp1: 95200,
    tp2: 96800,
    tp3: 98500,
    leverage: 10,
    pnlPct: 12.4,
    status: 'OPEN' as 'OPEN' | 'CLOSED',
    askConfirm: false,
    mirrorNow: true,
    note: '',
  });

  // Online Support Admin State
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [allTicketMsgs, setAllTicketMsgs] = useState<AdminSupportMessage[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [supReply, setSupReply] = useState('');

  // Full Plans CRUD State
  const [adminPlans, setAdminPlans] = useState<PlanRow[]>([]);
  const [newPlan, setNewPlan] = useState({
    code: '',
    nameFa: '',
    nameEn: '',
    priceUsd: 29,
    priceToman: 2030000,
    durationDays: 30,
    isPopular: false,
  });
  const [onchainApis, setOnchainApis] = useState<OnchainApiProviderItem[]>([]);
  const [onchainInputs, setOnchainInputs] = useState<Record<string, string>>({});
  const [promoBanners, setPromoBanners] = useState<PromoBannerItem[]>([]);
  const [bannerForm, setBannerForm] = useState({
    id: '',
    badge_fa: 'پیشنهاد ویژه',
    badge_en: 'FEATURED',
    title_fa: '',
    title_en: '',
    subtitle_fa: '',
    subtitle_en: '',
    cta_label_fa: 'شروع فوری',
    cta_label_en: 'Launch Now',
    cta_target: 'copy',
    image_url: '/images/smart-wallet-radar.webp',
    accent_theme: 'gold',
    placement: 'BOTH',
    sort_order: 1,
  });
  const [systemHealth, setSystemHealth] = useState<{
    runningBots: number;
    openCexTrades: number;
    activeSmartCopyRules: number;
    openCopyPositionsV2: number;
    userCopyVaults: number;
    perpDexOrders: number;
    auditLogsTotal: number;
    activeBanners: number;
    activeOnchainProviders: number;
    productionChecks?: {
      jwtSecretOk: boolean;
      encryptionKeyOk: boolean;
      telegramBotConfigured: boolean;
      aiEngineConfigured: boolean;
      feeReceiverWalletConfigured: boolean;
      allowLiveTrading: boolean;
      publicWebUrl: string;
    };
  } | null>(null);
  const [onchainBusy, setOnchainBusy] = useState<string | null>(null);
  const [adminFeeAccounts, setAdminFeeAccounts] = useState<
    Array<{
      id: string;
      username: string;
      email: string;
      prepaid_credit_usd: number;
      penalty_usd: number;
      lock_status: string;
      fee_grace_deadline: string | null;
      accrued_usd: number;
      pending_verify_usd: number;
      settled_usd: number;
    }>
  >([]);
  const [adminFeePolicy, setAdminFeePolicy] = useState({
    graceLimitUsd: '2.0',
    graceHours: '72',
    latePenaltyPct: '25',
    autoLockEnabled: true,
  });

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const [ov, ordRes, subMe, aiRes, ctRes, topTrRes, chStatusRes, supRes, plansRes, newsRes, dexRes, logRes, refAdminRes, onchainRes, bannersRes, healthRes, broadcastsRes, feeAdminRes, founderRes] = await Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<{ orders: SubOrder[] }>('/api/subscriptions/admin/orders').catch(() => ({ orders: [] })),
      apiFetch<{ plans: PlanRow[]; paymentConfig: Record<string, string> }>('/api/subscriptions/me').catch(() => null),
      apiFetch<{
        engines: PlatformAIEngine[];
        consensusMode: string;
        cacheTtlSec: number;
        latestSignals: PlatformAISignal[];
        hilinkupSecretConfigured?: boolean;
      }>('/api/admin/ai-engines').catch(() => null),
      apiFetch<{ traders: AdminCopyTrader[]; trades: Array<{ id: string; trader_id: string; symbol: string; direction: string; entry_price: string; leverage: number; pnl_pct: number; status: string }> }>('/api/admin/copy-traders').catch(() => ({ traders: [], trades: [] })),
      apiFetch<{ candidates?: typeof siteTopTraders; autoConfig?: typeof siteTraderAutoCfg }>('/api/admin/site-traders/top').catch(() => ({ candidates: [], autoConfig: undefined })),
      apiFetch<{
        ok?: boolean;
        channelHandle?: string;
        status?: string;
        canPostMessages?: boolean;
        botUsername?: string;
        error?: string;
        tokenStatus?: typeof botTokenStatus;
        webhookInfo?: typeof botWebhookInfo;
        automation?: typeof autoPublishingCfg;
      }>('/api/admin/telegram/channel-status').catch(() => null),
      apiFetch<{ tickets: AdminSupportTicket[]; messages: AdminSupportMessage[] }>('/api/admin/support').catch(() => ({ tickets: [], messages: [] })),
      apiFetch<{ plans: PlanRow[] }>('/api/admin/plans').catch(() => ({ plans: [] })),
      apiFetch<{ news: Array<{ id: string; title: string; category: string; impact: string; created_at: string }> }>('/api/admin/channel/news').catch(() => ({ news: [] })),
      apiFetch<{ trades: AdminDexTrade[] }>('/api/admin/dex-trades').catch(() => ({ trades: [] })),
      apiFetch<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs').catch(() => ({ logs: [] })),
      apiFetch<{ referrals: typeof adminReferrals; withdrawals: typeof refWithdrawals }>('/api/admin/referrals').catch(() => ({ referrals: [], withdrawals: [] })),
      apiFetch<{ providers: OnchainApiProviderItem[] }>('/api/admin/onchain-apis').catch(() => ({ providers: [] })),
      apiFetch<{ banners: PromoBannerItem[] }>('/api/admin/banners').catch(() => ({ banners: [] })),
      apiFetch<{ health: typeof systemHealth }>('/api/admin/system-health').catch(() => ({ health: null })),
      apiFetch<{ broadcasts?: typeof broadcastList }>('/api/admin/broadcasts').catch(() => ({ broadcasts: [] })),
      apiFetch<{ policy?: { graceLimitUsd: number; graceHours: number; latePenaltyPct: number; autoLockEnabled: boolean }; accounts?: typeof adminFeeAccounts }>('/api/subscriptions/admin/server-fees').catch(() => ({ policy: undefined, accounts: [] })),
      apiFetch<{ profile?: FounderProfile }>('/api/admin/founder-profile').catch(() => ({ profile: undefined })),
    ]);
    if (founderRes.profile) {
      setFounderProfile(founderRes.profile);
    }
    setAdminFeeAccounts(feeAdminRes.accounts || []);
    if (feeAdminRes.policy) {
      setAdminFeePolicy({
        graceLimitUsd: String(feeAdminRes.policy.graceLimitUsd ?? 2),
        graceHours: String(feeAdminRes.policy.graceHours ?? 72),
        latePenaltyPct: String(feeAdminRes.policy.latePenaltyPct ?? 25),
        autoLockEnabled: feeAdminRes.policy.autoLockEnabled !== false,
      });
    }
    setOnchainApis(onchainRes.providers || []);
    setPromoBanners(bannersRes.banners || []);
    setSystemHealth(healthRes.health || null);
    setBroadcastList(broadcastsRes.broadcasts || []);
    setData(ov);
    setOrders(ordRes.orders);
    setAdminPlans(plansRes.plans || []);
    setChannelNewsList(newsRes.news || []);
    setDexTrades(dexRes.trades || []);
    setAuditLogs(logRes.logs || []);
    setAdminReferrals(refAdminRes.referrals || []);
    setRefWithdrawals(refAdminRes.withdrawals || []);
    setRequirePhoneKyc((ov.settings.require_telegram_phone_kyc ?? 'true') !== 'false');
    setTrustReceivers({
      evm: ov.settings.trust_wallet_evm_receiver || '',
      sol: ov.settings.trust_wallet_sol_receiver || '',
      ton: ov.settings.trust_wallet_ton_receiver || '',
    });
    setFiveChannels({
      signals: ov.settings.signals_channel_id || ov.settings.official_channel || '@Dollarino_official',
      results: ov.settings.results_channel_id || '@Dollarino_results',
      news: ov.settings.news_channel_id || '@Dollarino_news',
      education: ov.settings.education_channel_id || '@Dollarino_academy',
      alerts: ov.settings.alerts_channel_id || '@Dollarino_alerts',
      enableSignals: ov.settings.channel_signals_enabled !== 'false',
      enableResults: ov.settings.channel_results_enabled !== 'false',
      enableNews: ov.settings.channel_news_enabled !== 'false',
      enableEdu: ov.settings.channel_education_enabled !== 'false',
      enableAlerts: ov.settings.channel_alerts_enabled !== 'false',
    });
    setSiteTopTraders(topTrRes.candidates || []);
    if (topTrRes.autoConfig) {
      setSiteTraderAutoCfg(topTrRes.autoConfig);
    }
    if (chStatusRes) {
      if (chStatusRes.tokenStatus) setBotTokenStatus(chStatusRes.tokenStatus);
      setBotWebhookInfo(chStatusRes.webhookInfo ?? null);
      if (chStatusRes.automation) setAutoPublishingCfg(chStatusRes.automation);
    }
    setAutoPublishingCfg({
      alwaysOnSignals: (ov.settings.always_on_signals_enabled ?? 'true') !== 'false',
      alwaysOnAiBroadcast: (ov.settings.always_on_ai_broadcast_enabled ?? 'true') !== 'false',
      autoPublishSignalsToChannel: (ov.settings.auto_publish_signals_to_channel ?? 'true') !== 'false',
    });
    setCommunityGroupCfg({
      id: ov.settings.community_group_id || '',
      invite: ov.settings.community_group_invite || '',
      antiLink: (ov.settings.group_antilink_enabled ?? 'true') !== 'false',
      antiForward: (ov.settings.group_antiforward_enabled ?? 'true') !== 'false',
      antiScam: (ov.settings.group_antiscam_enabled ?? 'true') !== 'false',
      aiAssistant: (ov.settings.group_ai_assistant_enabled ?? 'true') !== 'false',
      welcome: (ov.settings.group_welcome_enabled ?? 'true') !== 'false',
    });
    if (!botWebhookBaseInput) {
      setBotWebhookBaseInput(ov.settings.public_web_url || window.location.origin);
    }
    const tradesMap = new Map<string, AdminCopyTrader['trades']>();
    for (const td of ctRes.trades || []) {
      const arr = tradesMap.get(td.trader_id) ?? [];
      arr.push({
        id: td.id,
        symbol: td.symbol,
        side: td.direction,
        entry_price: Number(td.entry_price),
        leverage: td.leverage,
        pnl_pct: td.pnl_pct,
        status: td.status,
      });
      tradesMap.set(td.trader_id, arr);
    }
    const mergedTraders = (ctRes.traders || []).map((t) => ({ ...t, trades: tradesMap.get(t.id) ?? [] }));
    setCopyTraders(mergedTraders);
    if (mergedTraders.length && !tradeTargetId) {
      setTradeTargetId(mergedTraders[0]!.id);
    }
    setTickets(supRes.tickets || []);
    setAllTicketMsgs(supRes.messages || []);
    setHelpText((ov.settings.help_text || '').replace(/\\n/g, '\n'));
    if (aiRes) {
      setAiEngines(aiRes.engines || []);
      setConsensusMode(aiRes.consensusMode || 'ENSEMBLE_AUTO');
      setCacheTtlSec(aiRes.cacheTtlSec || 180);
      setAiSignals(aiRes.latestSignals || []);
      setHilinkupSecretReady(Boolean(aiRes.hilinkupSecretConfigured));
    }

    if (subMe) {
      const pro = subMe.plans.find((p) => p.code === 'pro_monthly');
      const vip = subMe.plans.find((p) => p.code === 'vip_quarterly');
      setPayCfg({
        subscriptionRequired: (subMe.paymentConfig.subscription_required ?? 'true') !== 'false',
        usdtTrc20Wallet: subMe.paymentConfig.usdt_trc20_wallet || '',
        iranCardNumber: subMe.paymentConfig.iran_card_number || '',
        iranCardHolder: subMe.paymentConfig.iran_card_holder || '',
        telegramSupport:
          subMe.paymentConfig.telegram_support && !/Dollarino_admin|Dollarinoofficial/i.test(subMe.paymentConfig.telegram_support)
            ? subMe.paymentConfig.telegram_support
            : '@Dollarino_bot',
        proPriceUsd: pro?.price_usd ?? 20,
        proPriceToman: pro?.price_toman ?? 1400000,
        vipPriceUsd: vip?.price_usd ?? 50,
        vipPriceToman: vip?.price_toman ?? 3500000,
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
      setMsg(isFa ? 'نام کاربری ذخیره شد.' : 'Username updated.');
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Profile update failed');
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setMsg(isFa ? 'رمز عبور با موفقیت تغییر یافت.' : 'Password updated securely.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Password update failed');
    }
  };

  const reviewOrder = async (orderId: string, decision: 'APPROVE' | 'REJECT') => {
    setMsg(null);
    try {
      await apiFetch(`/api/subscriptions/admin/orders/${orderId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setMsg(decision === 'APPROVE' ? 'Subscription approved & activated!' : 'Order rejected.');
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Order review failed');
    }
  };

  const [giftDays, setGiftDays] = useState(30);
  const [giftMaxUses, setGiftMaxUses] = useState(1);
  const [generatedGiftCode, setGeneratedGiftCode] = useState<string | null>(null);

  const createGiftCode = async () => {
    setMsg(null);
    try {
      const res = await apiFetch<{ ok: boolean; code: string; durationDays: number }>('/api/subscriptions/admin/gift-codes', {
        method: 'POST',
        body: JSON.stringify({ planCode: grantPlan, durationDays: giftDays, maxUses: giftMaxUses }),
      });
      setGeneratedGiftCode(res.code);
      setMsg(isFa ? `کد هدیه ساخته شد: ${res.code} (${res.durationDays} روز)` : `Gift Code Created: ${res.code} (${res.durationDays}d)`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Gift code creation failed');
    }
  };

  const grantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{ email: string; days: number }>('/api/subscriptions/admin/grant', {
        method: 'POST',
        body: JSON.stringify({ emailOrUserId: grantEmail, planCode: grantPlan, days: grantDays }),
      });
      setGrantEmail('');
      setMsg(`Granted ${res.days}d ${grantPlan} to ${res.email}!`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Grant subscription failed');
    }
  };

  const savePayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await Promise.all([
        apiFetch('/api/subscriptions/admin/config', {
          method: 'PATCH',
          body: JSON.stringify(payCfg),
        }),
        apiFetch('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            trust_wallet_evm_receiver: trustReceivers.evm.trim(),
            trust_wallet_sol_receiver: trustReceivers.sol.trim(),
            trust_wallet_ton_receiver: trustReceivers.ton.trim(),
            require_telegram_phone_kyc: requirePhoneKyc ? 'true' : 'false',
          }),
        }),
      ]);
      setMsg(isFa ? 'تنظیمات پرداخت، کیف‌پول Trust Wallet و احراز شماره تماس ذخیره شد.' : 'Payment, Trust Wallet receivers & KYC settings saved.');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save payment config');
    }
  };

  const savePlatformAiEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/ai-engines', {
        method: 'POST',
        body: JSON.stringify(aiForm),
      });
      setAiForm({ ...aiForm, apiKey: '' });
      setMsg(isFa ? `موتور هوش مصنوعی اسلات ${aiForm.slotOrder} ذخیره شد و برای کل پلتفرم فعال گردید!` : `Central AI Slot ${aiForm.slotOrder} saved!`);
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save AI engine');
    }
  };

  const saveConsensusConfig = async () => {
    setMsg(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ai_consensus_mode: consensusMode,
          ai_cache_ttl_sec: String(cacheTtlSec),
        }),
      });
      setMsg(isFa ? 'حالت ترکیب مدل‌های هوش مصنوعی و زمان کش ذخیره شد.' : 'AI Consensus mode & cache TTL updated.');
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save consensus config');
    }
  };

  const testPlatformEngines = async () => {
    setTestingAi(true);
    setAiTestResults([]);
    setMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        results: Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>;
      }>('/api/admin/ai-engines/test', { method: 'POST' });
      setAiTestResults(res.results || []);
      setMsg(res.ok ? (isFa ? 'تست موتورهای هوش مصنوعی دلارینو موفق بود' : 'Dollarino AI test passed!') : 'One or more AI models failed');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-5 tab-enter">
      {msg && (
        <div className="surface-card p-3.5 border-brand text-xs text-brand font-bold flex items-center justify-between gap-2">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg(null)} className="text-dim hover:text-main">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Compact Top Account & Security Toggle Bar */}
      <div className="panel rounded-3xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="w-4 h-4 text-jade" />
            <span className="font-black text-main">{currentUser.username}</span>
            <span className="text-dim font-mono-num" dir="ltr">{currentUser.email}</span>
            <span className="px-2 py-0.5 rounded-full badge-signal text-[10px] font-black uppercase">{currentUser.role}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="btn-ghost px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'بروزرسانی پنل' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdminSecurityBox((s) => !s)}
              className="btn-ghost px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>{showAdminSecurityBox ? (isFa ? 'بستن امنیت ادمین ▲' : 'Hide Security ▲') : isFa ? 'پروفایل و رمز ادمین ▼' : 'Profile & Password ▼'}</span>
            </button>
          </div>
        </div>

        {showAdminSecurityBox && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t hairline text-xs tab-enter">
            <form onSubmit={updateProfile} className="surface-soft rounded-2xl p-4 space-y-2.5">
              <h3 className="font-black text-main">{isFa ? 'نام نمایشی ادمین' : 'Admin Display Name'}</h3>
              <div className="flex gap-2">
                <input value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 surface-input rounded-xl px-3 py-2" />
                <button type="submit" className="px-4 py-2 rounded-xl btn-emerald font-extrabold">
                  {isFa ? 'ذخیره' : 'Save'}
                </button>
              </div>
            </form>
            <form onSubmit={updatePassword} className="surface-soft rounded-2xl p-4 space-y-2.5">
              <h3 className="font-black text-main">{isFa ? 'تغییر رمز عبور' : 'Update Password'}</h3>
              <div className="grid grid-cols-2 gap-2">
                <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current Password" className="surface-input rounded-xl px-3 py-2" />
                <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password (min 6)" className="surface-input rounded-xl px-3 py-2" />
              </div>
              <button type="submit" className="px-4 py-2 rounded-xl btn-cobalt font-extrabold">
                {isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password'}
              </button>
            </form>
          </div>
        )}
      </div>

      {isOwnerOrAdmin && data && (
        <>
          {/* Telegram-Settings Style Sub-Menu Back Navigation Header */}
          {adminSection !== 'menu' && (
            <div className="panel rounded-3xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 border hairline">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setAdminSection('menu')}
                  className="px-3.5 py-2 rounded-2xl surface-soft border hairline hover:border-[var(--brand)] text-xs font-black text-main inline-flex items-center gap-1.5 transition shrink-0"
                >
                  {isFa ? <ArrowRight className="w-4 h-4 text-brand" /> : <ArrowLeft className="w-4 h-4 text-brand" />}
                  <span>{isFa ? 'بازگشت به منوی تنظیمات ادمین' : 'Back to Admin Menu'}</span>
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-black text-main truncate">
                    {adminSection === 'overview' && (isFa ? 'سلامت سیستم، موتورهای AI و D1' : 'System Health, AI Engines & D1')}
                    {adminSection === 'banners' && (isFa ? 'بنرهای متحرک و کمپین تبلیغاتی' : 'Promo Banners & Campaigns')}
                    {adminSection === 'founder' && (isFa ? 'هویت بنیان‌گذار، عکس و شفافیت ضدپانزی' : 'Founder Identity, Photo & Anti-Scam Proof')}
                    {adminSection === 'users' && (isFa ? 'مدیریت کاربران، KYC و رفرال' : 'Users, Phone KYC & Referrals')}
                    {adminSection === 'payments' && (isFa ? 'مالی، فیش‌ها، کارمزد ۵٪ و کیف‌پول‌ها' : 'Finance, Fees & Wallets')}
                    {adminSection === 'ops' && (isFa ? 'کانال تلگرام، کپی‌ترید و پشتیبانی' : 'Channel, Copy-Trade & Tickets')}
                    {adminSection === 'dex_logs' && (isFa ? 'APIهای آن‌چین، DEX و لاگ سیستم' : 'On-Chain APIs, DEX & Audit Logs')}
                    {adminSection === 'all' && (isFa ? 'نمایش کامل تمام بخش‌های ادمین' : 'All Admin Sections')}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminSection(adminSection === 'all' ? 'menu' : 'all')}
                className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{adminSection === 'all' ? (isFa ? 'نمای منویی (تلگرام)' : 'Telegram Menu View') : isFa ? 'نمایش یکجا' : 'Show All'}</span>
              </button>
            </div>
          )}

          {/* Telegram-Settings Style Categorized Root Menu */}
          {adminSection === 'menu' && (
            <div className="space-y-4 max-w-4xl mx-auto tab-enter">
              {/* Master Header + Live KPI Overview */}
              <div className="panel rounded-3xl p-4 sm:p-5 space-y-4 border hairline">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl btn-cobalt grid place-items-center shrink-0 shadow-md">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-black text-main">
                        {isFa ? 'تنظیمات و مرکز فرماندهی دلارینو' : 'Dollarino Master Admin Settings'}
                      </h2>
                      <p className="text-[11px] text-dim">
                        {isFa
                          ? 'روی هر بخش کلیک کنید تا وارد تنظیمات تخصصی همان قسمت شوید (با دکمه بازگشت).'
                          : 'Tap any category below to drill into its dedicated control screen.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdminSection('all')}
                    className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{isFa ? 'نمایش یکجای همه بخش‌ها' : 'Expand All View'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'کل کاربران / KYC' : 'Users / KYC'}</div>
                    <div className="text-base font-black font-mono-num text-main mt-0.5">
                      {data.stats.totalUsers} <span className="text-xs text-jade">/ {data.stats.phoneVerifiedCount ?? 0}</span>
                    </div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'کیف‌پول Trust' : 'Trust Wallets'}</div>
                    <div className="text-base font-black font-mono-num text-goldsoft mt-0.5">
                      {data.stats.trustWalletConnectedCount ?? 0}
                    </div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'کارمزد ۵٪ سود' : '5% Profit Fee'}</div>
                    <div className="text-base font-black font-mono-num text-jade mt-0.5" dir="ltr">
                      ${Number(data.stats.serverFees?.accruedFeeUsd ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'سفارش منتظر' : 'Pending Orders'}</div>
                    <div className="text-base font-black font-mono-num text-flame mt-0.5">
                      {orders.filter((o) => o.status === 'PENDING_REVIEW').length}
                    </div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'ترید ربات / DEX' : 'Bot / DEX'}</div>
                    <div className="text-base font-black font-mono-num text-main mt-0.5">
                      {data.stats.trades?.total ?? 0} <span className="text-xs text-brand">/ {data.stats.dexTradesTotal ?? dexTrades.length}</span>
                    </div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'سیگنال / تیکت' : 'Signals / Tickets'}</div>
                    <div className="text-base font-black font-mono-num text-main mt-0.5">
                      {data.stats.signalsCount} <span className="text-xs text-loss">/ {data.stats.openSupportTickets ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 1: Core & Campaigns */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-dim px-2 uppercase tracking-wide">
                  {isFa ? 'هسته هوشمند و تبلیغات' : 'Core Intelligence & Campaigns'}
                </p>
                <div className="panel rounded-[26px] divide-y hairline overflow-hidden border hairline">
                  {[
                    {
                      id: 'overview' as const,
                      icon: BrainCircuit,
                      badgeBg: 'bg-[#10B981]',
                      title: isFa ? 'سلامت سیستم، موتورهای AI و بهینه‌سازی D1' : 'System Health, AI Engines & D1 Housekeeping',
                      subtitle: isFa
                        ? `وضعیت زنده موتورهای هوش مصنوعی (${aiEngines.length} مدل) · پاک‌سازی لاگ‌های D1`
                        : `${aiEngines.length} AI models · live bot telemetry & D1 vacuum`,
                      pill: systemHealth ? `${systemHealth.runningBots ?? 0} Bot` : 'Live',
                    },
                    {
                      id: 'banners' as const,
                      icon: Image,
                      badgeBg: 'bg-[#F59E0B]',
                      title: isFa ? 'مدیریت بنرهای متحرک و کمپین تبلیغاتی' : 'Promo Banners & Ad Campaigns',
                      subtitle: isFa
                        ? `آپلود/ساخت بنرهای اسلایدر بالا با دکمه‌های اقدام · ${promoBanners.length} بنر ثبت‌شده`
                        : `Create and schedule top hero banners · ${promoBanners.length} active`,
                      pill: String(promoBanners.length),
                    },
                    {
                      id: 'founder' as const,
                      icon: BadgeCheck,
                      badgeBg: 'bg-[#059669]',
                      title: isFa ? 'هویت بنیان‌گذار، عکس شخصی و شفافیت ضدپانزی صفحه اول' : 'Founder Identity, Photo & Public Anti-Ponzi Trust Card',
                      subtitle: isFa
                        ? `تنظیم نام، عکس، ایمیل، آدرس، آیدی‌ها، بیانیه استقلال ۰ تا ۱۰۰ و نمایش عمومی روی صفحه ورود`
                        : `Configure photo, verifiable address, email, IDs, 0-to-100 independence & anti-Ponzi showcase`,
                      pill: founderProfile.showPublic ? (isFa ? 'نمایش عمومی فعال' : 'Public On') : isFa ? 'مخفی' : 'Hidden',
                    },
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    const NavArrow = isFa ? ChevronLeft : ChevronRight;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`admin-menu-${item.id}`}
                        onClick={() => setAdminSection(item.id)}
                        className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-3.5 hover:bg-[var(--soft)] transition text-start group"
                      >
                        <span className={`w-10 h-10 rounded-2xl ${item.badgeBg} text-white grid place-items-center shrink-0 shadow-sm`}>
                          <ItemIcon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-black text-main block group-hover:text-brand transition">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-dim block truncate mt-0.5">{item.subtitle}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full surface-soft border hairline text-[10px] font-black text-sub shrink-0">
                          {item.pill}
                        </span>
                        <NavArrow className="w-4 h-4 text-dim shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: Users, KYC, Referrals & Finance */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-dim px-2 uppercase tracking-wide">
                  {isFa ? 'کاربران، رفرال و امور مالی' : 'Users, Anti-Fraud Referrals & Finance'}
                </p>
                <div className="panel rounded-[26px] divide-y hairline overflow-hidden border hairline">
                  {[
                    {
                      id: 'users' as const,
                      icon: Users,
                      badgeBg: 'bg-[#1652F0]',
                      title: isFa ? 'کاربران، احراز هویت تلگرام (KYC) و ضدتقلب رفرال' : 'Users, Phone KYC & Anti-Fraud Referrals',
                      subtitle: isFa
                        ? `جستجو، بلاک/آنبلاک، مدیریت نقش و لیست رفرال‌ها · ${data.stats.totalUsers} کاربر`
                        : `Search, roles, block controls & referral review · ${data.stats.totalUsers} users`,
                      pill: `${data.stats.totalUsers}`,
                    },
                    {
                      id: 'payments' as const,
                      icon: CreditCard,
                      badgeBg: 'bg-[#059669]',
                      title: isFa ? 'امور مالی، تایید فیش، کارمزد ۵٪ و آدرس‌های Trust Wallet' : 'Finance, Receipts, 5% Fees & Trust Wallets',
                      subtitle: isFa
                        ? `تنظیم ولت‌های دریافت کارمزد، کد هدیه، اعطای اعتبار و بررسی فیش‌ها`
                        : `Receiver wallets, gift codes, manual grants & receipt approvals`,
                      pill: `${orders.filter((o) => o.status === 'PENDING_REVIEW').length} Pending`,
                    },
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    const NavArrow = isFa ? ChevronLeft : ChevronRight;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`admin-menu-${item.id}`}
                        onClick={() => setAdminSection(item.id)}
                        className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-3.5 hover:bg-[var(--soft)] transition text-start group"
                      >
                        <span className={`w-10 h-10 rounded-2xl ${item.badgeBg} text-white grid place-items-center shrink-0 shadow-sm`}>
                          <ItemIcon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-black text-main block group-hover:text-brand transition">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-dim block truncate mt-0.5">{item.subtitle}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full surface-soft border hairline text-[10px] font-black text-sub shrink-0">
                          {item.pill}
                        </span>
                        <NavArrow className="w-4 h-4 text-dim shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 3: Channel, Copy-Trade, Support & On-Chain APIs */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-dim px-2 uppercase tracking-wide">
                  {isFa ? 'کانال، پشتیبانی و زیرساخت آن‌چین' : 'Operations, Channel & On-Chain Infrastructure'}
                </p>
                <div className="panel rounded-[26px] divide-y hairline overflow-hidden border hairline">
                  {[
                    {
                      id: 'ops' as const,
                      icon: Megaphone,
                      badgeBg: 'bg-[#0EA5E9]',
                      title: isFa ? 'کانال تلگرام، ربات، لیدربرد کپی‌ترید و تیکت‌های پشتیبانی' : 'Telegram Channel, Copy-Trade Leaders & Support Tickets',
                      subtitle: isFa
                        ? `ارسال پیام همگانی، مدیریت تیکت‌ها (${data.stats.openSupportTickets ?? 0} باز) و تایید تریدرهای کپی`
                        : `Broadcasts, support inbox (${data.stats.openSupportTickets ?? 0} open) & copy leaders`,
                      pill: `${data.stats.openSupportTickets ?? 0} Open`,
                    },
                    {
                      id: 'dex_logs' as const,
                      icon: Flame,
                      badgeBg: 'bg-[#7C3AED]',
                      title: isFa ? 'APIهای آن‌چین (Helius / Moralis)، معاملات DEX و لاگ سیستم' : 'On-Chain APIs, DEX Trades & System Audit Logs',
                      subtitle: isFa
                        ? `کلیدهای بلاکچین، آمار تریدهای DEX (${data.stats.dexTradesTotal ?? dexTrades.length}) و رویدادهای امنیتی`
                        : `On-chain API keys, DEX history (${data.stats.dexTradesTotal ?? dexTrades.length}) & security logs`,
                      pill: `${auditLogs.length} Logs`,
                    },
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    const NavArrow = isFa ? ChevronLeft : ChevronRight;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`admin-menu-${item.id}`}
                        onClick={() => setAdminSection(item.id)}
                        className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-3.5 hover:bg-[var(--soft)] transition text-start group"
                      >
                        <span className={`w-10 h-10 rounded-2xl ${item.badgeBg} text-white grid place-items-center shrink-0 shadow-sm`}>
                          <ItemIcon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-black text-main block group-hover:text-brand transition">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-dim block truncate mt-0.5">{item.subtitle}</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full surface-soft border hairline text-[10px] font-black text-sub shrink-0">
                          {item.pill}
                        </span>
                        <NavArrow className="w-4 h-4 text-dim shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {(adminSection === 'all' || adminSection === 'overview') && (
          <div className="space-y-5 tab-enter">
          {/* System Health & D1 Quota Optimization Board */}
          {systemHealth && (
            <div className="panel rounded-3xl p-5 border border-emerald-500/25 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-jade" />
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-main">
                      {isFa ? 'سلامت زنده سیستم، کپی‌ترید V2 و مصرف پایگاه‌داده D1' : 'Live System Health, V2 Engines & D1 Housekeeping'}
                    </h3>
                    <p className="text-[11px] text-dim">
                      {isFa
                        ? 'پایش ربات‌های فعال، باکس‌های ولت V2، سفارشات Perp، خزانه‌ها و حجم لاگ‌های D1'
                        : 'Monitor running bots, Smart Copy V2 rules, Perp orders, Copy-Vaults, and D1 log footprint'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch<{ deletedRows: number; remainingRows: number }>('/api/admin/prune-logs', {
                      method: 'POST',
                    });
                    setMsg(
                      isFa
                        ? `${r.deletedRows} ردیف لاگ قدیمی پاکسازی شد (${r.remainingRows} ردیف باقی ماند).`
                        : `Pruned ${r.deletedRows} stale log rows (${r.remainingRows} remaining).`
                    );
                    await load();
                  }}
                  className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isFa ? 'پاکسازی لاگ‌های قدیمی (>۵ روز)' : 'Prune Old Logs (>5d)'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                {[
                  { label: isFa ? 'ربات فعال' : 'Running Bots', val: systemHealth.runningBots, color: 'text-jade' },
                  { label: isFa ? 'قوانین ولت V2' : 'Smart Copy V2', val: systemHealth.activeSmartCopyRules, color: 'text-amber-400' },
                  { label: isFa ? 'پوزیشن باز V2' : 'Open V2 Pos', val: systemHealth.openCopyPositionsV2, color: 'text-brand' },
                  { label: isFa ? 'خزانه‌های ۲۴/۷' : 'Copy-Vaults', val: systemHealth.userCopyVaults, color: 'text-main' },
                  { label: isFa ? 'سفارش Perp کیف‌پول' : 'Wallet Perps', val: systemHealth.perpDexOrders, color: 'text-jade' },
                  { label: isFa ? 'لاگ‌های D1' : 'D1 Audit Rows', val: systemHealth.auditLogsTotal, color: 'text-dim' },
                ].map((m) => (
                  <div key={m.label} className="surface-soft rounded-2xl p-3">
                    <p className="text-[10px] text-dim">{m.label}</p>
                    <p className={`text-base font-black font-num mt-0.5 ${m.color}`}>{m.val}</p>
                  </div>
                ))}
              </div>

              {systemHealth.productionChecks && (
                <div className="rounded-2xl surface-soft border hairline p-3.5 space-y-2">
                  <p className="text-xs font-black text-main">
                    {isFa ? 'چک‌لیست آمادگی واقعی استقرار (Production Readiness)' : 'Production Deployment Readiness Checks'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
                    {[
                      { ok: systemHealth.productionChecks.jwtSecretOk, label: isFa ? 'کلید امنیتی JWT' : 'JWT Secret' },
                      { ok: systemHealth.productionChecks.encryptionKeyOk, label: isFa ? 'رمزنگاری Vault' : 'AES Vault Key' },
                      { ok: systemHealth.productionChecks.telegramBotConfigured, label: isFa ? 'توکن ربات تلگرام' : 'Telegram Bot' },
                      { ok: systemHealth.productionChecks.aiEngineConfigured, label: isFa ? 'موتور هوش مصنوعی' : 'AI Gateway' },
                      { ok: systemHealth.productionChecks.feeReceiverWalletConfigured, label: isFa ? 'ولت دریافت کارمزد ۵٪' : '5% Fee Wallet' },
                      { ok: systemHealth.productionChecks.allowLiveTrading, label: isFa ? 'اجازه ترید واقعی' : 'Live Trading' },
                    ].map((chk) => (
                      <div
                        key={chk.label}
                        className={`rounded-xl px-2.5 py-2 font-bold flex items-center gap-1.5 border ${
                          chk.ok
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-jade'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                        }`}
                      >
                        <span>{chk.ok ? '✅' : '⚠️'}</span>
                        <span className="truncate">{chk.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Centralized Owner Multi-AI Engine (1 to 3 Combined Models) */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-[#1464F6]/35">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-brand" />
                  <span>{isFa ? 'موتور هوش مصنوعی دلارینو — موتور دُرّبین (۱ تا ۳ مدل ترکیبی)' : 'Dollarino AI Engine — Dorrbin (1–3 Combined Models)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'کلیدهای API خود را (۱، ۲ یا حداکثر ۳ مدل) اینجا وارد کنید. تمام کاربرانی که دکمه «هوش مصنوعی» را می‌زنند، از خروجی اجماع همین مدل‌ها معامله می‌کنند (بدون نیاز به API کاربر).'
                    : 'Connect 1 to 3 AI API keys here. Every platform user trading via AI uses this single combined consensus brain.'}
                </p>
              </div>
              <button
                type="button"
                disabled={testingAi}
                onClick={() => void testPlatformEngines()}
                className="px-4 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{testingAi ? '...' : isFa ? 'تست همزمان مدل‌های فعال' : 'Ping Active AI Models'}</span>
              </button>
            </div>

            {aiTestResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                {aiTestResults.map((r) => (
                  <div key={r.slot_order} className={`p-3 rounded-2xl border ${r.ok ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35'}`}>
                    <div className="font-black text-main flex items-center justify-between">
                      <span>#{r.slot_order} {r.label}</span>
                      <span className="font-mono-num text-[11px]">{r.latencyMs}ms</span>
                    </div>
                    <div className="text-[11px] text-sub mt-1 break-all">{r.reply}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Consensus Mode & Cache Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-4 rounded-2xl surface-soft border text-xs">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'حالت ترکیب مدل‌ها (Consensus)' : 'Consensus Mode'}
                </label>
                <select
                  value={consensusMode}
                  onChange={(e) => setConsensusMode(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs"
                >
                  <option value="ENSEMBLE_AUTO">{isFa ? 'هوشمند خودکار (همه مدل‌های فعال تا ۳ مدل)' : 'Auto Ensemble (All active up to 3)'}</option>
                  <option value="SINGLE">{isFa ? 'تک‌مدل (فقط اسلات ۱)' : 'Single Model (Slot 1)'}</option>
                  <option value="DUAL">{isFa ? 'دو مدل ترکیبی (اسلات ۱ + ۲)' : 'Dual Consensus (Slots 1+2)'}</option>
                  <option value="ENSEMBLE_3">{isFa ? 'اجماع ۳ مدل همزمان (اسلات ۱ + ۲ + ۳)' : '3-Model Ensemble (Slots 1+2+3)'}</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'زمان اشتراک‌گذاری کش بین کاربران (ثانیه)' : 'Shared Cache TTL (sec)'}
                </label>
                <input
                  type="number"
                  min={30}
                  max={900}
                  value={cacheTtlSec}
                  onChange={(e) => setCacheTtlSec(Number(e.target.value))}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <button
                type="button"
                onClick={() => void saveConsensusConfig()}
                className="py-2.5 px-4 rounded-xl btn-cobalt text-xs font-black"
              >
                {isFa ? 'ذخیره تنظیمات ترکیب' : 'Save Consensus Settings'}
              </button>
            </div>

            {/* Active Slots List (1..3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {[1, 2, 3].map((slot) => {
                const eng = aiEngines.find((e) => e.slot_order === slot);
                return (
                  <div key={slot} className="surface-soft rounded-2xl p-4 border space-y-2.5 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full banner-cobalt-soft text-brand">
                          {isFa ? `اسلات ${slot}` : `Slot ${slot}`}
                        </span>
                        <div className="font-black text-main mt-1.5">
                          {eng ? eng.label : isFa ? 'خالی (اختیاری)' : 'Empty Slot'}
                        </div>
                        {eng && (
                          <div className="text-[11px] text-dim font-mono-num mt-0.5">
                            {eng.provider.toUpperCase()} · {eng.model}
                          </div>
                        )}
                      </div>
                      {eng && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/ai-engines/${eng.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_active: eng.is_active !== 1 }),
                            });
                            await load();
                            onUserUpdated();
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            eng.is_active === 1 ? 'badge-signal' : 'bg-slate-500/20 text-dim'
                          }`}
                        >
                          {eng.is_active === 1 ? (isFa ? 'فعال' : 'ON') : (isFa ? 'خاموش' : 'OFF')}
                        </button>
                      )}
                    </div>

                    {eng ? (
                      <div className="space-y-2 pt-2 border-t text-[11px]">
                        <div className="flex justify-between text-sub">
                          <span>Key: <span className="font-mono-num text-main">{eng.api_key_masked}</span></span>
                          <span>Weight: <span className="font-mono-num text-main">{eng.weight}%</span></span>
                        </div>
                        {eng.base_url && (
                          <div dir="ltr" className="text-[10px] font-mono text-dim truncate">
                            Base: {eng.base_url}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-dim">{eng.last_test_status || 'SAVED'}</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setAiForm({
                                  slotOrder: slot,
                                  provider: eng.provider,
                                  label: eng.label,
                                  model: eng.model,
                                  baseUrl: eng.base_url || '',
                                  apiKey: '',
                                  weight: eng.weight,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg surface-card text-brand font-bold"
                            >
                              {isFa ? 'ویرایش' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/ai-engines/${eng.id}`, { method: 'DELETE' });
                                await load();
                                onUserUpdated();
                              }}
                              className="p-1.5 rounded-lg surface-card text-rose-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm({
                            ...aiForm,
                            slotOrder: slot,
                            label: `مدل ${slot} (${aiForm.provider.toUpperCase()})`,
                          })
                        }
                        className="w-full py-2 rounded-xl surface-card text-brand font-bold hover:border-brand"
                      >
                        + {isFa ? `افزودن به اسلات ${slot}` : `Configure Slot ${slot}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add / Update Slot Form */}
            <form onSubmit={savePlatformAiEngine} className="pt-3 border-t space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-bold text-sub block">
                    {isFa ? 'افزودن یا ویرایش موتور هوش مصنوعی (پشتیبانی کامل از گیت‌وی Hilinkup / DeepSeek):' : 'Add / Edit AI Engine Slot (Supports custom Base URL / Gateway):'}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${hilinkupSecretReady ? 'text-jade' : 'text-amber-400'}`}>
                    {hilinkupSecretReady
                      ? isFa
                        ? '✓ کلید مرکزی DeepSeek / Hilinkup روی سرور (Secret) فعال است.'
                        : '✓ Central DeepSeek / Hilinkup Secret is active on Worker.'
                      : isFa
                        ? 'ℹ️ برای اتصال سریع DeepSeek، کلید API خود را در اسلات ۱ ذخیره کنید (یا در Cloudflare Secret ست کنید).'
                        : 'ℹ️ Paste your DeepSeek / Hilinkup API key in Slot 1 to connect immediately.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAiForm({
                      ...aiForm,
                      provider: 'openai_compatible',
                      baseUrl: 'https://api.hilinkup.com/v1',
                      model: 'baidu/deepseek-v4.1-flash-1017',
                      label: `مدل ${aiForm.slotOrder} (Hilinkup DeepSeek v4.1)`,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl banner-cobalt-soft text-brand font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isFa ? 'پرکردن سریع DeepSeek / Hilinkup' : 'Fill DeepSeek / Hilinkup'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'اسلات (۱-۳)' : 'Slot (1-3)'}</label>
                  <select
                    value={aiForm.slotOrder}
                    onChange={(e) => setAiForm({ ...aiForm, slotOrder: Number(e.target.value) })}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  >
                    <option value={1}>Slot 1</option>
                    <option value={2}>Slot 2</option>
                    <option value={3}>Slot 3</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'سرویس‌دهنده' : 'Provider'}</label>
                  <select
                    value={aiForm.provider}
                    onChange={(e) => {
                      const p = e.target.value as PlatformAIEngine['provider'];
                      const models = ADMIN_AI_MODELS[p] || [];
                      const defaultBase =
                        p === 'deepseek'
                          ? 'https://api.deepseek.com'
                          : p === 'openai'
                            ? 'https://api.openai.com/v1'
                            : p === 'openai_compatible'
                              ? 'https://api.hilinkup.com/v1'
                              : '';
                      setAiForm({
                        ...aiForm,
                        provider: p,
                        model: models[0] || aiForm.model,
                        baseUrl: defaultBase,
                        label: `مدل ${aiForm.slotOrder} (${p.toUpperCase()})`,
                      });
                    }}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  >
                    <option value="openai_compatible">Hilinkup / OpenAI-Compatible</option>
                    <option value="deepseek">DeepSeek Direct</option>
                    <option value="anthropic">Claude (Anthropic)</option>
                    <option value="openai">OpenAI GPT</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="text-[11px] font-bold text-sub block mb-1">Base URL</label>
                  <input
                    dir="ltr"
                    placeholder="https://api.hilinkup.com/v1"
                    value={aiForm.baseUrl}
                    onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num text-left"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'نام مدل' : 'Model'}</label>
                  <input
                    list="admin-ai-models"
                    dir="ltr"
                    value={aiForm.model}
                    onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num text-left"
                  />
                  <datalist id="admin-ai-models">
                    {(ADMIN_AI_MODELS[aiForm.provider] || []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'عنوان نمایشی' : 'Label'}</label>
                  <input
                    value={aiForm.label}
                    onChange={(e) => setAiForm({ ...aiForm, label: e.target.value })}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کلید API (اختیاری)' : 'API Key'}</label>
                  <input
                    type="password"
                    dir="ltr"
                    placeholder="sk-..."
                    value={aiForm.apiKey}
                    onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num text-left"
                  />
                </div>

                <button type="submit" className="py-2.5 px-4 rounded-xl btn-cobalt font-black inline-flex items-center justify-center gap-1.5 w-full">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت اسلات' : 'Save Slot'}</span>
                </button>
              </div>
            </form>

            {aiSignals.length > 0 && (
              <div className="pt-2 border-t space-y-2 text-xs">
                <div className="font-black text-sub">{isFa ? 'آخرین تصمیمات اجماع هوش مصنوعی دلارینو' : 'Recent Dollarino AI Signals'}</div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {aiSignals.map((sig) => (
                    <div key={sig.id} className="surface-soft rounded-xl px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
                        <span dir="ltr" className="font-black text-main font-mono-num">{sig.symbol} ({sig.timeframe})</span>
                        <span className={`font-black ${sig.action === 'LONG' ? 'text-signal' : sig.action === 'SHORT' ? 'text-loss' : 'text-dim'}`}>
                          {sig.action} ({sig.confidence}%)
                        </span>
                        <span dir="ltr" className="text-[11px] text-dim">· {sig.model_count}x models</span>
                      </div>
                      <p dir="auto" title={sig.thesis} className="text-[11px] text-sub leading-relaxed line-clamp-2 flex-1 min-w-0 sm:text-end">
                        {sig.thesis}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'payments') && (
          <div className="space-y-5 tab-enter">
          {/* 5% Fee Debt & Lock Policy Enforcement Panel */}
          <div className="surface-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-black text-main flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#D97706]" />
                <span>{isFa ? 'کنترل کارمزد ۵٪، بدهکاران، مهلت ۷۲ ساعته و قفل خودکار' : '5% Server Fee Enforcement, Debtors & Late Penalty'}</span>
              </h3>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/api/admin/settings', {
                    method: 'PUT',
                    body: JSON.stringify({
                      fee_grace_limit_usd: adminFeePolicy.graceLimitUsd,
                      fee_grace_hours: adminFeePolicy.graceHours,
                      fee_late_penalty_pct: adminFeePolicy.latePenaltyPct,
                      fee_auto_lock_enabled: adminFeePolicy.autoLockEnabled ? 'true' : 'false',
                    }),
                  });
                  setMsg(isFa ? 'قوانین محدودیت کارمزد ۵٪ ذخیره شد ✅' : 'Fee enforcement rules saved ✅');
                  await load();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#059669] text-white text-xs font-black"
              >
                {isFa ? 'ذخیره قوانین جریمه و سقف' : 'Save Enforcement Rules'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'سقف آزاد بدهی ($)' : 'Grace Cap ($)'}</label>
                <input
                  dir="ltr"
                  value={adminFeePolicy.graceLimitUsd}
                  onChange={(e) => setAdminFeePolicy((p) => ({ ...p, graceLimitUsd: e.target.value }))}
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'مهلت تسویه (ساعت)' : 'Grace Hours'}</label>
                <input
                  dir="ltr"
                  value={adminFeePolicy.graceHours}
                  onChange={(e) => setAdminFeePolicy((p) => ({ ...p, graceHours: e.target.value }))}
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'جریمه دیرکرد (%)' : 'Late Penalty (%)'}</label>
                <input
                  dir="ltr"
                  value={adminFeePolicy.latePenaltyPct}
                  onChange={(e) => setAdminFeePolicy((p) => ({ ...p, latePenaltyPct: e.target.value }))}
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <label className="flex items-center gap-2 surface-soft rounded-xl px-3 py-2 cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={adminFeePolicy.autoLockEnabled}
                  onChange={(e) => setAdminFeePolicy((p) => ({ ...p, autoLockEnabled: e.target.checked }))}
                />
                <span className="font-bold text-main">{isFa ? 'قفل خودکار ترید واقعی' : 'Auto-Lock Live'}</span>
              </label>
            </div>

            {adminFeeAccounts.length === 0 ? (
              <p className="text-xs text-dim">{isFa ? 'همه حساب‌ها تسویه هستند و بدهی معلقی ثبت نشده است.' : 'No outstanding fee debtors.'}</p>
            ) : (
              <div className="space-y-2 text-xs">
                {adminFeeAccounts.map((acc) => (
                  <div key={acc.id} className="surface-soft rounded-2xl p-3 border hairline flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-main">{acc.username} <span className="text-dim font-normal">({acc.email})</span></p>
                      <p className="text-[11px] text-dim" dir="ltr">
                        Status: <b>{acc.lock_status}</b> · Due: ${Number(acc.accrued_usd).toFixed(2)} · Penalty: ${Number(acc.penalty_usd).toFixed(2)} · Pending: ${Number(acc.pending_verify_usd).toFixed(2)} · Credit: ${Number(acc.prepaid_credit_usd).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/subscriptions/admin/server-fees/${acc.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'APPROVE_SETTLEMENT' }),
                          });
                          await load();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#059669] text-white font-bold"
                      >
                        {isFa ? 'تایید و آزادسازی' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/subscriptions/admin/server-fees/${acc.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'APPLY_PENALTY', amountUsd: 1 }),
                          });
                          await load();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#D97706] text-white font-bold"
                      >
                        {isFa ? '+$1 جریمه و قفل' : '+$1 Penalty & Lock'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/subscriptions/admin/server-fees/${acc.id}/action`, {
                            method: 'POST',
                            body: JSON.stringify({ action: acc.lock_status === 'LOCKED' ? 'UNLOCK' : 'LOCK' }),
                          });
                          await load();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#DC2626] text-white font-bold"
                      >
                        {acc.lock_status === 'LOCKED' ? (isFa ? 'رفع قفل' : 'Unlock') : isFa ? 'قفل دستی' : 'Lock'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card p-5 space-y-3 overflow-x-auto">
            <h3 className="text-sm font-black text-main flex items-center gap-2">
              <Crown className="w-4 h-4 text-flame" />
              <span>{isFa ? 'تسویه کارمزد ۵٪ سود و تراکنش‌های تاریخی (اشتراک ماهانه رایگان است)' : '5% Profit Fee Settlements & Legacy Records (Subscriptions Free)'}</span>
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-dim py-3">{isFa ? 'هنوز سفارشی ثبت نشده است.' : 'No subscription orders yet.'}</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-dim border-b">
                  <tr>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کاربر' : 'User'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کد پیگیری' : 'Payment Ref'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-2 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-2">
                        <div className="font-bold text-main">{o.username}</div>
                        <div className="text-[11px] text-dim">{o.email}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-bold text-brand">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</div>
                        <div className="text-[11px] font-mono-num text-dim">
                          ${o.amount_usd} / {o.amount_toman?.toLocaleString()}T
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono-num text-[11px]">
                        <span className="text-sub">{o.payment_method}</span>
                        <div className="text-main break-all max-w-[200px]">{o.payment_reference || '-'}</div>
                        {o.receipt_image_url && (
                          <button
                            type="button"
                            onClick={() => setAdminLightboxImg(o.receipt_image_url || null)}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 font-sans text-[10px] font-bold"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isFa ? 'مشاهده عکس رسید' : 'View Receipt'}</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'ACTIVE'
                              ? 'badge-signal'
                              : o.status === 'PENDING_REVIEW'
                                ? 'bg-[#FF8A00]/15 text-flame'
                                : 'bg-rose-500/15 text-loss'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-end space-x-1.5">
                        {o.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => void reviewOrder(o.id, 'APPROVE')}
                              className="px-2.5 py-1.5 rounded-xl btn-emerald font-bold inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isFa ? 'تایید' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => void reviewOrder(o.id, 'REJECT')}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-loss font-bold inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isFa ? 'رد' : 'Reject'}</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <form onSubmit={grantSubscription} className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Gift className="w-4 h-4 text-signal" />
                <span>{isFa ? 'فعال‌سازی دستی اشتراک برای کاربر' : 'Manual Subscription Grant'}</span>
              </h3>
              <input
                required
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder={isFa ? 'ایمیل یا ID کاربر' : 'User Email or ID'}
                className="w-full surface-input rounded-xl px-3 py-2.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="surface-input rounded-xl px-3 py-2.5">
                  <option value="pro_monthly">1-Month ($20)</option>
                  <option value="vip_quarterly">3-Month ($50)</option>
                  <option value="pro_semiannual">6-Month ($90)</option>
                  <option value="pro_annual">1-Year ($160)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  className="surface-input rounded-xl px-3 py-2.5 font-mono-num"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl btn-emerald font-extrabold">
                {isFa ? 'اعطای اشتراک فعال' : 'Grant Active Subscription'}
              </button>

              <div className="pt-3 mt-2 border-t hairline space-y-2">
                <div className="text-[11px] font-bold text-sub">
                  {isFa ? 'تولید کد هدیه اشتراک (Gift Code):' : 'Generate Subscription Gift Code:'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min={1} max={3650} value={giftDays} onChange={(e) => setGiftDays(Number(e.target.value))} placeholder="Days" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                  <input type="number" min={1} max={500} value={giftMaxUses} onChange={(e) => setGiftMaxUses(Number(e.target.value))} placeholder="Uses" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                  <button type="button" onClick={() => void createGiftCode()} className="btn-cobalt rounded-xl font-black text-xs inline-flex items-center justify-center gap-1">
                    <Gift className="w-3.5 h-3.5" />
                    <span>{isFa ? 'ساخت کد' : 'Create'}</span>
                  </button>
                </div>
                {generatedGiftCode && (
                  <div className="p-2.5 rounded-xl surface-soft font-mono-num text-center font-black text-jade">
                    {generatedGiftCode}
                  </div>
                )}
              </div>
            </form>

            <form onSubmit={savePayConfig} className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'تنظیمات کیف‌پول و تعرفه پلن‌ها' : 'Payment Wallet & Plan Pricing'}</span>
                </h3>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-sub">
                  <input
                    type="checkbox"
                    checked={payCfg.subscriptionRequired}
                    onChange={(e) => setPayCfg({ ...payCfg, subscriptionRequired: e.target.checked })}
                  />
                  <span>{isFa ? 'اجبار اشتراک پولی' : 'Require Paid Plan'}</span>
                </label>
              </div>
              <input
                value={payCfg.usdtTrc20Wallet}
                onChange={(e) => setPayCfg({ ...payCfg, usdtTrc20Wallet: e.target.value })}
                placeholder="USDT TRC20 Wallet Address"
                className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={payCfg.iranCardNumber}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardNumber: e.target.value })}
                  placeholder="Card Number (6037-...)"
                  className="surface-input rounded-xl px-3 py-2 font-mono-num"
                />
                <input
                  value={payCfg.iranCardHolder}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardHolder: e.target.value })}
                  placeholder="Card Holder Name"
                  className="surface-input rounded-xl px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={payCfg.proPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, proPriceUsd: Number(e.target.value) })} placeholder="Pro $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.proPriceToman} onChange={(e) => setPayCfg({ ...payCfg, proPriceToman: Number(e.target.value) })} placeholder="Pro T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, vipPriceUsd: Number(e.target.value) })} placeholder="VIP $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceToman} onChange={(e) => setPayCfg({ ...payCfg, vipPriceToman: Number(e.target.value) })} placeholder="VIP T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
              </div>

              <div className="pt-2 border-t hairline space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-amber-400 inline-flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" />
                    <span>{isFa ? 'آدرس‌های دریافت Trust Wallet و امنیت ربات:' : 'Trust Wallet Receivers & KYC Gate:'}</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-main">
                    <input
                      type="checkbox"
                      checked={requirePhoneKyc}
                      onChange={(e) => setRequirePhoneKyc(e.target.checked)}
                    />
                    <span>{isFa ? 'اجبار احراز شماره تماس تلگرام' : 'Require Telegram Phone KYC'}</span>
                  </label>
                </div>
                <input
                  dir="ltr"
                  value={trustReceivers.evm}
                  onChange={(e) => setTrustReceivers({ ...trustReceivers, evm: e.target.value })}
                  placeholder="Trust Wallet EVM / BEP20 Receiver (0x...)"
                  className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    dir="ltr"
                    value={trustReceivers.sol}
                    onChange={(e) => setTrustReceivers({ ...trustReceivers, sol: e.target.value })}
                    placeholder="Solana Receiver (optional)"
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                  <input
                    dir="ltr"
                    value={trustReceivers.ton}
                    onChange={(e) => setTrustReceivers({ ...trustReceivers, ton: e.target.value })}
                    placeholder="TON Receiver (optional)"
                    className="surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold">
                {isFa ? 'ذخیره تنظیمات مالی، Trust Wallet و KYC' : 'Save Pricing, Trust Wallet & KYC'}
              </button>
            </form>
          </div>

          {/* Full Subscription Plans CRUD */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>{isFa ? 'مدیریت کامل پکیج‌ها و پلن‌های اشتراک' : 'Subscription Plans Manager'}</span>
              </h3>
              <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{adminPlans.length}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {adminPlans.map((pl) => (
                <div key={pl.code} className="surface-soft rounded-2xl p-3 space-y-2 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main truncate">{isFa ? pl.name_fa || pl.code : pl.name_en || pl.code}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/plans/${pl.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_active: pl.is_active !== 1 }),
                        });
                        await load();
                        onUserUpdated();
                      }}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        pl.is_active === 1 ? 'badge-signal' : 'bg-rose-500/15 text-loss'
                      }`}
                    >
                      {pl.is_active === 1 ? (isFa ? 'فعال' : 'Active') : (isFa ? 'غیرفعال' : 'Hidden')}
                    </button>
                  </div>
                  <div className="text-[11px] text-dim font-mono-num" dir="ltr">
                    {pl.code} · ${pl.price_usd} · {Number(pl.price_toman || 0).toLocaleString()}T · {pl.duration_days || 30}d
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/plans/${pl.code}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_popular: pl.is_popular !== 1 }),
                        });
                        await load();
                      }}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-bold ${
                        pl.is_popular === 1 ? 'btn-gold' : 'surface-card text-dim'
                      }`}
                    >
                      {pl.is_popular === 1 ? '⭐ Popular' : 'Mark Popular'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/plans', {
                  method: 'POST',
                  body: JSON.stringify({
                    code: newPlan.code || undefined,
                    name_fa: newPlan.nameFa,
                    name_en: newPlan.nameEn || newPlan.nameFa,
                    price_usd: newPlan.priceUsd,
                    price_toman: newPlan.priceToman,
                    duration_days: newPlan.durationDays,
                    is_popular: newPlan.isPopular,
                    is_active: true,
                  }),
                });
                setNewPlan({ code: '', nameFa: '', nameEn: '', priceUsd: 29, priceToman: 2030000, durationDays: 30, isPopular: false });
                setMsg(isFa ? 'پلن اشتراک با موفقیت ذخیره شد.' : 'Subscription plan saved.');
                await load();
                onUserUpdated();
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-3 border-t hairline items-end"
            >
              <input
                value={newPlan.code}
                onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })}
                placeholder="code (e.g. vip_60)"
                dir="ltr"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                required
                value={newPlan.nameFa}
                onChange={(e) => setNewPlan({ ...newPlan, nameFa: e.target.value })}
                placeholder={isFa ? 'نام فارسی پلن' : 'Persian Name'}
                className="surface-input rounded-xl px-2.5 py-2"
              />
              <input
                type="number"
                min={1}
                value={newPlan.priceUsd}
                onChange={(e) => setNewPlan({ ...newPlan, priceUsd: Number(e.target.value) })}
                placeholder="USD $"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                type="number"
                min={10000}
                value={newPlan.priceToman}
                onChange={(e) => setNewPlan({ ...newPlan, priceToman: Number(e.target.value) })}
                placeholder="Toman"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <input
                type="number"
                min={1}
                value={newPlan.durationDays}
                onChange={(e) => setNewPlan({ ...newPlan, durationDays: Number(e.target.value) })}
                placeholder="Days"
                className="surface-input rounded-xl px-2.5 py-2 font-mono-num"
              />
              <button type="submit" className="btn-emerald py-2 px-3 rounded-xl font-black inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'افزودن / آپدیت' : 'Save Plan'}</span>
              </button>
            </form>
          </div>

          {/* Referral Payouts & Anti-Fraud Audit Queue */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Wallet className="w-4 h-4 text-jade" />
                <span>{isFa ? 'مدیریت تسویه برداشت‌های رفرال و کنترل تقلب' : 'Referral Payout Queue & Anti-Fraud'}</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full surface-soft text-[10px] font-bold">
                {refWithdrawals.filter((w) => w.status === 'PENDING').length} PENDING · {adminReferrals.filter((r) => r.fraud_flag === 1).length} FLAGGED
              </span>
            </div>

            {refWithdrawals.length === 0 ? (
              <p className="text-dim">{isFa ? 'هنوز درخواست برداشت رفرالی ثبت نشده است.' : 'No referral withdrawal requests yet.'}</p>
            ) : (
              <div className="space-y-2">
                {refWithdrawals.slice(0, 20).map((wd) => (
                  <div key={wd.id} className="surface-soft rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 border hairline">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-main">
                        {wd.username || wd.email} · <span className="font-mono-num text-jade">${Number(wd.amount_usd).toFixed(2)}</span> ({wd.target_type === 'SUBSCRIPTION_CREDIT' ? 'Pro Days' : wd.network})
                      </div>
                      {wd.wallet_address && (
                        <div dir="ltr" className="font-mono-num text-[11px] text-sub break-all">{wd.wallet_address}</div>
                      )}
                      {wd.tx_hash && <div dir="ltr" className="text-[10px] text-jade font-mono-num">TX: {wd.tx_hash}</div>}
                    </div>
                    {wd.status === 'PENDING' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          dir="ltr"
                          value={wdTxInputs[wd.id] || ''}
                          onChange={(e) => setWdTxInputs((m) => ({ ...m, [wd.id]: e.target.value }))}
                          placeholder="TX Hash (optional)"
                          className="surface-input rounded-xl px-2.5 py-1.5 font-mono-num text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/referrals/withdrawals/${wd.id}/decide`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'APPROVE', txHash: wdTxInputs[wd.id] || undefined }),
                            });
                            setMsg(isFa ? 'برداشت رفرال تایید و ثبت شد.' : 'Referral withdrawal approved.');
                            void load();
                          }}
                          className="btn-emerald px-3 py-1.5 rounded-xl font-black"
                        >
                          {isFa ? 'تایید واریز' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/referrals/withdrawals/${wd.id}/decide`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'REJECT', adminNote: 'Rejected & refunded' }),
                            });
                            setMsg(isFa ? 'برداشت رد شد و موجودی به حساب کاربر بازگشت.' : 'Withdrawal rejected & refunded.');
                            void load();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-loss font-black"
                        >
                          {isFa ? 'رد و برگشت' : 'Reject'}
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${wd.status === 'APPROVED' ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                        {wd.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {adminReferrals.some((r) => r.fraud_flag === 1) && (
              <div className="pt-3 border-t hairline space-y-1.5">
                <p className="font-bold text-loss">{isFa ? 'دعوت‌های مشکوک/مسدودشده توسط سیستم ضدتقلب:' : 'Anti-Fraud Flagged Referrals:'}</p>
                {adminReferrals.filter((r) => r.fraud_flag === 1).slice(0, 10).map((fr) => (
                  <div key={fr.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between text-[11px]">
                    <span>{fr.referrer_name} ← {fr.referred_name}</span>
                    <span className="text-loss font-mono-num">{fr.fraud_reason || fr.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'banners') && (
          <div className="space-y-5 tab-enter">
            <div className="panel rounded-3xl p-5 sm:p-6 space-y-5 border border-amber-500/25">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                    <Image className="w-5 h-5 text-[var(--gold)]" />
                    <span>{isFa ? 'مدیریت بنرهای تبلیغاتی، متحرک و ورق‌خور (Carousel)' : 'Animated Promo Banners Carousel Manager'}</span>
                  </h3>
                  <p className="text-xs text-sub mt-1">
                    {isFa
                      ? 'بنرها به‌صورت خودکار و با انیمیشن نرم در صفحه اول سایت و داشبورد کاربران ورق می‌خورند. می‌توانید متن، تصویر، رنگ و دکمه هر اسلاید را مدیریت کنید.'
                      : 'Manage animated auto-rotating promo slides displayed across the Landing Page and User Dashboard.'}
                  </p>
                </div>
                <span className="badge-signal px-3 py-1 rounded-full text-[11px] font-black">
                  {promoBanners.filter((b) => b.is_active === 1).length} / {promoBanners.length} {isFa ? 'فعال' : 'Active'}
                </span>
              </div>

              {/* Add / Update Banner Form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await apiFetch<{ banners: PromoBannerItem[] }>('/api/admin/banners', {
                    method: 'POST',
                    body: JSON.stringify(bannerForm),
                  });
                  setPromoBanners(res.banners || []);
                  setBannerForm({
                    id: '',
                    badge_fa: 'پیشنهاد ویژه',
                    badge_en: 'FEATURED',
                    title_fa: '',
                    title_en: '',
                    subtitle_fa: '',
                    subtitle_en: '',
                    cta_label_fa: 'شروع فوری',
                    cta_label_en: 'Launch Now',
                    cta_target: 'copy',
                    image_url: '/images/smart-wallet-radar.webp',
                    accent_theme: 'gold',
                    placement: 'BOTH',
                    sort_order: promoBanners.length + 1,
                  });
                  setMsg(isFa ? 'بنر تبلیغاتی با موفقیت ذخیره و در اسلایدر منتشر شد!' : 'Promo banner saved!');
                }}
                className="surface-soft rounded-2xl p-4 sm:p-5 space-y-3 text-xs border hairline"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-main inline-flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                    <span>{bannerForm.id ? (isFa ? 'ویرایش بنر انتخاب‌شده' : 'Edit Banner') : isFa ? 'افزودن بنر جدید به اسلایدر' : 'Add New Promo Slide'}</span>
                  </span>
                  {bannerForm.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setBannerForm((f) => ({ ...f, id: '', title_fa: '', title_en: '', subtitle_fa: '', subtitle_en: '' }))
                      }
                      className="text-[11px] text-loss font-bold"
                    >
                      {isFa ? 'لغو ویرایش' : 'Cancel Edit'}
                    </button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'برچسب بالای بنر (فارسی)' : 'Badge (FA)'}</label>
                    <input
                      value={bannerForm.badge_fa}
                      onChange={(e) => setBannerForm((f) => ({ ...f, badge_fa: e.target.value }))}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'عنوان بنر (فارسی) *' : 'Title (FA) *'}</label>
                    <input
                      required
                      value={bannerForm.title_fa}
                      onChange={(e) => setBannerForm((f) => ({ ...f, title_fa: e.target.value }))}
                      placeholder={isFa ? 'مثلاً: تخفیف ویژه اشتراک فصلی یا رادار نهنگ‌ها' : 'Banner title...'}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'عنوان بنر (انگلیسی)' : 'Title (EN)'}</label>
                    <input
                      dir="ltr"
                      value={bannerForm.title_en}
                      onChange={(e) => setBannerForm((f) => ({ ...f, title_en: e.target.value }))}
                      placeholder="English banner title..."
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'متن دکمه CTA' : 'Button Label'}</label>
                    <input
                      value={bannerForm.cta_label_fa}
                      onChange={(e) => setBannerForm((f) => ({ ...f, cta_label_fa: e.target.value }))}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'توضیح بنر (فارسی) *' : 'Subtitle (FA) *'}</label>
                    <textarea
                      required
                      rows={2}
                      value={bannerForm.subtitle_fa}
                      onChange={(e) => setBannerForm((f) => ({ ...f, subtitle_fa: e.target.value }))}
                      placeholder={isFa ? 'توضیح جذاب و کوتاه درباره پیشنهاد یا قابلیت...' : 'Short compelling description...'}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'توضیح بنر (انگلیسی)' : 'Subtitle (EN)'}</label>
                    <textarea
                      dir="ltr"
                      rows={2}
                      value={bannerForm.subtitle_en}
                      onChange={(e) => setBannerForm((f) => ({ ...f, subtitle_en: e.target.value }))}
                      placeholder="Short English subtitle..."
                      className="surface-input w-full rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'لینک / تب هدف دکمه' : 'Target Tab or URL'}</label>
                    <select
                      value={bannerForm.cta_target}
                      onChange={(e) => setBannerForm((f) => ({ ...f, cta_target: e.target.value }))}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    >
                      <option value="copy">{isFa ? 'کپی‌ترید و ولت‌های V2 (copy)' : 'Copy Trade V2 (copy)'}</option>
                      <option value="dex">{isFa ? 'DEX، ضدراگ و فیوچرز کیف‌پول (dex)' : 'DEX & Perps (dex)'}</option>
                      <option value="myai">{isFa ? 'هوش مصنوعی شخصی من (myai)' : 'My AI (myai)'}</option>
                      <option value="pricing">{isFa ? 'صفحه اشتراک‌ها (pricing)' : 'Subscriptions (pricing)'}</option>
                      <option value="radar">{isFa ? 'رادار و استراتژی شکار (radar)' : 'Radar & IDE (radar)'}</option>
                      <option value="aichat">{isFa ? 'چت هوش مصنوعی و تحلیل عکس چارت (aichat)' : 'AI Vision Chat (aichat)'}</option>
                      <option value="https://t.me/Dollarino_official">{isFa ? 'کانال رسمی تلگرام' : 'Telegram Channel'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'تصویر آماده یا آدرس دلخواه' : 'Banner Image'}</label>
                    <select
                      value={bannerForm.image_url}
                      onChange={(e) => setBannerForm((f) => ({ ...f, image_url: e.target.value }))}
                      className="surface-input w-full rounded-xl px-3 py-2"
                    >
                      <option value="/images/smart-wallet-radar.webp">رادار نهنگ‌ها و خزانه (Smart Radar)</option>
                      <option value="/images/antirug-shield-dapp.webp">سپر ضدراگ و DApp (Anti-Rug)</option>
                      <option value="/images/hero-quant-desk.webp">میز ترید کمی (Quant Desk)</option>
                      <option value="/images/my-ai-brain.webp">هوش مصنوعی شخصی (My AI)</option>
                      <option value="/images/copytrade-trophy.webp">جام کپی‌ترید (Copy Trophy)</option>
                      <option value="/images/vip-club-banner.webp">کلوپ VIP (VIP Club)</option>
                      <option value="/images/trust-dex-hub.webp">تراست‌ولت و DEX (Trust Hub)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'آدرس عکس سفارشی (اختیاری)' : 'Custom Image URL'}</label>
                    <input
                      dir="ltr"
                      value={bannerForm.image_url}
                      onChange={(e) => setBannerForm((f) => ({ ...f, image_url: e.target.value }))}
                      className="surface-input w-full rounded-xl px-3 py-2 font-mono text-[11px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[10px] text-dim block mb-1">{isFa ? 'محل نمایش' : 'Placement'}</label>
                      <select
                        value={bannerForm.placement}
                        onChange={(e) => setBannerForm((f) => ({ ...f, placement: e.target.value }))}
                        className="surface-input w-full rounded-xl px-2 py-2"
                      >
                        <option value="BOTH">{isFa ? 'همه‌جا' : 'Both'}</option>
                        <option value="LANDING">{isFa ? 'صفحه اول' : 'Landing'}</option>
                        <option value="DASHBOARD">{isFa ? 'داشبورد' : 'Dashboard'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-dim block mb-1">{isFa ? 'رنگ تم' : 'Theme'}</label>
                      <select
                        value={bannerForm.accent_theme}
                        onChange={(e) => setBannerForm((f) => ({ ...f, accent_theme: e.target.value }))}
                        className="surface-input w-full rounded-xl px-2 py-2"
                      >
                        <option value="gold">طلایی</option>
                        <option value="emerald">زمردی</option>
                        <option value="cobalt">کبالت</option>
                        <option value="purple">بنفش</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn-gold py-2.5 px-4 rounded-xl font-black">
                    {bannerForm.id ? (isFa ? 'بروزرسانی بنر' : 'Update Slide') : isFa ? 'انتشار در اسلایدر' : 'Publish Slide'}
                  </button>
                </div>
              </form>

              {/* Existing Banners List */}
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                {promoBanners.map((b) => (
                  <div key={b.id} className="surface-soft rounded-2xl p-3.5 border hairline flex gap-3 items-center">
                    <img
                      src={b.image_url}
                      alt={b.title_fa}
                      className="w-24 h-16 rounded-xl object-cover shrink-0 border hairline"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] font-black">
                          #{b.sort_order} · {b.placement}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${b.is_active ? 'badge-signal' : 'bg-rose-500/15 text-loss'}`}>
                          {b.is_active ? (isFa ? 'فعال' : 'ON') : isFa ? 'خاموش' : 'OFF'}
                        </span>
                      </div>
                      <p className="font-black text-main truncate">{b.title_fa}</p>
                      <p className="text-[10px] text-dim truncate">{b.subtitle_fa}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiFetch<{ banners: PromoBannerItem[] }>(`/api/admin/banners/${b.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_active: b.is_active !== 1 }),
                            });
                            setPromoBanners(r.banners || []);
                          }}
                          className="btn-ghost px-2.5 py-1 rounded-lg text-[10px] font-bold"
                        >
                          {b.is_active ? (isFa ? 'خاموش کن' : 'Disable') : isFa ? 'فعال کن' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBannerForm({
                              id: b.id,
                              badge_fa: b.badge_fa,
                              badge_en: b.badge_en,
                              title_fa: b.title_fa,
                              title_en: b.title_en,
                              subtitle_fa: b.subtitle_fa,
                              subtitle_en: b.subtitle_en,
                              cta_label_fa: b.cta_label_fa,
                              cta_label_en: b.cta_label_en,
                              cta_target: b.cta_target,
                              image_url: b.image_url,
                              accent_theme: b.accent_theme,
                              placement: b.placement,
                              sort_order: b.sort_order,
                            })
                          }
                          className="btn-cobalt px-2.5 py-1 rounded-lg text-[10px] font-black"
                        >
                          {isFa ? 'ویرایش' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await apiFetch<{ banners: PromoBannerItem[] }>(`/api/admin/banners/${b.id}`, {
                              method: 'DELETE',
                            });
                            setPromoBanners(r.banners || []);
                            setMsg(isFa ? 'بنر حذف شد.' : 'Banner removed.');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss text-[10px] font-black"
                        >
                          {isFa ? 'حذف' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'founder') && (
          <div className="surface-card p-5 sm:p-6 space-y-5 tab-enter">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4">
              <div>
                <h3 className="text-sm sm:text-base font-black flex items-center gap-2 text-main">
                  <BadgeCheck className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'پروفایل کامل بنیان‌گذار، آپلود عکس و شفافیت ۱۰۰٪ روی صفحه اول' : 'Founder Verification Profile, Photo & Landing Page Trust Card'}</span>
                </h3>
                <p className="text-[11px] text-dim mt-1 leading-relaxed">
                  {isFa
                    ? 'تمام اطلاعاتی که اینجا ذخیره کنید بلافاصله در بخش «معرفی سازنده و ضدپانزی» صفحه اصلی (قبل از ثبت‌نام و ورود) برای کاربران و مراجع قانونی نمایش داده می‌شود.'
                    : 'Everything saved here immediately updates the pre-signup Founder Verification & Anti-Ponzi Trust section on the public Landing Page.'}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl surface-soft border hairline text-xs font-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={founderProfile.showPublic}
                  onChange={(e) => setFounderProfile((p) => ({ ...p, showPublic: e.target.checked }))}
                  className="accent-[var(--gold)] w-4 h-4"
                />
                <span>{isFa ? 'نمایش عمومی در صفحه اول' : 'Show Publicly on Landing Page'}</span>
              </label>
            </div>

            {/* Photo Upload + Live Card Preview */}
            <div className="surface-soft rounded-3xl p-4 sm:p-5 border hairline flex flex-wrap items-center gap-5">
              <div className="relative shrink-0">
                {founderProfile.photoUrl ? (
                  <img
                    src={founderProfile.photoUrl}
                    alt="Founder Portrait"
                    className="w-24 h-24 rounded-3xl object-cover border-2 border-[var(--gold)] shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-3xl panel border hairline grid place-items-center text-dim">
                    <Camera className="w-8 h-8 opacity-60" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-[240px] space-y-2.5 text-xs">
                <p className="font-black text-main">
                  {isFa ? 'عکس واقعی بنیان‌گذار (جهت احراز هویت و اعتماد عمومی)' : 'Founder Real Portrait Photo'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-cobalt px-3.5 py-2 rounded-xl font-black inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isFa ? 'آپلود عکس از دستگاه' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const img = new window.Image();
                          img.onload = () => {
                            const maxSide = 640;
                            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                            const w = Math.max(1, Math.round(img.width * scale));
                            const h = Math.max(1, Math.round(img.height * scale));
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(img, 0, 0, w, h);
                              const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                              setFounderProfile((p) => ({ ...p, photoUrl: dataUrl }));
                              setMsg(isFa ? 'عکس با کیفیت بهینه آماده ذخیره شد (دکمه ذخیره را بزنید).' : 'Photo prepared; click Save below.');
                            }
                          };
                          if (typeof reader.result === 'string') img.src = reader.result;
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {founderProfile.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setFounderProfile((p) => ({ ...p, photoUrl: '' }))}
                      className="btn-ghost px-3 py-2 rounded-xl font-bold text-rose-500"
                    >
                      {isFa ? 'حذف عکس' : 'Remove Photo'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={founderProfile.photoUrl.startsWith('data:') ? '' : founderProfile.photoUrl}
                  onChange={(e) => setFounderProfile((p) => ({ ...p, photoUrl: e.target.value }))}
                  placeholder={isFa ? 'یا لینک HTTPS مستقیم عکس (اختیاری)...' : 'Or paste direct HTTPS photo URL...'}
                  className="w-full surface-input rounded-xl px-3 py-2 text-[11px]"
                />
              </div>
            </div>

            {/* Founder Identity, Legal Contact & Project Transparency Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFounderSaving(true);
                setMsg(null);
                try {
                  const res = await apiFetch<{ ok: boolean; profile: FounderProfile }>('/api/admin/founder-profile', {
                    method: 'PUT',
                    body: JSON.stringify(founderProfile),
                  });
                  if (res.profile) setFounderProfile(res.profile);
                  setMsg(isFa ? 'پروفایل هویتی و شفافیت بنیان‌گذار با موفقیت ذخیره و در صفحه اول منتشر شد!' : 'Founder transparency profile saved and live on Landing Page!');
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Failed to save founder profile');
                } finally {
                  setFounderSaving(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'نام و نام خانوادگی (فارسی)' : 'Full Name (Persian)'}</label>
                  <input value={founderProfile.fullNameFa} onChange={(e) => setFounderProfile((p) => ({ ...p, fullNameFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'نام و نام خانوادگی (انگلیسی)' : 'Full Name (English)'}</label>
                  <input dir="ltr" value={founderProfile.fullNameEn} onChange={(e) => setFounderProfile((p) => ({ ...p, fullNameEn: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کد تایید / شناسه ثبت‌شده قابل استعلام' : 'Verification / Official ID'}</label>
                  <input dir="ltr" value={founderProfile.verificationId} onChange={(e) => setFounderProfile((p) => ({ ...p, verificationId: e.target.value }))} placeholder="TG-OWNER-... / National or Business ID" className="w-full surface-input rounded-xl px-3 py-2 font-mono" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'عنوان / سمت رسمی (فارسی)' : 'Role / Title (Persian)'}</label>
                  <input value={founderProfile.roleFa} onChange={(e) => setFounderProfile((p) => ({ ...p, roleFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'عنوان / سمت رسمی (انگلیسی)' : 'Role / Title (English)'}</label>
                  <input dir="ltr" value={founderProfile.roleEn} onChange={(e) => setFounderProfile((p) => ({ ...p, roleEn: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1 inline-flex items-center gap-1"><Mail className="w-3 h-3" /><span>Gmail / ایمیل رسمی</span></label>
                  <input dir="ltr" type="email" value={founderProfile.email} onChange={(e) => setFounderProfile((p) => ({ ...p, email: e.target.value }))} placeholder="name@gmail.com" className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1 inline-flex items-center gap-1"><Phone className="w-3 h-3" /><span>شماره تماس / تلفن استعلام</span></label>
                  <input dir="ltr" value={founderProfile.phone} onChange={(e) => setFounderProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+98 912 ... / +49 ..." className="w-full surface-input rounded-xl px-3 py-2 font-mono" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'آیدی تلگرام سازنده' : 'Telegram Handle'}</label>
                  <input dir="ltr" value={founderProfile.telegram} onChange={(e) => setFounderProfile((p) => ({ ...p, telegram: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'لینک تلگرام' : 'Telegram URL'}</label>
                  <input dir="ltr" value={founderProfile.telegramUrl} onChange={(e) => setFounderProfile((p) => ({ ...p, telegramUrl: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کانال رسمی تلگرام' : 'Official Channel'}</label>
                  <input dir="ltr" value={founderProfile.channel} onChange={(e) => setFounderProfile((p) => ({ ...p, channel: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">Instagram</label>
                  <input dir="ltr" value={founderProfile.instagram} onChange={(e) => setFounderProfile((p) => ({ ...p, instagram: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">X (Twitter)</label>
                  <input dir="ltr" value={founderProfile.twitter} onChange={(e) => setFounderProfile((p) => ({ ...p, twitter: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /><span>{isFa ? 'نشانی فیزیکی / محل کار (فارسی)' : 'Physical Address (Persian)'}</span></label>
                  <input value={founderProfile.addressFa} onChange={(e) => setFounderProfile((p) => ({ ...p, addressFa: e.target.value }))} placeholder={isFa ? 'شهر، خیابان، پلاک یا دفتر رسمی قابل استعلام...' : 'Verifiable physical address (FA)...'} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1 inline-flex items-center gap-1"><Globe className="w-3 h-3" /><span>{isFa ? 'نشانی فیزیکی (انگلیسی)' : 'Physical Address (English)'}</span></label>
                  <input dir="ltr" value={founderProfile.addressEn} onChange={(e) => setFounderProfile((p) => ({ ...p, addressEn: e.target.value }))} placeholder="City, Street, Verifiable Address..." className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'بیانیه استقلال ۱۰۰٪ (صفر تا صد مستقل و بدون پوشش ثالث - فارسی)' : '0-to-100 Independence Declaration (FA)'}</label>
                  <textarea rows={2} value={founderProfile.independenceFa} onChange={(e) => setFounderProfile((p) => ({ ...p, independenceFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'بیانیه استقلال (انگلیسی)' : '0-to-100 Independence Declaration (EN)'}</label>
                  <textarea dir="ltr" rows={2} value={founderProfile.independenceEn} onChange={(e) => setFounderProfile((p) => ({ ...p, independenceEn: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'معرفی و سابقه سازنده (فارسی)' : 'Founder Bio (FA)'}</label>
                  <textarea rows={2} value={founderProfile.bioFa} onChange={(e) => setFounderProfile((p) => ({ ...p, bioFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'هدف و چشم‌انداز پروژه (فارسی)' : 'Project Mission & Goals (FA)'}</label>
                  <textarea rows={2} value={founderProfile.missionFa} onChange={(e) => setFounderProfile((p) => ({ ...p, missionFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'توضیح خلاصه ضدپانزی و غیرامانی بودن پلتفرم (فارسی)' : 'Anti-Ponzi Summary (FA)'}</label>
                <textarea rows={2} value={founderProfile.antiPonziFa} onChange={(e) => setFounderProfile((p) => ({ ...p, antiPonziFa: e.target.value }))} className="w-full surface-input rounded-xl px-3 py-2" />
              </div>

              <div className="flex justify-end pt-1">
                <button type="submit" disabled={founderSaving} className="btn-emerald px-6 py-2.5 rounded-2xl text-xs font-black">
                  {founderSaving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : (isFa ? 'ذخیره و انتشار در صفحه اول' : 'Save & Publish on Landing Page')}
                </button>
              </div>
            </form>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'users') && (
          <div className="surface-card p-5 space-y-3 overflow-x-auto tab-enter">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black flex items-center gap-2 text-main">
                <Users className="w-4 h-4 text-brand" />
                <span>{isFa ? 'مدیریت کاربران، احراز هویت شماره و Trust Wallet' : 'Users, Phone KYC & Trust Wallets'}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isFa ? 'جستجو نام، ایمیل، تلفن، آدرس...' : 'Search user / phone / wallet...'}
                  className="surface-input rounded-xl px-3 py-1.5 text-xs"
                />
                {[
                  { id: 'all', label: isFa ? 'همه' : 'All' },
                  { id: 'kyc_verified', label: isFa ? 'KYC تایید' : 'Verified' },
                  { id: 'trust_wallet', label: isFa ? 'Trust Wallet' : 'Trust Wallet' },
                  { id: 'unverified', label: isFa ? 'بدون KYC' : 'Pending KYC' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUserFilter(f.id as typeof userFilter)}
                    className={`px-2.5 py-1 rounded-lg font-bold ${userFilter === f.id ? 'btn-cobalt' : 'surface-soft text-dim'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full text-xs">
              <thead className="text-dim border-b">
                <tr>
                  <th className="py-2 px-2 text-start">User</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'تلگرام و تلفن KYC' : 'Telegram & KYC'}</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'کیف‌پول Trust Wallet' : 'Trust Wallet'}</th>
                  <th className="py-2 px-2 text-start">{isFa ? 'نقش / پلن / حالت' : 'Role / Plan / UI'}</th>
                  <th className="py-2 px-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.users
                  .filter((u) => {
                    if (userFilter === 'kyc_verified' && u.phone_verified !== 1) return false;
                    if (userFilter === 'trust_wallet' && !u.trust_wallet_address && !u.trust_wallet_tron) return false;
                    if (userFilter === 'unverified' && u.phone_verified === 1) return false;
                    const q = userSearch.trim().toLowerCase();
                    if (!q) return true;
                    return [u.username, u.email, u.telegram_id, u.telegram_username, u.phone_number, u.trust_wallet_address]
                      .filter(Boolean)
                      .some((v) => String(v).toLowerCase().includes(q));
                  })
                  .map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-2 text-main font-semibold">
                      <div>{u.username}</div>
                      <div className="text-[11px] text-dim">{u.email}</div>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-sub">
                      <div>{u.telegram_username ? `@${u.telegram_username}` : u.telegram_id || '-'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 ${u.phone_verified === 1 ? 'text-jade font-bold' : 'text-amber-400'}`}>
                          {u.phone_verified === 1 ? <CheckCircle2 className="w-3 h-3" /> : null}
                          <span>{u.phone_verified === 1 ? u.phone_number || 'Verified' : 'Unverified'}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-[11px] text-sub" dir="ltr">
                      {u.trust_wallet_address ? (
                        <span className="badge-signal px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          <span>{u.trust_wallet_address.slice(0, 6)}...{u.trust_wallet_address.slice(-4)}</span>
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="px-2 py-0.5 rounded surface-soft text-main font-bold">{u.role}</span>
                        {u.activePlan && <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-jade font-bold">{u.activePlan}</span>}
                        <span className="px-2 py-0.5 rounded bg-[var(--soft)] border hairline text-dim">{u.ui_mode || 'simple'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-end space-x-1 space-y-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/users/${u.id}/kyc`, {
                            method: 'PATCH',
                            body: JSON.stringify({ phoneVerified: u.phone_verified !== 1 }),
                          });
                          setMsg(isFa ? `وضعیت KYC کاربر ${u.username} بروزرسانی شد.` : 'User KYC updated.');
                          void load();
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-500/15 text-jade font-bold"
                      >
                        {u.phone_verified === 1 ? (isFa ? 'لغو KYC' : 'Revoke KYC') : (isFa ? 'تایید KYC' : 'Approve KYC')}
                      </button>
                      {u.role.toLowerCase() !== 'owner' && (
                        <>
                          {roleLower === 'owner' && (
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ role: u.role.toLowerCase() === 'admin' ? 'user' : 'admin' }),
                                });
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand font-bold"
                            >
                              {u.role.toLowerCase() === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ is_blocked: !u.is_blocked }),
                              });
                              void load();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss font-bold"
                          >
                            {u.is_blocked ? 'Unblock' : 'Block'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'ops') && (
          <div className="space-y-5 tab-enter">
          {/* Admin Copy Traders Manager + Online Support Inbox */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Copy Traders Management — Auto-Discovery of Top Site Traders + 1-Click Publish */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'مدیریت تریدرهای تاییدشده کپی‌ترید (کشف خودکار برترین‌های سایت)' : 'Verified Copy Traders (Auto Top Site Performers)'}</span>
                </h3>
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{copyTraders.filter((t) => t.is_active).length}</span>
              </div>

              {/* Automatic Top-Trader Surfacing Controls */}
              <div className="surface-soft rounded-2xl p-3.5 space-y-2.5 border hairline">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-[11px] font-black text-main cursor-pointer">
                    <input
                      type="checkbox"
                      checked={siteTraderAutoCfg.enabled}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        setSiteTraderAutoCfg((p) => ({ ...p, enabled }));
                        await apiFetch('/api/admin/site-traders/sync-auto', {
                          method: 'POST',
                          body: JSON.stringify({ enabled }),
                        });
                        setMsg(enabled ? (isFa ? 'انتشار خودکار برترین تریدرهای سایت فعال شد ✅' : 'Auto top-trader publishing enabled') : (isFa ? 'حالت انتخاب دستی فعال شد' : 'Manual selection mode enabled'));
                        void load();
                      }}
                    />
                    <span>{isFa ? 'انتشار خودکار برترین تریدرهای سایت در لیست کپی‌ترید' : 'Auto-publish top site traders automatically'}</span>
                  </label>
                  <button
                    type="button"
                    disabled={syncingSiteTraders}
                    onClick={async () => {
                      setSyncingSiteTraders(true);
                      try {
                        const r = await apiFetch<{ synced: number }>('/api/admin/site-traders/sync-auto', {
                          method: 'POST',
                          body: JSON.stringify(siteTraderAutoCfg),
                        });
                        setMsg(isFa ? `رتبه‌بندی برترین تریدرهای سایت بروزرسانی و ${r.synced} مورد همگام شد ✅` : `Synced ${r.synced} top site traders`);
                        await load();
                      } finally {
                        setSyncingSiteTraders(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl btn-cobalt text-[11px] font-black inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingSiteTraders ? 'animate-spin' : ''}`} />
                    <span>{isFa ? 'اسکن و همگام‌سازی فوری' : 'Scan & Sync Now'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-dim shrink-0">{isFa ? 'حداقل وین‌ریت (%):' : 'Min WinRate %:'}</span>
                    <input
                      type="number"
                      min={0}
                      max={95}
                      value={siteTraderAutoCfg.minWinRate}
                      onChange={(e) => setSiteTraderAutoCfg((p) => ({ ...p, minWinRate: Number(e.target.value) || 50 }))}
                      className="surface-input w-20 rounded-lg px-2 py-1 font-mono-num"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-dim shrink-0">{isFa ? 'سقف تریدر خودکار:' : 'Max Auto Count:'}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={siteTraderAutoCfg.maxCount}
                      onChange={(e) => setSiteTraderAutoCfg((p) => ({ ...p, maxCount: Number(e.target.value) || 6 }))}
                      className="surface-input w-20 rounded-lg px-2 py-1 font-mono-num"
                    />
                  </div>
                </div>
              </div>

              {/* Ranked Live Site Traders for 1-Click Approval */}
              <div className="space-y-2">
                <p className="text-[11px] font-black text-sub flex items-center justify-between">
                  <span>{isFa ? '🏅 برترین تریدرهای واقعی سایت (انتخاب ۱-کلیکی بدون نیاز به تایپ):' : '🏅 Top Site Traders (1-Click Approve):'}</span>
                  <span className="text-dim font-mono-num">{siteTopTraders.length}</span>
                </p>
                {siteTopTraders.length === 0 ? (
                  <p className="text-[11px] text-dim surface-soft rounded-xl p-3 text-center">
                    {isFa
                      ? 'به‌محض ثبت اولین معاملات کاربران در سایت یا دمو، رتبه‌بندی برترین تریدرهای سایت به‌صورت خودکار اینجا ظاهر می‌شود.'
                      : 'Top site traders appear here automatically as users complete trades.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {siteTopTraders.map((cand, idx) => (
                      <div key={cand.userId} className="surface-soft rounded-xl p-2.5 flex items-center justify-between gap-2 border hairline">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono-num text-[10px] font-black">#{idx + 1}</span>
                            <span className="font-black text-main truncate">{cand.username}</span>
                            <span dir="ltr" className="text-[10px] text-dim font-mono">{cand.handle}</span>
                            {cand.hasTrustWallet && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-jade text-[9px] font-black">Trust</span>
                            )}
                            <span className="px-1.5 py-0.5 rounded surface-card border hairline text-[9px] font-bold text-sub">{cand.mode}</span>
                          </div>
                          <p className="text-[11px] text-dim mt-0.5" dir="ltr">
                            WR {cand.winRate}% · Net {cand.netPnlUsd >= 0 ? '+' : '-'}${Math.abs(cand.netPnlUsd).toFixed(2)} · ROI {cand.roi30dPct >= 0 ? '+' : ''}{cand.roi30dPct}% · {cand.closedTrades} closed / {cand.openTrades} open
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const nextActive = !cand.isActiveInCopyList;
                            await apiFetch(`/api/admin/site-traders/${cand.userId}/promote`, {
                              method: 'POST',
                              body: JSON.stringify({ active: nextActive, askConfirm: true }),
                            });
                            setMsg(
                              nextActive
                                ? (isFa ? `✅ تریدر «${cand.username}» با ۱ کلیک وارد لیست کپی‌ترید کاربران شد!` : `${cand.username} published to Copy-Trade!`)
                                : (isFa ? `⏸ تریدر «${cand.username}» موقتاً از لیست عمومی پنهان شد.` : `${cand.username} hidden from list.`)
                            );
                            await load();
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 ${
                            cand.isActiveInCopyList ? 'bg-rose-500/15 text-loss' : 'btn-emerald'
                          }`}
                        >
                          {cand.isActiveInCopyList
                            ? (isFa ? '⏸ حذف از لیست' : 'Hide')
                            : (isFa ? '✅ انتشار در کپی‌ترید' : 'Publish')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Currently Published Copy-Trade Leaderboard */}
              {copyTraders.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t hairline">
                  <p className="text-[11px] font-bold text-dim">{isFa ? 'لیست فعال در کپی‌ترید کاربران:' : 'Active Public Copy-Traders:'}</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {copyTraders.map((tr) => (
                      <div key={tr.id} className="surface-soft rounded-xl p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-black text-main truncate">
                            {tr.is_active ? '🟢' : '⏸'} {tr.display_name} <span dir="ltr" className="text-dim font-mono">({tr.handle})</span>
                          </p>
                          <p className="text-[11px] text-dim" dir="ltr">
                            ROI +{tr.roi_30d_pct}% · WR {tr.win_rate}% · {tr.followers_count} followers
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/copy-traders/${tr.id}`, { method: 'DELETE' });
                            setMsg(isFa ? 'کپی‌تریدر حذف شد.' : 'Trader deleted.');
                            void load();
                          }}
                          className="text-loss hover:opacity-75 p-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details open={showManualCopyForm} onToggle={(e) => setShowManualCopyForm((e.target as HTMLDetailsElement).open)} className="pt-2 border-t hairline">
                <summary className="cursor-pointer font-bold text-dim hover:text-main text-[11px]">
                  {isFa ? '+ افزودن دستی تریدر یا معامله سفارشی (اختیاری)' : '+ Optional Manual Trader / Trade Entry'}
                </summary>
                <div className="space-y-3 pt-3">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = newTrader.userEmailOrId.trim();
                  await apiFetch('/api/admin/copy-traders', {
                    method: 'POST',
                    body: JSON.stringify({
                      display_name: newTrader.displayName,
                      handle: newTrader.handle,
                      specialty: newTrader.specialty,
                      bio_fa: newTrader.bioFa,
                      user_email: val.includes('@') ? val : undefined,
                      user_id: val && !val.includes('@') ? val : undefined,
                      telegram_id: newTrader.telegramId || undefined,
                      auto_ask_publish: newTrader.askBeforePublish,
                      win_rate: newTrader.winRate,
                      roi_30d_pct: newTrader.roi30dPct,
                      max_drawdown_pct: newTrader.maxDrawdownPct,
                      risk_level: newTrader.riskLevel === 'BALANCED' ? 'MEDIUM' : newTrader.riskLevel,
                      is_verified: true,
                    }),
                  });
                  setNewTrader({
                    ...newTrader,
                    displayName: '',
                    handle: '@',
                    bioFa: '',
                    userEmailOrId: '',
                    telegramId: '',
                  });
                  setMsg(isFa ? 'کپی‌تریدر تاییدشده جدید اضافه شد!' : 'Verified Copy Trader added!');
                  void load();
                }}
                className="space-y-2"
              >
                <p className="font-bold text-sub">{isFa ? 'افزودن دستی تریدر:' : 'Manual Trader:'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input required value={newTrader.displayName} onChange={(e) => setNewTrader({ ...newTrader, displayName: e.target.value })} placeholder={isFa ? 'نام تریدر' : 'Display Name'} className="surface-input rounded-xl px-3 py-2" />
                  <input required dir="ltr" value={newTrader.handle} onChange={(e) => setNewTrader({ ...newTrader, handle: e.target.value })} placeholder="@handle" className="surface-input rounded-xl px-3 py-2 font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input dir="ltr" value={newTrader.userEmailOrId} onChange={(e) => setNewTrader({ ...newTrader, userEmailOrId: e.target.value })} placeholder={isFa ? 'ایمیل یا ID کاربر سایت (اختیاری)' : 'Linked User Email/ID (opt)'} className="surface-input rounded-xl px-3 py-2" />
                  <input dir="ltr" value={newTrader.telegramId} onChange={(e) => setNewTrader({ ...newTrader, telegramId: e.target.value })} placeholder={isFa ? 'آیدی عددی تلگرام تریدر (اختیاری)' : 'Trader Telegram ID (opt)'} className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input value={newTrader.specialty} onChange={(e) => setNewTrader({ ...newTrader, specialty: e.target.value })} placeholder="Specialty" className="surface-input rounded-xl px-3 py-2" />
                  <input type="number" step="0.1" value={newTrader.roi30dPct} onChange={(e) => setNewTrader({ ...newTrader, roi30dPct: Number(e.target.value) })} placeholder="30d ROI %" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                  <input type="number" step="0.1" value={newTrader.winRate} onChange={(e) => setNewTrader({ ...newTrader, winRate: Number(e.target.value) })} placeholder="Win Rate %" className="surface-input rounded-xl px-3 py-2 font-mono-num" />
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-sub">
                  <input
                    type="checkbox"
                    checked={newTrader.askBeforePublish}
                    onChange={(e) => setNewTrader({ ...newTrader, askBeforePublish: e.target.checked })}
                  />
                  <span>{isFa ? 'قبل از انتشار هر معامله برای دنبال‌کننده‌ها، از خود تریدر تایید بگیر' : 'Ask trader confirmation before publishing to followers'}</span>
                </label>
                <button type="submit" className="w-full py-2 rounded-xl btn-gold font-black inline-flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت تریدر تاییدشده' : 'Publish Verified Trader'}</span>
                </button>
              </form>

              {copyTraders.length > 0 && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const tid = tradeTargetId || copyTraders[0]!.id;
                    await apiFetch(`/api/admin/copy-traders/${tid}/trades`, {
                      method: 'POST',
                      body: JSON.stringify({
                        symbol: newTraderTrade.symbol,
                        direction: newTraderTrade.side,
                        leverage: newTraderTrade.leverage,
                        entry_price: String(newTraderTrade.entryPrice),
                        stop_loss: String(newTraderTrade.stopLoss),
                        tp1: String(newTraderTrade.tp1),
                        tp2: newTraderTrade.tp2 ? String(newTraderTrade.tp2) : undefined,
                        tp3: newTraderTrade.tp3 ? String(newTraderTrade.tp3) : undefined,
                        status: newTraderTrade.status,
                        pnl_pct: newTraderTrade.pnlPct,
                        ask_confirm: newTraderTrade.askConfirm,
                        mirror_now: newTraderTrade.mirrorNow,
                        note: newTraderTrade.note,
                      }),
                    });
                    setMsg(
                      newTraderTrade.askConfirm
                        ? isFa
                          ? 'درخواست تایید انتشار برای تریدر ارسال شد!'
                          : 'Confirmation prompt sent to trader!'
                        : isFa
                          ? 'معامله ثبت و برای دنبال‌کننده‌ها همگام شد!'
                          : 'Copy trade published & mirrored!'
                    );
                    void load();
                  }}
                  className="space-y-2 pt-3 border-t hairline"
                >
                  <p className="font-bold text-sub">{isFa ? 'ثبت معامله برای کپی توسط کاربران:' : 'Publish Trade for Users to Copy:'}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={tradeTargetId || copyTraders[0]?.id} onChange={(e) => setTradeTargetId(e.target.value)} className="surface-input rounded-xl px-2 py-2">
                      {copyTraders.map((t) => (
                        <option key={t.id} value={t.id}>{t.display_name}</option>
                      ))}
                    </select>
                    <input dir="ltr" value={newTraderTrade.symbol} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, symbol: e.target.value.toUpperCase() })} placeholder="BTCUSDT" className="surface-input rounded-xl px-2 py-2 font-mono" />
                    <select value={newTraderTrade.side} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, side: e.target.value as 'LONG' | 'SHORT' })} className="surface-input rounded-xl px-2 py-2">
                      <option value="LONG">LONG</option>
                      <option value="SHORT">SHORT</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <input type="number" step="any" value={newTraderTrade.entryPrice} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, entryPrice: Number(e.target.value) })} placeholder="Entry" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.stopLoss} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, stopLoss: Number(e.target.value) })} placeholder="SL" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp1} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp1: Number(e.target.value) })} placeholder="TP1" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp2} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp2: Number(e.target.value) })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="any" value={newTraderTrade.tp3} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp3: Number(e.target.value) })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    <input type="number" step="0.1" value={newTraderTrade.pnlPct} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, pnlPct: Number(e.target.value) })} placeholder="PnL%" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  </div>
                  <div className="flex flex-wrap gap-4 text-[11px] font-bold text-sub">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newTraderTrade.askConfirm} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, askConfirm: e.target.checked })} />
                      <span>{isFa ? 'ابتدا از تریدر سوال تایید بپرس' : 'Ask trader first'}</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={newTraderTrade.mirrorNow} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, mirrorNow: e.target.checked })} />
                      <span>{isFa ? 'آینه‌سازی فوری به فالوئرها' : 'Mirror immediately'}</span>
                    </label>
                  </div>
                  <button type="submit" className="w-full py-2 rounded-xl btn-emerald font-black">
                    {isFa ? 'ثبت معامله در لیست کپی‌ترید' : 'Publish Copy Trade'}
                  </button>
                </form>
              )}
                </div>
              </details>
            </div>

            {/* Online Support Inbox */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'صندوق تیکت‌های پشتیبانی آنلاین (همگام با تلگرام)' : 'Online Support Inbox (Synced with Telegram)'}</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-black">
                  {tickets.filter((t) => t.status === 'OPEN').length} {isFa ? 'باز' : 'OPEN'}
                </span>
              </div>

              {tickets.length === 0 ? (
                <p className="text-center py-8 text-dim">{isFa ? 'هنوز تیکت پشتیبانی ارسال نشده است.' : 'No support tickets yet.'}</p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {tickets.map((tk) => (
                      <button
                        key={tk.id}
                        type="button"
                        onClick={() => setActiveTicketId(tk.id)}
                        className={`w-full rounded-xl p-2.5 text-start flex items-center justify-between gap-2 transition ${
                          activeTicketId === tk.id ? 'btn-cobalt text-white' : 'surface-soft hover:bg-[var(--soft)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">{tk.username || tk.email || 'User'} · {tk.subject}</p>
                          <p className="text-[10px] opacity-75">{new Date(tk.last_message_at).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${tk.status === 'OPEN' ? 'bg-emerald-500/20 text-jade' : 'bg-[var(--soft)] border hairline text-dim'}`}>
                          {tk.status}
                        </span>
                      </button>
                    ))}
                  </div>

                  {activeTicketId && (
                    <div className="surface-soft rounded-2xl p-3 space-y-2.5 border hairline">
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {allTicketMsgs
                          .filter((m) => m.ticket_id === activeTicketId)
                          .map((m) => (
                            <div key={m.id} className={`rounded-xl p-2 ${m.sender_role === 'admin' ? 'bg-[#1652F0]/15 text-main' : 'panel'}`}>
                              <p className="text-[10px] font-black text-dim">{m.sender_role === 'admin' ? 'پشتیبانی دلارینو' : m.sender_name || 'کاربر'}</p>
                              {m.image_data_url && (
                                <button
                                  type="button"
                                  onClick={() => setAdminLightboxImg(m.image_data_url || null)}
                                  className="block my-1.5 rounded-xl overflow-hidden border hairline"
                                >
                                  <img src={m.image_data_url} alt="Support attachment" className="max-h-36 w-auto object-contain" />
                                </button>
                              )}
                              <p className="text-xs text-main mt-0.5 whitespace-pre-wrap">{m.message}</p>
                            </div>
                          ))}
                      </div>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!supReply.trim()) return;
                          await apiFetch(`/api/admin/support/${activeTicketId}/reply`, {
                            method: 'POST',
                            body: JSON.stringify({ message: supReply.trim() }),
                          });
                          setSupReply('');
                          await load();
                          setMsg(isFa ? 'پاسخ ارسال شد و به تلگرام کاربر هم مخابره گردید.' : 'Reply sent & notified on Telegram.');
                        }}
                        className="flex gap-2"
                      >
                        <input
                          value={supReply}
                          onChange={(e) => setSupReply(e.target.value)}
                          placeholder={isFa ? 'پاسخ پشتیبانی را بنویسید...' : 'Write admin reply...'}
                          className="flex-1 surface-input rounded-xl px-3 py-2 text-xs"
                        />
                        <button type="submit" className="btn-emerald px-3.5 py-2 rounded-xl font-black inline-flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ارسال' : 'Reply'}</span>
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/support/${activeTicketId}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'CLOSED' }),
                          });
                          setMsg(isFa ? 'تیکت بسته شد.' : 'Ticket closed.');
                          void load();
                        }}
                        className="text-[11px] font-bold text-loss hover:underline"
                      >
                        {isFa ? 'بستن این تیکت' : 'Close Ticket'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Official Telegram Bot Token, Webhook, 24/7 Auto-Channels & Community Group Studio */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-emerald-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <Radio className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'مرکز ربات تلگرام، توکن، وب‌هوک، کانال‌های خودکار و گروه کامیونیتی' : 'Telegram Bot, Token, Webhook, Auto-Channels & Community Group'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'ست کردن توکن ربات و وب‌هوک، ارسال ۱۰۰٪ خودکار سیگنال/اخبار ۲۴/۷، تنظیم کانال‌ها با آیدی عددی (-100...) و کنترل مبصر گروه کامیونیتی.'
                    : 'Set Bot Token & Webhook, toggle 24/7 automatic signals/news, route numeric (-100...) channel IDs, and manage Community Group moderation.'}
                </p>
              </div>
              <button
                type="button"
                disabled={checkingChannel}
                onClick={async () => {
                  setCheckingChannel(true);
                  try {
                    const res = await apiFetch<{
                      ok?: boolean;
                      channelHandle?: string;
                      status?: string;
                      canPostMessages?: boolean;
                      botUsername?: string;
                      error?: string;
                      tokenStatus?: typeof botTokenStatus;
                      webhookInfo?: typeof botWebhookInfo;
                    }>('/api/admin/telegram/channel-status');
                    if (res.tokenStatus) setBotTokenStatus(res.tokenStatus);
                    setBotWebhookInfo(res.webhookInfo ?? null);
                    setChannelCheck({
                      ok: res.ok,
                      channelHandle: res.channelHandle,
                      botStatus: res.status,
                      canPostMessages: res.canPostMessages,
                      message: res.ok
                        ? `✅ ربات @${res.botUsername || botTokenStatus.botUsername} با دسترسی کامل روی کانال/گروه فعال است (${res.status}).`
                        : res.error || 'ربات هنوز ادمین نیست یا توکن تنظیم نشده است.',
                    });
                  } catch (e) {
                    setChannelCheck({ ok: false, message: e instanceof Error ? e.message : 'Check failed' });
                  } finally {
                    setCheckingChannel(false);
                  }
                }}
                className="px-4 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{checkingChannel ? '...' : isFa ? 'بررسی ادمین ربات و وب‌هوک' : 'Check Bot Admin & Webhook'}</span>
              </button>
            </div>

            {channelCheck && (
              <div className={`rounded-2xl p-3 text-xs font-bold border ${channelCheck.canPostMessages ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35 text-loss'}`}>
                {channelCheck.message || `Status: ${channelCheck.botStatus || 'unknown'} (${channelCheck.channelHandle || '@Dollarino_official'})`}
              </div>
            )}

            {/* 1. Telegram Bot Token Setup + Auto Webhook + Live Test */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-brand" />
                  <span className="font-black text-main">
                    {isFa ? '🤖 توکن ربات تلگرام + ست خودکار وب‌هوک و تست اتصال' : '🤖 Telegram Bot Token, Auto-Webhook & Live Test'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`px-2.5 py-0.5 rounded-full font-black ${botTokenStatus.configured ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                    {botTokenStatus.configured
                      ? `@${botTokenStatus.botUsername} · ${botTokenStatus.source === 'db' ? 'ذخیره در دیتابیس' : 'کلادفلر Env'} (${botTokenStatus.masked})`
                      : (isFa ? 'توکن تنظیم نشده' : 'Not Configured')}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  dir="ltr"
                  type="password"
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  placeholder={isFa ? 'توکن جدید BotFather (مثال: 123456:ABC... — برای فقط وب‌هوک خالی بگذارید)' : 'New BotFather Token (leave empty to only re-register webhook)'}
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <input
                  dir="ltr"
                  value={botWebhookBaseInput}
                  onChange={(e) => setBotWebhookBaseInput(e.target.value)}
                  placeholder="https://your-worker.workers.dev"
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={savingBotToken}
                  onClick={async () => {
                    setSavingBotToken(true);
                    try {
                      const r = await apiFetch<{
                        ok: boolean;
                        bot?: { username: string };
                        webhookUrl?: string;
                        webhookSet?: boolean;
                        webhookNote?: string;
                        error?: string;
                      }>('/api/admin/telegram/bot-token', {
                        method: 'POST',
                        body: JSON.stringify({
                          botToken: botTokenInput.trim() || undefined,
                          webhookBaseUrl: botWebhookBaseInput.trim() || undefined,
                          webAppUrl: botWebhookBaseInput.trim() || undefined,
                        }),
                      });
                      if (r.ok) {
                        setBotTokenInput('');
                        setMsg(
                          r.webhookSet
                            ? `✅ ربات @${r.bot?.username} تایید و وب‌هوک روی ${r.webhookUrl} ست و تست شد!`
                            : `✅ توکن @${r.bot?.username} تایید و ذخیره شد! (${r.webhookNote || 'آماده اتصال HTTPS'})`
                        );
                        await load();
                      } else {
                        setMsg(r.error || 'خطا در ثبت توکن ربات');
                      }
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'خطا در تست توکن');
                    } finally {
                      setSavingBotToken(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl btn-cobalt font-black inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{savingBotToken ? '...' : isFa ? 'ذخیره توکن + ست وب‌هوک + تست ربات' : 'Save Token + Set Webhook + Test'}</span>
                </button>
                {botTokenStatus.source === 'db' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/telegram/bot-token', {
                        method: 'POST',
                        body: JSON.stringify({ clearOverride: true }),
                      });
                      setMsg(isFa ? 'توکن دیتابیس پاک شد و به توکن Env برگشت.' : 'Cleared DB token override.');
                      await load();
                    }}
                    className="btn-ghost px-3 py-2 rounded-xl font-bold text-rose-400"
                  >
                    {isFa ? 'بازگشت به توکن پیش‌فرض Env' : 'Revert to Env Token'}
                  </button>
                )}
              </div>

              {botWebhookInfo && (
                <div className="panel rounded-xl p-2.5 text-[11px] flex flex-wrap items-center justify-between gap-2 border hairline" dir="ltr">
                  <span className="font-mono text-sub truncate">Webhook: {botWebhookInfo.url || '(not set)'}</span>
                  <span className="text-dim">Pending: {botWebhookInfo.pending_update_count}</span>
                  {botWebhookInfo.last_error_message && (
                    <span className="text-loss font-bold w-full">Last Error: {botWebhookInfo.last_error_message}</span>
                  )}
                </div>
              )}
            </div>

            {/* 2. 24/7 Automatic Signals & News Publishing Card */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border border-emerald-500/25 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-jade" />
                    <span>{isFa ? 'ارسال ۱۰۰٪ خودکار شبانه‌روزی سیگنال و اخبار (Cron 24/7)' : '24/7 Automated Signals & News Engine'}</span>
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'سیگنال‌ها و اخبار نیاز به ارسال دستی ندارند؛ سیستم هر ۱۵ دقیقه بازار را اسکن و هر ۳۰ دقیقه اخبار + تحلیل را خودکار در کانال‌ها منتشر می‌کند.'
                      : 'Signals & news publish automatically every 15m/30m without manual posting.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/admin/settings', {
                      method: 'PUT',
                      body: JSON.stringify({
                        always_on_signals_enabled: autoPublishingCfg.alwaysOnSignals ? 'true' : 'false',
                        always_on_ai_broadcast_enabled: autoPublishingCfg.alwaysOnAiBroadcast ? 'true' : 'false',
                        auto_publish_signals_to_channel: autoPublishingCfg.autoPublishSignalsToChannel ? 'true' : 'false',
                      }),
                    });
                    setMsg(isFa ? 'تنظیمات ارسال خودکار ۲۴/۷ ذخیره شد ✅' : '24/7 Auto-publishing settings saved ✅');
                  }}
                  className="px-3.5 py-1.5 rounded-xl btn-emerald font-black"
                >
                  {isFa ? 'ذخیره تنظیمات خودکار' : 'Save Auto Settings'}
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="surface-card rounded-xl p-2.5 flex items-center gap-2 border hairline cursor-pointer font-bold text-[11px]">
                  <input
                    type="checkbox"
                    checked={autoPublishingCfg.alwaysOnSignals}
                    onChange={(e) => setAutoPublishingCfg((p) => ({ ...p, alwaysOnSignals: e.target.checked }))}
                  />
                  <span>{isFa ? 'اسکن و تولید خودکار سیگنال ۲۴/۷' : 'Auto Signal Radar 24/7'}</span>
                </label>
                <label className="surface-card rounded-xl p-2.5 flex items-center gap-2 border hairline cursor-pointer font-bold text-[11px]">
                  <input
                    type="checkbox"
                    checked={autoPublishingCfg.alwaysOnAiBroadcast}
                    onChange={(e) => setAutoPublishingCfg((p) => ({ ...p, alwaysOnAiBroadcast: e.target.checked }))}
                  />
                  <span>{isFa ? 'اخبار و تحلیل خودکار AI (هر ۳۰د)' : 'Auto News & AI Analysis (30m)'}</span>
                </label>
                <label className="surface-card rounded-xl p-2.5 flex items-center gap-2 border hairline cursor-pointer font-bold text-[11px]">
                  <input
                    type="checkbox"
                    checked={autoPublishingCfg.autoPublishSignalsToChannel}
                    onChange={(e) => setAutoPublishingCfg((p) => ({ ...p, autoPublishSignalsToChannel: e.target.checked }))}
                  />
                  <span>{isFa ? 'انتشار خودکار سیگنال‌ها در کانال' : 'Auto-Post Signals to Channel'}</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={runningAutoKind !== null}
                  onClick={async () => {
                    setRunningAutoKind('SIGNALS');
                    try {
                      const r = await apiFetch<{ published?: boolean; symbol?: string; reason?: string }>('/api/admin/automation/run-now', {
                        method: 'POST',
                        body: JSON.stringify({ kind: 'SIGNALS' }),
                      });
                      setMsg(r.published ? `✅ سیگنال خودکار روی ${r.symbol} منتشر شد!` : `ℹ️ بررسی انجام شد (${r.reason || 'بدون سیگنال قطعی در این کندل'}).`);
                    } finally {
                      setRunningAutoKind(null);
                    }
                  }}
                  className="btn-ghost px-3 py-1.5 rounded-xl font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <Play className="w-3 h-3 text-jade" />
                  <span>{runningAutoKind === 'SIGNALS' ? '...' : (isFa ? 'تست چرخه سیگنال خودکار الان' : 'Test Auto Signal Now')}</span>
                </button>
                <button
                  type="button"
                  disabled={runningAutoKind !== null}
                  onClick={async () => {
                    setRunningAutoKind('NEWS');
                    try {
                      const r = await apiFetch<{ published?: boolean; channelMessageId?: number }>('/api/admin/automation/run-now', {
                        method: 'POST',
                        body: JSON.stringify({ kind: 'NEWS' }),
                      });
                      setMsg(r.published ? `✅ بسته خبری خودکار در کانال منتشر شد (Msg #${r.channelMessageId || 'OK'})!` : 'خبر ارسال نشد؛ تنظیمات کانال و توکن را بررسی کنید.');
                      void load();
                    } finally {
                      setRunningAutoKind(null);
                    }
                  }}
                  className="btn-ghost px-3 py-1.5 rounded-xl font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <Newspaper className="w-3 h-3 text-amber-400" />
                  <span>{runningAutoKind === 'NEWS' ? '...' : (isFa ? 'تست انتشار خبر خودکار الان' : 'Test Auto News Now')}</span>
                </button>
              </div>
            </div>

            {/* 3. V10 5-Channel Telegram Matrix (Supports Numeric -100... IDs & @handles) */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main">
                    {isFa ? '📡 مدیریت ۵ کانال تخصصی تلگرام (با پشتیبانی کامل از آیدی عددی -100... و @username)' : '📡 5-Channel Matrix (Numeric -100... IDs & @handles)'}
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'برای کانال‌های خصوصی یا عمومی، ربات را ادمین کنید و آیدی عددی (مثلاً -1001234567890) یا @آیدی کانال را وارد و تست کنید.'
                      : 'Enter numeric -100... channel IDs (for private/reliable delivery) or @handles.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/admin/settings', {
                      method: 'PUT',
                      body: JSON.stringify({
                        official_channel: fiveChannels.signals,
                        signals_channel_id: fiveChannels.signals,
                        results_channel_id: fiveChannels.results,
                        news_channel_id: fiveChannels.news,
                        education_channel_id: fiveChannels.education,
                        alerts_channel_id: fiveChannels.alerts,
                        channel_signals_enabled: fiveChannels.enableSignals ? 'true' : 'false',
                        channel_results_enabled: fiveChannels.enableResults ? 'true' : 'false',
                        channel_news_enabled: fiveChannels.enableNews ? 'true' : 'false',
                        channel_education_enabled: fiveChannels.enableEdu ? 'true' : 'false',
                        channel_alerts_enabled: fiveChannels.enableAlerts ? 'true' : 'false',
                      }),
                    });
                    setMsg(isFa ? 'تنظیمات ۵ کانال تلگرام با موفقیت ذخیره شد ✅' : '5 Telegram channels saved ✅');
                  }}
                  className="px-4 py-1.5 rounded-xl btn-emerald font-black"
                >
                  {isFa ? 'ذخیره ۵ کانال' : 'Save 5 Channels'}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {[
                  { key: 'signals', label: isFa ? '۱. سیگنال‌های معاملاتی' : '1. Signals', val: fiveChannels.signals, onVal: (v: string) => setFiveChannels({ ...fiveChannels, signals: v }), toggle: { checked: fiveChannels.enableSignals, set: (b: boolean) => setFiveChannels({ ...fiveChannels, enableSignals: b }) } },
                  { key: 'results', label: isFa ? '۲. نتایج و کارت سود' : '2. Results', val: fiveChannels.results, onVal: (v: string) => setFiveChannels({ ...fiveChannels, results: v }), toggle: { checked: fiveChannels.enableResults, set: (b: boolean) => setFiveChannels({ ...fiveChannels, enableResults: b }) } },
                  { key: 'news', label: isFa ? '۳. اخبار و ماکرو' : '3. News', val: fiveChannels.news, onVal: (v: string) => setFiveChannels({ ...fiveChannels, news: v }), toggle: { checked: fiveChannels.enableNews, set: (b: boolean) => setFiveChannels({ ...fiveChannels, enableNews: b }) } },
                  { key: 'education', label: isFa ? '۴. آموزش مبتدی‌ها' : '4. Academy', val: fiveChannels.education, onVal: (v: string) => setFiveChannels({ ...fiveChannels, education: v }), toggle: { checked: fiveChannels.enableEdu, set: (b: boolean) => setFiveChannels({ ...fiveChannels, enableEdu: b }) } },
                  { key: 'alerts', label: isFa ? '۵. آلرت TradingView' : '5. TV Alerts', val: fiveChannels.alerts, onVal: (v: string) => setFiveChannels({ ...fiveChannels, alerts: v }), toggle: { checked: fiveChannels.enableAlerts, set: (b: boolean) => setFiveChannels({ ...fiveChannels, enableAlerts: b }) } },
                ].map((ch) => (
                  <div key={ch.key} className="surface-card rounded-xl p-2.5 space-y-1.5 border hairline">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[11px] text-main">{ch.label}</span>
                      {ch.toggle && (
                        <input
                          type="checkbox"
                          checked={ch.toggle.checked}
                          onChange={(e) => ch.toggle!.set(e.target.checked)}
                        />
                      )}
                    </div>
                    <input
                      dir="ltr"
                      value={ch.val}
                      onChange={(e) => ch.onVal(e.target.value)}
                      placeholder="-100... or @handle"
                      className="surface-input w-full rounded-lg px-2 py-1 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', {
                          method: 'POST',
                          body: JSON.stringify({ channelKey: ch.key, customTarget: ch.val }),
                        }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                        setMsg(r.ok ? `✅ تست ارسال به «${r.chatTitle || ch.val}» موفق بود!` : `❌ خطا در ${ch.val}: ${r.error}`);
                      }}
                      className="w-full py-1 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold"
                    >
                      {isFa ? 'تست ارسال پیام' : 'Test Post'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Community Group Moderator + Group AI Assistant Card */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border border-indigo-500/25 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-brand" />
                    <span>{isFa ? '👥 گروه کامیونیتی دلارینو (مبصر ضدلینک + پاسخگوی هوشمند AI)' : '👥 Community Group Moderator & AI Assistant'}</span>
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'ربات را در گروه ادمین کنید (یا Privacy Mode را در BotFather خاموش کنید). مبصر خودکار لینک و اسکم را پاک می‌کند و با منشن @Bot یا ریپلای، پاسخ می‌دهد.'
                      : 'Make bot admin in your Community Group. Auto-deletes spam/links (3 warnings = 24h mute) and answers questions via @mention or reply.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/admin/settings', {
                      method: 'PUT',
                      body: JSON.stringify({
                        community_group_id: communityGroupCfg.id.trim(),
                        community_group_invite: communityGroupCfg.invite.trim(),
                        group_antilink_enabled: communityGroupCfg.antiLink ? 'true' : 'false',
                        group_antiforward_enabled: communityGroupCfg.antiForward ? 'true' : 'false',
                        group_antiscam_enabled: communityGroupCfg.antiScam ? 'true' : 'false',
                        group_ai_assistant_enabled: communityGroupCfg.aiAssistant ? 'true' : 'false',
                        group_welcome_enabled: communityGroupCfg.welcome ? 'true' : 'false',
                      }),
                    });
                    setMsg(isFa ? 'تنظیمات گروه کامیونیتی و مبصر هوشمند ذخیره شد ✅' : 'Community group settings saved ✅');
                  }}
                  className="px-4 py-1.5 rounded-xl btn-cobalt font-black"
                >
                  {isFa ? 'ذخیره تنظیمات گروه' : 'Save Group Settings'}
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input
                  dir="ltr"
                  value={communityGroupCfg.id}
                  onChange={(e) => setCommunityGroupCfg((p) => ({ ...p, id: e.target.value }))}
                  placeholder={isFa ? 'آیدی عددی گروه (مثال: -1001234567890)' : 'Group Chat ID (-100...)'}
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <input
                  dir="ltr"
                  value={communityGroupCfg.invite}
                  onChange={(e) => setCommunityGroupCfg((p) => ({ ...p, invite: e.target.value }))}
                  placeholder={isFa ? 'لینک دعوت گروه (https://t.me/...)' : 'Community Group Invite Link'}
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', {
                      method: 'POST',
                      body: JSON.stringify({ channelKey: 'community', customTarget: communityGroupCfg.id }),
                    }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Group test failed' }));
                    setMsg(r.ok ? `✅ پیام تست در گروه «${r.chatTitle || communityGroupCfg.id}» ارسال شد!` : `❌ خطا در گروه: ${r.error}`);
                  }}
                  className="py-2 rounded-xl btn-emerald font-black"
                >
                  {isFa ? 'تست پیام در گروه کامیونیتی' : 'Test Community Group'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { key: 'antiLink' as const, label: isFa ? '🛡 ضدلینک (۳ اخطار)' : '🛡 Anti-Link' },
                  { key: 'antiForward' as const, label: isFa ? '🚫 ضدفوروارد تبلیغ' : '🚫 Anti-Forward' },
                  { key: 'antiScam' as const, label: isFa ? '🚨 ضداسکم/فیشینگ' : '🚨 Anti-Scam' },
                  { key: 'aiAssistant' as const, label: isFa ? '🤖 پاسخ AI با منشن' : '🤖 AI @Mention' },
                  { key: 'welcome' as const, label: isFa ? '👋 خوشامدگویی' : '👋 Welcome' },
                ].map((opt) => (
                  <label key={opt.key} className="surface-card rounded-xl p-2 flex items-center gap-1.5 border hairline cursor-pointer font-bold text-[11px]">
                    <input
                      type="checkbox"
                      checked={communityGroupCfg[opt.key]}
                      onChange={(e) => setCommunityGroupCfg((p) => ({ ...p, [opt.key]: e.target.checked }))}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <details className="surface-soft rounded-2xl p-4 border hairline">
              <summary className="cursor-pointer font-black text-xs text-sub hover:text-main">
                {isFa ? '+ ارسال دستی استثنایی سیگنال یا خبر (علاوه بر ارسال خودکار ۲۴/۷)' : '+ Optional Manual Signal / News Override'}
              </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs pt-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/channel/publish-signal', {
                      method: 'POST',
                      body: JSON.stringify({
                        symbol: channelSignalForm.symbol,
                        direction: channelSignalForm.direction,
                        timeframe: channelSignalForm.timeframe,
                        entryPrice: channelSignalForm.entryPrice || undefined,
                        stopLoss: channelSignalForm.stopLoss,
                        tp1: channelSignalForm.tp1,
                        tp2: channelSignalForm.tp2 || undefined,
                        tp3: channelSignalForm.tp3 || undefined,
                        leverage: channelSignalForm.leverage,
                        engineKey: channelSignalForm.engineKey,
                        note: channelSignalForm.note || undefined,
                      }),
                    });
                    setMsg(isFa ? 'سیگنال با دکمه‌های تعاملی در کانال @Dollarino_official منتشر شد.' : 'Signal published to channel.');
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Publish signal failed');
                  }
                }}
                className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline"
              >
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'ارسال سیگنال رسمی به کانال با دکمه‌های تعاملی' : 'Publish Signal to @Dollarino_official'}</span>
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <input dir="ltr" required value={channelSignalForm.symbol} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, symbol: e.target.value.toUpperCase() })} placeholder="BTCUSDT" className="surface-input rounded-xl px-2.5 py-2 font-mono" />
                  <select value={channelSignalForm.direction} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, direction: e.target.value as 'LONG' | 'SHORT' })} className="surface-input rounded-xl px-2.5 py-2">
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                  <select value={channelSignalForm.engineKey} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, engineKey: e.target.value })} className="surface-input rounded-xl px-2.5 py-2">
                    <option value="dollarino_v01">استراتژی شکار (دُرنا)</option>
                    <option value="ai_autonomous_agent">هوش مصنوعی دلارینو</option>
                    <option value="my_custom_ai">هوش مصنوعی خام</option>
                    <option value="copy_trade">کپی‌ترید تاییدشده</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <input dir="ltr" value={channelSignalForm.entryPrice} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, entryPrice: e.target.value })} placeholder="Entry (auto)" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" required value={channelSignalForm.stopLoss} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, stopLoss: e.target.value })} placeholder="SL *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" required value={channelSignalForm.tp1} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp1: e.target.value })} placeholder="TP1 *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" value={channelSignalForm.tp2} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp2: e.target.value })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input dir="ltr" value={channelSignalForm.tp3} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp3: e.target.value })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  <input type="number" min={1} max={100} value={channelSignalForm.leverage} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, leverage: Number(e.target.value) })} placeholder="Lev" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                </div>
                <input value={channelSignalForm.note} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, note: e.target.value })} placeholder={isFa ? 'توضیح تحلیلی کوتاه زیر سیگنال (اختیاری)' : 'Short note (optional)'} className="w-full surface-input rounded-xl px-2.5 py-2" />
                <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-black">
                  {isFa ? 'انتشار سیگنال در کانال @Dollarino_official' : 'Publish Signal to Channel'}
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const bodyParts = [
                      channelNewsForm.summary.trim(),
                      channelNewsForm.analysis.trim() ? `\n📊 تحلیل اثر: ${channelNewsForm.analysis.trim()}` : '',
                      channelNewsForm.symbolsText.trim() ? `\n🪙 نمادها: ${channelNewsForm.symbolsText.trim()}` : '',
                    ].filter(Boolean);
                    await apiFetch('/api/admin/channel/publish-news', {
                      method: 'POST',
                      body: JSON.stringify({
                        title: `${channelNewsForm.impact === 'HIGH' ? '🔴 ' : channelNewsForm.impact === 'MEDIUM' ? '🟡 ' : ''}${channelNewsForm.title.trim()}`,
                        category: channelNewsForm.category === 'ANALYSIS' ? 'ANALYSIS' : 'NEWS',
                        body: bodyParts.join(''),
                      }),
                    });
                    setChannelNewsForm({ ...channelNewsForm, title: '', summary: '', analysis: '' });
                    setMsg(isFa ? 'خبر و تحلیل فاندامنتال در کانال @Dollarino_official منتشر شد.' : 'News published to channel.');
                    void load();
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Publish news failed');
                  }
                }}
                className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline"
              >
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'انتشار اخبار فوری و تحلیل فاندامنتال در کانال' : 'Publish Breaking News & Fundamental Analysis'}</span>
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <input required value={channelNewsForm.title} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, title: e.target.value })} placeholder={isFa ? 'تیتر خبر یا تحلیل...' : 'Headline...'} className="col-span-2 surface-input rounded-xl px-2.5 py-2" />
                  <select value={channelNewsForm.impact} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, impact: e.target.value })} className="surface-input rounded-xl px-2 py-2">
                    <option value="HIGH">HIGH IMPACT</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">INFO</option>
                  </select>
                </div>
                <textarea required rows={2} value={channelNewsForm.summary} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, summary: e.target.value })} placeholder={isFa ? 'متن خبر یا داده‌های فاندامنتال...' : 'News summary...'} className="w-full surface-input rounded-xl p-2.5" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={channelNewsForm.analysis} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, analysis: e.target.value })} placeholder={isFa ? 'تحلیل اثر روی بازار (اختیاری)' : 'Market impact analysis'} className="surface-input rounded-xl px-2.5 py-2" />
                  <input dir="ltr" value={channelNewsForm.symbolsText} onChange={(e) => setChannelNewsForm({ ...channelNewsForm, symbolsText: e.target.value })} placeholder="BTCUSDT, ETHUSDT" className="surface-input rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl btn-gold font-black">
                  {isFa ? 'انتشار خبر فوری در کانال @Dollarino_official' : 'Broadcast News to Channel'}
                </button>
                {channelNewsList.length > 0 && (
                  <div className="text-[11px] text-dim pt-1 space-y-1 max-h-24 overflow-y-auto">
                    {channelNewsList.slice(0, 4).map((n) => (
                      <div key={n.id} className="truncate">• [{n.category}] {n.title}</div>
                    ))}
                  </div>
                )}
              </form>
            </div>
            </details>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-main">
                <Shield className="w-4 h-4 text-signal" />
                <span>{isFa ? 'ویرایش متن راهنمای ربات تلگرام' : 'Telegram Bot Help Message'}</span>
              </h3>
              <textarea rows={4} value={helpText} onChange={(e) => setHelpText(e.target.value)} className="w-full surface-input rounded-2xl p-3" />
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ help_text: helpText }) });
                  setMsg('Help message updated.');
                }}
                className="px-4 py-2 rounded-xl btn-emerald font-bold"
              >
                Save Help Text
              </button>
            </div>

            <div className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-sm flex items-center gap-2 text-main">
                  <Send className="w-4 h-4 text-flame" />
                  <span>{isFa ? 'مرکز اطلاعیه همگانی (تلگرام + وب‌اپ + زمان‌بندی)' : 'Broadcast Center (Telegram + In-App + Schedule)'}</span>
                </h3>
                <span dir="ltr" className="text-[10px] font-mono-num text-dim">
                  {broadcast.length} chars
                </span>
              </div>
              <input
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder={isFa ? 'عنوان اطلاعیه (مثلاً آپدیت نسخه ۱۰)' : 'Broadcast title'}
                className="w-full surface-input rounded-xl px-3 py-2 text-xs font-bold"
              />
              <textarea
                rows={3}
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                placeholder={isFa ? 'متن اطلاعیه یا خبر را بنویسید...' : 'Write announcement...'}
                className="w-full surface-input rounded-2xl p-3 text-xs"
              />
              <div className="grid sm:grid-cols-2 gap-2.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-sub cursor-pointer">
                    <input type="checkbox" checked={broadcastTg} onChange={(e) => setBroadcastTg(e.target.checked)} />
                    <span>{isFa ? 'ارسال به تلگرام' : 'Send to Telegram'}</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sub cursor-pointer">
                    <input type="checkbox" checked={broadcastInApp} onChange={(e) => setBroadcastInApp(e.target.checked)} />
                    <span>{isFa ? 'اعلان داخل وب‌اپ' : 'In-App Bell Alert'}</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-dim shrink-0">{isFa ? 'زمان‌بندی (اختیاری):' : 'Schedule:'}</span>
                  <input
                    type="datetime-local"
                    value={broadcastScheduledAt}
                    onChange={(e) => setBroadcastScheduledAt(e.target.value)}
                    dir="ltr"
                    className="input-field py-1 px-2 rounded-xl text-[11px] flex-1"
                  />
                </div>
              </div>
              {broadcast.trim().length > 0 && (
                <div className="surface-soft rounded-2xl p-3 border hairline space-y-1">
                  <p className="text-[10px] font-black text-dim">{isFa ? 'پیش‌نمایش اطلاعیه (تلگرام و وب‌اپ):' : 'Broadcast Preview:'}</p>
                  <p className="text-xs font-black text-main">{broadcastTitle || 'اطلاعیه دلارینو'}</p>
                  <p className="text-[11px] text-sub whitespace-pre-wrap leading-relaxed">{broadcast}</p>
                </div>
              )}
              <button
                type="button"
                disabled={!broadcast.trim() || (!broadcastTg && !broadcastInApp)}
                onClick={async () => {
                  const res = await apiFetch<{ scheduled?: boolean; sent: number; deliveredInApp?: number; scheduledAt?: string }>('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({
                      title: broadcastTitle,
                      message: broadcast,
                      deliverTelegram: broadcastTg,
                      deliverInApp: broadcastInApp,
                      scheduledAt: broadcastScheduledAt || null,
                    }),
                  });
                  setBroadcast('');
                  setBroadcastScheduledAt('');
                  await load();
                  setMsg(
                    res.scheduled
                      ? isFa
                        ? `اطلاعیه برای زمان ${res.scheduledAt} زمان‌بندی و در صف ثبت شد.`
                        : `Broadcast scheduled for ${res.scheduledAt}.`
                      : isFa
                        ? `اطلاعیه برای ${res.sent} کاربر تلگرام و ${res.deliveredInApp ?? 0} اعلان وب‌اپ ارسال شد.`
                        : `Sent to ${res.sent} Telegram & ${res.deliveredInApp ?? 0} In-App users.`
                  );
                }}
                className="px-4 py-2 rounded-xl btn-cobalt font-bold disabled:opacity-50"
              >
                {broadcastScheduledAt ? (isFa ? 'ثبت زمان‌بندی ارسال' : 'Schedule Broadcast') : (isFa ? 'ارسال فوری اطلاعیه' : 'Send Broadcast Now')}
              </button>

              {broadcastList.length > 0 && (
                <div className="pt-2 border-t hairline space-y-1.5 max-h-40 overflow-y-auto text-[11px]">
                  <p className="font-bold text-dim">{isFa ? 'تاریخچه و صف زمان‌بندی اطلاعیه‌ها:' : 'Broadcast History & Queue:'}</p>
                  {broadcastList.slice(0, 6).map((b) => (
                    <div key={b.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-black text-main truncate block">{b.title}</span>
                        <span className="text-[10px] text-dim truncate block">
                          {b.status === 'SCHEDULED' ? `⏰ ${b.scheduled_at}` : `✓ ${b.sent_count} sent`} · {b.message.slice(0, 48)}
                        </span>
                      </div>
                      {b.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/broadcasts/${b.id}`, { method: 'DELETE' });
                            await load();
                          }}
                          className="text-loss font-bold text-[10px] shrink-0"
                        >
                          {isFa ? 'لغو' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BotFather Complete Setup & Command Sync Card (Collapsible Checklist) */}
          <div className="surface-card p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-sm flex items-center gap-2 text-main">
                  <Bot className="w-4 h-4 text-[#0EA5E9]" />
                  <span>{isFa ? 'پیکربندی ربات @Dollarino_bot و BotFather' : '@Dollarino_bot & BotFather Control'}</span>
                </h3>
                <p className="text-[11px] text-sub mt-0.5">
                  {isFa
                    ? 'ثبت هم‌زمان ۱۴ دستور اسلش، دکمه منوی مینی‌اپ و وب‌هوک تلگرام'
                    : 'Sync all 14 slash commands, Mini App Menu button & webhook'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBotFatherGuide((v) => !v)}
                  className="btn-ghost px-3 py-2 rounded-xl font-bold text-[11px]"
                >
                  {showBotFatherGuide
                    ? isFa ? 'بستن راهنمای BotFather ▲' : 'Hide Guide ▲'
                    : isFa ? 'لیست دستورات و چک‌لیست ▼' : 'Commands & Checklist ▼'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ ok: boolean; webhook?: boolean; commands?: boolean; menuButton?: boolean }>(
                        '/api/webhook/telegram/setup',
                        { method: 'POST', body: JSON.stringify({}) }
                      );
                      setMsg(
                        res.ok
                          ? isFa
                            ? 'وب‌هوک، ۱۴ دستور ربات و دکمه مینی‌اپ با موفقیت روی تلگرام همگام‌سازی شدند.'
                            : 'Webhook, commands & Mini App menu synced to Telegram.'
                          : 'Setup failed'
                      );
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'Telegram setup error');
                    }
                  }}
                  className="btn-cobalt px-4 py-2 rounded-xl font-black inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isFa ? 'همگام‌سازی فوری با سرور تلگرام' : 'Sync Bot Commands & Webhook'}</span>
                </button>
              </div>
            </div>

            {showBotFatherGuide && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t hairline tab-enter">
              <div className="surface-soft rounded-2xl p-4 space-y-2 border hairline">
                <div className="flex items-center justify-between">
                  <span className="font-black text-main">{isFa ? '۱. دستورات آماده برای /setcommands در @BotFather:' : '1. /setcommands List for @BotFather:'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cmds = [
                        'start - شروع، احراز هویت و منوی اصلی دلارینو',
                        'app - باز کردن مینی‌اپ معاملاتی دلارینو',
                        'weblogin - دریافت لینک ورود فوری با یک کلیک به سایت',
                        'wizard - راه‌اندازی ۴ مرحله‌ای ربات ترید',
                        'positions - مشاهده و مدیریت معاملات باز',
                        'balance - نمایش موجودی لحظه‌ای حساب',
                        'wallet - مدیریت کیف‌پول Trust Wallet DApp',
                        'dex - رادار توکن‌های داغ DexScreener',
                        'myai - آموزش و فعال‌سازی هوش مصنوعی من',
                        'copy - کپی‌ترید تاییدشده دلارینو',
                        'card - صدور و دریافت تصویر کارت سود دلارینو',
                        'settings - تنظیمات بازار (اسپات/فیوچرز) و جهت',
                        'support - پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران',
                        'help - راهنمای کامل و امنیت حساب',
                      ].join('\n');
                      void navigator.clipboard?.writeText(cmds);
                      setMsg(isFa ? 'لیست ۱۴ دستور BotFather کپی شد.' : 'Commands copied.');
                    }}
                    className="btn-ghost px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{isFa ? 'کپی دستورات' : 'Copy'}</span>
                  </button>
                </div>
                <pre dir="ltr" className="text-[11px] font-mono-num text-sub surface-soft border hairline rounded-xl p-3 overflow-x-auto leading-relaxed">
{`start - شروع، احراز هویت و منوی اصلی دلارینو
app - باز کردن مینی‌اپ معاملاتی دلارینو
weblogin - دریافت لینک ورود فوری با یک کلیک به سایت
wizard - راه‌اندازی ۴ مرحله‌ای ربات ترید
positions - مشاهده و مدیریت معاملات باز
balance - نمایش موجودی لحظه‌ای حساب
wallet - مدیریت کیف‌پول Trust Wallet DApp
dex - رادار توکن‌های داغ DexScreener
myai - آموزش و فعال‌سازی هوش مصنوعی من
copy - کپی‌ترید تاییدشده دلارینو
card - صدور و دریافت تصویر کارت سود دلارینو
settings - تنظیمات بازار (اسپات/فیوچرز) و جهت
support - پشتیبانی هوشمند ۲۴/۷ و گفتگو با مدیران
help - راهنمای کامل و امنیت حساب`}
                </pre>
              </div>

              <div className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline leading-relaxed">
                <span className="font-black text-main block">{isFa ? '۲. چک‌لیست تنظیمات داخل @BotFather (بخش Edit Bot / Bot Settings):' : '2. @BotFather Checklist (Bot Settings):'}</span>
                <ul className="space-y-1.5 text-[11px] text-sub">
                  <li>
                    <strong className="text-main">• Mini Apps (/newapp &amp; Menu Button):</strong>{' '}
                    {isFa ? 'آدرس وب‌اپ را روی دامنه اصلی (https://dollarino.pages.dev) ثبت کنید؛ دکمه بالای منو با دکمه «همگام‌سازی فوری» خودکار ست می‌شود.' : 'Register your Mini App URL and Menu Button.'}
                  </li>
                  <li>
                    <strong className="text-main">• Domain / Login Widget (/setdomain):</strong>{' '}
                    {isFa ? 'دامنه سایت را با /setdomain در BotFather ثبت کنید تا ورود رسمی Login Widget (در صورت نیاز) بدون خطای دامنه کار کند.' : 'Bind domain via /setdomain for Telegram Login Widget.'}
                  </li>
                  <li>
                    <strong className="text-main">• Group Privacy &amp; Allow Groups:</strong>{' '}
                    {isFa ? 'اگر ربات قرار است در گروه سیگنال یا پشتیبانی پاسخ دهد، Group Privacy را روی Disable بگذارید و ربات را ادمین کانال رسمی کنید.' : 'Disable Group Privacy if bot moderates groups; promote bot as Channel Admin for signal publishing.'}
                  </li>
                  <li>
                    <strong className="text-main">• Payments &amp; Affiliate Program:</strong>{' '}
                    {isFa ? 'پرداخت‌های ریالی/ارزی اشتراک از طریق Trust Wallet BEP20/TRC20 داخل ربات فعال است؛ در صورت تمایل به دریافت Telegram Stars، بخش Payments را در BotFather وصل کنید.' : 'Trust Wallet BEP20/TRC20 checkout is built-in; optionally link Payments for Telegram Stars.'}
                  </li>
                  <li>
                    <strong className="text-main">• About / Description / Botpic:</strong>{' '}
                    {isFa ? 'متن معرفی و لوگوی رسمی دلارینو را در Edit Bot تکمیل کنید تا صفحه اول ربات قبل از زدن Start حرفه‌ای دیده شود.' : 'Set About, Description, and Botpic in @BotFather -> Edit Bot.'}
                  </li>
                </ul>
              </div>
            </div>
            )}
          </div>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'dex_logs') && (
            <div className="space-y-5 tab-enter">
              <div className="surface-card p-5 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-black text-sm text-main inline-flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-brand" />
                      <span>
                        {isFa
                          ? 'مدیریت APIهای آن‌چین، اسکنرهای ضدراگ و تجمیع‌کننده‌های DEX'
                          : 'On-Chain Indexers, Rug Scanners & DEX Aggregator APIs'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-dim mt-0.5">
                      {isFa
                        ? 'سرویس‌های رایگان همیشه فعال هستند. با افزودن کلید Moralis، Birdeye، Helius، GoPlus و 1inch رصد نهنگ‌ها و سوآپ خودکار قدرت دوچندان می‌گیرد.'
                        : 'Free keyless providers are active out of the box. Add Moralis, Birdeye, Helius, GoPlus, or 1inch keys (AES-256 encrypted) for deep Smart Money tracking.'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full surface-soft font-bold text-jade">
                    {onchainApis.filter((p) => p.is_active).length} / {onchainApis.length} {isFa ? 'فعال' : 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {onchainApis.map((prov) => {
                    const busy = onchainBusy === prov.provider;
                    const inputVal = onchainInputs[prov.provider] ?? '';
                    return (
                      <div key={prov.provider} className="surface-soft rounded-2xl p-3.5 space-y-2.5 border border-[var(--border)]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-black text-main flex items-center gap-1.5">
                              <span>{prov.label}</span>
                              <span className="px-1.5 py-0.5 rounded surface-soft border hairline text-[9px] text-dim font-mono-num">
                                {prov.category}
                              </span>
                            </div>
                            <div className="text-[10px] text-dim font-mono-num mt-0.5" dir="ltr">
                              {prov.base_url}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              prov.is_active
                                ? 'bg-emerald-500/15 text-jade'
                                : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            {prov.requires_key === 0
                              ? isFa
                                ? 'رایگان فعال'
                                : 'Free Ready'
                              : prov.api_key_masked
                                ? isFa
                                  ? 'کلید ثبت‌شده'
                                  : 'Configured'
                                : isFa
                                  ? 'نیازمند کلید'
                                  : 'Key Needed'}
                          </span>
                        </div>

                        {prov.api_key_masked && (
                          <div className="text-[10px] font-mono-num text-sub" dir="ltr">
                            Key: {prov.api_key_masked} · Calls: {prov.calls_today}
                          </div>
                        )}

                        {prov.last_error && (
                          <div className="text-[10px] text-loss">{prov.last_error}</div>
                        )}
                        {prov.last_test_ok === 1 && !prov.last_error && (
                          <div className="text-[10px] text-jade">
                            {isFa ? '✓ آخرین تست اتصال موفق بود' : '✓ Last health check passed'}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5">
                          {prov.requires_key === 1 && (
                            <>
                              <input
                                type="password"
                                dir="ltr"
                                value={inputVal}
                                onChange={(e) =>
                                  setOnchainInputs((prev) => ({ ...prev, [prov.provider]: e.target.value }))
                                }
                                placeholder={`${prov.provider.toUpperCase()} API Key...`}
                                className="input-field flex-1 min-w-[140px] py-1.5 text-[11px] font-mono-num"
                              />
                              <button
                                type="button"
                                disabled={busy || !inputVal.trim()}
                                onClick={async () => {
                                  setOnchainBusy(prov.provider);
                                  try {
                                    const res = await apiFetch<{ providers: OnchainApiProviderItem[] }>(
                                      '/api/admin/onchain-apis',
                                      {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          provider: prov.provider,
                                          apiKey: inputVal.trim(),
                                          isActive: true,
                                        }),
                                      }
                                    );
                                    setOnchainApis(res.providers || []);
                                    setOnchainInputs((prev) => ({ ...prev, [prov.provider]: '' }));
                                    setMsg(isFa ? `کلید ${prov.label} با رمزنگاری AES-256 ذخیره شد.` : `Saved ${prov.label} key.`);
                                  } catch (err) {
                                    setMsg(err instanceof Error ? err.message : 'Save failed');
                                  } finally {
                                    setOnchainBusy(null);
                                  }
                                }}
                                className="btn-cobalt px-2.5 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-40"
                              >
                                {isFa ? 'ذخیره' : 'Save'}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setOnchainBusy(prov.provider);
                              try {
                                const res = await apiFetch<{
                                  ok: boolean;
                                  message: string;
                                  providers: OnchainApiProviderItem[];
                                }>(`/api/admin/onchain-apis/${prov.provider}/test`, { method: 'POST' });
                                setOnchainApis(res.providers || []);
                                setMsg(`${prov.label}: ${res.message}`);
                              } catch (err) {
                                setMsg(err instanceof Error ? err.message : 'Test failed');
                              } finally {
                                setOnchainBusy(null);
                              }
                            }}
                            className="surface-card px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:text-brand inline-flex items-center gap-1"
                          >
                            <Zap className="w-3 h-3" />
                            <span>{busy ? '...' : isFa ? 'تست زنده' : 'Test'}</span>
                          </button>
                          {prov.requires_key === 1 && prov.api_key_masked && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setOnchainBusy(prov.provider);
                                try {
                                  const res = await apiFetch<{ providers: OnchainApiProviderItem[] }>(
                                    `/api/admin/onchain-apis/${prov.provider}`,
                                    { method: 'DELETE' }
                                  );
                                  setOnchainApis(res.providers || []);
                                  setMsg(isFa ? `کلید ${prov.label} حذف شد.` : `Removed ${prov.label} key.`);
                                } finally {
                                  setOnchainBusy(null);
                                }
                              }}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-loss hover:bg-rose-500/10"
                              title="حذف کلید"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="surface-card p-5 space-y-3 overflow-x-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>{isFa ? 'معاملات غیرمتمرکز DEX و Trust Wallet کاربران' : 'User DEX & Trust Wallet Trades'}</span>
                  </h3>
                  <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{dexTrades.length}</span>
                </div>
                {dexTrades.length === 0 ? (
                  <p className="text-dim py-4 text-center">{isFa ? 'هنوز معامله DEX ثبت نشده است.' : 'No DEX trades logged yet.'}</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="text-dim border-b">
                      <tr>
                        <th className="py-2 text-start">User</th>
                        <th className="py-2 text-start">Token / Chain</th>
                        <th className="py-2 text-start">Side / Amount</th>
                        <th className="py-2 text-end">PnL / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dexTrades.slice(0, 25).map((dt) => (
                        <tr key={dt.id}>
                          <td className="py-2 font-semibold text-main">{dt.username || dt.email || dt.user_id}</td>
                          <td className="py-2 font-mono-num" dir="ltr">
                            <span className="font-bold text-main">{dt.token_symbol}</span>{' '}
                            <span className="text-dim">({dt.chain_id})</span>
                          </td>
                          <td className="py-2 font-mono-num" dir="ltr">
                            {dt.side} · ${Number(dt.amount_usd || 0).toFixed(2)}
                          </td>
                          <td className="py-2 text-end font-mono-num">
                            <span className={Number(dt.pnl_usd || 0) >= 0 ? 'text-jade' : 'text-loss'}>
                              ${Number(dt.pnl_usd || 0).toFixed(2)}
                            </span>{' '}
                            <span className="text-dim">({dt.status})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="surface-card p-5 space-y-3 overflow-x-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'لاگ‌های حسابرسی و امنیت سیستم (Audit Logs)' : 'System & Security Audit Logs'}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full surface-soft text-[10px] font-black">{auditLogs.length}</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {auditLogs.slice(0, 40).map((lg) => (
                    <div key={lg.id} className="surface-soft rounded-xl p-2.5 flex items-start justify-between gap-2 text-[11px]">
                      <div className="min-w-0">
                        <span className="font-black text-brand">[{lg.category}]</span>{' '}
                        <span className="text-main">{lg.message}</span>
                        {(lg.username || lg.email) && (
                          <div className="text-[10px] text-dim">{lg.username || lg.email}</div>
                        )}
                      </div>
                      <span dir="ltr" className="text-[10px] font-mono-num text-dim shrink-0">
                        {lg.created_at?.slice(5, 16)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          )}
        </>
      )}
      {adminLightboxImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setAdminLightboxImg(null)}
        >
          <button
            type="button"
            onClick={() => setAdminLightboxImg(null)}
            className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/15 text-white grid place-items-center"
          >
            <XCircle className="w-5 h-5" />
          </button>
          <img
            src={adminLightboxImg}
            alt="Admin receipt or screenshot preview"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
