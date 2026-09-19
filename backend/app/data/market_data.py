"""
Market Data Service — real OHLCV data, no curl_cffi dependency.

Source priority:
  1. Yahoo Finance v8 chart API via httpx (HTTP/2 + Chrome headers)
  2. NSE India official chart API via httpx (Indian stocks, no auth)

Works on all cloud platforms (Railway, Render, Fly.io, Koyeb etc.)
without any native library dependencies.
"""
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

from app.models.schemas import CandleResponse

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

INTERVAL_MAP = {
    "1m": "1m",  "5m": "5m",  "15m": "15m",
    "30m": "30m", "1h": "1h",  "1d": "1d",
}
PERIOD_MAP = {
    "1d": "1d",  "5d": "5d",  "1mo": "1mo",
    "3mo": "3mo", "6mo": "6mo", "1y": "1y",
}

# Yahoo Finance v8 endpoints (try both for redundancy)
YF_URLS = [
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
    "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
]

# Headers that mimic a real Chrome browser — Yahoo requires these
YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}

NSE_INTERVAL_MINUTES = {
    "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440,
}


def _try_symbols(symbol: str) -> list[str]:
    if "." in symbol or symbol.startswith("^"):
        return [symbol]
    return [f"{symbol}.NS", f"{symbol}.BO", symbol]


def _fetch_yahoo(yf_symbol: str, interval: str, period: str) -> list[CandleResponse]:
    """Call Yahoo Finance v8 chart API directly with httpx."""
    params = {
        "interval": interval,
        "range": period,
        "includePrePost": "false",
        "events": "div,splits",
    }

    for url_tpl in YF_URLS:
        url = url_tpl.format(symbol=yf_symbol)
        try:
            with httpx.Client(
                headers=YF_HEADERS,
                timeout=20,
                follow_redirects=True,
            ) as client:
                resp = client.get(url, params=params)

            if resp.status_code != 200:
                logger.debug(f"[yahoo] {yf_symbol} HTTP {resp.status_code}")
                continue

            body = resp.text.strip()
            if not body:
                logger.debug(f"[yahoo] {yf_symbol} empty body")
                continue

            candles = _parse_yahoo_json(resp.json(), yf_symbol)
            if candles:
                return candles

        except Exception as exc:
            logger.debug(f"[yahoo] {yf_symbol} @ {url}: {exc}")
            continue

    return []


def _parse_yahoo_json(data: dict, symbol: str) -> list[CandleResponse]:
    try:
        result = data.get("chart", {}).get("result")
        if not result:
            err = data.get("chart", {}).get("error")
            logger.debug(f"[yahoo] {symbol} no result, error={err}")
            return []

        r = result[0]
        timestamps: list[int] = r.get("timestamp", [])
        quote = (r.get("indicators", {}).get("quote") or [{}])[0]

        opens   = quote.get("open",   [])
        highs   = quote.get("high",   [])
        lows    = quote.get("low",    [])
        closes  = quote.get("close",  [])
        volumes = quote.get("volume", [])

        if not timestamps or not closes:
            return []

        tz_name = r.get("meta", {}).get("exchangeTimezoneName", "Asia/Kolkata")
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = IST

        candles: list[CandleResponse] = []
        for i, ts in enumerate(timestamps):
            try:
                o = opens[i]
                h = highs[i]
                l = lows[i]
                c = closes[i]
                v = volumes[i] if i < len(volumes) else 0
                if o is None or c is None:
                    continue
                o, c = float(o), float(c)
                h = float(h) if h is not None else o
                l = float(l) if l is not None else o
                v = float(v) if v is not None else 0.0
                dt = datetime.fromtimestamp(ts, tz=tz)
                candles.append(CandleResponse(
                    timestamp=dt.isoformat(),
                    open=round(o, 2), high=round(h, 2),
                    low=round(l, 2),  close=round(c, 2),
                    volume=round(v, 0), is_bullish=c >= o,
                ))
            except Exception:
                continue
        return candles
    except Exception as exc:
        logger.debug(f"[yahoo parse] {symbol}: {exc}")
        return []


def _fetch_nse(symbol: str, interval: str) -> list[CandleResponse]:
    """NSE India chart API — works without any API key."""
    try:
        with httpx.Client(
            headers=NSE_HEADERS, timeout=15, follow_redirects=True
        ) as client:
            client.get("https://www.nseindia.com/")  # seed cookies

            is_index = any(
                symbol.startswith(p) for p in ("NIFTY", "SENSEX", "BANKNIFTY")
            )
            params = (
                {"index": symbol, "indices": "true"}
                if is_index
                else {"index": f"{symbol}EQN"}
            )
            resp = client.get(
                "https://www.nseindia.com/api/chart-databyindex",
                params=params,
            )
            if resp.status_code != 200:
                return []

            ticks = resp.json().get("grapthData") or resp.json().get("data") or []
            return _nse_ticks_to_candles(ticks, interval)
    except Exception as exc:
        logger.debug(f"[nse] {symbol}: {exc}")
        return []


def _nse_ticks_to_candles(ticks: list, interval: str) -> list[CandleResponse]:
    interval_min = NSE_INTERVAL_MINUTES.get(interval, 5)
    rows = []
    for tick in ticks:
        try:
            rows.append((pd.Timestamp(tick[0], unit="ms", tz="UTC"), float(tick[1])))
        except Exception:
            continue
    if not rows:
        return []

    df = (
        pd.DataFrame(rows, columns=["ts", "price"])
        .set_index("ts").sort_index()
    )
    df.index = df.index.tz_convert("Asia/Kolkata")
    rule = f"{interval_min}min" if interval != "1d" else "1D"
    ohlcv = df["price"].resample(rule).ohlc().dropna()

    candles: list[CandleResponse] = []
    for ts, row in ohlcv.iterrows():
        o, c = float(row["open"]), float(row["close"])
        candles.append(CandleResponse(
            timestamp=ts.isoformat(),
            open=round(o, 2), high=round(float(row["high"]), 2),
            low=round(float(row["low"]), 2), close=round(c, 2),
            volume=0.0, is_bullish=c >= o,
        ))
    return candles


class MarketDataService:
    def __init__(self):
        self._cache: dict[str, tuple[float, list[CandleResponse]]] = {}
        self._cache_ttl = 30  # seconds

    def fetch_candles(
        self,
        symbol: str,
        interval: str = "5m",
        period: str = "5d",
    ) -> list[CandleResponse]:
        cache_key = f"{symbol}:{interval}:{period}"
        now = datetime.now(timezone.utc).timestamp()

        if cache_key in self._cache:
            cached_at, data = self._cache[cache_key]
            if now - cached_at < self._cache_ttl:
                return data

        yf_interval = INTERVAL_MAP.get(interval, "5m")
        yf_period   = PERIOD_MAP.get(period, "5d")

        # Source 1: Yahoo Finance direct API
        for sym in _try_symbols(symbol):
            candles = _fetch_yahoo(sym, yf_interval, yf_period)
            if candles:
                logger.info(f"[yahoo] {len(candles)} candles for {sym}")
                self._cache[cache_key] = (now, candles)
                return candles

        # Source 2: NSE India direct API
        candles = _fetch_nse(symbol, yf_interval)
        if candles:
            logger.info(f"[nse] {len(candles)} candles for {symbol}")
            self._cache[cache_key] = (now, candles)
            return candles

        logger.error(f"All sources failed for {symbol}")
        return []

    def search_symbols(self, query: str) -> list[dict]:
        results = self._static_symbol_search(query)
        try:
            import yfinance as yf
            data = yf.Search(query, max_results=10)
            yf_results = []
            for item in data.quotes:
                sym = item.get("symbol", "")
                yf_results.append({
                    "symbol": sym.replace(".NS", "").replace(".BO", ""),
                    "name": item.get("longname") or item.get("shortname", ""),
                    "exchange": item.get("exchDisp", ""),
                    "type": item.get("quoteType", ""),
                })
            if yf_results:
                return yf_results[:10]
        except Exception:
            pass
        return results

    def _static_symbol_search(self, query: str) -> list[dict]:
        q = query.upper()
        popular = [
            ("RELIANCE",   "Reliance Industries Ltd",   "NSE"),
            ("TCS",        "Tata Consultancy Services", "NSE"),
            ("HDFCBANK",   "HDFC Bank Ltd",             "NSE"),
            ("INFY",       "Infosys Ltd",               "NSE"),
            ("HINDUNILVR", "Hindustan Unilever",        "NSE"),
            ("ICICIBANK",  "ICICI Bank Ltd",            "NSE"),
            ("KOTAKBANK",  "Kotak Mahindra Bank",       "NSE"),
            ("BHARTIARTL", "Bharti Airtel Ltd",         "NSE"),
            ("ITC",        "ITC Ltd",                   "NSE"),
            ("SBIN",       "State Bank of India",       "NSE"),
            ("BAJFINANCE", "Bajaj Finance Ltd",         "NSE"),
            ("LT",         "Larsen & Toubro Ltd",       "NSE"),
            ("AXISBANK",   "Axis Bank Ltd",             "NSE"),
            ("WIPRO",      "Wipro Ltd",                 "NSE"),
            ("HCLTECH",    "HCL Technologies",          "NSE"),
            ("ASIANPAINT", "Asian Paints Ltd",          "NSE"),
            ("MARUTI",     "Maruti Suzuki India",       "NSE"),
            ("SUNPHARMA",  "Sun Pharmaceutical",        "NSE"),
            ("TITAN",      "Titan Company Ltd",         "NSE"),
            ("ULTRACEMCO", "UltraTech Cement",          "NSE"),
            ("AAPL",       "Apple Inc",                 "NASDAQ"),
            ("TSLA",       "Tesla Inc",                 "NASDAQ"),
            ("NVDA",       "NVIDIA Corp",               "NASDAQ"),
            ("MSFT",       "Microsoft Corp",            "NASDAQ"),
            ("GOOGL",      "Alphabet Inc",              "NASDAQ"),
            ("^NSEI",      "NIFTY 50",                  "NSE"),
            ("^BSESN",     "BSE SENSEX",                "BSE"),
        ]
        return [
            {"symbol": sym, "name": name, "exchange": exch, "type": "EQUITY"}
            for sym, name, exch in popular
            if q in sym or q in name.upper()
        ][:10]
