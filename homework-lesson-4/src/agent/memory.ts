import { SYSTEM_PROMPT } from "./prompt.js";
import type { AgentMessage, ToolCall } from "./types.js";

export function createInitialMemory(): AgentMessage[] {
  return [{ role: "system", content: SYSTEM_PROMPT.trim() }];
}

export function appendUserMessage(
  messages: AgentMessage[],
  content: string,
): AgentMessage[] {
  messages.push({ role: "user", content });
  return messages;
}

export function appendAssistantMessage(
  messages: AgentMessage[],
  content: string,
  toolCalls?: ToolCall[],
): AgentMessage[] {
  const message =
    toolCalls && toolCalls.length > 0
      ? { role: "assistant" as const, content, toolCalls }
      : { role: "assistant" as const, content };
  messages.push(message);
  return messages;
}
