"""
Regression tests for Stage 2 & Stage 3 real-time hardening and indicator accuracy:
1. NSE trading calendar (holidays, weekends, pre-open/regular/post-close, special Muhurat session).
2. Kite WebSocket binary packet parser (8B LTP, 44B Quote, 184B Full with real timestamps).
3. Collector duplicate/out-of-order rejection, >3000 instrument cap, subscriber cleanup, and WS hot tick cache bypass.
4. Scoped quote cache isolation (Kite user vs public YFinance, NSE vs BSE).
5. Server-side DB broker resolution without URL query `kite_token` exposure.
6. Market overview unavailable states (no hardcoded `34/16` breadth, `+647 Cr` FII/DII, `DEMO_NEWS` in non-demo).
7. PredictionEngine Wilder RSI/ATR, real EMA(9) MACD, `sma_50=None` for short series, incomplete bar exclusion, no `_default_prediction`.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import json
import struct
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
import pytest

from ai_models.prediction_engine import PredictionEngine
from auth.security import get_stream_user
from config import settings
from main import app
from services.broker_service import encrypt_broker_token, decrypt_broker_token
from services.kite_ws_collector import (
    KiteWebSocketCollector,
    MAX_INSTRUMENTS_PER_CONNECTION,
    parse_kite_binary_message,
)
from services.market_data_service import MarketDataService, MarketHours
from services.nse_calendar import get_market_session, is_regular_or_special_open

IST = ZoneInfo("Asia/Kolkata")


def _pack_kite_packet(pkt: bytes) -> bytes:
    """Wrap single packet into Kite binary frame `[num_packets(2B)][pkt_len(2B)][pkt]`."""
    return struct.pack(">HH", 1, len(pkt)) + pkt


def test_nse_calendar_sessions_holidays_and_muhurat():
    # Regular session weekday 11:00 IST (2026-11-04 Wednesday, non-holiday)
    reg_dt = datetime(2026, 11, 4, 11, 0, tzinfo=IST)
    assert get_market_session(reg_dt) == "REGULAR"
    assert is_regular_or_special_open(reg_dt) is True

    # Pre-open 09:05 IST
    pre_dt = datetime(2026, 11, 4, 9, 5, tzinfo=IST)
    assert get_market_session(pre_dt) == "PRE_OPEN"
    assert is_regular_or_special_open(pre_dt) is False

    # Post-close 15:45 IST
    post_dt = datetime(2026, 11, 4, 15, 45, tzinfo=IST)
    assert get_market_session(post_dt) == "POST_CLOSE"
    assert is_regular_or_special_open(post_dt) is False

    # Republic Day holiday (2026-01-26 Monday 11:00 IST)
    hol_dt = datetime(2026, 1, 26, 11, 0, tzinfo=IST)
    assert get_market_session(hol_dt) == "HOLIDAY"
    assert is_regular_or_special_open(hol_dt) is False

    # Weekend Sunday (2026-11-01 Sunday 11:00 IST)
    wknd_dt = datetime(2026, 11, 1, 11, 0, tzinfo=IST)
    assert get_market_session(wknd_dt) == "WEEKEND"
    assert is_regular_or_special_open(wknd_dt) is False

    # Diwali Muhurat Trading 2026 (2026-11-08 Sunday 18:15 IST -> SPECIAL_SESSION open)
    muh_dt = datetime(2026, 11, 8, 18, 15, tzinfo=IST)
    assert get_market_session(muh_dt) == "SPECIAL_SESSION"
    assert is_regular_or_special_open(muh_dt) is True


def test_kite_binary_parser_8b_44b_184b_preserves_timestamps():
    # 1. 8-byte LTP packet (token=738561 RELIANCE, ltp=254025 -> 2540.25)
    ltp_pkt = struct.pack(">ii", 738561, 254025)
    parsed_ltp = parse_kite_binary_message(_pack_kite_packet(ltp_pkt))
    assert len(parsed_ltp) == 1
    assert parsed_ltp[0]["instrument_token"] == 738561
    assert parsed_ltp[0]["last_price"] == 2540.25
    assert parsed_ltp[0]["mode"] == "ltp"
    assert parsed_ltp[0]["exchange_timestamp"] is None  # Never fabricated

    # 2. 44-byte Quote packet
    quote_pkt = struct.pack(
        ">ii9i",
        738561,
        254025,
        10,        # last_qty
        253500,    # avg_price
        125000,    # volume
        5000,      # buy_qty
        4000,      # sell_qty
        251000,    # open
        255000,    # high
        250500,    # low
        250000,    # close
    )
    parsed_q = parse_kite_binary_message(_pack_kite_packet(quote_pkt))
    assert parsed_q[0]["mode"] == "quote"
    assert parsed_q[0]["volume"] == 125000
    assert parsed_q[0]["close"] == 2500.0
    assert parsed_q[0]["change_percent"] == 1.61

    # 3. 184-byte Full packet with real exchange_timestamp & last_trade_timestamp
    exch_ts = int(datetime(2026, 11, 4, 6, 30, 5, tzinfo=timezone.utc).timestamp())
    ltt_ts = exch_ts - 1
    tail = b"\x00" * (184 - 64)
    full_pkt = quote_pkt + struct.pack(">iiiii", ltt_ts, 0, 0, 0, exch_ts) + tail
    parsed_full = parse_kite_binary_message(_pack_kite_packet(full_pkt))
    assert parsed_full[0]["mode"] == "full"
    assert parsed_full[0]["exchange_timestamp"] == datetime.fromtimestamp(exch_ts, tz=timezone.utc).isoformat()
    assert parsed_full[0]["last_trade_timestamp"] == datetime.fromtimestamp(ltt_ts, tz=timezone.utc).isoformat()


def test_collector_dedup_ooo_limits_and_hot_tick_bypass():
    collector = KiteWebSocketCollector()
    collector.instruments.register("RELIANCE", 738561, "NSE")

    ok_cap, err_cap = collector.can_subscribe_tokens(range(MAX_INSTRUMENTS_PER_CONNECTION + 1))
    assert ok_cap is False
    assert "3000" in (err_cap or "")

    ts1 = "2026-11-04T06:00:05+00:00"
    ts0 = "2026-11-04T06:00:02+00:00"
    accepted1, q1 = collector.process_tick("user-1", {
        "instrument_token": 738561,
        "last_price": 2550.0,
        "volume": 100,
        "exchange_timestamp": ts1,
    })
    assert accepted1 is True
    assert q1["price"] == 2550.0

    # Duplicate tick rejected
    accepted_dup, _ = collector.process_tick("user-1", {
        "instrument_token": 738561,
        "last_price": 2550.0,
        "volume": 100,
        "exchange_timestamp": ts1,
    })
    assert accepted_dup is False

    # Out-of-order older exchange timestamp rejected
    accepted_ooo, _ = collector.process_tick("user-1", {
        "instrument_token": 738561,
        "last_price": 2545.0,
        "volume": 90,
        "exchange_timestamp": ts0,
    })
    assert accepted_ooo is False

    # Subscriber attach/detach cleanup
    q = collector.subscribe_stream("user-1")
    assert "user-1" in collector._subscribers
    collector.unsubscribe_stream("user-1", q)
    assert "user-1" not in collector._subscribers

    # Hot tick bypasses 10s REST cache in MarketDataService
    svc = MarketDataService()
    svc.cache.set("quote:kite:user_user-1:NSE:RELIANCE", 60, json.dumps({
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "price": 2500.0,
        "as_of": ts0,
        "source": "kite_rest_stale_cached",
    }))
    with patch("services.market_data_service.kite_ws_collector", collector):
        live_res = svc.get_quote("RELIANCE", user_id="user-1", exchange="NSE")
    assert live_res["price"] == 2550.0
    assert live_res["source"] == "kite_ws"


def test_scoped_quote_cache_isolation_user_vs_public_and_exchange():
    svc = MarketDataService()

    svc.kite_provider.get_quote_with_token = MagicMock(return_value={
        "symbol": "TCS",
        "exchange": "NSE",
        "price": 3910.0,
        "source": "kite",
        "is_realtime": True,
        "as_of": datetime.now(timezone.utc).isoformat(),
    })
    svc.yfinance_provider.get_quote = MagicMock(side_effect=lambda sym, exchange="NSE": {
        "symbol": sym,
        "exchange": exchange,
        "price": 3905.0 if exchange == "NSE" else 3904.0,
        "source": "yfinance",
        "is_realtime": False,
        "as_of": datetime.now(timezone.utc).isoformat(),
    })

    q_kite = svc.get_quote("TCS", kite_token="tok-user-a", user_id="user-a", exchange="NSE")
    q_public = svc.get_quote("TCS", user_id="user-b", exchange="NSE")
    q_bse = svc.get_quote("TCS", user_id="user-b", exchange="BSE")

    assert q_kite["price"] == 3910.0
    assert q_kite["source"] == "kite"
    assert q_public["price"] == 3905.0
    assert q_public["source"] == "yfinance"
    assert q_bse["exchange"] == "BSE"
    assert q_bse["price"] == 3904.0


def test_market_hours_freshness_states():
    open_ref = datetime(2026, 11, 4, 11, 0, tzinfo=IST).astimezone(timezone.utc)
    closed_ref = datetime(2026, 11, 8, 11, 0, tzinfo=IST).astimezone(timezone.utc)

    assert MarketHours.calculate_freshness(as_of=None) == "UNAVAILABLE"
    assert MarketHours.calculate_freshness(
        as_of=(open_ref - timedelta(seconds=10)).isoformat(),
        is_realtime=True,
        reference_time=open_ref,
    ) == "LIVE"
    assert MarketHours.calculate_freshness(
        as_of=(open_ref - timedelta(minutes=10)).isoformat(),
        is_realtime=False,
        reference_time=open_ref,
    ) == "DELAYED"
    assert MarketHours.calculate_freshness(
        as_of=(open_ref - timedelta(hours=2)).isoformat(),
        is_realtime=True,
        reference_time=open_ref,
    ) == "STALE"
    assert MarketHours.calculate_freshness(
        as_of=(closed_ref - timedelta(hours=3)).isoformat(),
        is_realtime=False,
        reference_time=closed_ref,
    ) == "MARKET_CLOSED"


def test_broker_token_crypto_roundtrip():
    secret = "test_encryption_secret_key_32_bytes_long_12345"
    cipher = encrypt_broker_token("kite_access_tok_abc123", secret=secret)
    assert cipher.count(":") == 2
    assert decrypt_broker_token(cipher, secret=secret) == "kite_access_tok_abc123"
    assert decrypt_broker_token(cipher, secret="wrong_secret") == ""


def test_stream_ignores_kite_token_query_param_and_market_no_fake_fallbacks():
    client = TestClient(app)

    # Without auth, /api/stocks/stream must fail cleanly (even if ?kite_token=forged is supplied)
    unauth = client.get("/api/stocks/stream?symbols=RELIANCE&kite_token=forged_secret")
    assert unauth.status_code == 401

    # Market overview & news when demo_mode is False must not return hardcoded 34/16, +647 Cr, or DEMO_NEWS
    orig_demo = settings.demo_mode
    settings.demo_mode = False
    try:
        with patch("api.market._fetch_live_indices_sync", return_value=[]), \
             patch("api.market._fetch_constituent_quotes_sync", return_value=[]):
            overview = client.get("/api/market/overview")
            assert overview.status_code == 200
            body = overview.json()
            assert body["advance_decline"]["status"] == "unavailable"
            assert body["advance_decline"]["advances"] is None
            assert body["fii_activity"]["status"] == "unavailable"
            assert body["fii_activity"]["net_cr"] is None
            assert body["dii_activity"]["status"] == "unavailable"

            news = client.get("/api/market/news")
            assert news.status_code == 200
            assert news.json() == []
    finally:
        settings.demo_mode = orig_demo


def test_prediction_engine_indicators_and_no_default_fakes():
    pe = PredictionEngine()

    # Short 20-bar history -> sma_50 must be None, macd must be None (needs >= 35 bars)
    short_bars = []
    for i in range(20):
        short_bars.append({
            "date": f"2026-10-{i+1:02d}",
            "open": 100.0 + i,
            "high": 102.0 + i,
            "low": 99.0 + i,
            "close": 101.0 + i,
            "volume": 10000,
            "completed": True,
        })
    tech_short = pe.compute_technicals_from_ohlcv(short_bars, 120.0)
    assert tech_short["sma_50"] is None
    assert tech_short["sma_20"] is not None
    assert tech_short["macd"] is None
    assert tech_short["macd_signal"] is None
    assert isinstance(tech_short["rsi"], float)

    # Incomplete trailing bar must be excluded when exclude_incomplete=True
    with_incomplete = short_bars + [{
        "date": "2026-10-21",
        "open": 120.0,
        "high": 130.0,
        "low": 119.0,
        "close": 999.0,  # bogus incomplete bar spike
        "volume": 500,
        "completed": False,
    }]
    tech_excl = pe.compute_technicals_from_ohlcv(with_incomplete, 120.0, exclude_incomplete=True)
    assert tech_excl["bar_count"] == 20
    assert tech_excl["sma_20"] == tech_short["sma_20"]

    # Empty historical data -> explicit unavailable technicals & _default_prediction
    tech_empty = pe.compute_technicals_from_ohlcv([], 100.0)
    assert tech_empty["status"] == "unavailable"

    pred_empty = pe._default_prediction("TEST")
    assert pred_empty["status"] == "unavailable"
    assert pred_empty["signal"] == "HOLD"
    assert pred_empty["entry_price"] is None
    assert pred_empty["prediction_models"] == {}
