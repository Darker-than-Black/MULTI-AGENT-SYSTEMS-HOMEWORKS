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

export interface PendingReviewPreview {
  filename: string;
  content: string;
  description?: string;
  allowedDecisions: string[];
}

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
  console.log("Type your question, or 'exit'/'quit' to stop.");
  console.log("Report writes are gated with approve/edit/reject review.\n");
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

export function logPendingReview(preview: PendingReviewPreview): void {
  lastRenderedScope = null;
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🛑 Human Review Required");
  console.log(`📄 File: ${preview.filename}`);
  console.log(`🧭 Allowed decisions: ${preview.allowedDecisions.join(", ")}`);
  if (preview.description) {
    console.log(`📝 ${preview.description}`);
  }
  console.log("────────────────────────────────────────");
  console.log("Preview:");
  console.log(renderPreview(preview.content));
  console.log("────────────────────────────────────────");
}

export function logResumeDecision(decision: "approve" | "edit" | "reject"): void {
  const messageByDecision = {
    approve: "✅ Approved report write. Resuming agent...",
    edit: "✍️ Submitted revision feedback. Supervisor is restarting the full revision cycle...",
    reject: "⛔ Rejected report write. Resuming agent...",
  } as const;

  console.log(`${messageByDecision[decision]}\n`);
}

function renderPreview(content: string): string {
  const normalized = content.trim();
  if (!normalized) {
    return "[empty report content]\n";
  }

  const maxChars = 1200;
  const preview = normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}\n\n...[truncated]`
    : normalized;

  return `${preview}\n`;
}
