import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { webSearchTool, readUrlTool, knowledgeSearchTool } from "../tools/langchain-tools.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MODEL_NAME, TEMPERATURE, OPENAI_API_KEY } from "../config/env.js";

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  temperature: Math.max(0.1, TEMPERATURE), // slight randomness for variability
  apiKey: OPENAI_API_KEY,
});

const researchPrompt = `You are a Research Agent. 
Your goal is to execute the given research plan.
Use tools to search the web, read urls, and search the internal knowledge base.
Gather all relevant information and summarize findings clearly.`;

export const researchAgent = createReactAgent({
  llm,
  tools: [webSearchTool, readUrlTool, knowledgeSearchTool],
  stateModifier: researchPrompt,
});

export const researchTool = tool(
  async (input, config) => {
    // Append the feedback if it exists from previous reject
    const content = input.feedback 
        ? `Execute this plan: ${input.plan}\n\nNote previous critique feedback: ${input.feedback}`
        : `Execute this plan: ${input.plan}`;

    const result = await researchAgent.invoke({ messages: [{ role: "user", content }] }, config);
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage.content;
  },
  {
    name: "research",
    description: "Execute a research plan and return findings.",
    schema: z.object({
      plan: z.string().describe("The research plan or task to execute"),
      feedback: z.string().optional().describe("Feedback from previous critique if any"),
    }),
  }
);
