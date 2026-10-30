#!/usr/bin/env bash
# SlotEase - restart containers that Docker reports as "unhealthy".
# `restart: unless-stopped` only covers crashes; a hung process stays up but fails its healthcheck,
# and plain Docker Compose never restarts it. Run this from cron every minute:
#   * * * * * /home/deploy/slotease/deploy/watchdog.sh >> /home/deploy/slotease/backups/watchdog.log 2>&1
# Env overrides: WATCHDOG_SERVICES (default "backend frontend redis"; db is left out on purpose, a
#                failing Postgres needs a human), COMPOSE_FILE (default docker-compose.prod.yml)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
WATCHDOG_SERVICES="${WATCHDOG_SERVICES:-backend frontend redis}"

# Skip this run if the previous one (or a restart it started) is still going.
exec 9>"${REPO_DIR}/.watchdog.lock"
flock -n 9 || exit 0

for service in ${WATCHDOG_SERVICES}; do
    id="$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}" 2>/dev/null || true)"
    [ -n "${id}" ] || continue
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${id}" 2>/dev/null || true)"
    if [ "${status}" = "unhealthy" ]; then
        echo "[$(date -Is)] ${service} is unhealthy, restarting"
        # Last healthcheck output, so the log says why.
        docker inspect --format '{{range .State.Health.Log}}{{.Output}}{{end}}' "${id}" 2>/dev/null | tail -n 3 || true
        docker compose -f "${COMPOSE_FILE}" restart "${service}"
        echo "[$(date -Is)] ${service} restarted"
    fi
done
