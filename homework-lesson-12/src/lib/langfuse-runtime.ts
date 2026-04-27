import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  propagateAttributes,
  setActiveTraceIO,
  startActiveObservation,
} from "@langfuse/tracing";
import { createLangfuseSpanProcessor, isLangfuseEnabled } from "./langfuse";

interface LangfuseTraceContext {
  name: string;
  input?: unknown;
  userId: string;
  sessionId: string;
  tags?: string[];
  metadata?: Record<string, string>;
  task: () => Promise<void>;
}

interface LangfuseTraceContextWithResult<T> {
  name: string;
  input?: unknown;
  userId: string;
  sessionId: string;
  tags?: string[];
  metadata?: Record<string, string>;
  task: () => Promise<T>;
  mapOutput?: (result: T) => unknown;
}

let cachedNodeSdk: NodeSDK | null | undefined;
let sdkStartPromise: Promise<NodeSDK | null> | null = null;

export async function initializeLangfuseObservability(): Promise<NodeSDK | null> {
  if (cachedNodeSdk !== undefined) {
    return cachedNodeSdk;
  }

  if (!isLangfuseEnabled()) {
    cachedNodeSdk = null;
    return cachedNodeSdk;
  }

  if (sdkStartPromise) {
    return sdkStartPromise;
  }

  sdkStartPromise = (async () => {
    const spanProcessor = createLangfuseSpanProcessor();
    if (!spanProcessor) {
      cachedNodeSdk = null;
      return cachedNodeSdk;
    }

    const sdk = new NodeSDK({
      spanProcessors: [spanProcessor],
    });

    await Promise.resolve(sdk.start());
    cachedNodeSdk = sdk;
    return cachedNodeSdk;
  })();

  try {
    return await sdkStartPromise;
  } finally {
    sdkStartPromise = null;
  }
}

export async function shutdownLangfuseObservability(): Promise<void> {
  if (!cachedNodeSdk) {
    return;
  }

  const sdk = cachedNodeSdk;
  cachedNodeSdk = undefined;
  await sdk.shutdown();
}

interface LangfuseObservationContextWithResult<T> {
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  task: () => Promise<T>;
  mapOutput?: (result: T) => unknown;
}

export async function runWithLangfuseRootTrace<T>({
  name,
  input,
  userId,
  sessionId,
  tags,
  metadata,
  task,
  mapOutput,
}: LangfuseTraceContextWithResult<T>): Promise<T> {
  if (!isLangfuseEnabled()) {
    return task();
  }

  await initializeLangfuseObservability();

  return startActiveObservation(
    name,
    async (observation) => {
      observation.update({
        input,
        metadata,
      });

      return propagateAttributes(
        {
          traceName: name,
          userId,
          sessionId,
          tags,
          metadata,
        },
        async () => {
          try {
            const result = await task();
            const output = mapOutput ? mapOutput(result) : result;

            observation.update({ output });
            setActiveTraceIO({ input, output });

            return result;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown traced error.";
            const output = { error: message };

            observation.update({
              level: "ERROR",
              statusMessage: message,
              output,
            });
            setActiveTraceIO({ input, output });

            throw error;
          }
        },
      );
    },
    { asType: "agent" },
  );
}

export async function runWithLangfuseObservation<T>({
  name,
  input,
  metadata,
  task,
  mapOutput,
}: LangfuseObservationContextWithResult<T>): Promise<T> {
  if (!isLangfuseEnabled()) {
    return task();
  }

  return await startActiveObservation(
    name,
    async (observation) => {
      observation.update({
        input,
        metadata,
      });

      try {
        const result = await task();
        observation.update({
          output: mapOutput ? mapOutput(result) : result,
        });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown traced error.";
        observation.update({
          level: "ERROR",
          statusMessage: message,
          output: { error: message },
        });
        throw error;
      }
    },
    { asType: "agent" },
  );
}

export async function runWithoutTrace({
  task,
}: LangfuseTraceContext): Promise<void> {
  await task();
}
