import type { LlmTurnResult, ToolCall } from "./types.js";

export interface ProviderAssistantMessage {
  content: unknown;
  tool_calls?: unknown[];
}

export function adaptProviderAssistantMessage(
  message: ProviderAssistantMessage,
): LlmTurnResult {
  return {
    assistantMessage: {
      role: "assistant",
      content: normalizeAssistantText(message.content),
      toolCalls: normalizeToolCalls(message.tool_calls || []),
    },
  };
}

function normalizeAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("")
      .trim();
  }

  return "";
}

function normalizeToolCalls(toolCalls: unknown[]): ToolCall[] {
  return toolCalls
    .map((toolCall) => toToolCall(toolCall))
    .filter((toolCall): toolCall is ToolCall => Boolean(toolCall));
}

function toToolCall(value: unknown): ToolCall | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const type = getString((value as Record<string, unknown>).type);
  if (type !== "function") {
    return null;
  }

  const id = getString((value as Record<string, unknown>).id).trim();
  const fnValue = (value as Record<string, unknown>).function;
  if (typeof fnValue !== "object" || fnValue === null) {
    return null;
  }

  const functionName = getString((fnValue as Record<string, unknown>).name).trim();
  const argsText = safeJsonArguments(
    getString((fnValue as Record<string, unknown>).arguments),
  );

  if (!id || !functionName) {
    return null;
  }

  return {
    id,
    type: "function",
    function: {
      name: functionName,
      arguments: argsText,
    },
  };
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeJsonArguments(argumentsText: string): string {
  const normalized = argumentsText.trim() || "{}";
  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    return "{}";
  }
}
