import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SAMPLE_CUSTOM_STRATEGIES,
  evaluateCustomStrategy,
  evaluatePineStrategy,
  timeframeToMs,
  type Candle,
} from '@dollarino/core';
import { ensureUserDefaults } from '../auth.js';
import { signJwt } from '../crypto.js';
import type { Env } from '../env.js';
import worker from '../index.js';

function makeSyntheticCandles(count = 240, stepMs = 900_000): Candle[] {
  const out: Candle[] = [];
  const startTs = Date.UTC(2026, 0, 1);
  let price = 60000;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 8) * 420 + Math.cos(i / 17) * 280 + (i % 9 === 0 ? 180 : -35);
    const open = price;
    const close = Math.max(1000, open + wave * 0.28);
    const high = Math.max(open, close) + Math.abs(Math.sin(i * 1.3)) * 180 + 40;
    const low = Math.min(open, close) - Math.abs(Math.cos(i * 1.7)) * 180 - 40;
    const volume = 120 + (i % 15) * 45 + Math.abs(wave) * 0.5;
    out.push({
      timestamp: startTs + i * stepMs,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(2)),
    });
    price = close;
  }
  return out;
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
      cur += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += ch;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

describe('Pine Script v5/v6 Runtime & TradingView Supercharts Support', () => {
  const candles = makeSyntheticCandles(240, 900_000);

  it('supports 1w timeframe mapping in core', () => {
    expect(timeframeToMs('1w')).toBe(604_800_000);
    expect(timeframeToMs('1d')).toBe(86_400_000);
  });

  it('compiles and runs all built-in Pine v5/v6 and Python sample templates cleanly', () => {
    expect(SAMPLE_CUSTOM_STRATEGIES.length).toBeGreaterThanOrEqual(8);
    for (const sample of SAMPLE_CUSTOM_STRATEGIES) {
      const res = evaluateCustomStrategy(sample.language, sample.code, candles, '15m');
      expect(res.valid, `Sample ${sample.id} failed: ${res.errors.join(', ')}`).toBe(true);
      expect(res.errors).toEqual([]);
      expect(res.signals.length).toBe(candles.length);
    }
  });

  it('executes Pine v6 UDT, enum, method, polyline.new, linefill.new, map, matrix, while, and log.*', () => {
    const script = `//@version=6
indicator("Comprehensive Pine v6 Test", overlay=true)
import TradingView/ta/7 as tvta

len = input.int(14, title="Length")

enum State
    UP = "BULL"
    DOWN = "BEAR"

type ZoneBox
    float top
    float bottom

method span(ZoneBox self) =>
    self.top - self.bottom

k = tvta.kama(close, len)
[h1h, l1h, c1h] = request.security(syminfo.tickerid, "60", [high, low, close])

var float trail = na
prevTrail = nz(trail[1], close)
trail := close > prevTrail ? math.max(prevTrail, close * 0.99) : close * 1.01

var m = map.new<string, float>()
var mx = matrix.new<float>(2, 2, 1.5)
var pts = array.new<chart.point>()

if bar_index == 10 or bar_index == 50 or bar_index == 120
    zb = ZoneBox.new(high, low)
    zb.top := zb.top + 5
    map.put(m, "lastSpan", zb.span())
    matrix.set(mx, 0, 1, zb.top)
    pts.push(chart.point.from_index(bar_index, close))

var int steps = 0
while steps < 3
    steps += 1

if barstate.islast
    l1 = line.new(bar_index - 20, high[20], bar_index, high, color=color.lime)
    l2 = line.new(bar_index - 20, low[20], bar_index, low, color=color.red)
    linefill.new(l1, l2, color.new(color.aqua, 85))
    polyline.new(pts, curved=true, closed=false, line_color=color.yellow, line_width=2)
    log.info("KAMA={0}, Matrix={1}, Bias={2}", k, matrix.get(mx, 0, 1), State.UP)
    alert("Pine v6 complete")

plot(k, title="KAMA", color=color.aqua)
plot(c1h, title="1H Close", color=color.orange)
plot(trail, title="Trail", color=color.yellow)
`;

    const res = evaluatePineStrategy(script, candles, '15m');
    expect(res.valid).toBe(true);
    expect(res.pineVersion).toBe(6);
    expect(res.scriptKind).toBe('indicator');
    expect(res.inputs?.length).toBe(1);
    expect(res.inputs?.[0]?.title).toBe('Length');
    expect(res.plots.length).toBe(3);
    expect(res.lines?.length).toBe(2);
    expect(res.lines?.[0]?.x1Time).toBeLessThan(res.lines?.[0]?.x2Time ?? 0);
    expect((res.polylines?.length ?? 0)).toBe(2); // polyline.new + linefill.new
    expect(res.polylines?.[0]?.points.length).toBe(3);
    expect(res.logs?.some((l) => l.message.includes('KAMA=') && l.message.includes('Bias=BULL') && !l.message.includes('Matrix=na'))).toBe(true);
    expect(res.alertsTriggered?.some((a) => a.message === 'Pine v6 complete')).toBe(true);
  });

  it('tracks for [idx, val] in arr and stateful strategy position metrics', () => {
    const script = `//@version=6
strategy("Tuple For & Strategy Position Test", overlay=false)

[mLine, sLine, hist] = ta.macd(close, 12, 26, 9)
var arr = array.new<float>()
if bar_index >= 220
    arr.push(close)

var float acc = 0.0
if barstate.islast
    for [idx, val] in arr
        acc += val * (idx + 1)
    log.info("Accumulated={0}", acc)

plot(hist, title="Hist", style=plot.style_histogram)
strategy.entry("L", strategy.long, when=ta.crossover(mLine, sLine))
strategy.entry("S", strategy.short, when=ta.crossunder(mLine, sLine))
`;
    const res = evaluatePineStrategy(script, candles, '1w');
    expect(res.valid).toBe(true);
    expect(res.overlay).toBe(false);
    expect(res.logs?.some((l) => l.message.startsWith('Accumulated='))).toBe(true);
    expect(res.plots[0]?.overlay).toBe(false);
  });
});

describe('Worker Trading Routes for Pine v6 & 1w Timeframe', () => {
  let mf: Miniflare;
  let db: D1Database;
  let token = '';

  const makeEnv = (): Env => ({
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () => ({ fetch: async () => new Response('{"ok":true}') }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'test-jwt-secret-pine-v6-supercharts',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN',
    ALLOW_LIVE_TRADING: 'false',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  });

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: ['DB'],
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      for (const stmt of splitSqlStatements(sql)) {
        await db.prepare(stmt).run();
      }
    }

    await db.prepare(
      `INSERT INTO users (id, email, username, display_name, password_hash, role, ui_mode, profile_completed)
       VALUES ('u-pine-test', 'pine@test.local', 'pine_tester', 'Pine Tester', 'hash', 'user', 'pro', 1)`
    ).run();
    await ensureUserDefaults(db, 'u-pine-test');

    token = await signJwt(
      { sub: 'u-pine-test', email: 'pine@test.local', role: 'user' },
      'test-jwt-secret-pine-v6-supercharts'
    );
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('returns 1w candles & indicators from /api/trading/market/overview', async () => {
    const req = new Request('http://localhost/api/trading/market/overview?symbol=BTCUSDT&timeframe=1w', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeframe: string; candles: Candle[] };
    expect(body.timeframe).toBe('1w');
    expect(body.candles.length).toBeGreaterThan(30);
  });

  it('evaluates Pine v6 script on 500 candles and returns polylines, logs, inputs & backtestSummary', async () => {
    const pineCode = `//@version=6
strategy("API Pine v6 Eval", overlay=true)
fast = input.int(9, title="Fast")
slow = input.int(21, title="Slow")
e1 = ta.ema(close, fast)
e2 = ta.ema(close, slow)
if barstate.islast
    log.info("Last close={0}", close)
plot(e1, title="Fast EMA", color=color.aqua)
plot(e2, title="Slow EMA", color=color.orange)
strategy.entry("Long", strategy.long, when=ta.crossover(e1, e2))
strategy.entry("Short", strategy.short, when=ta.crossunder(e1, e2))
`;
    const req = new Request('http://localhost/api/trading/strategies/evaluate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: 'pine',
        code: pineCode,
        symbol: 'BTCUSDT',
        timeframe: '1w',
        limit: 500,
      }),
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      valid: boolean;
      pineVersion?: number;
      plots: unknown[];
      logs: Array<{ message: string }>;
      inputs: Array<{ name: string; title?: string }>;
      candles: Candle[];
      backtestSummary: { metrics: { totalTrades: number } } | null;
    };
    expect(body.valid).toBe(true);
    expect(body.pineVersion).toBe(6);
    expect(body.plots.length).toBe(2);
    expect(body.inputs.map((i) => i.title)).toEqual(['Fast', 'Slow']);
    expect(body.logs.some((l) => l.message.includes('Last close='))).toBe(true);
    expect(body.candles.length).toBeGreaterThan(50);
    expect(body.backtestSummary).not.toBeNull();
  });
});
