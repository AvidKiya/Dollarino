import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';
import { hashPassword, signJwt } from '../crypto.js';
import {
  extractJsonObjectFromLLM,
  resolveAnthropicMessagesEndpoint,
  resolveGatewayModelsEndpoint,
  resolveOpenAIChatEndpoint,
  runAutonomousAITrader,
  stripReasoningArtifacts,
} from '../ai/providers.js';
import { invalidateSettingsCache } from '../services/settings-cache.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;

const TEST_JWT_SECRET = 'test-jwt-secret-arena-upgrade-2026';
const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: TEST_JWT_SECRET,
    MASTER_ENCRYPTION_KEY: TEST_MASTER_KEY,
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === '-' && sql[i + 1] === '-' && !inSingle && !inDouble) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (sql[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function makeCandles(count: number, basePrice = 95000) {
  const out = [];
  const start = Date.now() - count * 15 * 60_000;
  for (let i = 0; i < count; i++) {
    const close = basePrice + i * 25;
    out.push({
      timestamp: start + i * 15 * 60_000,
      open: close - 18,
      high: close + 60,
      low: close - 55,
      close,
      volume: 1200 + i * 15,
    });
  }
  return out;
}

describe('Arena AI + DeepSeek Full Stack Upgrade Suite', () => {
  let ownerToken = '';
  let userToken = '';

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'arena-ai-upgrade-db' },
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const stmt of splitSqlStatements(raw)) {
        await db.prepare(stmt).run();
      }
    }

    const passHash = await hashPassword('StrongPass!2026');
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, profile_completed, must_change_credentials)
       VALUES ('u_owner', 'owner@dollarino.test', 'owner', ?, 'owner', 1, 0)`
    ).bind(passHash).run();
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, profile_completed, must_change_credentials, trust_wallet_address)
       VALUES ('u_trader', 'trader@dollarino.test', 'trader', ?, 'user', 1, 0, '0x1234567890abcdef1234567890abcdef12345678')`
    ).bind(passHash).run();

    await db.prepare(
      `INSERT INTO bot_configs (user_id, bot_state, trading_mode, strategy_key, symbol, entry_timeframe, webhook_secret)
       VALUES ('u_trader', 'RUNNING', 'PAPER', 'dollarino_v01', 'BTCUSDT', '15m', 'whsec_test_1234567890')`
    ).run();

    await db.prepare(
      `INSERT INTO trades (id, user_id, mode, market_type, exchange_provider, symbol, strategy_key, direction, status, entry_price, initial_quantity, remaining_quantity, margin_used, leverage, current_stop_loss, initial_stop_loss, tp1, tp2, tp3, client_id)
       VALUES ('tr_open_1', 'u_trader', 'PAPER', 'FUTURES', 'paper', 'BTCUSDT', 'dollarino_v01', 'LONG', 'OPEN', '94200', '0.01', '0.01', '100', 5, '93100', '93100', '95800', '97200', '99000', 'cli_open_1')`
    ).run();

    ownerToken = await signJwt({ sub: 'u_owner', role: 'owner', email: 'owner@dollarino.test', username: 'owner' }, TEST_JWT_SECRET);
    userToken = await signJwt({ sub: 'u_trader', role: 'user', email: 'trader@dollarino.test', username: 'trader' }, TEST_JWT_SECRET);
    invalidateSettingsCache(db);
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await mf.dispose();
  });

  it('normalizes Arena OpenAI, Arena Anthropic, and Models endpoints safely', () => {
    expect(resolveOpenAIChatEndpoint('https://api.arena.ai/v1')).toBe('https://api.arena.ai/v1/chat/completions');
    expect(resolveOpenAIChatEndpoint('https://api.arena.ai')).toBe('https://api.arena.ai/v1/chat/completions');
    expect(resolveAnthropicMessagesEndpoint('https://api.arena.ai')).toBe('https://api.arena.ai/v1/messages');
    expect(resolveAnthropicMessagesEndpoint('https://api.arena.ai/anthropic')).toBe('https://api.arena.ai/anthropic/v1/messages');
    expect(resolveGatewayModelsEndpoint('https://api.arena.ai')).toBe('https://api.arena.ai/v1/models');
    expect(resolveGatewayModelsEndpoint('https://api.arena.ai/v1')).toBe('https://api.arena.ai/v1/models');
    expect(() => resolveOpenAIChatEndpoint('http://127.0.0.1:8080/v1')).toThrow();
  });

  it('strips reasoning tags and extracts fenced/trailing-comma LLM JSON cleanly', () => {
    const raw = `<think>Evaluating RSI=61 and HTF BULLISH</think>\n\`\`\`json\n{"action":"LONG","confidence":84,"entry":95200,"stopLoss":93800,}\n\`\`\``;
    expect(stripReasoningArtifacts('<think>abc</think>Hello World')).toBe('Hello World');
    const parsed = extractJsonObjectFromLLM<{ action: string; confidence: number; entry: number }>(raw);
    expect(parsed).toEqual({
      action: 'LONG',
      confidence: 84,
      entry: 95200,
      stopLoss: 93800,
    });
  });

  it('configures DeepSeek + Arena AI via Admin Panel, discovers live models, and recovers 429 retries', async () => {
    const env = makeEnv();

    // Slot 1: DeepSeek Direct
    const r1 = await worker.fetch(
      new Request('https://dollarino.test/api/admin/ai-engines', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slotOrder: 1,
          provider: 'deepseek',
          label: 'DeepSeek V3 Chat',
          model: 'deepseek-chat',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk-deepseek-panel-entered',
          weight: 100,
        }),
      }),
      env
    );
    expect(r1.status).toBe(201);

    // Slot 2: Arena AI OpenAI-compatible (user entered from panel — zero hardcoded key)
    const r2 = await worker.fetch(
      new Request('https://dollarino.test/api/admin/ai-engines', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slotOrder: 2,
          provider: 'openai_compatible',
          label: 'Arena AI Router',
          model: 'coding-router-preview',
          baseUrl: 'https://api.arena.ai/v1',
          apiKey: 'sk-arena-panel-entered',
          weight: 100,
        }),
      }),
      env
    );
    expect(r2.status).toBe(201);

    // Slot 3: Arena AI Anthropic-compatible
    const r3 = await worker.fetch(
      new Request('https://dollarino.test/api/admin/ai-engines', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slotOrder: 3,
          provider: 'anthropic',
          label: 'Arena AI Anthropic',
          model: 'claude-sonnet-4-5',
          baseUrl: 'https://api.arena.ai',
          apiKey: 'sk-arena-anthropic-panel-entered',
          weight: 100,
        }),
      }),
      env
    );
    expect(r3.status).toBe(201);

    let arenaCalls = 0;
    let anthropicCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://api.arena.ai/v1/models') {
        expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer sk-arena-panel-entered');
        return new Response(
          JSON.stringify({
            data: [
              { id: 'coding-router-preview', owned_by: 'arena' },
              { id: 'claude-sonnet-4-5', owned_by: 'anthropic' },
              { id: 'deepseek/deepseek-v3.2', owned_by: 'deepseek' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === 'https://api.deepseek.com/chat/completions') {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"status":"OK","engine":"deepseek-chat"}' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === 'https://api.arena.ai/v1/chat/completions') {
        arenaCalls += 1;
        if (arenaCalls === 1) {
          return new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
            status: 429,
            headers: { 'Retry-After': '0', 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            model: 'arena-router',
            choices: [{ message: { content: '{"status":"OK","engine":"arena-router"}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === 'https://api.arena.ai/v1/messages') {
        anthropicCalls += 1;
        const h = init?.headers as Record<string, string>;
        expect(h['x-api-key']).toBe('sk-arena-anthropic-panel-entered');
        expect(h['anthropic-version']).toBe('2023-06-01');
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"status":"OK","engine":"claude-sonnet-4-5"}' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    // Live Model Discovery using saved Slot 2 encrypted key (no re-entry needed!)
    const discRes = await worker.fetch(
      new Request('https://dollarino.test/api/admin/ai-engines/discover-models', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: 'https://api.arena.ai/v1',
          slotOrder: 2,
          provider: 'openai_compatible',
        }),
      }),
      env
    );
    expect(discRes.status).toBe(200);
    const discJson = (await discRes.json()) as { ok: boolean; count: number; models: Array<{ id: string; supportsVision: boolean }> };
    expect(discJson.ok).toBe(true);
    expect(discJson.count).toBe(3);
    expect(discJson.models.find((m) => m.id === 'claude-sonnet-4-5')?.supportsVision).toBe(true);

    // Health check across all 3 engines (DeepSeek + Arena OpenAI w/ 429 retry + Arena Anthropic)
    const testRes = await worker.fetch(
      new Request('https://dollarino.test/api/admin/ai-engines/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      env
    );
    expect(testRes.status).toBe(200);
    const testJson = (await testRes.json()) as {
      ok: boolean;
      results: Array<{ slot_order: number; ok: boolean; reply: string }>;
    };
    expect(testJson.ok).toBe(true);
    expect(testJson.results).toHaveLength(3);
    expect(testJson.results.every((r) => r.ok)).toBe(true);
    expect(arenaCalls).toBe(2); // 429 -> short retry -> 200
    expect(anthropicCalls).toBe(1);
  });

  it('fails over cleanly from Slot 1 to Arena AI in Dedicated Chat with live telemetry context + extracts setup', async () => {
    const env = makeEnv();
    let capturedSystemPrompt = '';

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('bitunix.com') && url.includes('tickers')) {
        return new Response(
          JSON.stringify({ code: 0, data: [{ symbol: 'BTCUSDT', lastPrice: '96250.00', change24h: '2.85' }] }),
          { status: 200 }
        );
      }
      if (url.includes('binance.com') && url.includes('ticker/24hr')) {
        return new Response(JSON.stringify({ lastPrice: '96250.00', priceChangePercent: '2.85' }), { status: 200 });
      }
      if (url.includes('binance.com') && url.includes('klines')) {
        const now = Date.now();
        const klines = Array.from({ length: 60 }, (_, idx) => [
          now - (60 - idx) * 900_000,
          String(95000 + idx * 20),
          String(95050 + idx * 20),
          String(94960 + idx * 20),
          String(95020 + idx * 20),
          '1500',
        ]);
        return new Response(JSON.stringify(klines), { status: 200 });
      }
      if (url === 'https://api.deepseek.com/chat/completions') {
        return new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), { status: 500 });
      }
      if (url === 'https://api.arena.ai/v1/chat/completions') {
        const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ role: string; content: string }> };
        capturedSystemPrompt = body.messages?.[0]?.content || '';
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    `<think>Internal check</think>تحلیل زنده بیت‌کوین آماده است!\n` +
                    `<<<SETUP_JSON>>>{"symbol":"BTCUSDT","direction":"LONG","timeframe":"15m","entry":"96250","stopLoss":"95100","tp1":"97400","tp2":"98800","tp3":"100200","leverage":5,"rrRatio":"1:2.2","confidence":81}<<<END_SETUP_JSON>>>`,
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const chatRes = await worker.fetch(
      new Request('https://dollarino.test/api/ai-assistant/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'تحلیل بیت‌کوین و وضعیت پوزیشن بازم چطوره؟',
          currentSymbol: 'BTCUSDT',
          activeTab: 'terminal',
        }),
      }),
      env
    );

    expect(chatRes.status).toBe(200);
    const chatJson = (await chatRes.json()) as {
      reply: string;
      modelLabel: string;
      setup: { symbol: string; direction: string; entry: string } | null;
    };
    expect(chatJson.modelLabel).toBe('Arena AI Router');
    expect(chatJson.reply).not.toContain('<think>');
    expect(chatJson.reply).toContain('تحلیل زنده بیت‌کوین آماده است!');
    expect(chatJson.setup?.symbol).toBe('BTCUSDT');
    expect(chatJson.setup?.direction).toBe('LONG');
    expect(capturedSystemPrompt).toContain('LIVE DOLLARINO REAL-TIME CONTEXT');
    expect(capturedSystemPrompt).toContain('User Bot State: RUNNING');
    expect(capturedSystemPrompt).toContain('Open Positions (1): BTCUSDT LONG 5x');
  });

  it('runs Trading Ensemble across DeepSeek + Arena AI and fails over Support AI cleanly', async () => {
    const env = makeEnv();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://api.deepseek.com/chat/completions') {
        const body = JSON.parse(String(init?.body || '{}')) as { messages?: Array<{ content: string }> };
        if (body.messages?.[0]?.content?.includes('Trading Committee')) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content:
                      '<think>Bullish EMA alignment</think>```json\n{"action":"LONG","confidence":82,"entry":96500,"stopLoss":95300,"tp1":98100,"tp2":99800,"tp3":101500,"leverage":6,"thesis":"EMA20>EMA50 bullish momentum","invalidation":"Below 95300"}\n```',
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 500 });
      }
      if (url === 'https://api.arena.ai/v1/chat/completions') {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    'پشتیبانی دلارینو: وضعیت **Trust Wallet** شما متصل است و کارمزد ۳٪ تنها پس از ۳ معامله سودده اول رایگان روی سود خالص اعمال می‌شود.',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const decision = await runAutonomousAITrader(env, 'u_trader', {
      symbol: 'BTCUSDT',
      timeframe: '15m',
      higherTimeframe: '1h',
      candles: makeCandles(90, 94500),
      htfCandles: makeCandles(40, 94000),
      maxLeverage: 10,
      minConfidence: 70,
      bypassCache: true,
    });
    expect(decision.ok).toBe(true);
    expect(decision.action).toBe('LONG');
    expect(decision.confidence).toBe(82);
    expect(decision.rrRatio).toBeGreaterThanOrEqual(1.8);

    const supRes = await worker.fetch(
      new Request('https://dollarino.test/api/support/message', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'وضعیت اتصال تراست‌ولت و کارمزد ۳٪ چطوره؟' }),
      }),
      env
    );
    expect(supRes.status).toBe(201);
    const supJson = (await supRes.json()) as { ok: boolean; aiReply: { sender_name: string; message: string } | null };
    expect(supJson.ok).toBe(true);
    expect(supJson.aiReply?.sender_name).toContain('Arena AI Router');
    expect(supJson.aiReply?.message).toContain('Trust Wallet');
  });
});
