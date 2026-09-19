# AlphaPulse AI — Professional Trading Terminal

A full-stack AI-powered stock prediction platform built with FastAPI + React/TypeScript.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│   React + TypeScript + Vite + ECharts + Zustand                 │
│   http://localhost:5173                                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │  REST + WebSocket
┌─────────────────────▼───────────────────────────────────────────┐
│                         BACKEND                                 │
│   FastAPI + uvicorn                                             │
│   http://localhost:8000                                         │
│                                                                 │
│   MarketDataService  →  yfinance (real NSE/BSE/US data)         │
│   IndicatorEngine    →  EMA, VWAP, Bollinger, RSI, MACD        │
│   ForecastEngine     →  Ridge regression on OHLCV features      │
│   SignalEngine       →  BUY/SELL/HOLD from forecast + ATR       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Terminal 1 — Backend

```powershell
.\start_backend.ps1
```

Or manually:

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Terminal 2 — Frontend

```powershell
.\start_frontend.ps1
```

Or manually:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Chart Features

| Feature | Description |
|---------|-------------|
| **Candlestick chart** | Real OHLCV candles from Yahoo Finance (NSE/BSE/US) |
| **AI Forecast** | Ridge regression on EMA/RSI/BB/Volume features |
| **Confidence Band** | Empirical 95% CI from model residuals + √t scaling |
| **Predicted Candle** | Semi-transparent OHLC projection at T+5min |
| **NOW Divider** | Animated vertical boundary at current time |
| **BUY/SELL markers** | Plotted on actual candles when signal fires |
| **Target / Stop levels** | Horizontal lines computed from ATR |
| **Volume pane** | Color-coded bar chart below main chart |
| **Technical indicators** | EMA 9/21/50, VWAP, Bollinger Bands, RSI, MACD |
| **Crosshair tooltip** | Full OHLCV + indicator values on hover |
| **Forecast history** | Past prediction accuracy tracking |
| **Fullscreen mode** | `⊡` button or `Esc` to exit |
| **Timeframe switching** | 1M / 5M / 15M / 30M / 1H / 1D |
| **Symbol search** | Live search via yfinance |
| **WebSocket live updates** | Real-time candle + forecast refresh |

---

## AI Model

The forecast engine uses **Ridge Regression** trained on a walk-forward window of real OHLCV data.

**Features:**
- Fractional returns (1, 3, 5 bars)
- EMA ratio (9/21)
- RSI (14)
- Bollinger Band position
- Volume Z-score
- Candle body ratio
- ATR normalized

**Confidence Intervals:**
Derived from in-sample residual standard deviation, scaled by √t (random-walk uncertainty growth).

> The model is explicitly labeled "ENSEMBLE v1.2" in the UI and the confidence band includes a tooltip explaining that it represents model uncertainty, not guaranteed price ranges.

---

## Indian Stock Symbols

| Stock | Symbol to enter |
|-------|----------------|
| Reliance | `RELIANCE` |
| TCS | `TCS` |
| HDFC Bank | `HDFCBANK` |
| Infosys | `INFY` |
| Nifty 50 | `^NSEI` |
| Sensex | `^BSESN` |

US stocks work too: `AAPL`, `TSLA`, `NVDA`, etc.

---

## Project Structure

```
Stocks_prediction/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI app + WebSocket
│   │   ├── data/
│   │   │   └── market_data.py   ← yfinance data service
│   │   ├── engine/
│   │   │   ├── forecast.py      ← AI prediction engine
│   │   │   ├── signals.py       ← BUY/SELL/HOLD signal engine
│   │   │   └── indicators.py    ← Technical indicators
│   │   └── models/
│   │       └── schemas.py       ← Pydantic models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CandlestickChart.tsx   ← ★ Hero chart component
│   │   │   ├── SignalCard.tsx         ← AI signal + trade levels
│   │   │   ├── ForecastStatus.tsx     ← Live status bar
│   │   │   ├── IndicatorToolbar.tsx   ← Overlay toggles
│   │   │   ├── StockHeader.tsx        ← Symbol + price header
│   │   │   └── ForecastHistory.tsx    ← Past prediction accuracy
│   │   ├── hooks/
│   │   │   └── useMarketWebSocket.ts  ← WS connection manager
│   │   ├── store/
│   │   │   └── chartStore.ts          ← Zustand global state
│   │   └── types/
│   │       └── index.ts               ← TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
├── start_backend.ps1
├── start_frontend.ps1
└── README.md
```
