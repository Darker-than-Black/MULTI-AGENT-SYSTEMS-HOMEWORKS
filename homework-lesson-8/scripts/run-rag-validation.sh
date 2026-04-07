#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJECT_DIR="${REPO_ROOT}/homework-lesson-5"
cd "$PROJECT_DIR"

echo "[rag] Running shared quality gates..."
npm run check
npm run invariant:check

echo "[rag] Running RAG smoke validation..."
npm run smoke:rag:ingest
npm run smoke:rag:retrieval
npm run smoke:rag:agent

echo "[rag] Validation passed."
