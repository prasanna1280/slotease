#!/usr/bin/env bash
# SlotEase - PostgreSQL backup (gzipped plain SQL) with 14-day retention.
#   ./deploy/backup.sh                     # writes ./backups/slotease-YYYYmmdd-HHMMSS.sql.gz
# Cron (daily 02:30, as the deploy user):
#   30 2 * * * /home/deploy/slotease/deploy/backup.sh >> /home/deploy/slotease/backups/backup.log 2>&1
# Env overrides: BACKUP_DIR (default <repo>/backups), RETENTION_DAYS (default 14),
#                COMPOSE_FILE (default docker-compose.prod.yml)
# Restore:
#   gunzip -c backups/slotease-XXXX.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

stamp="$(date +%Y%m%d-%H%M%S)"
target="${BACKUP_DIR}/slotease-${stamp}.sql.gz"
tmp="${target}.partial"
trap 'rm -f "${tmp}"' EXIT

echo "[$(date -Is)] Backing up database to ${target}"
# Credentials come from the db container's own environment; nothing is read from .env here.
docker compose -f "${COMPOSE_FILE}" exec -T db \
    sh -c 'pg_dump --no-owner --no-privileges --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    | gzip -9 > "${tmp}"

# Sanity check: a valid dump is never this small.
if [ "$(wc -c < "${tmp}")" -lt 200 ]; then
    echo "[$(date -Is)] ERROR: backup file is suspiciously small, keeping previous backups." >&2
    exit 1
fi
mv "${tmp}" "${target}"
chmod 600 "${target}"
echo "[$(date -Is)] Done ($(du -h "${target}" | cut -f1))."

echo "[$(date -Is)] Deleting backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'slotease-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete
