#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:4] Running memory + REPL validation..."

MAIN_FILE="src/main.ts"
MEMORY_FILE="src/agent/memory.ts"

if ! grep -q "while (true)" "$MAIN_FILE"; then
  echo "REPL validation failed: missing iterative loop in main.ts"
  exit 1
fi

if ! grep -q "exit\\|quit" "$MAIN_FILE"; then
  echo "REPL validation failed: missing exit/quit handling in main.ts"
  exit 1
fi

if ! grep -q "createSessionMemory" "$MAIN_FILE"; then
  echo "Memory validation failed: session memory is not initialized in main.ts"
  exit 1
fi

if ! grep -q "enforceMemoryBudget" "$MEMORY_FILE"; then
  echo "Memory validation failed: no memory budget enforcement in memory.ts"
  exit 1
fi

echo "[smoke:block:4] Static checks passed."

echo "[smoke:block:4] Running optional live multi-turn context check..."
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OUTPUT="$(printf 'Remember this token exactly: BLUE-CHEETAH-42. Respond with \"remembered\".\nn\nWhat token did I ask you to remember in my previous message?\nn\nquit\n' | npm run dev 2>&1)"
  if ! echo "$OUTPUT" | grep -q "BLUE-CHEETAH-42"; then
    echo "Live context check failed: expected token recall across turns."
    echo "$OUTPUT"
    exit 1
  fi
  echo "[smoke:block:4] Live multi-turn context check passed."
else
  echo "[smoke:block:4] Skipped live context check: OPENAI_API_KEY is not set."
fi

echo "[smoke:block:4] Passed."
