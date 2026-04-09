#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[validate] Running TypeScript check..."
npm run check

echo "[validate] Running architecture invariants..."
npm run invariant:check

echo "[validate] Running planner validation..."
node --input-type=module --import tsx -e '
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
node --input-type=module --import tsx -e '
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

echo "[validate] Running critic validation..."
node --input-type=module --import tsx -e '
import { critique } from "./src/agents/critic.ts";
import { CritiqueResultSchema } from "./src/schemas/critique-result.ts";
import { knowledgeSearchTool, readUrlTool, webSearchTool } from "./src/tools/langchain-tools.ts";

const toolNames = [webSearchTool, readUrlTool, knowledgeSearchTool].map((tool) => tool.name).sort();
const expectedNames = ["knowledge_search", "read_url", "web_search"].sort();

if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Critic tools mismatch: ${JSON.stringify(toolNames)}`);
}

const result = await critique({
  userRequest: "Compare naive RAG and sentence-window retrieval using current web evidence and explain when each approach should be used.",
  findings: "RAG helps models answer questions better. Sentence-window retrieval is another retrieval approach.",
});

CritiqueResultSchema.parse(result);

if (result.verdict !== "REVISE") {
  throw new Error(`Critic should request revision for weak findings. Received ${result.verdict}.`);
}

console.log(JSON.stringify(result, null, 2));
'

echo "[validate] Running supervisor validation..."
if ! grep -q "humanInTheLoopMiddleware" "src/supervisor/create-supervisor.ts"; then
  echo "Supervisor HITL middleware wiring is missing."
  exit 1
fi

if ! grep -q "MemorySaver" "src/supervisor/create-supervisor.ts"; then
  echo "Supervisor checkpointer wiring is missing."
  exit 1
fi

node --input-type=module --import tsx -e '
import { createSupervisorAgent } from "./src/supervisor/create-supervisor.ts";
import {
  parseCritiqueToolResult,
  parsePlanToolResult,
  supervisorTools,
} from "./src/supervisor/supervisor-tools.ts";

const toolNames = supervisorTools.map((tool) => tool.name).sort();
const expectedNames = ["critique_findings", "plan_research", "run_research", "write_report"].sort();

if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Supervisor tools mismatch: ${JSON.stringify(toolNames)}`);
}

const parsedPlan = parsePlanToolResult(JSON.stringify({
  goal: "Explain retrieval-augmented generation.",
  searchQueries: ["What is retrieval-augmented generation?"],
  sourcesToCheck: ["knowledge_base"],
  outputFormat: "Concise markdown answer",
}));

if (parsedPlan.searchQueries.length !== 1) {
  throw new Error("Supervisor plan parser should preserve structured plan payloads.");
}

const parsedCritique = parseCritiqueToolResult(JSON.stringify({
  verdict: "APPROVE",
  isFresh: true,
  isComplete: true,
  isWellStructured: true,
  strengths: ["Grounded in evidence"],
  gaps: [],
  revisionRequests: [],
}));

if (parsedCritique.verdict !== "APPROVE") {
  throw new Error("Supervisor critique parser should preserve structured critique payloads.");
}

const supervisor = createSupervisorAgent();
if (!supervisor) {
  throw new Error("Supervisor agent should be created successfully.");
}

console.log(JSON.stringify({
  toolNames,
  parsedPlan,
  parsedCritique,
}, null, 2));
'

echo "[validate] Running deterministic multi-agent workflow validation..."
bash scripts/smoke-multi-agent-flow.sh

echo "[validate] Running RAG smoke suite..."
npm run rag:check

echo "[validate] All validations passed."
