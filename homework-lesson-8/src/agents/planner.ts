import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { webSearchTool, knowledgeSearchTool } from "../tools/langchain-tools.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MODEL_NAME, TEMPERATURE, OPENAI_API_KEY } from "../config/env.js";
import { ResearchPlanSchema } from "../schemas.js";

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  temperature: TEMPERATURE,
  apiKey: OPENAI_API_KEY,
});

const plannerPrompt = `You are a Planner Agent. 
Your goal is to decompose the user's request into a structured research plan.
You can use the provided tools to do a preliminary search to better understand the domain before creating the plan.
Return a structured ResearchPlan with the goal, specific search queries, sources to check, and expected output format.`;

export const plannerAgent = createReactAgent({
  llm,
  tools: [webSearchTool, knowledgeSearchTool],
  stateModifier: plannerPrompt,
  responseFormat: ResearchPlanSchema,
});

export const planTool = tool(
  async (input, config) => {
    const result = await plannerAgent.invoke({ messages: [{ role: "user", content: input.request }] }, config);
    // Since responseFormat was used, the structured output is appended as a tool call payload or directly parsed.
    // Ensure we return the structured plan text. Wait, createReactAgent handles responseFormat by enforcing structure on the final generation.
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage.content;
  },
  {
    name: "plan",
    description: "Decompose a research request into a structured plan.",
    schema: z.object({
      request: z.string().describe("The user's original request"),
    }),
  }
);
