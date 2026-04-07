#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[validate] Running TypeScript check..."
npm run check

echo "[validate] Running architecture invariants..."
bash scripts/check-architecture-invariants.sh

echo "[validate] Running planner validation..."
node --import tsx -e '
import { planResearch } from "./src/agents/planner.ts";
import { ResearchPlanSchema } from "./src/schemas/research-plan.ts";
import { knowledgeSearchTool, webSearchTool } from "./src/tools/langchain-tools.ts";

const toolNames = [webSearchTool, knowledgeSearchTool].map((tool) => tool.name).sort();
const expectedNames = ["knowledge_search", "web_search"].sort();

if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Planner tools mismatch: ${JSON.stringify(toolNames)}`);
}

const plan = await planResearch("Compare naive RAG and sentence-window retrieval. Prepare a concise comparison report.");
ResearchPlanSchema.parse(plan);

if (plan.searchQueries.length < 1) {
  throw new Error("Planner should return at least one search query.");
}

console.log(JSON.stringify(plan, null, 2));
'

echo "[validate] Running researcher validation..."
node --import tsx -e '
import { research } from "./src/agents/researcher.ts";
import { ResearchPlanSchema } from "./src/schemas/research-plan.ts";

const plan = ResearchPlanSchema.parse({
  goal: "Explain retrieval-augmented generation using the local knowledge base.",
  searchQueries: ["What is retrieval-augmented generation?"],
  sourcesToCheck: ["knowledge_base"],
  outputFormat: "Short evidence-grounded summary",
});

const findings = await research({
  userRequest: "Use the local knowledge base to explain what retrieval-augmented generation is.",
  plan,
});

if (!findings.trim()) {
  throw new Error("Researcher should return non-empty findings.");
}

console.log(findings);
'

echo "[validate] Running RAG ingestion validation..."
bash scripts/smoke-rag-ingest.sh

echo "[validate] Running retrieval validation..."
bash scripts/smoke-rag-retrieval.sh

echo "[validate] Running agent integration validation..."
bash scripts/smoke-rag-agent.sh

echo "[validate] All validations passed."
