/**
 * AlphaPulse AI — Main Application
 */
import { useEffect } from 'react';
import { useChartStore } from '@/store/chartStore';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import StockHeader from '@/components/StockHeader';
import CandlestickChart from '@/components/CandlestickChart';
import SignalCard from '@/components/SignalCard';
import ForecastStatus from '@/components/ForecastStatus';
import IndicatorToolbar from '@/components/IndicatorToolbar';
import ForecastHistory from '@/components/ForecastHistory';
import styles from './App.module.css';

function FullscreenOverlay() {
  const forecast = useChartStore((s) => s.forecast);
  const signal = useChartStore((s) => s.signal);
  const symbol = useChartStore((s) => s.symbol);
  const candles = useChartStore((s) => s.candles);
  const last = candles[candles.length - 1];

  if (!forecast || !last) return null;

  const color = signal?.signal === 'BUY' ? '#26a641' : signal?.signal === 'SELL' ? '#da3633' : '#d29922';

  return (
    <div className={styles.fsOverlay}>
      <div className={styles.fsSymbol}>{symbol}</div>
      <div className={styles.fsPrice}>
        ₹{last.close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={styles.fsForecastLabel}>AI 5M FORECAST</div>
      <div className={styles.fsForecastPrice}>
        ₹{forecast.target_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className={styles.fsDir} style={{ color }}>
        {forecast.direction === 'UP' ? '↑' : forecast.direction === 'DOWN' ? '↓' : '→'}{' '}
        {(forecast.probability_up * 100).toFixed(1)}%
      </div>
      <div className={styles.fsConf}>
        CONFIDENCE {forecast.confidence_score.toFixed(0)}/100
      </div>
      {signal && signal.signal !== 'HOLD' && (
        <div className={styles.fsSignal} style={{ color }}>
          {signal.signal}
        </div>
      )}
    </div>
  );
}

export default function App() {
  useMarketWebSocket();
  const isFullscreen = useChartStore((s) => s.isFullscreen);
  const overlays = useChartStore((s) => s.overlays);

  // Escape key to exit fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        useChartStore.getState().setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  if (isFullscreen) {
    return (
      <div className={styles.fsContainer}>
        <StockHeader />
        <div className={styles.fsChartWrap}>
          <CandlestickChart />
          <FullscreenOverlay />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {/* Top header */}
      <StockHeader />

      {/* Forecast status bar */}
      <div className={styles.statusBar}>
        <ForecastStatus />
      </div>

      {/* Main layout */}
      <div className={styles.main}>
        {/* Chart area */}
        <div className={styles.chartArea}>
          <div className={styles.toolbarWrap}>
            <IndicatorToolbar />
          </div>
          <div className={styles.chartWrap}>
            <CandlestickChart />
          </div>
        </div>

        {/* Right sidebar */}
        <div className={styles.sidebar}>
          <SignalCard />
          {overlays.forecastHistory && (
            <div className={styles.historyWrap}>
              <ForecastHistory />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
