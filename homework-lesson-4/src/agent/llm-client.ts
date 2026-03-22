import type { AgentMessage, LlmTurnResult } from "./types.js";

export interface LlmRequest {
  messages: AgentMessage[];
}

// Mock client for project scaffolding.
export async function requestLlmTurn(input: LlmRequest): Promise<LlmTurnResult> {
  const lastUserMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === "user");

  const content = lastUserMessage
    ? `Mock response for: ${lastUserMessage.content}`
    : "Mock response.";

  return {
    assistantMessage: { role: "assistant", content },
    toolCalls: [],
    isFinal: true,
  };
}
