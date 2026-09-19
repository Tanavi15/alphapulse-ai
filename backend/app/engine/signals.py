"""
Signal Engine.
Generates BUY / SELL / HOLD signals from forecast + technical indicators.
All values derived from real market data — no placeholders.
"""
import logging
from datetime import datetime, timezone

from app.models.schemas import CandleResponse, ForecastData, SignalData

logger = logging.getLogger(__name__)

ATR_STOP_MULTIPLIER = 1.5
ATR_TARGET1_MULTIPLIER = 2.0
ATR_TARGET2_MULTIPLIER = 3.5
MIN_CONFIDENCE = 55.0
MIN_PROBABILITY = 0.55


class SignalEngine:
    def evaluate(
        self,
        candles: list[CandleResponse],
        forecast: ForecastData,
    ) -> SignalData:
        if not candles or forecast is None:
            return self._hold(0.0)

        entry = float(candles[-1].close)
        # Estimate ATR from last 14 candles
        atr = self._atr(candles, 14)

        prob_up = forecast.probability_up
        prob_down = forecast.probability_down
        confidence = forecast.confidence_score

        # Require meaningful edge before committing to a signal
        if (
            confidence >= MIN_CONFIDENCE
            and prob_up >= MIN_PROBABILITY
            and forecast.direction == "UP"
        ):
            signal = "BUY"
            stop_loss = round(entry - ATR_STOP_MULTIPLIER * atr, 2)
            target_1 = round(entry + ATR_TARGET1_MULTIPLIER * atr, 2)
            target_2 = round(entry + ATR_TARGET2_MULTIPLIER * atr, 2)
            reason = (
                f"AI UP forecast {prob_up*100:.1f}% probability, "
                f"confidence {confidence:.0f}/100"
            )

        elif (
            confidence >= MIN_CONFIDENCE
            and prob_down >= MIN_PROBABILITY
            and forecast.direction == "DOWN"
        ):
            signal = "SELL"
            stop_loss = round(entry + ATR_STOP_MULTIPLIER * atr, 2)
            target_1 = round(entry - ATR_TARGET1_MULTIPLIER * atr, 2)
            target_2 = round(entry - ATR_TARGET2_MULTIPLIER * atr, 2)
            reason = (
                f"AI DOWN forecast {prob_down*100:.1f}% probability, "
                f"confidence {confidence:.0f}/100"
            )

        else:
            return self._hold(entry)

        risk = abs(entry - stop_loss)
        reward = abs(target_1 - entry)
        rr = round(reward / risk, 2) if risk > 0 else 0.0

        return SignalData(
            signal=signal,
            entry_price=round(entry, 2),
            target_1=target_1,
            target_2=target_2,
            stop_loss=stop_loss,
            risk_reward=rr,
            timestamp=datetime.now(timezone.utc).isoformat(),
            reason=reason,
        )

    def _hold(self, entry: float) -> SignalData:
        return SignalData(
            signal="HOLD",
            entry_price=round(entry, 2),
            target_1=0.0,
            target_2=0.0,
            stop_loss=0.0,
            risk_reward=0.0,
            timestamp=datetime.now(timezone.utc).isoformat(),
            reason="Insufficient confidence for directional signal.",
        )

    def _atr(self, candles: list[CandleResponse], period: int = 14) -> float:
        if len(candles) < 2:
            return 0.0
        recent = candles[-min(period + 1, len(candles)):]
        trs = []
        for i in range(1, len(recent)):
            prev_close = recent[i - 1].close
            cur = recent[i]
            tr = max(
                cur.high - cur.low,
                abs(cur.high - prev_close),
                abs(cur.low - prev_close),
            )
            trs.append(tr)
        return sum(trs) / len(trs) if trs else 0.0
