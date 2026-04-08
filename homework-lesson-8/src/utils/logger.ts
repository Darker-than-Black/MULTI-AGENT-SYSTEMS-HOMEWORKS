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

const SCOPE_META: Record<ProgressLogScope, { icon: string; label: string }> = {
  supervisor: { icon: "🧭", label: "Supervisor" },
  planner: { icon: "🗺️", label: "Planner" },
  researcher: { icon: "🔎", label: "Researcher" },
  critic: { icon: "🧪", label: "Critic" },
  tool: { icon: "🛠️", label: "Tool" },
};

const PHASE_META: Record<ProgressLogPhase, { icon: string; label: string }> = {
  start: { icon: "▶️", label: "Start" },
  success: { icon: "✅", label: "Done" },
  error: { icon: "❌", label: "Error" },
  info: { icon: "ℹ️", label: "Info" },
};

let lastRenderedScope: ProgressLogScope | null = null;

export function logCliHeader(): void {
  console.log("Multi-Agent Research CLI");
  console.log("Type your question, or 'exit'/'quit' to stop.\n");
}

export function logAgentProcessing(): void {
  lastRenderedScope = null;
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🤖 Agent is processing your request...\n");
}

export function logProgressEvent(event: ProgressLogEvent): void {
  const scopeMeta = SCOPE_META[event.scope];
  const phaseMeta = PHASE_META[event.phase];

  if (lastRenderedScope !== event.scope) {
    if (lastRenderedScope !== null) {
      console.log("────────────────────────────────────────");
    }
    console.log(`${scopeMeta.icon} ${scopeMeta.label}`);
    lastRenderedScope = event.scope;
  }

  const detailSuffix = event.detail ? `\n   ${event.detail}` : "";
  console.log(`  ${phaseMeta.icon} ${event.message}${detailSuffix}`);
}

export function logAgentAnswer(answer: string): void {
  lastRenderedScope = null;
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Agent: ${answer}\n`);
}
