import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { getCriticRecursionLimit } from "../config/agent-policy";
import { CritiqueResultSchema, type CritiqueResult } from "../schemas/critique-result";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import {
  mergeLangfusePromptMetadata,
  type LangChainInvokeOptions,
} from "../lib/langfuse-context";
import { resolveSystemPrompt } from "../lib/langfuse-prompts";
import { runWithLangfuseObservation } from "../lib/langfuse-runtime";
import { knowledgeSearchTool, readUrlTool, webSearchTool } from "../tools/langchain-tools";

export interface CritiqueInput {
  userRequest: string;
  findings: string;
}

export async function createCriticAgent() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const systemPrompt = await resolveSystemPrompt("critic");
  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  const agent = createAgent({
    model,
    systemPrompt: systemPrompt.content.trim(),
    tools: [webSearchTool, readUrlTool, knowledgeSearchTool],
    responseFormat: CritiqueResultSchema,
  });

  return {
    agent,
    prompt: systemPrompt.prompt,
  };
}

export async function critique(
  input: CritiqueInput,
  options: LangChainInvokeOptions = {},
): Promise<CritiqueResult> {
  const normalizedRequest = input.userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Critic userRequest cannot be empty.");
  }

  const normalizedFindings = input.findings.trim();
  if (!normalizedFindings) {
    throw new Error("Critic findings cannot be empty.");
  }

  return runWithLangfuseObservation({
    name: "critic",
    input: {
      userRequest: normalizedRequest,
      findingsLength: normalizedFindings.length,
    },
    task: async () => {
      const { agent, prompt } = await createCriticAgent();
      const result = await agent.invoke(
        { messages: [new HumanMessage(buildCritiquePrompt(normalizedRequest, normalizedFindings))] },
        {
          recursionLimit: getCriticRecursionLimit(),
          callbacks: options.callbacks,
          metadata: mergeLangfusePromptMetadata(options.metadata, prompt),
        },
      );

      if (!("structuredResponse" in result) || result.structuredResponse === undefined) {
        throw new Error("Critic did not return structured output.");
      }

      return CritiqueResultSchema.parse(result.structuredResponse);
    },
    mapOutput: (result) => ({
      verdict: result.verdict,
      isFresh: result.isFresh,
      isComplete: result.isComplete,
      isWellStructured: result.isWellStructured,
      revisionRequests: result.revisionRequests,
    }),
  });
}

function buildCritiquePrompt(userRequest: string, findings: string): string {
  return [
    `Original user request:\n${userRequest}`,
    `Research findings to review:\n${findings}`,
    "Task:\nReview whether the findings are sufficient for the original request. Verify the most important gaps with tools when needed, then return a structured critique result.",
  ].join("\n\n");
}
