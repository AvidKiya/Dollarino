import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  EyeOff,
  Gamepad2,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { coinDisplayName, formatTomanEq, getLiveUsdtIrt, setLiveUsdtIrt } from '../lib/format';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type { DashboardPayload } from '../lib/types';
import { CoinIcon } from '../components/CoinIcon';
import { ChainLogo } from '../components/BrandLogos';
import { DexPortfolioPanel } from '../components/DexPortfolioPanel';
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

interface AccountNote {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
}

interface AiSettingProposal {
  id: string;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  patch: Record<string, unknown>;
}

export function PortfolioPage({
  lang,
  iranRate,
  data,
  onOpenTerminal,
  onRefresh,
}: {
  lang: Lang;
  iranRate?: number;
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
  const [busy, setBusy] = useState(false);
  const [hideBal, setHideBal] = useState(false);
  const [coachAiBusy, setCoachAiBusy] = useState(false);
  const [coachAiNote, setCoachAiNote] = useState<string | null>(null);

  // Personal Notes / Trading Journal
  const [notes, setNotes] = useState<AccountNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<'NOTE' | 'STRATEGY' | 'AI_ADVICE'>('NOTE');
  const [notesBusy, setNotesBusy] = useState(false);

  const liveIrt = iranRate || data.iranRate?.usdtIrt || getLiveUsdtIrt();
  useEffect(() => {
    if (liveIrt >= 30_000) setLiveUsdtIrt(liveIrt, data.iranRate?.source);
  }, [liveIrt, data.iranRate?.source]);

  const loadNotes = () => {
    void apiFetch<{ notes: AccountNote[] }>('/api/trading/notes')
      .then((r) => setNotes(r.notes || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadNotes();
    void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs')
      .then((r) => setLogs(r.logs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (ledgerTab === 'logs') {
      void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs')
        .then((r) => setLogs(r.logs || []))
        .catch(() => {});
    } else if (ledgerTab === 'wallet') {
      void apiFetch<{ ledger: WalletLedgerEntry[] }>('/api/trading/wallet/ledger')
        .then((r) => setWalletLedger(r.ledger || []))
        .catch(() => {});
    }
  }, [ledgerTab]);

  const coachStats = useMemo(() => {
    const trades = data.closedTrades || [];
    const openCount = (data.openTrades || []).length;
    const total = trades.length;
    if (total === 0) {
      return {
        total: 0,
        openCount,
        winRate: 0,
        longWinRate: 0,
        shortWinRate: 0,
        longPnl: 0,
        shortPnl: 0,
        longCount: 0,
        shortCount: 0,
        avgWin: 0,
        avgLoss: 0,
        rrRatio: 0,
        bestSymbol: '—',
        bestSymbolPnl: 0,
        worstSymbol: '—',
        worstSymbolPnl: 0,
        insightFa:
          openCount > 0
            ? `شما اکنون ${openCount} پوزیشن باز دارید، اما هنوز معامله بسته‌شده‌ای ثبت نشده است. به محض بسته شدن اولین پوزیشن‌ها، مشاور هوشمند نرخ برد، جهت مناسب و پیشنهاد اصلاح تنظیمات را ارائه می‌دهد.`
            : 'هنوز معامله بسته‌شده‌ای ثبت نشده است. با ثبت اولین معاملات، مشاور هوشمند عملکرد شما را تحلیل کرده و تغییرات دقیق تنظیمات ربات (اهرم، مارجین، جهت و ریسک‌فری) را پیشنهاد می‌دهد.',
        insightEn:
          openCount > 0
            ? `You currently have ${openCount} open position(s), with 0 closed trades yet. Once closed, AI Coach analyzes Win Rate, direction edge, and suggests concrete config tweaks.`
            : 'No closed trades yet. Once trades close, AI Coach evaluates your stats and proposes one-click config adjustments.',
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
    const bestEntry = symList[0];
    const worstEntry = symList.length > 1 ? symList[symList.length - 1] : undefined;
    const bestSymbol = bestEntry?.[0] ?? '—';
    const bestSymbolPnl = bestEntry?.[1] ?? 0;
    const worstSymbol = worstEntry?.[0] ?? (bestSymbolPnl < 0 ? bestSymbol : '—');
    const worstSymbolPnl = worstEntry?.[1] ?? (bestSymbolPnl < 0 ? bestSymbolPnl : 0);
    const fmtUsd = (n: number) => (n >= 0 ? `+$${n.toFixed(1)}` : `-$${Math.abs(n).toFixed(1)}`);

    let insightFa = '';
    let insightEn = '';
    if (shortCount >= 2 && shortPnl < -Math.abs(longPnl) * 0.5 && longPnl >= 0) {
      insightFa = `پیشنهاد مشاور AI: در جهت LONG عملکرد قوی دارید (${longWinRate.toFixed(0)}% برد)، اما معاملات SHORT عامل افت شما بوده‌اند (${fmtUsd(shortPnl)}). پیشنهاد می‌شود با دکمه زیر جهت ربات را موقتاً روی «فقط لانگ» قرار دهید.`;
      insightEn = `AI Coach Proposal: Your LONG trades perform well (${longWinRate.toFixed(0)}% WR), while SHORT trades caused ${fmtUsd(shortPnl)}. Use the quick button below to set direction to Long Only.`;
    } else if (avgLoss > avgWin * 1.25 && lossCount > 0) {
      insightFa = `پیشنهاد مشاور AI: میانگین ضرر ($${avgLoss.toFixed(1)}) از میانگین سود ($${avgWin.toFixed(1)}) بیشتر است. توصیه می‌شود اهرم ربات را به حداکثر 5× کاهش داده و ذخیره سود ریسک‌فری در TP1 را فعال کنید.`;
      insightEn = `AI Coach Proposal: Avg loss ($${avgLoss.toFixed(1)}) exceeds avg win ($${avgWin.toFixed(1)}). Lower max leverage to 5× and enable Auto-Breakeven on TP1 below.`;
    } else if (winRate >= 55 && rrRatio >= 1.1) {
      insightFa = `عملکرد بسیار منظم! نرخ برد ${winRate.toFixed(0)}% با نسبت R:R برابر ${rrRatio.toFixed(2)}. بهترین نتیجه روی ${bestSymbol} (${fmtUsd(bestSymbolPnl)}) بوده است.`;
      insightEn = `Strong discipline: ${winRate.toFixed(0)}% Win Rate and ${rrRatio.toFixed(2)} R:R. Top symbol: ${bestSymbol} (${fmtUsd(bestSymbolPnl)}).`;
    } else {
      insightFa = `خلاصه ${total} معامله بسته: نرخ برد ${winRate.toFixed(0)}% · ${bestSymbolPnl >= 0 ? `بهترین ارز ${bestSymbol} (${fmtUsd(bestSymbolPnl)})` : `نیاز به کنترل ریسک روی ${worstSymbol} (${fmtUsd(worstSymbolPnl)})`}.`;
      insightEn = `Summary over ${total} closed trades: ${winRate.toFixed(0)}% WR. ${bestSymbolPnl >= 0 ? `Best: ${bestSymbol} (${fmtUsd(bestSymbolPnl)})` : `Review risk on ${worstSymbol} (${fmtUsd(worstSymbolPnl)})`}.`;
    }

    return {
      total,
      openCount,
      winRate,
      longWinRate,
      shortWinRate,
      longPnl,
      shortPnl,
      longCount,
      shortCount,
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
  }, [data.closedTrades, data.openTrades]);

  // Actionable setting proposals generated directly from account state & AI performance
  const settingProposals = useMemo<AiSettingProposal[]>(() => {
    const list: AiSettingProposal[] = [];
    if (coachStats.shortCount >= 2 && coachStats.shortPnl < 0 && data.config.direction_mode !== 'LONG_ONLY') {
      list.push({
        id: 'long-only',
        titleFa: 'تغییر جهت ربات به «فقط LONG»',
        titleEn: 'Switch Bot to LONG ONLY',
        descFa: 'به علت افت عملکرد در معاملات شورت، تمرکز ربات روی موقعیت‌های صعودی قرار می‌گیرد.',
        descEn: 'Focus bot exclusively on LONG entries based on your positive Long win rate.',
        patch: { direction_mode: 'LONG_ONLY' },
      });
    }
    if (Number(data.config.max_leverage || 10) > 5) {
      list.push({
        id: 'cap-lev-5',
        titleFa: 'کاهش ریسک و سقف اهرم به 5× + ریسک‌فری TP1',
        titleEn: 'Cap Leverage at 5× + TP1 Breakeven',
        descFa: 'حد ضرر سریع‌تر به نقطه ورود منتقل شده و ریسک مارجین کاهش می‌یابد.',
        descEn: 'Lowers leverage ceiling to 5× and locks profit at entry after TP1.',
        patch: { max_leverage: 5, use_signal_leverage: false, auto_breakeven_on_tp1: true },
      });
    }
    if (!data.config.auto_breakeven_on_tp1) {
      list.push({
        id: 'enable-be',
        titleFa: 'فعال‌سازی ریسک‌فری خودکار پس از تارگت ۱',
        titleEn: 'Enable Auto-Breakeven on TP1',
        descFa: 'به‌محض رسیدن معامله به سود اول، حد ضرر روی نقطه ورود قفل می‌شود.',
        descEn: 'Automatically moves Stop-Loss to entry once TP1 hits.',
        patch: { auto_breakeven_on_tp1: true },
      });
    }
    if (Number(data.config.margin_pct || 10) > 12) {
      list.push({
        id: 'safe-margin',
        titleFa: 'اصلاح حجم هر معامله به ۸٪ بودجه ربات',
        titleEn: 'Set Margin per Trade to 8%',
        descFa: 'مانع درگیری بیش‌ازحد سرمایه در یک معامله می‌شود.',
        descEn: 'Prevents over-allocation into any single trade.',
        patch: { margin_pct: 8 },
      });
    }
    if (list.length === 0) {
      list.push({
        id: 'balanced-confirm',
        titleFa: 'به‌روزرسانی تنظیمات متعادل (مارجین ۱۰٪ · لوریج ۵× · ریسک‌فری فعال)',
        titleEn: 'Apply Balanced Guardrails (10% Margin · 5× Lev · Auto-BE)',
        descFa: 'پیکربندی استاندارد محافظت سرمایه متناسب با وضعیت فعلی حساب شما.',
        descEn: 'Applies standard capital-preservation defaults.',
        patch: { margin_pct: 10, max_leverage: 5, auto_breakeven_on_tp1: true, trailing_stop_pct: 1.5 },
      });
    }
    return list.slice(0, 3);
  }, [coachStats, data.config]);

  const applySettingProposal = async (p: AiSettingProposal) => {
    setBusy(true);
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify(p.patch),
      });
      pushFloatingToast(isFa ? `تنظیم پیشنهادی «${p.titleFa}» روی ربات اعمال شد` : `Applied "${p.titleEn}"`, 'success');
      await onRefresh();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const askAiCoachDeepAnalysis = async () => {
    setCoachAiBusy(true);
    try {
      const prompt = isFa
        ? `به عنوان مربی حرفه‌ای ترید و مدیر ریسک حساب، این آمار واقعی حساب من را بررسی کن و ۳ راهکار دقیق برای بالا بردن سود، کاهش ریسک و تغییر تنظیمات ربات بده:\nتعداد ترید بسته: ${coachStats.total} | وین‌ریت: ${coachStats.winRate.toFixed(1)}% | وین‌ریت لانگ: ${coachStats.longWinRate.toFixed(0)}% (${coachStats.longPnl.toFixed(1)}$) | وین‌ریت شورت: ${coachStats.shortWinRate.toFixed(0)}% (${coachStats.shortPnl.toFixed(1)}$) | میانگین سود: $${coachStats.avgWin.toFixed(1)} | میانگین ضرر: $${coachStats.avgLoss.toFixed(1)} | اهرم فعلی: ${data.config.max_leverage}× | مارجین هر معامله: ${data.config.margin_pct}% | بهترین ارز: ${coachStats.bestSymbol} | بدترین ارز: ${coachStats.worstSymbol}`
        : `Act as a pro risk manager & trading coach. Review my stats and recommend 3 exact setting & discipline upgrades: Trades=${coachStats.total}, WR=${coachStats.winRate.toFixed(1)}%, LongWR=${coachStats.longWinRate.toFixed(0)}% ($${coachStats.longPnl.toFixed(1)}), ShortWR=${coachStats.shortWinRate.toFixed(0)}% ($${coachStats.shortPnl.toFixed(1)}), AvgWin=$${coachStats.avgWin.toFixed(1)}, AvgLoss=$${coachStats.avgLoss.toFixed(1)}, MaxLev=${data.config.max_leverage}x, MarginPct=${data.config.margin_pct}%, Best=${coachStats.bestSymbol}, Worst=${coachStats.worstSymbol}`;
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

  const switchTradingMode = async (nextMode: 'PAPER' | 'LIVE') => {
    if (data.config.trading_mode === nextMode) return;
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message?: string;
        warningCode?: 'NO_TRUST_WALLET' | 'MIN_BALANCE_10_USD';
      }>('/api/trustwallet/execution-mode', {
        method: 'POST',
        body: JSON.stringify({
          tradingMode: nextMode,
          executionMode: data.config.trade_execution_mode === 'MANUAL_CONFIRM' ? 'MANUAL_CONFIRM' : 'AUTO',
        }),
      });
      pushFloatingToast(
        res.message ||
          (nextMode === 'LIVE'
            ? isFa ? 'حساب روی حالت واقعی Trust Wallet قرار گرفت' : 'Switched to Real Trust Wallet mode'
            : isFa ? 'حساب روی حالت شبیه‌ساز دمو قرار گرفت' : 'Switched to Demo Simulator mode'),
        res.warningCode ? 'warn' : 'success'
      );
      await onRefresh();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Mode switch failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAccountNote = async (customTitle?: string, customBody?: string, customCat?: 'NOTE' | 'STRATEGY' | 'AI_ADVICE') => {
    const content = (customBody ?? noteContent).trim();
    if (!content) return;
    setNotesBusy(true);
    try {
      await apiFetch('/api/trading/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: (customTitle ?? noteTitle).trim(),
          content,
          category: customCat ?? noteCategory,
        }),
      });
      if (!customBody) {
        setNoteTitle('');
        setNoteContent('');
      }
      pushFloatingToast(isFa ? 'یادداشت شخصی در کیف‌پول ذخیره شد' : 'Personal note saved', 'success');
      loadNotes();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Save note failed', 'error');
    } finally {
      setNotesBusy(false);
    }
  };

  const deleteAccountNote = async (id: string) => {
    try {
      await apiFetch(`/api/trading/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // ignore
    }
  };

  const freeCash = Number(data.balance.free || 0);
  const usedMargin = Number(data.balance.used || 0);
  const totalEq = Number(data.balance.total ?? freeCash + usedMargin);
  const demoBalDisplay = Number(
    data.walletSummary?.demoBalanceUsd ??
      (data.config.trading_mode === 'PAPER' ? totalEq : Number(data.config.custom_paper_balance || data.config.paper_balance || 10000))
  );
  const liveBalDisplay = Number(
    data.walletSummary?.liveBalanceUsd ??
      (data.config.trading_mode === 'LIVE' ? totalEq : 0)
  );
  const dexTradesAll = data.dexTrades || [];
  const openDexTrades = useMemo(
    () => dexTradesAll.filter((t) => t.status === 'OPEN' || t.status === 'PENDING_SIGN'),
    [dexTradesAll]
  );
  const openSmartCopy = useMemo(
    () => (data.smartCopyPositions || []).filter((p) => p.status === 'OPEN' || p.status === 'PENDING_TRUST_SIGN'),
    [data.smartCopyPositions]
  );
  const openPerpOrders = useMemo(
    () => (data.perpOrders || []).filter((o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED'),
    [data.perpOrders]
  );
  const totalOpenCount =
    data.openTrades.length + openDexTrades.length + openSmartCopy.length + openPerpOrders.length;

  const openBreakdown = useMemo(() => {
    let profitableCount = 0;
    let losingCount = 0;
    let sum = 0;
    for (const t of data.openTrades) {
      const p = Number(t.unrealized_pnl || 0);
      sum += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const d of openDexTrades) {
      if (d.status !== 'OPEN') continue;
      const p = Number(d.unrealized_pnl_usd || 0);
      sum += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const cp of openSmartCopy) {
      if (cp.status !== 'OPEN') continue;
      const p = Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
      sum += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    for (const po of openPerpOrders) {
      const p = Number(po.unrealized_pnl_usd || 0);
      sum += p;
      if (p > 0) profitableCount++;
      else if (p < 0) losingCount++;
    }
    return { profitableCount, losingCount, sum };
  }, [data.openTrades, openDexTrades, openSmartCopy, openPerpOrders]);

  const unreal = data.stats.unrealizedPnl ?? openBreakdown.sum;

  const curveSeries = useMemo(() => {
    const raw = data.charts.equityCurve || [];
    const pts =
      raw.length >= 2
        ? raw.map((x) => ({
            time: x.time,
            label: x.label,
            equity: Number(x.equity || 0),
          }))
        : [
            { time: Math.floor(Date.now() / 1000) - 3600, label: 'Start', equity: totalEq },
            { time: Math.floor(Date.now() / 1000), label: 'Live Now', equity: totalEq },
          ];
    if (range === '1D') return pts.slice(-12);
    if (range === '1W') return pts.slice(-36);
    if (range === '1M') return pts.slice(-90);
    return pts;
  }, [data.charts.equityCurve, range, totalEq]);

  const curvePoints = useMemo(() => curveSeries.map((p) => p.equity), [curveSeries]);

  const slices = useMemo(() => {
    const bySym = new Map<string, number>();
    data.openTrades.forEach((p) => bySym.set(p.symbol, (bySym.get(p.symbol) ?? 0) + Number(p.margin_used || 0)));
    openDexTrades.forEach((d) =>
      bySym.set(`${d.token_symbol} (${d.chain_id.toUpperCase()})`, (bySym.get(`${d.token_symbol} (${d.chain_id.toUpperCase()})`) ?? 0) + Number(d.amount_usd || 0))
    );
    openSmartCopy.forEach((cp) =>
      bySym.set(`${cp.token_symbol} (COPY)`, (bySym.get(`${cp.token_symbol} (COPY)`) ?? 0) + Number(cp.margin_usd || 0))
    );
    openPerpOrders.forEach((po) =>
      bySym.set(`${po.symbol} (PERP)`, (bySym.get(`${po.symbol} (PERP)`) ?? 0) + Number(po.margin_usd || 0))
    );
    const palette = ['#F59E0B', '#1652F0', '#8B5CF6', '#EF4444', '#06B6D4'];
    const items = [...bySym.entries()].map(([sym, val], idx) => ({
      label: sym.replace('USDT', ''),
      value: Math.max(1, val),
      color: palette[idx % palette.length]!,
    }));
    items.unshift({ label: 'USDT', value: Math.max(1, freeCash), color: '#10B981' });
    return items;
  }, [data.openTrades, openDexTrades, openSmartCopy, openPerpOrders, freeCash]);

  const assetCards = useMemo(() => {
    const map = new Map<string, { symbol: string; base: string; usd: number; count: number; pnl: number; chainId?: string; kindTag?: string }>();
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
    openDexTrades.forEach((d) => {
      const key = `${d.token_symbol}_${d.chain_id}`;
      const prev = map.get(key) ?? {
        symbol: `${d.token_symbol}USDT`,
        base: d.token_symbol,
        usd: 0,
        count: 0,
        pnl: 0,
        chainId: d.chain_id,
        kindTag: d.source_key === 'SNIPER' ? 'Sniper' : 'DEX',
      };
      prev.usd += Number(d.amount_usd || 0);
      prev.count += 1;
      prev.pnl += Number(d.unrealized_pnl_usd || 0);
      map.set(key, prev);
    });
    openSmartCopy.forEach((cp) => {
      const key = `${cp.token_symbol}_copy_${cp.chain_id}`;
      const prev = map.get(key) ?? {
        symbol: `${cp.token_symbol}USDT`,
        base: cp.token_symbol,
        usd: 0,
        count: 0,
        pnl: 0,
        chainId: cp.chain_id,
        kindTag: 'Copy',
      };
      prev.usd += Number(cp.margin_usd || 0);
      prev.count += 1;
      prev.pnl += Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
      map.set(key, prev);
    });
    openPerpOrders.forEach((po) => {
      const base = po.symbol.replace('USDT', '').replace('/', '');
      const key = `${base}_perp`;
      const prev = map.get(key) ?? {
        symbol: po.symbol.includes('USDT') ? po.symbol : `${po.symbol}USDT`,
        base,
        usd: 0,
        count: 0,
        pnl: 0,
        kindTag: 'Perp DEX',
      };
      prev.usd += Number(po.margin_usd || 0);
      prev.count += 1;
      prev.pnl += Number(po.unrealized_pnl_usd || 0);
      map.set(key, prev);
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
  }, [data.openTrades, openDexTrades, openSmartCopy, openPerpOrders, freeCash, assetQ, hideZero, isFa]);

  const closeOne = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trading/positions/${id}/close`, { method: 'POST' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const closeDexTrade = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/trustwallet/dex-trades/${id}/close`, { method: 'POST', body: JSON.stringify({}) });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const closeSmartCopy = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/copy-trade/positions-v2/${id}/action`, { method: 'POST', body: JSON.stringify({ action: 'CLOSE' }) });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const closePerpOrder = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/dex/perp-orders/${id}/close`, { method: 'POST' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const closeBatch = async (scope: 'ALL_PROFITABLE' | 'ALL_LOSING') => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; closedCount: number; realizedTotalUsd: number }>(
        '/api/trading/positions/close-batch',
        { method: 'POST', body: JSON.stringify({ scope }) }
      );
      pushFloatingToast(
        res.closedCount > 0
          ? isFa
            ? `${res.closedCount} معامله با مجموع $${res.realizedTotalUsd.toFixed(2)} بسته شد.`
            : `Closed ${res.closedCount} trades ($${res.realizedTotalUsd.toFixed(2)}).`
          : isFa
            ? 'معامله‌ای در این دسته پیدا نشد.'
            : 'No matching positions found.',
        res.closedCount > 0 ? 'success' : 'info'
      );
      await onRefresh();
    } catch (e) {
      pushFloatingToast(e instanceof Error ? e.message : 'Batch close failed', 'error');
    } finally {
      setBusy(false);
    }
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
  const isPaper = data.config.trading_mode === 'PAPER';

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* 1. Cosmic Safe Vault & Trust Wallet Hero Card with Real / Demo Switcher */}
      <div className="ios-vault-card rounded-[30px] p-5 sm:p-7 text-white relative overflow-hidden shadow-2xl space-y-5">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] font-black inline-flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              <span>
                {isPaper
                  ? isFa ? 'شبیه‌ساز دمو تراست‌ولت' : 'TRUST WALLET DEMO'
                  : isFa ? 'کیف‌پول Trust Wallet واقعی' : 'TRUST WALLET LIVE'}
              </span>
            </span>

            {/* Real / Demo Mode Switcher matching OverviewPage */}
            <div className="inline-flex items-center rounded-full bg-black/35 p-0.5 border border-white/20 text-[11px] font-black">
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchTradingMode('PAPER')}
                className={`px-3 py-1 rounded-full transition inline-flex items-center gap-1 ${isPaper ? 'bg-amber-400 text-slate-950 shadow' : 'text-white/80 hover:text-white'}`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                {isFa ? (
                  <span>
                    دمو (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${Math.round(demoBalDisplay).toLocaleString('en-US')}</span>)
                  </span>
                ) : (
                  `Demo ($${Math.round(demoBalDisplay).toLocaleString('en-US')})`
                )}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void switchTradingMode('LIVE')}
                className={`px-3 py-1 rounded-full transition inline-flex items-center gap-1 ${!isPaper ? 'bg-emerald-500 text-white shadow' : 'text-white/80 hover:text-white'}`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {isFa ? (
                  <span>
                    حساب واقعی (<span dir="ltr" className="inline-block" style={{ unicodeBidi: 'isolate' }}>${liveBalDisplay.toLocaleString('en-US', { minimumFractionDigits: liveBalDisplay < 10 ? 2 : 0, maximumFractionDigits: 2 })}</span>)
                  </span>
                ) : (
                  `Real ($${liveBalDisplay.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHideBal((v) => !v)}
              className="ios-glass-btn p-2 rounded-full"
              aria-label="Toggle balance"
            >
              {hideBal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => void onRefresh()}
              className="ios-glass-btn p-2 rounded-full"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative z-10 text-center space-y-1.5 py-1">
          <p className="text-xs text-white/80 font-bold">
            {isFa
              ? `ارزش کل سرمایه (${isPaper ? 'حساب دمو' : 'مستقیماً داخل Trust Wallet شما'})`
              : `Total Capital Equity (${isPaper ? 'Demo' : 'Inside Your Trust Wallet'})`}
          </p>
          <p dir="ltr" className="font-display font-bold text-4xl sm:text-5xl tabular text-white font-num drop-shadow">
            {hideBal
              ? '••••••'
              : `$${totalEq.toLocaleString('en-US', {
                  minimumFractionDigits: !isPaper && totalEq < 100 ? 2 : 0,
                  maximumFractionDigits: 2,
                })}`}
          </p>
          {!hideBal && isFa && (
            <p className="text-xs text-white/90 font-semibold">
              معادل {formatTomanEq(totalEq, liveIrt)} تومان (نرخ زنده: {Math.round(liveIrt).toLocaleString('en-US')} ت)
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px]">
            <span className="ios-glass-stat px-3 py-1 rounded-full text-white/90 inline-flex items-center gap-1">
              <span>{isFa ? 'آزاد:' : 'Free:'}</span>
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="inline-block font-num font-black text-white">
                ${freeCash.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span className="ios-glass-stat px-3 py-1 rounded-full text-white/90 inline-flex items-center gap-1">
              <span>{isFa ? 'درگیر:' : 'Used:'}</span>
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="inline-block font-num font-black text-white">
                ${usedMargin.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className={`inline-block ios-glass-stat px-3 py-1 rounded-full font-black font-num ${unreal >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {unreal >= 0 ? `+$${unreal.toFixed(2)}` : `-$${Math.abs(unreal).toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Open Dotted Allocation Strip + Color Legend */}
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

      {/* 3. Asset History & Growth Chart */}
      <div className="panel rounded-[26px] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-base text-main">{isFa ? 'نمودار رشد و تاریخچه دارایی' : 'Asset History & Equity Curve'}</h3>
            <p className="text-[11px] text-dim flex items-center gap-1.5 flex-wrap">
              <span>{isFa ? `نرخ برد: ${data.stats.winRate.toFixed(0)}% · کل سود:` : `Win Rate ${data.stats.winRate.toFixed(0)}% · Total PnL:`}</span>
              <span
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
                className={`inline-block font-num font-black ${data.stats.totalPnl >= 0 ? 'text-jade' : 'text-loss'}`}
              >
                {data.stats.totalPnl >= 0 ? `+$${data.stats.totalPnl.toFixed(2)}` : `-$${Math.abs(data.stats.totalPnl).toFixed(2)}`}
              </span>
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
        <div className="h-[250px] rounded-2xl surface-soft border hairline p-3">
          <AreaChart
            values={curvePoints}
            points={curveSeries}
            baseline={curveSeries[0]?.equity ?? totalEq}
            height={224}
          />
        </div>
      </div>

      {/* 4. Holdings Breakdown */}
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
              placeholder={isFa ? 'جستجوی ارز در کیف‌پول...' : 'Search holding...'}
              className="bg-transparent flex-1 text-xs text-main outline-none placeholder:text-dim"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {assetCards.map((a) => (
            <button
              key={`${a.base}_${a.chainId || a.kindTag || 'cex'}`}
              type="button"
              onClick={() => (a.chainId ? setLedgerTab('wallet') : onOpenTerminal(a.base === 'USDT' ? 'BTCUSDT' : `${a.base}USDT`))}
              className="panel panel-hover rounded-[22px] p-4 flex flex-col justify-between gap-3 text-start"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {a.chainId ? <ChainLogo chain={a.chainId} size={30} /> : <CoinIcon symbol={a.symbol} size={32} />}
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm text-main truncate">
                      {a.chainId ? a.base : coinDisplayName(a.base, isFa)}
                    </p>
                    <p className="text-[10px] font-bold text-dim uppercase">
                      {a.chainId ? `${a.chainId} · ${a.kindTag || 'DEX'}` : a.kindTag ? `${a.base} · ${a.kindTag}` : a.base}
                    </p>
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
                  {isFa && <p className="text-[10px] text-dim">{formatTomanEq(a.usd, liveIrt)} تومان</p>}
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

      {/* 5. AI Performance Coach & One-Click Setting Change Proposals */}
      <div className="panel rounded-[26px] p-5 space-y-3.5 border border-[#1652f0]/25">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl btn-cobalt grid place-items-center shrink-0">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm sm:text-base text-main">
                {isFa ? 'مشاور هوشمند حساب و پیشنهاد تغییر تنظیمات' : 'AI Account Advisor & Setting Proposals'}
              </h3>
              <p className="text-[11px] text-dim">
                {isFa ? 'تحلیل نقاط قوت/ضعف حساب همراه با دکمه اعمال مستقیم تغییرات روی ربات' : 'Performance review with 1-click bot optimization proposals'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={coachAiBusy}
            onClick={() => void askAiCoachDeepAnalysis()}
            className="btn-cobalt px-3.5 py-2 rounded-xl text-[11px] font-black inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{coachAiBusy ? '...' : isFa ? 'تحلیل عمیق حساب با AI' : 'Ask AI Coach'}</span>
          </button>
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
              <p className="text-[10px] text-dim">{coachStats.bestSymbolPnl >= 0 ? (isFa ? 'بهترین ارز' : 'Best Coin') : isFa ? 'کم‌ضررترین' : 'Least Loss'}</p>
              <p dir="ltr" className={`font-num font-black mt-0.5 ${coachStats.bestSymbolPnl >= 0 ? 'text-jade' : 'text-amber-500'}`}>
                {coachStats.bestSymbol.replace('USDT', '')}
              </p>
            </div>
            <div className="surface-soft rounded-2xl p-2.5">
              <p className="text-[10px] text-dim">{isFa ? 'پرضررترین ارز' : 'Weakest Coin'}</p>
              <p dir="ltr" className={`font-num font-black mt-0.5 ${coachStats.worstSymbolPnl < 0 ? 'text-loss' : 'text-main'}`}>
                {coachStats.worstSymbol.replace('USDT', '')}
              </p>
            </div>
          </div>
        )}

        <div className="surface-soft rounded-2xl p-3.5 text-xs text-sub leading-relaxed whitespace-pre-wrap space-y-2">
          <p>{coachAiNote ?? (isFa ? coachStats.insightFa : coachStats.insightEn)}</p>
          {coachAiNote && (
            <button
              type="button"
              disabled={notesBusy}
              onClick={() => void saveAccountNote(isFa ? 'پیشنهاد هوش مصنوعی' : 'AI Coach Insight', coachAiNote, 'AI_ADVICE')}
              className="text-[11px] font-black text-[#0D47A1] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFa ? 'ذخیره این تحلیل در یادداشت‌های من' : 'Save Insight to My Notes'}</span>
            </button>
          )}
        </div>

        {/* One-Click Proposed Config Updates */}
        <div className="space-y-2">
          <p className="text-[11px] font-black text-main">
            {isFa ? 'تغییرات پیشنهادی قابل اجرا برای بهینه‌سازی حساب:' : 'Actionable Setting Proposals:'}
          </p>
          <div className="grid gap-2">
            {settingProposals.map((p) => (
              <div key={p.id} className="rounded-2xl surface-soft border hairline p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-main">{isFa ? p.titleFa : p.titleEn}</p>
                  <p className="text-[11px] text-dim">{isFa ? p.descFa : p.descEn}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applySettingProposal(p)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-black inline-flex items-center gap-1 shrink-0 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اعمال روی تنظیمات' : 'Apply Setting'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Personal Notes & Trading Journal */}
      <div className="panel rounded-[26px] p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-[#D97706] grid place-items-center shrink-0">
            <NotebookPen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm sm:text-base text-main">
              {isFa ? 'یادداشت‌های شخصی و ژورنال معامله‌گر' : 'Personal Account Notes & Journal'}
            </h3>
            <p className="text-[11px] text-dim">
              {isFa ? 'استراتژی، نقاط مهم و نکات شخصی خود را برای حساب و ربات ثبت و نگهداری کنید' : 'Keep personal strategy notes, lessons, and account observations'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl surface-soft border hairline p-3.5 space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder={isFa ? 'عنوان کوتاه (اختیاری)' : 'Short title (optional)'}
              className="input-pro flex-1 min-w-[160px] px-3 py-2 rounded-xl text-xs"
            />
            <select
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value as typeof noteCategory)}
              className="input-pro px-3 py-2 rounded-xl text-xs font-bold"
            >
              <option value="NOTE">{isFa ? 'یادداشت شخصی' : 'Personal Note'}</option>
              <option value="STRATEGY">{isFa ? 'استراتژی و قوانین' : 'Strategy Rule'}</option>
              <option value="AI_ADVICE">{isFa ? 'نکته هوش مصنوعی' : 'AI Advice'}</option>
            </select>
          </div>
          <textarea
            rows={2}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder={isFa ? 'متن یادداشت یا تجربه ترید امروزتان را بنویسید...' : 'Write your trading journal note or rule...'}
            className="input-pro w-full px-3 py-2 rounded-xl text-xs resize-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={notesBusy || !noteContent.trim()}
              onClick={() => void saveAccountNote()}
              className="px-4 py-2 rounded-xl bg-[#0D47A1] hover:bg-[#1565C0] text-white text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{notesBusy ? '...' : isFa ? 'ذخیره یادداشت' : 'Save Note'}</span>
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="text-center text-xs text-dim py-3">{isFa ? 'هنوز یادداشتی ثبت نکرده‌اید.' : 'No personal notes yet.'}</p>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {notes.map((n) => (
              <div key={n.id} className="surface-soft rounded-2xl border hairline p-3 flex items-start justify-between gap-2 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-[#D97706] text-[10px] font-black">{n.category}</span>
                    {n.title && <span className="font-black text-main">{n.title}</span>}
                    <span className="text-[10px] text-dim">{n.created_at.slice(0, 16)}</span>
                  </div>
                  <p className="text-sub whitespace-pre-wrap leading-relaxed">{n.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteAccountNote(n.id)}
                  className="text-dim hover:text-loss p-1 shrink-0"
                  aria-label="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7. Unified Work Reports, Open/Closed Trades & Integrated Wallet/DEX Ledger */}
      <div className="panel rounded-[26px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="tab-bar w-full overflow-x-auto">
            {[
              { id: 'open' as const, l: isFa ? `معاملات باز (${totalOpenCount})` : `Open (${totalOpenCount})` },
              { id: 'closed' as const, l: isFa ? `تاریخچه (${data.closedTrades.length})` : `History (${data.closedTrades.length})` },
              { id: 'wallet' as const, l: isFa ? `کیف‌پول و تراکنش‌ها (${dexTradesAll.length})` : `Wallet & DEX (${dexTradesAll.length})` },
              { id: 'logs' as const, l: isFa ? 'گزارش کار ربات' : 'Work Reports' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLedgerTab(t.id)}
                className={`tab-pill flex-1 whitespace-nowrap ${ledgerTab === t.id ? 'tab-pill-active' : ''}`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {ledgerTab === 'open' && (
          totalOpenCount === 0 ? (
            <div className="py-10 text-center text-xs text-dim">{isFa ? 'معامله بازی ندارید.' : 'No open positions.'}</div>
          ) : (
            <div className="space-y-3">
              {(openBreakdown.profitableCount > 0 || openBreakdown.losingCount > 0) && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {openBreakdown.profitableCount > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeBatch('ALL_PROFITABLE')}
                      className="px-3.5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black shadow-xs"
                    >
                      {isFa ? `برداشت همه سودها (${openBreakdown.profitableCount})` : `Take All Profit (${openBreakdown.profitableCount})`}
                    </button>
                  )}
                  {openBreakdown.losingCount > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeBatch('ALL_LOSING')}
                      className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white border border-rose-500/30 text-xs font-black"
                    >
                      {isFa ? `بستن همه ضررها (${openBreakdown.losingCount})` : `Close All Losing (${openBreakdown.losingCount})`}
                    </button>
                  )}
                </div>
              )}

              {data.openTrades.map((p) => {
                const u = Number(p.unrealized_pnl || 0);
                const long = p.direction === 'LONG';
                const srcLabel = isFa ? p.source_label_fa || 'ربات استراتژی' : p.source_label_en || 'Strategy Bot';
                return (
                  <div key={p.id} className="rounded-2xl bg-[var(--soft)] border hairline p-4 flex flex-wrap items-center gap-3 text-xs">
                    <CoinIcon symbol={p.symbol} size={32} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={() => onOpenTerminal(p.symbol)} className="font-bold text-main hover:underline">
                          {p.symbol}
                        </button>
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded ${long ? 'bg-jade/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
                          {long ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {p.direction} {p.leverage}×
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/12 text-brand">
                          {srcLabel}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Entry ${p.entry_price} → Now ${p.mark_price ?? p.entry_price} · Margin ${p.margin_used}
                      </p>
                    </div>
                    <span dir="ltr" className={`ms-auto font-display font-bold text-base tabular ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {u >= 0 ? `+$${u.toFixed(2)}` : `-$${Math.abs(u).toFixed(2)}`}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeOne(p.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}

              {openDexTrades.map((d) => {
                const u = Number(d.unrealized_pnl_usd || 0);
                const srcLabel = isFa ? d.source_label_fa || 'DEX / اسنایپر' : d.source_label_en || 'DEX / Sniper';
                return (
                  <div key={d.id} className="rounded-2xl bg-[var(--soft)] border hairline p-4 flex flex-wrap items-center gap-3 text-xs">
                    <ChainLogo chain={d.chain_id} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="font-bold text-main">{d.token_symbol}</strong>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 uppercase">
                          {d.chain_id} · {srcLabel}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Size ${Number(d.amount_usd).toFixed(2)} · Entry ${Number(d.entry_price_usd).toPrecision(4)} → Live ${Number(d.live_price_usd).toPrecision(4)}
                      </p>
                    </div>
                    <span dir="ltr" className={`ms-auto font-display font-bold text-base tabular ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {u >= 0 ? `+$${u.toFixed(2)}` : `-$${Math.abs(u).toFixed(2)}`}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeDexTrade(d.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{d.status === 'PENDING_SIGN' ? (isFa ? 'لغو' : 'Cancel') : isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}

              {openSmartCopy.map((cp) => {
                const u = Number(cp.unrealized_pnl_usd ?? cp.pnl_usd ?? 0);
                return (
                  <div key={cp.id} className="rounded-2xl bg-[var(--soft)] border hairline p-4 flex flex-wrap items-center gap-3 text-xs">
                    <ChainLogo chain={cp.chain_id} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="font-bold text-main">{cp.token_symbol}</strong>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-jade">
                          {isFa ? cp.source_label_fa || `کپی‌ترید (${cp.trader_label})` : cp.source_label_en || `Copy (${cp.trader_label})`}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Size ${Number(cp.margin_usd).toFixed(2)} · Entry ${Number(cp.entry_price_usd).toPrecision(4)} → Live ${Number(cp.live_price_usd ?? cp.current_price_usd).toPrecision(4)}
                      </p>
                    </div>
                    <span dir="ltr" className={`ms-auto font-display font-bold text-base tabular ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {u >= 0 ? `+$${u.toFixed(2)}` : `-$${Math.abs(u).toFixed(2)}`}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closeSmartCopy(cp.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-loss hover:text-white font-black transition inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بستن' : 'Close'}</span>
                    </button>
                  </div>
                );
              })}

              {openPerpOrders.map((po) => {
                const u = Number(po.unrealized_pnl_usd || 0);
                return (
                  <div key={po.id} className="rounded-2xl bg-[var(--soft)] border hairline p-4 flex flex-wrap items-center gap-3 text-xs">
                    <CoinIcon symbol={po.symbol} size={30} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="font-bold text-main">{po.symbol}</strong>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                          {po.side} {po.leverage}× · {isFa ? po.source_label_fa || po.venue : po.source_label_en || po.venue}
                        </span>
                      </div>
                      <p dir="ltr" className="text-[11px] text-dim tabular mt-0.5">
                        Margin ${Number(po.margin_usd).toFixed(2)} · Entry ${Number(po.entry_price).toFixed(2)}
                      </p>
                    </div>
                    <span dir="ltr" className={`ms-auto font-display font-bold text-base tabular ${u >= 0 ? 'text-jade' : 'text-loss'}`}>
                      {u >= 0 ? `+$${u.toFixed(2)}` : `-$${Math.abs(u).toFixed(2)}`}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void closePerpOrder(po.id)}
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
                      {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        )}

        {ledgerTab === 'wallet' && (
          <div className="space-y-4">
            <DexPortfolioPanel
              lang={lang}
              tradingMode={isPaper ? 'PAPER' : 'LIVE'}
              initialTrades={dexTradesAll}
              onAfterChange={onRefresh}
            />

            <div className="space-y-2 border-t hairline pt-4">
              <p className="text-xs font-black text-main">{isFa ? 'گردش مالی کیف‌پول' : 'Wallet Ledger'}</p>
              {walletLedger.length === 0 ? (
                <div className="py-6 text-center text-xs text-dim">{isFa ? 'تراکنش مالی ثبت نشده است.' : 'No wallet transactions yet.'}</div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto text-xs">
                  {walletLedger.map((w) => (
                    <div key={w.id} className="surface-soft rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-main">{w.event_type}</span>
                        {w.note && <p className="text-[11px] text-dim">{w.note}</p>}
                      </div>
                      <div dir="ltr" className="text-end font-num">
                        <span className={`font-bold ${w.amount_usd >= 0 ? 'text-jade' : 'text-loss'}`}>
                          {Number(w.amount_usd) >= 0 ? `+$${Number(w.amount_usd).toFixed(2)}` : `-$${Math.abs(Number(w.amount_usd)).toFixed(2)}`}
                        </span>
                        <p className="text-[10px] text-dim">Bal: ${Number(w.balance_after).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                <input value={logQ} onChange={(e) => setLogQ(e.target.value)} placeholder={isFa ? 'جستجو در گزارش کار ربات...' : 'Filter logs...'} className="field ps-9 py-2 text-xs" />
              </div>
              <button
                type="button"
                onClick={() => void apiFetch<{ logs: AuditLog[] }>('/api/trading/logs').then((r) => setLogs(r.logs || []))}
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
