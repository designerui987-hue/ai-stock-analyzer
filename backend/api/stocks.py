"""Stock analysis API endpoints."""

import logging
from fastapi import APIRouter, HTTPException
from data.demo_stocks import NIFTY50_STOCKS, generate_chart_data, DEMO_NEWS
from ai_models.prediction_engine import prediction_engine
from ai_models.sentiment_analyzer import sentiment_analyzer, risk_analyzer

router = APIRouter()
logger = logging.getLogger("api.stocks")


@router.get("/search")
async def search_stocks(q: str = ""):
    """Search stocks by symbol or name."""
    if not q:
        return [
            {"symbol": sym, "name": data["name"], "sector": data["sector"], "price": data["price"], "change_pct": data["change_pct"]}
            for sym, data in NIFTY50_STOCKS.items()
        ]

    q_upper = q.upper()
    results = []
    for symbol, data in NIFTY50_STOCKS.items():
        if q_upper in symbol or q.lower() in data["name"].lower():
            results.append({
                "symbol": symbol,
                "name": data["name"],
                "sector": data["sector"],
                "price": data["price"],
                "change_pct": data["change_pct"],
            })

    if not results and len(q_upper) >= 2:
        results.append({
            "symbol": q_upper,
            "name": f"{q_upper} (Live Equity)",
            "sector": "NSE Equity",
            "price": 0,
            "change_pct": 0,
        })
    return results


@router.get("/list")
async def list_stocks():
    """Get all available stocks."""
    return [
        {
            "symbol": sym,
            "name": data["name"],
            "sector": data["sector"],
            "price": data["price"],
            "change": data["change"],
            "change_pct": data["change_pct"],
            "market_cap": data["market_cap"],
            "volume": data["volume"],
        }
        for sym, data in NIFTY50_STOCKS.items()
    ]


@router.get("/{symbol}")
def get_stock_analysis(symbol: str):
    """Get full AI analysis for any stock symbol."""
    symbol = symbol.upper()
    demo_stock = NIFTY50_STOCKS.get(symbol)

    # ── Step 1: Fetch live price + real quant-engine technicals ──────────────
    live_data = prediction_engine.fetch_live_data(symbol)

    if live_data and live_data.get("price"):
        base = demo_stock or {
            "symbol": symbol,
            "name": live_data.get("name", symbol),
            "sector": live_data.get("sector", "NSE Equity"),
            "industry": live_data.get("sector", "Equity"),
            "market_cap": "Live Market",
            "week52_high": live_data.get("week52_high", live_data["price"]),
            "week52_low": live_data.get("week52_low", live_data["price"]),
            "pe_ratio": live_data.get("pe_ratio", 20.0),
        }
        stock = {
            **base,
            "price": live_data["price"],
            "change": round(live_data["price"] * (live_data.get("change_pct", 0) / 100), 2),
            "change_pct": live_data.get("change_pct", 0),
            "volume": live_data.get("volume", base.get("volume", 0)),
            "avg_volume": live_data.get("avg_volume", 0),
            "week52_high": live_data.get("week52_high", base.get("week52_high", live_data["price"])),
            "week52_low": live_data.get("week52_low", base.get("week52_low", live_data["price"])),
            "pe_ratio": live_data.get("pe_ratio", base.get("pe_ratio", 20.0)),
        }
        # Always use the real Python quant-engine technicals; never random numbers
        technical = live_data.get("technicals") or prediction_engine._fallback_technicals(stock["price"])
        logger.info("[stocks] Live data fetched for %s @ ₹%.2f", symbol, stock["price"])

    elif demo_stock:
        stock = demo_stock
        # No live data — use deterministic fallback technicals from quant engine
        technical = prediction_engine._fallback_technicals(stock["price"])
        logger.info("[stocks] Using demo fixture for %s (yfinance unavailable)", symbol)

    else:
        raise HTTPException(
            status_code=404,
            detail=f"Market data for '{symbol}' could not be fetched. Verify the NSE/BSE symbol.",
        )

    # ── Step 2: Run AI analysis (NVIDIA Nemotron → deterministic fallback) ──
    ai_analysis = prediction_engine.predict(symbol, live_data or stock)

    # ── Step 3: Sentiment & risk ──────────────────────────────────────────────
    sentiment = sentiment_analyzer.analyze_stock_sentiment(symbol)
    risk = risk_analyzer.analyze_risk(symbol, stock)
    news = sentiment_analyzer.get_stock_news(symbol)

    return {
        "quote": {"symbol": symbol, **stock},
        "technical": technical,
        "ai_analysis": ai_analysis,
        "sentiment": sentiment,
        "risk": risk,
        "news": news,
    }


@router.get("/{symbol}/chart")
async def get_chart_data(symbol: str, period: str = "1Y"):
    """Get OHLCV chart data."""
    symbol = symbol.upper()
    if symbol not in NIFTY50_STOCKS:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")

    days_map = {"1M": 30, "3M": 90, "6M": 180, "1Y": 365, "5Y": 1825}
    days = days_map.get(period, 365)

    return generate_chart_data(symbol, days)


@router.get("/{symbol}/ai-picks")
def get_ai_picks(symbol: str = ""):
    """Get AI stock picks."""
    picks = []
    for sym in list(NIFTY50_STOCKS.keys())[:8]:
        pred = prediction_engine.predict(sym)
        stock = NIFTY50_STOCKS[sym]
        picks.append({
            "symbol": sym,
            "name": stock["name"],
            "price": stock["price"],
            "change_pct": stock["change_pct"],
            "signal": pred["signal"],
            "confidence": pred["confidence"],
            "risk_score": pred["risk_score"],
            "sector": stock["sector"],
        })

    # Sort by confidence
    picks.sort(key=lambda x: x["confidence"], reverse=True)
    return picks
