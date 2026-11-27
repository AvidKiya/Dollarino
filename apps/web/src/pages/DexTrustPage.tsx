import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Wallet,
} from 'lucide-react';
import { ChainLogo, WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { TrustWalletConnectInline } from '../components/TrustWalletConnectInline';
import { TrustWalletDirectModal } from '../components/TrustWalletDirectModal';
import { TrustWalletTradePlaybook } from '../components/TrustWalletTradePlaybook';
import { apiFetch } from '../lib/api';
import { formatTomanEq, getLiveUsdtIrt } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import {
  connectAndPersistAllTrustWallets,
  EVM_NETWORKS,
  isTrustWalletEnvironment,
  launchTrustWalletUrl,
  requestTrustWalletDappHandoff,
  switchEvmNetwork,
  type EvmNetworkSpec,
  type TrustWalletDappHandoff,
} from '../lib/trustwallet';
import type { AuthUserInfo, NavTab } from '../lib/types';

interface TrustPortfolioHolding {
  symbol: string;
  base?: string;
  name?: string;
  nameEn?: string;
  nameFa?: string;
  chain: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  changePct24h?: number;
  logoUrl?: string;
}

interface TrustPortfolioPayload {
  ok: boolean;
  connected: boolean;
  totalUsd: number;
  holdingsCount: number;
  holdings: TrustPortfolioHolding[];
}

interface TrustWalletStatusRes {
  ok: boolean;
  connected: boolean;
  wallet: {
    evmAddress: string | null;
    tronAddress: string | null;
    solanaAddress: string | null;
    tonAddress: string | null;
    verified: boolean;
    connectedAt: string | null;
  };
  platformReceivers: {
    trc20: string;
    evm: string;
    solana: string;
    ton: string;
  };
  trustDappOpenUrl: string;
}

export function DexTrustPage({
  lang,
  user,
  onUserRefresh,
  onNavigate,
}: {
  lang: Lang;
  user: AuthUserInfo;
  onUserRefresh: () => Promise<void> | void;
  onNavigate?: (tab: NavTab) => void;
}) {
  const isFa = lang === 'fa';
  const [twStatus, setTwStatus] = useState<TrustWalletStatusRes | null>(null);
  const [portfolio, setPortfolio] = useState<TrustPortfolioPayload | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [balances, setBalances] = useState<{
    bnb: number | null;
    eth: number | null;
    baseEth?: number | null;
    arbEth?: number | null;
    polygonPol?: number | null;
    bscUsdt: number | null;
    sol?: number | null;
    ton?: number | null;
    trx: number | null;
    trc20Usdt: number | null;
  } | null>(null);

  const [evmInput, setEvmInput] = useState(user.trust_wallet_address || '');
  const [tronInput, setTronInput] = useState(user.trust_wallet_tron || '');
  const [solInput, setSolInput] = useState(user.trust_wallet_solana || '');
  const [tonInput, setTonInput] = useState(user.trust_wallet_ton || '');
  const [activeEvmKey, setActiveEvmKey] = useState<EvmNetworkSpec['key']>('bsc');
  const [walletBusy, setWalletBusy] = useState(false);
  const [execMode, setExecMode] = useState<'AUTO' | 'MANUAL_CONFIRM'>('AUTO');
  const [twModalOpen, setTwModalOpen] = useState(false);
  const [twHandoff, setTwHandoff] = useState<TrustWalletDappHandoff | null>(null);
  const [twMobileLaunched, setTwMobileLaunched] = useState(false);
  const [twModalError, setTwModalError] = useState<string | null>(null);

  const loadWalletStatus = useCallback(async () => {
    try {
      const [st, modeRes] = await Promise.all([
        apiFetch<TrustWalletStatusRes>('/api/trustwallet/status'),
        apiFetch<{ executionMode: 'AUTO' | 'MANUAL_CONFIRM' }>('/api/trustwallet/execution-mode').catch(() => ({
          executionMode: 'AUTO' as const,
        })),
      ]);
      setTwStatus(st);
      setExecMode(modeRes.executionMode || 'AUTO');
      if (st.wallet.evmAddress) setEvmInput(st.wallet.evmAddress);
      if (st.wallet.tronAddress) setTronInput(st.wallet.tronAddress);
      if (st.wallet.solanaAddress) setSolInput(st.wallet.solanaAddress);
      if (st.wallet.tonAddress) setTonInput(st.wallet.tonAddress);
    } catch {
      // ignore
    }
  }, []);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const pf = await apiFetch<TrustPortfolioPayload>('/api/trustwallet/portfolio');
      setPortfolio(pf);
    } catch {
      /* ignore */
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWalletStatus();
    void loadPortfolio();
  }, [loadWalletStatus, loadPortfolio]);

  const flash = (text: string, isErr = false) => {
    pushFloatingToast(text, isErr ? 'error' : 'success');
  };

  const toggleTwExecutionMode = async (next: 'AUTO' | 'MANUAL_CONFIRM') => {
    try {
      await apiFetch('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({ executionMode: next, syncCopyRules: true }),
      });
      setExecMode(next);
      flash(
        next === 'AUTO'
          ? isFa
            ? 'حالت تمام‌اتوترید ۲۴/۷ فعال شد'
            : '24/7 Autonomous Auto-Trade enabled'
          : isFa
            ? 'حالت تایید دستی در Trust Wallet فعال شد'
            : 'Manual Approval mode enabled'
      );
      await onUserRefresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed', true);
    }
  };

  const handleConnectInjectedTrust = async () => {
    setWalletBusy(true);
    setTwModalError(null);
    try {
      const conn = await connectAndPersistAllTrustWallets();
      if (conn.evmAddress) setEvmInput(conn.evmAddress);
      if (conn.solanaAddress) setSolInput(conn.solanaAddress);
      if (conn.tronAddress) setTronInput(conn.tronAddress);
      if (conn.tonAddress) setTonInput(conn.tonAddress);
      if (conn.activeEvmChainId) {
        const matched = EVM_NETWORKS.find((n) => n.chainIdHex.toLowerCase() === conn.activeEvmChainId?.toLowerCase());
        if (matched) setActiveEvmKey(matched.key);
      }
      setTwModalOpen(false);
      flash(
        isFa
          ? `کیف‌پول چندزنجیره‌ای متصل شد: ${conn.connectedFamilies.join(' + ')}`
          : `Multi-chain wallet connected: ${conn.connectedFamilies.join(' + ')}`
      );
      await Promise.all([loadWalletStatus(), onUserRefresh()]);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'NO_INJECTED_WALLET') {
        try {
          const handoff = await requestTrustWalletDappHandoff();
          setTwHandoff(handoff);
          const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
          setTwMobileLaunched(isMobile);
          setTwModalOpen(true);
          if (isMobile) {
            launchTrustWalletUrl(handoff.universalLink, handoff.deepLink);
          }
        } catch (err) {
          setTwModalError(err instanceof Error ? err.message : 'Unable to initialize Trust Wallet handoff');
          setTwModalOpen(true);
        }
      } else if (code === 'USER_REJECTED') {
        flash(isFa ? 'درخواست اتصال در کیف‌پول لغو شد.' : 'Connection rejected in wallet.', true);
      } else {
        flash(code || 'Connection failed', true);
      }
    } finally {
      setWalletBusy(false);
    }
  };

  const handleOpenInTrustApp = async () => {
    setWalletBusy(true);
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
      flash(e instanceof Error ? e.message : 'Unable to open Trust Wallet', true);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSwitchEvmNetwork = async (netKey: EvmNetworkSpec['key']) => {
    setWalletBusy(true);
    try {
      const spec = await switchEvmNetwork(netKey);
      setActiveEvmKey(spec.key);
      flash(isFa ? `شبکه فعال روی ${spec.chainName} تنظیم شد.` : `Switched to ${spec.chainName}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Network switch failed', true);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSaveManualAddresses = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/trustwallet/connect', {
        method: 'POST',
        body: JSON.stringify({
          evmAddress: evmInput.trim() || undefined,
          tronAddress: tronInput.trim() || undefined,
          solanaAddress: solInput.trim() || undefined,
          tonAddress: tonInput.trim() || undefined,
        }),
      });
      flash(res.message);
      await Promise.all([loadWalletStatus(), onUserRefresh()]);
    } catch (e2) {
      flash(e2 instanceof Error ? e2.message : 'Save failed', true);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleFetchBalances = async () => {
    setWalletBusy(true);
    try {
      const res = await apiFetch<{ balances: typeof balances }>('/api/trustwallet/balance', { method: 'POST' });
      setBalances(res.balances);
      flash(isFa ? 'موجودی زنده بلاکچین دریافت شد' : 'On-chain balances synced');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Balance fetch failed', true);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setWalletBusy(true);
    try {
      await apiFetch('/api/trustwallet/disconnect', { method: 'POST' });
      setEvmInput('');
      setTronInput('');
      setSolInput('');
      setTonInput('');
      setBalances(null);
      flash(isFa ? 'اتصال کیف‌پول قطع شد.' : 'Wallet disconnected.');
      await Promise.all([loadWalletStatus(), onUserRefresh()]);
    } finally {
      setWalletBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Clean Hero Banner: Trust Wallet + Banking Treasury */}
      <section className="panel rounded-[28px] p-5 md:p-6 space-y-4 border border-amber-500/25 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
            <img
              src="/images/trust-wallet-connect-banner.webp"
              alt="Dollarino & Trust Wallet Multi-Chain Hub"
              className="w-full sm:w-44 h-28 rounded-2xl object-cover shrink-0 border hairline shadow-lg"
            />
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <WalletLogo wallet="trustwallet" size={24} />
                <span className="badge-signal text-[11px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isFa ? '۱۰۰٪ غیرامانی · سرمایه فقط داخل Trust Wallet خودتان' : '100% Non-Custodial · Capital Stays in Your Trust Wallet'}
                </span>
                {isTrustWalletEnvironment() && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-jade inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isFa ? 'مرورگر Trust Wallet فعال' : 'Trust Wallet DApp Active'}</span>
                  </span>
                )}
              </div>
              <h2 className="font-display font-black text-xl md:text-2xl text-main">
                {isFa ? 'کیف‌پول Trust Wallet شخصی و پورتفوی آن‌چین من' : 'My Non-Custodial Trust Wallet & On-Chain Portfolio'}
              </h2>
              <p className="text-xs text-dim leading-relaxed">
                {isFa ? (
                  <>
                    تمام سرمایه معاملاتی ۱۰۰٪ داخل Trust Wallet شخصی خودتان باقی می‌ماند و به حساب سایت واریز نمی‌شود (<span dir="ltr">EVM · Solana · TON · TRON</span>). از این صفحه کیف‌پولتان را متصل کنید و دارایی‌های زنده آن‌چین خود را مشاهده نمایید.
                  </>
                ) : (
                  'All trading capital stays 100% inside your own Trust Wallet — never deposited to platform accounts. Connect your chains and view live on-chain token holdings.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleConnectInjectedTrust()}
              disabled={walletBusy}
              className="btn-gold px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-2"
            >
              <Wallet className="w-4 h-4" />
              <span>
                {twStatus?.connected
                  ? isFa
                    ? 'همگام‌سازی همه شبکه‌ها'
                    : 'Sync All Chains'
                  : isFa
                    ? 'اتصال یکجای همه شبکه‌ها'
                    : 'Connect All Chains'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handleOpenInTrustApp()}
              disabled={walletBusy}
              className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isFa ? 'باز کردن در اپ Trust Wallet' : 'Open in Trust Wallet App'}</span>
            </button>

            <div className="inline-flex rounded-2xl surface-soft border hairline p-1 gap-1">
              <button
                type="button"
                onClick={() => void toggleTwExecutionMode('MANUAL_CONFIRM')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition ${
                  execMode === 'MANUAL_CONFIRM' ? 'btn-gold' : 'text-dim hover:text-main'
                }`}
              >
                {isFa ? 'تایید دستی' : 'Manual'}
              </button>
              <button
                type="button"
                onClick={() => void toggleTwExecutionMode('AUTO')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition ${
                  execMode === 'AUTO' ? 'btn-emerald' : 'text-dim hover:text-main'
                }`}
              >
                {isFa ? 'اتوترید ۲۴/۷' : '24/7 Auto'}
              </button>
            </div>
          </div>
        </div>

        {/* Multi-Chain Connection Status Bar + EVM Network Switcher */}
        <div className="pt-3 border-t hairline flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-dim font-bold">{isFa ? 'شبکه‌های متصل:' : 'Connected:'}</span>
            {[
              { id: 'evm', label: 'EVM (ETH·BSC·Base·Arb)', addr: twStatus?.wallet.evmAddress, chain: 'ethereum' },
              { id: 'solana', label: 'Solana', addr: twStatus?.wallet.solanaAddress, chain: 'solana' },
              { id: 'ton', label: 'TON', addr: twStatus?.wallet.tonAddress, chain: 'ton' },
              { id: 'tron', label: 'TRON', addr: twStatus?.wallet.tronAddress, chain: 'tron' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById('tw-address-manager');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold transition ${
                  item.addr
                    ? 'bg-emerald-500/12 border-emerald-500/35 text-jade'
                    : 'surface-soft hairline text-dim hover:text-main'
                }`}
              >
                <ChainLogo chain={item.chain} size={14} />
                <span>{item.label}</span>
                {item.addr ? (
                  <span dir="ltr" className="opacity-85 font-mono">
                    {item.addr.slice(0, 4)}..{item.addr.slice(-3)}
                  </span>
                ) : (
                  <span className="opacity-65">{isFa ? '+ اتصال' : '+ Link'}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-dim font-bold me-1">{isFa ? 'سوئیچ شبکه EVM:' : 'Switch EVM:'}</span>
            {EVM_NETWORKS.map((net) => (
              <button
                key={net.key}
                type="button"
                disabled={walletBusy}
                onClick={() => void handleSwitchEvmNetwork(net.key)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition ${
                  activeEvmKey === net.key ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                }`}
              >
                <ChainLogo chain={net.key} size={13} />
                <span>{net.shortName}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Trust Wallet Portfolio Overview (All On-Chain Token Holdings) */}
      <section className="panel rounded-[28px] p-5 md:p-6 space-y-4 border hairline">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-black text-lg text-main flex items-center gap-2">
              <WalletLogo wallet="trustwallet" size={20} />
              <span>{isFa ? 'دارایی‌ها و پورتفوی زنده داخل Trust Wallet من' : 'Live Trust Wallet Asset Portfolio'}</span>
            </h3>
            <p className="text-xs text-dim mt-0.5">
              {isFa
                ? 'تمامی موجودی‌های واقعی داخل کیف‌پول شما روی شبکه‌های EVM، Solana، TON و TRON هم‌گام با قیمت‌های Trust Wallet'
                : 'Real token balances held inside your Trust Wallet across EVM, Solana, TON & TRON aligned with live prices.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="surface-soft rounded-2xl px-4 py-2 border hairline text-end">
              <span className="text-[10px] font-bold text-dim block">{isFa ? 'جمع ارزش کیف‌پول' : 'Total Wallet Value'}</span>
              <strong dir="ltr" className="font-num font-black text-base text-main">
                ${(portfolio?.totalUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {portfolio && portfolio.totalUsd > 0 && (
                <span className="block text-[10px] text-dim">{formatTomanEq(portfolio.totalUsd, getLiveUsdtIrt())}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadPortfolio()}
              disabled={portfolioLoading}
              className="btn-cobalt px-3.5 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${portfolioLoading ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'بروزرسانی پورتفوی' : 'Refresh Portfolio'}</span>
            </button>
          </div>
        </div>

        {portfolio && portfolio.holdings.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {portfolio.holdings.map((h) => {
              const pct = Number(h.changePct24h || 0);
              const tokenSym = (h.base || h.symbol.replace(/USDT$/, '')).toUpperCase();
              const tokenName = isFa ? h.nameFa || h.nameEn || h.name || tokenSym : h.nameEn || h.name || tokenSym;
              return (
                <div key={`${h.chain}_${tokenSym}_${h.symbol}`} className="surface-soft rounded-2xl p-3.5 border hairline flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CoinIcon symbol={`${tokenSym}USDT`} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-sm font-black text-main">{tokenSym}</strong>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--panel)] border hairline text-[9px] font-bold text-dim uppercase shrink-0">
                          <ChainLogo chain={h.chain} size={10} />
                          {h.chain}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-dim truncate mt-0.5">{tokenName}</p>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <p dir="ltr" className="font-num font-black text-xs text-main whitespace-nowrap">
                      {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })} {tokenSym}
                    </p>
                    <p dir="ltr" className="font-num text-[11px] font-bold text-sub whitespace-nowrap">
                      ${h.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {Number.isFinite(pct) && pct !== 0 && (
                        <span className={`ms-1.5 ${pct >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {pct >= 0 ? '+' : ''}
                          {pct.toFixed(1)}%
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="surface-soft rounded-2xl p-4 border border-dashed hairline text-xs text-dim flex flex-wrap items-center justify-between gap-3">
            <span>
              {portfolio?.connected
                ? isFa
                  ? 'در حال حاضر موجودی مثبت روی شبکه‌های استعلام‌شده یافت نشد یا روی «بروزرسانی پورتفوی» بزنید.'
                  : 'No positive balances detected yet across connected chains — click Refresh Portfolio to re-sync.'
                : isFa
                  ? 'برای مشاهده تمام دارایی‌های Trust Wallet خودتان، ابتدا یکی از آدرس‌های زیر را متصل یا ذخیره کنید.'
                  : 'Connect or save your wallet address below to view all Trust Wallet asset holdings.'}
            </span>
          </div>
        )}
      </section>

      {/* Direct Wallet Connection & Multi-Chain Address Manager */}
      <div id="tw-address-manager" className="space-y-4">
        <div className="panel rounded-[26px] p-5">
          <TrustWalletConnectInline lang={lang} onMsg={flash} onRefresh={onUserRefresh} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <form onSubmit={(e) => void handleSaveManualAddresses(e)} className="panel rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[var(--gold)]" />
                  <span>{isFa ? 'آدرس‌های دستی چندزنجیره‌ای' : 'Multi-Chain Wallet Addresses'}</span>
                </h3>
                {twStatus?.wallet.verified && (
                  <span className="text-[11px] font-black text-jade inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {isFa ? 'تاییدشده' : 'Verified'}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-dim mb-1">
                    {isFa ? 'آدرس EVM (BSC BEP20 / Ethereum / Base / Arbitrum)' : 'EVM Address (0x...)'}
                  </label>
                  <input
                    value={evmInput}
                    onChange={(e) => setEvmInput(e.target.value)}
                    dir="ltr"
                    placeholder="0x..."
                    className="input-field w-full py-2.5 px-3 rounded-2xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dim mb-1">
                    {isFa ? 'آدرس TRON (شبکه TRC20)' : 'TRON Address (T...)'}
                  </label>
                  <input
                    value={tronInput}
                    onChange={(e) => setTronInput(e.target.value)}
                    dir="ltr"
                    placeholder="T..."
                    className="input-field w-full py-2.5 px-3 rounded-2xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dim mb-1 flex items-center gap-1.5">
                    <ChainLogo chain="solana" size={14} />
                    <span>{isFa ? 'آدرس Solana (SPL / میم‌کوین‌ها)' : 'Solana Address'}</span>
                  </label>
                  <input
                    value={solInput}
                    onChange={(e) => setSolInput(e.target.value)}
                    dir="ltr"
                    placeholder="..."
                    className="input-field w-full py-2.5 px-3 rounded-2xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-dim mb-1 flex items-center gap-1.5">
                    <ChainLogo chain="ton" size={14} />
                    <span>{isFa ? 'آدرس TON (شبکه تلگرام / Jetton)' : 'TON Address (EQ... / UQ...)'}</span>
                  </label>
                  <input
                    value={tonInput}
                    onChange={(e) => setTonInput(e.target.value)}
                    dir="ltr"
                    placeholder="UQ... or EQ..."
                    className="input-field w-full py-2.5 px-3 rounded-2xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={walletBusy} className="btn-gold px-5 py-2.5 rounded-2xl text-xs font-black">
                  {isFa ? 'ذخیره آدرس‌های کیف‌پول' : 'Save Addresses'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleFetchBalances()}
                  disabled={walletBusy}
                  className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black"
                >
                  {isFa ? 'استعلام موجودی آن‌چین' : 'Fetch On-Chain Balances'}
                </button>
                {twStatus?.connected && (
                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    className="btn-ghost px-3 py-2.5 rounded-2xl text-xs text-loss inline-flex items-center gap-1"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>{isFa ? 'قطع اتصال' : 'Disconnect'}</span>
                  </button>
                )}
              </div>
            </form>

            <div className="panel rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-main">
                  {isFa ? 'موجودی زنده بلاکچین و دسته‌بندی شبکه‌ها' : 'Live On-Chain Balances'}
                </h3>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('pricing')}
                    className="badge-signal px-3 py-1 rounded-full text-[10px] font-black hover:opacity-90 transition inline-flex items-center gap-1"
                  >
                    <Landmark className="w-3 h-3" />
                    <span>{isFa ? 'خزانه و تسویه کارمزد ۳٪' : 'Treasury & 3% Fees'}</span>
                    {isFa ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                  </button>
                )}
              </div>
              {balances ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { chain: 'bsc', label: 'BSC USDT (BEP20)', val: balances.bscUsdt !== null ? `${balances.bscUsdt.toFixed(2)} USDT` : '—' },
                    { chain: 'bsc', label: 'BNB (BSC Gas)', val: balances.bnb !== null ? `${balances.bnb.toFixed(4)} BNB` : '—' },
                    { chain: 'ethereum', label: 'Ethereum (ETH)', val: balances.eth !== null ? `${balances.eth.toFixed(4)} ETH` : '—' },
                    { chain: 'base', label: 'Base (ETH)', val: balances.baseEth != null ? `${balances.baseEth.toFixed(4)} ETH` : '—' },
                    { chain: 'arbitrum', label: 'Arbitrum (ETH)', val: balances.arbEth != null ? `${balances.arbEth.toFixed(4)} ETH` : '—' },
                    { chain: 'polygon', label: 'Polygon (POL)', val: balances.polygonPol != null ? `${balances.polygonPol.toFixed(4)} POL` : '—' },
                    { chain: 'solana', label: 'Solana (SOL)', val: balances.sol != null ? `${balances.sol.toFixed(4)} SOL` : '—' },
                    { chain: 'ton', label: 'TON Network', val: balances.ton != null ? `${balances.ton.toFixed(4)} TON` : '—' },
                    { chain: 'tron', label: 'TRON USDT (TRC20)', val: balances.trc20Usdt !== null ? `${balances.trc20Usdt.toFixed(2)} USDT` : '—' },
                  ].map((b) => (
                    <div key={b.label} className="surface-soft rounded-2xl p-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-dim mb-1">
                        <ChainLogo chain={b.chain} size={14} />
                        <span>{b.label}</span>
                      </span>
                      <strong dir="ltr" className="text-sm font-num text-main">
                        {b.val}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-dim surface-soft rounded-2xl p-4 leading-relaxed">
                  {isFa
                    ? 'پس از اتصال کیف‌پول بالا یا ذخیره آدرس‌ها، روی «استعلام موجودی آن‌چین» بزنید تا دارایی شما همزمان از تمام شبکه‌های EVM، Solana، TON و TRON خوانده شود.'
                    : 'Connect your wallet above and click Fetch On-Chain Balances to view real holdings across all supported chains.'}
                </p>
              )}
            </div>
          </div>
        </div>

      <TrustWalletTradePlaybook lang={lang} focusMode="FUTURES" compact onNavigate={onNavigate} />

      <TrustWalletDirectModal
        open={twModalOpen}
        lang={lang}
        handoff={twHandoff}
        mobileLaunched={twMobileLaunched}
        busyRetry={walletBusy}
        errorText={twModalError}
        onRetryInjected={handleConnectInjectedTrust}
        onConnected={async () => {
          setTwModalOpen(false);
          await Promise.all([loadWalletStatus(), loadPortfolio(), onUserRefresh()]);
        }}
        onGoToWalletPage={() => {
          setTwModalOpen(false);
          const el = document.getElementById('tw-address-manager');
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onClose={() => setTwModalOpen(false)}
      />
    </div>
  );
}
