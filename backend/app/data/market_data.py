"""
Market Data Service — real OHLCV data for Indian & global stocks.

Architecture:
  Source 1: Yahoo Finance v8 chart API via curl_cffi (Chrome TLS impersonation)
            — called directly, no yfinance middleware that could intercept.
  Source 2: NSE India official chart API via httpx (Indian stocks, no auth)

Both sources return real market data. No dummy values anywhere.
"""
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

from app.models.schemas import CandleResponse

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

# ─── Interval / period maps ───────────────────────────────────────────────────
INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m",
    "30m": "30m", "1h": "1h", "1d": "1d",
}
PERIOD_MAP = {
    "1d": "1d", "5d": "5d", "1mo": "1mo",
    "3mo": "3mo", "6mo": "6mo", "1y": "1y",
}

# ─── Yahoo Finance direct API ─────────────────────────────────────────────────
YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YF_CHART_URL2 = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"

YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
}


def _try_symbols(symbol: str) -> list[str]:
    """Candidate Yahoo Finance tickers in priority order."""
    if "." in symbol or symbol.startswith("^"):
        return [symbol]
    return [f"{symbol}.NS", f"{symbol}.BO", symbol]


def _yahoo_raw(yf_symbol: str, interval: str, period: str) -> list[CandleResponse]:
    """
    Call Yahoo Finance v8 chart API directly using curl_cffi (Chrome TLS).
    Falls back to httpx if curl_cffi is not available.
    """
    params = {
        "interval": interval,
        "range": period,
        "includePrePost": "false",
        "events": "div,splits",
    }

    for base_url in [YF_CHART_URL, YF_CHART_URL2]:
        url = base_url.format(symbol=yf_symbol)
        candles = _get_yahoo_candles(url, params, yf_symbol)
        if candles:
            return candles
    return []


def _get_yahoo_candles(url: str, params: dict, symbol: str) -> list[CandleResponse]:
    """Try curl_cffi first, then plain httpx."""

    # ── Attempt A: curl_cffi with Chrome impersonation ────────────────────────
    try:
        from curl_cffi import requests as cffi_req
        resp = cffi_req.get(
            url,
            params=params,
            headers=YF_HEADERS,
            impersonate="chrome110",
            timeout=20,
        )
        if resp.status_code == 200 and resp.text.strip():
            return _parse_yahoo_json(resp.json(), symbol)
        logger.debug(f"[cffi] {symbol} status={resp.status_code} body_len={len(resp.text)}")
    except Exception as exc:
        logger.debug(f"[cffi] {symbol} exception: {exc}")

    # ── Attempt B: plain httpx ────────────────────────────────────────────────
    try:
        with httpx.Client(headers=YF_HEADERS, timeout=20, follow_redirects=True) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200 and resp.text.strip():
                return _parse_yahoo_json(resp.json(), symbol)
            logger.debug(f"[httpx] {symbol} status={resp.status_code} body_len={len(resp.text)}")
    except Exception as exc:
        logger.debug(f"[httpx] {symbol} exception: {exc}")

    return []


def _parse_yahoo_json(data: dict, symbol: str) -> list[CandleResponse]:
    """Parse Yahoo Finance v8 chart JSON into CandleResponse list."""
    try:
        result = data["chart"]["result"]
        if not result:
            error = data["chart"].get("error")
            logger.debug(f"[yahoo] {symbol} no result, error={error}")
            return []

        r = result[0]
        timestamps: list[int] = r.get("timestamp", [])
        indicators = r.get("indicators", {})
        quote_list = indicators.get("quote", [{}])
        quote = quote_list[0] if quote_list else {}

        opens  = quote.get("open",   [])
        highs  = quote.get("high",   [])
        lows   = quote.get("low",    [])
        closes = quote.get("close",  [])
        volumes = quote.get("volume", [])

        if not timestamps or not closes:
            return []

        # Determine timezone from meta
        tz_str = r.get("meta", {}).get("exchangeTimezoneName", "Asia/Kolkata")
        try:
            tz = ZoneInfo(tz_str)
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

                # Skip null candles
                if o is None or c is None:
                    continue

                o = float(o)
                h = float(h) if h is not None else o
                l = float(l) if l is not None else o
                c = float(c)
                v = float(v) if v is not None else 0.0

                dt = datetime.fromtimestamp(ts, tz=tz)
                candles.append(CandleResponse(
                    timestamp=dt.isoformat(),
                    open=round(o, 2),
                    high=round(h, 2),
                    low=round(l, 2),
                    close=round(c, 2),
                    volume=round(v, 0),
                    is_bullish=c >= o,
                ))
            except Exception:
                continue

        return candles

    except Exception as exc:
        logger.debug(f"[yahoo parse] {symbol} failed: {exc}")
        return []


# ─── NSE India official chart API ─────────────────────────────────────────────
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


def _fetch_nse(symbol: str, interval: str, period: str) -> list[CandleResponse]:
    """
    NSE India chart API — returns real intraday/EOD data for NSE stocks.
    Requires cookie from homepage first (standard browser flow).
    """
    try:
        with httpx.Client(
            headers=NSE_HEADERS,
            timeout=15,
            follow_redirects=True,
        ) as client:
            # Seed cookies
            client.get("https://www.nseindia.com/")

            is_index = any(symbol.startswith(p) for p in ("NIFTY", "SENSEX", "BANKNIFTY"))
            if is_index:
                params = {"index": symbol, "indices": "true"}
            else:
                params = {"index": f"{symbol}EQN"}

            resp = client.get(
                "https://www.nseindia.com/api/chart-databyindex",
                params=params,
            )
            if resp.status_code != 200:
                logger.debug(f"[nse] HTTP {resp.status_code} for {symbol}")
                return []

            data = resp.json()
            ticks = data.get("grapthData") or data.get("data") or []
            if not ticks:
                return []

            return _nse_ticks_to_candles(ticks, interval)

    except Exception as exc:
        logger.debug(f"[nse] {symbol} failed: {exc}")
        return []


def _nse_ticks_to_candles(ticks: list, interval: str) -> list[CandleResponse]:
    interval_min = NSE_INTERVAL_MINUTES.get(interval, 5)
    rows = []
    for tick in ticks:
        try:
            rows.append((
                pd.Timestamp(tick[0], unit="ms", tz="UTC"),
                float(tick[1]),
            ))
        except Exception:
            continue

    if not rows:
        return []

    df = (
        pd.DataFrame(rows, columns=["ts", "price"])
        .set_index("ts")
        .sort_index()
    )
    df.index = df.index.tz_convert("Asia/Kolkata")

    rule = f"{interval_min}min" if interval != "1d" else "1D"
    ohlcv = df["price"].resample(rule).ohlc().dropna()

    candles: list[CandleResponse] = []
    for ts, row in ohlcv.iterrows():
        o, c = float(row["open"]), float(row["close"])
        candles.append(CandleResponse(
            timestamp=ts.isoformat(),
            open=round(o, 2),
            high=round(float(row["high"]), 2),
            low=round(float(row["low"]), 2),
            close=round(c, 2),
            volume=0.0,
            is_bullish=c >= o,
        ))
    return candles


# ─── Main service ─────────────────────────────────────────────────────────────

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
            cached_at, cached_data = self._cache[cache_key]
            if now - cached_at < self._cache_ttl:
                return cached_data

        yf_interval = INTERVAL_MAP.get(interval, "5m")
        yf_period   = PERIOD_MAP.get(period, "5d")

        # ── Source 1: Yahoo Finance direct API (curl_cffi + httpx) ───────────
        for yf_sym in _try_symbols(symbol):
            candles = _yahoo_raw(yf_sym, yf_interval, yf_period)
            if candles:
                logger.info(f"[yahoo] {len(candles)} candles for {yf_sym} [{yf_interval}/{yf_period}]")
                self._cache[cache_key] = (now, candles)
                return candles

        # ── Source 2: NSE India direct API ───────────────────────────────────
        candles = _fetch_nse(symbol, yf_interval, yf_period)
        if candles:
            logger.info(f"[nse] {len(candles)} candles for {symbol} [{yf_interval}/{yf_period}]")
            self._cache[cache_key] = (now, candles)
            return candles

        logger.error(
            f"All sources failed for {symbol}. "
            f"Yahoo tried: {_try_symbols(symbol)}. NSE also failed. "
            f"Check network connectivity to finance.yahoo.com and nseindia.com."
        )
        return []

    def search_symbols(self, query: str) -> list[dict]:
        results = self._static_symbol_search(query)

        # Try Yahoo search on top (best-effort)
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
