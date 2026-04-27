import { LangfuseClient } from "@langfuse/client";
import { CallbackHandler } from "@langfuse/langchain";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  LANGFUSE_BASE_URL,
  LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY,
} from "../config/env";

export interface LangfuseRuntimeConfig {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

export type LangfuseCallbackHandlerParams = ConstructorParameters<typeof CallbackHandler>[0];

let cachedLangfuseClient: LangfuseClient | null | undefined;

export function getLangfuseRuntimeConfig(): LangfuseRuntimeConfig {
  return {
    enabled: Boolean(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY),
    publicKey: LANGFUSE_PUBLIC_KEY,
    secretKey: LANGFUSE_SECRET_KEY,
    baseUrl: LANGFUSE_BASE_URL.trim(),
  };
}

export function isLangfuseEnabled(): boolean {
  return getLangfuseRuntimeConfig().enabled;
}

export function getLangfuseClient(): LangfuseClient | null {
  if (cachedLangfuseClient !== undefined) {
    return cachedLangfuseClient;
  }

  const config = getLangfuseRuntimeConfig();
  if (!config.enabled) {
    cachedLangfuseClient = null;
    return cachedLangfuseClient;
  }

  cachedLangfuseClient = new LangfuseClient({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });

  return cachedLangfuseClient;
}

export async function shutdownLangfuseClient(): Promise<void> {
  if (!cachedLangfuseClient) {
    cachedLangfuseClient = undefined;
    return;
  }

  const client = cachedLangfuseClient;
  cachedLangfuseClient = undefined;
  await client.shutdown();
}

export function createLangfuseCallbackHandler(
  params: LangfuseCallbackHandlerParams = {},
): CallbackHandler | null {
  if (!isLangfuseEnabled()) {
    return null;
  }

  return new CallbackHandler(params);
}

export function createLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  const config = getLangfuseRuntimeConfig();
  if (!config.enabled) {
    return null;
  }

  return new LangfuseSpanProcessor({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });
}
