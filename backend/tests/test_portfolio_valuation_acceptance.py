import pytest
from unittest.mock import MagicMock
from db.models import Holding
from services.portfolio_service import PortfolioService


def test_tcs_valuation_acceptance():
    """
    Acceptance Test 1:
    110 TCS shares bought at ₹1,349.96.
    At a controlled quote of ₹2,460:
    - ₹1,48,495.60 invested
    - ₹2,70,600 current value
    - +₹1,22,104.40 unrealised return
    """
    holding = Holding(
        id=1,
        portfolio_id=1,
        symbol="TCS",
        qty=110,
        avg_price=1349.96,
    )

    mock_db = MagicMock()
    mock_market_data = MagicMock()
    mock_market_data.get_quote.return_value = {
        "symbol": "TCS",
        "price": 2460.00,
        "change": 15.00,
        "change_percent": 0.61,
        "status": "ok",
        "source": "controlled_test",
        "as_of": "2026-11-23T10:00:00Z",
        "freshness": "REALTIME",
    }

    metrics = PortfolioService.calculate_portfolio_metrics(
        [holding],
        user_id=1,
        db=mock_db,
        market_data_svc=mock_market_data,
    )

    assert metrics["total_invested"] == 148495.60
    assert metrics["current_value"] == 270600.00
    assert metrics["total_pnl"] == 122104.40
    assert metrics["total_pnl_pct"] == pytest.approx(82.23, rel=1e-2)
    assert metrics["status"] == "available"
    assert metrics["priced_count"] == 1
    assert metrics["total_count"] == 1


def test_disconnected_provider_acceptance():
    """
    Acceptance Test 1 (Disconnected Provider):
    Invested capital must remain visible (₹1,48,495.60),
    while current value and return show 'Valuation unavailable · 0 of 1 holdings priced.'
    """
    holding = Holding(
        id=1,
        portfolio_id=1,
        symbol="TCS",
        qty=110,
        avg_price=1349.96,
    )

    mock_db = MagicMock()
    mock_market_data = MagicMock()
    mock_market_data.get_quote.return_value = {
        "symbol": "TCS",
        "price": None,
        "status": "unavailable",
        "source": "unavailable",
        "freshness": "UNAVAILABLE",
    }

    metrics = PortfolioService.calculate_portfolio_metrics(
        [holding],
        user_id=1,
        db=mock_db,
        market_data_svc=mock_market_data,
    )

    assert metrics["total_invested"] == 148495.60
    assert metrics["current_value"] is None
    assert metrics["total_pnl"] is None
    assert metrics["total_pnl_pct"] is None
    assert metrics["status"] == "unavailable"
    assert metrics["priced_count"] == 0
    assert metrics["total_count"] == 1
    assert metrics["valuation_message"] == "Valuation unavailable · 0 of 1 holdings priced."


def test_genuinely_unchanged_price():
    """
    Acceptance Test 1 (Genuinely unchanged price):
    Holding bought at ₹1,349.96 and quote is exactly ₹1,349.96.
    Unrealised return must be ₹0.00 (0.0%).
    """
    holding = Holding(
        id=1,
        portfolio_id=1,
        symbol="TCS",
        qty=110,
        avg_price=1349.96,
    )

    mock_db = MagicMock()
    mock_market_data = MagicMock()
    mock_market_data.get_quote.return_value = {
        "symbol": "TCS",
        "price": 1349.96,
        "change": 0.0,
        "change_percent": 0.0,
        "status": "ok",
        "source": "controlled_test",
        "as_of": "2026-11-23T10:00:00Z",
        "freshness": "REALTIME",
    }

    metrics = PortfolioService.calculate_portfolio_metrics(
        [holding],
        user_id=1,
        db=mock_db,
        market_data_svc=mock_market_data,
    )

    assert metrics["total_invested"] == 148495.60
    assert metrics["current_value"] == 148495.60
    assert metrics["total_pnl"] == 0.0
    assert metrics["total_pnl_pct"] == 0.0
    assert metrics["status"] == "available"


def test_partially_priced_portfolio():
    """
    Acceptance Test 1 (Partially priced portfolio):
    Two holdings: TCS priced at ₹2,460, INFY unpriced.
    Must show invested total, labelled priced subtotal, and coverage '1 of 2 holdings priced'.
    """
    holding_tcs = Holding(
        id=1,
        portfolio_id=1,
        symbol="TCS",
        qty=110,
        avg_price=1349.96,
    )
    holding_infy = Holding(
        id=2,
        portfolio_id=1,
        symbol="INFY",
        qty=50,
        avg_price=1500.00,
    )

    mock_db = MagicMock()
    mock_market_data = MagicMock()

    def get_quote_side_effect(symbol, **kwargs):
        if symbol == "TCS":
            return {
                "symbol": "TCS",
                "price": 2460.00,
                "change": 15.00,
                "change_percent": 0.61,
                "status": "ok",
                "source": "controlled_test",
                "as_of": "2026-11-23T10:00:00Z",
                "freshness": "REALTIME",
            }
        return {
            "symbol": "INFY",
            "price": None,
            "status": "unavailable",
            "freshness": "UNAVAILABLE",
        }

    mock_market_data.get_quote.side_effect = get_quote_side_effect

    metrics = PortfolioService.calculate_portfolio_metrics(
        [holding_tcs, holding_infy],
        user_id=1,
        db=mock_db,
        market_data_svc=mock_market_data,
    )

    expected_invested = round(110 * 1349.96 + 50 * 1500.00, 2)
    assert metrics["total_invested"] == expected_invested
    assert metrics["current_value"] is None  # Full account value unavailable
    assert metrics["priced_subtotal"] == 270600.00  # Priced subtotal for TCS
    assert metrics["total_pnl"] is None  # Cannot compute whole-portfolio return
    assert metrics["status"] == "partial"
    assert metrics["priced_count"] == 1
    assert metrics["total_count"] == 2
    assert metrics["valuation_message"] == "Partial valuation · 1 of 2 holdings priced"


def test_sector_exposure_basis_regression_182_pct_eliminated():
    """
    Regression Test (Beta Blocker 2):
    Holding 1: 110 TCS bought at ₹1,349.96 (invested ₹1,48,495.60, current quote ₹2,460 -> value ₹2,70,600).
    Holding 2: 100 ABC bought at ₹1,000.00 (invested ₹1,00,000.00, quote unavailable).
    Previous bug: mixed TCS current value (₹2,70,600) with ABC cost (₹1,00,000) or divided by partial cost,
    yielding impossible >100% weights (specifically 182.1%).
    Fixed behavior:
    When quotes are incomplete, sector allocation strictly uses invested cost across ALL holdings:
    Total invested = ₹2,48,495.60.
    TCS (Technology) weight = 148,495.60 / 248,495.60 = 59.8% (strictly <= 100%).
    ABC (Industrial) weight = 100,000.00 / 248,495.60 = 40.2% (strictly <= 100%).
    All weights sum to 100.0% and basis is explicitly 'invested_cost'.
    """
    holding_tcs = Holding(
        id=1,
        portfolio_id=1,
        symbol="TCS",
        qty=110,
        avg_price=1349.96,
    )
    holding_unpriced = Holding(
        id=2,
        portfolio_id=1,
        symbol="ABC",
        qty=100,
        avg_price=1000.00,
    )

    mock_db = MagicMock()
    mock_market_data = MagicMock()

    def get_quote_side_effect(symbol, **kwargs):
        if symbol == "TCS":
            return {
                "symbol": "TCS",
                "price": 2460.00,
                "change": 15.00,
                "change_percent": 0.61,
                "status": "ok",
                "source": "controlled_test",
                "as_of": "2026-11-23T10:00:00Z",
                "freshness": "REALTIME",
                "sector": "Technology",
            }
        return {
            "symbol": "ABC",
            "price": None,
            "status": "unavailable",
            "freshness": "UNAVAILABLE",
            "sector": "Industrial",
        }

    mock_market_data.get_quote.side_effect = get_quote_side_effect

    metrics = PortfolioService.calculate_portfolio_metrics(
        [holding_tcs, holding_unpriced],
        user_id=1,
        db=mock_db,
        market_data_svc=mock_market_data,
    )

    assert metrics["sector_basis"] == "invested_cost"
    assert "sector_allocation" in metrics
    sec_alloc = metrics["sector_allocation"]

    # Invariant: weights must NEVER exceed 100% and must sum to 100.0%
    total_alloc = sum(sec_alloc.values())
    assert total_alloc == pytest.approx(100.0, rel=1e-2)
    for sec, pct in sec_alloc.items():
        assert pct <= 100.0, f"Sector {sec} exceeded 100%: {pct}% (182.1% regression caught!)"
        assert pct > 0.0

    assert sec_alloc["Technology"] == pytest.approx(59.8, abs=0.5)
    assert sec_alloc["Industrial"] == pytest.approx(40.2, abs=0.5)

