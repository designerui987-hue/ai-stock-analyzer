import pytest
from db.session import SessionLocal, init_db

# Initialize database schema before running tests
init_db()

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
