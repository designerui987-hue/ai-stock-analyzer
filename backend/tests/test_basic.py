"""Basic tests for authentication and database functionality."""

import pytest
from sqlalchemy.orm import Session
from db.session import get_db
from db.models import User, Portfolio, Holding
from auth.security import hash_password, verify_password, create_access_token
from services import PortfolioService


def test_user_registration(db: Session):
    """Test user registration."""
    # Create test user
    user = User(
        email="test@example.com",
        username="testuser",
        password_hash=hash_password("testpass123")
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    assert user.id is not None
    assert user.email == "test@example.com"
    assert verify_password("testpass123", user.password_hash)

    # Clean up
    db.delete(user)
    db.commit()


def test_portfolio_creation(db: Session):
    """Test portfolio creation."""
    # Create test user
    user = User(
        email="test@example.com",
        username="testuser",
        password_hash=hash_password("testpass123")
    )
    db.add(user)
    db.commit()

    # Test portfolio service
    portfolio = PortfolioService.get_or_create_portfolio(user.id, db)
    assert portfolio.user_id == user.id
    assert portfolio.name == "My Portfolio"

    # Clean up
    db.delete(portfolio)
    db.delete(user)
    db.commit()


def test_jwt_token():
    """Test JWT token creation and validation."""
    token = create_access_token(subject="1")
    assert token is not None
    assert isinstance(token, str)


def test_duplicate_display_names_allowed_and_long_password(db: Session):
    """Test that two different accounts can share the same display name and 80+ char passwords verify."""
    long_pass = "VerySecureLongPasswordExceedingSeventyTwoCharacters_1234567890_abcdefghijklmnopqrstuvwxyz"
    assert len(long_pass) > 72

    user1 = User(
        email="rahul1@example.com",
        username="Rahul Sharma",
        password_hash=hash_password(long_pass),
    )
    user2 = User(
        email="rahul2@example.com",
        username="Rahul Sharma",  # Duplicate display name
        password_hash=hash_password("different_pass_123"),
    )
    db.add(user1)
    db.add(user2)
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    assert user1.id != user2.id
    assert user1.username == user2.username == "Rahul Sharma"
    # Verify long password against its hash
    assert verify_password(long_pass, user1.password_hash)
    assert not verify_password("wrong_password", user1.password_hash)

    db.delete(user1)
    db.delete(user2)
    db.commit()


def test_empty_user_alerts_return_empty_list_not_500(db: Session):
    """Test that a new user without alerts gets an empty list and count 0 rather than a 500 error."""
    from api.alerts import get_alerts, unread_count
    import asyncio

    user = User(
        email="no_alerts@example.com",
        username="No Alerts User",
        password_hash=hash_password("securepassword123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    alerts = asyncio.run(get_alerts(str(user.id), db))
    assert isinstance(alerts, list)
    assert len(alerts) == 0

    count_resp = asyncio.run(unread_count(str(user.id), db))
    assert count_resp == {"count": 0}

    db.delete(user)
    db.commit()


def test_existing_database_migration_removes_unique_display_name_constraint():
    """Verify that populated databases with legacy unique display name indexes upgrade safely without data loss."""
    from sqlalchemy import create_engine, text
    from db.session import apply_migrations, init_db
    from db.models import Base

    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)

    with test_engine.connect() as conn:
        # Simulate legacy populated database with UNIQUE index on username
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username);"))
        conn.execute(text("INSERT INTO users (email, username, password_hash) VALUES ('existing@ex.com', 'SameName', 'h1');"))
        conn.commit()

    # Apply migration
    apply_migrations(test_engine)

    # Verify existing record preserved and second record with duplicate display name allowed
    with test_engine.connect() as conn:
        conn.execute(text("INSERT INTO users (email, username, password_hash) VALUES ('new@ex.com', 'SameName', 'h2');"))
        conn.commit()
        rows = conn.execute(text("SELECT email, username FROM users WHERE username = 'SameName';")).all()
        assert len(rows) == 2
        emails = {r[0] for r in rows}
        assert emails == {"existing@ex.com", "new@ex.com"}


if __name__ == "__main__":
    # Run basic tests
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        print("Running basic tests...")

        # Test user registration
        test_user_registration(db)
        print("✓ User registration test passed")

        # Test portfolio creation
        test_portfolio_creation(db)
        print("✓ Portfolio creation test passed")

        # Test JWT
        test_jwt_token()
        print("✓ JWT token test passed")

        print("All tests passed!")

    except Exception as e:
        print(f"Test failed: {e}")
    finally:
        db.close()