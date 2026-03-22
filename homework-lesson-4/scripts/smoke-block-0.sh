#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:0] Running CLI bootstrap check..."
OUTPUT="$(npm run dev -- "Architecture smoke test" 2>&1)"

if ! echo "$OUTPUT" | grep -q "Application warning: .*LLM client integration is not implemented yet\\|Application warning: .*OPENAI_API_KEY is missing"; then
  echo "Smoke validation failed: expected graceful bootstrap warning."
  echo "$OUTPUT"
  exit 1
fi

echo "[smoke:block:0] Passed."
