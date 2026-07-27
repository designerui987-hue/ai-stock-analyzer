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