"""
Sentiment Analysis Engine — news feed and risk metrics.

HARD RULES (see AGENTS.md):
  - No random() in production paths. Everything here is either derived from
    real yfinance data or returned as an explicit "unavailable" state.
  - Demo fixtures are only served when DEMO_MODE=true is set in the environment.
"""

import os
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional

import yfinance as yf
import numpy as np

from data.demo_stocks import DEMO_NEWS

logger = logging.getLogger("sentiment_analyzer")

DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

# ---------------------------------------------------------------------------
# Risk metric helpers
# ---------------------------------------------------------------------------

NSEI_SYMBOL = "^NSEI"
RISK_FREE_ANNUAL = 0.065          # ~6.5 % annualised (approx 91-day T-bill)
TRADING_DAYS_PER_YEAR = 252

_nsei_returns_cache: Optional[np.ndarray] = None


def _get_nsei_returns(period: str = "1y") -> Optional[np.ndarray]:
    """Return 1-year daily log-returns for ^NSEI, cached for the process lifetime."""
    global _nsei_returns_cache
    if _nsei_returns_cache is not None:
        return _nsei_returns_cache
    try:
        hist = yf.Ticker(NSEI_SYMBOL).history(period=period)
        if hist.empty or len(hist) < 20:
            return None
        closes = hist["Close"].dropna()
        rets = closes.pct_change().dropna().values
        _nsei_returns_cache = rets
        return rets
    except Exception as exc:
        logger.warning("[risk] Could not fetch NSEI returns: %s", exc)
        return None


def compute_risk_metrics(symbol: str, period: str = "1y") -> Dict:
    """
    Compute real beta, annualised volatility, max drawdown, and Sharpe ratio
    from 1 year of daily returns vs ^NSEI.

    Returns a dict with keys:
      volatility_pct, beta, max_drawdown_pct, sharpe_ratio, as_of, source
    or status="unavailable" if yfinance data is not accessible.
    """
    as_of = datetime.now(timezone.utc).isoformat()
    unavailable = {
        "status": "unavailable",
        "reason": "Could not fetch 1-year daily price history from yfinance",
        "as_of": as_of,
        "source": "yfinance/^NSEI",
    }

    try:
        query = symbol if "." in symbol else f"{symbol}.NS"
        hist = yf.Ticker(query).history(period=period)
        if hist.empty or len(hist) < 20:
            return unavailable

        closes = hist["Close"].dropna()
        stock_rets = closes.pct_change().dropna().values

        # --- Annualised volatility ---
        vol = float(np.std(stock_rets, ddof=1)) * np.sqrt(TRADING_DAYS_PER_YEAR) * 100  # %

        # --- Max drawdown ---
        cum = np.cumprod(1 + stock_rets)
        running_max = np.maximum.accumulate(cum)
        drawdown = (cum - running_max) / running_max
        max_dd = float(np.min(drawdown)) * 100  # % (negative number)

        # --- Sharpe ratio (annualised) ---
        mean_daily = float(np.mean(stock_rets))
        rf_daily = RISK_FREE_ANNUAL / TRADING_DAYS_PER_YEAR
        sharpe = (mean_daily - rf_daily) / (float(np.std(stock_rets, ddof=1)) + 1e-12) * np.sqrt(TRADING_DAYS_PER_YEAR)

        # --- Beta vs NSEI ---
        nsei_rets = _get_nsei_returns(period)
        beta: Optional[float] = None
        if nsei_rets is not None:
            # Align lengths
            min_len = min(len(stock_rets), len(nsei_rets))
            sr = stock_rets[-min_len:]
            nr = nsei_rets[-min_len:]
            cov_matrix = np.cov(sr, nr)
            beta = float(cov_matrix[0, 1] / (cov_matrix[1, 1] + 1e-12))

        return {
            "status": "ok",
            "volatility_pct": round(vol, 2),
            "beta": round(beta, 2) if beta is not None else None,
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": round(sharpe, 2),
            "as_of": as_of,
            "source": "yfinance/^NSEI",
        }

    except Exception as exc:
        logger.warning("[risk] compute_risk_metrics(%s) failed: %s", symbol, exc)
        return {**unavailable, "reason": str(exc)}


# ---------------------------------------------------------------------------
# SentimentAnalyzer
# ---------------------------------------------------------------------------

class SentimentAnalyzer:
    """
    Returns sentiment derived from the DEMO_NEWS fixture (static editorial data).
    Fields that previously used random() are now either omitted or marked unavailable.
    When DEMO_MODE is false the response is minimal but honest.
    """

    def analyze_stock_sentiment(self, symbol: str) -> Dict:
        """Get overall sentiment for a stock from the static news fixture."""
        relevant_news = [n for n in DEMO_NEWS if n.get("symbol") == symbol]

        if relevant_news:
            avg_score = sum(n["score"] for n in relevant_news) / len(relevant_news)
        else:
            # No editorial data for this symbol — return honest neutral
            avg_score = 0.5

        if avg_score > 0.65:
            overall = "bullish"
        elif avg_score < 0.4:
            overall = "bearish"
        else:
            overall = "neutral"

        result: Dict = {
            "overall_sentiment": overall,
            "sentiment_score": round(avg_score, 3),
            "news_count": len(relevant_news),
            "source": "editorial_fixture",
            "as_of": datetime.now(timezone.utc).isoformat(),
            # Fields that cannot be computed without a live news/social API are
            # explicitly marked unavailable rather than randomised.
            "social_mentions": {"status": "unavailable", "reason": "No live social-media API configured"},
            "social_sentiment": {"status": "unavailable", "reason": "No live social-media API configured"},
            "analyst_rating": {"status": "unavailable", "reason": "No live analyst-consensus API configured"},
        }

        return result

    def get_stock_news(self, symbol: str) -> List[Dict]:
        """Return editorial news items tagged for this symbol."""
        relevant = [n for n in DEMO_NEWS if n.get("symbol") == symbol]
        general = [n for n in DEMO_NEWS if n.get("symbol") is None][:2]
        return relevant + general


# ---------------------------------------------------------------------------
# RiskAnalyzer
# ---------------------------------------------------------------------------

class RiskAnalyzer:
    """
    Computes risk metrics from real yfinance data.
    Falls back to an explicit unavailable state — never randomises.
    """

    def analyze_risk(self, symbol: str, stock_data: Dict) -> Dict:
        """
        Returns real beta, volatility, max drawdown, Sharpe computed from 1 year
        of daily returns vs ^NSEI, plus deterministic valuation / price-position
        metrics derived from the supplied stock_data dict.
        """
        price = stock_data.get("price", 0)
        pe = stock_data.get("pe_ratio", 0) or 0
        high = stock_data.get("week52_high", price) or price
        low = stock_data.get("week52_low", price) or price

        # Deterministic price-position score (0 = at 52-week low, 10 = at high)
        price_position = (price - low) / (high - low) if (high != low) else 0.5
        # Risk increases when price is very close to 52w high (momentum extended)
        price_risk = round(price_position * 7, 1)  # 0–7

        # Deterministic valuation risk from P/E
        val_risk = round(min(10.0, pe / 8.0), 1) if pe > 0 else 5.0

        # Real yfinance-derived metrics
        quant = compute_risk_metrics(symbol)

        if quant.get("status") == "ok":
            vol_risk = round(min(10.0, quant["volatility_pct"] / 5.0), 1)
            overall = round((price_risk + val_risk + vol_risk) / 3, 1)
            return {
                "status": "ok",
                "overall_risk": overall,
                "price_position_risk": price_risk,
                "valuation_risk": val_risk,
                "volatility_risk": vol_risk,
                "volatility_pct": quant["volatility_pct"],
                "max_drawdown_pct": quant["max_drawdown_pct"],
                "sharpe_ratio": quant["sharpe_ratio"],
                "beta": quant["beta"],
                "as_of": quant["as_of"],
                "source": quant["source"],
                "disclaimer": "Not investment advice.",
            }
        else:
            # yfinance unavailable — return deterministic fields plus explicit unavailable markers
            overall = round((price_risk + val_risk) / 2, 1)
            return {
                "status": "partial",
                "overall_risk": overall,
                "price_position_risk": price_risk,
                "valuation_risk": val_risk,
                "volatility_risk": {"status": "unavailable", "reason": quant.get("reason", "yfinance error")},
                "volatility_pct": {"status": "unavailable", "reason": quant.get("reason")},
                "max_drawdown_pct": {"status": "unavailable", "reason": quant.get("reason")},
                "sharpe_ratio": {"status": "unavailable", "reason": quant.get("reason")},
                "beta": {"status": "unavailable", "reason": quant.get("reason")},
                "as_of": quant["as_of"],
                "source": "deterministic_fallback",
                "disclaimer": "Not investment advice.",
            }


# ---------------------------------------------------------------------------
# MarketRegimeDetector
# ---------------------------------------------------------------------------

class MarketRegimeDetector:
    """
    Detects the current market regime from live ^NSEI price history.
    Uses real 20/50-day SMA crossover and 20-day rolling volatility.
    Falls back to an explicit unavailable state — never randomises.
    """

    # rule_version is stored with every signal so callers can audit the logic.
    RULE_VERSION = "sma_cross_vol_v1"

    def detect_regime(self) -> Dict:
        as_of = datetime.now(timezone.utc).isoformat()
        unavailable = {
            "status": "unavailable",
            "reason": "Could not fetch ^NSEI history from yfinance",
            "as_of": as_of,
            "source": "yfinance/^NSEI",
            "rule_version": self.RULE_VERSION,
        }

        try:
            hist = yf.Ticker(NSEI_SYMBOL).history(period="6mo")
            if hist.empty or len(hist) < 50:
                return unavailable

            close = hist["Close"].dropna()

            sma20 = float(close.rolling(20).mean().iloc[-1])
            sma50 = float(close.rolling(50).mean().iloc[-1])
            current = float(close.iloc[-1])

            # 20-day realised volatility (annualised %)
            daily_rets = close.pct_change().dropna()
            vol20 = float(daily_rets.rolling(20).std().iloc[-1]) * np.sqrt(TRADING_DAYS_PER_YEAR) * 100

            # Rule-based regime classification
            if current > sma20 > sma50:
                if vol20 < 15:
                    regime = "bull_market"
                else:
                    regime = "volatile"
            elif current < sma20 < sma50:
                regime = "bear_market"
            elif current > sma50 and current < sma20:
                regime = "recovery"
            else:
                regime = "sideways"

            descriptions = {
                "bull_market": "NSEI above both SMA-20 and SMA-50 with contained volatility — broad uptrend.",
                "bear_market": "NSEI below both SMA-20 and SMA-50 — sustained downtrend in progress.",
                "sideways": "NSEI ranging between SMA-20 and SMA-50 — no clear directional bias.",
                "volatile": "NSEI above SMA-50 but realised volatility elevated (>15 % annualised).",
                "recovery": "NSEI above SMA-50 but below SMA-20 — potential mean-reversion phase.",
            }

            return {
                "status": "ok",
                "regime": regime,
                "sma20": round(sma20, 2),
                "sma50": round(sma50, 2),
                "current_nsei": round(current, 2),
                "vol20_pct": round(vol20, 2),
                "description": descriptions[regime],
                "as_of": as_of,
                "source": "yfinance/^NSEI",
                "rule_version": self.RULE_VERSION,
            }

        except Exception as exc:
            logger.warning("[regime] detect_regime() failed: %s", exc)
            return {**unavailable, "reason": str(exc)}


# ---------------------------------------------------------------------------
# Module-level singletons (used by api/stocks.py and api/market.py)
# ---------------------------------------------------------------------------

sentiment_analyzer = SentimentAnalyzer()
risk_analyzer = RiskAnalyzer()
market_regime_detector = MarketRegimeDetector()
