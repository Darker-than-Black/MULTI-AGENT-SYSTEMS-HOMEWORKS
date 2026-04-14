import { HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { getPlannerRecursionLimit } from "../config/agent-policy";
import { PLANNER_SYSTEM_PROMPT } from "../config/prompts";
import { ResearchPlanSchema, type ResearchPlan } from "../schemas/research-plan";
import { knowledgeSearchTool, webSearchTool } from "../tools/langchain-tools";
import { createDefaultChatModel, type AgentToolSet } from "./shared";

let plannerAgent: ReturnType<typeof createAgent> | null = null;

interface CreatePlannerAgentOptions {
  tools?: AgentToolSet;
}

const defaultPlannerTools: AgentToolSet = [webSearchTool, knowledgeSearchTool];

export function createPlannerAgent(options: CreatePlannerAgentOptions = {}) {
  const hasOverrides = options.tools !== undefined;
  if (!hasOverrides && plannerAgent) {
    return plannerAgent;
  }

  const agent = createAgent({
    model: createDefaultChatModel(),
    systemPrompt: PLANNER_SYSTEM_PROMPT.trim(),
    tools: options.tools ?? defaultPlannerTools,
    responseFormat: ResearchPlanSchema,
  });

  if (!hasOverrides) {
    plannerAgent = agent;
  }

  return agent;
}

interface PlanResearchOptions {
  agent?: ReturnType<typeof createAgent>;
}

export async function planResearch(
  userRequest: string,
  options: PlanResearchOptions = {},
): Promise<ResearchPlan> {
  const normalizedRequest = userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Planner request cannot be empty.");
  }

  const planner = options.agent ?? createPlannerAgent();
  const result = await planner.invoke(
    { messages: [new HumanMessage(normalizedRequest)] },
    { recursionLimit: getPlannerRecursionLimit() },
  );

  if (!("structuredResponse" in result) || result.structuredResponse === undefined) {
    throw new Error("Planner did not return structured output.");
  }

  return ResearchPlanSchema.parse(result.structuredResponse);
}
