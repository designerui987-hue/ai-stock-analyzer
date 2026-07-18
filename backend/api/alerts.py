"""Smart alerts API endpoints."""

import random
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.session import get_db
from db.models import Alert, User
from auth.security import get_current_user
from models.analysis import AlertType, AlertPriority
from data.demo_stocks import NIFTY50_STOCKS
from ai_models.prediction_engine import prediction_engine

router = APIRouter()


def generate_demo_alerts():
    """Generate demo alerts based on AI analysis for new users."""
    alerts = []

    # Generate alerts from stock analysis
    alert_templates = [
        {
            "type": AlertType.BUY_SIGNAL,
            "priority": AlertPriority.HIGH,
            "symbols": ["TATAMOTORS", "BHARTIARTL", "TATASTEEL"],
            "title_template": "🟢 BUY Signal: {name}",
            "msg_template": "AI detected strong buying opportunity for {name} at ₹{price}. Confidence: {conf}%. Target: ₹{target}.",
        },
        {
            "type": AlertType.SELL_SIGNAL,
            "priority": AlertPriority.HIGH,
            "symbols": ["MARUTI", "TECHM"],
            "title_template": "🔴 SELL Signal: {name}",
            "msg_template": "AI recommends booking profits on {name} at ₹{price}. Risk score elevated to {risk}/10.",
        },
        {
            "type": AlertType.BREAKOUT,
            "priority": AlertPriority.MEDIUM,
            "symbols": ["RELIANCE", "ICICIBANK"],
            "title_template": "⚡ Breakout Alert: {name}",
            "msg_template": "{name} breaking above resistance at ₹{price}. Volume surge detected ({vol}% above average).",
        },
        {
            "type": AlertType.RISK_WARNING,
            "priority": AlertPriority.MEDIUM,
            "symbols": ["ADANIENT", "SUNPHARMA"],
            "title_template": "⚠️ Risk Warning: {name}",
            "msg_template": "Increased volatility detected in {name}. Risk score: {risk}/10. Consider tightening stop-loss.",
        },
    ]

    times = ["2 min ago", "15 min ago", "32 min ago", "1 hour ago", "2 hours ago", "3 hours ago"]

    for template in alert_templates:
        for i, sym in enumerate(template["symbols"]):
            stock = NIFTY50_STOCKS.get(sym, {})
            pred = prediction_engine.predict(sym)

            alert = {
                "id": str(uuid.uuid4())[:8],
                "type": template["type"].value,
                "priority": template["priority"].value,
                "symbol": sym,
                "title": template["title_template"].format(name=stock.get("name", sym)),
                "message": template["msg_template"].format(
                    name=stock.get("name", sym),
                    price=stock.get("price", 0),
                    conf=pred.get("confidence", 70),
                    target=pred.get("exit_price", 0),
                    risk=pred.get("risk_score", 5),
                    vol=random.randint(120, 250),
                ),
                "time": times[min(i, len(times) - 1)],
                "read": i > 0,
                "is_active": True,
            }
            alerts.append(alert)

    return alerts


@router.get("/")
async def get_alerts(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all active alerts for the user."""
    # Get alerts from database
    db_alerts = db.query(Alert).filter(
        Alert.user_id == int(user_id),
        Alert.is_active == True
    ).all()

    if not db_alerts:
        # Return demo alerts for new users
        return generate_demo_alerts()

    # Convert database alerts to API format
    alerts = []
    for alert in db_alerts:
        stock = NIFTY50_STOCKS.get(alert.symbol, {})
        alerts.append({
            "id": str(alert.id),
            "type": alert.alert_type.value,
            "priority": "high" if alert.alert_type in [AlertType.BUY_SIGNAL, AlertType.SELL_SIGNAL] else "medium",
            "symbol": alert.symbol,
            "title": f"Alert for {stock.get('name', alert.symbol)}",
            "message": f"Alert triggered for {alert.symbol}",
            "time": "Recently",
            "read": not alert.is_active,
            "is_active": alert.is_active,
        })

    return alerts


@router.get("/unread-count")
async def unread_count(
    user_id: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread alerts."""
    # For now, return demo count - in production this would track read status
    alerts = generate_demo_alerts()
    count = sum(1 for a in alerts if not a["read"])
    return {"count": count}


@router.get("/insights")
async def get_insights(
    user_id: str = Depends(get_current_user)
):
    """Get AI-generated market insights."""
    insights = [
        {
            "id": "ins-1",
            "title": "IT Sector Momentum Building",
            "summary": "AI models detect increasing institutional buying in IT stocks. TCS, Infosys, and HCL Tech show bullish technical patterns with improving sentiment scores.",
            "category": "sector_rotation",
            "impact": "positive",
            "symbols": ["TCS", "INFY", "HCLTECH"],
            "confidence": 78.5,
            "time": "1 hour ago",
        },
        {
            "id": "ins-2",
            "title": "Banking Sector: Rate Cut Tailwind",
            "summary": "Anticipated RBI rate cut could benefit banking stocks. HDFC Bank and ICICI Bank positioned to gain from improved Net Interest Margins.",
            "category": "macro_event",
            "impact": "positive",
            "symbols": ["HDFCBANK", "ICICIBANK", "SBIN"],
            "confidence": 72.3,
            "time": "2 hours ago",
        },
        {
            "id": "ins-3",
            "title": "Auto Sector: Festive Season Boost",
            "summary": "October auto sales data shows 12% YoY growth. Tata Motors and Maruti Suzuki expected to report strong quarterly results.",
            "category": "fundamental",
            "impact": "positive",
            "symbols": ["TATAMOTORS", "MARUTI"],
            "confidence": 81.2,
            "time": "3 hours ago",
        },
        {
            "id": "ins-4",
            "title": "Volatility Warning: Global Uncertainty",
            "summary": "AI market regime detector flags increasing global uncertainty. VIX rising suggests potential correction. Consider defensive positioning.",
            "category": "risk_alert",
            "impact": "negative",
            "symbols": [],
            "confidence": 65.8,
            "time": "4 hours ago",
        },
        {
            "id": "ins-5",
            "title": "Reliance: Green Energy Play",
            "summary": "₹75,000 crore investment in green energy signals long-term growth catalyst. AI models upgrade profit probability for 12-month horizon.",
            "category": "fundamental",
            "impact": "positive",
            "symbols": ["RELIANCE"],
            "confidence": 74.1,
            "time": "5 hours ago",
        },
        {
            "id": "ins-6",
            "title": "Pharma Under Pressure",
            "summary": "FDA warnings and pricing pressures weigh on pharma stocks. AI sentiment analysis shows declining social media sentiment for the sector.",
            "category": "sector_rotation",
            "impact": "negative",
            "symbols": ["SUNPHARMA"],
            "confidence": 69.4,
            "time": "6 hours ago",
        },
    ]
    return insights
