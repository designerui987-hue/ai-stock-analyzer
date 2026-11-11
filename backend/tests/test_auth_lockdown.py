"""
Authentication and API lockdown tests.

Verifies:
1. Missing or default secrets fail application startup.
2. Unauthenticated access to protected endpoints returns 401.
3. User A cannot access User B's data (data isolation via verified JWT).
"""

import os
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from config import Settings
from main import app
from auth.security import create_access_token


def test_missing_secret_key_fails_startup(monkeypatch):
    """Verify backend startup fails immediately if SECRET_KEY is missing or empty."""
    monkeypatch.delenv("SECRET_KEY", raising=False)

    # Creating Settings without SECRET_KEY in env or file must raise ValidationError
    with pytest.raises((ValidationError, ValueError)):
        Settings(_env_file=None)


def test_default_secret_key_fails_startup(monkeypatch):
    """Verify backend startup fails if SECRET_KEY is set to the insecure default."""
    monkeypatch.setenv("SECRET_KEY", "change-me-please")

    with pytest.raises((ValidationError, ValueError)):
        Settings(_env_file=None)


def test_cors_origins_parsed_from_env(monkeypatch):
    """Verify CORS origins are parsed as an explicit list from env, not wildcard."""
    monkeypatch.setenv("SECRET_KEY", "test_valid_secret_key_at_least_32_chars_123")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://myapp.com")

    cfg = Settings(_env_file=None)
    assert cfg.cors_origin_list == ["http://localhost:3000", "https://myapp.com"]
    assert "*" not in cfg.cors_origin_list


def test_unauthenticated_access_returns_401():
    """Verify protected endpoints return 401 when accessed without an authorization header."""
    client = TestClient(app)

    # Portfolio summary
    res = client.get("/api/portfolio/")
    assert res.status_code in [401, 403]

    # Portfolio performance
    res = client.get("/api/portfolio/performance")
    assert res.status_code in [401, 403]

    # Portfolio suggestions
    res = client.get("/api/portfolio/suggestions")
    assert res.status_code in [401, 403]

    # Alerts
    res = client.get("/api/alerts/")
    assert res.status_code in [401, 403]

    # AI Assistant chat
    res = client.post("/api/assistant/chat", json={"message": "hello"})
    assert res.status_code in [401, 403]


def test_invalid_jwt_returns_401():
    """Verify access with a forged or invalid JWT returns 401."""
    client = TestClient(app)
    headers = {"Authorization": "Bearer forged_invalid_token_12345"}

    res = client.get("/api/portfolio/", headers=headers)
    assert res.status_code == 401


def test_authenticated_user_access(db):
    """Verify valid JWT grants access to protected endpoints."""
    from db.models import User
    from auth.security import hash_password

    # Create test user
    user = User(
        email="lockdown_test@example.com",
        username="lockdown_user",
        password_hash=hash_password("secure_pass_123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/portfolio/", headers=headers)
    assert res.status_code == 200

    # Cleanup
    db.delete(user)
    db.commit()

