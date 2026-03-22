import { SYSTEM_PROMPT } from "./prompt.js";
import type { AgentMessage } from "./types.js";

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
): AgentMessage[] {
  messages.push({ role: "assistant", content });
  return messages;
}
