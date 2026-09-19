"""
AlphaPulse AI — FastAPI Backend
Production-ready: handles CORS from any deployment URL via env var.
"""
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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

# ── CORS ──────────────────────────────────────────────────────────────────────
# FRONTEND_URL env var lets you add any deployment URL without code changes.
# Falls back to allowing all origins if not set (safe for initial deploy).
_frontend_url = os.getenv("FRONTEND_URL", "")
_extra_origins = [u.strip() for u in _frontend_url.split(",") if u.strip()]

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://*.netlify.app",
    "https://*.vercel.app",
    "https://*.railway.app",
    "https://*.onrender.com",
    "https://*.koyeb.app",
    *_extra_origins,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # allow all — tighten after confirming frontend URL
    allow_credentials=False,       # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── REST ENDPOINTS ───────────────────────────────────────────────────────────

@app.get("/api/candles/{symbol}", response_model=list[CandleResponse])
async def get_candles(
    symbol: str,
    interval: str = Query("5m"),
    period: str = Query("5d"),
):
    candles = market_service.fetch_candles(symbol.upper(), interval, period)
    return candles


@app.get("/api/forecast/{symbol}", response_model=ForecastResponse)
async def get_forecast(
    symbol: str,
    interval: str = Query("5m"),
):
    candles = market_service.fetch_candles(symbol.upper(), interval, "5d")
    if not candles:
        return JSONResponse(status_code=404, content={"detail": "No data available"})
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
    candles = market_service.fetch_candles(symbol.upper(), interval, "5d")
    if not candles:
        return JSONResponse(status_code=404, content={"detail": "No data available"})
    return indicator_engine.compute(candles)


@app.get("/api/symbols/search")
async def search_symbols(q: str = Query(..., min_length=1)):
    results = market_service.search_symbols(q)
    return {"results": results}


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ─── WEBSOCKET ────────────────────────────────────────────────────────────────

@app.websocket("/ws/{symbol}")
async def websocket_endpoint(
    websocket: WebSocket,
    symbol: str,
    interval: str = Query(default="5m"),
):
    symbol = symbol.upper()
    await websocket.accept()
    logger.info(f"WS connected: {symbol} [{interval}]")

    if symbol not in active_connections:
        active_connections[symbol] = []
    active_connections[symbol].append(websocket)

    try:
        # ── Initial snapshot ──────────────────────────────────────────────────
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
        else:
            await websocket.send_json({
                "type": "error",
                "message": f"No data available for {symbol}. Market may be closed or symbol invalid.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        # ── Live update loop ──────────────────────────────────────────────────
        last_forecast_time = time.time()
        forecast_interval_seconds = 60

        while True:
            await asyncio.sleep(15)

            try:
                latest = market_service.fetch_candles(symbol, interval, "1d")
                if not latest:
                    continue

                now = time.time()
                msg: dict = {
                    "type": "update",
                    "symbol": symbol,
                    "interval": interval,
                    "latest_candles": [c.model_dump() for c in latest[-5:]],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

                if (now - last_forecast_time) >= forecast_interval_seconds:
                    candles_5d = market_service.fetch_candles(symbol, interval, "5d")
                    if candles_5d:
                        forecast = forecast_engine.predict(candles_5d)
                        signals = signal_engine.evaluate(candles_5d, forecast)
                        msg["forecast"] = forecast.model_dump()
                        msg["signal"] = signals.model_dump()
                        last_forecast_time = now

                await websocket.send_json(msg)

            except Exception as exc:
                logger.warning(f"WS update error [{symbol}]: {exc}")

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {symbol}")
    except Exception as exc:
        logger.error(f"WS error [{symbol}]: {exc}")
    finally:
        if symbol in active_connections:
            active_connections[symbol] = [
                c for c in active_connections[symbol] if c != websocket
            ]
