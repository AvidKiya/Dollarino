import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Coins,
  ExternalLink,
  Flame,
  Gauge,
  History,
  KeyRound,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Unlink,
  Wallet,
  X,
} from 'lucide-react';
import { ChainLogo, WalletLogo } from '../components/BrandLogos';
import { CoinIcon } from '../components/CoinIcon';
import { apiFetch } from '../lib/api';
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
} from '../lib/trustwallet';
import type { AuthUserInfo, MultiDappRouteItem, PerpDappLinkItem, PerpMarketQuoteItem, TokenRugSafetyReport } from '../lib/types';

export interface DexTokenCardItem {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string | null;
  info?: { imageUrl?: string };
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  pairCreatedAt?: number;
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

function fmtTokenAge(createdAtMs?: number, isFa = true): string {
  if (!createdAtMs || !Number.isFinite(createdAtMs) || createdAtMs <= 0) return '—';
  const diffHrs = Math.max(0, (Date.now() - createdAtMs) / 3_600_000);
  if (diffHrs < 1) return isFa ? `${Math.max(1, Math.round(diffHrs * 60))}دقیقه` : `${Math.max(1, Math.round(diffHrs * 60))}m`;
  if (diffHrs < 24) return isFa ? `${Math.round(diffHrs)}ساعت` : `${Math.round(diffHrs)}h`;
  const days = Math.floor(diffHrs / 24);
  if (days < 30) return isFa ? `${days}روز` : `${days}d`;
  const months = Math.floor(days / 30);
  return isFa ? `${months}ماه` : `${months}mo`;
}

function fmtTokenPrice(p?: string | number | null): string {
  const n = Number(p || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  return `$${n.toFixed(4)}`;
}

const BASE_CHAIN_FILTERS = [
  'all',
  'bsc',
  'ethereum',
  'solana',
  'ton',
  'tron',
  'base',
  'arbitrum',
  'polygon',
  'avalanche',
  'optimism',
  'sui',
];

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
  const [subTab, setSubTab] = useState<'dex' | 'perps' | 'wallet' | 'trades'>('dex');
  const [perpMarkets, setPerpMarkets] = useState<PerpMarketQuoteItem[]>([]);
  const [perpDapps, setPerpDapps] = useState<PerpDappLinkItem[]>([]);
  const [perpBusy, setPerpBusy] = useState(false);
  const [perpAccount, setPerpAccount] = useState<{
    connected: boolean;
    walletAddress?: string;
    agentAddress?: string;
    mode?: string;
    liveAccount?: {
      accountValueUsd: number;
      marginUsedUsd: number;
      withdrawableUsd: number;
      positions: Array<{ symbol: string; size: number; side: string; entryPrice: number; unrealizedPnl: number; leverage: number }>;
    } | null;
    orders: Array<{ id: string; provider: string; symbol: string; side: string; size_usd: number; leverage: number; status: string; created_at: string }>;
  } | null>(null);
  const [perpAgentForm, setPerpAgentForm] = useState({
    walletAddress: '',
    agentAddress: '',
    agentPrivateKey: '',
    defaultLeverage: 5,
  });
  const [perpOrderForm, setPerpOrderForm] = useState({
    symbol: 'BTC',
    side: 'LONG' as 'LONG' | 'SHORT',
    sizeUsd: 100,
    leverage: 5,
    provider: 'HYPERLIQUID',
  });
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

  const [dappModal, setDappModal] = useState<{
    token: DexTokenCardItem;
    loading: boolean;
    routes: MultiDappRouteItem[];
    safety: TokenRugSafetyReport | null;
  } | null>(null);

  const openDappSafetyModal = async (t: DexTokenCardItem) => {
    setDappModal({ token: t, loading: true, routes: [], safety: null });
    try {
      const [routesRes, safetyRes] = await Promise.all([
        apiFetch<{ routes: MultiDappRouteItem[] }>(
          `/api/dex/routes?chainId=${encodeURIComponent(t.chainId)}&tokenAddress=${encodeURIComponent(t.baseToken.address)}`
        ).catch(() => ({ routes: [] })),
        apiFetch<{ report: TokenRugSafetyReport }>(
          `/api/dex/safety?chainId=${encodeURIComponent(t.chainId)}&tokenAddress=${encodeURIComponent(t.baseToken.address)}`
        ).catch(() => ({ report: null })),
      ]);
      setDappModal({
        token: t,
        loading: false,
        routes: routesRes.routes || [],
        safety: safetyRes.report || null,
      });
    } catch {
      setDappModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  const [twStatus, setTwStatus] = useState<TrustWalletStatusRes | null>(null);
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
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (err) {
      pushFloatingToast(err, 'error');
      setErr(null);
    }
  }, [err]);

  useEffect(() => {
    if (msg) {
      pushFloatingToast(msg, 'success');
      setMsg(null);
    }
  }, [msg]);

  const [dexTrades, setDexTrades] = useState<DexTradeItem[]>([]);
  const [tradeAmtUsd, setTradeAmtUsd] = useState(50);
  const [execMode, setExecMode] = useState<'AUTO' | 'MANUAL_CONFIRM'>('AUTO');

  const toggleTwExecutionMode = async (next: 'AUTO' | 'MANUAL_CONFIRM') => {
    try {
      await apiFetch('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({ executionMode: next, syncCopyRules: true }),
      });
      setExecMode(next);
      setMsg(
        next === 'AUTO'
          ? isFa ? 'حالت تمام‌اتوترید ۲۴/۷ فعال شد' : '24/7 Autonomous Auto-Trade enabled'
          : isFa ? 'حالت تایید دستی در Trust Wallet فعال شد' : 'Manual Approval mode enabled'
      );
      await onUserRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    }
  };

  useEffect(() => {
    void apiFetch<{ executionMode: 'AUTO' | 'MANUAL_CONFIRM' }>('/api/trustwallet/execution-mode')
      .then((r) => setExecMode(r.executionMode || 'AUTO'))
      .catch(() => {});
  }, []);

  const fetchPublicDexFallback = useCallback(async (searchQuery?: string): Promise<DexTokenCardItem[]> => {
    const buildItem = (p: {
      chainId?: string;
      dexId?: string;
      url?: string;
      pairAddress?: string;
      baseToken?: { address?: string; name?: string; symbol?: string };
      quoteToken?: { address?: string; name?: string; symbol?: string };
      priceUsd?: string | null;
      info?: { imageUrl?: string };
      volume?: { h24?: number };
      priceChange?: { m5?: number; h1?: number; h24?: number };
      liquidity?: { usd?: number };
      fdv?: number | null;
    }): DexTokenCardItem | null => {
      const sym = p.baseToken?.symbol || '';
      if (!sym || !Number(p.priceUsd || 0)) return null;
      const chain = p.chainId || 'bsc';
      const addr = p.baseToken?.address || p.pairAddress || '';
      const liq = Number(p.liquidity?.usd || 0);
      const vol = Number(p.volume?.h24 || 0);
      let safetyScore = 60;
      const riskFlags: string[] = [];
      if (liq >= 250_000) safetyScore += 20;
      else if (liq >= 50_000) safetyScore += 10;
      else if (liq < 15_000) {
        safetyScore -= 18;
        riskFlags.push('نقدینگی پایین');
      }
      if (vol >= 200_000) safetyScore += 10;
      const dexUrl = p.url || `https://dexscreener.com/${chain}/${p.pairAddress || addr}`;
      const coinId = chain === 'ethereum' ? 60 : chain === 'solana' ? 501 : chain === 'ton' ? 607 : chain === 'polygon' ? 966 : 20000714;
      const swapUrl =
        chain === 'solana'
          ? `https://jup.ag/swap/SOL-${encodeURIComponent(addr)}`
          : chain === 'bsc'
            ? `https://pancakeswap.finance/swap?outputCurrency=${encodeURIComponent(addr)}`
            : `https://app.uniswap.org/swap?outputCurrency=${encodeURIComponent(addr)}`;
      return {
        chainId: chain,
        dexId: p.dexId || 'dex',
        url: dexUrl,
        pairAddress: p.pairAddress || addr,
        baseToken: { address: addr, name: p.baseToken?.name || sym, symbol: sym },
        quoteToken: { address: p.quoteToken?.address || '', name: p.quoteToken?.name || 'USDT', symbol: p.quoteToken?.symbol || 'USDT' },
        priceUsd: p.priceUsd,
        info: p.info,
        volume: p.volume,
        priceChange: p.priceChange,
        liquidity: p.liquidity,
        fdv: p.fdv ?? null,
        safetyScore: Math.max(10, Math.min(96, safetyScore)),
        riskFlags,
        isOnCentralizedHint: new Set(['BTC', 'ETH', 'SOL', 'BNB', 'TON', 'XRP', 'DOGE', 'PEPE']).has(sym.toUpperCase()),
        trustWallet: {
          chainId: chain,
          coinId,
          dexName: chain === 'solana' ? 'Jupiter' : chain === 'bsc' ? 'PancakeSwap' : 'Uniswap',
          swapUrl,
          trustWalletDappUrl: `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(swapUrl)}`,
          dexScreenerUrl: dexUrl,
        },
      };
    };

    try {
      const q = (searchQuery || 'PEPE').trim();
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const json = (await res.json()) as { pairs?: Array<Parameters<typeof buildItem>[0]> };
        const items = (json.pairs || []).map(buildItem).filter((x): x is DexTokenCardItem => Boolean(x));
        if (items.length > 0) return items.slice(0, 24);
      }
    } catch {
      /* fallback to gecko */
    }
    try {
      const url = searchQuery
        ? `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(searchQuery)}&include=base_token`
        : `https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token`;
      const gRes = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (gRes.ok) {
        const gj = (await gRes.json()) as {
          data?: Array<{
            id: string;
            attributes?: {
              address?: string;
              name?: string;
              base_token_price_usd?: string;
              reserve_in_usd?: string;
              volume_usd?: { h24?: string };
              price_change_percentage?: { h24?: string; h1?: string; m5?: string };
              fdv_usd?: string;
            };
            relationships?: { base_token?: { data?: { id?: string } }; network?: { data?: { id?: string } } };
          }>;
          included?: Array<{ id: string; attributes?: { address?: string; name?: string; symbol?: string; image_url?: string } }>;
        };
        const inc = new Map((gj.included || []).map((i) => [i.id, i.attributes]));
        const out: DexTokenCardItem[] = [];
        for (const p of (gj.data || []).slice(0, 24)) {
          const a = p.attributes;
          if (!a?.address || !a.base_token_price_usd) continue;
          const rawNet = p.relationships?.network?.data?.id || 'bsc';
          const chainId = rawNet === 'eth' ? 'ethereum' : rawNet === 'polygon_pos' ? 'polygon' : rawNet;
          const bMeta = inc.get(p.relationships?.base_token?.data?.id || '');
          const nameParts = (a.name || '').split('/').map((s) => s.trim());
          const item = buildItem({
            chainId,
            dexId: 'geckoterminal',
            url: `https://www.geckoterminal.com/${rawNet}/pools/${a.address}`,
            pairAddress: a.address,
            baseToken: { address: bMeta?.address || a.address, name: bMeta?.name || nameParts[0] || 'Token', symbol: bMeta?.symbol || nameParts[0] || 'TOKEN' },
            quoteToken: { address: '', name: nameParts[1] || 'USDT', symbol: nameParts[1] || 'USDT' },
            priceUsd: a.base_token_price_usd,
            info: bMeta?.image_url ? { imageUrl: bMeta.image_url } : undefined,
            volume: { h24: Number(a.volume_usd?.h24 || 0) },
            priceChange: {
              h24: Number(a.price_change_percentage?.h24 || 0),
              h1: Number(a.price_change_percentage?.h1 || 0),
              m5: Number(a.price_change_percentage?.m5 || 0),
            },
            liquidity: { usd: Number(a.reserve_in_usd || 0) },
            fdv: a.fdv_usd ? Number(a.fdv_usd) : null,
          });
          if (item) out.push(item);
        }
        return out;
      }
    } catch {
      /* ignore */
    }
    return [];
  }, []);

  const loadTrending = useCallback(async () => {
    setLoadingDex(true);
    setErr(null);
    try {
      const res = await apiFetch<{ trending?: DexTokenCardItem[]; pairs?: DexTokenCardItem[] }>('/api/dex/trending');
      const list = res.trending || res.pairs || [];
      if (list.length > 0) {
        setTokens(list);
      } else {
        const fb = await fetchPublicDexFallback();
        setTokens(fb);
      }
    } catch {
      const fb = await fetchPublicDexFallback();
      if (fb.length > 0) {
        setTokens(fb);
      } else {
        setErr(isFa ? 'دریافت داده DEX موقتاً با اختلال مواجه شد. دوباره تلاش کنید.' : 'DexScreener load failed');
      }
    } finally {
      setLoadingDex(false);
    }
  }, [fetchPublicDexFallback, isFa]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      await loadTrending();
      return;
    }
    setLoadingDex(true);
    setErr(null);
    try {
      const res = await apiFetch<{ pairs?: DexTokenCardItem[]; results?: DexTokenCardItem[] }>(`/api/dex/search?q=${encodeURIComponent(query.trim())}`);
      const list = res.pairs || res.results || [];
      if (list.length > 0) {
        setTokens(list);
      } else {
        const fb = await fetchPublicDexFallback(query.trim());
        setTokens(fb);
      }
    } catch {
      const fb = await fetchPublicDexFallback(query.trim());
      if (fb.length > 0) {
        setTokens(fb);
      } else {
        setErr(isFa ? 'جستجو در شبکه DEX ناموفق بود.' : 'Search failed');
      }
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
      if (st.wallet.tonAddress) setTonInput(st.wallet.tonAddress);
    } catch {
      // ignore
    }
  }, []);

  const loadPerpData = useCallback(async () => {
    try {
      const [mk, acc] = await Promise.all([
        apiFetch<{ markets: PerpMarketQuoteItem[]; dapps: PerpDappLinkItem[] }>('/api/dex/perp-markets'),
        apiFetch<NonNullable<typeof perpAccount>>('/api/dex/perp-account').catch(() => null),
      ]);
      setPerpMarkets(mk.markets || []);
      setPerpDapps(mk.dapps || []);
      if (acc) {
        setPerpAccount(acc);
        if (acc.walletAddress) {
          setPerpAgentForm((f) => ({ ...f, walletAddress: f.walletAddress || acc.walletAddress || '' }));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadTrending();
    void loadWalletAndTrades();
    void loadPerpData();
  }, [loadTrending, loadWalletAndTrades, loadPerpData]);

  const handleConnectInjectedTrust = async () => {
    setWalletBusy(true);
    setErr(null);
    setMsg(null);
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
      setMsg(
        isFa
          ? `کیف‌پول چندزنجیره‌ای با موفقیت متصل شد: ${conn.connectedFamilies.join(' + ')}`
          : `Multi-chain wallet connected: ${conn.connectedFamilies.join(' + ')}`
      );
      await loadWalletAndTrades();
      await onUserRefresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'NO_INJECTED_WALLET') {
        try {
          const handoff = await requestTrustWalletDappHandoff();
          launchTrustWalletUrl(handoff.universalLink, handoff.deepLink);
          setMsg(
            isFa
              ? 'لینک اتصال خودکار Trust Wallet ساخته و باز شد — داخل اپ Trust Wallet تایید کنید.'
              : 'Opening Trust Wallet app with auto-connect...'
          );
        } catch {
          setErr(
            isFa
              ? 'در این مرورگر افزونه کیف‌پول (Trust Wallet / MetaMask / Phantom / Tonkeeper) تشخیص داده نشد. از دکمه «باز کردن در اپ Trust Wallet» استفاده کنید یا در تب مدیریت کیف‌پول آدرس شبکه‌ها را ثبت کنید.'
              : 'No injected wallet detected. Open inside Trust Wallet DApp Browser or enter addresses manually in the Wallet Manager tab.'
          );
        }
      } else if (code === 'USER_REJECTED') {
        setErr(isFa ? 'درخواست اتصال در کیف‌پول لغو شد.' : 'Connection request rejected in wallet.');
      } else {
        setErr(code || 'Connection rejected');
      }
    } finally {
      setWalletBusy(false);
    }
  };

  const handleOpenInTrustApp = async () => {
    setWalletBusy(true);
    setErr(null);
    try {
      const handoff = await requestTrustWalletDappHandoff();
      launchTrustWalletUrl(handoff.universalLink, handoff.deepLink);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to open Trust Wallet');
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSwitchEvmNetwork = async (netKey: EvmNetworkSpec['key']) => {
    setErr(null);
    setMsg(null);
    setWalletBusy(true);
    try {
      const spec = await switchEvmNetwork(netKey);
      setActiveEvmKey(spec.key);
      setMsg(
        isFa
          ? `شبکه فعال کیف‌پول روی ${spec.chainName} (${spec.shortName}) تنظیم شد.`
          : `Active wallet network switched to ${spec.chainName}.`
      );
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setErr(
        code === 'NO_INJECTED_WALLET'
          ? isFa
            ? 'برای تغییر شبکه خودکار، افزونه کیف‌پول را در مرورگر فعال کنید یا در اپ Trust Wallet باز کنید.'
            : 'Enable a browser wallet extension to switch networks automatically.'
          : code || 'Network switch failed'
      );
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
          tonAddress: tonInput.trim() || undefined,
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
      setTonInput('');
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

  const dynamicChainFilters = Array.from(
    new Set([
      ...BASE_CHAIN_FILTERS,
      ...tokens.map((t) => t.chainId.toLowerCase()).filter(Boolean),
    ])
  );
  const visibleTokens = tokens.filter((t) => chainFilter === 'all' || t.chainId.toLowerCase() === chainFilter);

  return (
    <div className="space-y-5">
      {/* Header Hero with Generated Web3 Banner */}
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
                  <Flame className="w-3.5 h-3.5" />
                  {isFa ? 'رادار همه‌بستره DexScreener + کیف‌پول چندزنجیره‌ای' : 'Multi-Chain DexScreener + Wallet Hub'}
                </span>
                {isTrustWalletEnvironment() && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-jade inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isFa ? 'مرورگر Trust Wallet فعال' : 'Trust Wallet DApp Active'}</span>
                  </span>
                )}
              </div>
              <h2 className="font-display font-black text-xl md:text-2xl text-main">
                {isFa ? (
                  <>
                    اتصال همه شبکه‌ها <span dir="ltr" className="inline-block">(EVM · Solana · TON · TRON)</span> و کشف تمام توکن‌های DEX
                  </>
                ) : (
                  'Connect All Chains & Discover Tokens Across Every DEX'
                )}
              </h2>
              <p className="text-xs text-dim leading-relaxed">
                {isFa ? (
                  <>
                    توکن‌ها و جفت‌ارزهای کل بسترها را از <span dir="ltr">Ethereum · BSC · Solana · TON · Base · Arbitrum · Polygon · Avalanche · Sui</span> پیدا کنید و یکجا به کیف‌پول متصل و سوآپ کنید.
                  </>
                ) : (
                  'Discover pairs across Ethereum, BSC, Solana, TON, Base, Arbitrum, Polygon, Avalanche, Sui & more and swap non-custodially.'
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
                {isFa ? '✋ تایید دستی' : '✋ Manual'}
              </button>
              <button
                type="button"
                onClick={() => void toggleTwExecutionMode('AUTO')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition ${
                  execMode === 'AUTO' ? 'btn-emerald' : 'text-dim hover:text-main'
                }`}
              >
                {isFa ? '⚡ اتوترید ۲۴/۷' : '⚡ 24/7 Auto'}
              </button>
            </div>
          </div>
        </div>

        {/* Multi-Chain Connection Status Bar + 1-Click EVM Network Switcher */}
        <div className="pt-3 border-t hairline flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-dim font-bold">{isFa ? 'شبکه‌های متصل:' : 'Connected:'}</span>
            {[
              { id: 'evm', label: 'EVM (ETH·BSC·Base·Arb·Pol·Avax)', addr: twStatus?.wallet.evmAddress, chain: 'ethereum' },
              { id: 'solana', label: 'Solana', addr: twStatus?.wallet.solanaAddress, chain: 'solana' },
              { id: 'ton', label: 'TON', addr: twStatus?.wallet.tonAddress, chain: 'ton' },
              { id: 'tron', label: 'TRON', addr: twStatus?.wallet.tronAddress, chain: 'tron' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab('wallet')}
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

      {/* Navigation Tabs */}
      <div className="tab-bar w-full sm:w-auto">
        {[
          { id: 'dex', icon: Search, fa: 'رادار زنده DexScreener', en: 'DexScreener Scanner' },
          { id: 'perps', icon: Gauge, fa: 'فیوچرز کیف‌پول (Perp DEX)', en: 'Wallet Leveraged Perps' },
          { id: 'wallet', icon: ShieldCheck, fa: 'مدیریت کیف‌پول Trust Wallet', en: 'Trust Wallet Manager' },
          { id: 'trades', icon: History, fa: `پورتفوی معاملات DEX (${dexTrades.length})`, en: `DEX Trades (${dexTrades.length})` },
        ].map((t) => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as typeof subTab)}
              className={`tab-pill flex-1 sm:flex-initial ${subTab === t.id ? 'tab-pill-active' : ''}`}
            >
              <TabIcon className="w-4 h-4 shrink-0" />
              <span>{isFa ? t.fa : t.en}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: DexScreener Live Radar */}
      {subTab === 'dex' && (
        <div className="space-y-4 tab-enter">
          <div className="panel rounded-3xl p-4 border border-emerald-500/20 flex flex-col md:flex-row md:items-center gap-4">
            <img
              src="/images/antirug-shield-dapp.webp"
              alt="Anti-Rug & Multi-DApp Shield"
              className="w-full md:w-44 h-24 rounded-2xl object-cover shrink-0 border hairline"
            />
            <div className="flex-1 min-w-0 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                  {isFa ? 'سپر ضدراگ ۳ منبعی (GoPlus + Honeypot.is + RugCheck)' : '3-Source Anti-Rug Scanner'}
                </span>
                <span className="text-[11px] font-bold text-jade">
                  {isFa ? 'امتیاز ۷۵+ = ایمن' : 'Score 75+ = SAFE'}
                </span>
                <span className="text-[11px] font-bold text-amber-400">
                  {isFa ? '۴۵ تا ۷۴ = احتیاط' : '45–74 = CAUTION'}
                </span>
                <span className="text-[11px] font-bold text-loss">
                  {isFa ? 'زیر ۴۵ = ریسک هانی‌پات/راگ' : '<45 = HIGH RISK'}
                </span>
              </div>
              <p className="text-dim leading-relaxed">
                {isFa
                  ? 'روی هر توکن، دکمه «DAppهای شبکه + ضدراگ» را بزنید تا بررسی کامل قرارداد (مالیات خرید/فروش، Mint و نقدینگی قفل‌شده) را ببینید و همزمان همه صرافی‌های آن شبکه را مستقیماً در Trust Wallet باز کنید.'
                  : 'Tap "Multi-DApp + Safety" on any token to run live GoPlus/Honeypot/RugCheck inspection and open all top DEX routes directly inside Trust Wallet.'}
              </p>
            </div>
          </div>

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
                {dynamicChainFilters.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChainFilter(c)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-black uppercase transition inline-flex items-center gap-1.5 ${
                      chainFilter === c ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
                    }`}
                  >
                    {c !== 'all' && <ChainLogo chain={c} size={14} />}
                    <span>{c === 'all' ? (isFa ? 'همه شبکه‌ها' : 'All') : c}</span>
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
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CoinIcon symbol={t.baseToken.symbol} imageUrl={t.info?.imageUrl} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="font-display text-base text-main">{t.baseToken.symbol}</strong>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 uppercase inline-flex items-center gap-1">
                                <ChainLogo chain={t.chainId} size={13} />
                                <span>{t.chainId} · {t.dexId}</span>
                              </span>
                            </div>
                            <p className="text-[11px] text-dim truncate max-w-[180px]">{t.baseToken.name}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black inline-flex items-center gap-1 shrink-0 ${safeColor}`}>
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

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim">
                        <span>
                          {isFa ? 'حجم ۲۴س:' : 'Vol 24h:'} <strong className="text-main">{fmtUsd(t.volume?.h24)}</strong>
                        </span>
                        <span>
                          {isFa ? 'سن:' : 'Age:'}{' '}
                          <strong className="text-main">{fmtTokenAge(t.pairCreatedAt, isFa)}</strong>
                        </span>
                        {(t.txns?.h1?.buys !== undefined || t.txns?.h1?.sells !== undefined) && (
                          <span dir="ltr" className="font-num">
                            1h B/S:{' '}
                            <strong className="text-jade">{t.txns?.h1?.buys ?? 0}</strong>/
                            <strong className="text-loss">{t.txns?.h1?.sells ?? 0}</strong>
                          </span>
                        )}
                        <span dir="ltr">1h: {ch1 >= 0 ? '+' : ''}{ch1.toFixed(1)}%</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 ${
                            t.isOnCentralizedHint ? 'bg-slate-500/15 text-dim' : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {!t.isOnCentralizedHint && <Sparkles className="w-2.5 h-2.5" />}
                          {t.isOnCentralizedHint
                            ? isFa
                              ? 'جفت‌ارز پرحجم محبوب'
                              : 'Blue-Chip Pair'
                            : isFa
                              ? 'جم و توکن آنچین DEX'
                              : 'DEX On-Chain Gem'}
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
                      <button
                        type="button"
                        onClick={() => void openDappSafetyModal(t)}
                        className="col-span-2 surface-soft hover:border-brand/50 border border-[var(--border)] py-1.5 px-2.5 rounded-xl text-[11px] font-black text-main inline-flex items-center justify-center gap-1.5 transition"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-jade" />
                        <span>{isFa ? 'بهترین DAppهای Trust Wallet + اسکن ضدراگ' : 'All Top DApps + Anti-Rug Scan'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB PERPS: Non-Custodial Wallet Leveraged Futures (Hyperliquid / Jupiter Perps / GMX / dYdX) */}
      {subTab === 'perps' && (
        <div className="space-y-5 tab-enter">
          <div className="panel rounded-3xl p-5 sm:p-6 space-y-4 border border-emerald-500/25">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[11px] font-black">
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{isFa ? 'فیوچرز اهرم‌دار غیرمتمرکز روی کیف‌پول (بدون صرافی متمرکز)' : 'NON-CUSTODIAL WALLET LEVERAGED PERPS'}</span>
                </div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-main">
                  {isFa ? 'معامله لانگ و شورت اهرم‌دار تا ۱۰۰x مستقیم از Trust Wallet' : 'Trade Long/Short Up to 100x Straight From Your Wallet'}
                </h3>
                <p className="text-xs text-dim leading-relaxed">
                  {isFa
                    ? 'با اتصال کیف‌پول خود می‌توانید بدون احراز هویت در صرافی‌های متمرکز و بدون سپردن پول، روی صرافی‌های فیوچرز غیرمتمرکز Hyperliquid (تا ۵۰x)، Jupiter Perps سولانا (تا ۱۰۰x)، GMX V2 و dYdX معامله اهرم‌دار باز کنید.'
                    : 'Open leveraged Long/Short positions directly from your non-custodial wallet on Hyperliquid (50x), Solana Jupiter Perps (100x), GMX V2, and dYdX v4.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadPerpData()}
                className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بروزرسانی نرخ‌ها' : 'Refresh Markets'}</span>
              </button>
            </div>

            {/* 4 Leading Perp DEX Cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {perpDapps.map((d) => (
                <div key={d.venue} className="surface-soft rounded-2xl p-4 border hairline flex flex-col justify-between gap-3 panel-hover">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sm text-main">{d.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-num text-[10px] font-black">
                        Up to {d.maxLeverage}x
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-brand uppercase">{d.chain}</p>
                    <p className="text-[11px] text-dim leading-relaxed">{isFa ? d.noteFa : d.noteEn}</p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <a
                      href={d.trustWalletDappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-gold flex-1 py-2 rounded-xl text-[11px] font-black text-center"
                    >
                      {isFa ? 'باز کردن در Trust Wallet' : 'Open in Trust Wallet'}
                    </a>
                    <a
                      href={d.dappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-2.5 py-2 rounded-xl text-[11px]"
                      title={d.name}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4 items-start">
            {/* Quick Wallet Perp Order & Live Hyperliquid Markets */}
            <div className="panel rounded-3xl p-5 space-y-4">
              <h4 className="font-display font-bold text-sm sm:text-base text-main flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" />
                <span>{isFa ? 'ثبت سریع سفارش فیوچرز کیف‌پول + رصد زنده مارکت‌ها' : 'Quick Wallet Perp Order & Live Mark Prices'}</span>
              </h4>

              <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
                <div className="grid sm:grid-cols-5 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'پروتکل' : 'Perp DEX'}</label>
                    <select
                      dir="ltr"
                      value={perpOrderForm.provider}
                      onChange={(e) => setPerpOrderForm((f) => ({ ...f, provider: e.target.value }))}
                      className="surface-input w-full rounded-xl px-2.5 py-2 text-xs text-left"
                    >
                      <option value="HYPERLIQUID">Hyperliquid (50x)</option>
                      <option value="JUPITER_PERPS">Jupiter Perps SOL (100x)</option>
                      <option value="GMX_ARB">GMX V2 ARB (50x)</option>
                      <option value="DYDX_V4">dYdX v4 (20x)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'ارز' : 'Coin'}</label>
                    <select
                      dir="ltr"
                      value={perpOrderForm.symbol}
                      onChange={(e) => setPerpOrderForm((f) => ({ ...f, symbol: e.target.value }))}
                      className="surface-input w-full rounded-xl px-2.5 py-2 text-xs text-left font-bold"
                    >
                      {(perpMarkets.length > 0 ? perpMarkets.slice(0, 12).map((m) => m.symbol) : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX']).map((s) => (
                        <option key={s} value={s}>{s}-PERP</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'حجم (دلار)' : 'Size ($)'}</label>
                    <input
                      type="number"
                      min={10}
                      max={1000000}
                      value={perpOrderForm.sizeUsd}
                      onChange={(e) => setPerpOrderForm((f) => ({ ...f, sizeUsd: Number(e.target.value) || 50 }))}
                      className="surface-input w-full rounded-xl px-2.5 py-2 font-num"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-dim block mb-1">{isFa ? 'اهرم (Leverage)' : 'Leverage'}</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={perpOrderForm.leverage}
                      onChange={(e) => setPerpOrderForm((f) => ({ ...f, leverage: Math.max(1, Math.min(100, Number(e.target.value) || 5)) }))}
                      className="surface-input w-full rounded-xl px-2.5 py-2 font-num"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={perpBusy}
                    onClick={async () => {
                      setPerpBusy(true);
                      setErr(null);
                      setMsg(null);
                      try {
                        const r = await apiFetch<{ messageFa: string; messageEn: string; dappRedirectUrl?: string }>('/api/dex/perp-order', {
                          method: 'POST',
                          body: JSON.stringify({ ...perpOrderForm, side: 'LONG' }),
                        });
                        setMsg(isFa ? r.messageFa : r.messageEn);
                        await loadPerpData();
                        if (r.dappRedirectUrl) window.open(r.dappRedirectUrl, '_blank', 'noopener,noreferrer');
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : 'Order failed');
                      } finally {
                        setPerpBusy(false);
                      }
                    }}
                    className="btn-emerald flex-1 py-2.5 rounded-xl font-black inline-flex items-center justify-center gap-1.5"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>{isFa ? `لانگ ${perpOrderForm.symbol} (${perpOrderForm.leverage}x)` : `LONG ${perpOrderForm.symbol}`}</span>
                  </button>
                  <button
                    type="button"
                    disabled={perpBusy}
                    onClick={async () => {
                      setPerpBusy(true);
                      setErr(null);
                      setMsg(null);
                      try {
                        const r = await apiFetch<{ messageFa: string; messageEn: string; dappRedirectUrl?: string }>('/api/dex/perp-order', {
                          method: 'POST',
                          body: JSON.stringify({ ...perpOrderForm, side: 'SHORT' }),
                        });
                        setMsg(isFa ? r.messageFa : r.messageEn);
                        await loadPerpData();
                        if (r.dappRedirectUrl) window.open(r.dappRedirectUrl, '_blank', 'noopener,noreferrer');
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : 'Order failed');
                      } finally {
                        setPerpBusy(false);
                      }
                    }}
                    className="btn-danger flex-1 py-2.5 rounded-xl font-black inline-flex items-center justify-center gap-1.5"
                  >
                    <TrendingDown className="w-4 h-4" />
                    <span>{isFa ? `شورت ${perpOrderForm.symbol} (${perpOrderForm.leverage}x)` : `SHORT ${perpOrderForm.symbol}`}</span>
                  </button>
                </div>
              </div>

              {/* Live Perp Markets Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-dim border-b hairline text-start">
                      <th className="pb-2">{isFa ? 'قرارداد' : 'Market'}</th>
                      <th className="pb-2">{isFa ? 'قیمت Mark' : 'Mark Price'}</th>
                      <th className="pb-2">{isFa ? 'فاندینگ (ساعتی)' : 'Funding/1h'}</th>
                      <th className="pb-2">{isFa ? 'اهرم' : 'Max Lev'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perpMarkets.slice(0, 10).map((m) => (
                      <tr key={m.symbol} className="border-b hairline/50 hover:bg-white/[0.02]">
                        <td className="py-2 font-black text-main">
                          <button
                            type="button"
                            onClick={() => setPerpOrderForm((f) => ({ ...f, symbol: m.symbol }))}
                            className="inline-flex items-center gap-1.5 hover:text-brand"
                          >
                            <CoinIcon symbol={`${m.symbol}USDT`} size={16} />
                            <span>{m.symbol}-PERP</span>
                          </button>
                        </td>
                        <td dir="ltr" className="py-2 font-num font-bold text-main">
                          ${Number(m.markPrice || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                        </td>
                        <td dir="ltr" className={`py-2 font-num font-bold ${m.fundingRatePct >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {m.fundingRatePct >= 0 ? '+' : ''}{m.fundingRatePct.toFixed(4)}%
                        </td>
                        <td dir="ltr" className="py-2 font-num text-amber-400 font-black">
                          {m.maxLeverage}x
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Hyperliquid Agent Wallet Setup + Live Positions */}
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPerpBusy(true);
                  setErr(null);
                  try {
                    const r = await apiFetch<{ messageFa: string }>('/api/dex/perp-connect', {
                      method: 'POST',
                      body: JSON.stringify({
                        provider: 'HYPERLIQUID',
                        walletAddress: perpAgentForm.walletAddress || twStatus?.wallet.evmAddress || '',
                        agentAddress: perpAgentForm.agentAddress || undefined,
                        agentPrivateKey: perpAgentForm.agentPrivateKey || undefined,
                        defaultLeverage: perpAgentForm.defaultLeverage,
                      }),
                    });
                    setMsg(r.messageFa);
                    setPerpAgentForm((f) => ({ ...f, agentPrivateKey: '' }));
                    await loadPerpData();
                  } catch (e2) {
                    setErr(e2 instanceof Error ? e2.message : 'Connect failed');
                  } finally {
                    setPerpBusy(false);
                  }
                }}
                className="panel rounded-3xl p-5 space-y-3 text-xs border border-blue-500/25"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-sm text-main flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-brand" />
                    <span>{isFa ? 'اتصال Agent Wallet (اختیاری)' : 'Connect Trade-Only Agent Wallet'}</span>
                  </h4>
                  {perpAccount?.connected && (
                    <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
                      {perpAccount.mode}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'برای رصد زنده پوزیشن‌ها و موجودی Hyperliquid آدرس اصلی ولت را وارد کنید. فقط اگر می‌خواهید ربات مستقیم معامله بفرستد، Agent Key (که مجوز برداشت ندارد) را ذخیره کنید.'
                    : 'Enter your main wallet address to track live Hyperliquid equity & positions. Optionally attach a trade-only Agent Wallet key (cannot withdraw).'}
                </p>
                <input
                  dir="ltr"
                  required
                  value={perpAgentForm.walletAddress || twStatus?.wallet.evmAddress || ''}
                  onChange={(e) => setPerpAgentForm((f) => ({ ...f, walletAddress: e.target.value }))}
                  placeholder="Main Wallet Address (0x...)"
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <input
                  dir="ltr"
                  value={perpAgentForm.agentAddress}
                  onChange={(e) => setPerpAgentForm((f) => ({ ...f, agentAddress: e.target.value }))}
                  placeholder="Optional Agent Wallet Public Address (0x...)"
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <input
                  dir="ltr"
                  type="password"
                  value={perpAgentForm.agentPrivateKey}
                  onChange={(e) => setPerpAgentForm((f) => ({ ...f, agentPrivateKey: e.target.value }))}
                  placeholder="Optional Hyperliquid Trade-Only Agent Private Key (Encrypted AES-256)"
                  className="surface-input w-full rounded-xl px-3 py-2 font-mono text-[11px]"
                />
                <button type="submit" disabled={perpBusy} className="btn-cobalt w-full py-2.5 rounded-xl font-black">
                  {perpBusy ? '...' : isFa ? 'ذخیره اتصال امن فیوچرز' : 'Save Non-Custodial Perp Link'}
                </button>
              </form>

              {perpAccount?.liveAccount && (
                <div className="panel rounded-3xl p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-main">{isFa ? 'مانده زنده Hyperliquid' : 'Live Hyperliquid Equity'}</span>
                    <span dir="ltr" className="font-num font-black text-jade text-sm">
                      ${perpAccount.liveAccount.accountValueUsd.toFixed(2)}
                    </span>
                  </div>
                  {perpAccount.liveAccount.positions.length === 0 ? (
                    <p className="text-[11px] text-dim">{isFa ? 'پوزیشن باز فعلی در Hyperliquid وجود ندارد.' : 'No open Hyperliquid positions.'}</p>
                  ) : (
                    <div className="space-y-2">
                      {perpAccount.liveAccount.positions.map((pos) => (
                        <div key={pos.symbol} className="surface-soft rounded-xl p-2.5 flex items-center justify-between">
                          <div>
                            <strong className="text-main">{pos.symbol} · {pos.side} ({pos.leverage}x)</strong>
                            <p dir="ltr" className="text-[10px] text-dim">Entry ${pos.entryPrice.toFixed(2)}</p>
                          </div>
                          <span dir="ltr" className={`font-num font-black ${pos.unrealizedPnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                            {pos.unrealizedPnl >= 0 ? `+$${pos.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(pos.unrealizedPnl).toFixed(2)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {perpAccount && perpAccount.orders?.length > 0 && (
                <div className="panel rounded-3xl p-4 space-y-2 text-xs">
                  <p className="font-black text-main">{isFa ? 'آخرین سفارش‌های فیوچرز کیف‌پول' : 'Recent Wallet Perp Orders'}</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {perpAccount.orders.slice(0, 6).map((o) => (
                      <div key={o.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between">
                        <span>
                          <strong>{o.symbol}</strong> · {o.side} · {o.leverage}x (${o.size_usd})
                        </span>
                        <span className="text-[10px] text-jade font-black">{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Trust Wallet Manager */}
      {subTab === 'wallet' && (
        <div className="grid lg:grid-cols-2 gap-4 tab-enter">
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
                <label className="block text-xs font-bold text-dim mb-1 flex items-center gap-1.5">
                  <ChainLogo chain="solana" size={14} />
                  <span>{isFa ? 'آدرس Solana (شبکه SPL / میم‌کوین‌ها)' : 'Solana Address'}</span>
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
              <p className="text-xs text-dim surface-soft rounded-2xl p-4">
                {isFa
                  ? 'پس از اتصال یا ثبت آدرس‌های EVM، Solana، TON یا TRON، دکمه «استعلام موجودی آن‌چین» را بزنید تا دارایی شما همزمان از همه شبکه‌ها خوانده شود.'
                  : 'Click Fetch On-Chain Balances to query BSC, ETH, Base, Arbitrum, Polygon, Solana, TON & TRON live.'}
              </p>
            )}

            <div className="surface-soft rounded-2xl p-3.5 space-y-2 text-xs">
              <p className="font-black text-main">{isFa ? 'آدرس‌های رسمی تسویه کارمزد ۳٪ سود دلارینو:' : 'Official Dollarino 3% Profit-Fee Settlement Receivers:'}</p>
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
        <div className="panel rounded-3xl p-5 space-y-3 tab-enter">
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
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 uppercase">{t.chain_id}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--soft)] border hairline text-dim">{t.status}</span>
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
      {aiModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md p-4 grid place-items-center" onClick={() => setAiModal(null)}>
            <div className="panel rounded-[28px] max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                  <span>
                    {isFa ? `تحلیل هوشمند AI برای ${aiModal.token.baseToken.symbol}` : `AI Analysis: ${aiModal.token.baseToken.symbol}`}
                  </span>
                </h3>
                <button type="button" onClick={() => setAiModal(null)} className="btn-ghost p-1.5 rounded-xl text-xs">
                  <X className="w-4 h-4" />
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
                      className="btn-gold flex-1 py-2.5 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-4 h-4" />
                      <span>{isFa ? 'خرید غیرحضانتی در Trust Wallet' : 'Swap in Trust Wallet'}</span>
                    </a>
                    <button type="button" onClick={() => setAiModal(null)} className="btn-ghost px-4 py-2.5 rounded-2xl text-xs font-bold">
                      {isFa ? 'بستن' : 'Close'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Multi-DApp & Anti-Rug Safety Modal */}
      {dappModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto"
            onClick={() => setDappModal(null)}
          >
            <div className="panel rounded-[28px] max-w-xl w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-jade" />
                  <span>
                    {dappModal.token.baseToken.symbol} ({dappModal.token.chainId.toUpperCase()}) —{' '}
                    {isFa ? 'اسکن ضدراگ و برترین DAppها' : 'Anti-Rug & Top DApps'}
                  </span>
                </h3>
                <button type="button" onClick={() => setDappModal(null)} className="btn-ghost p-1.5 rounded-xl text-xs">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {dappModal.loading ? (
                <p className="text-xs text-dim py-8 text-center">
                  {isFa
                    ? 'در حال استعلام قرارداد از GoPlus، Honeypot.is، RugCheck و ساخت مسیرهای DApp...'
                    : 'Running deep anti-rug scan & building DApp routes...'}
                </p>
              ) : (
                <>
                  {dappModal.safety && (
                    <div className="surface-soft rounded-2xl p-4 space-y-2.5 border border-[var(--border)]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-main">
                          {isFa ? 'گزارش امنیتی ضدراگ و هانی‌پات' : 'Anti-Rug & Honeypot Audit'}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                            dappModal.safety.verdict === 'SAFE'
                              ? 'bg-emerald-500/15 text-jade'
                              : dappModal.safety.verdict === 'CAUTION'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-rose-500/15 text-loss'
                          }`}
                        >
                          {dappModal.safety.safetyScore}/100 ({dappModal.safety.verdict})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-center">
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'هانی‌پات' : 'Honeypot'}</span>
                          <strong className={dappModal.safety.isHoneypot ? 'text-loss' : 'text-jade'}>
                            {dappModal.safety.isHoneypot ? (isFa ? 'بله ⚠️' : 'YES') : isFa ? 'سالم ✓' : 'NO'}
                          </strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'مالیات خرید/فروش' : 'Buy/Sell Tax'}</span>
                          <strong dir="ltr">
                            {dappModal.safety.buyTaxPct}% / {dappModal.safety.sellTaxPct}%
                          </strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'قفل استخر LP' : 'LP Lock'}</span>
                          <strong className={dappModal.safety.lpLockedOrBurned ? 'text-jade' : 'text-amber-400'}>
                            {dappModal.safety.lpLockedOrBurned ? (isFa ? 'تایید ✓' : 'Locked') : isFa ? 'نامشخص' : 'Unverified'}
                          </strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'تمرکز ۱۰ هولدر' : 'Top 10'}</span>
                          <strong dir="ltr">{dappModal.safety.top10HoldersPct}%</strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'سن توکن' : 'Token Age'}</span>
                          <strong dir="ltr" className={dappModal.safety.tokenAgeHours != null && dappModal.safety.tokenAgeHours < 6 ? 'text-loss' : 'text-main'}>
                            {dappModal.safety.tokenAgeHours == null
                              ? '—'
                              : dappModal.safety.tokenAgeHours < 24
                                ? `${dappModal.safety.tokenAgeHours}h`
                                : `${Math.round(dappModal.safety.tokenAgeHours / 24)}d`}
                          </strong>
                        </div>
                      </div>
                      {dappModal.safety.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {dappModal.safety.flags.map((f) => (
                            <span key={f} className="px-2 py-0.5 rounded-lg bg-rose-500/12 text-loss text-[10px]">
                              ⚠️ {f}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-dim">
                        {isFa ? 'منابع بررسی:' : 'Sources:'} {dappModal.safety.sourcesUsed.join(' · ')}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-black text-main">
                      {isFa ? 'مسیرهای مستقیم خرید در برترین DAppهای Trust Wallet:' : 'Direct Trust Wallet DApp Swap Routes:'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {dappModal.routes.map((rt) => (
                        <a
                          key={rt.id}
                          href={rt.trustWalletDappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="surface-soft hover:border-brand/50 border border-[var(--border)] rounded-2xl p-3 flex items-center justify-between gap-2 transition"
                        >
                          <div>
                            <div className="font-black text-xs text-main">{rt.name}</div>
                            <div className="text-[10px] text-jade">{rt.badge}</div>
                          </div>
                          <span className="btn-gold px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1">
                            <span>{isFa ? 'Trust Wallet' : 'Open'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
