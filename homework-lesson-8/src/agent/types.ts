import type { AIMessage, HumanMessage, SystemMessage } from "langchain";

export type AgentMessage = SystemMessage | HumanMessage | AIMessage;

export interface RunAgentTurnInput {
  userInput: string;
  memory: AgentMessage[];
  maxIterations: number;
}

export interface RunAgentTurnOutput {
  finalAnswer: string;
  messages: AgentMessage[];
  iterations: number;
  wroteReport: boolean;
  toolExecutions: ToolExecutionTrace[];
}

export interface ToolExecutionTrace {
  call: string;
  resultSummary: string;
  details: string[];
}
