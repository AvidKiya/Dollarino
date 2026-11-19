import { useEffect, useState } from 'react';
import { BrainCircuit, History, Play, Send, Target } from 'lucide-react';
import type { Candle, Timeframe } from '@dollarino/core';
import { CandlestickChart, type ChartLevels, type KbosChartOverlays } from '../components/CandlestickChart';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface ChartAIResult {
  summary: string;
  bias?: 'LONG' | 'SHORT' | 'NEUTRAL';
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rrRatio?: number;
  supports?: number[];
  resistances?: number[];
}

function fmtPx(v?: number): string {
  if (v === undefined || !Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(4);
  if (Math.abs(v) >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

export function ChartAIPage({
  lang,
  markets,
  provider,
  onExecuted,
}: {
  lang: Lang;
  markets: ExchangeMarket[];
  provider: string;
  onExecuted: () => Promise<void>;
}) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState<Timeframe>('15m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [kbosOverlays, setKbosOverlays] = useState<KbosChartOverlays | undefined>(undefined);
  const [prompt, setPrompt] = useState(
    lang === 'fa'
      ? 'روند، نواحی حمایت/مقاومت، و ستاپ ورود به همراه استاپ و ۳ تارگت را روی چارت رسم کن.'
      : 'Analyze trend, order blocks, S/R levels, and draw Entry / SL / TP1-TP3 on chart.'
  );
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; title: string; symbol: string; timeframe: string }>>([]);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [analysis, setAnalysis] = useState<ChartAIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');

  const actionableDir =
    analysis?.direction ??
    (analysis?.bias === 'LONG' || analysis?.bias === 'SHORT' ? analysis.bias : undefined);

  const loadMarket = async () => {
    const [res, chats] = await Promise.all([
      apiFetch<{ candles: Candle[]; kbosOverlays?: KbosChartOverlays }>(`/api/trading/market/overview?symbol=${symbol}&timeframe=${tf}`),
      apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats').catch(() => ({
        chats: [],
      })),
    ]);
    setCandles(res.candles);
    setKbosOverlays(res.kbosOverlays);
    setChatHistory(chats.chats);
  };

  useEffect(() => {
    void loadMarket();
  }, [symbol, tf]);

  const askAI = async (customPrompt?: string) => {
    const q = customPrompt ?? prompt;
    setLoading(true);
    setDeployMsg('');
    try {
      const res = await apiFetch<{
        chatId: string;
        analysis: ChartAIResult;
        messages: Array<{ role: string; content: string }>;
      }>('/api/chart-ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ chatId, symbol, timeframe: tf, prompt: q }),
      });
      setChatId(res.chatId);
      setAnalysis(res.analysis);
      setMessages(res.messages);
      void loadMarket();
    } finally {
      setLoading(false);
    }
  };

  const deployAiSetup = async () => {
    if (!actionableDir || !analysis?.entry || !analysis.stopLoss || !analysis.tp1) return;
    setDeployMsg('');
    const res = await apiFetch<{ ok: boolean; error?: string; tradeId?: string }>('/api/trading/orders/manual', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        direction: actionableDir,
        orderType: 'MARKET',
        leverage: 5,
        stopLoss: String(analysis.stopLoss),
        tp1: String(analysis.tp1),
        tp2: analysis.tp2 ? String(analysis.tp2) : undefined,
        tp3: analysis.tp3 ? String(analysis.tp3) : undefined,
        timeframe: tf,
      }),
    });
    setDeployMsg(res.ok ? `Executed AI Setup (${res.tradeId})` : res.error || 'Rejected');
    await onExecuted();
  };

  const levels: ChartLevels | undefined = analysis
    ? {
        entry: analysis.entry,
        stopLoss: analysis.stopLoss,
        tp1: analysis.tp1,
        tp2: analysis.tp2,
        tp3: analysis.tp3,
        supports: analysis.supports,
        resistances: analysis.resistances,
      }
    : undefined;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div className="xl:col-span-8 surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SymbolPicker lang={lang} value={symbol} markets={markets} provider={provider} onChange={setSymbol} compact />
            {(['5m', '15m', '30m', '1h', '4h'] as Timeframe[]).map((x) => (
              <button
                key={x}
                onClick={() => setTf(x)}
                className={`px-2.5 py-1.5 rounded-xl font-bold ${tf === x ? 'btn-cobalt' : 'surface-soft text-sub'}`}
              >
                {x}
              </button>
            ))}
          </div>

          {actionableDir && analysis?.entry && analysis?.stopLoss && analysis?.tp1 && (
            <button onClick={deployAiSetup} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl btn-emerald text-xs font-extrabold">
              <Play className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? `اجرای مستقیم ${actionableDir}` : `Execute ${actionableDir}`}</span>
            </button>
          )}
        </div>

        {deployMsg && <div className="text-xs px-3 py-2 rounded-xl badge-signal font-bold">{deployMsg}</div>}

        {analysis && (actionableDir || (analysis.supports?.length ?? 0) > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 surface-soft border rounded-2xl p-3 text-[11px]">
            <div>
              <div className="text-dim flex items-center gap-1"><Target className="w-3 h-3" /> Bias</div>
              <div className={`font-black font-mono-num ${actionableDir === 'LONG' ? 'text-signal' : actionableDir === 'SHORT' ? 'text-loss' : 'text-flame'}`}>
                {actionableDir ?? analysis.bias ?? 'NEUTRAL'} {analysis.rrRatio ? `(1:${analysis.rrRatio})` : ''}
              </div>
            </div>
            <div>
              <div className="text-dim">Entry</div>
              <div className="text-main font-bold font-mono-num">{fmtPx(analysis.entry)}</div>
            </div>
            <div>
              <div className="text-dim">Stop Loss</div>
              <div className="text-loss font-bold font-mono-num">{fmtPx(analysis.stopLoss)}</div>
            </div>
            <div>
              <div className="text-dim">TP1</div>
              <div className="text-signal font-bold font-mono-num">{fmtPx(analysis.tp1)}</div>
            </div>
            <div>
              <div className="text-dim">TP2 / TP3</div>
              <div className="text-signal font-bold font-mono-num">{fmtPx(analysis.tp2)} / {fmtPx(analysis.tp3)}</div>
            </div>
            <div>
              <div className="text-dim">S / R</div>
              <div className="text-sub font-mono-num truncate">
                {fmtPx(analysis.supports?.[0])} / {fmtPx(analysis.resistances?.[0])}
              </div>
            </div>
          </div>
        )}

        <CandlestickChart candles={candles} levels={levels} kbosOverlays={kbosOverlays} height={510} />
      </div>

      <div className="xl:col-span-4 surface-card p-4 flex flex-col justify-between space-y-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-brand" />
              <h3 className="font-black text-sm text-main">{lang === 'fa' ? 'دستیار چارت AI' : 'Chart AI Co-Pilot'}</h3>
            </div>
            {analysis?.confidence !== undefined && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full banner-cobalt-soft text-brand font-mono-num font-bold">
                Conf: {analysis.confidence}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {[
              lang === 'fa' ? 'ستاپ استراتژی منتخب دلارینو و ریبون' : 'Dollarino Select (Dorna V1) + ATR',
              lang === 'fa' ? 'حمایت/مقاومت کلیدی' : 'Key S/R Levels',
              lang === 'fa' ? 'بهترین R:R برای ورود' : '3-TP R:R Setup',
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setPrompt(chip);
                  void askAI(chip);
                }}
                className="px-2.5 py-1 rounded-xl surface-soft border text-main font-semibold"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto text-xs">
            {messages.length === 0 && (
              <p className="text-sub leading-relaxed">
                {lang === 'fa'
                  ? 'تحلیلگر کوانت دلارینو همراه با کلید AI شما سطوح دقیق ورود، استاپ و تارگت‌ها را روی چارت رسم می‌کند.'
                  : 'Quant + AI chart reasoning plots exact Entry, SL, TP1-TP3 and S/R levels directly onto the chart.'}
              </p>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-2xl leading-relaxed whitespace-pre-wrap border ${
                  m.role === 'user' ? 'banner-cobalt-soft text-main font-semibold' : 'surface-soft text-sub'
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>

          {chatHistory.length > 0 && (
            <div className="border-t pt-2">
              <div className="text-[11px] text-dim flex items-center gap-1 mb-1">
                <History className="w-3 h-3" /> Recent Chats
              </div>
              <div className="flex flex-wrap gap-1">
                {chatHistory.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      const d = await apiFetch<{ chat: { id: string; messages_json: string; annotations_json: string } }>(`/api/chart-ai/chats/${c.id}`);
                      setChatId(d.chat.id);
                      setMessages(JSON.parse(d.chat.messages_json));
                      setAnalysis(JSON.parse(d.chat.annotations_json));
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg surface-soft border text-sub hover:text-main"
                  >
                    {c.symbol} {c.timeframe}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2 border-t">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full surface-input rounded-xl p-2.5 text-xs" />
          <button disabled={loading} onClick={() => askAI()} className="w-full py-2.5 rounded-xl btn-cobalt text-xs font-extrabold inline-flex items-center justify-center gap-1.5">
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? '...' : lang === 'fa' ? 'تحلیل هوشمند چارت' : 'Analyze Chart with AI'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
