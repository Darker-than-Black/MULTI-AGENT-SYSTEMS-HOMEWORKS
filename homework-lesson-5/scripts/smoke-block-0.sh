#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:0] Running CLI bootstrap check..."
OUTPUT="$(printf 'quit\n' | npm run dev 2>&1)"

if ! echo "$OUTPUT" | grep -q "Research Agent CLI"; then
  echo "Smoke validation failed: CLI header not found."
  echo "$OUTPUT"
  exit 1
fi

if ! echo "$OUTPUT" | grep -q "Type your question, or 'exit'/'quit' to stop."; then
  echo "Smoke validation failed: CLI usage hint not found."
  echo "$OUTPUT"
  exit 1
fi

echo "[smoke:block:0] Passed."
