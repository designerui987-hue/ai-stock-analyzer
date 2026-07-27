"""Sentiment Analysis Engine - News and social media sentiment."""

import random
from typing import List, Dict
from data.demo_stocks import DEMO_NEWS


class SentimentAnalyzer:
    """Analyzes news and social sentiment for stocks."""

    def analyze_stock_sentiment(self, symbol: str) -> Dict:
        """Get overall sentiment for a stock."""
        relevant_news = [n for n in DEMO_NEWS if n.get("symbol") == symbol]
        general_news = [n for n in DEMO_NEWS if n.get("symbol") is None]

        if relevant_news:
            avg_score = sum(n["score"] for n in relevant_news) / len(relevant_news)
        else:
            avg_score = 0.55 + random.uniform(-0.15, 0.15)

        if avg_score > 0.65:
            overall = "bullish"
        elif avg_score < 0.4:
            overall = "bearish"
        else:
            overall = "neutral"

        return {
            "overall_sentiment": overall,
            "sentiment_score": round(avg_score, 3),
            "news_count": len(relevant_news) + random.randint(5, 15),
            "social_mentions": random.randint(50, 500),
            "social_sentiment": round(random.uniform(0.35, 0.85), 3),
            "analyst_rating": random.choice(["Strong Buy", "Buy", "Hold", "Reduce"]),
        }

    def get_stock_news(self, symbol: str) -> List[Dict]:
        """Get news items for a stock."""
        relevant = [n for n in DEMO_NEWS if n.get("symbol") == symbol]
        general = [n for n in DEMO_NEWS if n.get("symbol") is None][:2]
        return relevant + general


class RiskAnalyzer:
    """Analyzes risk factors for stocks."""

    def analyze_risk(self, symbol: str, stock_data: Dict) -> Dict:
        volatility = abs(stock_data.get("change_pct", 0))
        pe = stock_data.get("pe_ratio", 25)
        price = stock_data.get("price", 100)
        high = stock_data.get("week52_high", price * 1.2)
        low = stock_data.get("week52_low", price * 0.8)

        # Price position in 52-week range
        price_position = (price - low) / (high - low) if high != low else 0.5

        # Market risk
        market_risk = round(random.uniform(3, 7), 1)

        # Sector risk
        sector_risk = round(random.uniform(2, 8), 1)

        # Volatility risk
        vol_risk = round(min(10, volatility * 3 + random.uniform(1, 3)), 1)

        # Valuation risk
        val_risk = round(min(10, pe / 10 + random.uniform(0, 2)), 1)

        # Overall
        overall = round((market_risk + sector_risk + vol_risk + val_risk) / 4, 1)

        return {
            "overall_risk": overall,
            "market_risk": market_risk,
            "sector_risk": sector_risk,
            "volatility_risk": vol_risk,
            "valuation_risk": val_risk,
            "max_drawdown": round(random.uniform(5, 25), 1),
            "sharpe_ratio": round(random.uniform(0.5, 2.5), 2),
            "beta": round(random.uniform(0.6, 1.8), 2),
        }


class MarketRegimeDetector:
    """Detects current market regime."""

    def detect_regime(self) -> Dict:
        regimes = ["bull_market", "bear_market", "sideways", "volatile", "recovery"]
        weights = [0.35, 0.1, 0.25, 0.15, 0.15]
        regime = random.choices(regimes, weights=weights)[0]

        return {
            "regime": regime,
            "confidence": round(random.uniform(60, 90), 1),
            "duration_days": random.randint(15, 90),
            "description": {
                "bull_market": "Markets are in an uptrend with strong buying pressure and positive sentiment.",
                "bear_market": "Markets are in a downtrend with selling pressure dominating.",
                "sideways": "Markets are range-bound with no clear directional trend.",
                "volatile": "High volatility regime with large intraday swings.",
                "recovery": "Markets are recovering from a correction with improving sentiment.",
            }.get(regime, ""),
        }


sentiment_analyzer = SentimentAnalyzer()
risk_analyzer = RiskAnalyzer()
market_regime_detector = MarketRegimeDetector()
