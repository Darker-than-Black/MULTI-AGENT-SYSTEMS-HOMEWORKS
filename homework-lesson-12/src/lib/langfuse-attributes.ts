export interface LangfuseTraceAttributes {
  userId: string;
  sessionId: string;
  tags: string[];
  metadata: Record<string, string>;
}

const HOMEWORK_TAG = "homework-12";
const CLI_RUNTIME_TAG = "runtime:cli";
const BATCH_RUNTIME_TAG = "runtime:batch";

export const CLI_USER_ID = "local-cli-user";
export const BATCH_USER_ID = "local-batch-user";

export function buildCliLangfuseTraceAttributes(
  sessionId: string,
  threadId: string,
): LangfuseTraceAttributes {
  return {
    userId: CLI_USER_ID,
    sessionId,
    tags: [HOMEWORK_TAG, CLI_RUNTIME_TAG],
    metadata: {
      runtime: "cli",
      threadId,
    },
  };
}

export function buildBatchLangfuseTraceAttributes(
  mode: string,
  requestId: string,
): LangfuseTraceAttributes {
  return {
    userId: BATCH_USER_ID,
    sessionId: requestId,
    tags: [HOMEWORK_TAG, BATCH_RUNTIME_TAG, `mode:${mode}`],
    metadata: {
      runtime: "batch",
      mode,
      requestId,
    },
  };
}
