import {
  evaluateCustomStrategy,
  runBacktest,
  type Timeframe,
  type VisualRuleCondition,
  type VisualStrategyDefinition,
} from '@dollarino/core';
import { Hono } from 'hono';
import { callMultimodalChatAI } from '../ai/assistant.js';
import { callBYOAI, resolveAIEnsemble } from '../ai/providers.js';
import { requireAuth, type AppVariables } from '../auth.js';
import { randomId } from '../crypto.js';
import { toggleTradingEngine } from '../engine/exclusive-engine.js';
import { logAudit } from '../engine/executor.js';
import type { Env } from '../env.js';
import { resolveUserExchangeAdapter } from '../exchanges/factory.js';
import { requirePaidEntitlement, resolveUserEntitlement } from './subscriptions.js';

export interface TrainedAIRules {
  style: 'SCALP' | 'SWING' | 'TREND' | 'HYBRID';
  timeframe: Timeframe;
  directionMode: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
  symbols: string[];
  indicators: string[];
  rsiOversold: number;
  rsiOverbought: number;
  emaFast: number;
  emaSlow: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxLeverage: number;
  riskNotes: string[];
}

export const DEFAULT_TRAINED_RULES: TrainedAIRules = {
  style: 'TREND',
  timeframe: '15m',
  directionMode: 'BOTH',
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  indicators: ['EMA_CROSS', 'RSI'],
  rsiOversold: 35,
  rsiOverbought: 65,
  emaFast: 9,
  emaSlow: 21,
  stopLossPct: 1.8,
  takeProfitPct: 4.5,
  maxLeverage: 5,
  riskNotes: [],
};

function parseRulesJson(raw: string | null | undefined): TrainedAIRules {
  if (!raw) return { ...DEFAULT_TRAINED_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<TrainedAIRules>;
    return {
      ...DEFAULT_TRAINED_RULES,
      ...parsed,
      symbols: Array.isArray(parsed.symbols) && parsed.symbols.length ? parsed.symbols : DEFAULT_TRAINED_RULES.symbols,
      indicators: Array.isArray(parsed.indicators) && parsed.indicators.length ? parsed.indicators : DEFAULT_TRAINED_RULES.indicators,
      riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes : [],
    };
  } catch {
    return { ...DEFAULT_TRAINED_RULES };
  }
}

export function extractRulesFromConversation(message: string, current: TrainedAIRules): {
  next: TrainedAIRules;
  learnedHighlights: string[];
} {
  const txt = message.trim();
  const lower = txt.toLowerCase();
  const next: TrainedAIRules = {
    ...current,
    symbols: [...current.symbols],
    indicators: [...current.indicators],
    riskNotes: [...current.riskNotes],
  };
  const highlights: string[] = [];

  // Timeframe extraction (Persian & English)
  const tfMatches: Array<[RegExp, Timeframe]> = [
    [/(?:\b1m\b|یک\s*دقیق|1\s*دقیق)/i, '1m'],
    [/(?:\b5m\b|پنج\s*دقیق|5\s*دقیق)/i, '5m'],
    [/(?:\b15m\b|پانزده\s*دقیق|15\s*دقیق)/i, '15m'],
    [/(?:\b30m\b|سی\s*دقیق|30\s*دقیق)/i, '30m'],
    [/(?:\b1h\b|یک\s*ساعت|1\s*ساعت)/i, '1h'],
    [/(?:\b4h\b|چهار\s*ساعت|4\s*ساعت)/i, '4h'],
    [/(?:\b1d\b|روزانه)/i, '1d'],
  ];
  for (const [re, tf] of tfMatches) {
    if (re.test(txt)) {
      next.timeframe = tf;
      highlights.push(`تایم‌فریم ${tf}`);
      break;
    }
  }

  // Style extraction
  if (/(?:اسکلپ|scalp)/i.test(txt)) {
    next.style = 'SCALP';
    highlights.push('سبک اسکلپ سریع');
  } else if (/(?:سوئینگ|سویینگ|swing)/i.test(txt)) {
    next.style = 'SWING';
    highlights.push('سبک سوئینگ میان‌مدت');
  } else if (/(?:روند|trend|پرایس\s*اکشن)/i.test(txt)) {
    next.style = 'TREND';
    highlights.push('سبک روند و پرایس‌اکشن');
  }

  // Direction bias
  if (/(?:فقط\s*لانگ|فقط\s*خرید|only\s*long|long\s*only)/i.test(txt)) {
    next.directionMode = 'LONG_ONLY';
    highlights.push('جهت فقط LONG');
  } else if (/(?:فقط\s*شورت|فقط\s*فروش|only\s*short|short\s*only)/i.test(txt)) {
    next.directionMode = 'SHORT_ONLY';
    highlights.push('جهت فقط SHORT');
  } else if (/(?:دو\s*طرفه|هردو|هم\s*لانگ\s*هم\s*شورت|both)/i.test(txt)) {
    next.directionMode = 'BOTH';
    highlights.push('معامله دوطرفه (Long + Short)');
  }

  // Symbols extraction
  const knownCoins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'TON', 'LINK', 'SUI', 'PEPE'];
  const mentionedCoins = knownCoins.filter((c) => new RegExp(`\\b${c}(?:USDT)?\\b`, 'i').test(txt));
  if (mentionedCoins.length > 0) {
    next.symbols = Array.from(new Set(mentionedCoins.map((c) => `${c}USDT`)));
    highlights.push(`ارزها: ${next.symbols.join('، ')}`);
  }

  // Indicators extraction
  const foundInds: string[] = [];
  if (/rsi|آر\s*اس\s*آی/i.test(txt)) foundInds.push('RSI');
  if (/ema|میانگین\s*متحرک|مووینگ/i.test(txt)) foundInds.push('EMA_CROSS');
  if (/macd|مکدی/i.test(txt)) foundInds.push('MACD');
  if (/bollinger|بولینگر|\bbb\b/i.test(txt)) foundInds.push('BOLLINGER');
  if (/supertrend|سوپر\s*ترند/i.test(txt)) foundInds.push('SUPERTREND');
  if (/volume|حجم/i.test(txt)) foundInds.push('VOLUME');
  if (foundInds.length > 0) {
    next.indicators = Array.from(new Set(foundInds));
    highlights.push(`اندیکاتورها: ${next.indicators.join(' + ')}`);
  }

  // EMA periods (e.g. EMA 9/21 or 20 and 50)
  const emaPair = txt.match(/ema\s*(\d{1,3})\s*[/و,\-\s]+\s*(\d{1,3})/i);
  if (emaPair) {
    const a = Math.max(3, Math.min(200, Number(emaPair[1])));
    const b = Math.max(a + 2, Math.min(250, Number(emaPair[2])));
    next.emaFast = a;
    next.emaSlow = b;
    highlights.push(`EMA ${a}/${b}`);
  }

  // RSI thresholds
  const rsiUnder = txt.match(/rsi[^0-9]{0,20}(?:زیر|پایین|کمتر|<|below|under)\s*(\d{2})/i);
  if (rsiUnder) {
    next.rsiOversold = Math.max(15, Math.min(48, Number(rsiUnder[1])));
    highlights.push(`اشباع فروش RSI < ${next.rsiOversold}`);
  }
  const rsiAbove = txt.match(/rsi[^0-9]{0,20}(?:بالا|بیشتر|>|above|over)\s*(\d{2})/i);
  if (rsiAbove) {
    next.rsiOverbought = Math.max(52, Math.min(85, Number(rsiAbove[1])));
    highlights.push(`اشباع خرید RSI > ${next.rsiOverbought}`);
  }

  // Leverage
  const levMatch = txt.match(/(?:اهرم|لوریج|leverage)\s*[:=]?\s*(\d{1,2})x?/i) ?? lower.match(/\b(\d{1,2})x\b/);
  if (levMatch) {
    next.maxLeverage = Math.max(1, Math.min(25, Number(levMatch[1])));
    highlights.push(`اهرم حداکثر ${next.maxLeverage}x`);
  }

  // Stop Loss %
  const slMatch = txt.match(/(?:حد\s*ضرر|استاپ(?:\s*لاس)?|stop\s*loss|\bsl\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (slMatch) {
    const val = Number(slMatch[1]);
    if (val >= 0.3 && val <= 15) {
      next.stopLossPct = val;
      highlights.push(`حد ضرر ${val}%`);
    }
  }

  // Take Profit %
  const tpMatch = txt.match(/(?:حد\s*سود|تیک\s*پروفیت|تارگت|take\s*profit|\btp\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (tpMatch) {
    const val = Number(tpMatch[1]);
    if (val >= 0.5 && val <= 40) {
      next.takeProfitPct = val;
      highlights.push(`حد سود ${val}%`);
    }
  }

  if (txt.length >= 6) {
    next.riskNotes = [...current.riskNotes.slice(-6), txt.slice(0, 220)];
  }

  return { next, learnedHighlights: highlights };
}

export function compileTrainedRulesToVisualDef(
  rules: TrainedAIRules,
  agentName = 'هوش مصنوعی شخصی من'
): VisualStrategyDefinition {
  const longRules: VisualRuleCondition[] = [];
  const shortRules: VisualRuleCondition[] = [];

  if (rules.indicators.includes('EMA_CROSS') || rules.indicators.length === 0) {
    longRules.push({ id: 'ai_l_ema', kind: 'EMA_CROSS_ABOVE', param1: rules.emaFast, param2: rules.emaSlow });
    shortRules.push({ id: 'ai_s_ema', kind: 'EMA_CROSS_BELOW', param1: rules.emaFast, param2: rules.emaSlow });
  }
  if (rules.indicators.includes('RSI')) {
    longRules.push({ id: 'ai_l_rsi', kind: 'RSI_ABOVE', param1: Math.min(48, rules.rsiOversold + 8) });
    shortRules.push({ id: 'ai_s_rsi', kind: 'RSI_BELOW', param1: Math.max(52, rules.rsiOverbought - 8) });
  }
  if (rules.indicators.includes('MACD')) {
    longRules.push({ id: 'ai_l_macd', kind: 'MACD_CROSS_UP', param1: 12, param2: 26 });
    shortRules.push({ id: 'ai_s_macd', kind: 'MACD_CROSS_DOWN', param1: 12, param2: 26 });
  }
  if (rules.indicators.includes('BOLLINGER')) {
    longRules.push({ id: 'ai_l_bb', kind: 'BB_LOWER_TOUCH', param1: 20, param2: 2 });
    shortRules.push({ id: 'ai_s_bb', kind: 'BB_UPPER_TOUCH', param1: 20, param2: 2 });
  }
  if (rules.indicators.includes('SUPERTREND')) {
    longRules.push({ id: 'ai_l_st', kind: 'SUPERTREND_BULL', param1: 10, param2: 3 });
    shortRules.push({ id: 'ai_s_st', kind: 'SUPERTREND_BEAR', param1: 10, param2: 3 });
  }
  if (rules.indicators.includes('VOLUME')) {
    longRules.push({ id: 'ai_l_vol', kind: 'VOLUME_SPIKE', param1: 1.2 });
    shortRules.push({ id: 'ai_s_vol', kind: 'VOLUME_SPIKE', param1: 1.2 });
  }

  const rr = Math.max(1.2, rules.takeProfitPct / Math.max(0.4, rules.stopLossPct));

  return {
    name: agentName,
    logic: longRules.length > 2 ? 'ANY' : 'ALL',
    slAtrMult: Math.max(1.0, Math.min(3.5, rules.stopLossPct * 0.9)),
    tp1R: Math.max(1.0, Number((rr * 0.5).toFixed(2))),
    tp2R: Math.max(1.8, Number((rr * 0.85).toFixed(2))),
    tp3R: Math.max(2.5, Number((rr * 1.2).toFixed(2))),
    longRules: rules.directionMode === 'SHORT_ONLY' ? [] : longRules,
    shortRules: rules.directionMode === 'LONG_ONLY' ? [] : shortRules,
  };
}

async function ensureAgent(db: D1Database, userId: string) {
  let agent = await db.prepare(`SELECT * FROM user_ai_agents WHERE user_id = ?`).bind(userId).first<{
    id: string;
    user_id: string;
    name: string;
    training_notes: string;
    system_rules_json: string;
    is_active_for_trading: number;
    last_trained_at: string | null;
    updated_at: string;
  }>();

  if (!agent) {
    const id = randomId('myai');
    await db.prepare(
      `INSERT INTO user_ai_agents (id, user_id, name, training_notes, system_rules_json, is_active_for_trading)
       VALUES (?, ?, 'هوش مصنوعی شخصی من', '', ?, 0)`
    ).bind(id, userId, JSON.stringify(DEFAULT_TRAINED_RULES)).run();

    const welcomeId = randomId('msg');
    await db.prepare(
      `INSERT INTO user_ai_messages (id, user_id, role, content)
       VALUES (?, ?, 'assistant', ?)`
    ).bind(
      welcomeId,
      userId,
      'سلام! من «هوش مصنوعی خام» شما هستم و از صفر آماده یادگیری از خودتان هستم.\nاستراتژی، تایم‌فریم، ارزها، اندیکاتورها (مثل RSI، EMA، MACD یا سوپرترند)، حد ضرر و حد سود دلخواهتان را برایم بنویسید تا فوراً یاد بگیرم، روی چارت تست کنم و برایتان ترید کنم!'
    ).run();

    agent = await db.prepare(`SELECT * FROM user_ai_agents WHERE user_id = ?`).bind(userId).first();
  }
  return agent!;
}

export const myAiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
myAiRoutes.use('*', requireAuth);

myAiRoutes.get('/', async (c) => {
  const user = c.get('user');
  const [agent, messagesRes, entitlement] = await Promise.all([
    ensureAgent(c.env.DB, user.id),
    c.env.DB.prepare(
      `SELECT id, role, content, extracted_rules_json, created_at FROM user_ai_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 80`
    ).bind(user.id).all().catch(() => ({ results: [] })),
    resolveUserEntitlement(c.env.DB, user),
  ]);

  return c.json({
    agent: {
      ...agent,
      rules: parseRulesJson(agent.system_rules_json),
    },
    messages: messagesRes.results,
    hasActivePlan: entitlement.hasPaidPlan || !entitlement.subscriptionRequired,
  });
});

myAiRoutes.post('/chat', async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ message?: string; agentName?: string; imageDataUrl?: string | null }>()
    .catch(() => ({} as { message?: string; agentName?: string; imageDataUrl?: string | null }));
  const imageDataUrl =
    body.imageDataUrl && String(body.imageDataUrl).startsWith('data:image/') && String(body.imageDataUrl).length < 5_000_000
      ? String(body.imageDataUrl)
      : null;
  const msgText = String(body.message || '').trim() || (imageDataUrl ? 'لطفاً سبک و ستاپ این تصویر چارت را به قوانین من اضافه کن.' : '');
  if (!msgText && !imageDataUrl) return c.json({ error: 'پیام یا تصویر آموزشی نمی‌تواند خالی باشد.' }, 400);

  const agent = await ensureAgent(c.env.DB, user.id);
  const currentRules = parseRulesJson(agent.system_rules_json);
  const { next, learnedHighlights } = extractRulesFromConversation(msgText, currentRules);

  const ensemble = await resolveAIEnsemble(c.env, user.id).catch(() => ({ engines: [] }));
  let replyText = '';

  if (ensemble.engines.length > 0) {
    try {
      const extractorSys = [
        'You are the user’s blank, personal trainable AI trading assistant inside Dollarino ("هوش مصنوعی من").',
        'Analyze the user’s instructions (and optional chart/setup screenshot) and return a warm concise reply + updated JSON rules at the very end wrapped in <RULES_JSON>{...}</RULES_JSON>.',
        'Allowed JSON keys: style ("SCALP"|"SWING"|"TREND"|"HYBRID"), timeframe ("1m"|"5m"|"15m"|"30m"|"1h"|"4h"|"1d"), directionMode ("BOTH"|"LONG_ONLY"|"SHORT_ONLY"), symbols (string[] like ["BTCUSDT","ETHUSDT"]), indicators (subset of ["EMA_CROSS","RSI","MACD","BOLLINGER","SUPERTREND","VOLUME"]), rsiOversold (10-45), rsiOverbought (55-90), emaFast (3-50), emaSlow (10-200), stopLossPct (0.3-15), takeProfitPct (0.5-40), maxLeverage (1-50).',
        `Current rules baseline: ${JSON.stringify(next)}`,
      ].join('\n');
      const rawReply = imageDataUrl
        ? await callMultimodalChatAI(ensemble.engines[0]!, extractorSys, [], msgText, imageDataUrl)
        : await callBYOAI(ensemble.engines[0]!, extractorSys, msgText, { fastJson: false });

      const jsonMatch = rawReply.match(/<RULES_JSON>([\s\S]*?)<\/RULES_JSON>/i);
      if (jsonMatch?.[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim()) as Partial<TrainedAIRules>;
          if (parsed.timeframe) next.timeframe = parsed.timeframe;
          if (parsed.style) next.style = parsed.style;
          if (parsed.directionMode) next.directionMode = parsed.directionMode;
          if (Array.isArray(parsed.symbols) && parsed.symbols.length) {
            next.symbols = parsed.symbols.map((s) => String(s).toUpperCase()).slice(0, 12);
          }
          if (Array.isArray(parsed.indicators) && parsed.indicators.length) {
            const validInd = parsed.indicators.filter((x) =>
              ['EMA_CROSS', 'RSI', 'MACD', 'BOLLINGER', 'SUPERTREND', 'VOLUME'].includes(String(x))
            );
            if (validInd.length) next.indicators = Array.from(new Set(validInd));
          }
          if (typeof parsed.stopLossPct === 'number' && parsed.stopLossPct >= 0.3 && parsed.stopLossPct <= 15) {
            next.stopLossPct = Number(parsed.stopLossPct);
          }
          if (typeof parsed.takeProfitPct === 'number' && parsed.takeProfitPct >= 0.5 && parsed.takeProfitPct <= 40) {
            next.takeProfitPct = Number(parsed.takeProfitPct);
          }
          if (typeof parsed.maxLeverage === 'number' && parsed.maxLeverage >= 1 && parsed.maxLeverage <= 50) {
            next.maxLeverage = Math.round(parsed.maxLeverage);
          }
          if (typeof parsed.emaFast === 'number' && parsed.emaFast >= 3 && parsed.emaFast <= 100) {
            next.emaFast = Math.round(parsed.emaFast);
          }
          if (typeof parsed.emaSlow === 'number' && parsed.emaSlow >= 10 && parsed.emaSlow <= 250) {
            next.emaSlow = Math.round(parsed.emaSlow);
          }
          if (typeof parsed.rsiOversold === 'number' && parsed.rsiOversold >= 10 && parsed.rsiOversold <= 48) {
            next.rsiOversold = Math.round(parsed.rsiOversold);
          }
          if (typeof parsed.rsiOverbought === 'number' && parsed.rsiOverbought >= 52 && parsed.rsiOverbought <= 90) {
            next.rsiOverbought = Math.round(parsed.rsiOverbought);
          }
        } catch {
          /* keep regex extraction */
        }
      }
      replyText = rawReply.replace(/<RULES_JSON>[\s\S]*?<\/RULES_JSON>/gi, '').trim();
    } catch {
      replyText = '';
    }
  }

  const nextNotes = `${agent.training_notes ? `${agent.training_notes}\n` : ''}• ${msgText}`.slice(-4000);
  const nextName = body.agentName?.trim() ? body.agentName.trim().slice(0, 60) : agent.name;

  await c.env.DB.prepare(
    `UPDATE user_ai_agents
     SET name = ?, training_notes = ?, system_rules_json = ?, last_trained_at = datetime('now'), updated_at = datetime('now')
     WHERE user_id = ?`
  ).bind(nextName, nextNotes, JSON.stringify(next), user.id).run();

  await c.env.DB.prepare(
    `INSERT INTO user_ai_messages (id, user_id, role, content) VALUES (?, ?, 'user', ?)`
  ).bind(randomId('msg'), user.id, imageDataUrl ? `📷 [تصویر ستاپ] ${msgText}` : msgText).run();

  if (!replyText.trim()) {
    const summaryParts = [
      `تایم‌فریم: ${next.timeframe}`,
      `سبک: ${next.style}`,
      `ارزها: ${next.symbols.join('، ')}`,
      `اندیکاتورها: ${next.indicators.join(' + ')}`,
      `حد ضرر ${next.stopLossPct}% · حد سود ${next.takeProfitPct}% · اهرم ${next.maxLeverage}x`,
    ];
    replyText = learnedHighlights.length > 0
      ? `✅ عالی! این موارد را یاد گرفتم و در مغز معاملاتی‌ام ثبت کردم:\n• ${learnedHighlights.join('\n• ')}\n\n📌 پروفایل فعلی استراتژی من:\n${summaryParts.join(' | ')}\n\nمی‌توانید جزئیات بیشتری یاد بدهید، روی بازار تست بگیرید یا دکمه «فعال‌سازی ترید با هوش مصنوعی من» را بزنید.`
      : `🧠 پیام شما به عنوان دستورالعمل شخصی در حافظه‌ام ثبت شد!\nبرای اینکه دقیق‌تر معامله کنم، می‌توانید تایم‌فریم (مثلاً 15m)، اندیکاتورها (RSI / EMA / MACD)، حد ضرر و سود یا ارزها را هم مشخص کنید.\n\n📌 وضعیت فعلی: ${summaryParts.join(' | ')}`;
  }

  const assistantMsgId = randomId('msg');
  await c.env.DB.prepare(
    `INSERT INTO user_ai_messages (id, user_id, role, content, extracted_rules_json) VALUES (?, ?, 'assistant', ?, ?)`
  ).bind(assistantMsgId, user.id, replyText, JSON.stringify(next)).run();

  return c.json({
    ok: true,
    reply: replyText,
    rules: next,
    learnedHighlights,
  });
});

myAiRoutes.post('/test', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ symbol?: string }>().catch(() => ({} as { symbol?: string }));
  const agent = await ensureAgent(c.env.DB, user.id);
  const rules = parseRulesJson(agent.system_rules_json);
  const symbol = (body.symbol || rules.symbols[0] || 'BTCUSDT').toUpperCase();
  const tf = rules.timeframe || '15m';

  const { adapter } = await resolveUserExchangeAdapter(c.env, user.id, 'paper');
  const candles = await adapter.getKlines(symbol, tf, 320);
  const visualDef = compileTrainedRulesToVisualDef(rules, agent.name);
  const evalRes = evaluateCustomStrategy('visual', JSON.stringify(visualDef), candles, tf);

  const bt = candles.length >= 40
    ? runBacktest(candles, [], {
        symbol,
        strategyKey: 'my_custom_ai',
        timeframe: tf,
        initialBalance: 10000,
        marginPct: 10,
        leverage: rules.maxLeverage,
        tp1ClosePct: 40,
        tp2ClosePct: 30,
        tp3ClosePct: 30,
        autoBreakevenOnTp1: true,
        moveSlToTp1OnTp2: true,
        customSignals: evalRes.signals,
      })
    : null;

  return c.json({
    ok: true,
    symbol,
    timeframe: tf,
    latestSignal: evalRes.latestSignal,
    markersCount: evalRes.markers.length,
    backtest: bt ? { metrics: bt.metrics, equityCurve: bt.equityCurve } : null,
  });
});

myAiRoutes.post('/activate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ active?: boolean; startBot?: boolean }>().catch(
    () => ({} as { active?: boolean; startBot?: boolean })
  );
  const active = body.active !== false;

  if (active) {
    const gate = await requirePaidEntitlement(c.env.DB, user);
    if (!gate.ok) {
      return c.json({ ok: false, error: gate.error, code: 'SUBSCRIPTION_REQUIRED' }, 402);
    }
  }

  const agent = await ensureAgent(c.env.DB, user.id);
  const rules = parseRulesJson(agent.system_rules_json);

  if (active) {
    // V11.0 Multi-Engine: enable MY_AI concurrently without disabling Copy-Trade, Central AI, Strategy, or Sniper
    await toggleTradingEngine(c.env.DB, user.id, 'MY_AI', true, {
      auditSource: 'my_ai_activate',
    });

    const cfg = await c.env.DB.prepare(`SELECT trading_mode FROM bot_configs WHERE user_id = ?`)
      .bind(user.id).first<{ trading_mode: string }>();
    const nextState = body.startBot ? (cfg?.trading_mode === 'LIVE' ? 'RUNNING_LIVE' : 'RUNNING_PAPER') : undefined;
    await c.env.DB.prepare(
      `UPDATE bot_configs
       SET entry_timeframe = ?,
           max_leverage = ?,
           direction_mode = ?,
           watchlist_json = ?,
           symbol = ?,
           ${nextState ? 'bot_state = ?,' : ''}
           updated_at = datetime('now')
       WHERE user_id = ?`
    ).bind(
      ...(nextState
        ? [rules.timeframe, rules.maxLeverage, rules.directionMode, JSON.stringify(rules.symbols), rules.symbols[0] || 'BTCUSDT', nextState, user.id]
        : [rules.timeframe, rules.maxLeverage, rules.directionMode, JSON.stringify(rules.symbols), rules.symbols[0] || 'BTCUSDT', user.id])
    ).run();

    if (body.startBot && c.env.TRADING_BOT_DO) {
      const id = c.env.TRADING_BOT_DO.idFromName('global-coordinator');
      const stub = c.env.TRADING_BOT_DO.get(id);
      await stub.fetch(`https://do.internal/tick?userId=${encodeURIComponent(user.id)}`).catch(() => {});
    }
    await logAudit(c.env.DB, user.id, 'AI_AGENT', 'INFO', `Personal trained AI "${agent.name}" activated (${rules.timeframe}, ${rules.symbols.join(', ')})`);
  } else {
    await toggleTradingEngine(c.env.DB, user.id, 'MY_AI', false, {
      auditSource: 'my_ai_deactivate',
    });
  }

  return c.json({ ok: true, isActiveForTrading: active });
});

myAiRoutes.post('/reset', async (c) => {
  const user = c.get('user');
  await ensureAgent(c.env.DB, user.id);
  await c.env.DB.prepare(
    `UPDATE user_ai_agents
     SET training_notes = '', system_rules_json = ?, is_active_for_trading = 0, last_trained_at = NULL, updated_at = datetime('now')
     WHERE user_id = ?`
  ).bind(JSON.stringify(DEFAULT_TRAINED_RULES), user.id).run();
  await c.env.DB.prepare(`DELETE FROM user_ai_messages WHERE user_id = ?`).bind(user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO user_ai_messages (id, user_id, role, content) VALUES (?, ?, 'assistant', ?)`
  ).bind(
    randomId('msg'),
    user.id,
    '🔄 حافظه هوش مصنوعی خام ریست شد! حالا می‌توانید استراتژی جدید خودتان را از صفر به من آموزش دهید.'
  ).run();

  return c.json({ ok: true, rules: DEFAULT_TRAINED_RULES });
});

function buildPineFromRules(title: string, r: TrainedAIRules): string {
  const fast = Math.max(3, Math.min(50, Number(r.emaFast || 9)));
  const slow = Math.max(fast + 2, Math.min(200, Number(r.emaSlow || 21)));
  const rsiLow = Math.max(15, Math.min(45, Number(r.rsiOversold || 35)));
  const rsiHigh = Math.max(55, Math.min(85, Number(r.rsiOverbought || 65)));
  const useMacd = r.indicators.includes('MACD');
  return [
    `//@version=5`,
    `strategy("${title.replace(/"/g, '')}", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)`,
    `emaFast = ta.ema(close, ${fast})`,
    `emaSlow = ta.ema(close, ${slow})`,
    `rsiVal = ta.rsi(close, 14)`,
    ...(useMacd ? [`[macdLine, signalLine, _] = ta.macd(close, 12, 26, 9)`] : []),
    `longCond = ta.crossover(emaFast, emaSlow) or (close > emaSlow and rsiVal < ${rsiLow})${useMacd ? ' and macdLine > signalLine' : ''}`,
    `shortCond = ta.crossunder(emaFast, emaSlow) or (close < emaSlow and rsiVal > ${rsiHigh})${useMacd ? ' and macdLine < signalLine' : ''}`,
    `plot(emaFast, color=color.green, title="EMA Fast")`,
    `plot(emaSlow, color=color.orange, title="EMA Slow")`,
    `if (longCond)`,
    `    strategy.entry("Long", strategy.long)`,
    `if (shortCond)`,
    `    strategy.entry("Short", strategy.short)`,
  ].join('\n');
}

function buildPythonFromRules(title: string, r: TrainedAIRules): string {
  const fast = Math.max(3, Math.min(50, Number(r.emaFast || 9)));
  const slow = Math.max(fast + 2, Math.min(200, Number(r.emaSlow || 21)));
  const rsiLow = Math.max(15, Math.min(45, Number(r.rsiOversold || 35)));
  const rsiHigh = Math.max(55, Math.min(85, Number(r.rsiOverbought || 65)));
  return [
    `# Dollarino Quant Strategy: ${title}`,
    `def generate_signal(df):`,
    `    df['ema_fast'] = df['close'].ewm(span=${fast}).mean()`,
    `    df['ema_slow'] = df['close'].ewm(span=${slow}).mean()`,
    `    rsi_val = df['rsi_14'].iloc[-1] if 'rsi_14' in df else 50`,
    `    if df['ema_fast'].iloc[-1] > df['ema_slow'].iloc[-1] and rsi_val <= ${rsiHigh}:`,
    `        return 'LONG'`,
    `    if df['ema_fast'].iloc[-1] < df['ema_slow'].iloc[-1] and rsi_val >= ${rsiLow}:`,
    `        return 'SHORT'`,
    `    return 'HOLD'`,
  ].join('\n');
}

myAiRoutes.post('/convert-strategy', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as {
    rawInput?: string;
    prompt?: string;
    targetMode?: 'visual' | 'pine' | 'python';
    targetLanguage?: 'visual' | 'pine' | 'python';
  };
  const rawInput = String(body.rawInput || body.prompt || '').trim();
  if (!rawInput) return c.json({ error: 'لطفاً ایده یا کد استراتژی خودتان را وارد کنید.' }, 400);
  const lang = body.targetLanguage || body.targetMode || 'pine';

  const { next } = extractRulesFromConversation(rawInput, { ...DEFAULT_TRAINED_RULES });
  let visualDef = compileTrainedRulesToVisualDef(next, 'AI Converted Strategy');
  let title = visualDef.name;
  let code =
    lang === 'python'
      ? buildPythonFromRules(title, next)
      : lang === 'visual'
        ? JSON.stringify(visualDef, null, 2)
        : buildPineFromRules(title, next);

  const ensemble = await resolveAIEnsemble(c.env, user.id).catch(() => ({ engines: [] }));
  if (ensemble.engines.length > 0) {
    try {
      const sys = [
        `Convert the user strategy idea or snippet into a valid Dollarino VisualStrategyDefinition JSON and clean ${lang} code.`,
        'Allowed rule kind values: EMA_CROSS_ABOVE, EMA_CROSS_BELOW, PRICE_ABOVE_EMA, PRICE_BELOW_EMA, RSI_BELOW, RSI_ABOVE, MACD_CROSS_UP, MACD_CROSS_DOWN, BB_LOWER_TOUCH, BB_UPPER_TOUCH, SUPERTREND_BULL, SUPERTREND_BEAR, VOLUME_SPIKE.',
        'Return STRICT JSON ONLY: {"name":"string","logic":"ALL"|"ANY","slAtrMult":1.8,"tp1R":1.4,"tp2R":2.5,"tp3R":3.8,"longRules":[{"id":"l1","kind":"...","param1":9,"param2":21}],"shortRules":[{"id":"s1","kind":"...","param1":9,"param2":21}],"code":"..."}',
      ].join('\n');
      const out = await callBYOAI(ensemble.engines[0]!, sys, rawInput.slice(0, 3500), { fastJson: true });
      const cleaned = out.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as Partial<VisualStrategyDefinition> & { code?: string };
      if (Array.isArray(parsed.longRules) || Array.isArray(parsed.shortRules)) {
        title = String(parsed.name || title).slice(0, 60);
        visualDef = {
          name: title,
          logic: parsed.logic === 'ANY' ? 'ANY' : 'ALL',
          slAtrMult: Number(parsed.slAtrMult || 1.8),
          tp1R: Number(parsed.tp1R || 1.4),
          tp2R: Number(parsed.tp2R || 2.5),
          tp3R: Number(parsed.tp3R || 3.8),
          longRules: Array.isArray(parsed.longRules) ? parsed.longRules.slice(0, 6) : visualDef.longRules,
          shortRules: Array.isArray(parsed.shortRules) ? parsed.shortRules.slice(0, 6) : visualDef.shortRules,
        };
      }
      if (typeof parsed.code === 'string' && parsed.code.trim().length > 20 && lang !== 'visual') {
        code = parsed.code.trim();
      } else if (lang === 'visual') {
        code = JSON.stringify(visualDef, null, 2);
      }
    } catch {
      /* fallback to deterministic extracted visualDef + code */
    }
  }

  return c.json({
    ok: true,
    title,
    language: lang,
    code,
    visualDef,
    summary: `استراتژی «${title}» (${lang.toUpperCase()}) با EMA ${next.emaFast}/${next.emaSlow} و RSI ${next.rsiOversold}/${next.rsiOverbought} تولید شد.`,
  });
});

