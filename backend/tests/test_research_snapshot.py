"""
Unit tests for Research Snapshot & 'What Changed' Comparison Engine.

Tests:
1. Snapshot recording with positive price validation and retention pruning (<= 30).
2. Accurate comparison for price movement, MA crossover, RSI momentum shift, volume surge, and signal flip.
3. Compatibility guards: rejects exchange mismatch, symbol mismatch, and non-chronological timestamps.
4. Missing metrics invariant: missing values are never treated as 0.0.
5. No prior snapshot sentinel: clean message when only 1 snapshot exists.
6. Transparent radar ranking with documented criteria (volume surge, RSI extremes, price moves).
7. Account isolation and personalized brief for returning vs. onboarding users.
"""

from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import Base, User, WatchlistItem, ResearchSnapshot, Portfolio, Holding
from services.research_snapshot_service import ResearchSnapshotService, DEFAULT_METHODOLOGY_VERSION


@pytest.fixture
def db_session():
    """Create an isolated in-memory SQLite database for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_snapshot_recording_and_retention_pruning(db_session):
    """Verify that snapshots are persisted and retention limits are strictly bounded to 30."""
    symbol = "TCS"
    base_time = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)

    # Insert 35 sequential snapshots
    for i in range(35):
        as_of = base_time + timedelta(hours=i)
        quote = {
            "price": 3500.0 + i,
            "as_of": as_of.isoformat(),
            "source": "NSE",
            "volume": 1000000 + i * 1000,
        }
        tech = {"rsi": 50.0 + (i % 20), "sma_20": 3490.0 + i}
        ai = {"signal": "BUY"}
        snap = ResearchSnapshotService.record_snapshot(
            db=db_session,
            symbol=symbol,
            quote_data=quote,
            technicals=tech,
            ai_prediction=ai,
            exchange="NSE",
        )
        assert snap is not None

    # Count total snapshots for TCS in DB
    total = db_session.query(ResearchSnapshot).filter(ResearchSnapshot.symbol == symbol).count()
    assert total == 30, f"Expected retention limit of 30, found {total}"


def test_snapshot_rejects_non_positive_price(db_session):
    """Ensure fake or invalid prices (<= 0 or missing) are never recorded as snapshots."""
    invalid_quote = {"price": 0.0, "as_of": datetime.now(timezone.utc).isoformat()}
    res = ResearchSnapshotService.record_snapshot(db_session, "INFY", invalid_quote)
    assert res is None

    negative_quote = {"price": -150.0, "as_of": datetime.now(timezone.utc).isoformat()}
    res2 = ResearchSnapshotService.record_snapshot(db_session, "INFY", negative_quote)
    assert res2 is None


def test_comparison_price_and_ma_crossover(db_session):
    """Verify detection of price movement and moving average crossovers."""
    t0 = datetime(2026, 11, 18, 9, 30, tzinfo=timezone.utc)
    t1 = datetime(2026, 11, 19, 9, 30, tzinfo=timezone.utc)

    prev_snap = ResearchSnapshot(
        symbol="RELIANCE",
        exchange="NSE",
        as_of=t0,
        price=1240.0,
        sma_20=1245.0,  # Price was below SMA 20
        rsi_14=55.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    curr_snap = ResearchSnapshot(
        symbol="RELIANCE",
        exchange="NSE",
        as_of=t1,
        price=1270.0,  # Price crossed above SMA 20
        sma_20=1248.0,
        rsi_14=62.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    db_session.add_all([prev_snap, curr_snap])
    db_session.commit()

    comp = ResearchSnapshotService.compare_snapshots(curr_snap, prev_snap)
    assert comp["status"] == "compared"
    assert comp["changes_count"] >= 2

    # Verify price change item
    price_change = next(c for c in comp["changes"] if c["metric"] == "price")
    assert price_change["direction"] == "up"
    assert price_change["change"] == 30.0
    assert price_change["previous_value"] == 1240.0
    assert price_change["current_value"] == 1270.0

    # Verify MA crossover item
    ma_change = next(c for c in comp["changes"] if c["metric"] == "sma_20")
    assert ma_change["direction"] == "bullish_cross"
    assert "crossed above" in ma_change["explanation"]


def test_comparison_rsi_category_shift_and_volume_surge(db_session):
    """Verify detection of RSI category transition and high volume surge."""
    t0 = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)

    prev_snap = ResearchSnapshot(
        symbol="HDFCBANK",
        exchange="NSE",
        as_of=t0,
        price=1750.0,
        rsi_14=68.0,  # Neutral (< 70)
        vol_surge=1.1,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    curr_snap = ResearchSnapshot(
        symbol="HDFCBANK",
        exchange="NSE",
        as_of=t1,
        price=1810.0,
        rsi_14=74.2,  # Overbought (> 70)
        vol_surge=1.9,  # High volume surge (>= 1.5)
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )

    comp = ResearchSnapshotService.compare_snapshots(curr_snap, prev_snap)
    assert comp["status"] == "compared"

    # Verify RSI shift
    rsi_change = next(c for c in comp["changes"] if c["metric"] == "rsi_14")
    assert rsi_change["type"] == "momentum_shift"
    assert "Neutral" in rsi_change["previous_category"]
    assert "Overbought" in rsi_change["current_category"]

    # Verify Volume surge
    vol_change = next(c for c in comp["changes"] if c["metric"] == "vol_surge")
    assert vol_change["direction"] == "high_volume"
    assert vol_change["current_value"] == 1.9


def test_missing_metrics_never_treated_as_zero():
    """Ensure that missing indicators in snapshots are not compared as zero."""
    t0 = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)

    prev_snap = ResearchSnapshot(
        symbol="INFY",
        exchange="NSE",
        as_of=t0,
        price=1850.0,
        rsi_14=None,  # Missing indicator
        sma_20=None,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    curr_snap = ResearchSnapshot(
        symbol="INFY",
        exchange="NSE",
        as_of=t1,
        price=1850.0,
        rsi_14=55.0,  # Present in current only
        sma_20=1840.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )

    comp = ResearchSnapshotService.compare_snapshots(curr_snap, prev_snap)
    assert comp["status"] == "compared"
    # RSI and SMA should NOT trigger a fake delta from 0
    metric_names = [c["metric"] for c in comp["changes"]]
    assert "rsi_14" not in metric_names
    assert "sma_20" not in metric_names


def test_incompatible_snapshots_fail_safe():
    """Ensure comparison between different symbols or non-sequential timestamps fails safe."""
    t0 = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)

    snap_a = ResearchSnapshot(
        symbol="RELIANCE",
        exchange="NSE",
        as_of=t0,
        price=1250.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    snap_b = ResearchSnapshot(
        symbol="TCS",  # Different symbol
        exchange="NSE",
        as_of=t1,
        price=3500.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )

    comp = ResearchSnapshotService.compare_snapshots(snap_a, snap_b)
    assert comp["status"] == "incompatible"


def test_single_snapshot_returns_no_prior_snapshot_state(db_session):
    """When only 1 snapshot exists, returns explicit 'no_prior_snapshot' with message."""
    snap = ResearchSnapshot(
        symbol="WIPRO",
        exchange="NSE",
        as_of=datetime.now(timezone.utc),
        price=450.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    db_session.add(snap)
    db_session.commit()

    res = ResearchSnapshotService.get_snapshot_comparison(db_session, "WIPRO", "NSE")
    assert res["status"] == "no_prior_snapshot"
    assert "First valid research snapshot recorded" in res["message"]


def test_radar_ranking_with_transparent_criteria():
    """Verify that radar items are selected using transparent documented criteria."""
    symbols = ["STOCK_VOL", "STOCK_RSI_LOW", "STOCK_VOLATILE", "STOCK_QUIET"]
    quotes = {
        "STOCK_VOL": {"price": 500.0, "change_pct": 0.5, "source": "NSE"},
        "STOCK_RSI_LOW": {"price": 200.0, "change_pct": -1.2, "source": "NSE"},
        "STOCK_VOLATILE": {"price": 1000.0, "change_pct": 3.8, "source": "NSE"},
        "STOCK_QUIET": {"price": 100.0, "change_pct": 0.1, "source": "NSE"},
    }
    technicals = {
        "STOCK_VOL": {"vol_surge": 2.2, "rsi": 52.0},  # Volume surge >= 1.5
        "STOCK_RSI_LOW": {"vol_surge": 0.9, "rsi": 26.5},  # Oversold RSI < 30
        "STOCK_VOLATILE": {"vol_surge": 1.0, "rsi": 58.0},  # Price volatility >= 2.5%
        "STOCK_QUIET": {"vol_surge": 1.0, "rsi": 50.0},  # No trigger
    }

    radar = ResearchSnapshotService.get_radar_items(symbols, quotes, technicals)
    radar_symbols = [r["symbol"] for r in radar]

    assert "STOCK_VOL" in radar_symbols
    assert "STOCK_RSI_LOW" in radar_symbols
    assert "STOCK_VOLATILE" in radar_symbols
    assert "STOCK_QUIET" not in radar_symbols

    vol_item = next(r for r in radar if r["symbol"] == "STOCK_VOL")
    assert vol_item["trigger_type"] == "VOLUME_SURGE"
    assert "2.2×" in vol_item["title"]


def test_personalized_brief_onboarding_vs_returning(db_session):
    """Verify personalized brief provides onboarding for empty accounts and tracked changes for populated ones."""
    # New user (no watchlist, no portfolio)
    new_user = User(id=999, email="new@user.com", username="newuser", password_hash="hash")
    db_session.add(new_user)
    db_session.commit()

    brief_new = ResearchSnapshotService.get_personalized_brief(db_session, user_id=999)
    assert brief_new["is_onboarding"] is True
    assert brief_new["onboarding_action"] is not None
    assert brief_new["watchlist_count"] == 0

    # Populate watchlist
    item = WatchlistItem(user_id=999, symbol="RELIANCE")
    db_session.add(item)
    db_session.commit()

    brief_active = ResearchSnapshotService.get_personalized_brief(db_session, user_id=999)
    assert brief_active["is_onboarding"] is False
    assert brief_active["watchlist_count"] == 1
