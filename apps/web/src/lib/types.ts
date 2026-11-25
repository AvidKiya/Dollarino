import type { SignalMixerResult, Timeframe } from '@dollarino/core';

export type NavTab =
  | 'overview'
  | 'aichat'
  | 'myai'
  | 'terminal'
  | 'markets'
  | 'dex'
  | 'radar'
  | 'copy'
  | 'portfolio'
  | 'services'
  | 'card'
  | 'pricing'
  | 'faq'
  | 'admin';

export interface SelectableAIModel {
  id: string;
  label: string;
  provider: string;
  model: string;
  source: 'PLATFORM' | 'USER';
  supportsVision: boolean;
  isDefault: boolean;
}

export interface ExtractedChartSetup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe?: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  leverage?: number;
  rrRatio?: string;
  confidence?: number;
  note?: string;
}

export interface AiChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  hasImage?: boolean;
  previewImageUrl?: string;
  modelId?: string | null;
  modelLabel?: string | null;
  usedVision?: boolean;
  visionFallbackNotice?: string;
  setup?: ExtractedChartSetup | null;
  createdAt?: string;
}

export interface AiChatSessionItem {
  id: string;
  title: string;
  model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorInfo {
  nameFa: string;
  nameEn: string;
  telegram: string;
  telegramUrl: string;
  instagram: string;
  instagramUrl: string;
  twitter: string;
  twitterUrl: string;
}

export interface AuthUserInfo {
  id: string;
  email: string;
  username: string;
  role: string;
  telegram_id: string | null;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  avatar_url?: string | null;
  avatar_custom?: number | boolean;
  phone_number?: string | null;
  phone_verified?: boolean | number;
  has_custom_password?: boolean | number;
  display_bio?: string | null;
  referral_code?: string | null;
  trust_wallet_address?: string | null;
  trust_wallet_tron?: string | null;
  trust_wallet_solana?: string | null;
  trust_wallet_ton?: string | null;
  trust_wallet_verified?: boolean;
  risk_terms_accepted_at?: string | null;
  ui_mode?: 'simple' | 'pro';
  mobile_widgets?: string[];
  extension_api_key?: string | null;
}

export interface EntitlementSummary {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  daysRemaining: number;
  subscriptionRequired: boolean;
}

export interface OpenTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  market_type?: 'SPOT' | 'FUTURES';
  leverage: number;
  entry_price: string;
  mark_price?: string;
  quantity: string;
  margin_used: string;
  current_stop_loss: string;
  tp1: string;
  tp2?: string | null;
  tp3?: string | null;
  unrealized_pnl?: string;
  roe_pct?: string;
  risk_free_active?: number;
  strategy_key?: string;
  source?: string;
  sparkline?: number[];
  opened_at?: string;
}

export interface ClosedTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  market_type?: 'SPOT' | 'FUTURES';
  leverage: number;
  entry_price: string;
  exit_price: string;
  realized_pnl: string;
  close_reason?: string;
  closed_at: string;
}

export interface VerifiedProfitCard {
  id: string;
  userId?: string;
  displayName?: string;
  mode: 'LIVE' | 'PAPER';
  isVerifiedReal: boolean;
  period: '24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE';
  startDate: string;
  endDate: string;
  tradesCount: number;
  winRate: number;
  netPnlUsd: number;
  roiPct: number;
  profitFactor: number;
  exchangeProvider: string;
  strategyName: string;
  cardStyle?: string;
  symbol?: string;
  direction?: string;
  hmacSignature?: string;
  signaturePrefix?: string;
  verifyPath?: string;
  issuedAt: string;
}

export interface PendingOrderRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  limit_price: string;
  leverage: number;
  stop_loss: string;
  tp1: string;
  status: string;
  created_at: string;
}

export interface RecentSignalRow {
  id: string;
  source: string;
  symbol: string;
  direction: string;
  price: string;
  status: string;
  raw_text: string;
  created_at: string;
}

export type TradingEngineChoice = 'CENTRAL_AI' | 'MY_AI' | 'STRATEGY' | 'COPY_TRADE' | 'LISTING_SNIPER';

export type SniperTargetType = 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME' | 'BOTH';

export interface SniperSettings {
  enabled: boolean;
  targetType: SniperTargetType;
  budgetUsd: number;
  minSafetyScore: number;
  minLiquidityUsd: number;
  maxPairAgeHours: number;
  maxTaxPct: number;
  tpPct: number;
  slPct: number;
  trailingEnabled: boolean;
  trailingPct: number;
  maxOpenPositions: number;
  autoExecute: boolean;
  slippagePct: number;
  networks: string[];
}

export interface SniperCandidate {
  symbol: string;
  tokenAddress: string;
  chainId: string;
  source: string;
  targetKind?: 'CEX_NEW_LISTING' | 'DEX_BOOM_MEME';
  safetyScore: number;
  liquidityUsd: number;
  volume24hUsd?: number;
  priceUsd: number;
  change1hPct: number;
  change5mPct?: number;
  pairAgeHours?: number;
  estimatedTaxPct?: number;
  note: string;
}

export interface ActiveEngineState {
  activeEngine: TradingEngineChoice | 'NONE';
  activeEngines: TradingEngineChoice[];
  strategyKey: string;
  botState: string;
  isBotRunning: boolean;
  myAiActive: boolean;
  sniperEnabled: boolean;
  activeCopyTradersCount: number;
}

export interface DashboardPayload {
  activeEngine?: ActiveEngineState;
  riskTermsAcceptedAt?: string | null;
  tradingModeSelected?: boolean;
  sniperEvents?: Array<{
    id: string;
    symbol: string;
    token_address: string;
    chain_id: string;
    source: string;
    safety_score: number;
    liquidity_usd: number;
    price_usd: number;
    change_1h_pct: number;
    note?: string | null;
    discovered_at: string;
  }>;
  config: {
    bot_state: string;
    trading_mode: 'PAPER' | 'LIVE';
    trading_mode_selected?: number;
    market_type?: 'SPOT' | 'FUTURES';
    direction_mode?: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
    hedge_mode?: number;
    trade_execution_mode: 'AUTO' | 'MANUAL_CONFIRM';
    margin_mode: 'ISOLATED' | 'CROSS';
    symbol: string;
    strategy_key: string;
    entry_timeframe: Timeframe;
    higher_timeframe: Timeframe;
    margin_pct: number;
    max_leverage: number;
    max_open_positions: number;
    daily_max_loss_pct: number;
    ai_gate_enabled: number;
    ai_min_confidence: number;
    webhook_secret: string;
    signal_channel_handle: string;
    paper_balance: string;
    custom_paper_balance?: number;
    active_engines_json?: string;
    sniper_enabled?: number;
    sniper_budget_usd?: number;
    sniper_min_safety?: number;
    sniper_min_safety_score?: number;
    sniper_min_liquidity_usd?: number;
    sniper_networks_json?: string;
    sniper_target_type?: SniperTargetType;
    sniper_max_pair_age_hours?: number;
    sniper_max_tax_pct?: number;
    sniper_tp_pct?: number;
    sniper_sl_pct?: number;
    sniper_trailing_enabled?: number;
    sniper_trailing_pct?: number;
    sniper_max_open_positions?: number;
    sniper_auto_execute?: number;
    sniper_slippage_pct?: number;
    bot_budget_mode?: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
    bot_budget_usd?: number;
    bot_budget_pct?: number;
    mixer_threshold?: number;
    mixer_weights_json?: string;
    strategy_flow_json?: string;
    kbos_params_json?: string;
    risk_profile_json?: string;
    trailing_stop_enabled?: number;
    trailing_stop_pct?: number;
    trail_after_tp1?: number;
    auto_scan_top?: number;
    scan_scope?: 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET';
    allow_auto_flip?: number;
    allow_pyramiding?: number;
    watchlist_json?: string;
    tp1_close_pct?: number;
    tp2_close_pct?: number;
    tp3_close_pct?: number;
    auto_breakeven_on_tp1?: number;
    move_sl_to_tp1_on_tp2?: number;
    block_weekends?: number;
    macro_blackout?: number;
    use_signal_leverage?: number;
    notifications_enabled?: number;
    active_custom_strategy_id?: string | null;
    last_ai_reason?: string | null;
    last_ai_decision_at?: string | null;
  };
  balance: { free: string; used: string; total: string; currency: string };
  walletSummary?: {
    activeMode: 'PAPER' | 'LIVE';
    demoBalanceUsd: number;
    liveBalanceUsd: number;
    liveHasWallet: boolean;
    liveMeetsMinimum: boolean;
    minLiveUsd: number;
  };
  capitalSummary?: {
    walletTotalUsd: number;
    walletFreeUsd: number;
    budgetMode: 'FULL_BALANCE' | 'FIXED_USD' | 'PERCENT_OF_BALANCE';
    budgetUsd: number;
    budgetPct: number;
    effectiveCapitalUsd: number;
    usedMarginUsd: number;
    remainingBudgetUsd: number;
    isCapped: boolean;
    recommended: {
      effectiveCapitalUsd: number;
      preset: 'conservative' | 'balanced' | 'aggressive';
      marginPct: number;
      perTradeUsd: number;
      maxOpenPositions: number;
      maxLeverage: number;
      dailyMaxLossPct: number;
      trailingStopPct: number;
      tp1ClosePct: number;
      tp2ClosePct: number;
      tp3ClosePct: number;
      summaryFa: string;
      summaryEn: string;
    };
  } | null;
  activeExchange: { provider: string; label: string };
  activeAI: { provider: string; model: string } | null;
  platformAI?: {
    configured: boolean;
    activeCount: number;
    totalCount: number;
    consensusMode: string;
    effectiveModeLabelFa: string;
    effectiveModeLabelEn: string;
    engines: Array<{
      id: string;
      slot_order: number;
      provider: string;
      label: string;
      model: string;
      weight: number;
      is_active: number;
    }>;
    latestSignals: Array<{
      id: string;
      symbol: string;
      timeframe: string;
      action: string;
      confidence: number;
      model_count: number;
      consensus_mode: string;
      thesis: string;
      created_at: string;
    }>;
  };
  entitlement?: EntitlementSummary | null;
  iranRate?: {
    usdtIrr: number;
    usdtIrt: number;
    source: string;
    updatedAt: string;
  } | null;
  serverFeeSummary?: {
    feePct: number;
    totalProfitablePnlUsd: number;
    totalFeeUsd: number;
    accruedFeeUsd: number;
    pendingVerifyFeeUsd?: number;
    settledFeeUsd: number;
    profitableTradesCount: number;
    freeTradesUsed?: number;
    freeTradesLimit?: number;
    freeTradesRemaining?: number;
    enforcement?: {
      allowed: boolean;
      lockStatus: 'ACTIVE' | 'WARNING' | 'PENDING_REVIEW' | 'LOCKED';
      reasonCode?: 'FEE_SETTLEMENT_REQUIRED';
      reasonFa?: string;
      reasonEn?: string;
      accruedUsd: number;
      pendingVerifyUsd: number;
      penaltyUsd: number;
      totalDueUsd: number;
      prepaidCreditUsd: number;
      graceLimitUsd: number;
      graceDeadline: string | null;
      hoursRemaining: number | null;
      latePenaltyPct: number;
      autoLockEnabled: boolean;
    };
  } | null;
  stats: {
    totalTrades: number;
    wins: number;
    winRate: number;
    totalPnl: number;
    todayPnl?: number;
    profitFactor: number;
  };
  openTrades: OpenTradeRow[];
  closedTrades: ClosedTradeRow[];
  pendingOrders?: PendingOrderRow[];
  recentLogs?: Array<{
    id: string;
    category: string;
    level: string;
    symbol: string | null;
    message: string;
    created_at: string;
  }>;
  charts: {
    dailyPnl: Array<{ day: string; pnl: number }>;
    weeklyResults: Array<{ day: string; pnl: number; count: number; wins?: number }>;
    equityCurve?: Array<{ time: number | string; label?: string; equity: number; pnl?: number }>;
  };
  mixerSnapshot?: SignalMixerResult | null;
  recentSignals: RecentSignalRow[];
}

export interface OnchainApiProviderItem {
  provider: string;
  category: string;
  label: string;
  base_url: string;
  requires_key: number;
  api_key_masked: string | null;
  is_active: number;
  calls_today: number;
  last_test_ok: number | null;
  last_error: string | null;
  updated_at: string;
}

export interface MultiDappRouteItem {
  id: string;
  name: string;
  badge: string;
  swapUrl: string;
  trustWalletDappUrl: string;
}

export interface TokenRugSafetyReport {
  chainId: string;
  tokenAddress: string;
  safetyScore: number;
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  lpLockedOrBurned: boolean;
  isMintable: boolean;
  top10HoldersPct: number;
  devHoldPct: number;
  liquidityUsd: number;
  tokenAgeHours?: number | null;
  flags: string[];
  verdict: 'SAFE' | 'CAUTION' | 'DANGER';
  sourcesUsed: string[];
}

export interface SmartWalletTraderItem {
  id: string;
  source_type: 'AUTO_TOP10' | 'SITE_PICK' | 'USER_CUSTOM';
  added_by_user_id: string | null;
  wallet_address: string;
  chain_id: string;
  display_name: string;
  style_tag: string;
  roi_7d_pct: number;
  roi_30d_pct: number;
  realized_pnl_usd: number;
  win_rate: number;
  avg_hold_mins: number;
  trades_30d: number;
  safety_discipline_score: number;
  is_bot_filtered: number;
  top_tokens_json: string;
  recent_trades_json: string;
  last_synced_at: string;
}

export interface CopyFollowRuleItem {
  id: string;
  user_id: string;
  trader_kind: 'SMART_WALLET' | 'SITE_TRADER';
  trader_id: string;
  trader_label: string;
  chain_id: string;
  execution_mode: 'TRUST_ONE_CLICK' | 'AUTO_EVM_ALLOWANCE' | 'AUTO_COPY_VAULT';
  allocated_margin_usd: number;
  used_margin_usd: number;
  sizing_mode: 'FIXED_USD' | 'PCT_ALLOCATION' | 'PROPORTIONAL';
  order_size_usd: number;
  order_size_pct: number;
  leverage: number;
  tp1_pct: number;
  tp1_sell_pct: number;
  tp2_pct: number;
  tp2_sell_pct: number;
  tp3_pct: number;
  moonbag_pct: number;
  stop_loss_pct: number;
  trailing_activate_pct: number;
  trailing_drop_pct: number;
  break_even_pct: number;
  time_limit_hours: number;
  min_safety_score: number;
  max_slippage_pct: number;
  min_liquidity_usd: number;
  min_mcap_usd: number;
  max_mcap_usd: number;
  max_open_positions: number;
  daily_max_loss_usd: number;
  daily_loss_used_usd: number;
  only_new_positions: number;
  copy_sells: number;
  dev_sell_auto_exit: number;
  anti_mev: number;
  ai_guard_enabled: number;
  reverse_copy: number;
  is_active: number;
  updated_at: string;
}

export interface CopyPositionV2Item {
  id: string;
  user_id: string;
  rule_id: string;
  trader_kind: string;
  trader_id: string;
  trader_label: string;
  execution_mode: string;
  chain_id: string;
  dex_name: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  direction: string;
  margin_usd: number;
  entry_price_usd: number;
  current_price_usd: number;
  qty_tokens: number;
  remaining_pct: number;
  tp1_hit: number;
  tp2_hit: number;
  tp3_hit: number;
  peak_pnl_pct: number;
  pnl_pct: number;
  pnl_usd: number;
  safety_score: number;
  ai_guard_note: string | null;
  status: 'PENDING_TRUST_SIGN' | 'OPEN' | 'CLOSED' | 'SKIPPED_SAFETY' | 'SKIPPED_AI';
  trust_dapp_url: string | null;
  tx_hash: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface PromoBannerItem {
  id: string;
  badge_fa: string;
  badge_en: string;
  title_fa: string;
  title_en: string;
  subtitle_fa: string;
  subtitle_en: string;
  cta_label_fa: string;
  cta_label_en: string;
  cta_target: string;
  image_url: string;
  accent_theme: 'gold' | 'emerald' | 'cobalt' | 'purple' | string;
  placement: 'BOTH' | 'LANDING' | 'DASHBOARD' | string;
  sort_order: number;
  is_active: number;
}

export interface PerpMarketQuoteItem {
  symbol: string;
  markPrice: number;
  fundingRatePct: number;
  openInterestUsd: number;
  maxLeverage: number;
  volume24hUsd: number;
  venue: string;
}

export interface PerpDappLinkItem {
  venue: string;
  name: string;
  chain: string;
  maxLeverage: number;
  dappUrl: string;
  trustWalletDappUrl: string;
  noteFa: string;
  noteEn: string;
}

export interface FounderProfile {
  fullNameFa: string;
  fullNameEn: string;
  roleFa: string;
  roleEn: string;
  photoUrl: string;
  email: string;
  phone: string;
  addressFa: string;
  addressEn: string;
  telegram: string;
  telegramUrl: string;
  channel: string;
  channelUrl: string;
  instagram: string;
  instagramUrl: string;
  twitter: string;
  twitterUrl: string;
  github: string;
  website: string;
  verificationId: string;
  independenceFa: string;
  independenceEn: string;
  bioFa: string;
  bioEn: string;
  missionFa: string;
  missionEn: string;
  antiPonziFa: string;
  antiPonziEn: string;
  showPublic: boolean;
  updatedAt?: string | null;
}


