"""Stock service for business logic."""

from typing import Dict, List, Optional
from data.demo_stocks import NIFTY50_STOCKS
from ai_models.prediction_engine import prediction_engine


class StockService:
    """Service class for stock operations."""

    @staticmethod
    def get_stock_info(symbol: str) -> Optional[Dict]:
        """Get stock information."""
        return NIFTY50_STOCKS.get(symbol.upper())

    @staticmethod
    def search_stocks(query: str, limit: int = 10) -> List[Dict]:
        """Search stocks by name or symbol."""
        query = query.lower()
        results = []

        for symbol, data in NIFTY50_STOCKS.items():
            if (query in symbol.lower() or
                query in data["name"].lower() or
                query in data.get("sector", "").lower()):
                results.append({
                    "symbol": symbol,
                    "name": data["name"],
                    "sector": data.get("sector", "Unknown"),
                    "price": data.get("price", 0),
                    "change": data.get("change", 0),
                    "change_pct": data.get("change_pct", 0),
                })

                if len(results) >= limit:
                    break

        return results

    @staticmethod
    def get_stock_prediction(symbol: str) -> Dict:
        """Get AI prediction for stock."""
        return prediction_engine.predict(symbol)

    @staticmethod
    def get_market_overview() -> Dict:
        """Get market overview statistics."""
        total_stocks = len(NIFTY50_STOCKS)
        gainers = []
        losers = []

        for symbol, data in NIFTY50_STOCKS.items():
            change_pct = data.get("change_pct", 0)
            if change_pct > 0:
                gainers.append((symbol, change_pct))
            elif change_pct < 0:
                losers.append((symbol, change_pct))

        # Sort and get top 5
        gainers = sorted(gainers, key=lambda x: x[1], reverse=True)[:5]
        losers = sorted(losers, key=lambda x: x[1])[:5]

        return {
            "total_stocks": total_stocks,
            "gainers": [{"symbol": s, "change_pct": pct} for s, pct in gainers],
            "losers": [{"symbol": s, "change_pct": pct} for s, pct in losers],
            "market_status": "open",  # In production, check actual market hours
        }

    @staticmethod
    def get_sector_performance() -> Dict:
        """Get performance by sector."""
        sector_data = {}

        for symbol, data in NIFTY50_STOCKS.items():
            sector = data.get("sector", "Unknown")
            if sector not in sector_data:
                sector_data[sector] = {"total": 0, "count": 0, "change_sum": 0}

            sector_data[sector]["total"] += data.get("price", 0)
            sector_data[sector]["count"] += 1
            sector_data[sector]["change_sum"] += data.get("change", 0)

        # Calculate averages
        sectors = {}
        for sector, data in sector_data.items():
            avg_change = data["change_sum"] / data["count"] if data["count"] > 0 else 0
            sectors[sector] = {
                "avg_change": round(avg_change, 2),
                "stock_count": data["count"],
            }

        return sectors