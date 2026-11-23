"""Portfolio service for business logic."""

from sqlalchemy.orm import Session
from typing import List, Optional
from config import settings
from db.models import Portfolio, Holding, User
from data.demo_stocks import NIFTY50_STOCKS
from services.market_data_service import market_data_service


class PortfolioService:
    """Service class for portfolio operations."""

    @staticmethod
    def get_or_create_portfolio(user_id: int, db: Session) -> Portfolio:
        """Get user's portfolio or create default one."""
        portfolio = db.query(Portfolio).filter(Portfolio.user_id == user_id).first()
        if not portfolio:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValueError("User not found")

            portfolio = Portfolio(user_id=user_id, name="My Portfolio")
            db.add(portfolio)
            db.commit()
            db.refresh(portfolio)

        return portfolio

    @staticmethod
    def calculate_portfolio_metrics(
        holdings: List[Holding],
        user_id: int,
        db: Session,
        market_data_svc: Optional[Any] = None,
    ) -> dict:
        """Calculate portfolio metrics from database holdings with real quote verification."""
        svc = market_data_svc or market_data_service
        holdings_data = []
        total_invested = 0.0
        total_current = 0.0
        total_day_change = 0.0
        sector_map = {}
        all_quotes_available = True

        for holding in holdings:
            symbol = holding.symbol.upper()
            invested = float(holding.qty * holding.avg_price)
            total_invested += invested

            # Fetch authoritative quote from market_data_service
            quote = svc.get_quote(
                symbol,
                skip_cache=False,
                user_id=str(user_id),
                db=db
            )

            stock_demo = NIFTY50_STOCKS.get(symbol, {})
            name = stock_demo.get("name", symbol)
            sector = stock_demo.get("sector", "Equity")

            quote_price = quote.get("price")
            quote_status = quote.get("status")
            quote_freshness = quote.get("freshness")
            quote_valid = (
                isinstance(quote_price, (int, float)) and
                quote_price > 0 and
                quote_status != "unavailable" and
                quote_freshness != "UNAVAILABLE"
            )

            if quote_valid:
                current_price = float(quote_price)
                current = float(holding.qty * current_price)
                pnl = current - invested
                pnl_pct = (pnl / invested) * 100.0 if invested > 0 else 0.0
                day_change = float(holding.qty * float(quote.get("change") or 0.0))
                as_of = quote.get("as_of")
                source = quote.get("source", "market_data")
                freshness = quote.get("freshness", "DELAYED")

                total_current += current
                total_day_change += day_change
                sector_map[sector] = sector_map.get(sector, 0.0) + current
            elif settings.demo_mode and stock_demo.get("price"):
                # Demo mode fallback ONLY when explicitly enabled
                current_price = float(stock_demo["price"])
                current = float(holding.qty * current_price)
                pnl = current - invested
                pnl_pct = (pnl / invested) * 100.0 if invested > 0 else 0.0
                day_change = float(holding.qty * float(stock_demo.get("change") or 0.0))
                as_of = None
                source = "demo_fixture"
                freshness = "DEMO"

                total_current += current
                total_day_change += day_change
                sector_map[sector] = sector_map.get(sector, 0.0) + current
            else:
                # Production normal mode: explicit unavailable state without fake fixtures
                all_quotes_available = False
                current_price = None
                current = None
                pnl = None
                pnl_pct = None
                day_change = None
                as_of = None
                source = "unavailable"
                freshness = "UNAVAILABLE"

            holdings_data.append({
                "symbol": symbol,
                "name": name,
                "qty": holding.qty,
                "avg_price": round(float(holding.avg_price), 2),
                "current_price": round(current_price, 2) if current_price is not None else None,
                "invested": round(invested, 2),
                "current_value": round(current, 2) if current is not None else None,
                "pnl": round(pnl, 2) if pnl is not None else None,
                "pnl_pct": round(pnl_pct, 2) if pnl_pct is not None else None,
                "day_change": round(day_change, 2) if day_change is not None else None,
                "sector": sector,
                "as_of": as_of,
                "source": source,
                "freshness": freshness,
            })

        priced_count = sum(1 for h in holdings_data if h["current_value"] is not None)
        total_count = len(holdings_data)

        if not holdings:
            return {
                "status": "empty",
                "total_invested": 0.0,
                "current_value": 0.0,
                "total_pnl": 0.0,
                "total_pnl_pct": 0.0,
                "day_pnl": 0.0,
                "day_pnl_pct": 0.0,
                "holdings_count": 0,
                "priced_count": 0,
                "total_count": 0,
                "coverage_text": "0 of 0 holdings priced",
                "valuation_message": "Empty portfolio",
                "holdings": [],
                "sector_allocation": {},
                "top_performer": "",
                "worst_performer": "",
            }

        if all_quotes_available:
            total_pnl = total_current - total_invested
            total_pnl_pct = (total_pnl / total_invested) * 100.0 if total_invested > 0 else 0.0
            day_pnl_pct = (total_day_change / total_current) * 100.0 if total_current > 0 else 0.0
            status = "available"
            valuation_message = f"Based on latest quotes · {priced_count} of {total_count} holdings priced"
            account_current_value = round(total_current, 2)
        elif priced_count > 0:
            total_pnl = None
            total_pnl_pct = None
            day_pnl_pct = None
            status = "partial"
            valuation_message = f"Partial valuation · {priced_count} of {total_count} holdings priced"
            account_current_value = None
        else:
            total_pnl = None
            total_pnl_pct = None
            day_pnl_pct = None
            total_current = None
            status = "unavailable"
            valuation_message = f"Valuation unavailable · 0 of {total_count} holdings priced."
            account_current_value = None

        # Sector allocation as percentages (only by current value if fully available, else empty)
        sector_allocation = {
            s: round(v / total_current * 100, 1) for s, v in sector_map.items()
        } if (all_quotes_available and total_current and total_current > 0) else {}

        # Sort holdings by pnl_pct (placing None at end)
        sorted_holdings = sorted(
            holdings_data,
            key=lambda x: (x["pnl_pct"] is not None, x["pnl_pct"] or -999999),
            reverse=True
        )

        return {
            "status": status,
            "total_invested": round(total_invested, 2),
            "current_value": account_current_value,
            "priced_subtotal": round(total_current, 2) if (total_current is not None and total_current > 0) else None,
            "total_pnl": round(total_pnl, 2) if total_pnl is not None else None,
            "total_pnl_pct": round(total_pnl_pct, 2) if total_pnl_pct is not None else None,
            "day_pnl": round(total_day_change, 2) if all_quotes_available else None,
            "day_pnl_pct": round(day_pnl_pct, 2) if day_pnl_pct is not None else None,
            "holdings_count": len(holdings_data),
            "priced_count": priced_count,
            "total_count": total_count,
            "coverage_text": f"{priced_count} of {total_count} holdings priced",
            "valuation_message": valuation_message,
            "holdings": sorted_holdings,
            "sector_allocation": sector_allocation,
            "top_performer": sorted_holdings[0]["symbol"] if (sorted_holdings and sorted_holdings[0]["pnl_pct"] is not None) else "",
            "worst_performer": sorted_holdings[-1]["symbol"] if (sorted_holdings and sorted_holdings[-1]["pnl_pct"] is not None) else "",
        }

    @staticmethod
    def get_portfolio_summary(user_id: int, db: Session) -> dict:
        """Get complete portfolio summary for user."""
        portfolio = PortfolioService.get_or_create_portfolio(user_id, db)
        holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio.id).all()
        return PortfolioService.calculate_portfolio_metrics(holdings, user_id, db)

    @staticmethod
    def add_holding(user_id: int, symbol: str, qty: int, avg_price: float, db: Session) -> Holding:
        """Add a new holding to user's portfolio."""
        portfolio = PortfolioService.get_or_create_portfolio(user_id, db)

        # Check if holding already exists
        existing = db.query(Holding).filter(
            Holding.portfolio_id == portfolio.id,
            Holding.symbol == symbol
        ).first()

        if existing:
            # Update existing holding (average the price)
            total_qty = existing.qty + qty
            total_cost = (existing.qty * existing.avg_price) + (qty * avg_price)
            new_avg_price = total_cost / total_qty

            existing.qty = total_qty
            existing.avg_price = new_avg_price
            db.commit()
            db.refresh(existing)
            return existing
        else:
            # Create new holding
            holding = Holding(
                portfolio_id=portfolio.id,
                symbol=symbol,
                qty=qty,
                avg_price=avg_price
            )
            db.add(holding)
            db.commit()
            db.refresh(holding)
            return holding

    @staticmethod
    def remove_holding(user_id: int, symbol: str, qty: Optional[int], db: Session) -> bool:
        """Remove holding from portfolio. If qty is None, remove all."""
        portfolio = PortfolioService.get_or_create_portfolio(user_id, db)

        holding = db.query(Holding).filter(
            Holding.portfolio_id == portfolio.id,
            Holding.symbol == symbol
        ).first()

        if not holding:
            return False

        if qty is None or qty >= holding.qty:
            # Remove entire holding
            db.delete(holding)
        else:
            # Reduce quantity
            holding.qty -= qty

        db.commit()
        return True