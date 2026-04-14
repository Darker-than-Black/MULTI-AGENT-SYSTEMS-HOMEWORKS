import { GITHUB_MCP_URL } from "../config/env";
import { type GitHubToolName } from "./contracts";
import { callMcpTextTool, connectMcpClient } from "./shared-client";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

let connectedClientPromise: Promise<Client> | null = null;

async function getGitHubMcpClient(): Promise<Client> {
  if (!connectedClientPromise) {
    connectedClientPromise = connectGitHubMcpClient().catch((error) => {
      connectedClientPromise = null;
      throw error;
    });
  }

  return connectedClientPromise;
}

export async function callGitHubMcpTool(
  name: GitHubToolName,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await getGitHubMcpClient();
  return callMcpTextTool(client, name, args, "GitHubMCP");
}

async function connectGitHubMcpClient(): Promise<Client> {
  const client = await connectMcpClient({
    clientName: "homework-lesson-9-github-client",
    serverLabel: "GitHubMCP",
    serverUrl: GITHUB_MCP_URL,
  });

  client.onerror = () => {
    connectedClientPromise = null;
  };

  return client;
}
