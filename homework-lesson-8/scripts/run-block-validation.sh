#!/usr/bin/env bash

set -euo pipefail

BLOCK="${1:-}"

if [[ -z "$BLOCK" ]]; then
  echo "Usage: $0 <block-id>"
  echo "Example: $0 0"
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[block:${BLOCK}] Running shared quality gates..."
npm run check
npm run invariant:check

echo "[block:${BLOCK}] Running block-specific validation..."
case "$BLOCK" in
  0) bash scripts/smoke-block-0.sh ;;
  1) bash scripts/smoke-block-1.sh ;;
  2) bash scripts/smoke-block-2.sh ;;
  3) bash scripts/smoke-block-3.sh ;;
  4) bash scripts/smoke-block-4.sh ;;
  5) bash scripts/smoke-block-5.sh ;;
  6) bash scripts/smoke-block-6.sh ;;
  *)
    echo "Unknown block: ${BLOCK}. Expected 0..6."
    exit 2
    ;;
esac

echo "[block:${BLOCK}] Validation passed."
