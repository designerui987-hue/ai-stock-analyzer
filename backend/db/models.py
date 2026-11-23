from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Enum, UniqueConstraint
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone
import enum
import uuid

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class AlertType(str, enum.Enum):
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    BUY_SIGNAL = "buy_signal"
    SELL_SIGNAL = "sell_signal"
    BREAKOUT = "breakout"
    RISK_WARNING = "risk_warning"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    portfolios = relationship("Portfolio", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    name = Column(String, nullable=False, default="My Portfolio")
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="portfolios")
    holdings = relationship("Holding", back_populates="portfolio", cascade="all, delete-orphan")


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), index=True)
    symbol = Column(String, index=True, nullable=False)
    qty = Column(Integer, nullable=False)
    avg_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    invested = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    portfolio = relationship("Portfolio", back_populates="holdings")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    symbol = Column(String, index=True, nullable=False)
    alert_type = Column(Enum(AlertType), nullable=False)
    price_target = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    is_triggered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    triggered_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    delivery_acknowledged_at = Column(DateTime, nullable=True)
    delivery_status = Column(String, nullable=True)

    user = relationship("User", back_populates="alerts")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True, nullable=False)
    symbol = Column(String, index=True, nullable=False)
    exchange = Column(String, default="NSE", nullable=False)
    notes = Column(String, nullable=True)
    added_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint('user_id', 'symbol', name='uq_watchlist_user_symbol'),
    )


class ResearchSnapshot(Base):
    __tablename__ = "research_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    symbol = Column(String, index=True, nullable=False)
    exchange = Column(String, default="NSE", nullable=False)
    as_of = Column(DateTime, nullable=False, index=True)
    price = Column(Float, nullable=False)
    open_price = Column(Float, nullable=True)
    high_price = Column(Float, nullable=True)
    low_price = Column(Float, nullable=True)
    volume = Column(Integer, nullable=True)
    avg_volume_20d = Column(Integer, nullable=True)
    rsi_14 = Column(Float, nullable=True)
    sma_20 = Column(Float, nullable=True)
    sma_50 = Column(Float, nullable=True)
    sma_200 = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    macd_signal = Column(Float, nullable=True)
    vol_surge = Column(Float, nullable=True)
    signal = Column(String, nullable=True)
    rule_version = Column(String, default="v1.0-deterministic-quant", nullable=False)
    timeframe = Column(String, default="1D", nullable=False)
    lookback_bars = Column(Integer, default=250, nullable=True)
    adjustment_basis = Column(String, default="split_and_dividend_adjusted", nullable=False)
    source = Column(String, default="yfinance/NSE", nullable=False)
    created_at = Column(DateTime, default=utcnow, index=True)

    __table_args__ = (
        UniqueConstraint('user_id', 'symbol', 'exchange', 'as_of', name='uq_snapshot_user_sym_as_of'),
    )

