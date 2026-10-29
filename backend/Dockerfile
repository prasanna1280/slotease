# syntax=docker/dockerfile:1
# SlotEase API image: FastAPI + gunicorn with uvicorn-worker, migrations on start.

# ---------- Builder: build wheels for every dependency ----------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build
# gcc only for the rare dependency without a prebuilt wheel (psycopg[binary] bundles libpq).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

# ---------- Runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    WEB_CONCURRENCY=2

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels /wheels/* && rm -rf /wheels

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home app

# Application code (app/, alembic/, alembic.ini, pyproject.toml); see .dockerignore.
# Owned by root and read-only to the app user, so a compromised process cannot modify the code.
COPY --chown=root:root . .
RUN chmod -R a+rX,go-w /app
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Strip CRLF in case the file was checked out on Windows without .gitattributes.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod 0755 /usr/local/bin/docker-entrypoint.sh

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
