import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { getPlannerRecursionLimit } from "../config/agent-policy";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import {
  mergeLangfusePromptMetadata,
  type LangChainInvokeOptions,
} from "../lib/langfuse-context";
import { resolveSystemPrompt } from "../lib/langfuse-prompts";
import { runWithLangfuseObservation } from "../lib/langfuse-runtime";
import { ResearchPlanSchema, type ResearchPlan } from "../schemas/research-plan";
import { knowledgeSearchTool, webSearchTool } from "../tools/langchain-tools";

export async function createPlannerAgent() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const systemPrompt = await resolveSystemPrompt("planner");
  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  const agent = createAgent({
    model,
    systemPrompt: systemPrompt.content.trim(),
    tools: [webSearchTool, knowledgeSearchTool],
    responseFormat: ResearchPlanSchema,
  });

  return {
    agent,
    prompt: systemPrompt.prompt,
  };
}

export async function planResearch(
  userRequest: string,
  options: LangChainInvokeOptions = {},
): Promise<ResearchPlan> {
  const normalizedRequest = userRequest.trim();
  if (!normalizedRequest) {
    throw new Error("Planner request cannot be empty.");
  }

  return runWithLangfuseObservation({
    name: "planner",
    input: { userRequest: normalizedRequest },
    task: async () => {
      const { agent, prompt } = await createPlannerAgent();
      const result = await agent.invoke(
        { messages: [new HumanMessage(normalizedRequest)] },
        {
          recursionLimit: getPlannerRecursionLimit(),
          callbacks: options.callbacks,
          metadata: mergeLangfusePromptMetadata(options.metadata, prompt),
        },
      );

      if (!("structuredResponse" in result) || result.structuredResponse === undefined) {
        throw new Error("Planner did not return structured output.");
      }

      return ResearchPlanSchema.parse(result.structuredResponse);
    },
    mapOutput: (plan) => ({
      goal: plan.goal,
      searchQueries: plan.searchQueries,
      sourcesToCheck: plan.sourcesToCheck,
    }),
  });
}
