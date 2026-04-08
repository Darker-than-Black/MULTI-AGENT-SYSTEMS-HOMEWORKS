import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { appendAssistantMessage, appendUserMessage } from "../agent/memory";
import type {
  RunAgentTurnInput,
  RunAgentTurnOutput,
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
import { buildToolExecutionTrace, stringifyMessageContent } from "../utils/agent-trace";

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
