#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_HEALTH_URL="${QDRANT_URL%/}/collections"

if curl --silent --fail "$QDRANT_HEALTH_URL" >/dev/null; then
  echo "[qdrant] Reusing existing Qdrant at ${QDRANT_URL}."
  exit 0
fi

echo "[qdrant] Starting Qdrant via docker compose..."
docker compose up -d qdrant >/dev/null

for _ in $(seq 1 30); do
  if curl --silent --fail "$QDRANT_HEALTH_URL" >/dev/null; then
    echo "[qdrant] Qdrant is ready at ${QDRANT_URL}."
    exit 0
  fi
  sleep 1
done

echo "[qdrant] Qdrant did not become ready at ${QDRANT_URL} within 30s." >&2
exit 1
