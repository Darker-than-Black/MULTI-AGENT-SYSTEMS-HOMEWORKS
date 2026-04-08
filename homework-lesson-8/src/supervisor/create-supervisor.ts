import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import type { ToolExecutionTrace } from "../agent/types";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import { SUPERVISOR_SYSTEM_PROMPT } from "../config/prompts";
import type { CritiqueResult } from "../schemas/critique-result";
import type { ResearchPlan } from "../schemas/research-plan";
import {
  parseCritiqueToolResult,
  parsePlanToolResult,
  supervisorTools,
} from "./supervisor-tools";
import { buildToolExecutionTrace, stringifyMessageContent } from "../utils/agent-trace";

export interface RunSupervisorOutput {
  finalAnswer: string;
  iterations: number;
  toolExecutions: ToolExecutionTrace[];
  plan: ResearchPlan | null;
  critique: CritiqueResult | null;
}

export function createSupervisorAgent() {
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
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT.trim(),
    tools: supervisorTools,
  });
}

export async function superviseResearch(userRequest: string): Promise<RunSupervisorOutput> {
  const normalizedRequest = userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Supervisor userRequest cannot be empty.");
  }

  const supervisor = createSupervisorAgent();
  const result = await supervisor.invoke(
    { messages: [new HumanMessage(normalizedRequest)] },
    { recursionLimit: 24 },
  );

  const assistantMessages = result.messages.filter((message) => message.getType() === "ai");
  const toolMessages = result.messages.filter((message) => message.getType() === "tool");
  const lastAssistant = assistantMessages.at(-1);
  const finalAnswer = lastAssistant ? stringifyMessageContent(lastAssistant.content).trim() : "";

  return {
    finalAnswer: finalAnswer || "Supervisor returned an empty response.",
    iterations: assistantMessages.length || 1,
    toolExecutions: buildToolExecutionTrace(result.messages),
    plan: findLatestPlan(toolMessages),
    critique: findLatestCritique(toolMessages),
  };
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
