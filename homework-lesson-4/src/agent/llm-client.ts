import { OPENAI_API_KEY } from "../config/env.js";
import type { AgentMessage, LlmTurnResult } from "./types.js";

export interface LlmRequest {
  messages: AgentMessage[];
}

export async function requestLlmTurn(input: LlmRequest): Promise<LlmTurnResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Configure .env before running agent.");
  }

  if (input.messages.length === 0) {
    throw new Error("LLM request requires at least one message.");
  }

  throw new Error("LLM client integration is not implemented yet.");
}
