#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:rag:ingest] Running ingestion validation..."

node --import tsx -e '
import { access } from "node:fs/promises";
import { ingestKnowledgeBase } from "./src/rag/ingest.ts";
import { KNOWLEDGE_CORPUS_PATH } from "./src/config/env.ts";

const summary = await ingestKnowledgeBase();

if (summary.processedDocuments < 1) {
  throw new Error("Ingestion should process at least one document.");
}

if (summary.totalChunks < 1) {
  throw new Error("Ingestion should produce at least one chunk.");
}

await access(KNOWLEDGE_CORPUS_PATH);

console.log(JSON.stringify(summary, null, 2));
'

echo "[smoke:rag:ingest] Passed."
