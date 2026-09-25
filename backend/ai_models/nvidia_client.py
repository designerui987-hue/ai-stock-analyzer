"""
NVIDIA Nemotron AI Client
-------------------------
Responsible ONLY for:
  1. Building the structured prompt from pre-computed quant evidence.
  2. Calling the NVIDIA OpenAI-compatible inference endpoint.
  3. Validating and normalising the structured JSON response.
  4. Logging latency / success / failure (never logging the API key).

The quantitative engine (prediction_engine.py) remains the sole source of
truth for all mathematical indicators. This module NEVER recalculates RSI,
MACD, SMAs, ATR, or any other indicator. It only interprets them.
"""

import json
import time
import logging
from typing import Optional, Dict

logger = logging.getLogger("nvidia_client")


# ---------------------------------------------------------------------------
# System prompt — defines the model's role and hard constraints
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are the reasoning and synthesis layer of an AI-powered Indian equity analysis platform.

Your role is to interpret verified, pre-computed quantitative data and produce a structured trading analysis.

STRICT RULES:
1. You receive already-calculated technical indicators from a Python quant engine. Do NOT recalculate them.
2. Do NOT invent, guess, or fabricate any market data, prices, RSI, MACD, news, or fundamentals.
3. If a piece of data is missing from the input, explicitly state "Data unavailable" for that field.
4. Distinguish clearly between FACT (calculated data), CALCULATED SIGNAL (indicator reading), AI INTERPRETATION (your reasoning), and RISK.
5. Entry, target, and stop-loss levels must be derived from the provided price data and ATR. Do not invent levels.
6. The minimum acceptable risk-reward ratio is 1:2.0. If the setup does not offer this, signal HOLD and state why.
7. Do not present AI-generated reasoning as guaranteed future performance.
8. You must return a valid JSON object only — no markdown, no code fences, no prose outside the JSON.

You serve Indian equity investors (NSE / BSE). All prices are in Indian Rupees (₹).
"""


# ---------------------------------------------------------------------------
# Prompt builder — packages quant evidence for the model
# ---------------------------------------------------------------------------

def build_analysis_prompt(symbol: str, stock: dict, technicals: dict, sentiment: dict) -> str:
    """
    Construct the user-turn prompt from pre-computed quant evidence.
    The LLM receives numbers it must interpret, not numbers it must invent.
    """
    price = stock.get("price", 0)
    rsi = technicals.get("rsi", "N/A")
    rsi_label = (
        "Overbought (>70)" if isinstance(rsi, (int, float)) and rsi > 70
        else "Oversold (<30)" if isinstance(rsi, (int, float)) and rsi < 30
        else "Bullish Momentum" if isinstance(rsi, (int, float)) and rsi > 50
        else "Bearish Momentum" if isinstance(rsi, (int, float)) else "N/A"
    )

    prompt = f"""Analyze this Indian equity and produce a structured JSON response.

=== ASSET OVERVIEW ===
Symbol        : {symbol}
Name          : {stock.get("name", symbol)}
Sector        : {stock.get("sector", "N/A")}
Current Price : ₹{price}
Day Change    : {stock.get("change_pct", "N/A")}%
Volume        : {stock.get("volume", "N/A")}
Avg Volume    : {stock.get("avg_volume", "N/A")}
52W High      : ₹{stock.get("week52_high", "N/A")}
52W Low       : ₹{stock.get("week52_low", "N/A")}
Trailing P/E  : {stock.get("pe_ratio", "N/A")}

=== PYTHON QUANT ENGINE — PRE-COMPUTED TECHNICAL INDICATORS ===
(These are mathematical facts from the quant engine. Do NOT recalculate them.)
RSI 14         : {rsi} ({rsi_label})
MACD Line      : {technicals.get("macd", "N/A")}
MACD Signal    : {technicals.get("macd_signal", "N/A")}
MACD Histogram : {technicals.get("macd_hist", "N/A")}
SMA 20         : ₹{technicals.get("sma_20", "N/A")}
SMA 50         : ₹{technicals.get("sma_50", "N/A")}
SMA 200        : ₹{technicals.get("sma_200", "N/A")}
Bollinger Upper: ₹{technicals.get("bollinger_upper", "N/A")}
Bollinger Lower: ₹{technicals.get("bollinger_lower", "N/A")}
ATR 14         : ₹{technicals.get("atr", "N/A")}
Volume Surge   : {technicals.get("vol_surge", "N/A")}x 20-day avg
1M Return      : {technicals.get("return_1m", "N/A")}%
3M Return      : {technicals.get("return_3m", "N/A")}%

=== SENTIMENT DATA ===
Overall Sentiment : {sentiment.get("overall_sentiment", "N/A")}
Sentiment Score   : {sentiment.get("sentiment_score", "N/A")} (0=bearish, 1=bullish)
News Count        : {sentiment.get("news_count", "N/A")}
Analyst Rating    : {sentiment.get("analyst_rating", "N/A")}

=== YOUR TASK ===
1. Analyze the technical trend structure using the provided indicators only.
2. Identify supporting and conflicting signals across momentum, trend, and volume.
3. Derive entry zone, target 1, target 2, and stop-loss from the provided price and ATR only.
4. Enforce minimum Risk-Reward >= 1:2.0. If not achievable, signal HOLD.
5. Assign ensemble sub-scores for 4 model categories: Technical Momentum, Trend Following, Volume/Sentiment, and Risk/Valuation.
6. Identify 3-5 key risks specific to this setup.

Return ONLY a valid JSON object matching this exact schema (no markdown, no text outside the braces):
{{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": <float 0-100>,
  "risk_score": <float 1-10>,
  "entry_price": <float | null>,
  "exit_price": <float | null>,
  "stop_loss": <float | null>,
  "profit_probability": <float 0-100>,
  "explanation": "<concise AI-interpretation of the setup, max 3 sentences>",
  "factors": ["<catalyst 1>", "<catalyst 2>", "<catalyst 3>", "<catalyst 4>"],
  "pe_ratio": <float>,
  "rsi": <float from provided data only>,
  "macd": <float from provided data only>,
  "prediction_models": {{
    "XGBoost": {{"score": <float -1.0 to 1.0>, "signal": "BUY" | "SELL" | "HOLD"}},
    "LightGBM": {{"score": <float -1.0 to 1.0>, "signal": "BUY" | "SELL" | "HOLD"}},
    "Neural Net": {{"score": <float -1.0 to 1.0>, "signal": "BUY" | "SELL" | "HOLD"}},
    "Prophet": {{"score": <float -1.0 to 1.0>, "signal": "BUY" | "SELL" | "HOLD"}}
  }}
}}
"""
    return prompt


# ---------------------------------------------------------------------------
# Response validator
# ---------------------------------------------------------------------------

def validate_response(data: dict, symbol: str, price: float) -> dict:
    """
    Validate the parsed JSON response from Nemotron.
    Raises ValueError with a clear message on any critical violation.
    """
    # Signal
    if data.get("signal") not in ("BUY", "SELL", "HOLD"):
        raise ValueError(f"Invalid signal: {data.get('signal')}")

    # Confidence
    conf = data.get("confidence")
    if conf is None or not (0 <= float(conf) <= 100):
        raise ValueError(f"Confidence out of range: {conf}")

    # Risk score
    risk = data.get("risk_score")
    if risk is None or not (0 <= float(risk) <= 10):
        raise ValueError(f"Risk score out of range: {risk}")

    # Numeric prices — only validate when present (may be null for HOLD)
    for field in ("entry_price", "exit_price", "stop_loss"):
        val = data.get(field)
        if val is not None:
            try:
                float(val)
            except (TypeError, ValueError):
                raise ValueError(f"Non-numeric {field}: {val}")

    # Risk-reward consistency check (when all three levels present)
    entry = data.get("entry_price")
    target = data.get("exit_price")
    sl = data.get("stop_loss")
    signal = data.get("signal")

    if entry and target and sl and price:
        try:
            risk_pts = abs(float(entry) - float(sl))
            reward_pts = abs(float(target) - float(entry))
            if risk_pts > 0:
                rr = reward_pts / risk_pts
                if rr < 1.0 and signal == "BUY":
                    logger.warning(
                        "[NVIDIA] Risk-reward %.2f < 1:1 for BUY signal on %s — overriding to HOLD",
                        rr, symbol
                    )
                    data["signal"] = "HOLD"
                    data["explanation"] = (
                        data.get("explanation", "") +
                        " [AI override: Risk-reward below minimum threshold.]"
                    )
        except Exception:
            pass  # Non-fatal; log but continue

    # Anchor RSI/MACD to provided values (prevent fabrication)
    # These will be overwritten from actual technicals in predict()

    return data


# ---------------------------------------------------------------------------
# NVIDIA client class
# ---------------------------------------------------------------------------

class NvidiaClient:
    """
    OpenAI-compatible client for NVIDIA Nemotron 3 Super 120B.
    Handles connection, prompt dispatch, response parsing, and validation.
    """

    def __init__(self, api_key: str, base_url: str, model: str):
        self._api_key = api_key
        self._base_url = base_url
        self._model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
            )
        return self._client

    def analyze(
        self,
        symbol: str,
        stock: dict,
        technicals: dict,
        sentiment: dict,
    ) -> Optional[Dict]:
        """
        Call Nemotron with the structured quant evidence and return a validated dict.
        Returns None if the call fails, so the caller can trigger the fallback.
        """
        user_prompt = build_analysis_prompt(symbol, stock, technicals, sentiment)
        t0 = time.monotonic()

        try:
            client = self._get_client()
            logger.info("[NVIDIA] Sending analysis request for %s using model %s", symbol, self._model)

            completion = client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,       # Low temp for deterministic structured output
                top_p=0.7,
                max_tokens=1024,
            )

            latency_ms = int((time.monotonic() - t0) * 1000)
            raw_text = completion.choices[0].message.content.strip()
            logger.info("[NVIDIA] Response received in %d ms for %s", latency_ms, symbol)

            # Strip markdown fences if model adds them despite instructions
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
            raw_text = raw_text.strip()

            parsed = json.loads(raw_text)
            price = stock.get("price", 0)
            validated = validate_response(parsed, symbol, price)

            # Anchor indicator values to Python-computed facts (never LLM-invented)
            validated["rsi"] = technicals.get("rsi", parsed.get("rsi", 50.0))
            validated["macd"] = technicals.get("macd", parsed.get("macd", 0.0))
            validated["pe_ratio"] = stock.get("pe_ratio", parsed.get("pe_ratio", 25.0))

            logger.info(
                "[NVIDIA] ✓ Validated analysis for %s — Signal: %s | Confidence: %.1f%%",
                symbol, validated["signal"], validated["confidence"]
            )
            return validated

        except json.JSONDecodeError as e:
            latency_ms = int((time.monotonic() - t0) * 1000)
            logger.error(
                "[NVIDIA] JSON parse failure for %s after %d ms: %s",
                symbol, latency_ms, e
            )
            return None

        except ValueError as e:
            logger.error("[NVIDIA] Validation failure for %s: %s", symbol, e)
            return None

        except Exception as e:
            latency_ms = int((time.monotonic() - t0) * 1000)
            # Never log the API key; log only the exception type and message
            err_type = type(e).__name__
            logger.error(
                "[NVIDIA] API error for %s after %d ms [%s]: %s",
                symbol, latency_ms, err_type, str(e)
            )
            return None
