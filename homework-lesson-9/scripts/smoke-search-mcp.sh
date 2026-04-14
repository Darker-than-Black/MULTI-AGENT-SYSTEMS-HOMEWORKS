#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

node --input-type=module --import tsx -e '
import {
  SEARCH_MCP_RESOURCE_URI,
} from "./src/mcp/contracts.ts";
import { SEARCH_MCP_URL } from "./src/config/env.ts";
import {
  callMcpTextTool,
  connectMcpClient,
  listMcpResources,
  listMcpTools,
  readMcpJsonResource,
} from "./src/mcp/shared-client.ts";

const client = await connectMcpClient({
  clientName: "search-mcp-smoke",
  serverLabel: "SearchMCP",
  serverUrl: SEARCH_MCP_URL,
});

const tools = await listMcpTools(client);
const resources = await listMcpResources(client);
const toolNames = tools.tools.map((tool) => tool.name).sort();
const resourceUris = resources.resources.map((resource) => resource.uri).sort();

const expectedToolNames = ["knowledge_search", "read_url", "web_search"];
const expectedResourceUri = SEARCH_MCP_RESOURCE_URI;

if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
  throw new Error(`SearchMCP tool discovery mismatch: ${JSON.stringify(toolNames)}`);
}

if (!resourceUris.includes(expectedResourceUri)) {
  throw new Error(`SearchMCP resources do not include ${expectedResourceUri}: ${JSON.stringify(resourceUris)}`);
}

const stats = await readMcpJsonResource(client, SEARCH_MCP_RESOURCE_URI, "SearchMCP");
if (stats.documentCount < 1) {
  throw new Error(`knowledge-base-stats returned invalid documentCount: ${stats.documentCount}`);
}

const knowledgeResult = await callMcpTextTool(client, "knowledge_search", {
  query: "What is retrieval-augmented generation?",
}, "SearchMCP");

if (!knowledgeResult.trim()) {
  throw new Error("knowledge_search returned empty content.");
}

const webResult = await callMcpTextTool(client, "web_search", {
  query: "retrieval augmented generation overview",
}, "SearchMCP");

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

await client.close();
'
