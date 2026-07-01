#!/usr/bin/env bash
# Crucible deploy-recreate — runs on the server in $DEPLOY_PATH (e.g. /opt/crucible).
# Usage: bash deploy-recreate.sh <IMAGE_TAG> <GHCR_REPO>
#   IMAGE_TAG  commit SHA (from CI) or "latest"
#   GHCR_REPO  e.g. devhamburg/bench   -> pulls ghcr.io/devhamburg/bench-{api,web}
#
# The Crucible stack has its own Postgres/Redis and uses create_all-on-startup
# (no migrate step). It joins hypexio's Caddy network so bench.hypexio.com routes
# to it — that Caddy block lives in hypexio's repo Caddyfile (added once), so this
# script never touches hypexio.
set -euo pipefail

IMAGE_TAG="${1:?IMAGE_TAG required}"
GHCR_REPO="${2:?GHCR_REPO required}"
COMPOSE="docker compose --env-file .env -f docker-compose.prod.yml"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# Persist tag + repo for future manual `compose up` / rollback.
grep -q '^IMAGE_TAG=' .env 2>/dev/null && sed -i "s#^IMAGE_TAG=.*#IMAGE_TAG=${IMAGE_TAG}#" .env || echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
grep -q '^GHCR_REPO=' .env 2>/dev/null && sed -i "s#^GHCR_REPO=.*#GHCR_REPO=${GHCR_REPO}#" .env || echo "GHCR_REPO=${GHCR_REPO}" >> .env

export IMAGE_TAG GHCR_REPO

log "pull ${GHCR_REPO} @ ${IMAGE_TAG}"
$COMPOSE pull

log "recreate app containers"
$COMPOSE up -d --remove-orphans

log "wait for health"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    log "api healthy"; break
  fi
  # api is only reachable via the container network on prod; fall back to compose ps
  state=$($COMPOSE ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep crucible-api || true)
  log "attempt $i — $state"
  sleep 6
done

log "current containers:"
$COMPOSE ps
log "deploy done (tag ${IMAGE_TAG})"
