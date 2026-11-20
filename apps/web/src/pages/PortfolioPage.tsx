import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  CircleDollarSign,
  Download,
  PiggyBank,
  RefreshCw,
  Search,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { AreaChart, DonutChart } from '../components/DollarinoViz';

interface AuditLog {
  id: string;
  category: string;
  level: string;
  symbol: string | null;
  message: string;
  created_at: string;
}

export function PortfolioPage({
  lang,
  data,
  onOpenTerminal,
  onRefresh,
}: {
  lang: Lang;
  data: DashboardPayload;
  onOpenTerminal: (sym?: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [range, setRange] = useState<'1D' | '1W' | '1M' | 'ALL'>('1W');
  const [ledgerTab, setLedgerTab] = useState<'open' | 'closed' | 'logs'>('open');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logQ, setLogQ] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (ledgerTab === 'logs') {
      void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs')
        .then((r) => setLogs(r.logs))
        .catch(() => {});
    }
  }, [ledgerTab]);

  const freeCash = Number(data.balance.free || 0);
  const usedMargin = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total || freeCash + usedMargin);
  const unreal = data.openTrades.reduce((s, t) => s + Number(t.unrealized_pnl || 0), 0);

  const curvePoints = useMemo(() => {
    const raw = data.charts.equityCurve || [];
    const arr = raw.length >= 4 ? raw.map((x) => Number(x.equity || 0)) : [totalEq * 0.94, totalEq * 0.96, totalEq * 0.95, totalEq * 0.98, totalEq];
    if (range === '1D') return arr.slice(-8);
    if (range === '1W') return arr.slice(-18);
    return arr;
  }, [data.charts.equityCurve, range, totalEq]);

  const slices = useMemo(() => {
    const bySym = new Map<string, number>();
    data.openTrades.forEach((p) => bySym.set(p.symbol, (bySym.get(p.symbol) ?? 0) + Number(p.margin_used || 0)));
    const palette = ['#2b74ff', '#e8c15a', '#10d9a3', '#ff8a00', '#a855f7'];
    const items = [...bySym.entries()].map(([sym, val], idx) => ({
      label: sym.replace('USDT', ''),
      value: Math.max(1, val),
      color: palette[idx % palette.length]!,
    }));
    items.push({ label: 'USDT Free', value: Math.max(1, freeCash), color: '#10d9a3' });
    return items;
  }, [data.openTrades, freeCash]);

  const closeAll = async () => {
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    setNotice(isFa ? 'همه معاملات باز بسته و تسویه شدند ✅' : 'All open trades settled ✅');
    await onRefresh();
  };

  const closeOne = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    await onRefresh();
  };

  const exportCsv = () => {
    const rows = [
      ['Type', 'Symbol', 'Direction', 'Leverage', 'Entry', 'Exit/Mark', 'PnL USD'],
      ...data.openTrades.map((p) => ['OPEN', p.symbol, p.direction, String(p.leverage), p.entry_price, p.mark_price ?? p.entry_price, p.unrealized_pnl ?? '0']),
      ...data.closedTrades.map((p) => ['CLOSED', p.symbol, p.direction, String(p.leverage), p.entry_price, p.exit_price, p.realized_pnl]),
    ];
    const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dollarino-portfolio.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(isFa ? 'فایل CSV پورتفوی دانلود شد ✅' : 'Portfolio CSV exported ✅');
  };

  const filteredLogs = useMemo(() => {
    const q = logQ.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => l.message.toLowerCase().includes(q) || (l.symbol ?? '').toLowerCase().includes(q) || l.category.toLowerCase().includes(q));
  }, [logs, logQ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--gold)' }}>
            <span className="live-gold h-1.5 w-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
            <span>PORTFOLIO & AUDIT LOGS</span>
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
            {isFa ? 'پورتفوی، تاریخچه و گزارش ربات' : 'Portfolio & Trading Logs'}
          </h2>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold">
            <Download className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
            <span>{isFa ? 'خروجی CSV' : 'Export CSV'}</span>
          </button>
          {data.openTrades.length > 0 && (
            <button
              type="button"
              onClick={() => void closeAll()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-loss border border-rose-500/30 hover:bg-rose-500/10 transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isFa ? 'بستن همه' : 'Close All'}</span>
            </button>
          )}
        </div>
      </div>

      {notice && <div className="p-3 rounded-2xl badge-signal text-xs font-bold">{notice}</div>}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Briefcase, l: isFa ? 'کل دارایی' : 'Total Equity', v: `$${totalEq.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, c: 'text-goldsoft' },
          { icon: CircleDollarSign, l: isFa ? 'سود/زیان باز' : 'Unrealized PnL', v: `${unreal >= 0 ? '+' : ''}$${unreal.toFixed(2)}`, c: unreal >= 0 ? 'text-jade' : 'text-loss' },
          { icon: PiggyBank, l: isFa ? 'سود تحقق‌یافته' : 'Realized PnL', v: `${data.stats.totalPnl >= 0 ? '+' : ''}$${data.stats.totalPnl.toFixed(2)}`, c: data.stats.totalPnl >= 0 ? 'text-jade' : 'text-loss' },
          { icon: Trophy, l: isFa ? 'نرخ برد' : 'Win Rate', v: `${data.stats.winRate.toFixed(0)}%`, c: 'text-brand' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.l} className="panel rounded-3xl p-4 sm:p-5">
              <Icon className={`w-5 h-5 mb-2 ${s.c}`} />
              <p dir="ltr" className="font-display font-bold text-2xl tabular text-main">{s.v}</p>
              <p className="text-xs text-dim font-semibold mt-1">{s.l}</p>
            </div>
          );
        })}
      </div>

      {/* Allocation Donut + Equity Curve */}
      <div className="grid lg:grid-cols-[310px_1fr] gap-4">
        <div className="panel rounded-[26px] p-5 flex flex-col items-center">
          <h3 className="font-display font-bold text-lg text-main self-start mb-4">{isFa ? 'توزیع سرمایه' : 'Allocation'}</h3>
          <DonutChart segments={slices} size={135} />
          <div className="w-full mt-5 space-y-2">
            {slices.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="font-bold text-main">{s.label}</span>
                <span dir="ltr" className="ms-auto tabular font-bold text-dim">${s.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[26px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-lg text-main">{isFa ? 'رشد سرمایه' : 'Equity Curve'}</h3>
            <div className="flex gap-1">
              {(['1D', '1W', '1M', 'ALL'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${range === r ? 'btn-gold' : 'text-dim hover:text-main'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <p dir="ltr" className="font-display font-bold text-3xl tabular text-main mb-3">
            ${totalEq.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <div className="h-52">
            <AreaChart values={curvePoints} height={200} />
          </div>
        </div>
      </div>

      {/* Unified Open / Closed / Logs Ledger */}
      <div className="panel rounded-[26px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 surface-soft rounded-xl">
            {[
              { id: 'open' as const, l: isFa ? `باز (${data.openTrades.length})` : `Open (${data.openTrades.length})` },
              { id: 'closed' as const, l: isFa ? `بسته‌شده (${data.closedTrades.length})` : `Closed (${data.closedTrades.length})` },
              { id: 'logs' as const, l: isFa ? 'گزارش زنده ربات' : 'Bot Activity Logs' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLedgerTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition ${
                  ledgerTab === t.id ? 'btn-gold' : 'text-dim hover:text-main'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => onOpenTerminal()} className="btn-gold px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            <span>{isFa ? 'معامله جدید در پایانه' : 'New Trade'}</span>
          </button>
        </div>

        {ledgerTab === 'open' && (
          data.openTrades.length === 0 ? (
            <div className="py-10 text-center text-xs text-dim">{isFa ? 'معامله بازی ندارید.' : 'No open positions.'}</div>
          ) : (
            <div className="space-y-2.5">
              {data.openTrades.map((p) => {
                const u = Number(p.unrealized_pnl || 0);
                const long = p.direction === 'LONG';
                return (
                  <div key={p.id} className="rounded-2xl bg-[var(--soft)] border hairline p-4 flex flex-wrap items-center gap-3 text-xs">
                    <CoinIcon symbol={p.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onOpenTerminal(p.symbol)} className="font-bold text-main hover:underline">
                          {p.symbol}
                        </button>
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded ${long ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                          {long ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {p.direction} {p.leverage}×
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Entry ${p.entry_price} → Now ${p.mark_price ?? p.entry_price} · Margin ${p.margin_used}
                      </p>
                    </div>
                    <span dir="ltr" className={`ms-auto font-display font-bold text-base tabular ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {u >= 0 ? '+' : ''}${u.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void closeOne(p.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {ledgerTab === 'closed' && (
          data.closedTrades.length === 0 ? (
            <div className="py-10 text-center text-xs text-dim">{isFa ? 'هنوز معامله بسته‌شده‌ای ثبت نشده است.' : 'No closed trades yet.'}</div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {data.closedTrades.map((c) => {
                const pnl = Number(c.realized_pnl || 0);
                return (
                  <div key={c.id} className="rounded-2xl bg-[var(--soft)] border hairline px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5">
                      <CoinIcon symbol={c.symbol} size={26} />
                      <div>
                        <span className="font-bold text-main">{c.symbol}</span>
                        <span className="text-dim ms-2">{c.direction} {c.leverage}×</span>
                        <p dir="ltr" className="text-[10px] text-dim tabular">
                          {c.entry_price} → {c.exit_price} · {c.close_reason ?? 'SETTLED'}
                        </p>
                      </div>
                    </div>
                    <span dir="ltr" className={`font-num font-bold ${pnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        )}

        {ledgerTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-dim absolute start-3 top-1/2 -translate-y-1/2" />
                <input value={logQ} onChange={(e) => setLogQ(e.target.value)} placeholder={isFa ? 'جستجو در گزارش ربات...' : 'Filter logs...'} className="field ps-9 py-2 text-xs" />
              </div>
              <button
                type="button"
                onClick={() => void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs').then((r) => setLogs(r.logs))}
                className="btn-ghost px-3 py-2 rounded-xl inline-flex items-center gap-1 font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بروزرسانی' : 'Refresh'}</span>
              </button>
            </div>
            <div className="space-y-2 max-h-[380px] overflow-y-auto text-xs font-mono">
              {filteredLogs.length === 0 ? (
                <div className="py-8 text-center text-dim">{isFa ? 'گزارشی ثبت نشده است.' : 'No audit events yet.'}</div>
              ) : (
                filteredLogs.map((l) => (
                  <div key={l.id} className="surface-soft rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-main">{l.category} {l.symbol ? `· ${l.symbol}` : ''}</span>
                      <span className="text-dim">{l.created_at}</span>
                    </div>
                    <p className="text-sub">{l.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
