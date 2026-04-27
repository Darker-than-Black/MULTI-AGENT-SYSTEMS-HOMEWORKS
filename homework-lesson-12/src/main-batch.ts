import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { MAX_ITERATIONS } from "./config/env";
import { planResearch } from "./agents/planner";
import { research, type ResearchInput } from "./agents/researcher";
import { critique, type CritiqueInput } from "./agents/critic";
import {
  createLangfuseCallbackHandler,
  shutdownLangfuseClient,
} from "./lib/langfuse";
import {
  type LangfuseTraceAttributes,
  buildBatchLangfuseTraceAttributes,
} from "./lib/langfuse-attributes";
import {
  runWithLangfuseRootTrace,
  shutdownLangfuseObservability,
} from "./lib/langfuse-runtime";
import { knowledgeSearch } from "./tools/knowledge-search";
import {
  superviseResearchWithOptions,
  resumeSupervisorWithOptions,
} from "./supervisor/create-supervisor";
import type { ResearchPlan } from "./schemas/research-plan";

/**
 * Non-interactive batch entrypoint for automated testing.
 *
 * Usage: echo '<JSON>' | npm run batch
 *
 * Reads a JSON request from stdin, runs the specified agent mode,
 * writes a JSON result to stdout, and exits 0 on success or 1 on error.
 *
 * Supported modes:
 *   "full"             — run full supervisor pipeline (auto-approves write_report)
 *   "plan"             — run planResearch only
 *   "research"         — run research only (requires plan in payload)
 *   "critique"         — run critique only (requires findings in payload)
 *   "knowledge_search" — run knowledgeSearch only
 */

type BatchMode = "full" | "plan" | "research" | "critique" | "knowledge_search";

interface BatchRequest {
  mode: BatchMode;
  userRequest?: string;
  plan?: ResearchPlan;
  findings?: string;
  critiqueFeedback?: string[];
  query?: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

function buildBatchCallbacks(
  traceAttributes: LangfuseTraceAttributes,
): BaseCallbackHandler[] | undefined {
  const handler = createLangfuseCallbackHandler({
    userId: traceAttributes.userId,
    sessionId: traceAttributes.sessionId,
    tags: traceAttributes.tags,
    traceMetadata: traceAttributes.metadata,
  });

  return handler ? [handler] : undefined;
}

async function runFull(
  userRequest: string,
  callbacks?: BaseCallbackHandler[],
): Promise<Record<string, unknown>> {
  const threadId = randomUUID();

  let result = await superviseResearchWithOptions(userRequest, {
    threadId,
    maxIterations: MAX_ITERATIONS,
    callbacks,
  });

  if (result.status === "interrupted") {
    result = await resumeSupervisorWithOptions(
      { type: "approve" },
      { threadId, maxIterations: MAX_ITERATIONS, callbacks },
    );
  }

  return {
    finalAnswer: result.finalAnswer,
    plan: result.plan,
    critique: result.critique,
    toolExecutions: result.toolExecutions,
    wroteReport: result.wroteReport,
    iterations: result.iterations,
  };
}

async function runPlan(
  userRequest: string,
  callbacks?: BaseCallbackHandler[],
): Promise<Record<string, unknown>> {
  const plan = await planResearch(userRequest, { callbacks });
  return { plan };
}

async function runResearch(
  userRequest: string,
  plan: ResearchPlan,
  critiqueFeedback?: string[],
  callbacks?: BaseCallbackHandler[],
): Promise<Record<string, unknown>> {
  const input: ResearchInput = { userRequest, plan, critiqueFeedback };
  const findings = await research(input, { callbacks });
  return { findings };
}

async function runCritique(
  userRequest: string,
  findings: string,
  callbacks?: BaseCallbackHandler[],
): Promise<Record<string, unknown>> {
  const input: CritiqueInput = { userRequest, findings };
  const result = await critique(input, { callbacks });
  return { critique: result };
}

async function runKnowledgeSearch(query: string): Promise<Record<string, unknown>> {
  const results = await knowledgeSearch({ query });
  return { results };
}

async function main(): Promise<void> {
  const rawInput = await readStdin();

  let request: BatchRequest;
  try {
    request = JSON.parse(rawInput.trim()) as BatchRequest;
  } catch {
    writeResult({ success: false, error: "Invalid JSON input." });
    process.exitCode = 1;
    return;
  }

  const { mode } = request;
  if (!mode) {
    writeResult({ success: false, error: "Missing required field: mode." });
    process.exitCode = 1;
    return;
  }

  try {
    let output: Record<string, unknown>;
    const requestId = randomUUID();
    const traceAttributes = buildBatchLangfuseTraceAttributes(mode, requestId);
    const callbacks = buildBatchCallbacks(traceAttributes);

    output = await runWithLangfuseRootTrace({
      name: `mas-batch-${mode}`,
      input: request,
      userId: traceAttributes.userId,
      sessionId: traceAttributes.sessionId,
      tags: traceAttributes.tags,
      metadata: traceAttributes.metadata,
      task: async () => {
        switch (mode) {
          case "full": {
            if (!request.userRequest) {
              throw new Error("mode=full requires userRequest.");
            }
            return runFull(request.userRequest, callbacks);
          }

          case "plan": {
            if (!request.userRequest) {
              throw new Error("mode=plan requires userRequest.");
            }
            return runPlan(request.userRequest, callbacks);
          }

          case "research": {
            if (!request.userRequest) throw new Error("mode=research requires userRequest.");
            if (!request.plan) throw new Error("mode=research requires plan.");
            return runResearch(request.userRequest, request.plan, request.critiqueFeedback, callbacks);
          }

          case "critique": {
            if (!request.userRequest) throw new Error("mode=critique requires userRequest.");
            if (!request.findings) throw new Error("mode=critique requires findings.");
            return runCritique(request.userRequest, request.findings, callbacks);
          }

          case "knowledge_search": {
            if (!request.query) throw new Error("mode=knowledge_search requires query.");
            return runKnowledgeSearch(request.query);
          }

          default: {
            throw new Error(`Unknown mode: ${mode as string}. Supported: full, plan, research, critique, knowledge_search.`);
          }
        }
      },
    });

    writeResult({ success: true, mode, ...output });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown batch error.";
    writeResult({ success: false, error: message });
    process.exitCode = 1;
  } finally {
    await shutdownLangfuseObservability();
    await shutdownLangfuseClient();
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error.";
  writeResult({ success: false, error: message });
  process.exitCode = 1;
});
