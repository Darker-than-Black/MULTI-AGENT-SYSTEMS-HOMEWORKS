#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:multi-agent] Running deterministic supervisor workflow validation..."

node --input-type=module --import tsx -e '
import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { FakeToolCallingModel, tool } from "langchain";
import { z } from "zod";
import { createSupervisorAgent } from "./src/supervisor/create-supervisor.ts";

const userRequest = "Explain RAG and save a report.";
const plan = {
  goal: "Explain RAG clearly",
  searchQueries: ["what is retrieval augmented generation"],
  sourcesToCheck: ["knowledge_base"],
  outputFormat: "Short markdown report",
};

let researchCalls = 0;
let critiqueCalls = 0;

const fakeSupervisorTools = [
  tool(
    async ({ userRequest }) => JSON.stringify({
      ...plan,
      goal: `${plan.goal} for: ${userRequest}`,
    }),
    {
      name: "plan_research",
      description: "Return a structured research plan.",
      schema: z.object({
        userRequest: z.string(),
      }),
    },
  ),
  tool(
    async ({ critiqueFeedback }) => {
      researchCalls += 1;
      return critiqueFeedback?.length
        ? "Improved findings with stronger evidence and clearer structure."
        : "Initial findings that are incomplete and need revision.";
    },
    {
      name: "run_research",
      description: "Run the research step.",
      schema: z.object({
        userRequest: z.string(),
        plan: z.any(),
        critiqueFeedback: z.array(z.string()).optional(),
      }),
    },
  ),
  tool(
    async () => {
      critiqueCalls += 1;
      return JSON.stringify(
        critiqueCalls === 1
          ? {
              verdict: "REVISE",
              isFresh: false,
              isComplete: false,
              isWellStructured: true,
              strengths: ["Has a usable baseline structure"],
              gaps: ["Missing stronger evidence"],
              revisionRequests: ["Add stronger evidence and tighten the explanation."],
            }
          : {
              verdict: "APPROVE",
              isFresh: true,
              isComplete: true,
              isWellStructured: true,
              strengths: ["Clear and evidence-grounded"],
              gaps: [],
              revisionRequests: [],
            },
      );
    },
    {
      name: "critique_findings",
      description: "Critique the findings.",
      schema: z.object({
        userRequest: z.string(),
        findings: z.string(),
      }),
    },
  ),
  tool(
    async ({ filename }) => `Report saved to ${filename}`,
    {
      name: "write_report",
      description: "Persist the report.",
      schema: z.object({
        filename: z.string(),
        content: z.string(),
      }),
    },
  ),
];

const fakeModel = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "plan_research", args: { userRequest }, id: "tool-1" }],
    [{ name: "run_research", args: { userRequest, plan }, id: "tool-2" }],
    [{ name: "critique_findings", args: { userRequest, findings: "Initial findings that are incomplete and need revision." }, id: "tool-3" }],
    [{ name: "run_research", args: { userRequest, plan, critiqueFeedback: ["Add stronger evidence and tighten the explanation."] }, id: "tool-4" }],
    [{ name: "critique_findings", args: { userRequest, findings: "Improved findings with stronger evidence and clearer structure." }, id: "tool-5" }],
    [{ name: "write_report", args: { filename: "rag_report.md", content: "# RAG report\n\nImproved findings with stronger evidence." }, id: "tool-6" }],
    [],
  ],
});

const { agent: supervisor } = await createSupervisorAgent({
  model: fakeModel,
  tools: fakeSupervisorTools,
});

const threadId = randomUUID();
const firstResult = await supervisor.invoke(
  { messages: [new HumanMessage(userRequest)] },
  {
    recursionLimit: 40,
    configurable: { thread_id: threadId },
  },
);

const interrupt = firstResult.__interrupt__?.[0];
if (!interrupt) {
  throw new Error("Expected HITL interrupt on write_report.");
}

const pendingAction = interrupt.value?.actionRequests?.[0];
if (pendingAction?.name !== "write_report") {
  throw new Error(`Expected write_report interrupt, received ${pendingAction?.name ?? "none"}.`);
}

const firstToolMessages = firstResult.messages.filter((message) => message.getType() === "tool");
const firstToolNames = firstToolMessages.map((message) => ("name" in message ? message.name : undefined));

const runResearchCount = firstToolNames.filter((name) => name === "run_research").length;
const critiqueCount = firstToolNames.filter((name) => name === "critique_findings").length;

if (runResearchCount < 2 || critiqueCount < 2) {
  throw new Error(`Expected supervisor iteration before write_report. run_research=${runResearchCount}, critique_findings=${critiqueCount}`);
}

const resumedResult = await supervisor.invoke(
  new Command({ resume: { decisions: [{ type: "approve" }] } }),
  {
    recursionLimit: 40,
    configurable: { thread_id: threadId },
  },
);

if (resumedResult.__interrupt__) {
  throw new Error("Expected HITL resume to complete without another interrupt.");
}

const finalToolMessages = resumedResult.messages.filter((message) => message.getType() === "tool");
const finalToolNames = finalToolMessages.map((message) => ("name" in message ? message.name : undefined));
const writeReportCount = finalToolNames.filter((name) => name === "write_report").length;

if (writeReportCount !== 1) {
  throw new Error(`Expected one persisted write_report after resume. Received ${writeReportCount}.`);
}

if (researchCalls !== 2 || critiqueCalls !== 2) {
  throw new Error(`Unexpected fake tool call counts. research=${researchCalls}, critique=${critiqueCalls}`);
}

console.log(JSON.stringify({
  interruptAction: pendingAction,
  iterationCounts: {
    runResearchCount,
    critiqueCount,
  },
  finalToolNames,
}, null, 2));
'

echo "[smoke:multi-agent] Passed."
