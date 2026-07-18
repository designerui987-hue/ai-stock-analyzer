"""AI Prediction Engine - Multi-model ensemble for stock analysis."""

import random
import math
from typing import Dict, Tuple
from data.demo_stocks import NIFTY50_STOCKS


class PredictionEngine:
    """Ensemble prediction engine combining multiple model outputs."""

    def __init__(self):
        self.model_weights = {
            "xgboost": 0.30,
            "lightgbm": 0.25,
            "neural_net": 0.25,
            "prophet": 0.20,
        }

    def predict(self, symbol: str) -> Dict:
        """Generate AI prediction for a stock symbol."""
        stock = NIFTY50_STOCKS.get(symbol)
        if not stock:
            return self._default_prediction(symbol)

        # Simulate individual model predictions
        xgb_pred = self._simulate_xgboost(stock)
        lgb_pred = self._simulate_lightgbm(stock)
        nn_pred = self._simulate_neural_net(stock)
        prophet_pred = self._simulate_prophet(stock)

        # Ensemble weighted average
        models = {
            "xgboost": xgb_pred,
            "lightgbm": lgb_pred,
            "neural_net": nn_pred,
            "prophet": prophet_pred,
        }

        # Calculate weighted signal score (-1 to 1)
        signal_score = sum(
            models[m]["score"] * self.model_weights[m] for m in models
        )

        # Determine signal
        if signal_score > 0.2:
            signal = "BUY"
        elif signal_score < -0.2:
            signal = "SELL"
        else:
            signal = "HOLD"

        # Calculate confidence (higher agreement = higher confidence)
        scores = [m["score"] for m in models.values()]
        agreement = 1 - (max(scores) - min(scores))
        confidence = round(min(95, max(45, abs(signal_score) * 100 * agreement + random.uniform(-5, 5))), 1)

        # Risk score (1-10)
        volatility = abs(stock["change_pct"])
        pe_risk = min(1, stock["pe_ratio"] / 50)
        risk_score = round(min(9.5, max(2.0, volatility * 2 + pe_risk * 3 + random.uniform(0, 2))), 1)

        # Entry/exit prices
        price = stock["price"]
        if signal == "BUY":
            entry_price = round(price * random.uniform(0.98, 1.0), 2)
            exit_price = round(price * random.uniform(1.08, 1.18), 2)
            stop_loss = round(price * random.uniform(0.93, 0.96), 2)
        elif signal == "SELL":
            entry_price = round(price, 2)
            exit_price = round(price * random.uniform(0.85, 0.94), 2)
            stop_loss = round(price * random.uniform(1.03, 1.06), 2)
        else:
            entry_price = round(price * random.uniform(0.97, 0.99), 2)
            exit_price = round(price * random.uniform(1.04, 1.10), 2)
            stop_loss = round(price * random.uniform(0.94, 0.97), 2)

        # Profit probability
        profit_prob = round(min(92, max(35, confidence * 0.8 + random.uniform(-5, 10))), 1)

        # Generate explanation
        explanation = self._generate_explanation(signal, stock, confidence, risk_score)
        factors = self._generate_factors(signal, stock)

        return {
            "signal": signal,
            "confidence": confidence,
            "risk_score": risk_score,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "stop_loss": stop_loss,
            "profit_probability": profit_prob,
            "explanation": explanation,
            "factors": factors,
            "prediction_models": {
                name: {"score": round(m["score"], 3), "signal": m["signal"]}
                for name, m in models.items()
            },
        }

    def _simulate_xgboost(self, stock: Dict) -> Dict:
        score = random.gauss(stock["change_pct"] / 3, 0.3)
        score = max(-1, min(1, score))
        return {"score": score, "signal": "BUY" if score > 0.2 else "SELL" if score < -0.2 else "HOLD"}

    def _simulate_lightgbm(self, stock: Dict) -> Dict:
        score = random.gauss(stock["change_pct"] / 3 + 0.05, 0.25)
        score = max(-1, min(1, score))
        return {"score": score, "signal": "BUY" if score > 0.2 else "SELL" if score < -0.2 else "HOLD"}

    def _simulate_neural_net(self, stock: Dict) -> Dict:
        score = random.gauss(stock["change_pct"] / 4, 0.35)
        score = max(-1, min(1, score))
        return {"score": score, "signal": "BUY" if score > 0.15 else "SELL" if score < -0.15 else "HOLD"}

    def _simulate_prophet(self, stock: Dict) -> Dict:
        price_position = (stock["price"] - stock["week52_low"]) / (stock["week52_high"] - stock["week52_low"])
        score = (0.5 - price_position) + random.gauss(0, 0.15)
        score = max(-1, min(1, score))
        return {"score": score, "signal": "BUY" if score > 0.2 else "SELL" if score < -0.2 else "HOLD"}

    def _generate_explanation(self, signal: str, stock: Dict, confidence: float, risk: float) -> str:
        name = stock["name"]
        price = stock["price"]
        pe = stock["pe_ratio"]

        if signal == "BUY":
            return (
                f"AI models indicate a buying opportunity for {name} at ₹{price:.2f}. "
                f"The stock shows positive momentum with {confidence:.0f}% confidence from our ensemble models. "
                f"Current P/E of {pe:.1f}x suggests {'reasonable valuation' if pe < 30 else 'growth premium pricing'}. "
                f"Risk level is {'moderate' if risk < 5 else 'elevated'} at {risk}/10. "
                f"Technical indicators and market sentiment align for potential upside."
            )
        elif signal == "SELL":
            return (
                f"AI models suggest caution for {name} at ₹{price:.2f}. "
                f"The analysis shows bearish signals with {confidence:.0f}% confidence. "
                f"{'High P/E of ' + str(pe) + 'x indicates potential overvaluation. ' if pe > 35 else ''}"
                f"Risk score of {risk}/10 warrants protective measures. "
                f"Consider booking profits or tightening stop-losses."
            )
        else:
            return (
                f"AI models suggest holding {name} at ₹{price:.2f}. "
                f"The stock is in a consolidation phase with mixed signals. "
                f"P/E of {pe:.1f}x is {'within sector norms' if pe < 30 else 'above average'}. "
                f"Monitor for breakout triggers before taking new positions."
            )

    def _generate_factors(self, signal: str, stock: Dict) -> list:
        base_factors = [
            f"Price momentum: {'Positive' if stock['change_pct'] > 0 else 'Negative'} ({stock['change_pct']:+.2f}%)",
            f"Volume: {'Above' if stock['volume'] > stock['avg_volume'] else 'Below'} average",
            f"52-week range position: {((stock['price'] - stock['week52_low']) / (stock['week52_high'] - stock['week52_low']) * 100):.0f}%",
            f"P/E ratio: {stock['pe_ratio']:.1f}x",
            f"Sector trend: {stock['sector']}",
        ]

        if signal == "BUY":
            base_factors.append("Technical setup: Bullish pattern detected")
            base_factors.append("Institutional interest: Increasing")
        elif signal == "SELL":
            base_factors.append("Technical setup: Bearish divergence")
            base_factors.append("Resistance level: Near 52-week high")
        else:
            base_factors.append("Technical setup: Range-bound")
            base_factors.append("Key levels: Watch support and resistance")

        return base_factors

    def _default_prediction(self, symbol: str) -> Dict:
        return {
            "signal": "HOLD",
            "confidence": 50.0,
            "risk_score": 5.0,
            "entry_price": 0,
            "exit_price": 0,
            "stop_loss": 0,
            "profit_probability": 50.0,
            "explanation": f"Insufficient data for {symbol}. Using default neutral analysis.",
            "factors": ["Limited data available"],
            "prediction_models": {},
        }


# Singleton
prediction_engine = PredictionEngine()
