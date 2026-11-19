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
import { decryptVaultJson, randomId } from '../crypto.js';
import type { Env } from '../env.js';

export type AIConsensusMode = 'SINGLE' | 'DUAL' | 'ENSEMBLE_3' | 'ENSEMBLE_AUTO';

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
  modelCount?: number;
  consensusMode?: string;
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

export interface AIModelVote {
  slotOrder: number;
  provider: AIProviderId;
  model: string;
  label: string;
  weight: number;
  action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE' | 'ERROR';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  thesis: string;
  latencyMs?: number;
  error?: string;
}

export interface AITradeDecision {
  ok: boolean;
  provider?: AIProviderId;
  model?: string;
  source?: 'PLATFORM' | 'USER';
  consensusMode?: AIConsensusMode;
  modelCount?: number;
  cached?: boolean;
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
  modelVotes?: AIModelVote[];
  error?: string;
}

export interface AIRecord {
  id?: string;
  slotOrder?: number;
  label?: string;
  weight?: number;
  provider: AIProviderId;
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

export interface PlatformAISummary {
  configured: boolean;
  activeCount: number;
  totalCount: number;
  consensusMode: AIConsensusMode;
  cacheTtlSec: number;
  effectiveModeLabelFa: string;
  effectiveModeLabelEn: string;
  engines: Array<{
    id: string;
    slot_order: number;
    provider: AIProviderId;
    label: string;
    model: string;
    weight: number;
    is_active: number;
    last_test_status: string;
  }>;
  latestSignals: Array<{
    id: string;
    symbol: string;
    timeframe: string;
    action: string;
    confidence: number;
    model_count: number;
    consensus_mode: string;
    thesis: string;
    created_at: string;
    model_votes: AIModelVote[];
  }>;
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

async function getSetting(db: D1Database, key: string, fallback: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>()
    .catch(() => null);
  return row?.value ?? fallback;
}

export async function getPlatformAISummary(env: Env): Promise<PlatformAISummary> {
  const [consensusRaw, ttlRaw, enginesRes, signalsRes] = await Promise.all([
    getSetting(env.DB, 'ai_consensus_mode', 'ENSEMBLE_AUTO'),
    getSetting(env.DB, 'ai_cache_ttl_sec', '180'),
    env.DB.prepare(
      `SELECT id, slot_order, provider, label, model, weight, is_active, last_test_status
       FROM platform_ai_engines ORDER BY slot_order ASC, created_at ASC LIMIT 3`
    )
      .all<{
        id: string;
        slot_order: number;
        provider: AIProviderId;
        label: string;
        model: string;
        weight: number;
        is_active: number;
        last_test_status: string;
      }>()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT id, symbol, timeframe, action, confidence, model_count, consensus_mode, thesis, model_votes_json, created_at
       FROM platform_ai_signals ORDER BY created_at DESC LIMIT 6`
    )
      .all<{
        id: string;
        symbol: string;
        timeframe: string;
        action: string;
        confidence: number;
        model_count: number;
        consensus_mode: string;
        thesis: string;
        model_votes_json: string;
        created_at: string;
      }>()
      .catch(() => ({ results: [] })),
  ]);

  const consensusMode = (
    ['SINGLE', 'DUAL', 'ENSEMBLE_3', 'ENSEMBLE_AUTO'].includes(consensusRaw) ? consensusRaw : 'ENSEMBLE_AUTO'
  ) as AIConsensusMode;
  const cacheTtlSec = Math.max(30, Math.min(900, Number(ttlRaw) || 180));
  const engines = enginesRes.results ?? [];
  const activeCount = engines.filter((e) => e.is_active === 1).length;

  const capByMode =
    consensusMode === 'SINGLE' ? 1 : consensusMode === 'DUAL' ? 2 : 3;
  const effectiveActive = Math.min(activeCount, capByMode);

  const effectiveModeLabelFa =
    effectiveActive === 0
      ? 'در انتظار اتصال مدل هوش مصنوعی توسط مدیریت'
      : effectiveActive === 1
        ? `موتور مرکزی دلارینو (۱ مدل فعال: ${engines.find((e) => e.is_active === 1)?.label ?? ''})`
        : `موتور اجماع مرکزی دلارینو (ترکیب ${effectiveActive} مدل هوش مصنوعی)`;

  const effectiveModeLabelEn =
    effectiveActive === 0
      ? 'Waiting for admin to connect central AI model(s)'
      : effectiveActive === 1
        ? `Central Dollarino AI (1 active model)`
        : `Central Consensus AI (${effectiveActive} combined models)`;

  const latestSignals = (signalsRes.results ?? []).map((s) => {
    let votes: AIModelVote[] = [];
    try {
      votes = JSON.parse(s.model_votes_json || '[]') as AIModelVote[];
    } catch {
      votes = [];
    }
    return {
      id: s.id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      action: s.action,
      confidence: s.confidence,
      model_count: s.model_count,
      consensus_mode: s.consensus_mode,
      thesis: s.thesis,
      created_at: s.created_at,
      model_votes: votes,
    };
  });

  return {
    configured: effectiveActive > 0,
    activeCount: effectiveActive,
    totalCount: engines.length,
    consensusMode,
    cacheTtlSec,
    effectiveModeLabelFa,
    effectiveModeLabelEn,
    engines,
    latestSignals,
  };
}

export async function resolvePlatformAIEngines(env: Env): Promise<{
  engines: AIRecord[];
  consensusMode: AIConsensusMode;
  cacheTtlSec: number;
}> {
  const consensusRaw = await getSetting(env.DB, 'ai_consensus_mode', 'ENSEMBLE_AUTO');
  const ttlRaw = await getSetting(env.DB, 'ai_cache_ttl_sec', '180');
  const consensusMode = (
    ['SINGLE', 'DUAL', 'ENSEMBLE_3', 'ENSEMBLE_AUTO'].includes(consensusRaw) ? consensusRaw : 'ENSEMBLE_AUTO'
  ) as AIConsensusMode;
  const cacheTtlSec = Math.max(30, Math.min(900, Number(ttlRaw) || 180));
  const limit = consensusMode === 'SINGLE' ? 1 : consensusMode === 'DUAL' ? 2 : 3;

  const rows = await env.DB.prepare(
    `SELECT id, slot_order, provider, label, model, base_url, weight, encrypted_api_key, temperature, max_tokens, daily_call_cap, calls_today, calls_reset_date
     FROM platform_ai_engines WHERE is_active = 1 ORDER BY slot_order ASC, updated_at DESC LIMIT ?`
  )
    .bind(limit)
    .all<{
      id: string;
      slot_order: number;
      provider: AIProviderId;
      label: string;
      model: string;
      base_url: string | null;
      weight: number;
      encrypted_api_key: string;
      temperature: number;
      max_tokens: number;
      daily_call_cap: number;
      calls_today: number;
      calls_reset_date: string | null;
    }>()
    .catch(() => ({ results: [] }));

  const today = new Date().toISOString().slice(0, 10);
  const engines: AIRecord[] = [];

  for (const row of rows.results ?? []) {
    const callsToday = row.calls_reset_date === today ? row.calls_today : 0;
    if (callsToday >= row.daily_call_cap) continue;
    const creds = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY).catch(() => ({
      apiKey: undefined,
    }));
    if (!creds.apiKey) continue;

    await env.DB.prepare(
      `UPDATE platform_ai_engines SET calls_today = ?, calls_reset_date = ? WHERE id = ?`
    ).bind(callsToday + 1, today, row.id).run().catch(() => {});

    engines.push({
      id: row.id,
      slotOrder: row.slot_order,
      label: row.label,
      weight: Math.max(1, row.weight || 100),
      provider: row.provider,
      model: row.model,
      baseUrl: row.base_url,
      apiKey: creds.apiKey,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
    });
  }

  return { engines, consensusMode, cacheTtlSec };
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

export async function resolveAIEnsemble(env: Env, userId?: string): Promise<{
  source: 'PLATFORM' | 'USER';
  engines: AIRecord[];
  consensusMode: AIConsensusMode;
  cacheTtlSec: number;
}> {
  const platform = await resolvePlatformAIEngines(env);
  if (platform.engines.length > 0) {
    return {
      source: 'PLATFORM',
      engines: platform.engines,
      consensusMode: platform.consensusMode,
      cacheTtlSec: platform.cacheTtlSec,
    };
  }
  if (userId) {
    const userAi = await resolveUserActiveAI(env, userId).catch(() => null);
    if (userAi) {
      return {
        source: 'USER',
        engines: [{ ...userAi, id: 'user-personal', slotOrder: 1, label: userAi.model, weight: 100 }],
        consensusMode: 'SINGLE',
        cacheTtlSec: 60,
      };
    }
  }
  return {
    source: 'PLATFORM',
    engines: [],
    consensusMode: platform.consensusMode,
    cacheTtlSec: platform.cacheTtlSec,
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

  if (ai.provider === 'deepseek') {
    const baseUrl = (ai.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = ai.model || 'deepseek-chat';
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

function normalizeSingleDecision(
  parsed: Partial<AITradeDecision>,
  priceRef: number,
  atrRef: number,
  maxLeverage: number
) {
  const rawAction = String(parsed.action || 'HOLD').toUpperCase();
  const action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE' =
    rawAction === 'LONG' || rawAction === 'SHORT' || rawAction === 'CLOSE' ? rawAction : 'HOLD';
  const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 0))));
  const leverage = Math.min(Math.max(1, maxLeverage), Math.max(1, Math.round(Number(parsed.leverage ?? Math.min(5, maxLeverage)))));
  const entry = roundPx(Number(parsed.entry) > 0 ? Number(parsed.entry) : priceRef, priceRef);
  const safeRisk = Math.max(atrRef * 1.8, priceRef * 0.005);
  let stopLoss = Number(parsed.stopLoss) > 0 ? roundPx(Number(parsed.stopLoss), priceRef) : 0;
  let tp1 = Number(parsed.tp1) > 0 ? roundPx(Number(parsed.tp1), priceRef) : 0;
  let tp2 = Number(parsed.tp2) > 0 ? roundPx(Number(parsed.tp2), priceRef) : 0;
  let tp3 = Number(parsed.tp3) > 0 ? roundPx(Number(parsed.tp3), priceRef) : 0;

  if (action === 'LONG') {
    if (stopLoss <= 0 || stopLoss >= entry || entry - stopLoss < atrRef * 0.8) {
      stopLoss = roundPx(entry - safeRisk, priceRef);
    }
    const risk = entry - stopLoss;
    if (tp1 <= entry) tp1 = roundPx(entry + risk * 1.3, priceRef);
    if (tp2 <= tp1) tp2 = roundPx(entry + risk * 2.3, priceRef);
    if (tp3 <= tp2) tp3 = roundPx(entry + risk * 3.5, priceRef);
  } else if (action === 'SHORT') {
    if (stopLoss <= 0 || stopLoss <= entry || stopLoss - entry < atrRef * 0.8) {
      stopLoss = roundPx(entry + safeRisk, priceRef);
    }
    const risk = stopLoss - entry;
    if (tp1 <= 0 || tp1 >= entry) tp1 = roundPx(entry - risk * 1.3, priceRef);
    if (tp2 <= 0 || tp2 >= tp1) tp2 = roundPx(entry - risk * 2.3, priceRef);
    if (tp3 <= 0 || tp3 >= tp2) tp3 = roundPx(entry - risk * 3.5, priceRef);
  }

  return {
    action,
    confidence,
    leverage,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    thesis: String(parsed.thesis || 'AI thesis generated.').slice(0, 700),
    invalidation: String(parsed.invalidation || 'Structure break beyond Stop Loss').slice(0, 260),
  };
}

/**
 * Autonomous LLM Portfolio Trader — powered by Admin's Centralized 1–3 AI Consensus Engine
 * (with automatic fallback to user's personal AI key only if no platform AI is configured).
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
    bypassCache?: boolean;
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
      thesis: 'داده کندل برای تحلیل کافی نیست',
      invalidation: 'Wait for 35+ candles',
      error: 'Insufficient candle data',
    };
  }

  const ensemble = await resolveAIEnsemble(env, userId);
  if (ensemble.engines.length === 0) {
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
      thesis: 'هوش مصنوعی دلارینو هنوز توسط مدیریت پلتفرم تنظیم نشده است.',
      invalidation: 'Admin must configure at least 1 platform AI engine in Admin Panel',
      error: 'NO_ACTIVE_AI_KEY',
    };
  }

  const latestCandleTs = params.candles[params.candles.length - 1]!.timestamp;

  // Shared per-candle / TTL consensus cache across all platform users!
  if (ensemble.source === 'PLATFORM' && !params.openPosition && !params.bypassCache) {
    const minIso = new Date(Date.now() - ensemble.cacheTtlSec * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const cached = await env.DB.prepare(
      `SELECT * FROM platform_ai_signals
       WHERE symbol = ? AND timeframe = ? AND candle_ts = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(params.symbol, params.timeframe, latestCandleTs, minIso)
      .first<{
        consensus_mode: AIConsensusMode;
        model_count: number;
        action: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE';
        confidence: number;
        entry: number;
        stop_loss: number;
        tp1: number;
        tp2: number;
        tp3: number;
        leverage: number;
        rr_ratio: number;
        thesis: string;
        invalidation: string;
        model_votes_json: string;
      }>()
      .catch(() => null);

    if (cached) {
      let votes: AIModelVote[] = [];
      try {
        votes = JSON.parse(cached.model_votes_json || '[]') as AIModelVote[];
      } catch {
        votes = [];
      }
      return {
        ok: true,
        source: 'PLATFORM',
        provider: votes[0]?.provider ?? ensemble.engines[0]!.provider,
        model: `${cached.model_count}x Ensemble (${votes.map((v) => v.model).join(' + ')})`,
        consensusMode: cached.consensus_mode,
        modelCount: cached.model_count,
        cached: true,
        action: cached.action,
        confidence: cached.confidence,
        entry: cached.entry,
        stopLoss: cached.stop_loss,
        tp1: cached.tp1,
        tp2: cached.tp2,
        tp3: cached.tp3,
        leverage: Math.min(params.maxLeverage, Math.max(1, cached.leverage)),
        rrRatio: cached.rr_ratio,
        thesis: cached.thesis,
        invalidation: cached.invalidation,
        modelVotes: votes,
      };
    }
  }

  const ctx = buildMarketContext(params.symbol, params.timeframe, params.candles, {
    htfCandles: params.htfCandles,
    kbosParams: params.kbosParams,
    mixerWeights: params.mixerWeights,
    mixerThreshold: params.mixerThreshold,
  });

  const sysPrompt = `You are part of Dollarino Central AI Trading Committee — an institutional perpetual futures decision model.
Analyze raw multi-timeframe price action, market microstructure, momentum, volatility (ATR), orderbook imbalance, and structural S/R to vote on LONG, SHORT, HOLD, or CLOSE.
Respond ONLY with strict valid JSON:
{
  "action": "LONG" | "SHORT" | "HOLD" | "CLOSE",
  "confidence": 0-100,
  "entry": number,
  "stopLoss": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "leverage": number,
  "thesis": "concise reasoning citing trend, structure, and momentum",
  "invalidation": "exact price/condition that invalidates thesis"
}
Rules:
1. If market is choppy or uncertain, return "action": "HOLD".
2. Stop Loss must be >= 1.5 * ATR14 from entry behind structure.
3. Minimum R:R >= 1.2 on TP1, 2.2 on TP2, 3.2 on TP3.
4. For LONG: stopLoss < entry < tp1 < tp2 < tp3. For SHORT: stopLoss > entry > tp1 > tp2 > tp3.
5. Leverage between 1 and ${Math.max(1, params.maxLeverage)}.
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

  const votes: AIModelVote[] = [];
  const validResults: Array<{
    engine: AIRecord;
    norm: ReturnType<typeof normalizeSingleDecision>;
  }> = [];

  const settled = await Promise.allSettled(
    ensemble.engines.map(async (eng) => {
      const t0 = Date.now();
      const rawText = await callBYOAI(eng, sysPrompt, userPrompt, { fastJson: false });
      const latencyMs = Date.now() - t0;
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Non-JSON response from model');
      const parsed = JSON.parse(match[0]) as Partial<AITradeDecision>;
      const norm = normalizeSingleDecision(parsed, ctx.price, ctx.a14, params.maxLeverage);
      return { eng, norm, latencyMs };
    })
  );

  for (let idx = 0; idx < settled.length; idx++) {
    const res = settled[idx]!;
    const eng = ensemble.engines[idx]!;
    if (res.status === 'fulfilled') {
      const { norm, latencyMs } = res.value;
      validResults.push({ engine: eng, norm });
      votes.push({
        slotOrder: eng.slotOrder ?? idx + 1,
        provider: eng.provider,
        model: eng.model,
        label: eng.label ?? eng.model,
        weight: eng.weight ?? 100,
        action: norm.action,
        confidence: norm.confidence,
        entry: norm.entry,
        stopLoss: norm.stopLoss,
        tp1: norm.tp1,
        thesis: norm.thesis,
        latencyMs,
      });
    } else {
      votes.push({
        slotOrder: eng.slotOrder ?? idx + 1,
        provider: eng.provider,
        model: eng.model,
        label: eng.label ?? eng.model,
        weight: eng.weight ?? 100,
        action: 'ERROR',
        confidence: 0,
        thesis: 'Model call failed',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  }

  if (validResults.length === 0) {
    return {
      ok: false,
      source: ensemble.source,
      consensusMode: ensemble.consensusMode,
      modelCount: ensemble.engines.length,
      action: 'HOLD',
      confidence: 0,
      entry: roundPx(ctx.price, ctx.price),
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      leverage: 1,
      rrRatio: 0,
      thesis: 'تمامی مدل‌های هوش مصنوعی در این چرخه با خطا مواجه شدند؛ سیستم با احتیاط در حالت انتظار ماند.',
      invalidation: 'Retry on next candle',
      modelVotes: votes,
      error: votes.map((v) => v.error).filter(Boolean).join(' | '),
    };
  }

  // Consensus Aggregation across 1, 2, or 3 active models
  let finalAction: 'LONG' | 'SHORT' | 'HOLD' | 'CLOSE' = 'HOLD';
  let finalConfidence = 0;
  let finalEntry = roundPx(ctx.price, ctx.price);
  let finalSl = 0;
  let finalTp1 = 0;
  let finalTp2 = 0;
  let finalTp3 = 0;
  let finalLev = Math.min(5, params.maxLeverage);
  let finalThesis = '';
  let finalInvalidation = '';

  if (validResults.length === 1) {
    const only = validResults[0]!;
    finalAction = only.norm.action;
    finalConfidence = only.norm.confidence;
    finalEntry = only.norm.entry;
    finalSl = only.norm.stopLoss;
    finalTp1 = only.norm.tp1;
    finalTp2 = only.norm.tp2;
    finalTp3 = only.norm.tp3;
    finalLev = only.norm.leverage;
    finalThesis = `[${only.engine.label || only.engine.model}] ${only.norm.thesis}`;
    finalInvalidation = only.norm.invalidation;
  } else {
    const totalWeight = validResults.reduce((s, r) => s + (r.engine.weight || 100), 0);
    const weightOf = (act: 'LONG' | 'SHORT' | 'CLOSE' | 'HOLD') =>
      validResults.filter((r) => r.norm.action === act).reduce((s, r) => s + (r.engine.weight || 100), 0);

    const longGroup = validResults.filter((r) => r.norm.action === 'LONG');
    const shortGroup = validResults.filter((r) => r.norm.action === 'SHORT');
    const closeGroup = validResults.filter((r) => r.norm.action === 'CLOSE');

    const longWeight = weightOf('LONG');
    const shortWeight = weightOf('SHORT');
    const closeWeight = weightOf('CLOSE');

    // Strict consensus rule:
    // - For 2 models: require BOTH models to agree on LONG or SHORT (prevents conflicting trades!)
    // - For 3 models: require >= 2 models AND > 50% total weight agreeing on the same direction!
    const requiredMinAgree = validResults.length === 2 ? 2 : 2;
    let winningGroup: typeof validResults = [];
    if (longGroup.length >= requiredMinAgree && longWeight > totalWeight * 0.5 && shortGroup.length === 0) {
      finalAction = 'LONG';
      winningGroup = longGroup;
    } else if (shortGroup.length >= requiredMinAgree && shortWeight > totalWeight * 0.5 && longGroup.length === 0) {
      finalAction = 'SHORT';
      winningGroup = shortGroup;
    } else if (closeGroup.length >= requiredMinAgree && closeWeight >= totalWeight * 0.5) {
      finalAction = 'CLOSE';
      winningGroup = closeGroup;
    } else if (
      validResults.length === 3 &&
      longGroup.length >= 2 &&
      longWeight >= totalWeight * 0.6
    ) {
      finalAction = 'LONG';
      winningGroup = longGroup;
    } else if (
      validResults.length === 3 &&
      shortGroup.length >= 2 &&
      shortWeight >= totalWeight * 0.6
    ) {
      finalAction = 'SHORT';
      winningGroup = shortGroup;
    } else {
      finalAction = 'HOLD';
    }

    if (winningGroup.length > 0) {
      const wSum = winningGroup.reduce((s, r) => s + (r.engine.weight || 100), 0);
      finalConfidence = Math.round(
        winningGroup.reduce((s, r) => s + r.norm.confidence * (r.engine.weight || 100), 0) / wSum
      );
      finalEntry = roundPx(
        winningGroup.reduce((s, r) => s + r.norm.entry * (r.engine.weight || 100), 0) / wSum,
        ctx.price
      );
      finalLev = Math.min(
        params.maxLeverage,
        Math.max(1, Math.round(winningGroup.reduce((s, r) => s + r.norm.leverage * (r.engine.weight || 100), 0) / wSum))
      );

      if (finalAction === 'LONG') {
        // Conservative stop loss & blended targets across agreeing models
        finalSl = roundPx(Math.min(...winningGroup.map((r) => r.norm.stopLoss)), ctx.price);
        finalTp1 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp1 * (r.engine.weight || 100), 0) / wSum, ctx.price);
        finalTp2 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp2 * (r.engine.weight || 100), 0) / wSum, ctx.price);
        finalTp3 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp3 * (r.engine.weight || 100), 0) / wSum, ctx.price);
      } else if (finalAction === 'SHORT') {
        finalSl = roundPx(Math.max(...winningGroup.map((r) => r.norm.stopLoss)), ctx.price);
        finalTp1 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp1 * (r.engine.weight || 100), 0) / wSum, ctx.price);
        finalTp2 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp2 * (r.engine.weight || 100), 0) / wSum, ctx.price);
        finalTp3 = roundPx(winningGroup.reduce((s, r) => s + r.norm.tp3 * (r.engine.weight || 100), 0) / wSum, ctx.price);
      }

      finalThesis = `اجماع ${winningGroup.length} از ${validResults.length} مدل هوش مصنوعی (${finalAction}): ${winningGroup
        .map((r) => `${r.engine.label || r.engine.model}: ${r.norm.thesis}`)
        .join(' | ')}`.slice(0, 950);
      finalInvalidation = winningGroup[0]!.norm.invalidation;
    } else {
      finalConfidence = Math.round(
        validResults.reduce((s, r) => s + r.norm.confidence * (r.engine.weight || 100), 0) / totalWeight
      );
      const voteSummary = validResults
        .map((r) => `${r.engine.label || r.engine.model}=${r.norm.action}(${r.norm.confidence}%)`)
        .join(' · ');
      finalThesis = `عدم اجماع کامل بین مدل‌ها (${voteSummary}) — برای حفظ سرمایه در انتظار تایید قوی‌تر ماندیم.`;
      finalInvalidation = 'Wait for clear multi-model agreement';
    }
  }

  const riskDist = Math.abs(finalEntry - finalSl);
  const rrRatio =
    (finalAction === 'LONG' || finalAction === 'SHORT') && riskDist > 0 && finalTp2 > 0
      ? Number((Math.abs(finalTp2 - finalEntry) / riskDist).toFixed(2))
      : 0;

  if (ensemble.source === 'PLATFORM' && !params.openPosition) {
    await env.DB.prepare(
      `INSERT INTO platform_ai_signals
       (id, symbol, timeframe, candle_ts, consensus_mode, model_count, action, confidence, entry, stop_loss, tp1, tp2, tp3, leverage, rr_ratio, thesis, invalidation, model_votes_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        randomId('aisig'),
        params.symbol,
        params.timeframe,
        latestCandleTs,
        ensemble.consensusMode,
        validResults.length,
        finalAction,
        finalConfidence,
        finalEntry,
        finalSl,
        finalTp1,
        finalTp2,
        finalTp3,
        finalLev,
        rrRatio,
        finalThesis,
        finalInvalidation,
        JSON.stringify(votes)
      )
      .run()
      .catch(() => {});
  }

  return {
    ok: true,
    source: ensemble.source,
    provider: validResults[0]!.engine.provider,
    model: validResults.map((r) => r.engine.model).join(' + '),
    consensusMode: ensemble.consensusMode,
    modelCount: validResults.length,
    cached: false,
    action: finalAction,
    confidence: finalConfidence,
    entry: finalEntry,
    stopLoss: finalSl,
    tp1: finalTp1,
    tp2: finalTp2,
    tp3: finalTp3,
    leverage: finalLev,
    rrRatio,
    thesis: finalThesis,
    invalidation: finalInvalidation,
    modelVotes: votes,
  };
}

export async function testAllPlatformAIEngines(env: Env): Promise<{
  ok: boolean;
  consensusMode: AIConsensusMode;
  results: Array<{
    id: string;
    slot_order: number;
    provider: AIProviderId;
    label: string;
    model: string;
    ok: boolean;
    latencyMs: number;
    reply: string;
  }>;
}> {
  const { engines, consensusMode } = await resolvePlatformAIEngines(env);
  if (engines.length === 0) {
    return { ok: false, consensusMode, results: [] };
  }

  const results = await Promise.all(
    engines.map(async (eng) => {
      const t0 = Date.now();
      try {
        const reply = await callBYOAI(
          eng,
          'Reply with a short JSON object: {"status":"OK","engine":"<your model>"}',
          'Health check ping from Dollarino Central AI Engine.',
          { fastJson: true }
        );
        const latencyMs = Date.now() - t0;
        const statusText = `OK (${latencyMs}ms)`;
        if (eng.id) {
          await env.DB.prepare(
            `UPDATE platform_ai_engines SET last_test_status = ?, last_tested_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
          ).bind(statusText, eng.id).run().catch(() => {});
        }
        return {
          id: eng.id || '',
          slot_order: eng.slotOrder ?? 1,
          provider: eng.provider,
          label: eng.label || eng.model,
          model: eng.model,
          ok: true,
          latencyMs,
          reply: reply.slice(0, 180),
        };
      } catch (err) {
        const latencyMs = Date.now() - t0;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (eng.id) {
          await env.DB.prepare(
            `UPDATE platform_ai_engines SET last_test_status = ?, last_tested_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
          ).bind(`ERR: ${errMsg.slice(0, 80)}`, eng.id).run().catch(() => {});
        }
        return {
          id: eng.id || '',
          slot_order: eng.slotOrder ?? 1,
          provider: eng.provider,
          label: eng.label || eng.model,
          model: eng.model,
          ok: false,
          latencyMs,
          reply: errMsg,
        };
      }
    })
  );

  return {
    ok: results.some((r) => r.ok),
    consensusMode,
    results,
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

  const ensemble = await resolveAIEnsemble(env, userId).catch(() => ({
    source: 'PLATFORM' as const,
    engines: [],
    consensusMode: 'SINGLE' as const,
    cacheTtlSec: 180,
  }));
  const primaryAi = ensemble.engines[0];

  if (!primaryAi) {
    const isFa = /[\u0600-\u06FF]/.test(userQuestion);
    const actionableDir = quantBias === 'NEUTRAL' ? undefined : quantBias;
    const conf = Math.max(45, Math.min(92, mixer.confidence || (quantBias === 'NEUTRAL' ? 48 : 66)));
    const supStr = supports.join(' / ') || '-';
    const resStr = resistances.join(' / ') || '-';
    const summary = isFa
      ? [
          `تحلیل استراتژی منتخب دلارینو (موتور دُرنا V1) برای ${symbol} (${timeframe}):`,
          `• روند تایم‌فریم بالاتر: ${htfTrend} | EMA20=${telemetry.ema20} vs EMA50=${telemetry.ema50}`,
          `• قدرت روند و نوسان: RSI(14)=${telemetry.rsi14} | ATR(14)=${telemetry.atr14} | KBOs=${telemetry.kbosSignal}`,
          `• امتیاز ترکیب سیگنال‌ها: ${telemetry.mixerScore} (اطمینان ${mixer.confidence}%)`,
          `• حمایت‌ها: ${supStr} | مقاومت‌ها: ${resStr}`,
          actionableDir
            ? `• ستاپ پیشنهادی ${actionableDir}: ورود=${fallbackEntry} | حد ضرر=${fallbackSl} | اهداف: ${fallbackTp1} / ${fallbackTp2} / ${fallbackTp3}`
            : '• بازار فعلاً در وضعیت خنثی است؛ بهتر است منتظر تایید واضح‌تر بمانید.',
        ].join('\n')
      : [
          `Dollarino Select (Dorna V1) Quant Analysis for ${symbol} (${timeframe}):`,
          `• HTF Trend: ${htfTrend} | EMA20=${telemetry.ema20} vs EMA50=${telemetry.ema50}`,
          `• Momentum: RSI(14)=${telemetry.rsi14} | ATR(14)=${telemetry.atr14} | KBOs=${telemetry.kbosSignal}`,
          `• Composite Score: ${telemetry.mixerScore} (${mixer.confidence}% confidence)`,
          `• Supports: ${supStr} | Resistances: ${resStr}`,
          actionableDir
            ? `• ${actionableDir} Setup: Entry=${fallbackEntry} | SL=${fallbackSl} | TP1=${fallbackTp1} / TP2=${fallbackTp2} / TP3=${fallbackTp3}`
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
      modelCount: 0,
      telemetry,
    };
  }

  const systemPrompt = `You are Dollarino Central AI Analyst (${ensemble.engines.map((e) => e.model).join(' + ')}), an institutional crypto futures analyst.
Respond ONLY with valid JSON:
{
  "summary": "clear concise analysis in the user's language (Persian if user asks in Persian)",
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
- Preserve ${pricePrecision(price)} decimals for ${symbol}.
- LONG: stopLoss < entry < tp1 < tp2 < tp3. SHORT: stopLoss > entry > tp1 > tp2 > tp3.`;

  const promptPayload = [
    `Symbol: ${symbol} | Timeframe: ${timeframe} | Last Price: ${roundPx(price, price)}`,
    `Computed Telemetry: ${JSON.stringify(telemetry)}`,
    `Signal Mixer Channels: ${JSON.stringify(mixer.channels)}`,
    `Swing Supports: ${JSON.stringify(supports)} | Swing Resistances: ${JSON.stringify(resistances)}`,
    `Recent 32 Candles: ${JSON.stringify(compactCandles)}`,
    `User Question: ${userQuestion}`,
  ].join('\n');

  const rawOutputs = await Promise.allSettled(
    ensemble.engines.map((ai) => callBYOAI(ai, systemPrompt, promptPayload, { fastJson: true }))
  );

  const parsedModels: ChartAIAnalysisResult[] = [];
  for (const r of rawOutputs) {
    if (r.status !== 'fulfilled') continue;
    const match = r.value.match(/\{[\s\S]*\}/);
    if (!match) continue;
    try {
      parsedModels.push(JSON.parse(match[0]) as ChartAIAnalysisResult);
    } catch {
      // ignore malformed single reply
    }
  }

  if (parsedModels.length === 0) {
    const firstFulfilled = rawOutputs.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<string> | undefined;
    return {
      summary: firstFulfilled?.value.slice(0, 1000) || 'تحلیل آماده است.',
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
      modelCount: ensemble.engines.length,
      consensusMode: ensemble.consensusMode,
      telemetry,
    };
  }

  const parsed = parsedModels[0]!;
  const agreedBias =
    parsedModels.length > 1 && parsedModels.every((m) => m.bias === parsed.bias)
      ? parsed.bias
      : parsedModels.length === 1
        ? parsed.bias
        : quantBias;
  const finalBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    agreedBias === 'LONG' || agreedBias === 'SHORT' || agreedBias === 'NEUTRAL' ? agreedBias : quantBias;
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

  const avgConf = Math.round(
    parsedModels.reduce((s, m) => s + Math.min(100, Math.max(0, Number(m.confidence ?? 65))), 0) / parsedModels.length
  );
  const rrRatio =
    dir && stopLoss && tp2 && Math.abs(entry - stopLoss) > 0
      ? Number((Math.abs(tp2 - entry) / Math.abs(entry - stopLoss)).toFixed(2))
      : undefined;

  const combinedSummary =
    parsedModels.length > 1
      ? parsedModels.map((m, idx) => `• مدل ${idx + 1}: ${m.summary}`).join('\n')
      : parsed.summary || 'تحلیل تکمیل شد.';

  return {
    summary: combinedSummary,
    bias: finalBias,
    direction: dir,
    confidence: avgConf,
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
    modelCount: parsedModels.length,
    consensusMode: ensemble.consensusMode,
    telemetry,
  };
}
