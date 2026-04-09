import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MAX_ITERATIONS } from "./config/env";
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

async function main(): Promise<void> {
  const cli = createInterface({ input, output });

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
        logAgentProcessing();
        const threadId = randomUUID();
        const initialResponse = await superviseResearchWithOptions(userInput, {
          threadId,
          maxIterations: MAX_ITERATIONS,
          onProgress: logProgressEvent,
        });
        const response = await resolvePendingReview(cli, initialResponse, threadId);

        logAgentAnswer(response.finalAnswer);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown application error.";
        console.error(`Application warning: ${message}\n`);
      }
    }
  } finally {
    cli.close();
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

  const feedback = await askMultilineInput(
    cli,
    [
      `Provide revision feedback for "${review.filename}".`,
      "The Supervisor will restart the full pipeline and regenerate the report.",
      "Finish with a single line containing EOF.",
    ].join("\n"),
  );
  if (feedback === null) {
    throw new Error("Review flow was interrupted before revision feedback was provided.");
  }

  return {
    type: "edit",
    feedback: feedback.trim(),
  };
}

async function askMultilineInput(
  cli: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string | null> {
  console.log(prompt);
  const lines: string[] = [];

  while (true) {
    const line = await askQuestion(cli, "");
    if (line === null) {
      return null;
    }

    if (line.trim() === "EOF") {
      break;
    }

    lines.push(line);
  }

  return lines.join("\n");
}
