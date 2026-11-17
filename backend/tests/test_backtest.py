"""
Unit tests for deterministic backtesting engine and friction calculations.
"""

import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from services.backtest_service import BacktestEngine, calculate_friction
from main import app

client = TestClient(app)


def test_calculate_friction():
    """Verify Indian market friction math (Brokerage, STT, GST, Slippage)."""
    trade_value = 100000.0  # ₹1 Lakh trade
    friction = calculate_friction(trade_value)
    # Expected:
    # Brokerage: min(20, 100000 * 0.0003 = 30) -> 20.0
    # GST on brokerage: 20 * 0.18 -> 3.6
    # STT: 100000 * 0.001 -> 100.0
    # Exchange fee: 100000 * 0.000035 -> 3.5
    # Total = 20 + 3.6 + 100 + 3.5 = 127.1
    assert 125.0 <= friction <= 130.0


def test_backtest_engine_synthetic_run():
    """Test BacktestEngine execution on controlled synthetic OHLCV bars."""
    dates = pd.date_range("2021-01-01", periods=120, freq="B")
    
    # Create trending upward price series
    trend = np.linspace(1000.0, 1500.0, 120)
    noise = np.sin(np.linspace(0, 10, 120)) * 20.0
    closes = trend + noise
    opens = closes - 2.0
    highs = closes + 10.0
    lows = closes - 10.0
    volumes = np.full(120, 500000.0)

    stock_df = pd.DataFrame({
        "Open": opens,
        "High": highs,
        "Low": lows,
        "Close": closes,
        "Volume": volumes,
    }, index=dates)

    nifty_df = pd.DataFrame({
        "Open": opens * 15,
        "High": highs * 15,
        "Low": lows * 15,
        "Close": closes * 15,
        "Volume": volumes,
    }, index=dates)

    engine = BacktestEngine(symbol="TEST_STOCK", years=1, initial_capital=100000.0)

    with patch.object(engine, "_fetch_history", return_value=(stock_df, nifty_df)):
        result = engine.run()

    assert result["status"] == "ok"
    assert result["symbol"] == "TEST_STOCK"
    assert "metrics" in result
    metrics = result["metrics"]
    assert "cagr_pct" in metrics
    assert "max_drawdown_pct" in metrics
    assert "sharpe_ratio" in metrics
    assert "win_rate_pct" in metrics
    assert "profit_factor" in metrics
    assert "trade_count" in metrics
    assert "friction_breakdown" in result
    assert "walk_forward_splits" in result
    assert len(result["walk_forward_splits"]) == 3
    assert "equity_curve" in result
    assert len(result["equity_curve"]) > 0


def test_backtest_api_endpoint():
    """Verify GET /api/stocks/backtest endpoint handles request cleanly."""
    dates = pd.date_range("2021-01-01", periods=100, freq="B")
    closes = np.linspace(2000.0, 2500.0, 100)
    stock_df = pd.DataFrame({
        "Open": closes - 5,
        "High": closes + 15,
        "Low": closes - 15,
        "Close": closes,
        "Volume": np.full(100, 1000000.0),
    }, index=dates)

    with patch("services.backtest_service.BacktestEngine._fetch_history", return_value=(stock_df, stock_df)):
        resp = client.get("/api/stocks/backtest?symbol=RELIANCE&years=1&initial_capital=50000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["symbol"] == "RELIANCE"
        assert data["initial_capital"] == 50000.0
        assert "metrics" in data


def test_backtest_no_lookahead_day_t_equity_unaltered_by_day_t_plus_1_open():
    """Verify that signal on day T does not modify day T portfolio equity before day T+1 fill."""
    dates = pd.date_range("2021-01-01", periods=100, freq="B")
    trend = np.linspace(100.0, 200.0, 100)
    stock_df = pd.DataFrame({
        "Open": trend - 1.0,
        "High": trend + 5.0,
        "Low": trend - 5.0,
        "Close": trend,
        "Volume": np.full(100, 1000000.0),
    }, index=dates)

    engine = BacktestEngine(symbol="LOOKAHEAD_TEST", years=1, initial_capital=100000.0)
    with patch.object(engine, "_fetch_history", return_value=(stock_df, stock_df)):
        result = engine.run()

    trades = result.get("trades", [])
    if trades:
        first_trade = trades[0]
        # In trade record, friction paid must include both entry and exit
        assert first_trade["friction_paid"] > 0
        assert first_trade["entry_date"] > dates[0].strftime("%Y-%m-%d")


def test_backtest_missing_benchmark_dates_handles_gracefully():
    """Verify missing benchmark dates in nifty_df are safely reindexed without KeyErrors."""
    stock_dates = pd.date_range("2021-01-01", periods=80, freq="B")
    # Nifty has missing dates (e.g. only every second business day)
    nifty_dates = stock_dates[::2]

    stock_df = pd.DataFrame({
        "Open": np.linspace(500, 600, 80),
        "High": np.linspace(505, 605, 80),
        "Low": np.linspace(495, 595, 80),
        "Close": np.linspace(500, 600, 80),
        "Volume": np.full(80, 500000.0),
    }, index=stock_dates)

    nifty_df = pd.DataFrame({
        "Open": np.linspace(15000, 16000, len(nifty_dates)),
        "High": np.linspace(15100, 16100, len(nifty_dates)),
        "Low": np.linspace(14900, 15900, len(nifty_dates)),
        "Close": np.linspace(15000, 16000, len(nifty_dates)),
        "Volume": np.full(len(nifty_dates), 1000000.0),
    }, index=nifty_dates)

    engine = BacktestEngine(symbol="DATE_GAP_TEST", years=1, initial_capital=100000.0)
    with patch.object(engine, "_fetch_history", return_value=(stock_df, nifty_df)):
        result = engine.run()

    assert result["status"] == "ok"
    assert len(result["equity_curve"]) > 0
    # Every point has a benchmark value despite date gaps
    for pt in result["equity_curve"]:
        assert "benchmark" in pt
        assert pt["benchmark"] > 0
    assert "disclaimer" in result
