"""Portfolio service for business logic."""

from sqlalchemy.orm import Session
from typing import List, Optional
from db.models import Portfolio, Holding, User
from data.demo_stocks import NIFTY50_STOCKS


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
    def calculate_portfolio_metrics(holdings: List[Holding], user_id: int, db: Session) -> dict:
        """Calculate portfolio metrics from database holdings."""
        holdings_data = []
        total_invested = 0
        total_current = 0
        total_day_change = 0
        sector_map = {}

        for holding in holdings:
            stock = NIFTY50_STOCKS.get(holding.symbol, {})
            name = stock.get("name", holding.symbol)
            sector = stock.get("sector", "Unknown")

            # Use current_price from holding if available, otherwise from demo data
            current_price = holding.current_price or stock.get("price", holding.avg_price)
            invested = holding.qty * holding.avg_price
            current = holding.qty * current_price
            pnl = current - invested
            pnl_pct = (pnl / invested) * 100 if invested else 0
            day_change = holding.qty * stock.get("change", 0)

            total_invested += invested
            total_current += current
            total_day_change += day_change

            sector_map[sector] = sector_map.get(sector, 0) + current

            holdings_data.append({
                "symbol": holding.symbol,
                "name": name,
                "qty": holding.qty,
                "avg_price": holding.avg_price,
                "current_price": current_price,
                "invested": round(invested, 2),
                "current_value": round(current, 2),
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 2),
                "day_change": round(day_change, 2),
                "sector": sector,
            })

        total_pnl = total_current - total_invested
        total_pnl_pct = (total_pnl / total_invested) * 100 if total_invested else 0

        # Sector allocation as percentages
        sector_allocation = {
            s: round(v / total_current * 100, 1) for s, v in sector_map.items()
        } if total_current > 0 else {}

        # Sort holdings by pnl_pct
        sorted_holdings = sorted(holdings_data, key=lambda x: x["pnl_pct"], reverse=True)

        return {
            "total_invested": round(total_invested, 2),
            "current_value": round(total_current, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "day_pnl": round(total_day_change, 2),
            "day_pnl_pct": round(total_day_change / total_current * 100 if total_current else 0, 2),
            "holdings_count": len(holdings_data),
            "holdings": sorted_holdings,
            "sector_allocation": sector_allocation,
            "top_performer": sorted_holdings[0]["symbol"] if sorted_holdings else "",
            "worst_performer": sorted_holdings[-1]["symbol"] if sorted_holdings else "",
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