#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

RUN_AGENT_FILE="src/agent/run-agent.ts"
RESEARCHER_FILE="src/agents/researcher.ts"
CRITIC_FILE="src/agents/critic.ts"
RAG_DIR="src/rag"
KNOWLEDGE_SEARCH_FILE="src/tools/knowledge-search.ts"
LANGCHAIN_TOOLS_FILE="src/tools/langchain-tools.ts"

echo "[invariants] Checking: researcher uses LangChain createAgent"
if ! grep -q "createAgent({" "$RESEARCHER_FILE"; then
  echo "Invariant violation: researcher.ts must initialize LangChain agent via createAgent."
  exit 1
fi

echo "[invariants] Checking: critic uses LangChain createAgent"
if [[ -f "$CRITIC_FILE" ]] && ! grep -q "createAgent({" "$CRITIC_FILE"; then
  echo "Invariant violation: critic.ts must initialize LangChain agent via createAgent."
  exit 1
fi

echo "[invariants] Checking: run-agent delegates to researcher runtime"
if ! grep -q "runResearchTurn" "$RUN_AGENT_FILE"; then
  echo "Invariant violation: run-agent.ts must delegate to runResearchTurn."
  exit 1
fi

echo "[invariants] Checking: legacy manual loop files are removed"
for file in \
  "src/agent/llm-client.ts" \
  "src/agent/llm-adapter.ts" \
  "src/agent/tool-dispatcher.ts" \
  "src/tools/index.ts" \
  "src/tools/schemas.ts" \
  "src/tools/validation.ts"
do
  if [[ -f "$file" ]]; then
    echo "Invariant violation: legacy file still exists: $file"
    exit 1
  fi
done

echo "[invariants] Checking: tools stay decoupled from agent/OpenAI internals"
TOOLS_INTERNAL_IMPORTS="$(grep -RInE 'from ".*(llm-client|agent/)|from '\''.*(llm-client|agent/)'\''|from "openai"|from '\''openai'\''' \
  src/tools --include='*.ts' || true)"
if [[ -n "$TOOLS_INTERNAL_IMPORTS" ]]; then
  echo "Invariant violation: tools import agent/OpenAI dependencies."
  echo "$TOOLS_INTERNAL_IMPORTS"
  exit 1
fi

if [[ -d "$RAG_DIR" ]]; then
  echo "[invariants] Checking: rag stays decoupled from agent internals"
  RAG_AGENT_IMPORTS="$(grep -RInE 'from ".*agent/|from '\''.*agent/'\''' "$RAG_DIR" --include='*.ts' || true)"
  if [[ -n "$RAG_AGENT_IMPORTS" ]]; then
    echo "Invariant violation: rag layer imports agent internals."
    echo "$RAG_AGENT_IMPORTS"
    exit 1
  fi
fi

echo "[invariants] Checking: only tools/langchain-tools.ts may import langchain"
TOOLS_LANGCHAIN_IMPORTS="$(grep -RInE 'from "langchain"|from '\''langchain'\''' src/tools --include='*.ts' | grep -v 'src/tools/langchain-tools.ts' || true)"
if [[ -n "$TOOLS_LANGCHAIN_IMPORTS" ]]; then
  echo "Invariant violation: unexpected langchain import outside tools/langchain-tools.ts."
  echo "$TOOLS_LANGCHAIN_IMPORTS"
  exit 1
fi

if [[ -f "$KNOWLEDGE_SEARCH_FILE" ]]; then
  echo "[invariants] Checking: knowledge_search is registered in langchain-tools"
  if ! grep -q 'name: "knowledge_search"' "$LANGCHAIN_TOOLS_FILE"; then
    echo "Invariant violation: knowledge_search exists but is not registered in tools/langchain-tools.ts."
    exit 1
  fi
fi

echo "[invariants] All architecture invariants passed."
