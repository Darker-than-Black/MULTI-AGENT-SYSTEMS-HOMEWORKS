#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[validate] Running TypeScript check..."
npm run check

echo "[validate] Running architecture invariants..."
npm run invariant:check

SEARCH_MCP_LOG="$(mktemp)"
GITHUB_MCP_LOG="$(mktemp)"
REPORT_MCP_LOG="$(mktemp)"
ACP_LOG="$(mktemp)"
echo "[validate] Starting SearchMCP server..."
npm run mcp:search >"$SEARCH_MCP_LOG" 2>&1 &
SEARCH_MCP_PID=$!
echo "[validate] Starting GitHubMCP server..."
npm run mcp:github >"$GITHUB_MCP_LOG" 2>&1 &
GITHUB_MCP_PID=$!
echo "[validate] Starting ReportMCP server..."
npm run mcp:report >"$REPORT_MCP_LOG" 2>&1 &
REPORT_MCP_PID=$!
echo "[validate] Starting ACP server..."
npm run acp:server >"$ACP_LOG" 2>&1 &
ACP_PID=$!

cleanup() {
  if [[ -n "${SEARCH_MCP_PID:-}" ]] && kill -0 "$SEARCH_MCP_PID" 2>/dev/null; then
    kill "$SEARCH_MCP_PID" 2>/dev/null || true
    wait "$SEARCH_MCP_PID" 2>/dev/null || true
  fi
  if [[ -n "${GITHUB_MCP_PID:-}" ]] && kill -0 "$GITHUB_MCP_PID" 2>/dev/null; then
    kill "$GITHUB_MCP_PID" 2>/dev/null || true
    wait "$GITHUB_MCP_PID" 2>/dev/null || true
  fi
  if [[ -n "${REPORT_MCP_PID:-}" ]] && kill -0 "$REPORT_MCP_PID" 2>/dev/null; then
    kill "$REPORT_MCP_PID" 2>/dev/null || true
    wait "$REPORT_MCP_PID" 2>/dev/null || true
  fi
  if [[ -n "${ACP_PID:-}" ]] && kill -0 "$ACP_PID" 2>/dev/null; then
    kill "$ACP_PID" 2>/dev/null || true
    wait "$ACP_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT
sleep 2

echo "[validate] Running SearchMCP discovery + invocation validation..."
bash scripts/smoke-search-mcp.sh

echo "[validate] Running GitHubMCP discovery + invocation validation..."
bash scripts/smoke-github-mcp.sh

echo "[validate] Running ReportMCP discovery + invocation validation..."
bash scripts/smoke-report-mcp.sh

echo "[validate] Running ACP discovery + invocation validation..."
bash scripts/smoke-acp.sh

echo "[validate] Running write_report tool validation through ReportMCP..."
node --input-type=module --import tsx -e '
import { randomUUID } from "node:crypto";
import { writeReportTool } from "./src/tools/langchain-tools.ts";

const filename = `write-report-tool-${randomUUID()}.md`;
const result = await writeReportTool.invoke({
  filename,
  content: "# Write Report Tool Validation\n\nSaved through writeReportTool routed via ReportMCP.",
});

if (!String(result).includes(filename)) {
  throw new Error(`writeReportTool did not return the expected filename: ${result}`);
}

console.log(JSON.stringify({ result }, null, 2));
'

echo "[validate] Running planner validation through SearchMCP..."
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

echo "[validate] Running researcher validation through SearchMCP..."
node --input-type=module --import tsx -e '
import { researchToEnvelope } from "./src/agents/researcher.ts";
import { ResearchPlanSchema } from "./src/schemas/research-plan.ts";

const plan = ResearchPlanSchema.parse({
  goal: "Explain retrieval-augmented generation using the local knowledge base.",
  searchQueries: ["What is retrieval-augmented generation?"],
  sourcesToCheck: ["knowledge_base"],
  outputFormat: "Short evidence-grounded summary",
});

const findings = await researchToEnvelope({
  userRequest: "Use the local knowledge base to explain what retrieval-augmented generation is.",
  plan,
});

if (!findings.markdown.trim()) {
  throw new Error("Researcher should return non-empty findings markdown.");
}

console.log(JSON.stringify(findings, null, 2));
'

echo "[validate] Running critic validation through SearchMCP..."
node --input-type=module --import tsx -e '
import { critique } from "./src/agents/critic.ts";
import { CritiqueResultSchema } from "./src/schemas/critique-result.ts";
import { FindingsEnvelopeSchema } from "./src/schemas/findings-envelope.ts";
import { knowledgeSearchTool, readUrlTool, webSearchTool } from "./src/tools/langchain-tools.ts";

const toolNames = [webSearchTool, readUrlTool, knowledgeSearchTool].map((tool) => tool.name).sort();
const expectedNames = ["knowledge_search", "read_url", "web_search"].sort();

if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Critic tools mismatch: ${JSON.stringify(toolNames)}`);
}

const result = await critique({
  userRequest: "Compare naive RAG and sentence-window retrieval using current web evidence and explain when each approach should be used.",
  findings: FindingsEnvelopeSchema.parse({
    markdown: "## Summary\n\nRAG helps models answer questions better. Sentence-window retrieval is another retrieval approach.",
  }),
  plan: {
    goal: "Compare naive RAG and sentence-window retrieval.",
    searchQueries: ["naive RAG", "sentence-window retrieval"],
    sourcesToCheck: ["knowledge_base", "web"],
    outputFormat: "Concise comparison with evidence.",
  },
});

CritiqueResultSchema.parse(result);

if (result.verdict !== "REVISE") {
  throw new Error(`Critic should request revision for weak findings. Received ${result.verdict}.`);
}

console.log(JSON.stringify(result, null, 2));
'

echo "[validate] Checking protocol baseline config..."
node --input-type=module --import tsx -e '
import {
  ACP_URL,
  GITHUB_MCP_URL,
  REPORT_MCP_URL,
  SEARCH_MCP_URL,
} from "./src/config/env.ts";

for (const [key, value] of Object.entries({
  SEARCH_MCP_URL,
  GITHUB_MCP_URL,
  REPORT_MCP_URL,
  ACP_URL,
})) {
  if (!String(value).trim()) {
    throw new Error(`${key} must be configured.`);
  }
}

console.log(JSON.stringify({
  SEARCH_MCP_URL,
  GITHUB_MCP_URL,
  REPORT_MCP_URL,
  ACP_URL,
}, null, 2));
'

echo "[validate] Running supervisor baseline validation..."
if grep -q 'from "../agents/' "src/supervisor/supervisor-tools.ts"; then
  echo "Supervisor tools must delegate through ACP instead of importing local role agents."
  exit 1
fi

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
import { parseCritiqueToolResult, parsePlanToolResult } from "./src/supervisor/supervisor-tools.ts";

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
  parsedPlan,
  parsedCritique,
}, null, 2));
'

echo "[validate] Running Supervisor ACP delegation smoke..."
bash scripts/smoke-rag-agent.sh

echo "[validate] Running deterministic baseline workflow validation..."
bash scripts/smoke-multi-agent-flow.sh

echo "[validate] Running RAG smoke suite..."
npm run rag:check

echo "[validate] MCP, ACP, and Supervisor ACP delegation validations passed."
