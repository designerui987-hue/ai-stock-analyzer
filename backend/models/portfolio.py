from pydantic import BaseModel
from typing import List, Optional


class PortfolioHolding(BaseModel):
    symbol: str
    name: str
    qty: int
    avg_price: float
    current_price: float
    invested: float
    current_value: float
    pnl: float
    pnl_pct: float
    sector: str


class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    total_pnl: float
    total_pnl_pct: float
    day_pnl: float
    day_pnl_pct: float
    holdings_count: int
    holdings: List[PortfolioHolding]
    sector_allocation: dict
    top_performer: str
    worst_performer: str
