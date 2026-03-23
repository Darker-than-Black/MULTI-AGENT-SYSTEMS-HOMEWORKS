const MAX_LOG_PREVIEW_CHARS = 300;

export function logIteration(iteration: number, maxIterations: number): void {
  console.log(`\n[iteration ${iteration}/${maxIterations}]`);
}

export function logToolCall(
  toolName: string,
  argsJson: string,
  iteration: number,
): void {
  console.log(`[iter ${iteration}] 🔧 tool=${toolName}`);
  console.log(`[iter ${iteration}]    args=${formatArgs(argsJson)}`);
}

export function logToolResult(
  toolName: string,
  success: boolean,
  content: string,
  iteration: number,
): void {
  const label = success ? "📎 result" : "⚠️ error";
  console.log(`[iter ${iteration}] ${label} tool=${toolName}`);
  console.log(`[iter ${iteration}]    output=${preview(content)}`);
}

function formatArgs(argsJson: string): string {
  const trimmed = argsJson.trim();
  if (!trimmed) {
    return "{}";
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return JSON.stringify(parsed);
  } catch {
    return preview(trimmed);
  }
}

function preview(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_LOG_PREVIEW_CHARS) {
    return singleLine;
  }

  return `${singleLine.slice(0, MAX_LOG_PREVIEW_CHARS)}...[truncated]`;
}
