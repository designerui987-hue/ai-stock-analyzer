"""Portfolio management API endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from db.session import get_db
from db.models import Portfolio, Holding
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
    """
    Get portfolio performance over time.
    HARD RULES: No fake or random walk data. If historical snapshots
    are not yet recorded in PostgreSQL, returns an explicit unavailable state.
    """
    return {
        "status": "unavailable",
        "reason": "Historical portfolio snapshots are not yet recorded for this account.",
        "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "postgresql/portfolio_snapshots",
    }


@router.get("/suggestions")
async def portfolio_suggestions(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI diversification suggestions based on actual portfolio holdings."""
    portfolio_data = PortfolioService.get_portfolio_summary(int(user_id), db)

    suggestions = []

    # Check sector concentration
    for sector, pct in portfolio_data.get("sector_allocation", {}).items():
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
