export function logIteration(iteration: number): void {
  console.log(`\n[iteration ${iteration}]`);
}

export function logToolCall(toolName: string, argsJson: string): void {
  console.log(`🔧 Tool call: ${toolName}(${argsJson})`);
}

export function logToolResult(
  toolName: string,
  success: boolean,
  content: string,
): void {
  const label = success ? "📎 Result" : "⚠️ Tool error";
  console.log(`${label} (${toolName}): ${content}`);
}
