import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Bot,
  CheckCircle2,
  ExternalLink,
  Flame,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { ChainLogo } from './BrandLogos';
import { CoinIcon } from './CoinIcon';
import { ProDropdown, SlidingSwitch } from './ProDropdown';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import { executeLiveSwapInDapp, hasAnyInjectedWallet } from '../lib/trustwallet';
import type { AuthUserInfo, MultiDappRouteItem, TokenRugSafetyReport } from '../lib/types';

export interface DexTokenCardItem {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string | null;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url?: string; label?: string }>;
    socials?: Array<{ type?: string; platform?: string; handle?: string; url?: string }>;
  };
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

interface DexComboFilters {
  liqMin: string;
  liqMax: string;
  volMin: string;
  volMax: string;
  fdvMin: string;
  fdvMax: string;
  ch1Min: string;
  ch1Max: string;
  ch24Min: string;
  ch24Max: string;
  ageMinH: string;
  ageMaxH: string;
  minBuys: string;
  minSafety: number;
  hideHighRisk: boolean;
  requireSocial: boolean;
}

const DEFAULT_DEX_FILTERS: DexComboFilters = {
  liqMin: '',
  liqMax: '',
  volMin: '',
  volMax: '',
  fdvMin: '',
  fdvMax: '',
  ch1Min: '',
  ch1Max: '',
  ch24Min: '',
  ch24Max: '',
  ageMinH: '',
  ageMaxH: '',
  minBuys: '',
  minSafety: 0,
  hideHighRisk: false,
  requireSocial: false,
};

type DexSortKey = 'hot' | 'vol_desc' | 'liq_desc' | 'ch1_desc' | 'ch24_desc' | 'ch5_desc' | 'safety_desc' | 'age_asc' | 'txns_desc';

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

const ALLOWED_DEX_CHAINS = new Set([
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
]);

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

export function DexScreenerRadarPanel({
  lang,
  user,
  onTradeRecorded,
}: {
  lang: Lang;
  user?: AuthUserInfo | null;
  onTradeRecorded?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [filters, setFilters] = useState<DexComboFilters>(DEFAULT_DEX_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<DexSortKey>('hot');
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<DexTokenCardItem[]>([]);
  const [loadingDex, setLoadingDex] = useState(false);
  const [tradeAmtUsd, setTradeAmtUsd] = useState(50);
  const [usePresetSize, setUsePresetSize] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);
  const [directBuyingKey, setDirectBuyingKey] = useState<string | null>(null);

  const [aiModal, setAiModal] = useState<{
    token: DexTokenCardItem;
    analysis: string;
    verdict?: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID';
    verdictLabel?: string;
    confidencePct?: number;
    reasons?: string[];
    levels?: { entryUsd: number; stopLossUsd: number; tp1Usd: number };
    loading: boolean;
  } | null>(null);

  const [dappModal, setDappModal] = useState<{
    token: DexTokenCardItem;
    loading: boolean;
    routes: MultiDappRouteItem[];
    listedCount?: number;
    listedNames?: string[];
    safety: TokenRugSafetyReport | null;
  } | null>(null);

  const fetchPublicDexFallback = useCallback(async (searchQuery?: string): Promise<DexTokenCardItem[]> => {
    const buildItem = (p: {
      chainId?: string;
      dexId?: string;
      url?: string;
      pairAddress?: string;
      baseToken?: { address?: string; name?: string; symbol?: string };
      quoteToken?: { address?: string; name?: string; symbol?: string };
      priceUsd?: string | null;
      info?: {
        imageUrl?: string;
        websites?: Array<{ url?: string; label?: string }>;
        socials?: Array<{ type?: string; platform?: string; handle?: string; url?: string }>;
      };
      volume?: { h24?: number };
      priceChange?: { m5?: number; h1?: number; h24?: number };
      txns?: DexTokenCardItem['txns'];
      pairCreatedAt?: number | null;
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
      if (p.info?.websites?.length || p.info?.socials?.length) {
        safetyScore += 8;
      } else {
        riskFlags.push('فاقد لینک وب‌سایت/شبکه اجتماعی تاییدشده');
      }
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
        txns: p.txns,
        pairCreatedAt: p.pairCreatedAt ? Number(p.pairCreatedAt) : undefined,
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
        if (items.length > 0) return items.slice(0, 48);
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
              pool_created_at?: string;
              volume_usd?: { h24?: string };
              price_change_percentage?: { h24?: string; h1?: string; m5?: string };
              transactions?: Record<string, { buys?: number; sells?: number }>;
              fdv_usd?: string;
            };
            relationships?: { base_token?: { data?: { id?: string } }; network?: { data?: { id?: string } } };
          }>;
          included?: Array<{ id: string; attributes?: { address?: string; name?: string; symbol?: string; image_url?: string } }>;
        };
        const inc = new Map((gj.included || []).map((i) => [i.id, i.attributes]));
        const out: DexTokenCardItem[] = [];
        for (const p of (gj.data || []).slice(0, 48)) {
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
            txns: {
              h1: {
                buys: Number(a.transactions?.h1?.buys || 0),
                sells: Number(a.transactions?.h1?.sells || 0),
              },
              h24: {
                buys: Number(a.transactions?.h24?.buys || 0),
                sells: Number(a.transactions?.h24?.sells || 0),
              },
            },
            pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
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
    try {
      const res = await apiFetch<{ trending?: DexTokenCardItem[]; pairs?: DexTokenCardItem[] }>('/api/dex/trending');
      const list = res.trending || res.pairs || [];
      setTokens(list.length > 0 ? list : await fetchPublicDexFallback());
    } catch {
      const fb = await fetchPublicDexFallback();
      if (fb.length > 0) setTokens(fb);
      else pushFloatingToast(isFa ? 'دریافت داده DEX موقتاً با اختلال مواجه شد.' : 'DexScreener load failed', 'error');
    } finally {
      setLoadingDex(false);
    }
  }, [fetchPublicDexFallback, isFa]);

  useEffect(() => {
    void loadTrending();
  }, [loadTrending]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      await loadTrending();
      return;
    }
    setLoadingDex(true);
    try {
      const res = await apiFetch<{ pairs?: DexTokenCardItem[]; results?: DexTokenCardItem[] }>(
        `/api/dex/search?q=${encodeURIComponent(query.trim())}`
      );
      const list = res.pairs || res.results || [];
      setTokens(list.length > 0 ? list : await fetchPublicDexFallback(query.trim()));
    } catch {
      const fb = await fetchPublicDexFallback(query.trim());
      if (fb.length > 0) setTokens(fb);
      else pushFloatingToast(isFa ? 'جستجو در شبکه DEX ناموفق بود.' : 'Search failed', 'error');
    } finally {
      setLoadingDex(false);
    }
  };

  const openDappSafetyModal = async (t: DexTokenCardItem) => {
    setDappModal({ token: t, loading: true, routes: [], safety: null });
    try {
      const [routesRes, safetyRes] = await Promise.all([
        apiFetch<{ routes: MultiDappRouteItem[]; listedCount?: number; listedNames?: string[] }>(
          `/api/dex/routes?chainId=${encodeURIComponent(t.chainId)}&tokenAddress=${encodeURIComponent(t.baseToken.address)}`
        ).catch(() => ({ routes: [], listedCount: 0, listedNames: [] })),
        apiFetch<{ report: TokenRugSafetyReport }>(
          `/api/dex/safety?chainId=${encodeURIComponent(t.chainId)}&tokenAddress=${encodeURIComponent(t.baseToken.address)}`
        ).catch(() => ({ report: null })),
      ]);
      const sortedRoutes = [...(routesRes.routes || [])].sort((a, b) => {
        const rank = (s?: string) => (s === 'DIRECT_POOL' ? 0 : s === 'AGGREGATOR' ? 1 : s === 'CHART' ? 2 : 3);
        return rank(a.listedStatus) - rank(b.listedStatus);
      });
      setDappModal({
        token: t,
        loading: false,
        routes: sortedRoutes,
        listedCount: routesRes.listedCount,
        listedNames: routesRes.listedNames,
        safety: safetyRes.report || null,
      });
    } catch {
      setDappModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  const handleAiAnalyze = async (t: DexTokenCardItem) => {
    setAiModal({ token: t, analysis: '', loading: true });
    try {
      const res = await apiFetch<{
        analysis: string;
        verdict?: 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID';
        verdictLabel?: string;
        confidencePct?: number;
        reasons?: string[];
        suggestedLevels?: { entryUsd: number; stopLossUsd: number; tp1Usd: number };
      }>('/api/dex/ai-analyze', {
        method: 'POST',
        body: JSON.stringify({
          chainId: t.chainId,
          tokenAddress: t.baseToken.address,
          query: t.baseToken.symbol,
          lang,
          tokenSnapshot: {
            chainId: t.chainId,
            dexId: t.dexId,
            url: t.url,
            pairAddress: t.pairAddress,
            baseToken: t.baseToken,
            quoteToken: t.quoteToken,
            priceUsd: t.priceUsd,
            liquidity: t.liquidity,
            volume: t.volume,
            priceChange: t.priceChange,
            txns: t.txns,
            pairCreatedAt: t.pairCreatedAt,
            fdv: t.fdv,
            safetyScore: t.safetyScore,
            riskFlags: t.riskFlags,
          },
        }),
      });
      setAiModal({
        token: t,
        analysis: res.analysis,
        verdict: res.verdict,
        verdictLabel: res.verdictLabel,
        confidencePct: res.confidencePct,
        reasons: res.reasons,
        levels: res.suggestedLevels,
        loading: false,
      });
    } catch (e) {
      setAiModal({
        token: t,
        analysis: e instanceof Error ? e.message : 'AI analysis failed',
        loading: false,
      });
    }
  };

  const handleDirectSiteBuy = async (t: DexTokenCardItem) => {
    const key = `${t.chainId}:${t.baseToken.address}`;
    setDirectBuyingKey(key);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        needsWalletSign?: boolean;
        mode?: 'PAPER' | 'LIVE';
        tradeId?: string;
        amountUsd?: number;
        tpPct?: number;
        slPct?: number;
        trustWallet?: { trustWalletDappUrl: string };
        error?: string;
      }>('/api/dex/direct-buy', {
        method: 'POST',
        body: JSON.stringify({
          chainId: t.chainId,
          dexId: t.dexId,
          pairAddress: t.pairAddress,
          tokenAddress: t.baseToken.address,
          tokenSymbol: t.baseToken.symbol,
          quoteSymbol: t.quoteToken.symbol,
          amountUsd: usePresetSize ? undefined : tradeAmtUsd,
          entryPriceUsd: Number(t.priceUsd || 0),
        }),
      });
      if (res.ok) {
        pushFloatingToast(
          isFa
            ? `خرید مستقیم ${t.baseToken.symbol} با حجم $${res.amountUsd ?? tradeAmtUsd} انجام شد (TP +${res.tpPct ?? 35}% / SL -${res.slPct ?? 15}%)`
            : `Direct buy ${t.baseToken.symbol} ($${res.amountUsd ?? tradeAmtUsd}) executed`,
          'success'
        );
        await onTradeRecorded?.();
        return;
      }
      if (res.needsWalletSign) {
        if (hasAnyInjectedWallet()) {
          const swapRes = await executeLiveSwapInDapp({
            chainId: t.chainId,
            tokenAddress: t.baseToken.address,
            amountUsd: res.amountUsd ?? tradeAmtUsd,
            fallbackEvmAddress: user?.trust_wallet_address || null,
            fallbackSolAddress: user?.trust_wallet_solana || null,
          });
          if (swapRes.mode === 'ONCHAIN_TX' && swapRes.txHash) {
            await apiFetch('/api/dex/direct-buy', {
              method: 'POST',
              body: JSON.stringify({
                chainId: t.chainId,
                dexId: t.dexId,
                pairAddress: t.pairAddress,
                tokenAddress: t.baseToken.address,
                tokenSymbol: t.baseToken.symbol,
                quoteSymbol: t.quoteToken.symbol,
                amountUsd: res.amountUsd ?? tradeAmtUsd,
                entryPriceUsd: Number(t.priceUsd || 0),
                txHash: swapRes.txHash,
              }),
            });
            pushFloatingToast(
              isFa ? `خرید مستقیم آن‌چین ${t.baseToken.symbol} انجام شد.` : `Direct on-chain buy ${t.baseToken.symbol} executed.`,
              'success'
            );
            await onTradeRecorded?.();
            return;
          }
        }
        pushFloatingToast(res.error || (isFa ? 'برای خرید واقعی تراکنش را داخل Trust Wallet امضا کنید.' : 'Confirm swap in Trust Wallet'), 'info');
        if (res.trustWallet?.trustWalletDappUrl) {
          window.open(res.trustWallet.trustWalletDappUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : isFa ? 'خرید مستقیم ناموفق بود.' : 'Direct buy failed', 'error');
    } finally {
      setDirectBuyingKey(null);
    }
  };

  const handleTrackDexTrade = async (t: DexTokenCardItem, openDapp: boolean) => {
    try {
      if (openDapp && hasAnyInjectedWallet()) {
        setWalletBusy(true);
        try {
          const swapRes = await executeLiveSwapInDapp({
            chainId: t.chainId,
            tokenAddress: t.baseToken.address,
            amountUsd: tradeAmtUsd,
            fallbackEvmAddress: user?.trust_wallet_address || null,
            fallbackSolAddress: user?.trust_wallet_solana || null,
          });
          if (swapRes.mode === 'ONCHAIN_TX' && swapRes.txHash) {
            const rec = await apiFetch<{ tradeId: string }>('/api/trustwallet/dex-trades', {
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
                txHash: swapRes.txHash,
              }),
            });
            pushFloatingToast(
              isFa
                ? `سوآپ واقعی ${t.baseToken.symbol} انجام و در پورتفوی کیف‌پول ثبت شد (#${rec.tradeId})`
                : `Live on-chain swap recorded (#${rec.tradeId})`,
              'success'
            );
            await onTradeRecorded?.();
            return;
          }
        } finally {
          setWalletBusy(false);
        }
      }

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
      pushFloatingToast(
        isFa
          ? `موقعیت ${t.baseToken.symbol} با حجم $${tradeAmtUsd} در کیف‌پول و لیست معاملات باز شما ثبت شد.`
          : `Tracked ${t.baseToken.symbol} ($${tradeAmtUsd}) in Wallet & Open Positions.`,
        'success'
      );
      await onTradeRecorded?.();
      if (openDapp) {
        window.open(res.trustWallet?.trustWalletDappUrl || t.trustWallet.trustWalletDappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Failed to record trade', 'error');
    }
  };

  const dynamicChainFilters = Array.from(
    new Set([
      ...BASE_CHAIN_FILTERS.filter((c) => c !== 'all'),
      ...tokens.map((t) => t.chainId.toLowerCase()).filter((c) => Boolean(c) && ALLOWED_DEX_CHAINS.has(c)),
    ])
  );

  const toggleChain = (chainId: string) => {
    setSelectedChains((prev) =>
      prev.includes(chainId) ? prev.filter((x) => x !== chainId) : [...prev, chainId]
    );
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedChains.length > 0) n++;
    if (filters.liqMin || filters.liqMax) n++;
    if (filters.volMin || filters.volMax) n++;
    if (filters.fdvMin || filters.fdvMax) n++;
    if (filters.ch1Min || filters.ch1Max) n++;
    if (filters.ch24Min || filters.ch24Max) n++;
    if (filters.ageMinH || filters.ageMaxH) n++;
    if (filters.minBuys) n++;
    if (filters.minSafety > 0) n++;
    if (filters.hideHighRisk) n++;
    if (filters.requireSocial) n++;
    return n;
  }, [filters, selectedChains]);

  const resetAllFilters = () => {
    setSelectedChains([]);
    setFilters(DEFAULT_DEX_FILTERS);
    setSortBy('hot');
  };

  const visibleTokens = useMemo(() => {
    const parseOpt = (s: string): number | null => {
      const t = s.trim();
      if (!t) return null;
      const v = Number(t);
      return Number.isFinite(v) ? v : null;
    };
    const liqMin = parseOpt(filters.liqMin);
    const liqMax = parseOpt(filters.liqMax);
    const volMin = parseOpt(filters.volMin);
    const volMax = parseOpt(filters.volMax);
    const fdvMin = parseOpt(filters.fdvMin);
    const fdvMax = parseOpt(filters.fdvMax);
    const ch1Min = parseOpt(filters.ch1Min);
    const ch1Max = parseOpt(filters.ch1Max);
    const ch24Min = parseOpt(filters.ch24Min);
    const ch24Max = parseOpt(filters.ch24Max);
    const ageMinH = parseOpt(filters.ageMinH);
    const ageMaxH = parseOpt(filters.ageMaxH);
    const minBuys = parseOpt(filters.minBuys);
    const now = Date.now();

    const filtered = tokens.filter((t) => {
      const cid = t.chainId.toLowerCase();
      if (!ALLOWED_DEX_CHAINS.has(cid)) return false;
      if (selectedChains.length > 0 && !selectedChains.includes(cid)) return false;

      const liq = Number(t.liquidity?.usd || 0);
      const vol = Number(t.volume?.h24 || 0);
      const fdv = Number(t.fdv || 0);
      const ch1 = Number(t.priceChange?.h1 || 0);
      const ch24 = Number(t.priceChange?.h24 || 0);
      const buys = Number(t.txns?.h1?.buys || t.txns?.h24?.buys || t.txns?.m5?.buys || 0);

      if (liqMin !== null && liq < liqMin) return false;
      if (liqMax !== null && liq > liqMax) return false;
      if (volMin !== null && vol < volMin) return false;
      if (volMax !== null && vol > volMax) return false;
      if (fdvMin !== null && fdv < fdvMin) return false;
      if (fdvMax !== null && fdv > fdvMax) return false;
      if (ch1Min !== null && ch1 < ch1Min) return false;
      if (ch1Max !== null && ch1 > ch1Max) return false;
      if (ch24Min !== null && ch24 < ch24Min) return false;
      if (ch24Max !== null && ch24 > ch24Max) return false;
      if (minBuys !== null && buys < minBuys) return false;

      if (ageMinH !== null || ageMaxH !== null) {
        if (!t.pairCreatedAt || t.pairCreatedAt <= 0) return false;
        const ageH = Math.max(0, (now - Number(t.pairCreatedAt)) / 3_600_000);
        if (ageMinH !== null && ageH < ageMinH) return false;
        if (ageMaxH !== null && ageH > ageMaxH) return false;
      }

      if (filters.minSafety > 0 && t.safetyScore < filters.minSafety) return false;
      if (filters.hideHighRisk && t.safetyScore < 45) return false;
      if (filters.requireSocial) {
        const hasInfoLinks = Boolean(t.info?.websites?.length || t.info?.socials?.length);
        const missingFlag = t.riskFlags.some((f) => f.includes('فاقد لینک'));
        if (!hasInfoLinks && missingFlag) return false;
        if (!hasInfoLinks && !t.info) return false;
      }
      return true;
    });

    if (sortBy === 'hot') return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'vol_desc') return Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0);
      if (sortBy === 'liq_desc') return Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);
      if (sortBy === 'ch1_desc') return Number(b.priceChange?.h1 || 0) - Number(a.priceChange?.h1 || 0);
      if (sortBy === 'ch24_desc') return Number(b.priceChange?.h24 || 0) - Number(a.priceChange?.h24 || 0);
      if (sortBy === 'ch5_desc') return Number(b.priceChange?.m5 || 0) - Number(a.priceChange?.m5 || 0);
      if (sortBy === 'safety_desc') return b.safetyScore - a.safetyScore;
      if (sortBy === 'age_asc') {
        const ta = Number(a.pairCreatedAt || 0);
        const tb = Number(b.pairCreatedAt || 0);
        return tb - ta;
      }
      if (sortBy === 'txns_desc') {
        const txA = Number(a.txns?.h1?.buys || 0) + Number(a.txns?.h1?.sells || 0) + Number(a.txns?.h24?.buys || 0);
        const txB = Number(b.txns?.h1?.buys || 0) + Number(b.txns?.h1?.sells || 0) + Number(b.txns?.h24?.buys || 0);
        return txB - txA;
      }
      return 0;
    });
  }, [tokens, selectedChains, filters, sortBy]);

  return (
    <div className="space-y-4">
      {/* Compact Anti-Rug Info Strip */}
      <div className="panel rounded-3xl p-4 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-emerald-500/12 text-jade flex items-center justify-center shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0 space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">
              {isFa ? `رادار کامل DexScreener (${visibleTokens.length} از ${tokens.length} توکن)` : `DexScreener Radar (${visibleTokens.length}/${tokens.length})`}
            </span>
            <span className="text-[11px] font-bold text-jade">{isFa ? 'امتیاز ۷۵+ = ایمن' : '75+ SAFE'}</span>
            <span className="text-[11px] font-bold text-amber-400">{isFa ? '۴۵–۷۴ = احتیاط' : '45-74 CAUTION'}</span>
            <span className="text-[11px] font-bold text-loss">{isFa ? 'زیر ۴۵ = ریسک بالا' : '<45 RISK'}</span>
          </div>
          <p className="text-dim leading-relaxed">
            {isFa
              ? 'فیلتر ترکیبی چندشبکه‌ای شبیه DexScreener (نقدینگی، حجم، سن، پامپ ۱س/۲۴س و امنیت ضدراگ) + تحلیل پیشنهاد خرید AI و خرید مستقیم در سایت.'
              : 'Full DexScreener-style multi-condition combo filters (liquidity, 24h vol, age, % gainers, safety) + AI verdict & 1-click direct buy.'}
          </p>
        </div>
      </div>

      {/* Unified Modern DexScreener Filter & Search Toolbar */}
      <div className="panel rounded-3xl p-4 sm:p-5 space-y-3.5 border hairline shadow-sm">
        {/* Row 1: Search + Hot Refresh + Combo Filters Toggle + Sort Dropdown */}
        <form onSubmit={(e) => void handleSearch(e)} className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-dim absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isFa ? 'جستجو با نام توکن (PEPE, AERO) یا آدرس کامل کانترکت (0x...)' : 'Search symbol or contract address...'}
              className="input-field h-10 ps-10 pe-3 rounded-xl text-xs w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={loadingDex} className="btn-cobalt h-10 px-4 rounded-xl text-xs font-black shrink-0">
              {loadingDex ? '...' : isFa ? 'جستجو' : 'Search'}
            </button>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                void loadTrending();
              }}
              className="h-10 px-3.5 rounded-xl border hairline surface-soft hover:border-[var(--line-strong)] text-xs font-bold text-main inline-flex items-center gap-1.5 transition shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand ${loadingDex ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'توکن‌های داغ' : 'Trending'}</span>
            </button>

            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`h-10 px-3.5 rounded-xl text-xs font-black inline-flex items-center gap-2 border transition shrink-0 ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                  : 'surface-soft hairline text-main hover:border-[var(--line-strong)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isFa ? 'فیلتر ترکیبی' : 'Filters'}</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-num">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <ProDropdown
              value={sortBy}
              icon={<ArrowUpDown className="w-3.5 h-3.5 text-[var(--gold)]" />}
              onChange={(v) => setSortBy(v as DexSortKey)}
              align="end"
              menuMinWidthClass="min-w-[230px]"
              options={[
                { value: 'hot', label: isFa ? 'مرتب‌سازی: داغ‌ترین بازار' : 'Sort: Trending Hot' },
                { value: 'vol_desc', label: isFa ? 'بیشترین حجم ۲۴ ساعته' : 'Highest 24h Volume' },
                { value: 'liq_desc', label: isFa ? 'بیشترین نقدینگی استخر' : 'Highest Liquidity' },
                { value: 'ch1_desc', label: isFa ? 'بیشترین رشد ۱ ساعته (%)' : 'Top 1h Gainers' },
                { value: 'ch24_desc', label: isFa ? 'بیشترین رشد ۲۴ ساعته (%)' : 'Top 24h Gainers' },
                { value: 'ch5_desc', label: isFa ? 'بیشترین رشد ۵ دقیقه (%)' : 'Top 5m Gainers' },
                { value: 'safety_desc', label: isFa ? 'بالاترین امتیاز ضدراگ' : 'Highest Safety Score' },
                { value: 'age_asc', label: isFa ? 'تازه‌لیست‌ترین استخرها' : 'Newest Pairs' },
                { value: 'txns_desc', label: isFa ? 'بیشترین تعداد تراکنش' : 'Most Transactions' },
              ]}
            />
          </div>
        </form>

        {/* Row 2: Quick DexScreener Combo Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black text-dim inline-flex items-center gap-1 me-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>{isFa ? 'فیلتر سریع:' : 'Quick:'}</span>
          </span>
          {[
            {
              id: 'all',
              label: isFa ? 'همه توکن‌ها' : 'All Tokens',
              active: activeFilterCount === 0,
              onClick: resetAllFilters,
            },
            {
              id: 'gainers_1h',
              label: isFa ? 'پامپ ۱س (۱۰٪+)' : '1h Gainers (+10%)',
              active: filters.ch1Min === '10',
              onClick: () =>
                setFilters((f) => ({ ...f, ch1Min: f.ch1Min === '10' ? '' : '10' })),
            },
            {
              id: 'safe_liq',
              label: isFa ? 'نقدینگی بالای $100K' : 'Liq >$100K',
              active: filters.liqMin === '100000',
              onClick: () =>
                setFilters((f) => ({ ...f, liqMin: f.liqMin === '100000' ? '' : '100000' })),
            },
            {
              id: 'hot_vol',
              label: isFa ? 'حجم داغ بالای $250K' : 'Vol >$250K',
              active: filters.volMin === '250000',
              onClick: () =>
                setFilters((f) => ({ ...f, volMin: f.volMin === '250000' ? '' : '250000' })),
            },
            {
              id: 'fresh_24h',
              label: isFa ? 'تازه‌لیست (زیر ۲۴ ساعت)' : 'Fresh (<24h)',
              active: filters.ageMaxH === '24',
              onClick: () =>
                setFilters((f) => ({ ...f, ageMaxH: f.ageMaxH === '24' ? '' : '24' })),
            },
            {
              id: 'safe_75',
              label: isFa ? 'ایمن ضدراگ (۷۵+)' : 'Safe (75+)',
              active: filters.minSafety === 75,
              onClick: () =>
                setFilters((f) => ({
                  ...f,
                  minSafety: f.minSafety === 75 ? 0 : 75,
                  hideHighRisk: f.minSafety !== 75,
                })),
            },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={p.onClick}
              className={`h-7 px-2.5 rounded-lg text-[10.5px] font-black transition border ${
                p.active
                  ? 'bg-emerald-500/15 border-emerald-500/45 text-jade'
                  : 'surface-soft hairline text-dim hover:text-main hover:border-[var(--line-strong)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Row 3: Multi-Select Chain Pills + Preset Trade Size */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t hairline">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedChains([])}
              className={`h-8 px-3 rounded-xl text-[11px] font-black transition border ${
                selectedChains.length === 0
                  ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              {isFa ? 'همه شبکه‌ها' : 'All Chains'}
            </button>
            {dynamicChainFilters.map((c) => {
              const active = selectedChains.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChain(c)}
                  className={`h-8 px-2.5 rounded-xl text-[11px] font-black uppercase transition inline-flex items-center gap-1.5 border ${
                    active
                      ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-sm'
                      : 'surface-soft hairline text-dim hover:text-main hover:border-[var(--line-strong)]'
                  }`}
                >
                  <ChainLogo chain={c} size={13} />
                  <span>{c}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setUsePresetSize((v) => !v)}
              className={`h-8 px-3 rounded-xl text-[11px] font-bold border transition ${
                usePresetSize
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-jade'
                  : 'surface-soft hairline text-dim hover:text-main'
              }`}
            >
              {usePresetSize
                ? isFa
                  ? 'حجم خرید: از تنظیمات سایت'
                  : 'Size: Preset Config'
                : isFa
                  ? 'حجم خرید دستی:'
                  : 'Custom Size:'}
            </button>
            {!usePresetSize && (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="number"
                  min={5}
                  value={tradeAmtUsd}
                  onChange={(e) => setTradeAmtUsd(Math.max(5, Number(e.target.value || 50)))}
                  dir="ltr"
                  className="input-field w-20 h-8 px-2 rounded-xl text-xs text-center font-num"
                />
                <span className="font-bold text-main text-[11px]">USDT</span>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible DexScreener-Grade Multi-Condition Combo Filter Panel */}
        {filtersOpen && (
          <div className="pt-3 border-t hairline space-y-3 tab-enter">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Liquidity ($) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'نقدینگی استخر ($)' : 'Liquidity ($)'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {['10000', '50000', '250000'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, liqMin: f.liqMin === v ? '' : v }))}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                          filters.liqMin === v ? 'bg-[#0D47A1] text-white' : 'panel text-dim hover:text-main'
                        }`}
                      >
                        &gt;{Number(v) / 1000}K
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.liqMin}
                    onChange={(e) => setFilters((f) => ({ ...f, liqMin: e.target.value }))}
                    placeholder={isFa ? 'حداقل $' : 'Min $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.liqMax}
                    onChange={(e) => setFilters((f) => ({ ...f, liqMax: e.target.value }))}
                    placeholder={isFa ? 'حداکثر $' : 'Max $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* 24h Volume ($) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'حجم ۲۴ ساعته ($)' : '24h Volume ($)'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {['25000', '100000', '1000000'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, volMin: f.volMin === v ? '' : v }))}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                          filters.volMin === v ? 'bg-[#0D47A1] text-white' : 'panel text-dim hover:text-main'
                        }`}
                      >
                        &gt;{Number(v) >= 1000000 ? '1M' : `${Number(v) / 1000}K`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.volMin}
                    onChange={(e) => setFilters((f) => ({ ...f, volMin: e.target.value }))}
                    placeholder={isFa ? 'حداقل $' : 'Min $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.volMax}
                    onChange={(e) => setFilters((f) => ({ ...f, volMax: e.target.value }))}
                    placeholder={isFa ? 'حداکثر $' : 'Max $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* FDV / Market Cap ($) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'ارزش کل FDV ($)' : 'FDV / Market Cap ($)'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {['100000', '1000000'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, fdvMin: f.fdvMin === v ? '' : v }))}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                          filters.fdvMin === v ? 'bg-[#0D47A1] text-white' : 'panel text-dim hover:text-main'
                        }`}
                      >
                        &gt;{Number(v) >= 1000000 ? '1M' : '100K'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.fdvMin}
                    onChange={(e) => setFilters((f) => ({ ...f, fdvMin: e.target.value }))}
                    placeholder={isFa ? 'حداقل $' : 'Min $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.fdvMax}
                    onChange={(e) => setFilters((f) => ({ ...f, fdvMax: e.target.value }))}
                    placeholder={isFa ? 'حداکثر $' : 'Max $'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* Pair Age (Hours) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'سن استخر (ساعت)' : 'Pair Age (Hours)'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {[
                      { l: '<6h', max: '6', min: '' },
                      { l: '<24h', max: '24', min: '' },
                      { l: '>7d', max: '', min: '168' },
                    ].map((x) => {
                      const act = filters.ageMaxH === x.max && filters.ageMinH === x.min;
                      return (
                        <button
                          key={x.l}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              ageMaxH: act ? '' : x.max,
                              ageMinH: act ? '' : x.min,
                            }))
                          }
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                            act ? 'bg-[#0D47A1] text-white' : 'panel text-dim hover:text-main'
                          }`}
                        >
                          {x.l}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ageMinH}
                    onChange={(e) => setFilters((f) => ({ ...f, ageMinH: e.target.value }))}
                    placeholder={isFa ? 'حداقل h' : 'Min h'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ageMaxH}
                    onChange={(e) => setFilters((f) => ({ ...f, ageMaxH: e.target.value }))}
                    placeholder={isFa ? 'حداکثر h' : 'Max h'}
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* 1h Change (%) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'تغییر قیمت ۱ ساعته (%)' : '1h Change (%)'}</span>
                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, ch1Min: f.ch1Min === '0' ? '' : '0' }))}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                      filters.ch1Min === '0' ? 'bg-[#059669] text-white' : 'panel text-dim hover:text-main'
                    }`}
                  >
                    {isFa ? 'فقط مثبت' : '>0%'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ch1Min}
                    onChange={(e) => setFilters((f) => ({ ...f, ch1Min: e.target.value }))}
                    placeholder="Min %"
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ch1Max}
                    onChange={(e) => setFilters((f) => ({ ...f, ch1Max: e.target.value }))}
                    placeholder="Max %"
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* 24h Change (%) */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'تغییر قیمت ۲۴ ساعته (%)' : '24h Change (%)'}</span>
                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, ch24Min: f.ch24Min === '0' ? '' : '0' }))}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                      filters.ch24Min === '0' ? 'bg-[#059669] text-white' : 'panel text-dim hover:text-main'
                    }`}
                  >
                    {isFa ? 'فقط مثبت' : '>0%'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ch24Min}
                    onChange={(e) => setFilters((f) => ({ ...f, ch24Min: e.target.value }))}
                    placeholder="Min %"
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                  <input
                    type="number"
                    dir="ltr"
                    value={filters.ch24Max}
                    onChange={(e) => setFilters((f) => ({ ...f, ch24Max: e.target.value }))}
                    placeholder="Max %"
                    className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num"
                  />
                </div>
              </div>

              {/* Min Buys / Activity */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'حداقل تراکنش خرید' : 'Min Buys'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {['20', '100', '300'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, minBuys: f.minBuys === v ? '' : v }))}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                          filters.minBuys === v ? 'bg-[#0D47A1] text-white' : 'panel text-dim hover:text-main'
                        }`}
                      >
                        {v}+
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  dir="ltr"
                  value={filters.minBuys}
                  onChange={(e) => setFilters((f) => ({ ...f, minBuys: e.target.value }))}
                  placeholder={isFa ? 'مثلاً 50 خرید' : 'Min buys (e.g. 50)'}
                  className="input-field h-8 px-2.5 rounded-xl text-[11px] font-num w-full"
                />
              </div>

              {/* Safety Score & Social Toggles */}
              <div className="surface-soft rounded-2xl p-3 border hairline space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-main">{isFa ? 'حداقل امتیاز ضدراگ' : 'Min Safety Score'}</span>
                  <div dir="ltr" className="flex gap-1">
                    {[0, 45, 60, 75].map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setFilters((f) => ({ ...f, minSafety: sc }))}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black font-num ${
                          filters.minSafety === sc ? 'bg-[#059669] text-white' : 'panel text-dim hover:text-main'
                        }`}
                      >
                        {sc === 0 ? (isFa ? 'همه' : 'All') : `${sc}+`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 pt-0.5 text-[10.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sub">{isFa ? 'حذف ریسک بالا (زیر ۴۵)' : 'Hide High Risk'}</span>
                    <SlidingSwitch
                      checked={filters.hideHighRisk}
                      size="sm"
                      accent="emerald"
                      onChange={(val) => setFilters((f) => ({ ...f, hideHighRisk: val }))}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sub">{isFa ? 'دارای وب‌سایت/سوشیال' : 'Has Socials/Web'}</span>
                    <SlidingSwitch
                      checked={filters.requireSocial}
                      size="sm"
                      accent="cobalt"
                      onChange={(val) => setFilters((f) => ({ ...f, requireSocial: val }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">
              <span className="text-dim font-bold">
                {isFa
                  ? `نمایش ${visibleTokens.length} توکن از ${tokens.length} توکن با ترکیب فیلترهای انتخابی`
                  : `Showing ${visibleTokens.length} of ${tokens.length} matching pairs`}
              </span>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-3 py-1 rounded-xl bg-rose-500/12 text-loss font-black hover:bg-rose-500/20 inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isFa ? 'پاک کردن همه فیلترها' : 'Reset All Filters'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Token Cards */}
      {visibleTokens.length === 0 && !loadingDex ? (
        <div className="panel rounded-3xl p-10 text-center space-y-3">
          <p className="text-xs text-dim">
            {isFa ? 'هیچ توکنی با ترکیب فیلترهای فعلی یافت نشد.' : 'No tokens match your combined filters.'}
          </p>
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetAllFilters} className="btn-cobalt px-4 py-2 rounded-xl text-xs font-black">
              {isFa ? 'حذف فیلترهای ترکیبی' : 'Reset Combo Filters'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleTokens.map((t) => {
            const ch24 = Number(t.priceChange?.h24 || 0);
            const ch1 = Number(t.priceChange?.h1 || 0);
            const isUp = ch24 >= 0;
            const safeColor =
              t.safetyScore >= 70 ? 'text-jade bg-emerald-500/15' : t.safetyScore >= 45 ? 'text-amber-400 bg-amber-500/15' : 'text-loss bg-rose-500/15';
            return (
              <div key={`${t.chainId}-${t.pairAddress}`} className="panel rounded-3xl p-4 flex flex-col justify-between gap-3 min-w-0 overflow-hidden">
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

                  <div className="grid grid-cols-3 surface-soft rounded-2xl border hairline divide-x divide-[var(--line)] rtl:divide-x-reverse text-center overflow-hidden">
                    <div className="py-2 px-1">
                      <span className="block text-[10px] text-dim">{isFa ? 'قیمت' : 'Price'}</span>
                      <strong dir="ltr" className="text-xs font-num text-main">{fmtTokenPrice(t.priceUsd)}</strong>
                    </div>
                    <div className="py-2 px-1">
                      <span className="block text-[10px] text-dim">{isFa ? 'نقدینگی' : 'Liquidity'}</span>
                      <strong dir="ltr" className="text-xs font-num text-main">{fmtUsd(t.liquidity?.usd)}</strong>
                    </div>
                    <div className="py-2 px-1">
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
                      {isFa ? 'حجم ۲۴س:' : 'Vol 24h:'} <strong dir="ltr" className="text-main font-num inline-block">{fmtUsd(t.volume?.h24)}</strong>
                    </span>
                    <span>
                      {isFa ? 'سن:' : 'Age:'} <strong className="text-main">{fmtTokenAge(t.pairCreatedAt, isFa)}</strong>
                    </span>
                    <span dir="ltr">1h: {ch1 >= 0 ? '+' : ''}{ch1.toFixed(1)}%</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
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
                    disabled={walletBusy}
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
                    disabled={directBuyingKey === `${t.chainId}:${t.baseToken.address}`}
                    onClick={() => void handleDirectSiteBuy(t)}
                    className="btn-emerald py-1.5 px-2 rounded-xl text-[11px] font-black inline-flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>
                      {directBuyingKey === `${t.chainId}:${t.baseToken.address}`
                        ? '...'
                        : isFa
                          ? 'خرید مستقیم در سایت'
                          : 'Direct Buy Here'}
                    </span>
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

      {/* AI Modal */}
      {aiModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md p-4 grid place-items-center overflow-y-auto" onClick={() => setAiModal(null)}>
            <div className="panel rounded-[28px] max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                  <span>{isFa ? `تحلیل هوشمند و پیشنهاد AI برای ${aiModal.token.baseToken.symbol}` : `AI Analysis: ${aiModal.token.baseToken.symbol}`}</span>
                </h3>
                <button type="button" onClick={() => setAiModal(null)} className="btn-ghost p-1.5 rounded-xl text-xs">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {aiModal.loading ? (
                <p className="text-xs text-dim py-6 text-center">{isFa ? 'در حال تحلیل نقدینگی، مومنتوم و امنیت استخر...' : 'Analyzing...'}</p>
              ) : (
                <>
                  {aiModal.verdict && (
                    <div
                      className={`rounded-2xl p-3.5 border flex items-center justify-between gap-3 ${
                        aiModal.verdict === 'STRONG_BUY'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-jade'
                          : aiModal.verdict === 'BUY'
                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                            : aiModal.verdict === 'WATCH'
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                              : 'bg-rose-500/15 border-rose-500/40 text-loss'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {aiModal.verdict === 'AVOID' ? (
                          <XCircle className="w-5 h-5 shrink-0" />
                        ) : aiModal.verdict === 'WATCH' ? (
                          <AlertTriangle className="w-5 h-5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-black">{aiModal.verdictLabel}</div>
                          {aiModal.reasons && aiModal.reasons.length > 0 && (
                            <div className="text-[11px] opacity-85 mt-0.5 truncate">{aiModal.reasons[0]}</div>
                          )}
                        </div>
                      </div>
                      {typeof aiModal.confidencePct === 'number' && (
                        <span dir="ltr" className="text-xs font-black px-2.5 py-1 rounded-xl bg-black/15 shrink-0 font-num">
                          {aiModal.confidencePct}%
                        </span>
                      )}
                    </div>
                  )}
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDirectSiteBuy(aiModal.token)}
                      className="btn-emerald flex-1 py-2.5 px-3 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-4 h-4" />
                      <span>{isFa ? 'خرید مستقیم از همینجا تو سایت' : 'Direct Buy Now'}</span>
                    </button>
                    <a
                      href={aiModal.token.trustWallet.trustWalletDappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-gold flex-1 py-2.5 px-3 rounded-2xl text-xs font-black inline-flex items-center justify-center gap-1.5"
                    >
                      <Wallet className="w-4 h-4" />
                      <span>{isFa ? 'سوآپ در Trust Wallet' : 'Swap in TW'}</span>
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

      {/* Multi-DApp & Anti-Rug Modal */}
      {dappModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div dir={isFa ? 'rtl' : 'ltr'} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md p-4 grid place-items-center overflow-y-auto" onClick={() => setDappModal(null)}>
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
                <p className="text-xs text-dim py-8 text-center">{isFa ? 'در حال استعلام قرارداد و بررسی لیست‌شدن در DAppها...' : 'Scanning...'}</p>
              ) : (
                <>
                  <div className="surface-soft rounded-2xl p-3 border border-blue-500/25 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="font-bold text-main">
                        {isFa
                          ? `وضعیت لیست در DAppهای Trust Wallet: فعال در ${dappModal.listedCount ?? dappModal.routes.filter((r) => r.isListed).length} صرافی`
                          : `Listed on ${dappModal.listedCount ?? dappModal.routes.filter((r) => r.isListed).length} Trust Wallet DApps`}
                      </span>
                    </div>
                    {dappModal.listedNames && dappModal.listedNames.length > 0 && (
                      <span className="text-[11px] font-bold text-jade truncate max-w-[200px]">
                        {dappModal.listedNames.join(' · ')}
                      </span>
                    )}
                  </div>
                  {dappModal.safety && (
                    <div className="surface-soft rounded-2xl p-4 space-y-2.5 border border-[var(--border)]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-main">{isFa ? 'گزارش امنیتی ضدراگ و هانی‌پات' : 'Anti-Rug Audit'}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/15 text-jade">
                          {dappModal.safety.safetyScore}/100 ({dappModal.safety.verdict})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-center">
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'هانی‌پات' : 'Honeypot'}</span>
                          <strong className={`inline-flex items-center gap-1 ${dappModal.safety.isHoneypot ? 'text-loss' : 'text-jade'}`}>
                            {dappModal.safety.isHoneypot ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            <span>{dappModal.safety.isHoneypot ? (isFa ? 'بله' : 'YES') : isFa ? 'سالم' : 'NO'}</span>
                          </strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'مالیات' : 'Tax'}</span>
                          <strong dir="ltr">{dappModal.safety.buyTaxPct}% / {dappModal.safety.sellTaxPct}%</strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'قفل LP' : 'LP Lock'}</span>
                          <strong className="inline-flex items-center gap-1">
                            {dappModal.safety.lpLockedOrBurned && <CheckCircle2 className="w-3 h-3 text-jade" />}
                            <span>{dappModal.safety.lpLockedOrBurned ? (isFa ? 'تایید' : 'Locked') : isFa ? 'نامشخص' : 'Unverified'}</span>
                          </strong>
                        </div>
                        <div className="surface-card rounded-xl p-2">
                          <span className="block text-[10px] text-dim">{isFa ? 'تمرکز ۱۰ هولدر' : 'Top 10'}</span>
                          <strong dir="ltr">{dappModal.safety.top10HoldersPct}%</strong>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dappModal.routes.map((rt) => {
                      const isDirect = rt.listedStatus === 'DIRECT_POOL';
                      const isAgg = rt.listedStatus === 'AGGREGATOR';
                      const isChart = rt.listedStatus === 'CHART';
                      return (
                        <a
                          key={rt.id}
                          href={rt.trustWalletDappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`surface-soft hover:border-brand/50 border rounded-2xl p-3 flex items-center justify-between gap-2 transition ${
                            isDirect
                              ? 'border-emerald-500/35'
                              : isAgg
                                ? 'border-blue-500/30'
                                : 'border-[var(--border)] opacity-75'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-black text-xs text-main flex items-center gap-1.5">
                              <span>{rt.name}</span>
                              {isDirect && <CheckCircle2 className="w-3.5 h-3.5 text-jade shrink-0" />}
                            </div>
                            <div className={`text-[10px] font-bold ${isDirect ? 'text-jade' : isAgg ? 'text-blue-400' : isChart ? 'text-dim' : 'text-amber-400'}`}>
                              {isDirect
                                ? isFa
                                  ? `لیست‌شده · استخر مستقیم${rt.poolLiquidityUsd ? ` (${fmtUsd(rt.poolLiquidityUsd)})` : ''}`
                                  : `Listed · Direct Pool${rt.poolLiquidityUsd ? ` (${fmtUsd(rt.poolLiquidityUsd)})` : ''}`
                                : isAgg
                                  ? isFa
                                    ? 'قابل سوآپ از تجمیع‌گر'
                                    : 'Supported via Aggregator'
                                  : isChart
                                    ? rt.badge
                                    : isFa
                                      ? 'استخر مستقیم در این صرافی یافت نشد'
                                      : 'Not listed directly here'}
                            </div>
                          </div>
                          <span className="btn-gold px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1 shrink-0">
                            <span>Trust Wallet</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </a>
                      );
                    })}
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
