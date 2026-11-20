import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Lock,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, VerifiedProfitCard } from '../lib/types';

const THEMES = [
  { id: 'dark', labelFa: 'کبالت رسمی', labelEn: 'Cobalt Official', from: '#102a73', to: '#07112e', accent: '#38e1ff', text: '#eef2ff' },
  { id: 'gold', labelFa: 'طلایی لوکس', labelEn: 'Obsidian Gold', from: '#3b2a08', to: '#11130a', accent: '#e8c15a', text: '#f5e8bd' },
  { id: 'emerald', labelFa: 'سبز سیگنال', labelEn: 'Emerald Mint', from: '#052e22', to: '#071d16', accent: '#10d9a3', text: '#d9fff0' },
] as const;

type StyleId = (typeof THEMES)[number]['id'];

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
  const [period, setPeriod] = useState<'24H' | '7D' | '30D' | 'ALL' | 'TRADE'>('7D');
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [cardStyle, setCardStyle] = useState<StyleId>('dark');
  const [issuedCard, setIssuedCard] = useState<VerifiedProfitCard | null>(null);
  const [archive, setArchive] = useState<VerifiedProfitCard[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const theme = THEMES.find((x) => x.id === cardStyle) ?? THEMES[0]!;
  const closedList = data.closedTrades ?? [];

  const loadArchive = useCallback(async () => {
    try {
      const res = await apiFetch<{ cards: Array<Record<string, unknown>> }>('/api/trading/cards');
      const mapped: VerifiedProfitCard[] = (res.cards || []).map((r) => {
        let p: { cardStyle?: string; symbol?: string; direction?: string; isVerifiedReal?: boolean } = {};
        try {
          p = JSON.parse(String(r.payload_json || '{}'));
        } catch {
          p = {};
        }
        const m = String(r.mode || 'LIVE') === 'PAPER' ? 'PAPER' : 'LIVE';
        return {
          id: String(r.id),
          userId: String(r.user_id),
          displayName: username,
          mode: m,
          isVerifiedReal: m === 'LIVE',
          period: String(r.period || '7D') as VerifiedProfitCard['period'],
          startDate: String(r.start_date),
          endDate: String(r.end_date),
          tradesCount: Number(r.trades_count || 0),
          winRate: Number(r.win_rate || 0),
          netPnlUsd: Number(r.net_pnl_usd || 0),
          roiPct: Number(r.roi_pct || 0),
          profitFactor: Number(r.profit_factor || 0),
          exchangeProvider: String(r.exchange_provider || 'TOOBIT'),
          strategyName: String(r.strategy_name || 'dollarino_v01'),
          cardStyle: p.cardStyle || 'dark',
          symbol: p.symbol,
          direction: p.direction,
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
    QRCode.toDataURL(verifyUrl, { width: 160, margin: 1, color: { dark: '#0b1120', light: '#ffffff' } })
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
          period,
          tradeId: period === 'TRADE' ? selectedTradeId : undefined,
          cardStyle,
        }),
      });
      setIssuedCard(res.card);
      setNotice(
        res.card.isVerifiedReal
          ? isFa
            ? `کارت سود واقعی تاییدشده با امضای سرور صادر شد (${res.card.id})`
            : `Verified Real Profit Card issued (${res.card.id})`
          : isFa
            ? `کارت شبیه‌سازی آزمایشی صادر شد (${res.card.id})`
            : `Paper Demo Simulation Card issued (${res.card.id})`
      );
      await loadArchive();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to issue verified profit card');
    } finally {
      setBusy(false);
    }
  };

  const downloadPng = async () => {
    if (!issuedCard) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      const W = 1080;
      const H = 1350;
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

      const rg = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 600);
      rg.addColorStop(0, cardTheme.accent + '44');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (!issuedCard.isVerifiedReal) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-0.42);
        ctx.textAlign = 'center';
        ctx.font = '900 84px Manrope, sans-serif';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
        ctx.fillText('PAPER DEMO · SIMULATION', 0, 0);
        ctx.restore();
      }

      ctx.strokeStyle = cardTheme.accent + '88';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(30, 30, W - 60, H - 60, 36);
      ctx.stroke();

      try {
        const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = '/logo.png';
        });
        ctx.drawImage(logoImg, W - 180, 72, 100, 100);
      } catch {
        /* ignore */
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = cardTheme.accent;
      ctx.font = '800 24px Manrope, sans-serif';
      ctx.fillText(
        issuedCard.isVerifiedReal
          ? `DOLLARINO · VERIFIED LIVE PERFORMANCE (${issuedCard.exchangeProvider})`
          : `DOLLARINO · PAPER DEMO SIMULATION`,
        82,
        118
      );

      // Verification pill
      ctx.fillStyle = issuedCard.isVerifiedReal ? 'rgba(16, 217, 163, 0.18)' : 'rgba(245, 158, 11, 0.2)';
      ctx.strokeStyle = issuedCard.isVerifiedReal ? '#10d9a3' : '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(82, 148, 390, 44, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = issuedCard.isVerifiedReal ? '#10d9a3' : '#fbbf24';
      ctx.font = '800 18px Manrope, sans-serif';
      ctx.fillText(
        issuedCard.isVerifiedReal ? 'SERVER HMAC-SHA256 VERIFIED' : 'SIMULATION ONLY · NOT LIVE',
        104,
        177
      );

      ctx.fillStyle = '#f5f2e8';
      ctx.font = "700 62px 'Fraunces', Georgia, serif";
      ctx.fillText(issuedCard.displayName || username || 'Trader', 82, 278);

      ctx.fillStyle = 'rgba(245,242,232,0.65)';
      ctx.font = '600 24px Manrope, sans-serif';
      ctx.fillText(
        `Period: ${issuedCard.period} · ${issuedCard.symbol ? `${issuedCard.symbol} (${issuedCard.direction})` : issuedCard.strategyName}`,
        82,
        326
      );

      ctx.fillStyle = 'rgba(245,242,232,0.6)';
      ctx.font = '600 28px Manrope, sans-serif';
      ctx.fillText('Settled Net PnL / ROI', 82, 465);

      ctx.fillStyle = issuedCard.netPnlUsd >= 0 ? '#10d9a3' : '#ff4d6d';
      ctx.font = "700 144px 'Fraunces', Georgia, serif";
      ctx.fillText(`${issuedCard.roiPct >= 0 ? '+' : ''}${issuedCard.roiPct.toFixed(2)}%`, 78, 615);

      ctx.fillStyle = issuedCard.netPnlUsd >= 0 ? '#a7f3d0' : '#fecdd3';
      ctx.font = '700 44px Manrope, sans-serif';
      ctx.fillText(
        `${issuedCard.netPnlUsd >= 0 ? '+' : '-'}$${Math.abs(issuedCard.netPnlUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`,
        82,
        686
      );

      [
        { label: 'SETTLED TRADES', value: String(issuedCard.tradesCount) },
        { label: 'WIN RATE', value: `${issuedCard.winRate.toFixed(1)}%` },
        { label: 'PROFIT FACTOR', value: issuedCard.profitFactor.toFixed(2) },
      ].forEach((s, i) => {
        const x = 82 + i * 312;
        const y = 780;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, 284, 195, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f5f2e8';
        ctx.font = "700 56px 'Fraunces', Georgia, serif";
        ctx.fillText(s.value, x + 28, y + 104);
        ctx.fillStyle = 'rgba(245,242,232,0.6)';
        ctx.font = '700 18px Manrope, sans-serif';
        ctx.fillText(s.label, x + 28, y + 158);
      });

      // QR verification block
      if (qrDataUrl) {
        const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = qrDataUrl;
        });
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(82, 1035, 190, 190, 20);
        ctx.fill();
        ctx.drawImage(qrImg, 94, 1047, 166, 166);
      }

      ctx.fillStyle = '#f5f2e8';
      ctx.font = '800 24px Manrope, sans-serif';
      ctx.fillText(`Card ID: ${issuedCard.id}`, 300, 1090);
      ctx.fillStyle = 'rgba(245,242,232,0.7)';
      ctx.font = '600 20px Manrope, sans-serif';
      ctx.fillText(`HMAC-SHA256: ${(issuedCard.hmacSignature || issuedCard.signaturePrefix || '').slice(0, 24)}...`, 300, 1134);
      ctx.fillText(`Issued: ${new Date(issuedCard.issuedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`, 300, 1172);
      ctx.fillStyle = cardTheme.accent;
      ctx.fillText(`Scan QR to verify at ${window.location.host}/verify-card/${issuedCard.id}`, 300, 1212);

      const a = document.createElement('a');
      a.download = `dollarino-verified-${issuedCard.id}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
      setNotice(isFa ? 'تصویر کارت سود با QR کد تایید دانلود شد' : 'Verified 1080×1350 PNG downloaded');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--gold)' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>TAMPER-PROOF VERIFIED PROFIT CARDS</span>
        </p>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
          {isFa ? 'کارت سود واقعی و غیرقابل‌جعل دلارینو' : 'Server-Signed Verified Profit Cards'}
        </h2>
        <p className="text-xs sm:text-sm text-dim mt-2">
          {isFa
            ? 'تمام اعداد مستقیماً از معاملات واقعی تسویه‌شده روی سرور محاسبه شده و با امضای رمزنگاری HMAC-SHA256 و QR کد استعلام عمومی قفل می‌شوند. هیچ عددی قابل ویرایش دستی نیست.'
            : 'All numbers are computed strictly on the server from settled D1 trades and locked with an HMAC-SHA256 signature and scannable QR verification code.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-10 items-start">
        <div className="panel rounded-[26px] p-6 space-y-5">
          <div className="rounded-2xl border p-3.5 banner-cobalt-soft flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-sub leading-relaxed">
              {isFa
                ? 'امکان وارد کردن سود یا درصد ساختگی وجود ندارد. برای صدور کارت سود واقعی، حداقل یک معامله بسته شده در حساب واقعی (Live) باید ثبت شده باشد.'
                : 'Manual PnL editing is permanently disabled. Real Verified Cards require settled LIVE closed trades.'}
            </div>
          </div>

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
                  <span>{isFa ? 'حساب واقعی (Live)' : 'Real Live Trading'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">
                  {isFa ? 'نشان تاییدشده رسمی بدون واترمارک دمو' : 'Official Verified Seal'}
                </p>
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
                  <span>{isFa ? 'حساب آزمایشی (Demo)' : 'Paper Demo'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">
                  {isFa ? 'دارای برچسب شفاف DEMO SIMULATION' : 'Marked as Simulation Only'}
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۲. بازه زمانی محاسبه' : '2. SETTLED PERIOD'}
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['24H', '7D', '30D', 'ALL', 'TRADE'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`py-2 rounded-xl text-xs font-extrabold transition ${
                    period === p ? 'btn-gold' : 'surface-soft text-sub hover:text-main'
                  }`}
                >
                  {p === 'TRADE' ? (isFa ? 'تک‌معامله' : '1 Trade') : p}
                </button>
              ))}
            </div>
          </div>

          {period === 'TRADE' && (
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">
                {isFa ? 'انتخاب معامله تسویه‌شده' : 'SELECT SETTLED TRADE'}
              </label>
              <select
                value={selectedTradeId}
                onChange={(e) => setSelectedTradeId(e.target.value)}
                className="field text-xs"
              >
                <option value="">{isFa ? 'یک معامله بسته شده انتخاب کنید...' : 'Select closed trade...'}</option>
                {closedList
                  .filter((t) => ((t as { mode?: string }).mode || 'PAPER') === mode)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.symbol} ({t.direction}) · {Number(t.realized_pnl) >= 0 ? '+' : ''}${Number(t.realized_pnl).toFixed(2)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? '۳. تم کارت' : '3. CARD STYLE'}</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setCardStyle(th.id)}
                  title={isFa ? th.labelFa : th.labelEn}
                  className={`h-10 w-10 rounded-full transition ${
                    cardStyle === th.id ? 'ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg)] scale-110' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ background: `linear-gradient(135deg,${th.from},${th.to})`, border: `1px solid ${th.accent}77` }}
                />
              ))}
              <span className="text-xs text-dim ms-1">{isFa ? theme.labelFa : theme.labelEn}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-bold text-loss flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-jade flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => void handleIssueCard()}
              disabled={busy}
              className="btn-gold flex-1 py-3.5 rounded-2xl text-xs sm:text-sm inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'صدور کارت تاییدشده از سرور' : 'Issue Server-Signed Card'}</span>
            </button>
            <button
              type="button"
              onClick={() => void downloadPng()}
              disabled={!issuedCard || exporting}
              className="btn-ghost px-5 py-3.5 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? '...' : isFa ? 'دانلود PNG' : 'Download PNG'}</span>
            </button>
          </div>
        </div>

        {/* Live Card Preview */}
        <div className="flex flex-col items-center gap-4">
          {issuedCard ? (
            <>
              <div
                className="w-[320px] sm:w-[360px] aspect-[4/5] rounded-[26px] overflow-hidden border p-7 flex flex-col shadow-2xl relative"
                style={{
                  background: `linear-gradient(150deg,${(THEMES.find((t) => t.id === (issuedCard.cardStyle || cardStyle)) ?? theme).from},${(THEMES.find((t) => t.id === (issuedCard.cardStyle || cardStyle)) ?? theme).to})`,
                  borderColor: `${theme.accent}66`,
                  color: theme.text,
                }}
              >
                {!issuedCard.isVerifiedReal && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center -rotate-24">
                    <span className="text-amber-300/20 font-black text-2xl tracking-[0.2em] border-2 border-amber-300/25 px-4 py-1.5 rounded-xl">
                      PAPER DEMO · SIMULATION
                    </span>
                  </div>
                )}
                <div className="relative flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black tracking-[0.18em] block" style={{ color: theme.accent }}>
                      {issuedCard.isVerifiedReal ? `VERIFIED LIVE · ${issuedCard.exchangeProvider}` : `DEMO SIMULATION · ${issuedCard.period}`}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-black ${
                        issuedCard.isVerifiedReal
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      }`}
                    >
                      {issuedCard.isVerifiedReal ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      <span>{issuedCard.isVerifiedReal ? 'HMAC VERIFIED' : 'NOT REAL PROFIT'}</span>
                    </span>
                  </div>
                  <DollarinoBrandMark size={38} glow />
                </div>

                <div className="relative mt-5">
                  <p className="text-xs opacity-70 font-semibold">{issuedCard.displayName || username}</p>
                  <p className="font-display font-bold text-xl">
                    {issuedCard.symbol ? `${issuedCard.symbol} · ${issuedCard.direction}` : `Performance (${issuedCard.period})`}
                  </p>
                </div>

                <div className="relative mt-auto">
                  <p className="text-[11px] opacity-65 font-semibold mb-0.5">{isFa ? 'بازده واقعی تسویه‌شده' : 'Settled ROI / Net PnL'}</p>
                  <p dir="ltr" className={`font-display font-bold text-4xl tabular ${issuedCard.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {issuedCard.roiPct >= 0 ? '+' : ''}{issuedCard.roiPct.toFixed(2)}%
                  </p>
                  <p dir="ltr" className={`text-sm font-mono-num font-bold mt-0.5 ${issuedCard.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {issuedCard.netPnlUsd >= 0 ? '+' : '-'}${Math.abs(issuedCard.netPnlUsd).toFixed(2)} USDT
                  </p>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                      { icon: Layers, label: isFa ? 'معاملات' : 'TRADES', val: issuedCard.tradesCount },
                      { icon: Target, label: isFa ? 'وین‌ریت' : 'WIN RATE', val: `${issuedCard.winRate.toFixed(1)}%` },
                      { icon: TrendingUp, label: 'PF', val: issuedCard.profitFactor.toFixed(2) },
                    ].map((s) => {
                      const Icon = s.icon;
                      return (
                        <div key={s.label} className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                          <Icon className="w-3.5 h-3.5 mb-1 opacity-70" />
                          <p dir="ltr" className="font-display font-bold text-sm tabular">{s.val}</p>
                          <p className="text-[8px] opacity-60 font-bold mt-0.5">{s.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="ltr" className="text-[10px] font-mono-num font-bold truncate">{issuedCard.id}</p>
                      <p dir="ltr" className="text-[9px] font-mono-num opacity-65 truncate">
                        SIG: {(issuedCard.hmacSignature || issuedCard.signaturePrefix || '').slice(0, 14)}...
                      </p>
                    </div>
                    {qrDataUrl && (
                      <img src={qrDataUrl} alt="Verify QR" className="w-11 h-11 rounded-lg bg-white p-0.5 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
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
            <div className="w-[320px] sm:w-[360px] aspect-[4/5] rounded-[26px] border border-dashed border-white/20 p-7 flex flex-col items-center justify-center text-center gap-3 surface-soft">
              <QrCode className="w-10 h-10 text-dim" />
              <p className="text-sm font-black text-main">
                {isFa ? 'هنوز کارتی صادر نشده است' : 'No Verified Card Issued Yet'}
              </p>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'حساب (واقعی یا دمو) و بازه زمانی را انتخاب کرده و روی «صدور کارت تاییدشده از سرور» کلیک کنید.'
                  : 'Select account mode and period on the left, then click Issue Server-Signed Card.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {archive.length > 0 && (
        <div className="panel rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-black text-main flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-jade" />
            <span>{isFa ? 'آرشیو کارت‌های صادرشده و امضا‌شده شما' : 'Your Issued Verified Cards'}</span>
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archive.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIssuedCard(c)}
                className={`p-3.5 rounded-2xl border text-start transition ${
                  issuedCard?.id === c.id ? 'border-[var(--gold)] bg-white/5' : 'surface-soft hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-mono-num font-black text-main">{c.id}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.isVerifiedReal ? 'badge-signal' : 'badge-warn'}`}>
                    {c.isVerifiedReal ? 'LIVE VERIFIED' : 'PAPER DEMO'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span dir="ltr" className={`font-display font-bold text-lg ${c.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {c.roiPct >= 0 ? '+' : ''}{c.roiPct.toFixed(2)}%
                  </span>
                  <span className="text-[11px] text-dim font-mono-num">
                    {c.tradesCount} trades · {c.winRate.toFixed(0)}% WR
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
