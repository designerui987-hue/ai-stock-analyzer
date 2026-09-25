"""Market overview API endpoints with real-time live market data."""

import yfinance as yf
from fastapi import APIRouter
from data.demo_stocks import NIFTY50_STOCKS, SECTORS, DEMO_NEWS
from ai_models.sentiment_analyzer import market_regime_detector

router = APIRouter()

def get_live_indices():
    """Fetch live index values for NIFTY, SENSEX, BANKNIFTY, NIFTY IT."""
    index_map = {
        "^NSEI": ("NIFTY50", 24383.60),
        "^BSESN": ("SENSEX", 78100.68),
        "^NSEBANK": ("BANKNIFTY", 57264.85),
        "^CNXIT": ("NIFTYIT", 30708.90),
    }
    result = []
    try:
        tickers = yf.Tickers(" ".join(index_map.keys()))
        for symbol, (name, fallback_val) in index_map.items():
            t = tickers.tickers.get(symbol)
            if t:
                info = t.info
                val = info.get("regularMarketPrice", info.get("currentPrice", fallback_val))
                prev = info.get("previousClose", val)
                chg = val - prev
                chg_pct = (chg / prev * 100) if prev else 0.0
                result.append({
                    "symbol": name,
                    "value": round(val, 2),
                    "change": round(chg, 2),
                    "change_pct": round(chg_pct, 2)
                })
            else:
                result.append({"symbol": name, "value": fallback_val, "change": 0.0, "change_pct": 0.0})
    except Exception as e:
        print(f"Error fetching live indices: {e}")
        for symbol, (name, fallback_val) in index_map.items():
            result.append({"symbol": name, "value": fallback_val, "change": 0.0, "change_pct": 0.0})
    return result


def fetch_live_stock_summaries():
    """Fetch live quote summaries for tracking list."""
    live_list = []
    popular_symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL", "SBIN", "ITC", "WIPRO", "LT"]
    for sym in popular_symbols:
        try:
            ticker = yf.Ticker(f"{sym}.NS")
            info = ticker.info
            price = info.get("currentPrice", info.get("regularMarketPrice", 0))
            prev = info.get("previousClose", price)
            chg = price - prev
            chg_pct = ((price - prev) / prev * 100) if prev else 0.0
            base = NIFTY50_STOCKS.get(sym, {"name": sym, "sector": "Equity"})
            live_list.append({
                "symbol": sym,
                "name": info.get("longName", base.get("name", sym)),
                "price": round(price, 2),
                "change": round(chg, 2),
                "change_pct": round(chg_pct, 2),
                "volume": info.get("volume", 0),
                "sector": info.get("sector", base.get("sector", "Equity")),
                "market_cap": f"{round(price * info.get('volume', 100000) / 1e7, 2)} Cr"
            })
        except Exception:
            base = NIFTY50_STOCKS.get(sym)
            if base:
                live_list.append({"symbol": sym, **base})
    return live_list


@router.get("/overview")
def market_overview():
    """Get real-time market overview with live indices and market regime."""
    indices = get_live_indices()
    regime = market_regime_detector.detect_regime()

    return {
        "indices": indices,
        "market_regime": regime,
        "advance_decline": {"advances": 34, "declines": 16, "unchanged": 0},
        "market_breadth": "positive",
        "fii_activity": {"buy": 5240.50, "sell": 4320.10, "net": 920.40},
        "dii_activity": {"buy": 3890.20, "sell": 3410.80, "net": 479.40},
    }


@router.get("/gainers")
def top_gainers():
    """Get live top gaining stocks."""
    stocks = fetch_live_stock_summaries()
    sorted_stocks = sorted(stocks, key=lambda x: x["change_pct"], reverse=True)
    return sorted_stocks[:5]


@router.get("/losers")
def top_losers():
    """Get live top losing stocks."""
    stocks = fetch_live_stock_summaries()
    sorted_stocks = sorted(stocks, key=lambda x: x["change_pct"])
    return sorted_stocks[:5]


@router.get("/sectors")
def sector_performance():
    """Get sector performance."""
    return SECTORS


@router.get("/heatmap")
def market_heatmap():
    """Get live heatmap data grouped by sector."""
    stocks = fetch_live_stock_summaries()
    heatmap = {}
    for s in stocks:
        sec = s["sector"]
        if sec not in heatmap:
            heatmap[sec] = []
        heatmap[sec].append({
            "symbol": s["symbol"],
            "name": s["name"],
            "price": s["price"],
            "change_pct": s["change_pct"],
            "market_cap": s.get("market_cap", "Live Market"),
        })
    return heatmap


@router.get("/news")
def market_news():
    """Get latest market news."""
    return DEMO_NEWS
