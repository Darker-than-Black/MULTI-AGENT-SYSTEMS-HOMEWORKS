import type { ToolExecutionTrace } from "../agent/types.js";

export function logCliHeader(): void {
  console.log("Research Agent CLI");
  console.log("Type your question, or 'exit'/'quit' to stop.\n");
}

export function logAgentProcessing(): void {
  console.log("Agent: processing...\n");
}

export function logExecutionTrace(toolExecutions: ToolExecutionTrace[]): void {
  if (toolExecutions.length === 0) {
    console.log("ℹ️ Tools were not called for this response.\n");
    return;
  }

  for (const execution of toolExecutions) {
    console.log(`🔧 Tool call: ${execution.call}`);
    console.log(`📎 Result: ${execution.resultSummary}`);
    for (const detail of execution.details) {
      console.log(`   - ${detail}`);
    }
    console.log("");
  }
}

export function logAgentAnswer(answer: string): void {
  console.log(`Agent: ${answer}\n`);
}
