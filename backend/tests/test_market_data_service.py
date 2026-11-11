"""
Unit tests for unified MarketDataService.

Verifies:
1. Cache TTL (quote 10s TTL, OHLCV daily TTL, expiry).
2. Market-hours logic (NSE 09:15-15:30 IST weekdays, weekends, freshness states).
3. Provider fallback (Kite failure -> YFinance fallback -> unavailable sentinel).
"""

import json
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from unittest.mock import MagicMock, patch

import pytest

from services.market_data_service import (
    CacheLayer,
    InMemoryCache,
    MarketHours,
    MarketDataService,
    BaseMarketDataProvider,
    KiteMarketDataProvider,
    YFinanceProvider,
    QUOTE_CACHE_TTL_SECONDS,
    OHLCV_CACHE_TTL_SECONDS,
)

IST = ZoneInfo("Asia/Kolkata")


# ── 1. Cache TTL Tests ────────────────────────────────────────────────────────

def test_in_memory_cache_ttl_and_expiry():
    """Verify in-memory cache sets, retrieves, and expires entries correctly."""
    cache = InMemoryCache()
    cache.setex("quote:INFY", 1, json.dumps({"price": 1600.0}))

    # Immediate lookup succeeds
    val = cache.get("quote:INFY")
    assert val is not None
    assert json.loads(val)["price"] == 1600.0

    # Wait for TTL to expire (1.1s > 1s)
    time.sleep(1.15)
    expired_val = cache.get("quote:INFY")
    assert expired_val is None, "Cache entry should have expired after TTL"


def test_market_data_service_quote_cache_hit_and_skip():
    """Verify MarketDataService caches quotes for 10s and respects skip_cache."""
    mock_yf = MagicMock(spec=BaseMarketDataProvider)
    mock_yf.get_quote.return_value = {
        "symbol": "TCS",
        "price": 3800.0,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "yfinance",
        "freshness": "DELAYED (15m)",
    }

    cache = CacheLayer()
    # Ensure starting with clean cache for TCS
    cache.delete("quote:TCS")

    service = MarketDataService(cache=cache, yfinance_provider=mock_yf)

    # First call calls provider
    q1 = service.get_quote("TCS")
    assert q1["price"] == 3800.0
    assert mock_yf.get_quote.call_count == 1

    # Second call hits cache (provider should NOT be called again)
    q2 = service.get_quote("TCS")
    assert q2["price"] == 3800.0
    assert mock_yf.get_quote.call_count == 1

    # Calling with skip_cache=True forces provider call
    q3 = service.get_quote("TCS", skip_cache=True)
    assert q3["price"] == 3800.0
    assert mock_yf.get_quote.call_count == 2


def test_market_data_service_ohlcv_cache():
    """Verify OHLCV candle history is cached with daily TTL."""
    mock_yf = MagicMock(spec=BaseMarketDataProvider)
    mock_yf.get_ohlcv.return_value = [
        {"date": "2026-11-01", "close": 2500.0, "volume": 1000000},
        {"date": "2026-11-02", "close": 2520.0, "volume": 1100000},
    ]

    cache = CacheLayer()
    cache.delete("ohlcv:RELIANCE:1Y")

    service = MarketDataService(cache=cache, yfinance_provider=mock_yf)

    # First call loads and caches
    c1 = service.get_ohlcv("RELIANCE", "1Y")
    assert len(c1) == 2
    assert mock_yf.get_ohlcv.call_count == 1

    # Second call returns from cache
    c2 = service.get_ohlcv("RELIANCE", "1Y")
    assert len(c2) == 2
    assert mock_yf.get_ohlcv.call_count == 1


# ── 2. Market Hours & Freshness Logic Tests ───────────────────────────────────

def test_market_hours_weekday_trading_window():
    """Test NSE market hours logic: 09:15 to 15:30 IST on Monday-Friday."""
    # Wednesday 10:30 IST -> Open
    open_wed = datetime(2026, 11, 4, 10, 30, 0, tzinfo=IST)
    assert MarketHours.is_market_open(open_wed) is True

    # Wednesday 08:45 IST -> Closed (pre-market)
    pre_wed = datetime(2026, 11, 4, 8, 45, 0, tzinfo=IST)
    assert MarketHours.is_market_open(pre_wed) is False

    # Wednesday 16:15 IST -> Closed (post-market)
    post_wed = datetime(2026, 11, 4, 16, 15, 0, tzinfo=IST)
    assert MarketHours.is_market_open(post_wed) is False

    # Saturday 11:30 IST -> Closed (weekend)
    sat_noon = datetime(2026, 11, 7, 11, 30, 0, tzinfo=IST)
    assert MarketHours.is_market_open(sat_noon) is False

    # Sunday 14:00 IST -> Closed (weekend)
    sun_afternoon = datetime(2026, 11, 8, 14, 0, 0, tzinfo=IST)
    assert MarketHours.is_market_open(sun_afternoon) is False


def test_calculate_freshness_states():
    """Test all 4 freshness states: LIVE, DELAYED (15m), STALE, UNAVAILABLE."""
    ref_time = datetime(2026, 11, 4, 11, 0, 0, tzinfo=timezone.utc)

    # 1. LIVE: realtime ticker tick received recently
    recent_tick = datetime(2026, 11, 4, 10, 59, 45, tzinfo=timezone.utc)
    assert MarketHours.calculate_freshness(
        as_of=recent_tick, is_realtime=True, market_open=True, reference_time=ref_time
    ) == "LIVE"

    # 2. DELAYED (15m): market open, quote within 15 minutes
    delayed_quote = datetime(2026, 11, 4, 10, 50, 0, tzinfo=timezone.utc)  # 10m old
    assert MarketHours.calculate_freshness(
        as_of=delayed_quote, is_realtime=False, market_open=True, reference_time=ref_time
    ) == "DELAYED (15m)"

    # 3. STALE: market open, but quote is 25 minutes old (> 15m)
    stale_quote = datetime(2026, 11, 4, 10, 35, 0, tzinfo=timezone.utc)  # 25m old
    assert MarketHours.calculate_freshness(
        as_of=stale_quote, is_realtime=False, market_open=True, reference_time=ref_time
    ) == "STALE"

    # 4. UNAVAILABLE: None timestamp
    assert MarketHours.calculate_freshness(as_of=None) == "UNAVAILABLE"


# ── 3. Provider Fallback Tests ────────────────────────────────────────────────

def test_provider_fallback_kite_success():
    """When user Kite token is valid, Kite real-time quote is used directly."""
    mock_kite = MagicMock(spec=KiteMarketDataProvider)
    mock_kite.get_quote_with_token.return_value = {
        "symbol": "RELIANCE",
        "price": 2490.0,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "kite",
        "is_realtime": True,
        "freshness": "LIVE",
    }
    mock_yf = MagicMock(spec=BaseMarketDataProvider)

    cache = CacheLayer()
    cache.delete("quote:RELIANCE")

    service = MarketDataService(cache=cache, yfinance_provider=mock_yf, kite_provider=mock_kite)
    res = service.get_quote("RELIANCE", kite_token="active_token_123")

    assert res["source"] == "kite"
    assert res["freshness"] == "LIVE"
    assert res["price"] == 2490.0
    # YFinance should NOT have been called
    assert mock_yf.get_quote.call_count == 0


def test_provider_fallback_kite_fails_to_yfinance():
    """When Kite returns None or fails, service gracefully falls back to YFinance."""
    mock_kite = MagicMock(spec=KiteMarketDataProvider)
    mock_kite.get_quote_with_token.return_value = None  # Kite token invalid or failed

    mock_yf = MagicMock(spec=BaseMarketDataProvider)
    mock_yf.get_quote.return_value = {
        "symbol": "HDFCBANK",
        "price": 1650.0,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "yfinance",
        "is_realtime": False,
        "freshness": "DELAYED (15m)",
    }

    cache = CacheLayer()
    cache.delete("quote:HDFCBANK")

    service = MarketDataService(cache=cache, yfinance_provider=mock_yf, kite_provider=mock_kite)
    res = service.get_quote("HDFCBANK", kite_token="expired_token")

    # Fell back to YFinance
    assert res["source"] == "yfinance"
    assert res["price"] == 1650.0
    assert mock_kite.get_quote_with_token.call_count == 1
    assert mock_yf.get_quote.call_count == 1


def test_provider_all_fail_returns_unavailable_sentinel():
    """When both Kite and YFinance fail, returns an explicit structured unavailable state."""
    mock_kite = MagicMock(spec=KiteMarketDataProvider)
    mock_kite.get_quote_with_token.return_value = None

    mock_yf = MagicMock(spec=BaseMarketDataProvider)
    mock_yf.get_quote.return_value = None

    cache = CacheLayer()
    cache.delete("quote:UNKNOWNSTOCK")

    service = MarketDataService(cache=cache, yfinance_provider=mock_yf, kite_provider=mock_kite)
    res = service.get_quote("UNKNOWNSTOCK", kite_token="token_fail")

    assert res["status"] == "unavailable"
    assert res["freshness"] == "UNAVAILABLE"
    assert "as_of" in res
    assert "reason" in res

