import { useEffect, useState } from 'react';
import { BrainCircuit, History, Play, Send } from 'lucide-react';
import type { Candle, Timeframe } from '@dollarino/core';
import { CandlestickChart, type ChartLevels } from '../components/CandlestickChart';
import { SymbolPicker, type ExchangeMarket } from '../components/SymbolPickerModal';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface ChartAIResult {
  summary: string;
  direction?: 'LONG' | 'SHORT';
  confidence?: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  supports?: number[];
  resistances?: number[];
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

  const loadMarket = async () => {
    const [res, chats] = await Promise.all([
      apiFetch<{ candles: Candle[] }>(`/api/trading/market/klines?symbol=${symbol}&timeframe=${tf}&limit=160`),
      apiFetch<{ chats: Array<{ id: string; title: string; symbol: string; timeframe: string }> }>('/api/chart-ai/chats').catch(() => ({ chats: [] })),
    ]);
    setCandles(res.candles);
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
    if (!analysis?.direction || !analysis.entry || !analysis.stopLoss || !analysis.tp1) return;
    setDeployMsg('');
    const res = await apiFetch<{ ok: boolean; error?: string; tradeId?: string }>('/api/trading/orders/manual', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        direction: analysis.direction,
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
      <div className="xl:col-span-8 bg-[#0e131d] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SymbolPicker
              lang={lang}
              value={symbol}
              markets={markets}
              provider={provider}
              onChange={setSymbol}
              compact
            />
            {(['5m', '15m', '1h', '4h'] as Timeframe[]).map((x) => (
              <button
                key={x}
                onClick={() => setTf(x)}
                className={`px-2.5 py-1.5 rounded-lg font-medium ${tf === x ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'}`}
              >
                {x}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {analysis?.direction && analysis.entry && analysis.stopLoss && analysis.tp1 && (
              <button
                onClick={deployAiSetup}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'اجرای مستقیم ستاپ AI' : 'Execute AI Setup'}</span>
              </button>
            )}
          </div>
        </div>

        {deployMsg && <div className="text-xs px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">{deployMsg}</div>}

        <CandlestickChart candles={candles} levels={levels} height={510} />
      </div>

      <div className="xl:col-span-4 bg-[#0e131d] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-sm">{lang === 'fa' ? 'دستیار چارت AI (BYO Key)' : 'Chart AI Co-Pilot'}</h3>
            </div>
            {analysis?.confidence && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono-num">
                Conf: {analysis.confidence}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {[
              lang === 'fa' ? 'ستاپ ورود SP2L' : 'Evaluate SP2L Sweep',
              lang === 'fa' ? 'حمایت/مقاومت کلیدی' : 'Key S/R & Order Blocks',
              lang === 'fa' ? 'بهترین R:R برای لانگ/شورت' : '3-TP R:R Setup',
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setPrompt(chip);
                  void askAI(chip);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto text-xs">
            {messages.length === 0 && (
              <p className="text-slate-400 leading-relaxed">
                {lang === 'fa'
                  ? 'کلید OpenAI، Claude یا Gemini خود را در تب اتصالات متصل کنید و سطوح هوشمند چارت را دریافت کنید.'
                  : 'Connect your OpenAI, Claude, or Gemini API key in Connections to draw AI levels directly onto the chart.'}
              </p>
            )}
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100' : 'bg-slate-900/90 border border-slate-800 text-slate-200'
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>

          {chatHistory.length > 0 && (
            <div className="border-t border-slate-800 pt-2">
              <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
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
                    className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                  >
                    {c.symbol} {c.timeframe}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs"
          />
          <button
            disabled={loading}
            onClick={() => askAI()}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? '...' : lang === 'fa' ? 'تحلیل هوشمند چارت' : 'Analyze Chart with AI'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
