import { appendAssistantMessage, appendUserMessage } from "./memory";
import type { RunAgentTurnInput, RunAgentTurnOutput } from "./types";
import { superviseResearchWithOptions } from "../supervisor/create-supervisor";

export async function runAgentTurn(
  { memory, userInput, maxIterations, onProgress }: RunAgentTurnInput,
): Promise<RunAgentTurnOutput> {
  await appendUserMessage(memory, userInput);

  const response = await superviseResearchWithOptions(userInput, {
    maxIterations,
    onProgress,
  });
  await appendAssistantMessage(memory, response.finalAnswer);

  return {
    finalAnswer: response.finalAnswer,
    messages: memory,
    iterations: response.iterations,
    wroteReport: false,
    toolExecutions: response.toolExecutions,
  };
}
