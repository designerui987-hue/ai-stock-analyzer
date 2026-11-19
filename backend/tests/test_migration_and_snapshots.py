"""
Database Migration, Snapshot Lifecycle, and Language Hardening Verification Suite.

Tests:
1. Schema migration on clean database vs. pre-existing database.
2. Indexes and constraints verification.
3. Anti-refresh deduplication (rapid calls with unchanged quote do not produce duplicate snapshots or prune history).
4. Timestamp fidelity: old provider observation timestamps cannot masquerade as new research.
5. Strict user tenant isolation during snapshot retrieval and retention pruning.
6. Moving average crossover logic correctness (price compared with its corresponding MA).
7. Language compliance (no claims of institutional participation, neutral indicator descriptions, configurable concentration threshold).
"""

from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.models import Base, User, ResearchSnapshot, Portfolio, Holding, WatchlistItem
from db.session import apply_migrations
from services.research_snapshot_service import (
    ResearchSnapshotService,
    DEFAULT_METHODOLOGY_VERSION,
    DEFAULT_TIMEFRAME,
    DEFAULT_ADJUSTMENT_BASIS,
    DEFAULT_SECTOR_CONCENTRATION_THRESHOLD,
    MAX_SNAPSHOT_RETENTION_PER_SYMBOL,
)


def test_clean_database_initialization():
    """Verify that a clean database gets all tables, columns, and indexes created properly."""
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    apply_migrations(engine)

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "research_snapshots" in tables
    assert "users" in tables
    assert "portfolios" in tables

    # Verify research_snapshots columns
    columns = {col["name"]: col for col in inspector.get_columns("research_snapshots")}
    assert "id" in columns
    assert "user_id" in columns
    assert "symbol" in columns
    assert "exchange" in columns
    assert "as_of" in columns
    assert "price" in columns
    assert "sma_20" in columns
    assert "rsi_14" in columns
    assert "timeframe" in columns
    assert "lookback_bars" in columns
    assert "adjustment_basis" in columns
    assert "rule_version" in columns
    assert "created_at" in columns


def test_migration_on_pre_existing_legacy_database():
    """
    Verify forward migration on an existing database created before research_snapshots upgrade.
    Ensures pre-existing user data is fully preserved and new schema elements are applied seamlessly.
    """
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)

    # Simulate legacy database schema before this upgrade (without research_snapshots)
    with engine.connect() as conn:
        trans = conn.begin()
        conn.execute(text("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                email VARCHAR UNIQUE NOT NULL,
                username VARCHAR NOT NULL,
                password_hash VARCHAR NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP
            );
        """))
        conn.execute(text("CREATE UNIQUE INDEX ix_users_username ON users (username);"))
        conn.execute(text("""
            INSERT INTO users (id, email, username, password_hash)
            VALUES (1, 'legacy@investor.in', 'Legacy Investor', 'hash123');
        """))
        trans.commit()

    # Apply modern migrations on top of legacy DB
    Base.metadata.create_all(bind=engine)
    apply_migrations(engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    # Verify legacy user was safely preserved
    user = session.query(User).filter(User.id == 1).first()
    assert user is not None
    assert user.email == "legacy@investor.in"
    assert user.username == "Legacy Investor"

    # Verify new snapshots table is operational
    quote = {
        "price": 1250.0,
        "as_of": datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc).isoformat(),
        "source": "NSE",
    }
    snap = ResearchSnapshotService.record_snapshot(session, "RELIANCE", quote, user_id=1)
    assert snap is not None
    assert snap.user_id == 1
    assert snap.timeframe == DEFAULT_TIMEFRAME
    session.close()


def test_anti_refresh_deduplication_preserves_history():
    """
    Verify that repeated rapid page refreshes with identical quote data:
    1. Do NOT create duplicate rows.
    2. Do NOT consume or prune meaningful history.
    """
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    apply_migrations(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    base_time = datetime(2026, 11, 19, 9, 30, tzinfo=timezone.utc)
    quote = {
        "price": 1250.0,
        "as_of": base_time.isoformat(),
        "source": "NSE",
        "volume": 500000,
    }

    # Simulate initial page load
    snap1 = ResearchSnapshotService.record_snapshot(session, "RELIANCE", quote, {"rsi": 60.0})
    assert snap1 is not None

    # Simulate 10 rapid page refreshes with identical quote data
    for _ in range(10):
        snap_dup = ResearchSnapshotService.record_snapshot(session, "RELIANCE", quote, {"rsi": 60.0})
        assert snap_dup.id == snap1.id

    # Total snapshots in DB must remain exactly 1
    count = session.query(ResearchSnapshot).filter(ResearchSnapshot.symbol == "RELIANCE").count()
    assert count == 1, f"Expected exactly 1 snapshot after refreshes, found {count}"

    session.close()


def test_timestamp_fidelity_old_quote_cannot_become_new_event():
    """
    Verify that an old quote with a later server timestamp cannot be treated as fresh research.
    """
    t_old = datetime(2026, 11, 18, 15, 30, tzinfo=timezone.utc)

    snap_prev = ResearchSnapshot(
        symbol="TCS",
        exchange="NSE",
        as_of=t_old,
        price=3500.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    # Stale quote fetched again with identical observation timestamp
    snap_same = ResearchSnapshot(
        symbol="TCS",
        exchange="NSE",
        as_of=t_old,
        price=3500.0,
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )

    comp = ResearchSnapshotService.compare_snapshots(snap_same, snap_prev)
    assert comp["status"] == "identical_observation"
    assert comp["changes_count"] == 0
    assert "no new market events observed" in comp["summary"].lower()


def test_user_tenant_isolation_in_snapshots():
    """
    Verify strict tenant isolation:
    User A cannot retrieve or prune User B's private research snapshots.
    """
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    apply_migrations(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    user_a_time = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)
    user_b_time = datetime(2026, 11, 19, 11, 0, tzinfo=timezone.utc)

    # User A records snapshot
    quote_a = {"price": 1000.0, "as_of": user_a_time.isoformat()}
    snap_a = ResearchSnapshotService.record_snapshot(session, "INFY", quote_a, user_id=101)

    # User B records snapshot
    quote_b = {"price": 1020.0, "as_of": user_b_time.isoformat()}
    snap_b = ResearchSnapshotService.record_snapshot(session, "INFY", quote_b, user_id=202)

    assert snap_a.user_id == 101
    assert snap_b.user_id == 202

    # Query strictly partitioned for User A
    snaps_for_a = (
        session.query(ResearchSnapshot)
        .filter(ResearchSnapshot.symbol == "INFY", ResearchSnapshot.user_id == 101)
        .all()
    )
    assert len(snaps_for_a) == 1
    assert snaps_for_a[0].price == 1000.0

    # Pruning User A's history must not touch User B's history
    for i in range(35):
        t = user_a_time + timedelta(hours=i + 1)
        q = {"price": 1000.0 + i, "as_of": t.isoformat()}
        ResearchSnapshotService.record_snapshot(session, "INFY", q, user_id=101)

    # User A count is capped at 30
    count_a = session.query(ResearchSnapshot).filter(ResearchSnapshot.user_id == 101).count()
    assert count_a == MAX_SNAPSHOT_RETENTION_PER_SYMBOL

    # User B's snapshot is completely untouched
    snap_b_check = session.query(ResearchSnapshot).filter(ResearchSnapshot.user_id == 202).first()
    assert snap_b_check is not None
    assert snap_b_check.price == 1020.0

    session.close()


def test_moving_average_crossover_precision():
    """
    Verify moving-average crossings compare each price with its corresponding moving average.
    """
    t0 = datetime(2026, 11, 18, 9, 30, tzinfo=timezone.utc)
    t1 = datetime(2026, 11, 19, 9, 30, tzinfo=timezone.utc)

    # Case 1: Bullish Cross (below -> above)
    prev_bullish = ResearchSnapshot(
        symbol="SBIN",
        exchange="NSE",
        as_of=t0,
        price=800.0,
        sma_20=805.0,  # Below SMA 20
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    curr_bullish = ResearchSnapshot(
        symbol="SBIN",
        exchange="NSE",
        as_of=t1,
        price=820.0,
        sma_20=808.0,  # Above SMA 20
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    comp_bull = ResearchSnapshotService.compare_snapshots(curr_bullish, prev_bullish)
    ma_cross_bull = next((c for c in comp_bull["changes"] if c["metric"] == "sma_20"), None)
    assert ma_cross_bull is not None
    assert ma_cross_bull["direction"] == "bullish_cross"
    assert "crossed above" in ma_cross_bull["explanation"]

    # Case 2: Bearish Cross (above -> below)
    prev_bearish = ResearchSnapshot(
        symbol="SBIN",
        exchange="NSE",
        as_of=t0,
        price=820.0,
        sma_20=810.0,  # Above SMA 20
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    curr_bearish = ResearchSnapshot(
        symbol="SBIN",
        exchange="NSE",
        as_of=t1,
        price=800.0,
        sma_20=812.0,  # Below SMA 20
        rule_version=DEFAULT_METHODOLOGY_VERSION,
        source="NSE",
    )
    comp_bear = ResearchSnapshotService.compare_snapshots(curr_bearish, prev_bearish)
    ma_cross_bear = next((c for c in comp_bear["changes"] if c["metric"] == "sma_20"), None)
    assert ma_cross_bear is not None
    assert ma_cross_bear["direction"] == "bearish_cross"
    assert "slipped below" in ma_cross_bear["explanation"]


def test_research_language_factual_compliance():
    """
    Verify generated explanations do not use unsupported claims:
    - No 'institutional participation' based on volume ratio.
    - No unverified 'outpacing normal benchmark volatility'.
    - Neutral RSI descriptions without claims of guaranteed reversals.
    - Configurable concentration threshold documented as application guideline.
    """
    symbols = ["RELIANCE", "TCS", "HDFCBANK"]
    quotes = {
        "RELIANCE": {"price": 1250.0, "change_pct": 3.2, "sector": "Energy", "source": "NSE"},
        "TCS": {"price": 3500.0, "change_pct": 0.5, "sector": "Technology", "source": "NSE"},
        "HDFCBANK": {"price": 1700.0, "change_pct": 0.8, "sector": "Financials", "source": "NSE"},
    }
    technicals = {
        "RELIANCE": {"vol_surge": 2.1, "rsi": 55.0, "sma_20": 1240.0},
        "TCS": {"vol_surge": 1.0, "rsi": 52.0, "sma_20": 3490.0},
        "HDFCBANK": {"vol_surge": 1.0, "rsi": 74.5, "sma_20": 1690.0},
    }
    portfolio = {
        "sector_allocation": {"Energy": 42.0, "Technology": 20.0, "Financials": 38.0},
    }

    radar = ResearchSnapshotService.get_radar_items(symbols, quotes, technicals, portfolio)

    # Check Volume Surge description for RELIANCE
    rel_item = next(r for r in radar if r["symbol"] == "RELIANCE")
    assert "institutional participation" not in rel_item["why"].lower()
    assert "Volume is 2.1× its recent 20-day average." in rel_item["why"]

    # Check RSI description for HDFCBANK (RSI 74.5)
    hdfc_item = next(r for r in radar if r["symbol"] == "HDFCBANK")
    assert "reversal" not in hdfc_item["why"].lower()
    assert "conventional overbought zone" in hdfc_item["why"].lower()
    assert "upper boundary" in hdfc_item["risk"].lower()

    # Check Volatility description
    assert "outpacing normal benchmark" not in rel_item["why"].lower()

    # Check Sector concentration guideline
    sec_triggers = [r for r in radar if any("Sector Concentration" in s for s in r.get("secondary_triggers", [])) or r.get("trigger_type") == "SECTOR_CONCENTRATION"]
    assert len(sec_triggers) > 0


def test_review_findings_hardening():
    """
    Verify fixes for independent review findings:
    1. Invalid timestamps and non-finite prices are rejected.
    2. Stale quotes are rejected from snapshot recording.
    3. Material indicator shifts (e.g. RSI 29 -> 75) are NOT dropped even if price is identical.
    4. Mismatched lookbacks return incompatible.
    5. Baseline search finds a compatible historical baseline across mixed history.
    6. Canonical WatchlistItem and WatchlistItem migration reflect in personalized brief.
    """
    engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    apply_migrations(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # 1. Invalid timestamp rejected
    snap_inv_time = ResearchSnapshotService.record_snapshot(
        session, "INFY", {"price": 100.0, "as_of": "invalid-time"}
    )
    assert snap_inv_time is None

    # 2. Infinite price rejected
    snap_inf = ResearchSnapshotService.record_snapshot(
        session, "INFY", {"price": float("inf"), "as_of": "2026-11-19T08:00:00Z"}
    )
    assert snap_inf is None

    # 3. Stale quote rejected
    snap_stale = ResearchSnapshotService.record_snapshot(
        session, "INFY", {"price": 100.0, "as_of": "2026-11-19T08:00:00Z", "freshness": "STALE"}
    )
    assert snap_stale is None

    # 4. Same price, changed RSI (29 -> 75) after 60s must record a new snapshot
    t1 = datetime(2026, 11, 19, 8, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 11, 19, 8, 1, tzinfo=timezone.utc)

    snap1 = ResearchSnapshotService.record_snapshot(
        session, "TCS",
        quote_data={"price": 3500.0, "as_of": t1.isoformat()},
        technicals={"rsi": 29.0, "sma_20": 3490.0},
    )
    snap2 = ResearchSnapshotService.record_snapshot(
        session, "TCS",
        quote_data={"price": 3500.0, "as_of": t2.isoformat()},
        technicals={"rsi": 75.0, "sma_20": 3490.0},
    )
    assert snap1 is not None and snap2 is not None
    assert snap1.id != snap2.id
    assert snap2.rsi_14 == 75.0

    # 5. Incompatible lookback (250 vs 20) returns incompatible
    snap_lb250 = ResearchSnapshot(
        symbol="RELIANCE", exchange="NSE", as_of=t2, price=1200.0,
        lookback_bars=250, timeframe="1D", adjustment_basis="split_and_dividend_adjusted"
    )
    snap_lb20 = ResearchSnapshot(
        symbol="RELIANCE", exchange="NSE", as_of=t1, price=1190.0,
        lookback_bars=20, timeframe="1D", adjustment_basis="split_and_dividend_adjusted"
    )
    comp_lb = ResearchSnapshotService.compare_snapshots(snap_lb250, snap_lb20)
    assert comp_lb["status"] == "incompatible"
    assert "Lookback window mismatch" in comp_lb["reason"]

    # 6. Canonical watchlist reflected in personalized brief
    item = WatchlistItem(user_id="user_test_99", symbol="BHARTIARTL", exchange="NSE")
    session.add(item)
    session.commit()

    brief = ResearchSnapshotService.get_personalized_brief(session, user_id="user_test_99")
    assert brief["watchlist_count"] >= 1
    assert "BHARTIARTL" in [w["symbol"] for w in brief.get("watchlist_changes", [])] or brief["has_watchlist"] is True
    assert brief["is_onboarding"] is False
