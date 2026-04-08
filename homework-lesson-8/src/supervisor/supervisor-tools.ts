import { tool } from "langchain";
import { z } from "zod";
import { critique } from "../agents/critic";
import { planResearch } from "../agents/planner";
import { research } from "../agents/researcher";
import { CritiqueResultSchema } from "../schemas/critique-result";
import { ResearchPlanSchema } from "../schemas/research-plan";

export const planResearchTool = tool(
  async ({ userRequest }) => JSON.stringify(await planResearch(userRequest), null, 2),
  {
    name: "plan_research",
    description: "Create a structured research plan for the user's request. Must be called first.",
    schema: z.object({
      userRequest: z.string().trim().min(1).describe("Original user request to plan."),
    }),
  },
);

export const runResearchTool = tool(
  async ({ userRequest, plan, critiqueFeedback }) =>
    research({
      userRequest,
      plan: ResearchPlanSchema.parse(plan),
      critiqueFeedback,
    }),
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
  async ({ userRequest, findings }) => JSON.stringify(await critique({ userRequest, findings }), null, 2),
  {
    name: "critique_findings",
    description: "Review research findings for freshness, completeness, and structure. Returns a structured critique verdict.",
    schema: z.object({
      userRequest: z.string().trim().min(1).describe("Original user request."),
      findings: z.string().trim().min(1).describe("Findings produced by run_research."),
    }),
  },
);

export const supervisorTools = [planResearchTool, runResearchTool, critiqueFindingsTool];

export function parsePlanToolResult(raw: string) {
  return ResearchPlanSchema.parse(JSON.parse(raw) as unknown);
}

export function parseCritiqueToolResult(raw: string) {
  return CritiqueResultSchema.parse(JSON.parse(raw) as unknown);
}
