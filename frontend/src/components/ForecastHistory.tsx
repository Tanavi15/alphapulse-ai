/**
 * Forecast History Panel — shows past AI predictions vs actual outcomes
 */
import { useChartStore } from '@/store/chartStore';
import styles from './ForecastHistory.module.css';

export default function ForecastHistory() {
  const history = useChartStore((s) => s.forecastHistory);
  const visible = history.filter((h) => h.was_correct !== undefined).slice(-10).reverse();

  if (!visible.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.title}>PAST AI PREDICTIONS</div>
        <div className={styles.empty}>No resolved predictions yet — check back after 5 minutes.</div>
      </div>
    );
  }

  function fmt(v: number) {
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtTime(ts: string) {
    try { return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
    catch { return ts; }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.title}>PAST AI PREDICTIONS</div>
      <div className={styles.list}>
        {visible.map((h) => (
          <div key={h.id} className={`${styles.row} ${h.was_correct ? styles.correct : styles.incorrect}`}>
            <div className={styles.rowHeader}>
              <span className={styles.tick}>{h.was_correct ? '✓ CORRECT' : '✕ INCORRECT'}</span>
              <span className={styles.time}>{fmtTime(h.generated_at)}</span>
            </div>
            <div className={styles.rowBody}>
              <div>
                <span className={styles.rowLabel}>AI PREDICTED</span>
                <span>₹{fmt(h.forecast.target_price)}</span>
              </div>
              <div>
                <span className={styles.rowLabel}>ACTUAL</span>
                <span>{h.actual_close != null ? `₹${fmt(h.actual_close)}` : '—'}</span>
              </div>
              <div>
                <span className={styles.rowLabel}>ERROR</span>
                <span style={{ color: Math.abs(h.error_amount ?? 0) < 1 ? '#3fb950' : '#f85149' }}>
                  {h.error_amount != null ? `₹${fmt(Math.abs(h.error_amount))}` : '—'}
                </span>
              </div>
              <div>
                <span className={styles.rowLabel}>DIRECTION</span>
                <span style={{ color: h.was_correct ? '#3fb950' : '#f85149' }}>
                  {h.forecast.direction}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
