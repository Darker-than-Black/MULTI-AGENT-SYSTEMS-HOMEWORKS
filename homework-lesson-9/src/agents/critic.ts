import { HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { getCriticRecursionLimit } from "../config/agent-policy";
import { CritiqueResultSchema, type CritiqueResult } from "../schemas/critique-result";
import { CRITIC_SYSTEM_PROMPT } from "../config/prompts";
import {
  FindingsEnvelopeSchema,
  type FindingsEnvelope,
} from "../schemas/findings-envelope";
import type { ResearchPlan } from "../schemas/research-plan";
import { knowledgeSearchTool, readUrlTool, webSearchTool } from "../tools/langchain-tools";
import { createDefaultChatModel, type AgentToolSet } from "./shared";

export interface CritiqueInput {
  userRequest: string;
  findings: string | FindingsEnvelope;
  plan: ResearchPlan;
}

let criticAgent: ReturnType<typeof createAgent> | null = null;

interface CreateCriticAgentOptions {
  tools?: AgentToolSet;
}

const defaultCriticTools: AgentToolSet = [webSearchTool, readUrlTool, knowledgeSearchTool];

export function createCriticAgent(options: CreateCriticAgentOptions = {}) {
  const hasOverrides = options.tools !== undefined;
  if (!hasOverrides && criticAgent) {
    return criticAgent;
  }

  const agent = createAgent({
    model: createDefaultChatModel(),
    systemPrompt: CRITIC_SYSTEM_PROMPT.trim(),
    tools: options.tools ?? defaultCriticTools,
    responseFormat: CritiqueResultSchema,
  });

  if (!hasOverrides) {
    criticAgent = agent;
  }

  return agent;
}

interface CritiqueOptions {
  agent?: ReturnType<typeof createAgent>;
}

export async function critique(
  input: CritiqueInput,
  options: CritiqueOptions = {},
): Promise<CritiqueResult> {
  const normalizedRequest = input.userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Critic userRequest cannot be empty.");
  }

  const normalizedFindings = FindingsEnvelopeSchema.parse(
    typeof input.findings === "string"
      ? { markdown: input.findings }
      : input.findings,
  );
  const normalizedPlan = input.plan;
  const critic = options.agent ?? createCriticAgent();
  const result = await critic.invoke(
    {
      messages: [
        new HumanMessage(
          buildCritiquePrompt(normalizedRequest, normalizedFindings.markdown, normalizedPlan),
        ),
      ],
    },
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
