#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TARGET_DIR="homework-lesson-5/src"
RUN_AGENT_FILE="homework-lesson-5/src/agent/run-agent.ts"

echo "[invariants] Checking: run-agent uses LangChain createAgent"
if ! grep -q "createAgent({" "$RUN_AGENT_FILE"; then
  echo "Invariant violation: run-agent.ts must initialize LangChain agent via createAgent."
  exit 1
fi

echo "[invariants] Checking: legacy manual loop files are removed"
for file in \
  "homework-lesson-5/src/agent/llm-client.ts" \
  "homework-lesson-5/src/agent/llm-adapter.ts" \
  "homework-lesson-5/src/agent/tool-dispatcher.ts" \
  "homework-lesson-5/src/tools/index.ts" \
  "homework-lesson-5/src/tools/schemas.ts" \
  "homework-lesson-5/src/tools/validation.ts"
do
  if [[ -f "$file" ]]; then
    echo "Invariant violation: legacy file still exists: $file"
    exit 1
  fi
done

echo "[invariants] Checking: tools stay decoupled from agent/OpenAI internals"
TOOLS_INTERNAL_IMPORTS="$(grep -RInE 'from ".*(llm-client|agent/)|from '\''.*(llm-client|agent/)'\''|from "openai"|from '\''openai'\''' \
  homework-lesson-5/src/tools --include='*.ts' || true)"
if [[ -n "$TOOLS_INTERNAL_IMPORTS" ]]; then
  echo "Invariant violation: tools import agent/OpenAI dependencies."
  echo "$TOOLS_INTERNAL_IMPORTS"
  exit 1
fi

echo "[invariants] Checking: only tools/langchain-tools.ts may import langchain"
TOOLS_LANGCHAIN_IMPORTS="$(grep -RInE 'from "langchain"|from '\''langchain'\''' homework-lesson-5/src/tools --include='*.ts' | grep -v 'homework-lesson-5/src/tools/langchain-tools.ts' || true)"
if [[ -n "$TOOLS_LANGCHAIN_IMPORTS" ]]; then
  echo "Invariant violation: unexpected langchain import outside tools/langchain-tools.ts."
  echo "$TOOLS_LANGCHAIN_IMPORTS"
  exit 1
fi

echo "[invariants] All architecture invariants passed."
