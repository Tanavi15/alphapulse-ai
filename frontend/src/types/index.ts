// ─── Domain types matching backend schemas exactly ───────────────────────────

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_bullish: boolean;
}

export interface ForecastPoint {
  timestamp: string;
  predicted_price: number;
  confidence_upper: number;
  confidence_lower: number;
  probability_up: number;
  probability_down: number;
  probability_neutral: number;
}

export interface ForecastData {
  current_price: number;
  target_price: number;
  target_timestamp: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  probability_up: number;
  probability_down: number;
  probability_neutral: number;
  confidence_score: number;
  confidence_interval: number;
  path: ForecastPoint[];
  predicted_candle_open: number;
  predicted_candle_high: number;
  predicted_candle_low: number;
  predicted_candle_close: number;
  method: string;
}

export interface SignalData {
  signal: 'BUY' | 'SELL' | 'HOLD';
  entry_price: number;
  target_1: number;
  target_2: number;
  stop_loss: number;
  risk_reward: number;
  timestamp: string;
  reason: string;
}

export interface IndicatorData {
  ema_9: (number | null)[];
  ema_21: (number | null)[];
  ema_50: (number | null)[];
  vwap: (number | null)[];
  bb_upper: (number | null)[];
  bb_middle: (number | null)[];
  bb_lower: (number | null)[];
  rsi: (number | null)[];
  macd: (number | null)[];
  macd_signal: (number | null)[];
  macd_hist: (number | null)[];
  volume_ratio: (number | null)[];
  volume_zscore: (number | null)[];
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d';
export type Period = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y';

export interface HistoricalForecast {
  id: string;
  generated_at: string;
  candle_index: number;
  forecast: ForecastData;
  signal: SignalData;
  actual_close?: number;
  was_correct?: boolean;
  error_amount?: number;
}

export type WsMessage =
  | {
      type: 'snapshot';
      symbol: string;
      interval: string;
      candles: Candle[];
      forecast: ForecastData;
      signal: SignalData;
      indicators: IndicatorData;
      timestamp: string;
    }
  | {
      type: 'update';
      symbol: string;
      interval: string;
      latest_candles: Candle[];
      forecast?: ForecastData;
      signal?: SignalData;
      timestamp: string;
    }
  | {
      type: 'error';
      message: string;
      timestamp: string;
    };

export interface OverlayToggles {
  ema9: boolean;
  ema21: boolean;
  ema50: boolean;
  vwap: boolean;
  bollingerBands: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
  aiForecast: boolean;
  confidenceBand: boolean;
  signals: boolean;
  targets: boolean;
  stopLoss: boolean;
  forecastHistory: boolean;
}
