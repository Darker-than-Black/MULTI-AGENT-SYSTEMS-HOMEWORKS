import { SEARCH_MCP_URL } from "../config/env";
import { type SearchToolName } from "./contracts";
import { callMcpTextTool, connectMcpClient } from "./shared-client";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

let connectedClientPromise: Promise<Client> | null = null;

async function getSearchMcpClient(): Promise<Client> {
  if (!connectedClientPromise) {
    connectedClientPromise = connectSearchMcpClient().catch((error) => {
      connectedClientPromise = null;
      throw error;
    });
  }

  return connectedClientPromise;
}

export async function callSearchMcpTool(
  name: SearchToolName,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await getSearchMcpClient();
  return callMcpTextTool(client, name, args, "SearchMCP");
}

async function connectSearchMcpClient(): Promise<Client> {
  const client = await connectMcpClient({
    clientName: "homework-lesson-9-search-client",
    serverLabel: "SearchMCP",
    serverUrl: SEARCH_MCP_URL,
  });

  client.onerror = () => {
    connectedClientPromise = null;
  };

  return client;
}
