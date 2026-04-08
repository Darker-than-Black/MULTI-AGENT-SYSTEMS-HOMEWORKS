#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:rag:agent] Running agent integration validation..."

node --import tsx -e '
import { createSessionMemory } from "./src/agent/memory.ts";
import { runAgentTurn } from "./src/agent/run-agent.ts";

const session = createSessionMemory();
const result = await runAgentTurn({
  userInput: "Use the local knowledge base to explain what RAG is.",
  memory: session.messages,
  maxIterations: 4,
});

if (!result.finalAnswer.trim()) {
  throw new Error("Agent should return a final answer.");
}

const usedKnowledgeSearch = result.toolExecutions.some((execution) =>
  execution.call.includes("plan_research")
);

if (!usedKnowledgeSearch) {
  throw new Error("Agent should call plan_research for the local knowledge base prompt.");
}

const usedResearch = result.toolExecutions.some((execution) =>
  execution.call.includes("run_research")
);

if (!usedResearch) {
  throw new Error("Agent should call run_research for the local knowledge base prompt.");
}

const usedCritique = result.toolExecutions.some((execution) =>
  execution.call.includes("critique_findings")
);

if (!usedCritique) {
  throw new Error("Agent should call critique_findings for the local knowledge base prompt.");
}

console.log(JSON.stringify({
  finalAnswer: result.finalAnswer,
  tools: result.toolExecutions,
}, null, 2));
'

echo "[smoke:rag:agent] Passed."
