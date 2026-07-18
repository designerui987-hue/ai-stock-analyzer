from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class AlertType(str, Enum):
    BUY_OPPORTUNITY = "buy_opportunity"
    SELL_SIGNAL = "sell_signal"
    BREAKOUT = "breakout"
    RISK_WARNING = "risk_warning"
    PRICE_TARGET = "price_target"


class AlertPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Alert(BaseModel):
    id: str
    type: AlertType
    priority: AlertPriority
    symbol: str
    title: str
    message: str
    time: str
    read: bool = False


class AIInsight(BaseModel):
    id: str
    title: str
    summary: str
    category: str
    impact: str
    symbols: List[str]
    confidence: float
    time: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    context: Optional[List[ChatMessage]] = None


class ChatResponse(BaseModel):
    response: str
    suggestions: List[str]
    referenced_stocks: List[str]
