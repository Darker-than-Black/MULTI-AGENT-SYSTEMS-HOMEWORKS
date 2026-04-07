#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[rag] Running shared quality gates..."
npm run check
npm run invariant:check

echo "[rag] Running RAG smoke validation..."
bash scripts/smoke-rag-ingest.sh
bash scripts/smoke-rag-retrieval.sh
bash scripts/smoke-rag-agent.sh

echo "[rag] Validation passed."
