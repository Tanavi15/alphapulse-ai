/**
 * AI Signal Card — shows current BUY/SELL/HOLD signal with full trade details
 */
import { useChartStore } from '@/store/chartStore';
import styles from './SignalCard.module.css';

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#26a641',
  SELL: '#da3633',
  HOLD: '#d29922',
};

export default function SignalCard() {
  const signal = useChartStore((s) => s.signal);
  const forecast = useChartStore((s) => s.forecast);
  if (!signal || !forecast) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Loading signal…</div>
      </div>
    );
  }

  const color = SIGNAL_COLORS[signal.signal] ?? '#8b949e';
  const dirArrow = forecast.direction === 'UP' ? '↑' : forecast.direction === 'DOWN' ? '↓' : '→';
  const dirLabel = forecast.direction === 'UP' ? 'BULLISH' : forecast.direction === 'DOWN' ? 'BEARISH' : 'NEUTRAL';

  function fmt(v: number) {
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className={styles.card}>
      {/* Signal badge */}
      <div className={styles.signalRow}>
        <span className={styles.badge} style={{ background: color }}>
          {signal.signal}
        </span>
        <span className={styles.direction} style={{ color }}>
          {dirArrow} {dirLabel} FORECAST
        </span>
      </div>

      {/* Probability bar */}
      <div className={styles.probRow}>
        <div className={styles.probBar}>
          <div
            className={styles.probFill}
            style={{ width: `${(forecast.probability_up * 100).toFixed(0)}%`, background: '#26a641' }}
          />
          <div
            className={styles.probFill}
            style={{ width: `${(forecast.probability_neutral * 100).toFixed(0)}%`, background: '#d29922' }}
          />
          <div
            className={styles.probFill}
            style={{ width: `${(forecast.probability_down * 100).toFixed(0)}%`, background: '#da3633' }}
          />
        </div>
        <div className={styles.probLabels}>
          <span style={{ color: '#26a641' }}>↑ {(forecast.probability_up * 100).toFixed(1)}%</span>
          <span style={{ color: '#d29922' }}>→ {(forecast.probability_neutral * 100).toFixed(1)}%</span>
          <span style={{ color: '#da3633' }}>↓ {(forecast.probability_down * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Target & Stop */}
      {signal.signal !== 'HOLD' && (
        <div className={styles.levels}>
          <div className={styles.levelRow} style={{ color: '#3fb950' }}>
            <span>TARGET 2</span>
            <span>₹{fmt(signal.target_2)}</span>
          </div>
          <div className={styles.levelRow} style={{ color: '#26a641' }}>
            <span>TARGET 1</span>
            <span>₹{fmt(signal.target_1)}</span>
          </div>
          <div className={styles.levelRow} style={{ color: '#58a6ff' }}>
            <span>AI FORECAST</span>
            <span>₹{fmt(forecast.target_price)}</span>
          </div>
          <div className={styles.levelRow} style={{ color: '#e6edf3' }}>
            <span>ENTRY</span>
            <span>₹{fmt(signal.entry_price)}</span>
          </div>
          <div className={styles.levelRow} style={{ color: '#f85149' }}>
            <span>STOP LOSS</span>
            <span>₹{fmt(signal.stop_loss)}</span>
          </div>
          <div className={styles.rrRow}>
            <span>R/R</span>
            <span style={{ color: signal.risk_reward >= 2 ? '#3fb950' : '#d29922' }}>
              1:{signal.risk_reward.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Confidence */}
      <div className={styles.confRow}>
        <span className={styles.confLabel}>CONFIDENCE</span>
        <span
          className={styles.confScore}
          style={{
            color:
              forecast.confidence_score >= 70
                ? '#3fb950'
                : forecast.confidence_score >= 40
                ? '#d29922'
                : '#f85149',
          }}
        >
          {forecast.confidence_score.toFixed(0)}/100
        </span>
      </div>

      {/* Method */}
      <div className={styles.method} title={forecast.method}>
        MODEL: ENSEMBLE v1.2
      </div>
    </div>
  );
}
