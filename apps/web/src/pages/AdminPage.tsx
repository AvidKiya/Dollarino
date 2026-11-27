import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
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
  Database,
  DollarSign,
  Download,
  Eye,
  Flame,
  Gift,
  Globe,
  HardDrive,
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
  Power,
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
import { formatDollarinoSignal } from '@dollarino/core';
import { TpSlModeSwitch } from '../components/TpSlModeSwitch';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import { calcPctFromPrice, calcPriceFromPct, formatLevelPrice, type TpSlInputMode } from '../lib/tpsl';
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
  anthropic: ['coding-router-preview', 'claude-sonnet-4-5', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'],
  openai: ['gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.0-flash'],
  openai_compatible: [
    'coding-router-preview',
    'baidu/deepseek-v4.1-flash-1017',
    'deepseek/deepseek-v3.2',
    'deepseek/deepseek-chat',
    'qwen/qwen-2.5-72b-instruct',
  ],
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
    fee_credit_usd?: number;
    accruedFeeUsd?: number;
    totalFeeUsd?: number;
    profitableLiveCount?: number;
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

  const [payCfg, setPayCfg] = useState({
    usdtTrc20Wallet: '',
    iranCardNumber: '',
    iranCardHolder: '',
    telegramSupport: '',
  });

  const [adminSection, setAdminSection] = useState<
    'menu' | 'overview' | 'site_controls' | 'banners' | 'founder' | 'users' | 'payments' | 'ops' | 'dex_logs' | 'database' | 'all'
  >('menu');
  const [publishSignalsToChannels, setPublishSignalsToChannels] = useState(true);
  const [publishSignalsToBotUsers, setPublishSignalsToBotUsers] = useState(true);
  const [signalCtrlBusy, setSignalCtrlBusy] = useState(false);

  const [dbStats, setDbStats] = useState<{
    isOwner: boolean;
    tableCount: number;
    indexCount: number;
    totalRows: number;
    sizeBytes: number;
    sizeKb: number;
    tables: Array<{ table: string; rows: number }>;
  } | null>(null);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbExcludeSecrets, setDbExcludeSecrets] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{
    format?: string;
    version?: string;
    exportedAt?: string;
    totalRows?: number;
    tableCount?: number;
    raw: Record<string, unknown>;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [wipeMode, setWipeMode] = useState<'OPERATIONAL_RESET' | 'FULL_FACTORY_WIPE'>('OPERATIONAL_RESET');
  const [wipePreserveOwner, setWipePreserveOwner] = useState(true);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
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
    channel: '',
    channelUrl: '',
    instagram: '@avid_kiya',
    instagramUrl: 'https://instagram.com/avid_kiya',
    twitter: '@avid_kiya',
    twitterUrl: 'https://x.com/avid_kiya',
    github: '',
    website: '',
    verificationId: '',
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
  const [requirePhoneKyc, setRequirePhoneKyc] = useState(false);
  const [authCfg, setAuthCfg] = useState({
    ownerTelegramId: '',
    passwordLoginEnabled: true,
    publicSignupEnabled: false,
    walletAuthEnabled: false,
    telegramAuthEnabled: false,
    googleAuthEnabled: false,
    telegramOnlySignup: false,
    saving: false,
  });
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
  const [ecosystemChannels, setEcosystemChannels] = useState({
    official: '',
    officialInvite: '',
    enableOfficial: true,
    signals: '',
    signalsInvite: '',
    enableSignals: true,
    signalsAlsoOfficial: false,
    results: '',
    resultsInvite: '',
    enableResults: true,
    logs: '',
    enableLogs: true,
    database: '',
    enableDatabase: true,
    databaseReportIntervalHours: 6,
    transactions: '',
    enableTransactions: true,
    news: '',
    newsInvite: '',
    enableNews: true,
    education: '',
    alerts: '',
    enableEdu: true,
    enableAlerts: true,
  });
  const [savingEcosystem, setSavingEcosystem] = useState(false);
  const [verifyingAllChannels, setVerifyingAllChannels] = useState(false);
  const [verifyAllResults, setVerifyAllResults] = useState<Array<{
    key: string;
    label: string;
    target: string;
    configured: boolean;
    ok: boolean;
    chatTitle?: string;
    memberStatus?: string;
    error?: string;
  }> | null>(null);
  const [officialPostForm, setOfficialPostForm] = useState({
    kind: 'PROJECT_UPDATE' as 'PROJECT_UPDATE' | 'ANNOUNCEMENT' | 'PROMO' | 'LOTTERY' | 'ADVICE',
    title: '',
    body: '',
    buttonLabel: '',
    buttonUrl: '',
    notifyBotUsers: false,
  });
  const [publishingOfficial, setPublishingOfficial] = useState(false);
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
  const [channelTpSlMode, setChannelTpSlMode] = useState<TpSlInputMode>('PRICE');
  const [channelTpSlPcts, setChannelTpSlPcts] = useState({ stopLoss: '1.5', tp1: '2.5', tp2: '5', tp3: '8' });
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
  const [discoveringAi, setDiscoveringAi] = useState(false);
  const [discoveredAiModels, setDiscoveredAiModels] = useState<Array<{ id: string; supportsVision?: boolean }>>([]);
  const [hilinkupSecretReady, setHilinkupSecretReady] = useState(false);
  const [arenaSecretReady, setArenaSecretReady] = useState(false);
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
  }>({ configured: false, source: 'none', masked: '', botUsername: '' });
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
  const [traderTpSlMode, setTraderTpSlMode] = useState<TpSlInputMode>('PRICE');
  const [traderTpSlPcts, setTraderTpSlPcts] = useState({ stopLoss: '1.96', tp1: '3.48', tp2: '5.22', tp3: '7.07' });

  // Online Support Admin State
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [allTicketMsgs, setAllTicketMsgs] = useState<AdminSupportMessage[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [supReply, setSupReply] = useState('');

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
      ownerTelegramIdConfigured?: boolean;
      telegramBotConfigured: boolean;
      aiEngineConfigured: boolean;
      feeReceiverWalletConfigured: boolean;
      googleOauthConfigured?: boolean;
      allowLiveTrading: boolean;
      publicWebUrl: string;
    };
  } | null>(null);
  const [googleOauthForm, setGoogleOauthForm] = useState({
    clientId: '',
    clientSecret: '',
    hasSecretSaved: false,
    configured: false,
    saving: false,
    testing: false,
    copiedUri: false,
  });
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
  const [treasurySummary, setTreasurySummary] = useState<{
    bankMode: string;
    mnemonicConfigured: boolean;
    mnemonicHint: string;
    minDepositUsd: number;
    receivers: { evm: string; tron: string; solana: string; ton: string };
    totals: {
      confirmedDepositsUsd: number;
      confirmedTopupsUsd: number;
      confirmedFeeSettlementsUsd: number;
      pendingDepositsUsd: number;
      pendingCount: number;
      profitFeesCollectedUsd: number;
      profitFeesAccruedUsd: number;
      freeTrialTradesCount: number;
      referralCreditsUsd: number;
    };
    deposits: Array<{
      id: string;
      username?: string;
      email?: string;
      category: string;
      asset: string;
      network: string;
      amount_usd: number;
      tx_hash: string;
      status: string;
      created_at: string;
    }>;
  } | null>(null);
  const [treasuryMnemonicInput, setTreasuryMnemonicInput] = useState('');
  const [treasuryReceiversForm, setTreasuryReceiversForm] = useState({
    evm: '',
    tron: '',
    solana: '',
    ton: '',
    minDepositUsd: '10',
  });
  const [treasuryBusy, setTreasuryBusy] = useState(false);
  const [feeReport, setFeeReport] = useState<{
    totals: {
      totalUsersWithFeeActivity: number;
      totalAccruedDebtUsd: number;
      totalPendingVerifyUsd: number;
      totalPenaltyUsd: number;
      totalPrepaidCreditUsd: number;
      totalSettledUsd: number;
      lockedUsersCount: number;
      warningUsersCount: number;
    };
    users: Array<{
      user_id: string;
      username: string;
      email: string;
      role: string;
      prepaid_credit_usd: number;
      penalty_usd: number;
      lock_status: string;
      accrued_usd: number;
      pending_verify_usd: number;
      settled_usd: number;
      free_trials_used: number;
      profitable_pnl_usd: number;
    }>;
    ledgerEntries: Array<{
      id: string;
      user_id: string;
      username?: string;
      email?: string;
      source: string;
      symbol?: string;
      realized_pnl_usd: number;
      fee_usd: number;
      status: string;
      tx_hash: string | null;
      note: string | null;
      created_at: string;
    }>;
  } | null>(null);
  const [feeReconcileBusy, setFeeReconcileBusy] = useState(false);
  const [siteMaintenanceForm, setSiteMaintenanceForm] = useState({
    enabled: false,
    titleFa: 'سایت در حال بروزرسانی فنی است',
    titleEn: 'Scheduled Platform Maintenance',
    messageFa: 'پلتفرم دلارینو موقتاً برای ارتقای هسته و بهینه‌سازی زیرساخت برای کاربران بسته شده است. لطفاً ساعاتی دیگر مجدداً تلاش فرمایید.',
    messageEn: 'Dollarino is temporarily closed for maintenance and infrastructure upgrades. Please check back shortly.',
    eta: '',
    updatedAt: null as string | null,
  });
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [adminPopups, setAdminPopups] = useState<
    Array<{
      id: string;
      title_fa: string;
      title_en: string | null;
      body_fa: string;
      body_en: string | null;
      severity: string;
      target_scope: string;
      target_user_id: string | null;
      target_username?: string | null;
      cta_label_fa: string | null;
      cta_route: string | null;
      dismissible: number;
      is_active: number;
      ack_count?: number;
      expires_at: string | null;
      created_at: string;
    }>
  >([]);
  const [popupForm, setPopupForm] = useState({
    titleFa: '',
    titleEn: '',
    bodyFa: '',
    bodyEn: '',
    severity: 'INFO',
    targetUserId: '',
    ctaLabelFa: '',
    ctaRoute: '',
    dismissible: true,
    expiresAt: '',
  });
  const [popupBusy, setPopupBusy] = useState(false);
  const [adminProfitCards, setAdminProfitCards] = useState<
    Array<{
      id: string;
      user_id: string;
      username: string | null;
      email: string | null;
      mode: string;
      period: string;
      trade_source: string | null;
      trades_count: number;
      win_rate: number;
      net_pnl_usd: number;
      roi_pct: number;
      strategy_name: string;
      signal_name: string | null;
      revoked: number;
      issued_at: string;
    }>
  >([]);
  const [adminActiveBots, setAdminActiveBots] = useState<
    Array<{
      user_id: string;
      username: string;
      email: string;
      bot_state: string;
      trading_mode: string;
      trade_execution_mode: string | null;
      active_engines_json: string | null;
      strategy_key: string;
      leverage: number;
      paper_balance: string;
      display_currency: string | null;
      notifications_enabled: number;
      updated_at: string;
    }>
  >([]);
  const [cardRevokeBusy, setCardRevokeBusy] = useState<string | null>(null);
  const [botStopBusy, setBotStopBusy] = useState<string | null>(null);
  const [adminTvWebhookUrl, setAdminTvWebhookUrl] = useState('');
  const [adminTvCopied, setAdminTvCopied] = useState(false);
  const [adminTvChannel, setAdminTvChannel] = useState('');
  const [adminTvRawSig, setAdminTvRawSig] = useState(() =>
    formatDollarinoSignal({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      timeframe: '15m',
      price: '62000',
      stopLoss: '60500',
      leverage: 10,
      tp1: '63500',
      tp2: '65000',
      tp3: '66500',
    })
  );

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const [ov, maintenanceRes, popupsRes] = await Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<{ ok?: boolean; maintenance?: typeof siteMaintenanceForm }>('/api/admin/site-maintenance').catch(() => null),
      apiFetch<{ ok?: boolean; popups?: typeof adminPopups }>('/api/admin/popups').catch(() => ({ popups: [] })),
    ]);

    if (maintenanceRes?.maintenance) setSiteMaintenanceForm(maintenanceRes.maintenance);
    setAdminPopups(popupsRes?.popups || []);
    if (ov.settings.signals_channel_id || ov.settings.official_channel) {
      setAdminTvChannel(ov.settings.signals_channel_id || ov.settings.official_channel || '');
    }
    setData(ov);
    setRequirePhoneKyc(ov.settings.require_telegram_phone_kyc === 'true');
    setAuthCfg({
      ownerTelegramId: ov.settings.owner_telegram_id || '',
      passwordLoginEnabled: (ov.settings.auth_password_login_enabled ?? 'true') !== 'false',
      publicSignupEnabled: ov.settings.auth_public_signup_enabled === 'true',
      walletAuthEnabled: ov.settings.auth_wallet_enabled === 'true',
      telegramAuthEnabled: ov.settings.auth_telegram_enabled === 'true',
      googleAuthEnabled: ov.settings.auth_google_enabled === 'true',
      telegramOnlySignup: ov.settings.telegram_only_signup === 'true',
      saving: false,
    });
    setTrustReceivers({
      evm: ov.settings.trust_wallet_evm_receiver || '',
      sol: ov.settings.trust_wallet_sol_receiver || '',
      ton: ov.settings.trust_wallet_ton_receiver || '',
    });
    setEcosystemChannels({
      official: ov.settings.official_channel || '',
      officialInvite: ov.settings.official_channel_invite || '',
      enableOfficial: ov.settings.channel_official_enabled !== 'false',
      signals: ov.settings.signals_channel_id || '',
      signalsInvite: ov.settings.signals_channel_invite || '',
      enableSignals: ov.settings.channel_signals_enabled !== 'false',
      signalsAlsoOfficial: ov.settings.signals_also_official === 'true',
      results: ov.settings.results_channel_id || '',
      resultsInvite: ov.settings.results_channel_invite || '',
      enableResults: ov.settings.channel_results_enabled !== 'false',
      logs: ov.settings.logs_channel_id || '',
      enableLogs: ov.settings.channel_logs_enabled !== 'false',
      database: ov.settings.database_channel_id || '',
      enableDatabase: ov.settings.channel_database_enabled !== 'false',
      databaseReportIntervalHours: Number(ov.settings.database_report_interval_hours || 6) || 6,
      transactions: ov.settings.transactions_channel_id || '',
      enableTransactions: ov.settings.channel_transactions_enabled !== 'false',
      news: ov.settings.news_channel_id || '',
      newsInvite: ov.settings.news_channel_invite || '',
      enableNews: ov.settings.channel_news_enabled !== 'false',
      education: ov.settings.education_channel_id || '',
      alerts: ov.settings.alerts_channel_id || '',
      enableEdu: ov.settings.channel_education_enabled !== 'false',
      enableAlerts: ov.settings.channel_alerts_enabled !== 'false',
    });
    setAutoPublishingCfg({
      alwaysOnSignals: (ov.settings.always_on_signals_enabled ?? 'true') !== 'false',
      alwaysOnAiBroadcast: (ov.settings.always_on_ai_broadcast_enabled ?? 'true') !== 'false',
      autoPublishSignalsToChannel: (ov.settings.auto_publish_signals_to_channel ?? 'true') !== 'false',
    });
    setPublishSignalsToChannels((ov.settings.publish_signals_to_channels ?? ov.settings.auto_publish_signals_to_channel ?? 'true') !== 'false');
    setPublishSignalsToBotUsers((ov.settings.publish_signals_to_bot_users ?? 'true') !== 'false');
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
    setHelpText((ov.settings.help_text || '').replace(/\\n/g, '\n'));

    const [ordRes, subMe, aiRes, ctRes, topTrRes, chStatusRes, supRes, newsRes, dexRes, logRes, refAdminRes, onchainRes, bannersRes, healthRes, broadcastsRes, feeAdminRes, founderRes, treasuryRes, tvRes, cardsAdminRes, botsAdminRes, feeReportRes, authProviders] = await Promise.all([
      apiFetch<{ orders: SubOrder[] }>('/api/subscriptions/admin/orders').catch(() => ({ orders: [] })),
      apiFetch<{ paymentConfig: Record<string, string> }>('/api/subscriptions/me').catch(() => null),
      apiFetch<{
        engines: PlatformAIEngine[];
        consensusMode: string;
        cacheTtlSec: number;
        latestSignals: PlatformAISignal[];
        hilinkupSecretConfigured?: boolean;
        arenaSecretConfigured?: boolean;
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
      apiFetch<{ ok?: boolean } & NonNullable<typeof treasurySummary>>('/api/admin/treasury').catch(() => null),
      apiFetch<{ webhookUrl?: string | null }>('/api/webhook/alerts').catch(() => null),
      apiFetch<{ cards: typeof adminProfitCards }>('/api/admin/profit-cards').catch(() => ({ cards: [] })),
      apiFetch<{ bots: typeof adminActiveBots }>('/api/admin/active-bots').catch(() => ({ bots: [] })),
      apiFetch<NonNullable<typeof feeReport>>('/api/admin/fee-report').catch(() => null),
      apiFetch<{ googleConfigured?: boolean; googleClientId?: string | null }>('/api/auth/providers').catch(() => null),
    ]);
    if (feeReportRes?.totals) setFeeReport(feeReportRes);
    setAdminProfitCards(cardsAdminRes?.cards || []);
    setAdminActiveBots(botsAdminRes?.bots || []);
    if (tvRes?.webhookUrl) {
      setAdminTvWebhookUrl(tvRes.webhookUrl);
    }
    if (treasuryRes) {
      setTreasurySummary(treasuryRes);
      setTreasuryReceiversForm({
        evm: treasuryRes.receivers?.evm || '',
        tron: treasuryRes.receivers?.tron || '',
        solana: treasuryRes.receivers?.solana || '',
        ton: treasuryRes.receivers?.ton || '',
        minDepositUsd: String(treasuryRes.minDepositUsd ?? 10),
      });
    }
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
    setOrders(ordRes.orders);
    setChannelNewsList(newsRes.news || []);
    setDexTrades(dexRes.trades || []);
    setAuditLogs(logRes.logs || []);
    setAdminReferrals(refAdminRes.referrals || []);
    setRefWithdrawals(refAdminRes.withdrawals || []);
    setSiteTopTraders(topTrRes.candidates || []);
    if (topTrRes.autoConfig) {
      setSiteTraderAutoCfg(topTrRes.autoConfig);
    }
    if (chStatusRes) {
      if (chStatusRes.tokenStatus) setBotTokenStatus(chStatusRes.tokenStatus);
      setBotWebhookInfo(chStatusRes.webhookInfo ?? null);
      if (chStatusRes.automation) setAutoPublishingCfg(chStatusRes.automation);
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
    setGoogleOauthForm((prev) => ({
      ...prev,
      clientId: authProviders?.googleClientId || ov.settings.google_client_id || '',
      hasSecretSaved: ov.settings.google_client_secret === '********',
      configured: Boolean(authProviders?.googleConfigured ?? healthRes?.health?.productionChecks?.googleOauthConfigured),
      clientSecret: '',
    }));
    if (aiRes) {
      setAiEngines(aiRes.engines || []);
      setConsensusMode(aiRes.consensusMode || 'ENSEMBLE_AUTO');
      setCacheTtlSec(aiRes.cacheTtlSec || 180);
      setAiSignals(aiRes.latestSignals || []);
      setHilinkupSecretReady(Boolean(aiRes.hilinkupSecretConfigured));
      setArenaSecretReady(Boolean(aiRes.arenaSecretConfigured));
    }

    if (subMe) {
      setPayCfg({
        usdtTrc20Wallet: subMe.paymentConfig.usdt_trc20_wallet || '',
        iranCardNumber: subMe.paymentConfig.iran_card_number || '',
        iranCardHolder: subMe.paymentConfig.iran_card_holder || '',
        telegramSupport:
          subMe.paymentConfig.telegram_support && !/Dollarino_admin|Dollarinoofficial/i.test(subMe.paymentConfig.telegram_support)
            ? subMe.paymentConfig.telegram_support
            : '',
      });
    }
  };

  const saveAuthProviders = async () => {
    const cleanOwnerTg = authCfg.ownerTelegramId.trim();
    if (cleanOwnerTg && !/^\d{5,16}$/.test(cleanOwnerTg)) {
      setMsg(isFa ? 'آیدی عددی تلگرام مالک باید ۵ تا ۱۶ رقم باشد.' : 'Owner Telegram numeric ID must be 5–16 digits.');
      return;
    }
    setAuthCfg((p) => ({ ...p, saving: true }));
    setMsg(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          owner_telegram_id: cleanOwnerTg,
          auth_password_login_enabled: authCfg.passwordLoginEnabled ? 'true' : 'false',
          auth_public_signup_enabled: authCfg.publicSignupEnabled ? 'true' : 'false',
          auth_wallet_enabled: authCfg.walletAuthEnabled ? 'true' : 'false',
          auth_telegram_enabled: authCfg.telegramAuthEnabled ? 'true' : 'false',
          auth_google_enabled: authCfg.googleAuthEnabled ? 'true' : 'false',
          telegram_only_signup: authCfg.telegramOnlySignup ? 'true' : 'false',
          require_telegram_phone_kyc: requirePhoneKyc ? 'true' : 'false',
        }),
      });
      setMsg(
        isFa
          ? 'تنظیمات روش‌های ورود کاربران و آیدی تلگرام مالک ذخیره شد ✅'
          : 'User authentication methods & owner Telegram ID saved ✅'
      );
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save auth provider settings');
    } finally {
      setAuthCfg((p) => ({ ...p, saving: false }));
    }
  };

  const renderAuthProvidersCard = () => (
    <div className="surface-card rounded-3xl p-4 sm:p-5 space-y-4 border border-amber-500/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand" />
            <span>{isFa ? 'کنترل روش‌های ورود کاربران و شناسه مالک تلگرام' : 'User Authentication Methods & Owner Telegram ID'}</span>
          </h3>
          <p className="text-xs text-sub mt-1">
            {isFa
              ? 'در حالت پیش‌فرض و خام سایت، تمامی روش‌های ثبت‌نام/ورود عمومی کاربران خاموش هستند؛ هر روشی را که پس از تنظیم می‌خواهید برای کاربران فعال کنید، از اینجا روشن نمایید.'
              : 'On a clean setup all public user login/signup methods start disabled. Configure integrations and enable each method below.'}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-[11px] font-black border bg-emerald-500/10 border-emerald-500/30 text-jade">
          {[authCfg.publicSignupEnabled, authCfg.walletAuthEnabled, authCfg.telegramAuthEnabled, authCfg.googleAuthEnabled].filter(Boolean).length}{' '}
          {isFa ? 'روش عمومی فعال' : 'Public Active'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="surface-soft rounded-2xl p-3 border hairline space-y-1.5">
          <label className="text-[11px] font-bold text-dim block">
            {isFa ? 'آیدی عددی تلگرام مالک اصلی (Owner Telegram ID):' : 'Owner Telegram Numeric ID:'}
          </label>
          <input
            dir="ltr"
            value={authCfg.ownerTelegramId}
            onChange={(e) => setAuthCfg((p) => ({ ...p, ownerTelegramId: e.target.value.replace(/\D/g, '') }))}
            placeholder={isFa ? 'خالی — مثال: 123456789 (از @userinfobot)' : 'Blank — e.g. 123456789'}
            className="field py-2 text-xs font-mono-num"
          />
          <p className="text-[10px] text-dim">
            {isFa
              ? 'با ثبت آیدی عددی، ربات تلگرام هنگام پیام‌دادن، دسترسی سوپر‌ادمین را به این شناسه متصل می‌کند.'
              : 'Grants super-admin Telegram bot privileges to this numeric Telegram ID.'}
          </p>
        </div>

        <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
          <div className="text-[11px] font-bold text-dim">
            {isFa ? 'وضعیت فعال‌سازی روش‌های ورود و ثبت‌نام کاربران:' : 'Public Login & Registration Toggles:'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                key: 'publicSignupEnabled' as const,
                label: isFa ? 'ثبت‌نام مستقیم با ایمیل' : 'Direct Email Signup',
                val: authCfg.publicSignupEnabled,
              },
              {
                key: 'walletAuthEnabled' as const,
                label: isFa ? 'ورود با کیف‌پول (Wallet)' : 'Trust Wallet / Web3',
                val: authCfg.walletAuthEnabled,
              },
              {
                key: 'telegramAuthEnabled' as const,
                label: isFa ? 'ورود با ربات تلگرام' : 'Telegram Bot Auth',
                val: authCfg.telegramAuthEnabled,
              },
              {
                key: 'googleAuthEnabled' as const,
                label: isFa ? 'ورود با حساب گوگل' : 'Google OAuth Sign-In',
                val: authCfg.googleAuthEnabled,
              },
              {
                key: 'passwordLoginEnabled' as const,
                label: isFa ? 'ورود کاربران با نام‌کاربری/رمز' : 'User Password Login',
                val: authCfg.passwordLoginEnabled,
              },
              {
                key: 'telegramOnlySignup' as const,
                label: isFa ? 'الزام ثبت‌نام فقط با ربات' : 'Telegram-Only Signup',
                val: authCfg.telegramOnlySignup,
              },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/15 border hairline cursor-pointer">
                <span className="text-[11px] font-bold text-main">{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.val}
                  onChange={(e) => setAuthCfg((p) => ({ ...p, [item.key]: e.target.checked }))}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          data-testid="btn-save-auth-providers"
          disabled={authCfg.saving}
          onClick={() => void saveAuthProviders()}
          className="px-4 py-2.5 rounded-xl btn-gold text-xs font-black"
        >
          {authCfg.saving
            ? isFa ? 'در حال ذخیره...' : 'Saving...'
            : isFa ? 'ذخیره روش‌های ورود و شناسه مالک' : 'Save Auth Methods & Owner ID'}
        </button>
      </div>
    </div>
  );

  const saveGoogleOauthKeys = async () => {
    setGoogleOauthForm((p) => ({ ...p, saving: true }));
    setMsg(null);
    try {
      const payload: Record<string, string> = {
        google_client_id: googleOauthForm.clientId.trim(),
      };
      if (googleOauthForm.clientSecret.trim() && googleOauthForm.clientSecret.trim() !== '********') {
        payload.google_client_secret = googleOauthForm.clientSecret.trim();
      }
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const authProviders = await apiFetch<{ googleConfigured?: boolean; googleClientId?: string | null }>('/api/auth/providers').catch(() => null);
      setGoogleOauthForm((p) => ({
        ...p,
        saving: false,
        clientSecret: '',
        hasSecretSaved: Boolean(p.hasSecretSaved || payload.google_client_secret),
        configured: Boolean(authProviders?.googleConfigured),
      }));
      setMsg(
        authProviders?.googleConfigured
          ? isFa
            ? 'کلیدهای Google OAuth با موفقیت ذخیره و ورود با گوگل فعال شد ✅'
            : 'Google OAuth keys saved & Google Sign-In is now LIVE ✅'
          : isFa
            ? 'کلید Google OAuth ذخیره شد. برای فعال‌سازی کامل، هر دو مقدار Client ID و Client Secret باید ثبت شوند.'
            : 'Saved. Provide both Client ID & Client Secret to enable live Google Sign-In.'
      );
      await load();
    } catch (e) {
      setGoogleOauthForm((p) => ({ ...p, saving: false }));
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  };

  const renderGoogleOauthCard = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dollarino.app';
    const callbackUrl = `${origin}/api/auth/google/callback`;
    return (
      <div
        data-testid="admin-google-oauth-card"
        className="surface-card rounded-3xl p-5 sm:p-6 space-y-4 border-sky-500/35"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-sky-400" />
              <span>{isFa ? 'احراز هویت و ورود با گوگل (Google OAuth 2.0)' : 'Google Sign-In / OAuth 2.0 Configuration'}</span>
            </h3>
            <p className="text-xs text-sub mt-1">
              {isFa
                ? 'با وارد کردن Client ID و Client Secret از Google Cloud Console، دکمه «ورود با گوگل» در صفحه لاگین بلافاصله بدون ریستارت سرور فعال می‌شود.'
                : 'Enter Google Cloud Client ID and Client Secret to immediately enable Sign In with Google on the login screen.'}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-black border ${
              googleOauthForm.configured
                ? 'bg-emerald-500/15 border-emerald-500/40 text-jade'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}
          >
            {googleOauthForm.configured
              ? isFa ? 'فعال و متصل ✅' : 'Configured & Active ✅'
              : isFa ? 'در انتظار تنظیم کلیدها ⏳' : 'Pending OAuth Keys ⏳'}
          </span>
        </div>

        <div className="surface-soft rounded-2xl p-3 text-[11px] space-y-1.5 border hairline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-dim font-bold">{isFa ? 'آدرس Redirect URI مجاز در Google Console:' : 'Authorized Redirect URI (paste into Google Console):'}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(callbackUrl).catch(() => {});
                setGoogleOauthForm((p) => ({ ...p, copiedUri: true }));
                setTimeout(() => setGoogleOauthForm((p) => ({ ...p, copiedUri: false })), 2000);
              }}
              className="px-2.5 py-1 rounded-lg btn-cobalt text-[10px]"
            >
              {googleOauthForm.copiedUri ? (isFa ? 'کپی شد ✅' : 'Copied ✅') : isFa ? 'کپی Redirect URI' : 'Copy Redirect URI'}
            </button>
          </div>
          <code dir="ltr" className="block font-mono text-[11px] text-brand break-all select-all">
            {callbackUrl}
          </code>
          <p className="text-[10px] text-dim">
            {isFa ? `دامنه JavaScript مجاز (Origin): ` : `Authorized JS Origin: `}
            <code dir="ltr" className="font-mono text-main">{origin}</code>
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-dim block mb-1 font-bold">
              {isFa ? 'Google Client ID (شناسه کلاینت)' : 'Google Client ID'}
            </label>
            <input
              dir="ltr"
              data-testid="input-google-client-id"
              value={googleOauthForm.clientId}
              onChange={(e) => setGoogleOauthForm((p) => ({ ...p, clientId: e.target.value }))}
              placeholder="1234567890-xxxx.apps.googleusercontent.com"
              className="field py-2.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-dim block mb-1 font-bold">
              {isFa ? 'Google Client Secret (کلید محرمانه)' : 'Google Client Secret'}
              {googleOauthForm.hasSecretSaved && (
                <span className="ms-2 text-[10px] text-jade font-bold">
                  {isFa ? '(کلید قبلی ذخیره شده ✅)' : '(Secret saved ✅)'}
                </span>
              )}
            </label>
            <input
              dir="ltr"
              type="password"
              data-testid="input-google-client-secret"
              value={googleOauthForm.clientSecret}
              onChange={(e) => setGoogleOauthForm((p) => ({ ...p, clientSecret: e.target.value }))}
              placeholder={googleOauthForm.hasSecretSaved ? '•••••••• (خالی بگذارید تا کلید فعلی بماند)' : 'GOCSPX-...'}
              className="field py-2.5 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="btn-save-google-oauth"
            disabled={googleOauthForm.saving}
            onClick={() => void saveGoogleOauthKeys()}
            className="px-4 py-2.5 rounded-xl btn-cobalt text-xs font-bold"
          >
            {googleOauthForm.saving
              ? isFa ? 'در حال ذخیره...' : 'Saving...'
              : isFa ? 'ذخیره کلیدهای Google OAuth' : 'Save Google OAuth Keys'}
          </button>
          <button
            type="button"
            disabled={googleOauthForm.testing}
            onClick={async () => {
              setGoogleOauthForm((p) => ({ ...p, testing: true }));
              const res = await apiFetch<{ googleConfigured?: boolean; googleClientId?: string | null }>('/api/auth/providers').catch(() => null);
              setGoogleOauthForm((p) => ({ ...p, testing: false, configured: Boolean(res?.googleConfigured) }));
              setMsg(
                res?.googleConfigured
                  ? isFa ? 'تست موفق: Google OAuth آماده و در صفحه ورود فعال است ✅' : 'Verified: Google OAuth is live on AuthPage ✅'
                  : isFa ? 'هنوز Client ID یا Client Secret کامل ثبت نشده است ⚠️' : 'Google OAuth keys incomplete ⚠️'
              );
            }}
            className="px-4 py-2.5 rounded-xl surface-soft border hairline text-xs font-bold text-main"
          >
            {googleOauthForm.testing ? '...' : isFa ? 'بررسی وضعیت زنده OAuth' : 'Verify Live Status'}
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const loadDbStats = async () => {
    try {
      const res = await apiFetch<NonNullable<typeof dbStats>>('/api/admin/database/stats');
      setDbStats(res);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (isOwnerOrAdmin && (adminSection === 'database' || adminSection === 'all')) {
      void loadDbStats();
    }
  }, [isOwnerOrAdmin, adminSection]);

  const updateSignalControls = async (patch: {
    publishSignalsToChannels?: boolean;
    publishSignalsToBotUsers?: boolean;
    alwaysOnSignals?: boolean;
    alwaysOnAiBroadcast?: boolean;
  }) => {
    setSignalCtrlBusy(true);
    try {
      const nextChan = patch.publishSignalsToChannels ?? publishSignalsToChannels;
      const nextBot = patch.publishSignalsToBotUsers ?? publishSignalsToBotUsers;
      await apiFetch('/api/admin/signal-controls', {
        method: 'POST',
        body: JSON.stringify({
          publishSignalsToChannels: nextChan,
          publishSignalsToBotUsers: nextBot,
          alwaysOnSignals: patch.alwaysOnSignals,
          alwaysOnAiBroadcast: patch.alwaysOnAiBroadcast,
        }),
      });
      if (patch.publishSignalsToChannels !== undefined) setPublishSignalsToChannels(nextChan);
      if (patch.publishSignalsToBotUsers !== undefined) setPublishSignalsToBotUsers(nextBot);
      setAutoPublishingCfg((p) => ({
        ...p,
        autoPublishSignalsToChannel: nextChan,
        alwaysOnSignals: patch.alwaysOnSignals ?? p.alwaysOnSignals,
        alwaysOnAiBroadcast: patch.alwaysOnAiBroadcast ?? p.alwaysOnAiBroadcast,
      }));
      setMsg(isFa ? 'تنظیمات انتشار سیگنال با موفقیت اعمال شد ✅' : 'Signal delivery controls updated ✅');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to update signal controls');
    } finally {
      setSignalCtrlBusy(false);
    }
  };

  useEffect(() => {
    if (!msg) return;
    const isErr = /❌|خطا|fail|error|rejected|ناموفق/i.test(msg);
    pushFloatingToast(msg, isErr ? 'error' : 'success');
    setMsg(null);
  }, [msg]);

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
      setMsg(decision === 'APPROVE' ? 'Settlement approved!' : 'Record rejected.');
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
        body: JSON.stringify({ planCode: 'pro_monthly', durationDays: giftDays, maxUses: giftMaxUses }),
      });
      setGeneratedGiftCode(res.code);
      setMsg(isFa ? `کد هدیه اعتبار کارمزد ساخته شد: ${res.code} (${res.durationDays} روز)` : `Fee Credit Gift Code Created: ${res.code} (${res.durationDays}d)`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Gift code creation failed');
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
      {/* Modern Glass Command Center Hero Header */}
      <div
        className="relative overflow-hidden rounded-[30px] p-4 sm:p-5 border border-[#1E3A8A]/45 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #09142F 0%, #10204A 55%, #0C2A3B 100%)', color: '#FFFFFF' }}
      >
        <div className="absolute -top-14 -end-10 w-44 h-44 rounded-full bg-emerald-400/20 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -start-10 w-48 h-48 rounded-full bg-[#1652F0]/25 blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] grid place-items-center shadow-lg shadow-amber-500/25 shrink-0">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-sm sm:text-base text-white">{currentUser.username}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/45 text-emerald-100 text-[10px] font-black uppercase">
                    {currentUser.role === 'owner' ? (isFa ? 'مالک سیستم · OWNER' : 'OWNER') : currentUser.role.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-white text-[10px] font-bold">
                    V11.7 Command
                  </span>
                </div>
                <div className="text-[11px] text-white/80 font-mono-num mt-0.5" dir="ltr">
                  {currentUser.email}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 font-bold text-white inline-flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بروزرسانی پنل' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAdminSecurityBox((s) => !s)}
                className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 font-bold text-amber-100 inline-flex items-center gap-1.5 transition"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{showAdminSecurityBox ? (isFa ? 'بستن امنیت ادمین ▲' : 'Hide Security ▲') : isFa ? 'پروفایل و رمز ادمین ▼' : 'Profile & Password ▼'}</span>
              </button>
            </div>
          </div>

          {/* Sticky Quick Command Navigation Pills */}
          {isOwnerOrAdmin && data && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              {[
                { id: 'menu' as const, label: isFa ? 'منوی اصلی' : 'Menu', icon: Shield },
                { id: 'overview' as const, label: isFa ? 'سلامت و AI' : 'Health & AI', icon: BrainCircuit },
                { id: 'site_controls' as const, label: isFa ? 'قفل سایت و پاپ‌آپ' : 'Site Lock & Popups', icon: ShieldAlert },
                { id: 'ops' as const, label: isFa ? 'سیگنال و تلگرام' : 'Signals & TG', icon: Radio },
                { id: 'database' as const, label: isFa ? 'دیتابیس (بکاپ/پاکسازی)' : 'D1 Backup/Wipe', icon: Database },
                { id: 'users' as const, label: isFa ? 'کاربران و ۳٪' : 'Users & 3%', icon: Users },
                { id: 'payments' as const, label: isFa ? 'خزانه و مالی' : 'Treasury', icon: Wallet },
                { id: 'banners' as const, label: isFa ? 'بنرها' : 'Banners', icon: Image },
                { id: 'founder' as const, label: isFa ? 'بنیان‌گذار' : 'Founder', icon: BadgeCheck },
                { id: 'dex_logs' as const, label: isFa ? 'آن‌چین و لاگ' : 'On-Chain', icon: Flame },
                { id: 'all' as const, label: isFa ? 'نمایش یکجا' : 'Show All', icon: Layers },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const active = adminSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdminSection(tab.id)}
                    className={`px-3 py-1.5 rounded-xl font-black inline-flex items-center gap-1.5 shrink-0 transition border ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-300 shadow-md shadow-emerald-500/25'
                        : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {showAdminSecurityBox && (
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 mt-3 border-t border-white/15 text-xs tab-enter">
            <form onSubmit={updateProfile} className="rounded-2xl bg-white/10 p-4 space-y-2.5">
              <h3 className="font-black text-white">{isFa ? 'نام نمایشی ادمین' : 'Admin Display Name'}</h3>
              <div className="flex gap-2">
                <input value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 surface-input text-main rounded-xl px-3 py-2" />
                <button type="submit" className="px-4 py-2 rounded-xl btn-emerald font-extrabold">
                  {isFa ? 'ذخیره' : 'Save'}
                </button>
              </div>
            </form>
            <form onSubmit={updatePassword} className="rounded-2xl bg-white/10 p-4 space-y-2.5">
              <h3 className="font-black text-white">{isFa ? 'تغییر رمز عبور' : 'Update Password'}</h3>
              <div className="grid grid-cols-2 gap-2">
                <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current Password" className="surface-input text-main rounded-xl px-3 py-2" />
                <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password (min 6)" className="surface-input text-main rounded-xl px-3 py-2" />
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
                    {adminSection === 'overview' && (isFa ? 'سلامت سیستم، موتورهای AI و بهینه‌سازی D1' : 'System Health, AI Engines & D1')}
                    {adminSection === 'site_controls' && (isFa ? 'قفل موقت سایت، حالت تعمیرات و پاپ‌آپ‌های اطلاع‌رسانی کاربران' : 'Site Maintenance Lock & Targeted User Popups')}
                    {adminSection === 'database' && (isFa ? 'بانک اطلاعاتی D1: بکاپ، بازیابی و پاکسازی کامل (Owner)' : 'D1 Database Backup, Restore & Wipe (Owner)')}
                    {adminSection === 'banners' && (isFa ? 'بنرهای متحرک و کمپین تبلیغاتی' : 'Promo Banners & Campaigns')}
                    {adminSection === 'founder' && (isFa ? 'هویت بنیان‌گذار، عکس و شفافیت ضدپانزی' : 'Founder Identity, Photo & Anti-Scam Proof')}
                    {adminSection === 'users' && (isFa ? 'مدیریت کاربران، KYC و کارمزد ۳٪' : 'Users, Phone KYC & 3% Fees')}
                    {adminSection === 'payments' && (isFa ? 'مالی، خزانه، فیش‌ها و کارمزد ۳٪' : 'Finance, Treasury, 3% Fees & Wallets')}
                    {adminSection === 'ops' && (isFa ? 'کانال تلگرام، کنترل انتشار سیگنال، کپی‌ترید و پشتیبانی' : 'Signal Controls, Channel, Copy-Trade & Tickets')}
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
                    <div className="text-[10px] text-sub font-bold">{isFa ? 'کارمزد ۳٪ سود' : '3% Profit Fee'}</div>
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

              {/* Master Signal Broadcast Quick Switches (Channel vs Bot Users) */}
              <div className="panel rounded-3xl p-4 border hairline space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-main inline-flex items-center gap-2">
                    <Power className="w-4 h-4 text-jade" />
                    <span>{isFa ? 'کنترل آنی انتشار سیگنال (کانال تلگرام و ربات کاربران)' : 'Live Signal Broadcast Controls (Channels vs Bot Users)'}</span>
                  </span>
                  <span className="text-[10px] text-dim">{isFa ? 'تغییرات بلافاصله اعمال می‌شوند' : 'Applies instantaneously'}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                  <button
                    type="button"
                    disabled={signalCtrlBusy}
                    onClick={() => void updateSignalControls({ publishSignalsToChannels: !publishSignalsToChannels })}
                    className={`rounded-2xl p-3 border text-start flex items-center justify-between gap-2 transition ${
                      publishSignalsToChannels
                        ? 'bg-emerald-500/12 border-emerald-500/35 text-main'
                        : 'bg-rose-500/10 border-rose-500/30 text-sub'
                    }`}
                  >
                    <div>
                      <div className="font-black text-xs">{isFa ? '📡 ارسال سیگنال در کانال‌های تلگرام' : '📡 Signals to Telegram Channels'}</div>
                      <div className="text-[10px] text-dim mt-0.5">{isFa ? 'کانال رسمی سیگنال و کارت نتایج بسته شدن' : 'Main signals channel & closed cards'}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${publishSignalsToChannels ? 'bg-emerald-500 text-white' : 'bg-rose-500/20 text-loss'}`}>
                      {publishSignalsToChannels ? (isFa ? 'روشن ON' : 'ON') : (isFa ? 'خاموش OFF' : 'OFF')}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={signalCtrlBusy}
                    onClick={() => void updateSignalControls({ publishSignalsToBotUsers: !publishSignalsToBotUsers })}
                    className={`rounded-2xl p-3 border text-start flex items-center justify-between gap-2 transition ${
                      publishSignalsToBotUsers
                        ? 'bg-emerald-500/12 border-emerald-500/35 text-main'
                        : 'bg-rose-500/10 border-rose-500/30 text-sub'
                    }`}
                  >
                    <div>
                      <div className="font-black text-xs">{isFa ? '🤖 ارسال سیگنال به پی‌وی ربات کاربران' : '🤖 Signals to Bot Users (DM)'}</div>
                      <div className="text-[10px] text-dim mt-0.5">{isFa ? 'ارسال مستقیم سیگنال رادار و خبرنامه به کاربران ربات' : 'Send radar signals & alerts to bot users'}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${publishSignalsToBotUsers ? 'bg-emerald-500 text-white' : 'bg-rose-500/20 text-loss'}`}>
                      {publishSignalsToBotUsers ? (isFa ? 'روشن ON' : 'ON') : (isFa ? 'خاموش OFF' : 'OFF')}
                    </span>
                  </button>
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
                      title: isFa ? 'سلامت سیستم، Google OAuth، موتورهای AI و بهینه‌سازی D1' : 'System Health, Google OAuth, AI Engines & D1 Housekeeping',
                      subtitle: isFa
                        ? `وضعیت زنده هوش مصنوعی (${aiEngines.length} مدل) · ورود گوگل (${googleOauthForm.configured ? 'فعال' : 'تنظیم‌نشده'}) · بهینه‌سازی D1`
                        : `${aiEngines.length} AI models · Google OAuth (${googleOauthForm.configured ? 'Ready' : 'Pending'}) · D1 vacuum`,
                      pill: systemHealth ? `${systemHealth.runningBots ?? 0} Bot` : 'Live',
                    },
                    {
                      id: 'site_controls' as const,
                      icon: ShieldAlert,
                      badgeBg: siteMaintenanceForm.enabled ? 'bg-[#DC2626]' : 'bg-[#0EA5E9]',
                      title: isFa ? 'قفل موقت / حالت تعمیرات سایت و پاپ‌آپ‌های اطلاع‌رسانی کاربران' : 'Site Maintenance Lock & Custom User Popups',
                      subtitle: isFa
                        ? `وضعیت سایت: ${siteMaintenanceForm.enabled ? '🔒 قفل تعمیرات فعال' : '✅ باز و آنلاین'} · پاپ‌آپ‌های فعال: ${adminPopups.filter((p) => p.is_active).length}`
                        : `Site: ${siteMaintenanceForm.enabled ? '🔒 Locked' : '✅ Online'} · Active Popups: ${adminPopups.filter((p) => p.is_active).length}`,
                      pill: siteMaintenanceForm.enabled ? 'LOCKED' : `${adminPopups.filter((p) => p.is_active).length} Popups`,
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
                      title: isFa ? 'خزانه مرکزی (بانک)، کارمزد ۳٪ و آدرس‌های Trust Wallet' : 'Central Treasury Bank, 3% Fees & Trust Wallets',
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
                      title: isFa ? 'کانال تلگرام، ربات، Google OAuth، لیدربرد کپی‌ترید و پشتیبانی' : 'Telegram Bot, Google OAuth, Copy-Trade Leaders & Support',
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
                    {
                      id: 'database' as const,
                      icon: Database,
                      badgeBg: 'bg-[#DC2626]',
                      title: isFa ? 'بانک اطلاعاتی D1: بکاپ کامل، بازیابی، پاکسازی و ریست سیستم (Owner)' : 'D1 Database: Backup, Restore, Prune & Full Wipe (Owner)',
                      subtitle: isFa
                        ? 'خروجی کامل JSON (۵۱ جدول)، بازگردانی ایمن بکاپ، کاهش Rows Read و پاکسازی/ریست داده‌ها'
                        : 'Download full JSON backup, restore snapshots, inspect table rows & reset/wipe D1 safely',
                      pill: dbStats ? `${dbStats.totalRows} Rows` : 'Owner',
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 text-[11px]">
                    {[
                      { ok: systemHealth.productionChecks.jwtSecretOk, label: isFa ? 'کلید امنیتی JWT' : 'JWT Secret' },
                      { ok: systemHealth.productionChecks.encryptionKeyOk, label: isFa ? 'رمزنگاری Vault' : 'AES Vault Key' },
                      { ok: Boolean(systemHealth.productionChecks.ownerTelegramIdConfigured || authCfg.ownerTelegramId), label: isFa ? 'آیدی تلگرام مالک' : 'Owner Telegram ID' },
                      { ok: systemHealth.productionChecks.telegramBotConfigured, label: isFa ? 'توکن ربات تلگرام' : 'Telegram Bot' },
                      { ok: Boolean(systemHealth.productionChecks.googleOauthConfigured ?? googleOauthForm.configured), label: isFa ? 'ورود با گوگل (OAuth)' : 'Google OAuth' },
                      { ok: systemHealth.productionChecks.aiEngineConfigured, label: isFa ? 'موتور هوش مصنوعی' : 'AI Gateway' },
                      { ok: systemHealth.productionChecks.feeReceiverWalletConfigured, label: isFa ? 'ولت خزانه / کارمزد ۳٪' : 'Treasury / 3% Fee Wallet' },
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

          {/* User Authentication Methods & Owner Telegram ID Control */}
          {renderAuthProvidersCard()}

          {/* Google OAuth 2.0 Settings Card */}
          {renderGoogleOauthCard()}

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
                    {isFa
                      ? 'افزودن یا ویرایش موتور هوش مصنوعی (پشتیبانی کامل از DeepSeek + Arena AI با کلید شخصی خودتان):'
                      : 'Add / Edit AI Engine Slot (Full DeepSeek + Arena AI support — paste your API key below):'}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${hilinkupSecretReady ? 'text-jade' : 'text-amber-400'}`}>
                      {hilinkupSecretReady
                        ? isFa
                          ? '✓ کلید DeepSeek / Hilinkup روی سرور فعال است'
                          : '✓ DeepSeek / Hilinkup Secret active'
                        : isFa
                          ? 'ℹ️ DeepSeek را در اسلات ۱ و Arena AI را در اسلات ۲ ثبت کنید'
                          : 'ℹ️ Set DeepSeek in Slot 1 & Arena AI in Slot 2'}
                    </span>
                    {arenaSecretReady && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-jade">
                        {isFa ? '✓ کلید Arena AI روی سرور فعال است' : '✓ Arena AI Secret active'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveredAiModels([]);
                      setAiForm({
                        ...aiForm,
                        provider: 'openai_compatible',
                        baseUrl: 'https://api.arena.ai/v1',
                        model: 'coding-router-preview',
                        label: `مدل ${aiForm.slotOrder} (Arena AI)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] inline-flex items-center gap-1 hover:brightness-110"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isFa ? 'پرکردن سریع Arena AI (OpenAI)' : 'Fill Arena AI (OpenAI)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveredAiModels([]);
                      setAiForm({
                        ...aiForm,
                        provider: 'anthropic',
                        baseUrl: 'https://api.arena.ai',
                        model: 'coding-router-preview',
                        label: `مدل ${aiForm.slotOrder} (Arena Claude)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/30 font-bold text-[11px] inline-flex items-center gap-1 hover:brightness-110"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>{isFa ? 'Arena AI (Anthropic)' : 'Arena AI (Anthropic)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveredAiModels([]);
                      setAiForm({
                        ...aiForm,
                        provider: 'openai_compatible',
                        baseUrl: 'https://api.hilinkup.com/v1',
                        model: 'baidu/deepseek-v4.1-flash-1017',
                        label: `مدل ${aiForm.slotOrder} (Hilinkup DeepSeek v4.1)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl banner-cobalt-soft text-brand font-bold text-[11px] inline-flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isFa ? 'DeepSeek / Hilinkup' : 'DeepSeek / Hilinkup'}</span>
                  </button>
                </div>
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
                              ? 'https://api.arena.ai/v1'
                              : p === 'anthropic'
                                ? 'https://api.anthropic.com'
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
                    <option value="openai_compatible">Arena AI / Hilinkup / OpenAI-Compatible</option>
                    <option value="deepseek">DeepSeek Direct</option>
                    <option value="anthropic">Arena Anthropic / Claude</option>
                    <option value="openai">OpenAI GPT</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="text-[11px] font-bold text-sub block mb-1">Base URL</label>
                  <div className="flex gap-1.5">
                    <input
                      dir="ltr"
                      placeholder="https://api.arena.ai/v1"
                      value={aiForm.baseUrl}
                      onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                      className="w-full surface-input rounded-xl px-3 py-2 font-mono-num text-left"
                    />
                    <button
                      type="button"
                      disabled={discoveringAi}
                      onClick={async () => {
                        setDiscoveringAi(true);
                        setMsg(null);
                        try {
                          const res = await apiFetch<{
                            ok: boolean;
                            count: number;
                            models: Array<{ id: string; supportsVision?: boolean }>;
                          }>('/api/admin/ai-engines/discover-models', {
                            method: 'POST',
                            body: JSON.stringify({
                              baseUrl: aiForm.baseUrl || 'https://api.arena.ai/v1',
                              apiKey: aiForm.apiKey.trim() || undefined,
                              slotOrder: aiForm.slotOrder,
                              provider: aiForm.provider,
                            }),
                          });
                          setDiscoveredAiModels(res.models || []);
                          if (res.models?.length && !aiForm.model.trim()) {
                            setAiForm((prev) => ({ ...prev, model: res.models[0]!.id }));
                          }
                          setMsg(
                            isFa
                              ? `✅ ${res.count} مدل زنده از گیت‌وی دریافت شد! مدل دلخواه را از زیر انتخاب کنید.`
                              : `✅ Loaded ${res.count} live models from gateway.`
                          );
                        } catch (err) {
                          setMsg(err instanceof Error ? err.message : 'Model discovery failed');
                        } finally {
                          setDiscoveringAi(false);
                        }
                      }}
                      className="px-3 py-2 rounded-xl surface-soft border hairline font-bold text-[11px] shrink-0 hover:border-[var(--gold)]"
                    >
                      {discoveringAi ? '...' : isFa ? 'دریافت مدل‌ها' : 'Discover'}
                    </button>
                  </div>
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
                    {Array.from(
                      new Set([
                        ...discoveredAiModels.map((m) => m.id),
                        ...(ADMIN_AI_MODELS[aiForm.provider] || []),
                      ])
                    ).map((m) => (
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
                  <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کلید API (از پنل وارد کنید)' : 'API Key'}</label>
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
              {discoveredAiModels.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-[10.5px] font-bold text-sub block">
                    {isFa ? 'مدل‌های کشف‌شده زنده از سرور شما (برای انتخاب کلیک کنید):' : 'Discovered live gateway models (click to select):'}
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {discoveredAiModels.slice(0, 40).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAiForm((prev) => ({ ...prev, model: m.id }))}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-mono-num border transition ${
                          aiForm.model === m.id
                            ? 'bg-[var(--cobalt)] text-white border-[var(--cobalt)] font-black'
                            : 'surface-soft hairline text-sub hover:text-main'
                        }`}
                      >
                        {m.supportsVision ? '👁 ' : ''}
                        {m.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
          {/* Central Treasury / Bank Wallet Management (Owner Trust Wallet Connect + BIP39 Seed + Deposit Verification) */}
          <div className="surface-card p-5 space-y-4 border border-sky-500/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-main flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#0D47A1] dark:text-[#60A5FA]" />
                  <span>{isFa ? '🏦 خزانه مرکزی و کیف‌پول بانک دلارینو (BIP39 / Trust Wallet)' : '🏦 Central Treasury Bank Wallet (BIP39 / Trust Wallet)'}</span>
                </h3>
                <p className="text-[11px] text-dim mt-0.5">
                  {isFa
                    ? 'تمام واریزها (حداقل $۱۰)، پیش‌پرداخت و کارمزد ۳٪ پس از ۳ معامله سودده اول رایگان به این کیف‌پول خزانه واریز می‌شود.'
                    : 'Collects $10+ deposits, credit top-ups, and 3% post-trial profit fees.'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-black">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-[#059669]">
                  {treasurySummary?.bankMode === 'MNEMONIC_VAULT' ? '🔐 BIP39 Vault' : '🛡 Trust Wallet Bank'}
                </span>
                <button
                  type="button"
                  disabled={treasuryBusy}
                  onClick={async () => {
                    setTreasuryBusy(true);
                    try {
                      await apiFetch('/api/admin/treasury/connect-wallet', { method: 'POST', body: JSON.stringify({}) });
                      setMsg(isFa ? 'کیف‌پول Trust Wallet متصل‌شده ادمین به عنوان بانک خزانه ثبت شد ✅' : 'Owner Trust Wallet connected as Treasury ✅');
                      await load();
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : 'Connect treasury failed');
                    } finally {
                      setTreasuryBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#0D47A1] text-white font-black"
                >
                  {isFa ? 'اتصال Trust Wallet من به عنوان بانک' : 'Connect My Trust Wallet'}
                </button>
              </div>
            </div>

            {treasurySummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="text-[10px] text-dim">{isFa ? 'واریزهای تاییدشده' : 'Confirmed Deposits'}</p>
                  <p dir="ltr" className="font-num font-black text-main mt-0.5">
                    ${(treasurySummary.totals.confirmedDepositsUsd + treasurySummary.totals.confirmedTopupsUsd).toFixed(2)}
                  </p>
                </div>
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="text-[10px] text-dim">{isFa ? 'کارمزد ۳٪ وصول‌شده' : '3% Fees Collected'}</p>
                  <p dir="ltr" className="font-num font-black text-[#059669] mt-0.5">
                    ${treasurySummary.totals.profitFeesCollectedUsd.toFixed(2)}
                  </p>
                </div>
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="text-[10px] text-dim">{isFa ? 'در انتظار تایید' : 'Pending Review'}</p>
                  <p dir="ltr" className="font-num font-black text-[#D97706] mt-0.5">
                    {treasurySummary.totals.pendingCount} (${treasurySummary.totals.pendingDepositsUsd.toFixed(2)})
                  </p>
                </div>
                <div className="surface-soft rounded-2xl p-3 border hairline">
                  <p className="text-[10px] text-dim">{isFa ? 'معاملات رایگان اول' : '0% Free Trial Trades'}</p>
                  <p dir="ltr" className="font-num font-black text-brand mt-0.5">
                    {treasurySummary.totals.freeTrialTradesCount}
                  </p>
                </div>
              </div>
            )}

            {/* BIP39 Encrypted Seed Import (Optional Bank Wallet Derivation) */}
            <div className="rounded-2xl p-3.5 surface-soft border hairline space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-main">
                  {isFa ? '🔑 اتصال بانک با عبارت ۱۲/۲۴ کلمه‌ای (رمزنگاری AES-GCM + مشتق BIP44 EVM & TRON)' : '🔑 Import 12/24-Word BIP39 Treasury Seed (AES-GCM Vault)'}
                </span>
                {treasurySummary?.mnemonicConfigured && (
                  <span className="text-[10px] text-[#059669] font-black">{treasurySummary.mnemonicHint}</span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="password"
                  dir="ltr"
                  value={treasuryMnemonicInput}
                  onChange={(e) => setTreasuryMnemonicInput(e.target.value)}
                  placeholder={isFa ? 'word1 word2 ... word12 (رمزنگاری‌شده ذخیره می‌شود)' : '12 or 24 BIP39 mnemonic words...'}
                  className="surface-input flex-1 h-10 rounded-xl px-3 font-mono text-xs"
                />
                <button
                  type="button"
                  disabled={treasuryBusy || !treasuryMnemonicInput.trim()}
                  onClick={async () => {
                    setTreasuryBusy(true);
                    try {
                      const res = await apiFetch<{ receivers?: { evm?: string; tron?: string } }>('/api/admin/treasury/import-mnemonic', {
                        method: 'POST',
                        body: JSON.stringify({ mnemonic: treasuryMnemonicInput }),
                      });
                      setTreasuryMnemonicInput('');
                      setMsg(isFa ? `خزانه با سید رمزنگاری و آدرس EVM (${res.receivers?.evm}) راه‌اندازی شد ✅` : 'BIP39 Treasury Seed imported ✅');
                      await load();
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : 'Mnemonic import failed');
                    } finally {
                      setTreasuryBusy(false);
                    }
                  }}
                  className="h-10 px-5 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-45 text-white font-black shrink-0 inline-flex items-center justify-center"
                >
                  {isFa ? '🔐 مشتق‌سازی و ذخیره رمزنگاری' : '🔐 Derive & Encrypt'}
                </button>
              </div>
            </div>

            {/* Manual Treasury Receiver Addresses per Chain */}
            <div className="space-y-3 text-xs">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-dim block mb-1.5">EVM (BEP20 / ERC20 / Base)</label>
                  <input
                    dir="ltr"
                    value={treasuryReceiversForm.evm}
                    onChange={(e) => setTreasuryReceiversForm((s) => ({ ...s, evm: e.target.value }))}
                    placeholder="0x..."
                    className="surface-input w-full h-10 rounded-xl px-3 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dim block mb-1.5">TRON (TRC20)</label>
                  <input
                    dir="ltr"
                    value={treasuryReceiversForm.tron}
                    onChange={(e) => setTreasuryReceiversForm((s) => ({ ...s, tron: e.target.value }))}
                    placeholder="T..."
                    className="surface-input w-full h-10 rounded-xl px-3 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dim block mb-1.5">Solana (SPL)</label>
                  <input
                    dir="ltr"
                    value={treasuryReceiversForm.solana}
                    onChange={(e) => setTreasuryReceiversForm((s) => ({ ...s, solana: e.target.value }))}
                    placeholder="Solana address..."
                    className="surface-input w-full h-10 rounded-xl px-3 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-dim block mb-1.5">TON Network</label>
                  <input
                    dir="ltr"
                    value={treasuryReceiversForm.ton}
                    onChange={(e) => setTreasuryReceiversForm((s) => ({ ...s, ton: e.target.value }))}
                    placeholder="UQ..."
                    className="surface-input w-full h-10 rounded-xl px-3 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="rounded-2xl p-3.5 surface-soft border hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="text-[11px] font-bold text-dim shrink-0">{isFa ? 'حداقل واریز به خزانه ($):' : 'Min Treasury Deposit ($):'}</label>
                  <input
                    type="number"
                    min={10}
                    dir="ltr"
                    value={treasuryReceiversForm.minDepositUsd}
                    onChange={(e) => setTreasuryReceiversForm((s) => ({ ...s, minDepositUsd: e.target.value }))}
                    className="surface-input w-28 h-10 rounded-xl px-3 font-mono text-xs font-bold"
                  />
                </div>
                <button
                  type="button"
                  disabled={treasuryBusy}
                  onClick={async () => {
                    setTreasuryBusy(true);
                    try {
                      await apiFetch('/api/admin/treasury/receivers', {
                        method: 'POST',
                        body: JSON.stringify({
                          evm: treasuryReceiversForm.evm,
                          tron: treasuryReceiversForm.tron,
                          solana: treasuryReceiversForm.solana,
                          ton: treasuryReceiversForm.ton,
                          minDepositUsd: Number(treasuryReceiversForm.minDepositUsd || 10),
                        }),
                      });
                      setMsg(isFa ? 'آدرس‌های خزانه ذخیره شد ✅' : 'Treasury receivers saved ✅');
                      await load();
                    } finally {
                      setTreasuryBusy(false);
                    }
                  }}
                  className="h-10 px-6 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                >
                  <span>{isFa ? '💾 ذخیره آدرس‌های خزانه و حداقل واریز' : '💾 Save Treasury Receivers'}</span>
                </button>
              </div>
            </div>

            {treasurySummary?.deposits && treasurySummary.deposits.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t hairline text-xs">
                <p className="font-black text-main">{isFa ? 'لیست واریزهای خزانه کاربران (بررسی TX Hash منحصربه‌فرد):' : 'User Treasury Deposits:'}</p>
                {treasurySummary.deposits.slice(0, 12).map((td) => (
                  <div key={td.id} className="surface-soft rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 border hairline">
                    <div className="min-w-0">
                      <span className="font-black text-main">{td.username || td.email}</span>{' '}
                      <span dir="ltr" className="text-[#059669] font-black">${Number(td.amount_usd).toFixed(2)} {td.asset} ({td.network})</span>
                      <p dir="ltr" className="text-[10px] font-mono text-dim truncate max-w-md">{td.tx_hash}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        td.status === 'CONFIRMED' ? 'bg-emerald-500/15 text-[#059669]' : td.status === 'REJECTED' ? 'bg-rose-500/15 text-[#DC2626]' : 'bg-amber-500/15 text-[#D97706]'
                      }`}>
                        {td.status}
                      </span>
                      {td.status === 'PENDING_VERIFY' && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/treasury/deposits/${td.id}/decide`, { method: 'POST', body: JSON.stringify({ approve: true }) });
                              await load();
                            }}
                            className="px-2 py-1 rounded-lg bg-[#059669] text-white text-[10px] font-black"
                          >
                            {isFa ? 'تایید' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/treasury/deposits/${td.id}/decide`, { method: 'POST', body: JSON.stringify({ approve: false }) });
                              await load();
                            }}
                            className="px-2 py-1 rounded-lg bg-[#DC2626] text-white text-[10px] font-black"
                          >
                            {isFa ? 'رد' : 'Reject'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3% Fee Debt & Lock Policy Enforcement Panel */}
          <div className="surface-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-black text-main flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#D97706]" />
                <span>{isFa ? 'کنترل کارمزد ۳٪ (پس از ۳ معامله رایگان)، بدهکاران و مهلت ۷۲ ساعته' : '3% Server Fee Enforcement, Debtors & Late Penalty'}</span>
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
                  setMsg(isFa ? 'قوانین محدودیت کارمزد ۳٪ ذخیره شد ✅' : 'Fee enforcement rules saved ✅');
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
              <span>{isFa ? 'تسویه کارمزد ۳٪ سود و تراکنش‌های تاریخی (اشتراک ماهانه رایگان است)' : '3% Profit Fee Settlements & Legacy Records (Subscriptions Free)'}</span>
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
            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Gift className="w-4 h-4 text-signal" />
                <span>{isFa ? 'مدل رایگان + کد هدیه اعتبار کارمزد ۳٪' : '0$ Subscription Model & Fee Credit Gift Codes'}</span>
              </h3>
              <div className="rounded-2xl surface-soft border hairline p-3.5 space-y-1.5 text-[11px] text-sub leading-relaxed">
                <p className="font-black text-main">
                  {isFa
                    ? '✅ سیستم اشتراک ماهانه و پکیج‌های پولی حذف شده است.'
                    : '✅ Monthly subscription tiers have been permanently retired.'}
                </p>
                <p>
                  {isFa
                    ? '• تمام امکانات برای همه کاربران رایگان است. ۳ معامله سودده اول واقعی با کارمزد ۰٪ محاسبه می‌شود و از معامله چهارم به بعد فقط ۳٪ کارمزد از سود خالص کسر می‌گردد.'
                    : '• All platform tools are 100% free. First 3 profitable LIVE trades carry 0% fee; subsequent profitable trades share 3% net profit.'}
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-bold text-sub">
                  {isFa ? 'تولید کد هدیه اعتبار کارمزد (Gift Code):' : 'Generate Fee-Credit Gift Code:'}
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
            </div>

            <form onSubmit={savePayConfig} className="surface-card p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'آدرس‌های تسویه کارمزد ۳٪ و امنیت Trust Wallet' : '3% Fee Settlement Wallets & Security'}</span>
                </h3>
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                  {isFa ? '۳ معامله ۰٪ + ۳٪ سود' : '3 Free -> 3%'}
                </span>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-dim mb-1">
                  {isFa ? 'آدرس ولت تسویه تتر TRC20 (شبکه TRON):' : 'USDT TRC20 Settlement Wallet Address:'}
                </label>
                <input
                  dir="ltr"
                  value={payCfg.usdtTrc20Wallet}
                  onChange={(e) => setPayCfg({ ...payCfg, usdtTrc20Wallet: e.target.value })}
                  placeholder="T..."
                  className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">
                    {isFa ? 'شماره کارت بانکی ریالی (اختیاری):' : 'Iran Bank Card Number (optional):'}
                  </label>
                  <input
                    dir="ltr"
                    value={payCfg.iranCardNumber}
                    onChange={(e) => setPayCfg({ ...payCfg, iranCardNumber: e.target.value })}
                    placeholder="6037-..."
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">
                    {isFa ? 'نام صاحب کارت بانکی:' : 'Card Holder Name:'}
                  </label>
                  <input
                    value={payCfg.iranCardHolder}
                    onChange={(e) => setPayCfg({ ...payCfg, iranCardHolder: e.target.value })}
                    placeholder={isFa ? 'نام و نام خانوادگی...' : 'Card holder name'}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="pt-2 border-t hairline space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">
                    {isFa ? 'آدرس ولت EVM / BEP20 جهت دریافت کارمزد (Trust Wallet):' : 'Trust Wallet EVM / BEP20 Receiver (0x...):'}
                  </label>
                  <input
                    dir="ltr"
                    value={trustReceivers.evm}
                    onChange={(e) => setTrustReceivers({ ...trustReceivers, evm: e.target.value })}
                    placeholder="0x..."
                    className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-dim mb-1">
                      {isFa ? 'آدرس دریافت Solana (اختیاری):' : 'Solana Receiver (optional):'}
                    </label>
                    <input
                      dir="ltr"
                      value={trustReceivers.sol}
                      onChange={(e) => setTrustReceivers({ ...trustReceivers, sol: e.target.value })}
                      placeholder="Solana address..."
                      className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-dim mb-1">
                      {isFa ? 'آدرس دریافت TON (اختیاری):' : 'TON Receiver (optional):'}
                    </label>
                    <input
                      dir="ltr"
                      value={trustReceivers.ton}
                      onChange={(e) => setTrustReceivers({ ...trustReceivers, ton: e.target.value })}
                      placeholder="UQ... / EQ..."
                      className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold">
                {isFa ? 'ذخیره تنظیمات تسویه کارمزد، Trust Wallet و KYC' : 'Save Fee Receivers, Trust Wallet & KYC'}
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

          {/* Comprehensive 3% Fee Report, Prepayments & On-Chain Verification */}
          <div className="surface-card p-5 space-y-4 text-xs border border-amber-500/25">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? 'گزارش جامع مالی کارمزد ۳٪، پیش‌پرداخت و تایید تراکنش آن‌چین' : 'Comprehensive 3% Server Fee Report & On-Chain Ledger'}</span>
                </h3>
                <p className="text-[11px] text-dim mt-0.5">
                  {isFa
                    ? 'ردیابی ریز به ریز کارمزد ۳٪ بدهکار، تراکنش‌های در انتظار تایید شبکه (EVM/TRON/Solana)، اعتبارهای پیش‌پرداخت و تایید/رد دستی.'
                    : 'Full accounting of accrued 3% fees, pending on-chain settlements (EVM/TRON/Solana), prepaid credits, and manual override controls.'}
                </p>
              </div>
              <button
                type="button"
                disabled={feeReconcileBusy}
                onClick={async () => {
                  setFeeReconcileBusy(true);
                  try {
                    const res = await apiFetch<{
                      ok: boolean;
                      reconcile?: { checked: number; confirmed: number; rejected: number; stillPending: number };
                      report?: typeof feeReport;
                    }>('/api/admin/fee-report/reconcile', { method: 'POST' });
                    if (res.report) setFeeReport(res.report);
                    const rc = res.reconcile;
                    setMsg(
                      isFa
                        ? `بررسی آن‌چین انجام شد ✅ (بررسی: ${rc?.checked ?? 0} · تایید خودکار: ${rc?.confirmed ?? 0} · رد: ${rc?.rejected ?? 0} · معلق: ${rc?.stillPending ?? 0})`
                        : `Reconcile complete: checked ${rc?.checked ?? 0}, confirmed ${rc?.confirmed ?? 0}, rejected ${rc?.rejected ?? 0}`
                    );
                    await load();
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Reconcile failed');
                  } finally {
                    setFeeReconcileBusy(false);
                  }
                }}
                className="px-3.5 py-2 rounded-xl btn-emerald font-black inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${feeReconcileBusy ? 'animate-spin' : ''}`} />
                <span>{feeReconcileBusy ? (isFa ? 'در حال استعلام شبکه...' : 'Checking RPC...') : isFa ? 'بررسی و تایید آن‌چین الان' : 'Verify Pending On-Chain Now'}</span>
              </button>
            </div>

            {feeReport && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'بدهی باز ۳٪ کل' : 'Accrued Debt'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-loss mt-0.5">${feeReport.totals.totalAccruedDebtUsd.toFixed(2)}</div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'در انتظار تایید شبکه' : 'Pending Verify'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-amber-400 mt-0.5">${feeReport.totals.totalPendingVerifyUsd.toFixed(2)}</div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'وصول‌شده قطعی' : 'Settled Total'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-jade mt-0.5">${feeReport.totals.totalSettledUsd.toFixed(2)}</div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'پیش‌پرداخت کاربران' : 'Prepaid Credits'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-brand mt-0.5">${feeReport.totals.totalPrepaidCreditUsd.toFixed(2)}</div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'جرایم تاخیر' : 'Penalties'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-flame mt-0.5">${feeReport.totals.totalPenaltyUsd.toFixed(2)}</div>
                  </div>
                  <div className="surface-soft rounded-2xl p-3 border hairline">
                    <div className="text-[10px] text-dim font-bold">{isFa ? 'حساب قفل / اخطار' : 'Locked / Warn'}</div>
                    <div dir="ltr" className="font-mono-num font-black text-sm text-main mt-0.5">
                      {feeReport.totals.lockedUsersCount} / {feeReport.totals.warningUsersCount}
                    </div>
                  </div>
                </div>

                {/* User Fee Breakdown */}
                {feeReport.users.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-dim border-b hairline">
                        <tr>
                          <th className="py-2 px-2 text-start">{isFa ? 'کاربر' : 'User'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'وضعیت' : 'Standing'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'بدهکار' : 'Accrued'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'در انتظار' : 'Pending'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'پیش‌پرداخت' : 'Prepaid'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'پرداخت‌شده' : 'Settled'}</th>
                          <th className="py-2 px-2 text-start">{isFa ? 'سود واقعی' : 'Live Profit'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y hairline">
                        {feeReport.users.slice(0, 30).map((u) => (
                          <tr key={u.user_id}>
                            <td className="py-2 px-2">
                              <div className="font-bold text-main">{u.username}</div>
                              <div className="text-[10px] text-dim">{u.email}</div>
                            </td>
                            <td className="py-2 px-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  u.lock_status === 'LOCKED'
                                    ? 'bg-rose-500/20 text-loss'
                                    : u.lock_status === 'WARNING'
                                      ? 'bg-amber-500/20 text-amber-400'
                                      : 'badge-signal'
                                }`}
                              >
                                {u.lock_status}
                              </span>
                            </td>
                            <td dir="ltr" className="py-2 px-2 font-mono-num text-loss">${Number(u.accrued_usd || 0).toFixed(2)}</td>
                            <td dir="ltr" className="py-2 px-2 font-mono-num text-amber-400">${Number(u.pending_verify_usd || 0).toFixed(2)}</td>
                            <td dir="ltr" className="py-2 px-2 font-mono-num text-brand">${Number(u.prepaid_credit_usd || 0).toFixed(2)}</td>
                            <td dir="ltr" className="py-2 px-2 font-mono-num text-jade">${Number(u.settled_usd || 0).toFixed(2)}</td>
                            <td dir="ltr" className="py-2 px-2 font-mono-num text-main">${Number(u.profitable_pnl_usd || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Detailed Fee Ledger Entries with Manual Decide */}
                {feeReport.ledgerEntries.length > 0 && (
                  <div className="space-y-2 pt-2 border-t hairline">
                    <p className="font-black text-main">{isFa ? 'دفتر کل تراکنش‌ها و کارمزد ۳٪ (با تایید/رد دستی):' : 'Server Fee Ledger Entries (Manual Verify/Override):'}</p>
                    <div className="max-h-96 overflow-y-auto space-y-1.5 pe-1">
                      {feeReport.ledgerEntries.slice(0, 40).map((entry) => (
                        <div key={entry.id} className="surface-soft rounded-2xl p-2.5 border hairline flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-black text-main">{entry.username || entry.email || entry.user_id}</span>
                              <span className="px-2 py-0.5 rounded-full bg-white/5 border hairline text-[10px] font-mono-num">{entry.source}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  entry.status === 'PENDING_VERIFY'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : entry.status === 'ACCRUED'
                                      ? 'bg-rose-500/15 text-loss'
                                      : entry.status === 'REJECTED'
                                        ? 'bg-rose-600/25 text-rose-400'
                                        : 'badge-signal'
                                }`}
                              >
                                {entry.status}
                              </span>
                              <span dir="ltr" className="font-mono-num font-black text-main">${Number(entry.fee_usd || 0).toFixed(2)}</span>
                              {entry.symbol && <span className="text-[10px] text-dim">{entry.symbol}</span>}
                            </div>
                            {entry.tx_hash && (
                              <div dir="ltr" className="text-[10px] font-mono-num text-sub break-all">TX: {entry.tx_hash}</div>
                            )}
                            {entry.note && <div className="text-[10px] text-dim">{entry.note}</div>}
                          </div>
                          {(entry.status === 'PENDING_VERIFY' || entry.status === 'ACCRUED') && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  const res = await apiFetch<{ report?: typeof feeReport }>(`/api/admin/fee-report/ledger/${entry.id}/decide`, {
                                    method: 'POST',
                                    body: JSON.stringify({ approve: true }),
                                  });
                                  if (res.report) setFeeReport(res.report);
                                  setMsg(isFa ? 'ردیف کارمزد تایید و تسویه شد ✅' : 'Fee entry approved');
                                  void load();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#059669] text-white font-bold"
                              >
                                {isFa ? 'تایید دستی' : 'Approve'}
                              </button>
                              {entry.status === 'PENDING_VERIFY' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await apiFetch<{ report?: typeof feeReport }>(`/api/admin/fee-report/ledger/${entry.id}/decide`, {
                                      method: 'POST',
                                      body: JSON.stringify({ approve: false, note: isFa ? 'تراکنش نامعتبر در بررسی دستی' : 'Invalid tx on manual audit' }),
                                    });
                                    if (res.report) setFeeReport(res.report);
                                    setMsg(isFa ? 'تراکنش رد و به حالت بدهی/برگشت تغییر یافت.' : 'Fee entry rejected');
                                    void load();
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-loss font-bold"
                                >
                                  {isFa ? 'رد' : 'Reject'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </div>
          )}

          {(adminSection === 'all' || adminSection === 'site_controls') && (
          <div className="space-y-5 tab-enter">
            {/* Site Maintenance / Temporary Platform Lock */}
            <div className={`panel rounded-3xl p-5 sm:p-6 space-y-4 border ${siteMaintenanceForm.enabled ? 'border-rose-500/50 bg-rose-500/5' : 'border-emerald-500/25'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                    <ShieldAlert className={`w-5 h-5 ${siteMaintenanceForm.enabled ? 'text-loss' : 'text-jade'}`} />
                    <span>{isFa ? 'قفل موقت سایت / حالت تعمیرات و آپدیت (Maintenance Mode)' : 'Site Maintenance Lock & Temporary Pause'}</span>
                  </h3>
                  <p className="text-xs text-sub mt-1">
                    {isFa
                      ? 'با فعال کردن این سوئیچ، کل سایت برای همه کاربران عادی موقتاً بسته شده و صفحه شیک اطلاع‌رسانی آپدیت نمایش داده می‌شود. پنل ادمین و ورود مدیر همیشه باز می‌ماند تا هر لحظه سایت را دوباره باز کنید.'
                      : 'When enabled, all non-admin users see a dedicated maintenance screen and API requests return 503 SITE_MAINTENANCE. Admin console and admin login always remain accessible.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={maintenanceBusy}
                  onClick={async () => {
                    const nextEnabled = !siteMaintenanceForm.enabled;
                    setMaintenanceBusy(true);
                    try {
                      await apiFetch('/api/admin/site-maintenance', {
                        method: 'PUT',
                        body: JSON.stringify({ ...siteMaintenanceForm, enabled: nextEnabled }),
                      });
                      setSiteMaintenanceForm((p) => ({ ...p, enabled: nextEnabled, updatedAt: new Date().toISOString() }));
                      setMsg(
                        nextEnabled
                          ? isFa
                            ? '🔒 حالت تعمیرات فعال شد؛ دسترسی کاربران عادی بسته و پنل ادمین باز است.'
                            : 'Maintenance lock enabled'
                          : isFa
                            ? '🔓 سایت مجدداً برای همه کاربران بازگشایی شد!'
                            : 'Site reopened for all users'
                      );
                      void load();
                    } finally {
                      setMaintenanceBusy(false);
                    }
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-2 transition shadow-md ${
                    siteMaintenanceForm.enabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  <span>
                    {siteMaintenanceForm.enabled
                      ? isFa
                        ? '🔓 بازگشایی فوری سایت برای کاربران'
                        : '🔓 Reopen Site Now'
                      : isFa
                        ? '🔒 بستن موقت سایت (حالت تعمیرات)'
                        : '🔒 Enable Maintenance Lock'}
                  </span>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'عنوان صفحه تعمیرات (فارسی):' : 'Maintenance Title (FA):'}</label>
                  <input
                    value={siteMaintenanceForm.titleFa}
                    onChange={(e) => setSiteMaintenanceForm((p) => ({ ...p, titleFa: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'عنوان انگلیسی:' : 'Maintenance Title (EN):'}</label>
                  <input
                    dir="ltr"
                    value={siteMaintenanceForm.titleEn}
                    onChange={(e) => setSiteMaintenanceForm((p) => ({ ...p, titleEn: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'متن پیام به کاربران (فارسی):' : 'Message (FA):'}</label>
                  <textarea
                    rows={3}
                    value={siteMaintenanceForm.messageFa}
                    onChange={(e) => setSiteMaintenanceForm((p) => ({ ...p, messageFa: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'متن پیام انگلیسی:' : 'Message (EN):'}</label>
                  <textarea
                    dir="ltr"
                    rows={3}
                    value={siteMaintenanceForm.messageEn}
                    onChange={(e) => setSiteMaintenanceForm((p) => ({ ...p, messageEn: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'زمان تخمینی بازگشت (اختیاری):' : 'Estimated Return (ETA):'}</label>
                  <input
                    value={siteMaintenanceForm.eta}
                    onChange={(e) => setSiteMaintenanceForm((p) => ({ ...p, eta: e.target.value }))}
                    placeholder={isFa ? 'مثلاً تا ۳۰ دقیقه دیگر' : 'e.g. ~30 minutes'}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={maintenanceBusy}
                    onClick={async () => {
                      setMaintenanceBusy(true);
                      try {
                        await apiFetch('/api/admin/site-maintenance', {
                          method: 'PUT',
                          body: JSON.stringify(siteMaintenanceForm),
                        });
                        setMsg(isFa ? 'متن و تنظیمات حالت تعمیرات ذخیره شد ✅' : 'Maintenance copy saved');
                        void load();
                      } finally {
                        setMaintenanceBusy(false);
                      }
                    }}
                    className="w-full py-2.5 rounded-xl btn-cobalt font-black"
                  >
                    {isFa ? 'ذخیره متن و زمان صفحه تعمیرات' : 'Save Maintenance Settings'}
                  </button>
                </div>
              </div>
            </div>

            {/* Targeted & Global User Popup Announcements Manager */}
            <div className="panel rounded-3xl p-5 sm:p-6 space-y-4 border border-sky-500/25">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-sky-400" />
                  <span>{isFa ? 'پاپ‌آپ‌های اطلاع‌رسانی فوری برای کاربران (همه کاربران یا یک کاربر خاص)' : 'Urgent In-App Popup Announcements (All Users or Specific User)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'پیام‌های مهم به محض ورود یا باز کردن داشبورد به صورت پنجره پاپ‌آپ (Modal) به کاربر نمایش داده می‌شوند و پس از تایید، دیگر تکرار نمی‌شوند.'
                    : 'Displays a prominent in-app modal dialog to all users or a targeted user until acknowledged.'}
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPopupBusy(true);
                  try {
                    await apiFetch('/api/admin/popups', {
                      method: 'POST',
                      body: JSON.stringify({
                        titleFa: popupForm.titleFa,
                        titleEn: popupForm.titleEn || undefined,
                        bodyFa: popupForm.bodyFa,
                        bodyEn: popupForm.bodyEn || undefined,
                        severity: popupForm.severity,
                        targetScope: popupForm.targetUserId ? 'USER' : 'ALL',
                        targetUserId: popupForm.targetUserId || null,
                        ctaLabelFa: popupForm.ctaLabelFa || undefined,
                        ctaRoute: popupForm.ctaRoute || undefined,
                        dismissible: popupForm.dismissible,
                        expiresAt: popupForm.expiresAt || null,
                      }),
                    });
                    setPopupForm({
                      titleFa: '',
                      titleEn: '',
                      bodyFa: '',
                      bodyEn: '',
                      severity: 'INFO',
                      targetUserId: '',
                      ctaLabelFa: '',
                      ctaRoute: '',
                      dismissible: true,
                      expiresAt: '',
                    });
                    setMsg(isFa ? 'پاپ‌آپ اطلاع‌رسانی منتشر شد ✅' : 'Popup announcement published');
                    const pRes = await apiFetch<{ popups?: typeof adminPopups }>('/api/admin/popups').catch(() => null);
                    if (pRes?.popups) setAdminPopups(pRes.popups);
                    void load();
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Popup creation failed');
                  } finally {
                    setPopupBusy(false);
                  }
                }}
                className="surface-soft rounded-2xl p-4 border hairline grid sm:grid-cols-2 gap-3 text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'عنوان پاپ‌آپ (فارسی) *:' : 'Title (FA) *:'}</label>
                  <input
                    required
                    value={popupForm.titleFa}
                    onChange={(e) => setPopupForm((p) => ({ ...p, titleFa: e.target.value }))}
                    placeholder={isFa ? 'مثلاً اطلاعیه مهم تسویه یا آپدیت ربات' : 'Popup headline'}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'عنوان انگلیسی (اختیاری):' : 'Title (EN):'}</label>
                  <input
                    dir="ltr"
                    value={popupForm.titleEn}
                    onChange={(e) => setPopupForm((p) => ({ ...p, titleEn: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'متن پیام (فارسی) *:' : 'Body (FA) *:'}</label>
                  <textarea
                    required
                    rows={3}
                    value={popupForm.bodyFa}
                    onChange={(e) => setPopupForm((p) => ({ ...p, bodyFa: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'متن انگلیسی (اختیاری):' : 'Body (EN):'}</label>
                  <textarea
                    dir="ltr"
                    rows={3}
                    value={popupForm.bodyEn}
                    onChange={(e) => setPopupForm((p) => ({ ...p, bodyEn: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'سطح اهمیت / رنگ:' : 'Severity:'}</label>
                  <select
                    value={popupForm.severity}
                    onChange={(e) => setPopupForm((p) => ({ ...p, severity: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  >
                    <option value="INFO">INFO (اطلاعاتی آبی)</option>
                    <option value="SUCCESS">SUCCESS (موفقیت/هدیه سبز)</option>
                    <option value="WARNING">WARNING (هشدار نارنجی)</option>
                    <option value="MAINTENANCE">MAINTENANCE (فنی/آپدیت)</option>
                    <option value="URGENT">URGENT (فوری و اضطراری قرمز)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'مخاطب:' : 'Target Audience:'}</label>
                  <select
                    value={popupForm.targetUserId}
                    onChange={(e) => setPopupForm((p) => ({ ...p, targetUserId: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  >
                    <option value="">{isFa ? '🌐 همه کاربران سایت' : '🌐 ALL USERS'}</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        👤 {u.username} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'متن دکمه اقدام (اختیاری):' : 'CTA Button Label:'}</label>
                  <input
                    value={popupForm.ctaLabelFa}
                    onChange={(e) => setPopupForm((p) => ({ ...p, ctaLabelFa: e.target.value }))}
                    placeholder={isFa ? 'مثلاً تسویه کارمزد / رفتن به رادار' : 'e.g. Open Fees'}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-dim mb-1">{isFa ? 'مسیر تب مقصد (اختیاری):' : 'Target Tab Route:'}</label>
                  <select
                    value={popupForm.ctaRoute}
                    onChange={(e) => setPopupForm((p) => ({ ...p, ctaRoute: e.target.value }))}
                    className="w-full surface-input rounded-xl px-3 py-2"
                  >
                    <option value="">{isFa ? 'بدون لینک' : 'No route'}</option>
                    <option value="overview">overview (داشبورد)</option>
                    <option value="dex">dex (Trust Wallet و رادار)</option>
                    <option value="copy">copy (کپی‌ترید)</option>
                    <option value="terminal">terminal (فیوچرز)</option>
                    <option value="markets">markets (اسپات/بازار)</option>
                    <option value="pricing">pricing (خزانه و کارمزد ۳٪)</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 font-bold text-main cursor-pointer">
                    <input
                      type="checkbox"
                      checked={popupForm.dismissible}
                      onChange={(e) => setPopupForm((p) => ({ ...p, dismissible: e.target.checked }))}
                    />
                    <span>{isFa ? 'کاربر بتواند با دکمه بستن / تایید پاپ‌آپ را ببندد' : 'User can dismiss popup'}</span>
                  </label>
                  <button type="submit" disabled={popupBusy} className="px-5 py-2.5 rounded-xl btn-emerald font-black">
                    {popupBusy ? '...' : isFa ? '🚀 انتشار فوری پاپ‌آپ' : '🚀 Publish Popup'}
                  </button>
                </div>
              </form>

              {adminPopups.length > 0 && (
                <div className="space-y-2 text-xs">
                  <p className="font-black text-main">{isFa ? 'لیست پاپ‌آپ‌های ثبت‌شده:' : 'Active & Archived Popups:'}</p>
                  {adminPopups.map((pop) => (
                    <div key={pop.id} className="surface-soft rounded-2xl p-3 border hairline flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${pop.is_active ? 'badge-signal' : 'bg-slate-500/20 text-dim'}`}>
                            {pop.is_active ? (isFa ? 'فعال' : 'ACTIVE') : isFa ? 'غیرفعال' : 'PAUSED'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border hairline text-[10px] font-bold">{pop.severity}</span>
                          <span className="font-black text-main">{pop.title_fa}</span>
                          <span className="text-[10px] text-dim">
                            ({pop.target_user_id ? `👤 ${pop.target_username || pop.target_user_id}` : isFa ? '🌐 همه کاربران' : '🌐 All'}) · 👀 {pop.ack_count ?? 0} {isFa ? 'تایید' : 'acks'}
                          </span>
                        </div>
                        <p className="text-[11px] text-sub line-clamp-2">{pop.body_fa}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/popups/${pop.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ isActive: !pop.is_active }),
                            });
                            void load();
                          }}
                          className="px-2.5 py-1 rounded-lg surface-card border hairline font-bold text-main"
                        >
                          {pop.is_active ? (isFa ? 'توقف' : 'Pause') : isFa ? 'فعال‌سازی' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/popups/${pop.id}`, { method: 'DELETE' });
                            void load();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-loss font-bold"
                        >
                          {isFa ? 'حذف' : 'Delete'}
                        </button>
                      </div>
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
                      placeholder={isFa ? 'مثلاً: ۳ معامله اول رایگان + رادار نهنگ‌ها' : 'Banner title...'}
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
                      <option value="pricing">{isFa ? 'کارمزد ۳٪، درآمد و رفرال (pricing)' : '3% Fees & Referral (pricing)'}</option>
                      <option value="radar">{isFa ? 'رادار و استراتژی شکار (radar)' : 'Radar & IDE (radar)'}</option>
                      <option value="aichat">{isFa ? 'چت هوش مصنوعی و تحلیل عکس چارت (aichat)' : 'AI Vision Chat (aichat)'}</option>
                {ecosystemChannels.official && (
                  <option value={ecosystemChannels.officialInvite || `https://t.me/${ecosystemChannels.official.replace(/^@/, '')}`}>
                    {isFa ? `چنل رسمی و اصلی (${ecosystemChannels.official})` : `Official Channel (${ecosystemChannels.official})`}
                  </option>
                )}
                {ecosystemChannels.signals && (
                  <option value={ecosystemChannels.signalsInvite || `https://t.me/${ecosystemChannels.signals.replace(/^@/, '')}`}>
                    {isFa ? `01. سیگنال دلارینو (${ecosystemChannels.signals})` : `01. Signals (${ecosystemChannels.signals})`}
                  </option>
                )}
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
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#0B1E5B] via-[#1652F0] to-[#059669] border-2 border-[var(--gold)]/70 shadow-lg flex flex-col items-center justify-center text-white gap-1">
                    <span className="font-display font-black text-2xl tracking-tight">AK</span>
                    <span className="text-[9px] font-bold opacity-85">{isFa ? 'تصویر بنیان‌گذار' : 'Founder'}</span>
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
          <div className="surface-card p-4 sm:p-5 space-y-3 tab-enter">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black flex items-center gap-2 text-main">
                <Users className="w-4 h-4 text-brand" />
                <span>{isFa ? 'مدیریت کاربران، احراز هویت شماره و Trust Wallet' : 'Users, Phone KYC & Trust Wallets'}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isFa ? 'جستجو نام، ایمیل، تلفن، آدرس...' : 'Search user / phone / wallet...'}
                  className="surface-input rounded-xl px-3 py-1.5 text-xs flex-1 sm:flex-initial"
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

            {(() => {
              const filteredUsers = data.users.filter((u) => {
                if (userFilter === 'kyc_verified' && u.phone_verified !== 1) return false;
                if (userFilter === 'trust_wallet' && !u.trust_wallet_address && !u.trust_wallet_tron) return false;
                if (userFilter === 'unverified' && u.phone_verified === 1) return false;
                const q = userSearch.trim().toLowerCase();
                if (!q) return true;
                return [u.username, u.email, u.telegram_id, u.telegram_username, u.phone_number, u.trust_wallet_address]
                  .filter(Boolean)
                  .some((v) => String(v).toLowerCase().includes(q));
              });
              return (
                <>
                  {/* Mobile Card Layout (Prevents Horizontal Clipping on 390px) */}
                  <div className="md:hidden space-y-2.5">
                    {filteredUsers.map((u) => (
                      <div key={u.id} className="surface-soft rounded-2xl p-3.5 border hairline space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-black text-main truncate">{u.username}</div>
                            <div className="text-[11px] text-dim truncate" dir="ltr">{u.email}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--panel)] border hairline text-main font-bold text-[10px]">{u.role}</span>
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--panel)] border hairline text-dim text-[10px]">{u.ui_mode || 'simple'}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span dir="ltr" className="font-mono-num text-sub">
                            {u.telegram_username ? `@${u.telegram_username}` : u.telegram_id || '—'}
                          </span>
                          <span className={`inline-flex items-center gap-1 ${u.phone_verified === 1 ? 'text-jade font-bold' : 'text-amber-400'}`}>
                            {u.phone_verified === 1 ? <CheckCircle2 className="w-3 h-3" /> : null}
                            <span dir="ltr">{u.phone_number || (u.phone_verified === 1 ? 'Verified' : 'Unverified')}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {u.trust_wallet_address && (
                            <span dir="ltr" className="badge-signal px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono-num">
                              <Wallet className="w-3 h-3" />
                              <span>{u.trust_wallet_address.slice(0, 6)}...{u.trust_wallet_address.slice(-4)}</span>
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-jade font-bold" dir="ltr">
                            {isFa ? `اعتبار: $${Number(u.fee_credit_usd || 0).toFixed(2)}` : `Credit: $${Number(u.fee_credit_usd || 0).toFixed(2)}`}
                          </span>
                          {Number(u.accruedFeeUsd || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-500 font-bold" dir="ltr">
                              {isFa ? `معوق ۳٪: $${Number(u.accruedFeeUsd).toFixed(2)}` : `3% Due: $${Number(u.accruedFeeUsd).toFixed(2)}`}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t hairline">
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-jade font-bold text-[11px]"
                          >
                            {u.phone_verified === 1 ? (isFa ? 'لغو KYC' : 'Revoke KYC') : (isFa ? 'تایید KYC' : 'Approve KYC')}
                          </button>
                          {roleLower === 'owner' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}/fee-credit`, {
                                  method: 'POST',
                                  body: JSON.stringify({ amountUsd: 5, note: 'Owner grant' }),
                                });
                                setMsg(isFa ? `$5 اعتبار کارمزد ۳٪ به ${u.username} اعطا شد ✅` : `Granted $5 fee credit to ${u.username}`);
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-bold inline-flex items-center gap-0.5 text-[11px]"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>+$5</span>
                            </button>
                          )}
                          {roleLower === 'owner' && Number(u.accruedFeeUsd || 0) > 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}/reset-fee-debt`, { method: 'POST' });
                                setMsg(isFa ? `بدهی کارمزد ۳٪ کاربر ${u.username} تسویه/بخشیده شد ✅` : '3% fee debt waived');
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-400 font-bold text-[11px]"
                            >
                              {isFa ? 'بخشش ۳٪' : 'Waive 3%'}
                            </button>
                          )}
                          {(u.role.toLowerCase() === 'owner' || u.role.toLowerCase() === 'admin') &&
                            (roleLower === 'owner' || u.id === currentUser.id) && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      isFa
                                        ? `حساب مدیریتی ${u.username} بدون حذف شدن و با حفظ نقش ${u.role}، کاملاً به حالت ۰ بازنشانی شود؟`
                                        : `Reset privileged account ${u.username} to fresh zero state while keeping ${u.role} role?`
                                    )
                                  )
                                    return;
                                  await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                  setMsg(
                                    isFa
                                      ? `حساب ${u.username} صفر شد و دسترسی ${u.role} حفظ گردید.`
                                      : `Reset ${u.username} to 0 (${u.role} preserved)`
                                  );
                                  onUserUpdated?.();
                                  void load();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold inline-flex items-center gap-1 text-[11px]"
                                title={isFa ? 'صفرسازی به کاربر جدید با حفظ نقش مدیر' : 'Reset to 0 (Keep Admin)'}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>{isFa ? 'صفرسازی ۰' : 'Reset 0'}</span>
                              </button>
                            )}
                          {u.role.toLowerCase() !== 'owner' && (
                            <>
                              {roleLower === 'owner' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/users/${u.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ role: u.role.toLowerCase() === 'admin' ? 'user' : 'admin' }),
                                    });
                                    void load();
                                  }}
                                  className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand font-bold text-[11px]"
                                >
                                  {u.role.toLowerCase() === 'admin' ? 'Demote' : 'Make Admin'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/users/${u.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ is_blocked: !u.is_blocked }),
                                  });
                                  void load();
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss font-bold text-[11px]"
                              >
                                {u.is_blocked ? 'Unblock' : 'Block'}
                              </button>
                              {roleLower === 'owner' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!window.confirm(isFa ? `آیا از حذف کامل کاربر ${u.username} و تمام تاریخچه‌اش مطمئنید؟` : `Permanently delete ${u.username}?`)) return;
                                    await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                    setMsg(isFa ? `کاربر ${u.username} حذف شد.` : `Deleted ${u.username}`);
                                    void load();
                                  }}
                                  className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-400 font-bold inline-flex items-center"
                                  title={isFa ? 'حذف کامل کاربر' : 'Delete User'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden md:block overflow-x-auto">
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
                        {filteredUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 px-2 text-main font-semibold">
                              <div>{u.username}</div>
                              <div className="text-[11px] text-dim">{u.email}</div>
                            </td>
                            <td className="py-2.5 px-2 font-mono-num text-sub">
                              <div dir="ltr" className="inline-block text-start">{u.telegram_username ? `@${u.telegram_username}` : u.telegram_id || '-'}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`inline-flex items-center gap-1 ${u.phone_verified === 1 ? 'text-jade font-bold' : 'text-amber-400'}`}>
                                  {u.phone_verified === 1 ? <CheckCircle2 className="w-3 h-3" /> : null}
                                  <span dir="ltr">{u.phone_number || (u.phone_verified === 1 ? 'Verified' : 'Unverified')}</span>
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
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-jade font-bold" dir="ltr">
                                  {isFa ? `اعتبار کارمزد: $${Number(u.fee_credit_usd || 0).toFixed(2)}` : `Credit: $${Number(u.fee_credit_usd || 0).toFixed(2)}`}
                                </span>
                                {Number(u.accruedFeeUsd || 0) > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-bold" dir="ltr">
                                    {isFa ? `معوق ۳٪: $${Number(u.accruedFeeUsd).toFixed(2)}` : `3% Due: $${Number(u.accruedFeeUsd).toFixed(2)}`}
                                  </span>
                                )}
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
                              {roleLower === 'owner' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiFetch(`/api/admin/users/${u.id}/fee-credit`, {
                                        method: 'POST',
                                        body: JSON.stringify({ amountUsd: 5, note: 'Owner grant' }),
                                      });
                                      setMsg(isFa ? `$5 اعتبار کارمزد ۳٪ به ${u.username} اعطا شد ✅` : `Granted $5 fee credit to ${u.username}`);
                                      void load();
                                    }}
                                    className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-bold inline-flex items-center gap-0.5"
                                  >
                                    <DollarSign className="w-3 h-3" />
                                    <span>+$5</span>
                                  </button>
                                  {Number(u.accruedFeeUsd || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await apiFetch(`/api/admin/users/${u.id}/reset-fee-debt`, { method: 'POST' });
                                        setMsg(isFa ? `بدهی کارمزد ۳٪ کاربر ${u.username} تسویه/بخشیده شد ✅` : '3% fee debt waived');
                                        void load();
                                      }}
                                      className="px-2 py-1 rounded-lg bg-sky-500/15 text-sky-400 font-bold"
                                    >
                                      {isFa ? 'بخشش ۳٪' : 'Waive 3%'}
                                    </button>
                                  )}
                                </>
                              )}
                              {(u.role.toLowerCase() === 'owner' || u.role.toLowerCase() === 'admin') &&
                                (roleLower === 'owner' || u.id === currentUser.id) && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        !window.confirm(
                                          isFa
                                            ? `حساب مدیریتی ${u.username} بدون حذف شدن و با حفظ نقش ${u.role}، کاملاً به حالت ۰ بازنشانی شود؟`
                                            : `Reset privileged account ${u.username} to fresh zero state while keeping ${u.role} role?`
                                        )
                                      )
                                        return;
                                      await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                      setMsg(
                                        isFa
                                          ? `حساب ${u.username} صفر شد و دسترسی ${u.role} حفظ گردید.`
                                          : `Reset ${u.username} to 0 (${u.role} preserved)`
                                      );
                                      onUserUpdated?.();
                                      void load();
                                    }}
                                    className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold inline-flex items-center gap-1"
                                    title={isFa ? 'صفرسازی به کاربر جدید با حفظ نقش مدیر' : 'Reset to 0 (Keep Admin)'}
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>{isFa ? 'صفرسازی ۰' : 'Reset 0'}</span>
                                  </button>
                                )}
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
                                  {roleLower === 'owner' && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!window.confirm(isFa ? `آیا از حذف کامل کاربر ${u.username} و تمام تاریخچه‌اش مطمئنید؟` : `Permanently delete ${u.username}?`)) return;
                                        await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                        setMsg(isFa ? `کاربر ${u.username} حذف شد.` : `Deleted ${u.username}`);
                                        void load();
                                      }}
                                      className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-400 font-bold inline-flex items-center"
                                      title={isFa ? 'حذف کامل کاربر' : 'Delete User'}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-sub">{isFa ? 'ثبت معامله برای کپی توسط کاربران:' : 'Publish Trade for Users to Copy:'}</p>
                    <TpSlModeSwitch
                      mode={traderTpSlMode}
                      onChange={(next) => {
                        if (next === 'PCT' && newTraderTrade.entryPrice > 0) {
                          const pSl = calcPctFromPrice({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'SL', targetPrice: newTraderTrade.stopLoss });
                          const p1 = calcPctFromPrice({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', targetPrice: newTraderTrade.tp1 });
                          const p2 = calcPctFromPrice({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', targetPrice: newTraderTrade.tp2 });
                          const p3 = calcPctFromPrice({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', targetPrice: newTraderTrade.tp3 });
                          setTraderTpSlPcts({
                            stopLoss: pSl !== null ? String(pSl) : '2',
                            tp1: p1 !== null ? String(p1) : '3.5',
                            tp2: p2 !== null ? String(p2) : '',
                            tp3: p3 !== null ? String(p3) : '',
                          });
                        }
                        setTraderTpSlMode(next);
                      }}
                      isFa={isFa}
                      compact
                    />
                  </div>
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
                    {traderTpSlMode === 'PRICE' ? (
                      <>
                        <input type="number" step="any" value={newTraderTrade.stopLoss} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, stopLoss: Number(e.target.value) })} placeholder="SL" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                        <input type="number" step="any" value={newTraderTrade.tp1} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp1: Number(e.target.value) })} placeholder="TP1" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                        <input type="number" step="any" value={newTraderTrade.tp2} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp2: Number(e.target.value) })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                        <input type="number" step="any" value={newTraderTrade.tp3} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, tp3: Number(e.target.value) })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          step="any"
                          value={traderTpSlPcts.stopLoss}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTraderTpSlPcts((p) => ({ ...p, stopLoss: v }));
                            const px = calcPriceFromPct({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'SL', pct: Number(v) });
                            if (px !== null) setNewTraderTrade((t) => ({ ...t, stopLoss: px }));
                          }}
                          placeholder="SL %"
                          title={isFa ? `حد ضرر درصدی (≈ $${newTraderTrade.stopLoss})` : `SL % (≈ $${newTraderTrade.stopLoss})`}
                          className="surface-input rounded-xl px-2 py-2 font-mono-num"
                        />
                        <input
                          type="number"
                          step="any"
                          value={traderTpSlPcts.tp1}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTraderTpSlPcts((p) => ({ ...p, tp1: v }));
                            const px = calcPriceFromPct({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', pct: Number(v) });
                            if (px !== null) setNewTraderTrade((t) => ({ ...t, tp1: px }));
                          }}
                          placeholder="TP1 %"
                          title={isFa ? `TP1 درصدی (≈ $${newTraderTrade.tp1})` : `TP1 % (≈ $${newTraderTrade.tp1})`}
                          className="surface-input rounded-xl px-2 py-2 font-mono-num"
                        />
                        <input
                          type="number"
                          step="any"
                          value={traderTpSlPcts.tp2}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTraderTpSlPcts((p) => ({ ...p, tp2: v }));
                            const px = calcPriceFromPct({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', pct: Number(v) });
                            if (px !== null) setNewTraderTrade((t) => ({ ...t, tp2: px }));
                          }}
                          placeholder="TP2 %"
                          title={isFa ? `TP2 درصدی (≈ $${newTraderTrade.tp2})` : `TP2 % (≈ $${newTraderTrade.tp2})`}
                          className="surface-input rounded-xl px-2 py-2 font-mono-num"
                        />
                        <input
                          type="number"
                          step="any"
                          value={traderTpSlPcts.tp3}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTraderTpSlPcts((p) => ({ ...p, tp3: v }));
                            const px = calcPriceFromPct({ entryPrice: newTraderTrade.entryPrice, side: newTraderTrade.side, kind: 'TP', pct: Number(v) });
                            if (px !== null) setNewTraderTrade((t) => ({ ...t, tp3: px }));
                          }}
                          placeholder="TP3 %"
                          title={isFa ? `TP3 درصدی (≈ $${newTraderTrade.tp3})` : `TP3 % (≈ $${newTraderTrade.tp3})`}
                          className="surface-input rounded-xl px-2 py-2 font-mono-num"
                        />
                      </>
                    )}
                    <input type="number" step="0.1" value={newTraderTrade.pnlPct} onChange={(e) => setNewTraderTrade({ ...newTraderTrade, pnlPct: Number(e.target.value) })} placeholder="PnL%" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                  </div>
                  {traderTpSlMode === 'PCT' && (
                    <p dir="ltr" className="text-[10px] font-mono text-dim">
                      SL ≈ ${newTraderTrade.stopLoss} · TP1 ≈ ${newTraderTrade.tp1} · TP2 ≈ ${newTraderTrade.tp2} · TP3 ≈ ${newTraderTrade.tp3}
                    </p>
                  )}
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

          {/* Google OAuth 2.0 Settings Card (Also accessible under Ops & Integrations) */}
          {renderGoogleOauthCard()}

          {/* Official DOLLARINO 1+7+1 Ecosystem Hub (Bot + Main Channel + 7 Specialized Channels & Group) */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-emerald-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <Radio className="w-5 h-5 text-jade" />
                  <span>{isFa ? 'ساختار رسمی DOLLARINO (۱ ربات رسمی + ۱ چنل اصلی + ۷ بخش اکوسیستم)' : 'Official DOLLARINO Ecosystem (1 Bot + 1 Main + 7 Sections)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'توکن ربات را وصل کنید و ربات را در کانال‌ها/گروه ادمین کنید؛ هر بخش یوزرنیم یا آیدی عددی (-100...) خودش را دارد و تمام رویدادها خودکار در کانال متناظر منتشر می‌شوند.'
                    : 'Connect the Official Bot, make it admin, and configure the Main Channel + 7 ecosystem targets (Public, Group & Private -100... IDs).'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                          ? `✅ ربات @${res.botUsername || botTokenStatus.botUsername} متصل و آماده ارسال است (${res.status || 'OK'}).`
                          : res.error || 'ربات هنوز ادمین نیست یا توکن تنظیم نشده است.',
                      });
                    } catch (e) {
                      setChannelCheck({ ok: false, message: e instanceof Error ? e.message : 'Check failed' });
                    } finally {
                      setCheckingChannel(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{checkingChannel ? '...' : isFa ? 'وضعیت ربات و وب‌هوک' : 'Bot & Webhook Status'}</span>
                </button>
                <button
                  type="button"
                  disabled={verifyingAllChannels}
                  onClick={async () => {
                    setVerifyingAllChannels(true);
                    try {
                      const r = await apiFetch<{
                        ok: boolean;
                        results?: NonNullable<typeof verifyAllResults>;
                        error?: string;
                      }>('/api/admin/channels/verify-all', { method: 'POST' });
                      if (r.results) setVerifyAllResults(r.results);
                      const readyCount = (r.results || []).filter((x) => x.ok).length;
                      setMsg(
                        r.ok
                          ? `بررسی کامل شد: ${readyCount} از ${(r.results || []).length} بخش آماده و دارای دسترسی ادمین ربات هستند.`
                          : r.error || 'بررسی با خطا مواجه شد'
                      );
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'Verify failed');
                    } finally {
                      setVerifyingAllChannels(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl btn-cobalt text-xs font-black inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{verifyingAllChannels ? '...' : isFa ? 'بررسی ادمین ربات در همه ۸ بخش' : 'Verify Admin Across All 8'}</span>
                </button>
              </div>
            </div>

            {verifyAllResults && (
              <div className="surface-soft rounded-2xl p-3 border hairline grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                {verifyAllResults.map((vr) => (
                  <div
                    key={vr.key}
                    className={`rounded-xl p-2 border ${
                      !vr.configured
                        ? 'border-zinc-500/20 bg-zinc-500/5 text-dim'
                        : vr.ok
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-main'
                          : 'border-rose-500/35 bg-rose-500/10 text-loss'
                    }`}
                  >
                    <div className="font-black truncate">{vr.label}</div>
                    <div className="font-mono text-[10px] truncate mt-0.5" dir="ltr">
                      {vr.configured ? `${vr.target}${vr.chatTitle ? ` (${vr.chatTitle})` : ''}` : isFa ? '— تنظیم‌نشده' : 'Not configured'}
                    </div>
                    <div className="text-[10px] mt-0.5 font-bold">
                      {!vr.configured
                        ? isFa
                          ? '⏳ منتظر ورود آیدی'
                          : 'Pending ID'
                        : vr.ok
                          ? `✅ ادمین تاییدشده (${vr.memberStatus})`
                          : `❌ ${vr.error || 'دسترسی ربات ندارد'}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {channelCheck && (
              <div className={`rounded-2xl p-3 text-xs font-bold border ${channelCheck.canPostMessages ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35 text-loss'}`}>
                {channelCheck.message || `Status: ${channelCheck.botStatus || 'unknown'} (${channelCheck.channelHandle || (isFa ? 'تنظیم‌نشده' : 'Unset')})`}
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
                  disabled={signalCtrlBusy}
                  onClick={() =>
                    void updateSignalControls({
                      publishSignalsToChannels,
                      publishSignalsToBotUsers,
                      alwaysOnSignals: autoPublishingCfg.alwaysOnSignals,
                      alwaysOnAiBroadcast: autoPublishingCfg.alwaysOnAiBroadcast,
                    })
                  }
                  className="px-3.5 py-1.5 rounded-xl btn-emerald font-black"
                >
                  {signalCtrlBusy ? '...' : isFa ? 'ذخیره تنظیمات خودکار و انتشار' : 'Save Auto & Signal Controls'}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                <label className={`surface-card rounded-xl p-2.5 flex items-center gap-2 border cursor-pointer font-bold text-[11px] ${publishSignalsToChannels ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/5'}`}>
                  <input
                    type="checkbox"
                    checked={publishSignalsToChannels}
                    onChange={(e) => setPublishSignalsToChannels(e.target.checked)}
                  />
                  <span>{isFa ? '📡 انتشار سیگنال در کانال‌ها' : '📡 Signals to Channels'}</span>
                </label>
                <label className={`surface-card rounded-xl p-2.5 flex items-center gap-2 border cursor-pointer font-bold text-[11px] ${publishSignalsToBotUsers ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/5'}`}>
                  <input
                    type="checkbox"
                    checked={publishSignalsToBotUsers}
                    onChange={(e) => setPublishSignalsToBotUsers(e.target.checked)}
                  />
                  <span>{isFa ? '🤖 ارسال سیگنال به ربات کاربران' : '🤖 Signals to Bot Users'}</span>
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

            {/* 3. 🌟 Official Main Channel (Public) + Official Broadcast Desk */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border border-amber-500/30 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4 text-gold" />
                    <span>{isFa ? '🌟 چنل رسمی و اصلی دلارینو (عمومی)' : '🌟 Official Main Dollarino Channel (Public)'}</span>
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'ویژه آپدیت‌های قطعی پروژه، اطلاعیه‌ها، تبلیغات، قرعه‌کشی و توصیه‌های رسمی. (از کانال سیگنال‌ها مجزاست)'
                      : 'Definitive project updates, announcements, promotions, lotteries, and official recommendations.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sub cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ecosystemChannels.enableOfficial}
                      onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableOfficial: e.target.checked }))}
                    />
                    <span>{isFa ? 'فعال' : 'Enabled'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', {
                        method: 'POST',
                        body: JSON.stringify({ channelKey: 'official', customTarget: ecosystemChannels.official }),
                      }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                      setMsg(r.ok ? `✅ تست ارسال در چنل رسمی «${r.chatTitle || ecosystemChannels.official}» موفق بود!` : `❌ خطا در چنل رسمی: ${r.error}`);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#0D47A1] text-white font-bold text-[11px]"
                  >
                    {isFa ? 'تست چنل رسمی' : 'Test Main'}
                  </button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  dir="ltr"
                  value={ecosystemChannels.official}
                  onChange={(e) => setEcosystemChannels((p) => ({ ...p, official: e.target.value }))}
                  placeholder={isFa ? '@Dollarino_Official یا -100...' : 'Official @username or -100...'}
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <input
                  dir="ltr"
                  value={ecosystemChannels.officialInvite}
                  onChange={(e) => setEcosystemChannels((p) => ({ ...p, officialInvite: e.target.value }))}
                  placeholder={isFa ? 'لینک دعوت عمومی چنل رسمی (https://t.me/... — اختیاری)' : 'Official Channel Invite URL (optional)'}
                  className="surface-input rounded-xl px-3 py-2 font-mono text-[11px]"
                />
              </div>

              <details className="surface-card rounded-xl p-3 border hairline">
                <summary className="cursor-pointer font-black text-[11px] text-amber-400">
                  {isFa ? '📣 ارسال آپدیت پروژه / تبلیغ / قرعه‌کشی / توصیه به چنل رسمی و اصلی' : '📣 Post Project Update / Promo / Lottery / Advice to Official Main Channel'}
                </summary>
                <div className="grid gap-2 mt-3">
                  <div className="grid sm:grid-cols-3 gap-2">
                    <select
                      value={officialPostForm.kind}
                      onChange={(e) =>
                        setOfficialPostForm((p) => ({
                          ...p,
                          kind: e.target.value as 'PROJECT_UPDATE' | 'ANNOUNCEMENT' | 'PROMO' | 'LOTTERY' | 'ADVICE',
                        }))
                      }
                      className="surface-input rounded-xl px-2.5 py-2 text-[11px] font-bold"
                    >
                      <option value="PROJECT_UPDATE">{isFa ? '🌟 آپدیت قطعی پروژه' : 'Project Update'}</option>
                      <option value="ANNOUNCEMENT">{isFa ? '📣 اطلاعیه رسمی' : 'Announcement'}</option>
                      <option value="PROMO">{isFa ? '🚀 تبلیغ و معرفی ویژه' : 'Promotion'}</option>
                      <option value="LOTTERY">{isFa ? '🎁 قرعه‌کشی و جایزه' : 'Lottery / Giveaway'}</option>
                      <option value="ADVICE">{isFa ? '💡 توصیه و راهنمای رسمی' : 'Official Advice'}</option>
                    </select>
                    <input
                      value={officialPostForm.title}
                      onChange={(e) => setOfficialPostForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder={isFa ? 'عنوان اطلاعیه / قرعه‌کشی...' : 'Headline...'}
                      className="sm:col-span-2 surface-input rounded-xl px-2.5 py-2 text-[11px]"
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={officialPostForm.body}
                    onChange={(e) => setOfficialPostForm((p) => ({ ...p, body: e.target.value }))}
                    placeholder={isFa ? 'متن کامل آپدیت، شرایط قرعه‌کشی، تبلیغ یا توصیه...' : 'Full announcement text...'}
                    className="surface-input rounded-xl p-2.5 text-[11px]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-sub cursor-pointer">
                      <input
                        type="checkbox"
                        checked={officialPostForm.notifyBotUsers}
                        onChange={(e) => setOfficialPostForm((p) => ({ ...p, notifyBotUsers: e.target.checked }))}
                      />
                      <span>{isFa ? 'ارسال همزمان به کاربران ربات تلگرام' : 'Also notify Bot users'}</span>
                    </label>
                    <button
                      type="button"
                      disabled={publishingOfficial}
                      onClick={async () => {
                        if (!officialPostForm.title.trim() || !officialPostForm.body.trim()) {
                          setMsg(isFa ? 'عنوان و متن پیام الزامی است.' : 'Title and body required.');
                          return;
                        }
                        setPublishingOfficial(true);
                        try {
                          const r = await apiFetch<{ ok: boolean; channelMessageId?: number; usersNotified?: number; error?: string }>(
                            '/api/admin/channel/publish-official',
                            { method: 'POST', body: JSON.stringify(officialPostForm) }
                          );
                          if (r.ok) {
                            setOfficialPostForm((p) => ({ ...p, title: '', body: '' }));
                            setMsg(`✅ در چنل رسمی و اصلی منتشر شد (Msg #${r.channelMessageId || 'OK'} · اطلاع‌رسانی به ${r.usersNotified ?? 0} کاربر ربات).`);
                          } else {
                            setMsg(`❌ خطا در انتشار چنل رسمی: ${r.error || 'Error'}`);
                          }
                        } finally {
                          setPublishingOfficial(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl btn-gold font-black text-[11px]"
                    >
                      {publishingOfficial ? '...' : isFa ? 'انتشار فوری در چنل رسمی و اصلی' : 'Publish to Official Channel'}
                    </button>
                  </div>
                </div>
              </details>
            </div>

            {/* 4. Official 7-Section Ecosystem Matrix (01..07) */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main">
                    {isFa ? '🧩 ماتریس ۷ بخش اکوسیستم DOLLARINO (عمومی / گروه / خصوصی)' : '🧩 7-Section Ecosystem Matrix (Public / Group / Private)'}
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'برای بخش‌های خصوصی (04 لاگ‌ها، 05 دیتابیس، 06 تراکنش‌ها) ربات را ادمین کنید و آیدی عددی (-100...) کانال خصوصی را وارد کنید؛ این ۳ کانال هرگز برای کاربران نمایش داده نمی‌شوند.'
                      : 'Private channels (04 Logs, 05 Database, 06 Transactions) require numeric -100... IDs and are never exposed to users.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingEcosystem}
                  onClick={async () => {
                    setSavingEcosystem(true);
                    try {
                      await apiFetch('/api/admin/settings', {
                        method: 'PUT',
                        body: JSON.stringify({
                          official_channel: ecosystemChannels.official,
                          official_channel_invite: ecosystemChannels.officialInvite,
                          channel_official_enabled: ecosystemChannels.enableOfficial ? 'true' : 'false',
                          signals_channel_id: ecosystemChannels.signals,
                          signals_channel_invite: ecosystemChannels.signalsInvite,
                          channel_signals_enabled: ecosystemChannels.enableSignals ? 'true' : 'false',
                          signals_also_official: ecosystemChannels.signalsAlsoOfficial ? 'true' : 'false',
                          results_channel_id: ecosystemChannels.results,
                          results_channel_invite: ecosystemChannels.resultsInvite,
                          channel_results_enabled: ecosystemChannels.enableResults ? 'true' : 'false',
                          community_group_id: communityGroupCfg.id.trim(),
                          community_group_invite: communityGroupCfg.invite.trim(),
                          channel_community_enabled: communityGroupCfg.id.trim() ? 'true' : 'true',
                          group_antilink_enabled: communityGroupCfg.antiLink ? 'true' : 'false',
                          group_antiforward_enabled: communityGroupCfg.antiForward ? 'true' : 'false',
                          group_antiscam_enabled: communityGroupCfg.antiScam ? 'true' : 'false',
                          group_ai_assistant_enabled: communityGroupCfg.aiAssistant ? 'true' : 'false',
                          group_welcome_enabled: communityGroupCfg.welcome ? 'true' : 'false',
                          logs_channel_id: ecosystemChannels.logs,
                          channel_logs_enabled: ecosystemChannels.enableLogs ? 'true' : 'false',
                          database_channel_id: ecosystemChannels.database,
                          channel_database_enabled: ecosystemChannels.enableDatabase ? 'true' : 'false',
                          database_report_interval_hours: String(Math.max(1, ecosystemChannels.databaseReportIntervalHours || 6)),
                          transactions_channel_id: ecosystemChannels.transactions,
                          channel_transactions_enabled: ecosystemChannels.enableTransactions ? 'true' : 'false',
                          news_channel_id: ecosystemChannels.news,
                          news_channel_invite: ecosystemChannels.newsInvite,
                          channel_news_enabled: ecosystemChannels.enableNews ? 'true' : 'false',
                          education_channel_id: ecosystemChannels.education,
                          alerts_channel_id: ecosystemChannels.alerts,
                          channel_education_enabled: ecosystemChannels.enableEdu ? 'true' : 'false',
                          channel_alerts_enabled: ecosystemChannels.enableAlerts ? 'true' : 'false',
                        }),
                      });
                      setMsg(isFa ? 'ساختار کامل ۱+۷+۱ کانال‌ها و تنظیمات گروه با موفقیت ذخیره شد ✅' : 'Full 1+7+1 Ecosystem configuration saved ✅');
                    } finally {
                      setSavingEcosystem(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl btn-emerald font-black"
                >
                  {savingEcosystem ? '...' : isFa ? 'ذخیره کل ساختار ۱+۷+۱' : 'Save Full 1+7+1 Ecosystem'}
                </button>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 01. سیگنال دلارینو (عمومی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">01. سیگنال دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-jade">عمومی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableSignals} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableSignals: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">انتشار سیگنال‌های معاملاتی و فرصت‌های شناسایی‌شده توسط موتورهای پروژه</p>
                  <input dir="ltr" value={ecosystemChannels.signals} onChange={(e) => setEcosystemChannels((p) => ({ ...p, signals: e.target.value }))} placeholder="@signals_channel یا -100..." className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <input dir="ltr" value={ecosystemChannels.signalsInvite} onChange={(e) => setEcosystemChannels((p) => ({ ...p, signalsInvite: e.target.value }))} placeholder="لینک دعوت عمومی (اختیاری)" className="surface-input w-full rounded-lg px-2.5 py-1 font-mono text-[10px]" />
                  <label className="flex items-center gap-1.5 text-[10px] text-sub cursor-pointer">
                    <input type="checkbox" checked={ecosystemChannels.signalsAlsoOfficial} onChange={(e) => setEcosystemChannels((p) => ({ ...p, signalsAlsoOfficial: e.target.checked }))} />
                    <span>هم‌رسانی سیگنال در چنل رسمی هم انجام شود</span>
                  </label>
                  <button type="button" onClick={async () => {
                    const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'signals', customTarget: ecosystemChannels.signals }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                    setMsg(r.ok ? `✅ 01. سیگنال دلارینو («${r.chatTitle || ecosystemChannels.signals}») متصل و تست شد!` : `❌ خطا در 01: ${r.error}`);
                  }} className="w-full py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست ارسال به 01. سیگنال</button>
                </div>

                {/* 02. نتایج سیگنال دلارینو (عمومی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">02. نتایج سیگنال دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-jade">عمومی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableResults} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableResults: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">نتیجه سیگنال‌ها، سود و زیان، کارت سود، درصد موفقیت و عملکرد سیستم</p>
                  <input dir="ltr" value={ecosystemChannels.results} onChange={(e) => setEcosystemChannels((p) => ({ ...p, results: e.target.value }))} placeholder="@results_channel یا -100..." className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <input dir="ltr" value={ecosystemChannels.resultsInvite} onChange={(e) => setEcosystemChannels((p) => ({ ...p, resultsInvite: e.target.value }))} placeholder="لینک دعوت عمومی (اختیاری)" className="surface-input w-full rounded-lg px-2.5 py-1 font-mono text-[10px]" />
                  <button type="button" onClick={async () => {
                    const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'results', customTarget: ecosystemChannels.results }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                    setMsg(r.ok ? `✅ 02. نتایج سیگنال («${r.chatTitle || ecosystemChannels.results}») متصل و تست شد!` : `❌ خطا در 02: ${r.error}`);
                  }} className="w-full py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست ارسال به 02. نتایج</button>
                </div>

                {/* 07. اخبار دلارینو (عمومی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border hairline">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">07. اخبار دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-jade">عمومی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableNews} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableNews: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">اخبار کریپتو، داده‌های کلان، تحلیل بازار AI و رویدادهای لحظه‌ای</p>
                  <input dir="ltr" value={ecosystemChannels.news} onChange={(e) => setEcosystemChannels((p) => ({ ...p, news: e.target.value }))} placeholder="@news_channel یا -100..." className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <input dir="ltr" value={ecosystemChannels.newsInvite} onChange={(e) => setEcosystemChannels((p) => ({ ...p, newsInvite: e.target.value }))} placeholder="لینک دعوت عمومی (اختیاری)" className="surface-input w-full rounded-lg px-2.5 py-1 font-mono text-[10px]" />
                  <button type="button" onClick={async () => {
                    const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'news', customTarget: ecosystemChannels.news }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                    setMsg(r.ok ? `✅ 07. اخبار دلارینو («${r.chatTitle || ecosystemChannels.news}») متصل و تست شد!` : `❌ خطا در 07: ${r.error}`);
                  }} className="w-full py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست ارسال به 07. اخبار</button>
                </div>

                {/* 04. لاگ‌های دلارینو (خصوصی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border border-rose-500/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">04. لاگ‌های دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-loss">خصوصی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableLogs} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableLogs: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">گزارش فعالیت ربات، خطاهای اجرایی، تصمیمات AI و رویدادهای سیستمی</p>
                  <input dir="ltr" value={ecosystemChannels.logs} onChange={(e) => setEcosystemChannels((p) => ({ ...p, logs: e.target.value }))} placeholder="-1001234567890 (آیدی کانال خصوصی)" className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <button type="button" onClick={async () => {
                    const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'logs', customTarget: ecosystemChannels.logs }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                    setMsg(r.ok ? `✅ 04. لاگ‌های دلارینو («${r.chatTitle || ecosystemChannels.logs}») آماده دریافت لاگ است!` : `❌ خطا در 04: ${r.error}`);
                  }} className="w-full py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست ارسال به 04. لاگ‌ها</button>
                </div>

                {/* 05. دیتابیس دلارینو (خصوصی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border border-rose-500/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">05. دیتابیس دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-loss">خصوصی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableDatabase} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableDatabase: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">گزارش داده‌ها، وضعیت ذخیره‌سازی D1، بکاپ/پاک‌سازی و آمار مدیریتی</p>
                  <input dir="ltr" value={ecosystemChannels.database} onChange={(e) => setEcosystemChannels((p) => ({ ...p, database: e.target.value }))} placeholder="-1001234567890 (آیدی کانال خصوصی)" className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-dim">گزارش دوره‌ای خودکار (ساعت):</span>
                    <input type="number" min={1} max={168} dir="ltr" value={ecosystemChannels.databaseReportIntervalHours} onChange={(e) => setEcosystemChannels((p) => ({ ...p, databaseReportIntervalHours: Number(e.target.value) || 6 }))} className="surface-input w-16 rounded-lg px-2 py-1 font-mono text-center" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={async () => {
                      const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'database', customTarget: ecosystemChannels.database }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                      setMsg(r.ok ? `✅ 05. دیتابیس متصل و تست شد!` : `❌ خطا در 05: ${r.error}`);
                    }} className="py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست اتصال</button>
                    <button type="button" onClick={async () => {
                      const r = await apiFetch<{ ok: boolean; sizeKb?: number; error?: string }>('/api/admin/channels/send-db-report', { method: 'POST', body: JSON.stringify({ attachBackupJson: true }) }).catch((err): { ok: boolean; sizeKb?: number; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Failed' }));
                      setMsg(r.ok ? `✅ گزارش کامل دیتابیس + اسنپ‌شات JSON (${r.sizeKb || 0} KB) به 05. دیتابیس ارسال شد!` : `❌ ${r.error}`);
                    }} className="py-1.5 rounded-lg btn-emerald text-[10px] font-bold">ارسال گزارش الان</button>
                  </div>
                </div>

                {/* 06. تراکنش‌های دلارینو (خصوصی) */}
                <div className="surface-card rounded-2xl p-3 space-y-2 border border-rose-500/25">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-main">06. تراکنش‌های دلارینو</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-loss">خصوصی</span>
                      <input type="checkbox" checked={ecosystemChannels.enableTransactions} onChange={(e) => setEcosystemChannels((p) => ({ ...p, enableTransactions: e.target.checked }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-dim">موعد تسویه کاربران، فاکتورها، واریز/برداشت خزانه، رفرال و کارمزد ۳٪</p>
                  <input dir="ltr" value={ecosystemChannels.transactions} onChange={(e) => setEcosystemChannels((p) => ({ ...p, transactions: e.target.value }))} placeholder="-1001234567890 (آیدی کانال خصوصی)" className="surface-input w-full rounded-lg px-2.5 py-1.5 font-mono text-[11px]" />
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={async () => {
                      const r = await apiFetch<{ ok: boolean; chatTitle?: string; error?: string }>('/api/admin/channels/test', { method: 'POST', body: JSON.stringify({ channelKey: 'transactions', customTarget: ecosystemChannels.transactions }) }).catch((err): { ok: boolean; chatTitle?: string; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Test failed' }));
                      setMsg(r.ok ? `✅ 06. تراکنش‌ها متصل و تست شد!` : `❌ خطا در 06: ${r.error}`);
                    }} className="py-1.5 rounded-lg bg-[#0D47A1] text-white text-[10px] font-bold">تست اتصال</button>
                    <button type="button" onClick={async () => {
                      const r = await apiFetch<{ ok: boolean; accountsCount?: number; totalDueUsd?: number; error?: string }>('/api/admin/channels/send-settlement-digest', { method: 'POST' }).catch((err): { ok: boolean; accountsCount?: number; totalDueUsd?: number; error?: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Failed' }));
                      setMsg(r.ok ? `✅ گزارش موعد تسویه (${r.accountsCount || 0} پرونده · $${Number(r.totalDueUsd || 0).toFixed(2)}) به 06. تراکنش‌ها ارسال شد!` : `❌ ${r.error}`);
                    }} className="py-1.5 rounded-lg btn-gold text-[10px] font-bold">گزارش تسویه‌ها</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. 03. گروه کاربران دلارینو (مبصر ضدلینک + پاسخگوی هوشمند AI) */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border border-indigo-500/25 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-brand" />
                    <span>{isFa ? '👥 03. گروه کاربران دلارینو (گروه · مبصر ضدلینک + پاسخگوی هوشمند AI)' : '👥 03. Community User Group (Moderator & AI Assistant)'}</span>
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'ارتباط کاربران، پرسش و پاسخ و تبادل تجربه. ربات را در گروه ادمین کنید تا ضدلینک و پاسخگوی AI خودکار فعال شوند.'
                      : 'User community, Q&A, and experience sharing. Make bot admin in the group for Anti-Link & AI Q&A.'}
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
                    setMsg(isFa ? 'تنظیمات 03. گروه کاربران دلارینو و مبصر هوشمند ذخیره شد ✅' : '03. Community group settings saved ✅');
                  }}
                  className="px-4 py-1.5 rounded-xl btn-cobalt font-black"
                >
                  {isFa ? 'ذخیره تنظیمات گروه 03' : 'Save 03. Group'}
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

            {/* 5. Admin-Only TradingView Webhook & Direct Signal Runner */}
            <div className="surface-soft rounded-2xl p-4 space-y-3 border border-sky-500/25 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-black text-main flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-brand" />
                    <span>{isFa ? '🔗 وب‌هوک اختصاصی TradingView و تنظیم کانال سیگنال (ادمین)' : '🔗 Admin TradingView Webhook & Channel Runner'}</span>
                  </span>
                  <p className="text-[11px] text-dim mt-0.5">
                    {isFa
                      ? 'این بخش منحصراً برای ادمین‌ها فعال است و در صفحات کاربران عمومی نمایش داده نمی‌شود.'
                      : 'Strictly Admin-only TradingView webhook & direct signal runner.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    dir="ltr"
                    value={adminTvChannel}
                    onChange={(e) => setAdminTvChannel(e.target.value)}
                    placeholder={isFa ? '@channel_handle' : '@channel_handle'}
                    className="surface-input rounded-xl px-2.5 py-1.5 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ signals_channel_id: adminTvChannel.trim() }),
                      });
                      setMsg(isFa ? `کانال 01. سیگنال دلارینو (${adminTvChannel.trim() || 'پاک شد'}) ذخیره شد ✅` : '01. Signals channel saved ✅');
                    }}
                    className="px-3 py-1.5 rounded-xl btn-ghost font-bold shrink-0"
                  >
                    {isFa ? 'ذخیره کانال سیگنال' : 'Save Signals Channel'}
                  </button>
                </div>
              </div>

              {adminTvWebhookUrl && (
                <div className="surface-card rounded-xl p-2.5 flex items-center justify-between gap-2 border hairline">
                  <code dir="ltr" className="truncate font-mono text-[11px] text-main">{adminTvWebhookUrl}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(adminTvWebhookUrl);
                      setAdminTvCopied(true);
                      setMsg(isFa ? 'لینک وب‌هوک TradingView کپی شد ✅' : 'TradingView webhook copied ✅');
                      setTimeout(() => setAdminTvCopied(false), 1800);
                    }}
                    className="btn-gold px-3 py-1.5 rounded-xl text-[11px] inline-flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{adminTvCopied ? (isFa ? 'کپی شد' : 'Copied') : isFa ? 'کپی لینک وب‌هوک' : 'Copy Webhook'}</span>
                  </button>
                </div>
              )}

              <textarea
                rows={4}
                dir="ltr"
                value={adminTvRawSig}
                onChange={(e) => setAdminTvRawSig(e.target.value)}
                className="w-full surface-input rounded-xl p-2.5 font-mono text-[11px]"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await apiFetch<{ ok: boolean; error?: string }>('/api/trading/signals/execute', {
                        method: 'POST',
                        body: JSON.stringify({ rawText: adminTvRawSig, executeNow: false, source: 'admin_tv' }),
                      });
                      setMsg(r.ok ? (isFa ? 'سیگنال TradingView تحلیل و ثبت شد ✅' : 'Signal parsed & logged ✅') : r.error || 'Rejected');
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'Error');
                    }
                  }}
                  className="btn-ghost px-4 py-2 rounded-xl font-bold"
                >
                  {isFa ? 'فقط تحلیل و ثبت' : 'Parse Only'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const r = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
                        method: 'POST',
                        body: JSON.stringify({ rawText: adminTvRawSig, executeNow: true, source: 'admin_tv' }),
                      });
                      setMsg(r.ok ? (isFa ? `معامله ${r.tradeId} با ۳ تارگت اجرا شد ✅` : `Executed ${r.tradeId} ✅`) : r.error || 'Rejected');
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'Error');
                    }
                  }}
                  className="btn-emerald px-4 py-2 rounded-xl font-black inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اجرای خودکار ۳ تارگت' : 'Execute 3-TP'}</span>
                </button>
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
                    setMsg(isFa ? 'سیگنال با دکمه‌های تعاملی در کانال متصل منتشر شد.' : 'Signal published to channel.');
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Publish signal failed');
                  }
                }}
                className="surface-soft rounded-2xl p-4 space-y-2.5 border hairline"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-main flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'ارسال سیگنال رسمی به کانال با دکمه‌های تعاملی' : 'Publish Signal to Channel'}</span>
                  </h4>
                  <TpSlModeSwitch
                    mode={channelTpSlMode}
                    onChange={async (next) => {
                      if (next === 'PCT') {
                        let refPx = Number(channelSignalForm.entryPrice || 0);
                        if (!(refPx > 0)) {
                          const ov = await apiFetch<{ market24h?: { lastPrice?: string | number } }>(
                            `/api/trading/market/overview?symbol=${encodeURIComponent(channelSignalForm.symbol || 'BTCUSDT')}`
                          ).catch(() => null);
                          refPx = Number(ov?.market24h?.lastPrice || 0);
                          if (refPx > 0) {
                            setChannelSignalForm((prev) => {
                              const slPx = calcPriceFromPct({ entryPrice: refPx, side: prev.direction, kind: 'SL', pct: Number(channelTpSlPcts.stopLoss) });
                              const p1Px = calcPriceFromPct({ entryPrice: refPx, side: prev.direction, kind: 'TP', pct: Number(channelTpSlPcts.tp1) });
                              const p2Px = calcPriceFromPct({ entryPrice: refPx, side: prev.direction, kind: 'TP', pct: Number(channelTpSlPcts.tp2) });
                              const p3Px = calcPriceFromPct({ entryPrice: refPx, side: prev.direction, kind: 'TP', pct: Number(channelTpSlPcts.tp3) });
                              return {
                                ...prev,
                                entryPrice: formatLevelPrice(refPx),
                                stopLoss: slPx !== null ? formatLevelPrice(slPx) : prev.stopLoss,
                                tp1: p1Px !== null ? formatLevelPrice(p1Px) : prev.tp1,
                                tp2: p2Px !== null ? formatLevelPrice(p2Px) : prev.tp2,
                                tp3: p3Px !== null ? formatLevelPrice(p3Px) : prev.tp3,
                              };
                            });
                          }
                        } else {
                          const pSl = calcPctFromPrice({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'SL', targetPrice: Number(channelSignalForm.stopLoss) });
                          const p1 = calcPctFromPrice({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', targetPrice: Number(channelSignalForm.tp1) });
                          const p2 = calcPctFromPrice({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', targetPrice: Number(channelSignalForm.tp2) });
                          const p3 = calcPctFromPrice({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', targetPrice: Number(channelSignalForm.tp3) });
                          setChannelTpSlPcts({
                            stopLoss: pSl !== null ? String(pSl) : '1.5',
                            tp1: p1 !== null ? String(p1) : '2.5',
                            tp2: p2 !== null ? String(p2) : '5',
                            tp3: p3 !== null ? String(p3) : '8',
                          });
                        }
                      }
                      setChannelTpSlMode(next);
                    }}
                    isFa={isFa}
                    compact
                  />
                </div>
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
                  {channelTpSlMode === 'PRICE' ? (
                    <>
                      <input dir="ltr" required value={channelSignalForm.stopLoss} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, stopLoss: e.target.value })} placeholder="SL *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                      <input dir="ltr" required value={channelSignalForm.tp1} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp1: e.target.value })} placeholder="TP1 *" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                      <input dir="ltr" value={channelSignalForm.tp2} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp2: e.target.value })} placeholder="TP2" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                      <input dir="ltr" value={channelSignalForm.tp3} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, tp3: e.target.value })} placeholder="TP3" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        step="any"
                        dir="ltr"
                        required
                        value={channelTpSlPcts.stopLoss}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChannelTpSlPcts((p) => ({ ...p, stopLoss: v }));
                          const refPx = Number(channelSignalForm.entryPrice || 0);
                          const px = calcPriceFromPct({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'SL', pct: Number(v) });
                          if (px !== null) setChannelSignalForm((f) => ({ ...f, stopLoss: formatLevelPrice(px) }));
                        }}
                        placeholder="SL % *"
                        className="surface-input rounded-xl px-2 py-2 font-mono-num"
                      />
                      <input
                        type="number"
                        step="any"
                        dir="ltr"
                        required
                        value={channelTpSlPcts.tp1}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChannelTpSlPcts((p) => ({ ...p, tp1: v }));
                          const refPx = Number(channelSignalForm.entryPrice || 0);
                          const px = calcPriceFromPct({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', pct: Number(v) });
                          if (px !== null) setChannelSignalForm((f) => ({ ...f, tp1: formatLevelPrice(px) }));
                        }}
                        placeholder="TP1 % *"
                        className="surface-input rounded-xl px-2 py-2 font-mono-num"
                      />
                      <input
                        type="number"
                        step="any"
                        dir="ltr"
                        value={channelTpSlPcts.tp2}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChannelTpSlPcts((p) => ({ ...p, tp2: v }));
                          const refPx = Number(channelSignalForm.entryPrice || 0);
                          const px = calcPriceFromPct({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', pct: Number(v) });
                          if (px !== null) setChannelSignalForm((f) => ({ ...f, tp2: formatLevelPrice(px) }));
                        }}
                        placeholder="TP2 %"
                        className="surface-input rounded-xl px-2 py-2 font-mono-num"
                      />
                      <input
                        type="number"
                        step="any"
                        dir="ltr"
                        value={channelTpSlPcts.tp3}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChannelTpSlPcts((p) => ({ ...p, tp3: v }));
                          const refPx = Number(channelSignalForm.entryPrice || 0);
                          const px = calcPriceFromPct({ entryPrice: refPx, side: channelSignalForm.direction, kind: 'TP', pct: Number(v) });
                          if (px !== null) setChannelSignalForm((f) => ({ ...f, tp3: formatLevelPrice(px) }));
                        }}
                        placeholder="TP3 %"
                        className="surface-input rounded-xl px-2 py-2 font-mono-num"
                      />
                    </>
                  )}
                  <input type="number" min={1} max={100} value={channelSignalForm.leverage} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, leverage: Number(e.target.value) })} placeholder="Lev" className="surface-input rounded-xl px-2 py-2 font-mono-num" />
                </div>
                {channelTpSlMode === 'PCT' && (
                  <p dir="ltr" className="text-[10px] font-mono text-dim">
                    {channelSignalForm.entryPrice
                      ? `SL ≈ $${channelSignalForm.stopLoss || '—'} · TP1 ≈ $${channelSignalForm.tp1 || '—'} · TP2 ≈ $${channelSignalForm.tp2 || '—'} · TP3 ≈ $${channelSignalForm.tp3 || '—'}`
                      : 'Enter Entry Price above to auto-calculate exact SL/TP prices'}
                  </p>
                )}
                <input value={channelSignalForm.note} onChange={(e) => setChannelSignalForm({ ...channelSignalForm, note: e.target.value })} placeholder={isFa ? 'توضیح تحلیلی کوتاه زیر سیگنال (اختیاری)' : 'Short note (optional)'} className="w-full surface-input rounded-xl px-2.5 py-2" />
                <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-black">
                  {isFa ? 'انتشار سیگنال در کانال متصل' : 'Publish Signal to Channel'}
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
                    setMsg(isFa ? 'خبر و تحلیل فاندامنتال در کانال متصل منتشر شد.' : 'News published to channel.');
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
                  {isFa ? 'انتشار خبر فوری در کانال متصل' : 'Broadcast News to Channel'}
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
                placeholder={isFa ? 'عنوان اطلاعیه (مثلاً آپدیت نسخه V11.2)' : 'Broadcast title'}
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
                  <span>
                    {isFa
                      ? `پیکربندی ربات ${botTokenStatus.botUsername ? `@${botTokenStatus.botUsername}` : 'تلگرام'} و BotFather`
                      : `${botTokenStatus.botUsername ? `@${botTokenStatus.botUsername}` : 'Telegram Bot'} & BotFather Control`}
                  </span>
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
                    {isFa ? 'شارژ اعتبار کارمزد ۳٪ از طریق Trust Wallet BEP20/TRC20 داخل ربات فعال است؛ در صورت تمایل به دریافت Telegram Stars، بخش Payments را در BotFather وصل کنید.' : 'Trust Wallet BEP20/TRC20 3% fee-credit top-up is built-in; optionally link Payments for Telegram Stars.'}
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

              {/* V11.7 Stage 6: Active Running Bots Monitor & Profit Cards Audit/Revoke */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                <div className="surface-card p-5 space-y-3 overflow-x-auto">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-jade" />
                      <span>{isFa ? 'مانیتورینگ زنده ربات‌ها و موتورهای فعال کاربران' : 'Live Active User Bots Monitor'}</span>
                    </h3>
                    <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{adminActiveBots.length}</span>
                  </div>
                  {adminActiveBots.length === 0 ? (
                    <p className="text-dim py-4 text-center">{isFa ? 'در حال حاضر ربات فعالی در حال معامله نیست.' : 'No active user bots running right now.'}</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {adminActiveBots.map((b) => {
                        const isRunning = b.bot_state === 'RUNNING_LIVE' || b.bot_state === 'RUNNING_PAPER';
                        let enginesList: string[] = [];
                        try {
                          enginesList = b.active_engines_json ? (JSON.parse(b.active_engines_json) as string[]) : [];
                        } catch {
                          enginesList = [];
                        }
                        return (
                          <div key={b.user_id} className="surface-soft rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 border hairline">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-black text-main">{b.username}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${isRunning ? 'bg-emerald-500/15 text-jade' : 'surface-card text-dim'}`}>
                                  {b.bot_state}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-num bg-[#1652F0]/15 text-brand">
                                  {b.trading_mode} · {b.trade_execution_mode || 'MANUAL_CONFIRM'} · {b.display_currency || 'USD'}
                                </span>
                              </div>
                              <div className="text-[10px] text-dim mt-1 truncate" dir="ltr">
                                Engines: {enginesList.length ? enginesList.join(', ') : 'NONE'} · {b.leverage}x · {b.email}
                              </div>
                            </div>
                            {isRunning && (
                              <button
                                type="button"
                                disabled={botStopBusy === b.user_id}
                                onClick={async () => {
                                  setBotStopBusy(b.user_id);
                                  try {
                                    await apiFetch(`/api/admin/users/${b.user_id}/bot-stop`, { method: 'POST' });
                                    setMsg(isFa ? `ربات کاربر ${b.username} متوقف شد.` : `Stopped bot for ${b.username}.`);
                                    await load();
                                  } catch (err) {
                                    setMsg(err instanceof Error ? err.message : 'Stop failed');
                                  } finally {
                                    setBotStopBusy(null);
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-loss font-black text-[10px] hover:bg-rose-500/25 shrink-0"
                              >
                                {botStopBusy === b.user_id ? '...' : isFa ? 'توقف اضطراری' : 'Force Stop'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="surface-card p-5 space-y-3 overflow-x-auto">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black text-sm text-main inline-flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>{isFa ? 'ممیزی و ابطال کارت‌های سود صادرشده (Profit Cards)' : 'Issued Profit Cards Audit & Revoke'}</span>
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full surface-soft text-[10px] font-black">{adminProfitCards.length}</span>
                  </div>
                  {adminProfitCards.length === 0 ? (
                    <p className="text-dim py-4 text-center">{isFa ? 'هنوز کارتی صادر نشده است.' : 'No profit cards issued yet.'}</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {adminProfitCards.slice(0, 40).map((pc) => {
                        const isRev = Number(pc.revoked || 0) === 1;
                        return (
                          <div key={pc.id} className="surface-soft rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 border hairline">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <a
                                  href={`/verify-card/${pc.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  dir="ltr"
                                  className="font-mono-num font-black text-brand hover:underline"
                                >
                                  {pc.id}
                                </a>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${pc.mode === 'LIVE' ? 'bg-emerald-500/15 text-jade' : 'bg-amber-500/15 text-amber-400'}`}>
                                  {pc.mode}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold surface-card text-dim">
                                  {pc.period} · {pc.trade_source || 'ALL'}
                                </span>
                                {isRev && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500/20 text-loss">
                                    {isFa ? 'ابطال‌شده' : 'REVOKED'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-dim mt-1 truncate">
                                {pc.username || pc.user_id} · {pc.strategy_name} ·{' '}
                                <span dir="ltr" className={pc.net_pnl_usd >= 0 ? 'text-jade font-bold' : 'text-loss font-bold'}>
                                  {pc.roi_pct >= 0 ? '+' : ''}{Number(pc.roi_pct).toFixed(1)}% (${Number(pc.net_pnl_usd).toFixed(2)})
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={cardRevokeBusy === pc.id}
                              onClick={async () => {
                                setCardRevokeBusy(pc.id);
                                try {
                                  await apiFetch(`/api/admin/profit-cards/${pc.id}/revoke`, {
                                    method: 'POST',
                                    body: JSON.stringify({ revoked: !isRev }),
                                  });
                                  setMsg(isRev ? (isFa ? `کارت ${pc.id} بازیابی شد.` : `Restored ${pc.id}.`) : isFa ? `کارت ${pc.id} ابطال شد.` : `Revoked ${pc.id}.`);
                                  await load();
                                } catch (err) {
                                  setMsg(err instanceof Error ? err.message : 'Action failed');
                                } finally {
                                  setCardRevokeBusy(null);
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-xl font-black text-[10px] shrink-0 ${
                                isRev ? 'bg-emerald-500/15 text-jade hover:bg-emerald-500/25' : 'bg-rose-500/15 text-loss hover:bg-rose-500/25'
                              }`}
                            >
                              {cardRevokeBusy === pc.id ? '...' : isRev ? (isFa ? 'رفع ابطال' : 'Restore') : isFa ? 'ابطال کارت' : 'Revoke'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(adminSection === 'all' || adminSection === 'database') && (
            <div className="space-y-5 tab-enter">
              {/* Owner Database Control Header & Live D1 Telemetry */}
              <div className="panel rounded-3xl p-5 sm:p-6 border border-[#1652F0]/30 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1652F0] to-[#0EA5E9] text-white grid place-items-center shadow-lg shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-main">
                        {isFa ? 'مدیریت جامع بانک اطلاعاتی کلادفلر D1 (مختص مالک سیستم)' : 'Cloudflare D1 Database Control Center (Owner Only)'}
                      </h3>
                      <p className="text-[11px] text-dim mt-0.5">
                        {isFa
                          ? 'گرفتن بکاپ کامل JSON، بازگردانی بکاپ، پاکسازی رکوردهای قدیمی برای کاهش مصرف D1 Rows Read و ریست ایمن کل سیستم.'
                          : 'Full JSON backup export, schema-safe restore, stale-data pruning to cut D1 Rows Read, and safeguarded reset/wipe.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={dbBusy}
                    onClick={() => void loadDbStats()}
                    className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${dbBusy ? 'animate-spin' : ''}`} />
                    <span>{isFa ? 'اسکن آمار دیتابیس' : 'Refresh D1 Stats'}</span>
                  </button>
                </div>

                {roleLower !== 'owner' && (
                  <div className="rounded-2xl p-3.5 bg-amber-500/15 border border-amber-500/35 text-xs font-bold text-amber-500 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      {isFa
                        ? 'هشدار دسترسی: گرفتن بکاپ کامل، بازگردانی و حذف/ریست دیتابیس فقط برای مالک اصلی سیستم (Owner) فعال است.'
                        : 'Owner restriction: Full Backup, Restore & Wipe operations require the primary Owner role.'}
                    </span>
                  </div>
                )}

                {dbStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="surface-soft rounded-2xl p-3.5 border hairline">
                      <span className="text-[10px] text-dim font-bold">{isFa ? 'تعداد کل جداول' : 'Total Tables'}</span>
                      <div className="text-lg font-black font-mono-num text-main mt-0.5">{dbStats.tableCount}</div>
                    </div>
                    <div className="surface-soft rounded-2xl p-3.5 border hairline">
                      <span className="text-[10px] text-dim font-bold">{isFa ? 'ایندکس‌های بهینه‌سازی' : 'Active Indexes'}</span>
                      <div className="text-lg font-black font-mono-num text-jade mt-0.5">{dbStats.indexCount}</div>
                    </div>
                    <div className="surface-soft rounded-2xl p-3.5 border hairline">
                      <span className="text-[10px] text-dim font-bold">{isFa ? 'مجموع کل رکوردها' : 'Total D1 Rows'}</span>
                      <div className="text-lg font-black font-mono-num text-brand mt-0.5">{dbStats.totalRows.toLocaleString('en-US')}</div>
                    </div>
                    <div className="surface-soft rounded-2xl p-3.5 border hairline">
                      <span className="text-[10px] text-dim font-bold">{isFa ? 'حجم تقریبی دیتابیس' : 'Database Size'}</span>
                      <div className="text-lg font-black font-mono-num text-goldsoft mt-0.5" dir="ltr">
                        {dbStats.sizeKb.toLocaleString('en-US')} KB
                      </div>
                    </div>
                  </div>
                )}

                {/* Smart D1 Housekeeping / Prune Controls */}
                <div className="surface-soft rounded-2xl p-4 border hairline space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-main flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-emerald-400" />
                      <span>{isFa ? 'پاکسازی هوشمند رکوردهای زائد (کاهش فوری D1 Rows Read و حجم)' : 'Smart Housekeeping (Instant D1 Footprint Reduction)'}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { scope: 'AUDIT_ONLY', label: isFa ? 'پاکسازی لاگ‌های قدیمی (>۵ روز)' : 'Prune Logs (>5d)' },
                      { scope: 'SIGNALS_30D', label: isFa ? 'پاکسازی سیگنال‌های قدیمی (>۱۴ روز)' : 'Prune Signals (>14d)' },
                      { scope: 'NEWS_30D', label: isFa ? 'پاکسازی اخبار قدیمی (>۱۴ روز)' : 'Prune News (>14d)' },
                      { scope: 'ALL_STALE', label: isFa ? '🧹 پاکسازی کامل همه موارد زائد' : '🧹 Prune All Stale Rows' },
                    ].map((btn) => (
                      <button
                        key={btn.scope}
                        type="button"
                        disabled={dbBusy}
                        onClick={async () => {
                          setDbBusy(true);
                          try {
                            const r = await apiFetch<{ deletedRows: number; remainingRows: number }>('/api/admin/prune-logs', {
                              method: 'POST',
                              body: JSON.stringify({ scope: btn.scope }),
                            });
                            setMsg(
                              isFa
                                ? `✅ ${r.deletedRows} ردیف قدیمی با موفقیت پاکسازی شد (${r.remainingRows} لاگ باقی مانده).`
                                : `Pruned ${r.deletedRows} stale rows.`
                            );
                            await loadDbStats();
                          } finally {
                            setDbBusy(false);
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-black transition ${
                          btn.scope === 'ALL_STALE' ? 'btn-emerald' : 'surface-card border hairline hover:border-brand text-main'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  {dbStats && dbStats.tables.length > 0 && (
                    <details className="pt-1">
                      <summary className="cursor-pointer text-[11px] font-bold text-sub hover:text-main">
                        {isFa ? `مشاهده آمار جزئی ${dbStats.tables.length} جدول دیتابیس ▼` : `View row counts across all ${dbStats.tables.length} tables ▼`}
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 mt-2 max-h-56 overflow-y-auto">
                        {dbStats.tables.map((t) => (
                          <div key={t.table} className="surface-card rounded-xl px-2.5 py-1.5 border hairline flex items-center justify-between gap-1 text-[10px]" dir="ltr">
                            <span className="font-mono truncate text-sub">{t.table}</span>
                            <span className="font-mono font-black text-main shrink-0">{t.rows}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {/* Backup & Restore Two-Column Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {/* Backup Export Card */}
                <div className="surface-card rounded-3xl p-5 border border-emerald-500/30 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-black text-sm text-main flex items-center gap-2">
                        <Download className="w-4 h-4 text-jade" />
                        <span>{isFa ? 'گرفتن بکاپ کامل دیتابیس (JSON Export)' : 'Full D1 Database Backup Export'}</span>
                      </h4>
                      <p className="text-[11px] text-dim mt-1 leading-relaxed">
                        {isFa
                          ? 'خروجی یکپارچه از تمام جداول (کاربران، تنظیمات، تریدها، کارمزد ۳٪، کپی‌ترید، هوش مصنوعی و کانال‌ها) با فرمت استاندارد dollarino-d1-backup-v1.'
                          : 'Export all D1 tables (users, settings, trades, 3% fees, copy-trade, AI & channels) as a single dollarino-d1-backup-v1 JSON archive.'}
                      </p>
                    </div>
                  </div>
                  <label className="surface-soft rounded-xl p-3 border hairline flex items-center gap-2 cursor-pointer font-bold text-[11px]">
                    <input
                      type="checkbox"
                      checked={dbExcludeSecrets}
                      onChange={(e) => setDbExcludeSecrets(e.target.checked)}
                    />
                    <span>{isFa ? 'حذف کلیدهای رمزنگاری‌شده ربات و خزانه از فایل خروجی (برای بکاپ عمومی امن‌تر)' : 'Exclude encrypted bot & treasury secrets from backup file'}</span>
                  </label>
                  <button
                    type="button"
                    disabled={dbBusy || roleLower !== 'owner'}
                    onClick={async () => {
                      setDbBusy(true);
                      try {
                        const backup = await apiFetch<{
                          format: string;
                          totalRows: number;
                          tableOrder: string[];
                        }>(`/api/admin/database/backup${dbExcludeSecrets ? '?excludeSecrets=1' : ''}`);
                        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                        a.href = url;
                        a.download = `dollarino-d1-backup-${stamp}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        setMsg(
                          isFa
                            ? `✅ بکاپ کامل (${backup.tableOrder?.length ?? 0} جدول و ${backup.totalRows ?? 0} رکورد) دانلود شد!`
                            : `Backup downloaded (${backup.totalRows} rows)!`
                        );
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : 'Backup export failed');
                      } finally {
                        setDbBusy(false);
                      }
                    }}
                    className="w-full py-3 rounded-2xl btn-emerald font-black inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  >
                    <Download className="w-4 h-4" />
                    <span>{dbBusy ? '...' : isFa ? '⬇️ دانلود فایل بکاپ کامل دیتابیس (.json)' : '⬇️ Download Full D1 Backup (.json)'}</span>
                  </button>
                </div>

                {/* Restore Import Card */}
                <div className="surface-card rounded-3xl p-5 border border-[#1652F0]/30 space-y-4">
                  <div>
                    <h4 className="font-black text-sm text-main flex items-center gap-2">
                      <Upload className="w-4 h-4 text-brand" />
                      <span>{isFa ? 'بازگردانی دیتابیس از فایل بکاپ (Restore)' : 'Restore Database from Backup JSON'}</span>
                    </h4>
                    <p className="text-[11px] text-dim mt-1 leading-relaxed">
                      {isFa
                        ? 'فایل JSON بکاپ را انتخاب کنید تا با اسکیمای فعلی تطبیق داده شده و به‌صورت دسته‌ای (Batch) بازیابی شود.'
                        : 'Upload a dollarino-d1-backup-v1 JSON file to merge or restore into D1 safely.'}
                    </p>
                  </div>

                  <label className="surface-soft rounded-2xl p-3 border border-dashed border-[var(--brand)]/50 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-[var(--soft)] transition">
                    <Upload className="w-5 h-5 text-brand" />
                    <span className="font-black text-main">
                      {restorePreview
                        ? isFa
                          ? `فایل بارگذاری شد: ${restorePreview.tableCount} جدول · ${restorePreview.totalRows} ردیف`
                          : `Loaded: ${restorePreview.tableCount} tables · ${restorePreview.totalRows} rows`
                        : isFa
                          ? 'انتخاب فایل بکاپ (.json)'
                          : 'Select .json backup file'}
                    </span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const txt = await file.text();
                          const parsed = JSON.parse(txt) as Record<string, unknown>;
                          if (parsed.format !== 'dollarino-d1-backup-v1' || typeof parsed.tables !== 'object' || !parsed.tables) {
                            setMsg(isFa ? '❌ فرمت فایل بکاپ نامعتبر است.' : 'Invalid backup format.');
                            return;
                          }
                          const tablesObj = parsed.tables as Record<string, unknown[]>;
                          const tNames = Object.keys(tablesObj);
                          const rowsTotal = tNames.reduce((sum, k) => sum + (Array.isArray(tablesObj[k]) ? tablesObj[k]!.length : 0), 0);
                          setRestorePreview({
                            format: String(parsed.format),
                            version: String(parsed.version || ''),
                            exportedAt: String(parsed.exportedAt || ''),
                            tableCount: tNames.length,
                            totalRows: rowsTotal,
                            raw: parsed,
                          });
                          setMsg(isFa ? `فایل بکاپ با ${rowsTotal} ردیف آماده بازگردانی است.` : `Backup parsed (${rowsTotal} rows).`);
                        } catch {
                          setMsg(isFa ? '❌ خطا در خواندن فایل JSON.' : 'Failed to parse JSON file.');
                        }
                      }}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRestoreMode('MERGE')}
                      className={`p-2.5 rounded-xl border text-[11px] font-black transition ${
                        restoreMode === 'MERGE' ? 'btn-cobalt border-transparent' : 'surface-soft hairline text-sub'
                      }`}
                    >
                      {isFa ? 'ادغام ایمن (MERGE)' : 'Safe Merge'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestoreMode('REPLACE')}
                      className={`p-2.5 rounded-xl border text-[11px] font-black transition ${
                        restoreMode === 'REPLACE' ? 'bg-amber-500 text-white border-transparent' : 'surface-soft hairline text-sub'
                      }`}
                    >
                      {isFa ? 'جایگزینی کامل (REPLACE)' : 'Full Replace'}
                    </button>
                  </div>

                  {restoreMode === 'REPLACE' && (
                    <input
                      dir="ltr"
                      value={restoreConfirmText}
                      onChange={(e) => setRestoreConfirmText(e.target.value)}
                      placeholder="Type RESTORE_REPLACE_DB to confirm"
                      className="surface-input w-full rounded-xl px-3 py-2 font-mono text-[11px]"
                    />
                  )}

                  <button
                    type="button"
                    disabled={dbBusy || !restorePreview || roleLower !== 'owner' || (restoreMode === 'REPLACE' && restoreConfirmText !== 'RESTORE_REPLACE_DB')}
                    onClick={async () => {
                      if (!restorePreview) return;
                      setDbBusy(true);
                      try {
                        const r = await apiFetch<{ ok: boolean; insertedRows: number; errors?: string[] }>('/api/admin/database/restore', {
                          method: 'POST',
                          body: JSON.stringify({
                            mode: restoreMode,
                            confirmPhrase: restoreConfirmText,
                            backup: restorePreview.raw,
                          }),
                        });
                        setMsg(
                          isFa
                            ? `✅ بازگردانی کامل شد: ${r.insertedRows} ردیف بازیابی گردید${r.errors?.length ? ` (${r.errors.length} هشدار)` : ''}.`
                            : `Restored ${r.insertedRows} rows!`
                        );
                        setRestoreConfirmText('');
                        await Promise.all([load(), loadDbStats()]);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : 'Restore failed');
                      } finally {
                        setDbBusy(false);
                      }
                    }}
                    className="w-full py-3 rounded-2xl btn-cobalt font-black inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{dbBusy ? '...' : isFa ? '♻️ اجرای بازگردانی بکاپ در دیتابیس' : '♻️ Execute Restore Now'}</span>
                  </button>
                </div>
              </div>

              {/* Danger Zone: Wipe / Reset Database */}
              <div className="rounded-3xl p-5 sm:p-6 border border-rose-500/40 bg-rose-500/8 space-y-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-black text-sm text-loss flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span>{isFa ? 'منطقه حساس — ریست عملیاتی یا پاکسازی کامل دیتابیس (Wipe Database)' : 'Danger Zone — Operational Reset or Full Factory Wipe'}</span>
                    </h4>
                    <p className="text-[11px] text-sub mt-1 leading-relaxed">
                      {isFa
                        ? 'پیشنهاد می‌شود قبل از هرگونه پاکسازی، یک بکاپ JSON از بخش بالا دانلود کنید. این عملیات غیرقابل بازگشت است.'
                        : 'Download a full JSON backup above before running any wipe. This action is permanent.'}
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setWipeMode('OPERATIONAL_RESET');
                      setWipeConfirmText('');
                    }}
                    className={`rounded-2xl p-3.5 border text-start transition ${
                      wipeMode === 'OPERATIONAL_RESET'
                        ? 'bg-amber-500/15 border-amber-500/50 text-main'
                        : 'surface-card hairline text-sub'
                    }`}
                  >
                    <div className="font-black text-xs">{isFa ? '۱. ریست داده‌های عملیاتی (Operational Reset)' : '1. Operational Data Reset'}</div>
                    <div className="text-[11px] text-dim mt-1">
                      {isFa
                        ? 'پاکسازی تمام تریدها، سیگنال‌ها، لاگ‌ها، تیکت‌ها و کارمزدها — بدون حذف کاربران، توکن ربات، تنظیمات و هوش مصنوعی.'
                        : 'Clears trades, signals, logs, tickets & fees while keeping users, settings, bot token & AI engines.'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWipeMode('FULL_FACTORY_WIPE');
                      setWipeConfirmText('');
                    }}
                    className={`rounded-2xl p-3.5 border text-start transition ${
                      wipeMode === 'FULL_FACTORY_WIPE'
                        ? 'bg-rose-500/20 border-rose-500/60 text-main'
                        : 'surface-card hairline text-sub'
                    }`}
                  >
                    <div className="font-black text-xs text-loss">{isFa ? '۲. پاکسازی کامل کل دیتابیس (Full Factory Wipe)' : '2. Full Factory Wipe (Delete All Data)'}</div>
                    <div className="text-[11px] text-dim mt-1">
                      {isFa
                        ? 'حذف ۱۰۰٪ جداول و داده‌های پلتفرم از صفر (با انتخاب اختیاری حفظ حساب Owner و تنظیمات پایه).'
                        : 'Deletes all platform tables and users cleanly (optionally preserving your Owner login & core settings).'}
                    </div>
                  </button>
                </div>

                {wipeMode === 'FULL_FACTORY_WIPE' && (
                  <label className="surface-card rounded-xl p-3 border hairline flex items-center gap-2 cursor-pointer font-bold text-[11px]">
                    <input
                      type="checkbox"
                      checked={wipePreserveOwner}
                      onChange={(e) => setWipePreserveOwner(e.target.checked)}
                    />
                    <span>
                      {isFa
                        ? '✅ حساب کاربری مالک (Owner) و تنظیمات اصلی سیستم حفظ شوند تا دسترسی پنل قطع نشود'
                        : '✅ Preserve Owner account & core system_settings so admin access stays intact'}
                    </span>
                  </label>
                )}

                <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center">
                  <input
                    dir="ltr"
                    value={wipeConfirmText}
                    onChange={(e) => setWipeConfirmText(e.target.value)}
                    placeholder={
                      wipeMode === 'FULL_FACTORY_WIPE'
                        ? 'Type DELETE_ALL_DATA to confirm wipe'
                        : 'Type RESET_OPERATIONAL_DATA to confirm reset'
                    }
                    className="surface-input rounded-2xl px-4 py-3 font-mono text-xs border-rose-500/35"
                  />
                  <button
                    type="button"
                    disabled={
                      dbBusy ||
                      roleLower !== 'owner' ||
                      wipeConfirmText !== (wipeMode === 'FULL_FACTORY_WIPE' ? 'DELETE_ALL_DATA' : 'RESET_OPERATIONAL_DATA')
                    }
                    onClick={async () => {
                      const expected = wipeMode === 'FULL_FACTORY_WIPE' ? 'DELETE_ALL_DATA' : 'RESET_OPERATIONAL_DATA';
                      if (wipeConfirmText !== expected) return;
                      setDbBusy(true);
                      try {
                        const r = await apiFetch<{ ok: boolean; deletedRows: number; affectedTablesCount: number }>(
                          '/api/admin/database/wipe',
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              mode: wipeMode,
                              preserveOwnerAndSettings: wipePreserveOwner,
                              confirmPhrase: wipeConfirmText,
                            }),
                          }
                        );
                        setWipeConfirmText('');
                        setMsg(
                          isFa
                            ? `🧹 عملیات پاکسازی انجام شد: ${r.deletedRows} ردیف از ${r.affectedTablesCount} جدول حذف گردید.`
                            : `Wipe finished: deleted ${r.deletedRows} rows across ${r.affectedTablesCount} tables.`
                        );
                        await Promise.all([load(), loadDbStats()]);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : 'Database wipe failed');
                      } finally {
                        setDbBusy(false);
                      }
                    }}
                    className="px-6 py-3 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 text-white font-black inline-flex items-center justify-center gap-2 transition shadow-md"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {dbBusy
                        ? '...'
                        : wipeMode === 'FULL_FACTORY_WIPE'
                          ? isFa
                            ? '🔥 پاکسازی کامل دیتابیس'
                            : '🔥 Wipe Full Database'
                          : isFa
                            ? '🧹 اجرای ریست عملیاتی'
                            : '🧹 Run Operational Reset'}
                    </span>
                  </button>
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
