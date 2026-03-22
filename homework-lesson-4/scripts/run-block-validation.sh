#!/usr/bin/env bash

set -euo pipefail

BLOCK="${1:-}"

if [[ -z "$BLOCK" ]]; then
  echo "Usage: $0 <block-id>"
  echo "Example: $0 0"
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJECT_DIR="${REPO_ROOT}/homework-lesson-4"
cd "$PROJECT_DIR"

echo "[block:${BLOCK}] Running shared quality gates..."
npm run check
npm run invariant:check

echo "[block:${BLOCK}] Running block-specific validation..."
case "$BLOCK" in
  0)
    npm run smoke:block:0
    ;;
  1)
    npm run smoke:block:1
    ;;
  2)
    npm run smoke:block:2
    ;;
  3)
    npm run smoke:block:3
    ;;
  4)
    npm run smoke:block:4
    ;;
  5)
    npm run smoke:block:5
    ;;
  6)
    npm run smoke:block:6
    ;;
  *)
    echo "Unknown block: ${BLOCK}. Expected 0..6."
    exit 2
    ;;
esac

echo "[block:${BLOCK}] Validation passed."
