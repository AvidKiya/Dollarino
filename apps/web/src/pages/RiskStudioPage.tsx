import { useState } from 'react';
import { Calculator, Save, ShieldCheck } from 'lucide-react';
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
  const [form, setForm] = useState({
    trading_mode: String(config.trading_mode ?? 'PAPER'),
    trade_execution_mode: String(config.trade_execution_mode ?? 'AUTO'),
    margin_mode: String(config.margin_mode ?? 'ISOLATED'),
    symbol: String(config.symbol ?? 'BTCUSDT'),
    strategy_key: String(config.strategy_key ?? 'sp2l'),
    entry_timeframe: String(config.entry_timeframe ?? '15m'),
    higher_timeframe: String(config.higher_timeframe ?? '1h'),
    margin_pct: Number(config.margin_pct ?? 10),
    max_leverage: Number(config.max_leverage ?? 20),
    use_signal_leverage: Boolean(config.use_signal_leverage ?? 1),
    tp1_close_pct: Number(config.tp1_close_pct ?? 50),
    tp2_close_pct: Number(config.tp2_close_pct ?? 25),
    tp3_close_pct: Number(config.tp3_close_pct ?? 25),
    auto_breakeven_on_tp1: Boolean(config.auto_breakeven_on_tp1 ?? 1),
    move_sl_to_tp1_on_tp2: Boolean(config.move_sl_to_tp1_on_tp2 ?? 1),
    daily_max_loss_pct: Number(config.daily_max_loss_pct ?? 5),
    max_open_positions: Number(config.max_open_positions ?? 3),
    block_weekends: Boolean(config.block_weekends ?? 0),
    macro_blackout: Boolean(config.macro_blackout ?? 0),
    ai_gate_enabled: Boolean(config.ai_gate_enabled ?? 0),
    ai_min_confidence: Number(config.ai_min_confidence ?? 65),
    signal_channel_handle: String(config.signal_channel_handle ?? '@Dollarinoofficial'),
  });

  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [simEntry, setSimEntry] = useState(63000);
  const [simSlPct, setSimSlPct] = useState(1.2);

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
        block_weekends: form.block_weekends ? 1 : 0,
        macro_blackout: form.macro_blackout ? 1 : 0,
        ai_gate_enabled: form.ai_gate_enabled ? 1 : 0,
      }),
    });
    await refresh();
    setSavedMsg(lang === 'fa' ? 'تنظیمات ریسک و ۳ تارگت ذخیره شد!' : 'Risk & 3-TP settings saved!');
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>{lang === 'fa' ? 'استودیو مدیریت ریسک CodexBot و موتور ۳ تارگت' : 'CodexBot Risk Studio & 3-TP Risk-Free Engine'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {lang === 'fa'
              ? 'کنترل دقیق مارجین، لوریج ایزوله/کراس، تقسیم خروج TP1/TP2/TP3 و شبیه‌ساز لیکوییدیشن'
              : 'Margin allocation, Isolated/Cross leverage, staged TP1/TP2/TP3 exits, daily drawdown circuit breaker, and What-If calculator'}
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950"
        >
          <Save className="w-4 h-4" />
          <span>{lang === 'fa' ? 'ذخیره تنظیمات' : 'Save Risk Rules'}</span>
        </button>
      </div>

      {savedMsg && <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">{savedMsg}</div>}

      {/* What-If Portfolio Heat & Liquidation Calculator */}
      <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div>
          <div className="text-slate-400 flex items-center gap-1"><Calculator className="w-3.5 h-3.5 text-cyan-400" /> Margin / Trade</div>
          <div className="text-base font-bold font-mono-num text-white mt-1">${marginPerTrade.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-400">Max Position Notional</div>
          <div className="text-base font-bold font-mono-num text-cyan-300 mt-1">${notionalSize.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-slate-400">Portfolio Max Heat</div>
          <div className={`text-base font-bold font-mono-num mt-1 ${maxHeatPct > 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {maxHeatPct.toFixed(0)}% ({form.max_open_positions} slots)
          </div>
        </div>
        <div>
          <div className="text-slate-400">Est. SL Loss @ {simSlPct}%</div>
          <div className="text-base font-bold font-mono-num text-amber-300 mt-1">-${maxSlLossUsd.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-400">Est. Liq Distance</div>
          <div className="text-base font-bold font-mono-num text-rose-400 mt-1">±{estLiqMovePct}% (@{form.max_leverage}x)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'تقسیم مارجین و ۳ تارگت (TP1/TP2/TP3)' : 'Sizing, Margin Mode & 3-TP Split'}</h3>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Margin %</label>
              <input
                type="number"
                step="0.5"
                min={1}
                max={100}
                value={form.margin_pct}
                onChange={(e) => setForm({ ...form, margin_pct: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Max Lev</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.max_leverage}
                onChange={(e) => setForm({ ...form, max_leverage: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Margin Mode</label>
              <select
                value={form.margin_mode}
                onChange={(e) => setForm({ ...form, margin_mode: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
              >
                <option value="ISOLATED">ISOLATED</option>
                <option value="CROSS">CROSS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-emerald-400 block mb-1">TP1 Close %</label>
              <input type="number" value={form.tp1_close_pct} onChange={(e) => setForm({ ...form, tp1_close_pct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-amber-400 block mb-1">TP2 Close %</label>
              <input type="number" value={form.tp2_close_pct} onChange={(e) => setForm({ ...form, tp2_close_pct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-orange-400 block mb-1">TP3 Close %</label>
              <input type="number" value={form.tp3_close_pct} onChange={(e) => setForm({ ...form, tp3_close_pct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-slate-400 block mb-1">Simulator Entry ($)</label>
              <input type="number" value={simEntry} onChange={(e) => setSimEntry(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 font-mono-num" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Simulator SL Dist (%)</label>
              <input type="number" step="0.1" value={simSlPct} onChange={(e) => setSimSlPct(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 font-mono-num" />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={form.auto_breakeven_on_tp1} onChange={(e) => setForm({ ...form, auto_breakeven_on_tp1: e.target.checked })} />
            <span>{lang === 'fa' ? 'انتقال خودکار استاپ به نقطه ورود در TP1 (ریسک‌فری)' : 'Auto Risk-Free (SL → Entry) on TP1'}</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.move_sl_to_tp1_on_tp2} onChange={(e) => setForm({ ...form, move_sl_to_tp1_on_tp2: e.target.checked })} />
            <span>{lang === 'fa' ? 'انتقال خودکار استاپ به TP1 در TP2' : 'Trail SL → TP1 on TP2'}</span>
          </label>
        </div>

        <div className="bg-[#0e131d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-white">{lang === 'fa' ? 'استراتژی و حفاظت ریسک روزانه' : 'Strategy & Circuit Breakers'}</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Execution Mode</label>
              <select value={form.trade_execution_mode} onChange={(e) => setForm({ ...form, trade_execution_mode: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <option value="AUTO">AUTO (اتوترید)</option>
                <option value="MANUAL_CONFIRM">MANUAL_CONFIRM (دستی)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Trading Account</label>
              <select value={form.trading_mode} onChange={(e) => setForm({ ...form, trading_mode: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <option value="PAPER">PAPER (آزمایشی)</option>
                <option value="LIVE">LIVE (صرافی واقعی)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Bot Default Symbol</label>
              <SymbolPicker
                lang={lang}
                value={form.symbol}
                markets={markets}
                provider={provider}
                onChange={(sym) => setForm({ ...form, symbol: sym })}
                compact
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Primary Strategy</label>
              <select value={form.strategy_key} onChange={(e) => setForm({ ...form, strategy_key: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <option value="sp2l">SP2L Liquidity Sweep (CodexBot)</option>
                <option value="ema_trend_pullback">EMA 20/50 Trend Pullback</option>
                <option value="grid_strategy">Grid / Mean Reversion</option>
                <option value="vibe_4h_daily_breakout">4H/Daily Structural Breakout</option>
                <option value="vibe_4h_candle_confirmation">4H Candle Confirmation</option>
                <option value="dollarino_tv_hybrid">Dollarino TV Hybrid</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Daily Max Loss %</label>
              <input type="number" step="0.5" value={form.daily_max_loss_pct} onChange={(e) => setForm({ ...form, daily_max_loss_pct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Max Concurrent Positions</label>
              <input type="number" min={1} max={15} value={form.max_open_positions} onChange={(e) => setForm({ ...form, max_open_positions: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">AI Min Confidence %</label>
              <input type="number" min={30} max={99} value={form.ai_min_confidence} onChange={(e) => setForm({ ...form, ai_min_confidence: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono-num" />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input type="checkbox" checked={form.ai_gate_enabled} onChange={(e) => setForm({ ...form, ai_gate_enabled: e.target.checked })} />
            <span>{lang === 'fa' ? 'فعال‌سازی دروازه تایید هوش مصنوعی (BYO AI Gate)' : 'Enable BYO AI Pre-Trade Reasoning Gate'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.block_weekends} onChange={(e) => setForm({ ...form, block_weekends: e.target.checked })} />
            <span>{lang === 'fa' ? 'توقف ترید در آخر هفته (شنبه/یکشنبه UTC)' : 'Block Weekend Low-Liquidity Trading'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.macro_blackout} onChange={(e) => setForm({ ...form, macro_blackout: e.target.checked })} />
            <span>{lang === 'fa' ? 'توقف در ساعات اخبار کلان (CPI / FOMC Blackout)' : 'Enable Macro News Blackout Window'}</span>
          </label>
        </div>
      </div>
    </form>
  );
}
