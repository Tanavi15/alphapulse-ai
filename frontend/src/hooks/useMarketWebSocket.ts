import { useEffect, useRef, useCallback } from 'react';
import { useChartStore } from '@/store/chartStore';
import type { WsMessage, HistoricalForecast } from '@/types';
import { WS_BASE } from '@/config';
const RECONNECT_DELAY = 3000;
const FORECAST_COUNTDOWN = 60;

export function useMarketWebSocket() {
  const store = useChartStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const startCountdown = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    store.resetNextForecast(FORECAST_COUNTDOWN);
    countdownTimer.current = setInterval(() => {
      store.tickNextForecast();
    }, 1000);
  }, [store]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const { symbol, interval } = useChartStore.getState();
    const url = `${WS_BASE}/ws/${symbol}?interval=${interval}`;

    store.setWsStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        store.setWsStatus('connected');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg: WsMessage = JSON.parse(event.data);
          const state = useChartStore.getState();

          if (msg.type === 'error') {
            console.error('Backend error:', msg.message);
            store.setWsStatus('stale');
            return;
          }

          if (msg.type === 'snapshot') {
            state.setCandles(msg.candles);
            state.setForecast(msg.forecast);
            state.setSignal(msg.signal);
            state.setIndicators(msg.indicators);
            state.setLastUpdate(msg.timestamp);
            state.setForecastUpdatedAt(msg.timestamp);
            startCountdown();

            // Record this forecast to history
            const histEntry: HistoricalForecast = {
              id: `${msg.timestamp}-${msg.symbol}`,
              generated_at: msg.timestamp,
              candle_index: msg.candles.length - 1,
              forecast: msg.forecast,
              signal: msg.signal,
            };
            state.pushForecastHistory(histEntry);
          } else if (msg.type === 'update') {
            state.mergeLatestCandles(msg.latest_candles);
            state.setLastUpdate(msg.timestamp);

            if (msg.forecast) {
              state.setForecast(msg.forecast);
              state.setForecastUpdatedAt(msg.timestamp);
              startCountdown();

              // Store in history
              const histEntry: HistoricalForecast = {
                id: `${msg.timestamp}-${msg.symbol}`,
                generated_at: msg.timestamp,
                candle_index: state.candles.length - 1,
                forecast: msg.forecast,
                signal: msg.signal ?? state.signal!,
              };
              state.pushForecastHistory(histEntry);
            }
            if (msg.signal) {
              state.setSignal(msg.signal);
            }

            // Resolve any past forecasts now that we have newer data
            state.resolveHistoricalForecasts(state.candles);
          }
        } catch (err) {
          console.error('WS parse error', err);
        }
      };

      ws.onerror = () => {
        store.setWsStatus('error');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        store.setWsStatus('stale');
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };
    } catch (err) {
      store.setWsStatus('error');
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    }
  }, [store, startCountdown]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.symbol, store.interval]);

  const disconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
  }, []);

  return { disconnect };
}
