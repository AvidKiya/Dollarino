import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  History,
  Pencil,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { ChainLogo } from './BrandLogos';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type { DexTradePosition } from '../lib/types';

function fmtTokenPrice(p?: string | number | null): string {
  const n = Number(p || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  return `$${n.toFixed(4)}`;
}

export function DexPortfolioPanel({
  lang,
  tradingMode,
  initialTrades,
  onAfterChange,
}: {
  lang: Lang;
  tradingMode?: 'PAPER' | 'LIVE';
  initialTrades?: DexTradePosition[];
  onAfterChange?: () => Promise<void> | void;
}) {
  const isFa = lang === 'fa';
  const [trades, setTrades] = useState<DexTradePosition[]>(initialTrades || []);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slInput, setSlInput] = useState('');
  const [tpInput, setTpInput] = useState('');
  const [txInputId, setTxInputId] = useState<string | null>(null);
  const [txHashVal, setTxHashVal] = useState('');

  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const q = tradingMode ? `?mode=${tradingMode}` : '';
      const res = await apiFetch<{ trades: DexTradePosition[] }>(`/api/trustwallet/dex-trades${q}`);
      setTrades(res.trades || []);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [tradingMode]);

  useEffect(() => {
    if (initialTrades && initialTrades.length > 0) {
      setTrades(initialTrades);
    } else {
      void loadTrades();
    }
  }, [initialTrades, loadTrades]);

  const handleClose = async (t: DexTradePosition) => {
    try {
      const res = await apiFetch<{ realizedPnlUsd: number; realizedPnlPct: number }>(
        `/api/trustwallet/dex-trades/${t.id}/close`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      pushFloatingToast(
        isFa
          ? `موقعیت ${t.token_symbol} بسته شد (${res.realizedPnlUsd >= 0 ? '+' : ''}$${res.realizedPnlUsd.toFixed(2)})`
          : `Closed ${t.token_symbol} (${res.realizedPnlUsd >= 0 ? '+' : ''}$${res.realizedPnlUsd.toFixed(2)})`,
        res.realizedPnlUsd >= 0 ? 'success' : 'info'
      );
      await Promise.all([loadTrades(), onAfterChange?.()]);
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Close failed', 'error');
    }
  };

  const handleSaveLevels = async (t: DexTradePosition) => {
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stopLossUsd: slInput.trim() ? Number(slInput) : null,
          tp1Usd: tpInput.trim() ? Number(tpInput) : null,
        }),
      });
      pushFloatingToast(isFa ? 'حد سود و حد ضرر ذخیره شد' : 'SL / TP updated', 'success');
      setEditingId(null);
      await Promise.all([loadTrades(), onAfterChange?.()]);
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Update failed', 'error');
    }
  };

  const handleConfirmTx = async (t: DexTradePosition) => {
    if (!txHashVal.trim()) return;
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${t.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ txHash: txHashVal.trim() }),
      });
      pushFloatingToast(isFa ? 'معامله آن‌چین تایید و به حالت باز منتقل شد' : 'Transaction confirmed', 'success');
      setTxInputId(null);
      setTxHashVal('');
      await Promise.all([loadTrades(), onAfterChange?.()]);
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Confirm failed', 'error');
    }
  };

  const filtered = trades.filter((t) => {
    if (filterStatus === 'OPEN') return t.status === 'OPEN' || t.status === 'PENDING_SIGN';
    if (filterStatus === 'CLOSED') return t.status === 'CLOSED';
    return true;
  });

  const openCount = trades.filter((t) => t.status === 'OPEN' || t.status === 'PENDING_SIGN').length;

  return (
    <div className="panel rounded-[26px] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--gold)]" />
            <span>
              {isFa
                ? `پورتفوی معاملات DEX و اسنایپر (${openCount} باز / ${trades.length} کل)`
                : `DEX & Sniper Portfolio (${openCount} Open / ${trades.length} Total)`}
            </span>
          </h3>
          <p className="text-[11px] text-dim mt-0.5">
            {isFa
              ? 'موقعیت‌های خریداری‌شده در رادار DexScreener و ربات اسنایپر لیستینگ در حساب فعلی، همراه با قیمت زنده، ویرایش TP/SL و بستن آنی.'
              : 'Live DexScreener & Listing Sniper holdings for the active account mode with instant SL/TP edit & close.'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {(['ALL', 'OPEN', 'CLOSED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition ${
                filterStatus === st ? 'btn-cobalt' : 'surface-soft text-dim hover:text-main'
              }`}
            >
              {st === 'ALL' ? (isFa ? 'همه' : 'All') : st === 'OPEN' ? (isFa ? 'باز' : 'Open') : isFa ? 'بسته' : 'Closed'}
            </button>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadTrades()}
            className="btn-ghost px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isFa ? 'بروزرسانی' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-soft rounded-2xl p-8 text-center text-xs text-dim space-y-1.5">
          <Rocket className="w-6 h-6 mx-auto text-dim opacity-60" />
          <p>
            {isFa
              ? 'در این حالت حساب هنوز معامله DEX یا اسنایپری ثبت نشده است. می‌توانید از صفحه «اسنایپر» یا «رادار DexScreener» اقدام کنید.'
              : 'No DEX or Sniper holdings in this mode yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((t) => {
            const isClosed = t.status === 'CLOSED';
            const isPaper = t.mode === 'PAPER' || Boolean(t.tx_hash && t.tx_hash.startsWith('PAPER_'));
            const pnlUsd = isClosed ? Number(t.realized_pnl_usd || 0) : Number(t.unrealized_pnl_usd ?? 0);
            const pnlPct = isClosed ? Number(t.realized_pnl_pct || 0) : Number(t.unrealized_pnl_pct ?? 0);
            const isEditing = editingId === t.id;

            return (
              <div key={t.id} className="surface-soft rounded-2xl p-3.5 border hairline space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChainLogo chain={t.chain_id} size={15} />
                      <strong className="text-sm text-main">{t.token_symbol}</strong>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 uppercase">
                        {t.chain_id}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                          isPaper ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-jade'
                        }`}
                      >
                        {isPaper ? (isFa ? 'دمو (شبیه‌ساز)' : 'DEMO') : isFa ? 'واقعی' : 'LIVE'}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 text-dim">
                        {t.status}
                      </span>
                    </div>
                    <p dir="ltr" className="text-[11px] text-dim mt-1 font-num">
                      Size: ${Number(t.amount_usd || 0).toFixed(2)} · Entry: {fmtTokenPrice(t.entry_price_usd)} · Live:{' '}
                      {fmtTokenPrice(isClosed ? t.exit_price_usd ?? t.live_price_usd : t.live_price_usd)}
                    </p>
                    {(t.stop_loss_usd || t.tp1_usd) && (
                      <p dir="ltr" className="text-[10px] text-dim mt-0.5 font-num">
                        {t.stop_loss_usd ? `SL: ${fmtTokenPrice(t.stop_loss_usd)}` : ''}{' '}
                        {t.tp1_usd ? `· TP1: ${fmtTokenPrice(t.tp1_usd)}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className={`font-num font-black text-sm ${pnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {pnlUsd >= 0 ? '+' : ''}
                      ${pnlUsd.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}
                      {pnlPct.toFixed(1)}%)
                    </span>

                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingId(null);
                          } else {
                            setEditingId(t.id);
                            setSlInput(t.stop_loss_usd ? String(t.stop_loss_usd) : '');
                            setTpInput(t.tp1_usd ? String(t.tp1_usd) : '');
                          }
                        }}
                        className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{isFa ? 'حد سود/ضرر' : 'SL/TP'}</span>
                      </button>
                    )}

                    {t.status === 'PENDING_SIGN' && !isPaper && (
                      <button
                        type="button"
                        onClick={() => {
                          setTxInputId(txInputId === t.id ? null : t.id);
                          setTxHashVal('');
                        }}
                        className="btn-cobalt px-2.5 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{isFa ? 'ثبت TX' : 'Confirm TX'}</span>
                      </button>
                    )}

                    {t.trustWallet?.trustWalletDappUrl && !isPaper && (
                      <a
                        href={t.trustWallet.trustWalletDappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1"
                      >
                        <Wallet className="w-3 h-3" />
                        <span>Trust Wallet</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => void handleClose(t)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-loss text-[11px] font-black hover:bg-rose-500 hover:text-white transition"
                      >
                        {isFa ? 'بستن معامله' : 'Close'}
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="pt-2 border-t hairline flex flex-wrap items-end gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-dim mb-1">{isFa ? 'حد ضرر ($)' : 'Stop Loss ($)'}</label>
                      <input
                        dir="ltr"
                        type="number"
                        step="any"
                        value={slInput}
                        onChange={(e) => setSlInput(e.target.value)}
                        className="field py-1.5 px-2.5 w-32 font-num text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-dim mb-1">{isFa ? 'حد سود TP1 ($)' : 'Take Profit 1 ($)'}</label>
                      <input
                        dir="ltr"
                        type="number"
                        step="any"
                        value={tpInput}
                        onChange={(e) => setTpInput(e.target.value)}
                        className="field py-1.5 px-2.5 w-32 font-num text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveLevels(t)}
                      className="btn-emerald px-3 py-1.5 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isFa ? 'ذخیره' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="btn-ghost px-2.5 py-1.5 rounded-xl text-[11px]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {txInputId === t.id && (
                  <div className="pt-2 border-t hairline flex flex-wrap items-center gap-2 text-xs">
                    <input
                      dir="ltr"
                      value={txHashVal}
                      onChange={(e) => setTxHashVal(e.target.value)}
                      placeholder="Paste swap TX Hash (0x... / Sol)..."
                      className="field flex-1 py-1.5 px-2.5 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => void handleConfirmTx(t)}
                      className="btn-cobalt px-3 py-1.5 rounded-xl text-[11px] font-black"
                    >
                      {isFa ? 'تایید آن‌چین' : 'Confirm'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
