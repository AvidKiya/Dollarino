import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Gauge,
  Radar,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_MIXER_WEIGHTS,
  type DollarinoSignal,
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

  const [weights, setWeights] = useState<SignalMixerWeights>(initialWeights);
  const [threshold, setThreshold] = useState<number>(Number(config.mixer_threshold ?? 65));
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>((config.strategy_key as StrategyKey) || 'sp2l');
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
        strategy_flow_json: {
          strategyKey: selectedStrategy,
          threshold,
          weights,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    await onRefresh();
    setSavedMsg(lang === 'fa' ? 'فلو استراتژی و وزن‌های میکسر ذخیره شد!' : 'Strategy Flow & Mixer Weights saved!');
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
      title: lang === 'fa' ? 'منبع سیگنال و دیتا' : 'Market & Webhook Feed',
      detail: `${String(config.symbol || 'BTCUSDT')} · ${scanTf} + TradingView`,
      icon: Radar,
      color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    },
    {
      step: '02',
      title: lang === 'fa' ? 'موتور استراتژی' : 'Strategy Engine',
      detail: selectedStrategy.toUpperCase(),
      icon: Cpu,
      color: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    },
    {
      step: '03',
      title: lang === 'fa' ? 'میکسر ۸ کاناله تایم‌ترید' : '8-Ch Signal Mixer',
      detail: `Gate ≥ ${threshold}%`,
      icon: SlidersHorizontal,
      color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    },
    {
      step: '04',
      title: lang === 'fa' ? 'دروازه ریسک و AI' : 'Risk & BYO AI Gate',
      detail: `Margin ${String(config.margin_pct)}% · ${Boolean(config.ai_gate_enabled) ? 'AI ON' : 'AI OFF'}`,
      icon: BrainCircuit,
      color: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    },
    {
      step: '05',
      title: lang === 'fa' ? 'اجرا + ۳ تارگت ریسک‌فری' : 'Execute + 3-TP Risk-Free',
      detail: `[${String(config.tp1_close_pct)}/${String(config.tp2_close_pct)}/${String(config.tp3_close_pct)}]`,
      icon: ShieldCheck,
      color: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">
              {lang === 'fa' ? 'معماری بصری فلو ترید و میکسر ۸ کاناله (TimeTrade + CodexBot)' : 'Visual Strategy Flow & 8-Channel Signal Mixer'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'fa'
                ? 'تمامی گره‌های استراتژی از لحظه دریافت کندل تا اجرای ۳ تارگت و انتقال استاپ به نقطه ورود'
                : 'End-to-end execution pipeline from live candle ingestion & 8-channel scoring to 3-TP Risk-Free exit management'}
            </p>
          </div>
          <button
            onClick={saveFlow}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
          >
            <Save className="w-4 h-4" />
            <span>{lang === 'fa' ? 'ذخیره فلو و وزن‌ها' : 'Save Flow & Weights'}</span>
          </button>
        </div>

        {savedMsg && <div className="text-xs px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">{savedMsg}</div>}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {nodes.map((n, idx) => {
            const Icon = n.icon;
            return (
              <div key={n.step} className="relative flex items-center gap-2">
                <div className={`w-full p-3.5 rounded-2xl border ${n.color}`}>
                  <div className="flex items-center justify-between text-[10px] opacity-80 font-mono-num">
                    <span>NODE {n.step}</span>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-xs text-white mt-1.5">{n.title}</div>
                  <div className="text-[11px] opacity-90 mt-1 font-mono-num">{n.detail}</div>
                </div>
                {idx < nodes.length - 1 && <ArrowRight className="hidden md:block w-4 h-4 text-slate-600 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'fa' ? 'تنظیم وزن ۸ کانال سیگنال میکسر' : '8-Channel Signal Mixer Weights'}</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Threshold:</span>
              <span className="font-mono-num font-bold text-emerald-400">{threshold}%</span>
            </div>
          </div>

          <input
            type="range"
            min={35}
            max={95}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHANNEL_INFO.map((ch) => (
              <div key={ch.key} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-200">{lang === 'fa' ? ch.labelFa : ch.labelEn}</span>
                  <span className="font-mono-num font-bold text-cyan-300">w={weights[ch.key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={5}
                  value={weights[ch.key]}
                  onChange={(e) => setWeights({ ...weights, [ch.key]: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
          <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'خروجی لحظه‌ای ۸ کانال روی نماد فعال' : 'Live 8-Channel Score Breakdown'}</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1">Active Strategy</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value as StrategyKey)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              >
                <option value="sp2l">SP2L Liquidity Sweep (CodexBot)</option>
                <option value="ema_trend_pullback">EMA 20/50 Pullback</option>
                <option value="grid_strategy">Grid Mean Reversion</option>
                <option value="vibe_4h_daily_breakout">4H/Daily Breakout</option>
                <option value="vibe_4h_candle_confirmation">4H Candle Confirmation</option>
                <option value="test_strategy">TestStrategy (1-Shot)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Scan Timeframe</label>
              <select
                value={scanTf}
                onChange={(e) => setScanTf(e.target.value as Timeframe)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              >
                {['5m', '15m', '30m', '1h', '4h'].map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {(mixerSnapshot?.channels ?? []).map((ch) => (
              <div key={ch.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800/80">
                <div>
                  <span className="font-semibold text-slate-200">{ch.label}</span>
                  <span className="text-[10px] text-slate-400 ms-2">(w={ch.weight})</span>
                </div>
                <span className={`font-mono-num font-bold ${ch.score > 0 ? 'text-emerald-400' : ch.score < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {ch.score > 0 ? '+' : ''}{ch.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>
              {lang === 'fa'
                ? `اسکنر چندارزی صرافی ${provider.toUpperCase()} (${markets.length} جفت‌ارز)`
                : `${provider.toUpperCase()} Live Strategy Scanner (${markets.length} pairs)`}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={scanFilter}
              onChange={(e) => setScanFilter(e.target.value)}
              placeholder={lang === 'fa' ? 'فیلتر ارز (مثلاً PEPE, SUI, TON)' : 'Filter coins (e.g. PEPE, SUI)'}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs w-48"
            />
            <button
              disabled={scanning}
              onClick={runScanner}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold"
            >
              {scanning ? '...' : lang === 'fa' ? 'اسکن ۱۲ جفت‌ارز' : 'Scan 12 Pairs'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scanResults.map((r) => (
            <div key={r.symbol} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">{r.symbol}</span>
                <span className="font-mono-num text-cyan-300">${r.price.toFixed(r.price >= 100 ? 2 : 4)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Trend: {r.trend} · RSI {r.rsi}</span>
                <span className="font-mono-num text-emerald-300">Mixer: {r.mixerConfidence}% {r.mixerDirection}</span>
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
                  className="w-full py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Execute {r.signal.direction} Signal</span>
                </button>
              ) : (
                <div className="text-[11px] text-slate-500 italic">No active entry candle yet</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
