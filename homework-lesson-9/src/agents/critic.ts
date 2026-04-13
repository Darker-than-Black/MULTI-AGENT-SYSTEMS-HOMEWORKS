import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { getCriticRecursionLimit } from "../config/agent-policy";
import { CritiqueResultSchema, type CritiqueResult } from "../schemas/critique-result";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import { CRITIC_SYSTEM_PROMPT } from "../config/prompts";
import type { ResearchPlan } from "../schemas/research-plan";
import { knowledgeSearchTool, readUrlTool, webSearchTool } from "../tools/langchain-tools";

export interface CritiqueInput {
  userRequest: string;
  findings: string;
  plan: ResearchPlan;
}

let criticAgent: ReturnType<typeof createAgent> | null = null;

export function createCriticAgent() {
  if (criticAgent) {
    return criticAgent;
  }

  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-9/.env.");
  }

  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  criticAgent = createAgent({
    model,
    systemPrompt: CRITIC_SYSTEM_PROMPT.trim(),
    tools: [webSearchTool, readUrlTool, knowledgeSearchTool],
    responseFormat: CritiqueResultSchema,
  });

  return criticAgent;
}

export async function critique(input: CritiqueInput): Promise<CritiqueResult> {
  const normalizedRequest = input.userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Critic userRequest cannot be empty.");
  }

  const normalizedFindings = input.findings.trim();
  if (!normalizedFindings) {
    throw new Error("Critic findings cannot be empty.");
  }

  const normalizedPlan = input.plan;
  const critic = createCriticAgent();
  const result = await critic.invoke(
    { messages: [new HumanMessage(buildCritiquePrompt(normalizedRequest, normalizedFindings, normalizedPlan))] },
    { recursionLimit: getCriticRecursionLimit() },
  );

  if (!("structuredResponse" in result) || result.structuredResponse === undefined) {
    throw new Error("Critic did not return structured output.");
  }

  return CritiqueResultSchema.parse(result.structuredResponse);
}

function buildCritiquePrompt(userRequest: string, findings: string, plan: ResearchPlan): string {
  return [
    `Original user request:\n${userRequest}`,
    `Research plan goal:\n${plan.goal}`,
    `Research plan search queries:\n${plan.searchQueries.map((query, index) => `${index + 1}. ${query}`).join("\n")}`,
    `Research plan sources:\n${plan.sourcesToCheck.join(", ")}`,
    `Research plan desired output:\n${plan.outputFormat}`,
    `Research findings to review:\n${findings}`,
    "Task:\nReview whether the findings are sufficient for the original user request and the agreed research plan. Verify the most important gaps with tools when needed, then return a structured critique result.",
  ].join("\n\n");
}
