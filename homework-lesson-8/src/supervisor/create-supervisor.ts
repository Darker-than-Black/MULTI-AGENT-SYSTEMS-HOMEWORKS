import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import {
  createAgent,
  humanInTheLoopMiddleware,
  type HITLRequest,
  type HITLResponse,
} from "langchain";
import type { ToolExecutionTrace } from "../agent/types";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import { SUPERVISOR_SYSTEM_PROMPT } from "../config/prompts";
import type { CritiqueResult } from "../schemas/critique-result";
import type { ResearchPlan } from "../schemas/research-plan";
import { setToolProgressLogger } from "../tools/langchain-tools";
import {
  parseCritiqueToolResult,
  parsePlanToolResult,
  setSupervisorProgressLogger,
  supervisorTools,
} from "./supervisor-tools";
import { buildToolExecutionTrace, stringifyMessageContent } from "../utils/agent-trace";
import type { ProgressLogger } from "../utils/logger";

type AllowedDecision = "approve" | "edit" | "reject";
const MAX_RESEARCH_REVISIONS = 2;
const MAX_CRITIQUE_PASSES = MAX_RESEARCH_REVISIONS + 1;

interface SupervisorBaseOutput {
  finalAnswer: string;
  iterations: number;
  toolExecutions: ToolExecutionTrace[];
  plan: ResearchPlan | null;
  critique: CritiqueResult | null;
  wroteReport: boolean;
}

export interface PendingWriteReportReview {
  actionName: "write_report";
  filename: string;
  content: string;
  description?: string;
  allowedDecisions: AllowedDecision[];
}

export interface CompletedSupervisorOutput extends SupervisorBaseOutput {
  status: "completed";
  pendingReview: null;
}

export interface InterruptedSupervisorOutput extends SupervisorBaseOutput {
  status: "interrupted";
  pendingReview: PendingWriteReportReview;
}

export type RunSupervisorOutput = CompletedSupervisorOutput | InterruptedSupervisorOutput;

export interface RunSupervisorOptions {
  threadId: string;
  maxIterations?: number;
  onProgress?: ProgressLogger;
}

export type SupervisorResumeDecision =
  | { type: "approve" }
  | { type: "edit"; feedback: string }
  | { type: "reject"; message?: string };

interface PendingReviewState {
  originalUserRequest: string;
}

let supervisorAgent: ReturnType<typeof createAgent> | null = null;
const supervisorCheckpointer = new MemorySaver();
const pendingReviewStates = new Map<string, PendingReviewState>();
const hitlMiddleware = humanInTheLoopMiddleware({
  interruptOn: {
    write_report: {
      allowedDecisions: ["approve", "edit", "reject"],
      description: (toolCall) => {
        const filename = toNonEmptyString(toolCall.args?.filename) || "report.md";
        return `Review the markdown report before saving it to ${filename}.`;
      },
    },
  },
});

export function createSupervisorAgent() {
  if (supervisorAgent) {
    return supervisorAgent;
  }

  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  supervisorAgent = createAgent({
    model,
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT.trim(),
    tools: supervisorTools,
    middleware: [hitlMiddleware],
    checkpointer: supervisorCheckpointer,
  });

  return supervisorAgent;
}

export async function superviseResearchWithOptions(
  userRequest: string,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  const normalizedRequest = userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Supervisor userRequest cannot be empty.");
  }

  options.onProgress?.({
    scope: "supervisor",
    phase: "start",
    message: "Supervisor started",
  });

  const result = await invokeSupervisor(
    { messages: [new HumanMessage(normalizedRequest)] },
    options,
  );

  return continueSupervisorWorkflow(result, options);
}

export async function resumeSupervisorWithOptions(
  resume: SupervisorResumeDecision,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  options.onProgress?.({
    scope: "supervisor",
    phase: "info",
    message: "Supervisor resumed",
    detail: `thread_id=${options.threadId}`,
  });

  if (resume.type === "edit") {
    return restartSupervisorWorkflowWithFeedback(resume.feedback, options);
  }

  const result = await invokeSupervisor(
    new Command({ resume: toHITLResponse(resume) }),
    options,
  );

  if (result.status === "completed") {
    pendingReviewStates.delete(options.threadId.trim());
  }

  return result;
}

async function continueSupervisorWorkflow(
  initialResult: RunSupervisorOutput,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  let result = initialResult;

  while (result.status === "completed" && shouldContinueRevisionCycle(result)) {
    options.onProgress?.({
      scope: "supervisor",
      phase: "info",
      message: "Supervisor is continuing the revision cycle",
      detail: "Critic returned REVISE and revision rounds are still available.",
    });

    result = await requestRevisionContinuation(result, options);
  }

  if (result.status === "completed" && shouldRequestWriteReportReview(result)) {
    return requestWriteReportReview(result, options);
  }

  return result;
}

async function invokeSupervisor(
  input: { messages: HumanMessage[] } | Command,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  const threadId = options.threadId.trim();
  if (!threadId) {
    throw new Error("Supervisor threadId cannot be empty.");
  }

  const supervisor = createSupervisorAgent();
  const recursionLimit = Math.max(30, (options.maxIterations ?? 4) * 7);

  setToolProgressLogger(options.onProgress);
  setSupervisorProgressLogger(options.onProgress);

  try {
    const result = await supervisor.invoke(
      input,
      {
        recursionLimit,
        configurable: {
          thread_id: threadId,
        },
      },
    );

    const assistantMessages = result.messages.filter(
      (message: typeof result.messages[number]) => message.getType() === "ai",
    );
    const toolMessages = result.messages.filter(
      (message: typeof result.messages[number]) => message.getType() === "tool",
    );
    const lastAssistant = assistantMessages.at(-1);
    const finalAnswer = lastAssistant ? stringifyMessageContent(lastAssistant.content).trim() : "";
    const originalUserRequest = findOriginalUserRequest(result.messages);
    const pendingReview = findPendingWriteReportReview((result as { __interrupt__?: unknown }).__interrupt__);
    const baseOutput: SupervisorBaseOutput = {
      finalAnswer: finalAnswer || pendingReview?.content || "Supervisor returned an empty response.",
      iterations: assistantMessages.length || 1,
      toolExecutions: buildToolExecutionTrace(result.messages),
      plan: findLatestPlan(toolMessages),
      critique: findLatestCritique(toolMessages),
      wroteReport: didWriteReport(toolMessages),
    };

    if (pendingReview) {
      if (shouldContinueRevisionCycle(baseOutput)) {
        options.onProgress?.({
          scope: "supervisor",
          phase: "info",
          message: "Supervisor blocked premature human review",
          detail: "Critic still requires another revision round before write_report is allowed. Redirecting to Researcher.",
        });

        if (!baseOutput.plan) {
          throw new Error("Supervisor cannot continue revision cycle without an existing research plan.");
        }

        return invokeSupervisor(
          new Command({
            resume: {
              decisions: [
                {
                  type: "edit",
                  editedAction: {
                    name: "run_research",
                    args: {
                      userRequest: originalUserRequest,
                      plan: baseOutput.plan,
                      critiqueFeedback: baseOutput.critique?.revisionRequests ?? [],
                    },
                  },
                },
              ],
            },
          }),
          options,
        );
      }

      options.onProgress?.({
        scope: "supervisor",
        phase: "info",
        message: "Waiting for human review",
        detail: pendingReview.filename,
      });

      pendingReviewStates.set(threadId, {
        originalUserRequest,
      });

      return {
        ...baseOutput,
        status: "interrupted",
        pendingReview,
      };
    }

    options.onProgress?.({
      scope: "supervisor",
      phase: "success",
      message: "Supervisor finished",
      detail: `${assistantMessages.length || 1} iteration(s)`,
    });

    return {
      ...baseOutput,
      status: "completed",
      pendingReview: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown supervisor error.";
    options.onProgress?.({
      scope: "supervisor",
      phase: "error",
      message: "Supervisor failed",
      detail: message,
    });
    throw error;
  } finally {
    setToolProgressLogger(undefined);
    setSupervisorProgressLogger(undefined);
  }
}

async function requestWriteReportReview(
  completedResult: CompletedSupervisorOutput,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  options.onProgress?.({
    scope: "supervisor",
    phase: "info",
    message: "Supervisor skipped write_report",
    detail: "Forcing report-save review on the same thread.",
  });

  const followUpPrompt = [
    "Before finishing, you must call write_report exactly once.",
    "Use the final markdown answer you already prepared as the report content.",
    "Choose a sensible markdown filename.",
    "Do not redo research or critique. Only save the final report, then finish.",
    "",
    "Final markdown answer to save:",
    completedResult.finalAnswer,
  ].join("\n");

  return invokeSupervisor(
    { messages: [new HumanMessage(followUpPrompt)] },
    options,
  );
}

async function requestRevisionContinuation(
  completedResult: CompletedSupervisorOutput,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  const critique = completedResult.critique;
  const revisionRequests = critique?.revisionRequests ?? [];
  const followUpPrompt = [
    "Continue the mandatory supervisor workflow.",
    "The latest Critic verdict is REVISE and you still have revision rounds available.",
    "Do not call write_report yet.",
    "Call run_research again with the same user request and plan, passing the latest revision requests.",
    "Then call critique_findings again on the revised findings.",
    "",
    "Latest revision requests:",
    revisionRequests.length > 0
      ? revisionRequests.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "No explicit revision requests were parsed. Re-run research to improve completeness and structure before calling Critic again.",
  ].join("\n");

  return invokeSupervisor(
    { messages: [new HumanMessage(followUpPrompt)] },
    options,
  );
}

async function restartSupervisorWorkflowWithFeedback(
  feedback: string,
  options: RunSupervisorOptions,
): Promise<RunSupervisorOutput> {
  const threadId = options.threadId.trim();
  const pendingState = pendingReviewStates.get(threadId);
  if (!pendingState) {
    throw new Error(`No pending review state found for thread_id=${threadId}.`);
  }

  const normalizedFeedback = feedback.trim();
  if (!normalizedFeedback) {
    throw new Error("Supervisor edit feedback cannot be empty.");
  }

  options.onProgress?.({
    scope: "supervisor",
    phase: "info",
    message: "Supervisor restarted the full workflow",
    detail: "Human review requested changes to the report draft.",
  });

  await invokeSupervisor(
    new Command({
      resume: {
        decisions: [
          {
            type: "reject",
            message: "Human review requested report changes. Do not save the current draft.",
          },
        ],
      },
    }),
    options,
  );

  const rerunPrompt = buildFullWorkflowRevisionPrompt(
    pendingState.originalUserRequest,
    normalizedFeedback,
  );

  pendingReviewStates.delete(threadId);

  const result = await invokeSupervisor(
    { messages: [new HumanMessage(rerunPrompt)] },
    options,
  );

  return continueSupervisorWorkflow(result, options);
}

function toHITLResponse(
  decision: Exclude<SupervisorResumeDecision, { type: "edit" }>,
): HITLResponse {
  if (decision.type === "reject") {
    return {
      decisions: [
        {
          type: "reject",
          message: decision.message?.trim() || "Report write rejected by the user.",
        },
      ],
    };
  }

  return {
    decisions: [{ type: "approve" }],
  };
}

function buildFullWorkflowRevisionPrompt(
  originalUserRequest: string,
  feedback: string,
): string {
  return [
    "Restart the full mandatory supervisor workflow from the beginning.",
    "Do not reuse the previous report draft as final output.",
    "Run the entire sequence again: plan_research -> run_research -> critique_findings.",
    "Use the human review feedback below as an additional requirement for the next run.",
    "After the workflow is complete, call write_report again with a revised markdown report.",
    "",
    `Original user request:\n${originalUserRequest}`,
    `Human review feedback:\n${feedback}`,
  ].join("\n\n");
}

function shouldContinueRevisionCycle(result: SupervisorBaseOutput): boolean {
  if (result.wroteReport) {
    return false;
  }

  if (result.critique?.verdict !== "REVISE") {
    return false;
  }

  return countToolExecutions(result.toolExecutions, "critique_findings(") < MAX_CRITIQUE_PASSES;
}

function shouldRequestWriteReportReview(result: CompletedSupervisorOutput): boolean {
  if (result.wroteReport) {
    return false;
  }

  if (!result.critique) {
    return true;
  }

  if (result.critique.verdict === "APPROVE") {
    return true;
  }

  return countToolExecutions(result.toolExecutions, "critique_findings(") >= MAX_CRITIQUE_PASSES;
}

function countToolExecutions(toolExecutions: ToolExecutionTrace[], callPrefix: string): number {
  return toolExecutions.filter((execution) => execution.call.startsWith(callPrefix)).length;
}

function findOriginalUserRequest(
  messages: Array<{ getType: () => string; content?: unknown }>,
): string {
  for (const message of messages) {
    if (message.getType() !== "human") {
      continue;
    }

    const content = stringifyMessageContent(message.content).trim();
    if (content) {
      return content;
    }
  }

  throw new Error("Supervisor could not recover the original user request from message history.");
}

function findPendingWriteReportReview(rawInterrupts: unknown): PendingWriteReportReview | null {
  const interrupts = Array.isArray(rawInterrupts) ? rawInterrupts : [];

  for (const interrupt of interrupts) {
    const request = extractInterruptValue(interrupt);
    if (!request) {
      continue;
    }

    const actionRequest = request.actionRequests.find((action) => action.name === "write_report");
    if (!actionRequest) {
      continue;
    }

    const reviewConfig = request.reviewConfigs.find(
      (config) => config.actionName === "write_report",
    );

    return {
      actionName: "write_report",
      filename: toNonEmptyString(actionRequest.args.filename) || "report.md",
      content: toNonEmptyString(actionRequest.args.content),
      description: actionRequest.description,
      allowedDecisions: (reviewConfig?.allowedDecisions ?? ["approve", "edit", "reject"]) as AllowedDecision[],
    };
  }

  return null;
}

function extractInterruptValue(rawInterrupt: unknown): HITLRequest | null {
  if (typeof rawInterrupt !== "object" || rawInterrupt === null || !("value" in rawInterrupt)) {
    return null;
  }

  const value = (rawInterrupt as { value?: unknown }).value;
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const actionRequests = (value as { actionRequests?: unknown }).actionRequests;
  const reviewConfigs = (value as { reviewConfigs?: unknown }).reviewConfigs;
  if (!Array.isArray(actionRequests) || !Array.isArray(reviewConfigs)) {
    return null;
  }

  return value as HITLRequest;
}

function didWriteReport(toolMessages: Array<{ name?: string; content: unknown }>): boolean {
  for (const toolMessage of toolMessages) {
    if (toolMessage.name !== "write_report") {
      continue;
    }

    const normalized = stringifyMessageContent(toolMessage.content);
    if (normalized.includes("Report saved to")) {
      return true;
    }
  }

  return false;
}

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function findLatestPlan(toolMessages: Array<{ name?: string; content: unknown }>): ResearchPlan | null {
  for (const toolMessage of [...toolMessages].reverse()) {
    if (toolMessage.name !== "plan_research") {
      continue;
    }

    try {
      return parsePlanToolResult(stringifyMessageContent(toolMessage.content));
    } catch {
      return null;
    }
  }

  return null;
}

function findLatestCritique(
  toolMessages: Array<{ name?: string; content: unknown }>,
): CritiqueResult | null {
  for (const toolMessage of [...toolMessages].reverse()) {
    if (toolMessage.name !== "critique_findings") {
      continue;
    }

    try {
      return parseCritiqueToolResult(stringifyMessageContent(toolMessage.content));
    } catch {
      return null;
    }
  }

  return null;
}
