import type { AIProviderId, Candle } from '@dollarino/core';
import { decryptVaultJson } from '../crypto.js';
import type { Env } from '../env.js';

export interface ChartAIAnalysisResult {
  summary: string;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  supports: number[];
  resistances: number[];
}

export interface AIRecord {
  provider: AIProviderId;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  temperature: number;
  maxTokens: number;
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
  timeframe: string,
  candles: Candle[],
  userQuestion: string
): Promise<ChartAIAnalysisResult> {
  const recent = candles.slice(-40);
  const last = recent[recent.length - 1];
  const minLow = Math.min(...recent.map((c) => c.low));
  const maxHigh = Math.max(...recent.map((c) => c.high));

  const ai = await resolveUserActiveAI(env, userId).catch(() => null);
  if (!ai) {
    // Deterministic local technical heuristic fallback when no BYO AI key is connected yet
    const price = last?.close ?? 0;
    const range = Math.max(maxHigh - minLow, price * 0.01);
    const prev = recent[Math.max(0, recent.length - 10)]?.close ?? price;
    const bias: 'LONG' | 'SHORT' = price >= prev ? 'LONG' : 'SHORT';
    const risk = range * 0.2;
    return {
      summary:
        `تحلیل تکنیکال داخلی دلارینو برای ${symbol} (${timeframe}): روند کوتاه‌مدت ${bias === 'LONG' ? 'صعودی' : 'نزولی'} است. برای تحلیل پیشرفته هوش مصنوعی می‌توانید کلید Claude / OpenAI / Gemini خود را در بخش Connections متصل کنید.`,
      bias,
      confidence: 64,
      entry: Number(price.toFixed(2)),
      stopLoss: Number((bias === 'LONG' ? price - risk : price + risk).toFixed(2)),
      tp1: Number((bias === 'LONG' ? price + risk : price - risk).toFixed(2)),
      tp2: Number((bias === 'LONG' ? price + risk * 2 : price - risk * 2).toFixed(2)),
      tp3: Number((bias === 'LONG' ? price + risk * 3 : price - risk * 3).toFixed(2)),
      supports: [Number((minLow + range * 0.1).toFixed(2))],
      resistances: [Number((maxHigh - range * 0.1).toFixed(2))],
    };
  }

  const systemPrompt = `You are Dollarino Chart AI, a strict quantitative crypto futures analyst.
Respond ONLY with valid JSON matching this schema:
{
  "summary": "concise technical analysis in the user's language (Persian if user asks in Persian)",
  "bias": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": 0-100,
  "entry": number,
  "stopLoss": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "supports": [number],
  "resistances": [number]
}`;

  const compactCandles = recent.slice(-25).map((c) => ({
    t: new Date(c.timestamp).toISOString().slice(0, 16),
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    v: Math.round(c.volume),
  }));

  const rawText = await callBYOAI(
    ai,
    systemPrompt,
    `Symbol: ${symbol}\nTimeframe: ${timeframe}\nRecent Candles: ${JSON.stringify(compactCandles)}\nUser Question: ${userQuestion}`
  );

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      summary: rawText.slice(0, 800),
      bias: 'NEUTRAL',
      confidence: 50,
      supports: [],
      resistances: [],
    };
  }
  const parsed = JSON.parse(jsonMatch[0]) as ChartAIAnalysisResult;
  return {
    summary: parsed.summary || 'Analysis completed.',
    bias: parsed.bias || 'NEUTRAL',
    confidence: Number(parsed.confidence ?? 60),
    entry: parsed.entry,
    stopLoss: parsed.stopLoss,
    tp1: parsed.tp1,
    tp2: parsed.tp2,
    tp3: parsed.tp3,
    supports: Array.isArray(parsed.supports) ? parsed.supports : [],
    resistances: Array.isArray(parsed.resistances) ? parsed.resistances : [],
  };
}
