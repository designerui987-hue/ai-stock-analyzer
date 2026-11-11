"""
Tests for quant indicators, risk metrics, sentiment analysis, and market regime.
Verifies real mathematical outputs and deterministic behavior with no fake models or random data.
"""

from ai_models.sentiment_analyzer import compute_risk_metrics, sentiment_analyzer, risk_analyzer, market_regime_detector
from ai_models.prediction_engine import prediction_engine
from data.demo_stocks import generate_chart_data


def test_sentiment_analyzer_is_deterministic():
    """Verify sentiment analyzer returns deterministic values with no random() noise."""
    res1 = sentiment_analyzer.analyze_stock_sentiment("RELIANCE")
    res2 = sentiment_analyzer.analyze_stock_sentiment("RELIANCE")

    assert res1["overall_sentiment"] == res2["overall_sentiment"]
    assert res1["sentiment_score"] == res2["sentiment_score"]
    assert res1["news_count"] == res2["news_count"]
    # Check that uncomputable metrics are explicitly marked unavailable
    assert res1["social_mentions"]["status"] == "unavailable"
    assert res1["social_sentiment"]["status"] == "unavailable"
    assert res1["analyst_rating"]["status"] == "unavailable"


def test_market_regime_detector_returns_real_or_unavailable():
    """Verify regime detector returns structured result with rule_version."""
    regime = market_regime_detector.detect_regime()
    assert "status" in regime
    assert regime["rule_version"] == "sma_cross_vol_v1"
    if regime["status"] == "ok":
        assert regime["regime"] in ["bull_market", "bear_market", "sideways", "volatile", "recovery"]
        assert isinstance(regime["sma20"], (int, float))
        assert isinstance(regime["sma50"], (int, float))
        assert isinstance(regime["vol20_pct"], (int, float))
    else:
        assert regime["status"] == "unavailable"
        assert "reason" in regime


def test_prediction_engine_no_fake_models():
    """Verify prediction_models dictionary is empty (no fake XGBoost / LightGBM / Neural Net / Prophet)."""
    mock_stock = {"price": 2500.0, "pe_ratio": 26.5}
    mock_tech = {"rsi": 58.0, "macd": 2.5, "macd_hist": 0.5, "vol_surge": 1.4, "sma_20": 2450.0}

    pred = prediction_engine._fallback_predict("RELIANCE", mock_stock, mock_tech)
    assert pred["prediction_models"] == {}
    assert pred["analysis_mode"] == "deterministic_rule_based"
    assert pred["signal"] in ["BUY", "SELL", "HOLD"]
    assert isinstance(pred["confidence"], (int, float))


def test_prediction_engine_handles_unavailable_technicals():
    """Verify fallback prediction handles unavailable technical indicator objects gracefully without crashing."""
    unavail_tech = prediction_engine._fallback_technicals(2500.0)
    assert unavail_tech["rsi"]["status"] == "unavailable"

    mock_stock = {"price": 2500.0, "pe_ratio": 25.0}
    pred = prediction_engine._fallback_predict("TEST", mock_stock, unavail_tech)
    assert pred["signal"] in ["BUY", "SELL", "HOLD"]
    assert pred["prediction_models"] == {}


def test_chart_data_returns_real_or_unavailable_sentinel():
    """Verify generate_chart_data returns real data points or unavailable sentinel."""
    chart = generate_chart_data("RELIANCE", days=30)
    assert isinstance(chart, list)
    assert len(chart) > 0
    first_item = chart[0]
    if first_item.get("status") == "unavailable":
        assert "reason" in first_item
    else:
        assert "open" in first_item
        assert "close" in first_item
        assert "volume" in first_item
        assert first_item["source"] == "yfinance"


def test_risk_analyzer_returns_structured_metrics():
    """Verify risk analyzer returns beta, volatility, max drawdown, Sharpe or explicit unavailable state."""
    stock = {"price": 2500.0, "pe_ratio": 25.0, "week52_high": 3000.0, "week52_low": 2000.0}
    res = risk_analyzer.analyze_risk("RELIANCE", stock)

    assert "overall_risk" in res
    assert "disclaimer" in res
    assert res["disclaimer"] == "Not investment advice."
    assert "beta" in res
    assert "volatility_pct" in res
    assert "max_drawdown_pct" in res
    assert "sharpe_ratio" in res

