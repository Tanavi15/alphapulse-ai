"""
Technical Indicator Engine.
Computes EMA, VWAP, Bollinger Bands, RSI, MACD, Volume stats from real OHLCV data.
"""
import logging
from typing import Optional

import numpy as np
import pandas as pd

from app.models.schemas import CandleResponse, IndicatorResponse

logger = logging.getLogger(__name__)


def _series(candles: list[CandleResponse], field: str) -> pd.Series:
    return pd.Series([getattr(c, field) for c in candles], dtype=float)


def _safe_list(s: pd.Series) -> list[Optional[float]]:
    return [None if np.isnan(v) else round(float(v), 4) for v in s]


class IndicatorEngine:
    def compute(self, candles: list[CandleResponse]) -> IndicatorResponse:
        if len(candles) < 5:
            empty: list[Optional[float]] = [None] * len(candles)
            return IndicatorResponse(
                ema_9=empty, ema_21=empty, ema_50=empty,
                vwap=empty, bb_upper=empty, bb_middle=empty, bb_lower=empty,
                rsi=empty, macd=empty, macd_signal=empty, macd_hist=empty,
                volume_ratio=empty, volume_zscore=empty,
            )

        close = _series(candles, "close")
        high = _series(candles, "high")
        low = _series(candles, "low")
        volume = _series(candles, "volume")

        # EMA
        ema9 = close.ewm(span=9, adjust=False).mean()
        ema21 = close.ewm(span=21, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()

        # VWAP (cumulative within available data)
        typical = (high + low + close) / 3
        cum_vol = volume.cumsum()
        cum_tp_vol = (typical * volume).cumsum()
        vwap = cum_tp_vol / cum_vol.replace(0, np.nan)

        # Bollinger Bands (20, 2)
        rolling_mean = close.rolling(20).mean()
        rolling_std = close.rolling(20).std()
        bb_upper = rolling_mean + 2 * rolling_std
        bb_lower = rolling_mean - 2 * rolling_std

        # RSI (14)
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))

        # MACD (12, 26, 9)
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd = ema12 - ema26
        macd_signal = macd.ewm(span=9, adjust=False).mean()
        macd_hist = macd - macd_signal

        # Volume ratio (current vs 20-period average)
        vol_avg = volume.rolling(20).mean()
        vol_ratio = volume / vol_avg.replace(0, np.nan)

        # Volume Z-score
        vol_std = volume.rolling(20).std()
        vol_zscore = (volume - vol_avg) / vol_std.replace(0, np.nan)

        return IndicatorResponse(
            ema_9=_safe_list(ema9),
            ema_21=_safe_list(ema21),
            ema_50=_safe_list(ema50),
            vwap=_safe_list(vwap),
            bb_upper=_safe_list(bb_upper),
            bb_middle=_safe_list(rolling_mean),
            bb_lower=_safe_list(bb_lower),
            rsi=_safe_list(rsi),
            macd=_safe_list(macd),
            macd_signal=_safe_list(macd_signal),
            macd_hist=_safe_list(macd_hist),
            volume_ratio=_safe_list(vol_ratio),
            volume_zscore=_safe_list(vol_zscore),
        )
