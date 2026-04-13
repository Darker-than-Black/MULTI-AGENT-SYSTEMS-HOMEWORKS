import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { SEARCH_MCP_URL } from "../config/env";

type SearchToolName = "web_search" | "read_url" | "knowledge_search";

export interface KnowledgeBaseStats {
  collection: string;
  corpusPath: string;
  documentCount: number;
  updatedAt: string;
}

let connectedClientPromise: Promise<Client> | null = null;

export async function getSearchMcpClient(): Promise<Client> {
  if (!connectedClientPromise) {
    connectedClientPromise = connectSearchMcpClient();
  }

  return connectedClientPromise;
}

export async function listSearchMcpTools() {
  const client = await getSearchMcpClient();
  return client.listTools(undefined, { signal: AbortSignal.timeout(15_000) });
}

export async function listSearchMcpResources() {
  const client = await getSearchMcpClient();
  return client.listResources(undefined, { signal: AbortSignal.timeout(15_000) });
}

export async function callSearchMcpTool(
  name: SearchToolName,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await getSearchMcpClient();
  const result = await client.callTool(
    {
      name,
      arguments: args,
    },
    CallToolResultSchema,
    { signal: AbortSignal.timeout(30_000) },
  );

  if ("toolResult" in result) {
    return JSON.stringify(result.toolResult, null, 2);
  }

  if (result.isError) {
    throw new Error(extractTextContent(result.content) || `${name} failed through SearchMCP.`);
  }

  return extractTextContent(result.content);
}

export async function readKnowledgeBaseStatsResource(): Promise<KnowledgeBaseStats> {
  const client = await getSearchMcpClient();
  const result = await client.readResource(
    { uri: "resource://knowledge-base-stats" },
    { signal: AbortSignal.timeout(15_000) },
  );

  const text = extractResourceText(result.contents);
  return JSON.parse(text) as KnowledgeBaseStats;
}

async function connectSearchMcpClient(): Promise<Client> {
  const client = new Client({
    name: "homework-lesson-9-search-client",
    version: "1.0.0",
  });

  client.onerror = () => {
    connectedClientPromise = null;
  };

  const transport = new StreamableHTTPClientTransport(new URL(SEARCH_MCP_URL), {
    requestInit: {
      headers: {
        Accept: "application/json, text/event-stream",
      },
    },
  });

  try {
    await client.connect(transport, { signal: AbortSignal.timeout(15_000) });
    await client.listTools(undefined, { signal: AbortSignal.timeout(15_000) });
    await client.listResources(undefined, { signal: AbortSignal.timeout(15_000) });
    return client;
  } catch (error) {
    connectedClientPromise = null;
    await transport.close().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown MCP connection failure.";
    throw new Error(`Unable to connect to SearchMCP at ${SEARCH_MCP_URL}: ${message}`);
  }
}

function extractTextContent(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
): string {
  const text = content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0)
    .join("\n");

  if (!text) {
    throw new Error("SearchMCP returned no text content.");
  }

  return text;
}

function extractResourceText(
  contents: Array<{ text?: string; blob?: string; uri: string }>,
): string {
  const text = contents
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0)
    .join("\n");

  if (text) {
    return text;
  }

  const blob = contents.find((item) => typeof item.blob === "string")?.blob;
  if (blob) {
    return Buffer.from(blob, "base64").toString("utf8");
  }

  throw new Error("SearchMCP resource returned no readable text.");
}

export async function closeSearchMcpClient(): Promise<void> {
  if (!connectedClientPromise) {
    return;
  }

  const client = await connectedClientPromise.catch(() => null);
  connectedClientPromise = null;
  await client?.close().catch(() => undefined);
}
