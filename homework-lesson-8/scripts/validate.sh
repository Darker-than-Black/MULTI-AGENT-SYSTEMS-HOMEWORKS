#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[validate] Running TypeScript check..."
npm run check

echo "[validate] Running architecture invariants..."
bash scripts/check-architecture-invariants.sh

echo "[validate] Running RAG ingestion validation..."
bash scripts/smoke-rag-ingest.sh

echo "[validate] Running retrieval validation..."
bash scripts/smoke-rag-retrieval.sh

echo "[validate] Running agent integration validation..."
bash scripts/smoke-rag-agent.sh

echo "[validate] All validations passed."
