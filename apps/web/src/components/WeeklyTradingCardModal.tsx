import { useState } from 'react';
import { Award, CheckCircle2, Download, Share2, ShieldCheck, Sparkles, TrendingUp, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { DollarinoBrandMark } from './BrandGraphics';

export interface WeeklyCardMetrics {
  totalBalance: number;
  todayProtectedCredit: number;
  last7Days: number;
  totalProfit: number;
  pnlPercentage: number;
  mostProfitableAsset: string | null;
  mostProfitableAssetPnl: number;
  winRate: number;
  profitFactor: number;
  periodLabel: string;
}

export function WeeklyTradingCardModal({
  lang,
  metrics,
  open,
  onClose,
}: {
  lang: Lang;
  metrics: WeeklyCardMetrics;
  open: boolean;
  onClose: () => void;
}) {
  const isFa = lang === 'fa';
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!open) return null;

  const isPositive = metrics.pnlPercentage >= 0;
  const topAsset = (metrics.mostProfitableAsset || 'BTCUSDT').replace(/USDT$/i, '');

  const downloadCardPng = async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1125;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Deep Cosmic Cobalt Background
      const bg = ctx.createLinearGradient(0, 0, 900, 1125);
      bg.addColorStop(0, '#04091a');
      bg.addColorStop(0.45, '#09246c');
      bg.addColorStop(1, '#040a1d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 900, 1125);

      // 2. Ambient Cobalt & Emerald Auras
      const auraBlue = ctx.createRadialGradient(720, 180, 10, 720, 180, 380);
      auraBlue.addColorStop(0, 'rgba(37, 116, 255, 0.42)');
      auraBlue.addColorStop(1, 'transparent');
      ctx.fillStyle = auraBlue;
      ctx.fillRect(0, 0, 900, 1125);

      const auraGreen = ctx.createRadialGradient(220, 880, 10, 220, 880, 420);
      auraGreen.addColorStop(0, isPositive ? 'rgba(22, 230, 100, 0.22)' : 'rgba(244, 63, 94, 0.20)');
      auraGreen.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGreen;
      ctx.fillRect(0, 0, 900, 1125);

      // 3. Subtle Geometric Precision Grid Lines
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 900; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1125);
        ctx.stroke();
      }
      for (let y = 0; y <= 1125; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(900, y);
        ctx.stroke();
      }
      ctx.restore();

      // 4. LARGE CENTERED LOGO WATERMARK WITH LOW OPACITY
      const logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = '/logo.png';
      });

      if (logoImg) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        const logoSize = 620;
        const lx = (900 - logoSize) / 2;
        const ly = (1125 - logoSize) / 2;
        ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
        ctx.restore();
      }

      // 5. Outer Frosted Card Frame
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(24, 24, 852, 1077, 42);
      ctx.stroke();
      ctx.restore();

      // 6. Top Brand Header + Small Sharp Emblem
      if (logoImg) {
        ctx.drawImage(logoImg, 64, 62, 68, 68);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 32px Inter, Vazirmatn, sans-serif';
      ctx.fillText(isFa ? 'دلارینو' : 'DOLLARINO', 148, 96);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '600 15px Inter, Vazirmatn, sans-serif';
      ctx.fillText(
        isFa ? 'هوش مصنوعی دلارینو · موتور دُرنا · کپی ترید دلارینو' : 'DOLLARINO AI · DORNA V1 · COPY-TRADE',
        148,
        122
      );

      // Pill badge top-right
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.roundRect(625, 70, 210, 44, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Inter, Vazirmatn, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isFa ? 'کارت نتایج هفتگی' : '7-DAY PERFORMANCE', 730, 98);
      ctx.restore();

      // 7. Hero Return Block
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '700 20px Inter, Vazirmatn, sans-serif';
      ctx.fillText(metrics.periodLabel, 68, 252);

      ctx.fillStyle = isPositive ? '#4ade80' : '#fb7185';
      ctx.font = '900 108px JetBrains Mono, monospace';
      ctx.fillText(`${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}%`, 64, 368);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px JetBrains Mono, monospace';
      ctx.fillText(`${metrics.last7Days >= 0 ? '+' : '-'}$${Math.abs(metrics.last7Days).toFixed(2)} USDT`, 68, 434);

      // 8. 2x2 Frosted Glass KPI Tiles
      const boxes: Array<[string, string, string]> = [
        [
          isFa ? 'ارز پربازده هفته' : 'TOP ASSET',
          topAsset,
          `${metrics.mostProfitableAssetPnl >= 0 ? '+' : ''}$${metrics.mostProfitableAssetPnl.toFixed(2)}`,
        ],
        [
          isFa ? 'دارایی کل حساب' : 'TOTAL BALANCE',
          `$${metrics.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          `${isFa ? 'آزاد:' : 'Free:'} $${metrics.todayProtectedCredit.toFixed(2)}`,
        ],
        [
          isFa ? 'نرخ موفقیت معاملات' : 'WIN RATE',
          `${metrics.winRate.toFixed(1)}%`,
          isPositive ? (isFa ? 'روند مثبت' : 'Positive Edge') : (isFa ? 'در حال پایش' : 'Active'),
        ],
        [
          isFa ? 'ضریب سودآوری' : 'PROFIT FACTOR',
          metrics.profitFactor.toFixed(2),
          isFa ? 'مدیریت ریسک هوشمند' : 'Smart Risk Shield',
        ],
      ];

      boxes.forEach(([lbl, val, sub], idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = 64 + col * 394;
        const by = 528 + row * 195;
        ctx.save();
        ctx.fillStyle = 'rgba(7, 17, 45, 0.72)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, 378, 170, 26);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '700 17px Inter, Vazirmatn, sans-serif';
        ctx.fillText(lbl, bx + 26, by + 48);

        ctx.fillStyle = idx === 2 ? '#4ade80' : '#ffffff';
        ctx.font = '900 36px JetBrains Mono, Inter, sans-serif';
        ctx.fillText(val, bx + 26, by + 104);

        ctx.fillStyle = idx === 0 && metrics.mostProfitableAssetPnl >= 0 ? '#4ade80' : 'rgba(255, 255, 255, 0.68)';
        ctx.font = '600 17px Inter, Vazirmatn, sans-serif';
        ctx.fillText(sub, bx + 26, by + 142);
        ctx.restore();
      });

      // 9. Footer Verified Stamp
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.font = '600 17px Inter, Vazirmatn, sans-serif';
      ctx.fillText('dollarino.pages.dev · Toobit · KCEX · Paper Demo', 68, 1042);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `dollarino-weekly-card-${Date.now()}.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  const shareSummary = () => {
    const txt = isFa
      ? `کارت عملکرد هفتگی دلارینو (${metrics.periodLabel})\nبازده ۷ روزه: ${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}% (${metrics.last7Days >= 0 ? '+' : ''}$${metrics.last7Days.toFixed(2)})\nنرخ برد: ${metrics.winRate.toFixed(1)}% | ارز پربازده: ${topAsset}`
      : `Dollarino Performance Card (${metrics.periodLabel})\n7d Return: ${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}% (${metrics.last7Days >= 0 ? '+' : ''}$${metrics.last7Days.toFixed(2)})\nWin Rate: ${metrics.winRate.toFixed(1)}% | Top Asset: ${topAsset}`;
    void navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div className="relative w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute left-3 top-3 z-30 rounded-full bg-black/45 hover:bg-black/75 p-2 text-white backdrop-blur-md border border-white/20 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Exclusive Dollarino Card with Large Low-Opacity Background Logo Watermark */}
        <div
          className="dark-preserve relative isolate mx-auto aspect-[4/5] w-full overflow-hidden rounded-[30px] text-white shadow-[0_36px_95px_rgba(2,10,36,0.72)] border border-white/20"
          style={{
            background: 'linear-gradient(145deg, #050c24 0%, #0a2673 48%, #071746 100%)',
          }}
        >
          {/* Ambient radial glow */}
          <div
            className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full blur-3xl opacity-45"
            style={{ background: 'radial-gradient(circle, #2574ff 0%, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-35"
            style={{ background: `radial-gradient(circle, ${isPositive ? '#16e664' : '#f43f5e'} 0%, transparent 70%)` }}
          />

          {/* Subtle Precision Grid Overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          {/* LARGE CENTERED DOLLARINO LOGO WATERMARK IN BACKGROUND */}
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[84%] h-[84%] object-contain opacity-[0.14] drop-shadow-[0_0_40px_rgba(37,116,255,0.45)]"
          />

          {/* Foreground Frosted Content */}
          <div className="relative z-10 flex h-full flex-col justify-between p-6">
            {/* Top Bar */}
            <div className="flex items-center justify-between gap-2 ps-9">
              <div className="flex items-center gap-2.5">
                <DollarinoBrandMark size={40} glow />
                <div>
                  <p className="text-sm font-black tracking-wide text-white">
                    {isFa ? 'دلارینو' : 'DOLLARINO'}
                  </p>
                  <p className="text-[10px] text-white/70 font-semibold">
                    {isFa ? 'هوش مصنوعی و کپی‌ترید' : 'AI & Copy-Trade Desk'}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-3 py-1 text-[10px] font-extrabold text-white">
                <Sparkles className="w-3 h-3 text-[#4ade80]" />
                <span>{isFa ? 'نتایج هفتگی' : 'Weekly Card'}</span>
              </span>
            </div>

            {/* Hero ROI & Profit */}
            <div className="my-auto py-3 space-y-4">
              <div>
                <p className="text-[11px] font-bold text-white/75 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#4ade80]" />
                  <span>{metrics.periodLabel}</span>
                </p>
                <div
                  dir="ltr"
                  className={`mt-1.5 text-5xl font-black font-mono-num tracking-tight ${
                    isPositive ? 'text-[#4ade80] drop-shadow-[0_4px_20px_rgba(74,222,128,0.35)]' : 'text-rose-300'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {metrics.pnlPercentage.toFixed(2)}%
                </div>
                <p dir="ltr" className="mt-1.5 text-base font-extrabold font-mono-num text-white">
                  {metrics.last7Days >= 0 ? '+' : '-'}${Math.abs(metrics.last7Days).toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-white/70">USDT</span>
                </p>
              </div>

              {/* 2x2 Apple-Squircle Glass Tiles */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[20px] bg-[#061130]/70 backdrop-blur-md border border-white/15 p-3.5">
                  <p className="text-[10px] font-bold text-white/65">{isFa ? 'ارز پربازده' : 'Top Asset'}</p>
                  <p className="mt-1 text-sm font-black font-mono-num text-white flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#fbbf24]" />
                    <span>{topAsset}</span>
                  </p>
                  <p dir="ltr" className="text-[11px] font-mono-num font-bold text-[#4ade80]">
                    {metrics.mostProfitableAssetPnl >= 0 ? '+' : ''}${metrics.mostProfitableAssetPnl.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#061130]/70 backdrop-blur-md border border-white/15 p-3.5">
                  <p className="text-[10px] font-bold text-white/65">{isFa ? 'دارایی کل' : 'Total Balance'}</p>
                  <p dir="ltr" className="mt-1 text-sm font-black font-mono-num text-white">
                    ${metrics.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] font-semibold text-white/70 truncate">
                    {isFa ? `آزاد: $${metrics.todayProtectedCredit.toFixed(0)}` : `Free: $${metrics.todayProtectedCredit.toFixed(0)}`}
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#061130]/70 backdrop-blur-md border border-white/15 p-3.5">
                  <p className="text-[10px] font-bold text-white/65">{isFa ? 'نرخ موفقیت' : 'Win Rate'}</p>
                  <p dir="ltr" className="mt-1 text-base font-black font-mono-num text-[#4ade80]">
                    {metrics.winRate.toFixed(1)}%
                  </p>
                </div>

                <div className="rounded-[20px] bg-[#061130]/70 backdrop-blur-md border border-white/15 p-3.5">
                  <p className="text-[10px] font-bold text-white/65">{isFa ? 'ضریب سود' : 'Profit Factor'}</p>
                  <p dir="ltr" className="mt-1 text-base font-black font-mono-num text-white flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>{metrics.profitFactor.toFixed(2)}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/15">
              <button
                type="button"
                disabled={downloading}
                onClick={() => void downloadCardPng()}
                className="flex-1 py-3 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 shadow-lg transition"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? '...' : isFa ? 'دانلود کارت کیفیت بالا' : 'Download HD Card'}</span>
              </button>
              <button
                type="button"
                onClick={shareSummary}
                className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-[#4ade80]" /> : <Share2 className="w-4 h-4" />}
                <span>{copied ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'کپی متن' : 'Share'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
