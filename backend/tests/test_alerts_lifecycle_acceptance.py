import pytest
from fastapi.testclient import TestClient
from main import app
from db.session import SessionLocal
from db.models import User, Alert
from models.analysis import AlertType
from auth.security import create_access_token, hash_password
from datetime import datetime, timezone


@pytest.fixture
def test_users_and_client():
    db = SessionLocal()
    # Create two isolated users
    user_a = db.query(User).filter(User.email == "alert_user_a@test.com").first()
    if not user_a:
        user_a = User(
            email="alert_user_a@test.com",
            username="User A",
            password_hash=hash_password("Password123"),
        )
        db.add(user_a)
        db.commit()
        db.refresh(user_a)

    user_b = db.query(User).filter(User.email == "alert_user_b@test.com").first()
    if not user_b:
        user_b = User(
            email="alert_user_b@test.com",
            username="User B",
            password_hash=hash_password("Password123"),
        )
        db.add(user_b)
        db.commit()
        db.refresh(user_b)

    # Clean any prior alerts for these test users
    db.query(Alert).filter(Alert.user_id.in_([user_a.id, user_b.id])).delete(synchronize_session=False)
    db.commit()

    token_a = create_access_token(subject=str(user_a.id))
    token_b = create_access_token(subject=str(user_b.id))

    client = TestClient(app)
    try:
        yield client, token_a, token_b, user_a.id, user_b.id
    finally:
        db.query(Alert).filter(Alert.user_id.in_([user_a.id, user_b.id])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_alert_lifecycle_and_account_isolation(test_users_and_client):
    client, token_a, token_b, user_a_id, user_b_id = test_users_and_client

    # 1. Create price alert for User A (TCS at ₹2500)
    res_a = client.post(
        "/api/alerts/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"symbol": "TCS", "price_target": 2500.0, "alert_type": "price_target", "direction": "above"},
    )
    assert res_a.status_code == 201
    alert_data = res_a.json()
    assert alert_data["symbol"] == "TCS"
    assert alert_data["price_target"] == 2500.0
    assert alert_data["status"] == "SAVED"
    alert_id = alert_data["id"]

    # 2. Verify alert survives refresh / query for User A
    get_res_a = client.get("/api/alerts/", headers={"Authorization": f"Bearer {token_a}"})
    assert get_res_a.status_code == 200
    alerts_a = get_res_a.json()
    assert len(alerts_a) == 1
    assert alerts_a[0]["id"] == alert_id
    assert alerts_a[0]["symbol"] == "TCS"
    assert alerts_a[0]["status"] == "SAVED"

    # 3. Account Isolation: Verify User B cannot see User A's alert
    get_res_b = client.get("/api/alerts/", headers={"Authorization": f"Bearer {token_b}"})
    assert get_res_b.status_code == 200
    alerts_b = get_res_b.json()
    assert len(alerts_b) == 0

    # 4. Account Isolation: Verify User B cannot delete User A's alert
    del_res_b = client.delete(f"/api/alerts/{alert_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert del_res_b.status_code == 404

    # 5. Distinguish lifecycle status: SAVED -> TRIGGERED -> DELIVERED
    db = SessionLocal()
    db_alert = db.query(Alert).filter(Alert.id == int(alert_id)).first()
    db_alert.is_triggered = True
    db.commit()

    get_triggered = client.get("/api/alerts/", headers={"Authorization": f"Bearer {token_a}"})
    assert get_triggered.json()[0]["status"] == "TRIGGERED"

    db_alert.triggered_at = datetime.now(timezone.utc)
    db.commit()

    get_delivered = client.get("/api/alerts/", headers={"Authorization": f"Bearer {token_a}"})
    assert get_delivered.json()[0]["status"] == "DELIVERED"
    db.close()

    # 6. Delete alert by User A
    del_res_a = client.delete(f"/api/alerts/{alert_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert del_res_a.status_code == 200
    assert del_res_a.json()["success"] is True

    # 7. Verify alert list is now empty for User A
    final_res = client.get("/api/alerts/", headers={"Authorization": f"Bearer {token_a}"})
    assert len(final_res.json()) == 0


def test_alert_validation_rejects_invalid_inputs(test_users_and_client):
    client, token_a, _, _, _ = test_users_and_client

    # Empty symbol rejected
    res_empty_sym = client.post(
        "/api/alerts/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"symbol": "  ", "price_target": 2500.0},
    )
    assert res_empty_sym.status_code == 422

    # Negative price rejected
    res_neg_price = client.post(
        "/api/alerts/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"symbol": "TCS", "price_target": -100.0},
    )
    assert res_neg_price.status_code == 422

    # Zero price rejected
    res_zero_price = client.post(
        "/api/alerts/",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"symbol": "TCS", "price_target": 0.0},
    )
    assert res_zero_price.status_code == 422
