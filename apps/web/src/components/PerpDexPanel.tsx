import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Gauge,
  KeyRound,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { CoinIcon } from './CoinIcon';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import { approveHyperliquidAgentInDapp } from '../lib/trustwallet';
import type { PerpDappLinkItem, PerpMarketQuoteItem } from '../lib/types';

export function PerpDexPanel({
  lang,
  walletEvmAddress,
  onAfterChange,
}: {
  lang: Lang;
  walletEvmAddress?: string | null;
  onAfterChange?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
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
    orders: Array<{
      id: string;
      provider: string;
      symbol: string;
      side: string;
      size_usd: number;
      leverage: number;
      entry_price?: number;
      tp_price?: number | null;
      sl_price?: number | null;
      status: string;
      created_at: string;
    }>;
  } | null>(null);
  const [perpAgentForm, setPerpAgentForm] = useState({
    walletAddress: walletEvmAddress || '',
    agentAddress: '',
    agentPrivateKey: '',
  });
  const [perpOrderForm, setPerpOrderForm] = useState({
    symbol: 'BTC',
    sizeUsd: 100,
    leverage: 5,
    provider: 'HYPERLIQUID',
    tpPrice: '',
    slPrice: '',
  });

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
    void loadPerpData();
  }, [loadPerpData]);

  const placeOrder = async (side: 'LONG' | 'SHORT') => {
    setPerpBusy(true);
    try {
      const r = await apiFetch<{ messageFa: string; messageEn: string; dappRedirectUrl?: string }>('/api/dex/perp-order', {
        method: 'POST',
        body: JSON.stringify({
          venue: perpOrderForm.provider,
          provider: perpOrderForm.provider,
          symbol: perpOrderForm.symbol,
          side,
          marginUsd: perpOrderForm.sizeUsd,
          sizeUsd: perpOrderForm.sizeUsd,
          leverage: perpOrderForm.leverage,
          tpPrice: perpOrderForm.tpPrice.trim() ? Number(perpOrderForm.tpPrice) : undefined,
          slPrice: perpOrderForm.slPrice.trim() ? Number(perpOrderForm.slPrice) : undefined,
        }),
      });
      pushFloatingToast(isFa ? r.messageFa : r.messageEn, 'success');
      await loadPerpData();
      if (r.dappRedirectUrl) window.open(r.dappRedirectUrl, '_blank', 'noopener,noreferrer');
      await onAfterChange?.();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Order failed', 'error');
    } finally {
      setPerpBusy(false);
    }
  };

  const closePerpOrder = async (id: string) => {
    setPerpBusy(true);
    try {
      await apiFetch(`/api/dex/perp-orders/${id}/close`, { method: 'POST', body: JSON.stringify({}) });
      pushFloatingToast(isFa ? 'پوزیشن/سفارش فیوچرز کیف‌پول بسته شد.' : 'Perp order closed.', 'success');
      await loadPerpData();
      await onAfterChange?.();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Close failed', 'error');
    } finally {
      setPerpBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="panel rounded-3xl p-5 sm:p-6 space-y-4 border border-emerald-500/25">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full text-[11px] font-black">
              <Gauge className="w-3.5 h-3.5" />
              <span>{isFa ? 'فیوچرز اهرم‌دار کیف‌پول (Perp DEX بدون احراز هویت)' : 'NON-CUSTODIAL WALLET LEVERAGED PERPS'}</span>
            </div>
            <h3 className="font-display font-bold text-lg sm:text-xl text-main">
              {isFa ? 'معامله لانگ و شورت تا ۱۰۰x مستقیم از Trust Wallet' : 'Trade Long/Short Up to 100x Straight From Your Wallet'}
            </h3>
            <p className="text-xs text-dim leading-relaxed">
              {isFa
                ? 'روی صرافی‌های غیرمتمرکز فیوچرز Hyperliquid (تا ۵۰x)، Jupiter Perps سولانا (تا ۱۰۰x)، GMX V2 و dYdX معامله اهرم‌دار با حد سود و حد ضرر باز کنید بدون اینکه دارایی از کیف‌پولتان خارج شود.'
                : 'Open leveraged Long/Short positions directly from your non-custodial wallet on Hyperliquid, Jupiter Perps, GMX V2 & dYdX.'}
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {perpDapps.map((d) => (
            <div key={d.venue} className="surface-soft rounded-2xl p-4 border hairline flex flex-col justify-between gap-3">
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
        {/* Order Ticket & Live Perp Markets */}
        <div className="panel rounded-3xl p-5 space-y-4">
          <h4 className="font-display font-bold text-sm sm:text-base text-main flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand" />
            <span>{isFa ? 'ثبت سریع سفارش فیوچرز کیف‌پول + رصد زنده مارکت‌ها' : 'Quick Wallet Perp Order & Live Mark Prices'}</span>
          </h4>

          <div className="surface-soft rounded-2xl p-4 space-y-3 border hairline text-xs">
            <div className="grid sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? 'پروتکل' : 'Perp DEX'}</label>
                <select
                  dir="ltr"
                  value={perpOrderForm.provider}
                  onChange={(e) => setPerpOrderForm((f) => ({ ...f, provider: e.target.value }))}
                  className="field w-full rounded-xl px-2.5 py-2 text-xs text-left"
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
                  className="field w-full rounded-xl px-2.5 py-2 text-xs text-left font-bold"
                >
                  {(perpMarkets.length > 0 ? perpMarkets.slice(0, 14).map((m) => m.symbol) : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'SUI', 'AVAX']).map((s) => (
                    <option key={s} value={s}>{s}-PERP</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? 'مارجین (دلار)' : 'Margin ($)'}</label>
                <input
                  type="number"
                  min={10}
                  max={1000000}
                  value={perpOrderForm.sizeUsd}
                  onChange={(e) => setPerpOrderForm((f) => ({ ...f, sizeUsd: Number(e.target.value) || 50 }))}
                  className="field w-full rounded-xl px-2.5 py-2 font-num"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? `اهرم (${perpOrderForm.leverage}×)` : `Leverage (${perpOrderForm.leverage}x)`}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={perpOrderForm.leverage}
                  onChange={(e) => setPerpOrderForm((f) => ({ ...f, leverage: Math.max(1, Math.min(100, Number(e.target.value) || 5)) }))}
                  className="field w-full rounded-xl px-2.5 py-2 font-num"
                />
              </div>
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? 'حد سود TP ($ اختیاری)' : 'TP Price ($ optional)'}</label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  placeholder="Optional"
                  value={perpOrderForm.tpPrice}
                  onChange={(e) => setPerpOrderForm((f) => ({ ...f, tpPrice: e.target.value }))}
                  className="field w-full rounded-xl px-2.5 py-2 font-num"
                />
              </div>
              <div>
                <label className="text-[10px] text-dim block mb-1">{isFa ? 'حد ضرر SL ($ اختیاری)' : 'SL Price ($ optional)'}</label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  placeholder="Optional"
                  value={perpOrderForm.slPrice}
                  onChange={(e) => setPerpOrderForm((f) => ({ ...f, slPrice: e.target.value }))}
                  className="field w-full rounded-xl px-2.5 py-2 font-num"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={perpBusy}
                onClick={() => void placeOrder('LONG')}
                className="btn-emerald flex-1 py-2.5 rounded-xl font-black inline-flex items-center justify-center gap-1.5"
              >
                <TrendingUp className="w-4 h-4" />
                <span>{isFa ? `لانگ ${perpOrderForm.symbol} (${perpOrderForm.leverage}x)` : `LONG ${perpOrderForm.symbol}`}</span>
              </button>
              <button
                type="button"
                disabled={perpBusy}
                onClick={() => void placeOrder('SHORT')}
                className="btn-danger flex-1 py-2.5 rounded-xl font-black inline-flex items-center justify-center gap-1.5"
              >
                <TrendingDown className="w-4 h-4" />
                <span>{isFa ? `شورت ${perpOrderForm.symbol} (${perpOrderForm.leverage}x)` : `SHORT ${perpOrderForm.symbol}`}</span>
              </button>
            </div>
          </div>

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

        {/* Agent Setup + Positions + Orders */}
        <div className="space-y-4">
          <div className="panel rounded-3xl p-4 space-y-2.5 text-xs border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-black text-sm text-jade flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>{isFa ? 'فعال‌سازی ۱-کلیکی Hyperliquid (بدون کپی کلید دستی)' : '1-Click Trust Wallet ApproveAgent'}</span>
              </h4>
              {perpAccount?.mode === 'AGENT_WALLET' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-jade text-[10px] font-black inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>24/7 ACTIVE</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-dim leading-relaxed">
              {isFa
                ? 'با یک کلیک، مرورگر Trust Wallet امضای استاندارد EIP-712 ApproveAgent را می‌گیرد تا ربات ۲۴/۷ بدون هیچ مجوز برداشت معامله کند.'
                : 'Approve a trade-only Agent Key in one tap via Trust Wallet EIP-712 signature.'}
            </p>
            <button
              type="button"
              disabled={perpBusy}
              onClick={async () => {
                setPerpBusy(true);
                try {
                  const r = await approveHyperliquidAgentInDapp('Dollarino24x7');
                  pushFloatingToast(
                    (isFa ? r.messageFa : r.messageEn) || (isFa ? 'Agent Wallet فعال شد!' : 'Agent approved!'),
                    'success'
                  );
                  await Promise.all([loadPerpData(), onAfterChange?.()]);
                } catch (e) {
                  const code = e instanceof Error ? e.message : '';
                  pushFloatingToast(
                    code === 'NO_INJECTED_WALLET'
                      ? isFa
                        ? 'لطفاً صفحه را داخل اپ Trust Wallet باز کنید یا افزونه کیف‌پول را فعال نمایید.'
                        : 'Open inside Trust Wallet DApp Browser or enable wallet extension.'
                      : code || 'ApproveAgent failed',
                    'error'
                  );
                } finally {
                  setPerpBusy(false);
                }
              }}
              className="btn-emerald w-full py-2.5 rounded-xl font-black inline-flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>{perpBusy ? '...' : isFa ? 'تایید ۱-کلیکی Hyperliquid در Trust Wallet' : '1-Click ApproveAgent'}</span>
            </button>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPerpBusy(true);
              try {
                const r = await apiFetch<{ messageFa: string }>('/api/dex/perp-connect', {
                  method: 'POST',
                  body: JSON.stringify({
                    venue: 'hyperliquid',
                    masterAddress: perpAgentForm.walletAddress || walletEvmAddress || '',
                    agentAddress: perpAgentForm.agentAddress || undefined,
                    agentPrivateKey: perpAgentForm.agentPrivateKey || undefined,
                  }),
                });
                pushFloatingToast(r.messageFa, 'success');
                setPerpAgentForm((f) => ({ ...f, agentPrivateKey: '' }));
                await loadPerpData();
              } catch (e2) {
                pushFloatingToast(e2 instanceof Error ? e2.message : 'Connect failed', 'error');
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
                <span className="badge-signal px-2.5 py-0.5 rounded-full text-[10px] font-black">{perpAccount.mode}</span>
              )}
            </div>
            <input
              dir="ltr"
              required
              value={perpAgentForm.walletAddress || walletEvmAddress || ''}
              onChange={(e) => setPerpAgentForm((f) => ({ ...f, walletAddress: e.target.value }))}
              placeholder="Main Wallet Address (0x...)"
              className="field w-full rounded-xl px-3 py-2 font-mono text-[11px]"
            />
            <input
              dir="ltr"
              value={perpAgentForm.agentAddress}
              onChange={(e) => setPerpAgentForm((f) => ({ ...f, agentAddress: e.target.value }))}
              placeholder="Optional Agent Wallet Public Address (0x...)"
              className="field w-full rounded-xl px-3 py-2 font-mono text-[11px]"
            />
            <input
              dir="ltr"
              type="password"
              value={perpAgentForm.agentPrivateKey}
              onChange={(e) => setPerpAgentForm((f) => ({ ...f, agentPrivateKey: e.target.value }))}
              placeholder="Optional Hyperliquid Trade-Only Agent Private Key"
              className="field w-full rounded-xl px-3 py-2 font-mono text-[11px]"
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
              <p className="font-black text-main">{isFa ? 'سفارش‌ها و پوزیشن‌های فیوچرز کیف‌پول' : 'Wallet Perp Orders'}</p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {perpAccount.orders.slice(0, 10).map((o) => (
                  <div key={o.id} className="surface-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <strong>{o.symbol}</strong> · <span className={o.side === 'LONG' ? 'text-jade' : 'text-loss'}>{o.side}</span> · {o.leverage}x (${o.size_usd})
                      <span className="block text-[10px] text-dim">{o.status}</span>
                    </div>
                    {o.status !== 'CLOSED' && o.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        disabled={perpBusy}
                        onClick={() => void closePerpOrder(o.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss text-[10px] font-black hover:bg-rose-500 hover:text-white transition"
                      >
                        {isFa ? 'بستن' : 'Close'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
