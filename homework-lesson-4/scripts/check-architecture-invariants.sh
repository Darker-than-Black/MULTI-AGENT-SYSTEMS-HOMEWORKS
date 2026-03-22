#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TARGET_DIR="homework-lesson-4/src"
RUN_AGENT_FILE="homework-lesson-4/src/agent/run-agent.ts"
DISPATCHER_FILE="homework-lesson-4/src/agent/tool-dispatcher.ts"

echo "[invariants] Checking: ReAct loop control only in run-agent.ts"
LOOP_MATCHES="$(grep -RInE '\b(while|for)\s*\(' "$TARGET_DIR" --include='*.ts' | grep -v "^${RUN_AGENT_FILE}:" || true)"
if [[ -n "$LOOP_MATCHES" ]]; then
  echo "Invariant violation: loop constructs found outside ${RUN_AGENT_FILE}"
  echo "$LOOP_MATCHES"
  exit 1
fi

echo "[invariants] Checking: tools are decoupled from direct LLM execution"
TOOLS_LLM_IMPORTS="$(grep -RInE 'from ".*(llm-client|agent/)|from '\''.*(llm-client|agent/)'\''|from "openai"|from '\''openai'\''|from "langchain"|from '\''langchain'\''' \
  homework-lesson-4/src/tools --include='*.ts' || true)"
if [[ -n "$TOOLS_LLM_IMPORTS" ]]; then
  echo "Invariant violation: tools import agent/LLM dependencies."
  echo "$TOOLS_LLM_IMPORTS"
  exit 1
fi

echo "[invariants] Checking: dispatcher is the single tool execution entrypoint"
TOOLS_INDEX_IMPORTS="$(grep -RInE 'from ".*tools/index\.js"|from '\''.*tools/index\.js'\''' "$TARGET_DIR" --include='*.ts' | grep -v "^${DISPATCHER_FILE}:" || true)"
if [[ -n "$TOOLS_INDEX_IMPORTS" ]]; then
  echo "Invariant violation: tools/index is imported outside ${DISPATCHER_FILE}"
  echo "$TOOLS_INDEX_IMPORTS"
  exit 1
fi

echo "[invariants] All architecture invariants passed."
