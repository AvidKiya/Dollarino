import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  Coins,
  ExternalLink,
  Flame,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Unlink,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import {
  buildTrustWalletDappOpenUrl,
  connectTrustWalletEvm,
  isTrustWalletEnvironment,
  signTrustWalletNonce,
} from '../lib/trustwallet';
import type { AuthUserInfo } from '../lib/types';

export interface DexTokenCardItem {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string | null;
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number | null;
  safetyScore: number;
  riskFlags: string[];
  isOnCentralizedHint: boolean;
  trustWallet: {
    chainId: string;
    coinId: number;
    dexName: string;
    swapUrl: string;
    trustWalletDappUrl: string;
    dexScreenerUrl: string;
  };
}

interface TrustWalletStatusRes {
  ok: boolean;
  connected: boolean;
  wallet: {
    evmAddress: string | null;
    tronAddress: string | null;
    solanaAddress: string | null;
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

interface DexTradeItem {
  id: string;
  chain_id: string;
  token_address: string;
  token_symbol: string;
  amount_usd: number;
  token_qty: number;
  entry_price_usd: number;
  live_price_usd?: number;
  stop_loss_usd?: number | null;
  tp1_usd?: number | null;
  status: string;
  tx_hash?: string | null;
  unrealized_pnl_usd?: number;
  unrealized_pnl_pct?: number;
  realized_pnl_usd: number;
  realized_pnl_pct: number;
  opened_at: string;
  trustWallet?: { trustWalletDappUrl: string; dexScreenerUrl: string };
}

function fmtUsd(v?: number | null): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTokenPrice(p?: string | number | null): string {
  const n = Number(p || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  return `$${n.toFixed(4)}`;
}

const CHAIN_FILTERS = ['all', 'bsc', 'ethereum', 'solana', 'base', 'arbitrum', 'polygon', 'ton', 'tron'];

export function DexTrustPage({
  lang,
  user,
  onUserRefresh,
}: {
  lang: Lang;
  user: AuthUserInfo;
  onUserRefresh: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [subTab, setSubTab] = useState<'dex' | 'wallet' | 'trades'>('dex');
  const [chainFilter, setChainFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<DexTokenCardItem[]>([]);
  const [loadingDex, setLoadingDex] = useState(false);

  const [aiModal, setAiModal] = useState<{
    token: DexTokenCardItem;
    analysis: string;
    levels?: { entryUsd: number; stopLossUsd: number; tp1Usd: number };
    loading: boolean;
  } | null>(null);

  const [twStatus, setTwStatus] = useState<TrustWalletStatusRes | null>(null);
  const [balances, setBalances] = useState<{
    bnb: number | null;
    eth: number | null;
    bscUsdt: number | null;
    trx: number | null;
    trc20Usdt: number | null;
  } | null>(null);
  const [evmInput, setEvmInput] = useState(user.trust_wallet_address || '');
  const [tronInput, setTronInput] = useState(user.trust_wallet_tron || '');
  const [solInput, setSolInput] = useState(user.trust_wallet_solana || '');
  const [walletBusy, setWalletBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [dexTrades, setDexTrades] = useState<DexTradeItem[]>([]);
  const [tradeAmtUsd, setTradeAmtUsd] = useState(50);

  const loadTrending = useCallback(async () => {
    setLoadingDex(true);
    setErr(null);
    try {
      const res = await apiFetch<{ trending?: DexTokenCardItem[]; pairs?: DexTokenCardItem[] }>('/api/dex/trending');
      setTokens(res.trending || res.pairs || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'DexScreener load failed');
    } finally {
      setLoadingDex(false);
    }
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      await loadTrending();
      return;
    }
    setLoadingDex(true);
    setErr(null);
    try {
      const res = await apiFetch<{ pairs: DexTokenCardItem[] }>(`/api/dex/search?q=${encodeURIComponent(query.trim())}`);
      setTokens(res.pairs || []);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Search failed');
    } finally {
      setLoadingDex(false);
    }
  };

  const loadWalletAndTrades = useCallback(async () => {
    try {
      const [st, tr] = await Promise.all([
        apiFetch<TrustWalletStatusRes>('/api/trustwallet/status'),
        apiFetch<{ trades: DexTradeItem[] }>('/api/trustwallet/dex-trades'),
      ]);
      setTwStatus(st);
      setDexTrades(tr.trades || []);
      if (st.wallet.evmAddress) setEvmInput(st.wallet.evmAddress);
      if (st.wallet.tronAddress) setTronInput(st.wallet.tronAddress);
      if (st.wallet.solanaAddress) setSolInput(st.wallet.solanaAddress);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadTrending();
    void loadWalletAndTrades();
  }, [loadTrending, loadWalletAndTrades]);

  const handleConnectInjectedTrust = async () => {
    setWalletBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const conn = await connectTrustWalletEvm();
      const nonceRes = await apiFetch<{ message: string }>('/api/trustwallet/nonce', { method: 'POST' });
      const sig = await signTrustWalletNonce(conn.address, nonceRes.message).catch(() => undefined);
      await apiFetch('/api/trustwallet/connect', {
        method: 'POST',
        body: JSON.stringify({
          evmAddress: conn.address,
          signature: sig,
          signedMessage: nonceRes.message,
        }),
      });
      setEvmInput(conn.address);
      setMsg(
        isFa
          ? `کیف‌پول Trust Wallet با موفقیت متصل و تایید امضا شد: ${conn.address.slice(0, 8)}...${conn.address.slice(-4)}`
          : `Trust Wallet connected & verified: ${conn.address}`
      );
      await loadWalletAndTrades();
      await onUserRefresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'NO_INJECTED_WALLET') {
        setErr(
          isFa
            ? 'در این مرورگر افزونه یا DApp تراست‌ولت تشخیص داده نشد. از دکمه «باز کردن در Trust Wallet DApp» استفاده کنید یا آدرس کیف‌پول را دستی ثبت کنید.'
            : 'No injected Trust Wallet provider detected. Open inside Trust Wallet DApp Browser or enter your address manually.'
        );
      } else {
        setErr(code || 'Connection rejected');
      }
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSaveManualAddresses = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/trustwallet/connect', {
        method: 'POST',
        body: JSON.stringify({
          evmAddress: evmInput.trim() || undefined,
          tronAddress: tronInput.trim() || undefined,
          solanaAddress: solInput.trim() || undefined,
        }),
      });
      setMsg(res.message);
      await loadWalletAndTrades();
      await onUserRefresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setWalletBusy(false);
    }
  };

  const handleFetchBalances = async () => {
    setWalletBusy(true);
    try {
      const res = await apiFetch<{ balances: typeof balances }>('/api/trustwallet/balance', { method: 'POST' });
      setBalances(res.balances);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Balance fetch failed');
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
      setBalances(null);
      await loadWalletAndTrades();
      await onUserRefresh();
    } finally {
      setWalletBusy(false);
    }
  };

  const handleAiAnalyze = async (t: DexTokenCardItem) => {
    setAiModal({ token: t, analysis: '', loading: true });
    try {
      const res = await apiFetch<{
        analysis: string;
        suggestedLevels?: { entryUsd: number; stopLossUsd: number; tp1Usd: number };
      }>('/api/dex/ai-analyze', {
        method: 'POST',
        body: JSON.stringify({
          chainId: t.chainId,
          tokenAddress: t.baseToken.address,
          lang,
        }),
      });
      setAiModal({ token: t, analysis: res.analysis, levels: res.suggestedLevels, loading: false });
    } catch (e) {
      setAiModal({
        token: t,
        analysis: e instanceof Error ? e.message : 'AI analysis failed',
        loading: false,
      });
    }
  };

  const handleTrackDexTrade = async (t: DexTokenCardItem, openDapp: boolean) => {
    setErr(null);
    setMsg(null);
    try {
      const res = await apiFetch<{ tradeId: string; trustWallet: { trustWalletDappUrl: string } }>('/api/trustwallet/dex-trades', {
        method: 'POST',
        body: JSON.stringify({
          chainId: t.chainId,
          dexId: t.dexId,
          pairAddress: t.pairAddress,
          tokenAddress: t.baseToken.address,
          tokenSymbol: t.baseToken.symbol,
          quoteSymbol: t.quoteToken.symbol,
          amountUsd: tradeAmtUsd,
          entryPriceUsd: Number(t.priceUsd || 0),
        }),
      });
      setMsg(
        isFa
          ? `معامله غیرحضانتی ${t.baseToken.symbol} با حجم $${tradeAmtUsd} ثبت شد (#${res.tradeId}).`
          : `DEX trade recorded (#${res.tradeId}).`
      );
      await loadWalletAndTrades();
      if (openDapp) {
        window.open(t.trustWallet.trustWalletDappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to record trade');
    }
  };

  const handleCloseDexTrade = async (id: string) => {
    await apiFetch(`/api/trustwallet/dex-trades/${id}/close`, { method: 'POST', body: JSON.stringify({}) });
    await loadWalletAndTrades();
  };

  const visibleTokens = tokens.filter((t) => chainFilter === 'all' || t.chainId.toLowerCase() === chainFilter);
  const dappOpenSelf = buildTrustWalletDappOpenUrl(`${window.location.origin}/?tab=dex`);

  return (
    <div className="space-y-5">
      {/* Header Hero */}
      <section className="panel rounded-[28px] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 border border-amber-500/25">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-signal text-[11px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" />
              {isFa ? 'رادار زنده DexScreener + Trust Wallet DApp' : 'DexScreener Live + Trust Wallet Core'}
            </span>
            {isTrustWalletEnvironment() && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-jade">
                {isFa ? 'مرورگر Trust Wallet تشخیص داده شد ✅' : 'Trust Wallet DApp Active ✅'}
              </span>
            )}
          </div>
          <h2 className="font-display font-black text-xl md:text-2xl text-main">
            {isFa
              ? 'کشف توکن‌های جدید در DexScreener و ترید مستقیم بدون صرافی با Trust Wallet'
              : 'Discover Non-CEX Tokens on DexScreener & Swap Directly via Trust Wallet'}
          </h2>
          <p className="text-xs text-dim leading-relaxed">
            {isFa
              ? 'توکن‌هایی که هنوز در Toobit و KCEX لیست نشده‌اند را لحظه‌ای پیدا کنید، ریسک نقدینگی را با هوش مصنوعی بسنجید و مستقیماً از کیف‌پول غیرامانی خودتان در Trust Wallet DApp معامله و ردیابی کنید.'
              : 'Spot trending on-chain pools before CEX listings, audit pool safety with Dollarino AI, and execute non-custodial swaps directly in Trust Wallet.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleConnectInjectedTrust()}
            disabled={walletBusy}
            className="btn-gold px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            <span>
              {twStatus?.wallet.evmAddress
                ? `${twStatus.wallet.evmAddress.slice(0, 6)}...${twStatus.wallet.evmAddress.slice(-4)}`
                : isFa
                  ? 'اتصال فوری Trust Wallet'
                  : 'Connect Trust Wallet'}
            </span>
          </button>
          <a
            href={dappOpenSelf}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isFa ? 'باز کردن در اپ Trust Wallet' : 'Open in Trust Wallet App'}</span>
          </a>
        </div>
      </section>

      {(msg || err) && (
        <div
          className={`rounded-2xl p-3.5 text-xs font-bold border ${
            err ? 'bg-rose-500/15 border-rose-500/40 text-loss' : 'bg-emerald-500/15 border-emerald-500/40 text-jade'
          }`}
        >
          {err || msg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'dex', fa: '🔍 رادار زنده DexScreener', en: 'DexScreener Scanner' },
          { id: 'wallet', fa: '🦊 مدیریت کیف‌پول Trust Wallet', en: 'Trust Wallet Manager' },
          { id: 'trades', fa: `📜 پورتفوی معاملات DEX (${dexTrades.length})`, en: `DEX Trades (${dexTrades.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition ${
              subTab === t.id ? 'btn-gold shadow-sm' : 'panel text-dim hover:text-main'
            }`}
          >
            {isFa ? t.fa : t.en}
          </button>
        ))}
      </div>

      {/* TAB 1: DexScreener Live Radar */}
      {subTab === 'dex' && (
        <div className="space-y-4">
          <div className="panel rounded-3xl p-4 space-y-3">
            <form onSubmit={(e) => void handleSearch(e)} className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-dim absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isFa ? 'جستجو با نام توکن (PEPE, AERO) یا آدرس کامل کانترکت (0x...)' : 'Search symbol or contract address...'}
                  className="input-field ps-10 py-2.5 rounded-2xl text-xs w-full"
                />
              </div>
              <button type="submit" disabled={loadingDex} className="btn-cobalt px-5 py-2.5 rounded-2xl text-xs font-black">
                {loadingDex ? '...' : isFa ? 'جستجو در DexScreener' : 'Search'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  void loadTrending();
                }}
                className="btn-ghost px-3.5 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDex ? 'animate-spin' : ''}`} />
                <span>{isFa ? 'توکن‌های داغ' : 'Trending'}</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {CHAIN_FILTERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChainFilter(c)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-black uppercase transition ${
                      chainFilter === c ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                    }`}
                  >
                    {c === 'all' ? (isFa ? 'همه شبکه‌ها' : 'All') : c}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-dim">{isFa ? 'حجم پیش‌فرض ردیابی:' : 'Track Size:'}</span>
                <input
                  type="number"
                  min={5}
                  value={tradeAmtUsd}
                  onChange={(e) => setTradeAmtUsd(Math.max(5, Number(e.target.value || 50)))}
                  dir="ltr"
                  className="input-field w-20 py-1 px-2 rounded-xl text-xs text-center font-num"
                />
                <span className="font-bold text-main">USDT</span>
              </div>
            </div>
          </div>

          {visibleTokens.length === 0 && !loadingDex ? (
            <div className="panel rounded-3xl p-10 text-center text-xs text-dim">
              {isFa ? 'موردی یافت نشد. جستجو را تغییر دهید یا روی «توکن‌های داغ» بزنید.' : 'No tokens found.'}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleTokens.map((t) => {
                const ch24 = Number(t.priceChange?.h24 || 0);
                const ch1 = Number(t.priceChange?.h1 || 0);
                const isUp = ch24 >= 0;
                const safeColor =
                  t.safetyScore >= 70 ? 'text-jade bg-emerald-500/15' : t.safetyScore >= 45 ? 'text-amber-400 bg-amber-500/15' : 'text-loss bg-rose-500/15';
                return (
                  <div key={`${t.chainId}-${t.pairAddress}`} className="panel rounded-3xl p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="font-display text-base text-main">{t.baseToken.symbol}</strong>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 uppercase">
                              {t.chainId} · {t.dexId}
                            </span>
                          </div>
                          <p className="text-[11px] text-dim truncate max-w-[200px]">{t.baseToken.name}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black inline-flex items-center gap-1 ${safeColor}`}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {t.safetyScore}/100
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 surface-soft rounded-2xl p-2.5 text-center">
                        <div>
                          <span className="block text-[10px] text-dim">{isFa ? 'قیمت' : 'Price'}</span>
                          <strong dir="ltr" className="text-xs font-num text-main">
                            {fmtTokenPrice(t.priceUsd)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] text-dim">{isFa ? 'نقدینگی' : 'Liquidity'}</span>
                          <strong dir="ltr" className="text-xs font-num text-main">
                            {fmtUsd(t.liquidity?.usd)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] text-dim">{isFa ? '۲۴ ساعته' : '24h'}</span>
                          <strong dir="ltr" className={`text-xs font-num inline-flex items-center gap-0.5 ${isUp ? 'text-jade' : 'text-loss'}`}>
                            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isUp ? '+' : ''}
                            {ch24.toFixed(1)}%
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-dim">
                        <span>
                          {isFa ? 'حجم ۲۴س:' : 'Vol 24h:'} <strong className="text-main">{fmtUsd(t.volume?.h24)}</strong>
                        </span>
                        <span dir="ltr">1h: {ch1 >= 0 ? '+' : ''}{ch1.toFixed(1)}%</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                            t.isOnCentralizedHint ? 'bg-slate-500/15 text-dim' : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {t.isOnCentralizedHint
                            ? isFa
                              ? 'موجود در صرافی‌های اصلی'
                              : 'On CEXs'
                            : isFa
                              ? '🆕 ویژه DEX (ناموجود در Toobit/KCEX)'
                              : '🆕 DEX-Exclusive'}
                        </span>
                        {t.riskFlags.slice(0, 2).map((rf) => (
                          <span key={rf} className="text-[10px] px-2 py-0.5 rounded-lg bg-rose-500/10 text-loss inline-flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {rf}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t hairline">
                      <button
                        type="button"
                        onClick={() => void handleTrackDexTrade(t, true)}
                        className="btn-gold py-2 px-2.5 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>{isFa ? 'سوآپ در Trust Wallet' : 'Swap in TW'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAiAnalyze(t)}
                        className="btn-cobalt py-2 px-2.5 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>{isFa ? 'تحلیل هوشمند AI' : 'AI Analyze'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTrackDexTrade(t, false)}
                        className="btn-ghost py-1.5 px-2 rounded-xl text-[11px] font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Coins className="w-3 h-3" />
                        <span>{isFa ? 'ثبت در پورتفو DEX' : 'Track Position'}</span>
                      </button>
                      <a
                        href={t.trustWallet.dexScreenerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost py-1.5 px-2 rounded-xl text-[11px] font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Activity className="w-3 h-3" />
                        <span>{isFa ? 'چارت DexScreener' : 'Chart'}</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Trust Wallet Manager */}
      {subTab === 'wallet' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <form onSubmit={(e) => void handleSaveManualAddresses(e)} className="panel rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[var(--gold)]" />
                <span>{isFa ? 'اتصال چندزنجیره‌ای Trust Wallet' : 'Multi-Chain Trust Wallet Addresses'}</span>
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
                <label className="block text-xs font-bold text-dim mb-1">
                  {isFa ? 'آدرس Solana (شبکه SPL / میم‌کوین‌ها)' : 'Solana Address'}
                </label>
                <input
                  value={solInput}
                  onChange={(e) => setSolInput(e.target.value)}
                  dir="ltr"
                  placeholder="..."
                  className="input-field w-full py-2.5 px-3 rounded-2xl text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={walletBusy} className="btn-gold px-5 py-2.5 rounded-2xl text-xs font-black">
                {isFa ? 'ذخیره آدرس‌های کیف‌پول' : 'Save Addresses'}
              </button>
              <button type="button" onClick={() => void handleFetchBalances()} disabled={walletBusy} className="btn-cobalt px-4 py-2.5 rounded-2xl text-xs font-black">
                {isFa ? 'استعلام موجودی آن‌چین' : 'Fetch On-Chain Balances'}
              </button>
              {twStatus?.connected && (
                <button type="button" onClick={() => void handleDisconnect()} className="btn-ghost px-3 py-2.5 rounded-2xl text-xs text-loss inline-flex items-center gap-1">
                  <Unlink className="w-3.5 h-3.5" />
                  <span>{isFa ? 'قطع اتصال' : 'Disconnect'}</span>
                </button>
              )}
            </div>
          </form>

          <div className="panel rounded-3xl p-5 space-y-4">
            <h3 className="font-display font-bold text-base text-main">
              {isFa ? 'موجودی زنده بلاکچین و آدرس‌های دریافت پلتفرم' : 'On-Chain Balances & Official Receivers'}
            </h3>
            {balances ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'BSC USDT (BEP20)', val: balances.bscUsdt !== null ? `${balances.bscUsdt.toFixed(2)} USDT` : '—' },
                  { label: 'BNB (BSC Gas)', val: balances.bnb !== null ? `${balances.bnb.toFixed(4)} BNB` : '—' },
                  { label: 'Ethereum (ETH)', val: balances.eth !== null ? `${balances.eth.toFixed(4)} ETH` : '—' },
                  { label: 'TRON USDT (TRC20)', val: balances.trc20Usdt !== null ? `${balances.trc20Usdt.toFixed(2)} USDT` : '—' },
                ].map((b) => (
                  <div key={b.label} className="surface-soft rounded-2xl p-3">
                    <span className="block text-[11px] text-dim">{b.label}</span>
                    <strong dir="ltr" className="text-sm font-num text-main">
                      {b.val}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dim surface-soft rounded-2xl p-4">
                {isFa
                  ? 'پس از ثبت آدرس EVM یا TRON، دکمه «استعلام موجودی آن‌چین» را بزنید تا دارایی لحظه‌ای شما مستقیماً از نودهای BSC/ETH/Tronscan خوانده شود.'
                  : 'Click Fetch On-Chain Balances after saving your wallet addresses.'}
              </p>
            )}

            <div className="surface-soft rounded-2xl p-3.5 space-y-2 text-xs">
              <p className="font-black text-main">{isFa ? 'آدرس‌های رسمی واریز اشتراک دلارینو:' : 'Official Dollarino Subscription Receivers:'}</p>
              <p className="text-dim">
                BEP20 (Trust Wallet EVM): <code dir="ltr" className="text-main">{twStatus?.platformReceivers.evm || '—'}</code>
              </p>
              <p className="text-dim">
                TRC20 (TRON): <code dir="ltr" className="text-main">{twStatus?.platformReceivers.trc20 || '—'}</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEX Trades Portfolio */}
      {subTab === 'trades' && (
        <div className="panel rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-main">
              {isFa ? 'پورتفوی معاملات غیرمتمرکز (Trust Wallet + DexScreener)' : 'Non-Custodial DEX Portfolio'}
            </h3>
            <button type="button" onClick={() => void loadWalletAndTrades()} className="btn-ghost px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'بروزرسانی قیمت‌ها' : 'Refresh'}</span>
            </button>
          </div>
          {dexTrades.length === 0 ? (
            <p className="text-xs text-dim py-8 text-center">
              {isFa ? 'هنوز معامله غیرمتمرکزی ثبت نکرده‌اید. از تب «رادار زنده DexScreener» اقدام کنید.' : 'No DEX trades yet.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {dexTrades.map((t) => {
                const isClosed = t.status === 'CLOSED';
                const pnlUsd = isClosed ? t.realized_pnl_usd : Number(t.unrealized_pnl_usd ?? 0);
                const pnlPct = isClosed ? t.realized_pnl_pct : Number(t.unrealized_pnl_pct ?? 0);
                return (
                  <div key={t.id} className="surface-soft rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-main">{t.token_symbol}</strong>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 uppercase">{t.chain_id}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-white/10 text-dim">{t.status}</span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim mt-1">
                        Size: ${t.amount_usd} · Entry: {fmtTokenPrice(t.entry_price_usd)} · Live: {fmtTokenPrice(t.live_price_usd)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span dir="ltr" className={`font-num font-black text-sm ${pnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                        {pnlUsd >= 0 ? '+' : ''}
                        ${pnlUsd.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}
                        {pnlPct.toFixed(1)}%)
                      </span>
                      {t.trustWallet && (
                        <a
                          href={t.trustWallet.trustWalletDappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                        >
                          Trust Wallet
                        </a>
                      )}
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => void handleCloseDexTrade(t.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-loss text-[11px] font-black hover:bg-rose-500 hover:text-white transition"
                        >
                          {isFa ? 'بستن معامله' : 'Close'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Token Analysis Modal */}
      {aiModal && (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-md p-4 grid place-items-center" onClick={() => setAiModal(null)}>
          <div className="panel rounded-[28px] max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                <span>
                  {isFa ? `تحلیل هوشمند AI برای ${aiModal.token.baseToken.symbol}` : `AI Analysis: ${aiModal.token.baseToken.symbol}`}
                </span>
              </h3>
              <button type="button" onClick={() => setAiModal(null)} className="btn-ghost px-2.5 py-1 rounded-xl text-xs">
                ✕
              </button>
            </div>
            {aiModal.loading ? (
              <p className="text-xs text-dim py-6 text-center">{isFa ? 'در حال تحلیل نقدینگی، مومنتوم و امنیت استخر...' : 'Analyzing...'}</p>
            ) : (
              <>
                <div className="surface-soft rounded-2xl p-4 text-xs leading-relaxed whitespace-pre-wrap text-main">{aiModal.analysis}</div>
                {aiModal.levels && (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="surface-soft rounded-xl p-2">
                      <span className="block text-[10px] text-dim">{isFa ? 'ورود' : 'Entry'}</span>
                      <strong dir="ltr">{fmtTokenPrice(aiModal.levels.entryUsd)}</strong>
                    </div>
                    <div className="surface-soft rounded-xl p-2">
                      <span className="block text-[10px] text-loss">{isFa ? 'حد ضرر پیشنهادی' : 'Suggested SL'}</span>
                      <strong dir="ltr">{fmtTokenPrice(aiModal.levels.stopLossUsd)}</strong>
                    </div>
                    <div className="surface-soft rounded-xl p-2">
                      <span className="block text-[10px] text-jade">{isFa ? 'تارگت ۱' : 'Suggested TP1'}</span>
                      <strong dir="ltr">{fmtTokenPrice(aiModal.levels.tp1Usd)}</strong>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <a
                    href={aiModal.token.trustWallet.trustWalletDappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-gold flex-1 py-2.5 rounded-2xl text-xs font-black text-center"
                  >
                    {isFa ? '🦊 خرید غیرحضانتی در Trust Wallet' : 'Swap in Trust Wallet'}
                  </a>
                  <button type="button" onClick={() => setAiModal(null)} className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold">
                    {isFa ? 'بستن' : 'Close'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
