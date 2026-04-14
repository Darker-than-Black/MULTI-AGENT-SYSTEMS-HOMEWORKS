import type { ToolExecutionTrace } from "../agent/types";

export function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part !== null && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function buildToolExecutionTrace(
  messages: Array<{ getType: () => string; tool_calls?: unknown; tool_call_id?: unknown; content?: unknown }>,
): ToolExecutionTrace[] {
  const callsById = new Map<string, { name: string; argsInline: string }>();
  const traces: ToolExecutionTrace[] = [];

  for (const message of messages) {
    if (message.getType() === "ai") {
      const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const rawCall of rawCalls) {
        if (typeof rawCall !== "object" || rawCall === null) {
          continue;
        }

        const callId = toNonEmptyString((rawCall as { id?: unknown }).id);
        const name = toNonEmptyString((rawCall as { name?: unknown }).name);
        const argsInline = formatArgsInline((rawCall as { args?: unknown }).args);
        if (!callId || !name) {
          continue;
        }

        callsById.set(callId, { name, argsInline });
      }
    }

    if (message.getType() === "tool") {
      const callId = toNonEmptyString(message.tool_call_id);
      const call = callId ? callsById.get(callId) : undefined;
      const toolName = call?.name || "unknown_tool";
      const toolArgs = call?.argsInline || "";
      const content = stringifyMessageContent(message.content);
      const rendered = renderToolResult(content);

      traces.push({
        call: `${toolName}(${toolArgs})`,
        resultSummary: rendered.summary,
        details: rendered.details,
      });
    }
  }

  return traces;
}

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized || "";
}

function formatArgsInline(args: unknown): string {
  if (args === undefined || args === null) {
    return "";
  }

  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed) {
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return objectToInlineArgs(parsed);
    } catch {
      return `payload=${JSON.stringify(trimmed)}`;
    }
  }

  return objectToInlineArgs(args);
}

function objectToInlineArgs(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `payload=${JSON.stringify(value)}`;
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => `${key}=${JSON.stringify(raw)}`)
    .join(", ");
}

function renderToolResult(content: string): { summary: string; details: string[] } {
  const normalized = content.trim();
  if (!normalized) {
    return { summary: "[empty result]", details: [] };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed)) {
      return {
        summary: `[${parsed.length} documents found]`,
        details: parsed.slice(0, 3).map((item) => summarizeJsonItem(item)),
      };
    }
    if (typeof parsed === "object" && parsed !== null) {
      return { summary: summarizeJsonItem(parsed), details: [] };
    }
  } catch {
    // plain text output
  }

  if (normalized.length > 140) {
    return { summary: `[${normalized.length} chars] ${normalized.slice(0, 120)}...`, details: [] };
  }

  return { summary: normalized, details: [] };
}

function summarizeJsonItem(item: unknown): string {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;
    const title = toNonEmptyString(record.title);
    const snippet = toNonEmptyString(record.snippet);
    const path = toNonEmptyString(record.path);

    if (title && snippet) {
      return `${title} ${snippet.slice(0, 100)}${snippet.length > 100 ? "..." : ""}`;
    }
    if (path) {
      return path;
    }
    if (typeof record.content === "string") {
      const text = record.content.trim();
      return `[${text.length} chars] ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`;
    }
    return JSON.stringify(record);
  }

  if (typeof item === "string") {
    return item;
  }
  return String(item);
}
