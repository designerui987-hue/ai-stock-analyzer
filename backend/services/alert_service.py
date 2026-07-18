"""Alert service for business logic."""

from sqlalchemy.orm import Session
from typing import List
from db.models import Alert, User
from models.analysis import AlertType


class AlertService:
    """Service class for alert operations."""

    @staticmethod
    def create_alert(user_id: int, symbol: str, alert_type: AlertType,
                    price_target: float = None, db: Session = None) -> Alert:
        """Create a new alert for user."""
        alert = Alert(
            user_id=user_id,
            symbol=symbol,
            alert_type=alert_type,
            price_target=price_target,
            is_active=True
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        return alert

    @staticmethod
    def get_user_alerts(user_id: int, db: Session) -> List[Alert]:
        """Get all active alerts for user."""
        return db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.is_active == True
        ).all()

    @staticmethod
    def deactivate_alert(alert_id: int, user_id: int, db: Session) -> bool:
        """Deactivate an alert."""
        alert = db.query(Alert).filter(
            Alert.id == alert_id,
            Alert.user_id == user_id
        ).first()

        if alert:
            alert.is_active = False
            db.commit()
            return True
        return False

    @staticmethod
    def check_alerts(user_id: int, db: Session) -> List[Alert]:
        """Check and trigger alerts based on current prices."""
        # This would be called periodically to check price conditions
        # For now, return empty list - implementation would check current prices
        # against alert conditions and mark as triggered
        triggered_alerts = []
        return triggered_alerts