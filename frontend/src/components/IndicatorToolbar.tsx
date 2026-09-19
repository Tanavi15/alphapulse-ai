/**
 * Indicator toolbar — toggles for all chart overlays
 */
import React from 'react';
import { useChartStore } from '@/store/chartStore';
import type { OverlayToggles } from '@/types';
import styles from './IndicatorToolbar.module.css';

interface ToggleItem {
  key: keyof OverlayToggles;
  label: string;
  color: string;
}

const TOGGLES: ToggleItem[] = [
  { key: 'ema9',           label: 'EMA 9',       color: '#79c0ff' },
  { key: 'ema21',          label: 'EMA 21',      color: '#d2a8ff' },
  { key: 'ema50',          label: 'EMA 50',      color: '#ffa657' },
  { key: 'vwap',           label: 'VWAP',        color: '#ffdf5d' },
  { key: 'bollingerBands', label: 'BB',          color: '#58a6ff' },
  { key: 'rsi',            label: 'RSI',         color: '#d2a8ff' },
  { key: 'macd',           label: 'MACD',        color: '#79c0ff' },
  { key: 'volume',         label: 'Volume',      color: '#26a641' },
  { key: 'aiForecast',     label: 'AI Forecast', color: '#3fb950' },
  { key: 'confidenceBand', label: 'Conf Band',   color: '#58a6ff' },
  { key: 'signals',        label: 'Signals',     color: '#ffdf5d' },
  { key: 'targets',        label: 'Targets',     color: '#3fb950' },
  { key: 'stopLoss',       label: 'Stop Loss',   color: '#f85149' },
  { key: 'forecastHistory',label: 'Past AI',     color: '#d2a8ff' },
];

export default function IndicatorToolbar() {
  const overlays = useChartStore((s) => s.overlays);
  const toggleOverlay = useChartStore((s) => s.toggleOverlay);

  return (
    <div className={styles.toolbar}>
      <span className={styles.label}>Indicators</span>
      {TOGGLES.map(({ key, label, color }) => (
        <button
          key={key}
          className={`${styles.btn} ${overlays[key] ? styles.active : ''}`}
          onClick={() => toggleOverlay(key)}
          style={overlays[key] ? { borderColor: color, color } : {}}
          title={label}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
