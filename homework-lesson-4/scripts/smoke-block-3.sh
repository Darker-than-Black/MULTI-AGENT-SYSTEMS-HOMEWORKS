#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:3] Running ReAct loop guardrail validation..."

RUN_AGENT_FILE="src/agent/run-agent.ts"
PROMPT_FILE="src/agent/prompt.ts"

if ! grep -q "while (iterations < maxIterations)" "$RUN_AGENT_FILE"; then
  echo "Missing MAX_ITERATIONS guard in run-agent.ts"
  exit 1
fi

if ! grep -q "noProgressStreak" "$RUN_AGENT_FILE"; then
  echo "Missing anti-loop noProgressStreak guard in run-agent.ts"
  exit 1
fi

if ! grep -q "Stopped early: repeated tool-call plan without progress." "$RUN_AGENT_FILE"; then
  echo "Missing repeated-plan stop condition message in run-agent.ts"
  exit 1
fi

if ! grep -q "Do not repeat the exact same tool call plan" "$PROMPT_FILE"; then
  echo "Missing anti-loop prompt constraint in prompt.ts"
  exit 1
fi

echo "[smoke:block:3] Static guardrail checks passed."

echo "[smoke:block:3] Running optional live multi-step scenario..."
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OUTPUT="$(printf 'Порівняй naive RAG та sentence-window retrieval і збережи звіт у файл\nquit\n' | npm run dev 2>&1)"
  if ! echo "$OUTPUT" | grep -q "🔧 Tool call:"; then
    echo "Live scenario failed: expected at least one tool call log."
    echo "$OUTPUT"
    exit 1
  fi
  echo "[smoke:block:3] Live multi-step scenario executed."
else
  echo "[smoke:block:3] Skipped live scenario: OPENAI_API_KEY is not set."
fi

echo "[smoke:block:3] Passed."
