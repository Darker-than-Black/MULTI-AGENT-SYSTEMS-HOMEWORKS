import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { webSearchTool, readUrlTool, knowledgeSearchTool } from "../tools/langchain-tools.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MODEL_NAME, TEMPERATURE, OPENAI_API_KEY } from "../config/env.js";
import { CritiqueResultSchema } from "../schemas.js";

const llm = new ChatOpenAI({
  model: MODEL_NAME,
  temperature: TEMPERATURE,
  apiKey: OPENAI_API_KEY,
});

const criticPrompt = `You are a Critic Agent. 
Your goal is to evaluate the quality of research findings by doing independent verification.
You MUST check if the information is fresh, complete, and logically structured.
Use your tools to spot-check facts and verify freshness.
Return the result structured as a CritiqueResult.`;

export const criticAgent = createReactAgent({
  llm,
  tools: [webSearchTool, readUrlTool, knowledgeSearchTool],
  stateModifier: criticPrompt,
  responseFormat: CritiqueResultSchema,
});

export const critiqueTool = tool(
  async (input, config) => {
    const result = await criticAgent.invoke({ messages: [{ role: "user", content: `Evaluate these findings:\n${input.findings}` }] }, config);
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage.content;
  },
  {
    name: "critique",
    description: "Critique research findings for freshness and accuracy.",
    schema: z.object({
      findings: z.string().describe("The research findings to critique"),
    }),
  }
);
