export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  content: string;
}

export interface LlmTurnResult {
  assistantMessage: AgentMessage;
  toolCalls: ToolCall[];
  isFinal: boolean;
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
