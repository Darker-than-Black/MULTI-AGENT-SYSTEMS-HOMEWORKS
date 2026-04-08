import type { ToolExecutionTrace } from "../agent/types";
import type { ProgressLogEvent } from "./progress";

export function logCliHeader(): void {
  console.log("Multi-Agent Research CLI");
  console.log("Type your question, or 'exit'/'quit' to stop.\n");
}

export function logAgentProcessing(): void {
  console.log("Agent: processing...\n");
}

export function logProgressEvent(event: ProgressLogEvent): void {
  const label = `[${event.scope}:${event.phase}]`;
  const suffix = event.detail ? ` ${event.detail}` : "";
  console.log(`${label} ${event.message}${suffix}`);
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
