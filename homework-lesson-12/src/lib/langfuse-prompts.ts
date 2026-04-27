import {
  SYSTEM_PROMPT_DEFINITIONS,
  type SystemPromptKey,
} from "../config/prompts";
import type { LangfusePromptMetadata } from "./langfuse-context";
import { getLangfuseClient, isLangfuseEnabled } from "./langfuse";

interface ResolvedSystemPrompt {
  content: string;
  prompt: LangfusePromptMetadata | null;
}

const PROMPT_CACHE_TTL_SECONDS = 60;
const PROMPT_FETCH_TIMEOUT_MS = 10_000;

export async function resolveSystemPrompt(
  key: SystemPromptKey,
  variables: Record<string, string> = {},
): Promise<ResolvedSystemPrompt> {
  const definition = SYSTEM_PROMPT_DEFINITIONS[key];
  assertRequiredVariables(key, definition.requiredVariables, variables);

  if (!isLangfuseEnabled()) {
    throw new Error(
      `Langfuse is required for prompt "${definition.name}". Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY before running this workflow.`,
    );
  }

  const client = getLangfuseClient();
  if (!client) {
    throw new Error(
      `Langfuse client is unavailable for prompt "${definition.name}". Check LANGFUSE_BASE_URL and API credentials.`,
    );
  }

  const prompt = await client.prompt.get(definition.name, {
    label: "production",
    type: definition.type,
    cacheTtlSeconds: PROMPT_CACHE_TTL_SECONDS,
    fetchTimeoutMs: PROMPT_FETCH_TIMEOUT_MS,
    maxRetries: 2,
  });

  return {
    content: prompt.compile(variables),
    prompt: {
      name: prompt.name,
      version: prompt.version,
      isFallback: prompt.isFallback,
    },
  };
}

function assertRequiredVariables(
  key: SystemPromptKey,
  requiredVariables: readonly string[],
  variables: Record<string, string>,
): void {
  const missing = requiredVariables.filter((requiredVariable) => {
    return !variables[requiredVariable]?.trim();
  });

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Missing Langfuse prompt variables for "${SYSTEM_PROMPT_DEFINITIONS[key].name}": ${missing.join(", ")}.`,
  );
}
