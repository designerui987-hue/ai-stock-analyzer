"""
Fundamental Analysis API Router
-------------------------------
Provides real audited financial health, valuation percentiles, and growth CAGRs.
"""

from fastapi import APIRouter, HTTPException
from services.fundamental_service import fundamental_service

router = APIRouter()


@router.get("/{symbol}")
def get_fundamentals(symbol: str):
    """
    Get comprehensive institutional fundamental analysis for an equity symbol.
    Provides Financial Health, Valuation Ratios, Growth Trends, and Data Provenance.
    """
    try:
        data = fundamental_service.get_stock_fundamentals(symbol)
        return data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to calculate fundamental analysis for {symbol}: {str(e)}"
        )
