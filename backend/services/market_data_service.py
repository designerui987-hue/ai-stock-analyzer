"""
Unified Market Data Service with Exchange Calendar, Scoped Caching & WS Fast Path.

Invariants:
- Market hours & holidays delegated to `services.nse_calendar`.
- `exchange_timestamp` / `last_trade_timestamp` / `as_of` are strictly upstream timestamps;
  `None` if unknown — NEVER overwrite missing/old observation times with `datetime.now()`.
- Live Kite WebSocket ticks (`kite_ws_collector`) bypass the 10s REST quote cache.
- Cache keys are strictly scoped by `(provider, entitlement, exchange, symbol)`.
- Circuit limits are never mapped to `week52_high` / `week52_low`.
"""

from abc import ABC, abstractmethod
from datetime import datetime, time as dtime, timezone
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf

from config import settings
from services.broker_service import resolve_user_kite_credentials
from services.kite_ws_collector import kite_ws_collector
from services.nse_calendar import get_market_session, is_regular_or_special_open, to_ist

logger = logging.getLogger("market_data_service")

IST = ZoneInfo("Asia/Kolkata")
MARKET_OPEN_TIME = dtime(9, 15)
MARKET_CLOSE_TIME = dtime(15, 30)

QUOTE_CACHE_TTL_SECONDS = 10
OHLCV_CACHE_TTL_SECONDS = 86400

SUPPORTED_EXCHANGES = frozenset({"NSE", "BSE"})


def _parse_iso_to_utc(value: Any) -> Optional[datetime]:
    """Parse ISO string or aware/naive datetime into UTC datetime, or return None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            # Handle Kite 'YYYY-MM-DD HH:MM:SS' (IST if naive) or ISO
            if "T" not in raw and len(raw) == 19 and raw[10] == " ":
                parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)
                return parsed.astimezone(timezone.utc)
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return None
    return None


class MarketHours:
    """Evaluates NSE trading calendar and strict observation freshness."""

    @staticmethod
    def now_ist() -> datetime:
        return to_ist()

    @staticmethod
    def get_market_session(dt: Optional[datetime] = None) -> str:
        return get_market_session(dt)

    @staticmethod
    def is_market_open(dt: Optional[datetime] = None) -> bool:
        return is_regular_or_special_open(dt)

    @staticmethod
    def calculate_freshness(
        as_of: Optional[Any] = None,
        is_realtime: bool = False,
        market_open: Optional[bool] = None,
        reference_time: Optional[datetime] = None,
    ) -> str:
        """
        Return one of:
        LIVE | DELAYED | STALE | MARKET_CLOSED | UNAVAILABLE
        Never promotes missing/stale timestamps or non-realtime feeds to LIVE.
        """
        obs_dt = _parse_iso_to_utc(as_of)
        if obs_dt is None:
            return "UNAVAILABLE"

        ref = _parse_iso_to_utc(reference_time) or datetime.now(timezone.utc)
        age_seconds = (ref - obs_dt).total_seconds()
        is_open_now = (
            market_open if market_open is not None else is_regular_or_special_open(ref)
        )

        if not is_open_now:
            # Old snapshot (> 5 days) is stale even outside market hours
            if age_seconds > 86400 * 5:
                return "STALE"
            return "MARKET_CLOSED"

        if is_realtime and age_seconds <= 120:
            return "LIVE"
        if age_seconds <= 1800:
            return "DELAYED"
        return "STALE"

    @staticmethod
    def compute_age_seconds(
        as_of: Optional[Any],
        reference_time: Optional[datetime] = None,
    ) -> Optional[float]:
        obs_dt = _parse_iso_to_utc(as_of)
        if obs_dt is None:
            return None
        ref = _parse_iso_to_utc(reference_time) or datetime.now(timezone.utc)
        return round(max(0.0, (ref - obs_dt).total_seconds()), 2)


class InMemoryCache:
    """Thread-safe in-memory TTL cache used when Redis is unavailable."""

    def __init__(self):
        self._store: Dict[str, tuple] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            val, exp = item
            if exp and time.monotonic() > exp:
                del self._store[key]
                return None
            return val

    def setex(self, key: str, ttl: int, val: str):
        with self._lock:
            self._store[key] = (val, time.monotonic() + ttl if ttl > 0 else None)

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def clear(self):
        with self._lock:
            self._store.clear()


class CacheLayer:
    """Unified Redis + InMemory fallback cache layer."""

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.redis_url
        self._redis = None
        self._memory = InMemoryCache()
        self._init_client()

    def _init_client(self):
        if not self.redis_url or self.redis_url.startswith("memory://"):
            return
        try:
            import redis
            client = redis.from_url(self.redis_url, decode_responses=True, socket_timeout=1.5)
            client.ping()
            self._redis = client
            logger.info("Connected to Redis cache successfully.")
        except Exception as exc:
            logger.warning("Redis unavailable (%s); falling back to InMemoryCache.", exc)
            self._redis = None

    @property
    def is_redis_connected(self) -> bool:
        return self._redis is not None

    def get(self, key: str) -> Optional[str]:
        if self._redis is not None:
            try:
                return self._redis.get(key)
            except Exception as exc:
                logger.warning("Redis get error (%s); reading InMemoryCache.", exc)
        return self._memory.get(key)

    def set(self, key: str, ttl: int, val: str):
        if self._redis is not None:
            try:
                self._redis.setex(key, ttl, val)
                return
            except Exception as exc:
                logger.warning("Redis set error (%s); writing InMemoryCache.", exc)
        self._memory.setex(key, ttl, val)

    def delete(self, key: str):
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception:
                pass
        self._memory.delete(key)


class BaseMarketDataProvider(ABC):
    """Abstract interface for quote and OHLCV data providers."""

    @abstractmethod
    def get_quote(self, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_ohlcv(self, symbol: str, period: str = "1Y", exchange: str = "NSE") -> Optional[List[Dict[str, Any]]]:
        pass


class YFinanceProvider(BaseMarketDataProvider):
    """Delayed fallback market data provider using Yahoo Finance (`yfinance`)."""

    def _normalize_symbol(self, symbol: str, exchange: str = "NSE") -> str:
        clean = symbol.strip().upper()
        ex_upper = exchange.strip().upper()
        if clean.endswith(".NS") or clean.endswith(".BO") or clean.startswith("^"):
            return clean
        if ex_upper == "BSE":
            return f"{clean}.BO"
        return f"{clean}.NS"

    def get_quote(self, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        ex_upper = exchange.strip().upper()
        yf_symbol = self._normalize_symbol(symbol, exchange=ex_upper)
        clean = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        received_dt = datetime.now(timezone.utc)

        try:
            ticker = yf.Ticker(yf_symbol)
            info: Dict[str, Any] = {}
            try:
                info = ticker.info or {}
            except Exception:
                info = {}

            price = info.get("regularMarketPrice") or info.get("currentPrice")
            prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
            raw_mkt_time = info.get("regularMarketTime")
            obs_dt = _parse_iso_to_utc(raw_mkt_time)

            # Always try recent bar to corroborate price & observation time if info lacked one
            if price is None or obs_dt is None:
                hist = ticker.history(period="5d", interval="1d")
                if not hist.empty:
                    latest = hist.iloc[-1]
                    if price is None:
                        price = float(latest["Close"])
                    if prev_close is None and len(hist) > 1:
                        prev_close = float(hist.iloc[-2]["Close"])
                    if obs_dt is None:
                        idx_ts = hist.index[-1]
                        if hasattr(idx_ts, "to_pydatetime"):
                            obs_dt = _parse_iso_to_utc(idx_ts.to_pydatetime())

            if price is None or float(price) <= 0:
                return None

            price_f = round(float(price), 2)
            prev_f = round(float(prev_close), 2) if prev_close else price_f
            change = round(price_f - prev_f, 2)
            change_pct = round((change / prev_f) * 100.0, 2) if prev_f > 0 else 0.0

            as_of_iso = obs_dt.isoformat() if obs_dt is not None else None
            freshness = MarketHours.calculate_freshness(
                as_of=obs_dt,
                is_realtime=False,
                reference_time=received_dt,
            )

            return {
                "symbol": clean,
                "exchange": ex_upper,
                "yf_symbol": yf_symbol,
                "name": info.get("shortName") or info.get("longName") or clean,
                "price": price_f,
                "prev_close": prev_f,
                "change": change,
                "change_percent": change_pct,
                "open": info.get("regularMarketOpen") or info.get("open"),
                "high": info.get("regularMarketDayHigh") or info.get("dayHigh"),
                "low": info.get("regularMarketDayLow") or info.get("dayLow"),
                "volume": info.get("regularMarketVolume") or info.get("volume"),
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "pb_ratio": info.get("priceToBook"),
                "week52_high": info.get("fiftyTwoWeekHigh"),
                "week52_low": info.get("fiftyTwoWeekLow"),
                "sector": info.get("sector"),
                "exchange_timestamp": as_of_iso,
                "last_trade_timestamp": as_of_iso,
                "as_of": as_of_iso,
                "received_at": received_dt.isoformat(),
                "price_age_seconds": MarketHours.compute_age_seconds(obs_dt, received_dt),
                "market_session": MarketHours.get_market_session(received_dt),
                "connection_status": "DELAYED_FALLBACK",
                "source": "yfinance",
                "is_realtime": False,
                "freshness": freshness,
            }
        except Exception as exc:
            logger.warning("YFinance quote error for %s: %s", yf_symbol, exc)
            return None

    def get_ohlcv(self, symbol: str, period: str = "1Y", exchange: str = "NSE") -> Optional[List[Dict[str, Any]]]:
        ex_upper = exchange.strip().upper()
        yf_symbol = self._normalize_symbol(symbol, exchange=ex_upper)
        period_map = {"1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "2Y": "2y", "5Y": "5y"}
        yf_period = period_map.get(period.upper(), "1y")
        try:
            ticker = yf.Ticker(yf_symbol)
            hist = ticker.history(period=yf_period, interval="1d")
            if hist.empty:
                return None
            candles: List[Dict[str, Any]] = []
            for dt_idx, row in hist.iterrows():
                candles.append({
                    "date": dt_idx.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]),
                    "exchange": ex_upper,
                    "source": "yfinance",
                })
            return candles
        except Exception as exc:
            logger.warning("YFinance OHLCV error for %s (%s): %s", yf_symbol, yf_period, exc)
            return None


class KiteMarketDataProvider(BaseMarketDataProvider):
    """Real-time Zerodha Kite Connect REST market data provider."""

    KITE_QUOTE_URL = "https://api.kite.trade/quote"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.zerodha_api_key

    def get_quote_with_token(
        self, symbol: str, access_token: str, exchange: str = "NSE"
    ) -> Optional[Dict[str, Any]]:
        api_key = self.api_key or settings.zerodha_api_key
        if not api_key or not access_token:
            return None

        ex_upper = exchange.strip().upper()
        clean = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        instrument = f"{ex_upper}:{clean}"
        received_dt = datetime.now(timezone.utc)

        try:
            with httpx.Client(timeout=4.0) as client:
                resp = client.get(
                    self.KITE_QUOTE_URL,
                    params={"i": instrument},
                    headers={
                        "X-Kite-Version": "3",
                        "Authorization": f"token {api_key}:{access_token}",
                    },
                )
            if resp.status_code in (401, 403):
                logger.warning("Kite token rejected (HTTP %s) for %s.", resp.status_code, instrument)
                return {"_token_expired": True}
            if resp.status_code != 200:
                return None

            payload = resp.json()
            item = (payload.get("data") or {}).get(instrument)
            if not item:
                return None

            last_price = float(item.get("last_price", 0))
            if last_price <= 0:
                return None

            ohlc = item.get("ohlc") or {}
            prev_close = float(ohlc.get("close", last_price))
            change = round(last_price - prev_close, 2)
            change_pct = round((change / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

            exch_dt = _parse_iso_to_utc(item.get("timestamp"))
            ltt_dt = _parse_iso_to_utc(item.get("last_trade_time"))
            obs_dt = exch_dt or ltt_dt
            as_of_iso = obs_dt.isoformat() if obs_dt is not None else None

            freshness = MarketHours.calculate_freshness(
                as_of=obs_dt,
                is_realtime=(obs_dt is not None),
                reference_time=received_dt,
            )

            return {
                "symbol": clean,
                "exchange": ex_upper,
                "name": clean,
                "price": round(last_price, 2),
                "prev_close": round(prev_close, 2),
                "change": change,
                "change_percent": change_pct,
                "open": ohlc.get("open"),
                "high": ohlc.get("high"),
                "low": ohlc.get("low"),
                "volume": item.get("volume"),
                # Never map circuit limits to 52-week high/low
                "upper_circuit_limit": item.get("upper_circuit_limit"),
                "lower_circuit_limit": item.get("lower_circuit_limit"),
                "week52_high": None,
                "week52_low": None,
                "exchange_timestamp": exch_dt.isoformat() if exch_dt else None,
                "last_trade_timestamp": ltt_dt.isoformat() if ltt_dt else None,
                "as_of": as_of_iso,
                "received_at": received_dt.isoformat(),
                "price_age_seconds": MarketHours.compute_age_seconds(obs_dt, received_dt),
                "market_session": MarketHours.get_market_session(received_dt),
                "connection_status": "CONNECTED",
                "source": "kite",
                "is_realtime": obs_dt is not None,
                "freshness": freshness,
            }
        except Exception as exc:
            logger.warning("Kite quote error for %s: %s", instrument, exc)
            return None

    def get_quote(self, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        return None

    def get_ohlcv(self, symbol: str, period: str = "1Y", exchange: str = "NSE") -> Optional[List[Dict[str, Any]]]:
        return None


class MarketDataService:
    """
    Unified entry point resolving live Kite WS ticks -> user Kite REST -> YFinance -> unavailable.
    Strict provider/entitlement/exchange cache isolation.
    """

    def __init__(
        self,
        cache: Optional[CacheLayer] = None,
        yfinance_provider: Optional[BaseMarketDataProvider] = None,
        kite_provider: Optional[KiteMarketDataProvider] = None,
    ):
        self.cache = cache or CacheLayer()
        kite_ws_collector._cache = self.cache
        self.yfinance_provider = yfinance_provider or YFinanceProvider()
        self.kite_provider = kite_provider or KiteMarketDataProvider()

    def get_quote(
        self,
        symbol: str,
        skip_cache: bool = False,
        kite_token: Optional[str] = None,
        user_id: Optional[str] = None,
        exchange: str = "NSE",
        db: Optional[Any] = None,
    ) -> Dict[str, Any]:
        ex_upper = (exchange or "NSE").strip().upper()
        if ex_upper not in SUPPORTED_EXCHANGES:
            return {
                "symbol": symbol.strip().upper(),
                "exchange": ex_upper,
                "price": None,
                "status": "unavailable",
                "freshness": "UNAVAILABLE",
                "source": "unavailable",
                "exchange_timestamp": None,
                "as_of": None,
                "received_at": datetime.now(timezone.utc).isoformat(),
                "price_age_seconds": None,
                "market_session": MarketHours.get_market_session(),
                "reason": f"Unsupported exchange '{exchange}'. Allowed: NSE, BSE.",
            }

        clean_symbol = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        now_utc = datetime.now(timezone.utc)

        # 1. Resolve server-side encrypted user credentials when user_id + db provided
        resolved_token = kite_token
        connection_status = "DISCONNECTED"
        if user_id and not resolved_token and db is not None:
            creds = resolve_user_kite_credentials(str(user_id), db)
            if creds:
                resolved_token = creds.access_token
                connection_status = "CONNECTED"

        # 2. Hot live WS tick path (always bypasses 10s REST cache!)
        if user_id:
            ws_tick = kite_ws_collector.get_latest_tick(str(user_id), clean_symbol, ex_upper)
            if ws_tick and ws_tick.get("price"):
                obs_str = ws_tick.get("exchange_timestamp") or ws_tick.get("last_trade_timestamp")
                freshness = MarketHours.calculate_freshness(
                    as_of=obs_str,
                    is_realtime=bool(obs_str),
                    reference_time=now_utc,
                )
                return {
                    **ws_tick,
                    "as_of": obs_str,
                    "price_age_seconds": MarketHours.compute_age_seconds(obs_str, now_utc),
                    "market_session": MarketHours.get_market_session(now_utc),
                    "connection_status": kite_ws_collector.get_connection_state(str(user_id)),
                    "freshness": freshness,
                    "status": "ok" if freshness != "UNAVAILABLE" else "unavailable",
                }

        # 3. Scoped cache lookup (isolated per provider + entitlement + exchange + symbol)
        has_kite_access = bool(resolved_token)
        provider_scope = "kite" if has_kite_access else "yfinance"
        entitlement_scope = f"user_{user_id}" if (has_kite_access and user_id) else (
            "token" if has_kite_access else "public"
        )
        cache_key = f"quote:{provider_scope}:{entitlement_scope}:{ex_upper}:{clean_symbol}"

        if not skip_cache:
            cached = self.cache.get(cache_key)
            if cached:
                try:
                    data = json.loads(cached)
                    data["cached"] = True
                    # Recompute dynamic age/freshness from preserved observation timestamp
                    obs = data.get("as_of")
                    data["price_age_seconds"] = MarketHours.compute_age_seconds(obs, now_utc)
                    data["freshness"] = MarketHours.calculate_freshness(
                        as_of=obs,
                        is_realtime=bool(data.get("is_realtime")),
                        reference_time=now_utc,
                    )
                    data["market_session"] = MarketHours.get_market_session(now_utc)
                    return data
                except Exception:
                    pass

        quote: Optional[Dict[str, Any]] = None

        # 4. Authenticated Kite REST quote
        if resolved_token:
            kite_res = self.kite_provider.get_quote_with_token(
                clean_symbol, resolved_token, exchange=ex_upper
            )
            if isinstance(kite_res, dict) and kite_res.get("_token_expired"):
                connection_status = "TOKEN_EXPIRED"
                kite_res = None
            quote = kite_res
            if quote:
                self.cache.set(cache_key, QUOTE_CACHE_TTL_SECONDS, json.dumps(quote))
                return quote

        # 5. YFinance delayed fallback (scoped under public fallback cache key)
        yf_cache_key = f"quote:yfinance:public:{ex_upper}:{clean_symbol}"
        if not skip_cache and yf_cache_key != cache_key:
            cached_yf = self.cache.get(yf_cache_key)
            if cached_yf:
                try:
                    yf_data = json.loads(cached_yf)
                    yf_data["cached"] = True
                    if connection_status == "TOKEN_EXPIRED":
                        yf_data["connection_status"] = "TOKEN_EXPIRED"
                    return yf_data
                except Exception:
                    pass

        quote = self.yfinance_provider.get_quote(clean_symbol, exchange=ex_upper)
        if quote:
            if connection_status == "TOKEN_EXPIRED":
                quote["connection_status"] = "TOKEN_EXPIRED"
            self.cache.set(yf_cache_key, QUOTE_CACHE_TTL_SECONDS, json.dumps(quote))
            return quote

        # 6. Structured unavailable sentinel (never fabricate price or exchange time)
        return {
            "symbol": clean_symbol,
            "exchange": ex_upper,
            "price": None,
            "status": "unavailable",
            "freshness": "UNAVAILABLE",
            "source": "unavailable",
            "exchange_timestamp": None,
            "last_trade_timestamp": None,
            "as_of": None,
            "received_at": now_utc.isoformat(),
            "price_age_seconds": None,
            "market_session": MarketHours.get_market_session(now_utc),
            "connection_status": connection_status,
            "reason": "Real-time and delayed quote providers both failed or returned no observation timestamp.",
        }

    def get_ohlcv(
        self,
        symbol: str,
        period: str = "1Y",
        skip_cache: bool = False,
        exchange: str = "NSE",
    ) -> Optional[List[Dict[str, Any]]]:
        ex_upper = (exchange or "NSE").strip().upper()
        clean_symbol = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        cache_key = f"ohlcv:{ex_upper}:{clean_symbol}:{period.upper()}"

        if not skip_cache:
            cached = self.cache.get(cache_key)
            if cached:
                try:
                    return json.loads(cached)
                except Exception:
                    pass

        candles = self.yfinance_provider.get_ohlcv(clean_symbol, period=period, exchange=ex_upper)
        if candles:
            self.cache.set(cache_key, OHLCV_CACHE_TTL_SECONDS, json.dumps(candles))
            return candles
        return None

    def get_watchlist_quotes(
        self,
        symbols: List[str],
        kite_token: Optional[str] = None,
        user_id: Optional[str] = None,
        exchange: str = "NSE",
        db: Optional[Any] = None,
    ) -> Dict[str, Dict[str, Any]]:
        results: Dict[str, Dict[str, Any]] = {}
        for sym in symbols:
            clean = sym.strip().upper()
            if clean:
                results[clean] = self.get_quote(
                    clean,
                    kite_token=kite_token,
                    user_id=user_id,
                    exchange=exchange,
                    db=db,
                )
        return results


market_data_service = MarketDataService()
