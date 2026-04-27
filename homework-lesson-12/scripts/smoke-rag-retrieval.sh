#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:rag:retrieval] Running retrieval validation..."

node --import tsx -e '
import { retrieveKnowledge } from "./src/rag/retriever.ts";

const result = await retrieveKnowledge("What is retrieval-augmented generation?");

if (result.candidates.length < 1) {
  throw new Error("Retrieval should return at least one candidate.");
}

const hasRagSource = result.candidates.some((candidate) =>
  candidate.metadata.source.includes("retrieval-augmented-generation.pdf")
);

if (!hasRagSource) {
  throw new Error("Retrieval should surface the RAG document for the validation query.");
}

console.log(JSON.stringify(result, null, 2));
'

echo "[smoke:rag:retrieval] Passed."
