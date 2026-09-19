from pydantic import BaseModel
from typing import Optional


class CandleResponse(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    is_bullish: bool


class ForecastPoint(BaseModel):
    timestamp: str
    predicted_price: float
    confidence_upper: float
    confidence_lower: float
    probability_up: float
    probability_down: float
    probability_neutral: float


class ForecastData(BaseModel):
    current_price: float
    target_price: float
    target_timestamp: str
    direction: str          # "UP" | "DOWN" | "NEUTRAL"
    probability_up: float
    probability_down: float
    probability_neutral: float
    confidence_score: float  # 0-100
    confidence_interval: float  # e.g. 0.95
    path: list[ForecastPoint]
    predicted_candle_open: float
    predicted_candle_high: float
    predicted_candle_low: float
    predicted_candle_close: float
    method: str              # model description


class SignalData(BaseModel):
    signal: str              # "BUY" | "SELL" | "HOLD"
    entry_price: float
    target_1: float
    target_2: float
    stop_loss: float
    risk_reward: float
    timestamp: str
    reason: str


class ForecastResponse(BaseModel):
    symbol: str
    forecast: ForecastData
    signal: SignalData
    generated_at: str


class IndicatorResponse(BaseModel):
    ema_9: list[Optional[float]]
    ema_21: list[Optional[float]]
    ema_50: list[Optional[float]]
    vwap: list[Optional[float]]
    bb_upper: list[Optional[float]]
    bb_middle: list[Optional[float]]
    bb_lower: list[Optional[float]]
    rsi: list[Optional[float]]
    macd: list[Optional[float]]
    macd_signal: list[Optional[float]]
    macd_hist: list[Optional[float]]
    volume_ratio: list[Optional[float]]
    volume_zscore: list[Optional[float]]


class LiveUpdateMessage(BaseModel):
    type: str
    symbol: str
    interval: str
    latest_candles: list[CandleResponse]
    forecast: Optional[ForecastData] = None
    signal: Optional[SignalData] = None
    timestamp: str
