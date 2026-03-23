#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:6] Running edge-case validation..."

node --import tsx -e '
import { executeToolCall } from "./src/agent/tool-dispatcher.ts";

const invalidArgs = await executeToolCall({
  id: "t1",
  type: "function",
  function: { name: "web_search", arguments: "{\"query\":" },
});
if (invalidArgs.ok) {
  throw new Error("invalid tool args case should fail.");
}

const failedRead = await executeToolCall({
  id: "t2",
  type: "function",
  function: { name: "read_url", arguments: "{\"url\":\"https://httpstat.us/404\"}" },
});
if (failedRead.ok) {
  throw new Error("failed URL read case should fail.");
}

const weakSearch = await executeToolCall({
  id: "t3",
  type: "function",
  function: { name: "web_search", arguments: "{\"query\":\"zzzzxxyyqqvv__edge_case_20260323\"}" },
});
if (typeof weakSearch.ok !== "boolean" || typeof weakSearch.output !== "string") {
  throw new Error("empty/weak search case did not return structured result.");
}
'

if ! grep -q "APIConnectionTimeoutError" src/agent/llm-client.ts; then
  echo "LLM timeout handling missing in llm-client.ts"
  exit 1
fi

if ! grep -q "request timed out" src/agent/llm-client.ts; then
  echo "LLM timeout user-facing message missing in llm-client.ts"
  exit 1
fi

echo "[smoke:block:6] Passed."
