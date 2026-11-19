import {
  atr,
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

export async function callBYOAI(ai: AIRecord, systemPrompt: string, userPrompt: string): Promise<string> {
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
        max_tokens: ai.maxTokens || 1024,
        temperature: ai.temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20_000),
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
          generationConfig: { temperature: ai.temperature, maxOutputTokens: ai.maxTokens || 1024 },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

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
      max_tokens: ai.maxTokens || 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenAI HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content ?? '';
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

  const last = candles[candles.length - 1]!;
  const price = last.close;
  const closes = candles.map((c) => c.close);
  const e20Arr = ema(closes, 20);
  const e50Arr = ema(closes, 50);
  const e200Arr = ema(closes, 200);
  const r14Arr = rsi(closes, 14);
  const a14Arr = atr(candles, 14);
  const swings = causalSwingLevels(candles, 3, 2);

  const idx = candles.length - 1;
  const e20 = e20Arr[idx] ?? price;
  const e50 = e50Arr[idx] ?? price;
  const e200 = Number.isFinite(e200Arr[idx]) ? e200Arr[idx]! : undefined;
  const r14 = r14Arr[idx] ?? 50;
  const a14 = Number.isFinite(a14Arr[idx]) ? a14Arr[idx]! : price * 0.008;

  // HTF trend from real higher-timeframe bars
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

  // Structural support & resistance levels from causal pivot swings + recent range
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
    kbosSignal: kbosLatest?.signal ?? 'NONE',
    demaAtrTrend: demaLatest?.trend ?? 'NEUTRAL',
    mixerScore: Number(mixer.compositeScore.toFixed(1)),
    mixerConfidence: mixer.confidence,
  };

  // Quant setup builder (used both as deterministic fallback and structural guard for BYO AI)
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

  const systemPrompt = `You are Dollarino Chart AI, an institutional quantitative crypto futures analyst.
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

  const compactCandles = candles.slice(-30).map((c) => ({
    t: new Date(c.timestamp).toISOString().slice(0, 16),
    o: roundPx(c.open, price),
    h: roundPx(c.high, price),
    l: roundPx(c.low, price),
    c: roundPx(c.close, price),
    v: Math.round(c.volume),
  }));

  const rawText = await callBYOAI(
    ai,
    systemPrompt,
    [
      `Symbol: ${symbol} | Timeframe: ${timeframe} | Last Price: ${roundPx(price, price)}`,
      `Computed Telemetry: ${JSON.stringify(telemetry)}`,
      `Signal Mixer Channels: ${JSON.stringify(mixer.channels)}`,
      `Swing Supports: ${JSON.stringify(supports)} | Swing Resistances: ${JSON.stringify(resistances)}`,
      `Recent 30 Candles: ${JSON.stringify(compactCandles)}`,
      `User Question: ${userQuestion}`,
    ].join('\n')
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

  // Validate directional invariants on BYO AI levels; fallback to quant ATR levels if inverted
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
