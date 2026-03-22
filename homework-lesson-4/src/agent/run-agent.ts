import { appendAssistantMessage, appendUserMessage } from "./memory.js";
import { requestLlmTurn } from "./llm-client.js";
import { executeToolCall } from "./tool-dispatcher.js";
import type { RunAgentTurnInput, RunAgentTurnOutput } from "./types.js";
import { logIteration, logToolCall, logToolResult } from "../utils/logger.js";

export async function runAgentTurn(
  input: RunAgentTurnInput,
): Promise<RunAgentTurnOutput> {
  const messages = input.memory;
  appendUserMessage(messages, input.userInput);

  let finalAnswer = "No response generated.";
  let iterations = 0;

  while (iterations < input.maxIterations) {
    iterations += 1;
    logIteration(iterations);

    const llmResult = await requestLlmTurn({ messages });
    const toolCalls = llmResult.assistantMessage.toolCalls ?? [];
    appendAssistantMessage(messages, llmResult.assistantMessage.content, toolCalls);

    if (toolCalls.length === 0) {
      finalAnswer = llmResult.assistantMessage.content;
      break;
    }

    for (const toolCall of toolCalls) {
      logToolCall(toolCall.function.name, toolCall.function.arguments);
      const result = await executeToolCall(toolCall);
      logToolResult(result.toolName, result.ok, result.output);
      messages.push(result.toolMessage);
    }
  }

  if (iterations >= input.maxIterations) {
    finalAnswer = "Iteration limit reached.";
  }

  return { finalAnswer, messages, iterations };
}
