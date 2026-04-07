#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:5] Running prompt engineering validation..."

PROMPT_FILE="src/agent/prompt.ts"

if ! grep -q "ROLE" "$PROMPT_FILE"; then
  echo "Prompt validation failed: ROLE section is missing."
  exit 1
fi

if ! grep -q "TOOL USE POLICY" "$PROMPT_FILE"; then
  echo "Prompt validation failed: TOOL USE POLICY section is missing."
  exit 1
fi

if ! grep -q "OUTPUT FORMAT" "$PROMPT_FILE"; then
  echo "Prompt validation failed: OUTPUT FORMAT section is missing."
  exit 1
fi

if ! grep -q "FEW-SHOT EXAMPLES" "$PROMPT_FILE"; then
  echo "Prompt validation failed: FEW-SHOT EXAMPLES section is missing."
  exit 1
fi

if ! grep -q "Do not repeat identical tool arguments" "$PROMPT_FILE"; then
  echo "Prompt validation failed: anti-loop evidence-first rule is missing."
  exit 1
fi

echo "[smoke:block:5] Static prompt checks passed."

echo "[smoke:block:5] Passed."
