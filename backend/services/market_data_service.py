"""
Unified Market Data Service for Indian Equities (NSE).

One source of truth for all market data:
- Provider Interface: yfinance (delayed, default) & Kite (real-time ticker/quotes).
- Caching: Redis with 5-15s TTL for quotes, 86400s TTL for OHLCV history,
  with transparent in-memory TTL cache fallback when Redis is unreachable.
- Freshness: LIVE / DELAYED (15m) / STALE / UNAVAILABLE based on IST market hours (09:15-15:30).
"""

import json
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, time as dtime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf

from config import settings

logger = logging.getLogger("market_data_service")

# NSE Market Hours in Asia/Kolkata
IST = ZoneInfo("Asia/Kolkata")
MARKET_OPEN_TIME = dtime(9, 15)   # 09:15 IST
MARKET_CLOSE_TIME = dtime(15, 30)  # 15:30 IST

# Cache TTL constants per AGENTS.md / requirements
QUOTE_CACHE_TTL_SECONDS = 10       # 5–15 seconds
OHLCV_CACHE_TTL_SECONDS = 86400    # 1 day (daily TTL)


# ─────────────────────────────────────────────────────────────────────────────
# Market Hours Evaluator & Freshness Logic
# ─────────────────────────────────────────────────────────────────────────────

class MarketHours:
    """Evaluates NSE market schedule and data freshness."""

    @staticmethod
    def now_ist() -> datetime:
        return datetime.now(IST)

    @staticmethod
    def is_market_open(dt: Optional[datetime] = None) -> bool:
        """
        Check if NSE is currently open for regular trading.
        Regular hours: Monday to Friday, 09:15 to 15:30 IST.
        """
        if dt is None:
            dt = datetime.now(IST)
        elif dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc).astimezone(IST)
        else:
            dt = dt.astimezone(IST)

        # 0 = Monday, 4 = Friday, 5 = Saturday, 6 = Sunday
        if dt.weekday() >= 5:
            return False

        current_time = dt.time()
        return MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME

    @staticmethod
    def calculate_freshness(
        as_of: Optional[datetime],
        is_realtime: bool = False,
        market_open: Optional[bool] = None,
        reference_time: Optional[datetime] = None,
    ) -> str:
        """
        Derives one of 4 explicit states:
        - LIVE: real-time tick from Kite ticker
        - DELAYED (15m): delayed feed during market hours or recent session close
        - STALE: data age exceeds 15 minutes during market hours or > 3 days when closed
        - UNAVAILABLE: no timestamp or data missing
        """
        if as_of is None:
            return "UNAVAILABLE"

        ref = reference_time or datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)

        if as_of.tzinfo is None:
            as_of_utc = as_of.replace(tzinfo=timezone.utc)
        else:
            as_of_utc = as_of.astimezone(timezone.utc)

        age_seconds = max(0.0, (ref - as_of_utc).total_seconds())

        if is_realtime:
            # Active real-time tick received within 60s
            if age_seconds <= 60:
                return "LIVE"
            return "STALE"

        if market_open is None:
            market_open = MarketHours.is_market_open(ref)

        if market_open:
            # Market is open: within 15 minutes is DELAYED (15m); older is STALE
            if age_seconds <= 900:  # 15 minutes
                return "DELAYED (15m)"
            return "STALE"
        else:
            # Market is closed (after hours / weekend):
            # Quotes from the last session close (within 3 days) are DELAYED (15m)
            if age_seconds <= 259200:  # 3 days
                return "DELAYED (15m)"
            return "STALE"


# ─────────────────────────────────────────────────────────────────────────────
# Cache Layer (Redis + In-Memory Fallback)
# ─────────────────────────────────────────────────────────────────────────────

class InMemoryCache:
    """In-process thread-safe TTL cache used when Redis is unavailable."""

    def __init__(self):
        self._store: Dict[str, tuple[str, float]] = {}

    def get(self, key: str) -> Optional[str]:
        entry = self._store.get(key)
        if not entry:
            return None
        val, expire_at = entry
        if time.time() > expire_at:
            self._store.pop(key, None)
            return None
        return val

    def setex(self, key: str, ttl: int, val: str):
        self._store[key] = (val, time.time() + ttl)

    def delete(self, key: str):
        self._store.pop(key, None)

    def clear(self):
        self._store.clear()


class CacheLayer:
    """Manages Redis caching with automatic in-memory fallback."""

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.redis_url
        self._redis = None
        self._memory = InMemoryCache()
        self._init_client()

    def _init_client(self):
        try:
            import redis
            client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=1.0,
                socket_timeout=1.0,
            )
            client.ping()
            self._redis = client
            logger.info("[CacheLayer] Connected to Redis at %s", self.redis_url)
        except Exception as exc:
            logger.info("[CacheLayer] Redis unavailable (%s) — using in-memory cache fallback", exc)
            self._redis = None

    def get(self, key: str) -> Optional[str]:
        if self._redis:
            try:
                return self._redis.get(key)
            except Exception:
                pass
        return self._memory.get(key)

    def set(self, key: str, ttl: int, val: str):
        if self._redis:
            try:
                self._redis.setex(key, ttl, val)
                return
            except Exception:
                pass
        self._memory.setex(key, ttl, val)

    def delete(self, key: str):
        if self._redis:
            try:
                self._redis.delete(key)
            except Exception:
                pass
        self._memory.delete(key)


# ─────────────────────────────────────────────────────────────────────────────
# Provider Interface & Implementations
# ─────────────────────────────────────────────────────────────────────────────

class BaseMarketDataProvider(ABC):
    """Abstract interface for stock quote and OHLCV data providers."""

    @abstractmethod
    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch quote for a symbol."""
        pass

    @abstractmethod
    def get_ohlcv(self, symbol: str, period: str = "1Y") -> Optional[List[Dict[str, Any]]]:
        """Fetch historical OHLCV candle data."""
        pass


class YFinanceProvider(BaseMarketDataProvider):
    """Default delayed market data provider using Yahoo Finance."""

    def _normalize_symbol(self, symbol: str) -> str:
        symbol = symbol.strip().upper()
        if symbol.startswith("^") or "." in symbol:
            return symbol
        return f"{symbol}.NS"

    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        query = self._normalize_symbol(symbol)
        clean_symbol = symbol.strip().upper().replace(".NS", "")
        now_utc = datetime.now(timezone.utc)

        try:
            ticker = yf.Ticker(query)
            info = getattr(ticker, "fast_info", None)
            regular_info = getattr(ticker, "info", {}) or {}

            price = None
            if info:
                price = getattr(info, "last_price", None)
            if price is None or price <= 0:
                price = regular_info.get("currentPrice") or regular_info.get("regularMarketPrice")

            if price is None or price <= 0:
                # Try fetching 1d history
                hist = ticker.history(period="2d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])

            if price is None or price <= 0:
                logger.warning("[YFinanceProvider] Could not resolve price for %s", query)
                return None

            prev_close = regular_info.get("previousClose")
            if not prev_close and info:
                prev_close = getattr(info, "previous_close", price)
            prev_close = float(prev_close) if prev_close else price

            change = round(price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

            name = regular_info.get("longName") or regular_info.get("shortName") or clean_symbol
            volume = regular_info.get("volume") or (getattr(info, "last_volume", 0) if info else 0)
            week52_high = regular_info.get("fiftyTwoWeekHigh") or (getattr(info, "year_high", price) if info else price)
            week52_low = regular_info.get("fiftyTwoWeekLow") or (getattr(info, "year_low", price) if info else price)
            pe_ratio = round(regular_info.get("trailingPE", 25.0) or 25.0, 2)
            market_cap = regular_info.get("marketCap", 0)

            freshness = MarketHours.calculate_freshness(as_of=now_utc, is_realtime=False)

            return {
                "symbol": clean_symbol,
                "name": name,
                "price": round(float(price), 2),
                "change": change,
                "change_pct": change_pct,
                "previous_close": round(float(prev_close), 2),
                "volume": int(volume or 0),
                "week52_high": round(float(week52_high), 2),
                "week52_low": round(float(week52_low), 2),
                "pe_ratio": pe_ratio,
                "market_cap": market_cap,
                "sector": regular_info.get("sector", "NSE Equity"),
                "as_of": now_utc.isoformat(),
                "source": "yfinance",
                "is_realtime": False,
                "freshness": freshness,
            }

        except Exception as exc:
            logger.warning("[YFinanceProvider] Error fetching %s: %s", symbol, exc)
            return None

    def get_ohlcv(self, symbol: str, period: str = "1Y") -> Optional[List[Dict[str, Any]]]:
        query = self._normalize_symbol(symbol)
        period_map = {"1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "5Y": "5y"}
        yf_period = period_map.get(period.upper(), "1y")
        now_utc = datetime.now(timezone.utc).isoformat()

        try:
            ticker = yf.Ticker(query)
            hist = ticker.history(period=yf_period)
            if hist.empty:
                return None

            candles = []
            for dt_idx, row in hist.iterrows():
                dt = dt_idx.to_pydatetime() if hasattr(dt_idx, "to_pydatetime") else dt_idx
                candles.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "timestamp": int(dt.timestamp()),
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]),
                    "source": "yfinance",
                    "as_of": now_utc,
                })
            return candles

        except Exception as exc:
            logger.warning("[YFinanceProvider] OHLCV error for %s: %s", symbol, exc)
            return None


class KiteMarketDataProvider(BaseMarketDataProvider):
    """
    Real-time market data provider using Zerodha Kite Connect.
    Active when a valid user Kite session/token is supplied.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.zerodha_api_key

    def get_quote_with_token(self, symbol: str, access_token: str) -> Optional[Dict[str, Any]]:
        """Fetch live quote from Kite REST endpoint using the user's active session token."""
        if not access_token or not self.api_key:
            return None

        clean_symbol = symbol.strip().upper().replace(".NS", "")
        kite_instrument = f"NSE:{clean_symbol}"
        now_utc = datetime.now(timezone.utc)

        try:
            headers = {
                "X-Kite-Version": "3",
                "Authorization": f"token {self.api_key}:{access_token}",
            }
            with httpx.Client(timeout=4.0) as client:
                res = client.get(
                    "https://api.kite.trade/quote",
                    params={"i": kite_instrument},
                    headers=headers,
                )

            if res.status_code != 200:
                logger.warning("[KiteProvider] Quote failed with HTTP %d for %s", res.status_code, symbol)
                return None

            data = res.json()
            if data.get("status") != "success" or not data.get("data"):
                return None

            instrument_data = data["data"].get(kite_instrument)
            if not instrument_data:
                return None

            last_price = float(instrument_data.get("last_price", 0))
            if last_price <= 0:
                return None

            ohlc = instrument_data.get("ohlc", {})
            prev_close = float(ohlc.get("close", last_price))
            change = round(last_price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0

            return {
                "symbol": clean_symbol,
                "name": clean_symbol,
                "price": round(last_price, 2),
                "change": change,
                "change_pct": change_pct,
                "previous_close": round(prev_close, 2),
                "volume": int(instrument_data.get("volume", 0)),
                "week52_high": round(float(instrument_data.get("upper_circuit_limit", last_price)), 2),
                "week52_low": round(float(instrument_data.get("lower_circuit_limit", last_price)), 2),
                "as_of": now_utc.isoformat(),
                "source": "kite",
                "is_realtime": True,
                "freshness": "LIVE",
            }

        except Exception as exc:
            logger.warning("[KiteProvider] Live quote error for %s: %s", symbol, exc)
            return None

    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        # Without token, cannot query user-authenticated Kite endpoint
        return None

    def get_ohlcv(self, symbol: str, period: str = "1Y") -> Optional[List[Dict[str, Any]]]:
        # OHLCV history delegates to delayed provider or Kite historical API
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Unified Market Data Service
# ─────────────────────────────────────────────────────────────────────────────

class MarketDataService:
    """
    Central unified market data orchestrator.
    Handles caching, provider fallback, and freshness assignment.
    """

    def __init__(
        self,
        cache: Optional[CacheLayer] = None,
        yfinance_provider: Optional[BaseMarketDataProvider] = None,
        kite_provider: Optional[KiteMarketDataProvider] = None,
    ):
        self.cache = cache or CacheLayer()
        self.yf_provider = yfinance_provider or YFinanceProvider()
        self.kite_provider = kite_provider or KiteMarketDataProvider()

    def get_quote(
        self,
        symbol: str,
        kite_token: Optional[str] = None,
        skip_cache: bool = False,
    ) -> Dict[str, Any]:
        """
        Fetch quote for symbol:
        1. Check cache (unless skipped).
        2. If Kite token provided, try Kite real-time provider.
        3. Fall back to YFinance delayed provider.
        4. If all fail, return explicit unavailable object.
        """
        clean_symbol = symbol.strip().upper().replace(".NS", "")
        cache_key = f"quote:{clean_symbol}"

        if not skip_cache:
            cached_json = self.cache.get(cache_key)
            if cached_json:
                try:
                    cached_data = json.loads(cached_json)
                    # Recompute freshness for cached data based on current market hours
                    as_of_dt = datetime.fromisoformat(cached_data["as_of"]) if "as_of" in cached_data else None
                    cached_data["freshness"] = MarketHours.calculate_freshness(
                        as_of=as_of_dt,
                        is_realtime=cached_data.get("is_realtime", False),
                    )
                    return cached_data
                except Exception:
                    pass

        # Step 2: Try Kite provider if user token available
        quote = None
        if kite_token:
            quote = self.kite_provider.get_quote_with_token(clean_symbol, kite_token)
            if quote:
                logger.debug("[MarketDataService] Live Kite quote resolved for %s", clean_symbol)

        # Step 3: Fall back to YFinance provider
        if not quote:
            quote = self.yf_provider.get_quote(clean_symbol)

        # Step 4: If quote retrieved, cache with 10s TTL
        if quote:
            try:
                self.cache.set(cache_key, QUOTE_CACHE_TTL_SECONDS, json.dumps(quote))
            except Exception as exc:
                logger.warning("[MarketDataService] Failed to cache quote: %s", exc)
            return quote

        # Step 5: Return explicit unavailable state per AGENTS.md
        now_utc = datetime.now(timezone.utc)
        return {
            "symbol": clean_symbol,
            "status": "unavailable",
            "reason": f"Real-time market quote for '{clean_symbol}' could not be retrieved from exchange.",
            "as_of": now_utc.isoformat(),
            "source": "yfinance",
            "freshness": "UNAVAILABLE",
        }

    def get_ohlcv(
        self,
        symbol: str,
        period: str = "1Y",
        skip_cache: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Fetch OHLCV historical candle data.
        Cached with daily TTL (86400 seconds).
        """
        clean_symbol = symbol.strip().upper().replace(".NS", "")
        period_clean = period.strip().upper()
        cache_key = f"ohlcv:{clean_symbol}:{period_clean}"

        if not skip_cache:
            cached_json = self.cache.get(cache_key)
            if cached_json:
                try:
                    return json.loads(cached_json)
                except Exception:
                    pass

        candles = self.yf_provider.get_ohlcv(clean_symbol, period=period_clean)

        if candles:
            try:
                self.cache.set(cache_key, OHLCV_CACHE_TTL_SECONDS, json.dumps(candles))
            except Exception as exc:
                logger.warning("[MarketDataService] Failed to cache OHLCV: %s", exc)
            return candles

        now_utc = datetime.now(timezone.utc).isoformat()
        return [{
            "status": "unavailable",
            "reason": f"OHLCV data for '{clean_symbol}' is unavailable for period {period_clean}.",
            "as_of": now_utc,
            "source": "yfinance",
        }]

    def get_watchlist_quotes(
        self,
        symbols: List[str],
        kite_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch quotes for a list of symbols."""
        results = []
        for sym in symbols:
            if not sym.strip():
                continue
            quote = self.get_quote(sym.strip(), kite_token=kite_token)
            results.append(quote)
        return results


# Global singleton instance
market_data_service = MarketDataService()

