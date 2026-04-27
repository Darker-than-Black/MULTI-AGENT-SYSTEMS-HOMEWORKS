#!/usr/bin/env bash

set -euo pipefail

bash scripts/ensure-qdrant.sh
bash scripts/smoke-rag-ingest.sh
bash scripts/smoke-rag-retrieval.sh
bash scripts/smoke-multi-agent-flow.sh
