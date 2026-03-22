import { appendAssistantMessage, appendToolMessage, appendUserMessage } from "./memory.js";
import { requestLlmTurn } from "./llm-client.js";
import { executeToolCall } from "./tool-dispatcher.js";
import type { RunAgentTurnInput, RunAgentTurnOutput } from "./types.js";
import { logIteration, logToolCall, logToolResult } from "../utils/logger.js";

export async function runAgentTurn(
  { maxIterations, memory, userInput }: RunAgentTurnInput,
): Promise<RunAgentTurnOutput> {
  appendUserMessage(memory, userInput);

  let finalAnswer = "";
  let lastNonEmptyAssistantText = "";
  let iterations = 0;
  let noProgressStreak = 0;
  let previousToolPlanFingerprint = "";

  while (iterations < maxIterations) {
    iterations += 1;
    logIteration(iterations);

    const llmResult = await requestLlmTurn({ messages: memory });
    const assistantText = llmResult.assistantMessage.content.trim();
    const toolCalls = llmResult.assistantMessage.toolCalls ?? [];

    if (assistantText) {
      lastNonEmptyAssistantText = assistantText;
    }

    appendAssistantMessage(memory, assistantText, toolCalls);

    if (toolCalls.length === 0) {
      if (!assistantText && !lastNonEmptyAssistantText) {
        finalAnswer = "Agent returned an empty response.";
      } else {
        finalAnswer = assistantText || lastNonEmptyAssistantText;
      }
      break;
    }

    const toolPlanFingerprint = toolCalls
      .map((toolCall) => `${toolCall.function.name}:${toolCall.function.arguments}`)
      .join("|");

    if (toolPlanFingerprint && toolPlanFingerprint === previousToolPlanFingerprint) {
      noProgressStreak += 1;
    } else {
      noProgressStreak = 0;
    }

    previousToolPlanFingerprint = toolPlanFingerprint;

    if (noProgressStreak >= 2) {
      finalAnswer = lastNonEmptyAssistantText || "Stopped early: repeated tool-call plan without progress.";
      break;
    }

    let executedAnyTool = false;
    for (const toolCall of toolCalls) {
      logToolCall(toolCall.function.name, toolCall.function.arguments);
      const result = await executeToolCall(toolCall);
      logToolResult(result.toolName, result.ok, result.output);
      appendToolMessage(memory, result.toolMessage);
      executedAnyTool = true;
    }

    if (!executedAnyTool) {
      finalAnswer = lastNonEmptyAssistantText || "Stopped early: no tool calls were executed.";
      break;
    }
  }

  if (!finalAnswer) {
    if (iterations >= maxIterations) {
      finalAnswer = lastNonEmptyAssistantText
        ? `${lastNonEmptyAssistantText}\n\n[Stopped: iteration limit reached.]`
        : "Iteration limit reached before producing a final answer.";
    } else {
      finalAnswer = "No final answer was produced.";
    }
  }

  return { finalAnswer, messages: memory, iterations };
}
