export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  name: string;
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type AgentMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export interface ToolResultPayload {
  ok: boolean;
  toolName: string;
  output: string;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  output: string;
  toolMessage: ToolMessage;
}

export interface LlmTurnResult {
  assistantMessage: AssistantMessage;
}

export interface RunAgentTurnInput {
  userInput: string;
  memory: AgentMessage[];
  maxIterations: number;
}

export interface RunAgentTurnOutput {
  finalAnswer: string;
  messages: AgentMessage[];
  iterations: number;
}
