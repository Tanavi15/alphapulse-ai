/**
 * Forecast Status Bar — shows live/stale status, model info, next update countdown
 */
import React from 'react';
import { useChartStore } from '@/store/chartStore';
import styles from './ForecastStatus.module.css';

export default function ForecastStatus() {
  const wsStatus = useChartStore((s) => s.wsStatus);
  const lastUpdate = useChartStore((s) => s.lastUpdate);
  const forecastUpdatedAt = useChartStore((s) => s.forecastUpdatedAt);
  const nextForecastIn = useChartStore((s) => s.nextForecastIn);
  const forecast = useChartStore((s) => s.forecast);

  const isLive = wsStatus === 'connected';

  function fmtTime(ts: string | null): string {
    if (!ts) return '--:--:--';
    try {
      return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch { return '--'; }
  }

  function pad(n: number): string {
    return n.toString().padStart(2, '0');
  }
  const mins = Math.floor(nextForecastIn / 60);
  const secs = nextForecastIn % 60;

  return (
    <div className={styles.bar}>
      {/* Live indicator */}
      <div className={styles.statusDot}>
        <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotStale}`} />
        <span style={{ color: isLive ? '#3fb950' : '#f85149' }}>
          {isLive ? 'LIVE DATA' : wsStatus === 'connecting' ? 'CONNECTING…' : 'DATA STALE'}
        </span>
      </div>

      <div className={styles.sep} />

      {/* Model status */}
      <div className={styles.item}>
        <span className={styles.label}>AI MODEL</span>
        <span style={{ color: forecast ? '#3fb950' : '#d29922' }}>
          {forecast ? 'ONLINE' : 'LOADING'}
        </span>
      </div>

      <div className={styles.sep} />

      {/* Forecast updated at */}
      <div className={styles.item}>
        <span className={styles.label}>FORECAST UPDATED</span>
        <span>{fmtTime(forecastUpdatedAt)}</span>
      </div>

      <div className={styles.sep} />

      {/* Next update countdown */}
      <div className={styles.item}>
        <span className={styles.label}>NEXT UPDATE</span>
        <span>{pad(mins)}:{pad(secs)}</span>
      </div>

      <div className={styles.sep} />

      {/* Model name */}
      <div className={styles.item}>
        <span className={styles.label}>MODEL</span>
        <span style={{ color: '#bc8cff' }}>ENSEMBLE v1.2</span>
      </div>

      {!isLive && wsStatus === 'stale' && (
        <>
          <div className={styles.sep} />
          <div className={styles.staleWarning}>FORECAST PAUSED — reconnecting…</div>
        </>
      )}
    </div>
  );
}
