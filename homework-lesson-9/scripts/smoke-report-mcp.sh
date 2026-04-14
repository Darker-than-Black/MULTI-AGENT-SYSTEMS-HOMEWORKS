#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

node --input-type=module --import tsx -e '
import { randomUUID } from "node:crypto";
import { REPORT_MCP_RESOURCE_URI } from "./src/mcp/contracts.ts";
import { REPORT_MCP_URL } from "./src/config/env.ts";
import {
  callMcpTextTool,
  connectMcpClient,
  readMcpJsonResource,
} from "./src/mcp/shared-client.ts";

const client = await connectMcpClient({
  clientName: "report-mcp-smoke",
  serverLabel: "ReportMCP",
  serverUrl: REPORT_MCP_URL,
});

const tools = await client.listTools(undefined, { signal: AbortSignal.timeout(15_000) });
const resources = await client.listResources(undefined, { signal: AbortSignal.timeout(15_000) });
const toolNames = tools.tools.map((tool) => tool.name).sort();
const resourceUris = resources.resources.map((resource) => resource.uri).sort();

const expectedToolNames = ["save_report"];
const expectedResourceUri = REPORT_MCP_RESOURCE_URI;

if (JSON.stringify(toolNames) !== JSON.stringify(expectedToolNames)) {
  throw new Error(`ReportMCP tool discovery mismatch: ${JSON.stringify(toolNames)}`);
}

if (!resourceUris.includes(expectedResourceUri)) {
  throw new Error(`ReportMCP resources do not include ${expectedResourceUri}: ${JSON.stringify(resourceUris)}`);
}

const before = await readMcpJsonResource(client, REPORT_MCP_RESOURCE_URI, "ReportMCP");
const filename = `report-mcp-smoke-${randomUUID()}.md`;
const saveResult = await callMcpTextTool(client, "save_report", {
  filename,
  content: "# Report MCP Smoke\n\nSaved through ReportMCP.",
}, "ReportMCP");

if (!saveResult.includes(filename)) {
  throw new Error(`save_report returned unexpected output: ${saveResult}`);
}

const after = await readMcpJsonResource(client, REPORT_MCP_RESOURCE_URI, "ReportMCP");
if (!after.savedReports.includes(filename)) {
  throw new Error(`resource://output-dir did not include ${filename}`);
}

console.log(JSON.stringify({
  toolNames,
  resourceUris,
  beforeCount: before.reportCount,
  afterCount: after.reportCount,
  savedResult: saveResult,
}, null, 2));

await client.close();
'
