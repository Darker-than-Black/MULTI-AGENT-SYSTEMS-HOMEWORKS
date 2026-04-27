import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";

export interface LangChainInvokeOptions {
  callbacks?: BaseCallbackHandler[];
  metadata?: Record<string, unknown>;
}

export interface LangfusePromptMetadata {
  name: string;
  version: number;
  isFallback: boolean;
}

export function mergeLangfusePromptMetadata(
  metadata: Record<string, unknown> | undefined,
  prompt: LangfusePromptMetadata | null,
): Record<string, unknown> | undefined {
  if (!prompt) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    langfusePrompt: prompt,
  };
}
