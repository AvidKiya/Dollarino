import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  Hand,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Vault,
  Wallet,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import {
  approveErc20SpenderInDapp,
  approveHyperliquidAgentInDapp,
  connectAndPersistAllTrustWallets,
  DEX_ROUTER_SPENDERS,
  fundCopyVaultFromDapp,
  hasAnyInjectedWallet,
  isTrustWalletEnvironment,
  launchTrustWalletUrl,
  requestTrustWalletDappHandoff,
  type TrustWalletDappHandoff,
} from '../lib/trustwallet';
import { ChainLogo, WalletLogo } from './BrandLogos';
import { TrustWalletDirectModal } from './TrustWalletDirectModal';

interface ExecutionModeState {
  executionMode: 'AUTO' | 'MANUAL_CONFIRM';
  tradingMode: 'PAPER' | 'LIVE';
  demoSimulatorBalance: number;
  permissions: {
    trustWalletConnected: boolean;
    trustWalletVerified: boolean;
    perpAgentConnected: boolean;
    perpProvider: string | null;
    copyVaultReady: boolean;
    copyVaultAllowanceUsd: number;
  };
}

interface TrustStatusState {
  connected: boolean;
  wallet: {
    evmAddress: string | null;
    tronAddress: string | null;
    solanaAddress: string | null;
    tonAddress: string | null;
    verified: boolean;
  };
  trustDappOpenUrl?: string;
}

export function TrustWalletConnectInline({
  lang,
  onMsg,
  onRefresh,
  compact = false,
}: {
  lang: Lang;
  onMsg: (text: string, isErr?: boolean) => void;
  onRefresh: () => Promise<void> | void;
  compact?: boolean;
}) {
  const isFa = lang === 'fa';
  const [execState, setExecState] = useState<ExecutionModeState | null>(null);
  const [twStatus, setTwStatus] = useState<TrustStatusState | null>(null);
  const [evmAddress, setEvmAddress] = useState('');
  const [solanaAddress, setSolanaAddress] = useState('');
  const [tonAddress, setTonAddress] = useState('');
  const [tronAddress, setTronAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [dappBusy, setDappBusy] = useState(false);
  const [vaultEvmAddr, setVaultEvmAddr] = useState<string>('');
  const [allowanceNet, setAllowanceNet] = useState<'bsc' | 'arbitrum' | 'base' | 'ethereum'>('bsc');
  const [allowanceCapUsd, setAllowanceCapUsd] = useState<number>(100);
  const [twModalOpen, setTwModalOpen] = useState(false);
  const [twHandoff, setTwHandoff] = useState<TrustWalletDappHandoff | null>(null);
  const [twMobileLaunched, setTwMobileLaunched] = useState(false);
  const [twModalError, setTwModalError] = useState<string | null>(null);
  const [balances, setBalances] = useState<{
    bnb?: number | null;
    eth?: number | null;
    sol?: number | null;
    ton?: number | null;
    trc20Usdt?: number | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [em, tw, vRes] = await Promise.all([
        apiFetch<ExecutionModeState>('/api/trustwallet/execution-mode'),
        apiFetch<TrustStatusState>('/api/trustwallet/status'),
        apiFetch<{ vault?: { evmAddress?: string } }>('/api/copy-trade/vault').catch(() => null),
      ]);
      setExecState(em);
      setTwStatus(tw);
      if (tw.wallet.evmAddress) setEvmAddress(tw.wallet.evmAddress);
      if (tw.wallet.solanaAddress) setSolanaAddress(tw.wallet.solanaAddress);
      if (tw.wallet.tonAddress) setTonAddress(tw.wallet.tonAddress);
      if (tw.wallet.tronAddress) setTronAddress(tw.wallet.tronAddress);
      if (vRes?.vault?.evmAddress) setVaultEvmAddr(vRes.vault.evmAddress);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setAccountAndExecution = async (next: {
    executionMode?: 'AUTO' | 'MANUAL_CONFIRM';
    tradingMode?: 'PAPER' | 'LIVE';
  }) => {
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          executionMode: next.executionMode ?? execState?.executionMode ?? 'AUTO',
          tradingMode: next.tradingMode ?? execState?.tradingMode ?? 'PAPER',
          syncCopyRules: true,
        }),
      });
      await Promise.all([load(), onRefresh()]);
      onMsg(res.message);
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Error updating mode', true);
    } finally {
      setSaving(false);
    }
  };

  const openTrustDirectConnectModal = async () => {
    setSaving(true);
    setTwModalError(null);
    try {
      const handoff = await requestTrustWalletDappHandoff();
      setTwHandoff(handoff);
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      setTwMobileLaunched(isMobile);
      setTwModalOpen(true);
      if (isMobile) {
        launchTrustWalletUrl(handoff.universalLink, handoff.deepLink);
      }
    } catch (e) {
      setTwModalError(e instanceof Error ? e.message : 'Unable to generate Trust Wallet link');
      setTwModalOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const connectBrowserWallet = async () => {
    if (!hasAnyInjectedWallet()) {
      await openTrustDirectConnectModal();
      return;
    }
    setSaving(true);
    try {
      const res = await connectAndPersistAllTrustWallets();
      if (res.evmAddress) setEvmAddress(res.evmAddress);
      if (res.solanaAddress) setSolanaAddress(res.solanaAddress);
      if (res.tonAddress) setTonAddress(res.tonAddress);
      if (res.tronAddress) setTronAddress(res.tronAddress);
      setTwModalOpen(false);
      await Promise.all([load(), onRefresh()]);
      onMsg(
        isFa
          ? `کیف‌پول Trust Wallet روی تمام شبکه‌های فعال (${res.connectedFamilies.join(' + ')}) با امضای رمزنگاری ECDSA متصل شد!`
          : `Trust Wallet connected & ECDSA verified across ${res.connectedFamilies.join(' + ')}!`
      );
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Wallet connection canceled', true);
    } finally {
      setSaving(false);
    }
  };

  const saveAddresses = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/trustwallet/connect', {
        method: 'POST',
        body: JSON.stringify({
          evmAddress: evmAddress.trim() || undefined,
          solanaAddress: solanaAddress.trim() || undefined,
          tonAddress: tonAddress.trim() || undefined,
          tronAddress: tronAddress.trim() || undefined,
        }),
      });
      await Promise.all([load(), onRefresh()]);
      onMsg(isFa ? 'آدرس‌های Trust Wallet روی تمام شبکه‌ها ذخیره شد!' : 'Trust Wallet addresses saved!');
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Invalid address', true);
    } finally {
      setSaving(false);
    }
  };

  const syncChainBalances = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{
        balances: { bnb?: number | null; eth?: number | null; sol?: number | null; ton?: number | null; trc20Usdt?: number | null };
      }>('/api/trustwallet/balance', { method: 'POST' });
      setBalances(res.balances);
      onMsg(isFa ? 'موجودی زنجیره‌های Trust Wallet استعلام شد.' : 'Trust Wallet on-chain balances synced.');
    } catch (err) {
      onMsg(err instanceof Error ? err.message : 'Balance check failed', true);
    } finally {
      setSaving(false);
    }
  };

  const grantFullAutoPermissions = async () => {
    setAgentSaving(true);
    try {
      if (hasAnyInjectedWallet()) {
        try {
          if (!evmAddress.trim() && !twStatus?.wallet.evmAddress) {
            const conn = await connectAndPersistAllTrustWallets();
            if (conn.evmAddress) setEvmAddress(conn.evmAddress);
            if (conn.solanaAddress) setSolanaAddress(conn.solanaAddress);
            if (conn.tonAddress) setTonAddress(conn.tonAddress);
            if (conn.tronAddress) setTronAddress(conn.tronAddress);
          }
          const agentRes = await approveHyperliquidAgentInDapp('Dollarino24x7');
          setEvmAddress(agentRes.masterAddress);
          await apiFetch('/api/copy-trade/vault', { method: 'GET' }).catch(() => null);
          await setAccountAndExecution({ executionMode: 'AUTO' });
          onMsg(
            (isFa ? agentRes.messageFa : agentRes.messageEn) ||
              (isFa
                ? 'اتصال کامل Trust Wallet + Agent Wallet هایپرلیکویید و خزانه ۲۴/۷ با ۱ کلیک فعال شد!'
                : 'Trust Wallet + Hyperliquid Agent Wallet & 24/7 Copy-Vault authorized in 1 click!')
          );
          return;
        } catch (dappErr) {
          const errMsg = dappErr instanceof Error ? dappErr.message : '';
          if (errMsg && !errMsg.includes('NO_INJECTED_WALLET')) {
            onMsg(errMsg, true);
            return;
          }
        }
      }

      const targetWallet = evmAddress.trim() || twStatus?.wallet.evmAddress;
      if (!targetWallet) {
        await openTrustDirectConnectModal();
        onMsg(
          isFa
            ? 'برای فعال‌سازی خودکار ۲۴/۷، ابتدا با QR یا اپ Trust Wallet متصل شوید (یا آدرس EVM را وارد کنید).'
            : 'Scan QR or open Trust Wallet App to connect first, then 24/7 auto-trade enables immediately.'
        );
        return;
      }
      // Fallback: Create Copy-Vault + Perp read-only tracking link when no DApp injector is present
      await Promise.all([
        apiFetch('/api/copy-trade/vault', { method: 'GET' }).catch(() => null),
        apiFetch('/api/dex/perp-connect', {
          method: 'POST',
          body: JSON.stringify({
            venue: 'hyperliquid',
            masterAddress: targetWallet,
          }),
        }).catch(() => null),
      ]);
      await setAccountAndExecution({ executionMode: 'AUTO' });
      onMsg(
        isFa
          ? 'خزانه ۲۴/۷ و لینک رصد فیوچرز ساخته شد؛ برای امضای ۱-کلیکی Agent Key این صفحه را داخل اپ Trust Wallet باز کنید.'
          : '24/7 Copy-Vault & Perp tracking created! Open inside Trust Wallet DApp to 1-click approve Agent Key.'
      );
    } finally {
      setAgentSaving(false);
    }
  };

  const handleQuickFundVault = async (usdApprox: number) => {
    if (!vaultEvmAddr) {
      onMsg(isFa ? 'ابتدا روی دکمه «تنظیم یک‌باره مجوز ۲۴/۷» بزنید تا خزانه شما ساخته شود.' : 'Initialize Copy-Vault first.', true);
      return;
    }
    setDappBusy(true);
    try {
      const nativeAmt = allowanceNet === 'bsc' ? Number((usdApprox / 600).toFixed(4)) : Number((usdApprox / 3000).toFixed(4));
      const txHash = await fundCopyVaultFromDapp({
        networkKey: allowanceNet,
        vaultAddress: vaultEvmAddr,
        amountNative: nativeAmt,
      });
      onMsg(
        isFa
          ? `شارژ خزانه ۲۴/۷ (~$${usdApprox}) مستقیم از Trust Wallet ارسال شد! TX: ${txHash.slice(0, 14)}...`
          : `Copy-Vault funded (~$${usdApprox}) directly from Trust Wallet! TX: ${txHash.slice(0, 14)}...`
      );
      await load();
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Vault funding failed', true);
    } finally {
      setDappBusy(false);
    }
  };

  const handleRouterAllowance = async (revoke: boolean) => {
    setDappBusy(true);
    try {
      const spec = DEX_ROUTER_SPENDERS[allowanceNet];
      const txHash = await approveErc20SpenderInDapp({
        networkKey: allowanceNet,
        tokenAddress: spec.usdtOrUsdc,
        spenderAddress: spec.router,
        amountTokens: revoke ? 0 : allowanceCapUsd,
        decimals: spec.decimals,
      });
      onMsg(
        revoke
          ? isFa
            ? `مجوز خرج روتر ${spec.name} با موفقیت لغو (Revoke = 0) شد! TX: ${txHash.slice(0, 12)}...`
            : `Revoked allowance for ${spec.name}! TX: ${txHash.slice(0, 12)}...`
          : isFa
            ? `مجوز محدود $${allowanceCapUsd} برای ${spec.name} در Trust Wallet ثبت شد! TX: ${txHash.slice(0, 12)}...`
            : `Capped $${allowanceCapUsd} allowance granted to ${spec.name}! TX: ${txHash.slice(0, 12)}...`
      );
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'ERC-20 Approve failed', true);
    } finally {
      setDappBusy(false);
    }
  };

  const isAuto = execState?.executionMode !== 'MANUAL_CONFIRM';
  const isLive = execState?.tradingMode === 'LIVE';

  return (
    <div className="space-y-4">
      {/* Bespoke Trust Wallet + Dollarino Pipeline Artwork Header */}
      {!compact && (
        <div className="relative rounded-3xl overflow-hidden border border-sky-400/25 shadow-xl">
          <img
            src="/images/trust-wallet-connect-banner.webp"
            alt="Dollarino x Trust Wallet Multi-Chain Hub"
            className="w-full h-40 sm:h-48 object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050B1D] via-[#050B1D]/60 to-transparent flex flex-col justify-end p-5">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <WalletLogo wallet="trustwallet" size={24} />
              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-sky-500/25 text-sky-200 border border-sky-400/35">
                {isFa ? 'اتصال انحصاری · ۱۰۰٪ غیرامانی' : 'EXCLUSIVE TRUST WALLET · NON-CUSTODIAL'}
              </span>
            </div>
            <h3 className="font-display font-black text-lg sm:text-xl text-white">
              {isFa
                ? 'یک اتصال به Trust Wallet برای تمام معاملات اسپات، میم‌کوین، کپی‌ترید و فیوچرز ۱۰۰x'
                : 'One Trust Wallet Connection for Spot, Meme DEX, Copy-Trade & 100x Perp Futures'}
            </h3>
          </div>
        </div>
      )}

      {/* Dual Selector: 1) Account Mode (Simulator vs Live Trust Wallet) + 2) Execution Mode (Manual vs 24/7 Full Auto) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel-soft rounded-2xl p-4 space-y-2.5 border border-sky-500/20">
          <p className="text-xs font-black text-main flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8]" />
            <span>{isFa ? '۱. انتخاب حساب (دمو مشابه تراست‌ولت یا کیف‌پول واقعی)' : '1. Account Source'}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void setAccountAndExecution({ tradingMode: 'PAPER' })}
              className={`p-3 rounded-xl text-start transition border ${
                !isLive
                  ? 'bg-[#0D47A1] border-[#1652F0] text-white shadow-md'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              <p className="text-xs font-black flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                {isFa ? (
                  <span>
                    شبیه‌ساز دمو (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>$50–$10M</span>)
                  </span>
                ) : (
                  <span>Custom Demo ($50–$10M)</span>
                )}
              </p>
              <p className="text-[10px] opacity-85 mt-0.5">
                {isFa ? 'دقیقاً مشابه تراست‌ولت با قیمت زنده و بدون ریسک' : 'Mirrors Trust Wallet with live prices'}
              </p>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void setAccountAndExecution({ tradingMode: 'LIVE' })}
              className={`p-3 rounded-xl text-start transition border ${
                isLive
                  ? 'bg-[#059669] border-emerald-400 text-white shadow-md'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              <p className="text-xs font-black flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{isFa ? 'Trust Wallet واقعی' : 'Live Trust Wallet'}</span>
              </p>
              <p className="text-[10px] opacity-85 mt-0.5">
                {isFa ? 'اجرای واقعی روی ETH، SOL، BSC، Base، TON و TRX' : 'Real execution across all chains'}
              </p>
            </button>
          </div>
        </div>

        <div className="panel-soft rounded-2xl p-4 space-y-2.5 border border-emerald-500/20">
          <p className="text-xs font-black text-main flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-jade" />
            <span>{isFa ? '۲. روش اجرای معاملات (تایید دستی یا تمام‌اتومات ۲۴/۷)' : '2. Execution Permission Mode'}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void setAccountAndExecution({ executionMode: 'MANUAL_CONFIRM' })}
              className={`p-3 rounded-xl text-start transition border ${
                !isAuto
                  ? 'bg-[#D97706] border-amber-400 text-white shadow-md'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              <p className="text-xs font-black inline-flex items-center gap-1">
                <Hand className="w-3.5 h-3.5" />
                <span>{isFa ? 'تایید دستی' : 'Manual Approval'}</span>
              </p>
              <p className="text-[10px] opacity-85 mt-0.5">
                {isFa ? 'اعلان قبل از اجرا و تایید ۱-کلیکی داخل Trust Wallet' : '1-click sign inside Trust Wallet per trade'}
              </p>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void setAccountAndExecution({ executionMode: 'AUTO' })}
              className={`p-3 rounded-xl text-start transition border ${
                isAuto
                  ? 'bg-[#059669] border-emerald-400 text-white shadow-md'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              <p className="text-xs font-black inline-flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" />
                <span>{isFa ? 'تمام‌اتوترید ۲۴/۷' : 'Full 24/7 Auto-Trade'}</span>
              </p>
              <p className="text-[10px] opacity-80 mt-0.5">
                {isFa ? 'اجرای شبانه‌روزی بدون نیاز به تایید دستی شما' : 'Hands-free 24/7 execution with Agent Key'}
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* 24/7 Auto-Trade Permission Status & One-Click Provision */}
      {isAuto && (
        <div className="panel-soft rounded-2xl p-4 border border-emerald-500/25 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black text-jade flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>{isFa ? 'مجوزهای دسترسی اتوترید ۲۴/۷ در Trust Wallet (بدون حق برداشت)' : '24/7 Auto-Trade Permissions (Zero Withdraw Scope)'}</span>
              </p>
              <p className="text-[11px] text-dim mt-0.5">
                {isFa
                  ? 'برای معامله خودکار بدون تایید دستی در زمان خواب، ربات از کلید ترید فیوچرز (Perp Agent) و خزانه دارای سقف (Copy-Vault) استفاده می‌کند.'
                  : 'Robot uses a trade-only Perp Agent Key and budget-capped Copy-Vault — your main Trust Wallet never shares seed phrases.'}
              </p>
            </div>
            <button
              type="button"
              disabled={agentSaving}
              onClick={() => void grantFullAutoPermissions()}
              className="btn-emerald px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{agentSaving ? '...' : isFa ? 'تنظیم یک‌باره مجوز ۲۴/۷' : 'Authorize 24/7 Auto-Trade'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl surface-soft border hairline px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-dim">
                <Wallet className="w-3.5 h-3.5" />
                <span>{isFa ? 'آدرس تراست‌ولت' : 'Trust Wallet'}</span>
              </span>
              <span className={execState?.permissions.trustWalletConnected ? 'text-jade font-black inline-flex items-center gap-1' : 'text-goldsoft font-bold'}>
                {execState?.permissions.trustWalletConnected && <CheckCircle2 className="w-3 h-3" />}
                <span>{execState?.permissions.trustWalletConnected ? (isFa ? 'متصل' : 'Connected') : (isFa ? 'نیاز به ثبت' : 'Required')}</span>
              </span>
            </div>
            <div className="rounded-xl surface-soft border hairline px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-dim">
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isFa ? 'کلید فیوچرز ۱۰۰x' : 'Perp Agent Key'}</span>
              </span>
              <span className={execState?.permissions.perpAgentConnected ? 'text-jade font-black inline-flex items-center gap-1' : 'text-dim font-bold'}>
                {execState?.permissions.perpAgentConnected && <CheckCircle2 className="w-3 h-3" />}
                <span>{execState?.permissions.perpAgentConnected ? (isFa ? 'فعال' : 'Ready') : (isFa ? 'آماده ساخت' : 'Pending')}</span>
              </span>
            </div>
            <div className="rounded-xl surface-soft border hairline px-3 py-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-dim">
                <Vault className="w-3.5 h-3.5" />
                <span>{isFa ? 'خزانه ۲۴/۷ (اسپات/کپی)' : '24/7 Copy-Vault'}</span>
              </span>
              <span className={execState?.permissions.copyVaultReady ? 'text-jade font-black inline-flex items-center gap-1' : 'text-dim font-bold'}>
                {execState?.permissions.copyVaultReady && <CheckCircle2 className="w-3 h-3" />}
                <span>
                  {execState?.permissions.copyVaultReady
                    ? `$${execState.permissions.copyVaultAllowanceUsd}`
                    : (isFa ? 'آماده ساخت' : 'Pending')}
                </span>
              </span>
            </div>
          </div>

          {hasAnyInjectedWallet() && (
            <div className="pt-2 border-t hairline space-y-2.5 text-[11px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-black text-main inline-flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isFa ? 'شارژ سریع خزانه ۲۴/۷ و مجوز محدود روتر DEX:' : 'Quick 24/7 Vault Funding & Capped Router Allowance:'}</span>
                  </span>
                  {isTrustWalletEnvironment() && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-jade font-black text-[10px]">
                      Trust Wallet DApp
                    </span>
                  )}
                </div>
                <select
                  value={allowanceNet}
                  onChange={(e) => setAllowanceNet(e.target.value as 'bsc' | 'arbitrum' | 'base' | 'ethereum')}
                  dir="ltr"
                  className="surface-soft border hairline rounded-xl px-2 py-1 text-[10px] font-bold text-main"
                >
                  <option value="bsc">BSC (BNB / BEP20)</option>
                  <option value="arbitrum">Arbitrum (ETH / USDC)</option>
                  <option value="base">Base (ETH / USDC)</option>
                  <option value="ethereum">Ethereum (ETH / USDT)</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    disabled={dappBusy || !vaultEvmAddr}
                    onClick={() => void handleQuickFundVault(amt)}
                    className="btn-cobalt px-2.5 py-1.5 rounded-xl text-[10px] font-black disabled:opacity-50"
                  >
                    <span dir="ltr">+${amt}</span> {isFa ? 'شارژ خزانه' : 'Fund Vault'}
                  </button>
                ))}

                <div className="flex items-center gap-1 ms-auto">
                  <span className="text-[10px] text-dim">{isFa ? 'سقف روتر:' : 'Cap $:'}</span>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={allowanceCapUsd}
                    onChange={(e) => setAllowanceCapUsd(Math.max(10, Number(e.target.value || 100)))}
                    dir="ltr"
                    className="input-field w-16 py-1 px-2 rounded-xl text-[10px] text-center font-num"
                  />
                  <button
                    type="button"
                    disabled={dappBusy}
                    onClick={() => void handleRouterAllowance(false)}
                    className="btn-gold px-2.5 py-1.5 rounded-xl text-[10px] font-black disabled:opacity-50"
                  >
                    {isFa ? 'تایید سقف روتر' : 'Approve Cap'}
                  </button>
                  <button
                    type="button"
                    disabled={dappBusy}
                    onClick={() => void handleRouterAllowance(true)}
                    className="btn-ghost px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-loss disabled:opacity-50"
                  >
                    {isFa ? 'لغو (Revoke)' : 'Revoke'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Connect Bar + Multi-Chain Address Form */}
      <form onSubmit={saveAddresses} className="panel-soft rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black text-main inline-flex items-center gap-1.5">
            <WalletLogo wallet="trustwallet" size={20} />
            <span>{isFa ? 'آدرس‌های عمومی Trust Wallet (هرگز ۱۲ کلمه وارد نکنید)' : 'Trust Wallet Public Addresses (Zero Seed Phrase)'}</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void connectBrowserWallet()}
              className="btn-gold px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isFa ? 'اتصال خودکار مرورگر' : '1-Click Browser Connect'}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void syncChainBalances()}
              className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'استعلام موجودی' : 'Sync Balances'}</span>
            </button>
            {twStatus?.trustDappOpenUrl && (
              <a
                href={twStatus.trustDappOpenUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 text-[#0284C7] dark:text-[#38BDF8]"
              >
                <ExternalLink className="w-3 h-3" />
                <span>{isFa ? 'باز کردن در اپ Trust' : 'Open Trust App'}</span>
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="space-y-1">
            <span className="text-[10px] text-dim font-bold flex items-center gap-1">
              <ChainLogo chain="ethereum" size={14} />
              <span>EVM (ETH / BSC / Base / Arbitrum / Hyperliquid)</span>
            </span>
            <input
              value={evmAddress}
              onChange={(e) => setEvmAddress(e.target.value)}
              dir="ltr"
              placeholder="0x..."
              className="field font-mono text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-dim font-bold flex items-center gap-1">
              <ChainLogo chain="solana" size={14} />
              <span>Solana (SOL · Jupiter · Raydium)</span>
            </span>
            <input
              value={solanaAddress}
              onChange={(e) => setSolanaAddress(e.target.value)}
              dir="ltr"
              placeholder="Solana public address..."
              className="field font-mono text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-dim font-bold flex items-center gap-1">
              <ChainLogo chain="ton" size={14} />
              <span>TON (STON.fi · DeDust)</span>
            </span>
            <input
              value={tonAddress}
              onChange={(e) => setTonAddress(e.target.value)}
              dir="ltr"
              placeholder="EQ... / UQ..."
              className="field font-mono text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-dim font-bold flex items-center gap-1">
              <ChainLogo chain="tron" size={14} />
              <span>TRON (TRC20 · SunSwap)</span>
            </span>
            <input
              value={tronAddress}
              onChange={(e) => setTronAddress(e.target.value)}
              dir="ltr"
              placeholder="T..."
              className="field font-mono text-xs"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-dim inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-jade" />
            <span>
              {isFa
                ? 'دارایی شما همیشه در Trust Wallet خودتان می‌ماند؛ فقط آدرس عمومی و مجوز ترید ثبت می‌شود.'
                : 'Self-custody always: Dollarino never asks for private keys or 12-word recovery phrases.'}
            </span>
          </p>
          <button type="submit" disabled={saving} className="btn-emerald px-5 py-2 rounded-xl text-xs font-black">
            {saving ? '...' : isFa ? 'ذخیره اتصال Trust Wallet' : 'Save Trust Wallet'}
          </button>
        </div>

        {balances && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t hairline text-[11px] font-mono text-main" dir="ltr">
            <div className="surface-soft border hairline rounded-xl px-2.5 py-1.5">BNB: {balances.bnb?.toFixed(4) ?? '—'}</div>
            <div className="surface-soft border hairline rounded-xl px-2.5 py-1.5">ETH: {balances.eth?.toFixed(4) ?? '—'}</div>
            <div className="surface-soft border hairline rounded-xl px-2.5 py-1.5">SOL: {balances.sol?.toFixed(4) ?? '—'}</div>
            <div className="surface-soft border hairline rounded-xl px-2.5 py-1.5">TON: {balances.ton?.toFixed(3) ?? '—'}</div>
            <div className="surface-soft border hairline rounded-xl px-2.5 py-1.5">TRC20: {balances.trc20Usdt?.toFixed(2) ?? '—'}</div>
          </div>
        )}
      </form>

      <TrustWalletDirectModal
        open={twModalOpen}
        lang={lang}
        handoff={twHandoff}
        mobileLaunched={twMobileLaunched}
        busyRetry={saving}
        errorText={twModalError}
        onRetryInjected={connectBrowserWallet}
        onConnected={async () => {
          setTwModalOpen(false);
          await Promise.all([load(), onRefresh()]);
          onMsg(isFa ? 'کیف‌پول Trust Wallet با موفقیت متصل شد!' : 'Trust Wallet connected!');
        }}
        onGoToWalletPage={() => setTwModalOpen(false)}
        onClose={() => setTwModalOpen(false)}
      />
    </div>
  );
}
