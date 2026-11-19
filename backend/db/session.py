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
    1. Removes legacy uniqueness restrictions on display names while preserving lookup indexes.
    2. Ensures research_snapshots table, columns, indexes, and constraints exist.
    """
    eng = bind_engine or engine
    from sqlalchemy import text
    backend_name = eng.dialect.name
    with eng.connect() as conn:
        trans = conn.begin()
        try:
            if backend_name == "postgresql":
                # 1. Users table migration
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

                # 2. Research Snapshots table & column forward migration
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS research_snapshots (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        symbol VARCHAR NOT NULL,
                        exchange VARCHAR NOT NULL DEFAULT 'NSE',
                        as_of TIMESTAMP WITH TIME ZONE NOT NULL,
                        price DOUBLE PRECISION NOT NULL,
                        open_price DOUBLE PRECISION,
                        high_price DOUBLE PRECISION,
                        low_price DOUBLE PRECISION,
                        volume BIGINT,
                        avg_volume_20d BIGINT,
                        rsi_14 DOUBLE PRECISION,
                        sma_20 DOUBLE PRECISION,
                        sma_50 DOUBLE PRECISION,
                        sma_200 DOUBLE PRECISION,
                        macd DOUBLE PRECISION,
                        macd_signal DOUBLE PRECISION,
                        vol_surge DOUBLE PRECISION,
                        signal VARCHAR,
                        rule_version VARCHAR NOT NULL DEFAULT 'v1.0-deterministic-quant',
                        timeframe VARCHAR NOT NULL DEFAULT '1D',
                        lookback_bars INTEGER DEFAULT 250,
                        adjustment_basis VARCHAR NOT NULL DEFAULT 'split_and_dividend_adjusted',
                        source VARCHAR NOT NULL DEFAULT 'yfinance/NSE',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN IF NOT EXISTS timeframe VARCHAR NOT NULL DEFAULT '1D';"))
                conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN IF NOT EXISTS lookback_bars INTEGER DEFAULT 250;"))
                conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN IF NOT EXISTS adjustment_basis VARCHAR NOT NULL DEFAULT 'split_and_dividend_adjusted';"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_user_id ON research_snapshots (user_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_symbol ON research_snapshots (symbol);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_as_of ON research_snapshots (as_of);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_created_at ON research_snapshots (created_at);"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_user_sym_as_of ON research_snapshots (COALESCE(user_id, -1), symbol, exchange, as_of);"))

                # 3. Watchlist items unified table & legacy WatchlistItem migration
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS watchlist_items (
                        id VARCHAR PRIMARY KEY,
                        user_id VARCHAR NOT NULL,
                        symbol VARCHAR NOT NULL,
                        exchange VARCHAR NOT NULL DEFAULT 'NSE',
                        notes TEXT,
                        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_watchlist_items_user_id ON watchlist_items (user_id);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_watchlist_items_symbol ON watchlist_items (symbol);"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_user_symbol ON watchlist_items (user_id, symbol);"))
                conn.execute(text("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.tables WHERE table_name = 'watchlist_items'
                        ) AND NOT EXISTS (
                            SELECT 1 FROM information_schema.columns WHERE table_name = 'watchlist_items' AND column_name = 'exchange'
                        ) THEN
                            ALTER TABLE watchlist_items ADD COLUMN exchange VARCHAR NOT NULL DEFAULT 'NSE';
                        END IF;

                        IF EXISTS (
                            SELECT 1 FROM information_schema.tables WHERE table_name = 'WatchlistItem'
                        ) THEN
                            INSERT INTO watchlist_items (id, user_id, symbol, exchange, notes, added_at)
                            SELECT id, user_id, symbol, COALESCE(exchange, 'NSE'), notes, added_at
                            FROM "WatchlistItem"
                            ON CONFLICT (user_id, symbol) DO NOTHING;
                        END IF;
                    END
                    $$;
                """))

            elif backend_name == "sqlite":
                # 1. Users table migration
                try:
                    conn.execute(text("DROP INDEX IF EXISTS ix_users_username;"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);"))
                except Exception:
                    pass

                # 2. Research Snapshots table & column forward migration
                try:
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS research_snapshots (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                            symbol VARCHAR NOT NULL,
                            exchange VARCHAR NOT NULL DEFAULT 'NSE',
                            as_of TIMESTAMP NOT NULL,
                            price REAL NOT NULL,
                            open_price REAL,
                            high_price REAL,
                            low_price REAL,
                            volume INTEGER,
                            avg_volume_20d INTEGER,
                            rsi_14 REAL,
                            sma_20 REAL,
                            sma_50 REAL,
                            sma_200 REAL,
                            macd REAL,
                            macd_signal REAL,
                            vol_surge REAL,
                            signal VARCHAR,
                            rule_version VARCHAR NOT NULL DEFAULT 'v1.0-deterministic-quant',
                            timeframe VARCHAR NOT NULL DEFAULT '1D',
                            lookback_bars INTEGER DEFAULT 250,
                            adjustment_basis VARCHAR NOT NULL DEFAULT 'split_and_dividend_adjusted',
                            source VARCHAR NOT NULL DEFAULT 'yfinance/NSE',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """))
                    # Check for existing table missing new columns
                    cursor = conn.execute(text("PRAGMA table_info(research_snapshots)"))
                    columns = [row[1] for row in cursor.fetchall()]
                    if "timeframe" not in columns:
                        conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN timeframe VARCHAR DEFAULT '1D' NOT NULL;"))
                    if "lookback_bars" not in columns:
                        conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN lookback_bars INTEGER DEFAULT 250;"))
                    if "adjustment_basis" not in columns:
                        conn.execute(text("ALTER TABLE research_snapshots ADD COLUMN adjustment_basis VARCHAR DEFAULT 'split_and_dividend_adjusted' NOT NULL;"))

                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_user_id ON research_snapshots (user_id);"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_symbol ON research_snapshots (symbol);"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_as_of ON research_snapshots (as_of);"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_snapshots_created_at ON research_snapshots (created_at);"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_user_sym_as_of ON research_snapshots (user_id, symbol, exchange, as_of);"))

                    # 3. Watchlist items unified table & legacy WatchlistItem migration
                    conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS watchlist_items (
                            id VARCHAR PRIMARY KEY,
                            user_id VARCHAR NOT NULL,
                            symbol VARCHAR NOT NULL,
                            exchange VARCHAR NOT NULL DEFAULT 'NSE',
                            notes TEXT,
                            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_watchlist_items_user_id ON watchlist_items (user_id);"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_watchlist_items_symbol ON watchlist_items (symbol);"))
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_user_symbol ON watchlist_items (user_id, symbol);"))

                    cursor = conn.execute(text("PRAGMA table_info(watchlist_items)"))
                    columns = [row[1] for row in cursor.fetchall()]
                    if "exchange" not in columns:
                        conn.execute(text("ALTER TABLE watchlist_items ADD COLUMN exchange VARCHAR DEFAULT 'NSE' NOT NULL;"))

                    cursor = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='WatchlistItem'"))
                    if cursor.fetchone():
                        conn.execute(text("""
                            INSERT OR IGNORE INTO watchlist_items (id, user_id, symbol, exchange, notes, added_at)
                            SELECT id, user_id, symbol, COALESCE(exchange, 'NSE'), notes, added_at
                            FROM WatchlistItem;
                        """))
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
