#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:2] Running adapter smoke cases..."

node --import tsx -e '
import { adaptProviderAssistantMessage } from "./src/agent/llm-adapter.ts";

const finalAnswerCase = adaptProviderAssistantMessage({
  content: "RAG combines retrieval with generation.",
  tool_calls: [],
});

if (finalAnswerCase.assistantMessage.toolCalls?.length) {
  throw new Error("final-answer case should not include tool calls.");
}
if (!finalAnswerCase.assistantMessage.content.includes("RAG")) {
  throw new Error("final-answer case content normalization failed.");
}

const singleToolCallCase = adaptProviderAssistantMessage({
  content: "",
  tool_calls: [
    {
      id: "call_1",
      type: "function",
      function: {
        name: "web_search",
        arguments: "{\"query\":\"naive RAG\"}",
      },
    },
  ],
});

if ((singleToolCallCase.assistantMessage.toolCalls?.length || 0) !== 1) {
  throw new Error("single-tool-call case should contain exactly one tool call.");
}
if (singleToolCallCase.assistantMessage.toolCalls?.[0]?.function.name !== "web_search") {
  throw new Error("tool-call name normalization failed.");
}
'

echo "[smoke:block:2] Adapter smoke cases passed."

echo "[smoke:block:2] Running optional live API smoke..."
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  OUTPUT="$(node --import tsx -e 'import { requestLlmTurn } from "./src/agent/llm-client.ts"; const result = await requestLlmTurn({ messages: [{ role: "system", content: "You are a concise assistant." }, { role: "user", content: "Reply with one short sentence about RAG." }] }); console.log(JSON.stringify(result));' 2>&1)"
  if ! echo "$OUTPUT" | grep -q "\"assistantMessage\""; then
    echo "LLM client smoke failed: missing assistantMessage in live response."
    echo "$OUTPUT"
    exit 1
  fi
  echo "[smoke:block:2] Live API smoke passed."
else
  echo "[smoke:block:2] Skipped live API smoke: OPENAI_API_KEY is not set."
fi

echo "[smoke:block:2] Passed."
