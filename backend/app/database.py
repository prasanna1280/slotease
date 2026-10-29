"""Database engine, session factory and the FastAPI ``get_db`` dependency."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _is_sqlite(url: str) -> bool:
    """Return True if the SQLAlchemy URL points at SQLite."""
    return url.startswith("sqlite")


def enable_sqlite_foreign_keys(target_engine: Engine) -> None:
    """Turn on ``PRAGMA foreign_keys`` for every new SQLite connection of ``target_engine``.

    SQLite ignores foreign keys (and ``ON DELETE CASCADE``) unless this pragma is set per connection.
    Test suites that build their own SQLite engine can call this helper too.
    """

    @event.listens_for(target_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


_connect_args: dict[str, Any] = {"check_same_thread": False} if _is_sqlite(settings.DATABASE_URL) else {}

engine: Engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args=_connect_args,
)

if _is_sqlite(settings.DATABASE_URL):
    enable_sqlite_foreign_keys(engine)

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Iterator[Session]:
    """Yield a database session for one request and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
