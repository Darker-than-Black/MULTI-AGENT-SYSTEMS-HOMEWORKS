#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:0] Running CLI bootstrap check..."
OUTPUT="$(npm run dev -- "Architecture smoke test" 2>&1)"

if ! echo "$OUTPUT" | grep -q "Mock response for:"; then
  echo "Smoke validation failed: unexpected CLI output."
  echo "$OUTPUT"
  exit 1
fi

echo "[smoke:block:0] Passed."
