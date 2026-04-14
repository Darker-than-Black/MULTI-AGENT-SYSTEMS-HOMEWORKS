import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";

export type AgentToolSet = NonNullable<Parameters<typeof createAgent>[0]["tools"]>;

export function createDefaultChatModel(): ChatOpenAI {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-9/.env.");
  }

  return new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });
}
