#!/bin/sh
# SlotEase API entrypoint: wait for the database, run migrations, start gunicorn.
#   - No arguments: start the API server (default).
#   - With arguments: run that command after migrations, e.g.
#       docker compose run --rm backend alembic current
#   - SKIP_MIGRATIONS=1 skips `alembic upgrade head`.
set -eu

echo "[entrypoint] Waiting for the database..."
python - <<'PY'
import os
import sys
import time

from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL", "")
if not url or url.startswith("sqlite"):
    sys.exit(0)

timeout = int(os.environ.get("DB_WAIT_TIMEOUT", "60"))
deadline = time.monotonic() + timeout
engine = create_engine(url, pool_pre_ping=True)
attempt = 0
while True:
    attempt += 1
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        sys.stderr.write(f"[entrypoint] Database is ready (attempt {attempt}).\n")
        break
    except Exception as exc:  # noqa: BLE001 - any connection error means "not ready yet"
        if time.monotonic() >= deadline:
            sys.stderr.write(f"[entrypoint] Database not reachable after {timeout}s: {type(exc).__name__}\n")
            sys.exit(1)
        time.sleep(2)
engine.dispose()
PY

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    echo "[entrypoint] Running database migrations..."
    alembic upgrade head
fi

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

echo "[entrypoint] Starting gunicorn with ${WEB_CONCURRENCY:-2} worker(s)..."
exec gunicorn app.main:app \
    -k uvicorn_worker.UvicornWorker \
    -w "${WEB_CONCURRENCY:-2}" \
    -b 0.0.0.0:8000 \
    --forwarded-allow-ips='*' \
    --no-control-socket \
    --access-logfile - \
    --error-logfile - \
    --log-level "$(echo "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')" \
    --timeout 60 \
    --graceful-timeout 30 \
    --keep-alive 5
