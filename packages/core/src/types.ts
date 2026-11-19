export type Direction = 'LONG' | 'SHORT';
export type OrderSide = 'BUY' | 'SELL';
export type TradingMode = 'PAPER' | 'LIVE';
export type ExecutionMode = 'AUTO' | 'MANUAL_CONFIRM';
export type MarginMode = 'ISOLATED' | 'CROSS';
export type ExchangeProviderId = 'paper' | 'toobit' | 'bitunix' | 'kcex';
export type AIProviderId = 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DollarinoSignal {
  symbol: string;
  direction: Direction;
  timeframe: string;
  price: string;
  stopLoss: string;
  leverage: number;
  tp1: string;
  tp2?: string;
  tp3?: string;
  slPct?: string;
  tp1Pct?: string;
  tp2Pct?: string;
  tp3Pct?: string;
  channelHandle?: string;
  reason?: string;
}

export type StrategyKey =
  | 'sp2l'
  | 'grid_strategy'
  | 'ema_trend_pullback'
  | 'vibe_4h_daily_breakout'
  | 'vibe_4h_candle_confirmation'
  | 'signal_mixer'
  | 'test_strategy'
  | 'dollarino_tv_hybrid';

export interface SignalMixerWeights {
  trend: number;
  momentum: number;
  liquiditySweep: number;
  fvg: number;
  volatility: number;
  volume: number;
  structure: number;
  meanReversion: number;
}

export interface SignalMixerChannelScore {
  key: keyof SignalMixerWeights;
  label: string;
  score: number; // -100..+100
  weight: number;
}

export interface SignalMixerResult {
  compositeScore: number; // -100..+100
  confidence: number;     // 0..100
  direction: Direction | 'NONE';
  channels: SignalMixerChannelScore[];
}

export interface BotConfig {
  tradingMode: TradingMode;
  executionMode: ExecutionMode;
  marginMode?: MarginMode;
  symbol: string;
  strategyKey: StrategyKey;
  entryTimeframe: Timeframe;
  higherTimeframe: Timeframe;
  marginPct: number;
  useSignalLeverage: boolean;
  maxLeverage: number;
  tp1ClosePct: number;
  tp2ClosePct: number;
  tp3ClosePct: number;
  autoBreakevenOnTp1: boolean;
  moveSlToTp1OnTp2: boolean;
  dailyMaxLossPct: number;
  maxOpenPositions: number;
  blockWeekends: boolean;
  macroBlackout: boolean;
  aiGateEnabled: boolean;
  aiMinConfidence: number;
  signalChannelHandle: string;
  mixerThreshold?: number;
  mixerWeights?: SignalMixerWeights;
}

export interface InstrumentSpec {
  symbol: string;
  basePrecision: number;
  quotePrecision: number;
  minTradeVolume: string;
  maxMarketVolume: string;
  minNotional?: string;
  minLeverage: number;
  maxLeverage: number;
  contractMultiplier?: string;
  status: 'OPEN' | 'HALTED';
}

export interface StrategySignalOutput {
  timestamp: number;
  closeTime: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signal: 'LONG' | 'SHORT' | 'NONE';
  reason: string;
  price: number;
  atr: number;
  rsi: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  entryLegs?: Array<{ label: string; price: number; weight: number }>;
}

export interface CustomIndicatorDefinition {
  id: string;
  name: string;
  description: string;
  defaultTimeframe: Timeframe;
  compute: (candles: Candle[], params?: Record<string, number>) => StrategySignalOutput[];
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  pnlUsd: number;
  pnlPct: number;
  feesUsd: number;
  exitReason: string;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  riskFreeTriggered: boolean;
}

export interface BacktestMetrics {
  initialBalance: number;
  finalEquity: number;
  netReturnUsd: number;
  netReturnPct: number;
  totalTrades: number;
  winRatePct: number;
  profitFactor: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  expectancyUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  totalFeesUsd: number;
  longTrades: number;
  shortTrades: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  riskFreeCount: number;
  sharpeEstimate: number;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; equity: number; drawdownPct: number }>;
}
