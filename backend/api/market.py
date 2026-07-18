"""Market overview API endpoints."""

from fastapi import APIRouter
from data.demo_stocks import NIFTY50_STOCKS, SECTORS, MARKET_INDICES, DEMO_NEWS
from ai_models.sentiment_analyzer import market_regime_detector

router = APIRouter()


@router.get("/overview")
async def market_overview():
    """Get market overview with indices and summary."""
    gainers = sorted(
        NIFTY50_STOCKS.items(), key=lambda x: x[1]["change_pct"], reverse=True
    )[:5]
    losers = sorted(NIFTY50_STOCKS.items(), key=lambda x: x[1]["change_pct"])[:5]

    regime = market_regime_detector.detect_regime()

    return {
        "indices": MARKET_INDICES,
        "market_regime": regime,
        "advance_decline": {"advances": 32, "declines": 18, "unchanged": 0},
        "market_breadth": "positive",
        "fii_activity": {"buy": 4523.45, "sell": 3876.12, "net": 647.33},
        "dii_activity": {"buy": 3254.67, "sell": 2987.34, "net": 267.33},
    }


@router.get("/gainers")
async def top_gainers():
    """Get top gaining stocks."""
    sorted_stocks = sorted(
        NIFTY50_STOCKS.items(), key=lambda x: x[1]["change_pct"], reverse=True
    )[:10]
    return [
        {
            "symbol": sym,
            "name": data["name"],
            "price": data["price"],
            "change": data["change"],
            "change_pct": data["change_pct"],
            "volume": data["volume"],
            "sector": data["sector"],
        }
        for sym, data in sorted_stocks
    ]


@router.get("/losers")
async def top_losers():
    """Get top losing stocks."""
    sorted_stocks = sorted(
        NIFTY50_STOCKS.items(), key=lambda x: x[1]["change_pct"]
    )[:10]
    return [
        {
            "symbol": sym,
            "name": data["name"],
            "price": data["price"],
            "change": data["change"],
            "change_pct": data["change_pct"],
            "volume": data["volume"],
            "sector": data["sector"],
        }
        for sym, data in sorted_stocks
    ]


@router.get("/sectors")
async def sector_performance():
    """Get sector-wise performance."""
    return SECTORS


@router.get("/heatmap")
async def market_heatmap():
    """Get heatmap data grouped by sector."""
    heatmap = {}
    for symbol, data in NIFTY50_STOCKS.items():
        sector = data["sector"]
        if sector not in heatmap:
            heatmap[sector] = []
        heatmap[sector].append({
            "symbol": symbol,
            "name": data["name"],
            "price": data["price"],
            "change_pct": data["change_pct"],
            "market_cap": data["market_cap"],
        })
    return heatmap


@router.get("/news")
async def market_news():
    """Get latest market news with sentiment."""
    return DEMO_NEWS
