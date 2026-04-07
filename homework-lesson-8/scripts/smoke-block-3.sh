#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:3] Running LangChain agent guardrail validation..."

RUN_AGENT_FILE="src/agent/run-agent.ts"
PROMPT_FILE="src/agent/prompt.ts"

if ! grep -q "createAgent({" "$RUN_AGENT_FILE"; then
  echo "Missing LangChain createAgent setup in run-agent.ts"
  exit 1
fi

if ! grep -q "systemPrompt: SYSTEM_PROMPT.trim()" "$RUN_AGENT_FILE"; then
  echo "Missing system prompt wiring in run-agent.ts"
  exit 1
fi

if ! grep -q "recursionLimit" "$RUN_AGENT_FILE"; then
  echo "Missing recursion limit guard in run-agent.ts"
  exit 1
fi

if ! grep -q "Do not repeat identical tool arguments" "$PROMPT_FILE"; then
  echo "Missing anti-loop prompt constraint in prompt.ts"
  exit 1
fi

echo "[smoke:block:3] Static guardrail checks passed."

echo "[smoke:block:3] Running optional live multi-step scenario..."
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OUTPUT="$(printf 'Порівняй naive RAG та sentence-window retrieval і збережи звіт у файл\nquit\n' | npm run dev 2>&1)"
  if ! echo "$OUTPUT" | grep -q "Agent:"; then
    echo "Live scenario failed: expected agent response output."
    echo "$OUTPUT"
    exit 1
  fi
  echo "[smoke:block:3] Live multi-step scenario executed."
else
  echo "[smoke:block:3] Skipped live scenario: OPENAI_API_KEY is not set."
fi

echo "[smoke:block:3] Passed."
