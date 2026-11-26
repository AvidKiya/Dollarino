import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowUpDown,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  Coins,
  Copy as CopyIcon,
  ExternalLink,
  Filter,
  Flame,
  KeyRound,
  PauseCircle,
  Plus,
  Radar,
  RefreshCw,
  Rocket,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Trophy,
  Vault,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { ChainLogo } from './BrandLogos';
import { ProDropdown } from './ProDropdown';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { fundCopyVaultFromDapp, hasAnyInjectedWallet } from '../lib/trustwallet';
import type {
  CopyFollowRuleItem,
  CopyPositionV2Item,
  SmartWalletTraderItem,
} from '../lib/types';

interface BacktestReport {
  tradesSimulated: number;
  skippedUnsafeCount: number;
  winRatePct: number;
  netProfitUsd: number;
  roiPct: number;
  maxDrawdownPct: number;
  samples: Array<{ symbol: string; outcome: string; pnlPct: number; pnlUsd: number }>;
}

interface CopyVaultPayload {
  vault: {
    id: string;
    evmAddress: string;
    solanaAddress: string;
    tronAddress: string;
    allowanceLimitUsd: number;
    autoWithdrawToTrust: boolean;
  };
  balances: {
    bscBnb: number;
    eth: number;
    baseEth: number;
    solana: number;
    tronTrx: number;
    tronUsdt: number;
  };
  trustWalletTargets?: {
    evm: string | null;
    solana: string | null;
    tron: string | null;
  };
  securityCaps?: {
    hasCustomPassword: boolean;
    hasTelegramLinked: boolean;
  };
}

const CHAIN_TABS = ['ALL', 'solana', 'base', 'bsc', 'ethereum', 'arbitrum', 'ton', 'tron'] as const;

const DEFAULT_RULE_FORM = {
  executionMode: 'TRUST_ONE_CLICK' as 'TRUST_ONE_CLICK' | 'AUTO_COPY_VAULT' | 'AUTO_EVM_ALLOWANCE',
  allocatedMarginUsd: 150,
  sizingMode: 'FIXED_USD' as 'FIXED_USD' | 'PCT_ALLOCATION' | 'PROPORTIONAL',
  orderSizeUsd: 25,
  orderSizePct: 15,
  leverage: 5,
  tp1Pct: 30,
  tp1SellPct: 40,
  tp2Pct: 75,
  tp2SellPct: 40,
  tp3Pct: 150,
  moonbagPct: 20,
  stopLossPct: 20,
  trailingActivatePct: 25,
  trailingDropPct: 10,
  breakEvenPct: 18,
  timeLimitHours: 48,
  minSafetyScore: 60,
  maxSlippagePct: 15,
  minLiquidityUsd: 15000,
  minMcapUsd: 25000,
  maxMcapUsd: 500000000,
  maxOpenPositions: 4,
  dailyMaxLossUsd: 50,
  onlyNewPositions: true,
  copySells: true,
  devSellAutoExit: true,
  antiMev: true,
  aiGuardEnabled: true,
  reverseCopy: false,
  isActive: true,
};

export function SmartCopyProHub({
  lang,
  onMsg,
  externalSiteTrader,
  onClearExternalTrader,
}: {
  lang: Lang;
  onMsg: (text: string, err?: boolean) => void;
  externalSiteTrader?: { id: string; display_name: string } | null;
  onClearExternalTrader?: () => void;
}) {
  const isFa = lang === 'fa';
  const [subTab, setSubTab] = useState<'top10' | 'custom' | 'vault' | 'live'>('top10');
  const [chainFilter, setChainFilter] = useState<string>('ALL');
  const [styleFilter, setStyleFilter] = useState<'ALL' | 'HOLDER' | 'SCALPER' | 'SWING' | 'SNIPER'>('ALL');
  const [sortBy, setSortBy] = useState<
    'roi_30d_desc' | 'roi_30d_asc' | 'roi_24h_desc' | 'roi_7d_desc' | 'pnl_desc' | 'pnl_asc' | 'win_rate_desc' | 'safety_desc'
  >('roi_30d_desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [top10, setTop10] = useState<SmartWalletTraderItem[]>([]);
  const [customWallets, setCustomWallets] = useState<SmartWalletTraderItem[]>([]);
  const [rules, setRules] = useState<CopyFollowRuleItem[]>([]);
  const [positions, setPositions] = useState<CopyPositionV2Item[]>([]);
  const [vaultData, setVaultData] = useState<CopyVaultPayload | null>(null);

  // Add custom wallet state
  const [customAddr, setCustomAddr] = useState('');
  const [customChain, setCustomChain] = useState('solana');
  const [customName, setCustomName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);

  // Vault settings & key backup state
  const [vaultLimit, setVaultLimit] = useState(500);
  const [vaultAutoWithdraw, setVaultAutoWithdraw] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [exportedKeys, setExportedKeys] = useState<{
    evmAddress: string;
    evmPrivateKeyHex: string;
    solanaAddress: string;
    solanaSecretBase58: string;
    tronAddress: string;
  } | null>(null);
  const [vault2faOpen, setVault2faOpen] = useState(false);
  const [vault2faPassword, setVault2faPassword] = useState('');
  const [vault2faPin, setVault2faPin] = useState('');
  const [vault2faPinSent, setVault2faPinSent] = useState(false);
  const [vault2faBusy, setVault2faBusy] = useState(false);
  const [vault2faErr, setVault2faErr] = useState('');
  const [wdChain, setWdChain] = useState<'bsc' | 'base' | 'ethereum' | 'arbitrum' | 'solana'>('bsc');
  const [wdTo, setWdTo] = useState('');
  const [wdAmt, setWdAmt] = useState('');
  const [wdBusy, setWdBusy] = useState(false);

  // Rule configuration & backtest modal
  const [ruleModalTrader, setRuleModalTrader] = useState<SmartWalletTraderItem | null>(null);
  const [ruleForm, setRuleForm] = useState({ ...DEFAULT_RULE_FORM });
  const [savingRule, setSavingRule] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestReport, setBacktestReport] = useState<BacktestReport | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  };
  const allTradersPool = [...top10, ...customWallets];
  const comparedTraders = compareIds
    .map((id) => allTradersPool.find((t) => t.id === id))
    .filter((t): t is SmartWalletTraderItem => Boolean(t));

  // Signal test runner & Profit card preview
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [testTokenAddr, setTestTokenAddr] = useState('');
  const [pollingNow, setPollingNow] = useState(false);
  const [cardPreview, setCardPreview] = useState<{ cardId: string; imageUrl: string; verifyUrl: string } | null>(null);
  const onMsgRef = useRef(onMsg);
  onMsgRef.current = onMsg;

  const loadAll = useCallback(async (reconcile = false) => {
    setLoading(true);
    try {
      const [swRes, posRes, vRes] = await Promise.all([
        apiFetch<{
          top10: SmartWalletTraderItem[];
          customWallets: SmartWalletTraderItem[];
          rules: CopyFollowRuleItem[];
        }>(`/api/copy-trade/smart-wallets?chain=${encodeURIComponent(chainFilter)}`),
        apiFetch<{ positions: CopyPositionV2Item[] }>(
          `/api/copy-trade/positions-v2${reconcile ? '?reconcile=1' : ''}`
        ).catch(() => ({ positions: [] })),
        apiFetch<CopyVaultPayload>('/api/copy-trade/vault').catch(() => null),
      ]);
      setTop10(swRes.top10 || []);
      setCustomWallets(swRes.customWallets || []);
      setRules(swRes.rules || []);
      setPositions(posRes.positions || []);
      if (vRes) {
        setVaultData(vRes);
        setVaultLimit(vRes.vault.allowanceLimitUsd);
        setVaultAutoWithdraw(vRes.vault.autoWithdrawToTrust);
      }
    } catch (err) {
      onMsgRef.current(err instanceof Error ? err.message : 'Failed loading Smart Copy Hub', true);
    } finally {
      setLoading(false);
    }
  }, [chainFilter]);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const ruleByTraderId = new Map(rules.map((r) => [r.trader_id, r]));

  const handleRefreshTop10 = async () => {
    setRefreshing(true);
    try {
      await apiFetch('/api/copy-trade/smart-wallets/refresh', { method: 'POST' });
      await loadAll(false);
      onMsg(isFa ? 'لیست ۱۰ تریدر برتر هوشمند با داده‌های زنده DexScreener و آن‌چین بروزرسانی شد.' : 'Top-10 Smart Wallets refreshed.');
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Refresh failed', true);
    } finally {
      setRefreshing(false);
    }
  };

  const openRuleModal = useCallback((trader: SmartWalletTraderItem) => {
    const existing = ruleByTraderId.get(trader.id);
    setRuleModalTrader(trader);
    setBacktestReport(null);
    if (existing) {
      setRuleForm({
        executionMode: existing.execution_mode,
        allocatedMarginUsd: existing.allocated_margin_usd,
        sizingMode: existing.sizing_mode,
        orderSizeUsd: existing.order_size_usd,
        orderSizePct: existing.order_size_pct,
        leverage: existing.leverage,
        tp1Pct: existing.tp1_pct,
        tp1SellPct: existing.tp1_sell_pct,
        tp2Pct: existing.tp2_pct,
        tp2SellPct: existing.tp2_sell_pct,
        tp3Pct: existing.tp3_pct,
        moonbagPct: existing.moonbag_pct,
        stopLossPct: existing.stop_loss_pct,
        trailingActivatePct: existing.trailing_activate_pct,
        trailingDropPct: existing.trailing_drop_pct,
        breakEvenPct: existing.break_even_pct,
        timeLimitHours: existing.time_limit_hours,
        minSafetyScore: existing.min_safety_score,
        maxSlippagePct: existing.max_slippage_pct,
        minLiquidityUsd: existing.min_liquidity_usd,
        minMcapUsd: existing.min_mcap_usd,
        maxMcapUsd: existing.max_mcap_usd,
        maxOpenPositions: existing.max_open_positions,
        dailyMaxLossUsd: existing.daily_max_loss_usd,
        onlyNewPositions: Boolean(existing.only_new_positions),
        copySells: Boolean(existing.copy_sells),
        devSellAutoExit: Boolean(existing.dev_sell_auto_exit),
        antiMev: Boolean(existing.anti_mev),
        aiGuardEnabled: Boolean(existing.ai_guard_enabled),
        reverseCopy: Boolean(existing.reverse_copy),
        isActive: Boolean(existing.is_active),
      });
    } else {
      setRuleForm({ ...DEFAULT_RULE_FORM });
    }
  }, [rules]);

  useEffect(() => {
    if (!externalSiteTrader) return;
    openRuleModal({
      id: externalSiteTrader.id,
      source_type: 'SITE_PICK',
      added_by_user_id: null,
      wallet_address: 'Dollarino VIP Verified Trader',
      chain_id: 'solana',
      display_name: externalSiteTrader.display_name,
      style_tag: 'VIP Curated Trader',
      roi_7d_pct: 18,
      roi_30d_pct: 55,
      realized_pnl_usd: 0,
      win_rate: 74,
      avg_hold_mins: 120,
      trades_30d: 25,
      safety_discipline_score: 90,
      is_bot_filtered: 1,
      top_tokens_json: '[]',
      recent_trades_json: '[]',
      last_synced_at: new Date().toISOString(),
    });
    onClearExternalTrader?.();
  }, [externalSiteTrader, onClearExternalTrader, openRuleModal]);

  const runBacktestInsideModal = async (trader: SmartWalletTraderItem) => {
    setBacktesting(true);
    try {
      const res = await apiFetch<{ report: BacktestReport }>(
        `/api/copy-trade/smart-wallets/${trader.id}/backtest`,
        {
          method: 'POST',
          body: JSON.stringify({
            orderSizeUsd: ruleForm.orderSizeUsd,
            tp1Pct: ruleForm.tp1Pct,
            tp2Pct: ruleForm.tp2Pct,
            stopLossPct: ruleForm.stopLossPct,
            trailingActivatePct: ruleForm.trailingActivatePct,
            trailingDropPct: ruleForm.trailingDropPct,
            breakEvenPct: ruleForm.breakEvenPct,
            minSafetyScore: ruleForm.minSafetyScore,
            reverseCopy: ruleForm.reverseCopy,
          }),
        }
      );
      setBacktestReport(res.report);
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Backtest failed', true);
    } finally {
      setBacktesting(false);
    }
  };

  const saveRule = async () => {
    if (!ruleModalTrader) return;
    setSavingRule(true);
    try {
      const isSite = ruleModalTrader.source_type === 'SITE_PICK';
      await apiFetch('/api/copy-trade/rules', {
        method: 'POST',
        body: JSON.stringify({
          traderKind: isSite ? 'SITE_TRADER' : 'SMART_WALLET',
          traderId: ruleModalTrader.id,
          traderLabel: ruleModalTrader.display_name,
          chainId: isSite ? 'cex' : ruleModalTrader.chain_id,
          ...ruleForm,
        }),
      });
      onMsg(
        isFa
          ? `قانون کپی‌ترید اختصاصی برای «${ruleModalTrader.display_name}» با مارجین $${ruleForm.allocatedMarginUsd} ذخیره و فعال شد!`
          : `Saved copy rule for ${ruleModalTrader.display_name}.`
      );
      setRuleModalTrader(null);
      await loadAll(false);
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Save rule failed', true);
    } finally {
      setSavingRule(false);
    }
  };

  const handleAddCustomWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAddr.trim()) return;
    setAddingCustom(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        trader: SmartWalletTraderItem;
        nativeBalance: number | null;
      }>('/api/copy-trade/smart-wallets/custom', {
        method: 'POST',
        body: JSON.stringify({
          walletAddress: customAddr.trim(),
          chainId: customChain,
          displayName: customName.trim() || undefined,
        }),
      });
      onMsg(
        isFa
          ? `کیف‌پول «${res.trader.display_name}» با موفقیت اضافه و رصد آن‌چین فعال شد!`
          : `Added custom wallet ${res.trader.display_name}`
      );
      setCustomAddr('');
      setCustomName('');
      await loadAll(false);
      openRuleModal(res.trader);
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Failed adding wallet', true);
    } finally {
      setAddingCustom(false);
    }
  };

  const triggerTestSignal = async (rule: CopyFollowRuleItem) => {
    setTestingRuleId(rule.id);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/copy-trade/rules/${rule.id}/test-signal`, {
        method: 'POST',
        body: JSON.stringify({
          tokenAddress: testTokenAddr.trim() || undefined,
        }),
      });
      onMsg(res.message);
      setSubTab('live');
      await loadAll(false);
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Signal test failed', true);
    } finally {
      setTestingRuleId(null);
    }
  };

  const actPosition = async (posId: string, action: 'CONFIRM' | 'CLOSE' | 'CLOSE_50' | 'DISMISS') => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/copy-trade/positions-v2/${posId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      onMsg(res.message);
      await loadAll(false);
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Action failed', true);
    }
  };

  const renderTraderCard = (tr: SmartWalletTraderItem, isCustom = false) => {
    const activeRule = ruleByTraderId.get(tr.id);
    let topTokens: Array<{ symbol: string; chainId?: string; change24h?: number }> = [];
    try {
      topTokens = JSON.parse(tr.top_tokens_json || '[]');
    } catch {
      topTokens = [];
    }
    const holdings = tr.wallet_holdings && tr.wallet_holdings.length > 0
      ? tr.wallet_holdings
      : topTokens.slice(0, 4).map((tk, i) => ({
          symbol: tk.symbol,
          chainId: tk.chainId || tr.chain_id,
          sharePct: [45, 30, 15, 10][i] || 15,
          valueUsd: Math.round((Math.max(15000, Number(tr.realized_pnl_usd || 20000)) * ([45, 30, 15, 10][i] || 15)) / 100),
          change24h: tk.change24h ?? 0,
        }));
    const cat =
      tr.trader_category ||
      (tr.avg_hold_mins >= 1440
        ? 'HOLDER'
        : tr.avg_hold_mins <= 45
          ? 'SCALPER'
          : tr.style_tag.toLowerCase().includes('meme') || tr.style_tag.toLowerCase().includes('pump')
            ? 'SNIPER'
            : 'SWING');
    const catLabel =
      cat === 'HOLDER'
        ? isFa
          ? 'هولدر'
          : 'Holder'
        : cat === 'SCALPER'
          ? isFa
            ? 'اسکلپر'
            : 'Scalper'
          : cat === 'SNIPER'
            ? isFa
              ? 'اسنایپر'
              : 'Sniper'
            : isFa
              ? 'سوئینگ'
              : 'Swing';
    const holdStr =
      tr.avg_hold_mins >= 1440
        ? `${Math.round(tr.avg_hold_mins / 1440)} ${isFa ? 'روز' : 'd'}`
        : tr.avg_hold_mins >= 60
          ? `${Math.round(tr.avg_hold_mins / 60)} ${isFa ? 'ساعت' : 'h'}`
          : `${tr.avg_hold_mins} ${isFa ? 'دقیقه' : 'm'}`;
    const roi24h = tr.roi_24h_pct ?? Number((Number(tr.roi_7d_pct || 0) * 0.24).toFixed(1));

    return (
      <div
        key={tr.id}
        className={`min-w-0 overflow-hidden surface-soft rounded-[24px] p-4 border flex flex-col justify-between gap-3 transition ${
          activeRule?.is_active ? 'border-emerald-500/50 shadow-[0_0_24px_rgba(16,185,129,0.08)]' : 'hairline'
        }`}
      >
        <div className="space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <ChainLogo chain={tr.chain_id} size={16} />
                <h4 className="font-display font-bold text-sm text-main truncate">{tr.display_name}</h4>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-black">
                  {catLabel}
                </span>
                {tr.is_bot_filtered === 1 && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-jade text-[9px] font-black inline-flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{isFa ? 'واقعی' : 'Verified'}</span>
                  </span>
                )}
              </div>
              <p dir="ltr" className="text-[10px] font-mono text-dim mt-1 truncate">
                {tr.wallet_address}
              </p>
              <p className="text-[10px] text-sub mt-0.5">{tr.style_tag}</p>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 text-[10px] font-black uppercase shrink-0">
              {tr.chain_id}
            </span>
          </div>

          <div className="grid grid-cols-4 surface-soft rounded-2xl border hairline divide-x divide-[var(--line)] rtl:divide-x-reverse text-center text-[11px] overflow-hidden">
            <div className="py-2 px-1">
              <div dir="ltr" className="font-num font-black text-jade">
                {roi24h >= 0 ? '+' : ''}
                {roi24h}%
              </div>
              <div className="text-[9px] text-dim mt-0.5">{isFa ? '۲۴ساعته' : '24h'}</div>
            </div>
            <div className="py-2 px-1">
              <div dir="ltr" className="font-num font-black text-jade">
                +{tr.roi_7d_pct}%
              </div>
              <div className="text-[9px] text-dim mt-0.5">{isFa ? 'هفتگی' : '7d'}</div>
            </div>
            <div className="py-2 px-1">
              <div dir="ltr" className="font-num font-black text-jade">
                +{tr.roi_30d_pct}%
              </div>
              <div className="text-[9px] text-dim mt-0.5">{isFa ? 'ماهانه' : '30d'}</div>
            </div>
            <div className="py-2 px-1">
              <div dir="ltr" className="font-num font-black text-amber-500 dark:text-amber-400">
                ${Math.round(tr.realized_pnl_usd).toLocaleString()}
              </div>
              <div className="text-[9px] text-dim mt-0.5">{isFa ? 'سود کل' : 'PnL'}</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-dim">
            <span>
              {isFa ? 'نرخ برد:' : 'WinRate:'} <strong className="text-main">{tr.win_rate}%</strong> ·{' '}
              {isFa ? 'ایمنی:' : 'Safety:'} <strong className="text-jade">{tr.safety_discipline_score}/100</strong>
            </span>
            <span>
              {isFa ? 'نگهداری:' : 'Hold:'} <strong className="text-main">{holdStr}</strong>
            </span>
          </div>

          {holdings.length > 0 && (
            <div className="panel rounded-2xl p-2.5 space-y-1.5 border hairline">
              <div className="flex items-center justify-between text-[10px] font-black text-dim">
                <span className="inline-flex items-center gap-1">
                  <Coins className="w-3 h-3 text-[var(--gold)]" />
                  <span>{isFa ? 'ارزهای داخل کیف‌پول تریدر:' : 'Wallet Holdings:'}</span>
                </span>
                <span className="font-num">{holdings.length} {isFa ? 'دارایی' : 'assets'}</span>
              </div>
              <div className="space-y-1">
                {holdings.slice(0, 4).map((h, i) => (
                  <div key={`${h.symbol}-${i}`} className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-black text-main">${h.symbol}</span>
                      <span dir="ltr" className="text-dim font-num">{h.sharePct}%</span>
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden max-w-[90px]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1652f0] to-[#10b981]"
                        style={{ width: `${Math.min(100, Math.max(8, h.sharePct))}%` }}
                      />
                    </div>
                    <div dir="ltr" className="flex items-center gap-1.5 shrink-0 font-num">
                      <span className="text-sub">${Math.round(h.valueUsd).toLocaleString()}</span>
                      {typeof h.change24h === 'number' && h.change24h !== 0 && (
                        <span className={h.change24h >= 0 ? 'text-jade' : 'text-loss'}>
                          {h.change24h >= 0 ? '+' : ''}
                          {h.change24h.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeRule && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-[10px] space-y-1">
              <div className="flex items-center justify-between font-black text-jade">
                <span className="inline-flex items-center gap-1">
                  {activeRule.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5 text-amber-400" />}
                  <span>
                    {activeRule.is_active
                      ? isFa
                        ? 'فالو فعال'
                        : 'Active Follow'
                      : isFa
                        ? 'متوقف'
                        : 'Paused'}
                  </span>
                </span>
                <span dir="ltr" className="inline-flex items-center gap-1">
                  {activeRule.execution_mode === 'TRUST_ONE_CLICK' ? (
                    <>
                      <Wallet className="w-3 h-3" />
                      <span>Trust 1-Click</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" />
                      <span>Auto Vault 24/7</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sub">
                <span>{isFa ? 'مارجین باکس اختصاصی:' : 'Isolated Margin:'}</span>
                <strong dir="ltr" className="text-main">
                  ${activeRule.used_margin_usd.toFixed(0)} / ${activeRule.allocated_margin_usd.toFixed(0)}
                </strong>
              </div>
              <div className="text-[9px] text-dim">
                TP: +{activeRule.tp1_pct}% / +{activeRule.tp2_pct}% / +{activeRule.tp3_pct}% · SL: -{activeRule.stop_loss_pct}%
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t hairline">
          <button
            type="button"
            onClick={() => openRuleModal(tr)}
            className={`py-2 px-2.5 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 ${
              activeRule?.is_active ? 'bg-[#059669] text-white' : 'btn-gold'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>
              {activeRule
                ? isFa
                  ? 'ویرایش مارجین و قوانین'
                  : 'Edit Rules'
                : isFa
                  ? 'فالو و تنظیم قوانین'
                  : 'Follow & Rules'}
            </span>
          </button>
          <button
            type="button"
            disabled={activeRule ? testingRuleId === activeRule.id : false}
            onClick={() => {
              if (activeRule) {
                void triggerTestSignal(activeRule);
              } else {
                openRuleModal(tr);
                onMsg(
                  isFa
                    ? `ابتدا قانون و مارجین «${tr.display_name}» را ذخیره کنید تا تست سیگنال اجرا شود.`
                    : `Save copy rule for ${tr.display_name} to trigger a test signal.`
                );
              }
            }}
            className="btn-cobalt px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
            title={isFa ? 'شبیه‌سازی دریافت یک سیگنال واقعی برای تست' : 'Test Signal'}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{activeRule && testingRuleId === activeRule.id ? '...' : isFa ? 'تست سیگنال' : 'Test Signal'}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleCompare(tr.id)}
            className={`px-2.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1 transition ${
              compareIds.includes(tr.id) ? 'btn-cobalt' : 'btn-ghost text-dim hover:text-main'
            } ${isCustom ? '' : 'col-span-2'}`}
            title={isFa ? 'افزودن به مقایسه کنار هم' : 'Compare trader'}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{compareIds.includes(tr.id) ? (isFa ? 'انتخاب شد' : 'Picked') : isFa ? 'مقایسه' : 'Compare'}</span>
          </button>
          {isCustom && (
            <button
              type="button"
              onClick={async () => {
                await apiFetch(`/api/copy-trade/smart-wallets/custom/${tr.id}`, { method: 'DELETE' });
                onMsg(isFa ? 'کیف‌پول حذف شد.' : 'Removed.');
                await loadAll(false);
              }}
              className="btn-ghost py-2 px-2.5 rounded-xl text-loss text-[11px] font-bold inline-flex items-center justify-center gap-1"
              title={isFa ? 'حذف ولت' : 'Delete'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isFa ? 'حذف' : 'Delete'}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const filteredSortedTraders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = top10.filter((tr) => {
      const cat =
        tr.trader_category ||
        (tr.avg_hold_mins >= 1440
          ? 'HOLDER'
          : tr.avg_hold_mins <= 45
            ? 'SCALPER'
            : tr.style_tag.toLowerCase().includes('meme') || tr.style_tag.toLowerCase().includes('pump')
              ? 'SNIPER'
              : 'SWING');
      if (styleFilter !== 'ALL' && cat !== styleFilter) return false;
      if (q) {
        const hay = `${tr.display_name} ${tr.wallet_address} ${tr.style_tag} ${tr.chain_id} ${(tr.wallet_holdings || []).map((h) => h.symbol).join(' ')} ${tr.top_tokens_json}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const a24 = a.roi_24h_pct ?? Number(a.roi_7d_pct || 0) * 0.24;
      const b24 = b.roi_24h_pct ?? Number(b.roi_7d_pct || 0) * 0.24;
      switch (sortBy) {
        case 'roi_30d_asc':
          return Number(a.roi_30d_pct || 0) - Number(b.roi_30d_pct || 0);
        case 'roi_24h_desc':
          return b24 - a24;
        case 'roi_7d_desc':
          return Number(b.roi_7d_pct || 0) - Number(a.roi_7d_pct || 0);
        case 'pnl_desc':
          return Number(b.realized_pnl_usd || 0) - Number(a.realized_pnl_usd || 0);
        case 'pnl_asc':
          return Number(a.realized_pnl_usd || 0) - Number(b.realized_pnl_usd || 0);
        case 'win_rate_desc':
          return Number(b.win_rate || 0) - Number(a.win_rate || 0);
        case 'safety_desc':
          return Number(b.safety_discipline_score || 0) - Number(a.safety_discipline_score || 0);
        case 'roi_30d_desc':
        default:
          return Number(b.roi_30d_pct || 0) - Number(a.roi_30d_pct || 0);
      }
    });
  }, [top10, styleFilter, sortBy, searchTerm]);

  return (
    <div className="panel rounded-[28px] p-4 sm:p-6 space-y-5 border border-brand/25 min-w-0 overflow-hidden">
      {/* Visual Header & Collapsible Quick-Start Guide */}
      <div className="surface-soft rounded-[22px] p-4 border border-amber-500/20 space-y-3 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/12 text-[var(--gold)] flex items-center justify-center shrink-0">
            <Radar className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display font-bold text-base sm:text-lg text-main leading-snug">
                  {isFa
                    ? 'هاب کپی‌ترید هوشمند ولت‌ها و سبد دارایی نهنگ‌ها (V2)'
                    : 'Smart On-Chain Copy-Trading & Wallet Holdings Hub V2'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide((g) => !g)}
                className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0"
              >
                {showGuide ? (isFa ? 'بستن راهنما' : 'Hide Guide') : isFa ? 'آموزش گام‌به‌گام' : 'Guide'}
              </button>
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              {isFa
                ? 'دسترسی به تمام تریدرهای پرسود، فیلتر و مرتب‌سازی روزانه/هفتگی/ماهانه و سبک هولدرها، مشاهده ارزهای داخل کیف‌پول هر تریدر، و اجرای مستقیم روی Trust Wallet خودتان (یا ولت اختصاصی ۲۴ ساعته با کلید در اختیار خودتان).'
                : 'Browse all profitable Smart Money traders, filter by style (Holders/Scalpers/Swing) & 24h/7d/30d PnL, inspect exact wallet token holdings, and copy via your Trust Wallet or 24/7 self-owned agent wallet.'}
            </p>
          </div>
        </div>

        {showGuide && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t hairline text-[11px]">
            <div className="panel rounded-2xl p-3 space-y-1">
              <p className="font-black text-[var(--gold)]">
                {isFa ? '۱) انتخاب ولت (فقط ترید جدید)' : '1) Pick Wallet (Fresh Only)'}
              </p>
              <p className="text-dim leading-relaxed">
                {isFa
                  ? 'از لیست «۱۰ تریدر برتر» انتخاب یا ولت دلخواه‌تان را ثبت کنید. فقط خریدهایی که از لحظه فالو باز می‌شوند کپی می‌گردند.'
                  : 'Pick from Top-10 or add a custom wallet. Only new trades opened after follow time are copied.'}
              </p>
            </div>
            <div className="panel rounded-2xl p-3 space-y-1">
              <p className="font-black text-jade">
                {isFa ? '۲) باکس مارجین ایزوله + بک‌تست' : '2) Margin Box + Backtest'}
              </p>
              <p className="text-dim leading-relaxed">
                {isFa
                  ? 'هر تریدر باکس بودجه و سقف ضرر روزانه جداگانه دارد. پیش از شروع با دکمه «بک‌تست ۷ روزه» TP1/2/3، SL و فیلتر ضدراگ را بسنجید.'
                  : 'Each trader has an isolated margin box & daily loss cap. Run the 7-day backtest before activating.'}
              </p>
            </div>
            <div className="panel rounded-2xl p-3 space-y-1">
              <p className="font-black text-brand">
                {isFa ? '۳) انتخاب حالت اجرا' : '3) Execution Mode'}
              </p>
              <p className="text-dim leading-relaxed">
                {isFa
                  ? '«Trust 1-Click»: امضای یک‌لمسی داخل تراست‌ولت شما | «Copy-Vault 24/7»: اجرای تمام‌خودکار خزانه با امکان دریافت کلید خصوصی.'
                  : 'Trust 1-Click (user signs in Trust Wallet) or 24/7 Copy-Vault (automated swap + key export).'}
              </p>
            </div>
            <div className="panel rounded-2xl p-3 space-y-1">
              <p className="font-black text-amber-400">
                {isFa ? '۴) ضدراگ، Dev-Sell و کارت سود' : '4) Anti-Rug & PnL Card'}
              </p>
              <p className="text-dim leading-relaxed">
                {isFa
                  ? 'پایش لحظه‌ای هر دقیقه اجرا می‌شود؛ با ریزش یا فروش دولوپر خروج فوری می‌زند و می‌توانید کارت سود تاییدشده بگیرید.'
                  : 'Minute-by-minute monitor auto-exits on Dev-Sell/TP/SL and issues Verified PnL Cards.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'top10', icon: Trophy, fa: `همه تریدرهای پرسود (${filteredSortedTraders.length})`, en: `All Profitable (${filteredSortedTraders.length})` },
            { id: 'custom', icon: Plus, fa: `ولت‌های دلخواه من (${customWallets.length})`, en: `Custom Wallets (${customWallets.length})` },
            { id: 'vault', icon: Vault, fa: 'ولت ۲۴ ساعته شما (کلید اختصاصی)', en: '24/7 Self-Owned Wallet' },
            { id: 'live', icon: Activity, fa: `پوزیشن‌ها و باکس‌ها (${positions.length})`, en: `Positions & Boxes (${positions.length})` },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id as typeof subTab)}
                className={`px-3 py-2 rounded-xl text-[11px] font-black transition inline-flex items-center gap-1.5 ${
                  subTab === t.id ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isFa ? t.fa : t.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Trader Compare Floating Selection Bar */}
      {comparedTraders.length > 0 && (
        <div className="surface-soft rounded-2xl px-4 py-2.5 border border-[#1652f0]/40 flex flex-wrap items-center justify-between gap-2 text-xs tab-enter">
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="w-4 h-4 text-brand shrink-0" />
            <span className="font-black text-main">
              {isFa
                ? `مقایسه تریدرها (${comparedTraders.length}/2):`
                : `Compare Traders (${comparedTraders.length}/2):`}
            </span>
            {comparedTraders.map((t) => (
              <span key={t.id} className="px-2.5 py-1 rounded-xl panel text-[11px] font-bold text-main inline-flex items-center gap-1.5">
                <ChainLogo chain={t.chain_id} size={13} />
                <span>{t.display_name}</span>
                <button type="button" onClick={() => toggleCompare(t.id)} className="text-dim hover:text-loss">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={comparedTraders.length < 2}
              onClick={() => setCompareOpen(true)}
              className="btn-cobalt px-3.5 py-1.5 rounded-xl text-[11px] font-black disabled:opacity-45"
            >
              {isFa ? 'نمایش جدول مقایسه کنار هم' : 'Compare Side-by-Side'}
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
            >
              {isFa ? 'پاک کردن' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: ALL PROFITABLE SMART WALLETS WITH FULL FILTERS & HOLDINGS */}
      {subTab === 'top10' && (
        <div className="space-y-4 tab-enter">
          <div className="panel rounded-3xl p-4 sm:p-5 space-y-3.5 border hairline shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-dim absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={isFa ? 'جستجو نام تریدر، آدرس ولت یا ارز داخل ولت (مثل SOL, PEPE, AERO)...' : 'Search trader, wallet or held coin (SOL, PEPE)...'}
                  className="input-field h-10 ps-10 pe-3 rounded-xl text-xs w-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ProDropdown
                  value={styleFilter}
                  icon={<Filter className="w-3.5 h-3.5 text-brand" />}
                  onChange={(v) => setStyleFilter(v as typeof styleFilter)}
                  menuMinWidthClass="min-w-[190px]"
                  options={[
                    { value: 'ALL', label: isFa ? 'همه سبک‌ها' : 'All Styles' },
                    { value: 'HOLDER', label: isFa ? 'هولدرها (بلندمدت)' : 'Holders' },
                    { value: 'SCALPER', label: isFa ? 'اسکلپرها (سریع)' : 'Scalpers' },
                    { value: 'SWING', label: isFa ? 'سوئینگ تریدرها' : 'Swing Traders' },
                    { value: 'SNIPER', label: isFa ? 'اسنایپر میم‌کوین' : 'Meme Snipers' },
                  ]}
                />

                <ProDropdown
                  value={sortBy}
                  icon={<ArrowUpDown className="w-3.5 h-3.5 text-[var(--gold)]" />}
                  onChange={(v) => setSortBy(v as typeof sortBy)}
                  align="end"
                  menuMinWidthClass="min-w-[250px]"
                  options={[
                    { value: 'roi_30d_desc', label: isFa ? 'بیشترین سود ماهانه (۳۰ر)' : 'Highest 30d ROI' },
                    { value: 'roi_30d_asc', label: isFa ? 'کمترین سود ماهانه' : 'Lowest 30d ROI' },
                    { value: 'roi_24h_desc', label: isFa ? 'بیشترین سود روزانه (۲۴س)' : 'Highest 24h ROI' },
                    { value: 'roi_7d_desc', label: isFa ? 'بیشترین سود هفتگی (۷ر)' : 'Highest 7d ROI' },
                    { value: 'pnl_desc', label: isFa ? 'بیشترین سود دلاری (PnL)' : 'Highest Net PnL ($)' },
                    { value: 'pnl_asc', label: isFa ? 'کمترین سود دلاری' : 'Lowest Net PnL ($)' },
                    { value: 'win_rate_desc', label: isFa ? 'بالاترین نرخ برد' : 'Highest Win Rate' },
                    { value: 'safety_desc', label: isFa ? 'بالاترین امتیاز ایمنی' : 'Highest Safety' },
                  ]}
                />

                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void handleRefreshTop10()}
                  className="h-10 px-3.5 rounded-xl border hairline surface-soft hover:border-[var(--line-strong)] text-[11px] sm:text-xs font-bold text-main inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-brand ${refreshing ? 'animate-spin' : ''}`} />
                  <span>{isFa ? 'بروزرسانی زنده' : 'Refresh'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t hairline">
              <div className="flex flex-wrap items-center gap-1.5">
                {CHAIN_TABS.map((ch) => {
                  const active = chainFilter === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChainFilter(ch)}
                      className={`h-8 px-3 rounded-xl text-[11px] font-black uppercase inline-flex items-center gap-1.5 transition border ${
                        active
                          ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                          : 'surface-soft hairline text-dim hover:text-main hover:border-[var(--line-strong)]'
                      }`}
                    >
                      {ch !== 'ALL' && <ChainLogo chain={ch} size={13} />}
                      <span>{ch === 'ALL' ? (isFa ? 'همه شبکه‌ها' : 'All Chains') : ch}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-dim font-bold font-num">
                  {isFa ? `${filteredSortedTraders.length} تریدر` : `${filteredSortedTraders.length} traders`}
                </span>
                {(chainFilter !== 'ALL' || styleFilter !== 'ALL' || searchTerm.trim() !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setChainFilter('ALL');
                      setStyleFilter('ALL');
                      setSearchTerm('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-loss font-black hover:bg-rose-500/20 transition inline-flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    <span>{isFa ? 'پاک کردن فیلترها' : 'Reset'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-dim">
              {isFa ? 'در حال اسکن و دسته‌بندی برترین کیف‌پول‌های Smart Money...' : 'Discovering Smart Money wallets...'}
            </div>
          ) : filteredSortedTraders.length === 0 ? (
            <div className="surface-soft rounded-[24px] p-6 sm:p-8 text-center space-y-3 border hairline">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 grid place-items-center mx-auto">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="font-display font-bold text-sm text-main">
                  {isFa ? 'هیچ تریدری با فیلترهای انتخابی یافت نشد' : 'No traders match your active filters'}
                </p>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'می‌توانید فیلتر شبکه یا سبک هولدر را تغییر دهید یا ولت دلخواه‌تان را ثبت کنید.'
                    : 'Reset filters or track any custom wallet address directly.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setChainFilter('ALL');
                    setStyleFilter('ALL');
                    setSearchTerm('');
                  }}
                  className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black"
                >
                  {isFa ? 'حذف همه فیلترها' : 'Reset All Filters'}
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('custom')}
                  className="btn-gold px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'افزودن ولت دلخواه' : 'Add Custom Wallet'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredSortedTraders.map((tr) => renderTraderCard(tr, false))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USER CUSTOM WALLETS */}
      {subTab === 'custom' && (
        <div className="space-y-4 tab-enter">
          <form onSubmit={(e) => void handleAddCustomWallet(e)} className="surface-soft rounded-2xl p-4 space-y-3 border border-[var(--border)]">
            <h4 className="font-black text-xs text-main inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-brand" />
              <span>{isFa ? 'لینک کردن آدرس کیف‌پول دلخواه شما (نهنگ، KOL یا تریدر شخصی)' : 'Track Any Custom Wallet Address'}</span>
            </h4>
            <div className="grid sm:grid-cols-4 gap-2.5">
              <ProDropdown
                value={customChain}
                onChange={(c) => setCustomChain(c)}
                menuMinWidthClass="min-w-[160px]"
                options={['solana', 'bsc', 'ethereum', 'base', 'arbitrum', 'polygon', 'optimism', 'avalanche', 'ton', 'tron'].map((c) => ({
                  value: c,
                  label: c.toUpperCase(),
                }))}
              />
              <input
                value={customAddr}
                onChange={(e) => setCustomAddr(e.target.value)}
                dir="ltr"
                required
                placeholder={isFa ? 'آدرس کامل ولت (0x... یا آدرس Solana/TON/TRON)' : 'Wallet address (0x... or Solana/TON/TRON)'}
                className="input-field sm:col-span-2 py-2 px-3 rounded-xl text-xs font-mono"
              />
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={isFa ? 'نام مستعار (مثلاً نهنگ بایننس)' : 'Nickname (optional)'}
                className="input-field py-2 px-3 rounded-xl text-xs"
              />
            </div>
            <button type="submit" disabled={addingCustom} className="btn-gold px-5 py-2 rounded-xl text-xs font-black">
              {addingCustom ? '...' : isFa ? 'بررسی موجودی بلاکچین، ثبت و تنظیم قوانین فالو' : 'Inspect, Link & Configure Copy Rules'}
            </button>
          </form>

          {customWallets.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
              {isFa
                ? 'هنوز کیف‌پول شخصی اضافه نکرده‌اید. آدرس هر ولت معامله‌گر را بالا وارد کنید تا تراکنش‌هایش از این لحظه به بعد کپی شود.'
                : 'No custom wallets tracked yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {customWallets.map((tr) => renderTraderCard(tr, true))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 24/7 ISOLATED COPY-VAULT */}
      {subTab === 'vault' && (
        <div className="space-y-4 tab-enter">
          <div className="surface-soft rounded-2xl p-4 space-y-3 border border-amber-400/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Vault className="w-5 h-5 text-amber-400" />
                <h4 className="font-black text-sm text-main">
                  {isFa
                    ? 'ولت ایزوله ۲۴ ساعته شخصی شما (کلید خصوصی ۱۰۰٪ در اختیار خودتان)'
                    : 'Your Isolated 24/7 Trading Wallet (Self-Owned Private Key)'}
                </h4>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-jade text-[10px] font-black">
                AES-256 Encrypted
              </span>
            </div>
            <p className="text-[11px] text-sub leading-relaxed">
              {isFa
                ? 'در حالت پیش‌فرض «Trust Wallet 1-Click»، کیف‌پول اصلی شما هیچ انتقال سرمایه‌ای ندارد و هر خرید با تایید خودتان اجرا می‌شود. اما اگر می‌خواهید هنگام خواب هم معامله ۲۴ ساعته انجام شود، می‌توانید این ولت ایزوله اختصاصی خودتان را بسازید و هر لحظه کلید خصوصیش را داخل Trust Wallet خودتان ایمپورت و مستقیم کنترل کنید (هیچ پولی به حساب دلارینو واریز نمی‌شود).'
                : 'By default, Trust 1-Click trades directly from your connected Trust Wallet without moving funds. This optional 24/7 sub-wallet is strictly yours — export its private key anytime and import it directly inside your Trust Wallet app.'}
            </p>

            {vaultData && (
              <div className="grid md:grid-cols-3 gap-3">
                {[
                  {
                    chain: 'bsc',
                    title: 'EVM (BSC / ETH / Base / ARB)',
                    addr: vaultData.vault.evmAddress,
                    bal: `BNB: ${vaultData.balances.bscBnb.toFixed(4)} | ETH: ${vaultData.balances.eth.toFixed(4)} | Base: ${vaultData.balances.baseEth.toFixed(4)}`,
                  },
                  {
                    chain: 'solana',
                    title: 'Solana (Jupiter / Pump.fun)',
                    addr: vaultData.vault.solanaAddress,
                    bal: `SOL: ${vaultData.balances.solana.toFixed(4)}`,
                  },
                  {
                    chain: 'tron',
                    title: 'TRON (SunSwap / TRC20)',
                    addr: vaultData.vault.tronAddress,
                    bal: `USDT: ${vaultData.balances.tronUsdt.toFixed(2)} | TRX: ${vaultData.balances.tronTrx.toFixed(2)}`,
                  },
                ].map((v) => (
                  <div key={v.chain} className="panel rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-main">
                      <ChainLogo chain={v.chain} size={15} />
                      <span>{v.title}</span>
                    </div>
                    <div dir="ltr" className="text-[10px] font-mono break-all text-sub surface-soft border hairline p-2 rounded-xl">
                      {v.addr}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span dir="ltr" className="text-[10px] font-num text-jade">
                        {v.bal}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(v.addr);
                          setCopiedAddr(v.addr);
                          setTimeout(() => setCopiedAddr(null), 2000);
                        }}
                        className="btn-ghost px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
                      >
                        {copiedAddr === v.addr ? <Check className="w-3 h-3 text-jade" /> : <CopyIcon className="w-3 h-3" />}
                        <span>{isFa ? 'کپی' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {vaultData && hasAnyInjectedWallet() && (
              <div className="rounded-2xl bg-sky-500/10 border border-sky-500/25 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <p className="font-black text-main inline-flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8]" />
                    <span>{isFa ? 'واریز ۱-کلیکی از Trust Wallet به خزانه ۲۴/۷:' : '1-Click Fund Copy-Vault from Trust Wallet:'}</span>
                  </p>
                  <p className="text-[11px] text-dim">
                    {isFa
                      ? 'مستقیماً داخل Trust Wallet DApp مبلغ مورد نظر را برای معامله خودکار واریز کنید.'
                      : 'Approve native transfer inside Trust Wallet directly to your isolated Copy-Vault.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[25, 50, 100, 250].map((usd) => (
                    <button
                      key={usd}
                      type="button"
                      disabled={wdBusy}
                      onClick={async () => {
                        setWdBusy(true);
                        try {
                          const isSol = wdChain === 'solana';
                          const targetAddr = isSol ? vaultData.vault.solanaAddress : vaultData.vault.evmAddress;
                          const approxNative = isSol
                            ? Number((usd / 180).toFixed(4))
                            : wdChain === 'bsc'
                              ? Number((usd / 600).toFixed(4))
                              : Number((usd / 3000).toFixed(4));
                          const txHash = await fundCopyVaultFromDapp({
                            networkKey: wdChain,
                            vaultAddress: targetAddr,
                            amountNative: approxNative,
                            amountUsd: usd,
                          });
                          onMsg(
                            isFa
                              ? `شارژ ~$${usd} (${approxNative} ${isSol ? 'SOL' : wdChain === 'bsc' ? 'BNB' : 'ETH'}) به خزانه ارسال شد! ${txHash === 'DEEP_LINK_OPENED' ? '(لینک Trust Wallet باز شد)' : `TX: ${txHash.slice(0, 12)}...`}`
                              : `Funded ~$${usd} to Copy-Vault! ${txHash === 'DEEP_LINK_OPENED' ? '(Trust Wallet opened)' : `TX: ${txHash.slice(0, 12)}...`}`
                          );
                          await loadAll(false);
                        } catch (e) {
                          onMsg(e instanceof Error ? e.message : 'Transfer failed', true);
                        } finally {
                          setWdBusy(false);
                        }
                      }}
                      className="btn-cobalt px-3 py-1.5 rounded-xl text-[11px] font-black disabled:opacity-50"
                    >
                      <span dir="ltr">+${usd}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t hairline text-xs">
              <div className="flex items-center gap-2">
                <span className="text-dim">{isFa ? 'سقف مصرف مجاز خزانه ($):' : 'Vault Daily Cap ($):'}</span>
                <input
                  type="number"
                  min={10}
                  value={vaultLimit}
                  onChange={(e) => setVaultLimit(Number(e.target.value || 500))}
                  dir="ltr"
                  className="input-field w-24 py-1 px-2 rounded-xl text-xs font-num"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 text-sub cursor-pointer">
                <input
                  type="checkbox"
                  checked={vaultAutoWithdraw}
                  onChange={(e) => setVaultAutoWithdraw(e.target.checked)}
                />
                <span>{isFa ? 'ارسال سودهای خالص به Trust Wallet اصلی' : 'Auto-sweep net profits to Trust Wallet'}</span>
              </label>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/api/copy-trade/vault/settings', {
                    method: 'POST',
                    body: JSON.stringify({
                      allowanceLimitUsd: vaultLimit,
                      autoWithdrawToTrust: vaultAutoWithdraw,
                    }),
                  });
                  onMsg(isFa ? 'تنظیمات امنیتی خزانه ذخیره شد.' : 'Vault settings saved.');
                }}
                className="btn-cobalt px-4 py-1.5 rounded-xl text-xs font-black"
              >
                {isFa ? 'ذخیره تنظیمات خزانه' : 'Save Vault Caps'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (exportedKeys) {
                    setExportedKeys(null);
                    return;
                  }
                  setVault2faErr('');
                  setVault2faPassword('');
                  setVault2faPin('');
                  setVault2faOpen(true);
                }}
                className="btn-ghost px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-400 inline-flex items-center gap-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {exportedKeys
                    ? isFa
                      ? 'مخفی‌کردن کلیدهای خصوصی'
                      : 'Hide Private Keys'
                    : isFa
                      ? 'پشتیبان‌گیری و کلید خزانه (با تایید ۲ مرحله‌ای)'
                      : 'Export Vault Keys (2FA)'}
                </span>
              </button>
            </div>

            {/* Clear Safety Cap Warning + Profit Withdraw to Trust Wallet Card */}
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black text-amber-400">
                    {isFa ? `هشدار سقف امنیتی خزانه: حداکثر $${vaultLimit} مجاز` : `Vault Safety Cap Active: Max $${vaultLimit}`}
                  </p>
                  <p className="text-[11px] text-sub leading-relaxed">
                    {isFa
                      ? 'توصیه امنیتی: فقط به اندازه بودجه معاملات ۲۴ ساعته در خزانه واریز کنید و سرمایه اصلی را همیشه داخل Trust Wallet شخصی خودتان نگه دارید.'
                      : 'Keep only your active 24/7 copy-trading budget inside the Vault; keep your main wealth inside Trust Wallet.'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-jade inline-flex items-center gap-1.5">
                    <Wallet className="w-4 h-4" />
                    <span>{isFa ? 'برداشت مستقیم سود از خزانه به Trust Wallet' : 'Direct Withdraw Vault → Trust Wallet'}</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <ProDropdown
                    value={wdChain}
                    onChange={(next) => {
                      const c = next as typeof wdChain;
                      setWdChain(c);
                      if (c === 'solana' && vaultData?.trustWalletTargets?.solana) {
                        setWdTo(vaultData.trustWalletTargets.solana);
                      } else if (c !== 'solana' && vaultData?.trustWalletTargets?.evm) {
                        setWdTo(vaultData.trustWalletTargets.evm);
                      }
                    }}
                    options={[
                      { value: 'bsc', label: 'BSC (BNB)' },
                      { value: 'base', label: 'Base (ETH)' },
                      { value: 'arbitrum', label: 'Arbitrum (ETH)' },
                      { value: 'ethereum', label: 'Ethereum (ETH)' },
                      { value: 'solana', label: 'Solana (SOL)' },
                    ]}
                  />
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    dir="ltr"
                    value={wdAmt}
                    onChange={(e) => setWdAmt(e.target.value)}
                    placeholder={wdChain === 'solana' ? 'Amount (SOL)' : wdChain === 'bsc' ? 'Amount (BNB)' : 'Amount (ETH)'}
                    className="input-field py-1.5 px-2 rounded-xl text-[11px] font-num"
                  />
                </div>

                <input
                  value={
                    wdTo ||
                    (wdChain === 'solana'
                      ? vaultData?.trustWalletTargets?.solana || ''
                      : vaultData?.trustWalletTargets?.evm || '')
                  }
                  onChange={(e) => setWdTo(e.target.value)}
                  dir="ltr"
                  placeholder={isFa ? 'آدرس مقصد Trust Wallet (0x... یا Solana)' : 'Trust Wallet destination address'}
                  className="input-field w-full py-1.5 px-2.5 rounded-xl text-[11px] font-mono"
                />

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <input
                    type="password"
                    value={vault2faPassword}
                    onChange={(e) => setVault2faPassword(e.target.value)}
                    placeholder={isFa ? 'رمز حساب (یا پین تلگرام)' : 'Password (or TG PIN)'}
                    className="input-field py-1.5 px-2 rounded-xl text-[11px]"
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={vault2faPin}
                      onChange={(e) => setVault2faPin(e.target.value)}
                      dir="ltr"
                      placeholder="PIN"
                      className="input-field w-full py-1.5 px-2 rounded-xl text-[11px] font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch('/api/copy-trade/vault/request-pin', { method: 'POST' });
                          setVault2faPinSent(true);
                          onMsg(isFa ? 'کد ۶ رقمی تایید به تلگرام شما ارسال شد.' : '6-digit PIN sent to Telegram.');
                        } catch (err) {
                          onMsg(err instanceof Error ? err.message : 'PIN failed', true);
                        }
                      }}
                      className="btn-ghost px-2 rounded-xl text-[10px] font-bold shrink-0"
                    >
                      {vault2faPinSent ? '✓' : 'TG PIN'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={wdBusy || (!vault2faPassword.trim() && !vault2faPin.trim())}
                  onClick={async () => {
                    const targetAddr =
                      wdTo.trim() ||
                      (wdChain === 'solana'
                        ? vaultData?.trustWalletTargets?.solana || ''
                        : vaultData?.trustWalletTargets?.evm || '');
                    const amt = Number(wdAmt);
                    if (!targetAddr || !Number.isFinite(amt) || amt <= 0) {
                      onMsg(isFa ? 'آدرس مقصد و مبلغ برداشت معتبر وارد کنید.' : 'Enter valid destination address & amount.', true);
                      return;
                    }
                    setWdBusy(true);
                    try {
                      const res = await apiFetch<{ txHash: string; amountSent: number; symbol: string }>('/api/copy-trade/vault/withdraw', {
                        method: 'POST',
                        body: JSON.stringify({
                          chainId: wdChain,
                          toAddress: targetAddr,
                          amountNative: amt,
                          password: vault2faPassword.trim() || undefined,
                          pinCode: vault2faPin.trim() || undefined,
                        }),
                      });
                      setWdAmt('');
                      onMsg(
                        isFa
                          ? `برداشت ${res.amountSent} ${res.symbol} با موفقیت انجام شد (${res.txHash.slice(0, 14)}...)`
                          : `Withdrew ${res.amountSent} ${res.symbol} (${res.txHash.slice(0, 14)}...)`
                      );
                      await loadAll(false);
                    } catch (err) {
                      onMsg(err instanceof Error ? err.message : 'Withdraw error', true);
                    } finally {
                      setWdBusy(false);
                    }
                  }}
                  className="btn-emerald w-full py-2 rounded-xl text-[11px] font-black disabled:opacity-50"
                >
                  {wdBusy ? '...' : isFa ? 'انتقال مستقیم به Trust Wallet' : 'Withdraw Directly to Trust Wallet'}
                </button>
              </div>
            </div>

            {vault2faOpen && (
              <div className="panel rounded-2xl p-4 space-y-3 border border-amber-400/40 text-xs tab-enter">
                <div className="flex items-center justify-between">
                  <p className="font-black text-main inline-flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>{isFa ? 'تایید هویت ۲ مرحله‌ای قبل از نمایش کلید خصوصی خزانه' : '2-Step Verification Before Exporting Private Keys'}</span>
                  </p>
                  <button type="button" onClick={() => setVault2faOpen(false)} className="text-dim hover:text-main">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {vault2faErr && <p className="text-loss font-bold text-[11px]">{vault2faErr}</p>}

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-dim block">
                      {isFa ? 'روش ۱: رمز عبور حساب کاربری' : 'Option 1: Account Password'}
                    </label>
                    <input
                      type="password"
                      value={vault2faPassword}
                      onChange={(e) => setVault2faPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-field w-full py-2 px-3 rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-dim">
                        {isFa ? 'روش ۲: کد ۶ رقمی تلگرام' : 'Option 2: 6-Digit Telegram PIN'}
                      </label>
                      <button
                        type="button"
                        disabled={vault2faBusy}
                        onClick={async () => {
                          setVault2faErr('');
                          setVault2faBusy(true);
                          try {
                            await apiFetch('/api/copy-trade/vault/request-pin', { method: 'POST' });
                            setVault2faPinSent(true);
                          } catch (err) {
                            setVault2faErr(err instanceof Error ? err.message : 'Telegram PIN failed');
                          } finally {
                            setVault2faBusy(false);
                          }
                        }}
                        className="text-[10.5px] font-black text-brand hover:underline"
                      >
                        {vault2faPinSent ? (isFa ? '✓ کد ارسال شد' : '✓ Sent') : (isFa ? 'ارسال کد به تلگرام' : 'Send PIN')}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={vault2faPin}
                      onChange={(e) => setVault2faPin(e.target.value)}
                      dir="ltr"
                      placeholder="123456"
                      className="input-field w-full py-2 px-3 rounded-xl text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setVault2faOpen(false)} className="btn-ghost px-3 py-1.5 rounded-xl font-bold">
                    {isFa ? 'انصراف' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={vault2faBusy || (!vault2faPassword.trim() && !vault2faPin.trim())}
                    onClick={async () => {
                      setVault2faBusy(true);
                      setVault2faErr('');
                      try {
                        const res = await apiFetch<{ keys: typeof exportedKeys; warning?: string }>('/api/copy-trade/vault/export-keys', {
                          method: 'POST',
                          body: JSON.stringify({
                            password: vault2faPassword.trim() || undefined,
                            pinCode: vault2faPin.trim() || undefined,
                            requireVerification: true,
                          }),
                        });
                        setExportedKeys(res.keys);
                        setVault2faOpen(false);
                        if (res.warning) onMsg(res.warning);
                      } catch (err) {
                        setVault2faErr(err instanceof Error ? err.message : 'Verification failed');
                      } finally {
                        setVault2faBusy(false);
                      }
                    }}
                    className="btn-gold px-4 py-1.5 rounded-xl font-black disabled:opacity-50"
                  >
                    {vault2faBusy ? '...' : isFa ? 'تایید و نمایش کلیدها' : 'Verify & Reveal Keys'}
                  </button>
                </div>
              </div>
            )}

            {exportedKeys && (
              <div className="panel rounded-2xl p-4 space-y-2.5 border border-rose-500/40 text-[11px] tab-enter">
                <p className="font-black text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {isFa
                      ? 'کلیدهای خصوصی خزانه ایزوله شما (همراه با اعلان امنیتی تلگرام): می‌توانید با ایمپورت در Trust Wallet یا Phantom دارایی را کامل مدیریت و منتقل کنید:'
                      : 'Private keys for your isolated vault (Telegram security alert dispatched). Import into Trust Wallet or Phantom anytime:'}
                  </span>
                </p>
                <div className="surface-soft rounded-xl p-2.5 flex items-center justify-between gap-2" dir="ltr">
                  <div className="min-w-0">
                    <div className="text-[10px] text-dim">EVM Private Key (0x... / BSC / ETH / Base / ARB):</div>
                    <code className="font-mono break-all text-main">0x{exportedKeys.evmPrivateKeyHex}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(`0x${exportedKeys.evmPrivateKeyHex}`);
                      onMsg(isFa ? 'کلید خصوصی EVM کپی شد.' : 'EVM Private Key copied.');
                    }}
                    className="btn-ghost px-2.5 py-1.5 rounded-lg text-[10px] font-black shrink-0"
                  >
                    Copy
                  </button>
                </div>
                <div className="surface-soft rounded-xl p-2.5 flex items-center justify-between gap-2" dir="ltr">
                  <div className="min-w-0">
                    <div className="text-[10px] text-dim">Solana Secret Key (Base58 — Phantom/Trust Import):</div>
                    <code className="font-mono break-all text-main">{exportedKeys.solanaSecretBase58}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(exportedKeys.solanaSecretBase58);
                      onMsg(isFa ? 'کلید خصوصی Solana کپی شد.' : 'Solana Secret Key copied.');
                    }}
                    className="btn-ghost px-2.5 py-1.5 rounded-lg text-[10px] font-black shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LIVE RULES & POSITIONS V2 */}
      {subTab === 'live' && (
        <div className="space-y-4 tab-enter">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                value={testTokenAddr}
                onChange={(e) => setTestTokenAddr(e.target.value)}
                dir="ltr"
                placeholder="Token contract 0x... / Mint (optional)"
                className="input-field py-1.5 px-3 rounded-xl text-xs font-mono w-full sm:w-72"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pollingNow}
                onClick={async () => {
                  setPollingNow(true);
                  try {
                    const res = await apiFetch<{ checked: number; triggered: number; reconciled: number }>(
                      '/api/copy-trade/poll-now',
                      { method: 'POST' }
                    );
                    onMsg(
                      isFa
                        ? `اسکن زنده ولت‌ها انجام شد: ${res.checked} ولت بررسی و ${res.triggered} ورود جدید کشف شد.`
                        : `Polled ${res.checked} wallets, triggered ${res.triggered} entries.`
                    );
                    await loadAll(false);
                  } finally {
                    setPollingNow(false);
                  }
                }}
                className="btn-gold px-3.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{pollingNow ? '...' : isFa ? 'اسکن زنده ولت‌های فعال الان' : 'Scan Watched Wallets Now'}</span>
              </button>
              <button
                type="button"
                onClick={() => void loadAll(true)}
                className="btn-cobalt px-3.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'رصد قیمت لحظه‌ای و اعمال TP/SL' : 'Reconcile Live TP/SL'}</span>
              </button>
            </div>
          </div>

          {rules.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black text-main">
                {isFa ? 'باکس‌های مارجین اختصاصی هر تریدر (Isolated Trader Margin Boxes)' : 'Active Per-Trader Margin Boxes'}
              </h4>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {rules.map((r) => {
                  const freeMargin = Math.max(0, r.allocated_margin_usd - r.used_margin_usd);
                  return (
                    <div key={r.id} className="surface-soft rounded-2xl p-3 text-xs space-y-2 border border-[var(--border)]">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-main truncate">{r.trader_label}</strong>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${r.is_active ? 'bg-emerald-500/15 text-jade' : 'bg-slate-500/15 text-dim'}`}>
                          {r.is_active ? (isFa ? 'فعال' : 'Active') : isFa ? 'متوقف' : 'Paused'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                        <div className="panel rounded-lg p-1.5">
                          <span className="text-dim block">{isFa ? 'کل باکس' : 'Total'}</span>
                          <strong dir="ltr">${r.allocated_margin_usd}</strong>
                        </div>
                        <div className="panel rounded-lg p-1.5">
                          <span className="text-dim block">{isFa ? 'درگیر' : 'Used'}</span>
                          <strong dir="ltr" className="text-amber-400">${r.used_margin_usd.toFixed(1)}</strong>
                        </div>
                        <div className="panel rounded-lg p-1.5">
                          <span className="text-dim block">{isFa ? 'آزاد' : 'Free'}</span>
                          <strong dir="ltr" className="text-jade">${freeMargin.toFixed(1)}</strong>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={testingRuleId === r.id}
                          onClick={() => void triggerTestSignal(r)}
                          className="btn-gold flex-1 py-1.5 rounded-xl text-[10px] font-black inline-flex items-center justify-center gap-1"
                        >
                          <Rocket className="w-3 h-3" />
                          <span>{testingRuleId === r.id ? '...' : isFa ? 'تست اجرای سیگنال' : 'Test Copy Signal'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/copy-trade/rules/${r.id}`, { method: 'DELETE' });
                            onMsg(isFa ? 'قانون حذف شد.' : 'Rule deleted.');
                            await loadAll(false);
                          }}
                          className="btn-ghost p-1.5 rounded-xl text-loss"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {positions.length === 0 ? (
            <div className="surface-soft rounded-2xl p-6 text-center text-xs text-dim">
              {isFa
                ? 'هنوز پوزیشن کپی‌ترید V2 باز نشده است. برای مشاهده عملکرد زنده، روی یک تریدر قانون فالو بسازید و دکمه «تست سیگنال» را بزنید.'
                : 'No V2 copy positions yet. Create a follow rule and click Test Copy Signal to preview.'}
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((p) => (
                <div key={p.id} className="surface-soft rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs border border-[var(--border)]">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChainLogo chain={p.chain_id} size={15} />
                      <strong className="text-sm text-main">{p.token_symbol}</strong>
                      <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-black uppercase">
                        {p.chain_id} · {p.dex_name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          p.status === 'OPEN'
                            ? 'bg-emerald-500/15 text-jade'
                            : p.status === 'PENDING_TRUST_SIGN'
                              ? 'bg-amber-500/15 text-amber-400'
                              : p.status.startsWith('SKIPPED')
                                ? 'bg-rose-500/15 text-loss'
                                : 'bg-slate-500/15 text-dim'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-sub">
                      {isFa ? 'تریدر:' : 'Trader:'} <strong>{p.trader_label}</strong> · {isFa ? 'مارجین:' : 'Margin:'} ${p.margin_usd} ·{' '}
                      {isFa ? 'باقی‌مانده:' : 'Rem:'} {p.remaining_pct}% · {isFa ? 'ایمنی:' : 'Safety:'} {p.safety_score}/100
                    </p>
                    {p.ai_guard_note && <p className="text-[10px] text-dim">{p.ai_guard_note}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className={`font-num font-black text-sm ${p.pnl_usd >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {p.pnl_usd >= 0 ? `+$${p.pnl_usd.toFixed(2)}` : `-$${Math.abs(p.pnl_usd).toFixed(2)}`} ({p.pnl_pct >= 0 ? '+' : ''}
                      {p.pnl_pct.toFixed(1)}%)
                    </span>

                    {p.status === 'PENDING_TRUST_SIGN' && (
                      <>
                        {p.trust_dapp_url && (
                          <a
                            href={p.trust_dapp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-gold px-3 py-1.5 rounded-xl text-[10px] font-black inline-flex items-center gap-1"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>{isFa ? 'امضا در Trust Wallet' : 'Sign in Trust Wallet'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => void actPosition(p.id, 'CONFIRM')}
                          className="btn-emerald px-2.5 py-1.5 rounded-xl text-[10px] font-black"
                        >
                          {isFa ? '✓ تایید ورود' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void actPosition(p.id, 'DISMISS')}
                          className="btn-ghost px-2.5 py-1.5 rounded-xl text-[10px] text-loss font-bold"
                        >
                          {isFa ? 'رد' : 'Dismiss'}
                        </button>
                      </>
                    )}

                    {p.status === 'OPEN' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void actPosition(p.id, 'CLOSE_50')}
                          className="btn-ghost px-2.5 py-1.5 rounded-xl text-[10px] font-bold"
                        >
                          {isFa ? '۵۰٪ سیو سود' : 'Take 50%'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void actPosition(p.id, 'CLOSE')}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-loss text-[10px] font-black hover:bg-rose-500 hover:text-white transition"
                        >
                          {isFa ? 'بستن ۱۰۰٪' : 'Close 100%'}
                        </button>
                      </>
                    )}

                    {(p.status === 'OPEN' || p.status === 'CLOSED') && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await apiFetch<{ cardId: string; imageUrl: string; verifyUrl: string }>(
                              `/api/copy-trade/positions-v2/${p.id}/profit-card`,
                              { method: 'POST' }
                            );
                            setCardPreview(res);
                          } catch (err) {
                            onMsg(err instanceof Error ? err.message : 'Card issue failed', true);
                          }
                        }}
                        className="btn-ghost px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-amber-400 inline-flex items-center gap-1"
                      >
                        <Trophy className="w-3 h-3" />
                        <span>{isFa ? 'کارت سود' : 'PnL Card'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ULTRA-PRO PER-TRADER RULE & BACKTEST MODAL */}
      {ruleModalTrader &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[210] bg-black/75 backdrop-blur-md p-3 sm:p-5 overflow-y-auto grid place-items-center"
            onClick={() => setRuleModalTrader(null)}
          >
            <div
              className="panel rounded-[28px] max-w-3xl w-full p-5 sm:p-6 space-y-5 my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ChainLogo chain={ruleModalTrader.chain_id} size={20} />
                  <div>
                    <h3 className="font-display font-bold text-lg text-main">
                      {isFa ? `تنظیمات فوق‌اختیاری کپی از: ${ruleModalTrader.display_name}` : `Pro Rules: ${ruleModalTrader.display_name}`}
                    </h3>
                    <p dir="ltr" className="text-[10px] font-mono text-dim">
                      {ruleModalTrader.wallet_address}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setRuleModalTrader(null)} className="btn-ghost p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Execution Mode Selector */}
              <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRuleForm((f) => ({ ...f, executionMode: 'TRUST_ONE_CLICK' }))}
                  className={`p-3 rounded-2xl border text-start transition ${
                    ruleForm.executionMode === 'TRUST_ONE_CLICK'
                      ? 'border-amber-400 bg-amber-500/12'
                      : 'surface-soft hairline'
                  }`}
                >
                  <div className="font-black text-main flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <span>{isFa ? 'Trust Wallet 1-Click (غیرحضانتی محض)' : 'Trust Wallet 1-Click (Pure Non-Custodial)'}</span>
                  </div>
                  <p className="text-[10px] text-dim mt-1">
                    {isFa
                      ? 'با هر شکار تریدر، پیام با لینک مستقیم برترین DApp همان شبکه به تلگرام و وب شما می‌آید و با امضای خودتان خرید می‌شود.'
                      : 'Instant Telegram + web swap route for you to sign in Trust Wallet.'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setRuleForm((f) => ({ ...f, executionMode: 'AUTO_COPY_VAULT' }))}
                  className={`p-3 rounded-2xl border text-start transition ${
                    ruleForm.executionMode === 'AUTO_COPY_VAULT'
                      ? 'border-emerald-400 bg-emerald-500/12'
                      : 'surface-soft hairline'
                  }`}
                >
                  <div className="font-black text-main flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-jade" />
                    <span>{isFa ? 'خزانه ۲۴ ساعته خودکار (Auto Copy-Vault)' : 'Auto 24/7 Copy-Vault'}</span>
                  </div>
                  <p className="text-[10px] text-dim mt-1">
                    {isFa
                      ? 'بدون نیاز به بیداری شما؛ فقط از بودجه مارجین‌باکس اختصاصی همین تریدر به صورت آنی خرید و با TP/SL فروخته می‌شود.'
                      : 'Fully autonomous 24/7 execution using isolated vault margin.'}
                  </p>
                </button>
              </div>

              {/* Per-Trader Isolated Margin & Position Sizing */}
              <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs">
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-jade" />
                  <span>{isFa ? '۱. باکس مارجین اختصاصی این تریدر و مدیریت سرمایه' : '1. Isolated Margin Box & Sizing'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'کل مارجین باکس ($)' : 'Trader Margin Box ($)'}</label>
                    <input
                      type="number"
                      min={10}
                      dir="ltr"
                      value={ruleForm.allocatedMarginUsd}
                      onChange={(e) => setRuleForm((f) => ({ ...f, allocatedMarginUsd: Number(e.target.value || 100) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'مدل حجم هر ورود' : 'Sizing Mode'}</label>
                    <ProDropdown
                      value={ruleForm.sizingMode}
                      onChange={(next) => setRuleForm((f) => ({ ...f, sizingMode: next as typeof ruleForm.sizingMode }))}
                      options={[
                        { value: 'FIXED_USD', label: isFa ? 'مبلغ ثابت ($)' : 'Fixed USD' },
                        { value: 'PCT_ALLOCATION', label: isFa ? 'درصد از باکس (%)' : '% of Box' },
                        { value: 'PROPORTIONAL', label: isFa ? 'متناسب با نهنگ' : 'Proportional' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">
                      {ruleForm.sizingMode === 'PCT_ALLOCATION'
                        ? isFa
                          ? 'درصد هر ترید (%)'
                          : 'Order %'
                        : isFa
                          ? 'مبلغ هر ترید ($)'
                          : 'Order Size ($)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      dir="ltr"
                      value={ruleForm.sizingMode === 'PCT_ALLOCATION' ? ruleForm.orderSizePct : ruleForm.orderSizeUsd}
                      onChange={(e) =>
                        setRuleForm((f) =>
                          f.sizingMode === 'PCT_ALLOCATION'
                            ? { ...f, orderSizePct: Number(e.target.value || 15) }
                            : { ...f, orderSizeUsd: Number(e.target.value || 25) }
                        )
                      }
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'سقف ضرر روزانه ($)' : 'Daily Max Loss ($)'}</label>
                    <input
                      type="number"
                      min={5}
                      dir="ltr"
                      value={ruleForm.dailyMaxLossUsd}
                      onChange={(e) => setRuleForm((f) => ({ ...f, dailyMaxLossUsd: Number(e.target.value || 50) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداکثر پوزیشن همزمان' : 'Max Open Pos'}</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      dir="ltr"
                      value={ruleForm.maxOpenPositions}
                      onChange={(e) => setRuleForm((f) => ({ ...f, maxOpenPositions: Number(e.target.value || 4) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'اهرم (Perp DEX / VIP)' : 'Leverage (×)'}</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      dir="ltr"
                      value={ruleForm.leverage}
                      onChange={(e) => setRuleForm((f) => ({ ...f, leverage: Number(e.target.value || 5) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                </div>
              </div>

              {/* 3-Step TP / Moonbag / SL / Trailing / Break-Even */}
              <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs">
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>{isFa ? '۲. تارگت‌های پله‌ای (TP1/2/3 + Moonbag)، حد ضرر، Trailing و Break-Even' : '2. Tiered TP, Moonbag, SL, Trailing & Break-Even'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div>
                    <label className="text-[10px] text-jade block mb-1">TP1 (+%)</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.tp1Pct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, tp1Pct: Number(e.target.value || 30) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-jade block mb-1">{isFa ? '% فروش TP1' : 'TP1 Sell %'}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      dir="ltr"
                      value={ruleForm.tp1SellPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, tp1SellPct: Number(e.target.value || 40) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-jade block mb-1">TP2 (+%)</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.tp2Pct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, tp2Pct: Number(e.target.value || 75) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-jade block mb-1">{isFa ? '% فروش TP2' : 'TP2 Sell %'}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      dir="ltr"
                      value={ruleForm.tp2SellPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, tp2SellPct: Number(e.target.value || 40) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-jade block mb-1">TP3 (+%)</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.tp3Pct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, tp3Pct: Number(e.target.value || 150) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-amber-400 block mb-1">Moonbag (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      dir="ltr"
                      value={ruleForm.moonbagPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, moonbagPct: Number(e.target.value || 0) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-loss block mb-1">{isFa ? 'حد ضرر SL (-%)' : 'Stop Loss (-%)'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.stopLossPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, stopLossPct: Number(e.target.value || 20) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'فعال‌سازی Trailing (+%)' : 'Trail Start (+%)'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.trailingActivatePct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, trailingActivatePct: Number(e.target.value || 25) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'افت Trailing (-%)' : 'Trail Drop (-%)'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.trailingDropPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, trailingDropPct: Number(e.target.value || 10) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'Break-Even (+%)' : 'Break-Even (+%)'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      value={ruleForm.breakEvenPct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, breakEvenPct: Number(e.target.value || 18) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                </div>
              </div>

              {/* Anti-Rug, Liquidity, Slippage & Pro Switches */}
              <div className="surface-soft rounded-2xl p-4 space-y-3 text-xs">
                <h4 className="font-black text-main flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-brand" />
                  <span>{isFa ? '۳. سپر ضدراگ، AI-Guard، اسلیپیج و فیلترهای حرفه‌ای' : '3. Anti-Rug, AI-Guard & Execution Filters'}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداقل امتیاز ضدراگ' : 'Min Safety (0-95)'}</label>
                    <input
                      type="number"
                      min={0}
                      max={95}
                      dir="ltr"
                      value={ruleForm.minSafetyScore}
                      onChange={(e) => setRuleForm((f) => ({ ...f, minSafetyScore: Number(e.target.value || 60) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداکثر اسلیپیج (%)' : 'Max Slippage (%)'}</label>
                    <input
                      type="number"
                      min={0.5}
                      max={49}
                      step={0.5}
                      dir="ltr"
                      value={ruleForm.maxSlippagePct}
                      onChange={(e) => setRuleForm((f) => ({ ...f, maxSlippagePct: Number(e.target.value || 15) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداقل نقدینگی ($)' : 'Min Liquidity ($)'}</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={ruleForm.minLiquidityUsd}
                      onChange={(e) => setRuleForm((f) => ({ ...f, minLiquidityUsd: Number(e.target.value || 15000) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداقل مارکت‌کپ ($)' : 'Min MCap ($)'}</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={ruleForm.minMcapUsd}
                      onChange={(e) => setRuleForm((f) => ({ ...f, minMcapUsd: Number(e.target.value || 25000) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حداکثر مارکت‌کپ ($)' : 'Max MCap ($)'}</label>
                    <input
                      type="number"
                      min={1000}
                      dir="ltr"
                      value={ruleForm.maxMcapUsd}
                      onChange={(e) => setRuleForm((f) => ({ ...f, maxMcapUsd: Number(e.target.value || 500000000) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'تایم لیمیت (ساعت)' : 'Time Limit (h)'}</label>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={ruleForm.timeLimitHours}
                      onChange={(e) => setRuleForm((f) => ({ ...f, timeLimitHours: Number(e.target.value || 48) }))}
                      className="input-field w-full py-1.5 px-2.5 rounded-xl font-num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { key: 'onlyNewPositions', fa: 'فقط پوزیشن‌های جدید از این لحظه' },
                    { key: 'copySells', fa: 'فروش همزمان با خروج تریدر (Copy-Sells)' },
                    { key: 'devSellAutoExit', fa: 'خروج اضطراری در فروش سازنده (Dev-Sell)' },
                    { key: 'antiMev', fa: 'سپر Anti-MEV ضد ساندویچ' },
                    { key: 'aiGuardEnabled', fa: 'فیلتر هوش مصنوعی AI-Guard قبل خرید' },
                    { key: 'reverseCopy', fa: 'کپی معکوس (Reverse Copy تریدر ضعیف)' },
                  ].map((sw) => (
                    <label key={sw.key} className="panel rounded-xl p-2 flex items-center gap-2 cursor-pointer text-[11px] text-main">
                      <input
                        type="checkbox"
                        checked={Boolean(ruleForm[sw.key as keyof typeof ruleForm])}
                        onChange={(e) =>
                          setRuleForm((f) => ({ ...f, [sw.key]: e.target.checked }))
                        }
                      />
                      <span>{sw.fa}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 7-Day What-If Backtest Preview */}
              <div className="surface-soft rounded-2xl p-4 space-y-3 border border-brand/25 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-black text-main">
                    <BrainCircuit className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'شبیه‌ساز ۷ روزه با همین تنظیمات شما (What-If Backtest)' : '7-Day What-If Backtest Preview'}</span>
                  </div>
                  <button
                    type="button"
                    disabled={backtesting}
                    onClick={() => void runBacktestInsideModal(ruleModalTrader)}
                    className="btn-cobalt px-3.5 py-1.5 rounded-xl text-[11px] font-black"
                  >
                    {backtesting ? '...' : isFa ? 'اجرای محاسبه ۷ روزه' : 'Run 7-Day Sim'}
                  </button>
                </div>

                {backtestReport && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <div className="panel rounded-xl p-2">
                        <span className="text-[10px] text-dim block">{isFa ? 'سود خالص' : 'Net PnL'}</span>
                        <strong dir="ltr" className={backtestReport.netProfitUsd >= 0 ? 'text-jade' : 'text-loss'}>
                          ${backtestReport.netProfitUsd}
                        </strong>
                      </div>
                      <div className="panel rounded-xl p-2">
                        <span className="text-[10px] text-dim block">ROI</span>
                        <strong dir="ltr" className={backtestReport.roiPct >= 0 ? 'text-jade' : 'text-loss'}>
                          {backtestReport.roiPct}%
                        </strong>
                      </div>
                      <div className="panel rounded-xl p-2">
                        <span className="text-[10px] text-dim block">{isFa ? 'نرخ برد' : 'WinRate'}</span>
                        <strong dir="ltr">{backtestReport.winRatePct}%</strong>
                      </div>
                      <div className="panel rounded-xl p-2">
                        <span className="text-[10px] text-dim block">{isFa ? 'تعداد اجرا' : 'Trades'}</span>
                        <strong dir="ltr">{backtestReport.tradesSimulated}</strong>
                      </div>
                      <div className="panel rounded-xl p-2">
                        <span className="text-[10px] text-dim block">{isFa ? 'حذف ضدراگ' : 'Rug Blocked'}</span>
                        <strong dir="ltr" className="text-amber-400">{backtestReport.skippedUnsafeCount}</strong>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {backtestReport.samples.map((s, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            s.pnlUsd > 0 ? 'bg-emerald-500/15 text-jade' : s.pnlUsd < 0 ? 'bg-rose-500/15 text-loss' : 'panel text-dim'
                          }`}
                        >
                          {s.symbol}: {s.outcome} ({s.pnlPct >= 0 ? '+' : ''}
                          {s.pnlPct}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setRuleModalTrader(null)}
                  className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={savingRule}
                  onClick={() => void saveRule()}
                  className="btn-gold px-6 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingRule ? '...' : isFa ? 'ذخیره و فعال‌سازی کپی‌ترید اختصاصی' : 'Save & Activate Follow Rule'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Side-by-Side Trader Compare Modal */}
      {compareOpen &&
        comparedTraders.length === 2 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[215] bg-black/80 backdrop-blur-md p-3 sm:p-5 grid place-items-center overflow-y-auto"
            onClick={() => setCompareOpen(false)}
          >
            <div className="panel rounded-[28px] max-w-2xl w-full p-5 sm:p-6 space-y-4 my-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base sm:text-lg text-main flex items-center gap-2">
                  <Scale className="w-5 h-5 text-brand" />
                  <span>{isFa ? 'مقایسه تخصصی ۲ تریدر پیش از کپی' : 'Side-by-Side Trader Comparison'}</span>
                </h3>
                <button type="button" onClick={() => setCompareOpen(false)} className="btn-ghost p-2 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b hairline">
                      <th className="py-2.5 px-2 text-start text-dim">{isFa ? 'شاخص' : 'Metric'}</th>
                      {comparedTraders.map((t) => (
                        <th key={t.id} className="py-2.5 px-2 text-center">
                          <div className="inline-flex items-center gap-1.5 font-black text-main">
                            <ChainLogo chain={t.chain_id} size={15} />
                            <span>{t.display_name}</span>
                          </div>
                          <div className="text-[10px] font-normal text-dim uppercase">{t.chain_id} · {t.style_tag}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y hairline">
                    {[
                      {
                        label: isFa ? 'بازده ۳۰ روزه (ROI)' : '30d ROI',
                        vals: comparedTraders.map((t) => `${t.roi_30d_pct >= 0 ? '+' : ''}${t.roi_30d_pct}%`),
                        bestIdx: comparedTraders[0]!.roi_30d_pct >= comparedTraders[1]!.roi_30d_pct ? 0 : 1,
                      },
                      {
                        label: isFa ? 'بازده ۷ روزه' : '7d ROI',
                        vals: comparedTraders.map((t) => `${t.roi_7d_pct >= 0 ? '+' : ''}${t.roi_7d_pct}%`),
                        bestIdx: comparedTraders[0]!.roi_7d_pct >= comparedTraders[1]!.roi_7d_pct ? 0 : 1,
                      },
                      {
                        label: isFa ? 'نرخ برد (Win Rate)' : 'Win Rate',
                        vals: comparedTraders.map((t) => `${t.win_rate}%`),
                        bestIdx: comparedTraders[0]!.win_rate >= comparedTraders[1]!.win_rate ? 0 : 1,
                      },
                      {
                        label: isFa ? 'سود خالص محقق‌شده' : 'Realized PnL',
                        vals: comparedTraders.map((t) => `$${Math.round(t.realized_pnl_usd).toLocaleString()}`),
                        bestIdx: comparedTraders[0]!.realized_pnl_usd >= comparedTraders[1]!.realized_pnl_usd ? 0 : 1,
                      },
                      {
                        label: isFa ? 'امتیاز امنیت توکن‌ها' : 'Token Safety Score',
                        vals: comparedTraders.map((t) => `${t.safety_discipline_score}/100`),
                        bestIdx: comparedTraders[0]!.safety_discipline_score >= comparedTraders[1]!.safety_discipline_score ? 0 : 1,
                      },
                      {
                        label: isFa ? 'میانگین مدت نگهداری' : 'Avg Hold Time',
                        vals: comparedTraders.map((t) => `${t.avg_hold_mins} min`),
                        bestIdx: -1,
                      },
                      {
                        label: isFa ? 'تخمین ارزش ۱۰۰$ پس از ۳۰ روز' : 'Est. $100 over 30d',
                        vals: comparedTraders.map((t) => `$${(100 * (1 + t.roi_30d_pct / 100)).toFixed(0)}`),
                        bestIdx: comparedTraders[0]!.roi_30d_pct >= comparedTraders[1]!.roi_30d_pct ? 0 : 1,
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td className="py-2.5 px-2 font-bold text-dim">{row.label}</td>
                        {row.vals.map((v, idx) => (
                          <td
                            key={idx}
                            dir="ltr"
                            className={`py-2.5 px-2 text-center font-num font-black ${
                              row.bestIdx === idx ? 'text-jade' : 'text-main'
                            }`}
                          >
                            {v} {row.bestIdx === idx ? '★' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {comparedTraders.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setCompareOpen(false);
                      openRuleModal(t);
                    }}
                    className="btn-gold py-2.5 px-3 rounded-xl text-xs font-black"
                  >
                    {isFa ? `انتخاب و فالو ${t.display_name}` : `Follow ${t.display_name}`}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Verified PnL Card Preview Modal */}
      {cardPreview &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md p-4 grid place-items-center"
            onClick={() => setCardPreview(null)}
          >
            <div className="panel rounded-[28px] max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>{isFa ? `کارت سود تاییدشده دلارینو (${cardPreview.cardId})` : `Verified Card ${cardPreview.cardId}`}</span>
                </h3>
                <button type="button" onClick={() => setCardPreview(null)} className="btn-ghost p-1.5 rounded-xl">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img src={cardPreview.imageUrl} alt={cardPreview.cardId} className="w-full rounded-2xl border hairline" />
              <div className="flex flex-wrap gap-2">
                <a
                  href={cardPreview.imageUrl}
                  download={`${cardPreview.cardId}.png`}
                  className="btn-gold flex-1 py-2 rounded-xl text-xs font-black text-center"
                >
                  {isFa ? 'دانلود تصویر کارت' : 'Download Card'}
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/trading/cards/${cardPreview.cardId}/send-telegram`, { method: 'POST' });
                    onMsg(isFa ? 'کارت سود تاییدشده به ربات تلگرام شما ارسال شد!' : 'Sent to Telegram!');
                  }}
                  className="btn-cobalt flex-1 py-2 rounded-xl text-xs font-black"
                >
                  {isFa ? 'ارسال به تلگرام من' : 'Send to Telegram'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
