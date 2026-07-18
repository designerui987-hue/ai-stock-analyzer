"""Portfolio management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.session import get_db
from auth.security import get_current_user
from services import PortfolioService

router = APIRouter()


@router.get("/")
async def get_portfolio(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's portfolio summary and holdings."""
    return PortfolioService.get_portfolio_summary(int(user_id), db)


@router.get("/performance")
async def portfolio_performance(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get portfolio performance over time."""
    # For now, return mock data - in production this would be calculated from historical holdings
    import random
    perf = []
    base = 1000000
    for i in range(365):
        base *= 1 + random.gauss(0.0004, 0.012)
        perf.append({"day": i, "value": round(base, 2)})
    return perf


@router.get("/suggestions")
async def portfolio_suggestions(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI diversification suggestions."""
    # Get user's portfolio
    portfolio_data = PortfolioService.get_portfolio_summary(int(user_id), db)

    suggestions = []

    # Check sector concentration
    for sector, pct in portfolio_data["sector_allocation"].items():
        if pct > 35:
            suggestions.append({
                "type": "diversification",
                "severity": "warning",
                "title": f"High {sector} concentration ({pct}%)",
                "suggestion": f"Consider reducing {sector} exposure below 30% for better diversification.",
            })

    suggestions.extend([
        {
            "type": "rebalancing",
            "severity": "info",
            "title": "Quarterly rebalancing recommended",
            "suggestion": "Consider rebalancing your portfolio to maintain target allocations.",
        },
        {
            "type": "opportunity",
            "severity": "success",
            "title": "Healthcare sector underweight",
            "suggestion": "Consider adding pharmaceutical stocks like Sun Pharma or Dr. Reddy's for defensive positioning.",
        },
    ])

    return suggestions


@router.get("/performance")
async def portfolio_performance(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get portfolio performance over time."""
    # For now, return mock data - in production this would be calculated from historical holdings
    import random
    perf = []
    base = 1000000
    for i in range(365):
        base *= 1 + random.gauss(0.0004, 0.012)
        perf.append({"day": i, "value": round(base, 2)})
    return perf


@router.get("/suggestions")
async def portfolio_suggestions(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI diversification suggestions."""
    # Get user's portfolio
    portfolio = db.query(Portfolio).filter(Portfolio.user_id == int(user_id)).first()
    if not portfolio:
        return []

    holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio.id).all()
    portfolio_data = calculate_portfolio_metrics(holdings, int(user_id), db)

    suggestions = []

    # Check sector concentration
    for sector, pct in portfolio_data["sector_allocation"].items():
        if pct > 35:
            suggestions.append({
                "type": "diversification",
                "severity": "warning",
                "title": f"High {sector} concentration ({pct}%)",
                "suggestion": f"Consider reducing {sector} exposure below 30% for better diversification.",
            })

    suggestions.extend([
        {
            "type": "rebalancing",
            "severity": "info",
            "title": "Quarterly rebalancing recommended",
            "suggestion": "Consider rebalancing your portfolio to maintain target allocations.",
        },
        {
            "type": "opportunity",
            "severity": "success",
            "title": "Healthcare sector underweight",
            "suggestion": "Consider adding pharmaceutical stocks like Sun Pharma or Dr. Reddy's for defensive positioning.",
        },
    ])

    return suggestions
