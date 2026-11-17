from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from config import settings

# Use SQLite by default for local development.
# Switch to PostgreSQL by setting DATABASE_URL in .env

database_url = make_url(settings.database_url)
if database_url.drivername == "postgresql":
    database_url = database_url.set(drivername="postgresql+psycopg2")

is_sqlite = database_url.get_backend_name() == "sqlite"
engine = create_engine(
    database_url,
    connect_args={"check_same_thread": False} if is_sqlite else {},
    poolclass=StaticPool if is_sqlite else None,
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create database tables."""
    from db.models import Base

    Base.metadata.create_all(bind=engine)
