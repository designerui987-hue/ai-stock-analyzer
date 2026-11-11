"""Stock analysis and market data API endpoints."""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from data.demo_stocks import NIFTY50_STOCKS, DEMO_NEWS
from ai_models.prediction_engine import prediction_engine
from ai_models.sentiment_analyzer import sentiment_analyzer, risk_analyzer
from services.market_data_service import market_data_service
from services.backtest_service import BacktestEngine
from auth.security import get_stream_user

router = APIRouter()
logger = logging.getLogger("api.stocks")


# ── Search & List ─────────────────────────────────────────────────────────────

@router.get("/search")
async def search_stocks(q: str = ""):
    """Search stocks by symbol or name."""
    if not q:
        return [
            {
                "symbol": sym,
                "name": data["name"],
                "sector": data["sector"],
                "price": data["price"],
                "change_pct": data["change_pct"],
            }
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


# ── Real-Time Price Streaming (SSE) ──────────────────────────────────────────

@router.get("/stream")
async def stream_prices(
    request: Request,
    symbols: str = Query("RELIANCE,TCS,HDFCBANK,INFY,ICICIBANK,BHARTIARTL", description="Comma-separated symbols"),
    current_user: str = Depends(get_stream_user),
):
    """
    Server-Sent Events (SSE) streaming endpoint for watchlist prices.
    Pushes real-time / delayed quotes with freshness badges every 3 seconds.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    logger.debug("[SSE] Client disconnected from price stream")
                    break

                quotes = market_data_service.get_watchlist_quotes(symbol_list)
                payload = {
                    "type": "watchlist_update",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "quotes": quotes,
                }
                yield f"data: {json.dumps(payload)}\n\n"

                # Stream interval: 3 seconds
                await asyncio.sleep(3)

        except asyncio.CancelledError:
            logger.debug("[SSE] Price stream cancelled for user %s", current_user)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Backtesting Engine ────────────────────────────────────────────────────────

@router.get("/backtest")
def run_backtest(
    symbol: str = Query("RELIANCE", description="NSE symbol to backtest"),
    years: int = Query(3, ge=1, le=10, description="Backtesting duration in years"),
    initial_capital: float = Query(100000.0, ge=10000.0, description="Starting capital in INR"),
):
    """
    Backtest production deterministic quantitative rules (v1.0-deterministic-quant)
    on historical daily NSE data vs NIFTY 50 buy & hold.
    Includes Indian brokerage (₹20 cap), STT (0.1%), slippage (0.05%), and walk-forward splits.
    """
    engine = BacktestEngine(symbol=symbol, years=years, initial_capital=initial_capital)
    result = engine.run()
    if result.get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=result)
    return result


# ── Single Stock Quote ────────────────────────────────────────────────────────

@router.get("/quote/{symbol}")
def get_stock_quote(symbol: str, kite_token: Optional[str] = None):
    """Get single stock quote with data freshness badge."""
    quote = market_data_service.get_quote(symbol, kite_token=kite_token)
    if quote.get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=quote)
    return quote


# ── Single Stock Analysis ─────────────────────────────────────────────────────

@router.get("/{symbol}")
def get_stock_analysis(symbol: str, kite_token: Optional[str] = None):
    """Get full AI analysis for any stock symbol with unified market data."""
    symbol = symbol.upper()
    demo_stock = NIFTY50_STOCKS.get(symbol)

    # Step 1: Fetch quote from unified market data service
    quote = market_data_service.get_quote(symbol, kite_token=kite_token)
    is_live = quote.get("status") != "unavailable" and quote.get("price", 0) > 0

    if is_live:
        base = demo_stock or {
            "symbol": symbol,
            "name": quote.get("name", symbol),
            "sector": quote.get("sector", "NSE Equity"),
            "industry": quote.get("sector", "Equity"),
            "market_cap": quote.get("market_cap", "Live Market"),
            "week52_high": quote.get("week52_high", quote["price"]),
            "week52_low": quote.get("week52_low", quote["price"]),
            "pe_ratio": quote.get("pe_ratio", 20.0),
        }
        stock = {
            **base,
            "price": quote["price"],
            "change": quote.get("change", 0.0),
            "change_pct": quote.get("change_pct", 0.0),
            "volume": quote.get("volume", base.get("volume", 0)),
            "week52_high": quote.get("week52_high", base.get("week52_high", quote["price"])),
            "week52_low": quote.get("week52_low", base.get("week52_low", quote["price"])),
            "pe_ratio": quote.get("pe_ratio", base.get("pe_ratio", 20.0)),
            "as_of": quote.get("as_of"),
            "source": quote.get("source", "yfinance"),
            "freshness": quote.get("freshness", "DELAYED (15m)"),
        }

        # Calculate real quant engine technicals
        live_data = prediction_engine.fetch_live_data(symbol)
        technical = (
            live_data.get("technicals")
            if live_data and live_data.get("technicals")
            else prediction_engine._fallback_technicals(stock["price"])
        )

    elif demo_stock:
        demo_allowed = os.getenv("DEMO_MODE", "false").lower() == "true"
        if demo_allowed:
            stock = {
                **demo_stock,
                "is_demo": True,
                "freshness": "UNAVAILABLE",
                "as_of": datetime.now(timezone.utc).isoformat(),
                "source": "demo_fixture",
            }
            technical = prediction_engine._fallback_technicals(stock["price"])
            logger.info("[stocks] Using demo fixture for %s (DEMO_MODE=true)", symbol)
        else:
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "unavailable",
                    "reason": f"Live market data for '{symbol}' is unavailable from exchange. Demo data is disabled (set DEMO_MODE=true to enable demo fixtures).",
                    "as_of": datetime.now(timezone.utc).isoformat(),
                    "source": "yfinance",
                    "freshness": "UNAVAILABLE",
                },
            )
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Market data for '{symbol}' could not be fetched. Verify the NSE/BSE symbol.",
        )

    # Step 2: Run deterministic AI analysis
    ai_analysis = prediction_engine.predict(symbol, stock)

    # Step 3: Sentiment & risk
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


# ── Single Stock Chart ────────────────────────────────────────────────────────

@router.get("/{symbol}/chart")
async def get_chart_data(symbol: str, period: str = "1Y"):
    """Get real OHLCV chart data from unified market data service."""
    symbol = symbol.upper()
    data = market_data_service.get_ohlcv(symbol, period)
    if data and isinstance(data[0], dict) and data[0].get("status") == "unavailable":
        raise HTTPException(status_code=503, detail=data[0])
    return data


# ── AI Picks ──────────────────────────────────────────────────────────────────

@router.get("/{symbol}/ai-picks")
def get_ai_picks(symbol: str = ""):
    """Get AI stock picks using live prices from market data service."""
    picks = []
    for sym in list(NIFTY50_STOCKS.keys())[:8]:
        quote = market_data_service.get_quote(sym)
        if quote.get("status") == "unavailable" or quote.get("price", 0) <= 0:
            fallback = NIFTY50_STOCKS.get(sym, {})
            picks.append({
                "symbol": sym,
                "name": fallback.get("name", sym),
                "price": {"status": "unavailable", "reason": "Market data unavailable"},
                "change_pct": {"status": "unavailable"},
                "signal": "HOLD",
                "confidence": 50.0,
                "risk_score": 5.0,
                "sector": fallback.get("sector", "Unknown"),
                "as_of": datetime.now(timezone.utc).isoformat(),
                "source": "yfinance",
                "freshness": "UNAVAILABLE",
            })
            continue

        stock_data = {**NIFTY50_STOCKS.get(sym, {}), **quote}
        pred = prediction_engine.predict(sym, stock_data)
        picks.append({
            "symbol": sym,
            "name": quote.get("name", NIFTY50_STOCKS.get(sym, {}).get("name", sym)),
            "price": quote["price"],
            "change_pct": quote.get("change_pct", 0),
            "signal": pred["signal"],
            "confidence": pred["confidence"],
            "risk_score": pred["risk_score"],
            "sector": quote.get("sector", NIFTY50_STOCKS.get(sym, {}).get("sector", "Unknown")),
            "as_of": quote.get("as_of"),
            "source": quote.get("source", "yfinance"),
            "freshness": quote.get("freshness", "DELAYED (15m)"),
        })

    picks.sort(key=lambda x: x["confidence"] if isinstance(x["confidence"], (int, float)) else 0, reverse=True)
    return picks
