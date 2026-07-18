from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SignalType(str, Enum):
    BUY = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"


class StockQuote(BaseModel):
    symbol: str
    name: str
    sector: str
    industry: str
    price: float
    change: float
    change_pct: float
    market_cap: str
    pe_ratio: float
    week52_high: float
    week52_low: float
    volume: int
    avg_volume: int


class TechnicalIndicators(BaseModel):
    rsi: float
    macd: float
    macd_signal: float
    sma_20: float
    sma_50: float
    sma_200: float
    ema_12: float
    ema_26: float
    bollinger_upper: float
    bollinger_lower: float
    atr: float
    adx: float


class AIAnalysis(BaseModel):
    signal: SignalType
    confidence: float
    risk_score: float
    entry_price: float
    exit_price: float
    stop_loss: float
    profit_probability: float
    explanation: str
    factors: List[str]
    prediction_models: dict


class NewsSentiment(BaseModel):
    title: str
    source: str
    sentiment: str
    score: float
    time: str
    symbol: Optional[str] = None


class StockAnalysis(BaseModel):
    quote: StockQuote
    technical: TechnicalIndicators
    ai_analysis: AIAnalysis
    news: List[NewsSentiment]


class ChartDataPoint(BaseModel):
    date: str
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: int
