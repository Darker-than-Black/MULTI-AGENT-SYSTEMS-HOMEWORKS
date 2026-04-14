#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

echo "[smoke:acp] Running ACP discovery + invocation validation..."

node --input-type=module --import tsx -e '
import { ACP_URL } from "./src/config/env.ts";
import { runAcpAgent } from "./src/acp/client.ts";
import { CritiqueResultSchema } from "./src/schemas/critique-result.ts";
import { FindingsEnvelopeSchema } from "./src/schemas/findings-envelope.ts";
import { ResearchPlanSchema } from "./src/schemas/research-plan.ts";

const agentsResponse = await fetch(`${ACP_URL}/agents`, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});

if (!agentsResponse.ok) {
  throw new Error(`ACP /agents failed: ${agentsResponse.status} ${agentsResponse.statusText}`);
}

const { agents } = await agentsResponse.json();
const agentNames = agents.map((agent) => agent.name).sort();
const expectedNames = ["critic", "planner", "researcher"];

if (JSON.stringify(agentNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Unexpected ACP agent registration: ${JSON.stringify(agentNames)}`);
}

const plannerResponse = await runAcpAgent("planner", {
  userRequest: "Use the local knowledge base to explain retrieval-augmented generation with a concise technical summary.",
});
const plan = ResearchPlanSchema.parse(plannerResponse.output);

if (!plan.searchQueries.length) {
  throw new Error("Planner ACP run should return at least one search query.");
}

const researcherResponse = await runAcpAgent("researcher", {
  userRequest: "Use the local knowledge base to explain retrieval-augmented generation with a concise technical summary.",
  plan,
});
const findings = FindingsEnvelopeSchema.parse(researcherResponse.output);

if (!findings.markdown.trim()) {
  throw new Error("Researcher ACP run should return non-empty markdown findings.");
}

const criticResponse = await runAcpAgent("critic", {
  userRequest: "Use the local knowledge base to explain retrieval-augmented generation with a concise technical summary.",
  findings,
  plan,
});
const critique = CritiqueResultSchema.parse(criticResponse.output);

if (!["APPROVE", "REVISE"].includes(critique.verdict)) {
  throw new Error(`Critic ACP run returned invalid verdict: ${critique.verdict}`);
}

console.log(JSON.stringify({
  agents: agentNames,
  plan,
  findings,
  critique,
}, null, 2));
'
