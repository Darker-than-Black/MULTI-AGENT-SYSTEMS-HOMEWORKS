import { AIMessage, HumanMessage, SystemMessage, trimMessages } from "langchain";
import { resolveSystemPrompt } from "../lib/langfuse-prompts";
import { truncateText } from "../utils/truncate";
import type { AgentMessage } from "./types";
import {
  MAX_MESSAGE_CONTENT_CHARS,
  MAX_SESSION_MESSAGES,
} from "../config/env";

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
    const systemPrompt = await resolveSystemPrompt("researcher");
    trimmed.unshift(new SystemMessage(systemPrompt.content.trim()));
  }

  messages.splice(0, messages.length, ...(trimmed as AgentMessage[]));
}
