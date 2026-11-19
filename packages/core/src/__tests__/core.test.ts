import { describe, expect, it } from 'vitest';
import {
  computeStrategySignals,
  DEFAULT_MIXER_WEIGHTS,
  evaluateRiskGates,
  evaluateSignalMixerAtBar,
  formatDollarinoSignal,
  parseDollarinoSignal,
  quantizeDown,
  runBacktest,
  type BotConfig,
  type Candle,
  type InstrumentSpec,
} from '../index.js';

describe('@dollarino/core signal parser & formatter', () => {
  it('parses classic extended Dollarino sell signal', () => {
    const raw = `🔴 Sell signal
------------------------------------------------
💲 Symbol: BTCUSDT
------------------------------------------------
⌛️ Time Frame: 30
------------------------------------------------
🔔 Price: 58151.2775
------------------------------------------------
⛔️ Stop: 58794.2301151922
------------------------------------------------
🔘 Leverage: 8
------------------------------------------------
🟢 TP1: 57508.3248848078
🟡 TP2: 56865.3722696157
🟠 TP3: 56222.4196544235
------------------------------------------------
🧨 SL: %8.85
🎯 TP1: %-8.85
🎯 TP2: %-17.69
🎯 TP3: %-26.54
------------------------------------------------
🆔 @Dollarinoofficial`;

    const parsed = parseDollarinoSignal(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.direction).toBe('SHORT');
    expect(parsed!.symbol).toBe('BTCUSDT');
    expect(parsed!.timeframe).toBe('30');
    expect(parsed!.leverage).toBe(8);
    expect(parsed!.tp1).toBe('57508.3248848078');
    expect(parsed!.tp2).toBe('56865.3722696157');
    expect(parsed!.tp3).toBe('56222.4196544235');

    const formatted = formatDollarinoSignal(parsed!);
    expect(formatted).toContain('🔴 Sell signal');
    expect(formatted).toContain('🧨 SL: %8.85');
    expect(formatted).toContain('🎯 TP1: %-8.85');
    expect(formatted).toContain('🎯 TP2: %-17.69');
    expect(formatted).toContain('🎯 TP3: %-26.54');
  });

  it('parses compact signal text and JSON alert', () => {
    const compact = `🟢 Buy signal
--------------------
💲Symbol: ETHUSDT
--------------------
⌛️Time Frame: 15m
--------------------
🔔 Price: 3200
--------------------
🔘 Leverage: 10
--------------------
⛔️ Stop: 3120
--------------------
🟢Tp1: 3280
🟡Tp2: 3360
🟠Tp3: 3440
🆔 : @Dollarino_official`;

    const parsed = parseDollarinoSignal(compact);
    expect(parsed?.direction).toBe('LONG');
    expect(parsed?.symbol).toBe('ETHUSDT');
    expect(parsed?.tp1Pct).toBe('25.00');
    expect(parsed?.slPct).toBe('-25.00');

    const jsonParsed = parseDollarinoSignal({
      side: 'BUY',
      symbol: 'SOLUSDT',
      timeframe: '15m',
      price: 150,
      stop: 145,
      leverage: 5,
      tp1: 155,
      tp2: 160,
      tp3: 165,
    });
    expect(jsonParsed?.symbol).toBe('SOLUSDT');
    expect(jsonParsed?.direction).toBe('LONG');
  });
});

describe('@dollarino/core decimal & 3-TP risk sizing', () => {
  const baseConfig: BotConfig = {
    tradingMode: 'PAPER',
    executionMode: 'AUTO',
    symbol: 'BTCUSDT',
    strategyKey: 'sp2l',
    entryTimeframe: '15m',
    higherTimeframe: '1h',
    marginPct: 10,
    useSignalLeverage: true,
    maxLeverage: 20,
    tp1ClosePct: 50,
    tp2ClosePct: 25,
    tp3ClosePct: 25,
    autoBreakevenOnTp1: true,
    moveSlToTp1OnTp2: true,
    dailyMaxLossPct: 5,
    maxOpenPositions: 3,
    blockWeekends: false,
    macroBlackout: false,
    aiGateEnabled: false,
    aiMinConfidence: 65,
    signalChannelHandle: '@Dollarinoofficial',
  };

  const btcSpec: InstrumentSpec = {
    symbol: 'BTCUSDT',
    basePrecision: 3,
    quotePrecision: 2,
    minTradeVolume: '0.001',
    maxMarketVolume: '50',
    minNotional: '5',
    minLeverage: 1,
    maxLeverage: 50,
    status: 'OPEN',
  };

  it('allocates exact 10% margin and splits quantity 50% / 25% / 25% ROUND_DOWN', () => {
    expect(quantizeDown('1.2349', 3)).toBe('1.234');
    const decision = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: baseConfig,
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '50000',
        stopLoss: '49000',
        leverage: 10,
        tp1: '51000',
        tp2: '52000',
        tp3: '53000',
      },
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: btcSpec,
    });

    expect(decision.approved).toBe(true);
    expect(decision.marginUsed).toBe('100'); // 10% of 1000
    expect(decision.notionalValue).toBe('1000'); // 100 * 10x
    expect(decision.quantity).toBe('0.02');
    expect(decision.tp1Quantity).toBe('0.01'); // 50%
    expect(decision.tp2Quantity).toBe('0.005'); // 25%
    expect(decision.tp3Quantity).toBe('0.005'); // 25%
  });

  it('rejects trade when daily max loss limit is breached', () => {
    const decision = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: baseConfig,
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '50000',
        stopLoss: '49000',
        leverage: 10,
        tp1: '51000',
      },
      availableBalance: '940',
      equity: '940',
      todayRealizedPnl: '-55', // >5% of 940
      openPositionsCount: 0,
      instrument: btcSpec,
    });

    expect(decision.approved).toBe(false);
    expect(decision.reasonCode).toBe('DAILY_MAX_LOSS');
  });
});

describe('@dollarino/core causal backtester', () => {
  it('runs deterministic backtest across synthetic trend candles without errors', () => {
    const candles: Candle[] = [];
    const start = Date.UTC(2026, 0, 1);
    let price = 50_000;
    for (let i = 0; i < 200; i++) {
      const wave = Math.sin(i / 6) * 280 + (i > 60 ? 35 : -10);
      const open = price;
      const close = Math.max(1000, open + wave * 0.25);
      const high = Math.max(open, close) + 120;
      const low = Math.min(open, close) - 120;
      candles.push({
        timestamp: start + i * 900_000,
        open,
        high,
        low,
        close,
        volume: 100 + (i % 20) * 15,
      });
      price = close;
    }

    const res = runBacktest(candles, [], {
      symbol: 'BTCUSDT',
      strategyKey: 'ema_trend_pullback',
      timeframe: '15m',
      initialBalance: 10_000,
      marginPct: 10,
      leverage: 5,
      tp1ClosePct: 50,
      tp2ClosePct: 25,
      tp3ClosePct: 25,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: true,
    });

    expect(res.equityCurve.length).toBe(candles.length);
    expect(res.metrics.initialBalance).toBe(10_000);
    expect(Number.isFinite(res.metrics.finalEquity)).toBe(true);
    expect(Number.isFinite(res.metrics.sharpeEstimate)).toBe(true);
  });

  it('evaluates SP2L, GridStrategy, TestStrategy, and 8-channel Signal Mixer cleanly', () => {
    const candles: Candle[] = [];
    const start = Date.UTC(2026, 1, 1);
    let p = 60_000;
    for (let i = 0; i < 80; i++) {
      const open = p;
      const close = open + Math.sin(i / 4) * 180 + 25;
      candles.push({
        timestamp: start + i * 900_000,
        open,
        high: Math.max(open, close) + 80,
        low: Math.min(open, close) - 80,
        close,
        volume: 500 + (i % 10) * 50,
      });
      p = close;
    }

    const testOut = computeStrategySignals('test_strategy', candles);
    expect(testOut.filter((o) => o.signal !== 'NONE').length).toBe(1);

    const sp2lOut = computeStrategySignals('sp2l', candles);
    expect(sp2lOut.length).toBe(candles.length);

    const gridOut = computeStrategySignals('grid_strategy', candles);
    expect(gridOut.length).toBe(candles.length);

    const mix = evaluateSignalMixerAtBar(candles, candles.length - 1, 'BULLISH', DEFAULT_MIXER_WEIGHTS, 60);
    expect(mix.channels.length).toBe(8);
    expect(mix.confidence).toBeGreaterThanOrEqual(0);
    expect(mix.confidence).toBeLessThanOrEqual(100);
  });
});
