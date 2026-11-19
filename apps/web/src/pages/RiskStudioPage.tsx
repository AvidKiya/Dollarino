import { useState } from 'react';
import { Calculator, Save, ShieldCheck, Sparkles, Sliders } from 'lucide-react';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

export function RiskStudioPage({
  lang,
  config,
  markets,
  provider,
  balanceFree,
  refresh,
}: {
  lang: Lang;
  config: Record<string, unknown>;
  markets: ExchangeMarket[];
  provider: string;
  balanceFree?: string;
  refresh: () => Promise<void>;
}) {
  const initialRp = (() => {
    try {
      return config.risk_profile_json ? JSON.parse(String(config.risk_profile_json)) : {};
    } catch {
      return {};
    }
  })() as Record<string, unknown>;

  const [form, setForm] = useState({
    trading_mode: String(config.trading_mode ?? 'PAPER'),
    trade_execution_mode: String(config.trade_execution_mode ?? 'AUTO'),
    margin_mode: String(config.margin_mode ?? 'ISOLATED'),
    symbol: String(config.symbol ?? 'BTCUSDT'),
    strategy_key: String(config.strategy_key ?? 'kbos_v11'),
    entry_timeframe: String(config.entry_timeframe ?? '15m'),
    higher_timeframe: String(config.higher_timeframe ?? '1h'),
    margin_pct: Number(config.margin_pct ?? 50),
    max_leverage: Number(config.max_leverage ?? 5),
    use_signal_leverage: Boolean(config.use_signal_leverage ?? 1),
    tp1_close_pct: Number(config.tp1_close_pct ?? 30),
    tp2_close_pct: Number(config.tp2_close_pct ?? 30),
    tp3_close_pct: Number(config.tp3_close_pct ?? 40),
    auto_breakeven_on_tp1: Boolean(config.auto_breakeven_on_tp1 ?? 1),
    move_sl_to_tp1_on_tp2: Boolean(config.move_sl_to_tp1_on_tp2 ?? 1),
    trailing_stop_enabled: Boolean(config.trailing_stop_enabled ?? 1),
    trailing_stop_pct: Number(config.trailing_stop_pct ?? 2.0),
    trail_after_tp1: Boolean(config.trail_after_tp1 ?? 1),
    daily_max_loss_pct: Number(config.daily_max_loss_pct ?? 5),
    max_open_positions: Number(config.max_open_positions ?? 3),
    block_weekends: Boolean(config.block_weekends ?? 0),
    macro_blackout: Boolean(config.macro_blackout ?? 0),
    ai_gate_enabled: Boolean(config.ai_gate_enabled ?? 0),
    ai_min_confidence: Number(config.ai_min_confidence ?? 65),
    signal_channel_handle: String(config.signal_channel_handle ?? '@Dollarinoofficial'),
  });

  // TimeTrade Risk Management Parameters
  const [preset, setPreset] = useState<'conservative' | 'balanced' | 'aggressive'>(
    (initialRp.preset as 'conservative' | 'balanced' | 'aggressive') || 'balanced'
  );
  const [marketBias, setMarketBias] = useState<'neutral' | 'bullish' | 'bearish'>(
    (initialRp.marketBias as 'neutral' | 'bullish' | 'bearish') || 'neutral'
  );
  const [preferredSession, setPreferredSession] = useState<'automatic' | 'london' | 'new_york' | 'asia'>(
    (initialRp.preferredSession as 'automatic' | 'london' | 'new_york' | 'asia') || 'automatic'
  );
  const [entryStyle, setEntryStyle] = useState<'conservative' | 'balanced' | 'aggressive'>(
    (initialRp.entryStyle as 'conservative' | 'balanced' | 'aggressive') || 'balanced'
  );
  const [maxSpread, setMaxSpread] = useState<number>(Number(initialRp.maxSpread ?? 0.5));
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(Number(initialRp.cooldownMinutes ?? 10));

  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [simEntry, setSimEntry] = useState(63000);
  const [simSlPct, setSimSlPct] = useState(1.2);

  const applyPreset = (p: 'conservative' | 'balanced' | 'aggressive') => {
    setPreset(p);
    if (p === 'conservative') {
      setForm({ ...form, margin_pct: 25, max_leverage: 3, daily_max_loss_pct: 3, trailing_stop_enabled: true, trailing_stop_pct: 1.5 });
      setEntryStyle('conservative');
      setCooldownMinutes(15);
    } else if (p === 'balanced') {
      setForm({ ...form, margin_pct: 50, max_leverage: 5, daily_max_loss_pct: 5, trailing_stop_enabled: true, trailing_stop_pct: 2.0 });
      setEntryStyle('balanced');
      setCooldownMinutes(10);
    } else {
      setForm({ ...form, margin_pct: 75, max_leverage: 10, daily_max_loss_pct: 8, trailing_stop_enabled: true, trailing_stop_pct: 2.8 });
      setEntryStyle('aggressive');
      setCooldownMinutes(5);
    }
  };

  const equity = Number(balanceFree || config.paper_balance || 10000);
  const marginPerTrade = equity * (form.margin_pct / 100);
  const notionalSize = marginPerTrade * form.max_leverage;
  const maxHeatPct = Math.min(100, form.margin_pct * form.max_open_positions);
  const maxSlLossUsd = notionalSize * (simSlPct / 100);
  const estLiqMovePct = (90 / Math.max(1, form.max_leverage)).toFixed(2);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg(null);
    await apiFetch('/api/trading/config', {
      method: 'PATCH',
      body: JSON.stringify({
        ...form,
        use_signal_leverage: form.use_signal_leverage ? 1 : 0,
        auto_breakeven_on_tp1: form.auto_breakeven_on_tp1 ? 1 : 0,
        move_sl_to_tp1_on_tp2: form.move_sl_to_tp1_on_tp2 ? 1 : 0,
        trailing_stop_enabled: form.trailing_stop_enabled ? 1 : 0,
        trail_after_tp1: form.trail_after_tp1 ? 1 : 0,
        block_weekends: form.block_weekends ? 1 : 0,
        macro_blackout: form.macro_blackout ? 1 : 0,
        ai_gate_enabled: form.ai_gate_enabled ? 1 : 0,
        risk_profile_json: {
          preset,
          marketBias,
          preferredSession,
          entryStyle,
          maxSpread,
          cooldownMinutes,
          trailingStop: form.trailing_stop_enabled,
          trailingDistance: form.trailing_stop_pct,
        },
      }),
    });
    await refresh();
    setSavedMsg(lang === 'fa' ? 'پروفایل ریسک و قوانین خروج ۳ تارگت + تریلینگ ذخیره شد!' : 'Risk profile & 3-TP Trailing rules saved!');
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="card-tt p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#4b73f5]" />
            <span>{lang === 'fa' ? 'مدیریت ریسک هوشمند و قوانین ۳ تارگت' : 'AI Risk Management & 3-TP Protection Studio'}</span>
          </h2>
          <p className="text-xs text-[#6c7689] mt-0.5">
            {lang === 'fa'
              ? 'انتخاب پروفایل ریسک، بایاس بازار، سشن معاملاتی، تریلینگ استاپ پویا و ماشین‌حساب لیکوییدیشن'
              : 'Configure TimeTrade-grade risk presets, market bias, session lock, trailing stop distance & 3-TP Risk-Free sizing'}
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#27cd86] hover:bg-[#22b878] text-xs font-bold text-[#080a0e] glow-success"
        >
          <Save className="w-4 h-4" />
          <span>{lang === 'fa' ? 'ذخیره تنظیمات ریسک' : 'Save Risk Profile'}</span>
        </button>
      </div>

      {savedMsg && <div className="p-3 rounded-xl bg-[#27cd86]/15 border border-[#27cd86]/35 text-xs text-[#27cd86]">{savedMsg}</div>}

      {/* TimeTrade 3 Risk Presets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {[
          {
            id: 'conservative' as const,
            title: 'Conservative',
            badge: '3x · 1.5% Trail · 3% Daily Cap',
            desc: 'Lower drawdown profile with 25% allocation and tighter spread filtering.',
          },
          {
            id: 'balanced' as const,
            title: 'Balanced ★ Recommended',
            badge: '5x · 2.0% Trail · 5% Daily Cap',
            desc: 'Optimal risk-adjusted growth paired with KBOs v11 & Auto Risk-Free on TP1.',
          },
          {
            id: 'aggressive' as const,
            title: 'Aggressive',
            badge: '10x · 2.8% Trail · 8% Daily Cap',
            desc: 'High-conviction momentum scaling for experienced futures accounts.',
          },
        ].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={`p-4 rounded-xl border text-start transition ${
              preset === p.id
                ? 'border-[#4b73f5] bg-[#4b73f5]/10 shadow-sm'
                : 'border-[#1c2028] bg-[#0f1218] hover:border-[#262b36]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#4b73f5]" />
                <span>{p.title}</span>
              </span>
            </div>
            <div className="text-[10px] font-mono-num text-[#27cd86] mt-1">{p.badge}</div>
            <p className="text-[11px] text-[#6c7689] mt-1.5">{p.desc}</p>
          </button>
        ))}
      </div>

      {/* What-If Portfolio Heat & Liquidation Calculator */}
      <div className="card-tt-subtle p-4 sm:p-5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div>
          <div className="text-[#6c7689] flex items-center gap-1"><Calculator className="w-3.5 h-3.5 text-[#4b73f5]" /> Margin / Trade</div>
          <div className="text-base font-bold font-mono-num text-white mt-1">${marginPerTrade.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[#6c7689]">Max Position Notional</div>
          <div className="text-base font-bold font-mono-num text-[#4b73f5] mt-1">${notionalSize.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[#6c7689]">Portfolio Max Heat</div>
          <div className={`text-base font-bold font-mono-num mt-1 ${maxHeatPct > 60 ? 'text-[#eb493d]' : 'text-[#27cd86]'}`}>
            {maxHeatPct.toFixed(0)}% ({form.max_open_positions} slots)
          </div>
        </div>
        <div>
          <div className="text-[#6c7689]">Est. SL Loss @ {simSlPct}%</div>
          <div className="text-base font-bold font-mono-num text-[#f59f14] mt-1">-${maxSlLossUsd.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[#6c7689]">Est. Liq Distance</div>
          <div className="text-base font-bold font-mono-num text-[#eb493d] mt-1">±{estLiqMovePct}% (@{form.max_leverage}x)</div>
        </div>
      </div>

      {/* TimeTrade Behavioral Execution & Session Parameters + 3-TP Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="card-tt p-5 space-y-3.5">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#4b73f5]" />
            <span>{lang === 'fa' ? 'تنظیمات سشن، بایاس و تریلینگ استاپ' : 'Market Bias, Session & Trailing SL'}</span>
          </h3>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[#6c7689] block mb-1">Market Bias</label>
              <select value={marketBias} onChange={(e) => setMarketBias(e.target.value as typeof marketBias)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="neutral">Neutral (Both)</option>
                <option value="bullish">Bullish Bias</option>
                <option value="bearish">Bearish Bias</option>
              </select>
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Trading Session</label>
              <select value={preferredSession} onChange={(e) => setPreferredSession(e.target.value as typeof preferredSession)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="automatic">Automatic (24/7)</option>
                <option value="london">London Session</option>
                <option value="new_york">New York Session</option>
                <option value="asia">Asia Session</option>
              </select>
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Entry Style</label>
              <select value={entryStyle} onChange={(e) => setEntryStyle(e.target.value as typeof entryStyle)} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[#6c7689] block mb-1">Max Spread (%)</label>
              <input type="number" step="0.05" value={maxSpread} onChange={(e) => setMaxSpread(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Cooldown (min)</label>
              <input type="number" min={0} max={240} value={cooldownMinutes} onChange={(e) => setCooldownMinutes(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Trailing Dist (%)</label>
              <input type="number" step="0.1" min={0.3} max={15} value={form.trailing_stop_pct} onChange={(e) => setForm({ ...form, trailing_stop_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <label className="text-[#27cd86] block mb-1">TP1 Close %</label>
              <input type="number" value={form.tp1_close_pct} onChange={(e) => setForm({ ...form, tp1_close_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#f59f14] block mb-1">TP2 Close %</label>
              <input type="number" value={form.tp2_close_pct} onChange={(e) => setForm({ ...form, tp2_close_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-orange-400 block mb-1">TP3 Close %</label>
              <input type="number" value={form.tp3_close_pct} onChange={(e) => setForm({ ...form, tp3_close_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[#6c7689] block mb-1">Simulator Entry ($)</label>
              <input type="number" value={simEntry} onChange={(e) => setSimEntry(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-1.5 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Simulator SL Dist (%)</label>
              <input type="number" step="0.1" value={simSlPct} onChange={(e) => setSimSlPct(Number(e.target.value))} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-1.5 font-mono-num" />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={form.trailing_stop_enabled} onChange={(e) => setForm({ ...form, trailing_stop_enabled: e.target.checked })} />
            <span>{lang === 'fa' ? 'فعال‌سازی تریلینگ استاپ هوشمند (KBOs Trailing SL)' : 'Enable Dynamic Trailing Stop-Loss'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.trail_after_tp1} onChange={(e) => setForm({ ...form, trail_after_tp1: e.target.checked })} />
            <span>{lang === 'fa' ? 'آغاز تریلینگ استاپ پس از تاچ شدن TP1' : 'Activate Trailing SL Only After TP1 Hit'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.auto_breakeven_on_tp1} onChange={(e) => setForm({ ...form, auto_breakeven_on_tp1: e.target.checked })} />
            <span>{lang === 'fa' ? 'انتقال خودکار استاپ به نقطه ورود در TP1 (ریسک‌فری)' : 'Auto Risk-Free (SL → Entry) on TP1'}</span>
          </label>
        </div>

        <div className="card-tt p-5 space-y-3.5">
          <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'حجم، استراتژی و حفاظت ریسک روزانه' : 'Sizing, Strategy & Circuit Breakers'}</h3>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[#6c7689] block mb-1">Margin %</label>
              <input type="number" step="0.5" min={1} max={100} value={form.margin_pct} onChange={(e) => setForm({ ...form, margin_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Max Lev</label>
              <input type="number" min={1} max={100} value={form.max_leverage} onChange={(e) => setForm({ ...form, max_leverage: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Margin Mode</label>
              <select value={form.margin_mode} onChange={(e) => setForm({ ...form, margin_mode: e.target.value })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="ISOLATED">ISOLATED</option>
                <option value="CROSS">CROSS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#6c7689] block mb-1">Execution Mode</label>
              <select value={form.trade_execution_mode} onChange={(e) => setForm({ ...form, trade_execution_mode: e.target.value })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="AUTO">AUTO (اتوترید)</option>
                <option value="MANUAL_CONFIRM">MANUAL_CONFIRM (دستی)</option>
              </select>
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Trading Account</label>
              <select value={form.trading_mode} onChange={(e) => setForm({ ...form, trading_mode: e.target.value })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="PAPER">PAPER (آزمایشی)</option>
                <option value="LIVE">LIVE (صرافی واقعی)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[#6c7689] block mb-1">Bot Default Symbol</label>
              <SymbolPicker lang={lang} value={form.symbol} markets={markets} provider={provider} onChange={(sym) => setForm({ ...form, symbol: sym })} compact />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Primary Strategy</label>
              <select value={form.strategy_key} onChange={(e) => setForm({ ...form, strategy_key: e.target.value })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2">
                <option value="kbos_v11">CodexBot Super v11 (Quant)</option>
                <option value="sp2l">SP2L Liquidity Sweep</option>
                <option value="ema_trend_pullback">EMA 20/50 Trend Pullback</option>
                <option value="grid_strategy">Grid / Mean Reversion</option>
                <option value="signal_mixer">8-Channel Signal Mixer</option>
                <option value="vibe_4h_daily_breakout">4H/Daily Structural Breakout</option>
              </select>
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Daily Max Loss %</label>
              <input type="number" step="0.5" value={form.daily_max_loss_pct} onChange={(e) => setForm({ ...form, daily_max_loss_pct: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-[#6c7689] block mb-1">Max Open Positions</label>
              <input type="number" min={1} max={15} value={form.max_open_positions} onChange={(e) => setForm({ ...form, max_open_positions: Number(e.target.value) })} className="w-full bg-[#080a0e] border border-[#262b36] rounded-lg px-2.5 py-2 font-mono-num" />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.ai_gate_enabled} onChange={(e) => setForm({ ...form, ai_gate_enabled: e.target.checked })} />
              <span>{lang === 'fa' ? 'فعال‌سازی دروازه تایید هوش مصنوعی (BYO AI Gate)' : 'Enable BYO AI Pre-Trade Reasoning Gate'}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.block_weekends} onChange={(e) => setForm({ ...form, block_weekends: e.target.checked })} />
              <span>{lang === 'fa' ? 'توقف ترید در آخر هفته (شنبه/یکشنبه UTC)' : 'Block Weekend Low-Liquidity Trading'}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.macro_blackout} onChange={(e) => setForm({ ...form, macro_blackout: e.target.checked })} />
              <span>{lang === 'fa' ? 'توقف در ساعات اخبار کلان (CPI / FOMC)' : 'Enable Macro News Blackout Window'}</span>
            </label>
          </div>
        </div>
      </div>
    </form>
  );
}
