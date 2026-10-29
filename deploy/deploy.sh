#!/usr/bin/env bash
# SlotEase - idempotent production deploy. Run ON THE VPS from anywhere inside the repo:
#   ./deploy/deploy.sh
# Env overrides:
#   USE_CADDY=1        also start the bundled Caddy (fresh server with nothing on 80/443);
#                      default assumes an existing Traefik that routes via the container labels
#   SKIP_PULL=1        deploy the current checkout without `git pull`
#   HEALTH_TIMEOUT=180 seconds to wait for the stack to become healthy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE=(docker compose -f "${COMPOSE_FILE}")
USE_CADDY="${USE_CADDY:-0}"
[ "${USE_CADDY}" = "1" ] && COMPOSE+=(--profile caddy)
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker is not installed (see deploy/README.md)."
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is missing (see deploy/README.md)."
[ -f .env ] || fail ".env not found in ${REPO_DIR}. Run: cp deploy/production.env.example .env && nano .env"
if grep -Eq '^(DOMAIN|POSTGRES_PASSWORD|SECRET_KEY)=(.*CHANGE_ME.*|change-me.*|)$' .env; then
    fail ".env still has placeholder/empty DOMAIN, POSTGRES_PASSWORD or SECRET_KEY. Edit it first."
fi

if [ "${SKIP_PULL:-0}" != "1" ]; then
    log "Pulling latest code"
    git pull --ff-only
fi
log "Deploying commit $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

log "Validating compose configuration"
"${COMPOSE[@]}" config -q

log "Building images and (re)starting containers"
"${COMPOSE[@]}" up -d --build --remove-orphans

container_health() {
    local id
    id="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null || true)"
    [ -n "${id}" ] || { echo "missing"; return; }
    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${id}" 2>/dev/null || echo "missing"
}

log "Waiting up to ${HEALTH_TIMEOUT}s for services to become healthy"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
    db="$(container_health db)"; api="$(container_health backend)"; web="$(container_health frontend)"
    proxy="external"; [ "${USE_CADDY}" = "1" ] && proxy="$(container_health caddy)"
    printf '   db=%s backend=%s frontend=%s proxy=%s\n' "${db}" "${api}" "${web}" "${proxy}"
    if [ "${db}" = healthy ] && [ "${api}" = healthy ] && [ "${web}" = healthy ] \
        && { [ "${proxy}" = external ] || [ "${proxy}" = running ]; }; then
        break
    fi
    if [ "$(date +%s)" -ge "${deadline}" ]; then
        "${COMPOSE[@]}" ps
        "${COMPOSE[@]}" logs --tail=80 backend frontend || true
        fail "Stack did not become healthy within ${HEALTH_TIMEOUT}s (logs above)."
    fi
    sleep 5
done

log "Checking /health and /api/v1/health through nginx"
"${COMPOSE[@]}" exec -T frontend wget -qO- http://127.0.0.1/health && echo
"${COMPOSE[@]}" exec -T frontend wget -qO- http://127.0.0.1/api/v1/health && echo

log "Removing dangling images"
docker image prune -f >/dev/null

log "Status"
"${COMPOSE[@]}" ps
DOMAIN_VALUE="$(grep -E '^DOMAIN=' .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"' ')"
printf '\nDeployed. App: https://%s   Health: https://%s/api/v1/health\n' "${DOMAIN_VALUE}" "${DOMAIN_VALUE}"
