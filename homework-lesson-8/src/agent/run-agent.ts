import { appendAssistantMessage, appendUserMessage } from "./memory";
import type { RunAgentTurnInput, RunAgentTurnOutput } from "./types";
import { superviseResearch } from "../supervisor/create-supervisor";

export async function runAgentTurn(
  { memory, userInput }: RunAgentTurnInput,
): Promise<RunAgentTurnOutput> {
  await appendUserMessage(memory, userInput);

  const response = await superviseResearch(userInput);
  await appendAssistantMessage(memory, response.finalAnswer);

  return {
    finalAnswer: response.finalAnswer,
    messages: memory,
    iterations: response.iterations,
    wroteReport: false,
    toolExecutions: response.toolExecutions,
  };
}
