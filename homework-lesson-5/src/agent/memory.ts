import { SYSTEM_PROMPT } from "./prompt.js";
import { truncateText } from "../utils/truncate.js";
import type { AgentMessage, ToolCall, ToolMessage } from "./types.js";
import { MAX_MESSAGE_CONTENT_CHARS, MAX_SESSION_MESSAGES } from "../config/env.js";

export interface SessionMemory {
  messages: AgentMessage[];
}

export function createInitialMemory(): AgentMessage[] {
  return [{ role: "system", content: SYSTEM_PROMPT.trim() }];
}

export function createSessionMemory(): SessionMemory {
  return {
    messages: createInitialMemory(),
  };
}

export function appendUserMessage(messages: AgentMessage[], content: string): AgentMessage[] {
  messages.push({ role: "user", content });
  enforceMemoryBudget(messages);
  return messages;
}

export function appendAssistantMessage(messages: AgentMessage[], content: string, toolCalls?: ToolCall[]): AgentMessage[] {
  const message = { role: "assistant" as const, content, toolCalls: toolCalls?.length ? toolCalls : [] };
  messages.push(message);
  enforceMemoryBudget(messages);
  return messages;
}

export function appendToolMessage(messages: AgentMessage[], message: ToolMessage): AgentMessage[] {
  messages.push(message);
  enforceMemoryBudget(messages);
  return messages;
}

function enforceMemoryBudget(messages: AgentMessage[]): void {
  const systemMessage = messages.find((message) => message.role === "system") || {
    role: "system" as const,
    content: SYSTEM_PROMPT.trim(),
  };

  const nonSystem = messages.filter((message) => message.role !== "system");
  const allowedNonSystem = Math.max(MAX_SESSION_MESSAGES - 1, 1);
  const sliced = nonSystem.slice(-allowedNonSystem).map(truncateMessageContent);

  messages.splice(0, messages.length, systemMessage, ...sliced);
}

function truncateMessageContent(message: AgentMessage): AgentMessage {
  if (["tool", "assistant", "user"].includes(message.role)) {
    return {
      ...message,
      content: truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS),
    };
  }

  return message;
}
