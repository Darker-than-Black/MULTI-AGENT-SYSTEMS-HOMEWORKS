import { AIMessage, HumanMessage, SystemMessage, trimMessages } from "langchain";
import { RESEARCH_AGENT_SYSTEM_PROMPT } from "../config/prompts.js";
import { truncateText } from "../utils/truncate.js";
import type { AgentMessage } from "./types.js";
import {
  MAX_MESSAGE_CONTENT_CHARS,
  MAX_SESSION_MESSAGES,
} from "../config/env.js";

export interface SessionMemory {
  messages: AgentMessage[];
}

export function createInitialMemory(): AgentMessage[] {
  return [new SystemMessage(RESEARCH_AGENT_SYSTEM_PROMPT.trim())];
}

export function createSessionMemory(): SessionMemory {
  return {
    messages: createInitialMemory(),
  };
}

export async function appendUserMessage(
  messages: AgentMessage[],
  content: string,
): Promise<AgentMessage[]> {
  messages.push(new HumanMessage(truncateText(content, MAX_MESSAGE_CONTENT_CHARS)));
  await enforceMemoryBudget(messages);
  return messages;
}

export async function appendAssistantMessage(
  messages: AgentMessage[],
  content: string,
): Promise<AgentMessage[]> {
  messages.push(new AIMessage(truncateText(content, MAX_MESSAGE_CONTENT_CHARS)));
  await enforceMemoryBudget(messages);
  return messages;
}

async function enforceMemoryBudget(messages: AgentMessage[]): Promise<void> {
  const trimmed = await trimMessages(messages, {
    maxTokens: Math.max(MAX_SESSION_MESSAGES, 1),
    tokenCounter: (current) => current.length,
    strategy: "last",
    includeSystem: true,
    startOn: "human",
  });

  if (trimmed.length === 0 || trimmed[0].getType() !== "system") {
    trimmed.unshift(new SystemMessage(RESEARCH_AGENT_SYSTEM_PROMPT.trim()));
  }

  messages.splice(0, messages.length, ...(trimmed as AgentMessage[]));
}
