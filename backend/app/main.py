"""
AlphaPulse AI — FastAPI Backend
Provides live candle data, AI forecasting, signal engine, and WebSocket feeds.
"""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.data.market_data import MarketDataService
from app.engine.forecast import ForecastEngine
from app.engine.signals import SignalEngine
from app.engine.indicators import IndicatorEngine
from app.models.schemas import (
    CandleResponse,
    ForecastResponse,
    IndicatorResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

market_service = MarketDataService()
forecast_engine = ForecastEngine()
signal_engine = SignalEngine()
indicator_engine = IndicatorEngine()

# Active WebSocket connections keyed by symbol
active_connections: dict[str, list[WebSocket]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AlphaPulse AI backend starting up...")
    yield
    logger.info("AlphaPulse AI backend shutting down...")


app = FastAPI(
    title="AlphaPulse AI",
    description="Professional AI-powered stock prediction platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── REST ENDPOINTS ──────────────────────────────────────────────────────────

@app.get("/api/candles/{symbol}", response_model=list[CandleResponse])
async def get_candles(
    symbol: str,
    interval: str = Query("5m", description="1m,5m,15m,30m,1h,1d"),
    period: str = Query("5d", description="1d,5d,1mo,3mo,6mo,1y"),
):
    """Return OHLCV candles for symbol."""
    candles = market_service.fetch_candles(symbol.upper(), interval, period)
    return candles


@app.get("/api/forecast/{symbol}", response_model=ForecastResponse)
async def get_forecast(
    symbol: str,
    interval: str = Query("5m"),
):
    """Return AI forecast for the next 5 minutes."""
    candles = market_service.fetch_candles(symbol.upper(), interval, "5d")
    if not candles:
        return JSONResponse(status_code=404, content={"detail": "No data"})
    forecast = forecast_engine.predict(candles)
    signals = signal_engine.evaluate(candles, forecast)
    return ForecastResponse(
        symbol=symbol.upper(),
        forecast=forecast,
        signal=signals,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/api/indicators/{symbol}", response_model=IndicatorResponse)
async def get_indicators(
    symbol: str,
    interval: str = Query("5m"),
):
    """Return technical indicators for symbol."""
    candles = market_service.fetch_candles(symbol.upper(), interval, "5d")
    if not candles:
        return JSONResponse(status_code=404, content={"detail": "No data"})
    indicators = indicator_engine.compute(candles)
    return indicators


@app.get("/api/symbols/search")
async def search_symbols(q: str = Query(..., min_length=1)):
    """Search for stock symbols."""
    results = market_service.search_symbols(q)
    return {"results": results}


# ─── WEBSOCKET ────────────────────────────────────────────────────────────────

@app.websocket("/ws/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str, interval: str = Query(default="5m")):
    symbol = symbol.upper()
    await websocket.accept()
    logger.info(f"WebSocket connected: {symbol}")

    if symbol not in active_connections:
        active_connections[symbol] = []
    active_connections[symbol].append(websocket)

    try:
        # Send initial full snapshot
        candles = market_service.fetch_candles(symbol, interval, "5d")
        if candles:
            forecast = forecast_engine.predict(candles)
            signals = signal_engine.evaluate(candles, forecast)
            indicators = indicator_engine.compute(candles)

            await websocket.send_json({
                "type": "snapshot",
                "symbol": symbol,
                "interval": interval,
                "candles": [c.model_dump() for c in candles],
                "forecast": forecast.model_dump(),
                "signal": signals.model_dump(),
                "indicators": indicators.model_dump(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        last_forecast_time = time.time()
        forecast_interval_seconds = 60  # Refresh forecast every 60s

        while True:
            await asyncio.sleep(15)  # Poll every 15 seconds

            try:
                candles = market_service.fetch_candles(symbol, interval, "1d")
                if not candles:
                    continue

                now = time.time()
                should_forecast = (now - last_forecast_time) >= forecast_interval_seconds

                forecast = None
                signals = None
                if should_forecast:
                    candles_5d = market_service.fetch_candles(symbol, interval, "5d")
                    forecast = forecast_engine.predict(candles_5d or candles)
                    signals = signal_engine.evaluate(candles_5d or candles, forecast)
                    last_forecast_time = now

                msg: dict = {
                    "type": "update",
                    "symbol": symbol,
                    "interval": interval,
                    "latest_candles": [c.model_dump() for c in candles[-5:]],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if forecast:
                    msg["forecast"] = forecast.model_dump()
                if signals:
                    msg["signal"] = signals.model_dump()

                await websocket.send_json(msg)

            except Exception as inner_exc:
                logger.warning(f"Update error for {symbol}: {inner_exc}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {symbol}")
    except Exception as exc:
        logger.error(f"WebSocket error for {symbol}: {exc}")
    finally:
        if symbol in active_connections:
            active_connections[symbol] = [
                c for c in active_connections[symbol] if c != websocket
            ]


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
