import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env.js";
import { PLANNER_SYSTEM_PROMPT } from "../config/prompts.js";
import { ResearchPlanSchema, type ResearchPlan } from "../schemas/research-plan.js";
import {knowledgeSearchTool, webSearchTool} from "../tools/langchain-tools.js";

export function createPlannerAgent() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  return createAgent({
    model,
    systemPrompt: PLANNER_SYSTEM_PROMPT.trim(),
    tools: [webSearchTool, knowledgeSearchTool],
    responseFormat: ResearchPlanSchema,
  });
}

export async function planResearch(userRequest: string): Promise<ResearchPlan> {
  const normalizedRequest = userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Planner request cannot be empty.");
  }

  const planner = createPlannerAgent();
  const result = await planner.invoke(
    { messages: [new HumanMessage(normalizedRequest)] },
    { recursionLimit: 10 },
  );

  if (!("structuredResponse" in result) || result.structuredResponse === undefined) {
    throw new Error("Planner did not return structured output.");
  }

  return ResearchPlanSchema.parse(result.structuredResponse);
}
