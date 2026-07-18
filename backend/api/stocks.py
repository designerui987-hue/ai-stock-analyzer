"""Stock analysis API endpoints."""

import random
from fastapi import APIRouter, HTTPException
from data.demo_stocks import NIFTY50_STOCKS, generate_chart_data, DEMO_NEWS
from ai_models.prediction_engine import prediction_engine
from ai_models.sentiment_analyzer import sentiment_analyzer, risk_analyzer

router = APIRouter()


def generate_technical_indicators(stock: dict) -> dict:
    """Generate realistic technical indicators for a stock."""
    price = stock["price"]
    return {
        "rsi": round(random.uniform(30, 70), 2),
        "macd": round(random.uniform(-10, 10), 4),
        "macd_signal": round(random.uniform(-8, 8), 4),
        "sma_20": round(price * random.uniform(0.97, 1.03), 2),
        "sma_50": round(price * random.uniform(0.94, 1.06), 2),
        "sma_200": round(price * random.uniform(0.88, 1.12), 2),
        "ema_12": round(price * random.uniform(0.98, 1.02), 2),
        "ema_26": round(price * random.uniform(0.96, 1.04), 2),
        "bollinger_upper": round(price * 1.05, 2),
        "bollinger_lower": round(price * 0.95, 2),
        "atr": round(price * random.uniform(0.01, 0.04), 2),
        "adx": round(random.uniform(15, 50), 2),
    }


@router.get("/search")
async def search_stocks(q: str = ""):
    """Search stocks by symbol or name."""
    if not q:
        return list(NIFTY50_STOCKS.keys())

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
async def get_stock_analysis(symbol: str):
    """Get full AI analysis for a stock."""
    symbol = symbol.upper()
    stock = NIFTY50_STOCKS.get(symbol)
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")

    # Generate analysis
    ai_analysis = prediction_engine.predict(symbol)
    technical = generate_technical_indicators(stock)
    sentiment = sentiment_analyzer.analyze_stock_sentiment(symbol)
    risk = risk_analyzer.analyze_risk(symbol, stock)
    news = sentiment_analyzer.get_stock_news(symbol)

    return {
        "quote": {
            "symbol": symbol,
            **stock,
        },
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
async def get_ai_picks(symbol: str = ""):
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
