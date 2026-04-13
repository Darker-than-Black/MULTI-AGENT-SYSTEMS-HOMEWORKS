import { tool } from "langchain";
import { z } from "zod";
import { critique } from "../agents/critic";
import { planResearch } from "../agents/planner";
import { research } from "../agents/researcher";
import { CritiqueResultSchema } from "../schemas/critique-result";
import { ResearchPlanSchema } from "../schemas/research-plan";
import { writeReportTool } from "../tools/langchain-tools";
import type { ProgressLogger } from "../utils/logger";

let progressLogger: ProgressLogger | undefined;

export function setSupervisorProgressLogger(logger?: ProgressLogger): void {
  progressLogger = logger;
}

function emitSupervisorProgress(
  scope: "supervisor" | "planner" | "researcher" | "critic",
  phase: "start" | "success" | "error" | "info",
  message: string,
  detail?: string,
): void {
  progressLogger?.({
    scope,
    phase,
    message,
    detail,
  });
}

export const planResearchTool = tool(
  async ({ userRequest }) => {
    emitSupervisorProgress("planner", "start", "Planner started", userRequest);
    try {
      const result = await planResearch(userRequest);
      emitSupervisorProgress(
        "planner",
        "success",
        "Planner finished",
        `${result.searchQueries.length} search quer${result.searchQueries.length === 1 ? "y" : "ies"}`,
      );
      emitSupervisorProgress("supervisor", "info", "Supervisor routed plan to Researcher");
      return JSON.stringify(result, null, 2);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown planner error.";
      emitSupervisorProgress("planner", "error", "Planner failed", message);
      throw error;
    }
  },
  {
    name: "plan_research",
    description: "Create a structured research plan for the user's request. Must be called first.",
    schema: z.object({
      userRequest: z.string().trim().min(1).describe("Original user request to plan."),
    }),
  },
);

export const runResearchTool = tool(
  async ({ userRequest, plan, critiqueFeedback }) => {
    const normalizedPlan = ResearchPlanSchema.parse(plan);
    const feedbackCount = critiqueFeedback?.length ?? 0;
    emitSupervisorProgress(
      "researcher",
      "start",
      "Researcher started",
      `goal=${normalizedPlan.goal}${feedbackCount > 0 ? `, revisions=${feedbackCount}` : ""}`,
    );

    try {
      const findings = await research({
        userRequest,
        plan: normalizedPlan,
        critiqueFeedback,
      });
      emitSupervisorProgress(
        "researcher",
        "success",
        "Researcher finished",
        `${findings.trim().length} chars`,
      );
      emitSupervisorProgress("supervisor", "info", "Supervisor routed findings to Critic");
      return findings;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown researcher error.";
      emitSupervisorProgress("researcher", "error", "Researcher failed", message);
      throw error;
    }
  },
  {
    name: "run_research",
    description: "Execute the research plan and return evidence-grounded findings. Use critique feedback when a revision is requested.",
    schema: z.object({
      userRequest: z.string().trim().min(1).describe("Original user request."),
      plan: ResearchPlanSchema.describe("Structured research plan returned by plan_research."),
      critiqueFeedback: z.array(z.string().trim().min(1)).optional().describe("Critic revision requests to address in the next research pass."),
    }),
  },
);

export const critiqueFindingsTool = tool(
  async ({ userRequest, findings, plan }) => {
    const normalizedPlan = ResearchPlanSchema.parse(plan);
    emitSupervisorProgress("critic", "start", "Critic started");
    try {
      const result = await critique({ userRequest, findings, plan: normalizedPlan });
      emitSupervisorProgress(
        "critic",
        "success",
        "Critic finished",
        `verdict=${result.verdict}${result.revisionRequests.length > 0 ? `, revisions=${result.revisionRequests.length}` : ""}`,
      );
      if (result.verdict === "REVISE") {
        emitSupervisorProgress(
          "supervisor",
          "info",
          "Supervisor started revision round",
          `Critic returned ${result.verdict}`,
        );
      }
      return JSON.stringify(result, null, 2);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown critic error.";
      emitSupervisorProgress("critic", "error", "Critic failed", message);
      throw error;
    }
  },
  {
    name: "critique_findings",
    description: "Review research findings against the original request and research plan. Returns a structured critique verdict.",
    schema: z.object({
      userRequest: z.string().trim().min(1).describe("Original user request."),
      findings: z.string().trim().min(1).describe("Findings produced by run_research."),
      plan: ResearchPlanSchema.describe("Structured research plan used for the findings under review."),
    }),
  },
);

export const supervisorTools = [
  planResearchTool,
  runResearchTool,
  critiqueFindingsTool,
  writeReportTool,
];

export function parsePlanToolResult(raw: string) {
  return ResearchPlanSchema.parse(JSON.parse(raw) as unknown);
}

export function parseCritiqueToolResult(raw: string) {
  return CritiqueResultSchema.parse(JSON.parse(raw) as unknown);
}
