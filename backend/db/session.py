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


def apply_migrations(bind_engine=None):
    """
    Applies forward schema migrations to ensure existing populated databases
    are compatible with current application requirements without data loss.
    Removes legacy uniqueness restrictions on display names while preserving lookup indexes.
    """
    eng = bind_engine or engine
    from sqlalchemy import text
    backend_name = eng.dialect.name
    with eng.connect() as conn:
        trans = conn.begin()
        try:
            if backend_name == "postgresql":
                conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;"))
                conn.execute(text("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM pg_indexes 
                            WHERE tablename = 'users' AND indexname = 'ix_users_username'
                            AND indexdef LIKE '%UNIQUE%'
                        ) THEN
                            DROP INDEX ix_users_username;
                        END IF;
                    END
                    $$;
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);"))
            elif backend_name == "sqlite":
                try:
                    conn.execute(text("DROP INDEX IF EXISTS ix_users_username;"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);"))
                except Exception:
                    pass
            trans.commit()
        except Exception:
            trans.rollback()
            # If table doesn't exist yet, create_all will create it fresh
            pass


def init_db(bind_engine=None):
    """Create database tables and apply forward schema migrations."""
    from db.models import Base
    eng = bind_engine or engine
    Base.metadata.create_all(bind=eng)
    apply_migrations(eng)
