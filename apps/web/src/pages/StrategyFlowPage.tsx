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
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { ExchangeMarket } from '../components/SymbolPickerModal';

interface ScanResult {
  symbol: string;
  price: number;
  trend: string;
  rsi: number;
  mixerConfidence: number;
  mixerDirection: string;
  signal: DollarinoSignal | null;
  formatted: string | null;
}

const MA_VARIANTS: MaVariantKind[] = ['ALMA', 'EMA', 'DEMA', 'TEMA', 'SMA', 'WMA', 'VWMA', 'SMMA', 'HullMA', 'LSMA', 'TMA', 'SSMA'];

const CHANNEL_INFO: Array<{ key: keyof SignalMixerWeights; labelFa: string; labelEn: string }> = [
  { key: 'trend', labelFa: 'روند EMA 20/50 + HTF', labelEn: 'EMA 20/50 & HTF Trend' },
  { key: 'momentum', labelFa: 'مومنتوم RSI / ROC', labelEn: 'RSI Momentum' },
  { key: 'liquiditySweep', labelFa: 'شکار نقدینگی SP2L', labelEn: 'Liquidity Sweep (SP2L)' },
  { key: 'fvg', labelFa: 'گپ ارزش منصفانه FVG', labelEn: 'Fair Value Gap (FVG)' },
  { key: 'volatility', labelFa: 'رژیم نوسان ATR', labelEn: 'ATR Volatility' },
  { key: 'volume', labelFa: 'اسپایک حجم معاملات', labelEn: 'Volume Surge' },
  { key: 'structure', labelFa: 'ساختار کندل (Body)', labelEn: 'Candle Structure' },
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
      return config.mixer_weights_json
        ? (JSON.parse(String(config.mixer_weights_json)) as SignalMixerWeights)
        : DEFAULT_MIXER_WEIGHTS;
    } catch {
      return DEFAULT_MIXER_WEIGHTS;
    }
  })();

  const initialKbos: KbosParams = (() => {
    try {
      return config.kbos_params_json
        ? mergeKbosParams(JSON.parse(String(config.kbos_params_json)))
        : { ...DEFAULT_KBOS_PARAMS };
    } catch {
      return { ...DEFAULT_KBOS_PARAMS };
    }
  })();

  const [weights, setWeights] = useState<SignalMixerWeights>(initialWeights);
  const [threshold, setThreshold] = useState<number>(Number(config.mixer_threshold ?? 65));
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>((config.strategy_key as StrategyKey) || 'kbos_v11');
  const [kbos, setKbos] = useState<KbosParams>(initialKbos);
  const [scanTf, setScanTf] = useState<Timeframe>((config.entry_timeframe as Timeframe) || '15m');
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanFilter, setScanFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const saveFlow = async () => {
    setSavedMsg('');
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
        strategy_flow_json: {
          strategyKey: selectedStrategy,
          threshold,
          weights,
          kbos,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    await onRefresh();
    setSavedMsg(lang === 'fa' ? 'فلو استراتژی، KBOs v11 و وزن‌های میکسر ذخیره شد!' : 'Strategy Flow, KBOs v11 & Mixer Weights saved!');
  };

  const runScanner = async () => {
    setScanning(true);
    try {
      const q = scanFilter.trim().toUpperCase();
      const customSymbols = q
        ? markets
            .filter((m) => m.symbol.includes(q) || m.base.includes(q) || q.split(/[\s,]+/).some((tok) => tok && m.symbol.includes(tok)))
            .slice(0, 12)
            .map((m) => m.symbol)
        : undefined;
      const res = await apiFetch<{ results: ScanResult[] }>('/api/trading/scanner', {
        method: 'POST',
        body: JSON.stringify({
          strategyKey: selectedStrategy,
          timeframe: scanTf,
          symbols: customSymbols?.length ? customSymbols : undefined,
          limit: 12,
        }),
      });
      setScanResults(res.results);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void runScanner();
  }, []);

  const nodes = [
    {
      step: '01',
      title: lang === 'fa' ? 'دیتای غیرریپینت' : 'Closed Candle Feed',
      detail: `${String(config.symbol || 'BTCUSDT')} · ${scanTf} HTF×${kbos.intRes}`,
      icon: Radar,
      color: 'border-[#4b73f5]/40 bg-[#4b73f5]/10 text-[#9eb7ff]',
    },
    {
      step: '02',
      title: lang === 'fa' ? 'موتور KBOs v11' : 'Strategy Engine',
      detail: selectedStrategy === 'kbos_v11' ? `KBOs v11 (${kbos.basisType})` : selectedStrategy.toUpperCase(),
      icon: Cpu,
      color: 'border-[#27cd86]/40 bg-[#27cd86]/10 text-[#27cd86]',
    },
    {
      step: '03',
      title: lang === 'fa' ? 'فیلتر DEMA + میکسر' : 'DEMA ATR & Mixer',
      detail: `Gate ≥ ${threshold}%`,
      icon: SlidersHorizontal,
      color: 'border-[#8e4cf0]/40 bg-[#8e4cf0]/10 text-[#c9a8ff]',
    },
    {
      step: '04',
      title: lang === 'fa' ? 'دروازه ریسک و AI' : 'Risk & BYO AI Gate',
      detail: `Margin ${String(config.margin_pct)}% · ${Boolean(config.ai_gate_enabled) ? 'AI ON' : 'AI OFF'}`,
      icon: BrainCircuit,
      color: 'border-[#f59f14]/40 bg-[#f59f14]/10 text-[#f59f14]',
    },
    {
      step: '05',
      title: lang === 'fa' ? 'خروج ۳ تارگت + تریل' : '3-TP + Trail SL',
      detail: `[${kbos.tp1Pct}/${kbos.tp2Pct}/${kbos.tp3Pct}%] · ${kbos.trailPct}%`,
      icon: ShieldCheck,
      color: 'border-[#27cd86]/40 bg-[#27cd86]/10 text-[#27cd86]',
    },
  ];

  return (
    <div className="space-y-5">
      {/* 5-Node Visual Pipeline */}
      <div className="card-tt p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#4b73f5]" />
              <span>{lang === 'fa' ? 'معماری فلو استراتژی KIYA BOT v11 و میکسر ۸ کاناله' : 'Strategy Flow, KIYA BOT v11 & 8-Channel Signal Mixer'}</span>
            </h2>
            <p className="text-xs text-[#6c7689] mt-0.5">
              {lang === 'fa'
                ? 'تنظیم کامل اندیکاتورهای KBOs (Ribbon 8-Band + DEMA ATR) و وزن‌های میکسر برای اجرای خودکار'
                : 'End-to-end execution pipeline combining KIYA BOT ORG - super v11 Pine logic with TimeTrade 8-channel scoring'}
            </p>
          </div>
          <button
            onClick={saveFlow}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-bold text-xs glow-success"
          >
            <Save className="w-4 h-4" />
            <span>{lang === 'fa' ? 'ذخیره کل فلو و KBOs' : 'Save Flow & KBOs Params'}</span>
          </button>
        </div>

        {savedMsg && <div className="text-xs px-3 py-2 rounded-xl bg-[#27cd86]/15 border border-[#27cd86]/35 text-[#27cd86]">{savedMsg}</div>}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {nodes.map((n, idx) => {
            const Icon = n.icon;
            return (
              <div key={n.step} className="relative flex items-center gap-2">
                <div className={`w-full p-3.5 rounded-xl border ${n.color}`}>
                  <div className="flex items-center justify-between text-[10px] opacity-80 font-mono-num">
                    <span>NODE {n.step}</span>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-white mt-1.5">{n.title}</div>
                  <div className="text-[11px] opacity-90 mt-1 font-mono-num">{n.detail}</div>
                </div>
                {idx < nodes.length - 1 && <ArrowRight className="hidden md:block w-4 h-4 text-[#6c7689] shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* KIYA BOT ORG - super v11 Live Parameter Matrix */}
      <div className="card-tt p-5 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#27cd86]" />
            <span>KIYA BOT ORG - super v11 (KBOs v11) Engine Configuration</span>
          </h3>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#4b73f5]/15 text-[#4b73f5] border border-[#4b73f5]/35 font-mono-num">
            Non-Repainting HTF ×{kbos.intRes} + RLA 8-Band Ribbon
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[#6c7689] block mb-1">Basis MA Type (12)</label>
            <select value={kbos.basisType} onChange={(e) => setKbos({ ...kbos, basisType: e.target.value as MaVariantKind })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
              {MA_VARIANTS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">MA Period</label>
            <input type="number" min={1} max={100} value={kbos.basisLen} onChange={(e) => setKbos({ ...kbos, basisLen: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Res Multiplier</label>
            <input type="number" min={1} max={60} value={kbos.intRes} onChange={(e) => setKbos({ ...kbos, intRes: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">DEMA ATR Factor</label>
            <input type="number" step="0.1" value={kbos.factorAtr} onChange={(e) => setKbos({ ...kbos, factorAtr: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">TP1 / TP2 / TP3 (%)</label>
            <div className="flex gap-1">
              <input type="number" step="0.5" value={kbos.tp1Pct} onChange={(e) => setKbos({ ...kbos, tp1Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1.5 py-2 font-mono-num" />
              <input type="number" step="0.5" value={kbos.tp2Pct} onChange={(e) => setKbos({ ...kbos, tp2Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1.5 py-2 font-mono-num" />
              <input type="number" step="0.5" value={kbos.tp3Pct} onChange={(e) => setKbos({ ...kbos, tp3Pct: Number(e.target.value) })} className="w-1/3 bg-[#080a0e] border border-[#262b36] rounded px-1.5 py-2 font-mono-num" />
            </div>
          </div>
          <div>
            <label className="text-[#6c7689] block mb-1">Trail SL (%)</label>
            <input type="number" step="0.1" value={kbos.trailPct} onChange={(e) => setKbos({ ...kbos, trailPct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
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
            ['useEmaRsi', 'EMA + RSI Momentum'],
            ['useBb', 'Bollinger Slope Filter'],
          ] as Array<[keyof KbosParams, string]>).map(([k, lbl]) => (
            <label key={k} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#11151c] border border-[#1c2028] cursor-pointer">
              <input type="checkbox" checked={Boolean(kbos[k])} onChange={(e) => setKbos({ ...kbos, [k]: e.target.checked })} />
              <span className="text-[#d5dce6]">{lbl}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 8-Channel Mixer & Live Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 card-tt p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#27cd86]" />
              <span>{lang === 'fa' ? 'تنظیم وزن ۸ کانال سیگنال میکسر' : '8-Channel Signal Mixer Weights'}</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[#6c7689]">Threshold:</span>
              <span className="font-mono-num font-bold text-[#27cd86]">{threshold}%</span>
            </div>
          </div>

          <input type="range" min={35} max={95} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[#27cd86]" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHANNEL_INFO.map((ch) => (
              <div key={ch.key} className="p-3 rounded-xl bg-[#11151c] border border-[#1c2028] space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-white">{lang === 'fa' ? ch.labelFa : ch.labelEn}</span>
                  <span className="font-mono-num font-bold text-[#4b73f5]">w={weights[ch.key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={5}
                  value={weights[ch.key]}
                  onChange={(e) => setWeights({ ...weights, [ch.key]: Number(e.target.value) })}
                  className="w-full accent-[#4b73f5]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 card-tt p-5 space-y-4 text-xs">
          <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'انتخاب استراتژی و خروجی لحظه‌ای' : 'Active Strategy & Live 8-Channel Score'}</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[#6c7689] block mb-1">Active Strategy</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value as StrategyKey)}
                className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2"
              >
                <option value="kbos_v11">KIYA BOT ORG - super v11</option>
                <option value="sp2l">SP2L Liquidity Sweep</option>
                <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
                <option value="grid_strategy">Grid Mean Reversion</option>
                <option value="signal_mixer">8-Channel Signal Mixer</option>
                <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
              </select>
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Scan Timeframe</label>
              <select
                value={scanTf}
                onChange={(e) => setScanTf(e.target.value as Timeframe)}
                className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-2"
              >
                {['5m', '15m', '30m', '1h', '4h'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {(mixerSnapshot?.channels ?? []).map((ch) => (
              <div key={ch.key} className="flex items-center justify-between p-2 rounded-lg bg-[#11151c] border border-[#1c2028]">
                <div>
                  <span className="font-semibold text-white">{ch.label}</span>
                  <span className="text-[10px] text-[#6c7689] ms-2">(w={ch.weight})</span>
                </div>
                <span className={`font-mono-num font-bold ${ch.score > 0 ? 'text-[#27cd86]' : ch.score < 0 ? 'text-[#eb493d]' : 'text-[#6c7689]'}`}>
                  {ch.score > 0 ? '+' : ''}{ch.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Pair Live Scanner */}
      <div className="card-tt p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#f59f14]" />
            <span>
              {lang === 'fa'
                ? `اسکنر زنده ${selectedStrategy === 'kbos_v11' ? 'KBOs v11' : selectedStrategy.toUpperCase()} روی ${markets.length} جفت‌ارز ${provider.toUpperCase()}`
                : `${provider.toUpperCase()} Live ${selectedStrategy === 'kbos_v11' ? 'KBOs v11' : selectedStrategy} Scanner (${markets.length} pairs)`}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={scanFilter}
              onChange={(e) => setScanFilter(e.target.value)}
              placeholder={lang === 'fa' ? 'فیلتر ارز (مثلاً BTC, ETH, SOL)' : 'Filter coins (e.g. BTC, ETH)'}
              className="bg-[#080a0e] border border-[#262b36] rounded-lg px-3 py-1.5 text-xs w-48"
            />
            <button disabled={scanning} onClick={runScanner} className="px-3.5 py-1.5 rounded-lg bg-[#4b73f5] hover:bg-[#3d63e0] text-white font-semibold">
              {scanning ? '...' : lang === 'fa' ? 'اسکن ۱۲ جفت‌ارز' : 'Scan 12 Pairs'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scanResults.map((r) => (
            <div key={r.symbol} className="p-3.5 rounded-xl bg-[#11151c] border border-[#1c2028] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">{r.symbol}</span>
                <span className="font-mono-num text-[#4b73f5]">${r.price.toFixed(r.price >= 100 ? 2 : 4)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6c7689]">
                <span>Trend: {r.trend} · RSI {r.rsi}</span>
                <span className="font-mono-num text-[#27cd86]">Mixer: {r.mixerConfidence}% {r.mixerDirection}</span>
              </div>
              {r.signal ? (
                <button
                  onClick={async () => {
                    await apiFetch('/api/trading/signals/execute', {
                      method: 'POST',
                      body: JSON.stringify({ signal: r.signal, executeNow: true }),
                    });
                    await onRefresh();
                  }}
                  className="w-full py-1.5 rounded-lg bg-[#27cd86]/15 hover:bg-[#27cd86]/25 border border-[#27cd86]/40 text-[#27cd86] font-semibold flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Execute {r.signal.direction} Signal</span>
                </button>
              ) : (
                <div className="text-[11px] text-[#6c7689] italic">No active entry candle yet</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
