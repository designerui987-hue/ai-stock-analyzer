"""
Tests for Upstox instrument resolution, credential gating, quote integrity, and alerts delivery isolation.
"""

from datetime import datetime, timezone
import pytest
from unittest.mock import MagicMock, patch

from services.market_data_service import UpstoxMarketDataProvider, YFinanceProvider
from db.models import Alert, AlertType


def test_upstox_instrument_directory_resolution():
    provider = UpstoxMarketDataProvider()
    
    # 1. Known canonical NSE symbols resolve to ISIN keys
    assert provider.resolve_instrument_key("TCS", "NSE") == "NSE_EQ|INE467B01029"
    assert provider.resolve_instrument_key("RELIANCE", "NSE") == "NSE_EQ|INE002A01018"
    assert provider.resolve_instrument_key("HDFCBANK", "NSE") == "NSE_EQ|INE040A01034"
    assert provider.resolve_instrument_key("INFY", "NSE") == "NSE_EQ|INE009A01021"

    # 2. Handles suffixes like .NS cleanly
    assert provider.resolve_instrument_key("TCS.NS", "NSE") == "NSE_EQ|INE467B01029"

    # 3. Uncached symbol gracefully falls back to structured exchange key
    assert provider.resolve_instrument_key("UNKNOWNCO", "NSE") == "NSE_EQ|UNKNOWNCO"


def test_upstox_blocked_without_authorized_credentials():
    provider = UpstoxMarketDataProvider(api_key=None, access_token=None)
    
    # Without credentials, provider reports unavailable and blocks requests
    assert provider.is_available() is False
    assert provider.get_quote("TCS", "NSE") is None
    assert provider.get_ohlcv("TCS", "1Y", "NSE") is None


def test_missing_prior_close_leaves_daily_change_unavailable():
    provider = YFinanceProvider()

    # Mock ticker info where regularMarketPrice is 2460.0 but regularMarketPreviousClose is missing / None
    mock_ticker = MagicMock()
    mock_ticker.info = {
        "regularMarketPrice": 2460.0,
        "regularMarketPreviousClose": None,
        "previousClose": None,
        "regularMarketTime": int(datetime(2026, 11, 23, 10, 0, tzinfo=timezone.utc).timestamp()),
        "shortName": "Test Co",
    }
    mock_ticker.history.return_value = MagicMock(empty=True)

    with patch("services.market_data_service.yf.Ticker", return_value=mock_ticker):
        q = provider.get_quote("TESTCO", "NSE")
        assert q is not None
        assert q["price"] == 2460.0
        assert q["prev_close"] is None
        assert q["change"] is None
        assert q["change_percent"] is None, "Missing prior close must leave change_percent as None, never 0.0"


def test_genuinely_unchanged_price_preserves_zero():
    provider = YFinanceProvider()

    # Mock ticker info where regularMarketPrice == regularMarketPreviousClose == 2460.0
    mock_ticker = MagicMock()
    mock_ticker.info = {
        "regularMarketPrice": 2460.0,
        "regularMarketPreviousClose": 2460.0,
        "previousClose": 2460.0,
        "regularMarketTime": int(datetime(2026, 11, 23, 10, 0, tzinfo=timezone.utc).timestamp()),
        "shortName": "Test Co",
    }
    mock_ticker.history.return_value = MagicMock(empty=True)

    with patch("services.market_data_service.yf.Ticker", return_value=mock_ticker):
        q = provider.get_quote("TESTCO", "NSE")
        assert q is not None
        assert q["price"] == 2460.0
        assert q["prev_close"] == 2460.0
        assert q["change"] == 0.0
        assert q["change_percent"] == 0.0, "Genuinely unchanged session must preserve 0.0 numeric change"
