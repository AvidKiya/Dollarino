import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Layers,
  Lock,
  Monitor,
  QrCode,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Target,
  TrendingUp,
} from 'lucide-react';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { CoinIcon } from '../components/CoinIcon';
import { apiFetch, getStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import { pushFloatingToast } from '../lib/toast';
import type {
  DashboardPayload,
  EligibleCardTrade,
  ProfitCardPeriod,
  ProfitCardSource,
  VerifiedProfitCard,
} from '../lib/types';

const THEMES = [
  { id: 'dark', labelFa: 'کبالت رسمی', labelEn: 'Cobalt Official', from: '#071436', to: '#040917', accent: '#38e1ff', text: '#eef2ff' },
  { id: 'gold', labelFa: 'طلایی لوکس', labelEn: 'Obsidian Gold', from: '#2b1e06', to: '#0a0805', accent: '#f0b90b', text: '#f5e8bd' },
  { id: 'emerald', labelFa: 'سبز سیگنال', labelEn: 'Emerald Mint', from: '#04281d', to: '#03120d', accent: '#10d9a3', text: '#d9fff0' },
  { id: 'violet', labelFa: 'رویال کوانت', labelEn: 'Royal Quant', from: '#1c0c3a', to: '#070819', accent: '#c084fc', text: '#f2eaff' },
] as const;

type StyleId = (typeof THEMES)[number]['id'];
type CardLayout = 'horizontal' | 'vertical';

function fmtUsdSigned(val: number): string {
  const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return val >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtPctSigned(val: number): string {
  const abs = Math.abs(val).toFixed(2);
  return val >= 0 ? `+${abs}%` : `-${abs}%`;
}

function fmtPriceUsd(val: number | null | undefined): string {
  const n = Number(val || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function periodTitle(p: ProfitCardPeriod, isFa: boolean): string {
  switch (p) {
    case '24H':
      return isFa ? '۲۴ ساعته' : '24 Hours';
    case '7D':
      return isFa ? 'هفتگی' : 'Weekly (7D)';
    case '30D':
      return isFa ? 'ماهانه' : 'Monthly (30D)';
    case '3M':
      return isFa ? '۳ ماهه' : '3 Months';
    case '6M':
      return isFa ? '۶ ماهه' : '6 Months';
    case '1Y':
      return isFa ? 'سالانه' : 'Yearly (1Y)';
    case 'ALL':
      return isFa ? 'کل دوره' : 'All Time';
    case 'TRADE':
      return isFa ? 'تک‌معامله' : 'Single Trade';
  }
}

function sourceTitle(s: ProfitCardSource | undefined, isFa: boolean): string {
  switch (s || 'ALL') {
    case 'PERP':
      return isFa ? 'فیوچرز و اسپات' : 'Perp & Spot';
    case 'DEX':
      return isFa ? 'تراست‌ولت و DEX' : 'DEX & Sniper';
    case 'COPY':
      return isFa ? 'کپی‌ترید هوشمند' : 'Smart Copy';
    default:
      return isFa ? 'همه معاملات' : 'All Engines';
  }
}

export function WeeklyCardPage({
  lang,
  username,
  data,
}: {
  lang: Lang;
  username: string;
  data: DashboardPayload;
}) {
  const isFa = lang === 'fa';
  const [mode, setMode] = useState<'LIVE' | 'PAPER'>(data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER');
  const [tradeSource, setTradeSource] = useState<ProfitCardSource>('ALL');
  const [period, setPeriod] = useState<ProfitCardPeriod>('7D');
  const [layout, setLayout] = useState<CardLayout>('vertical');
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [eligibleTrades, setEligibleTrades] = useState<EligibleCardTrade[]>([]);
  const [cardStyle, setCardStyle] = useState<StyleId>('dark');
  const [issuedCard, setIssuedCard] = useState<VerifiedProfitCard | null>(null);
  const [archive, setArchive] = useState<VerifiedProfitCard[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingTg, setSendingTg] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (errorMsg) {
      pushFloatingToast(errorMsg, 'error');
      setErrorMsg('');
    }
  }, [errorMsg]);

  useEffect(() => {
    if (notice) {
      pushFloatingToast(notice, 'success');
      setNotice('');
    }
  }, [notice]);

  const theme = THEMES.find((x) => x.id === cardStyle) ?? THEMES[0]!;

  const loadEligibleTrades = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok: boolean; trades: EligibleCardTrade[] }>(
        `/api/trading/cards/eligible-trades?mode=${mode}&tradeSource=${tradeSource}`
      );
      setEligibleTrades(res.trades || []);
      if (res.trades && res.trades.length > 0 && !res.trades.some((t) => t.id === selectedTradeId)) {
        setSelectedTradeId(res.trades[0]!.id);
      }
    } catch {
      /* ignore */
    }
  }, [mode, tradeSource, selectedTradeId]);

  useEffect(() => {
    void loadEligibleTrades();
  }, [loadEligibleTrades]);

  const loadArchive = useCallback(async () => {
    try {
      const res = await apiFetch<{ cards: Array<Record<string, unknown>> }>('/api/trading/cards');
      const mapped: VerifiedProfitCard[] = (res.cards || []).map((r) => {
        let p: Record<string, unknown> = {};
        try {
          p = JSON.parse(String(r.payload_json || '{}')) as Record<string, unknown>;
        } catch {
          p = {};
        }
        const m = String(r.mode || 'LIVE') === 'PAPER' ? 'PAPER' : 'LIVE';
        const revoked = Number(r.revoked || 0) === 1;
        return {
          id: String(r.id),
          userId: String(r.user_id),
          displayName: username,
          mode: m,
          isVerifiedReal: m === 'LIVE' && !revoked,
          revoked,
          tradeSource: String(r.trade_source || p.tradeSource || 'ALL') as ProfitCardSource,
          period: String(r.period || '7D') as ProfitCardPeriod,
          startDate: String(r.start_date),
          endDate: String(r.end_date),
          tradesCount: Number(r.trades_count || 0),
          winRate: Number(r.win_rate || 0),
          netPnlUsd: Number(r.net_pnl_usd || 0),
          roiPct: Number(r.roi_pct || 0),
          profitFactor: Number(r.profit_factor || 0),
          exchangeProvider: String(r.exchange_provider || 'TRUST WALLET'),
          strategyName: String(r.strategy_name || 'هوش مصنوعی دلارینو'),
          engineKey: typeof p.engineKey === 'string' ? p.engineKey : undefined,
          cardStyle: typeof p.cardStyle === 'string' ? p.cardStyle : 'dark',
          symbol: typeof p.symbol === 'string' ? p.symbol : undefined,
          baseSymbol: typeof p.baseSymbol === 'string' ? p.baseSymbol : undefined,
          direction: typeof p.direction === 'string' ? p.direction : undefined,
          leverage: typeof p.leverage === 'number' ? p.leverage : undefined,
          entryPrice: typeof r.entry_price === 'number' ? r.entry_price : typeof p.entryPrice === 'number' ? p.entryPrice : null,
          exitPrice: typeof r.exit_price === 'number' ? r.exit_price : typeof p.exitPrice === 'number' ? p.exitPrice : null,
          signalName: typeof r.signal_name === 'string' ? r.signal_name : typeof p.signalName === 'string' ? p.signalName : undefined,
          tokenAddress: typeof r.token_address === 'string' ? r.token_address : typeof p.tokenAddress === 'string' ? p.tokenAddress : undefined,
          chainId: typeof r.chain_id === 'string' ? r.chain_id : typeof p.chainId === 'string' ? p.chainId : undefined,
          tokenImageUrl: typeof r.token_image_url === 'string' ? r.token_image_url : typeof p.tokenImageUrl === 'string' ? p.tokenImageUrl : undefined,
          bestSymbol: typeof p.bestSymbol === 'string' ? p.bestSymbol : undefined,
          bestRoiPct: typeof p.bestRoiPct === 'number' ? p.bestRoiPct : undefined,
          signaturePrefix: String(r.hmac_signature || '').slice(0, 16),
          verifyPath: `/verify-card/${r.id}`,
          issuedAt: String(r.issued_at),
        };
      });
      setArchive(mapped);
      if (!issuedCard && mapped.length > 0) {
        setIssuedCard(mapped[0]!);
      }
    } catch {
      /* ignore */
    }
  }, [username, issuedCard]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    if (!issuedCard) {
      setQrDataUrl('');
      return;
    }
    const verifyUrl = `${window.location.origin}/verify-card/${issuedCard.id}`;
    QRCode.toDataURL(verifyUrl, { width: 180, margin: 1, color: { dark: '#071127', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [issuedCard]);

  const handleIssueCard = async () => {
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    try {
      const res = await apiFetch<{ ok: boolean; card: VerifiedProfitCard }>('/api/trading/cards/issue', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          tradeSource,
          period,
          tradeId: period === 'TRADE' ? selectedTradeId : undefined,
          cardStyle,
        }),
      });
      setIssuedCard(res.card);
      setNotice(
        res.card.isVerifiedReal
          ? isFa
            ? `کارت سود واقعی دلارینو صادر شد (${res.card.id})`
            : `Verified Real Profit Card issued (${res.card.id})`
          : isFa
            ? `کارت سود دمو دلارینو صادر شد (${res.card.id})`
            : `Demo Profit Card issued (${res.card.id})`
      );
      await loadArchive();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to issue verified profit card');
    } finally {
      setBusy(false);
    }
  };

  const downloadServerPng = async () => {
    if (!issuedCard) return;
    setExporting(true);
    setErrorMsg('');
    try {
      const token = getStoredToken();
      const url = `/api/trading/cards/${encodeURIComponent(issuedCard.id)}/image?layout=${layout}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('image/png')) {
        throw new Error('Server PNG fallback');
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `dollarino-profit-card-${issuedCard.id}-${layout}.png`;
      a.href = objUrl;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      setNotice(
        isFa
          ? `تصویر کارت سود دلارینو (${layout === 'horizontal' ? 'افقی 16:9 (1200×675)' : 'استوری عمودی 9:16 (1080×1920)'}) دانلود شد`
          : `Downloaded ${layout === 'horizontal' ? '16:9 (1200x675)' : '9:16 Story (1080x1920)'} Profit Card PNG`
      );
    } catch {
      await downloadCanvasFallbackPng();
    } finally {
      setExporting(false);
    }
  };

  const downloadCanvasFallbackPng = async () => {
    if (!issuedCard) return;
    await document.fonts.ready;
    const isHoriz = layout === 'horizontal';
    const W = isHoriz ? 1200 : 1080;
    const H = isHoriz ? 675 : 1920; // Exact 16:9 and 9:16 Story
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;

    const cardTheme = THEMES.find((x) => x.id === (issuedCard.cardStyle || cardStyle)) ?? theme;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, cardTheme.from);
    g.addColorStop(1, cardTheme.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    try {
      const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = '/logo.png';
      });
      ctx.save();
      ctx.globalAlpha = 0.09;
      const wmSize = isHoriz ? 380 : 520;
      ctx.drawImage(logoImg, (W - wmSize) / 2, (H - wmSize) / 2, wmSize, wmSize);
      ctx.restore();
      ctx.drawImage(logoImg, 54, 48, 68, 68);
    } catch {
      /* ignore */
    }

    ctx.strokeStyle = cardTheme.accent + '66';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(24, 24, W - 48, H - 48, 36);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Manrope, sans-serif';
    ctx.fillText('DOLLARINO VERIFIED PROFIT CARD', 138, 80);
    ctx.fillStyle = cardTheme.accent;
    ctx.font = '700 20px Manrope, sans-serif';
    ctx.fillText(
      `${issuedCard.period} · ${issuedCard.tradeSource || 'ALL'} · ${issuedCard.strategyName}`,
      138,
      110
    );

    ctx.fillStyle = issuedCard.netPnlUsd >= 0 ? '#10d9a3' : '#fb7185';
    ctx.font = `900 ${isHoriz ? 96 : 118}px Manrope, sans-serif`;
    ctx.fillText(fmtPctSigned(issuedCard.roiPct), 64, isHoriz ? 300 : 580);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${isHoriz ? 36 : 46}px Manrope, sans-serif`;
    ctx.fillText(`${fmtUsdSigned(issuedCard.netPnlUsd)} USDT`, 64, isHoriz ? 360 : 655);

    if (issuedCard.period === 'TRADE' && issuedCard.symbol) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '800 34px Manrope, sans-serif';
      ctx.fillText(
        `${issuedCard.symbol} (${issuedCard.direction || 'LONG'}${issuedCard.leverage && issuedCard.leverage > 1 ? ` ${issuedCard.leverage}x` : ''})`,
        64,
        isHoriz ? 190 : 340
      );
      ctx.font = '700 24px Manrope, sans-serif';
      ctx.fillStyle = cardTheme.accent;
      ctx.fillText(
        `Entry: ${fmtPriceUsd(issuedCard.entryPrice)}  ->  Exit: ${fmtPriceUsd(issuedCard.exitPrice)}`,
        64,
        isHoriz ? 415 : 740
      );
    }

    if (qrDataUrl) {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = qrDataUrl;
      });
      const qSize = isHoriz ? 105 : 156;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(W - qSize - 64, H - qSize - 64, qSize + 16, qSize + 16, 18);
      ctx.fill();
      ctx.drawImage(qrImg, W - qSize - 56, H - qSize - 56, qSize, qSize);
    }

    ctx.fillStyle = 'rgba(245,242,232,0.78)';
    ctx.font = '700 20px Manrope, sans-serif';
    ctx.fillText(`Dollarino Quant Platform · Verify ID: ${issuedCard.id}`, 64, H - 64);

    const a = document.createElement('a');
    a.download = `dollarino-profit-card-${issuedCard.id}-${layout}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
    setNotice(isFa ? 'تصویر کارت سود با مهر اصالت دانلود شد' : 'Profit Card PNG downloaded');
  };

  const sendCardToTelegram = async () => {
    if (!issuedCard) return;
    setSendingTg(true);
    setErrorMsg('');
    try {
      await apiFetch(`/api/trading/cards/${encodeURIComponent(issuedCard.id)}/send-telegram`, {
        method: 'POST',
        body: JSON.stringify({ layout }),
      });
      setNotice(
        isFa
          ? `تصویر ${layout === 'horizontal' ? 'افقی ۱۶:۹' : 'استوری عمودی ۹:۱۶'} کارت سود مستقیم به تلگرام شما ارسال شد.`
          : `Profit Card PNG sent to your connected Telegram bot.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Telegram dispatch failed');
    } finally {
      setSendingTg(false);
    }
  };

  const activeTheme = THEMES.find((t) => t.id === (issuedCard?.cardStyle || cardStyle)) ?? theme;
  const isSingleCard = issuedCard?.period === 'TRADE';
  const heroCoin = issuedCard?.baseSymbol || issuedCard?.bestSymbol || issuedCard?.symbol || 'BTC';

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--gold)' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>DOLLARINO PROFIT CARD STUDIO · 9:16 STORY &amp; 16:9</span>
        </p>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
          {isFa ? 'استودیو کارت سود دلارینو' : 'Dollarino Profit Card Studio'}
        </h2>
        <p className="text-xs sm:text-sm text-dim mt-2">
          {isFa
            ? 'کارت سود برای تمام معاملات (فیوچرز، تراست‌ولت/DEX و کپی‌ترید)، از ۲۴ ساعته تا ۳ماهه، ۶ماهه، سالانه و تک‌معامله با آیکون اختصاصی ارز، قیمت ورود و خروج، منبع سیگنال و سایز واقعی استوری ۹:۱۶.'
            : 'Verified profit cards across Perp, DEX & Copy trades — 24H to 3M, 6M, 1Y, ALL & Single Trade with token logo, entry/exit prices, signal & engine badges in true 9:16 & 16:9.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-5 panel rounded-[26px] p-6 space-y-5">
          <div className="rounded-2xl border p-3.5 banner-cobalt-soft flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-sub leading-relaxed">
              {isFa
                ? 'تمامی آمارها مستقیماً از دفتر کل سرور محاسبه شده و با امضای رمزنگاری HMAC-SHA256 و کد QR عمومی صادر می‌شوند.'
                : 'Stats are cryptographically signed with HMAC-SHA256 and public QR verification.'}
            </div>
          </div>

          {/* 1. Account Mode */}
          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۱. نوع حساب مبنای کارت' : '1. ACCOUNT SOURCE'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('LIVE')}
                className={`p-3 rounded-2xl border text-start transition ${
                  mode === 'LIVE' ? 'border-emerald-500/60 bg-emerald-500/10' : 'surface-soft'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-main">
                  <ShieldCheck className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'حساب واقعی (Live)' : 'Live Real Account'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">{isFa ? 'مهر تاییدشده LIVE VERIFIED' : 'Official Verified Stamp'}</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('PAPER')}
                className={`p-3 rounded-2xl border text-start transition ${
                  mode === 'PAPER' ? 'border-amber-500/60 bg-amber-500/10' : 'surface-soft'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-main">
                  <AlertTriangle className="w-4 h-4 text-goldsoft" />
                  <span>{isFa ? 'حساب دمو (شبیه‌ساز)' : 'Demo / Paper Account'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">{isFa ? 'مهر شفاف DEMO / PAPER' : 'Demo Stamp Included'}</p>
              </button>
            </div>
          </div>

          {/* 2. Trade Types Filter */}
          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۲. نوع معاملات قابل محاسبه' : '2. TRADE TYPES'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {([
                ['ALL', isFa ? 'همه انواع' : 'All Types'],
                ['PERP', isFa ? 'فیوچرز/اسپات' : 'Perp / Spot'],
                ['DEX', isFa ? 'DEX/اسنایپر' : 'DEX / Sniper'],
                ['COPY', isFa ? 'کپی‌ترید' : 'Copy Trade'],
              ] as const).map(([src, lbl]) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setTradeSource(src)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-extrabold transition ${
                    tradeSource === src ? 'btn-cobalt text-white' : 'surface-soft text-sub hover:text-main'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Period Selector (All 8 periods) */}
          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۳. بازه زمانی یا تک‌معامله' : '3. PERIOD OR SINGLE TRADE'}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ['24H', isFa ? '۲۴ ساعته' : '24H'],
                ['7D', isFa ? 'هفتگی' : '7D'],
                ['30D', isFa ? 'ماهانه' : '30D'],
                ['3M', isFa ? '۳ ماهه' : '3M'],
                ['6M', isFa ? '۶ ماهه' : '6M'],
                ['1Y', isFa ? 'سالانه' : '1Y'],
                ['ALL', isFa ? 'کل دوره' : 'ALL'],
                ['TRADE', isFa ? 'تک‌معامله' : '1 Trade'],
              ] as const).map(([p, lbl]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`py-2 rounded-xl text-[11px] font-extrabold transition ${
                    period === p ? 'btn-gold' : 'surface-soft text-sub hover:text-main'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {period === 'TRADE' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-dim uppercase block">
                {isFa ? `انتخاب معامله تسویه‌شده (${eligibleTrades.length} مورد)` : `SELECT SETTLED TRADE (${eligibleTrades.length})`}
              </label>
              <select value={selectedTradeId} onChange={(e) => setSelectedTradeId(e.target.value)} className="field text-xs">
                <option value="">{isFa ? 'یک معامله بسته شده انتخاب کنید...' : 'Select closed trade...'}</option>
                {eligibleTrades.map((t) => (
                  <option key={`${t.tradeSource}-${t.id}`} value={t.id}>
                    [{t.tradeSource}] {t.symbol} ({t.direction}{t.leverage > 1 ? ` ${t.leverage}x` : ''}) · {fmtPctSigned(t.roiPct)} ({fmtUsdSigned(t.realizedPnlUsd)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4. Exact Ratio Layout + 4 Themes */}
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">
                {isFa ? '۴. ابعاد استاندارد کارت (استوری ۹:۱۶ و افقی ۱۶:۹)' : '4. EXACT CARD DIMENSIONS'}
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLayout('vertical')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border ${
                    layout === 'vertical' ? 'border-[#1652f0] bg-[#1652f0]/15 text-main' : 'surface-soft text-dim'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{isFa ? 'استوری عمودی (۹:۱۶)' : 'Story Vertical (9:16)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('horizontal')}
                  className={`py-2.5 px-3 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border ${
                    layout === 'horizontal' ? 'border-[#1652f0] bg-[#1652f0]/15 text-main' : 'surface-soft text-dim'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{isFa ? 'افقی استاندارد (۱۶:۹)' : 'Horizontal (16:9)'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? '۵. تم رنگی کارت' : '5. CARD THEME'}</label>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setCardStyle(th.id)}
                    className={`h-9 px-3 rounded-xl text-[11px] font-bold inline-flex items-center gap-2 transition ${
                      cardStyle === th.id ? 'ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg)] text-white' : 'opacity-80 hover:opacity-100 text-white/90'
                    }`}
                    style={{ background: `linear-gradient(135deg,${th.from},${th.to})`, border: `1px solid ${th.accent}77` }}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: th.accent }} />
                    <span className="truncate">{isFa ? th.labelFa : th.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void handleIssueCard()}
              disabled={busy}
              className="btn-gold w-full py-3.5 rounded-2xl text-xs sm:text-sm inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'صدور کارت سود تاییدشده دلارینو' : 'Issue Verified Profit Card'}</span>
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void downloadServerPng()}
                disabled={!issuedCard || exporting}
                className="btn-ghost py-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>{exporting ? '...' : isFa ? 'دانلود PNG باکیفیت' : 'Download PNG'}</span>
              </button>
              <button
                type="button"
                onClick={() => void sendCardToTelegram()}
                disabled={!issuedCard || sendingTg}
                className="btn-cobalt py-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                <span>{sendingTg ? '...' : isFa ? 'ارسال به تلگرام من' : 'Send to Telegram'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Card Preview (True 16:9 or True 9:16 Story) */}
        <div className="lg:col-span-7 flex flex-col items-center gap-4">
          {issuedCard ? (
            <>
              <div
                className={`w-full rounded-[30px] overflow-hidden border p-5 sm:p-6 flex flex-col justify-between shadow-2xl relative transition-all ${
                  layout === 'horizontal'
                    ? 'max-w-[660px] aspect-[16/9]'
                    : 'max-w-[350px] sm:max-w-[375px] aspect-[9/16]'
                }`}
                style={{
                  background: `linear-gradient(145deg,${activeTheme.from},${activeTheme.to})`,
                  borderColor: `${activeTheme.accent}55`,
                  color: activeTheme.text,
                }}
              >
                {/* Faint Center Dollarino Logo Watermark */}
                <img
                  src="/logo.png"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 sm:w-64 sm:h-64 object-contain opacity-[0.09]"
                />

                {/* Top Header */}
                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <DollarinoBrandMark size={layout === 'vertical' ? 38 : 36} glow />
                    <div className="min-w-0">
                      <span className="text-[11px] font-black tracking-[0.08em] block truncate" style={{ color: activeTheme.accent }}>
                        {isFa ? 'کارت سود دلارینو' : 'DOLLARINO CARD'} · {periodTitle(issuedCard.period, isFa)}
                      </span>
                      <p className="text-[10px] opacity-75 font-semibold truncate">
                        {issuedCard.displayName || username} · {sourceTitle(issuedCard.tradeSource, isFa)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
                      issuedCard.isVerifiedReal
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    }`}
                  >
                    {issuedCard.isVerifiedReal ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    <span>{issuedCard.isVerifiedReal ? (isFa ? 'حساب واقعی' : 'LIVE') : isFa ? 'حساب دمو' : 'DEMO'}</span>
                  </span>
                </div>

                {/* Single-Trade Token Header OR Period Engine Banner */}
                {isSingleCard && issuedCard.symbol ? (
                  <div className="relative rounded-2xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CoinIcon symbol={heroCoin} size={layout === 'vertical' ? 40 : 34} imageUrl={issuedCard.tokenImageUrl} />
                      <div className="min-w-0">
                        <p dir="ltr" className="text-sm font-black text-white truncate">{issuedCard.symbol}</p>
                        <p dir="ltr" className="text-[10px] opacity-70 truncate">{issuedCard.exchangeProvider}</p>
                      </div>
                    </div>
                    <span
                      dir="ltr"
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black border shrink-0 ${
                        issuedCard.direction === 'SHORT' || issuedCard.direction === 'SELL'
                          ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                          : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {issuedCard.direction || 'LONG'}
                      {issuedCard.leverage && issuedCard.leverage > 1 ? ` ${issuedCard.leverage}X` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-white/12 bg-white/[0.05] px-3.5 py-2 flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CoinIcon symbol={heroCoin} size={28} imageUrl={issuedCard.tokenImageUrl} />
                      <div className="min-w-0">
                        <p className="text-[10px] opacity-70 truncate">{isFa ? 'موتور فعال' : 'Active Engine'}</p>
                        <p className="text-xs font-black truncate">{issuedCard.strategyName}</p>
                      </div>
                    </div>
                    <span dir="ltr" className="text-[10px] font-bold opacity-80 truncate">
                      {issuedCard.exchangeProvider}
                    </span>
                  </div>
                )}

                {/* Center Profit & ROI Hero */}
                <div className="relative my-auto py-3 text-center rounded-3xl border border-white/15 bg-black/20 px-4">
                  <p className="text-[10px] opacity-70 font-bold mb-1">
                    {isFa ? 'بازده واقعی و سود/زیان خالص تسویه‌شده' : 'Settled ROI & Net PnL'}
                  </p>
                  <div className={`flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 ${layout === 'vertical' ? 'flex-col items-center' : ''}`}>
                    <span
                      dir="ltr"
                      className={`font-display font-bold tabular leading-none ${
                        layout === 'horizontal' ? 'text-4xl sm:text-5xl' : 'text-5xl'
                      } ${issuedCard.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}
                    >
                      {fmtPctSigned(issuedCard.roiPct)}
                    </span>
                    <span
                      dir="ltr"
                      className={`text-base sm:text-lg font-mono-num font-black ${
                        issuedCard.netPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {fmtUsdSigned(issuedCard.netPnlUsd)} USDT
                    </span>
                  </div>
                </div>

                {/* Tilted Official Seal (positioned neatly in story band) */}
                {layout === 'vertical' && (
                  <div className="relative flex justify-center -my-1">
                    <div
                      className={`px-4 py-1 rounded-xl border text-[10px] font-black tracking-[0.12em] -rotate-3 ${
                        issuedCard.isVerifiedReal
                          ? 'border-emerald-400/50 text-emerald-300 bg-emerald-500/15'
                          : 'border-amber-400/50 text-amber-300 bg-amber-500/15'
                      }`}
                    >
                      {issuedCard.isVerifiedReal ? 'LIVE REAL VERIFIED' : 'DEMO / PAPER SIMULATION'}
                    </div>
                  </div>
                )}

                {/* Bottom Details Grid */}
                <div className="relative space-y-2.5">
                  {isSingleCard ? (
                    <div className={`grid gap-2 ${layout === 'vertical' ? 'grid-cols-2' : 'grid-cols-4'}`}>
                      <div className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                        <div className="flex items-center justify-between opacity-75">
                          <span className="text-[9px] font-bold">{isFa ? 'قیمت ورود' : 'ENTRY'}</span>
                          <ArrowDownRight className="w-3 h-3 text-sky-400" />
                        </div>
                        <p dir="ltr" className="font-mono-num font-black text-xs sm:text-sm mt-1 truncate">
                          {fmtPriceUsd(issuedCard.entryPrice)}
                        </p>
                      </div>
                      <div className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                        <div className="flex items-center justify-between opacity-75">
                          <span className="text-[9px] font-bold">{isFa ? 'قیمت خروج' : 'EXIT'}</span>
                          <ArrowUpRight className="w-3 h-3 text-jade" />
                        </div>
                        <p dir="ltr" className="font-mono-num font-black text-xs sm:text-sm mt-1 truncate">
                          {fmtPriceUsd(issuedCard.exitPrice)}
                        </p>
                      </div>
                      <div className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                        <div className="flex items-center justify-between opacity-75">
                          <span className="text-[9px] font-bold">{isFa ? 'موتور فعال' : 'ENGINE'}</span>
                          <Cpu className="w-3 h-3" style={{ color: activeTheme.accent }} />
                        </div>
                        <p className="font-bold text-[11px] mt-1 truncate">{issuedCard.strategyName}</p>
                      </div>
                      <div className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                        <div className="flex items-center justify-between opacity-75">
                          <span className="text-[9px] font-bold">{isFa ? 'منبع سیگنال' : 'SIGNAL'}</span>
                          <Radio className="w-3 h-3 text-amber-400" />
                        </div>
                        <p className="font-bold text-[11px] mt-1 truncate">{issuedCard.signalName || issuedCard.strategyName}</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`grid gap-2 ${layout === 'vertical' ? 'grid-cols-2' : 'grid-cols-4'}`}>
                      {[
                        { icon: Target, label: isFa ? 'نرخ برد' : 'WIN RATE', val: `${issuedCard.winRate.toFixed(1)}%` },
                        { icon: Layers, label: isFa ? 'معاملات' : 'TRADES', val: String(issuedCard.tradesCount) },
                        { icon: TrendingUp, label: isFa ? 'ضریب سود' : 'PF', val: issuedCard.profitFactor >= 99 ? 'MAX' : issuedCard.profitFactor.toFixed(2) },
                        { icon: Clock, label: isFa ? 'تاریخ صدور' : 'DATE', val: issuedCard.issuedAt.slice(0, 10) },
                      ].map((s) => {
                        const Icon = s.icon;
                        return (
                          <div key={s.label} className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                            <div className="flex items-center justify-between opacity-75">
                              <span className="text-[9px] font-bold">{s.label}</span>
                              <Icon className="w-3 h-3" />
                            </div>
                            <p dir="ltr" className="font-display font-bold text-xs sm:text-sm tabular mt-1 truncate">
                              {s.val}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="ltr" className="text-[10px] font-mono-num font-bold truncate">
                        {issuedCard.id} · Dollarino Quant Platform
                      </p>
                      <p className="text-[9px] opacity-75 truncate">
                        {issuedCard.signalName || issuedCard.strategyName} · HMAC-SHA256
                      </p>
                    </div>
                    {qrDataUrl && (
                      <img src={qrDataUrl} alt="Verify QR" className="w-11 h-11 rounded-lg bg-white p-0.5 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <a
                  href={`/verify-card/${issuedCard.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-3.5 py-2 rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isFa ? 'صفحه استعلام عمومی' : 'Public Verify Link'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}/verify-card/${issuedCard.id}`);
                    setNotice(isFa ? 'لینک استعلام اصالت کارت کپی شد' : 'Verification link copied');
                  }}
                  className="btn-ghost px-3.5 py-2 rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isFa ? 'کپی لینک استعلام' : 'Copy Link'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full max-w-[520px] aspect-[16/10] rounded-[26px] border-2 border-dashed hairline p-7 flex flex-col items-center justify-center text-center gap-3 surface-soft">
              <QrCode className="w-10 h-10 text-dim" />
              <p className="text-sm font-black text-main">
                {isFa ? 'هنوز کارت سودی صادر نشده است' : 'No Profit Card Issued Yet'}
              </p>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'حساب، نوع معامله و بازه زمانی (۲۴ساعته، هفتگی، ماهانه، ۳ماهه، ۶ماهه، سالانه، کل دوره یا تک‌معامله) را انتخاب کنید.'
                  : 'Select mode, trade types and period (24H to 1Y/ALL or Single Trade) then click Issue.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {archive.length > 0 && (
        <div className="panel rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-black text-main flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-jade" />
            <span>{isFa ? 'آرشیو کارت‌های سود صادرشده شما' : 'Your Issued Profit Cards'}</span>
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archive.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIssuedCard(c)}
                className={`p-3.5 rounded-2xl border text-start transition ${
                  issuedCard?.id === c.id ? 'border-[var(--gold)] bg-amber-500/10' : 'surface-soft hairline hover:border-[var(--brand)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(c.baseSymbol || c.symbol) && (
                      <CoinIcon symbol={c.baseSymbol || c.symbol || 'BTC'} size={22} imageUrl={c.tokenImageUrl} />
                    )}
                    <span dir="ltr" className="text-xs font-mono-num font-black text-main truncate">
                      {c.symbol || c.id}
                    </span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${c.isVerifiedReal ? 'badge-signal' : 'badge-warn'}`}>
                    {c.isVerifiedReal ? (isFa ? 'واقعی' : 'LIVE') : isFa ? 'دمو' : 'DEMO'} · {c.period}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span dir="ltr" className={`font-display font-bold text-lg ${c.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {fmtPctSigned(c.roiPct)}
                  </span>
                  <span dir="ltr" className="text-[11px] text-dim font-mono-num">
                    {fmtUsdSigned(c.netPnlUsd)} · {c.winRate.toFixed(0)}% WR
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
