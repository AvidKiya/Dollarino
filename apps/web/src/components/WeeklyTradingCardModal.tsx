import { useState } from 'react';
import { Award, Bot, Download, Share2, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';

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
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const isPositive = metrics.pnlPercentage >= 0;
  const topAsset = (metrics.mostProfitableAsset || 'BTCUSDT').replace(/USDT$/i, '');

  const downloadCardPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 800, 1000);
    bg.addColorStop(0, '#070b15');
    bg.addColorStop(0.5, '#090e1d');
    bg.addColorStop(1, '#03050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 800, 1000);

    // Ambient blue & green glows
    const gBlue = ctx.createRadialGradient(650, 180, 10, 650, 180, 280);
    gBlue.addColorStop(0, 'rgba(63, 110, 255, 0.35)');
    gBlue.addColorStop(1, 'transparent');
    ctx.fillStyle = gBlue;
    ctx.fillRect(0, 0, 800, 1000);

    const gGreen = ctx.createRadialGradient(580, 720, 10, 580, 720, 300);
    gGreen.addColorStop(0, 'rgba(20, 205, 145, 0.18)');
    gGreen.addColorStop(1, 'transparent');
    ctx.fillStyle = gGreen;
    ctx.fillRect(0, 0, 800, 1000);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 800; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1000);
      ctx.stroke();
    }
    for (let y = 0; y <= 1000; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(800, y);
      ctx.stroke();
    }

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillText('DOLLARINO', 64, 96);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('AI AGENT TRADING DESK · KBOs V11', 64, 122);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(metrics.periodLabel, 540, 100);

    // Hero ROI
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText('7-DAY PERFORMANCE', 64, 240);

    ctx.fillStyle = isPositive ? '#27cd86' : '#eb493d';
    ctx.font = 'bold 92px JetBrains Mono, monospace';
    ctx.fillText(`${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}%`, 64, 340);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px JetBrains Mono, monospace';
    ctx.fillText(`${metrics.last7Days >= 0 ? '+' : '-'}$${Math.abs(metrics.last7Days).toFixed(2)} USDT`, 64, 405);

    // Metrics boxes
    const boxes = [
      ['TOTAL EQUITY', `$${metrics.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`],
      ['TOP ASSET', `${topAsset} (${metrics.mostProfitableAssetPnl >= 0 ? '+' : ''}$${metrics.mostProfitableAssetPnl.toFixed(2)})`],
      ['WIN RATE', `${metrics.winRate.toFixed(1)}%`],
      ['PROFIT FACTOR', `${metrics.profitFactor.toFixed(2)}`],
    ];
    boxes.forEach(([lbl, val], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 64 + col * 344;
      const by = 520 + row * 135;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, 324, 112, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillText(lbl ?? '', bx + 22, by + 38);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px JetBrains Mono, monospace';
      ctx.fillText(val ?? '', bx + 22, by + 82);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('dollarino.pages.dev · Non-Repainting KBOs v11 + 8-Ch Mixer', 64, 940);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `dollarino-weekly-card-${Date.now()}.png`;
    a.click();
  };

  const shareSummary = () => {
    const txt = `Dollarino AI Trading Desk (${metrics.periodLabel})\n7d Return: ${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}% (${metrics.last7Days >= 0 ? '+' : ''}$${metrics.last7Days.toFixed(2)})\nWin Rate: ${metrics.winRate.toFixed(1)}% | Top Asset: ${topAsset}`;
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-30 rounded-full bg-black/45 hover:bg-black/70 p-2 text-white backdrop-blur-md border border-white/10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Exact timetrade.live 4:5 Shareable Card */}
        <div className="relative isolate mx-auto aspect-[4/5] w-full overflow-hidden rounded-[26px] border border-white/10 bg-[#060912] text-white shadow-[0_32px_90px_rgba(0,0,0,0.65)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(63,110,255,0.38),transparent_31%),radial-gradient(circle_at_72%_72%,rgba(20,205,145,0.16),transparent_34%),linear-gradient(145deg,#070b15_0%,#090e1d_46%,#03050a_100%)]" />
          <div className="absolute -right-20 top-10 h-72 w-72 rounded-full border border-blue-400/15" />
          <div className="absolute -right-8 top-24 h-52 w-52 rounded-full border border-blue-300/10" />
          <div className="absolute right-3 top-24 h-40 w-40 rotate-12 rounded-[38px] bg-gradient-to-br from-blue-500/20 to-cyan-300/5 blur-[1px]" />
          <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:32px_32px]" />

          <svg aria-hidden="true" className="absolute bottom-0 right-0 h-[48%] w-[72%] opacity-25" viewBox="0 0 320 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="weekly-card-line" x1="0" x2="1">
                <stop stopColor="#377dff" />
                <stop offset="1" stopColor="#3ee6ac" />
              </linearGradient>
              <linearGradient id="weekly-card-fill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#377dff" stopOpacity="0.5" />
                <stop offset="1" stopColor="#377dff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 181 C35 176 52 154 78 160 C108 166 112 118 145 126 C176 134 188 91 218 103 C254 117 268 55 320 35 L320 220 L0 220Z" fill="url(#weekly-card-fill)" />
            <path d="M0 181 C35 176 52 154 78 160 C108 166 112 118 145 126 C176 134 188 91 218 103 C254 117 268 55 320 35" fill="none" stroke="url(#weekly-card-line)" strokeWidth="3" />
          </svg>

          <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3 pe-8">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <Bot className="h-5 w-5 text-[#4b73f5]" />
                </span>
                <div>
                  <p className="text-[14px] font-bold tracking-[0.14em]">DOLLARINO</p>
                  <p className="text-[8px] uppercase tracking-[0.2em] text-white/40">AI Trading Desk</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">
                {lang === 'fa' ? 'نتایج هفتگی' : 'Weekly results'}
              </span>
            </div>

            <div className="my-auto py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">{metrics.periodLabel}</p>
              <div className={`mt-2 text-5xl font-bold font-mono-num tracking-tight ${isPositive ? 'text-[#27cd86]' : 'text-[#eb493d]'}`}>
                {isPositive ? '+' : ''}
                {metrics.pnlPercentage.toFixed(2)}%
              </div>
              <p className="mt-2 text-lg font-semibold font-mono-num text-white/90">
                {metrics.last7Days >= 0 ? '+' : '-'}${Math.abs(metrics.last7Days).toFixed(2)} <span className="text-xs text-white/45">USDT (7d)</span>
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
                  <p className="text-[9px] uppercase tracking-wider text-white/45">{lang === 'fa' ? 'ارز پربازده' : 'Top Asset'}</p>
                  <p className="mt-1 text-sm font-bold font-mono-num text-white flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-[#f59f14]" />
                    <span>{topAsset}</span>
                  </p>
                  <p className="text-[10px] font-mono-num text-[#27cd86]">
                    {metrics.mostProfitableAssetPnl >= 0 ? '+' : ''}${metrics.mostProfitableAssetPnl.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
                  <p className="text-[9px] uppercase tracking-wider text-white/45">{lang === 'fa' ? 'دارایی کل' : 'Total Balance'}</p>
                  <p className="mt-1 text-sm font-bold font-mono-num text-white">
                    ${metrics.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] font-mono-num text-white/55">
                    Protected: ${metrics.todayProtectedCredit.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
                  <p className="text-[9px] uppercase tracking-wider text-white/45">{lang === 'fa' ? 'نرخ برد' : 'Win Rate'}</p>
                  <p className="mt-1 text-sm font-bold font-mono-num text-[#27cd86]">{metrics.winRate.toFixed(1)}%</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
                  <p className="text-[9px] uppercase tracking-wider text-white/45">Profit Factor</p>
                  <p className="mt-1 text-sm font-bold font-mono-num text-[#4b73f5]">{metrics.profitFactor.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
              <button
                onClick={downloadCardPng}
                className="flex-1 py-2.5 rounded-xl bg-[#4b73f5] hover:bg-[#3d63e0] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'دانلود تصویر PNG' : 'Download PNG'}</span>
              </button>
              <button
                onClick={shareSummary}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copied ? (lang === 'fa' ? 'کپی شد!' : 'Copied!') : lang === 'fa' ? 'کپی متن' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
