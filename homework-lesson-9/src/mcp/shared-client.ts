import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const MCP_CONNECT_TIMEOUT_MS = 15_000;
const MCP_RESOURCE_TIMEOUT_MS = 15_000;
const MCP_TOOL_TIMEOUT_MS = 30_000;

interface ConnectMcpClientOptions {
  clientName: string;
  serverLabel: string;
  serverUrl: string;
}

export async function connectMcpClient({
  clientName,
  serverLabel,
  serverUrl,
}: ConnectMcpClientOptions): Promise<Client> {
  const client = new Client({
    name: clientName,
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: {
        Accept: "application/json, text/event-stream",
      },
    },
  });

  try {
    await client.connect(transport, { signal: AbortSignal.timeout(MCP_CONNECT_TIMEOUT_MS) });
    await client.listTools(undefined, { signal: AbortSignal.timeout(MCP_CONNECT_TIMEOUT_MS) });
    await client.listResources(undefined, { signal: AbortSignal.timeout(MCP_CONNECT_TIMEOUT_MS) });
    return client;
  } catch (error) {
    await transport.close().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown MCP connection failure.";
    throw new Error(`Unable to connect to ${serverLabel} at ${serverUrl}: ${message}`);
  }
}

export async function listMcpTools(client: Client) {
  return client.listTools(undefined, { signal: AbortSignal.timeout(MCP_RESOURCE_TIMEOUT_MS) });
}

export async function listMcpResources(client: Client) {
  return client.listResources(undefined, { signal: AbortSignal.timeout(MCP_RESOURCE_TIMEOUT_MS) });
}

export async function callMcpTextTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  serverLabel: string,
): Promise<string> {
  const result = await client.callTool(
    {
      name: toolName,
      arguments: args,
    },
    CallToolResultSchema,
    { signal: AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS) },
  );

  if ("toolResult" in result) {
    return JSON.stringify(result.toolResult, null, 2);
  }

  if (result.isError) {
    throw new Error(extractTextContent(result.content) || `${toolName} failed through ${serverLabel}.`);
  }

  return extractTextContent(result.content);
}

export async function readMcpJsonResource<T>(
  client: Client,
  uri: string,
  serverLabel: string,
): Promise<T> {
  const result = await client.readResource(
    { uri },
    { signal: AbortSignal.timeout(MCP_RESOURCE_TIMEOUT_MS) },
  );

  const text = extractResourceText(result.contents);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
    throw new Error(`${serverLabel} resource ${uri} returned invalid JSON: ${message}`);
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
    throw new Error("MCP server returned no text content.");
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

  throw new Error("MCP resource returned no readable text.");
}
