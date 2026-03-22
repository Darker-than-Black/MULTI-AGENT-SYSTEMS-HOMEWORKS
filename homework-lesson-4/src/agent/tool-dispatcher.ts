import { toolsByName } from "../tools/index.js";
import type { ToolCall, ToolExecutionResult } from "./types.js";

export async function executeToolCall(
  toolCall: ToolCall,
): Promise<ToolExecutionResult> {
  const tool = toolsByName[toolCall.name];

  if (!tool) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      success: false,
      content: `Unknown tool: ${toolCall.name}`,
    };
  }

  try {
    const args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>;
    const content = await tool.execute(args);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      success: true,
      content,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tool failed";
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      success: false,
      content: message,
    };
  }
}
