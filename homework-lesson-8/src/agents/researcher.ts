import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { appendAssistantMessage, appendUserMessage } from "../agent/memory";
import type {
  RunAgentTurnInput,
  RunAgentTurnOutput,
  ToolExecutionTrace,
} from "../agent/types";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import { RESEARCH_AGENT_SYSTEM_PROMPT } from "../config/prompts";
import type { ResearchPlan } from "../schemas/research-plan";
import {
  githubGetFileContentTool,
  githubListDirectoryTool,
  knowledgeSearchTool,
  readUrlTool,
  webSearchTool,
  writeReportTool,
} from "../tools/langchain-tools";

export interface ResearchInput {
  userRequest: string;
  plan: ResearchPlan;
  critiqueFeedback?: string[];
}

export function createResearcherAgent() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  return createAgent({
    model,
    systemPrompt: RESEARCH_AGENT_SYSTEM_PROMPT.trim(),
    tools: [
      webSearchTool,
      readUrlTool,
      writeReportTool,
      githubListDirectoryTool,
      githubGetFileContentTool,
      knowledgeSearchTool,
    ],
  });
}

export async function research(input: ResearchInput): Promise<string> {
  const normalizedUserRequest = input.userRequest.trim();
  if (!normalizedUserRequest) {
    throw new Error("Researcher userRequest cannot be empty.");
  }

  const researcher = createResearcherAgent();
  const result = await researcher.invoke(
    { messages: [new HumanMessage(buildResearchPrompt(input))] },
    { recursionLimit: 12 },
  );

  const lastMessage = result.messages.at(-1);
  const finalAnswer = lastMessage ? stringifyMessageContent(lastMessage.content).trim() : "";
  return finalAnswer || "Researcher returned an empty response.";
}

export async function runResearchTurn(
  { maxIterations, memory, userInput }: RunAgentTurnInput,
): Promise<RunAgentTurnOutput> {
  await appendUserMessage(memory, userInput);

  const researcher = createResearcherAgent();
  const startIndex = memory.length;
  // Multi-tool runs can require several AI -> tool -> observation cycles per user request.
  const recursionLimit = Math.max(12, maxIterations * 4);
  const result = await researcher.invoke(
    { messages: memory },
    { recursionLimit },
  );

  const generatedMessages = result.messages.slice(startIndex);
  const assistantMessages = generatedMessages.filter((message) => message.getType() === "ai");
  const toolMessages = generatedMessages.filter((message) => message.getType() === "tool");

  const lastAssistant = assistantMessages.at(-1);
  const finalAnswer = lastAssistant ? stringifyMessageContent(lastAssistant.content).trim() : "";
  const normalizedFinal = finalAnswer || "Agent returned an empty response.";

  await appendAssistantMessage(memory, normalizedFinal);

  return {
    finalAnswer: normalizedFinal,
    messages: memory,
    iterations: assistantMessages.length || 1,
    wroteReport: didWriteReport(toolMessages),
    toolExecutions: buildToolExecutionTrace(generatedMessages),
  };
}

function buildResearchPrompt(input: ResearchInput): string {
  const critiqueFeedback = (input.critiqueFeedback ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const sections = [
    `User request:\n${input.userRequest.trim()}`,
    `Research goal:\n${input.plan.goal}`,
    `Search queries:\n${input.plan.searchQueries.map((query, index) => `${index + 1}. ${query}`).join("\n")}`,
    `Sources to check:\n${input.plan.sourcesToCheck.join(", ")}`,
    `Desired output format:\n${input.plan.outputFormat}`,
  ];

  if (critiqueFeedback.length > 0) {
    sections.push(
      `Critique feedback to address:\n${critiqueFeedback.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    );
  }

  sections.push(
    "Task:\nExecute the research plan using the available tools. Return concise findings grounded in the gathered evidence.",
  );

  return sections.join("\n\n");
}

function stringifyMessageContent(content: unknown): string {
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

function didWriteReport(toolMessages: Array<{ name?: string; content: unknown }>): boolean {
  for (const toolMessage of toolMessages) {
    if (toolMessage.name !== "write_report") {
      continue;
    }

    const normalized = stringifyMessageContent(toolMessage.content);
    if (normalized.includes("Report saved to")) {
      return true;
    }
  }

  return false;
}

function buildToolExecutionTrace(
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
