#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:rag:agent] Running agent integration validation..."

node --input-type=module --import tsx -e '
import { randomUUID } from "node:crypto";
import { resumeSupervisorWithOptions, superviseResearchWithOptions } from "./src/supervisor/create-supervisor.ts";

const threadId = randomUUID();
let result = await superviseResearchWithOptions(
  "Use the local knowledge base to explain what RAG is.",
  {
    threadId,
    maxIterations: 4,
  },
);

if (result.status === "interrupted") {
  if (!result.pendingReview.allowedDecisions.includes("approve")) {
    throw new Error("write_report review should allow approve.");
  }

  result = await resumeSupervisorWithOptions(
    {
      type: "reject",
      message: "Smoke validation rejected write_report.",
    },
    {
      threadId,
      maxIterations: 4,
    },
  );
}

if (result.status !== "completed") {
  throw new Error(`Expected completed supervisor result. Received ${result.status}.`);
}

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

const usedWriteReport = result.toolExecutions.some((execution) =>
  execution.call.includes("write_report")
);

if (!usedWriteReport) {
  throw new Error("Agent should attempt write_report for the local knowledge base prompt.");
}

console.log(JSON.stringify({
  finalAnswer: result.finalAnswer,
  tools: result.toolExecutions,
}, null, 2));
'

echo "[smoke:rag:agent] Passed."
