import {
  CRITIC_RECURSION_LIMIT,
  PLANNER_RECURSION_LIMIT,
  RESEARCH_TURN_MIN_RECURSION_LIMIT,
  RESEARCH_TURN_RECURSION_MULTIPLIER,
  RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT,
  RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR,
  RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET,
  SUPERVISOR_MAX_RESEARCH_REVISIONS,
  SUPERVISOR_MIN_RECURSION_LIMIT,
  SUPERVISOR_RECURSION_MULTIPLIER,
} from "./env";

// Prompts steer the model, but these limits are enforced in code.
export const SUPERVISOR_ALLOWED_WRITE_REPORT_DECISIONS = ["approve", "edit", "reject"] as const;
export { SUPERVISOR_MAX_RESEARCH_REVISIONS };
export const SUPERVISOR_MAX_CRITIQUE_PASSES = SUPERVISOR_MAX_RESEARCH_REVISIONS + 1;

export function getPlannerRecursionLimit(): number {
  return PLANNER_RECURSION_LIMIT;
}

export function getCriticRecursionLimit(): number {
  return CRITIC_RECURSION_LIMIT;
}

export function getResearchWorkflowRecursionLimit(searchQueryCount: number): number {
  return Math.max(
    RESEARCH_WORKFLOW_MIN_RECURSION_LIMIT,
    searchQueryCount * RESEARCH_WORKFLOW_QUERY_RECURSION_FACTOR
      + RESEARCH_WORKFLOW_QUERY_RECURSION_OFFSET,
  );
}

export function getResearchTurnRecursionLimit(maxIterations: number): number {
  return Math.max(
    RESEARCH_TURN_MIN_RECURSION_LIMIT,
    maxIterations * RESEARCH_TURN_RECURSION_MULTIPLIER,
  );
}

export function getSupervisorRecursionLimit(maxIterations?: number): number {
  return Math.max(
    SUPERVISOR_MIN_RECURSION_LIMIT,
    (maxIterations ?? 4) * SUPERVISOR_RECURSION_MULTIPLIER,
  );
}
