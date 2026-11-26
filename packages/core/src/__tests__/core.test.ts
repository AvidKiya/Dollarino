import { describe, expect, it } from 'vitest';
import {
  alma,
  computeAlmaRibbon,
  computeDemaAtr,
  computeDynamicRecommendedSettings,
  computeKbosV11Detailed,
  computeStrategySignals,
  DEFAULT_KBOS_PARAMS,
  DEFAULT_MIXER_WEIGHTS,
  evaluatePineStrategy,
  evaluatePythonStrategy,
  evaluateRiskGates,
  evaluateSignalMixerAtBar,
  evaluateVisualStrategy,
  formatDollarinoSignal,
  mergeKbosParams,
  parseDollarinoSignal,
  quantizeDown,
  resolveEffectiveBotCapital,
  runBacktest,
  SAMPLE_CUSTOM_STRATEGIES,
  superSmoother,
  type AIProviderId,
  type BotConfig,
  type Candle,
  type InstrumentSpec,
  type StrategyKey,
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

    const hashtagShort = parseDollarinoSignal(`🔴 SHORT #SOLUSDT | 15m
Entry: 198.50
SL: 203.00
TP1: 194.00
TP2: 189.50
Leverage: 5x`);
    expect(hashtagShort?.direction).toBe('SHORT');
    expect(hashtagShort?.symbol).toBe('SOLUSDT');
    expect(hashtagShort?.timeframe).toBe('15m');
    expect(hashtagShort?.leverage).toBe(5);
    expect(hashtagShort?.price).toBe('198.50');
    expect(hashtagShort?.stopLoss).toBe('203.00');
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

  it('computes KIYA BOT ORG - super v11 (KBOs), ALMA Ribbon, DEMA ATR, and Monthly/DOW backtest tables', () => {
    const candles: Candle[] = [];
    const start = Date.UTC(2026, 0, 1);
    let p = 60_000;
    for (let i = 0; i < 240; i++) {
      const wave = Math.sin(i / 10) * 650 + (i > 120 ? 60 : -20);
      const open = p;
      const close = Math.max(5000, open + wave * 0.15);
      candles.push({
        timestamp: start + i * 1_800_000,
        open,
        high: Math.max(open, close) + 150,
        low: Math.min(open, close) - 150,
        close,
        volume: 800 + (i % 15) * 90,
      });
      p = close;
    }

    const almaVals = alma(candles.map((c) => c.close), 9, 0.85, 6);
    expect(Number.isFinite(almaVals[almaVals.length - 1])).toBe(true);

    const ssmaVals = superSmoother(candles.map((c) => c.close), 10);
    expect(Number.isFinite(ssmaVals[ssmaVals.length - 1])).toBe(true);

    const demaAtr = computeDemaAtr(candles);
    expect(demaAtr.length).toBe(candles.length);

    const ribbon = computeAlmaRibbon(candles, { mainLen: 160 });
    expect(ribbon.bands.length).toBe(8);

    const kbos = computeKbosV11Detailed(candles, '30m', { useDemaAtr: false, intRes: 10 });
    expect(kbos.outputs.length).toBe(candles.length);
    expect(kbos.closeSeriesAlt.length).toBeGreaterThan(20);

    const bt = runBacktest(candles, [], {
      symbol: 'BTCUSDT',
      strategyKey: 'kbos_v11',
      timeframe: '30m',
      initialBalance: 5000,
      marginPct: 50,
      leverage: 5,
      tp1ClosePct: 30,
      tp2ClosePct: 30,
      tp3ClosePct: 40,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: false,
      useTrailingStop: true,
      trailPct: 2.0,
      trailAfterTp1: true,
      params: { kbosParams: { useDemaAtr: false, intRes: 8 } },
    });

    expect(bt.dayOfWeekStats.length).toBe(7);
    expect(Array.isArray(bt.monthlyBreakdown)).toBe(true);
    expect(Number.isFinite(bt.metrics.maxRunupUsd)).toBe(true);
  });

  it('keeps DEMA-ATR BEAR trend across flat consolidations & upgrades legacy v1 kbosParams', () => {
    const start = Date.UTC(2026, 2, 1);
    const downtrend: Candle[] = [];
    let px = 60_000;
    for (let i = 0; i < 60; i++) {
      // Sharp drop followed by flat horizontal pause
      const step = i < 25 ? -350 : i % 2 === 0 ? 15 : -18;
      const open = px;
      const close = open + step;
      downtrend.push({
        timestamp: start + i * 900_000,
        open,
        high: Math.max(open, close) + 60,
        low: Math.min(open, close) - 60,
        close,
        volume: 500,
      });
      px = close;
    }

    const da = computeDemaAtr(downtrend, { periodDema: 7, periodAtr: 14, factorAtr: 1.5 });
    const postDrop = da.slice(28);
    expect(postDrop.every((pt) => pt.trend === 'BEAR')).toBe(true);

    // Legacy 0003 unmodified defaults upgrade automatically to v2 defaults
    const upgraded = mergeKbosParams({
      basisType: 'ALMA',
      basisLen: 2,
      useRes: true,
      intRes: 18,
      useEma200: false,
      useAdx: false,
      adxThreshold: 25,
      factorAtr: 1.7,
      tp1Pct: 1.5,
      trailPct: 2.0,
    });
    expect(upgraded.intRes).toBe(DEFAULT_KBOS_PARAMS.intRes);
    expect(upgraded.useEma200).toBe(true);
    expect(upgraded.useAdx).toBe(true);

    // Explicit user override is preserved
    const custom = mergeKbosParams({ intRes: 12, useEma200: false, tp1Pct: 2.2 });
    expect(custom.intRes).toBe(12);
    expect(custom.useEma200).toBe(false);
    expect(custom.tp1Pct).toBe(2.2);

    // Signal Mixer hits actionable threshold on confluent bullish trend+momentum+volume bar
    const bullRun: Candle[] = [];
    let bp = 40_000;
    for (let i = 0; i < 60; i++) {
      const open = bp;
      const close = i === 59 ? open + 450 : open + 120 + (i % 3) * 20;
      bullRun.push({
        timestamp: start + i * 900_000,
        open,
        high: close + 40,
        low: open - 30,
        close,
        volume: i === 59 ? 2500 : 800,
      });
      bp = close;
    }
    const mix = evaluateSignalMixerAtBar(bullRun, bullRun.length - 1, 'BULLISH', DEFAULT_MIXER_WEIGHTS, 65);
    expect(mix.confidence).toBeGreaterThanOrEqual(65);
    expect(mix.direction).toBe('LONG');
  });

  it('supports DeepSeek provider and ai_autonomous_agent strategy in risk gates', () => {
    const provider: AIProviderId = 'deepseek';
    const strategyKey: StrategyKey = 'ai_autonomous_agent';
    expect(provider).toBe('deepseek');
    expect(strategyKey).toBe('ai_autonomous_agent');

    const decision = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: {
        tradingMode: 'PAPER',
        executionMode: 'AUTO',
        symbol: 'BTCUSDT',
        strategyKey,
        entryTimeframe: '15m',
        higherTimeframe: '1h',
        marginPct: 10,
        useSignalLeverage: true,
        maxLeverage: 10,
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
      },
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '91500',
        stopLoss: '90200',
        leverage: 6,
        tp1: '93000',
        tp2: '94500',
        tp3: '96500',
        reason: 'DeepSeek-V4 bullish structure thesis',
      },
      availableBalance: '2000',
      equity: '2000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: {
        symbol: 'BTCUSDT',
        basePrecision: 3,
        quotePrecision: 2,
        minTradeVolume: '0.001',
        maxMarketVolume: '50',
        minNotional: '5',
        minLeverage: 1,
        maxLeverage: 50,
        status: 'OPEN',
      },
    });
    expect(decision.approved).toBe(true);
    expect(decision.marginUsed).toBe('200');
  });

  it('evaluates Dollarino V0.1 unified multi-pillar master strategy cleanly', () => {
    const start = Date.UTC(2026, 3, 1);
    const candles: Candle[] = [];
    let price = 60_000;
    for (let i = 0; i < 220; i++) {
      const wave = Math.sin(i / 8) * 320 + (i > 40 ? 45 : -10);
      const open = price;
      const close = Math.max(5000, open + wave * 0.22);
      candles.push({
        timestamp: start + i * 900_000,
        open,
        high: Math.max(open, close) + 95,
        low: Math.min(open, close) - 95,
        close,
        volume: 900 + (i % 12) * 110,
      });
      price = close;
    }

    const signals = computeStrategySignals('dollarino_v01', candles, [], '15m', '1h');
    expect(signals.length).toBe(candles.length);
    for (const s of signals.filter((x) => x.signal !== 'NONE')) {
      expect(s.reason).toContain('Dollarino V0.1');
      if (s.signal === 'LONG') {
        expect(s.stopLoss!).toBeLessThan(s.price);
        expect(s.tp1!).toBeGreaterThan(s.price);
        expect(s.tp2!).toBeGreaterThan(s.tp1!);
        expect(s.tp3!).toBeGreaterThan(s.tp2!);
      } else {
        expect(s.stopLoss!).toBeGreaterThan(s.price);
        expect(s.tp1!).toBeLessThan(s.price);
        expect(s.tp2!).toBeLessThan(s.tp1!);
        expect(s.tp3!).toBeLessThan(s.tp2!);
      }
    }

    const bt = runBacktest(candles, [], {
      symbol: 'BTCUSDT',
      strategyKey: 'dollarino_v01',
      timeframe: '15m',
      initialBalance: 10_000,
      marginPct: 5,
      leverage: 5,
      tp1ClosePct: 40,
      tp2ClosePct: 30,
      tp3ClosePct: 30,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: true,
    });
    expect(bt.equityCurve.length).toBe(candles.length);
    expect(Number.isFinite(bt.metrics.finalEquity)).toBe(true);
  });
});

describe('@dollarino/core Spot/Futures & direction mode risk gates', () => {
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

  const baseCfg: BotConfig = {
    tradingMode: 'PAPER',
    executionMode: 'AUTO',
    marketType: 'FUTURES',
    directionMode: 'BOTH',
    hedgeMode: false,
    symbol: 'BTCUSDT',
    strategyKey: 'dollarino_v01',
    entryTimeframe: '15m',
    higherTimeframe: '1h',
    marginPct: 10,
    useSignalLeverage: false,
    maxLeverage: 10,
    tp1ClosePct: 40,
    tp2ClosePct: 30,
    tp3ClosePct: 30,
    autoBreakevenOnTp1: true,
    moveSlToTp1OnTp2: true,
    dailyMaxLossPct: 5,
    maxOpenPositions: 5,
    blockWeekends: false,
    macroBlackout: false,
    aiGateEnabled: false,
    aiMinConfidence: 65,
    signalChannelHandle: '@Dollarinoofficial',
  };

  it('enforces 1x leverage and blocks SHORT in SPOT mode', () => {
    const spotLong = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: { ...baseCfg, marketType: 'SPOT' },
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '50000',
        stopLoss: '49000',
        leverage: 15,
        tp1: '51000',
      },
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: btcSpec,
    });
    expect(spotLong.approved).toBe(true);
    expect(spotLong.effectiveLeverage).toBe(1);
    expect(spotLong.notionalValue).toBe('100');

    const spotShort = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: { ...baseCfg, marketType: 'SPOT' },
      signal: {
        symbol: 'BTCUSDT',
        direction: 'SHORT',
        timeframe: '15m',
        price: '50000',
        stopLoss: '51000',
        leverage: 5,
        tp1: '49000',
      },
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: btcSpec,
    });
    expect(spotShort.approved).toBe(false);
    expect(spotShort.reasonCode).toBe('SPOT_NO_MARGIN_SHORT');
  });

  it('respects LONG_ONLY, SHORT_ONLY, and BOTH direction modes', () => {
    const longOnlyShort = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: { ...baseCfg, directionMode: 'LONG_ONLY' },
      signal: {
        symbol: 'BTCUSDT',
        direction: 'SHORT',
        timeframe: '15m',
        price: '50000',
        stopLoss: '51000',
        leverage: 5,
        tp1: '49000',
      },
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: btcSpec,
    });
    expect(longOnlyShort.approved).toBe(false);
    expect(longOnlyShort.reasonCode).toBe('DIRECTION_FILTERED');

    const shortOnlyLong = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: { ...baseCfg, directionMode: 'SHORT_ONLY' },
      signal: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '50000',
        stopLoss: '49000',
        leverage: 5,
        tp1: '51000',
      },
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: btcSpec,
    });
    expect(shortOnlyLong.approved).toBe(false);
    expect(shortOnlyLong.reasonCode).toBe('DIRECTION_FILTERED');
  });
});

describe('@dollarino/core Pine Script, Python & Visual Strategy Engine', () => {
  const buildOscillatingCandles = (len = 260): Candle[] => {
    const start = Date.UTC(2026, 4, 1);
    const out: Candle[] = [];
    let p = 50_000;
    for (let i = 0; i < len; i++) {
      const wave = Math.sin(i / 7) * 520 + (i % 35 < 18 ? 140 : -110);
      const open = p;
      const close = Math.max(10_000, open + wave * 0.45);
      out.push({
        timestamp: start + i * 900_000,
        open,
        high: Math.max(open, close) + 140,
        low: Math.min(open, close) - 140,
        close,
        volume: 1000 + (i % 15) * 180,
      });
      p = close;
    }
    return out;
  };

  it('compiles and runs all SAMPLE_CUSTOM_STRATEGIES cleanly with chart plots and signals', () => {
    const candles = buildOscillatingCandles(260);
    for (const s of SAMPLE_CUSTOM_STRATEGIES) {
      const res =
        s.language === 'pine'
          ? evaluatePineStrategy(s.code, candles, '15m')
          : evaluatePythonStrategy(s.code, candles, '15m');
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.signals.length).toBe(candles.length);
      expect(res.plots.length).toBeGreaterThan(0);

      const bt = runBacktest(candles, [], {
        symbol: 'BTCUSDT',
        strategyKey: s.language === 'pine' ? 'custom_pine' : 'custom_python',
        timeframe: '15m',
        initialBalance: 10_000,
        marginPct: 5,
        leverage: 5,
        tp1ClosePct: 40,
        tp2ClosePct: 30,
        tp3ClosePct: 30,
        autoBreakevenOnTp1: true,
        moveSlToTp1OnTp2: true,
        customSignals: res.signals,
      });
      expect(bt.equityCurve.length).toBe(candles.length);
      expect(Number.isFinite(bt.metrics.finalEquity)).toBe(true);
    }
  });

  it('evaluates Visual No-Code strategy rules with plots and triggers', () => {
    const candles = buildOscillatingCandles(160);
    const vis = evaluateVisualStrategy(
      {
        name: 'Visual EMA + RSI',
        logic: 'ANY',
        slAtrMult: 1.8,
        tp1R: 1.5,
        tp2R: 2.5,
        tp3R: 4.0,
        longRules: [{ id: '1', kind: 'EMA_CROSS_ABOVE', param1: 9, param2: 21 }],
        shortRules: [{ id: '2', kind: 'EMA_CROSS_BELOW', param1: 9, param2: 21 }],
      },
      candles,
      '15m'
    );
    expect(vis.valid).toBe(true);
    expect(vis.plots.length).toBeGreaterThanOrEqual(2);
    expect(vis.signals.some((s) => s.signal !== 'NONE')).toBe(true);
  });

  it('enforces $100 bot budget cap inside a $1000 wallet across 1..10 trades and computes capital-aware recommendations', () => {
    const capInfo = resolveEffectiveBotCapital({
      walletBalanceUsd: 1000,
      budgetMode: 'FIXED_USD',
      budgetUsd: 100,
      budgetPct: 100,
    });
    expect(capInfo.effectiveCapitalUsd).toBe(100);
    expect(capInfo.isCapped).toBe(true);

    // Dynamic recommended settings scale cleanly with effective capital ($100 vs $10,000)
    const rec100 = computeDynamicRecommendedSettings(100, 'balanced');
    expect(rec100.maxOpenPositions).toBe(4);
    expect(rec100.perTradeUsd).toBe(25);
    expect(rec100.maxLeverage).toBe(5);

    const rec10k = computeDynamicRecommendedSettings(10_000, 'balanced');
    expect(rec10k.maxOpenPositions).toBe(8);
    expect(rec10k.marginPct).toBe(10);
    expect(rec10k.perTradeUsd).toBe(1000);

    const cfg10Trades: BotConfig = {
      tradingMode: 'PAPER',
      executionMode: 'AUTO',
      symbol: 'BTCUSDT',
      strategyKey: 'dollarino_v01',
      entryTimeframe: '15m',
      higherTimeframe: '1h',
      marginPct: 10, // 10% of $100 budget = $10 per trade -> max 10 trades = $100 total
      useSignalLeverage: false,
      maxLeverage: 5,
      tp1ClosePct: 50,
      tp2ClosePct: 25,
      tp3ClosePct: 25,
      autoBreakevenOnTp1: true,
      moveSlToTp1OnTp2: true,
      dailyMaxLossPct: 5,
      maxOpenPositions: 12,
      blockWeekends: false,
      macroBlackout: false,
      aiGateEnabled: false,
      aiMinConfidence: 65,
      signalChannelHandle: '@Dollarino_official',
    };
    const solSpec: InstrumentSpec = {
      symbol: 'SOLUSDT',
      basePrecision: 2,
      quotePrecision: 2,
      minTradeVolume: '0.01',
      maxMarketVolume: '5000',
      minNotional: '5',
      minLeverage: 1,
      maxLeverage: 50,
      status: 'OPEN',
    };
    const sig = {
      symbol: 'SOLUSDT',
      direction: 'LONG' as const,
      price: '150',
      stopLoss: '145',
      tp1: '155',
      tp2: '160',
      tp3: '165',
      leverage: 5,
      timeframe: '15m' as const,
      source: 'test',
    };

    // Trade #1 with $0 used -> gets $10 (10% of $100 cap, NOT $100 of $1000 wallet!)
    const d1 = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: cfg10Trades,
      signal: sig,
      availableBalance: '1000',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 0,
      instrument: solSpec,
      effectiveCapitalUsd: 100,
      usedBotMarginUsd: 0,
    });
    expect(d1.approved).toBe(true);
    expect(Number(d1.marginUsed)).toBe(10);

    // Trade #10 when $95 is already used -> capped to remaining $5 so aggregate <= $100!
    const dCap = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: cfg10Trades,
      signal: sig,
      availableBalance: '905',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 9,
      instrument: solSpec,
      effectiveCapitalUsd: 100,
      usedBotMarginUsd: 95,
    });
    expect(dCap.approved).toBe(true);
    expect(Number(dCap.marginUsed)).toBe(5);

    // Trade #11 when $100 budget is 100% used -> strictly rejected even though $900 remains in wallet!
    const dFull = evaluateRiskGates({
      botState: 'RUNNING_PAPER',
      config: cfg10Trades,
      signal: sig,
      availableBalance: '900',
      equity: '1000',
      todayRealizedPnl: '0',
      openPositionsCount: 10,
      instrument: solSpec,
      effectiveCapitalUsd: 100,
      usedBotMarginUsd: 100,
    });
    expect(dFull.approved).toBe(false);
    expect(dFull.reasonCode).toBe('BOT_BUDGET_CAP_REACHED');
  });
});

describe('@dollarino/core Pine Script v5 Engine & TradingView Graphical Primitives', () => {
  const buildCandles = (len = 160): Candle[] => {
    const out: Candle[] = [];
    const start = Date.UTC(2026, 2, 1);
    let px = 60_000;
    for (let i = 0; i < len; i++) {
      const wave = Math.sin(i / 5) * 420 + (i % 17 === 0 ? 520 : -15);
      const open = px;
      const close = Math.max(5000, open + wave * 0.4);
      const high = Math.max(open, close) + 180;
      const low = Math.min(open, close) - 180;
      out.push({
        timestamp: start + i * 900_000,
        open,
        high,
        low,
        close,
        volume: 1500 + (i % 9) * 350,
      });
      px = close;
    }
    return out;
  };

  it('evaluates Pine v5 user functions, switch/for/var, request.security, and graphical objects (box/line/label/table/fill/hline/bgcolor/barcolor)', () => {
    const pineV5 = `//@version=5
indicator("SMC V5 Pro Visual Test", overlay=true)
len = input.int(14, "Len")
calcBias(src, fast, slow) =>
    f = ta.ema(src, fast)
    s = ta.ema(src, slow)
    f > s ? 1 : -1

var int trendHits = 0
bias = calcBias(close, 9, 21)
htfEma = request.security(syminfo.tickerid, "1h", ta.ema(close, 14))
fastLine = plot(ta.ema(close, 9), "Fast EMA", color=color.aqua, linewidth=2)
slowLine = plot(htfEma, "HTF EMA", color=color.orange, linewidth=2)
fill(fastLine, slowLine, color=bias > 0 ? color.new(color.lime, 82) : color.new(color.red, 82))
hline(60000, "Anchor 60k", color=color.gray, linestyle=hline.style_dashed)
bgcolor(bias > 0 ? color.new(color.green, 90) : color.new(color.red, 90))
barcolor(bias > 0 ? color.lime : color.red)

pivH = ta.pivothigh(high, 4, 4)
if not na(pivH)
    box.new(bar_index - 4, high[4], bar_index + 4, math.max(open[4], close[4]), border_color=color.red, bgcolor=color.new(color.red, 85), text="Supply OB")
    line.new(bar_index - 4, high[4], bar_index + 4, high[4], color=color.red, style=line.style_dashed)
    label.new(bar_index, high, "OB", style=label.style_label_down, color=color.red)

var tbl = table.new(position.top_right, 2, 2, border_width=1)
if barstate.islast
    table.cell(tbl, 0, 0, "Trend", bgcolor=color.navy, text_color=color.white)
    table.cell(tbl, 1, 0, bias > 0 ? "BULL" : "BEAR", bgcolor=color.green, text_color=color.white)
    sumLoop = 0.0
    for k = 0 to 2
        sumLoop := sumLoop + k
    trendHits := int(sumLoop)

longCond = ta.crossover(ta.ema(close, 9), ta.ema(close, 21))
shortCond = ta.crossunder(ta.ema(close, 9), ta.ema(close, 21))
if longCond
    strategy.entry("Long", strategy.long)
if shortCond
    strategy.entry("Short", strategy.short)
`;
    const candles = buildCandles(160);
    const res = evaluatePineStrategy(pineV5, candles, '15m');

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.title).toBe('SMC V5 Pro Visual Test');
    expect(res.plots.length).toBeGreaterThanOrEqual(2);
    expect(res.hlines?.length).toBeGreaterThanOrEqual(1);
    expect(res.fills?.length).toBeGreaterThanOrEqual(1);
    expect(res.bgcolors?.length).toBeGreaterThan(0);
    expect(res.barcolors?.length).toBeGreaterThan(0);
    expect(res.boxes?.length).toBeGreaterThan(0);
    expect(res.lines?.length).toBeGreaterThan(0);
    expect(res.labels?.length).toBeGreaterThan(0);
    expect(res.tables?.length).toBe(1);
    expect(res.tables?.[0]?.cells.length).toBeGreaterThanOrEqual(2);
  });

  it('compiles all built-in SAMPLE_CUSTOM_STRATEGIES cleanly including SMC HUD template', () => {
    const candles = buildCandles(180);
    expect(SAMPLE_CUSTOM_STRATEGIES.length).toBeGreaterThanOrEqual(7);
    for (const tpl of SAMPLE_CUSTOM_STRATEGIES) {
      if (tpl.language === 'pine') {
        const res = evaluatePineStrategy(tpl.code, candles, '15m');
        expect(res.valid, `Template ${tpl.id} errors: ${res.errors.join('; ')}`).toBe(true);
        expect(res.plots.length + (res.boxes?.length ?? 0) + res.markers.length).toBeGreaterThan(0);
      } else if (tpl.language === 'python') {
        const res = evaluatePythonStrategy(tpl.code, candles);
        expect(res.valid, `Python template ${tpl.id} errors: ${res.errors.join('; ')}`).toBe(true);
      } else {
        const res = evaluateVisualStrategy(tpl.code, candles);
        expect(res.valid, `Visual template ${tpl.id} errors: ${res.errors.join('; ')}`).toBe(true);
      }
    }
    const smcTpl = SAMPLE_CUSTOM_STRATEGIES.find((t) => t.id === 'pine_smc_orderblocks_hud');
    expect(smcTpl).toBeDefined();
    const smcRes = evaluatePineStrategy(smcTpl!.code, candles, '15m');
    expect(smcRes.boxes?.length).toBeGreaterThan(0);
    expect(smcRes.tables?.length).toBeGreaterThan(0);
  });
});



