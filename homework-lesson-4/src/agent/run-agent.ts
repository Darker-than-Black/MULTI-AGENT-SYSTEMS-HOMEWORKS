import { appendAssistantMessage, appendUserMessage } from "./memory.js";
import { requestLlmTurn } from "./llm-client.js";
import { executeToolCall } from "./tool-dispatcher.js";
import type { AgentMessage, RunAgentTurnInput, RunAgentTurnOutput } from "./types.js";
import { logIteration, logToolCall, logToolResult } from "../utils/logger.js";

function toToolMessage(result: {
  toolCallId: string;
  toolName: string;
  content: string;
}): AgentMessage {
  return {
    role: "tool",
    name: result.toolName,
    toolCallId: result.toolCallId,
    content: result.content,
  };
}

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
    appendAssistantMessage(messages, llmResult.assistantMessage.content);

    if (llmResult.isFinal || llmResult.toolCalls.length === 0) {
      finalAnswer = llmResult.assistantMessage.content;
      break;
    }

    for (const toolCall of llmResult.toolCalls) {
      logToolCall(toolCall.name, toolCall.argumentsJson);
      const result = await executeToolCall(toolCall);
      logToolResult(result.toolName, result.success, result.content);
      messages.push(toToolMessage(result));
    }
  }

  if (iterations >= input.maxIterations) {
    finalAnswer = "Iteration limit reached.";
  }

  return { finalAnswer, messages, iterations };
}
