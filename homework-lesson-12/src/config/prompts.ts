export interface LangfusePromptDefinition {
  name: string;
  type: "text";
  requiredVariables: readonly string[];
}

export const SYSTEM_PROMPT_DEFINITIONS = {
  researcher: {
    name: "homework-12/researcher-system",
    type: "text",
    requiredVariables: [],
  },
  planner: {
    name: "homework-12/planner-system",
    type: "text",
    requiredVariables: [],
  },
  critic: {
    name: "homework-12/critic-system",
    type: "text",
    requiredVariables: [],
  },
  supervisor: {
    name: "homework-12/supervisor-system",
    type: "text",
    requiredVariables: ["max_research_revisions"],
  },
} satisfies Record<string, LangfusePromptDefinition>;

export type SystemPromptKey = keyof typeof SYSTEM_PROMPT_DEFINITIONS;
