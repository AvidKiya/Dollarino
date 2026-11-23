import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq } from '../lib/format';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { AreaChart } from '../components/DollarinoViz';

interface AuditLog {
  id: string;
  category: string;
  level: string;
  symbol: string | null;
  message: string;
  created_at: string;
}

interface WalletLedgerEntry {
  id: string;
  event_type: string;
  amount_usd: number;
  balance_after: number;
  note: string | null;
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
  const [ledgerTab, setLedgerTab] = useState<'open' | 'closed' | 'wallet' | 'logs'>('open');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [walletLedger, setWalletLedger] = useState<WalletLedgerEntry[]>([]);
  const [logCategory, setLogCategory] = useState<string>('ALL');
  const [logQ, setLogQ] = useState('');
  const [assetQ, setAssetQ] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [notice, setNotice] = useState('');
  const [hideBal, setHideBal] = useState(false);
  const [coachAiBusy, setCoachAiBusy] = useState(false);
  const [coachAiNote, setCoachAiNote] = useState<string | null>(null);

  const coachStats = useMemo(() => {
    const trades = data.closedTrades || [];
    const total = trades.length;
    if (total === 0) {
      return {
        total: 0,
        winRate: 0,
        longWinRate: 0,
        shortWinRate: 0,
        longPnl: 0,
        shortPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        rrRatio: 0,
        bestSymbol: '—',
        bestSymbolPnl: 0,
        worstSymbol: '—',
        worstSymbolPnl: 0,
        insightFa:
          'هنوز معامله بسته‌شده‌ای ثبت نشده است. به محض بسته شدن اولین معاملات، مربی هوش مصنوعی الگوی برد و باخت، بهترین ارز و توصیه بهینه‌سازی را اینجا نشان می‌دهد.',
        insightEn:
          'No closed trades yet. Once your first trades close, AI Performance Coach analyzes your win rate, direction bias, and R:R discipline.',
      };
    }

    let wins = 0;
    let winSum = 0;
    let lossCount = 0;
    let lossSum = 0;
    let longCount = 0;
    let longWins = 0;
    let longPnl = 0;
    let shortCount = 0;
    let shortWins = 0;
    let shortPnl = 0;
    const bySym = new Map<string, number>();

    for (const t of trades) {
      const pnl = Number(t.realized_pnl || 0);
      if (pnl > 0) {
        wins += 1;
        winSum += pnl;
      } else if (pnl < 0) {
        lossCount += 1;
        lossSum += Math.abs(pnl);
      }
      if (t.direction === 'LONG') {
        longCount += 1;
        longPnl += pnl;
        if (pnl > 0) longWins += 1;
      } else {
        shortCount += 1;
        shortPnl += pnl;
        if (pnl > 0) shortWins += 1;
      }
      bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + pnl);
    }

    const avgWin = wins > 0 ? winSum / wins : 0;
    const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
    const rrRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 2 : 0;
    const winRate = (wins / total) * 100;
    const longWinRate = longCount > 0 ? (longWins / longCount) * 100 : 0;
    const shortWinRate = shortCount > 0 ? (shortWins / shortCount) * 100 : 0;

    const symList = [...bySym.entries()].sort((a, b) => b[1] - a[1]);
    const bestSymbol = symList[0]?.[0] ?? '—';
    const bestSymbolPnl = symList[0]?.[1] ?? 0;
    const worstSymbol = symList[symList.length - 1]?.[0] ?? '—';
    const worstSymbolPnl = symList[symList.length - 1]?.[1] ?? 0;

    let insightFa = '';
    let insightEn = '';
    if (shortCount >= 2 && shortPnl < -Math.abs(longPnl) * 0.5 && longPnl >= 0) {
      insightFa = `پیشنهاد مربی AI: در جهت LONG عملکرد قوی دارید (${longWinRate.toFixed(0)}% برد)، اما معاملات SHORT عامل اصلی افت شما بوده‌اند (${shortPnl.toFixed(1)}$). پیشنهاد می‌شود موقتاً جهت ربات را روی «فقط لانگ» بگذارید یا تایم‌فریم ورود را بالاتر ببرید.`;
      insightEn = `AI Coach Advice: Your LONG trades perform strongly (${longWinRate.toFixed(0)}% WR), while SHORT trades caused $${Math.abs(shortPnl).toFixed(1)} loss. Consider switching to Long Only or higher timeframe confirmation.`;
    } else if (avgLoss > avgWin * 1.25 && lossCount > 0) {
      insightFa = `پیشنهاد مربی AI: میانگین ضرر شما ($${avgLoss.toFixed(1)}) از میانگین سود ($${avgWin.toFixed(1)}) بیشتر است. نسبت R:R فعلی (${rrRatio.toFixed(2)}) نیاز به نزدیک‌تر کردن استاپ‌لاس یا ذخیره سود در TP2/TP3 دارد.`;
      insightEn = `AI Coach Advice: Avg loss ($${avgLoss.toFixed(1)}) exceeds avg win ($${avgWin.toFixed(1)}). Tighten stop-loss or trail winners toward TP2/TP3 to lift R:R above 1.5.`;
    } else if (winRate >= 55 && rrRatio >= 1.1) {
      insightFa = `تبریک! انضباط معاملاتی شما عالی است: وین‌ریت ${winRate.toFixed(0)}% با نسبت سود به ضرر ${rrRatio.toFixed(2)}. بهترین عملکرد شما روی ${bestSymbol} (+$${bestSymbolPnl.toFixed(1)}) ثبت شده است.`;
      insightEn = `Great discipline: ${winRate.toFixed(0)}% Win Rate with ${rrRatio.toFixed(2)} R:R. Top performer: ${bestSymbol} (+$${bestSymbolPnl.toFixed(1)}).`;
    } else {
      insightFa = `تحلیل عملکرد: از ${total} معامله، ${winRate.toFixed(0)}% با موفقیت بسته شده‌اند. بهترین نماد ${bestSymbol} و پرریسک‌ترین نماد ${worstSymbol} بوده است.`;
      insightEn = `Summary: ${winRate.toFixed(0)}% win rate over ${total} trades. Best: ${bestSymbol}, Weakest: ${worstSymbol}.`;
    }

    return {
      total,
      winRate,
      longWinRate,
      shortWinRate,
      longPnl,
      shortPnl,
      avgWin,
      avgLoss,
      rrRatio,
      bestSymbol,
      bestSymbolPnl,
      worstSymbol,
      worstSymbolPnl,
      insightFa,
      insightEn,
    };
  }, [data.closedTrades]);

  const askAiCoachDeepAnalysis = async () => {
    setCoachAiBusy(true);
    try {
      const prompt = isFa
        ? `به عنوان مربی حرفه‌ای ترید، این آمار عملکرد واقعی حساب من را بررسی کن و ۳ راهکار کوتاه و دقیق برای بالا بردن سود و کاهش ریسک بده:\nتعداد ترید: ${coachStats.total} | وین‌ریت: ${coachStats.winRate.toFixed(1)}% | وین‌ریت لانگ: ${coachStats.longWinRate.toFixed(0)}% (${coachStats.longPnl.toFixed(1)}$) | وین‌ریت شورت: ${coachStats.shortWinRate.toFixed(0)}% (${coachStats.shortPnl.toFixed(1)}$) | میانگین سود: $${coachStats.avgWin.toFixed(1)} | میانگین ضرر: $${coachStats.avgLoss.toFixed(1)} | بهترین ارز: ${coachStats.bestSymbol} | بدترین ارز: ${coachStats.worstSymbol}`
        : `Act as a pro trading coach and give 3 crisp actionable improvements for my account stats: Trades=${coachStats.total}, WR=${coachStats.winRate.toFixed(1)}%, LongWR=${coachStats.longWinRate.toFixed(0)}% ($${coachStats.longPnl.toFixed(1)}), ShortWR=${coachStats.shortWinRate.toFixed(0)}% ($${coachStats.shortPnl.toFixed(1)}), AvgWin=$${coachStats.avgWin.toFixed(1)}, AvgLoss=$${coachStats.avgLoss.toFixed(1)}, Best=${coachStats.bestSymbol}, Worst=${coachStats.worstSymbol}`;
      const res = await apiFetch<{ reply: string }>('/api/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: prompt }),
      });
      setCoachAiNote(res.reply);
    } catch {
      setCoachAiNote(isFa ? coachStats.insightFa : coachStats.insightEn);
    } finally {
      setCoachAiBusy(false);
    }
  };

  useEffect(() => {
    if (ledgerTab === 'logs') {
      void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs')
        .then((r) => setLogs(r.logs))
        .catch(() => {});
    } else if (ledgerTab === 'wallet') {
      void apiFetch<{ ledger: WalletLedgerEntry[] }>('/api/trading/wallet/ledger')
        .then((r) => setWalletLedger(r.ledger))
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
    const palette = ['#F59E0B', '#1652F0', '#8B5CF6', '#EF4444', '#06B6D4'];
    const items = [...bySym.entries()].map(([sym, val], idx) => ({
      label: sym.replace('USDT', ''),
      value: Math.max(1, val),
      color: palette[idx % palette.length]!,
    }));
    items.unshift({ label: 'USDT', value: Math.max(1, freeCash), color: '#10B981' });
    return items;
  }, [data.openTrades, freeCash]);

  const assetCards = useMemo(() => {
    const map = new Map<string, { symbol: string; base: string; usd: number; count: number; pnl: number }>();
    map.set('USDT', { symbol: 'USDT', base: 'USDT', usd: freeCash, count: 0, pnl: 0 });
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].forEach((sym) => {
      const base = sym.replace('USDT', '');
      map.set(base, { symbol: sym, base, usd: 0, count: 0, pnl: 0 });
    });
    data.openTrades.forEach((p) => {
      const base = p.symbol.replace('USDT', '');
      const prev = map.get(base) ?? { symbol: p.symbol, base, usd: 0, count: 0, pnl: 0 };
      prev.usd += Number(p.margin_used || 0);
      prev.count += 1;
      prev.pnl += Number(p.unrealized_pnl || 0);
      map.set(base, prev);
    });
    const q = assetQ.trim().toLowerCase();
    return [...map.values()]
      .filter((a) => {
        if (hideZero && a.usd <= 0.01) return false;
        if (!q) return true;
        return a.base.toLowerCase().includes(q) || coinDisplayName(a.base, isFa).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.base === 'USDT') return -1;
        if (b.base === 'USDT') return 1;
        if (b.usd !== a.usd) return b.usd - a.usd;
        return 0;
      });
  }, [data.openTrades, freeCash, assetQ, hideZero, isFa]);

  const closeAll = async () => {
    await apiFetch('/api/trading/bot/stop', { method: 'POST', body: JSON.stringify({ settleOpen: true }) });
    setNotice(isFa ? 'همه معاملات باز بسته و تسویه شدند' : 'All open trades settled');
    await onRefresh();
  };

  const closeOne = async (id: string) => {
    await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
    await onRefresh();
  };

  const resetDemo = async () => {
    await apiFetch('/api/trading/wallet/reset', { method: 'POST' });
    setNotice(isFa ? 'موجودی شبیه‌ساز به $۱۰,۰۰۰ بازنشانی شد' : 'Simulation balance reset to $10,000');
    await onRefresh();
    if (ledgerTab === 'wallet') {
      void apiFetch<{ ledger: WalletLedgerEntry[] }>('/api/trading/wallet/ledger')
        .then((r) => setWalletLedger(r.ledger))
        .catch(() => {});
    }
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
    setNotice(isFa ? 'فایل CSV پورتفوی دانلود شد' : 'Portfolio CSV exported');
  };

  const filteredLogs = useMemo(() => {
    const q = logQ.trim().toLowerCase();
    return logs.filter((l) => {
      if (logCategory !== 'ALL' && l.category.toUpperCase() !== logCategory) return false;
      if (!q) return true;
      return l.message.toLowerCase().includes(q) || (l.symbol ?? '').toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
    });
  }, [logs, logQ, logCategory]);

  const sliceTotal = slices.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {notice && <div className="p-3 rounded-2xl badge-signal text-xs font-bold">{notice}</div>}

      {/* 1. Curved Cobalt Wallet Card matching Screenshot 3 */}
      <div
        className="rounded-[28px] p-5 sm:p-6 text-white relative overflow-hidden shadow-lg space-y-4"
        style={{ background: 'linear-gradient(135deg, #1652F0 0%, #0D3CC4 58%, #072275 100%)' }}
      >
        <div className="pointer-events-none absolute -top-12 -end-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 -start-8 w-36 h-36 rounded-full bg-white/8" />

        <div className="relative z-10 flex items-center justify-between gap-2">
          <span className="px-3 py-1 rounded-full bg-white/15 text-[11px] font-black">
            {data.config.trading_mode === 'PAPER' ? (isFa ? 'حساب شبیه‌ساز' : 'SIMULATED WALLET') : isFa ? 'کیف پول واقعی' : 'LIVE WALLET'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHideBal((v) => !v)}
              className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition"
              aria-label="Toggle balance"
            >
              {hideBal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative z-10 text-center space-y-1 py-1">
          <p className="text-xs text-white/80 font-bold">{isFa ? 'موجودی کل' : 'Total Equity'}</p>
          <p dir="ltr" className="font-display font-bold text-3xl sm:text-4xl tabular text-white font-num">
            {hideBal ? '••••••' : `$${totalEq.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
          </p>
          {!hideBal && isFa && (
            <p className="text-xs text-white/80 font-semibold">معادل {formatTomanEq(totalEq)} تومان</p>
          )}
          <div className="flex items-center justify-center gap-3 text-[11px] text-white/80 pt-1">
            <span>
              {isFa ? 'آزاد:' : 'Free:'}{' '}
              <span dir="ltr" className="inline-block font-num font-bold">
                ${freeCash.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span>·</span>
            <span>
              {isFa ? 'درگیر:' : 'Used:'}{' '}
              <span dir="ltr" className="inline-block font-num font-bold">
                ${usedMargin.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span>·</span>
            <span dir="ltr" className={`inline-block font-bold font-num ${unreal >= 0 ? 'text-[#8EFFB6]' : 'text-rose-200'}`}>
              {unreal >= 0 ? `+$${unreal.toFixed(2)}` : `-$${Math.abs(unreal).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Carousel dashed bars matching image-4.png */}
        <div className="relative z-10 flex items-center justify-center gap-1.5 pt-1">
          <span className="h-1 w-3 rounded-full bg-white/35" />
          <span className="h-1 w-3 rounded-full bg-white/35" />
          <span className="h-1 w-5 rounded-full bg-white" />
          <span className="h-1 w-3 rounded-full bg-white/35" />
        </div>
      </div>

      {/* 2. Open Dotted Allocation Strip + Color Legend matching image-4.png */}
      <div className="px-2 space-y-2">
        <div className="flex h-1.5 w-full gap-1 rounded-full overflow-hidden">
          {slices.map((s) => (
            <div
              key={s.label}
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(6, (s.value / sliceTotal) * 100)}%`, background: s.color }}
              title={`${s.label}: $${s.value.toFixed(0)}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-bold text-sub">
          {slices.slice(0, 5).map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
              <span dir="ltr" className="text-dim font-num">{((s.value / sliceTotal) * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* 3. 4 Circular Action Buttons matching image-4.png (Primary Amber + 3 Clean White Circles) */}
      <div className="grid grid-cols-4 gap-2 text-center py-1">
        <button
          type="button"
          onClick={() => onOpenTerminal('BTCUSDT')}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span className="w-12 h-12 rounded-full bg-[#F59E0B] hover:bg-[#D97706] text-white grid place-items-center shadow-md transition">
            <Zap className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-extrabold text-main">{isFa ? 'معامله سریع' : 'Trade'}</span>
        </button>

        <button
          type="button"
          onClick={() => void resetDemo()}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span className="w-12 h-12 rounded-full panel text-main grid place-items-center transition group-hover:scale-105">
            <RotateCcw className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-extrabold text-main">
            {isFa ? (
              <>
                ریست <span dir="ltr" className="inline-block font-num">$10K</span>
              </>
            ) : (
              'Reset $10K'
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={exportCsv}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span className="w-12 h-12 rounded-full panel text-main grid place-items-center transition group-hover:scale-105">
            <Download className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-extrabold text-main">{isFa ? 'پورتفولیو CSV' : 'Export'}</span>
        </button>

        <button
          type="button"
          onClick={() => void closeAll()}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span className="w-12 h-12 rounded-full panel text-main grid place-items-center transition group-hover:scale-105">
            <X className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-extrabold text-main">{isFa ? 'بستن همه' : 'Settle All'}</span>
        </button>
      </div>

      {/* 4. Filter Pills + Search Row + 2-Column Asset Cards matching image-4.png */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setHideZero((v) => !v)}
            className={`px-3.5 py-2 rounded-full text-xs font-bold transition border ${
              hideZero ? 'bg-[#1652F0] text-white border-[#1652F0]' : 'panel text-sub hairline'
            }`}
          >
            {isFa ? (hideZero ? 'نمایش همه ارزها' : 'مخفی‌سازی دارایی خرد') : hideZero ? 'Show All' : 'Hide Zero'}
          </button>
          <div className="panel rounded-full px-3.5 py-2 flex items-center gap-2 flex-1 max-w-xs">
            <Search className="w-4 h-4 text-dim shrink-0" />
            <input
              value={assetQ}
              onChange={(e) => setAssetQ(e.target.value)}
              placeholder={isFa ? 'جستجوی ارز...' : 'Search coin...'}
              className="bg-transparent flex-1 text-xs text-main outline-none placeholder:text-dim"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {assetCards.map((a) => (
            <button
              key={a.base}
              type="button"
              onClick={() => onOpenTerminal(a.base === 'USDT' ? 'BTCUSDT' : `${a.base}USDT`)}
              className="panel panel-hover rounded-[22px] p-4 flex flex-col justify-between gap-3 text-start"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CoinIcon symbol={a.symbol} size={32} />
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm text-main truncate">{coinDisplayName(a.base, isFa)}</p>
                    <p className="text-[10px] font-bold text-dim">{a.base}</p>
                  </div>
                </div>
                {a.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#1652F0]/10 text-[#1652F0] text-[10px] font-black">
                    {a.count}
                  </span>
                )}
              </div>

              <div className="flex items-end justify-between gap-1">
                <div>
                  <p dir="ltr" className="font-num font-black text-sm text-main">
                    ${a.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </p>
                  {isFa && <p className="text-[10px] text-dim">{formatTomanEq(a.usd)} تومان</p>}
                </div>
                {a.pnl !== 0 && (
                  <span dir="ltr" className={`inline-block text-[11px] font-black tabular font-num ${a.pnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {a.pnl >= 0 ? `+$${a.pnl.toFixed(2)}` : `-$${Math.abs(a.pnl).toFixed(2)}`}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Compact Equity Growth Card */}
      <div className="panel rounded-[26px] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base text-main">{isFa ? 'نمودار رشد دارایی' : 'Equity Curve'}</h3>
            <p className="text-[11px] text-dim">
              {isFa ? `نرخ برد: ${data.stats.winRate.toFixed(0)}% · کل سود: $${data.stats.totalPnl.toFixed(2)}` : `Win Rate ${data.stats.winRate.toFixed(0)}%`}
            </p>
          </div>
          <div className="flex gap-1">
            {(['1D', '1W', '1M', 'ALL'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${range === r ? 'ios-pill-active' : 'text-dim hover:text-main'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-44">
          <AreaChart values={curvePoints} height={170} />
        </div>
      </div>

      {/* 5.5 AI Performance Coach Card */}
      <div className="panel rounded-[26px] p-5 space-y-3 border border-[#1652f0]/25">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl btn-cobalt grid place-items-center shrink-0">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm sm:text-base text-main flex items-center gap-1.5">
                <span>{isFa ? 'مربی هوشمند عملکرد (AI Performance Coach)' : 'AI Performance Coach'}</span>
              </h3>
              <p className="text-[11px] text-dim">
                {isFa ? 'تحلیل الگوی برد و باخت، لانگ در برابر شورت و نسبت ریسک به ریوارد' : 'Automated review of Long vs Short edge, R:R, and top symbols'}
              </p>
            </div>
          </div>
          {coachStats.total > 0 && (
            <button
              type="button"
              disabled={coachAiBusy}
              onClick={() => void askAiCoachDeepAnalysis()}
              className="btn-cobalt px-3.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{coachAiBusy ? '...' : isFa ? 'تحلیل عمیق با AI' : 'Deep AI Review'}</span>
            </button>
          )}
        </div>

        {coachStats.total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="surface-soft rounded-2xl p-2.5">
              <p className="text-[10px] text-dim">{isFa ? 'برد LONG / SHORT' : 'Long / Short WR'}</p>
              <p dir="ltr" className="font-num font-black text-main mt-0.5">
                {coachStats.longWinRate.toFixed(0)}% / {coachStats.shortWinRate.toFixed(0)}%
              </p>
            </div>
            <div className="surface-soft rounded-2xl p-2.5">
              <p className="text-[10px] text-dim">{isFa ? 'نسبت R:R واقعی' : 'Realized R:R'}</p>
              <p dir="ltr" className="font-num font-black text-jade mt-0.5">
                {coachStats.rrRatio.toFixed(2)}×
              </p>
            </div>
            <div className="surface-soft rounded-2xl p-2.5">
              <p className="text-[10px] text-dim">{isFa ? 'بهترین ارز' : 'Best Coin'}</p>
              <p dir="ltr" className="font-num font-black text-jade mt-0.5">
                {coachStats.bestSymbol.replace('USDT', '')}
              </p>
            </div>
            <div className="surface-soft rounded-2xl p-2.5">
              <p className="text-[10px] text-dim">{isFa ? 'پرضررترین ارز' : 'Weakest Coin'}</p>
              <p dir="ltr" className="font-num font-black text-loss mt-0.5">
                {coachStats.worstSymbol.replace('USDT', '')}
              </p>
            </div>
          </div>
        )}

        <div className="surface-soft rounded-2xl p-3.5 text-xs text-sub leading-relaxed whitespace-pre-wrap">
          {coachAiNote ?? (isFa ? coachStats.insightFa : coachStats.insightEn)}
        </div>
      </div>

      {/* 6. Unified Open / Closed / Wallet Ledger / Activity Logs */}
      <div className="panel rounded-[26px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 surface-soft rounded-xl overflow-x-auto no-scrollbar">
            {[
              { id: 'open' as const, l: isFa ? `باز (${data.openTrades.length})` : `Open (${data.openTrades.length})` },
              { id: 'closed' as const, l: isFa ? `بسته‌شده (${data.closedTrades.length})` : `Closed (${data.closedTrades.length})` },
              { id: 'wallet' as const, l: isFa ? 'دفتر کیف پول' : 'Wallet Ledger' },
              { id: 'logs' as const, l: isFa ? 'گزارش زنده ربات' : 'Activity Logs' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLedgerTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition whitespace-nowrap ${
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

        {ledgerTab === 'wallet' && (
          walletLedger.length === 0 ? (
            <div className="py-10 text-center text-xs text-dim">{isFa ? 'تراکنش مالی ثبت نشده است.' : 'No wallet transactions yet.'}</div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto text-xs">
              {walletLedger.map((w) => (
                <div key={w.id} className="surface-soft rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-main">{w.event_type}</span>
                    {w.note && <p className="text-[11px] text-dim">{w.note}</p>}
                  </div>
                  <div dir="ltr" className="text-end font-num">
                    <span className={`font-bold ${w.amount_usd >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {w.amount_usd >= 0 ? '+' : ''}${Number(w.amount_usd).toFixed(2)}
                    </span>
                    <p className="text-[10px] text-dim">Bal: ${Number(w.balance_after).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {ledgerTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {['ALL', 'TRADE', 'SIGNAL', 'BOT', 'RISK', 'AI', 'TELEGRAM'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setLogCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${logCategory === cat ? 'btn-gold' : 'surface-soft text-dim'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
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
