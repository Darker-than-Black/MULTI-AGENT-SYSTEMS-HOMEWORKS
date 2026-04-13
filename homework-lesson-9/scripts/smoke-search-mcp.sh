#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

node --input-type=module --import tsx -e '
import {
  callSearchMcpTool,
  listSearchMcpResources,
  listSearchMcpTools,
  readKnowledgeBaseStatsResource,
} from "./src/mcp/search-client.ts";

const tools = await listSearchMcpTools();
const resources = await listSearchMcpResources();
const toolNames = tools.tools.map((tool) => tool.name).sort();
const resourceUris = resources.resources.map((resource) => resource.uri).sort();

const expectedToolNames = ["knowledge_search", "read_url", "web_search"];
const expectedResourceUri = "resource://knowledge-base-stats";

if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
  throw new Error(`SearchMCP tool discovery mismatch: ${JSON.stringify(toolNames)}`);
}

if (!resourceUris.includes(expectedResourceUri)) {
  throw new Error(`SearchMCP resources do not include ${expectedResourceUri}: ${JSON.stringify(resourceUris)}`);
}

const stats = await readKnowledgeBaseStatsResource();
if (stats.documentCount < 1) {
  throw new Error(`knowledge-base-stats returned invalid documentCount: ${stats.documentCount}`);
}

const knowledgeResult = await callSearchMcpTool("knowledge_search", {
  query: "What is retrieval-augmented generation?",
});

if (!knowledgeResult.trim()) {
  throw new Error("knowledge_search returned empty content.");
}

const webResult = await callSearchMcpTool("web_search", {
  query: "retrieval augmented generation overview",
});

if (!webResult.includes("http")) {
  throw new Error("web_search did not return any URLs.");
}

console.log(JSON.stringify({
  toolNames,
  resourceUris,
  stats,
  knowledgePreview: knowledgeResult.slice(0, 160),
  webPreview: webResult.slice(0, 160),
}, null, 2));
'
