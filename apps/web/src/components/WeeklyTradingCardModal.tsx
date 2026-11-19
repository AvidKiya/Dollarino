import { useState } from 'react';
import { Award, Download, Share2, X } from 'lucide-react';
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

    const bg = ctx.createLinearGradient(0, 0, 800, 1000);
    bg.addColorStop(0, '#040814');
    bg.addColorStop(0.5, '#081b56');
    bg.addColorStop(1, '#040814');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 800, 1000);

    const gBlue = ctx.createRadialGradient(650, 180, 10, 650, 180, 280);
    gBlue.addColorStop(0, 'rgba(20, 100, 246, 0.45)');
    gBlue.addColorStop(1, 'transparent');
    ctx.fillStyle = gBlue;
    ctx.fillRect(0, 0, 800, 1000);

    const gGreen = ctx.createRadialGradient(580, 720, 10, 580, 720, 300);
    gGreen.addColorStop(0, 'rgba(22, 230, 100, 0.22)');
    gGreen.addColorStop(1, 'transparent');
    ctx.fillStyle = gGreen;
    ctx.fillRect(0, 0, 800, 1000);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillText('DOLLARINO', 64, 96);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('CENTRAL AI · DOLLARINO V0.1 · COPY-TRADE', 64, 122);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(metrics.periodLabel, 540, 100);

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText('7-DAY PERFORMANCE', 64, 240);

    ctx.fillStyle = isPositive ? '#16E664' : '#f43f5e';
    ctx.font = 'bold 92px JetBrains Mono, monospace';
    ctx.fillText(`${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}%`, 64, 340);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px JetBrains Mono, monospace';
    ctx.fillText(`${metrics.last7Days >= 0 ? '+' : '-'}$${Math.abs(metrics.last7Days).toFixed(2)} USDT`, 64, 405);

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
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, 324, 112, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillText(lbl ?? '', bx + 22, by + 38);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px JetBrains Mono, monospace';
      ctx.fillText(val ?? '', bx + 22, by + 82);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('dollarino.pages.dev · Toobit · KCEX · Paper Demo', 64, 940);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `dollarino-weekly-card-${Date.now()}.png`;
    a.click();
  };

  const shareSummary = () => {
    const txt = `Dollarino AI Trading Desk (${metrics.periodLabel})\n7d Return: ${isPositive ? '+' : ''}${metrics.pnlPercentage.toFixed(2)}% (${metrics.last7Days >= 0 ? '+' : ''}$${metrics.last7Days.toFixed(2)})\nWin Rate: ${metrics.winRate.toFixed(1)}% | Top Asset: ${topAsset}`;
    void navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-30 rounded-full bg-black/45 hover:bg-black/70 p-2 text-white backdrop-blur-md border border-white/15"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="hero-cobalt relative isolate mx-auto aspect-[4/5] w-full overflow-hidden rounded-[26px] text-white shadow-[0_32px_90px_rgba(0,0,0,0.65)]">
          <div className="relative z-10 flex h-full flex-col justify-between p-6">
            <div className="flex items-center justify-between gap-3 pe-8">
              <div className="flex items-center gap-2.5">
                <DollarinoBrandMark size={40} glow />
                <div>
                  <p className="text-[14px] font-black tracking-[0.12em]">DOLLARINO</p>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-white/65">AI Trading Desk</p>
                </div>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                {lang === 'fa' ? 'نتایج هفتگی' : 'Weekly results'}
              </span>
            </div>

            <div className="my-auto py-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/70">{metrics.periodLabel}</p>
              <div className={`mt-2 text-5xl font-black font-mono-num tracking-tight ${isPositive ? 'text-[#55ff94]' : 'text-rose-200'}`}>
                {isPositive ? '+' : ''}
                {metrics.pnlPercentage.toFixed(2)}%
              </div>
              <p className="mt-2 text-lg font-bold font-mono-num text-white">
                {metrics.last7Days >= 0 ? '+' : '-'}${Math.abs(metrics.last7Days).toFixed(2)} <span className="text-xs text-white/65">USDT (7d)</span>
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/65">{lang === 'fa' ? 'ارز پربازده' : 'Top Asset'}</p>
                  <p className="mt-1 text-sm font-black font-mono-num text-white flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-[#FF8A00]" />
                    <span>{topAsset}</span>
                  </p>
                  <p className="text-[10px] font-mono-num text-[#55ff94]">
                    {metrics.mostProfitableAssetPnl >= 0 ? '+' : ''}${metrics.mostProfitableAssetPnl.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/65">{lang === 'fa' ? 'دارایی کل' : 'Total Balance'}</p>
                  <p className="mt-1 text-sm font-black font-mono-num text-white">
                    ${metrics.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] font-mono-num text-white/70">
                    Protected: ${metrics.todayProtectedCredit.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/65">{lang === 'fa' ? 'نرخ برد' : 'Win Rate'}</p>
                  <p className="mt-1 text-sm font-black font-mono-num text-[#55ff94]">{metrics.winRate.toFixed(1)}%</p>
                </div>

                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/65">Profit Factor</p>
                  <p className="mt-1 text-sm font-black font-mono-num text-white">{metrics.profitFactor.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/15">
              <button
                onClick={downloadCardPng}
                className="flex-1 py-2.5 rounded-xl bg-[#16E664] hover:bg-[#12cc56] text-[#042310] text-xs font-black inline-flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'دانلود تصویر PNG' : 'Download PNG'}</span>
              </button>
              <button
                onClick={shareSummary}
                className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
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
