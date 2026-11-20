import { useState } from 'react';
import { Download, Layers, Sparkles, Target, TrendingUp, WandSparkles } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload } from '../lib/types';
import { DollarinoBrandMark } from '../components/BrandGraphics';

const THEMES = [
  { id: 'gold', labelFa: 'طلایی لوکس', labelEn: 'Obsidian Gold', from: '#3b2a08', to: '#11130a', accent: '#e8c15a', text: '#f5e8bd' },
  { id: 'cobalt', labelFa: 'کبالت رسمی', labelEn: 'Cobalt Blue', from: '#102a73', to: '#2b5cff', accent: '#38e1ff', text: '#eef2ff' },
  { id: 'light', labelFa: 'کاغذ روشن', labelEn: 'Paper White', from: '#ffffff', to: '#e8edf9', accent: '#2b5cff', text: '#101827' },
  { id: 'emerald', labelFa: 'سبز سیگنال', labelEn: 'Emerald Mint', from: '#052e22', to: '#0a5c40', accent: '#10d9a3', text: '#d9fff0' },
  { id: 'sunset', labelFa: 'غروب نئون', labelEn: 'Sunset Neon', from: '#3b0f2e', to: '#8a1c4d', accent: '#ffb35c', text: '#ffe9f0' },
];

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
  const totalEq = Math.max(1000, Number(data.balance.total || 10000));
  const realPnlPct = Number(((data.stats.totalPnl / Math.max(1000, totalEq - data.stats.totalPnl)) * 100).toFixed(1));

  const [name, setName] = useState(username || 'Trader');
  const [pnl, setPnl] = useState(realPnlPct !== 0 ? realPnlPct : 18.4);
  const [trades, setTrades] = useState(data.stats.totalTrades || 47);
  const [win, setWin] = useState(Math.round(data.stats.winRate || 72));
  const [themeId, setThemeId] = useState('cobalt');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const theme = THEMES.find((x) => x.id === themeId) ?? THEMES[0]!;
  const light = theme.id === 'light';

  const syncRealStats = () => {
    setName(username || 'Trader');
    setPnl(realPnlPct);
    setTrades(data.stats.totalTrades);
    setWin(Math.round(data.stats.winRate));
    setNotice(isFa ? 'آمار واقعی حساب شما روی کارت بارگذاری شد ✅' : 'Live account metrics loaded ✅');
  };

  const downloadPng = async () => {
    setBusy(true);
    try {
      await document.fonts.ready;
      const W = 1080;
      const H = 1350;
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, theme.from);
      g.addColorStop(1, theme.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const rg = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 600);
      rg.addColorStop(0, theme.accent + '44');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = light ? 'rgba(43,92,255,0.05)' : 'rgba(255,255,255,0.04)';
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

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 420px 'Fraunces', Georgia, serif";
      ctx.fillStyle = light ? 'rgba(43,92,255,0.055)' : 'rgba(255,255,255,0.055)';
      ctx.fillText('D$', W / 2, H * 0.57);
      ctx.restore();

      ctx.strokeStyle = theme.accent + '88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(30, 30, W - 60, H - 60, 36);
      ctx.stroke();

      const ink = light ? '#101827' : '#f5f2e8';
      const muted = light ? 'rgba(16,24,39,0.55)' : 'rgba(245,242,232,0.55)';
      // Draw real Dollarino logo on top-right
      try {
        const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = '/logo.png';
        });
        ctx.drawImage(logoImg, W - 190, 74, 110, 110);
      } catch {
        /* ignore */
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.accent;
      ctx.font = '800 26px Manrope, sans-serif';
      ctx.fillText('DOLLARINO · WEEKLY RESULTS', 82, 125);
      ctx.fillStyle = ink;
      ctx.font = "600 72px 'Fraunces', Georgia, serif";
      ctx.fillText(name || 'Trader', 82, 235);
      ctx.fillStyle = muted;
      ctx.font = '500 28px Manrope, sans-serif';
      ctx.fillText('Three Engines. Zero Guesswork.', 82, 290);

      ctx.fillStyle = muted;
      ctx.font = '600 28px Manrope, sans-serif';
      ctx.fillText('Weekly PnL', 82, 505);
      ctx.fillStyle = pnl >= 0 ? '#10d9a3' : '#ff4d6d';
      ctx.font = "600 170px 'Fraunces', Georgia, serif";
      ctx.fillText(`${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`, 78, 685);

      [
        { label: 'TOTAL TRADES', value: String(trades), glyph: '◈' },
        { label: 'WIN RATE', value: `${win}%`, glyph: '◎' },
        { label: 'PROFIT FACTOR', value: `${(data.stats.profitFactor || 1.8).toFixed(2)}`, glyph: '↗' },
      ].forEach((s, i) => {
        const x = 82 + i * 312;
        const y = 840;
        ctx.fillStyle = light ? 'rgba(43,92,255,0.045)' : 'rgba(255,255,255,0.055)';
        ctx.strokeStyle = light ? 'rgba(43,92,255,0.16)' : 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x, y, 284, 218, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = theme.accent;
        ctx.font = '600 34px Manrope, sans-serif';
        ctx.fillText(s.glyph, x + 25, y + 55);
        ctx.fillStyle = ink;
        ctx.font = "600 58px 'Fraunces', Georgia, serif";
        ctx.fillText(s.value, x + 25, y + 130);
        ctx.fillStyle = muted;
        ctx.font = '600 18px Manrope, sans-serif';
        ctx.fillText(s.label, x + 25, y + 181);
      });

      ctx.fillStyle = muted;
      ctx.font = '400 24px Manrope, sans-serif';
      ctx.fillText('Every market. One engine.', 82, H - 105);
      ctx.textAlign = 'right';
      ctx.fillText('dollarino.app', W - 82, H - 105);

      const a = document.createElement('a');
      a.download = `dollarino-weekly-${name || 'trader'}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
      setNotice(isFa ? 'تصویر با کیفیت ۴:۵ دانلود شد ✅' : '1080×1350 PNG exported ✅');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--gold)' }}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>THE WEEKLY CARD STUDIO</span>
        </p>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
          {isFa ? 'کارت نتایج هفتگی شما' : 'Shareable Weekly Results Card'}
        </h2>
        <p className="text-xs sm:text-sm text-dim mt-2">
          {isFa
            ? 'عملکرد حساب خود را در قالب کارت رسمی ۴:۵ با لوگوی دلارینو خروجی بگیرید و به اشتراک بگذارید.'
            : 'Customize or pull your real account performance into a crisp 1080×1350 PNG card.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div className="panel rounded-[26px] p-6 space-y-5">
          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? 'نام تریدر روی کارت' : 'TRADER NAME'}
            </label>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} className="field font-bold" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? 'سود هفته %' : 'PNL %'}</label>
              <input type="number" step="0.1" value={pnl} onChange={(e) => setPnl(+e.target.value)} className="field font-num font-bold" />
            </div>
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? 'تعداد ترید' : 'TRADES'}</label>
              <input type="number" value={trades} onChange={(e) => setTrades(Math.max(0, +e.target.value))} className="field font-num font-bold" />
            </div>
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? 'وین‌ریت %' : 'WIN %'}</label>
              <input type="number" value={win} onChange={(e) => setWin(Math.min(100, Math.max(0, +e.target.value)))} className="field font-num font-bold" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? 'رنگ کارت' : 'CARD THEME'}</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setThemeId(th.id)}
                  title={isFa ? th.labelFa : th.labelEn}
                  className={`h-10 w-10 rounded-full transition ${
                    themeId === th.id ? 'ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg)] scale-110' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ background: `linear-gradient(135deg,${th.from},${th.to})`, border: `1px solid ${th.accent}77` }}
                />
              ))}
              <span className="text-xs text-dim ms-1">{isFa ? theme.labelFa : theme.labelEn}</span>
            </div>
          </div>

          {notice && <p className="text-xs font-bold text-jade">{notice}</p>}

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => void downloadPng()} disabled={busy} className="btn-gold flex-1 py-3.5 rounded-2xl text-xs sm:text-sm inline-flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'دانلود تصویر PNG (۱۰۸۰×۱۳۵۰)' : 'Download 1080×1350 PNG'}</span>
            </button>
            <button type="button" onClick={syncRealStats} className="btn-ghost px-5 py-3.5 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2">
              <WandSparkles className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <span>{isFa ? 'استفاده از آمار حساب من' : 'Use My Live Stats'}</span>
            </button>
          </div>
        </div>

        {/* Live 4:5 Card Preview */}
        <div className="flex justify-center">
          <div
            className="w-[310px] sm:w-[340px] aspect-[4/5] rounded-[26px] overflow-hidden border p-7 flex flex-col shadow-2xl relative"
            style={{ background: `linear-gradient(150deg,${theme.from},${theme.to})`, borderColor: `${theme.accent}66`, color: theme.text }}
          >
            <span className="absolute inset-0 grid place-items-center font-display font-bold text-[180px] select-none" style={{ color: `${theme.accent}12` }}>
              D$
            </span>
            <div className="relative flex items-center justify-between">
              <span className="text-[9px] font-black tracking-[0.2em]" style={{ color: theme.accent }}>DOLLARINO · WEEKLY</span>
              <DollarinoBrandMark size={38} glow />
            </div>
            <div className="relative mt-6">
              <p className="text-xs opacity-60 font-semibold">{name || 'Trader'}</p>
              <p className="font-display font-bold text-2xl">Weekly Results</p>
            </div>
            <div className="relative mt-auto">
              <p className="text-xs opacity-60 font-semibold mb-1">{isFa ? 'سود هفته' : 'Weekly PnL'}</p>
              <p dir="ltr" className={`font-display font-bold text-5xl tabular ${pnl >= 0 ? 'text-jade' : 'text-loss'}`}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
              </p>
              <div className="grid grid-cols-3 gap-2 mt-5">
                {[
                  { icon: Layers, label: isFa ? 'معاملات' : 'TRADES', val: trades },
                  { icon: Target, label: isFa ? 'وین‌ریت' : 'WIN RATE', val: `${win}%` },
                  { icon: TrendingUp, label: 'PF', val: (data.stats.profitFactor || 1.8).toFixed(1) },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.label}
                      className="rounded-2xl p-2.5 border"
                      style={{
                        background: light ? 'rgba(43,92,255,0.05)' : 'rgba(255,255,255,0.06)',
                        borderColor: light ? 'rgba(43,92,255,0.16)' : 'rgba(255,255,255,0.14)',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5 mb-1 opacity-60" />
                      <p dir="ltr" className="font-display font-bold text-sm tabular">{s.val}</p>
                      <p className="text-[8px] opacity-60 font-bold mt-0.5">{s.label}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 text-[10px] opacity-60 font-semibold">Every market. One engine. · dollarino.app</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
