import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Gauge,
  Layers,
  Radar,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  mergeKbosParams,
  type DollarinoSignal,
  type KbosParams,
  type MaVariantKind,
  type SignalMixerResult,
  type SignalMixerWeights,
  type StrategyKey,
  type Timeframe,
} from '@dollarino/core';
import type { ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface ScanResult {
  symbol: string;
  price: number;
  trend: string;
  rsi: number;
  mixerConfidence: number;
  mixerDirection: string;
  barsAgo?: number | null;
  signal: DollarinoSignal | null;
}

const MA_VARIANTS: MaVariantKind[] = ['ALMA', 'EMA', 'DEMA', 'TEMA', 'SMA', 'WMA', 'VWMA', 'SMMA', 'HullMA', 'LSMA', 'TMA', 'SSMA'];

const CHANNEL_INFO: Array<{ key: keyof SignalMixerWeights; labelFa: string; labelEn: string }> = [
  { key: 'trend', labelFa: 'روند EMA 20/50 + HTF', labelEn: 'EMA 20/50 & HTF Trend' },
  { key: 'momentum', labelFa: 'مومنتوم RSI / ROC', labelEn: 'RSI Momentum' },
  { key: 'liquiditySweep', labelFa: 'شکار نقدینگی SP2L', labelEn: 'Liquidity Sweep (SP2L)' },
  { key: 'fvg', labelFa: 'گپ ارزش منصفانه FVG', labelEn: 'Fair Value Gap (FVG)' },
  { key: 'volatility', labelFa: 'رژیم نوسان ATR', labelEn: 'ATR Volatility' },
  { key: 'volume', labelFa: 'اسپایک حجم معاملات', labelEn: 'Volume Surge' },
  { key: 'structure', labelFa: 'ساختار کندل', labelEn: 'Candle Structure' },
  { key: 'meanReversion', labelFa: 'بازگشت به میانگین BB', labelEn: 'Bollinger Mean Reversion' },
];

export function StrategyFlowPage({
  lang,
  config,
  markets,
  provider,
  mixerSnapshot,
  onRefresh,
}: {
  lang: Lang;
  config: Record<string, unknown>;
  markets: ExchangeMarket[];
  provider: string;
  mixerSnapshot: SignalMixerResult | null;
  onRefresh: () => Promise<void>;
}) {
  const initialWeights: SignalMixerWeights = (() => {
    try {
      return config.mixer_weights_json ? (JSON.parse(String(config.mixer_weights_json)) as SignalMixerWeights) : DEFAULT_MIXER_WEIGHTS;
    } catch {
      return DEFAULT_MIXER_WEIGHTS;
    }
  })();

  const initialKbos: KbosParams = (() => {
    try {
      return config.kbos_params_json ? mergeKbosParams(JSON.parse(String(config.kbos_params_json))) : { ...DEFAULT_KBOS_PARAMS };
    } catch {
      return { ...DEFAULT_KBOS_PARAMS };
    }
  })();

  const [weights, setWeights] = useState<SignalMixerWeights>(initialWeights);
  const [threshold, setThreshold] = useState<number>(Number(config.mixer_threshold ?? 65));
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>((config.strategy_key as StrategyKey) || 'dollarino_v01');
  const [kbos, setKbos] = useState<KbosParams>(initialKbos);
  const [scanTf, setScanTf] = useState<Timeframe>((config.entry_timeframe as Timeframe) || '15m');
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanFilter, setScanFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const saveFlow = async () => {
    setSavedMsg('');
    try {
      await apiFetch('/api/trading/config', {
        method: 'PATCH',
        body: JSON.stringify({
          strategy_key: selectedStrategy,
          mixer_threshold: threshold,
          mixer_weights_json: weights,
          kbos_params_json: kbos,
          trailing_stop_enabled: kbos.useTrail ? 1 : 0,
          trailing_stop_pct: kbos.trailPct,
          trail_after_tp1: kbos.trailAfterTp1 ? 1 : 0,
          strategy_flow_json: { strategyKey: selectedStrategy, threshold, weights, kbos, updatedAt: new Date().toISOString() },
        }),
      });
      await onRefresh();
      setSavedMsg(lang === 'fa' ? 'فلو استراتژی منتخب دلارینو و میکسر ذخیره شد!' : 'Dollarino Select Strategy Flow & Mixer saved!');
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Failed to save strategy flow');
    }
  };

  const runScanner = async () => {
    setScanning(true);
    try {
      const q = scanFilter.trim().toUpperCase();
      const customSymbols = q
        ? markets
            .filter((m) => m.symbol.includes(q) || m.base.includes(q) || q.split(/[\s,]+/).some((tok) => tok && m.symbol.includes(tok)))
            .slice(0, 14)
            .map((m) => m.symbol)
        : undefined;
      const res = await apiFetch<{ results: ScanResult[] }>('/api/trading/scanner', {
        method: 'POST',
        body: JSON.stringify({ strategyKey: selectedStrategy, timeframe: scanTf, symbols: customSymbols?.length ? customSymbols : undefined, limit: 14 }),
      });
      setScanResults(res.results);
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Scanner error');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void runScanner();
  }, []);

  const nodes = [
    { step: '01', title: lang === 'fa' ? 'دیتای غیرریپینت' : 'Closed Candle Feed', detail: `${String(config.symbol || 'BTCUSDT')} · ${scanTf} HTF×${kbos.intRes}`, icon: Radar },
    { step: '02', title: lang === 'fa' ? 'موتور استراتژی' : 'Strategy Engine', detail: selectedStrategy === 'dollarino_v01' ? (lang === 'fa' ? 'استراتژی منتخب دلارینو' : 'Dollarino Select (Dorna V1)') : selectedStrategy === 'kbos_v11' ? `KBOs v11 (${kbos.basisType})` : selectedStrategy.toUpperCase(), icon: Cpu },
    { step: '03', title: lang === 'fa' ? 'فیلتر DEMA + میکسر' : 'DEMA ATR & Mixer', detail: `Gate ≥ ${threshold}%`, icon: SlidersHorizontal },
    { step: '04', title: lang === 'fa' ? 'دروازه ریسک و AI' : 'Risk & AI Gate', detail: `Margin ${String(config.margin_pct)}%`, icon: BrainCircuit },
    { step: '05', title: lang === 'fa' ? 'خروج ۳ تارگت + تریل' : '3-TP + Trail SL', detail: `[${kbos.tp1Pct}/${kbos.tp2Pct}/${kbos.tp3Pct}%] · ${kbos.trailPct}%`, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5">
      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-main flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand" />
              <span>{lang === 'fa' ? 'استراتژی منتخب دلارینو (موتور دُرنا V1) و تنظیمات تخصصی' : 'Dollarino Select (Dorna V1) & Pro Pipeline'}</span>
            </h2>
            <p className="text-xs text-sub mt-0.5">
              {lang === 'fa'
                ? 'استراتژی منتخب دلارینو تمام الگوریتم‌های KBOs، SP2L، EMA Pullback، Breakout و میکسر ۸ کاناله را در یک موتور جامع ترکیب می‌کند.'
                : 'Dollarino Select unifies KBOs v11, SP2L Sweeps, Trend Pullback, Breakout & 8-Channel Mixer.'}
            </p>
          </div>
          <button onClick={saveFlow} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-emerald font-extrabold text-xs">
            <Save className="w-4 h-4" />
            <span>{lang === 'fa' ? 'ذخیره تنظیمات استراتژی' : 'Save Flow & Params'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {([
            ['dollarino_v01', lang === 'fa' ? '✨ استراتژی منتخب دلارینو (موتور دُرنا V1)' : '✨ Dollarino Select (Dorna V1)'],
            ['kbos_v11', 'KBOs Super v11'],
            ['sp2l', 'SP2L Liquidity Sweep'],
            ['ema_trend_pullback', 'EMA Trend Pullback'],
            ['signal_mixer', '8-Channel Mixer'],
            ['grid_strategy', 'Grid BB Reversion'],
          ] as Array<[StrategyKey, string]>).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedStrategy(k)}
              className={`px-3.5 py-2 rounded-xl font-extrabold border transition ${
                selectedStrategy === k ? 'btn-cobalt border-transparent' : 'surface-soft text-sub hover:text-main'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {savedMsg && <div className="text-xs px-3.5 py-2.5 rounded-xl badge-signal font-bold">{savedMsg}</div>}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {nodes.map((n, idx) => {
            const Icon = n.icon;
            return (
              <div key={n.step} className="relative flex items-center gap-2">
                <div className="w-full p-3.5 rounded-2xl surface-soft border">
                  <div className="flex items-center justify-between text-[10px] text-brand font-mono-num font-bold">
                    <span>NODE {n.step}</span>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-extrabold text-xs text-main mt-1.5">{n.title}</div>
                  <div className="text-[11px] text-sub mt-1 font-mono-num">{n.detail}</div>
                </div>
                {idx < nodes.length - 1 && <ArrowRight className="hidden md:block w-4 h-4 text-dim shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="surface-card p-5 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <Cpu className="w-4 h-4 text-signal" />
            <span>Dollarino Select (Dorna V1) & KBOs Engine</span>
          </h3>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full banner-cobalt-soft text-brand font-mono-num font-bold">
            Non-Repainting HTF ×{kbos.intRes} + RLA 8-Band Ribbon
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-sub font-semibold block mb-1">Basis MA Type</label>
            <select value={kbos.basisType} onChange={(e) => setKbos({ ...kbos, basisType: e.target.value as MaVariantKind })} className="w-full surface-input rounded-xl px-2.5 py-2">
              {MA_VARIANTS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">MA Period</label>
            <input type="number" min={1} max={100} value={kbos.basisLen} onChange={(e) => setKbos({ ...kbos, basisLen: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Res Multiplier</label>
            <input type="number" min={1} max={60} value={kbos.intRes} onChange={(e) => setKbos({ ...kbos, intRes: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">DEMA ATR Factor</label>
            <input type="number" step="0.1" value={kbos.factorAtr} onChange={(e) => setKbos({ ...kbos, factorAtr: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">TP1 / TP2 / TP3 (%)</label>
            <div className="flex gap-1">
              <input type="number" step="0.5" value={kbos.tp1Pct} onChange={(e) => setKbos({ ...kbos, tp1Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1.5 py-2 font-mono-num" />
              <input type="number" step="0.5" value={kbos.tp2Pct} onChange={(e) => setKbos({ ...kbos, tp2Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1.5 py-2 font-mono-num" />
              <input type="number" step="0.5" value={kbos.tp3Pct} onChange={(e) => setKbos({ ...kbos, tp3Pct: Number(e.target.value) })} className="w-1/3 surface-input rounded-lg px-1.5 py-2 font-mono-num" />
            </div>
          </div>
          <div>
            <label className="text-sub font-semibold block mb-1">Trail SL (%)</label>
            <input type="number" step="0.1" value={kbos.trailPct} onChange={(e) => setKbos({ ...kbos, trailPct: Number(e.target.value) })} className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['useRes', 'Use HTF Resolution'],
            ['useDemaAtr', 'DEMA ATR Confirmation'],
            ['haCandles', 'Heikin Ashi DEMA'],
            ['useTrail', 'Trailing Stop Loss'],
            ['trailAfterTp1', 'Trail After TP1'],
            ['beAfterTp1', 'BreakEven @ TP1'],
            ['useAtr1', 'ATR Norm Gate'],
            ['useVol', 'Volume > 1.5×SMA'],
            ['useEma200', 'EMA 200 Trend Filter'],
            ['useAdx', 'ADX > 25 Filter'],
          ] as Array<[keyof KbosParams, string]>).map(([k, lbl]) => (
            <label key={k} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-soft border text-main font-semibold cursor-pointer">
              <input type="checkbox" checked={Boolean(kbos[k])} onChange={(e) => setKbos({ ...kbos, [k]: e.target.checked })} />
              <span>{lbl}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 surface-card p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm text-main flex items-center gap-2">
              <Gauge className="w-4 h-4 text-signal" />
              <span>{lang === 'fa' ? 'تنظیم وزن ۸ کانال میکسر' : '8-Channel Signal Mixer Weights'}</span>
            </h3>
            <span className="font-mono-num font-black text-signal">Threshold: {threshold}%</span>
          </div>

          <input type="range" min={35} max={95} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[#10D856]" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHANNEL_INFO.map((ch) => (
              <div key={ch.key} className="p-3 rounded-2xl surface-soft border space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-main">{lang === 'fa' ? ch.labelFa : ch.labelEn}</span>
                  <span className="font-mono-num font-bold text-brand">w={weights[ch.key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={5}
                  value={weights[ch.key]}
                  onChange={(e) => setWeights({ ...weights, [ch.key]: Number(e.target.value) })}
                  className="w-full accent-[#1464F6]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 surface-card p-5 space-y-4 text-xs">
          <h3 className="font-black text-sm text-main">{lang === 'fa' ? 'انتخاب استراتژی و خروجی زنده' : 'Active Strategy & Score'}</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sub font-semibold block mb-1">Active Strategy</label>
              <select value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value as StrategyKey)} className="w-full surface-input rounded-xl px-3 py-2">
                <option value="dollarino_v01">✨ استراتژی منتخب دلارینو (موتور دُرنا V1)</option>
                <option value="ai_autonomous_agent">هوش مصنوعی دلارینو</option>
                <option value="kbos_v11">KBOs Super v11</option>
                <option value="sp2l">SP2L Liquidity Sweep</option>
                <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
                <option value="grid_strategy">Grid Mean Reversion</option>
                <option value="signal_mixer">8-Channel Signal Mixer</option>
                <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
              </select>
            </div>
            <div>
              <label className="text-sub font-semibold block mb-1">Scan Timeframe</label>
              <select value={scanTf} onChange={(e) => setScanTf(e.target.value as Timeframe)} className="w-full surface-input rounded-xl px-3 py-2">
                {['5m', '15m', '30m', '1h', '4h'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {(mixerSnapshot?.channels ?? []).map((ch) => (
              <div key={ch.key} className="flex items-center justify-between p-2.5 rounded-xl surface-soft border">
                <div>
                  <span className="font-bold text-main">{ch.label}</span>
                  <span className="text-[10px] text-dim ms-2">(w={ch.weight})</span>
                </div>
                <span className={`font-mono-num font-black ${ch.score > 0 ? 'text-signal' : ch.score < 0 ? 'text-loss' : 'text-dim'}`}>
                  {ch.score > 0 ? '+' : ''}{ch.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <Zap className="w-4 h-4 text-flame" />
            <span>
              {lang === 'fa'
                ? `اسکنر زنده ${selectedStrategy === 'dollarino_v01' ? 'استراتژی منتخب دلارینو' : selectedStrategy.toUpperCase()} (${markets.length} جفت‌ارز ${provider.toUpperCase()})`
                : `${provider.toUpperCase()} Live Scanner (${markets.length} pairs)`}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={scanFilter}
              onChange={(e) => setScanFilter(e.target.value)}
              placeholder={lang === 'fa' ? 'فیلتر ارز...' : 'Filter coins...'}
              className="surface-input rounded-xl px-3 py-1.5 text-xs w-44"
            />
            <button disabled={scanning} onClick={runScanner} className="px-4 py-1.5 rounded-xl btn-cobalt font-bold">
              {scanning ? '...' : lang === 'fa' ? 'اسکن ۱۲ جفت‌ارز' : 'Scan 12 Pairs'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scanResults.map((r) => (
            <div key={r.symbol} className="p-3.5 rounded-2xl surface-soft border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-main">{r.symbol}</span>
                <span className="font-mono-num text-brand font-bold">${r.price.toFixed(r.price >= 100 ? 2 : 4)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-sub">
                <span>Trend: {r.trend} · RSI {r.rsi}</span>
                <span className="font-mono-num text-signal font-bold">Mixer: {r.mixerConfidence}% {r.mixerDirection}</span>
              </div>
              {r.signal ? (
                <button
                  onClick={async () => {
                    setSavedMsg('');
                    try {
                      const res = await apiFetch<{ ok: boolean; tradeId?: string; error?: string }>('/api/trading/signals/execute', {
                        method: 'POST',
                        body: JSON.stringify({ signal: r.signal, executeNow: true, source: 'scanner' }),
                      });
                      setSavedMsg(
                        res.ok
                          ? (lang === 'fa' ? `معامله ${r.symbol} باز شد (${res.tradeId})` : `Opened ${r.symbol} (${res.tradeId})`)
                          : res.error || 'Rejected'
                      );
                      await onRefresh();
                    } catch (err) {
                      setSavedMsg(err instanceof Error ? err.message : 'Execution failed');
                    }
                  }}
                  className="w-full py-2 rounded-xl btn-emerald font-extrabold flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'fa'
                      ? `اجرای ${r.signal.direction} (${r.barsAgo ? `${r.barsAgo} کندل پیش` : 'هم‌اکنون'})`
                      : `Execute ${r.signal.direction} (${r.barsAgo ? `${r.barsAgo}b ago` : 'Live'})`}
                  </span>
                </button>
              ) : (
                <div className="text-[11px] text-dim italic">
                  {lang === 'fa' ? 'در حال رصد نقطه ورود مطمئن...' : 'Monitoring for clean entry...'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
