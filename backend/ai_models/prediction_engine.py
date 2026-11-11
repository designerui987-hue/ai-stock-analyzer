"""
AI Prediction Engine
--------------------
Institutional-grade quantitative engine for Indian equity analysis.

Architecture:
  Real Market Data (yfinance)
        ↓
  Python Quant Engine  ← THIS FILE
        ↓
  RSI / SMA / MACD / BB / ATR / Volume
        ↓
  Fundamentals + Sentiment
        ↓
  NVIDIA Nemotron 3 Super 120B  (nvidia_client.py)
        ↓
  Validated Structured Analysis
        ↓
  Stock Analyzer UI

IMPORTANT: This file is the sole source of truth for all mathematical
indicator calculations. The AI layer (nvidia_client.py) only interprets
the results — it never recalculates them.
"""

import os
import logging
import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, Optional

from data.demo_stocks import NIFTY50_STOCKS
from config import settings
from ai_models.nvidia_client import NvidiaClient

logger = logging.getLogger("prediction_engine")


class PredictionEngine:
    """
    Quantitative prediction engine powered by NVIDIA Nemotron AI.

    Responsibilities:
      - Fetch live market data via yfinance
      - Compute all technical indicators (RSI, SMAs, MACD, BB, ATR, Volume)
      - Delegate reasoning and synthesis to NvidiaClient
      - Fall back to a deterministic rule-based engine when AI is unavailable
    """

    def __init__(self):
        self._nvidia_client: Optional[NvidiaClient] = None

    def _get_nvidia_client(self) -> Optional[NvidiaClient]:
        """Lazily initialise the NVIDIA client from environment / settings."""
        if self._nvidia_client is not None:
            return self._nvidia_client

        api_key = getattr(settings, "nvidia_api_key", None) or os.getenv("NVIDIA_API_KEY")
        if not api_key:
            logger.warning("[PredictionEngine] NVIDIA_API_KEY not set — AI analysis unavailable; using deterministic fallback.")
            return None

        base_url = (
            getattr(settings, "nvidia_base_url", None)
            or os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
        )
        model = (
            getattr(settings, "nvidia_model", None)
            or os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")
        )

        self._nvidia_client = NvidiaClient(
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
        logger.info("[PredictionEngine] NVIDIA client initialised — model: %s", model)
        return self._nvidia_client

    # ------------------------------------------------------------------
    # Technical Indicator Calculations (Python quant engine)
    # All mathematical computations live here. Never moved to the LLM.
    # ------------------------------------------------------------------

    @staticmethod
    def _wilder_rsi(close: pd.Series, period: int = 14) -> Optional[float]:
        if len(close) < period + 1:
            return None
        vals = [float(x) for x in close.tolist()]
        gain_sum = 0.0
        loss_sum = 0.0
        for i in range(1, period + 1):
            diff = vals[i] - vals[i - 1]
            if diff >= 0:
                gain_sum += diff
            else:
                loss_sum += abs(diff)
        avg_gain = gain_sum / period
        avg_loss = loss_sum / period
        for i in range(period + 1, len(vals)):
            diff = vals[i] - vals[i - 1]
            g = diff if diff > 0 else 0.0
            l = abs(diff) if diff < 0 else 0.0
            avg_gain = (avg_gain * (period - 1) + g) / period
            avg_loss = (avg_loss * (period - 1) + l) / period
        if avg_loss == 0:
            return 50.0 if avg_gain == 0 else 100.0
        rs = avg_gain / avg_loss
        return round(100.0 - (100.0 / (1.0 + rs)), 2)

    @staticmethod
    def _wilder_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> Optional[float]:
        if len(close) < period + 1:
            return None
        h = [float(x) for x in high.tolist()]
        l = [float(x) for x in low.tolist()]
        c = [float(x) for x in close.tolist()]
        trs = [
            max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
            for i in range(1, len(c))
        ]
        atr = sum(trs[:period]) / period
        for tr_val in trs[period:]:
            atr = (atr * (period - 1) + tr_val) / period
        return round(atr, 2)

    def compute_technicals_from_ohlcv(
        self,
        candles: Optional[List[Dict[str, Any]]],
        price: float,
        exclude_incomplete: bool = True,
    ) -> dict:
        """Compute verified Wilder & moving-average indicators from OHLCV list."""
        if not candles:
            return {"status": "unavailable", "reason": "OHLCV history unavailable."}
        rows = [
            c for c in candles
            if isinstance(c, dict) and (not exclude_incomplete or c.get("completed", True) is not False)
        ]
        if len(rows) < 20:
            return {
                "status": "unavailable",
                "reason": f"Insufficient completed bars ({len(rows)} < 20 required).",
            }

        df = pd.DataFrame(rows)
        close = df["close"].astype(float)
        high = df["high"].astype(float)
        low = df["low"].astype(float)
        volume = df["volume"].astype(float)

        rsi = self._wilder_rsi(close, 14)
        atr = self._wilder_atr(high, low, close, 14)

        sma_20 = round(float(close.rolling(20).mean().iloc[-1]), 2) if len(close) >= 20 else None
        sma_50 = round(float(close.rolling(50).mean().iloc[-1]), 2) if len(close) >= 50 else None
        sma_200 = round(float(close.rolling(200).mean().iloc[-1]), 2) if len(close) >= 200 else None

        macd = macd_signal = macd_hist = None
        if len(close) >= 35:
            ema_12 = close.ewm(span=12, adjust=False).mean()
            ema_26 = close.ewm(span=26, adjust=False).mean()
            macd_series = ema_12 - ema_26
            macd_sig_series = macd_series.ewm(span=9, adjust=False).mean()
            macd = round(float(macd_series.iloc[-1]), 4)
            macd_signal = round(float(macd_sig_series.iloc[-1]), 4)
            macd_hist = round(macd - macd_signal, 4)

        bollinger_upper = bollinger_lower = None
        if len(close) >= 20 and sma_20 is not None:
            std_20 = float(close.rolling(20).std().iloc[-1])
            bollinger_upper = round(sma_20 + (2 * std_20), 2)
            bollinger_lower = round(sma_20 - (2 * std_20), 2)

        vol_20_avg = float(volume.rolling(20).mean().iloc[-1]) if len(volume) >= 20 else None
        vol_surge = round(float(volume.iloc[-1]) / vol_20_avg, 2) if vol_20_avg and vol_20_avg > 0 else None
        return_1m = (
            round(float(((price - close.iloc[-22]) / close.iloc[-22]) * 100), 2)
            if len(close) >= 22 and close.iloc[-22] > 0
            else None
        )
        return_3m = (
            round(float(((price - close.iloc[-65]) / close.iloc[-65]) * 100), 2)
            if len(close) >= 65 and close.iloc[-65] > 0
            else None
        )

        return {
            "price": price,
            "bar_count": len(rows),
            "rsi": rsi,
            "macd": macd,
            "macd_signal": macd_signal,
            "macd_hist": macd_hist,
            "sma_20": sma_20,
            "sma_50": sma_50,
            "sma_200": sma_200,
            "bollinger_upper": bollinger_upper,
            "bollinger_lower": bollinger_lower,
            "atr": atr,
            "vol_surge": vol_surge,
            "return_1m": return_1m,
            "return_3m": return_3m,
        }

    def analyze(self, symbol: str, technicals: dict) -> dict:
        """Deterministic rule evaluation from computed technicals dict."""
        if not technicals or technicals.get("status") == "unavailable":
            return {
                "status": "unavailable",
                "reason": (technicals or {}).get("reason", "Technicals unavailable."),
                "disclaimer": "Not investment advice.",
            }
        price = technicals.get("price")
        pred = self._fallback_predict(symbol, {"price": price}, technicals)
        return {
            "signal": pred.get("signal", "HOLD"),
            "confidence": pred.get("confidence"),
            "target_price": pred.get("exit_price"),
            "stop_loss": pred.get("stop_loss"),
            "rule_version": pred.get("rule_version", "tech_consensus_v1"),
            "rationale": pred.get("explanation"),
            "factors": pred.get("factors", []),
            "prediction_models": {},
            "disclaimer": "Deterministic quantitative rules only. Not investment advice.",
        }

    def calculate_technicals(self, ticker: yf.Ticker, price: float) -> dict:
        """Calculate Wilder & moving-average technical indicators from yfinance history."""
        try:
            hist = ticker.history(period="6mo")
            if hist.empty or len(hist) < 20:
                return self._fallback_technicals(price)

            candles = [
                {
                    "open": float(r["Open"]),
                    "high": float(r["High"]),
                    "low": float(r["Low"]),
                    "close": float(r["Close"]),
                    "volume": float(r["Volume"]),
                }
                for _, r in hist.iterrows()
            ]
            res = self.compute_technicals_from_ohlcv(candles, price, exclude_incomplete=False)
            if res.get("status") == "unavailable":
                return self._fallback_technicals(price)
            return res
        except Exception as exc:
            logger.warning("[PredictionEngine] Technical calculation error: %s", exc)
            return self._fallback_technicals(price)

    def _fallback_technicals(self, price: float) -> dict:
        """
        Return an explicit unavailable state for each technical indicator.
        Called only when yfinance data is insufficient (< 20 bars).
        Never returns invented constant values as if they were real.
        """
        reason = "Insufficient price history from yfinance (< 20 bars)"
        unavail = {"status": "unavailable", "reason": reason}
        return {
            "rsi": unavail,
            "macd": unavail,
            "macd_signal": unavail,
            "macd_hist": unavail,
            "sma_20": unavail,
            "sma_50": unavail,
            "sma_200": unavail,
            "bollinger_upper": unavail,
            "bollinger_lower": unavail,
            "atr": unavail,
            "vol_surge": unavail,
            "return_1m": unavail,
            "return_3m": unavail,
        }

    # ------------------------------------------------------------------
    # Live market data fetch
    # ------------------------------------------------------------------

    def fetch_live_data(self, symbol: str) -> dict:
        """Fetch live quote and compute technical indicators from yfinance."""
        try:
            query_symbol = symbol if "." in symbol else f"{symbol}.NS"
            ticker = yf.Ticker(query_symbol)
            info = ticker.info

            if not info or (
                "regularMarketPrice" not in info and "currentPrice" not in info
            ):
                return {}

            price = info.get("currentPrice", info.get("regularMarketPrice", 0))
            prev_close = info.get("previousClose", price)
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0

            technicals = self.calculate_technicals(ticker, price)

            return {
                "symbol": symbol,
                "name": info.get("longName", symbol),
                "price": price,
                "change_pct": change_pct,
                "volume": info.get("volume", 0),
                "avg_volume": info.get("averageVolume", 0),
                "week52_high": info.get("fiftyTwoWeekHigh", price),
                "week52_low": info.get("fiftyTwoWeekLow", price),
                "pe_ratio": round(info.get("trailingPE", 25.0) or 25.0, 2),
                "sector": info.get("sector", "Unknown"),
                "technicals": technicals,
            }

        except Exception as exc:
            logger.warning("[PredictionEngine] yfinance error for %s: %s", symbol, exc)
            return {}

    # ------------------------------------------------------------------
    # Primary prediction entry point
    # ------------------------------------------------------------------

    def predict(self, symbol: str, stock_data: Dict = None) -> Dict:
        """
        Generate a structured AI analysis for a stock symbol.

        Flow:
          1. Obtain market data (live → demo fixture → error).
          2. Ensure technicals are computed by the Python quant engine.
          3. Attempt NVIDIA Nemotron analysis.
          4. On any failure, fall back to deterministic technical engine.
        """
        # --- Step 1: Resolve stock data ---
        if not stock_data:
            stock_data = self.fetch_live_data(symbol)
        if not stock_data:
            stock_data = NIFTY50_STOCKS.get(symbol)
            if stock_data and "technicals" not in stock_data:
                stock_data["technicals"] = self._fallback_technicals(
                    stock_data.get("price", 1000)
                )
        if not stock_data:
            return self._default_prediction(symbol)

        # --- Step 2: Ensure technicals ---
        technicals = stock_data.get("technicals") or self._fallback_technicals(
            stock_data.get("price", 1000)
        )

        # --- Step 3: Build a light sentiment stub for the prompt ---
        # (The full sentiment object comes from sentiment_analyzer in stocks.py;
        #  here we pass the bare minimum if not already present.)
        sentiment_stub = {
            "overall_sentiment": "neutral",
            "sentiment_score": 0.5,
            "news_count": 0,
            "analyst_rating": "N/A",
        }

        # --- Step 4: Try NVIDIA ---
        client = self._get_nvidia_client()
        if client:
            try:
                result = client.analyze(symbol, stock_data, technicals, sentiment_stub)
                if result:
                    return result
                logger.warning(
                    "[PredictionEngine] NVIDIA returned no valid result for %s — activating fallback.",
                    symbol,
                )
            except Exception as exc:
                logger.error(
                    "[PredictionEngine] Unexpected error during NVIDIA call for %s: %s",
                    symbol, exc,
                )

        # --- Step 5: Deterministic fallback ---
        logger.info("[PredictionEngine] Using deterministic fallback for %s.", symbol)
        return self._fallback_predict(symbol, stock_data, technicals)

    # ------------------------------------------------------------------
    # Deterministic fallback (no AI dependency)
    # ------------------------------------------------------------------

    def _fallback_predict(self, symbol: str, stock: Dict, technicals: dict) -> Dict:
        """
        Rule-based deterministic prediction used when NVIDIA is unavailable.
        Uses the pre-computed technical indicators from the quant engine.
        Safely handles indicators that may be in an unavailable state.
        """
        price = stock.get("price", 1000)
        if isinstance(price, dict):
            price = 1000.0

        # Extract numeric indicators safely
        def _get_num(key, default=None):
            val = technicals.get(key)
            return val if isinstance(val, (int, float)) else default

        rsi = _get_num("rsi")
        macd = _get_num("macd")
        macd_hist = _get_num("macd_hist")
        vol_surge = _get_num("vol_surge")
        sma_20 = _get_num("sma_20")

        # Consensus rules (only test available metrics)
        signals = []
        if rsi is not None:
            signals.append(rsi > 50)
        if macd is not None:
            signals.append(macd > 0)
        if macd_hist is not None:
            signals.append(macd_hist > 0)
        if vol_surge is not None:
            signals.append(vol_surge > 1.2)
        if sma_20 is not None and price is not None:
            signals.append(price > sma_20)

        total_signals = len(signals)
        bull_signals = sum(signals)
        bear_signals = total_signals - bull_signals

        if bull_signals >= 4:
            signal = "BUY"
        elif bear_signals >= 4:
            signal = "SELL"
        else:
            signal = "HOLD"

        atr_val = technicals.get("atr")
        atr = atr_val if isinstance(atr_val, (int, float)) else (price * 0.025)
        if signal == "BUY":
            entry_price = round(price, 2)
            stop_loss = round(price - 1.5 * atr, 2)
            exit_price = round(price + 3.0 * atr, 2)   # 1:2 RR minimum
        elif signal == "SELL":
            entry_price = round(price, 2)
            stop_loss = round(price + 1.5 * atr, 2)
            exit_price = round(price - 3.0 * atr, 2)
        else:
            entry_price = round(price, 2)
            stop_loss = round(price - 1.5 * atr, 2)
            exit_price = round(price + 3.0 * atr, 2)

        score = 0.85 if signal == "BUY" else -0.85 if signal == "SELL" else 0.1

        return {
            "signal": signal,
            "confidence": round(50 + bull_signals * 7.0, 1),
            "risk_score": round(5.0 - (bull_signals - 2.5) * 0.8, 1),
            "entry_price": entry_price,
            "exit_price": exit_price,
            "stop_loss": stop_loss,
            "profit_probability": round(50 + bull_signals * 5.0, 1),
            "explanation": (
                "Rule-based quantitative analysis (deterministic mode — no AI model). "
                f"Technical consensus: {bull_signals}/5 bullish signals. "
                "Connect NVIDIA_API_KEY for full LLM-assisted analysis."
            ),
            "factors": [
                f"RSI {'above' if rsi > 50 else 'below'} 50 ({rsi:.1f})" if rsi is not None else "RSI: unavailable",
                f"MACD histogram {'positive' if macd_hist > 0 else 'negative'} ({macd_hist:.4f})" if macd_hist is not None else "MACD: unavailable",
                f"Volume surge {vol_surge:.2f}x 20-day average" if vol_surge is not None else "Volume: unavailable",
                f"Price {'above' if sma_20 is not None and price > sma_20 else 'below'} SMA-20" if sma_20 is not None else "SMA-20: unavailable",
            ],
            "pe_ratio": stock.get("pe_ratio", 25.0),
            "rsi": rsi,
            "macd": macd,
            # prediction_models is intentionally empty: no trained XGBoost/LightGBM/
            # Neural Net/Prophet exists in this codebase. Fake scores are not shown.
            "prediction_models": {},
            "rule_version": "tech_consensus_v1",
            "analysis_mode": "deterministic_rule_based",
        }

    def _default_prediction(self, symbol: str) -> Dict:
        """Return explicit unavailable state when no market data could be obtained."""
        return {
            "status": "unavailable",
            "signal": "HOLD",
            "confidence": None,
            "risk_score": None,
            "entry_price": None,
            "exit_price": None,
            "stop_loss": None,
            "profit_probability": None,
            "explanation": f"Insufficient data for {symbol}. Market data could not be retrieved.",
            "factors": ["Data unavailable"],
            "pe_ratio": None,
            "rsi": None,
            "macd": None,
            "prediction_models": {},
            "disclaimer": "Not investment advice.",
        }


# Singleton used by all API routes
prediction_engine = PredictionEngine()
