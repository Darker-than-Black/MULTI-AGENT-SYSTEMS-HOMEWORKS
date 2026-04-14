#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

node --input-type=module --import tsx -e '
import {
  GITHUB_MCP_RESOURCE_URI,
} from "./src/mcp/contracts.ts";
import { GITHUB_MCP_URL } from "./src/config/env.ts";
import {
  callMcpTextTool,
  connectMcpClient,
  readMcpJsonResource,
} from "./src/mcp/shared-client.ts";

const MCP_RESOURCE_TIMEOUT_MS = 15_000;

const client = await connectMcpClient({
  clientName: "github-mcp-smoke",
  serverLabel: "GitHubMCP",
  serverUrl: GITHUB_MCP_URL,
});

const tools = await client.listTools(undefined, { signal: AbortSignal.timeout(MCP_RESOURCE_TIMEOUT_MS) });
const resources = await client.listResources(undefined, { signal: AbortSignal.timeout(MCP_RESOURCE_TIMEOUT_MS) });
const toolNames = tools.tools.map((tool) => tool.name).sort();
const resourceUris = resources.resources.map((resource) => resource.uri).sort();

const expectedToolNames = ["github_get_file_content", "github_list_directory"];
const expectedResourceUri = GITHUB_MCP_RESOURCE_URI;

if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
  throw new Error(`GitHubMCP tool discovery mismatch: ${JSON.stringify(toolNames)}`);
}

if (!resourceUris.includes(expectedResourceUri)) {
  throw new Error(`GitHubMCP resources do not include ${expectedResourceUri}: ${JSON.stringify(resourceUris)}`);
}

const status = await readMcpJsonResource(client, GITHUB_MCP_RESOURCE_URI, "GitHubMCP");
if (!status.apiBaseUrl.includes("api.github.com")) {
  throw new Error(`Unexpected GitHub API base URL: ${status.apiBaseUrl}`);
}

const directoryListing = await callMcpTextTool(client, "github_list_directory", {
  owner: "openai",
  repo: "openai-node",
  path: "src",
}, "GitHubMCP");

if (!directoryListing.includes("\"entries\"")) {
  throw new Error("github_list_directory did not return entries.");
}

const fileContent = await callMcpTextTool(client, "github_get_file_content", {
  owner: "openai",
  repo: "openai-node",
  path: "package.json",
}, "GitHubMCP");

if (!fileContent.includes("\"content\"")) {
  throw new Error("github_get_file_content did not return file content.");
}

console.log(JSON.stringify({
  toolNames,
  resourceUris,
  status,
  directoryPreview: directoryListing.slice(0, 160),
  filePreview: fileContent.slice(0, 160),
}, null, 2));

await client.close();
'
