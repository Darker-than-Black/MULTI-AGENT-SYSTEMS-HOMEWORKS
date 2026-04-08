export type ProgressLogScope =
  | "supervisor"
  | "planner"
  | "researcher"
  | "critic"
  | "tool";

export type ProgressLogPhase = "start" | "success" | "error" | "info";

export interface ProgressLogEvent {
  scope: ProgressLogScope;
  phase: ProgressLogPhase;
  message: string;
  detail?: string;
}

export type ProgressLogger = (event: ProgressLogEvent) => void;
