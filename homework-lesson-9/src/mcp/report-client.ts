import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { REPORT_MCP_URL } from "../config/env";
import { callMcpTextTool, connectMcpClient } from "./shared-client";

let connectedClientPromise: Promise<Client> | null = null;

export async function saveReportViaMcp(
  args: { filename: string; content: string },
): Promise<string> {
  const client = await getReportMcpClient();
  return callMcpTextTool(client, "save_report", args, "ReportMCP");
}

async function getReportMcpClient(): Promise<Client> {
  if (!connectedClientPromise) {
    connectedClientPromise = connectReportMcpClient().catch((error) => {
      connectedClientPromise = null;
      throw error;
    });
  }

  return connectedClientPromise;
}

async function connectReportMcpClient(): Promise<Client> {
  const client = await connectMcpClient({
    clientName: "homework-lesson-9-report-client",
    serverLabel: "ReportMCP",
    serverUrl: REPORT_MCP_URL,
  });

  client.onerror = () => {
    connectedClientPromise = null;
  };

  return client;
}
