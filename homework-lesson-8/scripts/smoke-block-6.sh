#!/usr/bin/env bash

set -euo pipefail

echo "[smoke:block:6] Running edge-case validation..."

node --import tsx -e '
import { langchainTools } from "./src/tools/langchain-tools.ts";
import { readUrl } from "./src/tools/read-url.ts";
import { webSearch } from "./src/tools/web-search.ts";
import { githubListDirectory } from "./src/tools/github-list-directory.ts";

const webSearchTool = langchainTools.find((tool) => tool.name === "web_search");
if (!webSearchTool) {
  throw new Error("web_search tool is missing.");
}

let invalidArgsFailed = false;
try {
  await webSearchTool.invoke({ query: "" });
} catch {
  invalidArgsFailed = true;
}
if (!invalidArgsFailed) {
  throw new Error("invalid LangChain tool args case should fail.");
}

let readFailed = false;
try {
  await readUrl({ url: "https://httpstat.us/404" });
} catch {
  readFailed = true;
}
if (!readFailed) {
  throw new Error("failed URL read case should fail.");
}

const weakSearch = await webSearch({ query: "zzzzxxyyqqvv__edge_case_20260323" });
if (typeof weakSearch !== "string" || weakSearch.length === 0) {
  throw new Error("weak search case did not return text output.");
}

const githubDir = await githubListDirectory({
  owner: "Darker-than-Black",
  repo: "MULTI-AGENT-SYSTEMS-HOMEWORKS",
  path: "homework-lesson-5",
  ref: "main",
});
if (!githubDir.includes("\"entries\"")) {
  throw new Error("github_list_directory should return entries payload.");
}
'

if [[ -e "src/agent/llm-client.ts" ]]; then
  echo "Legacy llm-client.ts should be removed."
  exit 1
fi

if [[ -e "src/agent/tool-dispatcher.ts" ]]; then
  echo "Legacy tool-dispatcher.ts should be removed."
  exit 1
fi

echo "[smoke:block:6] Passed."
