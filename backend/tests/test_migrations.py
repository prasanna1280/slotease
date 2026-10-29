"""Alembic migration round-trip on SQLite and parity with the model metadata."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect

from app.models import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic(db_url: str, *args: str) -> None:
    result = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": db_url},
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr


def test_upgrade_and_downgrade_sqlite(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'migrate.db').as_posix()}"
    _alembic(url, "upgrade", "head")
    engine = create_engine(url)
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        assert set(Base.metadata.tables) <= tables
        for name, table in Base.metadata.tables.items():
            assert {c["name"] for c in insp.get_columns(name)} == {c.name for c in table.columns}, name
        index_names = {i["name"] for i in insp.get_indexes("appointments")}
        assert "uq_appointments_business_start_active" in index_names
    finally:
        engine.dispose()

    _alembic(url, "downgrade", "base")
    engine = create_engine(url)
    try:
        assert set(inspect(engine).get_table_names()) & set(Base.metadata.tables) == set()
    finally:
        engine.dispose()
