import {
  atr,
  bollingerBands,
  causalSwingLevels,
  computeKbosV11Detailed,
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  ema,
  evaluateSignalMixerAtBar,
  rsi,
  type AIProviderId,
  type Candle,
  type KbosParams,
  type SignalMixerWeights,
  type Timeframe,
} from '@dollarino/core';
import { decryptVaultJson } from '../crypto.js';
import type { Env } from '../env.js';

export interface ChartAIAnalysisResult {
  summary: string;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  direction?: 'LONG' | 'SHORT';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rrRatio?: number;
  supports: number[];
  resistances: number[];
  telemetry?: {
    htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    ema20: number;
    ema50: number;
    ema200?: number;
    rsi14: number;
    atr14: number;
    kbosSignal: string;
    demaAtrTrend: string;
    mixerScore: number;
    mixerConfidence: number;
  };
}

export interface AITradeDecision {
  ok: boolean;
  provider?: AIProviderId;
  model?: string;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
  confidence: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  leverage: number;
  rrRatio: number;
  thesis: string;
  invalidation: string;
  reasoningTrace?: string;
  error?: string;
}

export interface AIRecord {
  provider: AIProviderId;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

function pricePrecision(ref: number): number {
  const abs = Math.abs(ref);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 5;
  return 8;
}

function roundPx(val: number, ref: number): number {
  if (!Number.isFinite(val)) return 0;
  const dp = pricePrecision(ref || val);
  return Number(val.toFixed(dp));
}

function uniqueSortedLevels(vals: number[], ref: number, asc = true): number[] {
  const out: number[] = [];
  for (const v of vals) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const rounded = roundPx(v, ref);
    if (!out.some((x) => Math.abs(x - rounded) / Math.max(1e-9, rounded) < 0.0025)) {
      out.push(rounded);
    }
  }
  return out.sort((a, b) => (asc ? a - b : b - a)).slice(0, 3);
}

export async function resolveUserActiveAI(env: Env, userId: string): Promise<AIRecord | null> {
  const row = await env.DB.prepare(
    `SELECT provider, model, base_url, encrypted_api_key, temperature, max_tokens, daily_call_cap, calls_today, calls_reset_date
     FROM ai_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
  ).bind(userId).first<{
    provider: AIProviderId;
    model: string;
    base_url: string | null;
    encrypted_api_key: string;
    temperature: number;
    max_tokens: number;
    daily_call_cap: number;
    calls_today: number;
    calls_reset_date: string | null;
  }>();

  if (!row) return null;

  const today = new Date().toISOString().slice(0, 10);
  const callsToday = row.calls_reset_date === today ? row.calls_today : 0;
  if (callsToday >= row.daily_call_cap) {
    throw new Error(`Daily AI call cap (${row.daily_call_cap}) reached`);
  }

  const creds = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY);
  if (!creds.apiKey) return null;

  await env.DB.prepare(
    `UPDATE ai_connections SET calls_today = ?, calls_reset_date = ? WHERE user_id = ? AND is_active = 1`
  ).bind(callsToday + 1, today, userId).run();

  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url,
    apiKey: creds.apiKey,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
  };
}

export async function callBYOAI(
  ai: AIRecord,
  systemPrompt: string,
  userPrompt: string,
  opts?: { fastJson?: boolean }
): Promise<string> {
  if (ai.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ai.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-3-5-sonnet-20241022',
        max_tokens: ai.maxTokens || 1536,
        temperature: ai.temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const json = await res.json() as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `Anthropic HTTP ${res.status}`);
    return json.content?.[0]?.text ?? '';
  }

  if (ai.provider === 'gemini') {
    const model = ai.model || 'gemini-2.0-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: ai.temperature, maxOutputTokens: ai.maxTokens || 1536 },
        }),
        signal: AbortSignal.timeout(25_000),
      }
    );
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // DeepSeek first-class integration (https://api.deepseek.com)
  if (ai.provider === 'deepseek') {
    const baseUrl = (ai.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = ai.model || 'deepseek-flash';
    const isReasoningModel = model.includes('reasoner') || model.includes('v4-pro');
    const bodyPayload: Record<string, unknown> = {
      model,
      max_tokens: isReasoningModel ? Math.max(ai.maxTokens || 2048, 2048) : (ai.maxTokens || 1536),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (!isReasoningModel) {
      bodyPayload.temperature = ai.temperature;
    }
    // DeepSeek V4.1+ enables thinking by default on deepseek-flash; disable only when fast structured JSON is requested
    if (opts?.fastJson && model === 'deepseek-flash') {
      bodyPayload.thinking = { type: 'disabled' };
    }

    const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/chat/completions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `DeepSeek HTTP ${res.status}`);
    const msg = json.choices?.[0]?.message;
    return msg?.content || msg?.reasoning_content || '';
  }

  // OpenAI or OpenAI-compatible (OpenRouter, Groq, Ollama, etc.)
  const baseUrl = (ai.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ai.model || 'gpt-4o-mini',
      temperature: ai.temperature,
      max_tokens: ai.maxTokens || 1536,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenAI HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning_content || '';
}

function buildMarketContext(
  symbol: string,
  timeframe: Timeframe | string,
  candles: Candle[],
  opts?: {
    htfCandles?: Candle[];
    kbosParams?: KbosParams;
    mixerWeights?: SignalMixerWeights;
    mixerThreshold?: number;
  }
) {
  const last = candles[candles.length - 1]!;
  const price = last.close;
  const closes = candles.map((c) => c.close);
  const e20Arr = ema(closes, 20);
  const e50Arr = ema(closes, 50);
  const e200Arr = ema(closes, 200);
  const r14Arr = rsi(closes, 14);
  const a14Arr = atr(candles, 14);
  const bb = bollingerBands(closes, 20, 2);
  const swings = causalSwingLevels(candles, 3, 2);

  const idx = candles.length - 1;
  const e20 = e20Arr[idx] ?? price;
  const e50 = e50Arr[idx] ?? price;
  const e200 = Number.isFinite(e200Arr[idx]) ? e200Arr[idx]! : undefined;
  const r14 = r14Arr[idx] ?? 50;
  const a14 = Number.isFinite(a14Arr[idx]) ? a14Arr[idx]! : price * 0.008;
  const bbUpper = bb.upper[idx];
  const bbLower = bb.lower[idx];

  let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = e20 > e50 ? 'BULLISH' : e20 < e50 ? 'BEARISH' : 'NEUTRAL';
  const htfCandles = opts?.htfCandles ?? [];
  if (htfCandles.length >= 25) {
    const hc = htfCandles.map((c) => c.close);
    const he20 = ema(hc, 20);
    const he50 = ema(hc, 50);
    const f = he20[htfCandles.length - 1];
    const s = he50[htfCandles.length - 1];
    if (Number.isFinite(f) && Number.isFinite(s)) {
      htfTrend = f! > s! ? 'BULLISH' : f! < s! ? 'BEARISH' : 'NEUTRAL';
    }
  }

  const kbos = computeKbosV11Detailed(candles, timeframe as Timeframe, opts?.kbosParams ?? DEFAULT_KBOS_PARAMS);
  const kbosLatest = kbos.outputs[kbos.outputs.length - 1];
  const demaLatest = kbos.demaAtr[kbos.demaAtr.length - 1];
  const mixer = evaluateSignalMixerAtBar(
    candles,
    idx,
    htfTrend,
    opts?.mixerWeights ?? DEFAULT_MIXER_WEIGHTS,
    opts?.mixerThreshold ?? 65
  );

  const rawLowCandidates: number[] = [];
  const rawHighCandidates: number[] = [];
  for (let k = Math.max(0, idx - 120); k <= idx; k++) {
    const sl = swings.confirmedLows[k];
    const sh = swings.confirmedHighs[k];
    if (Number.isFinite(sl) && sl! < price * 0.999) rawLowCandidates.push(sl!);
    if (Number.isFinite(sh) && sh! > price * 1.001) rawHighCandidates.push(sh!);
  }
  const recent80 = candles.slice(-80);
  const low80 = Math.min(...recent80.map((c) => c.low));
  const high80 = Math.max(...recent80.map((c) => c.high));
  if (low80 < price * 0.9995) rawLowCandidates.push(low80);
  if (high80 > price * 1.0005) rawHighCandidates.push(high80);

  const supports = uniqueSortedLevels(rawLowCandidates, price, false);
  const resistances = uniqueSortedLevels(rawHighCandidates, price, true);

  const telemetry = {
    htfTrend,
    ema20: roundPx(e20, price),
    ema50: roundPx(e50, price),
    ema200: e200 !== undefined ? roundPx(e200, price) : undefined,
    rsi14: Number(r14.toFixed(1)),
    atr14: roundPx(a14, price),
    bbUpper: Number.isFinite(bbUpper) ? roundPx(bbUpper!, price) : undefined,
    bbLower: Number.isFinite(bbLower) ? roundPx(bbLower!, price) : undefined,
    kbosSignal: kbosLatest?.signal ?? 'NONE',
    demaAtrTrend: demaLatest?.trend ?? 'NEUTRAL',
    mixerScore: Number(mixer.compositeScore.toFixed(1)),
    mixerConfidence: mixer.confidence,
  };

  const compactCandles = candles.slice(-32).map((c) => ({
    t: new Date(c.timestamp).toISOString().slice(0, 16),
    o: roundPx(c.open, price),
    h: roundPx(c.high, price),
    l: roundPx(c.low, price),
    c: roundPx(c.close, price),
    v: Math.round(c.volume),
  }));

  const compactHtf = htfCandles.slice(-16).map((c) => ({
    t: new Date(c.timestamp).toISOString().slice(0, 16),
    o: roundPx(c.open, price),
    h: roundPx(c.high, price),
    l: roundPx(c.low, price),
    c: roundPx(c.close, price),
  }));

  return {
    symbol,
    price,
    e20,
    e50,
    e200,
    r14,
    a14,
    htfTrend,
    mixer,
    kbosLatest,
    supports,
    resistances,
    telemetry,
    compactCandles,
    compactHtf,
  };
}

/**
 * Autonomous LLM Portfolio Trader (DeepSeek / Claude / GPT / Gemini).
 * Gives the AI model full live market telemetry, multi-timeframe candles, order book depth,
 * and open position context so the AI itself decides LONG / SHORT / HOLD / CLOSE.
 */
export async function runAutonomousAITrader(
  env: Env,
  userId: string,
  params: {
    symbol: string;
    timeframe: Timeframe;
    higherTimeframe: Timeframe;
    candles: Candle[];
    htfCandles?: Candle[];
    maxLeverage: number;
    minConfidence: number;
    orderBookImbalancePct?: string;
    spreadPct?: string;
    fundingRate?: string;
    openPosition?: {
      direction: 'LONG' | 'SHORT';
      entryPrice: string;
      currentStopLoss: string;
      tp1: string;
      unrealizedPct?: number;
    } | null;
    riskPreset?: string;
    kbosParams?: KbosParams;
    mixerWeights?: SignalMixerWeights;
    mixerThreshold?: number;
  }
): Promise<AITradeDecision> {
  if (params.candles.length < 35) {
    return {
      ok: false,
      action: 'HOLD',
      confidence: 0,
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      leverage: 1,
      rrRatio: 0,
      thesis: 'Insufficient candle history for AI analysis',
      invalidation: 'Wait for 35+ candles',
      error: 'Insufficient candle data',
    };
  }

  const ai = await resolveUserActiveAI(env, userId);
  if (!ai) {
    return {
      ok: false,
      action: 'HOLD',
      confidence: 0,
      entry: params.candles[params.candles.length - 1]!.close,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      leverage: 1,
      rrRatio: 0,
      thesis: 'No active AI API key connected (DeepSeek, Claude, OpenAI, or Gemini).',
      invalidation: 'Connect an AI API key in Connections -> AI Engine',
      error: 'NO_ACTIVE_AI_KEY',
    };
  }

  const ctx = buildMarketContext(params.symbol, params.timeframe, params.candles, {
    htfCandles: params.htfCandles,
    kbosParams: params.kbosParams,
    mixerWeights: params.mixerWeights,
    mixerThreshold: params.mixerThreshold,
  });

  const sysPrompt = `You are Dollarino Autonomous AI Trader, an elite institutional perpetual futures portfolio manager.
You analyze raw multi-timeframe price action, market microstructure, momentum, volatility (ATR), orderbook imbalance, and structural S/R to decide whether to open LONG, open SHORT, HOLD (no high-conviction edge), or CLOSE an existing open position.
Respond ONLY with strict valid JSON matching:
{
  "action": "LONG" | "SHORT" | "HOLD" | "CLOSE",
  "confidence": 0-100,
  "entry": number,
  "stopLoss": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "leverage": number,
  "thesis": "clear, concise institutional reasoning citing structure, HTF alignment, and momentum",
  "invalidation": "exact price/condition that invalidates thesis"
}
Hard Rules:
1. If there is no clear edge or setup is noisy/choppy, return "action": "HOLD" (never force weak trades).
2. Stop Loss MUST be placed outside normal 1-bar ATR noise (>= 1.5 * ATR14 away from entry) and anchored behind swing structure.
3. Minimum Risk:Reward must be >= 1.2x on TP1, >= 2.2x on TP2, >= 3.2x on TP3.
4. For LONG: stopLoss < entry < tp1 < tp2 < tp3. For SHORT: stopLoss > entry > tp1 > tp2 > tp3.
5. Leverage MUST be between 1 and ${Math.max(1, params.maxLeverage)}.
6. Preserve ${pricePrecision(ctx.price)} decimal places for ${params.symbol}.`;

  const userPrompt = [
    `Market: ${params.symbol} | LTF: ${params.timeframe} | HTF: ${params.higherTimeframe} | Last Price: ${roundPx(ctx.price, ctx.price)}`,
    `Risk Preset: ${params.riskPreset || 'balanced'} | Max Leverage: ${params.maxLeverage}x | Min Confidence Gate: ${params.minConfidence}%`,
    `Orderbook Imbalance: ${params.orderBookImbalancePct ?? '0.0'}% | Spread: ${params.spreadPct ?? '0.01'}% | Funding: ${params.fundingRate ?? '0.0001'}`,
    `Open Position on ${params.symbol}: ${params.openPosition ? JSON.stringify(params.openPosition) : 'NONE'}`,
    `Quant Telemetry: ${JSON.stringify(ctx.telemetry)}`,
    `Swing Supports: ${JSON.stringify(ctx.supports)} | Swing Resistances: ${JSON.stringify(ctx.resistances)}`,
    `HTF Candles (${params.higherTimeframe}, last 16): ${JSON.stringify(ctx.compactHtf)}`,
    `LTF Candles (${params.timeframe}, last 32): ${JSON.stringify(ctx.compactCandles)}`,
  ].join('\n');

  const rawText = await callBYOAI(ai, sysPrompt, userPrompt, { fastJson: false });
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      ok: true,
      provider: ai.provider,
      model: ai.model,
      action: 'HOLD',
      confidence: 0,
      entry: roundPx(ctx.price, ctx.price),
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      leverage: 1,
      rrRatio: 0,
      thesis: rawText.slice(0, 600) || 'AI returned non-JSON response; defaulting safely to HOLD.',
      invalidation: 'Wait for next closed candle',
    };
  }

  let parsed: Partial<AITradeDecision>;
  try {
    parsed = JSON.parse(match[0]) as Partial<AITradeDecision>;
  } catch {
    return {
      ok: true,
      provider: ai.provider,
      model: ai.model,
      action: 'HOLD',
      confidence: 0,
      entry: roundPx(ctx.price, ctx.price),
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      leverage: 1,
      rrRatio: 0,
      thesis: rawText.slice(0, 600),
      invalidation: 'JSON parse fallback HOLD',
    };
  }

  const rawAction = String(parsed.action || 'HOLD').toUpperCase();
  const action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE' =
    rawAction === 'LONG' || rawAction === 'SHORT' || rawAction === 'CLOSE' ? rawAction : 'HOLD';
  const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 0))));
  const leverage = Math.min(Math.max(1, params.maxLeverage), Math.max(1, Math.round(Number(parsed.leverage ?? Math.min(5, params.maxLeverage)))));

  const entry = roundPx(Number(parsed.entry) > 0 ? Number(parsed.entry) : ctx.price, ctx.price);
  const safeRisk = Math.max(ctx.a14 * 1.8, ctx.price * 0.005);
  let stopLoss = Number(parsed.stopLoss) > 0 ? roundPx(Number(parsed.stopLoss), ctx.price) : 0;
  let tp1 = Number(parsed.tp1) > 0 ? roundPx(Number(parsed.tp1), ctx.price) : 0;
  let tp2 = Number(parsed.tp2) > 0 ? roundPx(Number(parsed.tp2), ctx.price) : 0;
  let tp3 = Number(parsed.tp3) > 0 ? roundPx(Number(parsed.tp3), ctx.price) : 0;

  if (action === 'LONG') {
    if (stopLoss <= 0 || stopLoss >= entry || entry - stopLoss < ctx.a14 * 0.8) {
      stopLoss = roundPx(entry - safeRisk, ctx.price);
    }
    const risk = entry - stopLoss;
    if (tp1 <= entry) tp1 = roundPx(entry + risk * 1.3, ctx.price);
    if (tp2 <= tp1) tp2 = roundPx(entry + risk * 2.3, ctx.price);
    if (tp3 <= tp2) tp3 = roundPx(entry + risk * 3.5, ctx.price);
  } else if (action === 'SHORT') {
    if (stopLoss <= 0 || stopLoss <= entry || stopLoss - entry < ctx.a14 * 0.8) {
      stopLoss = roundPx(entry + safeRisk, ctx.price);
    }
    const risk = stopLoss - entry;
    if (tp1 <= 0 || tp1 >= entry) tp1 = roundPx(entry - risk * 1.3, ctx.price);
    if (tp2 <= 0 || tp2 >= tp1) tp2 = roundPx(entry - risk * 2.3, ctx.price);
    if (tp3 <= 0 || tp3 >= tp2) tp3 = roundPx(entry - risk * 3.5, ctx.price);
  }

  const riskDist = Math.abs(entry - stopLoss);
  const rrRatio =
    (action === 'LONG' || action === 'SHORT') && riskDist > 0 && tp2 > 0
      ? Number((Math.abs(tp2 - entry) / riskDist).toFixed(2))
      : 0;

  return {
    ok: true,
    provider: ai.provider,
    model: ai.model,
    action,
    confidence,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    leverage,
    rrRatio,
    thesis: String(parsed.thesis || 'AI thesis generated.').slice(0, 900),
    invalidation: String(parsed.invalidation || 'Structure break beyond Stop Loss').slice(0, 300),
  };
}

export async function runChartAIAnalysis(
  env: Env,
  userId: string,
  symbol: string,
  timeframe: Timeframe | string,
  candles: Candle[],
  userQuestion: string,
  opts?: {
    htfCandles?: Candle[];
    kbosParams?: KbosParams;
    mixerWeights?: SignalMixerWeights;
    mixerThreshold?: number;
  }
): Promise<ChartAIAnalysisResult> {
  if (candles.length < 30) {
    return {
      summary: `داده کندل برای ${symbol} کافی نیست (${candles.length} کندل).`,
      bias: 'NEUTRAL',
      confidence: 0,
      supports: [],
      resistances: [],
    };
  }

  const ctx = buildMarketContext(symbol, timeframe, candles, opts);
  const { price, e20, e50, r14, a14, htfTrend, mixer, kbosLatest, supports, resistances, telemetry, compactCandles } = ctx;

  const quantBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    kbosLatest?.signal === 'LONG' || kbosLatest?.signal === 'SHORT'
      ? kbosLatest.signal
      : mixer.direction !== 'NONE'
        ? mixer.direction
        : htfTrend === 'BULLISH' && e20 > e50 && r14 >= 45 && r14 <= 68
          ? 'LONG'
          : htfTrend === 'BEARISH' && e20 < e50 && r14 >= 32 && r14 <= 55
            ? 'SHORT'
            : Math.abs(mixer.compositeScore) >= 35
              ? mixer.compositeScore > 0
                ? 'LONG'
                : 'SHORT'
              : 'NEUTRAL';

  const riskDist = Math.max(a14 * 1.85, price * 0.005);
  const nearestSup = supports.find((s) => s < price && price - s <= riskDist * 1.4);
  const nearestRes = resistances.find((r) => r > price && r - price <= riskDist * 1.4);
  const effRisk =
    quantBias === 'LONG' && nearestSup
      ? Math.max(a14 * 1.4, price - nearestSup + a14 * 0.35)
      : quantBias === 'SHORT' && nearestRes
        ? Math.max(a14 * 1.4, nearestRes - price + a14 * 0.35)
        : riskDist;

  const fallbackEntry = roundPx(price, price);
  const fallbackSl =
    quantBias === 'LONG'
      ? roundPx(price - effRisk, price)
      : quantBias === 'SHORT'
        ? roundPx(price + effRisk, price)
        : undefined;
  const fallbackTp1 =
    quantBias === 'LONG'
      ? roundPx(price + effRisk * 1.2, price)
      : quantBias === 'SHORT'
        ? roundPx(price - effRisk * 1.2, price)
        : undefined;
  const fallbackTp2 =
    quantBias === 'LONG'
      ? roundPx(price + effRisk * 2.2, price)
      : quantBias === 'SHORT'
        ? roundPx(price - effRisk * 2.2, price)
        : undefined;
  const fallbackTp3 =
    quantBias === 'LONG'
      ? roundPx(price + effRisk * 3.5, price)
      : quantBias === 'SHORT'
        ? roundPx(price - effRisk * 3.5, price)
        : undefined;

  const ai = await resolveUserActiveAI(env, userId).catch(() => null);
  if (!ai) {
    const isFa = /[\u0600-\u06FF]/.test(userQuestion);
    const actionableDir = quantBias === 'NEUTRAL' ? undefined : quantBias;
    const conf = Math.max(45, Math.min(92, mixer.confidence || (quantBias === 'NEUTRAL' ? 48 : 66)));
    const supStr = supports.join(' / ') || '-';
    const resStr = resistances.join(' / ') || '-';
    const summary = isFa
      ? [
          `تحلیل کمی دلارینو برای ${symbol} (${timeframe}):`,
          `• روند تایم‌فریم بالاتر: ${htfTrend} | EMA20=${telemetry.ema20} vs EMA50=${telemetry.ema50}${telemetry.ema200 ? ` | EMA200=${telemetry.ema200}` : ''}`,
          `• اندیکاتورها: RSI(14)=${telemetry.rsi14} | ATR(14)=${telemetry.atr14} | DEMA-ATR=${telemetry.demaAtrTrend} | KBOs=${telemetry.kbosSignal}`,
          `• میکس سیگنال ۸ کاناله: امتیاز ${telemetry.mixerScore} (اطمینان ${mixer.confidence}%)`,
          `• سطوح حمایت: ${supStr} | سطوح مقاومت: ${resStr}`,
          actionableDir
            ? `• ستاپ پیشنهادی ${actionableDir}: ورود=${fallbackEntry} | استاپ=${fallbackSl} | تارگت‌ها: ${fallbackTp1} / ${fallbackTp2} / ${fallbackTp3} (R:R تا 1:3.5)`
            : '• در حال حاضر بازار در محدوده خنثی است؛ بهتر است منتظر تایید شکست یا پولبک بمانید.',
          `💡 برای تحلیل و ترید تماماً هوشمند با DeepSeek / Claude / GPT / Gemini، کلید API خود را در Connections ثبت کنید.`,
        ].join('\n')
      : [
          `Dollarino Quant Analysis for ${symbol} (${timeframe}):`,
          `• HTF Trend: ${htfTrend} | EMA20=${telemetry.ema20} vs EMA50=${telemetry.ema50}${telemetry.ema200 ? ` | EMA200=${telemetry.ema200}` : ''}`,
          `• Momentum & Regime: RSI(14)=${telemetry.rsi14} | ATR(14)=${telemetry.atr14} | DEMA-ATR=${telemetry.demaAtrTrend} | KBOs=${telemetry.kbosSignal}`,
          `• 8-Channel Signal Mixer: Score ${telemetry.mixerScore} (${mixer.confidence}% confidence)`,
          `• Supports: ${supStr} | Resistances: ${resStr}`,
          actionableDir
            ? `• ${actionableDir} Setup: Entry=${fallbackEntry} | SL=${fallbackSl} | TP1=${fallbackTp1} / TP2=${fallbackTp2} / TP3=${fallbackTp3} (up to 1:3.5 R:R)`
            : '• Neutral regime — wait for directional confirmation.',
          `💡 Connect DeepSeek, Claude, OpenAI, or Gemini in Connections to unlock full LLM autonomous reasoning & trading.`,
        ].join('\n');

    return {
      summary,
      bias: quantBias,
      direction: actionableDir,
      confidence: conf,
      entry: actionableDir ? fallbackEntry : undefined,
      stopLoss: fallbackSl,
      tp1: fallbackTp1,
      tp2: fallbackTp2,
      tp3: fallbackTp3,
      rrRatio: actionableDir ? 2.2 : undefined,
      supports,
      resistances,
      telemetry,
    };
  }

  const systemPrompt = `You are Dollarino Chart AI (${ai.provider.toUpperCase()} / ${ai.model}), an institutional quantitative crypto futures analyst.
Respond ONLY with valid JSON matching this schema:
{
  "summary": "concise technical analysis in the user's language (Persian if user asks in Persian) referencing the exact indicators, S/R levels, and R:R",
  "bias": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": 0-100,
  "entry": number,
  "stopLoss": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "supports": [number],
  "resistances": [number]
}
Rules:
- Preserve exact price precision (${pricePrecision(price)} decimals for ${symbol}).
- If bias is LONG: stopLoss < entry < tp1 < tp2 < tp3.
- If bias is SHORT: stopLoss > entry > tp1 > tp2 > tp3.
- Never invent wildly distant S/R levels; anchor to the provided swing levels and ATR.`;

  const rawText = await callBYOAI(
    ai,
    systemPrompt,
    [
      `Symbol: ${symbol} | Timeframe: ${timeframe} | Last Price: ${roundPx(price, price)}`,
      `Computed Telemetry: ${JSON.stringify(telemetry)}`,
      `Signal Mixer Channels: ${JSON.stringify(mixer.channels)}`,
      `Swing Supports: ${JSON.stringify(supports)} | Swing Resistances: ${JSON.stringify(resistances)}`,
      `Recent 32 Candles: ${JSON.stringify(compactCandles)}`,
      `User Question: ${userQuestion}`,
    ].join('\n'),
    { fastJson: true }
  );

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      summary: rawText.slice(0, 1000),
      bias: quantBias,
      direction: quantBias === 'NEUTRAL' ? undefined : quantBias,
      confidence: mixer.confidence || 55,
      entry: quantBias !== 'NEUTRAL' ? fallbackEntry : undefined,
      stopLoss: fallbackSl,
      tp1: fallbackTp1,
      tp2: fallbackTp2,
      tp3: fallbackTp3,
      supports,
      resistances,
      telemetry,
    };
  }

  let parsed: ChartAIAnalysisResult;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ChartAIAnalysisResult;
  } catch {
    return {
      summary: rawText.slice(0, 1000),
      bias: quantBias,
      direction: quantBias === 'NEUTRAL' ? undefined : quantBias,
      confidence: mixer.confidence || 55,
      supports,
      resistances,
      telemetry,
    };
  }

  const finalBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    parsed.bias === 'LONG' || parsed.bias === 'SHORT' || parsed.bias === 'NEUTRAL' ? parsed.bias : quantBias;
  const dir = finalBias === 'LONG' || finalBias === 'SHORT' ? finalBias : undefined;

  let entry = Number(parsed.entry) > 0 ? roundPx(Number(parsed.entry), price) : fallbackEntry;
  let stopLoss = Number(parsed.stopLoss) > 0 ? roundPx(Number(parsed.stopLoss), price) : fallbackSl;
  let tp1 = Number(parsed.tp1) > 0 ? roundPx(Number(parsed.tp1), price) : fallbackTp1;
  let tp2 = Number(parsed.tp2) > 0 ? roundPx(Number(parsed.tp2), price) : fallbackTp2;
  let tp3 = Number(parsed.tp3) > 0 ? roundPx(Number(parsed.tp3), price) : fallbackTp3;

  if (dir === 'LONG' && (!stopLoss || !tp1 || stopLoss >= entry || tp1 <= entry)) {
    entry = fallbackEntry;
    stopLoss = roundPx(entry - effRisk, price);
    tp1 = roundPx(entry + effRisk * 1.2, price);
    tp2 = roundPx(entry + effRisk * 2.2, price);
    tp3 = roundPx(entry + effRisk * 3.5, price);
  } else if (dir === 'SHORT' && (!stopLoss || !tp1 || stopLoss <= entry || tp1 >= entry)) {
    entry = fallbackEntry;
    stopLoss = roundPx(entry + effRisk, price);
    tp1 = roundPx(entry - effRisk * 1.2, price);
    tp2 = roundPx(entry - effRisk * 2.2, price);
    tp3 = roundPx(entry - effRisk * 3.5, price);
  }

  const rrRatio =
    dir && stopLoss && tp2 && Math.abs(entry - stopLoss) > 0
      ? Number((Math.abs(tp2 - entry) / Math.abs(entry - stopLoss)).toFixed(2))
      : undefined;

  return {
    summary: parsed.summary || 'Analysis completed.',
    bias: finalBias,
    direction: dir,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence ?? 65))),
    entry: dir ? entry : undefined,
    stopLoss: dir ? stopLoss : undefined,
    tp1: dir ? tp1 : undefined,
    tp2: dir ? tp2 : undefined,
    tp3: dir ? tp3 : undefined,
    rrRatio,
    supports: Array.isArray(parsed.supports) && parsed.supports.length ? parsed.supports.map((s) => roundPx(Number(s), price)) : supports,
    resistances:
      Array.isArray(parsed.resistances) && parsed.resistances.length
        ? parsed.resistances.map((r) => roundPx(Number(r), price))
        : resistances,
    telemetry,
  };
}
