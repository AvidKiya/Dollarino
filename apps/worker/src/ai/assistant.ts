import type { AIProviderId } from '@dollarino/core';
import { decryptVaultJson, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { callBYOAI, resolveAIEnsemble, type AIRecord } from './providers.js';

export const DOLLARINO_CREATOR_INFO = {
  nameFa: 'آوید کیا',
  nameEn: 'Avid Kiya',
  telegram: '@avidkiya',
  telegramUrl: 'https://t.me/avidkiya',
  instagram: '@avid_kiya',
  instagramUrl: 'https://instagram.com/avid_kiya',
  twitter: '@avid_kiya',
  twitterUrl: 'https://x.com/avid_kiya',
};

export interface SelectableAIModel {
  id: string;
  label: string;
  provider: AIProviderId;
  model: string;
  source: 'PLATFORM' | 'USER';
  supportsVision: boolean;
  isDefault: boolean;
}

export interface ExtractedChartSetup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe?: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  leverage?: number;
  rrRatio?: string;
  confidence?: number;
  note?: string;
}

export interface AssistantChatResult {
  reply: string;
  modelId: string;
  modelLabel: string;
  provider: AIProviderId;
  modelName: string;
  usedVision: boolean;
  visionFallbackNotice?: string;
  setup: ExtractedChartSetup | null;
}

export function detectVisionSupport(provider: AIProviderId | string, model: string, label?: string): boolean {
  const m = `${model} ${label || ''}`.toLowerCase();
  if (provider === 'gemini') return true;
  if (provider === 'anthropic') {
    return /claude-(?:3|4|sonnet|opus|haiku)/.test(m);
  }
  if (/vision|\bvl\b|gpt-4o|gpt-4\.1|gpt-4\.5|gpt-4-turbo|gpt-5|\bo1\b|\bo3\b|\bo4\b|pixtral|llava|grok-2-vision|grok-4|gemini|claude-3|claude-4|sonnet|qwen[\d.]*-vl|qwen3-vl|kimi-vl/.test(m)) {
    return true;
  }
  return false;
}

export async function listSelectableAIModels(
  env: Env,
  userId?: string
): Promise<{
  models: SelectableAIModel[];
  selectedModelId: string;
}> {
  const models: SelectableAIModel[] = [];
  const seenIds = new Set<string>();

  // 1) Platform engines configured in Admin Panel
  const platformRows = await env.DB.prepare(
    `SELECT id, slot_order, provider, label, model, base_url
     FROM platform_ai_engines
     WHERE is_active = 1
     ORDER BY slot_order ASC, updated_at DESC`
  )
    .all<{
      id: string;
      slot_order: number;
      provider: AIProviderId;
      label: string;
      model: string;
      base_url: string | null;
    }>()
    .catch(() => ({ results: [] }));

  for (const r of platformRows.results ?? []) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    let modelName = r.model;
    if ((r.base_url || '').includes('hilinkup.com') && modelName.trim().toLowerCase() === 'deep') {
      modelName = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    }
    models.push({
      id: r.id,
      label: r.label || modelName,
      provider: r.provider,
      model: modelName,
      source: 'PLATFORM',
      supportsVision: detectVisionSupport(r.provider, modelName, r.label),
      isDefault: models.length === 0,
    });
  }

  // 2) Built-in Hilinkup Gateway fallback model when no D1 platform engine is added yet (or always keep if available)
  if (env.HILINKUP_API_KEY?.trim() && models.length === 0) {
    const defModel = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    models.push({
      id: 'env-hilinkup-default',
      label: 'هوش مصنوعی مرکزی دلارینو (DeepSeek v4.1)',
      provider: 'openai_compatible',
      model: defModel,
      source: 'PLATFORM',
      supportsVision: detectVisionSupport('openai_compatible', defModel),
      isDefault: true,
    });
  }

  // 3) User's own connected AI models (from Connections / BYOAI)
  if (userId) {
    const userRows = await env.DB.prepare(
      `SELECT id, provider, label, model, is_active
       FROM ai_connections
       WHERE user_id = ?
       ORDER BY is_active DESC, updated_at DESC`
    )
      .bind(userId)
      .all<{
        id: string;
        provider: AIProviderId;
        label: string;
        model: string;
        is_active: number;
      }>()
      .catch(() => ({ results: [] }));

    for (const r of userRows.results ?? []) {
      const uid = `user:${r.id}`;
      if (seenIds.has(uid)) continue;
      seenIds.add(uid);
      models.push({
        id: uid,
        label: `${r.label || r.model} (مدل شخصی)`,
        provider: r.provider,
        model: r.model,
        source: 'USER',
        supportsVision: detectVisionSupport(r.provider, r.model, r.label),
        isDefault: models.length === 0,
      });
    }
  }

  let selectedModelId = models[0]?.id || 'dollarino-core';
  if (userId) {
    const pref = await env.DB.prepare(`SELECT preferred_ai_model_id FROM users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first<{ preferred_ai_model_id: string | null }>()
      .catch(() => null);
    if (pref?.preferred_ai_model_id && models.some((m) => m.id === pref.preferred_ai_model_id)) {
      selectedModelId = pref.preferred_ai_model_id;
    }
  }

  return { models, selectedModelId };
}

export async function resolveModelRecordById(
  env: Env,
  userId: string,
  requestedModelId?: string | null
): Promise<{
  record: AIRecord;
  meta: SelectableAIModel;
} | null> {
  const { models, selectedModelId } = await listSelectableAIModels(env, userId);
  const targetId = requestedModelId?.trim() || selectedModelId;
  const targetMeta = models.find((m) => m.id === targetId) || models[0];
  if (!targetMeta) return null;

  if (targetMeta.id === 'env-hilinkup-default' && env.HILINKUP_API_KEY?.trim()) {
    const defModel = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    return {
      meta: targetMeta,
      record: {
        id: 'env-hilinkup-default',
        label: targetMeta.label,
        provider: 'openai_compatible',
        model: defModel,
        baseUrl: env.HILINKUP_BASE_URL?.trim() || 'https://api.hilinkup.com/v1',
        apiKey: env.HILINKUP_API_KEY.trim(),
        temperature: 0.35,
        maxTokens: 2400,
      },
    };
  }

  if (targetMeta.id.startsWith('user:')) {
    const rawId = targetMeta.id.slice(5);
    const row = await env.DB.prepare(
      `SELECT id, provider, label, model, base_url, encrypted_api_key, temperature, max_tokens
       FROM ai_connections WHERE id = ? AND user_id = ? LIMIT 1`
    )
      .bind(rawId, userId)
      .first<{
        id: string;
        provider: AIProviderId;
        label: string;
        model: string;
        base_url: string | null;
        encrypted_api_key: string;
        temperature: number;
        max_tokens: number;
      }>()
      .catch(() => null);

    if (row) {
      const creds = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY).catch(() => ({
        apiKey: undefined,
      }));
      if (creds.apiKey) {
        return {
          meta: targetMeta,
          record: {
            id: targetMeta.id,
            label: targetMeta.label,
            provider: row.provider,
            model: row.model,
            baseUrl: row.base_url,
            apiKey: creds.apiKey,
            temperature: row.temperature ?? 0.35,
            maxTokens: Math.max(row.max_tokens || 2048, 2048),
          },
        };
      }
    }
  }

  const platRow = await env.DB.prepare(
    `SELECT id, provider, label, model, base_url, encrypted_api_key, temperature, max_tokens
     FROM platform_ai_engines WHERE id = ? AND is_active = 1 LIMIT 1`
  )
    .bind(targetMeta.id)
    .first<{
      id: string;
      provider: AIProviderId;
      label: string;
      model: string;
      base_url: string | null;
      encrypted_api_key: string;
      temperature: number;
      max_tokens: number;
    }>()
    .catch(() => null);

  if (platRow) {
    const creds = await decryptVaultJson<{ apiKey?: string }>(platRow.encrypted_api_key, env.MASTER_ENCRYPTION_KEY).catch(() => ({
      apiKey: undefined,
    }));
    if (creds.apiKey) {
      let modelName = platRow.model;
      if ((platRow.base_url || '').includes('hilinkup.com') && modelName.trim().toLowerCase() === 'deep') {
        modelName = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
      }
      return {
        meta: targetMeta,
        record: {
          id: platRow.id,
          label: platRow.label || modelName,
          provider: platRow.provider,
          model: modelName,
          baseUrl: platRow.base_url,
          apiKey: creds.apiKey,
          temperature: platRow.temperature ?? 0.35,
          maxTokens: Math.max(platRow.max_tokens || 2048, 2048),
        },
      };
    }
  }

  // Fallback via standard ensemble
  const ensemble = await resolveAIEnsemble(env, userId).catch(() => null);
  const first = ensemble?.engines?.[0];
  if (!first) return null;
  return {
    meta: {
      id: first.id || 'default',
      label: first.label || first.model,
      provider: first.provider,
      model: first.model,
      source: ensemble?.source || 'PLATFORM',
      supportsVision: detectVisionSupport(first.provider, first.model, first.label),
      isDefault: true,
    },
    record: first,
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1]!.toLowerCase(), base64: match[2]!.replace(/\s+/g, '') };
}

export async function callMultimodalChatAI(
  ai: AIRecord,
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentText: string,
  imageDataUrl?: string | null
): Promise<string> {
  const img = imageDataUrl ? parseDataUrl(imageDataUrl) : null;
  const trimmedHistory = history.slice(-10);

  if (ai.provider === 'anthropic') {
    const msgs: Array<{ role: 'user' | 'assistant'; content: unknown }> = trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (img) {
      msgs.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType === 'image/jpg' ? 'image/jpeg' : img.mimeType,
              data: img.base64,
            },
          },
          { type: 'text', text: currentText },
        ],
      });
    } else {
      msgs.push({ role: 'user', content: currentText });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ai.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-3-5-sonnet-20241022',
        max_tokens: Math.max(ai.maxTokens || 2048, 2048),
        temperature: ai.temperature ?? 0.35,
        system: systemPrompt,
        messages: msgs,
      }),
      signal: AbortSignal.timeout(40_000),
    });
    const json = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `Anthropic HTTP ${res.status}`);
    return json.content?.[0]?.text ?? '';
  }

  if (ai.provider === 'gemini') {
    const model = ai.model || 'gemini-2.0-flash';
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = trimmedHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const currentParts: Array<Record<string, unknown>> = [{ text: currentText }];
    if (img) {
      currentParts.unshift({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
    contents.push({ role: 'user', parts: currentParts });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: ai.temperature ?? 0.35,
            maxOutputTokens: Math.max(ai.maxTokens || 2048, 2048),
          },
        }),
        signal: AbortSignal.timeout(40_000),
      }
    );
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // OpenAI / DeepSeek / OpenAI-Compatible Gateway (including Hilinkup)
  const defaultBase = ai.provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
  const rawBase = (ai.baseUrl || defaultBase).replace(/\/+$/, '');
  const endpoint = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
  const model = ai.model || (ai.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const isReasoningModel =
    model.includes('deepseek-v4') ||
    model.includes('reasoner') ||
    model.includes('flash-1017') ||
    /\bo1\b|\bo3\b|\br1\b/i.test(model);

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  if (img) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: currentText },
        { type: 'image_url', image_url: { url: imageDataUrl!, detail: 'high' } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: currentText });
  }

  const payload: Record<string, unknown> = {
    model,
    max_tokens: isReasoningModel ? Math.max(ai.maxTokens || 2600, 2600) : Math.max(ai.maxTokens || 2048, 2048),
    messages,
  };
  if (!isReasoningModel) {
    payload.temperature = ai.temperature ?? 0.35;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(40_000),
  });
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `AI Gateway HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning_content || '';
}

function buildDedicatedSystemPrompt(hasImage: boolean, langHint: 'fa' | 'en'): string {
  const creatorBlock =
    `سازنده و بنیان‌گذار پلتفرم دلارینو (Dollarino): **آوید کیا (Avid Kiya)**\n` +
    `• تلگرام سازنده: @avidkiya (https://t.me/avidkiya)\n` +
    `• اینستاگرام سازنده: @avid_kiya (https://instagram.com/avid_kiya)\n` +
    `• توییتر (X) سازنده: @avid_kiya (https://x.com/avid_kiya)\n` +
    `هر زمان کاربر درباره سازنده، مالک، طراح یا توسعه‌دهنده پروژه سوال کرد، با افتخار نام آوید کیا و آیدی‌های @avidkiya (تلگرام) و @avid_kiya (اینستاگرام و توییتر) را ذکر کن.`;

  if (langHint === 'en') {
    return (
      `You are **Dollarino Dedicated AI**, an advanced, versatile, human-friendly AI assistant inside the Dollarino Quant & Web3 Trading Platform.\n` +
      `Creator & Founder of Dollarino: **Avid Kiya (آوید کیا)** — Telegram: @avidkiya | Instagram & X (Twitter): @avid_kiya.\n\n` +
      `Capabilities & Behavior:\n` +
      `- Act just like a flagship general-purpose AI assistant (ChatGPT / Claude / Gemini): answer general questions, coding (Pine Script, Python, TypeScript), market analysis, risk management, Web3/DEX insights, and Dollarino guidance clearly and naturally.\n` +
      (hasImage
        ? `- The user attached a chart or screenshot! Carefully inspect all visible candles, timeframe, price levels, indicators, market structure (BOS/CHoCH), liquidity sweeps, order blocks, support/resistance, and trend.\n` +
          `- Provide a structured, actionable technical breakdown plus a clear **Trading Setup** (Direction: LONG or SHORT, Entry Zone, Stop Loss, TP1, TP2, TP3, Leverage suggestion, Risk:Reward, and Invalidation).\n` +
          `- Whenever you propose a concrete trade setup, append at the very end a machine-readable block wrapped strictly like:\n` +
          `<<<SETUP_JSON>>>{"symbol":"BTCUSDT","direction":"LONG","timeframe":"15m","entry":"92000","stopLoss":"90500","tp1":"93500","tp2":"95000","tp3":"96800","leverage":8,"rrRatio":"1:2.2","confidence":80,"note":"Support bounce"}<<<END_SETUP_JSON>>>\n`
        : `- If the user asks for a trading setup on a symbol, provide Entry, Stop Loss, TP1/TP2/TP3, Risk:Reward, and optionally append <<<SETUP_JSON>>>...<<<END_SETUP_JSON>>>.\n`) +
      `- Never invent exact chart prices you cannot see or claim a trade is guaranteed.`
    );
  }

  return (
    `شما **هوش مصنوعی اختصاصی دلارینو (Dollarino Dedicated AI)** هستید؛ یک دستیار هوشمند همه‌فن‌حریف، دقیق، صمیمی و حرفه‌ای در قلب پلتفرم معاملاتی دلارینو.\n` +
    `${creatorBlock}\n\n` +
    `رفتار و وظایف شما:\n` +
    `۱. دقیقاً مثل پیشرفته‌ترین هوش‌های مصنوعی دنیا (مانند ChatGPT، Claude و Gemini) با کاربر رفتار کن: در هر موضوعی از تحلیل بازار کریپتو و فارکس گرفته تا نوشتن استراتژی Pine Script / پایتون، مدیریت ریسک، اقتصاد، برنامه‌نویسی، سوال‌های روزمره و راهنمای امکانات دلارینو (Toobit، Bitunix، KCEX، Trust Wallet، رادار DEX و کپی‌ترید) کامل، منظم و روان به فارسی پاسخ بده.\n` +
    (hasImage
      ? `۲. کاربر **تصویر چارت / اسکرین‌شات** فرستاده است! تمام جزئیات قابل مشاهده در عکس شامل تایم‌فریم، روند غالب، ساختار بازار (BOS/CHoCH)، سطوح کلیدی حمایت و مقاومت، نقدینگی و اردربلاک، الگوی کندل‌ها و اندیکاتورها را با دقت بالا تحلیل کن.\n` +
        `۳. در ادامه حتماً یک **ستاپ معاملاتی شفاف و حرفه‌ای** بده شامل:\n` +
        `   • جهت معامله (LONG / SHORT یا صبر برای تایید)\n` +
        `   • محدوده ورود (Entry)\n` +
        `   • حد ضرر قطعی (Stop Loss)\n` +
        `   • سه تارگت مرحله‌ای سود (TP1 / TP2 / TP3)\n` +
        `   • نسبت ریسک به ریوارد (R:R)، اهرم پیشنهادی منطقی و شرط ابطال سناریو.\n` +
        `۴. هر زمان ستاپ معاملاتی مشخصی پیشنهاد دادی، در انتهای پیام دقیقاً یک بلوک JSON ماشین‌خوان با این قالب بگذار (بدون هیچ متن اضافه بعد از تگ پایانی):\n` +
        `<<<SETUP_JSON>>>{"symbol":"BTCUSDT","direction":"LONG","timeframe":"15m","entry":"92000","stopLoss":"90500","tp1":"93500","tp2":"95000","tp3":"96800","leverage":8,"rrRatio":"1:2.2","confidence":80,"note":"خلاصه کوتاه"}<<<END_SETUP_JSON>>>\n`
      : `۲. اگر کاربر درباره تحلیل ارز یا ستاپ معاملاتی سوال کرد، می‌توانید تحلیل ساختار و نقاط ورود، SL و ۳ تارگت TP پیشنهاد دهید و در صورت دادن ستاپ عددی مشخص، بلوک <<<SETUP_JSON>>>{"symbol":"...","direction":"LONG","timeframe":"15m","entry":"...","stopLoss":"...","tp1":"...","tp2":"...","tp3":"...","leverage":5,"rrRatio":"1:2"}<<<END_SETUP_JSON>>> را در انتها بگذارید.\n`) +
    `۳. شفاف و صادق باش؛ ریسک بازار را همیشه یادآوری کن و هرگز وعده سود تضمینی نده.`
  );
}

export function extractChartSetupFromReply(rawReply: string): {
  cleanReply: string;
  setup: ExtractedChartSetup | null;
} {
  const match = rawReply.match(/<<<SETUP_JSON>>>([\s\S]*?)<<<END_SETUP_JSON>>>/);
  if (!match) {
    return { cleanReply: rawReply.trim(), setup: null };
  }
  const cleanReply = rawReply.replace(/<<<SETUP_JSON>>>[\s\S]*?<<<END_SETUP_JSON>>>/g, '').trim();
  try {
    const parsed = JSON.parse(match[1]!.trim()) as Partial<ExtractedChartSetup>;
    const dir = String(parsed.direction || '').toUpperCase();
    if ((dir === 'LONG' || dir === 'SHORT') && parsed.entry && parsed.stopLoss && parsed.tp1) {
      return {
        cleanReply,
        setup: {
          symbol: String(parsed.symbol || 'CHART').toUpperCase(),
          direction: dir,
          timeframe: parsed.timeframe ? String(parsed.timeframe) : undefined,
          entry: String(parsed.entry),
          stopLoss: String(parsed.stopLoss),
          tp1: String(parsed.tp1),
          tp2: parsed.tp2 ? String(parsed.tp2) : undefined,
          tp3: parsed.tp3 ? String(parsed.tp3) : undefined,
          leverage: parsed.leverage ? Number(parsed.leverage) : undefined,
          rrRatio: parsed.rrRatio ? String(parsed.rrRatio) : undefined,
          confidence: parsed.confidence ? Number(parsed.confidence) : undefined,
          note: parsed.note ? String(parsed.note) : undefined,
        },
      };
    }
  } catch {
    // Ignore malformed JSON tag, keep cleaned text
  }
  return { cleanReply, setup: null };
}

export async function runDedicatedAIChat(
  env: Env,
  params: {
    userId: string;
    sessionId?: string | null;
    modelId?: string | null;
    message: string;
    imageDataUrl?: string | null;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }
): Promise<AssistantChatResult & { sessionId: string }> {
  const rawMessage = (params.message || '').trim();
  const hasImage = Boolean(params.imageDataUrl && params.imageDataUrl.startsWith('data:image/'));
  const userText =
    rawMessage ||
    (hasImage
      ? 'لطفاً این تصویر چارت را به‌صورت کامل و حرفه‌ای تحلیل کن؛ روند، سطوح حمایت و مقاومت، ساختار بازار و یک ستاپ معاملاتی دقیق با نقطه ورود، حد ضرر، TP1/TP2/TP3 و نسبت ریسک به ریوارد پیشنهاد بده.'
      : 'سلام!');

  const isEn = !/[\u0600-\u06FF]/.test(userText) && /[a-zA-Z]{4,}/.test(userText) && !hasImage;

  // Ensure session
  let sessionId = (params.sessionId || '').trim();
  if (sessionId) {
    const own = await env.DB.prepare(`SELECT id FROM ai_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(sessionId, params.userId)
      .first<{ id: string }>()
      .catch(() => null);
    if (!own) sessionId = '';
  }
  if (!sessionId) {
    sessionId = randomId('aichat');
    const title = (hasImage ? `📊 ${userText}` : userText).slice(0, 48) || 'گفتگوی هوش مصنوعی';
    await env.DB.prepare(
      `INSERT INTO ai_chat_sessions (id, user_id, title, model_id) VALUES (?, ?, ?, ?)`
    )
      .bind(sessionId, params.userId, title, params.modelId || null)
      .run()
      .catch(() => {});
  }

  // Load recent conversation history from DB if not provided explicitly
  let history = params.history ?? [];
  if (!history.length) {
    const rows = await env.DB.prepare(
      `SELECT role, content FROM ai_chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10`
    )
      .bind(sessionId, params.userId)
      .all<{ role: 'user' | 'assistant'; content: string }>()
      .catch(() => ({ results: [] }));
    history = [...(rows.results ?? [])].reverse();
  }

  const { models } = await listSelectableAIModels(env, params.userId);
  let resolved = await resolveModelRecordById(env, params.userId, params.modelId);
  let visionFallbackNotice: string | undefined;

  // If image attached and selected model is text-only, auto-switch to first connected Vision model if one exists
  if (hasImage && resolved && !resolved.meta.supportsVision) {
    const visionCandidate = models.find((m) => m.supportsVision);
    if (visionCandidate) {
      const alt = await resolveModelRecordById(env, params.userId, visionCandidate.id);
      if (alt) {
        visionFallbackNotice = `مدل ${resolved.meta.label} فقط متنی بود؛ برای تحلیل تصویر چارت به‌صورت خودکار از مدل ویژن **${alt.meta.label}** استفاده شد.`;
        resolved = alt;
      }
    }
  }

  if (!resolved) {
    return {
      sessionId,
      reply: isEn
        ? 'No AI model is currently configured. Ask the platform admin to connect an AI engine or add your personal API key in Connections.'
        : 'در حال حاضر هیچ موتور هوش مصنوعی متصل نیست. لطفاً از مدیر پلتفرم بخواهید موتور AI را فعال کند یا کلید شخصی خود را در بخش اتصالات ثبت کنید.',
      modelId: 'none',
      modelLabel: 'غیرفعال',
      provider: 'openai_compatible',
      modelName: 'none',
      usedVision: false,
      setup: null,
    };
  }

  const systemPrompt = buildDedicatedSystemPrompt(hasImage, isEn ? 'en' : 'fa');
  let rawReply = '';
  let usedVision = false;

  try {
    if (hasImage) {
      try {
        rawReply = await callMultimodalChatAI(
          resolved.record,
          systemPrompt,
          history,
          userText,
          params.imageDataUrl
        );
        usedVision = true;
      } catch (visionErr) {
        const errMsg = visionErr instanceof Error ? visionErr.message : String(visionErr);
        // Try another available model if gateway rejected image format
        const otherVision = models.find((m) => m.id !== resolved!.meta.id && m.supportsVision);
        if (otherVision) {
          const alt = await resolveModelRecordById(env, params.userId, otherVision.id);
          if (alt) {
            rawReply = await callMultimodalChatAI(alt.record, systemPrompt, history, userText, params.imageDataUrl);
            visionFallbackNotice = `تحلیل تصویر با مدل **${alt.meta.label}** انجام شد.`;
            resolved = alt;
            usedVision = true;
          }
        }
        if (!rawReply) {
          // Graceful explanation + helpful text guidance if no Vision model is connected
          const textHint = await callBYOAI(
            resolved.record,
            buildDedicatedSystemPrompt(false, isEn ? 'en' : 'fa'),
            `کاربر یک تصویر چارت فرستاده با این پیام: "${userText}"\nاما مدل فعلی (${resolved.meta.model}) از پردازش مستقیم تصویر پشتیبانی نمی‌کند (پیام گیت‌وی: ${errMsg.slice(0, 120)}).\nلطفاً صمیمی توضیح بده برای تحلیل خودکار تصویر چارت، باید یک مدل دارای Vision (مثل GPT-4o، Gemini 2.0 Flash یا Claude 3.5 Sonnet) در بخش اتصالات/پنل ادمین فعال یا انتخاب شود، و اگر کاربر نماد/تایم‌فریم/سطوح را متنی بنویسد همین الان ستاپ کامل را می‌دهی.`,
            { fastJson: false }
          ).catch(() => '');
          rawReply =
            textHint ||
            `📸 تصویر شما دریافت شد، اما مدل انتخاب‌شده فعلی (**${resolved.meta.label}**) از پردازش مستقیم تصویر (Vision) پشتیبانی نمی‌کند.\n\n` +
              `✅ **راه‌حل سریع:**\n` +
              `• از منوی انتخاب مدل در بالای صفحه یک مدل دارای قابلیت تصویر (👁️ مانند **GPT-4o**، **Gemini 2.0 Flash** یا **Claude 3.5 Sonnet**) انتخاب کنید یا کلید API آن را در بخش اتصالات اضافه کنید.\n` +
              `• یا همین الان نام ارز و تایم‌فریم چارت (مثلاً «BTC 15m» یا «SOL 1h») را بنویسید تا تحلیل کامل و ستاپ ارائه دهم.`;
        }
      }
    } else {
      rawReply = await callMultimodalChatAI(resolved.record, systemPrompt, history, userText, null);
    }
  } catch (err) {
    const errText = err instanceof Error ? err.message : String(err);
    rawReply = `⚠️ خطا در ارتباط با مدل ${resolved.meta.label}: ${errText}`;
  }

  const { cleanReply, setup } = extractChartSetupFromReply(rawReply);

  // Persist user & assistant messages to D1
  const userMsgId = randomId('aim');
  const botMsgId = randomId('aim');
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, has_image, model_id, model_label)
       VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`
    ).bind(userMsgId, sessionId, params.userId, userText.slice(0, 8000), hasImage ? 1 : 0, resolved.meta.id, resolved.meta.label),
    env.DB.prepare(
      `INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, has_image, model_id, model_label, setup_json)
       VALUES (?, ?, ?, 'assistant', ?, 0, ?, ?, ?)`
    ).bind(
      botMsgId,
      sessionId,
      params.userId,
      cleanReply.slice(0, 14000),
      resolved.meta.id,
      resolved.meta.label,
      setup ? JSON.stringify(setup) : null
    ),
    env.DB.prepare(`UPDATE ai_chat_sessions SET model_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(resolved.meta.id, sessionId),
  ]).catch(() => {});

  return {
    sessionId,
    reply: cleanReply,
    modelId: resolved.meta.id,
    modelLabel: resolved.meta.label,
    provider: resolved.meta.provider,
    modelName: resolved.meta.model,
    usedVision,
    visionFallbackNotice,
    setup,
  };
}
