# AlphaPulse AI — Professional Trading Terminal

An AI-powered stock prediction platform with real-time candlestick charts, AI forecasting, and buy/sell signals.

---

## 🚀 How to Run (Anyone can do this in 5 minutes)

### Prerequisites

Install these first if you don't have them:

| Tool | Download | Check if installed |
|------|----------|--------------------|
| **Python 3.11+** | https://www.python.org/downloads/ | `python --version` |
| **Node.js 18+** | https://nodejs.org | `node --version` |
| **Git** | https://git-scm.com | `git --version` |

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/Tanavi15/alphapulse-ai.git
cd alphapulse-ai
```

---

### Step 2 — Start the Backend

Open a terminal and run:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:8000
```

---

### Step 3 — Start the Frontend

Open a **second terminal** (keep the first one running) and run:

```bash
cd frontend
npm install
npm run dev
```

You should see:
```
VITE ready in 500ms
➜ Local: http://localhost:5173/
```

---

### Step 4 — Open the app

Open your browser and go to:

```
http://localhost:5173
```

The app will load with a live candlestick chart for RELIANCE by default.

---

## 📈 How to Use

| Action | How |
|--------|-----|
| **Change stock** | Type any NSE symbol in the search box (e.g. TCS, INFY, HDFCBANK) |
| **Change timeframe** | Click 1M / 5M / 15M / 30M / 1H / 1D buttons |
| **Toggle indicators** | Click EMA 21, VWAP, RSI, MACD etc. in the toolbar |
| **View AI forecast** | Always visible on the right side of the chart |
| **Fullscreen** | Click the ⊡ button top right |
| **Past predictions** | Toggle "Past AI" in the indicator toolbar |

### Indian Stock Symbols

| Company | Symbol |
|---------|--------|
| Reliance Industries | `RELIANCE` |
| Tata Consultancy Services | `TCS` |
| HDFC Bank | `HDFCBANK` |
| Infosys | `INFY` |
| ICICI Bank | `ICICIBANK` |
| State Bank of India | `SBIN` |
| Bajaj Finance | `BAJFINANCE` |
| Nifty 50 Index | `^NSEI` |
| Sensex | `^BSESN` |

### US Stock Symbols

| Company | Symbol |
|---------|--------|
| Apple | `AAPL` |
| Tesla | `TSLA` |
| NVIDIA | `NVDA` |
| Microsoft | `MSFT` |

---

## 🏗️ Project Structure

```
alphapulse-ai/
├── backend/                    ← FastAPI Python backend
│   ├── app/
│   │   ├── main.py             ← API routes + WebSocket
│   │   ├── data/
│   │   │   └── market_data.py  ← Live data (yfinance + NSE)
│   │   ├── engine/
│   │   │   ├── forecast.py     ← AI prediction model
│   │   │   ├── signals.py      ← BUY/SELL/HOLD signals
│   │   │   └── indicators.py   ← EMA, RSI, MACD, VWAP etc.
│   │   └── models/
│   │       └── schemas.py      ← Data models
│   └── requirements.txt
│
├── frontend/                   ← React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── CandlestickChart.tsx  ← Main chart (ECharts)
│   │   │   ├── SignalCard.tsx        ← AI signal display
│   │   │   ├── StockHeader.tsx       ← Symbol search + price
│   │   │   ├── ForecastStatus.tsx    ← Live/stale indicator
│   │   │   ├── IndicatorToolbar.tsx  ← Toggle overlays
│   │   │   └── ForecastHistory.tsx   ← Past predictions
│   │   ├── hooks/
│   │   │   └── useMarketWebSocket.ts ← Live data connection
│   │   └── store/
│   │       └── chartStore.ts         ← App state
│   └── package.json
│
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Charts | Apache ECharts |
| State | Zustand |
| Backend | FastAPI + Python 3.11 |
| Live Data | WebSocket |
| Market Data | yfinance (Yahoo Finance) + NSE India API |
| AI Model | Ridge Regression on OHLCV features |
| Indicators | EMA, VWAP, Bollinger Bands, RSI, MACD |

---

## ❗ Troubleshooting

**Chart shows "Fetching live market data…"**
→ Make sure the backend is running on port 8000
→ Run: `python -m uvicorn app.main:app --port 8000 --reload` inside the `backend/` folder

**`pip install` fails**
→ Make sure you have Python 3.11+: `python --version`
→ Try: `pip install --upgrade pip` then retry

**`npm install` fails**
→ Make sure you have Node.js 18+: `node --version`
→ Download from https://nodejs.org

**Market is closed / no data**
→ NSE is open Mon–Fri 9:15 AM – 3:30 PM IST
→ Outside market hours, the chart shows the most recent historical data — this is normal

**Port already in use**
→ Backend: change port with `--port 8001`
→ Frontend: Vite will automatically use the next available port

---

## 📝 Notes

- All data is **real** — fetched live from Yahoo Finance and NSE India
- The AI model is trained on actual historical OHLCV data
- Confidence intervals are derived from real model residuals
- No dummy or simulated data anywhere

---

*Built with ❤️ using FastAPI + React + ECharts*
