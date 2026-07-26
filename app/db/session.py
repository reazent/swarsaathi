from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Base


def _database_url() -> str:
    url = settings.database_url
    # Prefer psycopg v3 driver when URL omits a dialect driver.
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(_database_url(), connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@event.listens_for(engine, "connect")
def _sqlite_fk(dbapi_connection, connection_record) -> None:
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _ensure_sargam_columns() -> None:
    """Add new Sargam columns on existing DBs (create_all does not alter)."""
    try:
        insp = inspect(engine)
        if "sargam_generations" not in insp.get_table_names():
            return
        existing = {c["name"] for c in insp.get_columns("sargam_generations")}
    except Exception:
        return

    alters: list[str] = []
    if "mode" not in existing:
        alters.append("ALTER TABLE sargam_generations ADD COLUMN mode VARCHAR(32) DEFAULT 'clip'")
    if "lyrics" not in existing:
        alters.append("ALTER TABLE sargam_generations ADD COLUMN lyrics TEXT")
    if not alters:
        return
    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_sargam_columns()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
