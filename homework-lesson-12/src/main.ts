import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MAX_ITERATIONS } from "./config/env";
import {
  createLangfuseCallbackHandler,
  shutdownLangfuseClient,
} from "./lib/langfuse";
import { buildCliLangfuseTraceAttributes } from "./lib/langfuse-attributes";
import {
  runWithLangfuseRootTrace,
  shutdownLangfuseObservability,
} from "./lib/langfuse-runtime";
import {
  type CompletedSupervisorOutput,
  type PendingWriteReportReview,
  type SupervisorResumeDecision,
  resumeSupervisorWithOptions,
  superviseResearchWithOptions,
} from "./supervisor/create-supervisor";
import {
  logAgentAnswer,
  logAgentProcessing,
  logCliHeader,
  logPendingReview,
  logProgressEvent,
  logResumeDecision,
} from "./utils/logger";

const CLI_SESSION_ID = randomUUID();

async function runCliTurnWithTracing(userInput: string): Promise<void> {
  logAgentProcessing();

  const threadId = randomUUID();
  const traceAttributes = buildCliLangfuseTraceAttributes(CLI_SESSION_ID, threadId);
  const langfuseHandler = createLangfuseCallbackHandler({
    userId: traceAttributes.userId,
    sessionId: traceAttributes.sessionId,
    tags: traceAttributes.tags,
    traceMetadata: traceAttributes.metadata,
  });

  const response = await runWithLangfuseRootTrace({
    name: "mas-cli-run",
    input: { userInput, threadId },
    userId: traceAttributes.userId,
    sessionId: traceAttributes.sessionId,
    tags: traceAttributes.tags,
    metadata: traceAttributes.metadata,
    task: async () => {
      const initialResponse = await superviseResearchWithOptions(userInput, {
        threadId,
        maxIterations: MAX_ITERATIONS,
        onProgress: logProgressEvent,
        callbacks: langfuseHandler ? [langfuseHandler] : undefined,
      });
      return resolvePendingReview(cliRef!, initialResponse, threadId, langfuseHandler ? [langfuseHandler] : undefined);
    },
    mapOutput: (result) => ({
      finalAnswer: result.finalAnswer,
      iterations: result.iterations,
      wroteReport: result.wroteReport,
      verdict: result.critique?.verdict ?? null,
    }),
  });

  logAgentAnswer(response.finalAnswer);
}

let cliRef: ReturnType<typeof createInterface> | null = null;

async function main(): Promise<void> {
  const cli = createInterface({ input, output });
  cliRef = cli;

  logCliHeader();

  try {
    while (true) {
      const rawUserInput = await askQuestion(cli, "You: ");
      if (rawUserInput === null) {
        break;
      }

      const userInput = rawUserInput.trim();

      if (!userInput) {
        continue;
      }

      const command = userInput.toLowerCase();
      if (["exit", "quit"].includes(command)) {
        break;
      }

      try {
        await runCliTurnWithTracing(userInput);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown application error.";
        console.error(`Application warning: ${message}\n`);
      }
    }
  } finally {
    cliRef = null;
    cli.close();
    await shutdownLangfuseObservability();
    await shutdownLangfuseClient();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown fatal error.";
  console.error(`Application error: ${message}`);
  process.exitCode = 1;
});

async function askQuestion(
  cli: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string | null> {
  try {
    return await cli.question(prompt);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.toLowerCase().includes("readline was closed")) {
      return null;
    }
    throw error;
  }
}

async function resolvePendingReview(
  cli: ReturnType<typeof createInterface>,
  response: Awaited<ReturnType<typeof superviseResearchWithOptions>>,
  threadId: string,
  callbacks?: BaseCallbackHandler[],
): Promise<CompletedSupervisorOutput> {
  let currentResponse = response;

  while (currentResponse.status === "interrupted") {
    logPendingReview(currentResponse.pendingReview);

    const decision = await askForDecision(cli, currentResponse.pendingReview.allowedDecisions);
    if (decision === null) {
      throw new Error("Review flow was interrupted before a decision was provided.");
    }

    const resume = await buildResumeDecision(cli, currentResponse.pendingReview, decision);
    logResumeDecision(decision);

    currentResponse = await resumeSupervisorWithOptions(resume, {
      threadId,
      maxIterations: MAX_ITERATIONS,
      onProgress: logProgressEvent,
      callbacks,
    });
  }

  return currentResponse;
}

async function askForDecision(
  cli: ReturnType<typeof createInterface>,
  allowedDecisions: string[],
): Promise<"approve" | "edit" | "reject" | null> {
  const allowed = new Set(allowedDecisions.map((item) => item.trim().toLowerCase()));

  while (true) {
    const rawDecision = await askQuestion(cli, "Review decision (approve/edit/reject): ");
    if (rawDecision === null) {
      return null;
    }

    const normalized = rawDecision.trim().toLowerCase();
    if (
      (normalized === "approve" || normalized === "edit" || normalized === "reject")
      && allowed.has(normalized)
    ) {
      return normalized;
    }

    console.log(`Unsupported decision. Allowed: ${allowedDecisions.join(", ")}\n`);
  }
}

async function buildResumeDecision(
  cli: ReturnType<typeof createInterface>,
  review: PendingWriteReportReview,
  decision: "approve" | "edit" | "reject",
): Promise<SupervisorResumeDecision> {
  if (decision === "approve") {
    return { type: "approve" };
  }

  if (decision === "reject") {
    const reason = await askQuestion(cli, "Optional rejection reason: ");
    return {
      type: "reject",
      message: reason?.trim() || "Report write rejected by the user.",
    };
  }

  console.log(`Provide revision feedback for "${review.filename}".`);
  console.log("The Supervisor will restart the full cycle on the same thread and ask for approval again.");
  while (true) {
    const feedback = await askQuestion(cli, "Your feedback: ");
    if (feedback === null) {
      throw new Error("Review flow was interrupted before revision feedback was provided.");
    }

    const normalizedFeedback = feedback.trim();
    if (!normalizedFeedback) {
      console.log("Feedback cannot be empty.\n");
      continue;
    }

    return {
      type: "edit",
      feedback: normalizedFeedback,
    };
  }
}
