import { toolsByName } from "../tools/index.js";
import { ToolExecutionError, ToolInputError } from "../tools/errors.js";
import type {
  ToolCall,
  ToolExecutionResult,
  ToolMessage,
  ToolResultPayload,
} from "./types.js";

function toToolMessage(result: {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  output: string;
}): ToolMessage {
  const payload: ToolResultPayload = {
    ok: result.ok,
    toolName: result.toolName,
    output: result.output,
  };

  return {
    role: "tool",
    name: result.toolName,
    toolCallId: result.toolCallId,
    content: JSON.stringify(payload),
    isError: !result.ok,
  };
}

export async function executeToolCall(
  toolCall: ToolCall,
): Promise<ToolExecutionResult> {
  const toolName = toolCall.function.name;
  const tool = toolsByName[toolName];

  if (!tool) {
    const output = `Unknown tool: ${toolName}`;
    return {
      toolCallId: toolCall.id,
      toolName,
      ok: false,
      output,
      toolMessage: toToolMessage({
        toolCallId: toolCall.id,
        toolName,
        ok: false,
        output,
      }),
    };
  }

  try {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      throw new ToolInputError(
        `${toolName}: invalid JSON arguments payload.`,
      );
    }

    const output = await tool.execute(args);
    return {
      toolCallId: toolCall.id,
      toolName,
      ok: true,
      output,
      toolMessage: toToolMessage({
        toolCallId: toolCall.id,
        toolName,
        ok: true,
        output,
      }),
    };
  } catch (error: unknown) {
    const output =
      error instanceof ToolInputError || error instanceof ToolExecutionError
        ? error.message
        : error instanceof Error
          ? `${toolName}: unexpected tool failure (${error.message}).`
          : `${toolName}: unexpected tool failure.`;

    return {
      toolCallId: toolCall.id,
      toolName,
      ok: false,
      output,
      toolMessage: toToolMessage({
        toolCallId: toolCall.id,
        toolName,
        ok: false,
        output,
      }),
    };
  }
}
