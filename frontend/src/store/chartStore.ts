import { create } from 'zustand';
import type {
  Candle,
  ForecastData,
  SignalData,
  IndicatorData,
  Interval,
  Period,
  HistoricalForecast,
  OverlayToggles,
} from '@/types';

interface ChartState {
  // Symbol / timeframe
  symbol: string;
  interval: Interval;
  period: Period;

  // Market data
  candles: Candle[];
  forecast: ForecastData | null;
  signal: SignalData | null;
  indicators: IndicatorData | null;

  // Forecast history (for "show past predictions" feature)
  forecastHistory: HistoricalForecast[];

  // Connection status
  wsStatus: 'connecting' | 'connected' | 'stale' | 'error';
  lastUpdate: string | null;
  nextForecastIn: number; // seconds
  forecastUpdatedAt: string | null;

  // UI state
  isFullscreen: boolean;
  overlays: OverlayToggles;

  // Actions
  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  setPeriod: (period: Period) => void;
  setCandles: (candles: Candle[]) => void;
  mergeLatestCandles: (latest: Candle[]) => void;
  setForecast: (forecast: ForecastData) => void;
  setSignal: (signal: SignalData) => void;
  setIndicators: (indicators: IndicatorData) => void;
  pushForecastHistory: (entry: HistoricalForecast) => void;
  resolveHistoricalForecasts: (candles: Candle[]) => void;
  setWsStatus: (status: ChartState['wsStatus']) => void;
  setLastUpdate: (ts: string) => void;
  setForecastUpdatedAt: (ts: string) => void;
  tickNextForecast: () => void;
  resetNextForecast: (seconds: number) => void;
  setFullscreen: (v: boolean) => void;
  toggleOverlay: (key: keyof OverlayToggles) => void;
}

const defaultOverlays: OverlayToggles = {
  ema9: false,
  ema21: true,
  ema50: false,
  vwap: true,
  bollingerBands: false,
  rsi: true,
  macd: false,
  volume: true,
  aiForecast: true,
  confidenceBand: true,
  signals: true,
  targets: true,
  stopLoss: true,
  forecastHistory: false,
};

export const useChartStore = create<ChartState>((set, get) => ({
  symbol: 'RELIANCE',
  interval: '5m',
  period: '5d',
  candles: [],
  forecast: null,
  signal: null,
  indicators: null,
  forecastHistory: [],
  wsStatus: 'connecting',
  lastUpdate: null,
  nextForecastIn: 60,
  forecastUpdatedAt: null,
  isFullscreen: false,
  overlays: defaultOverlays,

  setSymbol: (symbol) => set({ symbol, candles: [], forecast: null, signal: null, indicators: null }),
  setInterval: (interval) => set({ interval, candles: [] }),
  setPeriod: (period) => set({ period }),
  setCandles: (candles) => set({ candles }),

  mergeLatestCandles: (latest) => {
    const { candles } = get();
    if (!candles.length) {
      set({ candles: latest });
      return;
    }
    const tsSet = new Set(latest.map((c) => c.timestamp));
    const base = candles.filter((c) => !tsSet.has(c.timestamp));
    const merged = [...base, ...latest].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    set({ candles: merged });
  },

  setForecast: (forecast) => set({ forecast }),
  setSignal: (signal) => set({ signal }),
  setIndicators: (indicators) => set({ indicators }),

  pushForecastHistory: (entry) => {
    const { forecastHistory } = get();
    // Keep last 50 historical forecasts
    const trimmed = forecastHistory.slice(-49);
    set({ forecastHistory: [...trimmed, entry] });
  },

  resolveHistoricalForecasts: (candles) => {
    const { forecastHistory } = get();
    if (!forecastHistory.length || !candles.length) return;

    const updated = forecastHistory.map((h) => {
      if (h.was_correct !== undefined) return h; // already resolved

      const targetTs = new Date(h.forecast.target_timestamp).getTime();
      const matchingCandle = candles.find(
        (c) => Math.abs(new Date(c.timestamp).getTime() - targetTs) < 5 * 60 * 1000
      );

      if (!matchingCandle) return h;

      const actual = matchingCandle.close;
      const predicted = h.forecast.target_price;
      const error = actual - predicted;
      const predictedDir = h.forecast.direction;
      const actualDir =
        actual > h.forecast.current_price
          ? 'UP'
          : actual < h.forecast.current_price
          ? 'DOWN'
          : 'NEUTRAL';

      return {
        ...h,
        actual_close: actual,
        error_amount: parseFloat(error.toFixed(2)),
        was_correct: predictedDir === actualDir,
      };
    });

    set({ forecastHistory: updated });
  },

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setLastUpdate: (ts) => set({ lastUpdate: ts }),
  setForecastUpdatedAt: (ts) => set({ forecastUpdatedAt: ts }),
  tickNextForecast: () =>
    set((s) => ({ nextForecastIn: Math.max(0, s.nextForecastIn - 1) })),
  resetNextForecast: (seconds) => set({ nextForecastIn: seconds }),
  setFullscreen: (isFullscreen) => set({ isFullscreen }),
  toggleOverlay: (key) =>
    set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
}));
