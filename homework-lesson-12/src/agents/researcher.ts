import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { appendAssistantMessage, appendUserMessage } from "../agent/memory";
import type {
  RunAgentTurnInput,
  RunAgentTurnOutput,
} from "../agent/types";
import {
  getResearchTurnRecursionLimit,
  getResearchWorkflowRecursionLimit,
} from "../config/agent-policy";
import { MODEL_NAME, OPENAI_API_KEY, TEMPERATURE } from "../config/env";
import {
  mergeLangfusePromptMetadata,
  type LangChainInvokeOptions,
} from "../lib/langfuse-context";
import { resolveSystemPrompt } from "../lib/langfuse-prompts";
import { runWithLangfuseObservation } from "../lib/langfuse-runtime";
import type { ResearchPlan } from "../schemas/research-plan";
import {
  githubGetFileContentTool,
  githubListDirectoryTool,
  knowledgeSearchTool,
  readUrlTool,
  webSearchTool,
} from "../tools/langchain-tools";
import { buildToolExecutionTrace, stringifyMessageContent } from "../utils/agent-trace";

export interface ResearchInput {
  userRequest: string;
  plan: ResearchPlan;
  critiqueFeedback?: string[];
}

export async function createResearcherAgent() {
  if (!OPENAI_API_KEY.trim()) {
    throw new Error("OPENAI_API_KEY is missing. Add it to homework-lesson-8/.env.");
  }

  const systemPrompt = await resolveSystemPrompt("researcher");
  const model = new ChatOpenAI({
    model: MODEL_NAME,
    temperature: TEMPERATURE,
    apiKey: OPENAI_API_KEY,
  });

  const agent = createAgent({
    model,
    systemPrompt: systemPrompt.content.trim(),
    tools: [
      webSearchTool,
      readUrlTool,
      githubListDirectoryTool,
      githubGetFileContentTool,
      knowledgeSearchTool,
    ],
  });

  return {
    agent,
    prompt: systemPrompt.prompt,
  };
}

export async function research(
  input: ResearchInput,
  options: LangChainInvokeOptions = {},
): Promise<string> {
  const normalizedUserRequest = input.userRequest.trim();
  if (!normalizedUserRequest) {
    throw new Error("Researcher userRequest cannot be empty.");
  }

  return runWithLangfuseObservation({
    name: "researcher",
    input: {
      userRequest: normalizedUserRequest,
      goal: input.plan.goal,
      searchQueries: input.plan.searchQueries,
      sourcesToCheck: input.plan.sourcesToCheck,
      critiqueFeedback: input.critiqueFeedback ?? [],
    },
    task: async () => {
      const { agent, prompt } = await createResearcherAgent();
      const recursionLimit = getResearchWorkflowRecursionLimit(input.plan.searchQueries.length);
      const result = await agent.invoke(
        { messages: [new HumanMessage(buildResearchPrompt(input))] },
        {
          recursionLimit,
          callbacks: options.callbacks,
          metadata: mergeLangfusePromptMetadata(options.metadata, prompt),
        },
      );

      const lastMessage = result.messages.at(-1);
      const finalAnswer = lastMessage ? stringifyMessageContent(lastMessage.content).trim() : "";
      return finalAnswer || "Researcher returned an empty response.";
    },
  });
}

export async function runResearchTurn(
  { maxIterations, memory, userInput }: RunAgentTurnInput,
  options: LangChainInvokeOptions = {},
): Promise<RunAgentTurnOutput> {
  await appendUserMessage(memory, userInput);

  return runWithLangfuseObservation({
    name: "researcher-turn",
    input: {
      userInput,
      maxIterations,
      memoryLength: memory.length,
    },
    task: async () => {
      const { agent, prompt } = await createResearcherAgent();
      const startIndex = memory.length;
      // Multi-tool runs can require several AI -> tool -> observation cycles per user request.
      const recursionLimit = getResearchTurnRecursionLimit(maxIterations);
      const result = await agent.invoke(
        { messages: memory },
        {
          recursionLimit,
          callbacks: options.callbacks,
          metadata: mergeLangfusePromptMetadata(options.metadata, prompt),
        },
      );

      const generatedMessages = result.messages.slice(startIndex);
      const assistantMessages = generatedMessages.filter(
        (message: typeof generatedMessages[number]) => message.getType() === "ai",
      );
      const toolMessages = generatedMessages.filter(
        (message: typeof generatedMessages[number]) => message.getType() === "tool",
      );

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
    },
    mapOutput: (result) => ({
      finalAnswer: result.finalAnswer,
      iterations: result.iterations,
      wroteReport: result.wroteReport,
      toolExecutions: result.toolExecutions,
    }),
  });
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
